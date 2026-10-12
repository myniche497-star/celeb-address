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
import customerCareMailHandler from "./src/mail.js"; // 👈 Updated path to src/
import adminDataUpdateHandler from "./src/admin-data-update.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
    origin: [
        'http://localhost:5502',
        'http://127.0.0.1:5502',
        'http://localhost:3000',
        'http://127.0.0.1:3000'
    ],
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

// ✉️ Corrected Mail Dispatch Endpoints under /api/admin or root matching your frontend
app.post("/api/admin/mail", customerCareMailHandler);
app.all("/api/admin/send-email/:id", customerCareMailHandler);

// Health check endpoint
app.get('/', (req, res) => {
    res.json({ status: 'API is running securely 🚀' });
});

app.listen(PORT, () => {
    console.log(`Server is running live on http://localhost:${PORT}`);
});