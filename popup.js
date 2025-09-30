document.addEventListener('DOMContentLoaded', () => {
  const userIdDisplay = document.getElementById('userIdDisplay');
  const balanceDisplay = document.getElementById('balanceDisplay');
  const statusDisplay = document.getElementById('statusDisplay');
  const startBtn = document.getElementById('startBtn');
  const messageDiv = document.getElementById('message');
  const userIdInput = document.getElementById('userIdInput');

  chrome.storage.local.get(['userId', 'balance', 'automationRunning'], (data) => {
    userIdDisplay.textContent = data.userId || '-';
    balanceDisplay.textContent = (data.balance || 0).toFixed(2);
    statusDisplay.textContent = data.automationRunning ? 'Running' : 'Idle';
    userIdInput.value = data.userId || '';
  });

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.tab).classList.add('active');
    });
  });

  document.getElementById('saveBtn').addEventListener('click', () => {
  const userId = userIdInput.value.trim();
  const messageEl = document.getElementById('settingsMessage');

  if (!userId) {
    messageEl.textContent = '❌ يرجى إدخال User ID';
    messageEl.style.backgroundColor = '#ff5555';
    messageEl.style.color = 'white';
    messageEl.style.display = 'block';
    return;
  }

  chrome.storage.local.set({ userId }, () => {
    // تحديث العرض في تبويب Main
    document.getElementById('userIdDisplay').textContent = userId;
    
    // عرض رسالة النجاح
    messageEl.textContent = '✅ تم الحفظ بنجاح!';
    messageEl.style.backgroundColor = '#55aa55';
    messageEl.style.color = 'white';
    messageEl.style.display = 'block';

    // إخفاء الرسالة تلقائيًا بعد 3 ثوانٍ
    setTimeout(() => {
      messageEl.style.display = 'none';
    }, 3000);
  });
});

  startBtn.addEventListener('click', () => {
    chrome.storage.local.get(['automationRunning'], (data) => {
      if (data.automationRunning) {
        chrome.storage.local.set({ automationRunning: false }, () => {
          startBtn.textContent = 'Start Worker';
          statusDisplay.textContent = 'Idle';
          messageDiv.textContent = 'تم الإيقاف.';
        });
      } else {
        chrome.storage.local.get(['userId'], (data) => {
          if (!data.userId) return alert('أدخل User ID أولًا');
          chrome.runtime.sendMessage({ action: 'start_automation' }, (response) => {
            if (response?.ok) {
              startBtn.textContent = 'Stop Worker';
              statusDisplay.textContent = 'Running';
              messageDiv.textContent = '✅ بدأ التشغيل!';
            } else {
              alert('خطأ: ' + (response?.error || 'غير معروف'));
            }
          });
        });
      }
    });
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'update_status') {
      statusDisplay.textContent = msg.status;
    }
    if (msg.action === 'update_balance') {
      balanceDisplay.textContent = (msg.balance || 0).toFixed(2);
    }
    if (msg.action === 'show_message') {
      messageDiv.textContent = msg.message;
      messageDiv.style.backgroundColor = msg.type === 'error' ? '#ff5555' : '#55ff55';
    }
  });
});
