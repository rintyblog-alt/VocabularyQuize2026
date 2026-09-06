/* ══════════════════════════════════════════════════════════════════════
   vq-notifylive — 通知が 届いた その場で 鳴らす・出す

   訴え（2026-09-05）:
     「通知も、受信した タイミングで 通知として 鳴らす ように して 欲しい。
       アプリを 開いて いる ユーザーに リアルタイムで 通知音を 鳴らす。
       リアルタイムで 受信できるように して くれ。News も 同様にね」

   直す前:
     ・通知は **2 分ごとの 見に行き**だけ（vq-core の VQ_NOTIF_POLL_MS）。
       いちばん 遅いと 2 分 遅れて 気づく。音も 鳴らない。
     ・Web Push（閉じて いる とき）は あった。開いて いる ときだけ 遅かった。

   決めごと:
     ・**通り道は 増やさない。** 通話が 既に 繋いで いる WebSocket
       （/ws/call → CallHub）に 相乗りする。サーバは pushNotifyUser の
       1 か所から 押す ので、9 か所ある 通知の 作り口 すべてに 効く。
     ・音は **その場で 作る**（Web Audio）。音の ファイルを 増やさない＝
       起動が 重く ならない。短く・小さく・耳に 痛くない 2 音。
     ・iOS は **人が 一度 触るまで 音を 出せない**。触った ときに
       そっと 鍵を 開けておく（音は 鳴らさない）。
     ・設定で 切れる（player.notifySound）。既定は オン。
     ・鳴らしすぎない: 3 秒に 1 回まで。画面を 見て いない ときは 鳴らさない
       …ではなく **鳴らす**（気づく ためのもの）。ただし 同じ 通知は 1 回。
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  if (window.__vqNotifyLiveInstalled) return;
  window.__vqNotifyLiveInstalled = true;

  var 直近 = 0;              /* 最後に 鳴らした とき */
  var 間を空ける = 3000;      /* 続けて 来ても 3 秒に 1 回 */
  var 見た印 = Object.create(null);
  var ctx = null;

  /* ── 設定（切って ある なら 鳴らさない）──────────────────────── */
  /* ══ 音は **人が 設定で 選んだ もの**（2026-09-05）══════════════
     訴え「通知音は ユーザーが 設定で 設定して いる 音に して ね」

     ★ 設定は **もう 在った**（sound.notify・8 種類・試聴つき）。
       自前で 音を 作って いたのは 重複だった。選んだ 音を 鳴らす。
       大きさも 既存の 設定（sound.sfxVolume）に 従う。
       鳴らすのは __vqNewsFlash.play（音の 持ち主は そこ 1 つ）。
     ★「鳴らさない（off）」を 選んで いる 人には 鳴らさない。 */
  function 選ばれた音() {
    try {
      var v = window.__vqSet && window.__vqSet.get("sound.notify");
      return v === undefined || v === null || v === "" ? "n0" : String(v);
    } catch (e) {}
    try {
      var raw = localStorage.getItem("vq.settings.v1");
      if (raw) {
        var r = (JSON.parse(raw) || {})["sound.notify"];
        if (r && typeof r === "object" && "v" in r) r = r.v;
        if (r) return String(r);
      }
    } catch (e) {}
    return "n0";
  }
  function 鳴らしてよいか() { return 選ばれた音() !== "off"; }

  /* ── 音（その場で 作る）───────────────────────────────────────
     ★ ファイルを 読まない。起動を 重く しない ため。
     ★ 2 音（高→少し高）。短く 0.18 秒。音量は 控えめ。 */
  function 器を用意() {
    try {
      if (!ctx) {
        var C = window.AudioContext || window.webkitAudioContext;
        if (!C) return null;
        ctx = new C();
      }
      if (ctx.state === "suspended") ctx.resume().catch(function () {});
      return ctx;
    } catch (e) { return null; }
  }
  /* ══ 控えの 鳴らしかた（2026-09-05）══════════════════════════════
     訴え「通知音が ならないんだけど。なんでだ？」

     ★ Web Audio が 使えない・眠って いる ときの 控え。
       <audio> なら 鳴る ことが ある（作られかたが 違う）。
     ★ 音は **中に 埋め込む**（8kHz・0.18 秒・2.9KB）。
       別ファイルに すると 読み込みを 待つ ぶん 遅れる。
     ★ iPhone の **消音スイッチが 入って いると どちらでも 鳴らない**。
       それは 端末の 決まりで こちらからは 変えられない。
       だから バナーは 音と 関係なく 必ず 出す（別に 実装ずみ）。 */
  var BEEP = "data:audio/wav;base64,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";
  var 控えの器 = null;
  function 控えで鳴らす() {
    try {
      if (!控えの器) {
        控えの器 = new Audio(BEEP);
        控えの器.preload = "auto";
        控えの器.volume = 0.5;
        try { 控えの器.setAttribute("playsinline", ""); } catch (e) {}
      }
      控えの器.currentTime = 0;
      var p = 控えの器.play();
      if (p && p.catch) p.catch(function () {});
      return true;
    } catch (e) { return false; }
  }

  function 鳴らす() {
    var 音 = 選ばれた音();
    if (音 === "off") return false;
    /* ★ 人が 選んだ 音を 鳴らす。持ち主は __vqNewsFlash 1 つ。 */
    try {
      if (window.__vqNewsFlash && window.__vqNewsFlash.play) {
        var p = window.__vqNewsFlash.play(音);
        if (p && p.then) {
          p.then(function (鳴った) { if (!鳴った) 自前で鳴らす(); }, function () { 自前で鳴らす(); });
        }
        return true;
      }
    } catch (e) {}
    return 自前で鳴らす();
  }

  /* 控え。選んだ 音が 鳴らせない ときだけ（ファイルが 無い・読めない）。 */
  function 自前で鳴らす() {
    var c = 器を用意();
    if (!c) return 控えで鳴らす();
    /* 眠った まま なら 控えへ（触る前の iPhone など） */
    if (c.state !== "running") { try { c.resume(); } catch (e) {} }
    if (c.state !== "running") return 控えで鳴らす();
    try {
      var t0 = c.currentTime;
      [[880, 0], [1174.7, 0.085]].forEach(function (p) {
        var o = c.createOscillator(), g = c.createGain();
        o.type = "sine";
        o.frequency.setValueAtTime(p[0], t0 + p[1]);
        /* 立ち上がりを 少し なだらかに（プツッと いう 音を 出さない） */
        g.gain.setValueAtTime(0.0001, t0 + p[1]);
        g.gain.exponentialRampToValueAtTime(0.075, t0 + p[1] + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + p[1] + 0.16);
        o.connect(g); g.connect(c.destination);
        o.start(t0 + p[1]); o.stop(t0 + p[1] + 0.18);
      });
      return true;
    } catch (e) { return 控えで鳴らす(); }
  }

  /* ★ iOS は 人が 触るまで 音を 出せない。触った ときに 鍵だけ 開ける。 */
  function 鍵を開ける() {
    /* 控えの <audio> も、人が 触った この 一瞬に 一度 鳴らして おく
       （無音で 鳴らして すぐ 止める）。あとから 自動で 鳴らせる ように なる。 */
    try {
      if (!控えの器) { 控えの器 = new Audio(BEEP); 控えの器.preload = "auto"; 控えの器.volume = 0.5; }
      var v = 控えの器.volume; 控えの器.volume = 0;
      var pp = 控えの器.play();
      if (pp && pp.then) pp.then(function () {
        try { 控えの器.pause(); 控えの器.currentTime = 0; 控えの器.volume = v; } catch (e) {}
      }).catch(function () { try { 控えの器.volume = v; } catch (e) {} });
      else { try { 控えの器.pause(); 控えの器.volume = v; } catch (e) {} }
    } catch (e) {}
    var c = 器を用意();
    if (!c) return;
    try {
      var o = c.createOscillator(), g = c.createGain();
      g.gain.value = 0;                        /* 無音。鍵を 開ける だけ */
      o.connect(g); g.connect(c.destination);
      o.start(); o.stop(c.currentTime + 0.01);
    } catch (e) {}
  }
  /* ★ **毎回 開け直す**（2026-09-05）。1 回きりに して いたが、
     iOS は 画面を 離れて 戻ると また 眠る（suspended に なる）。
     開けっぱなしに できない ので、触る たびに そっと 起こす。
     中身は resume と 無音の 1 発だけ。重く ない。 */
  var 最後に開けた = 0;
  function そっと開ける() {
    var t = Date.now();
    if (t - 最後に開けた < 1500) return;   /* 連打で 何度も 走らせない */
    最後に開けた = t;
    鍵を開ける();
  }
  ["pointerdown", "touchstart", "keydown"].forEach(function (k) {
    window.addEventListener(k, そっと開ける, true);
  });
  try {
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) { 最後に開けた = 0; そっと開ける(); }
    });
  } catch (e) {}

  /* ── 数の 印を その場で 1 つ 増やす ───────────────────────────
     本体が 取り直すまでの 数百 ミリ秒を 埋める ため。
     ここは **見た目だけ**。正しい 数は すぐ あとで 本体が 入れ直す。 */
  function 数をひとつ増やす() {
    var el = document.getElementById("appSidebarNotifyCount");
    if (!el) return;
    var n = parseInt(String(el.textContent || "").replace(/[^\d]/g, ""), 10);
    if (!(n >= 0)) n = 0;
    n += 1;
    el.textContent = n > 99 ? "99+" : String(n);
    el.classList.remove("hidden");
    try { el.setAttribute("aria-label", "未読通知 " + n + "件"); } catch (e) {}
    /* 下部バーの 島は この 要素を 見張って いる（MutationObserver）が、
       念のため 直に 頼む（見張りが 外れて いても 効く ように）。 */
    try { if (window.__vqMobBar && window.__vqMobBar.sync) window.__vqMobBar.sync(); } catch (e) {}
  }

  /* ══ 画面の 中に 出す バナー（2026-09-05）══════════════════════════
     訴え「通知を 受信したら、必ず バナーの 通知 ＋ 通知音で リアルタイムで
           受信できる ように して ね。今だと モバイルは 下部バーの 通知部分が
           1 件 入ったって いう UI に なるだけ」

     ★ 直す前は **端末の 通知を 画面を 見て いない ときだけ** 出して いた。
       つまり **アプリを 見て いる 間は 何も 出て いなかった**（数が 増えるだけ）。
     ★ ここは アプリの 中の バナー。許可も 要らず、見て いる ときに 必ず 出る。
     ★ 押すと 通知の 画面へ。4.5 秒で ひとりでに 消える。
     ★ 上の 安全領域を 避ける（時計に 被らない）。 */
  var 器 = null, 影 = null;
  var BCSS = [
    "*{box-sizing:border-box;margin:0;padding:0}",
    ":host{position:fixed;left:0;right:0;top:0;z-index:2147483200;pointer-events:none;",
      "font-family:Inter,'Hiragino Sans','Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif}",
    ".wrap{padding:calc(var(--vq-sat,0px) + 10px) 12px 0;display:flex;flex-direction:column;gap:8px;",
      "align-items:center}",
    ".b{pointer-events:auto;width:min(420px,100%);display:flex;align-items:flex-start;gap:11px;",
      "padding:12px 13px;border-radius:16px;cursor:pointer;text-align:left;border:0;",
      "background:var(--vq-surface,#fff);",
      "background:color-mix(in srgb, var(--vq-surface,#fff) 92%, transparent);",
      "-webkit-backdrop-filter:blur(20px) saturate(150%);backdrop-filter:blur(20px) saturate(150%);",
      "box-shadow:0 10px 30px rgba(24,22,34,.22), 0 0 0 1px var(--vq-border-subtle,#EFEDF5);",
      "font-family:inherit;animation:in .3s cubic-bezier(.2,.9,.25,1)}",
    "@keyframes in{from{opacity:0;transform:translateY(-12px) scale(.97)}to{opacity:1;transform:none}}",
    ".b.out{animation:out .26s ease forwards}",
    "@keyframes out{to{opacity:0;transform:translateY(-10px) scale(.98)}}",
    ".ic{flex:0 0 auto;width:34px;height:34px;border-radius:11px;display:grid;place-items:center;",
      "background:var(--vq-accent-subtle,#EDE9FB);color:var(--vq-accent-text,#5F579E)}",
    ".ic svg{width:19px;height:19px}",
    ".tx{flex:1 1 auto;min-width:0}",
    ".t{font-size:14px;font-weight:700;color:var(--vq-text,#2B2836);line-height:1.5;",
      "overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".d{margin-top:2px;font-size:13px;line-height:1.6;color:var(--vq-text-secondary,#5A5568);",
      "display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}",
    ".x{flex:0 0 auto;width:26px;height:26px;border:0;background:none;border-radius:8px;cursor:pointer;",
      "color:var(--vq-text-tertiary,#A9A5B8);display:grid;place-items:center;font-family:inherit}",
    ".x svg{width:15px;height:15px}",
    "@media (prefers-reduced-motion:reduce){.b,.b.out{animation:none}}"
  ].join("");

  function 器を建てる() {
    if (器) return;
    器 = document.createElement("div");
    器.id = "vqNotifyBanner";
    影 = 器.attachShadow ? 器.attachShadow({ mode: "open" }) : 器;
    var st = document.createElement("style"); st.textContent = BCSS; 影.appendChild(st);
    var w = document.createElement("div"); w.className = "wrap"; 影.appendChild(w);
    document.body.appendChild(器);
  }
  function esc(x) {
    return String(x === undefined || x === null ? "" : x)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function バナー(d) {
    try {
      器を建てる();
      var w = 影.querySelector(".wrap");
      /* 積みすぎない。古い ものから 消す。 */
      while (w.children.length >= 3) w.removeChild(w.firstChild);
      var b = document.createElement("button");
      b.type = "button";
      b.className = "b";
      var ニュース = String(d.type || "") === "news.new";
      b.innerHTML = '<span class="ic">'
        + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">'
        + (ニュース
            ? '<path d="M4 5h16v11a3 3 0 0 1-3 3H6a2 2 0 0 1-2-2Z"/><path d="M8 9h8M8 13h5"/>'
            : '<path d="M18 8a6 6 0 1 0-12 0c0 7-2 8-2 8h16s-2-1-2-8"/><path d="M10.3 20a2 2 0 0 0 3.4 0"/>')
        + "</svg></span>"
        + '<span class="tx"><span class="t">' + esc(d.title || (ニュース ? "お知らせ" : "通知")) + "</span>"
        + (d.body ? '<span class="d">' + esc(d.body) + "</span>" : "") + "</span>"
        + '<span class="x" aria-label="閉じる"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></span>';
      var 消す = function () {
        b.classList.add("out");
        setTimeout(function () { try { b.remove(); } catch (e) {} }, 280);
      };
      b.addEventListener("click", function (e) {
        var 閉 = e.target && e.target.closest && e.target.closest(".x");
        if (閉) { 消す(); return; }
        消す();
        /* 押したら 通知（お知らせは お知らせ）の 画面へ */
        try {
          var tab = ニュース ? "news" : "notifications";
          var btn = document.querySelector('.app-tab-btn[data-app-tab="' + tab + '"]');
          if (btn) btn.click();
          else if (window.__vqScreens && window.__vqScreens.開く) window.__vqScreens.開く(tab);
        } catch (e2) {}
      });
      w.appendChild(b);
      setTimeout(消す, 4500);
      return true;
    } catch (e) { return false; }
  }

  /* ── 届いた ときに すること ──────────────────────────────────
     ① **バナー**（見て いる ときも 必ず 出す）
     ② 音（設定が オンで、3 秒 空いて いれば）
     ③ 通知の 一覧を 取り直す（数の 印・一覧が すぐ 変わる）
     ④ 端末の 通知（画面を 見て いない ときだけ。見て いる ときは ①が 出る） */
  function 受ける(d) {
    d = d || {};
    var 印 = String(d.tag || d.id || "") + "|" + String(d.at || "");
    if (印 && 見た印[印]) return;
    if (印) {
      見た印[印] = 1;
      /* 覚えすぎない（開きっぱなしでも 増え続けない ように） */
      var 鍵 = Object.keys(見た印);
      if (鍵.length > 200) delete 見た印[鍵[0]];
    }

    /* ★ バナーは **設定に かかわらず 出す**。音だけを 切りたい 人が いる。
       「1 件 増えた」だけでは 気づけない、が 訴えの 中身。 */
    バナー(d);

    var 今 = Date.now();
    if (鳴らしてよいか() && 今 - 直近 > 間を空ける) {
      直近 = 今;
      鳴らす();
      /* Android は 短く 震わせる（iOS の Safari は 対応して いない）。
         音を 切って いる 人には 震わせない（切った 意思を 尊重する）。 */
      try { if (navigator.vibrate) navigator.vibrate(18); } catch (e) {}
    }

    /* ══ 数の 印を **バナーと 同時に** 増やす（2026-09-05）══════════
       訴え「下部バーの 通知にも すぐ 件数の やつを バナーと 同時に 出る
             ように して。リアルタイムで」

       ★ 直す前は window.VQ.refreshNotifications / __vqRefreshNotifications を
         呼んで いたが、**どちらも 無い 名前**だった（本体の 口は
         `window.__vqNotif.refresh()`）。つまり 取り直しが 一度も 走らず、
         数は 2 分ごとの 巡回で しか 変わって いなかった。

       ★ 取り直しは サーバへ 行くので 一瞬 待つ。バナーと 同時に 見えて
         ほしい ので、**先に 1 つ 増やして** から 取り直す。
         取り直しが 終われば 正しい 数で 上書きされる（ずれても すぐ 直る）。
       ★ 下部バーの 島は #appSidebarNotifyCount を 見張って いる ので、
         ここを 増やせば 島の 赤い 数字も その場で 変わる。 */
    try { 数をひとつ増やす(); } catch (e) {}
    try {
      if (window.__vqNotif && typeof window.__vqNotif.refresh === "function") {
        window.__vqNotif.refresh();
      }
    } catch (e) {}
    try { window.dispatchEvent(new CustomEvent("vq-notify-new", { detail: d })); } catch (e) {}

    /* 画面を 見て いない ときは 端末の 通知も 出す（許可済みの 人だけ）。 */
    try {
      if (document.hidden && window.Notification && Notification.permission === "granted") {
        var n = new Notification(String(d.title || "VocabuQuiz"), {
          body: String(d.body || ""),
          tag: String(d.tag || "vq-notify"),
          icon: "/assets/icon/pwa-192.png?v=3"
        });
        n.onclick = function () { try { window.focus(); n.close(); } catch (e) {} };
      }
    } catch (e) {}
  }

  window.__vqNotifyLive = {
    受ける: 受ける,
    バナー: バナー,
    選ばれた音: 選ばれた音,
    鳴らす: function () { return 鳴らす(); },
    鳴らしてよいか: 鳴らしてよいか
  };
})();
