(function (_0x3285ba, _0x16f2a5) { const _0x63e93a = _0x3285ba(); while (true) { try { const _0x3b942a = -parseInt(_0x3988(1885, 0x6f5)) / 1 * (parseInt(_0x3988(1848, 0xb79)) / 2) + -parseInt(_0x3988(1884, 0xcd4)) / 3 + -parseInt(_0x3988(1515, 0x88f)) / 4 + -parseInt(_0x3988(1556, 0xff)) / 5 * (parseInt(_0x3988(1846, 0x808)) / 6) + -parseInt(_0x3988(1437, 0x438)) / 7 + parseInt(_0x3988(1020, -0x124)) / 8 * (-parseInt(_0x3988(1650, 0x8eb)) / 9) + -parseInt(_0x3988(1453, 0x371)) / 10 * (-parseInt(_0x3988(785, 0x243)) / 11); if (_0x3b942a === _0x16f2a5) { break; } else { _0x63e93a.push(_0x63e93a.shift()); } } catch (_0x2c2ac6) { _0x63e93a.push(_0x63e93a.shift()); } } })(_0x24b2, 974715);
const _0x35aeb8 = function () { let _0x39dfc3 = true; return function (_0x423fac, _0x4d7f02) { const _0x1d5d19 = _0x39dfc3 ? function () { if (_0x4d7f02) { const _0x1cc9af = _0x4d7f02.apply(_0x423fac, arguments); _0x4d7f02 = null; return _0x1cc9af; } } : function () {}; _0x39dfc3 = false; return _0x1d5d19; }; }();
const _0xd76c99 = _0x35aeb8(this, function () {
  return _0xd76c99.toString().search("(((.+)+)+)+$").toString().constructor(_0xd76c99).search("(((.+)+)+)+$");
});
function _0x3988(_0x398820, _0x33f1b8) {
  const _0x1f86f7 = _0x24b2();
  _0x3988 = function (_0x1ee179, _0x573805) {
    _0x1ee179 = _0x1ee179 - 480;
    let _0x1dbcda = _0x1f86f7[_0x1ee179];
    return _0x1dbcda;
  };
  return _0x3988(_0x398820, _0x33f1b8);
}
_0xd76c99();

let remainingTime = 0;
let startVerification = true;
let startGetVideo = true;
let countdownTimer = null;
let timerRunning = false;
let timerStartTime = 0;
let timerDuration = 0;
let paused = false;
let elapsedWhenPaused = 0;

// ------------------------------
// التعديلات: استخدام user_id من localStorage بدلاً من token
// ------------------------------
const MainUrl = "https://perceptive-victory-production.up.railway.app";
const CALLBACK_SECRET = "MySuperSecretKey123ForCallbackOnly";

// user_id يجب أن يكون موجودًا في localStorage بواسطة الواجهة أو عند تسجيل الدخول.
// مثال: localStorage.setItem("user_id", "123456789");
const USER_ID = localStorage.getItem("user_id") || null;

// Helper: استبدال Language التي كانت تتصل بخادم للترجمة.
// الآن تعيد المفتاح مباشرة (تبقي واجهة VGNotif تعمل كما هي).
async function Language(_0x40bcd5, _0x2026cf = null) {
  try {
    // مباشرة نعيد المفتاح كـ fallback (يمكن تعديلها لاحقًا لو أردت ترجمة محلية)
    if (null !== _0x2026cf) {
      // if params provided, do simple replace like original implementation expected
      return _0x40bcd5.replace(/\{(\d+)\}/g, function (m, idx) {
        return _0x2026cf[idx] !== undefined ? _0x2026cf[idx] : m;
      });
    }
    return _0x40bcd5;
  } catch (e) {
    console.error("Language error:", e);
    return _0x40bcd5;
  }
}

