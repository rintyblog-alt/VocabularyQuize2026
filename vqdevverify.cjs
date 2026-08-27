/* デプロイした開発版 URL を実ブラウザで確認する。
   本番へ 1 本もリクエストが出ないことも同時に見る。

   実行: node vqdevverify.cjs
*/
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const DEV = "https://vocabuquiz-api-dev.rintyblog.workers.dev/";
const PROD_HOSTS = ["www.vocabuquiz.app", "vocabuquiz.app", "vocabuquiz-api.rintyblog.workers.dev"];

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; failures.push(name + (detail ? " — " + detail : "")); console.log(`  × ${name}${detail ? " — " + detail : ""}`); }
}

(async () => {
  /* デプロイ直後はエッジ／ブラウザのキャッシュを拾うため、必ず無効化して確かめる */
  const browser = await chromium.launch();
  /* スマホ実機に近い見え方で確認する */
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
      + "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
  });
  const prodHits = [];
  page.on("request", (r) => {
    try { if (PROD_HOSTS.includes(new URL(r.url()).hostname)) prodHits.push(r.url()); } catch (e) {}
  });
  const status = {};
  page.on("response", (r) => { try { status[new URL(r.url()).pathname] = r.status(); } catch (e) {} });

  await page.context().setExtraHTTPHeaders({ "Cache-Control": "no-cache", "Pragma": "no-cache" });
  const resp = await page.goto(DEV + "?cb=" + Date.now(), { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(4000);

  const info = await page.evaluate(() => ({
    title: document.title,
    env: window.VQ_ENV || null,
    isProd: window.VQ_IS_PRODUCTION,
    apiBase: window.VQ_API_BASE || null,
    authBase: window.AUTH_API_BASE || null,
    robots: (document.querySelector('meta[name="robots"]') || {}).content || null,
    dataEnv: document.documentElement.getAttribute("data-vq-env"),
    badge: (() => {
      const b = document.getElementById("vqEnvBadge");
      if (!b) return null;
      const cs = getComputedStyle(b);
      return { text: (b.textContent || "").trim(), pointerEvents: cs.pointerEvents, visible: cs.display !== "none" };
    })()
  }));

  console.log("── 開発版 " + DEV + " ──");
  console.log("   " + JSON.stringify(info, null, 1).replace(/\n/g, "\n   "));
  console.log("");
  ok("HTTP 200", resp && resp.status() === 200, String(resp && resp.status()));
  ok("VQ_ENV が development", info.env === "development", String(info.env));
  ok("VQ_IS_PRODUCTION が false", info.isProd === false);
  ok("タイトルが [DEV] で始まる", /^\[DEV\] /.test(info.title || ""), info.title);
  ok("noindex,nofollow が入る", /noindex/.test(info.robots || "") && /nofollow/.test(info.robots || ""), String(info.robots));
  ok("開発版の帯が出ている（文字は無し）",
    !!(info.badge && info.badge.visible && !info.badge.text), JSON.stringify(info.badge));
  ok("バッジが操作を妨げない", (info.badge || {}).pointerEvents === "none");
  ok("API 接続先が開発版自身", info.apiBase === DEV.replace(/\/+$/, ""), String(info.apiBase));
  ok("window.AUTH_API_BASE も開発版自身", info.authBase === DEV.replace(/\/+$/, ""), String(info.authBase));
  ok("本番ホストへのリクエストが 0 本", prodHits.length === 0, prodHits.slice(0, 5).join(" "));

  const shot = path.join(__dirname, "artifacts", "quick-mock-phase13", "deployed-dev.png");
  fs.mkdirSync(path.dirname(shot), { recursive: true });
  await page.screenshot({ path: shot });
  await browser.close();
  console.log(`\nスクリーンショット: ${shot}`);
  console.log(`\n══ まとめ ══\n  合格 ${pass} / 不合格 ${fail}`);
  failures.forEach((f) => console.log(`    - ${f}`));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("失敗:", e && e.message); process.exit(2); });
