#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqchoice.cjs — 選択肢の 手ごたえ（2026-08-31・訴え）。

   訴え:「どの 教科も そうなんだけど、選択肢が 短すぎる。
         特に 難易度を 難しいに してるのに 選択肢が すぐ 分かっちゃう くらい 簡単。
         わかりやすい。消去法で いけちゃうから」

   ★ 直す前の 作り（コードを 読んで 分かった こと）:
     ・**字数の 下限を どこにも 言って いなかった。**
       上限（choice: N 字以内）は 読む のに 下限は 無い。
       AI は 短く 書く ほうが 楽なので、必ず 短く なる。
     ・「紛らわしく」とは 書いて いたが **測れる 決まりが 無かった**。
       「長さを そろえる」だけでは、4 つとも 短ければ そろって しまう。
     ・難しさ（level）が **選択肢の 作りに 一度も 効いて いなかった**。

   使い方:
     node vqchoice.cjs        … 決まりだけ（AI なし）
     node vqchoice.cjs --実   … 実際に 作らせて 字数を 数える
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs");
const path = require("path");
const BASE = process.env.VQ_API || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
const 実 = process.argv.indexOf("--実") >= 0;
if (実 && !/-dev\.|127\.0\.0\.1|localhost/.test(BASE)) { console.error("本番では 実行しません。"); process.exit(2); }
let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 220) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 340) : "")); }
};
const SRC = fs.readFileSync(path.join(__dirname, "server/src/worker.js"), "utf8");
function 塊(名前) {
  const 頭 = SRC.indexOf("function " + 名前 + "(");
  let i = SRC.indexOf("{", 頭), d = 0, end = -1;
  for (; i < SRC.length; i++) { const c = SRC[i]; if (c === "{") d++; else if (c === "}") { d--; if (!d) { end = i + 1; break; } } }
  return SRC.slice(頭, end);
}
// eslint-disable-next-line no-new-func
const 深 = new Function(塊("aigenChoiceDepth") + "\nreturn aigenChoiceDepth;")();
// eslint-disable-next-line no-new-func
const 注 = new Function(塊("aigenChoiceDepth") + "\n" + 塊("aigenChoiceNote") + "\nreturn aigenChoiceNote;")();

節("① 難しさで 長さの 決まりが 変わる");
{
  const y = 深({ level: "やさしい" }), h = 深({ level: "標準" }), m = 深({ level: "難しい" });
  見(y.min === 20 && y.max === 45, "やさしい 20〜45 字", y);
  見(h.min === 30 && h.max === 65, "標準 30〜65 字", h);
  見(m.min === 45 && m.max === 90, "★ 難しい 45〜90 字", m);
  見(y.min < h.min && h.min < m.min, "★ 難しいほど 長い", [y.min, h.min, m.min]);
  見(m.近 > y.近, "★ 難しいほど **紛らわしい 誤答**を 多く 求める", [y.近, m.近]);
  見(深({}).min === 30, "書いて なければ 標準");
  見(深({ topic: "むずかしめで お願い" }).min === 45, "頼み文の 言い方でも 読む");
}

節("② 言いかた");
{
  const t = 注({ exam: true, level: "難しい" });
  見(/45〜90 字で 書いて ください/.test(t), "★ **下限が 数で** 入る（直す前は 下限が 無かった）");
  見(/単語や 短い 語句 だけの 選択肢は だめ/.test(t), "★ 単語だけを 禁じる");
  見(/悪い例/.test(t) && /よい例/.test(t), "★ 悪い例・よい例を 見せる");
  見(/消去法で 消せる 選択肢を 作らない/.test(t), "★★ **消去法を 潰す**（訴えの とおり）");
  見(/1 つだけ 読んで 正誤が 決まる 問題に しない/.test(t), "★ 見比べないと 決まらない ように する");
  見(/明らかに おかしい 行動/.test(t), "極端な 誤答を 禁じる");
  見(/2 つは、正解と 同じ 結論/.test(t), "★ 難しい: 結論は 同じで **理由だけ** 違う 誤答");
  見(/正解も \*\*言い切らない\*\*/.test(t), "★ 難しい: 語尾でも 見分けが つかない ように する");
  見(/選択肢 1 つずつ/.test(t), "解説は 選択肢ごとに 書かせる");
  const e = 注({ exam: true, level: "やさしい" });
  見(!/2 つは、正解と 同じ 結論/.test(e), "やさしい では そこまで 求めない");
  見(/20〜45 字/.test(e), "やさしい の 数が 入る");
}

節("③ 受け取る 側でも 落とす");
{
  見(/選択肢が 短すぎる ものは 受け取らない/.test(SRC), "★ **数えて 落とす**（頼むだけに しない）");
  見(/rejectReasons\["選択肢が短い"\]/.test(SRC), "落とした 理由が 記録に 残る");
  見(/深\.min \* 0\.6/.test(SRC), "★ 落としすぎない（下限の 6 割を 切った ものだけ）");
  見(/1 つ 1 つを " \+ 深\.min \+ "〜" \+ 深\.max \+ " 字の 文/.test(SRC),
    "★ 落とした ときに **どう 直すか**を 返す");
  見((SRC.match(/^\s+aigenChoiceNote\(o\),$/gm) || []).length === 2,
    "★ 2 つの 頼み文 とも（まとめ／形式ごと）",
    (SRC.match(/^\s+aigenChoiceNote\(o\),$/gm) || []).length);
}

