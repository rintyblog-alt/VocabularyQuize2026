/* Quick Mock：資料の運び方（参照形式）と、生成中の進みぐあい

   ■ 直したこと 1 ── 資料を分割アップロード経路へ載せ替えた
     これまで Quick Mock はページ画像を imageBase64 で要求 JSON へ直に載せていた
     （shell.js の toAiAttachments）。本体が要求に乗るのでサーバ側で contentHash が
     付かず、**解析キャッシュが構造的に一度も効かない**。さらに JSON に載る量が
     上限になるため、ページ画像は TRANSPORT_SCAN_CAP=12 で頭打ちだった。
     Preset Engine に既にある uploader.js（8MiB 分割・attachmentId 参照）へ載せ替える。

   ■ 直したこと 2 ── 生成中の進みぐあいが動くようにした
     生成中はずっと「0 / N・残りを計算しています」だった。原因は 2 つ。
       ・done を増やす etaDone() が、全部終わったあとに 1 回しか呼ばれない
         （生成中は roundStartedAt を更新するだけの etaRound() しか呼ばれず、
           durations が空 → remainingMs() が null を返し続ける）
       ・分母が ceil(総問題数 / 3) で、実依頼数（大問ごとの ceil の総和）と違う

   ここでは本物を使って確かめる。
     ・uploader.js の Task.ref()（偽物を書かない）
     ・shell.js の AiChat（etaStep / remainingMs / paintEta）
     ・mock-compiler.requestsOf（実依頼数の出どころ）
   時刻は Date.now を差し替えて決めうちにする（実時間に依らせない）。 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  installLocalStorage, installLocation, loadV2, V2,
  group, test, assert, assertEq, report
} from "./harness.mjs";

installLocalStorage();
installLocation("");

/* ── 時計を握る。ETA は経過時間から出るので、実時間で測ると揺れる。 ── */
const REAL_NOW = Date.now;
let CLOCK = 1_700_000_000_000;
Date.now = () => CLOCK;
const tick = (ms) => { CLOCK += ms; };

const VQ2 = loadV2([
  "qtypes", "qdescriptor", "schema", "qmodel", "validate", "adapter", "score-allocator",
  "grading", "evaluator", "blueprint", "answerability", "qplan", "draft", "mock-builder",
  "mock-compiler", "mock-compile-run", "flags"
].map((f) => "domain/" + f + ".js"));

/* ブラウザ用の最小 shim。UI は開かない（純関数と AiChat だけを触る）。 */
globalThis.document = {
  createElement: () => ({ style: {}, setAttribute() {}, addEventListener() {}, click() {} })
};
new Function(readFileSync(join(V2, "ui/uploader.js"), "utf8")).call(globalThis);
new Function(readFileSync(join(V2, "ui/shell.js"), "utf8")).call(globalThis);
new Function(readFileSync(join(V2, "ui/quick-mock.js"), "utf8")).call(globalThis);

const QM = VQ2.quickMock;
const UP = VQ2.upload;
const UI = VQ2.ui;
const MC = VQ2.mockCompiler;

/* ══════════════════════════════════════════════════════════════════
   1. 資料は参照形式で運ぶ（jobId + attachmentId。本体は載せない）
   ══════════════════════════════════════════════════════════════════ */
group("資料は参照形式で運ぶ（分割アップロード）");

/* 本物の Task を作って「送り終えた」状態にする。ref() は本物を使う。 */
function uploadedTask(o) {
  o = o || {};
  const t = new UP.Task({ name: o.name || "授業プリント.pdf", size: o.size || 9_000_000,
                          type: o.mime || "application/pdf" });
  t.jobId = o.jobId || "job_abc";
  t.attachmentId = o.attachmentId || "att_1";
  t.state = o.state || "uploaded";
  /* 送ったあとに端末側で取り出したもの（本文だけ。画像の中身は持たせない） */
  if (o.text) t.extractedText = o.text;
  if (o.pageCount) t.pageCount = o.pageCount;
  if (o.pages) t.pages = o.pages;
  if (o.parent) { t.parentAttachmentId = o.parent; t.pageNumber = o.pageNumber || 1; }
  /* もし誰かが「ついでに本体も持たせよう」とした場合に、
     それが要求へ漏れないことを確かめたいので、わざと持たせておく。 */
  t.imageDataUrl = "data:image/png;base64,AAAABBBBCCCC";
  t.imageBase64 = "AAAABBBBCCCC";
  return t;
}

