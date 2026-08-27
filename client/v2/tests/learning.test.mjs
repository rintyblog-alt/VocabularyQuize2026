/* 学習データの統合と分析
   ・どの入口から来た学習も 1 つの形へそろう
   ・同じ結果を何度渡しても二重に数えない
   ・AI 採点待ちを 0 点として確定しない
   ・ホームが読む場所へも橋渡しされる
   ・記録が少ないうちは断定しない */
import { installLocalStorage, loadV2, group, test, assert, assertEq, report } from "./harness.mjs";

installLocalStorage();
const VQ2 = loadV2([
  "qtypes", "schema", "qmodel", "validate", "adapter", "score-allocator",
  "grading", "evaluator", "qplan", "draft", "flags", "store", "library",
  "learning", "analytics"
].map((f) => "domain/" + f + ".js"));
const L = VQ2.learning, AN = VQ2.analytics, ST = VQ2.store;

const DAY = 86400000;
function iso(ts) { return new Date(ts).toISOString(); }
function daysAgo(n) { return Date.now() - n * DAY; }

/* 結果レコードをこしらえる（クイズ画面が作るのと同じ形） */
function mkResult(o) {
  o = o || {};
  const n = o.items || 4;
  const items = [];
  for (let i = 0; i < n; i++) {
    /* 採点待ちは後ろから。正答は前から。重ならないようにする。 */
    const pending = o.pending && i >= n - o.pending;
    items.push({
      questionId: (o.id || "r1") + "-q" + i,
      type: o.type || "multiple_choice_single",
      engine: "single_choice",
      answered: o.skip && i >= n - o.skip ? false : true,
      correct: pending ? null : (i < (o.correct === undefined ? n : o.correct)),
      score: pending ? null : (i < (o.correct === undefined ? n : o.correct) ? 1 : 0),
      maxScore: 1,
      timeMs: o.timeMs === undefined ? 12000 : o.timeMs,
      confidence: null, hintUsed: false, flagged: false,
      method: pending ? "ai" : "rule"
    });
  }
  return {
    id: o.id || "r1",
    kind: o.kind || "quiz",
    presetId: o.presetId || "p1",
    presetName: o.presetName || "テスト用",
    mode: o.mode || "practice",
    finishedAt: iso(o.at === undefined ? Date.now() : o.at),
    elapsedMs: o.elapsedMs === undefined ? 60000 : o.elapsedMs,
    items: items,
    score: items.reduce((a, x) => a + (x.score || 0), 0),
    maxScore: n,
    questionsSnapshot: items.map((x, i) => ({
      id: x.questionId, type: x.type,
      subject: o.subject || "英語",
      unit: o.unit || (i % 2 === 0 ? "関係代名詞" : "仮定法")
    }))
  };
}

group("1. 結果を学習セッションへ取り込む");
L.clearAll();
{
  const r = L.recordResult(mkResult({ id: "a1", correct: 3, items: 4 }));
  test("取り込める", () => assert(r.ok && r.session));
  test("問題数・正答数が入る", () => {
    assertEq(r.session.questionCount, 4);
    assertEq(r.session.correctCount, 3);
    assertEq(r.session.incorrectCount, 1);
  });
  test("正答率は確定分だけで出す", () => assertEq(r.session.accuracy, 0.75));
  test("出どころはプリセット", () => assertEq(r.session.source, "preset"));
  test("回答 1 問ずつも残る", () => assertEq(r.answers.length, 4));
  test("答えの中身は保存しない（要らないものを持たない）", () =>
    assert(r.answers.every((a) => !("answer" in a) && !("value" in a))));
  test("科目と単元が入る", () => {
    assertEq(r.answers[0].subject, "英語");
    assert(["関係代名詞", "仮定法"].indexOf(r.answers[0].unit) >= 0);
  });
}

