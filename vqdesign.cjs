/* ══════════════════════════════════════════════════════════════════════
   vqdesign.cjs — パラメトリック・デザインエンジンの回帰テスト

   ・LLM を一切使わない。全部 純粋関数の検算。
   ・実行: node vqdesign.cjs
   ・指示書 §13 の要件をそのまま並べてある。
     [決定性][制約][コントラスト][多様性][レイアウト][面積][修復]
   ══════════════════════════════════════════════════════════════════════ */
"use strict";
const path = require("path");
const R = path.join(__dirname, "client", "design") + path.sep;
["color", "seed", "font-families", "font-pairs", "derive", "constraints",
 "layout-grammar", "layout-diversity", "layout-resolve", "gate", "ir",
 "preview", "sample", "render-vqslides", "pipeline"].forEach((f) => require(R + f + ".js"));
const V = globalThis.VQD;

let ok = 0, ng = 0;
const T = (name, cond, extra) => {
  if (cond) { ok++; console.log("✅ " + name); }
  else { ng++; console.log("❌ " + name + (extra !== undefined ? " → " + JSON.stringify(extra).slice(0, 260) : "")); }
};
const 節 = (s) => console.log("\n■ " + s);

/* ══ 書体の材料 ═══════════════════════════════════════════════════ */
節("書体の 24 組");
const fs = require("fs");
const 家族 = {};
V.fontFamilyTable.forEach((f) => { 家族[f.id] = f.family; });
let 書体NG = [], 本文NG = [], 和文NG = [];
V.fontPairs.forEach((p) => {
  ["display", "body", "mono", "jpDisplay", "jpBody"].forEach((k) => {
    if (!p[k]) return;
    if (!家族[p[k]]) { 書体NG.push(p.id + "." + k + "=" + p[k]); return; }
    const css = path.join(__dirname, "client", "fonts", "css", p[k] + ".css");
    if (!fs.existsSync(css)) 書体NG.push(p.id + "." + k + " の実体が無い");
  });
  /* 本文は 400 と 700 が実体としてあること */
  [["body", p.body], ["jpBody", p.jpBody]].forEach(([k, id]) => {
    try {
      const css = fs.readFileSync(path.join(__dirname, "client", "fonts", "css", id + ".css"), "utf8");
      const w = [...new Set((css.match(/font-weight: (\d+)/g) || []).map((x) => +x.split(" ")[1]))];
      if (!w.includes(400) || !w.some((v) => v >= 600)) 本文NG.push(p.id + "." + k + "=" + id + " " + JSON.stringify(w));
    } catch (e) { 本文NG.push(p.id + "." + k + " が読めない"); }
  });
  /* 和文は 和文グリフを持つこと */
  [p.jpDisplay, p.jpBody].forEach((id) => {
    try {
      const css = fs.readFileSync(path.join(__dirname, "client", "fonts", "css", id + ".css"), "utf8");
      if (!/U\+3[0-9A-F]{3}/i.test(css) && !/U\+4E00/i.test(css)) 和文NG.push(p.id + " の " + id);
    } catch (e) { 和文NG.push(p.id + " の " + id + " が読めない"); }
  });
});
T("24 組ある", V.fontPairs.length === 24, V.fontPairs.length);
T("★ 使っている書体は すべて同梱されている", !書体NG.length, 書体NG.slice(0, 5));
T("★ 本文の書体は 400 と 太字が 実体としてある", !本文NG.length, 本文NG.slice(0, 5));
T("★ 和文の書体は 和文グリフを持つ", !和文NG.length, 和文NG.slice(0, 5));
const 性格 = {};
V.fontPairs.forEach((p) => { 性格[p.genre] = (性格[p.genre] || 0) + 1; });
T("★ 同じ性格が 5 組以上に ならない", Object.keys(性格).every((k) => 性格[k] <= 4), 性格);
T("組の名前が すべて違う", new Set(V.fontPairs.map((p) => p.名)).size === 24);