test("送り終えた資料は jobId と attachmentId で指す", () => {
  const out = QM._attachmentsFromUploads([uploadedTask({})], []);
  assertEq(out.length, 1, "添付が要求へ入っていません");
  assertEq(out[0].attachmentId, "att_1");
  assertEq(out[0].jobId, "job_abc");
  assertEq(out[0].id, "att_1", "id も attachmentId を指すこと（除外指定がこの id で照合する）");
});

test("要求へ本体（base64 / dataUrl / File）を載せない", () => {
  const out = QM._attachmentsFromUploads([uploadedTask({})], []);
  const json = JSON.stringify(out);
  assert(out[0].imageBase64 === undefined, "imageBase64 が要求へ載っています");
  assert(out[0].imageDataUrl === undefined, "imageDataUrl が要求へ載っています");
  assert(out[0].file === undefined, "File が要求へ載っています");
  assert(json.indexOf("AAAABBBBCCCC") < 0, "本体の中身が要求の中に残っています：" + json);
});

test("参照形式かどうかを機械が判定できる（_isByReference）", () => {
  const out = QM._attachmentsFromUploads([uploadedTask({})], []);
  assert(QM._isByReference(out) === true, "参照形式と判定されませんでした");
});

test("base64 が 1 件でも混ざれば参照形式ではない", () => {
  const out = QM._attachmentsFromUploads([uploadedTask({})], []);
  const mixed = out.concat([{ id: "x", attachmentId: "att_9", jobId: "job_abc",
                              imageBase64: "ZZZZ" }]);
  assertEq(QM._isByReference(mixed), false, "本体が混ざっているのに参照形式と言っています");
});

test("旧経路の添付（本体つき）は参照形式と判定しない", () => {
  /* shell.js の toAiAttachments が作る形。attachmentId も jobId も無い。 */
  assertEq(QM._isByReference([{ id: "a1", kind: "image", imageBase64: "AAAA" }]), false);
});

test("まだ送り終えていない資料は要求へ載せない", () => {
  const sending = uploadedTask({ state: "uploading" });
  const failed = uploadedTask({ state: "failed", attachmentId: "att_2" });
  assertEq(QM._attachmentsFromUploads([sending, failed], []).length, 0,
    "送り終えていない資料が要求へ入りました");
});

test("この端末で取り出した本文は添えるが、ページ画像の中身は添えない", () => {
  const t = uploadedTask({ text: "明治維新について。" .repeat(10), pageCount: 3, pages: [1, 2] });
  const out = QM._attachmentsFromUploads([t], []);
  assertEq(out[0].extractedCharacterCount, out[0].extractedText.length);
  assertEq(out[0].pageCount, 3);
  assert(out[0].imageBase64 === undefined, "ページ画像の中身が付いています");
});

test("ページ画像は親の ID を持った別の添付として運ぶ（本体は運ばない）", () => {
  const page = uploadedTask({ attachmentId: "att_p3", parent: "att_1", pageNumber: 3,
                              name: "授業プリント（3ページ）.png", mime: "image/png" });
  const out = QM._attachmentsFromUploads([page], []);
  assertEq(out[0].parentAttachmentId, "att_1");
  assertEq(out[0].pageNumber, 3);
  assert(QM._isByReference(out), "ページ画像が参照形式になっていません");
});

