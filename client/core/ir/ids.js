/* ══════════════════════════════════════════════════════════════════════
   core/ir/ids.js — 永続 ID

   ★ 一度出した ID は 二度と変えない。挿入・削除・移動・並べ替えのあとも
     残っている節点の ID は そのまま。
   ★ Workplace の保存形式は **もともと ID を持っている**（b_… / sh_… /
     sl_… / e_…）。ここでは その形に合わせて出す。新しい体系を作って
     付け替えると、既に保存されている書類が全部 別物になる。
   ★ 保存形式が ID を持たない所（表のセル・シートのマス）は、
     **場所から決まる合成 ID** を使う。番地が変われば ID も変わるが、
     番地そのものが同一性なので それで正しい。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});

  var 頭 = {
    document: "doc", section: "sec", heading: "hd", paragraph: "p",
    list: "ul", listItem: "li", table: "tb", tableRow: "tr", tableCell: "td",
    image: "img", pageBreak: "pb", math: "mth", field: "fld",
    answerSpace: "ans", divider: "hr", toc: "toc", code: "cd",
    quote: "qt", callout: "cal", todo: "tdo", caption: "cap",
    workbook: "wb", sheet: "sh", region: "rg", tableHeader: "th",
    labelCell: "lc", valueCell: "vc", formulaCell: "fc", inputCell: "ic",
    mergedBlock: "mb", chart: "ch",
    deck: "dk", page: "pg", slot: "sl", textFrame: "tf",
    imageFrame: "if", shape: "shp", line: "ln",
    form: "fm", formSection: "fs", formField: "ff"
  };

  /* 12 桁。Math.random だけだと同じミリ秒で衝突しうるので 連番も混ぜる。 */
  var 連 = 0;
  function rand12() {
    連 = (連 + 1) % 1296;
    var a = Date.now().toString(36);
    var b = Math.random().toString(36).slice(2, 8);
    var c = 連.toString(36);
    return (a + b + c).slice(-12);
  }

  function newNodeId(type) {
    return (頭[type] || "n") + "_" + rand12();
  }

  /* ★ 保存形式へ **新しく置く**ものの ID は、Workplace の作法に合わせる
     （model.js の uid: b_ / sh_ / sl_ / e_ / ch_ / s_ / f_）。
     ここだけ別の体系にすると、画面の側で「知らない ID」に見える。 */
  function wpId(prefix) { return (prefix || "wp") + "_" + rand12(); }
  var 保存の頭 = {
    docs: "b", sheet: "sh", slide: "sl", element: "e", chart: "ch",
    section: "s", field: "f"
  };

  /* 合成 ID（保存形式が ID を持たない所）。
     形を 1 か所に閉じ込める。ここ以外で文字列を組み立てないこと。 */
  function cellId(sheetId, ref) { return String(sheetId) + "!" + String(ref).toUpperCase(); }
  function rowId(blockId, r) { return String(blockId) + "#r" + r; }
  function cellInTable(blockId, r, c) { return String(blockId) + "#r" + r + "c" + c; }

  function 割る合成(id) {
    var s = String(id || "");
    var i = s.indexOf("!");
    if (i > 0) return { 種: "cell", 親: s.slice(0, i), ref: s.slice(i + 1) };
    var m = s.match(/^(.+)#r(\d+)(?:c(\d+))?$/);
    if (m) {
      return m[3] !== undefined
        ? { 種: "tcell", 親: m[1], r: +m[2], c: +m[3] }
        : { 種: "trow", 親: m[1], r: +m[2] };
    }
    return null;
  }

  VQW.ir = VQW.ir || {};
  VQW.ir.newNodeId = newNodeId;
  VQW.ir.wpId = wpId;
  VQW.ir.保存の頭 = 保存の頭;
  VQW.ir.cellId = cellId;
  VQW.ir.rowId = rowId;
  VQW.ir.cellInTable = cellInTable;
  VQW.ir.割る合成 = 割る合成;
})(typeof globalThis !== "undefined" ? globalThis : this);
