/* Vocabu Workplace — 開発環境（デプロイ済み）での通し確認
   ログインした状態で作り、サーバへ入り、別のブラウザ窓から開けることまで見る。
   使い方: node vqwplive.cjs */
const { chromium } = require("playwright");
const BASE = process.env.VQ_BASE || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (/vocabuquiz-api\.rintyblog\.workers\.dev\/?$/.test(BASE) && !/-dev/.test(BASE)) {
  console.error("本番では実行しません。"); process.exit(2);
}
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log("  ok   " + n))
  : (fail++, console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 200) : ""))); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function makeUser() {
  const nick = "wplive" + Date.now().toString(36).slice(-6);
  const r = await fetch(BASE + "/api/auth/register", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gradePrefix: "H1", nickname: nick, password: "WpLive#2026ab",
      tosAccepted: true, tosVersion: "1" })
  });
  const j = await r.json();
  if (!j.token) throw new Error("アカウントを作れませんでした: " + JSON.stringify(j).slice(0, 200));
  return { token: j.token, nick };
}

(async () => {
  console.log("接続先: " + BASE);
  const u = await makeUser();
  console.log("検証用アカウント: " + u.nick);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const pg = await ctx.newPage();

  /* 先にトークンを入れてから開く（ログイン済みの状態にする） */
  await pg.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.evaluate((t) => { localStorage.setItem("app.auth.token.v1", t); }, u.token);
  await pg.goto(BASE + "/?vq2=all", { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.waitForFunction(() => window.VQ2 && window.VQ2.workplace && window.VQ2.workplace.home,
    { timeout: 45000 });
  await pg.evaluate(() => { const o = document.getElementById("firstLaunchOverlay"); if (o) o.style.display = "none"; });

  ok("デプロイ済みの開発環境で Workplace が読み込まれる", true);
  const signed = await pg.evaluate(() => window.VQ2.workplace.store.isSignedIn());
  ok("ログイン状態として認識される", signed === true, signed);

  const nav = await pg.evaluate(() => {
    const sr = document.getElementById("vqShell") && document.getElementById("vqShell").shadowRoot;
    const box = sr && sr.querySelector("#vq2-wp-nav");
    return box ? Array.from(box.querySelectorAll(".vqs-item__l")).map(e => e.textContent) : null;
  });
  ok("左サイドバーに WORKPLACE が出る", nav && nav.length === 5, nav);

  await pg.evaluate(() => window.VQ2.openWorkplace());
  await pg.waitForSelector("#vq-workplace", { timeout: 15000 });
  await sleep(1500);
  const noGuest = await pg.evaluate(() => {
    const sr = document.getElementById("vq-workplace").shadowRoot;
    return !/この端末にだけ/.test(sr.querySelector(".wp-home").textContent);
  });
  ok("ログイン時は「端末だけ」の注意が出ない", noGuest === true);

  /* 作って書いて、サーバへ入るまで待つ */
  await pg.evaluate(() => {
    document.getElementById("vq-workplace").shadowRoot
      .querySelector('[data-act="new"][data-type="document"]').click();
  });
  await pg.waitForSelector("#vq-wp-docs", { timeout: 15000 });
  await sleep(600);
  await pg.evaluate(() => {
    const sr = document.getElementById("vq-wp-docs").shadowRoot;
    const c = sr.querySelector(".wpd-b__c");
    c.focus(); c.innerHTML = "デプロイ先で書いた本文";
    c.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    const t = sr.querySelector('[data-act="title"]');
    t.value = "デプロイ検証ドキュメント";
    t.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  });
  await sleep(3500);
  const state = await pg.evaluate(() => {
    const sr = document.getElementById("vq-wp-docs").shadowRoot;
    return (sr.querySelector('[data-role="save-t"]') || {}).textContent;
  });
  ok("画面に「保存しました」と出る", state === "保存しました", state);

  /* サーバへ本当に入ったかを API 側から確認する */
  const r = await fetch(BASE + "/api/workplace/items", { headers: { Authorization: "Bearer " + u.token } });
  const j = await r.json();
  const it = (j.items || []).filter(x => x.title === "デプロイ検証ドキュメント")[0];
  ok("サーバの一覧に出てくる", !!it, (j.items || []).map(x => x.title));
  if (it) {
    const g = await (await fetch(BASE + "/api/workplace/item?id=" + it.id,
      { headers: { Authorization: "Bearer " + u.token } })).json();
    ok("本文がサーバに入っている",
      /デプロイ先で書いた本文/.test(JSON.stringify(g.content || {})), g.content);
  }

  /* 別の窓（＝別の端末に相当）から開けるか */
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const pg2 = await ctx2.newPage();
  await pg2.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg2.evaluate((t) => { localStorage.setItem("app.auth.token.v1", t); }, u.token);
  await pg2.goto(BASE + "/?vq2=all", { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg2.waitForFunction(() => window.VQ2 && window.VQ2.workplace && window.VQ2.workplace.home,
    { timeout: 45000 });
  await pg2.evaluate(() => { const o = document.getElementById("firstLaunchOverlay"); if (o) o.style.display = "none"; });
  await pg2.evaluate(() => window.VQ2.openWorkplace());
  await pg2.waitForSelector("#vq-workplace", { timeout: 15000 });
  /* 一覧はサーバから取ってくるので、出そろうまで待つ（決め打ちの待ち時間にしない）。 */
  let seen = [];
  for (let i = 0; i < 30; i++) {
    seen = await pg2.evaluate(() => {
      const h = document.getElementById("vq-workplace");
      if (!h) return [];
      return Array.from(h.shadowRoot.querySelectorAll(".wp-card__t")).map(e => e.textContent);
    });
    if (seen.length) break;
    await sleep(500);
  }
  ok("別の端末（別ブラウザ窓）からも一覧に出る",
    (seen || []).indexOf("デプロイ検証ドキュメント") >= 0, seen);

  /* 後始末 */
  if (it) {
    await fetch(BASE + "/api/workplace/item/meta", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + u.token },
      body: JSON.stringify({ id: it.id, action: "purge" })
    });
    console.log("  検証用データを消しました。");
  }

  console.log("\n══ まとめ ══");
  console.log("  合格 " + pass + " / 不合格 " + fail);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("実行できませんでした:", e); process.exit(2); });
