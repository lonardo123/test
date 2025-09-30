'use strict';

const EXTERNAL_SOURCES = [
  { name: 'Facebook', prefix: 'https://l.facebook.com/l.php?u=' },
  { name: 'Instagram', prefix: 'https://l.instagram.com/?u=' },
  { name: 'Google', prefix: 'https://www.google.com/url?q=' }
];

const DEFAULT_API_BASE = 'https://perceptive-victory-production.up.railway.app';

function storageGet(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}
function storageSet(obj) {
  return new Promise(resolve => chrome.storage.local.set(obj, resolve));
}

function buf2hex(buffer) {
  return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16)).slice(-2)).join('');
}

async function computeHmacHex(secret, payload) {
  const enc = new TextEncoder();
  const keyData = enc.encode(secret);
  const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(payload));
  return buf2hex(sig);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'report_view') {
    handleReport(message).then(() => sendResponse({ ok: true })).catch(err => {
      console.error(err);
      sendResponse({ ok: false, error: String(err) });
    });
    return true;
  }

  if (message.action === 'start_automation') {
    startAutomation().then(() => sendResponse({ ok: true })).catch(e => {
      console.error(e);
      sendResponse({ ok: false, error: String(e) });
    });
    return true;
  }

  if (message.action === 'try_fallback_redirect') {
    tryFallbackRedirect(message.videoId, message.keywords, sender.tab?.id).then(result => {
      sendResponse(result);
    }).catch(err => {
      sendResponse({ ok: false, error: String(err) });
    });
    return true;
  }
});

async function startAutomation() {
  await storageSet({ automationRunning: true });
  // ابدأ بتشغيل أول فيديو (يجب أن يُطلب من السيرفر لاحقًا، لكن هنا نبدأ بتشغيل آلية البحث)
  const cfg = await storageGet(['userId']);
  if (!cfg.userId) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'TasksRewardBot',
      message: 'يرجى إدخال معرّف المستخدم في الإعدادات أولاً.'
    });
    return;
  }
  // سيتم تشغيل الفيديو الأول عبر popup أو آلية خارجية
}

async function handleReport({ videoId, watchedSeconds, source }) {
 const cfg = await storageGet(['userId']);
const userId = cfg.userId;
const apiBase = 'https://perceptive-victory-production.up.railway.app'; // ثابت
const secret = ''; // أو ضع القيمة الفعلية إذا كنت تستخدم HMAC داخليًا

  if (!userId) throw new Error('لم يتم تعيين معرّف المستخدم');

  const params = new URLSearchParams({
    user_id: userId,
    video_id: videoId,
    watched_seconds: String(Math.floor(watchedSeconds || 0)),
    source: source || 'YouTube'
  });

  if (secret) {
    const payload = `${userId}:${videoId}:${Math.floor(watchedSeconds || 0)}:${source || 'YouTube'}`;
    const signature = await computeHmacHex(secret, payload);
    params.append('signature', signature);
  }

  const url = `${apiBase.replace(/\/+$/, '')}/video-callback?${params.toString()}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`خطأ من السيرفر: ${res.status} ${txt}`);
    }
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'TasksRewardBot',
      message: `✅ تم إرسال مشاهدة الفيديو ${videoId}\nالمصدر: ${source}`
    });
  } catch (err) {
    console.error('فشل إرسال التقرير:', err);
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'TasksRewardBot - خطأ',
      message: `فشل إرسال المشاهدة: ${err.message}`
    });
    throw err;
  }
}

async function tryFallbackRedirect(videoId, keywords, tabId) {
  const stored = await storageGet(`redirect_history_${videoId}`);
  const history = stored[`redirect_history_${videoId}`] || [];

  const nextSource = EXTERNAL_SOURCES.find(s => !history.includes(s.name));
  if (!nextSource) {
    return { ok: false, message: 'لا توجد مصادر بديلة' };
  }

  const ytUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&__source=${encodeURIComponent(nextSource.name)}`;
  const wrappedUrl = `${nextSource.prefix}${encodeURIComponent(ytUrl)}`;

  await storageSet({
    [`redirect_history_${videoId}`]: [...history, nextSource.name]
  });

  if (tabId) {
    await chrome.tabs.update(tabId, { url: wrappedUrl });
  } else {
    await chrome.tabs.create({ url: wrappedUrl });
  }

  return { ok: true, source: nextSource.name };
}
