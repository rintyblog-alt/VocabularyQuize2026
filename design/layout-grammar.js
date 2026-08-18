/* ══════════════════════════════════════════════════════════════════════
   design/layout-grammar.js — レイアウトを「一覧」ではなく「割りかた」で持つ

   ★ 固定のレイアウト一覧を作らない。作った瞬間にテンプレになる。
     持つのは **分割の規則** だけ。
   ★ direction の意味をここで決めておく（あとで取り違えないため）:
       vertical   … 上下に積む（分割線が横に走る）
       horizontal … 左右に並べる（分割線が縦に走る）
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQD = root.VQD || (root.VQD = {});

  /* 許す比。ここに無い比は使わせない（目分量の比を作らせない）。 */
  var RATIOS = [
    /* ★ 1 分割のときの比 [1] を入れておく（2026-08-17・実測）。
       指示書の一覧には無いが、分割数 1 は許しているので
       これが無いと「許していない比」で 1 分割が すべて弾かれる。 */
    [1],
    [1, 1], [1, 2], [2, 1], [2, 3], [3, 2], [1, 1.618], [1.618, 1],
    [1, 1, 1], [1, 2, 1], [1, 1, 1, 1]
  ];
  function ratioKey(r) { return (r || []).join(":"); }
  var RATIO_KEYS = RATIOS.map(ratioKey);

  /* ★ 部品を増やした（2026-08-17・訴え「素人感が否めない・機能を増やして」）。
     text / 図形 / 線 / 矢印 / 表 / グラフ / 大きな数字 の 7 つだけでは
     「文字を置いただけ」の資料にしかならなかった。
     資料でよく使う **かたまり**を 役目として足す。
     どれも 既存の部品の組み合わせなので、アプリ側の変更は要らない。 */
  var ROLES = ["heading", "subheading", "body", "bullets", "image", "diagram",
               "metric", "quote", "table", "chart", "spacer",
               "steps",    /* 番号つきの手順（丸番号＋見出し＋説明） */
               "compare",  /* 2 つを 並べて比べるカード */
               "kpi",      /* 大きな数字を 2〜4 個 並べる */
               "callout",  /* 囲みの強調（ひとこと） */
               "timeline", /* 横軸の年表（線＋点＋ラベル） */
               "section"   /* セクションの扉（大きな番号＋見出し） */];
  /* 声からは写真を入れられない。**入れられないものを選ばせない。** */
  var ROLES_使える = ROLES.filter(function (r) { return r !== "image"; });

  var ALIGNS = ["start", "center", "end"];
  var EMPH = ["primary", "secondary", "tertiary"];
  var GRAVITY = ["left", "center", "asymmetric"];
  var DIRECTION = ["vertical", "horizontal"];

  /* ページの役目。自由記述にしない（§10）。 */
  var PURPOSES = ["title", "agenda", "problem", "solution", "concept", "target",
                  "method", "process", "timeline", "budget", "data", "comparison",
                  "case", "team", "risk", "metric", "quote", "detail",
                  "summary", "cta", "closing", "question"];

  /* 大きな面を必要とする役目（比の 0.4 以上を占めること） */
  var 大きく要る = ["table", "chart", "diagram", "image",
                    "steps", "compare", "kpi", "timeline"];

  function 正規化(spec) {
    var s = spec || {};
    var p = s.partition || {};
    var count = Math.max(1, Math.min(4, parseInt(p.count, 10) || 1));
    var dir = DIRECTION.indexOf(p.direction) >= 0 ? p.direction : "vertical";
    var ratio = Array.isArray(p.ratio) ? p.ratio.map(Number) : null;
    if (!ratio || ratio.length !== count || RATIO_KEYS.indexOf(ratioKey(ratio)) < 0) {
      /* 数が合わない比は 同じ長さの許した比のうち いちばん先頭のものへ寄せる */
      var 候補 = RATIOS.filter(function (r) { return r.length === count; });
      ratio = 候補.length ? 候補[0].slice() : [1];
    }
    var slots = (Array.isArray(s.slots) ? s.slots : []).slice(0, count).map(function (x) {
      x = x || {};
      return {
        role: ROLES.indexOf(x.role) >= 0 ? x.role : "body",
        align: ALIGNS.indexOf(x.align) >= 0 ? x.align : "start",
        emphasis: EMPH.indexOf(x.emphasis) >= 0 ? x.emphasis : "secondary"
      };
    });
    while (slots.length < count) slots.push({ role: "body", align: "start", emphasis: "secondary" });
    var gravity = GRAVITY.indexOf(s.gravity) >= 0 ? s.gravity : "left";
    if (count === 1 && gravity === "asymmetric") gravity = "left";
    /* spacer は必ず三次 */
    slots.forEach(function (x) { if (x.role === "spacer") x.emphasis = "tertiary"; });
    /* ★ **全部 spacer のページは作らせない**（2026-08-17・実測）。
       中身が 1 つも無い＝白紙のページ。Gate は spacer を空とみなさないので
       素通りし、多様性の直しでも候補が 1 つも作れず 詰まっていた。 */
    if (slots.length && slots.every(function (x) { return x.role === "spacer"; }))
      slots[0] = { role: "body", align: slots[0].align, emphasis: "primary" };
    /* ★ 空けておく枠（spacer）は **いちばん狭いところ**へ（2026-08-17・実測）。
       body と spacer を 1:1 で割ると 画面の半分が ただの空白になり、
       作りかけに見えていた。余白は「残り」であって「主役」ではない。 */
    (function () {
      var 和 = ratio.reduce(function (a, b) { return a + b; }, 0);
      for (var i = 0; i < slots.length; i++) {
        if (slots[i].role !== "spacer") continue;
        var 小 = i, 小割 = ratio[i] / 和;
        for (var k = 0; k < slots.length; k++) {
          if (slots[k].role === "spacer") continue;
          if (ratio[k] / 和 < 小割) { 小 = k; 小割 = ratio[k] / 和; }
        }
        if (小 !== i) { var t2 = slots[i]; slots[i] = slots[小]; slots[小] = t2; }
      }
    })();
    /* primary は 1 枚に 1 つだけ */
    var 主 = slots.filter(function (x) { return x.emphasis === "primary"; });
    if (主.length === 0) {
      var 先 = slots.filter(function (x) { return x.role !== "spacer"; })[0];
      if (先) 先.emphasis = "primary";
    } else if (主.length > 1) {
      var 見た = false;
      slots.forEach(function (x) {
        if (x.emphasis !== "primary") return;
        if (見た) x.emphasis = "secondary"; else 見た = true;
      });
    }
    return { partition: { count: count, direction: dir, ratio: ratio },
             slots: slots, gravity: gravity, bleed: !!s.bleed };
  }

  /* 比のうち そのスロットが占める割合 */
  function 取り分(spec, i) {
    var r = spec.partition.ratio;
    var 和 = r.reduce(function (a, b) { return a + b; }, 0);
    return 和 ? r[i] / 和 : 0;
  }

  function validateSpec(specIn) {
    var s = 正規化(specIn), 悪 = [];
    if (s.slots.length !== s.partition.count) 悪.push("スロットの数が 分割の数と合わない");
    if (RATIO_KEYS.indexOf(ratioKey(s.partition.ratio)) < 0) 悪.push("許していない比: " + ratioKey(s.partition.ratio));
    if (s.partition.ratio.length !== s.partition.count) 悪.push("比の数が 分割の数と合わない");
    if (s.partition.count === 1 && s.gravity === "asymmetric") 悪.push("1 分割で asymmetric は使えない");
    if (s.slots.filter(function (x) { return x.emphasis === "primary"; }).length !== 1)
      悪.push("primary は 1 ページに ちょうど 1 つ");
    if (s.slots.every(function (x) { return x.role === "spacer"; }))
      悪.push("中身が 1 つも無い（全部 spacer）");
    s.slots.forEach(function (x, i) {
      if (x.role === "spacer" && x.emphasis !== "tertiary") 悪.push((i + 1) + " 番目: spacer は tertiary のみ");
      if (大きく要る.indexOf(x.role) >= 0 && 取り分(s, i) < 0.4)
        悪.push((i + 1) + " 番目: " + x.role + " は 面の 40% 以上が要る（いま "
          + Math.round(取り分(s, i) * 100) + "%）");
    });
    return { ok: !悪.length, 悪: 悪, spec: s };
  }

  /* だめな Spec を **計算で** 通る形へ寄せる（LLM に作り直させない）。 */
  function 直す(specIn) {
    var s = 正規化(specIn);
    var 直し = [];
    /* ① 大きな面が要る役目が 小さい枠にいる
       ★ 直す順番（2026-08-17・実測）:
         (a) 同じ枠のまま 比を変える
         (b) だめなら **その役目を 広い枠へ移す**（比も変えてよい）
         (c) それでも無理なら body へ落とす（最後の手。ここに来たら記録する）
       前は (a) がだめなら いきなり (c) だったので、
       3 分割の 1 番目に置かれたグラフが 黙って消えていた。 */
    s.slots.forEach(function (x, i) {
      if (大きく要る.indexOf(x.role) < 0 || 取り分(s, i) >= 0.4) return;
      var 同じ長さ = RATIOS.filter(function (r) { return r.length === s.partition.count; });
      var その場 = 同じ長さ.filter(function (r) {
        var 和 = r.reduce(function (a, b) { return a + b; }, 0);
        return r[i] / 和 >= 0.4;
      });
      if (その場.length) {
        s.partition.ratio = その場[0].slice();
        直し.push("比を " + ratioKey(s.partition.ratio) + " にした");
        return;
      }
      /* (b) 広い枠を作れる比を探して、そこへ 入れ替える */
      var 見つけた = null;
      同じ長さ.some(function (r) {
        var 和 = r.reduce(function (a, b) { return a + b; }, 0);
        for (var k = 0; k < r.length; k++) {
          if (k === i) continue;
          if (r[k] / 和 < 0.4) continue;
          if (大きく要る.indexOf(s.slots[k].role) >= 0) continue;   /* 相手も広い役なら 交換できない */
          見つけた = { r: r, k: k };
          return true;
        }
        return false;
      });
      if (見つけた) {
        s.partition.ratio = 見つけた.r.slice();
        var t = s.slots[i]; s.slots[i] = s.slots[見つけた.k]; s.slots[見つけた.k] = t;
        直し.push((i + 1) + " 番目の " + x.role + " を " + (見つけた.k + 1)
          + " 番目（広いほう）へ移し、比を " + ratioKey(s.partition.ratio) + " にした");
        return;
      }
      s.slots[i].role = "body";
      直し.push((i + 1) + " 番目を body にした（どの比でも 40% を作れない）");
    });
    var v = validateSpec(s);
    return { spec: v.spec, ok: v.ok, 悪: v.悪, 直し: 直し };
  }

  /* ── 決まった作りかた（LLM の出力が壊れていたときの受け皿）──────
     ★ テンプレではない。**壊れたときだけ**使う最後の砦で、
       purpose と 何枚目かで 形が変わる。 */
  function 受け皿(purpose, index) {
    var i = (index | 0);
    var 表 = {
      title: { partition: { count: 2, direction: "vertical", ratio: [1, 1] },
               slots: [{ role: "heading", align: "start", emphasis: "primary" },
                       { role: "subheading", align: "start", emphasis: "tertiary" }],
               gravity: "left", bleed: true },
      timeline: { partition: { count: 2, direction: "vertical", ratio: [1, 2] },
                  slots: [{ role: "heading", align: "start", emphasis: "secondary" },
                          { role: "table", align: "start", emphasis: "primary" }],
                  gravity: "left", bleed: false },
      budget: { partition: { count: 2, direction: "vertical", ratio: [1, 2] },
                slots: [{ role: "heading", align: "start", emphasis: "secondary" },
                        { role: "chart", align: "center", emphasis: "primary" }],
                gravity: "left", bleed: false },
      data: { partition: { count: 2, direction: "vertical", ratio: [1, 2] },
              slots: [{ role: "heading", align: "start", emphasis: "secondary" },
                      { role: "chart", align: "center", emphasis: "primary" }],
              gravity: "left", bleed: false },
      team: { partition: { count: 2, direction: "vertical", ratio: [1, 2] },
              slots: [{ role: "heading", align: "start", emphasis: "secondary" },
                      { role: "table", align: "start", emphasis: "primary" }],
              gravity: "left", bleed: false },
      metric: { partition: { count: 3, direction: "horizontal", ratio: [1, 1, 1] },
                slots: [{ role: "metric", align: "center", emphasis: "primary" },
                        { role: "metric", align: "center", emphasis: "secondary" },
                        { role: "metric", align: "center", emphasis: "secondary" }],
                gravity: "center", bleed: false },
      quote: { partition: { count: 1, direction: "vertical", ratio: [1] },
               slots: [{ role: "quote", align: "center", emphasis: "primary" }],
               gravity: "center", bleed: true },
      comparison: { partition: { count: 2, direction: "horizontal", ratio: [1, 1] },
                    slots: [{ role: "bullets", align: "start", emphasis: "primary" },
                            { role: "bullets", align: "start", emphasis: "secondary" }],
                    gravity: "left", bleed: false },
      closing: { partition: { count: 1, direction: "vertical", ratio: [1] },
                 slots: [{ role: "heading", align: "center", emphasis: "primary" }],
                 gravity: "center", bleed: true }
    };
    if (表[purpose]) return 正規化(表[purpose]);
    /* 決まっていない purpose は 何枚目かで 形を変える（同じ顔を続けない） */
    var 型 = [
      { partition: { count: 2, direction: "vertical", ratio: [1, 2] },
        slots: [{ role: "heading", align: "start", emphasis: "secondary" },
                { role: "bullets", align: "start", emphasis: "primary" }],
        gravity: "left", bleed: false },
      { partition: { count: 2, direction: "horizontal", ratio: [1, 1.618] },
        slots: [{ role: "heading", align: "start", emphasis: "primary" },
                { role: "body", align: "start", emphasis: "secondary" }],
        gravity: "asymmetric", bleed: false },
      { partition: { count: 3, direction: "horizontal", ratio: [1, 1, 1] },
        slots: [{ role: "body", align: "start", emphasis: "primary" },
                { role: "body", align: "start", emphasis: "secondary" },
                { role: "body", align: "start", emphasis: "secondary" }],
        gravity: "center", bleed: false },
      { partition: { count: 2, direction: "vertical", ratio: [2, 3] },
        slots: [{ role: "heading", align: "start", emphasis: "primary" },
                { role: "table", align: "start", emphasis: "secondary" }],
        gravity: "left", bleed: true }
    ];
    return 正規化(型[i % 型.length]);
  }

  /* 試験のための Spec 生成（Phase 2 の 20 枚 × 50 デッキで使う） */
  function randomSpec(rng, opts) {
    var f = typeof rng === "function" ? rng : Math.random;
    var o = opts || {};
    var pick = function (a) { return a[Math.floor(f() * a.length) % a.length]; };
    var 候補 = RATIOS.filter(function (r) { return !o.count || r.length === o.count; });
    var ratio = pick(候補);
    var count = ratio.length;
    var slots = [];
    for (var i = 0; i < count; i++) {
      slots.push({ role: pick(ROLES_使える), align: pick(ALIGNS), emphasis: pick(EMPH) });
    }
    var s = { partition: { count: count, direction: pick(DIRECTION), ratio: ratio },
              slots: slots, gravity: pick(GRAVITY), bleed: f() < 0.35 };
    return 直す(s).spec;
  }

  VQD.grammar = {
    RATIOS: RATIOS, ROLES: ROLES, ROLES_使える: ROLES_使える, ALIGNS: ALIGNS,
    EMPH: EMPH, GRAVITY: GRAVITY, DIRECTION: DIRECTION, PURPOSES: PURPOSES,
    正規化: 正規化, 取り分: 取り分, validateSpec: validateSpec, 直す: 直す,
    受け皿: 受け皿, randomSpec: randomSpec, ratioKey: ratioKey
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
