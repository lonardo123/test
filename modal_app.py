# modal_app.py - لتشغيل bot.js على Modal.com
import modal
import subprocess
import os
import signal
import sys
import threading

# 🐳 بناء صورة تحتوي على Node.js + تثبيت التبعيات
image = (
    modal.Image.debian_slim()
    .apt_install("curl", "git")  # أدوات مساعدة
    .run_commands("curl -fsSL https://fnm.vercel.app/install | bash")  # تثبيت fnm (مدير Node.js)
    .run_commands("bash -c 'source /root/.bashrc && fnm install 20 && fnm use 20'")  # تثبيت Node.js 20
    .run_commands("bash -c 'source /root/.bashrc && npm install -g npm'")  # تحديث npm
    .copy_local_file("bot.js", "/app/bot.js")  # نسخ ملف البوت
    .copy_local_file("package.json", "/app/package.json")  # نسخ package.json
    .run_commands("cd /app && npm ci --only=production")  # تثبيت التبعيات
)

# 🤖 إنشاء التطبيق
stub = modal.Stub("telegram-bot-nodejs")

# 🚀 وظيفة لتشغيل البوت
@stub.function(
    image=image,
    secrets=[modal.Secret.from_name("telegram-bot-config")],  # 👈 ربط الـ Secret هنا
    keep_warm=1,  # للحفاظ على الخدمة نشطة دائمًا
    cpu=0.5,  # موارد كافية لبوت تليجرام
    memory=512,
    timeout=86400,  # 24 ساعة — لأن البوت يعمل باستمرار
)
def run_bot():
    def forward_logs(pipe, prefix=""):
        """طباعة السجلات مباشرة إلى وحدة تحكم Modal"""
        for line in iter(pipe.readline, ""):
            print(f"{prefix}{line}", end="", flush=True)
        pipe.close()

    try:
        # تشغيل البوت باستخدام Node.js
        process = subprocess.Popen(
            ["bash", "-c", "source /root/.bashrc && fnm use 20 && node /app/bot.js"],
            cwd="/app",
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            universal_newlines=True,
            env={**os.environ, "PATH": "/root/.fnm:/root/.fnm/bin:" + os.environ.get("PATH", "")}
        )

        # طباعة السجلات في الوقت الفعلي
        log_thread = threading.Thread(target=forward_logs, args=(process.stdout, ""))
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
        exit_code = process.wait()
        print(f"Bot process exited with code {exit_code}")

    except Exception as e:
        print(f"❌ خطأ أثناء تشغيل البوت: {e}")
        raise

# ▶️ نقطة الدخول للتشغيل المحلي أو التجريبي
@stub.local_entrypoint()
def main():
    run_bot.remote()
