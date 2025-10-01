(async () => {
  'use strict';

  // إنشاء شريط الإشعارات
  let notificationBar = document.createElement('div');
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
    display: flex;
    align-items: center;
    justify-content: space-between;
    box-shadow: 0 -2px 5px rgba(0,0,0,0.3);
  `;
  const messageSpan = document.createElement('span');
  messageSpan.id = 'notificationMessage';
  messageSpan.textContent = 'جارٍ البحث عن الفيديو...';
  notificationBar.appendChild(messageSpan);
  document.body.appendChild(notificationBar);

  function updateNotification(msg) {
    if (messageSpan) messageSpan.textContent = msg;
  }

  const result = await chrome.storage.local.get(['automationRunning', 'currentVideo']);
  if (!result.automationRunning || !result.currentVideo) {
    updateNotification('🔹 لم يتم تفعيل البحث التلقائي.');
    return;
  }

  const targetVideo = result.currentVideo;
  const targetVideoUrl = targetVideo.url || '';
  const targetVideoId = targetVideo.videoId || null;

  console.log('TasksRewardBot: البحث التلقائي مفعل');

  function extractIdFromHref(href) {
    if (!href) return null;
    try {
      const m = href.match(/(?:v=|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{8,11})/);
      return m ? m[1] : null;
    } catch { return null; }
  }

  function collectCandidateLinks() {
    const selectors = [
      'a#video-title',
      'a[href*="/watch?v="]',
      'ytd-video-renderer a#thumbnail',
      'ytd-video-renderer a#video-title'
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

  function findAndClickTarget() {
    const links = collectCandidateLinks();
    for (const link of links) {
      const id = extractIdFromHref(link.href);
      if ((targetVideoId && id === targetVideoId) || (targetVideoUrl && link.href.includes(targetVideoUrl))) {
        try {
          link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          updateNotification('✅ تم العثور على الفيديو المطلوب والنقر عليه.');
          console.log('TasksRewardBot: تم النقر على الفيديو المطلوب.');
          observer.disconnect(); // إيقاف المراقبة بعد العثور على الفيديو
          return true;
        } catch {
          try { link.click(); updateNotification('✅ تم العثور على الفيديو والنقر عليه.'); observer.disconnect(); return true; } catch {}
        }
      }
    }
    return false;
  }

  function getSearchKeywordsArray() {
    try {
      const u = new URL(window.location.href);
      const q = u.searchParams.get('search_query') || '';
      return decodeURIComponent(q).split(/\s+/).filter(Boolean);
    } catch { return []; }
  }

  // استخدام MutationObserver لمراقبة DOM ديناميكيًا
  const observer = new MutationObserver(() => {
    if (findAndClickTarget()) return;
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // بعد مهلة 10 ثواني، إذا لم يُعثر على الفيديو، نطلب fallback
  setTimeout(() => {
    if (findAndClickTarget()) return;
    updateNotification('⚠️ لم يُعثر على الفيديو، التوجه إلى مصدر بديل...');
    console.warn('TasksRewardBot: لم يُعثر على الفيديو، طلب فتح مصدر بديل.');
    observer.disconnect();
    chrome.runtime.sendMessage({
      action: 'try_fallback_redirect',
      videoId: targetVideoId,
      directUrl: targetVideoUrl,
      keywords: getSearchKeywordsArray()
    }, resp => { console.log('TasksRewardBot: رد الخلفية على طلب fallback', resp); });
  }, 10000);
})();
