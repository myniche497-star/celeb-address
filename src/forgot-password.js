import { createClient } from "@supabase/supabase-js";
import { BrevoClient } from "@getbrevo/brevo";
import ws from "ws";
import { getForgotPasswordTemplate } from "./forgot-password-template.js";

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("CRITICAL SYSTEM CONFIGURATION FAULT: Required environment variables (PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) are missing.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    realtime: { transport: ws }
});

function formatPlatformName(signature) {
    if (!signature || typeof signature !== "string" || !signature.trim()) {
        throw new Error("CRITICAL FAULT: Signature parameter is required and must be a non-empty string.");
    }
    const cleanStr = signature.trim();
    return cleanStr.charAt(0).toUpperCase() + cleanStr.slice(1);
}

// Fetch Brevo credentials dynamically from the admin database table
async function getAdminEmailConfig(signature) {
    if (!signature) {
        throw new Error("Signature parameter is required to fetch email configuration.");
    }

    const { data: adminRecord, error } = await supabase
        .from("admin")
        .select("api, domain_email, contact_email, email")
        .eq("signature", signature)
        .maybeSingle();

    if (error || !adminRecord) {
        throw new Error(error ? error.message : `Failed to fetch email settings from admin for signature: "${signature}"`);
    }

    if (!adminRecord.api?.trim()) {
        throw new Error("Missing Brevo API key in admin configuration.");
    }

    const senderEmail = (adminRecord.domain_email || adminRecord.contact_email)?.trim();

    if (!senderEmail) {
        throw new Error("Neither domain_email nor contact_email is configured in admin table.");
    }

    return {
        apiKey: adminRecord.api.trim(),
        senderEmail: senderEmail,
        contactEmail: adminRecord.contact_email ? adminRecord.contact_email.trim() : null,
        adminEmail: adminRecord.email ? adminRecord.email.trim() : null
    };
}

// Sends OTP email using Brevo
async function sendNotificationEmail({ userEmail, userName, otpCode, signature }) {
    const { apiKey, senderEmail } = await getAdminEmailConfig(signature);
    const platformName = formatPlatformName(signature);

    const brevo = new BrevoClient({ apiKey });
    const displayName = userName || "Customer";
    const subjectText = `Your ${platformName} access pin: ${otpCode}`;

    const templateResult = getForgotPasswordTemplate({
        displayName,
        otpCode,
        platformName
    });

    const emailSubject = templateResult?.subject || subjectText;
    const emailHtml = templateResult?.htmlContent || templateResult?.html || `<p>Your code is <b>${otpCode}</b></p>`;

    console.log(`🚀 Dispatching Brevo email from ${senderEmail} to ${userEmail}...`);

    const data = await brevo.transactionalEmails.sendTransacEmail({
        sender: { name: platformName, email: senderEmail },
        to: [{ email: userEmail }],
        subject: emailSubject,
        htmlContent: emailHtml
    });

    console.log("🟢 Email delivered successfully via Brevo ID:", data?.messageId || data);
    return data;
}

