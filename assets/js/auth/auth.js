$(document).ready(function () {
  // تحقق من وجود user_id محفوظ
  chrome.storage.local.get("user_id", function (data) {
    if (data.user_id) {
      loadUserProfile(data.user_id);
    }
  });

  // عند النقر على زر Login (من index.html)
  $("#ButtonLogin").on("click", function () {
    const userId = prompt("Please enter your User ID:");
    if (userId && userId.trim()) {
      loadUserProfile(userId.trim());
    }
  });

  // عند النقر على زر Signup (اختياري)
  $("#signup").on("click", function () {
    const userId = prompt("Enter your User ID to join:");
    if (userId && userId.trim()) {
      loadUserProfile(userId.trim());
    }
  });
});

// جلب بيانات المستخدم من الخادم
function loadUserProfile(userId) {
  const overlay = $("#overlay");
  overlay.show();

  $.ajax({
    url: "https://perceptive-victory-production.up.railway.app/api/user/profile",
    method: "GET",
    data: { user_id: userId },
    timeout: 10000,
    success: function (response) {
      overlay.hide();
      if (response.status === "success" && response.data) {
        const user = response.data;

        // حفظ user_id محليًا
        chrome.storage.local.set({ user_id: userId });

        // إخفاء نموذج تسجيل الدخول
        $("#theform").hide();
        $("#join").hide();

        // عرض بيانات المستخدم
        $("#userinfo").show();
        $("#logout").show();

        $("#username").text(user.fullname || "User " + userId);
        $("#coins").text(user.coins || 0); // يمكنك إزالته لاحقًا
        $("#balance").text((user.balance || 0).toFixed(4)); // ← 4 خانات عشرية
        $("#membership").text(user.membership || "Free");

        // تحديث نص الزر الرئيسي
        $("#main_nav").text("Main");
      } else {
        alert("Invalid User ID or server error.");
      }
    },
    error: function (xhr, status, error) {
      overlay.hide();
      console.error("Auth Error:", error);
      alert("Failed to connect to server. Please try again.");
    }
  });
}
