document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const userId = urlParams.get('user_id');

  if (!userId || userId === 'undefined') {
    document.getElementById('statusMessage').textContent = '❌ User ID غير صالح!';
    return;
  }

  function showMessage(text) {
    document.getElementById('statusMessage').textContent = text;
  }

  showMessage('يرجى الانتظار لحظة...');

  setTimeout(() => showMessage('جارٍ البحث عن الفيديوهات...'), 2000);
  setTimeout(() => showMessage('إنشاء جلسة جديدة...'), 4000);
  setTimeout(() => showMessage('تحضير الفيديو...'), 6000);

  setTimeout(async () => {
    try {
      const res = await fetch(`https://perceptive-victory-production.up.railway.app/api/public-videos?user_id=${encodeURIComponent(userId)}`);
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) throw new Error('لا توجد فيديوهات متاحة');

      const video = data[0];
      let videoId = null;
      if (video.video_url && typeof video.video_url === 'string') {
        const clean = video.video_url.trim();
        const match = clean.match(/(?:v=|\/shorts\/)([a-zA-Z0-9_-]{11})/);
        if (match && match[1]) videoId = match[1];
      }
      if (!videoId) throw new Error('لا يمكن استخراج معرّف الفيديو');

      window.location.href = `https://www.youtube.com/results?search_query=${encodeURIComponent(videoId)}`;
      showMessage('جارٍ البحث عن الفيديو...');
    } catch (err) {
      showMessage(`❌ ${err.message}`);
    }
  }, 8000);
});
