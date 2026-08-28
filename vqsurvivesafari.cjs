#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqsurvivesafari.cjs — **Safari（WebKit）で 遊べるか。**

   Chromium だけで 見ていると 気づけない ことが ある:
     ・WebGL2 が 使えない ことが ある（WebGL1 へ 落ちる）
     ・deviceMemory を 返さない（0）→ 段の 決め方が 変わる
     ・AudioContext は さわるまで 動かない
     ・IndexedDB の 癖が 違う
     ・iPhone は 横向きが 主戦場

   使い方: 先に  cd server && ./dev-local.sh echo 8795
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_API || "http://127.0.0.1:8795";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ok   " + n); }
  else { fail++; bad.push(n); console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 300) : "")); }
};
const 節 = (t) => console.log("\n══ " + t + " ══");
const 待つ = (ms) => new Promise((r) => setTimeout(r, ms));
const { webkit, devices } = require("playwright");

async function 人を作る(i) {
  const nick = "sf" + Date.now().toString(36).slice(-5) + i;
  const r = await fetch(BASE + "/api/auth/register", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gradePrefix: "H1", nickname: nick, password: "DevSf#2026a", tosAccepted: true, tosVersion: "1" })
  });
  const d = await r.json();
  if (!d.token) throw new Error("検証アカウントを作れません");
  return { token: d.token, name: nick };
}

async function 通す(br, ctxOpt, 名) {
  const ctx = await br.newContext(ctxOpt);
  const errs = [];
  const pg = await ctx.newPage();
  pg.on("pageerror", (e) => {
    const st = String((e && e.stack) || "");
    if (/vq-survive\.[0-9a-f]+\.js|vocabu-survive\//.test(st)) errs.push(String(e && e.message || e));
  });
  const U = await 人を作る(名);
  await ctx.addInitScript((tk) => {
    try {
      localStorage.setItem("app.auth.token.v1", tk);
      localStorage.setItem("app.auth.expiresAt.v1", String(Date.now() + 86400000));
      localStorage.setItem("vq.survive.help.v1", "1");
    } catch (e) {}
  }, U.token);
  await pg.goto(BASE + "/index.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.waitForFunction(() => !!document.getElementById("appSurvivePage"), null, { timeout: 40000, polling: 250 });
  await pg.evaluate(() => {
    const f = () => {
      document.body.classList.remove("auth-booting", "auth-gate-open", "first-launch-open");
      for (const id of ["authGate", "authBootSplash", "firstLaunchOverlay", "globalLoadingOverlay"]) {
        const e = document.getElementById(id); if (e) e.classList.add("hidden");
      }
    };
    f(); if (!window.__g) window.__g = setInterval(f, 120);
  });
  await pg.evaluate(() => document.querySelector('#appTabBar [data-app-tab="survive"]').click());
  await pg.waitForFunction(() => !!(window.VocabuSurvive && window.VocabuSurvive.state().opened),
    null, { timeout: 60000, polling: 250 });
  await pg.waitForFunction(() => {
    const h = document.querySelector("#appSurvivePage .vq-survive-host");
    return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vs-load-start"));
  }, null, { timeout: 60000, polling: 250 });
  /* ★ START は 読み込みの **前**から 押せる（待たせない ため）。
     部品の 数を 見るなら、揃うのを 待ってから 測る。 */
  await pg.waitForFunction(() => (window.VocabuSurvive.state().loaded || []).length >= 7,
    null, { timeout: 60000, polling: 250 }).catch(() => {});
  const 前 = await pg.evaluate(() => window.VocabuSurvive.state());
  await pg.evaluate(() => document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot.querySelector(".vs-load-start").click());
  await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "lobby", null, { timeout: 40000, polling: 250 });
  await pg.evaluate(() => {
    const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
    const lb = window.VocabuSurvive.__app.shell.get("lobby");
    lb.courseIndex = 0; lb.botCount = 3; lb.mode = "race"; lb._render();
    r.querySelector(".vs-lb-start").click();
  });
  await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "match", null, { timeout: 45000, polling: 250 });
  await pg.evaluate(() => {
    const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
    const b = r.querySelector(".vs-help .vs-btn"); if (b) b.click();
  });
  await 待つ(5200);
  const st = await pg.evaluate(() => {
    const m = window.VocabuSurvive.__app.shell.get("match");
    const s = window.VocabuSurvive.state();
    return {
      webgl2: s.webgl2, tier: s.tier, mobile: s.mobile,
      板: [m.canvas.width, m.canvas.height],
      相: m.sim.phase, 秒: Math.round(m.sim.raceTime * 10) / 10,
      人: m.sim.players.length, 問: (m.questions || []).length,
      描: (m.renderer.stats || {}).draws | 0, 面: (m.renderer.stats || {}).tris | 0,
      /* 走る人が 動いているか */
      進: Math.round((m.sim.players[1] ? m.sim.players[1].progress : 0) * 10) / 10
    };
  });
  await ctx.close();
  return { st, 前, errs };
}

