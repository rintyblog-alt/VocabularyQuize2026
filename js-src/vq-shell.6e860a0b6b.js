
/* ══════════════════════════════════════════════════════════════════════════
   VocabuQuiz — New Left Sidebar (UI Studio 準拠 / 既存へ競合せず並行差し替え)
   ・Shadow DOM の隔離レイヤー #vqShell に新サイドバーを描画（既存 CSS 戦争と非干渉）。
   ・旧 #appTabBar と同じ枠（--app-v2-sidebar-* 変数）を使うのでコンテンツは非崩れ。
   ・ナビ/アクションは "旧サイドバー内の対応ボタンを .click()" して既存ロジックへブリッジ
     （認証オーバーレイと同じ DOM ブリッジ方式。クロージャ内関数へ確実に到達）。
   ・氏名/アバター/学年/Qredit/通知数は 旧サイドバー要素を鏡写し（アプリが更新し続ける）。
   ・デスクトップ幅(≥880px)でのみ 旧サイドバーを visibility:hidden にして本UIを表示。
     モバイルは一切触らない（Phase1 はデスクトップのサイドバーのみ）。
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  if (window.__vqShellInstalled) return;
  window.__vqShellInstalled = true;

  var P = 'fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"';
  var ICON = {
    home: '<path d="M3 9.6 12 3l9 6.6"/><path d="M5 9v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9"/><path d="M9.5 21v-6h5v6"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.6"/><rect x="14" y="3" width="7" height="7" rx="1.6"/><rect x="3" y="14" width="7" height="7" rx="1.6"/><rect x="14" y="14" width="7" height="7" rx="1.6"/>',
    message: '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.2A8.5 8.5 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5Z"/>',
    news: '<path d="M4 5h13a1 1 0 0 1 1 1v12a2 2 0 0 0 2 2H5a2 2 0 0 1-2-2V6a1 1 0 0 1 1-1Z"/><path d="M18 9h1a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2"/><path d="M7 9h7M7 13h7M7 17h4"/>',
    trend: '<path d="M3 17 9 11l4 4 8-8"/><path d="M16 7h5v5"/>',
    shield: '<path d="M12 3 5 6v5.5c0 4 3 6.9 7 8.5 4-1.6 7-4.5 7-8.5V6l-7-3Z"/><path d="m9.2 12 1.9 1.9L15 10"/>',
    zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
    bell: '<path d="M6 8.5a6 6 0 0 1 12 0c0 6.5 2.5 7.5 2.5 7.5h-17S6 15 6 8.5Z"/><path d="M10.2 20a1.9 1.9 0 0 0 3.6 0"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2.4"/><path d="m3.5 7 8.5 6 8.5-6"/>',
    coins: '<ellipse cx="8.5" cy="7" rx="5.5" ry="3"/><path d="M3 7v5c0 1.7 2.5 3 5.5 3s5.5-1.3 5.5-3V7"/><path d="M14 10.7c1.7.2 3.5 1 3.5 2.8 0 1.7-2.5 3-5.5 3-.9 0-1.7-.1-2.4-.3"/>',
    crown: '<path d="m3 7 4 3.5L12 4l5 6.5L21 7l-1.7 12.5H4.7L3 7Z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    menu: '<path d="M3.5 7h17M3.5 12h17M3.5 17h17"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
    timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2"/><path d="M9 2h6"/>'
  };
  function svg(name) { return '<svg viewBox="0 0 24 24" ' + P + '>' + (ICON[name] || '') + '</svg>'; }

  /* 旧サイドバー内の対応要素を click（既存の delegated ハンドラへ委譲） */
  /* スマホの引き出しを閉じる。本体の開閉関数は外へ出ていないので、
     本体のトグルを押して閉じる（aria や inert の後始末も本体に任せる）。 */
  function closeDrawer() {
    if (!document.body.classList.contains("app-v2-sidebar-open")) return;
    var t = document.getElementById("appV2SidebarToggle");
    if (t) { try { t.click(); return; } catch (e) {} }
    document.body.classList.remove("app-v2-sidebar-open", "app-v2-sidebar-lock");
  }

  function bridge(kind, val) {
    var sel = kind === "tab" ? '#appTabBar [data-app-tab="' + val + '"]'
      : kind === "action" ? '#appTabBar [data-v2-action="' + val + '"]'
      : val; /* sel */
    var el = document.querySelector(sel);
    if (el) { el.click(); return true; }
    return false;
  }

  /* ══ 左パネルの中身は **機能フラグから描く**（2026-08-18・段D）════════
     ★ もとはここに配列を直書きしていた。直書きだと
       「障害のとき即座に機能を落とす」も「β バッジを付ける」も
       **出し直し（デプロイ）が要る**。それでは間に合わない。
     ★ いまは /api/flags/effective が返した表で描く。
       並び順・名前・アイコン・バッジ・注意書きも、ぜんぶ管理画面から変える。
     ★ 下の SEED は **通信できなかったときの最後の受け皿**。
       ここが無いと、電波が悪いだけで左パネルが空になる（＝全機能へ行けない）。
       中身はサーバが最初に入れる種と同じもの。 */
  var SEED = [
    { key: "home", label: "ホーム", icon: "home", path: "tab:home", section: "main", order: 10 },
    { key: "preset", label: "プリセット", icon: "grid", path: "tab:library", section: "main", order: 20 },
    { key: "feed", label: "Feed", icon: "message", path: "tab:inbox", section: "main", order: 30 },
    { key: "dm", label: "DM", icon: "mail", path: "fn:dm", section: "main", order: 35 },
    { key: "news", label: "NEWS", icon: "news", path: "tab:news", section: "main", order: 40 },
    { key: "insights", label: "Insights", icon: "trend", path: "tab:insight", section: "main", order: 50 },
    { key: "survival", label: "VocabuSurvival", icon: "shield", path: "tab:survival3", section: "main", order: 60 },
    { key: "timer", label: "タイマー", icon: "timer", path: "fn:timer", section: "tools", order: 10 },
    { key: "quick_chat", label: "Quick Chat", icon: "zap", path: "tab:chat", section: "tools", order: 20 },
    { key: "notifications", label: "通知", icon: "bell", path: "tab:notifications", section: "tools", order: 30 },
    { key: "qredit", label: "Qredit", icon: "coins", path: "tab:qredit", section: "tools", order: 40 },
    { key: "subscription", label: "Subscription", icon: "crown", path: "tab:subscription", section: "tools", order: 50 },
    { key: "profile", label: "プロフィール", icon: "user", path: "action:open-profile", section: "foot", order: 10 },
    { key: "settings", label: "設定", icon: "gear", path: "fn:settings", section: "foot", order: 20 }
  ].map(function (x) { x.on = true; x.sidebar = true; x.badge = ""; x.notice = ""; x.state = "on"; return x; });

  var FLAGS = null;
  function readCachedFlags() {
    try {
      var s = localStorage.getItem("vq.flags.v1");
      var a = s ? JSON.parse(s) : null;
      if (Array.isArray(a) && a.length) return a;
    } catch (e) {}
    return null;
  }
  function flagList() { return FLAGS || readCachedFlags() || SEED; }
  function flagOf(key) {
    var a = flagList();
    for (var i = 0; i < a.length; i++) if (a[i].key === key) return a[i];
    return null;
  }
  /* フラグ 1 件 → 左パネルの項目 1 件。path の書き方は "tab:library" のように
     「種類:行き先」。種類を見て、既存の仕組みへ渡す先を決める。 */
  function flagToItem(f) {
    var p = String(f.path || "");
    var kind = p.indexOf(":") >= 0 ? p.slice(0, p.indexOf(":")) : "";
    var val = p.indexOf(":") >= 0 ? p.slice(p.indexOf(":") + 1) : "";
    var it = { label: f.label || f.key, icon: f.icon || "grid", badge: f.badge || "", key: f.key };
    if (kind === "tab") it.tab = val;
    else if (kind === "action") it.action = val;
    else if (kind === "fn") it.fn = val;
    else return null;                       /* feature: は画面に出さないもの */
    if (f.key === "notifications") it.notify = true;
    /* DM は 未読の数を 自分で 入れる（vq-dm が 知らせてくる）。 */
    if (f.key === "dm") it.dm = true;
    if (f.key === "qredit" || f.key === "subscription") it.launchLocked = true;
    return it;
  }
  /* ★ 「サイドパネルに出す」を入れたのに **出ない**、が起きた（2026-08-18・実測）。
     区画が hidden のままだと、どの並びにも入らず黙って消える。
     黙って消えるのがいちばん悪いので、出すと言われたものは main へ入れる。 */
  function 区画(f) {
    var sec = f.section || "main";
    return (sec === "hidden" || !sec) ? "main" : sec;
  }
  function navSection(sec) {
    return flagList()
      .filter(function (f) { return f.sidebar && f.on && 区画(f) === sec; })
      .sort(function (a, b) { return (a.order || 0) - (b.order || 0); })
      .map(flagToItem)
      .filter(Boolean);
  }
  function NAV_MAIN() { return navSection("main"); }
  function NAV_TOOLS() { return navSection("tools"); }
  function NAV_FOOT() { return navSection("foot"); }
  /* ══ 公開前の錠（Qredit / Subscription）══════════════════════════════
     公開日までは灰色にして押せなくしておく。押せる形で置いておくと、
     押しても何も起きない画面へ入ってしまうため（消すと「どこへ行った」になる）。

     いまは **作りかけを実際に触って確かめる期間**なので、既定は開けてある。
     公開前に戻すときは NAV_LAUNCH_LOCK_DEFAULT を true にするだけでよい。
     1 回かぎり錠を掛けて確かめたいときは、localStorage の
       vq.nav.launchLock = "1"（掛ける） / "0"（外す）
     が既定より優先される（検証 vqnavoff.cjs はこれを使う）。 */
  var NAV_LAUNCH_LOCK_DEFAULT = false;
  var NAV_LAUNCH_NOTE = "8月22日 launch";
  function navLaunchLocked() {
    try {
      var v = localStorage.getItem("vq.nav.launchLock");
      if (v === "1") return true;
      if (v === "0") return false;
    } catch (e) {}
    return NAV_LAUNCH_LOCK_DEFAULT;
  }
  /* ★ 旧: NAV_TOOLS / NAV_FOOT の直書き。**機能フラグへ移した**（2026-08-18・段D）。
     タイマーは画面を切り替えず重ねて開く（fn:timer）。その振り分けは
     flagToItem が path の "fn:" / "tab:" / "action:" を見て決める。 */

  function itemHTML(n) {
    var attr = n.tab ? 'data-tab="' + n.tab + '"' : n.action ? 'data-action="' + n.action + '"' : 'data-fn="' + n.fn + '"';
    var badge = n.notify ? '<span class="vqs-badge" data-notify></span>'
      : n.dm ? '<span class="vqs-badge" data-vq-dm-badge></span>' : '';
    var off = n.off || (n.launchLocked && navLaunchLocked());
    var note = n.note || (n.launchLocked ? NAV_LAUNCH_NOTE : "");
    /* 押せない項目は、見た目でも入力でも押せなくする（どちらか片方だと通ってしまう）。 */
    if (off) {
      return '<button class="vqs-item is-off" ' + attr + ' disabled aria-disabled="true" tabindex="-1"'
        + ' title="' + (note ? note + " から使えます" : "いまは使えません") + '">' + svg(n.icon)
        + '<span class="vqs-item__l">' + n.label + "</span>"
        + (note ? '<span class="vqs-item__n">' + note + "</span>" : "")
        + "</button>";
    }
    /* ★ β / NEW の札は **管理画面から付ける**（feature_flags.badge）。 */
    var mark = n.badge ? '<span class="vqs-item__n">' + n.badge + "</span>" : "";
    return '<button class="vqs-item" ' + attr + ' data-flag="' + (n.key || "") + '">'
      + svg(n.icon) + '<span class="vqs-item__l">' + n.label + '</span>' + mark + badge + '</button>';
  }

  /* ══ フラグを取りに行く。**30 秒以内に効く**（段D の必須要件）════════
     取れたら控えておく。次に開いたときの一瞬の空白をなくすため。 */
  function fetchFlags() {
    return fetch("/api/flags/effective", { credentials: "same-origin" })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.ok || !Array.isArray(j.flags) || !j.flags.length) return false;
        var before = JSON.stringify(FLAGS || []);
        FLAGS = j.flags;
        try { localStorage.setItem("vq.flags.v1", JSON.stringify(j.flags)); } catch (e) {}
        return before !== JSON.stringify(FLAGS);
      })
      .catch(function () { return false; });
  }
  function repaintNav() {
    var host = document.getElementById("vqShell");
    var sr = host && host.shadowRoot;
    if (!sr) return;
    var map = { main: NAV_MAIN, tools: NAV_TOOLS, foot: NAV_FOOT };
    Object.keys(map).forEach(function (k) {
      var box = sr.querySelector('[data-nav="' + k + '"]');
      if (box) box.innerHTML = map[k]().map(itemHTML).join("");
    });
  }
  /* ★ off にした機能は **URL 直打ちでも入れない**。
     画面の切り替えは何通りもあるので、入口を 1 つずつ塞ぐのではなく
     「いまどのタブにいるか」を見張って、駄目なら押し戻す。 */
  var TAB_FLAG = null;
  function tabFlagMap() {
    if (TAB_FLAG) return TAB_FLAG;
    TAB_FLAG = {};
    flagList().forEach(function (f) {
      var p = String(f.path || "");
      if (p.indexOf("tab:") === 0) TAB_FLAG[p.slice(4)] = f.key;
    });
    return TAB_FLAG;
  }
  function guardTab() {
    var tab = document.body && document.body.getAttribute("data-app-tab");
    if (!tab) return;
    var key = tabFlagMap()[tab];
    if (!key) return;
    var f = flagOf(key);
    if (!f || f.on) return;
    /* 押し戻す。何も言わずに戻すと「壊れた」と思われるので、理由を出す。 */
    try {
      var el = document.querySelector('#appTabBar [data-app-tab="home"]');
      if (el) el.click();
    } catch (e) {}
    try {
      if (window.VQ2 && window.VQ2.toast) window.VQ2.toast(f.notice || "この機能はいまご利用いただけません。");
      else if (window.__vqToast) window.__vqToast(f.notice || "この機能はいまご利用いただけません。");
    } catch (e2) {}
  }
  function startFlagWatch() {
    /* ★ 30 秒以内に効かせる（段D の必須要件）。
       ここの間隔だけを見てはいけない。**サーバの持ち回しと足し算になる。**
       20 秒 + 20 秒 = 最悪 40 秒で、実測で「on に戻しても 32 秒では戻らない」
       が出た。サーバを 8 秒、ここを 15 秒にして、最悪 23 秒にした。 */
    var 見る = function () {
      return fetchFlags().then(function (changed) {
        if (changed) { TAB_FLAG = null; repaintNav(); }
        guardTab();
      });
    };
    fetchFlags().then(function () { TAB_FLAG = null; repaintNav(); guardTab(); });
    setInterval(見る, 15000);
    /* 画面へ戻ってきたときは待たずに見に行く（いちばん気付いてほしい瞬間） */
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) 見る();
    });
    try {
      new MutationObserver(guardTab).observe(document.body, { attributes: true, attributeFilter: ["data-app-tab"] });
    } catch (e) {}
  }

  var CSS =
    "*{box-sizing:border-box;margin:0;padding:0;}" +
    ".wrap{display:flex;flex-direction:column;height:100%;padding:calc(14px + env(safe-area-inset-top,0px)) 12px calc(12px + env(safe-area-inset-bottom,0px));" +
      "font-family:Inter,'Hiragino Sans','Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif;color:var(--vq-text,#454151);}" +
    ".brand{display:flex;align-items:center;gap:10px;padding:6px 6px 12px;}" +
    ".brand__logo{width:32px;height:32px;border-radius:calc(9px * var(--vq-r-scale,1));flex:0 0 auto;display:grid;place-items:center;background:var(--vq-accent,#756DB3);color:var(--vq-accent-contrast,#fff);font-weight:800;font-size:12px;letter-spacing:.02em;}" +
    ".brand__name{font-weight:750;font-size:15px;color:var(--vq-text,#2B2836);}" +
    ".create{display:flex;align-items:center;justify-content:center;gap:7px;height:40px;margin:0 2px 10px;border:0;border-radius:calc(12px * var(--vq-r-scale,1));" +
      "background:var(--vq-accent,#756DB3);color:var(--vq-accent-contrast,#fff);font-weight:650;font-size:13.5px;cursor:pointer;font-family:inherit;box-shadow:0 2px 8px rgba(117,109,179,.30);transition:filter .12s,transform .12s;}" +
    ".create:hover{filter:brightness(1.07);}.create:active{transform:scale(.98);}.create svg{width:17px;height:17px;}" +
    ".find{display:flex;align-items:center;gap:8px;height:36px;margin:0 2px 10px;padding:0 10px;border:1px solid var(--vq-border-subtle,#EFEDF5);border-radius:calc(11px * var(--vq-r-scale,1));" +
      "background:var(--vq-bg-canvas,#F7F6FB);color:var(--vq-text-tertiary,#8A85A0);font-family:inherit;font-size:13px;font-weight:550;cursor:pointer;text-align:left;transition:background .12s,border-color .12s;}" +
    ".find:hover{background:var(--vq-surface-active,#F1EEF8);border-color:var(--vq-border,#E6E2F0);}" +
    ".find svg{width:16px;height:16px;flex:0 0 auto;}" +
    ".find .t{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
    ".find .k{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;height:19px;padding:0 6px;border-radius:calc(6px * var(--vq-r-scale,1));" +
      "border:1px solid var(--vq-border,#E6E2F0);background:var(--vq-surface,#fff);color:var(--vq-text-tertiary,#8A85A0);font-size:10.5px;font-weight:700;line-height:1;}" +
    /* ⌘K はPCのみ有効。モバイル(ドロワー)ではショートカット表示を出さない */
    "@media (max-width:879px){.find .k{display:none;}}" +
    ".scroll{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;margin:0 -4px;padding:0 4px;}" +
    ".nav{display:flex;flex-direction:column;gap:2px;}" +
    ".section{margin:12px 8px 4px;font-size:11px;font-weight:750;letter-spacing:.06em;color:var(--vq-text-tertiary,#9994A8);text-transform:uppercase;}" +
    ".vqs-item{display:flex;align-items:center;gap:11px;width:100%;padding:9px 10px;border:0;background:none;border-radius:calc(11px * var(--vq-r-scale,1));cursor:pointer;text-align:left;" +
      "font-family:inherit;font-size:13.5px;font-weight:550;color:var(--vq-text-secondary,#686477);transition:background .12s,color .12s;}" +
    ".vqs-item:hover{background:var(--vq-accent-subtle,#F4F1FA);color:var(--vq-text,#2B2836);}" +
    ".vqs-item.is-active{background:var(--vq-accent-subtle,#EFEBFA);color:var(--vq-accent-text,#5F579E);font-weight:700;}" +
    ".vqs-item svg{width:19px;height:19px;flex:0 0 auto;}" +
    ".vqs-item__l{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
    ".vqs-badge{margin-left:auto;min-width:18px;height:18px;padding:0 5px;border-radius:calc(9px * var(--vq-r-scale,1));background:var(--vq-danger-strong,#E5484D);color:#fff;font-size:11px;font-weight:700;display:none;align-items:center;justify-content:center;}" +
    ".vqs-badge.on{display:flex;}" +
    ".foot{margin-top:auto;padding-top:10px;border-top:1px solid var(--vq-border-subtle,#EFEDF5);display:flex;flex-direction:column;gap:2px;}" +
    ".user{display:flex;align-items:center;gap:10px;padding:8px;border-radius:calc(12px * var(--vq-r-scale,1));cursor:pointer;border:0;background:none;font-family:inherit;text-align:left;width:100%;}" +
    ".user:hover{background:var(--vq-accent-subtle,#F4F1FA);}" +
    ".avatar{width:34px;height:34px;border-radius:50%;flex:0 0 auto;background:var(--vq-accent-subtle,#EDE9FB);color:var(--vq-accent-text,#5F579E);display:grid;place-items:center;font-weight:700;font-size:13px;overflow:hidden;}" +
    ".avatar img{width:100%;height:100%;object-fit:cover;display:block;}" +
    ".user__col{min-width:0;display:flex;flex-direction:column;}" +
    ".user__name{font-size:13px;font-weight:650;color:var(--vq-text,#2B2836);display:flex;align-items:center;gap:3px;min-width:0;}" +
    /* 公式マークは 縮ませない。字だけ 詰める（印が 潰れると 別の絵に 見える）。 */
    ".user__name .nm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;}" +
    ".user__name svg.vqbadge{flex:0 0 auto;width:15px;height:15px;}" +
    ".user__name .app-verified-badge{flex:0 0 auto;display:inline-flex;width:15px;height:15px;color:#1d9bf0;}" +
    ".user__name .app-verified-badge .ms{font-family:'Material Symbols Rounded';font-size:15px;line-height:1;font-variation-settings:'FILL' 1;}" +
    ".user__meta{font-size:11.5px;color:var(--vq-text-tertiary,#9994A8);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}" +
    ".qredit{display:flex;align-items:center;gap:8px;margin:4px 2px 0;padding:9px 12px;border-radius:calc(12px * var(--vq-r-scale,1));background:var(--vq-bg-canvas,#F7F6FB);border:1px solid var(--vq-border-subtle,#EFEDF5);cursor:pointer;font-family:inherit;font-weight:700;color:var(--vq-accent-text,#5F579E);font-size:13px;}" +
    ".vqs-item.is-off{color:var(--vq-text-disabled,#BBB7C5);cursor:default;pointer-events:none;}" +
    /* いつから使えるか。灰色の中でも読める濃さにする。 */
    ".vqs-item__n{flex:0 0 auto;font-size:10.5px;font-weight:700;letter-spacing:.01em;" +
      "color:var(--vq-accent-hover,#8078A8);background:var(--vq-surface-active,#F1EEF8);border-radius:999px;padding:2px 7px;white-space:nowrap;}" +
    ".vqs-item.is-off svg{color:var(--vq-text-disabled,#CFCBD9);opacity:.85;}" +
    ".vqs-item.is-off:hover{background:transparent;}" +
    ".qredit:hover{background:var(--vq-surface-active,#F1EEF8);}.qredit svg{width:16px;height:16px;color:var(--vq-warning-text,#C79A00);flex:0 0 auto;}.qredit .g{margin-left:auto;color:var(--vq-text-tertiary,#9994A8);font-weight:600;font-size:11px;}";

  function build() {
    if (!document.body) { document.addEventListener("DOMContentLoaded", build); return; }
    if (document.getElementById("vqShell")) return;

    var oldBar = document.getElementById("appTabBar");
    if (!oldBar) { setTimeout(build, 400); return; }   // 静的HTMLだが未挿入なら再試行

    /* 旧サイドバーの"枠"(位置/幅/角丸/影)はそのまま活かし、中身だけ差し替える。
       #vqShell を #appTabBar の子として inset:0 で敷き、旧来の直接子は非表示に（幅システムに追従＝非崩れ）。 */
    var ls = document.createElement("style"); ls.id = "vqShellHostStyle";
    /* PC=左サイドバー枠 / モバイル=同じ #appTabBar がオフキャンバス・ドロワー(body.app-v2-sidebar-open)。
       どちらも枠の中身を新シェルに置き換える（＝モバイルの左パネルも新しい方になる）。 */
    ls.textContent =
      "#vqShell{position:absolute;inset:0;z-index:2;overflow:hidden;background:var(--vq-surface,#fff);border-radius:inherit;display:none;}" +
      "body[data-ui-v2=\"1\"] #vqShell{display:block;}" +
      "body[data-ui-v2=\"1\"] #appTabBar>*:not(#vqShell){display:none !important;}";
    document.head.appendChild(ls);

    var host = document.createElement("div"); host.id = "vqShell";
    var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    var st = document.createElement("style"); st.textContent = CSS; root.appendChild(st);

    var wrap = document.createElement("div"); wrap.className = "wrap";
    wrap.innerHTML =
      '<div class="brand"><span class="brand__logo">VQ</span><span class="brand__name">VocabuQuiz</span></div>' +
      '<button class="create" data-action="create-quiz">' + svg("plus") + 'クイズを作成</button>' +
      '<button class="find" data-fn="cmdk" aria-label="検索・コマンドパレットを開く">' + svg("search") +
        '<span class="t">検索</span><span class="k">⌘K</span></button>' +
      '<div class="scroll">' +
        '<div class="nav" data-nav="main">' + NAV_MAIN().map(itemHTML).join("") + '</div>' +
        '<div class="section">ツール</div>' +
        '<div class="nav" data-nav="tools">' + NAV_TOOLS().map(itemHTML).join("") + '</div>' +
      '</div>' +
      '<div class="foot">' +
        '<div class="nav" data-nav="foot">' + NAV_FOOT().map(itemHTML).join("") + '</div>' +
        '<button class="user" data-action="open-profile"><span class="avatar" data-avatar>VQ</span>' +
          '<span class="user__col"><span class="user__name" data-name>ユーザー</span><span class="user__meta" data-meta>—</span></span></button>' +
        '<button class="qredit" data-sel="#appV2QreditChip">' + svg("coins") + '<span data-qredit>0</span><span class="g">Qredit</span></button>' +
      '</div>';
    root.appendChild(wrap);
    oldBar.appendChild(host);   // 旧サイドバーの枠内に敷く（inset:0）

    /* クリック → ブリッジ */
    root.addEventListener("click", function (e) {
      var el = e.target;
      while (el && el !== root && !(el.dataset && (el.dataset.tab || el.dataset.action || el.dataset.sel || el.dataset.fn))) el = el.parentNode;
      if (!el || el === root) return;
      if (el.dataset.fn === "settings") { if (window.__vqOpenSettings) window.__vqOpenSettings(); }
      else if (el.dataset.fn === "timer") {
        closeDrawer();
        try { if (window.VQ2 && window.VQ2.timerUi) window.VQ2.timerUi.open(); } catch (e) {}
      }
      else if (el.dataset.fn === "cmdk") { if (window.__vqCmdk) window.__vqCmdk.open(); }
      else if (el.dataset.fn === "dm") { closeDrawer(); if (window.__vqOpenDM) window.__vqOpenDM(); }
      else if (el.dataset.tab) bridge("tab", el.dataset.tab);
      else if (el.dataset.action) bridge("action", el.dataset.action);
      else if (el.dataset.sel) bridge("sel", el.dataset.sel);
      /* Learning Workspace の入口は、はじめて開いたときだけ案内を出す。 */
      try {
        var lbl = (el.textContent || "").trim();
        if (window.__vqTour) {
          if (lbl.indexOf("プリセットを作る") === 0) setTimeout(function () { window.__vqTour.show("presetmake"); }, 700);
          else if (lbl.indexOf("Quick Mock") === 0) setTimeout(function () { window.__vqTour.show("mock"); }, 700);
        }
      } catch (eT) {}
      /* スマホでは この一覧は「引き出し」。何かを選んだら必ず閉じる。
         行き先は開いているのに引き出しが residual に残る、をなくす。
         閉じるのは押し終えたあと（先に閉じると #appTabBar が inert になり、
         そこへブリッジしたクリックが届かなくなる）。 */
      setTimeout(closeDrawer, 0);
    });

    /* アクティブ状態を body[data-app-tab] から同期 */
    function syncActive() {
      var cur = document.body.getAttribute("data-app-tab") || "home";
      var items = root.querySelectorAll(".vqs-item[data-tab]");
      for (var i = 0; i < items.length; i++) items[i].classList.toggle("is-active", items[i].getAttribute("data-tab") === cur);
    }

    /* 氏名/アバター/学年/Qredit/通知 を旧要素から鏡写し */
    var elName = root.querySelector("[data-name]"), elMeta = root.querySelector("[data-meta]"),
      elAva = root.querySelector("[data-avatar]"), elQ = root.querySelector("[data-qredit]"),
      elNotify = root.querySelector('.vqs-item[data-tab="notifications"] [data-notify]');
    function txt(id) { var e = document.getElementById(id); return e ? (e.textContent || "").trim() : ""; }
    function esc(s) {
      return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }
    /* ★ 名前は **印ごと** 写す（2026-08-27・訴え）。
       もとは textContent だけを 見ていたので、
       ① 公式マーク（名前の 左の SVG）が 消える
       ② 旧マークは <span class="ms">verified</span> なので 字だけ 残り、
          「りんとverified」に なる
       の 2 つが 起きていた。名前は .app-name-text、印は svg.vqbadge か
       .app-verified-badge。この 2 つだけ 選んで 写す（余計なものは 持ち込まない）。 */
    function 名前を写す(id) {
      var e = document.getElementById(id);
      if (!e) return { html: "", text: "" };
      var t = e.querySelector(".app-name-text") || e;
      var 字 = (t.textContent || "").trim();
      var b = e.querySelector("svg.vqbadge") || e.querySelector(".app-verified-badge");
      var 印 = b ? b.outerHTML : "";
      return { html: 印 + '<span class="nm">' + esc(字) + "</span>", text: 字 };
    }
    function syncIdentity() {
      var 名 = 名前を写す("appV2SidebarName");
      var n = 名.text;
      if (n) elName.innerHTML = 名.html;
      var m = txt("appV2SidebarMeta"); if (m) elMeta.textContent = m;
      var q = txt("appV2QreditValue"); if (q) elQ.textContent = q.replace(/^[^\d]+/, "") || q;
      var src = document.getElementById("appV2SidebarAvatar");
      if (src) {
        var img = src.tagName === "IMG" ? src : src.querySelector("img");
        var url = img && img.getAttribute("src");
        /* 背景で 敷いている 書きかたのときも 拾う */
        if (!url && src.style && src.style.backgroundImage && src.style.backgroundImage !== "none") {
          var mm = /url\((["']?)(.*?)\1\)/.exec(src.style.backgroundImage);
          if (mm) url = mm[2];
        }
        if (url) { elAva.innerHTML = '<img src="' + esc(url) + '" alt="">'; }
        else { var ini = (n || "V").trim().charAt(0).toUpperCase(); if (ini) elAva.textContent = ini; }
      }
      var nc = txt("appSidebarNotifyCount"); var num = parseInt(nc, 10);
      if (elNotify) { if (num > 0) { elNotify.textContent = num > 99 ? "99+" : String(num); elNotify.classList.add("on"); } else elNotify.classList.remove("on"); }
      /* DM の 未読。vq-dm が 数えて 教えてくる（旧サイドバーには 元が 無い）。 */
      var elDm = root.querySelector("[data-vq-dm-badge]");
      if (elDm) {
        var dn = Number(window.__vqDmUnread || 0);
        if (dn > 0) { elDm.textContent = dn > 99 ? "99+" : String(dn); elDm.classList.add("on"); }
        else elDm.classList.remove("on");
      }
    }
    try { window.addEventListener("vq-dm-unread", syncIdentity); } catch (eDm) {}

    syncActive(); syncIdentity();
    try {
      new MutationObserver(syncActive).observe(document.body, { attributes: true, attributeFilter: ["data-app-tab"] });
      var idTargets = ["appV2SidebarName", "appV2SidebarMeta", "appV2SidebarAvatar", "appV2QreditValue", "appSidebarNotifyCount"];
      var mo = new MutationObserver(syncIdentity);
      idTargets.forEach(function (id) { var e = document.getElementById(id); if (e) mo.observe(e, { childList: true, characterData: true, subtree: true, attributes: true }); });
    } catch (e) {}
    /* ★ 20 秒で 見回りを 打ち切っていた（2026-08-27 まで）。
       プロフィールは ログインの あと サーバから 届くので、回線が 細いと
       間に合わず、アイコンが **初期のまま 残る**。あとから 変えたときも 同じ。
       本体が 書き換えたら 知らせてくれる（vq-identity-changed）ので、
       それを 受ける。見回りは 立ち上がりの 保険として 20 秒だけ 残す。 */
    try { window.addEventListener("vq-identity-changed", syncIdentity); } catch (eI) {}
    var poll = setInterval(syncIdentity, 1500); setTimeout(function () { clearInterval(poll); }, 20000);

    buildTopbar(syncIdentity);
  }

  /* ══ モバイル用トップバー（Gmail風ピル: ハンバーガー / 検索 / アバター） ══
     ・<880px でのみ表示。アプリ純正 #topbar(高さ56px・z44) を覆って置き換える。
     ・ハンバーガー → #appV2SidebarToggle をクリック = 既存の開閉ロジックで
       #appTabBar ドロワーが開く。その中身は #vqShell なので「新しい左パネル」。
     ・アバター → プロフィール画面へ（[data-v2-action="open-profile"]）。
     ・検索 → コマンドパレット（#vqCmdk）を開く。モバイルは ⌘K が押せないためここが唯一の導線。 */
  var TB_CSS =
    "*{box-sizing:border-box;margin:0;padding:0;}" +
    ":host{font-family:Inter,'Hiragino Sans','Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif;}" +
    /* ホスト背景は無し。この丸いピルだけが浮く（下のコンテンツが素通しで見える） */
    ".bar{display:flex;align-items:center;gap:6px;height:46px;width:100%;padding:0 6px 0 4px;border-radius:999px;overflow:hidden;" +
      "background:var(--vq-border-subtle,#E7E5F4);pointer-events:auto;box-shadow:0 2px 14px rgba(24,22,34,.10),0 0 0 1px rgba(24,22,34,.03);" +
      "transition:width .26s cubic-bezier(.22,1,.36,1),padding .26s cubic-bezier(.22,1,.36,1);}" +
    /* 下スクロール時: ピルが左の丸いハンバーガーだけに縮む（三本線は常に押せる） */
    ":host(.vqtb-hide) .bar{width:46px;padding:0 2px;}" +
    ":host(.vqtb-hide) .q,:host(.vqtb-hide) .ava{opacity:0;pointer-events:none;}" +
    /* ホーム / ライブラリ以外の画面。三本線だけを丸く置く。
       スクロールで縮む .vqtb-hide と同じ形だが、こちらは常時。 */
    ":host(.vqtb-only) .bar{width:46px;padding:0 2px;}" +
    ":host(.vqtb-only) .q,:host(.vqtb-only) .ava{opacity:0;pointer-events:none;visibility:hidden;}" +
    "@media (prefers-reduced-motion:reduce){.bar,.q,.ava{transition:none;}}" +
    ".ico{width:42px;height:42px;flex:0 0 auto;border:0;background:none;border-radius:50%;cursor:pointer;" +
      "display:grid;place-items:center;color:var(--vq-text-secondary,#5A5568);-webkit-tap-highlight-color:transparent;}" +
    ".ico:active{background:rgba(117,109,179,.14);}" +
    ".ico svg{width:22px;height:22px;}" +
    ".q{flex:1 1 auto;min-width:0;height:100%;border:0;outline:0;background:none;font-family:inherit;" +
      "font-size:15px;color:var(--vq-text,#2B2836);padding:0 2px;cursor:pointer;transition:opacity .16s ease;}" +
    ".q::placeholder{color:var(--vq-text-secondary,#6C6880);}" +
    ".ava{width:34px;height:34px;flex:0 0 auto;margin-right:2px;border:0;padding:0;border-radius:50%;cursor:pointer;overflow:hidden;" +
      "background:var(--vq-accent-subtle,#EDE9FB);color:var(--vq-accent-text,#5F579E);display:grid;place-items:center;font-weight:700;font-size:13px;font-family:inherit;" +
      "box-shadow:0 0 0 2px #fff;-webkit-tap-highlight-color:transparent;transition:opacity .16s ease;}" +
    ".ava img{width:100%;height:100%;object-fit:cover;display:block;}";

  function buildTopbar(syncIdentity) {
    if (document.getElementById("vqTopbar")) return;
    var st = document.createElement("style"); st.id = "vqTopbarHostStyle";
    st.textContent =
      /* 背景なし＝ピルだけが浮く。下スクロールでは"バーごと消す"のではなく
         ピルが左の丸いハンバーガーに縮む（＝左パネルへの導線は常に残る）。
         縮小アニメーションは Shadow 内の :host(.vqtb-hide) 側で定義。 */
      "#vqTopbar{position:fixed;top:0;left:0;right:0;z-index:900;display:none;pointer-events:none;" +
        /* 上の安全領域も差し替えられるようにする。実機でしか値が入らないため、
           ここが env() 直書きのままだと、手元の検証で上の形が再現できない。 */
        "padding:calc(var(--vq-safe-top, env(safe-area-inset-top,0px)) + 6px) 10px 6px;background:transparent;}" +
      /* 新ピルが出るのは新UIの画面（ホーム / プリセット）だけ。
         旧上部バー #topbar はモバイルでは全画面で廃止（display:none）。
         消えた分は上に詰める: レイアウト変数 --app-v2-topbar-h を 0 に上書き
         （本体JSが inline 非important で 56px を書くので、こちらの !important が勝つ）。
         ノッチ対策は --app-safe-top が別途 --app-v2-top-offset に足されるので維持される。 */
      "@media (max-width:879px){" +
        /* どの画面からでも左パネルへ戻れるように、全タブで出す。
           ホーム / ライブラリ以外は三本線だけにする（検索とアバターは出さない）。
           → JS が host へ .vqtb-only を付け、Shadow 側の :host(.vqtb-only) が縮める。 */
        "body[data-ui-v2=\"1\"] #vqTopbar{display:block;}" +
        /* 三本線だけのときは浮いたボタンが本文の左上に重なる。
           その画面自身の見出しや検索欄を隠さないよう、中身を下げる。 */
        /* 外側の main にだけ乗せる。.stage にも同じものを乗せていたため
           58px が二重にかかり、上に 116px の空白ができていた。 */
        "body[data-ui-v2=\"1\"].vqtb-only-on main{padding-top:calc(env(safe-area-inset-top,0px) + 54px) !important;}" +
        "body[data-ui-v2=\"1\"].vqtb-only-on .stage{padding-top:0 !important;}" +
        "body[data-ui-v2=\"1\"] #topbar{display:none !important;}" +
        "body[data-ui-v2=\"1\"]{--app-v2-topbar-h:0px !important;}" +
        /* 純正 topbar を出す画面でも "旧ハンバーガー" は出さない。
           本体JSが inline !important で display/width を焼くため display では消せない →
           position:absolute で流れから抜き、visibility/opacity/pointer-events で無効化。
           visibility:hidden の要素も .click() は効くので新ピルからのブリッジは生存。 */
        "body[data-ui-v2=\"1\"] #appV2SidebarToggle{position:absolute !important;visibility:hidden !important;" +
          "opacity:0 !important;pointer-events:none !important;z-index:-1 !important;}}";
    document.head.appendChild(st);

    var host = document.createElement("div"); host.id = "vqTopbar";
    var r = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    var s = document.createElement("style"); s.textContent = TB_CSS; r.appendChild(s);
    var bar = document.createElement("div"); bar.className = "bar";
    bar.innerHTML =
      '<button class="ico" data-tb="menu" aria-label="メニューを開く">' + svg("menu") + '</button>' +
      '<input class="q" data-tb-q type="text" placeholder="クイズ・ページを検索" aria-label="検索（コマンドパレットを開く）" readonly>' +
      '<button class="ava" data-tb="profile" aria-label="プロフィールを開く"><span data-tb-ava>VQ</span></button>';
    r.appendChild(bar);
    document.body.appendChild(host);

    var input = r.querySelector("[data-tb-q]");
    /* モバイルは ⌘K が押せないので、この検索欄がコマンドパレットへの導線。
       readonly にして端末キーボードは出さず、タップでパレット（自前の入力欄を持つ）を開く。 */
    function openPalette() {
      try { input.blur(); } catch (e) {}
      if (window.__vqCmdk) window.__vqCmdk.open();
      else if (window.__vqPresetSearch) window.__vqPresetSearch("");
    }
    r.addEventListener("click", function (e) {
      var el = e.target; while (el && el !== r && !(el.dataset && (el.dataset.tb || el.dataset.tbQ != null))) el = el.parentNode;
      if (!el || el === r) return;
      if (el.dataset.tbQ != null) { openPalette(); return; }
      var k = el.dataset.tb;
      if (k === "menu") { var t = document.getElementById("appV2SidebarToggle"); if (t) t.click(); }
      else if (k === "profile") { bridge("action", "open-profile"); }
    });
    input.addEventListener("focus", openPalette);

    /* アバターは新シェルの鏡写し結果を流用（同じ元要素を見る） */
    var av = r.querySelector("[data-tb-ava]");
    function syncAva() {
      var src = document.getElementById("appV2SidebarAvatar");
      var nm = document.getElementById("appV2SidebarName");
      var img = src ? (src.tagName === "IMG" ? src : src.querySelector("img")) : null;
      var url = img && img.getAttribute("src");
      if (!url && src && src.style && src.style.backgroundImage && src.style.backgroundImage !== "none") {
        var mm = /url\((["']?)(.*?)\1\)/.exec(src.style.backgroundImage);
        if (mm) url = mm[2];
      }
      /* ★ もとは av.parentNode.innerHTML へ 書いていた（2026-08-27 まで）。
         これは **av 自身を 消す**。1 度 絵を 入れた あとは av が 宙に浮き、
         そのあとの 書き換えが どこにも 届かなくなっていた
         （＝ アイコンを 変えても 変わらない／初期のまま）。
         av は 残したまま、その 中身だけ 入れ替える。 */
      if (url) {
        var cur = av.firstElementChild;
        if (!cur || cur.tagName !== "IMG") { av.textContent = ""; cur = document.createElement("img"); cur.alt = ""; av.appendChild(cur); }
        if (cur.getAttribute("src") !== url) cur.setAttribute("src", url);
      } else {
        /* 名前の 字は .app-name-text（印の 字を 拾わないように） */
        var t = nm ? ((nm.querySelector(".app-name-text") || nm).textContent || "").trim() : "";
        av.textContent = (t ? t.charAt(0) : "V").toUpperCase();
      }
    }
    autoHide(host);

    syncAva();
    try { window.addEventListener("vq-identity-changed", syncAva); } catch (eI2) {}
    try {
      var mo = new MutationObserver(syncAva);
      ["appV2SidebarAvatar", "appV2SidebarName"].forEach(function (id) {
        var e = document.getElementById(id); if (e) mo.observe(e, { childList: true, characterData: true, subtree: true, attributes: true });
      });
    } catch (e) {}
    var p = setInterval(syncAva, 1500); setTimeout(function () { clearInterval(p); }, 20000);
  }

  /* ══ トップバーの自動隠し（下スクロール=隠れる / 上スクロール=戻る） ══
     新UIは #vqScreens の Shadow 内 .scroll がスクロール主体で、アプリ純正画面は
     window / main が主体。両方を監視して同じ状態機械に流し込む。
     しきい値を設けて指の微動では反応させない。上端付近・ドロワー/パレット表示中は常に表示。 */
  function autoHide(host) {
    var HIDE_AFTER = 64;    /* これより浅い位置では隠さない */
    var DELTA = 8;          /* 反応する最小移動量（指の微動を無視） */
    var last = null, hidden = false, src = "";

    function show() { if (hidden) { hidden = false; host.classList.remove("vqtb-hide"); } }
    function hide() { if (!hidden) { hidden = true; host.classList.add("vqtb-hide"); } }

    /* ホーム / ライブラリ以外は、検索とアバターを出さず三本線だけにする。
       どの画面にいても左パネルへ戻れる導線を 1 つ残すのが目的で、
       その画面の道具を上に増やしたいわけではない。 */
    var FULL_TABS = { home: 1, library: 1 };
    function syncOnly() {
      var t = document.body.getAttribute("data-app-tab") || "home";
      var only = !FULL_TABS[t];
      host.classList.toggle("vqtb-only", only);
      /* 本文を下げるための印。CSS からは Shadow の中を見られないので body へ出す。 */
      document.body.classList.toggle("vqtb-only-on", only);
    }
    syncOnly();
    new MutationObserver(syncOnly)
      .observe(document.body, { attributes: true, attributeFilter: ["data-app-tab"] });

    /* いま実際に動いているスクローラを毎回選び直して読む。
       ・新UI(home/presets) → #vqScreens の Shadow 内 .scroll
       ・アプリ純正画面     → main / window / documentElement
       イベント配線ではなくポーリングにしているのは、iOS の慣性スクロールや
       Shadow DOM 内のスクロールでイベントが安定して届かないケースがあるため。 */
    function reader() {
      var s = document.getElementById("vqScreens");
      var sc = s && s.shadowRoot ? s.shadowRoot.querySelector(".scroll") : null;
      if (sc && document.body.classList.contains("vqscr-on") && sc.scrollHeight > sc.clientHeight + 4)
        return { k: "scr", y: sc.scrollTop };
      var m = document.querySelector("main");
      if (m && m.scrollHeight > m.clientHeight + 4 && m.scrollTop > 0) return { k: "main", y: m.scrollTop };
      return { k: "win", y: window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0 };
    }

    function tick() {
      var r = reader(), y = Math.max(0, r.y);
      if (r.k !== src) { src = r.k; last = y; return; }   /* スクローラが変わったら基準を取り直す */
      if (last === null) { last = y; return; }
      var d = y - last;
      if (Math.abs(d) < DELTA) return;
      last = y;
      /* 展開中のUIがある間はバーを出したままにする */
      if (document.body.classList.contains("app-v2-sidebar-open") ||
          document.body.classList.contains("vqcmdk-open") ||
          document.body.classList.contains("vqset-open")) { show(); return; }
      if (y <= HIDE_AFTER) { show(); return; }
      d > 0 ? hide() : show();
    }

    /* ══ 70ms ごとの見張りを やめた（2026-08-19）══════════════════════════
       訴え「学校の Surface は 重すぎて Chrome ごと固まる」。
       プロファイルを取ったら、**この 42KB のファイルが CPU の 28.6%（6.3 秒）**
       を食っていた。犯人は ここ。

       tick() は 中で scrollHeight / clientHeight を読む。これは
       **その場でレイアウトを計算し直させる**操作で、7,000 要素あるこの画面では
       1 回が重い。それを 1 秒に 14 回 やっていた。
       速い機械では 目立たないが、非力な機械では 1 回の計算が 何十 ms にもなり、
       そのまま 主スレッドが 埋まる＝固まる。

       スクロールは もともと イベントで拾っている（下の 3 行）。
       定期の見張りは 保険なので、14 回/秒 は要らない。1 回/秒 で十分。
       さらに 同じ 1 コマの中で 何度も呼ばれても 1 回にまとめる。 */
    var 予約 = 0;
    function まとめて() {
      if (予約) return;
      予約 = requestAnimationFrame(function () { 予約 = 0; tick(); });
    }
    setInterval(まとめて, 1000);
    window.addEventListener("scroll", まとめて, { passive: true });
    document.addEventListener("scroll", まとめて, { passive: true, capture: true });
    document.addEventListener("touchmove", まとめて, { passive: true });

    /* タブを切り替えたら必ず戻す（class は本体が高頻度で触るので監視対象にしない） */
    try {
      new MutationObserver(function () { last = null; show(); })
        .observe(document.body, { attributes: true, attributeFilter: ["data-app-tab"] });
    } catch (e) {}
  }

  build();
  /* ★ 左パネルは 1 度描いて終わりにしない（2026-08-18・段D）。
     管理画面でフラグを変えたら、出し直しなしでここへ届く。 */
  if (document.body) startFlagWatch();
  else document.addEventListener("DOMContentLoaded", startFlagWatch);
})();

