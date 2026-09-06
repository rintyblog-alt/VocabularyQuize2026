/* ══════════════════════════════════════════════════════════════════════════
   vqpaper.cjs — 紙面（表紙・問題用紙・解答用紙・採点の印）を実物で測る

   訴え（2026-08-30）:
     「表紙からしっかり作れるように」
     「レイアウトを共通テスト風、定期試験風など自由に選べるように」
     「解答用紙も自動で作れる…問題にしっかり対応させる」
     「ルミが解答用紙で採点し、丸バツ三角を表示。点数も入れる」
     「総合点数、内訳である思考判断表現、技術みたいな観点も」

   ここは **AI もブラウザも使わない**。束から紙面の組み立てだけを取り出し、
   出てきた HTML を直に読む。だから速いし、落ちた場所がはっきり分かる。

   使い方: node vqpaper.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs");

let 済 = 0, 落 = 0;
const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + String(追).slice(0, 160) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + String(追).slice(0, 300) : "")); }
};

/* ── 束を読み込む（DOM は使わない）────────────────────────────── */
const src = fs.readFileSync("js-src/vq2-app.b85018b5b8.js", "utf8");
const root = {};
global.window = root;
try { new Function("globalThis", src)(root); } catch (e) { /* 末尾の DOM 触りは無視 */ }
const VQ2 = root.VQ2;
if (!VQ2 || !VQ2.pdfRenderer) { console.error("束を読み込めません。"); process.exit(1); }
const R = VQ2.pdfRenderer, L = VQ2.layout, S = VQ2.schema, LP = VQ2.layoutProfiles, SA = VQ2.scoreAllocator;

/* ── 測る材料（大問 2 つ・形式ちがい 6 問）───────────────────── */
function 問(n, sid, type, pts) {
  const 選択 = ["multiple_choice_single", "true_false"].indexOf(type) >= 0;
  return {
    id: "q" + n, schemaVersion: S.SCHEMA_VERSION, sectionId: sid, number: n, globalNumber: n,
    type: type, prompt: "設問 " + n + " の本文", promptRichText: null,
    media: [], contentBlocks: [],
    choices: 選択 ? [
      { id: "c1", text: "あ", isCorrect: true }, { id: "c2", text: "い", isCorrect: false },
      { id: "c3", text: "う", isCorrect: false }, { id: "c4", text: "え", isCorrect: false }] : [],
    correctAnswer: 選択 ? null : "こたえ",
    acceptedAnswers: 選択 ? [] : ["こたえ"],
    explanation: "", choiceExplanations: null,
    answerBindingId: "b" + n, points: pts,
    criterionAllocation: null, scoringRubric: null,
    estimatedSeconds: 60, difficulty: "normal", topic: "単元", tags: [],
    sourceReferences: [], requiresReview: false, confidence: null, validationIssues: []
  };
}
function 材料() {
  const q = [
    問(1, "s1", "multiple_choice_single", 5),
    問(2, "s1", "true_false", 5),
    問(3, "s1", "short_answer", 5),
    問(4, "s2", "fill_blank", 5),
    問(5, "s2", "long_answer", 10),
    問(6, "s2", "numeric", 5)
  ];
  const spec = {
    id: "m1", schemaVersion: S.SCHEMA_VERSION, ownerId: "",
    title: "2026年度 1学期 期末考査", subject: "日本史探究", grade: "高校2年",
    durationMinutes: 50, totalPoints: 35, instructions: "", sourceMode: "open",
    cover: {
      examDate: "2026年8月30日",
      instructions: ["解答はすべて解答用紙に記入すること。", "筆記用具以外の持ち込みは禁止。"]
    },
    sections: [
      { id: "s1", number: 1, title: "近世の政治", instructions: "", points: 15,
        criterionAllocation: null, questions: q.slice(0, 3) },
      { id: "s2", number: 2, title: "近代の産業", instructions: "", points: 20,
        criterionAllocation: null, questions: q.slice(3) }
    ],
    answerBindings: q.map((x) => ({
      id: x.answerBindingId, questionId: x.id, number: String(x.number),
      inputType: x.type, points: x.points,
      expectedChars: x.type === "long_answer" ? 120 : undefined,
      answerLines: x.type === "long_answer" ? 4 : undefined
    })),
    paper: { size: "A4", orientation: "portrait", writingDirection: "horizontal",
             engine: "auto", templateId: "standard",
             margins: { top: 20, bottom: 20, left: 18, right: 18 } }
  };
  /* 観点は 生成の 最後に 配られる（seedCriterionAllocation）。同じ道を通す。 */
  return SA && SA.seedCriterionAllocation ? SA.seedCriterionAllocation(spec) : spec;
}

