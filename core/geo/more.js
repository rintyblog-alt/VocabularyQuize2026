/* ══════════════════════════════════════════════════════════════════════
   core/geo/more.js — 図形と グラフを **どっさり** 増やす

   ★ 訴え（2026-08-17）「図形の種類が 少ない。関数グラフ、平面・立体図形、
     円、相関グラフ、円グラフ、棒グラフ… 書けるものを めっちゃ増やして。
     数学記号・数式・記号は 全部 入れられるように。じゃないと 詰まる」。

   ★ ここでも 決めごとは 同じ（core/geo/draw.js と 揃える）
     ・**値から 座標を 出す。**目分量で 置かない。
     ・**縦と横は 同じ倍率**（形が 崩れない）。グラフの軸だけは 別（そういうもの）。
     ・数が 読めなければ **描かない。**それらしい絵を 作らない。
     ・貼る数字は **計算した値**。渡された文字を そのまま 貼らない。

   ★ 増やしたもの
     グラフ   関数（式を そのまま 計算）／散布図＋回帰直線／円グラフ／
              棒グラフ／折れ線／ヒストグラム／箱ひげ図
     平面     正多角形／扇形／弧／楕円／平行四辺形／台形／ひし形
     立体     立方体／直方体／円柱／円錐／球／角錐／三角柱
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQG = root.VQG || (root.VQG = {});

  function 文(v) { return v === undefined || v === null ? "" : String(v); }
  function 数(v, 既) { var n = parseFloat(v); return isFinite(n) ? n : 既; }
  function 丸(n, k) { var p = Math.pow(10, k === undefined ? 2 : k); return Math.round(n * p) / p; }
  function esc(s) {
    return 文(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  /* ★ **描いたものを 自分で 点検する**（2026-08-17・訴え「描画ミスも
     ずれも 無いように。これ 絶対条件」）。
     出す前に 機械が 見る。1 つでも おかしければ **出さない**。
       ・数字に NaN / Infinity が 混ざっていないか
       ・座標が 枠の 外へ 出ていないか（はみ出し＝ずれ）
       ・中身が 空でないか
     おかしな図を 出すくらいなら 出さないほうが よい。 */
  function 点検(W, H, 中) {
    if (!中 || 中.length < 20) return "中身が 空です";
    if (/NaN|Infinity|undefined|null/.test(中)) return "数が 出せていません";
    var 余 = 2;                     /* 線の 太さぶん */
    var 悪 = null;
    中.replace(/(?:x|y|cx|cy|x1|y1|x2|y2)="(-?[\d.]+)"/g, function (m, v) {
      var n = parseFloat(v);
      if (!isFinite(n)) { 悪 = "座標が 数に なっていません"; return m; }
      var 縦 = /^(?:y|cy|y1|y2)=/.test(m);
      var 端 = 縦 ? H : W;
      if (n < -余 || n > 端 + 余) 悪 = "枠から はみ出しています（" + m + " / 枠 " + 端 + "）";
      return m;
    });
    if (悪) return 悪;
    中.replace(/points="([^"]+)"/g, function (m, ps) {
      ps.split(/\s+/).forEach(function (p) {
        var a = p.split(",");
        var x = parseFloat(a[0]), y = parseFloat(a[1]);
        if (!isFinite(x) || !isFinite(y)) { 悪 = "折れ線の 座標が おかしい"; return; }
        if (x < -余 || x > W + 余 || y < -余 || y > H + 余) 悪 = "折れ線が 枠から はみ出しています";
      });
      return m;
    });
    return 悪;
  }
  function svg(W, H, 中, 名) {
    var 悪 = 点検(W, H, 中);
    if (悪) { 最後のだめ = (名 || "図") + ": " + 悪; return null; }
    return '<svg class="vqg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H
      + '" role="img" aria-label="' + esc(名 || "図") + '">' + 中 + "</svg>";
  }
  var 最後のだめ = "";

  /* ══ 式を 計算する（eval は 使わない）════════════════════════════
     使えるもの: + - * / ^ ( ) と x、sin cos tan asin acos atan
                 sqrt abs log ln exp、pi e
     ★ 文字列を そのまま 実行しない。**自分で 読む。** */
  var 関数表 = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
    asin: Math.asin, acos: Math.acos, atan: Math.atan,
    sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp,
    ln: Math.log, log: function (v) { return Math.log(v) / Math.LN10; },
    floor: Math.floor, ceil: Math.ceil, round: Math.round
  };
  function 切る(s) {
    var 出 = [], i = 0;
    s = 文(s).replace(/\s+/g, "");
    while (i < s.length) {
      var c = s.charAt(i);
      if (/[0-9.]/.test(c)) {
        var j = i; while (j < s.length && /[0-9.]/.test(s.charAt(j))) j++;
        出.push({ t: "数", v: parseFloat(s.slice(i, j)) }); i = j; continue;
      }
      if (/[a-zA-Z]/.test(c)) {
        var k = i; while (k < s.length && /[a-zA-Z]/.test(s.charAt(k))) k++;
        var w = s.slice(i, k);
        if (関数表[w]) 出.push({ t: "関", v: w });
        else if (w === "pi") 出.push({ t: "数", v: Math.PI });
        else if (w === "e") 出.push({ t: "数", v: Math.E });
        else if (w === "x") 出.push({ t: "x" });
        else return null;                       /* 知らない字 → 読めない */
        i = k; continue;
      }
      if ("+-*/^(),".indexOf(c) >= 0) { 出.push({ t: c }); i++; continue; }
      if (c === "|") { 出.push({ t: "関", v: "abs" }); 出.push({ t: "(" }); i++; continue; }
      return null;
    }
    return 出;
  }
  /* かけ算の 省略（2x, 3(x+1), x(x+1)）を 補う */
  function 掛けを補う(ts) {
    var 出 = [];
    for (var i = 0; i < ts.length; i++) {
      var a = ts[i], b = ts[i + 1];
      出.push(a);
      if (!b) continue;
      var 左 = (a.t === "数" || a.t === "x" || a.t === ")");
      var 右 = (b.t === "数" || b.t === "x" || b.t === "(" || b.t === "関");
      if (左 && 右) 出.push({ t: "*" });
    }
    return 出;
  }
  var 強さ = { "+": 1, "-": 1, "*": 2, "/": 2, "^": 3 };
  function 逆ポーランド(ts) {
    var 出 = [], 山 = [];
    for (var i = 0; i < ts.length; i++) {
      var t = ts[i];
      if (t.t === "数" || t.t === "x") { 出.push(t); continue; }
      if (t.t === "関") { 山.push(t); continue; }
      if (t.t === ",") {
        while (山.length && 山[山.length - 1].t !== "(") 出.push(山.pop());
        continue;
      }
      if (強さ[t.t]) {
        /* 単項の マイナス（先頭 か 演算子の あと） */
        if (t.t === "-" && (i === 0 || ["+", "-", "*", "/", "^", "("].indexOf(ts[i - 1].t) >= 0)) {
          出.push({ t: "数", v: 0 });
        }
        while (山.length && 強さ[山[山.length - 1].t]
               && (強さ[山[山.length - 1].t] > 強さ[t.t]
                   || (強さ[山[山.length - 1].t] === 強さ[t.t] && t.t !== "^"))) {
          出.push(山.pop());
        }
        山.push(t); continue;
      }
      if (t.t === "(") { 山.push(t); continue; }
      if (t.t === ")") {
        while (山.length && 山[山.length - 1].t !== "(") 出.push(山.pop());
        if (!山.length) return null;
        山.pop();
        if (山.length && 山[山.length - 1].t === "関") 出.push(山.pop());
        continue;
      }
      return null;
    }
    while (山.length) { var s2 = 山.pop(); if (s2.t === "(") return null; 出.push(s2); }
    return 出;
  }
  function 式にする(式) {
    var ts = 切る(式); if (!ts) return null;
    var rp = 逆ポーランド(掛けを補う(ts)); if (!rp) return null;
    return function (x) {
      var 山 = [];
      for (var i = 0; i < rp.length; i++) {
        var t = rp[i];
        if (t.t === "数") { 山.push(t.v); continue; }
        if (t.t === "x") { 山.push(x); continue; }
        if (t.t === "関") { var a = 山.pop(); 山.push(関数表[t.v](a)); continue; }
        var b2 = 山.pop(), a2 = 山.pop();
        if (a2 === undefined || b2 === undefined) return NaN;
        if (t.t === "+") 山.push(a2 + b2);
        else if (t.t === "-") 山.push(a2 - b2);
        else if (t.t === "*") 山.push(a2 * b2);
        else if (t.t === "/") 山.push(a2 / b2);
        else if (t.t === "^") 山.push(Math.pow(a2, b2));
        else return NaN;
      }
      return 山.length === 1 ? 山[0] : NaN;
    };
  }

  /* 「りんご 30, みかん 20」「A:3, B:5」を 読む */
  function 組を読む(s) {
    var 出 = [];
    文(s).split(/[,、\n]+/).forEach(function (t) {
      t = t.trim(); if (!t) return;
      var m = /^(.+?)\s*[:：=]?\s*(-?[\d.]+)\s*$/.exec(t);
      if (!m) return;
      var 名 = m[1].replace(/[:：=]\s*$/, "").trim();
      var v = 数(m[2], null);
      if (名 && v !== null) 出.push({ 名: 名, 値: v });
    });
    return 出;
  }
  function 数を読む(s) {
    /* ★ 「下=5 3 角=60」のように **名前つきの 数**が 混ざる（2026-08-17・実測）。
       もとは Number("下=5") が NaN で 落ちていたので、
       「平行四辺形 底辺5 斜辺3 角度60」が 描けなかった。= の 右だけ 見る。 */
    return 文(s).split(/[\s,、]+/)
      .map(function (t) { var i = t.lastIndexOf("="); return i >= 0 ? t.slice(i + 1) : t; })
      .map(Number).filter(function (x) { return isFinite(x); });
  }
  function 点を読む(s) {
    var 出 = [], re = /\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/g, m;
    while ((m = re.exec(文(s)))) 出.push({ x: 数(m[1], 0), y: 数(m[2], 0) });
    return 出;
  }

  /* ══ グラフの 下地（軸・目盛り）══════════════════════════════ */
  function 軸つき(o) {
    var W = o.W, H = o.H, 左 = o.左 || 34, 下 = o.下 || 28, 上 = 12, 右 = 12;
    var 小x = o.小x, 大x = o.大x, 小y = o.小y, 大y = o.大y;
    var X = function (v) { return 左 + (v - 小x) / (大x - 小x) * (W - 左 - 右); };
    var Y = function (v) { return H - 下 - (v - 小y) / (大y - 小y) * (H - 下 - 上); };
    var g = [];
    var 刻 = function (幅) {
      var 生 = 幅 / 5, 桁 = Math.pow(10, Math.floor(Math.log(生) / Math.LN10));
      var n = 生 / 桁;
      return (n >= 5 ? 5 : n >= 2 ? 2 : 1) * 桁;
    };
    var dx = 刻(大x - 小x), dy = 刻(大y - 小y);
    for (var vx = Math.ceil(小x / dx) * dx; vx <= 大x + 1e-9; vx += dx) {
      g.push('<line x1="' + 丸(X(vx), 1) + '" y1="' + 上 + '" x2="' + 丸(X(vx), 1) + '" y2="' + (H - 下) + '" class="gd"/>');
      g.push('<text x="' + 丸(X(vx), 1) + '" y="' + (H - 下 + 13) + '" class="lb">' + 丸(vx, 2) + "</text>");
    }
    for (var vy = Math.ceil(小y / dy) * dy; vy <= 大y + 1e-9; vy += dy) {
      g.push('<line x1="' + 左 + '" y1="' + 丸(Y(vy), 1) + '" x2="' + (W - 右) + '" y2="' + 丸(Y(vy), 1) + '" class="gd"/>');
      g.push('<text x="' + (左 - 5) + '" y="' + 丸(Y(vy) + 4, 1) + '" class="lb" text-anchor="end">' + 丸(vy, 2) + "</text>");
    }
    if (小y <= 0 && 大y >= 0) g.push('<line x1="' + 左 + '" y1="' + 丸(Y(0), 1) + '" x2="' + (W - 右) + '" y2="' + 丸(Y(0), 1) + '" class="ax"/>');
    else g.push('<line x1="' + 左 + '" y1="' + (H - 下) + '" x2="' + (W - 右) + '" y2="' + (H - 下) + '" class="ax"/>');
    if (小x <= 0 && 大x >= 0) g.push('<line x1="' + 丸(X(0), 1) + '" y1="' + 上 + '" x2="' + 丸(X(0), 1) + '" y2="' + (H - 下) + '" class="ax"/>');
    else g.push('<line x1="' + 左 + '" y1="' + 上 + '" x2="' + 左 + '" y2="' + (H - 下) + '" class="ax"/>');
    return { g: g, X: X, Y: Y, 左: 左, 下: 下, 上: 上, 右: 右 };
  }

  /* ══ 関数グラフ（式を そのまま 計算）══════════════════════════ */
  function 関数(式ら, o) {
    o = o || {};
    var fs = [];
    (Array.isArray(式ら) ? 式ら : [式ら]).forEach(function (t) {
      var 本 = 文(t).replace(/^\s*y\s*=\s*/i, "");
      var f = 式にする(本);
      if (f) fs.push({ f: f, 名: 文(t) });
    });
    if (!fs.length) return null;
    var W = 300, H = 240;
    var 小x = 数(o.小x, -5), 大x = 数(o.大x, 5);
    /* ★ **上下の 端で 決めない**（2026-08-17・実測で 直した）。
       y = 6/x のように x=0 の そばで 無限に 飛ぶ式では、
       いちばん大きい値で 縦の幅を 決めると 図が 潰れ、
       さらに 飛んだ点が **枠の外へ 出て しまう**（点検が それを 捕まえた）。
       真ん中あたりの 値（5%〜95%）で 決めて、外れた所は **描かない**。 */
    var ys = [];
    fs.forEach(function (F) {
      for (var i = 0; i <= 400; i++) {
        var x = 小x + (大x - 小x) * i / 400, y = F.f(x);
        if (isFinite(y)) ys.push(y);
      }
    });
    if (!ys.length) return null;
    ys.sort(function (a, b) { return a - b; });
    var 割 = function (p) { return ys[Math.min(ys.length - 1, Math.max(0, Math.round((ys.length - 1) * p)))]; };
    var 小y = 割(0.05), 大y = 割(0.95);
    if (大y - 小y < 1e-6) { 小y -= 1; 大y += 1; }
    var 幅 = 大y - 小y;
    小y -= 幅 * 0.12; 大y += 幅 * 0.12;
    /* 0 が 近ければ 入れる（グラフは 0 が 見えるほうが 読みやすい） */
    if (小y > 0 && 小y < 幅) 小y = 0;
    if (大y < 0 && 大y > -幅) 大y = 0;
    var A = 軸つき({ W: W, H: H, 小x: 小x, 大x: 大x, 小y: 小y, 大y: 大y });
    var g = A.g.slice();
    var 色 = ["#2b70ef", "#e5484d", "#2ea043", "#d69600"];
    fs.forEach(function (F, k) {
      var 点 = [];
      for (var i = 0; i <= 300; i++) {
        var x = 小x + (大x - 小x) * i / 300, y = F.f(x);
        /* ★ 枠の外は **1 px も 描かない**（はみ出し＝ずれ の もと）。 */
        if (!isFinite(y) || y < 小y || y > 大y) {
          if (点.length > 1) g.push('<polyline points="' + 点.join(" ") + '" class="fn" style="stroke:' + 色[k % 4] + '"/>');
          点 = []; continue;
        }
        点.push(丸(A.X(x), 1) + "," + 丸(A.Y(y), 1));
      }
      if (点.length > 1) g.push('<polyline points="' + 点.join(" ") + '" class="fn" style="stroke:' + 色[k % 4] + '"/>');
    });
    return svg(W, H, g.join(""), "関数のグラフ");
  }

  /* ══ 散布図（相関）＋ 回帰直線 ═══════════════════════════════ */
  function 散布図(点ら, o) {
    o = o || {};
    if (!点ら || 点ら.length < 2) return null;
    var W = 300, H = 240;
    var xs = 点ら.map(function (p) { return p.x; }), ys = 点ら.map(function (p) { return p.y; });
    var 小x = Math.min.apply(null, xs), 大x = Math.max.apply(null, xs);
    var 小y = Math.min.apply(null, ys), 大y = Math.max.apply(null, ys);
    var mx = (大x - 小x) * 0.1 || 1, my = (大y - 小y) * 0.1 || 1;
    小x -= mx; 大x += mx; 小y -= my; 大y += my;
    var A = 軸つき({ W: W, H: H, 小x: 小x, 大x: 大x, 小y: 小y, 大y: 大y });
    var g = A.g.slice();
    点ら.forEach(function (p) {
      g.push('<circle cx="' + 丸(A.X(p.x), 1) + '" cy="' + 丸(A.Y(p.y), 1) + '" r="3.4" class="pt"/>');
    });
    /* 回帰直線と 相関係数（**計算して 出す**） */
    var n = 点ら.length;
    var sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0;
    点ら.forEach(function (p) { sx += p.x; sy += p.y; sxy += p.x * p.y; sxx += p.x * p.x; syy += p.y * p.y; });
    var 分母 = n * sxx - sx * sx;
    var 説明 = "";
    if (Math.abs(分母) > 1e-9 && o.回帰 !== false) {
      var a = (n * sxy - sx * sy) / 分母, b = (sy - a * sx) / n;
      g.push('<line x1="' + 丸(A.X(小x), 1) + '" y1="' + 丸(A.Y(a * 小x + b), 1)
        + '" x2="' + 丸(A.X(大x), 1) + '" y2="' + 丸(A.Y(a * 大x + b), 1) + '" class="gl"/>');
      var r = (n * sxy - sx * sy) / Math.sqrt(Math.max(1e-12, (n * sxx - sx * sx) * (n * syy - sy * sy)));
      説明 = "y = " + 丸(a, 2) + "x " + (b >= 0 ? "+ " : "- ") + 丸(Math.abs(b), 2)
        + "　r = " + 丸(r, 3);
      g.push('<text x="' + (W - 12) + '" y="20" class="lb" text-anchor="end">' + esc(説明) + "</text>");
    }
    return svg(W, H, g.join(""), "散布図");
  }

  /* ══ 円グラフ ═══════════════════════════════════════════════ */
  var 見本色 = ["#2b70ef", "#e5484d", "#2ea043", "#d69600", "#8a81c2", "#00a3a3", "#c2557a"];
  function 円グラフ(組) {
    if (!組 || !組.length) return null;
    var 合 = 組.reduce(function (n, x) { return n + Math.max(0, x.値); }, 0);
    if (合 <= 0) return null;
    var W = 300, H = 220, cx = 105, cy = 110, R = 84;
    var g = [], 角 = -Math.PI / 2;
    組.forEach(function (x, i) {
      var 割 = Math.max(0, x.値) / 合, d = 割 * Math.PI * 2;
      var x1 = cx + R * Math.cos(角), y1 = cy + R * Math.sin(角);
      var x2 = cx + R * Math.cos(角 + d), y2 = cy + R * Math.sin(角 + d);
      var 大 = d > Math.PI ? 1 : 0;
      if (割 >= 0.9999) {
        g.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="' + 見本色[i % 7] + '" opacity=".85"/>');
      } else {
        g.push('<path d="M' + cx + " " + cy + "L" + 丸(x1, 1) + " " + 丸(y1, 1)
          + "A" + R + " " + R + " 0 " + 大 + " 1 " + 丸(x2, 1) + " " + 丸(y2, 1) + 'Z" fill="'
          + 見本色[i % 7] + '" opacity=".85" stroke="#fff" stroke-width="1.2"/>');
      }
      /* 割合を 中に 出す（10% 以上のときだけ。小さいと 重なる） */
      if (割 >= 0.1) {
        var m2 = 角 + d / 2;
        g.push('<text x="' + 丸(cx + R * 0.62 * Math.cos(m2), 1) + '" y="'
          + 丸(cy + R * 0.62 * Math.sin(m2) + 4, 1) + '" class="lb" style="fill:#fff">'
          + Math.round(割 * 100) + "%</text>");
      }
      角 += d;
    });
    組.slice(0, 7).forEach(function (x, i) {
      var y = 26 + i * 22;
      g.push('<rect x="206" y="' + (y - 9) + '" width="11" height="11" rx="2.5" fill="' + 見本色[i % 7] + '"/>');
      g.push('<text x="223" y="' + y + '" class="lb" text-anchor="start">'
        + esc(x.名) + " " + 丸(x.値, 2) + "</text>");
    });
    return svg(W, H, g.join(""), "円グラフ");
  }

  /* ══ 棒グラフ・折れ線・ヒストグラム ═══════════════════════════ */
  function 棒グラフ(組, o) {
    o = o || {};
    if (!組 || !組.length) return null;
    var W = Math.min(320, Math.max(200, 46 * 組.length + 50)), H = 220;
    var 大 = Math.max.apply(null, 組.map(function (x) { return x.値; }));
    var 小 = Math.min(0, Math.min.apply(null, 組.map(function (x) { return x.値; })));
    if (大 === 小) 大 = 小 + 1;
    var A = 軸つき({ W: W, H: H, 小x: 0, 大x: 組.length, 小y: 小, 大y: 大 * 1.1, 左: 36, 下: 30 });
    var g = A.g.filter(function (t) { return t.indexOf('y="' + (H - 30 + 13)) < 0; });
    var 幅 = (W - A.左 - A.右) / 組.length;
    組.forEach(function (x, i) {
      var x0 = A.左 + 幅 * i + 幅 * 0.16, w = 幅 * 0.68;
      var y0 = A.Y(Math.max(0, x.値)), y1 = A.Y(Math.min(0, x.値));
      g.push('<rect x="' + 丸(x0, 1) + '" y="' + 丸(y0, 1) + '" width="' + 丸(w, 1)
        + '" height="' + 丸(Math.max(1, y1 - y0), 1) + '" rx="3" fill="' + 見本色[i % 7] + '" opacity=".88"/>');
      g.push('<text x="' + 丸(x0 + w / 2, 1) + '" y="' + 丸(y0 - 5, 1) + '" class="lb">' + 丸(x.値, 2) + "</text>");
      g.push('<text x="' + 丸(x0 + w / 2, 1) + '" y="' + (H - 30 + 14) + '" class="lb">' + esc(x.名) + "</text>");
    });
    return svg(W, H, g.join(""), "棒グラフ");
  }
  function 折れ線(組) {
    if (!組 ||組.length < 2) return null;
    var W = Math.min(320, Math.max(220, 44 * 組.length + 50)), H = 220;
    var vs = 組.map(function (x) { return x.値; });
    var 大 = Math.max.apply(null, vs), 小 = Math.min.apply(null, vs);
    if (大 === 小) { 大 += 1; 小 -= 1; }
    var 幅 = (大 - 小) * 0.15;
    var A = 軸つき({ W: W, H: H, 小x: 0, 大x: 組.length - 1, 小y: 小 - 幅, 大y: 大 + 幅, 左: 36, 下: 30 });
    var g = A.g.filter(function (t) { return t.indexOf('y="' + (H - 30 + 13)) < 0; });
    var 点 = 組.map(function (x, i) { return 丸(A.X(i), 1) + "," + 丸(A.Y(x.値), 1); });
    g.push('<polyline points="' + 点.join(" ") + '" class="fn"/>');
    組.forEach(function (x, i) {
      g.push('<circle cx="' + 丸(A.X(i), 1) + '" cy="' + 丸(A.Y(x.値), 1) + '" r="3.2" class="pt"/>');
      g.push('<text x="' + 丸(A.X(i), 1) + '" y="' + (H - 30 + 14) + '" class="lb">' + esc(x.名) + "</text>");
    });
    return svg(W, H, g.join(""), "折れ線グラフ");
  }
  function ヒストグラム(組) { return 棒グラフ(組); }

  /* ══ 箱ひげ図 ═══════════════════════════════════════════════ */
  function 箱ひげ(数ら) {
    if (!数ら || 数ら.length < 4) return null;
    var a = 数ら.slice().sort(function (x, y) { return x - y; });
    var q = function (p) {
      var i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
      return a[lo] + (a[hi] - a[lo]) * (i - lo);
    };
    var 小 = a[0], 大 = a[a.length - 1], q1 = q(0.25), q2 = q(0.5), q3 = q(0.75);
    var W = 300, H = 130, 左 = 20, 右 = 20, y = 58, 高 = 34;
    var X = function (v) { return 左 + (v - 小) / ((大 - 小) || 1) * (W - 左 - 右); };
    var g = [];
    g.push('<line x1="' + 丸(X(小), 1) + '" y1="' + y + '" x2="' + 丸(X(大), 1) + '" y2="' + y + '" class="ln"/>');
    [小, 大].forEach(function (v) {
      g.push('<line x1="' + 丸(X(v), 1) + '" y1="' + (y - 10) + '" x2="' + 丸(X(v), 1) + '" y2="' + (y + 10) + '" class="ln"/>');
    });
    g.push('<rect x="' + 丸(X(q1), 1) + '" y="' + (y - 高 / 2) + '" width="' + 丸(X(q3) - X(q1), 1)
      + '" height="' + 高 + '" class="sh"/>');
    g.push('<line x1="' + 丸(X(q2), 1) + '" y1="' + (y - 高 / 2) + '" x2="' + 丸(X(q2), 1)
      + '" y2="' + (y + 高 / 2) + '" class="tk"/>');
    [[小, "最小"], [q1, "Q1"], [q2, "中央"], [q3, "Q3"], [大, "最大"]].forEach(function (p, i) {
      g.push('<text x="' + 丸(X(p[0]), 1) + '" y="' + (i % 2 ? y + 34 : y - 26) + '" class="lb">'
        + 丸(p[0], 2) + "</text>");
    });
    return svg(W, H, g.join(""), "箱ひげ図");
  }

  /* ══ 平面図形 ═══════════════════════════════════════════════ */
  function 正多角形(n, r, 辺) {
    n = Math.round(n);
    if (!(n >= 3 && n <= 20) || !(r > 0)) return null;
    var W = 200, H = 200, cx = 100, cy = 100, R = 76;
    var 点 = [];
    for (var i = 0; i < n; i++) {
      var a = -Math.PI / 2 + i * Math.PI * 2 / n;
      点.push(丸(cx + R * Math.cos(a), 1) + "," + 丸(cy + R * Math.sin(a), 1));
    }
    var g = ['<polygon points="' + 点.join(" ") + '" class="sh"/>'];
    g.push('<circle cx="' + cx + '" cy="' + cy + '" r="2.4" class="pt"/>');
    g.push('<line x1="' + cx + '" y1="' + cy + '" x2="' + (cx + R) + '" y2="' + cy + '" class="tk"/>');
    /* ★ 数字だけ 置くと **半径か 一辺か 読めない**（2026-08-17）。名前を 付ける。 */
    g.push('<text x="' + (cx + R / 2) + '" y="' + (cy - 6) + '" class="lb">r = ' + 丸(r, 2) + "</text>");
    if (辺 !== null && 辺 !== undefined && isFinite(辺)) {
      var a0 = -Math.PI / 2, a1 = a0 + Math.PI * 2 / n;
      g.push('<text x="' + 丸(cx + R * 0.98 * Math.cos((a0 + a1) / 2), 1)
        + '" y="' + 丸(cy + R * 0.98 * Math.sin((a0 + a1) / 2) - 6, 1)
        + '" class="lb" text-anchor="middle">一辺 ' + 丸(辺, 2) + "</text>");
    }
    g.push('<text x="' + cx + '" y="' + (H - 6) + '" class="lb">正' + n + "角形</text>");
    return svg(W, H, g.join(""), "正多角形");
  }
  function 扇形(r, 角) {
    if (!(r > 0) || !(角 > 0 && 角 <= 360)) return null;
    var W = 200, H = 190, cx = 100, cy = 110, R = 80;
    var a0 = -Math.PI / 2, a1 = a0 + 角 * Math.PI / 180;
    var x1 = cx + R * Math.cos(a0), y1 = cy + R * Math.sin(a0);
    var x2 = cx + R * Math.cos(a1), y2 = cy + R * Math.sin(a1);
    var g = [];
    if (角 >= 360) g.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" class="sh"/>');
    else g.push('<path d="M' + cx + " " + cy + "L" + 丸(x1, 1) + " " + 丸(y1, 1)
      + "A" + R + " " + R + " 0 " + (角 > 180 ? 1 : 0) + " 1 " + 丸(x2, 1) + " " + 丸(y2, 1) + 'Z" class="sh"/>');
    g.push('<text x="' + cx + '" y="' + (cy - 8) + '" class="lb">' + 丸(角, 1) + "°</text>");
    g.push('<text x="' + (cx + R / 2) + '" y="' + (cy + 14) + '" class="lb">r=' + 丸(r, 2) + "</text>");
    /* 弧の長さと 面積も 出す（計算して 出す） */
    var 弧 = 2 * Math.PI * r * (角 / 360), 面 = Math.PI * r * r * (角 / 360);
    g.push('<text x="' + cx + '" y="' + (H - 6) + '" class="lb">弧 ' + 丸(弧, 2) + " ／ 面積 " + 丸(面, 2) + "</text>");
    return svg(W, H, g.join(""), "扇形");
  }
  function 楕円(a, b) {
    if (!(a > 0 && b > 0)) return null;
    var W = 220, H = 180, cx = 110, cy = 88;
    var s = Math.min(88 / a, 62 / b);
    var g = ['<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + 丸(a * s, 1) + '" ry="' + 丸(b * s, 1) + '" class="sh"/>'];
    g.push('<line x1="' + cx + '" y1="' + cy + '" x2="' + 丸(cx + a * s, 1) + '" y2="' + cy + '" class="tk"/>');
    g.push('<line x1="' + cx + '" y1="' + cy + '" x2="' + cx + '" y2="' + 丸(cy - b * s, 1) + '" class="tk"/>');
    g.push('<text x="' + 丸(cx + a * s / 2, 1) + '" y="' + (cy - 6) + '" class="lb">' + 丸(a, 2) + "</text>");
    g.push('<text x="' + (cx - 12) + '" y="' + 丸(cy - b * s / 2, 1) + '" class="lb">' + 丸(b, 2) + "</text>");
    return svg(W, H, g.join(""), "楕円");
  }
  /* 底辺と 高さから（直角なら 左下を 直角に） */
  function 三角形寸法(底, 高, 直) {
    底 = Number(底); 高 = Number(高);
    if (!isFinite(底) || !isFinite(高) || 底 <= 0 || 高 <= 0) return null;
    var 倍 = Math.min(200 / 底, 160 / 高), W = 底 * 倍 + 90, H = 高 * 倍 + 70;
    var x0 = 45, y0 = H - 40, x1 = x0 + 底 * 倍;
    var 頂 = 直 ? x0 : (x0 + x1) / 2, 頂y = y0 - 高 * 倍;
    var g = ['<polygon points="' + 丸(x0, 1) + ',' + 丸(y0, 1) + ' ' + 丸(x1, 1) + ',' + 丸(y0, 1)
      + ' ' + 丸(頂, 1) + ',' + 丸(頂y, 1) + '" class="fg"/>'];
    g.push('<line x1="' + 丸(頂, 1) + '" y1="' + 丸(頂y, 1) + '" x2="' + 丸(頂, 1) + '" y2="'
      + 丸(y0, 1) + '" class="ax" stroke-dasharray="4 3"/>');
    if (直) g.push('<path d="M' + (x0 + 12) + ' ' + 丸(y0, 1) + ' L' + (x0 + 12) + ' ' + 丸(y0 - 12, 1)
      + ' L' + x0 + ' ' + 丸(y0 - 12, 1) + '" class="ax" fill="none"/>');
    g.push('<text x="' + 丸((x0 + x1) / 2, 1) + '" y="' + 丸(y0 + 18, 1)
      + '" class="lb" text-anchor="middle">底辺 ' + 丸(底, 2) + '</text>');
    g.push('<text x="' + 丸(頂 + 6, 1) + '" y="' + 丸((頂y + y0) / 2, 1) + '" class="lb">高さ ' + 丸(高, 2) + '</text>');
    g.push('<text x="' + (W - 8) + '" y="18" class="lb" text-anchor="end">面積 ' + 丸(底 * 高 / 2, 2) + '</text>');
    return svg(W, H, g.join(""), "三角形");
  }
  /* 3 辺から（余弦定理で 形を 決める。**目分量では 置かない**） */
  function 三角形三辺(a, b, c) {
    a = Number(a); b = Number(b); c = Number(c);
    if (![a, b, c].every(function (v) { return isFinite(v) && v > 0; })) return null;
    if (a + b <= c || b + c <= a || c + a <= b) return null;   /* 三角形に ならない */
    /* 辺 c を 底に 置く。A(0,0) B(c,0)、C は 余弦定理から 決める。 */
    var cosA = (b * b + c * c - a * a) / (2 * b * c);
    cosA = Math.max(-1, Math.min(1, cosA));
    var A2 = Math.acos(cosA);
    var Cx = b * Math.cos(A2), Cy = b * Math.sin(A2);
    var 最大 = Math.max(c, Math.abs(Cx), Cy) || 1;
    var 倍 = 190 / 最大;
    var W = Math.max(Math.max(Cx, c) * 倍 + 100, 160), H = Cy * 倍 + 80;
    var px = function (x) { return 50 + x * 倍; }, py = function (y) { return H - 40 - y * 倍; };
    var g = ['<polygon points="' + 丸(px(0), 1) + ',' + 丸(py(0), 1) + ' ' + 丸(px(c), 1) + ',' + 丸(py(0), 1)
      + ' ' + 丸(px(Cx), 1) + ',' + 丸(py(Cy), 1) + '" class="fg"/>'];
    /* 直角かどうかは **辺の 長さから 計算で** 判る（見た目で 決めない） */
    var 直角 = Math.abs(b * b + c * c - a * a) < 1e-6;
    if (直角) g.push('<path d="M' + 丸(px(0) + 12, 1) + ' ' + 丸(py(0), 1) + ' L' + 丸(px(0) + 12, 1)
      + ' ' + 丸(py(0) - 12, 1) + ' L' + 丸(px(0), 1) + ' ' + 丸(py(0) - 12, 1) + '" class="ax" fill="none"/>');
    g.push('<text x="' + 丸(px(c / 2), 1) + '" y="' + 丸(py(0) + 18, 1) + '" class="lb" text-anchor="middle">' + 丸(c, 2) + '</text>');
    g.push('<text x="' + 丸(px(Cx / 2) - 22, 1) + '" y="' + 丸(py(Cy / 2), 1) + '" class="lb">' + 丸(b, 2) + '</text>');
    g.push('<text x="' + 丸(px((Cx + c) / 2) + 6, 1) + '" y="' + 丸(py(Cy / 2), 1) + '" class="lb">' + 丸(a, 2) + '</text>');
    var s3 = (a + b + c) / 2;
    g.push('<text x="' + (W - 8) + '" y="18" class="lb" text-anchor="end">面積 '
      + 丸(Math.sqrt(Math.max(0, s3 * (s3 - a) * (s3 - b) * (s3 - c))), 2) + '</text>');
    return svg(W, H, g.join(""), "三角形");
  }
  function 平行四辺形(底, 斜, 角) {
    if (!(底 > 0 && 斜 > 0)) return null;
    角 = 数(角, 60);
    var t = 角 * Math.PI / 180;
    var dx = 斜 * Math.cos(t), dy = 斜 * Math.sin(t);
    var W = 240, H = 170, 余 = 30;
    var s = Math.min((W - 余 * 2) / (底 + Math.abs(dx)), (H - 余 * 2) / (dy || 1));
    var x0 = 余, y0 = H - 余;
    var 点 = [[x0, y0], [x0 + 底 * s, y0], [x0 + 底 * s + dx * s, y0 - dy * s], [x0 + dx * s, y0 - dy * s]];
    var g = ['<polygon points="' + 点.map(function (p) { return 丸(p[0], 1) + "," + 丸(p[1], 1); }).join(" ") + '" class="sh"/>'];
    g.push('<text x="' + 丸(x0 + 底 * s / 2, 1) + '" y="' + (y0 + 14) + '" class="lb">' + 丸(底, 2) + "</text>");
    g.push('<text x="' + 丸(x0 + dx * s / 2 - 12, 1) + '" y="' + 丸(y0 - dy * s / 2, 1) + '" class="lb">' + 丸(斜, 2) + "</text>");
    g.push('<text x="' + 丸(x0 + 16, 1) + '" y="' + 丸(y0 - 8, 1) + '" class="lb">' + 丸(角, 0) + "°</text>");
    g.push('<text x="' + (W / 2) + '" y="' + (H - 6) + '" class="lb">面積 ' + 丸(底 * dy, 2) + "</text>");
    return svg(W, H, g.join(""), "平行四辺形");
  }
  function 台形(上, 下, 高) {
    if (!(上 > 0 && 下 > 0 && 高 > 0)) return null;
    var W = 240, H = 170, 余 = 30;
    var s = Math.min((W - 余 * 2) / Math.max(上, 下), (H - 余 * 2) / 高);
    var y0 = H - 余, y1 = y0 - 高 * s;
    var 中 = W / 2;
    var 点 = [[中 - 下 * s / 2, y0], [中 + 下 * s / 2, y0], [中 + 上 * s / 2, y1], [中 - 上 * s / 2, y1]];
    var g = ['<polygon points="' + 点.map(function (p) { return 丸(p[0], 1) + "," + 丸(p[1], 1); }).join(" ") + '" class="sh"/>'];
    g.push('<text x="' + 中 + '" y="' + (y0 + 14) + '" class="lb">' + 丸(下, 2) + "</text>");
    g.push('<text x="' + 中 + '" y="' + (y1 - 6) + '" class="lb">' + 丸(上, 2) + "</text>");
    g.push('<text x="' + (中 - 下 * s / 2 - 14) + '" y="' + 丸((y0 + y1) / 2, 1) + '" class="lb">' + 丸(高, 2) + "</text>");
    g.push('<text x="' + 中 + '" y="' + (H - 6) + '" class="lb">面積 ' + 丸((上 + 下) * 高 / 2, 2) + "</text>");
    return svg(W, H, g.join(""), "台形");
  }

  /* ══ 立体（見取り図）═══════════════════════════════════════════
     ★ 斜めに 引く量は **一定**（0.42・45°）。ここを 値ごとに 変えると
       同じ立体が 毎回 ちがう形に 見える。 */
  var 奥 = 0.42, 奥角 = Math.PI / 4;
  function 直方体(w, d, h) {
    if (!(w > 0 && d > 0 && h > 0)) return null;
    var W = 240, H = 200, 余 = 26;
    var ox = d * 奥 * Math.cos(奥角), oy = d * 奥 * Math.sin(奥角);
    var s = Math.min((W - 余 * 2) / (w + ox), (H - 余 * 2) / (h + oy));
    var x0 = 余, y0 = H - 余;
    var P = function (x, y, z) { return [x0 + (x + z * 奥 * Math.cos(奥角)) * s,
                                         y0 - (y + z * 奥 * Math.sin(奥角)) * s]; };
    var a = P(0, 0, 0), b = P(w, 0, 0), c = P(w, h, 0), e = P(0, h, 0);
    var a2 = P(0, 0, d), b2 = P(w, 0, d), c2 = P(w, h, d), e2 = P(0, h, d);
    var 面 = function (ps, cls) {
      return '<polygon points="' + ps.map(function (p) { return 丸(p[0], 1) + "," + 丸(p[1], 1); }).join(" ")
        + '" class="' + (cls || "sh") + '"/>';
    };
    var g = [面([a2, b2, c2, e2], "sh2"), 面([b, b2, c2, c], "sh2"), 面([e, e2, c2, c], "sh2"),
             面([a, b, c, e], "sh")];
    [[a, a2], [b, b2], [c, c2], [e, e2]].forEach(function (l) {
      g.push('<line x1="' + 丸(l[0][0], 1) + '" y1="' + 丸(l[0][1], 1) + '" x2="' + 丸(l[1][0], 1)
        + '" y2="' + 丸(l[1][1], 1) + '" class="ln"/>');
    });
    g.push('<text x="' + 丸((a[0] + b[0]) / 2, 1) + '" y="' + 丸(a[1] + 14, 1) + '" class="lb">' + 丸(w, 2) + "</text>");
    g.push('<text x="' + 丸(a[0] - 12, 1) + '" y="' + 丸((a[1] + e[1]) / 2, 1) + '" class="lb">' + 丸(h, 2) + "</text>");
    g.push('<text x="' + 丸((b[0] + b2[0]) / 2 + 8, 1) + '" y="' + 丸((b[1] + b2[1]) / 2, 1) + '" class="lb">' + 丸(d, 2) + "</text>");
    g.push('<text x="' + (W / 2) + '" y="' + (H - 4) + '" class="lb">体積 ' + 丸(w * d * h, 2)
      + " ／ 表面積 " + 丸(2 * (w * d + d * h + h * w), 2) + "</text>");
    return svg(W, H, g.join(""), "直方体");
  }
  function 円柱(r, h) {
    if (!(r > 0 && h > 0)) return null;
    var W = 200, H = 210, cx = 100, 余 = 30;
    var s = Math.min((W - 余 * 2) / (2 * r), (H - 余 * 2 - 20) / h);
    var R = r * s, Hh = h * s, ry = R * 0.32;
    var y0 = H - 余 - 20, y1 = y0 - Hh;
    var g = [];
    g.push('<path d="M' + 丸(cx - R, 1) + " " + 丸(y1, 1) + "L" + 丸(cx - R, 1) + " " + 丸(y0, 1)
      + "A" + 丸(R, 1) + " " + 丸(ry, 1) + " 0 0 0 " + 丸(cx + R, 1) + " " + 丸(y0, 1)
      + "L" + 丸(cx + R, 1) + " " + 丸(y1, 1) + 'Z" class="sh"/>');
    g.push('<ellipse cx="' + cx + '" cy="' + 丸(y1, 1) + '" rx="' + 丸(R, 1) + '" ry="' + 丸(ry, 1) + '" class="sh"/>');
    g.push('<text x="' + 丸(cx + R / 2, 1) + '" y="' + 丸(y1 - 6, 1) + '" class="lb">r=' + 丸(r, 2) + "</text>");
    g.push('<text x="' + 丸(cx + R + 12, 1) + '" y="' + 丸((y0 + y1) / 2, 1) + '" class="lb">' + 丸(h, 2) + "</text>");
    g.push('<text x="' + cx + '" y="' + (H - 4) + '" class="lb">体積 ' + 丸(Math.PI * r * r * h, 2) + "</text>");
    return svg(W, H, g.join(""), "円柱");
  }
  function 円錐(r, h) {
    if (!(r > 0 && h > 0)) return null;
    var W = 200, H = 210, cx = 100, 余 = 30;
    var s = Math.min((W - 余 * 2) / (2 * r), (H - 余 * 2 - 20) / h);
    var R = r * s, Hh = h * s, ry = R * 0.32;
    var y0 = H - 余 - 20, 頂 = y0 - Hh;
    var g = [];
    g.push('<path d="M' + 丸(cx - R, 1) + " " + 丸(y0, 1) + "L" + cx + " " + 丸(頂, 1)
      + "L" + 丸(cx + R, 1) + " " + 丸(y0, 1) + 'Z" class="sh"/>');
    g.push('<ellipse cx="' + cx + '" cy="' + 丸(y0, 1) + '" rx="' + 丸(R, 1) + '" ry="' + 丸(ry, 1) + '" class="sh"/>');
    g.push('<line x1="' + cx + '" y1="' + 丸(頂, 1) + '" x2="' + cx + '" y2="' + 丸(y0, 1) + '" class="gd"/>');
    g.push('<text x="' + 丸(cx + R / 2, 1) + '" y="' + 丸(y0 + 16, 1) + '" class="lb">r=' + 丸(r, 2) + "</text>");
    g.push('<text x="' + (cx + 8) + '" y="' + 丸((y0 + 頂) / 2, 1) + '" class="lb">' + 丸(h, 2) + "</text>");
    g.push('<text x="' + cx + '" y="' + (H - 4) + '" class="lb">体積 ' + 丸(Math.PI * r * r * h / 3, 2) + "</text>");
    return svg(W, H, g.join(""), "円錐");
  }
  function 球(r) {
    if (!(r > 0)) return null;
    var W = 190, H = 200, cx = 95, cy = 92, R = 72;
    var g = ['<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" class="sh"/>'];
    g.push('<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + R + '" ry="' + 丸(R * 0.3, 1) + '" class="gd" fill="none"/>');
    g.push('<line x1="' + cx + '" y1="' + cy + '" x2="' + (cx + R) + '" y2="' + cy + '" class="tk"/>');
    g.push('<text x="' + (cx + R / 2) + '" y="' + (cy - 6) + '" class="lb">r=' + 丸(r, 2) + "</text>");
    g.push('<text x="' + cx + '" y="' + (H - 4) + '" class="lb">体積 ' + 丸(4 / 3 * Math.PI * r * r * r, 2)
      + " ／ 表面積 " + 丸(4 * Math.PI * r * r, 2) + "</text>");
    return svg(W, H, g.join(""), "球");
  }
  function 角錐(底, h, n) {
    n = Math.round(数(n, 4));
    if (!(底 > 0 && h > 0) || n < 3) return null;
    var W = 210, H = 200, cx = 105, 余 = 28;
    var s = Math.min((W - 余 * 2) / (底 * 1.3), (H - 余 * 2 - 16) / h);
    var R = 底 * s / 2, ry = R * 0.34, y0 = H - 余 - 16, 頂 = y0 - h * s;
    var g = ['<ellipse cx="' + cx + '" cy="' + 丸(y0, 1) + '" rx="' + 丸(R, 1) + '" ry="' + 丸(ry, 1) + '" class="gd" fill="none"/>'];
    var 点 = [];
    for (var i = 0; i < n; i++) {
      var a = Math.PI / 2 + i * Math.PI * 2 / n;
      点.push([cx + R * Math.cos(a), y0 + ry * Math.sin(a)]);
    }
    g.push('<polygon points="' + 点.map(function (p) { return 丸(p[0], 1) + "," + 丸(p[1], 1); }).join(" ") + '" class="sh"/>');
    点.forEach(function (p) {
      g.push('<line x1="' + 丸(p[0], 1) + '" y1="' + 丸(p[1], 1) + '" x2="' + cx + '" y2="' + 丸(頂, 1) + '" class="ln"/>');
    });
    g.push('<text x="' + (cx + 8) + '" y="' + 丸((y0 + 頂) / 2, 1) + '" class="lb">' + 丸(h, 2) + "</text>");
    g.push('<text x="' + cx + '" y="' + (H - 4) + '" class="lb">' + n + "角錐</text>");
    return svg(W, H, g.join(""), "角錐");
  }


  /* ══ 第 2 弾（2026-08-17）══════════════════════════════════════
     ベン図／単位円／樹形図／数直線／円と接線／ベクトル／
     正四面体・正八面体／展開図／回路／力の図 */

  function ベン図(組) {
    var 名 = (組 || []).map(function (x) { return x.名; });
    if (名.length < 2) return null;
    var 三 = 名.length >= 3;
    var W = 260, H = 三 ? 220 : 180, R = 三 ? 58 : 62;
    var g = [];
    var 円ら = 三
      ? [{ x: 100, y: 92 }, { x: 160, y: 92 }, { x: 130, y: 146 }]
      : [{ x: 102, y: 90 }, { x: 158, y: 90 }];
    円ら.forEach(function (c, i) {
      g.push('<circle cx="' + c.x + '" cy="' + c.y + '" r="' + R + '" fill="' + 見本色[i % 7]
        + '" opacity=".26" stroke="currentColor" stroke-width="1.4"/>');
    });
    var 置 = 三 ? [[62, 60], [198, 60], [130, 208]] : [[58, 46], [202, 46]];
    名.slice(0, 3).forEach(function (n, i) {
      g.push('<text x="' + 置[i][0] + '" y="' + 置[i][1] + '" class="lb">' + esc(n) + "</text>");
    });
    (組 || []).slice(0, 3).forEach(function (x, i) {
      if (x.値 === undefined || x.値 === null) return;
      var c = 円ら[i];
      var dx = 三 ? [-26, 26, 0][i] : [-24, 24][i];
      var dy = 三 ? [-14, -14, 22][i] : [0, 0][i];
      g.push('<text x="' + (c.x + dx) + '" y="' + (c.y + dy) + '" class="lb">' + 丸(x.値, 2) + "</text>");
    });
    return svg(W, H, g.join(""), "ベン図");
  }

  function 単位円(角) {
    角 = 数(角, null);
    if (角 === null) return null;
    var W = 240, H = 240, cx = 120, cy = 120, R = 88;
    var t = 角 * Math.PI / 180;
    var px = cx + R * Math.cos(t), py = cy - R * Math.sin(t);
    var g = [];
    g.push('<line x1="14" y1="' + cy + '" x2="' + (W - 14) + '" y2="' + cy + '" class="ax"/>');
    g.push('<line x1="' + cx + '" y1="14" x2="' + cx + '" y2="' + (H - 14) + '" class="ax"/>');
    g.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" class="sh" fill="none"/>');
    g.push('<line x1="' + cx + '" y1="' + cy + '" x2="' + 丸(px, 1) + '" y2="' + 丸(py, 1) + '" class="gl"/>');
    g.push('<line x1="' + 丸(px, 1) + '" y1="' + 丸(py, 1) + '" x2="' + 丸(px, 1) + '" y2="' + cy + '" class="tk"/>');
    g.push('<line x1="' + cx + '" y1="' + 丸(py, 1) + '" x2="' + 丸(px, 1) + '" y2="' + 丸(py, 1) + '" class="gd"/>');
    g.push('<circle cx="' + 丸(px, 1) + '" cy="' + 丸(py, 1) + '" r="3.2" class="pt"/>');
    /* 値は **計算して** 出す */
    g.push('<text x="' + cx + '" y="' + (H - 4) + '" class="lb">' + 丸(角, 1)
      + "°　cos=" + 丸(Math.cos(t), 3) + "　sin=" + 丸(Math.sin(t), 3) + "</text>");
    return svg(W, H, g.join(""), "単位円");
  }

  function 樹形図(段ら) {
    /* 「表,裏 / 表,裏」→ 2 段。各段の 枝の 名前 */
    var 段 = 文(段ら).split(/\s*[\/／]\s*/).map(function (t) {
      return t.split(/[,、\s]+/).filter(Boolean);
    }).filter(function (a) { return a.length; });
    if (!段.length || 段.length > 4) return null;
    var 葉 = 段.reduce(function (n, a) { return n * a.length; }, 1);
    if (葉 > 24) return null;
    var W = 60 + 段.length * 78, H = Math.min(280, 26 + 葉 * 22);
    var g = [];
    function 引く(x, y0, y1, 深) {
      if (深 >= 段.length) return;
      var a = 段[深], 幅 = (y1 - y0) / a.length;
      a.forEach(function (n, i) {
        var cy = y0 + 幅 * i + 幅 / 2;
        g.push('<line x1="' + x + '" y1="' + 丸((y0 + y1) / 2, 1) + '" x2="' + (x + 52)
          + '" y2="' + 丸(cy, 1) + '" class="ln"/>');
        g.push('<text x="' + (x + 62) + '" y="' + 丸(cy + 4, 1) + '" class="lb" text-anchor="start">'
          + esc(n) + "</text>");
        引く(x + 78, y0 + 幅 * i, y0 + 幅 * (i + 1), 深 + 1);
      });
    }
    g.push('<circle cx="18" cy="' + 丸(H / 2, 1) + '" r="3" class="pt"/>');
    引く(18, 8, H - 8, 0);
    g.push('<text x="' + (W - 6) + '" y="14" class="lb" text-anchor="end">全 ' + 葉 + " 通り</text>");
    return svg(W, H, g.join(""), "樹形図");
  }

  function 数直線(式) {
    var m = /(-?[\d.]+)\s*(<=|≦|<|≤)?\s*[a-zA-Zｘx]\s*(<=|≦|<|≤)?\s*(-?[\d.]+)/.exec(文(式));
    var 左 = null, 右 = null, 左閉 = false, 右閉 = false;
    if (m) {
      左 = 数(m[1], null); 右 = 数(m[4], null);
      左閉 = /=|≦|≤/.test(m[2] || ""); 右閉 = /=|≦|≤/.test(m[3] || "");
    } else {
      var m2 = /[a-zA-Zｘx]\s*(>=|≧|>|≥|<=|≦|<|≤)\s*(-?[\d.]+)/.exec(文(式));
      if (!m2) return null;
      var v = 数(m2[2], 0), 上 = /</.test(m2[1]) || /≦|≤/.test(m2[1]);
      if (上) { 右 = v; 右閉 = /=|≦|≤/.test(m2[1]); }
      else { 左 = v; 左閉 = /=|≧|≥/.test(m2[1]); }
    }
    var 下 = Math.floor(Math.min(左 === null ? 右 - 3 : 左, 右 === null ? 左 - 3 : 右)) - 1;
    var 上端 = Math.ceil(Math.max(左 === null ? 右 + 3 : 左, 右 === null ? 左 + 3 : 右)) + 1;
    if (!isFinite(下) || !isFinite(上端) || 上端 - 下 > 40) return null;
    var W = 300, H = 60, 端 = 18;
    var X = function (v2) { return 端 + (v2 - 下) / (上端 - 下) * (W - 端 * 2); };
    var g = ['<line x1="6" y1="34" x2="' + (W - 6) + '" y2="34" class="ax"/>'];
    for (var v3 = 下; v3 <= 上端; v3++) {
      g.push('<line x1="' + 丸(X(v3), 1) + '" y1="30" x2="' + 丸(X(v3), 1) + '" y2="38" class="tk"/>');
      g.push('<text x="' + 丸(X(v3), 1) + '" y="52" class="lb">' + v3 + "</text>");
    }
    var a = 左 === null ? 下 : 左, b = 右 === null ? 上端 : 右;
    g.push('<line x1="' + 丸(X(a), 1) + '" y1="22" x2="' + 丸(X(b), 1) + '" y2="22" class="rg"/>');
    if (左 !== null) g.push('<circle cx="' + 丸(X(左), 1) + '" cy="22" r="4.5" class="' + (左閉 ? "pt" : "pto") + '"/>');
    if (右 !== null) g.push('<circle cx="' + 丸(X(右), 1) + '" cy="22" r="4.5" class="' + (右閉 ? "pt" : "pto") + '"/>');
    return svg(W, H, g.join(""), "数直線");
  }

  function 円と接線(r, d) {
    if (!(r > 0 && d > r)) return null;
    var W = 280, H = 190, s = Math.min(110 / d, 70 / r);
    var cx = 70, cy = 95, R = r * s, D = d * s;
    var px = cx + D, py = cy;
    /* 接点は 円と 直角に なる位置（計算で 出す） */
    var 接長 = Math.sqrt(d * d - r * r) * s;
    var a = Math.acos(R / D);
    var tx = cx + R * Math.cos(a), ty = cy - R * Math.sin(a);
    var tx2 = cx + R * Math.cos(a), ty2 = cy + R * Math.sin(a);
    var g = ['<circle cx="' + cx + '" cy="' + cy + '" r="' + 丸(R, 1) + '" class="sh" fill="none"/>'];
    g.push('<circle cx="' + cx + '" cy="' + cy + '" r="2.4" class="pt"/>');
    g.push('<circle cx="' + 丸(px, 1) + '" cy="' + py + '" r="2.8" class="pt"/>');
    [[tx, ty], [tx2, ty2]].forEach(function (t) {
      g.push('<line x1="' + 丸(px, 1) + '" y1="' + py + '" x2="' + 丸(t[0], 1) + '" y2="' + 丸(t[1], 1) + '" class="ln"/>');
      g.push('<line x1="' + cx + '" y1="' + cy + '" x2="' + 丸(t[0], 1) + '" y2="' + 丸(t[1], 1) + '" class="gd"/>');
      g.push('<circle cx="' + 丸(t[0], 1) + '" cy="' + 丸(t[1], 1) + '" r="2.6" class="pt"/>');
    });
    g.push('<text x="' + 丸((cx + px) / 2, 1) + '" y="' + (cy + 14) + '" class="lb">' + 丸(d, 2) + "</text>");
    g.push('<text x="' + (cx - 6) + '" y="' + (cy - R / 2) + '" class="lb">' + 丸(r, 2) + "</text>");
    g.push('<text x="' + (W / 2) + '" y="' + (H - 6) + '" class="lb">接線の長さ ' + 丸(接長 / s, 3) + "</text>");
    return svg(W, H, g.join(""), "円と接線");
  }

  function ベクトル(点ら, 名ら) {
    if (!点ら || !点ら.length) return null;
    var 大 = 1;
    点ら.forEach(function (p) { 大 = Math.max(大, Math.abs(p.x), Math.abs(p.y)); });
    var W = 240, H = 220, cx = 120, cy = 110, s = Math.min(92 / 大, 88 / 大);
    var g = ['<line x1="10" y1="' + cy + '" x2="' + (W - 10) + '" y2="' + cy + '" class="ax"/>',
             '<line x1="' + cx + '" y1="10" x2="' + cx + '" y2="' + (H - 24) + '" class="ax"/>'];
    点ら.slice(0, 4).forEach(function (p, i) {
      var x2 = cx + p.x * s, y2 = cy - p.y * s;
      var 色2 = 見本色[i % 7];
      g.push('<line x1="' + cx + '" y1="' + cy + '" x2="' + 丸(x2, 1) + '" y2="' + 丸(y2, 1)
        + '" stroke="' + 色2 + '" stroke-width="2.4"/>');
      /* 矢じり（向きから 計算） */
      var a = Math.atan2(y2 - cy, x2 - cx), L = 9;
      g.push('<polygon points="' + [
        丸(x2, 1) + "," + 丸(y2, 1),
        丸(x2 - L * Math.cos(a - 0.4), 1) + "," + 丸(y2 - L * Math.sin(a - 0.4), 1),
        丸(x2 - L * Math.cos(a + 0.4), 1) + "," + 丸(y2 - L * Math.sin(a + 0.4), 1)
      ].join(" ") + '" fill="' + 色2 + '"/>');
      var 長 = Math.sqrt(p.x * p.x + p.y * p.y);
      g.push('<text x="' + 丸(x2 + (p.x >= 0 ? 12 : -12), 1) + '" y="' + 丸(y2 - 6, 1)
        + '" class="lb">' + esc((名ら && 名ら[i]) || "") + "(" + p.x + "," + p.y + ") |" + 丸(長, 2) + "|</text>");
    });
    return svg(W, H, g.join(""), "ベクトル");
  }

  function 正多面体(種, a) {
    if (!(a > 0)) return null;
    var W = 200, H = 200, cx = 100, cy = 96, R = 70;
    var g = [];
    if (/四面/.test(種)) {
      var p = [[cx, cy - R], [cx - R * 0.87, cy + R * 0.5], [cx + R * 0.87, cy + R * 0.5], [cx, cy + R * 0.18]];
      g.push('<polygon points="' + [p[0], p[1], p[2]].map(function (q) { return q[0] + "," + q[1]; }).join(" ") + '" class="sh"/>');
      [[0, 3], [1, 3], [2, 3]].forEach(function (e) {
        g.push('<line x1="' + p[e[0]][0] + '" y1="' + p[e[0]][1] + '" x2="' + p[e[1]][0]
          + '" y2="' + p[e[1]][1] + '" class="gd"/>');
      });
      g.push('<text x="' + cx + '" y="' + (H - 4) + '" class="lb">正四面体 一辺 ' + 丸(a, 2)
        + " ／ 体積 " + 丸(a * a * a / (6 * Math.SQRT2), 3) + "</text>");
    } else {
      var q2 = [[cx, cy - R], [cx - R * 0.8, cy], [cx, cy + R], [cx + R * 0.8, cy],
                [cx - R * 0.3, cy - R * 0.28], [cx + R * 0.3, cy + R * 0.28]];
      g.push('<polygon points="' + [q2[0], q2[1], q2[2], q2[3]].map(function (q3) { return q3[0] + "," + q3[1]; }).join(" ") + '" class="sh"/>');
      [[0, 4], [1, 4], [2, 5], [3, 5], [4, 5]].forEach(function (e) {
        g.push('<line x1="' + q2[e[0]][0] + '" y1="' + q2[e[0]][1] + '" x2="' + q2[e[1]][0]
          + '" y2="' + q2[e[1]][1] + '" class="gd"/>');
      });
      g.push('<text x="' + cx + '" y="' + (H - 4) + '" class="lb">正八面体 一辺 ' + 丸(a, 2)
        + " ／ 体積 " + 丸(Math.SQRT2 / 3 * a * a * a, 3) + "</text>");
    }
    return svg(W, H, g.join(""), "正多面体");
  }

  function 展開図(種, ns) {
    var W = 280, H = 210, g = [];
    if (/直方体|立方体/.test(種)) {
      var w = ns[0], d = ns[1] !== undefined ? ns[1] : ns[0], h = ns[2] !== undefined ? ns[2] : ns[0];
      if (!(w > 0 && d > 0 && h > 0)) return null;
      var s = Math.min((W - 30) / (2 * (w + d)), (H - 40) / (2 * d + h));
      var x0 = 15, y0 = 15;
      var 箱 = function (x, y, ww, hh) {
        return '<rect x="' + 丸(x, 1) + '" y="' + 丸(y, 1) + '" width="' + 丸(ww, 1)
          + '" height="' + 丸(hh, 1) + '" class="sh"/>';
      };
      g.push(箱(x0 + d * s, y0, w * s, d * s));
      g.push(箱(x0, y0 + d * s, d * s, h * s));
      g.push(箱(x0 + d * s, y0 + d * s, w * s, h * s));
      g.push(箱(x0 + (d + w) * s, y0 + d * s, d * s, h * s));
      g.push(箱(x0 + (2 * d + w) * s, y0 + d * s, w * s, h * s));
      g.push(箱(x0 + d * s, y0 + (d + h) * s, w * s, d * s));
      g.push('<text x="' + (W / 2) + '" y="' + (H - 6) + '" class="lb">表面積 '
        + 丸(2 * (w * d + d * h + h * w), 2) + "</text>");
      return svg(W, H, g.join(""), "展開図");
    }
    if (/円柱/.test(種)) {
      var r = ns[0], h2 = ns[1];
      if (!(r > 0 && h2 > 0)) return null;
      var 周 = 2 * Math.PI * r;
      var s2 = Math.min((W - 40) / 周, (H - 60) / (h2 + 2 * r));
      var bx = 20, by = 20 + r * s2 * 2;
      g.push('<rect x="' + bx + '" y="' + 丸(by, 1) + '" width="' + 丸(周 * s2, 1)
        + '" height="' + 丸(h2 * s2, 1) + '" class="sh"/>');
      g.push('<circle cx="' + 丸(bx + r * s2, 1) + '" cy="' + 丸(by - r * s2, 1) + '" r="' + 丸(r * s2, 1) + '" class="sh"/>');
      g.push('<circle cx="' + 丸(bx + r * s2, 1) + '" cy="' + 丸(by + h2 * s2 + r * s2, 1) + '" r="' + 丸(r * s2, 1) + '" class="sh"/>');
      g.push('<text x="' + 丸(bx + 周 * s2 / 2, 1) + '" y="' + 丸(by + h2 * s2 / 2, 1) + '" class="lb">周 ' + 丸(周, 2) + "</text>");
      g.push('<text x="' + (W / 2) + '" y="' + (H - 6) + '" class="lb">表面積 '
        + 丸(2 * Math.PI * r * (r + h2), 2) + "</text>");
      return svg(W, H, g.join(""), "展開図");
    }
    return null;
  }

  function 回路(並び) {
    var 部 = 文(並び).split(/\s*[-–—>]+\s*/).map(function (t) { return t.trim(); }).filter(Boolean);
    if (!部.length) return null;
    var W = Math.min(320, 70 + 部.length * 62), H = 130;
    var y = 46, x0 = 24, 幅 = (W - x0 * 2) / 部.length;
    var g = ['<rect x="' + x0 + '" y="' + y + '" width="' + 丸(W - x0 * 2, 1) + '" height="46" fill="none" stroke="currentColor" stroke-width="1.6"/>'];
    部.forEach(function (n, i) {
      var cx = x0 + 幅 * i + 幅 / 2;
      g.push('<rect x="' + 丸(cx - 15, 1) + '" y="' + (y - 9) + '" width="30" height="18" rx="3" fill="var(--vq-surface,#fff)" stroke="currentColor" stroke-width="1.4"/>');
      if (/電池|battery/.test(n)) {
        g.push('<line x1="' + 丸(cx - 5, 1) + '" y1="' + (y - 7) + '" x2="' + 丸(cx - 5, 1) + '" y2="' + (y + 7) + '" class="ln"/>');
        g.push('<line x1="' + 丸(cx + 5, 1) + '" y1="' + (y - 3) + '" x2="' + 丸(cx + 5, 1) + '" y2="' + (y + 3) + '" class="ln"/>');
      } else if (/電球|lamp/.test(n)) {
        g.push('<circle cx="' + 丸(cx, 1) + '" cy="' + y + '" r="7" fill="none" stroke="currentColor" stroke-width="1.4"/>');
      } else if (/スイッチ|switch/.test(n)) {
        g.push('<line x1="' + 丸(cx - 8, 1) + '" y1="' + y + '" x2="' + 丸(cx + 6, 1) + '" y2="' + (y - 8) + '" class="ln"/>');
      } else {
        g.push('<rect x="' + 丸(cx - 10, 1) + '" y="' + (y - 5) + '" width="20" height="10" fill="none" stroke="currentColor" stroke-width="1.4"/>');
      }
      g.push('<text x="' + 丸(cx, 1) + '" y="' + (y + 30) + '" class="lb">' + esc(n) + "</text>");
    });
    return svg(W, H, g.join(""), "回路");
  }

  function 力の図(組) {
    if (!組 || !組.length) return null;
    var W = 240, H = 220, cx = 120, cy = 112;
    var 大 = 1;
    組.forEach(function (f) { 大 = Math.max(大, Math.abs(f.値)); });
    var s = 68 / 大;
    var 向き = { 右: [1, 0], 左: [-1, 0], 上: [0, 1], 下: [0, -1] };
    var g = ['<rect x="' + (cx - 24) + '" y="' + (cy - 18) + '" width="48" height="36" rx="4" class="sh"/>'];
    組.slice(0, 6).forEach(function (f, i) {
      var v = 向き[f.名] || 向き[String(f.名).slice(-1)] || [1, 0];
      var x2 = cx + v[0] * (24 + Math.abs(f.値) * s), y2 = cy - v[1] * (18 + Math.abs(f.値) * s);
      var x1 = cx + v[0] * 24, y1 = cy - v[1] * 18;
      var 色2 = 見本色[i % 7];
      g.push('<line x1="' + 丸(x1, 1) + '" y1="' + 丸(y1, 1) + '" x2="' + 丸(x2, 1) + '" y2="'
        + 丸(y2, 1) + '" stroke="' + 色2 + '" stroke-width="2.6"/>');
      var a = Math.atan2(y2 - y1, x2 - x1), L = 9;
      g.push('<polygon points="' + [
        丸(x2, 1) + "," + 丸(y2, 1),
        丸(x2 - L * Math.cos(a - 0.4), 1) + "," + 丸(y2 - L * Math.sin(a - 0.4), 1),
        丸(x2 - L * Math.cos(a + 0.4), 1) + "," + 丸(y2 - L * Math.sin(a + 0.4), 1)
      ].join(" ") + '" fill="' + 色2 + '"/>');
      g.push('<text x="' + 丸(x2 + v[0] * 10, 1) + '" y="' + 丸(y2 - v[1] * 8 + 4, 1)
        + '" class="lb">' + 丸(f.値, 2) + "N</text>");
    });
    return svg(W, H, g.join(""), "力の図");
  }

  /* ══ 言い回しを そろえる（2026-08-17・実測で 足した）══════════════
     ★ 30 通りの 自然な 書き方を 試したら **18 通りが 落ちた**。
       落ちていたのは どれも「人が ふつうに 書く形」だった:
         円: 半径3 ／ 円柱: 半径2 高さ5 ／ 球 半径3 ／ 立方体 一辺4
         扇形: 半径3 中心角60 ／ 直角三角形: 3,4,5 ／ 正三角形: 4
         斜面 30度 2kg ／ 構造式 メタン ／ 円グラフ りんご50%
       **AI に 書き方を 覚えさせる**より、**こちらが 受ける**ほうが 確実。
     ★ ここでやるのは 3 つだけ。
       ① 和名を 決まった名前へ（直角三角形 → 三角形 直角）
       ② 日本語の 項目名を 記号へ（半径 → r=、高さ → h=）
       ③ 単位を 落とす（cm・度・N/m・% など。数だけ 残す） */
  var 言い換え表 = [
    [/^直角三角形/, "三角形"], [/^正三角形/, "正多角形 3"], [/^正方形/, "正多角形 4"],
    [/^正(五|六|七|八|九|十|十二)角形/, function (m, n) {
      var 表 = { 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十二: 12 };
      return "正多角形 " + (表[n] || 6);
    }],
    [/^ひし形/, "平行四辺形"], [/^長方形|^四角形/, "長方形"],
    [/^円グラフ/, "円グラフ"], [/^帯グラフ/, "棒グラフ"],
    [/^複素数平面/, "複素数"], [/^空間座標/, "空間"], [/^座標平面/, "座標"]
  ];
  var 名の言い換え = { メタン: "CH4", 水: "H2O", アンモニア: "NH3",
    二酸化炭素: "CO2", メタノール: "CH3OH", エタノール: "C2H5OH" };
  function 引数を正す(t) {
    var s2 = 文(t);
    /* 全角 → 半角 */
    s2 = s2.replace(/[（]/g, "(").replace(/[）]/g, ")").replace(/[，、]/g, ",")
           .replace(/[：]/g, ":").replace(/[＝]/g, "=")
           .replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
    /* 日本語の 項目名 → 記号。**「=」が 無くても 受ける** */
    s2 = s2.replace(/半径\s*=?\s*/g, "r=").replace(/直径\s*=?\s*/g, "d2=")
           .replace(/(高さ|高|たかさ)\s*=?\s*/g, "h=")
           /* ★ 「角」だけを 置き換えると **正六角形の 角まで 壊す**
                （正六角=形 になった。2026-08-17・実測）。 */
           .replace(/(中心角|角度|中心の角|∠)\s*=?\s*/g, "角=")
           /* ★ 一辺は **落とさず 印として 残す**（2026-08-17）。
              落とすと 正多角形で「4」が 半径なのか 一辺なのか 分からなくなり、
              半径のつもりで 描いて **大きさが 違う図**に なる。 */
           .replace(/(一辺|1辺|辺の長さ)\s*=?\s*/g, "辺=")
           .replace(/(底辺|下底)\s*=?\s*/g, "下=").replace(/上底\s*=?\s*/g, "上=")
           .replace(/(斜辺|となりの辺)\s*=?\s*/g, "")
           .replace(/質量\s*=?\s*/g, "質量=")
           .replace(/ばね定数\s*=?\s*/g, "k=").replace(/(伸び|のび)\s*=?\s*/g, "x=")
           .replace(/θ\s*=?\s*/g, "角=");
    /* 「正六角形」→ 6（見出しでなく **引数の中**にも 出る） */
    s2 = s2.replace(/正(三|四|五|六|七|八|九|十|十一|十二|\d+)角形/g, function (m, n) {
      var 表 = { 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12 };
      return 表[n] !== undefined ? String(表[n]) : String(parseInt(n, 10) || 6);
    });
    /* 単位を 落とす（数だけ 残す）。
       ★ ローマ字の 単位は **うしろに 字が 続かないとき だけ** 落とす。
         そうしないと「3 max」の m まで 食う。 */
    s2 = s2.replace(/([\d.])\s*(cm2|cm3|m2|m3|cm|mm|km|kg|N\/m|Hz|mol|m|g|N|J|W|V|A)(?![A-Za-z0-9])/g, "$1")
           .replace(/([\d.])\s*(度|°|％|%|個|点|人|円|年|才|歳|Ω|℃)/g, "$1");
    /* 直径 → 半径 */
    s2 = s2.replace(/d2=\s*(-?[\d.]+)/g, function (m, v) { return "r=" + (parseFloat(v) / 2); });
    return s2.replace(/\s{2,}/g, " ").trim();
  }
  function 見出しを正す(種) {
    var t = 文(種);
    for (var i = 0; i < 言い換え表.length; i++) {
      if (言い換え表[i][0].test(t)) return t.replace(言い換え表[i][0], 言い換え表[i][1]);
    }
    return t;
  }

  /* ══ 入口（1 行 → 図）═══════════════════════════════════════════ */
  function 一行(l0) {
    var l = 文(l0).trim();
    /* 見出しと 引数を そろえてから 読む */
    var mm0 = /^([^\s:：]+)\s*[:：]?\s*([\s\S]*)$/.exec(l);
    if (mm0) {
      var 頭 = 見出しを正す(mm0[1]);
      var 尾 = 引数を正す(mm0[2] || "");
      /* 「正三角形 4」→「正多角形 3 4」のように 見出しが 数を 持つことがある */
      l = (頭 + " " + 尾).replace(/\s{2,}/g, " ").trim();
      /* ★ 「正三角形: 4」「正六角形 4」の 4 は **一辺**のこと（2026-08-17）。
         半径として 描くと 大きさが 変わってしまう。名前で n が 決まっている
         ときだけ、うしろの 裸の数を 一辺として 読む。 */
      if (/^正多角形\s+\d+$/.test(頭) && /^-?[\d.]+$/.test(尾.trim())) {
        l = 頭 + " 辺=" + 尾.trim();
      }
      if (名の言い換え[(mm0[2] || "").trim()]) l = 頭 + " " + 名の言い換え[(mm0[2] || "").trim()];
    }
    return 読み取る(l, l0);
  }
  function 読み取る(l, l0) {
    var m = /^([^\s:：]+)\s*[:：]?\s*(.*)$/.exec(文(l).trim());
    if (!m) return null;
    var 種 = m[1], 引 = m[2] || "";
    var ns = 数を読む(引);
    var r = 数((/r\s*=\s*(-?[\d.]+)/i.exec(引) || [])[1], null);
    var h = 数((/(?:h|高さ|高)\s*=?\s*(-?[\d.]+)/i.exec(引) || [])[1], null);

    if (/^(関数|グラフ|function|graph)$/.test(種)) return 関数(引.split(/[,、]\s*(?=y\s*=)/));
    if (/^(散布図|相関|scatter)$/.test(種)) {
      var 点 = 点を読む(引);
      if (点.length < 2) {
        var xs = (/x\s*[:：]\s*([^y]+)/i.exec(引) || [])[1];
        var ys = (/y\s*[:：]\s*(.+)$/i.exec(引) || [])[1];
        if (xs && ys) {
          var X2 = 数を読む(xs), Y2 = 数を読む(ys);
          点 = X2.map(function (v, i) { return { x: v, y: Y2[i] }; })
                 .filter(function (p) { return isFinite(p.y); });
        }
      }
      return 散布図(点, {});
    }
    if (/^(円グラフ|pie)$/.test(種)) return 円グラフ(組を読む(引));
    if (/^(棒グラフ|bar)$/.test(種)) return 棒グラフ(組を読む(引));
    if (/^(折れ線|折れ線グラフ|line)$/.test(種)) return 折れ線(組を読む(引));
    if (/^(ヒストグラム|histogram)$/.test(種)) return ヒストグラム(組を読む(引));
    if (/^(箱ひげ|箱ひげ図|boxplot)$/.test(種)) return 箱ひげ(ns);
    if (/^(正多角形|regular)$/.test(種)) {
      var 辺4 = 数((/辺\s*=\s*(-?[\d.]+)/.exec(引) || [])[1], null);
      var n4 = ns[0];
      if (辺4 !== null && n4 >= 3) {
        /* 一辺 a の 正 n 角形の 外接円: R = a / (2 sin(π/n))。目分量では 出さない。 */
        return 正多角形(n4, 辺4 / (2 * Math.sin(Math.PI / n4)), 辺4);
      }
      return 正多角形(n4, r !== null ? r : (ns[1] || 1), null);
    }
    if (/^(扇形|おうぎ形|sector)$/.test(種)) {
      var 角 = 数((/(?:角|angle)\s*=?\s*(-?[\d.]+)/.exec(引) || [])[1], ns[1]);
      return 扇形(r !== null ? r : ns[0], 角);
    }
    if (/^(楕円|ellipse)$/.test(種)) {
      var A2 = 数((/a\s*=\s*(-?[\d.]+)/i.exec(引) || [])[1], ns[0]);
      var B2 = 数((/b\s*=\s*(-?[\d.]+)/i.exec(引) || [])[1], ns[1]);
      return 楕円(A2, B2);
    }
    /* ★ 三角形を **寸法だけ**で 描く（2026-08-17・実測で 足した）。
       「三角形: 底辺4 高さ3」「直角三角形: 3,4,5」のように、
       頂点の 名前も 座標も 無い 書きかたが いちばん よく 来る。
       頂点名や 座標が ある行は **座標エンジンの 仕事**なので ここでは 断る。 */
    if (/^(三角形|triangle)$/.test(種) && !/[A-Za-z]\s*\(/.test(引) && !/[A-Za-z]{3}/.test(引)) {
      var 直 = /直角/.test(文(l0)) || /直角/.test(引);
      var 下3 = 数((/下\s*=\s*(-?[\d.]+)/.exec(引) || [])[1], null);
      if (下3 !== null && h !== null) return 三角形寸法(下3, h, 直);
      if (ns.length >= 3) return 三角形三辺(ns[0], ns[1], ns[2]);
      if (ns.length === 2) return 三角形寸法(ns[0], ns[1], 直);
      return null;
    }
    if (/^(平行四辺形|parallelogram)$/.test(種)) {
      var 角2 = 数((/(?:角|angle)\s*=?\s*(-?[\d.]+)/.exec(引) || [])[1], 60);
      return 平行四辺形(ns[0], ns[1], 角2);
    }
    if (/^(台形|trapezoid)$/.test(種)) {
      var 上 = 数((/(?:上|上底)\s*=?\s*(-?[\d.]+)/.exec(引) || [])[1], ns[0]);
      var 下 = 数((/(?:下|下底)\s*=?\s*(-?[\d.]+)/.exec(引) || [])[1], ns[1]);
      var 高2 = h !== null ? h : ns[2];
      return 台形(上, 下, 高2);
    }
    if (/^(立方体|cube)$/.test(種)) return 直方体(ns[0], ns[0], ns[0]);
    if (/^(直方体|cuboid|box)$/.test(種)) return 直方体(ns[0], ns[1], ns[2]);
    if (/^(円柱|cylinder)$/.test(種)) return 円柱(r !== null ? r : ns[0], h !== null ? h : ns[1]);
    if (/^(円錐|cone)$/.test(種)) return 円錐(r !== null ? r : ns[0], h !== null ? h : ns[1]);
    if (/^(球|sphere)$/.test(種)) return 球(r !== null ? r : ns[0]);
    if (/^(角錐|pyramid)$/.test(種)) return 角錐(ns[0], h !== null ? h : ns[1], ns[2] || 4);
    if (/^(三角柱|prism)$/.test(種)) return 直方体(ns[0], ns[1], ns[2]);
    /* ★ **見出しを 書かない 書き方**（2026-08-17・実測）。
       AI は 「関数:」を 付けずに、いきなり
         y = x^2 - 2x - 3
       と 書く。いちばん 自然な 書き方なので **そのまま 受ける**。
       ・y = … → 関数のグラフ
       ・r = … → 極座標
       実測で ここだけ 落ちていた（ほかの 3 つは 通っていた）。 */
    if (/^y\s*=/i.test(文(l).trim())) {
      return 関数(文(l).split(/\s*[,、]\s*(?=y\s*=)/i));
    }
    if (/^(ベン図|venn)$/.test(種)) {
      var 組2 = 組を読む(引);
      if (組2.length < 2) 組2 = 引.split(/[,、\s]+/).filter(Boolean).map(function (n) { return { 名: n }; });
      return ベン図(組2);
    }
    if (/^(単位円|unitcircle)$/.test(種)) return 単位円(ns[0]);
    if (/^(樹形図|tree)$/.test(種)) return 樹形図(引);
    if (/^(数直線|numberline)$/.test(種)) return 数直線(引);
    if (/^(円と接線|接線|tangent)$/.test(種)) {
      var d2 = 数((/(?:d|距離)\s*=?\s*(-?[\d.]+)/i.exec(引) || [])[1], ns[1]);
      return 円と接線(r !== null ? r : ns[0], d2);
    }
    if (/^(ベクトル|vector)$/.test(種)) {
      var ps = 点を読む(引);
      var 名2 = (引.match(/([A-Za-z\u3041-\u30ff])\s*\(/g) || []).map(function (t) { return t.replace(/[\s(]/g, ""); });
      return ベクトル(ps, 名2);
    }
    if (/^(正四面体|正八面体|tetrahedron|octahedron)$/.test(種)) {
      return 正多面体(/四面|tetra/.test(種) ? "四面" : "八面", ns[0]);
    }
    if (/^(展開図|net)$/.test(種)) {
      var 何 = /円柱|cylinder/.test(引) ? "円柱" : "直方体";
      var ns2 = ns.slice();
      if (何 === "円柱") {
        var r2 = 数((/r\s*=\s*(-?[\d.]+)/i.exec(引) || [])[1], ns2[0]);
        var h2 = 数((/h\s*=\s*(-?[\d.]+)/i.exec(引) || [])[1], ns2[1]);
        ns2 = [r2, h2];
      }
      return 展開図(何, ns2);
    }
    if (/^(回路|circuit)$/.test(種)) return 回路(引);
    if (/^(力|力の図|force)$/.test(種)) return 力の図(組を読む(引));
    return null;
  }

  VQG.more = { 一行: 一行, 引数を正す: 引数を正す, 三角形寸法: 三角形寸法, 三角形三辺: 三角形三辺, 見出しを正す: 見出しを正す, ベン図: ベン図, 単位円: 単位円, 樹形図: 樹形図, 数直線: 数直線,
               円と接線: 円と接線, ベクトル: ベクトル, 正多面体: 正多面体, 展開図: 展開図,
               回路: 回路, 力の図: 力の図, 点検: 点検, なぜだめ: function () { return 最後のだめ; }, 関数: 関数, 散布図: 散布図, 円グラフ: 円グラフ, 棒グラフ: 棒グラフ,
               折れ線: 折れ線, 箱ひげ: 箱ひげ, 正多角形: 正多角形, 扇形: 扇形, 楕円: 楕円,
               平行四辺形: 平行四辺形, 台形: 台形, 直方体: 直方体, 円柱: 円柱, 円錐: 円錐,
               球: 球, 角錐: 角錐, 式にする: 式にする, 組を読む: 組を読む };
})(typeof globalThis !== "undefined" ? globalThis : this);
