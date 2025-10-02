'use strict';

(function () {
  const API_BASE = 'https://perceptive-victory-production.up.railway.app/api';
  const statusEl = document.getElementById('statusMessage');
  const debugEl = document.getElementById('debugInfo');

  function showMessage(msg) { if(statusEl) statusEl.textContent = msg; }
  function showDebug(msg) { if(debugEl){ debugEl.style.display='block'; debugEl.textContent=msg; } }
  function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

  function extractVideoId(url){
    if(!url) return null;
    try{
      const u = new URL(url);
      if(u.searchParams.get('v')) return u.searchParams.get('v');
      const shortMatch = url.match(/\/shorts\/([A-Za-z0-9_-]{8,})/);
      if(shortMatch) return shortMatch[1];
      const embedMatch = url.match(/\/embed\/([A-Za-z0-9_-]{11})/);
      if(embedMatch) return embedMatch[1];
    }catch(e){
      const m = url.match(/(?:v=|\/)([A-Za-z0-9_-]{8,11})/);
      if(m && m[1]) return m[1];
    }
    const alt = url.match(/([A-Za-z0-9_-]{11})/);
    return alt ? alt[1] : null;
  }

  function buildFallbackUrls(videoUrl){
    const enc = encodeURIComponent(videoUrl);
    return [
      'https://l.facebook.com/l.php?u='+enc,
      'https://l.instagram.com/?u='+enc,
      'https://www.google.com/url?q='+enc
    ];
  }

  function chooseSearchQuery(video){
    if(Array.isArray(video.keywords) && video.keywords.length>0){
      const filtered = video.keywords.map(k=>k.toString().trim()).filter(Boolean);
      if(filtered.length>0) return filtered[Math.floor(Math.random()*filtered.length)];
    }
    if(video.title && video.title.trim()) return video.title.trim();
    const vid = extractVideoId(video.video_url);
    return vid || video.video_url;
  }

  async function run(){
    try{
      const params = new URLSearchParams(window.location.search);
      const userId = params.get('user_id');
      if(!userId){ showMessage('❌ User ID غير موجود'); showDebug('تأكد من رابط ?user_id=...'); return; }

      showMessage('🔹 تحميل إعدادات المستخدم...');
      await sleep(700);

      showMessage('🔹 جلب الفيديوهات من السيرفر...');
      let resp = await fetch(`${API_BASE}/public-videos?user_id=${encodeURIComponent(userId)}`);
      if(!resp.ok) throw new Error(`خادم أعاد ${resp.status}`);
      const data = await resp.json();
      if(!Array.isArray(data)||data.length===0) throw new Error('لا يوجد فيديوهات');

      const video = data[0];
      const videoId = extractVideoId(video.video_url);
      const currentVideo = {
        url: video.video_url,
        videoId,
        title: video.title || '',
        keywords: Array.isArray(video.keywords)?video.keywords:[],
        fallback: buildFallbackUrls(video.video_url)
      };

      await new Promise(r=>chrome.storage.local.set({currentVideo},()=>r()));
      showDebug('currentVideo تم حفظه: '+JSON.stringify({url:currentVideo.url,videoId:currentVideo.videoId}));

      const query = chooseSearchQuery(video);
      showMessage('🔹 فتح بحث يوتيوب: '+(query.length>40?query.slice(0,40)+'...':query));
      await sleep(600);

      window.location.href = 'https://www.youtube.com/results?search_query='+encodeURIComponent(query);
    }catch(err){
      console.error('worker.js error',err);
      showMessage('❌ '+err.message);
      showDebug(err.stack||JSON.stringify(err));
    }
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',run);
  else run();
})();
