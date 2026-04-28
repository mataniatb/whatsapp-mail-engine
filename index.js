const { Client, RemoteAuth } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const { google } = require('googleapis');
const express = require('express');
const qrcode = require('qrcode'); // שינוי לספריה שמייצרת תמונה

const app = express();
const port = process.env.PORT || 3000;

let lastQr = null; // משתנה לשמירת ה-QR האחרון
let gmail;

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

// --- 1. ממשק אינטרנט משופר ---

// דף הבית
app.get('/', (req, res) => {
    res.send(`
        <div style="font-family: sans-serif; text-align: center; padding: 50px;">
            <h1>מערכת WhatsApp-Gmail מחוברת</h1>
            <p>סטטוס: המערכת רצה בפורט ${port}</p>
            <div style="margin-top: 20px;">
                <a href="/qr" style="padding: 10px 20px; background: #25D366; color: white; text-decoration: none; border-radius: 5px;">לחץ כאן לסריקת QR לוואטסאפ</a>
            </div>
            <div style="margin-top: 10px;">
                <a href="/auth/google" style="padding: 10px 20px; background: #4285F4; color: white; text-decoration: none; border-radius: 5px;">לחץ כאן לחיבור לגוגל</a>
            </div>
        </div>
    `);
});

// נתיב ה-QR החדש
app.get('/qr', async (req, res) => {
    if (!lastQr) {
        return res.send('<h1>ה-QR עדיין לא נוצר או שהמכשיר כבר מחובר.</h1><p>בדוק את הלוגים אם יש שגיאה.</p>');
    }
    const code = await qrcode.toDataURL(lastQr);
    res.send(`
        <div style="font-family: sans-serif; text-align: center; padding: 20px;">
            <h2>סרוק את הקוד כדי לחבר את הוואטסאפ:</h2>
            <img src="${code}" style="border: 10px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.1);" />
            <p>הדף יתעדכן אוטומטית כשהחיבור יצליח.</p>
            <script>setTimeout(() => location.reload(), 15000);</script>
        </div>
    `);
});

app.get('/oauth2callback', async (req, res) => {
    try {
        const { code } = req.query;
        const { tokens } = await oauth2Client.getToken(code);
        const Token = mongoose.models.Token || mongoose.model('Token', new mongoose.Schema({ userId: String, tokens: Object }));
        await Token.findOneAndUpdate({ userId: 'primary' }, { tokens }, { upsert: true });
        oauth2Client.setCredentials(tokens);
        gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        res.send('✅ החיבור לגוגל הצליח!');
    } catch (e) { res.status(500).send('Google Auth Error'); }
});

app.listen(port, "0.0.0.0", () => {
    console.log(`🚀 Server live on port ${port}`);
    initializeSystem();
});

// --- 2. מנוע המערכת ---

async function initializeSystem() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        
        const Token = mongoose.models.Token || mongoose.model('Token', new mongoose.Schema({ userId: String, tokens: Object }));
        const storedToken = await Token.findOne({ userId: 'primary' });
        if (storedToken) {
            oauth2Client.setCredentials(storedToken.tokens);
            gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        }

        const client = new Client({
            authStrategy: new RemoteAuth({
                store: new MongoStore({ mongoose: mongoose }),
                backupSyncIntervalMs: 300000
            }),
            puppeteer: {
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--single-process']
            }
        });

        client.on('qr', qr => {
            lastQr = qr; // שמירת הקוד להצגה בלינק
            console.log('⚡ QR Code generated. View it at: /qr');
        });

        client.on('ready', () => {
            lastQr = null; // ניקוי הקוד ברגע שמחוברים
            console.log('🚀 WhatsApp Ready!');
            startEmailSync(client);
        });

        await client.initialize();
    } catch (err) { console.error('Init Error:', err); }
}

function startEmailSync(whatsappClient) {
    setInterval(async () => {
        if (!gmail) return;
        try {
            const res = await gmail.users.messages.list({ userId: 'me', q: 'is:unread', maxResults: 1 });
            if (res.data.messages) {
                console.log(`Checking emails... found new mail.`);
                // כאן תוכל להוסיף את שליחת ההודעה למספר שלך
            }
        } catch (err) { console.error('Sync Error:', err); }
    }, 300000);
}
