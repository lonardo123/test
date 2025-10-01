(async () => {
  'use strict';

  // =============================
  // شريط إشعارات أسفل الصفحة
  // =============================
  let notificationBar = null;
  function createNotificationBar() {
    if (notificationBar) return;
    notificationBar = document.createElement('div');
    notificationBar.style.cssText = `
      position: fixed;
      bottom: 10px;
      left: 50%;
      transform: translateX(-50%);
      width: 300px;
      background: #222;
      color: white;
      padding: 6px 12px;
      font-family: Arial, sans-serif;
      font-size: 13px;
      z-index: 9999;
      border-radius: 4px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.3);
      text-align: center;
    `;
    document.body.appendChild(notificationBar);
  }
  function updateNotification(message) {
    if (!notificationBar) createNotificationBar();
    notificationBar.textContent = message;
  }

  // =============================
  // جلب بيانات التشغيل والفيديو
  // =============================
  const result = await chrome.storage.local.get(['automationRunning', 'currentVideo']);
  if (!result.automationRunning || !result.currentVideo) {
    updateNotification('🔹 التشغيل غير مفعل أو لا توجد بيانات فيديو');
    return;
  }

  const targetVideo = result.currentVideo;
  const targetVideoId = targetVideo.videoId;
  if (!targetVideoId) {
    updateNotification('❌ videoId غير موجود');
    return;
  }

  updateNotification('🔹 البحث عن الفيديو المستهدف...');

  // =============================
  // استخراج videoId من أي href
  // =============================
  function extractVideoId(href) {
    if (!href) return null;
    const patterns = [
      /v=([A-Za-z0-9_-]{11})/,       // watch?v=
      /\/shorts\/([A-Za-z0-9_-]{8,})/, // shorts
      /\/embed\/([A-Za-z0-9_-]{11})/   // embed
    ];
    for (const p of patterns) {
      const m = href.match(p);
      if (m && m[1]) return m[1];
    }
    // fallback: أي videoId موجود داخل href
    const fallback = href.match(/([A-Za-z0-9_-]{11})/);
    if (fallback && fallback[1]) return fallback[1];
    return null;
  }

  // =============================
  // جمع جميع الروابط المرئية
  // =============================
  function collectLinks() {
    const selectors = [
      'a#video-title',
      'ytd-video-renderer a#thumbnail',
      'ytd-video-renderer a#video-title',
      'ytd-reel-video-renderer a#thumbnail',
      'ytd-reel-video-renderer a#video-title'
    ];
    const set = new Set();
    const arr = [];
    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        if (el && el.href && !set.has(el.href)) {
          set.add(el.href);
          arr.push(el);
        }
      });
    });
    return arr;
  }

  // =============================
  // محاولة العثور على الفيديو والنقر عليه
  // =============================
  function findAndClickVideo() {
    const links = collectLinks();
    for (const link of links) {
      const id = extractVideoId(link.href);
      if (id === targetVideoId) {
        const rect = link.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          updateNotification('✅ تم العثور على الفيديو، جار النقر...');
          link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          return true;
        }
      }
    }
    return false;
  }

  // =============================
  // التمرير على الصفحة لضمان تحميل جميع النتائج
  // =============================
  async function scrollPage() {
    let lastHeight = 0;
    const delay = 1500;
    const step = 800;
    for (let i = 0; i < 10; i++) { // 10 محاولات للتمرير
      window.scrollBy(0, step);
      await new Promise(r => setTimeout(r, delay));
      const newHeight = document.body.scrollHeight;
      if (newHeight === lastHeight) break;
      lastHeight = newHeight;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await new Promise(r => setTimeout(r, 500));
  }

  // =============================
  // المراقبة الديناميكية + fallback
  // =============================
  async function startSearch() {
    updateNotification('🔹 تحريك الصفحة للعثور على الفيديو...');
    await scrollPage();

    if (findAndClickVideo()) return;

    updateNotification('🔹 الفيديو لم يُعثر عليه بعد، مراقبة DOM...');
    const observer = new MutationObserver(() => {
      if (findAndClickVideo()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // إعادة محاولة ثانية بعد 2 ثانية
    setTimeout(() => {
      if (findAndClickVideo()) {
        observer.disconnect();
      } else {
        observer.disconnect();
        updateNotification('⚠️ لم يُعثر على الفيديو، فتح مصادر بديلة...');
        chrome.runtime.sendMessage({
          action: 'try_fallback_redirect',
          videoId: targetVideoId,
          directUrl: targetVideo.url,
          keywords: targetVideo.keywords || []
        });
      }
    }, 2000);
  }

  startSearch();
})();
