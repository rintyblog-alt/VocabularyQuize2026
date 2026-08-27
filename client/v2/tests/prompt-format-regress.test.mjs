/* 指示文の読み取りで見つかった 4 件の退行の回帰テスト（2026-08-05）

   別のエージェントが「疑って検証」した結果、次の 4 件が見つかった。
   どれも **直す前は赤** であることを確かめてから直している。

     1. 「A と B と C で 20 問」の 20 問（＝総数）を、最後の形式 C の個数として食う。
        → typeDistribution が [C:20] になり、A・B が配分から消える。記録も残らない。
     2. 個数の合計が総数を超えたとき、ユーザーが書いた総数を無言で書き換える。
     3. 打ち消し判定が「ヒントなし」のような修飾語の否定まで拾い、
        頼まれた形式が excludedTypes へ落ちる。
     4. 同じ engine の形式が隣り合うと前へ吸収され、「英訳和訳」の和訳が消える。

   ここは「消えないこと」を見る。だから
   「requestedTypes に残っているか」「typeDistribution に残っているか」の
   両方を見る（片方だけだと、配分が消えても気づけない）。 */
import { installLocalStorage, installLocation, loadV2, group, test, assert, assertEq, report }
  from "./harness.mjs";

installLocalStorage();
installLocation("");
const VQ2 = loadV2([
  "qtypes", "qdescriptor", "schema", "qmodel", "validate", "adapter", "score-allocator",
  "grading", "evaluator", "blueprint", "answerability", "qplan"
].map((f) => "domain/" + f + ".js"));

const BP = VQ2.blueprint, Q = VQ2.qtypes, QPL = VQ2.qplan;

const want = (text) => BP.extractRequirements(text, { count: 10 });
const reqStr = (t) => want(t).requestedTypes.join(",");
const distStr = (t) => want(t).typeDistribution.map((e) => e.type + ":" + e.count).join(",");
const exclStr = (t) => (want(t).excludedTypes || []).join(",");
const warnText = (t) => (want(t).warnings || []).join(" / ");
const convStr = (t) => (want(t).converted || []).map((c) => c.what || c.from || "").join(",");

/* 指示 → 候補 → 配分まで実際に通したときの形式一覧。
   「requestedTypes に残っている」だけでは、配分で消えても気づけない。 */
function mixOf(text, count) {
  const req = want(text);
  const cand = BP.candidates(req, null, {});
  const exclude = (cand.excluded || []).map((e) => e.type).concat(req.excludedTypes || []);
  const plan = VQ2.qplan.planMix({
    count: count || req.totalQuestions || 10,
    style: req.onlyRequested ? "manual" : (req.style || "auto"),
    types: req.onlyRequested ? req.requestedTypes : [],
    requestedTypes: req.requestedTypes,
    exclude, requirements: req
  });
  return { plan, types: plan.items.map((i) => i.type), req, cand };
}

/* ══════════════════════════════════════════════════════════════════
   1. 総数が「最後の形式の個数」に食われない
   ══════════════════════════════════════════════════════════════════ */
group("1. 「A と B と C で 20 問」の 20 問は総数");

test("3 形式を名指ししてからの「で20問」は総数（配分を作らない）", () => {
  const t = "4択と穴埋めと正誤で20問作って";
  /* 退行時: dist=[true_false:20]。4択と穴埋めが配分から消えていた。 */
  assertEq(distStr(t), "", "「で20問」を形式の個数として食っている: " + distStr(t));
  assertEq(want(t).totalQuestions, 20, "総数が 20 になっていない");
  assertEq(reqStr(t), "multiple_choice_single,fill_blank,true_false", "名指しした形式が落ちている");
});

test("2 形式でも同じ", () => {
  const t = "空欄補充と正誤で10問";
  assertEq(distStr(t), "", distStr(t));
  assertEq(want(t).totalQuestions, 10);
  assertEq(reqStr(t), "fill_blank,true_false");
});

test("総数と読み替えたことが記録に残る（契約 §6）", () => {
  const t = "4択と穴埋めと正誤で20問作って";
  assert(warnText(t).indexOf("総数") >= 0,
    "warnings に記録が無い: " + JSON.stringify(want(t).warnings));
});

