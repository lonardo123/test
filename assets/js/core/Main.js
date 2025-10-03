const SERVER_URL = "https://perceptive-victory-production.up.railway.app";
const GET_PUBLIC_VIDEOS_URL = (userId) => `${SERVER_URL}/api/public-videos?user_id=${encodeURIComponent(userId)}`;
const REPORT_WATCH_URL = (userId, videoId, watchedSeconds) =>
  `${SERVER_URL}/video-callback?user_id=${encodeURIComponent(userId)}&video_id=${encodeURIComponent(videoId)}&watched_seconds=${encodeURIComponent(watchedSeconds)}&secret=MySuperSecretKey123ForCallbackOnly`;
const APP_TITLE = "TasksRewardBot";

// Apply the requested title explicitly
try {
  document.title = APP_TITLE;
} catch (e) {
  console.warn("Could not set document.title:", e);
}

/**
 * Promisified storage helpers (use chrome.storage.local when available)
 */
function storageGet(keys) {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(keys, (res) => resolve(res));
    } else {
      // fallback to localStorage
      if (typeof keys === "string") {
        resolve({ [keys]: localStorage.getItem(keys) });
      } else if (Array.isArray(keys)) {
        const out = {};
        keys.forEach(k => out[k] = localStorage.getItem(k));
        resolve(out);
      } else if (typeof keys === "object" && keys !== null) {
        const out = {};
        Object.keys(keys).forEach(k => out[k] = localStorage.getItem(k));
        resolve(out);
      } else {
        // get everything not supported in fallback
        resolve({});
      }
    }
  });
}

function storageSet(obj) {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set(obj, () => resolve());
    } else {
      Object.keys(obj).forEach(k => {
        try { localStorage.setItem(k, obj[k]); } catch(e) {}
      });
      resolve();
    }
  });
}

/**
 * Fetch public videos for a given user id (GET as requested)
 */
async function fetchPublicVideos(userId) {
  if (!userId) return null;
  const url = GET_PUBLIC_VIDEOS_URL(userId);
  try {
    const resp = await fetch(url, { method: "GET", credentials: "omit" });
    if (!resp.ok) {
      console.warn("fetchPublicVideos: server returned", resp.status);
      return null;
    }
    const data = await resp.json().catch(() => null);
    console.log("fetchPublicVideos response:", data);
    return data;
  } catch (err) {
    console.warn("fetchPublicVideos error:", err);
    return null;
  }
}

/**
 * Report watch progress using GET /video-callback with secret in URL (exactly as you specified)
 */
async function reportWatch(userId, videoId, watchedSeconds) {
  if (!userId || !videoId) {
    console.warn("reportWatch: missing userId or videoId", userId, videoId);
    return null;
  }
  const url = REPORT_WATCH_URL(userId, videoId, watchedSeconds || 0);
  try {
    const resp = await fetch(url, { method: "GET", credentials: "omit" });
    if (!resp.ok) {
      console.warn("reportWatch: server returned", resp.status, "url:", url);
      return null;
    }
    // try to parse JSON; if not JSON return text
    let result = null;
    try { result = await resp.json(); } catch (e) { result = await resp.text(); }
    console.log("reportWatch response:", result);
    return result;
  } catch (err) {
    console.warn("reportWatch error:", err);
    return null;
  }
}

/**
 * Utility: get query param by name
 */
function getQueryParam(name) {
  try {
    const u = new URL(window.location.href);
    return u.searchParams.get(name);
  } catch (e) {
    const m = window.location.search.match(new RegExp('[?&]' + name + '=([^&]+)'));
    return m ? decodeURIComponent(m[1]) : null;
  }
}

/**
 * Initialize: load user_id (storage or query), fetch videos and wire UI handlers.
 */
async function init() {
  const qsUser = getQueryParam("user_id") || getQueryParam("userId") || getQueryParam("userid");
  const stored = await storageGet("user_id");
  const userId = (stored && stored.user_id) ? stored.user_id : qsUser;

  if (userId) {
    await storageSet({ user_id: userId });
    const videos = await fetchPublicVideos(userId);
    if (Array.isArray(videos) && videos.length > 0) {
      const container = document.querySelector("#tasksrewardbot_videos_list");
      if (container) {
        container.innerHTML = "";
        videos.forEach(v => {
          const vidId = v.id || v.video_id || v.videoId || "";
          const item = document.createElement("div");
          item.className = "trb-video-item";
          item.dataset.videoId = vidId;
          item.innerHTML = `
            <div><strong>${v.title || v.name || "Untitled"}</strong></div>
            <div>Duration: ${v.duration || v.length || "unknown"}</div>
            <button class="trb-action" data-action="watch" data-video-id="${vidId}">Report Watch</button>
            <button class="trb-action" data-action="like" data-video-id="${vidId}">Like</button>
            <button class="trb-action" data-action="comment" data-video-id="${vidId}">Comment</button>
          `;
          container.appendChild(item);
        });
      } else {
        console.log("No #tasksrewardbot_videos_list container found to render videos.");
      }
    } else {
      console.log("No public videos or empty list.");
    }
  } else {
    console.log("No user_id found in storage or query string.");
  }

  // Delegated click handler for actions (watch/like/comment/subscribe)
  document.addEventListener("click", async (ev) => {
    const btn = ev.target.closest && ev.target.closest("[data-action][data-video-id]");
    if (!btn) return;
    const action = btn.getAttribute("data-action");
    const videoId = btn.getAttribute("data-video-id");
    const s = await storageGet("user_id");
    const uid = (s && s.user_id) ? s.user_id : null;
    if (!uid) {
      console.warn("Action aborted: no user_id available for action", action);
      return;
    }
    if (action === "watch") {
      const seconds = btn.getAttribute("data-watched-seconds") || 30;
      await reportWatch(uid, videoId, seconds);
    } else if (action === "like") {
      const key = `liked_${videoId}`;
      const curr = (await storageGet(key))[key];
      const newVal = curr === "1" ? "0" : "1";
      await storageSet({ [key]: newVal });
      console.log("Like toggled for", videoId, "->", newVal);
    } else if (action === "comment") {
      const commentKey = `comment_${videoId}`;
      await storageSet({ [commentKey]: "commented-via-TasksRewardBot" });
      console.log("Saved comment state for", videoId);
    } else if (action === "subscribe") {
      await storageSet({ subscribed: "1" });
      console.log("Subscribed (state saved).");
    }
  });
}

// Run initialization on DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// Expose API for debugging/manual usage
window.TasksRewardBot = {
  SERVER_URL,
  GET_PUBLIC_VIDEOS_URL,
  REPORT_WATCH_URL,
  APP_TITLE,
  fetchPublicVideos,
  reportWatch,
  storageGet,
  storageSet
};