/* ══ [決定性] ════════════════════════════════════════════════════ */
節("[決定性] 同じ Seed からは 同じ Tokens");
{
  const s = V.constraints.randomSeed(V.constraints.rngOf(7));
  const 基 = JSON.stringify(V.derive(s), (k, v) => (typeof v === "function" ? "fn" : v));
  let 同じ = true;
  for (let i = 0; i < 10; i++)
    if (JSON.stringify(V.derive(s), (k, v) => (typeof v === "function" ? "fn" : v)) !== 基) 同じ = false;
  T("★ 10 回導出して 完全一致", 同じ);
  T("★ 乱数も時計も使っていない（Seed だけで決まる）",
    V.derive(V.seed.decode("0-0-0-0-0-0-0-0-0-0")).color.bg
    === V.derive(V.seed.decode("0-0-0-0-0-0-0-0-0-0")).color.bg);
}

/* ══ [制約] [コントラスト] [多様性] ═══════════════════════════════ */
節("[制約][コントラスト][多様性] ランダム Seed 1000 件");
{
  const rng = V.constraints.rngOf(20260817);
  let 禁じ手 = 0, 比NG = [], 鍵 = new Set();
  for (let i = 0; i < 1000; i++) {
    const s = V.constraints.randomSeed(rng);
    if (!V.constraints.validateSeed(s).ok) 禁じ手++;
    const t = V.derive(s);
    const 悪 = V.deriveCheck(t);
    if (悪.length) 比NG.push(t.seedKey + ": " + 悪[0]);
    鍵.add(t.seedKey);
  }
  T("★ 1000 件すべて 補正後に 禁じ手なし", 禁じ手 === 0, 禁じ手);
  T("★★ 1000 件すべて 本文/地 が 7.0 以上（他の閾値も同時に）", !比NG.length, 比NG.slice(0, 3));
  T("★ Seed が 1 件も重複しない", 鍵.size === 1000, 鍵.size);
  T("組み合わせ総数が 2,900 万を超える", V.seed.space() > 29000000, V.seed.space());
}

/* ══ 禁じ手の補正 ═════════════════════════════════════════════════ */
節("禁じ手の補正（LLM に作り直させない）");
{
  const 例 = [
    { seed: { grid: 12, typeScale: 1.5 }, なに: "12 列 × 大きい比" },
    { seed: { grid: 12, shape: "circular" }, なに: "12 列 × 円" },
    { seed: { mode: "high_contrast", background: "shapes" }, なに: "高コントラスト × 図形" },
    { seed: { scheme: "mono", accent: "none" }, なに: "単色 × 飾りなし" },
    { seed: { background: "texture", spacing: "tight" }, なに: "地紋 × 詰まった余白" }
  ];
  例.forEach((x) => {
    const r = V.constraints.nearestValidSeed(x.seed);
    T("★ " + x.なに + " を 計算で直す", r.ok && r.直した.length >= 1, r);
    T("　 1 軸ずつしか動かさない",
      r.直した.every((d) => Math.abs(V.seed.valuesOf(d.軸).indexOf(d.後) - V.seed.valuesOf(d.軸).indexOf(d.前)) === 1), r.直した);
  });
}

