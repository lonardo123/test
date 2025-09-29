// content.js — النسخة المعدلة لتعمل مع مشروعك
// السلوك:
// - تقرأ قاعدة API من chrome.storage (مفتاح: apiBaseUrl). إذا لم تُحدَّد، تستخدم http://localhost:3000
// - تستخدم endpoint: {API_BASE}/api/public-videos للبحث عن الفيديوهات المؤهلة
// - عند التعرف على فيديو مؤهل تبدأ التتبع، وترسل رسالة للخلفية ليتم استدعاء callback
// - تحفظ مصدر الفيديو إن وُجد (باراميتر __source أو referrer) وترسله مع طلب المكافأة
(() => {
  'use strict';

  // الإعدادات الافتراضية
  const DEFAULT_API = 'http://localhost:3000';

  // متغيرات التشغيل
  const externalSources = [
    { name: "Facebook", prefix: "https://l.facebook.com/l.php?u=" },
    { name: "Instagram", prefix: "https://l.instagram.com/?u=" },
    { name: "Google", prefix: "https://www.google.com/url?q=" }
  ];

  let apiBase = DEFAULT_API;
  let isTracking = false;
  let watchStartTime = null;
  let currentVideoId = null;
  let eligibleVideos = [];
  let redirectAttempted = {};
  let currentSource = null;

  // واصفات التخزين باستخدام الوعود
  function storageGet(keys) {
    return new Promise(resolve => chrome.storage.local.get(keys, resolve));
  }
  function storageSet(obj) {
    return new Promise(resolve => chrome.storage.local.set(obj, resolve));
  }

  // تحميل الإعدادات (apiBase و userId) ثم جلب قائمة الفيديوهات المؤهلة
  async function loadConfigAndFetch() {
    try {
      const data = await storageGet(['apiBaseUrl']);
      apiBase = (data && data.apiBaseUrl) ? data.apiBaseUrl : DEFAULT_API;
    } catch (e) {
      apiBase = DEFAULT_API;
    }
    await fetchEligibleVideos();
  }

  // جلب الفيديوهات المؤهلة من endpoint الخاص بمشروعك
  async function fetchEligibleVideos() {
    try {
      const url = new URL('/api/public-videos', apiBase).toString();
      const res = await fetch(url);
      if (!res.ok) throw new Error('fetch failed: ' + res.status);
      const data = await res.json();
      // نتوقع array { video_id, min_duration }
      eligibleVideos = (Array.isArray(data) ? data : []).map(v => ({
        video_id: v.video_id || v.id || v.videoId || v.video_id,
        min_duration: v.min_duration || v.minDuration || v.duration || 50
      }));
      console.log('TasksRewardBot: fetched eligible videos', eligibleVideos);
    } catch (err) {
      console.error('فشل جلب الفيديوهات:', err);
      eligibleVideos = [];
    }
  }

  // استخراج video id من روابط مختلفة
  function getVideoIdFromUrl() {
    try {
      const url = new URL(window.location.href);
      const v = url.searchParams.get('v');
      if (v) return v;
      const path = url.pathname.split('/').filter(Boolean);
      const shortsIndex = path.indexOf('shorts');
      if (shortsIndex !== -1 && path.length > shortsIndex + 1) return path[shortsIndex + 1];
      if (url.hostname.includes('youtu.be')) {
        const p = path;
        if (p.length > 0) return p[0];
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  function isVideoEligible(videoId) {
    return eligibleVideos.some(v => v.video_id === videoId);
  }

  function isPlayerAvailable() {
    if (document.querySelector('ytd-player-error-renderer')) return false;
    if (document.querySelector('.ytp-error')) return false;
    if (document.querySelector('#unavailable') || document.querySelector('.watch-error')) return false;
    const video = document.querySelector('video');
    return !!video;
  }

  function detectSourceFromReferrerOrParams() {
    try {
      const url = new URL(window.location.href);
      const explicit = url.searchParams.get('__source');
      if (explicit) return explicit;
      const ref = document.referrer || '';
      if (ref.includes('facebook.com') || ref.includes('l.facebook.com')) return 'Facebook';
      if (ref.includes('instagram.com') || ref.includes('l.instagram.com')) return 'Instagram';
      if (ref.includes('google.com')) return 'Google';
      return 'YouTube';
    } catch (e) {
      return 'YouTube';
    }
  }

  function requestRedirect(videoId) {
    if (redirectAttempted[videoId]) return;
    redirectAttempted[videoId] = true;
    chrome.runtime.sendMessage({ action: 'requestRedirect', videoId }, response => {
      console.log('redirect response', response);
    });
  }

  function setupAdSkip() {
    const timer = setInterval(() => {
      const skipBtn = document.querySelector('.ytp-skip-button, .ytp-ad-skip-button, .ytp-skip-ad-button');
      if (skipBtn) {
        try { skipBtn.click(); } catch (e) {}
        clearInterval(timer);
      }
    }, 1000);
  }

  async function observeVideo() {
    const videoId = getVideoIdFromUrl();
    if (!videoId) return;
    if (videoId !== currentVideoId) {
      currentVideoId = videoId;
      isTracking = false;
      watchStartTime = null;
      currentSource = null;

      try {
        const url = new URL(window.location.href);
        currentSource = url.searchParams.get('__source') || null;
      } catch (e) {
        currentSource = null;
      }

      if (!currentSource) {
        const stored = await storageGet(`video_source_${videoId}`);
        if (stored && stored[`video_source_${videoId}`]) {
          currentSource = stored[`video_source_${videoId}`];
        } else {
          currentSource = detectSourceFromReferrerOrParams();
        }
      }

      if (isVideoEligible(videoId)) {
        if (!isPlayerAvailable()) {
          console.warn('TasksRewardBot: player not available for', videoId, '- requesting redirect');
          requestRedirect(videoId);
          return;
        }
        isTracking = true;
        watchStartTime = Date.now();
        console.log('✅ TasksRewardBot: بدء تتبع الفيديو', videoId, 'المصدر:', currentSource);
      }
    }

    if (!isTracking) return;

    const videoEl = document.querySelector('video');
    if (!videoEl) return;

    const minDuration = (eligibleVideos.find(v => v.video_id === videoId)?.min_duration) || 50;
    const watchedMs = Date.now() - (watchStartTime || Date.now());
    const watchedSeconds = Math.floor(watchedMs / 1000);

    if (videoEl.duration > 0 && watchedSeconds >= Math.floor(minDuration * 0.95)) {
      chrome.runtime.sendMessage({
        action: 'rewardUser',
        videoId: videoId,
        watchedSeconds: Math.min(watchedSeconds, Math.floor(videoEl.duration)),
        source: currentSource || 'YouTube'
      });
      isTracking = false;
      console.log('TasksRewardBot: sent reward request for', videoId);
    }
  }

  // init
  loadConfigAndFetch();
  setupAdSkip();
  setInterval(() => { observeVideo().catch(err => console.error(err)); }, 1000);
})();