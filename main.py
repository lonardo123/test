# main.py - Telegram Task Manager Bot (All-in-One)

import logging
import os
from datetime import datetime
import psycopg2
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    CallbackQueryHandler,
    ContextTypes,
    filters,
)
from dotenv import load_dotenv

# تحميل المتغيرات من .env
load_dotenv()

# ⚙️ الإعدادات
BOT_TOKEN = os.getenv("BOT_TOKEN")
DB_CONNECTION_STRING = os.getenv("DB_CONNECTION_STRING")

# ✅ التحقق من وجود المتغيرات
if not BOT_TOKEN:
    raise ValueError("BOT_TOKEN is missing in .env file")
if not DB_CONNECTION_STRING:
    raise ValueError("DB_CONNECTION_STRING is missing in .env file")

# 📝 إعداد التسجيل (Logging)
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# 🛠️ دالة لإنشاء الجدول إذا لم يكن موجودًا
def create_table_if_not_exists():
    conn = None
    try:
        conn = psycopg2.connect(DB_CONNECTION_STRING)
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS tasks (
                id SERIAL PRIMARY KEY,
                user_id BIGINT NOT NULL,
                task_text TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                is_done BOOLEAN DEFAULT FALSE
            );
        """)
        conn.commit()
        cur.close()
        logger.info("✅ Table 'tasks' ensured.")
    except Exception as e:
        logger.error(f"❌ Error creating table: {e}")
    finally:
        if conn:
            conn.close()

# ➕ إضافة مهمة جديدة
def add_task(user_id: int, task_text: str):
    conn = None
    try:
        conn = psycopg2.connect(DB_CONNECTION_STRING)
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO tasks (user_id, task_text) VALUES (%s, %s)",
            (user_id, task_text)
        )
        conn.commit()
        cur.close()
        return True
    except Exception as e:
        logger.error(f"❌ Error adding task: {e}")
        return False
    finally:
        if conn:
            conn.close()

# 📋 جلب المهام للمستخدم
def get_tasks(user_id: int, only_pending=False):
    conn = None
    tasks = []
    try:
        conn = psycopg2.connect(DB_CONNECTION_STRING)
        cur = conn.cursor()
        if only_pending:
            cur.execute(
                "SELECT id, task_text, is_done FROM tasks WHERE user_id = %s AND is_done = FALSE ORDER BY created_at DESC",
                (user_id,)
            )
        else:
            cur.execute(
                "SELECT id, task_text, is_done FROM tasks WHERE user_id = %s ORDER BY created_at DESC",
                (user_id,)
            )
        rows = cur.fetchall()
        for row in rows:
            tasks.append({
                'id': row[0],
                'text': row[1],
                'done': row[2]
            })
        cur.close()
    except Exception as e:
        logger.error(f"❌ Error fetching tasks: {e}")
    finally:
        if conn:
            conn.close()
    return tasks

# ✅ تحديث حالة المهمة (إكمال/إلغاء)
def toggle_task_status(task_id: int):
    conn = None
    try:
        conn = psycopg2.connect(DB_CONNECTION_STRING)
        cur = conn.cursor()
        cur.execute(
            "UPDATE tasks SET is_done = NOT is_done WHERE id = %s",
            (task_id,)
        )
        conn.commit()
        cur.close()
        return True
    except Exception as e:
        logger.error(f"❌ Error toggling task: {e}")
        return False
    finally:
        if conn:
            conn.close()

# 🗑️ حذف مهمة
def delete_task(task_id: int):
    conn = None
    try:
        conn = psycopg2.connect(DB_CONNECTION_STRING)
        cur = conn.cursor()
        cur.execute("DELETE FROM tasks WHERE id = %s", (task_id,))
        conn.commit()
        cur.close()
        return True
    except Exception as e:
        logger.error(f"❌ Error deleting task: {e}")
        return False
    finally:
        if conn:
            conn.close()

# 🎯 معالج الأوامر

# /start
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    await update.message.reply_text(
        f"👋 مرحباً {user.first_name}!\n"
        "أنا بوتك لإدارة المهام 📝\n"
        "استخدم:\n"
        "/add <المهمة> - لإضافة مهمة جديدة\n"
        "/list - لعرض المهام\n"
        "/pending - لعرض المهام الغير منجزة فقط"
    )

# /add
async def add(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not context.args:
        await update.message.reply_text("❌ يرجى كتابة المهمة بعد الأمر. مثال:\n/add شراء الحليب")
        return

    task_text = ' '.join(context.args)
    user_id = update.effective_user.id

    if add_task(user_id, task_text):
        await update.message.reply_text("✅ تمت إضافة المهمة بنجاح!")
    else:
        await update.message.reply_text("❌ حدث خطأ أثناء إضافة المهمة.")

# /list
async def list_tasks(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    tasks = get_tasks(user_id)

    if not tasks:
        await update.message.reply_text("📭 لا توجد مهام حتى الآن.")
        return

    text = "📋 *قائمة مهامك:*\n\n"
    keyboard = []

    for task in tasks:
        status = "✅" if task['done'] else "🔲"
        text += f"{status} {task['text']} (ID: {task['id']})\n"
        # أزرار لكل مهمة
        keyboard.append([
            InlineKeyboardButton("🔄 تغيير الحالة", callback_data=f"toggle_{task['id']}"),
            InlineKeyboardButton("🗑️ حذف", callback_data=f"delete_{task['id']}")
        ])

    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text(text, reply_markup=reply_markup, parse_mode="Markdown")

# /pending
async def pending_tasks(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    tasks = get_tasks(user_id, only_pending=True)

    if not tasks:
        await update.message.reply_text("🎉 لا توجد مهام معلقة! أحسنت!")
        return

    text = "⏳ *المهام المعلقة:*\n\n"
    keyboard = []

    for task in tasks:
        text += f"🔲 {task['text']} (ID: {task['id']})\n"
        keyboard.append([
            InlineKeyboardButton("✅ إكمال", callback_data=f"toggle_{task['id']}"),
            InlineKeyboardButton("🗑️ حذف", callback_data=f"delete_{task['id']}")
        ])

    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text(text, reply_markup=reply_markup, parse_mode="Markdown")

# 🖱️ معالج الضغط على الأزرار
async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    data = query.data
    if data.startswith("toggle_"):
        task_id = int(data.split("_")[1])
        if toggle_task_status(task_id):
            await query.edit_message_text("🔄 تم تغيير حالة المهمة!")
        else:
            await query.edit_message_text("❌ حدث خطأ أثناء التحديث.")
    elif data.startswith("delete_"):
        task_id = int(data.split("_")[1])
        if delete_task(task_id):
            await query.edit_message_text("🗑️ تم حذف المهمة!")
        else:
            await query.edit_message_text("❌ حدث خطأ أثناء الحذف.")

# 🧭 معالج الرسائل غير المعروفة
async def unknown(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("❓ عذراً، لا أفهم هذا الأمر. استخدم /start للمساعدة.")

# 🚀 الدالة الرئيسية
def main():
    # إنشاء الجدول عند التشغيل
    create_table_if_not_exists()

    # إنشاء التطبيق
    application = Application.builder().token(BOT_TOKEN).build()

    # إضافة المعالجات
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("add", add))
    application.add_handler(CommandHandler("list", list_tasks))
    application.add_handler(CommandHandler("pending", pending_tasks))
    application.add_handler(CallbackQueryHandler(button_handler))
    application.add_handler(MessageHandler(filters.COMMAND, unknown))

    # بدء البوت
    logger.info("🚀 Bot is starting...")
    application.run_polling()

if __name__ == "__main__":
    main()
