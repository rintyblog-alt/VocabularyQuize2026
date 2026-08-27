/* MockCompiler V2（決定論の層）のテスト。

   AI を 1 回も呼ばない。ブラウザも使わない。
   だから毎回同じ結果になり、durability テストと同時に走らせても
   Bridge を取り合わない。

   ここで確かめるのは「V1 で実際に起きた不具合が、V2 の作りとして
   起こりえなくなっているか」。

     ・頼んだ数を超えて作られない（実測 4 問→48 問 / 11 問→66 問）
     ・満点がずれない（実測 100 点指定→83 点・大問ごとに 100 と 30）
     ・解答欄を作れない設問が仕様へ入らない（選択肢 0 件の選択問題）
     ・無理な条件（5 点で 20 問）を黙って通さない

   実行: node vqmockcompile.cjs
*/
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const V2 = path.join(__dirname, "client", "v2", "domain");
const ORDER = ["schema.js", "validate.js", "adapter.js", "score-allocator.js",
               "draft.js", "mock-builder.js", "mock-compiler.js"];

/* client/v2/domain/*.js はどれも globalThis へ生やす IIFE。順に読めば動く。 */
const sandbox = { console, Date, Math, JSON, String, Number, Object, Array, isFinite, parseInt, parseFloat };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const f of ORDER) {
  const p = path.join(V2, f);
  if (!fs.existsSync(p)) { console.error(`× ${f} がありません`); process.exit(1); }
  try { vm.runInContext(fs.readFileSync(p, "utf8"), sandbox, { filename: f }); }
  catch (e) { console.error(`× ${f} の読み込みで失敗: ${e.message}`); process.exit(1); }
}

const C = sandbox.VQ2.mockCompiler;
const V = sandbox.VQ2.validate;
if (!C) { console.error("× VQ2.mockCompiler が生えていません"); process.exit(1); }

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; failures.push({ name, detail: detail || "" }); console.log(`  × ${name}${detail ? " — " + detail : ""}`); }
}
function section(t) { console.log(`\n── ${t} ──`); }

const ALL_TYPES = {
  multiple_choice_single: true, true_false: true, short_answer: true, long_answer: true
};

/* ══ 1) 配点：合計は必ず満点にぴったり ══ */
section("配点の合計（V1 の「100点指定で83点」が起こらないこと）");
{
  /* 実際に使われる条件をひととおり通す。1 件でもずれたら不合格。 */
  const combos = [];
  for (const total of [5, 20, 50, 100, 150, 200, 300]) {
    for (const sec of [1, 2, 3, 5, 6, 8]) {
      for (const q of [0, 6, 9, 10, 12, 20, 24, 40]) {
        combos.push({ totalPoints: total, sectionCount: sec, questionCount: q });
      }
    }
  }
  let bad = [], badSec = [];
  for (const c of combos) {
    const p = C.plan(Object.assign({ types: ALL_TYPES, difficulty: "mixed" }, c));
    const sum = p.sections.reduce((a, s) => a + s.points, 0);
    if (sum !== p.totalPoints) bad.push(`${JSON.stringify(c)} → ${sum}/${p.totalPoints}`);
    for (const s of p.sections) {
      const qs = s.questions.reduce((a, q) => a + q.points, 0);
      if (qs !== s.points) badSec.push(`${JSON.stringify(c)} 大問${s.number} → ${qs}/${s.points}`);
    }
  }
  ok(`全 ${combos.length} 通りで 合計 = 満点`, bad.length === 0, bad.slice(0, 3).join(" / "));
  ok(`全 ${combos.length} 通りで 大問の点 = その大問の設問の和`, badSec.length === 0, badSec.slice(0, 3).join(" / "));

  /* 配点は 1 点以上の整数。0 点や小数の設問を作らない。 */
  const p = C.plan({ totalPoints: 100, sectionCount: 5, questionCount: 17, types: ALL_TYPES, difficulty: "mixed" });
  const pts = p.sections.flatMap((s) => s.questions.map((q) => q.points));
  ok("配点はすべて 1 以上の整数", pts.every((x) => Number.isInteger(x) && x >= 1), JSON.stringify(pts));
  ok("設問数は指定どおり（17 問）", p.totalQuestions === 17, String(p.totalQuestions));
}

