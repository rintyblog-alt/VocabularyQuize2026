/* ══════════════════════════════════════════════════════════════════════
   MockSpec ビルダ / Template Registry / Layout の単体テスト
   ══════════════════════════════════════════════════════════════════════ */
import {
  installLocalStorage, installLocation, loadV2,
  group, test, assert, assertEq, assertDeep, hasError, errorCodes, report
} from "./harness.mjs";

installLocalStorage();
installLocation("");
const VQ2 = loadV2([
  "domain/schema.js", "domain/validate.js", "domain/adapter.js",
  "domain/score-allocator.js", "domain/grading.js", "domain/draft.js",
  "domain/mock-builder.js", "domain/history.js", "domain/flags.js", "domain/store.js",
  "pdf/templates.js", "pdf/layout.js"
]);
const S = VQ2.schema, V = VQ2.validate, MB = VQ2.mockBuilder, TPL = VQ2.templates, L = VQ2.layout, SA = VQ2.scoreAllocator;

/* Orchestrator が返す Mock Draft の形 */
function mockDraft(over) {
  return Object.assign({
    title: "日本史探究 期末考査", subject: "日本史探究", grade: "高3",
    durationMinutes: 50, totalScore: 100,
    sections: [
      { name: "大問1 古代", score: 40, questions: [
        { id: "1", type: "multiple_choice", question: "大化の改新の年は？", points: 10,
          choices: [{ id: "a", text: "645年" }, { id: "b", text: "710年" }, { id: "c", text: "794年" }],
          difficulty: "easy", topic: "古代" },
        { id: "2", type: "short_answer", question: "藤原京の次の都は？", points: 10, choices: [], topic: "古代" }
      ]},
      { name: "大問2 中世", score: 60, questions: [
        { id: "3", type: "descriptive", question: "御成敗式目の意義を説明せよ。", points: 20, choices: [],
          difficulty: "hard", topic: "中世", expectedChars: 120 }
      ]}
    ],
    answerKey: [
      { id: "1", answer: "a", explanation: "645年です。" },
      { id: "2", answer: "平城京", explanation: "710年に遷都しました。" },
      { id: "3", answer: "武家独自の法として…", explanation: "武家社会の基準を示しました。" }
    ]
  }, over || {});
}

/* ══════════════════════════════════════════════════════════════════ */
group("1. Mock Draft → MockSpec");

test("大問と設問が写される", () => {
  const spec = MB.fromDraft(mockDraft(), {});
  assertEq(spec.sections.length, 2);
  assertEq(spec.sections[0].questions.length, 2);
  assertEq(spec.sections[1].questions.length, 1);
});

test("設問番号は大問ごとに 1 から振られる（問1・問2…）", () => {
  const spec = MB.fromDraft(mockDraft(), {});
  assertDeep(spec.sections[0].questions.map((q) => q.number), [1, 2]);
  assertDeep(spec.sections[1].questions.map((q) => q.number), [1]);
});

test("解答用紙の番号は試験全体の通し番号になる", () => {
  const spec = MB.fromDraft(mockDraft(), {});
  assertDeep(spec.answerBindings.map((b) => b.number), ["1", "2", "3"]);
  assertDeep(spec.sections.flatMap((s) => s.questions.map((q) => q.globalNumber)), [1, 2, 3]);
});

test("すべての設問に AnswerBinding が作られる", () => {
  const spec = MB.fromDraft(mockDraft(), {});
  const all = spec.sections.flatMap((s) => s.questions);
  assertEq(spec.answerBindings.length, all.length);
  all.forEach((q) => {
    const b = spec.answerBindings.find((x) => x.id === q.answerBindingId);
    assert(b, "問 " + q.number + " に回答欄がない");
    assertEq(b.questionId, q.id);
    assertEq(b.inputType, q.type);
  });
});

test("選択肢の正解が解答キーから割り当てられる", () => {
  const spec = MB.fromDraft(mockDraft(), {});
  const q1 = spec.sections[0].questions[0];
  assertEq(q1.choices.filter((c) => c.isCorrect).length, 1);
  assertEq(q1.choices.find((c) => c.isCorrect).text, "645年");
});

test("選択肢の正解が本文で書かれていても拾う", () => {
  const d = mockDraft();
  d.answerKey[0].answer = "645年";
  const spec = MB.fromDraft(d, {});
  assertEq(spec.sections[0].questions[0].choices.find((c) => c.isCorrect).id, "a");
});

