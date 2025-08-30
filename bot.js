
// ---------------- Imports ----------------
const { Telegraf, Markup, session } = require("telegraf");
const { Client } = require("pg");
require("dotenv").config();

// ---------------- Environment ----------------
const BOT_TOKEN = process.env.BOT_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;
const ADMIN_ID = process.env.ADMIN_ID;

if (!BOT_TOKEN || !DATABASE_URL || !ADMIN_ID) {
  console.error("❌ Missing environment variables!");
  process.exit(1);
}

// ---------------- Bot & DB Init ----------------
const bot = new Telegraf(BOT_TOKEN);
bot.use(session());

const client = new Client({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

client.connect().then(() => console.log("✅ PostgreSQL Connected"))
.catch(err => { console.error("❌ DB Error:", err); process.exit(1); });

// ---------------- Schema Init ----------------
async function initSchema() {
  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      telegram_id BIGINT UNIQUE NOT NULL,
      balance NUMERIC(18,6) DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS earnings (
      id SERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      amount NUMERIC(18,6) NOT NULL,
      source TEXT,
      description TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS withdrawals (
      id SERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      amount NUMERIC(18,2) NOT NULL,
      payeer_wallet VARCHAR(64),
      status VARCHAR(20) DEFAULT 'pending',
      requested_at TIMESTAMP DEFAULT NOW(),
      processed_at TIMESTAMP,
      admin_note TEXT
    );

    CREATE TABLE IF NOT EXISTS referrals (
      id SERIAL PRIMARY KEY,
      referrer_id BIGINT NOT NULL,
      referred_id BIGINT NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS referral_earnings (
      id SERIAL PRIMARY KEY,
      referrer_id BIGINT NOT NULL,
      referred_id BIGINT NOT NULL,
      amount NUMERIC(18,6) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      price NUMERIC(18,6) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS task_proofs (
      id SERIAL PRIMARY KEY,
      task_id INT NOT NULL REFERENCES tasks(id),
      user_id BIGINT NOT NULL,
      proof TEXT NOT NULL,
      status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW(),
      reviewed_at TIMESTAMP,
      reviewed_by BIGINT
    );
  `);
}
initSchema();

// ---------------- Menu ----------------
const menuTexts = {
  balance: "💰 الرصيد",
  earn: "💵 الربح من الإحالات",
  tasks: "📝 المهام",
  addBalance: "➕ إضافة رصيد",
  withdraw: "💳 سحب الأرباح",
  support: "📞 الدعم"
};

function mainMenu() {
  return Markup.keyboard([
    [menuTexts.balance, menuTexts.earn],
    [menuTexts.tasks, menuTexts.addBalance],
    [menuTexts.withdraw, menuTexts.support]
  ]).resize();
}

// ---------------- Commands ----------------
bot.start(async (ctx) => {
  try {
    const userId = ctx.from.id;
    await client.query(
      "INSERT INTO users (telegram_id) VALUES ($1) ON CONFLICT (telegram_id) DO NOTHING",
      [userId]
    );
    await ctx.reply("👋 مرحباً بك!", mainMenu());
  } catch (err) {
    console.error("start error:", err);
  }
});

// ----- الرصيد -----
bot.hears(menuTexts.balance, async (ctx) => {
  try {
    const res = await client.query("SELECT balance FROM users WHERE telegram_id = $1", [ctx.from.id]);
    const balance = res.rows[0]?.balance || 0;
    await ctx.reply(`💰 رصيدك الحالي: ${parseFloat(balance).toFixed(6)}`);
  } catch (err) {
    console.error("balance error:", err);
  }
});

// ----- المهام -----
bot.command("tasks", async (ctx) => {
  try {
    const res = await client.query("SELECT * FROM tasks ORDER BY id DESC");
    if (!res.rows.length) return ctx.reply("⚠️ لا توجد مهام حالياً.");
    for (const task of res.rows) {
      await ctx.reply(
        `📝 المهمة: ${task.title}
📖 الوصف: ${task.description}
💰 السعر: ${parseFloat(task.price).toFixed(6)}`,
        Markup.inlineKeyboard([
          [Markup.button.callback("📩 إرسال إثبات", `submit_${task.id}`)]
        ])
      );
    }
  } catch (err) {
    console.error("tasks error:", err);
  }
});

// ---------------- Task Proof Submit ----------------
bot.action(/^submit_(\d+)$/, async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const taskId = ctx.match[1];
    if (!ctx.session) ctx.session = {};
    ctx.session.awaiting_task_submission = taskId;
    await ctx.reply(`📩 أرسل الآن إثبات إتمام المهمة رقم ${taskId}`);
  } catch (err) {
    console.error("submit error:", err);
  }
});

bot.on("message", async (ctx) => {
  if (!ctx.session) ctx.session = {};
  if (!ctx.session.awaiting_task_submission) return;

  const taskId = ctx.session.awaiting_task_submission;
  let proof = ctx.message.text || "";
  if (ctx.message.photo) {
    const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    proof = `صورة مرفقة - file_id: ${fileId}`;
  }

  try {
    await client.query(
      "INSERT INTO task_proofs (task_id, user_id, proof, status, created_at) VALUES ($1, $2, $3, $4, NOW())",
      [taskId, ctx.from.id, proof, "pending"]
    );
    await ctx.reply("✅ تم إرسال الإثبات، وسيتم مراجعته من الإدارة.");
    ctx.session.awaiting_task_submission = null;
  } catch (err) {
    console.error("proof save error:", err);
    ctx.reply("⚠️ لم يتم حفظ الإثبات.");
  }
});

// ---------------- Withdraw ----------------
bot.hears(menuTexts.withdraw, async (ctx) => {
  ctx.session.awaiting_withdraw_amount = true;
  await ctx.reply("💳 أدخل المبلغ الذي تريد سحبه:");
});

bot.on("text", async (ctx) => {
  if (ctx.session.awaiting_withdraw_amount) {
    const amount = parseFloat(ctx.message.text);
    if (isNaN(amount) || amount <= 0) {
      return ctx.reply("⚠️ الرجاء إدخال مبلغ صحيح.");
    }
    ctx.session.awaiting_withdraw_amount = false;
    ctx.session.withdraw_amount = amount;
    ctx.session.awaiting_wallet = true;
    return ctx.reply("💼 أدخل محفظة Payeer الخاصة بك:");
  }

  if (ctx.session.awaiting_wallet) {
    const wallet = ctx.message.text;
    const amount = ctx.session.withdraw_amount;
    try {
      await client.query(
        "INSERT INTO withdrawals (user_id, amount, payeer_wallet, status) VALUES ($1, $2, $3, $4)",
        [ctx.from.id, amount, wallet, "pending"]
      );
      await ctx.reply("✅ تم إرسال طلب السحب بنجاح.");
    } catch (err) {
      console.error("withdraw error:", err);
    }
    ctx.session.awaiting_wallet = false;
  }
});

// ---------------- Admin ----------------
bot.command("add_task", async (ctx) => {
  if (ctx.from.id.toString() !== ADMIN_ID) return;
  ctx.session.adding_task = {};
  await ctx.reply("📝 أرسل عنوان المهمة:");
});

bot.on("text", async (ctx) => {
  if (ctx.session.adding_task && !ctx.session.adding_task.title) {
    ctx.session.adding_task.title = ctx.message.text;
    return ctx.reply("📖 أرسل وصف المهمة:");
  }
  if (ctx.session.adding_task && !ctx.session.adding_task.description) {
    ctx.session.adding_task.description = ctx.message.text;
    return ctx.reply("💰 أرسل سعر المهمة:");
  }
  if (ctx.session.adding_task && !ctx.session.adding_task.price) {
    const price = parseFloat(ctx.message.text);
    if (isNaN(price) || price <= 0) {
      return ctx.reply("⚠️ الرجاء إدخال سعر صحيح.");
    }
    ctx.session.adding_task.price = price;
    try {
      await client.query(
        "INSERT INTO tasks (title, description, price) VALUES ($1, $2, $3)",
        [ctx.session.adding_task.title, ctx.session.adding_task.description, ctx.session.adding_task.price]
      );
      await ctx.reply("✅ تم إضافة المهمة بنجاح.");
    } catch (err) {
      console.error("add_task error:", err);
    }
    ctx.session.adding_task = null;
  }
});

// ---------------- Bot Launch ----------------
bot.launch().then(() => console.log("🤖 Bot Started"));
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
