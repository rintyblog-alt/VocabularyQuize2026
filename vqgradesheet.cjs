/* ══════════════════════════════════════════════════════════════════════════
   vqgradesheet.cjs — **どの 解答用紙でも 採点の 印が 出るか**を 測る

   訴え（2026-08-30・Rinty さん）
     「解答用紙で Lumi が マーク式とかだと 採点してくれていない。
       だから 全ての 形式で しっかりと 採点してもらえるようにしたい」

   分かっていた こと（直す前）:
     解答用紙の 描きかたは **3 通り**ある。
       ① answer-area（既定）      … 印あり
       ② 罫線マス（agb / gridCell） … 印あり
       ③ 罫線の 表（agt / GridSection）… **印なし**
       ④ 共通テストの マークシート    … **印なし**
     ③④ を 選んだ 試験は、採点が 済んでいても 紙に 何も 出なかった。

   見るのは:
     ① どの 型の 解答用紙でも 印（丸・バツ・三角）が 出る
     ② マークシートは 行ごとに 印が 付く（塗った 丸は 隠さない）
     ③ 複数選択・正誤・数値も 塗られる
     ④ 採点できていない 問題には 印を 付けない（確認待ち）
     ⑤ 知らない 形式を 黙って 0 点に しない

   使い方: node vqgradesheet.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const { 器 } = require("./_h.cjs");
const root = 器();
const VQ2 = root.VQ2, MC = VQ2.mockCompiler, L = VQ2.layout, R = VQ2.pdfRenderer,
      G = VQ2.grading, LP = VQ2.layoutProfiles;

let 済 = 0, 落 = 0;
const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + String(追).slice(0, 220) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + String(追).slice(0, 400) : "")); }
};

function 試験(o) {
  o = o || {};
  const types = o.types || { multiple_choice_single: true, short_answer: true };
  const p = MC.plan({ title: "期末考査", subject: "日本史探究", durationMinutes: 50,
    totalPoints: 60, sectionCount: 2, questionCount: o.n || 6,
    types: types, difficulty: "mixed", allowExternalKnowledge: true, requireSources: false });
  const filled = {};
  p.sections.forEach((s) => s.questions.forEach((q) => {
    if (q.type === "multiple_choice_single" || q.type === "true_false") {
      filled[q.id] = { question: "問" + q.number + "　正しいものを一つ選べ。", type: q.type,
        answer: "大化の改新", explanation: "かい",
        choices: q.type === "true_false"
          ? [{ text: "正しい" }, { text: "誤り" }]
          : [{ text: "大化の改新" }, { text: "応仁の乱" }, { text: "承久の変" }, { text: "壬申の乱" }] };
    } else if (q.type === "multiple_choice_multiple") {
      filled[q.id] = { question: "問" + q.number + "　正しいものを すべて 選べ。", type: q.type,
        answer: ["ア", "ウ"], explanation: "かい",
        choices: [{ text: "ア" }, { text: "イ" }, { text: "ウ" }, { text: "エ" }] };
    } else if (q.type === "numeric") {
      filled[q.id] = { question: "問" + q.number + "　数で答えよ。", type: q.type,
        answer: "7", explanation: "かい" };
    } else {
      filled[q.id] = { question: "問" + q.number + "　四十字以内で答えよ。", type: q.type,
        answer: "こたえ" + q.number, explanation: "かい" };
    }
  }));
  const spec = MC.assemble(p, filled, {}).spec;
  spec.id = "gs-" + Math.random().toString(36).slice(2, 8);
  spec.cover = { examName: "期末考査", subject: "日本史探究" };
  if (o.layout) spec.layout = o.layout;
  return spec;
}
const 全問 = (sp) => sp.sections.reduce((a, s) => a.concat(s.questions), []);

/* 半分 当てて 半分 外す。丸と バツの 両方を 出させる。 */
function 解く(spec) {
  return 全問(spec).map((q, i) => {
    const cs = q.choices || [];
    if (cs.length) {
      const 正 = cs.filter((c) => c.isCorrect).map((c) => c.id);
      if (q.type === "multiple_choice_multiple") {
        return { questionId: q.id, value: i % 2 === 0 ? 正 : [cs[0].id], timeMs: 900 };
      }
      const 誤 = cs.filter((c) => !c.isCorrect)[0];
      return { questionId: q.id, value: i % 2 === 0 ? (正[0] || cs[0].id) : (誤 ? 誤.id : cs[0].id), timeMs: 900 };
    }
    const 正答 = q.correctAnswer || (q.acceptedAnswers || [])[0] || "";
    return { questionId: q.id, value: i % 2 === 0 ? String(正答) : "ちがう答え", timeMs: 2000 };
  });
}
function 結果(spec, ans) {
  const g = G.gradeSession(全問(spec), ans);
  return { g, result: { id: "r1", kind: "mock", mockId: spec.id, presetId: spec.id,
    items: g.items, score: g.deterministicScore, maxScore: g.totalMax,
    finishedAt: new Date().toISOString() } };
}
function 紙(spec, result) {
  const plan = L.buildPlan(spec);
  const b = (plan.booklets || []).filter((x) => x.kind === "answer-sheet")[0];
  if (!b) return "";
  return String(R.buildHtml(spec, plan, { bookletId: b.id, graded: R.gradedOf(result) }));
}
/* style タグを 除いた 本体だけを 見る（CSS の 文字に 当たらないように）。 */
const 本体 = (h) => String(h).replace(/<style[\s\S]*?<\/style>/g, "");

