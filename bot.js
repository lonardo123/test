const { Telegraf, session, Markup } = require('telegraf');
const { Client } = require('pg');
require('dotenv').config();

// ====== Debug env ======
console.log('🆔 ADMIN_ID:', process.env.ADMIN_ID || 'مفقود!');
console.log('🤖 BOT_TOKEN:', process.env.BOT_TOKEN ? 'موجود' : 'مفقود!');
console.log('🗄 DATABASE_URL:', process.env.DATABASE_URL ? 'موجود' : 'مفقود!');
console.log('🎯 ADMIN_ID المحدد:', process.env.ADMIN_ID);

// ====== Postgres client ======
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function connectDB() {
  try {
    await client.connect();
    console.log('✅ bot.js: اتصال قاعدة البيانات ناجح');
  } catch (err) {
    console.error('❌ bot.js: فشل الاتصال:', err.message);
    setTimeout(connectDB, 5000);
  }
}

// 🔵 إنشاء/تحديث الجدول الخاص بالإحالات عند الإقلاع
async function initSchema() {
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS referrals (
        id SERIAL PRIMARY KEY,
        referrer_id BIGINT NOT NULL,
        referee_id  BIGINT NOT NULL UNIQUE,
        created_at  TIMESTAMP DEFAULT NOW()
      );
    `);
    // جدول أرباح الإحالة (اختياري للتقارير)، لو عندك جدول earnings نستخدمه مباشرة أيضاً
    await client.query(`
      CREATE TABLE IF NOT EXISTS referral_earnings (
        id SERIAL PRIMARY KEY,
        referrer_id BIGINT NOT NULL,
        referee_id  BIGINT NOT NULL,
        amount NUMERIC(12,6) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    // 🔵 جدول المهمات
await client.query(`
  CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    reward NUMERIC(12,6) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  );
`);

// 🔵 جدول إثباتات المستخدمين
await client.query(`
  CREATE TABLE IF NOT EXISTS task_submissions (
    id SERIAL PRIMARY KEY,
    task_id INT NOT NULL,
    user_id BIGINT NOT NULL,
    proof TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    submitted_at TIMESTAMP DEFAULT NOW(),
    processed_at TIMESTAMP,
    admin_note TEXT
  );
`);

    console.log('✅ initSchema: تم تجهيز جداول الإحالات');
  } catch (e) {
    console.error('❌ initSchema:', e);
  }
}

// ====== Bot setup ======
if (!process.env.BOT_TOKEN) {
  console.error('❌ BOT_TOKEN غير موجود في ملف .env');
  process.exit(1);
}
const bot = new Telegraf(process.env.BOT_TOKEN);

// Enable in-memory sessions
bot.use(session());

// Simple logger
bot.use((ctx, next) => {
  const from = ctx.from ? `${ctx.from.id} (${ctx.from.username || ctx.from.first_name})` : 'unknown';
  const text = ctx.message?.text || ctx.updateType;
  console.log('📩', from, '→', text);
  return next();
});

// Utility: ensure admin
const isAdmin = (ctx) => String(ctx.from?.id) === String(process.env.ADMIN_ID);

// 🔵 أداة مساعدة: تطبيق مكافأة الإحالة (5%) عند إضافة أرباح للمستخدم
async function applyReferralBonus(earnerId, earnedAmount) {
  try {
    // ابحث عن المُحيل لهذا المستخدم
    const ref = await client.query('SELECT referrer_id FROM referrals WHERE referee_id = $1', [earnerId]);
    if (ref.rows.length === 0) return; // لا يوجد محيل

    const referrerId = ref.rows[0].referrer_id;
    if (!referrerId || Number(referrerId) === Number(earnerId)) return;

    // 5% من أرباح المُحال
    const bonus = Number(earnedAmount) * 0.05;
    if (bonus <= 0) return;

    // حدّث رصيد المُحيل
    const balRes = await client.query('SELECT balance FROM users WHERE telegram_id = $1', [referrerId]);
    if (balRes.rows.length === 0) {
      // أنشئ المستخدم إن لم يكن موجودًا
      await client.query('INSERT INTO users (telegram_id, balance) VALUES ($1, $2)', [referrerId, 0]);
    }
    await client.query('UPDATE users SET balance = COALESCE(balance,0) + $1 WHERE telegram_id = $2', [bonus, referrerId]);

    // سجل حركة أرباح الإحالة (اختياري)
    await client.query(
      'INSERT INTO referral_earnings (referrer_id, referee_id, amount) VALUES ($1,$2,$3)',
      [referrerId, earnerId, bonus]
    );

    // إن كان لديك جدول earnings وتريد الظهور في الإحصائيات:
    try {
      await client.query(
        'INSERT INTO earnings (user_id, amount, source) VALUES ($1,$2,$3)',
        [referrerId, bonus, 'referral_bonus']
      );
    } catch (_) {}

    console.log(`🎉 إحالة: أضيفت مكافأة ${bonus.toFixed(4)}$ للمحيل ${referrerId} بسبب ربح ${earnerId}`);
  } catch (e) {
    console.error('❌ applyReferralBonus:', e);
  }
}

// 🔵 أمر أدمن اختياري لاختبار إضافة أرباح + تطبيق مكافأة الإحالة
bot.command('credit', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const parts = (ctx.message.text || '').trim().split(/\s+/);
  // /credit <userId> <amount>
  const targetId = parts[1];
  const amount = Number(parts[2]);
  if (!targetId || isNaN(amount)) {
    return ctx.reply('استخدم: /credit <userId> <amount>');
  }
  try {
    // أضف الأرباح للمستخدم
    await client.query('UPDATE users SET balance = COALESCE(balance,0) + $1 WHERE telegram_id = $2', [amount, targetId]);
    try {
      await client.query('INSERT INTO earnings (user_id, amount, source) VALUES ($1,$2,$3)', [targetId, amount, 'manual_credit']);
    } catch (_) {}
    // طبق مكافأة الإحالة
    await applyReferralBonus(targetId, amount);
    return ctx.reply(`✅ تم إضافة ${amount.toFixed(4)}$ للمستخدم ${targetId} وتطبيق مكافأة الإحالة (إن وجدت).`);
  } catch (e) {
    console.error('❌ /credit:', e);
    return ctx.reply('فشل في إضافة الرصيد.');
  }
});

