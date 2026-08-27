/* ══════════════════════════════════════════════════════════════════════════
   vqpinui.cjs — 暗証番号の「画面」の確認（サーバ側は vqpin.cjs）

   見るところ:
     ① 暗証番号を持つ人が開くと、必ず止められる（何よりも前に出る）
     ② 違う番号は弾き、合っていれば通って中に入れる
     ③ 既存ユーザーは 暗証番号 → メール → 確認コード → 同意 の順に通る
     ④ 決めるときは 2 回入力。そろわなければやり直し。弱い番号は断る
     ⑤ 設定から変えられる
   ══════════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const fs = require("node:fs");
fs.mkdirSync("shots/pin", { recursive: true });

const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  NG   " + n + (x ? "  → " + x : ""))); };

async function call(path, { method = "GET", token = "", body = null } = {}) {
  const h = { "Content-Type": "application/json" };
  if (token) h.Authorization = "Bearer " + token;
  const r = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, j: j || {} };
}
const uniq = () => "vqpu" + String(Date.now()).slice(-7) + Math.floor(Math.random() * 90 + 10);

/* 人を 1 人こしらえる。pin を渡さなければ「既存ユーザー」の形（何も済んでいない）にする。 */
async function makeUser(pin) {
  const u = uniq();
  const a = await call("/api/auth/register/start", {
    method: "POST", body: { email: u + "@gmail.com", gradePrefix: "H2", nickname: u, password: "Passw0rd!vq" }
  });
  const b = await call("/api/auth/register/verify", {
    method: "POST", body: { challengeId: a.j.challengeId, code: a.j.devCode }
  });
  const c = await call("/api/auth/register/consent", {
    method: "POST",
    body: { registrationSession: b.j.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: pin || "8306" }
  });
  return { u, token: c.j.token };
}
const login = (u) => call("/api/auth/login", { method: "POST", body: { gradePrefix: "H2", nickname: u, password: "Passw0rd!vq" } });

