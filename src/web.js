// /Users/abc/Documents/web/celeb api/src/web.js
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

const router = Router();
const DEFAULT_SIGNATURE = 'celemanagement';

const supabase = createClient(
    process.env.PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
        auth: { persistSession: false },
        realtime: { transport: ws }
    }
);

// 1. Check Global Site Visibility & Admin Details by Signature
router.get('/status', async (req, res) => {
    try {
        const signature = req.query.signature || DEFAULT_SIGNATURE;

        const { data: adminData } = await supabase
            .from('admin')
            .select('website_visibility, email, contact_email, address')
            .eq('signature', signature)
            .maybeSingle();

        const admin = adminData || (await supabase.from('admin').select('website_visibility, email, contact_email, address').eq('id', 1).single()).data;

        res.json({
            success: true,
            website_visibility: admin?.website_visibility ?? true,
            email: admin?.contact_email,
            address: admin?.address
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// 2. Check Individual User Account Active Status
router.get('/user-status/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { data: user, error } = await supabase
            .from('users')
            .select('active')
            .eq('id', userId)
            .single();

        if (error || !user) {
            return res.status(404).json({ success: false, active: true });
        }

        res.json({ success: true, active: user.active ?? true });
    } catch (err) {
        res.status(500).json({ success: false, active: true });
    }
});

export default router;