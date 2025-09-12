import modal
import subprocess

image = (
    modal.Image.from_registry("node:20-alpine")
    .workdir("/app")
    .copy_local_file("bot.js", "/app/bot.js")
    .copy_local_file("package.json", "/app/package.json")
    .run_commands("npm ci --only=production")
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