group("2. 二重に数えない");
{
  const before = L.listSessions({}).length;
  L.recordResult(mkResult({ id: "a1", correct: 3, items: 4 }));
  L.recordResult(mkResult({ id: "a1", correct: 3, items: 4 }));
  test("同じ結果を何度渡してもセッションは 1 本", () =>
    assertEq(L.listSessions({}).length, before));
  test("回答も増えない", () =>
    assertEq(L.listAnswers({}).filter((a) => a.sessionId === "ls_a1").length, 4));
  const same = L.recordResult(mkResult({ id: "a1", correct: 4, items: 4 }));
  test("採点し直すと上書きされる", () => assertEq(same.session.correctCount, 4));
  test("上書きは新規扱いにしない", () => assertEq(same.created, false));
}

group("3. AI 採点待ちを 0 点にしない");
L.clearAll();
{
  const r = L.recordResult(mkResult({ id: "b1", items: 4, correct: 2, pending: 2 }));
  test("保留の数を持つ", () => assertEq(r.session.pendingCount, 2));
  test("状態は採点中", () => assertEq(r.session.status, "scoring"));
  test("保留を不正解として数えない", () => {
    assertEq(r.session.correctCount, 2);
    assertEq(r.session.incorrectCount, 0);
  });
  test("正答率は確定分だけ（保留を分母に入れない）", () => assertEq(r.session.accuracy, 1));
  test("得点率も保留分を除いた満点で見る", () => assertEq(r.session.scoreRatio, 1));
  test("保留の回答は正誤を null にする", () => {
    const p = r.answers.filter((a) => a.evaluationStatus === "pending");
    assertEq(p.length, 2);
    assert(p.every((a) => a.isCorrect === null && a.score === null));
  });
}

group("4. Quick Mock も同じ形で入る");
L.clearAll();
{
  const r = L.recordResult(mkResult({ id: "m1", kind: "mock", mode: "mock", items: 6, correct: 4 }));
  test("出どころは Quick Mock", () => assertEq(r.session.source, "quick_mock"));
  test("モードは試験", () => assertEq(r.session.mode, "mock"));
  test("同じ一覧に並ぶ", () => assertEq(L.listSessions({}).length, 1));
  const m = AN.mocks({ range: "all" });
  test("Mock の分析に出る", () => assertEq(m.count, 1));
  test("1 回目は前回と比べない", () => assertEq(m.lastDelta, null));
}

group("5. ホームが読む場所へ橋渡しする");
L.clearAll();
{
  globalThis.localStorage.setItem(L.LEGACY_SESSIONS_KEY, "[]");
  L.recordResult(mkResult({ id: "c1", items: 5, correct: 4 }));
  const legacy = JSON.parse(globalThis.localStorage.getItem(L.LEGACY_SESSIONS_KEY));
  test("旧形式の行が 1 本書かれる", () => assertEq(legacy.length, 1));
  test("問題数と正答数が渡る", () => {
    assertEq(legacy[0].total, 5);
    assertEq(legacy[0].correct, 4);
  });
  L.recordResult(mkResult({ id: "c1", items: 5, correct: 4 }));
  const again = JSON.parse(globalThis.localStorage.getItem(L.LEGACY_SESSIONS_KEY));
  test("同じ結果で行が増えない", () => assertEq(again.length, 1));
  test("こちらが書いた行だと分かる印がある", () => assert(!!again[0].vq2SessionId));
}

group("6. これまでの記録を取り込む");
L.clearAll();
{
  globalThis.localStorage.setItem(L.LEGACY_SESSIONS_KEY, JSON.stringify([
    { id: "old1", ts: daysAgo(3), presetId: "p9", presetName: "むかしの", mode: "CHOICE",
      total: 10, correct: 7, durationMs: 300000, wrongIds: [1, 2] },
    { id: "old2", ts: daysAgo(1), presetId: "p9", presetName: "むかしの", mode: "HAND",
      total: 8, correct: 8, durationMs: null, wrongIds: [] }
  ]));
  const r = L.importLegacy();
  test("2 件取り込む", () => assertEq(r.added, 2));
  const ss = L.listSessions({});
  test("出どころはこれまでの学習", () => assert(ss.every((s) => s.source === "legacy")));
  test("形式が残っていないものは作らない", () => assert(ss.every((s) => s.questionTypeCounts === null)));
  test("時間が無いものは 0 のままにする（推測しない）", () => {
    const h = ss.filter((s) => s.mode === "practice")[0];
    assertEq(h.durationSeconds, 0);
  });
  test("もう一度読んでも増えない", () => {
    L.importLegacy();
    assertEq(L.listSessions({}).length, 2);
  });
}

