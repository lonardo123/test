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
});
