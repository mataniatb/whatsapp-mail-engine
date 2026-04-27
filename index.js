const { Client, RemoteAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const { MongoStore } = require('wwebjs-mongo');

/**
 * הגדרות וחיבורים
 */
const uri = process.env.MONGODB_URI;

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

/**
 * הפעלת הבוט
 */
mongoose.connect(uri).then(() => {
    console.log('✅ Connected to MongoDB Atlas');
    
    const store = new MongoStore({ mongoose: mongoose });

    const client = new Client({
        authStrategy: new RemoteAuth({
            store: store,
            backupSyncIntervalMs: 300000
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

    // פתרון ה-QR: מדפיס לינק ישיר לתמונה שניתן לסרוק בקלות
    client.on('qr', (qr) => {
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(qr)}`;
        
        console.log('\n\n' + '='.repeat(50));
        console.log('📢 לינק לסריקה מהירה - פתח בדפדפן:');
        console.log(qrUrl);
        console.log('='.repeat(50) + '\n\n');
        
        // משאיר את ה-ASCII לגיבוי בלבד
        qrcode.generate(qr, { small: true });
    });

    client.on('ready', () => {
        console.log('🚀 הבוט מחובר ומוכן להעברת הודעות!');
    });

    client.on('remote_session_saved', () => {
        console.log('💾 החיבור נשמר בענן!');
    });

    client.on('message', async (msg) => {
        try {
            const contact = await msg.getContact();
            const senderName = contact.pushname || contact.number;
            
            console.log(`📩 הודעה מ-${senderName}. מעביר...`);

            await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: process.env.DESTINATION_EMAIL,
                subject: `וואטסאפ מ-${senderName}`,
                text: `תוכן: ${msg.body}\nטלפון: ${contact.number}`
            });
            console.log('📧 נשלח בהצלחה.');
        } catch (err) {
            console.error('❌ שגיאה בשליחה:', err);
        }
    });

    client.initialize();

}).catch(err => console.error('❌ שגיאת מונגו:', err));
