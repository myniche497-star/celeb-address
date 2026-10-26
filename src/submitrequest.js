// /Users/abc/Documents/web/celeb api/src/submitrequest.js
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import { BrevoClient } from '@getbrevo/brevo';
import ws from 'ws';
import { getRequestAlertTemplate } from './submitrequestTemplate.js';

const router = Router();

const supabase = createClient(
    process.env.PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
        auth: { persistSession: false },
        realtime: { transport: ws }
    }
);

// Helper: Strictly extract signature from frontend request. Throws an error if missing.
function getRequestSignature(req) {
    const signature = (
        req.query?.signature ||
        req.body?.signature ||
        req.headers?.['x-setting-target'] ||
        req.headers?.['signature']
    );

    if (!signature || typeof signature !== 'string' || !signature.trim()) {
        throw new Error('Workspace signature context missing. Value must be provided from the frontend.');
    }
    return signature.trim();
}

// Helper: Fetch admin email and Brevo settings based strictly on signature
async function getAdminConfig(signature) {
    const { data: adminRecord, error } = await supabase
        .from('admin')
        .select('api, domain_email, contact_email, email')
        .eq('signature', signature)
        .maybeSingle();

    if (error || !adminRecord) {
        throw new Error(`Admin configuration not found for signature: "${signature}".`);
    }

    return {
        apiKey: adminRecord.api?.trim() || process.env.BREVO_API_KEY,
        senderEmail: (adminRecord.domain_email || adminRecord.contact_email || 'noreply@assistmsg.com').trim(),
        adminEmail: adminRecord.email ? adminRecord.email.trim() : null
    };
}

// Helper: Send email notification to admin
async function notifyAdmin({ requestType, celebName, userName, userEmail, details, signature }) {
    try {
        const { apiKey, senderEmail, adminEmail } = await getAdminConfig(signature);
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

// 1. Check if monetization/services are enabled (dynamically filtered by frontend signature)
router.get('/status', async (req, res) => {
    try {
        const signature = getRequestSignature(req);
        const { data, error } = await supabase
            .from('admin')
            .select('admin_subscription')
            .eq('signature', signature)
            .maybeSingle();

        if (error) throw error;
        res.json({ success: true, paid: data?.admin_subscription ?? false });
    } catch (err) {
        console.error('Status check error:', err.message);
        res.status(500).json({ success: false, paid: false, error: err.message });
    }
});

// 2. Fetch Card Tiers for Membership Modal (dynamically filtered by frontend signature)
router.get('/cards', async (req, res) => {
    try {
        const signature = getRequestSignature(req);
        const { data, error } = await supabase
            .from('cards')
            .select('*')
            .eq('signature', signature)
            .maybeSingle();

        if (error) throw error;
        res.json({ success: true, cards: data });
    } catch (err) {
        console.error('Cards fetch error:', err.message);
        res.status(500).json({ success: false, error: err.message || 'Failed to fetch cards configuration' });
    }
});

// 3. Submit Request (Bookings, Meet & Greets, Memberships, Support with dynamic signature)
router.post('/submit', async (req, res) => {
    try {
        const activeSignature = getRequestSignature(req);
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
                description: payload.desc,
                signature: activeSignature
            }]);
            insertError = error;
        } else if (type === 'meet') {
            detailString = `Session: ${payload.type}, Date: ${payload.date}, Reason: ${payload.desc}`;
            const { error } = await supabase.from('meet_greets').insert([{
                user_id: userId,
                celeb_name: celebName,
                session_type: payload.type,
                session_date: payload.date,
                reason: payload.desc,
                signature: activeSignature
            }]);
            insertError = error;
        } else if (type === 'membership') {
            detailString = `Tier Selected: ${payload.tier}`;
            const { error } = await supabase.from('memberships').insert([{
                user_id: userId,
                celeb_name: celebName,
                tier_selected: payload.tier,
                signature: activeSignature
            }]);
            insertError = error;
        } else if (type === 'support') {
            detailString = `Support Amount: $${payload.amount}`;
            const { error } = await supabase.from('celebrity_support').insert([{
                user_id: userId,
                celeb_name: celebName,
                amount: parseFloat(payload.amount),
                signature: activeSignature
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
            details: detailString,
            signature: activeSignature
        });

        res.json({ success: true, message: 'Request submitted successfully' });
    } catch (err) {
        console.error('Request submission error:', err.message);
        res.status(500).json({ success: false, error: err.message || 'Internal server error' });
    }
});

export default router;