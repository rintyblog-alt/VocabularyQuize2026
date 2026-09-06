/* 大きな資料を添付して送っても、接続が切れずに回答が返るかを実測する。
   実行: node vqchatbig.cjs */
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const TMP = require("path").join(__dirname, "_fixtures", "vqbig");
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

function makeBig(p, mb, secretLine) {
  const out = [];
  let n = 0;
  const line = "第X条 交易・徴税・関税・港湾の運用について定める。塩と穀物の扱いは従前どおりとする。\n";
  const need = mb * 1024 * 1024;
  while (n < need) { out.push(line); n += Buffer.byteLength(line); }
  out.push(secretLine + "\n");
  fs.writeFileSync(p, out.join(""));
  return Math.round(fs.statSync(p).size / 1024 / 1024 * 10) / 10;
}

(async () => {
  fs.mkdirSync(TMP, { recursive: true });
  const secret = "ザルカンド条約";
  const a = path.join(TMP, "big-a.txt"), b2 = path.join(TMP, "big-b.txt");
  const sa = makeBig(a, 12, "839年の " + secret + " により、リューン港の関税は免除される。");
  const sb = makeBig(b2, 6, "補足資料。特記事項なし。");
  console.log("資料: " + sa + "MB + " + sb + "MB（合計 " + Math.round((sa + sb) * 10) / 10 + "MB）");

  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();
  await login(pg);

  const [ch] = await Promise.all([
    pg.waitForEvent("filechooser"),
    pg.evaluate(() => document.getElementById("vqChat").shadowRoot.querySelector('[data-a="attach"]').click())
  ]);
  await ch.setFiles([a, b2]);
  await pg.waitForFunction(() => {
    const l = window.__vqChatFiles.list();
    return l.length >= 2 && l.every((f) => ["ready", "warning", "failed"].indexOf(f.status) >= 0);
  }, null, { timeout: 300000 });

  const st0 = await pg.evaluate(() => window.__vqChatFiles.list().map(f => ({
    name: f.name, status: f.status, chars: (f.text || "").length, warn: (f.warnings || []).join("/")
  })));
  console.log("\n取り込み結果:");
  st0.forEach(f => console.log("  " + f.name + " [" + f.status + "] 抽出 " + f.chars.toLocaleString() + "字" + (f.warn ? " / 警告: " + f.warn : "")));

  await pg.evaluate(() => {
    const r = document.getElementById("vqChat").shadowRoot;
    const ta = r.querySelector(".ta");
    ta.value = "この資料で、リューン港の関税が免除される根拠の条約名を答えて。";
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const t0 = Date.now();
  await pg.evaluate(() => document.getElementById("vqChat").shadowRoot.querySelector(".send").click());

  let done = false;
  try {
    await pg.waitForFunction(() => {
      const r = document.getElementById("vqChat").shadowRoot;
      const n = r.querySelectorAll(".msg.ai");
      if (!n.length) return false;
      return !r.querySelector(".send").classList.contains("stop")
        && (n[n.length - 1].textContent || "").trim().length > 5;
    }, null, { timeout: 300000 });
    done = true;
  } catch (e) { done = false; }

  const o = await pg.evaluate(() => {
    const r = document.getElementById("vqChat").shadowRoot;
    const ai = r.querySelectorAll(".msg.ai");
    const errEl = r.querySelector(".err");
    const trim = window.__vqChatFiles.events().filter(e => e.type === "context.trim");
    return {
      err: errEl ? (errEl.textContent || "").trim() : "",
      ai: ((ai[ai.length - 1] || {}).textContent || "").trim(),
      trim: trim.map(e => e.label + "｜" + (e.detail || ""))
    };
  });

  console.log("\n送信結果: " + (done ? "回答が返った" : "★返らなかった") + "（" + Math.round((Date.now() - t0) / 1000) + "秒）");
  console.log("エラー表示: " + (o.err ? "★" + o.err.slice(0, 120) : "なし"));
  if (o.trim.length) console.log("絞り込みの通知: " + o.trim.join(" / "));
  console.log("返答: " + o.ai.slice(0, 200));
  console.log("資料にしか無い語（" + secret + "）: " + (o.ai.indexOf(secret) >= 0 ? "答えられた" : "答えられず"));

  await br.close();
  fs.rmSync(TMP, { recursive: true, force: true });
})().catch(e => { console.error(e); process.exit(1); });
