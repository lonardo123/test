document.addEventListener('DOMContentLoaded', () => {
  const userIdDisplay = document.getElementById('userIdDisplay');
  const balanceDisplay = document.getElementById('balanceDisplay');
  const statusDisplay = document.getElementById('statusDisplay');
  const startBtn = document.getElementById('startBtn');
  const messageDiv = document.getElementById('message');
  const userIdInput = document.getElementById('userIdInput');
  const saveBtn = document.getElementById('saveBtn');
  const settingsMessage = document.getElementById('settingsMessage');

  // تحميل القيم عند الفتح
  chrome.storage.local.get(['userId', 'balance', 'automationRunning'], (data) => {
    userIdDisplay.textContent = data.userId || '-';
    balanceDisplay.textContent = (data.balance || 0).toFixed(2);
    statusDisplay.textContent = data.automationRunning ? 'Running' : 'Idle';
    userIdInput.value = data.userId || '';
  });

  // تبديل التبويبات
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.tab).classList.add('active');
    });
  });

  // حفظ الإعدادات
  saveBtn.addEventListener('click', () => {
    const userId = userIdInput.value.trim();
    if (!userId) {
      settingsMessage.textContent = '❌ يرجى إدخال User ID';
      settingsMessage.style.backgroundColor = '#ff5555';
      settingsMessage.style.color = 'white';
      settingsMessage.style.display = 'block';
      return;
    }
    chrome.storage.local.set({ userId }, () => {
      userIdDisplay.textContent = userId;
      settingsMessage.textContent = '✅ تم الحفظ بنجاح!';
      settingsMessage.style.backgroundColor = '#55aa55';
      settingsMessage.style.color = 'white';
      settingsMessage.style.display = 'block';
      setTimeout(() => { settingsMessage.style.display = 'none'; }, 3000);
    });
  });

  // بدء/إيقاف التشغيل
  startBtn.addEventListener('click', () => {
    chrome.storage.local.get(['automationRunning', 'userId'], (data) => {
      if (data.automationRunning) {
        // إيقاف
        chrome.storage.local.set({ automationRunning: false }, () => {
          startBtn.textContent = 'Start Worker';
          statusDisplay.textContent = 'Idle';
          messageDiv.textContent = 'تم الإيقاف.';
        });
      } else {
        // بدء
        if (!data.userId) {
          messageDiv.textContent = '❌ أدخل User ID أولًا';
          messageDiv.style.backgroundColor = '#ff5555';
          return;
        }
        chrome.runtime.sendMessage({ action: 'start_automation', userId: data.userId }, (response) => {
          if (response?.ok) {
            startBtn.textContent = 'Stop Worker';
            statusDisplay.textContent = 'Running';
            messageDiv.textContent = '✅ بدأ التشغيل!';
            messageDiv.style.backgroundColor = '#55ff55';
          } else {
            messageDiv.textContent = `❌ ${response?.error || 'فشل البدء'}`;
            messageDiv.style.backgroundColor = '#ff5555';
          }
        });
      }
    });
  });

  // تحديث من الخلفية
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'update_status') {
      statusDisplay.textContent = msg.status;
    }
    if (msg.action === 'update_balance') {
      balanceDisplay.textContent = (msg.balance || 0).toFixed(2);
    }
  });
});
