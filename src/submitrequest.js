// /Users/abc/Documents/web/celeb api/src/submitrequest.js
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { BrevoClient } from '@getbrevo/brevo';
import ws from 'ws';
import { getRequestAlertTemplate } from './submitrequestTemplate.js';

const router = Router();
const FRONTEND_SIGNATURE = 'celemanagement';

const supabase = createClient(
    process.env.PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
        auth: { persistSession: false },
        realtime: { transport: ws }
    }
);

// Helper: Fetch admin email and Brevo settings based on signature
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
        apiKey: adminRecord.api?.trim() || process.env.BREVO_API_KEY,
        senderEmail: (adminRecord.domain_email || adminRecord.contact_email || 'noreply@assistmsg.com').trim(),
        adminEmail: adminRecord.email ? adminRecord.email.trim() : null
    };
}

// Helper: Send email notification to admin
async function notifyAdmin({ requestType, celebName, userName, userEmail, details }) {
    try {
        const { apiKey, senderEmail, adminEmail } = await getAdminConfig(FRONTEND_SIGNATURE);
        if (!adminEmail || !apiKey) return;

        const brevo = new BrevoClient({ apiKey });
        const platformName = 'Celeb-Net';

        const { subject, htmlContent } = getRequestAlertTemplate({
            adminName: 'Admin',
            userName: userName || userEmail,
            requestType,
            celebName,
            details,
            platformName
        });

        await brevo.transactionalEmails.sendTransacEmail({
            sender: { name: platformName, email: senderEmail },
            to: [{ email: adminEmail }],
            subject: subject,
            htmlContent: htmlContent
        });
    } catch (err) {
        console.error('Admin email alert error:', err);
    }
}

// 1. Check if monetization/services are enabled
router.get('/status', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('full_version')
            .select('paid')
            .eq('id', 1)
            .single();

        if (error) throw error;
        res.json({ success: true, paid: data?.paid ?? false });
    } catch (err) {
        res.status(500).json({ success: false, paid: false });
    }
});

// 2. Fetch Card Tiers for Membership Modal
router.get('/cards', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('cards')
            .select('*')
            .eq('id', 1)
            .single();

        if (error) throw error;
        res.json({ success: true, cards: data });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to fetch cards configuration' });
    }
});

// 3. Submit Request (Bookings, Meet & Greets, Memberships, Support)
router.post('/submit', async (req, res) => {
    try {
        const { userId, celebName, type, payload } = req.body;

        if (!userId || !celebName || !type) {
            return res.status(400).json({ success: false, error: 'Missing required request parameters' });
        }

        // Fetch user details for notification
        const { data: userRecord } = await supabase
            .from('users')
            .select('fullname, email')
            .eq('id', userId)
            .single();

        const userName = userRecord?.fullname || 'Customer';
        const userEmail = userRecord?.email || '';

        let insertError = null;
        let detailString = '';

        if (type === 'booking') {
            detailString = `Event Type: ${payload.type}, Date: ${payload.date}, Desc: ${payload.desc}`;
            const { error } = await supabase.from('bookings').insert([{
                user_id: userId,
                celeb_name: celebName,
                event_type: payload.type,
                event_date: payload.date,
                description: payload.desc
            }]);
            insertError = error;
        } else if (type === 'meet') {
            detailString = `Session: ${payload.type}, Date: ${payload.date}, Reason: ${payload.desc}`;
            const { error } = await supabase.from('meet_greets').insert([{
                user_id: userId,
                celeb_name: celebName,
                session_type: payload.type,
                session_date: payload.date,
                reason: payload.desc
            }]);
            insertError = error;
        } else if (type === 'membership') {
            detailString = `Tier Selected: ${payload.tier}`;
            const { error } = await supabase.from('memberships').insert([{
                user_id: userId,
                celeb_name: celebName,
                tier_selected: payload.tier
            }]);
            insertError = error;
        } else if (type === 'support') {
            detailString = `Support Amount: $${payload.amount}`;
            const { error } = await supabase.from('celebrity_support').insert([{
                user_id: userId,
                celeb_name: celebName,
                amount: parseFloat(payload.amount)
            }]);
            insertError = error;
        } else {
            return res.status(400).json({ success: false, error: 'Invalid submission type' });
        }

        if (insertError) {
            return res.status(500).json({ success: false, error: insertError.message });
        }

        // Send Email Alert to Admin asynchronously
        notifyAdmin({
            requestType: type.toUpperCase(),
            celebName,
            userName,
            userEmail,
            details: detailString
        });

        res.json({ success: true, message: 'Request submitted successfully' });
    } catch (err) {
        console.error('Request submission error:', err);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

export default router;