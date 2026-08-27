/* ══════════════════════════════════════════════════════════════════════════
   vqtour.cjs — 「ここが変わりました」の案内（1 度だけ）

   見るところ:
     ① 更新した画面をはじめて開くと出る（プリセット / Feed / NEWS / Insight /
        Quick Chat / 通知 / 設定）
     ② 2 度目は出ない
     ③ 絵・見出し・説明・ボタンがそろっていて、いちばん前に出る
     ④ 暗証番号を決める前にも 1 度だけ出る
   ══════════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const fs = require("node:fs");
fs.mkdirSync("shots/tour", { recursive: true });
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
/* ローカルの D1 を直に書き換える下ごしらえは、配信先へ向けたときは使えない。 */
const IS_LOCAL = /127\.0\.0\.1|localhost/.test(BASE);
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  NG   " + n + (x ? "  → " + x : ""))); };

async function call(path, { method = "GET", token = "", body = null } = {}) {
  const h = { "Content-Type": "application/json" };
  if (token) h.Authorization = "Bearer " + token;
  const r = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, j: j || {} };
}
const uniq = () => "vqtr" + String(Date.now()).slice(-7) + Math.floor(Math.random() * 90 + 10);

(async () => {
  const br = await chromium.launch({ headless: true });
  const pg = await (await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
  const errs = []; pg.on("pageerror", (e) => errs.push(String(e).slice(0, 180)));
  await pg.goto(BASE + "/?vqdev=1&cb=" + Date.now(), { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(4600);
  await pg.evaluate(() => {
    ["firstLaunchOverlay", "vqbFlow", "vqNewAuth", "authGate", "authBootSplash", "vqOnboardingOverlay"].forEach((id) => {
      const e = document.getElementById(id);
      if (e) { e.hidden = true; e.style.setProperty("display", "none", "important"); }
    });
    document.body.classList.remove("auth-booting", "auth-gate-open");
    const a = document.getElementById("app"); if (a) a.style.setProperty("display", "block", "important");
    document.body.setAttribute("data-ui-v2", "1");
    const sk = document.getElementById("vqObSkipBtn"); if (sk) sk.click();
    try { window.__vqNewsFlash.close(); } catch (e) {}
    window.__vqTour.reset();
  });
  await pg.waitForTimeout(1500);

  const T = () => pg.evaluate(() => {
    const h = document.getElementById("vqTour");
    if (!h || h.style.display === "none") return null;
    const r = h.shadowRoot;
    return {
      t: (r.querySelector(".t").textContent || "").trim(),
      p: (r.querySelector(".p").textContent || "").trim(),
      cta: (r.querySelector("[data-go]").textContent || "").trim(),
      art: !!r.querySelector(".art svg"),
      top: (function () { const e = document.elementFromPoint(195, 700); return e ? (e.id || e.tagName) : ""; })()
    };
  });

  console.log("\n### 画面ごとの案内");
  for (const [tab, name] of [["library", "プリセット"], ["inbox", "Feed"], ["news", "NEWS"],
       ["insight", "Insight"], ["chat", "Quick Chat"], ["notifications", "通知"], ["settings", "設定"]]) {
    if (tab === "settings") {
      /* 設定は「画面が開いたとき」に出す（タブを開いた瞬間にモーダルが出るため）。
         左パネルや下のバーからも、ここと同じ道を通る。 */
      await pg.evaluate(() => window.__vqOpenSettings());
    } else {
      await pg.evaluate((t) => {
        const b = document.querySelector('#appTabBar [data-app-tab="' + t + '"]');
        if (b) b.click(); else document.body.setAttribute("data-app-tab", t);
      }, tab);
    }
    await pg.waitForTimeout(2700);
    const d = await T();
    ok(name + "：はじめて開くと出る", !!d && d.t.length > 4, d ? d.t : "出なかった");
    if (d) {
      ok(name + "：絵と説明とボタンがそろっている", d.art && d.p.length > 10 && d.cta.length > 1,
        JSON.stringify({ art: d.art, p: d.p.length, cta: d.cta }));
      ok(name + "：いちばん前に出ている", d.top === "vqTour", d.top);
      await pg.screenshot({ path: "shots/tour/" + tab + ".png" });
      await pg.evaluate(() => document.getElementById("vqTour").shadowRoot.querySelector("[data-go]").click());
      await pg.waitForTimeout(700);
      ok(name + "：ボタンで閉じる", (await T()) === null);
    }
    await pg.evaluate(() => { try { window.__vqCloseSettings(); } catch (e) {} const b = document.querySelector('#appTabBar [data-app-tab="home"]'); if (b) b.click(); });
    await pg.waitForTimeout(900);
    if (tab === "settings") await pg.evaluate(() => window.__vqOpenSettings());
    else await pg.evaluate((t) => { const b = document.querySelector('#appTabBar [data-app-tab="' + t + '"]'); if (b) b.click(); }, tab);
    await pg.waitForTimeout(2300);
    ok(name + "：2 度目は出ない", (await T()) === null);
  }
  ok("画面の失敗が出ていない", errs.length === 0, errs.join(" / "));
  await pg.close();

  console.log("\n### 暗証番号の前にも 1 度だけ");
  {
    if (!IS_LOCAL) {
      console.log("  --   配信先では「更新前の人」を作れないので飛ばす（ローカルで確かめる）");
    } else {
    /* 更新前の人をこしらえる */
    const u = uniq();
    const a = await call("/api/auth/register/start", { method: "POST", body: { email: u + "@gmail.com", gradePrefix: "H2", nickname: u, password: "Passw0rd!vq" } });
    const b = await call("/api/auth/register/verify", { method: "POST", body: { challengeId: a.j.challengeId, code: a.j.devCode } });
    await call("/api/auth/register/consent", { method: "POST", body: { registrationSession: b.j.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: "8306" } });
    try {
      require("node:child_process").execSync(
        `/Users/user/.npm-global/bin/wrangler d1 execute vocabuquiz_auth --local ` +
        `--config server/.local-run/echo/wrangler.toml --command ` +
        `"UPDATE users SET pin_hash='',pin_salt='',pin_len=0,pin_set_at=0 WHERE nickname='${u}'"`, { stdio: "ignore" });
    } catch (e) {}
    const li = await call("/api/auth/login", { method: "POST", body: { gradePrefix: "H2", nickname: u, password: "Passw0rd!vq" } });
    const pg2 = await (await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
    const e2 = []; pg2.on("pageerror", (e) => e2.push(String(e).slice(0, 180)));
    await pg2.goto(BASE + "/?vqdev=1&cb=" + Date.now(), { waitUntil: "domcontentloaded" });
    await pg2.evaluate((t) => localStorage.setItem("app.auth.token.v1", t), li.j.token);
    await pg2.reload({ waitUntil: "domcontentloaded" });
    await pg2.waitForTimeout(4800);
    await pg2.evaluate(() => {
      ["firstLaunchOverlay", "vqbFlow", "vqNewAuth", "authGate", "authBootSplash", "vqOnboardingOverlay"].forEach((id) => {
        const e = document.getElementById(id);
        if (e) { e.hidden = true; e.style.setProperty("display", "none", "important"); }
      });
      document.body.classList.remove("auth-booting", "auth-gate-open");
      const a2 = document.getElementById("app"); if (a2) a2.style.setProperty("display", "block", "important");
      document.body.setAttribute("data-ui-v2", "1");
    });
    await pg2.waitForTimeout(3000);
    const d = await pg2.evaluate(() => {
      const h = document.getElementById("vqTour");
      if (!h || h.style.display === "none") return null;
      return (h.shadowRoot.querySelector(".t").textContent || "").trim();
    });
    ok("暗証番号を決める前に案内が出る", !!d && d.indexOf("暗証番号") >= 0, String(d));
    await pg2.screenshot({ path: "shots/tour/pin.png" });
    await pg2.evaluate(() => document.getElementById("vqTour").shadowRoot.querySelector("[data-go]").click());
    await pg2.waitForTimeout(1200);
    const pinTxt = await pg2.evaluate(() => {
      const h = document.getElementById("vqPin");
      if (!h || h.style.display === "none") return null;
      return (h.shadowRoot.querySelector(".card").textContent || "").replace(/\s+/g, " ").trim();
    });
    ok("案内のあと、暗証番号を決める画面へ進む", !!pinTxt && pinTxt.indexOf("暗証番号を決める") >= 0, String(pinTxt).slice(0, 40));
    ok("画面の失敗が出ていない（暗証番号）", e2.length === 0, e2.join(" / "));
    }
  }

  await br.close();
  console.log("\n合格 " + pass + " / 不合格 " + fail);
  process.exit(fail ? 1 : 0);
})();
