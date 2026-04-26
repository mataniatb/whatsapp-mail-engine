const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const nodemailer = require('nodemailer');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// --- הגדרות נתיבים (עבור ה-Volume ב-Railway) ---
const storagePath = '/app/.wwebjs_auth';
const dbPath = path.join(storagePath, 'database.sqlite');

// --- הגדרת מסד הנתונים ---
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    // יצירת טבלה שתזכור איזה מייל שייך לאיזה מספר טלפון
    db.run(`CREATE TABLE IF NOT EXISTS conversations (
        whatsapp_id TEXT PRIMARY KEY, 
        last_email TEXT
    )`);
});

// פונקציות עזר למסד הנתונים
const saveConversation = (whatsappId, email) => {
    db.run("INSERT OR REPLACE INTO conversations (whatsapp_id, last_email) VALUES (?, ?)", [whatsappId, email]);
};

const getEmailByWhatsappId = (whatsappId) => {
    return new Promise((resolve) => {
        db.get("SELECT last_email FROM conversations WHERE whatsapp_id = ?", [whatsappId], (err, row) => {
            resolve(row ? row.last_email : null);
        });
    });
};

// --- הגדרת שירות המייל ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// --- הגדרת לקוח הוואטסאפ ---
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: storagePath }),
    puppeteer: {
        executablePath: '/usr/bin/chromium',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    }
});

// הצגת QR לסריקה
client.on('qr', (qr) => {
    console.log('סרוק את קוד ה-QR בטלפון:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('המערכת באוויר! מוכנה להעביר הודעות.');
});

// --- הלוגיקה המרכזית ---
client.on('message', async (msg) => {
    try {
        const contact = await msg.getContact();
        const whatsappId = contact.number;

        // בדיקה: האם זו תגובה (Reply) להודעה קודמת?
        if (msg.hasQuotedMsg) {
            const targetEmail = await getEmailByWhatsappId(whatsappId);
            const finalRecipient = targetEmail || process.env.DESTINATION_EMAIL;

            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: finalRecipient,
                subject: `תגובה בוואטסאפ מ-${contact.pushname || whatsappId}`,
                text: `תוכן התגובה: ${msg.body}\n\n(נשלח חזרה לכתובת: ${finalRecipient})`
            };

            await transporter.sendMail(mailOptions);
            console.log(`תגובה נשלחה חזרה למייל: ${finalRecipient}`);
        } 
        
        // הודעה רגילה (לא תגובה) - שולחים למייל הראשי ושומרים את הקשר במסד
        else {
            const defaultEmail = process.env.DESTINATION_EMAIL;
            
            // שומרים במסד שהמספר הזה קשור למייל הזה
            saveConversation(whatsappId, defaultEmail);

            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: defaultEmail,
                subject: `הודעה חדשה מ-${contact.pushname || whatsappId}`,
                text: `מספר טלפון: ${whatsappId}\nתוכן: ${msg.body}`
            };

            await transporter.sendMail(mailOptions);
            console.log(`הודעה חדשה הועברה למייל הראשי.`);
        }
    } catch (err) {
        console.error('שגיאה בתהליך:', err);
    }
});

client.initialize();
