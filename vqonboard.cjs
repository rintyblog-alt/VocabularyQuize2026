/* ══════════════════════════════════════════════════════════════════════════
   vqonboard.cjs — 既存の 98 人が ログインし直したとき、
   ご指定の順番で 案内されるかを見る。

     Gmail の確認 → 暗証番号 → 利用規約・プライバシーの同意 → Lumi のはじめかた

   98 人は メール・暗証番号・同意 すべて 未の状態なので、
   /api/auth/pin/status が 3 つとも needs=true で返る場合を作る。
   ══════════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
let pass = 0, fail = 0; const 落ち = [];
const ok = (n, c, x) => { if (c) { pass++; console.log("  ✅ " + n); } else { fail++; 落ち.push(n); console.log("  ❌ " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 300) : "")); } };
const 板 = () => {
  const p = document.getElementById("vqPin");
  if (!p || !p.shadowRoot) return { 有: false };
  const c = p.shadowRoot.querySelector(".card");
  const t = c ? (c.textContent || "").trim() : "";
  return { 有: true, 出: getComputedStyle(p).display !== "none", 字: t.slice(0, 60),
           段: (window.__vqPin && window.__vqPin.状態) ? null : null };
};
const 状態 = {
  すべて未: { hasPin: false, pinVerified: false, needsPin: true, needsEmail: true, needsConsent: true },
  メール済: { hasPin: false, pinVerified: false, needsPin: true, needsEmail: false, needsConsent: true },
  暗証番号済: { hasPin: true, pinVerified: true, needsPin: false, needsEmail: false, needsConsent: true }
};
async function 出る画面(b, 名) {
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 } });
  await ctx.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await ctx.route("**/api/auth/me*", (r) => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ ok: true, user: { id: "u1", nickname: "既存の人", plan: "free" } }) }));
  await ctx.route("**/api/auth/pin/status*", (r) => r.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify(Object.assign({ termsVersion: "2026-08-10", privacyVersion: "2026-08-10" }, 状態[名])) }));
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("app.auth.token.v1", "t");
      localStorage.setItem("app.auth.mode.v1", "user");
      localStorage.setItem("app.auth.expiresAt.v1", String(Date.now() + 86400000));
      localStorage.setItem("vq.newauth.introSeen.v1", "1");
      localStorage.setItem("vq.tour.pin.v1", "1");
    } catch (e) {}
  });
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => {
    const p = document.getElementById("vqPin");
    return p && getComputedStyle(p).display !== "none" &&
           p.shadowRoot && ((p.shadowRoot.querySelector(".card") || {}).textContent || "").trim().length > 5;
  }, null, { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(900);
  const d = await page.evaluate(板);
  await ctx.close();
  return d;
}

(async () => {
  const b = await chromium.launch();
  try {
    const 一 = await 出る画面(b, "すべて未");
    console.log("  ① 何も済んでいない人: " + JSON.stringify(一.字));
    ok("① 最初は Gmail の確認", /メールアドレス|Gmail/.test(一.字), 一.字);
    ok("① 番号が 1 / 3", /1 \/ 3/.test(一.字), 一.字);

    const 二 = await 出る画面(b, "メール済");
    console.log("  ② メールが済んだ人: " + JSON.stringify(二.字));
    ok("② 次は 暗証番号を決める", /暗証番号を決める/.test(二.字), 二.字);
    /* 番号は「**残っている手続きのうち** 何番目か」。元からその設計。
       メールが済んだ人は 残り 2 つ（暗証番号・同意）なので 1 / 2 が正しい。 */
    ok("② 番号が 1 / 2（残り 2 つの 1 つ目）", /1 \/ 2/.test(二.字), 二.字);

    const 三 = await 出る画面(b, "暗証番号済");
    console.log("  ③ 暗証番号まで済んだ人: " + JSON.stringify(三.字));
    ok("③ 最後は 利用規約とプライバシー", /利用規約|プライバシー/.test(三.字), 三.字);
  } finally { await b.close(); }
  console.log("\n" + "═".repeat(58));
  console.log(`  合計 ${pass + fail} 件 / 通った ${pass} / 落ちた ${fail}`);
  落ち.forEach((x) => console.log("   - " + x));
  console.log("═".repeat(58));
  process.exit(fail ? 1 : 0);
})();
