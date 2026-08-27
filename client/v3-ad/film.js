/* ══════════════════════════════════════════════════════════════════
   VocabuQuiz V3 広告 — フィルム層（DESIGN.md §3 / API: VQAD.initFilm）

   「デジタル臭さ」を消す最後の一枚。#vqad-film キャンバス（stage の上・
   mix-blend-mode: screen）と、その直後に挿し込む 2 枚の DOM 層で構成する。

     canvas   … フィルムグレイン ＋ アナモフィックな光条（screen）
     .film-ca … 色収差のリング ＋ ハレーション（screen）
     .film-vig… 周辺減光（multiply）

   screen 合成では「暗くする」ことができないので、ヴィネットだけは
   multiply の DOM 層で行う（仕様どおり）。

   冪等性の作法（seek・録画・リプレイで絵が変わらないために）:
   ・乱数は初期化時に VQAD.rng からまとめて引く。フレーム中は一切引かない
   ・毎フレームの見た目はすべて tAbs の解析的な関数。積分も内部カウンタも持たない
   ・setTimeout / setInterval / CSS animation を使わない
   性能:
   ・全画素ループ禁止。起動時に作った 128px タイルを pattern で敷くだけ
   ・キャンバスの実解像度は 1920px 幅で頭打ち（グレインの塗りが最大の負荷なので）
   ══════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  var V = window.VQAD;

  /* ── 定数 ─────────────────────────────────────────────────────── */
  var TILE = 128;            /* グレインタイルの一辺（px） */
  var N_TILE = 8;            /* 事前生成するタイル枚数 */
  var GRAIN_A_HI = 0.038;    /* グレインの不透明度（high） */
  var GRAIN_A_LO = 0.030;    /* 同（low。頻度も半分にする） */
  var GRAIN_HZ_HI = 24;      /* 粒の入れ替わり。24Hz にすると映写機の質感になる */
  var GRAIN_HZ_LO = 12;
  /* グレイン塗りの上限解像度。1920 幅 ＝ 映画のグレインプレートと同じ考え方で、
     これ以上細かくしても見えないのに塗り面積だけ増える。縦長（スマホ）でも
     粒が伸びないよう、高さ側にも余裕を持たせる。 */
  var MAX_W = 1920, MAX_H = 1200;
  var MAX_W_LO = 1280, MAX_H_LO = 1100;

  /* 光条（アナモフィック）のアンカー。シーン境界ごとに 1 点。
     x,y は画面比。len は半長（画面幅比）。k は強さ。
     常時出すと安く見えるので、境界の前後 1 秒だけ強く出す。 */
  var ANCHORS = [
    { x: 0.63, y: 0.40, len: 0.52, k: 0.82 },  /* s1 → s2 */
    { x: 0.37, y: 0.57, len: 0.46, k: 0.74 },  /* s2 → s3 */
    { x: 0.58, y: 0.43, len: 0.50, k: 0.80 },  /* s3 → s4 */
    { x: 0.43, y: 0.52, len: 0.45, k: 0.72 },  /* s4 → s5 */
    { x: 0.60, y: 0.37, len: 0.52, k: 0.82 },  /* s5 → s6 */
    { x: 0.50, y: 0.46, len: 0.58, k: 0.88 }   /* s6 → s7 */
  ];
  /* フィナーレのアイコン誕生（finale.js の閃光は local 3.2〜3.95 ＝ 絶対 81.2〜81.95） */
  var FINALE_FLASH = 81.5;
  /* 光条の断面（芯 → 裾）。h=高さ(px) a=芯に対する明るさ */
  var BANDS = [
    { h: 1.4,  a: 1.00 },
    { h: 3.6,  a: 0.40 },
    { h: 8.0,  a: 0.19 },
    { h: 17.0, a: 0.095 },
    { h: 33.0, a: 0.045 }
  ];

  /* ── 小道具 ───────────────────────────────────────────────────── */
  function smooth(a) { return a <= 0 ? 0 : a >= 1 ? 1 : a * a * (3 - 2 * a); }
  /* 立ち上がり rise 秒・減衰 fall 秒の非対称パルス。フィルムの閃光は減衰が長い。 */
  function pulse(t, tc, rise, fall) {
    var u = t - tc;
    if (u <= -rise || u >= fall) return 0;
    return u < 0 ? smooth(1 + u / rise) : smooth(1 - u / fall);
  }
  /* ゆっくりした明滅の素（-1..1）。周期をずらした 3 波なので反復に聞こえない。 */
  function flickerN(t) {
    return Math.sin(t * 2.31) * 0.55
         + Math.sin(t * 5.70 + 1.30) * 0.28
         + Math.sin(t * 11.90 + 2.60) * 0.17;
  }

  /* ══════════════════════════════════════════════════════════════ */
  V.initFilm = function (canvasEl, opts) {
    if (!canvasEl) return null;
    var rand = V.rng, clamp01 = V.clamp01, span = V.span;
    var CFG = V.config;
    var ctx = canvasEl.getContext("2d");
    var reduced = document.documentElement.classList.contains("vqad-rm");

    var W = 0, H = 0;          /* CSS px */
    var cw = 0, ch = 0;        /* 実ピクセル */
    var scale = 1;             /* CSS px → 実ピクセル */
    var quality = "high";

    /* ── DOM 層（ヴィネット・色収差・明滅） ─────────────────────
       canvas の直後へ挿すので、描画順は canvas → 色収差 → ヴィネット。
       ヴィネットは光学的に最後なので必ず一番上。 */
    var caEl = document.createElement("div");
    caEl.className = "vqad-film-ca";
    caEl.setAttribute("aria-hidden", "true");
    var vigEl = document.createElement("div");
    vigEl.className = "vqad-film-vig";
    vigEl.setAttribute("aria-hidden", "true");
    canvasEl.insertAdjacentElement("afterend", caEl);
    caEl.insertAdjacentElement("afterend", vigEl);

    /* ── グレインタイル（起動時に 8 枚だけ作る） ────────────────── */
    var patterns = [], offs = [];
    (function buildTiles() {
      for (var i = 0; i < N_TILE; i++) {
        var c = document.createElement("canvas");
        c.width = TILE; c.height = TILE;
        var cc = c.getContext("2d");
        var img = cc.createImageData(TILE, TILE);
        var d = img.data;
        for (var p = 0; p < d.length; p += 4) {
          var v = rand();
          /* 中央寄せ → 暗部寄りへ。白粒が散ると「汚れ」に見えるので抑える。 */
          var g = Math.pow(v * v * (3 - 2 * v), 1.45) * 255;
          d[p]     = g * 0.95;   /* ごく僅かに寒色へ振る（青の粒は品よく見える） */
          d[p + 1] = g * 0.98;
          d[p + 2] = g;
          d[p + 3] = 255;
        }
        cc.putImageData(img, 0, 0);
        patterns.push(ctx.createPattern(c, "repeat"));
        /* タイルの継ぎ目が同じ位置に出ないよう、枚ごとに位相をずらす */
        offs.push({ x: Math.floor(rand() * TILE), y: Math.floor(rand() * TILE) });
      }
    })();

    /* ── 光条の光点表（時刻から決まる。VQAD.space に頼らない） ──── */
    var bounds = [];
    (function buildBounds() {
      var S = (CFG && CFG.SCENES) || [];
      for (var i = 0; i < S.length - 1; i++) {
        var a = ANCHORS[i] || ANCHORS[ANCHORS.length - 1];
        bounds.push({ t: S[i].end, x: a.x, y: a.y, len: a.len, k: a.k });
      }
    })();

    /* tAbs から「強い光点」を最大 2 つ返す。 */
    var pool = [{ x: 0, y: 0, len: 0, k: 0 }, { x: 0, y: 0, len: 0, k: 0 }, { x: 0, y: 0, len: 0, k: 0 }];
    function lights(t, out) {
      var n = 0, i, k;
      /* 幕開け。1 点だけ柔らかく走らせて「レンズが開いた」ことを伝える */
      k = pulse(t, 1.35, 0.9, 1.7) * 0.42;
      if (k > 0.004) { out[n].x = 0.5; out[n].y = 0.5; out[n].len = 0.5; out[n].k = k; n++; }
      /* シーン境界 */
      for (i = 0; i < bounds.length && n < 3; i++) {
        var b = bounds[i];
        k = pulse(t, b.t, 0.55, 1.15) * b.k;
        if (k > 0.004) { out[n].x = b.x; out[n].y = b.y; out[n].len = b.len; out[n].k = k; n++; }
      }
      /* フィナーレ: 誕生の閃光 ＋ その後の弱い余韻 */
      if (n < 3) {
        var burst = pulse(t, FINALE_FLASH, 0.75, 1.95);
        var rest = span(t, 82.6, 84.6) * (1 - span(t, 87.4, 90)) * 0.20;
        k = burst > rest ? burst : rest;
        if (k > 0.004) { out[n].x = 0.5; out[n].y = 0.44; out[n].len = 0.66; out[n].k = k; n++; }
      }
      /* 常時の気配。レンズの性格として極めて淡く漂わせる（強くすると一気に安い） */
      if (n < 3 && quality === "high") {
        out[n].x = 0.5 + 0.32 * Math.sin(t * 0.21);
        out[n].y = 0.5 + 0.24 * Math.sin(t * 0.147 + 2.1);
        out[n].len = 0.40;
        out[n].k = 0.040 + 0.024 * (0.5 + 0.5 * Math.sin(t * 0.33 + 1.1));
        n++;
      }
      /* 同時に 3 点まで溜まったら、一番弱いものを捨てて 2 点にする */
      if (n === 3) {
        var w = 0;
        if (out[1].k < out[w].k) w = 1;
        if (out[2].k < out[w].k) w = 2;
        if (w !== 2) swap(out, w, 2);
        n = 2;
      }
      return n;
    }
    function swap(a, i, j) { var t = a[i]; a[i] = a[j]; a[j] = t; }

    /* ── 光条を 1 点ぶん描く（lighter 合成・gradient のみ） ──────── */
    function drawStreak(x, y, half, k) {
      var i, g, b, a;
      for (i = 0; i < BANDS.length; i++) {
        b = BANDS[i];
        a = b.a * k;
        if (a < 0.004) continue;
        /* 芯から裾へ一気に落とす。中央が一定の明るさで伸びると
           レンズの光条ではなく「レーザー」に見えて安っぽい。 */
        g = ctx.createLinearGradient(x - half, 0, x + half, 0);
        g.addColorStop(0.00, "rgba(122, 96, 255, 0)");
        g.addColorStop(0.08, "rgba(122, 110, 255, " + (a * 0.008).toFixed(4) + ")");
        g.addColorStop(0.20, "rgba(124, 146, 255, " + (a * 0.035).toFixed(4) + ")");
        g.addColorStop(0.32, "rgba(136, 178, 255, " + (a * 0.110).toFixed(4) + ")");
        g.addColorStop(0.41, "rgba(158, 204, 255, " + (a * 0.300).toFixed(4) + ")");
        g.addColorStop(0.465, "rgba(206, 232, 255, " + (a * 0.660).toFixed(4) + ")");
        g.addColorStop(0.50, "rgba(240, 250, 255, " + a.toFixed(4) + ")");
        g.addColorStop(0.535, "rgba(206, 232, 255, " + (a * 0.660).toFixed(4) + ")");
        g.addColorStop(0.59, "rgba(158, 204, 255, " + (a * 0.300).toFixed(4) + ")");
        g.addColorStop(0.68, "rgba(136, 178, 255, " + (a * 0.110).toFixed(4) + ")");
        g.addColorStop(0.80, "rgba(124, 146, 255, " + (a * 0.035).toFixed(4) + ")");
        g.addColorStop(0.92, "rgba(122, 110, 255, " + (a * 0.008).toFixed(4) + ")");
        g.addColorStop(1.00, "rgba(122, 96, 255, 0)");
        ctx.fillStyle = g;
        ctx.fillRect(x - half, y - b.h * 0.5, half * 2, b.h);
      }
      /* 光点そのもの。芯だけ白く、外周は青へ落とす */
      var r = 24 + 78 * k;
      g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0.00, "rgba(238, 246, 255, " + (0.46 * k).toFixed(4) + ")");
      g.addColorStop(0.32, "rgba(144, 190, 255, " + (0.15 * k).toFixed(4) + ")");
      g.addColorStop(1.00, "rgba(88, 128, 255, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    /* ── リサイズ ─────────────────────────────────────────────── */
    function resize() {
      W = Math.max(1, window.innerWidth);
      H = Math.max(1, window.innerHeight);
      var lo = quality === "low";
      var mw = lo ? MAX_W_LO : MAX_W, mh = lo ? MAX_H_LO : MAX_H;
      /* グレインの塗りが最大の負荷。実解像度に上限を設けて 60fps を守る。 */
      var s = Math.min(window.devicePixelRatio || 1, lo ? 1.25 : 2, mw / W, mh / H);
      scale = Math.max(0.6, s);
      cw = Math.max(1, Math.round(W * scale));
      ch = Math.max(1, Math.round(H * scale));
      canvasEl.width = cw;
      canvasEl.height = ch;
      /* 幅が変わるとタイルの見え方も変わるので、次フレームで塗り直される（状態は持たない） */
    }

    /* ── 毎フレーム ───────────────────────────────────────────── */
    function frame(dt, tAbs) {
      var t = (typeof tAbs === "number" && isFinite(tAbs)) ? tAbs : 0;
      if (!cw || !ch) return;
      var lo = quality === "low";

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      ctx.globalCompositeOperation = "source-over";

      /* ① フィルムグレイン ─ 実ピクセル空間で敷く（粒を最小単位にするため） */
      var hz = lo ? GRAIN_HZ_LO : GRAIN_HZ_HI;
      var idx = reduced ? 0 : Math.floor(t * hz) % N_TILE;
      if (idx < 0) idx += N_TILE;
      var o = offs[idx];
      ctx.globalAlpha = lo ? GRAIN_A_LO : GRAIN_A_HI;
      ctx.translate(o.x, o.y);
      ctx.fillStyle = patterns[idx];
      ctx.fillRect(-o.x, -o.y, cw, ch);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;

      /* ② アナモフィックな光条 ─ CSS px 空間で描く */
      if (!lo && !reduced) {
        var n = lights(t, pool);
        if (n > 0) {
          ctx.setTransform(scale, 0, 0, scale, 0, 0);
          ctx.globalCompositeOperation = "lighter";
          for (var i = 0; i < n; i++) {
            var p = pool[i];
            var k = clamp01(p.k);
            /* 強いほど長く伸びる。長さが一定だと貼り付けたように見える。 */
            drawStreak(p.x * W, p.y * H, W * p.len * (0.55 + 0.45 * k), k);
          }
          ctx.globalCompositeOperation = "source-over";
          ctx.setTransform(1, 0, 0, 1, 0, 0);
        }
      }

      /* ③ 微かな明滅 ─ DOM 層の opacity で（±1.5% 程度・tAbs の純関数） */
      if (!reduced) {
        var f = 0.5 + 0.5 * flickerN(t);
        vigEl.style.opacity = (1 - 0.055 * f).toFixed(4);
        caEl.style.opacity = (0.86 + 0.14 * f).toFixed(4);
      }
    }

    function setQuality(level) {
      quality = level === "low" ? "low" : "high";
      resize();
    }

    /* 省モーションでは明滅を止め、静かな一枚の絵として成立させる */
    if (reduced) {
      vigEl.style.opacity = "0.92";
      caEl.style.opacity = "0.7";
    }

    resize();
    return { resize: resize, frame: frame, setQuality: setQuality };
  };
})();
