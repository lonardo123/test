'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const statusEl = document.getElementById('status');
  const userIdInput = document.getElementById('userId');

  // تحديث واجهة المستخدم حسب التخزين
  function updateUIFromStorage() {
    chrome.storage.local.get(['automationRunning', 'userId'], (data) => {
      const running = !!data.automationRunning;
      if (running) {
        statusEl.textContent = 'الحالة: جارٍ التشغيل';
        startBtn.disabled = true;
        stopBtn.disabled = false;
      } else {
        statusEl.textContent = 'الحالة: متوقف';
        startBtn.disabled = false;
        stopBtn.disabled = true;
      }
      if (data.userId) userIdInput.value = data.userId;
    });
  }

  updateUIFromStorage();

  // زر Start Worker
  startBtn.addEventListener('click', () => {
    const userId = userIdInput.value && userIdInput.value.trim();
    if (!userId) {
      alert('الرجاء إدخال User ID صحيح');
      return;
    }

    // نحفظ userId محليًا
    chrome.storage.local.set({ userId: userId });

    startBtn.disabled = true;
    statusEl.textContent = 'الحالة: جارٍ بدء worker...';

    chrome.runtime.sendMessage({ action: 'start_automation', userId: userId }, (response) => {
      if (!response) {
        statusEl.textContent = 'الحالة: لا يوجد رد من الخلفية';
        startBtn.disabled = false;
        return;
      }
      if (response.ok) {
        statusEl.textContent = 'الحالة: بدأ الاشتغال بنجاح';
        startBtn.disabled = true;
        stopBtn.disabled = false;
      } else {
        statusEl.textContent = 'خطأ: ' + (response.error || 'غير معروف');
        startBtn.disabled = false;
      }
    });
  });

  // زر Stop Worker
  stopBtn.addEventListener('click', () => {
    // نحاول جلب workerTabId من التخزين لإرساله للخلفية حتى تغلق التبويب
    chrome.storage.local.get(['workerTabId'], (data) => {
      const tabId = data.workerTabId || null;

      chrome.runtime.sendMessage({ action: 'stop_automation', tabId: tabId }, (response) => {
        if (response && response.ok) {
          statusEl.textContent = 'الحالة: توقّف التشغيل';
          startBtn.disabled = false;
          stopBtn.disabled = true;
        } else {
          statusEl.textContent = 'خطأ أثناء الإيقاف: ' + (response && response.error ? response.error : 'غير معروف');
        }
      });
    });
  });

  // تحديث الواجهة إذا تغيّر التخزين من الخلفية
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.automationRunning) {
      updateUIFromStorage();
    }
  });
});
