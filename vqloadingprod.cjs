#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqloadingprod.cjs — 本番に 出したあとの 煙検査。

   全画面の「読み込み中」が **勝手に 出ない** ことを、本番の 画面を
   そのまま 開いて 150 秒 見張って 確かめる。

   触るのは 読み取りだけ。**本番の データは 変えない**（ログインも しない・
   検証アカウントも 作らない）。1 分ごとの 通知の 取り直しは ログインの
   有無に かかわらず 走るので、開いて 待つだけで 測れる。

   使い方: node vqloadingprod.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_PROD || "https://www.vocabuquiz.app";
const 秒 = Number(process.env.SEC || 150);
const { chromium } = require("playwright");
let pass = 0, fail = 0;
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ok   " + n + (x ? "  → " + x : "")); }
  else { fail++; console.log("  NG   " + n + (x ? "  → " + x : "")); }
};

(async () => {
  console.log("本番: " + BASE + "\n");
  const b = await chromium.launch({ headless: true });
  const p = await (await b.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
  await p.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await p.waitForFunction(() => !!document.getElementById("globalLoadingOverlay"), null, { timeout: 60000 });

  await p.evaluate(() => {
    const ov = document.getElementById("globalLoadingOverlay");
    window.__ovLog = [];
    const t0 = performance.now();
    let 前 = !ov.classList.contains("hidden");
    new MutationObserver(() => {
      const 出 = !ov.classList.contains("hidden");
      if (出 === 前) return;
      前 = 出;
      window.__ovLog.push({ ms: Math.round(performance.now() - t0), 出 });
    }).observe(ov, { attributes: true, attributeFilter: ["class"] });
  });

  console.log(`  … ${秒} 秒 なにも 触らずに 見張ります（1 分の 見張りを 2 回 またぐ）`);
  await p.waitForTimeout(秒 * 1000);

  const log = await p.evaluate(() => window.__ovLog);
  const 出た = log.filter((e) => e.出);
  console.log("\n══ 全画面の 覆い ══");
  for (const e of log) console.log(`   ${String(e.ms).padStart(7)}ms  ${e.出 ? "出た ▶" : "消えた ◀"}`);
  ok("何も 触らずに いる 間は 一度も 出ない", 出た.length === 0, `${出た.length} 回 / ${秒} 秒`);
  ok("新しい 本体が 配られている",
    await p.evaluate(() => !!document.querySelector('script[src*="/js/vq-core."]')),
    await p.evaluate(() => (document.querySelector('script[src*="/js/vq-core."]') || {}).src || ""));

  await b.close();
  console.log(`\n  ok ${pass} / NG ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
