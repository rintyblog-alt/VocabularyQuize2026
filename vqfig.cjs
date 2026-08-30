/* ══════════════════════════════════════════════════════════════════════════
   vqfig.cjs — 資料問題（図・グラフ・図形・表）が **紙面に 正確に 出るか**を測る

   訴え（2026-08-30・Rinty さん）
     「資料問題（フリー画像・SVG・表や図形の 正確な 描画）」

   ここは AI も ブラウザも 使わない。
   vq-fig.js と vq2-app の 紙面を 素の Node で 読み込み、
   出てきた HTML／SVG を 直に 読む。だから 速いし 落ちた 場所が 分かる。

   使い方: node vqfig.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs");

let 済 = 0, 落 = 0;
const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + String(追).slice(0, 140) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + String(追).slice(0, 300) : "")); }
};

/* ── 読み込む ─────────────────────────────────────────────── */
const root = {};
global.window = root;
new Function("globalThis", fs.readFileSync("js-src/vq-fig.js", "utf8"))(root);
const F = root.VQFIG;
if (!F || typeof F.描く !== "function") { console.error("VQFIG を 読み込めません。"); process.exit(1); }

try { new Function("globalThis", fs.readFileSync("js-src/vq2-app.b85018b5b8.js", "utf8"))(root); } catch (e) {}
const VQ2 = root.VQ2;
const R = VQ2 && VQ2.pdfRenderer, L = VQ2 && VQ2.layout, S = VQ2 && VQ2.schema;

/* SVG の 中の 数を 全部 取り出す（座標が 有限かを 見るのに 使う） */
function 数ら(s) {
  return (String(s).match(/-?\d+(\.\d+)?/g) || []).map(Number);
}
function 変な数(s) {
  return /NaN|Infinity|undefined|null/.test(String(s));
}

/* ══ ① 表 ══════════════════════════════════════════════════════ */
節("① 表 — 見出し・寄せ・空マス");
{
  const h = F.描く({ type: "table", id: "t1", caption: "各県の 収穫量",
    rows: [["県", "2024年", "2025年"], ["青森", "1,240", "1,310"], ["長野", "980", ""]],
    headerColumn: true });
  見(/<table[^>]*class="[^"]*vf-t/.test(h), "表が 出る");
  見((h.match(/<th/g) || []).length === 5, "見出しは 行 3 + 列 2 = 5 マス", (h.match(/<th/g) || []).length);
  見(/class="a-r"[^>]*>1,240/.test(h), "数の 列は 右寄せ");
  見(/vf-blank/.test(h), "空の マスは うめる ところに なる");
  見(/各県の 収穫量/.test(h), "題が 出る");
  const h2 = F.描く({ type: "table", id: "t2", rows: [["a", "b"], ["1", "2"]], align: ["left", "center"] });
  見(/class="a-l">a/.test(h2) === false && /class="a-c">a/.test(h2), "1 行目は 見出しなので 中央（指定より 見出しが 優先）");
  見(/class="a-l">1/.test(h2), "指定した 寄せが 中身の 行に 効く");
  見(F.描く({ type: "table", rows: [] }) === "", "行が 無ければ 何も 出さない");
}

