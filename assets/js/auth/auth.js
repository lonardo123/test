$(document).ready(function () {

    // محاولة تعيين نسخة الإضافة إن وُجدت (أمان)
    try {
        if (typeof Manifest !== "undefined" && Manifest && Manifest.version) {
            $("#ExtensionVersion").text(Manifest.version);
        } else {
            // عرض ثابت أو تركه فارغاً لأن index.html يعرض العنوان بالفعل
            $("#ExtensionVersion").text("1.0.0");
        }
    } catch (e) {
        // لا نطبع أي console.logs كما طلبت
        $("#ExtensionVersion").text("1.0.0");
    }

    // تَأكُّد من إخفاء overlay نهائيًا (لو موجود في الـ HTML)
    try { $("#overlay").hide(); } catch (e) {}

    /**********************
     * دوال مساعدة
     **********************/
    // عرض رسالة مؤقتة (تختفي بعد 3 ثواني)
    function showMessage(text, ok) {
        var el = $("#refresh_msg");
        if (!el || el.length === 0) return;
        el.text(text);
        el.removeClass("success error");
        el.addClass(ok ? "success" : "error");
        el.show();
        setTimeout(function () { el.fadeOut(); }, 3000);
    }

    // تعيين عناصر الواجهة بالبيانات
    function populateUserData(userData) {
        if (!userData) return;
        $("#username").text(userData.fullname || "—");
        $("#balance").text(userData.balance !== undefined ? userData.balance : "0");
        $("#membership").text(userData.membership || "Free");
        // آخر تحديث بصيغة ISO (YYYY-MM-DD HH:mm)
        if (userData.last_update) {
            $("#lastUpdated").text("🕓 آخر تحديث: " + userData.last_update);
        } else {
            $("#lastUpdated").text("🕓 آخر تحديث: —");
        }
        $("#userinfo").show();
        $("#logout").show();
        $("#theform").hide();
        // ضمنياً نتأكد من إخفاء أي overlay
        try { $("#overlay").hide(); } catch (e) {}
    }

    // حفظ بيانات المستخدم محليًا في chrome.storage.local
    function saveUserToLocal(userData, callback) {
        // لا طباعة في console حسب الطلب
        chrome.storage.local.set({ userData: userData }, function () {
            if (typeof callback === "function") callback();
        });
    }

    // جلب بيانات الملف الشخصي من السيرفر (API) مع معالجة الاستجابة
    function fetchProfileFromServer(user_id, successCb, errorCb) {
        if (!user_id) {
            if (typeof errorCb === "function") errorCb("no_user_id");
            return;
        }

        // ضمان إخفاء الoverlay إن كان ظاهرًا لأي سبب
        try { $("#overlay").hide(); } catch (e) {}

        $.ajax({
            type: "GET",
            url: "https://perceptive-victory-production.up.railway.app/api/user/profile",
            data: { user_id: user_id },
            dataType: "json",
            cache: false,
            headers: { "X-Requested-With": "XMLHttpRequest" },
            success: function (resp) {
                // API قد ترجع { status: 'success', data: { ... } } أو الشكل المباشر
                var payload = null;
                if (!resp) {
                    if (typeof errorCb === "function") errorCb("invalid_response");
                    return;
                }
                if (resp.status && resp.status === "success" && resp.data) {
                    payload = resp.data;
                } else if (resp.data) {
                    payload = resp.data;
                } else if (resp.fullname || resp.balance || resp.membership) {
                    // بعض النسخ القديمة تعيد الحقول مباشرة
                    payload = resp;
                } else {
                    payload = null;
                }

                if (payload && (payload.fullname || payload.user_id || payload.balance !== undefined)) {
                    if (typeof successCb === "function") successCb(payload);
                } else {
                    if (typeof errorCb === "function") errorCb("not_found");
                }
            },
            error: function () {
                if (typeof errorCb === "function") errorCb("network");
            }
        });
    }

    /**********************
     * سلوك التحميل الأولي: عرض البيانات من التخزين المحلي فورًا
     **********************/
    function initUIOnLoad() {
        // إخفاء overlay كقاعدة
        try { $("#overlay").hide(); } catch (e) {}

        // اقرأ userData من local أولًا
        chrome.storage.local.get(["userData"], function (result) {
            var userData = result && result.userData ? result.userData : null;
            if (userData && userData.fullname) {
                // عرض فوري من التخزين المحلي
                populateUserData(userData);
            } else {
                // لم توجد بيانات محلية: نُظهر نموذج الإدخال
                $("#userinfo").hide();
                $("#logout").hide();
                $("#theform").show();

                // إذا كان في sync uniqueID نعبّيه في الحقل لراحة المستخدم، لكن لا نجلب تلقائيًا
                chrome.storage.sync.get("uniqueID", function (d) {
                    if (d && d.uniqueID) {
                        try {
                            $("#user_id_input").val(d.uniqueID);
                        } catch (e) {}
                    }
                });
            }
        });
    }

    /**********************
     * أحداث الأزرار
     **********************/
    // زر حفظ واستعلام - عند الضغط يخزن في sync ثم يجلب من السيرفر ويحفظ محليًا
    $("#save_user_id").off("click").on("click", function () {
        var uid = ($("#user_id_input").val() || "").trim();
        if (!uid) {
            alert("الرجاء إدخال user_id");
            return;
        }

        // تعطيل الزر مؤقتًا لمنع الضغط المتكرر
        var $btn = $(this);
        $btn.prop("disabled", true).text("جارٍ التحميل...");

        // حفظ user_id في chrome.storage.sync
chrome.storage.sync.set({ uniqueID: uid }, function () {

    // ✅ إضافة تخزين متوافق مع Start.js
    chrome.storage.local.set({ user_id: uid }, function () {
        try { localStorage.setItem('user_id', uid); } catch (e) {}
    });

    // جلب من السيرفر
    fetchProfileFromServer(uid, function (payload) {

                // بناء كائن المستخدم للحفظ محليًا مع last_update
                var nowIso = new Date().toISOString().slice(0, 16).replace("T", " ");
                var userData = {
                    fullname: payload.fullname || (payload.name || ""),
                    balance: (typeof payload.balance !== "undefined") ? payload.balance : 0,
                    membership: payload.membership || payload.role || "Free",
                    user_id: uid,
                    last_update: nowIso
                };
                // حفظ محلياً وإظهار البطاقة
                saveUserToLocal(userData, function () {
                    populateUserData(userData);
                    showMessage("✅ تم التحديث بنجاح.", true);
                    // عرض نص آخر تحديث أيضاً
                    $("#lastUpdated").text("🕓 آخر تحديث: " + userData.last_update);
                    // إعادة تمكين الزر
                    $btn.prop("disabled", false).text("حفظ واستعلام");
                });
            }, function (err) {
                // خطأ أثناء الجلب
                $btn.prop("disabled", false).text("حفظ واستعلام");
                showMessage("⚠️ حدث خطأ أثناء الجلب.", false);
                // لا نجري reload ولا نغيّر بيانات التخزين
            });
        });
    });

    // زر تحديث البيانات - سيدعو نفس عملية الجلب لكن يتطلب أن يكون هناك user_id محفوظ في sync أو local
    $("#refresh_user_data").off("click").on("click", function () {
        var $rbtn = $(this);
        var origText = $rbtn.text();
        $rbtn.prop("disabled", true).text("جارٍ التحديث...");

        // أحسن سلوك: نحاول أخذ user_id من local أولاً ثم من sync
        chrome.storage.local.get(["userData"], function (resLocal) {
            var localData = resLocal && resLocal.userData ? resLocal.userData : null;
            var uidFromLocal = localData && localData.user_id ? localData.user_id : null;

            if (uidFromLocal) {
                // جلب وتحديث محلي
                fetchProfileFromServer(uidFromLocal, function (payload) {
                    var nowIso = new Date().toISOString().slice(0, 16).replace("T", " ");
                    var userData = {
                        fullname: payload.fullname || (payload.name || ""),
                        balance: (typeof payload.balance !== "undefined") ? payload.balance : 0,
                        membership: payload.membership || payload.role || "Free",
                        user_id: uidFromLocal,
                        last_update: nowIso
                    };
                    saveUserToLocal(userData, function () {
                        populateUserData(userData);
                        showMessage("✅ تم التحديث بنجاح.", true);
                        $("#lastUpdated").text("🕓 آخر تحديث: " + userData.last_update);
                        $rbtn.prop("disabled", false).text(origText);
                    });
                }, function () {
                    showMessage("⚠️ حدث خطأ أثناء الجلب.", false);
                    $rbtn.prop("disabled", false).text(origText);
                });
            } else {
                // إن لم يوجد في local، نحاول من sync
                chrome.storage.sync.get("uniqueID", function (resSync) {
                    var uidSync = resSync && resSync.uniqueID ? resSync.uniqueID : null;
                    if (!uidSync) {
                        showMessage("⚠️ لا يوجد معرف مستخدم محفوظ.", false);
                        $rbtn.prop("disabled", false).text(origText);
                        return;
                    }
                    // جلب باستخدام uidSync
                    fetchProfileFromServer(uidSync, function (payload) {
                        var nowIso = new Date().toISOString().slice(0, 16).replace("T", " ");
                        var userData = {
                            fullname: payload.fullname || (payload.name || ""),
                            balance: (typeof payload.balance !== "undefined") ? payload.balance : 0,
                            membership: payload.membership || payload.role || "Free",
                            user_id: uidSync,
                            last_update: nowIso
                        };
                        // حفظ محلياً واظهار
                        saveUserToLocal(userData, function () {
                            populateUserData(userData);
                            showMessage("✅ تم التحديث بنجاح.", true);
                            $("#lastUpdated").text("🕓 آخر تحديث: " + userData.last_update);
                            $rbtn.prop("disabled", false).text(origText);
                        });
                    }, function () {
                        showMessage("⚠️ حدث خطأ أثناء الجلب.", false);
                        $rbtn.prop("disabled", false).text(origText);
                    });
                });
            }
        });
    });

 $("#start").on("click", function () {
  chrome.runtime.sendMessage({
    cmd: "openTab",
    url: MainUrl + "/worker/start"
  });
  $("#start").prop("disabled", true);
});


    // Load UI initially from local storage (عرض فوري)
    initUIOnLoad = function () { // تعريف دالة داخل النطاق العام لهذا الملف
        try { $("#overlay").hide(); } catch (e) {}
        chrome.storage.local.get(["userData"], function (result) {
            var userData = result && result.userData ? result.userData : null;
            if (userData && userData.fullname) {
                populateUserData(userData);
            } else {
                $("#userinfo").hide();
                $("#logout").hide();
                $("#theform").show();
                // وضع قيمة field إن كان موجود في sync لتسهيل إعادة المحاولة
                chrome.storage.sync.get("uniqueID", function (d) {
                    if (d && d.uniqueID) {
                        try { $("#user_id_input").val(d.uniqueID); } catch (e) {}
                    }
                });
            }
        });
    };

    // استدعاء initial load
    initUIOnLoad();

    // ضمنياً نضمن إخفاء أي overlay عند أي استدعاء AJAX
    $(document).ajaxStart(function () { try { $("#overlay").hide(); } catch (e) {} });
    $(document).ajaxStop(function () { try { $("#overlay").hide(); } catch (e) {} });
    $(document).ajaxError(function () { try { $("#overlay").hide(); } catch (e) {} });

    // نهاية الدالة الرئيسية
});
