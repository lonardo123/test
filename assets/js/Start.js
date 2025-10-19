'use strict';

(function () {

  /* ====== إعدادات عامة ====== */
  const MainUrl = "https://perceptive-victory-production.up.railway.app";
  const PUBLIC_VIDEOS_PATH = "/api/public-videos";
  const MY_VIDEOS_PATH = "/api/my-videos";
  const CALLBACK_PATH = "/video-callback";
  const SECRET_KEY = "MySuperSecretKey123ForCallbackOnly";
  const WORKER_PATH = "/worker/start";

  const NO_REPEAT_HOURS = 30;
  const REDIRECT_DELAY_MS = 1200;
  const CALLBACK_RETRY_DELAY_MS = 2000;
  const CALLBACK_MAX_RETRIES = 2;

  /* ====== حالة التطبيق الرئيسية ====== */
  let appState = {
    stopped: false,
    isWorkerPage: false,
    userInitialized: false,
    currentUserId: null,
    currentVideo: null,
    timers: new Set(),
    observers: new Set(),
    currentSession: {
      videoId: null,
      elapsed: 0,
      requiredSeconds: 0,
      callbackSent: false,
      tickInterval: null,
      adWatcherInterval: null,
      humanScrollInterval: null,
    }
  };

  // متغيرات عامة
  let stopped = false;
  let currentAjaxData = null;
  let startGetVideo = true;
  let alreadyStarted = false;
  let tickInterval = null;
  let adWatcherInterval = null;
  let humanScrollStop = null;
  let timers = new Set();

  /* ====== أدوات المؤقتات الآمنة ====== */
  function safeTimeout(fn, delay) {
    const id = setTimeout(() => {
      appState.timers.delete(id);
      try { fn(); } catch (e) { log('safeTimeout error:', e); }
    }, delay);
    appState.timers.add(id);
    return id;
  }

  function safeInterval(fn, interval) {
    const id = setInterval(() => {
      try { fn(); } catch (e) { log('safeInterval error:', e); }
    }, interval);
    appState.timers.add(id);
    return id;
  }

  function clearAllTimers() {
    appState.timers.forEach(id => {
      try { clearTimeout(id); clearInterval(id); } catch (e) {}
    });
    appState.timers.clear();
  }

  function log(...args) {
    console.log('[VideoWorker]', ...args);
  }

  /* ====== قراءة وحفظ User ID ====== */
  async function readUserId() {
    let userId = null;

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      userId = await new Promise((resolve) => {
        chrome.storage.local.get(['user_id'], (res) => {
          if (chrome.runtime?.lastError) return resolve(null);
          resolve(res?.user_id ? String(res.user_id).trim() : null);
        });
      });
      if (userId) return userId;
    }

    try {
      const v = localStorage.getItem('user_id');
      if (v) userId = String(v).trim();
    } catch (e) {}

    if (!userId) {
      try {
        const name = 'user_id';
        const cookies = `; ${document.cookie || ''}`;
        const parts = cookies.split(`; ${name}=`);
        if (parts.length === 2) userId = parts.pop().split(';').shift();
      } catch (e) {}
    }

    if (userId && typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ user_id: userId }, () => {
        log('✅ تم حفظ user_id');
      });
    }

    return userId;
  }

  /* ====== معالجة روابط YouTube ====== */
  function normalizeYouTubeLink(original) {
    try {
      if (!original) return original;
      let u = original.trim().replace(/&amp;/g, '&');
      
      if (u.includes("youtube.com/shorts/")) {
        const videoId = u.split("/shorts/")[1].split(/[?#/]/)[0];
        return `https://www.youtube.com/watch?v=${videoId}`;
      } else if (u.includes("youtu.be/")) {
        const videoId = u.split("youtu.be/")[1].split(/[?#/]/)[0];
        return `https://www.youtube.com/watch?v=${videoId}`;
      }
      return u;
    } catch (e) {
      return original;
    }
  }

  function generateWrappedUrl(originalUrl) {
    try {
      const fixedUrl = normalizeYouTubeLink(originalUrl);
      const encoded = encodeURIComponent(fixedUrl);
      const randomToken = Array.from({length: 80}, () => 
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
          .charAt(Math.floor(Math.random() * 64))
      ).join('');

      const sources = [
        `https://l.facebook.com/l.php?u=${encoded}`,
        `https://www.google.com/url?q=${encoded}`,
        `https://l.instagram.com/?u=${fixedUrl}&e=${randomToken}&s=1`
      ];

      return sources[Math.floor(Math.random() * sources.length)];
    } catch (e) {
      log('generateWrappedUrl error:', e);
      return originalUrl;
    }
  }

  /* ====== إدارة سجل المشاهدات ====== */
  function getViewedKey(userId) {
    return `viewed_videos_${userId}`;
  }

  async function markVideoViewed(userId, videoId) {
    try {
      const key = getViewedKey(userId);
      let map = {};

      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        map = await new Promise(res => 
          chrome.storage.local.get([key], r => res(r?.[key] || {}))
        );
        map[videoId] = Date.now();
        await new Promise(res => chrome.storage.local.set({ [key]: map }, res));
      } else {
        const raw = localStorage.getItem(key) || '{}';
        map = JSON.parse(raw);
        map[videoId] = Date.now();
        localStorage.setItem(key, JSON.stringify(map));
      }
      return true;
    } catch (e) {
      log('markVideoViewed error:', e);
      return false;
    }
  }

  async function hasViewedRecently(userId, videoId, hours) {
    try {
      const key = getViewedKey(userId);
      let map = {};

      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        map = await new Promise(res => 
          chrome.storage.local.get([key], r => res(r?.[key] || {}))
        );
      } else {
        const raw = localStorage.getItem(key) || '{}';
        map = JSON.parse(raw);
      }

      const ts = map[videoId];
      if (!ts) return false;
      return (Date.now() - ts) < hours * 3600 * 1000;
    } catch (e) {
      return false;
    }
  }

  /* ====== شريط التتبع ====== */
  function injectProgressBar() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectProgressBar, { once: true });
      return;
    }

    if (document.getElementById('trb-overlay')) return;

    log('إنشاء شريط التتبع');

    const css = `
#trb-overlay {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  z-index: 999999999;
  width: 70%;
  max-width: 1100px;
  background: rgba(0,0,0,0.88);
  padding: 12px 16px;
  border-radius: 12px;
  color: #fff;
  font-family: 'Segoe UI', Arial, sans-serif;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  border: 1px solid rgba(76,175,80,0.3);
}
#trb-header {
  text-align: center;
  font-weight: 700;
  color: #4CAF50;
  margin-bottom: 8px;
  cursor: pointer;
  font-size: 14px;
}
#trb-bar {
  width: 100%;
  height: 6px;
  background: rgba(255,255,255,0.15);
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 8px;
}
#trb-progress {
  height: 100%;
  width: 0%;
  background: linear-gradient(90deg, #2196F3 0%, #4CAF50 100%);
  transition: width 0.3s ease;
  box-shadow: 0 0 8px rgba(76,175,80,0.6);
}
#trb-msg {
  text-align: center;
  font-size: 13px;
  margin: 6px 0;
  min-height: 18px;
}
#trb-pay-notice {
  text-align: center;
  color: #81C784;
  font-size: 12px;
  font-weight: 500;
  min-height: 16px;
}
`;

    const style = document.createElement('style');
    style.id = 'trb-style';
    style.textContent = css;
    try {
      document.head?.appendChild(style) || document.documentElement.appendChild(style);
    } catch (e) {}

    const overlay = document.createElement('div');
    overlay.id = 'trb-overlay';
    overlay.innerHTML = `
<div id="trb-header">@TasksRewardBot</div>
<div id="trb-bar"><div id="trb-progress"></div></div>
<div id="trb-msg">جارٍ تحضير الفيديو...</div>
<div id="trb-pay-notice"></div>
`;

    try {
      document.body?.appendChild(overlay) || document.documentElement.appendChild(overlay);
    } catch (e) {}

    const header = document.getElementById('trb-header');
    if (header) {
      header.addEventListener('click', stopAllCompletely);
    }
  }

  function setBarMessage(msg) {
    try {
      const el = document.getElementById('trb-msg');
      if (el) el.textContent = msg;
    } catch (e) {}
  }

  function setBarProgress(percent) {
    try {
      const el = document.getElementById('trb-progress');
      if (el) {
        const p = Math.max(0, Math.min(100, Number(percent) || 0));
        el.style.width = p + '%';
      }
    } catch (e) {}
  }

  function setBarPayNotice(msg) {
    try {
      const el = document.getElementById('trb-pay-notice');
      if (el) el.textContent = msg || '';
    } catch (e) {}
  }

  function removeProgressBar() {
    try {
      document.getElementById('trb-overlay')?.remove();
      document.getElementById('trb-style')?.remove();
    } catch (e) {}
  }

  /* ====== تشغيل الفيديو ====== */
  function tryPlayVideoElement() {
    try {
      const video = document.querySelector('video');
      if (video) {
        video.play().catch(() => {
          try {
            document.querySelector('button.ytp-play-button, .play-button, .jw-icon-play')?.click();
          } catch (e) {}
        });
        return video;
      }
      
      const playBtn = document.querySelector('button.ytp-play-button, .play-button, .jw-icon-play');
      if (playBtn) playBtn.click();
    } catch (e) {
      log('tryPlayVideoElement error:', e);
    }
    return null;
  }

  /* ====== مراقب الإعلانات مع تخطي تلقائي ====== */
  function startAdWatcher(onAdStart, onAdEnd) {
    let wasAdVisible = false;
    let skipAttempts = 0;
    const MAX_SKIP_ATTEMPTS = 10;
    
    const trySkipAd = () => {
      if (skipAttempts >= MAX_SKIP_ATTEMPTS) return;
      
      const skipButtons = document.querySelectorAll(
        '.ytp-ad-skip-button, button[aria-label="Skip ad"], ' +
        '[class*="skip"], [aria-label*="Skip"], [aria-label*="تخطي"]'
      );
      
      for (const btn of skipButtons) {
        const style = window.getComputedStyle(btn);
        if (style.display !== 'none' && style.visibility !== 'hidden') {
          try {
            btn.click();
            log('[Ad] تم الضغط على زر التخطي');
            skipAttempts++;
            return true;
          } catch (e) {
            log('[Ad] خطأ عند الضغط:', e);
          }
        }
      }
      
      const adClose = document.querySelector('.ytp-ad-close-button, [aria-label="Close"]');
      if (adClose) {
        try {
          adClose.click();
          log('[Ad] تم إغلاق الإعلان');
          return true;
        } catch (e) {}
      }
      
      return false;
    };
    
    const check = () => {
      const adVisible = !!document.querySelector(
        '.ad-showing, .ytp-ad-player-overlay, .video-ads, .jw-ad, ' +
        '.player-overlay-ad, .ytp-ad-message-container'
      );
      
      if (adVisible && !wasAdVisible) {
        wasAdVisible = true;
        skipAttempts = 0;
        log('[Ad] كتشاف إعلان');
        onAdStart?.();
        trySkipAd();
      } else if (adVisible && wasAdVisible) {
        trySkipAd();
      } else if (!adVisible && wasAdVisible) {
        wasAdVisible = false;
        skipAttempts = 0;
        log('[Ad] انتهى الإعلان');
        onAdEnd?.();
      }
    };

    const checkInterval = safeInterval(check, 200);
    
    return () => {
      try { 
        clearInterval(checkInterval); 
        appState.timers.delete(checkInterval);
      } catch (e) {}
    };
  }

  /* ====== محاكاة التفاعل البشري (تمرير الصفحة) ====== */
  function startHumanScroll() {
    const scrollInterval = safeInterval(() => {
      if (Math.random() > 0.65) {
        const distance = Math.random() > 0.5 ? 2 : -2;
        window.scrollBy({ top: distance, behavior: 'smooth' });
      }
    }, 4000);

    return () => {
      try { clearInterval(scrollInterval); appState.timers.delete(scrollInterval); } catch (e) {}
    };
  }

  /* ====== بناء رابط Callback ====== */
  function buildCallbackUrl(userId, videoId, watchedSeconds) {
    const params = new URLSearchParams({
      user_id: userId,
      video_id: videoId,
      watched_seconds: watchedSeconds.toString(),
      secret: SECRET_KEY,
    });
    
    const baseUrl = MainUrl.replace(/\/+$/, '');
    return `${baseUrl}${CALLBACK_PATH}?${params.toString()}`;
  }

  /* ====== التحقق من نجاح رد الـ callback ====== */
  function isCallbackSuccess(response, responseText) {
    if (!response.ok) return false;

    try {
      const json = JSON.parse(responseText);
      return json.status === 'success' || json.success === true || json.ok === true;
    } catch (e) {
      const trimmed = responseText.trim().toLowerCase();
      return trimmed === 'success' || trimmed === 'ok' || trimmed.includes('"status":"success"');
    }
  }

  /* ====== إرسال Callback مع إعادة محاولة ====== */
  async function sendCallback(userId, videoId, watchedSeconds) {
    for (let attempt = 0; attempt <= CALLBACK_MAX_RETRIES && !stopped; attempt++) {
      try {
        const cbUrl = buildCallbackUrl(userId, videoId, watchedSeconds);
        log('[Callback URL]', cbUrl);

        const resp = await fetch(cbUrl, {
          method: 'GET',
          credentials: 'omit',
          headers: { 'Cache-Control': 'no-cache' }
        });

        const text = await resp.text().catch(() => '');
        log(`[Callback Attempt #${attempt}] => status: ${resp.status}`);

        if (isCallbackSuccess(resp, text)) {
          log('[Callback] تم الإرسال بنجاح');
          return true;
        } else {
          log('[Callback] حالة غير ناجحة:', resp.status, text);
        }
      } catch (e) {
        log('[Callback] خطأ أثناء الإرسال:', e.message);
      }

      if (attempt < CALLBACK_MAX_RETRIES) {
        log(`[Callback] إعادة المحاولة رقم ${attempt + 1} بعد ${CALLBACK_RETRY_DELAY_MS}ms`);
        await new Promise(r => setTimeout(r, CALLBACK_RETRY_DELAY_MS));
      }
    }

    log('[Callback] فشل الإرسال بعد كل المحاولات');
    return false;
  }

  /* ====== إدارة التفاعل مع القناة ====== */
  async function interactWithChannel() {
    try {
      setBarMessage('جارٍ التفاعل مع القناة...');
      
      const channelBtn = document.querySelector(
        'ytd-channel-tagline-renderer a, .yt-simple-endpoint[href*="/channel/"], .channel-link'
      );
      
      if (channelBtn) {
        log('ضغط على القناة');
        channelBtn.click();
        await new Promise(r => setTimeout(r, 2000));
      }

      setBarMessage('جارٍ تمرير صفحة القناة...');
      for (let i = 0; i < 3; i++) {
        window.scrollBy(0, Math.random() * 100 + 50);
        await new Promise(r => setTimeout(r, 800));
      }
    } catch (e) {
      log('Channel interaction error:', e);
    }
  }

  /* =========================================================
     managePlaybackAndProgress - إدارة التشغيل والتقدم
  ========================================================= */
  async function managePlaybackAndProgress(ajaxData) {
    stopped = false;
    currentAjaxData = ajaxData || currentAjaxData || null;

    const userId = await readUserId();
    if (!userId) {
      log('No user_id — will retry later');
      setBarMessage('لم يتم العثور على user_id — تأكد من تسجيل الدخول');
      startGetVideo = true;
      safeTimeout(getVideoFlow, 3000);
      return;
    }

    const videoId = ajaxData.video_id || ajaxData.id || ajaxData.videoId || 'unknown';
    const requiredSeconds = parseInt(
      (ajaxData.required_watch_seconds != null ? ajaxData.required_watch_seconds : ajaxData.duration),
      10
    ) || 30;

    injectProgressBar();
    setBarMessage('استمر فى مشاهدة هذا الفديو');
    setBarProgress(0);
    setBarPayNotice('');

    const videoEl = tryPlayVideoElement();

    if (adWatcherInterval) { 
      try { clearInterval(adWatcherInterval); appState.timers.delete(adWatcherInterval); } catch (e) {} 
    }
    if (tickInterval) { 
      try { clearInterval(tickInterval); appState.timers.delete(tickInterval); } catch (e) {} 
    }

    const adStop = startAdWatcher(
      () => setBarMessage('جارى التعامل مع الإعلان...'),
      () => setBarMessage('استمر فى مشاهدة هذا الفديو')
    );

    if (humanScrollStop) try { humanScrollStop(); } catch (e) {}
    humanScrollStop = startHumanScroll();

    let elapsed = 0;
    let callbackSent = false;

    tickInterval = safeInterval(async () => {
      try {
        if (stopped) {
          try { clearInterval(tickInterval); appState.timers.delete(tickInterval); } catch (e) {}
          return;
        }

        const adVisible = !!document.querySelector('.ad-showing, .ytp-ad-player-overlay, .video-ads, .jw-ad');
        let isPlaying = true;
        if (videoEl) {
          try { isPlaying = !videoEl.paused && !videoEl.ended; } catch (e) { isPlaying = false; }
        } else {
          isPlaying = !adVisible;
        }

        if (isPlaying && !adVisible) {
          elapsed += 1;
          setBarProgress(Math.min(100, (elapsed / requiredSeconds) * 100));
          setBarMessage(`استمر فى مشاهدة هذا الفديو (${elapsed}/${requiredSeconds})`);
        } else if (adVisible) {
          setBarMessage('جارى التعامل مع الإعلان...');
        } else {
          setBarMessage('متوقف مؤقتًا');
        }

        if (!callbackSent && elapsed >= requiredSeconds) {
          callbackSent = true;
          setBarMessage('جارٍ إرسال طلب الدفع...');

          try { await markVideoViewed(userId, videoId); } catch (e) { log('markVideoViewed err', e); }

          const ok = await sendCallback(userId, videoId, requiredSeconds);

          if (ok) {
            setBarPayNotice('تمت إضافة المكافأة إلى رصيدك');
            setBarMessage('تمت إضافة المكافأة إلى رصيدك');
          } else {
            setBarPayNotice('فشل في إرسال المكافأة — سيتم إعادة المحاولة لاحقًا');
            setBarMessage('فشل في إرسال المكافأة');
          }

          try { adStop(); } catch (e) {}
          try { if (humanScrollStop) humanScrollStop(); } catch (e) {}
          try { clearInterval(tickInterval); appState.timers.delete(tickInterval); } catch (e) {}

          if (ok) {
            safeTimeout(() => {
              setBarMessage('جارٍ البحث عن فيديو جديد للمشاهدة...');
              setBarProgress(0);
              setBarPayNotice('');
              currentAjaxData = null;
              startGetVideo = true;
              safeTimeout(getVideoFlow, 800);
            }, 1200);
          } else {
            startGetVideo = true;
            safeTimeout(getVideoFlow, 5000);
          }
        }

      } catch (e) {
        log('tickInterval error:', e);
      }
    }, 1000);
  }

  /* =========================================================
     getVideoFlow - جلب الفيديو الجديد
  ========================================================= */
  async function getVideoFlow() {
    if (!startGetVideo || stopped) return;
    startGetVideo = false;

    try {
      setBarMessage('جارٍ جلب فيديو للمشاهدة...');
      const userId = await readUserId();

      if (!userId) {
        log('getVideoFlow: no user_id, retry shortly');
        setBarMessage('لم يتم العثور على user_id — تأكد من تسجيل الدخول');
        startGetVideo = true;
        safeTimeout(getVideoFlow, 3000);
        return;
      }

      let myVideos = [];
      try {
        const myUrl = `${MainUrl.replace(/\/+$/, '')}${MY_VIDEOS_PATH}?user_id=${encodeURIComponent(userId)}`;
        const r = await fetch(myUrl, { cache: 'no-store' });
        if (r.ok) {
          const j = await r.json();
          if (Array.isArray(j)) myVideos = j.map(v => v.id || v.video_id).filter(Boolean);
        }
      } catch (e) { log('myVideos fetch', e); }

      const url = `${MainUrl.replace(/\/$/, '')}${PUBLIC_VIDEOS_PATH}?user_id=${encodeURIComponent(userId)}`;
      const resp = await fetch(url, { cache: 'no-store' });

      if (!resp.ok) {
        setBarMessage('خطأ في جلب الفيديوهات');
        startGetVideo = true;
        safeTimeout(getVideoFlow, 5000);
        return;
      }

      const data = await resp.json();
      if (!Array.isArray(data) || data.length === 0) {
        setBarMessage('لا توجد فيديوهات متاحة');
        startGetVideo = true;
        safeTimeout(getVideoFlow, 6000);
        return;
      }

      let filtered = data.filter(v => String(v.user_id) !== String(userId));
      if (myVideos.length) filtered = filtered.filter(v => !myVideos.includes(v.id || v.video_id));

      const checks = await Promise.all(filtered.map(async (v) => {
        const vid = v.id || v.video_id;
        if (!vid) return false;
        const seen = await hasViewedRecently(userId, vid, NO_REPEAT_HOURS);
        return !seen;
      }));

      const finallyFiltered = filtered.filter((v, i) => checks[i]);
      if (!finallyFiltered.length) {
        setBarMessage('كل الفيديوهات تمت مشاهدتها مؤخراً');
        startGetVideo = true;
        safeTimeout(getVideoFlow, 20 * 60 * 1000);
        return;
      }

      const chosen = finallyFiltered[Math.floor(Math.random() * finallyFiltered.length)];
      const cmd = {
        video_id: chosen.id || chosen.video_id,
        url: chosen.url || chosen.video_url,
        id: chosen.id || chosen.video_id,
        duration: (chosen.duration || 30),
        required_watch_seconds: (chosen.required_watch_seconds || chosen.duration || 30)
      };

      try {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          chrome.storage.local.set({ AjaxData: cmd }, () => {});
        } else {
          localStorage.setItem('AjaxData', JSON.stringify(cmd));
        }
      } catch (e) {}

      try { clearInterval(tickInterval); } catch (_) {}

      if (cmd.url) {
        const wrapped = generateWrappedUrl(cmd.url);
        safeTimeout(() => {
          try { window.location.href = wrapped; }
          catch (e) { log('redirect failed', e); }
        }, REDIRECT_DELAY_MS);
      } else {
        safeTimeout(() => handleApiResponse({ action: 'start', command: cmd }), 400);
      }

    } catch (e) {
      log('getVideoFlow err', e);
      startGetVideo = true;
      safeTimeout(getVideoFlow, 8000);
    }
  }

  /* =========================================================
     handleApiResponse - معالج الاستجابة الرئيسي
  ========================================================= */
  function handleApiResponse(resp) {
    try {
      if (!resp) { 
        startGetVideo = true; 
        safeTimeout(getVideoFlow, 3000); 
        return; 
      }
      const action = (resp.action || '').toLowerCase();
      if (action === 'start' && resp.command) {
        currentAjaxData = resp.command;
        safeTimeout(handleVideoPageIfNeeded, 300);
      } else if (action === 'reload' || action === 'standby') {
        startGetVideo = true;
        safeTimeout(() => {
          if (window.location.pathname.includes('/worker/start')) {
            window.location.href = MainUrl + '/worker/start';
          } else {
            getVideoFlow();
          }
        }, 1200);
      } else {
        startGetVideo = true;
      }
    } catch (e) { 
      log('handleApiResponse err', e); 
      startGetVideo = true; 
    }
  }

  /* =========================================================
   handleVideoPageIfNeeded (معالج صفحة الفيديو - مُحسّن)
========================================================= */
async function handleVideoPageIfNeeded() {
  let ajax = currentAjaxData;
  
  // محاولة جلب البيانات من التخزين إذا لم تكن موجودة
  if (!ajax) {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        ajax = await new Promise(res => {
          chrome.storage.local.get(['AjaxData'], r => {
            res(r?.AjaxData || null);
          });
        });
      } else {
        const stored = localStorage.getItem('AjaxData');
        ajax = stored ? JSON.parse(stored) : null;
      }
    } catch (e) { 
      log('❌ خطأ في قراءة AjaxData:', e);
      ajax = null; 
    }
  }

  if (!ajax || !ajax.url) {
    log("⚠️ لا توجد بيانات فيديو متاحة.");
    return;
  }

  log("✅ تم جلب بيانات الفيديو بنجاح");

  safeTimeout(() => {
    log("▶️ بدء متابعة الفيديو الآن...");
    const normalized = {
      video_id: ajax.video_id || ajax.id || ajax.videoId || 'unknown',
      id: ajax.id || ajax.video_id || 'unknown',
      duration: ajax.duration || ajax.required_watch_seconds || 30,
      required_watch_seconds: ajax.required_watch_seconds || ajax.duration || 30
    };
    managePlaybackAndProgress(normalized);
  }, 2000);
}


