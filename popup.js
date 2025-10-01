document.addEventListener('DOMContentLoaded', () => {
  const userIdDisplay = document.getElementById('userIdDisplay');
  const balanceDisplay = document.getElementById('balanceDisplay');
  const statusDisplay = document.getElementById('statusDisplay');
  const startBtn = document.getElementById('startBtn');
  const messageDiv = document.getElementById('message');
  const userIdInput = document.getElementById('userIdInput');
  const saveBtn = document.getElementById('saveBtn');
  const settingsMessage = document.getElementById('settingsMessage');

  // تحميل الحالة
  function loadState() {
    chrome.storage.local.get(['userId', 'balance', 'automationRunning', 'workerTabId'], (data) => {
      userIdDisplay.textContent = data.userId || '-';
      balanceDisplay.textContent = (data.balance || 0).toFixed(2);
      const isRunning = data.automationRunning === true;
      statusDisplay.textContent = isRunning ? 'Running' : 'Idle';
      startBtn.textContent = isRunning ? 'Stop Worker' : 'Start Worker';
    });
  }

  loadState();

  // الاستماع للتغييرات
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.automationRunning || changes.userId || changes.balance)) {
      loadState();
    }
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
      settingsMessage.style.display = 'block';
      return;
    }
    chrome.storage.local.set({ userId }, () => {
      userIdDisplay.textContent = userId;
      settingsMessage.textContent = '✅ تم الحفظ!';
      settingsMessage.style.backgroundColor = '#55aa55';
      settingsMessage.style.display = 'block';
      setTimeout(() => { settingsMessage.style.display = 'none'; }, 3000);
    });
  });

  // بدء/إيقاف التشغيل
  startBtn.addEventListener('click', () => {
    chrome.storage.local.get(['automationRunning', 'userId', 'workerTabId'], (data) => {
      if (data.automationRunning) {
        // إيقاف
        chrome.runtime.sendMessage({ action: 'stop_automation', tabId: data.workerTabId });
      } else {
        // بدء
        if (!data.userId) {
          messageDiv.textContent = '❌ أدخل User ID أولًا';
          messageDiv.style.backgroundColor = '#ff5555';
          return;
        }
        chrome.runtime.sendMessage({ action: 'start_automation', userId: data.userId });
      }
    });
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'show_message') {
      messageDiv.textContent = msg.message;
      messageDiv.style.backgroundColor = msg.type === 'error' ? '#ff5555' : '#55ff55';
    }
  });
});
