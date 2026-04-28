const { Client, RemoteAuth } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const { google } = require('googleapis');
const express = require('express');
const qrcode = require('qrcode-terminal');

const app = express();
// משיכת הפורט הדינמי מ-Railway (חובה לפתרון ה-502)
const port = process.env.PORT || 3000;

// הגדרות OAuth2 עבור Gmail
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

// --- 1. שרת ה-Express (נפתח מיד) ---
app.get('/health', (req, res) => res.send('✅ System is healthy and port is bound.'));

app.get('/auth/google', (req, res) => {
    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/gmail.modify'],
        prompt: 'consent'
    });
    res.redirect(url);
});

app.get('/oauth2callback', async (req, res) => {
    try {
        const { code } = req.query;
        const { tokens } = await oauth2Client.getToken(code);
        // שמירת ה-Token במסד הנתונים
        const TokenSchema = new mongoose.Schema({ userId: String, tokens: Object });
        const Token = mongoose.models.Token || mongoose.model('Token', TokenSchema);
        await Token.findOneAndUpdate({ userId: 'primary' }, { tokens }, { upsert: true });
        res.send('✅ החיבור לגוגל הצליח! המערכת תתחיל לסנכרן מיילים.');
    } catch (e) {
        console.error('OAuth Error:', e);
        res.status(500).send('שגיאה בתהליך האימות.');
    }
});

app.listen(port, "0.0.0.0", () => {
    console.log(`🚀 [Step 1] Server is live on port ${port}`);
    initializeSystem();
});

// --- 2. אתחול המערכות הכבדות ---
async function initializeSystem() {
    try {
        console.log('🔄 [Step 2] Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ MongoDB connected.');

        const client = new Client({
            authStrategy: new RemoteAuth({
                store: new MongoStore({ mongoose: mongoose }),
                backupSyncIntervalMs: 300000
            }),
            puppeteer: {
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--single-process'
                ]
            }
        });

        client.on('qr', qr => {
            console.log('📢 SCAN THIS QR CODE:');
            qrcode.generate(qr, { small: true });
        });

        client.on('ready', () => {
            console.log('🚀 WhatsApp Web is READY!');
        });

        console.log('🔄 [Step 3] Initializing WhatsApp (this may take a minute)...');
        await client.initialize();

    } catch (err) {
        console.error('💥 Critical Error during initialization:', err);
    }
}
