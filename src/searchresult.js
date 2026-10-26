// /Users/abc/Documents/web/celeb api/src/searchresult.js
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

// 1. Profile Authentication Endpoint (Login / Signup loop dynamically isolated by signature)
router.post('/auth', async (req, res) => {
    try {
        const activeSignature = getRequestSignature(req);
        const { mode, email, password, fullname, country } = req.body;
        const cleanEmail = email?.trim().toLowerCase();

        if (!cleanEmail || !password) {
            return res.status(400).json({ success: false, error: 'Required fields missing' });
        }

        if (mode === 'login') {
            const { data: user, error } = await supabase
                .from('users')
                .select('*')
                .eq('email', cleanEmail)
                .eq('password', password)
                .eq('signature', activeSignature)
                .maybeSingle();

            if (error || !user) {
                return res.status(401).json({ success: false, error: 'Invalid credentials' });
            }

            return res.json({ success: true, user: { ...user, loggedIn: true } });
        } else if (mode === 'signup') {
            if (!fullname || !country) {
                return res.status(400).json({ success: false, error: 'All fields are required' });
            }

            const { data: existing } = await supabase
                .from('users')
                .select('email')
                .eq('email', cleanEmail)
                .eq('signature', activeSignature)
                .maybeSingle();

            if (existing) {
                return res.status(400).json({ success: false, error: 'Email already registered' });
            }

            const { data, error } = await supabase
                .from('users')
                .insert([{
                    fullname,
                    country,
                    email: cleanEmail,
                    password,
                    signature: activeSignature,
                    active: true
                }])
                .select()
                .single();

            if (error) throw error;

            return res.status(201).json({ success: true, user: { ...data, loggedIn: true } });
        }

        res.status(400).json({ success: false, error: 'Invalid authentication mode' });
    } catch (err) {
        console.error('Profile auth error:', err.message);
        res.status(500).json({ success: false, error: err.message || 'Internal server error' });
    }
});

// 2. Wikipedia Celebrity Data Fetch & Human/Vitality Validation
router.get('/celebrity', async (req, res) => {
    const { name } = req.query;
    if (!name) return res.status(400).json({ success: false, error: 'Name parameter required' });

    try {
        const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(name)}&format=json&origin=*`;
        const searchRes = await fetch(searchUrl);
        const searchData = await searchRes.json();

        if (!searchData.query?.search?.length) {
            return res.status(404).json({ success: false, error: 'Profile not found' });
        }

        let page = null;

        for (let i = 0; i < searchData.query.search.length; i++) {
            const title = searchData.query.search[i].title;
            const pageUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=extracts|pageimages|categories&exintro&explaintext&titles=${encodeURIComponent(title)}&pithumbsize=1000&cllimit=50&origin=*`;

            const pageRes = await fetch(pageUrl);
            const pageData = await pageRes.json();
            const p = Object.values(pageData.query.pages)[0];

            if (!p.extract || p.extract.includes('may refer to')) continue;

            let isHuman = false;
            let isDead = false;

            if (p.categories) {
                for (const c of p.categories) {
                    const cat = c.title.toLowerCase();
                    if (cat.includes('births') || cat.includes('people')) isHuman = true;
                    if (cat.includes('deaths')) isDead = true;
                    if (cat.includes('companies') || cat.includes('films') || cat.includes('cities')) isHuman = false;
                }
            }

            if (!isHuman) continue;

            p.isDead = isDead;
            page = p;
            break;
        }

        if (!page) {
            return res.status(404).json({ success: false, error: 'Valid celebrity profile not found' });
        }

        const imageUrl = page.thumbnail?.source || 'https://placehold.co/600x900/1a1a1c/d4af37?text=No+Image';

        res.json({
            success: true,
            celebrity: {
                title: page.title,
                extract: page.extract,
                imageUrl: imageUrl,
                isDead: page.isDead
            }
        });
    } catch (err) {
        console.error('Wikipedia API server error:', err.message);
        res.status(500).json({ success: false, error: 'Failed to fetch celebrity details' });
    }
});

export default router;