group("7. 日次の集計");
L.clearAll();
{
  L.recordResult(mkResult({ id: "d1", at: daysAgo(0), items: 4, correct: 3 }));
  L.recordResult(mkResult({ id: "d2", at: daysAgo(0), items: 6, correct: 3 }));
  L.recordResult(mkResult({ id: "d3", at: daysAgo(2), items: 5, correct: 5 }));
  const rows = L.daily({});
  test("日ごとにまとまる", () => assertEq(rows.length, 2));
  const today = rows[rows.length - 1];
  test("同じ日は足し合わせる", () => {
    assertEq(today.sessionCount, 2);
    assertEq(today.answeredCount, 10);
    assertEq(today.correctCount, 6);
  });
  test("科目ごとの内訳が入る", () => assert(!!today.subjectBreakdown["英語"]));
  test("作り直しても同じ", () => {
    const again = L.rebuildDaily();
    assertEq(again.length, 2);
  });
}

group("8. 概要と前期間との比較");
L.clearAll();
{
  L.recordResult(mkResult({ id: "e1", at: daysAgo(1), items: 10, correct: 8 }));
  const s1 = AN.summary({ range: "7d" });
  test("比べる相手が無ければ差を出さない", () => {
    assertEq(s1.hasPrevious, false);
    assertEq(s1.delta.accuracy, null);
  });
  test("比べられない理由を返す", () => assert(/前の記録がありません/.test(s1.previousNote)));
  L.recordResult(mkResult({ id: "e0", at: daysAgo(9), items: 10, correct: 5 }));
  const s2 = AN.summary({ range: "7d" });
  test("前の期間があれば差を出す", () => {
    assertEq(s2.hasPrevious, true);
    assertEq(s2.current.accuracy, 80);
    assertEq(s2.previous.accuracy, 50);
    assertEq(s2.delta.accuracy, 30);
  });
  test("全期間には比べる相手が無い", () => {
    const s3 = AN.summary({ range: "all" });
    assert(/比べる相手がありません/.test(s3.previousNote));
  });
}

group("9. 分野ごとの分析");
L.clearAll();
{
  for (let i = 0; i < 4; i++) {
    L.recordResult(mkResult({ id: "f" + i, at: daysAgo(i), items: 6, correct: 2, subject: "英語" }));
  }
  const subs = AN.bySubject({ range: "30d" });
  test("科目ごとに出る", () => assertEq(subs.length, 1));
  test("表示は日本語（内部 ID を出さない）", () => assertEq(subs[0].label, "英語"));
  const types = AN.byType({ range: "30d" });
  test("形式ごとに出る", () => assertEq(types.length, 1));
  test("形式名もレジストリから引く", () => assert(!/_/.test(types[0].label)));
  test("使っていない形式は出さない（130 個並べない）", () => assert(types.length < 5));
  const units = AN.byUnit({ range: "30d" });
  test("単元ごとに出る", () => assertEq(units.length, 2));
}

group("10. 苦手の判定");
L.clearAll();
{
  test("記録が少ないうちは苦手と言わない", () => {
    L.recordResult(mkResult({ id: "g0", items: 3, correct: 0, subject: "数学", unit: "三角関数" }));
    assertEq(AN.weakness({ range: "30d" }).length, 0);
  });
  L.clearAll();
  for (let i = 0; i < 5; i++) {
    L.recordResult(mkResult({ id: "g" + i, at: daysAgo(i), items: 4, correct: 1,
                              subject: "英語", unit: "関係代名詞" }));
  }
  const w = AN.weakness({ range: "30d" });
  test("苦手が出る", () => assert(w.length >= 1));
  test("理由が必ず付く", () => assert(w.every((x) => x.reasons.length >= 1)));
  test("正答率が理由に入る", () => assert(w.some((x) => /正答率/.test(x.reasons.join("")))));
  test("何の苦手かが分かる", () => assert(w.every((x) => x.kindLabel && x.label)));
  test("強さが付く", () => assert(w.every((x) => ["low", "medium", "high"].indexOf(x.severity) >= 0)));
}

