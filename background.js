'use strict';

// دالة لتغيير أيقونة الإضافة حسب الحالة
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

// مراقبة تغيّرات التخزين لتحديث الأيقونة
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.automationRunning) {
    setIcon(changes.automationRunning.newValue ? 'running' : 'idle');
  }
});

const API_BASE = 'https://perceptive-victory-production.up.railway.app';

// وُرَاثية لتعامل سهل مع chrome.storage
function storageGet(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}
function storageSet(obj) {
  return new Promise(resolve => chrome.storage.local.set(obj, resolve));
}

// إغلاق تبويب اذا كان معرفه معروف
async function closeWorkerTab(tabId) {
  if (!tabId) return;
  try {
    await chrome.tabs.remove(tabId);
  } catch (e) {
    console.warn('فشل إغلاق تبويب worker:', e && e.message ? e.message : e);
  }
}

// استخراج videoId من رابط youtube كامل (يتعامل مع watch و short)
function extractVideoIdFromUrl(url) {
  try {
    if (!url) return null;
    // حالات: https://www.youtube.com/watch?v=XXXXX
    const u = new URL(url);
    if (u.searchParams && u.searchParams.get('v')) {
      return u.searchParams.get('v').split('&')[0];
    }
    // حالات short: https://www.youtube.com/shorts/XXXXX
    const m = url.match(/\/shorts\/([A-Za-z0-9_-]{8,})/);
    if (m && m[1]) return m[1];
    // fallback generic regex (11 chars typical id)
    const r = url.match(/[?&]v=([A-Za-z0-9_-]{11})/);
    if (r && r[1]) return r[1];
  } catch (e) {
    console.warn('extractVideoIdFromUrl error', e);
  }
  return null;
}

// بدء التشغيل: يجلب بيانات الفيديو من API ثم يفتح نتائج بحث يوتيوب بكلمة مفتاحية
async function startAutomation(userId) {
  if (!userId) throw new Error('User ID غير محدد');

  // جلب بيانات الفيديو من الـ API
  let videoData;
  try {
    const resp = await fetch(`${API_BASE}/api/get_video?user_id=${encodeURIComponent(userId)}`);
    if (!resp.ok) {
      throw new Error(`خطأ في استدعاء API: ${resp.status}`);
    }
    videoData = await resp.json();
  } catch (e) {
    throw new Error('فشل جلب بيانات الفيديو من الخادم: ' + (e && e.message ? e.message : e));
  }

  if (!videoData || !videoData.video_url) {
    throw new Error('لم يتم العثور على بيانات الفيديو أو video_url');
  }

  // تجهيز videoId و اختيار كلمة بحث من keywords أو title
  const videoId = extractVideoIdFromUrl(videoData.video_url) || null;
  const keywords = Array.isArray(videoData.keywords) ? videoData.keywords : [];
  let query = '';
  if (keywords.length > 0) {
    // نختار كلمة مفتاحية عشوائية لتجربة نتائج البحث
    query = keywords[Math.floor(Math.random() * keywords.length)];
  } else if (videoData.title) {
    query = videoData.title;
  } else {
    // كحالة أخيرة استخدم videoId لو متوفر
    query = videoId || '';
  }

  if (!query) {
    throw new Error('لا توجد كلمات مفتاحية أو عنوان للاستخدام في البحث');
  }

  // فتح صفحة نتائج البحث في تبويب جديد
  const searchUrl = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query);
  const tab = await chrome.tabs.create({ url: searchUrl, active: true });

  // تجهيز مصفوفة fallback كاملة
  const fallback = [
    "https://l.facebook.com/l.php?u=" + encodeURIComponent(videoData.video_url),
    "https://l.instagram.com/?u=" + encodeURIComponent(videoData.video_url),
    "https://www.google.com/url?u=" + encodeURIComponent(videoData.video_url)
  ];

  // حفظ المعلومات في التخزين ليستخدمها script البحث (search_helper.js)
  await storageSet({
    userId: userId,
    automationRunning: true,
    workerTabId: tab.id,
    currentVideo: {
      url: videoData.video_url,
      videoId: videoId,
      fallback: fallback
    }
  });

  // مراقبة اغلاق التبويب يدوياً أو اغلاق النافذة
  const onTabRemoved = (removedTabId) => {
    if (removedTabId === tab.id) {
      cleanup();
    }
  };
  chrome.tabs.onRemoved.addListener(onTabRemoved);

  const onWindowRemoved = (windowId) => {
    chrome.tabs.get(tab.id, (tabInfo) => {
      if (chrome.runtime.lastError) return;
      if (tabInfo && tabInfo.windowId === windowId) {
        cleanup();
      }
    });
  };
  chrome.windows.onRemoved.addListener(onWindowRemoved);

  async function cleanup() {
    chrome.tabs.onRemoved.removeListener(onTabRemoved);
    chrome.windows.onRemoved.removeListener(onWindowRemoved);
    await storageSet({ automationRunning: false, workerTabId: null, currentVideo: null });
    setIcon('idle');
  }

  // تعيين الأيقونة للحالة التشغيلية
  setIcon('running');

  return { ok: true, tabId: tab.id };
}

