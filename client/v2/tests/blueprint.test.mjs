/* AI 計画エンジン（V3 §11〜§16）
   ・何を頼まれたのかを読み取れる
   ・教材に何があるのかを、無いものまで「ある」と言わずに拾える
   ・作れない形式は理由つきで落とす
   ・**4 択だけにならない**（ここがいちばん大事）
   ・使えない形式を頼まれたとき、黙って 4 択へ置き換えない */
import { installLocalStorage, loadV2, group, test, assert, assertEq, report } from "./harness.mjs";

installLocalStorage();
const VQ2 = loadV2([
  "qtypes", "qdescriptor", "schema", "qmodel", "validate", "adapter", "score-allocator",
  "grading", "evaluator", "blueprint", "answerability", "qplan", "draft", "flags",
  "store", "capability"
].map((f) => "domain/" + f + ".js"));
const B = VQ2.blueprint, P = VQ2.qplan, D = VQ2.qdescriptor, Q = VQ2.qtypes;

group("1. 何を頼まれたのか");
{
  const r = B.extractRequirements("英語の関係代名詞で 12 問つくって。4択は使わないで。");
  test("問題数を読み取る", () => assertEq(r.totalQuestions, 12));
  test("読み取れたことが分かる", () => assertEq(r.stated.totalQuestions, true));
  test("4 択を使わない指定を読み取る", () => assertEq(r.noFourChoice, true));

  const r2 = B.extractRequirements("記述なしで作って", {});
  test("記述を使わない指定を読み取る", () => assertEq(r2.noWriting, true));

  const r3 = B.extractRequirements("いい感じに作って", {});
  test("書かれていない数は勝手に決めたと分かるようにする", () => {
    assertEq(r3.stated.totalQuestions, undefined);
    assertEq(r3.totalQuestions, 10);
  });
  const r4 = B.extractRequirements("暗記中心でお願い");
  test("配分の希望を読み取る", () => assertEq(r4.style, "memorize"));
  const r5 = B.extractRequirements("並べ替えだけで作って");
  test("「〜だけ」は形式の名指しとして読む", () => {
    assert(r5.requestedTypes.length > 0, JSON.stringify(r5.requestedTypes));
    assertEq(r5.onlyRequested, true);
  });
}

group("2. 教材に何があるのか");
{
  const a = B.analyzeContent({ text: "1868年に明治維新が起こった。1889年には大日本帝国憲法が発布された。" });
  test("年代を見つける", () => assert(a.has("chronology")));
  test("画像が無いものを「ある」と言わない", () => assertEq(a.hasImage, false));

  const b = B.analyzeContent({ text: "", attachments: [{ kind: "image", name: "zu.png" }] });
  test("画像の添付を見つける", () => assertEq(b.hasImage, true));

  const c = B.analyzeContent({});
  test("何も無いときは「分からない」にする", () => assertEq(c.known, false));

  const d = B.analyzeContent({ text: "「光合成」とは、植物が光を使って養分をつくるはたらきのことをいう。「呼吸」とは…" });
  test("用語と定義を見つける", () => { assert(d.has("term")); assert(d.has("definition")); });
}

group("3. 作れない形式を落とす");
{
  const req = B.extractRequirements("10問作って", {});
  const noMedia = B.analyzeContent({ text: "用語の説明が並んでいる文章。".repeat(30) });
  const c = B.candidates(req, noMedia, {});
  test("画像が要る形式は残らない", () =>
    assert(!c.types.some((t) => ["image_point", "map_pin", "image_label"].includes(t)),
           c.types.filter((t) => t.indexOf("image") >= 0).join(",")));
  test("落とした理由が残る", () =>
    assert(c.excluded.some((e) => /画像/.test(e.reason)), JSON.stringify(c.excluded.slice(0, 3))));
  test("絞り込みの段が分かる", () => assert(c.steps.length >= 2, JSON.stringify(c.steps)));

  const withImage = B.analyzeContent({ text: "図を見て答える。", attachments: [{ kind: "image", name: "a.png" }] });
  const c2 = B.candidates(req, withImage, {});
  test("画像があれば画像問題が候補に入る", () =>
    assert(c2.types.some((t) => Q.engineOf(t) === "image_point" || Q.engineOf(t) === "image_choice"),
           c2.types.slice(0, 10).join(",")));
}

group("4. 使えない形式を頼まれたとき（黙って 4 択にしない）");
{
  const req = B.extractRequirements("図へのラベル配置で 10 問", { requestedTypes: ["image_label"] });
  const c = B.candidates(req, B.analyzeContent({ text: "文章だけの資料。" }), {});
  test("使えないことを返す", () => assertEq(c.unavailableRequested.length, 1));
  test("理由を返す", () => assert(/画像/.test(c.unavailableRequested[0].reason), c.unavailableRequested[0].reason));
  test("代わりを出す", () => assert(c.unavailableRequested[0].alternatives.length > 0));
}