// 🛠 أمر /admin
bot.command('admin', async (ctx) => {
  if (!ctx.session) ctx.session = {};
  const userId = String(ctx.from.id);
  const adminId = String(process.env.ADMIN_ID);
  console.log('🎯 محاولة دخول لوحة الأدمن:', { userId, adminId });

  if (userId !== adminId) {
    console.log('❌ رفض الدخول');
    return ctx.reply('❌ ليس لديك صلاحيات الأدمن.');
  }

  ctx.session.isAdmin = true;

  await ctx.reply('🔐 أهلاً بك في لوحة الأدمن. اختر العملية:', Markup.keyboard([
    ['📋 عرض الطلبات', '📊 الإحصائيات'],
    ['➕ إضافة رصيد', '➖ خصم رصيد'],
    ['➕ إضافة مهمة جديدة', '📝 المهمات', '📝 اثباتات مهمات المستخدمين'],
    ['👥 ريفيرال', '🚪 خروج من لوحة الأدمن']
  ]).resize()
);
});

// 🏠 /start
bot.start(async (ctx) => {
  const userId = ctx.from.id;
  const firstName = ctx.from.first_name || '';

  try {
    // 🔵 التقاط الـ payload الخاص بالإحالة /start ref_123
    let payload = null;
    if (ctx.startPayload) {
      payload = ctx.startPayload; // متاح في Telegraf v4
    } else if (ctx.message?.text?.includes('/start')) {
      const parts = ctx.message.text.split(' ');
      payload = parts[1] || null;
    }

    // أنشئ المستخدم إن لم يوجد
    let res = await client.query('SELECT balance FROM users WHERE telegram_id = $1', [userId]);
    let balance = 0;

    if (res.rows.length > 0) {
      balance = parseFloat(res.rows[0].balance) || 0;
    } else {
      await client.query('INSERT INTO users (telegram_id, balance) VALUES ($1, $2)', [userId, 0]);
    }

    // 🔵 إذا جاء عبر إحالة، سجل علاقة الإحالة لمرة واحدة
    if (payload && /^ref_\d+$/i.test(payload)) {
      const referrerId = Number(payload.replace(/ref_/i, ''));
      if (referrerId && referrerId !== userId) {
        const exists = await client.query('SELECT 1 FROM referrals WHERE referee_id = $1', [userId]);
        if (exists.rows.length === 0) {
          await client.query('INSERT INTO referrals (referrer_id, referee_id) VALUES ($1,$2)', [referrerId, userId]);
          try {
            // أرسل إشعار للمُحيل (غير مضمون لو ما بدأ البوت)
            await bot.telegram.sendMessage(referrerId, `🎉 مستخدم جديد انضم من رابطك: ${userId}`);
          } catch (_) {}
        }
      }
    }

    await ctx.replyWithHTML(
  `👋 أهلاً بك، <b>${firstName}</b>!\n\n💰 <b>رصيدك:</b> ${balance.toFixed(4)}$`,
  Markup.keyboard([
  ['💰 رصيدك', '🎁 مصادر الربح'],
  ['📤 طلب سحب', '👥 ريفيرال'],
  ['📝 مهمات TasksRewardBot', '🔗 قيم البوت من هنا']
]).resize()
);

    // رسالة الشرح (تظهر لكل مستخدم/زائر)
    await ctx.replyWithHTML(
      `📌 <b>طريقة العمل:</b>\n
1️⃣ اضغط على 🎁 <b>مصادر الربح</b> في القائمة.\n
2️⃣ اختر 🕒 <b>TimeWall</b>.\n
3️⃣ اربط حسابك عبر الرابط الظاهر.\n
4️⃣ نفّذ المهام (مشاهدة إعلانات – تنفيذ مهمات بسيطة).\n
\n
🔑 <b>طريقة سحب المال من TimeWall:</b>\n
- ادخل صفحة Withdraw\n
- اضغط على زر "سحب" أعلى الصفحة\n
- الأرباح تضاف لحسابك مباشرة 💵\n
\n
💰 <b>السحب من البوت:</b>\n
- الحد الأدنى: 1$\n
- اختر 📤 <b>طلب سحب</b>\n
- أدخل محفظة <b>Payeer</b>\n
- بعد مراجعة الأدمن يتم الدفع ✅`
    );
  } catch (err) {
    console.error('❌ /start:', err);
    await ctx.reply('حدث خطأ داخلي.');
  }
});

// 💰 رصيدك
bot.hears('💰 رصيدك', async (ctx) => {
  const userId = ctx.from.id;
  try {
    const res = await client.query('SELECT balance FROM users WHERE telegram_id = $1', [userId]);
    const balance = parseFloat(res.rows[0]?.balance) || 0;
    await ctx.replyWithHTML(`💰 رصيدك: <b>${balance.toFixed(4)}$</b>`);
  } catch (err) {
    console.error('❌ رصيدك:', err);
    await ctx.reply('حدث خطأ.');
  }
});

