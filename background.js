// background.js — النسخة الكاملة
'use strict';

const EXTERNAL_SOURCES = [
  { name: 'Facebook', prefix: 'https://l.facebook.com/l.php?u=' },
  { name: 'Instagram', prefix: 'https://l.instagram.com/?u=' },
  { name: 'Google', prefix: 'https://www.google.com/url?q=' }
];

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'rewardUser') {
    rewardUser(request.videoId, request.watchedSeconds, request.source, sender).then(() => {
      sendResponse({ ok: true });
    }).catch(err => {
      console.error('rewardUser error', err);
      sendResponse({ ok: false, error: String(err) });
    });
    return true;
  }

  if (request.action === 'requestRedirect') {
    handleRequestRedirect(request.videoId, sender.tab ? sender.tab.id : null).then(result => {
      sendResponse({ ok: true, detail: result });
    }).catch(err => {
      console.error('requestRedirect error', err);
      sendResponse({ ok: false, error: String(err) });
    });
    return true;
  }
});

async function handleRequestRedirect(videoId, tabId) {
  if (!tabId) throw new Error('No tab id provided');
  const stored = await new Promise(res => chrome.storage.local.get(`redirect_history_${videoId}`, res));
  const history = stored[`redirect_history_${videoId}`] || [];
  const next = EXTERNAL_SOURCES.find(s => history.indexOf(s.name) === -1);
  if (!next) return { ok: false, message: 'No more alternative sources' };
  const ytUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&__source=${encodeURIComponent(next.name)}`;
  const wrapped = `${next.prefix}${encodeURIComponent(ytUrl)}`;
  await new Promise(res => chrome.storage.local.set({
    [`redirect_history_${videoId}`]: [...history, next.name],
    [`video_source_${videoId}`]: next.name
  }, res));
  await new Promise(res => chrome.tabs.update(tabId, { url: wrapped }, res));
  return { ok: true, opened: wrapped, source: next.name };
}

async function rewardUser(videoId, watchedSeconds, sourceFromContent, sender) {
  const data = await new Promise(res => chrome.storage.local.get(['userId'], res));
  const userId = data.userId;
  if (!userId) return;
  let source = sourceFromContent;
  if (!source) {
    const s = await new Promise(res => chrome.storage.local.get(`video_source_${videoId}`, res));
    source = s[`video_source_${videoId}`] || 'YouTube';
  }
  try {
    const callbackUrl = `https://perceptive-victory-production.up.railway.app/video-callback?user_id=${encodeURIComponent(userId)}&video_id=${encodeURIComponent(videoId)}&watched_seconds=${encodeURIComponent(watchedSeconds)}&source=${encodeURIComponent(source)}`;
    const res = await fetch(callbackUrl);
    if (res.ok) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon48.png',
        title: 'TasksRewardBot',
        message: `💰 تم إضافة رصيدك من ${source}!`
      });
    } else {
      console.error('Server returned', res.status);
    }
  } catch (err) {
    console.error('TasksRewardBot Error:', err);
  }
}