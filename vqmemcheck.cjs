/* メモリ判定の修正が効いているかを、**実際の生成**で確かめる。

   これまで「メモリの空きが不足しています」で止まっていた経路を、
   小さめの生成（3 問）で 1 回だけ通す。

   実行: node vqmemcheck.cjs [http://127.0.0.1:8791]
*/
const { chromium } = require("playwright");
const BASE = process.argv[2] || "http://127.0.0.1:8791";

async function login(pg) {
  await pg.goto(BASE + "/?vqdev=1&vq2=all&cb=" + Date.now(), { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.addStyleTag({ content: "#vqNewAuth{display:none !important}" });
  await pg.waitForFunction(() => document.getElementById("authLoginSubmitBtn"), { timeout: 30000 });
  await pg.evaluate((c) => {
    const setV = (el, v) => {
      const P = el.tagName === "SELECT" ? HTMLSelectElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(P.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    setV(document.getElementById("authLoginGrade"), c.grade);
    setV(document.getElementById("authLoginNickname"), c.nick);
    setV(document.getElementById("authLoginPassword"), c.pw);
    document.getElementById("authLoginSubmitBtn").click();
  }, { grade: process.env.VQ_GRADE || "H3", nick: process.env.VQ_NICK || "tester",
       pw: process.env.VQ_PW || "Abcd1234" });
  await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 30000 });
  await pg.waitForTimeout(1500);
}

(async () => {
  const browser = await chromium.launch();
  const pg = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await login(pg);

  console.log("Bridge の状態を確認します…");
  const status = await pg.evaluate(async () => {
    const P = window.__vqLocalAI;
    if (!P) return { error: "provider なし" };
    try {
      const r = await fetch(P.url() + "/status", { headers: { Authorization: "Bearer " + P.token() } });
      if (!r.ok) return { error: "HTTP " + r.status };
      const j = await r.json();
      return {
        memSource: j.resources && j.resources.memSource,
        memFreeGB: j.resources ? +(j.resources.memFreeBytes / 1e9).toFixed(1) : null,
        memDetail: j.resources && j.resources.memDetail,
        loaded: j.loaded || j.loadedModels || null
      };
    } catch (e) { return { error: String(e.message || e) }; }
  });
  console.log("  " + JSON.stringify(status));

  console.log("\n実際に 3 問だけ作らせます（資料なし）…");
  const t0 = Date.now();
  const result = await pg.evaluate(async () => {
    const AI = window.VQ2.ai;
    const log = [];
    try {
      const res = await AI.generatePreset({
        instruction: "中学理科の光合成について、4択問題を3問だけ作ってください。",
        attachments: [], sourceOnly: false, level: "normal",
        onActivity: (items) => items.forEach((i) => {
          const line = i.label + (i.status ? " [" + i.status + "]" : "");
          if (!log.includes(line)) log.push(line);
        }),
        onWarning: (m) => log.push("警告: " + m)
      });
      const d = res.structured && (res.structured.questions ? res.structured
                : (res.structured.data || null));
      return { ok: true, log,
               questions: d && Array.isArray(d.questions) ? d.questions.length : 0,
               firstPrompt: d && d.questions && d.questions[0]
                 ? String(d.questions[0].question || d.questions[0].prompt || "").slice(0, 50) : "" };
    } catch (e) {
      return { ok: false, log, error: (e && (e.userMessage || e.message)) || String(e),
               code: e && e.code };
    }
  });
  const ms = Date.now() - t0;

  console.log("\n── 経過 ──");
  (result.log || []).forEach((l) => console.log("  " + l));
  console.log("\n── 結果 ──");
  if (result.ok) {
    console.log(`  ✓ 生成できました（${result.questions} 問 / ${(ms / 1000).toFixed(1)} 秒）`);
    if (result.firstPrompt) console.log("  1 問目: " + result.firstPrompt + "…");
  } else {
    console.log(`  × 失敗: ${result.error}`);
    if (result.code) console.log("  code: " + result.code);
  }
  const memoryBlocked = /メモリの空きが不足/.test(result.error || "")
    || (result.log || []).some((l) => /メモリの空きが不足/.test(l));
  console.log(memoryBlocked
    ? "\n  → メモリ判定でまだ止まっています。"
    : "\n  → メモリ判定では止まっていません。");

  await browser.close();
  process.exit(result.ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
