// /Users/abc/Documents/web/celeb api/src/admin-cards.js
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import ws from 'ws';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET;

const supabase = createClient(
    process.env.PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
        auth: { persistSession: false },
        realtime: { transport: ws }
    }
);

// Middleware to verify admin token
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

// 1. Fetch Membership Card Record
router.get('/card-record/:rowId', verifyAdminToken, async (req, res) => {
    try {
        const { rowId } = req.params;
        const { data, error } = await supabase
            .from('memberships')
            .select('*')
            .eq('id_numeric', rowId)
            .single();

        if (error || !data) return res.status(404).json({ success: false, error: 'Record not found' });
        res.json({ success: true, record: data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 2. Update Membership Card Details
router.put('/card-record/:rowId', verifyAdminToken, async (req, res) => {
    try {
        const { rowId } = req.params;
        const updates = req.body;

        const { error } = await supabase
            .from('memberships')
            .update(updates)
            .eq('id_numeric', rowId);

        if (error) throw error;
        res.json({ success: true, message: 'Card updated successfully' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;