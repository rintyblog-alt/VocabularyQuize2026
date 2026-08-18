/* ══════════════════════════════════════════════════════════════════════
   core/geo/sci.js — 図形の 第 3 弾（数学の 作図・理科の 図）

   ★ 訴え（2026-08-17）「まだ無いもの を 全部 追加しちゃっていい」。
     相似・合同の印／垂線・角の二等分線／不等式の領域／複素数平面／
     極座標／空間座標／正十二面体・正二十面体／化学構造式／並列回路／
     斜面・ばね（力学）／年表

   ★ 決めごとは 前と 同じ。
     ・**値から 座標を 出す。**目分量では 置かない。
     ・縦横は **同じ倍率**。
     ・数が 読めなければ **描かない。**
     ・出す前に **点検**（NaN・枠外・空）。落ちたら 出さない。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQG = root.VQG || (root.VQG = {});

  function 文(v) { return v === undefined || v === null ? "" : String(v); }
  function 数(v, 既) { var n = parseFloat(v); return isFinite(n) ? n : 既; }
  function 丸(n, k) { var p = Math.pow(10, k === undefined ? 2 : k); return Math.round(n * p) / p; }
  function esc(s) {
    return 文(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  var 色ら = ["#2b70ef", "#e5484d", "#2ea043", "#d69600", "#8a81c2", "#00a3a3", "#c2557a"];
  var なぜ = "";
  function svg(W, H, 中, 名) {
    var 悪 = VQG.more && VQG.more.点検 ? VQG.more.点検(W, H, 中) : null;
    if (悪) { なぜ = (名 || "図") + ": " + 悪; return null; }
    return '<svg class="vqg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H
      + '" role="img" aria-label="' + esc(名 || "図") + '">' + 中 + "</svg>";
  }
  function 数ら(s) {
    return 文(s).split(/[\s,、]+/).map(Number).filter(function (x) { return isFinite(x); });
  }
  function 矢(x1, y1, x2, y2, 色, 太) {
    var a = Math.atan2(y2 - y1, x2 - x1), L = 9;
    return '<line x1="' + 丸(x1, 1) + '" y1="' + 丸(y1, 1) + '" x2="' + 丸(x2, 1) + '" y2="' + 丸(y2, 1)
      + '" stroke="' + (色 || "currentColor") + '" stroke-width="' + (太 || 2.2) + '"/>'
      + '<polygon points="' + [
        丸(x2, 1) + "," + 丸(y2, 1),
        丸(x2 - L * Math.cos(a - 0.4), 1) + "," + 丸(y2 - L * Math.sin(a - 0.4), 1),
        丸(x2 - L * Math.cos(a + 0.4), 1) + "," + 丸(y2 - L * Math.sin(a + 0.4), 1)
      ].join(" ") + '" fill="' + (色 || "currentColor") + '"/>';
  }
  function 目盛り(g, X, Y, 小x, 大x, 小y, 大y, W, H) {
    for (var vx = Math.ceil(小x); vx <= 大x; vx++) {
      if (!vx) continue;
      g.push('<line x1="' + 丸(X(vx), 1) + '" y1="' + 丸(Y(0) - 3, 1) + '" x2="' + 丸(X(vx), 1)
        + '" y2="' + 丸(Y(0) + 3, 1) + '" class="tk"/>');
    }
    for (var vy = Math.ceil(小y); vy <= 大y; vy++) {
      if (!vy) continue;
      g.push('<line x1="' + 丸(X(0) - 3, 1) + '" y1="' + 丸(Y(vy), 1) + '" x2="' + 丸(X(0) + 3, 1)
        + '" y2="' + 丸(Y(vy), 1) + '" class="tk"/>');
    }
  }

  /* ══ 相似・合同 ═══════════════════════════════════════════════ */
  function 三辺座標(a, b, c) {
    if (!(a > 0 && b > 0 && c > 0)) return null;
    if (a + b <= c || b + c <= a || c + a <= b) return null;
    var A = Math.acos((a * a + b * b - c * c) / (2 * a * b));
    return [{ x: 0, y: 0 }, { x: a, y: 0 }, { x: b * Math.cos(A), y: b * Math.sin(A) }];
  }
  function 相似(a, b, c, 比, 合同) {
    var P = 三辺座標(a, b, c);
    if (!P || !(比 > 0)) return null;
    var W = 300, H = 190, 余 = 26;
    var 大 = Math.max(a, b, c) * (1 + 比);
    var s = Math.min((W - 余 * 3) / 大, (H - 余 * 2) / (Math.max.apply(null, P.map(function (p) { return p.y; })) * Math.max(1, 比)));
    var g = [], 印 = ["", "‖", "≡"];
    [[1, 20], [比, 20 + (Math.max(a, b, c) * s) + 26]].forEach(function (t, k) {
      var 倍 = t[0] * s, x0 = t[1], y0 = H - 34;
      var ps = P.map(function (p) { return [x0 + p.x * 倍, y0 - p.y * 倍]; });
      g.push('<polygon points="' + ps.map(function (p) { return 丸(p[0], 1) + "," + 丸(p[1], 1); }).join(" ")
        + '" class="sh" style="fill:' + 色ら[k] + '22;stroke:' + 色ら[k] + '"/>');
      /* 対応する辺に **同じ数の 印**（相似・合同の しるし） */
      [[0, 1, 1], [0, 2, 2], [1, 2, 3]].forEach(function (e) {
        var A2 = ps[e[0]], B2 = ps[e[1]];
        var mx = (A2[0] + B2[0]) / 2, my = (A2[1] + B2[1]) / 2;
        var dx = B2[0] - A2[0], dy = B2[1] - A2[1], L = Math.sqrt(dx * dx + dy * dy) || 1;
        var nx = -dy / L, ny = dx / L;
        for (var i = 0; i < e[2]; i++) {
          var o = (i - (e[2] - 1) / 2) * 4;
          g.push('<line x1="' + 丸(mx + nx * 4 + dx / L * o, 1) + '" y1="' + 丸(my + ny * 4 + dy / L * o, 1)
            + '" x2="' + 丸(mx - nx * 4 + dx / L * o, 1) + '" y2="' + 丸(my - ny * 4 + dy / L * o, 1)
            + '" stroke="' + 色ら[k] + '" stroke-width="1.6"/>');
        }
      });
      var 名 = [a, b, c].map(function (v) { return 丸(v * t[0], 2); }).join(", ");
      g.push('<text x="' + 丸(x0 + Math.max(a, b, c) * 倍 / 2, 1) + '" y="' + (H - 14) + '" class="lb">' + 名 + "</text>");
    });
    g.push('<text x="' + (W / 2) + '" y="16" class="lb">' + (合同 ? "合同（≡）" : "相似比 1 : " + 丸(比, 2)) + "</text>");
    return svg(W, H, g.join(""), 合同 ? "合同" : "相似");
  }

  /* ══ 作図（垂線・角の二等分線）═════════════════════════════════ */
  function 垂線(A, B, P) {
    if (!A || !B || !P) return null;
    var dx = B.x - A.x, dy = B.y - A.y, L2 = dx * dx + dy * dy;
    if (L2 < 1e-9) return null;
    var t = ((P.x - A.x) * dx + (P.y - A.y) * dy) / L2;
    var H2 = { x: A.x + dx * t, y: A.y + dy * t };            /* 足（計算で 出す） */
    var pts = [A, B, P, H2];
    var 小x = Math.min.apply(null, pts.map(function (p) { return p.x; })) - 1;
    var 大x = Math.max.apply(null, pts.map(function (p) { return p.x; })) + 1;
    var 小y = Math.min.apply(null, pts.map(function (p) { return p.y; })) - 1;
    var 大y = Math.max.apply(null, pts.map(function (p) { return p.y; })) + 1;
    var W = 260, H = 200, 余 = 28;
    var s = Math.min((W - 余 * 2) / (大x - 小x), (H - 余 * 2) / (大y - 小y));
    var X = function (x) { return 余 + (x - 小x) * s; }, Y = function (y) { return H - 余 - (y - 小y) * s; };
    var g = [];
    g.push('<line x1="' + 丸(X(A.x), 1) + '" y1="' + 丸(Y(A.y), 1) + '" x2="' + 丸(X(B.x), 1) + '" y2="' + 丸(Y(B.y), 1) + '" class="ln"/>');
    g.push('<line x1="' + 丸(X(P.x), 1) + '" y1="' + 丸(Y(P.y), 1) + '" x2="' + 丸(X(H2.x), 1) + '" y2="' + 丸(Y(H2.y), 1) + '" class="gl"/>');
    /* 直角の印 */
    var u = { x: dx / Math.sqrt(L2), y: dy / Math.sqrt(L2) };
    var v = { x: (P.x - H2.x), y: (P.y - H2.y) };
    var vl = Math.sqrt(v.x * v.x + v.y * v.y) || 1;
    v = { x: v.x / vl, y: v.y / vl };
    var d2 = 11 / s;
    g.push('<polyline points="' + [
      [H2.x + u.x * d2, H2.y + u.y * d2],
      [H2.x + u.x * d2 + v.x * d2, H2.y + u.y * d2 + v.y * d2],
      [H2.x + v.x * d2, H2.y + v.y * d2]
    ].map(function (p) { return 丸(X(p[0]), 1) + "," + 丸(Y(p[1]), 1); }).join(" ") + '" class="rt"/>');
    [[A, "A"], [B, "B"], [P, "P"], [H2, "H"]].forEach(function (t2) {
      g.push('<circle cx="' + 丸(X(t2[0].x), 1) + '" cy="' + 丸(Y(t2[0].y), 1) + '" r="2.8" class="pt"/>');
      g.push('<text x="' + 丸(X(t2[0].x), 1) + '" y="' + 丸(Y(t2[0].y) - 8, 1) + '" class="nm">' + t2[1] + "</text>");
    });
    var 長 = Math.sqrt((P.x - H2.x) * (P.x - H2.x) + (P.y - H2.y) * (P.y - H2.y));
    g.push('<text x="' + (W / 2) + '" y="' + (H - 6) + '" class="lb">H(' + 丸(H2.x, 2) + ", " + 丸(H2.y, 2)
      + ")　PH = " + 丸(長, 3) + "</text>");
    return svg(W, H, g.join(""), "垂線");
  }
  function 二等分線(角) {
    角 = 数(角, null);
    if (角 === null || 角 <= 0 || 角 >= 180) return null;
    var W = 240, H = 190, ox = 40, oy = H - 40, R = 130;
    var t = 角 * Math.PI / 180, h = t / 2;
    var g = [];
    g.push('<line x1="' + ox + '" y1="' + oy + '" x2="' + 丸(ox + R, 1) + '" y2="' + oy + '" class="ln"/>');
    g.push('<line x1="' + ox + '" y1="' + oy + '" x2="' + 丸(ox + R * Math.cos(t), 1) + '" y2="' + 丸(oy - R * Math.sin(t), 1) + '" class="ln"/>');
    g.push('<line x1="' + ox + '" y1="' + oy + '" x2="' + 丸(ox + R * 0.85 * Math.cos(h), 1) + '" y2="' + 丸(oy - R * 0.85 * Math.sin(h), 1) + '" class="gl"/>');
    [0, h, t].forEach(function (a, i) {
      var r = 34 + i * 0;
      g.push('<path d="M' + 丸(ox + r * Math.cos(i ? (i === 1 ? 0 : h) : 0), 1) + " " + 丸(oy - r * Math.sin(i ? (i === 1 ? 0 : h) : 0), 1)
        + "A" + r + " " + r + " 0 0 0 " + 丸(ox + r * Math.cos(i === 1 ? h : (i === 2 ? t : 0)), 1) + " "
        + 丸(oy - r * Math.sin(i === 1 ? h : (i === 2 ? t : 0)), 1) + '" fill="none" class="gd"/>');
    });
    g.push('<text x="' + 丸(ox + 52 * Math.cos(h / 2), 1) + '" y="' + 丸(oy - 52 * Math.sin(h / 2) + 4, 1) + '" class="lb">' + 丸(角 / 2, 1) + "°</text>");
    g.push('<text x="' + 丸(ox + 52 * Math.cos(h * 1.5), 1) + '" y="' + 丸(oy - 52 * Math.sin(h * 1.5) + 4, 1) + '" class="lb">' + 丸(角 / 2, 1) + "°</text>");
    g.push('<text x="' + (W / 2) + '" y="16" class="lb">' + 丸(角, 1) + "° の 二等分線</text>");
    return svg(W, H, g.join(""), "角の二等分線");
  }

  /* ══ 不等式の 領域 ═══════════════════════════════════════════ */
  function 領域(式) {
    var m = /y\s*(>=|≧|>|<=|≦|<)\s*(.+)$/i.exec(文(式));
    if (!m) return null;
    var f = VQG.more && VQG.more.式にする ? VQG.more.式にする(m[2]) : null;
    if (!f) return null;
    var 上 = />/.test(m[1]) || /≧/.test(m[1]);
    var 含 = /=|≧|≦/.test(m[1]);
    var W = 280, H = 240, 小x = -5, 大x = 5;
    var ys = [];
    for (var i = 0; i <= 200; i++) { var y = f(小x + (大x - 小x) * i / 200); if (isFinite(y)) ys.push(y); }
    if (!ys.length) return null;
    ys.sort(function (a, b) { return a - b; });
    var 小y = ys[Math.round((ys.length - 1) * 0.05)], 大y = ys[Math.round((ys.length - 1) * 0.95)];
    var 幅 = Math.max(1, 大y - 小y);
    小y -= 幅 * 0.5; 大y += 幅 * 0.5;
    var 余 = 24;
    var X = function (x) { return 余 + (x - 小x) / (大x - 小x) * (W - 余 * 2); };
    var Y = function (y) { return H - 余 - (y - 小y) / (大y - 小y) * (H - 余 * 2); };
    var g = [];
    g.push('<line x1="' + 余 + '" y1="' + 丸(Y(0), 1) + '" x2="' + (W - 余) + '" y2="' + 丸(Y(0), 1) + '" class="ax"/>');
    g.push('<line x1="' + 丸(X(0), 1) + '" y1="' + 余 + '" x2="' + 丸(X(0), 1) + '" y2="' + (H - 余) + '" class="ax"/>');
    目盛り(g, X, Y, 小x, 大x, 小y, 大y, W, H);
    var 上端 = [], 線 = [];
    for (var k = 0; k <= 200; k++) {
      var x2 = 小x + (大x - 小x) * k / 200, y2 = f(x2);
      if (!isFinite(y2)) continue;
      y2 = Math.max(小y, Math.min(大y, y2));
      線.push(丸(X(x2), 1) + "," + 丸(Y(y2), 1));
      上端.push([X(x2), Y(y2)]);
    }
    if (線.length < 2) return null;
    var 塗 = 線.slice();
    塗.push(丸(X(大x), 1) + "," + 丸(上 ? Y(大y) : Y(小y), 1));
    塗.push(丸(X(小x), 1) + "," + 丸(上 ? Y(大y) : Y(小y), 1));
    g.push('<polygon points="' + 塗.join(" ") + '" fill="rgba(43,112,239,.20)" stroke="none"/>');
    g.push('<polyline points="' + 線.join(" ") + '" class="fn"'
      + (含 ? "" : ' stroke-dasharray="5 4"') + "/>");
    g.push('<text x="' + (W / 2) + '" y="16" class="lb">y ' + esc(m[1]) + " " + esc(m[2])
      + (含 ? "（境目を 含む）" : "（境目を 含まない）") + "</text>");
    return svg(W, H, g.join(""), "領域");
  }

  /* ══ 複素数平面 ═══════════════════════════════════════════════ */
  function 複素数(s) {
    var 出 = [], re = /(-?[\d.]*)\s*([+-])\s*(-?[\d.]*)\s*i|(-?[\d.]+)\s*i|(-?[\d.]+)/g, m;
    文(s).split(/[,、]+/).forEach(function (t) {
      t = t.trim(); if (!t) return;
      var mm = /^(-?[\d.]+)?\s*([+-]\s*[\d.]*)i$/.exec(t.replace(/\s+/g, ""));
      if (mm) {
        var a = 数(mm[1], 0);
        var b = mm[2].replace(/\s+/g, "");
        b = (b === "+" ? 1 : b === "-" ? -1 : 数(b, 0));
        出.push({ a: a, b: b }); return;
      }
      var m2 = /^(-?[\d.]*)i$/.exec(t.replace(/\s+/g, ""));
      if (m2) { 出.push({ a: 0, b: m2[1] === "" ? 1 : (m2[1] === "-" ? -1 : 数(m2[1], 0)) }); return; }
      var v = 数(t, null);
      if (v !== null) 出.push({ a: v, b: 0 });
    });
    if (!出.length) return null;
    var 大 = 1;
    出.forEach(function (z) { 大 = Math.max(大, Math.abs(z.a), Math.abs(z.b)); });
    var W = 240, H = 230, cx = 120, cy = 108, s2 = 82 / 大;
    var g = ['<line x1="10" y1="' + cy + '" x2="' + (W - 10) + '" y2="' + cy + '" class="ax"/>',
             '<line x1="' + cx + '" y1="10" x2="' + cx + '" y2="' + (H - 30) + '" class="ax"/>',
             '<text x="' + (W - 14) + '" y="' + (cy - 6) + '" class="lb">実</text>',
             '<text x="' + (cx + 10) + '" y="18" class="lb">虚</text>'];
    出.slice(0, 4).forEach(function (z, i) {
      var x2 = cx + z.a * s2, y2 = cy - z.b * s2;
      g.push(矢(cx, cy, x2, y2, 色ら[i % 7], 2.2));
      var r = Math.sqrt(z.a * z.a + z.b * z.b);
      var th = Math.atan2(z.b, z.a) * 180 / Math.PI;
      g.push('<text x="' + 丸(x2 + (z.a >= 0 ? 8 : -8), 1) + '" y="' + 丸(y2 - 6, 1) + '" class="lb">'
        + 丸(z.a, 2) + (z.b >= 0 ? "+" : "-") + 丸(Math.abs(z.b), 2) + "i</text>");
      g.push('<text x="' + (W / 2) + '" y="' + (H - 18 + i * 0) + '" class="lb">|z| = ' + 丸(r, 3)
        + "　偏角 " + 丸(th, 1) + "°</text>");
    });
    return svg(W, H, g.join(""), "複素数平面");
  }

  /* ══ 極座標 ═══════════════════════════════════════════════════ */
  function 極座標(式) {
    var 本 = 文(式).replace(/^\s*r\s*=\s*/i, "").replace(/θ|t\b/g, "x");
    var f = VQG.more && VQG.more.式にする ? VQG.more.式にする(本) : null;
    if (!f) return null;
    var W = 240, H = 240, cx = 120, cy = 120;
    var 大 = 0, 点 = [];
    for (var i = 0; i <= 720; i++) {
      var th = i * Math.PI / 180 * 2, r = f(th);
      if (!isFinite(r)) continue;
      大 = Math.max(大, Math.abs(r));
    }
    if (!(大 > 0)) return null;
    var s = 96 / 大;
    for (var k = 0; k <= 720; k++) {
      var t2 = k * Math.PI / 180 * 2, r2 = f(t2);
      if (!isFinite(r2)) { 点.push(null); continue; }
      点.push([cx + r2 * s * Math.cos(t2), cy - r2 * s * Math.sin(t2)]);
    }
    var g = ['<line x1="10" y1="' + cy + '" x2="' + (W - 10) + '" y2="' + cy + '" class="ax"/>',
             '<line x1="' + cx + '" y1="10" x2="' + cx + '" y2="' + (H - 10) + '" class="ax"/>'];
    [0.33, 0.66, 1].forEach(function (p) {
      g.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + 丸(96 * p, 1) + '" class="gd" fill="none"/>');
    });
    var 並 = [];
    点.forEach(function (p) {
      if (!p) { if (並.length > 1) g.push('<polyline points="' + 並.join(" ") + '" class="fn"/>'); 並 = []; return; }
      if (p[0] < 0 || p[0] > W || p[1] < 0 || p[1] > H) {
        if (並.length > 1) g.push('<polyline points="' + 並.join(" ") + '" class="fn"/>');
        並 = []; return;
      }
      並.push(丸(p[0], 1) + "," + 丸(p[1], 1));
    });
    if (並.length > 1) g.push('<polyline points="' + 並.join(" ") + '" class="fn"/>');
    return svg(W, H, g.join(""), "極座標");
  }

  /* ══ 空間座標（3D の 見取り図）════════════════════════════════ */
  function 空間(点す) {
    var ps = [], re = /\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/g, m;
    while ((m = re.exec(文(点す)))) ps.push({ x: 数(m[1], 0), y: 数(m[2], 0), z: 数(m[3], 0) });
    if (!ps.length) return null;
    var 大 = 1;
    ps.forEach(function (p) { 大 = Math.max(大, Math.abs(p.x), Math.abs(p.y), Math.abs(p.z)); });
    var W = 240, H = 230, ox = 92, oy = 152, s = 62 / 大;
    /* y は 奥（斜め 45°・0.55 倍）。**この比は 固定**（毎回 同じ見え方にする） */
    var P = function (p) { return [ox + (p.x + p.y * 0.55 * 0.71) * s, oy - (p.z + p.y * 0.55 * 0.71) * s]; };
    var g = [];
    g.push(矢(ox, oy, ox + 大 * s * 1.15, oy, "currentColor", 1.4));
    g.push(矢(ox, oy, ox + 大 * s * 0.55 * 0.71 * 1.3, oy - 大 * s * 0.55 * 0.71 * 1.3, "currentColor", 1.4));
    g.push(矢(ox, oy, ox, oy - 大 * s * 1.15, "currentColor", 1.4));
    g.push('<text x="' + 丸(ox + 大 * s * 1.15 + 8, 1) + '" y="' + (oy + 4) + '" class="lb">x</text>');
    g.push('<text x="' + 丸(ox + 大 * s * 0.55 * 0.71 * 1.3 + 8, 1) + '" y="' + 丸(oy - 大 * s * 0.55 * 0.71 * 1.3, 1) + '" class="lb">y</text>');
    g.push('<text x="' + (ox - 10) + '" y="' + 丸(oy - 大 * s * 1.15, 1) + '" class="lb">z</text>');
    ps.slice(0, 4).forEach(function (p, i) {
      var q = P(p), 足 = P({ x: p.x, y: p.y, z: 0 });
      g.push('<line x1="' + 丸(足[0], 1) + '" y1="' + 丸(足[1], 1) + '" x2="' + 丸(q[0], 1) + '" y2="' + 丸(q[1], 1) + '" class="gd"/>');
      g.push('<circle cx="' + 丸(q[0], 1) + '" cy="' + 丸(q[1], 1) + '" r="3.2" fill="' + 色ら[i % 7] + '"/>');
      g.push('<text x="' + 丸(q[0] + 8, 1) + '" y="' + 丸(q[1] - 6, 1) + '" class="lb">(' + p.x + "," + p.y + "," + p.z + ")</text>");
    });
    var p0 = ps[0];
    g.push('<text x="' + (W / 2) + '" y="' + (H - 6) + '" class="lb">原点からの 距離 '
      + 丸(Math.sqrt(p0.x * p0.x + p0.y * p0.y + p0.z * p0.z), 3) + "</text>");
    return svg(W, H, g.join(""), "空間座標");
  }

  /* ══ 正十二面体・正二十面体（見取り図＋正しい体積）══════════════ */
  function 正多面体2(種, a) {
    if (!(a > 0)) return null;
    var 十二 = /十二|dodeca/.test(種);
    var W = 210, H = 210, cx = 105, cy = 100, R = 76;
    var g = [];
    var n = 十二 ? 5 : 3;
    /* 外側の 輪郭（正 n 角形を 2 枚 ずらして 重ねる。見取り図として 一定） */
    [[R, 0, 1], [R * 0.62, Math.PI / n, 0.55]].forEach(function (t, k) {
      var ps = [];
      for (var i = 0; i < n * (十二 ? 1 : 1); i++) {
        var ang = -Math.PI / 2 + t[1] + i * Math.PI * 2 / n;
        ps.push([cx + t[0] * Math.cos(ang), cy + t[0] * Math.sin(ang)]);
      }
      g.push('<polygon points="' + ps.map(function (p) { return 丸(p[0], 1) + "," + 丸(p[1], 1); }).join(" ")
        + '" class="sh" style="opacity:' + t[2] + '"/>');
      if (k === 0) {
        ps.forEach(function (p, i) {
          var q = ps[(i + 1) % ps.length];
          g.push('<line x1="' + 丸(p[0], 1) + '" y1="' + 丸(p[1], 1) + '" x2="' + 丸(q[0], 1) + '" y2="' + 丸(q[1], 1) + '" class="ln"/>');
        });
      }
    });
    var 体 = 十二 ? (15 + 7 * Math.sqrt(5)) / 4 * a * a * a
                  : 5 * (3 + Math.sqrt(5)) / 12 * a * a * a;
    g.push('<text x="' + cx + '" y="' + (H - 6) + '" class="lb">'
      + (十二 ? "正十二面体" : "正二十面体") + " 一辺 " + 丸(a, 2) + " ／ 体積 " + 丸(体, 3) + "</text>");
    return svg(W, H, g.join(""), "正多面体");
  }

  /* ══ 化学構造式 ═══════════════════════════════════════════════ */
  var 構造 = {
    "CH4": { 中: "C", 枝: [["H", 90], ["H", 210], ["H", 330], ["H", 30]] },
    "H2O": { 中: "O", 枝: [["H", 210], ["H", 330]] },
    "NH3": { 中: "N", 枝: [["H", 90], ["H", 210], ["H", 330]] },
    "CO2": { 中: "C", 枝: [["O", 0, 2], ["O", 180, 2]] },
    "CH3OH": { 中: "C", 枝: [["H", 90], ["H", 210], ["H", 330], ["OH", 0]] }
  };
  function 構造式(名) {
    var n = 文(名).replace(/\s+/g, "");
    if (/^(ベンゼン|benzene|C6H6)$/i.test(n)) return ベンゼン();
    var d = 構造[n.toUpperCase()] || 構造[n];
    if (!d) return null;
    var W = 190, H = 170, cx = 95, cy = 82, R = 46;
    var g = ['<text x="' + cx + '" y="' + (cy + 6) + '" class="nm" style="font-size:16px">' + esc(d.中) + "</text>"];
    d.枝.forEach(function (b) {
      var a = b[1] * Math.PI / 180;
      var x1 = cx + 14 * Math.cos(a), y1 = cy - 14 * Math.sin(a);
      var x2 = cx + R * Math.cos(a), y2 = cy - R * Math.sin(a);
      var 本 = b[2] || 1;
      for (var i = 0; i < 本; i++) {
        var o = (i - (本 - 1) / 2) * 4;
        var nx = -Math.sin(a) * o, ny = -Math.cos(a) * o;
        g.push('<line x1="' + 丸(x1 + nx, 1) + '" y1="' + 丸(y1 + ny, 1) + '" x2="' + 丸(x2 + nx, 1)
          + '" y2="' + 丸(y2 + ny, 1) + '" class="ln"/>');
      }
      g.push('<text x="' + 丸(cx + (R + 12) * Math.cos(a), 1) + '" y="' + 丸(cy - (R + 12) * Math.sin(a) + 5, 1)
        + '" class="nm" style="font-size:14px">' + esc(b[0]) + "</text>");
    });
    g.push('<text x="' + cx + '" y="' + (H - 6) + '" class="lb">' + esc(n) + "</text>");
    return svg(W, H, g.join(""), "構造式");
  }
  function ベンゼン() {
    var W = 180, H = 180, cx = 90, cy = 84, R = 52;
    var g = [], ps = [];
    for (var i = 0; i < 6; i++) {
      var a = -Math.PI / 2 + i * Math.PI / 3;
      ps.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
    }
    g.push('<polygon points="' + ps.map(function (p) { return 丸(p[0], 1) + "," + 丸(p[1], 1); }).join(" ") + '" class="sh" fill="none"/>');
    g.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + 丸(R * 0.58, 1) + '" class="gd" fill="none"/>');
    ps.forEach(function (p) {
      g.push('<text x="' + 丸(p[0], 1) + '" y="' + 丸(p[1] + 4, 1) + '" class="nm" style="font-size:12px">C</text>');
    });
    g.push('<text x="' + cx + '" y="' + (H - 6) + '" class="lb">ベンゼン C6H6</text>');
    return svg(W, H, g.join(""), "ベンゼン");
  }

  /* ══ 並列も 描ける 回路 ═══════════════════════════════════════ */
  function 回路2(並び) {
    var s = 文(並び);
    var 段 = s.split(/\s*[-–—]\s*/).map(function (t) { return t.trim(); }).filter(Boolean);
    if (!段.length) return null;
    var 並列あり = /[（(].+[|｜].+[)）]/.test(s);
    var W = Math.min(330, 80 + 段.length * 66), H = 並列あり ? 170 : 130;
    var y = 46, x0 = 26, 幅 = (W - x0 * 2) / 段.length;
    var g = [];
    var 部品 = function (cx, cy, n) {
      var o = [];
      if (/電池|battery/.test(n)) {
        o.push('<line x1="' + 丸(cx - 5, 1) + '" y1="' + (cy - 9) + '" x2="' + 丸(cx - 5, 1) + '" y2="' + (cy + 9) + '" class="ln"/>');
        o.push('<line x1="' + 丸(cx + 5, 1) + '" y1="' + (cy - 4) + '" x2="' + 丸(cx + 5, 1) + '" y2="' + (cy + 4) + '" class="ln"/>');
      } else if (/電球|lamp/.test(n)) {
        o.push('<circle cx="' + 丸(cx, 1) + '" cy="' + cy + '" r="8" fill="none" stroke="currentColor" stroke-width="1.5"/>');
        o.push('<line x1="' + 丸(cx - 6, 1) + '" y1="' + (cy - 6) + '" x2="' + 丸(cx + 6, 1) + '" y2="' + (cy + 6) + '" class="gd"/>');
      } else if (/スイッチ|switch/.test(n)) {
        o.push('<line x1="' + 丸(cx - 9, 1) + '" y1="' + cy + '" x2="' + 丸(cx + 7, 1) + '" y2="' + (cy - 9) + '" class="ln"/>');
        o.push('<circle cx="' + 丸(cx - 9, 1) + '" cy="' + cy + '" r="2" class="pt"/>');
      } else {
        o.push('<rect x="' + 丸(cx - 12, 1) + '" y="' + (cy - 6) + '" width="24" height="12" fill="none" stroke="currentColor" stroke-width="1.5"/>');
      }
      o.push('<text x="' + 丸(cx, 1) + '" y="' + (cy + 26) + '" class="lb">' + esc(n.replace(/[（()）|｜]/g, " ").trim()) + "</text>");
      return o.join("");
    };
    g.push('<rect x="' + x0 + '" y="' + y + '" width="' + 丸(W - x0 * 2, 1) + '" height="' + (H - y - 34)
      + '" fill="none" stroke="currentColor" stroke-width="1.6"/>');
    段.forEach(function (n, i) {
      var cx = x0 + 幅 * i + 幅 / 2;
      var 並 = /^[（(](.+)[)）]$/.exec(n);
      if (並 && /[|｜]/.test(並[1])) {
        var 枝 = 並[1].split(/[|｜]/).map(function (t) { return t.trim(); }).filter(Boolean);
        var 上 = y - 22, 下 = y + 22;
        枝.slice(0, 2).forEach(function (b, k) {
          var by = k === 0 ? 上 : 下;
          g.push('<line x1="' + 丸(cx - 26, 1) + '" y1="' + y + '" x2="' + 丸(cx - 26, 1) + '" y2="' + by + '" class="ln"/>');
          g.push('<line x1="' + 丸(cx - 26, 1) + '" y1="' + by + '" x2="' + 丸(cx + 26, 1) + '" y2="' + by + '" class="ln"/>');
          g.push('<line x1="' + 丸(cx + 26, 1) + '" y1="' + by + '" x2="' + 丸(cx + 26, 1) + '" y2="' + y + '" class="ln"/>');
          g.push('<rect x="' + 丸(cx - 13, 1) + '" y="' + (by - 7) + '" width="26" height="14" fill="var(--vq-surface,#fff)" stroke="none"/>');
          g.push(部品(cx, by, b));
        });
        return;
      }
      g.push('<rect x="' + 丸(cx - 16, 1) + '" y="' + (y - 10) + '" width="32" height="20" fill="var(--vq-surface,#fff)" stroke="none"/>');
      g.push(部品(cx, y, n));
    });
    return svg(W, H, g.join(""), "回路");
  }

  /* ══ 斜面と ばね（力学）═══════════════════════════════════════ */
  function 斜面(角, 質量) {
    角 = 数(角, null); 質量 = 数(質量, 1);
    if (角 === null || 角 <= 0 || 角 >= 90) return null;
    var W = 290, H = 200, ox = 24, oy = H - 34, L = 220;
    var t = 角 * Math.PI / 180;
    var 高 = L * Math.tan(t);
    var s = Math.min(1, (H - 60) / 高);
    var 底 = L * s, たか = 高 * s;
    var g = ['<polygon points="' + [[ox, oy], [ox + 底, oy], [ox + 底, oy - たか]]
      .map(function (p) { return 丸(p[0], 1) + "," + 丸(p[1], 1); }).join(" ") + '" class="sh"/>'];
    /* 物体は 斜面の 真ん中 */
    var mx = ox + 底 * 0.55, my = oy - たか * 0.55;
    var 直 = { x: Math.sin(t), y: Math.cos(t) };
    g.push('<rect x="' + 丸(mx - 11, 1) + '" y="' + 丸(my - 11, 1) + '" width="22" height="22" rx="3" fill="'
      + 色ら[0] + '" opacity=".85" transform="rotate(' + 丸(-角, 1) + " " + 丸(mx, 1) + " " + 丸(my, 1) + ')"/>');
    var W重 = 質量 * 9.8;
    var s2 = 46 / Math.max(1, W重);
    g.push(矢(mx, my, mx, my + W重 * s2, 色ら[1], 2.4));
    g.push('<text x="' + 丸(mx + 8, 1) + '" y="' + 丸(my + W重 * s2 + 4, 1) + '" class="lb">' + 丸(W重, 2) + "N</text>");
    var 平 = W重 * Math.sin(t), 垂 = W重 * Math.cos(t);
    g.push(矢(mx, my, mx - 平 * s2 * Math.cos(t), my + 平 * s2 * Math.sin(t), 色ら[2], 2));
    g.push(矢(mx, my, mx + 垂 * s2 * Math.sin(t), my + 垂 * s2 * Math.cos(t), 色ら[3], 2));
    g.push('<text x="' + (W / 2) + '" y="16" class="lb">' + 丸(角, 1) + "° ／ " + 丸(質量, 2) + "kg</text>");
    g.push('<text x="' + (W / 2) + '" y="' + (H - 6) + '" class="lb">斜面方向 ' + 丸(平, 2)
      + "N ／ 垂直方向 " + 丸(垂, 2) + "N</text>");
    return svg(W, H, g.join(""), "斜面");
  }
  function ばね(k, x) {
    k = 数(k, null); x = 数(x, null);
    if (k === null || x === null || k <= 0) return null;
    var W = 290, H = 130, y = 60, x0 = 26;
    var 巻 = 8, 幅 = 120 + x * 60;
    if (!(幅 > 40 && 幅 < 200)) 幅 = Math.max(40, Math.min(200, 幅));
    var g = ['<line x1="' + x0 + '" y1="' + (y - 26) + '" x2="' + x0 + '" y2="' + (y + 26) + '" class="ln"/>'];
    var 点 = [[x0, y]];
    for (var i = 0; i <= 巻 * 2; i++) {
      点.push([x0 + 10 + (幅 - 20) * i / (巻 * 2), y + (i % 2 ? -11 : 11)]);
    }
    点.push([x0 + 幅, y]);
    g.push('<polyline points="' + 点.map(function (p) { return 丸(p[0], 1) + "," + 丸(p[1], 1); }).join(" ")
      + '" fill="none" stroke="currentColor" stroke-width="1.8"/>');
    g.push('<rect x="' + 丸(x0 + 幅, 1) + '" y="' + (y - 15) + '" width="30" height="30" rx="4" fill="' + 色ら[0] + '" opacity=".85"/>');
    var F = k * x;
    g.push(矢(x0 + 幅 + 34, y, x0 + 幅 + 34 + Math.min(60, Math.abs(F) * 6) * (x >= 0 ? 1 : -1), y, 色ら[1], 2.4));
    g.push('<text x="' + (W / 2) + '" y="18" class="lb">k = ' + 丸(k, 2) + " N/m ／ x = " + 丸(x, 3) + " m</text>");
    g.push('<text x="' + (W / 2) + '" y="' + (H - 8) + '" class="lb">弾性力 F = kx = ' + 丸(F, 3)
      + "N ／ 位置エネルギー " + 丸(0.5 * k * x * x, 4) + "J</text>");
    return svg(W, H, g.join(""), "ばね");
  }

  /* ══ 年表 ═══════════════════════════════════════════════════ */
  function 年表(s) {
    var 出 = [];
    文(s).split(/[,、\n]+/).forEach(function (t) {
      var m = /^\s*(-?\d{1,4})\s*年?\s*[:：]?\s*(.+?)\s*$/.exec(t);
      if (m) 出.push({ 年: Number(m[1]), 事: m[2] });
    });
    if (出.length < 2) return null;
    出.sort(function (a, b) { return a.年 - b.年; });
    var 小 = 出[0].年, 大 = 出[出.length - 1].年;
    if (大 === 小) 大 = 小 + 1;
    var W = 300, H = 44 + 出.length * 26;
    var 左 = 46, 右 = 14;
    var Y = function (v) { return 26 + (v - 小) / (大 - 小) * (H - 52); };
    var g = ['<line x1="' + 左 + '" y1="20" x2="' + 左 + '" y2="' + (H - 20) + '" class="ax"/>'];
    出.forEach(function (x, i) {
      var y = Y(x.年);
      g.push('<circle cx="' + 左 + '" cy="' + 丸(y, 1) + '" r="3.4" fill="' + 色ら[i % 7] + '"/>');
      g.push('<line x1="' + 左 + '" y1="' + 丸(y, 1) + '" x2="' + (左 + 12) + '" y2="' + 丸(y, 1) + '" class="gd"/>');
      g.push('<text x="' + (左 - 6) + '" y="' + 丸(y + 4, 1) + '" class="lb" text-anchor="end">' + x.年 + "</text>");
      g.push('<text x="' + (左 + 16) + '" y="' + 丸(y + 4, 1) + '" class="lb" text-anchor="start">' + esc(x.事) + "</text>");
    });
    return svg(W, H, g.join(""), "年表");
  }

  /* ══ 入口 ═══════════════════════════════════════════════════ */
  function 一行(l0) {
    /* ★ 言い回しの そろえは more.js と 共通で 使う（半径→r= など）。 */
    var l = 文(l0).trim();
    var m0 = /^([^\s:：]+)\s*[:：]?\s*([\s\S]*)$/.exec(l);
    if (m0 && VQG.more && VQG.more.引数を正す) {
      try {
        var 頭 = VQG.more.見出しを正す ? VQG.more.見出しを正す(m0[1]) : m0[1];
        l = (頭 + " " + VQG.more.引数を正す(m0[2] || "")).replace(/\s{2,}/g, " ").trim();
      } catch (e) {}
    }
    var m = /^([^\s:：]+)\s*[:：]?\s*(.*)$/.exec(l);
    if (!m) return null;
    var 種 = m[1], 引 = m[2] || "", ns = 数ら(引);
    /* 構造式の 和名 */
    if (/^(構造式|structure)$/.test(種)) {
      var 和 = { メタン: "CH4", 水: "H2O", アンモニア: "NH3", 二酸化炭素: "CO2",
                 メタノール: "CH3OH", ベンゼン: "ベンゼン" };
      var k0 = 文(m0 ? m0[2] : 引).trim();
      if (和[k0]) 引 = 和[k0];
    }
    var r = 数((/r\s*=\s*(-?[\d.]+)/i.exec(引) || [])[1], null);

    if (/^(相似|similar)$/.test(種)) {
      var 比 = 数((/(?:比|:)\s*1?\s*[:：]?\s*([\d.]+)\s*$/.exec(引) || [])[1], ns[3]);
      return 相似(ns[0], ns[1], ns[2], 比 || 1.5, false);
    }
    if (/^(合同|congruent)$/.test(種)) return 相似(ns[0], ns[1], ns[2], 1, true);
    if (/^(垂線|perpendicular)$/.test(種)) {
      var ps = [], re = /\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/g, mm;
      while ((mm = re.exec(引))) ps.push({ x: 数(mm[1], 0), y: 数(mm[2], 0) });
      return 垂線(ps[0], ps[1], ps[2]);
    }
    if (/^(二等分線|角の二等分線|bisector)$/.test(種)) return 二等分線(ns[0]);
    if (/^(領域|不等式|region)$/.test(種)) return 領域(引);
    if (/^(複素数|複素数平面|complex)$/.test(種)) return 複素数(引);
    if (/^(極座標|polar)$/.test(種)) return 極座標(引);
    if (/^(空間|空間座標|3d|xyz)$/i.test(種)) return 空間(引);
    if (/^(正十二面体|正二十面体|dodecahedron|icosahedron)$/.test(種)) return 正多面体2(種, ns[0]);
    if (/^(構造式|structure)$/.test(種)) return 構造式(引);
    if (/^(ベンゼン|benzene)$/.test(種)) return ベンゼン();
    if (/^(回路|circuit)$/.test(種) && /[|｜]/.test(引)) return 回路2(引);
    if (/^(斜面|slope|incline)$/.test(種)) {
      var 角 = 数((/(?:角|angle)\s*=?\s*(-?[\d.]+)/.exec(引) || [])[1], ns[0]);
      var 質 = 数((/(?:質量|m|kg)\s*=?\s*(-?[\d.]+)/.exec(引) || [])[1], ns[1]);
      return 斜面(角, 質 || 1);
    }
    if (/^(ばね|バネ|spring)$/.test(種)) {
      var k2 = 数((/k\s*=\s*(-?[\d.]+)/i.exec(引) || [])[1], ns[0]);
      var x2 = 数((/x\s*=\s*(-?[\d.]+)/i.exec(引) || [])[1], ns[1]);
      return ばね(k2, x2);
    }
    if (/^(年表|timeline)$/.test(種)) return 年表(引);
    /* 見出し無しの 書き方（r = … は 極座標） */
    if (/^r\s*=/i.test(文(l).trim())) return 極座標(文(l));
    /* 「y > …」だけで 領域と 分かる */
    if (/^y\s*(>=|≧|>|<=|≦|<)/.test(文(l).trim())) return 領域(文(l));
    return null;
  }

  VQG.sci = { 一行: 一行, なぜだめ: function () { return なぜ; },
              相似: 相似, 垂線: 垂線, 二等分線: 二等分線, 領域: 領域, 複素数: 複素数,
              極座標: 極座標, 空間: 空間, 正多面体2: 正多面体2, 構造式: 構造式,
              回路2: 回路2, 斜面: 斜面, ばね: ばね, 年表: 年表 };
})(typeof globalThis !== "undefined" ? globalThis : this);
