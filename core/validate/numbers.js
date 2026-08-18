/* ══════════════════════════════════════════════════════════════════════
   core/validate/numbers.js — 数と日付の 規律

   ★ 実例:「1,000円」という **文字** がマスに入っていて、合計が 0 になる。
     画面には それらしく見えるので、作った側は気づかない。
   ★ 単位は **見出しへ**。マスには 数だけ入れる。
     これを守らないと 合計も 並べ替えも グラフも 効かない。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});
  var V = VQW.validate;

  var 単位つき = /^-?[\d,]+(?:\.\d+)?\s*(円|¥|＄|\$|%|％|人|名|個|点|冊|枚|件|回|台|本|kg|g|t|m|km|cm|mm|時間|分|秒|日|ヶ月|か月)$/;
  var 区切りつき = /^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;
  var 素の数 = /^-?\d+(?:\.\d+)?$/;
  var 日付 = /^(\d{4})[-\/年](\d{1,2})[-\/月](\d{1,2})日?$/;

  function 数か(s) { return 素の数.test(String(s).trim()); }

  function 日付か(s) {
    var m = String(s).trim().match(日付);
    if (!m) return false;
    var y = +m[1], mo = +m[2], d = +m[3];
    return mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y >= 1900 && y <= 2200;
  }

  /* マス 1 つを見る。列がそもそも文字の列なら 何も言わない。 */
  function マスを見る(doc, n, 数の列か) {
    var t = String(n.text || "").trim();
    if (!t) return null;
    var a = n.attrs || {};
    var 型 = String(a.dataType || "");

    if (単位つき.test(t)) {
      return V.err("numberAsText", {
        nodeId: n.id, どこ: VQW.ir.pathOf(doc.root, n.id),
        なに: "「" + t + "」は 数ではなく **文字** です（単位が付いています）。",
        どうする: "**単位は 見出しへ**（例:「金額（円）」）。マスには 数だけ入れてください。"
      });
    }
    if (区切りつき.test(t)) {
      return V.err("numberAsText", {
        nodeId: n.id, どこ: VQW.ir.pathOf(doc.root, n.id),
        なに: "「" + t + "」は 桁区切りが 文字として入っています。合計に 数えられません。",
        どうする: "1000 のように 数だけ入れ、**見た目の桁区切りは 書式**でつけてください。"
      });
    }
    if ((型 === "number" || 型 === "money" || 型 === "percent") && !数か(t)) {
      return V.err("numberAsText", {
        nodeId: n.id, どこ: VQW.ir.pathOf(doc.root, n.id),
        なに: "数の欄に 数でないものが 入っています: 「" + t + "」",
        どうする: "数だけ入れてください。"
      });
    }
    if (型 === "date" && !日付か(t)) {
      return V.err("dateAsText", {
        nodeId: n.id, どこ: VQW.ir.pathOf(doc.root, n.id),
        なに: "日付の欄が 日付として読めません: 「" + t + "」",
        どうする: "2026-08-17 か 2026年8月17日 の形にしてください。"
      });
    }
    if (数の列か && !数か(t) && !/^[=＝]/.test(t)) {
      return V.warn("mixedColumn", {
        nodeId: n.id, どこ: VQW.ir.pathOf(doc.root, n.id),
        なに: "数の列に 文字が 混ざっています: 「" + t.slice(0, 20) + "」",
        どうする: "並べ替えと合計が 効かなくなります。"
      });
    }
    return null;
  }

  /* 列ごとに「数の列か」を見る（8 割以上が数なら 数の列） */
  function 数の列(sheetNode) {
    var 列 = {};
    (sheetNode.children || []).forEach(function (c) {
      var ref = String((c.attrs || {}).ref || "");
      var m = ref.match(/^([A-Z]+)(\d+)$/);
      if (!m) return;
      var r = +m[2];
      if (r <= 1) return;                                /* 1 行目は見出し */
      var k = m[1];
      列[k] = 列[k] || { 数: 0, 全: 0 };
      列[k].全++;
      if (c.type === "formulaCell" || 数か(c.text)) 列[k].数++;
    });
    var 出 = {};
    Object.keys(列).forEach(function (k) {
      出[k] = 列[k].全 >= 3 && 列[k].数 / 列[k].全 >= 0.8;
    });
    return 出;
  }

  function check(doc) {
    var 出 = [];
    VQW.ir.walk(doc.root, function (n) {
      if (n.type !== "sheet") return;
      var 数列 = 数の列(n);
      (n.children || []).forEach(function (c) {
        if (c.type === "formulaCell" || c.type === "inputCell") return;
        var ref = String((c.attrs || {}).ref || "");
        var m = ref.match(/^([A-Z]+)(\d+)$/);
        var 数の列か = !!(m && +m[2] > 1 && 数列[m[1]]);
        var i = マスを見る(doc, c, 数の列か);
        if (i) 出.push(i);
      });
    });
    return 出;
  }

  VQW.validate = VQW.validate || {};
  VQW.validate.numbers = { check: check, 数か: 数か, 日付か: 日付か, 数の列: 数の列 };
})(typeof globalThis !== "undefined" ? globalThis : this);
