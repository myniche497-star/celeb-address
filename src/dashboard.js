// /Users/abc/Documents/web/celeb api/src/dashboard.js
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

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

// 1. Dashboard Authentication Endpoint (dynamically filtered by signature)
router.post('/login', async (req, res) => {
    try {
        const signature = getRequestSignature(req);
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email and password are required' });
        }

        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .ilike('email', email.trim())
            .eq('password', password)
            .eq('signature', signature)
            .maybeSingle();

        if (error || !user) {
            return res.status(401).json({ success: false, error: 'Invalid email or password' });
        }

        res.json({
            success: true,
            user: {
                id: user.id,
                fullname: user.fullname,
                email: user.email,
                country: user.country
            }
        });
    } catch (err) {
        console.error('Dashboard login error:', err.message);
        res.status(500).json({ success: false, error: err.message || 'Internal server error' });
    }
});

// 2. Fetch User Profile Data & Metrics (dynamically filtered by signature)
router.get('/user/:userId', async (req, res) => {
    try {
        const signature = getRequestSignature(req);
        const { userId } = req.params;

        const [userRes, bookingsRes, meetupsRes, supportRes] = await Promise.all([
            supabase.from('users').select('*').eq('id', userId).eq('signature', signature).single(),
            supabase.from('bookings').select('*', { count: 'exact' }).eq('user_id', userId).eq('signature', signature),
            supabase.from('meet_greets').select('*', { count: 'exact' }).eq('user_id', userId).eq('signature', signature),
            supabase.from('celebrity_support').select('amount').eq('user_id', userId).eq('signature', signature)
        ]);

        if (userRes.error || !userRes.data) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const user = userRes.data;
        const totalSupport = supportRes.data?.reduce((acc, curr) => acc + Number(curr.amount), 0) || 0;

        res.json({
            success: true,
            user: {
                fullname: user.fullname,
                country: user.country,
                account_balance: user.account_balance || '0.00'
            },
            counts: {
                bookings: bookingsRes.count || 0,
                meetups: meetupsRes.count || 0,
                support: totalSupport
            }
        });
    } catch (err) {
        console.error('Error fetching dashboard metrics:', err.message);
        res.status(500).json({ success: false, error: err.message || 'Internal server error' });
    }
});

// 3. Fetch Table Records (dynamically filtered by signature)
router.get('/table/:userId/:tableName', async (req, res) => {
    try {
        const signature = getRequestSignature(req);
        const { userId, tableName } = req.params;
        const allowedTables = ['bookings', 'meet_greets', 'memberships', 'celebrity_support'];

        if (!allowedTables.includes(tableName)) {
            return res.status(400).json({ success: false, error: 'Invalid table name' });
        }

        const { data, error } = await supabase
            .from(tableName)
            .select('*')
            .eq('user_id', userId)
            .eq('signature', signature)
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json({ success: true, data: data || [] });
    } catch (err) {
        console.error('Error loading table data:', err.message);
        res.status(500).json({ success: false, error: err.message || 'Internal server error' });
    }
});

// 4. Update Profile
router.put('/user/:userId', async (req, res) => {
    try {
        const signature = getRequestSignature(req);
        const { userId } = req.params;
        const { fullname, country } = req.body;

        const { error } = await supabase
            .from('users')
            .update({ fullname, country })
            .eq('id', userId)
            .eq('signature', signature);

        if (error) throw error;

        res.json({ success: true, message: 'Profile updated successfully' });
    } catch (err) {
        console.error('Error updating profile:', err.message);
        res.status(500).json({ success: false, error: err.message || 'Internal server error' });
    }
});

// 5. Verify & View Membership Card Details (handles QR codes & shared rids, dynamically filtered by signature)
router.get('/card/:userId/:cardNumber', async (req, res) => {
    try {
        const signature = getRequestSignature(req);
        const { userId, cardNumber } = req.params;
        const cleanSearchCard = cardNumber.toString().replace(/\s/g, '');

        const { data: cards, error } = await supabase
            .from('memberships')
            .select('*')
            .eq('user_id', userId)
            .eq('signature', signature);

        if (error || !cards) {
            return res.status(404).json({ success: false, error: 'Cards not found' });
        }

        const matchedCard = cards.find(c => c.card_number.toString().replace(/\s/g, '') === cleanSearchCard);

        if (!matchedCard) {
            return res.status(404).json({ success: false, error: 'Card not found in your account' });
        }

        res.json({ success: true, card: matchedCard });
    } catch (err) {
        console.error('Error verifying card:', err.message);
        res.status(500).json({ success: false, error: err.message || 'Internal server error' });
    }
});

export default router;