import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";
import { BrevoClient } from "@getbrevo/brevo";
import ws from "ws";
import { getAdminChatEmailTemplates } from "./admin-chat-template.js";

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWT_SECRET = process.env.JWT_SECRET;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !JWT_SECRET) {
    throw new Error("CRITICAL SYSTEM CONFIGURATION FAULT: Environment matrix variables missing.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: ws }
});

function applyCors(req, res) {
    const origin = req.headers.origin;
    if (origin) {
        res.setHeader("Access-Control-Allow-Origin", origin);
    } else {
        res.setHeader("Access-Control-Allow-Origin", "*");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept, X-Action, X-Action-Phase, X-Transaction-Pin, X-User-UUID, X-Setting-Target, x-setting-target, x-signature, X-Signature");
    res.setHeader("Access-Control-Allow-Credentials", "true");

    if (req.method === "OPTIONS") {
        res.status(200).end();
        return true;
    }
    return false;
}

function formatPlatformName(signature) {
    if (!signature || typeof signature !== "string") return "Platform";
    const cleanStr = signature.trim();
    return cleanStr.charAt(0).toUpperCase() + cleanStr.slice(1);
}

// Fetch Brevo API key, domain email, and admin Gmail from admin using signature
async function getAdminEmailConfig(signature) {
    let query = supabase.from("admin").select("api, domain_email, contact_email, email, signature");

    if (signature) {
        query = query.eq("signature", signature);
    }

    const { data: adminRecord, error } = await query.maybeSingle();

    if (error || !adminRecord) {
        const { data: fallbackRecord } = await supabase
            .from("admin")
            .select("api, domain_email, contact_email, email, signature")
            .limit(1)
            .maybeSingle();

        if (!fallbackRecord) {
            throw new Error(`Email settings not found in admin.`);
        }
        return {
            apiKey: fallbackRecord.api ? fallbackRecord.api.trim() : null,
            domainEmail: (fallbackRecord.domain_email || fallbackRecord.contact_email) ? (fallbackRecord.domain_email || fallbackRecord.contact_email).trim() : null,
            adminGmail: fallbackRecord.email ? fallbackRecord.email.trim() : null,
            signature: fallbackRecord.signature ? fallbackRecord.signature.trim() : null
        };
    }

    return {
        apiKey: adminRecord.api ? adminRecord.api.trim() : null,
        domainEmail: (adminRecord.domain_email || adminRecord.contact_email) ? (adminRecord.domain_email || adminRecord.contact_email).trim() : null,
        adminGmail: adminRecord.email ? adminRecord.email.trim() : null,
        signature: adminRecord.signature ? adminRecord.signature.trim() : null
    };
}

// Helper to upload base64 images directly to the 'assets' Supabase bucket (matching mail.js)
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

    const fileName = `chat_attachments/${userId}_${Date.now()}.${extension}`;

    const { error } = await supabase.storage
        .from("assets")
        .upload(fileName, buffer, {
            contentType: mimeType,
            upsert: true
        });

    if (error) {
        console.error("⚠️ Supabase Chat Image Upload Error:", JSON.stringify(error, null, 2));
        return null;
    }

    const { data: publicUrlData } = supabase.storage
        .from("assets")
        .getPublicUrl(fileName);

    return publicUrlData?.publicUrl || null;
}