test("手で「使わない」にした印は、送り直しても消えない", () => {
  const t = uploadedTask({});
  const prev = [{ id: "att_1", attachmentId: "att_1", jobId: "job_abc",
                  included: false, excludedReason: "user_unchecked" }];
  const out = QM._attachmentsFromUploads([t], prev);
  assertEq(out[0].included, false, "「使わない」が勝手に戻りました");
  assertEq(out[0].excludedReason, "user_unchecked");
});

test("従来経路の添付（jobId なし）は消さずに残す", () => {
  const prev = [{ id: "old1", kind: "text", extractedText: "むかしの添付" }];
  const out = QM._attachmentsFromUploads([uploadedTask({})], prev);
  assertEq(out.length, 2);
  assertEq(out[0].id, "old1");
});

group("どちらの経路を使うか");

test("uploader と Bridge が両方あるときだけ分割アップロードへ行く", () => {
  assertEq(QM._useUploadRoute({ upload: UP, localAI: { url: () => "" } }), true);
});
test("Bridge が居なければ従来経路のまま", () => {
  assertEq(QM._useUploadRoute({ upload: UP, localAI: null }), false);
});
test("uploader が読み込まれていなければ従来経路のまま", () => {
  assertEq(QM._useUploadRoute({ upload: null, localAI: { url: () => "" } }), false);
});

/* ══════════════════════════════════════════════════════════════════
   2. 送信の上限（ページ画像の枚数）
   ══════════════════════════════════════════════════════════════════ */
group("ページ画像の上限は経路で決まる");

/* Bridge の答え（local-ai/config/attachments.json の maxScanPages = 200）を模す。 */
globalThis.fetch = (url) => Promise.resolve({
  ok: true, status: 200,
  json: () => Promise.resolve({ limits: { maxScanPages: 200 } })
});
await UI.refreshScanLimits("http://127.0.0.1:17891");

test("JSON へ base64 で載せる経路は 12 枚で頭打ちのまま", () => {
  assertEq(UI.scanPageLimit(), 12,
    "本体を JSON へ載せる経路の上限を上げると、本文の上限を突き抜けて 413 になる");
});
test("参照形式（分割アップロード）なら Bridge の上限をそのまま使う", () => {
  assertEq(UI.scanPageLimit({ transport: "upload" }), 200,
    "本体を JSON へ載せないのに 12 枚で止まっています");
});
test("上限の出どころは Bridge（直書きの 12 ではない）", () => {
  assert(UI.scanPageLimit({ transport: "upload" }) > 12,
    "Bridge が 200 と答えているのに反映されていません");
});

/* ══════════════════════════════════════════════════════════════════
   3. 進みぐあい（§27）
   ══════════════════════════════════════════════════════════════════ */
group("分母は実依頼数（ceil(総問題数 / 3) ではない）");

/* 5 大問 × 1 問。実際の依頼は 5 回だが、ceil(5 / 3) は 2。 */
const PLAN_5x1 = MC.plan({
  title: "T", subject: "日本史", totalPoints: 50, sectionCount: 5, questionCount: 5,
  types: { true_false: true }, difficulty: "normal",
  allowExternalKnowledge: true, requireSources: false
});

test("枠の前提（5 大問 1 問ずつ・全 5 問）", () => {
  assertEq(PLAN_5x1.totalQuestions, 5);
  assertEq(PLAN_5x1.sections.length, 5);
});
test("実依頼数は 5（大問ごとの ceil の総和）", () => {
  assertEq(QM._plannedRequestCount(MC, PLAN_5x1), 5);
});
test("旧い分母 ceil(総問題数 / 3) とは一致しない（一致したら測れていない）", () => {
  const old = Math.ceil(PLAN_5x1.totalQuestions / MC.DEFAULT_BATCH);
  assertEq(old, 2, "この枠では旧い分母は 2 のはず");
  assert(QM._plannedRequestCount(MC, PLAN_5x1) !== old,
    "実依頼数と旧い分母が同じでは、直ったかどうかを確かめられない");
});