// 🔵 👥 ريفيرال — عرض رابط الإحالة + شرح ونبذة إحصائية
bot.hears('👥 ريفيرال', async (ctx) => {
  const userId = ctx.from.id;
  const botUsername = 'TasksRewardBot'; // 👈 استبدلها باسم المستخدم الفعلي لبوتك بدون @
  const refLink = `https://t.me/${botUsername}?start=ref_${userId}`;

  try {
    // عدد الإحالات
    const countRes = await client.query('SELECT COUNT(*) AS c FROM referrals WHERE referrer_id = $1', [userId]);
    const refsCount = Number(countRes.rows[0]?.c || 0);

    // إجمالي أرباح الإحالة
    const earnRes = await client.query('SELECT COALESCE(SUM(amount),0) AS s FROM referral_earnings WHERE referrer_id = $1', [userId]);
    const refEarnings = Number(earnRes.rows[0]?.s || 0);

    await ctx.replyWithHTML(
`👥 <b>برنامج الإحالة</b>
هذا رابطك الخاص، شاركه مع أصدقائك واربح من نشاطهم:
🔗 <code>${refLink}</code>

💡 <b>كيف تُحتسب أرباح الإحالة؟</b>
تحصل على <b>5%</b> من أرباح كل مستخدم ينضم من طرفك (أي نصف سنت عن كل 10 سنت يجمعها).

📊 <b>إحصاءاتك</b>
- عدد الإحالات: <b>${refsCount}</b>`
    );
  } catch (e) {
    console.error('❌ ريفيرال:', e);
    await ctx.reply('تعذر جلب بيانات الإحالة حالياً.');
  }
});


// 🎁 مصادر الربح
bot.hears('🎁 مصادر الربح', async (ctx) => {
  const userId = ctx.from.id;
  const timewallUrl = `https://timewall.io/users/login?oid=b328534e6b994827&uid=${userId}`;
  const tasksRewardBotUrl = "https://tasksrewardbot.neocities.org";

  // أولاً: عرض الأزرار
  await ctx.reply(
    'اختر مصدر ربح:',
    Markup.inlineKeyboard([
      [Markup.button.url('🕒 TimeWall', timewallUrl)],
      [Markup.button.url('📊 TasksRewardBot', tasksRewardBotUrl )]
    ])
  );

  // ثانياً: إرسال رسالة الشرح
  await ctx.replyWithHTML(
`📌 <b>طريقة العمل:</b>
1️⃣ اضغط على 🎁 <b>مصادر الربح</b> في القائمة.
2️⃣ اختر 🕒 <b>TimeWall</b>.
3️⃣ اربط حسابك عبر الرابط الظاهر.
4️⃣ نفّذ المهام (مشاهدة إعلانات – تنفيذ مهمات بسيطة).

🔑 <b>طريقة سحب المال من TimeWall:</b>
- ادخل صفحة Withdraw
- اضغط على زر "سحب" أعلى الصفحة
✅ الأرباح تضاف لحسابك مباشرة 💵`
  );
});
// 📝 عرض المهمات
bot.hears('📝 مهمات TasksRewardBot', async (ctx) => {
  try {
    const res = await client.query(
      'SELECT id, title, description, price FROM tasks ORDER BY id DESC LIMIT 20'
    );

    if (res.rows.length === 0) {
      return ctx.reply('❌ لا توجد مهمات متاحة حالياً.');
    }

    for (const t of res.rows) {
      const msg =
        `📋 المهمة #${t.id}\n\n` +
        `🏷️ العنوان: ${t.title}\n` +
        `📖 الوصف: ${t.description}\n` +
        `💰 السعر: ${parseFloat(t.price).toFixed(2)}$\n\n` +
        `▶️ لإرسال إثبات المهمة: /submit ${t.id}`;

      await ctx.reply(msg);
    }
  } catch (err) {
    console.error('❌ عرض المهمات:', err);
    ctx.reply('حدث خطأ أثناء عرض المهمات.');
  }
});

// 📌 عرض تفاصيل المهمة
bot.action(/task_(\d+)/, async (ctx) => {
  try {
    const taskId = Number(ctx.match[1]);
    const res = await client.query('SELECT * FROM tasks WHERE id=$1', [taskId]);
    if (res.rows.length === 0) return ctx.reply('❌ لم يتم العثور على المهمة.');

    const t = res.rows[0];

    await ctx.replyWithHTML(
      `<b>${t.title}</b>\n\n${t.description}\n\n💰 <b>${parseFloat(t.reward).toFixed(6)}$</b>`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "📝 إرسال إثبات", callback_data: `submit_${taskId}` }]
          ]
        }
      }
    );

    await ctx.answerCbQuery();
  } catch (err) {
    console.error('❌ task action:', err);
    await ctx.reply('حدث خطأ أثناء عرض المهمة.');
  }
});

// 📌 بدء إرسال الإثبات
bot.action(/submit_(\d+)/, async (ctx) => {
  try {
    const taskId = Number(ctx.match[1]);
    ctx.session.awaiting_task_submission = { taskId, userId: ctx.from.id };

    await ctx.reply(
      "✍️ من فضلك أرسل الآن إثبات تنفيذ المهمة (نص أو صورة).",
      { reply_markup: { force_reply: true } }
    );

    await ctx.answerCbQuery();
  } catch (err) {
    console.error("❌ submit action:", err);
    await ctx.reply("حدث خطأ أثناء بدء إرسال الإثبات.");
  }
});

// 📌 استقبال النص أو الصورة كإثبات
bot.on(["text", "photo"], async (ctx) => {
  if (!ctx.session.awaiting_task_submission) return;

  const { taskId, userId } = ctx.session.awaiting_task_submission;
  let proof = "";

  if (ctx.message.photo) {
    const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    const caption = ctx.message.caption || "";
    proof = `صورة: ${fileId} ${caption}`;
  } else {
    proof = ctx.message.text;
  }

  try {
    await client.query(
      "INSERT INTO task_proofs (task_id, user_id, proof, status, created_at) VALUES ($1,$2,$3,'pending',NOW())",
      [taskId, userId, proof]
    );

    ctx.reply("✅ تم إرسال الإثبات بنجاح، سيتم مراجعته من الأدمن قريبًا.");

    ctx.session.awaiting_task_submission = null;
  } catch (err) {
    console.error("❌ insert proof:", err);
    ctx.reply("حدث خطأ أثناء إرسال الإثبات.");
  }
});


