'use strict';

/**
 * Background service worker (manifest v3)
 * - لا يحتوي على chrome.runtime.onInstalled (تمت إزالته كما طلبت)
 * - يقدّم سلوك بدء/إيقاف العامل عبر chrome.action.onClicked
 * - يتابع تبويب العامل (tabId) في chrome.storage.sync
 */

/* -----------------------
   إعدادات / ثابتات
   ----------------------- */
const TARGET_BASE = 'https://perceptive-victory-production.up.railway.app';
const WORKER_PATH = '/worker/start';
const PUBLIC_PATH_FOR_API = '/api/public-videos'; // تستخدم لإرسال رسائل عند اكتمال التحميل

const ICON_RUNNING = '/assets/img/pause.png';     // عندما العامل يعمل نعرض أيقونة "إيقاف"
const ICON_STOPPED = '/assets/img/icon-19.png';   // عندما العامل متوقف نعرض أيقونة "تشغيل"

let loadingTimers = {}; // مؤقتات إعادة تحميل حسب tabId
let creatingWindow = false; // لتفادي فتح نوافذ مكررة أثناء الانشاء

/* -----------------------
   مساعدة: safe chrome API error log
   ----------------------- */
function logChromeLastError(prefix) {
  if (chrome.runtime && chrome.runtime.lastError) {
    console.warn(prefix, chrome.runtime.lastError && chrome.runtime.lastError.message);
  }
}

/* -----------------------
   إغلاق تبويبات YouTube الأخرى (محاولة تنظيف)
   ----------------------- */
function closeOtherYouTubeTabs(exceptTabId) {
  chrome.tabs.query({ url: '*://*.youtube.com/*' }, (tabs) => {
    if (chrome.runtime.lastError) return logChromeLastError('closeOtherYouTubeTabs.query:');
    tabs.forEach(t => {
      if (t.id !== exceptTabId) {
        chrome.tabs.remove(t.id, () => { logChromeLastError('closeOtherYouTubeTabs.remove:'); });
      }
    });
  });

  // حاول حذف من التاريخ أيضاً — ليس ضروري لكن كان موجود في الأصل
  try {
    chrome.history && chrome.history.search && chrome.history.search({ text: 'youtube.com' }, (results) => {
      if (chrome.runtime.lastError) return;
      results.forEach(entry => {
        if (entry.url) {
          chrome.history.deleteUrl({ url: entry.url }, () => { /* ignore errors */ });
        }
      });
    });
  } catch (e) {
    // history قد لا تكون متاحة أو مصرح بها
  }
}

/* -----------------------
   إرسال رسالة إلى content script بأمان
   ----------------------- */
function sendMessageToContentScript(tabId, msg) {
  if (!tabId) return;
  try {
    chrome.tabs.sendMessage(tabId, { msg }, (response) => {
      if (chrome.runtime.lastError) {
        // قد يحدث: "The message port closed before a response was received."
        // هذا مجرد تحذير إن الـ content script غير مستجيب أو لم يُحمّل بعد.
        // لسجل التشخيص فقط:
        // console.warn('sendMessageToContentScript:', chrome.runtime.lastError.message);
      }
      // لا نعتمد على response هنا
    });
  } catch (e) {
    // تجاهل أخطاء الإرسال
  }
}

/* -----------------------
   فتح تبويب/نافذة العامل وحفظ tabId في storage
   ----------------------- */
