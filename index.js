const { Client, LocalAuth } = require('whatsapp-web.js');
const mongoose = require('mongoose');
const { google } = require('googleapis');
const express = require('express');
const qrcode = require('qrcode');

const app = express();
const port = process.env.PORT || 3000;

let lastQr = null; 
let gmail;
let whatsappStatus = 'DISCONNECTED'; 
const MY_NUMBER = '972542501176@c.us';

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

// --- ממשק ניהול משופר עם כפתור בדיקה ---
app.get('/', (req, res) => {
    const statusColor = whatsappStatus === 'CONNECTED' ? '#25D366' : (whatsappStatus === 'QR_READY' ? '#FFAC33' : '#FF2E2E');
    const gmailStatus = gmail ? '✅ מחובר' : '❌ לא מחובר';
    
    res.send(`
        <div style="font-family: 'Segoe UI', sans-serif; text-align: center; padding: 40px; direction: rtl; background-color: #f0f2f5; min-height: 100vh;">
            <div style="background: white; padding: 30px; border-radius: 15px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); max-width: 500px; margin: 0 auto;">
                <h1 style="color: #075E54;">מרכז השליטה</h1>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                
                <div style="margin: 15px 0; padding: 15px; border-radius: 10px; background: #f9f9f9; border-right: 5px solid ${statusColor};">
                    <h3 style="margin: 0 0 5px 0;">וואטסאפ</h3>
                    <span style="font-weight: bold; color: ${statusColor};">${whatsappStatus === 'CONNECTED' ? 'מחובר ופעיל' : (whatsappStatus === 'QR_READY' ? 'ממתין לסריקה' : 'מנותק')}</span>
                </div>

                <div style="margin: 15px 0; padding: 15px; border-radius: 10px; background: #f9f9f9; border-right: 5px solid ${gmail ? '#4285F4' : '#FF2E2E'};">
                    <h3 style="margin: 0 0 5px 0;">גוגל</h3>
                    <span style="font-weight: bold;">${gmailStatus}</span>
                </div>

                <div style="margin-top: 30px;">
                    ${whatsappStatus === 'CONNECTED' ? 
                        `<a href="/test-whatsapp" style="display: block; margin-bottom: 10px; padding: 15px; background: #075E54; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">📩 שלח הודעת בדיקה לוואטסאפ</a>` : ''
                    }
                    <a href="/qr" style="display: block; margin-bottom: 10px; padding: 12px; background: #25D366; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">🔗 לסריקת QR</a>
                    <a href="/auth/google" style="display: block; padding: 12px; background: #4285F4; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">🔑 חיבור גוגל</a>
                </div>
            </div>
            <script>setTimeout(() => { if(window.location.pathname === "/") location.reload(); }, 20000);</script>
        </div>
    `);
});

// נתיב לשליחת הודעת בדיקה
app.get('/test-whatsapp', async (req, res) => {
    if (whatsappStatus !== 'CONNECTED') return res.send('הוואטסאפ לא מחובר.');
    try {
        await client.sendMessage(MY_NUMBER, "🔔 בדיקת מערכת: הבוט שלך מחובר ומסוגל לשלוח הודעות!");
        res.send('<h1 style="text-align:center; color:green; direction:rtl;">✅ הודעת הבדיקה נשלחה!</h1><br><a href="/">חזור</a>');
    } catch (e) {
        console.error('Test Send Error:', e);
        res.send('<h1 style="text-align:center; color:red; direction:rtl;">❌ השליחה נכשלה. השרת יבצע אתחול.</h1>');
        process.exit(1);
    }
});

// --- שאר הפונקציות (QR, Auth, Gmail) ---
app.get('/qr', async (req, res) => {
    if (!lastQr) return res.send('טוען QR...');
    const code = await qrcode.toDataURL(lastQr);
    res.send(`<div style="text-align:center; padding:50px;"><img src="${code}" /><br><a href="/">חזור</a></div>`);
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
    res.redirect('/');
});

// --- אתחול הבוט ---
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: './sessions' }),
    puppeteer: {
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage', // פותר את רוב בעיות הזיכרון ב-Railway
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--single-process' // גורם לכל הדפדפן לרוץ כתהליך אחד חסכוני
        ]
    }
});

client.on('qr', qr => { lastQr = qr; whatsappStatus = 'QR_READY'; });
client.on('ready', () => { lastQr = null; whatsappStatus = 'CONNECTED'; console.log('🚀 READY'); });
client.on('disconnected', () => { whatsappStatus = 'DISCONNECTED'; });

async function init() {
    await mongoose.connect(process.env.MONGODB_URI);
    const Token = mongoose.models.Token || mongoose.model('Token', new mongoose.Schema({ userId: String, tokens: Object }));
    const stored = await Token.findOne({ userId: 'primary' });
    if (stored) {
        oauth2Client.setCredentials(stored.tokens);
        gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    }
    client.initialize();
}

app.listen(port, "0.0.0.0", () => {
    console.log(`Live on ${port}`);
    init();
});

// --- סנכרון מיילים ---
setInterval(async () => {
    if (!gmail || whatsappStatus !== 'CONNECTED') return;
    try {
        const res = await gmail.users.messages.list({ userId: 'me', q: 'is:unread', maxResults: 3 });
        if (res.data.messages) {
            for (const m of res.data.messages) {
                const full = await gmail.users.messages.get({ userId: 'me', id: m.id });
                const subject = full.data.payload.headers.find(h => h.name === 'Subject')?.value || 'ללא נושא';
                const from = full.data.payload.headers.find(h => h.name === 'From')?.value || 'לא ידוע';

                try {
                    await client.sendMessage(MY_NUMBER, `📬 *מייל חדש!*\n*מאת:* ${from}\n*נושא:* ${subject}`);
                    await gmail.users.messages.modify({ userId: 'me', id: m.id, resource: { removeLabelIds: ['UNREAD'] } });
                } catch (e) { process.exit(1); }
            }
        }
    } catch (e) { console.error('Sync Error', e); }
}, 60000);