export default async function handler(req, res) {
    if (applyCors(req, res)) return;

    const authHeader = req.headers.authorization || req.headers.Authorization || "";
    if (!authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ success: false, error: "Unauthorized access credentials missing." });
    }

    const token = authHeader.split(" ")[1];
    let decoded = null;

    try {
        decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtErr) {
        console.error("❌ TOKEN VERIFICATION CRASH:", jwtErr.message);
        return res.status(401).json({
            success: false,
            error: "Your user login session has expired or token signature is corrupt."
        });
    }

    try {
        const isAdmin = Boolean(
            decoded.adminId ||
            decoded.admin_id ||
            decoded.role === "admin" ||
            decoded.isAdmin ||
            req.body?.sender_role === "admin"
        );

        const targetUserUuid = req.body?.user_uuid || req.query?.uuid || (isAdmin ? null : (decoded.uuid || decoded.id));

        // ======================================
        // UPLOAD CHAT IMAGE ENDPOINT (/upload)
        // ======================================
        if (req.method === "POST" && (req.url?.includes("/upload") || req.path?.includes("/upload") || req.body?.image_data)) {
            const { image_data, user_uuid } = req.body;
            const targetUuid = user_uuid || targetUserUuid;

            if (!image_data || !targetUuid) {
                return res.status(400).json({ success: false, error: "Missing image data or user identification." });
            }

            const imageUrl = await uploadBase64ToSupabase(image_data, targetUuid);
            if (!imageUrl) {
                return res.status(500).json({ success: false, error: "Failed to upload image to storage bucket." });
            }

            return res.status(200).json({ success: true, imageUrl });
        }

        // ======================================
        // FETCH CHAT STREAM WITH PAGINATION (GET)
        // ======================================
        if (req.method === "GET") {
            const fetchUuid = req.query.uuid || targetUserUuid;
            if (!fetchUuid) {
                return res.status(400).json({ success: false, error: "Missing user identification parameters." });
            }

            const page = parseInt(req.query.page, 10) || 1;
            const limit = parseInt(req.query.limit, 10) || 20;

            const fromRangeOffset = (page - 1) * limit;
            const toRangeOffset = fromRangeOffset + limit - 1;

            if (isAdmin) {
                await supabase
                    .from("admin_chats")
                    .update({ is_read: true })
                    .eq("user_uuid", fetchUuid)
                    .eq("sender_role", "user");
            }

            const { data, error } = await supabase
                .from("admin_chats")
                .select("*")
                .eq("user_uuid", fetchUuid)
                .order("created_at", { ascending: false })
                .range(fromRangeOffset, toRangeOffset);

            if (error) throw error;

            const chronologicalOrderedChats = (data || []).reverse();

            return res.status(200).json({
                success: true,
                chats: chronologicalOrderedChats,
                hasMore: (data || []).length === limit
            });
        }


        // ======================================
        // SEND CHAT MESSAGE WITH BREVO EMAIL ALERT (POST)
        // ======================================
        if (req.method === "POST") {
            const { message_body, attachment_url, user_uuid, sender_role, user_email, recipient_email, email } = req.body;
            const activeClientTargetUuid = user_uuid || targetUserUuid;

            if (!activeClientTargetUuid) {
                return res.status(400).json({ success: false, error: "Missing user identification parameters." });
            }

            if (!message_body && !attachment_url) {
                return res.status(400).json({ success: false, error: "Message payload empty." });
            }

            const finalSenderRole = (isAdmin || sender_role === "admin") ? "admin" : "user";

            const { data: chatMessageNode, error: chatError } = await supabase
                .from("admin_chats")
                .insert({
                    user_uuid: activeClientTargetUuid,
                    sender_role: finalSenderRole,
                    message_body: message_body || null,
                    attachment_url: attachment_url || null,
                    is_read: false
                })
                .select()
                .single();

            if (chatError) throw chatError;

            // Single Execution for Brevo Email Notification
            try {
                let userProfile = null;
                const clientSuppliedEmail = user_email || recipient_email || email;

                let query = supabase
                    .from("users")
                    .select("id, uuid, email, full_name, username, signature");

                if (!isNaN(parseInt(activeClientTargetUuid, 10))) {
                    query = query.or(`uuid.eq.${activeClientTargetUuid},id.eq.${activeClientTargetUuid}`);
                } else if (activeClientTargetUuid) {
                    query = query.or(`uuid.eq.${activeClientTargetUuid}`);
                }

                if (clientSuppliedEmail && !activeClientTargetUuid) {
                    query = query.eq("email", clientSuppliedEmail);
                }

                const { data: matchedProfile } = await query.maybeSingle();
                userProfile = matchedProfile;

                // Fallback to JWT data if user profile is not found in database
                if (!userProfile) {
                    userProfile = {
                        id: decoded?.id || null,
                        uuid: activeClientTargetUuid || decoded?.uuid || null,
                        email: clientSuppliedEmail || decoded?.email || null,
                        full_name: decoded?.full_name || decoded?.name || "",
                        username: decoded?.username || "",
                        signature: decoded?.signature || null
                    };
                }

                const reqSignature = req.headers["x-signature"] || req.headers["X-Signature"] || decoded?.signature;
                const userSignature = userProfile?.signature || reqSignature;

                const emailConfig = await getAdminEmailConfig(userSignature);

                if (emailConfig.apiKey && emailConfig.domainEmail) {
                    const resolvedSignature = emailConfig.signature || userSignature;
                    const dynamicPlatformName = formatPlatformName(resolvedSignature);

                    const { subject, plainTextBody, htmlEmailTemplate } = getAdminChatEmailTemplates({
                        finalSenderRole,
                        dynamicPlatformName,
                        userProfile,
                        clientSuppliedEmail,
                        message_body
                    });

                    let emailRecipientTarget = "";

                    if (finalSenderRole === "admin") {
                        const resolvedTargetEmail = userProfile?.email || clientSuppliedEmail;
                        emailRecipientTarget = resolvedTargetEmail ? resolvedTargetEmail.trim() : "";
                    } else {
                        emailRecipientTarget = emailConfig.adminGmail ? emailConfig.adminGmail.trim() : "";
                    }

                    if (emailRecipientTarget && emailRecipientTarget.includes("@")) {
                        const brevo = new BrevoClient({ apiKey: emailConfig.apiKey });

                        await brevo.transactionalEmails.sendTransacEmail({
                            sender: { name: `${dynamicPlatformName} Support`, email: emailConfig.domainEmail },
                            to: [{ email: emailRecipientTarget }],
                            subject: subject,
                            textContent: plainTextBody,
                            htmlContent: htmlEmailTemplate
                        });

                        console.log(`📨 [Brevo] Chat alert email successfully dispatched to ${emailRecipientTarget}`);
                    } else {
                        console.warn(`⚠️ [Brevo] Aborted: Recipient target email missing or invalid.`);
                    }
                } else {
                    console.warn("⚠️ [Brevo] Chat email aborted: Incomplete Brevo configuration in admin.");
                }
            } catch (bgError) {
                console.error("❌ [Brevo] Chat email dispatch failure:", bgError.response?.body || bgError.message || bgError);
            }

            return res.status(200).json({ success: true, message: chatMessageNode });
        }



        // ======================================
        // UPDATE MESSAGE (PUT)
        // ======================================
        if (req.method === "PUT") {
            const { message_id, message_body } = req.body;

            if (!message_id || !message_body) {
                return res.status(400).json({ success: false, error: "Missing required update body parameters." });
            }

            const { data: updatedMsg, error: updateErr } = await supabase
                .from("admin_chats")
                .update({ message_body: message_body })
                .eq("id", message_id)
                .select()
                .single();

            if (updateErr) throw updateErr;

            return res.status(200).json({ success: true, message: updatedMsg });
        }

        // ======================================
        // DELETE CHAT(S) (DELETE)
        // ======================================
        if (req.method === "DELETE") {
            const { message_id, purge_all, user_uuid } = req.query;

            if (purge_all === "true" || purge_all === true) {
                const targetUuid = user_uuid || targetUserUuid;
                if (!targetUuid) {
                    return res.status(400).json({ success: false, error: "Target user UUID required for full chat purge." });
                }

                const { error: purgeError } = await supabase
                    .from("admin_chats")
                    .delete()
                    .eq("user_uuid", targetUuid);

                if (purgeError) throw purgeError;

                return res.status(200).json({ success: true, message: "All chat records cleared for this user." });
            }

            if (!message_id) {
                return res.status(400).json({ success: false, error: "Missing message_id parameter." });
            }

            const { error: deleteError } = await supabase
                .from("admin_chats")
                .delete()
                .eq("id", message_id);

            if (deleteError) throw deleteError;

            return res.status(200).json({ success: true, message: "Chat entry removed successfully." });
        }

        return res.status(405).json({ success: false, error: "Method not allowed." });

    } catch (err) {
        console.error("ADMIN CHAT API FAILURE:", err);
        return res.status(500).json({ success: false, error: err.message || "Internal server fault." });
    }
}