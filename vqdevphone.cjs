/* スマホから開発版を開いたときに、Quick Chat と Quick Mock が使えるかを実測する。

   スマホの再現方法:
     ・iPhone の UA / 画面サイズ / タッチ
     ・**127.0.0.1 と 192.168.x への到達を遮断**する
       （スマホから見た 127.0.0.1 はスマホ自身。Mac の Bridge には届かない）

   実行: node vqdevphone.cjs
*/
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const DEV = "https://vocabuquiz-api-dev.rintyblog.workers.dev";

let pass = 0, fail = 0;
const notes = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}${detail ? " — " + detail : ""}`); }
  else { fail++; console.log(`  × ${name}${detail ? " — " + detail : ""}`); }
}
function info(name, detail) { notes.push(name + ": " + detail); console.log(`  ・ ${name} — ${detail}`); }
function section(t) { console.log(`\n── ${t} ──`); }

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
      + "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
  });
  const page = await ctx.newPage();

  /* スマホからは Mac の Bridge へ届かない。その状況を作る。 */
  const bridgeAttempts = [];
  await page.route("**/*", (route) => {
    const u = route.request().url();
    if (/^https?:\/\/(127\.0\.0\.1|localhost|\[?::1\]?|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u)) {
      bridgeAttempts.push(u);
      return route.abort("connectionrefused");   /* スマホでは到達しない */
    }
    return route.continue();
  });

  await page.goto(DEV + "/?cb=" + Date.now(), { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(5000);

  section("スマホから見た環境");
  const env = await page.evaluate(() => ({
    env: window.VQ_ENV, api: window.VQ_API_BASE,
    hasLocalProvider: !!window.__vqLocalAI,
    localUrl: (window.__vqLocalAI && typeof window.__vqLocalAI.url === "function") ? window.__vqLocalAI.url() : null,
    localPaired: (window.__vqLocalAI && typeof window.__vqLocalAI.isPaired === "function") ? window.__vqLocalAI.isPaired() : null,
    chatApi: window.CHAT_AI_API_URL || null
  }));
  console.log("   " + JSON.stringify(env, null, 1).replace(/\n/g, "\n   "));
  info("Bridge への接続試行", bridgeAttempts.length + " 回（すべて遮断＝スマホの実態）");

  /* ── 1) 認証（クラウド側なのでスマホでも動くはず） ── */
  section("認証");
  const nick = "ph" + Math.floor(Math.random() * 1e9);
  const auth = await page.evaluate(async ({ base, nick }) => {
    const post = async (p, b) => {
      const r = await fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
      return { status: r.status, json: await r.json().catch(() => null) };
    };
    const reg = await post("/api/auth/register", { gradePrefix: "H3", nickname: nick, password: "Abcd1234", tosAccepted: true, tosVersion: "1" });
    return { reg, token: reg.json && reg.json.token };
  }, { base: DEV, nick });
  ok("スマホから新規登録できる", auth.reg.status === 200, "HTTP " + auth.reg.status);

  /* ── 2) Quick Chat のクラウド経路（Workers AI） ── */
  section("Quick Chat（クラウド AI = Cloudflare Workers AI）");
  const chat = await page.evaluate(async ({ base, token }) => {
    const r = await fetch(base + "/api/ai/chat", {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json" },
        token ? { Authorization: "Bearer " + token } : {}),
      body: JSON.stringify({ message: "1+1は？ 数字だけで答えて。", mode: "normal" })
    });
    const t = await r.text();
    return { status: r.status, head: t.slice(0, 300) };
  }, { base: DEV, token: auth.token });
  console.log("   HTTP " + chat.status + " / " + chat.head.replace(/\s+/g, " ").slice(0, 200));
  ok("スマホから クラウド AI が応答する", chat.status === 200, "HTTP " + chat.status);

  /* ── 3) Quick Mock（V2）は何を使うか ── */
  section("Quick Mock（V2）");
  const mock = await page.evaluate(async () => {
    const out = { hasVQ2: !!window.VQ2, hasQuickMock: !!(window.VQ2 && window.VQ2.quickMock),
                  providerIsLocalOnly: null, runError: null };
    try {
      /* VQ2.ai は provider() = window.__vqLocalAI だけを見る作り */
      out.providerIsLocalOnly = !!(window.VQ2 && window.VQ2.ai) && !window.__vqLocalAI;
    } catch (e) {}
    /* 実際に 1 回だけ呼んでみて、どんな失敗になるかを見る */
    try {
      if (window.VQ2 && window.VQ2.ai && typeof window.VQ2.ai.generateMock === "function") {
        await window.VQ2.ai.generateMock({ instruction: "テスト", count: 1, sectionCount: 1 });
      }
    } catch (e) { out.runError = String((e && (e.userMessage || e.message)) || e).slice(0, 200); }
    return out;
  });
  console.log("   " + JSON.stringify(mock, null, 1).replace(/\n/g, "\n   "));
  ok("Quick Mock はローカル Bridge 専用（スマホでは使えない）",
    mock.providerIsLocalOnly === true || !!mock.runError,
    mock.runError || "provider が無い");

  const shot = path.join(__dirname, "artifacts", "quick-mock-phase13", "dev-phone.png");
  fs.mkdirSync(path.dirname(shot), { recursive: true });
  await page.screenshot({ path: shot });
  await browser.close();
  console.log(`\nスクリーンショット: ${shot}`);
  console.log(`\n══ まとめ ══\n  確認できた ${pass} / 想定外 ${fail}`);
  notes.forEach((n) => console.log("    ・" + n));
})().catch((e) => { console.error("失敗:", e && e.message); process.exit(2); });
