// ===================== IMPORTS =====================
const { Telegraf, Markup } = require('telegraf');
const { Client } = require('pg');
const express = require('express');
require('dotenv').config();

// ===================== DATABASE =====================
const client = new Client({
  connectionString: process.env.DATABASE_URL
});
async function connectDB() { await client.connect(); }

// ===================== BOT =====================
const bot = new Telegraf(process.env.BOT_TOKEN);

// ===================== HELPERS =====================
function isAdmin(ctx) {
  return ctx.from && process.env.ADMINS?.split(',').includes(ctx.from.id.toString());
}

// ===================== ADD TASK =====================
bot.on('text', async (ctx, next) => {
  if (ctx.session && ctx.session.awaitingAction === 'add_task') {
    if (!isAdmin(ctx)) {
      delete ctx.session.awaitingAction;
      return ctx.reply('❌ Not admin.');
    }

    const raw = ctx.message.text || '';
    const parts = raw.split('|').map(p => p.trim());
    if (parts.length < 3) {
      return ctx.reply('❌ Format error. Use: title | description | price | duration(optional)\nExample: coinpayu | collect balance | 0.0500 | 30d');
    }

    const title = parts[0];
    const description = parts.slice(1, -1).join(' | ');
    const priceStr = parts[parts.length - 1];
    const price = parseFloat(priceStr.replace(',', '.')) || 0;

    if (price <= 0) return ctx.reply('❌ Invalid price.');

    try {
      await client.query('INSERT INTO tasks(title, description, price) VALUES($1,$2,$3)', [title, description, price]);
      delete ctx.session.awaitingAction;
      await ctx.reply('✅ Task added: ' + title + '\nPrice: ' + price.toFixed(4) + '$');
    } catch (err) {
      console.error(err);
      await ctx.reply('❌ Error adding task.');
    }
    return;
  }
  return next();
});

// ===================== SIMPLE COMMAND =====================
bot.command('start', (ctx) => ctx.reply('Bot is running'));

// ===================== EXPRESS SERVER =====================
const app = express();
app.use(express.json());

app.get('/', (req, res) => res.send('✅ Bot running'));
app.listen(process.env.PORT || 3000, () => console.log('🚀 Server running'));

// ===================== LAUNCH BOT =====================
(async () => {
  try {
    await connectDB();
    await bot.launch();
    console.log('✅ Bot launched');

    process.once('SIGINT', () => { bot.stop('SIGINT'); client.end(); });
    process.once('SIGTERM', () => { bot.stop('SIGTERM'); client.end(); });
  } catch (err) {
    console.error('❌ Launch error:', err);
  }
})();
