/* ══════════════════════════════════════════════════════════════════════════
   vqgenreal — **人が 実際に 書く 頼みかたで、頼んだ 通りに 作れるか**
              （2026-09-09・訴え）

   訴え「完全に プリセットを 生成できなく なった。エラーが 出る」
       「形式を 大体 指定したら、4択25問 記述25問に なった」
       「試験の 方も 同様。どんな プロンプト指示でも 動く ように」

   vqallfmt が 見るのは 「1形式ずつ 作れるか」。
   ここが 見るのは **本物の 頼みかた** ——
     ・形式を **数で 指定**する（「10問4択で それ以外を 記述に」）
     ・試験で 形式を **まぜて** 一度に 頼む
   台帳（ai_jobs）に 残って いた 実際の 失敗は すべて この 形だった。

   ★ 本物の AI を 呼ぶ（実AI 種）。VQ_REAL_AI 相当。
   使いかた: node vqgenreal.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "https://www.vocabuquiz.app";
const 名 = process.env.VQ_USER || "lg7358830806";
const 合言葉 = process.env.VQ_PASS || "DevAcc#2026a";

/* ── ① 配分を 数で 指定する（プリセット）───────────────────────────
   期待は **ちょうど その数**。多い/少ないは どちらも 不合格。 */
const 配分 = [
  ["大学入試の口頭諮問で、情報Ⅰ,Ⅱの基礎的部分を聞かれるから、全範囲から均等に書かれそうな想定問題を50問作成してほしい。形式は説明したいから、10問4択でそれ以外を記述にしてほしい。よろしく",
    50, { single_choice: 10, free_text: 40 }],
  ["中学歴史の復習を 20問。5問は正誤問題で、残りは4択でお願いします",
    20, { true_false: 5, single_choice: 15 }],
  ["英単語を 12問。半分は暗記カード、半分は穴埋めで",
    12, { flashcard: 6, fill_blank: 6 }],
];

/* ── ② 試験で 形式を まぜる ────────────────────────────────────
   期待は 「満数の 8割 以上」かつ **指定して いない 形式が 出ない**。 */
const 試験 = [
  ["国語 現代文の定期試験。20問。うち5問は記述、あとは4択と穴埋めで",
    { count: 20, subject: "国語", level: "高1", questionTypes: ["single_choice", "fill_blank", "free_text"] }],
  ["数学Ⅰ 二次関数の実力テストを 15問。計算の答えを書かせるものを中心に、証明も少し",
    { count: 15, subject: "数学", level: "高1", questionTypes: ["numeric_input", "text_input", "free_text"] }],
  ["中学理科の学年末。全分野から30問。図表を読ませる問題も入れて",
    { count: 30, subject: "理科", level: "中3", questionTypes: ["single_choice", "true_false", "chart_read", "table_fill", "free_text"] }],
  ["英語のコミュ英。25問。並べ替え・誤文訂正・語形変化をバランスよく",
    { count: 25, subject: "英語", level: "高2", questionTypes: ["reorder", "error_correction", "fill_blank", "single_choice"] }],
  ["社会（歴史）の共通テスト風。資料を読ませる形で 20問",
    { count: 20, subject: "社会", level: "高3", questionTypes: ["single_choice", "chart_read", "matching", "free_text"] }],
];

let 落 = 0;
const 秒 = (t) => Math.round((Date.now() - t) / 100) / 10 + "s";

async function 頼む(token, body) {
  return fetch(BASE + "/api/aigen/questions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify(body)
  }).then(r => r.json()).catch(e => ({ err: String(e) }));
}
const 数える = (q) => { const o = {}; for (const x of q) o[x.type] = (o[x.type] || 0) + 1; return o; };

(async () => {
  const l = await fetch(BASE + "/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gradePrefix: "H1", nickname: 名, password: 合言葉 })
  }).then(r => r.json()).catch(() => ({}));
  if (!l || !l.token) { console.error("ログインできません（VQ_USER / VQ_PASS を 確かめて ください）"); process.exit(2); }

  console.log("【① 配分を 数で 指定】" + BASE);
  for (const [p, n, 期待] of 配分) {
    const t = Date.now();
    const r = await 頼む(l.token, { prompt: p, count: n });
    const q = r.questions || [], 内 = 数える(q);
    /* ★ 指定した 形式は **ちょうど その数**。ここが ずれたのが 訴えの 中身。 */
    const ずれ = Object.keys(期待).filter(k => (内[k] || 0) !== 期待[k]);
    const ok = q.length === n && !ずれ.length;
    if (!ok) 落++;
    console.log(`  ${ok ? "✓" : "✗"} ${q.length}/${n}  ${秒(t)}  ${JSON.stringify(内)}`);
    if (!ok) console.log(`      期待 ${JSON.stringify(期待)}${ずれ.length ? "  ★ずれ " + ずれ : ""}`);
  }

  console.log("\n【② 試験で 形式を まぜる】");
  for (const [p, o] of 試験) {
    const t = Date.now();
    const r = await 頼む(l.token, Object.assign({ prompt: p, exam: true }, o));
    const q = r.questions || [], 内 = 数える(q);
    /* ★ 指定して いない 形式が 出たら 不合格（試験は 形式の 縛りが 効いて いないと 紙面が 崩れる）。 */
    const 型外 = Object.keys(内).filter(k => !o.questionTypes.includes(k));
    const ok = q.length >= Math.ceil(o.count * 0.8) && !型外.length;
    if (!ok) 落++;
    console.log(`  ${ok ? "✓" : "✗"} ${o.subject}  ${q.length}/${o.count}  ${秒(t)}  ${JSON.stringify(内)}${型外.length ? "  ★型外 " + 型外 : ""}`);
    if (!ok && r.metrics) console.log("      " + JSON.stringify(r.metrics.rejectReasons || {}).slice(0, 160));
  }

  const 全 = 配分.length + 試験.length;
  console.log(落 ? `\n落ちた ${落}/${全}` : `\nぜんぶ 頼んだ 通りに 作れました（${全}/${全}）`);
  process.exit(落 ? 1 : 0);
})();
