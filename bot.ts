import { serve } from "https://deno.land/std@0.203.0/http/server.ts";

// الحصول على المتغيرات البيئية
const TELEGRAM_TOKEN = Deno.env.get("TELEGRAM_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_KEY")!;

// إرسال رسالة لتليجرام
async function sendTelegramMessage(chat_id: number, text: string) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id, text }),
  });
}

// تخزين الرسائل في Supabase
async function storeMessage(chat_id: number, message: string) {
  await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
    method: "POST",
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation",
    },
    body: JSON.stringify({ chat_id, message }),
  });
}

// تشغيل البوت على أي طلب HTTP
serve(async (req) => {
  if (req.method === "POST") {
    const body = await req.json();

    if (body.message && body.message.text) {
      const chat_id = body.message.chat.id;
      const text = body.message.text;

      // تخزين الرسالة
      await storeMessage(chat_id, text);

      // إرسال رد تلقائي
      await sendTelegramMessage(chat_id, `تم استلام رسالتك: "${text}"`);
    }

    return new Response("OK", { status: 200 });
  }

  return new Response("Telegram Bot is running", { status: 200 });
});
