'use strict';

(function() {
  // نضمن أن init تعمل سواء كانت الصفحة محملة أم لا
  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  ready(init);

  function init() {
    // الحصول على العناصر
    const userIdDisplay = document.getElementById('userIdDisplay');
    const balanceDisplay = document.getElementById('balanceDisplay');
    const statusDisplay = document.getElementById('statusDisplay');
    const startBtn = document.getElementById('startBtn');
    const messageDiv = document.getElementById('message');
    const userIdInput = document.getElementById('userIdInput');
    const saveBtn = document.getElementById('saveBtn');
    const settingsMessage = document.getElementById('settingsMessage');
    const tabs = document.querySelectorAll('.tab');

    // تحقق من وجود العناصر الأساسية وإعلام المستخدم لو مفيش
    if (!userIdDisplay || !balanceDisplay || !statusDisplay || !startBtn || !messageDiv || !userIdInput || !saveBtn || !settingsMessage) {
      console.error('Popup UI: عنصر(عناصر) مفقودة في الـ DOM');
      if (messageDiv) {
        messageDiv.textContent = 'خطأ داخلي: عناصر الواجهة مفقودة';
        messageDiv.style.backgroundColor = '#ff5555';
      }
      return;
    }

    // دوال عرض رسائل
    function showMainMessage(text, type) {
      messageDiv.textContent = text || '';
      if (type === 'error') {
        messageDiv.style.backgroundColor = '#ff5555';
        messageDiv.style.color = '#111';
      } else if (type === 'ok') {
        messageDiv.style.backgroundColor = '#55aa55';
        messageDiv.style.color = '#fff';
      } else {
        messageDiv.style.backgroundColor = '#444';
        messageDiv.style.color = '#fff';
      }
    }
    function showSettingsMessage(text, success) {
      settingsMessage.style.display = 'block';
      settingsMessage.textContent = text || '';
      settingsMessage.style.backgroundColor = success ? '#55aa55' : '#ff5555';
      settingsMessage.style.color = success ? '#0c0' : '#111';
      setTimeout(() => { settingsMessage.style.display = 'none'; }, 3000);
    }

    // تحميل الحالة من التخزين وتحديث الواجهة
    function loadState() {
      chrome.storage.local.get(['userId', 'balance', 'automationRunning', 'workerTabId'], (data) => {
        console.log('popup.loadState =>', data);
        const uid = data.userId || '';
        userIdDisplay.textContent = uid ? uid : '-';
        const balanceVal = (typeof data.balance === 'number') ? data.balance : (data.balance ? Number(data.balance) : 0);
        balanceDisplay.textContent = (isNaN(balanceVal) ? 0 : balanceVal).toFixed(2);
        const isRunning = data.automationRunning === true;
        statusDisplay.textContent = isRunning ? 'Running' : 'Idle';
        startBtn.textContent = isRunning ? 'Stop Worker' : 'Start Worker';
        if (!userIdInput.value) userIdInput.value = uid;
        // تأكد من تفعيل الأزرار
        startBtn.disabled = false;
        saveBtn.disabled = false;
      });
    }

    // تهيئة الواجهة لأول مرة
    loadState();

    // الاستماع لتغيّر التخزين لتحديث الواجهة فورياً
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && (changes.automationRunning || changes.userId || changes.balance || changes.workerTabId)) {
        console.log('popup.storage.onChanged', changes);
        loadState();
      }
    });

    // تبويبات
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        const id = tab.dataset.tab;
        const content = document.getElementById(id);
        if (content) content.classList.add('active');
      });
    });

    // حفظ الإعدادات
    saveBtn.addEventListener('click', () => {
      const userId = (userIdInput.value || '').trim();
      if (!userId) {
        showSettingsMessage('❌ يرجى إدخال User ID', false);
        return;
      }
      saveBtn.disabled = true;
      chrome.storage.local.set({ userId }, () => {
        console.log('popup: saved userId', userId);
        showSettingsMessage('✅ تم الحفظ!', true);
        userIdDisplay.textContent = userId;
        saveBtn.disabled = false;
      });
    });

    // زر Start / Stop
    startBtn.addEventListener('click', () => {
      startBtn.disabled = true;
      saveBtn.disabled = true;
      showMainMessage('جارٍ التجهيز...', 'info');

      chrome.storage.local.get(['automationRunning', 'userId', 'workerTabId'], (data) => {
        console.log('popup.startBtn -> storage data', data);
        const isRunning = data.automationRunning === true;
        const storedUserId = data.userId || '';

        if (isRunning) {
          // طلب إيقاف
          const payload = { action: 'stop_automation', tabId: data.workerTabId || null };
          console.log('popup: sending stop_automation', payload);
          chrome.runtime.sendMessage(payload, (response) => {
            if (chrome.runtime.lastError) {
              console.error('popup.sendMessage stop error', chrome.runtime.lastError);
              showMainMessage('خطأ: لا يمكن التواصل مع الخلفية', 'error');
              startBtn.disabled = false;
              saveBtn.disabled = false;
              return;
            }
            console.log('popup: stop response', response);
            if (response && response.ok) {
              showMainMessage('⏹ تم إيقاف الـ Worker', 'ok');
              statusDisplay.textContent = 'Idle';
              startBtn.textContent = 'Start Worker';
              chrome.storage.local.set({ automationRunning: false, workerTabId: null });
              startBtn.disabled = false;
              saveBtn.disabled = false;
            } else {
              showMainMessage('خطأ أثناء الإيقاف: ' + (response && response.error ? response.error : 'غير معروف'), 'error');
              startBtn.disabled = false;
              saveBtn.disabled = false;
            }
          });
          return;
        }

        // الحالة: بدء
        const inputUserId = (userIdInput.value || '').trim();
        const userIdToUse = inputUserId || storedUserId;
        if (!userIdToUse) {
          showMainMessage('❌ أدخل User ID أولًا في الإعدادات أو الحقل أعلاه', 'error');
          startBtn.disabled = false;
          saveBtn.disabled = false;
          return;
        }

        if (inputUserId && inputUserId !== storedUserId) {
          // نحفظ ثم نبدأ
          chrome.storage.local.set({ userId: inputUserId }, () => {
            console.log('popup: saved userId before start', inputUserId);
            doStartAutomation(inputUserId);
          });
        } else {
          doStartAutomation(userIdToUse);
        }
      });
    });

    // دالة بدء التشغيل الفعلية
    function doStartAutomation(userId) {
      showMainMessage('جارٍ بدء Worker...', 'info');
      startBtn.disabled = true;
      saveBtn.disabled = true;
      console.log('popup: sending start_automation for userId=', userId);

      chrome.runtime.sendMessage({ action: 'start_automation', userId: userId }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('popup.sendMessage start error', chrome.runtime.lastError);
          showMainMessage('خطأ: لا يمكن التواصل مع الخلفية', 'error');
          startBtn.disabled = false;
          saveBtn.disabled = false;
          return;
        }
        console.log('popup: start response', response);
        if (!response) {
          showMainMessage('خطأ: لا يوجد رد من الخلفية', 'error');
          startBtn.disabled = false;
          saveBtn.disabled = false;
          return;
        }

        if (response.ok) {
          showMainMessage('▶️ تم بدء Worker بنجاح', 'ok');
          statusDisplay.textContent = 'Running';
          startBtn.textContent = 'Stop Worker';
          // حفظ بيانات محلية افتراضياً (الخلفية عادة تحفظها أيضاً)
          if (response.result && response.result.tabId) {
            chrome.storage.local.set({ workerTabId: response.result.tabId, automationRunning: true });
          } else {
            chrome.storage.local.set({ automationRunning: true });
          }
          startBtn.disabled = false;
          saveBtn.disabled = false;
        } else {
          showMainMessage('خطأ عند بدء Worker: ' + (response.error || 'غير معروف'), 'error');
          startBtn.disabled = false;
          saveBtn.disabled = false;
        }
      });
    }

    // استقبال رسائل قوية من الخلفية
    chrome.runtime.onMessage.addListener((msg) => {
      if (!msg || !msg.action) return;
      if (msg.action === 'show_message') {
        showMainMessage(msg.message || '', msg.type === 'error' ? 'error' : 'ok');
      }
    });

    // نهاية init
    console.log('popup.init complete');
  } // end init
})();
