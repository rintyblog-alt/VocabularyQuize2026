/* ══════════════════════════════════════════════════════════════════════════
   vqaigenquality.cjs — **意味の 分からない 問題**が 0 に なったかを
   本物の AI で 作らせて 数える。

   訴え（2026-08-28）:
     「ルミの プリセット作成で、意味不明な 問題が 出る。
       材料の 無い 並べ替え、『日本の首都は？』級の 問題。これを **0 に**」
     「解説を 具体的で 分かりやすく」

   数えかた（好みでは なく、**数えられる もの**だけ）:
     ① 並べ替え … items が 3 つ 以上 ある
     ② 分ける  … items と groups が 両方 ある
     ③ 対応づけ … left と right が ある
     ④ 表のうめ … headers と rows が ある
     ⑤ 穴埋め  … 問題文に 空欄の 印（___ や 【1】）が ある
     ⑥ 選ぶ形  … choices が 2 つ 以上
     ⑦ 解説    … 45 字 以上 ある（一般論だけの 短い ものを 落とす ため）

   使い方: VQ_TOKEN=<札> node vqaigenquality.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) {
  console.error("本番では実行しません。"); process.exit(2);
}
const token = process.env.VQ_TOKEN;
if (!token) { console.error("VQ_TOKEN を 渡してください。"); process.exit(2); }
const H = { "Content-Type": "application/json", Authorization: "Bearer " + token };

/* 材料が 要る 形式と、その 材料 */
function 材料が無い(q) {
  const t = String(q.type || "");
  const 空 = (v) => !Array.isArray(v) || !v.length;
  if (/order|reorder|並/.test(t)) {
    if (空(q.items)) return "並べる材料が 無い";
    if (q.items.length < 3) return "並べる材料が 3 つ未満";
  }
  if (/classif|分類/.test(t)) {
    if (空(q.items) || 空(q.groups)) return "分ける材料か 仕分け先が 無い";
  }
  if (/match|対応/.test(t)) {
    if (空(q.left) || 空(q.right)) return "対応づける材料が 無い";
  }
  if (/table|表/.test(t)) {
    if (空(q.headers) || 空(q.rows)) return "うめる表が 無い";
  }
  if (/blank|cloze|穴/.test(t)) {
    const s = String(q.question || "");
    if (!/[_＿]{2,}|【\s*\d+\s*】|\(\s*\d+\s*\)|（\s*\d+\s*）/.test(s)) return "空欄の 印が 無い";
  }
  if (Array.isArray(q.choices) && q.choices.length && q.choices.length < 2) return "選択肢が 1 つ";
  return "";
}

const 頼み = [
  "鎌倉時代の できごとを 並べ替える 問題を 4 問",
  "植物と 動物を 分ける 問題と、表の うめ 問題を 合わせて 4 問",
  "英単語の 穴埋めを 4 問"
];

(async () => {
  let 落 = 0, 全問 = 0, 崩れ = [], 短い = 0;
  const 見 = (ok, 名, 追) => { console.log((ok ? "✓ " : "✗ ") + 名 + (追 !== undefined ? " → " + JSON.stringify(追).slice(0, 260) : "")); if (!ok) 落++; };

  for (const ask of 頼み) {
    const r = await fetch(BASE + "/api/aigen/questions", {
      method: "POST", headers: H, body: JSON.stringify({ prompt: ask, count: 4 })
    }).then((x) => x.json());
    const qs = Array.isArray(r.questions) ? r.questions : [];
    console.log("\n── " + ask);
    console.log("   できた " + qs.length + " 問"
      + (r.metrics && r.metrics.rejectReasons ? "  弾いた理由: " + JSON.stringify(r.metrics.rejectReasons) : ""));
    qs.forEach((q, i) => {
      全問++;
      const 悪 = 材料が無い(q);
      const ex = String(q.explanation || "");
      if (ex.length < 45) 短い++;
      if (悪) 崩れ.push({ 形: q.type, 文: String(q.question || "").slice(0, 34), 理由: 悪 });
      console.log("   " + (悪 ? "✗" : " ") + " " + (i + 1) + ". [" + q.type + "] "
        + String(q.question || "").slice(0, 40) + "  解説 " + ex.length + " 字"
        + (悪 ? "  ← " + 悪 : ""));
    });
  }
  console.log("");
  見(全問 > 0, "問題が できた（合計 " + 全問 + " 問）");
  見(崩れ.length === 0, "★ **材料の 無い 問題が 0 問**（" + 崩れ.length + " 問）", 崩れ);
  見(短い === 0, "★ 解説が 45 字 未満の 問題が 0 問（" + 短い + " 問）");
  console.log(`\n落ち ${落} 件`);
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error("✗ 途中で 落ちた:", e && e.message); process.exit(1); });
