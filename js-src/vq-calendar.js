/* ══════════════════════════════════════════════════════════════════════════
   vq-calendar — 自分の カレンダー（2026-09-01・訴え）

   訴え:「カレンダーを 自分で 設定し、記録できる。**アカウントで 同期。
         端末を 変えたとて。**」

   直す前:
     ホームの「試験カレンダー」は **端末の localStorage だけ**（GOALS_KEY）。
     ・自分で 足せる のは 試験の 日だけ
     ・記録（今日 やった こと）は どこにも 書けない
     ・**端末を 変えると 全部 消える**（同期の 対象に 入って いなかった）

   ここで やること:
     ・月の 表。日を 押すと その日の 予定と 記録
     ・4 つの 種類: 試験 / 課題 / 予定 / 記録
     ・**アカウントで 同期**。同期の 土台（/api/sync）に そのまま 乗せる
       （新しい 仕組みを 作らない。1 件＝id + 中身 + updated_at / deleted_at）
     ・消しても **消えた ことが 伝わる**（deletedAt を 残す。行を 消すと
       ほかの 端末で 生き返る）

   ★ vq2-app には 足さない。自分の ファイル・自分の 指紋。
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  if (window.__vqCalendarInstalled) return;
  window.__vqCalendarInstalled = true;

  var doc = document;
  var KEY = "vq.calendar.v1";
  var 同期の印 = "vq.calendar.syncedAt.v1";
  function esc(s) {
    return String(s === undefined || s === null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function apiBase() {
    try { if (window.VQ2 && window.VQ2.apiBase) return window.VQ2.apiBase(); } catch (e) {}
    try {
      var b = String(window.VQ_API_BASE || window.AUTH_API_BASE || "").replace(/\/+$/, "");
      if (b) return b;
      var h = location.hostname;
      if (h === "127.0.0.1" || h === "localhost") return location.origin;
    } catch (e) {}
    return "https://www.vocabuquiz.app";
  }
  function token() { try { return localStorage.getItem("app.auth.token.v1") || ""; } catch (e) { return ""; } }

  /* ── 種類。**色だけで 分けない**（アイコンと 言葉も 付ける）── */
  var 種類 = [
    { id: "exam", 名: "試験", 色: "#D9534F", 印: "◎" },
    { id: "task", 名: "課題", 色: "#E0A030", 印: "▲" },
    { id: "plan", 名: "予定", 色: "#756DB3", 印: "●" },
    { id: "log", 名: "記録", 色: "#3BA55D", 印: "✓" }
  ];
  function 種(id) {
    for (var i = 0; i < 種類.length; i++) if (種類[i].id === id) return 種類[i];
    return 種類[2];
  }

  var P = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
  var ICON = {
    x: '<path ' + P + ' d="M6 6l12 12M18 6L6 18"/>',
    left: '<path ' + P + ' d="M15 5l-7 7 7 7"/>',
    right: '<path ' + P + ' d="M9 5l7 7-7 7"/>',
    plus: '<path ' + P + ' d="M12 5v14M5 12h14"/>',
    trash: '<path ' + P + ' d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>',
    cloud: '<path ' + P + ' d="M7 18h10a4 4 0 000-8 5.5 5.5 0 00-10.6 1.5A3.5 3.5 0 007 18z"/>',
    help: '<circle ' + P + ' cx="12" cy="12" r="9"/><path ' + P + ' d="M9.6 9.2a2.5 2.5 0 114 2.3c-.9.6-1.6 1-1.6 2M12 17h.01"/>',
    check: '<path ' + P + ' d="M4 12.5l5 5L20 6.5"/>'
  };
  function svg(n, c) { return '<svg viewBox="0 0 24 24" class="' + (c || "i") + '" aria-hidden="true">' + (ICON[n] || "") + "</svg>"; }

  /* ── 置き場 ─────────────────────────────────────────────────
     1 件 = { id, date:"YYYY-MM-DD", kind, title, note, done, updatedAt, deletedAt }
     ★ 消した ものも **残す**（deletedAt を 立てる）。行ごと 消すと、
       ほかの 端末の 古い 控えが 勝って **生き返る**。 */
  function 全部() {
    try {
      var a = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }
  function 書く(並) {
    try { localStorage.setItem(KEY, JSON.stringify(並.slice(0, 4000))); } catch (e) {}
  }
  function 生きて(x) { return x && !x.deletedAt; }
  function その日(d) { return 全部().filter(生きて).filter(function (x) { return x.date === d; }); }
  function 新しいid() { return "cal-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7); }

  function 入れる(rec) {
    var 並 = 全部();
    var i = -1;
    for (var k = 0; k < 並.length; k++) if (並[k] && 並[k].id === rec.id) { i = k; break; }
    rec.updatedAt = Date.now();
    if (i >= 0) 並[i] = Object.assign({}, 並[i], rec); else 並.push(rec);
    書く(並);
    送る();
    return rec;
  }
  function 消す(id) {
    var 並 = 全部();
    for (var k = 0; k < 並.length; k++) {
      if (並[k] && 並[k].id === id) { 並[k].deletedAt = Date.now(); 並[k].updatedAt = Date.now(); }
    }
    書く(並);
    送る();
  }

  /* ══ 同期（土台に 乗せる。新しい 口を 作らない）══════════════════════
     ★ 送る／取る は **どちらも 同じ 形**（id・中身・updated_at・deleted_at）。
     ★ 新しい ほうが 勝つ。同じ ときは そのまま（勝手に 消さない）。 */
  var 送る待ち = 0;
  /* 設定で 切って いれば 送らない（data.calendarSync）。 */
  function 同期する設定か() {
    try {
      var v = localStorage.getItem("vq.calendar.sync.v1");
      return v === null || v === "1";
    } catch (e) { return true; }
  }
  function 送る() {
    if (!token()) return;                     /* ログインしていなければ 端末だけ */
    if (!同期する設定か()) return;
    if (送る待ち) clearTimeout(送る待ち);
    /* 打つたびに 送らない（1.2 秒 まとめる）。 */
    送る待ち = setTimeout(function () {
      送る待ち = 0;
      var 並 = 全部();
      if (!並.length) return;
      window.fetch(apiBase() + "/api/sync/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token() },
        /* ★ **中身を そのまま 送る**（包まない）。土台は 受け取った
           もの まるごとを 中身として しまう（normalizeSyncItem）ので、
           {id, data:{…}} の 形で 送ると **入れ子に なって 題が 消える**
           （実測 2026-09-01: 取り出すと title が undefined だった）。 */
        body: JSON.stringify({ calendar: 並.map(function (x) {
          return Object.assign({}, x, { id: x.id,
            updatedAt: Number(x.updatedAt) || 0, deletedAt: Number(x.deletedAt) || 0 });
        }) })
      }).then(function () {
        try { localStorage.setItem(同期の印, String(Date.now())); } catch (e) {}
        塗る();
      }).catch(function () {});
    }, 1200);
  }
  function 取る(done) {
    if (!token() || !同期する設定か()) { if (done) done(false); return; }
    window.fetch(apiBase() + "/api/sync/snapshot", {
      headers: { Authorization: "Bearer " + token() }
    }).then(function (r) { return r.json(); }).then(function (j) {
      var 来 = (j && j.snapshot && Array.isArray(j.snapshot.calendar)) ? j.snapshot.calendar : [];
      var 表 = {};
      全部().forEach(function (x) { if (x && x.id) 表[x.id] = x; });
      var 変 = false;
      来.forEach(function (x) {
        if (!x || !x.id) return;
        var 今 = 表[x.id];
        var 来版 = Math.max(Number(x.updatedAt) || 0, Number(x.deletedAt) || 0);
        var 今版 = 今 ? Math.max(Number(今.updatedAt) || 0, Number(今.deletedAt) || 0) : -1;
        /* ★ 新しい ほうが 勝つ。**同じ ときは 触らない**（行ったり来たりしない）。 */
        if (来版 > 今版) { 表[x.id] = x; 変 = true; }
      });
      if (変) {
        書く(Object.keys(表).map(function (k) { return 表[k]; }));
      }
      try { localStorage.setItem(同期の印, String(Date.now())); } catch (e) {}
      if (done) done(変);
    }).catch(function () { if (done) done(false); });
  }

  /* ── 見た目 ─────────────────────────────────────────────── */
  var CSS = [
    "*{box-sizing:border-box;margin:0;padding:0}",
    ":host{position:fixed;inset:0;z-index:2147483104;display:none;",
      "font-family:var(--vq-app-font,Inter,'Hiragino Sans','Noto Sans JP',sans-serif);",
      "color:var(--vq-text,#2B2836)}",
    ":host([data-open='1']){display:block}",
    "button{font:inherit;color:inherit;background:none;border:0;cursor:pointer}",
    "input,textarea,select{font:inherit;color:inherit}",
    ".i{width:18px;height:18px;flex:0 0 auto}",
    ".bd{position:absolute;inset:0;background:rgba(38,34,68,.44);",
      "-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}",
    ".w{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);",
      "width:min(760px,calc(100vw - 24px));max-height:calc(100dvh - 32px);overflow:auto;",
      "background:var(--vq-surface,#fff);border-radius:24px;border:1px solid var(--vq-border,#E7E4EF);",
      "box-shadow:0 24px 70px rgba(16,14,26,.30);",
      "padding:20px 22px calc(20px + var(--vq-sab,0px));",
      "animation:calUp .24s cubic-bezier(.22,1,.36,1) both}",
    ".w.keep{animation:none}",
    "@keyframes calUp{from{opacity:0;transform:translate(-50%,-46%)}to{opacity:1;transform:translate(-50%,-50%)}}",
    "@keyframes calSheet{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}",
    ".hd{display:flex;align-items:center;gap:10px;margin-bottom:14px}",
    ".ttl{font-size:19px;font-weight:750}",
    ".sp{flex:1 1 auto}",
    /* ★ **縮ませない**（2026-09-01 実測: 320px で 30px まで つぶれて いた）。
       flex の 中に 置くと 幅が 足りない ときに 押しどころから 削られる。 */
    ".ib{width:40px;height:40px;flex:0 0 auto;border-radius:11px;display:inline-flex;",
      "align-items:center;justify-content:center;border:1px solid var(--vq-border,#E7E4EF)}",
    ".ib:hover{background:var(--vq-surface-hover,#F7F5FC)}",
    ".mon{font-size:16px;font-weight:700;min-width:8.5em;text-align:center}",
    ".sync{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;",
      "color:var(--vq-text-muted,#7A7589)}",
    /* 月の 表 */
    ".wk{display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:4px}",
    ".wk span{text-align:center;font-size:11px;font-weight:700;color:var(--vq-text-muted,#7A7589);padding:4px 0}",
    ".wk span.s{color:#D9534F}.wk span.t{color:#4A7FD0}",
    ".gr{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}",
    ".dy{position:relative;min-height:74px;border-radius:12px;padding:6px 6px 4px;text-align:left;",
      "border:1px solid var(--vq-border-subtle,#EFEDF5);background:var(--vq-surface,#fff);cursor:pointer;",
      "display:flex;flex-direction:column;gap:3px;overflow:hidden}",
    ".dy:hover{background:var(--vq-surface-hover,#F7F5FC)}",
    ".dy.out{opacity:.38}",
    ".dy.today{border-color:var(--vq-primary,#756DB3);box-shadow:inset 0 0 0 1px var(--vq-primary,#756DB3)}",
    ".dy.on{background:var(--vq-primary-subtle,#F4F2FB);border-color:var(--vq-primary,#756DB3)}",
    ".dn{font-size:12px;font-weight:700}",
    ".dy.sun .dn{color:#D9534F}.dy.sat .dn{color:#4A7FD0}",
    ".ev{display:flex;align-items:center;gap:4px;font-size:10.5px;line-height:1.4;",
      "white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".ev i{width:6px;height:6px;border-radius:50%;flex:0 0 auto}",
    ".more{font-size:10px;color:var(--vq-text-muted,#7A7589)}",
    /* その日 */
    ".day{margin-top:16px;border-top:1px solid var(--vq-border,#E7E4EF);padding-top:14px}",
    ".day-h{display:flex;align-items:center;gap:10px;margin-bottom:10px}",
    ".day-h b{font-size:15px;font-weight:750}",
    ".rows{display:grid;gap:8px}",
    ".row{display:flex;align-items:flex-start;gap:9px;border:1px solid var(--vq-border,#E7E4EF);",
      "border-radius:12px;padding:10px 11px}",
    ".row .k{font-size:10.5px;font-weight:750;padding:2px 8px;border-radius:999px;color:#fff;flex:0 0 auto}",
    ".row .c{flex:1 1 auto;min-width:0}",
    ".row .t{font-size:13.5px;font-weight:650;word-break:break-word}",
    ".row .n{font-size:12px;color:var(--vq-text-muted,#7A7589);margin-top:3px;line-height:1.7;word-break:break-word}",
    ".row .x{width:34px;height:34px;border-radius:9px;display:inline-flex;align-items:center;justify-content:center;",
      "color:var(--vq-danger,#B3261E);flex:0 0 auto}",
    ".row .x:hover{background:var(--vq-danger-subtle,#FDECEC)}",
    ".empty{font-size:12.5px;color:var(--vq-text-muted,#7A7589);padding:6px 0 2px}",
    /* 足す */
    ".add{margin-top:12px;border:1px solid var(--vq-border,#E7E4EF);border-radius:14px;padding:12px}",
    ".kinds{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}",
    ".kind{height:34px;padding:0 12px;border-radius:999px;font-size:12.5px;font-weight:650;",
      "border:1px solid var(--vq-border,#D7D2E4)}",
    ".kind.on{color:#fff;border-color:transparent}",
    ".f{display:flex;gap:8px;flex-wrap:wrap}",
    ".f input{flex:1 1 220px;height:42px;padding:0 12px;border-radius:10px;",
      "border:1px solid var(--vq-border,#D7D2E4);background:var(--vq-surface,#fff)}",
    ".f input:focus{outline:2px solid var(--vq-primary,#756DB3);outline-offset:1px}",
    ".btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:42px;",
      "padding:0 16px;border-radius:11px;font-size:13.5px;font-weight:650;",
      "border:1px solid var(--vq-border,#D7D2E4);background:var(--vq-surface,#fff)}",
    ".btn.pri{background:var(--vq-primary,#756DB3);color:#fff;border-color:transparent}",
    ".btn.pri:hover{background:var(--vq-primary-strong,#5F579E)}",
    ".btn:hover{background:var(--vq-surface-hover,#F7F5FC)}",
    ".hint{font-size:11.5px;color:var(--vq-text-muted,#7A7589);margin-top:8px;line-height:1.7}",
    /* スマホ。**下から せり上がる 板**。 */
    "@media (max-width:640px){",
      ".w{left:0;top:auto;bottom:0;transform:none;width:100vw;max-width:100vw;max-height:94dvh;",
        "border-radius:20px 20px 0 0;padding:16px 14px calc(16px + var(--vq-sab,0px));",
        "animation:calSheet .26s cubic-bezier(.22,1,.36,1) both}",
      ".dy{min-height:56px;border-radius:9px;padding:4px 4px 3px}",
      ".dn{font-size:11px}",
      ".ev{font-size:9.5px}",
      ".gr,.wk{gap:3px}",
      ".btn,.f input{height:46px}",
      ".kind{height:38px}",
    "}",
    "@media (prefers-reduced-motion:reduce){.w{animation:none}}"
  ].join("");

  var host = null, root = null;
  var st = { 開: false, 年: 0, 月: 0, 選: "", 種: "plan", 前: "" };

  function 建てる() {
    if (host) return;
    host = doc.createElement("div");
    host.id = "vqCalendar";
    root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    var s = doc.createElement("style"); s.textContent = CSS; root.appendChild(s);
    var b = doc.createElement("div"); b.setAttribute("data-box", ""); root.appendChild(b);
    doc.body.appendChild(host);
    つなぐ();
  }

  function ymd(d) {
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }
  function 今日() { return ymd(new Date()); }

  function 開く(o) {
    建てる();
    o = o || {};
    var d = o.date ? new Date(String(o.date) + "T00:00:00") : new Date();
    if (isNaN(d.getTime())) d = new Date();
    st.年 = d.getFullYear(); st.月 = d.getMonth();
    st.選 = o.date ? String(o.date) : 今日();
    st.開 = true; st.前 = "";
    host.setAttribute("data-open", "1");
    描く();
    取る(function (変) { if (変) 描く(); });
  }
  function 閉じる() { st.開 = false; if (host) host.removeAttribute("data-open"); }

  /* ★ 描き直しても **巻きと 指を 保つ**（vq-make と 同じ 作法）。 */
  function 描く() {
    if (!root) return;
    var box = root.querySelector("[data-box]");
    if (!box) return;
    if (!st.開) { box.innerHTML = ""; st.前 = ""; return; }
    var 印 = st.年 + "/" + st.月;
    var 同じ = st.前 === 印;
    var 控 = null;
    if (同じ) {
      var w0 = box.querySelector(".w");
      if (w0) {
        控 = { 巻: w0.scrollTop, 焦: null };
        var a = null; try { a = root.activeElement; } catch (e) {}
        if (a && a.id) { 控.焦 = { id: a.id, s: null }; try { 控.焦.s = a.selectionStart; } catch (e) {} }
      }
    }
    box.innerHTML = '<div class="bd" data-a="close"></div>'
      + '<div class="w' + (同じ ? " keep" : "") + '" role="dialog" aria-modal="true" aria-label="カレンダー">'
      + 中身() + "</div>";
    st.前 = 印;
    if (控) {
      var w = box.querySelector(".w");
      if (w && 控.巻) { void w.scrollHeight; w.scrollTop = 控.巻; }
      if (控.焦) {
        var t = root.getElementById ? root.getElementById(控.焦.id) : box.querySelector("#" + 控.焦.id);
        if (t) {
          try { t.focus({ preventScroll: true }); } catch (e) { try { t.focus(); } catch (e2) {} }
          if (控.焦.s !== null && t.setSelectionRange) { try { t.setSelectionRange(控.焦.s, 控.焦.s); } catch (e) {} }
        }
      }
    }
  }
  function 塗る() {
    if (!st.開 || !root) return;
    var el = root.querySelector("[data-sync]");
    if (!el) return;
    var t = 0;
    try { t = Number(localStorage.getItem(同期の印)) || 0; } catch (e) {}
    el.textContent = !token() ? "この端末だけ" : (t ? "同期しました" : "同期していません");
  }

  function 中身() {
    var 今 = 今日();
    var 一 = new Date(st.年, st.月, 1);
    /* ★ 週の 始まり（設定 display.weekStart）。0＝日曜・1＝月曜。 */
    var 始 = 0;
    try { 始 = (localStorage.getItem("vq.weekStart.v1") === "1") ? 1 : 0; } catch (e) {}
    var 頭 = (一.getDay() - 始 + 7) % 7;
    var 日数 = new Date(st.年, st.月 + 1, 0).getDate();
    var 前日数 = new Date(st.年, st.月, 0).getDate();
    var 表 = {};
    全部().filter(生きて).forEach(function (x) {
      (表[x.date] = 表[x.date] || []).push(x);
    });
    var h = '<div class="hd">'
      + '<div class="ttl">カレンダー</div><div class="sp"></div>'
      + '<span class="sync">' + svg("cloud", "i") + '<span data-sync>—</span></span>'
      /* ★ **困った その 場から ヘルプへ**（2026-09-01）。
         「どこかに ヘルプが ある」より「いま 見て いる 画面の 説明」が 要る。 */
      + '<button class="ib" data-a="help" aria-label="この 画面の ヘルプ" title="この 画面の ヘルプ">'
      + svg("help") + "</button>"
      + '<button class="ib" data-a="close" aria-label="閉じる">' + svg("x") + "</button></div>";
    h += '<div class="hd">'
      + '<button class="ib" data-a="prev" aria-label="前の 月">' + svg("left") + "</button>"
      + '<div class="mon">' + st.年 + " 年 " + (st.月 + 1) + " 月</div>"
      + '<button class="ib" data-a="next" aria-label="次の 月">' + svg("right") + "</button>"
      + '<div class="sp"></div>'
      + '<button class="btn" data-a="today">今日</button></div>';
    var 曜名 = ["日", "月", "火", "水", "木", "金", "土"];
    h += '<div class="wk">' + 曜名.map(function (_, i) {
      var k = (i + 始) % 7;
      return '<span class="' + (k === 0 ? "s" : k === 6 ? "t" : "") + '">' + 曜名[k] + "</span>";
    }).join("") + "</div>";
    h += '<div class="gr">';
    var 出す = function (y, mo, d, 外) {
      var key = y + "-" + ("0" + (mo + 1)).slice(-2) + "-" + ("0" + d).slice(-2);
      var 曜 = new Date(y, mo, d).getDay();
      var 並 = (表[key] || []).slice(0, 3);
      var 余 = (表[key] || []).length - 並.length;
      return '<button class="dy' + (外 ? " out" : "") + (key === 今 ? " today" : "")
        + (key === st.選 ? " on" : "") + (曜 === 0 ? " sun" : 曜 === 6 ? " sat" : "")
        + '" data-a="day" data-d="' + key + '" aria-label="' + key + '">'
        + '<span class="dn">' + d + "</span>"
        + 並.map(function (x) {
            var k = 種(x.kind);
            return '<span class="ev"><i style="background:' + k.色 + '"></i>' + esc(String(x.title || k.名).slice(0, 8)) + "</span>";
          }).join("")
        + (余 > 0 ? '<span class="more">ほか ' + 余 + "</span>" : "")
        + "</button>";
    };
    for (var i = 頭 - 1; i >= 0; i--) h += 出す(st.月 === 0 ? st.年 - 1 : st.年, (st.月 + 11) % 12, 前日数 - i, true);
    for (var d2 = 1; d2 <= 日数; d2++) h += 出す(st.年, st.月, d2, false);
    var 埋 = (7 - ((頭 + 日数) % 7)) % 7;
    for (var j = 1; j <= 埋; j++) h += 出す(st.月 === 11 ? st.年 + 1 : st.年, (st.月 + 1) % 12, j, true);
    h += "</div>";

    /* その日 */
    var 並2 = その日(st.選).sort(function (a, b) { return (a.updatedAt || 0) - (b.updatedAt || 0); });
    var dd = new Date(String(st.選) + "T00:00:00");
    h += '<div class="day"><div class="day-h"><b>'
      + (isNaN(dd.getTime()) ? esc(st.選) : ((dd.getMonth() + 1) + " 月 " + dd.getDate() + " 日（"
        + ["日", "月", "火", "水", "木", "金", "土"][dd.getDay()] + "）"))
      + "</b><div class=\"sp\"></div></div>";
    h += '<div class="rows">';
    if (!並2.length) h += '<div class="empty">この日は まだ 何も ありません。下から 足せます。</div>';
    並2.forEach(function (x) {
      var k = 種(x.kind);
      h += '<div class="row">'
        + '<span class="k" style="background:' + k.色 + '">' + k.名 + "</span>"
        + '<span class="c"><span class="t">' + esc(x.title || k.名) + "</span>"
        + (x.note ? '<span class="n">' + esc(x.note) + "</span>" : "") + "</span>"
        + '<button class="x" data-a="del" data-id="' + esc(x.id) + '" aria-label="消す">' + svg("trash") + "</button>"
        + "</div>";
    });
    h += "</div>";

    /* 足す */
    h += '<div class="add">'
      + '<div class="kinds">' + 種類.map(function (k) {
          return '<button class="kind' + (st.種 === k.id ? " on" : "") + '" data-a="kind" data-v="' + k.id + '"'
            + (st.種 === k.id ? ' style="background:' + k.色 + '"' : "") + ">" + k.名 + "</button>";
        }).join("") + "</div>"
      + '<div class="f">'
      + '<input id="cal-t" placeholder="' + (st.種 === "log" ? "やったこと（例: 英単語 50 問）" : "予定の 名前（例: 期末考査）") + '" maxlength="60">'
      + '<input id="cal-n" placeholder="ひとこと（任意）" maxlength="120">'
      + '<button class="btn pri" data-a="add">' + svg("plus") + "足す</button>"
      + "</div>"
      + '<p class="hint">ログインして いれば **アカウントに 同期**します。'
      + "端末を 変えても そのまま 出ます。</p>"
      + "</div>";
    return h;
  }

  function つなぐ() {
    root.addEventListener("click", function (e) {
      var el = e.target && e.target.closest ? e.target.closest("[data-a]") : null;
      if (!el) return;
      var a = el.getAttribute("data-a");
      e.preventDefault();
      if (a === "close") { 閉じる(); return; }
      if (a === "help") {
        try { if (window.__vqHelp) { window.__vqHelp.open({ id: "calendar-basic" }); return; } } catch (eH) {}
        return;
      }
      if (a === "prev") { st.月--; if (st.月 < 0) { st.月 = 11; st.年--; } st.前 = ""; 描く(); 塗る(); return; }
      if (a === "next") { st.月++; if (st.月 > 11) { st.月 = 0; st.年++; } st.前 = ""; 描く(); 塗る(); return; }
      if (a === "today") {
        var n = new Date();
        st.年 = n.getFullYear(); st.月 = n.getMonth(); st.選 = 今日(); st.前 = "";
        描く(); 塗る(); return;
      }
      if (a === "day") { st.選 = el.getAttribute("data-d") || st.選; 描く(); 塗る(); return; }
      if (a === "kind") { st.種 = el.getAttribute("data-v") || "plan"; 描く(); 塗る(); return; }
      if (a === "del") { 消す(el.getAttribute("data-id")); 描く(); 塗る(); return; }
      if (a === "add") {
        var t = root.getElementById ? root.getElementById("cal-t") : null;
        var n2 = root.getElementById ? root.getElementById("cal-n") : null;
        var 題 = t ? String(t.value || "").trim() : "";
        if (!題) { if (t) t.focus(); return; }
        入れる({ id: 新しいid(), date: st.選, kind: st.種, title: 題,
                 note: n2 ? String(n2.value || "").trim() : "", deletedAt: 0 });
        if (t) t.value = ""; if (n2) n2.value = "";
        st.前 = "";
        描く(); 塗る();
        return;
      }
    });
    doc.addEventListener("keydown", function (e) {
      if (!st.開) return;
      if (e.key === "Escape") { e.preventDefault(); 閉じる(); }
    }, true);
  }

  /* ── 外へ ────────────────────────────────────────────────── */
  /* ══ ★ 端末の カレンダーへ 持ち出す（.ics）════════════════════════
     2026-09-01。予定は この アプリの 中だけに あっても 半分しか 役に 立たない。
     iPhone / Android / Google カレンダーが そのまま 読める 形（iCalendar）で
     書き出す。**終わった 記録は 出さない**（予定では ない ので）。 */
  function ics日(d) { return String(d || "").replace(/-/g, ""); }
  function ics逃す(s2) {
    return String(s2 || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;")
      .replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  }
  function ics() {
    var 並 = 全部().filter(生きて).filter(function (x) { return x.kind !== "log"; });
    var 行 = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//VocabuQuiz//Calendar//JA",
              "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:VocabuQuiz"];
    var 印 = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    並.forEach(function (x) {
      var d = ics日(x.date);
      if (!/^\d{8}$/.test(d)) return;
      /* 次の 日を 出す（終日の 予定は 終わりを 翌日に する 決まり）。 */
      var t = new Date(Number(d.slice(0, 4)), Number(d.slice(4, 6)) - 1, Number(d.slice(6, 8)) + 1);
      var 翌 = t.getFullYear() + ("0" + (t.getMonth() + 1)).slice(-2) + ("0" + t.getDate()).slice(-2);
      行.push("BEGIN:VEVENT",
        "UID:" + x.id + "@vocabuquiz",
        "DTSTAMP:" + 印,
        "DTSTART;VALUE=DATE:" + d,
        "DTEND;VALUE=DATE:" + 翌,
        "SUMMARY:" + ics逃す((種(x.kind).名) + "：" + (x.title || "")),
        x.note ? "DESCRIPTION:" + ics逃す(x.note) : "DESCRIPTION:",
        "END:VEVENT");
    });
    行.push("END:VCALENDAR");
    /* iCalendar は **CRLF** で 折り返す 決まり（LF だけだと 読めない 端末が ある）。 */
    return 行.join("\r\n") + "\r\n";
  }
  function 書き出す() {
    var 文 = ics();
    var 件 = (文.match(/BEGIN:VEVENT/g) || []).length;
    if (!件) return { ok: false, 件: 0, 訳: "書き出す 予定が ありません（記録は 出しません）。" };
    try {
      var b = new Blob([文], { type: "text/calendar;charset=utf-8" });
      var u = URL.createObjectURL(b);
      var a2 = doc.createElement("a");
      a2.href = u;
      a2.download = "vocabuquiz-" + 今日() + ".ics";
      doc.body.appendChild(a2); a2.click();
      setTimeout(function () { try { a2.remove(); URL.revokeObjectURL(u); } catch (e) {} }, 400);
      return { ok: true, 件: 件 };
    } catch (e) { return { ok: false, 件: 件, 訳: String((e && e.message) || e).slice(0, 80) }; }
  }

  window.__vqCalendar = {
    open: 開く, close: 閉じる,
    ics: ics, 書き出す: 書き出す,
    /* ホームの 「試験カレンダー」が 読む。**試験と 課題だけ**（記録は 出さない）。 */
    予定: function (n) {
      var 今 = 今日();
      return 全部().filter(生きて)
        .filter(function (x) { return (x.kind === "exam" || x.kind === "task") && x.date >= 今; })
        .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; })
        .slice(0, Math.max(1, n || 5));
    },
    全部: function () { return 全部().filter(生きて); },
    足す: 入れる, 消す: 消す, 取る: 取る, 送る: 送る,
    種類: 種類.slice()
  };

  /* 起動して 少ししてから 1 回だけ 取りに 行く（起動を 重くしない）。 */
  setTimeout(function () { 取る(function () {}); }, 4000);
})();