/* =========================================================
   stopAllCompletely (إيقاف شامل لكل العمليات)
========================================================= */
function stopAllCompletely() {
  try {
    stopped = true;
    
    // إيقاف جميع المؤقتات
    if (tickInterval) {
      try { clearInterval(tickInterval); timers.delete(tickInterval); } catch (e) {}
      tickInterval = null;
    }
    if (adWatcherInterval) {
      try { clearInterval(adWatcherInterval); timers.delete(adWatcherInterval); } catch (e) {}
      adWatcherInterval = null;
    }
    
    // إيقاف المراقبين
    if (typeof disconnectObservers === 'function') {
      disconnectObservers();
    }
    
    // إيقاف scroll الطبيعي
    if (humanScrollStop) {
      try { humanScrollStop(); } catch (e) {}
      humanScrollStop = null;
    }
    
    // تنظيف التخزين
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.remove(['AjaxData'], () => {});
      } else {
        localStorage.removeItem('AjaxData');
      }
    } catch (e) {}
    
    alreadyStarted = false;
    log('✅ stopAllCompletely: تم إيقاف جميع العمليات والمؤقتات بنجاح.');
  } catch (e) {
    console.error('stopAllCompletely error:', e);
  }
}


/* =========================================================
   معالجات أحداث الصفحة والرؤية
========================================================= */
window.addEventListener('beforeunload', stopAllCompletely, { capture: true });
window.addEventListener('unload', stopAllCompletely);
window.addEventListener('pagehide', stopAllCompletely);

