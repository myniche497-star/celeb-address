// /Users/abc/Documents/web/celeb api/src/submitrequestTemplate.js
export function getRequestAlertTemplate({ adminName, userName, requestType, celebName, details, platformName }) {
    const subject = `New ${requestType} Request for ${celebName} - ${platformName}`;

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>New Submission Alert</title>
</head>
<body style="margin:0; padding:0; background-color:#f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f8fafc; padding:20px 0;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:600px; background-color:#ffffff; border:1px solid #e2e8f0; border-radius:6px; padding:30px;">
                    <tr>
                        <td style="font-size:16px; color:#334155; line-height:1.6;">
                            <p style="margin:0 0 16px 0;">Hello Admin,</p>
                            <p style="margin:0 0 20px 0;">A new <strong>${requestType}</strong> request has been submitted on <strong>${platformName}</strong>.</p>
                            
                            <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f1f5f9; padding:15px; border-radius:6px; margin-bottom:20px;">
                                <tr>
                                    <td>
                                        <p style="margin:4px 0;"><strong>User Name:</strong> ${userName}</p>
                                        <p style="margin:4px 0;"><strong>Celebrity Target:</strong> ${celebName}</p>
                                        <p style="margin:4px 0;"><strong>Request Type:</strong> ${requestType}</p>
                                        <p style="margin:4px 0;"><strong>Details:</strong> ${details}</p>
                                    </td>
                                </tr>
                            </table>

                            <p style="margin:0; font-size:14px; color:#64748b;">Please log in to your dashboard to review and manage this request.</p>
                            <p style="margin:24px 0 0 0; font-size:14px; color:#334155;">Regards,<br><strong>${platformName} System</strong></p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;

    return { subject, htmlContent };
}