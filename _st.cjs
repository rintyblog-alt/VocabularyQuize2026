"use strict";
const { chromium } = require("playwright");
const BASE = "http://127.0.0.1:8791";
(async () => {
  const nick = "st" + Date.now().toString(36).slice(-6);
  const reg = await (await fetch(BASE + "/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gradePrefix: "H1", nickname: nick, password: "DevSt#2026a", tosAccepted: true, tosVersion: "1" }) })).json();
  await fetch(BASE + "/api/survive/result", { method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + reg.token },
    body: JSON.stringify({ courseId: "c01", finished: true, time: 30, rank: 1, correct: 3, wrong: 1, length: 220 }) });
  const b = await chromium.launch({ args: ["--enable-unsafe-swiftshader","--use-gl=angle","--use-angle=swiftshader"] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript((tk) => { try { localStorage.setItem("app.auth.token.v1", tk);
    localStorage.setItem("app.auth.expiresAt.v1", String(Date.now()+86400000));
    localStorage.setItem("vq.survive.help.v1","1"); } catch(e){} }, reg.token);
  const pg = await ctx.newPage();
  await pg.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => !!document.getElementById("appSurvivePage"), null, { timeout: 25000 });
  await pg.evaluate(() => { const f=()=>{document.body.classList.remove("auth-booting","auth-gate-open","first-launch-open");
    for(const id of ["authGate","authBootSplash","firstLaunchOverlay","globalLoadingOverlay"]){const e=document.getElementById(id);if(e)e.classList.add("hidden");}};
    f(); if(!window.__g) window.__g=setInterval(f,150); });
  await pg.evaluate(() => document.querySelector('#appTabBar [data-app-tab="survive"]').click());
  await pg.waitForFunction(() => !!(window.VocabuSurvive && window.VocabuSurvive.state().opened), null, { timeout: 45000, polling: 250 });
  await pg.waitForFunction(() => { const h=document.querySelector("#appSurvivePage .vq-survive-host");
    return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vs-load-start")); }, null, { timeout: 45000, polling: 250 });
  await pg.evaluate(() => document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot.querySelector(".vs-load-start").click());
  await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "lobby", null, { timeout: 25000, polling: 250 });
  await new Promise(r=>setTimeout(r,2000));
  const d = await pg.evaluate(async () => {
    const base = String(window.VQ_API_BASE||"").replace(/\/+$/,"");
    const tk = (typeof window._authGetToken === "function") ? String(window._authGetToken()||"") : "";
    let raw = null, err = "";
    try { const r = await fetch(base + "/api/survive/stats", { headers: { Authorization: "Bearer " + tk } });
      raw = { status: r.status, body: (await r.text()).slice(0,200) }; } catch(e){ err = String(e); }
    const sr = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
    return { base, tk: tk ? tk.slice(0,6)+"…" : "なし", raw, err,
      文: (sr.querySelector(".vs-lb-stats")||{}).textContent };
  });
  console.log(JSON.stringify(d).slice(0,500));
  await b.close();
})();
