/* ══════════════════════════════════════════════════════════════════════════
   vqcover2.cjs — **表紙の 情報量**と **受験の 始めかた**と **記入の 同期**

   訴え（2026-08-30・Rinty さん）
     「表紙も 今のままでは 情報が 少ないから、2 枚目くらい 量を 入れて欲しい」
     「最初 開いたら、表紙に 年組番氏名、受験番号が ある場合には それを
       右の 解答欄に 用意して、それを 記入した後に、下に 開始ボタン。
       それを 押したら、試験が スタートし、1 枚目は 表示したまま、
       新たに その後の 問題が 最初から 最後まで 表示するように しよう」
     「表紙に 入力した情報は、全て 最後に 紙面の方の 問題用紙、解答用紙に
       同期させ 印字する」

   見るのは:
     ① 表紙が 実物なみの 量に なる（注意事項 6 項目・マークの 例・不正行為）
     ② 開始の 前は **表紙だけ**（中は 見せない）
     ③ 開始の あとは 表紙 ＋ 問題が 最初から 最後まで
     ④ 書いた ことが 表紙・問題用紙・解答用紙（マークシート含む）へ 入る
     ⑤ 受験番号は マークシートの 丸が **塗られる**

   使い方: node vqcover2.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const { 器 } = require("./_h.cjs");
const root = 器();
const VQ2 = root.VQ2, MC = VQ2.mockCompiler, L = VQ2.layout, R = VQ2.pdfRenderer, AG = VQ2.aigen;

let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + String(追).slice(0, 200) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + String(追).slice(0, 320) : "")); }
};
const 本体 = (h) => String(h).replace(/<style[\s\S]*?<\/style>/g, "").replace(/<script[\s\S]*?<\/script>/g, "");

function 試験(答型) {
  const p = MC.plan({ title: "模試", subject: "情報", durationMinutes: 60, totalPoints: 40,
    sectionCount: 2, questionCount: 4, types: { multiple_choice_single: true },
    difficulty: "mixed", allowExternalKnowledge: true, requireSources: false });
  const qs = p.sections.reduce((a, s) => a.concat(s.questions), []);
  const filled = {};
  qs.forEach((q, i) => {
    filled[q.id] = AG.toClientShape({ id: "x" + i, type: "single_choice",
      question: "最も 適当な ものを 選べ。" + i, choices: ["あ", "い", "う", "え"],
      answer: "あ", explanation: "①正解。" }, i);
  });
  const sp = MC.assemble(p, filled, {}).spec;
  sp.layout = { layoutMode: "common-test", answerSheetMode: 答型 || "current", outputEngine: "current" };
  sp.cover = { examName: "令和8年度 第1回 模試", subject: "情報", subjectDetail: "情報Ⅰ",
    paperNumber: "①", pageCount: 12, bookletCode: "(2102—1)",
    studentFields: ["年", "組", "番", "氏名"] };
  return sp;
}
const 受 = { "年": "2", "組": "A", "番": "7", "氏名": "松代 倫", "受験番号": "12345678" };

節("① 表紙が 実物なみの 量に なる");
{
  const sp = 試験();
  const plan = L.buildPlan(sp);
  const q = (plan.booklets || []).filter((x) => x.kind === "question")[0];
  const h = 本体(String(R.buildHtml(sp, plan, { bookletId: q.id, coverOnly: true })));
  見(/class="sheet ct-cover"/.test(h), "共通テストの 表紙で 出る");
  見(/ct-seal/.test(h) && h.indexOf("試験開始の指示があるまで") >= 0, "★ 開封を 止める 枠");
  const 項 = (h.match(/<li>/g) || []).length;
  見(項 >= 8, "★ 注意事項が 実物なみの 量（子項目こみ）", 項 + " 項目");
  見(h.indexOf("12ページあります") >= 0, "★ 冊子の ページ数が 入る");
  見(h.indexOf("不正行為") >= 0 && /ct-ol2/.test(h), "★「不正行為について」に 子項目 ①②③");
  見(/ct-mk/.test(h), "★ マークの 例の 表が ある");
  見(/ct-mk-r[\s\S]{0,400}?is-on/.test(h), "★ 例では 1 つだけ 塗ってある");
  見(h.indexOf("持ち帰りなさい") >= 0, "最後の 項目まで 出る");
  見(/ct-pts/.test(h), "満点と 時間の 枠");
  見(/ct-code/.test(h), "冊子の 記号（右下）");
}

節("② 開始の 前は 表紙だけ");
{
  const sp = 試験();
  const plan = L.buildPlan(sp);
  const q = (plan.booklets || []).filter((x) => x.kind === "question")[0];
  const 前 = 本体(String(R.buildHtml(sp, plan, { bookletId: q.id, coverOnly: true })));
  const 後 = 本体(String(R.buildHtml(sp, plan, { bookletId: q.id })));
  見(/ct-cover/.test(前), "表紙は 出る");
  見((前.match(/class="sec-no"/g) || []).length === 0, "★ 第n問は まだ 出さない",
     (前.match(/class="sec-no"/g) || []).length);
  見(前.indexOf("最も 適当な ものを 選べ。") < 0, "★ 設問の 中身も 出さない");
  見(/ct-cover/.test(後) && (後.match(/class="sec-no"/g) || []).length >= 2,
     "★ 開始の あとは 表紙 ＋ 問題が 続く",
     "第n問 " + (後.match(/class="sec-no"/g) || []).length + " 個");
  見(後.indexOf("最も 適当な ものを 選べ。") >= 0, "★ 最初から 最後まで 出る");
}

節("③ 書いた ことが 表紙へ 入る");
{
  const sp = 試験();
  const plan = L.buildPlan(sp);
  const q = (plan.booklets || []).filter((x) => x.kind === "question")[0];
  const h = 本体(String(R.buildHtml(sp, plan, { bookletId: q.id, coverOnly: true, examinee: 受 })));
  見(/ct-fv">松代 倫</.test(h), "★ 氏名");
  見(/ct-fv">12345678</.test(h), "★ 受験番号");
  見(/ct-fv">2</.test(h) && /ct-fv">A</.test(h), "★ 年・組");
  /* 書いていない ときは 空の 欄の まま。 */
  const h2 = 本体(String(R.buildHtml(sp, plan, { bookletId: q.id, coverOnly: true })));
  見(!/ct-fv/.test(h2), "★ 書いていなければ 空の 欄（作り話を 書かない）");
}

