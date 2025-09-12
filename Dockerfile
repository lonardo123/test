# Dockerfile
FROM node:20-alpine

# إنشاء مجلد للتطبيق
WORKDIR /app

# نسخ package.json أولاً لتحسين التخزين المؤقت
COPY package*.json ./

# تثبيت التبعيات
RUN npm ci --only=production

# نسخ باقي الملفات
COPY . .

# تعريض المنفذ (اختياري - Modal لا يحتاجه عادةً)
EXPOSE 3000

# أمر التشغيل
CMD ["node", "bot.js"]
