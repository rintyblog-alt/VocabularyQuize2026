/* ══════════════════════════════════════════════════════════════════════
   Vocabu Workplace — 製品間の変換（§17）

   ・変換は必ず「新しいファイルを作る」。元のファイルには一切触れない。
   ・行き先ごとに実装があるものだけを targetsFor が返す。
     画面は targetsFor を読んで並べるので、動かない変換先は出ない。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var WP = VQ2.workplace || (VQ2.workplace = {});
  var M = WP.model, ST = WP.store;

  function strip(html) {
    var d = root.document.createElement("div");
    d.innerHTML = String(html || "");
    return (d.textContent || "").trim();
  }
  function esc(s) {
    return String(s === undefined || s === null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /* ══ 変換の定義 ═══════════════════════════════════════════════ */
  var CONVERTS = [
    /* Docs → */
    { id: "doc2slides", from: "document", to: "presentation", label: "Slides に変換（見出しごとに 1 枚）",
      icon: "presentation", run: docToSlides },
    { id: "doc2sheet", from: "document", to: "spreadsheet", label: "文書の中の表を Sheets へ",
      icon: "table", run: docToSheet },
    { id: "doc2form", from: "document", to: "form", label: "Forms に変換（見出しを質問にする）",
      icon: "clipboardList", run: docToForm },
    /* Sheets → */
    { id: "sheet2doc", from: "spreadsheet", to: "document", label: "Docs に変換（表として貼る）",
      icon: "fileText", run: sheetToDoc },
    { id: "sheet2slides", from: "spreadsheet", to: "presentation", label: "Slides に変換（グラフを載せる）",
      icon: "presentation", run: sheetToSlides },
    /* Slides → */
    { id: "slides2doc", from: "presentation", to: "document", label: "Docs に変換（原稿として）",
      icon: "fileText", run: slidesToDoc },
    /* Forms → */
    { id: "form2doc", from: "form", to: "document", label: "Docs に変換（質問一覧として）",
      icon: "fileText", run: formToDoc },
    { id: "form2sheet", from: "form", to: "spreadsheet", label: "Sheets に変換（回答を書き込む表）",
      icon: "table", run: formToSheet }
  ];

  function targetsFor(itemType) {
    return CONVERTS.filter(function (c) { return c.from === itemType && typeof c.run === "function"; })
      .map(function (c) { return { id: c.id, label: c.label, icon: c.icon, to: c.to }; });
  }
  function run(id, item, content) {
    var c = null;
    CONVERTS.some(function (x) { if (x.id === id) { c = x; return true; } return false; });
    if (!c) return Promise.reject(new Error("その変換は登録されていません。"));
    var spec = c.run(item, content.content || content);
    if (!spec) return Promise.reject(new Error("変換できる内容がありませんでした。"));
    return ST.create(c.to, spec);
  }

  /* ── Docs → Slides ─────────────────────────────────────────── */
  function docToSlides(item, body) {
    var blocks = body.blocks || [];
    var slides = [], cur = null;
    function push() { if (cur) slides.push(cur); }
    blocks.forEach(function (b) {
      var t = strip(b.text);
      if (/^heading[12]$/.test(b.type)) { push(); cur = { title: t, lines: [] }; return; }
      if (!cur) cur = { title: item.title, lines: [] };
      if (b.type === "table") {
        (b.rows || []).forEach(function (r) { cur.lines.push(r.join(" / ")); });
        return;
      }
      if (["divider", "pagebreak", "image", "toc"].indexOf(b.type) >= 0) return;
      if (t) cur.lines.push(t);
    });
    push();
    if (!slides.length) return null;
    var made = [{ id: M.uid("sl"), layout: "title", hidden: false, notes: "", transition: "", elements: [
      { id: M.uid("e"), type: "text", x: 80, y: 190, w: 800, h: 90, text: item.title,
        size: 44, bold: true, align: "center", lh: 1.4, z: 1 }
    ] }].concat(slides.map(function (s) {
      return { id: M.uid("sl"), layout: "title_body", hidden: false, notes: "", transition: "", elements: [
        { id: M.uid("e"), type: "text", x: 70, y: 60, w: 820, h: 50, text: s.title,
          size: 32, bold: true, align: "left", lh: 1.4, z: 1 },
        { id: M.uid("e"), type: "text", x: 70, y: 140, w: 820, h: 320,
          text: s.lines.slice(0, 8).map(function (l) { return "・" + l.slice(0, 90); }).join("\n"),
          size: 19, align: "left", lh: 1.8, z: 1 }
      ] };
    }));
    return {
      title: item.title + "（スライド）",
      appearance: M.normalizeAppearance({ bannerValue: item.appearance.bannerValue }, "presentation"),
      content: { schemaVersion: 1, content: { ratio: "16:9", theme: "minimal", slides: made,
        transition: { type: "fade", speed: 300 } } }
    };
  }

  /* ── Docs → Sheets（文書の中の表を集める）──────────────────── */
  function docToSheet(item, body) {
    var tables = (body.blocks || []).filter(function (b) { return b.type === "table" && b.rows; });
    if (!tables.length) return null;
    var sheets = tables.map(function (b, i) {
      var s = M.newSheet("表 " + (i + 1));
      (b.rows || []).forEach(function (r, ri) {
        r.forEach(function (c, ci) {
          if (String(c).trim() === "") return;
          var n = Number(String(c).replace(/,/g, ""));
          s.cells[M.colName(ci) + (ri + 1)] = {
            v: (!isNaN(n) && String(c).trim() !== "") ? n : c,
            s: (b.header && ri === 0) ? { b: true, bg: "#eef2f7" } : undefined
          };
        });
      });
      s.freeze = { rows: b.header ? 1 : 0, cols: 0 };
      return s;
    });
    return {
      title: item.title + "（表）",
      content: { schemaVersion: 1, content: { sheets: sheets, charts: [], activeSheet: 0 } }
    };
  }

  /* ── Docs → Forms ──────────────────────────────────────────── */
  function docToForm(item, body) {
    var fields = [];
    (body.blocks || []).forEach(function (b) {
      var t = strip(b.text);
      if (!t) return;
      if (/^heading/.test(b.type)) {
        fields.push({ id: M.uid("f"), type: "long_text", label: t, description: "",
          required: false, options: [] });
      } else if (b.type === "todo") {
        fields.push({ id: M.uid("f"), type: "checkbox", label: t, checkboxLabel: "できた",
          description: "", required: false, options: [] });
      }
    });
    if (!fields.length) return null;
    var base = M.emptyBody("form");
    base.sections = [{ id: M.uid("s"), title: "", description: "", fields: fields }];
    return {
      title: item.title + "（フォーム）",
      description: "「" + item.title + "」から作りました。",
      content: { schemaVersion: 1, content: base }
    };
  }

  /* ── Sheets → Docs ─────────────────────────────────────────── */
  function sheetToDoc(item, body) {
    var F = WP.formula;
    var blocks = [{ id: M.uid("b"), type: "heading1", text: esc(item.title) }];
    (body.sheets || []).forEach(function (s) {
      var vals = F.recalc(s).values;
      var maxR = 1, maxC = 0;
      Object.keys(s.cells).forEach(function (k) {
        var r = parseInt(k.replace(/^[A-Z]+/, ""), 10);
        var c = M.colIndex(k.replace(/[0-9]+$/, ""));
        if (r > maxR) maxR = r;
        if (c > maxC) maxC = c;
      });
      blocks.push({ id: M.uid("b"), type: "heading2", text: esc(s.name) });
      var rows = [];
      for (var r = 1; r <= Math.min(maxR, 200); r++) {
        var row = [];
        for (var c = 0; c <= maxC; c++) {
          var v = vals[M.colName(c) + r];
          row.push(v === undefined ? "" : String(v));
        }
        rows.push(row);
      }
      if (rows.length) blocks.push({ id: M.uid("b"), type: "table", text: "", rows: rows, header: true });
    });
    return {
      title: item.title + "（文書）",
      content: { schemaVersion: 1, content: { blocks: blocks,
        page: (WP.paper ? WP.paper.defaults() : { mode: "paper" }) } }
    };
  }

  /* ── Sheets → Slides ───────────────────────────────────────── */
  function sheetToSlides(item, body) {
    var slides = [{ id: M.uid("sl"), layout: "title", hidden: false, notes: "", transition: "", elements: [
      { id: M.uid("e"), type: "text", x: 80, y: 200, w: 800, h: 80, text: item.title,
        size: 44, bold: true, align: "center", lh: 1.4, z: 1 }
    ] }];
    (body.charts || []).forEach(function (c) {
      var spec = chartSpecOf(body, c);
      slides.push({ id: M.uid("sl"), layout: "chart", hidden: false, notes: "", transition: "", elements: [
        { id: M.uid("e"), type: "text", x: 70, y: 45, w: 820, h: 42, text: c.title || "グラフ",
          size: 28, bold: true, align: "left", lh: 1.4, z: 1 },
        { id: M.uid("e"), type: "chart", x: 90, y: 105, w: 780, h: 375, z: 1, chart: spec }
      ] });
    });
    if (slides.length === 1) {
      /* グラフが無いときは、先頭のシートを表として載せる。 */
      var F = WP.formula;
      var s = (body.sheets || [])[0];
      if (!s) return null;
      var vals = F.recalc(s).values;
      var rows = [];
      for (var r = 1; r <= 8; r++) {
        var row = [];
        for (var c = 0; c <= 4; c++) {
          var v = vals[M.colName(c) + r];
          row.push(v === undefined ? "" : String(v));
        }
        if (row.some(function (x) { return x !== ""; })) rows.push(row);
      }
      if (!rows.length) return null;
      slides.push({ id: M.uid("sl"), layout: "title_body", hidden: false, notes: "", transition: "", elements: [
        { id: M.uid("e"), type: "text", x: 70, y: 50, w: 820, h: 42, text: s.name,
          size: 28, bold: true, align: "left", lh: 1.4, z: 1 },
        { id: M.uid("e"), type: "table", x: 70, y: 110, w: 820, h: 360, rows: rows, size: 15, z: 1 }
      ] });
    }
    return {
      title: item.title + "（発表用）",
      content: { schemaVersion: 1, content: { ratio: "16:9", theme: "minimal", slides: slides,
        transition: { type: "fade", speed: 300 } } }
    };
  }
  function chartSpecOf(body, c) {
    var F = WP.formula;
    var s = (body.sheets || [])[c.sheet || 0];
    if (!s) return { type: c.type, labels: [], series: [] };
    var m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(String(c.range || ""));
    if (!m) return { type: c.type, labels: [], series: [] };
    var vals = F.recalc(s).values;
    var c1 = M.colIndex(m[1]), r1 = Number(m[2]), c2 = M.colIndex(m[3]), r2 = Number(m[4]);
    var labels = [], series = [];
    for (var k = c1 + 1; k <= c2; k++)
      series.push({ name: String(vals[M.colName(k) + (r1 - 1)] || M.colName(k)), values: [] });
    if (!series.length) series.push({ name: "値", values: [] });
    for (var r = r1; r <= r2; r++) {
      labels.push(String(vals[M.colName(c1) + r] === undefined ? "" : vals[M.colName(c1) + r]));
      series.forEach(function (sr, i) {
        var cc = c1 + 1 + i;
        var v = cc <= c2 ? vals[M.colName(cc) + r] : vals[M.colName(c1) + r];
        sr.values.push(Number(v) || 0);
      });
    }
    return { type: c.type, title: c.title || "", labels: labels, series: series };
  }

  /* ── Slides → Docs ─────────────────────────────────────────── */
  function slidesToDoc(item, body) {
    var blocks = [{ id: M.uid("b"), type: "heading1", text: esc(item.title) }];
    (body.slides || []).forEach(function (s, i) {
      var texts = (s.elements || []).filter(function (e) { return e.text; });
      var title = texts.length ? String(texts[0].text) : (i + 1) + " 枚目";
      blocks.push({ id: M.uid("b"), type: "heading2", text: esc(title) });
      texts.slice(1).forEach(function (e) {
        String(e.text).split("\n").forEach(function (l) {
          var t = l.replace(/^[・\-*]\s*/, "").trim();
          if (t) blocks.push({ id: M.uid("b"), type: "bullet", text: esc(t) });
        });
      });
      if (s.notes) blocks.push({ id: M.uid("b"), type: "callout", text: esc("発表原稿: " + s.notes) });
    });
    if (blocks.length < 2) return null;
    return {
      title: item.title + "（原稿）",
      content: { schemaVersion: 1, content: { blocks: blocks,
        page: (WP.paper ? WP.paper.defaults() : { mode: "paper" }) } }
    };
  }

  /* ── Forms → Docs / Sheets ─────────────────────────────────── */
  function formToDoc(item, body) {
    var blocks = [{ id: M.uid("b"), type: "heading1", text: esc(item.title) }];
    if (item.description) blocks.push({ id: M.uid("b"), type: "paragraph", text: esc(item.description) });
    var n = 0;
    (body.sections || []).forEach(function (s) {
      if (s.title) blocks.push({ id: M.uid("b"), type: "heading2", text: esc(s.title) });
      (s.fields || []).forEach(function (f) {
        if (M.isDecoration(f.type)) {
          if (f.text) blocks.push({ id: M.uid("b"), type: "paragraph", text: esc(f.text) });
          return;
        }
        n++;
        blocks.push({ id: M.uid("b"), type: "heading3",
          text: esc(n + ". " + (f.label || "")) + (f.required ? "（必須）" : "") });
        (f.options || []).forEach(function (o) {
          blocks.push({ id: M.uid("b"), type: "bullet", text: esc(o.text) });
        });
        if (!(f.options || []).length)
          blocks.push({ id: M.uid("b"), type: "paragraph", text: "（自由記述）" });
      });
    });
    if (n === 0) return null;
    return {
      title: item.title + "（質問一覧）",
      content: { schemaVersion: 1, content: { blocks: blocks,
        page: (WP.paper ? WP.paper.defaults() : { mode: "paper" }) } }
    };
  }
  function formToSheet(item, body) {
    var head = ["回答日時"];
    (body.sections || []).forEach(function (s) {
      (s.fields || []).forEach(function (f) {
        if (M.isDecoration(f.type)) return;
        head.push(f.label || f.type);
      });
    });
    if (head.length < 2) return null;
    var s = M.newSheet("回答");
    head.forEach(function (t, i) { s.cells[M.colName(i) + "1"] = { v: t, s: { b: true, bg: "#eef2f7" } }; });
    s.freeze = { rows: 1, cols: 0 };
    s.cols = Math.max(20, head.length + 2);
    return {
      title: item.title + "（回答の表）",
      content: { schemaVersion: 1, content: { sheets: [s], charts: [], activeSheet: 0 } }
    };
  }

  /* ══ 個別の作成（画面から直接呼ばれるもの）═══════════════════ */
  function rowsToSheet(rows, title) {
    var s = M.newSheet("回答");
    rows.forEach(function (r, ri) {
      r.forEach(function (c, ci) {
        if (c === "" || c === undefined) return;
        var n = Number(String(c).replace(/,/g, ""));
        s.cells[M.colName(ci) + (ri + 1)] = {
          v: (!isNaN(n) && String(c).trim() !== "") ? n : c,
          s: ri === 0 ? { b: true, bg: "#eef2f7" } : undefined
        };
      });
    });
    s.freeze = { rows: 1, cols: 0 };
    s.rows = Math.max(60, rows.length + 10);
    s.cols = Math.max(20, (rows[0] || []).length + 3);
    return ST.create("spreadsheet", {
      title: title,
      content: { schemaVersion: 1, content: { sheets: [s], charts: [], activeSheet: 0 } }
    });
  }
  function chartToSlides(spec, item) {
    return ST.create("presentation", {
      title: (spec.title || item.title) + "（グラフ）",
      content: { schemaVersion: 1, content: { ratio: "16:9", theme: "minimal",
        transition: { type: "fade", speed: 300 },
        slides: [{ id: M.uid("sl"), layout: "chart", hidden: false, notes: "", transition: "", elements: [
          { id: M.uid("e"), type: "text", x: 70, y: 45, w: 820, h: 42, text: spec.title || item.title,
            size: 28, bold: true, align: "left", lh: 1.4, z: 1 },
          { id: M.uid("e"), type: "chart", x: 90, y: 105, w: 780, h: 375, z: 1, chart: spec }
        ] }] } }
    });
  }
  function formReport(item, count, charts) {
    var slides = [
      { id: M.uid("sl"), layout: "title", hidden: false, notes: "", transition: "", elements: [
        { id: M.uid("e"), type: "text", x: 80, y: 190, w: 800, h: 90, text: item.title + " の結果",
          size: 42, bold: true, align: "center", lh: 1.4, z: 1 },
        { id: M.uid("e"), type: "text", x: 80, y: 300, w: 800, h: 40, text: "回答 " + count + " 件",
          size: 20, align: "center", color: "#64748b", lh: 1.4, z: 1 }
      ] },
      { id: M.uid("sl"), layout: "number", hidden: false, notes: "", transition: "", elements: [
        { id: M.uid("e"), type: "number", x: 80, y: 160, w: 800, h: 220, text: String(count),
          label: "回答数", size: 96, z: 1 }
      ] }
    ].concat(charts.map(function (c) {
      return { id: M.uid("sl"), layout: "chart", hidden: false, notes: "", transition: "", elements: [
        { id: M.uid("e"), type: "text", x: 70, y: 45, w: 820, h: 42, text: c.title,
          size: 26, bold: true, align: "left", lh: 1.4, z: 1 },
        { id: M.uid("e"), type: "chart", x: 90, y: 105, w: 780, h: 375, z: 1, chart: c.chart }
      ] };
    }));
    return ST.create("presentation", {
      title: item.title + " の結果レポート",
      content: { schemaVersion: 1, content: { ratio: "16:9", theme: "minimal", slides: slides,
        transition: { type: "fade", speed: 300 } } }
    });
  }
  function textToDoc(title, text, meta) {
    var blocks = [{ id: M.uid("b"), type: "heading1", text: esc(title) }];
    if (meta) blocks.push({ id: M.uid("b"), type: "callout",
      text: esc("回答総数 " + meta.total + " 件 / 分析対象 " + meta.analyzed + " 件 / 除外 "
        + meta.excluded + " 件。以下は AI による分析であり、事実の確認は行われていません。") });
    String(text).split(/\r?\n/).forEach(function (line) {
      var t = line.trim();
      if (!t) return;
      var m = /^(#{1,4})\s+(.*)$/.exec(t);
      if (m) { blocks.push({ id: M.uid("b"), type: "heading" + Math.min(3, m[1].length + 1), text: esc(m[2]) }); return; }
      if (/^[-*・]\s+/.test(t)) { blocks.push({ id: M.uid("b"), type: "bullet", text: esc(t.replace(/^[-*・]\s+/, "")) }); return; }
      if (/^\d+[.)]\s+/.test(t)) { blocks.push({ id: M.uid("b"), type: "number", text: esc(t.replace(/^\d+[.)]\s+/, "")) }); return; }
      blocks.push({ id: M.uid("b"), type: "paragraph", text: esc(t) });
    });
    return ST.create("document", {
      title: title,
      content: { schemaVersion: 1, content: { blocks: blocks,
        page: (WP.paper ? WP.paper.defaults() : { mode: "paper" }) } }
    });
  }

  WP.convert = { targetsFor: targetsFor, run: run, CONVERTS: CONVERTS,
    rowsToSheet: rowsToSheet, chartToSlides: chartToSlides, formReport: formReport, textToDoc: textToDoc };
})(typeof globalThis !== "undefined" ? globalThis : this);
