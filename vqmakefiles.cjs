/* ══════════════════════════════════════════════════════════════════════════
   vqmakefiles.cjs — 試験づくりに **根拠と なる 資料を 添付できるか**を 測る

   訴え（2026-08-30・Rinty さん）
     「Quick Mock に 根拠と なる 資料も 追加で 添付できるようにして欲しい。
       具体的に 言えば、プリセット自動作成AI と 同じ」

   直す前に あった 差:
     プリセット作成 … __vqChatFiles で 読み取り → aigen.filesToPayload で 送る
       ・512MB まで／スキャン PDF は ページを 絵に して 渡す
       ・docx / csv / zip の 中身を 取り出す
     試験づくり   … 自前で base64 に して 送るだけ
       ・合わせて 20MB（実際は サーバが 18MB で 断る）
       ・スキャン PDF は **何も 読まれない**
       ・読み取れたか どうかが 画面に 出ない

   見るのは:
     ① 本物の PDF を 入れられる（読取器を 通る）
     ② 読み取った 中身が 画面に 出る
     ③ 送る形が **プリセット作成と 同じ 道**（filesToPayload）で 作られる
     ④ 依頼文に「資料だけを 根拠に」が 入る
     ⑤ 外した ものは 読取器の 一覧からも 消える

   使い方: VQ_BASE=http://127.0.0.1:8791 node vqmakefiles.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs");
const path = require("path");
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const { chromium } = require("playwright");

let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 220) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 400) : "")); }
};
const 待 = (ms) => new Promise((s) => setTimeout(s, ms));
const j = (r) => r.json().catch(() => ({}));
async function 作る() {
  const 印 = Date.now().toString(36) + Math.floor(Math.random() * 9999);
  const r = await fetch(BASE + "/api/auth/register/start", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "vqf" + 印 + "@gmail.com", gradePrefix: "H2",
      nickname: ("f" + 印).slice(0, 14), password: "Passw0rd!z3" }) }).then(j);
  const v = await fetch(BASE + "/api/auth/register/verify", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeId: r.challengeId, code: r.devCode }) }).then(j);
  const c = await fetch(BASE + "/api/auth/register/consent", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ registrationSession: v.registrationSession, agreeTerms: true,
      agreePrivacy: true, agreeAge: true, pin: "1379" }) }).then(j);
  if (!c.token) throw new Error("札が 取れない: " + JSON.stringify(c).slice(0, 200));
  return c.token;
}

/* 資料に する PDF。実物（共通テスト 情報 I100）を 使う。 */
const PDF = ["情報 (2).pdf", "情報.pdf"].map((n) => path.join(process.cwd(), n))
  .filter((p) => fs.existsSync(p))[0];

