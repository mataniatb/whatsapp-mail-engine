const { Client, RemoteAuth } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const { google } = require('googleapis');
const express = require('express');
const qrcode = require('qrcode-terminal');
const { simpleParser } = require('mailparser');

const app = express();
const port = process.env.PORT || 3000;

// --- סכימות בסיסיות למסד הנתונים ---
const TokenSchema = new mongoose.Schema({ userId: String, tokens: Object });
const MsgMapSchema = new mongoose.Schema({ waMsgId: String, threadId: String, fromEmail: String, subject: String });
const Token = mongoose.model('Token', TokenSchema);
const MsgMap = mongoose.model('MsgMap', MsgMapSchema);

// --- הגדרות Google OAuth2 ---
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

// --- פונקציה לשליחת תשובה למייל ---
async function sendGmailReply(auth, threadId, toEmail, subject, text) {
    const gmail = google.gmail({ version: 'v1', auth });
    const rawMsg = Buffer.from(
        `To: ${toEmail}\r\n` +
        `Subject: Re: ${subject}\r\n` +
        `In-Reply-To: ${threadId}\r\n` +
        `References: ${threadId}\r\n\r\n` +
        `${text}`
    ).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    await gmail.users.messages.send({ userId: 'me', requestBody: { raw: rawMsg, threadId: threadId } });
}

// --- הפעלת המערכת ---
mongoose.connect(process.env.MONGODB_URI).then(async () => {
    console.log('✅ מחובר ל-MongoDB Atlas');

    const client = new Client({
        authStrategy: new RemoteAuth({
            store: new MongoStore({ mongoose: mongoose }),
            backupSyncIntervalMs: 300000
        }),
        puppeteer: {
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        }
    });

    // --- שרת Express לאישור גוגל ---
    app.get('/auth/google', (req, res) => {
        const url = oauth2Client.generateAuthUrl({ access_type: 'offline', scope: ['https://www.googleapis.com/auth/gmail.modify'], prompt: 'consent' });
        res.redirect(url);
    });

    app.get('/oauth2callback', async (req, res) => {
        const { code } = req.query;
        const { tokens } = await oauth2Client.getToken(code);
        await Token.findOneAndUpdate({ userId: 'primary' }, { tokens }, { upsert: true });
        oauth2Client.setCredentials(tokens);
        res.send('✅ החיבור לגוגל הצליח! המערכת מתחילה לסרוק מיילים.');
        startEmailPolling();
    });

    // --- לוגיקת סריקת מיילים (כל דקה) ---
    async function startEmailPolling() {
        setInterval(async () => {
            try {
                const userToken = await Token.findOne({ userId: 'primary' });
                if (!userToken) return;
                oauth2Client.setCredentials(userToken.tokens);
                const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

                const res = await gmail.users.messages.list({ userId: 'me', q: 'is:unread' });
                if (res.data.messages) {
                    for (let m of res.data.messages) {
                        const msg = await gmail.users.messages.get({ userId: 'me', id: m.id, format: 'raw' });
                        const parsed = await simpleParser(Buffer.from(msg.data.raw, 'base64'));
                        
                        // שליחה לווצאפ (שלח למספר שלך)
                        const waMsg = await client.sendMessage(process.env.MY_PHONE_NUMBER + '@c.us', 
                            `📧 *מייל חדש!*\n*מאת:* ${parsed.from.text}\n*נושא:* ${parsed.subject}\n\n${parsed.text}`);
                        
                        // שמירת המיפוי ב-DB
                        await new MsgMap({ waMsgId: waMsg.id._serialized, threadId: m.threadId, fromEmail: parsed.from.value[0].address, subject: parsed.subject }).save();
                        
                        // סימון כנקרא
                        await gmail.users.messages.batchModify({ userId: 'me', ids: [m.id], removeLabelIds: ['UNREAD'] });
                    }
                }
            } catch (e) { console.error('שגיאה בסריקת מיילים:', e); }
        }, 60000);
    }

    // --- לוגיקת תגובה מהווצאפ ---
    client.on('message', async (msg) => {
        if (msg.hasQuotedMsg) {
            const quoted = await msg.getQuotedMessage();
            const map = await MsgMap.findOne({ waMsgId: quoted.id._serialized });
            
            if (map) {
                const userToken = await Token.findOne({ userId: 'primary' });
                oauth2Client.setCredentials(userToken.tokens);
                await sendGmailReply(oauth2Client, map.threadId, map.fromEmail, map.subject, msg.body);
                msg.reply('✅ התגובה נשלחה בהצלחה למייל.');
            }
        }
    });

    client.on('qr', qr => qrcode.generate(qr, { small: true }));
    client.on('ready', () => {
        console.log('🚀 הבוט באוויר!');
        startEmailPolling();
    });

    client.initialize();
    app.listen(port, () => console.log(`Server running on port ${port}`));
});
