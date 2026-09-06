/* Quick Chat × Orchestrator の E2E: Activity 表示 / 停止 / 出典 / 深い思考 */
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
  await pg.evaluate(async () => { if (window.__vqChatLocalRefresh) await window.__vqChatLocalRefresh(); });
  await pg.waitForTimeout(600);
}

/* 送信ボタンは生成中「停止」に変わる。停止状態のまま押すとキャンセル扱いになるので、
   必ずアイドルへ戻ってから送る（実際の利用者操作と同じ順序）。 */
const send = async (pg, text) => {
  await pg.waitForFunction(() => {
    const r = document.getElementById("vqChat").shadowRoot;
    const b = r.querySelector('[data-a="send"]');
    return b && !b.classList.contains("stop");
  }, { timeout: 120000 }).catch(() => {});
  return pg.evaluate((t) => {
    const r = document.getElementById("vqChat").shadowRoot;
    const ta = r.querySelector(".ta");
    ta.value = t; ta.dispatchEvent(new Event("input", { bubbles: true }));
    r.querySelector('[data-a="send"]').click();
  }, text);
};

const acts = (pg) => pg.evaluate(() => {
  const r = document.getElementById("vqChat").shadowRoot;
  return [...r.querySelectorAll(".arow")].map(x => ({
    t: (x.querySelector(".atl") || {}).textContent || "",
    cls: x.className
  }));
});
const aiText = (pg) => pg.evaluate(() => {
  const r = document.getElementById("vqChat").shadowRoot;
  const n = [...r.querySelectorAll(".msg.ai .b")].pop();
  return n ? (n.textContent || "").trim() : "";
});

(async () => {
  const b = await chromium.launch({ headless: true });
  const pg = await (await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
  const errs = []; pg.on("pageerror", e => errs.push(e.message.slice(0, 200)));
  let phase = "boot";
  const cloud = []; pg.on("request", r => { if (/\/api\/ai\/chat/.test(r.url())) cloud.push(phase); });
  await login(pg);
  const out = {};

  /* Activity パネルを開いておく */
  await pg.evaluate(() => { const r = document.getElementById("vqChat").shadowRoot; const t = r.querySelector('[data-a="toggleAct"]'); if (t) t.click(); });
  await pg.waitForTimeout(300);

  phase = "standard";
  /* 1) 標準：検証が走るケース */
  const t0 = Date.now();
  await send(pg, "HTTPとHTTPSの違いを比較して");
  await pg.waitForFunction((sent) => {
    const r = document.getElementById("vqChat").shadowRoot;
    const btn = r.querySelector('[data-a="send"]');
    const mine = [...r.querySelectorAll(".msg.user .b")].some((u) => (u.textContent || "").indexOf(sent) >= 0);
    const n = [...r.querySelectorAll(".msg.ai .b")].pop();
    return mine && btn && !btn.classList.contains("stop") && n && (n.textContent || "").length > 40;
  }, "HTTPとHTTPSの違い", { timeout: 300000 }).catch(() => {});
  await pg.waitForTimeout(3000);
  out.standard = { ms: Date.now() - t0, acts: await acts(pg), len: (await aiText(pg)).length, hasTable: /比較項目|\|/.test(await aiText(pg)) };
  await pg.screenshot({ path: OUT + "o_standard.png" });

  phase = "cancel";
  /* 2) 停止：送信直後に停止して、次の送信ができること */
  await pg.evaluate(() => { const r = document.getElementById("vqChat").shadowRoot; const nb = r.querySelector('[data-a="new"]'); if (nb) nb.click(); });
  await pg.waitForTimeout(2500);
  await send(pg, "日本の高校教育制度について、できるだけ詳しく長く説明してください。");
  await pg.waitForTimeout(4500);
  await pg.evaluate(() => { const r = document.getElementById("vqChat").shadowRoot; r.querySelector('[data-a="send"]').click(); });
  await pg.waitForTimeout(3500);
  out.cancel = {
    stopped: await pg.evaluate(() => {
      const r = document.getElementById("vqChat").shadowRoot;
      return !r.querySelector('[data-a="send"]').classList.contains("stop");
    }),
    kept: (await aiText(pg)).length
  };
  /* 停止後に次の質問が通るか */
  await send(pg, "1たす1は？");
  await pg.waitForFunction(() => {
    const r = document.getElementById("vqChat").shadowRoot;
    return [...r.querySelectorAll(".msg.ai .b")].some(n => /2/.test(n.textContent || ""));
  }, { timeout: 120000 }).catch(() => {});
  await pg.waitForTimeout(1500);
  out.afterCancel = { ok: /2/.test(await aiText(pg)), text: (await aiText(pg)).slice(0, 60) };

  phase = "deep";
  /* 3) 深い思考 */
  await pg.evaluate(() => { const r = document.getElementById("vqChat").shadowRoot; const nb = r.querySelector('[data-a="new"]'); if (nb) nb.click(); });
  await pg.waitForTimeout(2500);
  await pg.evaluate(() => {
    const r = document.getElementById("vqChat").shadowRoot;
    const m = r.querySelector('[data-a="thinkMenu"]'); if (m) m.click();
  });
  await pg.waitForTimeout(300);
  out.thinkOptions = await pg.evaluate(() => {
    const r = document.getElementById("vqChat").shadowRoot;
    return [...r.querySelectorAll("[data-think]")].map(x => x.dataset.think + ":" + (x.textContent || "").trim().slice(0, 12));
  });
  await pg.evaluate(() => {
    const r = document.getElementById("vqChat").shadowRoot;
    const d = r.querySelector('[data-think="deep"]'); if (d) d.click();
  });
  await pg.waitForTimeout(400);
  const t2 = Date.now();
  await send(pg, "文化祭の運営を効率化する計画を、準備・当日・片付けの3段階で立ててください。");
  /* 深い思考は検証と修正を挟むので「本文が出た」だけでは終わっていない。
     ・自分が送った発言がスレッドに出ていること（前の会話の残りを誤検出しない）
     ・その後の AI 発言に本文があること
     ・送信ボタンが停止状態を抜けていること（＝Job 完了）
     の3つが揃うまで待つ。 */
  await pg.waitForFunction((sent) => {
    const r = document.getElementById("vqChat").shadowRoot;
    const btn = r.querySelector('[data-a="send"]');
    const users = [...r.querySelectorAll(".msg.user .b")];
    const mine = users.some((u) => (u.textContent || "").indexOf(sent) >= 0);
    const n = [...r.querySelectorAll(".msg.ai .b")].pop();
    return mine && btn && !btn.classList.contains("stop") && n && (n.textContent || "").length > 100;
  }, "文化祭の運営を効率化する計画", { timeout: 900000 }).catch(() => {});
  await pg.waitForTimeout(4000);
  out.deep = { ms: Date.now() - t2, acts: await acts(pg), len: (await aiText(pg)).length };
  await pg.screenshot({ path: OUT + "o_deep.png" });

  out.cloudCalls = cloud.length;
  out.cloudByPhase = cloud.reduce((a, p) => (a[p] = (a[p] || 0) + 1, a), {});
  out.errs = errs.slice(0, 6);
  console.log(JSON.stringify(out, null, 2));
  await b.close();
})().catch(e => { console.error("FATAL", e && e.stack); process.exit(1); });
