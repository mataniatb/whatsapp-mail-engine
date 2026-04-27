const { Client, RemoteAuth } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const { google } = require('googleapis');
const express = require('express');
const qrcode = require('qrcode-terminal');
const { simpleParser } = require('mailparser');

const app = express();
// Railway מזריק את הפורט הזה אוטומטית
const port = process.env.PORT || 3000;

// הגדרות סכימה למסד הנתונים
const TokenSchema = new mongoose.Schema({ userId: String, tokens: Object });
const MsgMapSchema = new mongoose.Schema({ waMsgId: String, threadId: String, fromEmail: String, subject: String });
const Token = mongoose.model('Token', TokenSchema);
const MsgMap = mongoose.model('MsgMap', MsgMapSchema);

// הגדרות Google OAuth2
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

// 1. נתיב בדיקה (Health Check) - לוודא שהשרת עונה ולא נותן 502
app.get('/health', (req, res) => {
    res.send('OK - Server is alive');
});

// 2. נתיבי אימות גוגל
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
        // שמירת הטוקן עבור המשתמש הראשי
        await Token.findOneAndUpdate({ userId: 'primary' }, { tokens }, { upsert: true });
        oauth2Client.setCredentials(tokens);
        res.send('✅ החיבור לגוגל הצליח! המערכת מתחילה לסרוק מיילים.');
    } catch (error) {
        console.error('OAuth Error:', error);
        res.status(500).send('שגיאה בתהליך האימות מול גוגל');
    }
});

// חיבור ל-MongoDB והפעלת הבוט
mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log('✅ Connected to MongoDB Atlas');

        const client = new Client({
            authStrategy: new RemoteAuth({
                store: new MongoStore({ mongoose: mongoose }),
                backupSyncIntervalMs: 300000
            }),
            puppeteer: {
                // נתיב קריטי עבור Railway
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
            }
        });

        client.on('qr', qr => {
            console.log('--- SCAN THIS QR CODE ---');
            qrcode.generate(qr, { small: true });
        });

        client.on('ready', () => {
            console.log('🚀 WhatsApp Client is ready!');
        });

        client.initialize();

        // הפעלת השרת על 0.0.0.0 - קריטי למניעת 502 ב-Railway
        app.listen(port, "0.0.0.0", () => {
            console.log(`🌍 Server is listening on port ${port}`);
        });
    })
    .catch(err => {
        console.error('❌ MongoDB Connection Error:', err);
    });
