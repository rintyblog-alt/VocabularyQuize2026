/* 複数人が同時に使えるかを実測する。
   別々のブラウザ（＝別の人）から同時に送り、両方が返るか・弾かれないかを見る。
   実行: node vqchatmulti.cjs [人数]
*/
const { chromium } = require("playwright");
const N = Math.max(2, parseInt(process.argv[2] || "3", 10));
const HIDE = `#vqbFlow,#mob-tut-overlay,#mobBarTutorial,#firstLaunchOverlay,#vqOnboardingOverlay{display:none !important;}`;

async function login(pg) {
  await pg.goto("http://127.0.0.1:8791/?vqdev=1", { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.addStyleTag({ content: HIDE });
  await pg.waitForFunction(() => document.getElementById("authLoginSubmitBtn"), { timeout: 30000 });
  await pg.evaluate(() => {
    const setV = (el, v) => { const p = el.tagName === "SELECT" ? HTMLSelectElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(p.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); };
    setV(document.getElementById("authLoginGrade"), "H3");
    setV(document.getElementById("authLoginNickname"), "tester");
    setV(document.getElementById("authLoginPassword"), "Abcd1234");
    document.getElementById("authLoginSubmitBtn").click();
  });
  await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 60000 });
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

async function ask(pg, text, who, t0, log) {
  await pg.evaluate((t) => {
    const r = document.getElementById("vqChat").shadowRoot;
    const ta = r.querySelector(".ta");
    ta.value = t; ta.dispatchEvent(new Event("input", { bubbles: true }));
  }, text);
  await pg.evaluate(() => document.getElementById("vqChat").shadowRoot.querySelector(".send").click());

  let queued = null, firstToken = null;
  const poll = setInterval(async () => {
    try {
      const s = await pg.evaluate(() => {
        const r = document.getElementById("vqChat").shadowRoot;
        const ai = r.querySelectorAll(".msg.ai");
        const last = ai[ai.length - 1];
        const wave = r.querySelector(".think__l .wave");
        return { chars: ((last && last.querySelector(".b")) || {}).textContent?.trim().length || 0,
                 wave: wave ? wave.textContent : "" };
      });
      if (!queued && /順番待ち/.test(s.wave || "")) { queued = Date.now() - t0; log.push(who + ": 順番待ち表示 " + Math.round(queued / 1000) + "秒"); }
      if (!firstToken && s.chars > 0) { firstToken = Date.now() - t0; }
    } catch (e) {}
  }, 400);

  let ok = true, err = "";
  try {
    await pg.waitForFunction(() => {
      const r = document.getElementById("vqChat").shadowRoot;
      const ai = r.querySelectorAll(".msg.ai");
      if (!ai.length) return false;
      return !r.querySelector(".send").classList.contains("stop")
        && (ai[ai.length - 1].textContent || "").trim().length > 5;
    }, null, { timeout: 1500000 });
  } catch (e) { ok = false; }
  clearInterval(poll);

  const o = await pg.evaluate(() => {
    const r = document.getElementById("vqChat").shadowRoot;
    const ai = r.querySelectorAll(".msg.ai");
    return { text: ((ai[ai.length - 1] || {}).textContent || "").trim(),
             err: (r.querySelector(".err") || {}).textContent || "" };
  });
  return { who, ok, ms: Date.now() - t0, firstToken, queued, chars: o.text.length, err: o.err.trim() };
}

(async () => {
  const br = await chromium.launch();
  console.log(N + " 人が同時に送ります（別ブラウザ）\n");
  const ctxs = [], pages = [];
  for (let i = 0; i < N; i++) {
    const c = await br.newContext({ viewport: { width: 1280, height: 860 } });
    const p = await c.newPage();
    ctxs.push(c); pages.push(p);
  }
  await Promise.all(pages.map((p) => login(p)));
  console.log("全員ログイン完了。いっせいに送信します。\n");

  /* HEAVY=1 で重い依頼（長文生成）にする */
  const heavy = process.env.HEAVY === "1";
  const qs = heavy ? [
    "鎌倉幕府の成立から滅亡までを、政治・経済・軍事・文化の4つの観点で、それぞれ具体例を挙げながら詳しく説明してください。表も使ってください。",
    "光合成の明反応と暗反応を、関わる物質と場所を対応づけた表つきで、高校生向けに詳しく説明してください。",
    "日本の戦後経済史を1945年から2000年まで、10年ごとに区切って主要な出来事と背景を詳しく説明してください。",
    "微分と積分の関係を、定義から丁寧に、具体例と図解の説明を交えて詳しく解説してください。",
    "明治維新の要因を、国内要因と国外要因に分けて、それぞれ複数の観点から詳しく分析してください。"
  ] : [
    "日本の首都はどこ？一文で。",
    "光合成を一文で説明して。",
    "円周率の最初の5桁は？",
    "織田信長を一文で。",
    "水の沸点は？"
  ];
  const log = [];
  const t0 = Date.now();
  const res = await Promise.all(pages.map((p, i) => ask(p, qs[i % qs.length], "利用者" + (i + 1), t0, log)));

  console.log("── 途中の様子 ──");
  if (log.length) log.forEach(l => console.log("  " + l)); else console.log("  （順番待ちの表示は出ず＝全員すぐ開始）");

  console.log("\n── 結果 ──");
  res.forEach(r => console.log("  " + r.who + ": " + (r.ok ? "成功" : "★失敗")
    + " 完了 " + Math.round(r.ms / 1000) + "秒"
    + (r.firstToken ? " / 最初の文字 " + Math.round(r.firstToken / 1000) + "秒" : "")
    + " / " + r.chars + "字"
    + (r.err ? " / ★エラー: " + r.err.slice(0, 60) : "")));

  const okN = res.filter(r => r.ok && !r.err).length;
  console.log("\n全員が弾かれずに完了: " + okN + " / " + N);
  console.log("全体の所要: " + Math.round((Date.now() - t0) / 1000) + "秒");

  await br.close();
})().catch(e => { console.error(e); process.exit(1); });
