/* VocabuSpeak の「話す練習」の見え方を撮る。
   大きなマイク・録音中の帯・やめる が、狭い画面でも収まっているかを見る。
   実行: node vqspeakshot.cjs */
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const URL = "http://127.0.0.1:8791/?vqdev=1";
const HIDE = `#vqbFlow,#mob-tut-overlay,#mobBarTutorial,#firstLaunchOverlay,#vqOnboardingOverlay{display:none !important;}`;
const OUT = path.join(__dirname, "shots", "speak");

async function login(pg) {
  await pg.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.addStyleTag({ content: HIDE });
  await pg.waitForFunction(() => document.getElementById("authLoginSubmitBtn"), { timeout: 20000 });
  await pg.evaluate(() => {
    const setV = (el, v) => {
      const p = el.tagName === "SELECT" ? HTMLSelectElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(p.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    setV(document.getElementById("authLoginGrade"), "H3");
    setV(document.getElementById("authLoginNickname"), "spshot");
    setV(document.getElementById("authLoginPassword"), "Abcd1234");
    document.getElementById("authLoginSubmitBtn").click();
  });
  await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 30000 });
  await pg.waitForTimeout(1600);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
  for (const s of [{ n: "pc", w: 1440, h: 900 }, { n: "sp390", w: 390, h: 844 }]) {
    const ctx = await b.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 2,
      permissions: ["microphone"] });
    const pg = await ctx.newPage();
    await login(pg);
    const r = await pg.evaluate(async () => {
      const app = VQ2.speak.open({});
      window.__sp = app;
      for (let i = 0; i < 80 && !app.root.querySelector('[data-sp-tab]'); i++)
        await new Promise((x) => setTimeout(x, 100));
      /* 話す練習を始める */
      for (let i = 0; i < 60 && !app.root.querySelector('[data-act="sp-train"]'); i++)
        await new Promise((x) => setTimeout(x, 100));
      const t = [...app.root.querySelectorAll('[data-act="sp-train"]')]
        .filter((x) => x.getAttribute("data-id") === "speaking")[0];
      const started = !!t;
      if (t) t.click();
      for (let i = 0; i < 120 && !app.root.querySelector(".vq2-sp-say"); i++)
        await new Promise((x) => setTimeout(x, 100));
      const mic = app.root.querySelector(".vq2-sp-mic");
      const mr = mic ? mic.getBoundingClientRect() : null;
      return {
        started, hasSay: !!app.root.querySelector(".vq2-sp-say"),
        mic: mr ? Math.round(mr.width) + "x" + Math.round(mr.height) : null,
        prefsBtn: !!app.root.querySelector('[data-act="sp-prefs"]'),
        overflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
      };
    });
    console.log(`  ${s.n}: 開始 ${r.started} / 英文 ${r.hasSay} / マイク ${r.mic} / 設定ボタン ${r.prefsBtn} / 横はみ出し ${r.overflow}px`);
    await pg.screenshot({ path: path.join(OUT, `speak-${s.n}.png`) });
    await ctx.close();
  }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