test("配分まで通すと 3 形式とも残る", () => {
  const req = want("4択と穴埋めと正誤で20問作って");
  const cand = BP.candidates(req, null, {});
  const exclude = (cand.excluded || []).map((e) => e.type).concat(req.excludedTypes || []);
  const plan = VQ2.qplan.planMix({
    count: req.totalQuestions, style: req.style || "auto",
    types: [], requestedTypes: req.requestedTypes, exclude, requirements: req
  });
  const got = plan.items.map((i) => i.type);
  ["multiple_choice_single", "fill_blank", "true_false"].forEach((x) =>
    assert(got.indexOf(x) >= 0, x + " が配分から消えた: " + plan.summary));
});

test("形式ごとに「で N 問」と書いてあるときは、今までどおり個数指定", () => {
  /* 「4択で10問、正誤で5問」は、どちらにも個数が付いている。総数ではない。 */
  assertEq(distStr("4択で10問、正誤で5問"), "multiple_choice_single:10,true_false:5");
  assertEq(want("4択で10問、正誤で5問").totalQuestions, 15);
});

test("形式が 1 つだけなら「で5問」は今までどおり個数", () => {
  assertEq(distStr("英文並び替えで5問"), "reorder_english:5");
  assertEq(distStr("正誤問題だけで10問作って"), "true_false:10");
});

test("「ずつ」「各」が付いていれば総数と読まない", () => {
  assertEq(distStr("穴埋めと正誤で各10問"), "fill_blank:10,true_false:10");
  assertEq(distStr("和訳と英訳で5問ずつ"), "translate_ja:5,translate_en:5");
});

test("「を N 問」「が N 問」は今までどおり個数（退行させない）", () => {
  assertEq(distStr("空欄補充を4問、正誤を4問"), "fill_blank:4,true_false:4");
  assertEq(distStr("並び替え 5 問と記述 3 問"), "ordering:5,long_answer:3");
  assertEq(distStr("組み合わせを3問と分類を2問"), "matching:3,classification:2");
});

/* ══════════════════════════════════════════════════════════════════
   2. ユーザーが書いた総数を無言で書き換えない
   ══════════════════════════════════════════════════════════════════ */
group("2. 総数を書き換えたら記録を残す");

test("総数 10 と書いたのに合計 12 になったら記録が残る", () => {
  const t = "10問作って。空欄補充を8問、正誤を4問。";
  const r = want(t);
  assertEq(r.totalQuestions, 12, "合計を採る方針にしたので 12 のはず");
  assert(warnText(t).indexOf("10") >= 0 && warnText(t).indexOf("12") >= 0,
    "書き換えた記録が warnings に無い: " + JSON.stringify(r.warnings));
  assert((r.converted || []).length > 0,
    "converted に記録が無い: " + JSON.stringify(r.converted));
  assertEq(convStr(t), "totalQuestions");
});

test("総数を書いていない指示では、書き換えの記録を出さない", () => {
  /* 「空欄補充を4問、正誤を4問」に総数は書かれていない。
     合計 8 を総数にするのは書き換えではないので、余計な警告を出さない。 */
  const r = want("空欄補充を4問、正誤を4問");
  assertEq(r.totalQuestions, 8);
  assertEq((r.warnings || []).length, 0, JSON.stringify(r.warnings));
});

test("総数のほうが大きいときは、そもそも書き換えない", () => {
  const r = want("10問作って。空欄補充を4問。");
  assertEq(r.totalQuestions, 10);
  assertEq((r.warnings || []).length, 0, JSON.stringify(r.warnings));
});

/* ══════════════════════════════════════════════════════════════════
   3. 修飾語の「なし」を形式の打ち消しと取り違えない
   ══════════════════════════════════════════════════════════════════ */
group("3. 「ヒントなし」で穴埋めが消えない");

