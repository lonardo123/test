import modal
import subprocess

# بناء صورة Docker من Node.js
image = modal.Image.from_registry("node:20-alpine").copy_local_dir(".", "/app").run_commands(
    "cd /app && npm ci --only=production"
)

# إنشاء التطبيق — هنا نغيّر الاسم ✅
stub = modal.Stub("telegram-bot-nodejs")  # 👈 هذا هو اسم مشروعك

@stub.function(
    image=image,
    secrets=[modal.Secret.from_name("telegram-bot-config")],  # ربط المتغيرات البيئية
    keep_warm=1,  # للحفاظ على البوت نشطًا دائمًا
    cpu=0.5,
    memory=512,
    timeout=86400,  # 24 ساعة
)
def run_bot():
    process = subprocess.Popen(
        ["node", "bot.js"],
        cwd="/app",
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        universal_newlines=True,
    )

    # طباعة السجلات مباشرة
    for line in iter(process.stdout.readline, ""):
        print(line, end="", flush=True)

    exit_code = process.wait()
    print(f"Bot exited with code: {exit_code}")

@stub.local_entrypoint()
def main():
    run_bot.remote()
