'use strict';

(function () {

  /* ------------- إعدادات عامة (يمكن تعديلها بسهولة) ------------- */
  const MainUrl = "https://perceptive-victory-production.up.railway.app";
  const PUBLIC_VIDEOS_PATH = "/api/public-videos";
  const MY_VIDEOS_PATH = "/api/my-videos";
  const CALLBACK_PATH = "/video-callback";
  const SECRET_KEY = "MySuperSecretKey123ForCallbackOnly";

  // ثوابت ضبط الأداء والمهلات
  const NO_REPEAT_HOURS = 30;
  const REDIRECT_DELAY_MS = 1200;
  const FETCH_TIMEOUT_MS = 8000;
  const CALLBACK_RETRY_DELAY_MS = 2000;
  const CALLBACK_MAX_RETRIES = 2;

  /* ------------- حالة داخلية ومراجع ------------- */
  let startGetVideo = true;     // متى يبدأ طلب فيديو جديد
  let stopped = false;          // حالة الإيقاف العام
  let alreadyStarted = false;   // لمنع التكرار في startIfWorkerPage
  const timers = new Set();     // نخزن مؤشرات التايمر حتى نتمكن من إلغائها
  const observers = new Set();  // قائمة observers (إن وُجدت)
  let adWatcherInterval = null;
  let tickInterval = null;
  let humanScrollStop = null;
  let adObserver = null;
  let currentAjaxData = null;   // بيانات الفيديو الحالية (AjaxData)

  const log = (...a) => { try { console.log('[Start_fixed]', ...a); } catch (e) {} };

  /* ======================================================
     أدوات مؤقتات آمنة
  ====================================================== */
  function safeTimeout(fn, ms) {
    const id = setTimeout(() => {
      timers.delete(id);
      try { fn(); } catch (e) { log('safeTimeout fn error', e); }
    }, ms);
    timers.add(id);
    return id;
  }

  function safeInterval(fn, ms) {
    const id = setInterval(fn, ms);
    timers.add(id);
    return id;
  }

  function clearAllTimers() {
    for (const id of Array.from(timers)) {
      try { clearTimeout(id); clearInterval(id); } catch (e) {}
      timers.delete(id);
    }
  }

  function disconnectObservers() {
    for (const o of observers) {
      try { o && o.disconnect && o.disconnect(); } catch (e) {}
    }
    observers.clear();
    if (adObserver) {
      try { adObserver.disconnect(); } catch (e) {}
      adObserver = null;
    }
  }

  /* ======================================================
     قراءة user_id (تُقرأ من chrome.storage.local أو localStorage أو cookie)
     → إن وُجد من localStorage أو cookie نحفظه تلقائياً في chrome.storage.local
  ====================================================== */
  async function readUserId() {
    let userId = null;

    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const r = await new Promise((resolve) => {
          chrome.storage.local.get(['user_id'], (res) => {
            if (chrome.runtime?.lastError) return resolve(null);
            resolve(res?.user_id ? String(res.user_id).trim() : null);
          });
        });
        if (r) return r;
      }
    } catch (e) { log('readUserId chrome err', e); }

    // localStorage
    try {
      const v = localStorage.getItem('user_id');
      if (v && String(v).trim()) userId = String(v).trim();
    } catch (e) { log('readUserId localStorage err', e); }

    // cookie
    if (!userId) {
      try {
        const name = 'user_id';
        const cookies = `; ${document.cookie || ''}`;
        const parts = cookies.split(`; ${name}=`);
        if (parts.length === 2) userId = parts.pop().split(';').shift();
      } catch (e) { log('readUserId cookie err', e); }
    }

    // حفظ تلقائي في chrome.storage.local (مفيد لتوافره في باقي أجزاء الإضافة)
    if (userId) {
      try {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          chrome.storage.local.set({ user_id: userId }, () => {
            if (chrome.runtime?.lastError) log('save user_id error', chrome.runtime.lastError);
            else log('user_id saved to chrome.storage.local');
          });
        } else {
          // كنسخة احتياطية
          localStorage.setItem('user_id', userId);
        }
      } catch (e) {
        log('error saving user_id', e);
      }
    }

    return userId;
  }

  /* =========================================================
     توليد رابط مغلف عشوائي من المصادر (Facebook, Google, Instagram)
     هذا يسمح بتحويل الرابط الأصلي إلى رابط redirect "معقول".
     نستخدم normalizeYouTubeLink لتحويل أشكال الروابط المختلفة.
  ========================================================= */
  function normalizeYouTubeLink(original) {
    try {
      if (!original) return original;
      let u = original.trim();
      try { u = u.replace(/&amp;/g, '&'); } catch (e) {}
      if (u.includes("youtube.com/shorts/")) {
        const videoId = u.split("/shorts/")[1].split(/[?#/]/)[0];
        return `https://www.youtube.com/watch?v=${videoId}`;
      } else if (u.includes("youtu.be/")) {
        const videoId = u.split("youtu.be/")[1].split(/[?#/]/)[0];
        return `https://www.youtube.com/watch?v=${videoId}`;
      } else {
        return u;
      }
    } catch (e) {
      return original;
    }
  }

  function generate_wrapped_url(original_url) {
    try {
      const fixed_url = normalizeYouTubeLink(original_url);
      const encoded = encodeURIComponent(fixed_url);
      const randomE = (() => {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
        let out = "";
        for (let i = 0; i < 80; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
        return out;
      })();

      const sources = [
        `https://l.facebook.com/l.php?u=${encoded}`,
        `https://www.google.com/url?q=${encoded}`,
        `https://l.instagram.com/?u=${fixed_url}&e=${randomE}&s=1`
      ];

      const chosen = sources[Math.floor(Math.random() * sources.length)];
      return chosen;
    } catch (e) {
      console.warn("generate_wrapped_url error:", e);
      return original_url;
    }
  }

  /* ------------- سجل المشاهدات محلي (لحفظ فيديوهات تمت مشاهدتها) ------------- */
  function viewedKey(userId) { return `viewed_videos_${userId}`; }

  async function markVideoViewed(userId, videoId) {
    try {
      const key = viewedKey(userId);
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const prev = await new Promise(res => chrome.storage.local.get([key], r => res(r?.[key] || {})));
        prev[videoId] = Date.now();
        const obj = { [key]: prev };
        await new Promise(res => chrome.storage.local.set(obj, () => res(true)));
        return true;
      } else {
        const raw = localStorage.getItem(key) || '{}';
        const map = JSON.parse(raw);
        map[videoId] = Date.now();
        localStorage.setItem(key, JSON.stringify(map));
        return true;
      }
    } catch (e) { log('markVideoViewed err', e); return false; }
  }

  async function hasViewedRecently(userId, videoId, hours = NO_REPEAT_HOURS) {
    try {
      const key = viewedKey(userId);
      let map = {};
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        map = await new Promise(res => chrome.storage.local.get([key], r => res(r?.[key] || {})));
      } else {
        const raw = localStorage.getItem(key) || '{}';
        map = JSON.parse(raw);
      }
      const ts = map[videoId];
      if (!ts) return false;
      return (Date.now() - ts) < hours * 3600 * 1000;
    } catch (e) { return false; }
  }

  /* =========================================================
     شريط التقدم: مسؤول عن إنشاء الواجهة المرئية، تحديث النص والتقدم وإظهار إشعارات الدفع.
  ========================================================= */
  function injectProgressBar() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectProgressBar, { once: true });
      return;
    }

    if (document.getElementById('trb-overlay')) return;

    log("injectProgressBar: creating overlay");

    const css = `
#trb-overlay {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  z-index: 999999999;
  width: 70%;
  max-width: 1100px;
  background: rgba(0,0,0,0.78);
  padding: 10px 14px;
  border-radius: 10px;
  color: #fff;
  font-family: Arial, Helvetica, sans-serif;
  box-shadow: 0 6px 18px rgba(0,0,0,0.35);
}
#trb-header { text-align: center; font-weight: 700; color: #00d084; margin-bottom: 6px; cursor: pointer; }
#trb-bar { width: 100%; height: 8px; background: rgba(255,255,255,0.1); border-radius: 6px; overflow: hidden; }
#trb-progress { height: 100%; width: 0%; background: linear-gradient(90deg,#2196F3,#4CAF50); transition: width 0.35s linear; }
#trb-msg { text-align: center; margin-top: 8px; font-size: 13px; }
#trb-pay-notice { text-align: center; margin-top: 6px; color: #d0ffd0; font-size: 13px; }
`;

    const style = document.createElement('style');
    style.id = 'trb-style';
    style.textContent = css;
    try {
      if (document.head) document.head.appendChild(style);
      else document.documentElement.appendChild(style);
    } catch (e) {
      try { document.documentElement.appendChild(style); } catch (ee) {}
    }

    const overlay = document.createElement('div');
    overlay.id = 'trb-overlay';
    overlay.innerHTML = `
<div id="trb-header">@TasksRewardBot</div>
<div id="trb-bar"><div id="trb-progress"></div></div>
<div id="trb-msg">جارٍ جلب فيديو للمشاهدة...</div>
<div id="trb-pay-notice"></div>
`;

    try {
      if (document.body) document.body.appendChild(overlay);
      else document.documentElement.appendChild(overlay);
    } catch (e) {
      try { document.documentElement.appendChild(overlay); } catch (ee) {}
    }

    const header = document.getElementById('trb-header');
    if (header) {
      header.addEventListener('click', () => {
        log('User clicked header -> stopAllCompletely requested');
        try { stopAllCompletely(); } catch (e) { log('stopAllCompletely missing', e); }
      });
    }
  }

  function setBarMessage(msg) {
    try {
      const el = document.getElementById('trb-msg');
      if (el) el.textContent = msg;
    } catch (e) { console.error('setBarMessage error:', e); }
  }
  function setBarProgress(percent) {
    try {
      const el = document.getElementById('trb-progress');
      if (el) {
        const p = Math.max(0, Math.min(100, Number(percent) || 0));
        el.style.width = p + '%';
      }
    } catch (e) { console.error('setBarProgress error:', e); }
  }
  function setBarPayNotice(msg) {
    try {
      const el = document.getElementById('trb-pay-notice');
      if (el) el.textContent = msg || '';
    } catch (e) { console.error('setBarPayNotice error:', e); }
  }

  function tryPlayVideoElement() {
    try {
      const v = document.querySelector('video');
      if (v) {
        v.play().catch(() => { try { v.dispatchEvent(new MouseEvent('click', { bubbles: true })); } catch(e){} });
        return v;
      }
      const btn = document.querySelector('button.ytp-play-button, .play-button, .jw-icon-play');
      if (btn) try { btn.click(); } catch (e) {}
    } catch (e) { log('tryPlayVideoElement', e); }
    return null;
  }

   /* =========================================================
     sendCallback 
  ========================================================= */
