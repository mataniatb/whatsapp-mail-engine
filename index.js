const { Client, LocalAuth } = require('whatsapp-web.js');

const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: './.wwebjs_auth'
    }),
    puppeteer: {
        executablePath: '/usr/bin/chromium',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    }
});

// במקום לצייר ריבועים בטרמינל, ניצור לינק לתמונה
client.on('qr', (qr) => {
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`;
    console.log('-----------------------------------------------------');
    console.log('לחץ על הלינק הבא כדי לראות את קוד ה-QR ולסרוק אותו:');
    console.log(qrImageUrl);
    console.log('-----------------------------------------------------');
});

client.on('ready', () => {
    console.log('המנוע מחובר לוואטסאפ בהצלחה!');
});

client.initialize();
