export function getForgotPasswordTemplate({ displayName, otpCode, platformName }) {
    const textContent = `Hi ${displayName},\n\nHere is the temporary access code requested for your account: ${otpCode}\n\nIf you didn't request this code, you can safely ignore this email.\n\nRegards,\n${platformName} Support`;

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${platformName}</title>
</head>
<body style="margin:0; padding:0; background-color:#f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f8fafc; padding:20px 0;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:500px; background-color:#ffffff; border:1px solid #e2e8f0; border-radius:6px; padding:30px;">
                    <tr>
                        <td style="font-size:16px; color:#334155; line-height:1.5;">
                            <p style="margin:0 0 16px 0;">Hi ${displayName},</p>
                            <p style="margin:0 0 20px 0;">Here is the temporary access code requested for your account:</p>
                            
                            <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:20px 0;">
                                <tr>
                                    <td align="center" style="background-color:#f1f5f9; padding:15px; border-radius:6px; font-size:28px; font-weight:bold; letter-spacing:4px; color:#0f172a;">
                                        ${otpCode}
                                    </td>
                                </tr>
                            </table>

                            <p style="margin:20px 0 0 0; font-size:14px; color:#64748b;">If you didn't request this code, you can safely ignore this email.</p>
                            <p style="margin:24px 0 0 0; font-size:14px; color:#334155;">Regards,<br><strong>${platformName} Support</strong></p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;

    return { textContent, htmlContent };
}