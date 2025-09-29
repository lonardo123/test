// background.js — النسخة المعدلة (service worker)
// يقوم بقراءة apiBaseUrl من التخزين ويستخدمه عند استدعاء endpoints
'use strict';

const EXTERNAL_SOURCES = [
  { name: 'Facebook', prefix: 'https://l.facebook.com/l.php?u=' },
  { name: 'Instagram', prefix: 'https://l.instagram.com/?u=' },
  { name: 'Google', prefix: 'https://www.google.com/url?q=' }
];

// مساعدة: الحصول على config من chrome.storage
function storageGet(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}
function storageSet(obj) {
  return new Promise(resolve => chrome.storage.local.set(obj, resolve));
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'rewardUser') {
    rewardUser(request.videoId, request.watchedSeconds, request.source, sender).then(() => {
      try { sendResponse({ ok: true }); } catch (e) {}
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

async function handleRequestRedirect(videoId, tabId) {
  if (!tabId) throw new Error('No tab id provided');
  const stored = await storageGet(`redirect_history_${videoId}`);
  const history = stored[`redirect_history_${videoId}`] || [];

  // اقرأ apiBaseUrl إن وُجد
  const cfg = await storageGet(['apiBaseUrl']);
  const apiBase = cfg.apiBaseUrl || 'http://localhost:3000';

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

async function rewardUser(videoId, watchedSeconds, sourceFromContent, sender) {
  const data = await storageGet(['userId', 'apiBaseUrl']);
  const userId = data.userId;
  const apiBase = data.apiBaseUrl || 'http://localhost:3000';

  if (!userId) {
    console.warn('No userId found in storage — aborting reward');
    return;
  }

  // if server expects extra params like watched_seconds or source, we'll send them as query params
  const params = new URLSearchParams({
    user_id: userId,
    video_id: videoId,
    watched_seconds: String(watchedSeconds || 0),
    source: sourceFromContent || 'YouTube'
  });

  const callbackUrl = new URL('/video-callback', apiBase).toString() + '?' + params.toString();

  try {
    const res = await fetch(callbackUrl);
    if (res.ok) {
      try {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon48.png',
          title: 'TasksRewardBot',
          message: `💰 تم إضافة رصيدك من ${sourceFromContent || 'YouTube'}!`
        });
      } catch (e) {
        console.warn('Notification failed', e);
      }
    } else {
      console.error('Server returned non-OK response', res.status);
      // حاول قراءة JSON إن أمكن
      try {
        const txt = await res.text();
        console.error('Response body:', txt);
      } catch (e) {}
    }
  } catch (err) {
    console.error('TasksRewardBot Error while calling server:', err);
  }
}