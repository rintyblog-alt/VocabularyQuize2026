/* 開発版として配信されたときの見た目と接続先を、実ブラウザで確かめる。
   Cloudflare へは一切接続しない。ローカルの client/ をそのまま
   「開発版のホスト名」で配ったことにして読み込む。

   確かめること:
     ・[DEV] タイトル / DEVELOPMENT BUILD バッジ / noindex が出る
     ・API の接続先が location.origin になる（本番 API を指さない）
     ・本番ホスト名で開いたときは 何も足されない・本番 API を指す
     ・本番 API へのリクエストが 1 本も出ない

   実行: node vqdevpreview.cjs
*/
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const CLIENT = path.join(ROOT, "client");
const DEV_URL = "https://vocabuquiz-api-dev.rintyblog.workers.dev/";
const PROD_URL = "https://www.vocabuquiz.app/";
const PROD_API_HOST = "vocabuquiz-api.rintyblog.workers.dev";

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; failures.push(name + (detail ? " — " + detail : "")); console.log(`  × ${name}${detail ? " — " + detail : ""}`); }
}

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json" };

/* 指定のオリジンをローカルの client/ で肩代わりする。外部へは出さない。 */
async function serveLocally(page, origin, blocked) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    const host = url.hostname;
    if (host === PROD_API_HOST) { blocked.push(url.href); return route.abort(); }
    if (url.origin !== new URL(origin).origin) {
      /* 外部 CDN / Firebase などは触らない */
      blocked.push(url.href);
      return route.fulfill({ status: 204, body: "" });
    }
    let rel = decodeURIComponent(url.pathname);
    if (rel === "/" || rel === "") rel = "/index.html";
    const file = path.join(CLIENT, rel);
    if (!file.startsWith(CLIENT) || !fs.existsSync(file) || fs.statSync(file).isDirectory())
      return route.fulfill({ status: 404, body: "not found" });
    return route.fulfill({
      status: 200,
      headers: { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" },
      body: fs.readFileSync(file)
    });
  });
}

async function inspect(origin) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 860 } });
  const blocked = [];
  const requestedProdApi = [];
  page.on("request", (r) => {
    try { if (new URL(r.url()).hostname === PROD_API_HOST) requestedProdApi.push(r.url()); } catch (e) {}
  });
  await serveLocally(page, origin, blocked);
  await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
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
      return { text: (b.textContent || "").trim(), pointerEvents: cs.pointerEvents, position: cs.position };
    })()
  })).catch((e) => ({ error: String(e && e.message) }));
  const shot = path.join(ROOT, "artifacts", "quick-mock-phase13",
    origin.includes("dev") ? "preview-dev.png" : "preview-prod.png");
  fs.mkdirSync(path.dirname(shot), { recursive: true });
  await page.screenshot({ path: shot }).catch(() => {});
  await browser.close();
  return { info, requestedProdApi, shot };
}

(async () => {
  console.log("── 開発版ホストで開いたとき ──");
  const dev = await inspect(DEV_URL);
  console.log("   " + JSON.stringify(dev.info, null, 1).replace(/\n/g, "\n   "));
  ok("VQ_ENV が development", dev.info.env === "development", String(dev.info.env));
  ok("VQ_IS_PRODUCTION が false", dev.info.isProd === false);
  ok("API 接続先が自分自身（本番を指さない）",
    dev.info.apiBase === DEV_URL.replace(/\/+$/, ""), String(dev.info.apiBase));
  ok("window.AUTH_API_BASE も自分自身",
    dev.info.authBase === DEV_URL.replace(/\/+$/, ""), String(dev.info.authBase));
  ok("タイトルが [DEV] で始まる", /^\[DEV\] /.test(dev.info.title || ""), dev.info.title);
  ok("noindex,nofollow が入る", /noindex/.test(dev.info.robots || "") && /nofollow/.test(dev.info.robots || ""), String(dev.info.robots));
  ok("開発版の帯が出る（文字は無し）", !!dev.info.badge && !dev.info.badge.text,
    JSON.stringify(dev.info.badge));
  ok("バッジが操作を妨げない", (dev.info.badge || {}).pointerEvents === "none");
  ok("本番 API へのリクエストが 0 本", dev.requestedProdApi.length === 0,
    dev.requestedProdApi.slice(0, 3).join(" "));

  console.log("\n── 本番ホストで開いたとき（既存挙動が変わらないこと） ──");
  const prod = await inspect(PROD_URL);
  console.log("   " + JSON.stringify(prod.info, null, 1).replace(/\n/g, "\n   "));
  ok("VQ_ENV が production", prod.info.env === "production", String(prod.info.env));
  ok("VQ_IS_PRODUCTION が true", prod.info.isProd === true);
  ok("API 接続先は本番のまま",
    prod.info.apiBase === "https://" + PROD_API_HOST, String(prod.info.apiBase));
  ok("タイトルに [DEV] が付かない", !/\[DEV\]|\[LOCAL\]/.test(prod.info.title || ""), prod.info.title);
  ok("robots meta を足さない", !prod.info.robots, String(prod.info.robots));
  ok("バッジを出さない", !prod.info.badge, JSON.stringify(prod.info.badge));
  ok("data-vq-env を付けない", !prod.info.dataEnv, String(prod.info.dataEnv));

  console.log(`\nスクリーンショット:\n  ${dev.shot}\n  ${prod.shot}`);
  console.log(`\n══ まとめ ══\n  合格 ${pass} / 不合格 ${fail}`);
  failures.forEach((f) => console.log(`    - ${f}`));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("失敗:", e && e.message); process.exit(2); });