/* ══ 段① 表紙 ══ */
節("段① 表紙");
{
  const spec = 材料();
  const plan = L.buildPlan(spec);
  const html = R.buildHtml(spec, plan, {});
  見(/data-cover="1"/.test(html), "表紙のページが出る");
  ["2026年度 1学期 期末考査", "日本史探究", "2026年8月30日", "50 分", "35 点",
   "注意事項", "解答用紙に記入", "開始の指示があるまで"].forEach((t) => {
    見(html.includes(t), "表紙に「" + t + "」がある");
  });
  ["年", "組", "番", "氏名"].forEach((f) => {
    見(new RegExp('class="cv-f[^"]*"><span>' + f + "</span>").test(html), "記入欄「" + f + "」がある");
  });
  /* 表紙を切れる */
  const 無 = R.buildHtml(spec, plan, { cover: false });
  見(!/data-cover="1"/.test(無), "表紙は切れる（cover:false）");
  /* 中身が無ければ出さない */
  const 空 = 材料(); 空.cover = { enabled: false };
  見(!/data-cover="1"/.test(R.buildHtml(空, L.buildPlan(空), {})), "表紙を切っていれば出さない");
}

/* ══ 段② 紙面の型 ══ */
節("段② 紙面の型を選べる");
{
  const 型 = LP.visibleLayoutModes().filter((m) => m.ready && m.profileId);
  見(型.length >= 8, "選べる型が 8 種以上ある", 型.length + " 種");
  const 共 = LP.visibleLayoutModes().filter((m) => m.id === "common-test")[0];
  見(!!共 && 共.ready && !!共.profileId, "「共通テスト風」に実体がある", 共 && 共.profileId);

  const spec = 材料();
  spec.layout = { layoutMode: "common-test", answerSheetMode: "mark-sheet", layoutSeed: "vqp1" };
  const plan = L.buildPlan(spec);
  見(plan.paper.size === "B5", "共通テスト風は B5 になる", plan.paper.size);
  const html = R.buildHtml(spec, plan, {});
  見(/①/.test(html), "選択肢が丸数字になる");
  見(/第\s*1\s*問|第一問/.test(html.replace(/<[^>]+>/g, " ")), "大問が「第 1 問」で出る");

  /* 型を変えると紙が変わる（変わらなければ選べていない） */
  const s2 = 材料();
  s2.layout = { layoutMode: "standard-exam", answerSheetMode: "grid-standard", layoutSeed: "vqp1" };
  const p2 = L.buildPlan(s2);
  見(p2.paper.size !== plan.paper.size || p2.paper.widthMm !== plan.paper.widthMm,
     "別の型を選ぶと紙面が変わる", plan.paper.size + " ↔ " + p2.paper.size);
}

