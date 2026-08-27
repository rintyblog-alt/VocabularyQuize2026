/* ══════════════════════════════════════════════════════════════════════════
   vqchartsync.cjs — グラフ・表の問題が、保存して読み直しても化けない

   これまで:
     V2 の問題 → V1 のカード（front/back/choices だけ）→ V2 の問題
   と往復させると、q.chart（グラフのデータ）も q.type も落ちていた。
   読み直すと「選択肢がある＝4 択」と判定され、**グラフが 4 択に化けた**。
   PC は手元の V2 の控えを見ているので気づけず、同期した先（スマホ）で出た。

   ここでは **実際に往復させて**、化けないことを確かめる。
   ══════════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (detail ? "  → " + detail : "")); }
};

/* 往復させたい問題たち。V1 に無い形式をひととおり。 */
const QUESTIONS = [
  { なに: "棒グラフ", q: {
      id: "q_1", questionNumber: 1, type: "chart_read", engine: "chart_read", points: 3,
      prompt: "グラフから読み取れることは？",
      chart: { kind: "bar", title: "月別の売上", categories: ["1月", "2月", "3月"],
               series: [{ name: "売上", values: [10, 30, 20] }] },
      choices: [{ id: "c1", label: "A", text: "2月が最も多い", isCorrect: true },
                { id: "c2", label: "B", text: "1月が最も多い", isCorrect: false },
                { id: "c3", label: "C", text: "3月が最も多い", isCorrect: false },
                { id: "c4", label: "D", text: "すべて同じ", isCorrect: false }],
      explanation: "2月の棒がいちばん高い。" } },
  { なに: "円グラフ", q: {
      id: "q_2", questionNumber: 2, type: "chart_read", engine: "chart_read", points: 2,
      prompt: "最も割合が大きいのは？",
      chart: { kind: "pie", title: "内訳", categories: ["A", "B", "C"],
               series: [{ name: "割合", values: [50, 30, 20] }] },
      choices: [{ id: "c1", label: "A", text: "A", isCorrect: true },
                { id: "c2", label: "B", text: "B", isCorrect: false },
                { id: "c3", label: "C", text: "C", isCorrect: false }] } },
  { なに: "折れ線グラフ", q: {
      id: "q_3", questionNumber: 3, type: "chart_read", engine: "chart_read", points: 2,
      prompt: "増え続けているのは？",
      chart: { kind: "line", title: "推移", categories: ["1", "2", "3", "4"],
               series: [{ name: "X", values: [1, 2, 3, 4] }, { name: "Y", values: [4, 3, 2, 1] }] },
      choices: [{ id: "c1", label: "A", text: "X", isCorrect: true },
                { id: "c2", label: "B", text: "Y", isCorrect: false }] } },
  { なに: "表の読み取り", q: {
      id: "q_4", questionNumber: 4, type: "table_read", engine: "chart_read", points: 2,
      prompt: "表から読み取れることは？",
      table: { headers: ["科目", "点数"], rows: [["国語", "80"], ["数学", "95"]] },
      choices: [{ id: "c1", label: "A", text: "数学が高い", isCorrect: true },
                { id: "c2", label: "B", text: "国語が高い", isCorrect: false }] } },
  { なに: "ふつうの4択（壊していないか）", q: {
      id: "q_5", questionNumber: 5, type: "multiple_choice_single", points: 1,
      prompt: "日本の首都は？",
      choices: [{ id: "c1", label: "A", text: "東京", isCorrect: true },
                { id: "c2", label: "B", text: "大阪", isCorrect: false }],
      explanation: "東京。" } },
  { なに: "記述（壊していないか）", q: {
      id: "q_6", questionNumber: 6, type: "short_answer", points: 1,
      prompt: "1 + 1 は？", correctAnswer: "2", acceptedAnswers: ["2"], choices: [] } }
];