test("丸囲み数字・カナ・番号の解答も拾う", () => {
  ["①", "ア", "1", "A"].forEach((sym) => {
    const d = mockDraft();
    d.answerKey[0].answer = sym;
    const spec = MB.fromDraft(d, {});
    assertEq(spec.sections[0].questions[0].choices.find((c) => c.isCorrect).id, "a", "記号 " + sym);
  });
});

test("正解が選択肢に無ければ警告を出す（勝手に正解を作らない）", () => {
  const d = mockDraft();
  d.answerKey[0].answer = "存在しない答え";
  const spec = MB.fromDraft(d, {});
  assertEq(spec.sections[0].questions[0].choices.filter((c) => c.isCorrect).length, 0);
  assert(spec.warnings.some((w) => w.includes("見つかりませんでした")), JSON.stringify(spec.warnings));
});

test("解答が無い設問は要確認になる", () => {
  const d = mockDraft();
  d.answerKey = d.answerKey.filter((a) => a.id !== "2");
  const spec = MB.fromDraft(d, {});
  const q2 = spec.sections[0].questions[1];
  assertEq(q2.requiresReview, true);
});

test("記述式に採点基準が自動で用意される", () => {
  const spec = MB.fromDraft(mockDraft(), {});
  const q3 = spec.sections[1].questions[0];
  assertEq(q3.type, "long_answer");
  assert(q3.scoringRubric && q3.scoringRubric.items.length >= 2, "採点基準が無い");
  const sum = q3.scoringRubric.items.reduce((a, r) => a + r.points, 0);
  assertEq(sum, q3.points, "採点基準の合計が配点と合わない");
});

test("AI が出した採点基準の比率を保ったまま配点に合わせる", () => {
  const d = mockDraft();
  d.sections[1].questions[0].scoringRubric = [
    { description: "根拠", points: 3, criterionId: "thinking_judgment_expression" },
    { description: "用語", points: 1, criterionId: "knowledge_skill" }
  ];
  const spec = MB.fromDraft(d, {});
  const items = spec.sections[1].questions[0].scoringRubric.items;
  assertEq(items.reduce((a, r) => a + r.points, 0), 20);
  assert(items[0].points > items[1].points, "比率が保たれていない: " + JSON.stringify(items));
});

test("記述式に想定字数と解答行数が入る", () => {
  const spec = MB.fromDraft(mockDraft(), {});
  const q3 = spec.sections[1].questions[0];
  assertEq(q3.expectedChars, 120);
  const b = spec.answerBindings.find((x) => x.id === q3.answerBindingId);
  assert(b.answerLines >= 3, "解答行数が足りない: " + b.answerLines);
});

test("出典は fileName があるものだけを取る", () => {
  const d = mockDraft();
  d.sections[0].questions[0].sourceReferences = [
    { evidenceId: "e1", fileName: "プリント.pdf", page: 3 }, { evidenceId: "e2" }
  ];
  const spec = MB.fromDraft(d, {});
  assertEq(spec.sections[0].questions[0].sourceReferences.length, 1);
});

/* ══════════════════════════════════════════════════════════════════ */
group("2. finalize（観点別 → 配点 → 検証）");

test("配点が満点へ収束し、検証を error なしで通る", () => {
  const spec = MB.fromDraft(mockDraft(), { totalPoints: 100 });
  const r = MB.finalize(spec);
  assert(r.ok, JSON.stringify(errorCodes(r.issues)));
  const total = r.spec.sections.flatMap((s) => s.questions).reduce((a, q) => a + q.points, 0);
  assertEq(total, 100);
  assertEq(V.errorsOf(r.validation).length, 0);
});

test("大問小計・観点別小計・回答欄がすべて同期される", () => {
  const r = MB.finalize(MB.fromDraft(mockDraft(), { totalPoints: 100 }));
  r.spec.sections.forEach((sec) => {
    const qsum = sec.questions.reduce((a, q) => a + q.points, 0);
    assertEq(sec.points, qsum, "大問小計");
    const csum = sec.criterionAllocation.reduce((a, c) => a + c.points, 0);
    assertEq(csum, qsum, "観点別小計");
    sec.questions.forEach((q) => {
      const b = r.spec.answerBindings.find((x) => x.id === q.answerBindingId);
      assertEq(b.points, q.points, "回答欄の配点");
    });
  });
});

