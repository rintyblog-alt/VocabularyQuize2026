/* ══════════════════════════════════════════════════════════════════════════
   vqnewfmt — **2026-09-10 に 足した 11 形式が 本当に 作れるか**

   訴え「実用性の高い形式を さらに 作りたい」。
   ★ 定義を 足すだけでは 足りない。**サーバの AIGEN_VARIANTS に 無いと
     AI が 近い 名前へ 逃げ、「形式ちがい」で 全部 捨てられる**
     （実測: 漢文の訓読順を 3 問 頼んで 15 件 とも 捨てられ 0 問）。
   ここは その 往復を まるごと 測る。本物の AI を 呼ぶ（実AI・VQ_REAL_AI 相当）。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "https://www.vocabuquiz.app";
const 名 = process.env.VQ_USER || "lg7358830806";
const 合 = process.env.VQ_PASS || "DevAcc#2026a";
let ok = 0, ng = 0;

/* 形式 / 頼む 題材 / 何問 / 出来ばえの 見かた */
const 表 = [
  ["mark_digits", "高1数学の 2次方程式と 平方根", 3, (q) => /【\d】/.test(q.question) && Array.isArray(q.answer)],
  ["inflection_blank", "中学英語の 動詞の 活用", 3, (q) => /[（(]\s*\w+\s*[)）]/.test(q.question)],
  ["chem_coefficients", "中3の 化学変化（燃焼・分解）", 3, (q) => /【\d】/.test(q.question)],
  ["pseudocode_blank", "情報Ⅰ の 繰り返しと 条件分岐", 3, (q) => /【\d】/.test(q.question)],
  ["sentence_insert", "高2英語の 説明文（環境問題）", 2, (q) => /【\d】/.test(String(q.question) + JSON.stringify(q.materials || ""))],
  ["same_usage_choice", "中3国語の 文法（「の」の 識別）", 2, (q) => Array.isArray(q.choices) && q.choices.length >= 3],
  ["kanbun_order", "漢文の 故事成語（短い句）", 3, (q) => Array.isArray(q.answer) && q.answer.length >= 2],
  ["trace_table", "情報Ⅰ の 繰り返しの トレース", 2, (q) => !!q.table || !!q.rows],
  ["table_conjugation", "英語の 不規則動詞", 2, (q) => !!q.table || !!q.rows],
  ["dictation_word", "高校基礎の 英単語", 2, (q) => !!q.answer],
  ["dictation_kanji", "中学の 漢字（音読み・訓読み）", 2, (q) => !!q.answer]
];

(async () => {
  const l = await fetch(BASE + "/api/auth/login", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gradePrefix: "H1", nickname: 名, password: 合 }) }).then((r) => r.json());
  if (!l.token) { console.error("ログインできません"); process.exit(2); }
  const H = { "Content-Type": "application/json", Authorization: "Bearer " + l.token };

  console.log("【2026-09-10 の 11 形式】" + BASE + "\n");
  for (const [id, 題, n, 良] of 表) {
    const t0 = Date.now();
    const r = await fetch(BASE + "/api/aigen/questions", { method: "POST", headers: H,
      body: JSON.stringify({ prompt: 題, count: n, questionTypes: [id] }) })
      .then((x) => x.json()).catch((e) => ({ err: String(e) }));
    const q = r.questions || [];
    /* ★ 出た だけでは 足りない。**その形式らしい 中身か**まで 見る。 */
    const 中身 = q.filter((x) => { try { return 良(x); } catch (e) { return false; } }).length;
    const 合格 = q.length >= Math.ceil(n * 0.6) && 中身 >= Math.ceil(q.length * 0.5);
    if (合格) ok++; else ng++;
    console.log("  " + (合格 ? "ok  " : "NG  ") + id.padEnd(20)
      + q.length + "/" + n + " 問  形らしい " + 中身
      + "  " + Math.round((Date.now() - t0) / 100) / 10 + "s");
    if (q.length) console.log("        " + String(q[0].question || "").replace(/\n/g, " ").slice(0, 76));
    if (!合格) console.log("        落: " + JSON.stringify((r.metrics || {}).rejectReasons || {}).slice(0, 140));
  }
  console.log("\n────────────────────────────────");
  console.log("  ok " + ok + " / NG " + ng);
  process.exit(ng ? 1 : 0);
})();
