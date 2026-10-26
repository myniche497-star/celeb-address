// /Users/abc/Documents/web/celeb api/src/web.js
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

// 1. Check Global Site Visibility & Admin Details strictly by frontend Signature
router.get('/status', async (req, res) => {
    try {
        const signature = getRequestSignature(req);

        const { data: adminData, error } = await supabase
            .from('admin')
            .select('website_visibility, email, contact_email, address')
            .eq('signature', signature)
            .maybeSingle();

        if (error || !adminData) {
            return res.status(404).json({ success: false, error: `Admin configuration not found for signature: "${signature}".` });
        }

        res.json({
            success: true,
            website_visibility: adminData.website_visibility ?? true,
            email: adminData.contact_email,
            address: adminData.address
        });
    } catch (err) {
        console.error('Web status check error:', err.message);
        res.status(500).json({ success: false, error: err.message || 'Internal server error' });
    }
});

// 2. Check Individual User Account Active Status (strictly isolated by frontend Signature)
router.get('/user-status/:userId', async (req, res) => {
    try {
        const signature = getRequestSignature(req);
        const { userId } = req.params;

        const { data: user, error } = await supabase
            .from('users')
            .select('active')
            .eq('id', userId)
            .eq('signature', signature)
            .maybeSingle();

        if (error || !user) {
            return res.status(404).json({ success: false, active: true, error: 'User record not found.' });
        }

        res.json({ success: true, active: user.active ?? true });
    } catch (err) {
        console.error('User status check error:', err.message);
        res.status(500).json({ success: false, active: true, error: err.message });
    }
});

export default router;