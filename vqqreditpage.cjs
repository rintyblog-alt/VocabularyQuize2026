/* ══════════════════════════════════════════════════════════════════════
   Qredit の新しい画面（1 枚の画面・Studio 準拠）

   確かめること:
     ① 左パネルの Qredit で、重ねる窓ではなく **画面が切り替わる**
     ② まだ持っていない人には発行の流れ、持っている人にはカードと残高
     ③ 発行が通しでできる（本人確認 → 通知の 6 桁 → 確認 → 同意 → 発行）
     ④ 発行後は同じ画面がカードと残高に変わる
     ⑤ 履歴が出る。1 件を押すと明細が出る
     ⑥ 旧オーバーレイ 2 枚は出てこない
     ⑦ スマホ幅で横に溢れない
     ⑧ 明るい / 暗いテーマのどちらでも読める（文字と背景の差）

   使い方: VQ_BASE=… node vqqreditpage.cjs
   ══════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const fs = require("node:fs");
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
fs.mkdirSync("shots/qredit", { recursive: true });

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => { c ? (pass++, console.log("  ok   " + n))
  : (fail++, bad.push(n), console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 260) : ""))); };
const section = (t) => console.log("\n══ " + t + " ══");

const PIN = "8306", PW = "Passw0rd!vq";
async function call(p, o = {}) {
  const h = { "Content-Type": "application/json" };
  if (o.token) h.Authorization = "Bearer " + o.token;
  const r = await fetch(BASE + p, { method: o.method || "GET", headers: h, body: o.body ? JSON.stringify(o.body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { s: r.status, j: j || {} };
}
const uniq = () => "vqp" + String(Date.now()).slice(-7) + Math.floor(Math.random() * 90 + 10);
async function makeUser() {
  const u = uniq(), email = u + "@gmail.com";
  const a = await call("/api/auth/register/start", { method: "POST", body: { email, gradePrefix: "H2", nickname: u, password: PW } });
  const b = await call("/api/auth/register/verify", { method: "POST", body: { challengeId: a.j.challengeId, code: a.j.devCode } });
  const c = await call("/api/auth/register/consent", {
    method: "POST", body: { registrationSession: b.j.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: PIN }
  });
  return { u, email, token: c.j.token };
}

const tap = async (pg, d) => {
  for (const k of String(d).split("")) {
    await pg.evaluate((x) => {
      const h = document.getElementById("vqPin");
      const b = h && h.shadowRoot.querySelector('.key[data-k="' + x + '"]');
      if (b) b.click();
    }, k);
    await pg.waitForTimeout(110);
  }
  await pg.waitForTimeout(900);
};

async function boot(br, token, w, h) {
  const pg = await (await br.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: w <= 820, hasTouch: w <= 820 })).newPage();
  const errs = []; pg.on("pageerror", (e) => errs.push(String(e.message).slice(0, 180)));
  await pg.goto(BASE + "/?vqdev=1&cb=" + Date.now(), { waitUntil: "domcontentloaded", timeout: 180000 });
  await pg.evaluate((t) => {
    localStorage.setItem("app.auth.token.v1", t);
    localStorage.setItem("vq.tour.v1", JSON.stringify({ pin: 1, preset: 1, feed: 1, news: 1, insight: 1, chat: 1, notif: 1, mock: 1, presetmake: 1, settings: 1 }));
  }, token);
  await pg.reload({ waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(5200);
  await pg.evaluate(() => {
    ["firstLaunchOverlay", "vqbFlow", "vqNewAuth", "authGate", "authBootSplash", "vqTour"].forEach((id) => {
      const e = document.getElementById(id); if (e) { e.hidden = true; e.style.setProperty("display", "none", "important"); }
    });
    document.body.classList.remove("auth-booting", "auth-gate-open");
    const a = document.getElementById("app"); if (a) a.style.setProperty("display", "block", "important");
    document.body.setAttribute("data-ui-v2", "1");
  });
  for (let i = 0; i < 3; i++) {
    const shown = await pg.evaluate(() => { const h = document.getElementById("vqPin"); return !!(h && h.style.display !== "none"); });
    if (!shown) break;
    await tap(pg, PIN);
  }
  await pg.waitForTimeout(2500);
  return { pg, errs };
}

const S = (pg) => pg.evaluate(() => {
  const host = document.getElementById("vqQredit");
  const r = host && host.shadowRoot;
  return {
    tab: document.body.getAttribute("data-app-tab") || "",
    mounted: !!r,
    text: r ? (r.querySelector(".wrap").textContent || "").replace(/\s+/g, " ").trim() : "",
    hasCard: !!(r && r.querySelector(".c3d")),
    hasHero: !!(r && r.querySelector(".hero")),
    step: r ? Array.from(r.querySelectorAll(".step.on .step__l")).map((e) => e.textContent.replace(/（.*/, "")).join(",") : "",
    oldSheet: (() => { const o = document.getElementById("appQreditOverlay"); return !!o && !o.classList.contains("hidden"); })(),
    oldCard: (() => { const o = document.getElementById("appQreditCardOverlay"); return !!o && !o.classList.contains("hidden"); })()
  };
});
const act = async (pg, a) => {
  const hit = await pg.evaluate((sel) => {
    const r = document.getElementById("vqQredit").shadowRoot;
    const b = r.querySelector('[data-a="' + sel + '"]');
    if (!b || b.disabled) return false;
    b.click(); return true;
  }, a);
  await pg.waitForTimeout(1400);
  return hit;
};
const type = async (pg, sel, v) => {
  await pg.evaluate(([s, val]) => {
    const r = document.getElementById("vqQredit").shadowRoot;
    const e = r.querySelector(s);
    if (e) { e.value = val; e.dispatchEvent(new Event("input", { bubbles: true })); }
  }, [sel, v]);
  await pg.waitForTimeout(120);
};

