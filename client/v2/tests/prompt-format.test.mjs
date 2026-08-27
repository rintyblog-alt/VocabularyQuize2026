/* 指示文から「出題形式」を正しく読み取れるか

   報告された不具合（2026-08-04）:
     「プロンプトに沿った問題形式がほぼ出てこない。ランダムで適当になる」

   実測すると、**読み取りの段階で 0 個**だった。
     「正誤問題だけで10問作って」  → 読み取った形式 0 個
     「空欄補充を5問、正誤を5問」  → 読み取った形式 0 個
   原因は、レジストリの名前が「○×」「単一穴埋め」で、
   **利用者が実際に書く語と違っていた**こと。名前だけを照合していたので当たらない。

   ここでは「人が書く言い方」で通ることを確かめる。
   併せて、打ち消し（「使わないで」）を要求と取り違えないことも見る。 */
import { installLocalStorage, installLocation, loadV2, group, test, assert, assertEq, report }
  from "./harness.mjs";

installLocalStorage();
installLocation("");
const VQ2 = loadV2([
  "qtypes", "qdescriptor", "schema", "qmodel", "validate", "adapter", "score-allocator",
  "grading", "evaluator", "blueprint", "answerability", "qplan"
].map((f) => "domain/" + f + ".js"));

const BP = VQ2.blueprint, QPL = VQ2.qplan;

const want = (text) => BP.extractRequirements(text, { count: 10 });
const has = (text, type) => want(text).requestedTypes.indexOf(type) >= 0;
const denies = (text, type) => (want(text).excludedTypes || []).indexOf(type) >= 0;

/* 指示 → 配分まで通したときの形式一覧 */
function mixOf(text, count) {
  const req = want(text);
  const cand = BP.candidates(req, null, {});
  const exclude = (cand.excluded || []).map((e) => e.type).concat(req.excludedTypes || []);
  const plan = QPL.planMix({
    count: count || 10,
    style: req.onlyRequested ? "manual" : (req.style || "auto"),
    types: req.onlyRequested ? req.requestedTypes : [],
    requestedTypes: req.requestedTypes,
    exclude, requirements: req
  });
  return { plan, types: plan.items.map((i) => i.type), req, cand };
}

/* ══════════════════════════════════════════════════════════════ */
group("1. 人が実際に書く言い方で通る");

test("正誤問題（レジストリ名は「○×」）", () => {
  ["正誤問題を入れて", "正誤を多めに", "マルバツで", "○✕で出して", "正誤判定を 5 問"]
    .forEach((t) => assert(has(t, "true_false"), t));
});

test("空欄補充（レジストリ名は「単一穴埋め」）", () => {
  ["空欄補充を 5 問", "空所補充で", "穴埋めを多めに", "虫食い問題で", "括弧埋めを入れて"]
    .forEach((t) => assert(has(t, "fill_blank"), t));
});

test("一問一答・用語（単語入力）", () => {
  ["一問一答で 20 問", "用語問題を中心に", "単語入力を多めに"]
    .forEach((t) => assert(has(t, "word_input"), t));
});

test("四択の書き方いろいろ", () => {
  ["四択で", "4択を多めに", "選択式で", "選択問題を 5 問"]
    .forEach((t) => assert(has(t, "multiple_choice_single"), t));
});

test("組み合わせ・並べ替え・記述", () => {
  assert(has("組み合わせを入れて", "matching"));
  assert(has("並び替えを多めに", "ordering"));
  assert(has("記述式を 2 問", "long_answer"));
});

/* ══════════════════════════════════════════════════════════════ */
group("2. 「〜だけ」は、その形式だけにする");

test("「正誤問題だけ」で正誤だけになる", () => {
  const r = want("正誤問題だけで10問作って");
  assert(r.onlyRequested, "「だけ」を読み取れていない");
  assertEq(r.requestedTypes.join(","), "true_false");
  const m = mixOf("正誤問題だけで10問作って");
  assertEq([...new Set(m.types)].join(","), "true_false", m.plan.summary);
});