/* ══ 2) 設問数：枠の数がそのまま上限 ══ */
section("設問数（V1 の「4問頼んで48問」が起こらないこと）");
{
  const p = C.plan({ totalPoints: 100, sectionCount: 1, questionCount: 4, types: ALL_TYPES });
  ok("計画は 4 問ちょうど", p.totalQuestions === 4, String(p.totalQuestions));

  const reqs = C.requestsOf(p, { batchSize: 3 });
  const slots = reqs.reduce((a, r) => a + r.slots.length, 0);
  ok("依頼の枠も 4 つちょうど（分割しても増えない）", slots === 4, String(slots));

  /* AI が 48 問返してきた状況を作る。枠は 4 つしかないので 4 問しか入らない。 */
  const filled = {};
  const slotIds = p.sections.flatMap((s) => s.questions.map((q) => q.id));
  for (const id of slotIds) filled[id] = draftFor(p, id);
  /* 枠にない ID を 44 個ねじ込む（＝作りすぎ） */
  for (let i = 0; i < 44; i++) filled["ghost-" + i] = draftFor(p, slotIds[0]);

  const a = C.assemble(p, filled, {});
  const made = a.spec.sections.reduce((x, s) => x + s.questions.length, 0);
  ok("組み立て後も 4 問（枠外の 44 問は入らない）", made === 4, String(made));
  ok("満点は 100 点のまま", sumPoints(a.spec) === 100, String(sumPoints(a.spec)));
}