(async () => {
  console.log("═══ vqchartsync — 保存して読み直しても化けない ═══");
  const br = await chromium.launch();
  const pg = await br.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e.message).slice(0, 130)));
  await pg.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.waitForFunction(() => window.VQ2 && VQ2.adapter, null, { timeout: 60000 }).catch(() => {});
  await pg.waitForTimeout(1500);

  console.log("\n① 変換の入口が見つかる");
  const has = await pg.evaluate(() => {
    const A = VQ2.adapter || null;
    return { 名: A ? Object.keys(A) : "(無し)",
             v1へ: !!(A && A.presetToV1), v2へ: !!(A && A.presetToV2),
             保存: !!(VQ2.store && VQ2.store.savePreset) };
  });
  ok("V2 → V1 の変換がある（presetToV1）", has.v1へ, JSON.stringify(has.名).slice(0, 200));
  ok("V1 → V2 の変換がある（presetToV2）", has.v2へ);
  ok("実際の保存（store.savePreset）が呼べる", has.保存);
  if (!has.v1へ || !has.v2へ) {
    console.log("\n通過 " + pass + " / 失敗 " + fail); await br.close(); process.exit(1);
  }

  console.log("\n② 1 問ずつ往復させる（V2 → V1 の保存形 → V1 の正規化 → V2）");
  for (const item of QUESTIONS) {
    const r = await pg.evaluate((it) => {
      const A = VQ2.adapter;
      const v2 = { id: "p_test", name: "確認用", questions: [it.q] };
      /* V2 → V1（保存される形） */
      const v1 = A.presetToV1(v2);
      /* 同期は JSON でやり取りするので、文字列を通して戻す
         （関数や undefined が混ざっていたらここで落ちる）。 */
      const v1b = JSON.parse(JSON.stringify(v1));
      /* V1 → V2（受け取った側の読み直し） */
      const back = A.presetToV2(v1b);
      const q2 = (back.questions || [])[0] || {};
      return {
        V1のカードにvq2がある: !!(v1.cards && v1.cards[0] && v1.cards[0].vq2),
        JSONを通ってもある: !!(v1b.cards && v1b.cards[0] && v1b.cards[0].vq2),
        もとのtype: it.q.type, 読み直したtype: q2.type,
        もとのchart: !!it.q.chart, 読み直したchart: !!q2.chart,
        もとのtable: !!it.q.table, 読み直したtable: !!q2.table,
        もとの配点: it.q.points, 読み直した配点: q2.points,
        選択肢の数: (q2.choices || []).length,
        正解: ((q2.choices || []).filter((c) => c.isCorrect)[0] || {}).text || q2.correctAnswer || ""
      };
    }, item);

    console.log("  ── " + item.なに);
    ok("    形式が変わらない（" + r.もとのtype + "）", r.読み直したtype === r.もとのtype,
      r.もとのtype + " → " + r.読み直したtype);
    if (r.もとのchart) ok("    グラフのデータが残る", r.読み直したchart, "消えた");
    if (r.もとのtable) ok("    表のデータが残る", r.読み直したtable, "消えた");
    ok("    配点が変わらない（" + r.もとの配点 + "）", r.読み直した配点 === r.もとの配点,
      r.もとの配点 + " → " + r.読み直した配点);
    if ((item.q.choices || []).length >= 2) {
      ok("    選択肢が残る", r.選択肢の数 === item.q.choices.length,
        item.q.choices.length + " → " + r.選択肢の数);
      const want = item.q.choices.filter((c) => c.isCorrect)[0];
      if (want) ok("    正解が変わらない", r.正解 === want.text, want.text + " → " + r.正解);
    } else {
      ok("    答えが残る", r.正解 === item.q.correctAnswer, item.q.correctAnswer + " → " + r.正解);
    }
  }

  /* ── ③ 見た目（アイコン・バナー）も往復で消えない ── */
  console.log("\n③ アイコンの名前が切られない");
  /* Material Symbols の名前は長い。8 文字で切ると存在しない名前になり、
     何も出なくなる（2026-08-13 報告「アイコンが反映されない」）。 */
  const ICONS = ["local_fire_department", "auto_awesome", "menu_book", "science", "calculate"];
  for (const name of ICONS) {
    const r = await pg.evaluate((icon) => {
      const A = VQ2.adapter;
      const v2 = { id: "p_icon", name: "確認", appearance: { icon: icon, iconImage: "", banner: "" },
                   questions: [{ id: "q_1", questionNumber: 1, type: "short_answer",
                                 prompt: "問", correctAnswer: "答", choices: [] }] };
      const v1 = JSON.parse(JSON.stringify(A.presetToV1(v2)));
      const back = A.presetToV2(v1);
      return { V1のicon: (v1.appearance || {}).icon || "",
               読み直したicon: (back.appearance || {}).icon || "" };
    }, name);
    ok("  " + name + "（" + name.length + "文字）が切られない",
      r.V1のicon === name && r.読み直したicon === name,
      "V1=" + r.V1のicon + " / 読み直し=" + r.読み直したicon);
  }

  console.log("\n④ 上限は schema と揃っている（40 文字）");
  const lim = await pg.evaluate(() => {
    const A = VQ2.adapter;
    const long41 = "a".repeat(41), just40 = "b".repeat(40);
    const mk = (icon) => (A.presetToV1({ id: "p", name: "n", appearance: { icon: icon },
      questions: [] }).appearance || {}).icon || "";
    return { "40文字": mk(just40).length, "41文字": mk(long41).length,
             schemaの上限: (VQ2.schema.validateAppearance({ icon: long41 }, "a", []) || []).length };
  });
  ok("40 文字はそのまま通る", lim["40文字"] === 40, String(lim["40文字"]));
  ok("41 文字は 40 で止める", lim["41文字"] === 40, String(lim["41文字"]));
  ok("schema も 41 文字を弾く", lim.schemaの上限 > 0, "指摘 " + lim.schemaの上限 + " 件");

  ok("画面エラーが出ていない", errs.length === 0, errs.join(" / "));
  await br.close();
  console.log("\n─────────────────────────────");
  console.log("通過 " + pass + " / 失敗 " + fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("落ちた:", e); process.exit(1); });
