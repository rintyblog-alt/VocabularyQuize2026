/* 案C: スマホから http://<MacのIP>:8791 を開いたときに
   認証 / Quick Chat / Quick Mock（ローカル LLM）が使えるかを実測する。

   スマホと同じ条件にするため:
     ・iPhone の UA / 画面 / タッチ
     ・**127.0.0.1 への到達を遮断**（スマホから見た 127.0.0.1 はスマホ自身）
       → LAN IP 経由でしか Bridge へ届かない状況を作る

   実行: node vqlanphone.cjs [LAN_IP]
*/
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const LAN = process.argv[2] || "192.168.1.11";
const BASE = `http://${LAN}:8791`;

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}${detail ? " — " + detail : ""}`); }
  else { fail++; failures.push(name + (detail ? " — " + detail : "")); console.log(`  × ${name}${detail ? " — " + detail : ""}`); }
}
function section(t) { console.log(`\n── ${t} ──`); }

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
      + "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
  });
  const page = await ctx.newPage();

  /* スマホから 127.0.0.1 は自分自身＝届かない。その状況を再現する。 */
  const blockedLoopback = [];
  await page.route("**/*", (route) => {
    const u = route.request().url();
    if (/^https?:\/\/(127\.0\.0\.1|localhost|\[?::1\]?)(:|\/)/.test(u)) {
      blockedLoopback.push(u);
      return route.abort("connectionrefused");
    }
    return route.continue();
  });

  await page.goto(BASE + "/?vqdev=1&cb=" + Date.now(), { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(5000);

  section("スマホから見た環境");
  const env = await page.evaluate(() => ({
    env: window.VQ_ENV, api: window.VQ_API_BASE,
    hosts: (window.__vqLocalAI && typeof window.__vqLocalAI._hosts === "function")
      ? window.__vqLocalAI._hosts() : null,
    localUrl: (window.__vqLocalAI && typeof window.__vqLocalAI.url === "function")
      ? window.__vqLocalAI.url() : null
  }));
  console.log("   " + JSON.stringify(env, null, 1).replace(/\n/g, "\n   "));
  ok("API が同じオリジン（LAN IP）を指す", env.api === BASE, String(env.api));
  ok("Bridge 探索が LAN IP を先に見る",
    !!(env.hosts && env.hosts[0] === LAN), JSON.stringify(env.hosts));

  section("ローカル LLM（Bridge）へ LAN 経由で届くか");
  const disc = await page.evaluate(async () => {
    const L = window.__vqLocalAI;
    if (!L) return { error: "provider なし" };
    const found = await L.discover().catch((e) => "ERR:" + (e && e.message));
    let health = null;
    if (found && String(found).indexOf("http") === 0) {
      try {
        const r = await fetch(found + "/health");
        health = { status: r.status, body: await r.json().catch(() => null) };
      } catch (e) { health = { error: String(e && e.message) }; }
    }
    return { found, health, paired: typeof L.isPaired === "function" ? L.isPaired() : null };
  });
  console.log("   discover → " + JSON.stringify(disc.found));
  if (disc.health) console.log("   health   → " + JSON.stringify(disc.health).slice(0, 220));
  ok("Bridge を LAN IP で見つけられる",
    typeof disc.found === "string" && disc.found.indexOf(LAN) >= 0, String(disc.found));
  ok("Bridge が応答する（エンジン接続済み）",
    !!(disc.health && disc.health.status === 200 && disc.health.body
       && disc.health.body.engine && disc.health.body.engine.ok),
    JSON.stringify(disc.health && disc.health.body && disc.health.body.engine));
  console.log("   （127.0.0.1 への到達は " + blockedLoopback.length + " 回遮断＝スマホの実態）");

  section("認証");
  const nick = "lan" + Math.floor(Math.random() * 1e9);
  const auth = await page.evaluate(async ({ base, nick }) => {
    const r = await fetch(base + "/api/auth/register", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gradePrefix: "H3", nickname: nick, password: "Abcd1234", tosAccepted: true, tosVersion: "1" })
    });
    return { status: r.status, json: await r.json().catch(() => null) };
  }, { base: BASE, nick });
  ok("スマホから新規登録できる", auth.status === 200, "HTTP " + auth.status
    + (auth.json && auth.json.code ? " " + auth.json.code : ""));

  section("Quick Mock（ローカル LLM を実際に使う）");
  ok("Bridge とペアリング済みとして扱える（OPEN モード）", disc.paired === true, String(disc.paired));
  /* 実際に 1 問だけ作らせて、端から端まで通ることを確かめる。
     ここが通れば「スマホから Quick Mock が使える」と言い切れる。 */
  const gen = await page.evaluate(async () => {
    const t0 = Date.now();
    try {
      const res = await window.VQ2.ai.generateMock({
        instruction: "次の内容から正誤問題を1問だけ作ってください。"
          + "『江戸幕府は1603年に徳川家康が開いた。』",
        count: 1, sectionCount: 1, questionTypes: ["true_false"], level: "deep"
      });
      const d = res && res.structured && (res.structured.sections ? res.structured : res.structured.data);
      const qs = d && d.sections ? d.sections.reduce((a, s) => a.concat(s.questions || []), []) : [];
      return { ok: true, ms: Date.now() - t0, questions: qs.length,
               type: qs[0] && qs[0].type, hasAnswer: !!(qs[0] && qs[0].answer) };
    } catch (e) {
      return { ok: false, ms: Date.now() - t0, error: String((e && (e.userMessage || e.message)) || e).slice(0, 200) };
    }
  });
  console.log("   " + JSON.stringify(gen));
  ok("スマホ条件で Quick Mock が実際に問題を生成できる",
    gen.ok === true && gen.questions === 1,
    gen.error || (gen.questions + " 問 / " + Math.round(gen.ms / 1000) + " 秒 / type=" + gen.type));

  const shot = path.join(__dirname, "artifacts", "quick-mock-phase13", "lan-phone.png");
  fs.mkdirSync(path.dirname(shot), { recursive: true });
  await page.screenshot({ path: shot });
  await browser.close();
  console.log(`\nスクリーンショット: ${shot}`);
  console.log(`\n══ まとめ ══\n  合格 ${pass} / 不合格 ${fail}`);
  failures.forEach((f) => console.log(`    - ${f}`));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("失敗:", e && e.message); process.exit(2); });