group("11. 学習の習慣");
L.clearAll();
{
  L.recordResult(mkResult({ id: "h1", items: 4, correct: 4 }));
  const h1 = AN.habits({ range: "30d" });
  test("記録が少ないうちは傾向を言わない", () => {
    assertEq(h1.enough, false);
    assertEq(h1.bestHour, null);
  });
  test("あと何回で分かるかを返す", () => assert(h1.need > 0));
  for (let i = 0; i < 6; i++) L.recordResult(mkResult({ id: "h" + i, at: daysAgo(i), items: 4, correct: 3 }));
  const h2 = AN.habits({ range: "30d" });
  test("記録がたまると傾向を出す", () => assertEq(h2.enough, true));
  test("学習した日数を数える", () => assert(h2.studyDays >= 6));
}

group("12. 次のおすすめ");
L.clearAll();
{
  test("記録が無ければ何も勧めない", () => assertEq(AN.recommendations({ range: "30d" }).length, 0));
  for (let i = 0; i < 5; i++) {
    L.recordResult(mkResult({ id: "i" + i, at: daysAgo(i), items: 4, correct: 1,
                              subject: "英語", unit: "仮定法" }));
  }
  const rec = AN.recommendations({ range: "30d" });
  test("苦手から勧める", () => assert(rec.length >= 1));
  test("理由が付く", () => assert(rec.every((r) => !!r.reason)));
  test("多くても 3 件まで", () => assert(rec.length <= 3));
}

group("13. 消したら集計からも消える");
L.clearAll();
{
  const r = L.recordResult(mkResult({ id: "j1", items: 4, correct: 4 }));
  assertEq(L.listSessions({}).length, 1);
  L.deleteSession(r.session.id);
  test("セッションが消える", () => assertEq(L.listSessions({}).length, 0));
  test("回答も消える", () => assertEq(L.listAnswers({}).length, 0));
  test("日次からも消える", () => assertEq(L.daily({}).length, 0));
  test("橋渡しした行も消える", () => {
    const legacy = JSON.parse(globalThis.localStorage.getItem(L.LEGACY_SESSIONS_KEY) || "[]");
    assertEq(legacy.filter((x) => x.vq2SessionId === r.session.id).length, 0);
  });
}

group("14. 保存の出口へ結線されている");
L.clearAll();
{
  const ok = L.install();
  test("二重には結線しない", () => assertEq(ok, false));
  ST.results.put(mkResult({ id: "k1", items: 4, correct: 4 }));
  test("結果を保存すると学習セッションになる", () => assertEq(L.listSessions({}).length, 1));
  ST.results.put(mkResult({ id: "k1", items: 4, correct: 2 }));
  test("採点し直しても 1 本のまま", () => assertEq(L.listSessions({}).length, 1));
  test("点は新しいほうになる", () => assertEq(L.listSessions({})[0].correctCount, 2));
}

group("15. まとめて取る");
L.clearAll();
{
  for (let i = 0; i < 4; i++) L.recordResult(mkResult({ id: "l" + i, at: daysAgo(i), items: 5, correct: 3 }));
  const d = AN.dashboard({ range: "30d" });
  test("画面が必要なものが 1 回で揃う", () =>
    assert(d.summary && d.trend && d.subjects && d.types && d.weakness && d.habits && d.mocks));
  test("記録があることが分かる", () => {
    assertEq(d.hasAnyRecord, true);
    assertEq(d.hasRangeRecord, true);
  });
  const empty = AN.dashboard({ range: "7d", subject: "存在しない科目" });
  test("その期間に無いことも分かる", () => assertEq(empty.hasRangeRecord, false));
}

report("学習データの統合と分析");
