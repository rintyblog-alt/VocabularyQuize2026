#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqgradelen.cjs — 記述の **字数**まわり。

   ★ 訴え（2026-08-31）:
     ①「採点の 修正案が Lumi の 文字数を オーバーして いる。コレ アウトやろ」
     ②「記述の 字数が 142文字以内 とか 202文字 とか、キレが 悪い。
        なるべく 5 で 刻んで。基本的には 10 ずつが 理想」
     ③「記述の 採点・修正案は 全部 Gemini 3 Flash Live で やって いる？」

   ★ 直す前の 作り（コードを 読んで 分かった こと）:
     ① 字数の 決まりは 「条件」という **文の 中に 埋もれて**渡って いた。
       数として 渡して いなかった ので、AI は 読み飛ばす。
       返って きた 案も **数えて いなかった**（1200 字で 切るだけ）。
     ② 「142」は AI が その場で 決めて いる。どこも 丸めて いなかった。

   見るもの:
     ① 丸めかた（aigenRoundLen / aigenTidyLengths / aigenFitLen）
     ② 採点へ 渡す 中身に **字数上限が 数で 入る**
     ③ **実際に 採点させて、修正案が 上限を 超えないか 数える**
     ④ 採点が Live（gemini-3.1-flash-live-preview）を 通って いるか

   使い方:
     node vqgradelen.cjs            … ①② だけ（AI を 使わない）
     node vqgradelen.cjs --実       … ③④ も
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs");
const path = require("path");
const BASE = process.env.VQ_API || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
const 実 = process.argv.indexOf("--実") >= 0;
if (実 && !/-dev\.|127\.0\.0\.1|localhost/.test(BASE)) {
  console.error("本番では 実行しません。"); process.exit(2);
}
let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 240) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 420) : "")); }
};
const SRC = fs.readFileSync(path.join(__dirname, "server/src/worker.js"), "utf8");
function 取り出す(名前) {
  const 頭 = SRC.indexOf("function " + 名前 + "(");
  if (頭 < 0) throw new Error(名前 + " が ありません");
  let i = SRC.indexOf("{", 頭), d = 0, end = -1;
  for (; i < SRC.length; i++) { const c = SRC[i]; if (c === "{") d++; else if (c === "}") { d--; if (!d) { end = i + 1; break; } } }
  /* 正規表現は **本体から そのまま 取る**（写すと ずれる）。 */
  const reAt = SRC.indexOf("const AIGEN_LEN_TIDY_RE =");
  const 前 = SRC.slice(reAt, SRC.indexOf("\n", reAt) + 1)
    + SRC.slice(SRC.indexOf("function aigenRoundLen("), SRC.indexOf("/** 文の 中の「142")) + "\n";
  // eslint-disable-next-line no-new-func
  return new Function(前 + SRC.slice(頭, end) + "\nreturn " + 名前 + ";")();
}
const aigenRoundLen = 取り出す("aigenRoundLen");
const aigenTidyLengths = 取り出す("aigenTidyLengths");
const aigenLenCapOf = 取り出す("aigenLenCapOf");
const aigenFitLen = 取り出す("aigenFitLen");

節("① 丸めかた");
見(aigenRoundLen(142) === 140, "142 → 140", aigenRoundLen(142));
見(aigenRoundLen(202) === 200, "202 → 200", aigenRoundLen(202));
見(aigenRoundLen(145) === 150 || aigenRoundLen(145) === 140, "145 → 10 の 倍数", aigenRoundLen(145));
見(aigenRoundLen(230) === 230, "もともと 10 の 倍数は そのまま", aigenRoundLen(230));
見(aigenRoundLen(23) === 25, "★ 40 字 以下は 5 きざみ（23 → 25）", aigenRoundLen(23));
見(aigenRoundLen(38) === 40, "38 → 40", aigenRoundLen(38));
見(aigenRoundLen(0) === 0, "0 は そのまま");
見([12, 47, 99, 142, 202, 351, 999].every((n) => {
  const r = aigenRoundLen(n); return r <= 40 ? r % 5 === 0 : r % 10 === 0;
}), "★ **どれも 5 か 10 の 倍数に なる**",
  [12, 47, 99, 142, 202, 351, 999].map((n) => n + "→" + aigenRoundLen(n)));

節("② 文の 中の 数を 丸める");
見(aigenTidyLengths("次の 問いに 142字以内 で 答えよ。") === "次の 問いに 140字以内 で 答えよ。",
  "142字以内 → 140字以内", aigenTidyLengths("次の 問いに 142字以内 で 答えよ。"));
見(aigenTidyLengths("202 文字以内で まとめよ。") === "200 文字以内で まとめよ。",
  "202 文字以内 → 200 文字以内", aigenTidyLengths("202 文字以内で まとめよ。"));
見(aigenTidyLengths("答えは 4 文字。") === "答えは 4 文字。",
  "★ 「4 文字」（答えの 長さの ヒント）は **触らない**", aigenTidyLengths("答えは 4 文字。"));
見(aigenTidyLengths("120字以内で。") === "120字以内で。", "もともと 揃って いれば そのまま");
見(aigenLenCapOf("140字以内で 説明せよ") === 140, "上限を 読める", aigenLenCapOf("140字以内で 説明せよ"));
見(aigenLenCapOf("説明せよ") === 0, "決まりが 無ければ 0");
見(aigenLenCapOf("80字以内。ただし 200字以内の 引用可") === 80, "★ いちばん 小さい 上限を 取る",
  aigenLenCapOf("80字以内。ただし 200字以内の 引用可"));