/* ══ ★ プリセット（試験で ない 依頼）には かけない ═══════════════════
   訴え（2026-08-31）:「プリセットAIで 自動生成が できないんだが？」
   入れた 当日は どの 依頼にも 効かせて いた。プリセットの ふつうの 4択は
   「東京」「大阪」の ような 語 なので、
     ・頼み文  … 「1 つ 1 つを 30 字 以上の 文に」
     ・受け取り… 平均が 18 字 未満なら 捨てる
   の 両方に 引っかかり、**1 問も 通らなく なって いた**。 */
節("★ プリセット（試験で ない）には かけない");
{
  見(注({ level: "難しい" }) === "", "★ 試験で ない ときは 頼み文に **入れない**");
  見(注({ exam: true, level: "難しい" }).length > 100, "試験の ときは これまでどおり 入る");
  見(/if \(o\.exam && Array\.isArray\(q\.choices\)/.test(SRC),
    "★ **数えて 落とす 関所も 試験の ときだけ**（プリセットは 素通り）");
}

async function 実測() {
  節("④ 実際に 作らせて 数える（" + BASE + "）");
  const api = async (m, p, b, t) => {
    const h = { "Content-Type": "application/json" };
    if (t) h.Authorization = "Bearer " + t;
    const r = await fetch(BASE + p, { method: m, headers: h, body: b ? JSON.stringify(b) : undefined });
    let j = null; try { j = await r.json(); } catch (e) {}
    return { status: r.status, data: j };
  };
  const nick = "ch" + Date.now().toString(36).slice(-6);
  let reg = await api("POST", "/api/auth/register",
    { gradePrefix: "H1", nickname: nick, password: "DevGen#2026a", tosAccepted: true, tosVersion: "1" });
  let token = (reg.data && reg.data.token) || "";
  if (!token) {
    const a = await api("POST", "/api/auth/register/start",
      { email: nick + "@gmail.com", gradePrefix: "H1", nickname: nick, password: "DevGen#2026a" });
    const b = await api("POST", "/api/auth/register/verify",
      { challengeId: a.data && a.data.challengeId, code: a.data && a.data.devCode });
    const c = await api("POST", "/api/auth/register/consent",
      { registrationSession: b.data && b.data.registrationSession,
        agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: "8306" });
    token = (c.data && c.data.token) || "";
  }
  if (!token) { 見(false, "検証アカウントを 作れない", reg.data); return; }
  const 表 = {};
  for (const lv of ["やさしい", "標準", "難しい"]) {
    const r = await api("POST", "/api/aigen/questions", {
      prompt: "日本史（江戸時代の政治）の 試験問題を 8 問 作って ください。",
      count: 8, exam: true, subject: "日本史", level: lv,
      questionTypes: ["multiple_choice_single"], review: false
    }, token);
    const qs = (r.data && r.data.questions) || [];
    const 長 = [];
    qs.forEach((q) => (q.choices || []).forEach((c) => 長.push(String(c).length)));
    const 平均 = 長.length ? Math.round(長.reduce((a, b) => a + b, 0) / 長.length) : 0;
    表[lv] = { 問: qs.length, 平均, 最短: Math.min.apply(null, 長.concat([999])),
      短い: 長.filter((x) => x < 20).length, 全: 長.length };
    console.log("     " + lv + ": " + qs.length + " 問 / 選択肢 平均 " + 平均 + " 字 / 20 字未満 "
      + 表[lv].短い + "/" + 長.length);
    見(qs.length >= 5, lv + ": 問題が 作れる", qs.length);
    見(平均 >= 深({ level: lv }).min * 0.8,
      "★ " + lv + ": 平均が 下限（" + 深({ level: lv }).min + " 字）に 近い", 平均);
    見(表[lv].短い === 0, "★ " + lv + ": **20 字 未満の 選択肢が 1 つも ない**", 表[lv].短い);
  }
  見(表["難しい"].平均 > 表["やさしい"].平均 + 6,
    "★★ **難しいほど 選択肢が 長い**（消去法で 消せない）",
    { やさしい: 表["やさしい"].平均, 標準: 表["標準"].平均, 難しい: 表["難しい"].平均 });
}

(async () => {
  if (実) { try { await 実測(); } catch (e) { 見(false, "実測で 落ちた", String(e && e.message || e)); } }
  else console.log("\n（④ 実測は --実 を 付けた ときだけ）");
  console.log("\n────────────────────────────────");
  console.log("  ok " + 済 + " / NG " + 落);
  if (落) console.log("  落ちた: " + 落ち.join(" / "));
  process.exit(落 ? 1 : 0);
})();
