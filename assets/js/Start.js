'use strict';

(function () {
  /* ------------- إعدادات عامة (قابلة للتعديل) ------------- */
  const MainUrl = "https://perceptive-victory-production.up.railway.app";
  const PUBLIC_VIDEOS_PATH = "/api/public-videos";
  const MY_VIDEOS_PATH = "/api/my-videos";
  const CALLBACK_PATH = "/video-callback";
  const SECRET_KEY = "MySuperSecretKey123ForCallbackOnly";

  // ثوابت ضبط الأداء والمهل
  const NO_REPEAT_HOURS = 30; // ساعات منع تكرار المشاهدة
  const REDIRECT_DELAY_MS = 1200; // تأخير إعادة التوجيه
  const FETCH_TIMEOUT_MS = 8000; // مهلة طلبات الشبكة
  const CALLBACK_RETRY_DELAY_MS = 2000; // تأخير إعادة محاولة الدفع
  const CALLBACK_MAX_RETRIES = 2; // الحد الأقصى لمحاولات الدفع

  /* ------------- حالة داخلية ومراجع ------------- */
  let startGetVideo = false; // متى يبدأ طلب فيديو جديد
  let stopped = false; // حالة الإيقاف العام
  let alreadyStarted = false; // لمنع التكرار في startIfWorkerPage
  const timers = new Set(); // تخزين مؤشرات التايمر
  const observers = new Set(); // تخزين المراقبين
  let adWatcherInterval = null; // مراقب الإعلانات
  let tickInterval = null; // مؤقت متابعة الفيديو
  let humanScrollStop = null; // إيقاف التحريك البشري
  let adObserver = null; // مراقب الإعلانات
  let currentAjaxData = null; // بيانات الفيديو الحالي
  let __trb_scrollInterval = null;   // سيخزن معرف الـ interval داخل startHumanScroll
  let __trb_scrollStopFn = null;     // دالة الإيقاف التي تُعاد من startHumanScroll
  window.__trbStopped = false;       // علامة عامة: true عندما نريد ايقاف كل شيء فوراً
  window.__trbMutationObservers = window.__trbMutationObservers || [];
/* ---------------------------------------------------------------------------
   🔗 TasksRewardBot External Modules Bridge
   هذا المقطع يسمح لملف Start.js بالتكامل مع الملفات:
   Settings.js – auth.js – Main.js – Human.js
   دون كسر أي من المنطق الحالي للإضافة.
--------------------------------------------------------------------------- */
async function tryUseExternalModulesAndStart() {
  try {
    log('[Start] Checking for external modules...');

    // 1️⃣ Settings
    let settings = null;
    if (typeof loadSettings === 'function') {
      try { settings = loadSettings(); log('[Start] External Settings loaded'); }
      catch (e) { log('[Start] loadSettings() error:', e); }
    } else {
      log('[Start] No external Settings.js found');
      settings = {};
    }

    // 2️⃣ Auth
    let userId = null;
    if (typeof initAuth === 'function') {
      try { userId = initAuth(); log('[Start] External Auth initialized'); }
      catch (e) { log('[Start] initAuth() error:', e); }
    } else {
      try {
        userId = localStorage.getItem('user_id') || null;
        if (!userId) {
          userId = 'user_' + Math.random().toString(36).substring(2, 12);
          localStorage.setItem('user_id', userId);
        }
        log('[Start] Using localStorage user_id:', userId);
      } catch (e) { log('[Start] fallback user_id error:', e); }
    }

    // 3️⃣ Main
    if (typeof initMain === 'function') {
      try { initMain(userId, settings); log('[Start] External Main initialized'); }
      catch (e) { log('[Start] initMain() error:', e); }
    } else {
      log('[Start] No external Main.js found');
    }

    // 4️⃣ Human
    let stopHumanFn = null;
    if (typeof startHumanActions === 'function') {
      try { stopHumanFn = startHumanActions(); log('[Start] External Human actions started'); }
      catch (e) { log('[Start] startHumanActions() error:', e); }
    } else {
      log('[Start] No external Human.js found');
    }

    if (typeof stopHumanFn === 'function') window.stopHumanBehavior = stopHumanFn;
    log('[Start] ✅ External modules bridge complete');

  } catch (err) {
    log('[Start] ❌ Error initializing external modules:', err);
  }
}

  /* ------------- دالة التسجيل ------------- */
  function log(...args) {
    console.log('[Worker]', ...args);
  }

  /* ------------- أدوات مؤقتات آمنة ------------- */
  function safeTimeout(fn, ms) {
    if (typeof fn !== 'function') {
      log('safeTimeout: Invalid function');
      return;
    }
    const id = setTimeout(() => {
      timers.delete(id);
      try {
        fn();
      } catch (e) {
        log('safeTimeout error:', e);
      }
    }, ms);
    timers.add(id);
    return id;
  }

  function safeInterval(fn, ms) {
    if (typeof fn !== 'function') {
      log('safeInterval: Invalid function');
      return;
    }
    const id = setInterval(() => {
      try {
        fn();
      } catch (e) {
        log('safeInterval error:', e);
      }
    }, ms);
    timers.add(id);
    return id;
  }

  function clearAllTimers() {
  for (const id of Array.from(timers)) {
    try {
      clearTimeout(id);
      clearInterval(id);
      log(`Timer ${id} cleared`);
    } catch (e) {
      log(`Error clearing timer ${id}:`, e);
    }
    timers.delete(id);
  }
}
 /* ============================================================
     🧍‍♂️ السلوك البشري والتحكم في العمل
  ============================================================ */

 // ✅ تمييز وضع التشغيل: هل نحن في تبويب العامل أم في صفحة محتوى (مثل youtube)
const IS_WORKER_PAGE = window.location.href.includes("/worker/start");
console.log(`[TRB] Start.js loaded — IS_WORKER_PAGE=${IS_WORKER_PAGE}`);

if (IS_WORKER_PAGE) {
  log("[TRB] Active in worker/start tab (full worker mode)");
} else {
  // لا نُنهي التنفيذ هنا — نحتاج أن يبقى الملف مسجلاً ليستقبل أوامر من الخلفية
  log("[TRB] Running in content mode (will respond to messages like StartWorker / StartGetData)");
  // ملاحظة: لا نشغّل سلوك "جلب الفيديو" أو "startIfWorkerPage" هنا فوراً،
  // لكن نسمح بتسجيل المستمعين وبدلاً من ذلك يتم تفعيل الشريط عند استقبال الرسائل.
}


  /* ------------- قراءة user_id ------------- */
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
    } catch (e) {
      log('readUserId chrome err', e);
    }

    try {
      const v = localStorage.getItem('user_id');
      if (v && String(v).trim()) userId = String(v).trim();
    } catch (e) {
      log('readUserId localStorage err', e);
    }

    if (!userId) {
      try {
        const name = 'user_id';
        const cookies = `; ${document.cookie || ''}`;
        const parts = cookies.split(`; ${name}=`);
        if (parts.length === 2) userId = parts.pop().split(';').shift();
      } catch (e) {
        log('readUserId cookie err', e);
      }
    }

    if (userId) {
      try {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          chrome.storage.local.set({ user_id: userId }, () => {
            if (chrome.runtime?.lastError) log('save user_id error', chrome.runtime.lastError);
            else log('user_id saved to chrome.storage.local');
          });
        } else {
          localStorage.setItem('user_id', userId);
        }
      } catch (e) {
        log('error saving user_id', e);
      }
    }

    return userId;
  }

  /* ------------- توليد روابط مغلفة ------------- */
 function normalizeYouTubeLink(original) {
  try {
    if (!original || typeof original !== 'string') return original;

    // تنظيف المسافات والـ HTML entities
    let url = original.trim().replace(/&amp;/g, '&');

    // تحويل Shorts
    if (url.includes('youtube.com/shorts/')) {
      const videoId = url.split('/shorts/')[1]?.split(/[?#/]/)[0];
      if (videoId) return `https://www.youtube.com/watch?v=${videoId}`;
    }
    // تحويل youtu.be
    else if (url.includes('youtu.be/')) {
      const videoId = url.split('youtu.be/')[1]?.split(/[?#/]/)[0];
      if (videoId) return `https://www.youtube.com/watch?v=${videoId}`;
    }

    // إذا كان الرابط بالفعل watch?v=، نعيده كما هو (بعد التنظيف)
    return url;
  } catch (e) {
    console.warn('normalizeYouTubeLink error:', e);
    return original;
  }
}

function generate_wrapped_url(original_url) {
  try {
    if (!original_url || typeof original_url !== 'string') return null;

    const fixed_url = normalizeYouTubeLink(original_url);
    const encoded = encodeURIComponent(fixed_url);
    const randTag = Array.from({ length: 80 }, () =>
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".charAt(
        Math.floor(Math.random() * 64)
      )
    ).join('');

    const sources = [
      { url: `https://l.facebook.com/l.php?u=${encoded}&r=${randTag}`, weight: 63 },
      { url: `https://www.google.com/url?q=${encoded}&sa=D&ust=${Date.now()}`, weight: 37 }
    ];

    const totalWeight = sources.reduce((sum, s) => sum + s.weight, 0);
    let random = Math.random() * totalWeight;
    for (const s of sources) {
      if (random < s.weight) return s.url;
      random -= s.weight;
    }

    return sources[0].url; // fallback إلى أول مصدر مغلف (ليس الرابط الأصلي!)
  } catch (e) {
    console.warn("generate_wrapped_url error — no fallback to original URL", e);
    return null; // ❌ لا نعيد original_url أبدًا
  }
}

  /* ------------- سجل المشاهدات ------------- */
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
      } else {
        const raw = localStorage.getItem(key) || '{}';
        try {
          map = JSON.parse(raw);
          if (typeof map !== 'object' || map === null) map = {};
        } catch (e) {
          log('Invalid JSON in localStorage, resetting:', e);
          map = {};
        }
      }
      const now = Date.now();
      map[videoId] = now;
      for (const vid in map) {
        if (now - map[vid] > NO_REPEAT_HOURS * 3600 * 1000) {
          delete map[vid];
        }
      }
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        await new Promise(res => chrome.storage.local.set({ [key]: map }, res));
      } else {
        localStorage.setItem(key, JSON.stringify(map));
      }
      log(`Marked video ${videoId} as viewed for user ${userId}`);
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
        try {
          map = JSON.parse(raw);
          if (typeof map !== 'object' || map === null) map = {};
        } catch (e) {
          log('Invalid JSON in localStorage, resetting:', e);
          map = {};
        }
      }
      const ts = map[videoId];
      if (!ts) return false;
      return (Date.now() - ts) < hours * 3600 * 1000;
    } catch (e) {
      log('hasViewedRecently error:', e);
      return false;
    }
  }

  /* ------------- شاشة التحميل ------------- */
  function showLoadingScreen(message) {
    if (!document.body) {
      setTimeout(() => showLoadingScreen(message), 100);
      return;
    }
    let loadingDiv = document.getElementById('trb-loading');
    if (!loadingDiv) {
      loadingDiv = document.createElement('div');
      loadingDiv.id = 'trb-loading';
      loadingDiv.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: white; z-index: 9999; display: flex;
        flex-direction: column; justify-content: center; align-items: center;
      `;
      const spinner = document.createElement('div');
      spinner.style.cssText = `
        border: 4px solid #f3f3f3; border-top: 4px solid #3498db;
        border-radius: 50%; width: 40px; height: 40px;
        animation: spin 1s linear infinite;
      `;
      const style = document.createElement('style');
      style.textContent = `
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      `;
      const text = document.createElement('p');
      text.id = 'trb-loading-text';
      text.style.cssText = 'margin-top: 20px; font-size: 18px; color: #333;';
      loadingDiv.appendChild(spinner);
      loadingDiv.appendChild(text);
      document.head.appendChild(style);
      document.body.appendChild(loadingDiv);
    }
    document.getElementById('trb-loading-text').textContent = message;
  }

  function hideLoadingScreen() {
    const loadingDiv = document.getElementById('trb-loading');
    if (loadingDiv) {
      loadingDiv.remove();
      log('Loading screen removed');
    }
  }

 /* =========================================================
     📡 استقبال أوامر الخلفية
  ========================================================= */
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      try {
        // 🛑 أمر الإيقاف الشامل
        if (msg === 'TRB_STOP_ALL' || (msg && msg.cmd === 'TRB_STOP_ALL')) {
          console.log('[TRB] تم استقبال أمر إيقاف شامل من الخلفية');
          try { window.__trbStopped = true; } catch {}
          try { removeProgressBar(); } catch {}
          try {
            if (typeof stopAllCompletely === 'function') stopAllCompletely();
          } catch (e) {
            console.warn('stopAllCompletely error:', e);
          }
          try { sendResponse && sendResponse({ ok: true }); } catch {}
          return true;
        }

        // 🎬 بدء العامل أو جلب البيانات
        if (msg === 'StartWorker' || msg === 'StartGetData' || (msg && msg.cmd === 'StartWorker')) {
          console.log('[TRB] 🟢 أمر بدء التشغيل — تفعيل الشريط');
          try { injectProgressBar(); } catch (e) { console.warn('injectProgressBar error:', e); }
        }

      } catch (e) {
        console.warn('[TRB] onMessage handler error:', e);
      }
    });
  }

  // =========================================================
  // 🧩 تحميل الوحدات وبدء التشغيل
  // =========================================================
  tryUseExternalModulesAndStart();

  // =========================================================
  // 🟢 تفعيل شريط التقدم مباشرة عند بدء التشغيل
  // =========================================================
  try {
    injectProgressBar();
    console.log('[TRB] 🎬 Progress bar injected on start');
  } catch (e) {
    console.warn('[TRB] injectProgressBar failed:', e);
  }
// =========================================================
// 🧩 شريط التقدم (Progress Bar) — نسخة مستقرة نهائية
// =========================================================
function injectProgressBar() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectProgressBar, { once: true });
    return;
  }

  // ✅ لا نعيد الحقن إذا الشريط موجود فعلاً
  if (window.__trbProgressBarInjected && document.getElementById('trb-overlay')) {
    console.log('[TRB] ✅ الشريط موجود — لا حاجة لإعادة الحقن');
    return;
  }

  window.__trbProgressBarInjected = true;

  const target =
    document.querySelector('ytd-watch-flexy') ||
    document.querySelector('ytd-page-manager') ||
    document.body ||
    document.documentElement;

  if (!target) {
    console.warn('[TRB] ❌ لم يتم العثور على عنصر صالح للحقن، إعادة المحاولة بعد 1 ثانية...');
    setTimeout(() => injectProgressBar(), 1000);
    return;
  }

  console.log('[TRB] 🎬 injecting progress bar into', target.tagName);

  // ✅ CSS مرة واحدة فقط
  if (!document.getElementById('trb-style')) {
    const style = document.createElement('style');
    style.id = 'trb-style';
    style.textContent = `
#trb-overlay {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  z-index: 2147483647;
  width: 70%;
  max-width: 1100px;
  background: rgba(0,0,0,0.78);
  padding: 10px 14px;
  border-radius: 10px;
  color: #fff;
  font-family: Arial, Helvetica, sans-serif;
  box-shadow: 0 6px 18px rgba(0,0,0,0.35);
  user-select: none;
}
#trb-header { text-align: center; font-weight: 700; color: #00d084; margin-bottom: 6px; cursor: default; }
#trb-bar { width: 100%; height: 8px; background: rgba(255,255,255,0.1); border-radius: 6px; overflow: hidden; }
#trb-progress { height: 100%; width: 0%; background: linear-gradient(90deg,#2196F3,#4CAF50); transition: width 0.35s linear; }
#trb-msg { text-align: center; margin-top: 8px; font-size: 13px; }
#trb-pay-notice { text-align: center; margin-top: 6px; color: #d0ffd0; font-size: 13px; }
`;
    (document.head || document.documentElement).appendChild(style);
  }

  // ✅ إنشاء الواجهة إن لم تكن موجودة
  if (!document.getElementById('trb-overlay')) {
    const overlay = document.createElement('div');
    overlay.id = 'trb-overlay';
    overlay.innerHTML = `
      <div id="trb-header">@TasksRewardBot</div>
      <div id="trb-bar"><div id="trb-progress"></div></div>
      <div id="trb-msg">استمر في مشاهدة هذا الفيديو...</div>
      <div id="trb-pay-notice"></div>
    `;
    try {
      (document.body || document.documentElement).appendChild(overlay);
      console.log('[TRB] ✅ الشريط أُضيف بنجاح');
    } catch (e) {
      console.warn('[TRB] ❌ فشل إلحاق الشريط بالـbody:', e);
      try { document.documentElement.appendChild(overlay); } catch (_) {}
    }
  } else {
    console.log('[TRB] ✅ الشريط موجود بالفعل.');
  }

  // ✅ منع التكرار في مراقبة الـDOM
  if (window.__trbObserverActive) {
    console.log('[TRB] 🧠 المراقب موجود مسبقًا — لن نعيد تشغيله');
    return;
  }
  window.__trbObserverActive = true;

  // 🔒 مراقبة إزالة الشريط فقط (وليس تغييرات الفيديوهات)
  const guard = new MutationObserver(() => {
    const stillThere = document.getElementById('trb-overlay');
    if (!stillThere) {
      console.warn('[TRB] ⚠️ الشريط اختفى — سيتم إدخاله مجددًا بعد لحظات...');
      window.__trbObserverActive = false;
      window.__trbProgressBarInjected = false;
      setTimeout(() => injectProgressBar(), 1500);
      guard.disconnect();
    }
  });

  guard.observe(document.body || document.documentElement, {
    childList: true,
    subtree: false, // 🚫 لا نتابع كل subtree لتقليل الاستهلاك
  });

  console.log('[TRB] ✅ progress bar ready and monitored (stable)');
}


  // =========================================================
  // 🎛️ دوال التحكم بالشريط
  // =========================================================
  function setBarMessage(msg) {
    try {
      const el = document.getElementById('trb-msg');
      if (el) el.textContent = msg;
    } catch (e) {
      console.error('setBarMessage error:', e);
    }
  }

  function setBarProgress(percent) {
    try {
      const el = document.getElementById('trb-progress');
      if (el) {
        const p = Math.max(0, Math.min(100, Number(percent) || 0));
        el.style.width = p + '%';
      }
    } catch (e) {
      console.error('setBarProgress error:', e);
    }
  }

  function setBarPayNotice(msg) {
    try {
      const el = document.getElementById('trb-pay-notice');
      if (el) el.textContent = msg || '';
    } catch (e) {
      console.error('setBarPayNotice error:', e);
    }
  }

  function removeProgressBar() {
    const overlay = document.getElementById('trb-overlay');
    const style = document.getElementById('trb-style');
    if (overlay) overlay.remove();
    if (style) style.remove();
    console.log('[TRB] Progress bar removed');
  }
// =========================================================
// ▶️ التشغيل التلقائي للفيديو بعد الإعلان أو بعد التحميل
// =========================================================
async function ensurePlay() {
  try {
    const video = document.querySelector('video');
    if (!video) return;

    if (video.paused || video.readyState < 2) {
      console.log('[TRB] ▶️ محاولة تشغيل الفيديو تلقائيًا...');
      await video.play().catch(() => {
        const evt = new MouseEvent('click', { bubbles: true, cancelable: true });
        video.dispatchEvent(evt);
      });
    }
  } catch (err) {
    console.warn('[TRB] ⚠️ خطأ أثناء محاولة التشغيل:', err);
  }
}

// شغّل الفيديو عند انتهاء الإعلان أو عند عودة الصفحة من السكون
window.addEventListener('message', (e) => {
  if (e?.data?.type === 'ad_long_timeout') {
    console.log('[TRB] 🧩 تلقى إشارة إعادة التشغيل بعد إعلان طويل.');
    ensurePlay();
  }
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) ensurePlay();
});

  /* ------------- تشغيل الفيديو وتخطي الإعلانات ------------- */
  function tryPlayVideoElement() {
    if (!document.body) {
      log('tryPlayVideoElement: DOM not ready');
      return null;
    }
    try {
      const video = document.querySelector('video');
      if (video) {
        video.play().catch(() => {
          try {
            document.querySelector('button.ytp-play-button, .play-button, .jw-icon-play')?.click();
          } catch (e) {
            log('Error clicking play button:', e);
          }
        });
        log('Video playback started');
        return video;
      }
      const playBtn = document.querySelector('button.ytp-play-button, .play-button, .jw-icon-play');
      if (playBtn) {
        playBtn.click();
        log('Clicked play button');
      }
    } catch (e) {
      log('tryPlayVideoElement error:', e);
    }
    return null;
  }
/* =========================================================
   ✅ startAdWatcher (Final Clean & Safe Version)
   ========================================================= */
function startAdWatcher(onAdStart, onAdEnd) {
  let wasAdVisible = false;
  let skipAttempts = 0;
  let hardForceTimeout = null;
  let domObserver = null;
  let intervalId = null;

  // الكلمات المفتاحية لأزرار "تخطي" بجميع اللغات الشائعة
  const SKIP_KEYWORDS = [
    'Skip', 'SKIP', 'Skip Ad', 'Skip Ads', 'Skip ▶', 'Skip ads',
    'تخطي', 'التخطّي', 'تَخَطِّي', 'تخطي الإعلان', '▶️ التخطّي',
    'Passer', 'Passer l’annonce', 'Ignorer', // French
    'Saltar', 'Saltar anuncio', 'Omitir', // Spanish
    'Saltar anúncio', 'Pular anúncio', // Portuguese
    'Saltare', // Italian
    'Überspringen', // German
    'Пропустить', // Russian
    'スキップ', // Japanese
    '건너뛰기', // Korean
  ];

  // ---------- بحث عميق داخل DOM وداخل shadowRoots ----------
  function deepFind(root, predicate) {
    const queue = [root];
    while (queue.length) {
      const node = queue.shift();
      if (!node) continue;
      try {
        if (node.nodeType === 1 && predicate(node)) return node;
        if (node.shadowRoot) queue.push(node.shadowRoot);
        const children = node.children || node.childNodes;
        if (children && children.length)
          for (let i = 0; i < children.length; i++) queue.push(children[i]);
      } catch (_) {}
    }
    return null;
  }

  // ---------- هل هذا زر تخطي إعلان ----------
  function isSkipButton(el) {
    if (!el || el.nodeType !== 1) return false;
    try {
      const text = (el.innerText || '').trim();
      const aria = el.getAttribute?.('aria-label') || el.getAttribute?.('title') || '';
      const cls = el.className || '';
      for (const kw of SKIP_KEYWORDS) {
        if (text.includes(kw) || aria.includes(kw)) return true;
      }
      if (/ytp-ad-skip-button|ytp-ad-skip-button-modern|skip-ad|videoAdUiSkipButton|ad-skip-button/i.test(cls))
        return true;
      if (el.getAttribute?.('role') === 'button' && (cls.includes('skip') || aria.includes('skip')))
        return true;
    } catch (_) {}
    return false;
  }

  // ---------- كشف وجود إعلان ----------
  function detectAdVisible() {
    const selectors = [
      '.ad-showing', '.ytp-ad-player-overlay', '.video-ads',
      '.ytp-ad-message-container', '.ytp-ad-overlay-container',
      '.ad-container', '.videoAdUi', '#player-ads'
    ];
    for (const s of selectors) if (document.querySelector(s)) return true;
    const player = document.querySelector('ytd-player, #movie_player, ytd-watch-flexy') || document;
    return !!deepFind(player, isSkipButton);
  }

  // ---------- الضغط على زر التخطي ----------
  function tryClickSkip() {
  try {
    const player = document.querySelector('ytd-player, #movie_player, ytd-watch-flexy') || document;
    const skip = deepFind(player, isSkipButton);
    if (skip) {
      console.log('[AdWatcher] 🎯 زر التخطي موجود — جاري الضغط...');
      
      // ✅ محاولات متعددة للضغط
      try {
        skip.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      } catch(_) {}
      try { skip.click(); } catch(_) {}
      
      skipAttempts++;
      console.log('[AdWatcher] ✅ تم الضغط على زر التخطي.');

      // ❌❌❌ لا نغير حالة الإعلان هنا - هذا كان الخطأ الرئيسي
      // النظام سيكتشف نهاية الإعلان تلقائياً عبر detectAdVisible()
      
      return true;
    }
  } catch (e) {
    console.warn('[AdWatcher] خطأ في tryClickSkip:', e);
  }
  return false;
}

  // ---------- عند بداية الإعلان ----------
  function handleAdStart() {
  if (wasAdVisible) return;
  wasAdVisible = true;
  skipAttempts = 0;
  window.__trbAdPlaying = true;

  if (hardForceTimeout) clearTimeout(hardForceTimeout);

  console.log('[AdWatcher] 🎬 إعلان جديد — محاولة التعامل معه...');
  try { onAdStart?.(); } catch (_) {}

  // ✅ محاولة حقن سكربت التخطي الآمن
  if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
    try {
      chrome.runtime.sendMessage({ cmd: 'injectAdSkipper' }, () => {
        if (chrome.runtime.lastError) {
          console.debug('[AdWatcher] لا يوجد مستقبل للرسالة (تم تجاهله)');
        }
      });
    } catch (e) {
      console.debug('[AdWatcher] sendMessage فشل بصمت:', e);
    }
  }

  // ✅ محاولة التخطي فوراً
  tryClickSkip();

  // ✅ مؤقت الإنهاء الإجباري (17 ثانية) - مصحح
  hardForceTimeout = setTimeout(() => {
    if (wasAdVisible) {
      console.warn('[AdWatcher] ⚠️ الإعلان تجاوز 17 ثانية — إنهاء إجباري.');
      // ❌ لا نغير wasAdVisible هنا - نترك handleAdEnd يتولى ذلك
      window.__trbAdPlaying = false;
      // إرسال إشارة لإصلاح الشاشة السوداء
      try {
        window.postMessage({ TRB_INTERNAL: true, type: 'ad_long_timeout' }, '*');
      } catch (err) {
        console.warn('[AdWatcher] notify error:', err);
      }
      try { onAdEnd?.(); } catch (_) {}
    }
  }, 17000);
}

  // ---------- عند نهاية الإعلان ----------
  function handleAdEnd() {
  if (!wasAdVisible) return;
  
  console.log('[AdWatcher] ✅ الإعلان انتهى.');
  wasAdVisible = false;
  skipAttempts = 0;
  window.__trbAdPlaying = false;
  
  if (hardForceTimeout) {
    clearTimeout(hardForceTimeout);
    hardForceTimeout = null;
  }

  // 🟢 تشغيل الفيديو الأصلي فوراً بعد الإعلان
  setTimeout(() => {
    try { 
      onAdEnd?.(); 
    } catch (_) {}

    // ✅ إصلاح الشاشة السوداء وتشغيل الفيديو الأصلي
    try {
      const video = document.querySelector('video');
      if (video) {
        console.log('[AdWatcher] ▶️ محاولة تشغيل الفيديو الأصلي بعد الإعلان...');
        
        // إذا كان الفيديو متوقفاً أو لم يبدأ
        if (video.paused || video.readyState < 2) {
          video.play().catch(err => {
            console.warn('[AdWatcher] فشل التشغيل الأولي، إعادة المحاولة...', err);
            // محاولة ثانية بعد تأخير قصير
            setTimeout(() => {
              try { 
                video.play().catch(() => {}); 
              } catch (_) {}
            }, 500);
          });
        }
      }
    } catch (e) {
      console.error('[AdWatcher] خطأ في تشغيل الفيديو بعد الإعلان:', e);
    }
  }, 300);
}


  // ---------- مراقب التغييرات ----------
  try {
    domObserver = new MutationObserver((mutations) => {
      let maybeAd = false;
      for (const m of mutations) {
        if (m.addedNodes?.length) {
          for (const node of m.addedNodes) {
            if (!node || node.nodeType !== 1) continue;
            const cls = node.className || '';
            if (/ad-showing|ytp-ad|videoAdUi|ad-container|player-ads/i.test(cls)) maybeAd = true;
            if (isSkipButton(node)) {
              tryClickSkip();
              maybeAd = true;
            }
          }
        }
        if (m.removedNodes?.length) {
          for (const node of m.removedNodes) {
            if (!node || node.nodeType !== 1) continue;
            const cls = node.className || '';
            if (/ad-showing|ytp-ad|videoAdUi|ad-container|player-ads/i.test(cls)) {
              setTimeout(() => { if (!detectAdVisible()) handleAdEnd(); }, 300);
            }
          }
        }
      }
      if (maybeAd) setTimeout(() => { if (detectAdVisible()) handleAdStart(); }, 100);
    });
    domObserver.observe(document.documentElement || document.body, { childList: true, subtree: true });
  } catch (e) {
    console.warn('[AdWatcher] MutationObserver error:', e);
  }

  // ---------- فحص احتياطي ----------
  intervalId = setInterval(() => {
    try {
      const visible = detectAdVisible();
      if (visible && !wasAdVisible) handleAdStart();
      else if (!visible && wasAdVisible) handleAdEnd();
      if (wasAdVisible) tryClickSkip();
    } catch (_) {}
  }, 800);

  // ---------- دالة الإيقاف ----------
  return () => {
    try {
      if (domObserver) { domObserver.disconnect(); domObserver = null; }
      if (intervalId) { clearInterval(intervalId); intervalId = null; }
      if (hardForceTimeout) { clearTimeout(hardForceTimeout); hardForceTimeout = null; }
      wasAdVisible = false;
      skipAttempts = 0;
      console.log('[AdWatcher] 🛑 تم إيقاف مراقب الإعلانات بالكامل.');
    } catch (e) {
      console.warn('[AdWatcher] stop error:', e);
    }
  };
}


/* ------------- التحريك البشري ------------- */
function startHumanScroll() {
  // إذا تم طلب الإيقاف العالمي، لا نبدأ شيئاً
  if (window.__trbStopped) {
    log('[HumanScroll] will not start because __trbStopped is true');
    return () => {};
  }

  const maxScroll = Math.max(
    document.body.scrollHeight || document.documentElement.scrollHeight,
    window.innerHeight
  ) - window.innerHeight;

  if (maxScroll <= 0) {
    return () => {};
  }

  // حساب الأهداف بدقة
  const midPage = maxScroll * 0.5;
  const nearBottom = maxScroll * 0.92;
  const top = 0;

  let scrollEvents = [];

  const addSequence = (baseTime) => {
    scrollEvents.push({ time: baseTime, target: midPage });
    const stopDuration = 4000 + Math.floor(Math.random() * 1000);
    scrollEvents.push({ time: baseTime + stopDuration, target: nearBottom });
    scrollEvents.push({ time: baseTime + 12000, target: top });
  };

  addSequence(21 * 1000);
  addSequence(104 * 1000);
  addSequence(248 * 1000);
  addSequence(493 * 1000);
  addSequence(981 * 1000);

  let eventIndex = 0;
  const startTime = Date.now();

  // إذا كان هناك interval سابق لم يُنظّف، نوقّفه أولاً كاحتياط
  try {
    if (__trb_scrollInterval) {
      clearInterval(__trb_scrollInterval);
      timers.delete(__trb_scrollInterval);
      __trb_scrollInterval = null;
    }
  } catch (e) { /* ignore */ }

  __trb_scrollInterval = safeInterval(() => {
    try {
      // فحص علامة الإيقاف العالمية كل دورة
      if (window.__trbStopped) {
        // توقف فوري
        try {
          clearInterval(__trb_scrollInterval);
          timers.delete(__trb_scrollInterval);
        } catch (_) {}
        __trb_scrollInterval = null;
        log('[HumanScroll] stopped because __trbStopped is true');
        return;
      }

      if (eventIndex >= scrollEvents.length) return;

      const currentEvent = scrollEvents[eventIndex];
      if (Date.now() - startTime >= currentEvent.time) {
        window.scrollTo({
          top: currentEvent.target,
          behavior: 'smooth'
        });
        log(`[Scroll] التحريك إلى ${Math.round(currentEvent.target)} بكسل عند ${Math.round((Date.now() - startTime) / 1000)}s`);
        eventIndex++;
      }
    } catch (e) {
      log('[Scroll] خطأ في التحريك:', e);
    }
  }, 500);

  // دالة الإيقاف الخاصة بالـ human scroll
  const stopFn = () => {
    try {
      if (__trb_scrollInterval) {
        clearInterval(__trb_scrollInterval);
        timers.delete(__trb_scrollInterval);
        __trb_scrollInterval = null;
      }
      log('[Scroll] توقف التحريك');
    } catch (e) {
      log('[Scroll] خطأ عند إيقاف التحريك:', e);
    }
  };

  // خزّن الدالة العامة ليتم استدعاؤها من stopAllCompletely
  __trb_scrollStopFn = stopFn;

  return stopFn;
}


/* ==============================
   حذف بيانات المشاهدة (نهائي) — يستخدم بعد الانتهاء من القناة
   ============================= */
async function removeViewedDataFor(videoId) {
  try {
    const userId = await readUserId();
    if (!userId || !videoId) return;
    const key = `video_viewed_${userId}_${videoId}`;
    try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
    // اذا كان هناك مسار اخر لتخزين AjaxData نزيله ايضا
    try { localStorage.removeItem('AjaxData'); } catch (_) {}
    // ولا نحتفظ بأي TRB_channel_mode هنا — سيحذف في مكان الانتهاء
    log(`[Cleanup] removed viewed key for ${videoId}`);
  } catch (e) {
    log('removeViewedDataFor err', e);
  }
}
// ======================================================
// ✅ دالة مساعدة لإرسال الدفع من الـ content script
// ======================================================
async function sendCallbackFromContent(userId, videoId, watchedSeconds) {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      return await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { cmd: "sendCallback", userId, videoId, watchedSeconds },
          (response) => resolve(response?.ok === true)
        );
      });
    } else {
      // fallback (نادر جدًا): طلب مباشر
      try {
        const url = `${MainUrl}/video-callback?user_id=${userId}&video_id=${videoId}&watched_seconds=${watchedSeconds}&secret=${SECRET_KEY}`;
        const resp = await fetch(url);
        const text = await resp.text();
        return resp.ok && text.includes('"status":"success"');
      } catch {
        return false;
      }
    }
  } catch (e) {
    log('sendCallbackFromContent err', e);
    return false;
  }
}

/* =========================================================
   إدارة المشاهدة + الدفع قبل الانتقال للقناة (محسنة نهائياً)
========================================================= */
async function managePlaybackAndProgress(ajaxData) {
  if (!ajaxData || !(ajaxData.video_id || ajaxData.id)) {
    setBarMessage('بيانات الفيديو غير صالحة');
    startGetVideo = true;
    safeTimeout(getVideoFlow, 2000);
    return;
  }

  // استخراج المدة المطلوبة للمشاهدة
  let requiredSeconds = 0;
  if (typeof ajaxData.duration_seconds === 'number') requiredSeconds = Math.floor(ajaxData.duration_seconds);
  else if (typeof ajaxData.duration === 'number') requiredSeconds = Math.floor(ajaxData.duration);
  else if (typeof ajaxData.required_watch_seconds === 'number') requiredSeconds = Math.floor(ajaxData.required_watch_seconds);
  else if (typeof ajaxData.duration_seconds === 'string') requiredSeconds = parseInt(ajaxData.duration_seconds, 10);
  else if (typeof ajaxData.duration === 'string') requiredSeconds = parseInt(ajaxData.duration, 10);
  else if (typeof ajaxData.required_watch_seconds === 'string') requiredSeconds = parseInt(ajaxData.required_watch_seconds, 10);

  if (!Number.isInteger(requiredSeconds) || requiredSeconds <= 0 || requiredSeconds > 3600) {
    setBarMessage('⏱️ مدة الفيديو غير صالحة أو خارج الحدود');
    startGetVideo = true;
    safeTimeout(getVideoFlow, 2000);
    return;
  }

  const userId = await readUserId();
  if (!userId) {
    setBarMessage('⚠️ لم يتم العثور على user_id');
    startGetVideo = true;
    safeTimeout(getVideoFlow, 2000);
    return;
  }

  const videoId = ajaxData.video_id || ajaxData.id;
  let elapsed = 0;
  let pauseTime = 0;
  let callbackSent = false;
  stopped = false;
  currentAjaxData = ajaxData;

  hideLoadingScreen();
  injectProgressBar();
  setBarProgress(0);
  setBarPayNotice('');
  setBarMessage(`استمر في مشاهدة هذا الفيديو (0/${requiredSeconds})`);

  // ✅ تشغيل الفيديو فوراً
  const videoEl = tryPlayVideoElement();

  // ✅ بدء مراقبة الإعلانات
  const adStop = startAdWatcher(
    () => setBarMessage('📺 جاري التعامل مع الإعلان...'),
    () => setBarMessage(`استمر في مشاهدة هذا الفيديو (${elapsed}/${requiredSeconds})`)
  );

  // ✅ بدء التمرير البشري
  humanScrollStop = startHumanScroll();

  // =====================================================
  // 🛑 دالة توقف شاملة لجميع الأنشطة
  // =====================================================
  function stopPlaybackTimers() {
    try { if (tickInterval) { clearInterval(tickInterval); timers.delete(tickInterval); tickInterval = null; } } catch {}
    try { if (adStop) adStop(); } catch {}
    try { if (humanScrollStop) { humanScrollStop(); humanScrollStop = null; } } catch {}
  }

  async function ensurePlay() {
    if (videoEl) {
      try {
        if (videoEl.ended || (typeof videoEl.currentTime === 'number' && typeof videoEl.duration === 'number' && videoEl.currentTime >= (videoEl.duration - 0.5))) {
          try { videoEl.currentTime = 0; } catch {}
        }
        await videoEl.play().catch(() => {});
      } catch {}
    }
  }

// =====================================================
// 🎯 المؤقت الرئيسي (tickInterval)
// =====================================================
tickInterval = safeInterval(async () => {
  // ⛔ إيقاف فوري إذا العامل متوقف
  if (window.__trbStopped) {
    log('tick: stopping because __trbStopped is true');
    stopPlaybackTimers();
    startGetVideo = true;
    return;
  }

  try {
    const adFlag = !!window.__trbAdPlaying;
    const adVisible = !!document.querySelector('.ad-showing, .ytp-ad-player-overlay, .video-ads, .jw-ad');
    const isVideoEnded = videoEl ? videoEl.ended : false;
    
    // ✅ تحسين كشف حالة التشغيل
    const isPlaying = !isVideoEnded && !adVisible && !adFlag && videoEl && !videoEl.paused;

    if (isPlaying) {
      const isManuallyPaused = videoEl && videoEl.paused && !document.hidden;
      if (isManuallyPaused) {
        pauseTime++;
        setBarMessage('⏸️ متوقف مؤقتًا...');
        if (pauseTime > 15) await ensurePlay();
        if (pauseTime > 300) {
          stopPlaybackTimers();
          startGetVideo = true;
          safeTimeout(getVideoFlow, 5000);
          return;
        }
      } else {
        elapsed++;
        pauseTime = 0;
        setBarProgress(Math.min(100, (elapsed / requiredSeconds) * 100));
        setBarMessage(`استمر في مشاهدة هذا الفيديو (${elapsed}/${requiredSeconds})`);
      }
    } else if (adFlag || adVisible) {
      setBarMessage('📺 جاري التعامل مع الإعلان...');
      // ✅ إعادة محاولة التخطي إذا كان الإعلان لا يزال ظاهراً
      if (adVisible) {
        
      }
    } else {
      pauseTime++;
      setBarMessage('⏸️ متوقف مؤقتًا...');
      if (pauseTime > 300) {
        stopPlaybackTimers();
        startGetVideo = true;
        safeTimeout(getVideoFlow, 5000);
        return;
      }
    }

    // استرجاع الفيديو عند الانتهاء قبل الوقت المطلوب
    if (videoEl && videoEl.ended && elapsed < requiredSeconds) {
      try {
        videoEl.currentTime = 0;
        await ensurePlay();
      } catch (_) {}
    }

    // ✅ تحديث الرسالة بعد انتهاء الإعلان
    const msgEl = document.getElementById('trb-msg');
    const currentMsg = (msgEl?.textContent || '').trim();

    if (
      !window.__trbAdPlaying &&
      !adVisible &&
      currentMsg.includes('جاري التعامل مع الإعلان')
    ) {
      pauseTime = 0;
      try {
        setBarMessage(`استمر في مشاهدة هذا الفيديو (${elapsed || 0}/${requiredSeconds || ''})`);
      } catch (_) {
        console.warn('[TRB] لم يتمكن من تحديث الرسالة بعد انتهاء الإعلان.');
      }
    }

      // =====================================================
      // ✅ عند اكتمال المدة المطلوبة
      // =====================================================
      if (!callbackSent && elapsed >= requiredSeconds) {
        callbackSent = true;
        try { await markVideoViewed(userId, videoId); } catch {}

        stopPlaybackTimers();
        setBarMessage('جاري إرسال طلب الدفع...');
        await new Promise(r => setTimeout(r, 500));

        const success = await new Promise(resolve =>
          chrome.runtime.sendMessage(
            { cmd: "sendCallback", userId, videoId, watchedSeconds: requiredSeconds },
            r => resolve(r?.ok === true)
          )
        );

        if (success) {
          setBarMessage('✅ تم الدفع بنجاح — جارٍ الانتقال للقناة...');
          try {
            if (chrome?.storage?.local) {
              chrome.storage.local.set({
                TRB_channel_mode: { active: true, videoId, timestamp: Date.now() }
              });
            }
            localStorage.setItem('TRB_channel_mode', JSON.stringify({ active: true, videoId, timestamp: Date.now() }));
          } catch {}

          try {
            if (chrome?.storage?.local) chrome.storage.local.remove(['AjaxData']);
            localStorage.removeItem('AjaxData');
          } catch {}

          currentAjaxData = null;

          setTimeout(() => {
            const link = document.querySelector('a[href*="/channel/"],a[href*="/@"],a[href*="/user/"],.ytd-channel-name a');
            if (link?.href) location.href = link.href;
            else {
              startGetVideo = true;
              safeTimeout(getVideoFlow, 2000);
            }
          }, 1500);
        } else {
          setBarMessage('⚠️ تعذر إرسال الدفع، سيتم إعادة المحاولة...');
          callbackSent = false;
        }
      }
    } catch (e) {
      log('managePlayback tick error', e);
      setBarMessage('⚠️ خطأ أثناء تشغيل الفيديو');
      startGetVideo = true;
      safeTimeout(getVideoFlow, 5000);
    }
  }, 1000);
}




/* ==============================
   ✅ إضافة مراقبة تغيّر الروابط
   ============================== */
let lastUrl = location.href;
new MutationObserver(() => {
  const current = location.href;
  if (current !== lastUrl) {
    lastUrl = current;
    // عند الدخول للقناة داخل Youtube SPA
    if (current.includes('/channel/') || current.includes('/@') || current.includes('/user/')) {
      safeTimeout(() => checkChannelMode(), 300);
    }
  }
}).observe(document, { subtree: true, childList: true });

/* =========================================================
   بدء العد داخل القناة بعد الانتقال إليها
========================================================= */
function startChannelVisitCountdown(videoId) {
  try {
    const staySeconds = Math.floor(10 + Math.random() * 6); // 10..15
    let chElapsed = 0;

    // تأكد من الشريط موجود
    injectProgressBar();
    setBarPayNotice('');
    setBarProgress(0);
    setBarMessage(`جاري التفاعل مع القناة (${chElapsed}/${staySeconds})`);

    // Scroll بشري داخل القناة (خفيف ومتكرر)
    let chScrollInterval = null;
    try {
      chScrollInterval = setInterval(() => {
        try {
          window.scrollBy({ top: 120 + Math.random() * 200, behavior: 'smooth' });
        } catch (e) { /* tolerate */ }
      }, 2200);
      timers.add(chScrollInterval);
    } catch (e) {
      log('chScrollInterval err', e);
    }

    // التايمر الرئيسي للقناة
    const chTick = setInterval(() => {
      try {
        chElapsed++;
        setBarProgress(Math.min(100, (chElapsed / staySeconds) * 100));
        setBarMessage(`جاري التفاعل مع القناة (${chElapsed}/${staySeconds})`);

        if (chElapsed >= staySeconds) {
          // إيقاف مؤقتات القناة
          clearInterval(chTick);
          timers.delete(chTick);
          if (chScrollInterval) {
            clearInterval(chScrollInterval);
            timers.delete(chScrollInterval);
            chScrollInterval = null;
          }

          // رسالة قبل الإزالة
          setBarMessage('انتهاء التفاعل داخل القناة — جاري العودة للمشاهدة...');

          // إزالة الشريط بعد تأخير قصير لعرض الرسالة
          setTimeout(() => {
            removeProgressBar();

            // تنظيف شامل
            clearAllTimers();
            disconnectObservers();
            if (humanScrollStop) {
              humanScrollStop();
              humanScrollStop = null;
            }

            // حذف وضع القناة نهائياً
            try { localStorage.removeItem('TRB_channel_mode'); } catch (e) { log('remove TRB_channel_mode err', e); }
            try {
              if (chrome?.storage?.local) {
                chrome.storage.local.remove(['TRB_channel_mode'], () => {});
              }
            } catch (_) {}

            // العودة لجلب فيديو جديد
            startGetVideo = true;
            safeTimeout(getVideoFlow, 800);
          }, 800);
        }
      } catch (e) {
        log('chTick error', e);
      }
    }, 1000);

    timers.add(chTick);
  } catch (e) {
    log('startChannelVisitCountdown error', e);
    try { localStorage.removeItem('TRB_channel_mode'); } catch(_) {}
  }
}
/* =========================================================
   استئناف وضع القناة بعد إعادة التوجيه
========================================================= */
async function checkChannelMode() {
  try {
    let chData = null;
    try {
      if (chrome?.storage?.local) {
        chData = await new Promise(res =>
          chrome.storage.local.get('TRB_channel_mode', d => res(d?.TRB_channel_mode || null))
        );
      }
    } catch (e) {
      log('chrome.storage get err', e);
    }

    if (!chData) {
      try {
        chData = JSON.parse(localStorage.getItem('TRB_channel_mode') || 'null');
      } catch (e) {
        chData = null;
      }
    }

    if (!chData || !chData.active) return;

    function initChannelMode() {
      if (document.readyState !== 'complete') return safeTimeout(initChannelMode, 150);
      injectProgressBar();
      setBarMessage('جاري تحميل صفحة القناة...');

      // ✅ إيقاف أي تمرير سابق
      if (humanScrollStop) {
        humanScrollStop();
        humanScrollStop = null;
      }

      // ✅ سلوك التمرير البشري الجديد (6 خطوات بتأخير عشوائي)
      let scrollStep = 0;
      const totalSteps = 6;

      const performScrollStep = () => {
        if (scrollStep >= totalSteps) {
          // بدء العد التنازلي بعد انتهاء السلوك البشري
          safeTimeout(() => {
            try {
              startChannelVisitCountdown(chData.videoId);
            } catch (e) {
              log('startChannelVisitCountdown error:', e);
              setBarMessage('خطأ أثناء التفاعل مع القناة');
            }
          }, 1000);
          return;
        }

        const windowHeight = window.innerHeight;
        const documentHeight = Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight
        );
        const maxScrollable = documentHeight - windowHeight;
        let targetTop = 0;

        if (scrollStep === 0) targetTop = Math.min(maxScrollable, windowHeight * 0.2);
        else if (scrollStep === 1) targetTop = Math.min(maxScrollable, windowHeight * 0.4);
        else if (scrollStep === 2) targetTop = Math.min(maxScrollable, windowHeight * 0.65);
        else if (scrollStep === 3) targetTop = Math.random() > 0.5 ? 0 : windowHeight * 0.3;
        else if (scrollStep === 4) targetTop = Math.random() * windowHeight * 0.5;
        else if (scrollStep === 5) targetTop = Math.random() > 0.7 ? 0 : windowHeight * 0.25;

        try {
          window.scrollTo({ top: targetTop, behavior: "smooth" });
          log(`[HumanScroll] Step ${scrollStep + 1}: scrolling to ${Math.round(targetTop)}px`);
        } catch (e) {
          log('[HumanScroll] Scroll error:', e);
        }

        scrollStep++;

        // تأخير عشوائي بين 2 إلى 6 ثوانٍ قبل الخطوة التالية
        const delay = 2000 + Math.floor(Math.random() * 3000);
        const timeoutId = safeTimeout(performScrollStep, delay);
        // لا حاجة لإضافة timeoutId إلى timers يدويًا — safeTimeout يفعلها تلقائيًا
      };

      // بدء السلوك بعد 1.2 ثانية
      const scrollTimeoutId = safeTimeout(performScrollStep, 800);

      // دالة الإيقاف (للاستخدام في stopAllCompletely)
      humanScrollStop = () => {
        // safeTimeout يضيف المؤقّت تلقائيًا إلى `timers`، لذا لا حاجة لإيقاف يدوي هنا
        // لأن clearAllTimers() سيزيله لاحقًا
        log('[HumanScroll] Stopped via humanScrollStop');
      };
    }

    if (document.readyState === 'complete') initChannelMode();
    else window.addEventListener('load', initChannelMode, { once: true });
  } catch (e) {
    log('checkChannelMode outer error', e);
    try { localStorage.removeItem('TRB_channel_mode'); } catch (_) {}
  }
}
/* =========================================================
   bootstrap channel mode
========================================================= */
(function channelModeBootstrap() {
  try {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      safeTimeout(checkChannelMode, 250);
    } else {
      document.addEventListener('DOMContentLoaded', () => safeTimeout(checkChannelMode, 250), { once: true });
    }
  } catch {}
})();


  /* ------------- جلب الفيديوهات ------------- */
async function getVideoFlow() {
  if (!startGetVideo || stopped) return;
  startGetVideo = false;

  try {
    showLoadingScreen('جاري جلب فيديو للمشاهدة...');
    const userId = await readUserId();
    if (!userId) {
      log('getVideoFlow: no user_id, retry shortly');
      setBarMessage('لم يتم العثور على user_id — تأكد من تسجيل الدخول');
      hideLoadingScreen();
      startGetVideo = true;
      safeTimeout(getVideoFlow, 3000);
      return;
    }

    // طلب الفيديوهات من الخلفية
    const videoData = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { cmd: "getVideos", userId },
        (response) => resolve(response)
      );
    });

    if (!videoData?.success) {
      setBarMessage('فشل جلب الفيديوهات من الخلفية');
      hideLoadingScreen();
      startGetVideo = true;
      safeTimeout(getVideoFlow, 5000);
      return;
    }

    const myVideos = Array.isArray(videoData.myVideos) ? videoData.myVideos : [];
    const data = Array.isArray(videoData.publicVideos) ? videoData.publicVideos : [];

    // ✅ تحقق شامل من عدم وجود أي فيديوهات (شخصية أو عامة)
if (
  (!Array.isArray(myVideos) || myVideos.length === 0) &&
  (!Array.isArray(data) || data.length === 0)
) {
  setBarMessage('❌ لا توجد فيديوهات متاحة للمشاهدة حالياً، يرجى المحاولة لاحقاً.');
  setBarProgress(0);
  hideLoadingScreen();
  startGetVideo = true;
  safeTimeout(getVideoFlow, 20000); // إعادة المحاولة بعد 20 ثانية
  return;
}


    // -------------------------------------
    // ✅ فلترة الفيديوهات التي تخص المستخدم (myVideos)
    // -------------------------------------
    let filtered = data.filter(v => String(v.user_id) !== String(userId));

    // -------------------------------------
    // ✅ فلترة الفيديوهات التي تخص المستخدم (myVideos)
    // -------------------------------------
    if (Array.isArray(myVideos) && myVideos.length) {
      const myIds = myVideos
        .map(m => String(m.id || m.video_id))
        .filter(Boolean);

      filtered = filtered.filter(v => !myIds.includes(String(v.id || v.video_id)));
    }

    // -------------------------------------
    // ✅ منع تكرار الفيديوهات التي تمّت مشاهدتها مؤخرًا
    // -------------------------------------
    const checks = await Promise.all(filtered.map(async (v) => {
      const vid = v.id || v.video_id;
      if (!vid) return false;
      const seen = await hasViewedRecently(userId, vid, NO_REPEAT_HOURS);
      return !seen;
    }));

    const finallyFiltered = filtered.filter((v, i) => checks[i]);

    if (!finallyFiltered.length) {
      setBarMessage('كل الفيديوهات تمت مشاهدتها مؤخرًا');
      hideLoadingScreen();
      startGetVideo = true;
      safeTimeout(getVideoFlow, 20 * 60 * 1000);
      return;
    }

    // -------------------------------------
    // ✅ اختيار الفيديو الذي يحتوي على duration_seconds الصحيح
    // -------------------------------------
    const chosen = finallyFiltered.find(v => v.duration_seconds > 0);

    if (!chosen) {
      setBarMessage('لم يتم العثور على فيديو يحتوي على مدة صحيحة');
      hideLoadingScreen();
      startGetVideo = true;
      safeTimeout(getVideoFlow, 3000);
      return;
    }

    // إعداد بيانات الفيديو
    const cmd = {
      video_id: chosen.id || chosen.video_id,
      url: chosen.url || chosen.video_url,
      duration_seconds: chosen.duration_seconds
    };

    // تخزين آخر فيديو (لاستئناف أو تتبع)
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set({ AjaxData: cmd }, () => {});
      } else {
        localStorage.setItem('AjaxData', JSON.stringify(cmd));
      }
    } catch (e) {}

    try { clearInterval(tickInterval); } catch (_) {}

    // -------------------------------------
    // ✅ توجيه للرابط المغلف لتشغيل الفيديو
    // -------------------------------------
    if (cmd.url) {
      const wrapped = generate_wrapped_url(cmd.url);
      if (!wrapped) {
        log('❌ فشل توليد رابط مغلف — لن يتم استخدام الرابط الأصلي');
        setBarMessage('فشل توليد رابط آمن — سيتم تخطي الفيديو');
        hideLoadingScreen();
        startGetVideo = true;
        safeTimeout(getVideoFlow, 3000);
        return;
      }
      safeTimeout(() => {
        try {
          window.location.href = wrapped;
        } catch (e) {
          log('redirect failed', e);
          setBarMessage('فشل إعادة التوجيه إلى الفيديو');
          hideLoadingScreen();
          startGetVideo = true;
          safeTimeout(getVideoFlow, 5000);
        }
      }, REDIRECT_DELAY_MS);
    } else {
      safeTimeout(() => handleApiResponse({ action: 'start', command: cmd }), 400);
    }

  } catch (e) {
    log('getVideoFlow err', e);
    setBarMessage('خطأ في جلب الفيديوهات');
    hideLoadingScreen();
    startGetVideo = true;
    safeTimeout(getVideoFlow, 8000);
  }
}



  /* ------------- التعامل مع استجابة API ------------- */
  async function handleApiResponse(resp) {
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
   🧠 handleVideoPageIfNeeded (نسخة كاملة + تشغيل الفيديو + مراقبة الإعلانات)
   ========================================================= */
async function handleVideoPageIfNeeded() {
  let ajax = currentAjaxData;

  // 🟢 محاولة جلب بيانات الفيديو من التخزين إذا لم تكن جاهزة
  if (!ajax) {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        ajax = await new Promise(res => chrome.storage.local.get(['AjaxData'], r => res(r?.AjaxData || null)));
      } else {
        ajax = JSON.parse(localStorage.getItem('AjaxData') || 'null');
      }
    } catch (e) {
      ajax = null;
    }
  }

  if (!ajax || !ajax.url) {
    log("⚠️ لا توجد بيانات فيديو بعد.");
    return;
  }

  // 🎯 بعد 2 ثانية يبدأ التنفيذ الفعلي
  safeTimeout(() => {
    log("▶️ بدء متابعة الفيديو الآن...");

    const normalized = {
      video_id: ajax.video_id || ajax.id || ajax.videoId,
      duration_seconds: ajax.duration_seconds || ajax.duration || ajax.required_watch_seconds,
      original_url: ajax.original_url || ajax.url || ajax.link
    };

    // ✅ حقن شريط التقدم (Progress Bar)
    injectProgressBar();

    // ✅ تشغيل الفيديو فورًا
    const video = tryPlayVideoElement();

    // ✅ تفعيل مراقبة الإعلانات عند بداية الفيديو
    const adStop = startAdWatcher(
      () => {
        // عند بداية الإعلان
        setBarMessage('📺 جاري التعامل مع الإعلان...');
      },
      () => {
        // عند نهاية الإعلان
        setBarMessage('✅ تم تخطي الإعلان — استئناف المشاهدة...');
      }
    );

    // ✅ بدء متابعة التقدم ومراقبة الفيديو
    managePlaybackAndProgress(normalized);

    // ⚙️ حماية إضافية: عند مغادرة الصفحة أو إغلاقها نوقف المراقب
    window.addEventListener('beforeunload', () => {
      try { adStop?.(); } catch { }
    });

  }, 2000);
}

/* ------------- فصل مراقبي الـ DOM بأمان ------------- */
function disconnectObservers() {
  try {
    if (window.__trbMutationObservers && Array.isArray(window.__trbMutationObservers)) {
      window.__trbMutationObservers.forEach(obs => {
        try { obs.disconnect(); } catch {} 
      });
      window.__trbMutationObservers = [];
    }
    console.log('[TRB] ✅ تم فصل جميع مراقبي الـ DOM بأمان');
  } catch (e) {
    console.warn('[TRB] disconnectObservers error:', e);
  }
}

/* ------------- إيقاف العامل (نهائي ومضمون) ------------- */
function stopAllCompletely() {
  try {
    window.__trbStopped = true;

    clearAllTimers();
    disconnectObservers();

    stopped = true;
    alreadyStarted = false;

    try {
      if (typeof humanScrollStop === "function") {
        humanScrollStop();
        humanScrollStop = null;
      }
    } catch (e) {
      log('[stopAllCompletely] humanScrollStop error', e);
    }

    try {
      if (typeof __trb_scrollStopFn === "function") {
        __trb_scrollStopFn();
        __trb_scrollStopFn = null;
      }
      if (__trb_scrollInterval) {
        clearInterval(__trb_scrollInterval);
        timers.delete(__trb_scrollInterval);
        __trb_scrollInterval = null;
        log('[Scroll] ✅ توقف التحريك التلقائي.');
      }
    } catch (e) {
      log('[stopAllCompletely] scrollInterval error:', e);
    }

    try {
      if (adWatcherInterval) {
        clearInterval(adWatcherInterval);
        adWatcherInterval = null;
        log('[stopAllCompletely] ✅ adWatcherInterval cleared');
      }
    } catch (e) {
      log('[stopAllCompletely] adWatcherInterval error:', e);
    }

    removeProgressBar();
    hideLoadingScreen();

    try {
      const chDataRaw = localStorage.getItem('TRB_channel_mode');
      const chData = chDataRaw ? JSON.parse(chDataRaw) : null;
      if (!chData || !chData.active) {
        localStorage.removeItem('TRB_channel_mode');
      }
    } catch (e) {
      localStorage.removeItem('TRB_channel_mode');
    }

    // ✅ فصل مراقب الشاشة السوداء إن وجد
    try { if (typeof fixObserver !== 'undefined' && fixObserver) fixObserver.disconnect(); } catch (e) {}

    log('✅ stopAllCompletely: تم إيقاف جميع العمليات والمؤقتات بنجاح.');
  } catch (e) {
    console.error('stopAllCompletely error:', e);
  }
}
  /* ------------- تهيئة صفحة العامل ------------- */
  async function initWorkerPage() {
     const TRB_WORKER_PAGE = "https://perceptive-victory-production.up.railway.app/worker/start";
  if (!location.href.startsWith(TRB_WORKER_PAGE)) {
    console.warn("[TRB] ⚠️ initWorkerPage تم استدعاؤها في صفحة غير صفحة العامل — تم الإلغاء.");
    return;
  }
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
        if (b) b.textContent = `${data.balance} نقطة`;
        if (m) m.textContent = data.membership;
      } else {
        log('⚠️ لم يتم العثور على بيانات المستخدم في السيرفر.');
      }
    } catch (err) {
      log('❌ خطأ أثناء جلب بيانات المستخدم من السيرفر:', err);
    }
  }

  /* ------------- مراقبة تغييرات الصفحة ------------- */
  function setupPageObserver() {
    const observer = new MutationObserver(() => {
      const isVideoPage = /\/video\/|\/watch/.test(window.location.pathname);
      const isChannelPage = /\/channel\/|\/@/.test(window.location.pathname);
      const bar = document.getElementById('trb-overlay');
      if (isVideoPage || isChannelPage) {
        if (!bar) {
          log('⚠️ الشريط اختفى — إعادة إدخاله...');
          injectProgressBar();
          setBarMessage(isChannelPage ? 'جاري التفاعل مع القناة...' : 'استمر في مشاهدة هذا الفيديو');
        }
      } else if (bar) {
        log('ℹ️ المستخدم غادر صفحة الفيديو/القناة — إزالة الشريط.');
        removeProgressBar();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    observers.add(observer);
  }
 // مراقبة تغييرات workerActive من الخلفية
  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.workerActive) {
        const isActive = changes.workerActive.newValue === true;
        try {
          localStorage.setItem('TRB_worker_active', String(isActive));
        } catch (e) { /* ignore */ }
        // إذا تم إيقاف العامل، نزيل الشريط فورًا
        if (!isActive) {
          removeProgressBar();
          stopAllCompletely();
        }
      }
    });
  }

  // تهيئة أولية عند التحميل
  (async () => {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const res = await new Promise(r => chrome.storage.local.get(['workerActive'], r));
        const isActive = res?.workerActive === true;
        localStorage.setItem('TRB_worker_active', String(isActive));
        if (!isActive) {
          removeProgressBar();
          stopAllCompletely();
        }
      }
    } catch (e) {
      // إذا فشل، نفترض أن العامل غير نشط
      try { localStorage.setItem('TRB_worker_active', 'false'); } catch (_) {}
      removeProgressBar();
      stopAllCompletely();
    }
  })();

  /* ------------- بدء العامل ------------- */
  function startIfWorkerPage() {
    try {
      if (alreadyStarted) return;
      alreadyStarted = true;
      const path = window.location.pathname || '';
      if (path === '/worker/start' || path.endsWith('/worker/start')) {
        injectProgressBar();
        setBarMessage('جارٍ جلب فيديو للمشاهدة...');
        safeTimeout(getVideoFlow, 600);
      } else {
        safeTimeout(() => {
          injectProgressBar();
          handleVideoPageIfNeeded();
          checkChannelMode();
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
      const ok = (typeof startIfWorkerPage === 'function') &&
                 (typeof safeTimeout === 'function' || typeof setTimeout === 'function') &&
                 (typeof injectProgressBar === 'function') &&
                 (typeof handleVideoPageIfNeeded === 'function');
      if (!ok) {
        setTimeout(tryStartIfWorkerPageSafely, 200);
        return;
      }
      startIfWorkerPage();
      log('Start.js loaded — ready.');
    } catch (err) {
      console.error('tryStartIfWorkerPageSafely error:', err);
      setTimeout(tryStartIfWorkerPageSafely, 300);
    }
  }

 /* ------------- تهيئة الأحداث ------------- */
if (document.getElementById('username') || document.getElementById('balance')) {
  window.addEventListener('load', initWorkerPage);
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  tryStartIfWorkerPageSafely();
} else {
  window.addEventListener('load', tryStartIfWorkerPageSafely, { once: true });
}

  window.addEventListener('beforeunload', stopAllCompletely, { capture: true });
  window.addEventListener('pagehide', stopAllCompletely);

  document.addEventListener('visibilitychange', () => {
    const isVideoPage = /\/video\/|\/watch/.test(window.location.pathname);
    const isChannelPage = /\/channel\/|\/@/.test(window.location.pathname);
    if (document.hidden && !isVideoPage && !isChannelPage) {
      stopAllCompletely();
    }
  });

  setupPageObserver();

// تلقّي أوامر ايقاف عامة من الخلفية أو من نافذة الصفحة
window.addEventListener('message', (ev) => {
  try {
    if (!ev?.data) return;
    if (ev.data === 'TRB_STOP' || ev.data?.cmd === 'TRB_STOP') {
      log('Received TRB_STOP via window.message — stopping all');
      stopAllCompletely();
    }
  } catch (e) {}
});

// استقبال من chrome.runtime (لو الخلفية تَرسِل)
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    try {
      if (msg && msg.cmd === 'TRB_STOP') {
        log('Received TRB_STOP via chrome.runtime — stopping all');
        stopAllCompletely();
        sendResponse({ ok: true });
      }
    } catch (e) {}
  });
}

// =========================================================
// 🛑 استقبال أمر الإيقاف الكامل من الخلفية (TRB_STOP_ALL)
// =========================================================
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    try {
      if (msg === 'TRB_STOP_ALL' || (msg && msg.cmd === 'TRB_STOP_ALL')) {
        console.log('[TRB] تم استقبال أمر إيقاف شامل من الخلفية');
        try { window.__trbStopped = true; } catch (e) {}
        try {
          if (typeof stopAllCompletely === 'function') stopAllCompletely();
        } catch (e) {
          console.warn('stopAllCompletely error:', e);
        }
        try { sendResponse && sendResponse({ ok: true }); } catch (e) {}
        return true;
      }
    } catch (e) {
      console.warn('[TRB] onMessage TRB_STOP_ALL error', e);
    }
  });
}
// =========================================================
// ✅ إصلاح الشاشة السوداء بعد تخطي الإعلان — نسخة محسّنة ومستقرة
// =========================================================
function fixBlackScreenAfterAd() {
  try {
    const video = document.querySelector('video');
    if (!video) return;

    // 🔸 إذا كان الفيديو موجود لكنه متوقف أو لم يُحمّل بالكامل
    if (video.paused || video.readyState < 2) {
      console.warn('[TRB] ⚙️ محاولة إصلاح شاشة سوداء بعد الإعلان...');

      // أحيانًا يكون الفيديو في حالة انتظار بيانات، لذلك نحاول تشغيله مرتين بفاصل زمني
      const tryPlay = () => {
        try {
          video.play().then(() => {
            console.log('[TRB] 🎬 تم تشغيل الفيديو بعد التخطي بنجاح');
          }).catch(() => {
            console.warn('[TRB] ⚠️ فشل التشغيل الأول — إعادة المحاولة...');
            setTimeout(() => {
              try { video.play().catch(() => {}); } catch(_) {}
            }, 500);
          });
        } catch (e) {
          console.error('[TRB] video.play() error:', e);
        }
      };

      tryPlay();
    }
  } catch (e) {
    console.error('[TRB] fixBlackScreenAfterAd error:', e);
  }
}

// =========================================================
// 🧩 مراقبة تغييرات DOM لإصلاح الشاشة السوداء تلقائيًا
// =========================================================
try {
  window.fixObserver = new MutationObserver((mutations) => {
    // ✅ تأكد أن الصفحة تحتوي على فيديو فعّال
    const video = document.querySelector('video');
    if (!video) return;

    // نراقب فقط تغييرات عناصر الإعلانات
    const adNodes = mutations.some(m =>
      [...m.addedNodes, ...m.removedNodes].some(n =>
        n.nodeType === 1 && (
          n.classList?.contains('ad-showing') ||
          n.classList?.contains('ytp-ad-player-overlay') ||
          n.classList?.contains('video-ads')
        )
      )
    );

    if (adNodes) {
      safeTimeout(() => fixBlackScreenAfterAd(), 300);
    }
  });

  // نراقب جسم الصفحة بأكمله
  fixObserver.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true
  });

  // ✅ سجل هذا المراقب في قائمة المراقبين العامة ليتم فصله تلقائيًا عند الإيقاف
  if (typeof observers !== "undefined" && observers instanceof Set) {
    observers.add(fixObserver);
  }

  console.log('[TRB] 🧠 fixObserver ready and linked to observers');
} catch (e) {
  console.error('[TRB] fixObserver init error:', e);
}

// =========================================================
// 🧩 استقبال إشارات داخلية من background لإصلاح الشاشة
// =========================================================
window.addEventListener('message', (ev) => {
  try {
    const d = ev.data;
    if (d && d.TRB_INTERNAL && d.type === 'ad_long_timeout') {
      safeTimeout(() => fixBlackScreenAfterAd(), 300);
    }
  } catch (e) {
    /* تجاهل الأخطاء */
  }
});

})();
