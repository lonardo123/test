'use strict';

(function () {
  // نقطة النهاية للـ API (تأكد أنها تطابق الخلفية)
  const API_BASE = 'https://perceptive-victory-production.up.railway.app/api';

  // عناصر الواجهة
  const statusEl = document.getElementById('statusMessage');
  const debugEl = document.getElementById('debugInfo');

  function showMessage(text) {
    if (statusEl) statusEl.textContent = text;
  }
  function showDebug(text) {
    if (debugEl) {
      debugEl.style.display = 'block';
      debugEl.textContent = text;
    }
  }

  // استدعاء sleep للمؤقتات العرضية
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // استخراج videoId من رابط يوتيوب (watch, shorts, embed)
  function extractVideoIdFromUrl(url) {
    if (!url || typeof url !== 'string') return null;
    try {
      // حاول كـ URL
      const u = new URL(url);
      // حالة watch?v=
      if (u.searchParams && u.searchParams.get('v')) {
        return u.searchParams.get('v').split('&')[0];
      }
      // حالة /shorts/ID
      const shortMatch = url.match(/\/shorts\/([A-Za-z0-9_-]{8,})/);
      if (shortMatch && shortMatch[1]) return shortMatch[1];
      // حالة embed
      const embedMatch = url.match(/\/embed\/([A-Za-z0-9_-]{11})/);
      if (embedMatch && embedMatch[1]) return embedMatch[1];
    } catch (e) {
      // لو فشل parse كـ URL، حاول بالـ regex
      const m = url.match(/(?:v=|\/)([A-Za-z0-9_-]{8,11})(?:\b|$)/);
      if (m && m[1]) return m[1];
    }
    // محاولات إضافية لالتقاط معرف 11 حرف
    const alt = url.match(/([A-Za-z0-9_-]{11})/);
    return (alt && alt[1]) ? alt[1] : null;
  }

  // بناء روابط fallback تعتمد على رابط الفيديو الكامل
  function buildFallbackUrls(videoUrl) {
    const enc = encodeURIComponent(videoUrl);
    return [
      'https://l.facebook.com/l.php?u=' + enc,
      'https://l.instagram.com/?u=' + enc,
      'https://www.google.com/url?q=' + enc
    ];
  }

  // اختيار كلمة البحث من keywords أو title أو videoId
  function chooseSearchQuery(video) {
    // video.keywords يُفترض أن يكون مصفوفة
    if (Array.isArray(video.keywords) && video.keywords.length > 0) {
      // اختر كلمة مفتاحية عشوائية من القائمة (يمكن تغييره لتتابعي بدلاً من عشوائي)
      const filtered = video.keywords.map(k => (k || '').toString().trim()).filter(Boolean);
      if (filtered.length > 0) {
        return filtered[Math.floor(Math.random() * filtered.length)];
      }
    }
    // إذا لم توجد keywords استخدم العنوان
    if (video.title && typeof video.title === 'string' && video.title.trim().length > 0) {
      return video.title.trim();
    }
    // كحل أخير استخدم videoId أو رابط
    const vid = extractVideoIdFromUrl(video.video_url || '') || '';
    if (vid) return vid;
    // fallback: كامل الرابط
    return video.video_url || '';
  }

  async function run() {
    try {
      // قراءة user_id من باراميتر URL
      const params = new URLSearchParams(window.location.search);
      const userId = params.get('user_id');

      if (!userId) {
        showMessage('❌ User ID غير موجود في الرابط');
        showDebug('تأكد من أن الرابط يحتوي على ?user_id=...');
        return;
      }

      showMessage('جارٍ تحميل إعدادات المستخدم...');
      await sleep(700);

      // جلب بيانات الفيديو من السيرفر
      showMessage('جارٍ استدعاء السيرفر للحصول على الفيديوهات...');
      let resp;
      try {
        resp = await fetch(`${API_BASE}/public-videos?user_id=${encodeURIComponent(userId)}`, { method: 'GET' });
      } catch (fetchErr) {
        throw new Error('فشل الاتصال بالخادم: ' + (fetchErr && fetchErr.message ? fetchErr.message : String(fetchErr)));
      }

      if (!resp.ok) {
        throw new Error(`الخادم أعاد حالة ${resp.status} (${resp.statusText || ''})`);
      }

      const data = await resp.json();

      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('لم يتم العثور على فيديوهات للمستخدم');
      }

      // اختر أول فيديو (يمكن تعديل ذلك لاحقًا لتكرار أو اختيار حسب شروط)
      const video = data[0];

      if (!video || !video.video_url) {
        throw new Error('بيانات الفيديو غير كاملة (لا يوجد video_url)');
      }

      showMessage('تم العثور على فيديو، جارٍ تحضير البحث...');
      await sleep(600);

      // جهّز currentVideo لتخزينه في chrome.storage حتى يتمكن content script من الوصول له
      const videoId = extractVideoIdFromUrl(video.video_url);
      const currentVideo = {
        url: video.video_url,
        videoId: videoId,
        title: video.title || '',
        keywords: Array.isArray(video.keywords) ? video.keywords : [],
        fallback: buildFallbackUrls(video.video_url)
      };

      // حفظ currentVideo في التخزين المحلي
      await new Promise((resolve) => {
        try {
          chrome.storage.local.set({ currentVideo }, () => {
            // لا ننسى فحص lastError
            if (chrome.runtime.lastError) {
              console.warn('chrome.storage.set error', chrome.runtime.lastError);
            }
            resolve();
          });
        } catch (e) {
          // في حال عدم توفر chrome (غير متوقع) نتابع
          console.warn('storage.set exception', e && e.message ? e.message : e);
          resolve();
        }
      });

      showDebug('currentVideo تم حفظه: ' + JSON.stringify({ url: currentVideo.url, videoId: currentVideo.videoId }));

      // اختر كلمة البحث
      const query = chooseSearchQuery(video);
      if (!query || query.trim().length === 0) {
        throw new Error('لا توجد كلمة بحث قابلة للاستخدام');
      }

      showMessage('جاري فتح بحث يوتيوب باستخدام: ' + (query.length > 40 ? query.slice(0, 40) + '...' : query));
      await sleep(600);

      // أعد التوجيه إلى صفحة نتائج يوتيوب (سيقوم content script على صفحة النتائج بالبحث عن currentVideo والنقر عليه)
      const ytSearchUrl = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query);
      window.location.href = ytSearchUrl;

      // ملاحظة: بعد إعادة التوجيه هذا السكربت سيُنهي عمله هنا لأن الصفحة تتغير إلى youtube.com
    } catch (err) {
      console.error('worker.js error', err);
      showMessage('❌ ' + (err && err.message ? err.message : String(err)));
      showDebug('تفاصيل: ' + (err && err.stack ? err.stack : JSON.stringify(err)));
    }
  }

  // بدء التشغيل بعد تحميل DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