bot.hears('🔗 قيم البوت من هنا', (ctx) => {
  ctx.reply(
    `🌟 لو سمحت قيم البوت من هنا:\n👉 https://toptelegrambots.com/list/TasksRewardBot`,
    Markup.inlineKeyboard([
      [Markup.button.url('🔗 افتح صفحة التقييم', 'https://toptelegrambots.com/list/TasksRewardBot')]
    ])
  );
});
// 📤 طلب سحب
bot.hears('📤 طلب سحب', async (ctx) => {
  if (!ctx.session) ctx.session = {};
  const userId = ctx.from.id;
  try {
    const res = await client.query('SELECT balance FROM users WHERE telegram_id = $1', [userId]);
    const balance = parseFloat(res.rows[0]?.balance) || 0;

    if (balance < 1.0) {
      return ctx.reply(`❌ الحد الأدنى للسحب هو 1$. رصيدك: ${balance.toFixed(4)}$`);
    }

    ctx.session.awaiting_withdraw = true;
    await ctx.reply(`🟢 رصيدك مؤهل للسحب.\nأرسل رقم محفظة Payeer (مثل: P12345678):`);
  } catch (err) {
    console.error('❌ طلب سحب:', err);
    await ctx.reply('حدث خطأ داخلي.');
  }
});

// معالجة نصوص عامة
bot.on('text', async (ctx, next) => {
  if (!ctx.session) ctx.session = {};
  const text = ctx.message?.text?.trim();

  const menuTexts = new Set([
    '💰 رصيدك','🎁 مصادر الربح','📤 طلب سحب','👥 ريفيرال',
    '📋 عرض الطلبات','📊 الإحصائيات',
    '➕ إضافة רصيد','➖ خصم رصيد',
    '🚪 خروج من لوحة الأدمن'
  ]);
  // —— إرسال إثبات المهمة ——
if (ctx.session.awaiting_task_submission) {
  const { taskId, userId } = ctx.session.awaiting_task_submission;
  const proof = ctx.message.text.trim();

  try {
    await client.query(
      'INSERT INTO task_submissions (task_id, user_id, proof) VALUES ($1,$2,$3)',
      [taskId, userId, proof]
    );

    // حذف المهمة من جلسة المستخدم
    delete ctx.session.awaiting_task_submission;

    ctx.reply('✅ تم إرسال إثبات المهمة للأدمن للمراجعة.');
  } catch (err) {
    console.error('❌ إرسال إثبات المهمة:', err);
    ctx.reply('حدث خطأ أثناء إرسال إثبات المهمة.');
  }

  return; // لمنع المعالجة لبقية الكود
}

  if (menuTexts.has(text)) return next();

  // —— طلب السحب —— 
  if (ctx.session.awaiting_withdraw) {
    if (!/^P\d{8,}$/i.test(text)) {
      return ctx.reply('❌ رقم محفظة غير صالح. يجب أن يبدأ بـ P ويحتوي على 8 أرقام على الأقل.');
    }

    const userId = ctx.from.id;
    try {
      const userRes = await client.query('SELECT balance FROM users WHERE telegram_id = $1', [userId]);
      let balance = parseFloat(userRes.rows[0]?.balance) || 0;

      if (balance < 1.0) {
        return ctx.reply(`❌ الحد الأدنى للسحب هو 1$. رصيدك: ${balance.toFixed(4)}$`);
      }

      const withdrawAmount = Math.floor(balance * 100) / 100;
      const remaining = balance - withdrawAmount;

      await client.query(
        'INSERT INTO withdrawals (user_id, amount, payeer_wallet) VALUES ($1, $2, $3)',
        [userId, withdrawAmount, text.toUpperCase()]
      );

      await client.query('UPDATE users SET balance = $1 WHERE telegram_id = $2', [remaining, userId]);

      await ctx.reply(`✅ تم تقديم طلب سحب بقيمة ${withdrawAmount.toFixed(2)}$. رصيدك المتبقي: ${remaining.toFixed(4)}$`);
      ctx.session.awaiting_withdraw = false;
    } catch (err) {
      console.error('❌ خطأ في معالجة السحب:', err);
      await ctx.reply('حدث خطأ داخلي.');
    }
  }

  // —— إضافة / خصم رصيد —— 
  else if (ctx.session.awaitingAction === 'add_balance' || ctx.session.awaitingAction === 'deduct_balance') {
    if (!ctx.session.targetUser) {
      ctx.session.targetUser = text;
      return ctx.reply('💵 أرسل المبلغ:');
    } else {
      const userId = ctx.session.targetUser;
      const amount = parseFloat(text);

      if (isNaN(amount)) {
        ctx.session = {};
        return ctx.reply('❌ المبلغ غير صالح.');
      }

      try {
        const res = await client.query('SELECT balance FROM users WHERE telegram_id = $1', [userId]);
        if (res.rows.length === 0) {
          ctx.session = {};
          return ctx.reply('❌ المستخدم غير موجود.');
        }

        let balance = parseFloat(res.rows[0].balance) || 0;
        let newBalance = ctx.session.awaitingAction === 'add_balance' ? balance + amount : balance - amount;
        if (newBalance < 0) newBalance = 0;

        await client.query('UPDATE users SET balance = $1 WHERE telegram_id = $2', [newBalance, userId]);

        // 🔵 عند إضافة أرباح (وليس خصم)، طبّق مكافأة الإحالة
        if (ctx.session.awaitingAction === 'add_balance' && amount > 0) {
          await applyReferralBonus(userId, amount);
          try {
            await client.query('INSERT INTO earnings (user_id, amount, source) VALUES ($1,$2,$3)', [userId, amount, 'admin_adjust']);
          } catch (_) {}
        }

        ctx.reply(`✅ تم ${ctx.session.awaitingAction === 'add_balance' ? 'إضافة' : 'خصم'} ${amount.toFixed(4)}$ للمستخدم ${userId}.\n💰 رصيده الجديد: ${newBalance.toFixed(4)}$`);
      } catch (err) {
        console.error('❌ خطأ تحديث الرصيد:', err);
        ctx.reply('❌ فشل تحديث الرصيد.');
      }

      ctx.session = {};
    }
  }

  else {
    return next();
  }
});

