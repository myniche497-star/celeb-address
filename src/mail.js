import { createClient } from "@supabase/supabase-js";
import { BrevoClient } from "@getbrevo/brevo";
import jwt from "jsonwebtoken";
import ws from "ws";
import { generateCustomerCareTemplate } from "./mail-template.js";

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWT_SECRET = process.env.JWT_SECRET;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    realtime: { transport: ws }
});

function formatPlatformName(signature) {
    if (!signature || typeof signature !== "string") return "";
    const cleanStr = signature.trim();
    return cleanStr.charAt(0).toUpperCase() + cleanStr.slice(1);
}

async function getAdminEmailConfig(signature) {
    const { data: adminRecord, error } = await supabase
        .from("admin")
        .select("api, domain_email, contact_email, email")
        .eq("signature", signature)
        .maybeSingle();

    if (error || !adminRecord) {
        throw new Error(error ? error.message : `Failed to fetch email settings for signature: "${signature}"`);
    }

    if (!adminRecord.api?.trim()) {
        throw new Error("Missing Brevo API key in admin configuration.");
    }

    const senderEmail = (adminRecord.domain_email || adminRecord.contact_email || adminRecord.email)?.trim();
    if (!senderEmail) {
        throw new Error("No domain_email, contact_email, or email configured in admin record.");
    }

    const contactEmail = (adminRecord.contact_email || adminRecord.email || senderEmail).trim();

    return {
        apiKey: adminRecord.api.trim(),
        senderEmail: senderEmail,
        contactEmail: contactEmail
    };
}

async function uploadBase64ToSupabase(base64DataString, userId) {
    if (!base64DataString) return null;

    if (!base64DataString.startsWith("data:image/")) {
        return base64DataString;
    }

    const matches = base64DataString.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!matches) {
        console.error("⚠️ Invalid Base64 image format provided.");
        return null;
    }

    const mimeType = matches[1];
    const base64Data = matches[2];
    const extension = mimeType.split("/")[1] || "png";
    const buffer = Buffer.from(base64Data, "base64");

    const fileName = `mail_attachments/${userId}_${Date.now()}.${extension}`;

    const { error } = await supabase.storage
        .from("assets")
        .upload(fileName, buffer, {
            contentType: mimeType,
            upsert: true
        });

    if (error) {
        console.error("⚠️ Supabase Image Upload Error:", JSON.stringify(error, null, 2));
        return null;
    }

    const { data: publicUrlData } = supabase.storage
        .from("assets")
        .getPublicUrl(fileName);

    return publicUrlData?.publicUrl || null;
}

export default async function customerCareMailHandler(req, res) {
    const requestOrigin = req.headers.origin;
    if (requestOrigin) res.setHeader("Access-Control-Allow-Origin", requestOrigin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-setting-target");
    res.setHeader("Access-Control-Allow-Credentials", "true");

    if (req.method === "OPTIONS") return res.status(200).end();

    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({ success: false, error: "Unauthorized access token." });
        }

        const token = authHeader.split(" ")[1];
        const decodedToken = jwt.verify(token, JWT_SECRET);

        const userId = req.params.id || req.query.id || req.body.id;
        const { recipientEmail, recipientName, supportMessage, subject, adminImage, imageUrl } = req.body;

        if (!userId || !recipientEmail || !supportMessage) {
            return res.status(400).json({ success: false, error: "Missing required fields: user ID, recipient email, or message." });
        }

        const signature = decodedToken.signature || req.headers["x-setting-target"];

        const { data: userData, error: dbError } = await supabase
            .from("users")
            .select("*")
            .eq("id", userId)
            .single();

        if (dbError || !userData) {
            throw new Error(dbError ? dbError.message : "User record not found.");
        }

        const rawImageData = (adminImage || imageUrl || "").trim();
        let finalImageUrl = null;

        if (rawImageData) {
            finalImageUrl = await uploadBase64ToSupabase(rawImageData, userId);
        }

        const { apiKey, senderEmail, contactEmail } = await getAdminEmailConfig(signature);
        const platformName = formatPlatformName(signature);

        let mailingId = userData.mailing_id;
        if (!mailingId) {
            const randomCode = Math.floor(100000 + Math.random() * 900000);
            mailingId = `USR-${randomCode}`;
            await supabase.from("users").update({ mailing_id: mailingId }).eq("id", userId);
        }

        const cleanedUserData = {
            ...userData,
            user_image: finalImageUrl,
            image: finalImageUrl,
            img: finalImageUrl
        };

        const htmlTemplate = generateCustomerCareTemplate(cleanedUserData, {
            recipientEmail,
            recipientName: recipientName || userData.full_name || userData.username,
            supportMessage,
            mailingId,
            platformName
        });

        const emailSubject = subject || `[Ref: ${mailingId}] Support Notification`;

        // Dynamically extract domain strictly from the active sender email configuration
        const emailDomain = senderEmail.split("@")[1];
        const messageHeaderId = `<${mailingId}@${emailDomain}>`;

        const emailPayload = {
            sender: { name: platformName, email: senderEmail },
            to: [{ email: recipientEmail.trim(), name: recipientName || userData.full_name || "Valued Customer" }],
            replyTo: { email: contactEmail, name: `${platformName} Support` },
            subject: emailSubject,
            htmlContent: htmlTemplate,
            headers: {
                "In-Reply-To": messageHeaderId,
                "References": messageHeaderId,
                "X-Mailing-ID": mailingId
            }
        };

        if (rawImageData) {
            if (rawImageData.startsWith("data:image/")) {
                emailPayload.attachment = [
                    {
                        name: `attachment_${Date.now()}.png`,
                        content: rawImageData.replace(/^data:image\/\w+;base64,/, "")
                    }
                ];
            } else if (rawImageData.startsWith("http://") || rawImageData.startsWith("https://")) {
                emailPayload.attachment = [
                    {
                        name: `attachment_${Date.now()}.png`,
                        url: rawImageData
                    }
                ];
            }
        }

        const brevo = new BrevoClient({ apiKey });
        await brevo.transactionalEmails.sendTransacEmail(emailPayload);

        return res.status(200).json({
            success: true,
            mailing_id: mailingId,
            message: "Support message sent successfully.",
            imageUrl: finalImageUrl
        });

    } catch (error) {
        console.error("❌ Support Mail Dispatch Error:", error.message);
        return res.status(500).json({
            success: false,
            error: error.message || "Failed to process and send support email.",
            details: error.response?.body || error.response?.data || error.body || undefined
        });
    }
}