節("④ 解答用紙（マークシート）へ 同期");
{
  const sp = 試験("common-test-mark");
  const plan = L.buildPlan(sp);
  const a = (plan.booklets || []).filter((x) => x.kind === "answer-sheet")[0];
  const h = 本体(String(R.buildHtml(sp, plan, { bookletId: a.id, examinee: 受 })));
  見(/class="ms"/.test(h), "マークシートで 出る");
  見(/ms-nv">松代 倫</.test(h), "★ 氏名が 入る");
  見(/ms-nz">2年 A組 7番</.test(h), "★ 年組番も 入る", (h.match(/ms-nz">[^<]*/g) || []).join(""));
  const 頭 = (h.match(/ms-exh">[^<]*/g) || []).map((x) => x.replace(/.*>/, "")).join("");
  見(頭 === "12345678", "★ 受験番号が 桁ごとに 入る", 頭);
  const 塗 = (h.match(/ms-o is-on/g) || []).length;
  見(塗 === 8, "★ 受験番号の 丸が 8 桁ぶん 塗られる", 塗 + " 個");
  /* 書いていない ときは 塗らない。 */
  const h2 = 本体(String(R.buildHtml(sp, plan, { bookletId: a.id })));
  見((h2.match(/ms-o is-on/g) || []).length === 0, "★ 書いていなければ 塗らない");
}

節("⑤ ほかの 型の 解答用紙・問題用紙へも 同期");
{
  /* 記入欄の ある 型を 探して、そこへ 入るかを 見る。
     欄の 無い 型（共通テストの 問題冊子など）は 実物にも 欄が 無いので 対象外。 */
  const 型ら = ["current", "grid-standard", "written-heavy", "school-answer-mark", "auto"];
  let 当 = null;
  型ら.forEach((m) => {
    if (当) return;
    const sp = 試験(m);
    delete sp.layout.layoutMode;               /* 問題用紙は 既定（氏名欄が 出る 型） */
    const plan = L.buildPlan(sp);
    (plan.booklets || []).forEach((b) => {
      if (当) return;
      const 素 = 本体(String(R.buildHtml(sp, plan, { bookletId: b.id })));
      if (/class="ags"/.test(素) || /name-box/.test(素)) 当 = { m: m, b: b, sp: sp, plan: plan };
    });
  });
  見(!!当, "記入欄の ある 型が ある", 当 ? 当.m + " / " + 当.b.kind : "無い");
  if (当) {
    const h = 本体(String(R.buildHtml(当.sp, 当.plan, { bookletId: 当.b.id, examinee: 受 })));
    const 出 = (h.match(/ags-v">[^<]*/g) || []).concat(h.match(/nb-v">[^<]*/g) || []);
    見(出.length >= 1, "★ 書いた ことが 入る", 出.join(" / "));
    const h2 = 本体(String(R.buildHtml(当.sp, 当.plan, { bookletId: 当.b.id })));
    見(!/ags-v|nb-v/.test(h2), "★ 書いていなければ 空の 欄");
  }
}

console.log("\n────────────────────────────────");
console.log("通った: " + 済 + " / 落ちた: " + 落);
if (落ち.length) console.log("落ちたもの:\n  - " + 落ち.join("\n  - "));
process.exit(落 ? 1 : 0);
