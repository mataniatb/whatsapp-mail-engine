const express = require('express');
const mongoose = require('mongoose');
const fs = require('fs');
const { execSync } = require('child_process');
const app = express();

const PORT = process.env.PORT || 3000;

async function runDiagnostics() {
    console.log('🔍 --- מתחיל סבב בדיקות מערכת מקיף ---');

    // 1. בדיקת משתני סביבה (Env Vars)
    const required = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'MONGODB_URI', 'MY_PHONE_NUMBER'];
    console.log('1️⃣ בודק משתני סביבה...');
    required.forEach(v => {
        if (!process.env[v]) console.error(`❌ חסר משתנה סביבה קריטי: ${v}`);
        else console.log(`✅ משתנה ${v} נמצא.`);
    });

    // 2. בדיקת קיום דפדפן (Chromium) - הגורם מס' 1 לקריסות וואטסאפ
    console.log('2️⃣ בודק הימצאות Chromium...');
    const chromePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';
    if (fs.existsSync(chromePath)) {
        console.log(`✅ Chromium נמצא בנתיב: ${chromePath}`);
        try {
            const version = execSync(`${chromePath} --version`).toString();
            console.log(`ℹ️ גרסת דפדפן: ${version.trim()}`);
        } catch (e) {
            console.error('❌ נמצא דפדפן אבל הוא לא מצליח לרוץ! בדוק הרשאות.');
        }
    } else {
        console.error(`❌ שגיאה קריטית: לא נמצא דפדפן בנתיב ${chromePath}. הבוט יקרוס!`);
    }

    // 3. בדיקת חיבור ל-MongoDB
    console.log('3️⃣ מנסה להתחבר למסד הנתונים...');
    try {
        await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
        console.log('✅ חיבור ל-MongoDB Atlas הצליח!');
    } catch (e) {
        console.error('❌ שגיאת חיבור ל-MongoDB! וודא שכתובת ה-IP של Railway מאושרת ב-Whitelist של Atlas.');
        console.error(`פרטי שגיאה: ${e.message}`);
    }

    // 4. בדיקת רשת ופורטים
    console.log('4️⃣ בודק הגדרות רשת...');
    console.log(`ℹ️ הפורט המוגדר ב-Railway הוא: ${process.env.PORT}`);
    console.log(`ℹ️ האפליקציה תנסה להקשיב בפורט: ${PORT}`);

    console.log('--- סיום בדיקות מקדימות ---');
}

// נתיב Health Check ציבורי - זה הדבר הראשון שאתה בודק בדפדפן!
app.get('/diag', (req, res) => {
    res.json({
        status: 'Online',
        port: PORT,
        env_check: 'Check logs for details',
        timestamp: new Date().toISOString()
    });
});

// הפעלת השרת
app.listen(PORT, "0.0.0.0", async () => {
    console.log(`🌍 שרת הדיאגנוסטיקה רץ בפורט ${PORT} ומקשיב לכל העולם (0.0.0.0)`);
    await runDiagnostics();
});

// טיפול בשגיאות לא צפויות כדי למנוע 502 שקט
process.on('uncaughtException', (err) => {
    console.error('💥 שגיאה לא צפויה (Uncaught Exception):', err);
});
