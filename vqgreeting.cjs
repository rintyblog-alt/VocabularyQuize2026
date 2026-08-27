/* ホーム画面の AI 挨拶が、失敗しても叩き続けないことを確かめる。

   実測（修正前）: 画面を開いてから 5 秒で 20 回。うち 19 回が再試行。
   ダッシュボードを描き直すたびに 500ms 後の再試行が積まれ、
   失敗が速いので「実行中」の見張りをすり抜けていた。

   挨拶が出ないのは困らない。AI を叩き続けるほうが困る。

   実行: node vqgreeting.cjs
*/
const { chromium } = require("playwright");
const HIDE = `#vqbFlow,#mob-tut-overlay,#mobBarTutorial,#firstLaunchOverlay,#vqOnboardingOverlay{display:none !important;}`;
const MAX = 3;   /* 上限 2 回 + 走り出しの 1 回まで許す */
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext();
  await ctx.addInitScript(() => {
    window.__aiCalls = [];
    const f = window.fetch;
    window.fetch = function (u) {
      try { const url = String((u && u.url) || u || "");
        if (url.includes("/api/ai/chat")) window.__aiCalls.push(Date.now());
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
  /* ホームを何度も描き直しても増えないこと（再描画ごとに再試行が積まれていた） */
  await pg.evaluate(() => { for (let i = 0; i < 5; i++) { try { _appRenderHomeOverview(); } catch (e) {} } });
  await pg.waitForTimeout(4000);
  const n = (await pg.evaluate(() => window.__aiCalls || [])).length;
  const ok = n <= MAX;
  console.log(`  ${ok ? "✓" : "×"} 挨拶の呼び出しは ${MAX} 回まで — 実測 ${n} 回（12秒＋再描画5回）`);
  await b.close();
  process.exit(ok ? 0 : 1);
})().catch(e=>{console.error(e);process.exit(1)});
