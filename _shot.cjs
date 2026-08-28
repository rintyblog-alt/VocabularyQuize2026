"use strict";
const { chromium } = require("playwright");
const BASE = "http://127.0.0.1:8791";
const OUT = "/private/tmp/claude-501/-Users-user-Downloads-word-practice-v26-menu-terms-report-emailjs/ea86a79f-1ff2-4347-9303-995fcdd2a12d/scratchpad";
const PANE = process.argv[2] || "";
(async () => {
  const nick = "lb" + Date.now().toString(36).slice(-6);
  const reg = await (await fetch(BASE + "/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gradePrefix: "H1", nickname: nick, password: "DevLb#2026a", tosAccepted: true, tosVersion: "1" }) })).json();
  for (let i = 0; i < 4; i++) {
    await fetch(BASE + "/api/survive/result", { method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + reg.token },
      body: JSON.stringify({ courseId: "c0"+(i+1), finished: true, time: 28+i*3, rank: i?2:1, correct: 3, wrong: i, length: 220 }) });
  }
  const b = await chromium.launch({ args: ["--enable-unsafe-swiftshader","--use-gl=angle","--use-angle=swiftshader"] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript((tk) => { try { localStorage.setItem("app.auth.token.v1", tk);
    localStorage.setItem("app.auth.expiresAt.v1", String(Date.now()+86400000));
    localStorage.setItem("vq.survive.help.v1","1"); } catch(e){} }, reg.token);
  const pg = await ctx.newPage();
  const errs=[]; pg.on("pageerror", e=>errs.push(String(e&&e.message||e)));
  await pg.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => !!document.getElementById("appSurvivePage"), null, { timeout: 25000 });
  await pg.addStyleTag({ content: "#vqPin,#vqTour,#vqLumiTour,#vqNewAuth,#authGate,#firstLaunchOverlay,#globalLoadingOverlay,#vqEnvBadge,#vqNewsFlash{display:none!important}" });
  await pg.evaluate(() => { const f=()=>{document.body.classList.remove("auth-booting","auth-gate-open","first-launch-open");
    for(const id of ["authGate","authBootSplash","firstLaunchOverlay","globalLoadingOverlay"]){const e=document.getElementById(id);if(e)e.classList.add("hidden");}};
    f(); if(!window.__g) window.__g=setInterval(f,150); });
  await pg.evaluate(() => document.querySelector('#appTabBar [data-app-tab="survive"]').click());
  await pg.waitForFunction(() => !!(window.VocabuSurvive && window.VocabuSurvive.state().opened), null, { timeout: 45000, polling: 250 });
  await pg.waitForFunction(() => { const h=document.querySelector("#appSurvivePage .vq-survive-host");
    return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vs-load-start")); }, null, { timeout: 45000, polling: 250 });
  await pg.evaluate(() => document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot.querySelector(".vs-load-start").click());
  await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "lobby", null, { timeout: 25000, polling: 250 });
  await new Promise(r=>setTimeout(r,2200));
  if (PANE) { await pg.evaluate((k)=>window.VocabuSurvive.__app.shell.get("lobby")._openPane(k), PANE); await new Promise(r=>setTimeout(r,700)); }
  await (await pg.$("#appSurvivePage")).screenshot({ path: OUT + "/nlb" + (PANE?"-"+PANE:"") + ".png" });
  const d = await pg.evaluate(() => {
    const lb = window.VocabuSurvive.__app.shell.get("lobby");
    const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
    const cv = r.querySelector(".vs-lb-stage");
    return { stage: !!lb.stage, fail: !!lb._stageFailed, cv: cv?[cv.width,cv.height]:null,
      pane: lb.pane, tiles: r.querySelectorAll(".vs-lb-tile").length,
      start: !!r.querySelector(".vs-lb-start") };
  });
  console.log(JSON.stringify(d), "例外", errs.length, errs.slice(0,2));
  await b.close();
})();
