/* 添付の中身が「自分の吹き出し」に出ていないか、
   そのうえで AI がちゃんと中身を読めているかを同時に確かめる。
   実行: node vqchatctx.cjs */
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const TMP = "/private/tmp/claude-501/-Users-user-Downloads-word-practice-v26-menu-terms-report-emailjs/ea86a79f-1ff2-4347-9303-995fcdd2a12d/scratchpad/vqctx";
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
  fs.mkdirSync(TMP, { recursive: true });
  /* 資料にしか無い言葉を仕込む。AI がこれを言えたら中身は届いている。 */
  const secret = "ザルカンド条約";
  const lines = ["ヴェルナ王国 内部資料"];
  for (let i = 0; i < 400; i++) lines.push("第" + (i + 1) + "条 交易と徴税に関する取り決めを定める。塩と穀物の関税は据え置く。");
  lines.push("なお、839年に結ばれた " + secret + " により、リューン港の関税は免除される。");
  const p = path.join(TMP, "verna-naibu.txt");
  fs.writeFileSync(p, lines.join("\n"), "utf8");
  console.log("資料: " + Math.round(fs.statSync(p).size / 1024) + "KB / " + lines.length + "行");

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();
  await login(pg);

  const [ch] = await Promise.all([
    pg.waitForEvent("filechooser"),
    pg.evaluate(() => document.getElementById("vqChat").shadowRoot.querySelector('[data-a="attach"]').click())
  ]);
  await ch.setFiles([p]);
  await pg.waitForFunction(() => {
    const l = window.__vqChatFiles.list();
    return l.length > 0 && l.every((f) => ["ready", "warning", "failed"].indexOf(f.status) >= 0);
  }, null, { timeout: 120000 });

  const q = "この資料で、リューン港の関税が免除される根拠は何ですか。条約名を答えて。";
  await pg.evaluate((t) => {
    const r = document.getElementById("vqChat").shadowRoot;
    const ta = r.querySelector(".ta");
    ta.value = t; ta.dispatchEvent(new Event("input", { bubbles: true }));
  }, q);
  await pg.evaluate(() => document.getElementById("vqChat").shadowRoot.querySelector(".send").click());

  await pg.waitForFunction(() => {
    const r = document.getElementById("vqChat").shadowRoot;
    const n = r.querySelectorAll(".msg.ai");
    if (!n.length) return false;
    return !r.querySelector(".send").classList.contains("stop")
      && (n[n.length - 1].textContent || "").trim().length > 10;
  }, null, { timeout: 240000 });
  await pg.waitForTimeout(800);

  const o = await pg.evaluate(() => {
    const r = document.getElementById("vqChat").shadowRoot;
    const users = Array.from(r.querySelectorAll(".msg.user"));
    const last = users[users.length - 1];
    const ai = r.querySelectorAll(".msg.ai");
    return {
      userBubble: (last.querySelector(".b") || {}).textContent || "",
      chips: Array.from(last.querySelectorAll(".mfile__n")).map(e => e.textContent),
      aiText: ((ai[ai.length - 1] || {}).textContent || "").trim()
    };
  });

  console.log("\n── 自分の吹き出し ──");
  console.log("  文字数: " + o.userBubble.length + "字");
  console.log("  中身: " + JSON.stringify(o.userBubble.slice(0, 160)));
  console.log("  添付の札: " + (o.chips.length ? o.chips.join(" / ") : "なし"));
  const leaked = /添付資料|第1条|第100条|交易と徴税/.test(o.userBubble);
  console.log("  資料の中身が混ざっている: " + (leaked ? "★はい（直っていない）" : "いいえ"));

  console.log("\n── AI の返答 ──");
  console.log("  " + o.aiText.slice(0, 220));
  console.log("  資料にしか無い語（" + secret + "）を言えた: " + (o.aiText.indexOf(secret) >= 0 ? "はい（中身は届いている）" : "★いいえ"));

  await b.close();
  fs.rmSync(TMP, { recursive: true, force: true });
})().catch(e => { console.error(e); process.exit(1); });
