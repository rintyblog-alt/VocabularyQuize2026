/* AI 実行まわりの 3 つの繋ぎ込みの回帰テスト
   A. 資料の読み取り結果（source_digest）を受け取り、同じ資料の次の依頼へ返す
   B. サーバから届いた計測（metrics）を window.__vqMetrics へ積む
   C. 生成条件・解析状態・できた問題・現在の段を自動保存し、続きから再開できる

   ここでは Bridge を呼ばない。差し替えた Provider が
   本物と同じ順番でイベントを流すだけ（決定論）。 */
import { installLocalStorage, loadV2, group, test, assert, assertEq, report } from "./harness.mjs";

installLocalStorage();
const VQ2 = loadV2([
  "domain/qtypes.js", "domain/qdescriptor.js", "domain/schema.js", "domain/qmodel.js",
  "domain/validate.js", "domain/adapter.js", "domain/score-allocator.js", "domain/grading.js",
  "domain/evaluator.js", "domain/blueprint.js", "domain/answerability.js", "domain/qplan.js",
  "domain/draft.js", "domain/flags.js", "domain/store.js", "domain/capability.js",
  "domain/aijob.js",
  "ui/ai.js"
]);
const AI = VQ2.ai, J = VQ2.aijob, ST = VQ2.store;

/* ── 差し替え Provider ───────────────────────────────────────────
   streamMessage(req, on) は本物と同じく (イベント名, データ) を渡す。 */
const provider = {
  sent: [],
  script: null,
  isAvailable: () => Promise.resolve({ ok: true, engine: "test" }),
  isPaired: () => true,
  cancelGeneration: () => true,
  getJob: () => Promise.resolve(null),
  streamMessage(req, on) {
    this.sent.push(JSON.parse(JSON.stringify(req)));
    const s = this.script;
    return Promise.resolve().then(() => { s(on, req); return true; });
  }
};
globalThis.__vqLocalAI = provider;

const DIGEST = "【資料の要点】\n・第1章 三権分立\n・第2章 選挙制度";
const METRICS = {
  jobId: "job1", totalMs: 12000, level: "deep", taskType: "mock_generation",
  stages: [{ stage: "worker.digest", ms: 10 }, { stage: "draft.create", ms: 9000 }],
  calls: [{ i: 0, role: "generator", model: "qwen", ms: 9000, out: 800 }],
  promptTokens: 5200, completionTokens: 800, modelCalls: 1,
  retries: ["verify.retry"], warnings: 0, structured: { questions: 3 }
};
const STRUCTURED = {
  sections: [{ name: "大問1", questions: [
    { id: "q1", question: "問1", type: "multiple_choice", choices: ["a", "b"], correctAnswer: "a" },
    { id: "q2", question: "問2", type: "short_answer" },
    { id: "q3", question: "問3", type: "short_answer" }
  ] }],
  answerKey: [{ id: "q1", answer: "a" }]
};

/* 正常に 1 本流れる台本 */
function happy(on) {
  on("meta", { jobId: "job1" });
  on("activity", { type: "orchestrator.route", label: "確認しています", status: "running" });
  on("activity", { type: "worker.vision", label: "読み取っています", status: "running", current: 0, total: 3 });
  on("source_digest", { text: DIGEST, files: [{ id: "a1", name: "公民.pdf" }] });
  on("structured", STRUCTURED);
  on("metrics", METRICS);
}
/* 途中で落ちる台本（できた分は返ってきている） */
function crash(on) {
  on("meta", { jobId: "job2" });
  on("activity", { type: "worker.vision", label: "読み取っています", status: "running" });
  on("source_digest", { text: DIGEST, files: [] });
  on("activity", { type: "draft.create", label: "作っています", status: "running" });
  on("structured", STRUCTURED);
  on("metrics", METRICS);
  on("error", { code: "TIMEOUT", message: "時間内に終わりませんでした" });
}

const ATT_A = [{ id: "a1", name: "公民.pdf", pageCount: 3, extractedText: "三権分立について" }];
const ATT_B = [{ id: "b9", name: "別の資料.pdf", pageCount: 1, extractedText: "まったく別" }];

/* ══════════════════════════════════════════════════════════════════
   A. 資料の読み取り結果を受け取り、次の依頼で送り返す
   ══════════════════════════════════════════════════════════════════ */
J.clearAll();
globalThis.__vqMetrics = [];
AI.forgetSourceDigest();
provider.script = happy;

const r1 = await AI.generateMock({ instruction: "大問1を作る", attachments: ATT_A, count: 3, sectionCount: 1,
                                   includedAttachmentIds: ["a1"] });
