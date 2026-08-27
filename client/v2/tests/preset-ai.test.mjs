/* ══════════════════════════════════════════════════════════════════════
   プリセット自動作成AI / プリセット編集AI

   A. 問題番号        … 追加しても既存と重ならない。番号を ID として使わない。
   B. AI 修正         … 対象だけが変わる。壊れた提案は適用しない。
   C. 追加指示        … 生成中に送れて、完了前に必ず反映される。

   実行: node client/v2/tests/preset-ai.test.mjs
   ══════════════════════════════════════════════════════════════════════ */
import { installLocalStorage, installLocation, loadV2, group, test, assert, assertEq, assertDeep, report }
  from "./harness.mjs";

installLocalStorage();
installLocation("");
const VQ2 = loadV2([
  "domain/schema.js", "domain/validate.js", "domain/adapter.js",
  "domain/score-allocator.js", "domain/draft.js", "domain/flags.js", "domain/store.js"
]);
const S = VQ2.schema, V = VQ2.validate, D = VQ2.draft, A = VQ2.adapter, ST = VQ2.store;

/* ── 道具 ───────────────────────────────────────────────────────── */

/* AI が返す形。id は毎回 q1,q2,q3… から始まる（実測どおり）。 */
function aiBatch(n, label) {
  return {
    questions: Array.from({ length: n }, (_, i) => ({
      id: "q" + (i + 1),
      type: "multiple_choice",
      question: (label || "AI") + (i + 1),
      choices: [{ id: "a", text: "あ" }, { id: "b", text: "い" },
                { id: "c", text: "う" }, { id: "d", text: "え" }],
      correctAnswer: "a",
      explanation: "解説",
      difficulty: "normal"
    }))
  };
}
/* 手で作った問題 */
function manual(prompt, over) {
  return S.emptyQuestion(Object.assign({
    prompt: prompt,
    choices: [
      { id: "c1", label: "A", text: "選択肢1", explanation: "", isCorrect: true },
      { id: "c2", label: "B", text: "選択肢2", explanation: "", isCorrect: false }
    ],
    createdBy: "manual"
  }, over || {}));
}
/* AI の提案をプリセットへ足す（画面と同じ道すじ） */
function addByAi(preset, draft) {
  const proposed = D.draftToQuestions(draft);
  const diff = D.diffQuestions([], proposed, {});
  const r = D.applyDiff(preset.questions, diff, { all: true });
  preset.questions = r.questions;
  return r;
}
function numbers(list) { return list.map((q, i) => D.numberOf(q, i)); }

/* ══════════════════════════════════════════════════════════════════
   A. 問題番号
   ══════════════════════════════════════════════════════════════════ */
group("A. 問題番号");

