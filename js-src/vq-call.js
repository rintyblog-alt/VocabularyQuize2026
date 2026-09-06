/* ══════════════════════════════════════════════════════════════════════════
   vq-call — DM の 音声通話（画面側）

   ★ **通話して よいかは 画面では 決めない。** ここは 見た目と 音だけ。
     ボタンを 隠すのは 親切のため であって 制御では ない。
     どの 操作も サーバの /api/call/* を 通し、断られたら その まま 従う。

   ★ **必ず SFU（Cloudflare Realtime）を 通す。** P2P に しない。
     1 対 1 でも 相手に IP を 見せない ため。
     SFU の 鍵は サーバに あり、ここへは 来ない（中継だけ してもらう）。

   ★ **音声は 残さない。** 録らない・送らない・保存しない。

   ここに ある もの:
     ① 合図の 通り道（/ws/call への WebSocket。受け取る だけ）
     ② 同意の 画面（初回だけ。年齢の 確認は しない）
     ③ かける／着信／通話中 の 窓
     ④ SFU との つなぎ（publish / subscribe / 再交渉 / 後始末）
     ⑤ 通報（その場で 切る → 自動で ブロック → Admin へ）
     ⑥ Lumi の 呼び出し（**両者が 同意した ときだけ**）
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  if (window.__vqCallInstalled) return;
  window.__vqCallInstalled = true;

  var TOKEN_KEY = "app.auth.token.v1";
  function token() {
    try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; }
  }
  function api(path, opts) {
    var o = opts || {};
    var h = { "Content-Type": "application/json" };
    var t = token();
    if (t) h.Authorization = "Bearer " + t;
    return fetch(path, {
      method: o.method || "GET",
      headers: h,
      body: o.body === undefined ? undefined : JSON.stringify(o.body)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.message || "失敗しました"); e.code = j.code; e.status = r.status; throw e; }
        return j;
      });
    });
  }
  /* 閉じる 途中でも 届かせる（keepalive）。返事は 待たない。 */
  function 送りっぱなし(path, body) {
    try {
      var h = { "Content-Type": "application/json" };
      var t = token();
      if (t) h.Authorization = "Bearer " + t;
      fetch(path, { method: "POST", headers: h, body: JSON.stringify(body || {}), keepalive: true })
        .catch(function () {});
    } catch (e) {}
  }
  function esc(s) {
    return String(s === undefined || s === null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function 音を出してよいか() {
    /* 設定の「効果音」を 尊重する。読めなければ 出す。 */
    try {
      var raw = localStorage.getItem("app.settings.v1");
      if (!raw) return true;
      var o = JSON.parse(raw) || {};
      if (o["sound.sfx"] === false) return false;
      if (o.sound && o.sound.sfx === false) return false;
      if (o.values && o.values["sound.sfx"] === false) return false;
    } catch (e) {}
    return true;
  }

  /* ── 絵（線画。外から 画像を 取りに行かない）───────────────────────── */
  var P = 'fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"';
  var ICON = {
    phone: '<path ' + P + ' d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.2.4 2.4.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.4c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .8-.2 1z"/>',
    hangup: '<path ' + P + ' d="M2.5 12.5c5-4.7 14-4.7 19 0l-2.2 2.2a2 2 0 0 1-2.4.3l-1.7-1a1.4 1.4 0 0 1-.7-1.2v-1.3a11 11 0 0 0-5 0v1.3c0 .5-.3 1-.7 1.2l-1.7 1a2 2 0 0 1-2.4-.3z"/>',
    mic: '<path ' + P + ' d="M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z"/><path ' + P + ' d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    micoff: '<path ' + P + ' d="M9 6a3 3 0 0 1 6 0v3M15 12.5a3 3 0 0 1-6-.5V9"/><path ' + P + ' d="M5 11a7 7 0 0 0 11.3 5.5M12 18v3"/><path ' + P + ' d="M3 3l18 18"/>',
    speaker: '<path ' + P + ' d="M4 9v6h4l5 4V5L8 9H4z"/><path ' + P + ' d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
    flag: '<path ' + P + ' d="M5 3v18M5 4h11l-1.5 3L16 10H5"/>',
    spark: '<path ' + P + ' d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9z"/>',
    x: '<path ' + P + ' d="M6 6l12 12M18 6L6 18"/>',
    shield: '<path ' + P + ' d="M12 3l7 3v6c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6z"/>',
    /* 画面の 同席（映像では ないので 画面の 枠だけ） */
    screen: '<path ' + P + ' d="M3.5 5h17v10.5h-17zM9 19h6M12 15.5V19"/>',
    /* 畳む／戻す */
    fold: '<path ' + P + ' d="M6 9l6 6 6-6"/>',
    unfold: '<path ' + P + ' d="M6 15l6-6 6 6"/>'
  };
  function svg(n, cls) {
    return '<svg viewBox="0 0 24 24" class="' + (cls || "i") + '" aria-hidden="true">' + (ICON[n] || "") + "</svg>";
  }

  /* ── 見た目 ─────────────────────────────────────────────────────────── */
  var CSS = [
    "*{box-sizing:border-box;margin:0;padding:0}",
    ":host{position:fixed;inset:0;z-index:2147483200;display:none;",
      "font-family:var(--vq-app-font,Inter,'Hiragino Sans','Noto Sans JP',sans-serif);",
      "color:var(--vq-text,#2B2836)}",
    /* ★ 中央ぞろえは **transform で やらない**。
       出るときの 動き（vqcUp）が transform を 使うので、
       left:50% + translate(-50%) と 取り合いに なって **札が 右へ ずれる**
       （実測 375px で 右端が 541px に なった）。並べる 側で 中央へ 寄せる。 */
    ":host([data-open='1']){display:grid;place-items:center;padding:12px}",
    "button{font:inherit;color:inherit;background:none;border:0;cursor:pointer}",
    ".i{width:22px;height:22px;flex:0 0 auto}",
    ".i.s{width:18px;height:18px}",

    /* 幕 */
    ".bd{position:absolute;inset:0;background:rgba(16,14,26,.62);",
      "-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);",
      "animation:vqcBd .18s ease both}",
    "@keyframes vqcBd{from{opacity:0}to{opacity:1}}",
    "@keyframes vqcUp{from{opacity:0;transform:translateY(16px) scale(.97)}to{opacity:1;transform:none}}",
    "@keyframes vqcPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.06);opacity:.86}}",

    /* 札 */
    ".w{position:relative;",
      "width:min(420px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto;",
      "background:var(--vq-surface,#fff);border-radius:26px;",
      "border:1px solid var(--vq-border,#E7E4EF);",
      "box-shadow:0 26px 80px rgba(16,14,26,.34);",
      "padding:26px 22px calc(22px + var(--vq-sab,0px));",
      "animation:vqcUp .26s cubic-bezier(.22,1,.36,1) both}",
    "@media (prefers-reduced-motion:reduce){.bd,.w{animation:none}}",

    ".ttl{font-size:13px;font-weight:750;letter-spacing:.06em;text-align:center;",
      "color:var(--vq-text-secondary,#6B6480)}",
    ".face{width:104px;height:104px;border-radius:50%;margin:16px auto 0;overflow:hidden;",
      "display:grid;place-items:center;background:var(--vq-accent-subtle,#EAE8F7);",
      "color:var(--vq-accent-text,#5F5691);font-size:38px;font-weight:700}",
    ".face img{width:100%;height:100%;object-fit:cover;display:block}",
    ".face.ring{animation:vqcPulse 1.6s ease-in-out infinite}",
    ".nm{margin-top:14px;text-align:center;font-size:21px;font-weight:750}",
    ".sub{margin-top:5px;text-align:center;font-size:13.5px;color:var(--vq-text-secondary,#6B6480)}",
    ".tm{margin-top:6px;text-align:center;font-size:15px;font-weight:700;font-variant-numeric:tabular-nums}",

    /* 押すところ。**44×44 より 小さくしない。** */
    ".rowb{display:flex;justify-content:center;gap:22px;margin-top:26px;flex-wrap:wrap}",
    ".rb{width:64px;height:64px;border-radius:50%;display:grid;place-items:center;color:#fff;",
      "box-shadow:0 8px 22px rgba(16,14,26,.22)}",
    ".rb .i{width:26px;height:26px}",
    ".rb.ok{background:#2FA96B}",
    ".rb.ng{background:#D9445F}",
    ".rb.sm{width:52px;height:52px;background:var(--vq-surface-sunken,#F4F2FB);color:var(--vq-text,#2B2836);",
      "box-shadow:none;border:1px solid var(--vq-border-subtle,#E7E4EF)}",
    ".rb.sm.on{background:var(--vq-accent-subtle,#EAE8F7);color:var(--vq-accent-text,#5F5691)}",
    ".rb:active{transform:scale(.94)}",
    ".cap{width:64px;text-align:center;font-size:11.5px;margin-top:7px;color:var(--vq-text-secondary,#6B6480)}",
    ".bcol{display:flex;flex-direction:column;align-items:center;min-width:64px}",

    ".note{margin-top:18px;padding:11px 13px;border-radius:14px;font-size:12.5px;line-height:1.8;",
      "background:var(--vq-surface-sunken,#F4F2FB);color:var(--vq-text-secondary,#6B6480)}",
    ".err{margin-top:14px;padding:11px 13px;border-radius:14px;font-size:13px;line-height:1.7;",
      "background:var(--vq-danger-bg,#FBE9EE);color:var(--vq-danger-text,#B23A55)}",
    ".st{margin-top:10px;text-align:center;font-size:12.5px;color:var(--vq-text-secondary,#6B6480)}",
    ".lumi{margin-top:14px;padding:10px 13px;border-radius:14px;font-size:13px;font-weight:650;",
      "display:flex;align-items:center;gap:8px;justify-content:center;",
      "background:var(--vq-accent-subtle,#EAE8F7);color:var(--vq-accent-text,#5F5691)}",

    /* 同意・通報の 中身 */
    ".h2{font-size:19px;font-weight:750;text-align:center;margin-top:6px}",
    ".p{margin-top:12px;font-size:13.5px;line-height:1.9;color:var(--vq-text-secondary,#5F5A70)}",
    ".ul{margin-top:12px;display:grid;gap:8px}",
    ".li{display:flex;gap:9px;font-size:13.5px;line-height:1.75;align-items:flex-start}",
    ".li b{flex:0 0 auto;color:var(--vq-accent-text,#5F5691)}",
    ".opt{display:flex;gap:11px;align-items:flex-start;width:100%;text-align:left;padding:12px 13px;",
      "border-radius:14px;border:1px solid var(--vq-border,#E7E4EF);background:var(--vq-surface,#fff)}",
    ".opt[aria-pressed='true']{border-color:var(--vq-border-focus,#9A8CE0);",
      "background:var(--vq-accent-subtle,#EAE8F7)}",
    ".ck{width:19px;height:19px;flex:0 0 auto;margin-top:2px;border-radius:50%;",
      "border:2px solid var(--vq-border-strong,#D7D2E4);display:grid;place-items:center}",
    ".opt[aria-pressed='true'] .ck{border-color:var(--vq-accent,#756DB3)}",
    ".ck i{width:9px;height:9px;border-radius:50%;background:transparent;display:block}",
    ".opt[aria-pressed='true'] .ck i{background:var(--vq-accent,#756DB3)}",
    ".on{font-size:14px;font-weight:700;display:block}",
    ".od{font-size:12px;color:var(--vq-text-secondary,#6B6480);display:block;margin-top:2px}",
    "textarea{width:100%;box-sizing:border-box;font:inherit;font-size:14px;margin-top:12px;",
      "padding:10px 12px;min-height:96px;line-height:1.8;resize:vertical;",
      "border:1px solid var(--vq-border,#E7E4EF);border-radius:13px;",
      "background:var(--vq-surface,#fff);color:var(--vq-text,#2B2836)}",
    ".ft{display:flex;gap:9px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap}",
    ".btn{height:44px;padding:0 18px;border-radius:13px;font-size:14.5px;font-weight:650;",
      "display:inline-flex;align-items:center;justify-content:center;",
      "border:1px solid var(--vq-border,#E7E4EF);background:var(--vq-surface,#fff)}",
    ".btn.pri{background:var(--vq-accent,#756DB3);border-color:var(--vq-accent,#756DB3);color:#fff}",
    ".btn.dan{background:var(--vq-danger,#C0392B);border-color:var(--vq-danger,#C0392B);color:#fff}",
    ".btn[disabled]{opacity:.5;cursor:default}",

    /* ══ 畳んだ 姿 ═══════════════════════════════════════════════════════
       ★ 通話の 窓は 画面 いっぱいの 幕。**このままだと アプリが 使えない**ので、
         画面を 同席する ときは 必ず 畳める ように する。
         畳んだ ときは 幕を 消し、押せる ところ以外は 触りが 下へ 通り抜ける。 */
    ":host([data-open='1'][data-min='1']){display:block;inset:auto;left:0;right:0;",
      "top:calc(var(--vq-sat,0px) + 8px);padding:0 8px;",
      "pointer-events:none;z-index:2147483200}",
    ":host([data-min='1']) .bd,:host([data-min='1']) .w{display:none}",
    /* 幅の 狭い 端末の 上書き（下の @media より 後ろに 置けないので 詳細度で 勝つ） */
    /* ★ 幅に vw を 使わない（実測 375px で 右が 10px はみ出した）。
       器は left:0/right:0＋左右の 余白 なので、100% が いつでも 正しい。 */
    ".mini{pointer-events:auto;width:100%;max-width:420px;margin:0 auto;",
      "display:grid;gap:6px}",
    /* ★ 押すところは **44×44 より 小さくしない**（この 器の 決めごと）。
       細くしたい 気持ちが 出る ところだが、指では 押せなく なる。 */
    ".pill{display:flex;align-items:center;gap:4px;height:52px;padding:0 4px 0 13px;",
      "border-radius:999px;background:var(--vq-surface,#fff);",
      "border:1px solid var(--vq-border,#E7E4EF);",
      "box-shadow:0 10px 30px rgba(16,14,26,.20)}",
    ".pill .dot{width:8px;height:8px;border-radius:50%;background:#2FA96B;flex:0 0 auto;",
      "animation:vqcPulse 1.8s ease-in-out infinite}",
    ".pill .who{font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;",
      "white-space:nowrap;min-width:0;flex:1 1 auto}",
    ".pill .el{font-size:12.5px;font-variant-numeric:tabular-nums;",
      "color:var(--vq-text-secondary,#6B6480);flex:0 0 auto}",
    ".mb{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;flex:0 0 auto;",
      "color:var(--vq-text,#2B2836)}",
    ".mb .i{width:18px;height:18px}",
    ".mb.on{background:var(--vq-accent-subtle,#EAE8F7);color:var(--vq-accent-text,#5F5691)}",
    ".mb.ng{background:#D9445F;color:#fff}",
    ".mb:active{transform:scale(.92)}",

    /* ══ 同席の 帯（相手の 画面）════════════════════════════════════════ */
    ".co{pointer-events:auto;border-radius:18px;padding:11px 13px;",
      "background:var(--vq-surface,#fff);border:1px solid var(--vq-border,#E7E4EF);",
      "box-shadow:0 10px 30px rgba(16,14,26,.16);",
      "animation:vqcUp .22s cubic-bezier(.22,1,.36,1) both}",
    ".co .hd{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:700;",
      "color:var(--vq-accent-text,#5F5691)}",
    ".co .hd .i{width:15px;height:15px}",
    ".co .hd .sp{flex:1 1 auto}",
    ".co .wh{margin-top:6px;font-size:14.5px;font-weight:750;line-height:1.5}",
    ".co .tt{margin-top:2px;font-size:12.5px;color:var(--vq-text-secondary,#6B6480)}",
    ".co .ln{margin-top:8px;max-height:38vh;overflow:auto;display:grid;gap:4px;",
      "font-size:13px;line-height:1.7;-webkit-overflow-scrolling:touch}",
    ".co .ln div{color:var(--vq-text,#2B2836);overflow-wrap:anywhere}",
    ".co .ln div:first-child{font-weight:700}",
    ".co .ft2{display:flex;gap:7px;margin-top:9px;flex-wrap:wrap}",
    ".co .tb{height:44px;padding:0 14px;border-radius:12px;font-size:13px;font-weight:650;",
      "display:inline-flex;align-items:center;gap:5px;",
      "border:1px solid var(--vq-border,#E7E4EF);background:var(--vq-surface,#fff)}",
    ".co .tb.pri{background:var(--vq-accent,#756DB3);border-color:var(--vq-accent,#756DB3);color:#fff}",
    ".co .old{opacity:.55}",
    /* 自分が 出している ときの 印 */
    ".co.me .hd{color:#2FA96B}",

    "@media (max-width:420px){",
      ":host([data-open='1']){padding:8px}",
      ".w{width:calc(100vw - 16px)}",
      ".w{border-radius:22px;padding:22px 16px calc(18px + var(--vq-sab,0px))}",
      ".face{width:88px;height:88px;font-size:32px}",
      ".nm{font-size:19px}",
      ".rowb{gap:14px}",
      ".rb{width:58px;height:58px}",
      ".rb.sm{width:48px;height:48px}",
      ".cap{width:58px}",
      ".bcol{min-width:58px}",
    "}"
  ].join("");

  /* ── 状態 ─────────────────────────────────────────────────────────── */
  var st = {
    画面: "",          /* "" | 同意 | 発信中 | 着信 | 通話中 | 通報 */
    call: null,        /* { callId, peer, iCall, ... } */
    err: "",
    設定: null,        /* /api/call/config の 中身 */
    ミュート: false,
    スピーカー: false,
    接続: "",          /* つないでいます / 通話中 / つなぎ直しています */
    経過: 0,
    lumi: { 状態: "", 相手待ち: false, 動いている: false, 呼んだのは: 0 },
    通報: { 理由: "", 詳細: "", busy: false },
    注意を出した: false,
    畳んだ: false,     /* 通話の 窓を 小さくして アプリを 使える 状態 */
    共有: {
      出している: false,   /* 自分の 画面を 送っている */
      受けている: false,   /* 相手が 送ってきている */
      追う: true,          /* 相手と 同じ タブへ 自動で 移る */
      最新: null,          /* 相手から 届いた いちばん 新しい 画面 */
      届いた時: 0,
      err: ""
    }
  };
  var host = null, root = null, ws = null, wsTimer = null, tick = null;
  var pc = null, 自分の音 = null, 相手の音El = null, 呼び出し音 = null;
  var rtcあり = false;          /* 音の 通り道が できたか（土台に よらず） */
  var rtc = { sessionId: "", peerSessionId: "", 出した: false, 受けた: false, 名: "" };
  var lumiWs = null, lumiCtx = null, lumiNode = null, lumiStream = null, lumi開始 = 0, lumi無言 = null;
  var 自分のid = 0;
  var 共有タイマ = null, 前に送った = "", 共有の連続失敗 = 0;
  var Lumiへ送った = "";

  /* ── 器 ─────────────────────────────────────────────────────────── */
  function 建てる() {
    if (host) return;
    host = document.createElement("div");
    host.id = "vqCall";
    root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    var s = document.createElement("style"); s.textContent = CSS; root.appendChild(s);
    var box = document.createElement("div"); box.setAttribute("data-box", ""); root.appendChild(box);
    document.body.appendChild(host);
    相手の音El = document.createElement("audio");
    相手の音El.autoplay = true;
    相手の音El.setAttribute("playsinline", "");
    相手の音El.style.cssText = "position:fixed;width:0;height:0;opacity:0;pointer-events:none";
    document.body.appendChild(相手の音El);
    つなぐ();
  }

  function 開く(画面) { 建てる(); st.画面 = 画面; host.setAttribute("data-open", "1"); 描く(); }
  function 閉じる() { st.画面 = ""; if (host) host.removeAttribute("data-open"); }

  function 頭文字(p) {
    var n = String((p && (p.displayName || p.handle)) || "?").trim();
    return n ? n.slice(0, 1).toUpperCase() : "?";
  }
  function 顔(p, cls) {
    var src = String((p && p.avatar) || "");
    var ok = /^data:image\//.test(src) || /^https:\/\//.test(src) || /^\/api\/media\//.test(src);
    return '<div class="face ' + (cls || "") + '">'
      + (ok ? '<img src="' + esc(src) + '" alt="">' : esc(頭文字(p))) + "</div>";
  }
  function 分秒(sec) {
    var s = Math.max(0, Math.floor(sec));
    var m = Math.floor(s / 60);
    return (m < 10 ? "0" : "") + m + ":" + ((s % 60) < 10 ? "0" : "") + (s % 60);
  }

  /* ── 描く ─────────────────────────────────────────────────────────── */
  function 描く() {
    if (!root) return;
    var box = root.querySelector("[data-box]");
    if (!box) return;
    if (!st.画面) { box.innerHTML = ""; box.removeAttribute("data-min-key"); 畳みを反映(); return; }
    /* ★ 畳んでいる ときは 幕を 出さない（アプリを 触れなく しない）。
       畳めるのは 通話中だけ。着信や 同意は 見落とされたら 困る。 */
    if (st.畳んだ && st.画面 === "通話中") {
      var mh = 畳んだ中身();
      /* ★ 1 秒ごとに 全部 描き直すと **相手の 画面の スクロールが 毎秒 戻る**。
         経過時間の 字だけが 違う ときは、その 1 か所だけ 直す。 */
      var 印 = mh.replace(/<span class="el">[^<]*<\/span>/, "");
      if (box.getAttribute("data-min-key") === 印) {
        var 字el = box.querySelector(".pill .el");
        if (字el) 字el.textContent = 分秒(st.経過);
        畳みを反映();
        return;
      }
      box.setAttribute("data-min-key", 印);
      box.innerHTML = mh;
      畳みを反映();
      return;
    }
    box.removeAttribute("data-min-key");
    畳みを反映();
    var h = '<div class="bd" data-a="bd"></div><div class="w" role="dialog" aria-modal="true">';
    if (st.画面 === "同意") h += 同意の中身();
    else if (st.画面 === "発信中") h += 発信の中身();
    else if (st.画面 === "着信") h += 着信の中身();
    else if (st.画面 === "通話中") h += 通話の中身();
    else if (st.画面 === "通報") h += 通報の中身();
    box.innerHTML = h + "</div>";
  }

  /* 畳んでいるか どうかを 器へ 反映する（CSS が これを 見る）。 */
  function 畳みを反映() {
    if (!host) return;
    var 畳 = st.畳んだ && st.画面 === "通話中";
    if (畳) host.setAttribute("data-min", "1");
    else host.removeAttribute("data-min");
  }

  /* ══ 畳んだ 姿 ═══════════════════════════════════════════════════════
     細い 帯 1 本＋（同席していれば）相手の 画面。
     ここだけで 切る・ミュート・戻すが できる（窓を 開き直さなくて よい）。 */
  function 畳んだ中身() {
    var p = (st.call && st.call.peer) || {};
    var h = '<div class="mini">'
      + '<div class="pill">'
      + '<span class="dot" aria-hidden="true"></span>'
      + '<span class="who">' + esc(p.displayName || "利用者") + "</span>"
      + '<span class="el">' + 分秒(st.経過) + "</span>"
      + '<button class="mb' + (st.ミュート ? " on" : "") + '" data-a="mute"'
      + ' aria-label="' + (st.ミュート ? "ミュートを 解く" : "ミュートする") + '">'
      + svg(st.ミュート ? "micoff" : "mic") + "</button>"
      + '<button class="mb' + (st.共有.出している ? " on" : "") + '" data-a="share"'
      + ' aria-label="' + (st.共有.出している ? "画面の 同席を やめる" : "画面を 同席する") + '">'
      + svg("screen") + "</button>"
      + '<button class="mb ng" data-a="hangup" aria-label="切る">' + svg("hangup") + "</button>"
      + '<button class="mb" data-a="unfold" aria-label="通話の 画面を 開く">' + svg("unfold") + "</button>"
      + "</div>";
    h += 同席の帯();
    return h + "</div>";
  }

  /* 相手の 画面（同席）。自分が 出している ときは その 印だけ。 */
  function 同席の帯() {
    if (st.共有.出している && !st.共有.受けている) {
      return '<div class="co me"><div class="hd">' + svg("screen", "i")
        + "<span>あなたの 画面を 同席中</span><span class=\"sp\"></span>"
        + '</div><div class="tt">VocabuQuiz の 中だけが 相手に 見えています。'
        + "ほかの アプリも 通知も 写りません。</div>"
        + '<div class="ft2"><button class="tb" data-a="share-off">やめる</button></div></div>';
    }
    if (!st.共有.受けている) return "";
    var f = st.共有.最新;
    var p = (st.call && st.call.peer) || {};
    var 古い = f && (Date.now() - st.共有.届いた時 > 12000);
    var h = '<div class="co"><div class="hd">' + svg("screen", "i")
      + "<span>" + esc(p.displayName || "相手") + " の 画面</span><span class=\"sp\"></span>"
      + (st.共有.追う ? "<span>追従中</span>" : "") + "</div>";
    if (!f) {
      h += '<div class="tt">画面を 受け取っています…</div>';
    } else {
      h += '<div class="wh' + (古い ? " old" : "") + '">' + esc(f.where || "VocabuQuiz") + "</div>";
      if (f.title) h += '<div class="tt' + (古い ? " old" : "") + '">' + esc(f.title) + "</div>";
      if (f.lines && f.lines.length) {
        h += '<div class="ln' + (古い ? " old" : "") + '">';
        for (var i = 0; i < f.lines.length; i++) h += "<div>" + esc(f.lines[i]) + "</div>";
        h += "</div>";
      }
    }
    h += '<div class="ft2">';
    var 行ける = f && f.go && f.go.tab && f.go.tab !== 今のタブ();
    if (行ける) h += '<button class="tb pri" data-a="co-go">同じ 画面へ</button>';
    h += '<button class="tb" data-a="co-follow">' + (st.共有.追う ? "追従を やめる" : "追従する") + "</button>"
      + "</div></div>";
    return h;
  }

  function 同意の中身() {
    return '<div class="ttl">音声通話について</div>'
      + '<div class="h2">はじめる前に</div>'
      + '<p class="p">通話を 使う前に、下の ことを 確かめてください。</p>'
      + '<div class="ul">'
      + '<div class="li"><b>・</b><span>通話は <b>相互フォローの 相手だけ</b>と できます。</span></div>'
      + '<div class="li"><b>・</b><span><b>音声は 保存しません。</b>誰と いつ 何分 話したかだけを 残します。</span></div>'
      + '<div class="li"><b>・</b><span>相手に あなたの IP アドレスは 渡りません（中継を 通します）。</span></div>'
      + '<div class="li"><b>・</b><span>通話中に <b>通報</b>できます。通報すると すぐ 切れて、相手を ブロックします。</span></div>'
      + '<div class="li"><b>・</b><span>Lumi は <b>2 人とも 同意した ときだけ</b>入ります。そのとき 声は AI の 提供元へ 送られます。</span></div>'
      + '<div class="li"><b>・</b><span>設定から いつでも 通話を 切れます。</span></div>'
      + "</div>"
      + (st.err ? '<div class="err">' + esc(st.err) + "</div>" : "")
      + '<div class="ft"><button class="btn" data-a="consent-no">やめておく</button>'
      + '<button class="btn pri" data-a="consent-yes">同意して 使う</button></div>';
  }

  function 発信の中身() {
    var p = (st.call && st.call.peer) || {};
    return '<div class="ttl">呼び出しています</div>'
      + 顔(p, "ring")
      + '<div class="nm">' + esc(p.displayName || "利用者") + "</div>"
      + '<div class="sub">@' + esc(p.handle || "user") + "</div>"
      + (st.err ? '<div class="err">' + esc(st.err) + "</div>" : "")
      + '<div class="rowb"><div class="bcol">'
      + '<button class="rb ng" data-a="cancel" aria-label="呼び出しを やめる">' + svg("hangup") + "</button>"
      + '<span class="cap">やめる</span></div></div>'
      + 注意書き();
  }

  function 着信の中身() {
    var p = (st.call && st.call.peer) || {};
    return '<div class="ttl">着信</div>'
      + 顔(p, "ring")
      + '<div class="nm">' + esc(p.displayName || "利用者") + "</div>"
      + '<div class="sub">@' + esc(p.handle || "user") + " ・ 音声通話</div>"
      + (st.err ? '<div class="err">' + esc(st.err) + "</div>" : "")
      + '<div class="rowb">'
      + '<div class="bcol"><button class="rb ng" data-a="reject" aria-label="断る">' + svg("hangup") + "</button>"
      + '<span class="cap">断る</span></div>'
      + '<div class="bcol"><button class="rb ok" data-a="accept" aria-label="出る">' + svg("phone") + "</button>"
      + '<span class="cap">出る</span></div></div>';
  }

  function 通話の中身() {
    var p = (st.call && st.call.peer) || {};
    var h = '<div class="ttl">通話中</div>'
      + 顔(p)
      + '<div class="nm">' + esc(p.displayName || "利用者") + "</div>"
      + '<div class="tm">' + 分秒(st.経過) + "</div>"
      + '<div class="st">' + esc(st.接続 || "つないでいます…") + "</div>";
    if (st.lumi.動いている) {
      h += '<div class="lumi">' + svg("spark", "i s") + "Lumi が 参加中です</div>";
    } else if (st.lumi.相手待ち) {
      h += '<div class="lumi">' + svg("spark", "i s") + "相手の 返事を 待っています…</div>";
    }
    if (st.共有.出している) {
      h += '<div class="lumi">' + svg("screen", "i s") + "あなたの 画面を 同席中です</div>";
    } else if (st.共有.受けている) {
      h += '<div class="lumi">' + svg("screen", "i s") + "相手が 画面を 同席しています</div>";
    }
    if (st.lumi.状態) h += '<div class="st">' + esc(st.lumi.状態) + "</div>";
    if (st.共有.err) h += '<div class="err">' + esc(st.共有.err) + "</div>";
    if (st.err) h += '<div class="err">' + esc(st.err) + "</div>";
    h += '<div class="rowb">'
      + '<div class="bcol"><button class="rb sm' + (st.ミュート ? " on" : "") + '" data-a="mute"'
      + ' aria-label="' + (st.ミュート ? "ミュートを 解く" : "ミュートする") + '">'
      + svg(st.ミュート ? "micoff" : "mic") + "</button>"
      + '<span class="cap">' + (st.ミュート ? "解除" : "ミュート") + "</span></div>";
    if (スピーカーを出すか()) {
      h += '<div class="bcol"><button class="rb sm' + (st.スピーカー ? " on" : "") + '" data-a="spk"'
        + ' aria-label="スピーカーを 切り替える">' + svg("speaker") + "</button>"
        + '<span class="cap">スピーカー</span></div>';
    }
    h += '<div class="bcol"><button class="rb ng" data-a="hangup" aria-label="切る">' + svg("hangup") + "</button>"
      + '<span class="cap">切る</span></div>'
      /* ★ 画面の 同席。押すと 自動で 窓を 畳む（畳まないと アプリが 見えない）。 */
      + '<div class="bcol"><button class="rb sm' + (st.共有.出している ? " on" : "") + '" data-a="share"'
      + ' aria-label="' + (st.共有.出している ? "画面の 同席を やめる" : "画面を 同席する") + '">'
      + svg("screen") + "</button>"
      + '<span class="cap">' + (st.共有.出している ? "やめる" : "画面") + "</span></div>"
      + '<div class="bcol"><button class="rb sm" data-a="fold" aria-label="通話を 小さくして アプリを 使う">'
      + svg("fold") + "</button>"
      + '<span class="cap">畳む</span></div>'
      + '<div class="bcol"><button class="rb sm" data-a="lumi" aria-label="Lumi を 呼ぶ">' + svg("spark") + "</button>"
      + '<span class="cap">Lumi</span></div>'
      + '<div class="bcol"><button class="rb sm" data-a="report" aria-label="この 通話を 報告する">' + svg("flag") + "</button>"
      + '<span class="cap">報告</span></div>'
      + "</div>";
    h += 注意書き();
    return h;
  }

  function スピーカーを出すか() {
    try {
      return /iPhone|iPad|Android/i.test(navigator.userAgent)
        && !!(相手の音El && typeof 相手の音El.setSinkId === "function");
    } catch (e) { return false; }
  }

  /* ★ Web のアプリなので、**タブを 閉じる・画面を ロックすると 切れる**ことが ある。
     「切れました」を 黙って 起こさない。1 回だけ 出す。 */
  function 注意書き() {
    if (st.注意を出した) return "";
    return '<div class="note">' + svg("shield", "i s")
      + " このアプリは ブラウザで 動いています。<b>タブを 閉じる・画面を ロックする</b>と"
      + " 通話が 切れることが あります。話している あいだは この 画面を 開いたままに してください。</div>";
  }

  var 理由の一覧 = [
    { id: "harassment", 名: "嫌がらせ", 説: "しつこい・傷つける 言い方" },
    { id: "inappropriate", 名: "不適切な 発言", 説: "性的・暴力的・過激な 中身" },
    { id: "impersonation", 名: "なりすまし", 説: "別人の ふりを している" },
    { id: "age", 名: "年齢の 詐称", 説: "年齢を いつわっている" },
    { id: "solicitation", 名: "しつこい 勧誘", 説: "宣伝・勧誘・お金の 話" },
    { id: "other", 名: "その他", 説: "上に 当てはまらない" }
  ];
  function 通報の中身() {
    var r = st.通報;
    var 送れる = !!r.理由 && !r.busy;
    var h = '<div class="ttl">通話の 報告</div>'
      + '<div class="h2">この 通話を 報告する</div>'
      + '<p class="p">送ると <b>すぐに 通話が 切れ</b>、相手を <b>ブロック</b>します。'
      + " 相手には 伝わりません。通話の 音声は 保存していないので、内容は 確かめられません。</p>"
      + '<div class="ul">';
    理由の一覧.forEach(function (x) {
      h += '<button type="button" class="opt" data-a="rp" data-v="' + x.id + '"'
        + ' aria-pressed="' + (r.理由 === x.id ? "true" : "false") + '">'
        + '<span class="ck"><i></i></span><span><span class="on">' + esc(x.名) + "</span>"
        + '<span class="od">' + esc(x.説) + "</span></span></button>";
    });
    h += "</div>";
    if (r.理由) {
      h += '<textarea data-rp="detail" maxlength="1200" placeholder="どんなことが あったか（なくても 送れます）">'
        + esc(r.詳細 || "") + "</textarea>";
    }
    if (st.err) h += '<div class="err">' + esc(st.err) + "</div>";
    h += '<div class="ft"><button class="btn" data-a="rp-cancel">やめる</button>'
      + '<button class="btn dan" data-a="rp-send"' + (送れる ? "" : " disabled") + ">"
      + (r.busy ? "送っています…" : "報告して 切る") + "</button></div>";
    return h;
  }

  /* ── 押されたとき ─────────────────────────────────────────────────── */
  function つなぐ() {
    root.addEventListener("click", function (e) {
      var el = e.target;
      while (el && el !== root && !(el.dataset && el.dataset.a)) el = el.parentNode;
      if (!el || el === root) return;
      var a = el.dataset.a;
      if (a === "bd") return;                     /* 幕では 閉じない（誤操作を 防ぐ） */
      if (a === "consent-yes") { 同意する(true); return; }
      if (a === "consent-no") { 閉じる(); return; }
      if (a === "cancel") { 取り消す(); return; }
      if (a === "reject") { 断る(); return; }
      if (a === "accept") { 出る(); return; }
      if (a === "hangup") { 切る("hangup"); return; }
      if (a === "mute") { ミュート切替(); return; }
      if (a === "spk") { スピーカー切替(); return; }
      if (a === "lumi") { Lumiを呼ぶ(); return; }
      if (a === "report") { st.err = ""; st.通報 = { 理由: "", 詳細: "", busy: false }; 開く("通報"); return; }
      if (a === "rp") { 通報を控える(); st.通報.理由 = el.dataset.v || ""; st.err = ""; 描く(); return; }
      if (a === "rp-cancel") { 開く("通話中"); return; }
      if (a === "rp-send") { 通報を送る(); return; }
      /* 画面の 同席 */
      if (a === "fold") { 畳む(true); return; }
      if (a === "unfold") { 畳む(false); return; }
      if (a === "share") { st.共有.出している ? 共有をやめる("手動") : 共有を始める(); return; }
      if (a === "share-off") { 共有をやめる("手動"); return; }
      if (a === "co-go") { 同じ画面へ(true); return; }
      if (a === "co-follow") {
        st.共有.追う = !st.共有.追う;
        if (st.共有.追う) 同じ画面へ(false);
        描く();
        return;
      }
    });
    root.addEventListener("input", function (e) {
      var t = e.target;
      if (t && t.dataset && t.dataset.rp === "detail") st.通報.詳細 = String(t.value || "");
    });
  }
  function 通報を控える() {
    var t = root && root.querySelector('[data-rp="detail"]');
    if (t) st.通報.詳細 = String(t.value || "");
  }

  /* ── 合図の 通り道 ─────────────────────────────────────────────────── */
  var ws取得中 = false;
  function ws開く() {
    if (!token()) return;
    if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
    if (ws取得中) return;
    ws取得中 = true;
    /* ★ **本物の 札を URL に 載せない。** 60 秒だけ 有効な 合言葉を もらって つなぐ。
       WebSocket は ヘッダを 付けられないので、こうする しかない。 */
    api("/api/call/ticket", { method: "POST", body: {} }).then(function (j) {
      ws取得中 = false;
      var pr = location.protocol === "https:" ? "wss://" : "ws://";
      try {
        ws = new WebSocket(pr + location.host + "/ws/call?k=" + encodeURIComponent(j.ticket));
      } catch (e) { ws = null; return; }
      ws結ぶ();
    }).catch(function () { ws取得中 = false; });
  }
  var 待ち直し = 1000, 直しタイマ = null;
  function ws結ぶ() {
    if (!ws) return;
    ws.onopen = function () { 待ち直し = 1000; };
    ws.onmessage = function (ev) {
      var d = null;
      try { d = JSON.parse(String(ev.data || "{}")); } catch (e2) { return; }
      合図(d);
    };
    /* ★ 切れたら **すぐ** つなぎ直す（1 秒 → 2 → 4 … 最大 20 秒）。
       20 秒ごとの 見張りだけに すると、最初の 1 回が こけた とき
       **20 秒 着信を 受け取れない**（実測で 着信が 届かなかった）。 */
    ws.onclose = function () { ws = null; つなぎ直しを頼む(); };
    ws.onerror = function () { try { ws.close(); } catch (e) {} };
  }
  function つなぎ直しを頼む() {
    if (直しタイマ) return;
    直しタイマ = setTimeout(function () {
      直しタイマ = null;
      待ち直し = Math.min(20000, 待ち直し * 2);
      ws開く();
    }, 待ち直し);
  }
  /* ══ 見張りの 間隔（2026-09-02 に 測って 直した）════════════════════
     直す前: 10 秒ごとに **必ず** /api/call/state を 叩いて いた。
       タブを 開いて いる だけで 1 日 8,640 回。30 タブで 26 万回。
       これが 積み上がって Cloudflare の 1 日の 枠を 使い切り、
       毎朝（＝ 00:00 UTC の リセット直前）に 全員が 429 に なって いた。
       実測: 8/31 = 396,080 回・9/1 = 351,513 回。人の 操作は 時 3〜6 千回。

     直した あと:
       ・**裏に 回った タブは 何も しない**（document.hidden）
       ・押し出しは WebSocket が 本筋。/api/call/state は **取りこぼしの
         受け皿**なので 90 秒に 1 回で 足りる
       ・表に 戻った 瞬間は すぐ 1 回 見る（着信を 取りこぼさない）
     これで 1 タブ 8,640 回/日 → **960 回/日**（開きっぱなしでも）。 */
  var 裏か = function () { try { return !!document.hidden; } catch (e) { return false; } };
  var 拾い時 = 0;
  var 状態の間 = 90000;
  function ws見張る() {
    if (wsTimer) return;
    wsTimer = setInterval(function () {
      if (!token()) return;
      /* 裏の タブは 触らない。切れた ままでも、表に 戻った ときに つなぎ直す。 */
      if (裏か()) return;
      /* ★ 何枚 開いても 叩くのは 1 枚だけ／手が 止まって 15 分で 休む
         （2026-09-02・この 家の 3 台で 1 時間 61,442 回 出て いた）。
         着信は WebSocket で 届く ので、代表で なくても 受け取れる。 */
      var Q = window.__vqQuiet;
      if (Q && Q.待たされているか()) return;
      if (!ws || ws.readyState > 1) { ws開く(); return; }
      if (ws.readyState === 1) { try { ws.send(JSON.stringify({ type: "ping" })); } catch (e) {} }
      /* ★ 受け皿。**通話中は 邪魔しない**し、続けざまには 聞かない。 */
      if (st.call) return;
      if (Q && !Q.よいか({})) return;
      var now = Date.now();
      if (now - 拾い時 < 状態の間) return;
      拾い時 = now;
      落ちている通話を拾う();
    }, 10000);
  }

  /* 表に 戻った ら すぐ つなぎ直して 1 回だけ 見る（待たせない）。 */
  try {
    document.addEventListener("visibilitychange", function () {
      if (裏か() || !token()) return;
      if (!ws || ws.readyState > 1) ws開く();
      if (!st.call) { 拾い時 = Date.now(); 落ちている通話を拾う(); }
    });
  } catch (e) {}

  function 合図(d) {
    var t = String(d.type || "");
    /* ══ 通知・お知らせの 押し出し（2026-09-05）══════════════════════
       訴え「通知も、受信した タイミングで 通知として 鳴らす ように して
             欲しい。アプリを 開いて いる 人に リアルタイムで 通知音を」
       ★ この WebSocket は 通話の ために 1 本 繋いで ある。
         通知の ために もう 1 本 開かない（繋ぎ直しの 世話も 二重に なる）。
       ★ 出すのは vq-notifylive。ここは **渡すだけ**。 */
    if (t === "notify.new" || t === "news.new") {
      try { if (window.__vqNotifyLive) window.__vqNotifyLive.受ける(d); } catch (e) {}
      return;
    }
    if (t === "call.invite") {
      if (st.call) { return; }                     /* すでに 通話中（サーバも 断る） */
      建てる();
      st.call = { callId: d.callId, peer: d.from || {}, iCall: false };
      st.err = "";
      開く("着信");
      呼び出し音を鳴らす(true);
      return;
    }
    if (t === "call.ringing") { return; }
    if (t === "call.accept") {
      呼び出し音を鳴らす(false);
      if (!st.call) return;
      st.call.connectedAt = d.at || Date.now();
      st.call.hardEndAt = d.hardEndAt || 0;
      st.接続 = "つないでいます…";
      開く("通話中");
      経過を数える();
      つなぎ始める();
      return;
    }
    if (t === "call.reject" || t === "call.cancel" || t === "call.end" || t === "call.blocked") {
      var 訳 = t === "call.reject" ? "断られました"
        : t === "call.cancel" ? "呼び出しが 取り消されました"
        : d.reason === "blocked" ? "通話は 終了しました"
        : d.reason === "timeout" ? "応答が ありませんでした"
        : d.reason === "reported" ? "通話は 終了しました"
        : "通話が 終わりました";
      片づける(訳);
      return;
    }
    if (t === "call.rtc.peer") {
      rtc.peerSessionId = String(d.sessionId || "");
      受け取りを始める();
      return;
    }
    if (t === "call.share.state") {
      if (!st.call) return;
      if (d.by === 自分のid) return;             /* 自分が 出した 合図の 折り返し */
      if (d.on) {
        st.共有.受けている = true;
        if (st.画面 === "通話中" && !st.畳んだ) 畳む(true);
      } else {
        st.共有.受けている = false;
        st.共有.最新 = null;
        st.共有.届いた時 = 0;
      }
      描く();
      return;
    }
    if (t === "call.share.frame") {
      if (!st.call) return;
      if (d.by === 自分のid) return;
      相手の画面を受けた(d.frame || null);
      return;
    }
    if (t === "call.lumi.ask") {
      if (!st.call) return;
      if (d.by === 自分のid) { st.lumi.相手待ち = true; 描く(); return; }
      Lumiの同意を聞く();
      return;
    }
    if (t === "call.lumi.state") {
      st.lumi.相手待ち = false;
      st.lumi.動いている = !!d.on;
      st.lumi.状態 = d.on ? ""
        : (d.reason === "denied" ? "相手が 断りました。Lumi は 入りません。"
          : d.reason === "failed" ? "Lumi を 呼べませんでした。"
          : "");
      if (!d.on) Lumiを止める(false);
      描く();
      setTimeout(function () { if (st.lumi.状態) { st.lumi.状態 = ""; 描く(); } }, 5000);
      return;
    }
  }

  /* ── 呼び出し音（外の ファイルを 使わない）───────────────────────── */
  function 呼び出し音を鳴らす(on) {
    if (!on) {
      if (呼び出し音) { try { 呼び出し音.stop(); } catch (e) {} 呼び出し音 = null; }
      return;
    }
    if (!音を出してよいか()) return;
    try {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      var ctx = new C();
      var 止まった = false;
      var 回 = 0;
      var 鳴らす = function () {
        if (止まった || 回 > 40) return;
        回++;
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = "sine"; o.frequency.value = 660;
        g.gain.value = 0;
        o.connect(g); g.connect(ctx.destination);
        var t = ctx.currentTime;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.16, t + 0.04);
        g.gain.linearRampToValueAtTime(0, t + 0.42);
        o.start(t); o.stop(t + 0.45);
        setTimeout(鳴らす, 1500);
      };
      鳴らす();
      呼び出し音 = { stop: function () { 止まった = true; try { ctx.close(); } catch (e) {} } };
    } catch (e) {}
  }

  /* ── 同意 ─────────────────────────────────────────────────────────── */
  function 設定を読む() {
    return api("/api/call/config").then(function (j) { st.設定 = j; return j; });
  }
  function 同意する() {
    api("/api/call/consent", { method: "POST", body: { agree: true } })
      .then(function () {
        if (st.設定) st.設定.consented = true;
        var 続き = st.同意のあと;
        st.同意のあと = null;
        閉じる();
        if (続き) 続き();
      })
      .catch(function (e) { st.err = e.message || "できませんでした。"; 描く(); });
  }

  /* ── かける ─────────────────────────────────────────────────────── */
  function かける(peerId) {
    建てる();
    st.err = "";
    return 設定を読む().then(function (c) {
      if (!c.consented) {
        st.同意のあと = function () { かける(peerId); };
        開く("同意");
        return;
      }
      return api("/api/call/invite", { method: "POST", body: { peerId: Number(peerId) } })
        .then(function (j) {
          st.call = { callId: j.callId, peer: j.peer || {}, iCall: true };
          開く("発信中");
          呼び出し音を鳴らす(true);
          /* 30 秒 返事が 無ければ サーバが 不在着信に する。画面も 合わせる。 */
          setTimeout(function () {
            if (st.call && st.画面 === "発信中" && st.call.callId === j.callId) {
              取り消す();
            }
          }, 31000);
        })
        .catch(function (e) {
          st.err = e.message || "かけられませんでした。";
          開く("発信中");
          setTimeout(function () { if (st.画面 === "発信中" && !st.call) 閉じる(); }, 3200);
        });
    }).catch(function (e) {
      st.err = e.message || "通話を 始められませんでした。";
      開く("発信中");
    });
  }

  function 取り消す() {
    var id = st.call && st.call.callId;
    呼び出し音を鳴らす(false);
    if (id) api("/api/call/cancel", { method: "POST", body: { callId: id } }).catch(function () {});
    片づける("");
  }
  function 断る() {
    var id = st.call && st.call.callId;
    呼び出し音を鳴らす(false);
    if (id) api("/api/call/reject", { method: "POST", body: { callId: id } }).catch(function () {});
    片づける("");
  }
  function 切る(訳) {
    var id = st.call && st.call.callId;
    if (id) api("/api/call/end", { method: "POST", body: { callId: id, reason: 訳 || "hangup" } }).catch(function () {});
    片づける("");
  }

  function 出る() {
    var id = st.call && st.call.callId;
    if (!id) return;
    呼び出し音を鳴らす(false);
    st.err = "";
    設定を読む().then(function (c) {
      if (!c.consented) {
        st.同意のあと = function () { 出る(); };
        開く("同意");
        return;
      }
      return api("/api/call/accept", { method: "POST", body: { callId: id } })
        .then(function (j) {
          st.call.connectedAt = j.connectedAt;
          st.call.hardEndAt = j.hardEndAt || 0;
          st.接続 = "つないでいます…";
          開く("通話中");
          経過を数える();
          つなぎ始める();
        });
    }).catch(function (e) {
      st.err = e.message || "出られませんでした。";
      描く();
      setTimeout(function () { 片づける(""); }, 2600);
    });
  }

  function 経過を数える() {
    if (tick) clearInterval(tick);
    tick = setInterval(function () {
      if (!st.call || !st.call.connectedAt) return;
      st.経過 = (Date.now() - st.call.connectedAt) / 1000;
      /* 1 通話の 最大時間（サーバの 制限）。過ぎたら こちらから 切る。 */
      if (st.call.hardEndAt && Date.now() > st.call.hardEndAt) { 切る("maxtime"); return; }
      var el = root && root.querySelector(".tm");
      if (el) el.textContent = 分秒(st.経過);
      /* 畳んでいる ときは 帯の ほうに 出ている。 */
      var el2 = root && root.querySelector(".pill .el");
      if (el2) el2.textContent = 分秒(st.経過);
    }, 1000);
  }

  function 片づける(訳) {
    呼び出し音を鳴らす(false);
    /* ★ 共有は **通話より 先に** 止める（止め忘れると 次の 通話へ 持ち越す）。 */
    共有を片づける();
    Lumiを止める(true);
    RTKを閉じる();
    SFUを閉じる();
    rtcあり = false;
    if (tick) { clearInterval(tick); tick = null; }
    st.call = null; st.経過 = 0; st.ミュート = false; st.接続 = "";
    st.lumi = { 状態: "", 相手待ち: false, 動いている: false, 呼んだのは: 0 };
    rtc = { sessionId: "", peerSessionId: "", 出した: false, 受けた: false, 名: "" };
    つなぎ中 = false;
    if (訳) {
      st.err = 訳;
      開く("通話中");
      setTimeout(function () { st.err = ""; 閉じる(); }, 2400);
    } else {
      st.err = "";
      閉じる();
    }
  }

  /* ── SFU（Cloudflare Realtime）───────────────────────────────────────
     ★ 1 対 1 でも **必ず ここを 通す**。P2P に すると 相手に IP が 見える。 */
  function ICE待ち(p) {
    if (p.iceGatheringState === "complete") return Promise.resolve();
    return new Promise(function (done) {
      var 済 = false;
      var 終 = function () { if (済) return; 済 = true; done(); };
      var f = function () { if (p.iceGatheringState === "complete") 終(); };
      p.addEventListener("icegatheringstatechange", f);
      setTimeout(終, 2500);           /* 待ちすぎない（つながる ほうを 優先） */
    });
  }

  /* ★ どの 土台で つなぐかは **サーバが 決める**。画面は 従う だけ。
       rtk … Cloudflare RealtimeKit（会議に 参加札で 入る）
       sfu … サーバーレス SFU（自分で 管を つなぐ）
     どちらも 中継を 通すので、相手に IP は 見えない。 */
  var つなぎ中 = false;
  function つなぎ始める() {
    var id = st.call && st.call.callId;
    if (!id) return;
    /* ★ **二重に 始めない。**（実測 2026-08-29）
       出た 側は 自分で 始め、さらに サーバからの「出ました」の 知らせでも
       始めていた。RealtimeKit は 同時に 2 回 init すると
       「Unsupported concurrent calls on method: Client.init」で 落ちる。 */
    if (つなぎ中 || rtcあり) return;
    つなぎ中 = true;
    st.接続 = "つないでいます…"; 描く();
    api("/api/call/rtc/join", { method: "POST", body: { callId: id } })
      .then(function (j) {
        if (j.driver === "rtk") return RTKでつなぐ(j);
        return SFUでつなぐ();
      })
      .then(function () {
        つなぎ中 = false;
        st.err = "";           /* つながったら 前の 断りは 消す */
        描く();
      })
      .catch(function (e) {
        つなぎ中 = false;
        st.err = 人の言葉に(e);
        st.接続 = "つながりませんでした";
        描く();
      });
  }

  /* ── RealtimeKit ────────────────────────────────────────────────── */
  var RTK_SDK = "https://cdn.jsdelivr.net/npm/@cloudflare/realtimekit/dist/browser.js";
  var rtk = null, rtk読み = null;
  function SDKを読む() {
    if (window.RealtimeKitClient || window.RealtimeKit) return Promise.resolve();
    if (rtk読み) return rtk読み;
    rtk読み = new Promise(function (done, ng) {
      var s2 = document.createElement("script");
      s2.src = RTK_SDK;
      s2.async = true;
      s2.onload = function () { done(); };
      s2.onerror = function () { rtk読み = null; ng(new Error("通話の 部品を 読み込めませんでした。")); };
      document.head.appendChild(s2);
    });
    return rtk読み;
  }
  function RTKでつなぐ(j) {
    return SDKを読む().then(function () {
      var K = window.RealtimeKitClient || window.RealtimeKit;
      if (!K || !K.init) throw new Error("通話の 部品が 使えません。");
      /* ★ **映像は 作らない。** 音声だけの 機能。 */
      return K.init({ authToken: j.authToken, defaults: { audio: true, video: false } });
    }).then(function (m) {
      rtk = m;
      try {
        m.participants.joined.on("participantLeft", function () {
          if (st.call) 切る("peer-left");
        });
        m.self.on("roomLeft", function () { if (st.call) 片づける(""); });
      } catch (e) {}
      st.接続 = "つないでいます…"; 描く();
      return m.join();
    }).then(function () {
      rtcあり = true;
      st.接続 = "通話中";
      描く();
      /* 相手が まだ 来ていなければ、その ことを 出す（黙って 無音に しない）。 */
      setTimeout(function () {
        if (!rtk || !st.call) return;
        try {
          var n = rtk.participants && rtk.participants.joined
            ? rtk.participants.joined.toArray().length : 0;
          if (!n && st.接続 === "通話中") { st.接続 = "相手を 待っています…"; 描く(); }
        } catch (e) {}
      }, 2000);
    });
  }
  function RTKを閉じる() {
    if (!rtk) return;
    try { rtk.leave(); } catch (e) {}
    rtk = null;
  }

  /* ── サーバーレス SFU ───────────────────────────────────────────── */
  function SFUでつなぐ() {
    var id = st.call && st.call.callId;
    if (!id) return;
    return navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,      /* 反響を 消す */
        noiseSuppression: true,      /* 雑音を 抑える */
        autoGainControl: true        /* 音の 大きさを そろえる */
      },
      video: false                   /* ★ 映像は 作らない（音声だけの 機能） */
    }).then(function (stream) {
      自分の音 = stream;
      return api("/api/call/rtc/session", { method: "POST", body: { callId: id } });
    }).then(function (j) {
      rtc.sessionId = j.sessionId;
      if (j.peerSessionId) rtc.peerSessionId = j.peerSessionId;
      pc = new RTCPeerConnection({
        iceServers: j.iceServers || [{ urls: "stun:stun.cloudflare.com:3478" }],
        bundlePolicy: "max-bundle"
      });
      pc.ontrack = function (ev) {
        try {
          if (相手の音El.srcObject !== ev.streams[0]) 相手の音El.srcObject = ev.streams[0];
          相手の音El.play().catch(function () {});
        } catch (e) {}
      };
      pc.oniceconnectionstatechange = function () {
        var s = pc.iceConnectionState;
        st.接続 = s === "connected" || s === "completed" ? "通話中"
          : s === "disconnected" || s === "checking" ? "つなぎ直しています…"
          : s === "failed" ? "つながりませんでした" : "つないでいます…";
        描く();
        if (s === "failed") つなぎ直す();
      };
      return 音を出す();
    }).then(function () {
      受け取りを始める();
      rtcあり = true;
    });
  }

  /* ★ 中の 言葉（SDP・RTCPeerConnection…）を そのまま 見せない。
     読んでも 何を すれば よいか 分からないので、次の 一手が 分かる 言い方に する。 */
  function 人の言葉に(e) {
    var m = String((e && (e.message || e.name)) || "");
    if (/NotAllowedError|Permission/i.test(m)) return "マイクを 使えませんでした。ブラウザの 許可を 確かめてください。";
    if (/NotFoundError|マイクが 見つかりません/i.test(m)) return "マイクが 見つかりません。つないでから もう一度 お試しください。";
    if (/SDP|RTCPeerConnection|setLocalDescription|setRemoteDescription|ICE/i.test(m)) {
      return "音の 通り道を 作れませんでした。回線を 確かめて、もう一度 かけ直してください。";
    }
    if (/SFU|通り道|部屋/.test(m)) return m;
    return m || "つなげませんでした。";
  }

  /* 自分の 音を SFU へ 出す */
  function 音を出す() {
    var id = st.call.callId;
    var track = 自分の音.getAudioTracks()[0];
    if (!track) return Promise.reject(new Error("マイクが 見つかりません。"));
    var tr = pc.addTransceiver(track, { direction: "sendonly" });
    /* 名前は 両側で **同じ 決め方**にする（相手に 聞かなくても 分かる） */
    rtc.名 = id + (st.call.iCall ? "-a" : "-b");
    return pc.createOffer()
      .then(function (o) { return pc.setLocalDescription(o); })
      .then(function () { return ICE待ち(pc); })
      .then(function () {
        return api("/api/call/rtc/tracks", { method: "POST", body: {
          callId: id, sessionId: rtc.sessionId,
          sessionDescription: { type: "offer", sdp: pc.localDescription.sdp },
          tracks: [{ location: "local", mid: tr.mid, trackName: rtc.名 }],
          publish: [rtc.名]
        } });
      })
      .then(function (j) {
        var sd = j.result && j.result.sessionDescription;
        if (!sd) throw new Error("音の 通り道を 作れませんでした。");
        rtc.出した = true;
        return pc.setRemoteDescription(new RTCSessionDescription(sd));
      });
  }

  /* 相手の 音を SFU から 受け取る */
  function 受け取りを始める() {
    if (!pc || !rtc.sessionId || !rtc.peerSessionId || rtc.受けた) return;
    rtc.受けた = true;
    var id = st.call.callId;
    var 相手の名 = id + (st.call.iCall ? "-b" : "-a");
    api("/api/call/rtc/tracks", { method: "POST", body: {
      callId: id, sessionId: rtc.sessionId,
      tracks: [{ location: "remote", sessionId: rtc.peerSessionId, trackName: 相手の名 }]
    } }).then(function (j) {
      var r = j.result || {};
      if (!r.requiresImmediateRenegotiation) return;
      return pc.setRemoteDescription(new RTCSessionDescription(r.sessionDescription))
        .then(function () { return pc.createAnswer(); })
        .then(function (a) { return pc.setLocalDescription(a); })
        .then(function () { return ICE待ち(pc); })
        .then(function () {
          return api("/api/call/rtc/renegotiate", { method: "PUT", body: {
            callId: id, sessionId: rtc.sessionId,
            sessionDescription: { type: "answer", sdp: pc.localDescription.sdp }
          } });
        });
    }).catch(function (e) {
      rtc.受けた = false;
      st.err = 人の言葉に(e);
      描く();
    });
  }

  var 直し中 = false;
  function つなぎ直す() {
    if (直し中 || !st.call) return;
    直し中 = true;
    setTimeout(function () {
      直し中 = false;
      if (!st.call) return;
      SFUを閉じる(true);
      つなぎ始める();
    }, 1200);
  }

  /* ★ **閉じ忘れは 課金に 直結する。** 切る・落ちる・タブを 閉じる の すべてで 閉じる。 */
  function SFUを閉じる(残す) {
    var id = st.call && st.call.callId;
    var sid = rtc.sessionId;
    if (id && sid) {
      /* ★ タブを 閉じる ときでも 届くように keepalive を 付ける。
         sendBeacon は ヘッダを 付けられず 札を URL へ 出す ことに なるので 使わない。 */
      送りっぱなし("/api/call/rtc/close", { callId: id, sessionId: sid, tracks: [] });
    }
    try { if (pc) pc.close(); } catch (e) {}
    pc = null;
    try { if (自分の音) 自分の音.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    自分の音 = null;
    try { if (相手の音El) 相手の音El.srcObject = null; } catch (e) {}
    if (!残す) rtc = { sessionId: "", peerSessionId: "", 出した: false, 受けた: false, 名: "" };
    else rtc.sessionId = "";
  }

  function ミュート切替() {
    st.ミュート = !st.ミュート;
    try {
      if (rtk && rtk.self) {
        if (st.ミュート) rtk.self.disableAudio(); else rtk.self.enableAudio();
      }
    } catch (e) {}
    try {
      if (自分の音) 自分の音.getAudioTracks().forEach(function (t) { t.enabled = !st.ミュート; });
    } catch (e) {}
    描く();
  }
  function スピーカー切替() {
    st.スピーカー = !st.スピーカー;
    try {
      if (相手の音El && 相手の音El.setSinkId) {
        相手の音El.setSinkId(st.スピーカー ? "default" : "").catch(function () {});
      }
    } catch (e) {}
    描く();
  }

  /* ── 通報 ─────────────────────────────────────────────────────────── */
  function 通報を送る() {
    通報を控える();
    var r = st.通報;
    if (!r.理由 || r.busy) return;
    var id = st.call && st.call.callId;
    if (!id) { 閉じる(); return; }
    r.busy = true; st.err = ""; 描く();
    api("/api/call/report", { method: "POST", body: {
      callId: id, category: r.理由, detail: r.詳細 || ""
    } }).then(function () {
      片づける("報告しました。相手を ブロックしました。");
    }).catch(function (e) {
      r.busy = false;
      st.err = e.message || "送れませんでした。";
      描く();
    });
  }

  /* ── Lumi（両者の 同意が いる）───────────────────────────────────── */
  function Lumiを呼ぶ() {
    var id = st.call && st.call.callId;
    if (!id || st.lumi.動いている) return;
    st.err = "";
    /* まず 自分の 同意を 取る（押した だけでは 起動しない）。 */
    Lumiの同意窓("あなたの 声が AI の 提供元へ 送られます。相手にも 同じ 確認が 出ます。", function (ok) {
      if (!ok) return;
      api("/api/call/lumi/request", { method: "POST", body: { callId: id } })
        .then(function () { st.lumi.相手待ち = true; 描く(); })
        .catch(function (e) { st.err = e.message || "Lumi を 呼べませんでした。"; 描く(); });
    });
  }
  function Lumiの同意を聞く() {
    Lumiの同意窓("相手が Lumi を 呼びました。通話の 音声が AI の 提供元へ 送られます。", function (ok) {
      Lumiに答える(ok);
    });
  }
  function Lumiの同意窓(文, どうぞ) {
    var 前 = st.画面;
    建てる();
    var box = root.querySelector("[data-box]");
    box.innerHTML = '<div class="bd"></div><div class="w" role="dialog" aria-modal="true">'
      + '<div class="ttl">Lumi を 通話に 招く</div>'
      + '<div class="h2">よろしいですか？</div>'
      + '<p class="p">' + esc(文) + "</p>"
      + '<div class="ul">'
      + '<div class="li"><b>・</b><span><b>2 人とも 同意した ときだけ</b>入ります。</span></div>'
      + '<div class="li"><b>・</b><span>参加中は 両方の 画面に 表示されます。</span></div>'
      + '<div class="li"><b>・</b><span>30 秒 話しかけが なければ 自動で 抜けます。</span></div>'
      + "</div>"
      + '<div class="ft"><button class="btn" data-lc="0">断る</button>'
      + '<button class="btn pri" data-lc="1">同意する</button></div></div>';
    host.setAttribute("data-open", "1");
    var f = function (e) {
      var el = e.target;
      while (el && el !== root && !(el.dataset && el.dataset.lc !== undefined)) el = el.parentNode;
      if (!el || el === root) return;
      root.removeEventListener("click", f, true);
      var ok = el.dataset.lc === "1";
      st.画面 = 前 || "通話中";
      描く();
      どうぞ(ok);
    };
    root.addEventListener("click", f, true);
  }
  function Lumiに答える(ok) {
    var id = st.call && st.call.callId;
    if (!id) return;
    api("/api/call/lumi/consent", { method: "POST", body: { callId: id, agree: !!ok } })
      .then(function (j) {
        if (!j.started) {
          st.lumi.相手待ち = j.reason === "waiting";
          描く();
          return;
        }
        st.lumi.動いている = true;
        st.lumi.呼んだのは = j.speaker || 0;
        描く();
        if (j.token) Lumiを始める(j);
      })
      .catch(function (e) { st.err = e.message || "Lumi を 呼べませんでした。"; 描く(); });
  }

  /* ★ Live API は 入力を 1 本しか 受け取らず、**話者を 分けない**。
     2 人ぶんを 混ぜて 送ると 誰が 話したか 分からなくなる。
     だから **呼び出した 側の 声だけ**を 送る。
     Lumi の 声は この 端末で 鳴らし、SFU へ 出して 相手にも 届ける。 */
  /* ★ RealtimeKit の ときは マイクを SDK が 握っていて、こちらに 生の 音が 無い。
     Lumi へ 流す ぶんだけ **別に もう 1 本** 取る（同じ マイクを 2 本 取れる）。
     終わったら 必ず 止める。 */
  function Lumi用の音() {
    if (自分の音) return Promise.resolve(自分の音);
    if (lumiStream) return Promise.resolve(lumiStream);
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false
    }).then(function (s2) { lumiStream = s2; return s2; });
  }
  function Lumiを始める(j) {
    if (lumiWs) return;
    Lumi用の音().then(function () { Lumiを始める本体(j); })
      .catch(function () { st.err = "Lumi に 声を 渡せませんでした。"; 描く(); });
  }
  function Lumiを始める本体(j) {
    lumi開始 = Date.now();
    var url = "wss://generativelanguage.googleapis.com/ws/"
      + "google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent"
      + "?access_token=" + encodeURIComponent(j.token);
    try { lumiWs = new WebSocket(url); } catch (e) { lumiWs = null; return; }
    lumiWs.onopen = function () {
      try {
        lumiWs.send(JSON.stringify({ setup: {
          model: "models/" + (j.model || "gemini-3.1-flash-live-preview"),
          generationConfig: { responseModalities: ["AUDIO"] },
          systemInstruction: { parts: [{ text: j.systemInstruction || "" }] }
        } }));
      } catch (e) {}
      Lumiへ音を流す();
      /* 同席していれば、いまの 画面を 1 回 渡しておく
         （「これ 何？」と 聞かれた ときに 材料が 無いと 答えられない）。 */
      Lumiへ送った = "";
      Lumiへ今の画面を渡す();
      Lumi無言を見張る(j.maxSeconds || 300);
    };
    lumiWs.onmessage = function (ev) {
      /* 返ってくる 音は そのまま 鳴らす。**文字も 音も 保存しない。** */
      var やる = function (txt) {
        var d = null;
        try { d = JSON.parse(txt); } catch (e) { return; }
        var parts = d && d.serverContent && d.serverContent.modelTurn
          && d.serverContent.modelTurn.parts;
        if (!parts) return;
        parts.forEach(function (p) {
          if (p.inlineData && p.inlineData.data) {
            Lumiの声を鳴らす(p.inlineData.data);
            lumi無言の時 = Date.now();
          }
        });
      };
      if (typeof ev.data === "string") やる(ev.data);
      else if (ev.data && ev.data.text) ev.data.text().then(やる);
    };
    lumiWs.onclose = function () { lumiWs = null; };
    lumiWs.onerror = function () { try { lumiWs.close(); } catch (e) {} };
  }

  var lumi無言の時 = 0;
  function Lumi無言を見張る(上限秒) {
    lumi無言の時 = Date.now();
    if (lumi無言) clearInterval(lumi無言);
    lumi無言 = setInterval(function () {
      if (!lumiWs) return;
      /* 30 秒 何も 出てこなければ 自動で 抜ける。 */
      if (Date.now() - lumi無言の時 > 30000) { Lumiを止める(false, "quiet"); return; }
      if (Date.now() - lumi開始 > 上限秒 * 1000) { Lumiを止める(false, "maxtime"); }
    }, 2000);
  }

  function Lumiへ音を流す() {
    try {
      var C = window.AudioContext || window.webkitAudioContext;
      lumiCtx = new C({ sampleRate: 16000 });
      var src = lumiCtx.createMediaStreamSource(自分の音 || lumiStream);
      lumiNode = lumiCtx.createScriptProcessor(4096, 1, 1);
      lumiNode.onaudioprocess = function (e) {
        if (!lumiWs || lumiWs.readyState !== 1) return;
        var f = e.inputBuffer.getChannelData(0);
        var buf = new ArrayBuffer(f.length * 2);
        var view = new DataView(buf);
        for (var i = 0; i < f.length; i++) {
          var s = Math.max(-1, Math.min(1, f[i]));
          view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }
        var b = "";
        var u8 = new Uint8Array(buf);
        for (var k = 0; k < u8.length; k++) b += String.fromCharCode(u8[k]);
        try {
          lumiWs.send(JSON.stringify({ realtimeInput: { mediaChunks: [
            { mimeType: "audio/pcm;rate=16000", data: btoa(b) }
          ] } }));
        } catch (e2) {}
      };
      src.connect(lumiNode);
      lumiNode.connect(lumiCtx.destination);
    } catch (e) {}
  }

  var 鳴らす列 = [], 鳴らし中 = false, 出力ctx = null;
  function Lumiの声を鳴らす(b64) {
    try {
      if (!出力ctx) {
        var C = window.AudioContext || window.webkitAudioContext;
        出力ctx = new C({ sampleRate: 24000 });
      }
      var bin = atob(b64);
      var u8 = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      var i16 = new Int16Array(u8.buffer);
      var f32 = new Float32Array(i16.length);
      for (var k = 0; k < i16.length; k++) f32[k] = i16[k] / 32768;
      鳴らす列.push(f32);
      if (!鳴らし中) 列を鳴らす();
    } catch (e) {}
  }
  function 列を鳴らす() {
    if (!鳴らす列.length || !出力ctx) { 鳴らし中 = false; return; }
    鳴らし中 = true;
    var f = 鳴らす列.shift();
    var buf = 出力ctx.createBuffer(1, f.length, 24000);
    buf.getChannelData(0).set(f);
    var s = 出力ctx.createBufferSource();
    s.buffer = buf;
    s.connect(出力ctx.destination);
    s.onended = 列を鳴らす;
    s.start();
  }

  function Lumiを止める(静かに, 訳) {
    if (lumi無言) { clearInterval(lumi無言); lumi無言 = null; }
    if (lumiNode) { try { lumiNode.disconnect(); } catch (e) {} lumiNode = null; }
    if (lumiCtx) { try { lumiCtx.close(); } catch (e) {} lumiCtx = null; }
    if (lumiWs) { try { lumiWs.close(); } catch (e) {} lumiWs = null; }
    /* 別に 取った マイクは **必ず 止める**（録りっぱなしに しない）。 */
    if (lumiStream) {
      try { lumiStream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
      lumiStream = null;
    }
    鳴らす列 = []; 鳴らし中 = false;
    var 秒 = lumi開始 ? Math.round((Date.now() - lumi開始) / 1000) : 0;
    lumi開始 = 0;
    st.lumi.動いている = false;
    if (!静かに && st.call && 秒 > 0) {
      api("/api/call/lumi/end", { method: "POST", body: {
        callId: st.call.callId, seconds: 秒, reason: 訳 || "left"
      } }).catch(function () {});
    }
  }

  /* ══ 画面の 同席（VocabuQuiz の 中だけ）══════════════════════════════
     ★ **映像は 撮らない。** getDisplayMedia は 使わない。理由は 2 つ:
       ① iOS Safari に そもそも 無い（iPhone で 使えない 機能に なる）
       ② 画面ごと 撮ると **アプリの 外**（通知・他のタブ・写真）まで 写る
     ★ 代わりに「いま どの 画面の どこを 見ているか」を **文字で** 送る。
       1 回 2KB 未満・遅れ なし・アプリの 外は 原理的に 写らない。
     ★ 相手の 手は 奪わない。追従は 切れるし、クイズ中や 入力中は 動かさない。 */

  var タブの名 = {
    home: "ホーム", library: "プリセット", inbox: "Feed", news: "NEWS",
    insight: "Insights", notifications: "通知", chat: "Quick Chat",
    qredit: "Qredit", subscription: "Subscription", settings: "設定",
    survive: "VocabuSurvive", survival3: "VocabuSurvival"
  };
  var 画面の名 = {
    viewQuiz: "クイズ", viewResult: "結果", viewSwitch: "切り替え",
    viewStart: "スタート", viewTitle: "ホーム"
  };
  /* 中身では ない 覆い。これを 相手に 見せても 意味が ない。 */
  var 見せない窓 = { globalLoadingOverlay: 1, maintenanceOverlay: 1, quizExitOverlay: 1 };

  function 非力か() {
    try {
      if (document.documentElement.getAttribute("data-low-perf") === "1") return true;
      if (Number(navigator.deviceMemory || 8) < 4) return true;
      if (Number(navigator.hardwareConcurrency || 8) <= 4) return true;
    } catch (e) {}
    return false;
  }
  function 今のタブ() {
    try { return document.body.getAttribute("data-app-tab") || "home"; } catch (e) { return "home"; }
  }
  function 見えているか(el) {
    if (!el) return false;
    try {
      var r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      var s = getComputedStyle(el);
      return s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity) > 0.05;
    } catch (e) { return false; }
  }
  /* いま 開いている 窓（いちばん 後ろに 書かれた ものを 最前面と みなす）。 */
  function 開いている窓() {
    var 出 = null;
    try {
      var ov = document.querySelectorAll(".overlay:not(.hidden)");
      for (var i = 0; i < ov.length; i++) {
        if (見せない窓[ov[i].id]) continue;
        if (見えているか(ov[i])) 出 = ov[i];
      }
    } catch (e) {}
    return 出;
  }
  /* ★ 入れものは **決め打ちに しない**。タブの名前から 素直に 引き、
     無ければ 出ている .view へ 落ちる。画面が 増えても ここは 直さなくてよい。 */
  function 今の入れもの() {
    var v = null;
    try { v = document.querySelector(".view.active"); } catch (e) {}
    /* クイズ・結果などは タブより こちらが 本体。 */
    if (v && v.id !== "viewTitle" && 見えているか(v)) return v;
    var tab = 今のタブ();
    var 名 = tab.charAt(0).toUpperCase() + tab.slice(1);
    var 候補 = ["app" + 名 + "Page", "app" + 名 + "sPage"];
    for (var i = 0; i < 候補.length; i++) {
      var e = document.getElementById(候補[i]);
      if (e && 見えているか(e)) return e;
    }
    if (v && 見えているか(v)) return v;
    /* ★ 本文の 列（.stage）。左の パネルも 覆いも 入っていないので、
       body へ 落ちる 前に ここで 受ける。 */
    var st2 = document.querySelector(".stage");
    if (st2 && 見えているか(st2)) return st2;
    return document.querySelector("main") || document.body;
  }
  function 窓の名(w) {
    var a = w.getAttribute("aria-label");
    if (a) return String(a).trim();
    var h = w.querySelector("h1,h2,h3,.ttl,.modal-title,.sheet-title");
    var t = h ? String(h.textContent || "").trim() : "";
    return t || "ウィンドウ";
  }
  function 字(id) {
    var e = document.getElementById(id);
    return e ? String(e.textContent || "").replace(/\s+/g, " ").trim() : "";
  }
  /* 見えている 文を 上から 拾う。**アイコンの 字は 拾わない**
     （.ms / .vq2-ms は アイコン書体。中身は "school" などの 名前で、
       そのまま 送ると 相手には 意味不明な 英単語が 並ぶ）。 */
  /* 自分たち（通話の 窓・左の パネル・旧タブ）は 中身では ない。拾わない。 */
  var 拾わない = "#vqCall,#vqShell,#appTabBar,#vqLiveBar,.vqs-item";
  /* この 節を 拾ってよいか。だめなら **枝ごと** 見ない。 */
  function 通してよい(n) {
    var tag = n.tagName || "";
    if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|OPTION|SVG|CANVAS|AUDIO|VIDEO|IFRAME)$/i.test(tag)) return false;
    if (n.hidden || n.getAttribute("aria-hidden") === "true") return false;
    /* アイコン書体（.ms / .vq2-ms）の 中身は "school" などの 名前。
       そのまま 送ると 相手には 意味不明な 英単語が 並ぶ。 */
    var cn = " " + String(n.className && n.className.baseVal !== undefined
      ? n.className.baseVal : (n.className || "")) + " ";
    if (/\s(hidden|ms|vq2-ms|material-symbols[\w-]*)\s/.test(cn)) return false;
    try { if (n.matches(拾わない)) return false; } catch (e) {}
    var r = null;
    try { r = n.getBoundingClientRect(); } catch (e) { return false; }
    if (r.width < 1 && r.height < 1) return false;
    /* ★ **横に 逃がしてある 引き出し**は 拾わない。閉じた 引き出し（Apps など）は
       .hidden が 付かず、画面の 外へ ずらして あるだけ。ここを 見落とすと
       「相手は Insights を 見ている」のに 中身が Apps に なる。
       下へ 続く ぶん（縦）は 画面の 一部なので 残す。 */
    var 幅 = window.innerWidth || 0;
    if (r.right <= 0 || (幅 && r.left >= 幅)) return false;
    return true;
  }
  /* ★ **影の DOM へ 潜る**（2026-08-30 に 踏んだ）。
     NEWS / Feed / Insights の 中身は vq-news・vq-feed・vq-insight という
     影つきの 部品の **中**に ある。TreeWalker は 影に 入れないので、
     入れもの を 正しく 選んでいても **0 行**に なっていた
     （そして 逃げ道で 画面ぜんたいを 拾い、関係ない 窓の 字を 相手へ 送っていた）。 */
  function 潜る(親, 出, 見た, 上限, 数) {
    if (!親 || 出.length >= 上限 || 数.n > 6000) return;
    var 子 = 親.childNodes;
    for (var i = 0; i < 子.length; i++) {
      if (出.length >= 上限 || 数.n > 6000) return;
      var n = 子[i];
      数.n++;
      if (n.nodeType === 3) {
        var t = String(n.nodeValue || "").replace(/\s+/g, " ").trim();
        if (t.length < 2) continue;
        t = t.slice(0, 200);
        if (見た[t]) continue;
        見た[t] = 1;
        出.push(t);
        continue;
      }
      if (n.nodeType !== 1) continue;
      if (!通してよい(n)) continue;
      if (n.shadowRoot) 潜る(n.shadowRoot, 出, 見た, 上限, 数);
      潜る(n, 出, 見た, 上限, 数);
    }
  }
  function 文を抜く(範囲, 上限) {
    var 出 = [];
    if (!範囲) return 出;
    try { 潜る(範囲, 出, {}, 上限, { n: 0 }); } catch (e) {}
    return 出;
  }
  /** いま 見えている ものを **短い 文**に する。ここが 送る すべて。 */
  function 画面を写す() {
    var tab = 今のタブ();
    var v = null;
    try { v = document.querySelector(".view.active"); } catch (e) {}
    var view = (v && v.id) || "";
    var 窓 = 開いている窓();
    var 入 = 窓 || 今の入れもの();
    var where = 窓 ? 窓の名(窓)
      : (view && view !== "viewTitle" ? (画面の名[view] || view) : (タブの名[tab] || "ホーム"));
    var title = "";
    /* クイズは 進み具合が いちばん 大事なので 名指しで 拾う。 */
    if (!窓 && view === "viewQuiz") {
      title = [字("progressText"), 字("quizSubjectText"), 字("modePill")]
        .filter(function (x) { return x && x !== "—"; }).join(" ・ ");
    }
    /* ★ 入れものを 取り違えると **中身が 空の 帯**が 相手に 出る（実測 2026-08-30:
       Insights で 0 行だった）。名前で 引いた 入れものが 空なら、
       画面 まるごとから 拾い直す（左の パネルなどは 拾わない ので 混ざらない）。 */
    var 行 = 文を抜く(入, 12);
    /* ★ 空の ときの 逃げ道は **本文の 列（.stage）まで**。
       画面ぜんたい（body）へ 広げると、閉じている 窓や 覆いの 字を
       拾って **相手に 嘘の 画面**を 見せる（実測 2026-08-30:
       「Insights を 見ている」のに 中身が Apps や Quick Board に なった）。
       ここで 何も 取れなければ **何も 送らない**。画面の 名前だけで 正しい。 */
    if (!行.length) {
      var 次 = document.querySelector(".stage");
      if (次 && 次 !== 入) 行 = 文を抜く(次, 12);
    }
    return {
      v: 1, tab: tab, view: view,
      where: String(where).slice(0, 80),
      title: title.slice(0, 80),
      lines: 行,
      /* 追従の 手がかりは **タブだけ**。窓の 中まで 開けに いかない
         （相手の 作りかけを 壊さない ため）。 */
      go: { tab: 窓 ? "" : tab }
    };
  }

  function 畳む(に) {
    if (st.画面 !== "通話中") return;
    st.畳んだ = !!に;
    描く();
  }

  function 共有を始める() {
    var id = st.call && st.call.callId;
    if (!id || st.共有.出している) return;
    st.共有.err = "";
    api("/api/call/share/start", { method: "POST", body: { callId: id } })
      .then(function () {
        st.共有.出している = true;
        前に送った = ""; 共有の連続失敗 = 0;
        /* ★ 畳まないと **自分の 画面が 見えない**。押した 意味が なくなる。 */
        畳む(true);
        if (共有タイマ) clearInterval(共有タイマ);
        /* ★ 非力な 端末では ゆっくりに する。写すのは 画面ぜんたいを
           たどる 仕事なので、毎秒 やると 弱い 端末で 引っかかる。 */
        共有タイマ = setInterval(共有を送る, 非力か() ? 2400 : 1200);
        共有を送る();
        描く();
      })
      .catch(function (e) {
        st.共有.err = e.message || "画面を 同席できませんでした。";
        描く();
      });
  }
  function 共有をやめる(訳) {
    if (共有タイマ) { clearInterval(共有タイマ); 共有タイマ = null; }
    前に送った = "";
    var 出していた = st.共有.出している;
    st.共有.出している = false;
    var id = st.call && st.call.callId;
    if (出していた && id) {
      api("/api/call/share/stop", { method: "POST", body: { callId: id, reason: String(訳 || "") } })
        .catch(function () {});
    }
    描く();
  }
  function 共有を送る() {
    if (!st.共有.出している || !st.call) return;
    var f = null;
    try { f = 画面を写す(); } catch (e) { return; }
    if (!f) return;
    Lumiへ画面を渡す(f);
    /* 変わっていなければ 送らない（毎秒 同じ ものを 流さない）。 */
    var 印 = JSON.stringify([f.tab, f.view, f.where, f.title, f.lines]);
    if (印 === 前に送った) return;
    前に送った = 印;
    api("/api/call/share/frame", { method: "POST", body: { callId: st.call.callId, frame: f } })
      .then(function () { 共有の連続失敗 = 0; })
      .catch(function () {
        共有の連続失敗++;
        /* ★ 送れない まま 回し続けない。5 回 続けて 落ちたら 止める。 */
        if (共有の連続失敗 >= 5) {
          st.共有.err = "画面を 送れませんでした。同席を 止めます。";
          共有をやめる("失敗");
        }
      });
  }

  function 相手の画面を受けた(f) {
    if (!f) return;
    st.共有.受けている = true;
    st.共有.最新 = f;
    st.共有.届いた時 = Date.now();
    /* 幕の 下では 何も 見えない。届いたら 自動で 畳む。 */
    if (st.画面 === "通話中" && !st.畳んだ) 畳む(true);
    if (st.共有.追う) 同じ画面へ(false);
    Lumiへ画面を渡す(f);
    描く();
  }
  /* ★ 相手の 都合で **人の 手を 奪わない**。
     クイズ中・文字を 打っている 最中は 勝手に 動かさない
     （押した ときだけ 動く）。 */
  function 移ってよいか() {
    try {
      var v = document.querySelector(".view.active");
      if (v && v.id === "viewQuiz") return false;
      var a = document.activeElement;
      if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return false;
      if (a && a.isContentEditable) return false;
    } catch (e) {}
    return true;
  }
  function 同じ画面へ(手で) {
    var f = st.共有.最新;
    var t = f && f.go && String(f.go.tab || "");
    if (!t || !/^[a-zA-Z0-9_-]+$/.test(t)) return false;
    if (t === 今のタブ()) return false;
    if (!手で && !移ってよいか()) return false;
    var b = document.querySelector('#appTabBar [data-app-tab="' + t + '"]');
    if (!b) return false;
    try { b.click(); } catch (e) { return false; }
    if (手で) 描く();
    return true;
  }

  /* ── Lumi に 画面を 見せる ──────────────────────────────────────────
     ★ Live は 音の ほかに 文字も 受け取れる。**turnComplete を 立てない**ので
       これだけでは Lumi は しゃべらない（＝ 画面が 変わる たびに
       勝手に 実況を 始めたり しない）。聞かれた ときに 使える 材料に なる。 */
  function 画面を文に(f) {
    var a = ["【いまの 画面】" + String(f.where || "")];
    if (f.title) a.push(f.title);
    if (f.lines && f.lines.length) a.push(f.lines.join(" / "));
    return a.join("\n").slice(0, 1200);
  }
  function Lumiへ画面を渡す(f) {
    if (!lumiWs || lumiWs.readyState !== 1 || !f) return;
    var 文 = 画面を文に(f);
    if (!文 || 文 === Lumiへ送った) return;
    Lumiへ送った = 文;
    try {
      lumiWs.send(JSON.stringify({ clientContent: {
        turns: [{ role: "user", parts: [{ text: 文 }] }],
        turnComplete: false
      } }));
    } catch (e) {}
  }
  /* Lumi が 入った 直後は、まだ 何も 渡していない。いまの 画面を 1 回 渡す。 */
  function Lumiへ今の画面を渡す() {
    if (st.共有.受けている && st.共有.最新) { Lumiへ画面を渡す(st.共有.最新); return; }
    if (!st.共有.出している) return;
    try { Lumiへ画面を渡す(画面を写す()); } catch (e) {}
  }

  /* 通話が 終わった ときの 後始末（共有も 必ず 止める）。 */
  function 共有を片づける() {
    if (共有タイマ) { clearInterval(共有タイマ); 共有タイマ = null; }
    前に送った = ""; Lumiへ送った = ""; 共有の連続失敗 = 0;
    st.共有 = { 出している: false, 受けている: false, 追う: true,
                最新: null, 届いた時: 0, err: "" };
    st.畳んだ = false;
    畳みを反映();
  }

  /* ── 外へ 出す 口 ─────────────────────────────────────────────────── */
  window.__vqCall = {
    かける: かける,
    切る: function () { 切る("hangup"); },
    状態: function () {
      return {
        画面: st.画面,
        callId: (st.call && st.call.callId) || "",
        接続: st.接続,
        経過: Math.round(st.経過),
        lumi: st.lumi.動いている,
        sfu: rtcあり || !!rtc.sessionId,
        土台: rtk ? "rtk" : (rtc.sessionId ? "sfu" : ""),
        /* 合図の 通り道が 生きているか。0=つなぎ中 1=生きている 2/3=閉じた -1=無い */
        ws: ws ? ws.readyState : -1
      };
    },
    設定: function () { return st.設定; },
    /* ── 画面の 同席（検証と 外からの 操作）────────────────────────── */
    畳む: function (に) { 畳む(に !== false); return st.畳んだ; },
    共有: function (に) {
      if (に === false) { 共有をやめる("外から"); return false; }
      if (に === true || に === undefined) { 共有を始める(); return true; }
      return st.共有.出している;
    },
    同席: function () {
      return {
        出している: st.共有.出している,
        受けている: st.共有.受けている,
        追う: st.共有.追う,
        畳んだ: st.畳んだ,
        最新: st.共有.最新,
        err: st.共有.err
      };
    },
    /* 送る 前の 中身を そのまま 見る（画面を 触らずに 中身だけ 確かめる）。 */
    画面を写す: function () { try { return 画面を写す(); } catch (e) { return null; } },
    /* 相手が 本当に 入っていて、音が 出ているか。
       「つながっているのに 聞こえない」を 電話口で 切り分ける ため。 */
    相手: function () {
      if (!rtk) return { 土台: rtc.sessionId ? "sfu" : "", 参加者: 0 };
      var 並 = [];
      try { 並 = rtk.participants.joined.toArray().map(function (p) {
        return { 名: String(p.name || ""), 音: p.audioEnabled !== false };
      }); } catch (e) {}
      var 自分 = true;
      try { 自分 = rtk.self.audioEnabled !== false; } catch (e) {}
      return { 土台: "rtk", 参加者: 並.length, 相手: 並, 自分の音: 自分 };
    },
    /* 検証のため（画面を 触らずに 判定だけ 見る） */
    かけられるか: function (peerId) {
      return api("/api/call/can", { method: "POST", body: { peerId: Number(peerId) } });
    }
  };

  /* 落ちている 通話を 拾う（画面を 開き直した とき・押し出しを 取りこぼした とき）。 */
  function 落ちている通話を拾う() {
    return api("/api/call/state").then(function (j) {
      if (st.call) return;
      if (!j || !j.call) return;
      if (j.call.state !== "ringing" && j.call.state !== "connected") return;
      建てる();
      st.call = { callId: j.call.callId, peer: j.call.peer, iCall: j.call.iCall,
                  connectedAt: j.call.connectedAt };
      if (j.call.state === "ringing" && !j.call.iCall) { 開く("着信"); 呼び出し音を鳴らす(true); }
      else if (j.call.state === "ringing") 開く("発信中");
      else { 開く("通話中"); 経過を数える(); つなぎ始める(); }
    }).catch(function () {});
  }

  /* ── 起動 ─────────────────────────────────────────────────────────── */
  function boot() {
    if (!token()) { setTimeout(boot, 4000); return; }
    建てる();
    ws開く();
    ws見張る();
    /* 自分の id（Lumi の 同意の 出し分けに 使う）。config が 教えてくれる。 */
    設定を読む().then(function (j) {
      自分のid = Number((j && j.me) || 0);
      /* ★ 通話の 土台（Cloudflare Realtime）が 用意されていない うちは、
         **DM に 受話器を 出さない**。押しても 断られる ボタンを 見せない ため。 */
      window.__vqCallUsable = !!(j && j.configured);
      try { window.dispatchEvent(new CustomEvent("vq-call-ready", { detail: { 使える: window.__vqCallUsable } })); } catch (e) {}
    }).catch(function () {});
    落ちている通話を拾う();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  /* ★ タブを 閉じる ときにも 必ず 後始末する（課金の 暴走を 止める）。 */
  window.addEventListener("pagehide", function () {
    if (!st.call) return;
    送りっぱなし("/api/call/end", { callId: st.call.callId, reason: "unload" });
    SFUを閉じる();
  });
})();
