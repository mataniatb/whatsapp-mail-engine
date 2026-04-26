const { Client, RemoteAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const { MongoStore } = require('wwebjs-mongo');

// 1. הגדרת שירות המייל (Gmail)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// 2. חיבור למסד הנתונים במונגו
mongoose.connect(process.env.MONGODB_URI).then(() => {
    console.log('מחובר ל-MongoDB Atlas בהצלחה!');
    
    const store = new MongoStore({ mongoose: mongoose });

    // 3. הגדרת לקוח הוואטסאפ עם RemoteAuth
    const client = new Client({
        authStrategy: new RemoteAuth({
            store: store,
            backupSyncIntervalMs: 300000 // גיבוי כל 5 דקות
        }),
        puppeteer: {
            executablePath: '/usr/bin/chromium',
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        }
    });

    // הצגת QR לסריקה (רק בפעם הראשונה)
    client.on('qr', (qr) => {
        console.log('סרוק את הקוד בטלפון:');
        qrcode.generate(qr, { small: true });
    });

    // אישור שה-Session נשמר בענן
    client.on('remote_session_saved', () => {
        console.log('החיבור נשמר ב-MongoDB! לא תצטרך לסרוק שוב.');
    });

    client.on('ready', () => {
        console.log('הבוט באוויר ומוכן להעביר הודעות!');
    });

    // 4. לוגיקת העברת הודעות למייל
    client.on('message', async (msg) => {
        try {
            const contact = await msg.getContact();
            const senderName = contact.pushname || contact.number;

            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: process.env.DESTINATION_EMAIL,
                subject: `וואטסאפ מ-${senderName}`,
                text: `תוכן ההודעה: ${msg.body}\nמאת: ${contact.number}`
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
