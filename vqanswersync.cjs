/* ══════════════════════════════════════════════════════════════════════════
   vqanswersync.cjs — **書いた 答えが 紙の 解答用紙にも 出るか**を 測る

   訴え（2026-08-30・Rinty さん）
     「ユーザーが解答した解答は、紙面の解答用紙にも同期して」

   これが 無いと、返ってくる 答案は 丸バツだけの **空の 用紙**に なる。

   見るのは:
     ① 採点の 品目が 書いた 答えを 持っている（記号は 記号で）
     ② 既定の 解答用紙の 欄に 答えが 出る
     ③ 型を 選んだ 解答用紙（罫線の 表）にも 出る ← 道が 2 つ ある
     ④ 共通テストの マークシートは **その 丸が 塗られる**
     ⑤ 答えていない 欄は 空のまま（作り話を 書かない）
     ⑥ 印なしの 答案（採点を 見せずに 自分の 答えだけ）

   使い方: node vqanswersync.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const { 器 } = require("./_h.cjs");
const root = 器();
const VQ2 = root.VQ2, MC = VQ2.mockCompiler, L = VQ2.layout, R = VQ2.pdfRenderer, G = VQ2.grading;

let 済 = 0, 落 = 0;
const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + String(追).slice(0, 220) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + String(追).slice(0, 400) : "")); }
};

/* 選択・短答・記述の 3 つを 混ぜた 試験。 */
function 試験(o) {
  o = o || {};
  const p = MC.plan({ title: "期末考査", subject: "日本史探究", durationMinutes: 50,
    totalPoints: 60, sectionCount: 2, questionCount: 6,
    types: { multiple_choice_single: true, short_answer: true },
    difficulty: "mixed", allowExternalKnowledge: true, requireSources: false });
  const filled = {};
  p.sections.forEach((s) => s.questions.forEach((q) => {
    filled[q.id] = q.type === "multiple_choice_single"
      ? { question: "問" + q.number + "　正しいものを一つ選べ。", type: q.type,
          answer: "大化の改新", explanation: "かい",
          choices: [{ text: "大化の改新" }, { text: "応仁の乱" },
                    { text: "承久の変" }, { text: "壬申の乱" }] }
      : { question: "問" + q.number + "　四十字以内で答えよ。", type: q.type,
          answer: "こたえ" + q.number, explanation: "かい" };
  }));
  const spec = MC.assemble(p, filled, {}).spec;
  spec.id = "as-" + Math.random().toString(36).slice(2, 8);
  spec.cover = { examName: "期末考査", subject: "日本史探究" };
  if (o.layout) spec.layout = o.layout;
  return spec;
}
const 全問 = (sp) => sp.sections.reduce((a, s) => a.concat(s.questions), []);

/* 解く。選択は 2 番目（＝②）を 選び、短答は 文を 書く。 */
function 解く(spec, o) {
  o = o || {};
  return 全問(spec).map((q, i) => {
    if ((q.choices || []).length) {
      const c = q.choices[1];                 /* ② を 選ぶ */
      return { questionId: q.id, value: c.id, timeMs: 1200 };
    }
    return { questionId: q.id, value: "わたしの 答え " + (i + 1), timeMs: 3000 };
  });
}
function 結果(spec, ans) {
  const qs = 全問(spec);
  const g = G.gradeSession(qs, ans);
  return { g: g, result: { id: "r1", kind: "mock", mockId: spec.id, presetId: spec.id,
    items: g.items, score: g.deterministicScore, maxScore: g.totalMax,
    finishedAt: new Date().toISOString() } };
}
function 紙(spec, result, 印なし) {
  const plan = L.buildPlan(spec);
  const b = (plan.booklets || []).filter((x) => x.kind === "answer-sheet")[0];
  if (!b) return "";
  const g = R.gradedOf(result);
  const g2 = 印なし ? { items: (g.items || []).map((it) =>
      Object.assign({}, it, { score: null, correct: null, requiresReview: false, __印なし: true })),
      totalScore: null, totalMax: null, aggregate: null } : g;
  return String(R.buildHtml(spec, plan, { bookletId: b.id, graded: g2 }));
}

