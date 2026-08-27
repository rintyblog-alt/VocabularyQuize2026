/* AI の仕事の台帳と、問題形式の実態
   ・二重送信で 2 件にしない
   ・失敗しても途中結果を捨てない
   ・失敗した場所からやり直せる
   ・偽の進捗を作らない
   ・名前があるだけの形式を AI へ渡さない */
import { installLocalStorage, loadV2, group, test, assert, assertEq, report } from "./harness.mjs";

installLocalStorage();
const VQ2 = loadV2([
  "qtypes", "qdescriptor", "schema", "qmodel", "validate", "adapter", "score-allocator",
  "grading", "evaluator", "blueprint", "answerability", "qplan", "draft", "flags",
  "store", "library", "learning", "analytics", "capability", "aijob"
].map((f) => "domain/" + f + ".js"));
const J = VQ2.aijob, C = VQ2.capability, P = VQ2.qplan;

group("1. 仕事をはじめる");
J.clearAll();
{
  const r = J.start({ jobType: "preset_generation", title: "10 問つくる",
                      steps: ["読み取り", "構成", "生成", "検証"], startKey: "k1" });
  test("はじめられる", () => assert(r.job && r.job.id));
  test("最初は待ち", () => assertEq(r.job.status, "queued"));
  test("進捗は 0 から", () => assertEq(r.job.progress, 0));
  const dup = J.start({ jobType: "preset_generation", startKey: "k1" });
  test("同じ操作を 2 回押しても 1 件", () => {
    assertEq(dup.duplicated, true);
    assertEq(dup.job.id, r.job.id);
    assertEq(J.list({}).length, 1);
  });
}

group("2. 偽の進捗を作らない");
J.clearAll();
{
  const { job } = J.start({ jobType: "mock_question_generation", steps: ["A", "B", "C", "D"] });
  J.step(job.id, "A");
  test("段が進むと進捗も進む", () => assertEq(J.get(job.id).progress, 0));
  J.step(job.id, "C");
  test("届いた段の位置から出す", () => assertEq(J.get(job.id).progress, 0.5));
  J.step(job.id, null, { counts: { done: 7, total: 10 } });
  test("数が分かるときは数から出す", () => assertEq(J.get(job.id).progress, 0.7));
  test("時間からは進捗を作らない", () => {
    const before = J.get(job.id).progress;
    J.running(job.id, {});
    assertEq(J.get(job.id).progress, before);
  });
}

group("3. 失敗しても途中結果を捨てない");
J.clearAll();
{
  const { job } = J.start({ jobType: "preset_generation", steps: ["生成", "検証"] });
  J.step(job.id, "生成", { counts: { done: 8, total: 10 } });
  J.keepPartial(job.id, { questions: [1, 2, 3, 4, 5, 6, 7, 8] });
  J.fail(job.id, new Error("timeout"), { code: "TIMEOUT" });
  const f = J.get(job.id);
  test("状態は失敗", () => assertEq(f.status, "failed"));
  test("できた分は残る", () => assertEq(f.partial.questions.length, 8));
  test("どこで止まったか残る", () => assertEq(f.retryFrom, "生成"));
  test("人へ出す文に、できた数と足りない数が入る", () => {
    assert(/8 問は残しています/.test(f.userMessage), f.userMessage);
    assert(/2 問だけ作り直せます/.test(f.userMessage), f.userMessage);
  });
  test("技術的な文言をそのまま人へ出さない", () => assert(!/timeout|Error/i.test(f.userMessage)));
}

group("4. やり直す");
{
  const failed = J.list({ status: "failed" })[0];
  const again = J.retry(failed.id);
  test("新しい仕事になる", () => assert(again.id !== failed.id));
  test("やり直した回数を数える", () => assertEq(again.retryCount, 1));
  test("できた分を引き継ぐ", () => assertEq(again.partial.questions.length, 8));
  test("止まった場所も引き継ぐ", () => assertEq(again.retryFrom, "生成"));
  const scratch = J.retry(failed.id, { fromStart: true });
  test("最初からやり直すことも選べる", () => assertEq(scratch.retryFrom, null));
}

