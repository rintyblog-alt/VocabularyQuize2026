/* ══════════════════════════════════════════════════════════════════════
   design/preview.js — DeckIR を そのまま HTML で描く（確認用）

   ★ Slides の API を叩かずに 見た目を確かめられるようにするためのもの。
     ここで納得できないものは、本番へ出しても納得できない。
   ★ 書体の実体（/fonts/css/<id>.css）は使うぶんだけ head へ挿す。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQD = root.VQD || (root.VQD = {});
  var doc = root.document;

  function esc(s) {
    return String(s === undefined || s === null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* 書体の実体を読む。同じものは 2 度入れない。 */
  var 読んだ = {};
  function 書体を読む(ids) {
    if (!doc) return;
    (ids || []).forEach(function (id) {
      if (!id || 読んだ[id]) return;
      読んだ[id] = 1;
      var lk = doc.createElement("link");
      lk.rel = "stylesheet";
      lk.href = "/fonts/css/" + id + ".css";
      lk.setAttribute("data-vqd-font", id);
      (doc.head || doc.documentElement).appendChild(lk);
    });
  }
  /* id の並び → CSS の font-family。**二重引用符は使わない**
     （style 属性の中へ入れると そこで属性が切れる。実測済みの罠）。 */
  var 家族 = null;
  function familyOf(ids) {
    if (!家族) {
      家族 = {};
      try {
        (VQD.fontFamilyTable || []).forEach(function (f) { 家族[f.id] = f.family; });
      } catch (e) {}
    }
    書体を読む(ids);
    var 名 = (ids || []).map(function (id) { return 家族[id] || id; });
    return 名.map(function (n) { return "'" + n + "'"; }).join(",") + ",sans-serif";
  }

  /* ── かんたんなグラフ（確認用。本番は Workplace の chart が描く）──── */
  function chartSvg(c, w, h, t) {
    /* ★ 色は Tokens の 6 枠を **決まった順で**使う（2026-08-17）。
       前は 差し色・副・うすい差し色・罫線 を混ぜていたので、
       うすい色と灰色が混ざって にごっていた。
     ★ 系列が 1 本のときは **全部 同じ色**。棒ごとに色を変えない
       （色は「見分け」のためのもので、飾りではない）。 */
    var 色 = (t.color.chart && t.color.chart.length) ? t.color.chart
      : [t.color.accent, t.color.secondary, t.color.border];
    var 系列数 = (c.series || []).length;
    var s0 = (c.series && c.series[0]) || { data: [] };
    var d = (s0.data || []).map(Number);
    var 題 = c.title ? 22 : 0;
    var 名 = (c.labels || []).length ? 16 : 0;      /* 下の名前ぶん あけておく */
    var W = w, H = h - 題 - 名;
    if (!d.length || H <= 10) return "";
    var 出 = '<svg viewBox="0 0 ' + w + " " + h + '" width="' + w + '" height="' + h + '">';
    if (c.title)
      出 += '<text x="0" y="14" font-size="13" fill="' + esc(t.color.textSecondary) + '">' + esc(c.title) + "</text>";
    var 最 = Math.max.apply(null, d.concat([1]));
    if (c.type === "pie" || c.type === "donut") {
      var 和 = d.reduce(function (a, b) { return a + b; }, 0) || 1;
      var cx = W / 2, cy = 題 + H / 2, r = Math.min(W, H) / 2 - 4, a0 = -Math.PI / 2;
      d.forEach(function (v, i) {
        var a1 = a0 + (v / 和) * Math.PI * 2;
        var x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
        var x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
        出 += '<path d="M' + cx + " " + cy + " L" + x0.toFixed(1) + " " + y0.toFixed(1)
          + " A" + r + " " + r + " 0 " + ((a1 - a0) > Math.PI ? 1 : 0) + " 1 "
          + x1.toFixed(1) + " " + y1.toFixed(1) + ' Z" fill="' + esc(色[i % 色.length]) + '"/>';
        a0 = a1;
      });
      if (c.type === "donut")
        出 += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r * 0.55) + '" fill="' + esc(t.color.bg) + '"/>';
    } else if (c.type === "line" || c.type === "area" || c.type === "scatter") {
      var st = W / Math.max(1, d.length - 1);
      var pts = d.map(function (v, i) { return (i * st).toFixed(1) + "," + (題 + H - (v / 最) * H * 0.9).toFixed(1); });
      if (c.type === "area")
        出 += '<polygon points="0,' + (題 + H) + " " + pts.join(" ") + " " + W + "," + (題 + H)
          + '" fill="' + esc(t.color.accentSoft) + '"/>';
      if (c.type !== "scatter")
        出 += '<polyline points="' + pts.join(" ") + '" fill="none" stroke="' + esc(色[0]) + '" stroke-width="3"/>';
      pts.forEach(function (p) {
        var xy = p.split(",");
        出 += '<circle cx="' + xy[0] + '" cy="' + xy[1] + '" r="4" fill="' + esc(色[0]) + '"/>';
      });
    } else {
      var 横 = c.type === "hbar";
      var n = d.length, すき = 8;
      d.forEach(function (v, i) {
        if (横) {
          var bh = (H - すき * (n - 1)) / n;
          出 += '<rect x="0" y="' + (題 + i * (bh + すき)) + '" width="' + ((v / 最) * W * 0.95)
            + '" height="' + bh + '" fill="' + esc(系列数 > 1 ? 色[i % 色.length] : 色[0]) + '" rx="3"/>';
        } else {
          var bw = (W - すき * (n - 1)) / n;
          var bhh = (v / 最) * H * 0.9;
          出 += '<rect x="' + (i * (bw + すき)) + '" y="' + (題 + H - bhh) + '" width="' + bw
            + '" height="' + bhh + '" fill="' + esc(系列数 > 1 ? 色[i % 色.length] : 色[0]) + '" rx="3"/>';
        }
      });
    }
    /* 名前（labels）は 下に あけておいた帯へ。棒の上には重ねない。 */
    if ((c.labels || []).length)
      出 += '<text x="0" y="' + (h - 3) + '" font-size="11" fill="' + esc(t.color.textSecondary) + '">'
        + esc((c.labels || []).join(" ／ ").slice(0, 64)) + "</text>";
    return 出 + "</svg>";
  }

  /* ── 部品 1 つ ─────────────────────────────────────────────── */
  function elHtml(e, t) {
    var 枠 = "position:absolute;left:" + e.x + "px;top:" + e.y + "px;width:" + e.w
      + "px;height:" + e.h + "px;z-index:" + (e.z || 1) + ";";
    if (e.type === "text") {
      return '<div style="' + 枠 + "font-family:" + familyOf(e.fontStack) + ";font-size:" + e.size
        + "px;font-weight:" + (e.bold ? 700 : 400) + ";color:" + esc(e.color)
        + ";text-align:" + esc(e.align || "left") + ";line-height:" + (e.lh || 1.4)
        + ";letter-spacing:" + (e.size >= 36 ? "-0.02em" : "0.02em")
        + ';white-space:pre-wrap;overflow:hidden">' + esc(e.text) + "</div>";
    }
    if (e.type === "number") {
      return '<div style="' + 枠 + 'display:grid;place-items:center;text-align:center">'
        + '<div style="width:100%"><div style="font-family:' + familyOf(e.fontStack)
        + ";font-size:" + e.size + "px;font-weight:800;line-height:1.1;color:" + esc(e.color)
        + ';letter-spacing:-0.02em">' + esc(e.text) + "</div>"
        + (e.label ? '<div style="font-size:' + Math.max(12, Math.round(e.size * 0.22))
            + "px;color:" + esc(t.color.textSecondary) + ';margin-top:4px">' + esc(e.label) + "</div>" : "")
        + "</div></div>";
    }
    if (e.type === "shape") {
      var 角 = e.shape === "circle" ? "50%" : (e.radius >= 9999 ? "50%" : (e.radius || 0) + "px");
      if (e.shape === "triangle")
        return '<div style="' + 枠 + '"><svg viewBox="0 0 100 100" preserveAspectRatio="none" '
          + 'style="width:100%;height:100%"><polygon points="50,4 96,96 4,96" fill="' + esc(e.fill) + '"/></svg></div>';
      return '<div style="' + 枠 + "background:" + esc(e.fill) + ";border-radius:" + 角
        + (e.opacity !== undefined ? ";opacity:" + e.opacity : "") + '"></div>';
    }
    if (e.type === "line")
      return '<div style="' + 枠 + '"><svg viewBox="0 0 100 10" preserveAspectRatio="none" style="width:100%;height:100%">'
        + '<line x1="0" y1="5" x2="100" y2="5" stroke="' + esc(e.color) + '" stroke-width="'
        + (e.weight || 2) + '"/></svg></div>';
    if (e.type === "arrow")
      return '<div style="' + 枠 + '"><svg viewBox="0 0 100 20" preserveAspectRatio="none" style="width:100%;height:100%">'
        + '<line x1="2" y1="10" x2="88" y2="10" stroke="' + esc(e.color) + '" stroke-width="3"/>'
        + '<polygon points="88,3 99,10 88,17" fill="' + esc(e.color) + '"/></svg></div>';
    if (e.type === "table") {
      var rows = e.rows || [];
      var h = '<div style="' + 枠 + 'overflow:hidden"><table style="width:100%;height:100%;'
        + "border-collapse:collapse;table-layout:fixed;font-family:" + familyOf(t.type.stack.body)
        + ";font-size:" + e.size + "px;color:" + esc(t.color.textPrimary) + '">';
      rows.forEach(function (r, ri) {
        h += "<tr>" + (r || []).map(function (c) {
          return '<td style="border:1px solid ' + esc(t.color.border) + ";padding:4px 8px;overflow:hidden"
            + (ri === 0 ? ";font-weight:700;background:" + esc(t.color.accentSoft) : "") + '">'
            + esc(c) + "</td>";
        }).join("") + "</tr>";
      });
      return h + "</table></div>";
    }
    if (e.type === "chart")
      return '<div style="' + 枠 + '">' + chartSvg(e.chart || {}, e.w, e.h, t) + "</div>";
    return "";
  }

  /* ── 1 ページ ─────────────────────────────────────────────── */
  function pageHtml(page, t, opts) {
    opts = opts || {};
    var res = page.resolved || VQD.resolve(page, t, { w: 960, h: 540 });
    var W = res.canvas.w, H = res.canvas.h;
    var 拡 = opts.scale || 1;
    var 中 = res.elements.slice().sort(function (a, b) { return (a.z || 0) - (b.z || 0); })
      .map(function (e) { return elHtml(e, t); }).join("");
    return '<div class="vqd-page" style="width:' + (W * 拡) + "px;height:" + (H * 拡)
      + 'px;overflow:hidden;position:relative">'
      + '<div style="width:' + W + "px;height:" + H + "px;position:absolute;left:0;top:0;"
      + "transform:scale(" + 拡 + ");transform-origin:0 0;background:" + res.background + '">'
      + 中 + "</div></div>";
  }

  function deckHtml(deck, opts) {
    return (deck.pages || []).map(function (p) { return pageHtml(p, deck.tokens, opts); }).join("");
  }

  VQD.preview = { pageHtml: pageHtml, deckHtml: deckHtml, elHtml: elHtml,
                  chartSvg: chartSvg, familyOf: familyOf, 書体を読む: 書体を読む, esc: esc };
})(typeof globalThis !== "undefined" ? globalThis : this);