/* ══ ① どの 型でも 印が 出る ══════════════════════════════════ */
節("① どの 解答用紙の 型でも 採点の 印が 出る");
{
  const 型 = (LP.ANSWER_SHEET_MODES || []).filter((m) => m.ready);
  見(型.length >= 5, "使える 解答用紙の 型", 型.length + " 種類");
  型.forEach((m) => {
    const spec = 試験({ layout: { layoutMode: "current", answerSheetMode: m.id, outputEngine: "current" } });
    const { result } = 結果(spec, 解く(spec));
    const h = 本体(紙(spec, result));
    const 丸 = (h.match(/data-graded="maru"/g) || []).length;
    const バツ = (h.match(/data-graded="batsu"/g) || []).length;
    const 三 = (h.match(/data-graded="sankaku"/g) || []).length;
    const 確 = (h.match(/data-graded="review"/g) || []).length;
    見(丸 + バツ + 三 + 確 >= 1, "★ " + m.id + " に 印が 出る",
       "丸" + 丸 + " バツ" + バツ + " 三角" + 三 + " 確認" + 確);
  });
}

/* ══ ② マークシート ══════════════════════════════════════════ */
節("② マークシートは 行ごとに 印が 付く");
{
  const spec = 試験({ layout: { layoutMode: "common-test",
    answerSheetMode: "common-test-mark", outputEngine: "current" } });
  const { result, g } = 結果(spec, 解く(spec));
  const h = 紙(spec, result);
  const b = 本体(h);
  見(/class="ms"/.test(b), "マークシートで 出ている");
  const 印 = (b.match(/class="ms-g" data-graded="/g) || []).length;
  const 採れた = g.items.filter((x) => x.score !== null && x.score !== undefined).length;
  見(印 === 採れた, "★ 採点できた 問題の 数だけ 印が 付く", "印 " + 印 + " / 採点 " + 採れた);
  見(/<span class="ms-gh">採点<\/span>/.test(b), "★ 見出しに「採点」の 列が 出る");
  /* 塗った 丸は 隠れていない（印は 別の 列）。 */
  const 塗 = (b.match(/<i class="is-on">/g) || []).length;
  見(塗 >= 1, "塗った 丸は そのまま 残る", 塗 + " 個");
  見(/\.ms-g \{ flex: 0 0 6mm/.test(h), "採点の 列は 6mm（A4 横に 収まる）");
  /* 採点していない 紙（printAnsweredSheet 相当）には 列を 出さない。 */
  const plan = L.buildPlan(spec);
  const bk = (plan.booklets || []).filter((x) => x.kind === "answer-sheet")[0];
  const 素 = 本体(String(R.buildHtml(spec, plan, { bookletId: bk.id })));
  見(!/ms-gh/.test(素), "★ 白紙の ときは 採点の 列を 出さない");
}

/* ══ ③ 複数選択・正誤・数値も 塗られる ═══════════════════════ */
節("③ 記号を 塗る のは 4 択 だけでは ない");
{
  const spec = 試験({ n: 8, types: { multiple_choice_single: true, multiple_choice_multiple: true,
    true_false: true, numeric: true },
    layout: { layoutMode: "common-test", answerSheetMode: "common-test-mark", outputEngine: "current" } });
  const qs = 全問(spec);
  const ans = qs.map((q) => {
    const cs = q.choices || [];
    if (q.type === "multiple_choice_multiple") return { questionId: q.id, value: [cs[0].id, cs[2].id] };
    if (cs.length) return { questionId: q.id, value: cs[1].id };
    return { questionId: q.id, value: "7" };
  });
  const { result } = 結果(spec, ans);
  const b = 本体(紙(spec, result));
  const 行 = b.match(/<span class="ms-m">(?:<i[^>]*>[^<]*<\/i>)+<\/span>/g) || [];
  const 塗の数 = 行.map((r) => (r.match(/is-on/g) || []).length);
  const 複数 = qs.filter((q) => q.type === "multiple_choice_multiple").length;
  見(qs.length >= 4, "何問か 出ている", qs.length);
  見(複数 >= 1, "複数選択が 入っている", 複数 + " 問");
  見(塗の数.filter((n) => n === 2).length >= 複数, "★ 複数選択は 2 つ 塗られる",
     JSON.stringify(塗の数.slice(0, 12)));
  const 数値 = qs.findIndex((q) => q.type === "numeric");
  見(数値 < 0 || 塗の数[数値] === 1, "★ 数値（7）も その 数字が 塗られる",
     数値 < 0 ? "数値なし" : 塗の数[数値]);
  /* 使う 行（問題の 数）だけを 見る。マークシートは 30 行 × 3 列 あり、
     余りの 行は 白紙の まま が 正しい。 */
  const 使う = 塗の数.slice(0, qs.length);
  見(使う.filter((n) => n === 0).length === 0, "★ 使う 行に 塗られない 行が ない",
     JSON.stringify(使う));
  見(塗の数.slice(qs.length).every((n) => n === 0), "★ 余りの 行は 白紙の まま",
     塗の数.length + " 行中 " + qs.length + " 行を 使う");
}

/* ══ ④ 採点できていない 問題 ═════════════════════════════════ */
節("④ 採点できていない 問題には 印を 付けない");
{
  const spec = 試験({ types: { multiple_choice_single: true, long_answer: true } });
  const { result, g } = 結果(spec, 解く(spec));
  const 保留 = g.items.filter((x) => x.score === null).length;
  見(保留 >= 1, "記述は 未採点で 返る", 保留 + " 問");
  const b = 本体(紙(spec, result));
  const 確 = (b.match(/data-graded="review"/g) || []).length;
  見(確 === 保留, "★ 未採点は「確認待ち」で 出る（勝手に 丸に しない）", 確 + " / " + 保留);
  見(!/data-graded="maru"[^]{0,200}確認待ち/.test(b), "丸と 確認待ちを 同じ 欄に 重ねない");
}

/* ══ ⑤ 知らない 形式を 0 点に しない ═════════════════════════ */
節("⑤ 知らない 形式を 黙って 0 点に しない");
{
  /* 分類（classification）は 旧採点の 名前を 持たない。
     これまでは 何を 答えても 0 点・バツ だった。 */
  const q = {
    id: "q-cls", type: "classification", points: 10,
    prompt: "次の 語を 分けよ。",
    classification: {
      groups: [{ id: "g1", label: "近代" }, { id: "g2", label: "現代" }],
      items: [{ id: "i1", text: "明治維新", groupId: "g1" },
              { id: "i2", text: "高度経済成長", groupId: "g2" }]
    }
  };
  const 正 = G.gradeSession([q], [{ questionId: "q-cls", value: { items: { i1: "g1", i2: "g2" } } }]);
  const 誤 = G.gradeSession([q], [{ questionId: "q-cls", value: { items: { i1: "g2", i2: "g1" } } }]);
  const 正品 = 正.items[0], 誤品 = 誤.items[0];
  見(正品.score !== 0 || 正品.score === null, "★ 合っているのに 0 点で 確定しない",
     "score=" + 正品.score + " method=" + 正品.method);
  見(正品.score === 10 || 正品.score === null, "★ 全部 合っていれば 満点（か 保留）",
     "score=" + 正品.score);
  見(誤品.score === 0 || 誤品.score === null, "外していれば 0 点（か 保留）", "score=" + 誤品.score);
  見(正品.method !== "not-deterministic" || 正品.score === null,
     "★ 0 点で 確定する『採点できません』が 消えた", 正品.method);
  /* 本当に 何も 知らない 形式は **保留**（0 点に しない）。 */
  const 未 = G.gradeSession([{ id: "q-x", type: "まったく知らない形式", points: 5 }],
                            [{ questionId: "q-x", value: "なにか" }]);
  見(未.items[0].score === null, "★ 知らない 形式は 未採点（0 点に しない）", 未.items[0].score);
  見(未.pendingCount === 1, "未採点として 数える", 未.pendingCount);
}

console.log("\n────────────────────────────────");
console.log("通った: " + 済 + " / 落ちた: " + 落);
if (落ち.length) console.log("落ちたもの:\n  - " + 落ち.join("\n  - "));
process.exit(落 ? 1 : 0);
