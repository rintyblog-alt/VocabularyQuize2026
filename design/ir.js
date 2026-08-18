/* ══════════════════════════════════════════════════════════════════════
   design/ir.js — DeckIR（中間表現）

   ★ LLM も レンダラも **必ずここを通る**。Slides のモデルを直接触らない。
     検証は この形に対して行う。
   ★ 「作りかけ」を隠さない: ページごとに status と issues と repairCount を持つ。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQD = root.VQD || (root.VQD = {});
  var G = VQD.grammar;

  function 文(x) { return x === undefined || x === null ? "" : String(x); }

  function newDeck(meta, seed) {
    var s = VQD.constraints.nearestValidSeed(seed || {});
    return {
      meta: {
        title: 文(meta && meta.title) || "無題",
        audience: 文(meta && meta.audience),
        purpose: 文(meta && meta.purpose),
        pageCount: Math.max(1, parseInt(meta && meta.pageCount, 10) || 1),
        lang: (meta && meta.lang) === "en" ? "en" : "ja"
      },
      seed: s.seed, seedを直した: s.直した,
      tokens: VQD.derive(s.seed),
      pages: [], status: "complete"
    };
  }

  function newPage(purpose, layout, index) {
    var p = G.PURPOSES.indexOf(purpose) >= 0 ? purpose : "detail";
    return {
      id: "p" + (index + 1),
      "番号": index + 1,
      purpose: p,
      layout: G.正規化(layout || G.受け皿(p, index)),
      content: [],
      resolved: null,
      status: "unresolved",
      issues: [],
      repairCount: 0
    };
  }

  /* SlotContent の形をそろえる。**知らない鍵は落とす**（勝手な拡張を防ぐ）。 */
  function 中身をそろえる(c, role) {
    c = c || {};
    var o = { slotIndex: parseInt(c.slotIndex, 10) || 0, role: role || c.role || "body" };
    if (c.text !== undefined) o.text = 文(c.text);
    if (Array.isArray(c.items)) o.items = c.items.map(文).filter(function (x) { return x.trim(); });
    if (c.value !== undefined) o.value = 文(c.value);
    if (c.caption !== undefined) o.caption = 文(c.caption);
    if (Array.isArray(c.rows)) o.rows = c.rows.map(function (r) { return (r || []).map(文); });
    /* ★ 新しい役目（steps / compare / kpi / timeline）の中身は
       **1 つの形**にそろえる。役目ごとに別の鍵を作ると 覚えられない。
         題 … 見出し（手順名・比べる相手・KPI の名前・年表の点）
         文 … そえる説明
         数 … 大きく出す数（kpi のとき） */
    if (Array.isArray(c.cells)) {
      o.cells = c.cells.slice(0, 6).map(function (x) {
        x = x || {};
        var y = {};
        if (x.title !== undefined || x["題"] !== undefined) y.title = 文(x.title !== undefined ? x.title : x["題"]);
        if (x.text !== undefined || x["文"] !== undefined) y.text = 文(x.text !== undefined ? x.text : x["文"]);
        if (x.value !== undefined || x["数"] !== undefined) y.value = 文(x.value !== undefined ? x.value : x["数"]);
        return y;
      }).filter(function (y) { return y.title || y.text || y.value; });
    }
    if (c.chart && typeof c.chart === "object") {
      o.chart = {
        type: ["bar", "hbar", "line", "area", "pie", "donut", "scatter"].indexOf(c.chart.type) >= 0
          ? c.chart.type : "bar",
        title: 文(c.chart.title),
        labels: (c.chart.labels || []).map(文),
        series: (c.chart.series || []).map(function (s) {
          return { name: 文(s && s.name), data: ((s && s.data) || []).map(Number) };
        })
      };
    }
    return o;
  }

  /* 1 ページを 座標まで解く → Gate にかける */
  function 解く(deck, page) {
    var res = VQD.resolve(page, deck.tokens, { w: 960, h: 540 });
    var g = VQD.gate.checkPage(page, res, deck.tokens);
    page.resolved = res;
    page.issues = g.issues;
    page.status = g.status;
    return g;
  }

  /* デッキ全部（デッキ全体の警告も足す） */
  function 全部解く(deck) {
    var 結 = deck.pages.map(function (p) { return { page: p, g: 解く(deck, p), res: p.resolved }; });
    var 全 = VQD.gate.checkDeck(deck.pages, 結);
    全.forEach(function (w) {
      /* デッキ全体の警告は 1 枚目に持たせず、meta 側へ置く */
      deck.meta.警告 = (deck.meta.警告 || []).concat([w]);
    });
    var err = 結.reduce(function (n, r) { return n + r.g.error数; }, 0);
    var warn = 結.reduce(function (n, r) { return n + r.g.warning数; }, 0) + 全.length;
    var 未 = deck.pages.filter(function (p) { return p.status === "unresolved"; }).length;
    deck.status = (err || 未) ? "has_warnings" : (warn ? "has_warnings" : "complete");
    return { error数: err, warning数: warn, 未解決: 未, 結: 結 };
  }

  VQD.ir = { newDeck: newDeck, newPage: newPage, 中身をそろえる: 中身をそろえる,
             解く: 解く, 全部解く: 全部解く };
})(typeof globalThis !== "undefined" ? globalThis : this);
