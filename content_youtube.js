'use strict';

// =====================================
// التعامل مع صفحات فيديوهات يوتيوب
// =====================================

(function() {

  // دالة استخراج videoId من رابط الصفحة
  function getVideoIdFromUrl(url) {
    if (!url) return null;
    try {
      const u = new URL(url);
      return u.searchParams.get('v') || null;
    } catch (e) {
      // محاولة regex للروابط القصيرة أو embed
      const m = url.match(/(?:v=|\/)([A-Za-z0-9_-]{8,11})(?:\b|$)/);
      return m && m[1] ? m[1] : null;
    }
  }

  // دالة تحديث شريط التقدم والإشعار
  function updateNotification(message, progress = 0) {
    let notif = document.getElementById('notificationBar');
    if (!notif) {
      notif = document.createElement('div');
      notif.id = 'notificationBar';
      notif.style.cssText = 'position:fixed;bottom:0;left:0;width:100%;background:#222;color:white;padding:8px 16px;font-family:Arial,sans-serif;font-size:14px;z-index:9999;display:flex;align-items:center;gap:8px;';
      const icon = document.createElement('span');
      icon.textContent = '@TasksRewardBot:';
      icon.style.fontWeight = 'bold';
      icon.style.color = '#007bff';
      notif.appendChild(icon);
      const msgSpan = document.createElement('span');
      msgSpan.id = 'notificationMessage';
      notif.appendChild(msgSpan);
      const bar = document.createElement('div');
      bar.id = 'progressBar';
      bar.style.cssText = 'height:4px;background:#333;border-radius:2px;margin-top:8px;width:100%;overflow:hidden;';
      const fill = document.createElement('div');
      fill.id = 'progressFill';
      fill.style.cssText = 'height:100%;background:#ff5555;width:0%;transition:width 0.3s ease;';
      bar.appendChild(fill);
      notif.appendChild(bar);
      document.body.appendChild(notif);
    }
    document.getElementById('notificationMessage').textContent = message;
    document.getElementById('progressFill').style.width = `${progress}%`;
  }

  // دالة تتبع الفيديو
  function trackVideoPlayback() {
    const video = document.querySelector('video');
    if (!video) return;

    const videoId = getVideoIdFromUrl(window.location.href);
    if (!videoId) return;

    let watchStartTime = Date.now();
    let durationRequired = 50; // 50 ثانية كحد أدنى

    const interval = setInterval(() => {
      const currentTime = video.currentTime || 0;
      const duration = video.duration || 0;
      const threshold = Math.max(durationRequired * 0.95, duration * 0.95);

      if (currentTime >= threshold) {
        const watchedSeconds = Math.floor((Date.now() - watchStartTime) / 1000);
        chrome.runtime.sendMessage({
          action: 'report_view',
          videoId: videoId,
          watchedSeconds: watchedSeconds,
          source: 'YouTube'
        });
        updateNotification('✅ تم إرسال المشاهدة', 100);
        clearInterval(interval);
      }
    }, 1000);
  }

  // دالة لتخطي الإعلان
  function setupAdSkip() {
    const interval = setInterval(() => {
      const skipBtn = document.querySelector('.ytp-ad-skip-button, .ytp-skip-button');
      if (skipBtn && skipBtn.offsetParent !== null) {
        try {
          skipBtn.click();
          updateNotification('✅ تم تخطي الإعلان', 100);
          clearInterval(interval);
        } catch (e) {
          console.error('فشل تخطي الإعلان:', e);
        }
      }
    }, 1000);
  }

  // بدء عملية التتبع والمراقبة
  function init() {
    updateNotification('جارٍ البحث عن الفيديو...', 0);
    setupAdSkip();
    trackVideoPlayback();
  }

  // تأكد من تحميل DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
