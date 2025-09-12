# Dockerfile
FROM node:20-alpine

# إنشاء مجلد العمل
WORKDIR /app

# نسخ ملفات إدارة الحزم أولاً لتحسين التخزين المؤقت
COPY package*.json ./

# تثبيت التبعيات للإنتاج فقط
RUN npm ci --only=production

# نسخ باقي ملفات المشروع
COPY . .

# تعريض المنفذ (اختياري)
EXPOSE 3000

# أمر التشغيل
CMD ["node", "bot.js"]
