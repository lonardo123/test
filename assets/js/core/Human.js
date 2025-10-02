(function () {
    console.log("🚀 Human.js Loaded");

    const SERVER_URL = "https://perceptive-victory-production.up.railway.app";

    // دالة لإرسال مشاهدة مكتملة بدون كشف السر في المتصفح
    async function reportWatch(userId, videoId, watchedSeconds) {
        try {
            const response = await fetch(`${SERVER_URL}/api/report-watch`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    // لا ترسل السر من المتصفح
                },
                body: JSON.stringify({
                    user_id: userId,
                    video_id: videoId,
                    watched_seconds: watchedSeconds
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error("❌ فشل إرسال المشاهدة:", errorText);
                return { success: false, error: errorText };
            }

            const data = await response.json();
            console.log("✅ تم تسجيل المشاهدة:", data);
            return { success: true, data };
        } catch (err) {
            console.error("⚠️ خطأ في الاتصال بالسيرفر:", err);
            return { success: false, error: err.message };
        }
    }

    async function simulateWatch() {
        const userId = "7171208519";
        const videoId = 12;
        const watchedSeconds = 50;

        console.log(`⏳ إرسال مشاهدة: user_id=${userId}, video_id=${videoId}, seconds=${watchedSeconds}`);

        const result = await reportWatch(userId, videoId, watchedSeconds);

        if (result.success) {
            console.log("🎉 مشاهدة أُرسلت وتمت المعالجة بنجاح");
        } else {
            console.log("💥 فشل تسجيل المشاهدة:", result.error);
        }
    }

    simulateWatch();

    window.reportWatch = reportWatch;

})();