test("採点基準の合計も配点の変化に追随する", () => {
  const r = MB.finalize(MB.fromDraft(mockDraft(), { totalPoints: 137 }));
  assert(r.ok, JSON.stringify(errorCodes(r.issues)));
  r.spec.sections.flatMap((s) => s.questions).forEach((q) => {
    if (!q.scoringRubric) return;
    assertEq(q.scoringRubric.items.reduce((a, i) => a + i.points, 0), q.points, "問 " + q.number);
  });
});

test("満点が変わっても常に一致する（10〜500 点）", () => {
  for (const target of [10, 30, 50, 100, 137, 200, 500]) {
    const r = MB.finalize(MB.fromDraft(mockDraft(), { totalPoints: target }));
    assert(r.ok, target + " 点: " + JSON.stringify(errorCodes(r.issues)));
    const total = r.spec.sections.flatMap((s) => s.questions).reduce((a, q) => a + q.points, 0);
    assertEq(total, target, target + " 点");
  }
});

test("設問数より満点が小さいと、満点を変えずに不可能を報告する", () => {
  const d = mockDraft();
  d.sections[0].questions = Array.from({ length: 50 }, (_, i) => ({
    id: "x" + i, type: "multiple_choice", question: "問" + i, points: 1,
    choices: [{ id: "a", text: "1" }, { id: "b", text: "2" }]
  }));
  d.answerKey = d.sections[0].questions.map((q) => ({ id: q.id, answer: "a" }));
  const spec = MB.fromDraft(d, { totalPoints: 20 });
  const r = MB.finalize(spec);
  assertEq(r.ok, false);
  assert(hasError(r.issues, "cannotReachTotal"), JSON.stringify(errorCodes(r.issues)));
  assertEq(r.spec.totalPoints, 20, "満点が書き換えられた");
});

test("記述式は思考・判断・表現に重く配分される", () => {
  const r = MB.finalize(MB.fromDraft(mockDraft(), { totalPoints: 100 }));
  const q3 = r.spec.sections[1].questions[0];
  const think = q3.criterionAllocation.find((c) => c.criterionId === "thinking_judgment_expression").points;
  const know = q3.criterionAllocation.find((c) => c.criterionId === "knowledge_skill").points;
  assert(think > know, `思考 ${think} <= 知識 ${know}`);
});

/* ══════════════════════════════════════════════════════════════════ */
group("3. 指示文からの推定と構成案");

test("試験時間・満点・大問数を指示文から読む", () => {
  const o = MB.inferSettings("試験時間50分、100点、大問5問。A3横書きで作ってください。");
  assertEq(o.durationMinutes, 50);
  assertEq(o.totalPoints, 100);
  assertEq(o.sectionCount, 5);
  assertEq(o.paperSize, "A3");
  assertEq(o.writingDirection, "horizontal");
});

test("資料限定の指定を読み取る", () => {
  ["この資料だけを使って", "教材外の知識は禁止", "添付範囲のみ", "ワークのみから"].forEach((t) => {
    assertEq(MB.inferSettings(t).sourceOnly, true, t);
  });
});

test("資料限定の指定が無ければ立てない", () => {
  assertEq(MB.inferSettings("日本史の問題を作って").sourceOnly, undefined);
});

test("縦書き・見開きを読み取る", () => {
  const o = MB.inferSettings("縦書き、A3見開きで");
  assertEq(o.writingDirection, "vertical");
  assertEq(o.spread, true);
});

test("構成案のテキストから大問を拾える", () => {
  const b = MB.parseBlueprint([
    "大問1 古代の政治（20点・4問）",
    "  選択問題と正誤問題を含む",
    "大問2 中世の社会（30点・5問）",
    "第3問 資料読解（50点・3問）"
  ].join("\n"));
  assertEq(b.ok, true);
  assertEq(b.sections.length, 3);
  assertEq(b.sections[0].points, 20);
  assertEq(b.sections[0].count, 4);
  assertEq(b.totalPoints, 100);
  assertEq(b.totalQuestions, 12);
});

test("拾えないテキストでは ok=false（それらしい構成を作らない）", () => {
  assertEq(MB.parseBlueprint("すみません、うまく作れませんでした。").ok, false);
});