/* ══ 3) 受理の門：作れない設問は仕様へ入れない ══ */
section("受理の門（解答欄を作れない設問を入れない）");
{
  const slot = { id: "p1-1", number: 1, type: "multiple_choice_single", points: 5, difficulty: "standard" };
  const good = { question: "ドルヴァス朝の成立年は。", choices: [{ id: "c1", text: "812年" }, { id: "c2", text: "839年" }],
                 answer: "c1", explanation: "812年に成立した。",
                 sourceReferences: [{ evidenceId: "e1", attachmentId: "a1", fileName: "資料.pdf", page: 1 }] };

  ok("そろっていれば受理", C.gate(slot, good, { requireSources: true }).ok);

  const noChoice = Object.assign({}, good, { choices: [] });
  const g1 = C.gate(slot, noChoice, {});
  ok("選択肢 0 件の選択問題は不受理", !g1.ok && g1.reasons.some((r) => r.code === "no_choices"),
     JSON.stringify(g1.reasons));

  const badAnswer = Object.assign({}, good, { answer: "1945年" });
  const g2 = C.gate(slot, badAnswer, {});
  ok("正解が選択肢に無ければ不受理", !g2.ok && g2.reasons.some((r) => r.code === "answer_not_in_choices"),
     JSON.stringify(g2.reasons));

  const noExp = Object.assign({}, good, { explanation: "" });
  ok("解説が無ければ不受理", !C.gate(slot, noExp, {}).ok);

  const noSrc = Object.assign({}, good, { sourceReferences: [] });
  ok("出典必須のとき、出典が無ければ不受理", !C.gate(slot, noSrc, { requireSources: true }).ok);
  ok("出典必須でなければ、出典が無くても受理", C.gate(slot, noSrc, { requireSources: false }).ok);

  /* fileName が無い出典は mock-builder が捨てる。門でも同じに扱わないと、
     「受理したのに仕様には出典 0 件」というずれが出る。 */
  const ghostSrc = Object.assign({}, good, { sourceReferences: [{ evidenceId: "e1" }] });
  ok("実データへ解決できない出典は、出典なしとして不受理",
     !C.gate(slot, ghostSrc, { requireSources: true }).ok);

  /* 正誤問題で選択肢 3 つ。
     **落とさずに、保存できる形へそろえて受け入れる。**
     実測（2026-08-04）: 受理できなかった 15 件のうち 14 件がこれだった。
     直せるものを門で落とすと、作り直しても同じことが起きるだけで、
     頼んだ数にいつまでも届かない。
     求めるものは変えていない（「保存できない形を作らない」）。直し方を変えた。 */
  const tfSlot = { id: "p1-2", number: 2, type: "true_false", points: 2, difficulty: "easy" };
  const tf3 = { question: "812年にドルヴァス朝が成立した。",
                choices: [{ id: "c1", text: "正しい" }, { id: "c2", text: "誤っている" }, { id: "c3", text: "どちらでもない" }],
                answer: "c1", explanation: "812年に成立した。" };
  ok("正誤問題の選択肢 3 つでも落とさない", C.gate(tfSlot, tf3, {}).ok,
     JSON.stringify(C.gate(tfSlot, tf3, {}).reasons));
  ok("正誤問題の選択肢 2 つは受理",
     C.gate(tfSlot, Object.assign({}, tf3, { choices: tf3.choices.slice(0, 2) }), {}).ok);

  /* 受け入れたうえで、**本当に保存できる**ことまで見る。
     ここを見ないと、門を緩めただけで保存できない仕様が増える。 */
  {
    /* この検査は選択肢の形だけを見る。出典は要求しない
       （要求すると出典なしで落ち、見たいところへ届かない）。 */
    const p3 = C.plan({ totalPoints: 10, sectionCount: 1, questionCount: 2,
                        types: { true_false: true }, difficulty: "easy",
                        requireSources: false, allowExternalKnowledge: true });
    const filled3 = {};
    p3.sections[0].questions.forEach((sl) => {
      filled3[sl.id] = {
        question: "812年にドルヴァス朝が成立した。",
        choices: [{ id: "c1", text: "正しい" }, { id: "c1", text: "正しい" },
                  { id: "c2", text: "誤っている" }, { id: "c3", text: "どちらでもない" }],
        answer: "c1", explanation: "812年に成立した。"
      };
    });
    const a3 = C.assemble(p3, filled3, { ownerId: "u1" });
    const iss = V.validateMockSpecForSave(a3.spec);
    const errs = iss.filter((i) => i.severity === "error");
    ok("同じ id・同じ文の選択肢が来ても、保存できる形になる", errs.length === 0,
       errs.map((e) => e.code + "@" + e.path).join(", "));
    const q0 = a3.spec.sections[0].questions[0];
    const ids = q0.choices.map((c) => c.id);
    ok("選択肢の id が重ならない", new Set(ids).size === ids.length, JSON.stringify(ids));
    const texts = q0.choices.map((c) => c.text);
    ok("同じ文の選択肢が残らない", new Set(texts).size === texts.length, JSON.stringify(texts));
    ok("正解はちょうど 1 つ", q0.choices.filter((c) => c.isCorrect).length === 1,
       JSON.stringify(q0.choices.map((c) => c.text + ":" + !!c.isCorrect)));
  }

  const many = Object.assign({}, good, {
    choices: Array.from({ length: 12 }, (_, i) => ({ id: "c" + (i + 1), text: "選択肢" + (i + 1) }))
  });
  ok("選択肢 12 件は不受理", !C.gate(slot, many, {}).ok);

  /* 記号での解答（①・ア・A）も引けること。V1 で拾えず「正解なし」になっていた形。 */
  for (const sym of ["①", "ア", "A", "1"]) {
    ok(`記号「${sym}」の解答を選択肢へ引ける`,
       C.gate(slot, Object.assign({}, good, { answer: sym }), {}).ok);
  }
}

