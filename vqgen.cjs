/* ══════════════════════════════════════════════════════════════════════
   生成テスト A〜E（V3 §48-4）

   **ここで測るのは「何を作ると決めたか」と「返ってきたものを取り込めるか」**。
   実際のモデル出力は毎回変わるので、合否の基準にしない（Bridge も呼ばない）。
   代わりに、
     ・条件 → 要件の読み取り → 教材の解析 → 候補の絞り込み → 配分
     ・その配分どおりの JSON が返ってきたとして、取り込み・検証・保存まで通るか
   を通しで確かめる。4 択へ寄っていないかは、ここで分かる。
   ══════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  NG   " + n + (x ? "  → " + x : ""))); };

const HIDE = () => {
  ["firstLaunchOverlay", "vqbFlow", "vqNewAuth", "authGate", "authBootSplash"].forEach((id) => {
    const e = document.getElementById(id);
    if (e) { e.hidden = true; e.style.setProperty("display", "none", "important"); }
  });
  document.body.classList.remove("auth-booting", "auth-gate-open");
  document.body.setAttribute("data-ui-v2", "1");
};

/* 5 つの条件。数字（問題数・最低形式数）は指示のとおり。 */
const CASES = [
  { id: "A", title: "10 問 / 4 択なし / 最低 5 形式 / テキスト教材",
    count: 10, minTypes: 5, mock: false, sourceOnly: false,
    instruction: "この文章から 10 問つくってください。4択は使わないでください。",
    text: "「光合成」とは、植物が光のエネルギーを使って二酸化炭素と水から養分をつくるはたらきのことをいう。"
        + "「呼吸」とは、養分を分解してエネルギーを取り出すはたらきである。まず光が葉に当たり、次に water が吸い上げられ、"
        + "最後に養分がつくられる。原因と結果のつながりを押さえること。植物は「被子植物」と「裸子植物」に分類される。"
        + "被子植物はさらに単子葉類と双子葉類に分けられる。1953年に構造が解明された。".repeat(3),
    attachments: [] },
  { id: "B", title: "20 問 / バランス / PDF 教材 / 資料限定 ON",
    count: 20, minTypes: 6, mock: false, sourceOnly: true, style: "auto",
    instruction: "添付の資料から 20 問つくってください。",
    text: "資料本文。用語と定義が並ぶ。「三権分立」とは立法・行政・司法を分けることをいう。次の表を見なさい。表 1 のとおり。"
        + "1889年に大日本帝国憲法が発布された。1947年に日本国憲法が施行された。原因と結果のつながりを押さえる。".repeat(6),
    attachments: [{ kind: "pdf", name: "kyouzai.pdf", mime: "application/pdf", pageCount: 18, hasTable: true }] },
  { id: "C", title: "英語（スペリング・並べ替え・穴埋め・書き取り・英作文）",
    count: 12, minTypes: 4, mock: false, sourceOnly: false, subject: "english",
    instruction: "英語で 12 問。スペリング、並べ替え、穴埋め、ディクテーション、英作文を使ってください。",
    requestedTypes: ["spelling", "reorder_english", "fill_blank", "dictation", "english_writing"],
    text: "apple（りんご）、orange（みかん）、school（学校）。I have a pen. She goes to school every day."
        + "関係代名詞 which を使った文をつくる。".repeat(4),
    attachments: [] },
  { id: "D", title: "日本史（年代順・人物と出来事・資料穴埋め・根拠説明・複合大問）",
    count: 15, minTypes: 5, mock: false, sourceOnly: false, subject: "social",
    instruction: "日本史で 15 問。年代順、人物と出来事のマッチング、資料穴埋め、根拠説明、複合大問を使ってください。",
    requestedTypes: ["reorder_chronology", "matching_person_event", "fill_blank_source", "evidence_explain", "composite"],
    text: "1868年に明治維新が起こった。1889年に大日本帝国憲法が発布された。1894年に日清戦争が始まった。"
        + "伊藤博文は初代内閣総理大臣である。「版籍奉還」とは藩の土地と人民を朝廷へ返すことをいう。"
        /* 複合大問はまとまった本文がないと作れない。**本文があるときの条件**として測る。 */
        + "この改革が行われた原因と結果を説明できるようにする。次の資料を読んで答えなさい。".repeat(20),
    attachments: [] },
  { id: "E", title: "Quick Mock 50 問 / 100 点 / 50 分 / 最低 8 形式 / 紙に出せる形式だけ",
    count: 50, minTypes: 8, mock: true, sourceOnly: false, subject: "social",
    instruction: "50 問・100 点・50 分の試験をつくってください。",
    text: "用語と定義。1868年、1889年、1894年。表 1 のとおり。グラフを読み取る。原因と結果。分類の観点。"
        + "まとまった本文がある。まず、次に、最後に。".repeat(10),
    attachments: [] }
];

/* 配分どおりの JSON を組み立てる（AI が言われたとおり返した場合）。
   ここを甘くしない — 実際に取り込める形でしか作らない。 */
