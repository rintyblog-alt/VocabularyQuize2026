/* ローカルAI E2E: 探索→ペアリング→実ストリーミング→UI描画 */
const { chromium } = require("playwright");
const OUT = require("path").join(__dirname, "_fixtures", "newauth/");
const HIDE = `#vqbFlow,#mob-tut-overlay,#mobBarTutorial,#firstLaunchOverlay,#vqOnboardingOverlay{display:none !important;}`;
const CODE = process.argv[2];

async function login(pg) {
  await pg.goto("http://127.0.0.1:8791/?vqdev=1", { waitUntil: "domcontentloaded", timeout: 30000 });
  await pg.addStyleTag({ content: HIDE });
  await pg.waitForFunction(() => document.getElementById("authLoginSubmitBtn"), { timeout: 20000 });
  await pg.evaluate(() => {
    const setV = (el, v) => { const p = el.tagName === "SELECT" ? HTMLSelectElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(p.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); };
    setV(document.getElementById("authLoginGrade"), "H3");
    setV(document.getElementById("authLoginNickname"), "tester");
    setV(document.getElementById("authLoginPassword"), "Abcd1234");
    document.getElementById("authLoginSubmitBtn").click();
  });
  await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1" && window.__vqLocalAI, { timeout: 30000 });
  await pg.addStyleTag({ content: HIDE });
  await pg.waitForTimeout(2200);
  for (let i = 0; i < 3; i++) {
    const c = await pg.evaluate(() => { const bd = document.querySelector(".ui-modal-backdrop");
      if (!bd || getComputedStyle(bd).display === "none") return false;
      const b2 = document.getElementById("uiModalOk") || document.getElementById("uiModalCancel");
      if (b2) { b2.click(); return true; } return false; });
    if (!c) break; await pg.waitForTimeout(400);
  }
  await pg.evaluate(() => { const n = document.getElementById("vqNewAuth"); if (n) n.style.display = "none"; });
  await pg.evaluate(() => { const e = document.querySelector('#appTabBar [data-app-tab="chat"]'); if (e) e.click(); });
  await pg.waitForTimeout(1500);
}

(async () => {
  const b = await chromium.launch({ headless: true });
  const pg = await (await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
  const errs = []; pg.on("pageerror", e => errs.push(e.message.slice(0, 160)));
  await login(pg);
  const out = {};

  out.discover = await pg.evaluate(async () => {
    const url = await window.__vqLocalAI.discover();
    const h = await window.__vqLocalAI.isAvailable();
    return { url, health: h };
  });

  if (CODE) {
    out.pair = await pg.evaluate(async (c) => await window.__vqLocalAI.pair(c), CODE);
  }
  await pg.evaluate(async () => { if (window.__vqChatLocalRefresh) await window.__vqChatLocalRefresh(); });
  await pg.waitForTimeout(500);
  out.paired = await pg.evaluate(() => window.__vqLocalAI.isPaired());
  out.caps = await pg.evaluate(async () => { try { return await window.__vqLocalAI.getCapabilities(); } catch (e) { return { err: String(e) }; } });
  out.models = await pg.evaluate(async () => { try { return await window.__vqLocalAI.getModels(); } catch (e) { return { err: String(e) }; } });

  /* 状態チップ */
  await pg.evaluate(async () => { const r = document.getElementById("vqChat").shadowRoot; r.querySelector("[data-localchip]"); });
  await pg.waitForTimeout(1200);
  out.chip = await pg.evaluate(() => {
    const c = document.getElementById("vqChat").shadowRoot.querySelector("[data-localchip]");
    return { text: c.textContent, on: c.classList.contains("on"), hidden: c.hidden };
  });

  /* 実送信（ローカル経由）— ネットワークを監視してクラウドへ出ていないか確認 */
  const cloudHits = [];
  pg.on("request", r => { const u = r.url(); if (/\/api\/ai\/chat/.test(u)) cloudHits.push(u); });

  const t0 = Date.now();
  await pg.evaluate(() => {
    const r = document.getElementById("vqChat").shadowRoot;
    const ta = r.querySelector(".ta");
    ta.value = "日本の四季を1文で説明して。";
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    r.querySelector('[data-a="send"]').click();
  });
  await pg.waitForFunction(() => {
    const r = document.getElementById("vqChat").shadowRoot;
    const ai = r.querySelector(".msg.ai .b");
    return ai && ai.textContent.trim().length > 8;
  }, { timeout: 120000 }).catch(() => {});
  const firstPaint = Date.now() - t0;
  await pg.waitForTimeout(6000);

  out.send = await pg.evaluate(() => {
    const r = document.getElementById("vqChat").shadowRoot;
    return {
      msgs: [...r.querySelectorAll(".msg")].map(m => m.className),
      user: (r.querySelector(".msg.user .b") || {}).textContent,
      ai: ((r.querySelector(".msg.ai .b") || {}).textContent || "").slice(0, 120),
      aiLen: ((r.querySelector(".msg.ai .b") || {}).textContent || "").length,
      acts: [...r.querySelectorAll(".arow .atl")].map(x => x.textContent.trim()).slice(0, 8)
    };
  });
  out.firstPaintMs = firstPaint;
  out.cloudCalls = cloudHits.length;
  await pg.screenshot({ path: OUT + "l_local_chat.png" });

  out.errs = errs.slice(0, 5);
  console.log(JSON.stringify(out, null, 2));
  await b.close();
})().catch(e => { console.error("FATAL", e && e.stack); process.exit(1); });
