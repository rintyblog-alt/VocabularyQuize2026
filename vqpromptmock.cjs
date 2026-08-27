/* 資料なし（指示だけ）で Quick Mock を回せるか、画面側の結線を見る（ブラウザ不要）。

   これまでの止まり方:
     資料が 0 件だと runGenerate が NO_SOURCE で止め、
     「使用する資料がありません。資料を追加するか、除外した資料を戻してください。」
     としか言わなかった。

   ここで確かめるのは
     ・その止め方が無くなっていること
     ・代わりに「何を出題するか」が空のときだけ止めること
     ・資料 0 件のときは sourceOnly / requireEvidence を立てないこと
     ・promptOnly をサーバへ渡していること
     ・保存する sourceMode が open になること
     ・不足の言い方が資料なし用に分かれていること

   実行: node vqpromptmock.cjs
*/
const fs = require("node:fs");

let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  NG   " + name); }
};
const section = (t) => console.log("\n== " + t + " ==");

const qm = fs.readFileSync("client/v2/ui/quick-mock.js", "utf8");
const ai = fs.readFileSync("client/v2/ui/ai.js", "utf8");
const built = fs.readFileSync("client/index.html", "utf8");

section("資料 0 件で止めない");
{
  /* 経緯の説明はコメントに残してよい。動く形で残っていないことを見る。 */
  ok("旧 NO_SOURCE の止め方が無い",
    !/code: "NO_SOURCE"/.test(qm) && !/"使用する資料がありません/.test(qm));
  ok("資料 0 件を prompt モードとして持つ", /var promptOnly = !sel\.included\.length;/.test(qm));
  ok("何を出題するかが空のときだけ止める", /NO_TOPIC/.test(qm));
  ok("止めるのは指示も科目も試験名も空のときだけ",
    /!st\.instruction\.trim\(\) && !st\.settings\.subject && !st\.settings\.title/.test(qm));
  ok("止めるときは書き方の例を出す", /高校日本史・明治維新の要点から/.test(qm));
  ok("構成案でも同じ判断をする", /var bpPromptOnly = !bpSel\.included\.length;/.test(qm));
}

section("資料が無いときは資料限定にしない");
{
  ok("生成で sourceOnly を立てない", /sourceOnly: !promptOnly && !st\.settings\.allowExternalKnowledge/.test(qm));
  ok("生成で requireEvidence を立てない", /requireEvidence: !promptOnly && !st\.settings\.allowExternalKnowledge/.test(qm));
  ok("構成案でも sourceOnly を立てない", /sourceOnly: !bpPromptOnly && !st\.settings\.allowExternalKnowledge/.test(qm));
  ok("判断はひとつの関数にまとめてある", /function sourceOnlyNow\(\)/.test(qm));
  ok("出典必須も同じ扱い", /function requireSourcesNow\(\)/.test(qm));
  ok("設定そのものは書き換えない",
    /設定はそのまま残します/.test(qm) && !/st\.settings\.allowExternalKnowledge = true/.test(qm));
  ok("作り足しでも同じ判断を使う", /requireEvidence: sourceOnlyNow\(\)/.test(qm));
  ok("不備の補完でも同じ判断を使う", /sourceOnly: sourceOnlyNow\(\)/.test(qm));
  ok("資料限定の確認（⑨）は資料があるときだけ", /if \(sourceOnlyNow\(\)\) \{/.test(qm));
}

section("サーバへ渡す");
{
  ok("生成で promptOnly を渡す", /promptOnly: promptOnly/.test(qm));
  ok("作り足しでも渡す", /promptOnly: isPromptOnly\(\)/.test(qm));
  ok("AI 層が options へ載せる", /req\.options\.promptOnly = true/.test(ai));
  ok("generateMock が受け取る", /promptOnly: o\.promptOnly/.test(ai));
  ok("ビルドへ入っている", /req\.options\.promptOnly = true/.test(built));
}

section("指示文（無い資料を指させない）");
{
  ok("資料の指示を出し分ける", /function buildInstruction\(promptOnly\)/.test(qm));
  ok("資料なしでは出典を書かせない", /出典・ページ番号は書かないでください/.test(qm));
  ok("資料なしでは作った固有名詞を禁じる", /作った固有名詞や年号で問題を作ってはいけません/.test(qm));
  ok("必須項目から出典の行を外した版がある", /MUST_HAVE_PROMPT/.test(qm));
  ok("その版に「根拠にした資料の箇所」が無い",
    (qm.split("MUST_HAVE_PROMPT")[1] || "").split("].join")[0].indexOf("根拠にした資料の箇所") < 0);
}

section("保存する形");
{
  ok("資料なしは open として保存する", /isPromptOnly\(\) \? "open"/.test(qm));
  ok("資料ありはこれまでどおり",
    /st\.settings\.allowExternalKnowledge \? "source-preferred" : "source-only"/.test(qm));
  const schema = fs.readFileSync("client/v2/domain/schema.js", "utf8");
  ok("open は保存できる値", /"source-only", "source-preferred", "open"/.test(schema));
}

section("画面の表示");
{
  ok("資料が任意だと書く", /資料は任意です。無いときは、上の指示だけで作ります/.test(qm));
  ok("出典が付かないことを先に言う", /出典は付きません/.test(qm));
  ok("効かない設定は押せなくする", /\(promptOnly \? " disabled" : ""\)/.test(qm));
  ok("押せない理由を書く", /根拠にする資料も、指せる出典もありません/.test(qm));
}

section("足りないときの言い方");
{
  const g = { VQ2: {} };
  new Function("globalThis", "window", fs.readFileSync("client/v2/domain/shortfall.js", "utf8"))(g, g);
  const SF = g.VQ2.shortfall;

  const p = SF.describe({ code: "insufficient_topics", availableCount: 12, shortfall: 38,
                          requested: 50, promptOnly: true });
  ok("資料なしと分かる", p.promptOnly === true);
  ok("見出しが資料を持ち出さない", !/資料/.test(p.title));
  ok("理由が資料を持ち出さない", !/資料/.test(p.why));
  ok("行の見出しが「ご指示から作れる数」", p.rows[1].label === "ご指示から作れる数");
  ok("資料を足す案は残す（実際に効くので）", p.canAddSources === true);

  const s = SF.describe({ code: "insufficient_topics", availableCount: 12, shortfall: 38,
                          requested: 50 });
  ok("資料ありの文言は変わっていない", /資料の論点が足りません/.test(s.title));
  ok("資料ありの行の見出しも変わっていない", s.rows[1].label === "この資料で作れる数");

  const d = SF.describe({ code: "duplicate_only", availableCount: 20, shortfall: 5,
                          requested: 25, promptOnly: true });
  ok("重複のときは形式を広げる案が出る", d.canWidenTypes === true);
  ok("資料なしでも数合わせを勧めない",
    !/言い換え|とりあえず|適当|一般知識/.test(d.title + d.why + d.hint));

  const u = SF.describe({ code: "なにか知らない理由", availableCount: 1, shortfall: 9,
                          requested: 10, promptOnly: true });
  ok("知らない理由でも壊れない", u.rows.length === 4 && u.actions.length >= 2);
  ok("知らない理由でも資料を持ち出さない", !/この資料/.test(u.why));
}

console.log("\n合格 " + pass + " / 不合格 " + fail);
process.exit(fail ? 1 : 0);
