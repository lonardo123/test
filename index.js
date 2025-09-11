// index.js - Telegram Task Bot for Cloudflare Workers
import { Application, session } from "https://deno.land/x/grammy@v1.38.2/mod.ts";
import { MemorySessionStorage } from "https://deno.land/x/grammy@v1.38.2/sessions.js";
import { Client } from "@neondatabase/serverless";

// ⚙️ استبدل هذا بـ Connection String من CockroachDB أو Neon
const DATABASE_URL = Deno.env.get("DATABASE_URL");
if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");

const sql = new Client({ connectionString: DATABASE_URL });

// 🛠️ إنشاء الجدول إذا لم يكن موجودًا
async function ensureTable() {
  await sql.connect();
  await sql.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      task_text TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      is_done BOOLEAN DEFAULT FALSE
    );
  `);
  await sql.end();
  console.log("✅ Table ensured");
}

// ➕ إضافة مهمة
async function addTask(userId, text) {
  await sql.connect();
  await sql.query(
    "INSERT INTO tasks (user_id, task_text) VALUES ($1, $2)",
    [userId, text]
  );
  await sql.end();
}

// 📋 جلب المهام
async function getTasks(userId, onlyPending = false) {
  await sql.connect();
  const query = onlyPending
    ? "SELECT id, task_text, is_done FROM tasks WHERE user_id = $1 AND is_done = FALSE ORDER BY created_at DESC"
    : "SELECT id, task_text, is_done FROM tasks WHERE user_id = $1 ORDER BY created_at DESC";
  const result = await sql.query(query, [userId]);
  await sql.end();
  return result.rows;
}

// ✅ تبديل حالة المهمة
async function toggleTask(taskId) {
  await sql.connect();
  await sql.query("UPDATE tasks SET is_done = NOT is_done WHERE id = $1", [taskId]);
  await sql.end();
}

// 🗑️ حذف مهمة
async function deleteTask(taskId) {
  await sql.connect();
  await sql.query("DELETE FROM tasks WHERE id = $1", [taskId]);
  await sql.end();
}

// 🎯 بدء البوت
const BOT_TOKEN = Deno.env.get("BOT_TOKEN");
if (!BOT_TOKEN) throw new Error("BOT_TOKEN is not set");

const bot = new Application({ token: BOT_TOKEN });

bot.use(session({ storage: new MemorySessionStorage() }));

// /start
bot.command("start", async (ctx) => {
  const firstName = ctx.from?.first_name || "User";
  await ctx.reply(
    `👋 مرحباً ${firstName}!\n` +
    `أنا بوتك لإدارة المهام 📝\n` +
    `/add <المهمة> - لإضافة مهمة جديدة\n` +
    `/list - لعرض المهام\n` +
    `/pending - لعرض المهام الغير منجزة فقط`
  );
});

// /add
bot.command("add", async (ctx) => {
  const args = ctx.message?.text.split(" ").slice(1).join(" ");
  if (!args) {
    return await ctx.reply("❌ يرجى كتابة المهمة بعد الأمر. مثال:\n/add شراء الحليب");
  }
  await addTask(ctx.from.id, args);
  await ctx.reply("✅ تمت إضافة المهمة بنجاح!");
});

// /list
bot.command("list", async (ctx) => {
  const tasks = await getTasks(ctx.from.id);
  if (tasks.length === 0) {
    return await ctx.reply("📭 لا توجد مهام حتى الآن.");
  }

  let text = "📋 *قائمة مهامك:*\n\n";
  const keyboard = [];

  tasks.forEach(task => {
    const status = task.is_done ? "✅" : "🔲";
    text += `${status} ${task.task_text} (ID: ${task.id})\n`;
    keyboard.push([
      { text: "🔄 تغيير الحالة", callback_data: `toggle_${task.id}` },
      { text: "🗑️ حذف", callback_data: `delete_${task.id}` }
    ]);
  });

  await ctx.reply(text, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: keyboard }
  });
});

// /pending
bot.command("pending", async (ctx) => {
  const tasks = await getTasks(ctx.from.id, true);
  if (tasks.length === 0) {
    return await ctx.reply("🎉 لا توجد مهام معلقة! أحسنت!");
  }

  let text = "⏳ *المهام المعلقة:*\n\n";
  const keyboard = [];

  tasks.forEach(task => {
    text += `🔲 ${task.task_text} (ID: ${task.id})\n`;
    keyboard.push([
      { text: "✅ إكمال", callback_data: `toggle_${task.id}` },
      { text: "🗑️ حذف", callback_data: `delete_${task.id}` }
    ]);
  });

  await ctx.reply(text, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: keyboard }
  });
});

// 🖱️ معالج الأزرار
bot.callbackQuery(/^toggle_(\d+)$/, async (ctx) => {
  const taskId = parseInt(ctx.match[1]);
  await toggleTask(taskId);
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("🔄 تم تغيير حالة المهمة!");
});

bot.callbackQuery(/^delete_(\d+)$/, async (ctx) => {
  const taskId = parseInt(ctx.match[1]);
  await deleteTask(taskId);
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("🗑️ تم حذف المهمة!");
});

// 🚀 بدء البوت
await ensureTable();
bot.start();
