/* ══════════════════════════════════════════════════════════════════════════
   vqstoragepanel.cjs — 設定の「ストレージ」が **止まらない**ことと、
   プリセットの 置き場が ちゃんと 出ることを 実物で 見る。

   訴え（2026-08-29）:
     「ストレージが ずっと 数えています…の 状態」
     「プリセットが 容量いっぱいで 保存されない」
     「プリセットを 保存する 容量は どれだけ あるか？」

   見るところ:
     ① サーバが 遅くても **この端末の 数字は すぐ 出る**
     ② サーバが 落ちても「数えています…」で 止まらない（訳が 出て 押し直せる）
     ③ プリセットの 置き場が 出る（どこに・どれだけ・上限）
     ④ クラウドへ 置けていない ものが あれば **隠さず 赤で 出す**
     ⑤ 返って くれば ふつうに 出る

   使い方: VQ_TOKEN=<札> node vqstoragepanel.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const { chromium } = require("playwright");
const BASE = process.env.VQ_BASE || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) {
  console.error("本番では実行しません。"); process.exit(2);
}
const token = process.env.VQ_TOKEN;
if (!token) { console.error("VQ_TOKEN を 渡してください。"); process.exit(2); }
const SP = process.env.SP || ".";

async function 開く(b, 細工) {
  const page = await b.newPage({ viewport: { width: 460, height: 900 }, deviceScaleFactor: 2 });
  const 例外 = [];
  page.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 160)));
  await page.addInitScript((tk) => {
    try { localStorage.setItem("app.auth.token.v1", tk); localStorage.setItem("app.auth.mode.v1", "user"); } catch (e) {}
  }, token);
  if (細工) await 細工(page);
  await page.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(9000);
  /* 案内の 覆いを どける */
  await page.evaluate(() => {
    Array.from(document.querySelectorAll("body > *")).forEach((h) => {
      const t = (h.shadowRoot ? h.shadowRoot.textContent : h.textContent) || "";
      if (/はじめかた|声で話しかけてみよう|もう出さない/.test(t)) h.remove();
    });
  });
  return { page, 例外 };
}

async function ストレージを開く(page) {
  const r = await page.evaluate(() => {
    if (typeof window.__vqOpenSettings !== "function") return { 口が無い: true };
    window.__vqOpenSettings("");
    return { 開いた: true };
  });
  await page.waitForTimeout(1200);
  const r2 = await page.evaluate(() => {
    const 器 = Array.from(document.querySelectorAll("*")).find(
      (e) => e.shadowRoot && e.shadowRoot.querySelector('[data-nav="storage"]'));
    if (!器) return { nav無し: true,
      影の数: Array.from(document.querySelectorAll("*")).filter((e) => e.shadowRoot).length };
    器.shadowRoot.querySelector('[data-nav="storage"]').click();
    return { 押した: true };
  });
  return Object.assign({}, r, r2);
}
async function 中身(page) {
  return page.evaluate(() => {
    const 器 = Array.from(document.querySelectorAll("*")).find(
      (e) => e.shadowRoot && e.shadowRoot.querySelector('[data-nav="storage"]'));
    if (!器) return { 無い: true };
    const r = 器.shadowRoot;
    const t = (r.textContent || "").replace(/\s+/g, " ");
    const 枡 = Array.from(r.querySelectorAll(".stg2-c")).map((e) =>
      (e.textContent || "").replace(/\s+/g, " ").slice(0, 60));
    return { 文: t.slice(0, 1400), 枡: 枡,
             プリセットの節: /プリセットの 置き場/.test(t),
             数えています: /数えています…/.test(t),
             押し直せる: !!r.querySelector('[data-dev="recount"]'),
             上限行: /クラウドへ 送れる 大きさ/.test(t),
             赤: /置けていない ものが/.test(t) };
  });
}

(async () => {
  let 落 = 0;
  const 見 = (ok, 名, 追) => { console.log((ok ? "✓ " : "✗ ") + 名 + (追 !== undefined ? " → " + JSON.stringify(追).slice(0, 300) : "")); if (!ok) 落++; };

  /* ── ① サーバを **わざと 落として** 開く ── */
  {
    const b = await chromium.launch();
    const { page, 例外 } = await 開く(b, async (pg) => {
      await pg.route("**/api/storage/usage*", (route) => route.abort());
    });
    const o = await ストレージを開く(page);
    await page.waitForTimeout(2500);
    const c = await 中身(page);
    console.log("── サーバが 落ちている とき ──", JSON.stringify(o));
    console.log("  枡:", JSON.stringify(c.枡));
    見(c.枡 && c.枡.length >= 2, "① この端末の 数字が すぐ 出る", c.枡);
    見(/この端末/.test((c.枡 || []).join("")), "① 「この端末」の 枡が ある");
    見(c.押し直せる, "② 押し直せる ボタンが ある");
    見(c.プリセットの節, "③ プリセットの 置き場が 出る");
    見(c.上限行, "③ クラウドへ 送れる 大きさが 出る");
    見(例外.length === 0, "画面の 例外 0 件", 例外.slice(0, 3));
    await page.screenshot({ path: SP + "/stg-down.png" });
    await b.close();
  }

  /* ── ② 大きすぎる 鍵が あるとき、隠さず 出るか ── */
  {
    const b = await chromium.launch();
    const { page } = await 開く(b);
    await page.evaluate(() => {
      /* 大きすぎる 印を 立てる（ほんとうに 大きな ものは 作らない） */
      const C = window.VQCLOUD;
      if (!C || !C.様子) return;
      const 元 = C.様子;
      C.様子 = function () {
        const o = 元.call(C);
        o.揃えるもの = Object.assign({}, o.揃えるもの, {
          "vq2.presets.v1": { バイト: 26 * 1024 * 1024, 件数: 120 }
        });
        o.大きすぎる = { "vq2.presets.v1": { バイト: 26 * 1024 * 1024, とき: Date.now() } };
        return o;
      };
    });
    await ストレージを開く(page);
    await page.waitForTimeout(2500);
    const c = await 中身(page);
    console.log("── 大きすぎる 鍵が ある とき ──");
    見(c.赤, "④ クラウドへ 置けていない ことを 隠さず 出す");
    await page.screenshot({ path: SP + "/stg-big.png" });
    await b.close();
  }

  /* ── ③ ふつうに 返って くる とき ── */
  {
    const b = await chromium.launch();
    const { page, 例外 } = await 開く(b);
    await ストレージを開く(page);
    await page.waitForTimeout(9000);
    const c = await 中身(page);
    console.log("── ふつうの とき ──");
    console.log("  枡:", JSON.stringify(c.枡));
    見(!c.数えています, "⑤ 「数えています…」で 止まっていない");
    見(c.プリセットの節, "⑤ プリセットの 置き場も 出ている");
    見(例外.length === 0, "画面の 例外 0 件", 例外.slice(0, 3));
    await page.screenshot({ path: SP + "/stg-ok.png" });
    await b.close();
  }

  console.log(`\n落ち ${落} 件`);
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error("✗ 途中で 落ちた:", e && e.stack); process.exit(1); });
