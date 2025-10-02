const MainUrl = "https://perceptive-victory-production.up.railway.app";

$(document).ready(function () {
    // تسجيل الدخول
    $("#ButtonLogin").on("click", function () {
        performLogin();
    });

    // تسجيل الخروج
    $("#signout").on("click", function () {
        performLogout();
    });

    // عند فتح الصفحة حاول تسترجع الجلسة
    AutoCredentials();
});


// ✅ دالة تسجيل الدخول بالـ user_id
function performLogin() {
    let userId = prompt("ادخل user_id الخاص بك:");

    if (!userId) {
        showError("❌ يجب إدخال user_id.");
        return;
    }

    $.ajax({
        type: "GET",
        url: MainUrl + "/api/user-info?user_id=" + userId,
        dataType: "json",
        success: function (response) {
            if (response && response.user_id) {
                saveSession(response);
                updateUserInfo(response);
                showSuccess("✅ تسجيل الدخول ناجح!");
            } else {
                showError("❌ لم يتم العثور على المستخدم.");
            }
        },
        error: function () {
            showError("❌ خطأ في الاتصال بالسيرفر.");
        }
    });
}


// ✅ دالة تسجيل الخروج
function performLogout() {
    clearSession();
    resetUI();
    showSuccess("🚪 تم تسجيل الخروج بنجاح.");
}


// ✅ التحقق من الجلسة
function AutoCredentials() {
    let savedUser = localStorage.getItem("sessionUser");
    if (savedUser) {
        let user = JSON.parse(savedUser);
        updateUserInfo(user);
    } else {
        resetUI();
    }
}


// ✅ تحديث واجهة المستخدم بالبيانات
function updateUserInfo(user) {
    $("#userinfo").show();
    $("#theform").hide();

    $("#username").text(user.user_id);
    $("#balance").text(user.balance || 0);
    $("#membership").text(user.status || "Free");

    $("#logout").show();
    $("#join").hide();
}


// ✅ إعادة الواجهة للوضع الافتراضي
function resetUI() {
    $("#userinfo").hide();
    $("#theform").show();
    $("#logout").hide();
    $("#join").show();
}


// ✅ حفظ الجلسة
function saveSession(user) {
    localStorage.setItem("sessionUser", JSON.stringify(user));
}


// ✅ مسح الجلسة
function clearSession() {
    localStorage.removeItem("sessionUser");
}


// ✅ عرض رسالة نجاح
function showSuccess(message) {
    alert(message);
}


// ✅ عرض رسالة خطأ
function showError(message) {
    alert(message);
}
