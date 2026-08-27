/* ══════════════════════════════════════════════════════════════════════
   design/constraints.js — Seed の禁じ手と、いちばん近い直しかた

   ★ 直しは **計算で完結**させる。LLM に作り直させない（§5.2）。
     違反している軸だけを 1 段ずつずらして、通る組み合わせを探す。
   ★ どの軸をどれだけ動かしたかを必ず返す。黙って直さない。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQD = root.VQD || (root.VQD = {});
  var S = VQD.seed;

  /* 禁じ手。なぜ だめかを 1 行で持つ（説明できない決まりは置かない）。 */
  var 禁 = [
    { id: "grid12_bigscale",
      当たる: function (s) { return s.grid === 12 && s.typeScale >= 1.414; },
      なぜ: "12 列に対して 見出しが大きすぎて 列に収まらない",
      直す: { 軸: "grid", 先: 6 } },
    { id: "grid12_circular",
      当たる: function (s) { return s.grid === 12 && s.shape === "circular"; },
      なぜ: "12 列だと 円にした要素が小さくなりすぎる",
      直す: { 軸: "grid", 先: 6 } },
    { id: "hc_background",
      当たる: function (s) { return s.mode === "high_contrast" && s.background !== "plain"; },
      なぜ: "読みやすさ最優先の面に 模様や階調を敷くと 台無しになる",
      直す: { 軸: "background", 先: "plain" } },
    { id: "mono_noaccent",
      当たる: function (s) { return s.scheme === "mono" && s.accent === "none"; },
      なぜ: "1 色だけで飾りも無いと 強弱が完全に消える",
      直す: { 軸: "accent", 先: "rule" } },
    { id: "texture_tight",
      当たる: function (s) { return s.background === "texture" && s.spacing === "tight"; },
      なぜ: "詰まった余白に地紋が重なると 文字が沈む",
      直す: { 軸: "spacing", 先: "normal" } }
  ];

  function validateSeed(seedIn) {
    var s = S.normalize(seedIn);
    var 破 = 禁.filter(function (r) { return r.当たる(s); })
      .map(function (r) { return { id: r.id, なぜ: r.なぜ }; });
    return { ok: !破.length, 破り: 破, seed: s };
  }

  /* いちばん近い有効な Seed。**1 軸を 1 段ずつ**しか動かさない。 */
  function nearestValidSeed(seedIn) {
    var s = S.normalize(seedIn);
    var 直した = [], 回 = 0;
    while (回 < 24) {
      var 破 = null;
      for (var i = 0; i < 禁.length; i++) if (禁[i].当たる(s)) { 破 = 禁[i]; break; }
      if (!破) break;
      var 軸 = 破.直す.軸, 先 = 破.直す.先;
      var v = S.valuesOf(軸);
      var いま = v.indexOf(s[軸]), さき = v.indexOf(先);
      var 次 = いま === さき ? さき : (いま < さき ? いま + 1 : いま - 1);   /* 1 段だけ */
      var o = {};
      Object.keys(s).forEach(function (k) { o[k] = s[k]; });
      o[軸] = v[次];
      直した.push({ なぜ: 破.なぜ, 軸: 軸, 前: s[軸], 後: o[軸] });
      s = o;
      回++;
    }
    return { seed: s, 直した: 直した, ok: validateSeed(s).ok };
  }

  /* 試験と design-lab のための Seed 生成。
     通るまで引き直すのではなく、**必ず補正して返す**（§5.3）。 */
  function randomSeed(rng) {
    var f = typeof rng === "function" ? rng : Math.random;
    var o = {};
    S.ORDER.forEach(function (k) {
      var v = S.valuesOf(k);
      o[k] = v[Math.floor(f() * v.length) % v.length];
    });
    return nearestValidSeed(o).seed;
  }

  /* 再現できる乱数（試験で同じ 1000 件を作り直せるように） */
  function rngOf(seedNum) {
    var x = (seedNum | 0) || 1;
    return function () {
      x ^= x << 13; x >>>= 0;
      x ^= x >> 17;
      x ^= x << 5; x >>>= 0;
      return x / 4294967296;
    };
  }

  VQD.constraints = {
    禁: 禁, validateSeed: validateSeed, nearestValidSeed: nearestValidSeed,
    randomSeed: randomSeed, rngOf: rngOf
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