// 🔐 لوحة الأدمن - عرض الطلبات
bot.hears('📋 عرض الطلبات', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('❌ الوصول مرفوض.');
  try {
    const res = await client.query('SELECT * FROM withdrawals WHERE status = $1 ORDER BY id DESC', ['pending']);
    if (res.rows.length === 0) {
      await ctx.reply('✅ لا توجد طلبات معلقة.');
    } else {
      for (const req of res.rows) {
        await ctx.reply(
          `طلب سحب #${req.id}\n` +
          `👤 المستخدم: ${req.user_id}\n` +
          `💵 المبلغ: ${Number(req.amount).toFixed(2)}$\n` +
          `💳 Payeer: ${req.payeer_wallet}\n\n` +
          `لقبول: /pay ${req.id}\nلرفض: /reject ${req.id}`
        );
      }
    }
  } catch (err) {
    console.error('❌ خطأ في عرض الطلبات:', err);
    await ctx.reply('حدث خطأ فني.');
  }
});
bot.hears('➕ إضافة مهمة جديدة', async (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.session.awaitingAction = 'add_task';
  ctx.reply('📌 أرسل المهمة الجديدة بصيغة: العنوان | الوصف | السعر');
});

bot.on('text', async (ctx, next) => {
  if (ctx.session && ctx.session.awaitingAction === 'add_task') {
    if (!isAdmin(ctx)) {
      delete ctx.session.awaitingAction;
      return ctx.reply('❌ ليس لديك صلاحيات الأدمن.');
    }

    const raw = ctx.message.text || '';
    const parts = raw.split('|').map(p => p.trim());

    if (parts.length < 3) {
      return ctx.reply('❌ صيغة خاطئة. استخدم: العنوان | الوصف | السعر\nمثال: coinpayu | اجمع رصيد وارفق رابط الموقع https://... | 0.0500');
    }

    const title = parts[0];
    const description = parts.slice(1, -1).join(' | ');
    const rewardStr = parts[parts.length - 1];

    const numMatch = rewardStr.match(/[\d]+(?:[.,]\d+)*/);
    if (!numMatch) {
      return ctx.reply('❌ السعر غير صالح. مثال صحيح: 0.0010 أو 0.0500');
    }

    let cleanReward = numMatch[0].replace(',', '.');
    const price = parseFloat(cleanReward);

    if (isNaN(price) || price <= 0) {
      return ctx.reply('❌ السعر غير صالح. مثال صحيح: 0.0010');
    }

    try {
      // استخدم price بدل reward
      const res = await client.query(
        'INSERT INTO tasks (title, description, price) VALUES ($1,$2,$3) RETURNING id, title, price',
        [title, description, price]
      );

      const formattedDescription = description.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1">$1</a>');

      await ctx.replyWithHTML(
        `✅ تم إضافة المهمة بنجاح.\n\n📌 <b>العنوان:</b> ${res.rows[0].title}\n📝 <b>الوصف:</b> ${formattedDescription}\n💰 <b>السعر:</b> ${parseFloat(res.rows[0].price).toFixed(4)}`,
        { disable_web_page_preview: true }
      );

      delete ctx.session.awaitingAction;
    } catch (err) {
      console.error('❌ إضافة مهمة: ', err.message);
      console.error(err.stack);
      ctx.reply('حدث خطأ أثناء إضافة المهمة. راجع سجلات السيرفر (console) لمعرفة التفاصيل.');
    }

    return;
  }

  return next();
});

// 📝 عرض كل المهمات (للأدمن)
bot.hears('📝 المهمات', async (ctx) => {
  if (!isAdmin(ctx)) return;
  try {
    const res = await client.query('SELECT id, title, description, price FROM tasks ORDER BY id DESC');
    if (res.rows.length === 0) return ctx.reply('⚠️ لا توجد مهام حالياً.');

    for (const t of res.rows) {
      // تأكد أن السعر رقم
      const price = parseFloat(t.price) || 0;
      const text = `📋 المهمة #${t.id}\n\n` +
                   `🏷️ العنوان: ${t.title}\n` +
                   `📖 الوصف: ${t.description}\n` +
                   `💰 السعر: ${price.toFixed(4)}$`;

      await ctx.reply(text, Markup.inlineKeyboard([
        [ Markup.button.callback(`✏️ تعديل ${t.id}`, `edit_${t.id}`) ],
        [ Markup.button.callback(`🗑️ حذف ${t.id}`, `delete_${t.id}`) ]
      ]));
    }
  } catch (err) {
    console.error('❌ المهمات:', err);
    await ctx.reply('خطأ أثناء جلب المهمات.');
  }
});

// ✏️ زر تعديل المهمة (يعين حالة انتظار التعديل)
bot.action(/^edit_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.answerCbQuery('❌ غير مسموح');
    return;
  }
  const taskId = ctx.match[1];
  ctx.session.awaitingEdit = taskId;
  await ctx.answerCbQuery(); // اغلاق الدائرة الصغيرة
  await ctx.reply(`✏️ أرسل المهمة الجديدة لـ #${taskId} بصيغة:\n\nالعنوان | الوصف | السعر\n\nمثال:\ncoinpayu | اجمع رصيد وارفق رابط التسجيل https://... | 0.0500`);
});

