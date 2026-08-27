/* ══════════════════════════════════════════════════════════════════════════
   vqrevise.cjs — 追加の指示（直し）が、ちゃんと効くか（2026-08-14）

   できること（利用者の依頼）:
     ・問題を消す
     ・特定の問題の内容を変える
     ・特定の問題の形式を変える
     ・問題を足す
     ・初期生成のあとの「やっぱりこうしたい」を反映する

   ここで守りたいこと:
     ① **消してと言われたものだけ**消す。触らなかった問題を巻き込まない
        （直しでは触った問題しか返らないので、残り全部が「削除候補」に見える。
        取り違えると、1 問直しただけで残り 5 問が消える）
     ② 形式のことを書いていないなら、**形式を変えない**
        （実測 2026-08-14:「2問目をもっと難しくして」で 4択 → 穴埋め にされた）
     ③ 「N 択にして」は数を守る（守れないものは受け取らない）
     ④ 「N 問目」を「N 問」と読んで足さない（2026-08-13 の事故の回帰）
   ══════════════════════════════════════════════════════════════════════════ */
const fs = require("fs");
const path = require("path");

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (detail ? "  → " + detail : "")); }
};

const INDEX = require("./vqsrc.cjs").丸ごと();
const WORKER = fs.readFileSync(path.join(__dirname, "server", "src", "worker.js"), "utf8");

/* サーバの整形と検査は **実物を動かして**確かめる（字面の確認では足りない）。
   worker.js は ES モジュールなので、非同期で読み込んでから本体を走らせる。 */
let COERCE, VALIDATE;

/* 画面の差分エンジン（domain/draft.js の applyDiff / diffQuestions）を実際に動かす。
   ここは **事故ったら問題が消える**ところなので、regex ではなく実物で確かめる。 */
const DOMAIN = (function () {
  const g = { console };
  const parts = ["domain/schema.js", "domain/qtypes.js", "domain/qmodel.js", "domain/draft.js"];
  const marks = parts.map((n) => "/* ───────── " + n + " ───────── */");
  /* 読み込む順番は本体と同じ。qtypes を schema より先に読むと壊れるので、
     本体の並び（ファイル内の出現順）をそのまま使う。 */
  const idx = marks.map((m) => INDEX.indexOf(m)).filter((i) => i >= 0).sort((a, b) => a - b);
  const ends = idx.map((i) => {
    const nx = INDEX.indexOf("\n/* ───────── ", i + 10);
    return nx > 0 ? nx : i + 1;
  });
  for (let i = 0; i < idx.length; i++) {
    new Function("globalThis", "with(globalThis){" + INDEX.slice(idx[i], ends[i]) + "}").call(g, g);
  }
  return g.VQ2;
})();

const D = DOMAIN.draft;
const mkQ = (n) => ({
  id: "q" + n, questionNumber: n, type: "multiple_choice_single",
  prompt: "問題 " + n, choices: [{ id: "c1", text: "ア" }, { id: "c2", text: "イ" }],
  correctAnswer: "c1"
});

