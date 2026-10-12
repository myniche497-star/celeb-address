// /Users/abc/Documents/web/celeb api/src/admin-history.js
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import { BrevoClient } from '@getbrevo/brevo';
import ws from 'ws';
import { getAdminHistoryEmailTemplates } from './admin-history-template.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET;
const FRONTEND_SIGNATURE = 'celemanagement';

const supabase = createClient(
    process.env.PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
        auth: { persistSession: false },
        realtime: { transport: ws }
    }
);

function verifyAdminToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, error: 'No token provided' });

    const token = authHeader.split(' ')[1];
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ success: false, error: 'Unauthorized or expired session' });
        req.admin = decoded;
        next();
    });
}

// Helper: Fetch admin email and Brevo settings based on signature (matching submitrequest.js)
async function getAdminConfig(signature) {
    const { data: adminRecord, error } = await supabase
        .from('admin')
        .select('api, domain_email, contact_email, email')
        .eq('signature', signature)
        .maybeSingle();

    if (error || !adminRecord) {
        throw new Error('Admin configuration not found for signature.');
    }

    return {
        apiKey: adminRecord.api?.trim(),
        senderEmail: (adminRecord.domain_email || adminRecord.contact_email || 'noreply@assistmsg.com').trim(),
        adminEmail: adminRecord.email ? adminRecord.email.trim() : null
    };
}

// 1. Fetch History Records by User and Table Name
router.get('/history/:userId/:tableName', verifyAdminToken, async (req, res) => {
    try {
        const { userId, tableName } = req.params;
        const allowed = ['bookings', 'meet_greets', 'memberships', 'celebrity_support'];
        if (!allowed.includes(tableName)) {
            return res.status(400).json({ success: false, error: 'Invalid table name' });
        }

        const { data, error } = await supabase
            .from(tableName)
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json({ success: true, data: data || [] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 2. Update Record & Trigger Email Alert Option
router.put('/history/:tableName/:recordId', verifyAdminToken, async (req, res) => {
    try {
        const { tableName, recordId } = req.params;
        const { send_email, ...updates } = req.body;
        const allowed = ['bookings', 'meet_greets', 'memberships', 'celebrity_support'];
        if (!allowed.includes(tableName)) {
            return res.status(400).json({ success: false, error: 'Invalid table name' });
        }

        const idColumn = tableName === 'memberships' ? 'id_numeric' : 'id';

        // Fetch existing record to get user_id (matching submitrequest.js pattern)
        const { data: recordRecord, error: fetchErr } = await supabase
            .from(tableName)
            .select('*')
            .eq(idColumn, recordId)
            .single();

        if (fetchErr) throw fetchErr;

        // Perform update
        const { error: updateErr } = await supabase
            .from(tableName)
            .update(updates)
            .eq(idColumn, recordId);

        if (updateErr) throw updateErr;

        // Trigger Brevo Email if requested
        if (send_email === true && recordRecord?.user_id) {
            try {
                const { data: userRecord } = await supabase
                    .from('users')
                    .select('fullname, email')
                    .eq('id', recordRecord.user_id)
                    .single();

                if (userRecord?.email) {
                    const { apiKey, senderEmail } = await getAdminConfig(FRONTEND_SIGNATURE);
                    if (apiKey && senderEmail) {
                        const platformName = 'Celeb-Net';
                        const { subject, plainTextBody, htmlEmailTemplate } = getAdminHistoryEmailTemplates({
                            tableName,
                            recordData: { ...recordRecord, ...updates },
                            userProfile: userRecord,
                            dynamicPlatformName: platformName
                        });

                        const brevo = new BrevoClient({ apiKey });
                        await brevo.transactionalEmails.sendTransacEmail({
                            sender: { name: platformName, email: senderEmail },
                            to: [{ email: userRecord.email.trim() }],
                            subject: subject,
                            textContent: plainTextBody,
                            htmlContent: htmlEmailTemplate
                        });
                        console.log(`📨 [Brevo] Request update email dispatched successfully to ${userRecord.email}`);
                    }
                }
            } catch (emailErr) {
                console.error("❌ Email dispatch background error:", emailErr.response?.body || emailErr.message || emailErr);
            }
        }

        res.json({ success: true, message: 'Record updated successfully' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3. Delete Record
router.delete('/history/:tableName/:recordId', verifyAdminToken, async (req, res) => {
    try {
        const { tableName, recordId } = req.params;
        const allowed = ['bookings', 'meet_greets', 'memberships', 'celebrity_support'];
        if (!allowed.includes(tableName)) {
            return res.status(400).json({ success: false, error: 'Invalid table name' });
        }

        const idColumn = tableName === 'memberships' ? 'id_numeric' : 'id';

        const { error } = await supabase
            .from(tableName)
            .delete()
            .eq(idColumn, recordId);

        if (error) throw error;
        res.json({ success: true, message: 'Record deleted successfully' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 4. Fetch User Details for Card Navigation
router.get('/user-details/:userId', verifyAdminToken, async (req, res) => {
    try {
        const { userId } = req.params;
        const { data, error } = await supabase
            .from('users')
            .select('fullname')
            .eq('id', userId)
            .single();

        if (error) throw error;
        res.json({ success: true, user: data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;