// إيقاف التشغيل: يغلق تبويب الـ worker إن وجد ويحدث التخزين
async function stopAutomation(tabId) {
  // إن لم يمرر tabId، اقرأ من التخزين
  let data = await storageGet(['workerTabId']);
  const tid = tabId || data.workerTabId || null;
  if (tid) {
    await closeWorkerTab(tid);
  }
  await storageSet({ automationRunning: false, workerTabId: null, currentVideo: null });
  setIcon('idle');
}

// استقبال الرسائل (من popup.js أو من content scripts)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.action) {
    sendResponse({ ok: false, error: 'رسالة غير صحيحة' });
    return true;
  }

  if (message.action === 'start_automation') {
    startAutomation(message.userId).then(res => {
      sendResponse({ ok: true, result: res });
    }).catch(err => {
      sendResponse({ ok: false, error: err && err.message ? err.message : String(err) });
    });
    // نرجع true لأننا سنستخدم sendResponse لاحقًا بشكل غير متزامن
    return true;
  }

  if (message.action === 'stop_automation') {
    stopAutomation(message.tabId).then(() => {
      sendResponse({ ok: true });
    }).catch(e => {
      sendResponse({ ok: false, error: e && e.message ? e.message : String(e) });
    });
    return true;
  }

  // رسالة تطلب فتح رابط fallback لأن الـ content script لم يجد الفيديو في نتائج البحث
  if (message.action === 'try_fallback_redirect') {
    // نقرأ currentVideo من التخزين
    storageGet(['currentVideo']).then(data => {
      const cv = data.currentVideo || null;
      if (!cv) {
        // لا توجد بيانات؛ نجيب الرابط الأصلي لو موجود في الرسالة
        const direct = message.directUrl || null;
        if (direct) {
          chrome.tabs.create({ url: direct });
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false, error: 'لا توجد بيانات currentVideo' });
        }
        return;
      }

      // اذا هناك تبويب مرسل (sender.tab) نحاول تحديثه، وإلا نفتح تبويب جديد
      const nextFallback = (Array.isArray(cv.fallback) && cv.fallback.length > 0) ? cv.fallback.shift() : null;

      // نحفظ الحالة بعد ازالة عنصر fallback تم استخدامه
      storageSet({ currentVideo: cv }).catch(() => { /* لا نهتم */ });

      if (nextFallback) {
        if (sender && sender.tab && typeof sender.tab.id === 'number') {
          chrome.tabs.update(sender.tab.id, { url: nextFallback });
        } else {
          chrome.tabs.create({ url: nextFallback });
        }
        sendResponse({ ok: true, used: nextFallback });
      } else {
        // لا مزيد من الـ fallback -> حاول فتح رابط الفيديو مباشرة
        const direct = cv.url;
        if (direct) {
          if (sender && sender.tab && typeof sender.tab.id === 'number') {
            chrome.tabs.update(sender.tab.id, { url: direct });
          } else {
            chrome.tabs.create({ url: direct });
          }
          sendResponse({ ok: true, used: direct });
        } else {
          sendResponse({ ok: false, error: 'لا يوجد رابط للافتتاح' });
        }
      }
    }).catch(err => {
      sendResponse({ ok: false, error: err && err.message ? err.message : String(err) });
    });
    return true;
  }

  // افتراضي
  sendResponse({ ok: false, error: 'action غير مدعوم' });
  return false;
});
