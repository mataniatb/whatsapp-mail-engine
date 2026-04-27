const { Client, RemoteAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const { MongoStore } = require('wwebjs-mongo');

/**
 * הגדרות בסיסיות מתוך המשתנים ב-Railway
 */
const uri = process.env.MONGODB_URI;

/**
 * פונקציה לשליחת מייל
 */
async function sendToEmail(senderName, senderNumber, content) {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: process.env.DESTINATION_EMAIL,
        subject: `הודעה חדשה מ-${senderName}`,
        text: `תוכן ההודעה:\n${content}\n\nמספר טלפון: ${senderNumber}\nזמן: ${new Date().toLocaleString('he-IL')}`
    };

    return transporter.sendMail(mailOptions);
}

/**
 * חיבור למסד הנתונים והפעלת הבוט
 */
mongoose.connect(uri).then(() => {
    console.log('✅ מחובר ל-MongoDB Atlas. מפעיל את הבוט...');
    
    const store = new MongoStore({ mongoose: mongoose });

    const client = new Client({
        authStrategy: new RemoteAuth({
            store: store,
            backupSyncIntervalMs: 300000 // סנכרון לענן כל 5 דקות
        }),
        puppeteer: {
            // נתיב הדפדפן ב-Railway
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
            handleSIGINT: false,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', // חשוב מאוד למניעת קריסות בשרת
                '--disable-extensions',
                '--no-zygote'
            ],
        }
    });

    // יצירת QR לסריקה - כולל לינק חיצוני לפתרון בעיות תצוגה
    client.on('qr', (qr) => {
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(qr)}`;
        
        console.log('\n' + '='.repeat(60));
        console.log('📢 שלב התקנה: סרוק את הקוד כדי לחבר את הווצאפ');
        console.log('אם הקוד למטה לא קריא, פתח את הלינק הבא בדפדפן:');
        console.log(qrUrl);
        console.log('='.repeat(60) + '\n');
        
        qrcode.generate(qr, { small: true });
    });

    // אירוע התחברות מוצלחת
    client.on('ready', () => {
        console.log('🚀 הבוט מחובר ומוכן להעברת הודעות!');
    });

    // אירוע שמירת סשן
    client.on('remote_session_saved', () => {
        console.log('💾 החיבור נשמר בענן בהצלחה! לא תצטרך לסרוק שוב.');
    });

    // טיפול בהודעות נכנסות
    client.on('message', async (msg) => {
        try {
            const contact = await msg.getContact();
            const senderName = contact.pushname || contact.number;
            
            console.log(`📩 הודעה מ-${senderName}. מעביר למייל...`);
            
            await sendToEmail(senderName, contact.number, msg.body);
            console.log('📧 המייל נשלח בהצלחה.');
        } catch (err) {
            console.error('❌ שגיאה בתהליך השליחה:', err);
        }
    });

    client.initialize();

}).catch(err => {
    console.error('❌ שגיאה קריטית בחיבור למונגו:', err);
});
