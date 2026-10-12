export function generateCustomerCareTemplate(userData = {}, mailDetails = {}) {
    const { recipientName, supportMessage, mailingId, platformName } = mailDetails;

    const customerName = recipientName || userData.full_name || userData.username || "Valued Customer";

    // Read dynamic public image URL attached in mail.js
    const attachmentImage = userData.user_image || userData.image || userData.img || "";

    const formattedMessage = (supportMessage || '')
        .split('\n')
        .map(paragraph => paragraph.trim() ? `<p style="margin: 0 0 16px 0; color: #334155; font-size: 15px; line-height: 1.6;">${paragraph}</p>` : '')
        .join('');

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Customer Support</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #334155; line-height: 1.6; background-color: #f8fafc; margin: 0; padding: 20px; }
            .container { max-width: 650px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
            .header { background: #0f172a; color: #ffffff; padding: 24px; }
            .header-table { width: 100%; border-collapse: collapse; }
            .header h2 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.5px; }
            .header p { margin: 4px 0 0 0; color: #94a3b8; font-size: 13px; }
            .ref-badge { background-color: #1e293b; color: #38bdf8; font-size: 12px; font-weight: 600; padding: 6px 12px; border-radius: 20px; border: 1px solid #334155; display: inline-block; }
            .body-content { padding: 32px; }
            .message-container { margin: 20px 0 28px 0; }
            .img-container { text-align: center; margin: 24px 0; }
            .img-container img { max-width: 100%; max-height: 350px; border-radius: 8px; border: 1px solid #e2e8f0; object-fit: contain; }
            .footer { text-align: center; font-size: 12px; color: #94a3b8; padding: 20px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; }
        </style>
    </head>
    <body>
        <div class="container">
            <!-- Header -->
            <div class="header">
                <table class="header-table">
                    <tr>
                        <td>
                            <h2>Customer Support</h2>
                            <p>${platformName} Operations Desk</p>
                        </td>
                        ${mailingId ? `
                        <td style="text-align: right; vertical-align: middle;">
                            <span class="ref-badge">Ref: ${mailingId}</span>
                        </td>` : ''}
                    </tr>
                </table>
            </div>

            <div class="body-content">
                <p style="font-size: 16px; font-weight: 600; margin-top: 0; color: #0f172a;">Dear ${customerName},</p>
                
                <!-- Dynamic Support Message -->
                <div class="message-container">
                    ${formattedMessage}
                </div>

                

                <p style="margin: 28px 0 0 0; color: #64748b; font-size: 14px; line-height: 1.5;">
                    Best regards,<br>
                    <strong style="color: #0f172a;">Customer Support Operations</strong><br>
                    <span style="font-size: 12px; color: #94a3b8;">${platformName}</span>
                </p>
            </div>

            <!-- Footer -->
            <div class="footer">
                <p>If you have any further questions, simply reply directly to this email.</p>
                <p>&copy; ${new Date().getFullYear()} ${platformName}. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>
    `;
}