test("「穴埋めをヒントなしで5問」は穴埋めを 5 問頼んでいる", () => {
  const t = "穴埋めをヒントなしで5問";
  /* 退行時: excl=[fill_blank]、req=[]。頼んだ形式が丸ごと消えていた。 */
  assertEq(exclStr(t), "", "修飾語の否定を形式の打ち消しと読んでいる");
  assertEq(reqStr(t), "fill_blank");
  assertEq(want(t).totalQuestions, 5);
  /* 「ヒントなし」を挟んだ「5問」は個数指定として読まない（迷ったら読まない）。
     読まないぶん、配分は自動に任せる。**そこで穴埋めが出るか**が本題なので、
     requestedTypes で終わらせず qplan まで通して確かめる。 */
  const got = mixOf(t, 5).types;
  assert(got.indexOf("fill_blank") >= 0, "穴埋めが配分に出てこない: " + got.join(","));
});

test("ほかの修飾語の否定も拾わない", () => {
  assertEq(exclStr("正誤を制限なしで4問"), "");
  assertEq(reqStr("正誤を制限なしで4問"), "true_false");
  assertEq(exclStr("記述を字数制限なしで2問"), "");
  assertEq(exclStr("4択を選択肢の重複なしで6問"), "");
});

test("形式そのものの否定は、今までどおり外す（弱めない）", () => {
  assertEq(exclStr("4択は使わないで、単語入力と組み合わせで"), "multiple_choice_single");
  assert(exclStr("記述なしで正誤を多めに").indexOf("long_answer") >= 0);
  assert(exclStr("並べ替えは除いて、穴埋め中心に").indexOf("ordering") >= 0);
  assert(exclStr("4択は入れないでください").indexOf("multiple_choice_single") >= 0);
  assert(exclStr("記述は不要です").indexOf("long_answer") >= 0);
  assert(exclStr("4択抜きで作って").indexOf("multiple_choice_single") >= 0);
  assert(exclStr("記述は禁止").indexOf("long_answer") >= 0);
});

/* ══════════════════════════════════════════════════════════════════
   4. 同じ engine が隣り合っても、正当な 2 形式を潰さない
   ══════════════════════════════════════════════════════════════════ */
group("4. 「英訳和訳」で和訳が消えない");

test("「英訳和訳を5問」は 2 形式", () => {
  const t = "英訳和訳を5問";
  /* 退行時: req=[translate_en] のみ。和訳（translate_ja）が消えていた。 */
  const got = want(t).requestedTypes;
  assert(got.indexOf("translate_en") >= 0, "英訳が無い: " + got.join(","));
  assert(got.indexOf("translate_ja") >= 0, "和訳が消えている: " + got.join(","));
  /* 5 問は「合わせて 5 問」。片方だけの個数として読むと、もう片方が配分から消える。 */
  assertEq(distStr(t), "", "片方だけの個数として読んでいる: " + distStr(t));
  assertEq(want(t).totalQuestions, 5);
  assert(warnText(t).indexOf("合わせて") >= 0, "合算として読んだ記録が無い: " + warnText(t));
  const mixed = mixOf(t).types;
  ["translate_en", "translate_ja"].forEach((x) =>
    assert(mixed.indexOf(x) >= 0, x + " が配分から消えた: " + mixed.join(",")));
});

test("「和訳英訳を5問ずつ」も 2 形式で個数が両方に付く", () => {
  assertEq(distStr("和訳英訳を5問ずつ"), "translate_ja:5,translate_en:5");
});

test("総称が後ろに続くときの統合は残す（誤爆を戻さない）", () => {
  assertEq(reqStr("英単語と訳のマッチングを4問"), "matching_word_meaning");
  assertEq(distStr("英単語と訳のマッチングを4問"), "matching_word_meaning:4");
});

test("統合したときは記録を残す（契約 §6）", () => {
  assert(warnText("英単語と訳のマッチングを4問").indexOf("マッチング") >= 0,
    "統合の記録が無い: " + JSON.stringify(want("英単語と訳のマッチングを4問").warnings));
});

/* ══════════════════════════════════════════════════════════════════
   5. 次の形式名より先の数字を食わない
   ══════════════════════════════════════════════════════════════════ */
group("5. 個数は「その形式名と次の形式名のあいだ」だけを見る");

