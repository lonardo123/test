// options.js
document.addEventListener('DOMContentLoaded', async () => {
  const apiInput = document.getElementById('apiBase');
  const userInput = document.getElementById('userId');
  const secretInput = document.getElementById('callbackSecret');
  const status = document.getElementById('status');
  const saveBtn = document.getElementById('saveBtn');
  const testPublic = document.getElementById('testPublic');
  const testCallback = document.getElementById('testCallback');

  // تحميل القيم الحالية
  chrome.storage.local.get(['apiBaseUrl', 'userId', 'callbackSecret'], (data) => {
    apiInput.value = data.apiBaseUrl || 'https://perceptive-victory-production.up.railway.app';
    userInput.value = data.userId || '';
    secretInput.value = data.callbackSecret || '';
  });

  saveBtn.addEventListener('click', () => {
    const apiBaseUrl = apiInput.value.trim();
    const userId = userInput.value.trim();
    const callbackSecret = secretInput.value.trim();
    chrome.storage.local.set({ apiBaseUrl, userId, callbackSecret }, () => {
      status.textContent = 'تم الحفظ.';
      setTimeout(()=> status.textContent = '', 3000);
    });
  });

  testPublic.addEventListener('click', async () => {
    const apiBaseUrl = apiInput.value.trim() || 'https://perceptive-victory-production.up.railway.app';
    try {
      const res = await fetch(new URL('/api/public-videos', apiBaseUrl).toString());
      const data = await res.json();
      status.textContent = 'نجح: /api/public-videos — نتائج: ' + (Array.isArray(data) ? data.length + ' فيديو' : JSON.stringify(data));
    } catch (e) {
      status.textContent = 'فشل اختبار /api/public-videos: ' + e.message;
    }
  });

  testCallback.addEventListener('click', async () => {
    const apiBaseUrl = apiInput.value.trim() || 'https://perceptive-victory-production.up.railway.app';
    const userId = userInput.value.trim();
    if (!userId) {
      status.textContent = 'أدخل User ID لاختبار callback';
      return;
    }
    // اختبار بسيط: نرسل طلب GET لـ /video-callback مع video_id وهمي
    const params = new URLSearchParams({ user_id: userId, video_id: 'TEST_VIDEO_ID', watched_seconds: '10', source: 'YouTube' });
    try {
      const res = await fetch(new URL('/video-callback', apiBaseUrl).toString() + '?' + params.toString());
      const txt = await res.text();
      status.textContent = `استجابة /video-callback: (${res.status}) ${txt}`;
    } catch (e) {
      status.textContent = 'فشل اختبار /video-callback: ' + e.message;
    }
  });
});
