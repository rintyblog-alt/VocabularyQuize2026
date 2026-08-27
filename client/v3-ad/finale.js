/* ══════════════════════════════════════════════════════════════════
   Scene 7 — フィナーレ（78–90s / local 0–12s）
   収束する光の環 → 閃光 → 衝撃波 → 新アイコン誕生 → ブランド → 余韻。

   契約: DESIGN.md §3/§4/§6。書き込みは finale.js / finale.css のみ。
   ・update は冪等 — すべての見た目を local 秒の純関数で決める
     （閃光・呼吸・揺れ・沈み込みも含む。seek しても二度走らない）
   ・乱数は VQAD.rng のみ。build（起動時 1 回）でしか消費しない
   ・アイコンの SVG は毎フレーム触らない。動きは外側の div の transform だけ
     （ラスタライズを使い回して 60fps を守る）

   時間割（local 秒）
     0.00–3.20  収束。光の環 2 本が回りながら半径を縮める
     1.10–3.20  中心に光が溜まる（収束の芯）
     3.16–3.60  環が弾けて消える
     3.14–3.90  閃光（3 段の 1 段目）
     3.20–4.30  衝撃波リング 2 枚（2 段目）
     3.26–4.30  アイコン誕生（3 段目）／ 火花 14 は 5.05 まで尾を引く
     5.40–6.50  ワードマークが 1 文字ずつ
     6.55–7.30  V3 バッジが小さくポップ
     7.25–8.60  タグライン「学ぶを、つくる。」
     8.70–9.95  英字サブ
     9.80–12.0  周辺が沈み、アイコンの発光だけが残る（終端で静止）
   ══════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  var V = window.VQAD;
  var ease = V.ease, span = V.span, lerp = V.lerp;
  var PI2 = Math.PI * 2;
  var TO_DEG = 180 / Math.PI;

  /* ────────────────────────────────────────────────────────────────
     新アイコン SVG（viewBox 0 0 240 240）

     形は利用者の実在ブランドマーク。変えてよいのは「読みやすさ」だけ。
       紫の角丸正方形 / 白いリボン 3 環のロゼット / 中央の V / 右下の尻尾

     ロゼットの幾何（不変）:
       中心 C=(120,122)。3 リングの中心は C から距離 26、
       -90°/150°/30° に配置 → T=(120,96) 上, L=(97.5,135) 左下, R=(142.5,135) 右下。
       各リングは中心線半径 46・外径 59・内径 33 の円環（evenodd）。

     可読性の作り（今回の要点）— すべて「切り抜き（knock-out）」で作る:
       ① V の逃げ: リボン側から V を V_GAP=3 太らせた形で抜く。
          V は常に紫の溝で囲まれ、白いリボンと絶対に接触しない。
          → 最初の 0.3 秒で「V」と読める。V は最前面・最後に描く。
       ② リング同士の逃げ: 下を通る側から、上を通るリングを
          RING_GAP=1.8 太らせた形で抜く。重なりの上下が線で分かり、
          3 本が「絡んだ塊」ではなく「編まれたリボン」に見える。
          T→L→R の描き順＋各 1 枚の逃げマスクだけで、
          L>T・R>L・T>R の循環（ボロミアン）が出る。織りパッチは不要。

     立体処理は最小限:
       厚みは「同じ形を 1.2px 下へずらした暗い版を下敷き」＝下辺 1px の暗い縁だけ。
       ベベル・内側影・落ち影フィルタは持たない。
       **SVG フィルタは 0 個**（feDropShadow も使わない）。ぼかしを伴う
       フィルタをアイコン本体に掛けると 2x で輪郭が甘くなるため。
       発光は背後の別要素（.s7-aura / .s7-icon-glow）が受け持つ。
     ──────────────────────────────────────────────────────────────── */

  var RING_OUT = 59, RING_IN = 33;
  var RING_GAP = 1.8;   /* リング同士の逃げ幅（下を通る側を削る） */
  var V_GAP    = 3.0;   /* V の周りの逃げ幅 */

  /* 円環（ドーナツ）のパス。evenodd で穴を抜く。
     R/r を渡せば「太らせた版」＝逃げ用の形になる */
  function ringD(cx, cy, R, r) {
    R = (R == null) ? RING_OUT : R;
    r = (r == null) ? RING_IN : r;
    return "M " + (cx - R) + " " + cy +
      " a " + R + " " + R + " 0 1 0 " + (R * 2) + " 0" +
      " a " + R + " " + R + " 0 1 0 " + (-R * 2) + " 0 Z " +
      "M " + (cx - r) + " " + cy +
      " a " + r + " " + r + " 0 1 1 " + (r * 2) + " 0" +
      " a " + r + " " + r + " 0 1 1 " + (-r * 2) + " 0 Z";
  }

  /* 中央の V。左腕が太く右腕が細い筆意はブランドの形なので保つ。
     幾何を 1 か所に持ち、本体・厚み・逃げが必ず同じ形になるようにする */
  var V_ARMS = [
    { d: "M 92 90 L 120 158",     w: 25 },  /* 左腕（太）。先端の丸みはこの 1 つだけ */
    { d: "M 148 90 L 120.8 154.7", w: 19 }  /* 右腕（細）。終端を左腕の軸へ寄せ、
                                               丸い端が左腕の中に完全に埋まる位置で止める
                                               （少しでも外れると頂点に瘤が出る） */
  ];
  /* add だけ太らせた V の線。add=V_GAP*2 で「逃げ」になる */
  function vStroke(add, paint) {
    var s = "";
    for (var i = 0; i < V_ARMS.length; i++) {
      s += '<path d="' + V_ARMS[i].d + '" fill="none" stroke="' + paint +
        '" stroke-width="' + (V_ARMS[i].w + add) + '" stroke-linecap="round"/>';
    }
    return s;
  }

  /* 逃げマスク: 全面白から「上を通るリング」と「V」を黒で抜く。
     フィルタではないので輪郭は 2x でも硬いまま */
  function knockMask(id, overD) {
    return '<mask id="' + id + '" maskUnits="userSpaceOnUse" x="0" y="0" width="240" height="240">' +
        '<rect x="0" y="0" width="240" height="240" fill="#ffffff"/>' +
        '<path d="' + overD + '" fill="#000000" fill-rule="evenodd"/>' +
        vStroke(V_GAP * 2, "#000000") +
      '</mask>';
  }

  function iconSvg() {
    var edge  = "rgba(101,91,178,.36)";      /* リング縁の細線（紫寄り） */
    var deep  = "rgba(74,64,140,.55)";       /* リボンの厚み（下辺の暗い縁） */
    var vDeep = "rgba(60,51,124,.46)";       /* V の厚み（逃げの溝に落ちる 1px） */

    var dT = ringD(120, 96), dL = ringD(97.5, 135), dR = ringD(142.5, 135);
    /* 逃げ用に太らせた版（外へ +GAP / 内へ -GAP） */
    var G = RING_GAP;
    var kT = ringD(120, 96, RING_OUT + G, RING_IN - G);
    var kL = ringD(97.5, 135, RING_OUT + G, RING_IN - G);
    var kR = ringD(142.5, 135, RING_OUT + G, RING_IN - G);

    var dTail = "M 189.7 159.1 Q 201.2 173.1 204.2 190.5 Q 187.5 188.6 172.1 178.9 A 53 53 0 0 0 189.7 159.1 Z";
    var dTailEdge = "M 189.7 159.1 Q 201.2 173.1 204.2 190.5 Q 187.5 188.6 172.1 178.9";

    /* 厚み用: 同じ形をわずかに下へ（上から見ると下辺 1px だけ暗い縁が残る） */
    var ext = function (d) {
      return '<path d="' + d + '" fill="' + deep + '" fill-rule="evenodd" transform="translate(0,1.2)"/>';
    };
    var ring = function (d, grad) {
      return '<path d="' + d + '" fill="url(#' + grad + ')" fill-rule="evenodd" ' +
        'stroke="' + edge + '" stroke-width="1"/>';
    };
    return '' +
      '<svg class="s7-icon-svg" viewBox="0 0 240 240" role="img" aria-label="VocabuQuiz V3 アイコン">' +
        '<defs>' +
          /* 角丸正方形の塗り（上→下）。左上が明るく、右下へ落ちる */
          '<linearGradient id="s7gSq" x1="0.12" y1="0" x2="0.86" y2="1">' +
            '<stop offset="0" stop-color="#a29bea"/>' +
            '<stop offset=".52" stop-color="#8b84d9"/>' +
            '<stop offset="1" stop-color="#6f68bd"/>' +
          '</linearGradient>' +
          /* 上辺のごく薄い内側ハイライト（艶を出しすぎない） */
          '<linearGradient id="s7gHi" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0" stop-color="rgba(255,255,255,.10)"/>' +
            '<stop offset=".22" stop-color="rgba(255,255,255,.02)"/>' +
            '<stop offset=".36" stop-color="rgba(255,255,255,0)"/>' +
          '</linearGradient>' +
          /* リボンの面。純白にはしない — 最前面の V（純白）を一段明るく
             見せるため、リボンはわずかにラベンダー側へ寄せる。
             userSpaceOnUse で各リングの上下範囲に固定し、尻尾と継ぎ目なく繋ぐ */
          '<linearGradient id="s7gRibT" x1="120" y1="37" x2="120" y2="155" gradientUnits="userSpaceOnUse">' +
            '<stop offset="0" stop-color="#fbfaff"/>' +
            '<stop offset=".45" stop-color="#ece9fa"/>' +
            '<stop offset="1" stop-color="#d8d4f0"/>' +
          '</linearGradient>' +
          '<linearGradient id="s7gRibS" x1="120" y1="76" x2="120" y2="194" gradientUnits="userSpaceOnUse">' +
            '<stop offset="0" stop-color="#fbfaff"/>' +
            '<stop offset=".45" stop-color="#ece9fa"/>' +
            '<stop offset="1" stop-color="#d8d4f0"/>' +
          '</linearGradient>' +
          /* V の面（純白 → ごく薄い青白。リボンより明確に明るい） */
          '<linearGradient id="s7gV" x1="0" y1="78" x2="0" y2="172" gradientUnits="userSpaceOnUse">' +
            '<stop offset="0" stop-color="#ffffff"/>' +
            '<stop offset="1" stop-color="#f4f2ff"/>' +
          '</linearGradient>' +
          /* 逃げマスク 3 枚。T の上は L、L の上は R、R の上は T（循環） */
          knockMask("s7mT", kL) +
          knockMask("s7mL", kR) +
          knockMask("s7mR", kT) +
        '</defs>' +
        /* 角丸正方形（radius 22%）＋ハイライト＋内側リム */
        '<rect x="3" y="3" width="234" height="234" rx="51.5" fill="url(#s7gSq)"/>' +
        '<rect x="3" y="3" width="234" height="234" rx="51.5" fill="url(#s7gHi)"/>' +
        '<rect x="4.5" y="4.5" width="231" height="231" rx="50" fill="none" stroke="rgba(255,255,255,.09)" stroke-width="1.2"/>' +
        /* ロゼット。各リングは 1 回だけ描き、逃げマスクで上下関係を出す */
        '<g mask="url(#s7mT)">' + ext(dT) + ring(dT, "s7gRibT") + '</g>' +
        '<g mask="url(#s7mL)">' + ext(dL) + ring(dL, "s7gRibS") + '</g>' +
        '<g mask="url(#s7mR)">' +
          ext(dR) + ring(dR, "s7gRibS") +
          /* 吹き出しの尻尾は外径の少し内側 r53 から生やし、R の縁線を
             覆って継ぎ目なく外へ突き出す */
          ext(dTail) +
          '<path d="' + dTail + '" fill="url(#s7gRibS)"/>' +
          '<path d="' + dTailEdge + '" fill="none" stroke="' + edge + '" stroke-width="1"/>' +
        '</g>' +
        /* 中央の V（最前面）。溝の中に 1px の暗い縁だけ落として厚みを出す */
        '<g transform="translate(0,1.2)">' + vStroke(0, vDeep) + '</g>' +
        vStroke(0, "url(#s7gV)") +
      '</svg>';
  }

  /* ────────────────────────────────────────────────────────────────
     シーン本体
     ──────────────────────────────────────────────────────────────── */

  var els = {};      /* build で拾う要素 */
  var rings = [];    /* 収束の光の環 2 本 */
  var shocks = [];   /* 衝撃波リング 2 枚 */
  var sparks = [];   /* 誕生の火花（rng は build 時のみ消費） */
  var kin = {};      /* 1 文字ずつの span 群 */

  /* 同じ値の再代入を避ける（毎フレームの style 文字列 churn 対策） */
  function setStyle(el, key, val) {
    var c = el._s7 || (el._s7 = {});
    if (c[key] !== val) { c[key] = val; el.style[key] = val; }
  }

  V.sceneDefs.push({
    id: "s7",
    order: 7,

    build: function (rootEl) {
      rootEl.innerHTML = '' +
        '<div class="s7-root">' +
          '<div class="s7-settle" aria-hidden="true"></div>' +
          '<div class="s7-orbit" aria-hidden="true">' +
            '<div class="s7-ring s7-ring-a"><i class="s7-ring-dot"></i></div>' +
            '<div class="s7-ring s7-ring-b"><i class="s7-ring-dot"></i></div>' +
          '</div>' +
          '<div class="s7-seed" aria-hidden="true"></div>' +
          '<div class="s7-hero">' +
            '<div class="s7-icon-wrap">' +
              '<div class="s7-aura" aria-hidden="true"></div>' +
              '<div class="s7-icon-glow" aria-hidden="true"></div>' +
              '<div class="s7-icon-tilt">' +
                iconSvg() +
                '<div class="s7-sheen" aria-hidden="true"></div>' +
              '</div>' +
            '</div>' +
            /* 火花はアイコンより後（＝上）に置く。下に置くとアイコンの陰に
               隠れてしまい、飛び散りがまったく見えない */
            '<div class="s7-sparks" aria-hidden="true"></div>' +
            '<div class="s7-brandrow">' +
              '<div class="s7-wordmark"></div>' +
              '<div class="s7-badge">V3</div>' +
            '</div>' +
            '<div class="s7-tagline"></div>' +
            '<div class="s7-sub"></div>' +
          '</div>' +
          '<div class="s7-flash" aria-hidden="true"></div>' +
          '<div class="s7-shock s7-shock-1" aria-hidden="true"></div>' +
          '<div class="s7-shock s7-shock-2" aria-hidden="true"></div>' +
        '</div>';

      var q = function (sel) { return rootEl.querySelector(sel); };
      els.root    = q(".s7-root");
      els.settle  = q(".s7-settle");
      els.seed    = q(".s7-seed");
      els.flash   = q(".s7-flash");
      els.hero    = q(".s7-hero");
      els.icon    = q(".s7-icon-wrap");
      els.tilt    = q(".s7-icon-tilt");
      els.aura    = q(".s7-aura");
      els.glow    = q(".s7-icon-glow");
      els.brand   = q(".s7-brandrow");
      els.word    = q(".s7-wordmark");
      els.badge   = q(".s7-badge");
      els.tagline = q(".s7-tagline");
      els.sub     = q(".s7-sub");

      /* 収束の環。spin は「縮むほど速く回る」ように update 側で加速させる */
      rings = [
        { el: q(".s7-ring-a"), dot: q(".s7-ring-a .s7-ring-dot"), s0: 1.34, s1: 0.30, spin:  720, t0: 0.10, op: 1.00 },
        { el: q(".s7-ring-b"), dot: q(".s7-ring-b .s7-ring-dot"), s0: 1.12, s1: 0.24, spin: -560, t0: 0.30, op: 0.82 }
      ];

      /* 衝撃波: 強い 1 枚＋薄く遅い 1 枚 */
      shocks = [
        { el: q(".s7-shock-1"), t0: 3.20, dur: 0.82, s0: 0.16, s1: 2.30, op: 0.95 },
        { el: q(".s7-shock-2"), t0: 3.34, dur: 1.00, s0: 0.12, s1: 3.00, op: 0.46 }
      ];

      /* 火花: 放射状に等間隔（±少しの揺らぎ）。距離・尾の長さ・色を rng で固定 */
      var host = q(".s7-sparks");
      var N = 14;
      for (var i = 0; i < N; i++) {
        /* 等間隔から大きめに散らす。きれいに並ぶと「放射状クリップアート」に見える */
        var a = (i / N) * PI2 + (V.rng() - 0.5) * 0.9;   /* 放射方向 */
        var d = 130 + V.rng() * 210;                     /* 最終到達距離 px */
        var len = 22 + V.rng() * 48;                     /* 尾の長さ px */
        var dl = V.rng() * 0.13;                         /* 出発の揺らぎ 秒 */
        var life = 1.45 + V.rng() * 0.75;                /* 生存時間 秒 */
        var amp = 0.55 + V.rng() * 0.45;                 /* 明るさの個体差 */
        var el = document.createElement("div");
        el.className = "s7-spark " + (V.rng() < 0.62 ? "s7-spark-a" : "s7-spark-b");
        el.style.height = len.toFixed(1) + "px";
        el.style.marginTop = (-len / 2).toFixed(1) + "px";
        host.appendChild(el);
        sparks.push({
          el: el, dl: dl, d: d, life: life, amp: amp,
          cx: Math.cos(a), cy: Math.sin(a),
          /* 要素の下端（明るい頭）を進行方向へ向ける回転角 */
          deg: (a * TO_DEG - 90).toFixed(2)
        });
      }

      /* コピーは 1 文字ずつ（行ごとフェードは安く見える） */
      kin.word = V.kinSplit(els.word, "VocabuQuiz");
      kin.tag  = V.kinSplit(els.tagline, "学ぶを、つくる。");
      kin.sub  = V.kinSplit(els.sub, "The new flow of learning.");
    },

    update: function (local, dur, api) {
      /* ── シーンの入り。末尾は落とさない（最後の 1 枚で静止するため） ── */
      setStyle(els.root, "opacity", ease.inOut(span(local, -0.45, 0.75)).toFixed(3));

      /* ── 収束: 全宇宙の光を中央の円へ（毎フレーム呼ぶ契約）。
         半径を 0.30 → 0.115 と絞りながら k を上げ、誕生後はほんの少し
         緩めてアイコンの周りを流線が回り続けるようにする ── */
      var cv = ease.inOut(span(local, 0.15, 3.20));
      var relax = ease.out(span(local, 3.20, 4.80));
      api.space.converge(0.5, 0.44, lerp(0.30, 0.115, cv) + 0.05 * relax, cv);

      /* ── 収束する光の環（弾けて消える）── */
      var shrink = span(local, 0, 3.20);
      var spinK = Math.pow(shrink, 1.55);          /* 縮むほど速く回る */
      var burst = ease.out(span(local, 3.16, 3.62));
      for (var r = 0; r < rings.length; r++) {
        var rg = rings[r];
        var s = lerp(rg.s0, rg.s1, ease.inOut(shrink)) * (1 + 1.7 * burst);
        setStyle(rg.el, "transform",
          "rotate(" + (rg.spin * spinK).toFixed(2) + "deg) scale(" + s.toFixed(4) + ")");
        setStyle(rg.el, "opacity",
          (ease.out(span(local, rg.t0, rg.t0 + 0.9)) * (0.5 + 0.5 * shrink) *
            (1 - burst) * rg.op).toFixed(3));
        /* 光点だけは見かけの大きさを保つ（環と一緒に潰れると弱く見える） */
        setStyle(rg.dot, "transform", "scale(" + (1 / s).toFixed(3) + ")");
      }

      /* ── 収束の芯: 環が縮む先で光が溜まり、閃光に食われて消える ── */
      var seedK = ease.inOut(span(local, 1.10, 3.20));
      var seedEat = ease.inOut(span(local, 3.14, 3.36));
      setStyle(els.seed, "opacity", (seedK * 0.86 * (1 - seedEat)).toFixed(3));
      setStyle(els.seed, "transform",
        "translate(-50%,-50%) scale(" + (0.12 + 0.50 * seedK + 0.55 * seedEat).toFixed(3) + ")");

      /* ── 誕生 1: 閃光（local の純関数。1 回だけ強く、すっと引く） ── */
      var fGrow = ease.out(span(local, 3.16, 3.66));
      var fOp = ease.out(span(local, 3.14, 3.24)) * (1 - ease.inOut(span(local, 3.26, 3.90)));
      setStyle(els.flash, "opacity", fOp.toFixed(3));
      setStyle(els.flash, "transform",
        "translate(-50%,-50%) scale(" + (0.18 + 1.18 * fGrow).toFixed(3) + ")");

      /* ── 誕生 2: 衝撃波リング（広がりながら薄くなる） ── */
      for (var sh = 0; sh < shocks.length; sh++) {
        var sk = shocks[sh];
        var sp2 = span(local, sk.t0, sk.t0 + sk.dur);
        var vis2 = (sp2 > 0 && sp2 < 1)
          ? Math.min(1, sp2 / 0.08) * Math.pow(1 - sp2, 1.5) * sk.op : 0;
        setStyle(sk.el, "opacity", vis2.toFixed(3));
        setStyle(sk.el, "transform", "translate(-50%,-50%) scale(" +
          lerp(sk.s0, sk.s1, ease.out(sp2)).toFixed(3) + ")");
      }

      /* ── 誕生 3: アイコン本体。スケール outBack ＋ ぼかし解除 ── */
      var born = ease.outBack(span(local, 3.26, 4.30));
      var iOp = ease.out(span(local, 3.24, 3.62));
      var settle = ease.inOut(span(local, 9.80, 12.0));
      var life = ease.out(span(local, 3.60, 6.00));        /* 生き物らしさの立ち上げ */
      var breath = Math.sin((local - 3.30) * (PI2 / 5.4)); /* 呼吸 -1..1 */
      var iScale = lerp(0.58, 1, born) * (1 + 0.006 * life * breath);
      var iBlur = (1 - span(local, 3.30, 4.15)) * 18;
      setStyle(els.icon, "opacity", iOp.toFixed(3));
      setStyle(els.icon, "transform", "scale(" + iScale.toFixed(4) + ")");
      setStyle(els.icon, "filter", iBlur < 0.05 ? "none" : "blur(" + iBlur.toFixed(2) + "px)");

      /* 揺れ: ±1.5°。終盤は振れ幅を落として静止画で水平に近づける */
      var tiltAmp = 1.5 * life * (1 - 0.72 * settle);
      var floatAmp = 3.2 * life * (1 - 0.6 * settle);
      setStyle(els.tilt, "transform",
        "translateY(" + (floatAmp * Math.sin((local - 3.40) * (PI2 / 6.1) + 1.1)).toFixed(2) + "px)" +
        " rotate(" + (tiltAmp * Math.sin((local - 3.40) * (PI2 / 7.6))).toFixed(3) + "deg)");

      /* 光輪の呼吸。余韻（settle）で少しだけ強まり、最後に残る光になる */
      var pulse = 0.5 + 0.5 * breath;
      setStyle(els.glow, "opacity",
        (iOp * (0.62 + 0.20 * life * pulse + 0.30 * settle)).toFixed(3));
      setStyle(els.aura, "opacity",
        (iOp * (0.50 + 0.26 * life * pulse + 0.34 * settle)).toFixed(3));
      setStyle(els.aura, "transform",
        "scale(" + (0.92 + 0.07 * life * pulse + 0.05 * settle).toFixed(3) + ")");

      /* ── 火花: 放射状に飛び、尾を引いて消える ── */
      for (var i = 0; i < sparks.length; i++) {
        var sp = sparks[i];
        /* 閃光が引いた後まで生き残らせる（早く消すと飛び散りが見えない） */
        var p = span(local, 3.28 + sp.dl, 3.28 + sp.dl + sp.life);
        var e = ease.out(p);
        var vis = (p > 0 && p < 1) ? Math.min(1, p / 0.07) * Math.pow(1 - p, 1.3) * sp.amp : 0;
        setStyle(sp.el, "opacity", vis.toFixed(3));
        setStyle(sp.el, "transform",
          "translate(" + (sp.cx * sp.d * e).toFixed(1) + "px," +
          (sp.cy * sp.d * e).toFixed(1) + "px)" +
          " rotate(" + sp.deg + "deg)" +
          " scaleY(" + (0.28 + 1.15 * (1 - p)).toFixed(3) + ")" +
          " translateY(-50%)");
      }

      /* ── ワードマーク（1 文字ずつ）→ V3 バッジ → タグライン → 英字サブ ──
         tOut を大きく取り、最後まで抜けない（この絵で終わるため） ── */
      V.kinPose(kin.word, local, 5.40, 999, 0.05);
      V.kinPose(kin.tag,  local, 7.25, 999, 0.07);
      V.kinPose(kin.sub,  local, 8.70, 999, 0.026);

      var bp = ease.outBack(span(local, 6.55, 7.30));
      setStyle(els.badge, "opacity", ease.out(span(local, 6.55, 6.95)).toFixed(3));
      setStyle(els.badge, "transform", "scale(" + lerp(0.55, 1, bp).toFixed(3) + ")");

      /* ── 余韻（9.8s〜）: 周辺が沈み、文字がわずかに退き、発光だけが残る ── */
      setStyle(els.settle, "opacity", settle.toFixed(3));
      setStyle(els.brand, "opacity", (1 - 0.10 * settle).toFixed(3));
      setStyle(els.tagline, "opacity", (1 - 0.12 * settle).toFixed(3));
      setStyle(els.sub, "opacity", (1 - 0.16 * settle).toFixed(3));
      setStyle(els.hero, "transform",
        "translateX(-50%)" +
        " translateY(" + (settle * 9).toFixed(2) + "px)" +
        " scale(" + (1 - settle * 0.014).toFixed(4) + ")");
    }
  });
})();