group("5. 配分の決まり（§12）");
{
  test("問題数で必要な形式数が変わる", () => {
    assertEq(B.minTypesFor(3), 1);
    assertEq(B.minTypesFor(5), 2);
    assertEq(B.minTypesFor(10), 4);
    assertEq(B.minTypesFor(20), 6);
    assertEq(B.minTypesFor(30), 8);
  });
  const only4 = [{ type: "multiple_choice_single", count: 10, engine: "single_choice", name: "4択" }];
  const v = B.validateDistribution(only4, 10, {});
  test("4 択だけは通さない", () => {
    assertEq(v.ok, false);
    assert(v.issues.some((i) => i.code === "tooFewTypes"));
  });
  const mixed = [
    { type: "multiple_choice_single", count: 4, engine: "single_choice", name: "4択" },
    { type: "word_input", count: 2, engine: "text_input", name: "単語入力" },
    { type: "fill_blank", count: 2, engine: "fill_blank", name: "穴埋め" },
    { type: "ordering", count: 2, engine: "reorder", name: "並べ替え" }
  ];
  const v2 = B.validateDistribution(mixed, 10, {});
  test("形式が足りていれば通る", () => assertEq(v2.ok, true));
  test("選ぶだけの問題が半分を超えたら言う", () => {
    const choiceHeavy = [
      { type: "multiple_choice_single", count: 4, engine: "single_choice", name: "4択" },
      { type: "true_false", count: 3, engine: "true_false", name: "○×" },
      { type: "word_input", count: 2, engine: "text_input", name: "単語入力" },
      { type: "fill_blank", count: 1, engine: "fill_blank", name: "穴埋め" }
    ];
    const r = B.validateDistribution(choiceHeavy, 10, {});
    assert(r.issues.some((i) => i.code === "choiceTooMany"), JSON.stringify(r.issues));
  });
}

group("6. 配分を決まりごとへ寄せる");
{
  const items = [{ type: "multiple_choice_single", count: 10, engine: "single_choice", name: "4択" }];
  const pool = ["word_input", "fill_blank", "ordering", "matching", "classification"];
  const fixed = B.enforceDistribution(items, 10, { req: {}, candidates: pool, notes: [] });
  test("足りない形式を足す", () => assert(fixed.items.length >= 4, JSON.stringify(fixed.items)));
  test("合計は変えない", () => assertEq(fixed.items.reduce((a, i) => a + i.count, 0), 10));
  test("足したことを黙っていない", () => assert(fixed.notes.some((n) => /加えました/.test(n)), JSON.stringify(fixed.notes)));

  const only = B.enforceDistribution(items, 10, {
    req: { onlyRequested: true, requestedTypes: ["multiple_choice_single"] }, candidates: pool, notes: []
  });
  test("「4 択だけ」と頼まれたら増やさない", () => {
    assertEq(only.items.length, 1);
    assert(only.exception, only.exception);
  });

  const few = B.enforceDistribution(items, 10, { req: {}, candidates: ["word_input"], notes: [] });
  test("候補が足りないときは、守れなかったと書く", () =>
    assert(few.notes.some((n) => /しかないため/.test(n)), JSON.stringify(few.notes)));
}

group("7. Blueprint");
{
  const bp = B.build({
    instruction: "この資料から 12 問つくって",
    text: "1868年に明治維新。1889年に憲法発布。「版籍奉還」とは藩の土地と人民を朝廷へ返すことをいう。"
        + "原因と結果のつながりを押さえる。分類の観点もある。".repeat(4),
    subject: "social", count: 12
  });
  test("作れる", () => assertEq(bp.ok, true));
  test("頼んだ数と合う", () => assertEq(bp.totalQuestions, 12));
  test("4 択だけにならない", () => assert(bp.typeDistribution.length >= 4, bp.summary));
  test("1 問ずつ、なぜその形式かが入る", () =>
    assert(bp.questions.every((q) => q.reasonForType), JSON.stringify(bp.questions[0])));
  test("1 問ずつ、何を問うかが入る", () =>
    assert(bp.questions.every((q) => q.learningObjective)));
  test("配分の判定が付く", () => assertEq(bp.distribution.ok, true));
  test("年代があるので年代順が入りやすい", () =>
    assert(bp.candidates.types.indexOf("reorder_chronology") >= 0, bp.candidates.types.slice(0, 8).join(",")));
}

