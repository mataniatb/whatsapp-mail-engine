const { Client, RemoteAuth } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const { google } = require('googleapis');
const express = require('express');
const qrcode = require('qrcode'); 

const app = express();
const port = process.env.PORT || 3000;

let lastQr = null; 
let gmail;
const MY_NUMBER = '972542501176@c.us'; // המספר שלך

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

// --- ממשק Web ---
app.get('/', (req, res) => {
    res.send(`
        <div style="font-family: sans-serif; text-align: center; padding: 50px; direction: rtl;">
            <h1>מערכת WhatsApp-Gmail פעילה</h1>
            <div style="margin-top: 20px;">
                <a href="/qr" style="padding: 15px 25px; background: #25D366; color: white; text-decoration: none; border-radius: 8px;">1. סריקת QR לוואטסאפ</a>
            </div>
            <div style="margin-top: 20px;">
                <a href="/auth/google" style="padding: 15px 25px; background: #4285F4; color: white; text-decoration: none; border-radius: 8px;">2. חיבור חשבון גוגל</a>
            </div>
        </div>
    `);
});

app.get('/qr', async (req, res) => {
    if (!lastQr) return res.send('<h1 style="text-align:center;">הקוד טרם נוצר. רענן בעוד כמה שניות.</h1>');
    const code = await qrcode.toDataURL(lastQr);
    res.send(`<div style="text-align:center; padding:20px;"><h2>סרוק לחיבור:</h2><img src="${code}" /><script>setTimeout(()=>location.reload(),10000);</script></div>`);
});

app.get('/auth/google', (req, res) => {
    const url = oauth2Client.generateAuthUrl({ access_type: 'offline', scope: ['https://www.googleapis.com/auth/gmail.modify'], prompt: 'consent' });
    res.redirect(url);
});

app.get('/oauth2callback', async (req, res) => {
    try {
        const { code } = req.query;
        const { tokens } = await oauth2Client.getToken(code);
        const Token = mongoose.models.Token || mongoose.model('Token', new mongoose.Schema({ userId: String, tokens: Object }));
        await Token.findOneAndUpdate({ userId: 'primary' }, { tokens }, { upsert: true });
        oauth2Client.setCredentials(tokens);
        gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        res.send('<h1>✅ גוגל מחובר!</h1>');
    } catch (e) { res.status(500).send('Auth Error'); }
});

app.listen(port, "0.0.0.0", () => {
    console.log(`🚀 Server live on port ${port}`);
    initializeSystem();
});

// --- ליבת המערכת ---
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
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--single-process', '--no-zygote']
            }
        });

        client.on('qr', qr => { lastQr = qr; console.log('⚡ QR Generated'); });
        
        client.on('ready', () => { 
            lastQr = null; 
            console.log('🚀 WhatsApp Ready!'); 
            startEmailSync(client);
        });

        // מניעת קריסה בשגיאת אימות
        client.on('auth_failure', msg => console.error('❌ Auth failure:', msg));

        await client.initialize();
    } catch (err) { console.error('Init Error:', err); }
}

function startEmailSync(whatsappClient) {
    setInterval(async () => {
        if (!gmail) return;
        try {
            const res = await gmail.users.messages.list({ userId: 'me', q: 'is:unread', maxResults: 3 });
            if (res.data.messages) {
                for (const msgInfo of res.data.messages) {
                    const msg = await gmail.users.messages.get({ userId: 'me', id: msgInfo.id });
                    const subject = msg.data.payload.headers.find(h => h.name === 'Subject')?.value || 'ללא נושא';
                    const snippet = msg.data.snippet;

                    await whatsappClient.sendMessage(MY_NUMBER, `📬 *מייל חדש!*\n*נושא:* ${subject}\n*תוכן:* ${snippet}`);
                    
                    await gmail.users.messages.modify({
                        userId: 'me', id: msgInfo.id,
                        resource: { removeLabelIds: ['UNREAD'] }
                    });
                }
            }
        } catch (err) { console.error('Sync Error:', err); }
    }, 300000);
}
