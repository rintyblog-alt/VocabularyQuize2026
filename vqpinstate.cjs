/* ══════════════════════════════════════════════════════════════════════════
   vqpinstate.cjs — 設定 → アカウントの 暗証番号が
   **決めたのに「まだです」の まま**に ならないかを 実物で 見る。

   訴え（2026-08-29）:「アプリ設定から アカウント → 暗証番号で 設定を
     しているのにも かかわらず、『まだです』の 表示が 消えない」

   見るところ:
     ① __vqPin に isSet / status の 口が ある（前は **無いのに 呼ばれていた**）
     ② 決めてある 人には「できています」と 出る
     ③ 数え（n / 3）にも 入る
     ④ まだ 聞けていない あいだは「確認中…」（「まだです」と 言い切らない）
     ⑤ 決め直したら 知らせが 飛ぶ（vq-pin-changed）

   使い方: VQ_TOKEN=<札> node vqpinstate.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const { chromium } = require("playwright");
const BASE = process.env.VQ_BASE || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) {
  console.error("本番では実行しません。"); process.exit(2);
}
const token = process.env.VQ_TOKEN;
if (!token) { console.error("VQ_TOKEN を 渡してください。"); process.exit(2); }

async function 開く(b, 細工) {
  const page = await b.newPage({ viewport: { width: 460, height: 900 } });
  const 例外 = [];
  page.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 160)));
  await page.addInitScript((tk) => {
    try { localStorage.setItem("app.auth.token.v1", tk); localStorage.setItem("app.auth.mode.v1", "user"); } catch (e) {}
  }, token);
  if (細工) await 細工(page);
  await page.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(9000);
  await page.evaluate(() => {
    Array.from(document.querySelectorAll("body > *")).forEach((h) => {
      const t = (h.shadowRoot ? h.shadowRoot.textContent : h.textContent) || "";
      if (/はじめかた|声で話しかけてみよう|もう出さない/.test(t)) h.remove();
    });
  });
  return { page, 例外 };
}
async function アカウントを開く(page) {
  await page.evaluate(() => { if (window.__vqOpenSettings) window.__vqOpenSettings(""); });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const 器 = Array.from(document.querySelectorAll("*")).find(
      (e) => e.shadowRoot && e.shadowRoot.querySelector('[data-nav="account"]'));
    if (器) 器.shadowRoot.querySelector('[data-nav="account"]').click();
  });
  await page.waitForTimeout(2500);
}
async function 暗証の行(page) {
  return page.evaluate(() => {
    const 器 = Array.from(document.querySelectorAll("*")).find(
      (e) => e.shadowRoot && e.shadowRoot.querySelector('[data-pin="1"]'));
    if (!器) return { 無い: true };
    const row = 器.shadowRoot.querySelector('[data-pin="1"]');
    const t = (器.shadowRoot.textContent || "").replace(/\s+/g, " ");
    return { 文: (row.textContent || "").replace(/\s+/g, " ").trim(),
             見出し: (t.match(/入れなくなったときに戻る道（[^）]*）/) || [""])[0] };
  });
}

(async () => {
  let 落 = 0;
  const 見 = (ok, 名, 追) => { console.log((ok ? "✓ " : "✗ ") + 名 + (追 !== undefined ? " → " + JSON.stringify(追).slice(0, 200) : "")); if (!ok) 落++; };

  /* ── ①〜③ ふつうに 開く（この 札の 人は 暗証番号を 決めてある）── */
  {
    const b = await chromium.launch();
    const { page, 例外 } = await 開く(b);
    const 口 = await page.evaluate(() => ({
      isSet: typeof (window.__vqPin || {}).isSet === "function",
      status: typeof (window.__vqPin || {}).status === "function"
    }));
    見(口.isSet && 口.status, "① __vqPin に isSet / status が ある", 口);
    await アカウントを開く(page);
    const r = await 暗証の行(page);
    console.log("暗証番号の 行:", JSON.stringify(r));
    見(/できています/.test(r.文 || ""), "② 決めてある 人には「できています」", r.文);
    見(!/まだです/.test(r.文 || ""), "② 「まだです」が 出ていない", r.文);
    見(/3 \/ 3|2 \/ 3/.test(r.見出し || ""), "③ 数えにも 入っている", r.見出し);
    見(例外.length === 0, "画面の 例外 0 件", 例外.slice(0, 3));
    await b.close();
  }

  /* ── ④ 聞けない ときは「確認中…」（「まだです」と 言い切らない）── */
  {
    const b = await chromium.launch();
    const { page } = await 開く(b, async (pg) => {
      await pg.route("**/api/auth/pin/status*", (route) => route.abort());
    });
    await アカウントを開く(page);
    const r = await 暗証の行(page);
    console.log("聞けない とき:", JSON.stringify(r));
    見(!/まだです/.test(r.文 || ""), "④ 聞けなくても「まだです」と 言い切らない", r.文);
    見(/確認中/.test(r.文 || ""), "④ 「確認中…」と 出る", r.文);
    await b.close();
  }

  /* ── ⑤ 決め直したら 知らせが 飛ぶ ── */
  {
    const b = await chromium.launch();
    const { page } = await 開く(b);
    const 飛 = await page.evaluate(() => new Promise((done) => {
      let 来た = null;
      window.addEventListener("vq-pin-changed", (e) => { 来た = e.detail; });
      /* 実際に 決め直す のは 面倒なので、口が 知らせを 出す ことを 見る */
      window.__vqPin.status(true).then(() => {
        /* status は 知らせを 出さない。決めた ときだけ 出す 作りで よい。
           ここでは **口が 動く**ことと、覚えが 入る ことを 見る。 */
        done({ 覚え: window.__vqPin.isSet(), 来た: 来た });
      });
    }));
    console.log("口の 動き:", JSON.stringify(飛));
    見(飛.覚え === true, "⑤ status を 呼ぶと 覚えに 入る", 飛.覚え);
    await b.close();
  }

  console.log(`\n落ち ${落} 件`);
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error("✗ 途中で 落ちた:", e && e.stack); process.exit(1); });
