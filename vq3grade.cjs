/* AI 記述採点の耐久試験（夜間 Hardening）

   満点・部分点・0点・別表現・無回答・表記ゆれ・余分な説明・矛盾 を含む
   答案を実ローカルモデルで採点し、点の妥当性と **同じ答案のばらつき** を測る。

   これは個人の学習支援のための補助採点であって、
   学校の成績をつけるためのものではない。その前提を崩さない。

   使い方:
     node vq3grade.cjs                  # 既定 30 答案 ＋ ばらつき 3 回
     node vq3grade.cjs --n 6 --repeat 2
     node vq3grade.cjs --out artifacts/v3-overnight/test-results/grading.json */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const N = Number(arg("n", 30));
const REPEAT = Number(arg("repeat", 3));
const OUT = arg("out", "artifacts/v3-overnight/test-results/grading.json");
const HIDE = "#vqNewAuth{display:none !important}";

async function login(pg) {
  await pg.goto("http://127.0.0.1:8791/?vqdev=1", { waitUntil: "domcontentloaded", timeout: 30000 });
  await pg.addStyleTag({ content: HIDE });
  await pg.waitForFunction(() => document.getElementById("authLoginSubmitBtn"), { timeout: 20000 });
  await pg.evaluate(() => {
    const setV = (el, v) => {
      const p = el.tagName === "SELECT" ? HTMLSelectElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(p.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    setV(document.getElementById("authLoginGrade"), "H3");
    setV(document.getElementById("authLoginNickname"), "tester");
    setV(document.getElementById("authLoginPassword"), "Abcd1234");
    document.getElementById("authLoginSubmitBtn").click();
  });
  await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 30000 });
  await pg.waitForTimeout(1800);
}

/* 設問と答案。expect は「だいたいこの帯に入るはず」という目安であって、
   1 点単位の正解ではない（AI 採点にそこまでの再現性は求めない）。 */
const QUESTIONS = [
  {
    id: "Q1", points: 10,
    prompt: "鎌倉幕府が御家人との結びつきを保てなくなった理由を、御恩と奉公の関係にふれて説明しなさい。",
    model: "元寇では新たな領地を得られず、幕府が御恩として与える土地が不足したため、"
      + "奉公に見合う恩賞を与えられなくなり、御家人の信頼を失ったから。",
    answers: [
      { tag: "full", text: "元寇では新しい領地が得られず、幕府は御恩として与える土地が足りなくなった。"
        + "そのため御家人の奉公に見合う恩賞を出せず、結びつきが弱まった。", expect: "high" },
      { tag: "partial", text: "元寇のあと、御家人が貧しくなったから。", expect: "low" },
      { tag: "paraphrase", text: "防衛戦だったので幕府に配る土地がなく、働きに対する見返りを用意できなくなり、"
        + "主従のつながりが崩れた。", expect: "high" },
      { tag: "wrong", text: "織田信長が幕府を滅ぼしたから。", expect: "zero" },
      { tag: "empty", text: "", expect: "zero" },
      { tag: "verbose", text: "とても難しい問題ですが、私の考えを述べます。まず前提として鎌倉時代は武士の時代でした。"
        + "そして元寇が起きました。元寇はモンゴルが攻めてきた出来事です。"
        + "結論としては、幕府が土地を与えられなくなり、御恩と奉公の関係が保てなくなったからです。", expect: "mid" },
      { tag: "contradict", text: "幕府は十分な恩賞を与えていたが、御家人は不満だった。恩賞が足りなかったからである。", expect: "low" }
    ]
  },
  {
    id: "Q2", points: 8,
    prompt: "光合成において、植物が光エネルギーをどのように利用しているか説明しなさい。",
    model: "光エネルギーを使って水を分解し、その電子で二酸化炭素から有機物（デンプンなど）を合成し、"
      + "エネルギーを化学エネルギーとして蓄える。",
    answers: [
      { tag: "full", text: "光のエネルギーで水を分解して電子を取り出し、そのはたらきで二酸化炭素からデンプンなどの"
        + "有機物を作り、エネルギーを化学エネルギーとして蓄えている。", expect: "high" },
      { tag: "partial", text: "光を使って栄養を作っている。", expect: "low" },
      { tag: "notation", text: "光ｴﾈﾙｷﾞｰで水を分解し、ＣＯ２から有機物をつくる。", expect: "high" },
      { tag: "wrong", text: "光を浴びると植物は酸素を吸って二酸化炭素を出す。", expect: "zero" },
      { tag: "empty", text: "　", expect: "zero" },
      { tag: "extra", text: "光合成は葉緑体で起こります。ちなみに呼吸はミトコンドリアです。"
        + "光エネルギーは水の分解と有機物の合成に使われます。", expect: "mid" }
    ]
  },
  {
    id: "Q3", points: 6,
    prompt: "円の面積の公式が πr² になる理由を、直感的に説明しなさい。",
    model: "円を細かい扇形に分けて交互に並べ替えると、底辺が円周の半分 πr、高さが r の長方形に近づくため、"
      + "面積は πr × r = πr² になる。",
    answers: [
      { tag: "full", text: "円を細かい扇形に切って交互に並べると、横 πr・縦 r の長方形に近づくので πr² になる。", expect: "high" },
      { tag: "partial", text: "半径をかけるから。", expect: "zero" },
      { tag: "formula-only", text: "S=πr²", expect: "zero" },
      { tag: "wrong", text: "円周が 2πr だから、その 2 倍が面積になる。", expect: "zero" },
      { tag: "empty", text: "", expect: "zero" }
    ]
  }
];

