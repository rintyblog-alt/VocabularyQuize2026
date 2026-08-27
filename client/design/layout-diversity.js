/* ══════════════════════════════════════════════════════════════════════
   design/layout-diversity.js — 「毎ページ同じ顔」を 数で止める

   ★ 「見た目が違うか」を LLM に聞かない。特徴ベクトルを作って数で比べる。
   ★ 違反したページ **だけ** を選び直す。デッキ全体を作り直さない。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQD = root.VQD || (root.VQD = {});
  var G = VQD.grammar;

  function 安定ハッシュ(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h % 997;
  }

  /* 特徴ベクトル（§6.2）*/
  function vec(specIn) {
    var s = G.正規化(specIn);
    var 主 = -1;
    s.slots.forEach(function (x, i) { if (x.emphasis === "primary" && 主 < 0) 主 = i; });
    var 役 = s.slots.map(function (x) { return x.role; }).slice().sort().join(",");
    return [
      s.partition.count,
      s.partition.direction === "vertical" ? 0 : 1,
      G.RATIOS.map(G.ratioKey).indexOf(G.ratioKey(s.partition.ratio)),
      G.GRAVITY.indexOf(s.gravity),
      s.bleed ? 1 : 0,
      主,
      安定ハッシュ(役)
    ];
  }
  function key(specOrVec) {
    var v = Array.isArray(specOrVec) ? specOrVec : vec(specOrVec);
    return v.join("/");
  }
  function 違う軸(a, b) {
    var n = 0;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
    return n;
  }

  /* デッキ全体を見る。返すのは **どのページが だめか** だけ。 */
  function checkDiversity(specs) {
    var vs = (specs || []).map(vec);
    var 悪 = [];
    for (var i = 1; i < vs.length; i++) {
      var d = 違う軸(vs[i - 1], vs[i]);
      if (d < 3) 悪.push({ 番: i + 1, なぜ: "前のページと " + d + " 軸しか違わない（3 軸以上 要る）" });
    }
    for (var j = 0; j < vs.length; j++) {
      var 窓 = vs.slice(Math.max(0, j - 4), j + 1);
      if (窓.length === 5) {
        var 数 = {};
        窓.forEach(function (v) { 数[v[0]] = (数[v[0]] || 0) + 1; });
        var 最 = Math.max.apply(null, Object.keys(数).map(function (k) { return 数[k]; }));
        if (最 >= 4) 悪.push({ 番: j + 1, なぜ: "直近 5 枚のうち " + 最 + " 枚が 同じ分割数" });
      }
    }
    var 種 = {};
    vs.forEach(function (v) { 種[key(v)] = 1; });
    var 要る = Math.min(Math.max(1, Math.ceil(vs.length / 3)), 5);
    var 全体 = Object.keys(種).length;
    if (vs.length >= 2 && 全体 < 要る)
      悪.push({ 番: 0, なぜ: "デッキ全体で " + 全体 + " 種類しかない（" + 要る + " 種類 以上 要る）" });
    /* 同じ番号を二重に出さない */
    var 見た = {}, 出 = [];
    悪.forEach(function (x) { var k = x.番 + "|" + x.なぜ; if (!見た[k]) { 見た[k] = 1; 出.push(x); } });
    return { ok: !出.length, 悪: 出, 種類: 全体, 要る種類: 要る, ベクトル: vs };
  }

  /* 中身を持つ「重い役」。ここは 何があっても 落とさない。 */
  var 重い役 = ["heading", "table", "chart", "diagram", "metric", "quote", "bullets"];
  /* そのうち **面の 40% 以上**が要るもの（layout-grammar の決まりと同じ） */
  var 面が要る = ["table", "chart", "diagram", "image"];

  /* その位置に置ける候補。
     ★ **重い役は 1 つも落とさない**（2026-08-17・実測）。
       落とすと、頼まれていた 表・グラフの枠が 黙って消える。
       通しの試験で「表とグラフを入れて」と言った 10 枚から 両方 消えていた。
     ★ そのままの形しか許さないと 多様性が作れないので、
       中身を書いたあと（かたい=true）だけ **枠の数も役目も固定**し、
       まだ書く前は 重い役を保ったまま 枠を増やしてよいことにする。 */
  function 候補一覧(いま, 禁じ分割数, かたい) {
    var 役 = いま.slots.map(function (x) { return x.role; });
    var 重 = いま.slots.map(function (x) { return x.emphasis; });
    var 寄 = いま.slots.map(function (x) { return x.align; });
    var 要る = 役.filter(function (r) { return 重い役.indexOf(r) >= 0; });
    var 候補 = [];
    G.RATIOS.forEach(function (r) {
      if (禁じ分割数 && r.length === 禁じ分割数) return;
      if (かたい ? r.length !== 役.length : r.length < 要る.length) return;
      G.DIRECTION.forEach(function (d) {
        G.GRAVITY.forEach(function (g) {
          [false, true].forEach(function (bl) {
            if (r.length === 1 && g === "asymmetric") return;
            var slots = [];
            if (かたい) {
              for (var k = 0; k < r.length; k++)
                slots.push({ role: 役[k], align: 寄[k], emphasis: 重[k] });
            } else {
              /* ★ 面の広い役（表・グラフ・図解）は **広い枠へ**（2026-08-17・実測）。
                 前から順に詰めていたので、3 分割のときは グラフが必ず
                 いちばん狭い枠（25〜33%）に入り、「40% 以上 要る」に引っかかって
                 候補が 1 つも作れず、分割数を変えられなくなっていた。
                 その結果 同じ分割数が 4 枚続き、多様性が 50 デッキ中 19 で落ちていた。 */
              var 和 = r.reduce(function (x, y) { return x + y; }, 0);
              var 順 = r.map(function (v, k3) { return { k: k3, 割: v / 和 }; })
                .sort(function (x, y) { return y.割 - x.割; });
              var 広い役 = 要る.filter(function (x) { return 面が要る.indexOf(x) >= 0; });
              var 細い役 = 要る.filter(function (x) { return 面が要る.indexOf(x) < 0; });
              var 割当 = new Array(r.length);
              広い役.forEach(function (x, k4) { if (順[k4]) 割当[順[k4].k] = x; });
              var 残枠 = [];
              for (var k5 = 0; k5 < r.length; k5++) if (!割当[k5]) 残枠.push(k5);
              細い役.forEach(function (x, k6) { if (残枠[k6] !== undefined) 割当[残枠[k6]] = x; });
              for (var k7 = 0; k7 < r.length; k7++)
                slots.push({ role: 割当[k7] || "body",
                             align: 寄[Math.min(k7, 寄.length - 1)],
                             emphasis: k7 === 0 ? "primary" : "secondary" });
            }
            var sp = G.直す({ partition: { count: r.length, direction: d, ratio: r },
                              slots: slots, gravity: g, bleed: bl });
            var 保てた = 要る.every(function (x) {
              return sp.spec.slots.some(function (y) { return y.role === x; });
            });
            if (sp.ok && 保てた) 候補.push(sp.spec);
          });
        });
      });
    });
    return 候補;
  }

  /* 違反ページを **そのページだけ** 選び直す。
     ★ 直前のページと 3 軸以上 違う候補を、決まった順に探す。
       乱数を使わない（同じ入力からは同じ直しが出る）。 */
  function 選び直す(specs, 番, seedNum, 禁じ分割数, かたい) {
    var i = 番 - 1;
    if (i < 0 || i >= specs.length) return null;
    var 前 = i > 0 ? vec(specs[i - 1]) : null;
    var 次 = i + 1 < specs.length ? vec(specs[i + 1]) : null;
    var いま = G.正規化(specs[i]);
    /* ★ 「直近 5 枚のうち 4 枚が 同じ分割数」を直すときは、その分割数を外す。
       候補の作りかたは 候補一覧 と 1 本にまとめてある（役目を落とさない）。 */
    var 候補 = 候補一覧(いま, 禁じ分割数, かたい);
    /* 決まった順で回すが、開始位置だけ Seed でずらす（同じ形に偏らないため） */
    var 開始 = ((seedNum | 0) % Math.max(1, 候補.length) + 候補.length) % Math.max(1, 候補.length);
    var 片方だけ = null;
    for (var t = 0; t < 候補.length; t++) {
      var c = 候補[(開始 + t) % 候補.length];
      var v = vec(c);
      var 前OK = !前 || 違う軸(前, v) >= 3;
      var 次OK = !次 || 違う軸(次, v) >= 3;
      if (前OK && 次OK) return c;
      /* ★ 両隣を同時に満たす形が無いことがある（2026-08-17・実測）。
         そのときは **前とだけ** 満たす形を覚えておき、
         次のページは 次の回で直す。全部あきらめるより ずっと良い。 */
      if (前OK && !片方だけ) 片方だけ = c;
    }
    return 片方だけ;
  }

  /* ══ デッキ全体を そろえる ═══════════════════════════════════════
     ★ **前から 1 回で決める**（2026-08-17・実測）。
       前は「違反したページを直す」を繰り返していたが、直すと隣が壊れ、
       60 回まわしても 50 デッキ中 11 デッキが通らなかった（振動）。
       すでに確定した手前だけを見て 1 枚ずつ決めれば、必ず 1 周で終わる。 */
  function 整える(specs, seedNum) {
    var 元 = (specs || []).map(function (s) { return G.正規化(s); });
    var 出 = [], 直し = [];
    元.forEach(function (sp, i) {
      if (i === 0) { 出.push(sp); return; }
      var 前 = vec(出[i - 1]);
      /* ★ 窓の見かた（2026-08-17・実測で直した）。
         「自分が選ぶ分割数」だけ見ていては足りない。
         **4 枚が すでに同じ**なら、自分が何を選んでも その窓は壊れている。
         だから 4 枚そろう前（i=3）から止める。 */
      var 窓 = 出.slice(Math.max(0, i - 4)), 数 = {};
      窓.forEach(function (s2) { var c = s2.partition.count; 数[c] = (数[c] || 0) + 1; });
      function 窓OK(c) {
        if (窓.length + 1 < 4) return true;
        var n2 = {};
        Object.keys(数).forEach(function (k) { n2[k] = 数[k]; });
        n2[c] = (n2[c] || 0) + 1;
        var 最 = 0;
        Object.keys(n2).forEach(function (k) { if (n2[k] > 最) 最 = n2[k]; });
        return 最 < 4;
      }

      var v0 = vec(sp);
      if (違う軸(前, v0) >= 3 && 窓OK(sp.partition.count)) { 出.push(sp); return; }

      var 候補 = 候補一覧(sp, 0, false);
      var 開始 = 候補.length ? (((seedNum | 0) + i * 13) % 候補.length + 候補.length) % 候補.length : 0;
      /* ★ 落としどころを 2 段にする（2026-08-17・実測）。
         前は「3 軸そろわなければ いちばん違う形」だけだったので、
         窓の決まり（直近 5 枚で 同じ分割数 4 回）を 平気で踏んでいた。
         1000 枚中 29 枚が それだった。窓を優先する候補を 先に探す。 */
      /* ★ **その場しのぎで選ばない**（2026-08-17・実測）。
         条件を満たす最初の候補を採ると、同じ分割数が 3 連続してしまい、
         次のページが 何を選んでも 窓の決まりを踏む（1000 枚中 29 枚）。
         満たす候補の中から **直近であまり使っていない分割数**を選ぶ。 */
      var 良 = [], 窓だけ = null, 窓だけ差 = -1, 次点 = null, 次点差 = -1;
      for (var t = 0; t < 候補.length; t++) {
        var c = 候補[(開始 + t) % 候補.length], v = vec(c), d = 違う軸(前, v);
        var wok = 窓OK(c.partition.count);
        if (d >= 3 && wok) 良.push(c);
        else if (wok && d > 窓だけ差) { 窓だけ差 = d; 窓だけ = c; }
        else if (d > 次点差) { 次点差 = d; 次点 = c; }
      }
      var 選 = null;
      if (良.length) {
        var 少 = Infinity;
        良.forEach(function (c2) {
          var n3 = 数[c2.partition.count] || 0;
          if (n3 < 少) { 少 = n3; 選 = c2; }
        });
      }
      var 決 = 選 || 窓だけ || 次点 || sp;
      直し.push({ 番: i + 1, なぜ: 選 ? "前と 3 軸そろえた" : "満たす形が無いので いちばん違う形にした" });
      出.push(決);
    });

    /* 全体の種類が足りないときだけ、後ろから 1 枚ずつ 形を変える */
    var 回2 = 0;
    while (回2 < 20) {
      var r2 = checkDiversity(出);
      if (r2.ok || r2.悪.every(function (x) { return x.番 > 0; })) break;
      var 数3 = {}, 最多 = "", 最 = 0;
      出.forEach(function (s) { var k = key(s); 数3[k] = (数3[k] || 0) + 1; if (数3[k] > 最) { 最 = 数3[k]; 最多 = k; } });
      var 的番 = -1;
      for (var j = 出.length - 1; j >= 1; j--) if (key(出[j]) === 最多) { 的番 = j; break; }
      if (的番 < 0) break;
      var n2 = 選び直す(出, 的番 + 1, (seedNum | 0) + 回2 * 5, 0, false);
      if (!n2) break;
      出[的番] = n2;
      直し.push({ 番: 的番 + 1, なぜ: "デッキ全体の種類が足りない" });
      回2++;
    }
    return { specs: 出, 直し: 直し, 結果: checkDiversity(出) };
  }

  /* 旧: 違反したページだけ直す作り（外から使う口として残す） */
  function 直しながら整える(specs, seedNum) {
    var 出 = (specs || []).map(function (s) { return G.正規化(s); });
    var 直し = [], 回 = 0;
    /* ★ 直せないページが 1 枚あっても **そこで全部やめない**（2026-08-17・実測）。
       前は null が返った瞬間に break していたので、その先のページの
       違反が まるごと残り、50 デッキ中 12 デッキが通らなかった。 */
    var 諦め = {};
    while (回 < 60) {
      var r = checkDiversity(出);
      if (r.ok) break;
      var 残 = r.悪.filter(function (x) { return x.番 > 0 && !諦め[x.番]; });
      /* 窓の決まり（直近 5 枚）を **先に**直す。
         隣どうしの決まりだけ直していると、窓のほうが永久に残る。 */
      var 的 = null;
      for (var i0 = 0; i0 < 残.length; i0++)
        if (/直近/.test(残[i0].なぜ)) { 的 = 残[i0]; break; }
      if (!的 && 残.length) 的 = 残[0];
      if (!的) {
        /* 全体の種類が足りない: いちばん多く出ている形のページを 1 枚 選び直す */
        var 数 = {}, 最多 = "", 最 = 0;
        出.forEach(function (s) { var k = key(s); 数[k] = (数[k] || 0) + 1; if (数[k] > 最) { 最 = 数[k]; 最多 = k; } });
        for (var j = 出.length - 1; j >= 0; j--)
          if (key(出[j]) === 最多 && !諦め[j + 1]) { 的 = { 番: j + 1, なぜ: "種類が足りない" }; break; }
      }
      if (!的) break;
      var 禁 = 0;
      if (/直近/.test(的.なぜ || "")) {
        var 窓 = 出.slice(Math.max(0, 的.番 - 5), 的.番), 数2 = {}, 最2 = 0;
        窓.forEach(function (s2) { var c2 = G.正規化(s2).partition.count;
          数2[c2] = (数2[c2] || 0) + 1; if (数2[c2] > 最2) { 最2 = 数2[c2]; 禁 = c2; } });
      }
      var n = 選び直す(出, 的.番, (seedNum | 0) + 回 * 7, 禁);
      if (!n) { 諦め[的.番] = 1; 回++; continue; }
      直し.push({ 番: 的.番, なぜ: 的.なぜ });
      出[的.番 - 1] = n;
      回++;
    }
    return { specs: 出, 直し: 直し, 結果: checkDiversity(出) };
  }

  VQD.diversity = { vec: vec, key: key, 違う軸: 違う軸, 候補一覧: 候補一覧, 重い役: 重い役,
                    checkDiversity: checkDiversity, 選び直す: 選び直す,
                    整える: 整える, 直しながら整える: 直しながら整える };
})(typeof globalThis !== "undefined" ? globalThis : this);
