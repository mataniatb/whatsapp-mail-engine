const { Client, RemoteAuth } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const { google } = require('googleapis');
const express = require('express');
const qrcode = require('qrcode-terminal');

const app = express();
const port = process.env.PORT || 3000;

// הגדרות OAuth2 של גוגל
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

// --- שלב 1: פתיחת השרת באופן מיידי ---
// זה מבטיח ש-Railway יראה שהאפליקציה חיה ויבטל את ה-502
app.get('/health', (req, res) => res.send('OK - Server is healthy'));

app.get('/auth/google', (req, res) => {
    const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/gmail.modify'],
        prompt: 'consent'
    });
    res.redirect(url);
});

// נתיב חזור מגוגל
app.get('/oauth2callback', async (req, res) => {
    try {
        const { code } = req.query;
        const { tokens } = await oauth2Client.getToken(code);
        const Token = mongoose.model('Token', new mongoose.Schema({ userId: String, tokens: Object }));
        await Token.findOneAndUpdate({ userId: 'primary' }, { tokens }, { upsert: true });
        res.send('✅ החיבור לגוגל הצליח!');
    } catch (e) {
        res.status(500).send('שגיאה באימות מול גוגל');
    }
});

app.listen(port, "0.0.0.0", () => {
    console.log(`🚀 [Step 1] השרת נפתח בפורט ${port}. ה-502 אמור להיעלם.`);
    initializeWhatsApp(); // טעינת הוואטסאפ מתחילה רק עכשיו ברקע
});

// --- שלב 2: טעינת המערכות הכבדות (וואטסאפ ומסד נתונים) ---
async function initializeWhatsApp() {
    try {
        console.log('🔄 [Step 2] מתחבר ל-MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ MongoDB מחובר.');

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
                    '--single-process' // קריטי לחיסכון במשאבים ב-Railway
                ]
            }
        });

        client.on('qr', qr => {
            console.log('📢 סרוק את הקוד להפעלת המערכת:');
            qrcode.generate(qr, { small: true });
        });

        client.on('ready', () => console.log('🚀 וואטסאפ מחובר ומוכן!'));

        console.log('🔄 [Step 3] מאתחל את דפדפן וואטסאפ...');
        await client.initialize();

    } catch (err) {
        console.error('❌ שגיאה באתחול המערכת:', err);
    }
}
