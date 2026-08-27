/* 話し方が親しみやすくなったか、実際に会話して確かめる。
   合否ではなく、返ってきた文章をそのまま見せる。
   実行: node vqchattone.cjs */
const { chromium } = require("playwright");
const HIDE = `#vqbFlow,#mob-tut-overlay,#mobBarTutorial,#firstLaunchOverlay,#vqOnboardingOverlay{display:none !important;}`;

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
  await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 30000 });
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
  await pg.waitForTimeout(1800);
}

async function ask(pg, text) {
  await pg.evaluate((t) => {
    const r = document.getElementById("vqChat").shadowRoot;
    const ta = r.querySelector(".ta");
    ta.value = t; ta.dispatchEvent(new Event("input", { bubbles: true }));
  }, text);
  const before = await pg.evaluate(() => document.getElementById("vqChat").shadowRoot.querySelectorAll(".msg.ai").length);
  await pg.evaluate(() => document.getElementById("vqChat").shadowRoot.querySelector(".send").click());
  await pg.waitForFunction((b) => {
    const r = document.getElementById("vqChat").shadowRoot;
    const n = r.querySelectorAll(".msg.ai");
    if (n.length <= b) return false;
    return !r.querySelector(".send").classList.contains("stop") && (n[n.length - 1].textContent || "").trim().length > 0;
  }, before, { timeout: 180000 });
  await pg.waitForTimeout(600);
  return await pg.evaluate(() => {
    const r = document.getElementById("vqChat").shadowRoot;
    const n = r.querySelectorAll(".msg.ai");
    return (n[n.length - 1].querySelector(".b").textContent || "").trim();
  });
}

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();
  await login(pg);

  const qs = [
    "おはよう！",
    "テスト勉強のやる気が出ないんだけど、どうしたらいい？",
    "鎌倉幕府が滅びた理由を教えて"
  ];
  for (const q of qs) {
    const a = await ask(pg, q);
    const emoji = (a.match(/\p{Extended_Pictographic}/gu) || []).length;
    console.log("\n──────────────────────────────");
    console.log("あなた: " + q);
    console.log("AI: " + a.slice(0, 400));
    console.log(`   〔絵文字 ${emoji} 個 / （笑） ${(a.match(/（笑）/g) || []).length} 個 / ${a.length}字〕`);
  }

  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