節("③ 収めかた（aigenFitLen）");
{
  const t = "あいうえお。かきくけこ。さしすせそ。たちつてと。";
  見(aigenFitLen(t, 100) === t, "上限の 中なら そのまま");
  const r = aigenFitLen(t, 13);
  見(r === "あいうえお。かきくけこ。", "★ **文の 切れ目**で 収める（途中で 切らない）", r);
  見(r.length <= 13, "上限を 超えない", r.length);
  見(aigenFitLen("あいうえおかきくけこさしすせそ", 10) === "",
    "★ 半分も 残らない なら **出さない**（中途半端な 案は 見せない）");
}

節("④ サーバの 作り（worker.js の 中）");
見(/o\.字数上限 = 上限/.test(SRC), "★ 採点へ **字数上限を 数で** 渡す");
見(/字数上限 が 書いて ある 問題は、その 数を 1 字も 超えない/.test(SRC),
  "★ 頼み文で 数を 名指しして いる");
見(/improvedAnswer: aigenFitLen\(/.test(SRC), "★ 返って きた 案を **数えて 押さえる**");
見(/超過\.length && aigenGeminiKeys\(env\)\.length/.test(SRC),
  "★ 超えた ものだけ **もう一度 縮めさせる**（ふだんは AI を 呼ばない）");
見(/q\.question = aigenTidyLengths\(q\.question\)/.test(SRC),
  "★ 作った 問題の 字数も 丸める");
見(/10 の 倍数.*にする|10 の 倍数.*にする/.test(SRC.replace(/\n/g, " ")),
  "記述の 頼み文にも 「10 の 倍数」と 書いて ある");
見(/const LIVE_MODEL = "gemini-3\.1-flash-live-preview"/.test(SRC),
  "★ Live の モデル", (SRC.match(/const LIVE_MODEL = "[^"]+"/) || [])[0]);
見(/liveOnce\(env, \{ sys: GRADE_SYS/.test(SRC),
  "★ **採点は まず Live を 通る**（無制限の 枠を 使う）");

async function 実測() {
  節("⑤ 実際に 採点させて 数える（" + BASE + "）");
  const api = async (m, p, body, token) => {
    const h = { "Content-Type": "application/json" };
    if (token) h.Authorization = "Bearer " + token;
    const r = await fetch(BASE + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined });
    let j = null; try { j = await r.json(); } catch (e) {}
    return { status: r.status, data: j };
  };
  const nick = "grd" + Date.now().toString(36).slice(-6);
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

  /* わざと **短い 上限**の 問いに、**長くて 抜けの ある 答案**を 出す。
     直す前は ここで 上限を 超えた 修正案が 返って いた。 */
  const 上限たち = [60, 100, 140];
  const targets = 上限たち.map((cap, i) => ({
    questionId: "q" + (i + 1),
    question: "産業革命が 都市の 姿を どう 変えたかを、" + cap + "字以内で 説明しなさい。",
    modelAnswer: "工場が 都市に 集まった ことで 農村から 人口が 流れ込み、"
      + "住宅や 上下水道が 追いつかず 過密と 衛生問題が 生じた。一方で 鉄道と 街路が 整えられ、"
      + "都市の 中心と 周辺の 役割が 分かれて いった。",
    answer: "工場ができて人がたくさん集まった。",
    points: 6,
    rubric: [
      { id: "r1", description: "人口の 流入に 触れて いる", points: 2 },
      { id: "r2", description: "住宅・衛生の 問題に 触れて いる", points: 2 },
      { id: "r3", description: "都市の 構造の 変化に 触れて いる", points: 2 }
    ],
    subject: "歴史", grade: "高1"
  }));
  const t0 = Date.now();
  const r = await api("POST", "/api/ai/grade", { targets }, token);
  const j = r.data || {};
  console.log("     " + ((Date.now() - t0) / 1000).toFixed(1) + " 秒 / model=" + (j.model || "?"));
  見(Array.isArray(j.grades) && j.grades.length === 3, "3 問とも 採点が 返る",
    { status: r.status, n: (j.grades || []).length, msg: j.message });
  if (!Array.isArray(j.grades)) return;
  見(j.model === "live", "★ **採点が Live を 通って いる**（無制限の 枠）", j.model);

  const 表 = [];
  let 超え = 0, 案あり = 0;
  j.grades.forEach((g, i) => {
    const 案 = (g && g.grade && g.grade.improvedAnswer) || "";
    const cap = 上限たち[i];
    表.push(cap + "字以内 → " + 案.length + "字");
    if (案) 案あり++;
    if (案 && 案.length > cap) 超え++;
  });
  console.log("     " + 表.join(" ／ "));
  見(案あり >= 2, "修正案が 返る（満点では ないので 出る はず）", 案あり);
  見(超え === 0, "★★ **修正案が 字数を 1 問も 超えない**", { 超え, 表 });
  j.grades.forEach((g, i) => {
    const s2 = g && g.grade;
    if (!s2) return;
    見(typeof s2.score === "number" && s2.score >= 0 && s2.score <= 6,
      "第" + (i + 1) + "問: 点が 配点の 中", s2.score);
  });
}

(async () => {
  if (実) { try { await 実測(); } catch (e) { 見(false, "実測で 落ちた", String(e && e.message || e)); } }
  else console.log("\n（⑤ 実測は --実 を 付けた ときだけ 走ります）");
  console.log("\n────────────────────────────────");
  console.log("  ok " + 済 + " / NG " + 落);
  if (落) console.log("  落ちた: " + 落ち.join(" / "));
  process.exit(落 ? 1 : 0);
})();
