window.MainUrl = window.MainUrl || "https://perceptive-victory-production.up.railway.app";

async function initMain() {
    let savedUser = localStorage.getItem("sessionUser");
    if (!savedUser) return;

    let user = JSON.parse(savedUser);
    $("#userinfo").show();
    $("#username").text(user.username || "User");
    $("#coins").text(user.coins || 0);
    $("#balance").text(user.balance || 0);
    $("#membership").text(user.membership || "Free");

    $("#overlay").hide();
}

$(document).ready(initMain);
