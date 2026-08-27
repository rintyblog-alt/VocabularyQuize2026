/* ══════════════════════════════════════════════════════════════════════
   Quick Mock §27 実進捗の仕上げ

   前の担当者が onProgress を繋いだ。ここで確かめるのは
   「その数が **本当に出来た問題の数** か」の 1 点。

   これまでの回帰テスト（quick-mock-transport.test.mjs）は
   progressLine / applyProgress に **手で作った数**を渡して見ていた。
   それだと「渡す数が嘘だったら」を見つけられない。

   ここでは本物の試験コンパイラ（mock-compiler / mock-compile-run）を
   実際に回す。AI の代わりに、**わざと頼まれた数より少なく返す**作り手を置く。
   そのうえで、
     ・画面に出た「現在 X / N問」の X が、そのときに実際に埋まっていた枠の数か
     ・最後の X が、走り終えた結果（res.accepted）と 1 問もずれていないか
     ・出来ていない数を「出来た」と言っていないか
   を見る。数の出どころを 1 本に縛るためのテスト。
   ══════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  installLocalStorage, installLocation, loadV2, V2,
  group, test, assert, assertEq, report
} from "./harness.mjs";

installLocalStorage();
installLocation("");
const VQ2 = loadV2([
  "qtypes", "qdescriptor", "schema", "qmodel", "validate", "adapter", "score-allocator",
  "grading", "evaluator", "blueprint", "answerability", "qplan", "capability",
  "draft", "mock-builder", "mock-compiler", "mock-compile-run", "flags"
].map((f) => "domain/" + f + ".js"));

const noop = () => "";
globalThis.document = { createElement: () => ({ style: {}, setAttribute() {}, addEventListener() {} }) };
VQ2.ui = {
  esc: (s) => String(s == null ? "" : s),
  icon: noop, button: noop, field: noop, mount: noop, on: noop, badge: noop, statusChip: noop,
  AiChat: function () {}
};
new Function(readFileSync(join(V2, "ui/quick-mock.js"), "utf8")).call(globalThis);

const QM = VQ2.quickMock, MC = VQ2.mockCompiler, MR = VQ2.mockCompilerRun;

/* 3 大問 × 4 問 = 12 問の枠。 */
const plan = MC.plan({
  title: "理科 期末", subject: "理科", grade: "中2",
  durationMinutes: 50, totalPoints: 120,
  sectionCount: 3, questionCount: 12,
  types: { multiple_choice_single: true, short_answer: true },
  difficulty: "mixed", allowExternalKnowledge: true, requireSources: false
});

group("土台：枠が 12 問ある");
test("3 大問 12 問の枠ができている", () => {
  assertEq(plan.totalQuestions, 12);
  assertEq(plan.sections.length, 3);
});

/* ── 実際に回す。**わざと頼まれた数より 1 問少なく返す作り手**。 ── */
const lines = [];
const etaSeen = [];
const chat = {
  etaStep(o) { etaSeen.push({ made: o.made, madeTotal: o.madeTotal, label: o.label || "" }); }
};
/* 画面が持っている入れ物と同じ形（runGenerateV2 の prog）。 */
const prog = { done: 0, total: 0, runs: plan.sections.map((s) => ({ made: 0 })),
               sections: plan.sections, refilling: false };
/* onProgress が来たその瞬間に、本当に埋まっていた枠の数を控える。 */
const truth = [];
let filledRef = null;

const res = await MR.run({
  plan,
  ownerId: "local",
  paper: { size: "A4", orientation: "portrait" },
  maxRounds: 1,                       /* 埋め直しの巡は見ない（番号が飛ぶ） */
  concurrency: 1,                     /* 順番を決めうちにする */
  onProgress(pr) {
    truth.push({ filled: pr.filled, total: pr.total, accepted: pr.accepted,
                 section: pr.sectionNumber });
    lines.push(QM._applyProgress(chat, prog, pr));
  },
  generate(req) {
    /* 頼まれた枠のうち、最後の 1 問だけ作らないで返す。
       「頼んだ数 ≠ 出来た数」でも、画面が出来た数を正しく言うか見る。 */
    const slots = req.slots.slice(0, Math.max(0, req.slots.length - 1));
    return Promise.resolve({
      questions: slots.map((s) => ({
        id: s.id, question: "問題 " + s.id, type: "short_answer",
        answer: "こたえ", explanation: "理由", choices: []
      }))
    });
  }
});