function band(score, max) {
  const r = max > 0 ? score / max : 0;
  if (r >= 0.75) return "high";
  if (r >= 0.35) return "mid";
  if (r > 0) return "low";
  return "zero";
}
/* 目安と実際が「隣の帯」までなら許容。2 段以上ずれたら記録する。 */
const ORDER = ["zero", "low", "mid", "high"];
function bandGap(a, b) { return Math.abs(ORDER.indexOf(a) - ORDER.indexOf(b)); }

(async () => {
  const started = new Date();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();
  const consoleErrors = [], pageErrors = [];
  pg.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
  pg.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 200)));
  await login(pg);

  const runs = [], problems = [];
  function note(kind, detail) { problems.push({ kind, detail }); }

  /* 採点を 1 件走らせる */
  async function grade(q, a) {
    return pg.evaluate(async ({ q, a }) => {
      const S = window.VQ2.schema, G = window.VQ2.grading, AI = window.VQ2.ai;
      const question = S.emptyQuestion({
        type: "long_answer", points: q.points, prompt: q.prompt, correctAnswer: q.model
      });
      question.choices = [];
      question.scoringRubric = S.defaultRubric("long_answer", q.points);
      const graded = G.gradeSession([question], [{ questionId: question.id, value: { text: a.text } }]);
      /* 無回答はコードの側で 0 点になる（AI を呼ばない）のが正しい */
      if (!graded.pendingAi.length) {
        const it = graded.items[0];
        return { ok: true, viaAi: false, score: it.score, max: it.maxScore, answered: it.answered };
      }
      const t = graded.pendingAi[0];
      const targets = [{
        questionId: question.id, question: question.prompt, modelAnswer: question.correctAnswer,
        answer: t.answer.text, points: question.points, subject: "",
        rubric: question.scoringRubric.items.map((x) => ({
          id: x.id, description: x.description, points: x.points,
          criterionLabel: S.criterionLabel(x.criterionId)
        })),
        sourceText: ""
      }];
      try {
        const res = await AI.gradeAnswers({ targets });
        const data = res.structured && res.structured.data ? res.structured.data : null;
        const g = data && data.grades && data.grades[0];
        if (!g || !g.ok) return { ok: false, why: "採点されなかった: " + JSON.stringify(g).slice(0, 120) };
        const applied = G.applyAiGrade(graded.items[0], question, g.grade);
        return {
          ok: true, viaAi: true, score: applied.score, max: applied.maxScore,
          breakdown: applied.rubricBreakdown.map((b) => b.rubricItemId + ":" + b.awarded + "/" + b.maxPoints),
          reasons: applied.rubricBreakdown.map((b) => String(b.reason || "").length),
          hasReason: String(applied.scoringReason || "").length > 0,
          missing: applied.missingElements.length,
          confidence: applied.confidence,
          requiresReview: applied.requiresReview,
          idsOk: applied.rubricBreakdown.every((b) =>
            question.scoringRubric.items.some((x) => x.id === b.rubricItemId))
        };
      } catch (e) { return { ok: false, why: String((e && (e.userMessage || e.message)) || e) }; }
    }, { q, a });
  }

  /* ── 1) いろいろな答案を採点 ── */
  const flat = [];
  QUESTIONS.forEach((q) => q.answers.forEach((a) => flat.push({ q, a })));
  const plan = [];
  for (let i = 0; i < N; i++) plan.push(flat[i % flat.length]);

  console.log(`\n══ AI 記述採点 耐久試験（${plan.length} 答案）══`);

  for (let i = 0; i < plan.length; i++) {
    const { q, a } = plan[i];
    const t0 = Date.now();
    const r = await grade(q, a);
    const ms = Date.now() - t0;
    const got = r.ok ? band(r.score, r.max) : null;
    const gap = r.ok ? bandGap(got, a.expect) : null;
    runs.push({ i: i + 1, q: q.id, tag: a.tag, expect: a.expect, got, gap, ms,
                score: r.ok ? r.score : null, max: q.points, viaAi: r.viaAi,
                confidence: r.confidence, requiresReview: r.requiresReview, ok: r.ok, why: r.why });

    if (!r.ok) note("failed", `${i + 1} 件目（${q.id}/${a.tag}）採点できず: ${r.why}`);
    else {
      if (r.viaAi && r.idsOk === false) note("rubric-id", `${i + 1} 件目で採点基準に無い id が返った`);
      if (r.viaAi && !r.hasReason) note("no-reason", `${i + 1} 件目で採点の理由が空`);
      if (r.viaAi && (r.reasons || []).some((n) => n === 0)) note("no-item-reason", `${i + 1} 件目で内訳の理由が空`);
      if (a.tag === "empty" && r.score !== 0) note("empty-score", `無回答に ${r.score} 点が付いた`);
      if (gap >= 2) note("band", `${i + 1} 件目（${q.id}/${a.tag}）想定 ${a.expect} に対し ${got}（${r.score}/${r.max}）`);
    }
    console.log(`  ${String(i + 1).padStart(2)}/${plan.length} ${q.id}/${a.tag.padEnd(11)} `
      + (r.ok ? `${r.score}/${r.max} (${got}, 想定 ${a.expect}) ${Math.round(ms / 1000)}秒`
              + (r.requiresReview ? " 要確認" : "")
              + (r.viaAi ? "" : " ※コード判定")
              : "NG: " + r.why));
  }

  /* ── 2) 同じ答案を繰り返してばらつきを測る ── */
  console.log(`\n── 同じ答案を ${REPEAT} 回ずつ採点（ばらつき）──`);
  const variance = [];
  for (const q of QUESTIONS) {
    for (const tag of ["full", "partial"]) {
      const a = q.answers.find((x) => x.tag === tag);
      if (!a) continue;
      const scores = [];
      for (let k = 0; k < REPEAT; k++) {
        const r = await grade(q, a);
        if (r.ok) scores.push(r.score);
      }
      if (!scores.length) continue;
      const min = Math.min(...scores), max = Math.max(...scores);
      const spread = q.points ? Math.round(((max - min) / q.points) * 1000) / 10 : 0;
      variance.push({ q: q.id, tag, points: q.points, scores, min, max, spreadPct: spread });
      if (spread > 50) note("variance", `${q.id}/${tag} の点が ${min}〜${max}（配点の ${spread}%）とばらついた`);
      console.log(`  ${q.id}/${tag.padEnd(8)} ${scores.join(", ")} → 幅 ${max - min}/${q.points}点（${spread}%）`);
    }
  }

  /* ── 3) 手直しと履歴 ── */
  const override = await pg.evaluate(() => {
    const G = window.VQ2.grading;
    const item = { questionId: "q1", score: 3, maxScore: 10, correct: false };
    G.overrideScore(item, 8, "根拠は示せているため", "user");
    G.overrideScore(item, 6, "やはり不足がある", "user");
    return { score: item.score, history: (item.history || []).length,
             from: (item.history || []).map((h) => h.from + "→" + h.to),
             reasonsKept: (item.history || []).every((h) => String(h.reason || "").length > 0),
             review: item.requiresReview, overridden: item.overridden };
  });
  console.log(`\n── 得点の手直し ──`);
  console.log(`  ${override.from.join(" / ")} → 最終 ${override.score} 点 / 履歴 ${override.history} 件`
    + ` / 理由 ${override.reasonsKept ? "全件あり" : "欠けあり"}`);
  if (override.history !== 2) note("override", "手直しの履歴が残っていない");
  if (!override.reasonsKept) note("override-reason", "手直しの理由が残っていない");

  /* ── 4) 採点基準が無いときは採点しない ── */
  const noRubric = await pg.evaluate(async () => {
    const S = window.VQ2.schema, AI = window.VQ2.ai;
    const res = await AI.gradeAnswers({ targets: [{
      questionId: "qx", question: "説明しなさい。", modelAnswer: "", answer: "適当な答え",
      points: 10, subject: "", rubric: [], sourceText: "" }] });
    const d = res.structured && res.structured.data ? res.structured.data : null;
    const g = d && d.grades && d.grades[0];
    return { ok: !!g && g.ok === false, reason: g && g.reason, text: (res.text || "").slice(0, 100) };
  });
  console.log(`  採点基準なし → ${noRubric.ok ? "採点せず（" + noRubric.reason + "）" : "採点してしまった"}`);
  if (!noRubric.ok) note("no-rubric", "採点基準が無いのに採点した（根拠を示せない採点）");

  /* ── まとめ ── */
  const ok = runs.filter((r) => r.ok);
  const viaAi = ok.filter((r) => r.viaAi);
  const times = viaAi.map((r) => r.ms).sort((a, b) => a - b);
  const uiErrors = consoleErrors.filter((e) => !/favicon|net::ERR|Failed to load resource|503|404/i.test(e));
  const bandOk = ok.filter((r) => r.gap <= 1).length;

  const summary = {
    startedAt: started.toISOString(), finishedAt: new Date().toISOString(),
    answers: plan.length, success: ok.length, failed: plan.length - ok.length,
    gradedByAi: viaAi.length, gradedByCode: ok.length - viaAi.length,
    msP50: times.length ? times[Math.floor(times.length * 0.5)] : null,
    msP95: times.length ? times[Math.floor(times.length * 0.95)] : null,
    bandAgreement: ok.length ? Math.round((bandOk / ok.length) * 1000) / 10 : 0,
    requiresReviewRate: ok.length ? Math.round((ok.filter((r) => r.requiresReview).length / ok.length) * 1000) / 10 : 0,
    variance, override, noRubricRefused: noRubric.ok,
    uiConsoleErrors: uiErrors, pageErrors, problems, runs
  };

  console.log("\n══ まとめ ══");
  console.log(`  採点        : ${ok.length} / ${plan.length}（AI ${viaAi.length} / コード ${ok.length - viaAi.length}）`);
  console.log(`  1 件の所要  : p50 ${Math.round((summary.msP50 || 0) / 1000)}秒 / p95 ${Math.round((summary.msP95 || 0) / 1000)}秒`);
  console.log(`  想定の帯と一致: ${summary.bandAgreement}%（隣の帯まで許容）`);
  console.log(`  要確認の割合: ${summary.requiresReviewRate}%`);
  console.log(`  ばらつき最大: ${variance.length ? Math.max(...variance.map((v) => v.spreadPct)) : "-"}%`);
  console.log(`  Console err : ${uiErrors.length} 件 / pageerror ${pageErrors.length} 件`);
  console.log(`  問題        : ${problems.length} 件`);
  problems.slice(0, 20).forEach((p) => console.log(`    - [${p.kind}] ${p.detail}`));

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
  console.log(`\n記録: ${OUT}`);

  await browser.close();
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