/* ══ 4) 埋まらなかった枠を隠さない ══ */
section("欠けた設問（黙って完成扱いにしないこと）");
{
  const p = C.plan({ totalPoints: 100, sectionCount: 2, questionCount: 8, types: ALL_TYPES });
  const ids = p.sections.flatMap((s) => s.questions.map((q) => q.id));
  const filled = {};
  ids.slice(0, 6).forEach((id) => { filled[id] = draftFor(p, id); });   /* 2 問ぶん欠ける */

  const a = C.assemble(p, filled, {});
  ok("欠けた 2 問が missing に出る", a.missing.length === 2, JSON.stringify(a.missing));
  ok("未完成として high の指摘が立つ",
     a.issues.some((i) => i.type === "incomplete" && i.severity === "high"),
     JSON.stringify(a.issues.map((i) => i.type)));
  ok("残った 6 問だけで満点 100 点に合わせ直す", sumPoints(a.spec) === 100, String(sumPoints(a.spec)));

  const v = C.verify(a.spec, p);
  ok("verify が設問数の不一致を high で返す",
     v.some((i) => i.type === "count_mismatch" && i.severity === "high"),
     JSON.stringify(v.map((i) => i.type)));
}

/* ══ 5) そろっていれば verify は無指摘 ══ */
section("全部そろったとき");
{
  const p = C.plan({ totalPoints: 100, sectionCount: 3, questionCount: 9, types: ALL_TYPES, difficulty: "mixed" });
  const filled = {};
  p.sections.forEach((s) => s.questions.forEach((q) => { filled[q.id] = draftFor(p, q.id); }));
  const a = C.assemble(p, filled, {});
  ok("9 問すべて入る", a.accepted === 9, String(a.accepted));
  ok("欠けなし", a.missing.length === 0);
  const v = C.verify(a.spec, p);
  ok("verify の指摘は 0 件", v.length === 0, JSON.stringify(v.map((i) => i.type + ":" + i.message).slice(0, 4)));
  ok("満点 100 点", sumPoints(a.spec) === 100, String(sumPoints(a.spec)));
  ok("保存できる状態", a.finalize && a.finalize.ok === true,
     a.finalize ? JSON.stringify((a.finalize.issues || []).slice(0, 3)) : "finalize なし");
}

/* ══ 5-a) 正誤問題の「どちら側か」の見分け ══
   実測（2026-08-04）で tf_side_unknown が 5 件出た。
   モデルは「この記述は正しい」「○ 正しい」のように前へ言葉を足してくる。
   **どこにあっても拾う。ただし打ち消しを先に見る**（「正しくない」は「正しい」を含む）。 */
section("正誤問題のどちら側か");
{
  const T = C._tfSideOf, FC = C._tfSideFromChoices;
  ok("そのままの言い方", T("正しい") === 0 && T("誤っている") === 1);
  ok("前に言葉が付いても拾う",
     T("この記述は正しい") === 0 && T("A: 誤っている") === 1 && T("○ 正しい") === 0,
     [T("この記述は正しい"), T("A: 誤っている"), T("○ 正しい")].join(","));
  ok("**打ち消しを「正しい」と読まない**",
     T("正しくない") === 1 && T("適切でない") === 1,
     [T("正しくない"), T("適切でない")].join(","));
  ok("記号だけでも読む", T("○") === 0 && T("×") === 1 && T("正") === 0 && T("誤") === 1,
     [T("○"), T("×"), T("正"), T("誤")].join(","));
  ok("英語でも読む", T("True") === 0 && T("FALSE") === 1);
  ok("分からないものは分からないと言う", T("どちらでもない") === -1 && T("") === -1,
     [T("どちらでもない"), T("")].join(","));

  /* もう片方から割り出す（2 択という決まりから出る結論。推測ではない）。 */
  const two = [{ id: "c1", text: "この文は妥当だ" }, { id: "c2", text: "誤っている" }];
  ok("片方が読めれば、もう片方は反対だと分かる", FC(two, "c1") === 0, String(FC(two, "c1")));
  ok("読めた側はそのまま使う", FC(two, "c2") === 1, String(FC(two, "c2")));
  ok("どちらも読めなければ、決めつけない",
     FC([{ id: "c1", text: "あ" }, { id: "c2", text: "い" }], "c1") === -1);
  ok("2 択でなければ使わない",
     FC([{ id: "c1", text: "正しい" }], "c1") === -1);
}

