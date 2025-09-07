// bot.ts

import { serve } from "https://deno.land/std@0.203.0/http/server.ts";

// إعدادات البيئة
const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_KEY")!;

// دالة لإرسال رسالة لتليجرام
async function sendTelegramMessage(chat_id: number, text: string) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id, text }),
  });
  return res.json();
}

// دالة لتخزين رسالة في Supabase
async function storeMessage(chat_id: number, message: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
    },
    body: JSON.stringify({ chat_id, message }),
  });
  return res.json();
}

// الخادم الرئيسي
serve(async (req) => {
  if (req.method === "POST") {
    const body = await req.json();
    
    if (body.message) {
      const chat_id = body.message.chat.id;
      const text = body.message.text || "";

      // تخزين الرسالة في Supabase
      await storeMessage(chat_id, text);

      // إرسال رد تلقائي
      await sendTelegramMessage(chat_id, `تم استلام رسالتك: "${text}"`);
    }

    return new Response("OK", { status: 200 });
  }

  return new Response("Telegram Bot is running", { status: 200 });
});
