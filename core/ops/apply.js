/* ══════════════════════════════════════════════════════════════════════
   core/ops/apply.js — 操作を **保存形式**へ当てる

   ★ 直すのは content（保存形式）そのもの。WorkIR は読むだけの写し。
   ★ ここは Guard の中から、**作業用のコピー**に対して呼ばれる。
     通ったときだけ 本物へ入れ替える。
   ★ 「見つからなかった」を黙って握りつぶさない。必ず 理由を返す。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});
  var I = VQW.ir;

  function 文(v) { return v === undefined || v === null ? "" : String(v); }
  function 配(v) { return Array.isArray(v) ? v : []; }
  function 複(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

  /* ── 写しの節点 → 保存形式 ────────────────────────────────── */
  function docsBlockOf(n) {
    var a = n.attrs || {}, t = 文(n.type);
    var ty = t === "heading" ? "heading" + (Math.min(4, Math.max(1, +a.level || 1)))
           : t === "listItem" ? (a.marker === "number" ? "number" : "bullet")
           : t === "pageBreak" ? "pagebreak"
           : t;
    var b = { id: 文(n.id) || I.wpId("b"), type: ty, text: 文(n.text) };
    if (ty === "todo") b.checked = !!a.checked;
    if (ty === "image") { b.src = 文(a.src); b.width = Number(a.width) || 100;
                          b.alt = 文(a.alt); b.caption = 文(a.caption); }
    if (ty === "math") b.text = 文(a.latex || n.text);
    if (ty === "field") { b.key = 文(a.key); b.label = 文(a.label);
                          b.dataType = 文(a.dataType) || "text"; b.hint = 文(a.hint); }
    if (ty === "answerSpace") { b.lines = Number(a.lines) || 3; b.label = 文(a.label); }
    if (ty === "table") {
      b.header = a.header !== false;
      b.rows = 配(n.children).length
        ? 配(n.children).map(function (r) { return 配(r.children).map(function (c) { return 文(c.text); }); })
        : (配(a.rows).length ? 複(a.rows) : [["", ""], ["", ""]]);
      if (a.colW) b.colW = 複(a.colW);
    }
    return b;
  }

  function slideElOf(n) {
    var a = n.attrs || {};
    var ty = a.type ? 文(a.type)
      : ({ textFrame: "text", imageFrame: "image", shape: "shape",
           line: "line", table: "table", chart: "chart" }[文(n.type)] || "text");
    var e = { id: 文(n.id) || I.wpId("e"), type: ty };
    Object.keys(a).forEach(function (k) { if (k !== "type") e[k] = 複(a[k]); });
    if (n.text !== undefined) e.text = 文(n.text);
    if (e.x === undefined) e.x = 70;
    if (e.y === undefined) e.y = 300;
    if (e.w === undefined) e.w = 820;
    if (e.h === undefined) e.h = 80;
    return e;
  }

  function slideOf(n) {
    var a = n.attrs || {};
    return { id: 文(n.id) || I.wpId("sl"), layout: 文(a.layout) || "title_body",
             elements: 配(n.children).map(slideElOf), notes: 文(n.text),
             hidden: !!a.hidden, background: 文(a.background), transition: 文(a.transition) };
  }

  function sheetOf(n) {
    var a = n.attrs || {}, sh = {
      id: 文(n.id) || I.wpId("sh"), name: 文(a.name) || "シート",
      rows: Number(a.rows) || 60, cols: Number(a.cols) || 20,
      cells: {}, colW: 複(a.colW) || {}, rowH: 複(a.rowH) || {},
      merges: 複(a.merges) || [], freeze: 複(a.freeze) || { rows: 0, cols: 0 },
      hidden: false, color: "", filters: null, conditionals: []
    };
    配(n.children).forEach(function (c) {
      var ref = 文((c.attrs || {}).ref).toUpperCase();
      if (!/^[A-Z]+\d+$/.test(ref)) return;
      sh.cells[ref] = cellOf(c);
    });
    return sh;
  }

  function cellOf(n) {
    var a = n.attrs || {}, cl = {};
    if (a.formula) cl.f = 文(a.formula);
    else cl.v = 文(n.text);
    if (a.hint) cl.h = 文(a.hint);
    if (a.style) cl.s = 複(a.style);
    if (a.dataType) cl.t = 文(a.dataType);
    return cl;
  }

  function fieldOf(n) {
    var a = n.attrs || {}, f = { id: 文(n.id) || I.wpId("f"),
      type: 文(a.type) || "short_text", label: 文(n.text) };
    Object.keys(a).forEach(function (k) { if (k !== "type") f[k] = 複(a[k]); });
    f.type = 文(a.type) || "short_text";
    return f;
  }

  function sectionOf(n) {
    var a = n.attrs || {};
    return { id: 文(n.id) || I.wpId("s"), title: 文(n.text),
             description: 文(a.description), fields: 配(n.children).map(fieldOf) };
  }

  /* ══ 1 つの操作を当てる。返りは { ok } か { だめ } ═══════════════ */
  function 当てる(kind, content, op) {
    var c = content, L = I.locate(kind, c, op.nodeId || op.parentId);

    /* ── setLock は 中身を触らない（__work に持つ）── */
    if (op.op === "setLock") {
      c.__work = c.__work || {};
      var ls = 配(c.__work.locks).slice();
      var id = 文(op.nodeId), at = ls.indexOf(id);
      if (op.locked && at < 0) ls.push(id);
      if (!op.locked && at >= 0) ls.splice(at, 1);
      c.__work.locks = ls;
      return { ok: true };
    }

    if (kind === "docs") return docs当てる(c, op);
    if (kind === "sheets") return sheets当てる(c, op);
    if (kind === "slides") return slides当てる(c, op);
    if (kind === "forms") return forms当てる(c, op);
    return { だめ: "知らない種類です（" + kind + "）" };
  }

  /* ── Docs ─────────────────────────────────────────────────── */
  function docs当てる(c, op) {
    c.blocks = 配(c.blocks);
    var 位 = op.nodeId ? I.locate("docs", c, op.nodeId) : null;
    if (op.op === "insertNode") {
      var pid = 文(op.parentId) || "root";
      if (pid === "root") {
        var b = docsBlockOf(op.node || {});
        var i = op.index === undefined ? c.blocks.length : Math.max(0, Math.min(c.blocks.length, +op.index));
        c.blocks.splice(i, 0, b);
        return { ok: true, 入れたID: b.id };
      }
      var 表 = I.locate("docs", c, pid);
      if (!表 || 表.k !== "block" || c.blocks[表.i].type !== "table")
        return { だめ: "そこへは足せません（" + pid + "）" };
      var t = c.blocks[表.i];
      t.rows = 配(t.rows);
      var 列 = (t.rows[0] || []).length || 2;
      var 行 = 配((op.node || {}).children).length
        ? 配(op.node.children).map(function (x) { return 文(x.text); })
        : new Array(列).join(",").split(",");
      while (行.length < 列) 行.push("");
      var k = op.index === undefined ? t.rows.length : Math.max(0, Math.min(t.rows.length, +op.index));
      t.rows.splice(k, 0, 行.slice(0, 列));
      return { ok: true, 入れたID: I.rowId(t.id, k) };
    }
    if (!位) return { だめ: "その節点が見つかりません（" + 文(op.nodeId) + "）" };

    if (位.k === "block") {
      var blk = c.blocks[位.i];
      if (op.op === "setText") { blk.text = 文(op.text); return { ok: true }; }
      if (op.op === "setAttrs") { 属性を当てる(blk, op.attrs || {}); return { ok: true }; }
      if (op.op === "deleteNode") {
        if (c.blocks.length <= 1) return { だめ: "最後の 1 つは消せません。" };
        c.blocks.splice(位.i, 1); return { ok: true };
      }
      if (op.op === "moveNode") {
        var m = c.blocks.splice(位.i, 1)[0];
        var j = op.index === undefined ? c.blocks.length : Math.max(0, Math.min(c.blocks.length, +op.index));
        c.blocks.splice(j, 0, m); return { ok: true };
      }
      if (op.op === "replaceNode") {
        var 新 = docsBlockOf(op.node || {});
        新.id = blk.id;                    /* ★ ID は引き継ぐ（§3.4）*/
        c.blocks[位.i] = 新; return { ok: true };
      }
    }
    if (位.k === "trow") {
      var tb = c.blocks[位.i]; tb.rows = 配(tb.rows);
      if (op.op === "deleteNode") {
        if (tb.rows.length <= 1) return { だめ: "最後の行は消せません。" };
        tb.rows.splice(位.r, 1); return { ok: true };
      }
      if (op.op === "moveNode") {
        var rr = tb.rows.splice(位.r, 1)[0];
        var ri = op.index === undefined ? tb.rows.length : Math.max(0, Math.min(tb.rows.length, +op.index));
        tb.rows.splice(ri, 0, rr); return { ok: true };
      }
      if (op.op === "replaceNode") {
        tb.rows[位.r] = 配((op.node || {}).children).map(function (x) { return 文(x.text); });
        return { ok: true };
      }
    }
    if (位.k === "tcell") {
      var tc = c.blocks[位.i]; tc.rows = 配(tc.rows);
      if (!tc.rows[位.r]) return { だめ: "その行がありません。" };
      if (op.op === "setText") { tc.rows[位.r][位.c] = 文(op.text); return { ok: true }; }
      if (op.op === "deleteNode") { tc.rows[位.r][位.c] = ""; return { ok: true }; }
    }
    return { だめ: "その操作はここでは使えません（" + op.op + "）" };
  }

  function 属性を当てる(blk, a) {
    Object.keys(a).forEach(function (k) {
      var v = a[k];
      if (k === "level") { blk.type = "heading" + Math.min(4, Math.max(1, +v || 1)); return; }
      if (k === "marker") { blk.type = v === "number" ? "number" : "bullet"; return; }
      if (k === "latex") { blk.type = "math"; blk.text = 文(v); return; }
      if (k === "rows" || k === "colW") { blk[k] = 複(v); return; }
      blk[k] = (v && typeof v === "object") ? 複(v) : v;
    });
  }

  /* ── Sheets ───────────────────────────────────────────────── */
  function sheets当てる(c, op) {
    c.sheets = 配(c.sheets); c.charts = 配(c.charts);
    if (op.op === "insertNode") {
      var pid = 文(op.parentId) || "root";
      if (pid === "root") {
        var n = op.node || {};
        if (n.type === "chart") {
          var g = { id: 文(n.id) || I.wpId("ch"), type: 文((n.attrs || {}).type) || "bar",
                    range: 文((n.attrs || {}).range), title: 文(n.text),
                    sheet: Number((n.attrs || {}).sheet) || 0 };
          c.charts.push(g); return { ok: true, 入れたID: g.id };
        }
        var sh = sheetOf(n);
        var i = op.index === undefined ? c.sheets.length : Math.max(0, Math.min(c.sheets.length, +op.index));
        c.sheets.splice(i, 0, sh); return { ok: true, 入れたID: sh.id };
      }
      var 位0 = I.locate("sheets", c, pid);
      if (!位0 || 位0.k !== "sheet") return { だめ: "そこへは足せません（" + pid + "）" };
      var s0 = c.sheets[位0.i];
      var ref0 = 文(((op.node || {}).attrs || {}).ref).toUpperCase();
      if (!/^[A-Z]+\d+$/.test(ref0)) return { だめ: "番地がありません（attrs.ref）" };
      s0.cells = s0.cells || {};
      s0.cells[ref0] = cellOf(op.node);
      return { ok: true, 入れたID: I.cellId(s0.id, ref0) };
    }
    var 位 = I.locate("sheets", c, op.nodeId);
    if (!位) return { だめ: "その節点が見つかりません（" + 文(op.nodeId) + "）" };
    if (位.k === "cell") {
      var sh2 = c.sheets[位.i]; sh2.cells = sh2.cells || {};
      var cl = sh2.cells[位.ref] || (sh2.cells[位.ref] = {});
      if (op.op === "setText") { delete cl.f; cl.v = 文(op.text); return { ok: true }; }
      if (op.op === "setFormula") {
        var f = 文(op.formula).trim();
        if (f && f.charAt(0) !== "=") f = "=" + f;
        delete cl.v; cl.f = f; return { ok: true };
      }
      if (op.op === "setAttrs") {
        var a = op.attrs || {};
        if (a.hint !== undefined) { if (a.hint) cl.h = 文(a.hint); else delete cl.h; }
        if (a.style !== undefined) { if (a.style) cl.s = 複(a.style); else delete cl.s; }
        if (a.dataType !== undefined) { if (a.dataType) cl.t = 文(a.dataType); else delete cl.t; }
        return { ok: true };
      }
      if (op.op === "deleteNode") { delete sh2.cells[位.ref]; return { ok: true }; }
      if (op.op === "replaceNode") { sh2.cells[位.ref] = cellOf(op.node || {}); return { ok: true }; }
    }
    if (位.k === "sheet") {
      var s = c.sheets[位.i];
      if (op.op === "setText") { s.name = 文(op.text); return { ok: true }; }
      if (op.op === "setAttrs") {
        var b = op.attrs || {};
        Object.keys(b).forEach(function (k) {
          if (k === "cells") return;                       /* マスは cell の操作で */
          s[k] = (b[k] && typeof b[k] === "object") ? 複(b[k]) : b[k];
        });
        return { ok: true };
      }
      if (op.op === "deleteNode") {
        if (c.sheets.length <= 1) return { だめ: "最後のシートは消せません。" };
        c.sheets.splice(位.i, 1);
        if (c.activeSheet >= c.sheets.length) c.activeSheet = c.sheets.length - 1;
        return { ok: true };
      }
    }
    if (位.k === "chart") {
      var g2 = c.charts[位.i];
      if (op.op === "setText") { g2.title = 文(op.text); return { ok: true }; }
      if (op.op === "setAttrs") {
        Object.keys(op.attrs || {}).forEach(function (k) { g2[k] = op.attrs[k]; });
        return { ok: true };
      }
      if (op.op === "deleteNode") { c.charts.splice(位.i, 1); return { ok: true }; }
    }
    return { だめ: "その操作はここでは使えません（" + op.op + "）" };
  }

  /* ── Slides ───────────────────────────────────────────────── */
  function slides当てる(c, op) {
    c.slides = 配(c.slides);
    if (op.op === "insertNode") {
      var pid = 文(op.parentId) || "root";
      if (pid === "root") {
        var sl = slideOf(op.node || {});
        var i = op.index === undefined ? c.slides.length : Math.max(0, Math.min(c.slides.length, +op.index));
        c.slides.splice(i, 0, sl); return { ok: true, 入れたID: sl.id };
      }
      var 位0 = I.locate("slides", c, pid);
      if (!位0 || 位0.k !== "slide") return { だめ: "そこへは足せません（" + pid + "）" };
      var p = c.slides[位0.i]; p.elements = 配(p.elements);
      var e = slideElOf(op.node || {});
      var j = op.index === undefined ? p.elements.length : Math.max(0, Math.min(p.elements.length, +op.index));
      p.elements.splice(j, 0, e); return { ok: true, 入れたID: e.id };
    }
    var 位 = I.locate("slides", c, op.nodeId);
    if (!位) return { だめ: "その節点が見つかりません（" + 文(op.nodeId) + "）" };
    if (位.k === "slide") {
      var s = c.slides[位.i];
      if (op.op === "setText") { s.notes = 文(op.text); return { ok: true }; }
      if (op.op === "setAttrs") {
        Object.keys(op.attrs || {}).forEach(function (k) {
          if (k === "elements") return;
          s[k] = op.attrs[k];
        });
        return { ok: true };
      }
      if (op.op === "deleteNode") {
        if (c.slides.length <= 1) return { だめ: "最後の 1 枚は消せません。" };
        c.slides.splice(位.i, 1); return { ok: true };
      }
      if (op.op === "moveNode") {
        var m = c.slides.splice(位.i, 1)[0];
        var k2 = op.index === undefined ? c.slides.length : Math.max(0, Math.min(c.slides.length, +op.index));
        c.slides.splice(k2, 0, m); return { ok: true };
      }
      if (op.op === "replaceNode") {
        var 新 = slideOf(op.node || {}); 新.id = s.id;
        c.slides[位.i] = 新; return { ok: true };
      }
    }
    if (位.k === "el") {
      var pg = c.slides[位.i], el = pg.elements[位.j];
      if (op.op === "setText") { el.text = 文(op.text); return { ok: true }; }
      if (op.op === "setAttrs") {
        Object.keys(op.attrs || {}).forEach(function (k) {
          el[k] = (op.attrs[k] && typeof op.attrs[k] === "object") ? 複(op.attrs[k]) : op.attrs[k];
        });
        return { ok: true };
      }
      if (op.op === "deleteNode") { pg.elements.splice(位.j, 1); return { ok: true }; }
      if (op.op === "moveNode") {
        var 先 = I.locate("slides", c, 文(op.newParentId));
        if (!先 || 先.k !== "slide") return { だめ: "移す先のページがありません。" };
        var mv = pg.elements.splice(位.j, 1)[0];
        var 先p = c.slides[先.i]; 先p.elements = 配(先p.elements);
        var idx = op.index === undefined ? 先p.elements.length
          : Math.max(0, Math.min(先p.elements.length, +op.index));
        先p.elements.splice(idx, 0, mv); return { ok: true };
      }
      if (op.op === "replaceNode") {
        var 新e = slideElOf(op.node || {}); 新e.id = el.id;
        pg.elements[位.j] = 新e; return { ok: true };
      }
    }
    return { だめ: "その操作はここでは使えません（" + op.op + "）" };
  }

  /* ── Forms ────────────────────────────────────────────────── */
  function forms当てる(c, op) {
    c.sections = 配(c.sections);
    if (op.op === "insertNode") {
      var pid = 文(op.parentId) || "root";
      if (pid === "root") {
        var sec = sectionOf(op.node || {});
        var i = op.index === undefined ? c.sections.length : Math.max(0, Math.min(c.sections.length, +op.index));
        c.sections.splice(i, 0, sec); return { ok: true, 入れたID: sec.id };
      }
      var 位0 = I.locate("forms", c, pid);
      if (!位0 || 位0.k !== "section") return { だめ: "そこへは足せません（" + pid + "）" };
      var s0 = c.sections[位0.i]; s0.fields = 配(s0.fields);
      var f = fieldOf(op.node || {});
      var j = op.index === undefined ? s0.fields.length : Math.max(0, Math.min(s0.fields.length, +op.index));
      s0.fields.splice(j, 0, f); return { ok: true, 入れたID: f.id };
    }
    var 位 = I.locate("forms", c, op.nodeId);
    if (!位) return { だめ: "その節点が見つかりません（" + 文(op.nodeId) + "）" };
    var 対 = 位.k === "section" ? c.sections[位.i] : c.sections[位.i].fields[位.j];
    var 鍵 = 位.k === "section" ? "title" : "label";
    if (op.op === "setText") { 対[鍵] = 文(op.text); return { ok: true }; }
    if (op.op === "setAttrs") {
      Object.keys(op.attrs || {}).forEach(function (k) {
        if (k === "fields") return;
        対[k] = (op.attrs[k] && typeof op.attrs[k] === "object") ? 複(op.attrs[k]) : op.attrs[k];
      });
      return { ok: true };
    }
    if (op.op === "deleteNode") {
      if (位.k === "section") {
        if (c.sections.length <= 1) return { だめ: "最後のまとまりは消せません。" };
        c.sections.splice(位.i, 1);
      } else c.sections[位.i].fields.splice(位.j, 1);
      return { ok: true };
    }
    if (op.op === "moveNode" && 位.k === "field") {
      var 先 = I.locate("forms", c, 文(op.newParentId));
      if (!先 || 先.k !== "section") return { だめ: "移す先のまとまりがありません。" };
      var mv = c.sections[位.i].fields.splice(位.j, 1)[0];
      var t = c.sections[先.i]; t.fields = 配(t.fields);
      var idx = op.index === undefined ? t.fields.length : Math.max(0, Math.min(t.fields.length, +op.index));
      t.fields.splice(idx, 0, mv); return { ok: true };
    }
    if (op.op === "replaceNode") {
      if (位.k === "section") { var ns = sectionOf(op.node || {}); ns.id = 対.id; c.sections[位.i] = ns; }
      else { var nf = fieldOf(op.node || {}); nf.id = 対.id; c.sections[位.i].fields[位.j] = nf; }
      return { ok: true };
    }
    return { だめ: "その操作はここでは使えません（" + op.op + "）" };
  }

  /* ══ 操作列を まとめて当てる（作業用のコピーに対して）═══════════ */
  function applyAll(kind, content, operations) {
    var 済 = [], 落 = [];
    (operations || []).forEach(function (op, i) {
      var r;
      try { r = 当てる(kind, content, op); }
      catch (e) { r = { だめ: "しくじりました（" + String(e && e.message || e).slice(0, 60) + "）" }; }
      if (r && r.ok) 済.push({ 番: i + 1, op: op.op, nodeId: op.nodeId || op.parentId, 入れたID: r.入れたID });
      else 落.push({ 番: i + 1, op: op.op, nodeId: op.nodeId || op.parentId,
                     なぜ: (r && r.だめ) || "不明" });
    });
    return { 済: 済, 落: 落 };
  }

  VQW.ops = VQW.ops || {};
  VQW.ops.applyAll = applyAll;
  VQW.ops.当てる = 当てる;
  VQW.ops.docsBlockOf = docsBlockOf;
  VQW.ops.slideElOf = slideElOf;
  VQW.ops.slideOf = slideOf;
  VQW.ops.sheetOf = sheetOf;
  VQW.ops.cellOf = cellOf;
  VQW.ops.fieldOf = fieldOf;
  VQW.ops.sectionOf = sectionOf;
})(typeof globalThis !== "undefined" ? globalThis : this);
