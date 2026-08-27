/* ══════════════════════════════════════════════════════════════════════
   design/seed.js — デザイン空間の座標（10 軸）

   ★ ここが「毎回ちがうのに 毎回まとまっている」の土台。
     テーマを 16 個 並べるのではなく、**座標を選ぶ**ようにする。
   ★ 組み合わせ: 24 × 6 × 3 × 24 × 5 × 3 × 3 × 4 × 4 × 4 ≒ 2,986 万通り
   ★ LLM が出してよいのは **この選択肢の中の enum と整数だけ**。
     色コード・書体名・pt・px・座標を LLM に出させない（第 1 原則）。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQD = root.VQD || (root.VQD = {});

  /* ── 軸の定義 ───────────────────────────────────────────────── */
  var HUES = [];
  for (var i = 0; i < 24; i++) HUES.push(i * 15);          /* 0,15,…,345 */

  var AXES = {
    hue: { values: HUES, 印象: "色みそのもの。0=赤 60=黄 120=緑 210=青 270=紫" },
    scheme: {
      values: ["mono", "analogous", "complementary", "split", "triad", "neutral_accent"],
      印象: {
        mono: "1 色だけ。いちばん静かでまとまる",
        analogous: "となり合う色。穏やかで自然",
        complementary: "反対の色。差し色がはっきり立つ",
        split: "反対の両どなり。強いが荒れにくい",
        triad: "三等分。にぎやかで元気",
        neutral_accent: "地は無彩色、差し色だけ有彩。資料向きで硬い"
      }
    },
    mode: {
      values: ["light", "dark", "high_contrast"],
      印象: { light: "明るい地", dark: "暗い地。写真や数字が映える", high_contrast: "白地に濃い字。読みやすさ最優先" }
    },
    fontPair: { values: null, 印象: "書体の組み合わせ（0〜23）。design/font-pairs.js に一覧" },
    typeScale: {
      values: [1.2, 1.25, 1.333, 1.414, 1.5],
      印象: { 1.2: "落差が小さく穏やか", 1.25: "標準", 1.333: "見出しがよく立つ",
              1.414: "劇的", 1.5: "とても劇的。文字数が少ないとき向け" }
    },
    grid: { values: [4, 6, 12], 印象: { 4: "大づかみ", 6: "扱いやすい標準", 12: "細かく割れる" } },
    spacing: { values: ["tight", "normal", "airy"], 印象: { tight: "詰まって情報量が多い", normal: "標準", airy: "余白が広く上品" } },
    shape: {
      values: ["rounded", "sharp", "circular", "angled"],
      印象: { rounded: "やわらかい", sharp: "硬く端正", circular: "まるい。人物や記号向け", angled: "角を落とした個性" }
    },
    accent: {
      values: ["underline", "block", "rule", "none"],
      印象: { underline: "見出しの下に短い線", block: "色の面で強調", rule: "細い罫で仕切る", none: "飾らない" }
    },
    background: {
      values: ["plain", "gradient", "texture", "shapes"],
      印象: { plain: "べた一色", gradient: "ゆるやかな階調", texture: "ごく薄い地紋", shapes: "大きな図形を端に逃がす" }
    }
  };

  var ORDER = ["hue", "scheme", "mode", "fontPair", "typeScale", "grid",
               "spacing", "shape", "accent", "background"];

  function fontPairCount() {
    try { return (VQD.fontPairs || []).length || 24; } catch (e) { return 24; }
  }
  function valuesOf(axis) {
    if (axis === "fontPair") {
      var n = fontPairCount(), a = [];
      for (var i = 0; i < n; i++) a.push(i);
      return a;
    }
    return AXES[axis].values;
  }

  /* ── 形が正しいか（値が選択肢の中にあるか）───────────────────── */
  function isSeed(s) {
    if (!s || typeof s !== "object") return false;
    for (var i = 0; i < ORDER.length; i++) {
      var k = ORDER[i], v = valuesOf(k);
      if (v.indexOf(s[k]) < 0) return false;
    }
    return true;
  }

  /* 足りない軸を既定で埋める（LLM の出力が欠けていても落とさない）。 */
  function normalize(s) {
    var o = {}, src = s || {};
    ORDER.forEach(function (k) {
      var v = valuesOf(k);
      var x = src[k];
      if (k === "hue" && typeof x === "number") x = Math.round(x / 15) * 15 % 360;
      if (k === "typeScale" && typeof x === "number") {
        /* 1.33 のような近い数は いちばん近い段へ寄せる */
        var best = v[0], d = Infinity;
        v.forEach(function (c) { var dd = Math.abs(c - x); if (dd < d) { d = dd; best = c; } });
        x = best;
      }
      if (k === "grid" && typeof x === "number" && v.indexOf(x) < 0) {
        var b2 = v[0], d2 = Infinity;
        v.forEach(function (c) { var dd = Math.abs(c - x); if (dd < d2) { d2 = dd; b2 = c; } });
        x = b2;
      }
      if (k === "fontPair" && typeof x === "number") x = ((Math.round(x) % v.length) + v.length) % v.length;
      o[k] = v.indexOf(x) >= 0 ? x : v[0];
    });
    return o;
  }

  /* ── 文字列にする / 戻す（?seed= と 重複判定に使う）───────────── */
  function encode(s) {
    var n = normalize(s);
    return ORDER.map(function (k) { return valuesOf(k).indexOf(n[k]); }).join("-");
  }
  function decode(str) {
    var a = String(str || "").split("-").map(Number);
    var o = {};
    ORDER.forEach(function (k, i) {
      var v = valuesOf(k);
      var idx = a[i];
      o[k] = (idx >= 0 && idx < v.length) ? v[idx] : v[0];
    });
    return o;
  }

  /* 組み合わせの総数（報告のため） */
  function space() {
    return ORDER.reduce(function (n, k) { return n * valuesOf(k).length; }, 1);
  }

  VQD.seed = {
    AXES: AXES, ORDER: ORDER, valuesOf: valuesOf,
    isSeed: isSeed, normalize: normalize, encode: encode, decode: decode, space: space
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