(async () => {
  console.log("測る先:", BASE);
  console.log("資料:", PDF || "（見つからない → 作り物で 測る）");
  const tok = await 作る();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 900 } });
  const page = await ctx.newPage();
  const 例外 = [];
  page.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 200)));
  await page.addInitScript((t) => {
    try {
      localStorage.setItem("app.auth.token.v1", t);
      localStorage.setItem("app.auth.mode.v1", "user");
      localStorage.setItem("vq.tour.v1", JSON.stringify({ home: 1, preset: 1, feed: 1, dm: 1, insight: 1 }));
    } catch (e) {}
  }, tok);
  await page.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__vqMake, null, { timeout: 60000 });
  await 待(2000);

  /* ══ ① 読取器が 居る ══ */
  節("① 読み取りの 部品が 居る（プリセット作成と 同じ もの）");
  const 部品 = await page.evaluate(() => ({
    読取器: !!window.__vqChatFiles,
    送り口: !!(window.VQ2 && window.VQ2.aigen && window.VQ2.aigen.filesToPayload),
    大きい文字: !!(window.VQ2 && window.VQ2.aigen && window.VQ2.aigen.bigDocText),
    上限MB: window.__vqChatFiles ? Math.round(window.__vqChatFiles.LIMITS.maxBytesByKind.document / 1024 / 1024) : 0
  }));
  見(部品.読取器, "__vqChatFiles が 居る");
  見(部品.送り口, "aigen.filesToPayload が 居る");
  見(部品.大きい文字, "aigen.bigDocText が 居る");
  見(部品.上限MB >= 100, "★ 文書の 上限が 100MB 以上（前は 20MB）", 部品.上限MB + "MB");

  /* ══ ② 本物の PDF を 入れる ══ */
  節("② 本物の PDF を 入れる");
  const b64 = PDF ? fs.readFileSync(PDF).toString("base64") : null;
  const 名 = PDF ? path.basename(PDF) : "つくりもの.pdf";
  const 入 = await page.evaluate(async ([data, name]) => {
    function b2u(b) { const s = atob(b); const u = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
    const u = data ? b2u(data) : new TextEncoder().encode("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n");
    const f = new File([u], name, { type: "application/pdf" });
    await window.__vqMake.資料を読ませる([f]);
    return window.__vqMake.状態().資料;
  }, [b64, 名]);
  見(入.length === 1, "★ 1 件 入った", 入);
  見(入[0] && 入[0].size > 0, "大きさを 持っている", 入[0] && 入[0].size);

  /* 読み取りが 終わるまで 待つ。 */
  await page.waitForFunction(() => {
    const a = window.__vqMake.状態().資料[0];
    return a && a.状態 !== "queued" && a.状態 !== "extracting";
  }, null, { timeout: 45000 }).catch(() => {});
  const 後 = await page.evaluate(() => window.__vqMake.状態().資料[0]);
  見(!!後, "読み取りが 終わった", 後);
  見(後.状態 === "ready" || 後.状態 === "warning" || 後.状態 === "failed",
     "★ 状態を 隠さない（読めた／警告／失敗）", 後.状態);
  if (PDF) 見(後.文字数 > 500 || 後.絵 > 0,
     "★ 本物の PDF から 中身が 取れる（文字 か ページの 絵）",
     "文字 " + 後.文字数 + " / 絵 " + 後.絵 + " ページ");

  /* ══ ③ 画面に 出る ══ */
  節("③ 読み取れたか どうかが 画面に 出る");
  const 見た = await page.evaluate(() => {
    window.__vqMake.open({ kind: "exam" });
    window.__vqMake.表紙を入れる({ examName: "資料の 確かめ", subject: "情報" });
    const r = document.getElementById("vqMake").shadowRoot;
    const b = r.querySelector('[data-a="go"]');
    if (b) b.click();
    const w = r.querySelector(".w");
    return {
      文: (w ? w.textContent : "").replace(/\s+/g, " ").trim().slice(0, 1200),
      札: !!r.querySelector(".file-st"),
      状: (r.querySelector(".file-st") || {}).textContent || ""
    };
  });
  見(見た.文.indexOf("資料") >= 0, "条件に 資料の 欄が ある");
  見(見た.札, "★ 1 件ごとの 状態が 出る", 見た.状.slice(0, 80));
  見(見た.文.indexOf("スキャン") >= 0, "★ スキャンした PDF も 読めると 書いてある");

  /* ══ ④ 送る形 ══ */
  節("④ 渡しかた（本文が 取れているなら 文字で・速い）");
  const 送 = await page.evaluate(async () => {
    try {
      const r = await window.__vqMake.資料の送り形();
      return { ok: true, 件: (r.files || []).length,
               中: (r.files || []).map((f) => ({ mime: f.mimeType, 内: f.data ? f.data.length : 0,
                                                預: !!f.fileUri })),
               文: (r.文 || "").length };
    } catch (e) { return { ok: false, err: String((e && (e.userMessage || e.message)) || e).slice(0, 200) }; }
  });
  見(送.ok, "断られずに 形が できる", 送);
  /* ★ 渡しかたは **1 件ずつ 中身を 見て** 決める（2026-08-30）。
     本物の 共通テスト（21 ページ）は 2,411 字しか 取れない（1 ページ 115 字）。
     ほとんど 図と 写真なので、文字で 渡すと 中身の 無い 試験に なる。
     1 ページ 400 字を 下回る 資料は そのまま 読ませる。 */
  const 見立て = await page.evaluate(() => window.__vqMake.状態().資料[0]);
  見(見立て.頁 === 21 && 見立て.文字数 < 21 * 400,
     "★ 図の 多い PDF と 見分ける（1 ページ 115 字）", 見立て);
  見(見立て.文字で足りる === false, "★ 文字だけでは 足りないと 判断する", 見立て.文字で足りる);
  見(送.ok && 送.件 === 1, "★ だから この PDF は そのまま 読ませる", 送);

  /* 「そのまま 読ませる」を 選んでも 同じ（もともと そのまま）。 */
  const 生 = await page.evaluate(async () => {
    const r0 = document.getElementById("vqMake").shadowRoot;
    const b = r0.querySelector('[data-a="pass"][data-v="そのまま"]');
    if (b) b.click();
    try {
      const r = await window.__vqMake.資料の送り形();
      const f = r.files || [];
      return { ok: true, 件: f.length, 内: f.map((x) => (x.data ? x.data.length : 0)), 預: f.filter((x) => x.fileUri).length };
    } catch (e) { return { ok: false, err: String((e && (e.userMessage || e.message)) || e).slice(0, 200) }; }
  });
  見(生.ok && 生.件 >= 1, "★「そのまま」に すると PDF を 送る", 生);
  見(生.ok && (生.預 >= 1 || (生.内[0] || 0) > 0), "中身か 預け先を 持っている", 生);

  /* ══ ⑤ 依頼文 ══ */
  節("⑤ 依頼文に「資料だけを 根拠に」が 入る");
  const 依 = await page.evaluate(() => {
    const s = window.__vqMake.状態();
    return { 資料数: s.資料.length };
  });
  見(依.資料数 === 1, "資料を 持ったまま", 依);
  /* 依頼文は 内部関数なので、資料の 有無で 変わる ことを 画面の 文で 見る。 */
  const 文言 = await page.evaluate(() => {
    const r = document.getElementById("vqMake").shadowRoot;
    return (r.querySelector(".w").textContent || "").replace(/\s+/g, " ");
  });
  見(文言.indexOf("その 資料だけを 根拠に") >= 0 || 文言.indexOf("資料だけを") >= 0
     || 文言.indexOf("根拠") >= 0, "★ 資料を 根拠に すると 書いてある");

  /* ══ ⑥ 外す ══ */
  節("⑥ 外したら 読取器の 一覧からも 消える");
  const 消 = await page.evaluate(() => {
    const 前 = window.__vqChatFiles.list().length;
    const r = document.getElementById("vqMake").shadowRoot;
    const b = r.querySelector('[data-a="rmfile"]');
    if (b) b.click();
    return { 前, 後: window.__vqChatFiles.list().length,
             残: window.__vqMake.状態().資料.length };
  });
  見(消.残 === 0, "画面から 消える", 消);
  見(消.後 === 消.前 - 1, "★ 読取器の 一覧からも 消える（Quick Chat に 残らない）", 消);

  見(例外.length === 0, "例外が 出ていない", 例外);

  await browser.close();
  console.log("\n────────────────────────────");
  console.log("通った: " + 済 + " / 落ちた: " + 落);
  if (落ち.length) console.log("落ちたもの:\n  - " + 落ち.join("\n  - "));
  process.exit(落 ? 1 : 0);
})();
