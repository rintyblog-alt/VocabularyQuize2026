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
    shield: '<path ' + P + ' d="M12 3l7 3v6c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6z"/>'
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
      "padding:26px 22px calc(22px + env(safe-area-inset-bottom,0px));",
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

    "@media (max-width:420px){",
      ":host([data-open='1']){padding:8px}",
      ".w{width:calc(100vw - 16px)}",
      ".w{border-radius:22px;padding:22px 16px calc(18px + env(safe-area-inset-bottom,0px))}",
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
    注意を出した: false
  };
  var host = null, root = null, ws = null, wsTimer = null, tick = null;
  var pc = null, 自分の音 = null, 相手の音El = null, 呼び出し音 = null;
  var rtcあり = false;          /* 音の 通り道が できたか（土台に よらず） */
  var rtc = { sessionId: "", peerSessionId: "", 出した: false, 受けた: false, 名: "" };
  var lumiWs = null, lumiCtx = null, lumiNode = null, lumiStream = null, lumi開始 = 0, lumi無言 = null;
  var 自分のid = 0;

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
    if (!st.画面) { box.innerHTML = ""; return; }
    var h = '<div class="bd" data-a="bd"></div><div class="w" role="dialog" aria-modal="true">';
    if (st.画面 === "同意") h += 同意の中身();
    else if (st.画面 === "発信中") h += 発信の中身();
    else if (st.画面 === "着信") h += 着信の中身();
    else if (st.画面 === "通話中") h += 通話の中身();
    else if (st.画面 === "通報") h += 通報の中身();
    box.innerHTML = h + "</div>";
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
    if (st.lumi.状態) h += '<div class="st">' + esc(st.lumi.状態) + "</div>";
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
  function ws見張る() {
    if (wsTimer) return;
    wsTimer = setInterval(function () {
      if (!token()) return;
      if (!ws || ws.readyState > 1) { ws開く(); return; }
      if (ws.readyState === 1) { try { ws.send(JSON.stringify({ type: "ping" })); } catch (e) {} }
      /* ★ 受け皿。押し出しを 取りこぼしても、10 秒 以内には 気づく。
         いま 何も 出していない ときだけ 聞きに行く（通話中は 邪魔しない）。 */
      if (!st.call) 落ちている通話を拾う();
    }, 10000);
  }

  function 合図(d) {
    var t = String(d.type || "");
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
    }, 1000);
  }

  function 片づける(訳) {
    呼び出し音を鳴らす(false);
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
