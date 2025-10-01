(() => { 
  'use strict';

  // ================================
  // إنشاء عنصر الإشعار (Notification Bar)
  // ================================
  let notificationBar = null;

  function createNotificationBar() {
    if (notificationBar) return;
    notificationBar = document.createElement('div');
    notificationBar.style.cssText = `
      position: fixed;
      bottom: 0;
      left: 0;
      width: 100%;
      background: #222;
      color: white;
      padding: 8px 16px;
      font-family: Arial, sans-serif;
      font-size: 14px;
      z-index: 9999;
      box-shadow: 0 -2px 5px rgba(0,0,0,0.3);
      display: flex;
      flex-direction: column;
      gap: 4px;
    `;
    const icon = document.createElement('span');
    icon.textContent = '@TasksRewardBot:';
    icon.style.fontWeight = 'bold';
    icon.style.color = '#007bff';
    notificationBar.appendChild(icon);

    const messageSpan = document.createElement('span');
    messageSpan.id = 'notificationMessage';
    notificationBar.appendChild(messageSpan);

    const progressBar = document.createElement('div');
    progressBar.id = 'progressBar';
    progressBar.style.cssText = `
      height: 4px;
      background: #333;
      border-radius: 2px;
      width: 100%;
      overflow: hidden;
      margin-top: 4px;
    `;
    const progressFill = document.createElement('div');
    progressFill.id = 'progressFill';
    progressFill.style.cssText = `
      height: 100%;
      background: #ff5555;
      width: 0%;
      transition: width 0.3s linear;
    `;
    progressBar.appendChild(progressFill);
    notificationBar.appendChild(progressBar);

    document.body.appendChild(notificationBar);
  }

  function updateNotification(message, progress = 0) {
    if (!notificationBar) createNotificationBar();
    document.getElementById('notificationMessage').textContent = message;
    document.getElementById('progressFill').style.width = `${progress}%`;
  }

  // ================================
  // دالة لتخطي الإعلانات
  // ================================
  function setupAdSkip() {
    const interval = setInterval(() => {
      const skipBtn = document.querySelector('.ytp-ad-skip-button, .ytp-skip-button');
      if (skipBtn && skipBtn.offsetParent !== null) {
        try {
          skipBtn.click();
          updateNotification('✅ تم تخطي الإعلان', 100);
        } catch (e) {
          console.error('فشل تخطي الإعلان:', e);
        }
      }
    }, 1000);
  }

  // ================================
  // تتبع الفيديو والمشاهدة
  // ================================
  let isTracking = false;
  let watchStartTime = null;
  let currentVideoId = null;
  let scrollInterval = null;
  let minDurationRequired = 50;

  function startAutoScroll() {
    stopAutoScroll();
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

  function getVideoId() {
    const url = window.location.href;
    const match = url.match(/(?:v=|\/shorts\/)([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : null;
  }

  function detectSource() {
    const ref = document.referrer || '';
    if (ref.includes('facebook.com') || ref.includes('l.facebook.com')) return 'Facebook';
    if (ref.includes('instagram.com') || ref.includes('l.instagram.com')) return 'Instagram';
    if (ref.includes('google.com')) return 'Google';
    return 'YouTube';
  }

  async function observeVideo() {
    const video = document.querySelector('video');
    if (!video) return;

    const videoId = getVideoId();
    if (!videoId) return;

    if (videoId !== currentVideoId) {
      currentVideoId = videoId;
      isTracking = false;
      const source = detectSource();
      watchStartTime = Date.now();
      isTracking = true;

      setupAdSkip();
      startAutoScroll();

      updateNotification(`جارٍ البحث عن الفيديوهات...`, 0);
      setTimeout(() => updateNotification(`يرجى الانتظار لحظة...`, 30), 2000);
      setTimeout(() => updateNotification(`إنشاء جلسة جديدة...`, 60), 4000);
      setTimeout(() => updateNotification(`استمر في مشاهدة هذا الفيديو...`, 80), 6000);
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
        source: detectSource()
      });
      updateNotification(`✅ تم إرسال المشاهدة`, 100);
      isTracking = false;
      stopAutoScroll();
    }
  }

  // ================================
  // بدء المراقبة
  // ================================
  createNotificationBar();
  updateNotification(`جارٍ البحث عن الفيديوهات...`, 0);
  setInterval(observeVideo, 1000);
  window.addEventListener('beforeunload', stopAutoScroll);
})();