/* ══ 段③ 解答用紙が問題に対応する ══ */
節("段③ 解答用紙と問題の対応");
{
  const spec = 材料();
  const plan = L.buildPlan(spec);
  const 冊 = (plan.booklets || []).map((b) => b.kind);
  見(冊.indexOf("answer-sheet") >= 0, "解答用紙が自動で作られる", 冊.join(", "));

  const html = R.buildHtml(spec, plan, {});
  const 欄 = (html.match(/data-binding="/g) || []).length;
  見(欄 >= spec.answerBindings.length,
     "解答欄の数が問題の数以上ある", "欄 " + 欄 + " / 問 " + spec.answerBindings.length);
  spec.answerBindings.forEach((b) => {
    見(html.indexOf('data-binding="' + b.id + '"') >= 0, "問" + b.number + " の欄がある");
  });
}

/* ══ 段④ 採点済みの解答用紙 ══ */
節("段④ 採点の印（丸・バツ・三角）と点");
{
  const spec = 材料();
  const plan = L.buildPlan(spec);
  /* 採点結果を手で作る。正解 / 不正解 / 部分点 / 確認待ち を 1 つずつ入れる。 */
  const graded = {
    items: [
      { questionId: "q1", type: "multiple_choice_single", answered: true, correct: true,  score: 5,  maxScore: 5,  requiresReview: false },
      { questionId: "q2", type: "true_false",             answered: true, correct: false, score: 0,  maxScore: 5,  requiresReview: false },
      { questionId: "q3", type: "short_answer",           answered: true, correct: false, score: 3,  maxScore: 5,  requiresReview: false },
      { questionId: "q4", type: "fill_blank",             answered: true, correct: true,  score: 5,  maxScore: 5,  requiresReview: false },
      { questionId: "q5", type: "long_answer",            answered: true, correct: null,  score: null, maxScore: 10, requiresReview: true },
      { questionId: "q6", type: "numeric",                answered: true, correct: true,  score: 5,  maxScore: 5,  requiresReview: false }
    ],
    totalScore: 18, totalMax: 35,
    aggregate: { byCriterion: {
      knowledge_skill: { score: 15, max: 22 },
      thinking_judgment_expression: { score: 3, max: 13 }
    } }
  };
  const html = R.buildHtml(spec, plan, { graded: graded });

  見(/class="gwrap" data-graded="maru"/.test(html), "正解に 丸 が付く");
  見(/class="gwrap" data-graded="batsu"/.test(html), "不正解に バツ が付く");
  見(/class="gwrap" data-graded="sankaku"/.test(html), "部分点に 三角 が付く");
  見(/class="gwrap is-review" data-graded="review"/.test(html) && html.includes("確認待ち"),
     "採点できていない問題は 印を付けず「確認待ち」");

  const 丸 = (html.match(/class="gwrap" data-graded="maru"/g) || []).length;
  見(丸 === 3, "丸の数が正解の数と合う", "丸 " + 丸 + " / 正解 3");
  const 待 = (html.match(/class="gwrap is-review" data-graded="review"/g) || []).length;
  見(待 === 1, "確認待ちの数が合う", "確認待ち " + 待);

  見(html.includes("採点結果"), "合計の枠が出る");
  /* ★ 2026-09-03・訴え「素点は赤」で **素点 の 札**を 足したので、
     数の 直前に <span class="gsum-lb">素点</span> が 入る。
     見るのは「素点の 欄に 18 が 出ているか」。 */
  見(/gsum-total"[^>]*>(?:<span class="gsum-lb">素点<\/span>)?18/.test(html), "総合点が出る（18）");
  見(/gsum-lb">素点</.test(html), "★ 素点の 札が 付く");
  見(/gsum-total, \.gsum-k \{ color: #C0392B/.test(html) || /gsum-k/.test(html),
     "★ 知識・技能は 赤の 組（gsum-k）");
  見(/gsum-th/.test(html), "★ 思考・判断・表現は 青の 組（gsum-th）");
  見(html.includes("/ 35"), "満点が出る（35）");
  見(html.includes("知識・技能"), "観点「知識・技能」が出る");
  見(html.includes("思考・判断・表現"), "観点「思考・判断・表現」が出る");
  見(/確認待ちです/.test(html), "確認待ちがあることを合計の下に断っている");

  /* 採点していないときは 何も足さない（前と同じ紙面） */
  const 素 = R.buildHtml(spec, plan, {});
  /* CSS の 中にも data-graded は 出るので、**要素だけ**を 見る。 */
  見(!/class="gwrap[^"]*" data-graded=/.test(素) && !素.includes("採点結果"),
     "採点していなければ 印も合計も出ない");
  見(素.length < html.length, "採点済みのほうが中身が多い");
}

/* ══ 段⑤ 観点が自動で割り当てられている ══ */
節("段⑤ 観点の割り当て");
{
  const spec = 材料();
  const 全 = [].concat.apply([], spec.sections.map((s) => s.questions));
  const 付 = 全.filter((q) => Array.isArray(q.criterionAllocation) && q.criterionAllocation.length);
  見(付.length === 全.length, "全問に観点が付いている", 付.length + " / " + 全.length);
  const 記述 = 全.filter((q) => q.type === "long_answer")[0];
  const 思考 = (記述.criterionAllocation || []).filter((a) => a.criterionId === "thinking_judgment_expression")[0];
  見(思考 && 思考.points > 0, "記述は 思考・判断・表現 に配点が寄る",
     JSON.stringify(記述.criterionAllocation));
  const 選択 = 全.filter((q) => q.type === "multiple_choice_single")[0];
  const 知識 = (選択.criterionAllocation || []).filter((a) => a.criterionId === "knowledge_skill")[0];
  見(知識 && 知識.points === 選択.points, "選択は 知識・技能 に寄る",
     JSON.stringify(選択.criterionAllocation));
  /* 合計が 配点と 合う */
  const 和 = 全.reduce((a, q) => a + (q.criterionAllocation || []).reduce((b, x) => b + x.points, 0), 0);
  const 満 = 全.reduce((a, q) => a + q.points, 0);
  見(和 === 満, "観点の合計が満点と一致する", 和 + " / " + 満);
}

console.log("\n────────────────────────────");
console.log("通った: " + 済 + " / 落ちた: " + 落);
if (落ち.length) console.log("落ちたもの:\n  - " + 落ち.join("\n  - "));
process.exit(落 ? 1 : 0);
