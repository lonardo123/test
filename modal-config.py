# modal-config.py
import modal

# بناء صورة Docker من Dockerfile في هذا المجلد
image = modal.Image.from_registry("node:20-alpine").copy_local_dir(".", "/app").run_commands(
    "cd /app && npm ci --only=production"
)

# إنشاء Stub (حاوية للتطبيق)
stub = modal.Stub("telegram-bot-nodejs")

# تعريف وظيفة لتشغيل البوت
@stub.function(
    image=image,
    # ربط المتغيرات البيئية السرية (يجب إنشاؤها في Modal Dashboard)
    secrets=[
        modal.Secret.from_name("telegram-bot-secrets"),
    ],
    # جعل الخدمة دائمة التشغيل (keep_warm) لضمان عمل البوت 24/7
    keep_warm=1,
    # تعيين موارد CPU/ذاكرة إذا لزم الأمر (الافتراضي كافٍ لمعظم البوتات)
    cpu=0.5,
    memory=512,
)
def run_bot():
    import subprocess
    import signal
    import sys

    # تشغيل البوت باستخدام Node.js
    process = subprocess.Popen(
        ["node", "bot.js"],
        cwd="/app",
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        universal_newlines=True,
    )

    # طباعة السجلات مباشرة إلى وحدة التحكم في Modal
    def forward_logs():
        for line in iter(process.stdout.readline, ""):
            print(line, end="")

    import threading
    log_thread = threading.Thread(target=forward_logs)
    log_thread.daemon = True
    log_thread.start()

    # معالجة إشارات الإيقاف
    def signal_handler(signum, frame):
        print(f"Received signal {signum}, stopping bot...")
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # الانتظار حتى ينتهي البوت
    process.wait()
    print("Bot process exited.")

# نقطة الدخول عند التشغيل المباشر (للتجربة المحلية)
@stub.local_entrypoint()
def main():
    run_bot.remote()