/* ══════════════════════════════════════════════════════════════════ */
group("4. Template Registry");

test("10 種類のテンプレートが登録されている", () => {
  assert(TPL.IDS.length >= 10, TPL.IDS.length + " 種類しかない");
  ["standard-school-exam", "periodical-exam", "common-test-math-inspired",
   "common-test-japanese-inspired", "english-reading", "history-source-analysis",
   "science-exam", "information-exam", "short-quiz", "custom-blank"].forEach((id) => {
    assert(TPL.get(id), id + " が無い");
  });
});

test("すべてのテンプレートが版を持つ", () => {
  TPL.list().forEach((t) => {
    assert(/^\d+\.\d+\.\d+$/.test(t.version), t.templateId + " の版が不正: " + t.version);
  });
});

test("公式試験そのものだと名乗っていない", () => {
  TPL.list().forEach((t) => {
    assert(!/完全再現|そっくりそのまま|本物の(試験|問題)/.test(t.displayName + t.description),
      t.templateId + ": " + t.displayName);
    assert(!/^(大学入学共通テスト|センター試験|共通テスト)/.test(t.displayName),
      t.templateId + " が公式名を名乗っている: " + t.displayName);
  });
});

test("公式試験に寄せたテンプレートには、公式でない旨の断りが入っている", () => {
  ["common-test-math-inspired", "common-test-japanese-inspired"].forEach((id) => {
    const t = TPL.get(id);
    assert(/公式の試験そのものではありません/.test(t.description), id + " に断りが無い: " + t.description);
  });
});

test("科目からテンプレートを選べる", () => {
  assertEq(TPL.recommend({ subject: "数学II" }).templateId, "common-test-math-inspired");
  assertEq(TPL.recommend({ subject: "英語コミュニケーション" }).templateId, "english-reading");
  assertEq(TPL.recommend({ subject: "日本史探究" }).templateId, "history-source-analysis");
  assertEq(TPL.recommend({ subject: "物理基礎" }).templateId, "science-exam");
});

test("縦書きを指定すると縦書き対応のテンプレートだけが選ばれる", () => {
  const t = TPL.recommend({ subject: "現代文", writingDirection: "vertical" });
  assertEq(t.writingDirection, "vertical");
});

test("横書き指定で縦書きテンプレートは選ばれない", () => {
  const t = TPL.recommend({ subject: "現代文", writingDirection: "horizontal" });
  assert(t.writingDirection !== "vertical", t.templateId);
});

test("対応しない用紙を拒否する", () => {
  const issues = TPL.validatePaper(
    { size: "A4", orientation: "portrait", writingDirection: "horizontal", minimumFontSize: 10, margins: { top: 20, bottom: 20, left: 18, right: 18 } },
    "periodical-exam");
  assert(issues.some((i) => i.code === "paperSize"), JSON.stringify(issues));
});

test("縦書きテンプレートに横書きの紙面を渡すと拒否する", () => {
  const issues = TPL.validatePaper(
    { size: "B4", orientation: "portrait", writingDirection: "horizontal", minimumFontSize: 10, margins: {} },
    "common-test-japanese-inspired");
  assert(issues.some((i) => i.code === "writingDirection"));
});

test("文字が小さすぎる・余白が狭すぎる場合に警告する", () => {
  const issues = TPL.validatePaper(
    { size: "A4", orientation: "portrait", writingDirection: "horizontal", minimumFontSize: 6,
      margins: { top: 3, bottom: 20, left: 18, right: 18 } },
    "standard-school-exam");
  assert(issues.some((i) => i.code === "fontSize"));
  assert(issues.some((i) => i.code === "margin"));
});

test("用紙の実寸が向きを反映する", () => {
  assertDeep(TPL.paperSizeMm({ size: "A4", orientation: "portrait" }), { w: 210, h: 297 });
  assertDeep(TPL.paperSizeMm({ size: "A4", orientation: "landscape" }), { w: 297, h: 210 });
  assertDeep(TPL.paperSizeMm({ size: "A3", orientation: "landscape" }), { w: 420, h: 297 });
});

test("エンジンの利用可否を正直に返す（Typst / LaTeX は未導入）", () => {
  const s = TPL.engineStatus();
  assertEq(s.builtin.available, true);
  assertEq(s.typst.available, false);
  assertEq(s.typst.verified, false);
  assertEq(s.latex.available, false);
  assertEq(s.latex.verified, false);
});

