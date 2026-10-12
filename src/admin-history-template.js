// /Users/abc/Documents/web/celeb api/src/admin-history-template.js

export function getAdminHistoryEmailTemplates({ tableName, recordData, userProfile, dynamicPlatformName }) {
    const userName = userProfile?.fullname || userProfile?.full_name || "Valued Member";
    const status = recordData.status || "Updated";
    const celebName = recordData.celeb_name || "Celebrity";

    let subject = `${dynamicPlatformName} - Request Status Update: ${status}`;
    let plainTextBody = `Hello ${userName},\n\nYour request regarding ${celebName} has been updated to: ${status}.\n\nThank you for using ${dynamicPlatformName}.`;

    let specificDetailsHtml = "";
    if (tableName === 'bookings') {
        specificDetailsHtml = `
            <p><b>Event Type:</b> ${recordData.event_type || 'N/A'}</p>
            <p><b>Event Date:</b> ${recordData.event_date || 'N/A'}</p>
            <p><b>Description:</b> ${recordData.description || 'N/A'}</p>
        `;
    } else if (tableName === 'meet_greets') {
        specificDetailsHtml = `
            <p><b>Session Type:</b> ${recordData.session_type || 'N/A'}</p>
            <p><b>Session Date:</b> ${recordData.session_date || 'N/A'}</p>
            <p><b>Reason:</b> ${recordData.reason || 'N/A'}</p>
        `;
    } else if (tableName === 'memberships') {
        specificDetailsHtml = `
            <p><b>Tier:</b> ${recordData.tier_selected || 'N/A'}</p>
            <p><b>Card Number:</b> ${recordData.card_number || 'N/A'}</p>
            <p><b>Expiry Date:</b> ${recordData.ex_date || 'N/A'}</p>
            <p><b>Admin Comment:</b> ${recordData.comment || 'N/A'}</p>
        `;
    } else if (tableName === 'celebrity_support') {
        specificDetailsHtml = `
            <p><b>Support Amount:</b> $${recordData.amount || '0.00'}</p>
        `;
    }

    const htmlEmailTemplate = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${dynamicPlatformName}</title>
</head>
<body style="margin:0; padding:0; background-color:#0f172a; font-family: Arial, sans-serif;">
    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#0f172a; padding:30px 0;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:600px; background-color:#1e293b; border-radius:8px; padding:30px; color:#ffffff;">
                    <tr>
                        <td>
                            <h2 style="color: #38bdf8; text-transform: uppercase; border-bottom: 2px solid #334155; padding-bottom: 10px; margin-top:0;">${dynamicPlatformName} Notification</h2>
                            <p style="font-size: 16px; color: #cbd5e1;">Hello <b>${userName}</b>,</p>
                            <p style="font-size: 15px; color: #cbd5e1;">Your request involving celebrity <b>${celebName}</b> has been updated.</p>
                            
                            <div style="background: #0f172a; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #38bdf8;">
                                <p style="margin: 5px 0;"><b>Status:</b> <span style="color: ${status.toLowerCase() === 'approved' ? '#34d399' : '#fbbf24'}; text-transform: uppercase;">${status}</span></p>
                                ${specificDetailsHtml}
                            </div>

                            <p style="font-size: 14px; color: #94a3b8;">If you have any questions, feel free to contact support.</p>
                            <p style="font-size: 12px; color: #64748b; margin-top: 30px; border-top: 1px solid #334155; padding-top: 10px;">&copy; ${new Date().getFullYear()} ${dynamicPlatformName}. All rights reserved.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;

    return { subject, plainTextBody, htmlEmailTemplate };
}