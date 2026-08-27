/* ══════════════════════════════════════════════════════════════════════
   プロンプト指示の精度（新規生成 ＋ 追加の指示）の回帰テスト

   2026-08-14 に実測で見つけた外れ方を、二度と戻さないための止め。
   実測は dev へ実際に投げて数えた（diag-acc.cjs / diag-rev.cjs）。
   ここは **AI を呼ばない**。読み取りと決まりの文だけを確かめる。
   ══════════════════════════════════════════════════════════════════════ */
const fs = require("fs");
const path = require("path");
const WORKER = fs.readFileSync(path.join(__dirname, "server/src/worker.js"), "utf8");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (extra ? ("   → " + extra) : "")); }
}

(async () => {
const M = await import("./server/src/worker.js");
const T = M.__testables;

console.log("① 字数の注文を読む（文をまたいでも読む）");
{
  const L = T.aigenLengthLimits;
  ok("「解説は60字以内で8問」→ 解説 60", L("解説は60字以内で8問。生物基礎から。").explanation === 60);
  ok("「問題文を40字以内にして10問」→ 問題文 40", L("問題文を40字以内にして10問。地理から。").question === 40);
  /* ★ ここが 2026-08-14 の外れ。主語と字数が別の文に分かれると読めなかった。
     日本語ではこれがいちばんふつうの書き方（「解説を入れて。ただし40字以内で。」）。 */
  ok("★ 主語が前の文にあっても読む", L("解説を全部に入れて。ただし40字以内で。").explanation === 40,
    JSON.stringify(L("解説を全部に入れて。ただし40字以内で。")));
  ok("★ 主語がどこにも無ければ拾わない（勝手に縛らない）",
    JSON.stringify(L("4択で10問。50字以内で。")) === "{}", JSON.stringify(L("4択で10問。50字以内で。")));
  ok("「問題は50字以内」も問題文として読む", L("解説を入れて10問。問題は50字以内で。").question === 50);
  ok("2 つ書いてあれば 2 つとも読む",
    JSON.stringify(L("選択肢は12字以内で。答えは8字以内で。")) === '{"choice":12,"answer":8}');
}

console.log("\n② 解説の書き方が、字数の注文と食い違わない");
{
  const E = T.aigenExplainNote;
  /* ★ これまでは「60〜160 字で書きます」を **後ろに**置いていたので、
     「60 字以内で」という注文が毎回負けていた（実測: 3 回とも守れず）。 */
  ok("★ 注文があるときは「60〜160 字」と言わない", !/60〜160/.test(E(true, { explanation: 60 })),
    E(true, { explanation: 60 }));
  ok("★ 上限だけでなく下限も言う（短すぎで落ちるのを防ぐ）",
    /36〜60 字/.test(E(true, { explanation: 60 })), E(true, { explanation: 60 }));
  ok("　注文が無ければ これまでどおり", /60〜160 字/.test(E(true, null)));
  ok("　解説が要らなければ 何も言わない", E(false, { explanation: 60 }) === "");
  ok("　短い注文（40字）でも 下限が上限を超えない", (() => {
    const s = E(true, { explanation: 40 });
    const m = s.match(/\*\*(\d+)〜(\d+) 字\*\*/);
    return !!m && Number(m[1]) < Number(m[2]);
  })(), E(true, { explanation: 40 }));
}

console.log("\n③ 解説の下限は、注文があればそちらに従う");
{
  const Q = T.aigenQualityIssue;
  const q = (ex) => ({ question: "これは十分に長い問題文です。", answer: "あ", explanation: ex });
  /* ★ 実測 2026-08-14: 「60 字以内」と頼まれた回で、落とした理由が
       解説が短すぎる 24 件 ／ 解説が 60 字を超えている 19 件
     と **挟み撃ち**になり、8 問頼んで 5 問しか残らなかった。 */
  ok("注文が無ければ 25 字未満は落とす", Q(q("みじかい解説"), "text_input") === "解説が短すぎる");
  ok("★ 40 字以内と頼まれたら 下限は 20 字",
    Q(q("あ".repeat(21)), "text_input", { explanation: 40 }) === null,
    String(Q(q("あ".repeat(21)), "text_input", { explanation: 40 })));
  ok("★ それでも短すぎるものは落とす",
    Q(q("あ".repeat(5)), "text_input", { explanation: 40 }) === "解説が短すぎる");
  ok("　60 字以内なら 下限は 25 字のまま（緩めすぎない）",
    Q(q("あ".repeat(24)), "text_input", { explanation: 60 }) === "解説が短すぎる");
}

console.log("\n④ 「同じ用語を2回使わないで」を読む");
{
  const P = T.aigenParseContract;
  ok("★ 「同じ用語を2回使わないで12問」→ 縛る", P("同じ用語を2回使わないで12問。物理基礎から。").uniqueAnswers === true);
  ok("　「答えが重複しないように」→ 縛る", P("答えが重複しないように10問。").uniqueAnswers === true);
  ok("　「重複なしで」→ 縛る", P("重複なしで10問。").uniqueAnswers === true);
  ok("★ 頼まれていなければ 縛らない（既定は縛らない）",
    P("4択で10問。日本史から。").uniqueAnswers === false);
  /* ○× は答えが 2 通りしか無いので、混ぜると 3 問目から必ずぶつかる。 */
  ok("★ 縛るときは おまかせに ○× を入れない",
    Object.keys(P("同じ用語を2回使わないで30問。").plan).indexOf("true_false") < 0,
    JSON.stringify(P("同じ用語を2回使わないで30問。").plan));
  ok("　名指しなら ○× も作る（縛りはおまかせのときだけ）",
    !!P("○×で10問。重複なしで。").plan.true_false, JSON.stringify(P("○×で10問。重複なしで。").plan));

  const K = T.aigenAnswerKey;
  ok("答えの鍵: 文字列", K({ answer: " 慣性 " }) === "慣性");
  ok("答えの鍵: 配列", K({ answer: ["a", "b"] }) === "a／b");
  ok("答えの鍵: 組み分け（順番がちがっても同じ）",
    K({ answer: { X: ["b", "a"] } }) === K({ answer: { X: ["a", "b"] } }));
  ok("答えの鍵: 空なら空", K({ answer: "" }) === "");
}
{
  ok("★ 受け取りでも止めている（形式をまたいで見る）",
    /contract\.uniqueAnswers && id !== "true_false"/.test(WORKER));
  ok("　止めた理由を 分けて数えている", /rejectReasons\[dupAns \? "答えが同じ" : "同じ問題"\]/.test(WORKER));
  ok("　すでに使った答えを AI へ渡している", /usedAnswers: contract\.uniqueAnswers/.test(WORKER));
}

console.log("\n⑤ 「最後のN問だけM択」を読んで、分けて作る");
{
  const P = T.aigenParseContract;
  const c = P("5択で10問。ただし最後の2問だけ3択で。化学基礎から。");
  ok("★ 総数は 10（「2問」を総数と読まない）", c.count === 10, "count=" + c.count);
  ok("★ 後ろの 2 問を 3 択と読む",
    !!c.tail && c.tail.at === "last" && c.tail.n === 2 && c.tail.choices === 3, JSON.stringify(c.tail));
  const c2 = P("最初の3問は2択で、5択で12問。");
  ok("　「最初の3問」も読む",
    !!c2.tail && c2.tail.at === "first" && c2.tail.n === 3 && c2.tail.choices === 2, JSON.stringify(c2.tail));
  ok("　ふつうの依頼には付かない", P("5択で10問。化学基礎から。").tail === null);
  /* 4 択だけの依頼でないと、どれが「最後の N 問」か決まらない。 */
  ok("★ ほかの形式が混ざっていたら使わない",
    P("5択で6問と穴埋め4問。最後の2問だけ3択で。").tail === null,
    JSON.stringify(P("5択で6問と穴埋め4問。最後の2問だけ3択で。").tail));
  ok("★ 全部が後ろ側になる書き方は使わない", P("3択で2問。最後の2問だけ3択で。").tail === null);
}
{
  ok("分けて作る道がある", /async function aigenGenerateAll\(/.test(WORKER));
  ok("★ 呼び出し口が 2 つとも 分ける道を通っている",
    (WORKER.match(/await aigenGenerateAll\(env, contract/g) || []).length === 2);
  ok("★ 後ろを作るとき 前に作ったものを見せている（同じ問題を並べない）",
    /avoidSeed: \(o\.avoidSeed \|\| \[\]\)\.concat\(seed \|\| \[\]\)/.test(WORKER));
  ok("★ 足りなければ もう一度だけ作り足す", /const c2nd = Object\.assign\(\{\}, c, \{ plan: \{ single_choice: c\.count - got \}/.test(WORKER));
  ok("　番号を振り直している（同じ id を並べない）",
    /questions\.forEach\(\(q, i\) => \{ q\.id = String\(q\.type \|\| "q"\) \+ "-" \+ \(i \+ 1\); \}\);/.test(WORKER));
  ok("　呼んだ回数を 足し合わせている（隠さない）", /aiCalls: add\("aiCalls"\)/.test(WORKER));
}

console.log("\n⑥ グラフ（chart_read）が 0 問になっていた原因");
{
  const E = T.AIGEN_ENGINES.chart_read;
  /* 実測 2026-08-14（/api/ai/probe から同じ依頼を繰り返して数えた）:
       gpt-oss-20b   0/25 ・ gpt-oss-120b 0/27 ・ safeguard-20b 0/9
       llama-3.3-70b 9/0（下の決まりのとき）
     gpt-oss 系は values のカンマを落として [120,180,150] を [120180150] と書く。 */
  ok("★ 書けるモデルに絞っている",
    Array.isArray(E.groqModels) && E.groqModels.indexOf("llama-3.3-70b-versatile") >= 0,
    JSON.stringify(E.groqModels));
  ok("★ 書けないモデルを入れていない",
    (E.groqModels || []).every((m) => !/gpt-oss/.test(m)), JSON.stringify(E.groqModels));
  /* 「必ず数値」の 5 文字があるだけで llama も壊れた（あり 0/9 → なし 9/9）。 */
  ok("★ 決まりに「必ず数値」と書いていない", !/必ず数値/.test(E.rule), E.rule.slice(0, 80));
  ok("　見本には カンマ区切りの並びが入っている", /"values":\[120,180,150\]/.test(E.shape));
  ok("★ 指定があれば そのモデルだけで回す",
    /const gm = \(Array\.isArray\(p\.groqModels\) && p\.groqModels\.length\)/.test(WORKER));
  ok("　まとめ頼みでも 絞りを引き継ぐ", /const groqModels = \(\(\) => \{/.test(WORKER));
  ok("　1 形式の依頼でも 絞りを渡している", /groqModels: eng\.groqModels \|\| null/.test(WORKER));
}

console.log("\n⑦ 追加の指示：「N問目」を 画面の番号から引く");
{
  const N = T.reviseNumberSet;
  const src = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ id: "q" + n, number: n }));
  const set = (r) => (r ? Array.from(r).sort().join(",") : null);
  ok("★ 「2問目と5問目」→ その 2 つ", set(N("2問目と5問目を、もっと難しくして", src)) === "q2,q5");
  ok("　「1〜3問目」→ 3 つ", set(N("1〜3問目を5択に", src)) === "q1,q2,q3");
  ok("　「最後の2問」→ 後ろの 2 つ", set(N("最後の2問を並べ替えにして", src)) === "q7,q8");
  ok("　「最初の問題」→ 先頭 1 つ", set(N("最初の問題を簡単に", src)) === "q1");
  ok("★ 「2問足して」は 位置ではない（足す数）", N("2問足して", src) === null);
  ok("★ 「10問にして」は 位置ではない（総数）", N("10問にして", src) === null);
  /* ★ ここが芯。**配列の位置では読まない。** 番号は画面が送ってくる
     number とだけ突き合わせる。飛び番でも取り違えない。 */
  const skip = [{ id: "a", number: 1 }, { id: "b", number: 2 }, { id: "c", number: 4 }];
  ok("★ 番号が飛んでいても 番号で引く（位置ではない）", set(N("4問目を直して", skip)) === "c");
  ok("★ 無い番号は 相手にしない", N("9問目を直して", skip) === null);
  ok("★ 番号が送られてこなければ 相手を決めない（これまでどおり）",
    T.reviseTargetSet("2問目を直して", [{ id: "q_a" }, { id: "q_b" }], []) === null);

  /* ★ 直しも ひらがなで打たれる（「3もんめけして」）。新規生成だけ
     読めるようにしても、直しで読めなければ食い違う。 */
  ok("★ 「3もんめけして」→ 3 番目", set(N("3もんめけして", src)) === "q3");
  ok("　「1もんめと4もんめ」→ 2 つ", set(N("1もんめと4もんめ、むずかしく", src)) === "q1,q4");
  ok("　「さいごの2もん」→ 後ろの 2 つ", set(N("さいごの2もんをならべかえに", src)) === "q7,q8");
  ok("　「さいしょの3もん」→ 先頭の 3 つ", set(N("さいしょの3もんをやさしく", src)) === "q1,q2,q3");
  ok("★ 「2もん足して」は 位置ではない（「もん」だけでは読まない）",
    N("2もん足して", src) === null, String(set(N("2もん足して", src))));
  ok("　「ぜんぶ5たくで」は 番号ではない（「全部」として読む側の仕事）",
    N("ぜんぶ5たくで", src) === null);
}
{
  ok("★ 決まった相手を id で名指ししている",
    /const named = only\.length \? only/.test(WORKER)
    && /goal && goal\.size < src\.length \? Array\.from\(goal\) : \[\]/.test(WORKER));
  ok("　番号と id の対応表を AI へ渡している", /番号と id の対応は次のとおりです/.test(WORKER));
  /* ══ 変える先の形式の 決まりと形（2026-08-14）════════════════════
     実測: 「最後の2問を並べ替えにして」が 3 回中 2 回落ちていた。
     理由は「items が 3 個未満」「札が記号だけ」＝ **並べ替えの形に
     なっていない**。直しには形式の **id 一覧しか渡していなかった**。
     新規生成と同じ決まり（aigenRuleOf）と見本（aigenShapeOf）を渡したら
     3/3 になった。片方の口だけ直すと、こういう食い違いが残る。 */
  ok("★ 変える先の形式の 決まりと見本を渡している",
    /【変える先の形式の 決まりと形】/.test(WORKER)
    && /aigenShapeOf\(id, sp\)/.test(WORKER) && /aigenRuleOf\(id, sp\)/.test(WORKER));
  ok("★ 「5択にして」なら 決まりも 5 個に差し替える",
    /id === "single_choice" && wantChoices\) \? aigenChoiceSpec\(wantChoices\)/.test(WORKER));
  ok("　渡すのは 名指しされた形式だけ（指示が埋もれないように）",
    /namedTypes\.slice\(0, 4\)/.test(WORKER));
  ok("　「同じ用語を2回使わない」も 直しへ渡している",
    /uniqueAnswers \? "【答えの重複】/.test(WORKER));
}

console.log("\n⑧ 雑な書き方でも読める（ふだん人が打つとおりに）");
{
  const P = T.aigenParseContract;
  const n = (t) => P(t).count;
  const plan = (t) => P(t).plan;
  /* ══ 実測 2026-08-14 ═══════════════════════════════════════════════
     整った文しか測っていなかったので、雑な書き方は **軒並み外れて**いた。
     数を読むところが `\d+ 問` しか見ておらず、形式の言葉も漢字だけ。
     AI を呼ぶ前の読み取りで落ちていたので、何を作っても直らない。 */
  ok("★ 「英単語20こ」→ 20 問", n("英単語20こ") === 20, "count=" + n("英単語20こ"));
  ok("★ 「かんじのよみ 15もん」→ 15 問", n("かんじのよみ 15もん") === 15, "count=" + n("かんじのよみ 15もん"));
  ok("　「10題」も読む", n("日本史 10題") === 10, "count=" + n("日本史 10題"));
  ok("　全角の数字も読む", n("数学 二次関数 １０問") === 10, "count=" + n("数学 二次関数 １０問"));
  ok("　「20問くらい」も読む", n("化学　テスト対策　20問くらい") === 20);
  ok("★ 「4たく5もん」→ 4択 5 問",
    n("4たく5もん") === 5 && plan("4たく5もん").single_choice === 5,
    "count=" + n("4たく5もん") + " " + JSON.stringify(plan("4たく5もん")));
  ok("★ 「ならべかえ 5問」→ 並べ替え", !!plan("ならべかえ 5問 英語").reorder,
    JSON.stringify(plan("ならべかえ 5問 英語")));
  ok("　「あなうめで10問」→ 穴埋め", !!plan("あなうめで10問").fill_blank);
  ok("　「まるばつ8問」→ ○×", !!plan("まるばつ8問").true_false);
  /* ★ 「こ」「もん」は語の一部にもなる。数と読み違えないこと。 */
  ok("★ 「そこの問題を直して」の「こ」を数と読まない", n("そこの問題を直して") === 10,
    "count=" + n("そこの問題を直して"));
  ok("★ 「もんだい」の「もん」を数と読まない", n("むずかしいもんだいを12問") === 12,
    "count=" + n("むずかしいもんだいを12問"));

  /* 「N 問ずつ」は **形式ごとの数**。総数を割ってはいけない。 */
  const each = plan("問題を10問ずつ、4択と穴埋めで。");
  ok("★ 「10問ずつ、4択と穴埋めで」→ それぞれ 10 問（計 20）",
    each.single_choice === 10 && each.fill_blank === 10, JSON.stringify(each));
  const each2 = plan("4択と穴埋めをそれぞれ8問。");
  ok("　「それぞれ8問」も同じ", each2.single_choice === 8 && each2.fill_blank === 8, JSON.stringify(each2));
  ok("★ おまかせのときは「ずつ」を使わない（どの形式にかかるか決まらない）",
    P("10問ずつ作って。").count === 10, "count=" + P("10問ずつ作って。").count);
}

console.log("\n⑨ 作りたいのか、話したいのか（読んで判断する）");
{
  /* ══ 実測 2026-08-14 ═══════════════════════════════════════════════
     ここまで LUMI は問題を作ることしかできず、「こんにちは」でも
     「あああああ」でも **数学の問題が 10 問**できていた。

     ★ 見分けは **語の一覧で決め打ちしない。** 「この言葉が入っていたら
       会話」という作りは、必ず言い漏らすし、ふつうの依頼まで会話に取る。
       書かれたものを読んで判断する（＝ AI に読ませる）。
     ★ ただし **迷ったときだけ**読ませる。形式や数が読み取れていれば、
       作るつもりははっきりしているので聞かない（速さを落とさない）。 */
  ok("★ 読んで判断する道がある", /async function aigenIntent\(env, text, history\)/.test(WORKER));
  ok("★ 語の一覧で決め打ちしていない",
    !/AIGEN_CHAT_HELLO_RE/.test(WORKER) && !/function aigenLooksChat/.test(WORKER)
    && !/function aigenNonsense/.test(WORKER));
  ok("★ 聞くのは 迷ったときだけ（形式や数が読めていれば聞かない）",
    /const 迷う = !body\?\.plan && !Array\.isArray\(body\?\.questionTypes\) && !hasDocs/.test(WORKER)
    && /contract\.state === "ambiguous"/.test(WORKER)
    && /!\/\\d\/\.test\(String\(prompt \|\| ""\)\)/.test(WORKER));
  ok("　資料が付いているときは 聞かない（作るつもりがはっきりしている）",
    /const hasDocs = \(Array\.isArray\(body\?\.files\)/.test(WORKER));
  ok("★ 読めなかったときは これまでどおり作る（既定を変えない）",
    /return \{ ok: false, intent: "make", reply: "", prompt: "", model: \(last && last\.model\) \|\| "" \};/.test(WORKER));
  ok("★ 会話で返すときは 問題を作らない",
    /status: "chat", message: it\.reply,\n        contract: null, questions: \[\], made: 0, planned: 0,/.test(WORKER));
  ok("　会話も 1 回ぶんとして 枠へ積んでいる（隠さない）",
    /aiCalls: 1, hasFiles: false, deviceKey: dk \}\)\)\.catch/.test(WORKER));
  ok("　できないことは できないと言わせている", /作り話をしません/.test(WORKER));
  /* 作りたそうなときに、そのまま打てる形を見せる（会話で迷わせない）。 */
  ok("　作りに行く条件を 例つきで示している",
    /例:「日本史の問題つくって」は、それだけで作りに行きます/.test(WORKER));
  ok("　打ち間違いは 勝手に題材を決めずに聞き返させている",
    /勝手に題材を決めて作らないこと/.test(WORKER));
  ok("　生のままの返事を持ち帰れる（JSON でないものを受け取るため）",
    /text: String\(text \|\| ""\)\.slice\(0, 4000\)/.test(WORKER));

  /* ══ 会話は **やりとりの続き**として読む（2026-08-14）════════════════
     1 発ごとに見分けると、こうなる（利用者の指摘）:
       「テスト苦手」→ LUMI「何の科目？」→「英語」→ **いきなり作り始める**
     科目を答えただけなのに作問の合図に見えるため。やりとりを渡して直した。

     ★ 決め手は「頼まれたか」。**題材が分かるだけでは足りない。**
       ①作ってほしいと頼まれている ②何について作るか分かる の両方。
       あなたの質問に答えただけの一言は ① にならない。
     実測: 直す前は「英語」で作り始めた。直したあと 3 回とも 10〜11/11。 */
  ok("★ やりとりを受け取っている", /const history = Array\.isArray\(body\?\.history\)/.test(WORKER));
  ok("★ やりとりを AI へ見せている", /【これまでのやりとり】/.test(WORKER));
  ok("★ 決め手は「頼まれたか」（題材が分かるだけでは作らない）",
    /\*\*作ってほしいと頼まれている\*\*/.test(WORKER)
    && /あなたの質問に答えただけの一言は、①ではありません/.test(WORKER));
  ok("★ 質問への答えで作り始めない（実際に起きた例を書いてある）",
    /テストが苦手.*何の科目.*英語/s.test(WORKER));
  ok("★ 作ると決めたら やりとりから依頼文を組み立てる（「20問」だけでは作れない）",
    /やりとり全体から作問の依頼文を組み立てて/.test(WORKER)
    && /prompt: String\(\(o && o\.prompt\) \|\| ""\)\.trim\(\)/.test(WORKER));
  ok("★ やりとりの途中では 近道を使わない",
    /if \(!history\.length && \(c\.state !== "ambiguous" \|\| \/\\d\/\.test\(text\)\)\)/.test(WORKER));
  ok("　①②がそろえば 問題数や形式は聞き返さない",
    /問題数や形式は聞き返しません/.test(WORKER));
  ok("　見分けの口がある", /path === "\/api\/aigen\/intent"/.test(WORKER)
    && /async function handleAigenIntent/.test(WORKER));
}
{
  const CLIENT = fs.readFileSync(path.join(__dirname, "client/index.html"), "utf8");
  ok("画面: 見分けの口を呼ぶ道がある", /function askIntent\(text, hasFiles, history\)/.test(CLIENT));
  ok("★ 画面: やりとりを持って渡している",
    /history: \(Array\.isArray\(history\) \? history : \[\]\)\.slice\(-10\)/.test(CLIENT)
    && /GA\.askIntent\(instruction, \(st\.attachments \|\| \[\]\)\.length > 0, st\.talk\)/.test(CLIENT));
  ok("★ 画面: 話しかけなら 問題を作らずに返事を出す",
    /if \(r && r\.intent === "talk" && r\.reply\) \{[\s\S]{0,120}logAdd\("chat", r\.reply\);/.test(CLIENT));
  ok("★ 画面: 作ると決まったら 組み立てた依頼文で作る",
    /if \(r && r\.prompt\) st\.autoInstruction = r\.prompt;/.test(CLIENT));
  ok("　画面: 作り始めたら やりとりを区切る",
    /st\.talk = \[\];\n          \} catch \(e\) \{/.test(CLIENT));
  ok("　画面: 直しのときは 見分けを通さない", /if \(kind === "generate" && !skipIntent/.test(CLIENT));
  /* ★ ここが芯。一度これを外していて、**生成そのものが止まった**。
     返事が来なくても・例外が出ても・つながらなくても、必ず作りに行く。 */
  ok("★ 画面: 見分けで手を止めない（3 つの逃げ道）",
    /var guard = root\.setTimeout\(goMake, 5000\);/.test(CLIENT)
    && /\} catch \(e\) \{ \/\* 何があっても下で作りに行く \*\/ \}/.test(CLIENT)
    && /\}, function \(\) \{ root\.clearTimeout\(guard\); goMake\(\); \}\);/.test(CLIENT));
  ok("　画面: 会話として出す種類がある", /chat: \{ kind: "assistant", status: "done" \}/.test(CLIENT));
}

console.log("\n⑩ 壊していないこと");
{
  const P = T.aigenParseContract;
  ok("ふつうの依頼は これまでどおり",
    JSON.stringify(P("4択で10問。日本史から。").plan) === '{"single_choice":10}');
  /* ★ 鍵の並び順は見ない（読み取った順で変わる。中身だけが大事）。 */
  const same = (o, e) => Object.keys(e).length === Object.keys(o).length
    && Object.keys(e).every((k) => o[k] === e[k]);
  ok("内訳の依頼も これまでどおり",
    same(P("4択5問、穴埋め5問、並べ替え5問。").plan,
      { single_choice: 5, fill_blank: 5, reorder: 5 }),
    JSON.stringify(P("4択5問、穴埋め5問、並べ替え5問。").plan));
  ok("おまかせは 8 形式から散らす", P("10問つくって。").allowed.length === 8);
  ok("矛盾は これまでどおり止める", P("4択で10問。ただし4択は禁止。").state === "contradictory");
  ok("字数の注文が無ければ 何も足さない", T.aigenLengthNote({}) === "");
  ok("確かめの一覧も 注文が無ければ 空", T.aigenLengthCheckNote({}) === "");
  ok("確かめの一覧に 字数が入る", /解説が 60 字以内/.test(T.aigenLengthCheckNote({ explanation: 60 })));
}

console.log("\n" + (fail ? "❌ 失敗あり" : "✅ 全部通りました")
  + "  通過 " + pass + " / 失敗 " + fail);
process.exit(fail ? 1 : 0);
})();
