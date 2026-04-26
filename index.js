const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        executablePath: '/usr/bin/chromium',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    }
});

client.on('qr', (qr) => {
    console.log('סרוק את קוד ה-QR הבא:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('המנוע מחובר לוואטסאפ בהצלחה!');
});

client.initialize();