async function VGNotif(_0x5b2c93, _0x3158c0, _0xad6c0, _0x1e1385, _0x354c04, _0x1105ed = null) {
  try {
    let _0x135137 = await Language(_0xad6c0, _0x1e1385);
    if (!_0x135137) {
      throw Error("Language fetch failed");
    }
    if (window.location.hostname === parsedUrl.hostname) {
      return new Promise(_0x2dd08f => {
        let _0x37b53b = document.querySelector("#loader-wrapper #loader") || document.querySelector("#loader-wrapper #infoloader");
        let _0x80349d = document.getElementById("message");
        if (!_0x80349d) {
          _0x2dd08f(true);
          return;
        }
        _0x80349d.style.transition = "opacity 0.5s ease, transform 0.5s ease";
        _0x80349d.style.opacity = '0';
        _0x80349d.style.transform = "translateY(-10px)";
        setTimeout(() => {
          _0x80349d.textContent = _0x135137;
          _0x80349d.style.opacity = '1';
          _0x80349d.style.transform = "translateY(0)";
          switch (_0x3158c0) {
            case "error":
              _0x80349d.style.color = "#ec2121";
              break;
            case "warning":
              _0x80349d.style.color = "#cc8e17";
              break;
            case "success":
              _0x80349d.style.color = "#15ac10";
              break;
            default:
              _0x80349d.style.color = "#686262";
          }
          if (_0x37b53b) {
            _0x37b53b.id = 0 === _0x5b2c93 ? "infoloader" : "loader";
          }
          _0x2dd08f(true);
        }, 200);
      });
    }
    {
      if (!document.documentElement) {
        await new Promise((_0x2a497d, _0x3823c3) => {
          let _0x4c8151 = () => {
            if (document.documentElement) {
              _0x2a497d();
              return;
            }
            setTimeout(_0x4c8151, 50);
          };
          let _0x4fd7f3 = new MutationObserver((_0x4703af, _0x4e53c5) => {
            if (document.documentElement) {
              _0x4e53c5.disconnect();
              _0x2a497d();
            }
          });
          const _0x57b77 = {
            childList: true,
            subtree: true
          };
          _0x4fd7f3.observe(document.documentElement, _0x57b77);
          _0x4c8151();
          setTimeout(() => {
            if (!document.documentElement) {
              _0x4fd7f3.disconnect();
              _0x3823c3(Error("Document body not found after waiting"));
            }
          }, 5000);
        });
      }
      const _0x4daa59 = {
        success: "rgb(65, 185, 96)",
        danger: "rgba(255, 69, 0, 0.9)",
        error: "rgba(255, 69, 0, 0.9)",
        info: "rgb(30, 144, 255)",
        warning: "rgb(255, 193, 7)",
        "default": "rgb(123, 104, 238)"
      };
      let _0x241ef5 = _0x4daa59[_0x3158c0] || "rgb(123, 104, 238)";
      let _0x8b62e5 = 1 == _0x5b2c93 ? "<span id=\"loadingconsole\" class=\"vgloadingDots\"></span>" : "<strong id=\"loadingconsole\"></strong>";
      let _0x427999 = document.getElementById("ViewGripConsole");
      let _0xda3785 = document.querySelector("style[data-vgnotif]");
      if (!_0x427999) {
        (_0x427999 = document.createElement("div")).id = "ViewGripConsole";
        if (!_0xda3785) {
          (_0xda3785 = document.createElement("style")).setAttribute("data-vgnotif", "true");
          _0xda3785.textContent = "#ViewGripConsole{position:fixed;z-index:9999;bottom:10px;left:50%;transform:translateX(-50%);background:#222;text-align:left;box-shadow:0 4px 10px rgba(0,0,0,.3);font-family:'Roboto Mono','Courier New',Courier,monospace;padding:10px;font-size:14px;color:#fff;border-radius:10px;max-height:200px;opacity:1;transition:opacity .3s ease-out}@media (min-width:768px){#ViewGripConsole{width:50%}}@media (max-width:768px){#ViewGripConsole{width:90%}}#TextMessage{display:block;background-color:rgba(57,57,57,.44);border-radius:2px;overflow-x:auto;white-space:pre-wrap;padding:5px;border-left:2px solid #5affd6;margin:3px 15px}.viewgrip{margin-left:15px;color:#fff}.vgloadingDots::after{content:\".\";animation:1s steps(5,end) infinite loadingDots;font-size:14px;color:#cdee69;font-family:Consolas,monospace}@keyframes loadingDots{0%,20%{color:transparent;text-shadow:.25em 0 0 transparent,.5em 0 0 transparent}40%{color:#cdee69;text-shadow:.25em 0 0 transparent,.5em 0 0 transparent}60%{text-shadow:.25em 0 0 #cdee69,.5em 0 0 transparent}100%,80%{text-shadow:.25em 0 0 #cdee69,.5em 0 0 #cdee69}}strong::after{content:\"_\";opacity:0;animation:1s infinite cursor;color:#cdee69}@keyframes cursor{0%,100%,40%{opacity:0}50%,90%{opacity:1}}.countdown-timer{position:relative;height:3px;background-color:rgba(157,160,164,.7);border-radius:3px;margin:10px 15px 0;overflow:visible}.timer-dot,.timer-progress{position:absolute;background-color:red}.timer-progress{top:0;left:0;height:100%;width:0;border-radius:3px;transition:width .1s linear}.timer-dot{right:0;top:50%;width:10px;height:10px;border-radius:50%;transform:translate(50%,-50%);display:none}";
          document.head.appendChild(_0xda3785);
        }
        document.documentElement.appendChild(_0x427999);
      }
      let _0x1c5662 = _0x427999.querySelector(".countdown-timer") && null === _0x1105ed;
      if (_0x1c5662) {
        let _0x31ff0e = _0x427999.querySelector("#TextMessage");
        if (_0x31ff0e) {
          _0x31ff0e.innerHTML = _0x135137 + " " + _0x8b62e5 + " " + _0x354c04;
          _0x31ff0e.style.color = _0x241ef5;
        }
        return true;
      }
      _0x427999.innerHTML = "\n                <span class=\"viewgrip\">@viewgrip:</span>\n                <span id=\"TextMessage\" style=\"color: " + _0x241ef5 + "\">" + _0x135137 + " " + _0x8b62e5 + " " + _0x354c04 + "</span>\n                " + (_0x1105ed && _0x1105ed > 0 ? "<div class=\"countdown-timer\"><div class=\"timer-progress\"><div class=\"timer-dot\"></div></div></div>" : '') + "\n            ";
      if (_0x1105ed && _0x1105ed > 0) {
        if (timerRunning) {
          clearTimeout(countdownTimer);
          timerRunning = false;
        }
        let _0x6cb9e0 = _0x427999.querySelector(".timer-progress");
        let _0x1a1867 = _0x427999.querySelector(".timer-dot");
        if (!_0x6cb9e0 || !_0x1a1867) {
          console.warn("Timer elements not found, skipping timer");
          return true;
        }
        function _0x1124c5() {
          if (paused) {
            return;
          }
          let _0x128b7a = Date.now();
          let _0x582bf1 = _0x128b7a - timerStartTime;
          let _0x1d41ea = Math.min(_0x582bf1 / timerDuration, 1);
          remainingTime = timerDuration - _0x582bf1;
          _0x6cb9e0.style.width = 100 * _0x1d41ea + '%';
          if (_0x1d41ea < 1) {
            let _0x46a60d = Math.min(100, timerDuration - _0x582bf1);
            countdownTimer = setTimeout(_0x1124c5, _0x46a60d);
          } else {
            timerRunning = false;
            setTimeout(() => {
              if ("function" == typeof GoToChannel) {
                GoToChannel();
              }
            }, 1000);
          }
        }
        _0x1a1867.style.display = "block";
        timerDuration = 1000 * _0x1105ed;
        timerStartTime = Date.now();
        timerRunning = true;
        paused = false;
        elapsedWhenPaused = 0;
        window.pauseVGCountdown = function () {
          if (timerRunning && !paused) {
            paused = true;
            clearTimeout(countdownTimer);
            elapsedWhenPaused = Date.now() - timerStartTime;
          }
        };
        window.resumeVGCountdown = function () {
          if (paused) {
            paused = false;
            timerStartTime = Date.now() - elapsedWhenPaused;
            _0x1124c5();
          }
        };
        _0x1124c5();
      }
      return true;
    }
  } catch (_0x423f3f) {
    setTimeout(() => {
      Restarting();
    }, 2000);
    return false;
  }
}

