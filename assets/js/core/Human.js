window.MainUrl = window.MainUrl || "https://perceptive-victory-production.up.railway.app";

const ENCODED_SECRET = "TXlTdXBlclNlY3JldEtleTEyM0ZvckNhbGxiYWNrT25seQ==";
const CALLBACK_SECRET = atob(ENCODED_SECRET);

let currentUserId = null;
let isWorkerRunning = false;
let currentVideoIndex = 0;
let videoList = [];

async function fetchVideosForUser(userId) {
    try {
        const response = await fetch(`${MainUrl}/api/public-videos?user_id=${userId}`);
        if (!response.ok) throw new Error("Failed to fetch videos");
        return await response.json();
    } catch (err) {
        console.error("Error fetching videos:", err);
        return [];
    }
}

async function startWorker(userId) {
    if (isWorkerRunning) return;

    currentUserId = userId;
    isWorkerRunning = true;
    currentVideoIndex = 0;

    $("#overlay").show();

    videoList = await fetchVideosForUser(userId);

    if (!videoList.length) {
        console.warn("No videos for this user");
        isWorkerRunning = false;
        $("#overlay").hide();
        return;
    }

    playNextVideo();
}

function playNextVideo() {
    if (!isWorkerRunning) return;
    if (currentVideoIndex >= videoList.length) {
        isWorkerRunning = false;
        $("#overlay").hide();
        console.log("All videos finished");
        return;
    }

    const video = videoList[currentVideoIndex];
    console.log(`Playing video ${video.title} ID:${video.id}`);

    setTimeout(() => finishVideo(video), video.duration_seconds * 1000);
}

async function finishVideo(video) {
    try {
        const watchedSeconds = video.duration_seconds;

        const callbackUrl = `${MainUrl}/video-callback?user_id=${currentUserId}&video_id=${video.id}&watched_seconds=${watchedSeconds}&secret=${CALLBACK_SECRET}`;
        const response = await fetch(callbackUrl);
        if (response.ok) console.log(`Reported video ${video.id} for user ${currentUserId}`);
    } catch (err) {
        console.error("Error finishing video:", err);
    }

    currentVideoIndex++;
    playNextVideo();
}

function stopWorker() {
    isWorkerRunning = false;
    $("#overlay").hide();
    console.log("Worker stopped");
}

$(document).ready(function () {
    $("#start").on("click", function () {
        let savedUser = localStorage.getItem("sessionUser");
        if (!savedUser) { alert("Login first"); return; }
        let user = JSON.parse(savedUser);
        startWorker(user.user_id);
    });

    $("#stop").on("click", function () { stopWorker(); });
});