/* 2 大問 × 5 問（＝ 3 + 2 と 3 + 2 で 4 依頼）でも確かめる。 */
const PLAN_2x5 = MC.plan({
  title: "T", subject: "日本史", totalPoints: 100, sectionCount: 2, questionCount: 10,
  types: { true_false: true }, difficulty: "normal",
  allowExternalKnowledge: true, requireSources: false
});
test("2 大問 5 問ずつなら 4 依頼（3 + 2 を 2 回）", () => {
  assertEq(QM._plannedRequestCount(MC, PLAN_2x5), 4);
});

group("生成中に done が進み、残り時間が出る");

/* 画面の代わり。paintEta が書き込む箱をそのまま覗く。 */
function fakeChat(total, madeTotal) {
  const box = { innerHTML: "" };
  const root = { querySelector: (sel) => (sel === "#aiEta" ? box : null) };
  const chat = new UI.AiChat({ getRoot: () => root });
  chat.busy = true;
  chat.etaStart(total, "問題を作っています");
  chat.etaStep({ done: 0, total: total, made: 0, madeTotal: madeTotal });
  return { chat, box };
}

test("始めた直後は数字を出さない（当てずっぽうを見せない）", () => {
  const { chat, box } = fakeChat(5, 5);
  assertEq(chat.remainingMs(), null, "1 回も終わっていないのに残り時間を出しています");
  assert(box.innerHTML.indexOf("残りを計算しています") >= 0);
  chat.stop();
});

test("1 回終わると残り時間が出る（durations が溜まる）", () => {
  const { chat } = fakeChat(5, 5);
  tick(30_000);
  QM._applyProgress(chat, { done: 0, total: 5, runs: [], sections: [], refilling: false },
                    { sectionNumber: 1, accepted: 1, filled: 1, total: 5 });
  assertEq(chat.eta.durations.length, 1, "終わった回の所要時間が記録されていません");
  assertEq(chat.eta.done, 1, "done が進んでいません");
  assert(chat.remainingMs() !== null, "残り時間が出ないままです（0 / N のまま）");
  chat.stop();
});

test("残り時間は実測から出る（30 秒 × 残り 4 回 ＝ およそ 120 秒）", () => {
  const { chat } = fakeChat(5, 5);
  const prog = { done: 0, total: 5, runs: [], sections: [], refilling: false };
  tick(30_000);
  QM._applyProgress(chat, prog, { sectionNumber: 1, accepted: 1, filled: 1, total: 5 });
  /* 直後（次の巡はまだ 0 秒）なので、残り 4 回ぶん。 */
  assertEq(chat.remainingMs(), 120_000, "残り時間が実測から出ていません");
  chat.stop();
});

test("回を重ねると done が実数で増える（1 → 2 → 3）", () => {
  const { chat } = fakeChat(5, 5);
  const prog = { done: 0, total: 5, runs: [], sections: [], refilling: false };
  const seen = [];
  for (let i = 1; i <= 3; i++) {
    tick(20_000);
    QM._applyProgress(chat, prog, { sectionNumber: i, accepted: 1, filled: i, total: 5 });
    seen.push(chat.eta.done);
  }
  assert(JSON.stringify(seen) === "[1,2,3]", "done が " + JSON.stringify(seen) + " と進みました");
  chat.stop();
});

test("画面に出るのは実際に完成した問題数（18 / 30問）", () => {
  const { chat, box } = fakeChat(10, 30);
  tick(20_000);
  QM._applyProgress(chat, { done: 5, total: 10, runs: [], sections: [], refilling: false },
                    { sectionNumber: 2, accepted: 3, filled: 18, total: 30 });
  assert(box.innerHTML.indexOf("18 / 30問") >= 0,
    "完成した数が出ていません：" + box.innerHTML);
  chat.stop();
});

