document.addEventListener('DOMContentLoaded', () => {
  const userIdInput = document.getElementById('userIdInput');
  const saveBtn = document.getElementById('saveBtn');
  const settingsMessage = document.getElementById('settingsMessage');

  // تحميل User ID من التخزين وعرضه
  chrome.storage.local.get(['userId'], (data) => {
    userIdInput.value = data.userId || '';
  });

  // حفظ User ID عند الضغط على الزر
  saveBtn.addEventListener('click', () => {
    const userId = userIdInput.value.trim();
    if (!userId) {
      settingsMessage.textContent = '❌ يرجى إدخال User ID';
      settingsMessage.style.backgroundColor = '#ff5555';
      settingsMessage.style.display = 'block';
      return;
    }

    chrome.storage.local.set({ userId }, () => {
      settingsMessage.textContent = '✅ تم الحفظ!';
      settingsMessage.style.backgroundColor = '#55aa55';
      settingsMessage.style.display = 'block';
      setTimeout(() => { settingsMessage.style.display = 'none'; }, 3000);
    });
  });
});