test("「正誤と一問一答で12問」で正誤が 1 問にならない", () => {
  /* 総当たり（64 通り）で見つけた読み違い。
     正誤のうしろを最後まで見ると「と」＋**一**＋「問」で 正誤 1 問 と読んでいた。
     食っていたのは「一問一答」の“一問”。 */
  const t = "正誤と一問一答で12問";
  const d = distStr(t);
  assert(d.indexOf("true_false:1") < 0, "「一問一答」の“一問”を正誤の個数として食っている: " + d);
  assertEq(want(t).totalQuestions, 12);
  assertEq(reqStr(t), "true_false,word_input");
});

test("形式名をまたいだ数字を拾わない（ほかの言い方でも）", () => {
  /* 「一問一答」を含む言い方で、手前の形式に個数が付かないこと。 */
  assert(distStr("穴埋めと一問一答で10問").indexOf("fill_blank:1") < 0, distStr("穴埋めと一問一答で10問"));
  assert(distStr("4択と一問一答を8問").indexOf("multiple_choice_single:1") < 0, distStr("4択と一問一答を8問"));
});

/* ══════════════════════════════════════════════════════════════════
   6. 代表的な言い方の総当たり
   ══════════════════════════════════════════════════════════════════ */
group("6. 代表的な言い方 40 通り以上を通す");

/* 1 行ずつ「読み取った結果はこうであるべき」を書き下す。
   req / dist / excl を全部そろえて見るので、どれかが黙って消えれば落ちる。
   （個数の合計が総数に届かないぶんは自動配分。総数はここでは見ない。） */