// 🗑️ زر حذف المهمة
bot.action(/^delete_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.answerCbQuery('❌ غير مسموح');
    return;
  }
  const taskId = ctx.match[1];
  try {
    await client.query('DELETE FROM tasks WHERE id = $1', [taskId]);
    // حاول تعديل رسالة الزر لتُظهر أنها حُذِفت (لو ممكن)
    try {
      await ctx.editMessageText(`🗑️ تم حذف المهمة #${taskId}`);
    } catch (_) {
      // لو لم نتمكن من تعديل الرسالة (مثلاً لأن الرسالة قديمة) نكتفي برد تأكيد
      await ctx.reply(`🗑️ تم حذف المهمة #${taskId}`);
    }
    await ctx.answerCbQuery();
  } catch (err) {
    console.error('❌ حذف المهمة:', err);
    await ctx.answerCbQuery('حدث خطأ أثناء الحذف.');
    await ctx.reply('حدث خطأ أثناء حذف المهمة.');
  }
});

// 📌 استلام بيانات التعديل (عند إرسال الأدمن للنص الجديد)
bot.on('text', async (ctx, next) => {
  // إن لم يكن الأدمن في وضع انتظار تعديل، مرّر الطلب لباقي المعالجات
  if (!ctx.session || !ctx.session.awaitingEdit) return next();

  // تحقق صلاحية الأدمن (أمان إضافي)
  if (!isAdmin(ctx)) {
    ctx.session.awaitingEdit = null;
    return ctx.reply('❌ ليس لديك صلاحيات الأدمن.');
  }

  const taskId = ctx.session.awaitingEdit;
  const raw = ctx.message.text || '';
  const parts = raw.split('|').map(p => p.trim());

  if (parts.length < 3) {
    return ctx.reply('⚠️ الصيغة غير صحيحة. مثال:\ncoinpayu | سجل عبر الرابط https://... | 0.0500');
  }

  const title = parts[0];
  // الوصف قد يحتوي على روابط و '|' فجمعنا كل الأجزاء ما عدا الأخير كـ وصف
  const description = parts.slice(1, -1).join(' | ');
  const priceStr = parts[parts.length - 1];

  // استخراج الرقم من آخر الجزء للتعامل مع صيغ مختلفة
  const numMatch = priceStr.match(/[\d]+(?:[.,]\d+)*/);
  if (!numMatch) {
    return ctx.reply('❌ السعر غير صالح. استخدم مثلاً: 0.0500');
  }
  const price = parseFloat(numMatch[0].replace(',', '.'));
  if (isNaN(price) || price <= 0) {
    return ctx.reply('❌ السعر غير صالح. مثال صحيح: 0.0010 أو 0.0500');
  }

  try {
    await client.query(
      'UPDATE tasks SET title=$1, description=$2, price=$3 WHERE id=$4',
      [title, description, price, taskId]
    );
    ctx.session.awaitingEdit = null;
    await ctx.reply(`✅ تم تعديل المهمة #${taskId} بنجاح.\n📌 العنوان: ${title}\n💰 السعر: ${price.toFixed(4)}$`, { disable_web_page_preview: true });
  } catch (err) {
    console.error('❌ تعديل المهمة:', err);
    await ctx.reply('حدث خطأ أثناء تعديل المهمة.');
  }
});

// =================== إثباتات مهمات المستخدمين (للأدمن) ===================

/**
 * عرض إثباتات المهام المعلقة (حدّ أقصى 10 مؤخراً)
 * يظهر لكل إثبات: رقم، مستخدم، عنوان المهمة، السعر، الإثبات، وأزرار موافقة/رفض
 */
bot.hears('📝 اثباتات مهمات المستخدمين', async (ctx) => {
  if (!isAdmin(ctx)) return;
  try {
    const res = await client.query(
      `SELECT s.*, t.title AS task_title, t.price AS task_price
       FROM task_submissions s
       JOIN tasks t ON t.id = s.task_id
       WHERE s.status = $1
       ORDER BY s.id DESC
       LIMIT 10`,
      ['pending']
    );

    if (res.rows.length === 0) return ctx.reply('✅ لا توجد إثباتات معلقة.');

    for (const sub of res.rows) {
      const price = parseFloat(sub.task_price) || 0;
      const text =
        `📌 إثبات #${sub.id}\n` +
        `👤 المستخدم: <code>${sub.user_id}</code>\n` +
        `📋 المهمة: ${sub.task_title} (ID: ${sub.task_id})\n` +
        `💰 المكافأة: ${price.toFixed(4)}$\n` +
        `📝 الإثبات:\n${sub.proof}`;

      await ctx.replyWithHTML(
        text,
        Markup.inlineKeyboard([
          [ Markup.button.callback('✅ موافقة', `approve_${sub.id}`), Markup.button.callback('❌ رفض', `deny_${sub.id}`) ]
        ])
      );
    }
  } catch (err) {
    console.error('❌ اثباتات:', err);
    await ctx.reply('خطأ أثناء جلب الإثباتات.');
  }
});


// =================== معالجة الموافقة/الرفض عبر أزرار Inline (callbacks) ===================

/**
 * approve via callback (inline button)
 */
