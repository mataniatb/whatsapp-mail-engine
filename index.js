const { Client, LocalAuth } = require('whatsapp-web.js');
const mongoose = require('mongoose');
const { google } = require('googleapis');
const express = require('express');
const qrcode = require('qrcode');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000; // מוגדר ל-3000 לפי בקשתך

let lastQr = null; 
let gmail;
const MY_NUMBER = '972542501176@c.us'; // המספר שלך

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

// --- ממשק ניהול (Web) ---

app.get('/', (req, res) => {
    res.send(`
        <div style="font-family: sans-serif; text-align: center; padding: 50px; direction: rtl;">
            <h1>מערכת WhatsApp-Gmail פעילה</h1>
            <p>השרת מאזין בפורט: ${port}</p>
            <div style="margin-top: 20px;">
                <a href="/qr" style="padding: 15px 25px; background: #25D366; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">1. סרוק QR לוואטסאפ</a>
            </div>
            <div style="margin-top: 20px;">
                <a href="/auth/google" style="padding: 15px 25px; background: #4285F4; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">2. חבר חשבון גוגל</a>
            </div>
        </div>
    `);
});

app.get('/qr', async (req, res) => {
    if (!lastQr) {
        return res.send('<h1 style="text-align:center;">הבוט מחובר או שהקוד טרם נוצר. רענן בעוד כמה שניות.</h1>');
    }
    const code = await qrcode.toDataURL(lastQr);
    res.send(`
        <div style="text-align:center; padding:20px; font-family:sans-serif;">
            <h2>סרוק את הקוד ב-Linked Devices בוואטסאפ:</h2>
            <img src="${code}" style="border: 5px solid #25D366; border-radius: 10px;" />
            <p>הדף מתרענן כל 10 שניות...</p>
            <script>setTimeout(() => location.reload(), 10000);</script>
        </div>
    `);
});

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
        
        const Token = mongoose.models.Token || mongoose.model('Token', new mongoose.Schema({ userId: String, tokens: Object }));
        await Token.findOneAndUpdate({ userId: 'primary' }, { tokens }, { upsert: true });
        
        oauth2Client.setCredentials(tokens);
        gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        res.send('<h1 style="text-align:center; color:green;">✅ החיבור לגוגל הצליח!</h1>');
    } catch (e) {
        console.error('Google Auth Error:', e);
        res.status(500).send('שגיאה בחיבור לגוגל');
    }
});

// --- אתחול השרת והמערכות ---

app.listen(port, "0.0.0.0", () => {
    console.log(`🚀 Server live on port ${port}`);
    initializeSystem();
});

async function initializeSystem() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ MongoDB Connected');

        // טעינת טוקנים של גוגל אם קיימים
        const Token = mongoose.models.Token || mongoose.model('Token', new mongoose.Schema({ userId: String, tokens: Object }));
        const storedToken = await Token.findOne({ userId: 'primary' });
        if (storedToken) {
            oauth2Client.setCredentials(storedToken.tokens);
            gmail = google.gmail({ version: 'v1', auth: oauth2Client });
            console.log('✅ Google Auth Restored');
        }

        const client = new Client({
            authStrategy: new LocalAuth({
                dataPath: './sessions' // שמירת החיבור בתיקייה מקומית בשרת
            }),
            puppeteer: {
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--single-process', '--no-zygote']
            }
        });

        client.on('qr', qr => {
            lastQr = qr;
            console.log('⚡ QR Code Generated');
        });

        client.on('ready', () => {
            lastQr = null;
            console.log('🚀 WhatsApp is READY!');
            startEmailSync(client);
        });

        client.on('authenticated', () => {
            console.log('✅ WhatsApp Authenticated and Session Saved');
        });

        client.on('auth_failure', msg => {
            console.error('❌ Auth Failure:', msg);
        });

        await client.initialize();
    } catch (err) {
        console.error('Initialization Error:', err);
    }
}

// --- מנוע סנכרון המיילים ---

function startEmailSync(whatsappClient) {
    console.log('📧 Email sync engine started (1 minute interval)');
    
    setInterval(async () => {
        if (!gmail) return;
        
        try {
            console.log('🔍 Checking for unread emails...');
            const res = await gmail.users.messages.list({ userId: 'me', q: 'is:unread', maxResults: 5 });
            
            if (res.data.messages) {
                console.log(`📩 Found ${res.data.messages.length} new messages.`);
                
                for (const msgInfo of res.data.messages) {
                    const msg = await gmail.users.messages.get({ userId: 'me', id: msgInfo.id });
                    
                    const subject = msg.data.payload.headers.find(h => h.name === 'Subject')?.value || 'ללא נושא';
                    const from = msg.data.payload.headers.find(h => h.name === 'From')?.value || 'שולח לא ידוע';
                    const snippet = msg.data.snippet;

                    // שליחה לוואטסאפ
                    const messageBody = `📬 *מייל חדש הגיע!*\n\n*מאת:* ${from}\n*נושא:* ${subject}\n*תוכן:* ${snippet}\n\n_נשלח אוטומטית מהבוט שלך_`;
                    await whatsappClient.sendMessage(MY_NUMBER, messageBody);
                    
                    // סימון כנקרא כדי לא לשלוח שוב
                    await gmail.users.messages.modify({
                        userId: 'me',
                        id: msgInfo.id,
                        resource: { removeLabelIds: ['UNREAD'] }
                    });
                    console.log(`✅ Forwarded and marked as read: ${subject}`);
                }
            }
        } catch (err) {
            console.error('Sync Error:', err);
        }
    }, 60000); // בדיקה כל דקה אחת
}
