/* MockCompiler V2（実行の層）のテスト。

   AI は呼ばない。代わりに「AI がやりがちな失敗」をする偽の生成器を渡し、
   それでも試験が壊れないことを確かめる。

   偽の生成器が再現する、V1 で実際に起きた失敗:
     ・頼んだ数より多く返す（実測 4 問 → 48 問）
     ・解説や正解を落とす
     ・選択肢 0 件の選択問題を返す
     ・正誤問題に選択肢を 3 つ付ける
     ・勝手な配点を書いてくる
     ・依頼そのものが失敗する（エンジンのエラー）

   実行: node vqmockrun.cjs
*/
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const V2 = path.join(__dirname, "client", "v2", "domain");
const ORDER = ["schema.js", "validate.js", "adapter.js", "score-allocator.js",
               "draft.js", "mock-builder.js", "mock-compiler.js", "mock-compile-run.js"];

const sandbox = { console, Date, Math, JSON, String, Number, Object, Array, Promise, Error,
                  isFinite, parseInt, parseFloat, setTimeout, clearTimeout };
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
const RUN = sandbox.VQ2.mockCompilerRun;
if (!RUN) { console.error("× VQ2.mockCompilerRun が生えていません"); process.exit(1); }

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; failures.push({ name, detail: detail || "" }); console.log(`  × ${name}${detail ? " — " + detail : ""}`); }
}
function section(t) { console.log(`\n── ${t} ──`); }

const TYPES = { multiple_choice_single: true, true_false: true, short_answer: true, long_answer: true };
const SRC = [{ evidenceId: "e1", attachmentId: "a1", fileName: "資料.pdf", page: 1 }];

/* 素直な生成器。頼まれたぶんだけ、そろえて返す。 */
function goodGen(counter) {
  return function (req) {
    if (counter) counter.calls++;
    return Promise.resolve({
      questions: req.slots.map((s) => makeQ(s)),
      usage: { promptTokens: 100, completionTokens: 80, modelCalls: 1 }
    });
  };
}
function makeQ(slot, over) {
  const needs = C.NEEDS_CHOICES[slot.type];
  const choices = slot.type === "true_false"
    ? [{ id: "c1", text: "正しい" }, { id: "c2", text: "誤っている" }]
    : [{ id: "c1", text: "選択肢1" }, { id: "c2", text: "選択肢2" }, { id: "c3", text: "選択肢3" }];
  return {
    id: over ? "extra-" + Math.random().toString(36).slice(2, 8) : slot.id,
    question: "設問 " + slot.id + " の問題文です。",
    type: slot.type,
    choices: needs ? choices : [],
    answer: needs ? "c1" : "解答",
    explanation: "解説。",
    points: 999,
    sourceReferences: SRC
  };
}