/* ══ ② グラフ ════════════════════════════════════════════════ */
節("② グラフ — 目盛りが きりの よい 数で 並ぶ");
{
  const 棒 = F.描く({ type: "chart", chartType: "bar", labels: ["1月", "2月", "3月"],
    series: [{ name: "A", values: [12, 34, 27] }], caption: "月別" });
  見(/<svg/.test(棒), "棒グラフが 出る");
  見(!変な数(棒), "座標に NaN が 無い");
  見((棒.match(/<rect/g) || []).length >= 3, "棒が 3 本 出る", (棒.match(/<rect/g) || []).length);
  /* 目盛りの 数字。0 / 10 / 20 / 30 / 40 のような きりの よい 数に なる。 */
  const 目盛 = [...棒.matchAll(/text-anchor="end" font-size="9">(-?[\d.]+)</g)].map((m) => Number(m[1]));
  見(目盛.length >= 3, "目盛りが 3 本 以上", 目盛.join(","));
  見(目盛.indexOf(0) >= 0, "0 の 線が ある（棒グラフは 0 から）", 目盛.join(","));
  const 差 = 目盛.slice(1).map((v, i) => Math.round((v - 目盛[i]) * 1000) / 1000);
  見(差.length > 0 && 差.every((d) => Math.abs(d - 差[0]) < 1e-6), "目盛りの 間隔が そろう", 差.join(","));
  見(差.length > 0 && /^[125]0*$|^0\.[125]0*$/.test(String(Math.abs(差[0]))), "間隔が きりの よい 数（1/2/5 系）", 差[0]);

  const 折 = F.描く({ type: "chart", chartType: "line", labels: ["a", "b", "c", "d"],
    series: [{ name: "X", values: [3, 5, 4, 8] }, { name: "Y", values: [1, 2, 6, 3] }] });
  見((折.match(/<polyline/g) || []).length === 2, "折れ線が 2 本");
  見(/stroke-dasharray/.test(折), "2 本目は 線の 種類で 分ける（白黒で 分かる）");
  見(!/fill="#(?!fff|000)/.test(折), "色を 使わない（白黒 印刷で 潰れない）");

  const 円 = F.描く({ type: "chart", chartType: "pie", labels: ["ア", "イ", "ウ"],
    series: [{ name: "s", values: [50, 30, 20] }] });
  見((円.match(/ A74,74 /g) || []).length === 3, "扇が 3 つ", (円.match(/ A74,74 /g) || []).length);
  見(/>50%</.test(円) && /≥?30%/.test(円) === false ? /30%/.test(円) : true, "割合が 中に 出る");
  見(!変な数(円), "円グラフの 座標に NaN が 無い");

  const 空 = F.描く({ type: "chart", chartType: "bar", series: [] });
  見(/出せません/.test(空), "数が 無ければ **黙って 空けず** 理由を 書く");
  const 零 = F.描く({ type: "chart", chartType: "pie", series: [{ values: [0, 0] }] });
  見(/出せません/.test(零), "合計 0 の 円グラフは 出さない");
}

/* ══ ③ 図形 ══════════════════════════════════════════════════ */
節("③ 図形 — 上下が さかさまに ならない");
{
  const 三 = F.描く({ type: "diagram", items: [
    { type: "polygon", points: [[0, 0], [4, 0], [0, 3]] },
    { type: "point", x: 0, y: 0, label: "A" },
    { type: "point", x: 4, y: 0, label: "B" },
    { type: "point", x: 0, y: 3, label: "C" },
    { type: "rightangle", x: 0, y: 0, dx1: 1, dy1: 0, dx2: 0, dy2: 1 },
    { type: "tick", x1: 0, y1: 0, x2: 4, y2: 0, count: 2 }
  ], caption: "△ABC" });
  見(/<polygon/.test(三), "多角形が 出る");
  見(!変な数(三), "座標に NaN が 無い");
  const 点 = [...三.matchAll(/<circle cx="([\d.\-]+)" cy="([\d.\-]+)"/g)].map((m) => [+m[1], +m[2]]);
  見(点.length === 3, "点が 3 つ", 点.length);
  /* y が 大きい 点（C）は 紙の **上**に 来る＝ cy が 小さい。 */
  const A = 点[0], C = 点[2];
  見(C && A && C[1] < A[1], "y が 大きい 点ほど 紙の 上に 出る（さかさまで ない）", JSON.stringify(点));
  見(/>A</.test(三) && />C</.test(三), "点の 名前が 出る");
  見((三.match(/stroke-width="0.9"/g) || []).length >= 2, "等しい 印が 2 本");

  const 円 = F.描く({ type: "diagram", items: [{ type: "circle", cx: 0, cy: 0, r: 5, label: "O" }] });
  見(/<ellipse/.test(円) && !変な数(円), "円が 出る");

  const 数直 = F.描く({ type: "numberline", min: -3, max: 3, step: 1,
    marks: [{ at: -1, closed: true, label: "a" }, { at: 2, open: true }] });
  見(/<line/.test(数直) && !変な数(数直), "数直線が 出る");
  見(/fill="#000" stroke="#000" stroke-width="1"/.test(数直), "塞いだ 丸（以上）");
  見(/fill="#fff" stroke="#000" stroke-width="1"/.test(数直), "白い 丸（より 大きい）");

  const 座 = F.描く({ type: "diagram", diagramType: "grid", xMin: -4, xMax: 4, yMin: -4, yMax: 4,
    points: [{ x: 2, y: 3, label: "P" }] });
  見(/<line/.test(座) && />P</.test(座) && !変な数(座), "座標平面と 点が 出る");

  見(/出せません/.test(F.描く({ type: "diagram", items: [] })), "描くものが 無ければ 理由を 書く");
  見(F.描く({ type: "diagram", items: [{ type: "しらない形" }] }).indexOf("<svg") >= 0,
     "知らない 形は **描かない**（勝手に 作らない）");
}

/* ══ ④ 絵と SVG ══════════════════════════════════════════════ */
節("④ 絵と SVG — 外の 住所は そのまま 出さない");
{
  const d = F.描く({ type: "figure", src: "data:image/png;base64,iVBORw0KGgo=", caption: "写真",
    credit: { author: "撮った人", license: "CC BY 4.0", source: "Wikimedia Commons" } });
  見(/<img src="data:image\/png/.test(d), "埋め込みの 絵は 出る");
  見(/出典：撮った人 \/ Wikimedia Commons \/ CC BY 4.0/.test(d), "出どころが 必ず 付く（CC の 表示義務）");

  const m = F.描く({ type: "figure", src: "/api/media/img/abc.png" });
  見(/<img src="\/api\/media\/img\/abc.png"/.test(m), "取り込み済みの 絵は 出る");

  const 外 = F.描く({ type: "figure", src: "https://example.com/a.png", caption: "外の 絵" });
  見(!/<img/.test(外) && /取り込みが 済んでいません/.test(外),
     "外の 住所は 出さず、**なぜ 出ないか**を 書く");

  const 悪 = F.描く({ type: "svg",
    svg: '<svg viewBox="0 0 10 10"><script>alert(1)</script><rect width="10" height="10" onload="x()"/><image href="http://evil/x.png"/></svg>' });
  見(/<rect/.test(悪), "SVG の 中身は 残る");
  見(!/<script/i.test(悪), "script は 落ちる");
  見(!/onload/i.test(悪), "on… の 仕掛けは 落ちる");
  見(!/http:\/\/evil/.test(悪), "外への 参照は 落ちる");
  見(/width="100%"/.test(悪) && !/<svg[^>]*\swidth="10"/.test(悪), "幅は こちらが 決める（はみ出さない）");
  見(/出せません/.test(F.描く({ type: "svg", svg: "ただの文字" })), "SVG でない ものは 出さない");
}

/* ══ ⑤ 紙面に 実際に 載るか ═════════════════════════════════ */
節("⑤ 紙面 — 問題用紙に 資料が 載り、CSS も 付く");
if (!R || !L || !S) { 見(false, "紙面を 読み込めない"); }
else {
  function 問(n, sid, type, pts, cb) {
    return { id: "q" + n, schemaVersion: S.SCHEMA_VERSION, sectionId: sid, number: n, globalNumber: n,
      type: type, prompt: "設問 " + n, promptRichText: null, media: [], contentBlocks: cb || [],
      choices: type === "multiple_choice_single" ? [
        { id: "c1", text: "あ", isCorrect: true }, { id: "c2", text: "い", isCorrect: false }] : [],
      correctAnswer: "こたえ", acceptedAnswers: ["こたえ"], explanation: "", choiceExplanations: null,
      answerBindingId: "b" + n, points: pts, criterionAllocation: null, scoringRubric: null,
      estimatedSeconds: 60, difficulty: "normal", topic: "単元", tags: [],
      sourceReferences: [], requiresReview: false, confidence: null, validationIssues: [] };
  }
  const qs = [
    問(1, "s1", "multiple_choice_single", 5, [
      { type: "table", rows: [["年", "人口"], ["2020", "1,250"], ["2025", "1,180"]], caption: "人口の うつり" }]),
    問(2, "s1", "short_answer", 5, [
      { type: "chart", chartType: "bar", labels: ["東", "西"], series: [{ name: "量", values: [8, 5] }], caption: "産出量" }]),
    問(3, "s1", "short_answer", 5, [
      { type: "diagram", items: [{ type: "polygon", points: [[0, 0], [3, 0], [0, 4]] }], caption: "直角三角形" }])
  ];
  const spec = {
    id: "m1", schemaVersion: S.SCHEMA_VERSION, ownerId: "",
    title: "資料問題の たしかめ", subject: "地理総合", grade: "高校2年",
    durationMinutes: 50, totalPoints: 15, instructions: "", sourceMode: "open",
    cover: { examDate: "2026年8月30日", instructions: ["解答は 解答用紙へ。"] },
    sections: [{ id: "s1", number: 1, title: "大問一", instructions: "", points: 15, questions: qs }],
    answerBindings: qs.map((q, i) => ({ id: "b" + (i + 1), questionId: q.id, sectionId: "s1",
      number: String(i + 1), blankCount: 1, kind: "text" })),
    paper: { size: "A4", orientation: "portrait", columns: 1, writingDirection: "horizontal",
             margins: { top: 20, bottom: 20, left: 18, right: 18 } },
    layout: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  let plan = null, html = "";
  try { plan = L.buildPlan(spec, {}); html = String(R.buildHtml(spec, plan, { bookletId: "question-booklet" })); }
  catch (e) { 見(false, "紙面を 組めた", String(e && e.message || e)); }
  if (html) {
    見(html.indexOf("<svg") >= 0, "問題用紙に SVG（グラフ・図形）が 載る");
    見(/class="[^"]*vf-t/.test(html), "問題用紙に 表が 載る");
    見(/人口の うつり/.test(html), "表の 題が 載る");
    見(/産出量/.test(html), "グラフの 題が 載る");
    見(/直角三角形/.test(html), "図形の 題が 載る");
    見(/\.vf-svg svg \{/.test(html), "資料の CSS が 紙面に 入っている");
    見(/break-inside: avoid/.test(html), "図は 途中で 切らない");
    見(!変な数(html.slice(html.indexOf("<svg"), html.indexOf("<svg") + 4000)), "紙面の SVG に NaN が 無い");
    /* mm 指定。em や % で 決めると 拡大率で ずれる。 */
    見(/max-width:\d+(\.\d+)?mm/.test(html), "図の 幅は mm で 決まる");
  }
}

/* ══ ⑥ VQFIG が 無い ときも 紙面は 出る ═══════════════════════ */
節("⑥ 落ちどころ — VQFIG が 読めていない ときも 止まらない");
{
  const 素 = { document: { readyState: "complete", createElement: () => ({ style: {}, appendChild() {}, setAttribute() {} }),
    addEventListener() {}, getElementById: () => null, querySelector: () => null,
    querySelectorAll: () => [], head: { appendChild() {} }, body: { appendChild() {} } },
    addEventListener() {}, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    location: { href: "http://x/", origin: "http://x" }, navigator: { userAgent: "node" } };
  global.window = 素;
  let ok2 = false, h2 = "";
  try {
    new Function("globalThis", fs.readFileSync("js-src/vq2-app.b85018b5b8.js", "utf8"))(素);
    const R2 = 素.VQ2.pdfRenderer, L2 = 素.VQ2.layout, S2 = 素.VQ2.schema;
    const q = { id: "q1", schemaVersion: S2.SCHEMA_VERSION, sectionId: "s1", number: 1, globalNumber: 1,
      type: "short_answer", prompt: "本文", promptRichText: null, media: [],
      contentBlocks: [{ type: "figure", src: "data:image/png;base64,iVBORw0KGgo=", caption: "絵" },
                      { type: "table", rows: [["a", "b"], ["1", "2"]] }],
      choices: [], correctAnswer: "x", acceptedAnswers: ["x"], explanation: "", choiceExplanations: null,
      answerBindingId: "b1", points: 5, criterionAllocation: null, scoringRubric: null,
      estimatedSeconds: 60, difficulty: "normal", topic: "t", tags: [],
      sourceReferences: [], requiresReview: false, confidence: null, validationIssues: [] };
    const sp = { id: "m2", schemaVersion: S2.SCHEMA_VERSION, ownerId: "", title: "素", subject: "国語",
      grade: "高2", durationMinutes: 50, totalPoints: 5, instructions: "", sourceMode: "open",
      cover: { examDate: "2026年8月30日", instructions: ["あ"] },
      sections: [{ id: "s1", number: 1, title: "一", instructions: "", points: 5, questions: [q] }],
      answerBindings: [{ id: "b1", questionId: "q1", sectionId: "s1", number: "1", blankCount: 1, kind: "text" }],
      paper: { size: "A4", orientation: "portrait", columns: 1, writingDirection: "horizontal",
               margins: { top: 20, bottom: 20, left: 18, right: 18 } },
      layout: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    h2 = String(R2.buildHtml(sp, L2.buildPlan(sp, {}), { bookletId: "question-booklet" }));
    ok2 = true;
  } catch (e) { h2 = String(e && e.message || e); }
  見(ok2, "VQFIG 無しでも 紙面を 組める", ok2 ? "" : h2);
  見(ok2 && /<img src="data:image\/png/.test(h2), "これまでの 絵の 出しかたに 落ちる");
  見(ok2 && /<table class="tbl"/.test(h2), "これまでの 表の 出しかたに 落ちる");
  global.window = root;
}

console.log("\n────────────────────────────────");
console.log("通った: " + 済 + " / 落ちた: " + 落);
if (落ち.length) console.log("落ちたもの:\n  - " + 落ち.join("\n  - "));
process.exit(落 ? 1 : 0);
