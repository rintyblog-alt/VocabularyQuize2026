
/* ══════════════════════════════════════════════════════════════════════════
   VocabuQuiz — New Screens (Home / Presets) 覆いオーバーレイ方式（競合ゼロ）
   ・#vqScreens が「内容エリア」を覆う固定オーバーレイ（Shadow DOM・UI Studio調）。
   ・body[data-app-tab] を監視: home→Home画面 / library→Presets画面 / それ以外→非表示。
     既存の #viewTitle / #appLibraryPage は"覆うだけ"で一切触らない＝絶対に競合しない。
   ・サイドバーは従来どおり _appSetTab へブリッジ（本ファイルは shell を変更しない）。
   ・Home の数値は既存要素(#appV2Stat* 等・裏で更新継続)を鏡写し。モード等は既存ボタンへ .click()。
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  if (window.__vqScreensInstalled) return;
  window.__vqScreensInstalled = true;

  var P = 'fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"';
  var ICON = {
    play: '<path d="M7 4.5v15l12-7.5-12-7.5Z"/>', coins: '<ellipse cx="8.5" cy="7" rx="5.5" ry="3"/><path d="M3 7v5c0 1.7 2.5 3 5.5 3s5.5-1.3 5.5-3V7"/><path d="M14 10.7c1.7.2 3.5 1 3.5 2.8 0 1.7-2.5 3-5.5 3"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5V5.5Z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20"/>',
    swap: '<path d="M7 4 3 8l4 4"/><path d="M3 8h13a4 4 0 0 1 4 4"/><path d="m17 20 4-4-4-4"/><path d="M21 16H8a4 4 0 0 1-4-4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>', flame: '<path d="M12 3s5 4 5 9a5 5 0 0 1-10 0c0-1.5.6-2.7 1.3-3.6C9 10 9.5 11 10 11.5 10 9 12 6 12 3Z"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4"/>', alert: '<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 10v4M12 17.5h.01"/>',
    exam: '<rect x="4.5" y="3.5" width="15" height="17" rx="2.5"/><path d="m8.5 12 2 2 4-4"/><path d="M9 3.5h6v2H9z"/>',
    turn: '<path d="M4 8h12a3 3 0 0 1 3 3M20 16H8a3 3 0 0 1-3-3"/><path d="m16 4 4 4-4 4M8 20l-4-4 4-4"/>',
    shuffle: '<path d="M17 4h4v4M21 4l-7 7M4 20l6-6M17 20h4v-4M14 10l7-7M4 4l5 5"/>', pen: '<path d="M16 4l4 4L8 20l-5 1 1-5L16 4Z"/><path d="M13.5 6.5 17.5 10.5"/>',
    columns: '<rect x="3.5" y="4.5" width="7" height="15" rx="1.6"/><rect x="13.5" y="4.5" width="7" height="15" rx="1.6"/>', arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', sliders: '<path d="M4 6h11M18 6h2M4 12h5M12 12h8M4 18h11M18 18h2"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="16" cy="18" r="2"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.6"/><rect x="14" y="3" width="7" height="7" rx="1.6"/><rect x="3" y="14" width="7" height="7" rx="1.6"/><rect x="14" y="14" width="7" height="7" rx="1.6"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>', star: '<path d="m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6L3.4 9.3l6-.7L12 3Z"/>', sparkle: '<path d="M12 3l1.8 4.8L18.6 9.6 13.8 11.4 12 16.2 10.2 11.4 5.4 9.6 10.2 7.8 12 3Z"/>',
    trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4.5v1.5A3.5 3.5 0 0 0 8 11M17 6h2.5v1.5A3.5 3.5 0 0 1 16 11"/><path d="M12 14v3M9 20h6M10.5 17h3"/>',
    up: '<path d="M3 17 10 10l4 4 7-7"/><path d="M15 7h6v6"/>', down: '<path d="M3 7 10 14l4-4 7 7"/><path d="M15 17h6v-6"/>',
    cal: '<rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    rotate: '<path d="M4 12a8 8 0 1 1 2.5 5.8"/><path d="M4 19v-5h5"/>', zap: '<path d="M13 3 5 13.5h6L11 21l8-10.5h-6L13 3Z"/>',
    /* 公式サイトへの導線（2026-08-18） */
    site: '<circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="10.5" opacity=".45"/>',
    out: '<path d="M14 5h5v5"/><path d="M19 5l-8 8"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
    /* 横に すべる 棚の 矢印（2026-09-01） */
    left: '<path d="M15 5l-7 7 7 7"/>', right: '<path d="M9 5l7 7-7 7"/>',
    news: '<path d="M4 5h13v14H4z"/><path d="M17 9h3v8a2 2 0 0 1-3 1.7"/><path d="M7 9h7M7 13h7M7 16h4"/>'
  };
  function svg(n, cls) { return '<svg viewBox="0 0 24 24" ' + P + (cls ? ' class="' + cls + '"' : '') + '>' + (ICON[n] || '') + '</svg>'; }
  function click(id) { var e = document.getElementById(id); if (e) e.click(); }
  function homeAction(a) { var e = document.querySelector('#viewTitle [data-home-action="' + a + '"]'); if (e) e.click(); }

  /* ══ HOME 実データエンジン ══
     全学習指標の唯一の源 = localStorage "wordPractice.analytics.sessions.v1"。
     1件 = { ts, date:"YYYY-MM-DD", presetId, presetName, mode:"CHOICE"|"HAND",
             total, correct, accuracy, durationMs, wrongIds[] }
     （※アプリ側は CHOICE/HAND のみ記録する仕様。TURN/RANDOM は元々記録されない）
     ここから 今日の学習時間 / 連続日数 / 今週の回答数・正答率とその先週比 /
     7日間の学習時間 / 苦手プリセット / 最近のプリセット を全て実値で算出する。 */
  var SESS_KEY = "wordPractice.analytics.sessions.v1";
  var RESUME_KEY = "app.home.resume.v1";
  var GOALS_KEY = "vq_slash_goals";
  var DAY = 86400000;
  /* ══ ★ **2 つの 置き場を 両方 読む**（2026-09-01・訴え）════════════════
     訴え「ホームの 今日の 学習、連続学習、今週の 問題数、週間正答数が
           機能して いない 気が する」

     数え方は 正しい（記録を 1 行 入れると 4 つ とも 動く。実測）。
     問題は **どこに 書かれて いるか**。
       ・古い クイズ  … wordPractice.analytics.sessions.v1
       ・いまの クイズ（V2）… vq2.learn.sessions.v1
         V2 は 終わる ときに 古い ほうへ 写す（mirrorLegacy）が、
         **写す前に 落ちる／写さない 道**が あると ホームだけ 0 のままに なる。
     ★ 片方だけを 正に して 直すと、また 別の 道で 0 に なる。
       **両方 読んで、id で 重なりを 落とす。** これなら どちらに 書かれても 出る。 */
  var V2_SESS_KEY = "vq2.learn.sessions.v1";
  function readSessions() {
    var 出 = [];
    var 見た = Object.create(null);
    var 足す = function (r) {
      if (!r || typeof r !== "object") return;
      if (r.deletedAt) return;
      var id = String(r.id || "");
      /* V2 を 写した 行は id が "vq2:<V2のid>"。同じ ものを 二度 数えない。 */
      var 素 = id.indexOf("vq2:") === 0 ? id.slice(4) : id;
      if (素 && 見た[素]) return;
      if (素) 見た[素] = 1;
      出.push(r);
    };
    /* ① 古い ほう（写した ぶんも ここに ある）。**先に** 入れる。 */
    try {
      var a = JSON.parse(localStorage.getItem(SESS_KEY) || "[]");
      if (Array.isArray(a)) a.forEach(足す);
    } catch (e) {}
    /* ② いまの ほう。写されて いない ぶんだけ 拾う（形を そろえる）。 */
    try {
      var b = JSON.parse(localStorage.getItem(V2_SESS_KEY) || "[]");
      if (Array.isArray(b)) b.forEach(function (v) {
        if (!v || typeof v !== "object") return;
        var t = num(v.completedAt) || num(v.updatedAt) || num(v.createdAt) || 0;
        if (!t) return;
        足す({
          id: String(v.id || ""),
          ts: t,
          date: String(v.localDate || ""),
          presetId: String(v.presetId || v.sourceId || ""),
          presetName: String(v.title || ""),
          mode: v.mode === "mock" ? "MOCK" : "CHOICE",
          total: num(v.questionCount),
          correct: num(v.correctCount),
          accuracy: num(v.accuracy),
          durationMs: v.activeDurationSeconds != null
            ? num(v.activeDurationSeconds) * 1000
            : num(v.durationSeconds) * 1000,
          wrongIds: []
        });
      });
    } catch (e) {}
    return 出;
  }
  function readResume() {
    try { var o = JSON.parse(localStorage.getItem(RESUME_KEY) || "null"); return (o && typeof o === "object") ? o : null; } catch (e) { return null; }
  }
  function readGoals() {
    try { var a = JSON.parse(localStorage.getItem(GOALS_KEY) || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  }
  function dayStart(t) { var d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function relTime(ts) {
    var d = Date.now() - num(ts); if (!ts) return "";
    if (d < 60000) return "たった今";
    if (d < 3600000) return Math.floor(d / 60000) + "分前";
    if (d < DAY) return Math.floor(d / 3600000) + "時間前";
    return Math.floor(d / DAY) + "日前";
  }
  function fmtMin(ms) {
    var m = Math.round(num(ms) / 60000);
    if (m < 60) return m + "分";
    return Math.floor(m / 60) + "時間" + (m % 60 ? (m % 60) + "分" : "");
  }
  /* セッション群 → ホームに必要な全指標 */
  function computeMetrics() {
    var ss = readSessions();
    var today0 = dayStart(Date.now());
    var week0 = today0 - 6 * DAY;          /* 今日を含む7日 */
    var prev0 = week0 - 7 * DAY;
    var m = {
      todayMs: 0, todayAnswers: 0, todaySessions: 0,
      weekAnswers: 0, weekCorrect: 0, weekMs: 0, weekSessions: 0,
      prevAnswers: 0, prevCorrect: 0, prevMs: 0,
      days: [], streak: 0, lastTs: 0, byPreset: {}, hasData: false
    };
    var i, s, t, dayMap = {};
    for (i = 0; i < ss.length; i++) {
      s = ss[i]; if (!s) continue;
      t = num(s.ts); if (!t) continue;
      m.hasData = true;
      if (t > m.lastTs) m.lastTs = t;
      var d0 = dayStart(t), tot = num(s.total), cor = num(s.correct), ms = num(s.durationMs);
      if (d0 === today0) { m.todayMs += ms; m.todayAnswers += tot; m.todaySessions++; }
      if (d0 >= week0) { m.weekAnswers += tot; m.weekCorrect += cor; m.weekMs += ms; m.weekSessions++; }
      else if (d0 >= prev0) { m.prevAnswers += tot; m.prevCorrect += cor; m.prevMs += ms; }
      dayMap[d0] = (dayMap[d0] || 0) + ms;
      var pid = String(s.presetId || ""); if (!pid) continue;
      var p = m.byPreset[pid] || (m.byPreset[pid] = { id: pid, name: String(s.presetName || ""), total: 0, correct: 0, lastTs: 0 });
      p.total += tot; p.correct += cor;
      if (s.presetName) p.name = String(s.presetName);
      if (t > p.lastTs) p.lastTs = t;
    }
    /* 7日間の学習時間（分・曜日ラベル） */
    var wd = ["日", "月", "火", "水", "木", "金", "土"];
    for (i = 6; i >= 0; i--) {
      var dt = today0 - i * DAY;
      m.days.push({ label: wd[new Date(dt).getDay()], min: Math.round((dayMap[dt] || 0) / 60000) });
    }
    /* 連続日数（今日に記録がなければ昨日起点で数える＝未学習でも継続を保持） */
    var base = dayMap[today0] ? today0 : (dayMap[today0 - DAY] ? today0 - DAY : 0);
    if (base) { var c = 0, k = base; while (dayMap[k]) { c++; k -= DAY; } m.streak = c; }
    m.weekAcc = m.weekAnswers > 0 ? Math.round(m.weekCorrect / m.weekAnswers * 100) : null;
    m.prevAcc = m.prevAnswers > 0 ? Math.round(m.prevCorrect / m.prevAnswers * 100) : null;
    m.accDelta = (m.weekAcc != null && m.prevAcc != null) ? (m.weekAcc - m.prevAcc) : null;
    m.ansDelta = m.prevAnswers > 0 ? Math.round((m.weekAnswers - m.prevAnswers) / m.prevAnswers * 100) : null;
    /* プリセット別 → 苦手(正答率昇順) / 最近(最終利用降順) */
    var list = [];
    for (var key in m.byPreset) if (m.byPreset.hasOwnProperty(key)) list.push(m.byPreset[key]);
    m.weak = list.filter(function (p) { return p.total >= 5; })
      .map(function (p) { p.acc = Math.round(p.correct / p.total * 100); return p; })
      .sort(function (a, b) { return a.acc - b.acc; }).slice(0, 3);
    m.recent = list.slice().sort(function (a, b) { return b.lastTs - a.lastTs; }).slice(0, 3);
    return m;
  }
  /* ── PRESETS(Library) 実データ連携 ──
     アプリの関数はグローバル非公開なので、隠れて描画される #appLibraryPage を
     読み取って実プリセットを取得し、選択/開始は本物の隠しボタンへ .click() で橋渡し。
     **種別（自分 / 公開 / 公式）は本体が付けた data-kind をそのまま使う。**
     名前や作者名から「公式らしい」と推測しない。 */
  var ACTIVE_KEY = "wordPractice400.activePresetId.v1";
  /* 表示のもとになるデータ層。読み込まれる前に描こうとすることがあるので、毎回引く。 */
  function LIB() { try { return (window.VQ2 && window.VQ2.library) || null; } catch (e) { return null; } }
  function isFav(id) { var L = LIB(); return L ? L.isFavorite(id) : false; }
  /* カードも一緒に渡す。**公開プリセットかどうか**と **持ち主**が分からないと、
     サーバへ送るべきかを決められない（送り先も分からない）。 */
  function toggleFav(id, card) { var L = LIB(); return L ? L.toggleFavorite(id, card) : false; }
  function activeId() { try { var raw = localStorage.getItem(ACTIVE_KEY); if (raw == null) return ""; try { var p = JSON.parse(raw); return typeof p === "string" ? p : String(raw); } catch (e) { return String(raw).replace(/^"|"$/g, ""); } } catch (e) { return ""; } }
  var cssEsc = function (s) { return String(s).replace(/["\\]/g, "\\$&"); };
  function txt(el) { return el ? (el.textContent || "").trim() : ""; }
  function eachEl(list, fn) { for (var i = 0; i < list.length; i++) fn(list[i], i); }

  /* #appLibraryPage の実カードから、出ている情報をそのまま写し取る。
     ここでは何も判断しない（判断は library.js が受け持つ）。 */
  function scrapePresets() {
    var out = [], seen = {};
    var page = document.getElementById("appLibraryPage");
    if (!page) return out;
    var items = page.querySelectorAll(".app-library-item");
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var kind = it.getAttribute("data-kind") || "";
      var actBtn = it.querySelector("[data-lib-action][data-id]");
      var pubBtn = it.querySelector("[data-public-preset-action][data-preset-id]");
      var id = actBtn ? actBtn.getAttribute("data-id") : (pubBtn ? pubBtn.getAttribute("data-preset-id") : "");
      if (!id || seen[id]) continue; seen[id] = 1;
      var title = txt(it.querySelector(".app-library-item-copy .title") || it.querySelector(".title")) || id;
      var subject = txt(it.querySelector(".subject-badge"));
      var metaText = txt(it.querySelector(".app-library-item-meta"));
      var m = metaText.match(/([\d,]+)\s*(語|問)/);
      var count = m ? parseInt(m[1].replace(/,/g, ""), 10) : 0;
      var unit = m ? m[2] : "問";
      /* 公開プリセットのメタ行は、先頭が作者名。 */
      var author = kind === "public" ? txt(it.querySelector(".app-library-item-meta span")) : "";
      var icoEl = it.querySelector(".app-preset-card-icon");
      var iconName = txt(icoEl ? icoEl.querySelector(".ms") : null);
      var iconColor = "";
      try { iconColor = icoEl && icoEl.style ? (icoEl.style.background || "") : ""; } catch (e) {}
      var tags = [], saveCount = null;
      eachEl(it.querySelectorAll(".app-library-state-badge.is-tag"), function (b) {
        var t = txt(b), sm = t.match(/^保存\s*([\d,]+)$/);
        if (sm) { saveCount = parseInt(sm[1].replace(/,/g, ""), 10); return; }
        if (t) tags.push(t);
      });
      var acts = [];
      eachEl(it.querySelectorAll("[data-lib-action]"), function (b) { acts.push(b.getAttribute("data-lib-action")); });
      eachEl(it.querySelectorAll("[data-public-preset-action]"), function (b) { acts.push(b.getAttribute("data-public-preset-action")); });
      /* 数は data-* から読む。バッジの文字から拾うのは「保存」しか無く、
         表示数とお気に入り数は文字としてはどこにも出ていなかった。 */
      var numAttr = function (name) {
        var v = it.getAttribute(name);
        if (v === null || v === "") return null;
        var n = parseInt(v, 10);
        return isFinite(n) ? n : null;
      };
      var viewCount = numAttr("data-view-count");
      var favCount = numAttr("data-fav-count");
      var saveAttr = numAttr("data-save-count");
      if (saveAttr !== null) saveCount = saveAttr;
      out.push({
        id: id, kind: kind, title: title, subject: subject, count: count, unit: unit,
        author: author, iconName: iconName, iconColor: iconColor, tags: tags, saveCount: saveCount,
        viewCount: viewCount, favoriteCount: favCount, forkCount: numAttr("data-fork-count"),
        isPublic: !!it.querySelector(".app-library-state-badge.is-public"),
        updatedLabel: txt(it.querySelector(".app-library-item-updated")),
        actions: acts
      });
    }
    return out;
  }

  /* 本物の隠しライブラリボタンへ橋渡し（委譲リスナーが #appLibraryPage 内クリックを処理）。
     自作・収録・配信は data-lib-action、公開プリセットは data-public-preset-action。 */
  function libClick(id, actions) {
    var page = document.getElementById("appLibraryPage");
    if (!page) return false;
    for (var i = 0; i < actions.length; i++) {
      var b = page.querySelector('[data-lib-action="' + actions[i] + '"][data-id="' + cssEsc(id) + '"]')
           || page.querySelector('[data-public-preset-action="' + actions[i] + '"][data-preset-id="' + cssEsc(id) + '"]');
      if (b) { b.click(); return true; }
    }
    return false;
  }
  var LIB_ACTIONS = {
    open:      ["useOfficial", "useBuiltin", "useCustom", "openPreset"],
    start:     ["startOfficialExam", "startBuiltinExam", "startCustomExam", "startExam"],
    write:     ["startOfficialWrite", "startBuiltinWrite", "startCustomWrite"],
    edit:      ["editCustom"],
    remove:    ["deleteCustom"],
    publish:   ["publishCustom"],
    unpublish: ["unpublishCustom"],
    share:     ["shareCustom"],
    fork:      ["fork"],
    profile:   ["openProfile"]
  };
  function presetAction(id, key) { return libClick(id, LIB_ACTIONS[key] || []); }
  function presetSelect(id) { return presetAction(id, "open"); }
  function presetStart(id) { return presetAction(id, "start"); }
  /* その操作が本当にできるか（本体にボタンがあるか）を見る。無い操作は出さない。 */
  function canDo(card, key) {
    var want = LIB_ACTIONS[key] || [], have = (card && card.actions) || [];
    for (var i = 0; i < want.length; i++) if (have.indexOf(want[i]) >= 0) return true;
    return false;
  }

  /* いま画面に出しているカード。詳細画面などから引けるように残す。 */
  var cardRows = [];
  function buildCards() {
    var L = LIB();
    if (!L || !L.collectDom) return [];
    var 並 = [];
    try { 並 = L.collectDom(scrapePresets()) || []; } catch (e) { return []; }

    /* ══ ★★ 画面から 拾ったものに、**本物のデータ**を 重ねる（2026-08-19）
       訴え「公開プリセット・公式プリセットが 全部 4 択ではなく 短答に なっている」。

       一覧は collectDom（**画面に 並んでいる 札から 拾う**）で 作っている。
       画面の札には 問題の 中身が 無いので、
         ・問題の内訳（4 択か 短答か）
         ・生データ（詳細を 開くときに 要る）
       が 付かない。実測: 20 件のうち 内訳が 付いていたのは **3 件だけ**。
       だから 詳細は「短答」と 出していた。**中身は 4 択のままだった。**

       collect() は 本物（自分の保存・公開・公式）を 集めるので、
       そちらに 在るものは id で 突き合わせて 重ねる。
       ★ 画面の並び（順番・何が 入っているか）は collectDom のまま。
         足りないものだけ 補う。並びを 入れ替えると 別の不具合になる。 */
    try {
      var 本物 = (L.collect ? L.collect() : []) || [];
      if (本物.length) {
        var 索引 = Object.create(null), 名索引 = Object.create(null);
        本物.forEach(function (x) {
          if (x && x.id) 索引[String(x.id)] = x;
          var t = String(x && x.title || "").trim();
          if (t && !名索引[t]) 名索引[t] = x;
        });
        並.forEach(function (c) {
          var 元 = 索引[String(c.id)] || 名索引[String(c.title || "").trim()];
          if (!元) return;
          if (!c.questionTypeCounts && 元.questionTypeCounts) c.questionTypeCounts = 元.questionTypeCounts;
          if (!c.raw && 元.raw) c.raw = 元.raw;
          if (!c.questionCount && 元.questionCount) c.questionCount = 元.questionCount;
          if (!c.estimatedMinutes && 元.estimatedMinutes) c.estimatedMinutes = 元.estimatedMinutes;
        });
      }
    } catch (e) {}
    /* ★ 試験を 一覧へ 混ぜる（2026-08-30）───────────────────────
       訴え「CBT に ならない。試験モードに ならない」。
       真因の 半分は ここ。一覧の 札は **本体の プリセット一覧の DOM から
       拾って**作っている（collectDom）。試験は VQ2.store.mocks に あって
       プリセット一覧には 出ないので、**一覧に 1 枚も 並んでいなかった**。
       表紙の 縮小見本（試験の表紙HTML）も、押す先が 無いので 一度も 出ていない。
       ここで 試験を 札の 形に して 足す。器を preset へ 寄せる 段に なったら
       この 関数だけ 消せばよい。 */
    try { 並 = 試験の札(並).concat(並); } catch (e) {}
    return 並;
  }

  /* 試験を「一覧の 札」の 形に する。
     ★ 中身を 作り直さない。並べ替え・絞り込み・検索が 読む 分だけ 埋める。
     ★ 同じ id が すでに 並んでいるなら 足さない（二重に 出さない）。 */
  function 試験の札(すでに) {
    var ST = window.VQ2 && window.VQ2.store;
    if (!ST || !ST.listExams) return [];
    var 済 = Object.create(null);
    (すでに || []).forEach(function (c) { if (c && c.id) 済[String(c.id)] = 1; });
    var 私 = "";
    try { 私 = String(ST.currentOwnerId ? ST.currentOwnerId() : ""); } catch (e) {}
    var 出 = [];
    (ST.listExams() || []).forEach(function (rec) {
      var sp = ST.examOf(rec);
      if (!sp || !sp.sections || !sp.sections.length) return;
      var id = String(rec.id || sp.id || "");
      if (!id || 済[id]) return;
      var 問 = 0, 内訳 = {};
      sp.sections.forEach(function (sec) {
        (sec.questions || []).forEach(function (q) {
          問++;
          var t = String(q && q.type || "");
          if (t) 内訳[t] = (内訳[t] || 0) + 1;
        });
      });
      出.push({
        id: id,
        title: String(sp.title || (sp.cover && sp.cover.examName) || "試験"),
        subject: String(sp.subject || (sp.cover && sp.cover.subject) || ""),
        description: "", tags: [],
        questionCount: 問, countUnit: "問",
        questionTypeCounts: 内訳,
        estimatedMinutes: Number(sp.durationMinutes) || null,
        /* 自分の 持ちもの。公開の 仕組みは まだ 通っていないので 非公開のまま。 */
        visibility: "private",
        isOwnedByCurrentUser: true, isOfficial: false,
        isFavoritedByCurrentUser: false, isSavedByCurrentUser: false,
        ownerName: "", ownerHandle: "",
        createdAt: rec.createdAt || sp.createdAt || null,
        updatedAt: rec.updatedAt || sp.updatedAt || null,
        publishedAt: null, lastPlayedAt: null,
        favoriteCount: 0, viewCount: 0,
        /* 一覧の ボタンは 試験用の ものへ 差し替わるので actions は 使わない。 */
        actions: [], raw: null,
        /* ここが 試験だと 一目で 分かるように 印を 付けておく。 */
        __exam: true
      });
    });
    /* 新しい ものから。 */
    出.sort(function (a, b) {
      return String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""));
    });
    return 出;
  }
  /* ══ クラウドで 作りかけの プリセット ══════════════════════════════
     ★ AI で 作っている 間、これまでは 作成の 画面を 開いたままに して
       おかないと 止まっていた。いまは サーバの 台帳（ai_jobs）で 走り続ける。
       ここは その 台帳を **一覧に うすい 札**として 出す 側。
       中身は まだ 無いので 押しても 開かない。止めることだけ できる。
       端末には 何も 覚えさせていないので、**再読み込みしても 残る**。 */
  function buildingJobs() {
    try {
      var G = window.__vqCloudGen;
      return (G && G.list) ? (G.list() || []) : [];
    } catch (e) { return []; }
  }
  function buildingPct(j) {
    var planned = Math.max(0, Number(j && j.planned) || 0);
    var made = Math.max(0, Number(j && j.made) || 0);
    if (planned > 0) return Math.max(0, Math.min(100, Math.round((made / planned) * 100)));
    var p = Number(j && j.progress) || 0;
    return Math.max(0, Math.min(100, Math.round(p > 1 ? p : p * 100)));
  }
  /* ★ **札は 1 枚に まとめる。**
     1 回の 注文（例: 10 問）は、中で 何回かに 分けて 頼まれるので
     仕事は 2〜3 件に なる。そのまま 並べると「10 問 頼んだのに
     3 つに 割れた」ように 見える。数は 足し合わせて 1 枚で 出す。 */
  function buildingHTML() {
    var jobs = buildingJobs();
    if (!jobs.length) return "";
    var made = 0, planned = 0, stage = "", title = "";
    jobs.forEach(function (j) {
      made += Math.max(0, Number(j.made) || 0);
      planned += Math.max(0, Number(j.planned) || 0);
      if (!stage && j.currentStage) stage = String(j.currentStage);
      if (!title && j.title) title = String(j.title);
    });
    var pct = planned > 0 ? Math.max(0, Math.min(100, Math.round((made / planned) * 100)))
      : buildingPct(jobs[0]);
    var ids = jobs.map(function (j) { return String(j.jobId || ""); }).filter(Boolean).join(",");
    /* ★ 題と アイコンを **その場で** 決める（2026-08-29・訴え
       「生成中の タイトルは 自動作成して。アイコンも 自動で 指定して」）。
       台帳の title は 頼み文の 先頭 120 字 そのままで、札に 出すには 長い。
       決めかたは 画面（preset-studio）と 同じ 関数を 借りる。
       仕上がったら AI が 決めた 名前と アイコンが 勝つ。 */
    var 題 = title, 絵 = "";
    try {
      var P = window.VQ2 && window.VQ2.presetStudio;
      if (P && P.cloudTitle) 題 = P.cloudTitle(title);
      if (P && P.cloudIcon) 絵 = P.cloudIcon(title, "");
    } catch (e) {}
    return '<article class="pc pc--building" aria-busy="true">' +
      '<div class="pc--building__ic">' + ms(絵 || "cloud_upload") +
        '<span class="pc--building__pct">' + pct + "%</span></div>" +
      '<div class="pc--building__b">' +
        '<div class="pc__title">' + esc(題 || "AI で 作成中") + "</div>" +
        '<div class="pc--building__m">クラウドで 作成中' +
          (planned ? " ・ " + made + " / " + planned + " 問" : "") +
          (stage ? " ・ " + esc(stage) : "") + "</div>" +
        '<div class="pc--building__bar"><span style="width:' + pct + '%"></span></div>' +
        '<div class="pc--building__n">この 画面を 閉じても 作り続けます。できたら ここに 並びます。</div>' +
      "</div>" +
      '<button class="pc--building__x" data-cancelgen="' + esc(ids) + '">止める</button>' +
      "</article>";
  }

  function cardById(id) {
    for (var i = 0; i < cardRows.length; i++) if (cardRows[i].id === String(id)) return cardRows[i];
    return null;
  }

  /* コマンドパレット(cmdk.js)・詳細画面から実プリセットを引くための公開 API */
  window.__vqPresets = {
    list: scrapePresets, cards: function () { return cardRows.slice(); }, card: cardById,
    select: presetSelect, start: presetStart, action: presetAction, can: canDo
  };
  /* プリセット画面 UI 状態 */
  var pstate = { tab: "all", subject: null, search: "", view: "grid", sort: "recommended" };

  var CSS =
    "*{box-sizing:border-box;margin:0;padding:0;}" +
    /* hidden は display の指定より弱い。隠すと言ったら必ず隠す。 */
    "[hidden]{display:none !important;}" +
    ":host{display:block;font-family:Inter,'Hiragino Sans','Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif;color:var(--vq-text,#454151);}" +
    ".scroll{height:100%;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;background:var(--vq-bg-canvas,#F7F6FB);}" +
    /* --vqs-pt/--vqs-pb = 上下バー分の内側余白（モバイルのみ非0）
       ★ --vqs-pbc は **中身の 下余白**（2026-09-04）。
         --vqs-pb（＝ 器の 高さ）を 中身にも 使うと、浮いた 島の
         **上にも 下にも 空き**が できる。実測: 中身が 下端から 128px で
         終わり、島は 40〜100px。他の 画面（main）は 20〜24px なので
         島の 下まで 中身が 続き、そこだけ 隙間に 見えて いた
         （訴え「ホーム画面、プリセットだけ 下端に 隙間が できる」）。
         → 中身は **島の 下端**まで 続かせる。--vqs-pb は 下から せり上がる
           シートが 使うので そのまま 残す。 */
    ".wrap{max-width:calc(var(--wrapmax,1120px) * var(--vq-width-scale,1));margin:0 auto;padding:calc(28px + var(--vqs-pt,0px)) 32px calc(64px + var(--vqs-pbc,var(--vqs-pb,0px)));}" +
    /* プリセット一覧だけは広く使う（カードが 4 列並ぶ幅） */
    ".wrap.wide{--wrapmax:1500px;}" +
    "@media (max-width:900px){.wrap{padding:calc(14px + var(--vqs-pt,0px)) 16px var(--vqs-pbc,calc(28px + var(--vqs-pb,0px)));}}" +
    ".screen{display:none;}.screen.on{display:block;}" +
    ".ttl{font-size:15px;font-weight:750;color:var(--vq-text,#2B2836);margin-bottom:14px;}" +
    /* HOME（UI Studio HomeScreen 準拠レイアウト） */
    ".hero{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:20px;}" +
    ".hero__date{font-size:11.5px;color:var(--vq-text-tertiary,#9994A8);font-weight:500;margin-bottom:4px;}" +
    ".hero__title{font-size:25px;line-height:1.4;font-weight:750;letter-spacing:-.015em;color:var(--vq-text,#2B2836);}" +
    /* ── 今日のことわざ（2026-08-19）──────────────────────────────
       ★ 挨拶のすぐ下。読み物なので、字は本文の大きさで、色は控えめに。
       ★ 縦に伸びるので、狭い画面でも折り返して読める形にする。 */
    ".koto{margin-top:10px;max-width:620px;}" +
    ".koto__w{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;}" +
    ".koto__t{font-size:15px;font-weight:700;color:var(--vq-text,#2B2836);letter-spacing:.01em;}" +
    ".koto__tag{font-size:10.5px;font-weight:650;color:var(--vq-accent-text,#5F579E);" +
      "background:var(--vq-accent-subtle,#EAE8F7);border-radius:999px;padding:2px 8px;flex:0 0 auto;}" +
    ".koto__m{font-size:12.5px;line-height:1.8;color:var(--vq-text-secondary,#686477);margin-top:3px;}" +
    ".qpill{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;background:var(--vq-warning-bg,#FAF0DF);color:var(--vq-warning-text,#9C6A1B);font-weight:650;font-size:11.5px;}.qpill svg{width:13px;height:13px;}" +
    ".resume{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:32px;padding:0 13px;border-radius:calc(14px * var(--vq-r-scale,1));border:0;cursor:pointer;font-family:inherit;background:var(--vq-accent,#756DB3);color:var(--vq-accent-contrast,#fff);font-weight:600;font-size:13px;white-space:nowrap;flex:0 0 auto;transition:filter .12s,transform .12s;}.resume:hover{filter:brightness(1.07);}.resume:active{transform:scale(.98);}.resume svg{width:15px;height:15px;}" +
    /* 4 StatCards */
    ".stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px;}" +
    ".stat{background:var(--vq-surface,#fff);border:1px solid var(--vq-border-subtle,#ECEAF4);border-radius:calc(18px * var(--vq-r-scale,1));box-shadow:0 1px 2px rgba(84,72,140,.05);padding:20px;min-width:0;}" +
    ".stat__top{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;}" +
    ".stat__label{font-size:11.5px;font-weight:650;color:var(--vq-text-tertiary,#9994A8);letter-spacing:.03em;}.stat__top svg{width:15px;height:15px;}" +
    ".stat__row{display:flex;align-items:baseline;gap:4px;}" +
    ".stat__val{font-size:25px;font-weight:750;color:var(--vq-text,#2B2836);line-height:1.4;letter-spacing:-.015em;font-variant-numeric:tabular-nums;}" +
    ".stat__unit{font-size:13px;color:var(--vq-text-tertiary,#9994A8);}" +
    ".stat__delta{display:flex;align-items:center;gap:4px;margin-top:6px;font-size:11.5px;font-weight:650;}" +
    ".stat__delta.up{color:var(--vq-success-text,#3E7A56);}.stat__delta.down{color:var(--vq-danger-text,#A94A4A);}.stat__delta.flat{color:var(--vq-text-tertiary,#9994A8);}.stat__delta svg{width:13px;height:13px;}" +
    ".stat__delta em{font-style:normal;color:var(--vq-text-tertiary,#9994A8);font-weight:500;}" +
    /* 2カラム（※ .grid はプリセット画面と衝突するため .hgrid） */
    ".hgrid{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:16px;align-items:start;}" +
    ".hgrid>*{min-width:0;}.col{display:flex;flex-direction:column;gap:16px;min-width:0;}" +
    "@media (max-width:1000px){.hgrid{grid-template-columns:1fr;}}" +
    /* 続きから */
    ".continue{display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:calc(18px * var(--vq-r-scale,1));background:var(--vq-accent-subtle,#EAE8F7);border:1px solid rgba(117,109,179,.20);}" +
    ".continue__ic{display:grid;place-items:center;width:42px;height:42px;border-radius:calc(14px * var(--vq-r-scale,1));background:var(--vq-accent,#756DB3);color:var(--vq-accent-contrast,#fff);flex:0 0 auto;}.continue__ic svg{width:19px;height:19px;}" +
    ".continue__col{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;}" +
    ".continue__t{display:block;font-size:14px;font-weight:600;color:var(--vq-text,#2B2836);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
    ".continue__m{display:block;font-size:11.5px;color:var(--vq-text-secondary,#686477);margin-top:2px;}" +
    /* Alert（AI） */
    ".alert{display:flex;gap:8px;align-items:flex-start;padding:12px 16px;border:1px solid rgba(129,117,189,.28);border-radius:calc(14px * var(--vq-r-scale,1));background:var(--vq-accent-subtle,#EDEAF9);font-size:13px;line-height:1.7;}" +
    ".alert__ic{flex:0 0 auto;margin-top:2px;color:var(--vq-accent-hover,#695CA8);}.alert__ic svg{width:16px;height:16px;}" +
    ".alert__t{font-weight:650;margin-bottom:2px;color:var(--vq-text,#2B2836);}.alert__b{color:var(--vq-text,#454151);}" +
    ".alert__act{margin-top:10px;}" +
    /* Card */
    ".card{background:var(--vq-surface,#fff);border:1px solid var(--vq-border-subtle,#ECEAF4);border-radius:calc(18px * var(--vq-r-scale,1));box-shadow:0 1px 2px rgba(84,72,140,.05);padding:20px;}" +
    ".card--flush{padding:0;}" +
    ".card__head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px;}" +
    ".card__head--pad{padding:20px 20px 12px;margin:0;}" +
    ".card__t{font-size:14.5px;font-weight:650;color:var(--vq-text,#2B2836);}" +
    ".card__t2{font-size:14.5px;font-weight:650;color:var(--vq-text,#2B2836);margin-bottom:12px;}" +
    ".linkbtn{border:0;background:none;color:var(--vq-accent-text,#5F579E);font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;padding:0;}.linkbtn:hover{text-decoration:underline;}" +
    /* 棒グラフ */
    ".chart svg{width:100%;height:auto;display:block;}" +
    /* リスト行 */
    ".lrow{display:flex;align-items:center;gap:12px;padding:12px 20px;border:0;background:none;width:100%;text-align:left;font:inherit;color:inherit;cursor:pointer;transition:background .12s;}" +
    ".lrow:hover{background:var(--vq-surface-hover,#F7F5FC);}" +
    ".lrow__ic{display:grid;place-items:center;width:36px;height:36px;border-radius:calc(14px * var(--vq-r-scale,1));background:var(--vq-accent-subtle,#EAE8F7);color:var(--vq-accent-text,#5F579E);flex:0 0 auto;}.lrow__ic svg{width:16px;height:16px;}" +
    ".lrow__col{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;}" +
    ".lrow__t{display:block;font-size:13.5px;font-weight:600;color:var(--vq-text,#2B2836);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
    ".lrow__d{display:block;font-size:11.5px;color:var(--vq-text-tertiary,#9994A8);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
    ".lrow__go{height:32px;padding:0 13px;border-radius:calc(14px * var(--vq-r-scale,1));border:1px solid var(--vq-border-strong,#D7D2E4);background:var(--vq-surface,#fff);color:var(--vq-text,#454151);font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;flex:0 0 auto;white-space:nowrap;}.lrow__go:hover{background:var(--vq-surface-hover,#F7F5FC);}" +
    ".hr{border:0;border-top:1px solid var(--vq-border-subtle,#ECEAF4);margin:0;}" +
    /* 試験カレンダー行 */
    ".calrow{display:flex;align-items:center;gap:8px;}" +
    ".calrow__d{font-size:13px;font-weight:600;width:44px;flex:0 0 auto;color:var(--vq-text-tertiary,#9994A8);font-variant-numeric:tabular-nums;}" +
    ".calrow__n{flex:1 1 auto;min-width:0;font-size:13px;font-weight:550;color:var(--vq-text,#454151);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
    /* 苦手バー */
    ".hbar+.hbar{margin-top:12px;}" +
    ".hbar__top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:5px;}" +
    ".hbar__l{font-size:13px;font-weight:550;color:var(--vq-text,#454151);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
    ".hbar__v{font-size:13px;font-weight:600;color:var(--vq-text,#2B2836);font-variant-numeric:tabular-nums;flex:0 0 auto;}" +
    ".track{height:6px;border-radius:999px;background:var(--vq-surface-active,#F1EEF8);overflow:hidden;}.track>span{display:block;height:100%;border-radius:999px;background:var(--vq-accent,#756DB3);}" +
    ".track>span.warn{background:var(--vq-warning,#E5A85F);}.track>span.dgr{background:var(--vq-danger,#D67777);}" +
    ".btn2{display:inline-flex;align-items:center;justify-content:center;gap:6px;width:100%;height:32px;padding:0 13px;margin-top:14px;border-radius:calc(14px * var(--vq-r-scale,1));border:1px solid var(--vq-border,#E1DDEE);background:var(--vq-surface-active,#F4F2F9);color:var(--vq-accent-text,#5F579E);font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;}.btn2:hover{background:var(--vq-accent-subtle,#EDE7F8);}.btn2 svg{width:13px;height:13px;}" +
    /* sunken 小カード */
    ".sunk{background:var(--vq-bg-canvas,#F7F6FB);border:1px solid transparent;border-radius:calc(18px * var(--vq-r-scale,1));padding:20px;display:flex;gap:8px;align-items:center;}" +
    /* ★ 公式サイトへの導線（2026-08-18）。カードと同じ見た目にそろえる。
       触れる場所は 44px 以上。文字が長くても枠から出さない。 */
    ".hcard-site{display:flex;align-items:center;gap:12px;text-decoration:none;color:inherit;min-height:64px;" +
      "transition:transform .16s ease-out,border-color .16s ease-out,box-shadow .16s ease-out;}" +
    ".hcard-site:hover{transform:translateY(-2px);border-color:var(--vq-accent,#756DB3);" +
      "box-shadow:0 10px 24px -16px rgba(117,109,179,.65);}" +
    ".hcard-site__mark{flex:0 0 auto;width:38px;height:38px;display:grid;place-items:center;border-radius:12px;" +
      "background:var(--vq-accent-subtle,#F4F1FA);color:var(--vq-accent,#756DB3);}" +
    ".hcard-site__mark svg{width:20px;height:20px;}" +
    ".hcard-site__body{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px;}" +
    ".hcard-site__t{font-size:14.5px;font-weight:700;color:var(--vq-text,#2B2836);}" +
    ".hcard-site__d{font-size:12px;color:var(--vq-text-tertiary,#9994A8);" +
      "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
    ".hcard-site__go{flex:0 0 auto;width:18px;height:18px;color:var(--vq-text-tertiary,#9994A8);}" +
    ".hcard-site__go svg{width:18px;height:18px;}" +
    ".vqs-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;" +
      "clip:rect(0 0 0 0);white-space:nowrap;border:0;}" +
    "@media (max-width:560px){.hcard-site__d{white-space:normal;}}" +
    ".sunk svg{width:16px;height:16px;color:var(--vq-warning,#E5A85F);flex:0 0 auto;}.sunk p{font-size:11.5px;color:var(--vq-text-secondary,#686477);line-height:1.6;}" +
    ".muted{font-size:12px;color:var(--vq-text-tertiary,#9994A8);}" +
    /* ══ PRESETS（プリセットの一覧） ══════════════════════════════
       ・カードは 表紙 → アイコン → 名前 → 作者 → 中身 → 操作 の順。
       ・表紙が無いプリセットは、科目の色と控えめな模様で埋める（絵は作らない）。
       ・内部の ID（sub:english / summarize）は一切出さない。 */
    ".ms{font-family:'Material Symbols Rounded';font-weight:500;font-style:normal;line-height:1;display:inline-block;letter-spacing:normal;text-transform:none;white-space:nowrap;word-wrap:normal;direction:ltr;-webkit-font-feature-settings:'liga';-webkit-font-smoothing:antialiased;font-variation-settings:'FILL' 1;}" +
    ".ph{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:18px;}" +
    ".ph__title{font-size:24px;font-weight:800;letter-spacing:-.01em;color:var(--vq-text,#2B2836);}.ph__sub{font-size:12.5px;color:var(--vq-text-tertiary,#9994A8);font-weight:550;margin-top:3px;}" +
    ".toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:16px;}" +
    ".sbox{display:flex;align-items:center;gap:8px;height:40px;padding:0 12px;background:var(--vq-surface,#fff);border:1px solid var(--vq-border,#E7E4EF);border-radius:calc(12px * var(--vq-r-scale,1));flex:1 1 260px;max-width:400px;color:var(--vq-text-tertiary,#9994A8);}.sbox svg{width:16px;height:16px;flex:0 0 auto;}.sbox input{border:0;outline:0;background:none;font-family:inherit;font-size:13.5px;color:var(--vq-text,#2B2836);width:100%;}" +
    ".sbox input::-webkit-search-cancel-button,.sbox input::-webkit-search-decoration{-webkit-appearance:none;appearance:none;}" +
    ".seg{display:inline-flex;background:var(--vq-surface-sunken,#EFEDF6);border-radius:calc(11px * var(--vq-r-scale,1));padding:3px;gap:2px;}.seg button{height:32px;padding:0 10px;border:0;background:none;border-radius:calc(8px * var(--vq-r-scale,1));cursor:pointer;color:var(--vq-text-secondary,#686477);font-family:inherit;font-size:12.5px;font-weight:600;display:inline-flex;align-items:center;gap:5px;}.seg button.on{background:var(--vq-surface,#fff);color:var(--vq-accent-text,#5F579E);box-shadow:0 1px 3px rgba(0,0,0,.06);}.seg svg{width:15px;height:15px;}" +
    ".chips{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;}" +
    ".chip{height:32px;padding:0 13px;border-radius:999px;border:1px solid var(--vq-border,#E7E4EF);background:var(--vq-surface,#fff);color:var(--vq-text-secondary,#686477);font-family:inherit;font-size:12.5px;font-weight:600;cursor:pointer;transition:all .12s;}.chip:hover{border-color:var(--vq-border-focus,#C9BEEB);}.chip.on{background:var(--vq-accent,#756DB3);color:var(--vq-accent-contrast,#fff);border-color:var(--vq-accent,#756DB3);}" +
    ".tabs{display:flex;gap:4px;border-bottom:1px solid var(--vq-border-subtle,#ECEAF4);margin-bottom:18px;overflow-x:auto;}" +
    ".tab{position:relative;height:40px;padding:0 12px;border:0;background:none;cursor:pointer;color:var(--vq-text-tertiary,#9994A8);font-family:inherit;font-size:13px;font-weight:650;white-space:nowrap;display:inline-flex;align-items:center;gap:6px;}.tab.on{color:var(--vq-accent-text,#5F579E);}.tab.on::after{content:'';position:absolute;left:8px;right:8px;bottom:-1px;height:2px;background:var(--vq-accent,#756DB3);border-radius:2px;}" +
    ".tab__c{min-width:18px;height:18px;padding:0 5px;border-radius:calc(9px * var(--vq-r-scale,1));background:var(--vq-surface-sunken,#EFEDF6);color:var(--vq-accent,#8A81C2);font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;}.tab.on .tab__c{background:var(--vq-accent-subtle,#EBE4FB);color:var(--vq-accent-text,#5F579E);}" +
    ".empty{padding:44px 16px;text-align:center;font-size:13px;color:var(--vq-text-tertiary,#9994A8);font-weight:550;}" +
    ".empty__ic{width:56px;height:56px;margin:0 auto 12px;border-radius:50%;background:var(--vq-surface-sunken,#EFEDF6);display:grid;place-items:center;color:var(--vq-text-tertiary,#9994A8);}.empty__ic .ms{font-size:26px;}" +
    ".empty__t{font-size:15px;font-weight:700;color:var(--vq-text,#2B2836);margin-bottom:6px;}" +
    ".empty__d{font-size:12.5px;line-height:1.8;margin-bottom:14px;}" +
    ".badge{height:22px;padding:0 9px;border-radius:calc(7px * var(--vq-r-scale,1));font-size:11px;font-weight:700;display:inline-flex;align-items:center;gap:4px;white-space:nowrap;flex:0 0 auto;}" +
    ".badge .ms{font-size:13px;}" +
    ".badge--out{background:var(--vq-surface,#fff);border:1px solid var(--vq-border,#E1DDEE);color:var(--vq-text-secondary,#686477);}.badge--acc{background:var(--vq-accent-subtle,#EFEBFA);color:var(--vq-accent-text,#5F579E);}.badge--warn{background:var(--vq-warning-bg,#FaF1D6);color:var(--vq-warning-text,#A8820A);}.badge--neu{background:var(--vq-border-subtle,#F1F0F6);color:var(--vq-text-secondary,#797488);}" +
    /* ── 並べ方 ─────────────────────────────────────────── */
    ".pgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr));gap:18px;align-items:stretch;}" +
    ".pgrid.is-list{grid-template-columns:1fr;gap:10px;}" +
    ".psec{margin-bottom:30px;}" +
    ".psec__h{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:12px;}" +
    ".psec__t{font-size:15px;font-weight:750;color:var(--vq-text,#2B2836);}" +
    ".psec__s{font-size:11.5px;color:var(--vq-text-tertiary,#9994A8);font-weight:550;}" +
    ".psec__more{border:0;background:none;color:var(--vq-accent-text,#5F579E);font-family:inherit;font-size:12.5px;font-weight:650;cursor:pointer;padding:4px 6px;border-radius:8px;}.psec__more:hover{background:var(--vq-accent-subtle,#F2EEFB);}" +
    /* ── カード ─────────────────────────────────────────── */
    ".pc{position:relative;background:var(--vq-surface,#fff);border:1px solid var(--vq-border-subtle,#ECEAF4);border-radius:calc(18px * var(--vq-r-scale,1));overflow:hidden;display:flex;flex-direction:column;cursor:pointer;text-align:left;font:inherit;color:inherit;padding:0;width:100%;transition:transform .14s,box-shadow .14s,border-color .14s;}" +
    ".pc:hover{transform:translateY(-2px);box-shadow:0 10px 28px rgba(84,72,140,.12);border-color:var(--vq-border,#DED8EE);}" +
    ".pc:focus-visible{outline:2px solid var(--vq-accent,#756DB3);outline-offset:2px;}" +
    ".pc.is-active{border-color:var(--vq-border-focus,#B7ADE4);box-shadow:0 0 0 1px var(--vq-border-focus,#B7ADE4);}" +
    /* 表紙。画像が無ければ科目の色と模様で埋める。 */
    ".pc__ban{position:relative;aspect-ratio:16/9;overflow:hidden;background:" +
      "linear-gradient(135deg,hsl(var(--lib-hue,250) 46% var(--lib-l1,90%)),hsl(var(--lib-hue,250) 36% var(--lib-l2,96%)));}" +
    ".pc__ban>img{width:100%;height:100%;object-fit:cover;display:block;}" +
    ".pc__ban::after{content:'';position:absolute;inset:0;pointer-events:none;opacity:.55;}" +
    ".pc__ban.has-img::after{display:none;}" +
    ".pc__ban[data-pat=\"lines\"]::after{background:repeating-linear-gradient(115deg,transparent 0 13px,hsl(var(--lib-hue,250) 44% var(--lib-l3,76%)) 13px 15px);}" +
    ".pc__ban[data-pat=\"grid\"]::after{background:repeating-linear-gradient(0deg,transparent 0 17px,hsl(var(--lib-hue,250) 40% var(--lib-l3,76%)) 17px 18px),repeating-linear-gradient(90deg,transparent 0 17px,hsl(var(--lib-hue,250) 40% var(--lib-l3,76%)) 17px 18px);opacity:.32;}" +
    ".pc__ban[data-pat=\"dots\"]::after{background-image:radial-gradient(hsl(var(--lib-hue,250) 44% var(--lib-l3,76%)) 1.6px,transparent 1.7px);background-size:14px 14px;}" +
    ".pc__ban[data-pat=\"paper\"]::after{background:repeating-linear-gradient(0deg,transparent 0 11px,hsl(var(--lib-hue,250) 40% var(--lib-l3,76%)) 11px 12px);opacity:.36;}" +
    ".pc__ban[data-pat=\"plain\"]::after{background:radial-gradient(120% 90% at 82% 6%,hsl(var(--lib-hue,250) 48% var(--lib-l3,76%)) 0%,transparent 62%);opacity:.4;}" +
    ".pc__kinds{position:absolute;left:10px;top:10px;display:flex;gap:6px;flex-wrap:wrap;max-width:calc(100% - 20px);z-index:2;}" +
    ".pc__kind{height:22px;padding:0 9px;border-radius:999px;font-size:10.5px;font-weight:750;display:inline-flex;align-items:center;gap:4px;background:rgba(255,255,255,.94);color:#4A4459;box-shadow:0 1px 3px rgba(30,20,60,.16);backdrop-filter:saturate(1.4) blur(2px);}" +
    ".pc__kind .ms{font-size:13px;}" +
    ".pc__kind.is-official{background:var(--vq-accent,#756DB3);color:#fff;}" +
    ".pc__kind.is-new{background:var(--vq-warning,#E5A85F);color:#3B2A0C;}" +
    /* ══ 横に すべる 棚（2026-09-01・訴え「右に スライドすれば 他のも」）══
       ★ 指では そのまま すべらせる（scroll-snap で 1 枚ずつ 止まる）。
       ★ PC では 矢印。**中身が はみ出して いる ときだけ 出す**
         （いつも 出すと、3 枚しか 無い ときに 押しても 何も 起きない）。 */
    /* Lumi の ひとこと（2026-09-01） */
    ".alert__t{display:flex;align-items:baseline;gap:8px;}" +
    ".alert__w{font-size:11px;font-weight:500;color:var(--vq-text-tertiary,#9994A8);}" +
    ".alert__s{margin-top:5px;font-size:12px;line-height:1.8;color:var(--vq-text-tertiary,#9994A8);}" +
    ".alert__act{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;}" +
    ".resume.is-ghost{background:transparent;color:var(--vq-text-secondary,#5A5568);" +
      "border:1px solid var(--vq-border,#E7E4EF);}" +
    ".alert.is-quiet{opacity:.92;}" +
    /* 1 日の 目あて（2026-09-01） */
    ".goal{padding:16px 18px;}" +
    ".goal__h{display:flex;align-items:baseline;gap:10px;margin-bottom:9px;}" +
    ".goal__t{font-size:13px;font-weight:700;}" +
    ".goal__n{margin-left:auto;font-size:12.5px;color:var(--vq-text-tertiary,#9994A8);}" +
    ".goal__n b{font-size:17px;font-weight:750;color:var(--vq-text,#2B2836);}" +
    ".goal__bar{height:8px;border-radius:999px;background:var(--vq-border-subtle,#EFEDF5);overflow:hidden;}" +
    ".goal__bar i{display:block;height:100%;border-radius:999px;background:var(--vq-accent,#756DB3);" +
      "transition:width .3s ease;}" +
    ".goal.is-done .goal__bar i{background:var(--vq-success,#70AD86);}" +
    ".goal__d{margin-top:7px;font-size:12px;color:var(--vq-text-tertiary,#9994A8);}" +
    ".rail-card{overflow:hidden;}" +
    ".railwrap{position:relative;}" +
    ".rail{display:flex;gap:12px;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x proximity;" +
      "-webkit-overflow-scrolling:touch;scroll-behavior:smooth;padding:2px 20px 18px;" +
      "scrollbar-width:none;}" +
    ".rail::-webkit-scrollbar{display:none;}" +
    ".rail:focus-visible{outline:2px solid var(--vq-accent,#756DB3);outline-offset:-2px;border-radius:12px;}" +
    ".rail > *{flex:0 0 auto;width:230px;scroll-snap-align:start;}" +
    ".rail--news > *{width:290px;}" +
    ".rail__empty{width:100%!important;padding:6px 0 14px;color:var(--vq-text-tertiary,#9994A8);font-size:13px;}" +
    ".railb{position:absolute;top:calc(50% - 12px);width:36px;height:36px;border-radius:50%;cursor:pointer;" +
      "border:1px solid var(--vq-border,#E7E4EF);background:var(--vq-surface,#fff);color:var(--vq-text-secondary,#5A5568);" +
      "display:grid;place-items:center;box-shadow:0 2px 10px rgba(30,20,60,.14);z-index:3;transform:translateY(-50%);}" +
    ".railb:hover{background:var(--vq-surface-hover,#F7F5FC);}" +
    ".railb--l{left:6px;}.railb--r{right:6px;}" +
    ".railb svg{width:18px;height:18px;}" +
    ".railb[hidden]{display:none;}" +
    /* お知らせの 札 */
    ".nc{display:block;text-align:left;width:100%;border:1px solid var(--vq-border,#E7E4EF);border-radius:14px;" +
      "background:var(--vq-surface,#fff);padding:0;cursor:pointer;font-family:inherit;overflow:hidden;}" +
    /* ★ バナー（2026-09-01）。絵が 無い ものは 種類の 印を 敷く。 */
    ".nc__cv{display:block;width:100%;height:104px;background:var(--vq-bg-subtle,#F4F2FB);" +
      "border-bottom:1px solid var(--vq-border-subtle,#EFEDF5);}" +
    ".nc__cv img{width:100%;height:100%;object-fit:cover;display:block;}" +
    ".nc__cv--art{display:grid;place-items:center;position:relative;overflow:hidden;" +
      "color:var(--vq-accent,#756DB3);}" +
    ".nc__cv--art::after{content:'';position:absolute;inset:0;pointer-events:none;" +
      "background-image:repeating-linear-gradient(135deg,rgba(138,129,194,.10) 0 1px,transparent 1px 12px);}" +
    ".nc__cv--art svg{position:relative;width:34px;height:34px;opacity:.85;}" +
    ".nc__c{display:block;padding:12px 14px 13px;}" +
    ".nc:hover{background:var(--vq-surface-hover,#F7F5FC);}" +
    ".nc__top{display:flex;align-items:center;gap:7px;margin-bottom:7px;}" +
    ".nc__k{font-size:10.5px;font-weight:750;letter-spacing:.05em;padding:2px 8px;border-radius:999px;" +
      "background:var(--vq-accent-subtle,#F4F2FB);color:var(--vq-accent-text,#5F579E);}" +
    ".nc__new{width:7px;height:7px;border-radius:50%;background:var(--vq-danger,#D9534F);}" +
    ".nc__d{margin-left:auto;font-size:11px;color:var(--vq-text-tertiary,#9994A8);}" +
    ".nc__t{font-size:14px;font-weight:700;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;" +
      "-webkit-box-orient:vertical;overflow:hidden;}" +
    ".nc__b{margin-top:6px;font-size:12px;line-height:1.75;color:var(--vq-text-secondary,#5A5568);" +
      "display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}" +
    /* スマホ。棚は そのまま 指で すべる ので 矢印は 出さない。 */
    "@media (max-width:760px){" +
      ".railb{display:none;}" +
      ".rail{padding:2px 16px 16px;gap:10px;}" +
      ".rail > *{width:200px;}" +
      ".rail--news > *{width:82vw;max-width:300px;}" +
    "}" +
    ".pc__fav{position:absolute;right:8px;top:8px;width:34px;height:34px;border-radius:50%;border:0;cursor:pointer;background:rgba(255,255,255,.92);color:#9E98AC;display:grid;place-items:center;box-shadow:0 1px 3px rgba(30,20,60,.16);z-index:2;}" +
    ".pc__fav.on{color:#E0A31C;}.pc__fav .ms{font-size:19px;}.pc__fav:hover{background:#fff;}" +
    /* ★ 途中まで 解いた ぶんの 棒（2026-09-03・訴え）。YouTube と 同じで
       表紙の 下端に 細く 敷く。下地は 薄く、進んだ ぶんだけ 濃く。 */
    ".pc__prog{position:absolute;left:0;right:0;bottom:0;height:4px;z-index:3;" +
      "background:rgba(0,0,0,.28);pointer-events:none;}" +
    ".pc__prog-f{display:block;height:100%;background:var(--vq-accent,#756DB3);" +
      "border-radius:0 2px 2px 0;transition:width .25s ease;}" +
    ".pc__state.is-resume{color:var(--vq-accent-text,#5F5691);font-weight:750;" +
      "display:inline-flex;align-items:center;gap:3px;}" +
    ".pc__state.is-resume .ms{font-size:15px;}" +
    ".pc__go.is-resume{background:var(--vq-accent,#756DB3);color:#fff;border-color:transparent;}" +
    ".pc__fav:not(.on) .ms{font-variation-settings:'FILL' 0;}" +
    ".pc__fav:focus-visible{outline:2px solid var(--vq-accent,#756DB3);outline-offset:2px;}" +
    /* ── クラウドで 作りかけの 札 ────────────────────────────────
       ★ 「ちょっと 薄暗い 見た目」。押せる ものは 止めるだけ。
         できた 割合は **できた数 ÷ 頼んだ数**。時間から 推し量らない。 */
    ".pc--building{position:relative;display:flex;gap:13px;align-items:flex-start;padding:15px;" +
      "background:var(--vq-surface,#fff);border:1px dashed var(--vq-border-strong,#D7D2E4);" +
      "border-radius:calc(18px * var(--vq-r-scale,1));opacity:.72;}" +
    ".pc--building__ic{position:relative;flex:0 0 auto;width:50px;height:50px;" +
      "border-radius:calc(15px * var(--vq-r-scale,1));display:grid;place-items:center;" +
      "background:var(--vq-accent-subtle,#EAE8F7);color:var(--vq-accent-text,#5F579E);}" +
    ".pc--building__ic .ms{font-size:25px;animation:vqscr-lift 1.8s ease-in-out infinite;}" +
    ".pc--building__pct{position:absolute;right:-7px;bottom:-7px;min-width:32px;padding:1px 5px;" +
      "border-radius:999px;background:var(--vq-accent,#756DB3);color:var(--vq-accent-contrast,#fff);" +
      "font-size:11px;font-weight:750;text-align:center;font-variant-numeric:tabular-nums;}" +
    "@keyframes vqscr-lift{0%,100%{transform:translateY(1px);}50%{transform:translateY(-2px);}}" +
    ".pc--building__b{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:6px;}" +
    ".pc--building__m{font-size:11.5px;color:var(--vq-text-secondary,#686477);font-weight:550;}" +
    ".pc--building__bar{height:4px;border-radius:999px;background:var(--vq-surface-active,#F1EEF8);overflow:hidden;}" +
    ".pc--building__bar>span{display:block;height:100%;border-radius:inherit;background:var(--vq-accent,#756DB3);transition:width .3s ease;}" +
    ".pc--building__n{font-size:11px;color:var(--vq-text-tertiary,#9994A8);}" +
    ".pc--building__x{position:absolute;right:10px;top:10px;border:0;background:none;cursor:pointer;" +
      "font-size:11.5px;font-weight:650;color:var(--vq-text-secondary,#686477);padding:4px 6px;border-radius:8px;}" +
    ".pc--building__x:hover{background:var(--vq-surface-active,#F1EEF8);color:var(--vq-text,#2B2836);}" +
    "@media (prefers-reduced-motion:reduce){.pc--building__ic .ms{animation:none;}.pc--building__bar>span{transition:none;}}" +
    /* アイコン（表紙に少し重ねる） */
    ".pc__body{padding:0 15px 13px;display:flex;flex-direction:column;gap:6px;flex:1 1 auto;min-width:0;}" +
    ".pc__ico{width:50px;height:50px;margin-top:-26px;margin-bottom:2px;border-radius:calc(15px * var(--vq-r-scale,1));background:var(--ico,hsl(var(--lib-hue,250) 32% 48%));border:2.5px solid var(--vq-surface,#fff);box-shadow:0 3px 10px rgba(84,72,140,.18);display:grid;place-items:center;overflow:hidden;position:relative;z-index:1;flex:0 0 auto;color:#fff;font-weight:800;font-size:19px;}" +
    ".pc__ico>img{width:100%;height:100%;object-fit:cover;display:block;}" +
    ".pc__ico .ms{font-size:25px;}" +
    ".pc__title{font-size:14.5px;font-weight:750;color:var(--vq-text,#2B2836);line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word;}" +
    ".pc__by{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--vq-text-secondary,#686477);font-weight:600;min-width:0;}" +
    ".pc__by .ms{font-size:14px;color:var(--vq-text-tertiary,#9994A8);}" +
    ".pc__by span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
    ".pc__av{width:20px;height:20px;border-radius:50%;object-fit:cover;flex:0 0 auto;display:inline-grid;place-items:center;background:var(--vq-accent-subtle,#EAE8F7);color:var(--vq-accent-text,#5F579E);font-size:10.5px;font-weight:750;overflow:hidden;}" +
    ".pc__byn{font-weight:650;color:var(--vq-text,#2B2836);flex:0 1 auto;min-width:0;}" +
    ".pc__byh{color:var(--vq-text-tertiary,#9994A8);font-weight:550;flex:0 1 auto;min-width:0;}" +
    ".pc__bym{flex:0 0 auto;font-size:10px;font-weight:700;padding:1px 6px;border-radius:999px;background:var(--vq-accent-subtle,#EFEBFA);color:var(--vq-accent-text,#5F579E);}" +
    ".pc__meta{font-size:11.5px;color:var(--vq-text-tertiary,#9994A8);font-weight:550;display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center;}" +
    /* ══ 試験の見分け（2026-08-30）══════════════════════════════
       同じ一覧のまま、**表紙の縮小見本**で 試験だと 分かるようにする。
       プリセットは これまでの 表紙（アイコン・バナー）の まま。 */
    ".pc-exam{aspect-ratio:16/9;background:#fff;border-bottom:1px solid var(--vq-border-subtle,#ECEAF4);" +
      "display:flex;flex-direction:column;align-items:center;justify-content:flex-start;" +
      "padding:14px 16px 10px;gap:5px;position:relative;overflow:hidden;}" +
    ".pc-exam__t{font-size:11.5px;font-weight:750;color:#2B2836;text-align:center;line-height:1.4;" +
      "max-width:100%;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}" +
    ".pc-exam__s{font-size:9.5px;color:#6B6480;}" +
    ".pc-exam__r{width:64%;height:3px;border-radius:2px;background:#EDEBF3;margin-top:4px;}" +
    ".pc-exam__r.s{width:44%;}" +
    ".pc-exam__f{margin-top:auto;display:flex;gap:6px;width:78%;}" +
    ".pc-exam__f i{flex:1 1 auto;height:8px;border-bottom:1px solid #D7D2E4;}" +
    ".pc__badge{align-self:flex-start;font-size:10.5px;font-weight:750;letter-spacing:.04em;" +
      "padding:3px 8px;border-radius:6px;margin-bottom:6px;" +
      "background:var(--vq-accent-subtle,#EAE8F7);color:var(--vq-accent-text,#5F5691);}" +
    /* 「英語・20 問・約 12 分」を中黒でつなぐと 1 本の長い文字列になり、
       どこが問題数でどこが時間か、目で拾えない。区切って絵を添える。 */
    ".pc__m{display:inline-flex;align-items:center;gap:3px;white-space:nowrap;}" +
    ".pc__m .ms{font-size:13px;line-height:1;opacity:.8;}" +
    ".pc__types{font-size:11.5px;color:var(--vq-text-secondary,#686477);font-weight:550;line-height:1.6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
    ".pc__tags{display:flex;gap:5px;flex-wrap:wrap;}" +
    ".pc__tag{font-size:10.5px;font-weight:650;color:var(--vq-text-tertiary,#9994A8);background:var(--vq-surface-sunken,#F2F0F8);border-radius:999px;padding:2px 8px;}" +
    ".pc__foot{margin-top:auto;padding:11px 15px;border-top:1px solid var(--vq-surface-active,#F0EEF6);display:flex;align-items:center;justify-content:space-between;gap:8px;}" +
    ".pc__state{font-size:11px;font-weight:650;color:var(--vq-text-tertiary,#9994A8);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
    ".pc__go{height:34px;min-width:64px;padding:0 15px;border-radius:calc(11px * var(--vq-r-scale,1));border:0;background:var(--vq-accent,#756DB3);color:var(--vq-accent-contrast,#fff);font-family:inherit;font-size:12.5px;font-weight:700;cursor:pointer;flex:0 0 auto;transition:filter .12s;}" +
    ".pc__go:hover{filter:brightness(1.08);}.pc__go:focus-visible{outline:2px solid var(--vq-text,#2B2836);outline-offset:2px;}" +
    ".pc__go[disabled]{background:var(--vq-surface-sunken,#EFEDF6);color:var(--vq-text-disabled,#B6B0C4);cursor:default;}" +
    /* 一覧表示（1 列）のときは表紙を細く */
    ".pgrid.is-list .pc{flex-direction:row;align-items:stretch;}" +
    ".pgrid.is-list .pc__ban{aspect-ratio:auto;width:132px;flex:0 0 auto;}" +
    ".pgrid.is-list .pc__kinds{left:8px;top:8px;}" +
    ".pgrid.is-list .pc__fav{position:static;margin-left:auto;box-shadow:none;background:none;}" +
    ".pgrid.is-list .pc__body{padding:13px 15px;}" +
    ".pgrid.is-list .pc__ico{display:none;}" +
    ".pgrid.is-list .pc__foot{margin-top:0;border-top:0;border-left:1px solid var(--vq-surface-active,#F0EEF6);flex-direction:column;align-items:flex-end;justify-content:center;min-width:132px;}" +
    /* 読み込み中の見た目（形だけ先に置く） */
    ".sk{background:var(--vq-surface,#fff);border:1px solid var(--vq-border-subtle,#ECEAF4);border-radius:calc(18px * var(--vq-r-scale,1));overflow:hidden;}" +
    ".sk__b{aspect-ratio:16/9;background:var(--vq-surface-sunken,#EFEDF6);}" +
    ".sk__l{height:12px;border-radius:6px;background:var(--vq-surface-sunken,#EFEDF6);margin:12px 15px 0;}" +
    ".sk__l.s{width:52%;}.sk__l.m{width:76%;}" +
    ".sk__f{height:34px;border-radius:10px;background:var(--vq-surface-sunken,#EFEDF6);margin:14px 15px 14px;}" +
    ".sk .sk__b,.sk .sk__l,.sk .sk__f{animation:skp 1.4s ease-in-out infinite;}" +
    "@keyframes skp{0%,100%{opacity:1}50%{opacity:.55}}" +
    /* 取得できなかったときの帯 */
    ".pwarn{display:flex;align-items:flex-start;gap:9px;padding:11px 14px;margin-bottom:14px;border-radius:calc(13px * var(--vq-r-scale,1));background:var(--vq-warning-bg,#FAF0DF);color:var(--vq-warning-text,#9C6A1B);font-size:12.5px;line-height:1.7;font-weight:600;}" +
    ".pwarn .ms{font-size:16px;flex:0 0 auto;margin-top:1px;}" +
    ".pwarn button{margin-left:auto;border:0;background:none;color:inherit;font:inherit;text-decoration:underline;cursor:pointer;flex:0 0 auto;}" +
    ".note{margin:18px 2px 0;font-size:12px;color:var(--vq-text-tertiary,#B0AAC0);}" +
    /* 絞り込みのシート（スマホ） */
    ".sheet{position:fixed;inset:0;z-index:60;display:none;}" +
    ".sheet.on{display:block;}" +
    ".sheet__bg{position:absolute;inset:0;background:rgba(24,18,40,.42);}" +
    /* ★ 下の バー（#vqMobBar・z9990）は この 画面より 前面に 出る。
       画面の 下端に 貼ると **バーの 下に 潜って 押せない**。
       #vqScreens が 測って 入れている バーの 高さ（--vqs-pb）ぶん 上げる。
       安全域は バーの 中に 入っているので ここで 二重に 足さない。 */
    ".sheet__p{position:absolute;left:0;right:0;bottom:var(--vqs-pb,0px);background:var(--vq-surface,#fff);" +
      "border-radius:22px 22px 0 0;padding:8px 18px 22px;max-height:calc(82vh - var(--vqs-pb,0px));overflow-y:auto;" +
      "box-shadow:0 -10px 30px rgba(24,18,40,.16);}" +
    ".sheet__g{width:38px;height:4px;border-radius:999px;background:var(--vq-border,#E1DDEE);margin:6px auto 14px;}" +
    ".sheet__t{font-size:13px;font-weight:750;color:var(--vq-text,#2B2836);margin:14px 0 8px;}" +
    "@media (prefers-reduced-motion:reduce){.pc,.pc:hover{transition:none;transform:none;}.sk .sk__b,.sk .sk__l,.sk .sk__f{animation:none;}}" +
    /* tones */
    ".t-lav{background:var(--vq-accent-subtle,#EFEBFA);color:var(--vq-accent-text,#5F579E);}.t-blue{background:var(--vq-info-bg,#E5EFFA);color:var(--vq-info-text,#2E6FB0);}.t-amber{background:var(--vq-warning-bg,#FaF1D6);color:var(--vq-warning-text,#A8820A);}.t-teal{background:var(--vq-success-bg,#DFF3EC);color:var(--vq-success-text,#1F8E6B);}.t-rose{background:var(--vq-danger-bg,#FBE7EC);color:var(--vq-danger-text,#C1445F);}.t-pink{background:var(--vq-danger-bg,#FBE7F1);color:var(--vq-danger-text,#B14E86);}" +
    /* 並べ替え・絞り込み */
    ".sel{position:relative;display:inline-flex;align-items:center;height:40px;}" +
    ".sel select{appearance:none;-webkit-appearance:none;height:40px;padding:0 32px 0 12px;border-radius:calc(12px * var(--vq-r-scale,1));border:1px solid var(--vq-border,#E7E4EF);background:var(--vq-surface,#fff);color:var(--vq-text,#2B2836);font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;}" +
    ".sel .ms{position:absolute;right:9px;pointer-events:none;font-size:17px;color:var(--vq-text-tertiary,#9994A8);}" +
    ".fbtn{display:none;align-items:center;gap:6px;height:40px;padding:0 13px;border-radius:calc(12px * var(--vq-r-scale,1));border:1px solid var(--vq-border,#E7E4EF);background:var(--vq-surface,#fff);color:var(--vq-text,#2B2836);font-family:inherit;font-size:13px;font-weight:650;cursor:pointer;}" +
    ".fbtn .ms{font-size:17px;}.fbtn .n{min-width:18px;height:18px;border-radius:9px;background:var(--vq-accent,#756DB3);color:#fff;font-size:10.5px;display:inline-grid;place-items:center;padding:0 5px;}" +
    "@media (max-width:720px){" +
      ".stats{grid-template-columns:repeat(2,1fr);}.hero__title,.ph__title{font-size:22px;}" +
      /* スマホ: 1 列・タブは横に流す・絞り込みはシートへ */
      ".pgrid{grid-template-columns:minmax(0,1fr);gap:14px;}" +
      ".tabs{margin-left:-16px;margin-right:-16px;padding:0 16px;scrollbar-width:none;}" +
      ".tabs::-webkit-scrollbar{display:none;}" +
      ".chips{display:none;}" +
      ".sel{display:none;}" +
      ".fbtn{display:inline-flex;}" +
      ".seg{display:none;}" +
      ".sbox{flex:1 1 100%;max-width:none;}" +
      ".pc__ban{aspect-ratio:2/1;}" +
      ".psec{margin-bottom:22px;}" +
    "}";

  /* ★ プレイグラウンド（2026-09-07）も **この 見た目を そのまま** 使う。
     訴え「プレイグラウンドの 一覧は プリセット一覧と 同じ ものに して ほしい。
     そうすれば 見やすいから」。
     ★ 写して 持つと 必ず ずれる（片方だけ 直る）。**出どころを 1 つに する。**
     vq-playground は これを 自分の 影の DOM へ 入れて 一覧を 描く。 */
  window.__vqScreensCss = CSS;

  /* ══ HOME builders（UI Studio HomeScreen と同一レイアウト・中身は実データ） ══ */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  function statHTML(o) {
    var d = "";
    if (o.delta != null) {
      var cls = o.delta > 0 ? "up" : o.delta < 0 ? "down" : "flat";
      d = '<div class="stat__delta ' + cls + '">' + svg(o.delta < 0 ? "down" : "up") +
        '<span>' + (o.delta > 0 ? "+" : "") + o.delta + (o.deltaUnit || "%") + '</span><em>' + esc(o.deltaLabel || "") + '</em></div>';
    } else if (o.note) { d = '<div class="stat__delta flat"><em>' + esc(o.note) + '</em></div>'; }
    return '<div class="stat"><div class="stat__top"><span class="stat__label">' + esc(o.label) + '</span>' +
      '<span style="color:' + o.color + '">' + svg(o.icon) + '</span></div>' +
      '<div class="stat__row"><span class="stat__val">' + esc(o.value) + '</span>' +
      (o.unit ? '<span class="stat__unit">' + esc(o.unit) + '</span>' : '') + '</div>' + d + '</div>';
  }
  /* Studio BarChart 相当（グリッド3本＋角丸バー＋曜日ラベル） */
  function barChartHTML(days) {
    var W = 560, H = 152, padL = 34, padB = 22, padT = 8;
    var vals = days.map(function (d) { return d.min; });
    var raw = Math.max.apply(null, vals.concat([1]));
    var max = raw <= 5 ? 5 : Math.ceil(raw / 10) * 10;
    var iw = W - padL - 8, ih = H - padB - padT, gw = iw / days.length, bw = Math.min(28, gw - 14);
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="今週の学習時間">';
    [0, 0.5, 1].forEach(function (t) {
      var y = padT + ih * (1 - t);
      s += '<line x1="' + padL + '" x2="' + (W - 4) + '" y1="' + y + '" y2="' + y + '" stroke="var(--vq-border-subtle,#EFEDF5)" stroke-width="1"/>' +
        '<text x="' + (padL - 6) + '" y="' + (y + 4) + '" text-anchor="end" font-size="10" fill="var(--vq-text-tertiary,#9994A8)">' + Math.round(max * t) + '</text>';
    });
    days.forEach(function (d, i) {
      var gx = padL + gw * i, bh = Math.max(2, (d.min / max) * ih), bx = gx + gw / 2 - bw / 2, by = padT + ih - bh;
      s += '<path d="M ' + bx + ' ' + (by + 4) + ' q 0 -4 4 -4 h ' + (bw - 8) + ' q 4 0 4 4 v ' + (bh - 4) + ' h ' + (-bw) + ' z" fill="var(--vq-accent,#756DB3)">' +
        '<title>' + esc(d.label) + ' ' + d.min + '分</title></path>' +
        '<text x="' + (gx + gw / 2) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="10" fill="var(--vq-text-tertiary,#9994A8)">' + esc(d.label) + '</text>';
    });
    return s + '</svg>';
  }
  function homeHTML() {
    return '<div class="screen" data-screen="home">' +
      '<div class="hero"><div><div class="hero__date" data-home-date>—</div>' +
      '<h1 class="hero__title"><span data-mirror="appV2GreetingText">おかえりなさい</span>、<span data-mirror="appV2GreetingName">学習者</span>さん</h1>' +
      '<div class="koto" data-home-koto hidden></div></div>' +
      '<span class="qpill">' + svg("coins") + '<span data-home-qredit>0</span> Qredit</span></div>' +
      '<div class="stats" data-home-stats></div>' +
      /* ══ ★ 横に すべる 棚（2026-09-01・訴え）══════════════════════════
         訴え「公開の おすすめの プリセットとかを 一覧の 表示の まま ホームに
               表示。あと ニュースとかも。右に スライドすれば 他のも 表示される 仕組み」
         ★ カードの 見た目は **一覧と 同じ もの**（pcHTML）を そのまま 使う。
           ホーム用に 別の カードを 作ると、いつか 見た目が 食い違う。
         ★ 指では すべらせ、PC では 矢印。どちらでも 動く ように 両方 置く。 */
      '<div class="card card--flush rail-card">' +
        '<div class="card__head card__head--pad"><h2 class="card__t">おすすめのプリセット</h2>' +
        '<button class="linkbtn" data-nav-tab="library">すべて見る</button></div>' +
        '<div class="railwrap">' +
          '<button class="railb railb--l" data-rail="rec:-1" aria-label="前へ" hidden>' + svg("left") + '</button>' +
          '<div class="rail" data-home-rec tabindex="0" role="list" aria-label="おすすめのプリセット"></div>' +
          '<button class="railb railb--r" data-rail="rec:1" aria-label="次へ" hidden>' + svg("right") + '</button>' +
        '</div></div>' +
      '<div class="card card--flush rail-card">' +
        /* ★ 呼び名を **NEWS** に そろえる（2026-09-01・訴え）。
           左の 帯も タブも NEWS なので、ここだけ「お知らせ」だと 別物に 見える。 */
        '<div class="card__head card__head--pad"><h2 class="card__t">NEWS</h2>' +
        '<button class="linkbtn" data-nav-tab="news">すべて見る</button></div>' +
        '<div class="railwrap">' +
          '<button class="railb railb--l" data-rail="news:-1" aria-label="前へ" hidden>' + svg("left") + '</button>' +
          '<div class="rail rail--news" data-home-news tabindex="0" role="list" aria-label="NEWS"></div>' +
          '<button class="railb railb--r" data-rail="news:1" aria-label="次へ" hidden>' + svg("right") + '</button>' +
        '</div></div>' +
      '<div class="hgrid">' +
      '<div class="col">' +
      '<div data-home-goal></div>' +
      '<div data-home-continue></div>' +
      '<div data-home-ai></div>' +
      '<div class="card"><div class="card__head"><h2 class="card__t">今週の学習時間</h2><span class="badge badge--out" data-home-total>—</span></div>' +
      '<div class="chart" data-home-chart></div></div>' +
      '<div class="card card--flush"><div class="card__head card__head--pad"><h2 class="card__t">最近のクイズ</h2>' +
      '<button class="linkbtn" data-nav-tab="library">すべて見る</button></div><div data-home-recent></div></div>' +
      '</div>' +
      '<div class="col">' +
      '<div class="card"><div class="card__head"><h2 class="card__t">カレンダー</h2>' +
      '<button class="linkbtn" data-calopen="">ひらく</button></div>' +
      '<div data-home-cal></div></div>' +
      '<div class="card"><h2 class="card__t2">苦手トップ3</h2><div data-home-weak></div></div>' +
      /* ★ 公式サイトへの導線（2026-08-18）。
         ★ **新しいタブで開く。** 同じタブだと、解きかけの状態を捨てて
           アプリを離れることになる。
         ★ 置き場所は右の列のいちばん下。学習の邪魔をせず、
           探したときには必ずある位置。 */
      '<a class="card hcard-site" href="/site" target="_blank" rel="noopener">' +
        '<span class="hcard-site__mark" aria-hidden="true">' + svg("site") + '</span>' +
        '<span class="hcard-site__body">' +
          '<span class="hcard-site__t">公式サイト</span>' +
          '<span class="hcard-site__d">お知らせ・ロードマップ・安全とプライバシー</span>' +
        '</span>' +
        '<span class="hcard-site__go" aria-hidden="true">' + svg("out") + '</span>' +
        '<span class="vqs-sr">新しいタブで開きます</span>' +
      '</a>' +
      '<div class="sunk" data-home-note></div>' +
      '</div></div></div>';
  }
  /* 実データ描画 */
  /* ══ 今日のことわざ（2026-08-19）═══════════════════════════════════
     ★ 訴え「おはようございます の下に、毎日 ユーザーランダムで ことわざを。
       毎日 0 時に 更新。必ず 毎日 日替わり かつ ユーザーごとに ランダムに」。

     ★ 「日替わり」と「人ごとに ちがう」を **どちらも 必ず** 満たすには、
       乱数ではなく **決め打ちの計算**にする。
         番号 = 混ぜる(その人の印 + 今日の日付) % 全部の数
       こうすると
         ・同じ人・同じ日 … 何度 開いても 同じ（ころころ 変わらない）
         ・日が 変われば   … 必ず 別のものになる
         ・人が ちがえば   … 同じ日でも ばらばら
       乱数だと 開くたびに 変わってしまい、「今日のことわざ」に ならない。

     ★ 日付は **日本時間の 0 時**で 切る。端末が 海外の時計でも ずれない。
     ★ 出典は client/data/kotowaza.js（966 句）。**起動では 読まない**。
       ホームを 開いたときに 初めて 取りに行く（起動を 重くしない）。 */
  var 諺の鍵 = "vq.kotowaza.today.v1";
  var 諺を読み込み中 = false;

  /* 日本時間での「今日」。0 時ちょうどで 変わる。 */
  function 今日のJST(now) {
    var d = new Date((now === undefined ? Date.now() : now) + 9 * 3600 * 1000);
    return d.toISOString().slice(0, 10);
  }
  /* 次に 日付が 変わるまでの ミリ秒（見ている間に 日をまたいでも 直る）。 */
  function 日が変わるまで() {
    var now = Date.now();
    var 経過 = (now + 9 * 3600 * 1000) % 86400000;
    return 86400000 - 経過 + 1500;
  }
  /* その人の印。ログインしていれば ユーザー ID、していなければ 端末の印。
     **個人を 特定できるものは 使わない**（番号を 散らすためだけ）。 */
  function 誰の印() {
    try {
      var u = window.authState && window.authState.user;
      var id = u && (u.id || u.uid || u.userId);
      if (id) return "u" + String(id);
    } catch (e) {}
    /* ★ **札は 在るのに 名簿が まだ 届いていない**とき、ここで 端末の 印へ
       落ちていた（2026-08-27 まで）。ホームは ログインの 返事より 先に
       描かれるので、実際には かなりの 割合で こちらを 通っていた。
       端末の 印は 端末ごとに 違うので、
         ・スマホと PC で **今日の句が 違う**
         ・名簿が 届いた あとで **句が 途中で 入れ替わる**
       が 起きる。同じ人には 同じ句、が 決まりなので ここは **待つ**。
       空を 返すと 呼び側が 描かずに 待ち、名簿が 届いたら 描き直す。 */
    try {
      var t = String(localStorage.getItem("app.auth.token.v1") || "").trim();
      if (t.length > 20) return "";
    } catch (e) {}
    try {
      var k = localStorage.getItem("vq.koto.seed.v1");
      if (!k) {
        k = "d" + Math.random().toString(36).slice(2, 10);
        localStorage.setItem("vq.koto.seed.v1", k);
      }
      return k;
    } catch (e) {}
    return "guest";
  }
  /* 文字を 数に 混ぜる（FNV-1a）。同じ文字なら いつも 同じ数。 */
  function 混ぜる(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
    }
    return h >>> 0;
  }
  /* 1970-01-01 から 数えた 日数（日本時間で 切る）。0 時ちょうどで 1 増える。 */
  function 日数(日) {
    var t = Date.parse(String(日) + "T00:00:00Z");
    return isFinite(t) ? Math.floor(t / 86400000) : 0;
  }
  /* 最大公約数。歩幅を 全部の数と 互いに素にするため。 */
  function 公約数(a, b) { while (b) { var t = a % b; a = b; b = t; } return a; }

  function 今日の一句(全部, 印, 日) {
    if (!全部 || !全部.length) return null;
    var N = 全部.length;
    /* ★ 「混ぜた数 % 全部」だけでは **たまに 2 日続けて 同じ句**になる
       （966 分の 1 ほど。1 年に 0.4 回くらい 起きる）。
       利用者の指示は「**必ず** 毎日 日替わり」なので、そこを 潰す。
     ★ 決め方: その人ごとに **並び順そのもの**を 作り、1 日 1 つ 進める。
         始まり = 混ぜる(印) % N
         歩幅   = 混ぜる(印+"歩") から作る（N と 互いに素にする）
         番号   = (始まり + 日数 × 歩幅) % N
       歩幅が N と 互いに素なら、**N 日ぶん 一度も 重ならない**
       （966 句 ＝ 約 2 年 8 か月 は 必ず 別の句になる）。
       同じ人・同じ日なら いつでも 同じ番号。人が 違えば 始まりも 歩幅も 違う。 */
    var 始 = 混ぜる(印) % N;
    var 歩 = 1 + (混ぜる(印 + "|歩") % (N > 1 ? N - 1 : 1));
    for (var g = 0; g < N && 公約数(N, 歩) !== 1; g++) 歩 = 1 + (歩 % (N > 1 ? N - 1 : 1));
    if (公約数(N, 歩) !== 1) 歩 = 1;
    var n = (始 + 日数(日) * 歩) % N;
    n = ((n % N) + N) % N;
    var x = 全部[n];
    return x ? { 句: x[0], 意味: x[1], 番号: n } : null;
  }
  /* ══ ★ 1 時間ごとの ひとこと（2026-09-01・訴え）════════════════════
     ★ **1 時間に 1 回だけ 頼む。** 描き直すたびに 頼むと 枠を 食い潰す
       （今日 それで サイトが 止まった）。控えは 端末に 置く。
     ★ 返って きた ものだけ 出す。**無い ときは 何も 出さない。** */
  var HOURLY_KEY = "vq.lumi.hourly.v1";
  var 一時間 = 3600000;
  var 頼み中 = false;
  function ひとことを読む() {
    try {
      var o = JSON.parse(localStorage.getItem(HOURLY_KEY) || "null");
      return (o && typeof o === "object") ? o : null;
    } catch (e) { return null; }
  }
  function いつの(t) {
    var d = Date.now() - (Number(t) || 0);
    if (!t) return "";
    if (d < 120000) return "たった今";
    if (d < 3600000) return Math.floor(d / 60000) + "分前";
    return Math.floor(d / 3600000) + "時間前";
  }
  function ひとことを頼む(force) {
    if (頼み中) return;
    var 前 = ひとことを読む();
    if (!force && 前 && (Date.now() - (Number(前.とき) || 0)) < 一時間) return;
    var tk = "";
    try { tk = localStorage.getItem("app.auth.token.v1") || ""; } catch (e) {}
    if (!tk) return;                                   /* ログイン前は 頼まない */
    var T = null;
    try { T = window.__vqTrace; } catch (e) {}
    if (T && T.切れてるか && T.切れてるか()) return;      /* 記録を 切って いる 人には 頼まない */
    var m = null;
    try { m = computeMetrics(); } catch (e) {}
    var 動 = null;
    try { 動 = T && T.まとめ ? T.まとめ(6) : null; } catch (e) {}
    if (!動 && !m) return;
    頼み中 = true;
    var base = "";
    try { base = String(window.VQ_API_BASE || window.AUTH_API_BASE || "").replace(/\/+$/, ""); } catch (e) {}
    window.fetch(base + "/api/ai/hourly", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + tk },
      body: JSON.stringify({
        動き: 動,
        学び: m ? { todayAnswers: m.todayAnswers, weekAnswers: m.weekAnswers,
                    weekAcc: m.weekAcc, streak: m.streak,
                    todayMin: Math.round(m.todayMs / 60000) } : null,
        苦手: (m && m.weak ? m.weak : []).slice(0, 6).map(function (w) {
          return { id: w.id, 名: w.name, 正答率: w.acc, 問数: w.total };
        })
      })
    }).then(function (r) { return r.json(); }).then(function (j) {
      頼み中 = false;
      if (!j || j.ok === false) return;
      try {
        localStorage.setItem(HOURLY_KEY, JSON.stringify({
          とき: Date.now(), 提案: j.できた ? j.提案 : null, 理由: j.理由 || ""
        }));
      } catch (e) {}
      try { if (curScreen === "home") renderHome(); } catch (e) {}
    }).catch(function () { 頼み中 = false; });
  }

  /* ══ お知らせを 取る（ホームの 棚のため。2026-09-01）════════════════
     ★ **1 回だけ 取って 控える。** ホームは 10 秒ごとに 描き直すので、
       そのたび 取りに 行くと 1 分に 6 回 叩く ことに なる。
     ★ 取れなくても ホームは そのまま 使える（棚だけ 出さない）。 */
  var お知らせの控え = null, お知らせ取得中 = false, お知らせを見た = 0;
  function お知らせを取る(done) {
    var 今 = Date.now();
    if (お知らせ取得中) return;
    if (お知らせの控え && 今 - お知らせを見た < 120000) { if (done) done(); return; }
    お知らせ取得中 = true;
    var base = "";
    try { base = String(window.VQ_API_BASE || window.AUTH_API_BASE || "").replace(/\/+$/, ""); } catch (e) {}
    var h = { "Content-Type": "application/json" };
    try {
      var tk = localStorage.getItem("app.auth.token.v1") || "";
      if (tk) h.Authorization = "Bearer " + tk;
    } catch (e) {}
    window.fetch(base + "/api/news/list", { headers: h })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        お知らせの控え = Array.isArray(j && j.items) ? j.items : [];
        お知らせを見た = Date.now();
        お知らせ取得中 = false;
        if (done) done();
      })
      .catch(function () {
        お知らせの控え = [];
        お知らせを見た = Date.now();
        お知らせ取得中 = false;
        if (done) done();
      });
  }
  /* 種類の 呼び名。お知らせの 画面と **同じ 言葉**に する（食い違わせない）。 */
  var 種の表 = { update: "アップデート", feature: "新機能", maintenance: "メンテナンス",
                incident: "障害", campaign: "キャンペーン", notice: "お知らせ" };
  function 種の名(k) {
    var v = String(k || "").toLowerCase();
    return 種の表[v] || String(k || "お知らせ");
  }
  /* 表紙。**本物の 絵が ある ときだけ 絵**。無ければ 種類の 印。 */
  var 種の印 = { update: "rotate", feature: "sparkle", maintenance: "sliders",
                incident: "alert", campaign: "star", notice: "news" };
  function 表紙(x) {
    var u = String((x && (x.coverUrl || x.cover || x.image)) || "").trim();
    if (/^https?:\/\//i.test(u)) {
      return '<span class="nc__cv"><img src="' + esc(u) + '" alt="" loading="lazy" decoding="async"></span>';
    }
    var k = 種の印[String((x && (x.category || x.kind)) || "").toLowerCase()] || "news";
    return '<span class="nc__cv nc__cv--art" aria-hidden="true">' + svg(k) + "</span>";
  }
  function お知らせの日(x) {
    var t = Number(x && (x.publishedAt || x.createdAt || x.updatedAt)) || 0;
    if (!t) return "";
    var d = new Date(t);
    return (d.getMonth() + 1) + "/" + d.getDate();
  }
  function 棚にお知らせ(el) {
    var 並 = (お知らせの控え || []).filter(function (x) { return x && (x.title || x.body); }).slice(0, 10);
    if (!並.length) {
      el.innerHTML = '<div class="rail__empty">いまは お知らせが ありません。</div>';
      矢印を合わせる(el);
      return;
    }
    el.innerHTML = 並.map(function (x) {
      var 種 = 種の名(x.category || x.kind);
      var 未 = x.read === false || x.unread === true;
      return '<button class="nc" type="button" data-news-open="' + esc(String(x.id || "")) + '" role="listitem">'
        /* ★ **バナーと セットで 出す**（2026-09-01・訴え）。
           絵が 無い ものは **でっち上げない**。種類の 印を 敷く だけ
           （お知らせの 画面と 同じ 決まり）。 */
        + 表紙(x)
        + '<span class="nc__c">'
        + '<span class="nc__top"><span class="nc__k">' + esc(種) + "</span>"
        + (未 ? '<span class="nc__new" aria-label="未読"></span>' : "")
        + '<span class="nc__d">' + esc(お知らせの日(x)) + "</span></span>"
        + '<span class="nc__t">' + esc(String(x.title || "（題名なし）")) + "</span>"
        + '<span class="nc__b">' + esc(String(x.summary || x.excerpt || x.body || "").replace(/<[^>]*>/g, "").slice(0, 90)) + "</span>"
        + "</span></button>";
    }).join("");
    矢印を合わせる(el);
  }
  /* ★ 矢印は **はみ出して いる ときだけ** 出す。
     3 枚しか 無いのに 出すと、押しても 何も 起きない。 */
  function 矢印を合わせる(rail) {
    if (!rail) return;
    var wrap = rail.parentNode;
    if (!wrap) return;
    var l = wrap.querySelector(".railb--l"), r = wrap.querySelector(".railb--r");
    var 更 = function () {
      var はみ = rail.scrollWidth - rail.clientWidth;
      if (l) l.hidden = !(はみ > 8) || rail.scrollLeft <= 4;
      if (r) r.hidden = !(はみ > 8) || rail.scrollLeft >= はみ - 4;
    };
    更();
    if (!rail.__railHook) {
      rail.__railHook = 1;
      rail.addEventListener("scroll", 更, { passive: true });
      try { new ResizeObserver(更).observe(rail); } catch (e) {}
    }
    setTimeout(更, 80);
  }

  /* ★ q() は renderHome の中でしか 使えない（影の DOM の 入口を 持っている）。
     ことわざは あとから（読み込みのあと・0 時をまたいだとき）にも 描き直すので、
     **置き場そのもの**を 覚えておく。ここを 間違えると
     「読み込みは 通ったのに 何も 出ない」になる。 */
  var 諺の置き場 = null;
  function 諺を描く(x) {
    var box = 諺の置き場;
    if (!box || !box.isConnected) return;
    if (!x) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = '<div class="koto__w"><span class="koto__tag">今日のことわざ</span>'
      + '<span class="koto__t">' + esc(x.句) + "</span></div>"
      + '<div class="koto__m">' + esc(x.意味) + "</div>";
  }
  /* 名簿が 届いたら もう一度。付けるのは 1 回だけ。 */
  var 諺の待ち受け = false;
  function 諺の知らせを待つ() {
    if (諺の待ち受け) return;
    諺の待ち受け = true;
    ["vq-auth-changed", "vq-login", "vq-pin-passed", "vq-identity-changed"].forEach(function (nm) {
      try { window.addEventListener(nm, function () { setTimeout(function () { ことわざを出す(); }, 60); }); } catch (e) {}
    });
  }
  function ことわざを出す(box) {
    if (box) 諺の置き場 = box;
    if (!諺の置き場) return;
    var 日 = 今日のJST();
    var 印 = 誰の印();
    /* 誰の ぶんか 決まっていない（ログインの 返事待ち）。決まってから 描く。 */
    if (!印) { 諺の知らせを待つ(); return; }
    諺の知らせを待つ();
    /* すでに 決めてあるなら そのまま 出す（開くたびに 変えない）。 */
    try {
      var 控 = JSON.parse(localStorage.getItem(諺の鍵) || "null");
      if (控 && 控.d === 日 && 控.u === 印 && 控.k) {
        諺を描く({ 句: 控.k, 意味: 控.m });
        待って更新();
        return;
      }
    } catch (e) {}
    var 全部 = window.VQKOTO;
    if (全部 && 全部.length) { 決めて出す(全部, 印, 日); 待って更新(); return; }
    if (諺を読み込み中) return;
    諺を読み込み中 = true;
    var sc = document.createElement("script");
    sc.src = "/data/kotowaza.js";
    sc.async = true;
    sc.onload = function () {
      諺を読み込み中 = false;
      if (window.VQKOTO && window.VQKOTO.length) { 決めて出す(window.VQKOTO, 印, 今日のJST()); 待って更新(); }
    };
    /* 取れなくても **何も出さないだけ**。ホームは そのまま 使える。 */
    sc.onerror = function () { 諺を読み込み中 = false; };
    document.head.appendChild(sc);
  }
  function 決めて出す(全部, 印, 日) {
    var x = 今日の一句(全部, 印, 日);
    if (!x) return;
    諺を描く(x);
    try { localStorage.setItem(諺の鍵, JSON.stringify({ d: 日, u: 印, k: x.句, m: x.意味 })); } catch (e) {}
  }
  /* 0 時をまたいだら 差し替える（開きっぱなしでも 翌日の句になる）。 */
  var 諺の時計 = 0;
  function 待って更新() {
    if (諺の時計) clearTimeout(諺の時計);
    諺の時計 = setTimeout(function () {
      諺の時計 = 0;
      try { localStorage.removeItem(諺の鍵); } catch (e) {}
      ことわざを出す();
    }, Math.min(日が変わるまで(), 2147483000));
  }

  var 棚を出すか = true;
  function renderHome() {
    if (!root) return;
    var m = computeMetrics(), presets = scrapePresets(), byId = {};
    presets.forEach(function (p) { byId[p.id] = p; });
    var q = function (sel) { return root.querySelector(sel); };

    /* 日付 ＋ 直近の試験までの日数 */
    var now = new Date(), wd = ["日", "月", "火", "水", "木", "金", "土"];
    var dateTxt = (now.getMonth() + 1) + "月" + now.getDate() + "日(" + wd[now.getDay()] + ")";
    var goals = readGoals().map(function (g) {
      var t = Date.parse(String(g && g.date || "") + "T00:00:00");
      return { name: String(g && g.name || "試験"), ts: t, days: isFinite(t) ? Math.ceil((t - dayStart(Date.now())) / DAY) : null };
    }).filter(function (g) { return g.days != null && g.days >= 0; }).sort(function (a, b) { return a.ts - b.ts; });
    /* 英検カウントダウン（アプリが実描画している値を鏡写し） */
    var eikenDays = (document.querySelector("#appHomeEikenCard .hv3-eiken-days") || {}).textContent;
    var eikenDate = (document.querySelector("#appHomeEikenCard .hv3-eiken-date") || {}).textContent;
    eikenDays = eikenDays ? String(eikenDays).replace(/[^\d]/g, "") : "";
    var next = goals[0];
    var cd = next ? (next.name + "まで" + next.days + "日") : (eikenDays ? "次の英検まで" + eikenDays + "日" : "");
    var de = q("[data-home-date]"); if (de) de.textContent = dateTxt + (cd ? " · " + cd : "");
    ことわざを出す(q("[data-home-koto]"));
    /* Qredit（本体チップは "Q 1,250" 形式なので数値だけ取り出す） */
    var qe = q("[data-home-qredit]");
    if (qe) {
      var qsrc = (document.getElementById("appV2QreditValue") || {}).textContent || "";
      var qm = String(qsrc).match(/[\d,]+/);
      qe.textContent = qm ? qm[0] : "0";
    }

    /* 4 StatCards（すべて実セッションから算出） */
    var st = q("[data-home-stats]");
    if (st) {
      st.innerHTML = [
        statHTML({ label: "今日の学習", value: Math.round(m.todayMs / 60000), unit: "分", icon: "clock", color: "var(--vq-accent,#756DB3)",
          note: m.todaySessions ? m.todayAnswers + "回答 / " + m.todaySessions + "セッション" : "まだ開始していません" }),
        statHTML({ label: "連続学習", value: m.streak, unit: "日", icon: "flame", color: "var(--vq-success,#70AD86)",
          note: m.lastTs ? "前回: " + relTime(m.lastTs) : "継続のベース" }),
        statHTML({ label: "今週の問題数", value: m.weekAnswers, unit: "問", icon: "book", color: "var(--vq-text-tertiary,#9994A8)",
          delta: m.ansDelta, deltaLabel: "先週比" , note: m.ansDelta == null ? "先週の記録なし" : "" }),
        statHTML({ label: "週間正答率", value: m.weekAcc == null ? "—" : m.weekAcc, unit: m.weekAcc == null ? "" : "%", icon: "trophy", color: "var(--vq-text-tertiary,#9994A8)",
          delta: m.accDelta, deltaUnit: "pt", deltaLabel: "先週比", note: m.accDelta == null ? (m.weekAcc == null ? "今週の記録なし" : "先週の記録なし") : "" })
      ].join("");
    }

    /* ★ 1 日の 目あて（2026-09-01・設定 learn.dailyGoal）。
       0 なら 何も 出さない（要らない ものを 置かない）。 */
    var 目 = 0;
    try { 目 = Math.max(0, Number(localStorage.getItem("vq.dailyGoal.v1")) || 0); } catch (e) {}
    var ge = q("[data-home-goal]");
    if (ge) {
      if (!目) ge.innerHTML = "";
      else {
        var 済 = Math.max(0, Number(m.todayAnswers) || 0);
        var 割2 = Math.min(100, Math.round(済 / 目 * 100));
        ge.innerHTML = '<div class="card goal' + (済 >= 目 ? " is-done" : "") + '">'
          + '<div class="goal__h"><span class="goal__t">今日の 目あて</span>'
          + '<span class="goal__n"><b>' + 済 + "</b> / " + 目 + " 問</span></div>"
          + '<div class="goal__bar"><i style="width:' + 割2 + '%"></i></div>'
          + '<div class="goal__d">' + (済 >= 目 ? "きょうの 目あては 達成しました。"
              : ("あと " + (目 - 済) + " 問")) + "</div></div>";
      }
    }
    /* 続きから */
    var r = readResume(), ce = q("[data-home-continue]");
    if (ce) {
      var rp = r && r.presetId ? byId[r.presetId] : null;
      var rName = rp ? rp.title : (document.getElementById("appHomePanelPresetName") || {}).textContent;
      var btn = document.getElementById("homeResumeBtn");
      var canResume = !!(btn && !btn.disabled && r);
      if (canResume) {
        var mode = String(r.mode || "").toUpperCase() === "HAND" ? "WRITE" : "EXAM";
        var meta = mode + (rp && rp.q != null ? " · " + rp.q + (rp.unit || "問") : "") + (r.ts ? " · 前回 " + relTime(r.ts) : "");
        ce.innerHTML = '<div class="continue"><span class="continue__ic">' + svg("play") + '</span>' +
          '<span class="continue__col"><span class="continue__t">続きから: ' + esc(rName || "プリセット") + '</span>' +
          '<span class="continue__m">' + esc(meta) + '</span></span>' +
          '<button class="resume" data-click="homeResumeBtn">再開する</button></div>';
      } else {
        ce.innerHTML = '<div class="continue"><span class="continue__ic">' + svg("play") + '</span>' +
          '<span class="continue__col"><span class="continue__t">学習を始める</span>' +
          '<span class="continue__m">プリセットを選んでクイズを開始します</span></span>' +
          '<button class="resume" data-nav-tab="library">プリセットへ</button></div>';
      }
    }

    /* ══ ★ AI から（2026-09-01・訴え）════════════════════════════════
       訴え「AI から っていう 所は、必ず 学習履歴と 行動パターンを 記録し、
             そこから Live（無制限）が **1 時間ごとに 傾向を 掴んで 提案**。
             そこに ボタンを 作ったり。苦手を 補う プリセットを 作ったり」
       ★ 出すのは **本当に 返って きた もの だけ**。
         材料が 無い ときは 何も 出さない（当てずっぽうを 置かない）。 */
    var ai = q("[data-home-ai]");
    if (ai) {
      var 提 = ひとことを読む();
      if (提 && 提.提案 && 提.提案.ひとこと) {
        var 手 = (提.提案["手"] || []).map(function (h) {
          return '<button class="resume" data-lumi="' + esc(h["型"]) + '" data-lumiarg="'
            + esc(h.arg || "") + '">' + svg("zap") + esc(h.label) + "</button>";
        }).join("");
        ai.innerHTML = '<div class="alert"><span class="alert__ic">' + svg("sparkle") + "</span><div>"
          + '<div class="alert__t">Lumi から<span class="alert__w">' + esc(いつの(提.とき)) + "</span></div>"
          + '<div class="alert__b">' + esc(提.提案.ひとこと) + "</div>"
          + (提.提案["根拠"] ? '<div class="alert__s">' + esc(提.提案["根拠"]) + "</div>" : "")
          + '<div class="alert__act">' + 手
          + '<button class="resume is-ghost" data-lumi="refresh">' + svg("rotate") + "いま 見て もらう</button></div>"
          + "</div></div>";
      } else {
        /* まだ 何も 無い ときは **静かに 待つ**。1 行の 誘いだけ 置く。 */
        ai.innerHTML = '<div class="alert is-quiet"><span class="alert__ic">' + svg("sparkle") + "</span><div>"
          + '<div class="alert__t">Lumi から</div>'
          + '<div class="alert__b">' + esc(提 && 提.理由 ? 提.理由 : "少し 使うと、1 時間ごとに 気づいた ことを お伝えします。") + "</div>"
          + '<div class="alert__act"><button class="resume is-ghost" data-lumi="refresh">'
          + svg("rotate") + "いま 見て もらう</button></div></div></div>";
      }
      ひとことを頼む();
    }

    /* 今週の学習時間グラフ */
    var ch = q("[data-home-chart]"); if (ch) ch.innerHTML = barChartHTML(m.days);
    var tt = q("[data-home-total]"); if (tt) tt.textContent = "合計 " + fmtMin(m.weekMs);

    /* 最近のクイズ（実セッション由来・開始で実起動） */
    var re = q("[data-home-recent]");
    if (re) {
      if (m.recent.length) {
        re.innerHTML = m.recent.map(function (p, i) {
          var lp = byId[p.id];
          var acc = p.total ? Math.round(p.correct / p.total * 100) : null;
          var d = [(lp && lp.subject) || "", (lp && lp.q != null) ? lp.q + (lp.unit || "問") : "", acc != null ? "正答率" + acc + "%" : "", relTime(p.lastTs)]
            .filter(Boolean).join(" · ");
          return (i ? '<hr class="hr">' : '') +
            '<div class="lrow" data-preset-select="' + esc(p.id) + '"><span class="lrow__ic">' + svg("book") + '</span>' +
            '<span class="lrow__col"><span class="lrow__t">' + esc((lp && lp.title) || p.name || p.id) + '</span>' +
            '<span class="lrow__d">' + esc(d) + '</span></span>' +
            '<button class="lrow__go" data-preset-start="' + esc(p.id) + '">開始</button></div>';
        }).join("");
      } else {
        re.innerHTML = '<div style="padding:0 20px 20px;"><div class="muted">まだ学習記録がありません。プリセットからクイズを始めましょう。</div></div>';
      }
    }

    /* ══ ★ おすすめの プリセット（横に すべる 棚。2026-09-01・訴え）══════
       ★ カードは 一覧と **同じ pcHTML**。ホーム用に 別の カードを 作らない。
       ★ 出すのは **みんなの 公開**と **公式**。自分の ものは 下の
         「最近の クイズ」に 出る ので ここには 入れない。
       ★ 並びは 保存された 数 → お気に入り → 見られた 数。
         どれも 数えて いない ものは 後ろへ（**数を でっち上げない**）。 */
    var rec = q("[data-home-rec]");
    if (rec) {
      /* ★ **一覧と 同じ 札の 作りかた**を 使う（2026-09-01・訴え
         「おすすめの プリセットの 作者が『名前のない もの』に なってる」）。
         直す前は 画面から 拾った ぶん（scrapePresets）を そのまま 渡して いた。
         pcHTML は **buildCards の 形**（ownerName・isOfficial・visibility…）を
         見る ので、名前が 入って おらず 全部「名前のない人」に なって いた。
         ★ 一覧が 使う 道を そのまま 通す。別の 道を 作ると また ずれる。 */
      var 元 = [];
      try { 元 = buildCards() || []; } catch (e) { 元 = []; }
      var 推 = 元.filter(function (p) {
        if (p.__exam) return false;                    /* 試験は ここでは 出さない */
        return p.isOfficial === true || p.visibility === "public"
          || p.kind === "public" || p.kind === "official";
      }).sort(function (a2, b2) {
        /* 呼び名が 揺れる ので 両方 見る（片方だけだと いつも 0 に なる）。 */
        var 数 = function (x) {
          return (Number(x.saveCount || x.savedCount || 0) || 0) * 3
            + (Number(x.favoriteCount || 0) || 0) * 2
            + (Number(x.viewCount || 0) || 0);
        };
        var A = 数(a2), B = 数(b2);
        if (B !== A) return B - A;
        return String(a2.title || "").localeCompare(String(b2.title || ""));
      }).slice(0, 14);
      rec.innerHTML = 推.length
        ? 推.map(function (p) { return pcHTML(p); }).join("")
        : '<div class="rail__empty">公開の プリセットが まだ 届いて いません。'
          + "ログインすると おすすめが 並びます。</div>";
      矢印を合わせる(rec);
    }
    /* 設定で 切って いれば 描き直しの あとも たたむ。 */
    if (!棚を出すか) { try { window.__vqScreens.棚を出す(false); } catch (e) {} }

    /* ★ お知らせ（横に すべる 棚）。**取れた ぶんだけ 出す**。 */
    var nw = q("[data-home-news]");
    if (nw) {
      if (お知らせの控え) 棚にお知らせ(nw);
      else {
        nw.innerHTML = '<div class="rail__empty">お知らせを 読み込んで います…</div>';
        お知らせを取る(function () { var n2 = q("[data-home-news]"); if (n2) 棚にお知らせ(n2); });
      }
    }

    /* 試験カレンダー（/goal の実データ ＋ 英検カウントダウン） */
    var cal = q("[data-home-cal]");
    if (cal) {
      /* ★ **同期する カレンダー**の 予定を 先に 出す（2026-09-01・訴え
         「カレンダーを 自分で 設定し、記録できる。アカウントで 同期」）。
         これまでの /goal（端末だけ）も 残す。どちらも 出す。 */
      var 予 = [];
      try { 予 = (window.__vqCalendar && window.__vqCalendar.予定) ? window.__vqCalendar.予定(4) : []; } catch (e) {}
      予.forEach(function (x) {
        var t2 = Date.parse(String(x.date) + "T00:00:00");
        if (!isFinite(t2)) return;
        var 日 = Math.ceil((t2 - dayStart(Date.now())) / DAY);
        goals.push({ name: String(x.title || (x.kind === "exam" ? "試験" : "課題")), ts: t2, days: 日, 同期: true });
      });
      goals = goals.filter(function (g) { return g.days != null && g.days >= 0; })
                   .sort(function (a2, b2) { return a2.ts - b2.ts; });
      var rows = goals.slice(0, 3).map(function (g) {
        var dd = new Date(g.ts);
        return '<div class="calrow"><span class="calrow__d">' + (dd.getMonth() + 1) + "/" + dd.getDate() + '</span>' +
          '<span class="calrow__n">' + esc(g.name) + '</span>' +
          '<span class="badge ' + (g.days <= 14 ? "badge--warn" : "badge--neu") + '">あと' + g.days + '日</span></div>';
      });
      if (eikenDays && rows.length < 3) {
        rows.push('<div class="calrow"><span class="calrow__d">英検</span>' +
          '<span class="calrow__n">' + esc((eikenDate || "次回検定").replace(/\s+/g, " ")) + '</span>' +
          '<span class="badge badge--neu">あと' + eikenDays + '日</span></div>');
      }
      cal.innerHTML = rows.length
        ? '<div style="display:flex;flex-direction:column;gap:8px;">' + rows.join("") + '</div>'
        : '<div class="muted">試験予定はまだありません。Quick Chat の /goal で登録できます。</div>';
    }

    /* 苦手トップ3（プリセット別 正答率 昇順・実データ） */
    var we = q("[data-home-weak]");
    if (we) {
      if (m.weak.length) {
        we.innerHTML = m.weak.map(function (p) {
          var lp = byId[p.id], cls = p.acc < 50 ? "dgr" : p.acc < 70 ? "warn" : "";
          return '<div class="hbar"><div class="hbar__top"><span class="hbar__l">' + esc((lp && lp.title) || p.name || p.id) + '</span>' +
            '<span class="hbar__v">' + p.acc + '%</span></div>' +
            '<div class="track"><span class="' + cls + '" style="width:' + p.acc + '%"></span></div></div>';
        }).join("") +
          '<button class="btn2" data-preset-start="' + esc(m.weak[0].id) + '">' + svg("rotate") + '苦手プリセットを復習</button>';
      } else {
        we.innerHTML = '<div class="muted">まだ十分な記録がありません（5問以上の記録で集計されます）。</div>';
      }
    }

    /* 小カード（今週サマリー・実値） */
    var nt = q("[data-home-note]");
    if (nt) {
      nt.innerHTML = svg("flame") + '<p>過去7日で <b>' + m.weekAnswers + '回答</b> / <b>' + fmtMin(m.weekMs) + '</b>' +
        (m.weekSessions ? '（' + m.weekSessions + 'セッション）' : '') + '</p>';
    }
  }

  /* ── PRESETS builders（静的シェル＋動的レンダリング） ── */
  /* translate="no" は必須。付けないと自動翻訳が名前を訳して合字が壊れ、
     アイコンが英語の文字として見える（2026-08-13 報告）。 */
  function ms(name) { return '<span class="ms notranslate" translate="no" aria-hidden="true">' + esc(name) + "</span>"; }
  /* カードのアイコン。画像 → 本体が付けた記号 → 題名の頭文字 の順に落とす。
     どれも無いときでも壊れた画像は出さない。 */
  function icoHTML(c) {
    var style = c.accentColor ? ' style="--ico:' + esc(c.accentColor) + '"' : "";
    var inner = c.iconUrl
      ? '<img src="' + esc(c.iconUrl) + '" alt="" loading="lazy" decoding="async">'
      : (c.iconText ? ms(c.iconText) : esc(String(c.title || "?").trim().charAt(0) || "?"));
    return '<span class="pc__ico"' + style + ">" + inner + "</span>";
  }
  /* 種別の札。**本体が付けた印だけ**で決める。 */
  function kindBadges(c) {
    var out = [];
    if (c.isOfficial) {
      out.push('<span class="pc__kind is-official">' + ms("verified") + "VocabuQuiz公式</span>");
    } else if (c.isOwnedByCurrentUser) {
      out.push('<span class="pc__kind">' + ms("person") + "マイプリセット</span>");
      if (c.visibility === "public") out.push('<span class="pc__kind">' + ms("public") + "公開中</span>");
    } else {
      out.push('<span class="pc__kind">' + ms("public") + "公開</span>");
    }
    if (c.isNew) out.push('<span class="pc__kind is-new">' + ms("fiber_new") + "NEW</span>");
    return '<div class="pc__kinds">' + out.join("") + "</div>";
  }
  /* 作者の行。
     ・公式        … 発行元
     ・自分のもの  … 非公開なら「自分が作成」。**公開しているなら、公開先で見えるのと
                     同じ名前・@ID・アイコンを出す**（誰の名前で出ているかが分かるように）
     ・ほかの人    … 作者の名前・@ID・アイコン */
  function avatarHTML(url, name) {
    if (url) {
      return '<img class="pc__av" src="' + esc(url) + '" alt="" loading="lazy" decoding="async"'
        + ' onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),{className:\'pc__av is-txt\',textContent:this.dataset.i}))"'
        + ' data-i="' + esc(String(name || "?").trim().charAt(0) || "?") + '">';
    }
    return '<span class="pc__av is-txt">' + esc(String(name || "?").trim().charAt(0) || "?") + "</span>";
  }
  function byHTML(c) {
    if (c.isOfficial) {
      return '<div class="pc__by">' + ms("workspace_premium") + "<span>VocabuQuiz"
        + (c.officialKind ? "（" + esc(c.officialKind) + "）" : "") + "</span></div>";
    }
    var shared = c.visibility === "public" && (c.ownerName || c.ownerHandle);
    if (c.isOwnedByCurrentUser && !shared) {
      return '<div class="pc__by">' + ms("person") + "<span>自分が作成</span></div>";
    }
    var name = c.ownerName || "名前のない人";
    return '<div class="pc__by">' + avatarHTML(c.ownerAvatarUrl, name)
      + '<span class="pc__byn">' + esc(name) + "</span>"
      + (c.ownerHandle ? '<span class="pc__byh">@' + esc(c.ownerHandle) + "</span>" : "")
      + (c.isOwnedByCurrentUser ? '<span class="pc__bym">自分</span>' : "")
      + "</div>";
  }
  function bannerHTML(c) {
    var L = LIB();
    var fb = L ? L.fallbackBanner(c) : { pattern: "plain", style: "" };
    var img = c.bannerUrl
      ? '<img src="' + esc(c.bannerUrl) + '" alt="" loading="lazy" decoding="async" onerror="this.remove();this.parentNode.classList.remove(\'has-img\')">'
      : "";
    return '<div class="pc__ban' + (img ? " has-img" : "") + '" data-pat="' + esc(fb.pattern) + '">'
      + img + kindBadges(c)
      + '<button class="pc__fav' + (c.isFavoritedByCurrentUser ? " on" : "") + '" data-fav="' + esc(c.id)
      + '" aria-pressed="' + (c.isFavoritedByCurrentUser ? "true" : "false")
      + '" aria-label="' + esc(c.title) + ' をお気に入り">' + ms("star") + "</button>"
      + 進みの棒(c)
      + "</div>";
  }
  /* ══ 途中まで 解いた ぶんの 棒（2026-09-03・訴え）════════════════
     訴え「進捗を、YouTube の 再生バーのように 一覧の プリセットの ところに
           出して。解いた 問題数を 再生時間みたいに」
     ★ 置くのは 表紙の **下端**（YouTube と 同じ）。
     ★ **中断中の ものだけ** 出す。0 問の ときは 出さない。
     ★ 色だけで 伝えない。数（3 / 12 問）も 下の 行に 出す。 */
  function 進み(c) {
    var p = c && c.progress;
    if (!p) return null;
    var 済 = Number(p.answered) || 0, 全 = Number(p.total) || 0;
    if (!済 || !全) return null;
    return { 済: Math.min(済, 全), 全: 全,
             率: Math.max(2, Math.min(100, Math.round(済 / 全 * 100))) };
  }
  function 進みの棒(c) {
    var p = 進み(c);
    if (!p) return "";
    return '<div class="pc__prog" role="progressbar" aria-valuemin="0" aria-valuemax="' + p.全
      + '" aria-valuenow="' + p.済 + '" aria-label="' + p.全 + " 問中 " + p.済 + ' 問まで 解きました">'
      + '<span class="pc__prog-f" style="width:' + p.率 + '%"></span></div>';
  }
  /* ══ この id は 試験か（2026-08-30）════════════════════════════
     訴え:「プリセット一覧からその両方の違いをどう一覧で見せるかも決めないと」
     決めたのは「**同じ一覧のまま。表紙で見分ける**」。

     ★ いま 試験は VQ2.store.mocks に 入っている。器を preset へ 寄せる
       段になったら、**ここ 1 か所だけ**を 直せばよいように 分けてある。
     ★ 分からないときは **試験ではない** と 答える（勝手に 札を 付けない）。 */
  var 試験の控え = null, 試験を見た = 0;
  function 試験の表() {
    var 今 = Date.now();
    if (試験の控え && 今 - 試験を見た < 4000) return 試験の控え;
    var out = {};
    try {
      var ST = window.VQ2 && window.VQ2.store;
      var 並 = (ST && ST.listExams) ? ST.listExams() : [];
      (並 || []).forEach(function (rec) {
        var sp = ST.examOf(rec);
        if (!sp || !sp.sections) return;
        out[String(rec.id || sp.id)] = {
          大問: (sp.sections || []).length,
          満点: sp.totalPoints || null,
          分: sp.durationMinutes || null,
          表紙: sp.cover || null,
          題: sp.title || "",
          科: sp.subject || ""
        };
      });
    } catch (e) {}
    試験の控え = out; 試験を見た = 今;
    return out;
  }
  function 試験か(id) { return 試験の表()[String(id)] || null; }

  /* ══ 試験を **CBT で** 開く（2026-08-30）════════════════════════
     訴え「CBT に ならない。試験モードに ならない。
           PDF が 左で、右を 解答欄でしょ？」

     ★ 一覧の「開始」は これまで data-preset-start で、
       vq2-app が 横取りして **1 問ずつの 出題画面**を 開いていた。
       試験は そこでは なく VQ2.examWorkspace（左＝問題冊子／右＝解答欄）。
     ★ vq2-app は **あとから 読む** 4.7MB の 塊。押した その瞬間には
       まだ 無いことが ある。無いときは 読ませて から 待つ。
       「部品が ありません」で 突き放さない。 */
  function 試験の道具(){
    try {
      var V = window.VQ2;
      return (V && V.examWorkspace && V.examWorkspace.open && V.store && V.store.getExam) ? V : null;
    } catch (e) { return null; }
  }
  /* ══ 試験を 押したら **まず 詳細**（2026-09-01・訴え）════════════════
     訴え「試験を クリックすると、詳細が でない。プリセットと 同じように
           試験も 詳細モードを 表示させて。そこから 公開が できるように」
     ★ 直す前は 押した 瞬間に CBT（受験）が 始まって いた。
       何問 あるのかも 見られず、公開の 口も どこにも 無かった。
     ★ 詳細の 部品が まだ 読めて いない ときは **これまでどおり 受験へ**。
       押しても 何も 起きない のが いちばん 悪い。 */
  function 試験の詳細へ(id) {
    try {
      if (window.__vqExamDetail && window.__vqExamDetail.open) {
        window.__vqExamDetail.open(id);
        return;
      }
    } catch (e) {}
    受験へ(id);
  }

  function 受験へ(id) {
    var V = 試験の道具();
    if (V) return 受験を開く(V, id);
    /* まだ 読めていない。読ませて から 待つ（最大 12 秒）。 */
    try { if (window.__vqLoadLibs) window.__vqLoadLibs(); } catch (e) {}
    var 待 = 0;
    var t = setInterval(function () {
      var V2 = 試験の道具();
      if (V2) { clearInterval(t); 受験を開く(V2, id); return; }
      if (++待 > 80) {
        clearInterval(t);
        try { window.__vqToast && window.__vqToast("試験の 画面を 読み込めませんでした。", "warning"); } catch (e) {}
      }
    }, 150);
  }
  function 受験を開く(V, id) {
    var spec = null;
    try { spec = V.store.getExam(String(id)); } catch (e) {}
    if (!spec || !spec.sections) {
      try { window.__vqToast && window.__vqToast("この試験を 読み込めませんでした。", "warning"); } catch (e) {}
      return;
    }
    try { V.examWorkspace.open({ spec: spec }); }
    catch (e) {
      try { window.__vqToast && window.__vqToast("受験の 画面を 開けませんでした。", "warning"); } catch (e2) {}
    }
  }

  /* 表紙の 縮小見本。**実際の 表紙の 中身**から 描く（絵を でっち上げない）。 */
  function 試験の表紙HTML(e) {
    var c = e.表紙 || {};
    var 題 = String(c.examName || e.題 || "");
    var 科 = String(c.subject || e.科 || "");
    return '<div class="pc-exam" aria-hidden="true">'
      + '<div class="pc-exam__t">' + esc(題) + "</div>"
      + (科 ? '<div class="pc-exam__s">' + esc(科) + "</div>" : "")
      + '<div class="pc-exam__r"></div><div class="pc-exam__r s"></div>'
      + '<div class="pc-exam__f"><i></i><i></i><i></i></div></div>';
  }

  function pcHTML(c) {
    var L = LIB();
    var act = activeId() && c.id === activeId();
    var 試 = 試験か(c.id);
    /* ══ 中黒でつながず、区切って絵を添える（2026-08-13）══════════
       もとは「英語・20 問・約 12 分」の 1 本の文字列。
       どこが問題数でどこが時間か、目で拾えなかった。
       絵は Material Symbols（ms）。翻訳よけは ms() が付けてくれる。 */
    var metaHtml = (function () {
      var out = [];
      function seg(name, text) {
        if (!text) return;
        out.push('<span class="pc__m">' + ms(name) + esc(text) + "</span>");
      }
      if (L) {
        seg("menu_book", c.subject ? L.subjectLabel(c.subject) : "");
        seg("quiz", c.questionCount ? c.questionCount + " " + (c.countUnit || "問") : "");
        seg("schedule", (typeof c.estimatedMinutes === "number" && isFinite(c.estimatedMinutes))
          ? "約 " + c.estimatedMinutes + " 分" : "");
      } else {
        seg("quiz", c.questionCount ? c.questionCount + " " + (c.countUnit || "問") : "");
      }
      /* ══ お気に入りされた数と、見られた数（2026-08-14）═══════════════
         ★ **0 のときは出さない。** 「0 人がお気に入り」は誰の役にも立たず、
           作りたてのカードが全部 0 で埋まる。
         ★ 閲覧数は **公開したときだけ**。非公開のものはそもそも数えていない
           （サーバも記録しないし、返してもこない）。 */
      var published = c.visibility === "public" || c.kind === "public" || !!c.publishedAt;
      /* ★ **公開しているものは 0 でも出す**（2026-08-15）。
         0 を隠すと「まだ誰も見ていない」と「壊れて出ていない」の区別が
         付かない。実際に「表示されない」と受け取られた。
         公開していないものは、数える意味が無いのでこれまでどおり出さない。 */
      if (typeof c.favoriteCount === "number" && (published || c.favoriteCount > 0)) {
        seg("star", c.favoriteCount + "");
      }
      if (published && typeof c.viewCount === "number") {
        /* ★ Material Symbols の名前でなければ、絵ではなく **文字がそのまま出る**。
           「eye」は Material Symbols に無い。目のアイコンは visibility。 */
        seg("visibility", c.viewCount + "");
      }
      return out.join("");
    })();
    var types = (L && c.questionTypeCounts) ? L.typeSummary(c.questionTypeCounts, 3) : "";
    var canStart = canDo(c, "start");
    var state = act ? "使用中" : (c.lastPlayedAt && L ? "最後に解いたのは " + L.relTime(c.lastPlayedAt) : (c.updatedLabel || ""));
    /* 科目ごとの色（--lib-hue）は表紙とアイコンの両方で使うので、カード自身に置く */
    var fb = L ? L.fallbackBanner(c) : { style: "" };
    /* ★ 試験の カードは **クイズ画面へ 行かせない**（2026-08-30・訴え
       「CBT に ならない。試験モードに ならない」）。
       data-preset-start / data-preset-select は vq2-app が 捕捉フェーズで
       横取りして 出題画面（1 問ずつ）を 開く。試験は そこでは なく
       **CBT の 作業場**（左＝問題冊子／右＝解答欄）で 受ける。
       目印を 分けておくと、あちらは 素通りして ここへ 届く。 */
    var 開閉 = 試 ? "data-exam-open" : "data-preset-select";
    return '<div class="pc' + (act ? " is-active" : "") + '" ' + 開閉 + '="' + esc(c.id) + '"'
      + ' style="' + esc(fb.style) + '"'
      + ' role="button" tabindex="0" aria-label="' + esc(c.title)
      + (試 ? " を受験する" : " の詳細を開く") + '">'
      + (試 ? 試験の表紙HTML(試) : bannerHTML(c))
      + '<div class="pc__body">' + (試 ? "" : icoHTML(c))
      + (試 ? '<span class="pc__badge">試験</span>' : "")
      + '<div class="pc__title">' + esc(c.title) + "</div>"
      + byHTML(c)
      + (試
          ? '<div class="pc__meta">'
            + (試.満点 ? '<span class="pc__m">' + ms("workspace_premium") + 試.満点 + " 点</span>" : "")
            + (試.分 ? '<span class="pc__m">' + ms("schedule") + 試.分 + " 分</span>" : "")
            + (試.大問 ? '<span class="pc__m">' + ms("list") + "大問 " + 試.大問 + "</span>" : "")
            + "</div>"
          : (metaHtml ? '<div class="pc__meta">' + metaHtml + "</div>" : ""))
      + (types ? '<div class="pc__types" title="' + esc(types) + '">' + ms("category") + " " + esc(types) + "</div>" : "")
      + ((c.tags || []).length ? '<div class="pc__tags">'
          + c.tags.slice(0, 3).map(function (t) { return '<span class="pc__tag">' + esc(t) + "</span>"; }).join("")
          + "</div>" : "")
      + "</div>"
      + '<div class="pc__foot">'
      + (進み(c)
          ? '<span class="pc__state is-resume">' + ms("play_circle")
            + 進み(c).済 + " / " + 進み(c).全 + " 問</span>"
          : '<span class="pc__state">' + esc(state) + "</span>")
      + '<button class="pc__go' + (進み(c) ? " is-resume" : "") + '" '
      + (試 ? "data-exam-start" : "data-preset-start") + '="' + esc(c.id) + '"'
      + ((試 || canStart) ? "" : " disabled")
      + ' aria-label="' + esc(c.title)
      + (進み(c) ? " の 続きから" : (試 ? " を受験" : " を開始")) + '">'
      + (進み(c) ? "続きから" : (試 ? "受験する" : "開始")) + "</button></div>"
      + "</div>";
  }
  function skeletonHTML(n) {
    var one = '<div class="sk"><div class="sk__b"></div><div class="sk__l m"></div><div class="sk__l s"></div><div class="sk__f"></div></div>';
    var out = "";
    for (var i = 0; i < (n || 6); i++) out += one;
    return out;
  }
  function presetsHTML() {
    var sorts = [
      { id: "recommended", label: "おすすめ順" }, { id: "played", label: "最近使った順" },
      { id: "updated", label: "更新が新しい順" }, { id: "new", label: "新着順" },
      { id: "popular", label: "人気順" }, { id: "count", label: "問題数が多い順" },
      { id: "name", label: "名前順" }
    ];
    return '<div class="screen" data-screen="presets">' +
      '<div class="ph"><div><h1 class="ph__title">プリセット</h1>' +
      '<div class="ph__sub">自分のもの・みんなの公開・公式をまとめて選べます</div></div>' +
      '<button class="resume" data-bridge-action="create-quiz">' + svg("sparkle") + 'クイズを作成</button></div>' +
      '<div class="pwarn" data-warn hidden></div>' +
      '<div class="toolbar" role="search">' +
        '<span class="sbox">' + svg("search") +
          '<input type="search" placeholder="名前・科目・作者で検索" data-search aria-label="プリセットを検索"></span>' +
        '<span class="sel"><select data-sort aria-label="並べ替え">' +
          sorts.map(function (s) { return '<option value="' + s.id + '">' + s.label + "</option>"; }).join("") +
        "</select>" + ms("expand_more") + "</span>" +
        '<button class="fbtn" data-open-filter aria-label="絞り込み">' + ms("tune") + "絞り込み" +
          '<span class="n" data-fcount hidden>0</span></button>' +
        '<span class="seg" role="group" aria-label="表示の切り替え">' +
          '<button class="on" data-view="grid" aria-label="カード表示" aria-pressed="true">' + svg("grid") + "</button>" +
          '<button data-view="list" aria-label="一覧表示" aria-pressed="false">' + svg("list") + "</button></span>" +
      "</div>" +
      '<div class="tabs" role="tablist" data-tabs></div>' +
      '<div class="chips" data-chips></div>' +
      '<div data-sections></div>' +
      '<div class="pgrid" data-grid></div>' +
      '<div class="empty" data-empty hidden></div>' +
      /* 絞り込みのシート（スマホ用。PC では科目チップと並べ替えで足りる） */
      '<div class="sheet" data-sheet><div class="sheet__bg" data-close-filter></div>' +
      '<div class="sheet__p" role="dialog" aria-modal="true" aria-label="絞り込み">' +
      '<div class="sheet__g"></div>' +
      '<div class="sheet__t">科目</div><div class="chips" data-chips2></div>' +
      '<div class="sheet__t">並べ替え</div><div class="chips" data-sorts2></div>' +
      '<button class="resume" style="width:100%;height:44px;margin-top:18px" data-close-filter>この条件で見る</button>' +
      "</div></div>" +
      "</div>";
  }

  /* ── 画面の状態を URL に残す ──────────────────────────────
     戻る・再読み込みで同じタブに戻れるようにする。
     本体も searchParams を使っているので、他の項目は消さない。 */
  var URL_KEYS = { tab: "lib_tab", subject: "lib_subject", sort: "lib_sort", search: "lib_q", view: "lib_view" };
  var urlTimer = 0;
  function syncUrl() {
    clearTimeout(urlTimer);
    urlTimer = setTimeout(function () {
      try {
        var u = new URL(location.href);
        var def = { tab: "all", subject: null, sort: "recommended", search: "", view: "grid" };
        Object.keys(URL_KEYS).forEach(function (k) {
          var v = pstate[k];
          if (!v || v === def[k]) u.searchParams.delete(URL_KEYS[k]);
          else u.searchParams.set(URL_KEYS[k], String(v));
        });
        history.replaceState(null, "", u.pathname + u.search + u.hash);
      } catch (e) {}
    }, 220);
  }
  function readUrl() {
    try {
      var u = new URL(location.href), g = function (k) { return u.searchParams.get(URL_KEYS[k]) || ""; };
      var tab = g("tab");
      if (["all", "mine", "public", "official", "fav"].indexOf(tab) >= 0) pstate.tab = tab;
      var sort = g("sort");
      if (["recommended", "updated", "new", "played", "popular", "count", "name"].indexOf(sort) >= 0) pstate.sort = sort;
      var view = g("view");
      if (view === "list" || view === "grid") pstate.view = view;
      if (g("subject")) pstate.subject = g("subject");
      if (g("search")) pstate.search = g("search");
    } catch (e) {}
  }

  /* 本体のライブラリを開き直させる（一覧はそこが唯一の出どころなので、
     取り直す＝本体に描き直してもらう）。 */
  function loadRemoteOnce() {
    var b = document.querySelector('#appTabBar [data-app-tab="library"]');
    if (b) b.click();
    setTimeout(renderPresets, 400);
    setTimeout(renderPresets, 1600);
  }

  /* ── 描画 ───────────────────────────────────────────────
     データ層（VQ2.library）が読み込まれる前に呼ばれることがある。
     そのときは形だけ置いて、読み込めたら描き直す（空白のまま放置しない）。 */
  var libWait = 0;
  function waitForLib() {
    if (libWait) return;
    libWait = setInterval(function () {
      if (!LIB()) return;
      clearInterval(libWait); libWait = 0;
      if (curScreen === "presets") renderPresets();
    }, 150);
    setTimeout(function () { if (libWait) { clearInterval(libWait); libWait = 0; if (curScreen === "presets") renderPresets(); } }, 9000);
  }

  /* ★ 同期で 降りてきたら **その場で 描き直す**（2026-08-26）。
     VQCLOUD は 前から vq-presets-restored を 投げていたが、
     **受け手が どこにも 無かった**（client 全体で 投げる側 1 か所だけ）。
     そのため 「別の端末で 作った ぶんが 出てこない。再読み込みすれば 出る」
     という 見えかたに なっていた。 */
  /* ★ 解いた ぶんが 変わったら 一覧の 棒を 追いつかせる（2026-09-03・訴え）。
     中断して 戻ったのに 棒が 古いまま、を 起こさない。 */
  try {
    window.addEventListener("vq-quiz-progress", function () {
      /* ★ 棒は **一覧の 札にも ホームの 棚にも** 出る。
         どちらか だけを 描き直すと、もう 片方が 古いまま 残る（実測）。 */
      try { if (typeof renderPresets === "function") renderPresets(); } catch (e) {}
      try { if (typeof renderHome === "function") renderHome(); } catch (e) {}
    });
  } catch (e) {}
  try {
    window.addEventListener("vq-presets-restored", function (e) {
      var 受 = (e && e.detail && e.detail["受けた"]) || [];
      if (!受.length) return;                       /* 何も 変わっていないなら 触らない */
      if (curScreen === "presets") renderPresets();
      else if (curScreen === "home" && typeof renderHome === "function") renderHome();
    });
  } catch (e) {}

  function activeFilterCount() {
    var n = 0;
    if (pstate.subject) n++;
    if (pstate.sort && pstate.sort !== "recommended") n++;
    return n;
  }

  function renderPresets() {
    if (!root) return;
    var gridEl = root.querySelector("[data-grid]");
    var secEl = root.querySelector("[data-sections]");
    var emptyEl = root.querySelector("[data-empty]");
    var warnEl = root.querySelector("[data-warn]");
    var L = LIB();

    if (!L) {
      if (gridEl) { gridEl.hidden = false; gridEl.innerHTML = skeletonHTML(8); }
      if (secEl) secEl.innerHTML = "";
      if (emptyEl) emptyEl.hidden = true;
      waitForLib();
      return;
    }

    var all = buildCards();
    cardRows = all;

    /* 本体ライブラリがまだ描かれていない（＝この端末に何も無いのか、
       まだ来ていないのか）を、勝手に決めない。しばらく待っても来なければ、
       「読み込めていない」と正直に出す（0 件と言い切らない）。 */
    var page = document.getElementById("appLibraryPage");
    if (!all.length && (!page || !page.querySelector(".app-library-item"))) {
      if (!waitStart) waitStart = Date.now();
      var late = Date.now() - waitStart > 6000;
      if (gridEl) { gridEl.hidden = late; gridEl.innerHTML = late ? "" : skeletonHTML(6); }
      if (secEl) secEl.innerHTML = "";
      if (emptyEl) {
        emptyEl.hidden = !late;
        if (late) emptyEl.innerHTML = '<div class="empty__ic">' + ms("cloud_off") + "</div>" +
          '<div class="empty__t">プリセットをまだ読み込めていません</div>' +
          '<div class="empty__d">通信が終わっていないか、ライブラリがまだ開かれていません。</div>' +
          '<button class="chip" data-retry>読み込み直す</button>';
      }
      if (warnEl) warnEl.hidden = true;
      return;
    }
    waitStart = 0;

    /* タブ（件数は実数） */
    var cnt = L.counts(all);
    var tabsEl = root.querySelector("[data-tabs]");
    if (tabsEl) {
      tabsEl.innerHTML = L.TABS.map(function (t) {
        var on = pstate.tab === t.id;
        return '<button class="tab' + (on ? " on" : "") + '" role="tab" aria-selected="' + (on ? "true" : "false")
          + '" data-tab="' + t.id + '">' + esc(t.label)
          + '<span class="tab__c">' + (cnt[t.id] || 0) + "</span></button>";
      }).join("");
    }

    /* 科目（実在するものだけ・日本語で） */
    var subs = [], sseen = {};
    all.forEach(function (c) {
      if (!c.subject) return;
      var lab = L.subjectLabel(c.subject);
      if (!sseen[lab]) { sseen[lab] = 1; subs.push(lab); }
    });
    var chipsHTML = subs.map(function (s) {
      var on = pstate.subject === s;
      return '<button class="chip' + (on ? " on" : "") + '" data-subj="' + esc(s) + '" aria-pressed="'
        + (on ? "true" : "false") + '">' + esc(s) + "</button>";
    }).join("");
    ["[data-chips]", "[data-chips2]"].forEach(function (sel) {
      var e = root.querySelector(sel);
      if (!e) return;
      e.innerHTML = chipsHTML;
      if (sel === "[data-chips]") e.style.display = subs.length ? "" : "none";
    });
    var sorts2 = root.querySelector("[data-sorts2]");
    if (sorts2) {
      sorts2.innerHTML = L.SORTS.map(function (s) {
        var on = pstate.sort === s.id;
        return '<button class="chip' + (on ? " on" : "") + '" data-sortpick="' + s.id + '">' + esc(s.label) + "</button>";
      }).join("");
    }
    var fc = root.querySelector("[data-fcount]");
    if (fc) { var n = activeFilterCount(); fc.textContent = n; fc.hidden = !n; }
    var sortSel = root.querySelector("[data-sort]");
    if (sortSel && sortSel.value !== pstate.sort) sortSel.value = pstate.sort;
    var sbox = root.querySelector("[data-search]");
    if (sbox && root.activeElement !== sbox && sbox.value !== pstate.search) sbox.value = pstate.search;
    root.querySelectorAll(".seg button").forEach(function (v) {
      var on = v.getAttribute("data-view") === pstate.view;
      v.classList.toggle("on", on); v.setAttribute("aria-pressed", on ? "true" : "false");
    });

    /* 絞り込み → 並べ替え */
    var rows = L.sortList(L.applyFilters(all, {
      tab: pstate.tab, search: pstate.search, subject: pstate.subject
    }), pstate.sort);

    /* 「すべて」タブで、絞り込みも並べ替えもしていないときだけ区切りで見せる。
       絞り込んでいるのに区切ると、探しているものが見つけにくい。 */
    var useSections = pstate.tab === "all" && !pstate.search && !pstate.subject
      && pstate.sort === "recommended" && pstate.view === "grid";

    if (gridEl) gridEl.classList.toggle("is-list", pstate.view === "list");

    /* ★ 作りかけは **いちばん 上**へ。絞り込みには かけない
       （まだ 中身が 無いので 科目も 問題数も 無い）。 */
    var 作りかけ = buildingHTML();

    if (useSections && rows.length) {
      var secs = L.sections(rows);
      if (secEl) {
        secEl.innerHTML = secs.map(function (s) {
          return '<section class="psec"><div class="psec__h"><div>' +
            '<h2 class="psec__t">' + esc(s.title) + "</h2>" +
            '<div class="psec__s">' + esc(s.sub) + "</div></div>" +
            '<button class="psec__more" data-tab="' + esc(s.id === "community" ? "public" : s.id) + '">すべて見る</button>' +
            "</div>" +
            '<div class="pgrid">' + s.cards.map(pcHTML).join("") + "</div></section>";
        }).join("");
      }
      if (secEl && 作りかけ) secEl.insertAdjacentHTML("afterbegin",
        '<section class="psec"><div class="psec__h"><div>' +
        '<h2 class="psec__t">作成中</h2><div class="psec__s">クラウドで 作っています</div></div></div>' +
        '<div class="pgrid">' + 作りかけ + "</div></section>");
      if (gridEl) { gridEl.hidden = true; gridEl.innerHTML = ""; }
    } else {
      if (secEl) secEl.innerHTML = "";
      if (gridEl) {
        gridEl.hidden = !rows.length && !作りかけ;
        gridEl.innerHTML = 作りかけ + rows.map(pcHTML).join("");
      }
    }

    /* 空のときは、理由と次の一手を出す */
    if (emptyEl) {
      if (rows.length || 作りかけ) emptyEl.hidden = true;
      else {
        emptyEl.hidden = false;
        emptyEl.innerHTML = emptyHTML(all.length);
      }
    }

    /* 公開プリセットが 1 件も来ていないのに「公開」タブを見ているときは、
       0 件と言い切らずに、まだ来ていない可能性を書く。 */
    if (warnEl) {
      var noPublic = !all.filter(function (c) { return c.kind === "public"; }).length;
      var show = pstate.tab === "public" && noPublic;
      warnEl.hidden = !show;
      if (show) {
        warnEl.innerHTML = ms("cloud_off") +
          "<span>公開プリセットがまだ届いていません。ログインしていないか、通信が終わっていない可能性があります。</span>" +
          '<button data-retry>読み込み直す</button>';
      }
    }
  }
  var waitStart = 0;

  function emptyHTML(total) {
    if (!total) {
      return '<div class="empty__ic">' + ms("library_books") + "</div>" +
        '<div class="empty__t">まだプリセットがありません</div>' +
        '<div class="empty__d">クイズを作るか、公式プリセットを開くとここに並びます。</div>' +
        '<button class="resume" data-bridge-action="create-quiz">' + svg("sparkle") + "クイズを作成</button>";
    }
    var what = pstate.tab === "fav" ? "お気に入りに入れたプリセット"
      : pstate.tab === "mine" ? "自分で作ったプリセット"
      : pstate.tab === "official" ? "公式プリセット"
      : pstate.tab === "public" ? "公開されているプリセット" : "条件に合うプリセット";
    return '<div class="empty__ic">' + ms("search_off") + "</div>" +
      '<div class="empty__t">' + esc(what) + "は見つかりませんでした</div>" +
      '<div class="empty__d">検索の言葉を短くするか、科目の絞り込みを外してみてください。</div>' +
      '<button class="chip" data-clear-filter>絞り込みを外す</button>';
  }

  var root, host, curScreen = null;

  function build() {
    if (!document.body) { document.addEventListener("DOMContentLoaded", build); return; }
    if (document.getElementById("vqScreens")) return;

    var ls = document.createElement("style"); ls.id = "vqScreensHostStyle";
    ls.textContent = "#vqScreens{position:fixed;top:0;right:0;bottom:0;z-index:40;display:none;overscroll-behavior:none;}" +
      /* 表紙の代わりに使う色の明るさ。影の DOM の中からは html を選べないので、
         ここ（本文側）で決めて、変数として中へ渡す。 */
      "#vqScreens{--lib-l1:90%;--lib-l2:96%;--lib-l3:76%;}" +
      "html[data-theme-mode=\"dark\"] #vqScreens{--lib-l1:26%;--lib-l2:19%;--lib-l3:36%;}" +
      "@media (prefers-color-scheme:dark){html[data-theme-mode=\"auto\"] #vqScreens{--lib-l1:26%;--lib-l2:19%;--lib-l3:36%;}}" +
      /* 右下に浮いていた「＋」（プリセットエンジンの入口）は、新 UI では出さない。
         新しい画面に「クイズを作成」が常にあるので二重になり、
         しかも z-index が上なので画面の上に重なってしまう。 */
      "body[data-ui-v2=\"1\"] #appFeedFab{display:none !important;}" +
      "body[data-ui-v2=\"1\"].vqscr-on #vqScreens{display:block;}" +
      /* この画面が出ているあいだは、**中身は #vqScreens の .scroll が巻く**。
         うしろのページまで一緒に動くと、見えないところが動いて
         「上まで戻れない／上が見えない」ように感じる。うしろは止める。 */
      "body[data-ui-v2=\"1\"].vqscr-on{overflow:hidden !important;height:100% !important;}" +
      "html:has(body[data-ui-v2=\"1\"].vqscr-on){overflow:hidden !important;height:100% !important;}" +
      /* 新画面を出している間は旧ホーム/旧ライブラリを完全に不可視化（＝どうスクロールしても出てこない）。
         display:none ではなく visibility:hidden なのが要点: レイアウト/JSは生き続けるので、
         新UIが値を読み取り・実ボタンを .click() するブリッジは従来どおり動作する。 */
      "body[data-ui-v2=\"1\"].vqscr-on[data-app-tab=\"home\"] #viewTitle," +
      "body[data-ui-v2=\"1\"].vqscr-on[data-app-tab=\"library\"] #appLibraryPage{visibility:hidden !important;}" +
      /* クイズ / 結果 / 入れ替え の最中は、この覆いを必ず外す。
         setView("QUIZ") は data-app-tab を "home" に戻すので、
         ここを見ないと **問題の上にホーム画面が乗って操作できなくなる**。 */
      "body.quiz-focus #vqScreens,body.result-focus #vqScreens," +
      "body.switch-focus #vqScreens{display:none !important;}" +
      /* 覆いを外したぶん、旧画面は見えるようにしておく */
      "body.quiz-focus #viewTitle,body.result-focus #viewTitle," +
      "body.switch-focus #viewTitle{visibility:visible !important;}";
    document.head.appendChild(ls);

    readUrl();
    host = document.createElement("div"); host.id = "vqScreens";
    root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    var st = document.createElement("style"); st.textContent = CSS; root.appendChild(st);
    var scroll = document.createElement("div"); scroll.className = "scroll";
    scroll.innerHTML = '<div class="wrap">' + homeHTML() + presetsHTML() + '</div>';
    root.appendChild(scroll);
    document.body.appendChild(host);

    place();
    /* リサイズ直後はアプリ側のタブバー再配置が終わっていないことがあるので遅延でも測り直す */
    var replace2 = function () { place(); setTimeout(place, 120); setTimeout(place, 400); };
    window.addEventListener("resize", replace2);
    window.addEventListener("orientationchange", replace2);
    try { new ResizeObserver(place).observe(document.getElementById("appTabBar") || document.body); } catch (e) {}

    /* クリック → ブリッジ */
    /* ★ ここに 名前が 無い 目印は、押しても **何も 起きない**。
       examStart / examOpen を 足し忘れて、試験の カードが 無反応だった。 */
    var HOOKS = ["click", "home", "bridgeAction", "navTab", "presetStart", "presetSelect", "fav",
                 "examStart", "examOpen",
                 /* ★ 足し忘れると **押しても 何も 起きない**（2026-09-01 に また やった）。
                    新しい 目印を 作ったら **必ず ここへ**。 */
                 "rail", "newsOpen", "calopen", "lumi",
                 "subj", "tab", "view", "sortpick", "openFilter", "closeFilter", "clearFilter", "retry",
                 "cancelgen"];
    function hookedEl(target) {
      var el = target;
      while (el && el !== root) {
        if (el.dataset) {
          for (var i = 0; i < HOOKS.length; i++) if (el.dataset[HOOKS[i]] != null) return el;
        }
        el = el.parentNode;
      }
      return null;
    }
    root.addEventListener("click", function (e) {
      var el = hookedEl(e.target);
      if (!el) return;
      var d = el.dataset;
      if (d.navTab) { var nb = document.querySelector('#appTabBar [data-app-tab="' + d.navTab + '"]'); if (nb) nb.click(); }
      else if (d.examStart != null) { e.stopPropagation(); 受験へ(d.examStart); }
      else if (d.examOpen != null) { e.stopPropagation(); 試験の詳細へ(d.examOpen); }
      else if (d.presetStart != null) { e.stopPropagation(); presetStart(d.presetStart); }
      else if (d.fav != null) {
        e.stopPropagation();
        /* カードそのものを渡す（公開かどうか・持ち主が分かるのはこちらだけ）。 */
        toggleFav(d.fav, cardById(d.fav));
        renderPresets();
      }
      else if (d.presetSelect != null) { presetSelect(d.presetSelect); renderPresets(); }
      else if (d.click) click(d.click);
      else if (d.rail != null) {
        /* ★ 矢印。**1 枚ぶんでは なく 見えている 幅の 8 割**ずつ 送る。
           1 枚ずつだと 何回も 押す ことに なり、丸ごと 1 画面だと 見失う。 */
        e.stopPropagation();
        var 割 = String(d.rail).split(":");
        var 棚 = root.querySelector(割[0] === "news" ? "[data-home-news]" : "[data-home-rec]");
        if (棚) 棚.scrollBy({ left: Math.round(棚.clientWidth * 0.8) * (割[1] === "-1" ? -1 : 1), behavior: "smooth" });
      }
      else if (d.lumi != null) {
        /* ══ ★ Lumi が 置いた 手（2026-09-01・訴え「ボタンとかも ルミが
           勝手に 置いたり できる ように」）════════════════════════════
           ★ 置けるのは **こちらが 用意した 型の 中だけ**。
             自由な コードは 書かせない（何が 起きるか 分からない ものを
             画面に 置かない）。型ごとの 行き先は ここで 決める。 */
        e.stopPropagation();
        var 型 = String(d.lumi || ""), 引 = String(d.lumiarg || "");
        if (型 === "refresh") { ひとことを頼む(true); return; }
        try { if (window.__vqTrace) window.__vqTrace.記す("lumi", 型, { v: 引 }); } catch (e4) {}
        if (型 === "make_preset") {
          var 開けた = false;
          try {
            if (window.VQ2 && window.VQ2.presetStudio && window.VQ2.presetStudio.open) {
              window.VQ2.presetStudio.open({ prompt: 引, draft: 引 });
              開けた = true;
            }
          } catch (e5) {}
          if (!開けた) { try { if (window.__vqMake) window.__vqMake.open({ kind: "preset" }); } catch (e6) {} }
          return;
        }
        if (型 === "review") {
          var b3 = document.getElementById("homeResumeBtn");
          if (b3 && !b3.disabled) { b3.click(); return; }
          var nb2 = document.querySelector('#appTabBar [data-app-tab="library"]');
          if (nb2) nb2.click();
          return;
        }
        if (型 === "open_preset") { if (引) presetStart(引); return; }
        if (型 === "open_tab") {
          var nb3 = document.querySelector('#appTabBar [data-app-tab="' + 引 + '"]');
          if (nb3) nb3.click();
          return;
        }
        if (型 === "open_help") {
          try { if (window.__vqHelp) window.__vqHelp.open(引 ? { id: 引 } : {}); } catch (e7) {}
          return;
        }
        return;
      }
      else if (d.calopen != null) {
        e.stopPropagation();
        try {
          if (window.__vqCalendar && window.__vqCalendar.open) { window.__vqCalendar.open(); return; }
        } catch (e3) {}
      }
      else if (d.newsOpen != null) {
        e.stopPropagation();
        /* お知らせを 開く。お知らせの 画面が あれば そこへ、無ければ タブへ。 */
        var 開けた = false;
        try {
          if (typeof window.__vqOpenNews === "function") { window.__vqOpenNews(d.newsOpen); 開けた = true; }
          else if (window.__vqNews && window.__vqNews.open) { window.__vqNews.open(d.newsOpen); 開けた = true; }
        } catch (e2) {}
        if (!開けた) {
          var nb = document.querySelector('#appTabBar [data-app-tab="news"]');
          if (nb) nb.click();
        }
      }
      else if (d.home) homeAction(d.home);
      else if (d.bridgeAction) { var b = document.querySelector('#appTabBar [data-v2-action="' + d.bridgeAction + '"]'); if (b) b.click(); }
      else if (d.subj != null) { pstate.subject = (pstate.subject === d.subj) ? null : d.subj; syncUrl(); renderPresets(); }
      else if (d.tab != null) { pstate.tab = d.tab; syncUrl(); renderPresets(); scrollTop(); }
      else if (d.sortpick != null) { pstate.sort = d.sortpick; syncUrl(); renderPresets(); }
      else if (d.openFilter != null) { setSheet(true); }
      else if (d.closeFilter != null) { setSheet(false); }
      else if (d.clearFilter != null) {
        pstate.subject = null; pstate.search = ""; pstate.sort = "recommended";
        var sb = root.querySelector("[data-search]"); if (sb) sb.value = "";
        syncUrl(); renderPresets();
      }
      else if (d.retry != null) { loadRemoteOnce(true); }
      else if (d.cancelgen != null) {
        try {
          var G = window.__vqCloudGen;
          if (G && G.cancel) G.cancel(String(d.cancelgen)).then(function () { renderPresets(); });
        } catch (e2) {}
      }
      else if (d.view != null) {
        pstate.view = d.view;
        root.querySelectorAll(".seg button").forEach(function (v) {
          var on = v === el; v.classList.toggle("on", on); v.setAttribute("aria-pressed", on ? "true" : "false");
        });
        syncUrl(); renderPresets();
      }
    });
    /* カードはキーボードでも開ける */
    root.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var t = e.composedPath ? e.composedPath()[0] : e.target;
      var card = t;
      while (card && card !== root
        && !(card.dataset && (card.dataset.presetSelect != null || card.dataset.examOpen != null))) card = card.parentNode;
      if (!card || card === root) return;
      if (t !== card) return;     /* 中のボタンは、そのボタン自身が受ける */
      e.preventDefault();
      if (card.dataset.examOpen != null) 試験の詳細へ(card.dataset.examOpen);
      else presetSelect(card.dataset.presetSelect);
    });
    /* 検索（打つたびに全部描き直さない） */
    var searchTimer = 0;
    root.addEventListener("input", function (e) {
      var t = e.target;
      if (!t.dataset) return;
      if (t.dataset.search != null) {
        pstate.search = (t.value || "").trim();
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () { syncUrl(); renderPresets(); }, 140);
      }
    });
    root.addEventListener("change", function (e) {
      var t = e.target;
      if (t.dataset && t.dataset.sort != null) { pstate.sort = t.value; syncUrl(); renderPresets(); }
    });
    function setSheet(on) {
      var s = root.querySelector("[data-sheet]");
      if (s) s.classList.toggle("on", !!on);
    }
    function scrollTop() { var sc = root.querySelector(".scroll"); if (sc) sc.scrollTop = 0; }

    /* 値の鏡写し（Home） */
    var mirrors = root.querySelectorAll("[data-mirror]");
    var chips2 = root.querySelectorAll("[data-active-src]");
    function sync() {
      for (var i = 0; i < mirrors.length; i++) { var src = document.getElementById(mirrors[i].getAttribute("data-mirror")); if (src) { var t = (src.textContent || "").trim(); if (t) mirrors[i].textContent = t; } }
      for (var j = 0; j < chips2.length; j++) { var b = document.getElementById(chips2[j].getAttribute("data-active-src")); var on = b && (b.classList.contains("active") || b.getAttribute("aria-selected") === "true"); chips2[j].classList.toggle("is-active", !!on); }
    }
    sync();
    /* ホーム表示中はセッション/AI挨拶の更新に追随（クイズ終了後の値反映） */
    setInterval(function () { if (curScreen === "home") renderHome(); }, 10000);
    try {
      var aiMo = new MutationObserver(function () { if (curScreen === "home") renderHome(); });
      var aiEl0 = document.getElementById("appHomeAiGreeting");
      if (aiEl0) aiMo.observe(aiEl0, { childList: true, characterData: true, subtree: true });
    } catch (e) {}
    try {
      var mo = new MutationObserver(sync), watch = {};
      for (var k = 0; k < mirrors.length; k++) watch[mirrors[k].getAttribute("data-mirror")] = 1;
      for (var m = 0; m < chips2.length; m++) watch[chips2[m].getAttribute("data-active-src")] = 1;
      Object.keys(watch).forEach(function (id) { var e = document.getElementById(id); if (e) mo.observe(e, { childList: true, characterData: true, subtree: true, attributes: true }); });
    } catch (e) {}
    setInterval(sync, 1500);

    /* モバイル トップバーの検索 → プリセット画面へ遷移して絞り込み */
    window.__vqPresetSearch = function (q) {
      pstate.search = String(q || "").trim();
      if (document.body.getAttribute("data-app-tab") !== "library") {
        var b = document.querySelector('#appTabBar [data-app-tab="library"]');
        if (b) b.click();
      }
      var box = root.querySelector("[data-search]"); if (box) box.value = pstate.search;
      syncUrl();
      renderPresets();
    };

    /* body[data-app-tab] を監視して 表示画面を切替（home / library）。それ以外は非表示 */
    /* いま何を出しているか。**変わっていないときは何もしない**。
       この関数は body の class を書き換えるので、class を見張ったまま
       毎回走らせると自分の書き換えでまた呼ばれ、止まらなくなる（実際に固まった）。 */
    var routeKey = null;
    function route() {
      var tab = document.body.getAttribute("data-app-tab") || "home";
      /* クイズ・結果・入れ替えの最中は出さない（上に乗せない）。
         setView() が data-app-tab を "home" に戻すため、タブだけでは見分けられない。 */
      var busy = document.body.classList.contains("quiz-focus")
        || document.body.classList.contains("result-focus")
        || document.body.classList.contains("switch-focus");
      var target = busy ? null : (tab === "home" ? "home" : tab === "library" ? "presets" : null);
      if (target === routeKey) return;
      routeKey = target;
      if (target) {
        if (!document.body.classList.contains("vqscr-on")) document.body.classList.add("vqscr-on");
        if (curScreen !== target) {
          curScreen = target;
          root.querySelectorAll(".screen").forEach(function (s) { s.classList.toggle("on", s.getAttribute("data-screen") === target); });
          var wr = root.querySelector(".wrap"); if (wr) wr.classList.toggle("wide", target === "presets");
          var sc = root.querySelector(".scroll"); if (sc) sc.scrollTop = 0;
        }
        if (target === "presets") {
          renderPresets();
          /* 実ライブラリの描画/公式プリセットの非同期取得に追随して再描画 */
          setTimeout(renderPresets, 300);
          setTimeout(renderPresets, 1200);
        } else if (target === "home") {
          renderHome();
          /* AI挨拶(非同期)・ライブラリ描画の後追いで再描画 */
          setTimeout(renderHome, 400);
          setTimeout(renderHome, 1500);
          setTimeout(renderHome, 4000);
        }
      } else {
        if (document.body.classList.contains("vqscr-on")) document.body.classList.remove("vqscr-on");
        curScreen = null;
      }
    }
    route();
    try {
      new MutationObserver(route).observe(document.body,
        { attributes: true, attributeFilter: ["data-app-tab", "data-ui-v2", "class"] });
    } catch (e) {}

    /* クラウドの 作りかけが 動いたら 描き直す（本体が 知らせてくる） */
    try {
      window.addEventListener("vq:cloudgen", function () { if (curScreen === "presets") renderPresets(); });
    } catch (e) {}

    /* 実ライブラリのリスト更新（自作追加/削除・公式到着）を監視して Presets を再描画 */
    try {
      var libMo = new MutationObserver(function () { if (curScreen === "presets") renderPresets(); });
      ["appLibraryBuiltinList", "appLibraryMyList"].forEach(function (id) {
        var lst = document.getElementById(id); if (lst) libMo.observe(lst, { childList: true, subtree: true });
      });
    } catch (e) {}
  }

  /* 配置: PC=旧サイドバー右端の外側 / モバイル=全幅＋下部タブバー分をあける */
  function place() {
    if (!host) return;
    var bar = document.getElementById("appTabBar");
    var vw = window.innerWidth || document.documentElement.clientWidth || 0;
    var r = bar ? bar.getBoundingClientRect() : null;
    /* 縦サイドバーは 880px 以上（shell.js と同じ境界）。それ未満は下部タブバー＝モバイル */
    if (vw >= 880) {
      /* サイドバー実測。取れない時(非表示計測など)は既定 332px を維持 */
      var left = (r && r.width > 40 && r.width < vw * 0.6) ? Math.round(r.right + 16) : 332;
      host.style.left = left + "px";
      host.style.top = "0px";
      host.style.bottom = "0px";
      host.style.setProperty("--vqs-pt", "0px");
      host.style.setProperty("--vqs-pb", "0px");
      host.style.setProperty("--vqs-pbc", "64px");   /* PC は もとの 余白 */
      host.style.boxShadow = "none";     /* PCは左サイドバーを覆わないよう延長なし */
    } else {
      /* モバイルは常に全画面を覆う（隙間から旧UIが覗かないように）。
         上下バーは #vqScreens(z40) より前面(z900 / z9990)に描画されるので、
         位置ではなく"内側の余白"で被りを避ける。 */
      host.style.left = "0px";
      host.style.top = "0px";
      host.style.bottom = "0px";
      var tb = document.getElementById("vqTopbar");
      var th = tb ? Math.round(tb.getBoundingClientRect().height) : 0;
      /* 下部バーは新バー(#vqMobBar)。未生成なら旧バーで代替計測 */
      var mb = document.getElementById("vqMobBar") || document.getElementById("appMobileBottomBar");
      /* 7/27 の形に戻す。iOS が上下を確保する構成なので、
         ここで安全領域を足し引きする必要がない。 */
      var mh = 0;
      if (mb) {
        var mr = mb.getBoundingClientRect();
        if (mr.height > 0 && mr.height < 200 && getComputedStyle(mb).display !== "none") mh = Math.round(mr.height);
      }
      if (!mh) mh = 64;
      /* ★ 上は 空けない（2026-09-04）。
         訴え「まだ 時計まで 上端が 達してない。ホーム画面も プリセットも」。
         この 2 つだけ 上のピル(58px)ぶんを 空けて いて、他の 画面（main）は
         webview の 上端から 中身が 始まる。その 差が「達して いない」に
         見えて いた。
         → 中身を 上端から 描く。浮いている ピルは **半透明**なので、
           その 裏を 中身が 通って 透ける（LINE と 同じ 形）。
           一番上まで 戻した ときは 先頭が ピルに かかるが、
           指で 少し 下げれば 読める。 */
      host.style.setProperty("--vqs-pt", "0px");
      host.style.setProperty("--vqs-pb", mh + "px");
      /* ★ 中身の 下余白は **浮いた 島の 下端**まで（2026-09-04）。
         器（#vqMobBar）は 画面の 下端まで あるが、見えて いる 島は
         その 中で 浮いて いる。器の 高さ ぶん 空けると
         島の 下にも 中身が 無い 帯が でき、そこだけ 隙間に 見える。 */
      var 島の下 = 0;
      try {
        var 島 = mb && mb.shadowRoot ? mb.shadowRoot.querySelector(".bar") : null;
        if (島) {
          var br2 = 島.getBoundingClientRect();
          if (br2.height > 0) 島の下 = Math.max(0, Math.round(window.innerHeight - br2.bottom));
        }
      } catch (e) {}
      /* 島が 測れない ときは これまでどおり（器の 高さ ＋ 28px）に 落とす */
      host.style.setProperty("--vqs-pbc", (島の下 > 0 ? 島の下 : (28 + mh)) + "px");
      /* iOSのラバーバンド(引っ張り戻し)対策: 背景を画面外まで延長しておき、
         端で跳ねても旧UIではなく新UIの背景が見えるようにする。レイアウトには影響しない。 */
      host.style.boxShadow = "0 0 0 600px var(--vq-bg-canvas,#F7F6FB)";
    }
  }

  /* ══ 外から 呼べる 口（2026-09-01）══════════════════════════════════
     試験の 詳細（vq-examdetail）から 受験へ 行き、公開の あとに
     一覧の 札を 塗り直す ため。**一覧の 描きかたは ここに 1 つだけ**に する
     （あちらで 数え直すと、いつか 食い違う）。 */
  window.__vqScreens = window.__vqScreens || {};
  window.__vqScreens.受験へ = 受験へ;
  /* ★ ホームの 棚を 出す／切る（2026-09-01・設定 display.homeRails）。
     ★ 設定は html に 印を 付けるが、**影の DOM の 中の CSS には 届かない**
       （:host-context は 端末に よって 効かない）。だから **自分で** 付ける。 */
  window.__vqScreens.棚を出す = function (on) {
    try { if (root) root.querySelectorAll(".rail-card").forEach(function (c) {
      c.style.display = (on === false) ? "none" : "";
    }); } catch (e) {}
    棚を出すか = (on !== false);
  };
  window.__vqScreens.描き直す = function () {
    try { 試験の控え = null; } catch (e) {}
    try { renderPresets(); } catch (e) {}
    /* ★ ホームも 描き直す（2026-09-01）。一覧だけ 描き直して いた ので、
       設定を 変えても ホームの 目あてが 出なかった（実測）。 */
    try { if (curScreen === "home") renderHome(); } catch (e) {}
  };

  build();
})();

