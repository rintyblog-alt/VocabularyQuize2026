/* 開発版サイトで「認証」と「この Mac のローカル LLM」が動くかを実ブラウザで確かめる。
   本番へは 1 本もリクエストを出さない（出たら失敗にする）。

   実行: node vqdevlive.cjs
*/
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const DEV = "https://vocabuquiz-api-dev.rintyblog.workers.dev";
const PROD_HOSTS = ["www.vocabuquiz.app", "vocabuquiz.app", "vocabuquiz-api.rintyblog.workers.dev"];

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; failures.push(name + (detail ? " — " + detail : "")); console.log(`  × ${name}${detail ? " — " + detail : ""}`); }
}
function section(t) { console.log(`\n── ${t} ──`); }

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const prodHits = [];
  page.on("request", (r) => {
    try { if (PROD_HOSTS.includes(new URL(r.url()).hostname)) prodHits.push(r.url()); } catch (e) {}
  });
  await page.goto(DEV + "/", { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(3500);

  /* ── 1) 認証 API が開発版 D1 で動くか ── */
  section("認証（開発版 D1）");
  const uniq = "dev" + Math.floor(Math.random() * 1e9);
  const reg = await page.evaluate(async ({ base, nick }) => {
    const post = async (p, body) => {
      const r = await fetch(base + p, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      let j = null; try { j = await r.json(); } catch (e) {}
      return { status: r.status, json: j };
    };
    /* 既存のローカル認証（学年＋ニックネーム＋パスワード）の口を使う。
       フィールド名は worker.js の handleAuthLogin / handleAuthRegister に合わせる。 */
    const signup = await post("/api/auth/register", {
      gradePrefix: "H3", nickname: nick, password: "Abcd1234",
      tosAccepted: true, tosVersion: "1"
    });
    const login = await post("/api/auth/login", {
      gradePrefix: "H3", nickname: nick, password: "Abcd1234"
    });
    let me = null;
    const token = (login.json && (login.json.token || login.json.sessionToken))
      || (signup.json && (signup.json.token || signup.json.sessionToken));
    if (token) {
      const r = await fetch(base + "/api/auth/me", { headers: { Authorization: "Bearer " + token } });
      me = { status: r.status, json: await r.json().catch(() => null) };
    }
    return { signup, login, me, tokenSeen: !!token };
  }, { base: DEV, nick: uniq });

  console.log("   signup:", reg.signup.status, JSON.stringify(reg.signup.json).slice(0, 160));
  console.log("   login :", reg.login.status, JSON.stringify(reg.login.json).slice(0, 160));
  if (reg.me) console.log("   me    :", reg.me.status, JSON.stringify(reg.me.json).slice(0, 160));

  ok("新規登録が通る（開発版 D1 へ書ける）", reg.signup.status === 200 || reg.signup.status === 201,
    String(reg.signup.status));
  ok("ログインが通る", reg.login.status === 200, String(reg.login.status));
  ok("セッションが発行される", reg.tokenSeen);
  ok("自分の情報が取れる", !!reg.me && reg.me.status === 200, reg.me ? String(reg.me.status) : "未取得");

  /* ── 2) ローカル LLM（この Mac の Bridge）へ届くか ── */
  section("ローカル LLM（この Mac の Bridge）");
  const bridge = await page.evaluate(async () => {
    const out = { health: null, status: null, error: null, paired: null };
    try {
      const r = await fetch("http://127.0.0.1:17891/health", { mode: "cors" });
      out.health = { status: r.status, body: await r.json().catch(() => null) };
    } catch (e) { out.error = String(e && e.message); }
    try {
      const r2 = await fetch("http://127.0.0.1:17891/status", { mode: "cors" });
      out.status = { status: r2.status, body: await r2.json().catch(() => null) };
    } catch (e) { out.error = out.error || String(e && e.message); }
    /* アプリ側の Provider が使えるか */
    try {
      const L = window.__vqLocalAI;
      out.paired = L ? { present: true, paired: typeof L.isPaired === "function" ? L.isPaired() : null,
                         url: typeof L.url === "function" ? L.url() : null } : { present: false };
    } catch (e) {}
    return out;
  });
  console.log("   " + JSON.stringify(bridge, null, 1).replace(/\n/g, "\n   ").slice(0, 900));

  ok("https の開発版から http://127.0.0.1 の Bridge へ届く",
    !!(bridge.health && bridge.health.status === 200), bridge.error || String(bridge.health && bridge.health.status));
  ok("Bridge がエンジン(Ollama)に繋がっている",
    !!(bridge.health && bridge.health.body && bridge.health.body.engine && bridge.health.body.engine.ok),
    JSON.stringify(bridge.health && bridge.health.body && bridge.health.body.engine));
  ok("アプリ側の LocalAI Provider が読み込まれている",
    !!(bridge.paired && bridge.paired.present), JSON.stringify(bridge.paired));

  /* ── 3) 本番へ出ていないこと ── */
  section("本番への接続");
  ok("本番ホストへのリクエストが 0 本", prodHits.length === 0, prodHits.slice(0, 5).join(" "));

  const shot = path.join(__dirname, "artifacts", "quick-mock-phase13", "dev-live.png");
  fs.mkdirSync(path.dirname(shot), { recursive: true });
  await page.screenshot({ path: shot });
  await browser.close();
  console.log(`\nスクリーンショット: ${shot}`);
  console.log(`\n══ まとめ ══\n  合格 ${pass} / 不合格 ${fail}`);
  failures.forEach((f) => console.log(`    - ${f}`));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("失敗:", e && e.message); process.exit(2); });