group("8. AI へ渡す文");
{
  const bp = B.build({ instruction: "10 問", text: "用語の説明が並ぶ。".repeat(40), count: 10 });
  const prompt = B.promptFor(bp, {});
  test("使ってよい形式が入る", () => assert(/使ってよい問題形式/.test(prompt)));
  test("どんなときに使うかが入る", () => assert(/使う場面/.test(prompt)));
  test("どう採点されるかが入る", () => assert(/採点/.test(prompt)));
  test("内訳が入る", () => assert(/この回で作る内訳/.test(prompt)));
  test("形式ごとに同じ説明を並べない（エンジン単位でまとめる）", () => {
    const n = (prompt.match(/ねらい:/g) || []).length;
    assert(n <= bp.typeDistribution.length, "説明の数 " + n);
  });
}

group("9. 形式の説明がそろっている");
{
  test("説明の無い形式が無い", () => assertEq(D.missing().length, 0, D.missing().join(",")));
  test("AI へ渡す形式には必ず説明がある", () => {
    const list = VQ2.capability.forAi();
    assert(list.length > 0);
    assert(list.every((t) => {
      const d = D.describe(t);
      return d && d.educationalUse && d.outputSchemaSummary && d.scoringMethod;
    }));
  });
}

group("10. qplan と合わせて（4 択だけにしない）");
{
  const plan = P.planMix({ count: 20, style: "auto", subject: "social" });
  test("20 問なら 6 形式以上", () => assert(plan.items.length >= 6, plan.summary));
  test("合計が合う", () => assertEq(plan.items.reduce((a, i) => a + i.count, 0), 20));
  test("同じ形式が 4 割を超えない", () => {
    const max = Math.max(...plan.items.map((i) => i.count));
    assert(max / 20 <= 0.4 + 1e-9, plan.summary);
  });
  test("判定が付いてくる", () => assert(plan.distribution && plan.distribution.ok, JSON.stringify(plan.distribution)));

  const p2 = P.planMix({ count: 10, style: "auto", exclude: ["multiple_choice_single", "choice_2", "choice_3", "choice_5"] });
  test("4 択を外しても作れる", () => {
    assertEq(p2.items.reduce((a, i) => a + i.count, 0), 10);
    assert(!p2.items.some((i) => i.type === "multiple_choice_single"), p2.summary);
  });
}

group("11. 人が書く言い方で形式を指定できる");
{
  /* レジストリの名前をそのまま書く人はいない。実際に書かれる言い方で拾えること。
     ここが拾えないと、指示しても内訳へ入らず、黙って無視される。 */
  const WORDS = [
    ["出来事順", "reorder_events"], ["計算手順", "reorder_steps"], ["実験手順", "reorder_experiment"],
    ["会話順", "reorder_dialog"], ["フローチャート順", "reorder_flow"], ["優先順位", "reorder_priority"],
    ["資料穴埋め", "fill_blank_source"], ["長文穴埋め", "fill_blank_passage"], ["会話文穴埋め", "fill_blank_dialog"],
    ["選択式穴埋め", "fill_blank_choice"], ["人物と出来事", "matching_person_event"],
    ["国と首都", "matching_country_capital"], ["線結び", "matching_line"],
    ["仲間分け", "classification_odd_group"], ["余分を除く", "classification_exclude"],
    ["誤っているものを選択", "choice_incorrect"], ["最適解選択", "choice_best"], ["文章選択", "choice_sentence"],
    ["和訳入力", "translate_ja"], ["英訳入力", "translate_en"], ["表記揺れ許容", "fuzzy_input"],
    ["根拠説明", "evidence_explain"], ["根拠箇所引用", "quote_evidence"], ["比較説明", "compare_explain"],
    ["途中式", "work_steps"], ["証明", "proof"], ["小論文", "dissertation"],
    /* 書き間違い・略した言い方 */
    ["並び替え", "ordering"], ["グラフ", "chart_read"], ["和訳", "translate_ja"], ["時系列", "reorder_chronology"]
  ];
  WORDS.forEach(([word, id]) => {
    test("「" + word + "」で " + id + " を拾う", () => {
      const r = B.extractRequirements("この資料から 10 問。" + word + "を使ってください。", { count: 10 });
      assert(r.requestedTypes.indexOf(id) >= 0, JSON.stringify(r.requestedTypes));
    });
  });
  test("拾った形式は AI へ渡せて、取り込みも通る", () => {
    const ai = VQ2.capability.forAi();
    const ids = [...new Set(WORDS.map(([, id]) => id))];
    const ng = ids.filter((t) => ai.indexOf(t) < 0);
    assertEq(ng.length, 0, ng.join(","));
  });
}

report("AI 計画エンジン（要件・教材解析・候補・配分・Blueprint）");
