'use strict';

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

// تحديث حالة الـ Popup
function updatePopupStatus(status, balance = null, message = '', type = 'info') {
  chrome.runtime.sendMessage({
    action: 'update_status',
    status,
    balance,
    message,
    type
  });
}

// جلب فيديو مؤهل من السيرفر
async function fetchNextVideo(userId) {
  const res = await fetch(`${API_BASE}/api/public-videos?user_id=${encodeURIComponent(userId)}`);
  if (!res.ok) throw new Error('فشل جلب الفيديو من السيرفر');
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('لا توجد فيديوهات متاحة للمشاهدة');
  }
  return data[0]; // خذ أول فيديو
}

// فتح بحث يوتيوب
async function openYouTubeSearch(keywords) {
  const query = encodeURIComponent(keywords.join(' '));
  const url = `https://www.youtube.com/results?search_query=${query}`;
  await chrome.tabs.create({ url, active: false });
}

// محاولة فتح رابط بديل (Fallback)
async function tryFallback(videoId, tabId) {
  const stored = await storageGet(`redirect_history_${videoId}`);
  const history = stored[`redirect_history_${videoId}`] || [];

  const nextSource = EXTERNAL_SOURCES.find(s => !history.includes(s.name));
  if (!nextSource) return false;

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
  return true;
}

// معالجة تقرير المشاهدة
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

  updatePopupStatus('Running', balance, `✅ تم إضافة المكافأة (${data.reward || '—'})`, 'success');
}

// بدء التشغيل التلقائي
async function startAutomation() {
  const cfg = await storageGet(['userId']);
  const userId = cfg.userId;

  if (!userId) {
    updatePopupStatus('Idle', null, '❌ يرجى إدخال User ID أولاً', 'error');
    return;
  }

  await storageSet({ automationRunning: true });
  updatePopupStatus('Running', null, '🔄 جارٍ جلب الفيديو...', 'info');

  try {
    const video = await fetchNextVideo(userId);
    const keywords = video.keywords || [video.video_id];
    await openYouTubeSearch(keywords);
    updatePopupStatus('Running', null, `🔍 بدأ البحث عن: ${keywords.join(' ')}`, 'success');
  } catch (err) {
    console.error('خطأ في التشغيل:', err);
    updatePopupStatus('Idle', null, `❌ ${err.message}`, 'error');
    await storageSet({ automationRunning: false });
  }
}

// مستمع الرسائل
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'start_automation') {
    startAutomation().then(() => sendResponse({ ok: true })).catch(e => {
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

  if (message.action === 'update_status') {
    // هذا مخصص للـ popup فقط
  }
});
