/* ══════════════════════════════════════════════════════════════════════════
   vqvariety.cjs — **毎回 同じ 出題傾向に ならないか**／点は 整数か／
                   語句整序を 勝手に 作らないか

   訴え（2026-08-30・Rinty さん）
     「毎回 おんなじ 出題傾向に なってる 気がするから、
       ちゃんと 均等に ランダムに 慎重に AI が 振り分けるようにしてほしい」
     「小数点は 切り捨てて、四捨五入して 素点、観点別点数を 出してほしい」
     「意味の通る文にして ってやつ 無くして。文章を 完成させるだけの
       並び替え問題。。コレ まじで いらない。ユーザーの 指示が ない限りは」

   真因（形式の 偏り）:
     枠を 作る ところが types[ti % types.length] の **単純な 巡回**で、
     しかも types は 決まった 順に 並べ直してあった。
     だから 何度 作っても 問1 は 正誤、問2 は 4択…と 同じに なる。

   使い方: node vqvariety.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const { 器 } = require("./_h.cjs");
const root = 器();
const VQ2 = root.VQ2, MC = VQ2.mockCompiler, G = VQ2.grading;

let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + String(追).slice(0, 220) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + String(追).slice(0, 340) : "")); }
};
const 型 = { multiple_choice_single: true, fill_blank: true, short_answer: true,
             long_answer: true, source_analysis: true, ordering: true, matching: true };
function 枠(seed, n) {
  const p = MC.plan({ seed: seed, title: "t", subject: "情報", durationMinutes: 60,
    totalPoints: 100, sectionCount: 5, questionCount: n || 21, types: 型,
    difficulty: "mixed", allowExternalKnowledge: true, requireSources: false });
  const qs = p.sections.reduce((a, s) => a.concat(s.questions), []);
  const c = {}; qs.forEach((q) => { c[q.type] = (c[q.type] || 0) + 1; });
  return { 並: qs.map((q) => q.type).join(","), 内訳: c, 問: qs, 大問: p.sections };
}

節("① 毎回 ちがう 並びに なる");
{
  const 並ら = [];
  for (let i = 0; i < 8; i++) 並ら.push(枠("種" + i).並);
  const 別 = new Set(並ら).size;
  見(別 >= 7, "★ 8 回 作って ほぼ 全部 ちがう 並び", 別 + " 通り / 8 回");
  /* 種を 渡さない ときも 毎回 変わる。 */
  const 無1 = 枠(undefined).並, 無2 = 枠(undefined).並;
  見(無1 !== 無2, "★ 種を 渡さなければ 毎回 変わる");
}

節("② 同じ 種なら 作り直せる");
{
  見(枠("同じ").並 === 枠("同じ").並, "★ 種が 同じなら 同じ 並び（作り直しで 形が 変わらない）");
}

節("③ 形式が 均等に 配られる");
{
  const a = 枠("均等の たしかめ");
  const 値 = Object.values(a.内訳);
  見(Object.keys(a.内訳).length === 7, "★ 選んだ 7 形式が 全部 出る", Object.keys(a.内訳).join(","));
  見(Math.max(...値) - Math.min(...値) <= 1, "★ いちばん 多い 形式と 少ない 形式の 差が 1 以内",
     JSON.stringify(a.内訳));
  /* 数が 割り切れない ときも 差は 1 まで。 */
  const b = 枠("わりきれない", 20);
  const 値b = Object.values(b.内訳);
  見(Math.max(...値b) - Math.min(...値b) <= 1, "★ 20 問（割り切れない）でも 差は 1 以内",
     JSON.stringify(b.内訳));
}

節("④ 記述は 大問の 後ろへ 寄る");
{
  const a = 枠("記述の 位置");
  let 前 = 0, 後 = 0;
  a.大問.forEach((sec) => {
    const qs = sec.questions || [];
    qs.forEach((q, i) => {
      if (["long_answer", "essay", "english_writing", "source_analysis"].indexOf(q.type) < 0) return;
      if (i < qs.length / 2) 前++; else 後++;
    });
  });
  見(後 >= 前, "★ 記述・論述は 大問の 後半に 多い（前半 " + 前 + " / 後半 " + 後 + "）",
     "前 " + 前 + " ／ 後 " + 後);
}

節("⑤ 点は 整数（素点・観点別）");
{
  /* 部分点が 出る 形。3 分の 1 だけ 合っている ときは 3.33 に なりがち。 */
  const q1 = { id: "a", type: "multiple_choice_multiple", points: 10,
    choices: [{ id: "c1", text: "あ", isCorrect: true }, { id: "c2", text: "い", isCorrect: true },
              { id: "c3", text: "う", isCorrect: true }, { id: "c4", text: "え" }],
    criterionAllocation: [{ criterionId: "knowledge_skill", points: 10 }] };
  const q2 = { id: "b", type: "fill_blank", points: 10,
    blanks: [{ answer: "あ" }, { answer: "い" }, { answer: "う" }],
    criterionAllocation: [{ criterionId: "thinking_judgment_expression", points: 10 }] };
  const g = G.gradeSession([q1, q2], [
    { questionId: "a", value: ["c1"] }, { questionId: "b", value: ["あ", "x", "x"] }]);
  const 整数 = (v) => typeof v === "number" && Math.floor(v) === v;
  見(g.items.every((i) => 整数(i.score)), "★ 1 問ごとの 点が 整数",
     g.items.map((i) => i.score).join(" / "));
  見(整数(g.deterministicScore), "★ 素点（合計）も 整数", g.deterministicScore);
  const ag = G.aggregate([q1, q2], g.items);
  見(整数(ag.total.score), "★ 集計の 点も 整数", ag.total.score);
  const 観 = ag.byCriterion || {};
  const 観値 = Object.keys(観).map((k) => 観[k].score);
  見(観値.every(整数), "★ 観点別の 点も 整数",
     Object.keys(観).map((k) => 観[k].label + " " + 観[k].score + "/" + 観[k].max).join(" ／ "));
  見(!/\./.test(String(g.items[0].score)), "3.33 のような 数が 出ない", g.items[0].score);
}

節("⑥ 語句整序は 頼まれた ときだけ");
{
  const fs = require("fs");
  const w = fs.readFileSync("server/src/worker.js", "utf8");
  const m = fs.readFileSync("js-src/vq-make.js", "utf8");
  見(/「次の語句を並べ替えて意味の通る文にしなさい」は 作らないでください/.test(w),
     "★ AI に「意味の通る文にしなさい」を 作るなと 言っている");
  見(/頼まれたとき/.test(w) && /語句整序/.test(w), "★ 頼まれた ときだけ 作る と 断ってある");
  見(/何の順かを 必ず 書く/.test(w), "★ 並べ替えは「何の順か」を 書かせる");
  見(/文を 組み立てるだけの 並べ替えは 作らないでください/.test(m),
     "★ 試験づくりの 依頼文でも 止めている");
  見(/語句整序\|語順\|並べ替えて\.\*文\|英作文/.test(m) || /語句整序/.test(m),
     "★ ただし 指示が あれば 出す（言葉で 見分ける）");
}

console.log("\n────────────────────────────────");
console.log("通った: " + 済 + " / 落ちた: " + 落);
if (落ち.length) console.log("落ちたもの:\n  - " + 落ち.join("\n  - "));
process.exit(落 ? 1 : 0);
