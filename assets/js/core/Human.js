const MainUrl = "https://perceptive-victory-production.up.railway.app";

// تشفير المفتاح الأساسي Base64
const ENCODED_SECRET = "TXlTdXBlclNlY3JldEtleTEyM0ZvckNhbGxiYWNrT25seQ==";

// فك التشفير عند الاستخدام
const CALLBACK_SECRET = atob(ENCODED_SECRET);

// تعريف المتغيرات
let currentUserId = null;
let isWorkerRunning = false;
let currentVideoIndex = 0;
let videoList = [];

// ==================================================
// تحميل قائمة الفيديوهات للمستخدم
// ==================================================
async function fetchVideosForUser(userId) {
    try {
        const response = await fetch(`${SERVER_URL}/api/public-videos?user_id=${userId}`);
        if (!response.ok) {
            throw new Error("فشل في جلب قائمة الفيديوهات من السيرفر");
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error("خطأ أثناء جلب الفيديوهات:", error);
        return [];
    }
}

// ==================================================
// بدء تشغيل العامل (Worker)
// ==================================================
async function startWorker(userId) {
    if (isWorkerRunning) {
        console.warn("العامل يعمل بالفعل!");
        return;
    }

    currentUserId = userId;
    isWorkerRunning = true;
    currentVideoIndex = 0;

    console.log(`🚀 بدء تشغيل العامل للمستخدم: ${userId}`);

    videoList = await fetchVideosForUser(userId);

    if (videoList.length === 0) {
        console.warn("❌ لم يتم العثور على فيديوهات للمستخدم.");
        isWorkerRunning = false;
        return;
    }

    playNextVideo();
}

// ==================================================
// تشغيل الفيديو الحالي
// ==================================================
function playNextVideo() {
    if (!isWorkerRunning) {
        return;
    }

    if (currentVideoIndex >= videoList.length) {
        console.log("✅ انتهى تشغيل جميع الفيديوهات.");
        isWorkerRunning = false;
        return;
    }

    const video = videoList[currentVideoIndex];
    console.log(`▶️ تشغيل الفيديو: ${video.title} (ID: ${video.id}) — المدة: ${video.duration_seconds} ثانية`);

    // محاكاة تشغيل الفيديو بانتظار نفس مدة الفيديو
    setTimeout(() => {
        finishVideo(video);
    }, video.duration_seconds * 1000);
}

// ==================================================
// عند انتهاء الفيديو: إرسال بيانات المشاهدة للسيرفر
// ==================================================
async function finishVideo(video) {
    try {
        const watchedSeconds = video.duration_seconds;

        const callbackUrl =
            `${SERVER_URL}/video-callback?user_id=${currentUserId}` +
            `&video_id=${video.id}` +
            `&watched_seconds=${watchedSeconds}` +
            `&secret=${CALLBACK_SECRET}`;

        console.log(`📡 إرسال نداء للسيرفر: ${callbackUrl}`);

        const response = await fetch(callbackUrl);
        const result = await response.text();

        if (response.ok) {
            console.log(`🎉 نجاح: تمت إضافة ربح للمستخدم ${currentUserId} بعد مشاهدة الفيديو ${video.id}`);
        } else {
            console.error(`⚠️ فشل: ${result}`);
        }
    } catch (error) {
        console.error("❌ خطأ أثناء إنهاء الفيديو:", error);
    }

    // الانتقال للفيديو التالي
    currentVideoIndex++;
    playNextVideo();
}

// ==================================================
// إيقاف العامل
// ==================================================
function stopWorker() {
    isWorkerRunning = false;
    console.log("🛑 تم إيقاف العامل.");
}

// ==================================================
// ربط الأزرار من الواجهة (Start / Stop)
// ==================================================
$(document).ready(function () {
    $("#start").on("click", function () {
        let savedUser = localStorage.getItem("sessionUser");
        if (!savedUser) {
            alert("❌ يجب تسجيل الدخول أولاً.");
            return;
        }

        let user = JSON.parse(savedUser);
        startWorker(user.user_id);
    });

    $("#stop").on("click", function () {
        stopWorker();
    });
});