test("使えないエンジンを指定しても組み込みへ落ちる", () => {
  assertEq(TPL.resolveEngine("typst"), "builtin");
  assertEq(TPL.resolveEngine("latex"), "builtin");
  assertEq(TPL.resolveEngine("auto"), "builtin");
});

/* ══════════════════════════════════════════════════════════════════ */
group("5. Layout Plan / Manifest");

function finalSpec() {
  return MB.finalize(MB.fromDraft(mockDraft(), { totalPoints: 100 })).spec;
}

test("3 つの冊子が作られる", () => {
  const plan = L.buildPlan(finalSpec());
  const ids = plan.booklets.map((b) => b.id);
  assertDeep(ids, ["question-booklet", "printable-answer-sheet", "answer-and-explanation"]);
});

test("すべての設問が問題冊子に置かれる", () => {
  const spec = finalSpec();
  const plan = L.buildPlan(spec);
  const qb = plan.booklets[0];
  const placed = qb.blocks.filter((b) => b.type === "question").map((b) => b.questionId);
  const all = spec.sections.flatMap((s) => s.questions.map((q) => q.id));
  assertDeep(placed.sort(), all.sort());
});

test("解答用紙に全設問の回答欄が並ぶ", () => {
  const spec = finalSpec();
  const plan = L.buildPlan(spec);
  const as = plan.booklets[1];
  const areas = as.blocks.filter((b) => b.type === "answer-area");
  assertEq(areas.length, spec.answerBindings.length);
  areas.forEach((a) => {
    assert(spec.answerBindings.some((b) => b.id === a.answerBindingId), "対応しない回答欄: " + a.answerBindingId);
  });
});

test("AI の調整値は許可された範囲へ丸められる", () => {
  const plan = L.buildPlan(finalSpec(), { tuning: { fontScale: 99, questionGapMm: -5, columns: 7 } });
  assert(plan.fontScale <= 1.15 && plan.fontScale >= 0.9, "fontScale=" + plan.fontScale);
  assert(plan.questionGapMm >= 4, "gap=" + plan.questionGapMm);
  assert(plan.columns <= 2, "columns=" + plan.columns);
});

test("未知の調整値は無視される", () => {
  const t = L.sanitizeTuning({ evil: "rm -rf", fontScale: 1.05 });
  assertDeep(Object.keys(t), ["fontScale"]);
});

test("選択肢が短ければ横並びになる", () => {
  const spec = finalSpec();
  const plan = L.buildPlan(spec);
  const ch = plan.booklets[0].blocks.find((b) => b.type === "choices");
  assert(ch.columns >= 2, "短い選択肢が1段のまま: " + ch.columns);
});

test("丸囲み数字は 20 までで、それ以降は括弧つきに落とす", () => {
  assertEq(L.circled(1), "①");
  assertEq(L.circled(20), "⑳");
  assertEq(L.circled(21), "(21)");
});

test("測れなかった場合はページ単位へ縮退し、座標を作らない", () => {
  const spec = finalSpec();
  const plan = L.buildPlan(spec);
  const m = L.buildManifest(spec, plan, null);
  assertEq(m.precision, "page");
  m.questionAnchors.forEach((a) => {
    assertEq(a.region, null, "測っていないのに座標がある");
    assert(a.page >= 1);
  });
});

test("実測があれば座標つきのアンカーになる", () => {
  const spec = finalSpec();
  const plan = L.buildPlan(spec);
  const m = L.buildManifest(spec, plan, {
    pages: [{ page: 1, widthMm: 210, heightMm: 297 }],
    anchors: [{ questionId: "q1", answerBindingId: "b1", page: 1,
                region: { x: 0.1, y: 0.2, width: 0.8, height: 0.1, coordinateSystem: "normalized" } }]
  });
  assertEq(m.precision, "element");
  assertEq(m.questionAnchors[0].region.coordinateSystem, "normalized");
});

test("Manifest から問題のページを引ける", () => {
  const spec = finalSpec();
  const plan = L.buildPlan(spec);
  const m = L.buildManifest(spec, plan, null);
  const p = L.pageOf(m, spec.sections[0].questions[0].id);
  assert(p >= 1, "ページが引けない");
  assert(L.questionsOnPage(m, p).length > 0);
});


