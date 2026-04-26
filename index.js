const { Client, RemoteAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const { MongoStore } = require('wwebjs-mongo');

/**
 * הגדרות וחיבורים בסיסיים
 */
const uri = process.env.MONGODB_URI;

// הגדרת המייל לשליחה
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS // כאן צריכה להיות סיסמת האפליקציה בת 16 התווים
    }
});

/**
 * הפעלת הבוט רק לאחר חיבור מוצלח למסד הנתונים
 */
mongoose.connect(uri).then(() => {
    console.log('✅ Connected to MongoDB Atlas - Starting WhatsApp Client...');
    
    const store = new MongoStore({ mongoose: mongoose });

    const client = new Client({
        authStrategy: new RemoteAuth({
            store: store,
            backupSyncIntervalMs: 300000 // סנכרון לענן כל 5 דקות
        }),
        puppeteer: {
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
            handleSIGINT: false,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ],
        }
    });

    // הצגת ה-QR לסריקה בלוגים של Railway
    client.on('qr', (qr) => {
        console.log('📢 סרוק את הקוד הבא באפליקציית וואטסאפ:');
        qrcode.generate(qr, { small: true });
    });

    // הודעה כשהבוט מוכן
    client.on('ready', () => {
        console.log('🚀 הבוט מחובר ומוכן להעברת הודעות!');
    });

    // שמירת הסשן בענן - קורה אחרי הסריקה הראשונה
    client.on('remote_session_saved', () => {
        console.log('💾 החיבור נשמר בבסיס הנתונים! בפעם הבאה הוא יתחבר אוטומטית.');
    });

    // טיפול בשגיאות חיבור
    client.on('auth_failure', msg => {
        console.error('❌ שגיאת התחברות:', msg);
    });

    /**
     * לוגיקת העברת ההודעות
     */
    client.on('message', async (msg) => {
        try {
            // קבלת פרטי השולח
            const contact = await msg.getContact();
            const senderName = contact.pushname || contact.number;
            const from = msg.from.includes('@g.us') ? 'קבוצה' : 'פרטי';

            console.log(`📩 הודעה חדשה מ-${senderName}. מעביר למייל...`);

            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: process.env.DESTINATION_EMAIL,
                subject: `וואטסאפ מ-${senderName} (${from})`,
                text: `תוכן ההודעה:\n${msg.body}\n\nמספר טלפון: ${contact.number}\nזמן: ${new Date().toLocaleString('he-IL')}`
            };

            await transporter.sendMail(mailOptions);
            console.log('📧 המייל נשלח בהצלחה.');
        } catch (err) {
            console.error('❌ שגיאה בתהליך העברת ההודעה:', err);
        }
    });

    client.initialize();

}).catch(err => {
    console.error('❌ שגיאה קריטית בחיבור למונגו:', err);
});