group("5. 取り消しと、開いたまま落ちたとき");
J.clearAll();
{
  const { job } = J.start({ jobType: "mock_blueprint" });
  J.step(job.id, "構成");
  J.keepPartial(job.id, { sections: [1, 2] });
  J.cancel(job.id);
  const c = J.get(job.id);
  test("取り消せる", () => assertEq(c.status, "cancelled"));
  test("取り消してもできた分は残る", () => assertEq(c.partial.sections.length, 2));

  const { job: j2 } = J.start({ jobType: "preset_generation" });
  J.step(j2.id, "生成");
  test("動いていない実行中は、実行中のままにしない", () => {
    const n = J.reconcile();
    assertEq(n, 1);
    assertEq(J.get(j2.id).status, "failed");
  });
  test("止まったことを正直に伝える", () => assert(/途中で止まりました/.test(J.get(j2.id).userMessage)));
}

group("6. 続けられる仕事が分かる");
J.clearAll();
{
  const a = J.start({ jobType: "preset_generation" }).job;
  J.fail(a.id, null, { code: "TIMEOUT" });
  const b = J.start({ jobType: "mock_layout" }).job;
  J.done(b.id, {});
  test("失敗したものは続けられる", () => assertEq(J.resumable().length, 1));
  test("終わったものは出さない", () => assert(J.resumable().every((x) => x.status !== "completed")));
}

group("7. 包んで動かす");
J.clearAll();
{
  const okRun = await J.track({ jobType: "preset_generation", steps: ["生成"] }, async (api) => {
    api.step("生成");
    api.counts(5, 5);
    api.partial({ questions: [1, 2, 3, 4, 5] });
    return { counts: { done: 5, total: 5 } };
  });
  test("終わると完了になる", () => assertEq(okRun.job.status, "completed"));
  test("進捗は 1 になる", () => assertEq(okRun.job.progress, 1));

  let threw = false;
  try {
    await J.track({ jobType: "preset_generation" }, async (api) => {
      api.partial({ questions: [1, 2] });
      throw new Error("だめでした");
    });
  } catch (e) { threw = true; }
  test("失敗はそのまま呼び側へ返す", () => assertEq(threw, true));
  const f = J.list({ status: "failed" })[0];
  test("失敗しても途中結果は残る", () => assertEq(f.partial.questions.length, 2));
}

group("8. 形式の実態（名前だけを対応済みにしない）");
{
  const stats = C.stats({ force: true });
  test("全形式を測る", () => assert(stats.total >= 100, String(stats.total)));
  test("準備中は本番にしない", () => assert(stats.comingSoon > 0));
  test("本番は全形式より少ない", () => assert(stats.production < stats.total));
  const bad = C.resolve("no_such_type");
  test("知らない形式は断る", () => assertEq(bad.ok, false));
  const ai = C.forAi();
  test("AI へ渡すのは一部だけ", () => assert(ai.length > 0 && ai.length < stats.total));
  /* 画面（表示・編集のしくみ）はここには無い。**無いのに「使える」と言わない。**
     表示まで含めた厳しい判定は、実画面の確認（node vqcapability.cjs）で見る。 */
  test("画面が無いときは、確かめられていないと分かる", () => assertEq(C.uiReady(), false));
  test("画面が無くても、AI へ渡すのは AI 生成できると申告された形式だけ", () =>
    assert(ai.every((t) => { const d = VQ2.qtypes.get(t); return d && d.supportsAI && d.status === "available"; })));
  const mock = C.forAi({ mock: true });
  test("試験用はさらに少ない", () => assert(mock.length < ai.length, mock.length + "/" + ai.length));
  test("試験用に運ぶ操作を入れない", () =>
    assert(mock.every((t) => !C.NO_PAPER_ENGINES[VQ2.qtypes.engineOf(t)])));
}

group("9. 配分は使える形式からしか作らない");
{
  const plan = P.planMix({ count: 12, style: "auto", subject: "english" });
  const okTypes = C.forAi();
  test("配分に出るのは AI へ渡してよい形式だけ", () =>
    assert(plan.items.every((i) => okTypes.indexOf(i.type) >= 0),
           plan.items.map((i) => i.type).join(",")));
  test("頼んだ数と合計が合う", () =>
    assertEq(plan.items.reduce((a, i) => a + i.count, 0), 12));
}

report("AI の仕事の台帳と形式の実態");
