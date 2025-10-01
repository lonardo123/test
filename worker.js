'use strict';

(function () {
  const API_BASE = 'https://perceptive-victory-production.up.railway.app/api';
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

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function extractVideoIdFromUrl(url) {
    if (!url || typeof url !== 'string') return null;
    try {
      const u = new URL(url);
      if (u.searchParams.get('v')) return u.searchParams.get('v').split('&')[0];
      const shortMatch = url.match(/\/shorts\/([A-Za-z0-9_-]{8,})/);
      if (shortMatch) return shortMatch[1];
      const embedMatch = url.match(/\/embed\/([A-Za-z0-9_-]{11})/);
      if (embedMatch) return embedMatch[1];
    } catch (e) {
      const m = url.match(/(?:v=|\/)([A-Za-z0-9_-]{8,11})(?:\b|$)/);
      if (m) return m[1];
    }
    const alt = url.match(/([A-Za-z0-9_-]{11})/);
    return alt ? alt[1] : null;
  }

  function buildFallbackUrls(videoUrl) {
    const enc = encodeURIComponent(videoUrl);
    return [
      'https://l.facebook.com/l.php?u=' + enc,
      'https://l.instagram.com/?u=' + enc,
      'https://www.google.com/url?q=' + enc
    ];
  }

  function chooseSearchQuery(video) {
    if (Array.isArray(video.keywords) && video.keywords.length > 0) {
      const filtered = video.keywords.map(k => k.toString().trim()).filter(Boolean);
      if (filtered.length > 0) return filtered[Math.floor(Math.random() * filtered.length)];
    }
    if (video.title && video.title.trim()) return video.title.trim();
    const vid = extractVideoIdFromUrl(video.video_url || '');
    return vid || video.video_url || '';
  }

  async function run() {
    try {
      const params = new URLSearchParams(window.location.search);
      const userId = params.get('user_id');
      if (!userId) {
        showMessage('❌ User ID غير موجود في الرابط');
        showDebug('تأكد من أن الرابط يحتوي على ?user_id=...');
        return;
      }

      showMessage('🔹 جلب إعدادات المستخدم...');
      await sleep(700);

      showMessage('🔹 استدعاء السيرفر للحصول على الفيديوهات...');
      let resp;
      try {
        resp = await fetch(`${API_BASE}/public-videos?user_id=${encodeURIComponent(userId)}`);
      } catch (err) {
        throw new Error('فشل الاتصال بالخادم: ' + err.message);
      }

      if (!resp.ok) throw new Error(`الخادم أعاد حالة ${resp.status}`);
      const data = await resp.json();
      if (!Array.isArray(data) || data.length === 0) throw new Error('لم يتم العثور على فيديوهات');

      const video = data[0];
      if (!video || !video.video_url) throw new Error('بيانات الفيديو غير كاملة');

      const currentVideo = {
        url: video.video_url,
        videoId: extractVideoIdFromUrl(video.video_url),
        title: video.title || '',
        keywords: Array.isArray(video.keywords) ? video.keywords : [],
        fallback: buildFallbackUrls(video.video_url)
      };

      // حفظ currentVideo في التخزين المحلي
      await new Promise(resolve => {
        chrome.storage.local.set({ currentVideo }, () => {
          if (chrome.runtime.lastError) console.warn('chrome.storage.set error', chrome.runtime.lastError);
          resolve();
        });
      });

      showDebug('currentVideo تم حفظه: ' + JSON.stringify({
        url: currentVideo.url,
        videoId: currentVideo.videoId
      }));

      // اختيار كلمة البحث
      const query = chooseSearchQuery(video);
      if (!query || query.trim().length === 0) throw new Error('لا توجد كلمة بحث صالحة');

      showMessage('🔹 فتح نتائج البحث في يوتيوب: ' + (query.length > 40 ? query.slice(0, 40) + '...' : query));
      await sleep(600);

      const ytSearchUrl = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query);
      window.location.href = ytSearchUrl;

    } catch (err) {
      console.error('worker.js error', err);
      showMessage('❌ ' + err.message);
      showDebug('تفاصيل: ' + (err.stack || JSON.stringify(err)));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }

})();