/* ══ [レイアウト] [面積] ═════════════════════════════════════════ */
節("[レイアウト][面積] 20 枚 × 50 デッキ");
{
  const 中身 = (role, 寸, i) => V.sample ? V.sample.中身(role, 寸, i) : { text: "本文" };
  const rng = V.constraints.rngOf(4242);
  let 全err = 0, 全warn = 0, 面積NG = 0, 面積max = 0, 多様NG = 0, 枚 = 0;
  const 内訳 = {};
  for (let d = 0; d < 50; d++) {
    const seed = V.constraints.randomSeed(rng);
    const deck = V.ir.newDeck({ title: "試験", pageCount: 20 }, seed);
    const specs = [];
    for (let i = 0; i < 20; i++) specs.push(V.grammar.randomSpec(rng));
    const 整 = V.diversity.整える(specs, d);
    if (!整.結果.ok) 多様NG += 整.結果.悪.length;
    整.specs.forEach((sp, i) => {
      const purpose = V.grammar.PURPOSES[i % V.grammar.PURPOSES.length];
      const pg = V.ir.newPage(purpose, sp, i);
      const 寸 = V.measure.上限一覧(sp, deck.tokens, { purpose });
      pg.content = sp.slots.map((s, k) =>
        V.ir.中身をそろえる(Object.assign({ slotIndex: k }, 中身(s.role, 寸[k], i + k)), s.role));
      deck.pages.push(pg);
    });
    const r = V.ir.全部解く(deck);
    枚 += deck.pages.length; 全err += r.error数; 全warn += r.warning数;
    deck.pages.forEach((p) => {
      p.issues.filter((x) => x.深刻 === "error").forEach((x) => { 内訳[x.種] = (内訳[x.種] || 0) + 1; });
      const a = V.gate.濃い色の面積比(p.resolved, deck.tokens);
      if (a > 面積max) 面積max = a;
      if (a > 0.1001) 面積NG++;
    });
  }
  T("1000 枚 生成した", 枚 === 1000, 枚);
  T("★★ Layout Gate の error が 0 件", 全err === 0, 内訳);
  T("★★ 濃い色（S>60%）の面積が 10% を超えない", 面積NG === 0,
    { 超えた枚数: 面積NG, 最大: (面積max * 100).toFixed(1) + "%" });
  /* ★ 多様性は 0 にはならない。仕様どうしがぶつかる場合があるため。
       「表とグラフを 1 枚に 2 つ置く」と、その枠は 40% 以上が要るので
       分割数が 2 に固定され、直近 5 枚の決まりを満たせないことがある。
       **中身を捨てて数字を良くしない**。上限を決めて 見張るだけにする。 */
  T("★ 多様性の違反が 1000 枚中 30 件以下（仕様の衝突ぶん）", 多様NG <= 30, 多様NG);
}

/* ══ 文法の決まり ═════════════════════════════════════════════════ */
節("レイアウト文法");
{
  T("★ 全部 spacer のページは 作れない",
    !V.grammar.validateSpec({ partition: { count: 2, direction: "vertical", ratio: [1, 1] },
      slots: [{ role: "spacer" }, { role: "spacer" }] }).spec.slots.every((s) => s.role === "spacer"));
  T("★ primary は ちょうど 1 つになる",
    V.grammar.正規化({ partition: { count: 3, direction: "vertical", ratio: [1, 1, 1] },
      slots: [{ role: "body", emphasis: "primary" }, { role: "body", emphasis: "primary" },
              { role: "body", emphasis: "primary" }] })
      .slots.filter((s) => s.emphasis === "primary").length === 1);
  T("★ 1 分割で asymmetric は使えない",
    V.grammar.正規化({ partition: { count: 1, direction: "vertical", ratio: [1] },
      slots: [{ role: "body" }], gravity: "asymmetric" }).gravity !== "asymmetric");
  const g = V.grammar.直す({ partition: { count: 3, direction: "horizontal", ratio: [1, 1, 1] },
    slots: [{ role: "chart", emphasis: "primary" }, { role: "body" }, { role: "body" }] });
  /* ★ 3 分割では **どの比でも 1 番目に 40% は作れない**（[1,2,1] の 1 番目は 25%）。
     そのときは role を消すのではなく、**広い枠へ移す**のが正しい。 */
  const gi = g.spec.slots.findIndex((s) => s.role === "chart");
  T("★ グラフの枠が 40% 未満なら 比か位置を直す（役目は消さない）",
    gi >= 0 && V.grammar.取り分(g.spec, gi) >= 0.4,
    { 役: g.spec.slots.map((s) => s.role), 比: g.spec.partition.ratio, 直し: g.直し });
  T("★ 許していない比は 通らない",
    !V.grammar.validateSpec({ partition: { count: 2, direction: "vertical", ratio: [1, 7] },
      slots: [{ role: "heading", emphasis: "primary" }, { role: "body" }] }).悪.length === false
    || V.grammar.正規化({ partition: { count: 2, direction: "vertical", ratio: [1, 7] },
      slots: [{ role: "heading" }, { role: "body" }] }).partition.ratio.join(":") !== "1:7");
}