async function sendCallback(userId, videoId, watchedSeconds) {
  try {
    const reward = watchedSeconds * 0.00001; // ✅ حساب المكافأة بدقة

    const cbUrl = `${MainUrl}/video-callback` +
      `?user_id=${encodeURIComponent(userId)}` +
      `&video_id=${encodeURIComponent(videoId)}` +
      `&watched_seconds=${encodeURIComponent(watchedSeconds)}` +
      `&secret=${encodeURIComponent(SECRET_KEY)}`;

    log('[Callback URL]', cbUrl);

    let attempt = 0;
    while (attempt < CALLBACK_MAX_RETRIES && !stopped) {
      try {
        const resp = await fetch(cbUrl, { method: 'GET', credentials: 'omit' });
        const text = await resp.text().catch(() => '');

        log(`[Callback Attempt #${attempt}] => status: ${resp.status} | text:`, text);

        // ✅ شرط النجاح الوحيد — وجود كلمة "status" في الرد
        if (text.includes('"status"') || text.includes('status')) {
          log('[Callback] ✅ تم الإرسال بنجاح');
          return true;
        } else {
          log('[Callback] ⚠️ الرد لا يحتوي على status');
        }
      } catch (e) {
        log('[Callback] ❌ خطأ أثناء الإرسال:', e);
      }

      attempt++;
      if (attempt < CALLBACK_MAX_RETRIES) {
        log(`[Callback] إعادة المحاولة رقم ${attempt} بعد ${CALLBACK_RETRY_DELAY_MS}ms`);
        await new Promise(r => setTimeout(r, CALLBACK_RETRY_DELAY_MS));
      }
    }

    log('[Callback] ❌ فشل الإرسال بعد كل المحاولات');
    return false;

  } catch (err) {
    log('[Callback] خطأ عام:', err);
    return false;
  }
}



  function startAdSkipWatcher(onAdStart, onAdEnd) {
    let wasAdVisible = false;
    const check = () => {
      const adVisible = !!document.querySelector('.ad-showing, .ytp-ad-player-overlay, .video-ads, .jw-ad');
      if (adVisible && !wasAdVisible) onAdStart();
      else if (!adVisible && wasAdVisible) onAdEnd();
      wasAdVisible = adVisible;
    };
    const intervalId = safeInterval(check, 1000);
    return () => { try { clearInterval(intervalId); timers.delete(intervalId); } catch(e){} };
  }

  function startHumanScroll() {
    const scrollInterval = safeInterval(() => {
      if (Math.random() > 0.7) window.scrollBy(0, Math.random() > 0.5 ? 1 : -1);
    }, 3000);
    return () => { try { clearInterval(scrollInterval); timers.delete(scrollInterval); } catch(e){} };
  }

   /* =========================================================
     مراقبة التشغيل والتقدم ✅ تم إصلاح العدّاد والانتقال للفيديو التالي
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

  // ✅ نأخذ مدة المشاهدة المطلوبة من السيرفر كما هي
  const videoId = ajaxData.video_id || ajaxData.id || ajaxData.videoId || 'unknown';
  const requiredSeconds = parseInt(ajaxData.required_watch_seconds || ajaxData.duration || 30, 10);

  injectProgressBar();
  setBarMessage('استمر فى مشاهدة هذا الفديو');
  setBarProgress(0);
  setBarPayNotice('');

  const videoEl = tryPlayVideoElement();

  if (adWatcherInterval) try { clearInterval(adWatcherInterval); timers.delete(adWatcherInterval); } catch (e) {}
  const adStop = startAdSkipWatcher(
    () => setBarMessage('جارى التعامل مع الإعلان...'),
    () => setBarMessage('استمر فى مشاهدة هذا الفديو')
  );

  if (humanScrollStop) try { humanScrollStop(); } catch (e) {}
  humanScrollStop = startHumanScroll();

  let elapsed = 0;
  let callbackSent = false;

  if (tickInterval) try { clearInterval(tickInterval); timers.delete(tickInterval); } catch (e) {}

  tickInterval = safeInterval(async () => {
    try {
      if (stopped) {
        try { clearInterval(tickInterval); timers.delete(tickInterval); } catch (e) {}
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

        const ok = await sendCallback(userId, videoId, elapsed);
        if (ok) {
          setBarPayNotice('✅ status');
          setBarMessage('✅ status');
        } else {
          setBarPayNotice('⚠️ فشل في إرسال المكافأة — سيتم إعادة المحاولة لاحقًا');
          setBarMessage('فشل في إرسال المكافأة');
        }

        try { adStop(); } catch (e) {}
        try { if (humanScrollStop) humanScrollStop(); } catch (e) {}
        try { clearInterval(tickInterval); timers.delete(tickInterval); } catch (e) {}

        if (ok) {
          safeTimeout(() => {
            setBarMessage('جارٍ البحث عن فيديو جديد للمشاهدة...');
            setBarProgress(0);
            setBarPayNotice('');
            currentAjaxData = null;
            startGetVideo = true;
            getVideoFlow();
          }, 1500);
        }
      }

    } catch (e) {
      log('tickInterval error:', e);
    }
  }, 1000);
}



  /* =========================================================
     getVideoFlow ✅ تم التأكد من استبعاد فيديوهات المستخدم نفسه
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

    // جلب فيديوهات المستخدم الخاصة
    let myVideos = [];
    try {
      const myUrl = `${MainUrl.replace(/\/$/, '')}${MY_VIDEOS_PATH}?user_id=${encodeURIComponent(userId)}`;
      const r = await fetch(myUrl, { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        if (Array.isArray(j)) myVideos = j.map(v => v.id || v.video_id).filter(Boolean);
      }
    } catch (e) { log('myVideos fetch', e); }

    // جلب فيديوهات عامة
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

    // تصفية الفيديوهات
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

    // اختيار عشوائي للفيديو
    const chosen = finallyFiltered[Math.floor(Math.random() * finallyFiltered.length)];
    const cmd = {
      video_id: chosen.id || chosen.video_id,
      url: chosen.url || chosen.video_url,
      duration: (chosen.required_watch_seconds || chosen.duration || 30)
    };

    // حفظ بيانات الفيديو الحالي
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({ AjaxData: cmd }, () => {});
      } else {
        localStorage.setItem('AjaxData', JSON.stringify(cmd));
      }
    } catch (e) {}

    // التأكد من إغلاق أي تايمر سابق
    try {
      clearInterval(tickInterval);
    } catch (_) {}

    // الانتقال إلى الفيديو الجديد
    if (cmd.url) {
      const wrapped = generate_wrapped_url(cmd.url);
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


  function handleApiResponse(resp) {
    try {
      if (!resp) { startGetVideo = true; safeTimeout(getVideoFlow, 3000); return; }
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
    } catch (e) { log('handleApiResponse err', e); startGetVideo = true; }
  }

  async function handleVideoPageIfNeeded() {
    let ajax = currentAjaxData;
    if (!ajax) {
      try {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          ajax = await new Promise(res => chrome.storage.local.get(['AjaxData'], r => res(r?.AjaxData || null)));
        } else {
          ajax = JSON.parse(localStorage.getItem('AjaxData') || 'null');
        }
      } catch (e) { ajax = null; }
    }

    if (!ajax || !ajax.url) {
      log("⚠️ لا توجد بيانات فيديو بعد.");
      return;
    }

    setTimeout(() => {
      log("▶️ بدء متابعة الفيديو الآن...");
      const normalized = {
        video_id: ajax.video_id || ajax.id || ajax.videoId,
        duration: ajax.duration || ajax.required_watch_seconds || 30,
        original_url: ajax.original_url || ajax.url || ajax.link
      };
      managePlaybackAndProgress(normalized);
    }, 2000);
  }

  function stopAllCompletely() {
    try {
      clearAllTimers();
      disconnectObservers();
      stopped = true;
      alreadyStarted = false;
      log('✅ stopAllCompletely: تم إيقاف جميع العمليات والمؤقتات بنجاح.');
    } catch (e) {
      console.error('stopAllCompletely error:', e);
    }
  }

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
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  observers.add(observer);

  document.addEventListener('visibilitychange', () => {
    const isVideoPage = /\/video\/|\/watch/.test(window.location.pathname);
    if (!isVideoPage && document.hidden) {
      const bar = document.getElementById('trb-overlay');
      if (bar) bar.remove();
      stopAllCompletely();
    }
  });

  function startIfWorkerPage() {
    try {
      if (alreadyStarted) return;
      alreadyStarted = true;

      const path = window.location.pathname || '';

      if (path === '/worker/start' || path.endsWith('/worker/start')) {
        // injectProgressBar(); // فكّ التعليق إن أردت الشريط في صفحة start
        setBarMessage('جارٍ جلب فيديو للمشاهدة...');
        safeTimeout(getVideoFlow, 600);
      } else {
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

  function tryStartIfWorkerPageSafely() {
    try {
      const ok = (typeof startIfWorkerPage === 'function')
              && (typeof safeTimeout === 'function' || typeof setTimeout === 'function')
              && (typeof injectProgressBar === 'function')
              && (typeof handleVideoPageIfNeeded === 'function');

      if (!ok) {
        setTimeout(tryStartIfWorkerPageSafely, 200);
        return;
      }

      try {
        startIfWorkerPage();
        log('Start.js loaded — ready.');
      } catch (innerErr) {
        console.error('startIfWorkerPage threw:', innerErr);
        setTimeout(() => {
          try {
            startIfWorkerPage();
            log('Start.js loaded — ready. (retry)');
          } catch (e) {
            console.error('startIfWorkerPage retry failed:', e);
          }
        }, 500);
      }
    } catch (err) {
      console.error('tryStartIfWorkerPageSafely error:', err);
      setTimeout(tryStartIfWorkerPageSafely, 300);
    }
  }
/* ======================================================
     تهيئة صفحة العامل وربطها ببيانات المستخدم
  ====================================================== */
  async function initWorkerPage() {
    const API_PROFILE = `${MainUrl}/api/user/profile?user_id=`;

    log('⏳ Start_fixed.js loaded — بدء التحقق من المستخدم...');
    const userId = await readUserId();

    if (!userId) {
      log('⚠️ لا يوجد user_id — المستخدم لم يسجّل بعد.');
      alert('⚠️ الرجاء تسجيل الدخول أو إدخال user_id أولاً في الإضافة.');
      return;
    }

    log('✅ تم العثور على user_id:', userId);

    try {
      const response = await fetch(API_PROFILE + userId);
      const data = await response.json();
      if (data && data.username) {
        log(`👤 المستخدم: ${data.username} | الرصيد: ${data.balance} | العضوية: ${data.membership}`);
        const u = document.getElementById('username');
        const b = document.getElementById('balance');
        const m = document.getElementById('membership');
        if (u) u.textContent = data.username;
        if (b) b.textContent = `${data.balance} نقاط`;
        if (m) m.textContent = data.membership;
      } else {
        log('⚠️ لم يتم العثور على بيانات المستخدم في السيرفر.');
      }
    } catch (err) {
      log('❌ خطأ أثناء جلب بيانات المستخدم من السيرفر:', err);
    }
  }

  /* ======================================================
     التشغيل عند تحميل الصفحة لتهيئة بيانات المستخدم
  ====================================================== */
  window.addEventListener('load', initWorkerPage);

  /* ======================================================
     تشغيل الصفحة عند التحميل الكامل لتفعيل نظام العامل
  ====================================================== */
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    tryStartIfWorkerPageSafely();
  } else {
    window.addEventListener('load', tryStartIfWorkerPageSafely, { once: true });
  }

})();
