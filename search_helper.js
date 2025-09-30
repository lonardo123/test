(async () => {
  const result = await new Promise(r => chrome.storage.local.get(['automationRunning'], r));
  if (!result.automationRunning) return;

  function findFirstVideoLink() {
    const links = document.querySelectorAll('a[href^="/watch?v="]');
    return links.length ? links[0] : null;
  }

  const tryClick = () => {
    const link = findFirstVideoLink();
    if (link) {
      link.click();
    } else {
      // لم يُعثر على فيديو → طلب fallback من الخلفية
      const urlParams = new URLSearchParams(window.location.search);
      const query = urlParams.get('search_query');
      const keywords = query ? decodeURIComponent(query).split(' ') : [];
      // استخرج videoId من الكلمات (افتراض أن أول كلمة هي videoId — أو سيتم تحسينه لاحقًا)
      const videoId = keywords[0] || 'UNKNOWN';
      chrome.runtime.sendMessage({
        action: 'try_fallback_redirect',
        videoId,
        keywords
      });
    }
  };

  setTimeout(tryClick, 1500);
  setTimeout(tryClick, 3500);
})();