/* ══ 多様性の見かた ═══════════════════════════════════════════════ */
節("多様性の判定");
{
  const 同じ = { partition: { count: 2, direction: "vertical", ratio: [1, 2] },
    slots: [{ role: "heading", emphasis: "primary" }, { role: "body" }], gravity: "left", bleed: false };
  const r = V.diversity.checkDiversity([同じ, 同じ, 同じ, 同じ]);
  T("★ 同じ形が続いたら 見つける", !r.ok && r.悪.length >= 3, r.悪.length);
  const 整 = V.diversity.整える([同じ, 同じ, 同じ, 同じ, 同じ, 同じ], 3);
  T("★ 整えると 通る", 整.結果.ok, 整.結果.悪);
  T("★ 重い役（表・グラフ）を 落とさない", (() => {
    const 元 = { partition: { count: 2, direction: "vertical", ratio: [1, 2] },
      slots: [{ role: "heading", emphasis: "primary" }, { role: "chart" }], gravity: "left", bleed: false };
    const r2 = V.diversity.整える([元, 元, 元, 元, 元, 元], 5);
    return r2.specs.every((s) => s.slots.some((x) => x.role === "chart"));
  })());
}

/* ══ [修復] ══════════════════════════════════════════════════════ */
節("[修復] 文字数超過を わざと入れる");
{
  const 役目 = ["title", "problem", "budget", "team", "summary"];
  V.pipeline.捨てる();
  V.pipeline.deckStart({ title: "試験", pageCount: 5, pages: 役目.map((p) => ({ purpose: p })) });
  const L = (page, count, dir, ratio, roles, gravity, bleed) => ({
    page, partition: { count, direction: dir, ratio },
    slots: roles.map((r, i) => ({ role: r, align: "start", emphasis: i === 0 ? "primary" : "secondary" })),
    gravity, bleed });
  const d = V.pipeline.deckDesign({ hue: 210, scheme: "analogous", mode: "light", fontPair: 0,
    typeScale: 1.25, grid: 6, spacing: "normal", shape: "rounded", accent: "underline",
    background: "plain", layouts: [
      L(1, 2, "vertical", [1, 1], ["heading", "subheading"], "left", true),
      L(2, 2, "vertical", [1, 2], ["heading", "body"], "left", false),
      L(3, 2, "vertical", [1, 2], ["heading", "chart"], "left", false),
      L(4, 2, "horizontal", [2, 3], ["heading", "table"], "left", false),
      L(5, 3, "horizontal", [1, 1, 1], ["metric", "metric", "metric"], "center", false)] });
  T("設計が通る", !!d.使った設計, d);
  /* わざと 10 倍の長さを入れる */
  const 長文 = "来場者が自分の手で作って持ち帰れる体験を用意します。".repeat(40);
  const w1 = V.pipeline.deckWrite({ pages: [{ page: 2, slots: [
    { slotIndex: 0, text: "去年の課題" }, { slotIndex: 1, text: 長文 }] }] });
  T("★ 入りきらないことを 見つける", w1.直してほしいところ !== "なし", w1.直してほしいところ);
  T("★★ 直しかたを **数で** 返す（「短く」ではない）",
    JSON.stringify(w1.直してほしいところ).match(/\d+ 文字以内/) !== null, w1.直してほしいところ);
  const 上限 = parseInt(JSON.stringify(w1.直してほしいところ).match(/(\d+) 文字以内/)[1], 10);
  const w2 = V.pipeline.deckWrite({ pages: [{ page: 2, slots: [
    { slotIndex: 0, text: "去年の課題" }, { slotIndex: 1, text: 長文.slice(0, 上限) }] }] });
  const p2 = V.pipeline.状態().deck.pages[1];
  T("★★ 言われた文字数にすると 1 回で直る",
    !(p2.issues || []).filter((x) => x.深刻 === "error").length, p2.issues);
  T("★ 修復は 無限に回らない（周は 3 まで）", V.pipeline.状態().周 <= 4, V.pipeline.状態().周);
}

