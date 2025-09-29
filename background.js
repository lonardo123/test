// background.js — النسخة المعدلة (service worker)
// يقوم بقراءة apiBaseUrl و userId و (اختياري) callbackSecret من chrome.storage
// يعرِض إشعارات ويدعم إعادة التوجيه إلى روابط مغلّفة (Facebook/Instagram/Google)

// ملاحظة أمنية:
// إذا قمت بحفظ callbackSecret في إعدادات الإضافة فستقوم الإضافة بتوليد HMAC في المتصفح.
// هذا يجعل السر مرئيًا لأي من يطالع ملفات الامتداد — غير مستحسن للإنتاج.
// الخيار الأفضل: اترك callbackSecret فارغاً واستخدم التحقق على مستوى الخادم أو آلية آمنة أخرى.

'use strict';

const EXTERNAL_SOURCES = [
  { name: 'Facebook', prefix: 'https://l.facebook.com/l.php?u=' },
  { name: 'Instagram', prefix: 'https://l.instagram.com/?u=' },
  { name: 'Google', prefix: 'https://www.google.com/url?q=' }
];

// Default API base (السيرفر الذي أعطيتَه)
const DEFAULT_API_BASE = 'https://perceptive-victory-production.up.railway.app';

// مساعدة: الحصول على config من chrome.storage (يدعم مفتاح مفرد أو مصفوفة مفاتيح)
function storageGet(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}
function storageSet(obj) {
  return new Promise(resolve => chrome.storage.local.set(obj, resolve));
}

// =======================
// دالة لحساب HMAC-SHA256 وإرجاع hex string
// تستخدم Web Crypto API المتوفرة في Service Worker
// payload: string (مثال: "userId:videoId:55:YouTube")
// secret: string (مفتاح سري نصي) — إن لم يكن موجودًا الدالة سترمي خطأ
async function computeHmacSHA256Hex(payload, secret) {
  if (!secret) throw new Error('No secret provided for HMAC');
  const enc = new TextEncoder();
  const keyData = enc.encode(secret);
  // import key
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: { name: 'SHA-256' } },
    false,
    ['sign']
  );
  // sign
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  const bytes = new Uint8Array(sig);
  // convert to hex
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// =======================
// استقبال رسائل من content.js
// الرسائل المستخدمة: action === 'rewardUser' و action === 'requestRedirect'
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'rewardUser') {
    // نعيد true للسماح للـ sendResponse بأن يعمل بعد العملية غير المتزامنة
    rewardUser(request.videoId, request.watchedSeconds, request.source, sender).then(result => {
      try { sendResponse({ ok: true, detail: result }); } catch (e) {}
    }).catch(err => {
      console.error('rewardUser error', err);
      try { sendResponse({ ok: false, error: String(err) }); } catch (e) {}
    });
    return true;
  }

  if (request.action === 'requestRedirect') {
    handleRequestRedirect(request.videoId, sender.tab ? sender.tab.id : null).then(result => {
      try { sendResponse({ ok: true, detail: result }); } catch (e) {}
    }).catch(err => {
      console.error('requestRedirect error', err);
      try { sendResponse({ ok: false, error: String(err) }); } catch (e) {}
    });
    return true;
  }
});

