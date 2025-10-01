(async () => {
  'use strict';

  // ===== التحقق من أننا على YouTube =====
  if (!window.location.hostname.includes('youtube.com')) {
    console.log('Not on YouTube');
    return;
  }

  // ===== شريط إشعارات أسفل الصفحة =====
  let notificationBar = null;
  function createNotificationBar() {
    if (notificationBar) return;
    notificationBar = document.createElement('div');
    notificationBar.style.cssText = `
      position: fixed;
      bottom: 10px;
      left: 50%;
      transform: translateX(-50%);
      width: 320px;
      background: #222;
      color: white;
      padding: 8px 12px;
      font-family: Arial, sans-serif;
      font-size: 13px;
      z-index: 999999;
      border-radius: 5px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      text-align: center;
      pointer-events: none;
    `;
    document.body.appendChild(notificationBar);
  }
  function updateNotification(msg) {
    if (!notificationBar) createNotificationBar();
    notificationBar.textContent = msg;
  }

  // ===== جلب بيانات التشغيل والفيديو =====
  const { automationRunning, currentVideo } = await chrome.storage.local.get(['automationRunning', 'currentVideo']);
  if (!automationRunning || !currentVideo) {
    updateNotification('🔹 التشغيل غير مفعل أو لا توجد بيانات فيديو');
    return;
  }
  const targetVideoId = currentVideo.videoId;
  if (!targetVideoId) {
    updateNotification('❌ videoId غير موجود');
    return;
  }
  updateNotification(`🔹 البحث عن الفيديو: ${targetVideoId}`);

  // ===== استخراج videoId من href =====
  function extractVideoId(href) {
    if (!href || typeof href !== 'string') return null;

    const patterns = [
      /v=([A-Za-z0-9_-]{11})/,
      /\/shorts\/([A-Za-z0-9_-]{8,11})/,
      /\/embed\/([A-Za-z0-9_-]{11})/,
      /youtu\.be\/([A-Za-z0-9_-]{8,11})/
    ];

    for (const p of patterns) {
      const match = href.match(p);
      if (match && match[1]) return match[1];
    }

    const idMatch = href.match(/[A-Za-z0-9_-]{8,11}/);
    return idMatch ? idMatch[0] : null;
  }

  // ===== محاكاة النقر البشري =====
  function simulateClick(element) {
    if (!element || !element.getBoundingClientRect().width) return false;

    const rect = element.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;

    const events = [
      new MouseEvent('mouseover', { bubbles: true, clientX, clientY }),
      new MouseEvent('mousedown', { bubbles: true, clientX, clientY }),
      new MouseEvent('mouseup', { bubbles: true, clientX, clientY }),
      new MouseEvent('click', { bubbles: true, clientX, clientY })
    ];

    for (const event of events) {
      element.dispatchEvent(event);
    }

    return true;
  }

  // ===== جمع الروابط المرشحة بدقة =====
  function collectCandidateLinks() {
    const selectors = [
      'ytd-video-renderer a#thumbnail',
      'ytd-video-renderer a#video-title',
      'ytd-reel-item-renderer a#thumbnail',
      'ytd-grid-video-renderer a#thumbnail',
      'ytd-rich-item-renderer a#thumbnail'
    ];

    const links = [];
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach(el => {
        if (el && el.href && !links.some(l => l.href === el.href)) {
          links.push(el);
        }
      });
    }
    return links;
  }

  // ===== تمرير الصفحة حتى يتم تحميل جميع النتائج =====
  async function scrollPage() {
    let lastHeight = document.body.scrollHeight;
    const delay = 1200;
    const step = window.innerHeight;

    for (let i = 0; i < 8; i++) {
      window.scrollBy(0, step);
      await new Promise(r => setTimeout(r, delay));
      const newHeight = document.body.scrollHeight;
      if (newHeight === lastHeight) break;
      lastHeight = newHeight;
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
    await new Promise(r => setTimeout(r, 600));
  }

  // ===== العثور على الفيديو والنقر عليه =====
  async function findAndClickVideo() {
    const links = collectCandidateLinks();
    for (const link of links) {
      const id = extractVideoId(link.href);
      if (id === targetVideoId) {
        link.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise(r => setTimeout(r, 800));

        updateNotification('✅ تم العثور على الفيديو، جارٍ محاكاة النقر...');
        if (simulateClick(link)) {
          return true;
        }
      }
    }
    return false;
  }

  // ===== المراقبة + fallback =====
  async function startSearch() {
    updateNotification('🔹 تحريك الصفحة للعثور على الفيديو...');
    await scrollPage();

    if (await findAndClickVideo()) return;

    updateNotification('🔹 الفيديو لم يُعثر عليه بعد، مراقبة DOM...');
    let found = false;
    const observer = new MutationObserver(async () => {
      if (!found && await findAndClickVideo()) {
        found = true;
        observer.disconnect();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(async () => {
      if (!found) {
        observer.disconnect();
        updateNotification('⚠️ لم يُعثر على الفيديو، فتح مصادر بديلة...');
        chrome.runtime.sendMessage({
          action: 'try_fallback_redirect',
          videoId: targetVideoId,
          directUrl: currentVideo.url,
          keywords: currentVideo.keywords || []
        });
      }
    }, 3000);
  }

  startSearch();
})();