function GoToChannel() {
  try {
    const _0x860f12 = {
      video_id: null,
      backup_url: null,
      video_type: null,
      viewing_method: null,
      keyword: null,
      like: null,
      subscribe: null,
      comment: null,
      comment_liking: null,
      duration: null
    };
    const _0x461a26 = { AjaxData: _0x860f12 };
    chrome.storage.local.set(_0x461a26, function () {
      try {
        if (0.5 > Math.random()) {
          setTimeout(function () { onTimesUp(); }, 1500);
        } else {
          ForceStopAll();
          const _0x5700d5 = {
            "watch?v=": "#above-the-fold #top-row .ytd-video-owner-renderer",
            "/shorts": "#channel-container #channel-info #avatar"
          };
          let _0x223376 = Object.keys(_0x5700d5).find(_0x43de14 => window.location.href.includes(_0x43de14));
          let _0x48523c = _0x223376 ? document.querySelector(_0x5700d5[_0x223376]) : null;
          if (_0x48523c) {
            VGNotif(1, "default", "visit_video_channel", 0, '').then(_0xe7e5ce => {
              if (_0xe7e5ce) {
                setTimeout(function () {
                  $("html").animate({
                    'scrollTop': $(_0x48523c).offset().top - $(window).height() / 2 + $(_0x48523c).outerHeight() / 2
                  }, 2000, function () {
                    WorkerStatus = true;
                    SimulateClick(_0x48523c).then(_0x144b4b => {
                      if (_0x144b4b) {
                        youTubeLoad().then(_0x21036f => {
                          if (_0x21036f) {
                            setTimeout(function () { onTimesUp(); }, 3000);
                          }
                        });
                      } else {
                        setTimeout(function () { onTimesUp(); }, 1500);
                      }
                    });
                    setTimeout(function () {
                      if (window.location.href.includes("youtube.com/watch?v=") || window.location.href.includes("youtube.com/shorts/")) {
                        onTimesUp();
                      }
                    }, 1500);
                  });
                }, 1000);
              }
            });
          } else {
            onTimesUp();
          }
        }
      } catch (_0x463b56) {
        onTimesUp();
      }
    });
  } catch (_0x767ee1) {
    onTimesUp();
  }
}