test("ケース1: 既存 1,2,3,4,5 に AI で 3 問追加 → 6,7,8", () => {
  const p = S.emptyPreset({ name: "t", questions: [1, 2, 3, 4, 5].map((n) => manual("手書き" + n)) });
  D.stampNumbers(p.questions);
  addByAi(p, aiBatch(3));
  assertDeep(numbers(p.questions), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test("ケース2: 既存 1,2,4,7 に AI で 3 問追加 → 8,9,10（空きは埋めない）", () => {
  const p = A.presetToV2({ id: "p", name: "n", cards: [
    { id: 1, front: "f1", back: "b1" }, { id: 2, front: "f2", back: "b2" },
    { id: 4, front: "f4", back: "b4" }, { id: 7, front: "f7", back: "b7" }
  ]});
  addByAi(p, aiBatch(3));
  assertDeep(numbers(p.questions), [1, 2, 4, 7, 8, 9, 10]);
});

test("ケース2: 保存データ（V1 カード）でも 8,9,10 になっている", () => {
  const p = A.presetToV2({ id: "p", name: "n", cards: [
    { id: 1, front: "f1", back: "b1" }, { id: 2, front: "f2", back: "b2" },
    { id: 4, front: "f4", back: "b4" }, { id: 7, front: "f7", back: "b7" }
  ]});
  addByAi(p, aiBatch(3));
  assertDeep(A.presetToV1(p).cards.map((c) => c.id), [1, 2, 4, 7, 8, 9, 10]);
});

test("ケース3: AI が全問を 1,2,3 として返しても、既存の次から振られる", () => {
  const p = S.emptyPreset({ name: "t", questions: [manual("a"), manual("b")] });
  D.stampNumbers(p.questions);
  const draft = aiBatch(3);
  draft.questions.forEach((q, i) => { q.id = String(i + 1); q.number = i + 1; });
  addByAi(p, draft);
  assertDeep(numbers(p.questions), [1, 2, 3, 4, 5]);
});

test("ケース4: 既存が 0 件なら 1 から始まる", () => {
  const p = S.emptyPreset({ name: "t", questions: [] });
  addByAi(p, aiBatch(3));
  assertDeep(numbers(p.questions), [1, 2, 3]);
});

test("ケース5: 手動と AI が混ざっても番号は重複しない", () => {
  const p = S.emptyPreset({ name: "t", questions: [manual("m1")] });
  D.stampNumbers(p.questions);
  addByAi(p, aiBatch(2, "ai-a"));
  p.questions.push(manual("m2"));
  D.assignAppended(p.questions.slice(0, -1), [p.questions[p.questions.length - 1]]);
  addByAi(p, aiBatch(2, "ai-b"));
  const ns = numbers(p.questions);
  assertEq(new Set(ns).size, ns.length, "番号が重複: " + ns);
  assertDeep(ns, [1, 2, 3, 4, 5, 6]);
});

test("ケース6: 問題番号と内部 ID は別物で、内部 ID は全件一意", () => {
  const p = S.emptyPreset({ name: "t", questions: [manual("m1"), manual("m2")] });
  addByAi(p, aiBatch(3));
  addByAi(p, aiBatch(3));                       /* 2 回目も AI の id は q1,q2,q3 */
  const ids = p.questions.map((q) => q.id);
  assertEq(new Set(ids).size, ids.length, "内部 ID が重複: " + ids.join(","));
  p.questions.forEach((q, i) => {
    assert(String(q.id) !== String(D.numberOf(q, i)), "番号を内部 ID として使っている: " + q.id);
  });
});

test("ケース7: 保存直前に重複が見つかったら、重複したままでは保存しない", () => {
  const dup = manual("同じ ID");
  const p = S.emptyPreset({ name: "t", ownerId: "local",
    questions: [dup, JSON.parse(JSON.stringify(dup))] });
  const before = V.errorsOf(V.validatePresetForSave(p)).map((e) => e.code);
  assert(before.indexOf("duplicateQuestionId") >= 0, "重複を検出できていない: " + before);
  const r = ST.savePreset(p);
  assert(r.ok, "保存できなかった: " + r.message);
  const ids = r.preset.questions.map((q) => q.id);
  assertEq(new Set(ids).size, 2, "重複したまま保存された: " + ids.join(","));
  assert(r.numbering && r.numbering.repairedIds === 1, JSON.stringify(r.numbering));
});

test("番号が重複しているプリセットは検証で error になる", () => {
  const p = S.emptyPreset({ name: "t", questions: [
    manual("a", { questionNumber: 3 }), manual("b", { questionNumber: 3 })
  ]});
  const codes = V.errorsOf(V.validatePresetForSave(p)).map((e) => e.code);
  assert(codes.indexOf("duplicateQuestionNumber") >= 0, codes.join(","));
});

test("既存の問題の番号は、あとから追加しても動かない", () => {
  const p = A.presetToV2({ id: "p", name: "n", cards: [
    { id: 5, front: "f", back: "b" }, { id: 9, front: "f2", back: "b2" }
  ]});
  const before = numbers(p.questions);
  addByAi(p, aiBatch(2));
  assertDeep(numbers(p.questions).slice(0, 2), before);
});

test("手で 1 問足しても、最大番号の次を取る", () => {
  const p = A.presetToV2({ id: "p", name: "n", cards: [
    { id: 1, front: "f", back: "b" }, { id: 6, front: "f2", back: "b2" }
  ]});
  const q = manual("手で追加");
  D.assignAppended(p.questions, [q]);
  assertEq(q.questionNumber, 7);
});

test("複製した問題は元と同じ番号にならない", () => {
  const p = S.emptyPreset({ name: "t", questions: [manual("a"), manual("b")] });
  D.stampNumbers(p.questions);
  const copy = JSON.parse(JSON.stringify(p.questions[0]));
  copy.id = S.newId("q");
  D.assignAppended(p.questions, [copy]);
  assertEq(copy.questionNumber, 3);
  assert(copy.questionNumber !== p.questions[0].questionNumber);
});

/* ══════════════════════════════════════════════════════════════════
   B. AI 修正
   ══════════════════════════════════════════════════════════════════ */
group("B. AI 修正");

/* AI が「1 問だけ直した」返し方をしたとき。id はこちらが渡した内部 ID を返す。 */
function reviseDraft(targetId, over) {
  return { questions: [Object.assign({
    id: targetId, type: "multiple_choice", question: "直した問題文",
    choices: [{ id: "c1", text: "選択肢1" }, { id: "c2", text: "選択肢2" }],
    correctAnswer: "c1", explanation: "直した解説", difficulty: "hard"
  }, over || {})] };
}
function reviseFlow(preset, draft, allowedIds) {
  const proposed = D.draftToQuestions(draft);
  const screen = D.screenRevision(preset.questions, proposed, {
    allowedIds: allowedIds, requireKnownTarget: true
  });
  const diff = D.diffQuestions(preset.questions, screen.accepted, { matchByIndex: true });
  return { screen: screen, diff: diff };
}

test("ケース1: 手で作った 1 問を AI で修正 → その問題だけ変わる", () => {
  const p = S.emptyPreset({ name: "t", questions: [manual("元1"), manual("元2")] });
  D.stampNumbers(p.questions);
  const target = p.questions[0].id;
  const { screen, diff } = reviseFlow(p, reviseDraft(target), [target]);
  assertEq(screen.rejected.length, 0, JSON.stringify(screen.rejected));
  const mods = diff.changes.filter((c) => c.kind === "modify");
  assertEq(mods.length, 1);
  assertEq(mods[0].questionId, target);
  const r = D.applyDiff(p.questions, diff, { questionIds: [target] });
  assertEq(r.questions[0].prompt, "直した問題文");
  assertEq(r.questions[1].prompt, "元2", "対象外の問題まで変わった");
});

test("ケース2: AI が作った問題も同じように修正できる", () => {
  const p = S.emptyPreset({ name: "t", questions: [] });
  addByAi(p, aiBatch(2));
  assertEq(p.questions[0].createdBy, "ai");
  const target = p.questions[0].id;
  const { screen, diff } = reviseFlow(p, reviseDraft(target), [target]);
  assertEq(screen.rejected.length, 0);
  assertEq(diff.modified, 1);
});

test("ケース9: 自作プリセットも AI 作成プリセットと同じように修正できる", () => {
  const own = S.emptyPreset({ name: "自作", questions: [manual("自作1")] });
  D.stampNumbers(own.questions);
  const aiP = S.emptyPreset({ name: "AI製", questions: [] });
  addByAi(aiP, aiBatch(1));
  [own, aiP].forEach((p) => {
    const id = p.questions[0].id;
    const { screen, diff } = reviseFlow(p, reviseDraft(id), [id]);
    assertEq(screen.rejected.length, 0, p.name);
    assertEq(diff.modified, 1, p.name + " は修正案が作れなかった");
  });
});

test("ケース3: プリセット全体の修正案を、適用する前に確認できる", () => {
  const p = S.emptyPreset({ name: "t", questions: [manual("元1"), manual("元2")] });
  D.stampNumbers(p.questions);
  const draft = { questions: p.questions.map((q, i) => ({
    id: q.id, type: "multiple_choice", question: "難しくした" + (i + 1),
    choices: [{ id: "c1", text: "1" }, { id: "c2", text: "2" }],
    correctAnswer: "c1", explanation: "解説", difficulty: "hard"
  })) };
  const { screen, diff } = reviseFlow(p, draft, []);           /* 空＝全体 */
  assertEq(screen.rejected.length, 0);
  assertEq(diff.modified, 2);
  /* まだ本体は変わっていない */
  assertEq(p.questions[0].prompt, "元1", "確認前に本体が書き換わった");
});

test("ケース4: 修正をやめたら元データは 1 文字も変わらない", () => {
  const p = S.emptyPreset({ name: "t", questions: [manual("元1"), manual("元2")] });
  D.stampNumbers(p.questions);
  const snapshot = JSON.stringify(p);
  const id = p.questions[0].id;
  reviseFlow(p, reviseDraft(id), [id]);                        /* 差分を作るだけ */
  assertEq(JSON.stringify(p), snapshot, "差分を作った時点で本体が変わった");
});

test("ケース5: AI が読み取れない結果を返しても元データは残る", () => {
  const p = S.emptyPreset({ name: "t", questions: [manual("元1")] });
  D.stampNumbers(p.questions);
  const snapshot = JSON.stringify(p);
  const proposed = D.draftToQuestions({ questions: [] });      /* 壊れた／空の返答 */
  assertEq(proposed.length, 0);
  const screen = D.screenRevision(p.questions, proposed, { allowedIds: [p.questions[0].id] });
  assertEq(screen.accepted.length, 0, "適用してはいけない");
  assertEq(JSON.stringify(p), snapshot);
});

test("ケース6: AI が内部 ID を書き換えて返しても、ID は変わらない", () => {
  const p = S.emptyPreset({ name: "t", questions: [manual("元1")] });
  D.stampNumbers(p.questions);
  const id = p.questions[0].id, no = p.questions[0].questionNumber;
  const draft = reviseDraft(id);
  const { diff } = reviseFlow(p, draft, [id]);
  const r = D.applyDiff(p.questions, diff, { all: true });
  assertEq(r.questions[0].id, id, "内部 ID が書き換わった");
  assertEq(r.questions[0].questionNumber, no, "問題番号が書き換わった");
  assertEq(r.questions[0].prompt, "直した問題文", "中身は直っているべき");
});

test("ケース6: 差分の項目に id / questionNumber は絶対に載らない", () => {
  assert(D.DIFF_FIELDS.indexOf("id") < 0);
  assert(D.DIFF_FIELDS.indexOf("questionNumber") < 0);
  assert(D.PROTECTED_FIELDS.id === 1 && D.PROTECTED_FIELDS.questionNumber === 1);
});

test("ケース7: AI が対象外の問題まで直して返したら、その分は適用しない", () => {
  const p = S.emptyPreset({ name: "t", questions: [manual("元1"), manual("元2")] });
  D.stampNumbers(p.questions);
  const target = p.questions[0].id, other = p.questions[1].id;
  const draft = { questions: [
    reviseDraft(target).questions[0],
    Object.assign(reviseDraft(other).questions[0], { question: "頼んでいない変更" })
  ]};
  const { screen, diff } = reviseFlow(p, draft, [target]);
  assertEq(screen.accepted.length, 1);
  assertEq(screen.rejected.length, 1);
  assertEq(screen.rejected[0].reason, "outOfScope");
  assertEq(diff.changes.filter((c) => c.kind === "modify").length, 1);
  const r = D.applyDiff(p.questions, diff, { all: true });
  assertEq(r.questions[1].prompt, "元2", "対象外まで書き換わった");
});

test("ケース8: 選択肢に無い正解を返してきたら適用を拒否する", () => {
  const p = S.emptyPreset({ name: "t", questions: [manual("元1")] });
  D.stampNumbers(p.questions);
  const id = p.questions[0].id;
  const draft = reviseDraft(id, { correctAnswer: "存在しない選択肢" });
  const { screen } = reviseFlow(p, draft, [id]);
  assertEq(screen.accepted.length, 0);
  assertEq(screen.rejected[0].reason, "answerNotInChoices");
});

test("問題文が空の修正案は受け取らない", () => {
  const p = S.emptyPreset({ name: "t", questions: [manual("元1")] });
  D.stampNumbers(p.questions);
  const id = p.questions[0].id;
  const { screen } = reviseFlow(p, reviseDraft(id, { question: "   " }), [id]);
  assertEq(screen.rejected[0].reason, "emptyPrompt");
});

test("単一選択なのに正解が 2 つある修正案は受け取らない", () => {
  const p = S.emptyPreset({ name: "t", questions: [manual("元1")] });
  D.stampNumbers(p.questions);
  const id = p.questions[0].id;
  const proposed = D.draftToQuestions(reviseDraft(id));
  proposed[0].choices.forEach((c) => { c.isCorrect = true; });
  const screen = D.screenRevision(p.questions, proposed, { allowedIds: [id] });
  assertEq(screen.rejected[0].reason, "multipleCorrect");
});

test("修正しても作成元・作成日時・出典は失われない", () => {
  const q = manual("元1", {
    createdBy: "manual", createdAt: "2020-01-01T00:00:00.000Z",
    sourceReferences: [{ id: "s1", sourceType: "pdf", sourceName: "資料.pdf", verified: true }]
  });
  const p = S.emptyPreset({ name: "t", questions: [q] });
  D.stampNumbers(p.questions);
  const draft = reviseDraft(q.id);
  const { diff } = reviseFlow(p, draft, [q.id]);
  const r = D.applyDiff(p.questions, diff, { all: true });
  assertEq(r.questions[0].createdBy, "manual");
  assertEq(r.questions[0].createdAt, "2020-01-01T00:00:00.000Z");
  assertEq(r.questions[0].sourceReferences.length, 1, "出典が消えた");
  assert(r.questions[0].updatedAt !== "2020-01-01T00:00:00.000Z", "updatedAt が更新されていない");
});

test("修正案の適用でプリセット ID・所有者・公開状態は変わらない", () => {
  const p = S.emptyPreset({ name: "t", ownerId: "u1", visibility: "public",
                            questions: [manual("元1")] });
  D.stampNumbers(p.questions);
  const id = p.questions[0].id;
  const { diff } = reviseFlow(p, reviseDraft(id), [id]);
  const r = D.applyDiff(p.questions, diff, { all: true });
  p.questions = r.questions;
  assertEq(p.id.indexOf("preset_"), 0);
  assertEq(p.ownerId, "u1");
  assertEq(p.visibility, "public");
});

/* ══════════════════════════════════════════════════════════════════
   C. 追加指示（フォローアップ）
   ══════════════════════════════════════════════════════════════════ */
group("C. 追加指示");

test("ケース1: 生成中に 1 件送ると、その生成へ紐付いて受付済みになる", () => {
  const q = D.newFollowupQueue();
  const r = D.pushFollowup(q, "やっぱり正誤問題を多めにして", { runId: "run-1" });
  assert(r.ok, r.message);
  assertEq(r.item.runId, "run-1");
  assertEq(r.item.status, "queued");
  assertEq(D.pendingFollowups(q, "run-1").length, 1);
});

test("ケース2: 3 件送ると、送った順に並ぶ", () => {
  const q = D.newFollowupQueue();
  ["正誤問題を多めにして", "最後の5問は難しくして", "解説を詳しくして"]
    .forEach((t) => D.pushFollowup(q, t, { runId: "run-1" }));
  const pend = D.pendingFollowups(q, "run-1");
  assertDeep(pend.map((x) => x.seq), [1, 2, 3]);
  const text = D.followupInstruction(pend);
  assert(text.indexOf("1. 正誤問題を多めにして") >= 0, text);
  assert(text.indexOf("3. 解説を詳しくして") >= 0, text);
  assert(text.indexOf("あとの指示") >= 0, "あとの指示を優先する旨が無い");
});

test("順番が入れ替わって渡されても、送信順に並べ直す", () => {
  const q = D.newFollowupQueue();
  ["1つめ", "2つめ"].forEach((t) => D.pushFollowup(q, t, { runId: "r" }));
  const rev = D.pendingFollowups(q, "r").slice().reverse();
  const text = D.followupInstruction(rev);
  assert(text.indexOf("1. 1つめ") >= 0 && text.indexOf("2. 2つめ") >= 0, text);
});

test("ケース4: 反映中でも、新しい指示を受け付けられる", () => {
  const q = D.newFollowupQueue();
  const a = D.pushFollowup(q, "先の指示", { runId: "r" }).item;
  D.setFollowupState(q, [a.id], "applying");
  const b = D.pushFollowup(q, "あとの指示", { runId: "r" });
  assert(b.ok, b.message);
  assertEq(D.pendingFollowups(q, "r").length, 1, "新しい指示が待ち行列に入っていない");
  assertEq(D.pendingFollowups(q, "r")[0].text, "あとの指示");
});

test("ケース5: 反映が終われば queued は 0 件になる（取りこぼさない）", () => {
  const q = D.newFollowupQueue();
  const a = D.pushFollowup(q, "指示A", { runId: "r" }).item;
  D.setFollowupState(q, [a.id], "applying");
  D.setFollowupState(q, [a.id], "applied");
  assertEq(D.pendingFollowups(q, "r").length, 0);
  assertEq(q.items[0].status, "applied");
  assertEq(q.items.length, 1, "送った指示が消えている（画面から追えなくなる）");
});

test("ケース6: 生成を止めたら、未反映の指示は取り消しになる", () => {
  const q = D.newFollowupQueue();
  D.pushFollowup(q, "指示A", { runId: "r" });
  D.pushFollowup(q, "指示B", { runId: "r" });
  const cancelled = D.cancelFollowups(q);
  assertEq(cancelled.length, 2);
  assertEq(D.pendingFollowups(q, "r").length, 0, "取り消したのに次の生成へ持ち越される");
  assertDeep(q.items.map((x) => x.status), ["cancelled", "cancelled"]);
});

test("ケース7: 別の生成に対する指示は受け付けない（別タブと混ざらない）", () => {
  const q = D.newFollowupQueue();
  D.pushFollowup(q, "指示A", { runId: "run-1" });
  const r = D.pushFollowup(q, "別ジョブの指示", { runId: "run-2" });
  assert(!r.ok);
  assertEq(r.error, "OTHER_RUN");
  assertEq(q.items.length, 1);
});

test("ケース7: 待ち行列は自分の生成のぶんだけ返す", () => {
  const q = D.newFollowupQueue();
  D.pushFollowup(q, "指示A", { runId: "run-1" });
  q.items.push({ id: "x", runId: "run-9", text: "他人", status: "queued", seq: 9 });
  assertEq(D.pendingFollowups(q, "run-1").length, 1);
});

test("ケース8: 同じ操作が二重に届いても 1 件しか積まない", () => {
  const q = D.newFollowupQueue();
  const a = D.pushFollowup(q, "解説を詳しくして", { runId: "r", clientKey: "k1" });
  const b = D.pushFollowup(q, "解説を詳しくして", { runId: "r", clientKey: "k1" });
  assert(a.ok);
  assert(!b.ok);
  assertEq(b.error, "DUPLICATE");
  assertEq(q.items.length, 1);
});

test("ケース8: clientKey が無くても、同じ本文の連打は 1 件にまとまる", () => {
  const q = D.newFollowupQueue();
  D.pushFollowup(q, "解説を詳しく して", { runId: "r" });
  const b = D.pushFollowup(q, "解説を詳しくして", { runId: "r" });
  assertEq(b.error, "DUPLICATE", "空白違いの連打が二重に積まれた");
});

test("反映済みの指示と同じ本文なら、あとから送り直せる", () => {
  const q = D.newFollowupQueue();
  const a = D.pushFollowup(q, "解説を詳しくして", { runId: "r" }).item;
  D.setFollowupState(q, [a.id], "applied");
  const b = D.pushFollowup(q, "解説を詳しくして", { runId: "r" });
  assert(b.ok, "反映済みの指示を送り直せない");
  assertEq(q.items.length, 2);
});

test("空文字の指示は拒否する", () => {
  const q = D.newFollowupQueue();
  const r = D.pushFollowup(q, "   ", { runId: "r" });
  assert(!r.ok);
  assertEq(r.error, "EMPTY");
  assertEq(q.items.length, 0);
});

test("長すぎる指示は拒否する（上限つき）", () => {
  const q = D.newFollowupQueue();
  const r = D.pushFollowup(q, "あ".repeat(D.FOLLOWUP_MAX_CHARS + 1), { runId: "r" });
  assert(!r.ok);
  assertEq(r.error, "TOO_LONG");
});

test("動いている生成が無いときは受け付けない", () => {
  const q = D.newFollowupQueue();
  const r = D.pushFollowup(q, "指示", {});
  assert(!r.ok);
  assertEq(r.error, "NO_RUN");
});

test("待ち行列に上限がある（際限なく積ませない）", () => {
  const q = D.newFollowupQueue();
  for (let i = 0; i < D.FOLLOWUP_MAX_QUEUED; i++) D.pushFollowup(q, "指示" + i, { runId: "r" });
  const r = D.pushFollowup(q, "あふれる", { runId: "r" });
  assert(!r.ok);
  assertEq(r.error, "TOO_MANY");
});

test("知らない状態へは変えられない", () => {
  const q = D.newFollowupQueue();
  const a = D.pushFollowup(q, "指示", { runId: "r" }).item;
  let threw = false;
  try { D.setFollowupState(q, [a.id], "なにか"); } catch (e) { threw = true; }
  assert(threw, "未知の状態を通した");
});

/* ══════════════════════════════════════════════════════════════════
   D. 完了までの順番（基本生成 → 追加指示 → 番号 → 検証 → 保存）
   ══════════════════════════════════════════════════════════════════ */
group("D. 完了までの順番");

test("追加指示を反映しても、番号は最大値の次から続く", () => {
  const p = S.emptyPreset({ name: "t", questions: [manual("元1"), manual("元2")] });
  D.stampNumbers(p.questions);
  /* 基本生成のぶん */
  let made = D.draftToQuestions(aiBatch(3));
  /* 追加指示の反映パス（作ったぶんだけが対象） */
  const fu = { questions: made.map((q, i) => ({
    id: q.id, type: "multiple_choice", question: "難しくした" + (i + 1),
    choices: [{ id: "c1", text: "1" }, { id: "c2", text: "2" }],
    correctAnswer: "c1", explanation: "解説", difficulty: "hard"
  })) };
  const prop = D.draftToQuestions(fu);
  const screen = D.screenRevision(made, prop, { allowedIds: made.map((q) => q.id) });
  assertEq(screen.rejected.length, 0, JSON.stringify(screen.rejected));
  made = D.applyDiff(made, D.diffQuestions(made, screen.accepted, { matchByIndex: true }), { all: true }).questions;
  /* そのあとでプリセットへ足す */
  const r = D.applyDiff(p.questions, D.diffQuestions([], made, {}), { all: true });
  assertDeep(numbers(r.questions), [1, 2, 3, 4, 5]);
  assertEq(r.questions[2].difficulty, "hard", "追加指示が反映されていない");
});

test("適用した結果に重複が無いことを applyDiff が自分で確かめている", () => {
  const p = S.emptyPreset({ name: "t", questions: [manual("a")] });
  D.stampNumbers(p.questions);
  const r = D.applyDiff(p.questions, D.diffQuestions([], D.draftToQuestions(aiBatch(4)), {}), { all: true });
  assert(r.identity.ok, JSON.stringify(r.identity));
  assertEq(r.identity.duplicateIds.length, 0);
  assertEq(r.identity.duplicateNumbers.length, 0);
});

test("壊れた状態は repairIdentity で直り、直したことが返る", () => {
  const q1 = manual("a", { id: "same", questionNumber: 2 });
  const q2 = manual("b", { id: "same", questionNumber: 2 });
  const r = D.repairIdentity([q1, q2]);
  assertEq(r.fixedIds, 1);
  assertEq(r.fixedNumbers, 1);
  assert(D.checkIdentity(r.questions).ok);
  assertEq(r.questions[0].id, "same", "先に出てきたほうを動かした");
  assertEq(r.questions[0].questionNumber, 2);
  assertEq(r.questions[1].questionNumber, 3, "最大の次を取っていない");
});

test("保存すると V1 側にも同じ番号で映る", () => {
  const p = A.presetToV2({ id: "p_mirror", name: "n", cards: [
    { id: 2, front: "f", back: "b" }, { id: 5, front: "f2", back: "b2" }
  ]});
  addByAi(p, aiBatch(2));
  const r = ST.savePreset(p, { ownerId: "local" });
  assert(r.ok, r.message);
  const v1 = JSON.parse(localStorage.getItem("wordPractice400.presets.v1") || "[]");
  const mine = v1.find((x) => x.id === "p_mirror");
  assert(mine, "V1 へ映っていない");
  assertDeep(mine.cards.map((c) => c.id), [2, 5, 6, 7]);
});

process.exit(report("プリセット AI（番号 / 修正 / 追加指示）") ? 1 : 0);