document.addEventListener('visibilitychange', () => {
  const isVideoPage = /\/video\/|\/watch/.test(window.location.pathname);
  if (document.hidden && !isVideoPage) {
    stopAllCompletely();
  }
});

const observer = new MutationObserver(() => {
  try {
    const isVideoPage = /\/video\/|\/watch/.test(window.location.pathname);
    const bar = document.getElementById('trb-overlay');

    if (isVideoPage) {
      if (!bar) {
        log('⚠️ الشريط اختفى أثناء الفيديو — إعادة إدخاله...');
        injectProgressBar();
      }
    } else {
      if (bar) {
        log('ℹ️ المستخدم غادر صفحة الفيديو — إزالة الشريط.');
        bar.remove();
      }
    }
  } catch (e) {
    log('observer mutation error:', e);
  }
});

observer.observe(document.documentElement, { childList: true, subtree: true });
if (appState && appState.observers) {
  appState.observers.add(observer);
}

document.addEventListener('visibilitychange', () => {
  try {
    const isVideoPage = /\/video\/|\/watch/.test(window.location.pathname);
    if (!isVideoPage && document.hidden) {
      const bar = document.getElementById('trb-overlay');
      if (bar) bar.remove();
      stopAllCompletely();
    }
  } catch (e) {
    log('visibilitychange error:', e);
  }
});

