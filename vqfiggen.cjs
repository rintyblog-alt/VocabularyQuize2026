/* ══════════════════════════════════════════════════════════════════════════
   vqfiggen.cjs — **AI が 出した 資料が、本当に 紙面へ 描けるか**を 実測する

   訴え（2026-08-30・Rinty さん）「資料問題（… 表や図形の 正確な 描画）」

   ここで 見るのは 3 つ:
     ① サーバに materials を 頼むと、資料つきの 問題が 返るか
     ② その 資料が **こちらの 語彙に 収まるか**（勝手な SVG・URL を 出していないか）
     ③ 受け取った ものが 実際に 描けるか（vq-fig で SVG／表に なるか）

   ★ 本物の AI を 使うので、返りは 毎回 変わる。
     だから「必ず N 件」では 測らない。**出たものが 全部 描けること**を 測る。

   使い方: VQ_BASE=http://127.0.0.1:8791 node vqfiggen.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs");
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

let 済 = 0, 落 = 0;
const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + String(追).slice(0, 220) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + String(追).slice(0, 400) : "")); }
};
const j = (r) => r.json().catch(() => ({}));

/* 束から 描く 側と 直す 側を 取り出す（ブラウザは 使わない） */
const root = {};
global.window = root;
new Function("globalThis", fs.readFileSync("js-src/vq-fig.js", "utf8"))(root);
try { new Function("globalThis", fs.readFileSync("js-src/vq2-app.b85018b5b8.js", "utf8"))(root); } catch (e) {}
const F = root.VQFIG, MB = root.VQ2 && root.VQ2.mockBuilder;

async function 札() {
  const 印 = Date.now().toString(36) + Math.floor(Math.random() * 9999);
  const H = { "Content-Type": "application/json" };
  const r = await fetch(BASE + "/api/auth/register/start", { method: "POST", headers: H,
    body: JSON.stringify({ email: "vqg" + 印 + "@gmail.com", gradePrefix: "H2",
      nickname: ("g" + 印).slice(0, 14), password: "Passw0rd!z3" }) }).then(j);
  const v = await fetch(BASE + "/api/auth/register/verify", { method: "POST", headers: H,
    body: JSON.stringify({ challengeId: r.challengeId, code: r.devCode }) }).then(j);
  const c = await fetch(BASE + "/api/auth/register/consent", { method: "POST", headers: H,
    body: JSON.stringify({ registrationSession: v.registrationSession, agreeTerms: true,
      agreePrivacy: true, agreeAge: true, pin: "1379" }) }).then(j);
  if (!c.token) throw new Error("札が 取れない");
  return c.token;
}

/* 問題から 資料を 拾う（置き場所の ゆれを まとめて 見る） */
function 資料ら(q) {
  const 出 = [];
  ["materials", "contentBlocks", "figures", "資料"].forEach((k) => {
    if (Array.isArray(q[k])) 出.push(...q[k]);
  });
  ["figure", "table", "chart", "diagram"].forEach((k) => {
    if (q[k] && typeof q[k] === "object" && !Array.isArray(q[k])) 出.push({ type: k, ...q[k] });
  });
  return 出;
}

