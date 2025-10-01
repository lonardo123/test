(() => {
  'use strict';

  // إنشاء شريط الإشعارات أسفل الصفحة
  let notificationBar = null;
  function createNotificationBar() {
    if (notificationBar) return;
    notificationBar = document.createElement('div');
    notificationBar.style.cssText = `
      position: fixed;
      bottom: 12px;
      left: 50%;
      transform: translateX(-50%);
      width: 400px;
      background: #222;
      color: white;
      padding: 8px 12px;
      font-family: Arial, sans-serif;
      font-size: 13px;
      z-index: 99999;
      box-shadow: 0 -1px 5px rgba(0,0,0,0.3);
      border-radius: 6px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;
    const messageSpan = document.createElement('span');
    messageSpan.id = 'tasksNotificationMessage';
    notificationBar.appendChild(messageSpan);
    document.body.appendChild(notificationBar);
  }

  function updateNotification(message) {
    if (!notificationBar) createNotificationBar();
    const span = document.getElementById('tasksNotificationMessage');
    if (span) span.textContent = message;
  }

  // استخراج videoId من href (watch, shorts, embed)
  function extractVideoId(href) {
    if (!href) return null;
    try {
      const m = href.match(/(?:v=|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{8,11})/);
      if (m && m[1]) return m[1];
    } catch (e) {}
    return null;
  }

  // البحث عن الفيديو في صفحة النتائج بناءً على videoId
  function findVideoById(videoId) {
    const selectors = [
      'a#video-title',
      'ytd-video-renderer a#thumbnail',
      'ytd-video-renderer a#video-title',
      'ytd-grid-video-renderer a#video-title'
    ];
    const links = [];
    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(a => {
        if (a && a.href) links.push(a);
      });
    });

    for (const link of links) {
      const vid = extractVideoId(link.href);
      if (vid && videoId && vid === videoId) return link;
    }
    return null;
  }

  // الضغط على زر البحث إن وجد
  function clickSearchButton() {
    const btn = document.querySelector('button#search-icon-legacy') || document.querySelector('button[aria-label="Search"]');
    if (btn && btn.offsetParent !== null) {
      btn.click();
      updateNotification('🔹 تم الضغط على زر البحث');
      return true;
    }
    return false;
  }

  // التمرير لأسفل ثم لأعلى لمساعدة ظهور الفيديو
  async function autoScroll() {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    await new Promise(r => setTimeout(r, 1200));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await new Promise(r => setTimeout(r, 1200));
  }

  async function searchAndClickVideo(currentVideo, maxAttempts = 6) {
    updateNotification('🔹 بدء البحث عن الفيديو...');
    const videoId = currentVideo.videoId;
    if (!videoId) {
      updateNotification('❌ لا يوجد videoId للفيديو');
      return false;
    }

    for (let i = 0; i < maxAttempts; i++) {
      const videoEl = findVideoById(videoId);
      if (videoEl) {
        updateNotification('✅ تم العثور على الفيديو، جارِ النقر...');
        videoEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise(r => setTimeout(r, 600));
        videoEl.click();
        updateNotification('▶️ الفيديو تم تشغيله');
        return true;
      }
      updateNotification(`🔹 البحث عن الفيديو، محاولة ${i + 1}/${maxAttempts}...`);
      clickSearchButton();
      await autoScroll();
    }

    // إذا لم يُعثر على الفيديو، استخدام fallback
    updateNotification('⚠️ لم يُعثر على الفيديو، الانتقال إلى fallback');
    if (currentVideo.fallback && Array.isArray(currentVideo.fallback)) {
      for (const url of currentVideo.fallback) {
        window.open(url, '_blank');
      }
    }
    return false;
  }

  async function init() {
    createNotificationBar();
    const result = await chrome.storage.local.get('currentVideo');
    const currentVideo = result.currentVideo;
    if (!currentVideo) {
      updateNotification('❌ لا يوجد فيديو محدد للبحث');
      return;
    }

    searchAndClickVideo(currentVideo);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
