/* ══════════════════════════════════════════════════════════════════
   VocabuQuiz V3 広告 — 宇宙背景エンジン（担当 A / DESIGN.md §3）

   far  : 星 3 層（視差・色温度差）＋ムラのある星雲＋右下の地球の弧
   near : ねじれる光のリボン（幹＝ベジェ／繊維＝ガウシアン束）＋深度 3 段の粒子

   この改稿の芯は 3 つ:
   ① 構図が mood ごとに変わる。幹の通り道（始点・終点・振幅・傾き）を
      MOODS に持たせ、setMood のブレンドで「画角が進んでいく」感覚を作る
   ② リボンに厚みと光の当たり方。繊維は中心が密で外へ疎・細・淡く（ガウシアン）、
      さらに幹に沿って幾何的にねじれ、面が正対した所だけ明るくなる
   ③ 粒子に深度。近景は大きく速く尾を引き、遠景は小さく遅く淡い

   冪等性の作法（seek・リプレイ・録画で絵が破綻しないために）:
   ・乱数は初期化時に VQAD.rng からまとめて引く。フレーム中は一切引かない
   ・毎フレームの見た目はすべて tAbs の解析的な関数（積分しない）
   ・surge / mood ブレンドは「呼ばれた時刻を記録して tAbs との差」で計算。
     seek で過去に戻ったら未来の記録は捨てる
   ・shadowBlur は使わない。発光は事前描画スプライト＋ lighter 合成で出す
   ══════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  var V = window.VQAD;
  var PI = Math.PI, PI2 = PI * 2;

  /* ── 定数 ─────────────────────────────────────────────────────── */
  var SEG = 64;             // 幹（ベジェ）の折れ線分割数
  var N_FIBER = 14;         // 幹 1 本あたりの繊維数（low は中心寄りの 6 本だけ描く）
  var N_FIBER_LOW = 6;
  var N_PART = 300;         // 粒子の最大数（low は 100）
  var N_PART_LOW = 100;
  var MOOD_BLEND = 2.0;     // mood ブレンド秒
  var SURGE_DUR = 1.5;      // surge の減衰秒
  var TWIST_N = 1.55;       // 帯が画面を横切る間に何回ねじれるか
  var TWIST_SP = 0.30;      // ねじれが進む速さ（rad/s）。遅いほど「重い」

  /* リボンの基準色（mood の色相シフト＋彩度で締める） */
  var BLUE_A = [79, 141, 255], BLUE_B = [100, 224, 255];   /* #4f8dff → #64e0ff */
  var PINK_A = [255, 45, 146], PINK_B = [180, 77, 255];    /* #ff2d92 → #b44dff */

  /* ── mood パラメータ表 ────────────────────────────────────────────
     すべて数値。setMood は「全キーを線形補間」するので、ここに足した値は
     自動的に 2 秒かけて滑らかに変化する。

     色・光:  b=青の強度 / p=ピンクの強度 / hue=色相シフト(度) / sat=彩度(1で素のまま)
              star=星の明るさ / nebB・nebV=星雲(青系・紫系) / earth=地球の弧
     構図:    sx0,sy0→sx1,sy1 = 幹の通り道の始点・終点（画面比。外は画面外）
              sa1,sa2 = 弦の 1/3・2/3 での法線方向の振れ（正=弦の右手側）
              ssep = 青とピンクを法線方向へ離す量 / sw = 帯の太さ倍率
              pdens = 粒子の密度（主役が UI のシーンでは背景を引く）

     色は「1 面につきアクセント 1 つ」。青とピンクを同じ強さで出すと喧嘩して
     安く見えるので、必ず主従をつける（例: presets は 7:3）。 */
  var MOODS = {
    /* ゆるい水平。画面下寄りを流し、中央のコピーを空けておく */
    calm: {
      b: 0.85, p: 0.30, hue: 0, sat: 0.84, star: 1.00, nebB: 0.95, nebV: 0.70, earth: 0.85,
      sx0: -0.12, sy0: 0.66, sx1: 1.12, sy1: 0.58, sa1: 0.10, sa2: -0.09,
      ssep: 0.030, sw: 1.00, pdens: 0.85
    },
    /* 画面下寄りを大きくうねる。ガラスパネルの後ろを通す */
    presets: {
      b: 1.00, p: 0.42, hue: -5, sat: 0.82, star: 0.80, nebB: 1.00, nebV: 0.55, earth: 0.05,
      sx0: -0.14, sy0: 0.86, sx1: 1.14, sy1: 0.70, sa1: -0.26, sa2: 0.16,
      ssep: 0.045, sw: 1.15, pdens: 1.00
    },
    /* 斜めに上昇。左下から右上へ抜ける */
    mock: {
      b: 0.92, p: 0.30, hue: 8, sat: 0.80, star: 0.78, nebB: 0.80, nebV: 0.85, earth: 0.00,
      sx0: -0.14, sy0: 1.02, sx1: 1.14, sy1: 0.06, sa1: -0.12, sa2: 0.10,
      ssep: 0.040, sw: 0.95, pdens: 0.90
    },
    /* 細く締まって画面外へ抜ける。主役はカードなので背景は引く */
    player: {
      b: 0.60, p: 0.32, hue: 0, sat: 0.78, star: 0.95, nebB: 0.85, nebV: 0.70, earth: 0.00,
      sx0: -0.16, sy0: 0.30, sx1: 1.16, sy1: -0.10, sa1: -0.04, sa2: 0.03,
      ssep: 0.018, sw: 0.48, pdens: 0.45
    },
    /* 柔らかく波打つ。ピンク優勢 */
    speak: {
      b: 0.34, p: 1.00, hue: 5, sat: 0.68, star: 0.82, nebB: 0.55, nebV: 1.10, earth: 0.05,
      sx0: -0.14, sy0: 0.40, sx1: 1.14, sy1: 0.62, sa1: 0.20, sa2: -0.22,
      ssep: 0.050, sw: 1.08, pdens: 0.90
    },
    /* 直線的で理知的。振幅を抑えた右肩上がり */
    insight: {
      b: 1.00, p: 0.24, hue: -12, sat: 0.76, star: 1.00, nebB: 1.05, nebV: 0.55, earth: 0.00,
      sx0: -0.12, sy0: 0.80, sx1: 1.12, sy1: 0.26, sa1: -0.03, sa2: 0.02,
      ssep: 0.022, sw: 0.62, pdens: 0.55
    },
    /* 収束の前段。端点を画面内へ引き込み、全体が中心へ寄る */
    finale: {
      b: 1.00, p: 0.82, hue: 0, sat: 0.78, star: 1.05, nebB: 1.00, nebV: 1.00, earth: 0.85,
      sx0: 0.04, sy0: 0.50, sx1: 0.96, sy1: 0.50, sa1: -0.10, sa2: 0.10,
      ssep: 0.030, sw: 0.85, pdens: 1.00
    }
  };

  /* 帯の胴を作る重ね塗り表 [幅=spread比, alpha, ねじれの明暗の効き]。
     毎フレーム作り直さないようここに置く（GC を出さない）。 */
  var BODY_HI = [[2.20, 0.028, 0.30], [1.30, 0.046, 0.44], [0.78, 0.062, 0.58], [0.36, 0.078, 0.66]];
  var BODY_LOW = [[1.40, 0.048, 0.40], [0.62, 0.076, 0.60]];

  /* 粒子の深度 3 段: 近景は大きく速く明るく少数、遠景は小さく遅く淡く多数 */
  var TIERS = [
    { size: 0.34, spd: 0.45, alpha: 0.40, lat: 1.55, trail: 0 },   /* 遠景 */
    { size: 0.78, spd: 1.00, alpha: 0.80, lat: 1.00, trail: 0 },   /* 中景 */
    { size: 1.75, spd: 1.80, alpha: 1.25, lat: 0.70, trail: 1 }    /* 近景（尾を引く） */
  ];

  /* ── 小道具 ───────────────────────────────────────────────────── */
  function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }
  function mixRgb(a, b, t) {
    return [Math.round(a[0] + (b[0] - a[0]) * t),
            Math.round(a[1] + (b[1] - a[1]) * t),
            Math.round(a[2] + (b[2] - a[2]) * t)];
  }
  /* 彩度を落とす（k=1 で素のまま、0 で無彩色）。色を絞ると高級に見える */
  function desat(rgb, k) {
    if (k == null || k >= 0.999) return rgb;
    var y = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    return [Math.round(y + (rgb[0] - y) * k),
            Math.round(y + (rgb[1] - y) * k),
            Math.round(y + (rgb[2] - y) * k)];
  }
  /* RGB の色相だけを deg 度回す（mood の色相シフト用） */
  function hueShift(rgb, deg) {
    if (!deg) return rgb;
    var r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    var l = (mx + mn) / 2, d = mx - mn, h = 0, s = 0;
    if (d > 0) {
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    h = (h + deg / 360 + 1) % 1;
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    function f(t) {
      t = (t + 1) % 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
  }

  /* ══════════════════════════════════════════════════════════════ */
  V.initSpace = function (farCanvas, nearCanvas, opts) {
    /* 乱数は共通の種固定 rng（index.html で seed 固定済み）。初期化でのみ消費するので
       2 回再生しても同じ絵になる。opts.seed は将来の再シード用に受けるだけ。 */
    var rand = V.rng;
    var lerp = V.lerp, clamp01 = V.clamp01, ease = V.ease;

    var farCtx = farCanvas.getContext("2d");
    var nearCtx = nearCanvas.getContext("2d");

    var W = 0, H = 0, dpr = 1;
    var quality = "high";
    var lastT = 0;                       /* 直近の tAbs（setMood / surge の時刻記録に使う） */
    /* 省モーション: 動きの「速さ」だけ落とす。構図の変化は物語なので残す */
    var rmK = document.documentElement.classList.contains("vqad-rm") ? 0.35 : 1;

    /* 視差（目標値へゆっくり追従。マウス入力なので tAbs 純粋でなくてよい） */
    var parTX = 0, parTY = 0, parX = 0, parY = 0;

    /* ── mood ブレンド状態（切替時刻＋スナップショット方式で冪等） ── */
    var moodTarget = "calm";
    var moodFrom = snapshot(MOODS.calm);
    var moodT0 = -999;
    function snapshot(src) { var o = {}; for (var k in src) o[k] = src[k]; return o; }
    function moodParams(tAbs) {
      var to = MOODS[moodTarget] || MOODS.calm;
      /* 構図の入れ替わりは「長い尾」で。等速や短い ease-out だと安く見える */
      var k = ease.inOut(clamp01((tAbs - moodT0) / MOOD_BLEND));
      var o = {};
      for (var key in to) o[key] = lerp(moodFrom[key], to[key], k);
      return o;
    }

    /* ── surge（呼び出し時刻の列。位相は閉形式の積分で加算 → seek 安全） ── */
    var surges = [];
    function surgeEnvAt(t) {
      var e = 0;
      for (var i = 0; i < surges.length; i++) {
        var u = (t - surges[i].t0) / SURGE_DUR;
        if (u >= 0 && u < 1) e += surges[i].k * (1 - u) * (1 - u);
      }
      return Math.min(1.2, e);
    }
    /* env=(1-u)^2 の 0..u 積分 = (SURGE_DUR/3)*(1-(1-u)^3)。粒子を前へ押す位相。 */
    function surgePhaseAt(t) {
      var ph = 0;
      for (var i = 0; i < surges.length; i++) {
        var u = (t - surges[i].t0) / SURGE_DUR;
        if (u <= 0) continue;
        if (u > 1) u = 1;
        ph += surges[i].k * (SURGE_DUR / 3) * (1 - Math.pow(1 - u, 3));
      }
      return ph;
    }

    /* ── converge 状態（毎フレーム呼ばれる前提。呼ばれなくなったら自然に失効） ── */
    var conv = { x: 0.5, y: 0.5, r: 0.2, k: 0, at: -999 };

    /* ══ 初期化: 星 ══════════════════════════════════════════════
       tint: 0=青白 / 1=中性 / 2=わずかに暖色。単色の星野は平らに見える。 */
    var STAR_LAYERS = [
      { n: 150, par: 0.2, drift: 0.5, smin: 0.5, smax: 1.1, col: "rgb(158,174,214)" },
      { n: 95,  par: 0.5, drift: 1.0, smin: 0.7, smax: 1.6, col: "rgb(186,200,236)" },
      { n: 58,  par: 1.0, drift: 1.7, smin: 0.9, smax: 2.2, col: "rgb(214,226,255)" }
    ];
    var starLayers = [];
    (function buildStars() {
      for (var l = 0; l < STAR_LAYERS.length; l++) {
        var L = STAR_LAYERS[l], arr = [];
        for (var i = 0; i < L.n; i++) {
          var r = rand();
          arr.push({
            x: rand(), y: rand(),
            s: L.smin + rand() * (L.smax - L.smin),
            base: 0.22 + rand() * 0.42,          /* 瞬きの基準 alpha */
            spd: 0.5 + rand() * 1.6,             /* 瞬きの速さ */
            ph: rand() * PI2,                    /* 瞬きの位相 */
            tint: r < 0.62 ? 0 : (r < 0.90 ? 1 : 2)
          });
        }
        starLayers.push(arr);
      }
    })();

    /* ══ 初期化: 星雲 ════════════════════════════════════════════
       平らなガウシアン円は「安い」。縮尺の違う 2〜3 枚を極低 alpha で重ね、
       内部にムラのある雲スプライトを使って厚みを出す。 */
    var NEB_COLORS = [[24, 32, 78], [40, 26, 72], [15, 30, 82]];  /* 深青 / 紫 / 深青 */
    var nebulae = [];
    (function buildNebulae() {
      for (var i = 0; i < 6; i++) {
        nebulae.push({
          bx: 0.12 + rand() * 0.76, by: 0.08 + rand() * 0.72,
          r: 0.34 + rand() * 0.26,                 /* max(W,H) 比の半径 */
          a: 0.085 + rand() * 0.05,                /* 中心 alpha 0.085〜0.135 */
          ci: i % 3,
          vi: (i + 1) % 3,                         /* 内側に重ねる雲の変種 */
          ox: (rand() - 0.5) * 0.22, oy: (rand() - 0.5) * 0.22,  /* 内側の雲のずれ */
          ax: 0.015 + rand() * 0.02, fx: 0.05 + rand() * 0.07, phx: rand() * PI2,
          ay: 0.012 + rand() * 0.018, fy: 0.04 + rand() * 0.06, phy: rand() * PI2
        });
      }
    })();

    /* ══ 初期化: 流線リボンの幹 ══════════════════════════════════
       制御点そのものは MOODS の通り道から毎フレーム組み立てる。
       ここで持つのは「ゆらぎのノイズ」と「繊維の分布」だけ。 */
    function makeNoise() {
      var a = [], b = [], c = [], sum = 0;
      for (var i = 0; i < 3; i++) {
        a[i] = 0.35 + rand() * 0.65;
        b[i] = 0.05 + rand() * 0.20;      /* rad/s。とてもゆっくり */
        c[i] = rand() * PI2;
        sum += a[i];
      }
      return function (t) {
        return (a[0] * Math.sin(b[0] * t + c[0]) +
                a[1] * Math.sin(b[1] * t + c[1]) +
                a[2] * Math.sin(b[2] * t + c[2])) / sum;   /* -1..1 */
      };
    }

    function makeTrunk(sign, c1, c2, dir, rMul, aMul) {
      var t = {
        sign: sign,                   /* 法線方向の side（青 +1 / ピンク -1）→ 交差して絡む */
        aMul: aMul,                   /* 振幅の個体差 */
        c1: c1, c2: c2,               /* グラデ両端色 */
        dir: dir,                     /* converge の巻き付き・回転方向 */
        rMul: rMul,                   /* converge 円の半径倍率（青とピンクで層を分ける） */
        wrap0: rand() * PI2,          /* 巻き付きの初期角 */
        twist0: rand() * PI2,         /* ねじれの初期位相 */
        noise: [],                    /* 制御点 4 つ分のゆらぎ */
        fibers: [],
        px: new Float32Array(SEG + 1), py: new Float32Array(SEG + 1),
        nx: new Float32Array(SEG + 1), ny: new Float32Array(SEG + 1)
      };
      for (var j = 0; j < 4; j++) {
        t.noise.push({
          ax: 0.010 + rand() * 0.016,        /* x のゆらぎ振幅（画面比） */
          ay: (j === 0 || j === 3 ? 0.020 : 0.045) + rand() * 0.018,
          nX: makeNoise(), nY: makeNoise()
        });
      }
      /* 繊維: 等間隔をやめ、中心が密・太・明るく、外へ疎・細・淡くなる分布にする。
         これが「線の束」を「厚みのある帯」に見せる最大の差。 */
      for (var f = 0; f < N_FIBER; f++) {
        var uu = ((f + 0.5) / N_FIBER) * 2 - 1;                       /* -1..1 均等 */
        var pos = (uu < 0 ? -1 : 1) * Math.pow(Math.abs(uu), 1.8);    /* 中心へ寄せる */
        pos += (rand() - 0.5) * 0.09;                                 /* わずかな不揃い */
        var wgt = Math.exp(-(pos * pos) / (2 * 0.42 * 0.42));         /* ガウシアン重み */
        t.fibers.push({
          base: pos,
          wgt: wgt,
          w: 0.55 + wgt * 3.40,                        /* 中心ほど太い（重なって面になる） */
          a: 0.010 + 0.115 * Math.pow(wgt, 2.0),       /* 外周は一気に落とす＝線に見せない */
          wn: 0.5 + rand() * 1.7,                      /* 揺らぎの波数 */
          ws: (0.16 + rand() * 0.34) * (rand() < 0.5 ? -1 : 1),
          wp: rand() * PI2
        });
      }
      /* 中心に近い順に並べ替え。low 品質では先頭 N_FIBER_LOW 本＝芯だけを描ける */
      t.fibers.sort(function (a, b) { return Math.abs(a.base) - Math.abs(b.base); });
      return t;
    }

    var trunks = [
      makeTrunk(1, BLUE_A, BLUE_B, 1, 0.96, 1.00),    /* 青 */
      makeTrunk(-1, PINK_A, PINK_B, -1, 1.12, 0.86)   /* ピンク（鏡写しに交差） */
    ];

    /* ══ 初期化: 幹に沿って流れるグロー粒子 ══════════════════════
       位置は s = frac((tAbs + surge位相)*speed + offset) → 完全に tAbs の関数。
       tier で深度 3 段。rank は mood の pdens による間引き用（tier を偏らせない）。 */
    var particles = [];
    (function buildParticles() {
      for (var i = 0; i < N_PART; i++) {
        var r = rand();
        var tier = r < 0.55 ? 0 : (r < 0.88 ? 1 : 2);
        particles.push({
          trunk: i % 2,
          tier: tier,
          rank: rand(),                     /* 0..1。pdens より大きい粒は消える */
          sp: (0.030 + rand() * 0.062) * TIERS[tier].spd,
          off: rand(),
          lat: (rand() * 2 - 1) * TIERS[tier].lat,   /* 法線方向の基準位置 */
          latW: 0.4 + rand() * 0.6,         /* 横揺れ幅 */
          lf: 0.3 + rand() * 0.8, lp: rand() * PI2,
          size: (2.6 + rand() * 6.4) * TIERS[tier].size,   /* スプライト半径 px */
          aB: (0.22 + rand() * 0.42) * TIERS[tier].alpha,
          tw: 0.8 + rand() * 2.2, tp: rand() * PI2,   /* 明滅 */
          ci: rand() < 0.62 ? 0 : 1,
          oa: rand() * PI2,                 /* converge 軌道の初期角 */
          osp: 0.5 + rand() * 1.4,          /* converge 軌道の角速度 */
          dir: rand() < 0.5 ? -1 : 1
        });
      }
    })();

    /* ══ 初期化: 事前描画スプライト（shadowBlur の代わり） ═══════ */
    function makeGlow(rgb, size) {
      var c = document.createElement("canvas");
      c.width = c.height = size;
      var x = c.getContext("2d");
      var g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      g.addColorStop(0, "rgba(255,255,255,0.82)");
      g.addColorStop(0.16, rgba(rgb, 0.52));
      g.addColorStop(0.42, rgba(rgb, 0.16));
      g.addColorStop(1, rgba(rgb, 0));
      x.fillStyle = g;
      x.fillRect(0, 0, size, size);
      return c;
    }
    function makeSoft(rgb, size) {   /* 星雲の下地（中心→透明のなだらかな球） */
      var c = document.createElement("canvas");
      c.width = c.height = size;
      var x = c.getContext("2d");
      var g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      g.addColorStop(0, rgba(rgb, 1));
      g.addColorStop(0.5, rgba(rgb, 0.32));
      g.addColorStop(1, rgba(rgb, 0));
      x.fillStyle = g;
      x.fillRect(0, 0, size, size);
      return c;
    }
    /* ムラのある雲。小さな柔らかい塊を lighter で重ね、最後に円形マスクで縁を消す。
       模様（縞・ドット）は敷かない。これは「密度のムラ」であって柄ではない。 */
    function makeCloud(rgb, size) {
      var c = document.createElement("canvas");
      c.width = c.height = size;
      var x = c.getContext("2d");
      x.globalCompositeOperation = "lighter";
      for (var i = 0; i < 16; i++) {
        var ang = rand() * PI2;
        var rad = Math.pow(rand(), 0.7) * size * 0.33;
        var bx = size / 2 + Math.cos(ang) * rad;
        var by = size / 2 + Math.sin(ang) * rad;
        var br = size * (0.08 + rand() * 0.20);
        var a = 0.05 + rand() * 0.10;
        var g = x.createRadialGradient(bx, by, 0, bx, by, br);
        g.addColorStop(0, rgba(rgb, a));
        g.addColorStop(1, rgba(rgb, 0));
        x.fillStyle = g;
        x.fillRect(bx - br, by - br, br * 2, br * 2);
      }
      /* ごく細かいムラを撒く。極低 alpha の大きなグラデーションは 8bit で
         縞（バンディング）になるので、これがディザとしても効く。 */
      x.globalCompositeOperation = "lighter";
      x.fillStyle = rgba(rgb, 0.05);
      for (var d = 0; d < 900; d++) {
        var dx = rand() * size, dy = rand() * size;
        var dr = (dx - size / 2) / (size / 2), dq = (dy - size / 2) / (size / 2);
        if (dr * dr + dq * dq > 1) continue;
        x.fillRect(dx, dy, 2, 2);
      }
      x.globalCompositeOperation = "destination-in";
      var m = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      m.addColorStop(0, "rgba(0,0,0,1)");
      m.addColorStop(0.55, "rgba(0,0,0,0.8)");
      m.addColorStop(1, "rgba(0,0,0,0)");
      x.fillStyle = m;
      x.fillRect(0, 0, size, size);
      return c;
    }
    var starSprites = [
      makeGlow([176, 198, 255], 32),   /* 青白 */
      makeGlow([214, 226, 255], 32),   /* 中性 */
      makeGlow([255, 226, 196], 32)    /* わずかに暖色 */
    ];
    var nebSoft = [makeSoft(NEB_COLORS[0], 256), makeSoft(NEB_COLORS[1], 256), makeSoft(NEB_COLORS[2], 256)];
    var nebCloud = [makeCloud(NEB_COLORS[0], 384), makeCloud(NEB_COLORS[1], 384), makeCloud(NEB_COLORS[2], 384)];
    /* 粒子スプライトはあらかじめ少し彩度を落としておく（べた塗りの原色は安い） */
    var trunkSprites = [
      [makeGlow(desat(BLUE_A, 0.82), 96), makeGlow(desat(BLUE_B, 0.82), 96)],
      [makeGlow(desat(PINK_A, 0.70), 96), makeGlow(desat(PINK_B, 0.74), 96)]
    ];

    /* ══ 地球の弧（静的なので resize 時に一度だけ描いておく） ═════ */
    var earthCanvas = null;
    function buildEarth() {
      earthCanvas = earthCanvas || document.createElement("canvas");
      earthCanvas.width = Math.max(1, Math.round(W * dpr));
      earthCanvas.height = Math.max(1, Math.round(H * dpr));
      var c = earthCanvas.getContext("2d");
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, W, H);
      var R = Math.max(W, H) * 0.66;
      var cx = W * 0.94, cy = H + R * 0.60;   /* 中心は画面外の右下 → 縁だけ見える */
      /* 本体: 縁に近い側が薄く明るい深青 */
      var g = c.createRadialGradient(cx - R * 0.25, cy - R * 0.80, R * 0.1, cx, cy, R);
      g.addColorStop(0, "#14295c");
      g.addColorStop(0.45, "#0a1738");
      g.addColorStop(1, "#04060f");
      c.fillStyle = g;
      c.beginPath();
      c.arc(cx, cy, R, 0, PI2);
      c.fill();
      /* 内側のリムハイライト */
      var gi = c.createRadialGradient(cx, cy, R * 0.90, cx, cy, R);
      gi.addColorStop(0, "rgba(120,180,255,0)");
      gi.addColorStop(0.85, "rgba(120,180,255,0.10)");
      gi.addColorStop(1, "rgba(170,220,255,0.34)");
      c.fillStyle = gi;
      c.beginPath();
      c.arc(cx, cy, R, 0, PI2);
      c.fill();
      /* 大気光のリング（内→外でシアン→ピンクへ） */
      c.globalCompositeOperation = "lighter";
      var ga = c.createRadialGradient(cx, cy, R * 0.965, cx, cy, R * 1.055);
      /* 大気は「白に近い光 → 淡い青 → ごく僅かなピンク」。原色のピンクの縁は
         ネオンサインに見えて安いので、白を混ぜて限界まで薄くする。 */
      ga.addColorStop(0, "rgba(150,230,255,0)");
      ga.addColorStop(0.28, "rgba(196,238,255,0.36)");
      ga.addColorStop(0.55, "rgba(110,160,255,0.22)");
      ga.addColorStop(0.80, "rgba(206,130,180,0.09)");
      ga.addColorStop(1, "rgba(206,130,180,0)");
      c.fillStyle = ga;
      c.fillRect(0, 0, W, H);
      /* 縁に沿った色むら: 上寄りにシアン、左下寄りに極淡いピンク */
      spot(c, cx + R * Math.cos(-1.35), cy + R * Math.sin(-1.35), R * 0.38, [130, 210, 255], 0.12);
      spot(c, cx + R * Math.cos(-2.20), cy + R * Math.sin(-2.20), R * 0.34, [214, 132, 178], 0.07);
      c.globalCompositeOperation = "source-over";
    }
    function spot(c, x, y, r, rgb, a) {
      var g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(rgb, a));
      g.addColorStop(1, rgba(rgb, 0));
      c.fillStyle = g;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    }

    /* ══ 疑似ブルーム用の縮小バッファ（quality high のみ使用） ═══ */
    var bloomCanvas = null, bloomCtx = null;
    function buildBloom() {
      bloomCanvas = bloomCanvas || document.createElement("canvas");
      bloomCanvas.width = Math.max(1, Math.round(W * dpr / 4));
      bloomCanvas.height = Math.max(1, Math.round(H * dpr / 4));
      bloomCtx = bloomCanvas.getContext("2d");
    }

    /* ══ resize ═════════════════════════════════════════════════ */
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      if (!W || !H) return;
      farCanvas.width = nearCanvas.width = Math.round(W * dpr);
      farCanvas.height = nearCanvas.height = Math.round(H * dpr);
      buildEarth();
      buildBloom();
    }

    /* ══ 幹の折れ線と法線を「mood の通り道」＋ tAbs から組み立てる ═══
       弦 P0→P3 を引き、その法線方向へ 1/3・2/3 の制御点を振る。
       こうしておくと構図（始点・終点・振幅・傾き）が全部 mood の数値で決まり、
       setMood のブレンドだけで画角が滑らかに変わる。 */
    var cpx = [0, 0, 0, 0], cpy = [0, 0, 0, 0];
    function computeTrunk(tr, mp, tAbs, ek, ccx, ccy, cr) {
      var i;
      var dx = mp.sx1 - mp.sx0, dy = mp.sy1 - mp.sy0;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var nrx = -dy / len, nry = dx / len;        /* 弦の法線（比率空間） */
      var sg = tr.sign;
      var sep = mp.ssep * sg;
      var a1 = mp.sa1 * sg * tr.aMul, a2 = mp.sa2 * sg * tr.aMul;
      /* 制御点（画面比）: 端点は法線方向へ離し、中間 2 点は振幅で振る */
      var bx = [mp.sx0 + nrx * sep,
                mp.sx0 + dx / 3 + nrx * (a1 + sep),
                mp.sx0 + dx * 2 / 3 + nrx * (a2 + sep),
                mp.sx1 + nrx * sep];
      var by = [mp.sy0 + nry * sep,
                mp.sy0 + dy / 3 + nry * (a1 + sep),
                mp.sy0 + dy * 2 / 3 + nry * (a2 + sep),
                mp.sy1 + nry * sep];
      /* ゆっくりしたゆらぎ（構図を壊さない程度） */
      var tn = tAbs * rmK;
      for (i = 0; i < 4; i++) {
        var nz = tr.noise[i];
        cpx[i] = (bx[i] + nz.nX(tn) * nz.ax) * W;
        cpy[i] = (by[i] + nz.nY(tn) * nz.ay) * H;
      }
      for (i = 0; i <= SEG; i++) {
        var u = i / SEG, v = 1 - u;
        /* 3 次ベジェ */
        var x = v * v * v * cpx[0] + 3 * v * v * u * cpx[1] + 3 * v * u * u * cpx[2] + u * u * u * cpx[3];
        var y = v * v * v * cpy[0] + 3 * v * v * u * cpy[1] + 3 * v * u * u * cpy[2] + u * u * u * cpy[3];
        /* converge: フィナーレで円へ巻き付ける（lerp なので冪等） */
        if (ek > 0) {
          var ang = tr.wrap0 + u * PI2 * 1.25 * tr.dir + tAbs * 0.5 * tr.dir;
          x = lerp(x, ccx + Math.cos(ang) * cr * tr.rMul, ek);
          y = lerp(y, ccy + Math.sin(ang) * cr * tr.rMul, ek);
        }
        tr.px[i] = x;
        tr.py[i] = y;
      }
      /* 変形後の折れ線から法線を出す（繊維と粒子のオフセット方向） */
      for (i = 0; i <= SEG; i++) {
        var i0 = i > 0 ? i - 1 : 0, i1 = i < SEG ? i + 1 : SEG;
        var ddx = tr.px[i1] - tr.px[i0], ddy = tr.py[i1] - tr.py[i0];
        var dl = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
        tr.nx[i] = -ddy / dl;
        tr.ny[i] = ddx / dl;
      }
    }

    /* ══ far: 星・星雲・地球 ════════════════════════════════════ */
    function drawFar(tAbs, mp) {
      var c = farCtx;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, W, H);

      /* 星雲: 下地（広い）＋雲（等倍）＋雲（小さくずらす）の 3 枚重ねでムラを作る。
         1 枚のガウシアン円は平らに見える。 */
      c.globalCompositeOperation = "lighter";
      var hi = quality === "high";
      var nebCount = hi ? nebulae.length : 3;
      var maxWH = Math.max(W, H);
      for (var n = 0; n < nebCount; n++) {
        var nb = nebulae[n];
        var weight = nb.ci === 1 ? mp.nebV : mp.nebB;
        if (weight < 0.02) continue;
        var R = nb.r * maxWH;
        var x = (nb.bx + nb.ax * Math.sin(tAbs * nb.fx * rmK + nb.phx)) * W + parX * 10;
        var y = (nb.by + nb.ay * Math.sin(tAbs * nb.fy * rmK + nb.phy)) * H + parY * 8;
        var a0 = nb.a * weight;
        var Rb = R * 1.38;
        c.globalAlpha = Math.min(0.14, a0 * 0.55);
        c.drawImage(nebSoft[nb.ci], x - Rb, y - Rb, Rb * 2, Rb * 2);
        c.globalAlpha = Math.min(0.20, a0);
        c.drawImage(nebCloud[nb.ci], x - R, y - R, R * 2, R * 2);
        if (hi) {
          var Rs = R * 0.60;
          c.globalAlpha = Math.min(0.16, a0 * 0.70);
          c.drawImage(nebCloud[nb.vi], x + nb.ox * R - Rs, y + nb.oy * R - Rs, Rs * 2, Rs * 2);
        }
      }
      c.globalCompositeOperation = "source-over";

      /* 星 3 層（視差＋ごく遅いドリフト。瞬きは sin） */
      for (var l = 0; l < starLayers.length; l++) {
        var L = STAR_LAYERS[l], arr = starLayers[l];
        var count = hi ? arr.length : Math.floor(arr.length * 0.55);
        var shiftX = -tAbs * L.drift * rmK + parX * 18 * L.par;
        var shiftY = parY * 12 * L.par;
        c.fillStyle = L.col;
        for (var i = 0; i < count; i++) {
          var st = arr[i];
          var a = (st.base + 0.35 * Math.sin(tAbs * st.spd * rmK + st.ph)) * mp.star;
          if (a <= 0.02) continue;
          if (a > 1) a = 1;
          var x2 = (st.x * W + shiftX) % W; if (x2 < 0) x2 += W;
          var y2 = (st.y * H + shiftY) % H; if (y2 < 0) y2 += H;
          c.globalAlpha = a;
          if (l === 2) {
            /* 最前層だけグロースプライトで滲ませる（色温度を 3 種持つ） */
            var r = st.s * 2.6;
            c.drawImage(starSprites[st.tint], x2 - r, y2 - r, r * 2, r * 2);
          } else {
            c.fillRect(x2 - st.s / 2, y2 - st.s / 2, st.s, st.s);
          }
        }
      }

      /* 地球の弧（mood で出没。player / insight では完全に引っ込む） */
      if (mp.earth > 0.01 && earthCanvas) {
        c.globalAlpha = Math.min(1, mp.earth * (0.92 + 0.08 * Math.sin(tAbs * 0.25 * rmK)));
        c.drawImage(earthCanvas, parX * 6, parY * 4, W, H);
      }
      c.globalAlpha = 1;
    }

    /* ── 幹に沿った「ねじれの明暗」を持つグラデーション ────────────
       面が正対した所だけ明るい（|cos|）。端は 0 へ落として切り口を消す。
       これが「平らな線」を「光の当たった帯」に変える。 */
    function ribbonGrad(c, tr, c1, c2, phase, depth, baseA) {
      var x0 = tr.px[0], y0 = tr.py[0], x1 = tr.px[SEG], y1 = tr.py[SEG];
      var dx = x1 - x0, dy = y1 - y0;
      if (baseA > 1) baseA = 1;
      if (dx * dx + dy * dy < 16) return rgba(mixRgb(c1, c2, 0.5), baseA * 0.6);
      var g = c.createLinearGradient(x0, y0, x1, y1);
      for (var i = 0; i <= 12; i++) {
        var u = i / 12;
        var wave = (1 - depth) + depth * Math.abs(Math.cos(u * PI2 * TWIST_N + phase));
        /* 端を落とす台形。sin(PI*u) を持ち上げてクランプ */
        var edge = Math.min(1, Math.sin(PI * u) * 2.6);
        var a = baseA * wave * edge;
        if (a > 1) a = 1;
        g.addColorStop(u, rgba(mixRgb(c1, c2, u), a));
      }
      return g;
    }
    function strokeSpine(c, tr) {
      c.beginPath();
      c.moveTo(tr.px[0], tr.py[0]);
      for (var i = 1; i <= SEG; i++) c.lineTo(tr.px[i], tr.py[i]);
      c.stroke();
    }

    /* ══ near: リボン＋粒子＋ブルーム ═══════════════════════════ */
    var sc = { x: 0, y: 0, nx: 0, ny: 0 };   /* 粒子位置の作業用（GC を出さない） */
    function trunkPos(tr, s) {
      s -= Math.floor(s);
      var fi = s * SEG;
      var i0 = Math.min(SEG - 1, Math.floor(fi));
      var fr = fi - i0;
      sc.x = lerp(tr.px[i0], tr.px[i0 + 1], fr);
      sc.y = lerp(tr.py[i0], tr.py[i0 + 1], fr);
      sc.nx = lerp(tr.nx[i0], tr.nx[i0 + 1], fr);
      sc.ny = lerp(tr.ny[i0], tr.ny[i0 + 1], fr);
    }

    function drawNear(tAbs, mp, sEnv) {
      var c = nearCtx;
      var i, u;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, W, H);

      var hi = quality === "high";
      var ek = ease.inOut(conv.k);
      var ccx = conv.x * W, ccy = conv.y * H, cr = conv.r * Math.min(W, H);
      /* 帯の半幅。mood の sw で締めたり広げたり、surge で膨らみ、converge で束ねる */
      var spread = Math.min(W, H) * 0.070 * mp.sw * (1 + 0.7 * sEnv) * (1 - 0.45 * ek);
      var energy = (0.85 + 0.5 * sEnv) * (1 + 0.10 * ek);
      /* 収束時は芯と稜線を弱める。細い高彩度の線＝ネオン看板に見えて安い */
      var convSoft = 1 - 0.55 * ek;
      var twPhase = tAbs * TWIST_SP * rmK;

      c.save();
      c.translate(parX * 26, parY * 18);
      c.globalCompositeOperation = "lighter";
      c.lineCap = "round";
      c.lineJoin = "round";
      c.globalAlpha = 1;

      var fiberCount = hi ? N_FIBER : N_FIBER_LOW;

      for (var t = 0; t < trunks.length; t++) {
        var tr = trunks[t];
        var strength = t === 0 ? mp.b : mp.p;
        /* 粒子が参照するので幹の折れ線は常に計算しておく */
        computeTrunk(tr, mp, tAbs, ek, ccx, ccy, cr);
        if (strength < 0.03) continue;

        /* mood の色相シフト＋彩度を載せる。色は絞るほど高級に見える */
        var c1 = desat(hueShift(tr.c1, mp.hue), mp.sat);
        var c2 = desat(hueShift(tr.c2, mp.hue), mp.sat);
        var ph = twPhase + tr.twist0;
        var E = strength * energy;

        /* ① 胴: 幅を段階的に細めながら alpha を上げる重ね塗り。
           断面に「中心が濃く外へ falloff」ができ、線の束ではなく厚みのある帯になる。
           1 枚の半透明ストロークは平らで安く見える。 */
        var BODY = hi ? BODY_HI : BODY_LOW;
        for (var bI = 0; bI < BODY.length; bI++) {
          c.lineWidth = spread * BODY[bI][0];
          c.strokeStyle = ribbonGrad(c, tr, c1, c2, ph, BODY[bI][2], BODY[bI][1] * E);
          strokeSpine(c, tr);
        }
        /* ④ 芯: 細く明るい。白を多めに混ぜて「原色のベタ」ではなく光に見せる */
        c.lineWidth = 1.7;
        c.strokeStyle = ribbonGrad(c, tr, mixRgb(c1, [255, 255, 255], 0.44),
                                   mixRgb(c2, [255, 255, 255], 0.44), ph, 0.55, 0.26 * E * convSoft);
        strokeSpine(c, tr);

        /* ⑤ 繊維の束: ガウシアン分布 ×「幾何的なねじれ」。
           off = base * cos(ねじれ角) なので、正対で広がり、真横で 1 本に潰れる。
           これで帯が本当にねじれて見える。 */
        var fGrad = ribbonGrad(c, tr, mixRgb(c1, [255, 255, 255], 0.12),
                               mixRgb(c2, [255, 255, 255], 0.12), ph, 0.62, 1.0);
        c.strokeStyle = fGrad;
        for (var f = 0; f < fiberCount; f++) {
          var fb = tr.fibers[f];
          c.lineWidth = fb.w;
          c.globalAlpha = Math.min(1, fb.a * E);
          c.beginPath();
          for (i = 0; i <= SEG; i++) {
            u = i / SEG;
            var envA = Math.pow(Math.sin(u * PI), 0.55);            /* 端で束ねる */
            var ct = Math.cos(u * PI2 * TWIST_N + ph);
            var wob = Math.sin(u * PI2 * fb.wn + fb.wp + tAbs * fb.ws * rmK);
            var off = (fb.base * ct + wob * 0.20 * (1 - fb.wgt)) * spread * envA;
            var x = tr.px[i] + tr.nx[i] * off;
            var y = tr.py[i] + tr.ny[i] * off;
            if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
          }
          c.stroke();
        }

        /* ⑥ 稜線のハイライト: 帯の縁 1 本だけ白く走らせる。
           面に「上辺 1px の高光り」を作るのと同じ理屈。ここが有ると板が物体になる。 */
        c.globalAlpha = 1;
        c.lineWidth = 1.0;
        c.strokeStyle = ribbonGrad(c, tr, mixRgb(c1, [255, 255, 255], 0.72),
                                   mixRgb(c2, [255, 255, 255], 0.72), ph, 0.85, 0.17 * E * convSoft);
        c.beginPath();
        for (i = 0; i <= SEG; i++) {
          u = i / SEG;
          var envB = Math.pow(Math.sin(u * PI), 0.55);
          var ct2 = Math.cos(u * PI2 * TWIST_N + ph);
          var off2 = 0.72 * ct2 * spread * envB;
          var hx = tr.px[i] + tr.nx[i] * off2;
          var hy = tr.py[i] + tr.ny[i] * off2;
          if (i === 0) c.moveTo(hx, hy); else c.lineTo(hx, hy);
        }
        c.stroke();
      }

      /* 粒子: s = frac((tAbs + surge位相)*speed + offset) → ベジェ上へ。
         深度 3 段。近景だけ前フレーム側へ短い残像を置いて速さを見せる。 */
      c.globalAlpha = 1;
      var advance = tAbs + 2.5 * surgePhaseAt(tAbs);
      var pCount = hi ? N_PART : N_PART_LOW;
      for (var p = 0; p < pCount; p++) {
        var pt = particles[p];
        var dens = clamp01((mp.pdens - pt.rank) * 5);       /* 密度で滑らかに間引く */
        if (dens <= 0.01) continue;
        var tr2 = trunks[pt.trunk];
        var str2 = pt.trunk === 0 ? mp.b : mp.p;
        if (str2 < 0.03) continue;
        var s = advance * pt.sp + pt.off;
        var lat = (pt.lat + Math.sin(tAbs * pt.lf * rmK + pt.lp) * pt.latW * 0.5) * spread * 1.35;
        var sMod = s - Math.floor(s);
        var edge = clamp01(Math.min(sMod, 1 - sMod) * 6);   /* 両端で滑らかに消える */
        var a = pt.aB * str2 * dens * (0.65 + 0.35 * Math.sin(tAbs * pt.tw * rmK + pt.tp)) *
                (1 + 0.9 * sEnv) * lerp(edge, 1, ek);
        if (a <= 0.01) continue;
        var r2 = pt.size * (1 + 0.4 * sEnv) * (0.82 + 0.36 * str2);
        var spr = trunkSprites[pt.trunk][pt.ci];
        var tier = TIERS[pt.tier];

        /* 残像 → 本体の順に描く（lighter なので順序は自由だが、意味の順に） */
        var ghosts = (tier.trail && hi) ? 2 : 0;
        for (var gI = ghosts; gI >= 0; gI--) {
          var gs = s - gI * pt.sp * 0.038;                  /* 0.038 秒ぶんだけ後ろへ */
          trunkPos(tr2, gs);
          var gx = sc.x + sc.nx * lat, gy = sc.y + sc.ny * lat;
          if (ek > 0) {
            var oang = pt.oa + tAbs * pt.osp * pt.dir - gI * 0.06 * pt.dir;
            gx = lerp(gx, ccx + Math.cos(oang) * cr, ek);
            gy = lerp(gy, ccy + Math.sin(oang) * cr, ek);
          }
          var ga2 = gI === 0 ? a : a * (gI === 1 ? 0.34 : 0.14);
          var gr = gI === 0 ? r2 : r2 * (gI === 1 ? 0.78 : 0.56);
          c.globalAlpha = Math.min(1, ga2);
          c.drawImage(spr, gx - gr, gy - gr, gr * 2, gr * 2);
        }
      }

      c.restore();

      /* 疑似ブルーム: 1/4 に縮小 → 2 段（等倍＋わずかに拡大）で重ねる。
         広いハローが付くとレンズを通した光に見える（high のみ）。 */
      if (hi && bloomCtx) {
        bloomCtx.clearRect(0, 0, bloomCanvas.width, bloomCanvas.height);
        bloomCtx.drawImage(nearCanvas, 0, 0, bloomCanvas.width, bloomCanvas.height);
        c.globalCompositeOperation = "lighter";
        c.globalAlpha = 0.26;
        c.drawImage(bloomCanvas, 0, 0, W, H);
        c.globalAlpha = 0.14;
        c.drawImage(bloomCanvas, -W * 0.03, -H * 0.03, W * 1.06, H * 1.06);
      }
      c.globalCompositeOperation = "source-over";
      c.globalAlpha = 1;
    }

    /* ══ 毎フレーム ═════════════════════════════════════════════ */
    function frame(dt, tAbs) {
      lastT = tAbs;
      if (!W || !H) return;
      /* 視差の遅い追従（parX/parY は -1..1 のまま。px 係数は描画側で掛ける） */
      var k = 1 - Math.exp(-(dt || 0.016) * 2.5);
      parX += (parTX - parX) * k;
      parY += (parTY - parY) * k;
      /* seek で過去に戻ったら未来の surge 記録を捨てる（冪等性） */
      for (var i = surges.length - 1; i >= 0; i--) {
        if (surges[i].t0 > tAbs + 0.05) surges.splice(i, 1);
      }
      /* converge は毎フレーム呼ばれる契約。呼ばれなくなったら失効させる */
      if (conv.k > 0 && (tAbs - conv.at > 0.25 || conv.at - tAbs > 0.05)) conv.k = 0;

      var mp = moodParams(tAbs);
      var sEnv = surgeEnvAt(tAbs);
      drawFar(tAbs, mp);
      drawNear(tAbs, mp, sEnv);
    }

    /* ══ 公開 API（DESIGN.md §3 の名前を厳守） ══════════════════ */
    var api = {
      resize: resize,
      frame: frame,
      setMood: function (name, snap) {
        if (name === moodTarget || !MOODS[name]) return;
        moodFrom = moodParams(lastT);   /* 今の見た目をスナップショットして 2 秒でブレンド */
        moodTarget = name;
        /* seek 直後（snap）はブレンドせず即時反映する。
           しないと静止スクショに前の mood（地球など）が写り込む（実測 31s）。 */
        moodT0 = snap ? lastT - 999 : lastT;
      },
      surge: function (strength01) {
        var k = clamp01(strength01 == null ? 1 : strength01);
        /* ほぼ同時刻の再突入（seek 戻り→再通過）は上書きして重複加算を防ぐ */
        for (var i = 0; i < surges.length; i++) {
          if (Math.abs(surges[i].t0 - lastT) < 0.5) {
            surges[i].k = Math.max(surges[i].k, k);
            return;
          }
        }
        surges.push({ t0: lastT, k: k });
        if (surges.length > 10) surges.shift();
      },
      converge: function (cx01, cy01, r01, amount01) {
        conv.x = cx01;
        conv.y = cy01;
        conv.r = r01;
        conv.k = clamp01(amount01);
        conv.at = lastT;
      },
      setParallax: function (x, y) {
        parTX = Math.max(-1, Math.min(1, x || 0));
        parTY = Math.max(-1, Math.min(1, y || 0));
      },
      setQuality: function (level) {
        quality = level === "low" ? "low" : "high";
      }
    };

    resize();
    return api;
  };
})();
