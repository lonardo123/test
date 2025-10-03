// Settings.js - نسخة معدلة نهائية

// السيرفر الأساسي
const SERVER_URL = "https://perceptive-victory-production.up.railway.app";

// روابط API
const PUBLIC_VIDEOS_URL = (userId) => `${SERVER_URL}/api/public-videos?user_id=${encodeURIComponent(userId)}`;
const REPORT_WATCH_URL = (userId, videoId, watchedSeconds) =>
  `${SERVER_URL}/video-callback?user_id=${encodeURIComponent(userId)}&video_id=${encodeURIComponent(videoId)}&watched_seconds=${encodeURIComponent(watchedSeconds)}&secret=MySuperSecretKey123ForCallbackOnly`;

// تغيير العنوان
const APP_TITLE = "TasksRewardBot";
document.title = APP_TITLE;

// دالة جلب الفيديوهات
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

// دالة إرسال تقرير المشاهدة
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

// التهيئة
async function initSettings() {
  console.log("Settings initialized for", APP_TITLE);
}
initSettings();

// جعل الدوال متاحة عالمياً
window.Settings = {
  SERVER_URL,
  PUBLIC_VIDEOS_URL,
  REPORT_WATCH_URL,
  APP_TITLE,
  fetchPublicVideos,
  reportWatch
};