bot.action(/^approve_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.answerCbQuery('❌ غير مسموح');
    return;
  }

  const subId = Number(ctx.match[1]);
  await ctx.answerCbQuery(); // إغلاق دائرة التحميل في الواجهة

  try {
    // ابدأ معاملة لضمان الاتساق
    await client.query('BEGIN');

    // التحقق أن الإثبات موجود ومازال Pending
    const subRes = await client.query('SELECT * FROM task_submissions WHERE id = $1 AND status = $2', [subId, 'pending']);
    if (subRes.rows.length === 0) {
      await client.query('ROLLBACK');
      await ctx.reply('⚠️ هذا الإثبات غير موجود أو تم معالجته مسبقاً.');
      return;
    }
    const sub = subRes.rows[0];

    // احصل بيانات المهمة (السعر والعنوان)
    const taskRes = await client.query('SELECT price, title FROM tasks WHERE id = $1', [sub.task_id]);
    const price = parseFloat(taskRes.rows[0]?.price) || 0;

    // حدّث/أضف رصيد المستخدم
    const updRes = await client.query('UPDATE users SET balance = COALESCE(balance,0) + $1 WHERE telegram_id = $2 RETURNING *', [price, sub.user_id]);
    if (updRes.rowCount === 0) {
      // لو المستخدم غير موجود في جدول users، أنشئه
      await client.query('INSERT INTO users (telegram_id, balance) VALUES ($1, $2)', [sub.user_id, price]);
    }

    // أدخل سجل للـ earnings للمستخدم
    try {
      await client.query('INSERT INTO earnings (user_id, amount, source, description) VALUES ($1, $2, $3, $4)', [sub.user_id, price, 'task', `task_submission:${subId}`]);
    } catch (_) {
      // إن فشل إدخال earnings لا نوقف التنفيذ طالما تبدلت الرصيد
      console.warn('⚠️ فشل إدخال سجل earnings (غير حرج).');
    }

    // حدّث حالة الإثبات إلى approved
    await client.query('UPDATE task_submissions SET status=$1, processed_at=NOW() WHERE id=$2', ['approved', subId]);

    await client.query('COMMIT');

    // طبق مكافأة الإحالة (ستسجل أيضاً referral_earnings داخل applyReferralBonus إن كانت موجودة)
    try {
      await applyReferralBonus(sub.user_id, price);
    } catch (e) {
      console.error('❌ خطأ في applyReferralBonus:', e);
    }

    // حاول تعديل رسالة الزر إن أمكن (لو الضغط تم على رسالة الإدمن)
    try {
      await ctx.editMessageText(`✅ تمت الموافقة على الإثبات #${subId}\n👤 المستخدم: ${sub.user_id}\n💰 ${price.toFixed(4)}$`);
    } catch (_) {
      // لو لم نتمكن من تعديل الرسالة (مثلاً تم إرسال الرد في رسالة منفصلة)، أرسل تأكيداً جديداً
      await ctx.reply(`✅ تمت الموافقة على الإثبات #${subId} ورصدت المكافأة للمستخدم.`);
    }

    // إخطار المستخدم (محاولة إرسال رسالة)
    try {
      await bot.telegram.sendMessage(sub.user_id, `✅ تمت الموافقة على إثبات المهمة (ID: ${sub.task_id}). المبلغ ${price.toFixed(4)}$ أُضيف إلى رصيدك.`);
    } catch (_) {
      // ممكن يفشل لو المستخدم لم يبدأ البوت أو حظر البوت
    }

  } catch (err) {
    await client.query('ROLLBACK').catch(()=>{});
    console.error('❌ approve callback error:', err);
    await ctx.reply('حدث خطأ أثناء الموافقة على الإثبات.');
  }
});


/**
 * deny via callback (inline button)
 */
bot.action(/^deny_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.answerCbQuery('❌ غير مسموح');
    return;
  }

  const subId = Number(ctx.match[1]);
  await ctx.answerCbQuery();

  try {
    const res = await client.query('UPDATE task_submissions SET status=$1, processed_at=NOW() WHERE id=$2 AND status=$3 RETURNING *', ['rejected', subId, 'pending']);
    if (res.rowCount === 0) {
      await ctx.reply('⚠️ هذا الإثبات غير موجود أو تم معالجته سابقاً.');
      return;
    }
    // تعديل رسالة الزر أو إرسال تأكيد
    try {
      await ctx.editMessageText(`❌ تم رفض الإثبات #${subId}`);
    } catch (_) {
      await ctx.reply(`❌ تم رفض الإثبات #${subId}`);
    }
    // إخطار المستخدم بالرفض (اختياري)
    try {
      const sub = res.rows[0];
      await bot.telegram.sendMessage(sub.user_id, `❌ تم رفض إثبات المهمة (ID: ${sub.task_id}). يمكنك إعادة المحاولة إن استوفيت المطلوب.`);
    } catch (_) {}
  } catch (err) {
    console.error('❌ deny callback error:', err);
    await ctx.reply('حدث خطأ أثناء رفض الإثبات.');
  }
});


// =================== أوامر نصية بديلة (/approve و /deny) ===================

bot.command('approve', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const id = Number((ctx.message.text.split(' ')[1] || '').trim());
  if (!id) return ctx.reply('❌ استخدم: /approve <ID>');

  // بسيطة: نعيد استدعاء نفس المنطق الموجود في callback (بالتالي نستخدم الإجراءات نفسها)
  // هنا نعيد تنفيذ المنطق مباشرة:
  try {
    await client.query('BEGIN');
    const subRes = await client.query('SELECT * FROM task_submissions WHERE id = $1 AND status = $2', [id, 'pending']);
    if (subRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return ctx.reply('⚠️ هذا الإثبات غير موجود أو تم معالجته مسبقًا.');
    }
    const sub = subRes.rows[0];
    const taskRes = await client.query('SELECT price FROM tasks WHERE id = $1', [sub.task_id]);
    const price = parseFloat(taskRes.rows[0]?.price) || 0;

    const updRes = await client.query('UPDATE users SET balance = COALESCE(balance,0) + $1 WHERE telegram_id = $2 RETURNING *', [price, sub.user_id]);
    if (updRes.rowCount === 0) {
      await client.query('INSERT INTO users (telegram_id, balance) VALUES ($1, $2)', [sub.user_id, price]);
    }
    try {
      await client.query('INSERT INTO earnings (user_id, amount, source, description) VALUES ($1, $2, $3, $4)', [sub.user_id, price, 'task', `task_submission:${id}`]);
    } catch (_) {}
    await client.query('UPDATE task_submissions SET status=$1, processed_at=NOW() WHERE id=$2', ['approved', id]);
    await client.query('COMMIT');
    await applyReferralBonus(sub.user_id, price);
    await ctx.reply(`✅ تمت الموافقة على الإثبات #${id} ورُصدت المكافأة (${price.toFixed(4)}$) للمستخدم.`);
    try { await bot.telegram.sendMessage(sub.user_id, `✅ تمت الموافقة على إثبات المهمة. ${price.toFixed(4)}$ أُضيفت إلى رصيدك.`); } catch (_) {}
  } catch (err) {
    await client.query('ROLLBACK').catch(()=>{});
    console.error('❌ approve command error:', err);
    await ctx.reply('حدث خطأ أثناء الموافقة.');
  }
});