test("「〜のみ」でも同じ", () => {
  assert(want("穴埋めのみで作って").onlyRequested);
});

/* ══════════════════════════════════════════════════════════════ */
group("3. 打ち消しを要求と取り違えない");

test("「4択は使わないで」は外す指示", () => {
  const t = "4択は使わないで、単語入力と組み合わせで";
  assert(denies(t, "multiple_choice_single"), "外す側に入っていない");
  assert(!has(t, "multiple_choice_single"), "**出してほしい形式として読み取っている**");
  assert(has(t, "word_input") && has(t, "matching"), "本当に頼まれた形式が落ちている");
});

test("いろいろな打ち消しの言い方", () => {
  assert(denies("記述なしで正誤を多めに", "long_answer"));
  assert(denies("並べ替えは除いて、穴埋め中心に", "ordering"));
  assert(denies("4択は入れないでください", "multiple_choice_single"));
  assert(denies("記述は不要です", "long_answer"));
});

test("外した形式は配分にも入らない", () => {
  const m = mixOf("4択は使わないで、単語入力と組み合わせで");
  assertEq(m.types.indexOf("multiple_choice_single"), -1, m.plan.summary);
});

test("打ち消しと限定が食い違うときは、打ち消しを優先する", () => {
  /* 「4択だけで。ただし4択は使わないで」は矛盾。
     限定を通すと 0 問になるので、限定を解いて自動の配分へ落とす。 */
  const r = want("4択だけで作って。ただし4択は使わないでください");
  assert(!r.onlyRequested, "矛盾したまま限定が残っている");
  assert((r.excludedTypes || []).indexOf("multiple_choice_single") >= 0);
});

/* ══════════════════════════════════════════════════════════════ */
group("4. 頼んだ形式が配分に残る");

test("頼んだ形式は、自動の配分でも必ず入る", () => {
  [["空欄補充を5問、正誤を5問", ["fill_blank", "true_false"]],
   ["並び替えを多めに", ["ordering"]],
   ["一問一答で", ["word_input"]]].forEach(([text, types]) => {
    const m = mixOf(text);
    types.forEach((t) => assert(m.types.indexOf(t) >= 0, text + " → " + t + " が入っていない: " + m.plan.summary));
  });
});

test("使えない形式を頼まれたら、黙って落とさず理由を持つ", () => {
  /* 音の出せない環境ではリスニングは作れない。**黙って消さない**。 */
  const m = mixOf("リスニング問題を入れて");
  const un = (m.cand.unavailableRequested || []).map((u) => u.type);
  const inMix = m.types.indexOf("audio_choice") >= 0;
  assert(inMix || un.indexOf("audio_choice") >= 0,
    "配分にも入らず、外した理由も残っていない");
});

/* ══════════════════════════════════════════════════════════════ */
group("5. 関係のない語に反応しない");

test("ふつうの指示で形式を勝手に読み取らない", () => {
  ["この資料から10問作って", "テスト対策の問題を作って", "難しめにしてください"]
    .forEach((t) => assertEq(want(t).requestedTypes.length, 0, t));
});

test("科目名を形式と取り違えない", () => {
  /* 「日本史」「音楽」などが形式に化けないこと。 */
  ["日本史の問題を作って", "音楽の授業用に", "情報の問題"]
    .forEach((t) => assertEq(want(t).requestedTypes.length, 0, t + " → " + JSON.stringify(want(t).requestedTypes)));
});

/* ══════════════════════════════════════════════════════════════ */
group("6. 形式ごとの個数を読む（契約 §5）");

const Q = VQ2.qtypes;
const distOf = (text) => want(text).typeDistribution;
const distStr = (text) => distOf(text).map((e) => e.type + ":" + e.count).join(",");

test("実測の失敗例：「空欄補充を4問、正誤を4問」を配分として読む", () => {
  /* 2026-08-05 実測。この指示に対して決まった配分が
     「単一穴埋め2・4択2・○×2・文章並べ替え1・単語入力1」だった。
     AI は配分どおりに返していたので、壊していたのは配分決定のほう。 */
  assertEq(distStr("空欄補充を4問、正誤を4問つくってください。"), "fill_blank:4,true_false:4");
});

