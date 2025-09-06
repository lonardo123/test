import { Telegraf } from "npm:telegraf";
import postgres from "https://deno.land/x/postgresjs/mod.js";
import { serve } from "https://deno.land/std/http/server.ts";

// ====== متغيرات البيئة ======
const BOT_TOKEN = Deno.env.get("BOT_TOKEN") ?? "";
const DATABASE_URL = Deno.env.get("DATABASE_URL") ?? "";
const ADMIN_ID = Deno.env.get("ADMIN_ID") ?? "";
const WEBHOOK_URL = Deno.env.get("WEBHOOK_URL") ?? ""; 
const PORT = Number(Deno.env.get("PORT") ?? 3000);

// تحقق أولي
if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN غير معرف! أضفه في Environment Variables");
  throw new Error("BOT_TOKEN missing");
}
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL غير معرف! أضفه في Environment Variables");
  throw new Error("DATABASE_URL missing");
}

// ====== قاعدة البيانات ======
const sql = postgres(DATABASE_URL, { ssl: "require" });

// ====== تهيئة البوت ======
const bot = new Telegraf(BOT_TOKEN);

// ====== مثال أمر بسيط ======
bot.start((ctx) => ctx.reply("🚀 أهلاً! البوت شغال على Deno Deploy"));

// ====== Webhook ======
serve(async (req) => {
  const url = new URL(req.url);
  if (url.pathname === "/webhook" && req.method === "POST") {
    const body = await req.json();
    await bot.handleUpdate(body);
    return new Response("OK");
  }
  return new Response("Deno bot is running");
}, { port: PORT });

// ====== دوال الاتصال والـ schema ======
async function connectDB() {
  try {
    await sql`SELECT 1`;
    console.log("✅ اتصال بقاعدة البيانات ناجح");
  } catch (err) {
    console.error("❌ فشل الاتصال بقاعدة البيانات:", err?.message ?? err);
    // إعادة محاولة بعد 5 ثوانٍ
    setTimeout(connectDB, 5000);
  }
}

