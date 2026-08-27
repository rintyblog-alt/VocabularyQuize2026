/* ══════════════════════════════════════════════════════════════════════
   空欄の型（穴埋め）

   空欄の書き方は **【1】【2】… のひとつだけ**。番号は 1 から順。
   番号があるので、空欄が 2 つ以上でもどれがどの答えか分かる。
   **空欄が 1 つのときも同じ仕組み**（【1】＋ 1 件の配列）。

   これまでは ____ ／（　）／【　】／〇〇 が混ざり、画面に【　　】と出ていた
   （実測 2026-08-12）。どこがどの答えか分からず、直しようがなかった。

   ここで見るのは 3 つ。
     ・どの書き方で来ても【1】【2】…へそろう（中身は変えない）
     ・答えが空欄と同じ数の配列になる
     ・番号が飛んでいる／数が合わないものは落とす（作り直させる）

   AI は呼ばない。使い方: node vqblank.cjs
   ══════════════════════════════════════════════════════════════════════ */
const fs = require("fs");
const path = require("path");
const WORKER = fs.readFileSync(path.join(__dirname, "server", "src", "worker.js"), "utf8");
const INDEX = require("./vqsrc.cjs").丸ごと();

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => {
  c ? (pass++, console.log("  ok   " + n))
    : (fail++, bad.push(n), console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 220) : "")));
};
const section = (t) => console.log("\n══ " + t + " ══");

function load() {
  const s = WORKER.indexOf("/* ══ 空欄の型は 1 つだけ ══");
  const e = WORKER.indexOf("function aigenQualityIssue");
  if (s < 0 || e < 0 || e <= s) throw new Error("空欄の部品が見つかりません");
  return new Function(WORKER.slice(s, e)
    + "\nreturn { E: AIGEN_ENGINES, coerce: aigenCoerceQuestion,"
    + "         nums: aigenBlankNums, norm: aigenBlankNormalize };")();
}
const S = load();
const fb = S.E.fill_blank;
const run = (q) => { S.coerce(q, "fill_blank"); return { q, why: fb.validate(q) }; };

section("どの書き方で来ても【1】【2】…へそろう");
[
  ["下線", "初代内閣総理大臣は ____ である。", "初代内閣総理大臣は 【1】 である。"],
  ["全角下線", "初代は ＿＿＿＿ である。", "初代は 【1】 である。"],
  ["丸かっこ", "初代は（　）で、次は（　）である。", "初代は【1】で、次は【2】である。"],
  ["半角かっこ", "A は ( ) である。", "A は 【1】 である。"],
  ["すみつき（空）", "A は【　】である。", "A は【1】である。"],
  ["角かっこ", "A は [ ] である。", "A は 【1】 である。"],
  ["〇〇", "A は〇〇である。", "A は【1】である。"],
  ["番号つきを番号つきへ", "A は【1】で B は【2】。", "A は【1】で B は【2】。"],
  ["番号が飛んでいても振り直す", "A は【3】で B は【7】。", "A は【1】で B は【2】。"]
].forEach(([name, from, to]) => {
  ok(name + " → " + to, S.norm(from) === to, { 直した: S.norm(from), 期待: to });
});
ok("★中身のあるかっこは触らない", S.norm("A（例）は ____ である。") === "A（例）は 【1】 である。",
  S.norm("A（例）は ____ である。"));
ok("空欄の番号を読み取れる", JSON.stringify(S.nums("A【1】B【2】C【3】")) === "[1,2,3]", S.nums("A【1】B【2】C【3】"));