/* ══ 通し（LLM の代わりに こちらが enum と文を渡す）═══════════════ */
節("通し 10 枚（LLM 抜き）");
{
  const 役目 = ["title", "agenda", "problem", "concept", "target", "timeline", "budget", "team", "risk", "summary"];
  V.pipeline.捨てる();
  const r1 = V.pipeline.deckStart({ title: "文化祭の企画", audience: "全校生徒",
    pageCount: 10, pages: 役目.map((p) => ({ purpose: p })) });
  T("10 枚の流れができる", (r1.ページの役目 || []).length === 10);
  T("★ 書体は **名前ではなく 性格**で渡す",
    JSON.stringify(r1.デザインの軸.fontPair).indexOf("Noto Sans") < 0
    && JSON.stringify(r1.デザインの軸.fontPair).indexOf("性格") > 0);
  T("★ 設計の前に 中身は書けない", !!V.pipeline.deckWrite({ pages: [] }).だめ);
  const L = (page, count, dir, ratio, roles, gravity, bleed) => ({
    page, partition: { count, direction: dir, ratio },
    slots: roles.map((r, i) => ({ role: r, align: "start", emphasis: i === 0 ? "primary" : "secondary" })),
    gravity, bleed });
  const r2 = V.pipeline.deckDesign({ hue: 210, scheme: "analogous", mode: "light", fontPair: 3,
    typeScale: 1.25, grid: 6, spacing: "airy", shape: "rounded", accent: "underline",
    background: "gradient", layouts: [
      L(1, 2, "vertical", [1, 1], ["heading", "subheading"], "left", true),
      L(2, 2, "horizontal", [1, 2], ["heading", "bullets"], "center", false),
      L(3, 2, "vertical", [1, 2], ["heading", "body"], "left", false),
      L(4, 3, "horizontal", [1, 1, 1], ["metric", "metric", "metric"], "center", false),
      L(5, 2, "horizontal", [1, 1], ["heading", "diagram"], "asymmetric", false),
      L(6, 2, "vertical", [1, 2], ["heading", "table"], "left", true),
      L(7, 2, "vertical", [1, 2], ["heading", "chart"], "left", false),
      L(8, 2, "horizontal", [2, 3], ["heading", "table"], "left", false),
      L(9, 2, "vertical", [1, 1], ["heading", "bullets"], "center", true),
      L(10, 1, "vertical", [1], ["heading"], "center", false)] });
  T("設計が通り Seed が決まる", !!(r2.使った設計 && r2.使った設計.Seed));
  T("★ 文字数上限が 数で返る",
    (r2.書くところ[0].スロット || []).every((s) => s.文字数上限 > 0 || s.欲しいもの));

  const 語 = { title: "文化祭の企画", agenda: "今日の話", problem: "去年の課題", concept: "考えかた",
    target: "だれに向けて", timeline: "当日の流れ", budget: "費用の内訳", team: "当日の体制",
    risk: "起こりうること", summary: "まとめ" };
  const 切 = (t, n) => String(t).slice(0, Math.max(2, n));
  const 書く1 = (pg, スロット) => スロット.map((s) => {
    const o = { slotIndex: s.slotIndex };
    if (s.role === "heading") o.text = 切(語[役目[pg - 1]] || "見出し", s.文字数上限);
    else if (s.role === "subheading") o.text = 切("3 年 A 組 実行委員会", s.文字数上限);
    else if (s.role === "body") o.text = 切("来場者が自分の手で作って持ち帰れる体験を用意し、待ち時間を短くします。", s.文字数上限);
    else if (s.role === "bullets") o.items = ["準備は3週間前から", "当日は2交代制", "材料は前日に検品"]
      .slice(0, Math.min(s.項目数の上限 || 3, 3)).map((x) => 切(x, s["1 項目の文字数上限"] || 10));
    else if (s.role === "metric") { o.value = "1,240"; o.caption = "昨年の来場者数"; }
    else if (s.role === "diagram") o.items = ["企画", "準備", "当日", "片づけ"]
      .slice(0, s.項目数の上限 || 4).map((x) => 切(x, 8));
    else if (s.role === "table") o.rows = [["項目", "金額"], ["装飾", "30,000"], ["材料", "20,000"], ["雑費", "10,000"]]
      .slice(0, Math.max(2, s.行数の目安 || 4));
    else if (s.role === "chart") o.chart = { type: "pie", title: "費用の内訳",
      labels: ["装飾", "材料", "雑費", "飲食"], series: [{ name: "万円", data: [3, 2, 1, 4] }] };
    else if (s.role === "quote") { o.text = 切("待たせない。それが満足度を動かす。", s.文字数上限); o.caption = "アンケート"; }
    return o;
  });
  let 書く = r2.書くところ, 回 = 0, 最後 = null;
  while (書く && 書く.length && 回 < 8) {
    最後 = V.pipeline.deckWrite({ pages: 書く.map((p) => ({ page: p.page, slots: 書く1(p.page, p.スロット) })) });
    書く = 最後.書くところ; 回++;
  }
  T("★ 5 枚ずつで 全部書き終わる", 回 <= 4 && (!書く || !書く.length), { 回 });
  T("★ 直してほしいところが 出ない", 最後.直してほしいところ === "なし", 最後.直してほしいところ);
  const r4 = V.pipeline.deckFinish();
  T("★★ 10 枚 仕上がる", !r4.だめ && /10 枚/.test(r4.やった || ""), r4);
  T("★★ 崩れ 0", r4.崩れ === 0, r4);
  T("★ レイアウトが 5 種類以上", parseInt(r4.レイアウトの種類) >= 5, r4.レイアウトの種類);

  const out = V.toWorkplace(V.pipeline.状態().deck).content;
  const 型 = {};
  out.slides.forEach((s) => s.elements.forEach((e) => { 型[e.type] = (型[e.type] || 0) + 1; }));
  T("★ Slides の中身になる（10 枚）", out.slides.length === 10);
  T("★★ 表・グラフ・大きな数字が すべて入る",
    (型.table || 0) > 0 && (型.chart || 0) > 0 && (型.number || 0) > 0, 型);
  T("★★ 文字だけのページが 無い",
    out.slides.every((s) => s.elements.some((e) => e.type !== "text")),
    out.slides.map((s) => Object.keys(s.elements.reduce((a, e) => { a[e.type] = 1; return a; }, {})).join("+")));
  T("★ 部品に 色・書体が 明示されている（テーマ任せにしない）",
    out.slides.every((s) => s.elements.every((e) => e.color || e.fill || e.palette || e.chart || e.rows || e.fontStack)));
  T("★ 背景が 1 枚ごとに入る", out.slides.every((s) => !!s.background));
  T("★ どの Seed から作ったかが 残る", !!out.designSeed);
  T("★ 座標は すべて 4 の倍数",
    out.slides.every((s) => s.elements.every((e) => e.x % 4 === 0 && e.y % 4 === 0)),
    out.slides[0].elements.map((e) => e.x + "," + e.y).slice(0, 5));
  T("★ 中身が 空のままでは 終われない", (() => {
    V.pipeline.捨てる();
    V.pipeline.deckStart({ title: "x", pageCount: 3, pages: [{ purpose: "title" }, { purpose: "detail" }, { purpose: "summary" }] });
    V.pipeline.deckDesign({ hue: 0, scheme: "mono", mode: "light", fontPair: 0, typeScale: 1.25,
      grid: 6, spacing: "normal", shape: "sharp", accent: "rule", background: "plain", layouts: [] });
    return !!V.pipeline.deckFinish().だめ;
  })());
}

