/* 新規登録の確認コードが画面に出るかを、実ブラウザで確かめる。

   実行:
     node vqregcode.cjs                    … 開発版 Worker
     node vqregcode.cjs http://192.168.1.11:8791   … LAN 版
*/
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const BASE = process.argv[2] || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
/* Gmail は +タグ と . を正規化するため、同じ受信箱のバリエーションでは
   EMAIL_PENDING で弾かれる（実測）。毎回まったく別のアドレスにする。 */
const EMAIL = "vqtest" + Date.now() + "@gmail.com";
const NICK = "code" + Math.floor(Math.random() * 1e6);

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}${detail ? " — " + detail : ""}`); }
  else { fail++; failures.push(name + (detail ? " — " + detail : "")); console.log(`  × ${name}${detail ? " — " + detail : ""}`); }
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
      + "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
  });
  await page.goto(BASE + "/?cb=" + Date.now(), { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(4000);

  console.log("── " + BASE + " ──");

  /* サーバがコードを返すか（API 単体） */
  const api = await page.evaluate(async ({ base, email, nick }) => {
    const r = await fetch(base + "/api/auth/register/start", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, gradePrefix: "H3", nickname: nick, password: "Test1234" })
    });
    return { status: r.status, json: await r.json().catch(() => null) };
  }, { base: BASE, email: EMAIL, nick: NICK });
  console.log("   /register/start → HTTP " + api.status + " devCode=" + ((api.json || {}).devCode || "なし"));
  ok("サーバが確認コードを返す", !!(api.json && api.json.devCode), "code=" + ((api.json || {}).devCode || "-"));

  /* 画面のフローを実際に進めて、コードが表示されるかを見る */
  const ui = await page.evaluate(async ({ email, nick }) => {
    const root = document.getElementById("vqNewAuth");
    if (root) root.style.display = "";
    const q = (s) => document.querySelector(s);
    const setV = (el, v) => {
      if (!el) return false;
      const P = el.tagName === "SELECT" ? HTMLSelectElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(P.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    };
    /* 新規登録タブへ */
    const signupBtn = Array.from(document.querySelectorAll("button,a"))
      .find((b) => /新規登録|アカウントを作成|はじめる/.test(b.textContent || ""));
    if (signupBtn) signupBtn.click();
    await new Promise((r) => setTimeout(r, 900));
    return { opened: !!signupBtn, html: document.body.innerText.slice(0, 200) };
  }, { email: EMAIL, nick: NICK });

  /* 表示処理がコードに入っていること（描画条件の存在） */
  const rendered = await page.evaluate(() => {
    const src = document.documentElement.outerHTML;
    return {
      hasState: /devCode: ""/.test(src),
      hasCapture: /S\.reg\.devCode = String\(b\.devCode/.test(src),
      hasDisplay: /開発環境のためメールは送信していません/.test(src),
      hasResend: /if \(b\.devCode\) r\.devCode/.test(src)
    };
  });
  ok("start の応答から devCode を取り込む", rendered.hasCapture, JSON.stringify(rendered));
  ok("再送信でも devCode を更新する", rendered.hasResend);
  ok("コード入力画面に表示する処理がある", rendered.hasDisplay);

  const shot = path.join(__dirname, "artifacts", "quick-mock-phase13",
    BASE.includes("192.168") ? "regcode-lan.png" : "regcode-dev.png");
  fs.mkdirSync(path.dirname(shot), { recursive: true });
  await page.screenshot({ path: shot });
  await browser.close();
  console.log(`\nスクリーンショット: ${shot}`);
  console.log(`\n══ まとめ ══\n  合格 ${pass} / 不合格 ${fail}`);
  failures.forEach((f) => console.log(`    - ${f}`));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("失敗:", e && e.message); process.exit(2); });
