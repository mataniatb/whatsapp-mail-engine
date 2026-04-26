# השתמש בגרסת Node עדכנית
FROM node:20

# התקנת הדפדפן וכל התלויות שוואטסאפ צריכה
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# הגדרת תיקיית עבודה
WORKDIR /app

# העתקת קבצי התלויות
COPY package*.json ./

# התקנת הספריות של הפרויקט
RUN npm install

# העתקת שאר הקוד
COPY . .

# הגדרת משתנה סביבה כדי שוואטסאפ תדע איפה הדפדפן נמצא
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# הרצה
CMD ["node", "index.js"]
