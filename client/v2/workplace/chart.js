/* ══════════════════════════════════════════════════════════════════════
   Vocabu Workplace — グラフ（Sheets §14.7 / Forms §16.9 / Slides で共用）

   決めごと（本体のデザインシステムに従う）:
   ・色は --vq-chart-1〜6 を **決まった順で** 割り当てる。使い回して増やさない。
     7 本目からは「その他」へまとめる（勝手に色を作らない）。
   ・軸は 1 本だけ。2 つの目盛りを重ねたグラフは作らない。
   ・系列が 2 本以上なら凡例を必ず出す（色だけで見分けさせない）。
   ・値をすべての点に書かない。棒・円は端だけ、折れ線は最後だけ。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var WP = VQ2.workplace || (VQ2.workplace = {});

  var SLOTS = 6;
  function color(i) { return "var(--vq-chart-" + ((i % SLOTS) + 1) + ")"; }
  function esc(s) {
    return String(s === undefined || s === null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function fmt(n) {
    if (Math.abs(n) >= 10000) return Math.round(n).toLocaleString("ja-JP");
    return Math.round(n * 100) / 100 + "";
  }

  var TYPES = [
    { id: "bar", label: "棒グラフ", icon: "chart" },
    { id: "hbar", label: "横棒グラフ", icon: "chart" },
    { id: "line", label: "折れ線", icon: "chart" },
    { id: "area", label: "面グラフ", icon: "chart" },
    { id: "pie", label: "円グラフ", icon: "pie" },
    { id: "donut", label: "ドーナツ", icon: "pie" },
    { id: "scatter", label: "散布図", icon: "chart" }
  ];

  /* 系列が 7 本以上になったら、7 本目以降を「その他」へ足す。
     色を作り足すより、まとめたほうが読める。 */
  function foldSeries(series) {
    if (series.length <= SLOTS) return { series: series, folded: 0 };
    var keep = series.slice(0, SLOTS - 1);
    var rest = series.slice(SLOTS - 1);
    var len = 0;
    rest.forEach(function (s) { len = Math.max(len, (s.values || []).length); });
    var merged = { name: "その他（" + rest.length + " 系列）", values: [] };
    for (var i = 0; i < len; i++) {
      var t = 0;
      rest.forEach(function (s) { t += num((s.values || [])[i]); });
      merged.values.push(t);
    }
    keep.push(merged);
    return { series: keep, folded: rest.length };
  }

  function niceMax(v) {
    if (v <= 0) return 1;
    var e = Math.pow(10, Math.floor(Math.log10(v)));
    var m = v / e;
    var step = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10;
    return step * e;
  }

  /* ══ 本体 ══════════════════════════════════════════════════════
     spec = { type, title, labels: [], series: [{name, values: []}], height }
     返すのは SVG の文字列。外側の div は呼び出し側が用意する。 */
  function render(spec, o) {
    o = o || {};
    spec = spec || {};
    var type = spec.type || "bar";
    var labels = (spec.labels || []).map(function (l) { return String(l); });
    var f = foldSeries((spec.series || []).filter(function (s) { return s && s.values; }));
    var series = f.series;
    var W = Math.max(240, num(o.width) || 640);
    var H = Math.max(160, num(o.height) || spec.height || 300);

    if (!series.length || !labels.length) {
      return '<div class="wp-empty" style="padding:28px"><div class="wp-empty__d">'
        + "グラフにするデータがありません。範囲を選び直してください。</div></div>";
    }

    var body = "";
    if (type === "pie" || type === "donut") body = pie(spec, labels, series, W, H, type === "donut");
    else if (type === "hbar") body = hbar(spec, labels, series, W, H);
    else if (type === "scatter") body = scatter(spec, labels, series, W, H);
    else body = cartesian(spec, labels, series, W, H, type);

    var legend = "";
    /* 系列が 1 本なら凡例は出さない（題名が名前を兼ねる）。 */
    var legendItems = (type === "pie" || type === "donut") ? labels : series.map(function (s) { return s.name; });
    if (legendItems.length > 1) {
      legend = '<div class="wp-legend">' + legendItems.slice(0, 12).map(function (n, i) {
        return '<span class="wp-legend__i"><span class="wp-legend__s" style="background:' + color(i)
          + '"></span>' + esc(n) + "</span>";
      }).join("") + (legendItems.length > 12 ? '<span class="wp-legend__i">ほか ' + (legendItems.length - 12) + " 件</span>" : "")
        + "</div>";
    }
    var note = f.folded ? '<div class="wp-legend"><span>※ 7 系列目以降の ' + f.folded
      + " 系列は「その他」にまとめています。</span></div>" : "";

    return '<div class="wp-chart">'
      + (spec.title ? '<div style="font:var(--vq-type-label);color:var(--vq-text);margin-bottom:6px">'
        + esc(spec.title) + "</div>" : "")
      + body + "</div>" + legend + note;
  }

  /* ── 棒・折れ線・面（縦軸 1 本）───────────────────────────────── */
  function cartesian(spec, labels, series, W, H, type) {
    var padL = 46, padR = 14, padT = 12, padB = 34;
    var iw = W - padL - padR, ih = H - padT - padB;
    var max = 0, min = 0;
    series.forEach(function (s) {
      (s.values || []).forEach(function (v) { max = Math.max(max, num(v)); min = Math.min(min, num(v)); });
    });
    var top = niceMax(max || 1);
    var bottom = min < 0 ? -niceMax(-min) : 0;
    var span = top - bottom || 1;
    function y(v) { return padT + ih - ((num(v) - bottom) / span) * ih; }

    var g = "";
    /* 目盛りは控えめに。5 本まで。 */
    for (var t = 0; t <= 4; t++) {
      var val = bottom + (span * t) / 4;
      var yy = y(val);
      g += '<line x1="' + padL + '" y1="' + yy.toFixed(1) + '" x2="' + (padL + iw)
        + '" y2="' + yy.toFixed(1) + '" stroke="var(--vq-chart-grid)" stroke-width="1"/>'
        + '<text x="' + (padL - 6) + '" y="' + (yy + 3.5).toFixed(1)
        + '" text-anchor="end" font-size="10" fill="var(--vq-text-tertiary)">' + esc(fmt(val)) + "</text>";
    }

    var n = labels.length;
    var step = iw / Math.max(1, n);
    var marks = "";

    if (type === "bar") {
      var gap = 2, groupW = step * 0.72;
      var barW = Math.max(2, (groupW - gap * (series.length - 1)) / series.length);
      series.forEach(function (s, si) {
        (s.values || []).forEach(function (v, i) {
          if (i >= n) return;
          var x = padL + step * i + (step - groupW) / 2 + si * (barW + gap);
          var yv = y(num(v)), y0 = y(0);
          var hgt = Math.abs(yv - y0);
          marks += '<rect x="' + x.toFixed(1) + '" y="' + Math.min(yv, y0).toFixed(1)
            + '" width="' + barW.toFixed(1) + '" height="' + Math.max(1, hgt).toFixed(1)
            + '" rx="3" fill="' + color(si) + '"><title>' + esc(labels[i] + " / " + s.name + ": " + fmt(num(v)))
            + "</title></rect>";
        });
      });
    } else if (type === "line" || type === "area") {
      series.forEach(function (s, si) {
        var pts = [], vals = s.values || [];
        for (var i = 0; i < n; i++) {
          var x = padL + step * i + step / 2;
          pts.push([x, y(num(vals[i]))]);
        }
        var d = pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" ");
        if (type === "area") {
          marks += '<path d="' + d + " L" + pts[pts.length - 1][0].toFixed(1) + " " + y(0).toFixed(1)
            + " L" + pts[0][0].toFixed(1) + " " + y(0).toFixed(1) + ' Z" fill="' + color(si) + '" opacity="0.18"/>';
        }
        marks += '<path d="' + d + '" fill="none" stroke="' + color(si)
          + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
        pts.forEach(function (p, i) {
          marks += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1)
            + '" r="3.4" fill="' + color(si) + '" stroke="var(--vq-surface)" stroke-width="2">'
            + "<title>" + esc(labels[i] + " / " + s.name + ": " + fmt(num((s.values || [])[i]))) + "</title></circle>";
        });
        /* 値は最後の点にだけ添える（全部の点には書かない）。 */
        var last = pts[pts.length - 1];
        if (last) marks += '<text x="' + (last[0] + 6) + '" y="' + (last[1] - 6)
          + '" font-size="10" fill="var(--vq-text-secondary)">' + esc(fmt(num((s.values || [])[n - 1]))) + "</text>";
      });
    }

    /* 横軸の名前。混み合うときは間引く。 */
    var everyN = Math.ceil(n / Math.max(1, Math.floor(iw / 56)));
    var axis = "";
    labels.forEach(function (l, i) {
      if (i % everyN) return;
      var x = padL + step * i + step / 2;
      axis += '<text x="' + x.toFixed(1) + '" y="' + (padT + ih + 16)
        + '" text-anchor="middle" font-size="10" fill="var(--vq-text-tertiary)">'
        + esc(l.length > 8 ? l.slice(0, 7) + "…" : l) + "</text>";
    });
    axis += '<line x1="' + padL + '" y1="' + y(bottom < 0 ? 0 : bottom).toFixed(1)
      + '" x2="' + (padL + iw) + '" y2="' + y(bottom < 0 ? 0 : bottom).toFixed(1)
      + '" stroke="var(--vq-border-strong)" stroke-width="1"/>';

    return svg(W, H, g + marks + axis, spec.title);
  }

  /* ── 横棒 ─────────────────────────────────────────────────────── */
  function hbar(spec, labels, series, W, H) {
    var padL = 108, padR = 44, padT = 8, padB = 18;
    var s0 = series[0];
    var vals = (s0.values || []).slice(0, labels.length);
    var max = niceMax(Math.max.apply(null, vals.map(num).concat([1])));
    var iw = W - padL - padR;
    var rowH = Math.max(20, Math.min(38, (H - padT - padB) / Math.max(1, vals.length)));
    var h = padT + rowH * vals.length + padB;
    var body = "";
    vals.forEach(function (v, i) {
      var y = padT + rowH * i + 3;
      var w = Math.max(1, (num(v) / max) * iw);
      body += '<text x="' + (padL - 8) + '" y="' + (y + rowH / 2) + '" text-anchor="end" font-size="11" '
        + 'fill="var(--vq-text-secondary)" dominant-baseline="middle">'
        + esc(labels[i].length > 12 ? labels[i].slice(0, 11) + "…" : labels[i]) + "</text>"
        + '<rect x="' + padL + '" y="' + y + '" width="' + w.toFixed(1) + '" height="' + (rowH - 7)
        + '" rx="3" fill="' + color(i) + '"><title>' + esc(labels[i] + ": " + fmt(num(v))) + "</title></rect>"
        + '<text x="' + (padL + w + 6) + '" y="' + (y + (rowH - 7) / 2)
        + '" font-size="11" fill="var(--vq-text-secondary)" dominant-baseline="middle">' + esc(fmt(num(v))) + "</text>";
    });
    return svg(W, h, body, spec.title);
  }

  /* ── 円・ドーナツ ─────────────────────────────────────────────── */
  function pie(spec, labels, series, W, H, donut) {
    var vals = (series[0].values || []).map(num).slice(0, labels.length);
    var total = vals.reduce(function (a, b) { return a + Math.max(0, b); }, 0);
    var cx = W / 2, cy = H / 2, r = Math.min(W, H) / 2 - 16;
    if (total <= 0) {
      return svg(W, H, '<text x="' + cx + '" y="' + cy + '" text-anchor="middle" font-size="12" '
        + 'fill="var(--vq-text-tertiary)">データがありません</text>', spec.title);
    }
    var a0 = -Math.PI / 2, body = "";
    vals.forEach(function (v, i) {
      var frac = Math.max(0, v) / total;
      if (frac <= 0) return;
      var a1 = a0 + frac * Math.PI * 2;
      var large = frac > 0.5 ? 1 : 0;
      var x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
      var x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
      body += '<path d="M' + cx + " " + cy + " L" + x0.toFixed(1) + " " + y0.toFixed(1)
        + " A" + r + " " + r + " 0 " + large + " 1 " + x1.toFixed(1) + " " + y1.toFixed(1) + ' Z" fill="'
        + color(i) + '" stroke="var(--vq-surface)" stroke-width="2"><title>'
        + esc(labels[i] + ": " + fmt(v) + "（" + Math.round(frac * 100) + "%）") + "</title></path>";
      /* 5% 未満は文字が重なるので書かない。 */
      if (frac >= 0.05) {
        var am = (a0 + a1) / 2, rr = donut ? r * 0.78 : r * 0.62;
        body += '<text x="' + (cx + rr * Math.cos(am)).toFixed(1) + '" y="' + (cy + rr * Math.sin(am)).toFixed(1)
          + '" text-anchor="middle" dominant-baseline="middle" font-size="11" font-weight="600" fill="#fff">'
          + Math.round(frac * 100) + "%</text>";
      }
      a0 = a1;
    });
    if (donut) body += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r * 0.55) + '" fill="var(--vq-surface)"/>'
      + '<text x="' + cx + '" y="' + cy + '" text-anchor="middle" dominant-baseline="middle" font-size="15" '
      + 'font-weight="700" fill="var(--vq-text)">' + esc(fmt(total)) + "</text>";
    return svg(W, H, body, spec.title);
  }

  /* ── 散布図 ───────────────────────────────────────────────────── */
  function scatter(spec, labels, series, W, H) {
    var padL = 46, padR = 14, padT = 12, padB = 30;
    var iw = W - padL - padR, ih = H - padT - padB;
    var xs = labels.map(function (l) { var n = Number(l); return isFinite(n) ? n : 0; });
    var xmax = niceMax(Math.max.apply(null, xs.concat([1])));
    var ymaxV = 0;
    series.forEach(function (s) { (s.values || []).forEach(function (v) { ymaxV = Math.max(ymaxV, num(v)); }); });
    var ymax = niceMax(ymaxV || 1);
    var body = "";
    for (var t = 0; t <= 4; t++) {
      var yy = padT + ih - (ih * t) / 4;
      body += '<line x1="' + padL + '" y1="' + yy + '" x2="' + (padL + iw) + '" y2="' + yy
        + '" stroke="var(--vq-chart-grid)" stroke-width="1"/>'
        + '<text x="' + (padL - 6) + '" y="' + (yy + 3.5) + '" text-anchor="end" font-size="10" '
        + 'fill="var(--vq-text-tertiary)">' + esc(fmt((ymax * t) / 4)) + "</text>";
    }
    series.forEach(function (s, si) {
      (s.values || []).forEach(function (v, i) {
        var x = padL + (xs[i] / xmax) * iw;
        var y = padT + ih - (num(v) / ymax) * ih;
        body += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="4.5" fill="' + color(si)
          + '" fill-opacity="0.82" stroke="var(--vq-surface)" stroke-width="1.4"><title>'
          + esc("(" + fmt(xs[i]) + ", " + fmt(num(v)) + ")") + "</title></circle>";
      });
    });
    return svg(W, H, body, spec.title);
  }

  function svg(W, H, inner, title) {
    return '<svg viewBox="0 0 ' + W + " " + H + '" width="100%" height="' + H
      + '" role="img" aria-label="' + esc(title || "グラフ") + '" preserveAspectRatio="xMidYMid meet">'
      + inner + "</svg>";
  }

  /* 表の代わりに読めるようにする（色だけに頼らないための表示 §27）。 */
  function tableView(spec) {
    var labels = spec.labels || [], series = spec.series || [];
    var h = '<div style="overflow-x:auto"><table class="wpd-tbl"><thead><tr><th scope="col">項目</th>'
      + series.map(function (s) { return '<th scope="col">' + esc(s.name || "値") + "</th>"; }).join("")
      + "</tr></thead><tbody>";
    labels.forEach(function (l, i) {
      h += "<tr><td>" + esc(l) + "</td>"
        + series.map(function (s) { return "<td>" + esc(fmt(num((s.values || [])[i]))) + "</td>"; }).join("") + "</tr>";
    });
    return h + "</tbody></table></div>";
  }

  WP.chart = { render: render, tableView: tableView, TYPES: TYPES, color: color, SLOTS: SLOTS };
})(typeof globalThis !== "undefined" ? globalThis : this);