const SWEEP = [
  /* ── 複数形式を名指ししてからの「で N 問」＝総数。配分は作らない ── */
  ["4択と穴埋めと正誤で20問作って", "multiple_choice_single,fill_blank,true_false", "", ""],
  ["空欄補充と正誤で10問", "fill_blank,true_false", "", ""],
  ["穴埋めと4択と記述で15問お願いします", "fill_blank,multiple_choice_single,long_answer", "", ""],
  ["和訳と英訳と英作文で9問", "translate_ja,translate_en,english_writing", "", ""],
  ["正誤と一問一答で12問", "true_false,word_input", "", ""],
  /* ── 形式ごとに個数が書いてある＝配分として読む ── */
  ["空欄補充を4問、正誤を4問", "fill_blank,true_false", "fill_blank:4,true_false:4", ""],
  ["4択を10問、○×を5問", "multiple_choice_single,true_false", "multiple_choice_single:10,true_false:5", ""],
  ["並び替え 5 問と記述 3 問", "ordering,long_answer", "ordering:5,long_answer:3", ""],
  ["組み合わせを3問と分類を2問", "matching,classification", "matching:3,classification:2", ""],
  ["和訳を5問、英訳を5問", "translate_ja,translate_en", "translate_ja:5,translate_en:5", ""],
  ["4択で10問、正誤で5問", "multiple_choice_single,true_false", "multiple_choice_single:10,true_false:5", ""],
  ["穴埋めで6問、記述で2問", "fill_blank,long_answer", "fill_blank:6,long_answer:2", ""],
  ["英文並び替えを3問と和訳を2問", "reorder_english,translate_ja", "reorder_english:3,translate_ja:2", ""],
  /* ── 「ずつ」「各」 ── */
  ["和訳と英訳を5問ずつ", "translate_ja,translate_en", "translate_ja:5,translate_en:5", ""],
  ["和訳と英訳を各5問", "translate_ja,translate_en", "translate_ja:5,translate_en:5", ""],
  ["和訳と英訳で5問ずつ", "translate_ja,translate_en", "translate_ja:5,translate_en:5", ""],
  ["穴埋めと正誤で各10問", "fill_blank,true_false", "fill_blank:10,true_false:10", ""],
  /* ── 形式が 1 つだけのとき ── */
  ["英文並び替えで5問", "reorder_english", "reorder_english:5", ""],
  ["正誤問題だけで10問作って", "true_false", "true_false:10", ""],
  ["一問一答で20問", "word_input", "word_input:20", ""],
  ["穴埋めのみで作って", "fill_blank", "", ""],
  ["組み合わせを入れて", "matching", "", ""],
  ["穴埋めと正誤", "fill_blank,true_false", "", ""],
  ["正誤を入れて10問作って", "true_false", "", ""],
  /* ── 総数が別に書いてある ── */
  ["10問作って。空欄補充を4問。", "fill_blank", "fill_blank:4", ""],
  ["10問作って。空欄補充を8問、正誤を4問。", "fill_blank,true_false", "fill_blank:8,true_false:4", ""],
  ["全部で20問。うち記述を5問。", "long_answer", "long_answer:5", ""],
  /* ── 修飾語の「なし」は打ち消しではない ── */
  ["穴埋めをヒントなしで5問", "fill_blank", "", ""],
  ["正誤を制限なしで4問", "true_false", "", ""],
  ["記述を字数制限なしで2問", "long_answer", "", ""],
  ["4択を選択肢の重複なしで6問", "multiple_choice_single", "", ""],
  ["穴埋めを画像なしで5問", "fill_blank", "", ""],
  /* ── 形式そのものの打ち消し ── */
  ["4択は使わないで、単語入力と組み合わせで", "word_input,matching", "", "multiple_choice_single"],
  ["記述なしで正誤を多めに", "true_false", "", "long_answer"],
  ["並べ替えは除いて、穴埋め中心に", "fill_blank", "", "ordering"],
  ["4択は入れないでください", "", "", "multiple_choice_single"],
  ["記述は不要です", "", "", "long_answer"],
  ["4択抜きで作って", "", "", "multiple_choice_single"],
  ["記述は禁止", "", "", "long_answer"],
  ["リスニングは避けて、穴埋めで", "fill_blank", "", "audio_choice"],
  ["記述は使わないで、穴埋めを5問", "fill_blank", "fill_blank:5", "long_answer"],
  ["4択だけで作って。ただし4択は使わないでください", "", "", "multiple_choice_single"],
  /* ── 隣り合う形式・総称の吸収 ── */
  /* 「英訳和訳を5問」の 5 問は和訳だけの数ではない。合わせて 5 問（配分は自動）。 */
  ["英訳和訳を5問", "translate_en,translate_ja", "", ""],
  ["和訳英訳を5問ずつ", "translate_ja,translate_en", "translate_ja:5,translate_en:5", ""],
  ["英単語と訳のマッチングを4問", "matching_word_meaning", "matching_word_meaning:4", ""],
  ["英単語と訳のマッチングで4問", "matching_word_meaning", "matching_word_meaning:4", ""],
  /* ── 語の境界・数の書き方 ── */
  ["単語並べ替えを2問", "reorder_words", "reorder_words:2", ""],
  ["年代順並べ替えを4問", "reorder_chronology", "reorder_chronology:4", ""],
  ["選択式穴埋めを4問", "fill_blank_choice", "fill_blank_choice:4", ""],
  ["計算手順を3問", "reorder_steps", "reorder_steps:3", ""],
  ["作文を1問", "essay", "essay:1", ""],
  ["英作文を2問", "english_writing", "english_writing:2", ""],
  ["穴埋めを五問", "fill_blank", "fill_blank:5", ""],
  ["正誤を十問", "true_false", "true_false:10", ""],
  ["記述を十二問", "long_answer", "long_answer:12", ""],
  ["空欄補充を５問、正誤を５問", "fill_blank,true_false", "fill_blank:5,true_false:5", ""],
  ["正誤を4題、記述を2個", "true_false,long_answer", "true_false:4,long_answer:2", ""],
  ["穴埋めを3つ", "fill_blank", "fill_blank:3", ""],
  /* ── 形式の話をしていない指示で、形式を作らない ── */
  ["この資料から10問作って", "", "", ""],
  ["テスト対策の問題を作って", "", "", ""],
  ["日本史の問題を作って", "", "", ""],
  ["音楽の授業用に", "", "", ""],
  ["難しめにしてください", "", "", ""]
];

test("表に書いた " + SWEEP.length + " 通りが、そのとおりに読める", () => {
  assert(SWEEP.length >= 40, "言い方が 40 通りに足りない: " + SWEEP.length);
  const bad = [];
  SWEEP.forEach(([t, r, d, x]) => {
    if (reqStr(t) !== r) bad.push(t + "\n    req  期待 [" + r + "] / 実際 [" + reqStr(t) + "]");
    if (distStr(t) !== d) bad.push(t + "\n    dist 期待 [" + d + "] / 実際 [" + distStr(t) + "]");
    if (exclStr(t) !== x) bad.push(t + "\n    excl 期待 [" + x + "] / 実際 [" + exclStr(t) + "]");
  });
  assert(bad.length === 0, bad.length + " 件ずれた:\n  " + bad.join("\n  "));
});

