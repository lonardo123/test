'use strict';

// دالة لتغيير الأيقونة حسب حالة التشغيل
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

// مراقبة التغييرات في التخزين وتغيير الأيقونة
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

  // جلب بيانات الفيديو من API
  let response = await fetch(`${API_BASE}/api/get_video?user_id=${encodeURIComponent(userId)}`);
  let videoData = await response.json();

  if (!videoData || !videoData.video_url) {
    throw new Error("لم يتم العثور على بيانات الفيديو");
  }

  // اختيار كلمة مفتاحية عشوائية من القائمة
  let keywords = videoData.keywords || [];
  let query = "";
  if (keywords.length > 0) {
    query = keywords[Math.floor(Math.random() * keywords.length)];
  } else {
    query = videoData.title; // fallback في حالة عدم وجود كلمات مفتاحية
  }

  // فتح تبويب نتائج البحث في يوتيوب
  const searchUrl = "https://www.youtube.com/results?search_query=" + encodeURIComponent(query);
  const tab = await chrome.tabs.create({ url: searchUrl, active: true });

  // حفظ بيانات الفيديو المطلوبة حتى يتعامل معها search_helper.js
  await storageSet({
    userId,
    automationRunning: true,
    workerTabId: tab.id,
    currentVideo: {
      url: videoData.video_url,
      fallback: [
        "https://l.facebook.com/l.php?u=" + videoData.video_url,
        "https://l.instagram.com/?u=" + videoData.video_url,
        "https://www.google.com/url?u=" + videoData.video_url
      ]
    }
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
    await storageSet({ automationRunning: false, workerTabId: null, currentVideo: null });
  }
}

// إيقاف التشغيل
async function stopAutomation(tabId) {
  await closeWorkerTab(tabId);
  await storageSet({ automationRunning: false, workerTabId: null, currentVideo: null });
}

// استقبال الرسائل من popup أو content script
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

  if (message.action === "try_fallback_redirect") {
    storageGet(["currentVideo"]).then(data => {
      if (data.currentVideo && data.currentVideo.fallback && data.currentVideo.fallback.length > 0) {
        let url = data.currentVideo.fallback.shift(); // استخدام أول لينك متاح
        chrome.tabs.update(sender.tab.id, { url: url });
        storageSet({ currentVideo: data.currentVideo });
      }
    });
  }
});
