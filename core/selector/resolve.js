/* ══════════════════════════════════════════════════════════════════════
   core/selector/resolve.js — 場所の特定

   ★ いまの「壊す」と「嘘をつく」は、ほぼ全部ここが原因だった。
     指した所が見つからないのに 編集を実行し、成功と報告していた。
   ★ 決まりごと（§5.3）
       1 件      … やる
       2 件以上  … **候補を出して聞く**。勝手に 1 つ選ばない
       0 件      … **聞く**。近そうな所を推測して直すのは 禁止
   ★ 「ここ」「これ」は 画面の選択範囲。自然言語の解釈より確実なので、
     by:'selection' が使える場面では 常にそれを優先する（§5.4）。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});
  var I = VQW.ir;

  function 文(v) { return v === undefined || v === null ? "" : String(v); }

  /* 種の別名。人と LLM は 正式名で言わない。 */
  var 別名 = {
    "見出し": "heading", "みだし": "heading", heading: "heading",
    "本文": "paragraph", "文": "paragraph", paragraph: "paragraph",
    "箇条書き": "listItem", "項目": "listItem", listItem: "listItem",
    "表": "table", table: "table", "行": "tableRow", tableRow: "tableRow",
    "マス": "tableCell", "セル": "tableCell", tableCell: "tableCell",
    "画像": "image", image: "image", "数式": "math", math: "math",
    "記入欄": "field", field: "field", "解答欄": "answerSpace",
    "ページ": "page", page: "page", "スライド": "page",
    "文字の箱": "textFrame", textFrame: "textFrame",
    "図形": "shape", shape: "shape", "グラフ": "chart", chart: "chart",
    "シート": "sheet", sheet: "sheet",
    "質問": "formField", formField: "formField",
    "まとまり": "formSection", formSection: "formSection",
    "囲み": "callout", "引用": "quote", "区切り線": "divider"
  };
  function 種を読む(s) { return 別名[文(s)] || 文(s); }

  function 候補(doc, scope) {
    var t = 種を読む(scope);
    if (!t) return I.全部(doc.root, function (n) { return n.id !== "root"; });
    return I.全部(doc.root, function (n) { return n.type === t; });
  }

  /* ══ 本体 ═════════════════════════════════════════════════════
     sel は { by: ... }。selection は 画面が渡す ID の並び。 */
  function resolve(doc, sel, selection) {
    sel = sel || {};
    var by = 文(sel.by);

    if (by === "nodeId") {
      var n = I.find(doc.root, 文(sel.id));
      return n ? 一つ(n.id) : 無し("その ID は この書類にありません。", 近そうな(doc, 文(sel.id)));
    }

    if (by === "selection") {
      var s = (selection || []).filter(function (x) { return !!I.find(doc.root, 文(x)); });
      if (s.length === 1) return 一つ(s[0]);
      if (s.length > 1) return 複数(s, doc);
      return 無し("いま画面で 何も選ばれていません。", []);
    }

    if (by === "ordinal") {
      var 並 = 候補(doc, sel.scope);
      var i = Math.max(1, Number(sel.index) || 1) - 1;
      if (!並.length) return 無し("「" + 文(sel.scope) + "」が この書類にありません。", []);
      if (i >= 並.length)
        return 無し("「" + 文(sel.scope) + "」は " + 並.length + " 個しかありません（"
          + (i + 1) + " 番目は ありません）。",
          並.map(function (x, k) { return 印(doc, x, k + 1); }));
      var 当 = 並[i];
      if (sel.sub) {
        var 中 = I.全部(当, function (x) { return x.type === 種を読む(sel.sub); });
        if (中.length === 1) return 一つ(中[0].id);
        if (!中.length) return 無し("その中に「" + 文(sel.sub) + "」はありません。", []);
        return 複数(中.map(function (x) { return x.id; }), doc);
      }
      return 一つ(当.id);
    }

    if (by === "text") {
      var 語 = I.素(文(sel.contains)).trim();
      if (!語) return 無し("さがす言葉がありません。", []);
      var 全 = 候補(doc, sel.scope);
      var 当2 = 全.filter(function (n) { return I.素(n.text || "").indexOf(語) >= 0; });
      if (当2.length === 1) return 一つ(当2[0].id);
      if (!当2.length) {
        /* 部分一致でも 0 件。近そうなものを 出して聞く。 */
        return 無し("「" + 語 + "」を含む所が 見つかりません。", 近そうな(doc, 語));
      }
      return 複数(当2.map(function (n) { return n.id; }), doc);
    }

    if (by === "field") {
      var 鍵 = 文(sel.docTypeField);
      var 当3 = I.全部(doc.root, function (n) {
        return (n.attrs && (n.attrs.key === 鍵)) ||
               (n.type === "field" && I.素(n.attrs && n.attrs.label) === 鍵);
      });
      if (当3.length === 1) return 一つ(当3[0].id);
      if (!当3.length) return 無し("「" + 鍵 + "」という欄が ありません。", []);
      return 複数(当3.map(function (n) { return n.id; }), doc);
    }

    if (by === "last") {
      var 並2 = 候補(doc, sel.scope);
      if (!並2.length) return 無し("「" + 文(sel.scope) + "」が この書類にありません。", []);
      return 一つ(並2[並2.length - 1].id);
    }

    if (by === "range") {
      var a = I.find(doc.root, 文(sel.fromId)), b = I.find(doc.root, 文(sel.toId));
      if (!a || !b) return 無し("範囲の 端が 見つかりません。", []);
      var 平 = I.全部(doc.root, function (n) { return n.id !== "root"; });
      var ia = -1, ib = -1;
      平.forEach(function (n, k) { if (n.id === a.id) ia = k; if (n.id === b.id) ib = k; });
      if (ia < 0 || ib < 0) return 無し("範囲を 決められません。", []);
      var 出 = 平.slice(Math.min(ia, ib), Math.max(ia, ib) + 1).map(function (n) { return n.id; });
      return 出.length === 1 ? 一つ(出[0]) : 複数(出, doc);
    }

    return 無し("指しかたが 分かりません（by: " + by + "）。", []);
  }

  function 一つ(id) { return { kind: "unique", nodeId: id }; }
  function 複数(ids, doc) {
    return { kind: "multiple", nodeIds: ids,
             候補: ids.slice(0, 12).map(function (id, k) { return 印(doc, I.find(doc.root, id), k + 1); }) };
  }
  function 無し(なぜ, 候) { return { kind: "none", なぜ: なぜ, 候補: (候 || []).slice(0, 12) }; }

  function 印(doc, n, 番) {
    if (!n) return { 番: 番 };
    return { 番: 番, id: n.id, どこ: I.pathOf(doc.root, n.id),
             中身: I.素(n.text || "").slice(0, 40) };
  }

  /* 近そうなもの（言葉の重なりで並べる）。**勝手に選ぶためではなく、聞くため。** */
  function 近そうな(doc, 語) {
    var s = I.素(語);
    var 得 = [];
    I.walk(doc.root, function (n) {
      if (n.id === "root") return;
      var t = I.素(n.text || "");
      if (!t) return;
      var 点 = 0;
      for (var i = 0; i < s.length - 1; i++) if (t.indexOf(s.substr(i, 2)) >= 0) 点++;
      if (点) 得.push({ n: n, 点: 点 });
    });
    得.sort(function (a, b) { return b.点 - a.点; });
    return 得.slice(0, 6).map(function (x, k) { return 印(doc, x.n, k + 1); });
  }

  VQW.selector = {
    resolve: resolve, 種を読む: 種を読む, 別名: 別名, 近そうな: 近そうな
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