test("個数の合計が総数になる", () => {
  /* 総数は書かれていない。「4問」だけを見て 4 問と読んではいけない。 */
  assertEq(want("空欄補充を4問、正誤を4問つくってください。").totalQuestions, 8);
});

test("読み取れたことが分かる", () => {
  assertEq(want("空欄補充を4問、正誤を4問").stated.typeDistribution, true);
  assertEq(want("この資料から10問作って").stated.typeDistribution, undefined);
});

test("「並び替え 5 問と記述 3 問」", () => {
  assertEq(distStr("並び替え 5 問と記述 3 問"), "ordering:5,long_answer:3");
});

test("「4択を10問、○×を5問」", () => {
  assertEq(distStr("4択を10問、○×を5問"), "multiple_choice_single:10,true_false:5");
});

test("個数の書かれていない形式は配分に入れない", () => {
  /* 形式としては拾う（requestedTypes）が、個数は決めつけない。 */
  assertEq(distStr("穴埋めと正誤"), "");
  assert(has("穴埋めと正誤", "fill_blank") && has("穴埋めと正誤", "true_false"));
});

test("個数指定が無ければ空配列", () => {
  ["この資料から10問作って", "テスト対策の問題を作って", "難しめにしてください"]
    .forEach((t) => assertEq(distOf(t).length, 0, t + " → " + distStr(t)));
});

test("全角数字も読む", () => {
  assertEq(distStr("空欄補充を５問、正誤を５問"), "fill_blank:5,true_false:5");
});

test("漢数字も読む", () => {
  assertEq(distStr("穴埋めを五問"), "fill_blank:5");
  assertEq(distStr("正誤を十問"), "true_false:10");
  assertEq(distStr("記述を十二問"), "long_answer:12");
});

test("「問」「題」「個」の揺れ", () => {
  assertEq(distStr("正誤を4題、記述を2個"), "true_false:4,long_answer:2");
  assertEq(distStr("穴埋めを3つ"), "fill_blank:3");
});

test("「5問ずつ」「各5問」は両方にかかる", () => {
  assertEq(distStr("和訳と英訳を5問ずつ"), "translate_ja:5,translate_en:5");
  assertEq(distStr("和訳と英訳を各5問"), "translate_ja:5,translate_en:5");
});

test("打ち消された形式は、個数が書いてあっても配分に入れない", () => {
  const r = want("記述は使わないで、穴埋めを5問");
  assertEq(r.typeDistribution.map((e) => e.type).join(","), "fill_blank");
  assert((r.excludedTypes || []).indexOf("long_answer") >= 0);
});

test("総数のほうが多いときは、総数を書き換えない", () => {
  const r = want("10問作って。空欄補充を4問。");
  assertEq(r.totalQuestions, 10);
  assertEq(r.typeDistribution.map((e) => e.type + ":" + e.count).join(","), "fill_blank:4");
});

test("個数まで書かれた形式は、名指しされた形式にも入る", () => {
  assert(has("空欄補充を4問、正誤を4問", "fill_blank"));
  assert(has("空欄補充を4問、正誤を4問", "true_false"));
});

test("配分どおりに割り当てられる（qplan まで通す）", () => {
  const m = mixOf("空欄補充を4問、正誤を4問つくってください。", 8);
  const got = m.plan.items.map((i) => i.type + ":" + i.count).sort().join(",");
  assertEq(got, "fill_blank:4,true_false:4", m.plan.summary);
});

/* ══════════════════════════════════════════════════════════════ */
group("7. 語の境界を見る（部分一致で誤爆しない）");

const reqStr = (text) => want(text).requestedTypes.join(",");

test("「英文並び替え」は英作文並べ替え（文章並べ替えではない）", () => {
  ["英文並び替えで5問", "英文並べ替えを3問", "英文の並び替えを5問"]
    .forEach((t) => assertEq(reqStr(t), "reorder_english", t));
});