/* ══ 5-b) 短答・記述に選択肢が付いてきたとき ══
   **選択肢を付けたまま入れない。** 入れると組み立てのときに選択問題として扱われ、
   正解の当て先が見つからずに正解が空になる（実測: 保存できなかった）。 */
section("短答に選択肢が付いてきたとき");
{
  const pSa = C.plan({ totalPoints: 20, sectionCount: 1, questionCount: 2,
                       types: { short_answer: true }, difficulty: "standard",
                       requireSources: false, allowExternalKnowledge: true });
  const fSa = {};
  pSa.sections[0].questions.forEach((sl, i) => {
    fSa[sl.id] = { question: "三部会を招集した王の名を答えなさい。" + i,
                   choices: [{ id: "c1", text: "アスカル3世" }, { id: "c2", text: "アスカル1世" }],
                   answer: "アスカル3世", explanation: "解説です。" };
  });
  const aSa = C.assemble(pSa, fSa, { ownerId: "u1" });
  const qsSa = aSa.spec.sections.flatMap((s) => s.questions);
  ok("短答に選択肢は付けない", qsSa.every((q) => (q.choices || []).length === 0),
     JSON.stringify(qsSa.map((q) => (q.choices || []).length)));
  ok("短答の正解が空にならない", qsSa.every((q) => String(q.correctAnswer || "").trim()),
     JSON.stringify(qsSa.map((q) => q.correctAnswer)));
  const eSa = V.validateMockSpecForSave(aSa.spec).filter((i) => i.severity === "error");
  ok("短答だけの試験も保存できる", eSa.length === 0, eSa.map((e) => e.code + "@" + e.path).join(", "));
}

/* ══ 6) 無理な条件を黙って通さない ══ */
section("無理な条件（V1 で保存 NG になっていた 5点/20問）");
{
  const p = C.plan({ totalPoints: 5, sectionCount: 2, questionCount: 20, types: ALL_TYPES });
  ok("設問数を満点まで減らす（5 問）", p.totalQuestions === 5, String(p.totalQuestions));
  ok("減らしたことを high で伝える",
     p.issues.some((i) => i.type === "too_many_questions" && i.severity === "high"),
     JSON.stringify(p.issues));
  ok("それでも合計は満点にぴったり", p.allocatedPoints === 5, String(p.allocatedPoints));
}

/* ══ 7) 1 大問が大きくなりすぎない ══ */
section("大問の分割（1 回の生成を短く保つ）");
{
  const p = C.plan({ totalPoints: 100, sectionCount: 1, questionCount: 30, types: ALL_TYPES });
  const max = Math.max(...p.sections.map((s) => s.questionCount));
  ok(`1 大問あたり ${C.MAX_PER_SECTION} 問以下`, max <= C.MAX_PER_SECTION, String(max));
  ok("設問の総数は 30 のまま", p.totalQuestions === 30, String(p.totalQuestions));
  ok("大問を増やしたことを伝える", p.issues.some((i) => i.type === "sections_expanded"));
}

/* ══ 7.5) 頼んだ数が黙って減らないこと ══
   V1 の実測（2026-07-27 耐久試験 4/8）:
     「定期 100点/30問」を頼んだのに **24 問**しかできなかった。
   原因は大問数 4 × 1 回あたりの上限 6 = 24 で頭打ちになるのに、
   足りないぶんを誰も作らないまま完成扱いにしていたこと。
   V2 は大問を増やして枠を確保するので、頼んだ数がそのまま出る。 */
