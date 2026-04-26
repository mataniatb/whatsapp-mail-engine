const { Client, RemoteAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const { MongoStore } = require('wwebjs-mongo');

// --- 1. בדיקת סביבה (דיבג) ---
console.log("--- בדיקת משתני סביבה ב-Railway ---");
// אנחנו מדפיסים רק אם המשתנה קיים או לא, בלי לחשוף את התוכן מטעמי אבטחה
console.log("MONGODB_URI מוגדר?", process.env.MONGODB_URI ? "✅ כן" : "❌ לא");
console.log("EMAIL_USER מוגדר?", process.env.EMAIL_USER ? "✅ כן" : "❌ לא");
console.log("---------------------------------");

const uri = process.env.MONGODB_URI;

// אם המשתנה לא קיים, נעצור כאן עם הסבר ברור בלוגים
if (!uri) {
    console.error("CRITICAL ERROR: המשתנה MONGODB_URI לא נמצא. וודא שהגדרת אותו ב-Variables של ה-Service ב-Railway.");
    process.exit(1);
}

// --- 2. הגדרת שירות המייל ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// --- 3. חיבור ל-MongoDB והפעלת הבוט ---
mongoose.connect(uri).then(() => {
    console.log('Connected to MongoDB Atlas successfully!');
    
    const store = new MongoStore({ mongoose: mongoose });

    const client = new Client({
        authStrategy: new RemoteAuth({
            store: store,
            backupSyncIntervalMs: 300000 // גיבוי לענן כל 5 דקות
        }),
        puppeteer: {
            executablePath: '/usr/bin/chromium',
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage'
            ],
        }
    });

    // אירוע QR
    client.on('qr', (qr) => {
        console.log('סרוק את הקוד הבא בוואטסאפ:');
        qrcode.generate(qr, { small: true });
    });

    // אירוע מוכנות
    client.on('ready', () => {
        console.log('הבוט מוכן ומחובר!');
    });

    // אירוע שמירת Session בענן
    client.on('remote_session_saved', () => {
        console.log('החיבור נשמר ב-MongoDB! מעכשיו הבוט יתחבר אוטומטית.');
    });

    // אירוע קבלת הודעה והעברה למייל
    client.on('message', async (msg) => {
        try {
            const contact = await msg.getContact();
            const senderName = contact.pushname || contact.number;

            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: process.env.DESTINATION_EMAIL,
                subject: `הודעת וואטסאפ מ-${senderName}`,
                text: `הודעה: ${msg.body}\nמספר טלפון: ${contact.number}`
            };

            await transporter.sendMail(mailOptions);
            console.log(`מייל נשלח עבור הודעה מ-${senderName}`);
        } catch (err) {
            console.error('שגיאה בשליחת המייל:', err);
        }
    });

    client.initialize();

}).catch(err => {
    console.error('שגיאה קריטית בחיבור ל-MongoDB:', err);
});
