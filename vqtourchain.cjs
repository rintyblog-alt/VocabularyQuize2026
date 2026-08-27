/* 暗証番号の手続きが 全部済んだあと、Lumi のはじめかたが **必ず** 出るか。
   ・vq-pin が unlock() で vq-pin-passed を出す
   ・チュートリアルが それを受けて 予約 → 開く
   背景のぼかしも 同時に見る。 */
const { chromium } = require("playwright");
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
let pass = 0, fail = 0; const 落ち = [];
const ok = (n, c, x) => { if (c) { pass++; console.log("  ✅ " + n); } else { fail++; 落ち.push(n); console.log("  ❌ " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 300) : "")); } };
(async () => {
  const b = await chromium.launch();
  try {
    const ctx = await b.newContext({ viewport: { width: 430, height: 932 } });
    await ctx.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
    await ctx.route("**/api/auth/me*", (r) => r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, user: { id: "u1", nickname: "テ", plan: "free" } }) }));
    /* 全部済んでいる人（＝暗証番号の手続きは 何も残っていない）*/
    await ctx.route("**/api/auth/pin/status*", (r) => r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ hasPin: true, pinVerified: true, needsPin: false, needsEmail: false, needsConsent: false }) }));
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem("app.auth.token.v1", "t");
        localStorage.setItem("app.auth.mode.v1", "user");
        localStorage.setItem("app.auth.expiresAt.v1", String(Date.now() + 86400000));
        localStorage.setItem("vq.newauth.introSeen.v1", "1");
      } catch (e) {}
      window.__受けた = 0;
      addEventListener("vq-pin-passed", () => { window.__受けた++; });
    });
    const page = await ctx.newPage();
    await page.goto(BASE + "/", { waitUntil: "load", timeout: 120000 });
    await page.waitForTimeout(6000);
    /* ★ 暗証番号の手続きが 全部終わった瞬間を 再現する。
       本物では vq-pin の unlock() が この合図を出す（手続きが 何も残っていないとき）。
       ここを直接鳴らして、チュートリアルが 受けて開くかを見る。 */
    const 前 = await page.evaluate(() => localStorage.getItem("vq.lumitour.v2"));
    await page.evaluate(() => { window.dispatchEvent(new CustomEvent("vq-pin-passed")); });
    await page.waitForTimeout(1200);
    const 予約 = await page.evaluate(() => localStorage.getItem("vq.lumitour.v2"));
    console.log(`     予約の印: ${JSON.stringify(前)} → ${JSON.stringify(予約)}`);
    ok("暗証番号を通ったら 予約される（pending）", 予約 === "pending", { 前, 予約 });
    /* 出るまで待つ */
    await page.waitForFunction(() => {
      const h = document.getElementById("vqLumiTour");
      return h && getComputedStyle(h).display !== "none";
    }, null, { timeout: 45000 }).catch(() => {});
    await page.waitForTimeout(1600);
    const d = await page.evaluate(() => {
      const h = document.getElementById("vqLumiTour");
      if (!h || !h.shadowRoot) return { 有: false };
      const v = h.shadowRoot.querySelector(".veil");
      const sh = h.shadowRoot.querySelector(".sheet");
      const vs = v ? getComputedStyle(v) : null;
      return { 有: true, 出: getComputedStyle(h).display !== "none",
               ぼかし: vs ? (vs.backdropFilter || vs.webkitBackdropFilter || "") : "無",
               ぼかしの濃さ: vs ? vs.opacity : "0", ぼかしの地: vs ? vs.backgroundColor : "",
               ぼかしは通す: vs ? vs.pointerEvents : "",
               帯: sh ? Math.round(sh.getBoundingClientRect().height) : 0,
               字: sh ? (sh.textContent || "").trim().slice(0, 26) : "" };
    });
    console.log("     " + JSON.stringify(d));
    ok("暗証番号のあと Lumi のはじめかたが 出る", d.有 && d.出 && d.帯 > 60, d);
    ok("背景が ぼけている（backdrop-filter）", /blur/.test(String(d.ぼかし)), d.ぼかし);
    ok("ぼかしが 効いている（透明でない）", Number(d.ぼかしの濃さ) > 0.5, d.ぼかしの濃さ);
    ok("ぼかしは 触るのを通す（下の画面が使える）", d.ぼかしは通す === "none", d.ぼかしは通す);
    await ctx.close();
  } finally { await b.close(); }
  console.log("\n" + "═".repeat(58));
  console.log(`  合計 ${pass + fail} 件 / 通った ${pass} / 落ちた ${fail}`);
  落ち.forEach((x) => console.log("   - " + x));
  console.log("═".repeat(58));
  process.exit(fail ? 1 : 0);
})();
