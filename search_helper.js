(async () => {
  'use strict';

  const result = await chrome.storage.local.get(['automationRunning', 'currentVideo']);
  if (!result.automationRunning || !result.currentVideo) return;

  const targetVideo = result.currentVideo;
  const targetVideoUrl = targetVideo.url || '';
  const targetVideoId = targetVideo.videoId || null;

  console.log('TasksRewardBot: البحث التلقائي مفعل — جار محاولة العثور على الفيديو...');

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
          console.log('TasksRewardBot: تم النقر على الفيديو المطلوب.');
          return true;
        } catch { try { link.click(); return true; } catch {} }
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

  setTimeout(() => {
    if (findAndClickTarget()) return;

    setTimeout(() => {
      if (findAndClickTarget()) return;

      console.warn('TasksRewardBot: لم يُعثر على الفيديو، طلب فتح مصدر بديل.');
      chrome.runtime.sendMessage({
        action: 'try_fallback_redirect',
        videoId: targetVideoId,
        directUrl: targetVideoUrl,
        keywords: getSearchKeywordsArray()
      }, resp => {
        console.log('TasksRewardBot: رد الخلفية على طلب fallback', resp);
      });
    }, 2000);
  }, 1000);
})();