// 🔵 إنشاء/تحديث جميع الجداول عند الإقلاع
async function initSchema() {
  try {
    // جدول المستخدمين
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        telegram_id BIGINT UNIQUE NOT NULL,
        balance NUMERIC(12,6) DEFAULT 0,
        payeer_wallet VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

    // جدول الأرباح
    await sql`
      CREATE TABLE IF NOT EXISTS earnings (
        id SERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        source VARCHAR(100),
        amount NUMERIC(12,6) NOT NULL,
        description TEXT,
        timestamp TIMESTAMP DEFAULT NOW()
      )
    `;

    // جدول الإحالات
    await sql`
      CREATE TABLE IF NOT EXISTS referrals (
        id SERIAL PRIMARY KEY,
        referrer_id BIGINT NOT NULL,
        referee_id BIGINT NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

    // جدول أرباح الإحالة
    await sql`
      CREATE TABLE IF NOT EXISTS referral_earnings (
        id SERIAL PRIMARY KEY,
        referrer_id BIGINT NOT NULL,
        referee_id BIGINT NOT NULL,
        amount NUMERIC(12,6) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

    // جدول المهمات
    await sql`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        price NUMERIC(12,6) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

    // إضافة العمود duration_seconds لو مش موجود
    await sql`
      ALTER TABLE tasks 
      ADD COLUMN IF NOT EXISTS duration_seconds INT DEFAULT 2592000
    `;

    // جدول إثباتات المهمات
    await sql`
      CREATE TABLE IF NOT EXISTS task_proofs (
        id SERIAL PRIMARY KEY,
        task_id INT NOT NULL,
        user_id BIGINT NOT NULL,
        proof TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;
    
    // جدول تتبع حالة المهمة لكل مستخدم
    await sql`
      CREATE TABLE IF NOT EXISTS user_tasks (
        id SERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        task_id INT NOT NULL,
        status VARCHAR(20) DEFAULT 'pending', -- pending | approved | rejected
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, task_id)
      )
    `;

    // جدول السحوبات
    await sql`
      CREATE TABLE IF NOT EXISTS withdrawals (
        id SERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        amount NUMERIC(12,6) NOT NULL,
        payeer_wallet VARCHAR(50) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        requested_at TIMESTAMP DEFAULT NOW()
      )
    `;

    console.log('✅ initSchema: تم تجهيز كل الجداول بنجاح');
  } catch (e) {
    console.error('❌ initSchema:', e);
  }
}

// ====== بدء الاتصال وقبول الـ schema ======
await connectDB();
await initSchema();

// مثال: أمر /start (نسخة محسّنة)
bot.start(async (ctx) => {
  let botUsername = ctx.botInfo?.username;
  if (!botUsername) {
    try {
      const me = await bot.telegram.getMe();
      botUsername = me.username;
    } catch {
      botUsername = "bot";
    }
  }

  try {
    await sql`
      INSERT INTO users (telegram_id)
      VALUES (${ctx.from.id})
      ON CONFLICT (telegram_id) DO NOTHING
    `;
  } catch (e) {
    console.error("⚠️ خطأ عند تسجيل المستخدم:", e?.message ?? e);
  }

  await ctx.reply(
    `🚀 أهلاً! البوت شغال على Deno Deploy\nرابط الإحالة (مثال): https://t.me/${botUsername}?start=ref_${ctx.from.id}`
  );
});

// مثال: رسالة نصية رد بسيط
bot.on("text", (ctx) => {
  ctx.reply("استلمت رسالتك — شكراً لك!");
});

// ====== إعداد Webhook تلقائيًا إذا وُجد WEBHOOK_URL (اختياري) ======
if (WEBHOOK_URL) {
  try {
    const webhookPath = "/webhook";
    const webhookFull = WEBHOOK_URL.replace(/\/$/, "") + webhookPath;
    await bot.telegram.setWebhook(webhookFull);
    console.log(`✅ تم تعيين الويبهوك إلى: ${webhookFull}`);
  } catch (e) {
    console.error("⚠️ فشل تعيين الويبهوك تلقائيًا:", e?.message ?? e);
  }
}
// ====== HTTP server (Webhook handler + health) ======
serve(async (req) => {
  try {
    const url = new URL(req.url);
    // health check
    if (url.pathname === "/health") {
      return new Response("OK", { status: 200 });
    }

    // webhook endpoint يجب أن يتلقي POST من telegram
    if (url.pathname === "/webhook" && req.method === "POST") {
      const body = await req.json();
      await bot.handleUpdate(body);
      return new Response("OK", { status: 200 });
    }

    // صفحه افتراضية
    return new Response("Deno bot is running", { status: 200 });
  } catch (err) {
    console.error("Server error:", err);
    return new Response("Server error", { status: 500 });
  }
  // ملاحظة: Deno Deploy يتجاهل عادة خيار PORT على مستوى المنصة
});

// ====== Bot setup ======
// ⚠️ شيل التكرار، البوت معرف بالفعل فوق
// const bot = new Telegraf(process.env.BOT_TOKEN);

// Enable in-memory sessions
// import { session } from "npm:telegraf"; // لازم تضيف الاستيراد فوق
bot.use(session());

// Simple logger
bot.use((ctx, next) => {
  const from = ctx.from ? `${ctx.from.id} (${ctx.from.username || ctx.from.first_name})` : 'unknown';
  const text = ctx.message?.text || ctx.updateType;
  console.log('📩', from, '→', text);
  return next();
});

// Utility: ensure admin
const isAdmin = (ctx) => String(ctx.from?.id) === String(Deno.env.get("ADMIN_ID"));

// 🔵 أداة مساعدة: تطبيق مكافأة الإحالة (5%) عند إضافة أرباح للمستخدم
async function applyReferralBonus(earnerId, earnedAmount) {
  try {
    const ref = await sql`SELECT referrer_id FROM referrals WHERE referee_id = ${earnerId}`;
    if (ref.length === 0) return;

    const referrerId = ref[0].referrer_id;
    if (!referrerId || Number(referrerId) === Number(earnerId)) return;

    const bonus = Number(earnedAmount) * 0.05;
    if (bonus <= 0) return;

    const balRes = await sql`SELECT balance FROM users WHERE telegram_id = ${referrerId}`;
    if (balRes.length === 0) {
      await sql`INSERT INTO users (telegram_id, balance) VALUES (${referrerId}, 0)`;
    }

    await sql`UPDATE users SET balance = COALESCE(balance,0) + ${bonus} WHERE telegram_id = ${referrerId}`;
    await sql`INSERT INTO referral_earnings (referrer_id, referee_id, amount) VALUES (${referrerId}, ${earnerId}, ${bonus})`;

    try {
      await sql`INSERT INTO earnings (user_id, amount, source) VALUES (${referrerId}, ${bonus}, 'referral_bonus')`;
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
  const targetId = parts[1];
  const amount = Number(parts[2]);
  if (!targetId || isNaN(amount)) {
    return ctx.reply('استخدم: /credit <userId> <amount>');
  }
  try {
    await sql`UPDATE users SET balance = COALESCE(balance,0) + ${amount} WHERE telegram_id = ${targetId}`;
    try {
      await sql`INSERT INTO earnings (user_id, amount, source) VALUES (${targetId}, ${amount}, 'manual_credit')`;
    } catch (_) {}
    await applyReferralBonus(targetId, amount);
    return ctx.reply(`✅ تم إضافة ${amount.toFixed(4)}$ للمستخدم ${targetId} وتطبيق مكافأة الإحالة (إن وجدت).`);
  } catch (e) {
    console.error('❌ /credit:', e);
    return ctx.reply('فشل في إضافة الرصيد.');
  }
});
// 🔵 👥 ريفيرال — عرض رابط الإحالة + شرح
bot.hears('👥 ريفيرال', async (ctx) => {
  const userId = ctx.from.id;
  const botUsername = 'TasksRewardBot';
  const refLink = `https://t.me/${botUsername}?start=ref_${userId}`;

  try {
    const countRes = await sql`SELECT COUNT(*)::int AS c FROM referrals WHERE referrer_id = ${userId}`;
    const refsCount = countRes[0]?.c || 0;

    const earnRes = await sql`SELECT COALESCE(SUM(amount),0)::float AS s FROM referral_earnings WHERE referrer_id = ${userId}`;
    const refEarnings = earnRes[0]?.s || 0;

    await ctx.replyWithHTML(
`👥 <b>برنامج الإحالة</b>
هذا رابطك الخاص، شاركه مع أصدقائك واربح من نشاطهم:
🔗 <code>${refLink}</code>

💡 <b>كيف تُحتسب أرباح الإحالة؟</b>
تحصل على <b>5%</b> من أرباح كل مستخدم ينضم من طرفك.

📊 <b>إحصاءاتك</b>
- عدد الإحالات: <b>${refsCount}</b>
- أرباحك من الإحالات: <b>${refEarnings.toFixed(4)}$</b>`
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

  await ctx.reply(
    'اختر مصدر ربح:',
    Markup.inlineKeyboard([
      [Markup.button.url('🕒 TimeWall', timewallUrl)],
    ])
  );

  await ctx.replyWithHTML(
`📌 <b>طريقة العمل:</b>
1️⃣ اضغط على 🎁 <b>مصادر الربح</b> في القائمة.
2️⃣ اختر 🕒 <b>TimeWall</b>.
3️⃣ اربط حسابك عبر الرابط الظاهر.
4️⃣ نفّذ المهام (مشاهدة إعلانات – تنفيذ مهام بسيطة).

🔑 <b>طريقة سحب المال من TimeWall:</b>
- ادخل صفحة Withdraw
- اضغط على زر "سحب" أعلى الصفحة
✅ الأرباح تضاف لحسابك مباشرة 💵`
  );
});

// ✅ عرض المهمات
bot.hears('📝 مهمات TasksRewardBot', async (ctx) => {
  try {
    const userId = ctx.from.id;
    const res = await sql`
      SELECT t.id, t.title, t.description, t.price,
             COALESCE(t.duration_seconds, 2592000) AS duration_seconds,
             ut.status, ut.created_at AS applied_at
      FROM tasks t
      LEFT JOIN user_tasks ut
        ON ut.task_id = t.id AND ut.user_id = ${userId}
      WHERE NOT EXISTS (
        SELECT 1 FROM user_tasks ut2
        WHERE ut2.task_id = t.id
          AND ut2.user_id = ${userId}
          AND ut2.status IN ('pending','approved')
      )
      ORDER BY t.id DESC
      LIMIT 20`;

    if (res.length === 0) {
      return ctx.reply('❌ لا توجد مهمات متاحة حالياً.');
    }

    // ... (باقي الكود نفسه زي ما عندك، بس الاستعلامات تتحول لنفس نمط sql`...`)
  } catch (err) {
    console.error('❌ عرض المهمات:', err);
    ctx.reply('حدث خطأ أثناء عرض المهمات.');
  }
});

// ✅ عند الضغط على زر "قدّم الآن"
bot.action(/^apply_(\d+)$/, async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const taskId = Number(ctx.match[1]);
    const userId = ctx.from.id;

    let durationSeconds = 30 * 24 * 60 * 60;
    try {
      const tRes = await sql`SELECT duration_seconds FROM tasks WHERE id = ${taskId}`;
      if (tRes.length && tRes[0].duration_seconds) {
        durationSeconds = Number(tRes[0].duration_seconds);
      }
    } catch (e) {
      console.error('❌ خطأ جلب duration_seconds:', e);
    }

    await sql`
      INSERT INTO user_tasks (user_id, task_id, status, created_at)
      VALUES (${userId}, ${taskId}, 'applied', ${new Date()})
      ON CONFLICT (user_id, task_id) DO UPDATE
        SET status = 'applied', created_at = ${new Date()}`;

    await ctx.reply(
      `📌 تم تسجيل تقديمك على المهمة رقم ${taskId}.
⏱️ مدة المهمة: ${Math.floor(durationSeconds/86400)} يوم.
⏳ بعد انتهاء هذه المدة سيظهر لك زر "📝 إرسال إثبات" لإرسال الإثبات.`
    );
  } catch (err) {
    console.error('❌ apply error:', err);
    try { await ctx.answerCbQuery(); } catch(_) {}
    await ctx.reply('⚠️ حدث خطأ أثناء التقديم.');
  }
});

// معالجة نصوص عامة (سابقاً كان فيها تعارض مع إرسال الإثبات) — لا تزدوج إرسال الإثبات هنا
bot.on('text', async (ctx, next) => {
  if (!ctx.session) ctx.session = {};
  const text = ctx.message?.text?.trim();

  const menuTexts = new Set([
    '💰 رصيدك','🎁 مصادر الربح','📤 طلب سحب','👥 ريفيرال',
    '📋 عرض الطلبات','📊 الإحصائيات',
    '➕ إضافة رصيد','➖ خصم رصيد',
    '🚪 خروج من لوحة الأدمن'
  ]);

  // —— طلب السحب ——
  if (ctx.session.awaiting_withdraw) {
    if (!/^P\d{8,}$/i.test(text)) {
      return ctx.reply('❌ رقم محفظة غير صالح. يجب أن يبدأ بـ P ويحتوي على 8 أرقام على الأقل.');
    }

    const userId = ctx.from.id;
    try {
      const userRes = await client.query('SELECT balance FROM users WHERE telegram_id = $1', [userId]);
      let balance = parseFloat(userRes.rows[0]?.balance) || 0;

      if (balance < MIN_WITHDRAW) {
        return ctx.reply(`❌ الحد الأدنى للسحب هو ${MIN_WITHDRAW}$. رصيدك: ${balance.toFixed(4)}$`);
      }

      const withdrawAmount = Math.floor(balance * 100) / 100;
      const remaining = balance - withdrawAmount;

      await client.query(
        'INSERT INTO withdrawals (user_id, amount, payeer_wallet) VALUES ($1, $2, $3)',
        [userId, withdrawAmount, text.toUpperCase()]
      );
      await client.query('UPDATE users SET balance = $1 WHERE telegram_id = $2', [remaining, userId]);

      await ctx.reply(`✅ تم تقديم طلب سحب بقيمة ${withdrawAmount.toFixed(2)}$. رصيدك المتبقي: ${remaining.toFixed(4)}$`);
      delete ctx.session.awaiting_withdraw;
    } catch (err) {
      console.error('❌ خطأ في معالجة السحب:', err);
      await ctx.reply('حدث خطأ داخلي.');
    }

    return;
  }

  // —— إضافة / خصم رصيد ——
  if (ctx.session.awaitingAction === 'add_balance' || ctx.session.awaitingAction === 'deduct_balance') {
    if (!ctx.session.targetUser) {
      ctx.session.targetUser = text;
      return ctx.reply('💵 أرسل المبلغ:');
    } else {
      const userId = ctx.session.targetUser;
      const amount = parseFloat(text);

      if (isNaN(amount)) {
        delete ctx.session.awaitingAction;
        delete ctx.session.targetUser;
        return ctx.reply('❌ المبلغ غير صالح.');
      }

      try {
        const res = await client.query('SELECT balance FROM users WHERE telegram_id = $1', [userId]);
        if (res.rows.length === 0) {
          delete ctx.session.awaitingAction;
          delete ctx.session.targetUser;
          return ctx.reply('❌ المستخدم غير موجود.');
        }

        let balance = parseFloat(res.rows[0].balance) || 0;
        let newBalance = ctx.session.awaitingAction === 'add_balance' ? balance + amount : balance - amount;
        if (newBalance < 0) newBalance = 0;

        await client.query('UPDATE users SET balance = $1 WHERE telegram_id = $2', [newBalance, userId]);

        if (ctx.session.awaitingAction === 'add_balance' && amount > 0) {
          await applyReferralBonus(userId, amount);
          try {
            await client.query(
              'INSERT INTO earnings (user_id, amount, source) VALUES ($1,$2,$3)',
              [userId, amount, 'admin_adjust']
            );
          } catch(_) {}
        }

        ctx.reply(`✅ تم ${ctx.session.awaitingAction === 'add_balance' ? 'إضافة' : 'خصم'} ${amount.toFixed(4)}$ للمستخدم ${userId}.\n💰 رصيده الجديد: ${newBalance.toFixed(4)}$`);
      } catch (err) {
        console.error('❌ خطأ تحديث الرصيد:', err);
        ctx.reply('❌ فشل تحديث الرصيد.');
      }

      delete ctx.session.awaitingAction;
      delete ctx.session.targetUser;
      return;
    }
  }

  if (menuTexts.has(text)) return next();
  return next();
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

// ➕ إضافة مهمة جديدة (محدّث: يدعم مدة خاصة لكل مهمة)
bot.hears('➕ إضافة مهمة جديدة', async (ctx) => {
  if (!isAdmin(ctx)) return;
  ctx.session.awaitingAction = 'add_task';
  ctx.reply(
    '📌 أرسل المهمة الجديدة بصيغة: العنوان | الوصف | السعر | المدة (اختياري)\n' +
    'مثال مدة: 3600s أو 60m أو 1h أو 5d\n' +
    'مثال كامل: coinpayu | اجمع رصيد وارفق رابط التسجيل https://... | 0.0500 | 30d'
  );
});

// إضافة مهمة - أدمن (مع دعم المدة الخاصة)
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

    // تحليل السعر
    const numMatch = priceStr.match(/^\d+(?:[.,]\d+)?$/);
    if (!numMatch) {
      return ctx.reply('❌ السعر غير صالح. مثال صحيح: 0.0010 أو 0.0500');
    }
    const price = parseFloat(numMatch[0].replace(',', '.'));
    if (isNaN(price) || price <= 0) {
      return ctx.reply('❌ السعر غير صالح. مثال صحيح: 0.0010');
    }

    // تحويل نص المدة إلى ثواني
    const parseDurationToSeconds = (s: string) => {
      if (!s) return null;
      s = ('' + s).trim().toLowerCase();

      const m = s.match(/^(\d+(?:[.,]\d+)?)(s|sec|secs|m|min|h|d)?$/i);
      if (!m) return null;
      let num = m[1].replace(',', '.');
      let val = parseFloat(num);
      if (isNaN(val) || val < 0) return null;
      const unit = m[2]?.toLowerCase() || '';

      switch (unit) {
        case 's': case 'sec': case 'secs': return Math.round(val);
        case 'm': case 'min': return Math.round(val * 60);
        case 'h': return Math.round(val * 3600);
        case 'd': return Math.round(val * 86400);
        default: return Math.round(val);
      }
    };

    const DEFAULT_DURATION_SECONDS = 30 * 24 * 60 * 60;
    let durationSeconds = DEFAULT_DURATION_SECONDS;
    if (durationStr) {
      const parsed = parseDurationToSeconds(durationStr);
      if (parsed === null || parsed <= 0) {
        return ctx.reply('❌ صيغة المدة غير مفهومة. استخدم أمثلة: 3600s أو 60m أو 1h أو 5d');
      }
      durationSeconds = parsed;
    }

    try {
      const res = await client.query(
        'INSERT INTO tasks (title, description, price, duration_seconds) VALUES ($1,$2,$3,$4) RETURNING id, title, price, duration_seconds',
        [title, description, price, durationSeconds]
      );

      const formatDuration = (secs: number) => {
        if (!secs) return 'غير محددة';
        if (secs % 86400 === 0) return `${secs / 86400} يوم`;
        if (secs % 3600 === 0) return `${secs / 3600} ساعة`;
        if (secs % 60 === 0) return `${secs / 60} دقيقة`;
        return `${secs} ثانية`;
      };

      const formattedDescription = description.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1">$1</a>');

      await ctx.replyWithHTML(
        `✅ تم إضافة المهمة بنجاح.\n\n📌 <b>العنوان:</b> ${res.rows[0].title}\n` +
        `📝 <b>الوصف:</b> ${formattedDescription}\n` +
        `💰 <b>السعر:</b> ${parseFloat(res.rows[0].price).toFixed(4)}\n` +
        `⏱️ <b>مدة المهمة:</b> ${formatDuration(res.rows[0].duration_seconds)}`,
        { disable_web_page_preview: true }
      );

      delete ctx.session.awaitingAction;
    } catch (err: any) {
      console.error('❌ إضافة مهمة: ', err.message);
      console.error(err.stack);
      ctx.reply('حدث خطأ أثناء إضافة المهمة. راجع سجلات السيرفر (console) لمعرفة التفاصيل.');
    }

    return;
  }

  return next();
});

 // ====== دالة مساعدة لتحويل نص المدة إلى ثواني ======
const parseDurationToSeconds = (s: string): number | null => {
  if (!s) return null;
  s = ('' + s).trim().toLowerCase();
  const m = s.match(/^(\d+(?:[.,]\d+)?)(s|sec|secs|m|min|h|d)?$/i);
  if (!m) return null;
  let num = m[1].replace(',', '.');
  let val = parseFloat(num);
  if (isNaN(val) || val < 0) return null;
  const unit = (m[2] || '').toLowerCase();
  switch (unit) {
    case 's': case 'sec': case 'secs': return Math.round(val);
    case 'm': case 'min': return Math.round(val * 60);
    case 'h': return Math.round(val * 3600);
    case 'd': return Math.round(val * 86400);
    default: return Math.round(val); // بدون وحدة → نعتبرها ثواني
  }
};

// ====== دالة لتنسيق المدة للعرض ======
const formatDuration = (secs: number): string => {
  if (!secs) return 'غير محددة';
  if (secs < 60) return `${secs} ثانية`;
  if (secs < 3600) return `${Math.floor(secs / 60)} دقيقة`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} ساعة`;
  return `${Math.floor(secs / 86400)} يوم`;
};

// ✏️ زر تعديل المهمة
bot.action(/^edit_(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.answerCbQuery('❌ غير مسموح');
    return;
  }
  const taskId = ctx.match[1];
  ctx.session.awaitingEdit = taskId;
  await ctx.answerCbQuery();
  await ctx.reply(
    `✏️ أرسل المهمة الجديدة لـ #${taskId} بصيغة:\n\n` +
    `العنوان | الوصف | السعر | المدة\n\n` +
    `👉 المدة اكتبها بالدقائق أو الساعات أو الأيام.\n` +
    `مثال:\ncoinpayu | اجمع رصيد وارفق رابط التسجيل https://... | 0.0500 | 3 أيام`
  );
});