const r2 = await AI.generateMock({ instruction: "大問2を作る", attachments: ATT_A, count: 3, sectionCount: 1,
                                   includedAttachmentIds: ["a1"] });
const r3 = await AI.generateMock({ instruction: "別資料で作る", attachments: ATT_B, count: 3, sectionCount: 1,
                                   includedAttachmentIds: ["b9"] });

group("A. 資料の読み取り結果（source_digest）");
test("1 回目は読み取り結果を受け取る", () => assertEq(r1.sourceDigest.text, DIGEST));
test("1 回目は送っていない（受け取る前だから）", () =>
  assertEq(provider.sent[0].options.sourceDigest, undefined));
test("2 回目は同じ資料なのでそのまま送り返す", () =>
  assertEq(provider.sent[1].options.sourceDigest, DIGEST));
test("2 回目は読み直していないと分かる", () => assertEq(r2.sourceDigestReused, true));
test("1 回目は読み直しの印が立たない", () => assertEq(r1.sourceDigestReused, false));
test("資料が変われば送らない（別の資料を読んだことにしない）", () =>
  assertEq(provider.sent[2].options.sourceDigest, undefined));
test("資料が変わった回は使い回しにならない", () => assertEq(r3.sourceDigestReused, false));
test("覚えているものを外から引ける", () =>
  assertEq((AI.sourceDigestFor(ATT_A, ["a1"]) || {}).text, DIGEST));

/* ══════════════════════════════════════════════════════════════════
   B. 計測の受け皿
   ══════════════════════════════════════════════════════════════════ */
group("B. 計測（window.__vqMetrics）");
const box = globalThis.__vqMetrics || [];
test("生成のたびに 1 件積まれる", () => assertEq(box.length, 3));
test("段（stages）が空でない", () => assertEq(box[0].stages[0].stage, "worker.digest"));
test("役割（calls）が空でない", () => assertEq(box[0].calls[0].role, "generator"));
test("トークン数がそのまま入る", () => {
  assertEq(box[0].promptTokens, 5200);
  assertEq(box[0].completionTokens, 800);
  assertEq(box[0].modelCalls, 1);
});
test("作り直しの回数が入る", () => assertEq(box[0].retries.length, 1));
test("どの用途の生成かが分かる", () => assertEq(box[0].task, "mock_generation"));

/* ══════════════════════════════════════════════════════════════════
   C. 自動保存と復旧
   ══════════════════════════════════════════════════════════════════ */
group("C. 自動保存（生成条件・解析状態・できた問題・段）");
J.clearAll();
provider.script = crash;
let failedErr = null;
try {
  await AI.generateMock({ instruction: "公民の試験を作ってください", attachments: ATT_A,
                          count: 3, sectionCount: 1, includedAttachmentIds: ["a1"],
                          questionTypes: ["multiple_choice", "short_answer"] });
} catch (e) { failedErr = e; }

const failed = J.list({ status: "failed" })[0] || null;
const failedId = failed ? failed.id : "(台帳に残っていない)";
const saved = failed ? J.loadResume(failed.id) : null;

test("失敗は呼び出し側へ返る", () => assertEq(failedErr && failedErr.code, "TIMEOUT"));
test("台帳に 1 件残る", () => assert(!!failed, "台帳に仕事がありません"));
test("できた問題を捨てない", () => assertEq((failed && failed.partial || {}).questions.length, 3));
test("どこで止まったかが残る", () => assertEq(failed && failed.retryFrom, "draft.create"));
test("再開の材料が下書き置き場に入る", () => assert(!!saved, "保存されていません"));
test("生成条件が残る", () => {
  assert(!!saved, "保存されていません");
  assertEq(saved.condition.message.indexOf("公民の試験を作ってください") >= 0, true);
  assertEq(saved.condition.questionCount, 3);
  assertEq(saved.condition.questionTypes.length, 2);
  assert(saved.condition.includedAttachmentIds.indexOf("a1") >= 0);
});
test("解析状態（読み取り済みの資料）が残る", () => assertEq(saved.sourceDigest.text, DIGEST));
test("生成済みの問題がそのまま残る", () =>
  assertEq(saved.made.sections[0].questions.length, 3));
