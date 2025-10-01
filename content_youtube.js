(() => {
  'use strict';

  let notificationBar=null;

  function createNotificationBar(){
    if(notificationBar) return;
    notificationBar=document.createElement('div');
    notificationBar.style.cssText=`
      position: fixed;
      bottom: 12px;
      left: 50%;
      transform: translateX(-50%);
      width: 400px;
      background: #222;
      color: white;
      padding: 8px 12px;
      font-family: Arial,sans-serif;
      font-size: 13px;
      z-index: 99999;
      box-shadow: 0 -1px 5px rgba(0,0,0,0.3);
      border-radius: 6px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;
    const span=document.createElement('span');
    span.id='tasksNotificationMessage';
    notificationBar.appendChild(span);
    document.body.appendChild(notificationBar);
  }

  function updateNotification(msg){
    if(!notificationBar) createNotificationBar();
    const span=document.getElementById('tasksNotificationMessage');
    if(span) span.textContent=msg;
  }

  function extractVideoId(href){
    if(!href) return null;
    const m=href.match(/(?:v=|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{8,11})/);
    return m?m[1]:null;
  }

  function findVideoById(videoId){
    const selectors=['a#video-title','ytd-video-renderer a#thumbnail','ytd-video-renderer a#video-title','ytd-grid-video-renderer a#video-title'];
    const links=[];
    selectors.forEach(sel=>document.querySelectorAll(sel).forEach(a=>{if(a&&a.href) links.push(a);}));
    for(const link of links){
      const vid=extractVideoId(link.href);
      if(vid===videoId) return link;
    }
    return null;
  }

  function clickSearchButton(){
    const btn=document.querySelector('button#search-icon-legacy')||document.querySelector('button[aria-label="Search"]');
    if(btn&&btn.offsetParent!==null){ btn.click(); updateNotification('🔹 ضغط زر البحث'); return true; }
    return false;
  }

  async function autoScroll(){
    window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'});
    await new Promise(r=>setTimeout(r,1200));
    window.scrollTo({top:0,behavior:'smooth'});
    await new Promise(r=>setTimeout(r,1200));
  }

  async function searchAndClickVideo(currentVideo,maxAttempts=6){
    updateNotification('🔹 بدء البحث عن الفيديو...');
    const videoId=currentVideo.videoId;
    if(!videoId){ updateNotification('❌ لا يوجد videoId'); return false; }

    for(let i=0;i<maxAttempts;i++){
      const videoEl=findVideoById(videoId);
      if(videoEl){
        updateNotification('✅ الفيديو موجود، جارِ النقر...');
        videoEl.scrollIntoView({behavior:'smooth',block:'center'});
        await new Promise(r=>setTimeout(r,600));
        videoEl.click();
        updateNotification('▶️ الفيديو شغّل');
        return true;
      }
      updateNotification(`🔹 البحث، محاولة ${i+1}/${maxAttempts}...`);
      clickSearchButton();
      await autoScroll();
    }

    updateNotification('⚠️ لم يُعثر على الفيديو، الانتقال للـ fallback');
    if(currentVideo.fallback && Array.isArray(currentVideo.fallback)){
      for(const url of currentVideo.fallback) window.open(url,'_blank');
    }
    return false;
  }

  async function init(){
    createNotificationBar();
    const result=await chrome.storage.local.get('currentVideo');
    const currentVideo=result.currentVideo;
    if(!currentVideo){ updateNotification('❌ لا يوجد فيديو للبحث'); return; }
    searchAndClickVideo(currentVideo);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init);
  else init();
})();