function _0x24b2() {
  const _0x44413d = ['KqkVn', ':15px', "r\"></", 'Faile', 'youtu', 'www.y', 'SmGdI', 'XMLHt', 't:50%', '(-10p', 'wEvDR', 'litXm', 'xt-sh', 'vLIdO', 'Jswcp', 'matio', 'MSOpP', 'iDQos', 'rBCTm', 'e;bor', 'jnYyc', " elem", 'city:', '{disp', 'TML', 'hRhRW', 'zqfyj', ';anim', 'ZVxmV', 'Aqctj', 'a(0,0', 'xbFoq', 'wKqJA', 'ee69}', 'BVVqI', 'VbmqM', 'isibl', 'x}@ke', 'warn', 'QhyLQ', 'GuIWZ', 'hOJUe', 'rJmGm', 'splay', 'YOzPg', 'stron', 'lativ', 'oYPSx', 'dCgIZ', 'mcPUQ', 'allWP', 'lgkct', 'LvKSD', 'mzTyZ', 'Sodtd', 'svKry', 'hbGmz', 'YWkqt', 'docum', "n:2s ", 'YImWx', 'nJsnm', 'qOdcP', 'pause', 'sVbTj', 'mzrcg', 'class', 'CQnzk', 'ppLiK', ';colo', 'or{0%', 'durat', 'caPrY', 'comma', '}40%{', 'child', "sole\"", 'SzESx', 'top', 'KmPIT', 'LPDLN', 'SqHHH', "em 0 ", 'qJAel', 'IxlGX', 'iHnjK', 'ata', 'ch_vi', 'ANPds', 'LRmKL', 'ess{p', 'trans', ":1s f", 'redia', 'bWxod', 'IKJHn', 'ArsBJ', 'apply', 'rder-', 'SMecf', 'kFEPU', 'NDZZY', 'vEACc', 'WoFhU', "3px 1", 'rFoRK', '0;bor', 'TWTyf', 'ngDot', 'ydIHC', 'tttzk', '#15ac', 'GXWTz', 't-fam', 'der-r', 'full/', 'ex:99', 'cGEfp', 'uFsmI', 'onten', 'HBYue', 'FYBYv', 'ymHQx', '5deg)', 'anspa', 'g:bor', 'QZbKN', '00%;w', 'kEpGo', 'VpESK', '#6862', 'r:#ff', 'linea', '-time', 't:700', 'oAGVG', 'ce}@k', 'efjDS', 'PMNJY', 'KIgnb', 'EzJBS', '#View', 'ition', 'ransf', 'e{wid', "d to ", 'onsol', 'BRoiK', 'ositi', 'appen', 'KKijS', 'GdEeG', 'bytGT', 'in:10', 'slate', 'rgin:', 'GIgiz', 'XSXxY', "es an", 'uto;p', 'ackgr', 'lAnim', 'Dwgcq', 'vcRlu', 'EtRcH', 'PWAXV', 'rzwPl', 'nsole', 'cmFgE', 'a(57,', 'verfl', 'xiHYt', 'pPEnY', 'xdlMa', 'YCqWp', ':41.5', 'ZVfuN', 'YKMQB', 'mGTDG', 'mXcZV', 'fToIq', 'binDz', '10px,', 'MFcGx', 'rsfEt', 'uest', 'Messa', 'RSZsB', 'morhj', '00%;h', 'Lvklc', 'idth:', 'rgb(5', 'form:', 'WKZHV', 'bgjpf', "s fad", "\";opa", "0 #cd", 'DehNm', 'span>', "0 0 t", "se, t", "<div ", 'worke', 'KfjpT', 'min', "er\"><", ':30%;', "span ", 'posit', 'tAdja', 'NFJTp', 'RiDhv', 'vgnot', 'VWrAw', 'lock;', "uage ", 'tDMot', 'DYGZn', 'apper', 'aLpal', 'PkPuQ', 'ooosv', 'rier,', 'dHvmb', 'OnInt', 'gress', 'okKxJ', 'ourie', 'Ebgre', 'ideo', "s\"></", 'tif]', ';padd', 'jfJfy', ':fixe', 'PItHG', 'Hpgpn', 'HxCKp', 'IJQnb', 'rando', 'RtrHS', 'PTXuG', 'MtTej', 'succe', 'zOqWQ', 'spare', ')}}</', 'eend', "div c", 'font-', 'DdHVp', 'bpqPd', 'backg', 'quest', 'DCdyO', 'TXfIF', 'cOPBz', '-fold', 'lastE', 'VIjuS', 'min-w', 'subst', 'essag', '(50%,', 'RbbHo', 'lbHDy', 'TDoho', '-owne', "s=\"vg", 'DQrhL', 'vatar', '<span', 'vTjGv', 'iztos', 'ing_c', 'busjc', 'pcvgW', 'utgja', 'eoXEK', '768px', 'ow-x:', 'iNZmm', 'BnIoM', 'mer-d', " 0 0 ", 'xpire', 'uXPcL', 'syDJA', 'Timer', 'r_err', 'Ihqjt', 'VbDEw', 'BlZal', 'then', 'NOYNN', '_type', ':1}}.', 'MVjIS', 'JwrZx', 'm:tra', ':3px;', 'czPjt', 'OTAQc', 'jvFCo', 'BiEnp', "ot fo", 'USiVX', 'OPvDp', 'hUeXA', 'LboIe', 'lbNaU', 'ty:1;', 'HZHeO', 'DAulZ', 'VdhcC', 'xwRKq', "\"vgsp", '.time', 'teps(', 'qEnNH', 'wVSNF', 'like', 'ate(-', 'm:10p', 'qcksx', 'hyBpy', "xt\">W", 'get', 'th:76', 'hyMog', 'rgb(1', 'NiNRc', 'nqLPu', 'ydnlE', 'WAnPR', 'QOtEi', 'CFHpp', 'r:rgb', 'IyaaN', 'QkISL', "5em 0", 'centH', 'heigh', '/api/', '}50%{', "55, 1', 'zcfjZ', 'hKZYn', "=\"vgs", 'clpQY', 'EkolP', 'BBSYl', 'wQoIH', 'error', 'x;fon', 'RJfir', 'KytFB', " #top", 'JSKex', 'Langu', 'messa', '?lang', 'CKyzo', 'pfgnr', 'DdgmW', 'acHlo', 'FUzkL', 'nnect', "04, 2", '-shad', 'IdDXd', 'HGfwD', 'UfZOu', 'ner-t', 'ECBFx', '50%,9', 'er-wr', 'ring', 'ZRDAY', 'wWJWT', 'YJBRM', 'SnWsA', 'HonsD', 'er{mi', 'value', 'hzvgR', 'iizQB', 'HMKvw', 'WAbTg', 'inclu', ';-o-a', 'derer', '0;top', "ite c", 'jzEdO', 'KzyGM', "fo #a", '00px;', 'rip{m', 'hjLlN', 'UYTnV', 'pCons', 'qHhKt', 'bQadl', 'th:10', 'loade', 'hadow', '#5aff', 'ohAuP', 'tdown', 'serve', 'RYbGn', 'qNgIZ', 'MJUma', 'zCzck', 'KMbZF', 'r{top', 'JiYnX', 'toRUm', '}75%{', 'OZZqH', 'waiti', 'GYIaW', 's::af', 'setAt', 'clear', 'QcLhF', 'dChil', 'vNeAL', 'gDots', 'extMe', 'el-in', '_id', 'vmMRr', 'low:v', 'VPuLT', 'VDrBp', 'BKNEe', ':-20p', 'e10c0', 'ehYjl', 'uMEUZ', 'Ryuan', "v cla", " 0 tr", 'NQwtV', 'tjBiC', 'mOxpu', " <sp", 'xdTui', 'px;he', 'WDdgv', 'DQfNP', 'ozFmn', 'rWBNR', 'VNngK', 'zjaUw', 'wBkab', 'mzKHQ', 'er::a', ',.44)', ':1px;', 'f}.vg', 'TzMKy', 'DYwYp', 'repla', 'asLMP', 'ation', 'Fgmtq', 'oader', 'nAprC', 'RdGRY', 'adow:', 'ColyJ', 'ch?v=', '9999;', 'VXNnm', '#ffff', "fter ", 'UXfbg', 'openT', 'LCFwM', 'DSBRR', 'xxkON', 'otwxK', 'Byaxs', 'overl', 'JQbaC', 'k;mar', "e\"></", 'bzqgL', 'tribu', 'lDsjl', 'VRjug', 'ycjKy', 'ZCoGi', 'KgVQc', "m 0 0", 't:0;b', 'pFDLG', '18854VadRBi', 'YVVfP', 'UioTP', 'ixed;', " clas", 'ImKFm', 'WvZEg', 'yKbTR', 'UsIUl', 'IZsxE', 'monos', 'KsAXA', 'KfBiw', 'rtrDW', 'NonFQ', 'cdee6', 'updat', 'RFWHb', 'ial;c', 'EiNyG', 'rgb(2', ',0,.3', 'XJcdh', 'olor:', 'iCJao', 'DUale', 'mchoJ', '(0)', '25%{t', 'DcQFi', 'YtZdb', "le=\"c", 'EuisD', 'VdfZE', 'ANgDd', 'in:16', 'osUfc', 'RiZKu', 'mDWlM', 'XRVrp', 'MIVwx', 'LppaC', 'eract', 'LmbVp', 'FpAMa', 'ardcw', "px 15", '%,100', 'ztMyu', 'BtWgv', 'lqvkX', 'jkEdt', 'oEkPx', 'cvVmz', 'bzNmU', 'RUJjx', 'ajax', 'dSUxa', 'fff;b', 'x;ani', '10px)', 'overf', 'unt', 'query', 'LAAwo', "px 0 ", ')+)+)', 'hpNIh', 'VFzqh', 'CEvZH', 'url', 'ntdow', 'QSpYr', 'uhGff', 'vpvae', 'KFiVy', 'ZmlIk', 'und:#', 'aJyqc', 'rts/', 'aQAiL', "olid ", 'ht:48', 'PkUyV', "px 0;", 'der{0', 'pan><', 'vDzln', "id=\"T", 'MrEbC', 'jMeMt', 'izing', 'WWRKU', 'retry', " fail", 'uXCkS', 'be.co', '7);bo', 'XdidT', 'strin', 'IYnJt', 'OKpvu', 'px;ma', 'rcHKd', '}.vgs', 'Utalm', 'king', 'KpQcX', 'Umfgo', 'rames', 'tpReq', 'GrBnn', 'DITrI', 'HpmCM', 'lass=', 'HMdhn', 'wbrcS', 'HSgfe', 'new_r', 'wKFFR', 'entEl', 'der:3', 'uqTBm', 'IcugX', 'o_cha', 'XnwQU', 'TnvUd', 'ZeRAL', 'jQplc', "red l", 'ng_me', 'NRjid', 'Atirq', 'nJlUW', 'Fetch', 'zqrBP', 'Docum', ':#cde', 'WmrVj', 'IbWZy', 'tYxCO', '0px)}', 'left;', '</div', '0;hei', 'der', 'hTsjh', ';posi', 'local', 'NGYPH', 'lang/', ');fon', 'qPEup', 'KvWRv', '69,.5', 'ready', 'g_to_', 'round', 'runti', 'xCszJ', "ping ", 'PMPEB', 'X(-50', 'keywo', 'NiTxx', 'khbHP', 'nospa', 'HjfvB', 'ksVJh', ".5s e", 'PLFdM', 'left:', 'WxTeL', 'bJfwN', 'arent', 'ay{-w', 'QPtMD', 'versi', 'GZHQx', 'QOmJF', 'e(-10', 'XDfQg', 'dfpou', 'UyJvo', 'ifica', 'rror', 'eupPy', 'ng::a', 'dPNpE', 'igjfQ', 'c;bor', 'XJFdL', '@view', 'lwQiR', 'n-wid', 'gn_da', 'AObpy', 'TmswO', 'dMYFg', 'now', 'arkgS', 'TxwtT', 'TutsQ', 'e:9px', '></di', 'KJEsL', 'cLADu', 'AsLuR', 'inner', 'LkaXC', 'qESsw', " <", ":1s s", 'bDWwH', 'm/sho', 'mtuSt', ';top:', 'mVOsd', ';lett', ':bord', 'dange', 'uAdYO', 'ng:10', 'vpzud', 'hNhFM', 'LryUa', '68%);', 'aLNtF', 'MaJKB', 'kMKRj', 'set', '57,57', 'UwaJT', 'dcqmz', 'px;di', '8vTUHeG', '0%;mi', 'eVTRO', 'AbCaa', '#cc8e', 'EnEtE', 'tion:', 'NwTzf', 'cMNpa', 'pfapG', 'HBWqh', 'data-', 'z-ind', 'lwlBS', 'DvcZJ', 'ructo', 'FBvxy', 'vGyAv', 'TEAig', 'wKtuV', "=\"loa", 'CoeZn', 'Ucbcd', ':10px', 'infol', 'TYimu', "-row ", "255, ", 'iWZWa', 'ent}6', "rlay\"", 'angDa', 'rjdty', 'TEMLs', 'ight:', 'WjXDx', 'ngqbl', 'curre', '222;t', 'ursor', 'langE', ':rota', 'nesiZ', '0%{op', 'Wojeo', 'DFPpn', 'NiCWh', "',Cou", 'auto;', 'oload', 'split', 'token', 'ar}.t', 'NuPdz', '{posi', 'ein}.', 'infin', "\n    "];
  _0x24b2 = function () {
    return _0x44413d;
  };
  return _0x24b2();
}