// 📌 استقبال التعديلات من الأدمن (موحد)
bot.on('text', async (ctx, next) => {
  if (!ctx.session || !ctx.session.awaitingEdit) return next();
  if (!isAdmin(ctx)) {
    delete ctx.session.awaitingEdit;
    return ctx.reply('❌ ليس لديك صلاحيات الأدمن.');
  }

  const taskId = ctx.session.awaitingEdit;
  const raw = ctx.message.text || '';
  const parts = raw.split('|').map(p => p.trim());

  if (parts.length < 4) {
    return ctx.reply(
      '❌ صيغة خاطئة.\n' +
      'استخدم: العنوان | الوصف | السعر | المدة\n' +
      'مثال: coinpayu | اجمع رصيد | 0.0500 | 2 ساعات'
    );
  }

  const title = parts[0];
  const description = parts[1];
  const rewardStr = parts[2];
  const durationStr = parts[3];

  // ✅ تحويل السعر
  const numMatch = rewardStr.match(/^\d+(?:[.,]\d+)?$/);
  if (!numMatch) {
    return ctx.reply('❌ السعر غير صالح. مثال صحيح: 0.0010 أو 0.0500');
  }
  const price = parseFloat(numMatch[0].replace(',', '.'));
  if (isNaN(price) || price <= 0) {
    return ctx.reply('❌ السعر غير صالح. مثال صحيح: 0.0010');
  }

  // ✅ تحويل المدة إلى ثواني
  const durationSeconds = parseDurationToSeconds(durationStr);
  if (!durationSeconds || durationSeconds <= 0) {
    return ctx.reply('❌ المدة غير صالحة. مثال: 3 أيام أو 5 ساعات أو 120 دقيقة.');
  }

  try {
    await client.query(
      'UPDATE tasks SET title=$1, description=$2, price=$3, duration_seconds=$4 WHERE id=$5',
      [title, description, price, durationSeconds, taskId]
    );

    await ctx.replyWithHTML(
      `✅ تم تعديل المهمة #${taskId} بنجاح.\n\n` +
      `🏷️ <b>العنوان:</b> ${title}\n` +
      `📖 <b>الوصف:</b> ${description}\n` +
      `💰 <b>السعر:</b> ${price.toFixed(4)}\n` +
      `🕒 <b>المدة:</b> ${formatDuration(durationSeconds)}`
    );

    delete ctx.session.awaitingEdit;
  } catch (err) {
    console.error('❌ تعديل مهمة: ', err.message);
    ctx.reply('حدث خطأ أثناء تعديل المهمة.');
  }
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
    try {
      await ctx.editMessageText(`🗑️ تم حذف المهمة #${taskId}`);
    } catch (_) {
      await ctx.reply(`🗑️ تم حذف المهمة #${taskId}`);
    }
    await ctx.answerCbQuery();
  } catch (err) {
    console.error('❌ حذف المهمة:', err);
    await ctx.answerCbQuery('حدث خطأ أثناء الحذف.');
    await ctx.reply('حدث خطأ أثناء حذف المهمة.');
  }
});

