import { Telegraf, session, Markup } from "npm:telegraf";
import axios from "npm:axios";
import postgres from "https://deno.land/x/postgresjs/mod.js";
import { serve } from "https://deno.land/std/http/server.ts";

const BOT_TOKEN = Deno.env.get("BOT_TOKEN");
const DATABASE_URL = Deno.env.get("DATABASE_URL");
const ADMIN_ID = Deno.env.get("ADMIN_ID");
const PORT = Number(Deno.env.get("PORT")) || 3000;

// قاعدة البيانات
const sql = postgres(DATABASE_URL, { ssl: "require" });

// بوت
const bot = new Telegraf(BOT_TOKEN);

// ====== Debug env ======
console.log("🆔 ADMIN_ID:", ADMIN_ID || "مفقود!");
console.log("🤖 BOT_TOKEN:", BOT_TOKEN ? "موجود" : "مفقود!");
console.log("🗄 DATABASE_URL:", DATABASE_URL ? "موجود" : "مفقود!");

// ====== اتصال قاعدة البيانات ======
async function connectDB() {
  try {
    await sql`SELECT 1`;
    console.log("✅ bot.ts: اتصال قاعدة البيانات ناجح");
  } catch (err) {
    console.error("❌ bot.ts: فشل الاتصال:", err.message);
    setTimeout(connectDB, 5000);
  }
}
connectDB();

// ====== مثال أمر للبوت ======
bot.start((ctx) => ctx.reply("🚀 أهلاً! البوت شغال على Deno Deploy"));

// Webhook
serve(async (req) => {
  const url = new URL(req.url);
  if (url.pathname === "/webhook") {
    return await bot.handleUpdate(await req.json());
  }
  return new Response("OK");
}, { port: PORT });
