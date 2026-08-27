/* ══════════════════════════════════════════════════════════════════════
   中身の検算（点検）の読み取り

   点検は **落とす側**なので、読み違えると正しい問題まで消える。
   いちばん怖いのは「読めなかったのに×として扱う」こと。
   ここでは次を確かめる。

     ・返事が {"results":[…]} でも [ … ] でも読める（実測で両方来た）
     ・```json で包まれていても読める
     ・返事に無い問題は **通す**（黙って落とさない）
     ・読めない返事は **全部通す**（点検できないことで問題を減らさない）
     ・点検へ送る中身に、解説や内部 id を混ぜない（字数と時間のため）

   AI は呼ばない。純関数だけを取り出して確かめる。
   使い方: node vqreview.cjs
   ══════════════════════════════════════════════════════════════════════ */
const fs = require("fs");
const path = require("path");
const WORKER = fs.readFileSync(path.join(__dirname, "server", "src", "worker.js"), "utf8");

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => {
  c ? (pass++, console.log("  ok   " + n))
    : (fail++, bad.push(n), console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 200) : "")));
};
const section = (t) => console.log("\n══ " + t + " ══");

function load() {
  const s = WORKER.indexOf("/* 並べ替えの札に「言葉」が入っているか");
  const e = WORKER.indexOf("/* ══ 生成の本体 ══");
  if (s < 0 || e < 0 || e <= s) throw new Error("点検の部品が見つかりません");
  return new Function(WORKER.slice(s, e)
    + "\nreturn { rows: aigenReviewRows, map: aigenReviewMap, digest: aigenReviewDigest,"
    + "         lang: aigenWrongLanguage };")();
}
const R = load();
const LIST = [{ type: "single_choice", question: "問1" }, { type: "single_choice", question: "問2" },
               { type: "single_choice", question: "問3" }];

section("返事の読み取り");
ok("{\"results\":[…]} を読める",
  (R.rows('{"results":[{"i":0,"ok":true}]}') || []).length === 1);
ok("★配列だけで返っても読める（実測: Gemini）",
  (R.rows('[{"i":0,"ok":true},{"i":1,"ok":false,"why":"答えが違う"}]') || []).length === 2);
ok("```json で包まれていても読める",
  (R.rows('```json\n{"results":[{"i":0,"ok":false,"why":"x"}]}\n```') || []).length === 1);
ok("前置きが付いていても中身を取り出せる",
  (R.rows('点検しました。\n{"results":[{"i":2,"ok":true}]}') || []).length === 1);
ok("★読めない返事は null（＝点検できなかった）", R.rows("すみません、判定できません") === null);
ok("空でも落ちない", R.rows("") === null && R.rows(null) === null);

section("判定の割り当て");
{
  const v = R.map(LIST, [{ i: 0, ok: false, why: "答えが違う" }, { i: 1, ok: true }], 0);
  ok("×が付いた問題だけ ok:false", v[0].ok === false && v[1].ok === true, v);
  ok("理由が残る", v[0].why === "答えが違う", v[0]);
  ok("★返事に無い問題は通す（黙って落とさない）", v[2].ok === true, v[2]);
}
{
  /* 途中の束は i が 10 から始まる。ずれると別の問題を落としてしまう。 */
  const v = R.map(LIST, [{ i: 11, ok: false, why: "意味が通らない" }], 10);
  ok("★束の途中でも番号がずれない", v[0].ok === true && v[1].ok === false && v[2].ok === true,
    v.map((x) => x.ok));
}
{
  const v = R.map(LIST, [], 0);
  ok("★空の返事なら全部通す", v.every((x) => x.ok === true), v);
}
{
  /* ok が書かれていない・文字で来た、は **×にしない**（迷ったら通す）。 */
  const v = R.map(LIST, [{ i: 0 }, { i: 1, ok: "false" }, { i: 2, ok: null }], 0);
  ok("★はっきり false のときだけ落とす", v.every((x) => x.ok === true), v);
}

section("点検へ送る中身");
{
  const d = R.digest({
    type: "single_choice", id: "single_choice-3",
    question: "次のうち正しいものはどれか。", choices: ["ア", "イ", "ウ", "エ"],
    answer: "ア", explanation: "アが正しい理由はこうこうこういう理由です。"
  }, 5);
  ok("番号が付く", d.i === 5, d.i);
  ok("問題文・選択肢・答えを送る", !!d.問題文 && (d.選択肢 || []).length === 4 && d.答え === "ア", d);
  ok("★解説は送らない（字数と時間のため）", !("explanation" in d) && !("解説" in d), Object.keys(d));
  ok("★内部 id は送らない", !("id" in d), Object.keys(d));
}
{
  const d = R.digest({ type: "classification", question: "分けなさい。", groups: ["A", "B"],
    items: ["あ", "い"], answer: { A: ["あ"], B: ["い"] } }, 0);
  ok("分類は群と項目と割り当てを送る",
    (d.群 || []).length === 2 && (d.項目 || []).length === 2 && d.答え && d.答え.A, d);
}
{
  const d = R.digest({ type: "matching", question: "結びなさい。", left: ["侍所"], right: ["軍事"],
    answer: [["侍所", "軍事"]] }, 0);
  ok("対応づけは左右と答えを送る", (d.左 || []).length === 1 && (d.右 || []).length === 1, d);
}

section("頼んでいない言語で作らない");
{
  /* 実測 2026-08-12: 保健のプリセット 30 問に、英語の誤文訂正が 2 問混ざった。 */
  const 保健 = "保健から30問。難しめで、解説つき。誤文訂正を2問。";
  ok("★日本語の依頼に英語の問題は落とす",
    R.lang(保健, "The newly discovered pathogen has weak resistance against drugs.") === true);
  ok("日本語の問題は通る", R.lang(保健, "感染症の予防で最も大切なことは何か。") === false);
  /* 用語だけ英語はふつうにある。落としてはいけない。 */
  ok("★用語だけ英語なら通る（AIDS・DNA など）",
    R.lang(保健, "AIDS の原因となる病原体は何か。") === false);
  ok("英単語 2 語までなら通る（見出しや略語）", R.lang(保健, "DNA polymerase とは。") === false);

  const 英語 = "高2の英語から、誤文訂正を5問。";
  ok("★英語の依頼なら英語の問題は通る",
    R.lang(英語, "He go to school every day.") === false);
  ["英作文を3問", "スペルを5問", "リスニングを3問", "和訳を2問"].forEach((a) => {
    ok("「" + a + "」でも英語を通す", R.lang("保健から10問。" + a, "He go to school.") === false);
  });
  ok("依頼が英語なら何も見ない（判定しない）",
    R.lang("Make 10 questions about biology.", "What is DNA?") === false);
  ok("依頼が空でも落ちない", R.lang("", "He go to school.") === false && R.lang(null, null) === false);
}

console.log("\n合格 " + pass + " / 不合格 " + fail);
if (bad.length) console.log("直すところ:\n  - " + bad.join("\n  - "));
process.exit(fail ? 1 : 0);