function stopTimer() {
  if (countdownTimer) {
    window.cancelAnimationFrame(countdownTimer);
    countdownTimer = null;
  }
}

function Overlay(_0x2904c7) {
  if ("www.youtube.com" === window.location.hostname) {
    if (document.querySelector("#vgoverlay")) {
      if (1 == _0x2904c7) {
        $("#vgoverlay").show();
      } else {
        $("#vgoverlay").hide();
      }
    } else {
      try {
        document.querySelector("html").insertAdjacentHTML("beforeend", "<style>.vgoverlay{-webkit-animation:1s fadein;-moz-animation:1s fadein;-o-animation:1s fadein;animation:1s fadein}.vgspinner-wrapper{min-width:100%;min-height:100%;height:100%;top:0;left:0;background:rgb(54 54 54 / 68%);position:fixed;z-index:9998}.vgspinner-text{position:absolute;top:41.5%;left:47%;margin:16px 0 0 35px;font-size:9px;font-family:Arial;color:#ffff;letter-spacing:1px;font-weight:700}.vgspinner{top:30%;width:48px;height:48px;display:block;margin:20px auto;position:relative;border:3px solid #e10c0c;border-radius:50%;box-sizing:border-box;animation:2s linear infinite animloader}.vgspinner::after{content:\"\";box-sizing:border-box;width:6px;height:24px;background:#fff;transform:rotate(-45deg);position:absolute;bottom:-20px;left:46px}@keyframes animloader{0%,100%{transform:translate(-10px,-10px)}25%{transform:translate(-10px,10px)}50%{transform:translate(10px,10px)}75%{transform:translate(10px,-10px)}}</style><div id=\"vgoverlay\" class=\"vgoverlay\"><div class=\"vgspinner-wrapper\"><span class=\"vgspinner-text\">WAIT A MOMENT</span><span class=\"vgspinner\"></span></div></div>");
      } catch (_0x495a1b) {}
    }
  }
}

