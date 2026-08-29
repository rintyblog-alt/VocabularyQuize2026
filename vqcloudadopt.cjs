/* ══════════════════════════════════════════════════════════════════════════
   vqcloudadopt.cjs — **画面を 閉じたまま 終わった 生成**を、あとから
   プリセットに できるかを 実物で 確かめる。

   訴え（2026-08-29）:
     「閉じても リロードしても、同じ 処理を バッググラウンドする だけ」
     「なんで いちいち 問題文が 空に なるのか 不明」

   見るところ:
     ① 同じ 注文（orderId）の 仕事が 2 件 でも **プリセットは 1 つ**
     ② できた プリセットの **問題文が 空で ない**
     ③ 2 回 拾っても 増えない

   使い方: VQ_TOKEN=<札> node vqcloudadopt.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const { chromium } = require("playwright");
const BASE = process.env.VQ_BASE || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) {
  console.error("本番では実行しません。"); process.exit(2);
}
const j = (r) => r.json();
const sleep = (ms) => new Promise((s) => setTimeout(s, ms));
const token = process.env.VQ_TOKEN;
if (!token) { console.error("VQ_TOKEN を 渡してください。"); process.exit(2); }

(async () => {
  const H = { "Content-Type": "application/json", Authorization: "Bearer " + token };
  const order = "run_test_" + Date.now();
  console.log("注文の目印:", order);

  /* ── 同じ 注文で 2 件 走らせる（画面が 分けて 頼むのと 同じ形） ── */
  const ids = [];
  for (const ask of ["江戸時代について 4択で 2問", "明治時代について 4択で 2問"]) {
    const r = await fetch(BASE + "/api/aigen/questions", {
      method: "POST", headers: H,
      body: JSON.stringify({ prompt: ask, count: 2, track: true, orderId: order })
    }).then(j);
    if (r.jobId) ids.push(r.jobId);
    console.log("  頼んだ:", ask, "→", r.jobId || JSON.stringify(r).slice(0, 120));
  }

  /* ── 終わるまで 待つ ── */
  for (let i = 0; i < 200; i++) {
    await sleep(1500);
    const st = [];
    for (const id of ids) {
      const g = await fetch(BASE + "/api/aijob/get?jobId=" + encodeURIComponent(id), { headers: H }).then(j);
      st.push(g && g.job && g.job.status);
    }
    if (st.every((x) => ["completed", "partial", "failed", "cancelled"].includes(x))) {
      console.log("  台帳:", st.join(" / ")); break;
    }
  }
  /* 取り込みは「終わってから 20 秒」を 待つ 作り。そのぶん 待つ。 */
  console.log("  20 秒 待つ（開いている 画面に 譲る 猶予）…");
  await sleep(22000);

  const b = await chromium.launch();
  const page = await b.newPage();
  const 訴 = [];
  page.on("console", (m) => { const t = m.text(); if (/cloud gen|error/i.test(t)) 訴.push(t.slice(0, 200)); });
  await page.addInitScript((tk) => {
    try {
      localStorage.setItem("app.auth.token.v1", tk);
      localStorage.setItem("app.auth.mode.v1", "user");
      localStorage.setItem("vq.auth.token", tk);
    } catch (e) {}
  }, token);
  await page.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.VQ2 && window.VQ2.store && window.__vqCloudGen, null, { timeout: 60000 });
  await page.waitForTimeout(4000);

  const 前 = await page.evaluate(() => (window.VQ2.store.listPresets() || []).length);
  const n1 = await page.evaluate(() => window.__vqCloudGen.adopt());
  await page.waitForTimeout(1500);
  /* ★ 「同じ 口」を 通っているか（2026-08-29・訴え）。
     画面が 通る 関数を、うしろの 取り込みも 呼んでいる ことを 確かめる。 */
  const 口 = await page.evaluate(() => ({
    同じ口: typeof (window.VQ2.presetStudio || {}).fromCloud === "function",
    題: (window.VQ2.presetStudio || {}).cloudTitle
      ? window.VQ2.presetStudio.cloudTitle("鎌倉時代について 4択で 10問 作ってください") : "",
    絵: (window.VQ2.presetStudio || {}).cloudIcon
      ? window.VQ2.presetStudio.cloudIcon("日本史の 鎌倉時代", "") : ""
  }));
  console.log("口:", JSON.stringify(口));

  const 見え = await page.evaluate((ord) => {
    const list = window.VQ2.store.listPresets() || [];
    const mine = list.filter((p) => String(p.sourceOrderId || "") === ord);
    return {
      全体: list.length,
      この注文: mine.length,
      中身: mine.map((p) => {
        const qs = (window.VQ2.store.getPreset(p.id, {}) || {}).questions || [];
        return { 名: p.name, 問数: qs.length,
                 空: qs.filter((q) => !String(q.prompt || "").trim()).length,
                 絵: (p.appearance && p.appearance.icon) || "",
                 例: String((qs[0] || {}).prompt || "").slice(0, 40) };
      })
    };
  }, order);
  /* ★ 画面が 保存した ぶんは 拾い直さない（目印 sourceOrderId で 見送る）。 */
  const 二重 = await page.evaluate(async (ord) => {
    const V = window.VQ2;
    /* 画面が 作った ことに する（同じ 目印を 押した プリセットを 1 つ 置く） */
    const np = V.schema.emptyPreset({ name: "画面が 作った ぶん", description: "",
      questions: [] });
    np.sourceOrderId = ord + "_screen";
    V.store.savePreset(np);
    return { 置いた: true };
  }, order);
  const n2 = await page.evaluate(() => window.__vqCloudGen.adopt());
  await page.waitForTimeout(800);
  const 後 = await page.evaluate((ord) =>
    (window.VQ2.store.listPresets() || []).filter((p) => String(p.sourceOrderId || "") === ord).length, order);

  console.log("取り込み:", n1, "件目 →", JSON.stringify(見え, null, 2));
  if (訴.length) console.log("画面の 訴え:", 訴.slice(0, 6));
  await b.close();

  let 落 = 0;
  const 見 = (ok, 名) => { console.log((ok ? "✓ " : "✗ ") + 名); if (!ok) 落++; };
  見(ids.length === 2, "仕事が 2 件 立った");
  見(口.同じ口, "★ **画面と 同じ 口**（VQ2.presetStudio.fromCloud）が ある");
  見(口.題 === "鎌倉時代", "★ 題を その場で 作れる（" + 口.題 + "）", 口.題);
  見(!!口.絵, "★ アイコンを その場で 決められる（" + 口.絵 + "）", 口.絵);
  見(見え.この注文 === 1, "同じ 注文は **1 つの プリセット**（" + 見え.この注文 + " 個）");
  const c = 見え.中身[0] || {};
  見((c.問数 || 0) > 0, "問題が 入っている（" + (c.問数 || 0) + " 問）");
  見(c.空 === 0, "**問題文が 空の ものが 無い**（空 " + c.空 + " 件）");
  見(!!String(c.例 || "").trim(), "1 問目の 問題文: " + (c.例 || "（空）"));
  見(!!String(c.名 || "").trim() && c.名 !== "新しいプリセット",
     "★ 題名が 付いている（" + c.名 + "）", c.名);
  見(!!String(c.絵 || "").trim(), "★ アイコンが 付いている（" + c.絵 + "）", c.絵);
  見(n2 === 0 && 後 === 1, "2 回 拾っても 増えない（追加 " + n2 + " 件・合計 " + 後 + " 個）");
  console.log(`\n落ち ${落} 件`);
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error("✗ 途中で 落ちた:", e && e.stack); process.exit(1); });
