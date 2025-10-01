(() => {
  'use strict';

  const utils = window.TasksRewardBotUtils;

  if (!utils) {
    console.error('TasksRewardBot: utils غير موجودة!');
    return;
  }

  // ---------------- إعداد الفيديو ----------------
  async function getCurrentVideoFromStorage() {
    return new Promise(resolve => {
      try {
        chrome.storage.local.get(['currentVideo'], data => {
          resolve(data.currentVideo || null);
        });
      } catch (e) {
        console.error('TasksRewardBot: فشل قراءة currentVideo من التخزين', e);
        resolve(null);
      }
    });
  }

  // ---------------- تنفيذ البحث والنقر ----------------
  async function startVideoSearch() {
    const video = await getCurrentVideoFromStorage();
    if (!video || !video.url) {
      utils.updateNotification('❌ لا يوجد فيديو محدد للبحث');
      console.warn('TasksRewardBot: لا يوجد currentVideo في التخزين');
      return;
    }

    utils.updateNotification('🔹 جاري بدء البحث عن الفيديو...');

    // البحث الطبيعي في صفحة نتائج يوتيوب
    const found = await utils.searchAndPlayVideo(video, 25000);
    if (!found) {
      // fallback إلى المصادر البديلة
      if (video.fallback && Array.isArray(video.fallback) && video.fallback.length > 0) {
        const fallbackUrl = video.fallback[0];
        utils.updateNotification('🔹 إعادة التوجيه إلى مصدر بديل...');
        window.location.href = fallbackUrl;
      }
    }
  }

  // ---------------- تشغيل بعد تحميل DOM ----------------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startVideoSearch);
  } else {
    startVideoSearch();
  }

})();
