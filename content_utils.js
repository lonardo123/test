(() => {
  'use strict';

  // ---------------- شريط الإشعارات ----------------
  let notificationBar = null;
  let notificationMessage = null;

  function createNotificationBar() {
    if (notificationBar) return;
    notificationBar = document.createElement('div');
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
    notificationMessage = document.createElement('span');
    notificationMessage.id = 'notificationMessage';
    notificationMessage.textContent = '🔹 جاري التحميل...';
    notificationBar.appendChild(notificationMessage);
    document.body.appendChild(notificationBar);
  }

  function updateNotification(message) {
    createNotificationBar();
    if (notificationMessage) notificationMessage.textContent = message;
  }

  // ---------------- دوال مساعدة ----------------
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function extractVideoIdFromHref(href) {
    if (!href) return null;
    const match = href.match(/(?:v=|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{8,11})/);
    return match ? match[1] : null;
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

  async function scrollPage(duration = 20000, step = 500, interval = 3000) {
    const endTime = Date.now() + duration;
    return new Promise(resolve => {
      const scrollInterval = setInterval(() => {
        window.scrollBy({ top: step, behavior: 'smooth' });
        if (Date.now() > endTime) {
          clearInterval(scrollInterval);
          resolve();
        }
      }, interval);
    });
  }

  async function findAndClickTarget(targetVideo) {
    const links = collectCandidateLinks();
    for (const link of links) {
      const id = extractVideoIdFromHref(link.href);
      const urlMatch = targetVideo.url && link.href.includes(targetVideo.url);
      if ((targetVideo.videoId && id === targetVideo.videoId) || urlMatch) {
        try {
          link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          updateNotification('✅ تم العثور على الفيديو وتشغيله.');
          console.log('TasksRewardBot: تم النقر على الفيديو المطلوب.');
          return true;
        } catch {
          try { link.click(); return true; } catch {}
        }
      }
    }
    return false;
  }

  async function searchAndPlayVideo(targetVideo, maxWait = 20000) {
    createNotificationBar();
    updateNotification('🔹 بدء البحث عن الفيديو...');

    // الضغط على زر البحث بجانب مربع البحث
    const searchBtn = document.querySelector('button#search-icon-legacy');
    if (searchBtn) {
      updateNotification('🔹 الضغط على زر البحث...');
      searchBtn.click();
    }

    const observer = new MutationObserver(() => findAndClickTarget(targetVideo));
    observer.observe(document.body, { childList: true, subtree: true });

    const startTime = Date.now();
    const scrollStep = 500;
    const scrollIntervalMs = 3000;

    return new Promise(resolve => {
      const intervalId = setInterval(async () => {
        if (findAndClickTarget(targetVideo)) {
          clearInterval(intervalId);
          observer.disconnect();
          resolve(true);
        } else {
          window.scrollBy({ top: scrollStep, behavior: 'smooth' });
          updateNotification('🔄 التمرير للعثور على الفيديو...');
        }
        if (Date.now() - startTime > maxWait) {
          clearInterval(intervalId);
          observer.disconnect();
          updateNotification('⚠️ لم يُعثر على الفيديو، التوجه إلى مصدر بديل...');
          console.warn('TasksRewardBot: لم يُعثر على الفيديو، طلب فتح مصدر بديل.');
          resolve(false);
        }
      }, scrollIntervalMs);
    });
  }

  // ---------------- تصدير الدوال ----------------
  window.TasksRewardBotUtils = {
    updateNotification,
    sleep,
    extractVideoIdFromHref,
    collectCandidateLinks,
    findAndClickTarget,
    searchAndPlayVideo
  };

})();
