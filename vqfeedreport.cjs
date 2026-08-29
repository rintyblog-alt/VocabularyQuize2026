/* ══════════════════════════════════════════════════════════════════════════
   vqfeedreport.cjs — 投稿の **報告の 窓**と **一覧からの 編集**を 実物で 見る。

   訴え（2026-08-29）:
     「報告機能を 独自に 作れる？ 今は システムの モーダルだから、
       アプリの モーダルに したい。理由を 選ぶ 感じに して、
       選ぶと その 理由を 記述する ところまで。
       その他の 場合は、その他が 何なのかを 記述、そのあと その 理由も」
     「投稿を 編集に関しては、投稿画面の 一覧から そのまま 編集できる？」

   見るところ:
     ① **window.prompt を 使っていない**（システムの 窓が 出ない）
     ② アプリの 窓が 出て、理由が 並ぶ
     ③ 選ばないと **送れない**
     ④ その他を 選ぶと「どんなことですか？」が 出る。書くまで 送れない
     ⑤ 理由を 選ぶと「くわしく」が 出る（任意）
     ⑥ 送ると お問い合わせの 口へ **理由つきで** 飛ぶ
     ⑦ 自分の 投稿は 一覧に **鉛筆**が 出て、押すと 編集の 窓が 開く
     ⑧ 人の 投稿には 鉛筆が 出ない

   使い方: VQ_BASE=<dev> node vqfeedreport.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) {
  console.error("本番では実行しません。"); process.exit(2);
}
const { chromium } = require("playwright");
let 済 = 0, 落 = 0;
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("✓ " + 名 + (追 !== undefined ? " → " + JSON.stringify(追).slice(0, 200) : "")); }
  else { 落++; console.log("✗ " + 名 + (追 !== undefined ? " → " + JSON.stringify(追).slice(0, 300) : "")); }
};
const j = (r) => r.json();
async function 作る(名) {
  const 印 = Date.now().toString(36) + Math.floor(Math.random() * 999);
  const mail = "vqfr" + 印 + "@gmail.com";
  let r = await fetch(BASE + "/api/auth/register/start", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: mail, gradePrefix: "H2", nickname: (名 + 印).slice(0, 14),
      password: "Passw0rd!z3" }) }).then(j);
  let v = await fetch(BASE + "/api/auth/register/verify", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeId: r.challengeId, code: r.devCode }) }).then(j);
  let c = await fetch(BASE + "/api/auth/register/consent", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ registrationSession: v.registrationSession, agreeTerms: true,
      agreePrivacy: true, agreeAge: true, pin: "1379" }) }).then(j);
  if (!c.token) throw new Error("札が 取れない: " + JSON.stringify(c).slice(0, 160));
  return { token: c.token, uid: c.user && c.user.id };
}
async function api(path, token, opts = {}) {
  const h = { "Content-Type": "application/json", Authorization: "Bearer " + token };
  const r = await fetch(BASE + path, { method: opts.method || "GET", headers: h,
    body: opts.body ? JSON.stringify(opts.body) : undefined });
  return { status: r.status, j: await r.json().catch(() => ({})) };
}
const 影 = (sel) => `(() => { const h = Array.from(document.querySelectorAll("*")).find(
  (e) => e.shadowRoot && e.shadowRoot.querySelector(${JSON.stringify(sel)}));
  return h ? h.shadowRoot : null; })()`;

(async () => {
  const A = await 作る("frA");
  await new Promise((s) => setTimeout(s, 1200));
  const B = await 作る("frB");
  /* B の 投稿（人の もの ＝ 報告できる）と A の 投稿（自分の もの ＝ 編集できる） */
  const pB = await api("/api/posts/create", B.token, { method: "POST",
    body: { body: "ほかの 人の 投稿（報告の ため）" } });
  const pA = await api("/api/posts/create", A.token, { method: "POST",
    body: { body: "自分の 投稿（編集の ため）" } });
  console.log("投稿:", pB.status, pA.status);

  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1100, height: 900 } });
  const 例外 = [];
  page.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 160)));
  /* ★ システムの 窓が 出たら 落とす（出ない ことが 訴えの 中身） */
  let システムの窓 = 0;
  page.on("dialog", async (d) => { システムの窓++; await d.dismiss().catch(() => {}); });
  await page.addInitScript((tk) => {
    try { localStorage.setItem("app.auth.token.v1", tk); localStorage.setItem("app.auth.mode.v1", "user"); } catch (e) {}
  }, A.token);
  await page.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    Array.from(document.querySelectorAll("body > *")).forEach((h) => {
      const t = (h.shadowRoot ? h.shadowRoot.textContent : h.textContent) || "";
      if (/はじめかた|声で話しかけてみよう|もう出さない/.test(t)) h.remove();
    });
    document.body.setAttribute("data-app-tab", "inbox");
  });
  await page.waitForTimeout(6000);

  /* ── ⑦⑧ 鉛筆 ── */
  const 鉛筆 = await page.evaluate(() => {
    const h = Array.from(document.querySelectorAll("*")).find(
      (e) => e.shadowRoot && e.shadowRoot.querySelector("[data-post]"));
    if (!h) return { 無い: true };
    const r = h.shadowRoot;
    const 札 = Array.from(r.querySelectorAll("[data-post]"));
    return {
      札の数: 札.length,
      鉛筆つき: 札.filter((c) => c.querySelector('[data-a="quick-edit"]')).length,
      本文: 札.map((c) => (c.textContent || "").replace(/\s+/g, " ").slice(0, 30))
    };
  });
  console.log("札:", JSON.stringify(鉛筆));
  見(!鉛筆.無い && 鉛筆.札の数 >= 2, "投稿が 2 件 見えている", 鉛筆.札の数);
  見(鉛筆.鉛筆つき === 1, "⑦⑧ 鉛筆は **自分の 投稿だけ**（" + 鉛筆.鉛筆つき + " 件）", 鉛筆);

  /* ⑦ 鉛筆を 押すと 編集の 窓 */
  await page.evaluate(() => {
    const h = Array.from(document.querySelectorAll("*")).find(
      (e) => e.shadowRoot && e.shadowRoot.querySelector('[data-a="quick-edit"]'));
    h.shadowRoot.querySelector('[data-a="quick-edit"]').click();
  });
  await page.waitForTimeout(900);
  const 編 = await page.evaluate(() => {
    const h = Array.from(document.querySelectorAll("*")).find(
      (e) => e.shadowRoot && e.shadowRoot.querySelector('[data-pe="body"]'));
    if (!h) return { 無い: true };
    return { 題: (h.shadowRoot.querySelector(".ped-w h2") || {}).textContent || "",
             本文: (h.shadowRoot.querySelector('[data-pe="body"]') || {}).value || "" };
  });
  console.log("編集の 窓:", JSON.stringify(編));
  見(!編.無い && /編集/.test(編.題 || ""), "⑦ 一覧の 鉛筆から そのまま 編集の 窓が 開く", 編);
  見(/自分の 投稿/.test(編.本文 || ""), "⑦ その 投稿の 中身が 入っている", 編.本文);
  await page.evaluate(() => {
    const h = Array.from(document.querySelectorAll("*")).find(
      (e) => e.shadowRoot && e.shadowRoot.querySelector('[data-a="pe-cancel"]'));
    h.shadowRoot.querySelector('[data-a="pe-cancel"]').click();
  });
  await page.waitForTimeout(500);

  /* ── ①〜⑥ 報告 ── */
  await page.evaluate(() => {
    const h = Array.from(document.querySelectorAll("*")).find(
      (e) => e.shadowRoot && e.shadowRoot.querySelector("[data-post]"));
    const r = h.shadowRoot;
    const 人の = Array.from(r.querySelectorAll("[data-post]"))
      .find((c) => !c.querySelector('[data-a="quick-edit"]'));
    人の.querySelector('[data-a="menu"]').click();
  });
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    const h = Array.from(document.querySelectorAll("*")).find(
      (e) => e.shadowRoot && e.shadowRoot.querySelector('[data-a="mn-report"]'));
    h.shadowRoot.querySelector('[data-a="mn-report"]').click();
  });
  await page.waitForTimeout(900);

  const 窓 = () => page.evaluate(() => {
    const h = Array.from(document.querySelectorAll("*")).find(
      (e) => e.shadowRoot && e.shadowRoot.querySelector(".rp-l, .rp-o"));
    if (!h) return { 無い: true };
    const r = h.shadowRoot;
    const 送 = r.querySelector('[data-a="rp-send"]');
    return {
      題: (r.querySelector(".ped-w h2") || {}).textContent || "",
      理由の数: r.querySelectorAll(".rp-o").length,
      送れる: 送 ? !送.disabled : null,
      その他欄: !!r.querySelector('[data-rp="other"]'),
      くわしく欄: !!r.querySelector('[data-rp="detail"]'),
      文: (r.textContent || "").replace(/\s+/g, " ").slice(0, 200)
    };
  });
  let w = await 窓();
  console.log("報告の 窓:", JSON.stringify(w));
  見(システムの窓 === 0, "① システムの 窓が 出ていない（" + システムの窓 + " 回）", システムの窓);
  見(!w.無い && /報告/.test(w.題 || ""), "② アプリの 窓が 出た", w.題);
  見(w.理由の数 >= 6, "② 理由が 並ぶ（" + w.理由の数 + " 個）", w.理由の数);
  見(w.送れる === false, "③ 選ばないと 送れない", w.送れる);
  見(!w.くわしく欄, "③ 選ぶまで「くわしく」は 出ない");

  /* ④ その他 */
  await page.evaluate(() => {
    const h = Array.from(document.querySelectorAll("*")).find(
      (e) => e.shadowRoot && e.shadowRoot.querySelector('[data-a="rp-pick"][data-v="other"]'));
    h.shadowRoot.querySelector('[data-a="rp-pick"][data-v="other"]').click();
  });
  await page.waitForTimeout(600);
  w = await 窓();
  console.log("その他:", JSON.stringify(w));
  見(w.その他欄, "④ その他を 選ぶと「どんなことですか？」が 出る");
  見(w.くわしく欄, "⑤ 「くわしく」も 出る");
  見(w.送れる === false, "④ その他は 書くまで 送れない", w.送れる);

  await page.evaluate(() => {
    const h = Array.from(document.querySelectorAll("*")).find(
      (e) => e.shadowRoot && e.shadowRoot.querySelector('[data-rp="other"]'));
    const o = h.shadowRoot.querySelector('[data-rp="other"]');
    o.value = "待ち合わせの 約束を 破られた";
    o.dispatchEvent(new Event("input", { bubbles: true }));
    const d = h.shadowRoot.querySelector('[data-rp="detail"]');
    if (d) { d.value = "8 月 28 日の 書き込みです。"; d.dispatchEvent(new Event("input", { bubbles: true })); }
  });
  await page.waitForTimeout(300);
  /* 送りを 覗く */
  const 送り = [];
  await page.route("**/api/support/submit", async (route) => {
    try { 送り.push(JSON.parse(route.request().postData() || "{}")); } catch (e) {}
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
  await page.evaluate(() => {
    const h = Array.from(document.querySelectorAll("*")).find(
      (e) => e.shadowRoot && e.shadowRoot.querySelector('[data-a="rp-send"]'));
    h.shadowRoot.querySelector('[data-a="rp-send"]').click();
  });
  await page.waitForTimeout(1500);
  const 荷 = 送り[0] || {};
  console.log("送った 中身:", JSON.stringify(荷).slice(0, 400));
  見(送り.length === 1, "⑥ お問い合わせの 口へ 1 回 飛んだ", 送り.length);
  見(String(荷.subject || "").indexOf("その他") >= 0, "⑥ 題に 理由が 入る", 荷.subject);
  見(/待ち合わせの 約束を 破られた/.test(String(荷.body || "")), "⑥ その他の 中身が 入る", 荷.body);
  見(/8 月 28 日/.test(String(荷.body || "")), "⑥ くわしくも 入る", 荷.body);
  見((荷.metadata || {}).selectedReason === "other", "⑥ 選んだ 理由の 印も 付く", 荷.metadata);
  見(システムの窓 === 0, "① 最後まで システムの 窓は 出ていない", システムの窓);
  見(例外.length === 0, "画面の 例外 0 件", 例外.slice(0, 3));

  await b.close();
  console.log(`\n通った ${済} ／ 落ち ${落}`);
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error("✗ 途中で 落ちた:", e && e.stack); process.exit(1); });
