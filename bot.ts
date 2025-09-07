// 🚀 ملف بسيط لتجربة الربط بين Deno Deploy و Supabase
import { Telegraf } from 'https://esm.sh/telegraf@4';
import { Client } from 'https://esm.sh/pg';

// ====== Debug env ======
console.log('🆔 ADMIN_ID:', Deno.env.get('ADMIN_ID') || 'مفقود!');
console.log('🤖 BOT_TOKEN:', Deno.env.get('BOT_TOKEN') ? 'موجود' : 'مفقود!');
console.log('🗄 DATABASE_URL:', Deno.env.get('DATABASE_URL') ? 'موجود' : 'مفقود!');

// ====== Postgres client ======
const client = new Client({
  connectionString: Deno.env.get('DATABASE_URL'),
  ssl: { rejectUnauthorized: false }
});

async function connectDB() {
  try {
    await client.connect();
    console.log('✅ bot-simple.js: اتصال قاعدة البيانات ناجح');
  } catch (err) {
    console.error('❌ bot-simple.js: فشل الاتصال:', err.message);
    throw err;
  }
}

// 🔵 إنشاء جدول المستخدمين (إذا لم يكن موجودًا)
async function initSchema() {
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        telegram_id BIGINT UNIQUE NOT NULL,
        balance NUMERIC(12,6) DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ initSchema: تم تجهيز جدول المستخدمين');
  } catch (e) {
    console.error('❌ initSchema:', e);
    throw e;
  }
}

// ====== Bot setup ======
if (!Deno.env.get('BOT_TOKEN')) {
  console.error('❌ BOT_TOKEN غير موجود في متغيرات البيئة');
  Deno.exit(1);
}

const bot = new Telegraf(Deno.env.get('BOT_TOKEN'));

// 🏠 /start
bot.start(async (ctx) => {
  const userId = ctx.from.id;
  const firstName = ctx.from.first_name || 'عزيزي';

  // تأكد من وجود المستخدم في قاعدة البيانات
  try {
    let res = await client.query('SELECT 1 FROM users WHERE telegram_id = $1', [userId]);
    if (res.rows.length === 0) {
      await client.query('INSERT INTO users (telegram_id) VALUES ($1)', [userId]);
    }
  } catch (err) {
    console.error('❌ خطأ إدخال المستخدم:', err);
  }

  await ctx.replyWithHTML(
    `👋 أهلاً بك، <b>${firstName}</b>!
🚀 هذا بوت تجريبي بسيط للتأكد من أن الاتصال بقاعدة بيانات Supabase يعمل بشكل صحيح.`
  );
});

// 🧪 /dbtest — يعرض عدد المستخدمين في قاعدة البيانات
bot.command('dbtest', async (ctx) => {
  try {
    const res = await client.query('SELECT COUNT(*) AS count FROM users');
    const userCount = res.rows[0].count;
    await ctx.reply(`✅ الاتصال بقاعدة البيانات ناجح!
👥 عدد المستخدمين المسجلين: ${userCount}`);
  } catch (err) {
    console.error('❌ /dbtest error:', err);
    await ctx.reply('❌ فشل في الاتصال بقاعدة البيانات. تحقق من متغيرات البيئة وسجلات الكونسول.');
  }
});

// ==================== التشغيل النهائي ====================
(async () => {
  try {
    await connectDB();
    await initSchema();
    await bot.launch();

    console.log('✅ bot-simple.js: البوت شُغّل بنجاح');

    // معالجة إشارات الإغلاق في Deno
    Deno.addSignalListener("SIGINT", () => {
      console.log('🛑 SIGINT: stopping bot...');
      bot.stop('SIGINT');
      client.end().then(() => console.log('🗄️ Postgres connection closed.'));
    });

    Deno.addSignalListener("SIGTERM", () => {
      console.log('🛑 SIGTERM: stopping bot...');
      bot.stop('SIGTERM');
      client.end().then(() => console.log('🗄️ Postgres connection closed.'));
    });

  } catch (error) {
    console.error('❌ فشل في التشغيل:', error);
    Deno.exit(1);
  }
})();