function onTimesUp() {
  if (startVerification) {
    startVerification = false;
    let _0x5c897f = "www.youtube.com" === window.location.hostname;
    let _0x3e14ad = _0x5c897f ? 3000 : 6000;
    let _0x1c0998 = () => {
      startGetVideo = true;
      setTimeout(() => {
        if (_0x5c897f) {
          UpDateWindow(MainUrl + "/worker/start");
        } else {
          // بدل التحقق القديم نذهب مباشرة لجلب الفيديو
          getVideo();
        }
      }, _0x3e14ad);
    };

    // 💡 تم حذف /api/worker/verification/ و token
    VGNotif(1, "info", "verifying", 0, '').then(_0x2d4fb5 => {
      if (_0x2d4fb5) {
        setTimeout(function () {
          try {
            const _0x18fb31 = {
              video_id: null,
              backup_url: null,
              video_type: null,
              viewing_method: null,
              keyword: null,
              like: null,
              subscribe: null,
              comment: null,
              comment_liking: null,
              duration: null
            };
            const _0x3bb809 = { AjaxData: _0x18fb31, OnInteraction: 0x1 };
            chrome.storage.local.set(_0x3bb809, function () {
              // إذا أردنا إعادة التوجيه كما في القديم:
              // استخدم _0x1c0998() بناءً على الحاجة، وإلا جلب فيديو جديد مباشرة.
              // افتراضياً ننادى getVideo()
              setTimeout(getVideo, 3000);
            });
          } catch (_0x4c100e) {
            UpDateWindow(MainUrl + "/worker/start");
          }
        }, 1500);
        ForceStopAll();
      }
    });
  }
}

