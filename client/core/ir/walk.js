/* ══════════════════════════════════════════════════════════════════════
   core/ir/walk.js — 木をたどる道具

   ★ 報告に出す「どこ」（path）も ここで作る。
     報告文は LLM に書かせないので、**人が読める場所の名前**は
     機械が作らないといけない。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});

  function walk(n, fn, 親) {
    if (!n) return;
    fn(n, 親 || null);
    if (n.children) for (var i = 0; i < n.children.length; i++) walk(n.children[i], fn, n);
  }

  function find(rootNode, id) {
    var 出 = null;
    walk(rootNode, function (n) { if (!出 && n.id === id) 出 = n; });
    return 出;
  }

  function parentOf(rootNode, id) {
    var 出 = null;
    walk(rootNode, function (n, p) { if (!出 && n.id === id) 出 = p; });
    return 出;
  }

  function 全部(rootNode, pred) {
    var 出 = [];
    walk(rootNode, function (n) { if (!pred || pred(n)) 出.push(n); });
    return 出;
  }

  function indexOf(rootNode, id) {
    var p = parentOf(rootNode, id);
    if (!p || !p.children) return -1;
    for (var i = 0; i < p.children.length; i++) if (p.children[i].id === id) return i;
    return -1;
  }

  /* ── 人が読める場所の名前 ─────────────────────────────────── */
  var 呼び名 = {
    document: "文書", section: "章", heading: "見出し", paragraph: "本文",
    list: "箇条書き", listItem: "箇条書きの行", table: "表",
    tableRow: "表の行", tableCell: "表のマス", image: "画像",
    pageBreak: "改ページ", math: "数式", field: "記入欄",
    answerSpace: "解答欄", divider: "区切り線", toc: "目次", code: "コード",
    quote: "引用", callout: "囲み", todo: "チェック", caption: "説明文",
    workbook: "ブック", sheet: "シート", region: "領域",
    tableHeader: "見出し行", labelCell: "見出しのマス", valueCell: "値のマス",
    formulaCell: "式のマス", inputCell: "入力するマス", mergedBlock: "結合",
    chart: "グラフ",
    deck: "スライド一式", page: "ページ", slot: "枠", textFrame: "文字の箱",
    imageFrame: "画像の箱", shape: "図形", line: "線",
    form: "フォーム", formSection: "まとまり", formField: "質問"
  };
  function 名(n) { return (n && 呼び名[n.type]) || (n && n.type) || "?"; }

  /* 'ページ3 / 見出し' のような道。番号は 1 から。 */
  function pathOf(rootNode, id) {
    var 道 = [], 見 = false;
    (function 降りる(n, 親, 番) {
      if (見) return;
      道.push(番 ? 名(n) + 番 : 名(n));
      if (n.id === id) { 見 = true; return; }
      if (n.children) {
        for (var i = 0; i < n.children.length; i++) {
          降りる(n.children[i], n, i + 1);
          if (見) return;
        }
      }
      道.pop();
    })(rootNode, null, 0);
    if (!見) return "";
    道.shift();                                   /* 根（文書・ブック）は出さない */
    return 道.join(" / ");
  }

  VQW.ir = VQW.ir || {};
  VQW.ir.walk = walk;
  VQW.ir.find = find;
  VQW.ir.parentOf = parentOf;
  VQW.ir.全部 = 全部;
  VQW.ir.indexOf = indexOf;
  VQW.ir.pathOf = pathOf;
  VQW.ir.名 = 名;
})(typeof globalThis !== "undefined" ? globalThis : this);