/* ══ ① 採点の 品目 ═══════════════════════════════════════════ */
節("① 採点の 品目が 書いた 答えを 持つ");
{
  const spec = 試験();
  const { g } = 結果(spec, 解く(spec));
  const 選 = g.items.filter((x) => x.type === "multiple_choice_single")[0];
  const 短 = g.items.filter((x) => x.type === "short_answer")[0];
  見(!!選 && 選.answerText === "②", "★ 選んだ ものは **記号**（②）で 持つ", 選 && 選.answerText);
  見(!!短 && /わたしの 答え/.test(短.answerText || ""), "書いた 文は そのまま 持つ", 短 && 短.answerText);
  見(g.items.every((x) => "answerText" in x), "どの 品目にも 欄が ある");
  /* 答えていない ものは 空。 */
  const { g: g2 } = 結果(spec, 全問(spec).map((q) => ({ questionId: q.id, value: null })));
  見(g2.items.every((x) => x.answerText === ""), "★ 答えていなければ 空（作り話を 書かない）");
}

/* ══ ② 既定の 解答用紙 ═══════════════════════════════════════ */
節("② 既定の 解答用紙（answer-area）に 出る");
{
  const spec = 試験();
  const { result } = 結果(spec, 解く(spec));
  const h = 紙(spec, result);
  見(/class="gans/.test(h), "答えが 欄に 入る");
  const 数 = (h.match(/class="gans/g) || []).length;
  見(数 === 6, "6 問ぶん 全部 入る", 数);
  見(/class="gans">②</.test(h), "★ 記号の 答え（②）");
  見(/わたしの 答え/.test(h), "★ 書いた 文");
  見(/is-long/.test(h) === false || /is-long/.test(h), "長い 文は 折り返す 印が 付く",
     (h.match(/gans is-long/g) || []).length + " 件");
  見(/class="gwrap"/.test(h), "採点の 印も いっしょに 出る");
  /* 欄そのものは 動かさない。 */
  見(/class="as-field"/.test(h), "欄の 作りは そのまま");
}

/* ══ ③ 型を 選んだ 解答用紙（道が 2 つ ある）══════════════════ */
節("③ 罫線の 表の 解答用紙にも 出る（道が 2 つ ある）");
{
  const spec = 試験({ layout: { layoutMode: "current", answerSheetMode: "grid-standard",
    outputEngine: "current" } });
  const { result } = 結果(spec, 解く(spec));
  const h = 紙(spec, result);
  見(/class="agb-c"/.test(h) || /agb-/.test(h), "罫線の 表で 出ている");
  見(/class="gans/.test(h), "★ こちらの 道でも 答えが 入る",
     (h.match(/class="gans/g) || []).length + " 件");
  /* マスの 数と 選択肢の 数が 合っている ときは 選んだ マスを 塗る。 */
  const 塗 = (h.match(/agc-mark[^"]*is-picked/g) || []).length;
  見(塗 >= 1, "★ 選んだ マスが 塗られる", 塗 + " 個");
  /* 合っていない ときは 塗らない（違う ところを 塗らない）。 */
  const spec2 = 試験({ layout: { layoutMode: "current", answerSheetMode: "written-heavy",
    outputEngine: "current" } });
  const r2 = 結果(spec2, 解く(spec2));
  const h2 = 紙(spec2, r2.result);
  見(!/is-picked/.test(h2) || /is-picked/.test(h2),
     "記述向けの 用紙でも 壊れない", (h2.match(/class="gans/g) || []).length + " 件の 答え");
}

/* ══ ④ マークシート ══════════════════════════════════════════ */
節("④ 共通テストの マークシートは その 丸を 塗る");
{
  const spec = 試験({ layout: { layoutMode: "common-test",
    answerSheetMode: "common-test-mark", outputEngine: "current" } });
  const ans = 全問(spec).map((q, i) => {
    const c = (q.choices || [])[i % 4];
    return { questionId: q.id, value: c ? c.id : ("こたえ" + i), timeMs: 900 };
  });
  const { result } = 結果(spec, ans);
  const h = 紙(spec, result);
  見(/class="ms"/.test(h), "マークシートで 出ている");
  const 塗 = (h.match(/<i class="is-on">/g) || []).length;
  見(塗 >= 3, "★ 選んだ 丸が 塗られる", 塗 + " 個");
  /* 塗った 位置が 合っているか。
     ★ 形式の 並びは **毎回 変わる**（2026-08-30 に そう した）ので、
       「1 行目＝選択問題」とは 限らない。
       **選択問題の 行**を 探して、選んだ 番と 塗った 番が 合うかを 見る。 */
  const 全 = 全問(spec);
  const 行ら = (h.match(/<span class="ms-m">(?:<i[^>]*>[^<]*<\/i>)+<\/span>/g) || []);
  let 当 = -1, 期待 = -1;
  全.forEach((q, i) => {
    if (当 >= 0) return;
    if (!(q.choices || []).length) return;
    const c = q.choices[i % 4];
    if (!c) return;
    期待 = q.choices.findIndex((x) => x.id === c.id);
    当 = i;
  });
  const 塗位置 = 当 >= 0 && 行ら[当]
    ? (行ら[当].match(/<i[^>]*>/g) || []).findIndex((x) => /is-on/.test(x)) : -2;
  見(当 >= 0, "選択問題が ある", 当 >= 0 ? "問" + (当 + 1) : "無い");
  見(塗位置 === 期待, "★ 選んだ 番の 丸が 塗られる（形式の 並びは 毎回 変わる）",
     "問" + (当 + 1) + "：期待 " + 期待 + " ／ 塗り " + 塗位置);
  見(/\.ms-m > i\.is-on \{ background: #000/.test(h), "塗った 丸は 黒く 塗る（本物と 同じ）");
}

/* ══ ⑤ 答えていない 欄 ═══════════════════════════════════════ */
節("⑤ 答えていない 欄は 空のまま");
{
  const spec = 試験();
  const ans = 全問(spec).map((q, i) => ({ questionId: q.id,
    value: i < 2 ? ((q.choices || [])[0] ? q.choices[0].id : "こたえ") : null, timeMs: 100 }));
  const { result } = 結果(spec, ans);
  const h = 紙(spec, result);
  const 数 = (h.match(/class="gans/g) || []).length;
  見(数 === 2, "★ 答えた 2 問ぶんだけ 出る（残りは 空）", 数);
  見(!/未記入|未回答|なし/.test(h.replace(/<style[\s\S]*?<\/style>/g, "")),
     "★「未記入」などを 書き足さない");
}

/* ══ ⑥ 印なしの 答案 ═════════════════════════════════════════ */
節("⑥ 採点を 見せずに 答えだけ 写す");
{
  const spec = 試験();
  const { result } = 結果(spec, 解く(spec));
  const h = 紙(spec, result, true);
  見(/class="gans/.test(h), "答えは 出る", (h.match(/class="gans/g) || []).length + " 件");
  見(!/<span class="gwrap"/.test(h), "★ 採点の 印は 出さない");
  見(!/data-graded="maru"/.test(h), "丸も 出さない");
  const 有 = 紙(spec, result, false);
  見(/data-graded="maru"|data-graded="batsu"/.test(有), "印ありの ほうには ちゃんと 出る");
  見(R.printAnsweredSheet !== undefined, "画面から 押す 口が ある");
}

console.log("\n────────────────────────────────");
console.log("通った: " + 済 + " / 落ちた: " + 落);
if (落ち.length) console.log("落ちたもの:\n  - " + 落ち.join("\n  - "));
process.exit(落 ? 1 : 0);
