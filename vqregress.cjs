/* Quick Chat 回帰テスト: 初期画面 / 履歴 / タイトル / ピン / プロジェクト /
   添付 / 思考レベル / Activity / モバイル / 両 Provider の存在 */
const { chromium } = require("playwright");
const OUT = require("path").join(__dirname, "_fixtures", "orch/");
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
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const pg = await ctx.newPage();
  const errs = []; pg.on("pageerror", e => errs.push(e.message.slice(0, 180)));
  await login(pg);
  const R = {};

  R.providers = await pg.evaluate(() => ({
    localAI: !!window.__vqLocalAI,
    files: !!window.__vqChatFiles,
    chatShell: !!document.getElementById("vqChat"),
    /* 既存のアプリ側チャットエンジン（CurrentAIProvider が駆動する DOM）が残っていること */
    legacyInput: !!document.getElementById("appChatInput"),
    legacySend: !!document.getElementById("appChatSendBtn"),
    legacyList: !!document.getElementById("appChatList"),
    legacyFileInput: !!document.getElementById("appChatFileInput"),
    legacySessions: !!document.getElementById("appChatSessionList")
  }));

  R.initial = await pg.evaluate(() => {
    const r = document.getElementById("vqChat").shadowRoot;
    return {
      composer: !!r.querySelector(".ta"),
      send: !!r.querySelector('[data-a="send"]'),
      attach: !!r.querySelector('[data-a="attach"]'),
      thinkMenu: !!r.querySelector('[data-a="thinkMenu"]'),
      modelMenu: !!r.querySelector('[data-a="modelMenu"]'),
      newBtn: !!r.querySelector('[data-a="new"]'),
      actToggle: !!r.querySelector('[data-a="toggleAct"]'),
      localChip: (r.querySelector("[data-localchip]") || {}).textContent || "",
      sidebarItems: r.querySelectorAll("[data-ses]").length
    };
  });

  /* 思考レベルの3段が出る */
  await pg.evaluate(() => { const r = document.getElementById("vqChat").shadowRoot; const m = r.querySelector('[data-a="thinkMenu"]'); if (m) m.click(); });
  await pg.waitForTimeout(250);
  R.thinkLevels = await pg.evaluate(() => {
    const r = document.getElementById("vqChat").shadowRoot;
    return [...r.querySelectorAll("[data-think]")].map(x => x.dataset.think);
  });
  await pg.keyboard.press("Escape");
  await pg.waitForTimeout(200);

  /* モデルは Standard のみ */
  await pg.evaluate(() => { const r = document.getElementById("vqChat").shadowRoot; const m = r.querySelector('[data-a="modelMenu"]'); if (m) m.click(); });
  await pg.waitForTimeout(250);
  R.models = await pg.evaluate(() => {
    const r = document.getElementById("vqChat").shadowRoot;
    return [...r.querySelectorAll("[data-model]")].map(x => (x.textContent || "").trim().slice(0, 20));
  });
  await pg.keyboard.press("Escape");
  await pg.waitForTimeout(200);

  /* 新規会話 → 送信 → タイトルが付き履歴へ入る */
  await pg.evaluate(() => { const r = document.getElementById("vqChat").shadowRoot; const nb = r.querySelector('[data-a="new"]'); if (nb) nb.click(); });
  await pg.waitForTimeout(2600);
  const before = await pg.evaluate(() => document.getElementById("vqChat").shadowRoot.querySelectorAll("[data-ses]").length);
  await pg.evaluate(() => {
    const r = document.getElementById("vqChat").shadowRoot;
    const ta = r.querySelector(".ta");
    ta.value = "三平方の定理を1文で説明して"; ta.dispatchEvent(new Event("input", { bubbles: true }));
    r.querySelector('[data-a="send"]').click();
  });
  await pg.waitForFunction(() => {
    const r = document.getElementById("vqChat").shadowRoot;
    const n = [...r.querySelectorAll(".msg.ai .b")].pop();
    return n && (n.textContent || "").length > 20;
  }, { timeout: 180000 }).catch(() => {});
  await pg.waitForTimeout(6000);
  R.afterSend = await pg.evaluate((before) => {
    const r = document.getElementById("vqChat").shadowRoot;
    return {
      title: (r.querySelector("[data-title]") || {}).textContent || "",
      sessionsBefore: before,
      sessionsAfter: r.querySelectorAll("[data-ses]").length,
      userMsg: (r.querySelector(".msg.user .b") || {}).textContent || "",
      aiLen: (([...r.querySelectorAll(".msg.ai .b")].pop() || {}).textContent || "").length,
      hasCopy: !!r.querySelector('[data-a="copy"]'),
      hasRegen: !!r.querySelector('[data-a="regen"]'),
      chip: (r.querySelector("[data-localchip]") || {}).textContent || "",
      err: (r.querySelector(".err") || {}).textContent || null,
      activeId: (document.querySelector("#appChatSessionList .app-chat-session-item.is-active") || {}).getAttribute
        ? document.querySelector("#appChatSessionList .app-chat-session-item.is-active").getAttribute("data-chat-ids") : null,
      store: (() => { try { const lc = JSON.parse(localStorage.getItem("vq.chat.localconv.v1") || "{}");
        return Object.keys(lc).map(k => k.slice(-6) + ":" + lc[k].map(m => m.role[0] + (m.text || "").length).join(",")); }
        catch (e) { return ["ERR"]; } })(),
      rawAi: (() => { try { const lc = JSON.parse(localStorage.getItem("vq.chat.localconv.v1") || "{}");
        const k = Object.keys(lc).pop(); const a = (lc[k] || []).filter(m => m.role === "ai").pop();
        return a ? a.text : null; } catch (e) { return "ERR"; } })(),
      threadHtml: ((r.querySelector('.msg.ai') || {}).outerHTML || "").slice(0, 300)
    };
  }, before);
  await pg.screenshot({ path: OUT + "r_desktop.png" });

  /* リロード後も会話が残る */
  await pg.reload({ waitUntil: "domcontentloaded" });
  await pg.addStyleTag({ content: HIDE });
  await pg.waitForTimeout(4500);
  await pg.evaluate(() => { const n = document.getElementById("vqNewAuth"); if (n) n.style.display = "none";
    const e = document.querySelector('#appTabBar [data-app-tab="chat"]'); if (e) e.click(); });
  await pg.waitForTimeout(2600);
  R.afterReload = await pg.evaluate(() => {
    const c = document.getElementById("vqChat");
    if (!c) return { ok: false };
    const r = c.shadowRoot;
    return {
      ok: true,
      sessions: r.querySelectorAll("[data-ses]").length,
      msgs: r.querySelectorAll(".msg").length,
      aiLen: (([...r.querySelectorAll(".msg.ai .b")].pop() || {}).textContent || "").length,
      stuckThinking: !!r.querySelector(".think")
    };
  });

  /* モバイル表示 */
  const mp = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })).newPage();
  const merrs = []; mp.on("pageerror", e => merrs.push(e.message.slice(0, 160)));
  await login(mp);
  R.mobile = await mp.evaluate(() => {
    const c = document.getElementById("vqChat");
    if (!c) return { ok: false };
    const r = c.shadowRoot;
    const ta = r.querySelector(".ta");
    const comp = ta ? (ta.closest(".composer") || ta.parentElement) : null;
    const wrap = ta ? (ta.closest(".cwrap") || comp) : null;
    const bar = document.getElementById("vqMobBar");
    const barTop = bar ? bar.getBoundingClientRect().top : null;
    const compBottom = comp ? comp.getBoundingClientRect().bottom : null;
    return {
      ok: true,
      hasComposer: !!ta,
      bottomBar: !!bar,
      barTop, compBottom,
      wrapBottom: wrap ? wrap.getBoundingClientRect().bottom : null,
      composerAboveBar: (barTop != null && compBottom != null) ? compBottom <= barTop + 2 : null
    };
  });
  await mp.screenshot({ path: OUT + "r_mobile.png" });

  R.errs = errs.slice(0, 6);
  R.mobileErrs = merrs.slice(0, 6);
  R.generatedAt = new Date().toISOString();
  try {
    require("fs").writeFileSync(
      "local-ai/src/evaluation/reports/regress-latest.json", JSON.stringify(R, null, 2));
  } catch (e) { console.error("save failed", e.message); }
  console.log(JSON.stringify(R, null, 2));
  await b.close();
})().catch(e => { console.error("FATAL", e && e.stack); process.exit(1); });
