/* 送信直後に「考えています」が本当に出るかを、実際に送って観測する。
   実行: node vqchatthink.cjs */
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

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();
  await login(pg);

  const chip = await pg.evaluate(() => {
    const r = document.getElementById("vqChat").shadowRoot;
    const c = r.querySelector("[data-localchip]");
    return c && !c.hidden ? c.textContent.trim() : "(なし)";
  });
  console.log("ローカルAI: " + chip);

  /* 送信して、スレッドの状態を 120ms ごとに観測する */
  await pg.evaluate(() => {
    const r = document.getElementById("vqChat").shadowRoot;
    const ta = r.querySelector(".ta");
    ta.value = "日本の首都はどこですか。一文で答えてください。";
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  });

  const samples = [];
  const t0 = Date.now();
  await pg.evaluate(() => document.getElementById("vqChat").shadowRoot.querySelector(".send").click());
  for (let i = 0; i < 100; i++) {
    const s = await pg.evaluate(() => {
      const r = document.getElementById("vqChat").shadowRoot;
      const th = r.querySelector(".think");
      const wv = r.querySelector(".think__l .wave");
      const msgs = r.querySelectorAll(".msg.ai");
      const last = msgs[msgs.length - 1];
      const aiLen = ((last && last.querySelector(".b")) || {}).textContent || "";
      /* 本文が空なのにコピー・再生成が見えていないか（実際の見え方で判定） */
      let actsVisibleWhileEmpty = false;
      msgs.forEach((m) => {
        const body = (m.querySelector(".b") || {}).textContent || "";
        const a = m.querySelector(".acts");
        if (a && !body.trim() && getComputedStyle(a).display !== "none") actsVisibleWhileEmpty = true;
      });
      return {
        think: !!th,
        waveText: wv ? wv.textContent : null,
        waveAnim: wv ? getComputedStyle(wv).animationName : null,
        aiLen: aiLen.trim().length,
        actsBad: actsVisibleWhileEmpty,
        busy: r.querySelector(".send").classList.contains("stop")
      };
    });
    samples.push({ t: Date.now() - t0, ...s });
    if (i > 6 && !s.busy && s.aiLen > 0) break;
    await pg.waitForTimeout(120);
  }

  const withThink = samples.filter(s => s.think);
  console.log("\n観測: " + samples.length + " 回 / 経過 " + samples[samples.length - 1].t + "ms");
  console.log("「考えています」が出ていた時間: " + (withThink.length ? withThink[0].t + "ms 〜 " + withThink[withThink.length - 1].t + "ms（" + withThink.length + "回）" : "一度も出なかった"));
  if (withThink.length) {
    const texts = [...new Set(withThink.map(s => s.waveText))];
    console.log("表示された文言: " + JSON.stringify(texts));
    console.log("波アニメ: " + [...new Set(withThink.map(s => s.waveAnim))].join(","));
  }
  const bad = samples.filter(s => s.actsBad);
  console.log("本文が空なのにコピー・再生成が見えていた回: " + bad.length + " / " + samples.length
    + (bad.length ? "  ← 直っていない（" + bad.slice(0, 5).map(s => s.t + "ms").join(",") + "）" : "  ← OK"));

  console.log("\n先頭12サンプル:");
  samples.slice(0, 12).forEach(s => console.log("  " + String(s.t).padStart(5) + "ms think=" + (s.think ? "○" : "×") + " wave=" + JSON.stringify(s.waveText) + " 本文=" + s.aiLen + "字"));

  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