(async function () {
  const M = await import("file://" + path.join(__dirname, "server", "src", "worker.js"));
  COERCE = M.__testables.aigenCoerceQuestion;
  VALIDATE = M.__testables.aigenValidateOf;

console.log("\n① 消してと言われたものだけ消す（いちばん危ないところ）");
{
  ok("差分エンジンを読み込めた", !!(D && D.applyDiff && D.diffQuestions));

  const cur = [1, 2, 3, 4, 5, 6].map(mkQ);
  /* 直しでは **触った問題だけ**が返る。ここでは q2 を直しただけ。 */
  const proposed = [Object.assign(mkQ(2), { prompt: "問題 2（直した）" })];
  const diff = D.diffQuestions(cur, proposed, { matchByIndex: true });

  const removals = diff.changes.filter((c) => c.kind === "removeCandidate");
  ok("触らなかった 5 問が「削除候補」として出る（前提の確認）",
    removals.length === 5, removals.length + " 件");

  /* 本体と同じ印の付け方（AI が名指しした id だけ requestedDelete）。 */
  diff.changes.forEach((c) => { if (c.questionId === "q3") c.requestedDelete = true; });

  /* 本体の applyAi と同じ選び方を作る。 */
  const asked = diff.changes.filter((c) => c.kind === "removeCandidate" && c.requestedDelete)
    .map((c) => c.questionId);
  const ids = diff.changes.filter((c) => c.kind !== "removeCandidate").map((c) => c.questionId);
  asked.forEach((id) => { if (ids.indexOf(id) < 0) ids.push(id); });
  const r = D.applyDiff(cur, diff, { questionIds: ids, includeRemovals: true });

  const left = r.questions.map((q) => q.id);
  ok("★ q3 だけが消える", left.join(",") === "q1,q2,q4,q5,q6", left.join(","));
  ok("　残りは 5 問", r.questions.length === 5, String(r.questions.length));
  ok("　直した内容は入っている",
    r.questions.find((q) => q.id === "q2").prompt === "問題 2（直した）");

  /* ★ ここが事故のもと。all + includeRemovals にすると全部消える。 */
  const bad = D.applyDiff(cur, diff, { all: true, includeRemovals: true });
  ok("★（確認）all のまま消すと 1 問だけになる＝この形にしてはいけない",
    bad.questions.length === 1, bad.questions.length + " 問");
  ok("　本体は all を id の並びへ落としている",
    /のまま includeRemovals を立ててはいけない/.test(INDEX)
    && /sel = \{ questionIds: ids, includeRemovals: true, fields: sel\.fields \};/.test(INDEX));

  /* 名指しが無ければ、これまでどおり 1 問も消さない。 */
  const diff2 = D.diffQuestions(cur, proposed, { matchByIndex: true });
  const ids2 = diff2.changes.filter((c) => c.kind !== "removeCandidate").map((c) => c.questionId);
  const r2 = D.applyDiff(cur, diff2, { questionIds: ids2, includeRemovals: true });
  ok("名指しが無ければ 1 問も消えない", r2.questions.length === 6, String(r2.questions.length));
}

console.log("\n② 画面の作り（消すのを止めていた所が外れている）");
{
  ok("「自動では消しません」を出さなくなっている",
    INDEX.indexOf("（自動では消しません。一覧から消してください）") < 0);
  ok("消す件数をログに出す", /dels\.length \+ " 問を消します："/.test(INDEX));
  ok("名指しされたものに印を付けている",
    /if \(c\.kind === "removeCandidate" && asked\.indexOf\(c\.questionId\) >= 0\) c\.requestedDelete = true;/.test(INDEX));
  ok("印が付いたものは既定で選ばれる",
    /if \(c\.kind !== "removeCandidate" \|\| c\.requestedDelete\) st\.diffSelection\[c\.questionId\] = true;/.test(INDEX));
  ok("使い終わった控えを消している", /st\.pendingDelete = null;/.test(INDEX));
  /* 見た目でも「消す」と「触っていない」を分ける */
  ok("差分の札を分けている",
    /c\.requestedDelete \? U\.badge\("消す", "warning"\) : U\.badge\("触っていない", "muted"\)/.test(INDEX));
  ok("見出しの数も分けている", /function askedDel\(d\)/.test(INDEX));
}

console.log("\n③ 形式のことを書いていなければ、形式を変えない");
{
  ok("形式の言葉が出てくるかを見ている", /const mentionsFormat = /.test(WORKER));
  ok("　言い方の表（AIGEN_ENGINE_WORDS）を使っている",
    /FMT_WORDS\.some\(\(w\) => instruction\.indexOf\(w\) >= 0\)/.test(WORKER));
  ok("　書かれていなければ元の形式へ戻す",
    /if \(AIGEN_ENGINES\[oe\] && oe !== engineId\) \{ engineId = oe; keptType\+\+; \}/.test(WORKER));
  ok("　戻した数を返している（黙って直さない）", /keptType,/.test(WORKER));
  ok("　指示文でも念を押している", /【形式は変えない】/.test(WORKER));
}

console.log("\n④ 「N 択にして」は数を守る");
{
  ok("指示から選択肢の数を読む", /const wantChoices = aigenChoiceCountIn\(instruction\);/.test(WORKER));
  ok("　数が違うものは受け取らない",
    /if \(wantChoices && engineId === "single_choice"[\s\S]{0,140}wrongChoices\+\+;/.test(WORKER));
  ok("　受け取らなかった数を返している", /wrongChoices,/.test(WORKER));
  ok("　指示文にも数を書いている", /choices は \*\*ちょうど " \+ wantChoices/.test(WORKER));
}

console.log("\n⑤ 「N 問目」を「N 問」と読んで足さない（2026-08-13 の回帰）");
{
  ok("足す言葉があるときだけ足す", /const ADD_RE = /.test(WORKER));
  ok("　id なしは、頼まれていなければ捨てる",
    /if \(!c\.id && !wantsAdd\) continue;/.test(WORKER));
  ok("　落とした数を返している", /droppedAdds/.test(WORKER));
  ok("　指示文で「N 問目」の意味を書いている",
    /「N 問目」「N 番」は、N 番目の問題を指します。作る数ではありません。/.test(WORKER));
}

console.log("\n⑥ プロンプトだけで、直す問題を指定できる");
{
  /* これまでは「この問題だけ」が既定なので、一覧で選んでいないと
     「一覧から選んでください」で止まっていた。指示に番号が書いてあるのに
     選ばせるのは二度手間（2026-08-14 に指摘を受けた）。 */
  const F = DOMAIN.draft.instructionNamesTargets;
  ok("読み取る関数がある", typeof F === "function");
  [
    "3問目を5択にして", "問4の選択肢が変", "2番の答えが違う", "q2だけ直して",
    "1〜3問目を穴埋めにして", "1-3を難しくして", "4問目以降ぜんぶ5択で",
    "最初の問題を簡単にして", "最後の問題の解説を長くして", "上から3つだけ難しく",
    "前半を簡単にして", "後半だけ英語にして", "奇数番を並べ替えに",
    "全部5択にして", "すべてに解説を入れて", "全問に解説つけて",
    "ぜんぶ選択肢5個にして", "どれも簡単すぎ　もっと難しくして", "一律で丁寧語にそろえて",
    "３問目を消して"
  ].forEach((t) => ok("　名指しと読む: " + t, F(t) === true));
  [
    "もっと良くして", "いい感じにして", "日本語が変なとこ直して",
    "簡単すぎるやつ消して", "解説をもっとくわしく", ""
  ].forEach((t) => ok("　名指しではない: " + (t || "（空）"), F(t) === false));

  /* 画面側で、名指しなら止めないこと */
  ok("名指しなら一覧で選ばなくてよい",
    /var named = !ids\.length && D\.instructionNamesTargets\(instruction\);/.test(INDEX));
  ok("　止めるのは名指しも選択も無いときだけ",
    /if \(st\.reviseScope === "question" && !ids\.length && !named\) \{/.test(INDEX));
  ok("　番号で指定できることを案内している",
    /「3 問目を5択にして」のように番号で指定できます/.test(INDEX));
  ok("　何を直すかをログに出す", /"指示に書かれた問題を直します"/.test(INDEX));
  /* 対象はサーバが読む（二重に読んでずれないこと） */
  ok("★ どの id かは画面で決めていない（サーバが読む）",
    /ここでは空のまま渡す/.test(INDEX));
}

console.log("\n⑦ 記号の答え（\"a\" \"ア\" \"①\"）を選択肢の本文へ直す");
{
  /* 実測 2026-08-14: 4択に解説を足しただけの直しで、
     **短答になって答えが "a"** になった。数字は直していたが記号は素通りだった。 */
  /* ★ ここは **実物を動かして**確かめる。正規表現で書き方を見るだけだと、
     字面が合っていても直っていないことがある。 */
  const CH = ["源頼朝", "北条時政", "足利尊氏", "平清盛"];
  const mk = (ans) => ({ id: "q1", type: "single_choice", question: "問",
    choices: CH.slice(), answer: ans, explanation: "解説" });
  const coerced = (ans) => COERCE(mk(ans), "single_choice").answer;

  [["a", 0], ["A", 0], ["Ａ", 0], ["b", 1], ["d", 3],
   ["ア", 0], ["エ", 3], ["あ", 0], ["え", 3],
   ["①", 0], ["④", 3],
   ["(2)", 2], ["2.", 2], ["（３）", 3],
   ["1", 1], ["0", 0]].forEach(([mark, i]) => {
    ok("　" + JSON.stringify(mark) + " → 選択肢 " + (i + 1) + " 番",
      coerced(mark) === CH[i], JSON.stringify(coerced(mark)));
  });
  /* 直したあと、engine の検査を通ること（＝画面が扱える形になっている） */
  ["a", "ア", "①", "(2)"].forEach((mark) => {
    ok("　" + JSON.stringify(mark) + " は検査を通る",
      VALIDATE("single_choice", null, COERCE(mk(mark), "single_choice")) === null);
  });
  /* 選択肢の本文そのままなら、当然そのまま */
  ok("　本文で答えていればそのまま", coerced("足利尊氏") === "足利尊氏");
  /* ★ 選択肢そのものが a / b のとき（つづりの問題）は直さない */
  const spell = COERCE({ id: "q1", type: "single_choice", question: "つづりは？",
    choices: ["a", "b", "c", "d"], answer: "a" }, "single_choice");
  ok("★ 選択肢が a/b のときは直さない（つづりの問題を壊さない）",
    spell.answer === "a" && VALIDATE("single_choice", null, spell) === null,
    JSON.stringify(spell.answer));
  /* 当てはまらない記号は、勝手に決めない */
  ["ケ", "zz", "え え"].forEach((mark) => {
    ok("　当てはまらない " + JSON.stringify(mark) + " は勝手に決めない",
      CH.indexOf(coerced(mark)) < 0, JSON.stringify(coerced(mark)));
  });
}

console.log("\n⑧ 直しにも 形の検査を通す");
{
  /* 初期生成は aigenValidateOf を通しているのに、直しは素通りだった。
     そのため「answer が choices の中に無い」問題が画面へ渡っていた。 */
  ok("検査を通している", /const why = aigenValidateOf\(engineId, null, c\)/.test(WORKER));
  /* 2026-08-14 に足したぶん。**新規生成と同じものを使う**（片方だけ直すと
     作るときは守れるのに直すと崩れる、という食い違いになる）。 */
  ok("★ 字数の注文も検査している", /\|\| aigenLengthIssue\(lengths, c\)/.test(WORKER));
  ok("★ 答えの言語も検査している", /\|\| answerEnIssue\(c\)/.test(WORKER));
  ok("　字数を指示文にも渡している", /aigenLengthNote\(lengths\),/.test(WORKER));
  ok("　答えの言語を指示文にも渡している", /【答えの言語】/.test(WORKER));
  ok("★ 読み取りは新規生成と同じ関数", /const lengths = aigenLengthLimits\(instruction\);/.test(WORKER));
  ok("　通らないものは受け取らない", /if \(why\) \{\n      broken\.push\(why\);\n      continue;/.test(WORKER));
  ok("　何件・なぜ を返している",
    /brokenCount: broken\.length,/.test(WORKER) && /brokenReasons: Array\.from\(new Set\(broken\)\)/.test(WORKER));
}

console.log("\n⑨ 足りないぶんを 1 回だけ言い直す（返り数のブレを減らす）");
{
  const S = M.__testables.reviseStripScope;
  const T = M.__testables.reviseTargetSet;

  /* ── 画面が足す「範囲の行」を切る ──
     切らないと「対象: プリセット全体」の“全体”を毎回拾い、
     「2問目を直して」が全問扱いになる。 */
  ok("範囲の行（全体）を切る", S("2問目を直して\n対象: プリセット全体") === "2問目を直して");
  ok("範囲の行（絞り）を切る",
    S("全部5択に\n対象の問題: q_a, q_b（ここだけを直します）") === "全部5択に");
  ok("★ 1 行だけのときは切らない（本文を消さない）",
    S("対象: プリセット全体") === "対象: プリセット全体");
  ok("★ 途中に同じ言葉があっても、切るのは最終行だけ",
    S("対象: プリセット全体 と書きたい\n対象: プリセット全体") === "対象: プリセット全体 と書きたい");
  ok("範囲の行が無ければ何もしない", S("解説を入れて") === "解説を入れて");

  /* ── 言い直す相手は「あいまいさ 0」のときだけ決める ──
     ★ 番号（3問目）を配列の位置として読まない。画面の表示番号は
       問を消すと 1,2,4,5,6 のように飛ぶので、位置と取り違えると
       **頼んでいない問が書き換わる**（2026-08-14 の検証で指摘）。 */
  const src3 = [{ id: "q_a" }, { id: "q_b" }, { id: "q_c" }];
  const set = (r) => (r ? Array.from(r).join(",") : null);
  ["全部5択にして", "すべてに解説を入れて", "全問に解説つけて", "ぜんぶひらがなに",
   "一律で丁寧語に", "まとめて難しく", "どれも簡単すぎ"].forEach((t) => {
    ok("　「" + t + "」→ 全部が相手", set(T(t, src3, [])) === "q_a,q_b,q_c", String(set(T(t, src3, []))));
  });
  ["2問目を直して", "1〜3問目を5択に", "最初の問題を簡単に", "もっと良くして",
   "解説をくわしく", "q2だけ直して"].forEach((t) => {
    ok("★ 「" + t + "」→ 相手を決めない（番号は解釈しない）",
      T(t, src3, []) === null, String(set(T(t, src3, []))));
  });
  ok("★ 打ち消しなら「全部」と読まない", T("全部は変えないで", src3, []) === null);
  ok("★ 「全問10問にして」は総数の指定（全部ではない）", T("全問10問にして", src3, []) === null);
  ok("選んでいれば、それが相手", set(T("これを直して", src3, ["q_b"])) === "q_b");
  ok("★ 選んでいるときは「全部」もその中に閉じる",
    set(T("全部5択にして", src3, ["q_b"])) === "q_b");
  ok("知らない id は相手にしない", T("これを直して", src3, ["q_zzz"]) === null);
  ok("問題が無ければ相手も無い", T("全部5択にして", [], []) === null);

  /* ── 本体の作り ── */
  ok("何問返すはずかを 数で 言っている",
    /"・\*\*" \+ goal\.size \+ " 問すべて\*\*を questions に入れてください。/.test(WORKER));
  /* 言い直しは **最大 2 回**。1 回では足りない回があったため増やしたが、
     上限は固定で、進まなくなったらそこで止める（呼びすぎない）。 */
  ok("★ 言い直しは最大 2 回まで", /for \(let i = 0; i < 2; i\+\+\) \{/.test(WORKER));
  ok("★ 1 問も増えなければ そこで止める",
    /if \(takenAt\.size === before\) break;/.test(WORKER));
  ok("★ 埋まったら すぐ止める", /if \(!missing\.length\) break;/.test(WORKER));
  ok("★ 足す指示のときは言い直さない（id が無いので相手が決まらない）",
    /if \(wantsAdd\) break;/.test(WORKER));
  /* ══ 「1 問も通らなかったら言い直さない」をやめた（2026-08-14）══════
     実測（dev へ実際に投げて数えた）:
       「答えを全部英語にして」   → 8 件届いたが 8 件とも
         「answer が choices の中に無い」で落ち、**0 問**で返っていた
       「最後の2問を並べ替えにして」→ 2 件届いて 2 件とも落ち、0 問
     どちらも openai/gpt-oss-120b のとき。同じ依頼を qwen は 8/8、
     gemini は 2/2 で通した。**落ちるのはモデルの癖**なので、
     別の提供元へ回せば通る。全部落ちたときこそ言い直す価値がある。

     ★ ただし **AI から 1 件も届いていない**ときは、回しても同じ
       （呼び出しそのものが失敗している）ので、そこは止める。 */
  /* ★ 「1 件も届いていないなら回しても同じ」も **実測で否定された**
     （2026-08-14）。gpt-oss-120b が 113 トークンで打ち切って 0 件を返した回、
     同じ依頼を safeguard-20b と qwen は 8/8 で返した。
     呼べなかったときは、ここへ来る前に AI_FAILED で返している。
     ＝ここへ来る時点で「呼べてはいる」ので、別の提供元へ回す価値がある。 */
  /* ★ 見るのは **言い直しのループの中だけ**。worker.js 全体を見ると、
     まったく別の場所の `if (!questions.length` に当たる（実際に当たった）。 */
  const RETRY_LOOP = (WORKER.match(/for \(let i = 0; i < 2; i\+\+\) \{[\s\S]*?\n  \}\n/) || [""])[0];
  ok("　言い直しのループを切り出せている", RETRY_LOOP.length > 400, "長さ " + RETRY_LOOP.length);
  ok("★ 0 件でも 言い直す（返り数で止めない）",
    !/questions\.length\) break/.test(RETRY_LOOP) && !/rawQs\.length\) break/.test(RETRY_LOOP));
  ok("★ 止まる歯止めは 回数・増加・時間の 3 つで足りている",
    /for \(let i = 0; i < 2; i\+\+\) \{/.test(WORKER)
    && /if \(takenAt\.size === before\) break;/.test(WORKER)
    && /if \(Date\.now\(\) - t0 > 30000\) break;/.test(WORKER));
  ok("★ なぜ受け取れなかったかを 言い直しで伝えている",
    /前回はここが原因で受け取れませんでした/.test(WORKER));
  ok("★ 時間が経っていたら言い直さない（待たせない）",
    /if \(Date\.now\(\) - t0 > 30000\) break;/.test(WORKER));
  /* ★ ここが効き目の芯。実測で外すのは毎回同じモデルだったので、
     同じところへ投げ直しても直らない（受取2 → 言い直しても 4 止まり）。 */
  ok("★ 言い直しは 別の提供元 へ投げる",
    /const others = chain\.filter\(\(p\) => p !== used\);/.test(WORKER)
    && /const prov = others\.length \? others\[i % others\.length\] : used;/.test(WORKER));
  ok("　言い直し先の理由が書いてある", /取りこぼすのはモデルの癖/.test(WORKER));
  ok("★ すでに通ったものは捨てない（今日より少なくならない）",
    /if \(r2\.ok && Array\.isArray\(r2\.questions\)\) \{\n      absorb\(r2\.questions\);/.test(WORKER));
  ok("　言い直しでは 足りない問題だけを見せる",
    /const showList = src\.filter\(\(q\) => missing\.indexOf\(String\(q && q\.id \|\| ""\)\) >= 0\);/.test(WORKER));
  ok("　受け取りは 1 つの関数（歯止めを書き漏らさない）",
    /function absorb\(rawQs\) \{/.test(WORKER) && /absorb\(rawQs\);/.test(WORKER));
  ok("★ 同じ id が 2 回来たら差し替える（増やさない）",
    /if \(c\.id && takenAt\.has\(c\.id\)\) \{ questions\[takenAt\.get\(c\.id\)\] = c; continue; \}/.test(WORKER));
  ok("★ 足すぶん（id なし）は 1 つにまとめない",
    /id なし（足すぶん）は \*\*1 つの箱にまとめない\*\*/.test(WORKER));
  ok("消した問題を「直らなかった」に数えない", /delOk\.indexOf\(id\) < 0/.test(WORKER));
  ok("それでも足りなければ 正直に返す", /missing: stillMissing,/.test(WORKER));
  ok("呼んだ回数をそのまま返す（1 固定ではない）", /aiCalls: rounds,/.test(WORKER));
  ok("★ 枠も呼んだ回数ぶん数える", /aiCalls: rounds, hasFiles: false, deviceKey: dk/.test(WORKER));
  ok("何問を相手にしたかを返す", /targeted: goal \? goal\.size : 0,/.test(WORKER));
}

console.log("\n⑩ 壊していないこと");
{
  ok("渡していない id は消させない", /const delOk = deleted\.filter\(\(id\) => known\.has\(id\)\);/.test(WORKER));
  ok("渡していない id を付けてきたら新規扱い", /c\.id = known\.has\(id\) \? id : "";/.test(WORKER));
  ok("直しも使用量に数えている", /使用量は、直しでも 1 回ぶんとして数える/.test(WORKER));
  ok("対象を絞れる（この問題だけ）", /直してよいのは id が /.test(WORKER));
  /* 差分の適用そのものを壊していないこと（追加・変更） */
  const cur = [1, 2].map(mkQ);
  /* 初期生成の道（matchByIndex なし）。id の無いものは「追加」になる。 */
  const diff = D.diffQuestions(cur, [Object.assign(mkQ(1), { prompt: "変えた" }), Object.assign(mkQ(3), { id: "" })]);
  const r = D.applyDiff(cur, diff, { all: true });
  ok("追加と変更は これまでどおり効く", r.questions.length === 3, String(r.questions.length));
  ok("　変更は入っている", r.questions[0].prompt === "変えた", r.questions[0].prompt);
  ok("　番号も内部 ID も重複していない", r.identity.ok, JSON.stringify(r.identity).slice(0, 80));
}

console.log("\n" + (fail === 0 ? "✅ 全部通りました" : "❌ 落ちています") + "  通過 " + pass + " / 失敗 " + fail);
process.exit(fail === 0 ? 0 : 1);

})().catch((e) => { console.error("落ちました:", e); process.exit(1); });