group("画面に出る数が、本当に埋まった枠の数と一致する");

test("進みぐあいが 1 回以上出ている（測れていることの確認）", () => {
  assert(lines.length >= 3, "進みぐあいが出ていません（" + lines.length + " 回）");
});

test("頼んだ数より少なくしか作れていない（この見本で測れている）", () => {
  assert(res.accepted < res.planned,
    "全部埋まってしまい、足りないときの言い方を測れていません（"
      + res.accepted + " / " + res.planned + "）");
});

test("どの行の「現在 X / N問」も、そのときの実際の埋まり数と同じ", () => {
  lines.forEach((line, i) => {
    const m = line.match(/現在 (\d+) \/ (\d+)問/);
    assert(m, "現在の数が出ていません：" + line);
    assertEq(Number(m[1]), truth[i].filled, i + " 行目の埋まり数");
    assertEq(Number(m[2]), truth[i].total, i + " 行目の総数");
  });
});

test("最後に出した数が、走り終えた結果と 1 問もずれていない", () => {
  const last = lines[lines.length - 1].match(/現在 (\d+) \/ (\d+)問/);
  assertEq(Number(last[1]), res.accepted, "最後に見せた数と実際の完成数");
  assertEq(Number(last[2]), res.planned, "最後に見せた総数と枠の数");
});

test("埋まり数は減らない（水増しも巻き戻しもしない）", () => {
  let prev = -1;
  truth.forEach((t) => {
    assert(t.filled >= prev, "埋まり数が減りました：" + prev + " → " + t.filled);
    prev = t.filled;
  });
});

test("総数（分母）は、頼んだ枠の数のまま動かない", () => {
  truth.forEach((t) => assertEq(t.total, plan.totalQuestions));
});

test("ETA へ渡す数も、実際に出来た数（回数ではない）", () => {
  assert(etaSeen.length === lines.length, "ETA の更新回数が進みぐあいと合っていません");
  etaSeen.forEach((e, i) => {
    assertEq(e.made, truth[i].filled, i + " 回目の ETA が実際の完成数と違います");
    assertEq(e.madeTotal, truth[i].total);
    assert(e.label.indexOf(truth[i].filled + " / " + truth[i].total + "問") >= 0,
      "ETA の文字が実数になっていません：" + e.label);
  });
});

test("この回に 1 問も入らなかったときは「生成しました」と言わない", () => {
  const l = QM._applyProgress({ etaStep() {} },
    { done: 0, total: 3, runs: [{ made: 0 }], sections: plan.sections, refilling: false },
    { sectionNumber: 1, accepted: 0, filled: 4, total: 12 });
  assert(l.indexOf("1 問も入りませんでした") >= 0, "0 問の回を隠しています：" + l);
  assert(l.indexOf("現在 4 / 12問") >= 0, "そのときの実数を出していません：" + l);
});

test("埋め直しの巡では、分からない問番号を作らない", () => {
  const l = QM._applyProgress({ etaStep() {} },
    { done: 0, total: 3, runs: [{ made: 0 }], sections: plan.sections, refilling: true },
    { sectionNumber: 1, accepted: 2, filled: 9, total: 12 });
  assert(l.indexOf("第") < 0, "飛んだ番号をそれらしく書いています：" + l);
  assert(l.indexOf("2 問入りました") >= 0, "入った数を言っていません：" + l);
});

group("偽の進捗が残っていないか");

test("「残りを計算しています」のまま終わる道が、画面の文言に無い", () => {
  const src = readFileSync(join(V2, "ui/quick-mock.js"), "utf8");
  assert(src.indexOf('"残りを計算しています"') < 0, "当てずっぽうの文言が残っています");
});

test("完成数として渡すのは pr.filled だけ（回数を問題数として見せない）", () => {
  const src = readFileSync(join(V2, "ui/quick-mock.js"), "utf8");
  const m = src.match(/made: pr\.filled, madeTotal: pr\.total/);
  assert(m, "ETA へ渡す完成数が pr.filled でなくなっています");
  /* done（依頼の回数）を問題数として出していないこと。 */
  assert(!/made: prog\.done/.test(src), "依頼の回数を完成数として見せています");
});

process.exit(report("Quick Mock 実進捗（§27）") ? 1 : 0);
