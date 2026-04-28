const { Client, LocalAuth } = require('whatsapp-web.js');
const mongoose = require('mongoose');
const { google } = require('googleapis');
const express = require('express');
const qrcode = require('qrcode');

const app = express();
const port = process.env.PORT || 3000;

let lastQr = null; 
let gmail;
let isClientReady = false; // משתנה לבדיקת מוכנות הבוט
const MY_NUMBER = '972542501176@c.us';

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

// --- ממשק Web ---
app.get('/', (req, res) => {
    res.send(`<div style="font-family:sans-serif;text-align:center;padding:50px;direction:rtl;">
        <h1>מערכת WhatsApp-Gmail</h1>
        <p>סטטוס וואטסאפ: ${isClientReady ? '✅ מחובר' : '⏳ ממתין לחיבור'}</p>
        <a href="/qr" style="padding:10px;background:#25D366;color:white;text-decoration:none;">סריקת QR</a> | 
        <a href="/auth/google" style="padding:10px;background:#4285F4;color:white;text-decoration:none;">חיבור גוגל</a>
    </div>`);
});

app.get('/qr', async (req, res) => {
    if (!lastQr) return res.send('<h1>אין QR - המכשיר מחובר או בטעינה.</h1>');
    const code = await qrcode.toDataURL(lastQr);
    res.send(`<div style="text-align:center;"><img src="${code}" /><script>setTimeout(()=>location.reload(),10000);</script></div>`);
});

app.get('/auth/google', (req, res) => {
    res.redirect(oauth2Client.generateAuthUrl({ access_type: 'offline', scope: ['https://www.googleapis.com/auth/gmail.modify'], prompt: 'consent' }));
});

app.get('/oauth2callback', async (req, res) => {
    const { tokens } = await oauth2Client.getToken(req.query.code);
    const Token = mongoose.models.Token || mongoose.model('Token', new mongoose.Schema({ userId: String, tokens: Object }));
    await Token.findOneAndUpdate({ userId: 'primary' }, { tokens }, { upsert: true });
    oauth2Client.setCredentials(tokens);
    gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    res.send('<h1>✅ גוגל מחובר!</h1>');
});

// --- אתחול והגנות ---
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: './sessions' }),
    puppeteer: {
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
    }
});

client.on('qr', qr => { lastQr = qr; isClientReady = false; });
client.on('ready', () => { 
    lastQr = null; 
    isClientReady = true; 
    console.log('🚀 WhatsApp is READY!'); 
});
client.on('disconnected', () => { isClientReady = false; });

async function initializeSystem() {
    await mongoose.connect(process.env.MONGODB_URI);
    const Token = mongoose.models.Token || mongoose.model('Token', new mongoose.Schema({ userId: String, tokens: Object }));
    const storedToken = await Token.findOne({ userId: 'primary' });
    if (storedToken) {
        oauth2Client.setCredentials(storedToken.tokens);
        gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    }
    client.initialize();
}

app.listen(port, "0.0.0.0", () => {
    console.log(`🚀 Server on ${port}`);
    initializeSystem();
});

// --- סנכרון עם הגנה משגיאות ---
setInterval(async () => {
    if (!gmail || !isClientReady) {
        console.log('⏳ ממתין לחיבור גוגל וואטסאפ...');
        return;
    }
    try {
        const res = await gmail.users.messages.list({ userId: 'me', q: 'is:unread', maxResults: 5 });
        if (res.data.messages) {
            for (const msgInfo of res.data.messages) {
                const msg = await gmail.users.messages.get({ userId: 'me', id: msgInfo.id });
                const subject = msg.data.payload.headers.find(h => h.name === 'Subject')?.value || 'ללא נושא';
                const from = msg.data.payload.headers.find(h => h.name === 'From')?.value || 'לא ידוע';

                try {
                    // הוספת בדיקה: האם הדפדפן עדיין חי?
                    await client.sendMessage(MY_NUMBER, `📬 *מייל חדש!*\nמאת: ${from}\nנושא: ${subject}`);
                    
                    await gmail.users.messages.modify({
                        userId: 'me', id: msgInfo.id,
                        resource: { removeLabelIds: ['UNREAD'] }
                    });
                    console.log(`✅ נשלח: ${subject}`);
                } catch (sendErr) {
                    console.error('❌ תקלה בשליחה (Frame detached). מנסה לאתחל דפדפן...');
                    // אם יש שגיאת Frame, נאלץ את הבוט להתחבר מחדש
                    process.exit(1); // Railway יפעיל את השרת מחדש אוטומטית
                }
            }
        }
    } catch (err) { console.error('Sync Error:', err); }
}, 60000);
