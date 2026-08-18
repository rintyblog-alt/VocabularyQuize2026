/* ══════════════════════════════════════════════════════════════════════
   core/ir/project.js — 保存形式 → WorkIR（写し）と 場所の割り出し

   ★ 一方通行。WorkIR から保存形式へ戻す道は **作らない**（types.js の頭）。
     直すのは ops/apply.js が 保存形式に対して行い、ここは読むだけ。
   ★ 箇条書きは 保存形式では **平ら**（list の親が無い）。
     写しのために list の親をこしらえると、その親の ID は
     項目を足すたびに変わってしまい、Guard の突き合わせが崩れる。
     **平らのまま listItem で写す。**
   ★ 表のマス・シートのマスは 保存形式に ID が無いので 合成 ID（ids.js）。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});
  var I = VQW.ir;

  function 文(v) { return v === undefined || v === null ? "" : String(v); }
  function 配(v) { return Array.isArray(v) ? v : []; }

  /* Docs の text は **HTML**（contenteditable の innerHTML をそのまま保存）。
     文字数・プレースホルダ・数式の検査は 生の文字に対して行う。 */
  function 素(s) {
    return 文(s)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  }

  /* ── Docs のブロック種 → 写しの種 ─────────────────────────── */
  var 種 = {
    paragraph: "paragraph", heading1: "heading", heading2: "heading",
    heading3: "heading", heading4: "heading",
    bullet: "listItem", number: "listItem", todo: "todo",
    quote: "quote", code: "code", callout: "callout",
    divider: "divider", pagebreak: "pageBreak", image: "image",
    table: "table", toc: "toc", math: "math",
    field: "field", answerSpace: "answerSpace", section: "section"
  };
  var 逆種 = { heading: "heading1", listItem: "bullet", pageBreak: "pagebreak" };

  function docsNode(b, i) {
    var t = 種[文(b.type)] || "paragraph";
    var a = {};
    if (/^heading([1-4])$/.test(文(b.type))) a.level = +文(b.type).slice(-1);
    if (b.type === "bullet") a.marker = "bullet";
    if (b.type === "number") a.marker = "number";
    if (b.type === "todo") a.checked = !!b.checked;
    if (b.type === "image") { a.src = 文(b.src); a.width = Number(b.width) || 100;
                              a.alt = 文(b.alt); a.caption = 文(b.caption); }
    if (b.type === "math") a.latex = 素(b.text);
    if (b.type === "field") { a.key = 文(b.key); a.label = 文(b.label);
                              a.dataType = 文(b.dataType) || "text"; a.hint = 文(b.hint); }
    if (b.type === "answerSpace") { a.lines = Number(b.lines) || 3; a.label = 文(b.label); }
    if (b.type === "table") { a.header = b.header !== false; a.colW = b.colW || null; }
    var n = I.newNode(t, 文(b.id), { attrs: a, text: 文(b.text) });
    if (b.type === "table") {
      n.children = [];
      配(b.rows).forEach(function (r, ri) {
        var row = I.newNode("tableRow", I.rowId(b.id, ri), { attrs: {}, children: [] });
        配(r).forEach(function (c, ci) {
          row.children.push(I.newNode("tableCell", I.cellInTable(b.id, ri, ci),
            { attrs: { r: ri, c: ci, header: (b.header !== false) && ri === 0 }, text: 文(c) }));
        });
        n.children.push(row);
      });
    }
    return n;
  }

  /* ── Sheets ───────────────────────────────────────────────── */
  function cellNode(sh, ref) {
    var cl = (sh.cells || {})[ref] || {};
    var t = cl.f ? "formulaCell"
          : (cl.h && 文(cl.v) === "") ? "inputCell"
          : "valueCell";
    var a = { ref: ref };
    if (cl.f) a.formula = 文(cl.f);
    if (cl.h) a.hint = 文(cl.h);
    if (cl.s) a.style = cl.s;
    if (cl.t) a.dataType = 文(cl.t);          /* money / date / percent など */
    return I.newNode(t, I.cellId(sh.id, ref), { attrs: a, text: 文(cl.v) });
  }

  /* ── Slides ───────────────────────────────────────────────── */
  var 箱 = { text: "textFrame", number: "textFrame", image: "imageFrame",
             shape: "shape", line: "line", arrow: "line",
             table: "table", chart: "chart" };
  function elNode(e) {
    var t = 箱[文(e.type)] || "shape";
    var a = {};
    Object.keys(e).forEach(function (k) {
      if (k === "id" || k === "text") return;
      a[k] = e[k];
    });
    return I.newNode(t, 文(e.id), { attrs: a, text: 文(e.text) });
  }

  /* ══ 写しを作る ═══════════════════════════════════════════════ */
  function toIR(kindOrItemType, content, meta) {
    var kind = I.kindOf(kindOrItemType) || kindOrItemType;
    var c = content || {};
    var w = c.__work || {};
    var d = I.newDoc({
      docId: 文(meta && meta.docId), kind: kind,
      docType: (meta && meta.docType) || w.docType || null,
      docTypeMatch: (meta && meta.docTypeMatch) || w.docTypeMatch || "none",
      version: Number(w.version) || 0,
      title: 文(meta && meta.title),
      meta: (meta && meta.meta) || {},
      locks: 配(w.locks).slice()
    });

    if (kind === "docs") {
      d.root = I.newNode("document", "root", { attrs: { page: c.page || null }, children: [] });
      配(c.blocks).forEach(function (b, i) { d.root.children.push(docsNode(b, i)); });
    } else if (kind === "sheets") {
      d.root = I.newNode("workbook", "root",
        { attrs: { activeSheet: Number(c.activeSheet) || 0 }, children: [] });
      配(c.sheets).forEach(function (sh) {
        var s = I.newNode("sheet", 文(sh.id),
          { attrs: { name: 文(sh.name), rows: sh.rows, cols: sh.cols,
                     merges: sh.merges || [], freeze: sh.freeze || null,
                     colW: sh.colW || {}, rowH: sh.rowH || {} }, children: [] });
        Object.keys(sh.cells || {}).sort(セル順).forEach(function (ref) {
          s.children.push(cellNode(sh, ref));
        });
        d.root.children.push(s);
      });
      配(c.charts).forEach(function (g) {
        d.root.children.push(I.newNode("chart", 文(g.id),
          { attrs: { type: 文(g.type), range: 文(g.range), sheet: g.sheet }, text: 文(g.title) }));
      });
    } else if (kind === "slides") {
      d.root = I.newNode("deck", "root",
        { attrs: { ratio: 文(c.ratio), theme: 文(c.theme),
                   designSeed: c.designSeed || null }, children: [] });
      配(c.slides).forEach(function (sl) {
        var p = I.newNode("page", 文(sl.id),
          { attrs: { layout: 文(sl.layout), background: 文(sl.background),
                     hidden: !!sl.hidden }, text: 文(sl.notes), children: [] });
        配(sl.elements).forEach(function (e) { p.children.push(elNode(e)); });
        d.root.children.push(p);
      });
    } else if (kind === "forms") {
      d.root = I.newNode("form", "root",
        { attrs: { settings: c.settings || null }, children: [] });
      配(c.sections).forEach(function (s) {
        var sec = I.newNode("formSection", 文(s.id),
          { attrs: { description: 文(s.description) }, text: 文(s.title), children: [] });
        配(s.fields).forEach(function (f) {
          var a = {};
          Object.keys(f).forEach(function (k) { if (k !== "id" && k !== "label") a[k] = f[k]; });
          sec.children.push(I.newNode("formField", 文(f.id), { attrs: a, text: 文(f.label) }));
        });
        d.root.children.push(sec);
      });
    }
    return d;
  }

  /* A1 の並び（列 → 行）。並びが毎回同じでないと ハッシュがぶれる。 */
  function 割(ref) {
    var m = String(ref).toUpperCase().match(/^([A-Z]+)(\d+)$/);
    if (!m) return [0, 0];
    var c = 0;
    for (var i = 0; i < m[1].length; i++) c = c * 26 + (m[1].charCodeAt(i) - 64);
    return [+m[2], c];
  }
  function セル順(a, b) {
    var x = 割(a), y = 割(b);
    return x[0] - y[0] || x[1] - y[1];
  }

  /* ══ 場所の割り出し（保存形式のどこか）═══════════════════════════ */
  function locate(kindOrItemType, content, id) {
    var kind = I.kindOf(kindOrItemType) || kindOrItemType;
    var c = content || {}, s = 文(id);
    if (s === "root") return { k: "root" };
    var 合 = I.割る合成(s);

    if (kind === "docs") {
      var bs = 配(c.blocks);
      if (合 && (合.種 === "trow" || 合.種 === "tcell")) {
        for (var i = 0; i < bs.length; i++) if (bs[i].id === 合.親) {
          return 合.種 === "trow"
            ? { k: "trow", i: i, r: 合.r }
            : { k: "tcell", i: i, r: 合.r, c: 合.c };
        }
        return null;
      }
      for (var j = 0; j < bs.length; j++) if (文(bs[j].id) === s) return { k: "block", i: j };
      return null;
    }
    if (kind === "sheets") {
      var shs = 配(c.sheets);
      if (合 && 合.種 === "cell") {
        for (var k = 0; k < shs.length; k++) if (文(shs[k].id) === 合.親)
          return { k: "cell", i: k, ref: 合.ref };
        return null;
      }
      for (var m2 = 0; m2 < shs.length; m2++) if (文(shs[m2].id) === s) return { k: "sheet", i: m2 };
      var gs = 配(c.charts);
      for (var n = 0; n < gs.length; n++) if (文(gs[n].id) === s) return { k: "chart", i: n };
      return null;
    }
    if (kind === "slides") {
      var sls = 配(c.slides);
      for (var p = 0; p < sls.length; p++) {
        if (文(sls[p].id) === s) return { k: "slide", i: p };
        var es = 配(sls[p].elements);
        for (var q = 0; q < es.length; q++) if (文(es[q].id) === s)
          return { k: "el", i: p, j: q };
      }
      return null;
    }
    if (kind === "forms") {
      var ss = 配(c.sections);
      for (var r = 0; r < ss.length; r++) {
        if (文(ss[r].id) === s) return { k: "section", i: r };
        var fs = 配(ss[r].fields);
        for (var t = 0; t < fs.length; t++) if (文(fs[t].id) === s)
          return { k: "field", i: r, j: t };
      }
      return null;
    }
    return null;
  }

  VQW.ir = VQW.ir || {};
  VQW.ir.toIR = toIR;
  VQW.ir.locate = locate;
  VQW.ir.素 = 素;
  VQW.ir.docsNode = docsNode;
  VQW.ir.逆種 = 逆種;
  VQW.ir.セル順 = セル順;
})(typeof globalThis !== "undefined" ? globalThis : this);
