// عند استلام طلب مكافأة
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "rewardUser") {
    rewardUser(request.videoId, request.watchedSeconds);
  }
});

// إرسال المكافأة إلى السيرفر
async function rewardUser(videoId, watchedSeconds) {
  const data = await chrome.storage.local.get(['userId']);
  const userId = data.userId;
  if (!userId) return;

  try {
    const url = `https://perceptive-victory-production.up.railway.app/video-callback?user_id=${userId}&video_id=${videoId}&watched_seconds=${watchedSeconds}`;
    const res = await fetch(url);
    if (res.ok) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon48.png',
        title: 'TasksRewardBot',
        message: `💰 تم إضافة رصيدك بنجاح!`
      });
    }
  } catch (err) {
    console.error("TasksRewardBot Error:", err);
  }
}
