const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// הגדרת הלקוח עם התאמות לסביבת שרת (Railway)
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        // הנתיב בו מותקן הכרום בתוך ה-Dockerfile שלנו
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
        // ארגומנטים הכרחיים להרצה בתוך Container
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ],
    }
});

// יצירת קוד ה-QR בתצורה קטנה שמתאימה ללוגים
client.on('qr', (qr) => {
    console.log('--- סרוק את קוד ה-QR הבא כדי להתחבר ---');
    qrcode.generate(qr, { small: true });
});

// הודעה כשהחיבור מצליח
client.on('ready', () => {
    console.log('המנוע מחובר לוואטסאפ בהצלחה!');
});

// טיפול בשגיאות בסיסי
client.on('auth_failure', msg => {
    console.error('שגיאת התחברות:', msg);
});

client.initialize();
