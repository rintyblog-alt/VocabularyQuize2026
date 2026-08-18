/* ══════════════════════════════════════════════════════════════════════
   core/ir/types.js — WorkIR の型（節点の種類と 空の書類）

   ★ 大前提: **WorkIR は 保存形式を置き換えない。**
     Workplace の保存形式は もともと JSON の木（blocks / sheets / slides /
     sections）で、画面も式も 印刷も その形を直に読んでいる。
     ここで別の木を作って そちらを正にすると、**同じものが 2 つ**になり、
     片方だけ直したときに黙って食い違う（これまで何度も踏んだ罠）。
   ★ だから WorkIR は **写し（projection）**にする。
       ・読む   … project.js が 保存形式 → WorkIR を作る
       ・書く   … ops/apply.js が **保存形式のほうを** 直す
       ・確かめ … 直す前後の WorkIR を hash で突き合わせる
     WorkIR から保存形式へ書き戻す道は 作らない。
     ＝ 往復変換は 定義上 必ず一致する（Phase 1 の完了条件）。

   ★ 節点の種類は 指示書 §3.2 のものに、Workplace が実際に持っている
     ものを足してある（divider / toc / todo / form*）。
     足さずに落とすと 写しが 中身を失い、検証が素通りする。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});

  /* ── 節点の種類 ───────────────────────────────────────────── */
  var TYPES = {
    docs: ["document", "section", "heading", "paragraph", "list", "listItem",
           "table", "tableRow", "tableCell", "image", "pageBreak",
           "math", "field", "answerSpace",
           /* Workplace が実際に持っているもの */
           "divider", "toc", "code", "quote", "callout", "todo", "caption"],
    sheets: ["workbook", "sheet", "region", "table", "tableHeader", "tableRow",
             "labelCell", "valueCell", "formulaCell", "inputCell", "mergedBlock",
             "chart"],
    slides: ["deck", "page", "slot", "textFrame", "imageFrame", "shape", "chart",
             "table", "line"],
    forms: ["form", "formSection", "formField"]
  };

  /* 値をまだ持っていない箱。**LLM がここへ値を入れることを禁じる**（§3.3） */
  var 空箱 = { field: 1, inputCell: 1, answerSpace: 1 };
  /* 中に文を持つ節点（プレースホルダ検査などの対象） */
  var 文を持つ = { heading: 1, paragraph: 1, listItem: 1, tableCell: 1, quote: 1,
                   code: 1, callout: 1, todo: 1, caption: 1, math: 1, section: 1,
                   labelCell: 1, valueCell: 1, textFrame: 1, formField: 1,
                   formSection: 1 };

  function 文(v) { return v === undefined || v === null ? "" : String(v); }

  function newNode(type, id, o) {
    var n = { id: 文(id), type: 文(type), attrs: (o && o.attrs) || {} };
    if (o && o.text !== undefined) n.text = 文(o.text);
    if (o && o.children) n.children = o.children;
    return n;
  }

  /* WorkDoc の器。root だけは project.js が入れる。 */
  function newDoc(o) {
    o = o || {};
    return {
      docId: 文(o.docId),
      kind: 文(o.kind) || "docs",
      docType: o.docType || null,
      docTypeMatch: 文(o.docTypeMatch) || "none",
      version: Number(o.version) || 0,
      title: 文(o.title),
      meta: o.meta || {},
      design: o.design || null,        /* デザインエンジン用のフック。当面 null */
      locks: o.locks || [],
      root: o.root || newNode("document", "root", { children: [] })
    };
  }

  /* Workplace の itemType → WorkIR の kind */
  var KIND = { document: "docs", spreadsheet: "sheets",
               presentation: "slides", form: "forms" };
  var 逆KIND = { docs: "document", sheets: "spreadsheet",
                 slides: "presentation", forms: "form" };

  function kindOf(itemType) { return KIND[文(itemType)] || null; }
  function itemTypeOf(kind) { return 逆KIND[文(kind)] || null; }

  function 種類がある(kind, type) {
    var l = TYPES[kind]; return !!l && l.indexOf(type) >= 0;
  }

  VQW.ir = VQW.ir || {};
  VQW.ir.TYPES = TYPES;
  VQW.ir.空箱 = 空箱;
  VQW.ir.文を持つ = 文を持つ;
  VQW.ir.newNode = newNode;
  VQW.ir.newDoc = newDoc;
  VQW.ir.kindOf = kindOf;
  VQW.ir.itemTypeOf = itemTypeOf;
  VQW.ir.種類がある = 種類がある;
})(typeof globalThis !== "undefined" ? globalThis : this);