/* =========================================================
   startIfWorkerPage (بدء التطبيق عند الدخول للصفحة)
========================================================= */
function startIfWorkerPage() {
  try {
    if (alreadyStarted) return;
    alreadyStarted = true;

    const path = window.location.pathname || '';

    if (path === '/worker/start' || path.endsWith('/worker/start')) {
      log('جارٍ بدء صفحة العامل...');
      setBarMessage('جارٍ جلب فيديو للمشاهدة...');
      safeTimeout(getVideoFlow, 600);
    } else {
      log('جارٍ التحقق من صفحة الفيديو...');
      safeTimeout(() => {
        injectProgressBar();
        handleVideoPageIfNeeded();
      }, 600);
    }
  } catch (e) {
    console.error('startIfWorkerPage error:', e);
    alreadyStarted = false;
    safeTimeout(() => { tryStartIfWorkerPageSafely(); }, 400);
  }
}
/* =========================================================
   tryStartIfWorkerPageSafely (التحقق الآمن من التحميل)
========================================================= */
(() => {
  let alreadyStarted = false; // نقل المتغير داخل IIFE

  function tryStartIfWorkerPageSafely() {
    try {
      const requiredFunctions = [
        'startIfWorkerPage',
        'injectProgressBar',
        'handleVideoPageIfNeeded',
        'setBarMessage'
      ];

      // تحقق من وجود الدوال بالـ window
      const allReady = requiredFunctions.every(fn => typeof window[fn] === 'function');

      // فحص المؤقت الآمن
      const timerReady = typeof window.safeTimeout === 'function' || typeof window.setTimeout === 'function';

      if (!allReady || !timerReady) {
        log('⏳ الانتظار لتحميل جميع الدوال المطلوبة...');
        setTimeout(tryStartIfWorkerPageSafely, 200);
        return;
      }

      // إذا تم التشغيل سابقًا، لا تعيد التشغيل
      if (alreadyStarted) {
        return;
      }

      try {
        startIfWorkerPage();
        alreadyStarted = true;
        log('✅ Start.js loaded — ready.');
      } catch (innerErr) {
        console.error('startIfWorkerPage threw:', innerErr);

        setTimeout(() => {
          try {
            startIfWorkerPage();
            alreadyStarted = true;
            log('✅ Start.js loaded — ready. (retry)');
          } catch (e) {
            console.error('startIfWorkerPage retry failed:', e);
            alreadyStarted = false;
          }
        }, 500);
      }

    } catch (err) {
      console.error('tryStartIfWorkerPageSafely error:', err);
      setTimeout(tryStartIfWorkerPageSafely, 300);
    }
  }


  /* =========================================================
     initWorkerPage (تهيئة صفحة العامل وربطها ببيانات المستخدم)
  ========================================================= */
  async function initWorkerPage() {
    try {
      const API_PROFILE = `${MainUrl.replace(/\/$/, '')}/api/user/profile`;

      log('⏳ Start_fixed.js loaded — بدء التحقق من المستخدم...');
      const userId = await readUserId();

      if (!userId) {
        log('⚠️ لا يوجد user_id — المستخدم لم يسجّل بعد.');
        setBarMessage('⚠️ الرجاء تسجيل الدخول أولاً');
        return;
      }

      log('✅ تم العثور على user_id:', userId);

      try {
        const response = await fetch(`${API_PROFILE}?user_id=${encodeURIComponent(userId)}`, {
          cache: 'no-store'
        });
        
        if (!response.ok) {
          log('⚠️ خطأ في جلب بيانات المستخدم: حالة', response.status);
          return;
        }

        const data = await response.json();
        if (data && data.username) {
          log(`✅ ${data.username} | الرصيد: ${data.balance} | العضوية: ${data.membership}`);
          
          // تحديث بيانات المستخدم في الصفحة
          const u = document.getElementById('username');
          const b = document.getElementById('balance');
          const m = document.getElementById('membership');
          
          if (u) u.textContent = data.username;
          if (b) b.textContent = `${data.balance} نقاط`;
          if (m) m.textContent = data.membership;
          
          setBarMessage('✅ تم تحميل بيانات المستخدم بنجاح');
        } else {
          log('⚠️ لم يتم العثور على بيانات المستخدم في السيرفر.');
        }
      } catch (err) {
        log('❌ خطأ أثناء جلب بيانات المستخدم من السيرفر:', err);
      }
    } catch (e) {
      console.error('initWorkerPage error:', e);
    }
  }


  /* =========================================================
     تشغيل الصفحة عند التحميل
  ========================================================= */
  window.addEventListener('load', () => {
    safeTimeout(initWorkerPage, 500);
  });

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    safeTimeout(tryStartIfWorkerPageSafely, 300);
  } else {
    window.addEventListener('load', () => {
      safeTimeout(tryStartIfWorkerPageSafely, 300);
    }, { once: true });
  }

})();