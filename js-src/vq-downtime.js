/* ══════════════════════════════════════════════════════════════════════
   vq-downtime — ダウンタイム（サービスを 止めている 間）の 1 枚

   訴え（2026-08-20）:
     「ダッシュボードから ダウンタイムを 有効にできるように。
       ダウンタイム中には、ダウンタイムを オンにしたら 登録者は 全員
       ログアウトされ、ログインしても、登録しても、ダウンタイム中の
       モーダルが 出て、何も 操作は できなくなる。
       ホーム画面で モーダルは 背景ぼかし。
       どんな 理由で ダウンタイム中なのかも 表示されるように。アイコンと。
       そこに 見出しと、理由も。何時から 何時までとかも あれば」

   決めごと:
     ・**止めているかどうかは サーバが 決める。** ここは 出すだけ。
       画面の 印を いじられても、API が 503 を 返すので 何も できない。
     ・気づきかたは 2 通り
         ① 起きたときに /api/public/config を 1 回 見る
         ② どの API でも 503（code: MAINTENANCE）が 返ったら 出す
       ②が あるので、ログインの 途中でも 登録の 途中でも 必ず 出る。
     ・出したら **合言葉を 消す**（＝ ログアウト）。サーバ側でも 切れている。
     ・閉じる口は 置かない。終わったら 自分で 消える（30 秒ごとに 見る）。

   気をつけること:
     ・影の DOM に 入れる（本体の CSS に 触られない・触らない）
     ・いちばん 上（z-index）に 置く。読み込みの 覆いより 上。
     ・背景ぼかしは backdrop-filter。効かない 端末でも 濃い 幕で 隠れる。
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  if (window.__vqDowntimeInstalled) return;
  window.__vqDowntimeInstalled = true;

  var TOKEN_KEY = "app.auth.token.v1";
  var 見に行く間 = 30000;

  /* ── 印（管理ダッシュボードと **同じ 7 つ**）──────────────────
     ずれると、管理画面で 選んだ 印と ここに 出る 印が 食い違う。 */
  var ICON = {
    wrench: '<path d="M14.7 6.3a4 4 0 0 0 5 5l-8.4 8.4a2.1 2.1 0 0 1-3-3Z"/><path d="M14.7 6.3 17 4l3 3-2.3 2.3"/>',
    bolt: '<path d="M13 2 4 14h6l-1 8 9-12h-6Z"/>',
    cloud: '<path d="M17.5 19a4.5 4.5 0 0 0 .5-9 6 6 0 0 0-11.6 1.5A3.8 3.8 0 0 0 7 19Z"/>',
    shield: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6Z"/><path d="m9 12 2 2 4-4"/>',
    sparkles: '<path d="m12 3 1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9Z"/><path d="m18.6 15 .7 1.7 1.7.7-1.7.7-.7 1.7-.7-1.7-1.7-.7 1.7-.7Z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    alert: '<path d="M12 3 2.5 20h19Z"/><path d="M12 10v4M12 17v.5"/>'
  };
  function svg(k) {
    return '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"'
      + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + (ICON[k] || ICON.wrench) + "</svg>";
  }
  function esc(s) {
    return String(s === undefined || s === null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* ── 何時から 何時まで ──────────────────────────────────────── */
  function 時(ms) {
    var d = new Date(Number(ms));
    var 今 = new Date();
    var 同じ日 = d.getFullYear() === 今.getFullYear() && d.getMonth() === 今.getMonth() && d.getDate() === 今.getDate();
    var hm = ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
    return 同じ日 ? hm : ((d.getMonth() + 1) + "月" + d.getDate() + "日 " + hm);
  }
  function 期間(m) {
    var s = Number(m && m.startAt) || 0, e = Number(m && m.endAt) || 0;
    if (s && e) return 時(s) + " 〜 " + 時(e);
    if (s) return 時(s) + " から";
    if (e) return 時(e) + " まで";
    return "";
  }

  var CSS = [
    "*{box-sizing:border-box;margin:0;padding:0}",
    ":host{position:fixed;inset:0;z-index:2147483646;display:none;",
      "font-family:Inter,'Hiragino Sans','Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif}",
    ":host([data-open='1']){display:block}",
    /* ★ 背景ぼかし。効かない 端末でも 幕だけで 隠れるよう、色も 濃くする。 */
    ".mak{position:absolute;inset:0;background:rgba(28,24,44,.55);",
      "backdrop-filter:blur(14px) saturate(120%);-webkit-backdrop-filter:blur(14px) saturate(120%);",
      "display:flex;align-items:center;justify-content:center;padding:24px}",
    ".box{width:min(460px,100%);background:#fff;border-radius:22px;padding:34px 28px 30px;text-align:center;",
      "box-shadow:0 24px 70px rgba(20,14,44,.34);animation:up .28s cubic-bezier(.2,.8,.2,1)}",
    "@keyframes up{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}",
    ".mk{width:74px;height:74px;border-radius:50%;margin:0 auto 18px;display:inline-flex;",
      "align-items:center;justify-content:center;background:#F1EFF8;color:#5B4EAE}",
    ".ic{width:36px;height:36px}",
    "h1{font-size:22px;font-weight:800;color:#241F33;line-height:1.5;letter-spacing:-.01em}",
    ".when{margin-top:9px;display:inline-flex;align-items:center;gap:6px;padding:5px 13px;border-radius:99px;",
      "background:#F2F0F8;color:#4F4A60;font-size:13px;font-weight:700}",
    ".why{margin-top:16px;font-size:15.5px;line-height:1.95;color:#3D3A4A;white-space:pre-wrap;text-align:left}",
    ".note{margin-top:20px;padding-top:16px;border-top:1px solid #ECEAF4;font-size:12.5px;color:#6B6480;line-height:1.8}",
    "@media (max-width:420px){.box{padding:28px 20px 24px;border-radius:18px}h1{font-size:19.5px}.why{font-size:15px}}"
  ].join("");

  var host = null, root = null, 出ている = false, 時計 = 0;

  function 建てる() {
    if (host) return;
    host = document.createElement("div");
    host.id = "vqDowntime";
    host.setAttribute("data-open", "0");
    host.setAttribute("role", "alertdialog");
    host.setAttribute("aria-modal", "true");
    root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    var s = document.createElement("style"); s.textContent = CSS; root.appendChild(s);
    var w = document.createElement("div"); w.className = "mak"; root.appendChild(w);
    document.body.appendChild(host);
  }

  function 描く(m) {
    建てる();
    var 中 = root.querySelector(".mak");
    var き = 期間(m);
    中.innerHTML = '<div class="box">'
      + '<span class="mk">' + svg(String(m.icon || "wrench")) + "</span>"
      + "<h1>" + esc(m.title || "メンテナンス中") + "</h1>"
      + (き ? '<div class="when">' + esc(き) + "</div>" : "")
      + '<p class="why">' + esc(m.message || "") + "</p>"
      + '<p class="note">この間は ログインも 新規登録も できません。'
      + "終わりましたら この画面は ひとりでに 消えます。</p>"
      + "</div>";
  }

  /* ── 触れないようにする ───────────────────────────────────── */
  function 止める(e) {
    if (!出ている) return;
    if (host && (e.target === host || (e.composedPath && e.composedPath().indexOf(host) >= 0))) return;
    e.stopPropagation();
    if (e.cancelable) e.preventDefault();
  }
  var 塞ぐ種 = ["click", "mousedown", "mouseup", "touchstart", "touchend", "keydown", "keypress", "wheel", "submit"];
  function 塞ぎを掛ける(on) {
    塞ぐ種.forEach(function (k) {
      if (on) window.addEventListener(k, 止める, true);
      else window.removeEventListener(k, 止める, true);
    });
    try { document.documentElement.style.overflow = on ? "hidden" : ""; } catch (e) {}
    try { document.body.style.overflow = on ? "hidden" : ""; } catch (e) {}
  }

  function 出す(m) {
    描く(m);
    if (!出ている) {
      出ている = true;
      host.setAttribute("data-open", "1");
      塞ぎを掛ける(true);
      /* ★ 合言葉を 消す ＝ ログアウト。サーバ側でも 切れている。 */
      try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
      /* 会話や 録音など、動いているものは 止める（音が 鳴り続けないように）。 */
      try { if (window.__vqLive && window.__vqLive.close) window.__vqLive.close(); } catch (e) {}
      try { if (window.__vqDM && window.__vqDM.閉じる) window.__vqDM.閉じる(); } catch (e) {}
      try { document.documentElement.setAttribute("data-vq-downtime", "1"); } catch (e) {}
    }
    見張る();
  }
  function しまう() {
    if (!出ている) return;
    出ている = false;
    if (host) host.setAttribute("data-open", "0");
    塞ぎを掛ける(false);
    try { document.documentElement.removeAttribute("data-vq-downtime"); } catch (e) {}
    /* 止まっている 間に 合言葉を 消しているので、素直に 開き直す。 */
    try { location.reload(); } catch (e) {}
  }

  function 見張る() {
    clearTimeout(時計);
    時計 = setTimeout(調べる, 見に行く間);
  }

  function 読み取る(j) {
    var m = (j && j.maintenance)
      || (j && j.appConfig && j.appConfig.maintenance)
      || null;
    if (!m || typeof m !== "object") return null;
    return m.active ? m : null;
  }

  function 調べる() {
    return fetch("/api/public/config", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var m = 読み取る(j);
        if (m) 出す(m); else しまう();
      })
      .catch(function () { 見張る(); });
  }

  /* ── どの API でも 503 が 返ったら 出す ───────────────────────
     ログインの 途中でも 登録の 途中でも、必ず ここを 通る。 */
  var 元のfetch = window.fetch;
  window.fetch = function (input, init) {
    var p = 元のfetch.apply(this, arguments);
    try {
      return p.then(function (res) {
        try {
          if (res && res.status === 503) {
            var 写 = res.clone();
            写.json().then(function (j) {
              if (j && j.code === "MAINTENANCE") {
                var m = 読み取る(j) || j.maintenance;
                if (m) 出す(m);
              }
            }).catch(function () {});
          }
        } catch (e) {}
        return res;
      });
    } catch (e) { return p; }
  };
  /* 昔ながらの XHR も 見る（本体の 一部は こちらを 使う）。 */
  try {
    var 元open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function () {
      this.addEventListener("load", function () {
        try {
          if (this.status !== 503) return;
          var j = JSON.parse(this.responseText || "{}");
          if (j && j.code === "MAINTENANCE" && j.maintenance) 出す(j.maintenance);
        } catch (e) {}
      });
      return 元open.apply(this, arguments);
    };
  } catch (e) {}

  /* ── 外へ出す口（確かめるとき用）────────────────────────────── */
  window.__vqDowntime = {
    調べる: 調べる,
    出ているか: function () { return 出ている; },
    見せる: function (m) { 出す(m || { title: "メンテナンス中", message: "確認用", icon: "wrench" }); },
    しまう: function () {
      if (!出ている) return false;
      出ている = false;
      if (host) host.setAttribute("data-open", "0");
      塞ぎを掛ける(false);
      try { document.documentElement.removeAttribute("data-vq-downtime"); } catch (e) {}
      return true;
    },
    印: function () { return Object.keys(ICON); }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", 調べる);
  else 調べる();
})();