/* ══ 出力に 色コードや px が 混ざっていないか（第 1 原則）═══════════ */
節("LLM に出させるものの点検");
{
  V.pipeline.捨てる();
  const r1 = V.pipeline.deckStart({ title: "x", pageCount: 3,
    pages: [{ purpose: "title" }, { purpose: "budget" }, { purpose: "summary" }] });
  const 文字 = JSON.stringify(r1);
  T("★★ 軸の説明に 色コードが 1 つも無い", !/#[0-9a-fA-F]{6}/.test(文字));
  T("★★ 軸の説明に 書体名が 1 つも無い",
    !/Noto Sans|Inter|Anton|Helvetica|Roboto/.test(文字), (文字.match(/Noto Sans|Inter|Anton/) || [])[0]);
  T("★ 軸の説明に px 指定が 無い", !/\d+\s*px/.test(文字));
  T("★ 選べる値が すべて示されている",
    V.seed.ORDER.every((k) => k === "fontPair" || (r1.デザインの軸[k] && r1.デザインの軸[k].選べる)));
}

/* ══ 既存機能を壊していないか（読み込みだけ確認）════════════════════ */
節("既存への影響");
{
  T("★ design/ は VQD だけを触る（VQ2 を作らない）",
    typeof globalThis.VQ2 === "undefined" || !globalThis.VQ2.workplace);
  T("★ Workplace が無い所では 書き出しを 黙って諦める",
    V.pipeline.書き出す({ pages: [], tokens: V.derive({}) }) === false);
}

console.log("\n" + ok + " 件 通過 ／ " + ng + " 件 失敗");
process.exit(ng ? 1 : 0);