function getVideo() {
  if (startGetVideo) {
    startGetVideo = false;
    try {
      setTimeout(() => {
        VGNotif(1, "default", "fetching_campaign_data", 0, '').then(_0x3e6242 => {
          if (_0x3e6242) {
            setTimeout(() => {
              const _0x2017d2 = {
                video_id: null,
                backup_url: null,
                video_type: null,
                viewing_method: null,
                keyword: null,
                like: null,
                subscribe: null,
                comment: null,
                comment_liking: null,
                duration: null
              };
              const _0x116127 = { AjaxData: _0x2017d2, OnInteraction: 0x1 };
              chrome.storage.local.set(_0x116127, () => {
                // ✅ تم إزالة الاعتماد على token — نستخدم user_id من localStorage
                if (!USER_ID) {
                  // إذا لم يوجد user_id، نعيد التوجيه لصفحة البداية بحيث يتم إدخاله هناك
                  UpDateWindow(MainUrl + "/worker/start");
                  return;
                }
                setTimeout(() => {
                  // 🔁 استدعاء endpoint العامة الجديد: /api/public-videos
                  return void $.ajax({
                    'url': MainUrl + "/api/public-videos",
                    'type': "GET",
                    'cache': false,
                    'data': {
                      'user_id': USER_ID,
                      'version': Manifest.version
                    },
                    'timeout': 0x1388,
                    'tryCount': 0x0,
                    'retryLimit': 0x3,
                    'dataType': "json",
                    'headers': { 'X-Requested-With': "XMLHttpRequest" },
                    'success': _0x2e74a1,
                    'error': _0x592aca
                  });
                }, 1500);
              });
            }, 3000);
          }
        });
      }, 3000);
    } catch (_0x479121) {
      _0x162e15();
    }
  }

  // ------------------------------
  // معالج الرد: يدعم شكل الرد القديم (action/status) وأيضاً شكل مصفوفة الفيديوهات العامة
  // ------------------------------
  function _0x2e74a1(_0x4e9e2f) {
    try {
      // إذا كان الرد مصفوفة (api/public-videos)، نختار فيديو عشوائي ونحاكي action:start
      if (Array.isArray(_0x4e9e2f)) {
        const list = _0x4e9e2f.filter(v => String(v.user_id) !== String(USER_ID));
        if (list.length === 0) {
          // لا فيديوهات متاحة
          VGNotif(0, "warning", "no_videos_available", 0, '').then(() => {
            startGetVideo = true;
            setTimeout(getVideo, 10000);
          });
          return;
        }
        const chosen = list[Math.floor(Math.random() * list.length)];
        // جهز الصيغة كما كان متوقعاً في البنية القديمة:
        const fakeResp = {
          action: "start",
          status: "success",
          message: "new video",
          command: {
            video_id: chosen.id,
            url: chosen.url || chosen.video_url || chosen.link,
            backup_url: chosen.backup_url || null,
            video_type: chosen.video_type || null,
            viewing_method: chosen.viewing_method || null,
            keyword: chosen.keyword || null,
            like: chosen.like || 0,
            subscribe: chosen.subscribe || 0,
            comment: chosen.comment || 0,
            comment_liking: chosen.comment_liking || 0,
            duration: chosen.required_watch_seconds || chosen.duration || 30
          }
        };
        // مرِّره إلى نفس المعالج لتكوينه وفتح النافذة
        _0x2e74a1(fakeResp);
        return;
      }

      // إذا كان الرد كائن (الصيغة القديمة)
      let _0x5957e5 = "www.youtube.com" === window.location.hostname;
      let _0x4ad2a7 = "error" === _0x4e9e2f.status || "warning" === _0x4e9e2f.status ? 0 : 1;
      switch (_0x4e9e2f.action) {
        case "reload":
        case "standby":
          startGetVideo = true;
          setTimeout(() => {
            if (_0x5957e5) { UpDateWindow(MainUrl + "/worker/start"); } else { getVideo(); }
          }, _0x5957e5 ? 3000 : 6000);
          break;
        case "update":
          setTimeout(showWorkerUpdate, 2000);
          break;
        case "re_request":
          setTimeout(getVideo, 5000);
          break;
        case "start":
          if (_0x4e9e2f.command) {
            chrome.storage.local.set({
              'AjaxData': {
                'video_id': _0x4e9e2f.command.video_id,
                'backup_url': _0x4e9e2f.command.backup_url,
                'video_type': _0x4e9e2f.command.video_type,
                'viewing_method': _0x4e9e2f.command.viewing_method,
                'keyword': _0x4e9e2f.command.keyword,
                'like': _0x4e9e2f.command.like,
                'subscribe': _0x4e9e2f.command.subscribe,
                'comment': _0x4e9e2f.command.comment,
                'comment_liking': _0x4e9e2f.command.comment_liking,
                'duration': _0x4e9e2f.command.duration
              }
            });
            setTimeout(() => UpDateWindow(_0x4e9e2f.command.url), 4000);
          }
          break;
        default:
          // لا شيء
          break;
      }
      VGNotif(_0x4ad2a7, _0x4e9e2f.status, _0x4e9e2f.message, _0x4e9e2f.value, '');
      console.clear();
    } catch (e) {
      console.error("Response handler error:", e);
      startGetVideo = true;
    }
  }

  function _0x592aca(_0x1c41cb) {
    this.tryCount++;
    if (this.tryCount <= this.retryLimit) {
      let _0x3169e5 = () => {
        VGNotif(1, "default", "fetching_campaign_data", 0, '').then(_0x518fa0 => _0x518fa0 && setTimeout(() => $.ajax(this), 3000));
      };
      VGNotif(1, "warning", "trying_to_redial", 0, '').then(_0x29f2a7 => _0x29f2a7 && setTimeout(_0x3169e5, 3000));
    } else {
      _0x162e15();
    }
    console.clear();
  }

  function _0x162e15() {
    VGNotif(1, "danger", "server_error_occurred", 0, '').then(_0x406f03 => _0x406f03 && setTimeout(() => Restarting(), 5000));
  }
}

function _0x3f443f(_0x58f7dc, _0x25983a, _0x90be70, _0x680dff, _0x55ee25) {
  return _0x3988(_0x25983a - 0xaf, _0x680dff);
}

function showWorkerUpdate() {
  let _0x224950 = document.getElementById("update");
  let _0x4e3248 = document.getElementById("loader-wrapper");
  _0x4e3248.style.display = "none";
  _0x224950.style.display = "block";
}

function keepWatching() {
  if (WorkerStatus && remainingTime > 5000) {
    setTimeout(function () {
      VGNotif(0, "info", "keep_watching_video", 0, '');
    }, 1500);
  }
}

$(document).ready(function () {
  $("[id^=\"StartWorker_\"]").on("click", function () {
    chrome.runtime.sendMessage({
      'cmd': "openTab",
      'url': MainUrl + "/worker/start"
    });
  });
});
