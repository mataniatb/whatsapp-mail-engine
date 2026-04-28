const { Client, RemoteAuth } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const { google } = require('googleapis');
const express = require('express');
const qrcode = require('qrcode-terminal');

const app = express();
const port = process.env.PORT || 3000;

// 1. הפעלת השרת מיד - כדי למנוע 502 מ-Railway
app.get('/health', (req, res) => res.send('OK'));
app.get('/', (req, res) => res.send('System is running, check WhatsApp logs.'));

const server = app.listen(port, "0.0.0.0", () => {
    console.log(`✅ [Step 1] השרת נפתח בפורט ${port}. Railway מרוצה.`);
    startSystem(); // מתחילים את כל השאר רק אחרי שהפורט פתוח
});

async function startSystem() {
    try {
        console.log('🔄 [Step 2] מתחבר ל-MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ MongoDB מחובר.');

        const client = new Client({
            authStrategy: new RemoteAuth({
                store: new MongoStore({ mongoose: mongoose }),
                backupSyncIntervalMs: 300000
            }),
            puppeteer: {
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
                args: [
                    '--no-sandbox', 
                    '--disable-setuid-sandbox', 
                    '--disable-dev-shm-usage',
                    '--disable-gpu', // חוסך זיכרון
                    '--single-process' // קריטי לסביבות עם מעט זיכרון
                ]
            }
        });

        client.on('qr', qr => {
            console.log('📢 סרוק את ה-QR שנוצר כאן:');
            qrcode.generate(qr, { small: true });
        });

        client.on('ready', () => console.log('🚀 הבוט מחובר ומוכן לעבודה!'));
        
        console.log('🔄 [Step 3] מאתחל את הוואטסאפ (זה עשוי לקחת דקה)...');
        client.initialize();

    } catch (err) {
        console.error('💥 שגיאה קריטית בתהליך האתחול:', err);
    }
}