(async () => {

/* ══ 1) 素直に返ってくるとき ══ */
section("そろって返ってくるとき");
{
  const p = C.plan({ totalPoints: 100, sectionCount: 3, questionCount: 9, types: TYPES, difficulty: "mixed" });
  const counter = { calls: 0 };
  const r = await RUN.run({ plan: p, generate: goodGen(counter), concurrency: 2, batchSize: 3 });
  ok("9 問すべて埋まる", r.accepted === 9, String(r.accepted));
  ok("完成として扱われる", r.complete === true, JSON.stringify(r.issues));
  ok("満点 100 点", sumPoints(r.spec) === 100, String(sumPoints(r.spec)));
  ok("やり直しは 1 巡だけ", r.rounds === 1, String(r.rounds));
  ok("依頼は 3 回（3 問ずつ）", counter.calls === 3, String(counter.calls));
  ok("計測に工程が残る", r.metrics.stages.length >= 3, JSON.stringify(r.metrics.stages.map((s) => s.stage)));
  ok("Token が積算される", r.metrics.tokens.completion === 240, JSON.stringify(r.metrics.tokens));
  ok("AI の申告した配点 999 は使われない",
     !allQ(r.spec).some((q) => q.points === 999), JSON.stringify(allQ(r.spec).map((q) => q.points)));
}

/* ══ 2) 作りすぎ（V1 の 4 問→48 問） ══ */
section("頼んだ数より多く返してくるとき");
{
  const p = C.plan({ totalPoints: 100, sectionCount: 1, questionCount: 4, types: TYPES });
  const gen = (req) => Promise.resolve({
    questions: req.slots.map((s) => makeQ(s))
      .concat(Array.from({ length: 44 }, () => makeQ(req.slots[0], true)))
  });
  const r = await RUN.run({ plan: p, generate: gen, batchSize: 4 });
  ok("試験に入るのは 4 問だけ", r.accepted === 4, String(r.accepted));
  ok("作りすぎた数を数えている", r.overGenerated === 44, String(r.overGenerated));
  ok("満点は 100 点のまま", sumPoints(r.spec) === 100, String(sumPoints(r.spec)));
  ok("完成として扱われる", r.complete === true, JSON.stringify(r.issues));
}

/* ══ 3) 中身が足りない → 足りない枠だけ頼み直す ══ */
section("解説や正解が抜けているとき");
{
  const p = C.plan({ totalPoints: 100, sectionCount: 2, questionCount: 6, types: TYPES });
  let call = 0;
  const seen = [];
  const gen = (req) => {
    call++;
    seen.push(req.slots.map((s) => s.id));
    /* 1 巡目：最初の 1 問だけ解説を落とす。2 巡目からはそろえる。 */
    const bad = call <= 2;
    return Promise.resolve({
      questions: req.slots.map((s, i) => {
        const q = makeQ(s);
        if (bad && i === 0) q.explanation = "";
        return q;
      })
    });
  };
  const r = await RUN.run({ plan: p, generate: gen, batchSize: 3, maxRounds: 2 });
  ok("2 巡目で全部埋まる", r.accepted === 6, String(r.accepted));
  ok("2 巡した", r.rounds === 2, String(r.rounds));
  ok("受理できなかった理由が残る",
     r.rejected.some((x) => x.reasons.some((y) => y.code === "no_explanation")),
     JSON.stringify(r.rejected.slice(0, 2)));

  /* 2 巡目は「足りない枠だけ」を頼んでいること（全部作り直していない）。 */
  const round2 = seen.slice(2);
  const asked2 = round2.reduce((a, x) => a + x.length, 0);
  ok("2 巡目に頼んだのは足りない 2 問だけ", asked2 === 2, JSON.stringify(round2));
  ok("計測に refill が出る",
     r.metrics.stages.some((s) => s.stage === "refill"),
     JSON.stringify(r.metrics.stages.map((s) => s.stage)));
}

/* ══ 4) 直らないまま終わったとき ══ */
section("最後まで埋まらないとき（完成と言わないこと）");
{
  const p = C.plan({ totalPoints: 100, sectionCount: 2, questionCount: 6, types: TYPES });
  /* いつも 1 問目の選択肢を落とす＝どれだけ頼んでも埋まらない */
  const gen = (req) => Promise.resolve({
    questions: req.slots.map((s, i) => {
      const q = makeQ(s);
      if (i === 0) q.choices = [];
      return q;
    })
  });
  const r = await RUN.run({ plan: p, generate: gen, batchSize: 3, maxRounds: 2 });
  ok("埋まらない枠が残る", r.missing.length > 0, JSON.stringify(r.missing));
  ok("完成とは言わない", r.complete === false);
  ok("high の指摘が立つ", r.issues.some((i) => i.severity === "high"),
     JSON.stringify(r.issues.map((i) => i.type)));
  ok("残った設問だけで満点 100 点に合わせ直す", sumPoints(r.spec) === 100, String(sumPoints(r.spec)));
  ok("やり直しは maxRounds で止まる", r.rounds === 2, String(r.rounds));
}

/* ══ 5) 依頼そのものが失敗するとき ══ */
section("依頼が失敗するとき（他の大問を巻き添えにしないこと）");
{
  const p = C.plan({ totalPoints: 100, sectionCount: 3, questionCount: 9, types: TYPES });
  let call = 0;
  const gen = (req) => {
    call++;
    if (call === 2) return Promise.reject(new Error("ENGINE_DOWN"));
    return Promise.resolve({ questions: req.slots.map((s) => makeQ(s)) });
  };
  const r = await RUN.run({ plan: p, generate: gen, batchSize: 3, maxRounds: 2, concurrency: 1 });
  ok("失敗した依頼の 3 問も 2 巡目で埋まる", r.accepted === 9, String(r.accepted));
  ok("失敗を数えている", r.metrics.counts.failed >= 1, JSON.stringify(r.metrics.counts));
  ok("失敗した理由が残る（握り潰さない）",
     r.errors.length >= 1 && r.errors[0].code === "ENGINE_DOWN", JSON.stringify(r.errors));
  ok("最終的に完成する", r.complete === true, JSON.stringify(r.issues));

  /* 同時実行数は 1 でなければならない。VQ2.ai.run() は 1 件しか持てず、
     2 件目は BUSY で即失敗する（実測で確認済み）。既定値を上げさせない。 */
  ok("既定の同時実行数は 1", RUN.DEFAULT_CONCURRENCY === 1, String(RUN.DEFAULT_CONCURRENCY));
}

/* ══ 6) 同時実行数を守る ══ */
section("同時実行数");
{
  const p = C.plan({ totalPoints: 100, sectionCount: 4, questionCount: 12, types: TYPES });
  let active = 0, peak = 0;
  const gen = (req) => {
    active++; peak = Math.max(peak, active);
    return new Promise((res) => setTimeout(() => {
      active--;
      res({ questions: req.slots.map((s) => makeQ(s)) });
    }, 10));
  };
  const r = await RUN.run({ plan: p, generate: gen, batchSize: 3, concurrency: 2 });
  ok("同時に走るのは 2 件まで", peak <= 2, "peak=" + peak);
  ok("12 問すべて埋まる", r.accepted === 12, String(r.accepted));
}

/* ══ 7) 依頼文に必要なことが書かれている ══ */
section("依頼文");
{
  const p = C.plan({ totalPoints: 100, sectionCount: 1, questionCount: 3, types: TYPES, difficulty: "mixed" });
  const req = C.requestsOf(p, { batchSize: 3 })[0];
  const text = RUN.promptFor(req, { title: "期末", requireSources: true, sourceOnly: true });
  ok("作る数が書いてある", text.includes("3 問"), "");
  ok("1 問ごとの id が書いてある", req.slots.every((s) => text.includes(s.id)));
  ok("配点が書いてある", req.slots.every((s) => text.includes(s.points + "点")));
  ok("点数を書き換えるなと書いてある", text.includes("点数は書き換えないでください"));
  ok("正誤問題はちょうど 2 つ、と書いてある", text.includes("正誤問題はちょうど 2 つ"));
  /* 解説の言い直しを止める指示。出力の 31% が解説で、その後半は
     問題文と正解の言い直しだった（実測）。時間にそのまま効くので、必ず入れる。 */
  ok("解説で言い直すな、と書いてある", text.includes("言い直さないでください"));
  ok("資料だけを根拠にする指示が入る", text.includes("添付した資料だけを根拠に"));
}

/* ══ 8) 資料が足りないと断られたとき ══
   サーバは「資料から出題できる内容が足りない」と、依頼まるごとを断る。
   同じ大きさで投げ直しても同じ理由で断られるだけなので、
   次の巡では 1 回の依頼を小さくして拾いに行く。 */
section("資料が足りないとき");
{
  /* 332 字しか読めない資料。3 問頼むと 360 字必要で断られるが、
     1 問（120 字）なら通る、という振る舞いを作る。 */
  function thinSourceGen(seen) {
    return function (req) {
      seen.push(req.slots.length);
      if (req.slots.length * 120 > 332) {
        const e = new Error("INSUFFICIENT_EVIDENCE");
        e.userMessage = "出題に使える内容が資料から足りませんでした。";
        e.sourceDiagnosis = {
          code: "evidence_gate_rejected", reasons: ["too_little_content"],
          contentCharacters: 332, requiredCharacters: req.slots.length * 120
        };
        return Promise.reject(e);
      }
      return Promise.resolve({ questions: req.slots.map((s) => makeQ(s)) });
    };
  }
  const seen = [];
  const p = C.plan({ totalPoints: 60, sectionCount: 1, questionCount: 6, types: TYPES,
                     difficulty: "mixed", requireSources: true });
  const r = await RUN.run({ plan: p, generate: thinSourceGen(seen), batchSize: 3, maxRounds: 3 });

  ok("1 回目は 3 問ずつ頼んでいる", seen[0] === 3, JSON.stringify(seen));
  ok("断られたあとは依頼を小さくする", seen.slice(2).every((n) => n < 3), JSON.stringify(seen));
  ok("資料の量を持ち帰る", !!r.evidence, JSON.stringify(r.evidence));
  ok("この資料で作れる問題数を見積もる",
     r.evidence && r.evidence.maxQuestions === 2, r.evidence && String(r.evidence.maxQuestions));
  ok("1 回の依頼数は 0 にしない（0 にすると永久に頼めない）",
     r.evidence && r.evidence.maxPerRequest >= 1, r.evidence && String(r.evidence.maxPerRequest));
  ok("断られた理由は握り潰さない", r.errors.length > 0, String(r.errors.length));
  /* 小さくして頼み直せば拾えるが、**資料全体で作れる数を超えては作らない**。
     332 字 ÷ 120 字 = 2 問が上限。依頼を 1 問ずつにすれば関門は通せてしまうが、
     それは抜け道なので、上限で止める。 */
  ok("資料で作れる数までは拾う", r.accepted === 2, String(r.accepted));
  ok("上限を超えて絞り出さない", r.accepted <= 2, String(r.accepted));
  ok("足りないぶんは足りないと言う", r.missing.length === 4, String(r.missing.length));
  ok("完成とは言わない", r.complete === false, String(r.complete));
}

{
  /* 断られなければ evidence は付かない（余計な心配をさせない） */
  const p = C.plan({ totalPoints: 30, sectionCount: 1, questionCount: 3, types: TYPES, difficulty: "mixed" });
  const r = await RUN.run({ plan: p, generate: goodGen(null), batchSize: 3 });
  ok("資料不足で断られていなければ、資料の量は付けない", r.evidence === null, JSON.stringify(r.evidence));
}

/* ── 補助 ── */
function allQ(spec) {
  return spec.sections.reduce((a, s) => a.concat(s.questions), []);
}
function sumPoints(spec) {
  return allQ(spec).reduce((a, q) => a + (Number(q.points) || 0), 0);
}

console.log(`\n══ まとめ ══`);
console.log(`  合格 ${pass} / 不合格 ${fail}`);
if (failures.length) {
  console.log("  不合格の中身:");
  failures.forEach((f) => console.log(`    - ${f.name}${f.detail ? " — " + f.detail : ""}`));
}
process.exit(fail ? 1 : 0);

})().catch((e) => { console.error(e); process.exit(1); });
