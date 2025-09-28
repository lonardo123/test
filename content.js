let isTracking = false;
let watchStartTime = null;
let currentVideoId = null;
let eligibleVideos = [];
let skipAdTimer = null;

// جلب الفيديوهات المؤهلة من السيرفر
async function fetchEligibleVideos() {
  try {
    const res = await fetch('https://perceptive-victory-production.up.railway.app/api/public-videos');
    const data = await res.json();
    eligibleVideos = data.map(v => ({
      video_id: v.video_id,
      min_duration: v.min_duration
    }));
  } catch (err) {
    console.error("فشل جلب الفيديوهات:", err);
  }
}

// التحقق مما إذا كان الفيديو مؤهلاً
function isVideoEligible(videoId) {
  return eligibleVideos.some(v => v.video_id === videoId);
}

// مراقبة الفيديو
function observeVideo() {
  const video = document.querySelector('video');
  if (!video) return;

  const urlParams = new URLSearchParams(window.location.search);
  const videoId = urlParams.get('v');

  if (videoId && videoId !== currentVideoId) {
    currentVideoId = videoId;
    isTracking = isVideoEligible(videoId);
    if (isTracking) {
      console.log("✅ TasksRewardBot: بدء تتبع الفيديو", videoId);
      watchStartTime = Date.now();
    }
  }

  if (!isTracking) return;

  const duration = video.duration;
  const currentTime = video.currentTime;
  const minDuration = eligibleVideos.find(v => v.video_id === videoId)?.min_duration || 50;

  // إذا شاهد ≥95% من المدة المطلوبة
  if (duration > 0 && currentTime >= minDuration * 0.95) {
    const watchedSeconds = Math.floor(Date.now() - watchStartTime) / 1000;
    chrome.runtime.sendMessage({
      action: "rewardUser",
      videoId: videoId,
      watchedSeconds: Math.min(watchedSeconds, duration)
    });
    isTracking = false;
  }
}

// تخطي الإعلان بعد 5 ثوانٍ
function setupAdSkip() {
  skipAdTimer = setInterval(() => {
    const skipBtn = document.querySelector('.ytp-skip-ad-button');
    if (skipBtn) {
      setTimeout(() => {
        if (skipBtn.offsetParent !== null) skipBtn.click();
      }, 5000);
      clearInterval(skipAdTimer);
    }
  }, 1000);
}

// التشغيل
fetchEligibleVideos();
setupAdSkip();
setInterval(observeVideo, 1000);