test("「英作文並べ替え」は 1 形式だけ（4 件に誤爆しない）", () => {
  /* 実測（2026-08-05）: reorder_english / ordering / essay / english_writing の 4 件。 */
  assertEq(reqStr("英作文並べ替えで5問"), "reorder_english");
});

test("長い言い方の中の短い言い方を拾わない", () => {
  assertEq(reqStr("単語並べ替えを2問"), "reorder_words");
  assertEq(reqStr("年代順並べ替えを4問"), "reorder_chronology");
  assertEq(reqStr("フローチャート並べ替えを2問"), "reorder_flow");
  assertEq(reqStr("選択式穴埋めを4問"), "fill_blank_choice");
  assertEq(reqStr("計算手順を3問"), "reorder_steps");
});

test("「作文」は作文、「英作文」は英作文", () => {
  assertEq(reqStr("作文を1問"), "essay");
  assertEq(reqStr("英作文を2問"), "english_writing");
});

test("同じ操作の総称が後ろに続いても 2 形式に割らない", () => {
  /* 「英単語と訳のマッチング」を 2 形式と読むと、個数まで総称のほうへ付く。 */
  assertEq(reqStr("英単語と訳のマッチングを4問"), "matching_word_meaning");
  assertEq(distStr("英単語と訳のマッチングを4問"), "matching_word_meaning:4");
});

test("正当な複数指定は今までどおり両方拾う", () => {
  assertEq(want("穴埋めと正誤").requestedTypes.length, 2);
  assertEq(distStr("和訳を5問、英訳を5問"), "translate_ja:5,translate_en:5");
  assertEq(distStr("組み合わせを3問と分類を2問"), "matching:3,classification:2");
});

test("総数の「10問」を形式の個数として食わない", () => {
  /* 「正誤を入れて10問」の 10 問は総数。形式ごとの個数ではない。 */
  assertEq(distStr("正誤を入れて10問作って"), "");
  assert(has("正誤を入れて10問作って", "true_false"));
});

test("「A と B と C で20問」の20問も総数（助詞の「で」で食わない）", () => {
  /* 退行（2026-08-05）: COUNT_TAIL_RE の助詞に「で」があるため
     「正誤で20問」の 20 問を true_false の個数として読み、
     dist が [true_false:20] になって 4択と穴埋めが配分から消えていた。
     詳しい回帰は prompt-format-regress.test.mjs にある。 */
  assertEq(distStr("4択と穴埋めと正誤で20問作って"), "");
  assertEq(want("4択と穴埋めと正誤で20問作って").totalQuestions, 20);
  assertEq(reqStr("4択と穴埋めと正誤で20問作って"),
    "multiple_choice_single,fill_blank,true_false");
  /* それぞれに個数が付いているときは、今までどおり個数指定として読む。 */
  assertEq(distStr("4択で10問、正誤で5問"), "multiple_choice_single:10,true_false:5");
});

test("形式名をまたいで数字を拾わない（「一問一答」の“一問”）", () => {
  /* 「正誤と一問一答で12問」で 正誤:1 と読んでいた。 */
  assert(distStr("正誤と一問一答で12問").indexOf("true_false:1") < 0,
    distStr("正誤と一問一答で12問"));
});

test("「ヒントなし」は穴埋めの打ち消しではない", () => {
  /* 退行: DENY_RE が形式名の 12 文字後ろまでの「なし」に当たり、
     「穴埋めをヒントなしで5問」で fill_blank が excludedTypes へ落ちていた。 */
  assert(!denies("穴埋めをヒントなしで5問", "fill_blank"), "修飾語の否定を打ち消しと読んでいる");
  assert(has("穴埋めをヒントなしで5問", "fill_blank"), "頼まれた穴埋てが消えている");
  /* 形式そのものの否定は今までどおり外す。 */
  assert(denies("記述なしで正誤を多めに", "long_answer"));
  assert(denies("4択抜きで作って", "multiple_choice_single"));
});