/* 全角の数字（日本語入力ではこちらが普通）でも設定を読み取れること */
test("指示文の全角の数字から試験の条件を読み取る", () => {
  const o = MB.inferSettings("５０分１００点満点、大問３つ、縦書きでお願いします");
  assertEq(o.durationMinutes, 50, "試験時間");
  assertEq(o.totalPoints, 100, "満点");
  assertEq(o.sectionCount, 3, "大問数");
  assertEq(o.writingDirection, "vertical", "書字方向");
});

test("構成案が全角で書かれていても読める", () => {
  const bp = MB.parseBlueprint("大問１ 古代（５０点・５問）\n大問２ 中世（５０点・５問）");
  assertEq(bp.ok, true, "解析できていない");
  assertEq(bp.sections.length, 2, "大問数");
  assertEq(bp.sections[0].points, 50, "配点");
  assertEq(bp.sections[0].count, 5, "問数");
});


/* ══════════════════════════════════════════════════════════════════════
   不備の検出・修復（解答欄が無い／正解が無い／解説が無い試験を出さない）
   ══════════════════════════════════════════════════════════════════════ */
group("不備の検出と修復");

/* 資料が多いときに AI が実際に落としてくる形を並べた下書き */
function brokenDraft() {
  return {
    title: "こわれた試験", subject: "日本史", durationMinutes: 50, totalScore: 100,
    sections: [{ name: "大問1", score: 100, questions: [
      { id: "1", type: "true_false", question: "大化の改新は645年である。", points: 10, choices: [] },
      { id: "2", type: "multiple_choice", question: "次のうち正しいものは？", points: 10,
        choices: [{ id: "a", text: "A案" }, { id: "b", text: "B案" }] },
      { id: "3", type: "multiple_choice", question: "唯一の選択肢しかない問題", points: 10,
        choices: [{ id: "a", text: "ただ一つ" }] },
      { id: "4", type: "short_answer", question: "正解が抜けている問題", points: 10, choices: [] },
      { id: "5", type: "descriptive", question: "採点基準が抜けている記述", points: 10, choices: [] }
    ]}],
    answerKey: [
      { id: "1", answer: "正しい" },
      { id: "2", answer: "見つからない答え" },
      { id: "3", answer: "ただ一つ" }
    ]
  };
}

test("正誤問題に選択肢が無いと、受験時に解答欄を作れない不備として検出される", () => {
  const spec = MB.fromDraft(brokenDraft(), {});
  const a = MB.auditSpec(spec, { requireSources: false });
  const tf = a.items.find((i) => i.number === 1);
  assert(tf, "検出できていない");
  assert(tf.needs.includes("choices"), JSON.stringify(tf.needs));
  assertEq(tf.blocking, true, "受験できない不備として扱われていない");
});

test("修復すると正誤問題に「正しい／誤っている」が入り、正解も立つ", () => {
  const r = MB.repairSpec(MB.fromDraft(brokenDraft(), {}), { requireSources: false });
  const q = r.spec.sections[0].questions[0];
  assertEq(q.choices.length, 2);
  assertDeep(q.choices.map((c) => c.text), ["正しい", "誤っている"]);
  assertEq(q.choices[0].isCorrect, true, "正解が立っていない");
  assertEq(q.choices[1].isCorrect, false);
});

test("選択肢が 1 つしか無い選択問題は短答へ落とす（空の解答欄を出さない）", () => {
  const r = MB.repairSpec(MB.fromDraft(brokenDraft(), {}), { requireSources: false });
  const q = r.spec.sections[0].questions[2];
  assertEq(q.type, "short_answer");
  assertEq(q.choices.length, 0);
  assertEq(q.correctAnswer, "ただ一つ");
  const b = r.spec.answerBindings.find((x) => x.id === q.answerBindingId);
  assertEq(b.inputType, "short_answer", "回答欄の形式が追随していない");
});

test("記述式には採点基準が用意される", () => {
  const r = MB.repairSpec(MB.fromDraft(brokenDraft(), {}), { requireSources: false });
  const q = r.spec.sections[0].questions[4];
  assert(q.scoringRubric && q.scoringRubric.items.length >= 1, "採点基準が無い");
  assertEq(q.scoringRubric.items.reduce((a, x) => a + x.points, 0), q.points);
});