function openWorkerTab(callback) {
  if (creatingWindow) {
    if (typeof callback === 'function') callback(new Error('creating'));
    return;
  }
  creatingWindow = true;

  const url = TARGET_BASE.replace(/\/$/, '') + WORKER_PATH;

  chrome.windows.create({ url, focused: true }, (newWin) => {
    creatingWindow = false;
    if (chrome.runtime.lastError) {
      logChromeLastError('createWindow:');
      if (typeof callback === 'function') callback(chrome.runtime.lastError);
      return;
    }
    if (!newWin || !newWin.tabs || !newWin.tabs[0]) {
      if (typeof callback === 'function') callback(new Error('no_tab_created'));
      return;
    }

    const tabId = newWin.tabs[0].id;
    // حفظ tabId
    chrome.storage.sync.set({ tabId }, () => {
      logChromeLastError('storage.set:');
      // تنظيف تبويبات يوتيوب الأخرى إن أردنا
      closeOtherYouTubeTabs(tabId);
      // عدّل الأيقونة ووضع popup فارغ لمنع فتح index بالضغط
      chrome.action.setIcon({ path: ICON_RUNNING });
      chrome.action.setPopup({ popup: '' });
      chrome.action.setTitle({ title: 'Stop Worker' });
      if (typeof callback === 'function') callback(null, tabId);
    });
  });
}

/* -----------------------
   إغلاق تبويب العامل المحفوظ ومسح tabId
   ----------------------- */
function closeWorkerTab(callback) {
  chrome.storage.sync.get('tabId', (data) => {
    logChromeLastError('storage.get:');
    const tabId = data && data.tabId;
    if (!tabId) {
      // لا يوجد تبويب محفوظ فعلاً
      // استرجاع الحالة الافتراضية للأيقونة
      chrome.action.setIcon({ path: ICON_STOPPED });
      chrome.action.setPopup({ popup: 'index.html' });
      chrome.action.setTitle({ title: 'Start Worker' });
      if (typeof callback === 'function') callback(null, 'no_tab');
      return;
    }

    chrome.tabs.remove(tabId, () => {
      // تجاهل الأخطاء في حال كان التبويب مغلقًا بالفعل
      logChromeLastError('tabs.remove:');
      // نظف المؤقتات إن وجدت
      if (loadingTimers[tabId]) {
        clearTimeout(loadingTimers[tabId]);
        delete loadingTimers[tabId];
      }
      // مسح التخزين
      chrome.storage.sync.remove('tabId', () => {
        logChromeLastError('storage.remove:');
        // إعادة الأيقونة والـ popup للوضع المتوقف
        chrome.action.setIcon({ path: ICON_STOPPED });
        chrome.action.setPopup({ popup: 'index.html' });
        chrome.action.setTitle({ title: 'Start Worker' });
        if (typeof callback === 'function') callback(null, 'closed');
      });
    });
  });
}

/* -----------------------
   Toggle: إذا شغّال → أوقفه، إذا متوقّف → شغّله
   يُستخدم عند الضغط على الأيقونة
   ----------------------- */
function toggleWorker() {
  chrome.storage.sync.get('tabId', (data) => {
    logChromeLastError('storage.get(toggle):');
    const tabId = data && data.tabId;
    if (tabId) {
      // العامل يعمل → نغلقه
      closeWorkerTab();
    } else {
      // العامل متوقف → نفتح صفحة العامل
      openWorkerTab();
    }
  });
}

/* -----------------------
   معالجة تحديث تبويب (onUpdated)
   - نريد التأكد من تبويبنا، عمل reload إذا علِق، وإرسال أوامر للـ content script
   ----------------------- */
