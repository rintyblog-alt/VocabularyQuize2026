/* ══════════════════════════════════════════════════════════════════════
   vq-banned — このアカウントは 使えません、の 1 枚

   訴え（2026-09-05）:
     「テストアカウントで Ban 機能 試したんだけど、一切 適用されてない 気が する」

   実測（直す前）:
     サーバの 関門（admin.js の userStatusBlock）は **正しく 効いていた**。
       423 ACCOUNT_BANNED  … /api/qredit/summary, /api/preset/save,
                             /api/aigen/questions, /api/feed/timeline …
     ところが
       ① /api/auth/me は わざと 通していて、**状態を 載せて いなかった**
          （自分の 状態を 見る 口なので 塞げない。でも 中身が 空だった）
       ② 画面に **ACCOUNT_BANNED を 見る コードが 1 つも なかった**
          （client/ も js-src/ も 0 件）
     ＝ サーバは 止めて いるのに 画面は 黙って 動き続ける ＝「効いていない」。

   決めごと:
     ・**止めるかどうかは サーバが 決める。** ここは 出すだけ。
       画面の 印を いじられても API が 423 を 返すので 何も できない。
     ・気づきかたは 2 通り（ダウンタイムと 同じ 考えかた）
         ① 起きた ときに /api/auth/me を 見る（accountStatus）
         ② どの API でも 423 が 返ったら 出す
       ②が あるので、操作の 途中でも 必ず 出る。
     ・出したら **合言葉を 消す**（＝ ログアウト）。
     ・閉じる口は「ログイン画面へ」。別の アカウントでは 入れる。
     ・**一部だけの 停止**（生成だけ・公開だけ）は 全画面に しない。
       その 操作を した ときに 出る 帯だけで 知らせる。

   関わる もの:
     server/src/admin.js  userStatusBlock … 実際に 止める
     server/src/worker.js loadUserStatusForMe … /api/auth/me に 状態を 載せる
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  if (window.__vqBannedInstalled) return;
  window.__vqBannedInstalled = true;

  var TOKEN_KEY = "app.auth.token.v1";

  function esc(s) {
    return String(s === undefined || s === null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* ── 状態ごとの 言いかた ────────────────────────────────────
     理由の 本文は 出さない（サーバも 返して いない）。
     区分（reason）は 出す。何が 起きたかは 分かる ように する。 */
  var 文 = {
    banned:  { 題: "このアカウントは ご利用いただけません",
               体: "管理者の 判断により、アカウントの ご利用を 停止しました。\nお心当たりが ない 場合は お問い合わせください。" },
    deleted: { 題: "このアカウントは 削除されています",
               体: "アカウントが 削除されました。\n復旧を ご希望の 場合は お問い合わせください。" },
    purged:  { 題: "このアカウントは 削除されています",
               体: "アカウントは 恒久的に 削除されました。" },
    suspended: { 題: "このアカウントは 一時的に 停止しています",
               体: "一時的に ご利用を 停止しています。\n期限を 過ぎると 自動で 戻ります。" }
  };
  var 区分の名 = {
    spam: "迷惑行為", abuse: "他の人への 迷惑", cheat: "不正な 利用",
    payment: "支払いに ついて", security: "安全に ついて", other: "その他"
  };

  function 時(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (!(d.getTime() > 0)) return "";
    return (d.getMonth() + 1) + "月" + d.getDate() + "日 "
      + ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
  }

  var CSS = [
    "*{box-sizing:border-box;margin:0;padding:0}",
    ":host{position:fixed;inset:0;z-index:2147483645;display:none;",
      "font-family:Inter,'Hiragino Sans','Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif}",
    ":host([data-open='1']){display:block}",
    ".mak{position:absolute;inset:0;background:rgba(28,24,44,.58);",
      "backdrop-filter:blur(14px) saturate(120%);-webkit-backdrop-filter:blur(14px) saturate(120%);",
      "display:flex;align-items:center;justify-content:center;padding:24px}",
    ".box{width:min(440px,100%);background:#fff;border-radius:22px;padding:34px 28px 26px;text-align:center;",
      "box-shadow:0 24px 70px rgba(20,14,44,.34);animation:up .28s cubic-bezier(.2,.8,.2,1)}",
    "@keyframes up{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}",
    ".mk{width:74px;height:74px;border-radius:50%;margin:0 auto 18px;display:inline-flex;",
      "align-items:center;justify-content:center;background:#FCEDED;color:#B4453F}",
    ".ic{width:36px;height:36px}",
    "h1{font-size:21px;font-weight:800;color:#241F33;line-height:1.55;letter-spacing:-.01em}",
    ".tag{margin-top:10px;display:inline-flex;align-items:center;gap:6px;padding:5px 13px;border-radius:99px;",
      "background:#F2F0F8;color:#4F4A60;font-size:13px;font-weight:700}",
    ".why{margin-top:16px;font-size:15.5px;line-height:1.95;color:#3D3A4A;white-space:pre-wrap;text-align:left}",
    ".btn{margin-top:22px;width:100%;height:48px;border:0;border-radius:14px;cursor:pointer;",
      "background:#5B4EAE;color:#fff;font-size:15px;font-weight:700;font-family:inherit}",
    ".btn:active{opacity:.86}",
    ".note{margin-top:14px;font-size:12.5px;color:#6B6480;line-height:1.8}",
    "@media (max-width:420px){.box{padding:28px 20px 22px;border-radius:18px}h1{font-size:19px}.why{font-size:15px}}"
  ].join("");

  var host = null, root = null, 出ている = false;

  function 建てる() {
    if (host) return;
    host = document.createElement("div");
    host.id = "vqBanned";
    host.setAttribute("data-open", "0");
    host.setAttribute("role", "alertdialog");
    host.setAttribute("aria-modal", "true");
    root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    var s = document.createElement("style"); s.textContent = CSS; root.appendChild(s);
    var w = document.createElement("div"); w.className = "mak"; root.appendChild(w);
    document.body.appendChild(host);
  }

  function 描く(st) {
    建てる();
    var f = 文[String(st.state || "banned")] || 文.banned;
    var 区 = 区分の名[String(st.reason || "")] || "";
    var まで = st.state === "suspended" ? 時(st.until) : "";
    root.querySelector(".mak").innerHTML = '<div class="box">'
      + '<span class="mk"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor"'
      + ' stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg></span>'
      + "<h1>" + esc(f.題) + "</h1>"
      + (区 ? '<div class="tag">' + esc(区) + "</div>" : "")
      + (まで ? '<div class="tag">' + esc(まで) + " まで</div>" : "")
      + '<p class="why">' + esc(f.体) + "</p>"
      + '<button class="btn" data-go>ログイン画面へ</button>'
      + '<p class="note">別の アカウントでは そのまま ご利用いただけます。</p>'
      + "</div>";
    var b = root.querySelector("[data-go]");
    if (b) b.onclick = function () {
      try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
      try { location.replace("/"); } catch (e) { location.reload(); }
    };
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

  function 出す(st) {
    if (!st) return;
    描く(st);
    if (出ている) return;
    出ている = true;
    host.setAttribute("data-open", "1");
    塞ぎを掛ける(true);
    /* ★ 合言葉を 消す ＝ ログアウト。サーバ側でも 弾いている。
       ★ 1 回 消すだけでは 戻る。本体が 起動の 途中で **書き戻す**
         （実測: 消した 直後に 同じ 合言葉が 入って いた）。
         少し 遅れて 何度か 消す。 */
    var 消す = function () { try { localStorage.removeItem(TOKEN_KEY); } catch (e) {} };
    消す();
    [300, 900, 2000, 4000].forEach(function (t) { setTimeout(消す, t); });
    /* 動いて いる ものを 止める（音が 鳴り続けない ように）。 */
    try { if (window.__vqLive && window.__vqLive.close) window.__vqLive.close(); } catch (e) {}
    try { if (window.__vqDM && window.__vqDM.閉じる) window.__vqDM.閉じる(); } catch (e) {}
    try { document.documentElement.setAttribute("data-vq-banned", "1"); } catch (e) {}
  }

  /* ── 一部だけの 停止（生成だけ・公開だけ）は 帯で 知らせる ────── */
  var 帯が出ている = false;
  function 帯(code, msg) {
    if (帯が出ている) return;
    帯が出ている = true;
    var d = document.createElement("div");
    d.setAttribute("role", "status");
    d.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);"
      + "top:calc(var(--vq-sat,0px) + 14px);z-index:2147483644;max-width:min(92vw,420px);"
      + "background:#3D2B2B;color:#fff;border-radius:14px;padding:12px 16px;"
      + "font:600 14px/1.7 Inter,'Hiragino Sans',sans-serif;box-shadow:0 10px 30px rgba(20,14,44,.34)";
    d.textContent = msg || "この操作は 一時的に 停止しています。";
    document.body.appendChild(d);
    setTimeout(function () { try { d.remove(); } catch (e) {} 帯が出ている = false; }, 5200);
  }

  /* ── ① 起きた ときに 自分の 状態を 見る ───────────────────── */
  function 調べる() {
    var t = "";
    try { t = localStorage.getItem(TOKEN_KEY) || ""; } catch (e) {}
    if (!t) return Promise.resolve(null);
    return fetch("/api/auth/me", { headers: { Authorization: "Bearer " + t }, cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var st = j && j.accountStatus;
        if (st && st.blocked) 出す(st);
        return st || null;
      })
      .catch(function () { return null; });
  }

  /* ── ② どの API でも 423 が 返ったら 出す ──────────────────── */
  var 全画面にする = { ACCOUNT_BANNED: 1, ACCOUNT_SUSPENDED: 1 };
  var 帯にする = {
    GENERATION_SUSPENDED: "生成の ご利用を 一時的に 停止しています。",
    PUBLISH_SUSPENDED: "公開の ご利用を 一時的に 停止しています。"
  };
  function 受ける(j) {
    if (!j || !j.code) return;
    if (全画面にする[j.code]) {
      出す({ state: j.code === "ACCOUNT_BANNED" ? "banned" : "suspended",
             reason: String(j.reason || ""), until: String(j.until || ""), blocked: true });
      return;
    }
    if (帯にする[j.code]) 帯(j.code, 帯にする[j.code]);
  }

  var 元のfetch = window.fetch;
  window.fetch = function () {
    var p = 元のfetch.apply(this, arguments);
    try {
      return p.then(function (res) {
        try {
          if (res && res.status === 423) {
            res.clone().json().then(受ける).catch(function () {});
          }
        } catch (e) {}
        return res;
      });
    } catch (e) { return p; }
  };
  try {
    var 元open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function () {
      this.addEventListener("load", function () {
        try {
          if (this.status !== 423) return;
          受ける(JSON.parse(this.responseText || "{}"));
        } catch (e) {}
      });
      return 元open.apply(this, arguments);
    };
  } catch (e) {}

  /* ── 外へ出す口（確かめる とき用）──────────────────────────── */
  window.__vqBanned = {
    調べる: 調べる,
    出ているか: function () { return 出ている; },
    見せる: function (st) { 出す(st || { state: "banned", reason: "other", blocked: true }); },
    受ける: 受ける,
    しまう: function () {
      if (!出ている) return false;
      出ている = false;
      if (host) host.setAttribute("data-open", "0");
      塞ぎを掛ける(false);
      try { document.documentElement.removeAttribute("data-vq-banned"); } catch (e) {}
      return true;
    }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", 調べる);
  else 調べる();
})();
