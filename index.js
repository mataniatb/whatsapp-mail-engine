const mongoose = require('mongoose');

// בדיקה אם המשתנה בכלל קיים בזיכרון של השרת
const uri = process.env.MONGODB_URI;

console.log("--- בדיקת תקשורת למונגו ---");
if (!uri) {
    console.log("❌ שגיאה: המשתנה MONGODB_URI לא נמצא ב-Railway.");
    process.exit(1);
} else {
    console.log("✅ המשתנה MONGODB_URI נמצא במערכת.");
}

// ניסיון חיבור פיזי
mongoose.connect(uri)
    .then(() => {
        console.log("🚀 הצלחה אדירה! התחברנו ל-MongoDB Atlas.");
        console.log("הממשק שלך מוגדר פיקס. אפשר להחזיר את קוד הבוט.");
    })
    .catch(err => {
        console.log("❌ נכשלנו להתחבר למונגו.");
        console.log("הסיבה:", err.message);
    });
