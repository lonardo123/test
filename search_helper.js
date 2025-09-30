(async () => {
  'use strict';

  // تحقق مما إذا كان التشغيل التلقائي مفعلًا
  const result = await chrome.storage.local.get(['automationRunning']);
  if (!result.automationRunning) return;

  console.log('TasksRewardBot: البحث التلقائي مفعل — جاري محاولة فتح أول فيديو...');

  // دالة للعثور على أول رابط فيديو
  function findFirstVideoLink() {
    const links = document.querySelectorAll('a[href^="/watch?v="]');
    for (const link of links) {
      // تأكد أن الرابط مرئي وليس جزءًا من إعلان أو توصية جانبية
      const rect = link.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && rect.top >= 0) {
        return link;
      }
    }
    return null;
  }

  // محاولة الضغط على أول فيديو
  function tryClickVideo() {
    const link = findFirstVideoLink();
    if (link) {
      console.log('TasksRewardBot: تم العثور على فيديو — جاري الفتح...');
      link.click();
      return true;
    }
    return false;
  }

  // استخراج video_id من رابط البحث (للاستخدام في fallback)
  function getVideoIdFromQuery() {
    try {
      const url = new URL(window.location.href);
      const query = url.searchParams.get('search_query');
      if (query) {
        // افترض أن أول كلمة هي video_id (أو استخدم منطقًا أذكى لاحقًا)
        return query.split(' ')[0] || null;
      }
    } catch (e) {
      console.warn('فشل استخراج video_id من الرابط');
    }
    return null;
  }

  // المحاولة الأولى بعد 1.5 ثانية
  setTimeout(() => {
    if (tryClickVideo()) return;

    // المحاولة الثانية بعد 3 ثوانٍ
    setTimeout(() => {
      if (tryClickVideo()) return;

      // لم يُعثر على فيديو → طلب fallback
      console.warn('TasksRewardBot: لم يُعثر على فيديو في نتائج البحث — جاري طلب مصدر بديل...');
      
      const videoId = getVideoIdFromQuery();
      if (videoId) {
        chrome.runtime.sendMessage({
          action: 'try_fallback_redirect',
          videoId: videoId,
          keywords: decodeURIComponent(window.location.search.split('search_query=')[1]?.split('&')[0] || '').split(' ')
        });
      } else {
        console.error('TasksRewardBot: لا يمكن تحديد video_id للـ fallback');
      }
    }, 1500);
  }, 1500);
})();