const RUN = (cases) => {
  const B = VQ2.blueprint, P = VQ2.qplan, Q = VQ2.qtypes, S = VQ2.schema, V = VQ2.validate;

  function fakeAnswer(type, i) {
    const e = Q.engineOf(type);
    const base = { id: "g" + i, type: type, points: 2, topic: "見本の単元",
                   explanation: "見本の解説です。", difficulty: "normal", estimatedTime: 60,
                   reasonForType: "見本", sourceReferences: [{ sourceId: "s1", quote: "根拠", confidence: 0.9 }] };
    if (e === "single_choice" || e === "true_false" || e === "image_choice" || e === "audio_choice")
      return Object.assign(base, { question: "見本の問い " + i + " はどれですか。",
        choices: [{ text: "ただしい", isCorrect: true }, { text: "ちがう" }, { text: "べつ" }, { text: "もうひとつ" }] });
    if (e === "multi_choice")
      return Object.assign(base, { question: "あてはまるものをすべて選びなさい（" + i + "）。",
        choices: [{ id: "c1", text: "あてはまる" }, { id: "c2", text: "ちがう" },
                  { id: "c3", text: "これもあてはまる" }, { id: "c4", text: "ちがう2" }],
        correctAnswers: ["c1", "c3"] });
    if (e === "text_input") return Object.assign(base, { question: "空欄に入る語を書きなさい（" + i + "）。", correctAnswer: "こたえ" + i });
    if (e === "numeric_input") return Object.assign(base, { question: "値を求めなさい（" + i + "）。", correctAnswer: "12", tolerance: 0 });
    if (e === "fill_blank") return Object.assign(base, { question: "日本の首都は【　】である（" + i + "）。", blanks: [{ answer: "東京" }] });
    if (e === "reorder") return Object.assign(base, { question: "正しい順に並べなさい（" + i + "）。", items: ["いち", "に", "さん"] });
    if (e === "matching") return Object.assign(base, { question: "結びなさい（" + i + "）。",
      pairs: [{ left: "日本", right: "東京" }, { left: "フランス", right: "パリ" }] });
    if (e === "classification") return Object.assign(base, { question: "分けなさい（" + i + "）。",
      groups: ["なかまA", "なかまB"], items: [{ text: "こう1", group: "なかまA" }, { text: "こう2", group: "なかまB" }] });
    if (e === "table_fill") return Object.assign(base, { question: "表を完成させなさい（" + i + "）。",
      table: { columns: ["国", "首都"], rows: [{ cells: ["日本", { answer: "東京" }] }] } });
    if (e === "chart_read") return Object.assign(base, { question: "グラフから読み取れる値は（" + i + "）。",
      chart: { kind: "bar", title: "見本", categories: ["1970", "1980"], series: [{ name: "数", values: [120, 340] }], unit: "件" },
      correctAnswer: "340" });
    if (e === "error_correction") return Object.assign(base, { question: "誤りを直しなさい。He go to school.（" + i + "）",
      errors: [{ wrong: "go", correct: "goes" }] });
    if (e === "free_text") return Object.assign(base, { question: "理由を説明しなさい（" + i + "）。",
      modelAnswer: "見本の模範解答です。",
      rubric: [{ description: "要点に触れている", points: 2 }] });
    if (e === "dictation") return Object.assign(base, { question: "聞こえたとおりに書きなさい（" + i + "）。", correctAnswer: "This is a pen." });
    if (e === "flashcard") return Object.assign(base, { front: "おもて" + i, back: "うら" + i });
    if (e === "composite") return Object.assign(base, { instruction: "次の資料を読んで答えなさい。",
      context: "見本の共通資料（" + i + "）。",
      children: [fakeAnswer("multiple_choice_single", i * 100 + 1), fakeAnswer("word_input", i * 100 + 2)] });
    /* 画像・位置など、資料が無いと作れないものは AI も作れない。null を返す。 */
    return null;
  }

  return cases.map((c) => {
    const analysis = B.analyzeContent({ text: c.text, attachments: c.attachments });
    const req = B.extractRequirements(c.instruction, {
      subject: c.subject || "", count: c.count, style: c.style || "auto",
      sourceOnly: c.sourceOnly, requestedTypes: c.requestedTypes || [],
      mode: c.mock ? "mock" : "preset"
    });
    const cand = B.candidates(req, analysis, {});
    const exclude = cand.excluded.map((e) => e.type);
    const plan = P.planMix({
      count: c.count, style: (c.requestedTypes || []).length ? "manual" : (c.style || "auto"),
      types: c.requestedTypes || [], subject: c.subject || "",
      hints: B.toHints(analysis), exclude: exclude, sourceOnly: c.sourceOnly,
      mode: c.mock ? "mock" : "", mock: !!c.mock, requirements: req
    });

    /* 配分どおりに「AI が返した」ことにして、取り込みまで通す。 */
    const raw = [];
    let n = 0;
    plan.items.forEach((it) => {
      for (let k = 0; k < it.count; k++) {
        const one = fakeAnswer(it.type, ++n);
        if (one) raw.push(one);
      }
    });
    const imported = P.importAll(raw, { sourceOnly: c.sourceOnly, mock: !!c.mock });

    /* 保存できるところまで見る（出題できる状態か）。 */
    const preset = S.emptyPreset({ name: "生成テスト " + c.id, subjectId: "sub:" + (c.subject || "other"),
                                   questions: imported.questions });
    const chk = V.validatePresetForSave(preset, { requireAnswerable: true, requireRubric: true });
    const saveErrors = (chk.issues || []).filter((i) => i.severity === "error" || i.level === "error");

    const gotTypes = {};
    imported.questions.forEach((q) => { gotTypes[q.type] = (gotTypes[q.type] || 0) + 1; });
    const engines = {};
    imported.questions.forEach((q) => { engines[q.engine || Q.engineOf(q.type)] = 1; });
    const choiceCount = imported.questions.filter((q) =>
      B.isChoiceEngine(q.engine || Q.engineOf(q.type))).length;

    return {
      id: c.id, title: c.title,
      planned: plan.items.map((i) => ({ type: i.type, name: i.name, count: i.count })),
      plannedTotal: plan.items.reduce((a, i) => a + i.count, 0),
      plannedTypes: plan.items.length,
      notes: plan.notes,
      distribution: plan.distribution,
      unavailableRequested: cand.unavailableRequested,
      gotTotal: imported.questions.length,
      gotTypes: Object.keys(gotTypes).length,
      gotEngines: Object.keys(engines).length,
      typeList: Object.keys(gotTypes).map((t) => Q.label(t) + " " + gotTypes[t]),
      choiceRatio: imported.questions.length ? choiceCount / imported.questions.length : 0,
      dropped: imported.dropped.map((d) => d.reason),
      converted: (imported.converted || []).map((x) => x.note),
      flagged: (imported.flagged || []).length,
      saveErrors: saveErrors.map((e) => e.code),
      mockSafe: !c.mock || imported.questions.every((q) =>
        !VQ2.capability.NO_PAPER_ENGINES[q.engine || Q.engineOf(q.type)])
    };
  });
};

