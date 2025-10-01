(async () => {
  'use strict';

  const result = await chrome.storage.local.get(['automationRunning', 'currentVideo']);
  if (!result.automationRunning || !result.currentVideo) return;

  const targetVideo = result.currentVideo;
  const targetVideoId = targetVideo.videoId;

  // شريط الإشعارات أسفل الصفحة
  let notif = document.createElement('div');
  notif.style.cssText = `
    position: fixed; bottom: 12px; left: 50%; transform: translateX(-50%);
    width: 400px; background: #222; color: #fff; padding: 8px;
    font-family: Arial,sans-serif; font-size: 13px; z-index: 99999;
    border-radius: 6px; text-align:center; box-shadow: 0 -1px 5px rgba(0,0,0,0.3);
  `;
  document.body.appendChild(notif);

  function updateNotif(msg){ if(notif) notif.textContent = msg; }

  function extractVideoId(href){
    if(!href) return null;
    const m = href.match(/(?:v=|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{8,11})/);
    return m ? m[1] : null;
  }

  function collectCandidateLinks(){
    const selectors = [
      'a#video-title',
      'ytd-video-renderer a#thumbnail',
      'ytd-video-renderer a#video-title',
      'ytd-grid-video-renderer a#video-title',
      'ytd-rich-item-renderer a#video-title',
      'ytd-rich-item-renderer a#thumbnail',
      'ytd-reel-shelf-renderer a#video-title'
    ];
    const set = new Set();
    const arr = [];
    selectors.forEach(sel=>{
      document.querySelectorAll(sel).forEach(el=>{
        if(el && el.href && !set.has(el.href)){
          set.add(el.href);
          arr.push(el);
        }
      });
    });
    return arr;
  }

  async function scrollPage(){
    for(let i=0;i<3;i++){
      window.scrollBy({top: document.body.scrollHeight/3, behavior:'smooth'});
      await new Promise(r=>setTimeout(r,800));
    }
    for(let i=0;i<3;i++){
      window.scrollBy({top: -document.body.scrollHeight/3, behavior:'smooth'});
      await new Promise(r=>setTimeout(r,800));
    }
  }

  async function findAndClickTarget(){
    updateNotif('🔹 البحث عن الفيديو...');
    for(let attempt=0; attempt<6; attempt++){
      const links = collectCandidateLinks();
      for(const link of links){
        const id = extractVideoId(link.href);
        if(id && id === targetVideoId){
          link.scrollIntoView({behavior:'smooth', block:'center'});
          await new Promise(r=>setTimeout(r,500));
          link.click();
          updateNotif('▶️ الفيديو تم العثور عليه وتشغيله');
          return true;
        }
      }
      updateNotif(`🔹 محاولة ${attempt+1}/6 للعثور على الفيديو...`);
      await scrollPage();
    }
    return false;
  }

  const found = await findAndClickTarget();
  if(!found){
    updateNotif('⚠️ لم يُعثر على الفيديو، فتح fallback...');
    if(targetVideo.fallback && Array.isArray(targetVideo.fallback)){
      targetVideo.fallback.forEach(url => window.open(url,'_blank'));
    }
  }
})();
