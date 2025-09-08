// ================== استيراد الحزم ==================
const { Telegraf, Markup } = require('telegraf');
const { Client } = require('pg');
const express = require('express');
require('dotenv').config();

// ================== إعداد Postgres ==================
const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function connectDB() {
  await client.connect();
}

async function initSchema() {
  // يمكنك وضع سكيمات قاعدة البيانات هنا إذا لزم الأمر
}

// ================== تهيئة البوت ==================
const bot = new Telegraf(process.env.BOT_TOKEN);

// ======== دوال مساعدة ========
function isAdmin(ctx) {
  const admins = (process.env.ADMINS || '').split(',').map(a => a.trim());
  return admins.includes(ctx.from.id.toString());
}

// ====== تحويل المدة لنص للعرض ======
function formatDuration(secs) {
  if (!secs) return 'غير محددة';
  if (secs < 60) return `${secs} ثانية`;
  if (secs < 3600) return `${Math.floor(secs / 60)} دقيقة`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} ساعة`;
  return `${Math.floor(secs / 86400)} يوم`;
}

// ====== تحويل نص المدة لثواني ======
function parseDurationToSeconds(s) {
  if (!s) return null;
  s = ('' + s).trim().toLowerCase();
  const m = s.match(/^(\d+(?:[.,]\d+)?)(s|sec|secs|m|min|h|d)?$/);
  if (!m) return null;
  let num = m[1].replace(',', '.');
  let val = parseFloat(num);
  if (isNaN(val) || val < 0) return null;
  const unit = m[2] || '';
  switch (unit) {
    case 's': case 'sec': case 'secs': return Math.round(val);
    case 'm': case 'min': return Math.round(val * 60);
    case 'h': return Math.round(val * 3600);
    case 'd': return Math.round(val * 86400);
    default: return Math.round(val); // بدون وحدة → ثواني
  }
}

// ================== عرض المهمات للأدمن ==================
bot.hears('📝 المهمات', async (ctx) => {
  if (!isAdmin(ctx)) return;
  try {
    const res = await client.query('SELECT id, title, description, price, duration_seconds FROM tasks ORDER BY id DESC');
    if (res.rows.length === 0) return ctx.reply('⚠️ لا توجد مهام حالياً.');

    for (const t of res.rows) {
      const price = parseFloat(t.price) || 0;
      const text = '📋 المهمة #' + t.id + '\n' +
                   '🏷️ العنوان: ' + t.title + '\n' +
                   '📖 الوصف: ' + t.description + '\n' +
                   '💰 السعر: ' + price.toFixed(4) + '$\n' +
                   '⏱️ المدة: ' + formatDuration(t.duration_seconds);

      await ctx.reply(text, Markup.inlineKeyboard([
        [ Markup.button.callback('✏️ تعديل ' + t.id, 'edit_' + t.id) ],
        [ Markup.button.callback('🗑️ حذف ' + t.id, 'delete_' + t.id) ]
      ]));
    }
  } catch (err) {
    console.error('❌ المهمات:', err);
    await ctx.reply('خطأ أثناء جلب المهمات.');
  }
});

// ================== إضافة مهمة للأدمن ==================
bot.on('text', async (ctx, next) => {
  if (ctx.session && ctx.session.awaitingAction === 'add_task') {
    if (!isAdmin(ctx)) {
      delete ctx.session.awaitingAction;
      return ctx.reply('❌ ليس لديك صلاحيات الأدمن.');
    }
    const raw = ctx.message.text || '';
    const parts = raw.split('|').map(p => p.trim());

    if (parts.length < 3) {
      return ctx.reply(
        '❌ صيغة خاطئة. استخدم: العنوان | الوصف | السعر | المدة (اختياري)\n' +
        'مثال: coinpayu | اجمع رصيد وارفق رابط الموقع https://... | 0.0500 | 30d'
      );
    }

    const title = parts[0];
    let description = '';
    let priceStr = '';
    let durationStr = null;

    if (parts.length === 3) {
      description = parts[1];
      priceStr = parts[2];
    } else {
      durationStr = parts[parts.length - 1];
      priceStr = parts[parts.length - 2];
      description = parts.slice(1, parts.length - 2).join(' | ');
    }

    const numMatch = priceStr.match(/[\d]+(?:[.,]\d+)*/);
    if (!numMatch) return ctx.reply('❌ السعر غير صالح. مثال صحيح: 0.0010 أو 0.0500');

    const price = parseFloat(numMatch[0].replace(',', '.'));
    if (isNaN(price) || price <= 0) return ctx.reply('❌ السعر غير صالح.');

    let durationSeconds = durationStr ? parseDurationToSeconds(durationStr) : 30*24*60*60;
    if (durationStr && (!durationSeconds || durationSeconds <= 0)) {
      return ctx.reply('❌ صيغة المدة غير مفهومة. أمثلة: 3600s أو 60m أو 1h أو 5d');
    }

    try {
      await client.query(
        'INSERT INTO tasks (title, description, price, duration_seconds) VALUES ($1,$2,$3,$4)',
        [title, description, price, durationSeconds]
      );
      delete ctx.session.awaitingAction;
      return ctx.reply(
        '✅ تم إضافة المهمة بنجاح.\n' +
        '🏷️ العنوان: ' + title + '\n' +
        '💰 السعر: ' + price.toFixed(4) + '$\n' +
        '⏱️ المدة: ' + formatDuration(durationSeconds)
      );
    } catch (e) {
      console.error('❌ إضافة مهمة:', e);
      return ctx.reply('حدث خطأ أثناء إضافة المهمة.');
    }
  }
  return next();
});

// ================== تعديل مهمة ==================
bot.action(/^edit_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('❌ غير مسموح');
  const taskId = ctx.match[1];
  ctx.session.awaitingEdit = taskId;
  await ctx.answerCbQuery();
  await ctx.reply(
    '✏️ أرسل المهمة الجديدة بصيغة:\n' +
    'العنوان | الوصف | السعر | المدة\n' +
    '👉 المدة بالدقائق أو الساعات أو الأيام.\n' +
    'مثال:\ncoinpayu | اجمع رصيد وارفق رابط التسجيل https://... | 0.0500 | 3 أيام'
  );
});

// ================== حذف مهمة ==================
bot.action(/^delete_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery('❌ غير مسموح');
  const taskId = ctx.match[1];
  try {
    await client.query('DELETE FROM tasks WHERE id = $1', [taskId]);
    try {
      await ctx.editMessageText('🗑️ تم حذف المهمة #' + taskId);
    } catch (_) {
      await ctx.reply('🗑️ تم حذف المهمة #' + taskId);
    }
    await ctx.answerCbQuery();
  } catch (err) {
    console.error('❌ حذف المهمة:', err);
    await ctx.answerCbQuery('حدث خطأ أثناء الحذف.');
    await ctx.reply('حدث خطأ أثناء حذف المهمة.');
  }
});

// ================== Express + Postback ==================
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => res.send('✅ Bot + Postback running'));

app.get('/callback', async (req, res) => {
  const { user_id, amount, transaction_id, secret, network } = req.query;
  if (secret !== process.env.CALLBACK_SECRET) return res.status(403).send('Forbidden: Invalid Secret');
  if (!transaction_id) return res.status(400).send('Missing transaction_id');
  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount)) return res.status(400).send('Invalid amount');
  const percentage = 0.60;
  const finalAmount = parsedAmount * percentage;
  const source = network === 'bitcotasks' ? 'bitcotasks' : 'offer';

  try {
    const existing = await client.query(
      'SELECT * FROM earnings WHERE user_id = $1 AND source = $2 AND description = $3',
      [user_id, source, `Transaction: ${transaction_id}`]
    );
    if (existing.rows.length > 0) return res.status(200).send('Duplicate transaction ignored');

    await client.query('UPDATE users SET balance = COALESCE(balance,0) + $1 WHERE telegram_id = $2', [finalAmount, user_id]);
    await client.query('INSERT INTO earnings (user_id, source, amount, description) VALUES ($1,$2,$3,$4)',
      [user_id, source, finalAmount, `Transaction: ${transaction_id}`]
    );

    // Bonus referral
    const ref = await client.query('SELECT referrer_id FROM referrals WHERE referee_id = $1 LIMIT 1', [user_id]);
    if (ref.rows.length > 0) {
      const referrerId = ref.rows[0].referrer_id;
      const bonus = parsedAmount * 0.03;
      await client.query('UPDATE users SET balance = COALESCE(balance,0) + $1 WHERE telegram_id = $2', [bonus, referrerId]);
      await client.query('INSERT INTO earnings (user_id, source, amount, description) VALUES ($1,$2,$3,$4)',
        [referrerId, 'referral', bonus, `Referral bonus from ${user_id} (TX: ${transaction_id})`]
      );
    }

    res.status(200).send('تمت المعالجة بنجاح');
  } catch (err) {
    console.error('❌ Callback Error:', err);
    res.status(500).send('Server Error');
  }
});

// ================== تشغيل البوت + السيرفر ==================
(async () => {
  try {
    await connectDB();
    await initSchema();
    await bot.launch();
    console.log('✅ البوت شُغّل بنجاح');

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on port ${PORT}`));

    process.once('SIGINT', () => {
      console.log('🛑 SIGINT: stopping bot...');
      bot.stop('SIGINT');
      client.end().then(() => console.log('🗄️ Postgres connection closed.'));
    });
    process.once('SIGTERM', () => {
      console.log('🛑 SIGTERM: stopping bot...');
      bot.stop('SIGTERM');
      client.end().then(() => console.log('🗄️ Postgres connection closed.'));
    });
  } catch (error) {
    console.error('❌ فشل في التشغيل:', error);
  }
})();
