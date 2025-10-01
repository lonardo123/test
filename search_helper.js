(async () => {
  'use strict';

  // ===== شريط إشعارات أسفل الصفحة =====
  let notificationBar = null;
  function createNotificationBar() {
    if (notificationBar) return;
    notificationBar = document.createElement('div');
    notificationBar.style.cssText = `
      position: fixed;
      bottom: 10px;
      left: 50%;
      transform: translateX(-50%);
      width: 320px;
      background: #222;
      color: white;
      padding: 8px 12px;
      font-family: Arial, sans-serif;
      font-size: 13px;
      z-index: 9999;
      border-radius: 5px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.3);
      text-align: center;
    `;
    document.body.appendChild(notificationBar);
  }
  function updateNotification(msg) {
    if (!notificationBar) createNotificationBar();
    notificationBar.textContent = msg;
  }

  // ===== جلب بيانات التشغيل والفيديو =====
  const { automationRunning, currentVideo } = await chrome.storage.local.get(['automationRunning', 'currentVideo']);
  if (!automationRunning || !currentVideo) {
    updateNotification('🔹 التشغيل غير مفعل أو لا توجد بيانات فيديو');
    return;
  }
  const targetVideoId = currentVideo.videoId;
  if (!targetVideoId) {
    updateNotification('❌ videoId غير موجود');
    return;
  }
  updateNotification('🔹 البحث عن الفيديو المستهدف...');

  // ===== استخراج videoId من href =====
  function extractVideoId(href) {
    if (!href) return null;
    const patterns = [
      /v=([A-Za-z0-9_-]{11})/,
      /\/shorts\/([A-Za-z0-9_-]{8,})/,
      /\/embed\/([A-Za-z0-9_-]{11})/
    ];
    for (const p of patterns) {
      const m = href.match(p);
      if (m && m[1]) return m[1];
    }
    const fallback = href.match(/([A-Za-z0-9_-]{11})/);
    return fallback ? fallback[1] : null;
  }

  // ===== جمع الروابط =====
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

  // ===== تمرير الصفحة حتى يتم تحميل جميع النتائج =====
  async function scrollPage() {
    let lastHeight = 0;
    const delay = 1500;
    const step = 800;
    for (let i = 0; i < 10; i++) {
      window.scrollBy(0, step);
      await new Promise(r => setTimeout(r, delay));
      const newHeight = document.body.scrollHeight;
      if (newHeight === lastHeight) break;
      lastHeight = newHeight;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await new Promise(r => setTimeout(r, 500));
  }

  // ===== العثور على الفيديو والنقر عليه =====
  async function findAndClickVideo() {
    const links = collectLinks();
    for (const link of links) {
      const id = extractVideoId(link.href);
      if (id === targetVideoId) {
        // تمرير العنصر إلى منتصف الشاشة
        link.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise(r => setTimeout(r, 600));
        updateNotification('✅ تم العثور على الفيديو، جار النقر...');
        try {
          link.click();
        } catch (e) {
          // fallback
          link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        }
        return true;
      }
    }
    return false;
  }

  // ===== المراقبة + fallback =====
  async function startSearch() {
    updateNotification('🔹 تحريك الصفحة للعثور على الفيديو...');
    await scrollPage();

    if (await findAndClickVideo()) return;

    updateNotification('🔹 الفيديو لم يُعثر عليه بعد، مراقبة DOM...');
    const observer = new MutationObserver(async () => {
      if (await findAndClickVideo()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(async () => {
      if (await findAndClickVideo()) {
        observer.disconnect();
      } else {
        observer.disconnect();
        updateNotification('⚠️ لم يُعثر على الفيديو، فتح مصادر بديلة...');
        chrome.runtime.sendMessage({
          action: 'try_fallback_redirect',
          videoId: targetVideoId,
          directUrl: currentVideo.url,
          keywords: currentVideo.keywords || []
        });
      }
    }, 3000);
  }

  startSearch();
})();
