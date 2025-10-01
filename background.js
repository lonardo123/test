'use strict';

// دالة لتغيير الأيقونة
function setIcon(state) {
  const iconPath = state === 'running' ? {
    16: 'icons/icon16-pause.png',
    48: 'icons/icon48-pause.png',
    128: 'icons/icon128-pause.png'
  } : {
    16: 'icons/icon16.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png'
  };
  chrome.action.setIcon({ path: iconPath });
}

// مراقبة التغييرات في التخزين
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.automationRunning) {
    setIcon(changes.automationRunning.newValue ? 'running' : 'idle');
  }
});

const API_BASE = 'https://perceptive-victory-production.up.railway.app';

function storageGet(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}
function storageSet(obj) {
  return new Promise(resolve => chrome.storage.local.set(obj, resolve));
}

// إغلاق تبويب worker
async function closeWorkerTab(tabId) {
  if (tabId) {
    try {
      await chrome.tabs.remove(tabId);
    } catch (e) {
      console.warn('فشل إغلاق تبويب worker:', e.message);
    }
  }
}

// بدء التشغيل
async function startAutomation(userId) {
  if (!userId) throw new Error('User ID غير محدد');

  // إنشاء تبويب worker
  const url = chrome.runtime.getURL('worker.html') + `?user_id=${encodeURIComponent(userId)}`;
  const tab = await chrome.tabs.create({ url, active: true });

  // حفظ الحالة
  await storageSet({
    userId,
    automationRunning: true,
    workerTabId: tab.id
  });

  // مراقبة إغلاق التبويب يدويًا
  const onTabRemoved = (removedTabId) => {
    if (removedTabId === tab.id) {
      cleanup();
    }
  };
  chrome.tabs.onRemoved.addListener(onTabRemoved);

  // مراقبة إغلاق النافذة
  const onWindowRemoved = (windowId) => {
    chrome.tabs.get(tab.id, (tabInfo) => {
      if (chrome.runtime.lastError) return;
      if (tabInfo.windowId === windowId) {
        cleanup();
      }
    });
  };
  chrome.windows.onRemoved.addListener(onWindowRemoved);

  async function cleanup() {
    chrome.tabs.onRemoved.removeListener(onTabRemoved);
    chrome.windows.onRemoved.removeListener(onWindowRemoved);
    await storageSet({ automationRunning: false, workerTabId: null });
  }
}

// إيقاف التشغيل
async function stopAutomation(tabId) {
  await closeWorkerTab(tabId);
  await storageSet({ automationRunning: false, workerTabId: null });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'start_automation') {
    startAutomation(message.userId).then(() => {
      sendResponse({ ok: true });
    }).catch(e => {
      sendResponse({ ok: false, error: e.message });
    });
    return true;
  }

  if (message.action === 'stop_automation') {
    stopAutomation(message.tabId).then(() => {
      sendResponse({ ok: true });
    }).catch(e => {
      sendResponse({ ok: false, error: e.message });
    });
    return true;
  }
});
