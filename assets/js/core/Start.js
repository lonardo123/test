window.MainUrl = window.MainUrl || "https://perceptive-victory-production.up.railway.app";

// روابط API
const PUBLIC_VIDEOS_URL = (userId) => `${MainUrl}/api/public-videos?user_id=${encodeURIComponent(userId)}`;
const REPORT_WATCH_URL = (userId, videoId, watchedSeconds) =>
  `${MainUrl}/video-callback?user_id=${encodeURIComponent(userId)}&video_id=${encodeURIComponent(videoId)}&watched_seconds=${encodeURIComponent(watchedSeconds)}&secret=MySuperSecretKey123ForCallbackOnly`;

// تغيير العنوان
const APP_TITLE = "TasksRewardBot";
document.title = APP_TITLE;

// تهيئة التطبيق
async function initApp() {
  console.log("Starting application:", APP_TITLE);

  // التحقق من وجود user_id
  const params = new URLSearchParams(window.location.search);
  const userId = params.get("user_id");

  if (userId) {
    console.log("User ID:", userId);
    // جلب الفيديوهات
    const videos = await fetchPublicVideos(userId);
    if (videos && Array.isArray(videos)) {
      console.log("Videos fetched:", videos);
    } else {
      console.warn("No videos returned for user:", userId);
    }
  } else {
    console.warn("No user_id found in query parameters.");
  }
}

// جلب الفيديوهات
async function fetchPublicVideos(userId) {
  if (!userId) return null;
  try {
    const res = await fetch(PUBLIC_VIDEOS_URL(userId));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error("Error fetching videos:", err);
    return null;
  }
}

// إرسال تقرير المشاهدة
async function reportWatch(userId, videoId, seconds) {
  if (!userId || !videoId) return null;
  try {
    const res = await fetch(REPORT_WATCH_URL(userId, videoId, seconds || 0));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error("Error reporting watch:", err);
    return null;
  }
}

// تشغيل التطبيق عند تحميل الصفحة
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}

// جعل الدوال متاحة عالمياً
window.StartApp = {
  MainUrl,
  PUBLIC_VIDEOS_URL,
  REPORT_WATCH_URL,
  APP_TITLE,
  fetchPublicVideos,
  reportWatch,
  initApp
};
