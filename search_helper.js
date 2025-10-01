(async () => {
  'use strict';

  // جلب حالة التشغيل وبيانات الفيديو من التخزين
  const result = await chrome.storage.local.get(['automationRunning', 'currentVideo']);
  if (!result.automationRunning || !result.currentVideo) {
    // لا نفعل شيء إذا لم يكن التشغيل مُفعلًا أو لا توجد بيانات للفيديو
    return;
  }

  const targetVideo = result.currentVideo;
  const targetVideoUrl = targetVideo.url || '';
  const targetVideoId = targetVideo.videoId || (function() {
    try {
      const u = new URL(targetVideoUrl);
      return u.searchParams.get('v') || null;
    } catch (e) {
      return null;
    }
  })();

  console.log('TasksRewardBot: البحث التلقائي مفعل — جار محاولة العثور على الفيديو في نتائج البحث...');

  // دالة تستخرج video id من رابط (سواء كان href كامل أو نسبي)
  function extractIdFromHref(href) {
    if (!href) return null;
    try {
      // قد يكون رابط كامل أو نسبي
      const m1 = href.match(/(?:v=|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{8,11})/);
      if (m1 && m1[1]) return m1[1];
      const m2 = href.match(/\/watch\?v=([A-Za-z0-9_-]{11})/);
      if (m2 && m2[1]) return m2[1];
      const m3 = href.match(/\/shorts\/([A-Za-z0-9_-]{8,})/);
      if (m3 && m3[1]) return m3[1];
    } catch (e) {
      // تجاهل
    }
    return null;
  }

  // دالة للعثور على الروابط المحتملة في صفحة النتائج
  function collectCandidateLinks() {
    // نجمع عدة selectors شائعة لنتائج يوتيوب
    const selectors = [
      'a#video-title', // عادةً عنوان الفيديو
      'a[href*="/watch?v="]',
      'ytd-video-renderer a#thumbnail',
      'ytd-video-renderer a#video-title'
    ];
    const set = new Set();
    const arr = [];
    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        if (el && el.href) {
          if (!set.has(el.href)) {
            set.add(el.href);
            arr.push(el);
          }
        }
      });
    });
    return arr;
  }

  // محاولة العثور على رابط الفيديو المستهدف ثم النقر عليه
  function findAndClickTarget() {
    const links = collectCandidateLinks();
    for (const link of links) {
      const href = link.href;
      const id = extractIdFromHref(href);
      if (!id) continue;
      if (targetVideoId && id === targetVideoId) {
        // تحقق من أن العنصر مرئي
        try {
          const rect = link.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            console.log('TasksRewardBot: تم العثور على الفيديو المطلوب في نتائج البحث. جارِ النقر عليه.');
            // تنفيذ نقرة برمجية
            link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
            return true;
          }
        } catch (e) {
          // إذا فشل rect، نفتح الرابط مباشرة
          try {
            link.click();
            return true;
          } catch (ee) {}
        }
      } else {
        // أحيانًا videoId غير معروف - كهدفي احتياطي نتحقق إذا كان href يطابق رابط الفيديو الكامل
        if (targetVideoUrl && href && href.includes(targetVideoUrl)) {
          try {
            link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
            return true;
          } catch (e) {
            try { link.click(); return true; } catch (ee) {}
          }
        }
      }
    }
    return false;
  }

  // استخراج كلمات البحث الحالية من رابط الصفحة (إن أردنا إرسالها لاحقًا)
  function getSearchKeywordsArray() {
    try {
      const u = new URL(window.location.href);
      const q = u.searchParams.get('search_query') || '';
      if (!q) return [];
      return decodeURIComponent(q).split(/\s+/).filter(Boolean);
    } catch (e) {
      return [];
    }
  }

  // عمليتين: محاولة سريعة ثم إعادة محاولة بعد تأخير
  const firstDelay = 1500;
  const secondDelay = 3000;

  setTimeout(() => {
    if (findAndClickTarget()) return;

    // إعادة المحاولة بعد ثانية ونصف أخرى
    setTimeout(() => {
      if (findAndClickTarget()) return;

      // لم نعثر على الفيديو → نطلب من الخلفية فتح مصدر بديل (fallback)
      console.warn('TasksRewardBot: لم يُعثر على الفيديو في نتائج البحث — طلب فتح مصدر بديل (fallback).');

      chrome.runtime.sendMessage({
        action: 'try_fallback_redirect',
        // نمرر بعض المعلومات إذا لزم الأمر
        videoId: targetVideoId,
        directUrl: targetVideoUrl,
        keywords: getSearchKeywordsArray()
      }, (resp) => {
        // يمكن تسجيل الاستجابة لو رغبت
        console.log('TasksRewardBot: رد الخلفية على طلب fallback', resp);
      });
    }, secondDelay);
  }, firstDelay);
})();
