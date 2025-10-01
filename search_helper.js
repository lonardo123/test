(async () => {
  'use strict';

  // شريط الإشعارات
  let notificationBar = document.createElement('div');
  notificationBar.style.cssText = `
    position: fixed;
    bottom: 15px;
    left: 50%;
    transform: translateX(-50%);
    max-width: 400px;
    background: rgba(0,0,0,0.85);
    color: white;
    padding: 6px 12px;
    font-family: Arial, sans-serif;
    font-size: 14px;
    z-index: 9999;
    border-radius: 6px;
    text-align: center;
    box-shadow: 0 0 6px rgba(0,0,0,0.5);
  `;
  const messageSpan = document.createElement('span');
  messageSpan.id = 'notificationMessage';
  messageSpan.textContent = '🔹 جارٍ البحث عن الفيديو...';
  notificationBar.appendChild(messageSpan);
  document.body.appendChild(notificationBar);
  const updateNotification = msg => { if (messageSpan) messageSpan.textContent = msg; };

  // جلب بيانات الفيديو
  const result = await chrome.storage.local.get(['automationRunning', 'currentVideo']);
  if (!result.automationRunning || !result.currentVideo) {
    updateNotification('🔹 البحث التلقائي غير مفعل.');
    return;
  }

  const targetVideo = result.currentVideo;
  const targetVideoId = targetVideo.videoId;
  const targetVideoUrl = targetVideo.url;

  console.log('TasksRewardBot: البحث التلقائي مفعل');

  // استخراج videoId من href
  const extractIdFromHref = href => {
    if (!href) return null;
    const m = href.match(/(?:v=|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{8,11})/);
    return m ? m[1] : null;
  };

  // جمع روابط الفيديوهات الظاهرة على الصفحة
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

  // البحث عن الفيديو المطلوب
  function findAndClickTarget() {
    const links = collectCandidateLinks();
    for (const link of links) {
      const id = extractIdFromHref(link.href);
      const title = link.textContent || '';
      if ((targetVideoId && id === targetVideoId) || (targetVideoUrl && link.href.includes(targetVideoUrl))) {
        try {
          link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          updateNotification('✅ تم العثور على الفيديو وتشغيله.');
          console.log('TasksRewardBot: تم النقر على الفيديو المطلوب.');
          clearInterval(scrollInterval);
          observer.disconnect();
          return true;
        } catch { try { link.click(); return true; } catch {} }
      }
    }
    return false;
  }

  // الضغط على زر البحث بجانب مربع البحث
  const searchBtn = document.querySelector('button#search-icon-legacy');
  if (searchBtn) {
    updateNotification('🔹 الضغط على زر البحث...');
    searchBtn.click();
  }

  // التمرير التدريجي للأسفل لتحميل نتائج أكثر
  const scrollInterval = setInterval(() => {
    window.scrollBy({ top: 500, behavior: 'smooth' });
    updateNotification('🔄 التمرير للعثور على الفيديو...');
    findAndClickTarget();
  }, 3000);

  // مراقب DOM لملاحظة التحميل الديناميكي للفيديوهات الجديدة
  const observer = new MutationObserver(() => {
    findAndClickTarget();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // fallback بعد 20 ثانية إذا لم يُعثر على الفيديو
  setTimeout(() => {
    if (findAndClickTarget()) return;
    updateNotification('⚠️ لم يُعثر على الفيديو، التوجه إلى مصدر بديل...');
    console.warn('TasksRewardBot: لم يُعثر على الفيديو، طلب فتح مصدر بديل.');
    clearInterval(scrollInterval);
    observer.disconnect();
    chrome.runtime.sendMessage({
      action: 'try_fallback_redirect',
      videoId: targetVideoId,
      directUrl: targetVideoUrl,
      keywords: (new URLSearchParams(window.location.search).get('search_query') || '').split(/\s+/).filter(Boolean)
    }, resp => { console.log('TasksRewardBot: رد الخلفية على طلب fallback', resp); });
  }, 20000);

})();