test("出せる数より多く見せない（6 / 5 と出さない）", () => {
  const { chat } = fakeChat(5, 5);
  const prog = { done: 0, total: 5, runs: [], sections: [], refilling: false };
  for (let i = 0; i < 8; i++) {
    tick(1_000);
    QM._applyProgress(chat, prog, { sectionNumber: 1, accepted: 0, filled: 3, total: 5 });
  }
  assert(chat.eta.done <= chat.eta.total,
    "done が total を超えました（" + chat.eta.done + " / " + chat.eta.total + "）");
  chat.stop();
});

test("more:false なら次の巡を始めない（最後の 1 回を二重に数えない）", () => {
  const { chat } = fakeChat(5, 5);
  tick(10_000);
  QM._applyProgress(chat, { done: 0, total: 5, runs: [], sections: [], refilling: false },
                    { sectionNumber: 1, accepted: 1, filled: 1, total: 5 });
  const n = chat.eta.durations.length;
  tick(10_000);
  chat.etaStep({ done: 1, total: 5, made: 1, madeTotal: 5, more: false });
  assertEq(chat.eta.roundStartedAt, 0, "終わったのに次の巡が始まっています");
  assertEq(chat.eta.durations.length, n + 1);
  chat.stop();
});

group("何問できたかを、実数でだけ言う");

const SEC = { number: 1, questions: [{ number: 1 }, { number: 2 }, { number: 3 },
                                     { number: 4 }, { number: 5 }] };

test("1 巡目は出来た問番号を言える（第1問〜第3問）", () => {
  assertEq(JSON.stringify(QM._slotNumbersFor(SEC, 0, 3, true)), "[1,2,3]");
});
test("続きの回は続きの番号（第4問〜第5問）", () => {
  assertEq(JSON.stringify(QM._slotNumbersFor(SEC, 3, 2, true)), "[4,5]");
});
test("埋め直しの巡では番号を言わない（飛ぶので分からない）", () => {
  assertEq(QM._slotNumbersFor(SEC, 0, 3, false), null);
});
test("枠より多い数は言わない", () => {
  assertEq(QM._slotNumbersFor(SEC, 3, 4, true), null);
});

test("一行に「第1問〜第3問を生成しました」と「現在 3 / 30問」が出る", () => {
  const line = QM._progressLine({ sectionNumber: 1, accepted: 3, filled: 3, total: 30 },
                                [1, 2, 3]);
  assert(line.indexOf("第1問〜第3問") >= 0, line);
  assert(line.indexOf("現在 3 / 30問") >= 0, line);
});

test("番号が分からないときは数だけを言う（それらしい番号を作らない）", () => {
  const line = QM._progressLine({ sectionNumber: 2, accepted: 2, filled: 12, total: 30 }, null);
  assert(line.indexOf("第") < 0 || line.indexOf("問入りました") >= 0, line);
  assert(line.indexOf("2 問入りました") >= 0, line);
  assert(line.indexOf("現在 12 / 30問") >= 0, line);
});

test("1 問も入らなかった回を「できました」と言わない", () => {
  const line = QM._progressLine({ sectionNumber: 3, accepted: 0, filled: 12, total: 30 }, null);
  assert(line.indexOf("1 問も入りませんでした") >= 0, line);
  assert(line.indexOf("生成しました") < 0, "0 問なのに生成したと言っています：" + line);
});

test("大問ごとの出来高は実際に入った数だけ足す", () => {
  const runs = [{ number: 1, made: 0 }, { number: 2, made: 0 }];
  const prog = { done: 0, total: 4, runs: runs, sections: [SEC, SEC], refilling: false };
  const { chat } = fakeChat(4, 10);
  tick(5_000);
  QM._applyProgress(chat, prog, { sectionNumber: 1, accepted: 3, filled: 3, total: 10 });
  tick(5_000);
  QM._applyProgress(chat, prog, { sectionNumber: 1, accepted: 0, filled: 3, total: 10 });
  assertEq(runs[0].made, 3, "入っていない問を数えています");
  assertEq(runs[1].made, 0);
  chat.stop();
});

Date.now = REAL_NOW;
process.exit(report("Quick Mock 資料の運び方と進みぐあい") ? 1 : 0);