bot.command('deny', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const id = Number((ctx.message.text.split(' ')[1] || '').trim());
  if (!id) return ctx.reply('❌ استخدم: /deny <ID>');

  try {
    const res = await client.query('UPDATE task_submissions SET status=$1, processed_at=NOW() WHERE id=$2 AND status=$3 RETURNING *', ['rejected', id, 'pending']);
    if (res.rowCount === 0) return ctx.reply('⚠️ هذا الإثبات غير موجود أو تم معالجته سابقًا.');
    await ctx.reply(`❌ تم رفض الإثبات #${id}`);
    try { await bot.telegram.sendMessage(res.rows[0].user_id, `❌ تم رفض إثبات المهمة (ID: ${res.rows[0].task_id}).`); } catch (_) {}
  } catch (err) {
    console.error('❌ deny command error:', err);
    await ctx.reply('حدث خطأ أثناء رفض الإثبات.');
  }
});

bot.command('deny', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const id = Number(ctx.message.text.split(' ')[1]);
  if (!id) return ctx.reply('❌ استخدم: /deny <ID>');

  try {
    const res = await client.query(
      'UPDATE task_submissions SET status=$1, processed_at=NOW() WHERE id=$2',
      ['denied', id]
    );
    if (res.rowCount === 0) return ctx.reply('❌ لم يتم العثور على الإثبات.');
    ctx.reply(`⛔ تم رفض إثبات #${id}.`);
  } catch (e) {
    console.error('❌ deny:', e);
    ctx.reply('خطأ أثناء الرفض.');
  }
});

// 🔐 لوحة الأدمن - الإحصائيات
bot.hears('📊 الإحصائيات', async (ctx) => {
  if (!isAdmin(ctx)) return;
  try {
    const [users, earnings, paid, pending] = await Promise.all([
      client.query('SELECT COUNT(*) AS c FROM users'),
      client.query('SELECT COALESCE(SUM(amount), 0) AS s FROM earnings'),
      client.query('SELECT COALESCE(SUM(amount), 0) AS s FROM withdrawals WHERE status = $1', ['paid']),
      client.query('SELECT COUNT(*) AS c FROM withdrawals WHERE status = $1', ['pending'])
    ]);

    await ctx.replyWithHTML(
      `📈 <b>الإحصائيات</b>\n\n` +
      `👥 عدد المستخدمين: <b>${users.rows[0].c}</b>\n` +
      `💰 الأرباح الموزعة: <b>${Number(earnings.rows[0].s).toFixed(2)}$</b>\n` +
      `📤 المدفوعات: <b>${Number(paid.rows[0].s).toFixed(2)}$</b>\n` +
      `⏳ طلبات معلقة: <b>${pending.rows[0].c}</b>`
    );
  } catch (err) {
    console.error('❌ خطأ في الإحصائيات:', err);
    await ctx.reply('حدث خطأ في جلب الإحصائيات.');
  }
});

// ➕ إضافة رصيد
bot.hears('➕ إضافة رصيد', async (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.session.awaitingAction = 'add_balance';
  ctx.session.targetUser = null;
  await ctx.reply('🆔 أرسل ID المستخدم لإضافة رصيد:');
});

// ➖ خصم رصيد
bot.hears('➖ خصم رصيد', async (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.session.awaitingAction = 'deduct_balance';
  ctx.session.targetUser = null;
  await ctx.reply('🆔 أرسل ID المستخدم لخصم رصيد:');
});

// 🔐 لوحة الأدمن - خروج
bot.hears('🚪 خروج من لوحة الأدمن', async (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.session = {};
  await ctx.reply('✅ خرجت من لوحة الأدمن.', Markup.keyboard([
      ['💰 رصيدك', '🎁 مصادر الربح'],
      ['📤 طلب سحب', '👥 ريفيرال']
    ]).resize()
  );
});

// أوامر الدفع/الرفض للأدمن
bot.command('pay', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const id = Number((ctx.message.text.split(' ')[1] || '').trim());
  if (!id) return ctx.reply('استخدم: /pay <ID>');
  try {
    const res = await client.query('UPDATE withdrawals SET status = $1 WHERE id = $2 RETURNING *', ['paid', id]);
    if (res.rowCount === 0) return ctx.reply('لم يتم العثور على الطلب.');
    await ctx.reply(`✅ تم تعليم الطلب #${id} كمدفوع.`);
  } catch (e) {
    console.error('❌ pay:', e);
    await ctx.reply('فشل تحديث الحالة.');
  }
});

bot.command('reject', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const id = Number((ctx.message.text.split(' ')[1] || '').trim());
  if (!id) return ctx.reply('استخدم: /reject <ID>');
  try {
    const res = await client.query('UPDATE withdrawals SET status = $1 WHERE id = $2 RETURNING *', ['rejected', id]);
    if (res.rowCount === 0) return ctx.reply('لم يتم العثور على الطلب.');
    await ctx.reply(`⛔ تم رفض الطلب #${id}.`);
  } catch (e) {
    console.error('❌ reject:', e);
    await ctx.reply('فشل تحديث الحالة.');
  }
});

// ==================== التشغيل النهائي ====================
(async () => {
  try {
    await connectDB();
    await initSchema(); // 🔵 تجهيز جداول الإحالة
    await bot.launch();
    console.log('✅ bot.js: البوت شُغّل بنجاح');

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
