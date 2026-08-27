/* ══════════════════════════════════════════════════════════════════════
   core/pipeline/repair.js — 崩れを **計算で** 直す

   ★ 直しかたは 決めうち。AI に「直して」と頼まない（頼むと 別の所が壊れる）。
   ★ 直せないものは 直せないと言う。**でっち上げて埋めない。**
     とくに 値が要る所（金額・氏名・番号）は、直しかたが「空欄に戻す」しかない。
   ★ 同じ節点は 2 回まで。3 周やって残ったら 「要確認」の印をつけて 出す
     （止まり続けるより、印をつけて出す）。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});

  function 文(v) { return v === undefined || v === null ? "" : String(v); }

  /* ── 1 つの崩れに対する 直しかた ─────────────────────────────
     返りは 操作の並び（ops）。空なら 直せない。 */
  function 手だて(kind, content, doc, e, dt) {
    var ops = [];
    var n = e.nodeId ? VQW.ir.find(doc.root, e.nodeId) : null;

    if (e.code === "colTooNarrow" && e.直しかた && e.直しかた.種 === "colW") {
      var sh = VQW.ir.find(doc.root, e.直しかた.sheetId);
      if (!sh) return ops;
      var colW = {};
      Object.keys((sh.attrs || {}).colW || {}).forEach(function (k) { colW[k] = (sh.attrs.colW)[k]; });
      colW[e.直しかた.列] = e.直しかた.幅;
      ops.push({ op: "setAttrs", nodeId: sh.id, attrs: { colW: colW } });
      return ops;
    }

    if (e.code === "numberAsText" && n) {
      var t = 文(n.text).trim();
      var 数 = t.replace(/,/g, "").replace(
        /(円|¥|＄|\$|%|％|人|名|個|点|冊|枚|件|回|台|本|kg|g|t|m|km|cm|mm|時間|分|秒|日|ヶ月|か月)$/, "").trim();
      if (/^-?\d+(\.\d+)?$/.test(数)) {
        ops.push({ op: "setText", nodeId: n.id, text: 数 });
        return ops;
      }
      return ops;                        /* 数にできないものは 触らない */
    }

    if (e.code === "mathShouldBeBlock" && n && kind === "docs") {
      var s = VQW.ir.素(n.text).trim().replace(/^\$\$?|\$\$?$/g, "").trim();
      ops.push({ op: "setAttrs", nodeId: n.id, attrs: { latex: s } });
      return ops;
    }

    if (e.code === "emptyHeading" && n) {
      ops.push({ op: "deleteNode", nodeId: n.id });
      return ops;
    }

    if (e.code === "tableRagged" && n && n.type === "table") {
      var 列 = 0;
      (n.children || []).forEach(function (r) { 列 = Math.max(列, (r.children || []).length); });
      (n.children || []).forEach(function (r) {
        var 今 = (r.children || []).map(function (c) { return { text: 文(c.text) }; });
        while (今.length < 列) 今.push({ text: "" });
        ops.push({ op: "replaceNode", nodeId: r.id,
                   node: { type: "tableRow", children: 今 } });
      });
      return ops;
    }

    if (e.code === "fabricated" && n) {
      /* **でっち上げた値は 消す。**空欄に戻すのが 正しい直しかた。 */
      ops.push({ op: "setText", nodeId: n.id, text: "" });
      return ops;
    }

    if (e.code === "calcNotFormula" && dt) {
      var 対 = null;
      (dt.calculations || []).forEach(function (c) {
        if (e.なに.indexOf(文(c.target || c.key)) >= 0) 対 = c;
      });
      if (対) {
        var sh2 = null;
        VQW.ir.walk(doc.root, function (x) { if (!sh2 && x.type === "sheet") sh2 = x; });
        if (sh2) {
          var ref = 文(対.target || 対.key).toUpperCase();
          var id = VQW.ir.cellId(sh2.id, ref);
          var ある = VQW.ir.find(doc.root, id);
          if (ある) ops.push({ op: "setFormula", nodeId: id, formula: 文(対.formula) });
          else ops.push({ op: "insertNode", parentId: sh2.id,
                          node: { type: "formulaCell", attrs: { ref: ref, formula: 文(対.formula) } } });
        }
      }
      return ops;
    }

    if (e.code === "fieldMissing" && dt && kind === "docs") {
      var 欄 = null;
      (dt.requiredFields || []).forEach(function (f) {
        if (e.なに.indexOf(f.label || f.key) >= 0) 欄 = f;
      });
      if (欄 && 欄.fillPolicy === "user_input") {
        ops.push({ op: "insertNode", parentId: "root",
          node: { type: "field", attrs: { key: 欄.key, label: 欄.label,
                  dataType: 欄.dataType, hint: 欄.hint || ("ここに " + 欄.label + " を書いてください") },
                  text: "" } });
      }
      return ops;
    }

    if (e.code === "answerSpaceZero" && n) {
      ops.push({ op: "setAttrs", nodeId: n.id, attrs: { lines: 3 } });
      return ops;
    }

    if (e.code === "imageWide" && n) {
      ops.push({ op: "setAttrs", nodeId: n.id, attrs: { width: 100 } });
      return ops;
    }

    return ops;
  }

  /* ★ 同じ節点の setAttrs を **1 つに合わせる**。
     合わせないと、列 A の幅を直す操作と 列 D の幅を直す操作が
     どちらも 直す前の colW から 作られ、あとの 1 つが 前の 1 つを
     打ち消す（実測: 1 列しか 直らなかった）。 */
  function まとめる(ops) {
    var 出 = [], 表 = Object.create(null);
    (ops || []).forEach(function (op) {
      if (op.op !== "setAttrs") { 出.push(op); return; }
      var k = "setAttrs:" + op.nodeId;
      if (!表[k]) { 表[k] = { op: "setAttrs", nodeId: op.nodeId, attrs: {} }; 出.push(表[k]); }
      Object.keys(op.attrs || {}).forEach(function (a) {
        var 前 = 表[k].attrs[a], 後 = op.attrs[a];
        if (前 && 後 && typeof 前 === "object" && typeof 後 === "object" && !Array.isArray(後)) {
          Object.keys(後).forEach(function (x) { 前[x] = 後[x]; });
        } else 表[k].attrs[a] = 後;
      });
    });
    return 出;
  }

  /* ══ 直す（最大 3 周・同じ節点は 2 回まで）═══════════════════════ */
  function repair(kind, content, o) {
    o = o || {};
    var dt = o.docType || null;
    var 回数 = Object.create(null);
    var 周 = 0, 直した = [], 残り = [];

    while (周 < 3) {
      周++;
      var doc = VQW.ir.toIR(kind, content, { docType: dt && dt.id });
      var 検 = VQW.validate.run(kind, content, { docType: dt });
      if (!検.errors.length) { 残り = []; break; }

      var ops = [], 今回 = 0;
      検.errors.forEach(function (e) {
        var k = 文(e.nodeId) + ":" + e.code;
        if ((回数[k] || 0) >= 2) return;
        var t = 手だて(kind, content, doc, e, dt);
        if (!t.length) return;
        回数[k] = (回数[k] || 0) + 1;
        ops = ops.concat(t);
        直した.push({ code: e.code, どこ: e.どこ, nodeId: e.nodeId });
        今回++;
      });
      if (!今回) { 残り = 検.errors; break; }
      ops = まとめる(ops);

      var r = VQW.ops.guard({
        kind: kind, content: content, docType: dt, 検証する: false,
        request: { baseVersion: VQW.ops.版(content), intent: "崩れを直す", operations: ops }
      });
      if (r.status === "rejected") { 残り = 検.errors; break; }
      残り = VQW.validate.run(kind, content, { docType: dt }).errors;
      if (!残り.length) break;
    }

    /* 残ったものには 「要確認」の印をつける（止まり続けない） */
    if (残り.length) {
      content.__work = content.__work || {};
      content.__work.要確認 = 残り.slice(0, 20).map(function (e) {
        return { nodeId: e.nodeId, code: e.code, なに: e.なに };
      });
    } else if (content.__work) {
      delete content.__work.要確認;
    }

    return { 周: 周, 直した: 直した, 残り: 残り,
             要確認: 残り.length ? 残り.length : 0 };
  }

  VQW.pipeline = VQW.pipeline || {};
  VQW.pipeline.repair = repair;
  VQW.pipeline.手だて
    = 手だて;
})(typeof globalThis !== "undefined" ? globalThis : this);
