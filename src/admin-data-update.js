import { createClient } from "@supabase/supabase-js";
import { BrevoClient } from "@getbrevo/brevo";
import jwt from "jsonwebtoken";
import ws from "ws";
import { getForgotPasswordTemplate } from "./forgot-password-template.js";

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWT_SECRET = process.env.JWT_SECRET;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    realtime: { transport: ws }
});

function formatPlatformName(signature) {
    if (!signature || typeof signature !== "string") return "Admin";
    const cleanStr = signature.trim();
    return cleanStr.charAt(0).toUpperCase() + cleanStr.slice(1);
}

async function sendAdminNotificationEmail({ userEmail, otpCode, signature }) {
    const { data: adminRecord, error } = await supabase
        .from("admin")
        .select("api, domain_email, contact_email")
        .eq("signature", signature)
        .maybeSingle();

    if (error || !adminRecord) {
        throw new Error(error ? error.message : `Failed to fetch email settings for signature: "${signature}"`);
    }

    if (!adminRecord.api?.trim()) {
        throw new Error("Missing Brevo API key in admin configuration.");
    }

    const senderEmail = (adminRecord.domain_email || adminRecord.contact_email)?.trim();
    if (!senderEmail) {
        throw new Error("Neither domain_email nor contact_email is configured in admin table.");
    }

    const platformName = formatPlatformName(signature);
    const brevo = new BrevoClient({ apiKey: adminRecord.api.trim() });
    const displayName = "Administrator";

    const templateResult = getForgotPasswordTemplate({
        displayName,
        otpCode,
        platformName
    });

    return await brevo.transactionalEmails.sendTransacEmail({
        sender: { name: platformName, email: senderEmail },
        to: [{ email: userEmail }],
        subject: `Your ${platformName} admin security pin: ${otpCode}`,
        htmlContent: templateResult.htmlContent
    });
}

export default async function handler(req, res) {
    const requestOrigin = req.headers.origin;
    if (requestOrigin) {
        res.setHeader("Access-Control-Allow-Origin", requestOrigin);
    }

    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept, X-Action, X-Action-Phase, X-Transaction-Pin, X-User-UUID, X-Setting-Target, x-setting-target");
    res.setHeader("Access-Control-Allow-Credentials", "true");

    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({ success: false, error: "Administrative security clearance token missing or malformed." });
        }

        const token = authHeader.split(" ")[1];
        jwt.verify(token, JWT_SECRET);

        // ==========================================
        // METHOD: GET (RETRIEVE ADMIN SETTINGS DATA)
        // ==========================================
        if (req.method === "GET") {
            const signature = req.query.signature || req.headers["x-setting-target"];

            if (!signature) {
                return res.status(400).json({ success: false, error: "Required workspace signature context missing." });
            }

            const { data: admin, error: dbError } = await supabase
                .from("admin")
                .select("id, email, address, password, signature")
                .eq("signature", signature)
                .maybeSingle();

            if (dbError || !admin) {
                return res.status(404).json({ success: false, error: dbError?.message || "Admin settings record not found." });
            }

            return res.status(200).json({
                success: true,
                admin
            });
        }

        // ==========================================
        // METHOD: POST (OTP ACTIONS AND PROFILE UPDATE)
        // ==========================================
        if (req.method === "POST") {
            const { action, signature, email, otp, address, password } = req.body;

            if (!signature) {
                return res.status(400).json({ success: false, error: "Admin signature is required." });
            }

            // ACTION 1: DISPATCH ADMIN OTP
            if (action === "send_otp") {
                if (!email) {
                    return res.status(400).json({ success: false, error: "Email address is required." });
                }

                const generatedOtp = Math.floor(100000 + Math.random() * 900000);

                const { error: updateErr } = await supabase
                    .from("admin")
                    .update({ otp: generatedOtp })
                    .eq("signature", signature);

                if (updateErr) {
                    return res.status(500).json({ success: false, error: "Failed to store security code in database." });
                }

                try {
                    await sendAdminNotificationEmail({
                        userEmail: email.trim(),
                        otpCode: generatedOtp,
                        signature: signature
                    });
                } catch (mailErr) {
                    console.error("🔴 [ADMIN MAIL ERROR]:", mailErr);
                    return res.status(500).json({ success: false, error: `Mail delivery failed: ${mailErr.message || mailErr}` });
                }

                return res.status(200).json({
                    success: true,
                    message: "Verification email sent successfully."
                });
            }

            // ACTION 2: VERIFY ADMIN OTP
            if (action === "verify_otp") {
                if (!otp) {
                    return res.status(400).json({ success: false, error: "Security code is required." });
                }

                const { data: admin, error: adminErr } = await supabase
                    .from("admin")
                    .select("id, otp")
                    .eq("signature", signature)
                    .maybeSingle();

                if (adminErr || !admin || admin.otp === null || admin.otp === undefined) {
                    return res.status(400).json({ success: false, error: "Invalid or expired security code." });
                }

                if (Number(admin.otp) !== Number(otp)) {
                    return res.status(400).json({ success: false, error: "Incorrect security code." });
                }

                return res.status(200).json({ success: true, message: "Security code verified." });
            }

            // ACTION 3: UPDATE ADMIN PROFILE
            const { data: updatedAdmin, error: updateError } = await supabase
                .from("admin")
                .update({
                    email,
                    address,
                    password,
                    otp: null
                })
                .eq("signature", signature)
                .select()
                .single();

            if (updateError) throw updateError;

            return res.status(200).json({
                success: true,
                admin: updatedAdmin
            });
        }

        return res.status(405).json({ success: false, error: "HTTP Target Action context block rejected." });

    } catch (error) {
        console.error("❌ Admin Data Update Core Operation Exception:", error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
}