import modal

image = modal.Image.from_registry("node:20-alpine").copy_local_dir(".", "/app").run_commands(
    "cd /app && npm ci --only=production"
)

stub = modal.Stub("telegram-bot-nodejs")

@stub.function(
    image=image,
    secrets=[modal.Secret.from_name("telegram-bot-config")],
    keep_warm=1,
    cpu=0.5,
    memory=512,
    timeout=86400,
)
def run_bot():
    import subprocess
    import os

    process = subprocess.Popen(
        ["node", "bot.js"],
        cwd="/app",
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        universal_newlines=True,
    )

    for line in iter(process.stdout.readline, ""):
        print(line, end="", flush=True)

    exit_code = process.wait()
    print(f"Bot exited with code: {exit_code}")

@stub.local_entrypoint()
def main():
    run_bot.remote()
