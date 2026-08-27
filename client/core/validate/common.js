/* ══════════════════════════════════════════════════════════════════════
   core/validate/common.js — 検証の 土台と 振り分け

   ★ **LLM は 1 回も呼ばない。全部 純粋関数。**
     見た目が崩れているかを AI に聞くと、聞くたびに答えが変わり、
     しかも「大丈夫です」と言う。数えれば 毎回 同じ答えになる。
   ★ 深刻さは 2 段（§7.6）
       error   … 1 つでもあれば **完成と表示しない**
       warning … 完成扱い。ただし 画面に出す
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});

  function 文(v) { return v === undefined || v === null ? "" : String(v); }

  function issue(code, severity, o) {
    o = o || {};
    var i = {
      code: 文(code),
      severity: severity === "warning" ? "warning" : "error",
      nodeId: 文(o.nodeId),
      どこ: 文(o.どこ),
      なに: 文(o.なに),
      どうする: 文(o.どうする)
    };
    /* ★ 決まった欄のほかも **そのまま持ち越す**。
       ここで捨てると、検査が付けた「直しかた」が 修復まで 届かない
       （実測: 列幅の直しが 1 度も 効いていなかった）。 */
    Object.keys(o).forEach(function (k) {
      if (i[k] === undefined) i[k] = o[k];
    });
    return i;
  }
  function err(code, o) { return issue(code, "error", o); }
  function warn(code, o) { return issue(code, "warning", o); }

  function 空(){ return { errors: [], warnings: [] }; }
  function 足す(結, is) {
    (is || []).forEach(function (i) {
      if (!i) return;
      (i.severity === "warning" ? 結.warnings : 結.errors).push(i);
    });
    return 結;
  }
  function 混ぜる(a, b) {
    a.errors = a.errors.concat(b.errors || []);
    a.warnings = a.warnings.concat(b.warnings || []);
    return a;
  }

  /* ── 振り分け ─────────────────────────────────────────────── */
  function run(kind, content, o) {
    o = o || {};
    var V = VQW.validate, 結 = 空();
    var doc = VQW.ir.toIR(kind, content, { docType: o.docType && o.docType.id });

    /* 種類によらない検査 */
    if (V.placeholder) 足す(結, V.placeholder.check(doc, o));
    if (V.math) 足す(結, V.math.check(doc, o));

    if (kind === "docs" && V.docs) 混ぜる(結, V.docs.check(doc, content, o));
    if (kind === "sheets" && V.sheets) 混ぜる(結, V.sheets.check(doc, content, o));
    if (kind === "slides" && V.slides) 混ぜる(結, V.slides.check(doc, content, o));

    if (o.docType && V.doctype) 混ぜる(結, V.doctype.check(doc, content, o.docType, o));
    return 結;
  }

  VQW.validate = VQW.validate || {};
  VQW.validate.issue = issue;
  VQW.validate.err = err;
  VQW.validate.warn = warn;
  VQW.validate.空 = 空;
  VQW.validate.足す = 足す;
  VQW.validate.混ぜる = 混ぜる;
  VQW.validate.run = run;
})(typeof globalThis !== "undefined" ? globalThis : this);