(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e).slice(0, 180)));
  await pg.goto(BASE + "/?vq2=all&vqdev=1&cb=" + Date.now(), { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(4200);
  await pg.evaluate(HIDE);
  await pg.waitForTimeout(600);

  const results = await pg.evaluate(RUN, CASES);

  results.forEach((r, i) => {
    const c = CASES[i];
    console.log("\n── テスト " + r.id + "：" + r.title + " ──");
    console.log("  予定 " + r.plannedTotal + " 問 / " + r.plannedTypes + " 形式");
    console.log("  取り込み " + r.gotTotal + " 問 / " + r.gotTypes + " 形式（操作 " + r.gotEngines + " 種類）");
    console.log("  内訳: " + r.typeList.join("・"));
    if (r.notes.length) r.notes.forEach((n) => console.log("  ・" + n));
    if (r.unavailableRequested.length)
      r.unavailableRequested.forEach((u) => console.log("  ・「" + u.name + "」は" + u.reason));
    if (r.dropped.length) console.log("  落とした " + r.dropped.length + " 問: " + r.dropped.slice(0, 2).join(" / "));

    ok(r.id + ": 頼んだ問題数どおりに配分する", r.plannedTotal === c.count, r.plannedTotal + "/" + c.count);
    ok(r.id + ": 最低 " + c.minTypes + " 形式ある", r.gotTypes >= c.minTypes, r.gotTypes + " 形式");
    ok(r.id + ": 1 種類の操作に偏っていない", r.gotEngines >= 3, r.gotEngines + " 種類");
    ok(r.id + ": 取り込みで大きく減らない", r.gotTotal >= Math.floor(c.count * 0.8),
       r.gotTotal + "/" + c.count + " " + r.dropped.slice(0, 2).join(" / "));
    ok(r.id + ": 出題できる状態になる", r.saveErrors.length === 0, r.saveErrors.slice(0, 4).join(","));
    if (c.id === "A")
      ok("A: 4 択が 1 問も入らない", !r.typeList.some((t) => /^4択/.test(t)), r.typeList.join("・"));
    if (c.id === "B")
      ok("B: 資料限定でも根拠つきで通る", r.gotTotal > 0 && r.dropped.every((d) => !/根拠/.test(d)),
         r.dropped.slice(0, 2).join(" / "));
    if (c.id === "E") {
      ok("E: 紙に出せない形式が混ざらない", r.mockSafe);
      ok("E: 選んで答える問題が半分以下", r.choiceRatio <= 0.5 + 1e-9, Math.round(r.choiceRatio * 100) + "%");
    }
  });

  ok("画面のエラーが出ていない", errs.length === 0, errs.slice(0, 2).join(" / "));

  await b.close();
  console.log("\n合格 " + pass + " / 不合格 " + fail);
  process.exit(fail ? 1 : 0);
})();
