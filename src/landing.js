// /Users/abc/Documents/web/celeb api/src/landing.js
import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

const router = Router();

// Initialize Supabase with your backend keys from .env
const supabase = createClient(
    process.env.PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
        auth: { persistSession: false },
        realtime: {
            transport: WebSocket
        }
    }
);

// Server-side cache store (replaces browser localStorage)
const cache = {
    news: { timestamp: 0, data: null },
    events: { timestamp: 0, data: null },
    celebs: { timestamp: 0, data: null }
};

const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// 1. Get Trending Celebrities (for Search Modal)
router.get('/trending', async (req, res) => {
    try {
        const { data: trending, error } = await supabase
            .from('celeb')
            .select('name')
            .limit(6);

        if (error) throw error;
        res.json({ success: true, trending: trending || [] });
    } catch (err) {
        console.error('Supabase Trending Error:', err);
        res.status(500).json({ success: false, trending: [] });
    }
});

// 2. Wikipedia Validation Endpoint
router.get('/validate-wiki', async (req, res) => {
    const { name } = req.query;
    if (!name) return res.status(400).json({ valid: false, error: 'Name is required' });

    try {
        const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(name)}&format=json&origin=*`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.query && data.query.search.length > 0) {
            const topResult = data.query.search[0].title.toLowerCase();
            const inputName = name.toLowerCase();

            if (topResult.includes(inputName) || inputName.includes(topResult)) {
                return res.json({ valid: true });
            }
        }
        res.json({ valid: false });
    } catch (err) {
        console.error('Wiki API error:', err);
        res.status(500).json({ valid: false, error: 'Validation failed' });
    }
});

// 3. Daily News Endpoint (GNews with 24h Server Cache)
router.get('/news', async (req, res) => {
    const now = Date.now();
    if (cache.news.data && (now - cache.news.timestamp < CACHE_DURATION)) {
        return res.json({ success: true, articles: cache.news.data });
    }

    try {
        const apiKey = process.env.GNEWS_API_KEY || '0041c5bece2ad8192981c540f62e02c9';
        const url = `https://gnews.io/api/v4/top-headlines?category=entertainment&lang=en&apikey=${apiKey}`;
        const response = await fetch(url);
        const data = await response.json();

        const articles = data.articles || [];
        cache.news = { timestamp: now, data: articles };
        res.json({ success: true, articles });
    } catch (error) {
        console.error('GNews Error:', error);
        res.json({ success: true, articles: cache.news.data || [] });
    }
});

// 4. Daily Events Endpoint (SeatGeek with 24h Server Cache)
router.get('/events', async (req, res) => {
    const now = Date.now();
    if (cache.events.data && (now - cache.events.timestamp < CACHE_DURATION)) {
        return res.json({ success: true, events: cache.events.data });
    }

    try {
        const clientId = process.env.SEATGEEK_CLIENT_ID || 'NTU0MjUzNTh8MTc2ODM0OTI3Mi44Nzc5ODI';
        const dateStart = new Date();
        dateStart.setDate(dateStart.getDate() + 4);
        const dateEnd = new Date();
        dateEnd.setDate(dateEnd.getDate() + 5);

        const startStr = dateStart.toISOString().split('T')[0];
        const endStr = dateEnd.toISOString().split('T')[0];

        const url = `https://api.seatgeek.com/2/events?taxonomies.name=concert&sort=datetime_local.asc&datetime_local.gte=${startStr}&datetime_local.lte=${endStr}&per_page=6&client_id=${clientId}`;
        const response = await fetch(url);
        const data = await response.json();

        const events = (data.events || []).map(event => ({
            name: event.title,
            date: event.datetime_local.split('T')[0],
            venue: event.venue.name,
            city: event.venue.display_location,
            image: event.performers[0]?.image || 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?auto=format&fit=crop&w=800&q=80'
        }));

        cache.events = { timestamp: now, data: events };
        res.json({ success: true, events });
    } catch (error) {
        console.error('SeatGeek API Error:', error);
        res.json({ success: true, events: cache.events.data || [] });
    }
});

// 5. Daily Celebrities Endpoint (TMDB with 24h Server Cache)
router.get('/celebs', async (req, res) => {
    const now = Date.now();
    if (cache.celebs.data && (now - cache.celebs.timestamp < CACHE_DURATION)) {
        return res.json({ success: true, people: cache.celebs.data });
    }

    try {
        const apiKey = process.env.TMDB_API_KEY || '29a7b8e40eb2ae93da6b67e9a1f0a130';
        const [page1Res, page2Res] = await Promise.all([
            fetch(`https://api.themoviedb.org/3/person/popular?api_key=${apiKey}&page=1`),
            fetch(`https://api.themoviedb.org/3/person/popular?api_key=${apiKey}&page=2`)
        ]);

        const page1 = await page1Res.json();
        const page2 = await page2Res.json();

        let allPeople = [...(page1.results || []), ...(page2.results || [])].sort(() => Math.random() - 0.5);

        const people = allPeople.slice(0, 21).map(person => {
            let role = person.known_for_department;
            if (person.known_for?.some(m => m.genre_ids?.includes(10402))) role = "Musician / Actor";

            return {
                name: person.name,
                role: role,
                image: person.profile_path ? `https://image.tmdb.org/t/p/w500${person.profile_path}` : 'https://via.placeholder.com/500x750?text=No+Image',
                bio: person.known_for?.[0] ? `Famous for: ${person.known_for[0].title || person.known_for[0].name}` : "Global entertainment star."
            };
        });

        cache.celebs = { timestamp: now, data: people };
        res.json({ success: true, people });
    } catch (error) {
        console.error('TMDB API Error:', error);
        res.json({ success: true, people: cache.celebs.data || [] });
    }
});

export default router;