export function getAdminChatEmailTemplates({
    finalSenderRole,
    dynamicPlatformName,
    userProfile,
    clientSuppliedEmail,
    message_body,
    attachment_url // 1. Accept attachment_url parameter
}) {
    if (finalSenderRole === "admin") {
        const recipientName = userProfile?.full_name?.split(" ")[0] || userProfile?.username || "there";
        const emailSubject = `Response to your inquiry - ${dynamicPlatformName}`;

        const plainTextBody = `Hi ${recipientName},\n\nOur support team responded to your ongoing inquiry.\n\nPlease access your dashboard to read the complete message and submit a reply.\n\nBest regards,\n${dynamicPlatformName} Support Team`;

        const htmlEmailTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light">
    <title>Support Response</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; -webkit-font-smoothing: antialiased;">
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed; background-color: #f8fafc;">
        <tr>
            <td align="center" style="padding: 30px 12px;">
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 560px; background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden;">
                    <tr>
                        <td style="padding: 24px 32px; background-color: #0f172a;">
                            <h1 style="margin: 0; font-size: 18px; font-weight: 600; color: #ffffff; letter-spacing: -0.3px;">${dynamicPlatformName}</h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 32px; font-size: 15px; line-height: 1.6; color: #334155;">
                            <p style="margin: 0 0 16px 0;">Hi <strong>${recipientName}</strong>,</p>
                            <p style="margin: 0 0 16px 0;">Our support team responded to your ongoing inquiry.</p>
                            <p style="margin: 0 0 24px 0;">Please access your dashboard to read the complete message and submit a reply.</p>
                            
                            <p style="margin: 0; font-weight: 500; color: #0f172a;">Best regards,<br>${dynamicPlatformName} Support Team</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 20px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; line-height: 1.5; text-align: center;">
                            This email was sent to you because of an active support request associated with your account on ${dynamicPlatformName}.
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;

        return { subject: emailSubject, plainTextBody, htmlEmailTemplate };
    } else {
        const fullName = userProfile?.full_name?.trim() || userProfile?.username?.trim() || "Unregistered / Guest User";
        const senderEmail = userProfile?.email || clientSuppliedEmail || "No Email Provided";
        const userId = userProfile?.uuid || userProfile?.id || "N/A";
        const platform = dynamicPlatformName || "Platform";

        const emailSubject = `Support Message: ${fullName} (${userId !== "N/A" ? userId : senderEmail})`;

        const displayMessage = message_body || (attachment_url ? '[Attachment Uploaded]' : '[Empty Message]');
        const plainTextBody = `New Support Ticket Received\n\nPlatform: ${platform}\nUser Name: ${fullName}\nEmail: ${senderEmail}\nUser ID/UUID: ${userId}\n\nMessage:\n"${displayMessage}"\n\nLog into your admin panel to reply.`;

        const htmlEmailTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>New User Inquiry</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b;">
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed; background-color: #f8fafc;">
        <tr>
            <td align="center" style="padding: 30px 12px;">
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 560px; background-color: #ffffff; border-radius: 8px; border: 1px solid #e2e8f0; overflow: hidden;">
                    <tr>
                        <td style="padding: 20px 24px; background-color: #0f172a;">
                            <h2 style="margin: 0; color: #ffffff; font-size: 16px; font-weight: 600;">Incoming Customer Message</h2>
                            <p style="margin: 4px 0 0 0; color: #94a3b8; font-size: 12px;">${platform} Support Center</p>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding: 24px;">
                            <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="font-size: 13px; background-color: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0; margin-bottom: 20px;">
                                <tr>
                                    <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #64748b; width: 30%;">User Name</td>
                                    <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-weight: 600;">${fullName}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #64748b;">Email Address</td>
                                    <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; color: #0f172a;"><a href="mailto:${senderEmail}" style="color: #2563eb; text-decoration: none;">${senderEmail}</a></td>
                                </tr>
                                <tr>
                                    <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #64748b;">User UUID / ID</td>
                                    <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-family: monospace;">${userId}</td>
                                </tr>
                                <tr>
                                    <td style="padding: 10px 14px; font-weight: 600; color: #64748b;">Platform</td>
                                    <td style="padding: 10px 14px; color: #0f172<div style="padding: 10px 14px; color: #0f172a;">${platform}</div></td>
                                </tr>
                            </table>

                            <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: 600; color: #475569;">Message Details:</p>
                            <div style="background-color: #f1f5f9; padding: 14px; border-left: 4px solid #0f172a; border-radius: 0 6px 6px 0; font-size: 14px; color: #1e293b; line-height: 1.5;">
                                ${message_body ? message_body.replace(/\n/g, '<br>') : ''}
                                ${attachment_url ? `<div style="margin-top: 10px;"><a href="${attachment_url}" target="_blank" style="color: #2563eb; text-decoration: underline;">View Attached File / Image</a></div>` : ''}
                                ${!message_body && !attachment_url ? '<em>[Empty Message]</em>' : ''}
                            </div>

                            <p style="margin: 20px 0 0 0; font-size: 12px; color: #94a3b8; text-align: center;">Log in to your admin workspace to manage this user's account.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;

        return { subject: emailSubject, plainTextBody, htmlEmailTemplate };
    }
}