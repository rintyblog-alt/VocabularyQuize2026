/* ══════════════════════════════════════════════════════════════════════
   design/derive.js — Seed → Tokens（計算だけ。LLM はいない）

   ★ **決定的**でなければならない。同じ Seed からは 何度やっても同じ値。
     乱数を使わない。時計を見ない。Seed の中の数だけから決める。
   ★ 色は必ず HSL から作り、**最後にコントラスト比で確かめて明度を直す**。
     「たぶん読める」で出さない。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQD = root.VQD || (root.VQD = {});
  var C = VQD.color;

  /* 必要なコントラスト比（§4.1）。ここを緩めない。 */
  /* ★ 差し色の上に置く文字は **7.0** まで離す（2026-08-17）。
     4.5 だと、番号つきの手順の丸番号（21px）や 比べるカードの見出しのように
     **小さめの文字を色の面に載せる**部品で 読みにくくなる。
     色の面はどこでも使うので、いちばん厳しい所に合わせておく。 */
  var NEED = { body: 7.0, heading: 4.5, onAccent: 7.0, rule: 3.0 };

  /* scheme ごとの色相のずれ [地, 副, 差し色] */
  var OFFSET = {
    mono: [0, 0, 0],
    analogous: [0, 30, -30],
    complementary: [0, 180, 150],
    split: [0, 150, 210],
    triad: [0, 120, 240],
    neutral_accent: [0, 0, 180]
  };

  /* mode ごとの明度の幅と彩度の上限（§4.1）*/
  var MODE = {
    light: { bg: [96, 98], surface: [91, 94], text: [12, 18], satCap: 70 },
    dark: { bg: [10, 14], surface: [17, 21], text: [92, 96], satCap: 60 },
    high_contrast: { bg: [100, 100], surface: [96, 96], text: [6, 9], satCap: 80 }
  };

  /* Seed から **決まった** 0〜n-1 を作る（乱数ではない）。
     幅のある値（bg 96〜98 のどこにするか）を Seed ごとに散らすため。 */
  function 位置(seed, 塩, n) {
    var s = VQD.seed.encode(seed) + "|" + 塩;
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h % n;
  }
  function 幅から(seed, 塩, 範囲) {
    var lo = 範囲[0], hi = 範囲[1];
    if (hi <= lo) return lo;
    return lo + 位置(seed, 塩, hi - lo + 1);
  }

  function derive(seedIn) {
    var seed = VQD.seed.normalize(seedIn);
    var m = MODE[seed.mode];
    var off = OFFSET[seed.scheme];
    var 暗い = seed.mode === "dark";

    var h地 = seed.hue + off[0];
    var h副 = seed.hue + off[1];
    var h差 = seed.hue + off[2];

    /* ── 彩度の決めかた ───────────────────────────────────────
       ★ 地の彩度は必ず低く抑える。「S>60% の面積は 10% 以下」を
         **地で使い切らない**ため（§4.5）。 */
    var 無彩 = seed.scheme === "neutral_accent";
    var 単色 = seed.scheme === "mono";
    var bgS = seed.mode === "high_contrast" ? 0 : (無彩 ? 3 : (4 + 位置(seed, "bgS", 5)));
    var surS = seed.mode === "high_contrast" ? 0 : (無彩 ? 4 : bgS + 3);
    var txtS = seed.mode === "high_contrast" ? 0 : (無彩 ? 6 : 10);
    var 差S = Math.min(m.satCap, 単色 ? 48 : (62 + 位置(seed, "acS", 4) * 4));
    var 副S = 無彩 ? 6 : (単色 ? Math.min(m.satCap, 30) : Math.min(m.satCap, 44 + 位置(seed, "seS", 3) * 5));

    /* ── 地と面 ─────────────────────────────────────────────── */
    var bg = C.hsl(h地, bgS, 幅から(seed, "bgL", m.bg));
    var surface = C.hsl(h地, surS, 幅から(seed, "suL", m.surface));

    /* ── 文字（必ず比で確かめる）───────────────────────────────
       ★ 階調を敷くときは 地が 2 色ある。**両方**に対して満たす。 */
    var 地候補 = seed.background === "gradient" ? [bg, surface] : [bg];
    function 最小比(c) {
      var m2 = Infinity;
      地候補.forEach(function (b) { m2 = Math.min(m2, C.contrast(c, b)); });
      return m2;
    }
    var 本文 = C.fitAll(h地, txtS, 幅から(seed, "txL", m.text), 地候補, NEED.body);
    var 副文L = 暗い ? Math.max(0, C.lightOf(本文.fg) - 22) : Math.min(100, C.lightOf(本文.fg) + 26);
    var 副文 = C.fitAll(h地, txtS, 副文L, 地候補, NEED.heading);

    /* ── 差し色 ───────────────────────────────────────────────
       ① まず 地に対して 3.0 以上（線や帯として見えること）
       ② そのうえで、色の面に文字を置いても 4.5 以上あること */
    /* ★ 地に対して 3.0 ではなく **4.5** を要る（2026-08-17・実測）。
       差し色は「大きな数字」の文字色にも使う。3.0 だと
       数字そのものが読めず、Gate の contrastFail が出ていた。 */
    var 差L = 暗い ? 62 : 46;
    var 差 = C.fitAll(h差, 差S, 差L, 地候補, NEED.heading).fg;
    /* ★ fit が動かした明度を **変数へ戻す**（2026-08-17・実測）。
       戻していなかったので、下の while が 元の明度から作り直し、
       地に対する比が 4.08 まで落ちて metric が読めなくなっていた。 */
    差L = C.lightOf(差);
    var 上文字 = 暗い ? "#111111" : "#ffffff";
    var 回 = 0;
    while (C.contrast(上文字, 差) < NEED.onAccent && 回 < 100) {
      差L = 暗い ? 差L + 1 : 差L - 1;
      if (差L < 0 || 差L > 100) break;
      差 = C.hsl(h差, 差S, 差L);
      回++;
    }
    if (C.contrast(上文字, 差) < NEED.onAccent) 上文字 = C.ink(差);

    /* うすい差し色（カードの地）。**この上に本文を置いても読めること。** */
    var 淡 = C.fit(h差, Math.min(32, Math.round(差S * 0.45)), 暗い ? 25 : 90, 本文.fg, NEED.heading);
    var 淡色 = 淡.fg;
    /* fit は文字側を動かす作りなので、ここでは地として使えるよう
       「本文が読めるか」を見て、だめなら 地から遠い側へ寄せる。 */
    var 回2 = 0;
    var 淡L = 暗い ? 25 : 90;
    淡色 = C.hsl(h差, Math.min(32, Math.round(差S * 0.45)), 淡L);
    /* ★ ここは 4.5 では足りない（2026-08-17・実測）。
       うすい差し色は **カードの地**として使い、その上に 18px の本文を置く。
       本文の決まりは 7.0 なので、7.0 まで離す。 */
    /* ★ 副文（そえ書き）も この上に載る。4.5 を切ると読めない。 */
    while ((C.contrast(本文.fg, 淡色) < NEED.body
            || C.contrast(副文.fg, 淡色) < NEED.heading) && 回2 < 100) {
      淡L = 暗い ? 淡L - 1 : 淡L + 1;
      if (淡L < 0 || 淡L > 100) break;
      淡色 = C.hsl(h差, Math.min(32, Math.round(差S * 0.45)), 淡L);
      回2++;
    }

    /* 副の色（2 本目の系列・補助の図形）。地に対して 3.0 以上。 */
    var 副 = C.fitAll(h副, 副S, 暗い ? 58 : (単色 ? 62 : 52), 地候補, NEED.rule).fg;
    /* 単色のときは 差し色と 副が同じ色相なので、明度で必ず離す。 */
    if (単色 && Math.abs(C.lightOf(副) - C.lightOf(差)) < 14)
      副 = C.hsl(h副, 副S, C.clamp(C.lightOf(差) + (暗い ? -18 : 18), 0, 100));

    /* 罫線。§4.1 の表どおり 地に対して 3.0 以上。 */
    var 罫 = C.fitAll(h地, Math.min(12, bgS + 4), 暗い ? 42 : 62, 地候補, NEED.rule).fg;

    /* ── グラフの色（6 枠・決まった順）─────────────────────────────
       ★ 系列ごとの「見分け」なので、明度だけでなく **色相を離す**。
       ★ 7 本目からは色を作らず「その他」へまとめる（chart.js と同じ考え）。
       ★ どれも 地に対して 3.0 以上（色だけで細い棒を見分けるため）。 */
    var 図色 = [];
    var 回し = 単色 ? 0 : (無彩 ? 26 : 30);
    for (var gi = 0; gi < 6; gi++) {
      var gh = h差 + (gi % 2 ? 回し * Math.ceil(gi / 2) : -回し * (gi / 2));
      var gs = Math.min(m.satCap, 差S - (gi % 3) * 8);
      var gl = (暗い ? [62, 74, 50, 68, 44, 80] : [46, 34, 58, 26, 66, 40])[gi];
      if (単色) { gs = Math.min(m.satCap, 44); gl = (暗い ? [70, 58, 46, 34, 82, 26] : [30, 42, 54, 66, 22, 74])[gi]; }
      図色.push(C.fitAll(gh, gs, gl, 地候補, NEED.rule).fg);
    }

    /* ── 文字の大きさ（本文 18pt を軸に typeScale の累乗）───────── */
    var r = seed.typeScale;
    var 字 = {
      caption: Math.max(14, Math.round(18 / r)),
      body: 18,
      h3: Math.round(18 * r),
      h2: Math.round(18 * Math.pow(r, 2)),
      h1: Math.round(18 * Math.pow(r, 3)),
      display: Math.round(18 * Math.pow(r, 4))
    };
    function 行間(size) { return size < 20 ? 1.7 : (size < 36 ? 1.4 : 1.15); }

    /* ── 余白（4px グリッド・8 を単位に）───────────────────────── */
    var unit = 8;
    var mult = { tight: 0.75, normal: 1.0, airy: 1.4 }[seed.spacing];
    var 間 = {
      unit: unit,
      slideMargin: Math.round(unit * 6 * mult),
      blockGap: Math.round(unit * 3 * mult),
      inlineGap: Math.round(unit * 1.5 * mult),
      gutter: Math.round(unit * 2 * mult)
    };

    /* ── 形 ─────────────────────────────────────────────────── */
    var 形 = { kind: seed.shape, radius: 0, cut: 0, 円で切る: false };
    if (seed.shape === "rounded") 形.radius = unit * 1.5;
    else if (seed.shape === "sharp") 形.radius = 0;
    else if (seed.shape === "circular") { 形.radius = 9999; 形.円で切る = true; }
    else if (seed.shape === "angled") { 形.radius = 0; 形.cut = unit * 2; }

    /* ── 地の作り（背景）───────────────────────────────────────
       ★ 濃い色（S>60%）で塗ってよいのは 画面の 10% まで。
         ここでは **淡い色しか使わない**ので、地では使い切らない。 */
    var 角度 = (seed.hue * 7) % 360;
    var 背 = { kind: seed.background, 角度: 角度 };
    if (seed.background === "gradient") { 背.from = bg; 背.to = surface; }
    if (seed.background === "texture") { 背.色 = 罫; 背.濃さ = (3 + 位置(seed, "tx", 3)) / 100; 背.間隔 = 24 + 位置(seed, "tx2", 3) * 8; }
    if (seed.background === "shapes") { 背.色 = 淡色; 背.向き = 位置(seed, "sh", 4); }

    return {
      seed: seed,
      seedKey: VQD.seed.encode(seed),
      color: {
        bg: bg, surface: surface,
        textPrimary: 本文.fg, textSecondary: 副文.fg, textOnAccent: 上文字,
        accent: 差, accentSoft: 淡色, secondary: 副,
        border: 罫, shadowColor: 暗い ? "rgba(0,0,0,.55)" : "rgba(15,23,42,.10)",
        chart: 図色
      },
      type: {
        pair: seed.fontPair,
        stack: {
          display: VQD.fonts.stack(seed.fontPair, "display"),
          body: VQD.fonts.stack(seed.fontPair, "body"),
          mono: VQD.fonts.stack(seed.fontPair, "mono")
        },
        weight: VQD.fonts.of(seed.fontPair).weightRange,
        size: 字, 行間: 行間,
        字間: { display: -0.02, heading: -0.01, body: 0, 和文本文: 0.02 }
      },
      space: 間, shape: 形, background: 背, grid: seed.grid,
      比: {
        本文: 最小比(本文.fg),
        見出し: 最小比(本文.fg),
        副文: 最小比(副文.fg),
        差し色の上の文字: C.contrast(上文字, 差),
        差し色と地: 最小比(差),
        うすい差し色の上の本文: C.contrast(本文.fg, 淡色),
        うすい差し色の上の副文: C.contrast(副文.fg, 淡色),
        罫線: 最小比(罫),
        地の候補: 地候補
      }
    };
  }

  /* できあがった Tokens が 決まりを守れているか（試験と Gate が使う） */
  function 確かめ(t) {
    var 悪 = [];
    if (t.比.本文 < NEED.body) 悪.push("本文と地の比が " + t.比.本文.toFixed(2) + "（要 7.0）");
    if (t.比.副文 < NEED.heading) 悪.push("副文と地の比が " + t.比.副文.toFixed(2) + "（要 4.5）");
    if (t.比.差し色の上の文字 < NEED.onAccent) 悪.push("差し色の上の文字が " + t.比.差し色の上の文字.toFixed(2) + "（要 4.5）");
    if (t.比.罫線 < NEED.rule) 悪.push("罫線と地の比が " + t.比.罫線.toFixed(2) + "（要 3.0）");
    if (t.比.差し色と地 < NEED.heading) 悪.push("差し色と地の比が " + t.比.差し色と地.toFixed(2) + "（要 4.5）");
    if (t.比.うすい差し色の上の本文 < NEED.body) 悪.push("うすい差し色の上の本文が " + t.比.うすい差し色の上の本文.toFixed(2) + "（要 7.0）");
    if (t.比.うすい差し色の上の副文 < NEED.heading) 悪.push("うすい差し色の上の副文が " + t.比.うすい差し色の上の副文.toFixed(2) + "（要 4.5）");
    /* 地と面の彩度が高いと 画面いっぱいが濃い色になる */
    [["地", t.color.bg], ["面", t.color.surface], ["うすい差し色", t.color.accentSoft]].forEach(function (p) {
      if (VQD.color.satOf(p[1]) > 60) 悪.push(p[0] + "の彩度が " + Math.round(VQD.color.satOf(p[1])) + "%（60% 超は広い面に使えない）");
    });
    return 悪;
  }

  VQD.derive = derive;
  VQD.deriveCheck = 確かめ;
  VQD.NEED = NEED;
})(typeof globalThis !== "undefined" ? globalThis : this);
