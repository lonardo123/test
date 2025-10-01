(async () => {
  'use strict';

  // =============================
  // إنشاء شريط إشعارات أسفل الصفحة
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
      width: 320px;
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
  const targetVideoId = targetVideo.videoId || (function() {
    try {
      const u = new URL(targetVideo.url);
      return u.searchParams.get('v') || null;
    } catch (e) {
      return null;
    }
  })();

  updateNotification('🔹 البحث عن الفيديو المستهدف...');

  // =============================
  // دالة استخراج videoId من href
  // =============================
  function extractVideoId(href) {
    if (!href) return null;
    try {
      const m1 = href.match(/(?:v=|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{8,11})/);
      if (m1 && m1[1]) return m1[1];
      const m2 = href.match(/\/watch\?v=([A-Za-z0-9_-]{11})/);
      if (m2 && m2[1]) return m2[1];
      const m3 = href.match(/\/shorts\/([A-Za-z0-9_-]{8,})/);
      if (m3 && m3[1]) return m3[1];
    } catch (e) {}
    return null;
  }

  // =============================
  // تحريك الصفحة لأعلى وأسفل للتأكد من تحميل الفيديوهات
  // =============================
  async function scrollPage() {
    const scrollStep = 800;
    const delay = 1500;
    let lastHeight = 0;
    let reachedBottom = false;

    while (!reachedBottom) {
      window.scrollBy(0, scrollStep);
      await new Promise(r => setTimeout(r, delay));
      const currentHeight = document.body.scrollHeight;
      if (currentHeight === lastHeight) {
        reachedBottom = true;
      } else {
        lastHeight = currentHeight;
      }
    }

    // عد إلى الأعلى قليلاً
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await new Promise(r => setTimeout(r, 500));
  }

  // =============================
  // جمع جميع الروابط المحتملة
  // =============================
  function collectCandidateLinks() {
    const selectors = [
      'a#video-title',
      'a[href*="/watch?v="]',
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
  function findAndClickTarget() {
    const links = collectCandidateLinks();
    for (const link of links) {
      const id = extractVideoId(link.href);
      if (!id) continue;
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
  // إعادة محاولة البحث + مراقبة DOM
  // =============================
  async function startSearch() {
    updateNotification('🔹 تحريك الصفحة للعثور على الفيديو...');
    await scrollPage();

    if (findAndClickTarget()) return;

    updateNotification('🔹 الفيديو لم يُعثر عليه بعد، مراقبة DOM...');
    const observer = new MutationObserver(() => {
      if (findAndClickTarget()) {
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // محاولة ثانية بعد 2 ثانية
    setTimeout(() => {
      if (findAndClickTarget()) {
        observer.disconnect();
      } else {
        observer.disconnect();
        updateNotification('⚠️ لم يُعثر على الفيديو، فتح مصادر بديلة...');
        // إرسال رسالة للخلفية لفتح fallback URLs
        chrome.runtime.sendMessage({
          action: 'try_fallback_redirect',
          videoId: targetVideoId,
          directUrl: targetVideo.url,
          keywords: targetVideo.keywords || []
        });
      }
    }, 2000);
  }

  // بدء البحث
  startSearch();

})();
