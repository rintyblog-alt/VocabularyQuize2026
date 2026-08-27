/* ══════════════════════════════════════════════════════════════════════
   Vocabu Workplace — 共通データモデルと Registry（§8 / §9）

   ・4 製品（Docs / Sheets / Slides / Forms）は **同じ入れ物には入れない**。
     共通なのは「持ち主・題名・見た目・状態・版」だけ。
     中身（本文・セル・スライド・質問）は製品ごとに別の形を持つ。
   ・機能の一覧を画面へ直接書かない。ここの Registry に登録し、
     画面は Registry を読んで並べる（§9）。
     そうしないと「ツールバーには在るのに動かない」飾りのボタンが必ず生まれる。
   ・content には必ず schemaVersion を持たせる。あとから形を変えられるように。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var WP = VQ2.workplace || (VQ2.workplace = {});

  /* ── 小道具 ───────────────────────────────────────────────────── */
  function uid(prefix) {
    var t = Date.now().toString(36);
    var r = Math.random().toString(36).slice(2, 8);
    return (prefix || "wp") + "_" + t + r;
  }
  function nowIso() { return new Date().toISOString(); }
  function str(v) { return v === undefined || v === null ? "" : String(v); }
  function clone(o) { return o === undefined ? o : JSON.parse(JSON.stringify(o)); }

  /* ══════════════════════════════════════════════════════════════════
     製品の登録（App Registry）
     ここに載っていない製品は画面にも出ない。productionReady が false の
     ものは「ベータ」の印を付けて出す（隠さない・偽らない）。
     ══════════════════════════════════════════════════════════════════ */
  var APPS = [
    {
      id: "docs", itemType: "document",
      name: "VocabuDocs", short: "Docs",
      icon: "fileText", accent: "#2b70ef",
      desc: "文章・レポート・ノートを書く",
      supportedImports: ["txt", "md", "html"],
      supportedExports: ["txt", "md", "html", "pdf"],
      productionReady: true
    },
    {
      id: "sheets", itemType: "spreadsheet",
      name: "VocabuSheets", short: "Sheets",
      icon: "table", accent: "#0f9d58",
      desc: "表・計算・集計・グラフ",
      supportedImports: ["csv", "tsv"],
      supportedExports: ["csv", "tsv", "html", "pdf"],
      productionReady: true
    },
    {
      id: "slides", itemType: "presentation",
      name: "VocabuSlides", short: "Slides",
      icon: "presentation", accent: "#e8710a",
      desc: "発表用のスライドを作る",
      supportedImports: [],
      supportedExports: ["pdf", "png", "html"],
      productionReady: true
    },
    {
      id: "forms", itemType: "form",
      name: "VocabuForms", short: "Forms",
      icon: "clipboardList", accent: "#7b3fe4",
      desc: "アンケート・申込・小テスト",
      supportedImports: [],
      supportedExports: ["csv", "html"],
      productionReady: true
    }
  ];
  var APP_BY_ID = {}, APP_BY_TYPE = {};
  APPS.forEach(function (a) { APP_BY_ID[a.id] = a; APP_BY_TYPE[a.itemType] = a; });

  function appOf(itemTypeOrId) {
    return APP_BY_TYPE[itemTypeOrId] || APP_BY_ID[itemTypeOrId] || null;
  }

  /* ══════════════════════════════════════════════════════════════════
     見た目（バナー・アイコン・色）
     ══════════════════════════════════════════════════════════════════ */
  /* 種類ごとの既定のグラデーション。カードの表紙になる。 */
  var DEFAULT_GRADIENT = {
    document:     "linear-gradient(135deg,#2b70ef 0%,#6492ff 100%)",
    spreadsheet:  "linear-gradient(135deg,#0f9d58 0%,#4ecb8b 100%)",
    presentation: "linear-gradient(135deg,#e8710a 0%,#f5a742 100%)",
    form:         "linear-gradient(135deg,#7b3fe4 0%,#a97bf0 100%)"
  };
  var GRADIENTS = [
    { id: "ocean",   value: "linear-gradient(135deg,#2b70ef 0%,#6492ff 100%)", label: "オーシャン" },
    { id: "forest",  value: "linear-gradient(135deg,#0f9d58 0%,#4ecb8b 100%)", label: "フォレスト" },
    { id: "sunset",  value: "linear-gradient(135deg,#e8710a 0%,#f5a742 100%)", label: "サンセット" },
    { id: "violet",  value: "linear-gradient(135deg,#7b3fe4 0%,#a97bf0 100%)", label: "バイオレット" },
    { id: "rose",    value: "linear-gradient(135deg,#d1467a 0%,#f08bad 100%)", label: "ローズ" },
    { id: "slate",   value: "linear-gradient(135deg,#334155 0%,#64748b 100%)", label: "スレート" },
    { id: "teal",    value: "linear-gradient(135deg,#0d7f8f 0%,#4bbfcf 100%)", label: "ティール" },
    { id: "amber",   value: "linear-gradient(135deg,#b45309 0%,#fbbf24 100%)", label: "アンバー" }
  ];

  function defaultAppearance(itemType) {
    var app = APP_BY_TYPE[itemType];
    return {
      icon: app ? app.icon : "fileText",
      iconStyle: "line",
      bannerType: "gradient",
      bannerValue: DEFAULT_GRADIENT[itemType] || DEFAULT_GRADIENT.document,
      accentColor: app ? app.accent : "#2b70ef",
      coverImageUrl: "",
      thumbnailUrl: ""
    };
  }
  function normalizeAppearance(a, itemType) {
    var d = defaultAppearance(itemType);
    a = a && typeof a === "object" ? a : {};
    var bt = str(a.bannerType);
    if (["default", "gradient", "image", "generated_preview"].indexOf(bt) < 0) bt = d.bannerType;
    return {
      icon: str(a.icon) || d.icon,
      iconStyle: str(a.iconStyle) || d.iconStyle,
      bannerType: bt,
      bannerValue: str(a.bannerValue) || d.bannerValue,
      accentColor: str(a.accentColor) || d.accentColor,
      coverImageUrl: str(a.coverImageUrl),
      thumbnailUrl: str(a.thumbnailUrl)
    };
  }

  /* ══════════════════════════════════════════════════════════════════
     WorkplaceItem（共通のメタデータ）
     ══════════════════════════════════════════════════════════════════ */
  var STATUSES = ["draft", "active", "archived", "trashed"];
  var VISIBILITIES = ["private", "link", "shared", "public"];

  function newItem(itemType, o) {
    o = o || {};
    var t = nowIso();
    return {
      id: o.id || uid("wp"),
      ownerId: str(o.ownerId) || "local",
      itemType: itemType,
      title: str(o.title) || defaultTitle(itemType),
      description: str(o.description),
      appearance: normalizeAppearance(o.appearance, itemType),
      status: STATUSES.indexOf(o.status) >= 0 ? o.status : "active",
      visibility: VISIBILITIES.indexOf(o.visibility) >= 0 ? o.visibility : "private",
      favorite: !!o.favorite,
      currentVersion: 1,
      templateId: str(o.templateId),
      createdAt: t,
      updatedAt: t,
      lastOpenedAt: "",
      trashedAt: ""
    };
  }
  function defaultTitle(itemType) {
    return { document: "無題のドキュメント", spreadsheet: "無題のスプレッドシート",
             presentation: "無題のプレゼンテーション", form: "無題のフォーム" }[itemType] || "無題";
  }
  function normalizeItem(raw) {
    if (!raw || !raw.itemType || !APP_BY_TYPE[raw.itemType]) return null;
    var base = newItem(raw.itemType, raw);
    base.currentVersion = Math.max(1, Number(raw.currentVersion) || 1);
    base.createdAt = str(raw.createdAt) || base.createdAt;
    base.updatedAt = str(raw.updatedAt) || base.updatedAt;
    base.lastOpenedAt = str(raw.lastOpenedAt);
    base.trashedAt = str(raw.trashedAt);
    return base;
  }

  /* ══════════════════════════════════════════════════════════════════
     中身（製品ごと）。VersionedContent<T> の実体。
     ══════════════════════════════════════════════════════════════════ */
  var SCHEMA_VERSION = { document: 1, spreadsheet: 1, presentation: 1, form: 1 };

  function emptyContent(itemType) {
    return { schemaVersion: SCHEMA_VERSION[itemType] || 1, content: emptyBody(itemType) };
  }
  function emptyBody(itemType) {
    if (itemType === "document") {
      return {
        blocks: [{ id: uid("b"), type: "paragraph", text: "" }],
        /* 既定は **A4 の縦**。開いたらまず 1 枚の白い紙が出る。
           寸法の決まりごとは paper.js が持っているので、そこから貰う
           （2 か所に既定を書くと、片方だけ直して食い違う）。 */
        page: (WP.paper && WP.paper.defaults) ? WP.paper.defaults()
          : { mode: "paper", size: "a4", orient: "portrait",
              margin: { t: 25.4, r: 25.4, b: 25.4, l: 25.4 },
              header: "", footer: "", pageNumber: false }
      };
    }
    if (itemType === "spreadsheet") {
      return { sheets: [newSheet("シート1")], charts: [], activeSheet: 0 };
    }
    if (itemType === "presentation") {
      return {
        ratio: "16:9",
        theme: "minimal",
        slides: [newSlide("title")],
        /* 既定は控えめなフェード。切り替えが「無し」だと、
           アニメーションを設定しても何も起きないように見える。 */
        transition: { type: "fade", speed: 300 }
      };
    }
    if (itemType === "form") {
      return {
        sections: [{ id: uid("s"), title: "", description: "", fields: [] }],
        theme: { accent: "#7b3fe4", background: "#f6f7fb", card: "rounded", font: "sans",
                 progress: true, banner: "", logo: "" },
        settings: {
          collectEmail: false, requireLogin: false, anonymous: true,
          onePerPerson: false, onePerDevice: false, allowEdit: false,
          opensAt: "", closesAt: "", responseLimit: 0, accepting: true,
          confirmMessage: "回答を受け付けました。ご協力ありがとうございました。",
          redirectUrl: "", showResults: false, shuffleQuestions: false,
          graded: false, showQuestionNumber: true
        },
        logic: []
      };
    }
    return {};
  }
  function newSheet(name) {
    return {
      id: uid("sh"), name: str(name) || "シート",
      rows: 60, cols: 20,
      cells: {},                 /* "A1" -> {v, f, s} 値 / 数式 / 書式 */
      colW: {}, rowH: {},
      merges: [],                /* ["A1:B2", ...] */
      freeze: { rows: 0, cols: 0 },
      hidden: false, color: "",
      filters: null,             /* {range, conds:[{col, op, value}]} */
      conditionals: []           /* [{range, op, value, style}] */
    };
  }
  function newSlide(layout) {
    return {
      id: uid("sl"), layout: str(layout) || "title_body",
      elements: [], notes: "", hidden: false, background: "", transition: ""
    };
  }

  /* ══════════════════════════════════════════════════════════════════
     Registry — 画面はここを読んで機能を並べる（§9）
     登録には「実際に動く実装」を必ず添える。実装の無いものは登録しない。
     ══════════════════════════════════════════════════════════════════ */
  function makeRegistry(kindName, requiredKeys) {
    var list = [], byId = {};
    return {
      register: function (def) {
        if (!def || !def.type) throw new Error(kindName + ": type がありません");
        for (var i = 0; i < requiredKeys.length; i++) {
          if (def[requiredKeys[i]] === undefined)
            throw new Error(kindName + " " + def.type + ": " + requiredKeys[i] + " がありません");
        }
        if (byId[def.type]) { /* 上書き登録は許す（後勝ち） */
          list[list.indexOf(byId[def.type])] = def;
        } else list.push(def);
        byId[def.type] = def;
        return def;
      },
      get: function (type) { return byId[str(type)] || null; },
      has: function (type) { return !!byId[str(type)]; },
      all: function () { return list.slice(); },
      byCategory: function () {
        var m = {};
        list.forEach(function (d) { (m[d.category || "その他"] = m[d.category || "その他"] || []).push(d); });
        return m;
      },
      /* 表示量の段階（simple / standard / detail）で絞る。
         機能そのものは消さない。出す量だけを変える（§2.3）。 */
      forLevel: function (level) {
        var rank = { simple: 1, standard: 2, detail: 3 }[level] || 2;
        return list.filter(function (d) { return (d.level || 1) <= rank; });
      }
    };
  }

  /* renderer / editor は「実際に描く関数」。無い機能は登録できない。 */
  WP.blockRegistry   = makeRegistry("DocumentBlock", ["label", "icon", "render"]);
  WP.functionRegistry = makeRegistry("SheetFunction", ["category", "minArgs", "evaluate"]);
  WP.elementRegistry = makeRegistry("SlideElement", ["label", "icon", "render"]);
  WP.fieldRegistry   = makeRegistry("FormField", ["label", "icon", "render", "readValue"]);

  /* ══════════════════════════════════════════════════════════════════
     カードに出す「中身の要約」。一覧のために本文を全部読ませない（§24 / §25）。
     保存のたびに作り直し、item.preview へ入れる。
     ══════════════════════════════════════════════════════════════════ */
  function buildPreview(itemType, body) {
    try {
      if (itemType === "document") {
        var bs = (body && body.blocks) || [];
        var lines = [];
        for (var i = 0; i < bs.length && lines.length < 6; i++) {
          var b = bs[i], t = str(b.text).replace(/<[^>]*>/g, "").trim();
          if (b.type === "table") { lines.push({ k: "table", t: "表" }); continue; }
          if (b.type === "image") { lines.push({ k: "image", t: "画像" }); continue; }
          if (!t) continue;
          lines.push({ k: b.type, t: t.slice(0, 60) });
        }
        var words = 0;
        bs.forEach(function (b) { words += str(b.text).replace(/<[^>]*>/g, "").length; });
        return { kind: "document", lines: lines, chars: words, blocks: bs.length };
      }
      if (itemType === "spreadsheet") {
        var sh = (body && body.sheets && body.sheets[0]) || null;
        var grid = [];
        if (sh) {
          for (var r = 1; r <= 4; r++) {
            var row = [];
            for (var c = 0; c < 4; c++) {
              var k = colName(c) + r, cell = sh.cells[k];
              row.push(cell ? str(cell.v).slice(0, 8) : "");
            }
            grid.push(row);
          }
        }
        return { kind: "spreadsheet", grid: grid,
                 sheets: (body && body.sheets || []).length,
                 charts: (body && body.charts || []).length };
      }
      if (itemType === "presentation") {
        var s0 = (body && body.slides && body.slides[0]) || null;
        var title = "";
        if (s0) (s0.elements || []).some(function (e) {
          if (e.type === "text" && str(e.text).trim()) { title = str(e.text).replace(/<[^>]*>/g, "").slice(0, 40); return true; }
          return false;
        });
        return { kind: "presentation", title: title, theme: str(body && body.theme),
                 count: (body && body.slides || []).length };
      }
      if (itemType === "form") {
        var n = 0;
        ((body && body.sections) || []).forEach(function (s) {
          (s.fields || []).forEach(function (f) { if (!isDecoration(f.type)) n++; });
        });
        return { kind: "form", questions: n,
                 accepting: !!(body && body.settings && body.settings.accepting),
                 sections: ((body && body.sections) || []).length };
      }
    } catch (e) {}
    return { kind: itemType };
  }
  function isDecoration(t) {
    return ["description", "image_block", "divider"].indexOf(str(t)) >= 0;
  }

  /* 列名（0 -> A, 26 -> AA）。Sheets とプレビューの両方が使う。 */
  function colName(i) {
    var s = "";
    i = Number(i) || 0;
    do { s = String.fromCharCode(65 + (i % 26)) + s; i = Math.floor(i / 26) - 1; } while (i >= 0);
    return s;
  }
  function colIndex(name) {
    var s = str(name).toUpperCase(), n = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i) - 65;
      if (c < 0 || c > 25) return -1;
      n = n * 26 + (c + 1);
    }
    return n - 1;
  }

  /* ══════════════════════════════════════════════════════════════════
     権限（§22）
     ══════════════════════════════════════════════════════════════════ */
  var ROLE_RANK = { viewer: 1, commenter: 2, respondent: 1, editor: 3, owner: 4 };
  function can(role, action) {
    var r = ROLE_RANK[str(role)] || 0;
    if (action === "read") return r >= 1;
    if (action === "comment") return r >= 2;
    if (action === "edit") return r >= 3;
    if (action === "delete" || action === "share") return r >= 4;
    /* 回答は respondent 専用。編集者かどうかとは無関係。 */
    if (action === "respond") return str(role) === "respondent" || r >= 1;
    return false;
  }

  WP.model = {
    uid: uid, nowIso: nowIso, clone: clone,
    APPS: APPS, appOf: appOf, GRADIENTS: GRADIENTS,
    STATUSES: STATUSES, VISIBILITIES: VISIBILITIES,
    SCHEMA_VERSION: SCHEMA_VERSION,
    defaultAppearance: defaultAppearance, normalizeAppearance: normalizeAppearance,
    defaultTitle: defaultTitle,
    newItem: newItem, normalizeItem: normalizeItem,
    emptyContent: emptyContent, emptyBody: emptyBody,
    newSheet: newSheet, newSlide: newSlide,
    buildPreview: buildPreview, isDecoration: isDecoration,
    colName: colName, colIndex: colIndex,
    can: can, ROLE_RANK: ROLE_RANK
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
