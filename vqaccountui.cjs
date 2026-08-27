/* ══════════════════════════════════════════════════════════════════════
   vqaccountui.cjs — **端末を 2 台 用意して** 揃うことを 確かめる

   訴えの 核心:
     「端末を 変えると、同じアカウントでも 全く プリセットが 異なる」

   ここで 見るのは 1 つだけ:
     ★ **どちらの端末の プリセットも 消えないこと。**
       端末 A に 1,2 / 端末 B に 3 が 在るとき、
       揃えたあと 両方に 1,2,3 が 在ること。
       まるごと 上書きだと どちらかが 必ず 消える。
       いまの利用者は まさに その状態（両方に 別々のものが 溜まっている）なので、
       上書きで 揃えると **作ったものを 失わせる**。

   端末 2 台は、Playwright の 別の コンテキスト（別の localStorage）で 作る。

   使い方: node vqaccountui.cjs      （先に server/dev-local.sh echo）
   ══════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_UI || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ok   " + n); }
  else { fail++; bad.push(n); console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 400) : "")); }
};
const 節 = (t) => console.log("\n══ " + t + " ══");

const プリセット = (id, 名, 時) => ({
  id, name: 名, schemaVersion: 2, ownerId: "u", updatedAt: 時, createdAt: 時, revision: 1,
  questions: [{ id: id + "-q1", type: "multiple_choice", prompt: 名 + "の問題",
                choices: ["あ", "い", "う", "え"], answerIndex: 0 }]
});

(async () => {
  const { chromium } = require("playwright");
  const browser = await chromium.launch();

  /* 1 つの アカウントを 先に 作る */
  const nick = "ui" + Date.now().toString(36).slice(-6) + Math.floor(Math.random() * 90 + 10);
  const reg = await fetch(BASE + "/api/auth/register", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gradePrefix: "H1", nickname: nick, password: "DevAcc#2026a",
                           tosAccepted: true, tosVersion: "1" })
  });
  const { token } = await reg.json();
  if (!token) { console.error("アカウントを 作れません"); process.exit(1); }
  console.log("同じアカウント: " + nick);

  /* 端末を 1 台 用意する（別の localStorage） */
  async function 端末(名, 中身) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const 赤 = [];
    page.on("pageerror", (e) => 赤.push(String(e && e.message || e)));
    await page.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(3000);
    await page.evaluate(([t, 品]) => {
      localStorage.setItem("app.auth.token.v1", t);
      /* 素の localStorage へ 直に 置く（この端末に もともと 在った、という状態） */
      Storage.prototype.setItem.call(localStorage, "vq2.presets.v1", JSON.stringify(品));
    }, [token, 中身]);
    return { 名, ctx, page, 赤 };
  }

  節("① 2 台の 端末に **別々の** プリセットが 在る");
  const A = await 端末("A", [プリセット("p1", "英単語", "2026-08-19T01:00:00.000Z"),
                             プリセット("p2", "日本史", "2026-08-19T02:00:00.000Z")]);
  const B = await 端末("B", [プリセット("p3", "化学", "2026-08-19T03:00:00.000Z")]);

  const 数 = (p) => p.evaluate(() => {
    try { const a = JSON.parse(localStorage.getItem("vq2.presets.v1") || "[]"); return a.map((x) => x.id); }
    catch (e) { return null; }
  });
  ok("端末 A は 2 件", (await 数(A.page)).length === 2, await 数(A.page));
  ok("端末 B は 1 件（A とは 別のもの）", (await 数(B.page)).length === 1, await 数(B.page));

  節("② 揃える（A → サーバ → B）");
  const 揃A = await A.page.evaluate(async () => {
    if (!window.VQCLOUD) return { だめ: "VQCLOUD が いない" };
    window.VQCLOUD.あとで揃える("vq2.presets.v1");
    const r = await window.VQCLOUD.いま揃える();
    return r;
  });
  ok("端末 A が 送れた", 揃A && !揃A.だめ && (揃A.送った || []).length >= 1, 揃A);

  const 揃B = await B.page.evaluate(async () => {
    if (!window.VQCLOUD) return { だめ: "VQCLOUD が いない" };
    return await window.VQCLOUD.揃えを引く(true);
  });
  ok("端末 B が 引けた", 揃B && !揃B.だめ, 揃B);
  await B.page.waitForTimeout(1200);

  const Bの中身 = await 数(B.page);
  節("③ ★ どちらの端末の ものも 消えていないか");
  ok("端末 B に A の 2 件が 来ている",
     Bの中身 && Bの中身.includes("p1") && Bの中身.includes("p2"), Bの中身);
  ok("端末 B の 元の 1 件が 消えていない", Bの中身 && Bの中身.includes("p3"), Bの中身);
  ok("端末 B は 3 件になる", Bの中身 && Bの中身.length === 3, Bの中身);

  /* B が 揃え返したものを A が 引く */
  const 揃A2 = await A.page.evaluate(async () => await window.VQCLOUD.揃えを引く(true));
  await A.page.waitForTimeout(1200);
  const Aの中身 = await 数(A.page);
  ok("端末 A にも B の 1 件が 来ている", Aの中身 && Aの中身.includes("p3"), Aの中身);
  ok("端末 A の 元の 2 件も 残っている",
     Aの中身 && Aの中身.includes("p1") && Aの中身.includes("p2"), Aの中身);
  ok("端末 A も 3 件になる", Aの中身 && Aの中身.length === 3, { Aの中身, 揃A2 });

  節("④ 同じ id を 両方で 直したら 新しいほうが 残る");
  await A.page.evaluate(() => {
    const a = JSON.parse(localStorage.getItem("vq2.presets.v1"));
    const p = a.find((x) => x.id === "p1");
    p.name = "英単語（Aで直した）"; p.updatedAt = "2026-08-19T10:00:00.000Z";
    localStorage.setItem("vq2.presets.v1", JSON.stringify(a));
  });
  await B.page.evaluate(() => {
    const a = JSON.parse(localStorage.getItem("vq2.presets.v1"));
    const p = a.find((x) => x.id === "p1");
    p.name = "英単語（Bで直した・こちらが新しい）"; p.updatedAt = "2026-08-19T11:00:00.000Z";
    localStorage.setItem("vq2.presets.v1", JSON.stringify(a));
  });
  await A.page.evaluate(async () => await window.VQCLOUD.いま揃える());
  await B.page.evaluate(async () => await window.VQCLOUD.いま揃える());
  await A.page.evaluate(async () => await window.VQCLOUD.揃えを引く(true));
  await A.page.waitForTimeout(800);
  const p1名 = await A.page.evaluate(() => {
    const a = JSON.parse(localStorage.getItem("vq2.presets.v1"));
    return (a.find((x) => x.id === "p1") || {}).name;
  });
  ok("新しいほう（B で直した）が 残る", /Bで直した/.test(String(p1名)), p1名);
  const 最後の数 = await 数(A.page);
  ok("件数は 3 件のまま（重なっていない）", 最後の数 && 最後の数.length === 3, 最後の数);

  節("⑤ 会話も 端末を またいで 残るか");
  await A.page.evaluate(async () => {
    localStorage.setItem("app.chat.sessions.v2", JSON.stringify([
      { id: "ses-x", title: "端末 A で 話した", updatedAt: Date.now() }]));
    localStorage.setItem("app.chat.ses.ses-x.v2", JSON.stringify([
      { id: "m1", role: "user", text: "これは 端末 A の 会話" }]));
    await window.VQCLOUD.いま送る();
  });
  const B会話 = await B.page.evaluate(async () => {
    await window.VQCLOUD.引く(true);
    return localStorage.getItem("app.chat.ses.ses-x.v2");
  });
  ok("端末 B でも 会話が 読める", /端末 A の 会話/.test(String(B会話 || "")), String(B会話 || "").slice(0, 80));

  節("⑥ 手元が 一杯でも プリセットが 半分に ならないか");
  /* ★ もとの writeAll は 容量超過のとき **並びを 半分に 削って** 保存し、
     しかも ok:true を 返していた（＝黙って 半分 消えて 成功と 報告）。
     アカウントごとの 同期を 足すと、その 削れた並びが サーバへ 行き、
     **他の端末の ぶんまで 消える**。ここを 実際に 詰まらせて 確かめる。 */
  const 一杯 = await A.page.evaluate(async () => {
    const 元 = JSON.parse(localStorage.getItem("vq2.presets.v1") || "[]");
    /* localStorage を わざと 埋める */
    const 詰め = "x".repeat(256 * 1024);
    let 詰めた = 0;
    try { for (let i = 0; i < 40; i++) { Storage.prototype.setItem.call(localStorage, "t" + i, 詰め); 詰めた++; } }
    catch (e) {}
    /* 一杯の状態で 1 件 足す（本体と 同じ道＝ localStorage.setItem） */
    const 新 = 元.concat([{ id: "p9", name: "一杯のときに 作った", schemaVersion: 2,
      updatedAt: "2026-08-19T12:00:00.000Z", questions: [] }]);
    let 投げた = false;
    try { localStorage.setItem("vq2.presets.v1", JSON.stringify(新)); }
    catch (e) { 投げた = true; }
    /* 片づけ */
    for (let i = 0; i < 詰めた; i++) { try { localStorage.removeItem("t" + i); } catch (e) {} }
    const 読めた = JSON.parse(localStorage.getItem("vq2.presets.v1") || "[]");
    return { 詰めた, 投げた, 元の数: 元.length, 書いた数: 新.length, 読めた数: 読めた.length,
             ids: 読めた.map((x) => x.id) };
  });
  ok("手元を 実際に 一杯にできた", 一杯.詰めた > 0, 一杯.詰めた + " 個");
  ok("一杯でも 例外を 投げない（半分に 削る道へ 入らない）", 一杯.投げた === false, 一杯);
  ok("★ 1 件も 減っていない", 一杯.読めた数 === 一杯.書いた数, 一杯);
  ok("新しく 作ったものも 読める", (一杯.ids || []).includes("p9"), 一杯.ids);

  const 一杯後 = await A.page.evaluate(async () => {
    await window.VQCLOUD.いま揃える();
    const t = localStorage.getItem("app.auth.token.v1");
    const r = await fetch("/api/account/store?key=vq2.presets.v1", { headers: { Authorization: "Bearer " + t } });
    const d = await r.json();
    try { return JSON.parse(d.value || "[]").map((x) => x.id); } catch (e) { return null; }
  });
  ok("サーバにも 減らずに 上がる", (一杯後 || []).length === 一杯.書いた数, { サーバ: 一杯後, 期待: 一杯.書いた数 });

  節("⑦ 赤い字が 出ていない");
  const 赤 = A.赤.concat(B.赤).filter((x) => !/favicon|ERR_|Failed to load/i.test(x));
  ok("画面の例外が 0（" + 赤.length + "）", 赤.length === 0, 赤.slice(0, 4));

  await browser.close();
  console.log("\n════════════════════════════════════════════");
  console.log("  合計 " + (pass + fail) + " 件 / 通った " + pass + " / 落ちた " + fail);
  if (bad.length) { console.log("  落ちたもの:"); bad.forEach((b) => console.log("   - " + b)); }
  console.log("════════════════════════════════════════════");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("落ちました: " + (e && e.stack || e)); process.exit(1); });
