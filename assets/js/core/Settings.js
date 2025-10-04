window.MainUrl = window.MainUrl || "https://perceptive-victory-production.up.railway.app";

const PUBLIC_VIDEOS_URL = userId => `${MainUrl}/api/public-videos?user_id=${encodeURIComponent(userId)}`;
const REPORT_WATCH_URL = (userId, videoId, watchedSeconds) =>
    `${MainUrl}/video-callback?user_id=${encodeURIComponent(userId)}&video_id=${encodeURIComponent(videoId)}&watched_seconds=${encodeURIComponent(watchedSeconds)}&secret=MySuperSecretKey123ForCallbackOnly`;

const APP_TITLE = "TasksRewardBot";
document.title = APP_TITLE;

async function fetchPublicVideos(userId) {
    if (!userId) return [];
    try {
        const res = await fetch(PUBLIC_VIDEOS_URL(userId));
        if (!res.ok) throw new Error(res.status);
        return await res.json();
    } catch (err) { console.error("fetchPublicVideos error", err); return []; }
}

async function reportWatch(userId, videoId, seconds) {
    if (!userId || !videoId) return;
    try {
        const res = await fetch(REPORT_WATCH_URL(userId, videoId, seconds || 0));
        if (!res.ok) throw new Error(res.status);
        return await res.json();
    } catch (err) { console.error("reportWatch error", err); return null; }
}

window.Settings = {
    MainUrl,
    PUBLIC_VIDEOS_URL,
    REPORT_WATCH_URL,
    APP_TITLE,
    fetchPublicVideos,
    reportWatch
};
