// /Users/abc/Documents/web/celeb api/src/authentication.js
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import ws from 'ws';
import forgotPasswordHandler from './forgot-password.js';

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

// --- 1. SIGN IN ENDPOINT ---
router.post('/login', async (req, res) => {
    try {
        const { email, password, signature } = req.body;
        if (!email || !password || !signature) {
            return res.status(400).json({ success: false, error: 'All fields are required' });
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

        if (user.active === false) {
            return res.status(403).json({ success: false, error: 'Account is deactivated' });
        }

        // Generate JWT token (expires in 24 hours)
        const token = jwt.sign(
            { userId: user.id, email: user.email, fullname: user.fullname },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            token,
            user: { id: user.id, fullname: user.fullname, email: user.email, country: user.country }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Internal server error during login' });
    }
});

// --- 2. SIGN UP ENDPOINT ---
router.post('/signup', async (req, res) => {
    try {
        const { fullname, country, email, password, signature } = req.body;
        if (!fullname || !country || !email || !password || !signature) {
            return res.status(400).json({ success: false, error: 'All fields are required' });
        }

        const cleanEmail = email.trim().toLowerCase();
        const { data: existing } = await supabase.from('users').select('email').ilike('email', cleanEmail).maybeSingle();
        if (existing) return res.status(400).json({ success: false, error: 'Email already registered' });

        const { data: newUser, error } = await supabase
            .from('users')
            .insert([{ fullname, country, email: cleanEmail, password, signature, active: true }])
            .select()
            .single();

        if (error) throw error;

        // Generate JWT token
        const token = jwt.sign(
            { userId: newUser.id, email: newUser.email, fullname: newUser.fullname },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.status(201).json({
            success: true,
            token,
            user: { id: newUser.id, fullname: newUser.fullname, email: newUser.email, country: newUser.country }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Internal server error during registration' });
    }
});

// --- 3. TOKEN VALIDATION ENDPOINT ---
router.post('/verify-token', (req, res) => {
    const { token } = req.body;
    if (!token) {
        return res.json({ success: false, valid: false, error: 'No token provided' });
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.json({ success: false, valid: false, error: 'Token expired or invalid' });
        }
        res.json({ success: true, valid: true, decoded });
    });
});

// --- 4. FORGOT PASSWORD ---
router.post('/forgot-password', async (req, res) => {
    return await forgotPasswordHandler(req, res);
});

export default router;