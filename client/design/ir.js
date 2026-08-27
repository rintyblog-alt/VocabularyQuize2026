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

  /* ══ 受け口を広げる（2026-08-20・訴え「改行・グラフ・図形・表」）════
     ★ ここは LLM も レンダラも **必ず通る**所。ここで 落とすと
       そのスロットは **空のまま**出る（＝「読み込まれない」の正体）。
     ★ これまでは Array.isArray でしか 受けていなかったので、
       items が 改行入りの 1 本の文字列 だったり、rows が もの の並び
       だったりすると 黙って 消えていた。rows が もの だと
       `(r||[]).map` で **例外**になり、deckWrite ごと こけていた。 */
  function 文(x) {
    if (Array.isArray(x)) return x.map(文).join("\n");
    if (x === undefined || x === null) return "";
    if (typeof x === "object")
      return 文(x.text !== undefined ? x.text
        : (x["文"] !== undefined ? x["文"] : (x.value !== undefined ? x.value : "")));
    var t = String(x);
    if (t.indexOf("<") >= 0)
      t = t.replace(/<\s*br\s*\/?\s*>|<\s*\/\s*(p|div|li|h[1-6])\s*>/gi, "\n")
           .replace(/<\s*\/?\s*(p|div|span|b|strong|i|em|u|li|ul|ol|h[1-6]|br)(\s[^<>]*)?\/?\s*>/gi, "");
    t = t.replace(/\\r\\n|\\n/g, "\n").replace(/\r\n?/g, "\n");
    if (t.indexOf("&") >= 0)
      t = t.replace(/&lt;/g, "<").replace(/&gt;/g, ">")
           .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    return t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  }
  function 並びにする(x) {
    if (Array.isArray(x)) return x;
    if (x === undefined || x === null || x === "") return [];
    if (typeof x === "string") return 文(x).split(/\n+/);
    return [x];
  }
  /* 表: 並びの並び / もの の並び / {headers,rows} / markdown の | を 受ける */
  function 表にする(生, 頭) {
    if (生 && typeof 生 === "object" && !Array.isArray(生) && (生.rows || 生.headers)) {
      頭 = 頭 || 生.headers || 生.header || 生.columns;
      生 = 生.rows;
    }
    生 = 並びにする(生);
    var 鍵 = Array.isArray(頭) ? 頭.map(文) : null;
    if (!鍵) {
      for (var i = 0; i < 生.length; i++) {
        var r0 = 生[i];
        if (r0 && typeof r0 === "object" && !Array.isArray(r0)) { 鍵 = Object.keys(r0); break; }
      }
      if (!鍵 && typeof 頭 === "string") 鍵 = 文(頭).split(/[|,\t]/).map(function (v) { return v.trim(); });
    }
    var 行 = [];
    生.forEach(function (r) {
      if (Array.isArray(r)) { 行.push(r.map(function (v) { return 文(v).replace(/\n/g, " "); })); return; }
      if (r && typeof r === "object") {
        var k = 鍵 || Object.keys(r);
        行.push(k.map(function (key) { return 文(r[key]).replace(/\n/g, " "); }));
        return;
      }
      var t = String(r === undefined || r === null ? "" : r);
      if (!t.trim()) return;
      if (t.indexOf("|") >= 0) {
        var セ = t.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|")
                  .map(function (v) { return 文(v).trim(); });
        if (セ.length && セ.every(function (v) { return /^:?-{2,}:?$/.test(v.replace(/\s/g, "")); })) return;
        行.push(セ); return;
      }
      if (t.indexOf("\t") >= 0) { 行.push(t.split("\t").map(function (v) { return 文(v).trim(); })); return; }
      行.push([文(t)]);
    });
    if (鍵 && 鍵.length) {
      var 同じ = 行.length && 行[0].length === 鍵.length
        && 行[0].every(function (v, i2) { return v === 鍵[i2]; });
      if (!同じ) 行.unshift(鍵.map(文));
    }
    if (!行.length) return null;
    var 列 = 0;
    行.forEach(function (r) { if (r.length > 列) 列 = r.length; });
    列 = Math.max(1, Math.min(12, 列));
    return 行.slice(0, 20).map(function (r) {
      var o = r.slice(0, 列);
      while (o.length < 列) o.push("");
      return o;
    });
  }
  /* グラフ: values / data / 数の じか並び のどれでも 受け、
     **values と data の 両方**を 持たせる（描く側は values を読む）。 */
  var 種の言い換え = {
    bar: "bar", column: "bar", vbar: "bar", "棒": "bar", "縦棒": "bar", "棒グラフ": "bar",
    hbar: "hbar", barh: "hbar", horizontalbar: "hbar", horizontal: "hbar",
    "横棒": "hbar", "横棒グラフ": "hbar",
    line: "line", "折れ線": "line", "折線": "line", "折れ線グラフ": "line",
    area: "area", "面": "area", "面グラフ": "area",
    pie: "pie", circle: "pie", "円": "pie", "円グラフ": "pie",
    donut: "donut", doughnut: "donut", "ドーナツ": "donut",
    scatter: "scatter", point: "scatter", "散布図": "scatter"
  };
  function 数の並び(v) {
    if (!Array.isArray(v) || !v.length) return null;
    var out = [], ok = 0;
    for (var i = 0; i < v.length; i++) {
      var x = v[i];
      if (x && typeof x === "object") {
        if (Array.isArray(x)) return null;
        var y = x.value !== undefined ? x.value : (x.y !== undefined ? x.y : x["値"]);
        if (y === undefined) return null;
        x = y;
      }
      var n = Number(x);
      out.push(isFinite(n) ? n : 0);
      if (isFinite(n)) ok++;
    }
    return ok ? out : null;
  }
  function グラフにする(g) {
    if (!g || typeof g !== "object") return null;
    var t = String(g.type || g.kind || "").toLowerCase().replace(/[\s_-]+/g, "");
    var lb = g.labels !== undefined ? g.labels
           : (g.categories !== undefined ? g.categories : g.x);
    if (typeof lb === "string") lb = lb.split(/[,、\n]+/);
    var labels = Array.isArray(lb) ? lb.map(文) : [];
    var 生 = g.series !== undefined ? g.series
           : (g.datasets !== undefined ? g.datasets
           : (g.data !== undefined ? g.data : g.values));
    var 並 = Array.isArray(生) ? 生 : (生 === undefined || 生 === null ? [] : [生]);
    var 出 = [];
    並.forEach(function (x, i) {
      if (Array.isArray(x)) { var v0 = 数の並び(x); if (v0) 出.push({ name: "系列" + (i + 1), values: v0 }); return; }
      if (!x || typeof x !== "object") return;
      var v = 数の並び(x.values) || 数の並び(x.data) || 数の並び(x.y) || 数の並び(x["値"]);
      if (v) 出.push({ name: 文(x.name || x.label || ("系列" + (i + 1))), values: v });
    });
    if (!出.length) {
      var v2 = 数の並び(並);
      if (v2) {
        出 = [{ name: 文(g.title || g.name || "値"), values: v2 }];
        if (!labels.length)
          labels = 並.map(function (x, i2) {
            var n = x && typeof x === "object"
              ? (x.label !== undefined ? x.label : x.name) : undefined;
            return n === undefined ? String(i2 + 1) : 文(n);
          });
      }
    }
    var n2 = labels.length;
    if (!n2) { 出.forEach(function (x) { if (x.values.length > n2) n2 = x.values.length; });
               labels = []; for (var i3 = 0; i3 < n2; i3++) labels.push(String(i3 + 1)); }
    出.forEach(function (x) {
      while (x.values.length < n2) x.values.push(0);
      if (x.values.length > n2) x.values = x.values.slice(0, n2);
      x.data = x.values;
    });
    return { type: 種の言い換え[t] || "bar", title: 文(g.title), labels: labels, series: 出 };
  }

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
    if (c.items !== undefined || c.bullets !== undefined || c.list !== undefined)
      o.items = 並びにする(c.items !== undefined ? c.items
                  : (c.bullets !== undefined ? c.bullets : c.list))
        .map(文)
        /* 行頭の 印は 落とす。layout-resolve が 「・」を 付け直すので、
           残すと 「・・りんご」に なる。「-5度」を 壊さないよう、
           中黒は そのまま、ハイフン・星は **空きが 続くときだけ** 落とす。 */
        .map(function (x) { return x.replace(/^\s*(?:[・•]\s*|[-*]\s+)/, "").trim(); })
        .filter(function (x) { return x; });
    if (c.value !== undefined) o.value = 文(c.value);
    if (c.caption !== undefined) o.caption = 文(c.caption);
    if (c.rows !== undefined || c.table !== undefined || c.headers !== undefined) {
      var 表 = 表にする(c.rows !== undefined ? c.rows : c.table,
                        c.headers !== undefined ? c.headers
                          : (c.header !== undefined ? c.header : c.columns));
      if (表) o.rows = 表;
    }
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
    /* ★ 図（SVG）と 借りた絵。ここで 落とすと deck に 図が 入らない
       （2026-08-28・訴え「図の生成はできませんでした」）。
       ★★ **清めるのは ここ**（VQSVG）。deck は slidesWrite を 通らないので、
         ここで 清めないと **生の SVG が そのまま 画面に 出る**。
       ★★ 文() を 通さないこと。文() は <span> などを 落として
         &lt; を < に 戻すので、SVG が 壊れる（別の 意味に 変わる）。 */
    if (c.svg !== undefined) {
      var 生 = String(c.svg == null ? "" : c.svg);
      if (生.trim()) {
        var V = (typeof root !== "undefined" && root.VQSVG) ? root.VQSVG : null;
        var r2 = V ? V.清める(生) : { ok: false };
        if (r2.ok) o.svg = r2.svg;
        else o.svgだめ = (r2["なぜ"] || "SVG の 部品が 読み込まれていません");
      }
    }
    if (c.src !== undefined) {
      /* 置き場は **こちらの 住所だけ**（外の 住所を そのまま 貼らせない） */
      var sr = String(c.src == null ? "" : c.src).trim();
      if (/^\/api\/media\//.test(sr) || /^data:image\//.test(sr)) o.src = sr;
      else if (sr) o.srcだめ = "取り込んでいない 住所は 貼れません（usePicture を 使ってください）";
    }
    if (c.alt !== undefined) o.alt = 文(c.alt);
    if (c.credit && typeof c.credit === "object") o.credit = c.credit;
    var 生図 = c.chart !== undefined ? c.chart : c.graph;
    if (生図 && typeof 生図 === "object") {
      var 図 = グラフにする(生図);
      if (図 && 図.series.length && 図.labels.length) o.chart = 図;
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
