const express = require('express');
const app = express();

// Railway מושך את הפורט מהמשתנה PORT, ואם לא קיים משתמש ב-3000
const port = process.env.PORT || 3000;

// נתיב הבדיקה הקריטי
app.get('/health', (req, res) => {
    console.log('✅ Railway checked health');
    res.status(200).send('Server is alive and responding!');
});

// נתיב ברירת מחדל
app.get('/', (req, res) => {
    res.send('<h1>System is Online</h1><p>The 502 is gone.</p>');
});

// האזנה לפורט - שימוש ב-0.0.0.0 קריטי ב-Railway
app.listen(port, "0.0.0.0", () => {
    console.log(`🚀 Startup Successful! Listening on port ${port}`);
});
