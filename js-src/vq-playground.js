/* ══════════════════════════════════════════════════════════════════════════
   vq-playground — プレイグラウンド（2026-09-07・訴え）

   訴え:
     「理科、社会、数学など、テンプレートは豊富で、それぞれの仕組みなどを
       体験して操作などができる 3D/2D でシミュレーションができるもの。
       実験、教材用のアニメーションなどを何百種類も。
       入れる際には、必ず 1 つ 1 つを 丁寧に 作り上げてください。
       PC だけでなく、モバイルにも 適用させてください。」
     「プレイグラウンドの 一覧は プリセット一覧と 同じ ものに して ほしい。
       そうすれば 見やすいから」

   ★ 何百種類を まともに 出すには、**1 つ 1 つに 画面を 作らせない**。
     強い 土台（この ファイル）＋ 短い 定義（vq-plg-sim.js）に 分ける。
     1 つの シミュレーションは 30〜80 行で 書ける ように する。
     そうしないと 数が 増えた とき、直せなく なる。

   ★ 一覧の 見た目は **vq-screens の CSS を 借りる**（window.__vqScreensCss）。
     写して 持つと 必ず ずれる ので、出どころは 1 つ。

   ★ 外へ 出すもの
       window.VQPLG            … 登録所（シミュレーションが 自分を 足す）
       window.__vqPlayground   … open() / close()

   ── シミュレーションの 書きかた ────────────────────────────────────────
   VQPLG.足す({
     id:"phys-pendulum", 教科:"理科", 分野:"物理", 学年:"中3",
     題:"単振り子", ひとこと:"ひもの長さで 周期が どう 変わるか",
     次元:"2d",                             // "2d" | "3d"
     つまみ:[
       { id:"L", 名:"ひもの長さ", 単位:"m", 最小:0.2, 最大:2, 刻み:0.05, 既定:1 },
       { id:"g", 名:"重力", 型:"選", 選択:[["地球",9.8],["月",1.62]], 既定:9.8 },
       { id:"trail", 名:"軌跡", 型:"入", 既定:true },
     ],
     はじめ(s,c){ ... },                      // s=状態 c=つまみの値
     進める(s,c,dt){ ... },                   // dt は 秒
     描く(g,s,c){ ... },                      // g=描く道具
     読み(s,c){ return [{名:"周期",値:1.2,単位:"s"}]; },
     グラフ:{ 名:"角度", 単位:"°", 取る(s,c){ return ...; } },
     学び:["周期は ひもの長さの 平方根に 比例する"],
   });
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  if (window.__vqPlaygroundInstalled) return;
  window.__vqPlaygroundInstalled = true;

  var doc = document;
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  /* **…** を 太字に する。書く 側が 自然に 書ける ように。
     ★ **先に esc して から** 置き換える（生の HTML を 通さない）。 */
  function 太字(s) {
    return esc(s).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  }
  function 数(v, 既定) { var n = Number(v); return isFinite(n) ? n : 既定; }
  function 挟む(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ══ 登録所 ══════════════════════════════════════════════════════════
     シミュレーションは 自分で ここへ 足す。読み込む 順番に 依らない ように、
     VQPLG は **この ファイルより 先に 読まれても 良い** ように しておく。 */
  var 箱 = (window.VQPLG && window.VQPLG._箱) || [];
  var 索引 = Object.create(null);
  箱.forEach(function (x) { 索引[x.id] = x; });

  var VQPLG = window.VQPLG = window.VQPLG || {};
  VQPLG._箱 = 箱;
  VQPLG.足す = function (定義) {
    if (!定義 || !定義.id) return;
    if (索引[定義.id]) {                       /* 同じ id は 上書き（作り直し用） */
      var i = 箱.indexOf(索引[定義.id]);
      if (i >= 0) 箱.splice(i, 1);
    }
    /* 既定を 埋める。ここで 埋めて おくと 各シミュが 短く 書ける。 */
    定義.次元 = 定義.次元 === "3d" ? "3d" : "2d";
    定義.つまみ = Array.isArray(定義.つまみ) ? 定義.つまみ : [];
    定義.学び = Array.isArray(定義.学び) ? 定義.学び : [];
    定義.教科 = 定義.教科 || "その他";
    箱.push(定義); 索引[定義.id] = 定義;
  };
  VQPLG.一覧 = function () { return 箱.slice(); };
  VQPLG.引く = function (id) { return 索引[id] || null; };
  VQPLG.数 = function () { return 箱.length; };

  /* ══ 色 ════════════════════════════════════════════════════════════
     canvas は トークン（var(--vq-*)）を そのまま 使えない ので、
     **1 度だけ 実際の 値に 直して** 持つ。暗い 画面でも 見える ように、
     地の 明るさから 明暗を 見分けて 線の 色を 決める。 */
  var 色 = null;
  function 色を作る(el) {
    var cs = getComputedStyle(el);
    function t(名, 控) { var v = cs.getPropertyValue(名).trim(); return v || 控; }
    var 地 = t("--vq-surface", "#ffffff");
    var 暗い = 明るさ(地) < 0.5;
    return {
      暗い: 暗い,
      地: 地,
      沈: t("--vq-surface-sunken", 暗い ? "#1b1a22" : "#EFEDF6"),
      枠: t("--vq-border", 暗い ? "#39374a" : "#E7E4EF"),
      薄枠: t("--vq-border-subtle", 暗い ? "#2b2a33" : "#ECEAF4"),
      字: t("--vq-text", 暗い ? "#EDEAF6" : "#2B2836"),
      副字: t("--vq-text-secondary", 暗い ? "#A9A4BC" : "#686477"),
      薄字: t("--vq-text-tertiary", 暗い ? "#807B94" : "#9994A8"),
      主: t("--vq-accent", "#756DB3"),
      /* 図で 使う 色。**色だけで 意味を 伝えない**（必ず 文字も 添える）。 */
      赤: 暗い ? "#FF7A7A" : "#D8453F",
      青: 暗い ? "#6FB3FF" : "#1F6FD0",
      緑: 暗い ? "#5FD08A" : "#1E9B57",
      橙: 暗い ? "#FFB05C" : "#D9821A",
      紫: 暗い ? "#C2A6FF" : "#6E4BC8",
      桃: 暗い ? "#FF9BD0" : "#C43C90",
      青緑: 暗い ? "#5FD6D0" : "#12908A",
      黄: 暗い ? "#F2D65C" : "#B79000",
      灰: 暗い ? "#6E6980" : "#8C8799"
    };
  }
  function 明るさ(c) {
    c = String(c || "").trim();
    var r = 0, g = 0, b = 0, m;
    if ((m = /^#([0-9a-f]{3})$/i.exec(c))) {
      r = parseInt(m[1][0] + m[1][0], 16); g = parseInt(m[1][1] + m[1][1], 16); b = parseInt(m[1][2] + m[1][2], 16);
    } else if ((m = /^#([0-9a-f]{6})$/i.exec(c))) {
      r = parseInt(m[1].slice(0, 2), 16); g = parseInt(m[1].slice(2, 4), 16); b = parseInt(m[1].slice(4, 6), 16);
    } else if ((m = /rgba?\(([^)]+)\)/i.exec(c))) {
      var a = m[1].split(",").map(parseFloat); r = a[0] || 0; g = a[1] || 0; b = a[2] || 0;
    } else return 1;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }

  /* ══ 2D の 描く道具 ═══════════════════════════════════════════════
     ★ 各シミュは **世界の 座標**（メートルなど）で 書く。画面の px は 触らない。
       そうしないと、画面の 大きさが 変わる たびに 全部 書き直しに なる。
     ★ 縦横比は 必ず 保つ。潰れた 円は 円で ない。 */
  function 二次元(cv) {
    var ctx = cv.getContext("2d");
    var 幅 = 0, 高 = 0, 倍 = 1;
    var w0 = -1, w1 = 1, h0 = -1, h1 = 1, sx = 1, sy = 1, ox = 0, oy = 0;

    function 整える() {
      var r = cv.getBoundingClientRect();
      var d = Math.min(window.devicePixelRatio || 1, 2.5);
      var W = Math.max(1, Math.round(r.width * d)), H = Math.max(1, Math.round(r.height * d));
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      幅 = r.width; 高 = r.height; 倍 = d;
      ctx.setTransform(d, 0, 0, d, 0, 0);
    }
    /* 世界の 範囲を 決める。縦横比が 合わない ぶんは **両側に 均等に** 足す。 */
    function 世界(x0, y0, x1, y1) {
      w0 = x0; h0 = y0; w1 = x1; h1 = y1;
      var ww = x1 - x0, wh = y1 - y0;
      if (!(ww > 0) || !(wh > 0) || !幅 || !高) return;
      var s = Math.min(幅 / ww, 高 / wh);
      sx = s; sy = -s;                        /* y は 上向きが 正（数学と 同じ） */
      ox = (幅 - ww * s) / 2 - x0 * s;
      oy = 高 - ((高 - wh * s) / 2 - y0 * s);
    }
    function X(x) { return x * sx + ox; }
    function Y(y) { return y * sy + oy; }
    function L(v) { return v * sx; }          /* 長さ */
    function 逆X(px) { return (px - ox) / sx; }
    function 逆Y(py) { return (py - oy) / sy; }

    function 引く(o, 既定) {
      o = o || {};
      ctx.lineWidth = 数(o.太さ, 既定 && 既定.太さ || 2);
      ctx.strokeStyle = o.色 || (既定 && 既定.色) || 色.字;
      ctx.lineCap = o.端 || "round";
      ctx.lineJoin = "round";
      if (o.破線) ctx.setLineDash(Array.isArray(o.破線) ? o.破線 : [6, 6]); else ctx.setLineDash([]);
      ctx.globalAlpha = 数(o.濃さ, 1);
    }

    var g = {
      ctx: ctx,
      get 幅() { return 幅; }, get 高() { return 高; },
      色: null,                                /* 開くときに 入れる */
      整える: 整える, 世界: 世界,
      X: X, Y: Y, L: L, 逆X: 逆X, 逆Y: 逆Y,
      消す: function (c) {
        ctx.setTransform(倍, 0, 0, 倍, 0, 0);
        ctx.globalAlpha = 1; ctx.setLineDash([]);
        ctx.fillStyle = c || 色.沈; ctx.fillRect(0, 0, 幅, 高);
      },
      格子: function (o) {
        o = o || {};
        var d = 数(o.間隔, 1), c = o.色 || (色.暗い ? "rgba(255,255,255,.07)" : "rgba(0,0,0,.06)");
        引く({ 色: c, 太さ: 1 });
        ctx.beginPath();
        var x = Math.ceil(w0 / d) * d;
        for (; x <= w1 + 1e-9; x += d) { ctx.moveTo(X(x), Y(h0)); ctx.lineTo(X(x), Y(h1)); }
        var y = Math.ceil(h0 / d) * d;
        for (; y <= h1 + 1e-9; y += d) { ctx.moveTo(X(w0), Y(y)); ctx.lineTo(X(w1), Y(y)); }
        ctx.stroke();
        if (o.軸 !== false) {
          引く({ 色: o.軸色 || (色.暗い ? "rgba(255,255,255,.2)" : "rgba(0,0,0,.18)"), 太さ: 1.4 });
          ctx.beginPath();
          if (h0 <= 0 && h1 >= 0) { ctx.moveTo(X(w0), Y(0)); ctx.lineTo(X(w1), Y(0)); }
          if (w0 <= 0 && w1 >= 0) { ctx.moveTo(X(0), Y(h0)); ctx.lineTo(X(0), Y(h1)); }
          ctx.stroke();
        }
      },
      線: function (x1, y1, x2, y2, o) {
        引く(o); ctx.beginPath(); ctx.moveTo(X(x1), Y(y1)); ctx.lineTo(X(x2), Y(y2)); ctx.stroke();
        ctx.globalAlpha = 1;
      },
      道: function (点, o) {
        if (!点 || 点.length < 2) return;
        引く(o); ctx.beginPath();
        ctx.moveTo(X(点[0][0]), Y(点[0][1]));
        for (var i = 1; i < 点.length; i++) ctx.lineTo(X(点[i][0]), Y(点[i][1]));
        if (o && o.閉じる) ctx.closePath();
        if (o && o.塗) { ctx.fillStyle = o.塗; ctx.globalAlpha = 数(o.塗濃さ, 数(o.濃さ, 1)); ctx.fill(); ctx.globalAlpha = 数(o.濃さ, 1); }
        if (!o || o.線 !== false) ctx.stroke();
        ctx.globalAlpha = 1;
      },
      円: function (x, y, r, o) {
        o = o || {}; 引く(o);
        ctx.beginPath(); ctx.arc(X(x), Y(y), Math.abs(L(r)), 0, Math.PI * 2);
        if (o.塗) { ctx.fillStyle = o.塗; ctx.globalAlpha = 数(o.塗濃さ, 数(o.濃さ, 1)); ctx.fill(); ctx.globalAlpha = 数(o.濃さ, 1); }
        if (o.線 !== false && (o.色 || !o.塗)) ctx.stroke();
        ctx.globalAlpha = 1;
      },
      四角: function (x, y, w, h, o) {
        o = o || {}; 引く(o);
        var px = X(x), py = Y(y + h), pw = L(w), ph = L(h);
        var r = Math.min(数(o.角, 0) * Math.abs(sx), pw / 2, ph / 2);
        ctx.beginPath();
        if (r > 0 && ctx.roundRect) ctx.roundRect(px, py, pw, ph, r); else ctx.rect(px, py, pw, ph);
        if (o.塗) { ctx.fillStyle = o.塗; ctx.globalAlpha = 数(o.塗濃さ, 数(o.濃さ, 1)); ctx.fill(); ctx.globalAlpha = 数(o.濃さ, 1); }
        if (o.線 !== false && (o.色 || !o.塗)) ctx.stroke();
        ctx.globalAlpha = 1;
      },
      弧: function (x, y, r, a0, a1, o) {
        引く(o); ctx.beginPath();
        ctx.arc(X(x), Y(y), Math.abs(L(r)), -a1, -a0);
        if (o && o.塗) { ctx.lineTo(X(x), Y(y)); ctx.closePath(); ctx.fillStyle = o.塗; ctx.globalAlpha = 数(o.塗濃さ, .3); ctx.fill(); ctx.globalAlpha = 1; }
        ctx.stroke(); ctx.globalAlpha = 1;
      },
      矢印: function (x1, y1, x2, y2, o) {
        o = o || {}; 引く(o);
        var px1 = X(x1), py1 = Y(y1), px2 = X(x2), py2 = Y(y2);
        var dx = px2 - px1, dy = py2 - py1, len = Math.hypot(dx, dy);
        if (len < 0.5) { ctx.globalAlpha = 1; return; }
        var 頭 = Math.min(数(o.頭, 10), len * 0.45);
        var ux = dx / len, uy = dy / len;
        ctx.beginPath(); ctx.moveTo(px1, py1); ctx.lineTo(px2 - ux * 頭 * 0.7, py2 - uy * 頭 * 0.7); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(px2, py2);
        ctx.lineTo(px2 - ux * 頭 - uy * 頭 * 0.42, py2 - uy * 頭 + ux * 頭 * 0.42);
        ctx.lineTo(px2 - ux * 頭 + uy * 頭 * 0.42, py2 - uy * 頭 - ux * 頭 * 0.42);
        ctx.closePath();
        ctx.fillStyle = o.色 || 色.字; ctx.fill();
        ctx.globalAlpha = 1;
      },
      ばね: function (x1, y1, x2, y2, o) {
        o = o || {};
        var n = 数(o.巻数, 12), 幅ば = 数(o.幅, 0.12);
        var dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
        if (len < 1e-6) return;
        var ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
        var 点 = [[x1, y1]];
        var 端 = Math.min(0.18 * len, 0.12);
        for (var i = 0; i <= n; i++) {
          var t = 端 + (len - 2 * 端) * (i / n);
          var s = (i === 0 || i === n) ? 0 : (i % 2 ? 1 : -1) * 幅ば;
          点.push([x1 + ux * t + nx * s, y1 + uy * t + ny * s]);
        }
        点.push([x2, y2]);
        this.道(点, { 色: o.色 || 色.灰, 太さ: 数(o.太さ, 2) });
      },
      文字: function (x, y, s, o) {
        o = o || {};
        var 大 = 数(o.大, 13);
        ctx.font = (o.太 ? "700 " : "550 ") + 大 + "px " + (getComputedStyle(cv).fontFamily || "sans-serif");
        ctx.fillStyle = o.色 || 色.字;
        ctx.textAlign = o.揃 || "center";
        ctx.textBaseline = o.縦 || "middle";
        ctx.globalAlpha = 数(o.濃さ, 1);
        var px = o.画面 ? x : X(x), py = o.画面 ? y : Y(y);
        if (o.影) {                            /* 図の 上に 置く 字は 地を 敷く */
          var m = ctx.measureText(String(s));
          ctx.save(); ctx.globalAlpha = 0.82; ctx.fillStyle = 色.地;
          var pw = m.width + 8, ph = 大 + 6;
          var bx = o.揃 === "left" ? px - 4 : o.揃 === "right" ? px - pw + 4 : px - pw / 2;
          if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(bx, py - ph / 2, pw, ph, 5); ctx.fill(); }
          else ctx.fillRect(bx, py - ph / 2, pw, ph);
          ctx.restore();
          ctx.fillStyle = o.色 || 色.字;
        }
        ctx.fillText(String(s), px, py);
        ctx.globalAlpha = 1;
      },
      /* 目盛りつきの 数直線。多くの シミュで 要る ので 土台に 置く。 */
      目盛: function (x0, x1, y, o) {
        o = o || {};
        var d = 数(o.間隔, 1);
        this.線(x0, y, x1, y, { 色: o.色 || 色.薄字, 太さ: 1.4 });
        for (var x = Math.ceil(x0 / d) * d; x <= x1 + 1e-9; x += d) {
          this.線(x, y, x, y - (o.長さ || 0.06), { 色: o.色 || 色.薄字, 太さ: 1.2 });
          if (o.数字 !== false) this.文字(x, y - (o.長さ || 0.06) * 2.4, 短い数(x), { 大: 11, 色: 色.薄字 });
        }
      }
    };
    return g;
  }
  function 短い数(v) {
    if (!isFinite(v)) return "—";
    var a = Math.abs(v);
    if (a >= 1e6 || (a < 1e-3 && a > 0)) return v.toExponential(1).replace("e+", "e");
    var r = Math.round(v * 1000) / 1000;
    return String(r);
  }
  VQPLG.短い数 = 短い数;

  /* ══ 3D の 描く道具（WebGL）════════════════════════════════════════
     ★ 外の 道具（three.js 等）は 使わない。CSP で 読めない うえ、
       ここで 要るのは 箱・球・筒・面・線 だけ。自前の ほうが 軽い。
     ★ 各シミュは 行列を 触らない。「どこに 何色の 球」だけ 書く。
     ★ 指 1 本で 回す・つまんで 寄る。マウスも 同じ 口で 受ける。 */
  var 立体の頂点 = {};                          /* 形は 1 度だけ 作って 使い回す */

  function 形を作る(種, 分) {
    var 鍵 = 種 + ":" + (分 || 0);
    if (立体の頂点[鍵]) return 立体の頂点[鍵];
    var p = [], n = [], i = [];
    if (種 === "box") {
      var 面 = [
        [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1], [0, 0, 1]],
        [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1], [0, 0, -1]],
        [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1], [0, 1, 0]],
        [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1], [0, -1, 0]],
        [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1], [1, 0, 0]],
        [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, 0, 0]]
      ];
      面.forEach(function (f, k) {
        for (var v = 0; v < 4; v++) { p.push(f[v][0], f[v][1], f[v][2]); n.push(f[4][0], f[4][1], f[4][2]); }
        var b = k * 4; i.push(b, b + 1, b + 2, b, b + 2, b + 3);
      });
    } else if (種 === "sphere") {
      var S = 分 || 20, T = S * 2;
      for (var a = 0; a <= S; a++) {
        var th = a / S * Math.PI, st = Math.sin(th), ct = Math.cos(th);
        for (var b2 = 0; b2 <= T; b2++) {
          var ph = b2 / T * Math.PI * 2, sp = Math.sin(ph), cp = Math.cos(ph);
          var x = st * cp, y = ct, z = st * sp;
          p.push(x, y, z); n.push(x, y, z);
        }
      }
      for (var a2 = 0; a2 < S; a2++) for (var b3 = 0; b3 < T; b3++) {
        var r0 = a2 * (T + 1) + b3, r1 = r0 + T + 1;
        i.push(r0, r1, r0 + 1, r1, r1 + 1, r0 + 1);
      }
    } else if (種 === "cyl") {
      var C = 分 || 24;
      for (var k2 = 0; k2 <= C; k2++) {
        var u = k2 / C * Math.PI * 2, cx = Math.cos(u), cz = Math.sin(u);
        p.push(cx, 1, cz); n.push(cx, 0, cz);
        p.push(cx, -1, cz); n.push(cx, 0, cz);
      }
      for (var k3 = 0; k3 < C; k3++) {
        var q = k3 * 2; i.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
      }
      var 天 = p.length / 3;
      p.push(0, 1, 0); n.push(0, 1, 0);
      for (var k4 = 0; k4 <= C; k4++) { var u2 = k4 / C * Math.PI * 2; p.push(Math.cos(u2), 1, Math.sin(u2)); n.push(0, 1, 0); }
      for (var k5 = 0; k5 < C; k5++) i.push(天, 天 + 1 + k5, 天 + 2 + k5);
      var 底 = p.length / 3;
      p.push(0, -1, 0); n.push(0, -1, 0);
      for (var k6 = 0; k6 <= C; k6++) { var u3 = k6 / C * Math.PI * 2; p.push(Math.cos(u3), -1, Math.sin(u3)); n.push(0, -1, 0); }
      for (var k7 = 0; k7 < C; k7++) i.push(底, 底 + 2 + k7, 底 + 1 + k7);
    } else {                                    /* plane（xz 面・上向き） */
      p = [-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1];
      n = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
      i = [0, 1, 2, 0, 2, 3];
    }
    return (立体の頂点[鍵] = { p: new Float32Array(p), n: new Float32Array(n), i: new Uint16Array(i) });
  }

  /* ちいさな 行列。掛ける 順は 「後ろから 効く」（列優先）。 */
  function M単位() { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); }
  function M掛(a, b) {
    var o = new Float32Array(16);
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  }
  function M移(x, y, z) { var m = M単位(); m[12] = x; m[13] = y; m[14] = z; return m; }
  function M拡(x, y, z) { var m = M単位(); m[0] = x; m[5] = y; m[10] = z; return m; }
  function M回X(a) { var c = Math.cos(a), s = Math.sin(a), m = M単位(); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; }
  function M回Y(a) { var c = Math.cos(a), s = Math.sin(a), m = M単位(); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; }
  function M回Z(a) { var c = Math.cos(a), s = Math.sin(a), m = M単位(); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; }
  function M透(fov, 比, 近, 遠) {
    var f = 1 / Math.tan(fov / 2), m = new Float32Array(16);
    m[0] = f / 比; m[5] = f; m[10] = (遠 + 近) / (近 - 遠); m[11] = -1; m[14] = 2 * 遠 * 近 / (近 - 遠);
    return m;
  }
  function M見る(目, 的, 上) {
    var z = 正規([目[0] - 的[0], 目[1] - 的[1], 目[2] - 的[2]]);
    var x = 正規(外積(上, z)); var y = 外積(z, x);
    var m = M単位();
    m[0] = x[0]; m[4] = x[1]; m[8] = x[2];
    m[1] = y[0]; m[5] = y[1]; m[9] = y[2];
    m[2] = z[0]; m[6] = z[1]; m[10] = z[2];
    m[12] = -(x[0] * 目[0] + x[1] * 目[1] + x[2] * 目[2]);
    m[13] = -(y[0] * 目[0] + y[1] * 目[1] + y[2] * 目[2]);
    m[14] = -(z[0] * 目[0] + z[1] * 目[1] + z[2] * 目[2]);
    return m;
  }
  function 外積(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function 正規(a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

  var 面のシェーダ = {
    v: "attribute vec3 aP;attribute vec3 aN;uniform mat4 uMVP;uniform mat4 uM;varying vec3 vN;varying vec3 vW;" +
      "void main(){vN=mat3(uM)*aN;vW=(uM*vec4(aP,1.0)).xyz;gl_Position=uMVP*vec4(aP,1.0);}",
    f: "precision mediump float;varying vec3 vN;varying vec3 vW;uniform vec3 uC;uniform vec3 uL;uniform float uA;" +
      "void main(){vec3 n=normalize(vN);float d=max(dot(n,normalize(uL)),0.0);" +
      "float rim=pow(1.0-max(dot(n,normalize(-vW)),0.0),2.0)*0.12;" +
      "vec3 c=uC*(0.42+0.58*d)+rim;gl_FragColor=vec4(c,uA);}"
  };
  var 線のシェーダ = {
    v: "attribute vec3 aP;uniform mat4 uMVP;void main(){gl_Position=uMVP*vec4(aP,1.0);gl_PointSize=6.0;}",
    f: "precision mediump float;uniform vec3 uC;uniform float uA;void main(){gl_FragColor=vec4(uC,uA);}"
  };

  function 三次元(cv) {
    var gl = cv.getContext("webgl", { antialias: true, alpha: true, premultipliedAlpha: false })
      || cv.getContext("experimental-webgl");
    if (!gl) return null;

    function 組む(s) {
      function 一つ(型, src) {
        var sh = gl.createShader(型); gl.shaderSource(sh, src); gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { return null; }
        return sh;
      }
      var v = 一つ(gl.VERTEX_SHADER, s.v), f = 一つ(gl.FRAGMENT_SHADER, s.f);
      if (!v || !f) return null;
      var p = gl.createProgram(); gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null;
      return p;
    }
    var 面P = 組む(面のシェーダ), 線P = 組む(線のシェーダ);
    if (!面P || !線P) return null;

    var 貯 = {};
    function 積む(形) {
      if (形._buf) return 形._buf;
      var b = { p: gl.createBuffer(), n: gl.createBuffer(), i: gl.createBuffer(), 数: 形.i.length };
      gl.bindBuffer(gl.ARRAY_BUFFER, b.p); gl.bufferData(gl.ARRAY_BUFFER, 形.p, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, b.n); gl.bufferData(gl.ARRAY_BUFFER, 形.n, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.i); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, 形.i, gl.STATIC_DRAW);
      形._buf = b; return b;
    }
    var 線buf = gl.createBuffer();

    /* 見る 向き。指で 変えられる。 */
    var 目 = { 方位: 0.7, 仰角: 0.5, 距離: 6, 的: [0, 0, 0], 画角: 0.9 };
    var VP = M単位(), 光 = 正規([0.5, 0.9, 0.6]);
    var 幅 = 0, 高 = 0;

    function 整える() {
      var r = cv.getBoundingClientRect();
      var d = Math.min(window.devicePixelRatio || 1, 2);
      var W = Math.max(1, Math.round(r.width * d)), H = Math.max(1, Math.round(r.height * d));
      if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
      幅 = r.width; 高 = r.height;
      gl.viewport(0, 0, W, H);
    }
    function 目の位置() {
      var ce = Math.cos(目.仰角), se = Math.sin(目.仰角);
      return [目.的[0] + 目.距離 * ce * Math.sin(目.方位),
      目.的[1] + 目.距離 * se,
      目.的[2] + 目.距離 * ce * Math.cos(目.方位)];
    }
    function 始め(地色) {
      整える();
      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      var c = 色を数に(地色 || 色.沈);
      gl.clearColor(c[0], c[1], c[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      var P = M透(目.画角, Math.max(0.2, 幅 / Math.max(1, 高)), 0.05, 400);
      VP = M掛(P, M見る(目の位置(), 目.的, [0, 1, 0]));
    }
    function 形を描く(形, M, c, 濃) {
      var b = 積む(形);
      gl.useProgram(面P);
      var aP = gl.getAttribLocation(面P, "aP"), aN = gl.getAttribLocation(面P, "aN");
      gl.bindBuffer(gl.ARRAY_BUFFER, b.p); gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, b.n); gl.enableVertexAttribArray(aN); gl.vertexAttribPointer(aN, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.i);
      gl.uniformMatrix4fv(gl.getUniformLocation(面P, "uMVP"), false, M掛(VP, M));
      gl.uniformMatrix4fv(gl.getUniformLocation(面P, "uM"), false, M);
      var rgb = 色を数に(c);
      gl.uniform3f(gl.getUniformLocation(面P, "uC"), rgb[0], rgb[1], rgb[2]);
      gl.uniform3f(gl.getUniformLocation(面P, "uL"), 光[0], 光[1], 光[2]);
      gl.uniform1f(gl.getUniformLocation(面P, "uA"), 数(濃, 1));
      gl.drawElements(gl.TRIANGLES, b.数, gl.UNSIGNED_SHORT, 0);
    }

    var h = {
      gl: gl, 目: 目,
      get 幅() { return 幅; }, get 高() { return 高; },
      整える: 整える, 始め: 始め,
      向き: function (o) {
        o = o || {};
        if (o.距離 != null) 目.距離 = o.距離;
        if (o.方位 != null) 目.方位 = o.方位;
        if (o.仰角 != null) 目.仰角 = 挟む(o.仰角, -1.5, 1.5);
        if (o.的) 目.的 = o.的;
      },
      箱: function (x, y, z, w, hh, d, c, o) {
        o = o || {};
        var M = M掛(M移(x, y, z), M拡(w / 2, hh / 2, d / 2));
        if (o.回) M = M掛(M掛(M移(x, y, z), M掛(M回Y(o.回[1] || 0), M掛(M回X(o.回[0] || 0), M回Z(o.回[2] || 0)))), M拡(w / 2, hh / 2, d / 2));
        形を描く(形を作る("box"), M, c, o.濃さ);
      },
      球: function (x, y, z, r, c, o) {
        o = o || {};
        形を描く(形を作る("sphere", o.粗 ? 10 : 20), M掛(M移(x, y, z), M拡(r, r, r)), c, o.濃さ);
      },
      筒: function (x, y, z, r, hh, c, o) {
        o = o || {};
        var M = M掛(M移(x, y, z), M拡(r, hh / 2, r));
        if (o.回) M = M掛(M掛(M移(x, y, z), M掛(M回Y(o.回[1] || 0), M掛(M回X(o.回[0] || 0), M回Z(o.回[2] || 0)))), M拡(r, hh / 2, r));
        形を描く(形を作る("cyl", 24), M, c, o.濃さ);
      },
      /* 2 点を つなぐ 棒（腕・骨組み・軸に 使う） */
      棒: function (a, b, r, c, o) {
        var dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
        var L2 = Math.hypot(dx, dy, dz); if (L2 < 1e-6) return;
        var 方位 = Math.atan2(dx, dz), 仰 = Math.acos(挟む(dy / L2, -1, 1));
        var M = M掛(M掛(M移((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), M掛(M回Y(方位), M回X(仰))), M拡(r, L2 / 2, r));
        形を描く(形を作る("cyl", 16), M, c, (o || {}).濃さ);
      },
      板: function (x, y, z, w, d, c, o) {
        o = o || {};
        形を描く(形を作る("plane"), M掛(M移(x, y, z), M拡(w / 2, 1, d / 2)), c, 数(o.濃さ, 1));
      },
      線: function (点, c, o) {
        o = o || {};
        if (!点 || 点.length < 2) return;
        var f = new Float32Array(点.length * 3);
        for (var k = 0; k < 点.length; k++) { f[k * 3] = 点[k][0]; f[k * 3 + 1] = 点[k][1]; f[k * 3 + 2] = 点[k][2]; }
        gl.useProgram(線P);
        gl.bindBuffer(gl.ARRAY_BUFFER, 線buf); gl.bufferData(gl.ARRAY_BUFFER, f, gl.DYNAMIC_DRAW);
        var aP = gl.getAttribLocation(線P, "aP");
        gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 0, 0);
        gl.uniformMatrix4fv(gl.getUniformLocation(線P, "uMVP"), false, VP);
        var rgb = 色を数に(c);
        gl.uniform3f(gl.getUniformLocation(線P, "uC"), rgb[0], rgb[1], rgb[2]);
        gl.uniform1f(gl.getUniformLocation(線P, "uA"), 数(o.濃さ, 1));
        gl.drawArrays(o.点 ? gl.POINTS : (o.閉じる ? gl.LINE_LOOP : gl.LINE_STRIP), 0, 点.length);
      },
      /* 床の 格子。3D は 地面が 無いと 上下が 分からなく なる。 */
      床: function (半, 間, c) {
        var 点 = [], i;
        for (i = -半; i <= 半; i += 間) { 点.push([i, 0, -半], [i, 0, 半]); }
        for (i = -半; i <= 半; i += 間) { 点.push([-半, 0, i], [半, 0, i]); }
        var f = new Float32Array(点.length * 3);
        for (var k = 0; k < 点.length; k++) { f[k * 3] = 点[k][0]; f[k * 3 + 1] = 点[k][1]; f[k * 3 + 2] = 点[k][2]; }
        gl.useProgram(線P);
        gl.bindBuffer(gl.ARRAY_BUFFER, 線buf); gl.bufferData(gl.ARRAY_BUFFER, f, gl.DYNAMIC_DRAW);
        var aP = gl.getAttribLocation(線P, "aP");
        gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 0, 0);
        gl.uniformMatrix4fv(gl.getUniformLocation(線P, "uMVP"), false, VP);
        var rgb = 色を数に(c || (色.暗い ? "#3a3850" : "#d8d4e6"));
        gl.uniform3f(gl.getUniformLocation(線P, "uC"), rgb[0], rgb[1], rgb[2]);
        gl.uniform1f(gl.getUniformLocation(線P, "uA"), 0.75);
        gl.drawArrays(gl.LINES, 0, 点.length);
      },
      /* 画面の どこに 出るか（字を 重ねる ため）。見えない ときは null。 */
      画面へ: function (p) {
        var v = [p[0], p[1], p[2], 1], o = [0, 0, 0, 0];
        for (var r = 0; r < 4; r++) o[r] = VP[r] * v[0] + VP[4 + r] * v[1] + VP[8 + r] * v[2] + VP[12 + r] * v[3];
        if (o[3] <= 0.001) return null;
        return { x: (o[0] / o[3] * 0.5 + 0.5) * 幅, y: (1 - (o[1] / o[3] * 0.5 + 0.5)) * 高 };
      }
    };
    return h;
  }
  function 色を数に(c) {
    c = String(c || "#888").trim();
    var m;
    if ((m = /^#([0-9a-f]{3})$/i.exec(c))) return [parseInt(m[1][0] + m[1][0], 16) / 255, parseInt(m[1][1] + m[1][1], 16) / 255, parseInt(m[1][2] + m[1][2], 16) / 255];
    if ((m = /^#([0-9a-f]{6})$/i.exec(c))) return [parseInt(m[1].slice(0, 2), 16) / 255, parseInt(m[1].slice(2, 4), 16) / 255, parseInt(m[1].slice(4, 6), 16) / 255];
    if ((m = /rgba?\(([^)]+)\)/i.exec(c))) { var a = m[1].split(",").map(parseFloat); return [(a[0] || 0) / 255, (a[1] || 0) / 255, (a[2] || 0) / 255]; }
    return [0.5, 0.5, 0.5];
  }

  /* ══ 画面 ═════════════════════════════════════════════════════════
     一覧 … プリセット一覧と **同じ 見た目**（vq-screens の CSS を 借りる）
     舞台 … シミュレーションを 走らせる ところ

     ★ モバイル（訴え「PC だけでなく、モバイルにも」）
       ・舞台は 上に 置いて 高さを 決め打ちに しない（42vh・小さい 端末では 36vh）
       ・つまみは 下に 積んで 縦に すべる。押す ところは 44px
       ・下端は セーフエリア ぶん 空ける。**自分で 埋めない**（--vq-sab を 足すだけ）
       ・横に すべらない。はみ出す ものは 自分の 中で すべらせる */
  var 足すCSS =
    ":host{position:fixed;inset:0;z-index:2147483102;display:none;font-family:var(--vq-app-font,'Inter','Hiragino Sans',system-ui,sans-serif);}" +
    ":host([data-open]){display:block;}" +
    ".sheet{position:absolute;inset:0;background:var(--vq-bg,#F7F6FB);color:var(--vq-text,#2B2836);display:flex;flex-direction:column;overflow:hidden;}" +
    /* ── 上の帯 ── */
    ".top{flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:calc(env(safe-area-inset-top,0px) + 10px) 14px 10px;border-bottom:1px solid var(--vq-border-subtle,#ECEAF4);background:var(--vq-surface,#fff);}" +
    ".top__t{font-size:15px;font-weight:750;flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
    ".top__s{font-size:11.5px;font-weight:600;color:var(--vq-text-tertiary,#9994A8);}" +
    ".ib{width:40px;height:40px;flex:0 0 auto;border:0;background:none;border-radius:11px;cursor:pointer;color:var(--vq-text-secondary,#686477);display:inline-flex;align-items:center;justify-content:center;}" +
    ".ib:hover{background:var(--vq-surface-hover,#F2F0F9);}.ib svg{width:20px;height:20px;}" +
    ".body{flex:1 1 auto;min-height:0;overflow:auto;-webkit-overflow-scrolling:touch;}" +
    ".wrapp{max-width:1180px;margin:0 auto;padding:20px 20px calc(28px + var(--vq-sab,0px));}" +
    "@media (max-width:640px){.wrapp{padding:14px 14px calc(22px + var(--vq-sab,0px));}}" +
    /* ── 舞台 ── */
    ".stage{position:absolute;inset:0;display:flex;flex-direction:column;background:var(--vq-bg,#F7F6FB);}" +
    ".stage__main{flex:1 1 auto;min-height:0;display:flex;gap:0;}" +
    ".view{position:relative;flex:1 1 auto;min-width:0;background:var(--vq-surface-sunken,#EFEDF6);overflow:hidden;}" +
    ".view canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;}" +
    ".view__note{position:absolute;left:12px;top:12px;right:12px;font-size:11.5px;font-weight:600;color:var(--vq-text-tertiary,#9994A8);pointer-events:none;line-height:1.6;}" +
    ".view__hud{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;}" +
    /* 右の 操作板（PC）。モバイルでは 下へ 回る。 */
    ".side{flex:0 0 auto;width:330px;border-left:1px solid var(--vq-border-subtle,#ECEAF4);background:var(--vq-surface,#fff);overflow:auto;-webkit-overflow-scrolling:touch;padding:16px 16px calc(20px + var(--vq-sab,0px));}" +
    ".grp{margin-bottom:18px;}" +
    ".grp__t{font-size:11px;font-weight:750;letter-spacing:.04em;color:var(--vq-text-tertiary,#9994A8);margin-bottom:9px;text-transform:uppercase;}" +
    /* つまみ */
    ".knob{margin-bottom:14px;}" +
    ".knob__h{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:6px;}" +
    ".knob__n{font-size:12.5px;font-weight:650;color:var(--vq-text,#2B2836);}" +
    ".knob__v{font-size:12.5px;font-weight:700;color:var(--vq-accent-text,#5F579E);font-variant-numeric:tabular-nums;}" +
    ".knob input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:32px;background:none;cursor:pointer;display:block;}" +
    ".knob input[type=range]::-webkit-slider-runnable-track{height:6px;border-radius:3px;background:var(--vq-surface-sunken,#EFEDF6);}" +
    ".knob input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:22px;height:22px;margin-top:-8px;border-radius:50%;background:var(--vq-accent,#756DB3);border:3px solid var(--vq-surface,#fff);box-shadow:0 1px 4px rgba(60,40,120,.28);}" +
    ".knob input[type=range]::-moz-range-track{height:6px;border-radius:3px;background:var(--vq-surface-sunken,#EFEDF6);}" +
    ".knob input[type=range]::-moz-range-thumb{width:18px;height:18px;border-radius:50%;background:var(--vq-accent,#756DB3);border:3px solid var(--vq-surface,#fff);}" +
    ".sw{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:44px;cursor:pointer;}" +
    ".sw__b{width:44px;height:26px;border-radius:13px;background:var(--vq-surface-sunken,#EFEDF6);position:relative;flex:0 0 auto;transition:background .15s;}" +
    ".sw__b::after{content:'';position:absolute;left:3px;top:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .15s;}" +
    ".sw.on .sw__b{background:var(--vq-accent,#756DB3);}.sw.on .sw__b::after{transform:translateX(18px);}" +
    ".pick{display:flex;flex-wrap:wrap;gap:6px;}" +
    ".pick button{min-height:36px;padding:0 12px;border-radius:10px;border:1px solid var(--vq-border,#E7E4EF);background:var(--vq-surface,#fff);color:var(--vq-text-secondary,#686477);font:inherit;font-size:12.5px;font-weight:650;cursor:pointer;}" +
    ".pick button.on{background:var(--vq-accent,#756DB3);color:#fff;border-color:var(--vq-accent,#756DB3);}" +
    /* 読み（いまの 数値） */
    ".reads{display:grid;grid-template-columns:1fr 1fr;gap:8px;}" +
    ".read{background:var(--vq-surface-sunken,#EFEDF6);border-radius:12px;padding:9px 11px;min-width:0;}" +
    ".read__n{font-size:10.5px;font-weight:650;color:var(--vq-text-tertiary,#9994A8);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}" +
    ".read__v{font-size:16px;font-weight:750;font-variant-numeric:tabular-nums;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}" +
    ".read__u{font-size:11px;font-weight:600;color:var(--vq-text-tertiary,#9994A8);margin-left:2px;}" +
    /* グラフ */
    ".chart{width:100%;height:120px;background:var(--vq-surface-sunken,#EFEDF6);border-radius:12px;display:block;}" +
    /* 学び */
    ".learn{margin:0;padding-left:18px;}" +
    ".learn li{font-size:12.5px;line-height:1.85;color:var(--vq-text-secondary,#686477);margin-bottom:4px;}" +
    ".learn strong{color:var(--vq-text,#2B2836);font-weight:750;}" +
    /* 走らせる 帯 */
    ".bar{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:10px 14px calc(10px + var(--vq-sab,0px));border-top:1px solid var(--vq-border-subtle,#ECEAF4);background:var(--vq-surface,#fff);}" +
    ".bar__sp{flex:1 1 auto;}" +
        /* ★ 文字が 縦に 積まれる のを 止める。狭い 画面で 実際に 起きた。 */
    ".btn{min-height:40px;padding:0 15px;border-radius:11px;border:1px solid var(--vq-border,#E7E4EF);background:var(--vq-surface,#fff);color:var(--vq-text,#2B2836);font:inherit;font-size:13px;font-weight:650;cursor:pointer;display:inline-flex;align-items:center;gap:7px;white-space:nowrap;flex:0 0 auto;}" +
    ".btn:hover{background:var(--vq-surface-hover,#F2F0F9);}" +
    ".btn--go{background:var(--vq-accent,#756DB3);border-color:var(--vq-accent,#756DB3);color:#fff;min-width:104px;justify-content:center;}" +
    ".btn svg{width:17px;height:17px;}" +
    ".spd{display:inline-flex;background:var(--vq-surface-sunken,#EFEDF6);border-radius:11px;padding:3px;gap:2px;}" +
    ".spd button{min-height:34px;padding:0 10px;border:0;background:none;border-radius:8px;font:inherit;font-size:12px;font-weight:650;color:var(--vq-text-secondary,#686477);cursor:pointer;white-space:nowrap;}" +
    ".spd{flex:0 0 auto;}" +
    ".spd button.on{background:var(--vq-surface,#fff);color:var(--vq-accent-text,#5F579E);box-shadow:0 1px 3px rgba(0,0,0,.06);}" +
    /* ── モバイル：舞台を 上、つまみを 下に 積む ── */
    "@media (max-width:860px){" +
    ".stage__main{flex-direction:column;}" +
    ".view{flex:0 0 auto;height:42vh;min-height:200px;}" +
    ".side{width:auto;flex:1 1 auto;border-left:0;border-top:1px solid var(--vq-border-subtle,#ECEAF4);padding:14px 14px calc(18px + var(--vq-sab,0px));}" +
    ".reads{grid-template-columns:1fr 1fr;}" +
    ".bar{padding:8px 12px calc(8px + var(--vq-sab,0px));}" +
        ".btn{min-height:44px;}.spd button{min-height:38px;}" +
    /* ★ 狭い 画面では 「1こま」を 隠し、すきま棒を 消して 1 行に おさめる。
       置いた ままだと 速さの ×2 が 画面の 外へ 出て 押せなく なる（実測）。 */
        ".bar__sp{display:none;}.btn--step{display:none;}.btn--go{flex:1 1 auto;min-width:0;}.spd{margin-left:auto;}" +
    /* ★ 375px では これでも 75px はみ出した（実測）。
       「さいしょから」を 絵だけに し、はやさの 間を 詰めて 1 行に おさめる。 */
    ".btn--reset .btn__t{display:none;}.btn--reset{padding:0 12px;}" +
    ".spd button{padding:0 8px;font-size:11.5px;}.bar{gap:6px;}" +
    "}" +
    "@media (max-width:860px) and (max-height:620px){.view{height:36vh;min-height:160px;}}" +
    "@media (max-width:330px){.reads{grid-template-columns:1fr;}}" +
    /* 3D が 使えない 端末 */
    ".no3d{position:absolute;inset:0;display:grid;place-items:center;padding:24px;text-align:center;font-size:13px;line-height:1.9;color:var(--vq-text-tertiary,#9994A8);}";

  var P = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
  var 絵 = {
    戻る: '<path d="M15 18l-6-6 6-6" ' + P + "/>",
    閉: '<path d="M18 6 6 18M6 6l12 12" ' + P + "/>",
    再生: '<path d="M8 5.5v13l10-6.5z" fill="currentColor"/>',
    停止: '<path d="M9 5.5h3.2v13H9zM15.8 5.5H19v13h-3.2z" fill="currentColor"/>',
    こま: '<path d="M6 5.5v13M10 12l8-6.5v13z" ' + P + "/>",
    戻す: '<path d="M3 12a9 9 0 1 0 3-6.7M3 4.5V9h4.5" ' + P + "/>",
    探: '<circle cx="11" cy="11" r="7" ' + P + '/><path d="m20 20-3.6-3.6" ' + P + "/>",
    格子: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.6" ' + P + '/><rect x="13.5" y="3.5" width="7" height="7" rx="1.6" ' + P + '/><rect x="3.5" y="13.5" width="7" height="7" rx="1.6" ' + P + '/><rect x="13.5" y="13.5" width="7" height="7" rx="1.6" ' + P + "/>",
    並: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" ' + P + "/>",
    星: '<path d="m12 3.6 2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8L3.5 9.8l5.9-.9z" ' + P + "/>"
  };
  function svg(n, c) { return '<svg viewBox="0 0 24 24" class="' + (c || "") + '" aria-hidden="true">' + (絵[n] || "") + "</svg>"; }

  /* ══ 表紙 ═══════════════════════════════════════════════════════════
     プリセットと 同じで、絵は 作らず **色と 模様**で 埋める。
     分野ごとに 色相を 決めて おくと、一覧で ひと目で 見分けが つく。 */
  var 色相 = {
    "物理": 210, "化学": 150, "生物": 96, "地学": 25,
    "代数": 262, "幾何": 288, "解析": 250, "確率": 322,
    "地理": 175, "歴史": 38, "公民": 340, "経済": 12
  };
  var 模様 = ["lines", "grid", "dots", "paper", "plain"];
  function 表紙(x) {
    var h = 色相[x.分野] != null ? 色相[x.分野] : 250;
    var p = 模様[(String(x.id).length + (x.id.charCodeAt(0) || 0)) % 模様.length];
    return { hue: h, pat: p };
  }

  /* ══ 一覧（プリセット一覧と 同じ 見た目）════════════════════════════ */
  var 状態 = {
    タブ: "all", 分野: null, 探: "", 並び: "recommended", 見せ方: "grid"
  };
  var 好きKEY = "vq.playground.fav.v1";
  function 好き() { try { return JSON.parse(localStorage.getItem(好きKEY) || "[]"); } catch (e) { return []; } }
  function 好き切替(id) {
    var a = 好き(), i = a.indexOf(id);
    if (i >= 0) a.splice(i, 1); else a.push(id);
    try { localStorage.setItem(好きKEY, JSON.stringify(a)); } catch (e) { }
  }
  var 最近KEY = "vq.playground.recent.v1";
  function 最近() { try { return JSON.parse(localStorage.getItem(最近KEY) || "[]"); } catch (e) { return []; } }
  function 最近に足す(id) {
    var a = 最近().filter(function (x) { return x !== id; });
    a.unshift(id);
    try { localStorage.setItem(最近KEY, JSON.stringify(a.slice(0, 12))); } catch (e) { }
  }

  var 教科の並び = ["理科", "数学", "社会", "その他"];
  function タブの数() {
    var 全 = VQPLG.一覧(), f = 好き();
    var o = { all: 全.length, fav: 全.filter(function (x) { return f.indexOf(x.id) >= 0; }).length };
    教科の並び.forEach(function (k) { o[k] = 全.filter(function (x) { return x.教科 === k; }).length; });
    return o;
  }
  function 絞る() {
    var 全 = VQPLG.一覧(), f = 好き(), q = 状態.探.trim().toLowerCase();
    var 出 = 全.filter(function (x) {
      if (状態.タブ === "fav" && f.indexOf(x.id) < 0) return false;
      if (状態.タブ !== "all" && 状態.タブ !== "fav" && x.教科 !== 状態.タブ) return false;
      if (状態.分野 && x.分野 !== 状態.分野) return false;
      if (q) {
        var s = (x.題 + " " + (x.ひとこと || "") + " " + (x.分野 || "") + " " + (x.教科 || "") + " " + (x.学年 || "")).toLowerCase();
        if (s.indexOf(q) < 0) return false;
      }
      return true;
    });
    if (状態.並び === "name") 出.sort(function (a, b) { return String(a.題).localeCompare(String(b.題), "ja"); });
    else if (状態.並び === "subject") 出.sort(function (a, b) {
      var d = 教科の並び.indexOf(a.教科) - 教科の並び.indexOf(b.教科);
      return d || String(a.分野 || "").localeCompare(String(b.分野 || ""), "ja");
    });
    return 出;
  }
  function 分野の一覧() {
    var 見た = {}, 出 = [];
    VQPLG.一覧().forEach(function (x) {
      if (状態.タブ !== "all" && 状態.タブ !== "fav" && x.教科 !== 状態.タブ) return;
      if (x.分野 && !見た[x.分野]) { 見た[x.分野] = 1; 出.push(x.分野); }
    });
    return 出;
  }

  function カード(x) {
    var b = 表紙(x), f = 好き().indexOf(x.id) >= 0;
    var 札 = [];
    札.push('<span class="pc__kind">' + esc(x.分野 || x.教科) + "</span>");
    if (x.次元 === "3d") 札.push('<span class="pc__kind is-new">3D</span>');
    return '<button class="pc" type="button" data-plg-open="' + esc(x.id) + '">' +
      '<span class="pc__ban" data-pat="' + b.pat + '" style="--lib-hue:' + b.hue + '">' +
      '<span class="pc__kinds">' + 札.join("") + "</span>" +
      '<span class="pc__cov">' +
      '<span class="pc__cov-t">' + esc(x.題) + "</span>" +
      (x.学年 ? '<span class="pc__cov-s">' + esc(x.学年) + "</span>" : "") +
      "</span>" +
      "</span>" +
      '<span class="pc__b">' +
      '<span class="pc__t">' + esc(x.題) + "</span>" +
      '<span class="pc__m">' + esc(x.ひとこと || "") + "</span>" +
      '<span class="pc__f">' +
      '<span class="pc__meta">' + esc(x.教科) + " ・ つまみ " + (x.つまみ.length) + " こ</span>" +
      '<span class="pc__go">ひらく</span>' +
      "</span></span>" +
      '<span class="pc__fav' + (f ? " on" : "") + '" data-plg-fav="' + esc(x.id) + '" role="button" tabindex="0" aria-label="お気に入り">' + svg("星") + "</span>" +
      "</button>";
  }

  /* カードの 中身は プリセットと 同じ 骨に 合わせつつ、
     プレイグラウンド だけの ぶんを 少し 足す。 */
  var 足すCSS2 =
    ".pc__cov{position:absolute;left:14px;right:14px;bottom:12px;display:block;z-index:1;}" +
    ".pc__cov-t{display:block;font-size:19px;font-weight:800;letter-spacing:-.01em;color:hsl(var(--lib-hue,250) 62% 22%);line-height:1.3;}" +
    ".pc__cov-s{display:block;font-size:11px;font-weight:650;color:hsl(var(--lib-hue,250) 40% 34%);margin-top:3px;}" +
    ".pc__b{display:block;padding:12px 14px 13px;}" +
    ".pc__t{display:block;font-size:14px;font-weight:750;color:var(--vq-text,#2B2836);}" +
    ".pc__m{display:block;font-size:12px;font-weight:550;color:var(--vq-text-tertiary,#9994A8);line-height:1.7;margin-top:4px;min-height:2.4em;}" +
    ".pc__f{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:11px;}" +
    ".pc__meta{font-size:11px;font-weight:600;color:var(--vq-text-tertiary,#9994A8);}" +
    ".pc__go{height:30px;padding:0 13px;border-radius:9px;background:var(--vq-accent-subtle,#EFEBFA);color:var(--vq-accent-text,#5F579E);font-size:12px;font-weight:700;display:inline-flex;align-items:center;}" +
    ".pc:hover .pc__go{background:var(--vq-accent,#756DB3);color:#fff;}" +
    ".pc__fav{position:absolute;right:9px;top:9px;width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,.9);color:#7A7490;display:inline-flex;align-items:center;justify-content:center;z-index:3;box-shadow:0 1px 3px rgba(30,20,60,.16);}" +
    ".pc__fav svg{width:16px;height:16px;}" +
    ".pc__fav.on{color:var(--vq-warning,#E5A85F);}.pc__fav.on svg{fill:currentColor;}" +
    ".pgrid.is-list .pc{flex-direction:row;align-items:stretch;}" +
    ".pgrid.is-list .pc__ban{aspect-ratio:auto;width:132px;flex:0 0 auto;}" +
    ".pgrid.is-list .pc__cov-t{font-size:14px;}.pgrid.is-list .pc__cov-s{display:none;}" +
    ".pgrid.is-list .pc__b{flex:1 1 auto;min-width:0;}" +
    ".pgrid.is-list .pc__m{min-height:0;}" +
    "@media (max-width:560px){.pgrid.is-list .pc__ban{width:96px;}.pc__cov-t{font-size:16px;}}";

  function 一覧を描く() {
    var 数え = タブの数(), 出 = 絞る(), 分 = 分野の一覧();
    var タブ = [["all", "すべて"], ["理科", "理科"], ["数学", "数学"], ["社会", "社会"], ["fav", "お気に入り"]];
    var h = '<div class="ph"><div><div class="ph__title">プレイグラウンド</div>' +
      '<div class="ph__sub">理科・数学・社会の しくみを、さわって 確かめる</div></div></div>';

    h += '<div class="toolbar">' +
      '<label class="sbox">' + svg("探") +
      '<input type="search" placeholder="名前・分野・学年で検索" value="' + esc(状態.探) + '" data-plg-q aria-label="検索">' +
      "</label>" +
      '<div class="seg" role="group" aria-label="並び替え">' +
      ["recommended", "おすすめ順", "subject", "教科順", "name", "名前順"].reduce(function (a, v, i, arr) {
        if (i % 2) return a;
        return a + '<button type="button" data-plg-sort="' + arr[i] + '"' + (状態.並び === arr[i] ? ' class="on"' : "") + ">" + esc(arr[i + 1]) + "</button>";
      }, "") +
      "</div>" +
      '<div class="seg" role="group" aria-label="表示">' +
      '<button type="button" data-plg-view="grid"' + (状態.見せ方 === "grid" ? ' class="on"' : "") + ' aria-label="タイル">' + svg("格子") + "</button>" +
      '<button type="button" data-plg-view="list"' + (状態.見せ方 === "list" ? ' class="on"' : "") + ' aria-label="一覧">' + svg("並") + "</button>" +
      "</div></div>";

    h += '<div class="tabs" role="tablist">' + タブ.map(function (t) {
      var n = 数え[t[0]] || 0;
      return '<button class="tab' + (状態.タブ === t[0] ? " on" : "") + '" type="button" role="tab" data-plg-tab="' + t[0] + '">' +
        esc(t[1]) + '<span class="tab__c">' + n + "</span></button>";
    }).join("") + "</div>";

    if (分.length > 1) {
      h += '<div class="chips">' + 分.map(function (s) {
        return '<button class="chip' + (状態.分野 === s ? " on" : "") + '" type="button" data-plg-field="' + esc(s) + '">' + esc(s) + "</button>";
      }).join("") + "</div>";
    }

    var 素 = 状態.タブ === "all" && !状態.分野 && !状態.探.trim() && 状態.並び === "recommended";
    if (素) {
      var 近 = 最近().map(VQPLG.引く).filter(Boolean).slice(0, 3);
      if (近.length) {
        h += '<div class="psec"><div class="psec__h"><div>' +
          '<div class="psec__t">最近ひらいたもの</div><div class="psec__s">続きから 触れます</div></div></div>' +
          '<div class="pgrid">' + 近.map(カード).join("") + "</div></div>";
      }
      教科の並び.forEach(function (k) {
        var 組 = 出.filter(function (x) { return x.教科 === k; });
        if (!組.length) return;
        h += '<div class="psec"><div class="psec__h"><div>' +
          '<div class="psec__t">' + esc(k) + '</div><div class="psec__s">' + 組.length + " こ</div></div>" +
          '<button class="psec__more" type="button" data-plg-tab="' + esc(k) + '">すべて見る</button></div>' +
          '<div class="pgrid">' + 組.slice(0, 8).map(カード).join("") + "</div></div>";
      });
    } else if (出.length) {
      h += '<div class="pgrid' + (状態.見せ方 === "list" ? " is-list" : "") + '">' + 出.map(カード).join("") + "</div>";
    }

    if (!出.length) {
      h += '<div class="empty"><div class="empty__ic">' + svg("探") + "</div>" +
        '<div class="empty__t">見つかりません</div>' +
        '<div class="empty__d">' + (状態.探.trim() ? "別の 言葉で 探して みてください。" : "この 絞りこみに 当てはまる ものが ありません。") + "</div></div>";
    }
    return h;
  }

  /* ══ 舞台 ═══════════════════════════════════════════════════════════ */
  var 台 = null;                                /* いま 走って いる もの */

  function つまみの既定(定義) {
    var c = {};
    定義.つまみ.forEach(function (t) {
      c[t.id] = t.既定 !== undefined ? t.既定
        : t.型 === "入" ? false
          : t.型 === "選" ? (t.選択 && t.選択[0] ? t.選択[0][1] : null)
            : 数(t.最小, 0);
    });
    return c;
  }
  function つまみを描く(定義, c) {
    return 定義.つまみ.map(function (t) {
      var v = c[t.id];
      if (t.型 === "入") {
        return '<div class="knob"><div class="sw' + (v ? " on" : "") + '" data-plg-toggle="' + esc(t.id) + '" role="switch" aria-checked="' + (v ? "true" : "false") + '" tabindex="0">' +
          '<span class="knob__n">' + esc(t.名) + "</span><span class=\"sw__b\"></span></div></div>";
      }
      if (t.型 === "選") {
        return '<div class="knob"><div class="knob__h"><span class="knob__n">' + esc(t.名) + "</span></div>" +
          '<div class="pick">' + (t.選択 || []).map(function (o, i) {
            return '<button type="button" data-plg-pick="' + esc(t.id) + '" data-i="' + i + '"' + (o[1] === v ? ' class="on"' : "") + ">" + esc(o[0]) + "</button>";
          }).join("") + "</div></div>";
      }
      var 最小 = 数(t.最小, 0), 最大 = 数(t.最大, 1), 刻 = 数(t.刻み, (最大 - 最小) / 100);
      return '<div class="knob"><div class="knob__h">' +
        '<span class="knob__n">' + esc(t.名) + "</span>" +
        '<span class="knob__v" data-plg-val="' + esc(t.id) + '">' + 短い数(v) + (t.単位 ? " " + esc(t.単位) : "") + "</span></div>" +
        '<input type="range" min="' + 最小 + '" max="' + 最大 + '" step="' + 刻 + '" value="' + v + '" data-plg-range="' + esc(t.id) + '" aria-label="' + esc(t.名) + '">' +
        "</div>";
    }).join("");
  }

  /* ★ つまみの 値は **引数で** 受ける。ここが 呼ばれる とき 台 は まだ 無い
     （台を作る は canvas が DOM に 入ってからで ないと 作れない ため）。
     台.つまみ を 読むと null 参照で **開いた 瞬間に 落ちる**（実測で 踏んだ）。 */
  function 舞台を描く(定義, c) {
    var 三 = 定義.次元 === "3d";
    return '<div class="stage">' +
      '<div class="stage__main">' +
      '<div class="view" data-plg-view-box>' +
      "<canvas data-plg-canvas></canvas>" +
      (三 ? "" : "") +
      '<canvas class="view__hud" data-plg-hud></canvas>' +
      (三 ? '<div class="view__note">指 1 本で 回す／つまんで 寄る</div>' : "") +
      "</div>" +
      '<div class="side">' +
      (定義.つまみ.length ? '<div class="grp"><div class="grp__t">つまみ</div>' + つまみを描く(定義, c) + "</div>" : "") +
      '<div class="grp" data-plg-reads-box hidden><div class="grp__t">いまの ようす</div><div class="reads" data-plg-reads></div></div>' +
      (定義.グラフ ? '<div class="grp"><div class="grp__t">' + esc(定義.グラフ.名 || "うつりかわり") + '</div><canvas class="chart" data-plg-chart></canvas></div>' : "") +
      (定義.学び.length ? '<div class="grp"><div class="grp__t">わかること</div><ul class="learn">' + 定義.学び.map(function (s) { return "<li>" + 太字(s) + "</li>"; }).join("") + "</ul></div>" : "") +
      "</div></div>" +
      '<div class="bar">' +
      '<button class="btn btn--go" type="button" data-plg-play>' + svg("再生") + '<span data-plg-play-t>はじめる</span></button>' +
      '<button class="btn btn--step" type="button" data-plg-step>' + svg("こま") + "1こま</button>" +
      '<button class="btn btn--reset" type="button" data-plg-reset>' + svg("戻す") + '<span class="btn__t">さいしょから</span></button>' +
      '<span class="bar__sp"></span>' +
      '<div class="spd" role="group" aria-label="はやさ">' +
      [0.25, 0.5, 1, 2].map(function (v) {
        return '<button type="button" data-plg-speed="' + v + '"' + (v === 1 ? ' class="on"' : "") + ">×" + v + "</button>";
      }).join("") + "</div></div></div>";
  }

  /* ══ 走らせる ══════════════════════════════════════════════════════ */
  function 台を作る(定義, box) {
    var cv = box.querySelector("[data-plg-canvas]");
    var hud = box.querySelector("[data-plg-hud]");
    var t = {
      定義: 定義, つまみ: 台 && 台.定義 === 定義 ? 台.つまみ : つまみの既定(定義),
      状: {}, 走る: false, 速さ: 1, 秒: 0, こま: 0,
      g: null, h: null, hg: null, 記録: [], 前: 0, id: 0
    };
    if (定義.次元 === "3d") {
      t.h = 三次元(cv);
      if (!t.h) {
        var d = doc.createElement("div"); d.className = "no3d";
        d.textContent = "この 端末では 3D を 出せません（WebGL が 使えない）。ほかの シミュレーションは 動きます。";
        box.querySelector("[data-plg-view-box]").appendChild(d);
      }
    } else {
      t.g = 二次元(cv); t.g.色 = 色;
    }
    /* 字を 重ねる 板。3D の 上にも 2D の 上にも 使う。 */
    t.hg = 二次元(hud); t.hg.色 = 色;
    return t;
  }

  function 初期化(t) {
    t.状 = {}; t.秒 = 0; t.こま = 0; t.記録 = [];
    try { if (t.定義.はじめ) t.定義.はじめ(t.状, t.つまみ, 道具(t)); } catch (e) { 怒る(e, t); }
  }
  function 道具(t) {
    return { 色: 色, 短い数: 短い数, 挟む: 挟む, 3: !!t.h };
  }
  var 怒った = 0;
  function 怒る(e, t) {
    if (怒った++ < 3) { try { console.warn("[プレイグラウンド] " + (t && t.定義 && t.定義.id) + ": " + (e && e.message || e)); } catch (x) { } }
    if (t) t.走る = false;
  }

  function 一こま(t, dt) {
    try { if (t.定義.進める) t.定義.進める(t.状, t.つまみ, dt, 道具(t)); } catch (e) { 怒る(e, t); return; }
    t.秒 += dt; t.こま++;
    if (t.定義.グラフ && t.定義.グラフ.取る) {
      try {
        var v = t.定義.グラフ.取る(t.状, t.つまみ);
        if (isFinite(v)) { t.記録.push([t.秒, v]); if (t.記録.length > 1200) t.記録.splice(0, 400); }
      } catch (e2) { }
    }
  }
  function 描く(t) {
    try {
      if (t.h) { t.h.始め(色.沈); }
      else if (t.g) { t.g.整える(); t.g.消す(); }
      t.hg.整える(); t.hg.ctx.clearRect(0, 0, t.hg.幅, t.hg.高);
      if (t.定義.描く) t.定義.描く(t.h || t.g, t.状, t.つまみ, t.hg);
    } catch (e) { 怒る(e, t); }
  }

  function 読みを出す(t, root) {
    var 箱 = root.querySelector("[data-plg-reads]");
    var 外 = root.querySelector("[data-plg-reads-box]");
    if (!箱 || !t.定義.読み) return;
    var a;
    try { a = t.定義.読み(t.状, t.つまみ) || []; } catch (e) { return; }
    if (!a.length) { if (外) 外.hidden = true; return; }
    if (外) 外.hidden = false;
    箱.innerHTML = a.map(function (r) {
      return '<div class="read"><div class="read__n">' + esc(r.名) + "</div>" +
        '<div class="read__v">' + esc(typeof r.値 === "number" ? 短い数(r.値) : r.値) +
        (r.単位 ? '<span class="read__u">' + esc(r.単位) + "</span>" : "") + "</div></div>";
    }).join("");
  }
  function グラフを描く(t, root) {
    var cv = root.querySelector("[data-plg-chart]");
    if (!cv || !t.記録.length) return;
    var r = cv.getBoundingClientRect(), d = Math.min(window.devicePixelRatio || 1, 2);
    var W = Math.max(1, Math.round(r.width * d)), H = Math.max(1, Math.round(r.height * d));
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    var x = cv.getContext("2d"); x.setTransform(d, 0, 0, d, 0, 0);
    x.clearRect(0, 0, r.width, r.height);
    var 見 = t.記録.slice(-400);
    var t0 = 見[0][0], t1 = 見[見.length - 1][0] || t0 + 1;
    var lo = Infinity, hi = -Infinity;
    見.forEach(function (p) { if (p[1] < lo) lo = p[1]; if (p[1] > hi) hi = p[1]; });
    if (!(hi > lo)) { hi = lo + 1; lo -= 1; }
    var 余 = (hi - lo) * 0.12; lo -= 余; hi += 余;
    var pad = 6;
    function PX(v) { return pad + (v - t0) / Math.max(1e-6, t1 - t0) * (r.width - pad * 2); }
    function PY(v) { return r.height - pad - (v - lo) / (hi - lo) * (r.height - pad * 2); }
    x.strokeStyle = 色.暗い ? "rgba(255,255,255,.12)" : "rgba(0,0,0,.09)"; x.lineWidth = 1;
    if (lo <= 0 && hi >= 0) { x.beginPath(); x.moveTo(pad, PY(0)); x.lineTo(r.width - pad, PY(0)); x.stroke(); }
    x.strokeStyle = 色.主; x.lineWidth = 2; x.lineJoin = "round"; x.lineCap = "round";
    x.beginPath();
    見.forEach(function (p, i) { var px = PX(p[0]), py = PY(p[1]); if (i) x.lineTo(px, py); else x.moveTo(px, py); });
    x.stroke();
    x.fillStyle = 色.薄字; x.font = "600 10px " + (getComputedStyle(cv).fontFamily || "sans-serif");
    x.textAlign = "left"; x.textBaseline = "top";
    x.fillText(短い数(hi) + (t.定義.グラフ.単位 ? " " + t.定義.グラフ.単位 : ""), 4, 3);
    x.textBaseline = "bottom"; x.fillText(短い数(lo), 4, r.height - 3);
  }

  /* ══ 組み立て ══════════════════════════════════════════════════════ */
  var host = null, root = null, 面 = null, いま = null, 輪 = 0;

  function 建てる() {
    if (host) return;
    host = doc.createElement("div");
    host.id = "vqPlaygroundHost";
    root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    var st = doc.createElement("style");
    /* ★ 一覧の 見た目は vq-screens から 借りる（出どころを 1 つに する）。
       まだ 読めて いない ときでも、足すCSS だけで 形は 崩れない。 */
    st.textContent = (window.__vqScreensCss || "") + 足すCSS + 足すCSS2;
    root.appendChild(st);
    面 = doc.createElement("div"); 面.className = "sheet";
    root.appendChild(面);
    doc.body.appendChild(host);
    色 = 色を作る(面);
    繋ぐ();
  }

  function 一覧へ() {
    いま = null; 止める();
    面.innerHTML =
      '<div class="top">' +
      '<button class="ib" type="button" data-plg-close aria-label="閉じる">' + svg("閉") + "</button>" +
      '<div class="top__t">プレイグラウンド</div>' +
      '<div class="top__s">' + VQPLG.数() + " こ</div>" +
      "</div>" +
      '<div class="body"><div class="wrapp" data-plg-list></div></div>';
    面.querySelector("[data-plg-list]").innerHTML = 一覧を描く();
  }
  function 一覧だけ描き直す() {
    var el = 面 && 面.querySelector("[data-plg-list]");
    if (el) el.innerHTML = 一覧を描く();
  }

  function 舞台へ(id) {
    var 定義 = VQPLG.引く(id);
    if (!定義) return 一覧へ();
    止める();
    いま = 定義; 最近に足す(id);
    面.innerHTML =
      '<div class="top">' +
      '<button class="ib" type="button" data-plg-back aria-label="もどる">' + svg("戻る") + "</button>" +
      '<div class="top__t">' + esc(定義.題) + "</div>" +
      '<div class="top__s">' + esc(定義.分野 || 定義.教科) + "</div>" +
      '<button class="ib" type="button" data-plg-close aria-label="閉じる">' + svg("閉") + "</button>" +
      "</div>" +
      '<div class="body" style="overflow:hidden;position:relative;"></div>';
    var b = 面.querySelector(".body");
    台 = null;
    var 値 = つまみの既定(定義);
    b.innerHTML = 舞台を描く(定義, 値);
    台 = 台を作る(定義, b);
    台.つまみ = 値;
    初期化(台);
    描く(台);
    読みを出す(台, 面);
    触る(b);
    走らせる(true);
  }

  function 走らせる(on) {
    if (!台) return;
    台.走る = on;
    var t = 面.querySelector("[data-plg-play-t]"), b = 面.querySelector("[data-plg-play]");
    if (t) t.textContent = on ? "とめる" : "はじめる";
    if (b) { var s = b.querySelector("svg"); if (s) s.outerHTML = svg(on ? "停止" : "再生"); }
    台.前 = 0;
    if (on && !輪) 輪 = requestAnimationFrame(回す);
  }
  function 止める() {
    if (輪) { cancelAnimationFrame(輪); 輪 = 0; }
    if (台) 台.走る = false;
    台 = null;
  }
  function 回す(now) {
    輪 = 0;
    if (!台) return;
    if (台.走る) {
      var dt = 台.前 ? Math.min(0.05, (now - 台.前) / 1000) : 1 / 60;
      台.前 = now;
      /* 速さは **こまを 増やして** 出す。dt を 大きく すると 計算が 壊れる。 */
      var n = 台.速さ >= 1 ? Math.round(台.速さ) : 1;
      var d2 = 台.速さ < 1 ? dt * 台.速さ : dt;
      for (var i = 0; i < n; i++) 一こま(台, d2);
    }
    描く(台);
    if (台.こま % 6 === 0 || !台.走る) { 読みを出す(台, 面); if (台.定義.グラフ) グラフを描く(台, 面); }
    if (台.走る || 台.再描画) { 台.再描画 = false; 輪 = requestAnimationFrame(回す); }
  }
  function 一度だけ描く() {
    if (!台) return;
    描く(台); 読みを出す(台, 面);
    if (台.定義.グラフ) グラフを描く(台, 面);
  }

  /* ── 指と マウス（3D を 回す・寄る／2D の つまみ）───────────────── */
  function 触る(b) {
    var box = b.querySelector("[data-plg-view-box]");
    if (!box) return;
    var 押 = null, 距 = 0;
    function 点(e) { return { x: e.clientX, y: e.clientY }; }
    box.addEventListener("pointerdown", function (e) {
      if (!台) return;
      box.setPointerCapture && box.setPointerCapture(e.pointerId);
      押 = 点(e); 押.id = e.pointerId;
      if (台.定義.つかむ) {
        var r = box.getBoundingClientRect();
        try { 台.定義.つかむ(台.状, 台.つまみ, { x: e.clientX - r.left, y: e.clientY - r.top }, 台.g); } catch (x) { }
        台.再描画 = true; if (!輪) 輪 = requestAnimationFrame(回す);
      }
    });
    box.addEventListener("pointermove", function (e) {
      if (!押 || !台 || e.pointerId !== 押.id) return;
      var dx = e.clientX - 押.x, dy = e.clientY - 押.y;
      押 = 点(e); 押.id = e.pointerId;
      if (台.h) {
        台.h.目.方位 -= dx * 0.008;
        台.h.目.仰角 = 挟む(台.h.目.仰角 + dy * 0.008, -1.45, 1.45);
      } else if (台.定義.ひく) {
        var r = box.getBoundingClientRect();
        try { 台.定義.ひく(台.状, 台.つまみ, { x: e.clientX - r.left, y: e.clientY - r.top }, 台.g); } catch (x) { }
      }
      台.再描画 = true; if (!輪) 輪 = requestAnimationFrame(回す);
    });
    function 離す(e) {
      if (押 && e.pointerId === 押.id) 押 = null;
      if (台 && 台.定義.はなす) { try { 台.定義.はなす(台.状, 台.つまみ); } catch (x) { } }
    }
    box.addEventListener("pointerup", 離す);
    box.addEventListener("pointercancel", 離す);
    box.addEventListener("wheel", function (e) {
      if (!台 || !台.h) return;
      e.preventDefault();
      台.h.目.距離 = 挟む(台.h.目.距離 * (1 + (e.deltaY > 0 ? 0.12 : -0.12)), 0.6, 200);
      台.再描画 = true; if (!輪) 輪 = requestAnimationFrame(回す);
    }, { passive: false });
    /* つまんで 寄る（2 本指） */
    var 指 = {};
    box.addEventListener("pointerdown", function (e) { 指[e.pointerId] = 点(e); });
    box.addEventListener("pointermove", function (e) {
      if (!指[e.pointerId]) return;
      指[e.pointerId] = 点(e);
      var k = Object.keys(指);
      if (k.length === 2 && 台 && 台.h) {
        var a = 指[k[0]], c = 指[k[1]], d = Math.hypot(a.x - c.x, a.y - c.y);
        if (距) { 台.h.目.距離 = 挟む(台.h.目.距離 * (距 / d), 0.6, 200); 台.再描画 = true; if (!輪) 輪 = requestAnimationFrame(回す); }
        距 = d;
      }
    });
    function 抜く(e) { delete 指[e.pointerId]; if (Object.keys(指).length < 2) 距 = 0; }
    box.addEventListener("pointerup", 抜く);
    box.addEventListener("pointercancel", 抜く);
  }

  /* ── 押した ときの 割り振り ──────────────────────────────────── */
  function 繋ぐ() {
    root.addEventListener("click", function (e) {
      var el = e.target;
      while (el && el !== root && !(el.dataset && Object.keys(el.dataset).some(function (k) { return /^plg/.test(k); }))) el = el.parentNode;
      if (!el || el === root) return;
      var d = el.dataset;
      if (d.plgClose != null) return 閉じる();
      if (d.plgBack != null) return 一覧へ();
      if (d.plgFav != null) { e.stopPropagation(); 好き切替(d.plgFav); 一覧だけ描き直す(); return; }
      if (d.plgOpen != null) return 舞台へ(d.plgOpen);
      if (d.plgTab != null) { 状態.タブ = d.plgTab; 状態.分野 = null; 一覧だけ描き直す(); var bd = 面.querySelector(".body"); if (bd) bd.scrollTop = 0; return; }
      if (d.plgField != null) { 状態.分野 = (状態.分野 === d.plgField) ? null : d.plgField; 一覧だけ描き直す(); return; }
      if (d.plgSort != null) { 状態.並び = d.plgSort; 一覧だけ描き直す(); return; }
      if (d.plgView != null) { 状態.見せ方 = d.plgView; 一覧だけ描き直す(); return; }
      if (!台) return;
      if (d.plgPlay != null) return 走らせる(!台.走る);
      if (d.plgStep != null) { 走らせる(false); 一こま(台, 1 / 60); 一度だけ描く(); return; }
      if (d.plgReset != null) { 初期化(台); 一度だけ描く(); return; }
      if (d.plgSpeed != null) {
        台.速さ = Number(d.plgSpeed) || 1;
        Array.prototype.forEach.call(root.querySelectorAll("[data-plg-speed]"), function (b) { b.classList.toggle("on", b === el); });
        return;
      }
      if (d.plgToggle != null) {
        台.つまみ[d.plgToggle] = !台.つまみ[d.plgToggle];
        el.classList.toggle("on", !!台.つまみ[d.plgToggle]);
        el.setAttribute("aria-checked", 台.つまみ[d.plgToggle] ? "true" : "false");
        つまみが変わった(d.plgToggle); return;
      }
      if (d.plgPick != null) {
        var t = (いま.つまみ || []).filter(function (x) { return x.id === d.plgPick; })[0];
        if (!t) return;
        台.つまみ[d.plgPick] = t.選択[Number(el.dataset.i) || 0][1];
        Array.prototype.forEach.call(root.querySelectorAll('[data-plg-pick="' + d.plgPick + '"]'), function (b) { b.classList.toggle("on", b === el); });
        つまみが変わった(d.plgPick); return;
      }
    });
    root.addEventListener("input", function (e) {
      var el = e.target;
      if (el && el.dataset && el.dataset.plgRange != null && 台) {
        var id = el.dataset.plgRange;
        台.つまみ[id] = Number(el.value);
        var t = (いま.つまみ || []).filter(function (x) { return x.id === id; })[0];
        var v = root.querySelector('[data-plg-val="' + id + '"]');
        if (v) v.textContent = 短い数(台.つまみ[id]) + (t && t.単位 ? " " + t.単位 : "");
        つまみが変わった(id);
        return;
      }
      if (el && el.dataset && el.dataset.plgQ !== undefined) {
        状態.探 = el.value || "";
        clearTimeout(繋ぐ._t);
        繋ぐ._t = setTimeout(function () {
          var 先 = root.activeElement;
          一覧だけ描き直す();
          var q = 面.querySelector("[data-plg-q]");
          if (q) { q.focus(); try { q.setSelectionRange(q.value.length, q.value.length); } catch (x) { } }
        }, 160);
      }
    });
    root.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.stopPropagation(); return いま ? 一覧へ() : 閉じる(); }
      var el = e.target;
      if ((e.key === " " || e.key === "Enter") && el && el.dataset && (el.dataset.plgToggle != null || el.dataset.plgFav != null)) {
        e.preventDefault(); el.click();
      }
    });
    window.addEventListener("resize", function () { if (台) { 台.再描画 = true; if (!輪) 輪 = requestAnimationFrame(回す); } });
  }
  /* つまみが 変わったら「作り直す」か「そのまま 続ける」かは シミュが 決める。
     既定は **作り直す**（長さを 変えたら 最初から が 素直）。 */
  function つまみが変わった(id) {
    if (!台) return;
    var t = (いま.つまみ || []).filter(function (x) { return x.id === id; })[0];
    if (!t || t.続ける !== true) {
      if (いま.つまみで作り直す !== false) 初期化(台);
    }
    台.再描画 = true;
    if (!輪) 輪 = requestAnimationFrame(回す);
    一度だけ描く();
  }

  function 開く(id) {
    建てる();
    色 = 色を作る(面);
    host.setAttribute("data-open", "");
    doc.documentElement.style.overflow = "hidden";
    if (id && VQPLG.引く(id)) 舞台へ(id); else 一覧へ();
  }
  function 閉じる() {
    止める();
    if (host) host.removeAttribute("data-open");
    doc.documentElement.style.overflow = "";
    いま = null;
  }

  window.__vqPlayground = { open: 開く, close: 閉じる, 一覧: function () { return VQPLG.一覧(); } };
})();
