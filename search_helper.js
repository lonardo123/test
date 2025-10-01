(async () => {
  'use strict';

  // =============================
  // التحقق من أننا على موقع YouTube
  // =============================
  if (!window.location.hostname.includes('youtube.com')) {
    return;
  }

  // =============================
  // إنشاء شريط إشعارات أسفل الصفحة
  // =============================
  let notificationBar = null;
  function createNotificationBar() {
    if (notificationBar) return;
    notificationBar = document.createElement('div');
    notificationBar.id = 'yt-automation-notification';
    notificationBar.style.cssText = `
      position: fixed;
      bottom: 10px;
      left: 50%;
      transform: translateX(-50%);
      width: 320px;
      background: #222;
      color: white;
      padding: 6px 12px;
      font-family: Arial, sans-serif;
      font-size: 13px;
      z-index: 999999;
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      text-align: center;
      pointer-events: none;
    `;
    document.body.appendChild(notificationBar);
  }

  function updateNotification(message) {
    if (!notificationBar) createNotificationBar();
    notificationBar.textContent = message;
  }

  // =============================
  // جلب بيانات التشغيل من التخزين
  // =============================
  const result = await chrome.storage.local.get(['automationRunning', 'currentVideo']);
  if (!result.automationRunning || !result.currentVideo) {
    updateNotification('🔹 التشغيل غير مفعّل أو لا توجد بيانات فيديو.');
    return;
  }

  const targetVideo = result.currentVideo;
  let targetVideoId = targetVideo.videoId;

  // استخراج videoId من الرابط إذا لم يكن متوفرًا
  if (!targetVideoId && targetVideo.url) {
    try {
      const url = new URL(targetVideo.url);
      targetVideoId = url.searchParams.get('v') || 
                     (url.pathname.match(/\/shorts\/([A-Za-z0-9_-]{8,11})/)?.[1]) ||
                     null;
    } catch (e) {
      // تجاهل الخطأ
    }
  }

  if (!targetVideoId || !/^[A-Za-z0-9_-]{8,11}$/.test(targetVideoId)) {
    updateNotification('❌ معرّف الفيديو غير صالح.');
    return;
  }

  updateNotification(`🔹 البحث عن الفيديو: ${targetVideoId}`);

  // =============================
  // دالة استخراج videoId من أي رابط
  // =============================
  function extractVideoId(href) {
    if (!href || typeof href !== 'string') return null;

    // تطابق شامل مع جميع أنماط YouTube
    const patterns = [
      /(?:\?|&)v=([A-Za-z0-9_-]{11})/,
      /\/shorts\/([A-Za-z0-9_-]{8,11})/,
      /\/embed\/([A-Za-z0-9_-]{8,11})/,
      /\/watch\/([A-Za-z0-9_-]{11})/, // نادر لكن ممكن
      /youtu\.be\/([A-Za-z0-9_-]{8,11})/
    ];

    for (const pattern of patterns) {
      const match = href.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    return null;
  }

  // =============================
  // تحريك الصفحة لأعلى وأسفل لتفعيل lazy load
  // =============================
  async function scrollPage() {
    const step = window.innerHeight;
    const delay = 1200;
    let lastHeight = document.body.scrollHeight;

    // التمرير للأسفل حتى النهاية
    while (true) {
      window.scrollBy(0, step);
      await new Promise(r => setTimeout(r, delay));
      const newHeight = document.body.scrollHeight;
      if (newHeight === lastHeight) break;
      lastHeight = newHeight;
    }

    // العودة للأعلى بسلاسة
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await new Promise(r => setTimeout(r, 600));
  }

  // =============================
  // جمع الروابط المرشحة
  // =============================
  function collectCandidateLinks() {
    const selectors = [
      'a#video-title',
      'a[href*="youtube.com/"]',
      'ytd-video-renderer a#thumbnail',
      'ytd-reel-item-renderer a#thumbnail',
      'ytd-rich-item-renderer a#thumbnail',
      'ytd-grid-video-renderer a#thumbnail'
    ];

    const links = new Set();
    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        if (el.href && el.href.includes('youtube.com')) {
          links.add(el);
        }
      });
    });
    return Array.from(links);
  }

  // =============================
  // التحقق مما إذا كان العنصر مرئيًا وقابلًا للنقر
  // =============================
  function isVisibleAndClickable(el) {
    const rect = el.getBoundingClientRect();
    const isVisible = rect.top >= 0 && rect.bottom <= window.innerHeight && rect.width > 0 && rect.height > 0;
    const style = window.getComputedStyle(el);
    const isHidden = style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) < 0.1;
    return isVisible && !isHidden;
  }

  // =============================
  // محاولة العثور على الفيديو والنقر عليه
  // =============================
  function findAndClickTarget() {
    const candidates = collectCandidateLinks();
    for (const link of candidates) {
      const id = extractVideoId(link.href);
      if (id === targetVideoId) {
        if (isVisibleAndClickable(link)) {
          updateNotification('✅ تم العثور على الفيديو! جارٍ النقر...');
          // محاكاة نقرة طبيعية
          link.click();
          return true;
        }
      }
    }
    return false;
  }

  // =============================
  // بدء عملية البحث
  // =============================
  async function startSearch() {
    updateNotification('🔹 جاري تمرير الصفحة لتحميل الفيديوهات...');
    await scrollPage();

    if (findAndClickTarget()) return;

    updateNotification('🔹 مراقبة التغييرات في الصفحة...');
    let found = false;
    const observer = new MutationObserver(() => {
      if (!found && findAndClickTarget()) {
        found = true;
        observer.disconnect();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // fallback بعد 2.5 ثانية
    setTimeout(() => {
      if (!found) {
        observer.disconnect();
        updateNotification('⚠️ الفيديو غير موجود. جارٍ استخدام مصادر بديلة...');
        chrome.runtime.sendMessage({
          action: 'try_fallback_redirect',
          videoId: targetVideoId,
          directUrl: targetVideo.url,
          keywords: targetVideo.keywords || []
        });
      }
    }, 2500);
  }

  // بدء التنفيذ
  startSearch();

})();