test("名指しした形式は、配分まで通しても 1 つも消えない", () => {
  /* 「requestedTypes に入っている」だけでは、qplan で落ちても気づけない。 */
  const bad = [];
  SWEEP.forEach(([t, r]) => {
    if (!r) return;
    const req = want(t);
    if (req.totalQuestions < r.split(",").length) return;   /* 総数が足りない指示は対象外 */
    const got = mixOf(t).types;
    r.split(",").forEach((x) => {
      /* 使えない形式は candidates が理由つきで外す。それは「消えた」ではない。 */
      const excusedByCand = (mixOf(t).cand.excluded || []).some((e) => e.type === x)
        || (mixOf(t).cand.unavailableRequested || []).some((u) => u.type === x);
      if (got.indexOf(x) < 0 && !excusedByCand) bad.push(t + " → " + x + " が配分に無い（" + got.join(",") + "）");
    });
  });
  assert(bad.length === 0, bad.join("\n  "));
});

/* ══ §50 の代表ケース（仕様書が名指しした言い方）══════════════════
   2026-08-05 の実測で、次の 2 つが通っていなかった。
     ・「全問、〜にしてください」… 範囲の限定が形式名の**前**に来る言い方。
       「だけ」「のみ」は後方一致で拾えるが、これは拾えず、
       「英文並び替え 4 問＋ほか 5 形式」という配分になっていた。
     ・「〜を含めないでください」… 打ち消しの語彙に無く、
       long_answer が**要求**として読まれ、禁止されていなかった。 */
group("§50 の代表ケース");
{
  const run = (instr, count) => {
    const req = BP.extractRequirements(instr, { count, sourceOnly: true });
    const plan = QPL.planMix({
      count: req.totalQuestions || count,
      style: req.onlyRequested ? "manual" : (req.style || "auto"),
      types: req.onlyRequested ? req.requestedTypes : [],
      requestedTypes: req.requestedTypes,
      typeDistribution: req.typeDistribution || [],
      exclude: req.excludedTypes || [], sourceOnly: true, requirements: req
    });
    return { req, types: (plan.items || []).map((i) => i.type + ":" + i.count) };
  };

  test("ケース1: 全10問を英文並び替えに → 全部が並び替えになる", () => {
    const r = run("全10問を英文並び替え問題にしてください。記述問題と4択問題は禁止です。", 10);
    assertEq(r.types.join(","), "reorder_english:10");
  });
  test("ケース1: 「全問、〜にして」でも同じ", () => {
    const r = run("全問、英文並び替え問題にしてください。", 10);
    assertEq(r.types.join(","), "reorder_english:10");
  });
  test("ケース2: 穴埋め5問・並び替え5問がそのとおりになる", () => {
    const r = run("穴埋め5問、並び替え5問を作ってください。", 10);
    assertEq(r.types.join(","), "fill_blank:5,ordering:5");
  });
  test("ケース3: 「含めないで」は禁止として読む", () => {
    const r = run("記述問題を含めないでください。", 10);
    assert(r.req.excludedTypes.indexOf("long_answer") >= 0,
      "禁止に入っていません: " + JSON.stringify(r.req.excludedTypes));
    assert(r.req.requestedTypes.indexOf("long_answer") < 0,
      "禁止した形式が要求にも入っています");
  });
  test("ケース3: 禁止した形式は配分に出ない", () => {
    const r = run("記述問題を含めないでください。", 10);
    assert(!r.types.some((t) => t.indexOf("long_answer") === 0),
      "禁止した形式が配分に出ています: " + r.types.join(","));
  });
  test("「入れずに」も禁止として読む", () => {
    const r = run("4択は入れずに10問つくって。", 10);
    assert(r.req.excludedTypes.indexOf("multiple_choice_single") >= 0,
      JSON.stringify(r.req.excludedTypes));
  });

  /* 強すぎて総数の言い方まで限定と読まないこと */
  test("「全部で10問」は範囲の限定ではない（総数の言い方）", () => {
    const r = run("全部で10問つくって。4択中心で。", 10);
    assertEq(!!r.req.onlyRequested, false, "総数の言い方を限定と読んでいます");
  });
  test("「合計で10問」も限定ではない", () => {
    const r = run("合計で10問。穴埋めを入れて。", 10);
    assertEq(!!r.req.onlyRequested, false);
  });
}

