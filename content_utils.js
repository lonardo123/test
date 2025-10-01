'use strict';

// =====================================
// وظائف مساعدة عامة للمشروع
// =====================================

const TasksRewardUtils = (function() {

  // دالة sleep للمؤقتات
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // دالة اختيار عنصر عشوائي من مصفوفة
  function randomChoice(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // دالة بناء روابط fallback من رابط الفيديو
  function buildFallbackUrls(videoUrl) {
    if (!videoUrl) return [];
    const enc = encodeURIComponent(videoUrl);
    return [
      'https://l.facebook.com/l.php?u=' + enc,
      'https://l.instagram.com/?u=' + enc,
      'https://www.google.com/url?q=' + enc
    ];
  }

  // استخراج معرف الفيديو من رابط يوتيوب
  function extractVideoId(url) {
    if (!url) return null;
    try {
      const u = new URL(url);
      return u.searchParams.get('v') || null;
    } catch (e) {
      const m = url.match(/(?:v=|\/)([A-Za-z0-9_-]{8,11})(?:\b|$)/);
      return m && m[1] ? m[1] : null;
    }
  }

  // دالة لتوليد رسالة مختصرة لواجهة المستخدم
  function shortMessage(msg, maxLength = 40) {
    if (!msg) return '';
    if (msg.length <= maxLength) return msg;
    return msg.slice(0, maxLength) + '...';
  }

  return {
    sleep,
    randomChoice,
    buildFallbackUrls,
    extractVideoId,
    shortMessage
  };

})();
