/* selftest.html をブラウザで開き、赤い行が無いことを確かめる。
   実行: NODE_PATH=/opt/node22/lib/node_modules node studio/tests/e2e/selftest.mjs */
import { serve } from "./serve.mjs";
import { chromium } from "playwright";

const { server, port } = await serve(0);
const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const logs = [];
page.on("console", (m) => { if (m.type() === "error") logs.push(m.text()); });
page.on("pageerror", (e) => logs.push("pageerror: " + String(e && e.message || e)));

await page.goto(`http://127.0.0.1:${port}/studio/selftest.html`, { waitUntil: "load" });
await page.waitForFunction(() => !!window.__SELFTEST__, null, { timeout: 120000 }).catch(() => {});
const r = await page.evaluate(() => window.__SELFTEST__ || null);

if (!r) {
  console.log("自己診断が終わらなかった（window.__SELFTEST__ が無い）");
} else {
  console.log(`OK ${r.ok} / NG ${r.ng} / SKIP ${r.skip}`);
  for (const row of r.results) {
    if (row.status !== "ok") console.log(`  [${row.status.toUpperCase()}] ${row.name} ${row.note || ""}`);
  }
}
if (logs.length) { console.log("--- console errors ---"); logs.slice(0, 40).forEach((l) => console.log("  " + l.slice(0, 300))); }
await page.screenshot({ path: process.env.SHOT || "/tmp/selftest.png", fullPage: true }).catch(() => {});
await browser.close();
server.close();
process.exit(r && r.ng ? 1 : 0);
