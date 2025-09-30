(() => {
  'use strict';

  let isTracking = false;
  let watchStartTime = null;
  let currentVideoId = null;
  let minDurationRequired = 50;
  let source = 'YouTube';
  let scrollInterval = null;

  function getVideoId() {
    const params = new URLSearchParams(window.location.search);
    return params.get('v');
  }

  function detectSource() {
    const params = new URLSearchParams(window.location.search);
    const src = params.get('__source');
    if (src) return src;
    const ref = document.referrer || '';
    if (ref.includes('facebook.com') || ref.includes('l.facebook.com')) return 'Facebook';
    if (ref.includes('instagram.com') || ref.includes('l.instagram.com')) return 'Instagram';
    if (ref.includes('google.com')) return 'Google';
    return 'YouTube';
  }

  function setupAdSkip() {
    const interval = setInterval(() => {
      const skipBtn = document.querySelector('.ytp-ad-skip-button, .ytp-skip-button');
      if (skipBtn && skipBtn.offsetParent !== null) {
        skipBtn.click();
        clearInterval(interval);
      }
    }, 1000);
  }

  function startAutoScroll() {
    if (scrollInterval) clearInterval(scrollInterval);
    scrollInterval = setInterval(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 5000);
    }, 8000);
  }

  function stopAutoScroll() {
    if (scrollInterval) {
      clearInterval(scrollInterval);
      scrollInterval = null;
    }
  }

  async function observeVideo() {
    const video = document.querySelector('video');
    if (!video) return;

    const videoId = getVideoId();
    if (!videoId) return;

    if (videoId !== currentVideoId) {
      currentVideoId = videoId;
      isTracking = false;
      source = detectSource();
      console.log('TasksRewardBot: بدء تتبع الفيديو', videoId, 'المصدر:', source);
      watchStartTime = Date.now();
      isTracking = true;
      setupAdSkip();
      startAutoScroll();
    }

    if (!isTracking) return;

    const duration = video.duration || 0;
    const currentTime = video.currentTime || 0;
    const threshold = Math.max(minDurationRequired * 0.95, duration * 0.95);

    if (duration > 0 && currentTime >= threshold) {
      const watchedSeconds = Math.floor((Date.now() - watchStartTime) / 1000);
      chrome.runtime.sendMessage({
        action: 'report_view',
        videoId: currentVideoId,
        watchedSeconds,
        source
      });
      isTracking = false;
      stopAutoScroll();
    }
  }

  setInterval(observeVideo, 1000);
  window.addEventListener('beforeunload', stopAutoScroll);
})();