// ... (باقي الأكواد زي ما هي: approve, deny, الإحصائيات, pay, reject)

// 🔐 لوحة الأدمن - خروج
bot.hears('🚪 خروج من لوحة الأدمن', async (ctx) => {
  if (!isAdmin(ctx)) return;

  delete ctx.session.awaitingAction;
  delete ctx.session.awaitingEdit;
  delete ctx.session.targetUser;

  const userId = ctx.from.id;
  const res = await client.query('SELECT balance FROM users WHERE telegram_id = $1', [userId]);
  const balance = parseFloat(res.rows[0]?.balance) || 0;

  await ctx.reply(`✅ خرجت من لوحة الأدمن.\n💰 رصيدك: ${balance.toFixed(4)}$`,
    Markup.keyboard([
      ['💰 رصيدك', '🎁 مصادر الربح'],
      ['📤 طلب سحب', '👥 ريفيرال'],
      ['📝 مهمات TasksRewardBot', '🔗 قيم البوت من هنا']
    ]).resize()
  );
});

// ==================== التشغيل النهائي ====================
(async () => {
  try {
    await connectDB();
    await initSchema();
    await bot.launch();
    console.log('✅ bot.js: البوت شُغّل بنجاح');

    process.once('SIGINT', async () => {
      console.log('🛑 SIGINT: stopping bot...');
      bot.stop('SIGINT');
      await client.end();
      console.log('🗄️ Postgres connection closed.');
    });
    process.once('SIGTERM', async () => {
      console.log('🛑 SIGTERM: stopping bot...');
      bot.stop('SIGTERM');
      await client.end();
      console.log('🗄️ Postgres connection closed.');
    });

  } catch (error) {
    console.error('❌ فشل في التشغيل:', error);
  }
})();