test("直せない不備（正解なし・解説なし）は残して伝える", () => {
  const r = MB.repairSpec(MB.fromDraft(brokenDraft(), {}), { requireSources: false });
  const byNum = {};
  r.audit.items.forEach((i) => { byNum[i.number] = i.needs; });
  assert(byNum[2] && byNum[2].includes("answer"), "選択肢にない解答を見逃した: " + JSON.stringify(byNum[2]));
  assert(byNum[4] && byNum[4].includes("answer"), "正解なしを見逃した");
  assert(r.audit.items.every((i) => i.needs.includes("explanation")), "解説なしを見逃した");
});

test("修復しても足りない問題は必ず要確認になる", () => {
  const r = MB.repairSpec(MB.fromDraft(brokenDraft(), {}), { requireSources: false });
  r.audit.items.forEach((i) => {
    const q = r.spec.sections[0].questions.find((x) => x.id === i.questionId);
    assertEq(q.requiresReview, true, "問" + i.number + " が要確認になっていない");
  });
});

test("資料限定のときは出典なしも不備として数える", () => {
  const spec = MB.fromDraft(brokenDraft(), { sourceMode: "source-only" });
  const a = MB.auditSpec(spec);
  assert(a.items.every((i) => i.needs.includes("source")), "出典なしを見逃した");
});

test("AI が埋め直した内容は、足りなかった項目だけに入る", () => {
  const r = MB.repairSpec(MB.fromDraft(brokenDraft(), {}), { requireSources: false });
  const q2 = r.spec.sections[0].questions[1];
  const before = q2.prompt;
  const m = MB.mergeRepairs(r.spec, [
    { id: q2.id, question: "問題文をすり替えようとする", correctAnswer: "A案",
      explanation: "A案が正しいためです。" }
  ], { requireSources: false });
  const after = m.spec.sections[0].questions[1];
  assertEq(after.prompt, before, "問題文が書き換えられた");
  assertEq(after.choices[0].isCorrect, true, "正解が立っていない");
  assertEq(after.explanation, "A案が正しいためです。");
  assertDeep(m.filled[0].filled.sort(), ["answer", "explanation"]);
});

test("すでにある解説は AI の返答で上書きしない", () => {
  const spec = MB.fromDraft(mockDraft(), {});
  const q = spec.sections[0].questions[0];
  const m = MB.mergeRepairs(spec, [{ id: q.id, explanation: "別の解説にすり替え" }], { requireSources: false });
  assertEq(m.spec.sections[0].questions[0].explanation, "645年です。", "既存の解説が壊された");
});

test("資料名の分からない出典は取り込まない（作り話をしない）", () => {
  const spec = MB.fromDraft(brokenDraft(), { sourceMode: "source-only" });
  const m = MB.mergeRepairs(spec, [
    { id: "q1", sourceReferences: [{ evidenceId: "ev_1", page: 3 }] }
  ], { requireSources: true });
  assertEq(m.spec.sections[0].questions[0].sourceReferences.length, 0);
});

test("直らない問題を外すと、番号と回答欄が振り直される", () => {
  const spec = MB.fromDraft(brokenDraft(), {});
  const target = spec.sections[0].questions[1].id;
  const d = MB.dropQuestions(spec, [target]);
  assertEq(d.removed.length, 1);
  const qs = d.spec.sections[0].questions;
  assertEq(qs.length, 4);
  assertDeep(qs.map((q) => q.number), [1, 2, 3, 4]);
  assertDeep(d.spec.answerBindings.map((b) => b.number), ["1", "2", "3", "4"]);
  assertEq(d.spec.answerBindings.length, 4, "外した問題の回答欄が残っている");
  assert(!qs.some((q) => q.id === target), "外れていない");
});

test("外したあとも配点を満点へ収束できる", () => {
  const spec = MB.fromDraft(brokenDraft(), { totalPoints: 100 });
  const d = MB.dropQuestions(spec, [spec.sections[0].questions[1].id]);
  const fin = MB.finalize(d.spec);
  const total = fin.spec.sections.reduce((a, s) =>
    a + s.questions.reduce((b, q) => b + q.points, 0), 0);
  assertEq(total, 100, "満点に合っていない");
});

