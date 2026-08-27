const { chromium } = require("playwright");
const HIDE = `#vqbFlow,#mob-tut-overlay,#mobBarTutorial,#firstLaunchOverlay,#vqOnboardingOverlay{display:none !important;}`;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext();
  /* アプリより先に fetch を包む。どこから呼ばれたかを stack で残す。 */
  await ctx.addInitScript(() => {
    window.__aiCalls = [];
    const f = window.fetch;
    window.fetch = function (u, o) {
      try {
        const url = String((u && u.url) || u || "");
        if (url.includes("/api/ai/chat")) {
          const st = new Error().stack.split("\n").slice(1, 6).map((s) => s.trim()).join(" ← ");
          window.__aiCalls.push({ t: Date.now(), body: String((o && o.body) || "").slice(0, 120), stack: st });
        }
      } catch (e) {}
      return f.apply(this, arguments);
    };
  });
  const pg = await ctx.newPage();
  await pg.goto("http://127.0.0.1:8791/?vqdev=1", { waitUntil: "domcontentloaded" });
  await pg.addStyleTag({ content: HIDE });
  await pg.waitForFunction(() => document.getElementById("authLoginSubmitBtn"), { timeout: 20000 });
  await pg.evaluate(() => { const s=(el,v)=>{const p=el.tagName==="SELECT"?HTMLSelectElement:HTMLInputElement;
    Object.getOwnPropertyDescriptor(p.prototype,"value").set.call(el,v);
    el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));};
    s(document.getElementById("authLoginGrade"),"H3");s(document.getElementById("authLoginNickname"),"tester");
    s(document.getElementById("authLoginPassword"),"Abcd1234");document.getElementById("authLoginSubmitBtn").click(); });
  await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 30000 });
  await pg.waitForTimeout(8000);
  const calls = await pg.evaluate(() => window.__aiCalls || []);
  console.log("/api/ai/chat 呼び出し:", calls.length, "件");
  if (calls.length) {
    const t0 = calls[0].t;
    console.log("時刻(ms):", calls.map((c) => c.t - t0).join(" "));
    const by = {};
    calls.forEach((c) => { by[c.stack] = (by[c.stack] || 0) + 1; });
    Object.keys(by).sort((a,b)=>by[b]-by[a]).slice(0,4).forEach((k) => {
      console.log("\n" + by[k] + " 回:\n  " + k.replace(/ ← /g, "\n  "));
    });
    console.log("\n本文の先頭:", calls[0].body.slice(0, 100));
  }
  await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
