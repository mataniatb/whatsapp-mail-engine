const { Client, RemoteAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const { MongoStore } = require('wwebjs-mongo');

// בדיקה: האם המשתנה הוגדר ב-Railway?
const uri = process.env.MONGODB_URI;

if (!uri) {
    console.error("CRITICAL ERROR: MONGODB_URI is missing in Railway Variables!");
    process.exit(1);
}

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// חיבור למונגו
mongoose.connect(uri).then(() => {
    console.log('Connected to MongoDB Atlas!');
    
    const store = new MongoStore({ mongoose: mongoose });

    const client = new Client({
        authStrategy: new RemoteAuth({
            store: store,
            backupSyncIntervalMs: 300000
        }),
        puppeteer: {
            executablePath: '/usr/bin/chromium',
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        }
    });

    client.on('qr', (qr) => {
        console.log('סרוק את ה-QR בטלפון:');
        qrcode.generate(qr, { small: true });
    });

    client.on('ready', () => console.log('WhatsApp Bot is READY!'));
    
    client.on('remote_session_saved', () => {
        console.log('Session saved to MongoDB successfully.');
    });

    client.on('message', async (msg) => {
        try {
            const contact = await msg.getContact();
            await transporter.sendMail({
                from: process.env.EMAIL_USER,
                to: process.env.DESTINATION_EMAIL,
                subject: `WhatsApp from ${contact.pushname || contact.number}`,
                text: msg.body
            });
            console.log('Email sent.');
        } catch (err) {
            console.error('Mail error:', err);
        }
    });

    client.initialize();
}).catch(err => {
    console.error('MongoDB connection error:', err);
});
