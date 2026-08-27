/* ══════════════════════════════════════════════════════════════════════
   プリセット・ライブラリのデータ層（V3）
   ・一覧と詳細が使う「1 枚のカードに必要な情報」を、ここで 1 つの形にそろえる。
   ・出どころは 3 つ。混ぜない。
       ① 自分のプリセット   … この端末の保存（V2 / これまでの V1）
       ② 公開プリセット     … サーバの /api/public/presets（作者つき）
       ③ 公式プリセット     … サーバの /api/official-presets（公式の表から）
   ・**公式かどうかを名前や作者名から推測しない。** 出どころだけで決める。
   ・「自分のものか」と「公式か」は別の話。自分が公開したものは
     自分のプリセットでもあり、公開プリセットでもある。
   ・バナーもアイコンも無いプリセットが大半なので、
     **絵を作らずに** 崩れない代わりの見た目（色と模様）をここで決める。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var Q = VQ2.qtypes;

  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function isObj(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function str(v) { return v === undefined || v === null ? "" : String(v); }

  var DAY = 86400000;
  var NEW_DAYS = 7;

  /* ══════════════════════════════════════════════════════════════════
     1) 画像の安全確認
     ・data: の画像（端末の中で取り込んだもの）と http(s) だけ通す。
     ・javascript: などは通さない。壊れた画像も出さない。
     ══════════════════════════════════════════════════════════════════ */
  function safeImage(v) {
    var s = str(v).trim();
    if (!s) return "";
    var low = s.toLowerCase();
    if (low.indexOf("data:image/") === 0) return s;
    if (/^https?:\/\//.test(low)) return s;
    if (low.indexOf("blob:") === 0) return s;
    return "";
  }

  /* ══════════════════════════════════════════════════════════════════
     2) 代わりの見た目（バナー・アイコンが無いとき）
     ・絵は作らない。科目の色と、控えめな模様だけ。
     ・同じプリセットには必ず同じ色が出る（ID から決める）。
     ══════════════════════════════════════════════════════════════════ */
  var SUBJECT_TONE = {
    english:  { hue: 214, label: "英語", pattern: "lines" },
    japanese: { hue: 348, label: "国語", pattern: "paper" },
    math:     { hue: 262, label: "数学", pattern: "grid" },
    science:  { hue: 168, label: "理科", pattern: "dots" },
    social:   { hue: 32,  label: "社会", pattern: "paper" },
    info:     { hue: 196, label: "情報", pattern: "grid" },
    other:    { hue: 250, label: "その他", pattern: "plain" }
  };
  /* 表示名から科目の当たりを付ける。当たらなければ other。
     ここで決めるのは色と模様だけなので、外れても害はない。 */
  var SUBJECT_ID = {
    "sub:english": "英語", "sub:japanese": "国語", "sub:math": "数学",
    "sub:science": "理科", "sub:social": "社会", "sub:info": "情報", "sub:other": "その他"
  };
  function subjectKey(subject) {
    var s = str(subject);
    if (SUBJECT_ID[s]) s = SUBJECT_ID[s];
    if (!s) return "other";
    if (/英語|english|eiken|英検/i.test(s)) return "english";
    if (/国語|現代文|古文|漢文|japanese/i.test(s)) return "japanese";
    if (/数学|算数|math/i.test(s)) return "math";
    if (/理科|物理|化学|生物|地学|science/i.test(s)) return "science";
    if (/社会|日本史|世界史|地理|公民|公共|政治|経済|history|social/i.test(s)) return "social";
    if (/情報|プログラ|info/i.test(s)) return "info";
    return "other";
  }
  function hashOf(s) {
    var h = 0, t = str(s);
    for (var i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
    return h;
  }
  /* 代わりのバナー。CSS の値だけを返す（画像を作らない）。 */
  function fallbackBanner(card) {
    var key = subjectKey(card.subject);
    var tone = SUBJECT_TONE[key] || SUBJECT_TONE.other;
    var h = tone.hue + (hashOf(card.id) % 18) - 9;
    return {
      subject: key,
      pattern: tone.pattern,
      hue: h,
      /* 明るさは CSS 側でテーマに合わせる。ここでは色相だけ渡す。 */
      style: "--lib-hue:" + h + ";"
    };
  }
  /* 画面に出す科目名。内部の ID（sub:english）は出さない。 */
  function subjectLabel(subject) {
    var s = str(subject);
    if (SUBJECT_ID[s]) return SUBJECT_ID[s];
    if (s) return s;
    var t = SUBJECT_TONE[subjectKey(s)];
    return t ? t.label : "その他";
  }

  /* ══════════════════════════════════════════════════════════════════
     3) 問題形式の内訳を、人が読める言葉にする
     ・内部の ID（summarize / choice_many）をそのまま見せない。
     ══════════════════════════════════════════════════════════════════ */
  function typeCounts(questions) {
    var m = Object.create(null);
    arr(questions).forEach(function (q) {
      if (!q) return;
      var t = str(q.type) || "unknown";
      m[t] = (m[t] || 0) + 1;
      /* 複合大問は小問も数える（「大問 1 問」だけでは中身が分からない）。 */
      arr(q.children).forEach(function (c) {
        var ct = str(c && c.type) || "unknown";
        m[ct] = (m[ct] || 0) + 1;
      });
    });
    return m;
  }
  function typeLabel(id) {
    if (Q && Q.get && Q.get(id)) return Q.shortLabel(id);
    return str(id) || "その他";
  }
  /* 一覧のカード用。3 つまで並べ、それ以上は「ほか N 種類」。 */
  function typeSummary(counts, max) {
    var keys = Object.keys(counts || {});
    if (!keys.length) return "";
    keys.sort(function (a, b) { return counts[b] - counts[a]; });
    var n = isNum(max) ? max : 3;
    var head = keys.slice(0, n).map(typeLabel);
    if (keys.length > n) head.push("ほか " + (keys.length - n) + " 種類");
    return head.join("・");
  }
  /* 詳細用。1 行ずつ、日本語の名前と問題数。 */
  function typeBreakdown(counts) {
    var keys = Object.keys(counts || {});
    keys.sort(function (a, b) { return counts[b] - counts[a]; });
    var total = keys.reduce(function (a, k) { return a + counts[k]; }, 0) || 1;
    return keys.map(function (k) {
      return { type: k, label: typeLabel(k), count: counts[k],
               ratio: Math.round((counts[k] / total) * 100) };
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     4) 1 枚のカードの形
     ══════════════════════════════════════════════════════════════════ */
  function emptyCard() {
    return {
      id: "", title: "", description: "",
      ownerId: "", ownerName: "", ownerHandle: "", ownerAvatarUrl: "",
      origin: "user",            /* user | official */
      visibility: "private",     /* private | unlisted | public */
      status: "published",       /* draft | published | archived */
      isOfficial: false,
      officialPublisher: "",
      bannerUrl: "", iconUrl: "", iconText: "", accentColor: "",
      subject: "", unit: "", grade: "", difficulty: null, estimatedMinutes: null,
      questionCount: 0, questionTypeCounts: null, tags: [],
      favoriteCount: null, playCount: null, completionCount: null,
      isOwnedByCurrentUser: false, isFavoritedByCurrentUser: false, isSavedByCurrentUser: false,
      createdAt: "", updatedAt: "", lastPlayedAt: "", publishedAt: "",
      source: "local",           /* local | legacy | public | official | app */
      canEdit: false, canDelete: false, canPublish: false, canFork: true, canReport: false,
      /* 本体ライブラリ（DOM）から来たときだけ入るもの */
      kind: "", officialKind: "", countUnit: "問", updatedLabel: "", actions: [], hasDetail: false,
      raw: null
    };
  }

  function toIso(v) {
    if (!v) return "";
    if (typeof v === "number") { try { return new Date(v).toISOString(); } catch (e) { return ""; } }
    var s = str(v);
    if (!s) return "";
    var d = new Date(s);
    return isNaN(d.getTime()) ? "" : d.toISOString();
  }
  function timeOf(iso) {
    if (!iso) return 0;
    var d = new Date(iso);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }

  /* ── ① 自分のプリセット（この端末の保存） ─────────────────── */
  function fromLocal(p, ctx) {
    var c = emptyCard();
    var a = (p && p.appearance) || {};
    c.id = str(p.id);
    c.title = str(p.name) || "（名称なし）";
    c.description = str(p.description);
    c.ownerId = str(p.ownerId) || str(ctx.me);
    c.ownerName = "自分";
    c.origin = "user";
    c.isOfficial = false;
    c.visibility = ["private", "unlisted", "public"].indexOf(str(p.visibility)) >= 0 ? str(p.visibility) : "private";
    c.status = arr(p.questions).length ? "published" : "draft";
    c.bannerUrl = safeImage(a.banner);
    c.iconUrl = safeImage(a.iconImage);
    c.iconText = str(a.icon);
    c.subject = str((p.subjects || [])[0] || p.subjectId || "");
    c.tags = arr(p.tags).map(str).slice(0, 12);
    c.questionCount = arr(p.questions).length;
    c.questionTypeCounts = typeCounts(p.questions);
    c.estimatedMinutes = estimateMinutes(p.questions);
    c.createdAt = toIso(p.createdAt);
    c.updatedAt = toIso(p.updatedAt) || c.createdAt;
    c.source = p.__source === "legacy" ? "legacy" : "local";
    c.isOwnedByCurrentUser = true;
    c.canEdit = true; c.canDelete = true; c.canPublish = true; c.canFork = true;
    c.raw = p;
    return c;
  }

  /* ── ② 公開プリセット（サーバ。作者つき） ─────────────────── */
  function fromPublic(p, ctx) {
    var c = emptyCard();
    c.id = str(p.presetId || p.id);
    c.title = str(p.publicTitle || p.name) || "（名称なし）";
    c.description = str(p.description);
    c.ownerId = str(p.userId || p.ownerId);
    c.ownerName = str(p.displayName || p.nickname || p.ownerName) || "名前のない人";
    c.ownerHandle = str(p.handle || p.ownerHandle);
    c.ownerAvatarUrl = safeImage(p.avatarUrl || p.ownerAvatarUrl);
    c.origin = "user";
    c.isOfficial = false;
    c.visibility = "public";
    c.status = "published";
    c.bannerUrl = safeImage(p.bannerUrl || p.banner);
    c.iconUrl = safeImage(p.iconUrl || p.publicIconUrl);
    c.iconText = str(p.publicIcon || p.icon);
    c.accentColor = str(p.publicIconColor || p.accentColor);
    c.subject = str(p.subjectLabel || p.subjectId || p.subject);
    c.tags = arr(p.tags || p.tagIds).map(str).slice(0, 12);
    c.questionCount = isNum(p.questionCount) ? p.questionCount
      : (isNum(p.itemCount) ? p.itemCount : arr(p.cards).length);
    c.questionTypeCounts = isObj(p.questionTypeCounts) ? p.questionTypeCounts : null;
    c.favoriteCount = isNum(p.favoriteCount) ? p.favoriteCount : null;
    c.playCount = isNum(p.playCount) ? p.playCount : null;
    c.createdAt = toIso(p.createdAt);
    c.updatedAt = toIso(p.updatedAt) || c.createdAt;
    c.publishedAt = toIso(p.publishedAt);
    c.source = "public";
    /* 自分が公開したものは、公開プリセットでもあり自分のものでもある。 */
    c.isOwnedByCurrentUser = !!(ctx.myUserId && String(ctx.myUserId) === String(c.ownerId));
    c.canEdit = false;        /* 一覧からは直接編集しない（自分のものは自分の側で編集する） */
    c.canDelete = false;
    c.canFork = true;
    c.canReport = !c.isOwnedByCurrentUser;
    c.raw = p;
    return c;
  }

  /* ── ③ 公式プリセット（サーバの公式の表） ────────────────── */
  function fromOfficial(p) {
    var c = emptyCard();
    c.id = str(p.id);
    c.title = str(p.name) || "（名称なし）";
    c.description = str(p.description);
    c.ownerId = "official";
    c.ownerName = "VocabuQuiz公式";
    c.origin = "official";
    c.isOfficial = true;                 /* 出どころが公式の表。名前からは決めない。 */
    c.officialPublisher = str(p.publisher || p.series || "VocabuQuiz");
    c.visibility = "public";
    c.status = "published";
    c.bannerUrl = safeImage(p.bannerUrl || p.banner);
    c.iconUrl = safeImage(p.iconUrl);
    c.subject = str(p.subjectLabel || p.subjectId || "");
    c.unit = str(p.series ? p.series + (p.week ? " 第" + p.week + "回" : "") : "");
    c.questionCount = isNum(p.wordCount) ? p.wordCount : arr(p.words).length;
    c.createdAt = toIso(p.createdAt || p.deliveredAt);
    c.updatedAt = toIso(p.updatedAt || p.deliveredAt) || c.createdAt;
    c.publishedAt = toIso(p.deliveredAt);
    c.source = "official";
    c.isOwnedByCurrentUser = false;
    c.canEdit = false; c.canDelete = false; c.canFork = true; c.canReport = false;
    c.raw = p;
    return c;
  }

  /* ── ④ この端末に実際に並んでいるもの（本体ライブラリの写し） ──────
     開始・編集・削除は本体のボタンへ橋渡しするので、ここに出ているものだけが
     「いま本当に始められるもの」。種別は本体が付けた印（data-kind）をそのまま使う。
     **名前や作者名からは決めない。** */
  var DOM_KIND = {
    official: { origin: "official", isOfficial: true, owner: "VocabuQuiz公式", note: "配信" },
    builtin:  { origin: "official", isOfficial: true, owner: "VocabuQuiz公式", note: "収録" },
    mine:     { origin: "user", isOfficial: false, owner: "自分", note: "" },
    "public": { origin: "user", isOfficial: false, owner: "", note: "" }
  };
  function fromScraped(x, ctx) {
    ctx = ctx || {};
    var kind = str(x && x.kind);
    var k = DOM_KIND[kind] || DOM_KIND.mine;
    var c = emptyCard();
    c.id = str(x.id);
    c.title = str(x.title) || "（名称なし）";
    c.description = str(x.description);
    c.kind = kind;
    c.origin = k.origin;
    c.isOfficial = k.isOfficial;
    c.officialPublisher = k.isOfficial ? "VocabuQuiz" : "";
    c.officialKind = k.note;
    c.ownerName = k.owner || str(x.author) || "名前のない人";
    c.ownerHandle = str(x.handle);
    c.ownerAvatarUrl = safeImage(x.avatarUrl);
    c.isOwnedByCurrentUser = kind === "mine";
    c.visibility = kind === "mine" ? (x.isPublic ? "public" : "private") : "public";
    c.status = "published";
    c.subject = str(x.subject);
    c.questionCount = isNum(x.count) ? x.count : 0;
    c.countUnit = str(x.unit) || "問";
    c.iconText = str(x.iconName);
    c.accentColor = str(x.iconColor);
    c.bannerUrl = safeImage(x.bannerUrl);
    c.iconUrl = safeImage(x.iconUrl);
    c.tags = arr(x.tags).map(str).slice(0, 6);
    c.updatedLabel = str(x.updatedLabel);
    c.favoriteCount = isNum(x.saveCount) ? x.saveCount : null;
    c.source = "app";
    c.actions = arr(x.actions).map(str);
    c.canEdit = kind === "mine";
    c.canDelete = kind === "mine";
    c.canPublish = kind === "mine";
    c.canFork = kind === "public";
    c.canReport = kind === "public";
    c.raw = x;
    return c;
  }

  /* 本体ライブラリの写し ＋ この端末の保存（形式の内訳・説明・表紙）。
     画面に出ていない情報だけを足す。画面に出ているものは上書きしない。 */
  function collectDom(scraped, opts) {
    opts = opts || {};
    var ctx = { me: VQ2.store ? safeOwner() : "", myUserId: myUserId() };
    var out = [], seen = Object.create(null);
    arr(scraped).forEach(function (x) {
      var c = fromScraped(x, ctx);
      if (!c.id || seen[c.id]) return;
      seen[c.id] = 1;
      out.push(c);
    });
    var byId = Object.create(null);
    try {
      if (VQ2.store) VQ2.store.listPresets().forEach(function (p) { byId[str(p.id)] = p; });
    } catch (e) {}
    /* 作者。公開しているものは「誰のものか」が分かるようにする。
       ・自分が公開したもの … いまログインしている自分の表示名・@ID・アイコン
       ・ほかの人の公開     … 公開一覧が持っている作者の情報
       画面に出す ID は @ から始まる公開用のもの。内部の番号は出さない。 */
    var app = root.__vqAppData || null;
    var me = null;
    try { me = app && app.me ? app.me() : null; } catch (e) {}

    var favs = favorites(), sv = saved(), lastPlayed = readLastPlayed();
    out.forEach(function (c) {
      if (c.kind === "public" && app && app.publicPresetById) {
        var pub = null;
        try { pub = app.publicPresetById(c.id); } catch (e) {}
        if (pub) {
          if (pub.displayName) c.ownerName = pub.displayName;
          if (pub.handle) c.ownerHandle = pub.handle;
          if (pub.avatarUrl) c.ownerAvatarUrl = safeImage(pub.avatarUrl);
          if (pub.ownerUserId) c.ownerId = pub.ownerUserId;
          if (isNum(pub.saveCount) && pub.saveCount) c.favoriteCount = pub.saveCount;
        }
      }
      if (c.kind === "mine" && c.visibility === "public" && me && me.loggedIn) {
        c.ownerName = me.displayName || me.nickname || c.ownerName;
        c.ownerHandle = me.handle || "";
        c.ownerAvatarUrl = safeImage(me.avatarUrl);
        c.ownerId = me.userId || c.ownerId;
      }
      var p = byId[c.id];
      if (p) {
        var a = p.appearance || {};
        if (!c.bannerUrl) c.bannerUrl = safeImage(a.banner);
        if (!c.iconUrl) c.iconUrl = safeImage(a.iconImage);
        if (!c.description) c.description = str(p.description);
        if (arr(p.questions).length) {
          c.questionTypeCounts = typeCounts(p.questions);
          c.estimatedMinutes = estimateMinutes(p.questions);
          c.questionCount = arr(p.questions).length;
          c.countUnit = "問";
        }
        c.createdAt = toIso(p.createdAt) || c.createdAt;
        c.updatedAt = toIso(p.updatedAt) || c.updatedAt;
        c.hasDetail = true;
      }
      c.isFavoritedByCurrentUser = favs.indexOf(c.id) >= 0;
      c.isSavedByCurrentUser = sv.indexOf(c.id) >= 0;
      c.lastPlayedAt = lastPlayed[c.id] || "";
      c.isNew = isNewCard(c);
    });
    return out;
  }
  function safeOwner() {
    try { return VQ2.store.currentOwnerId(); } catch (e) { return ""; }
  }

  /* 1 問あたりの目安から、おおよその時間を出す。分からなければ null。 */
  function estimateMinutes(questions) {
    var qs = arr(questions);
    if (!qs.length) return null;
    var sec = 0;
    qs.forEach(function (q) {
      var s = isNum(q && q.estimatedSeconds) ? q.estimatedSeconds : null;
      if (s === null && VQ2.qmodel && VQ2.qmodel.defaultSeconds) {
        try { s = VQ2.qmodel.defaultSeconds(q.type); } catch (e) { s = 60; }
      }
      sec += isNum(s) ? s : 60;
    });
    return Math.max(1, Math.round(sec / 60));
  }

  /* ══════════════════════════════════════════════════════════════════
     5) お気に入りと保存
     ・お気に入り … あとで見つけやすくする印（自分の端末の中だけ）
     ・保存       … 公開プリセットを自分の一覧へ取り込む（複製とは別）
     ══════════════════════════════════════════════════════════════════ */
  var FAV_KEY = "vq.presetFavs.v1";
  var SAVED_KEY = "vq.presetSaved.v1";
  function readList(key) {
    try { var v = JSON.parse(root.localStorage.getItem(key) || "[]"); return Array.isArray(v) ? v.map(str) : []; }
    catch (e) { return []; }
  }
  function writeListSafe(key, v) {
    try { root.localStorage.setItem(key, JSON.stringify(v.slice(0, 500))); return true; } catch (e) { return false; }
  }
  function favorites() { return readList(FAV_KEY); }
  function isFavorite(id) { return favorites().indexOf(str(id)) >= 0; }
  function toggleFavorite(id) {
    var l = favorites(), i = l.indexOf(str(id));
    if (i >= 0) l.splice(i, 1); else l.unshift(str(id));
    writeListSafe(FAV_KEY, l);
    return l.indexOf(str(id)) >= 0;
  }
  function saved() { return readList(SAVED_KEY); }
  function isSaved(id) { return saved().indexOf(str(id)) >= 0; }
  function toggleSaved(id) {
    var l = saved(), i = l.indexOf(str(id));
    if (i >= 0) l.splice(i, 1); else l.unshift(str(id));
    writeListSafe(SAVED_KEY, l);
    return l.indexOf(str(id)) >= 0;
  }

  /* ══════════════════════════════════════════════════════════════════
     6) サーバから取ってくる（公開・公式）
     ・失敗しても一覧は出す。取れなかったことだけを持ち帰る。
     ══════════════════════════════════════════════════════════════════ */
  var remote = { official: [], publicList: [], officialState: "idle", publicState: "idle",
                 officialError: "", publicError: "", at: 0 };

  function apiBase() {
    try {
      if (root.API_BASE) return String(root.API_BASE);
      if (root.CONFIG && root.CONFIG.apiBase) return String(root.CONFIG.apiBase);
    } catch (e) {}
    return "";
  }
  function authHeader() {
    try {
      var t = root.localStorage.getItem("app.auth.token.v1");
      return t ? { Authorization: "Bearer " + String(t).replace(/^"|"$/g, "") } : {};
    } catch (e) { return {}; }
  }
  function getJson(path) {
    if (!root.fetch) return Promise.reject(new Error("fetch が使えません"));
    var ctrl = root.AbortController ? new root.AbortController() : null;
    var timer = ctrl ? root.setTimeout(function () { ctrl.abort(); }, 12000) : null;
    return root.fetch(apiBase() + path, {
      headers: Object.assign({ Accept: "application/json" }, authHeader()),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      if (timer) root.clearTimeout(timer);
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  function loadRemote(opts) {
    opts = opts || {};
    var jobs = [];
    if (opts.official !== false && remote.officialState !== "loading") {
      remote.officialState = "loading";
      jobs.push(getJson("/api/official-presets").then(function (j) {
        remote.official = arr(j && j.presets);
        remote.officialState = "ok";
        remote.officialError = "";
      }, function (e) {
        remote.officialState = "fail";
        remote.officialError = str(e && e.message) || "取得できませんでした";
      }));
    }
    if (opts.publicList !== false && remote.publicState !== "loading") {
      remote.publicState = "loading";
      var qs = "?limit=" + (opts.limit || 60) + "&sort=" + (opts.sort === "popular" ? "popular" : "new");
      jobs.push(getJson("/api/public/presets" + qs).then(function (j) {
        remote.publicList = arr(j && (j.presets || j.items));
        remote.publicState = "ok";
        remote.publicError = "";
      }, function (e) {
        remote.publicState = "fail";
        remote.publicError = str(e && e.message) || "取得できませんでした";
      }));
    }
    return Promise.all(jobs).then(function () {
      remote.at = Date.now();
      return remoteState();
    });
  }
  function remoteState() {
    return {
      official: remote.officialState, publicList: remote.publicState,
      officialError: remote.officialError, publicError: remote.publicError,
      officialCount: remote.official.length, publicCount: remote.publicList.length,
      at: remote.at
    };
  }
  /* テストと、アプリ側がすでに持っているデータを流し込むための口。 */
  function setRemote(kind, list, state) {
    if (kind === "official") { remote.official = arr(list); remote.officialState = state || "ok"; }
    if (kind === "public") { remote.publicList = arr(list); remote.publicState = state || "ok"; }
  }

  /* ══════════════════════════════════════════════════════════════════
     7) すべてを 1 つの一覧へ
     ══════════════════════════════════════════════════════════════════ */
  function myUserId() {
    try {
      var raw = root.localStorage.getItem("app.auth.profile.v1");
      if (!raw) return "";
      var p = JSON.parse(raw);
      return str(p && (p.id || p.uid || p.userId));
    } catch (e) { return ""; }
  }

  function collect(opts) {
    opts = opts || {};
    var ST = VQ2.store;
    var me = ST ? ST.currentOwnerId() : "";
    var ctx = { me: me, myUserId: myUserId() };
    var out = [], seen = Object.create(null);

    /* ① 自分のもの */
    if (opts.local !== false && ST) {
      try {
        ST.listPresets().forEach(function (p) {
          var c = fromLocal(p, ctx);
          if (!c.id || seen[c.id]) return;
          seen[c.id] = 1;
          out.push(c);
        });
      } catch (e) {}
    }
    /* ② 公開（自分のものと重なったら、自分の側を残して「公開中」だけ写す） */
    if (opts.publicList !== false) {
      remote.publicList.forEach(function (p) {
        var c = fromPublic(p, ctx);
        if (!c.id) return;
        if (seen[c.id]) {
          var mineCard = null;
          for (var i = 0; i < out.length; i++) if (out[i].id === c.id) { mineCard = out[i]; break; }
          if (mineCard) {
            mineCard.visibility = "public";
            mineCard.publishedAt = c.publishedAt || mineCard.publishedAt;
            mineCard.favoriteCount = c.favoriteCount;
            mineCard.playCount = c.playCount;
            if (!mineCard.bannerUrl) mineCard.bannerUrl = c.bannerUrl;
            if (!mineCard.iconUrl) mineCard.iconUrl = c.iconUrl;
          }
          return;
        }
        seen[c.id] = 1;
        out.push(c);
      });
    }
    /* ③ 公式 */
    if (opts.official !== false) {
      remote.official.forEach(function (p) {
        var c = fromOfficial(p);
        if (!c.id || seen[c.id]) return;
        seen[c.id] = 1;
        out.push(c);
      });
    }

    /* 印を付ける */
    var favs = favorites(), sv = saved();
    var lastPlayed = readLastPlayed();
    out.forEach(function (c) {
      c.isFavoritedByCurrentUser = favs.indexOf(c.id) >= 0;
      c.isSavedByCurrentUser = sv.indexOf(c.id) >= 0;
      c.lastPlayedAt = lastPlayed[c.id] || "";
      c.isNew = isNewCard(c);
    });
    return out;
  }

  /* 最後に解いた日。結果の記録から引く。 */
  function readLastPlayed() {
    var m = Object.create(null);
    try {
      var list = VQ2.store ? VQ2.store.results.list() : [];
      list.forEach(function (r) {
        if (!r || !r.presetId) return;
        var t = str(r.finishedAt);
        if (!m[r.presetId] || t > m[r.presetId]) m[r.presetId] = t;
      });
    } catch (e) {}
    return m;
  }

  /* 新着かどうか。ずっと「新」が付いたままにしない。 */
  function isNewCard(c) {
    var base = timeOf(c.publishedAt) || timeOf(c.createdAt);
    if (!base) return false;
    if (Date.now() - base > NEW_DAYS * DAY) return false;
    /* 一度でも解いていれば、もう新着ではない。 */
    if (c.lastPlayedAt) return false;
    return true;
  }

  /* ══════════════════════════════════════════════════════════════════
     8) タブ・絞り込み・並べ替え
     ══════════════════════════════════════════════════════════════════ */
  var TABS = [
    { id: "all", label: "すべて" },
    { id: "mine", label: "マイプリセット" },
    { id: "public", label: "公開プリセット" },
    { id: "official", label: "公式" },
    { id: "fav", label: "お気に入り" }
  ];
  function inTab(c, tab) {
    if (tab === "mine") return c.isOwnedByCurrentUser && !c.isOfficial;
    if (tab === "public") return c.visibility === "public" && !c.isOfficial;
    if (tab === "official") return c.isOfficial;
    if (tab === "fav") return c.isFavoritedByCurrentUser || c.isSavedByCurrentUser;
    return true;
  }
  function counts(list) {
    var m = {};
    TABS.forEach(function (t) {
      m[t.id] = arr(list).filter(function (c) { return inTab(c, t.id); }).length;
    });
    return m;
  }

  function foldSearch(s) {
    return str(s)
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/[ァ-ヶ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); })
      .toLowerCase().trim();
  }
  function matches(c, q) {
    if (!q) return true;
    var hay = foldSearch([c.title, c.subject, c.unit, c.ownerName, c.ownerHandle,
                          c.description, (c.tags || []).join(" ")].join(" "));
    return hay.indexOf(q) >= 0;
  }

  var SORTS = [
    { id: "recommended", label: "おすすめ" },
    { id: "updated", label: "更新順" },
    { id: "new", label: "新着" },
    { id: "played", label: "最近使った" },
    { id: "popular", label: "人気" },
    { id: "count", label: "問題数" },
    { id: "name", label: "名前順" }
  ];
  function sortList(list, sort) {
    var a = arr(list).slice();
    function t(x, k) { return timeOf(x[k]); }
    if (sort === "updated") a.sort(function (x, y) { return t(y, "updatedAt") - t(x, "updatedAt"); });
    else if (sort === "new") a.sort(function (x, y) {
      return (t(y, "publishedAt") || t(y, "createdAt")) - (t(x, "publishedAt") || t(x, "createdAt")); });
    else if (sort === "played") a.sort(function (x, y) { return t(y, "lastPlayedAt") - t(x, "lastPlayedAt"); });
    else if (sort === "popular") a.sort(function (x, y) {
      return (y.favoriteCount || 0) + (y.playCount || 0) - ((x.favoriteCount || 0) + (x.playCount || 0)); });
    else if (sort === "count") a.sort(function (x, y) { return y.questionCount - x.questionCount; });
    else if (sort === "name") a.sort(function (x, y) { return str(x.title).localeCompare(str(y.title), "ja"); });
    else {
      /* おすすめ：最近使った → お気に入り → 更新が新しい の順。 */
      a.sort(function (x, y) {
        var d = t(y, "lastPlayedAt") - t(x, "lastPlayedAt");
        if (d) return d;
        d = (y.isFavoritedByCurrentUser ? 1 : 0) - (x.isFavoritedByCurrentUser ? 1 : 0);
        if (d) return d;
        return t(y, "updatedAt") - t(x, "updatedAt");
      });
    }
    return a;
  }

  function applyFilters(list, f) {
    f = f || {};
    var q = foldSearch(f.search);
    return arr(list).filter(function (c) {
      if (f.tab && !inTab(c, f.tab)) return false;
      if (!matches(c, q)) return false;
      if (f.subject && subjectKey(c.subject) !== subjectKey(f.subject)) return false;
      if (f.visibility && c.visibility !== f.visibility) return false;
      if (f.origin === "mine" && !c.isOwnedByCurrentUser) return false;
      if (f.origin === "official" && !c.isOfficial) return false;
      if (f.origin === "community" && (c.isOfficial || c.isOwnedByCurrentUser)) return false;
      if (f.type && !(c.questionTypeCounts && c.questionTypeCounts[f.type])) return false;
      if (isNum(f.minCount) && c.questionCount < f.minCount) return false;
      if (isNum(f.maxCount) && c.questionCount > f.maxCount) return false;
      if (f.favOnly && !c.isFavoritedByCurrentUser) return false;
      if (f.recent && !c.lastPlayedAt) return false;
      return true;
    });
  }

  /* 「すべて」タブで出す区切り。中身が無い区切りは出さない。 */
  function sections(list) {
    var out = [];
    function push(id, title, sub, rows, max) {
      if (!rows.length) return;
      out.push({ id: id, title: title, sub: sub, cards: rows.slice(0, max || 8) });
    }
    push("recent", "最近使ったプリセット", "続きから始められます",
      sortList(list.filter(function (c) { return c.lastPlayedAt; }), "played"), 4);
    push("mine", "マイプリセット", "自分で作ったもの",
      sortList(list.filter(function (c) { return inTab(c, "mine"); }), "updated"), 8);
    push("official", "公式プリセット", "VocabuQuiz が用意した教材",
      sortList(list.filter(function (c) { return c.isOfficial; }), "new"), 8);
    push("community", "公開プリセット", "ほかの人が公開している教材",
      sortList(list.filter(function (c) {
        return c.visibility === "public" && !c.isOfficial && !c.isOwnedByCurrentUser; }), "new"), 8);
    return out;
  }

  /* ══════════════════════════════════════════════════════════════════
     9) 表示のための言葉（画面へ直接書き写さない）
     ══════════════════════════════════════════════════════════════════ */
  function visibilityLabel(v) {
    return v === "public" ? "公開中" : v === "unlisted" ? "限定公開" : "非公開";
  }
  /* カードに出す札。多くても 2 つまで。 */
  function badges(c) {
    var out = [];
    if (c.isOfficial) out.push({ id: "official", label: "VocabuQuiz公式", icon: "shield", tone: "official" });
    else if (c.isOwnedByCurrentUser) {
      out.push({ id: "mine", label: "マイプリセット", icon: "user", tone: "mine" });
      out.push({ id: "vis", label: visibilityLabel(c.visibility), icon:
        c.visibility === "public" ? "share" : c.visibility === "unlisted" ? "eye" : "shield", tone: "neutral" });
    } else out.push({ id: "public", label: "公開", icon: "share", tone: "public" });
    if (c.status === "draft" && c.isOwnedByCurrentUser)
      out.push({ id: "draft", label: "下書き", icon: "doc", tone: "neutral" });
    return out.slice(0, 2);
  }
  function relTime(iso) {
    var t = timeOf(iso);
    if (!t) return "";
    var d = Date.now() - t;
    if (d < 60000) return "たった今";
    if (d < 3600000) return Math.floor(d / 60000) + " 分前";
    if (d < DAY) return Math.floor(d / 3600000) + " 時間前";
    if (d < 30 * DAY) return Math.floor(d / DAY) + " 日前";
    if (d < 365 * DAY) return Math.floor(d / (30 * DAY)) + " か月前";
    return Math.floor(d / (365 * DAY)) + " 年前";
  }
  /* カードに出す一行のメタ。詰め込みすぎない。 */
  function metaLine(c) {
    var out = [];
    if (c.subject) out.push(subjectLabel(c.subject));
    if (c.questionCount) out.push(c.questionCount + " " + (c.countUnit || "問"));
    if (isNum(c.estimatedMinutes)) out.push("約 " + c.estimatedMinutes + " 分");
    return out.join("・");
  }
  function initialOf(c) {
    var t = str(c.title).trim();
    return t ? t.slice(0, 1) : "?";
  }

  VQ2.library = {
    TABS: TABS, SORTS: SORTS, SUBJECT_TONE: SUBJECT_TONE, NEW_DAYS: NEW_DAYS,
    safeImage: safeImage, subjectKey: subjectKey, subjectLabel: subjectLabel,
    fallbackBanner: fallbackBanner, initialOf: initialOf,
    typeCounts: typeCounts, typeLabel: typeLabel, typeSummary: typeSummary, typeBreakdown: typeBreakdown,
    fromLocal: fromLocal, fromPublic: fromPublic, fromOfficial: fromOfficial,
    fromScraped: fromScraped, collectDom: collectDom, emptyCard: emptyCard,
    collect: collect, loadRemote: loadRemote, remoteState: remoteState, setRemote: setRemote,
    favorites: favorites, isFavorite: isFavorite, toggleFavorite: toggleFavorite,
    saved: saved, isSaved: isSaved, toggleSaved: toggleSaved,
    inTab: inTab, counts: counts, applyFilters: applyFilters, sortList: sortList, sections: sections,
    badges: badges, visibilityLabel: visibilityLabel, relTime: relTime, metaLine: metaLine,
    isNewCard: isNewCard, estimateMinutes: estimateMinutes
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