// =======================
// handleRequestRedirect: كما كان — يفتح رابط مغلّف في التاب الحالي
async function handleRequestRedirect(videoId, tabId) {
  if (!tabId) throw new Error('No tab id provided');
  const stored = await storageGet(`redirect_history_${videoId}`);
  const history = stored[`redirect_history_${videoId}`] || [];

  // اقرأ apiBaseUrl إن وُجد (لن نستخدمه هنا لكن نقرأه للحفاظ على التوافق)
  const cfg = await storageGet(['apiBaseUrl']);
  const apiBase = cfg.apiBaseUrl || DEFAULT_API_BASE;

  // اختر مصدر بديل لم يُجرب بعد
  const next = EXTERNAL_SOURCES.find(s => history.indexOf(s.name) === -1);
  if (!next) return { ok: false, message: 'No more alternative sources' };

  // ضع __source في رابط يوتيوب النهائي، ثم غلفه
  const ytUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&__source=${encodeURIComponent(next.name)}`;
  const wrapped = `${next.prefix}${encodeURIComponent(ytUrl)}`;

  await storageSet({
    [`redirect_history_${videoId}`]: [...history, next.name],
    [`video_source_${videoId}`]: next.name
  });

  // حدِّث التاب إلى الرابط المغلف (هذا سيؤدي إلى إعادة تحميل الصفحة ومن ثم يبدأ content script التتبع)
  await new Promise(res => chrome.tabs.update(tabId, { url: wrapped }, res));

  return { ok: true, opened: wrapped, source: next.name };
}

// =======================
// rewardUser: يرسل بيانات المشاهدة إلى السيرفر
// إذا وُجد callbackSecret في التخزين يقوم بحساب signature ويضيفها
async function rewardUser(videoId, watchedSeconds, sourceFromContent, sender) {
  // جلب التخزين: userId, apiBaseUrl, callbackSecret
  const data = await storageGet(['userId', 'apiBaseUrl', 'callbackSecret']);
  const userId = data.userId;
  const apiBase = (data.apiBaseUrl && data.apiBaseUrl.trim()) ? data.apiBaseUrl.trim() : DEFAULT_API_BASE;
  const callbackSecret = (data.callbackSecret && data.callbackSecret.trim()) ? data.callbackSecret.trim() : null;

  if (!userId) {
    console.warn('No userId found in storage — aborting reward');
    return { ok: false, error: 'No userId in extension storage' };
  }

  // طابع المصدر: نضمن قيمة معقولة
  const source = sourceFromContent || 'YouTube';
  const watched = (typeof watchedSeconds !== 'undefined' && watchedSeconds !== null) ? String(watchedSeconds) : '0';

  // بناء payload للتوقيع: userId:videoId:watched_seconds:source
  let signature = null;
  if (callbackSecret) {
    try {
      const payload = `${userId}:${videoId}:${watched}:${source}`;
      signature = await computeHmacSHA256Hex(payload, callbackSecret);
    } catch (e) {
      // إذا فشل توليد التوقيع نتابع بدون signature لكن نبلّغ في اللوج
      console.error('Failed to compute HMAC signature in extension:', e);
      signature = null;
    }
  }

  // بناء الـ URL (GET) مع الباراميترات — نرسل signature فقط إن وُجد
  const params = new URLSearchParams({
    user_id: userId,
    video_id: videoId,
    watched_seconds: watched,
    source: source
  });
  if (signature) params.append('signature', signature);

  const callbackUrl = new URL('/video-callback', apiBase).toString() + '?' + params.toString();

  try {
    const res = await fetch(callbackUrl, {
      method: 'GET',
      // يمكنك إضافة رؤوس هنا إذا رغبت (مثل Authorization) لكن خادمك يجب أن يتعامل معها
      // headers: { 'X-Requested-With': 'TasksRewardBot-Extension' }
    });

    if (res.ok) {
      // حاول قراءة نص الاستجابة أو JSON إن أردت
      let bodyText = null;
      try { bodyText = await res.text(); } catch (e) { bodyText = ''; }

      // إشعار للمستخدم (نجاح)
      try {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon48.png',
          title: 'TasksRewardBot',
          message: `💰 تم إرسال نتيجة المشاهدة (video=${videoId}) — مصدر: ${source}`
        });
      } catch (e) {
        // تجاهل أخطاء الإشعارات
      }

      console.log('rewardUser: success', { videoId, watched, source, url: callbackUrl, bodyText });
      return { ok: true, status: res.status, body: bodyText };
    } else {
      // فشل من السيرفر: حاول قراءة جسم الرد
      let bodyText = '';
      try { bodyText = await res.text(); } catch (e) { bodyText = '<unreadable>'; }
      console.error('Server returned non-OK response', res.status, bodyText);

      // إشعار فشل مختصر
      try {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon48.png',
          title: 'TasksRewardBot — خطأ من السيرفر',
          message: `استجابة ${res.status}: ${bodyText.substring(0,120)}`
        });
      } catch (e) {}

      return { ok: false, status: res.status, body: bodyText };
    }
  } catch (err) {
    console.error('TasksRewardBot Error while calling server:', err);
    try {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon48.png',
        title: 'TasksRewardBot — خطأ بالشبكة',
        message: `فشل الاتصال بالسيرفر: ${err.message}`
      });
    } catch (e) {}
    return { ok: false, error: String(err) };
  }
}