(async () => {
  console.log("測る先:", BASE);
  const tok = await 札();
  const H = { "Content-Type": "application/json", Authorization: "Bearer " + tok };

  節("① 資料を 頼む（materials: true）");
  const t0 = Date.now();
  const r = await fetch(BASE + "/api/aigen/questions", { method: "POST", headers: H,
    body: JSON.stringify({
      prompt: "中学3年の 数学と 地理。表や グラフ、図形を 読み取って 答える 問題を 6 問。"
        + "短答を 3 問、記述を 3 問。",
      count: 6, materials: true,
      questionTypes: ["short_answer", "long_answer"],
      questionPlan: { short_answer: 3, long_answer: 3 }
    }) }).then(j);
  const qs = (r && r.questions) || [];
  見(r && r.ok, "作れた", JSON.stringify({ ok: r && r.ok, 問: qs.length, 秒: Math.round((Date.now() - t0) / 100) / 10,
    提供元: (r.metrics && r.metrics.model) || "" }));
  if (!qs.length) { console.log("問題が 0 件。ここで 止めます。"); process.exit(1); }

  const 全資料 = [];
  qs.forEach((q) => 資料ら(q).forEach((m) => 全資料.push({ q: q, m: m })));
  console.log("     資料つきの 問題: " + qs.filter((q) => 資料ら(q).length).length + " / " + qs.length
    + " ・ 資料 " + 全資料.length + " 件");
  console.log("     種類: " + JSON.stringify(全資料.reduce((a, x) => {
    const t = String(x.m && (x.m.type || x.m.kind) || "(なし)"); a[t] = (a[t] || 0) + 1; return a; }, {})));

  見(全資料.length > 0, "資料が 1 件 以上 返る（頼んだのに 0 なら 指示が 効いていない）", 全資料.length);

  節("② 勝手な 形を 出していない");
  {
    const 生SVG = 全資料.filter((x) => /<svg/i.test(JSON.stringify(x.m)));
    見(生SVG.length === 0, "生の SVG を 書いていない", 生SVG.length);
    const 外URL = 全資料.filter((x) => /https?:\/\//.test(String((x.m && (x.m.src || x.m.url)) || "")));
    見(外URL.length === 0, "外の 画像の 住所を 書いていない", 外URL.map((x) => x.m.src || x.m.url).join(","));
  }

  節("③ 受け取った ものが 実際に 描ける");
  {
    /* サーバの 返りを そのまま 試験の 形へ 直し、紙面の 部品で 描く。 */
    const draft = {
      title: "資料の たしかめ", subject: "数学", durationMinutes: 50, totalPoints: qs.length * 10,
      sections: [{ title: "一", questions: qs.map((q, i) => Object.assign({}, q, {
        id: "g" + i, points: 10 })) }],
      answerKey: qs.map((q, i) => ({ id: "g" + i, explanation: q.explanation || "x" }))
    };
    let spec = null;
    try { spec = MB.fromDraft(draft, {}); } catch (e) { 見(false, "試験の 形へ 直せた", String(e && e.message || e)); }
    if (spec) {
      const 問ら = spec.sections[0].questions;
      const 通った = [];
      問ら.forEach((q) => (q.contentBlocks || []).forEach((b) => 通った.push(b)));
      見(true, "語彙に 収まった 資料", 通った.length + " / " + 全資料.length
        + "（残りは 形が 違って 捨てた）");
      let 描けた = 0, 描けず = [];
      通った.forEach((b) => {
        const h = F.描く(b);
        if (h && h.indexOf("出せません") < 0 && (h.indexOf("<svg") >= 0 || h.indexOf("<table") >= 0)) 描けた++;
        else 描けず.push(JSON.stringify(b).slice(0, 160));
      });
      見(通った.length === 0 || 描けた === 通った.length,
         "★ 通った 資料は **全部 描けた**", 描けた + " / " + 通った.length
         + (描けず.length ? "  描けず: " + 描けず.join(" | ") : ""));
      /* 紙面に 実際に 載るか。 */
      const L = root.VQ2.layout, R = root.VQ2.pdfRenderer;
      let html = "";
      try { html = String(R.buildHtml(spec, L.buildPlan(spec, {}), { bookletId: "question-booklet" })); }
      catch (e) { 見(false, "紙面を 組めた", String(e && e.message || e)); }
      if (html) {
        見(true, "紙面を 組めた", html.length + " 字");
        if (通った.length) {
          見(/<svg|class="[^"]*vf-t/.test(html), "資料が 紙面に 載っている");
          見(!/NaN|Infinity/.test(html), "紙面に NaN／Infinity が 無い");
        }
      }
    }
  }

  節("④ 頼まなければ 付かない（飾りの 表を 作らせない）");
  {
    const r2 = await fetch(BASE + "/api/aigen/questions", { method: "POST", headers: H,
      body: JSON.stringify({ prompt: "百人一首の 作者を 答える 4 択を 3 問。", count: 3,
        questionTypes: ["single_choice"], questionPlan: { single_choice: 3 } }) }).then(j);
    const q2 = (r2 && r2.questions) || [];
    const 資2 = q2.reduce((a, q) => a + 資料ら(q).length, 0);
    見(q2.length > 0, "頼みなしでも 問題は 作れる", q2.length);
    見(資2 === 0, "頼んでいないので 資料は 付かない", 資2);
  }

  console.log("\n────────────────────────────────");
  console.log("通った: " + 済 + " / 落ちた: " + 落);
  if (落ち.length) console.log("落ちたもの:\n  - " + 落ち.join("\n  - "));
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error("止まりました:", e); process.exit(1); });
