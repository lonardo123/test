'use strict';
function setIcon(state) {
  const iconPath = state === 'running' ? {
    16: 'icons/icon16-pause.png',
    48: 'icons/icon48-pause.png',
    128: 'icons/icon128-pause.png'
  } : {
    16: 'icons/icon16.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png'
  };
  chrome.action.setIcon({ path: iconPath });
}

// استدعاء الدالة عند بدء أو إيقاف التشغيل
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.automationRunning) {
    setIcon(changes.automationRunning.newValue ? 'running' : 'idle');
  }
});
const EXTERNAL_SOURCES = [
  { name: 'Facebook', prefix: 'https://l.facebook.com/l.php?u=' },
  { name: 'Instagram', prefix: 'https://l.instagram.com/?u=' },
  { name: 'Google', prefix: 'https://www.google.com/url?q=' }
];

const API_BASE = 'https://perceptive-victory-production.up.railway.app';

function storageGet(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}
function storageSet(obj) {
  return new Promise(resolve => chrome.storage.local.set(obj, resolve));
}

// جلب فيديو من السيرفر (تُستخدم داخل worker.html)
async function fetchNextVideo(userId) {
  const url = `${API_BASE}/api/public-videos?user_id=${encodeURIComponent(userId)}`;
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) throw new Error(`السيرفر أجاب بحالة ${res.status}`);
  if (!text.trim()) throw new Error('الرد فارغ');
  let data;
  try { data = JSON.parse(text); } catch (e) { throw new Error('الرد ليس JSON صالحًا'); }
  if (!Array.isArray(data) || data.length === 0) throw new Error('لا توجد فيديوهات متاحة');
  return data[0];
}

// محاولة فتح مصدر بديل
async function tryFallback(videoId, tabId) {
  const stored = await storageGet(`redirect_history_${videoId}`);
  const history = stored[`redirect_history_${videoId}`] || [];
  const nextSource = EXTERNAL_SOURCES.find(s => !history.includes(s.name));
  if (!nextSource) return false;
  const ytUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&__source=${encodeURIComponent(nextSource.name)}`;
  const wrappedUrl = `${nextSource.prefix}${encodeURIComponent(ytUrl)}`;
  await storageSet({ [`redirect_history_${videoId}`]: [...history, nextSource.name] });
  if (tabId) {
    await chrome.tabs.update(tabId, { url: wrappedUrl });
  } else {
    await chrome.tabs.create({ url: wrappedUrl });
  }
  return true;
}

// إرسال تقرير المشاهدة
async function handleReport({ videoId, watchedSeconds, source }) {
  const cfg = await storageGet(['userId']);
  const userId = cfg.userId;
  if (!userId) throw new Error('User ID غير متوفر');
  const params = new URLSearchParams({
    user_id: userId,
    video_id: videoId,
    watched_seconds: String(Math.floor(watchedSeconds || 0)),
    source: source || 'YouTube'
  });
  const url = `${API_BASE}/video-callback?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`السيرفر رفض الطلب: ${res.status}`);
  const data = await res.json().catch(() => ({}));
  let balance = null;
  if (typeof data.reward !== 'undefined') {
    const current = (await storageGet('balance')).balance || 0;
    balance = current + data.reward;
    await storageSet({ balance });
  }
  chrome.runtime.sendMessage({ action: 'update_balance', balance });
}

// بدء التشغيل: فتح worker.html مع user_id
async function startAutomation(userId) {
  if (!userId || userId.trim() === '') {
    throw new Error('User ID غير محدد');
  }
  // حفظ userId للاستخدام لاحقًا (مثل في handleReport)
  await storageSet({ userId, automationRunning: true });
  const url = chrome.runtime.getURL('worker.html') + `?user_id=${encodeURIComponent(userId)}`;
  await chrome.tabs.create({ url, active: true });
}

// مستمع الرسائل
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'start_automation') {
    startAutomation(message.userId).then(() => sendResponse({ ok: true })).catch(e => {
      sendResponse({ ok: false, error: e.message });
    });
    return true;
  }

  if (message.action === 'report_view') {
    handleReport(message).then(() => sendResponse({ ok: true })).catch(e => {
      sendResponse({ ok: false, error: e.message });
    });
    return true;
  }

  if (message.action === 'try_fallback_redirect') {
    tryFallback(message.videoId, sender.tab?.id).then(ok => {
      sendResponse({ ok });
    });
    return true;
  }
});