(async () => {
  const br = await webkit.launch();
  try {
    節("① 机の上の Safari");
    const a = await 通す(br, { viewport: { width: 1200, height: 820 } }, 1);
    console.log("     WebGL2: " + a.st.webgl2 + " / 段: " + a.st.tier +
      " / 描き " + a.st.描 + " 回 / 面 " + a.st.面);
    ok("読み込みで 例外が 出ない", !a.前.error, a.前.error);
    ok("部品が 全部 読める", (a.前.loaded || []).length >= 7, a.前.loaded);
    ok("試合まで 行ける", a.st.相 === "running", a.st);
    ok("板が 立つ", a.st.板[0] > 100 && a.st.板[1] > 100, a.st.板);
    ok("走り出す", a.st.秒 > 0, a.st.秒);
    ok("**描けている**", a.st.描 > 5 && a.st.面 > 1000, a.st);
    ok("4 人 いる", a.st.人 === 4, a.st.人);
    ok("問題が 用意される", a.st.問 > 0, a.st.問);
    ok("ボットが 走っている", a.st.進 > 1, a.st.進);
    ok("VocabuSurvive の 例外 0 件", a.errs.length === 0, a.errs.slice(0, 3));

    節("② iPhone（縦）");
    const b = await 通す(br, Object.assign({}, devices["iPhone 13"]), 2);
    console.log("     WebGL2: " + b.st.webgl2 + " / 段: " + b.st.tier +
      " / スマホ判定: " + b.st.mobile + " / 描き " + b.st.描 + " 回");
    ok("スマホと 分かる", b.st.mobile === true, b.st.mobile);
    ok("試合まで 行ける", b.st.相 === "running", b.st);
    ok("板が 立つ", b.st.板[0] > 100 && b.st.板[1] > 100, b.st.板);
    ok("走り出す", b.st.秒 > 0, b.st.秒);
    ok("描けている", b.st.描 > 5, b.st.描);
    ok("**描き回数が 40 回 未満**", b.st.描 < 40, b.st.描);
    ok("VocabuSurvive の 例外 0 件", b.errs.length === 0, b.errs.slice(0, 3));

    節("③ iPhone（横）");
    const 横 = Object.assign({}, devices["iPhone 13 landscape"]);
    const c = await 通す(br, 横, 3);
    console.log("     板 " + c.st.板.join("×") + " / 描き " + c.st.描 + " 回");
    ok("試合まで 行ける", c.st.相 === "running", c.st);
    ok("板が 立つ", c.st.板[0] > 100 && c.st.板[1] > 100, c.st.板);
    ok("横長に なる", c.st.板[0] > c.st.板[1], c.st.板);
    ok("走り出す", c.st.秒 > 0, c.st.秒);
    ok("VocabuSurvive の 例外 0 件", c.errs.length === 0, c.errs.slice(0, 3));
  } finally {
    await br.close().catch(() => {});
  }
  console.log("\n────────────────────────────────");
  console.log("  ok " + pass + " / NG " + fail);
  if (bad.length) console.log("  落ちたもの:\n   - " + bad.join("\n   - "));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