(async () => {
  const br = await chromium.launch({ headless: true });
  const me = await makeUser();
  if (!me.token) { console.error("検証アカウントを作れません"); process.exit(1); }
  const { pg, errs } = await boot(br, me.token, 1280, 900);

  section("⓪ 入ったら、まだ持っていない人には自分から出る");
  {
    await pg.waitForTimeout(3500);
    const auto = await S(pg);
    ok("★自分から Qredit の画面へ移る", auto.tab === "qredit", auto.tab);
    ok("★発行の流れが出ている", /はじめる/.test(auto.text), auto.text.slice(0, 100));
    ok("重ねる窓は出ない", !auto.oldSheet && !auto.oldCard, auto);
  }

  section("① 左パネルから画面が切り替わる");
  await pg.evaluate(() => {
    const r = document.getElementById("vqShell").shadowRoot;
    const it = Array.from(r.querySelectorAll(".vqs-item")).find((x) => (x.innerText || "").trim().indexOf("Qredit") === 0);
    if (it) it.click();
  });
  await pg.waitForTimeout(2600);
  let s = await S(pg);
  ok("★タブが qredit へ移る", s.tab === "qredit", s.tab);
  ok("★新しい画面が立ち上がる", s.mounted, s);
  ok("★旧オーバーレイは出ない（残高）", !s.oldSheet);
  ok("★旧オーバーレイは出ない（カード）", !s.oldCard);
  await pg.screenshot({ path: "shots/qredit/p1-発行-紹介.png" });

  section("② まだ持っていない人には発行の流れ");
  ok("紹介が出る", /Qredit Card/.test(s.text) && /はじめる/.test(s.text), s.text.slice(0, 120));
  ok("カードの絵が出る", s.hasCard);

  section("③ 通しで発行できる");
  await act(pg, "to-identity");
  s = await S(pg);
  ok("本人確認へ進む", s.step === "入力", s.step);
  await type(pg, '[data-f="userId"]', me.u);
  await type(pg, '[data-f="email"]', me.email);
  await type(pg, '[data-f="password"]', PW);
  await type(pg, '[data-f="pin"]', PIN);
  await pg.screenshot({ path: "shots/qredit/p2-発行-本人確認.png" });
  await act(pg, "verify-start");
  await pg.waitForTimeout(2600);
  s = await S(pg);
  ok("★認証（コード）へ進む", s.step === "認証", { step: s.step, t: s.text.slice(0, 120) });
  await pg.screenshot({ path: "shots/qredit/p3-発行-コード.png" });

  const code = await (async () => {
    const r = await call("/api/user/notifications?limit=10", { token: me.token });
    const list = r.j.items || r.j.notifications || [];
    const hit = list.find((x) => String(x.type || "").indexOf("qredit_card_verify") >= 0);
    return hit ? (String(hit.body || "").match(/(\d{6})/) || [])[1] : "";
  })();
  ok("通知に 6 桁が届く", /^\d{6}$/.test(String(code || "")), code ? "6桁" : "なし");
  await type(pg, "#vqqCode", code);
  await act(pg, "verify-confirm");
  await pg.waitForTimeout(2600);
  s = await S(pg);
  ok("★確認へ進む", s.step === "確認", { step: s.step, t: s.text.slice(0, 120) });
  await pg.screenshot({ path: "shots/qredit/p4-発行-確認.png" });

  await act(pg, "to-terms");
  await pg.waitForTimeout(900);
  const before = await pg.evaluate(() => {
    const r = document.getElementById("vqQredit").shadowRoot;
    const b = r.querySelector('[data-a="issue-now"]');
    return b ? b.disabled : null;
  });
  ok("★読み終わるまで発行できない", before === true, before);
  await pg.evaluate(() => {
    const r = document.getElementById("vqQredit").shadowRoot;
    const t = r.querySelector("#vqqTerms");
    if (t) { t.scrollTop = t.scrollHeight; t.dispatchEvent(new Event("scroll")); }
  });
  await pg.waitForTimeout(900);
  await pg.screenshot({ path: "shots/qredit/p5-発行-同意.png" });
  await act(pg, "issue-now");
  await pg.waitForTimeout(4200);
  s = await S(pg);
  ok("★発行できる", /発行しました/.test(s.text), s.text.slice(0, 120));
  await pg.screenshot({ path: "shots/qredit/p6-発行-完了.png" });

  section("④ 同じ画面がカードと残高に変わる");
  await act(pg, "wallet");
  await pg.waitForTimeout(2200);
  s = await S(pg);
  ok("★残高の帯が出る", s.hasHero, s.text.slice(0, 100));
  ok("カードが出る", s.hasCard);
  ok("発行済みと分かる", /発行済み/.test(s.text), s.text.slice(0, 140));
  const bal = await pg.evaluate(() => {
    const r = document.getElementById("vqQredit").shadowRoot;
    const e = r.querySelector(".hero__v");
    return e ? e.textContent.replace(/\s+/g, " ").trim() : "";
  });
  ok("残高が入っている", /[1-9]/.test(bal), bal);
  await pg.screenshot({ path: "shots/qredit/p7-カードと残高.png" });

  section("⑤ 履歴");
  const rows = await pg.evaluate(() => {
    const r = document.getElementById("vqQredit").shadowRoot;
    return r.querySelectorAll('[data-a="detail"]').length;
  });
  ok("履歴が並ぶ", rows > 0, rows);
  if (rows > 0) {
    await act(pg, "detail");
    s = await S(pg);
    const sheet = await pg.evaluate(() => !!document.getElementById("vqQredit").shadowRoot.querySelector(".sheet"));
    ok("1 件を押すと明細が出る", sheet, sheet);
    await pg.screenshot({ path: "shots/qredit/p8-明細.png" });
    await act(pg, "sheet-x");
  }

  section("⑥ カードの裏返し");
  await act(pg, "flip");
  const flipped = await pg.evaluate(() => !!document.getElementById("vqQredit").shadowRoot.querySelector(".c3d.is-flipped"));
  ok("裏返る", flipped, flipped);
  await act(pg, "flip");

  section("⑦ 明るい / 暗いテーマ");
  const contrast = async () => pg.evaluate(() => {
    const r = document.getElementById("vqQredit").shadowRoot;
    const el = r.querySelector(".h1") || r.querySelector(".h2");
    const card = r.querySelector(".card");
    if (!el || !card) return null;
    const lum = (c) => {
      const m = c.match(/\d+/g) || [0, 0, 0];
      const f = m.slice(0, 3).map((v) => { v = Number(v) / 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); });
      return .2126 * f[0] + .7152 * f[1] + .0722 * f[2];
    };
    const a = lum(getComputedStyle(el).color), b = lum(getComputedStyle(card).backgroundColor);
    const hi = Math.max(a, b), lo = Math.min(a, b);
    return Math.round(((hi + .05) / (lo + .05)) * 10) / 10;
  });
  const light = await contrast();
  ok("明るいテーマで文字が読める（4.5 以上）", light !== null && light >= 4.5, light);
  await pg.evaluate(() => document.documentElement.setAttribute("data-theme-mode", "dark"));
  await pg.waitForTimeout(700);
  const dark = await contrast();
  ok("★暗いテーマでも文字が読める（4.5 以上）", dark !== null && dark >= 4.5, dark);
  await pg.screenshot({ path: "shots/qredit/p9-暗いテーマ.png" });
  await pg.evaluate(() => document.documentElement.setAttribute("data-theme-mode", "light"));

  section("⑨ 端末に秘密が残らない");
  {
    const leaked = await pg.evaluate((pw) => {
      const out = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        const v = String(localStorage.getItem(k) || "");
        if (v.indexOf(pw) >= 0 || /"pin"\s*:\s*"\d{4,6}"/.test(v)) out.push(k);
      }
      return out;
    }, PW);
    ok("★パスワードと暗証番号を端末に残さない", leaked.length === 0, leaked);
  }

  ok("画面の失敗が出ていない", errs.length === 0, errs.slice(0, 3));
  await pg.context().close();

  section("⑧ スマホ幅（390）");
  {
    const { pg: mp, errs: me2 } = await boot(br, me.token, 390, 844);
    await mp.evaluate(() => { if (window.__vqOpenQredit) window.__vqOpenQredit("wallet"); });
    await mp.waitForTimeout(3000);
    const over = await mp.evaluate(() => {
      const r = document.getElementById("vqQredit");
      if (!r) return null;
      const doc = document.documentElement;
      return { pageOverflow: doc.scrollWidth - doc.clientWidth, hostOverflow: r.scrollWidth - r.clientWidth };
    });
    ok("★横に溢れない", !!over && over.pageOverflow <= 1 && over.hostOverflow <= 1, over);
    await mp.screenshot({ path: "shots/qredit/p10-スマホ.png", fullPage: false });
    ok("画面の失敗が出ていない（スマホ）", me2.length === 0, me2.slice(0, 3));
    await mp.context().close();
  }

  await br.close();
  console.log("\n合格 " + pass + " / 不合格 " + fail);
  if (bad.length) console.log("直すところ:\n  - " + bad.join("\n  - "));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("実行できませんでした:", e); process.exit(1); });
