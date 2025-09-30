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

// دالة آمنة لجلب الفيديو مع تسجيل مفصل
async function fetchNextVideo(userId) {
  const url = `${API_BASE}/api/public-videos?user_id=${encodeURIComponent(userId)}`;
  console.log('🔍 [TasksRewardBot] جارٍ طلب الفيديو من:', url);

  const res = await fetch(url);
  const textResponse = await res.text();
  console.log('📄 [TasksRewardBot] نص الرد من السيرفر:', textResponse);

  if (!res.ok) {
    throw new Error(`السيرفر أجاب بحالة ${res.status}`);
  }

  if (!textResponse.trim()) {
    throw new Error('الرد من السيرفر فارغ');
  }

  let data;
  try {
    data = JSON.parse(textResponse);
  } catch (e) {
    console.error('❌ [TasksRewardBot] فشل تحليل JSON:', e.message);
    throw new Error('الرد ليس JSON صالحًا');
  }

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('لا توجد فيديوهات متاحة');
  }

  console.log('✅ [TasksRewardBot] تم جلب الفيديو:', data[0]);
  return data[0];
}

async function openYouTubeSearch(keywords) {
  const query = encodeURIComponent(keywords.join(' '));
  const url = `https://www.youtube.com/results?search_query=${query}`;
  console.log('🔍 [TasksRewardBot] فتح بحث يوتيوب:', url);
  await chrome.tabs.create({ url, active: false });
}

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

async function startAutomation() {
  const cfg = await storageGet(['userId']);
  const userId = cfg.userId;

  if (!userId) {
    console.warn('⚠️ [TasksRewardBot] User ID غير محدد');
    chrome.runtime.sendMessage({ action: 'show_message', message: '❌ User ID مطلوب!', type: 'error' });
    return;
  }

  console.log('🚀 [TasksRewardBot] بدء التشغيل لـ User ID:', userId);
  await storageSet({ automationRunning: true });
  chrome.runtime.sendMessage({ action: 'update_status', status: 'Running' });

  try {
    const video = await fetchNextVideo(userId);

    // === استخراج معرّف الفيديو بأمان ===
    let videoId = null;

    if (video.video_id && typeof video.video_id === 'string' && video.video_id.trim() !== '') {
      videoId = video.video_id.trim();
    } else if (video.video_url && typeof video.video_url === 'string') {
      const match = video.video_url.match(/[?&]v=([^&#]*)/);
      if (match && match[1]) {
        videoId = match[1];
      }
    }

    if (!videoId) {
      throw new Error('لا يمكن تحديد معرّف الفيديو (video_id)');
    }

    const keywords = [videoId];
    console.log('🔍 [TasksRewardBot] الكلمات المفتاحية:', keywords);

    await openYouTubeSearch(keywords);
    chrome.runtime.sendMessage({ action: 'show_message', message: `✅ بدأ البحث عن الفيديو`, type: 'success' });
  } catch (err) {
    console.error('🛑 [TasksRewardBot] فشل التشغيل:', err.message);
    chrome.runtime.sendMessage({ action: 'show_message', message: `❌ ${err.message}`, type: 'error' });
    await storageSet({ automationRunning: false });
    chrome.runtime.sendMessage({ action: 'update_status', status: 'Idle' });
  }
}

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
});
