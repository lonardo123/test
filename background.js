'use strict';

// =============================
// دالة لتغيير الأيقونة
// =============================
function setIcon(state) {
  const iconPath = state === 'running'
    ? {
        16: 'icons/icon16-pause.png',
        48: 'icons/icon48-pause.png',
        128: 'icons/icon128-pause.png'
      }
    : {
        16: 'icons/icon16.png',
        48: 'icons/icon48.png',
        128: 'icons/icon128.png'
      };

  chrome.action.setIcon({ path: iconPath });
}

// =============================
// مراقبة التغييرات في التخزين
// =============================
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.automationRunning) {
    setIcon(changes.automationRunning.newValue ? 'running' : 'idle');
  }
});

// =============================
// إعداد رابط API الأساسي
// =============================
// لاحظ أن الرابط فيه /api
const API_BASE = 'https://perceptive-victory-production.up.railway.app/api';

// =============================
// دوال للتخزين
// =============================
function storageGet(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}
function storageSet(obj) {
  return new Promise(resolve => chrome.storage.local.set(obj, resolve));
}

// =============================
// إغلاق تبويب worker
// =============================
async function closeWorkerTab(tabId) {
  if (tabId) {
    try {
      await chrome.tabs.remove(tabId);
    } catch (e) {
      console.warn('فشل إغلاق تبويب worker:', e.message);
    }
  }
}

// =============================
// بدء التشغيل
// =============================
async function startAutomation(userId) {
  if (!userId) throw new Error('User ID غير محدد');

  console.log('🔄 بدء عملية التشغيل للمستخدم:', userId);

  // جلب بيانات الفيديوهات من السيرفر
  let videos;
  try {
    const response = await fetch(`${API_BASE}/public-videos?user_id=${encodeURIComponent(userId)}`);
    if (!response.ok) {
      throw new Error(`فشل جلب بيانات الفيديو من الخادم: ${response.status}`);
    }
    videos = await response.json();
    console.log('✅ تم جلب بيانات الفيديو:', videos);
  } catch (e) {
    console.error('❌ خطأ في استدعاء API:', e.message);
    throw new Error(`فشل جلب بيانات الفيديو من الخادم: ${e.message}`);
  }

  if (!videos || !Array.isArray(videos) || videos.length === 0) {
    throw new Error('لم يتم العثور على فيديوهات لهذا المستخدم');
  }

  // اختيار أول فيديو كمثال (ممكن تعدلها لاحقًا)
  const video = videos[0];
  console.log('🎬 سيتم تشغيل الفيديو:', video);

  // إنشاء تبويب worker وفتح صفحة worker.html
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

// =============================
// إيقاف التشغيل
// =============================
async function stopAutomation(tabId) {
  await closeWorkerTab(tabId);
  await storageSet({ automationRunning: false, workerTabId: null });
  console.log('⏹ تم إيقاف التشغيل.');
}

// =============================
// استقبال الرسائل من popup.js أو content scripts
// =============================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('📩 رسالة مستلمة:', message);

  if (message.action === 'start_automation') {
    startAutomation(message.userId).then(() => {
      sendResponse({ ok: true });
    }).catch(e => {
      sendResponse({ ok: false, error: e.message });
    });
    return true; // مطلوب عشان sendResponse غير متزامن
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