export default async function forgotPasswordHandler(req, res) {
    const requestOrigin = req.headers.origin;
    if (requestOrigin) res.setHeader("Access-Control-Allow-Origin", requestOrigin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") return res.status(200).end();

    try {
        const { action, email, otp, newPassword, signature, domain_email, api } = req.body;

        if (!signature) {
            return res.status(400).json({ success: false, error: "Signature parameter is required." });
        }

        // =============================================================
        // SECTION 1: SETTINGS PAGE / ADMIN MANAGEMENT
        // =============================================================

        if (action === "get_email_settings") {
            const { data: adminRecord, error } = await supabase
                .from("admin")
                .select("domain_email, contact_email, api, email")
                .eq("signature", signature)
                .maybeSingle();

            if (error || !adminRecord) {
                return res.status(404).json({ success: false, error: error ? error.message : `No settings found for signature '${signature}'.` });
            }

            return res.status(200).json({
                success: true,
                settings: adminRecord
            });
        }

        if (action === "update_email_settings") {
            if (!domain_email || !api) {
                return res.status(400).json({ success: false, error: "Both domain_email and Brevo API key are required." });
            }

            const { error: updateErr } = await supabase
                .from("admin")
                .update({
                    domain_email: domain_email.trim(),
                    api: api.trim()
                })
                .eq("signature", signature);

            if (updateErr) {
                return res.status(500).json({ success: false, error: `Failed to save email settings: ${updateErr.message}` });
            }

            return res.status(200).json({
                success: true,
                message: "Email settings updated successfully."
            });
        }

        // =============================================================
        // SECTION 2: LOGIN / SETTINGS OTP PASSWORD FLOWS
        // =============================================================

        if (!email) {
            return res.status(400).json({ success: false, error: "Email address is required." });
        }

        const cleanEmail = String(email).replace(/["']/g, "").trim().toLowerCase();

        // Send OTP Email
        if (action === "send_otp") {
            const { data: user, error: userErr } = await supabase
                .from("users")
                .select("id, email, fullname")
                .ilike("email", cleanEmail)
                .eq("signature", signature)
                .maybeSingle();

            if (userErr || !user) {
                return res.status(404).json({ success: false, error: "No account found with this email address." });
            }

            const generatedOtp = Math.floor(100000 + Math.random() * 900000);

            const { error: updateErr } = await supabase
                .from("users")
                .update({ otp: generatedOtp })
                .eq("id", user.id);

            if (updateErr) {
                return res.status(500).json({ success: false, error: "Failed to store security code in database." });
            }

            try {
                await sendNotificationEmail({
                    userEmail: user.email.trim(),
                    userName: user.full_name || user.username || "Customer",
                    otpCode: generatedOtp,
                    signature: signature
                });
            } catch (mailErr) {
                console.error("🔴 [MAIL DISPATCH ERROR]:", mailErr);
                return res.status(500).json({ success: false, error: `Mail delivery failed: ${mailErr.message || mailErr}` });
            }

            return res.status(200).json({
                success: true,
                message: "Verification email sent successfully."
            });
        }

        // Verify OTP Code
        if (action === "verify_otp") {
            if (!otp) {
                return res.status(400).json({ success: false, error: "Security code is required." });
            }

            const { data: user, error: userErr } = await supabase
                .from("users")
                .select("id, otp")
                .ilike("email", cleanEmail)
                .eq("signature", signature)
                .maybeSingle();

            if (userErr || !user || user.otp === null || user.otp === undefined) {
                return res.status(400).json({ success: false, error: "Invalid or expired security code." });
            }

            if (Number(user.otp) !== Number(otp)) {
                return res.status(400).json({ success: false, error: "Incorrect security code." });
            }

            return res.status(200).json({
                success: true,
                message: "Security code verified."
            });
        }

        // Reset User Password
        if (action === "reset_password") {
            if (!otp || !newPassword) {
                return res.status(400).json({ success: false, error: "OTP and new password are required." });
            }

            const { data: user, error: userErr } = await supabase
                .from("users")
                .select("id, otp")
                .ilike("email", cleanEmail)
                .eq("signature", signature)
                .maybeSingle();

            if (userErr || !user || user.otp === null || user.otp === undefined) {
                return res.status(400).json({ success: false, error: "Invalid or expired security code." });
            }

            if (Number(user.otp) !== Number(otp)) {
                return res.status(400).json({ success: false, error: "Incorrect security code." });
            }

            const { error: resetErr } = await supabase
                .from("users")
                .update({
                    password: newPassword,
                    otp: null
                })
                .eq("id", user.id);

            if (resetErr) {
                return res.status(500).json({ success: false, error: "Failed to update password." });
            }

            return res.status(200).json({
                success: true,
                message: "Password updated successfully."
            });
        }

        return res.status(400).json({ success: false, error: "Invalid action specified." });

    } catch (err) {
        return res.status(500).json({ success: false, error: err.message || "Internal server error." });
    }
}