async function boot(pg, tk) {
  await pg.goto(BASE + "/?vqdev=1&cb=" + Date.now(), { waitUntil: "domcontentloaded" });
  if (tk) await pg.evaluate((t) => localStorage.setItem("app.auth.token.v1", t), tk);
  /* 案内（vq-tour）は vqtour.cjs で見る。ここでは暗証番号の流れだけを見たいので、
     **読み込みの前に**「見たこと」にしておく（あとから入れても間に合わない）。 */
  await pg.evaluate(() => localStorage.setItem("vq.tour.v1", JSON.stringify({
    pin: 1, preset: 1, feed: 1, news: 1, insight: 1, chat: 1, notif: 1, mock: 1, presetmake: 1, settings: 1
  })));
  await pg.reload({ waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(4800);
  await pg.evaluate(() => {
    ["firstLaunchOverlay", "vqbFlow", "vqNewAuth", "authGate", "authBootSplash", "vqOnboardingOverlay"].forEach((id) => {
      const e = document.getElementById(id);
      if (e) { e.hidden = true; e.style.setProperty("display", "none", "important"); }
    });
    document.body.classList.remove("auth-booting", "auth-gate-open");
    const a = document.getElementById("app"); if (a) a.style.setProperty("display", "block", "important");
    document.body.setAttribute("data-ui-v2", "1");
    /* 案内（vq-tour）は別のテストで見る。ここでは邪魔になるので「見たこと」にする。 */
    try {
      localStorage.setItem("vq.tour.v1", JSON.stringify({
        pin: 1, preset: 1, feed: 1, news: 1, insight: 1, chat: 1, notif: 1, mock: 1, presetmake: 1, settings: 1
      }));
      const tv = document.getElementById("vqTour"); if (tv) tv.style.display = "none";
    } catch (e) {}

    const sk = document.getElementById("vqObSkipBtn"); if (sk) sk.click();
  });
  await pg.waitForTimeout(2600);
}
const pinTxt = (pg) => pg.evaluate(() => {
  const h = document.getElementById("vqPin");
  if (!h || h.style.display === "none") return null;
  return (h.shadowRoot.querySelector(".card").textContent || "").replace(/\s+/g, " ").trim();
});
const tap = async (pg, digits) => {
  for (const d of String(digits).split("")) {
    await pg.evaluate((k) => {
      const b = document.getElementById("vqPin").shadowRoot.querySelector('.key[data-k="' + k + '"]');
      if (b) b.click();
    }, d);
    await pg.waitForTimeout(110);
  }
  await pg.waitForTimeout(900);
};

(async () => {
  const br = await chromium.launch({ headless: true });

  console.log("\n### 暗証番号を持つ人");
  {
    const made = await makeUser("8306");
    const li = await login(made.u);
    const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const pg = await ctx.newPage();
    const errs = []; pg.on("pageerror", (e) => errs.push(String(e).slice(0, 170)));
    await boot(pg, li.j.token);

    const t = await pinTxt(pg);
    ok("開いたら止められる", !!t && t.indexOf("暗証番号を入力") >= 0, String(t).slice(0, 50));
    const top = await pg.evaluate(() => {
      const e = document.elementFromPoint(195, 400);
      return e ? (e.id || e.tagName) : "";
    });
    ok("何よりも前に出ている", top === "vqPin", top);
    await pg.screenshot({ path: "shots/pin/入力-スマホ.png" });

    await tap(pg, "9999");
    ok("違う番号は弾く", (await pg.evaluate(() => {
      const h = document.getElementById("vqPin");
      const e = h.shadowRoot.querySelector(".err");
      return e ? e.textContent : "";
    })).indexOf("違います") >= 0);
    ok("弾いたあとは空に戻る", (await pg.evaluate(() =>
      document.getElementById("vqPin").shadowRoot.querySelectorAll(".dot.on").length)) === 0);

    /* 解錠の見え方（iPhone のロック解除のように、板が開いて奥が寄ってくる） */
    await pg.evaluate(() => { window.__vqSawUnlock = false;
      const t = setInterval(() => {
        const h = document.getElementById("vqPin");
        if (h && h.classList.contains("unlock")) window.__vqSawUnlock = true;
        if (document.body.classList.contains("vq-unlocking")) window.__vqSawUnlock = true;
      }, 40);
      setTimeout(() => clearInterval(t), 2500);
    });
    await tap(pg, "8306");
    await pg.waitForTimeout(300);
    ok("解錠の動きが出る", await pg.evaluate(() => window.__vqSawUnlock === true));
    ok("うしろの画面も寄ってくる", await pg.evaluate(() => !!document.getElementById("vqPinUnlockCss")));
    await pg.waitForTimeout(1200);
    ok("合っていれば通る", (await pinTxt(pg)) === null);
    ok("通ったあとは API も使える", (await call("/api/settings", { token: li.j.token })).status === 200);
    ok("画面の失敗が出ていない", errs.length === 0, errs.join(" / "));
    await pg.close();
  }

  console.log("\n### 既存ユーザーの引き上げ（暗証番号もメールも同意も無い人）");
  {
    const made = await makeUser("8306");
    /* 既存ユーザーの形にする（サーバの列を直に空へ戻す） */
    const wipe = await call("/api/auth/pin/status", { token: made.token });
    if (wipe.status !== 200) { console.log("  --   下ごしらえに失敗したので飛ばす"); }
    const { execSync } = require("node:child_process");
    try {
      execSync(`/Users/user/.npm-global/bin/wrangler d1 execute vocabuquiz_auth --local ` +
        `--config server/.local-run/echo/wrangler.toml --command ` +
        `"UPDATE users SET pin_hash='',pin_salt='',pin_len=0,pin_set_at=0,email='',email_canonical='',` +
        `email_verified_at=0,consented_at=0,tos_version='1',privacy_version='' WHERE nickname='${made.u}'"`,
        { stdio: "ignore" });
    } catch (e) { console.log("  --   D1 を直せなかったので飛ばす"); }

    const li = await login(made.u);
    const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const pg = await ctx.newPage();
    const errs = []; pg.on("pageerror", (e) => errs.push(String(e).slice(0, 170)));
    await boot(pg, li.j.token);

    let t = await pinTxt(pg);
    ok("まず暗証番号を決めさせる", !!t && t.indexOf("暗証番号を決める") >= 0, String(t).slice(0, 50));
    ok("何番目かを出す（1 / 3）", !!t && t.indexOf("1 / 3") >= 0, String(t).slice(0, 60));
    ok("4 桁と 6 桁を選べる", (await pg.evaluate(() =>
      document.getElementById("vqPin").shadowRoot.querySelectorAll(".seg button").length)) === 2);

    /* そろわないとやり直し */
    await tap(pg, "8306");
    await tap(pg, "8307");
    t = await pinTxt(pg);
    ok("2 回がそろわないとやり直し", !!t && t.indexOf("そろいませんでした") >= 0, String(t).slice(0, 60));

    /* 弱い番号は断る */
    await tap(pg, "1111");
    await tap(pg, "1111");
    t = await pinTxt(pg);
    ok("弱い番号は断る", !!t && (t.indexOf("同じ数字") >= 0 || t.indexOf("続き番号") >= 0), String(t).slice(0, 70));

    await tap(pg, "8306");
    await tap(pg, "8306");
    await pg.waitForTimeout(1500);
    t = await pinTxt(pg);
    ok("決めたら つぎはメール", !!t && t.indexOf("メールアドレスの登録") >= 0, String(t).slice(0, 50));
    await pg.screenshot({ path: "shots/pin/メール-スマホ.png" });

    /* Gmail 以外を弾く */
    await pg.evaluate(() => {
      const r = document.getElementById("vqPin").shadowRoot;
      r.querySelector("#vqpEmail").value = "a@example.com";
      r.querySelector('[data-act="email-send"]').click();
    });
    await pg.waitForTimeout(1500);
    t = await pinTxt(pg);
    ok("Gmail 以外は断る", !!t && t.indexOf("gmail.com") >= 0, String(t).slice(0, 90));

    const addr = "vqui" + String(Date.now()).slice(-8) + "@gmail.com";
    await pg.evaluate((a) => {
      const r = document.getElementById("vqPin").shadowRoot;
      r.querySelector("#vqpEmail").value = a;
      r.querySelector('[data-act="email-send"]').click();
    }, addr);
    await pg.waitForTimeout(2200);
    t = await pinTxt(pg);
    ok("確認コードの画面へ進む", !!t && t.indexOf("確認コードを入力") >= 0, String(t).slice(0, 50));
    const dev = await pg.evaluate(() => {
      const r = document.getElementById("vqPin").shadowRoot;
      const m = (r.querySelector(".card").textContent || "").match(/確認コード\s*(\d{6})/);
      return m ? m[1] : "";
    });
    ok("開発環境ではコードが画面に出る", /^\d{6}$/.test(dev), dev);
    await tap(pg, "000000");
    t = await pinTxt(pg);
    ok("違うコードは弾く", !!t && t.indexOf("違います") >= 0, String(t).slice(0, 60));
    await tap(pg, dev);
    await pg.waitForTimeout(1500);
    t = await pinTxt(pg);
    ok("正しいコードで同意へ進む", !!t && t.indexOf("利用規約とプライバシー") >= 0, String(t).slice(0, 50));
    await pg.screenshot({ path: "shots/pin/同意-スマホ.png" });

    const disabled = await pg.evaluate(() =>
      document.getElementById("vqPin").shadowRoot.querySelector('[data-act="consent-ok"]').disabled);
    ok("3 つ入れるまで押せない", disabled === true);
    await pg.evaluate(() => {
      const r = document.getElementById("vqPin").shadowRoot;
      ["t", "p", "a"].forEach((k) => {
        const c = r.querySelector('[data-agree="' + k + '"]');
        c.checked = true; c.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
      });
    });
    await pg.waitForTimeout(400);
    await pg.evaluate(() =>
      document.getElementById("vqPin").shadowRoot.querySelector('[data-act="consent-ok"]').click());
    await pg.waitForTimeout(2200);
    ok("同意で終わって中に入れる", (await pinTxt(pg)) === null);
    const status = await call("/api/auth/pin/status", { token: li.j.token });
    ok("サーバ側も 3 つとも済んでいる",
      status.j.needsPin === false && status.j.needsEmail === false && status.j.needsConsent === false,
      JSON.stringify(status.j));
    ok("画面の失敗が出ていない（引き上げ）", errs.length === 0, errs.join(" / "));
    await pg.close();
  }

  console.log("\n### 設定から変える");
  {
    const made = await makeUser("8306");
    const ctx = await br.newContext({ viewport: { width: 1440, height: 950 } });
    const pg = await ctx.newPage();
    const errs = []; pg.on("pageerror", (e) => errs.push(String(e).slice(0, 170)));
    await boot(pg, made.token);
    ok("決めた直後は止められない", (await pinTxt(pg)) === null);
    await pg.evaluate(() => window.__vqOpenSettings());
    await pg.waitForTimeout(700);
    await pg.evaluate(() => {
      const r = document.getElementById("vqSettings").shadowRoot;
      r.querySelector('.nav[data-nav="account"]').click();
    });
    await pg.waitForTimeout(500);
    const hasRow = await pg.evaluate(() =>
      !!document.getElementById("vqSettings").shadowRoot.querySelector("[data-pin]"));
    ok("設定に「暗証番号」の行がある", hasRow === true);
    await pg.evaluate(() =>
      document.getElementById("vqSettings").shadowRoot.querySelector("[data-pin]").click());
    await pg.waitForTimeout(1600);
    const t = await pinTxt(pg);
    ok("押すと「いまの暗証番号」から始まる", !!t && t.indexOf("いまの暗証番号") >= 0, String(t).slice(0, 40));
    await tap(pg, "8306");
    await tap(pg, "470913");   /* 6 桁を選ばずに 4 桁のまま打つと 4 桁で切れる */
    await pg.waitForTimeout(600);
    ok("画面の失敗が出ていない（設定）", errs.length === 0, errs.join(" / "));
    await pg.close();
  }

  await br.close();
  console.log("\n合格 " + pass + " / 不合格 " + fail);
  process.exit(fail ? 1 : 0);
})();