section("頼んだ数が黙って減らないこと（V1 の「30問頼んで24問」）");
{
  const p = C.plan({ totalPoints: 100, sectionCount: 4, questionCount: 30, types: ALL_TYPES, difficulty: "mixed" });
  ok("30 問の枠ができる（24 に減らない）", p.totalQuestions === 30, String(p.totalQuestions));
  ok("合計は 100 点", p.allocatedPoints === 100, String(p.allocatedPoints));

  const filled = {};
  p.sections.forEach((s) => s.questions.forEach((q) => { filled[q.id] = draftFor(p, q.id); }));
  const a = C.assemble(p, filled, {});
  const made = a.spec.sections.reduce((x, s) => x + s.questions.length, 0);
  ok("組み立て後も 30 問", made === 30, String(made));
  ok("verify は無指摘", C.verify(a.spec, p).length === 0,
     JSON.stringify(C.verify(a.spec, p).map((i) => i.type)));

  /* 減らすときは必ず理由を残す（無理な条件のときだけ減る）。 */
  const p2 = C.plan({ totalPoints: 100, sectionCount: 4, questionCount: 200, types: ALL_TYPES });
  ok("満点を超える設問数のときだけ減り、理由が残る",
     p2.totalQuestions === 100 && p2.issues.some((i) => i.type === "too_many_questions"),
     p2.totalQuestions + " / " + JSON.stringify(p2.issues.map((i) => i.type)));
}

/* ══ 8) 同じ入力なら同じ計画（再現できること） ══ */
section("再現性");
{
  const req = { totalPoints: 100, sectionCount: 4, questionCount: 13, types: ALL_TYPES, difficulty: "mixed" };
  const a = JSON.stringify(C.plan(req));
  const b = JSON.stringify(C.plan(req));
  ok("同じ条件から同じ計画が出る", a === b);
}

/* ══ 9) 計測（GenerationStageMetric） ══ */
section("計測");
{
  const m = new C.Metrics("test");
  m.begin("plan"); m.end("plan", { questions: 9 });
  m.begin("generate"); m.note({ requested: 9, generated: 11, accepted: 9, discarded: 2 });
  m.noteUsage({ promptTokens: 100, completionTokens: 50, modelCalls: 3 });
  m.end("generate");
  m.begin("assemble");                       /* わざと閉じない */
  const s = m.snapshot();
  ok("工程ごとの所要が出る", s.stages.length === 2, JSON.stringify(s.stages));
  ok("作った数と捨てた数が出る", s.counts.generated === 11 && s.counts.discarded === 2, JSON.stringify(s.counts));
  ok("Token とモデル呼び出し回数が出る", s.tokens.prompt === 100 && s.tokens.modelCalls === 3, JSON.stringify(s.tokens));
  ok("閉じ忘れた工程を隠さない", s.openStages.length === 1 && s.openStages[0] === "assemble",
     JSON.stringify(s.openStages));
}

/* ── 補助 ── */
function slotOf(p, id) {
  for (const s of p.sections) for (const q of s.questions) if (q.id === id) return q;
  return null;
}
function draftFor(p, id) {
  const slot = slotOf(p, id);
  const needsChoices = C.NEEDS_CHOICES[slot.type];
  /* 正誤問題の選択肢はちょうど 2 つ。3 つ作ると保存できない仕様になる。 */
  const choices = slot.type === "true_false"
    ? [{ id: "c1", text: "正しい" }, { id: "c2", text: "誤っている" }]
    : [{ id: "c1", text: "選択肢1" }, { id: "c2", text: "選択肢2" }, { id: "c3", text: "選択肢3" }];
  return {
    question: "テスト設問 " + id + " の問題文です。",
    type: slot.type,
    choices: needsChoices ? choices : [],
    answer: needsChoices ? "c1" : "テスト解答",
    explanation: "テスト解説。",
    /* AI が勝手な配点を書いてきても無視されることを確かめる（枠は slot.points）。 */
    points: 999,
    /* 出典は実データへ解決できる形で渡す（fileName が無いものは仕様から落ちる）。 */
    sourceReferences: [{ evidenceId: "e1", attachmentId: "a1", fileName: "資料.pdf", page: 1 }]
  };
}
function sumPoints(spec) {
  return spec.sections.reduce((a, s) => a + s.questions.reduce((x, q) => x + (Number(q.points) || 0), 0), 0);
}

console.log(`\n══ まとめ ══`);
console.log(`  合格 ${pass} / 不合格 ${fail}`);
if (failures.length) {
  console.log("  不合格の中身:");
  failures.forEach((f) => console.log(`    - ${f.name}${f.detail ? " — " + f.detail : ""}`));
}
process.exit(fail ? 1 : 0);
