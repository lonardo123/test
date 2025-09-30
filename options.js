document.addEventListener('DOMContentLoaded', () => {
  const userId = document.getElementById('userId');

  chrome.storage.local.get(['userId'], (data) => {
    userId.value = data.userId || '';
  });

  document.getElementById('save').addEventListener('click', () => {
    chrome.storage.local.set({
      userId: userId.value.trim()
    }, () => {
      alert('✅ تم الحفظ بنجاح!');
    });
  });

  document.getElementById('start').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'start_automation' });
    alert('✅ بدأ التشغيل التلقائي!');
  });

  document.getElementById('stop').addEventListener('click', () => {
    chrome.storage.local.set({ automationRunning: false }, () => {
      alert('⏹️ تم إيقاف التشغيل.');
    });
  });
});
