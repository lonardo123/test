# modal_app.py
import modal

# بناء صورة Docker من الملف المحلي
image = modal.Image.from_registry("node:20-alpine").copy_local_dir(".", "/app").run_commands(
    "cd /app && npm ci --only=production"
)

# إنشاء Stub
stub = modal.Stub("telegram-bot-nodejs")

@stub.function(
    image=image,
    secrets=[modal.Secret.from_name("telegram-bot-config")],  # 👈 ربط الـ Secret هنا
    keep_warm=1,  # للحفاظ على الخدمة نشطة دائمًا
    cpu=0.5,
    memory=512,
    timeout=86400,  # 24 ساعة
)
def run_bot():
    import subprocess
    import os

    # تشغيل البوت
    process = subprocess.Popen(
        ["node", "bot.js"],
        cwd="/app",
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        universal_newlines=True,
    )

    # طباعة السجلات في الوقت الفعلي
    for line in iter(process.stdout.readline, ""):
        print(line, end="", flush=True)

    # الانتظار حتى ينتهي البوت
    exit_code = process.wait()
    print(f"Bot exited with code: {exit_code}")

# نقطة الدخول للتجربة المحلية
@stub.local_entrypoint()
def main():
    run_bot.remote()