test("現在の段が残る", () => assertEq(saved.step, "draft.create"));
test("止まった理由が残る", () => assertEq(saved.error.code, "TIMEOUT"));
test("添付そのものは保存しない（選び直しが要ると正直に書く）", () => {
  assertEq(saved.attachmentsNeedReselect, true);
  assertEq(saved.attachments[0].id, "a1");
  assertEq(saved.attachments[0].extractedText, undefined);
});
test("下書き置き場に入っているのは 1 件", () => assertEq(ST.listDrafts("aijob").length, 1));

group("C. ページを開き直したとき");
/* 画面を離れたまま端末が落ちた仕事（実行中のまま残る） */
const stray = J.start({ jobType: "preset_generation", title: "残った仕事" }).job;
J.step(stray.id, "draft.create");
J.keepPartial(stray.id, { questions: [1, 2] });
J.saveResume(stray.id, { task: "preset_generation", condition: { message: "残り" } });

const restored = await AI.restore();
test("動いていない実行中を、実行中のままにしない", () => assertEq(J.get(stray.id).status, "failed"));
test("止まった仕事のできた分は残る", () => assertEq(J.get(stray.id).partial.questions.length, 2));
test("続けられる仕事が返る", () => assert(restored && restored.resumable.entries.length >= 2,
  JSON.stringify(restored && restored.resumable && restored.resumable.entries.length)));
test("続けられる仕事には材料が付く", () => {
  const e = AI.resumable().entries.filter((x) => x.job.id === failed.id)[0];
  assert(!!e && e.resume && e.resume.made, "材料が付いていません");
});

group("C. 続きから作り直す");
provider.script = happy;
/* 覚えている読み取り結果を捨てる。ここで送られるのは
   「保存しておいた解析状態」だけになる（当てずっぽうで通らないように）。 */
AI.forgetSourceDigest();
let resumed = null, resumeErr = null;
try { resumed = await AI.resume(failedId, { attachments: ATT_A }); }
catch (e) { resumeErr = e; }
const lastSent = provider.sent[provider.sent.length - 1];
test("続きから作り直せる", () => assert(!!resumed, "再開できません: " + (resumeErr && resumeErr.message)));
test("前の生成条件でもう一度頼む", () =>
  assertEq(lastSent.message.indexOf("公民の試験を作ってください") >= 0, true));
test("資料を読み直させない（読み取り済みを送る）", () => assertEq(lastSent.options.sourceDigest, DIGEST));
test("前回できていた分を捨てない", () => assertEq((resumed && resumed.resumedFrom || {}).madeCount, 3));

let noAtt = null;
try { await AI.resume(failedId, {}); } catch (e) { noAtt = e; }
test("資料を選び直す必要があることを伝える", () => {
  assertEq(noAtt && noAtt.code, "ATTACHMENTS_REQUIRED");
  assert(/もう一度選んで/.test(noAtt.userMessage), String(noAtt && noAtt.userMessage));
  assert(!!noAtt.made, "できていた分を返していません");
});

group("C. 終わった仕事は「続きから」に出さない");
J.clearAll();
provider.script = happy;
const okRes = await AI.generateMock({ instruction: "ふつうに作る", attachments: ATT_B, count: 3, sectionCount: 1 });
test("完了した仕事は台帳で完了になる", () =>
  assertEq((J.get(okRes.jobRecordId) || {}).status, "completed"));
test("完了した仕事の材料は残さない", () => assertEq(J.loadResume(okRes.jobRecordId), null));
test("続けられる仕事に出てこない", () =>
  assertEq(AI.resumable().entries.filter((e) => e.job.id === okRes.jobRecordId).length, 0));

group("C. 編集中の下書きを押し出さない");
J.clearAll();
ST.saveDraft("preset", "p_edit", { title: "編集中のプリセット" });
const ids = [];
for (let i = 0; i < 8; i++) {
  const j = J.start({ jobType: "preset_generation", title: "仕事" + i }).job;
  ids.push(j.id);
  /* savedAt は同じミリ秒になりうるので、新しい順が分かるよう 1 件ずつずらす */
  J.saveResume(j.id, { task: "preset_generation", condition: { message: "指示" + i }, seq: i });
}
test("再開の材料は上限までしか残さない", () =>
  assert(ST.listDrafts("aijob").length <= J.RESUME_CAP,
         String(ST.listDrafts("aijob").length)));
test("いちばん新しい仕事の材料は残る", () =>
  assert(!!J.loadResume(ids[7]), "最新の材料が消えています"));
test("編集中のプリセットの下書きを消さない", () =>
  assert(!!ST.loadDraft("preset", "p_edit"), "編集中の下書きが消えました"));

process.exit(report("AI 実行の繋ぎ込み（読み取りの使い回し・計測・自動保存）") ? 1 : 0);