test("正誤問題に選択肢が無い試験は保存できない（受験できないため）", () => {
  const spec = MB.fromDraft(brokenDraft(), {});
  const issues = V.validateMockSpecForSave(spec);
  assert(hasError(issues, "choiceCount"), "解答欄を作れない問題を通してしまった");
});

test("修復すれば、その不備での保存拒否は消える", () => {
  const r = MB.repairSpec(MB.fromDraft(brokenDraft(), {}), { requireSources: false });
  const issues = V.validateMockSpecForSave(r.spec);
  const tf = r.spec.sections[0].questions[0];
  const path = "sections[0].questions[0]";
  assert(!issues.some((i) => i.code === "choiceCount" && i.path.indexOf(path) === 0),
    "正誤問題の不備が残った: " + JSON.stringify(issues.filter((i) => i.code === "choiceCount")));
  assertEq(tf.choices.length, 2);
});


test("構成案が表（Markdown）で返っても読める", () => {
  const bp = MB.parseBlueprint([
    "以下の構成でどうでしょうか。",
    "",
    "| 大問 | 内容 | 配点 | 問数 |",
    "|---|---|---:|---:|",
    "| 1 | 古代の政治と律令 | 30 | 5 |",
    "| 2 | 平安の文化 | 30 | 5 |",
    "| 3 | 中世の武家社会 | 40 | 8 |"
  ].join("\n"));
  assertEq(bp.ok, true);
  assertEq(bp.sections.length, 3);
  assertDeep(bp.sections.map((s) => s.number), [1, 2, 3]);
  assertDeep(bp.sections.map((s) => s.title), ["古代の政治と律令", "平安の文化", "中世の武家社会"]);
  assertDeep(bp.sections.map((s) => s.points), [30, 30, 40]);
  assertDeep(bp.sections.map((s) => s.count), [5, 5, 8]);
  assertEq(bp.totalPoints, 100);
  assertEq(bp.totalQuestions, 18);
});

test("表に「点」「問」が付いていても読める", () => {
  const bp = MB.parseBlueprint([
    "| 大問1 | 語句の確認 | 20点 | 10問 |",
    "| 大問2 | 記述 | 80点 | 4問 |"
  ].join("\n"));
  assertEq(bp.sections.length, 2);
  assertDeep(bp.sections.map((s) => s.points), [20, 80]);
  assertDeep(bp.sections.map((s) => s.count), [10, 4]);
});

test("表の見出し行と区切り行は大問として数えない", () => {
  const bp = MB.parseBlueprint([
    "| 大問 | 内容 | 配点 | 問数 |",
    "| --- | --- | --- | --- |",
    "| 1 | 古代 | 50 | 5 |"
  ].join("\n"));
  assertEq(bp.sections.length, 1, JSON.stringify(bp.sections));
});


test("サーバが埋めた出典（資料名つき）は設問に残る", () => {
  const spec = MB.fromDraft({
    title: "出典テスト", durationMinutes: 50, totalScore: 10,
    sections: [{ name: "大問1", score: 10, questions: [
      { id: "1", type: "short_answer", question: "問", points: 10, choices: [],
        sourceReferences: [{ evidenceId: "e3", attachmentId: "a1", fileName: "授業プリント.pdf", page: 2 }] }
    ]}],
    answerKey: [{ id: "1", answer: "答", explanation: "解説" }]
  }, {});
  const q = spec.sections[0].questions[0];
  assertEq(q.sourceReferences.length, 1);
  assertEq(q.sourceReferences[0].sourceName, "授業プリント.pdf");
  assertEq(q.sourceReferences[0].page, 2);
  assertEq(q.sourceReferences[0].verified, true);
});

test("資料名の無い出典は捨てる（架空の出典を残さない）", () => {
  const spec = MB.fromDraft({
    title: "出典テスト", durationMinutes: 50, totalScore: 10,
    sections: [{ name: "大問1", score: 10, questions: [
      { id: "1", type: "short_answer", question: "問", points: 10, choices: [],
        sourceReferences: [{ evidenceId: "e9", page: 3 }] }
    ]}],
    answerKey: [{ id: "1", answer: "答", explanation: "解説" }]
  }, {});
  assertEq(spec.sections[0].questions[0].sourceReferences.length, 0);
});

process.exit(report("MockSpec / Template / Layout") > 0 ? 1 : 0);