section("受け取り（1 つの空欄も同じ仕組み）");
{
  const r = run({ type: "fill_blank", question: "日本の初代内閣総理大臣は ____ である。",
    answer: "伊藤博文", explanation: "初代内閣総理大臣は伊藤博文である。長州藩の出身で、憲法づくりにも関わった。" });
  ok("★空欄 1 つでも【1】になる", r.q.question.indexOf("【1】") >= 0, r.q.question);
  ok("★答えも 1 件の配列になる", Array.isArray(r.q.answer) && r.q.answer.length === 1, r.q.answer);
  ok("検査を通る", r.why === null, r.why);
}
{
  const r = run({ type: "fill_blank", question: "初代は（　）で、その次は（　）である。",
    answer: ["伊藤博文", "黒田清隆"], explanation: "初代は伊藤博文、二代目は黒田清隆である。順に覚えておくとよい。" });
  ok("★空欄 2 つが【1】【2】になる",
    r.q.question === "初代は【1】で、その次は【2】である。", r.q.question);
  ok("答えが 2 件のまま", Array.isArray(r.q.answer) && r.q.answer.length === 2, r.q.answer);
  ok("検査を通る", r.why === null, r.why);
}
{
  /* 空欄が 2 つなのに答えが 1 本の文。区切った数が合うときだけ割り当てる。 */
  const r = run({ type: "fill_blank", question: "初代は（　）、次は（　）。",
    answer: "伊藤博文、黒田清隆", explanation: "初代は伊藤博文、二代目は黒田清隆である。順に覚えておくとよい。" });
  ok("★1 本にまとまった答えを、数が合うときだけ分ける",
    Array.isArray(r.q.answer) && r.q.answer.join("|") === "伊藤博文|黒田清隆", r.q.answer);
  ok("検査を通る", r.why === null, r.why);
}
{
  /* 数が合わないなら **触らない**。作り足さず、検査で落として作り直させる。 */
  const r = run({ type: "fill_blank", question: "A は（　）、B は（　）、C は（　）。",
    answer: "あ、い", explanation: "それぞれの語を当てはめる問題である。順に確かめること。" });
  ok("★数が合わないときは作り足さない", r.why === "answer の数が空欄の数と合わない", r.why);
}
{
  /* 空欄が無く、答えが文の中に出ている。そこを空欄にする。 */
  const r = run({ type: "fill_blank", question: "日本の初代内閣総理大臣は伊藤博文である。",
    answer: "伊藤博文", explanation: "初代内閣総理大臣は伊藤博文である。長州藩の出身で、憲法づくりにも関わった。" });
  ok("★空欄が無ければ、答えのところを空欄にする",
    r.q.question === "日本の初代内閣総理大臣は【1】である。", r.q.question);
  ok("検査を通る", r.why === null, r.why);
}

section("落とすもの");
ok("空欄が無ければ落ちる",
  fb.validate({ question: "初代内閣総理大臣はだれか。", answer: ["伊藤博文"] }) === "空欄（【1】）が無い");
ok("番号が 1 から順でなければ落ちる",
  fb.validate({ question: "A は【2】で B は【1】。", answer: ["あ", "い"] })
    === "空欄の番号が 1 から順になっていない");
ok("答えが配列でなければ落ちる",
  fb.validate({ question: "A は【1】。", answer: "あ" }) === "answer が空欄と同じ数の配列になっていない");
ok("空の答えがあれば落ちる",
  fb.validate({ question: "A は【1】で B は【2】。", answer: ["あ", ""] }) === "空の答えがある");
ok("選択肢が付いていれば落ちる",
  fb.validate({ question: "A は【1】。", answer: ["あ"], choices: ["あ", "い"] }) === "選択肢が付いている");

section("作り方の指示");
ok("★見本が【1】【2】になっている", /【1】/.test(fb.shape) && /【2】/.test(fb.shape), fb.shape.slice(0, 120));
ok("★見本の答えが配列", /"answer":\[/.test(fb.shape.replace(/\s/g, "")), fb.shape);
ok("番号は 1 から順、と書いてある", /番号は 1 から順/.test(fb.rule));
ok("★空欄 1 つでも【1】と書く、と書いてある", /空欄が 1 つのときも【1】/.test(fb.rule));
ok("____ は使わない、と書いてある", /____ や（　）や〇〇は使わない/.test(fb.rule));

section("画面");
ok("クラウドの答えから空欄の行を作っている",
  /out\.blanks = ba\.map/.test(INDEX));
ok("★文の中の【n】を、番号つきの入れ物として出している",
  /function blankMarks\(escaped\)/.test(INDEX) && /vq2-blankmark/.test(INDEX));
/* 数式（$…$）を入れたので、問題文・資料は mathText を通るようになった。
   mathText の中で blankMarks を呼んでいるので、空欄の印はそのまま効く。 */
ok("問題文にも本文にも効かせている",
  /mathText\(q\.prompt\)/.test(INDEX) && /mathText\(q\.context\)/.test(INDEX)
  && /var h = blankMarks\(esc\(t\)\);/.test(INDEX));

section("編集フォーム");
ok("★「空欄を追加」で文にも【n】が入る",
  /insertBlankMark\("【" \+ q\.blanks\.length \+ "】"\)/.test(INDEX));
ok("カーソルの位置に入れている", /el\.selectionStart/.test(INDEX));
ok("★空欄を消したら文からも消す", /kB\+\+ === atB/.test(INDEX));
ok("番号を 1 から振り直している", /function renumberBlanks\(\)/.test(INDEX));
ok("答え欄の番号もそろえ直している", /b\.label = String\(i \+ 1\)/.test(INDEX));

console.log("\n合格 " + pass + " / 不合格 " + fail);
if (bad.length) console.log("直すところ:\n  - " + bad.join("\n  - "));
process.exit(fail ? 1 : 0);
