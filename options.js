document.addEventListener('DOMContentLoaded', () => {
  const userId = document.getElementById('userId');
  const apiBaseUrl = document.getElementById('apiBaseUrl');
  const callbackSecret = document.getElementById('callbackSecret');

  chrome.storage.local.get(['userId', 'apiBaseUrl', 'callbackSecret'], (data) => {
    userId.value = data.userId || '';
    apiBaseUrl.value = data.apiBaseUrl || 'https://perceptive-victory-production.up.railway.app';
    callbackSecret.value = data.callbackSecret || '';
  });

  document.getElementById('save').addEventListener('click', () => {
    chrome.storage.local.set({
      userId: userId.value.trim(),
      apiBaseUrl: apiBaseUrl.value.trim(),
      callbackSecret: callbackSecret.value.trim()
    }, () => {
      alert('✅ تم الحفظ بنجاح!');
    });
  });

  document.getElementById('start').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'start_automation' }, (response) => {
      if (response?.ok) {
        alert('✅ بدأ التشغيل التلقائي!');
      } else {
        alert('❌ خطأ: ' + (response?.error || 'فشل في البدء'));
      }
    });
  });

  document.getElementById('stop').addEventListener('click', () => {
    chrome.storage.local.set({ automationRunning: false }, () => {
      alert('⏹️ تم إيقاف التشغيل.');
    });
  });
});