function handleTabUpdated(tabId, changeInfo, tab) {
  chrome.storage.sync.get('tabId', (data) => {
    if (chrome.runtime.lastError) return;
    const saved = data && data.tabId;
    if (!saved || tabId !== saved) return;

    // حماية: إذا URL غير معرف (مثلاً during navigation) تجاهل
    const urlStr = tab && tab.url ? tab.url : '';
    let hostname = '';
    try { hostname = new URL(urlStr).hostname.toLowerCase(); } catch (e) { hostname = ''; }

    // إذا الصفحة ما زالت في حالة loading لفترة طويلة → reload
    if (hostname === new URL(TARGET_BASE).hostname && changeInfo.status === 'loading') {
      if (loadingTimers[tabId]) clearTimeout(loadingTimers[tabId]);
      loadingTimers[tabId] = setTimeout(() => {
        chrome.tabs.get(tabId, (currentTab) => {
          if (chrome.runtime.lastError) return;
          if (currentTab && currentTab.status === 'loading') {
            chrome.tabs.reload(tabId, () => { logChromeLastError('tabs.reload:'); });
          }
        });
      }, 30000); // 30s
    }

    // عند اكتمال التحميل
    if (changeInfo.status === 'complete') {
      // إذا وصل إلى مسار /api/public-videos (أو أي endpoint محدد) أرسل رسالة للبداية الخاصة بجلب البيانات
      if (urlStr.includes(PUBLIC_PATH_FOR_API)) {
        sendMessageToContentScript(tabId, 'StartGetData');
      } else {
        // إشارة عامة لبدء العمل على الصفحة
        sendMessageToContentScript(tabId, 'StartWorker');
      }
    }

    // أثناء أي تحديث حاول أن تبقي الأيقونة على حالة "تشغيل العامل"
    chrome.action.setIcon({ path: ICON_RUNNING });
    chrome.action.setPopup({ popup: '' });
    chrome.action.setTitle({ title: 'Stop Worker' });
  });
}

/* -----------------------
   معالجة حذف تبويب
   ----------------------- */
function handleTabRemoved(tabId, removeInfo) {
  chrome.storage.sync.get('tabId', (data) => {
    if (chrome.runtime.lastError) return;
    const saved = data && data.tabId;
    if (!saved || tabId !== saved) return;

    // تنظيف
    if (loadingTimers[tabId]) {
      clearTimeout(loadingTimers[tabId]);
      delete loadingTimers[tabId];
    }

    // أزل المفتاح من التخزين وغيّر حالة الأيقونة للمتوقف
    chrome.storage.sync.remove('tabId', () => {
      logChromeLastError('storage.remove(onRemoved):');
      chrome.action.setIcon({ path: ICON_STOPPED });
      chrome.action.setPopup({ popup: 'index.html' });
      chrome.action.setTitle({ title: 'Start Worker' });
    });
  });
}

/* -----------------------
   تغيير رابط التبويب المحفوظ (مستخدم من popup أو غيره)
   ----------------------- */
function changeSavedTabUrl(newUrl) {
  chrome.storage.sync.get('tabId', (data) => {
    if (chrome.runtime.lastError) return;
    const tabId = data && data.tabId;
    if (!tabId) return;
    chrome.tabs.update(tabId, { url: newUrl }, () => {
      if (chrome.runtime.lastError) {
        logChromeLastError('tabs.update(changeSavedTabUrl):');
      } else {
        closeOtherYouTubeTabs(tabId);
      }
    });
  });
}

/* -----------------------
   استقبال رسائل من popup/content scripts
   الرسائل المتوقعة:
     { cmd: 'openTab', url: '...' }
     { cmd: 'updateTab', url: '...' }
     { cmd: 'closeWorker' }
   ----------------------- */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (!message || !message.cmd) return;
    if (message.cmd === 'openTab' && message.url) {
      openWorkerTab((err, tabId) => {
        sendResponse({ ok: !err, tabId: tabId, err: err && err.message });
      });
      return true; // indicate async response
    } else if (message.cmd === 'updateTab' && message.url) {
      changeSavedTabUrl(message.url);
    } else if (message.cmd === 'closeWorker') {
      closeWorkerTab(() => sendResponse({ ok: true }));
      return true;
    }
  } catch (e) {
    console.error('onMessage handler error:', e);
  }
});

/* -----------------------
   أحداث المتابعة
   ----------------------- */
chrome.tabs.onUpdated.addListener(handleTabUpdated);
chrome.tabs.onRemoved.addListener(handleTabRemoved);

/* -----------------------
   عند الضغط على أيقونة الإضافة (toggle)
   ----------------------- */
chrome.action.onClicked.addListener(() => {
  toggleWorker();
});