test("「英訳和訳」は 2 形式（同 engine 隣接で潰さない）", () => {
  /* 退行: 間が空文字で engine が同じなら前へ吸収していたため、
     和訳（translate_ja）が黙って消えていた。 */
  const got = want("英訳和訳を5問").requestedTypes;
  assert(got.indexOf("translate_en") >= 0 && got.indexOf("translate_ja") >= 0, got.join(","));
  /* 総称の吸収（「英単語と訳のマッチング」）は、これまでどおり 1 形式のまま。 */
  assertEq(reqStr("英単語と訳のマッチングを4問"), "matching_word_meaning");
});

test("読み取りで手心を加えたら、必ず記録が残る（契約 §6）", () => {
  /* warnings / converted が空のまま結果だけ変わる、をさせない。 */
  [["4択と穴埋めと正誤で20問作って", "総数"],
   ["10問作って。空欄補充を8問、正誤を4問。", "12"],
   ["英単語と訳のマッチングを4問", "マッチング"],
   ["英訳和訳を5問", "合わせて"]].forEach(([t, needle]) => {
    const r = want(t);
    assert((r.warnings || []).join(" ").indexOf(needle) >= 0,
      t + " の記録が無い: " + JSON.stringify(r.warnings));
    assert((r.converted || []).length > 0, t + " の converted が空");
  });
  /* 手心を加えていない指示では、余計な警告を出さない。 */
  assertEq(want("空欄補充を4問、正誤を4問").warnings.length, 0);
  assertEq(want("この資料から10問作って").warnings.length, 0);
});

/* ══════════════════════════════════════════════════════════════ */
group("8. 日本語の読み取りは qtypes から使える（契約 §1）");

test("qtypes に共有 API がある", () => {
  ["fromJapanese", "mentionsOf", "deniedFromJapanese", "countsFromJapanese"]
    .forEach((k) => assertEq(typeof Q[k], "function", k));
});

test("canonicalId が日本語も解く", () => {
  /* 実測（着手前）: qtypes.canonicalId("英文並び替え") → null */
  assertEq(Q.canonicalId("英文並び替え"), "reorder_english");
  assertEq(Q.canonicalId("正誤"), "true_false");
  assertEq(Q.canonicalId("空欄補充"), "fill_blank");
  /* 既存の ID・英字の別名はこれまでどおり */
  assertEq(Q.canonicalId("mcq"), "multiple_choice_single");
  assertEq(Q.canonicalId("fill_blank"), "fill_blank");
  assertEq(Q.canonicalId("そんな形式はない"), null);
});

test("blueprint は qtypes を呼ぶだけ（表を二重に持たない）", () => {
  ["空欄補充を4問、正誤を4問", "英文並び替えで5問", "一問一答で20問"].forEach((t) => {
    assertEq(want(t).requestedTypes.join(","), Q.fromJapanese(t).join(","), t);
  });
});

test("「〜だけ」の絞り込みも qtypes 側で使える", () => {
  assertEq(Q.fromJapanese("正誤問題だけで10問作って", { suffix: /(だけ|のみ)/ }).join(","), "true_false");
  assertEq(Q.fromJapanese("正誤問題を10問作って", { suffix: /(だけ|のみ)/ }).length, 0);
});

test("打ち消しと個数も qtypes 側で読める", () => {
  assertEq(Q.deniedFromJapanese("4択は使わないで、単語入力で").join(","), "multiple_choice_single");
  assertEq(Q.countsFromJapanese("空欄補充を4問、正誤を4問")
    .map((e) => e.type + ":" + e.count).join(","), "fill_blank:4,true_false:4");
});

test("数の読み方（全角・漢数字）", () => {
  assertEq(Q.readNumber("12"), 12);
  assertEq(Q.readNumber("１２"), 12);
  assertEq(Q.readNumber("五"), 5);
  assertEq(Q.readNumber("十"), 10);
  assertEq(Q.readNumber("二十四"), 24);
  assertEq(Q.readNumber("あ"), 0);
});

process.exit(report("指示文からの出題形式の読み取り") ? 1 : 0);
