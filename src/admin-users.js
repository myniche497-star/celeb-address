// /Users/abc/Documents/web/celeb api/src/admin-users.js
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

// Middleware to verify admin session token
function verifyAdminToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ success: false, error: 'No authorization token provided' });
    }

    const token = authHeader.split(' ')[1];
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ success: false, error: 'Admin session expired or invalid' });
        }
        req.admin = decoded;
        next();
    });
}


// PUT /api/admin/users/:id
router.put('/users/:id', verifyAdminToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { fullname, email, password, country, active } = req.body;

        const { data, error } = await supabase
            .from('users')
            .update({ fullname, email, password, country, active })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json({ success: true, user: data, message: 'User updated successfully' });
    } catch (err) {
        console.error('Error updating user profile:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 1. Fetch All Registered Users for Admin List
router.get('/users', verifyAdminToken, async (req, res) => {
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json({ success: true, users: users || [] });
    } catch (err) {
        console.error('Error fetching admin users list:', err);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// 2. Toggle User Active Status (Block / Unblock)
router.patch('/users/:id/status', verifyAdminToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { active } = req.body;

        const { error } = await supabase
            .from('users')
            .update({ active })
            .eq('id', id);

        if (error) throw error;

        res.json({ success: true, message: 'User status updated successfully' });
    } catch (err) {
        console.error('Error updating user status:', err);
        res.status(500).json({ success: false, error: 'Failed to update user status' });
    }
});

// Add these routes into /Users/abc/Documents/web/celeb api/src/admin-users.js

// 3. Check Administrative Legal Agreement Status
router.get('/agreement', verifyAdminToken, async (req, res) => {
    try {
        const signature = req.query.signature || req.headers['x-setting-target'];

        const { data: adminRecord, error } = await supabase
            .from('admin')
            .select('agreement')
            .eq('signature', signature)
            .maybeSingle();

        const agreementStatus = adminRecord ? (adminRecord.agreement ?? true) : true;
        res.json({ success: true, agreement: agreementStatus });
    } catch (err) {
        res.json({ success: true, agreement: true });
    }
});

// 4. Update Administrative Legal Agreement Status
router.patch('/agreement', verifyAdminToken, async (req, res) => {
    try {
        const { signature, agreement } = req.body;
        const targetSignature = signature || req.headers['x-setting-target'];

        const { error } = await supabase
            .from('admin')
            .update({ agreement })
            .eq('signature', targetSignature);

        if (error) throw error;
        res.json({ success: true, message: 'Agreement status updated successfully' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;