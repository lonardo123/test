document.addEventListener('DOMContentLoaded', () => {
  const userIdDisplay = document.getElementById('userIdDisplay');
  const balanceDisplay = document.getElementById('balanceDisplay');
  const statusDisplay = document.getElementById('statusDisplay');
  const startBtn = document.getElementById('startBtn');
  const messageDiv = document.getElementById('message');
  const tabs = document.querySelectorAll('.tab');
  const contents = document.querySelectorAll('.content');
  const userIdInput = document.getElementById('userIdInput');
  const saveBtn = document.getElementById('saveBtn');

  // Load user data
  chrome.storage.local.get(['userId', 'balance', 'automationRunning'], (data) => {
    userIdDisplay.textContent = data.userId || '-';
    balanceDisplay.textContent = (data.balance || 0).toFixed(2);
    statusDisplay.textContent = data.automationRunning ? 'Running' : 'Idle';
    userIdInput.value = data.userId || '';
  });

  // Tab switching
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.tab).classList.add('active');
    });
  });

  // Save settings
  saveBtn.addEventListener('click', () => {
    const userId = userIdInput.value.trim();
    if (!userId) {
      showMessage('Please enter User ID', 'error');
      return;
    }
    chrome.storage.local.set({ userId }, () => {
      showMessage('Settings saved!', 'success');
      userIdDisplay.textContent = userId;
    });
  });

  // Start/Stop worker
  startBtn.addEventListener('click', () => {
    chrome.storage.local.get(['automationRunning'], (data) => {
      if (data.automationRunning) {
        chrome.storage.local.set({ automationRunning: false }, () => {
          startBtn.textContent = 'Start Worker';
          statusDisplay.textContent = 'Idle';
          showMessage('Worker stopped.', 'info');
        });
      } else {
        chrome.storage.local.get(['userId'], (data) => {
          if (!data.userId) {
            showMessage('Please set User ID in Settings first.', 'error');
            return;
          }
          chrome.runtime.sendMessage({ action: 'start_automation' }, (response) => {
            if (response?.ok) {
              startBtn.textContent = 'Stop Worker';
              statusDisplay.textContent = 'Running';
              showMessage('Worker started!', 'success');
            } else {
              showMessage('Failed to start worker: ' + (response?.error || 'Unknown error'), 'error');
            }
          });
        });
      }
    });
  });

  // Show message
  function showMessage(text, type) {
    messageDiv.textContent = text;
    messageDiv.style.backgroundColor = type === 'error' ? '#ff5555' : type === 'success' ? '#55ff55' : '#5555ff';
  }

  // Listen for updates from background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'update_status') {
      statusDisplay.textContent = message.status;
      if (message.balance !== undefined) {
        balanceDisplay.textContent = message.balance.toFixed(2);
      }
      if (message.message) {
        showMessage(message.message, message.type || 'info');
      }
    }
  });
});