/* ══ 並べてまとめて否定する言い方（2026-08-05）════════════════════
   「4択、穴埋め、短答、自由記述は**禁止です**」は、実際にいちばん
   よく書かれる言い方。ところが打ち消しは「形式名のうしろ 12 文字以内」
   しか見ていなかったため、**最後の 1 つしか禁止にならず、
   残りは要求として読まれていた**（実測: 上の文で禁止は long_answer だけ、
   4択・穴埋め・短答が要求に入っていた）。 */
group("並べてまとめて否定する");
{
  const denied = (t) => (Q.deniedFromJapanese ? Q.deniedFromJapanese(t) : []).join(",");
  const asked = (t) => {
    const d = Q.deniedFromJapanese ? Q.deniedFromJapanese(t) : [];
    return (Q.fromJapanese(t) || []).filter((x) => d.indexOf(x) < 0).join(",");
  };

  test("「4択、穴埋め、短答、自由記述は禁止」で 4 つとも禁止になる", () => {
    const d = denied("英文並び替え問題を10問。4択、穴埋め、短答、自由記述は禁止です。");
    ["multiple_choice_single", "fill_blank", "short_answer", "long_answer"].forEach((t) => {
      assert(d.indexOf(t) >= 0, t + " が禁止に入っていません: " + d);
    });
  });
  test("禁止した形式が要求にも残らない", () => {
    const a = asked("英文並び替え問題を10問。4択、穴埋め、短答、自由記述は禁止です。");
    assertEq(a, "reorder_english", "禁止した形式が要求に残っています: " + a);
  });
  test("「自由記述、短答、作文形式は禁止」も 3 つとも禁止", () => {
    const d = denied("社会の問題を10問。自由記述、短答、作文形式は禁止です。");
    ["long_answer", "short_answer", "essay"].forEach((t) => {
      assert(d.indexOf(t) >= 0, t + " が禁止に入っていません: " + d);
    });
  });

  /* 強すぎて、並びでないものまで巻き込まないこと */
  test("文が変わったら並びではない", () => {
    const d = denied("穴埋めを5問つくってください。4択は禁止です。");
    assert(d.indexOf("fill_blank") < 0, "別の文の穴埋めまで禁止にしています: " + d);
    assert(d.indexOf("multiple_choice_single") >= 0);
  });
  test("動きのある語が挟まったら並びではない", () => {
    const d = denied("穴埋めを入れて、4択は使わないでください。");
    assert(d.indexOf("fill_blank") < 0, "「入れて」と頼んだ形式を禁止にしています: " + d);
  });
  test("「ヒントなし」は今までどおり打ち消しではない", () => {
    const d = denied("穴埋めをヒントなしで5問つくって。");
    assertEq(d, "");
  });
}

/* ══ 整序の言い方（2026-08-05）════════════════════════════════
   「語句整序」は入試や参考書でいちばん使われる言い方だが、
   別名の表に無かったため word_input（一問一答）に化けていた。 */
group("整序の言い方");
{
  const first = (t) => (Q.fromJapanese(t) || [])[0] || "";
  test("語句整序は並べ替え", () => {
    const r = (Q.fromJapanese("英語の語句整序問題を10問つくってください。") || []);
    assert(r.indexOf("reorder_words") >= 0 || r.indexOf("reorder_english") >= 0
      || r.indexOf("ordering") >= 0, "並べ替えとして読めていません: " + r.join(","));
    assert(r.indexOf("word_input") < 0 || r.indexOf("reorder_words") >= 0,
      "一問一答として読んでいます: " + r.join(","));
  });
  test("英文整序も並べ替え", () => {
    assertEq(first("英文整序を5問"), "reorder_english");
  });
}

process.exit(report("指示文の読み取り・退行の回帰") ? 1 : 0);
