// /Users/abc/Documents/web/celeb api/app.js
import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import authRouter from './src/authentication.js';
import dashboardRouter from './src/dashboard.js';
import searchResultRouter from './src/searchresult.js';
import landingRouter from './src/landing.js';
import submitRequestRouter from './src/submitrequest.js';
import webRouter from './src/web.js';
import adminAuthHandler from "./src/admin-auth.js";
import adminUsersRouter from './src/admin-users.js';
import adminChatHandler from "./src/admin-chat.js";
import adminHistoryRouter from './src/admin-history.js';
import adminCardsRouter from './src/admin-cards.js';
import customerCareMailHandler from "./src/mail.js";
import adminDataUpdateHandler from "./src/admin-data-update.js";

const app = express();
const PORT = process.env.PORT || 3000;

// Allow requests from any origin for Vercel deployment
app.use(cors({
    origin: true,
    credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// API Routes
app.use('/api/landing', landingRouter);
app.use('/api/auth', authRouter);
app.use('/api/dash', dashboardRouter);
app.use('/api/search', searchResultRouter);
app.use('/api/requests', submitRequestRouter);
app.use('/api/web', webRouter);
app.post("/api/admin-auth", adminAuthHandler);
app.use('/api/admin', adminUsersRouter);
app.all("/api/admin-chat", adminChatHandler);
app.all("/api/admin-chat/upload", adminChatHandler);
app.use('/api/admin', adminHistoryRouter);
app.use('/api/admin', adminCardsRouter);
app.all("/api/admin-data-update", adminDataUpdateHandler);

// Mail Dispatch Endpoints
app.post("/api/admin/mail", customerCareMailHandler);
app.all("/api/admin/send-email/:id", customerCareMailHandler);

// Health check endpoint
app.get('/', (req, res) => {
    res.json({ status: 'API is running securely 🚀' });
});

// Only listen locally if not running in a serverless environment like Vercel
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Server is running live on http://localhost:${PORT}`);
    });
}

export default app;