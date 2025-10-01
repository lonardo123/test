(async () => {
  'use strict';

  // تحقق مما إذا كان التشغيل التلقائي مفعلًا
  const result = await chrome.storage.local.get(['automationRunning', 'currentVideo']);
  if (!result.automationRunning || !result.currentVideo) return;

  const targetVideoUrl = result.currentVideo.url;
  console.log('TasksRewardBot: البحث التلقائي مفعل — جاري محاولة العثور على الفيديو...');

  // دالة للعثور على رابط الفيديو المطلوب
  function findTargetVideoLink(targetUrl) {
    const videoId = targetUrl.split("watch?v=")[1];
    const links = document.querySelectorAll('a[href^="/watch?v="]');
    for (const link of links) {
      if (link.href.includes(videoId)) {
        const rect = link.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0 && rect.top >= 0) {
          return link;
        }
      }
    }
    return null;
  }

  // محاولة الضغط على الفيديو المطلوب
  function tryClickTargetVideo() {
    const link = findTargetVideoLink(targetVideoUrl);
    if (link) {
      console.log('TasksRewardBot: تم العثور على الفيديو المستهدف — جاري الفتح...');
      link.click();
      return true;
    }
    return false;
  }

  // استخراج الكلمات المفتاحية من الرابط (في حال fallback)
  function getSearchKeywords() {
    try {
      const url = new URL(window.location.href);
      const query = url.searchParams.get('search_query');
      if (query) {
        return decodeURIComponent(query).split(' ');
      }
    } catch (e) {
      console.warn('فشل استخراج الكلمات المفتاحية من الرابط');
    }
    return [];
  }

  // المحاولة الأولى بعد 1.5 ثانية
  setTimeout(() => {
    if (tryClickTargetVideo()) return;

    // المحاولة الثانية بعد 3 ثوانٍ
    setTimeout(() => {
      if (tryClickTargetVideo()) return;

      // لم يُعثر على الفيديو → طلب fallback
      console.warn('TasksRewardBot: لم يُعثر على الفيديو في نتائج البحث — سيتم طلب مصدر بديل...');
      
      chrome.runtime.sendMessage({
        action: 'try_fallback_redirect',
        videoId: targetVideoUrl.split("watch?v=")[1],
        keywords: getSearchKeywords()
      });
    }, 1500);
  }, 1500);
})();
