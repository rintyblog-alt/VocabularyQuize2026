/* Quick Mock の画面まわりを、PC と狭い画面の両方で確かめる。
   AI は呼ばない（見た目と操作だけ）。

   見るのは 4 つ。
     ・段階が 7 つ出ているか（条件・教材・構成案・問題・紙面・検証・完成）
     ・PC が 2 カラムで始まるか（細い 3 本の柱で始まっていないか）
     ・狭い画面の下が「戻る／いまの段階／次へ」になっているか
     ・横スクロールが出ていないか

   実行: node vqmockui.cjs
*/
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const URL = "http://127.0.0.1:8791/?vqdev=1";
const HIDE = `#vqbFlow,#mob-tut-overlay,#mobBarTutorial,#firstLaunchOverlay,#vqOnboardingOverlay{display:none !important;}`;
const OUT = path.join(__dirname, "shots", "quickmock");

let pass = 0, fail = 0;
const log = [];
function ok(name, cond, extra) {
  if (cond) { pass++; log.push("  ✓ " + name + (extra ? " — " + extra : "")); }
  else { fail++; log.push("  ✗ " + name + (extra ? "\n      → " + extra : "")); }
}

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
    setV(document.getElementById("authLoginNickname"), "qmui");
    setV(document.getElementById("authLoginPassword"), "Abcd1234");
    document.getElementById("authLoginSubmitBtn").click();
  });
  await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 30000 });
  await pg.waitForTimeout(1500);
}

async function openQM(pg) {
  await pg.evaluate(() => { window.__qm = VQ2.quickMock.open({}); });
  await pg.waitForTimeout(900);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  /* ── PC ─────────────────────────────────────────────── */
  {
    const pg = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
    await login(pg);
    await openQM(pg);
    const m = await pg.evaluate(() => {
      const r = window.__qm.root;
      const steps = [...r.querySelectorAll(".vq2-steps-i")].map((x) => x.textContent.replace(/\s+/g, " ").trim());
      const cols = ["#wsLeft", "#wsMain", "#wsSide"].map((s) => {
        const el = r.querySelector(s);
        return el ? Math.round(el.getBoundingClientRect().width) : 0;
      });
      return {
        steps, cols,
        sideToggle: !!r.querySelector('[data-act="qm-side"]'),
        docOverflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
      };
    });
    console.log("\n══ Quick Mock（PC 1440px）══");
    console.log(`  段階: ${m.steps.join(" → ")}`);
    console.log(`  柱の幅: 左 ${m.cols[0]} / 中央 ${m.cols[1]} / 右 ${m.cols[2]}`);
    ok("段階が 7 つ出る", m.steps.length === 7, String(m.steps.length));
    ok("段階に「教材」「検証」「完成」が入っている",
       ["教材", "検証", "完成"].every((w) => m.steps.some((x) => x.indexOf(w) === 0)),
       m.steps.join("/"));
    ok("はじめは 2 カラム（AI のわきは閉じている）", m.cols[2] === 0, `右 ${m.cols[2]}px`);
    ok("AI のわきを開け閉めできる口がある", m.sideToggle);
    ok("横スクロールが出ない", m.docOverflow === 0, `${m.docOverflow}px`);

    /* 開いたら 3 カラムになる */
    const opened = await pg.evaluate(async () => {
      window.__qm.root.querySelector('[data-act="qm-side"]').click();
      await new Promise((r) => setTimeout(r, 400));
      const el = window.__qm.root.querySelector("#wsSide");
      return el ? Math.round(el.getBoundingClientRect().width) : 0;
    });
    ok("押すと AI のわきが開く", opened > 200, `${opened}px`);
    await pg.screenshot({ path: path.join(OUT, "pc.png") });
    await pg.evaluate(() => { window.__qm.root.querySelector('[data-act="qm-side"]').click(); });
    await pg.waitForTimeout(300);
    await pg.screenshot({ path: path.join(OUT, "pc-2col.png") });
  }

  /* ── 狭い画面 ───────────────────────────────────────── */
  for (const w of [390, 320]) {
    const pg = await (await browser.newContext({ viewport: { width: w, height: 844 }, deviceScaleFactor: 2 })).newPage();
    await login(pg);
    await openQM(pg);
    const m = await pg.evaluate(() => {
      const r = window.__qm.root;
      const foot = r.querySelector(".vq2-qmfoot");
      const fr = foot ? foot.getBoundingClientRect() : null;
      const small = [];
      if (foot) foot.querySelectorAll("button").forEach((b) => {
        const bb = b.getBoundingClientRect();
        if (bb.width > 0 && (bb.height < 44 || bb.width < 44))
          small.push((b.getAttribute("data-act") || "?") + ":" + Math.round(bb.width) + "x" + Math.round(bb.height));
      });
      return {
        hasFoot: !!foot,
        label: foot ? foot.textContent.replace(/\s+/g, " ").trim().slice(0, 40) : "",
        prev: !!r.querySelector('[data-act="qm-step-prev"]'),
        next: !!r.querySelector('[data-act="qm-step-next"]'),
        footBottom: fr ? Math.round(window.innerHeight - fr.bottom) : null,
        small,
        docOverflow: Math.max(0, document.documentElement.scrollWidth - window.innerWidth)
      };
    });
    console.log(`\n══ Quick Mock（${w}px）══`);
    console.log(`  下の帯: ${m.label}`);
    ok(`${w}px：下に固定の帯がある`, m.hasFoot);
    ok(`${w}px：戻る／次へがある`, m.prev && m.next);
    ok(`${w}px：帯が画面の下端にある`, m.footBottom !== null && m.footBottom <= 2, `下から ${m.footBottom}px`);
    ok(`${w}px：押せる場所が 44px 以上`, m.small.length === 0, m.small.join(", "));
    ok(`${w}px：横スクロールが出ない`, m.docOverflow === 0, `${m.docOverflow}px`);

    /* 「次へ」で段階が進むか */
    const moved = await pg.evaluate(async () => {
      const r = window.__qm.root;
      const now = () => r.querySelector(".vq2-qmfoot-t").textContent.trim();
      const before = now();
      r.querySelector('[data-act="qm-step-next"]').click();
      await new Promise((x) => setTimeout(x, 400));
      return { before, after: now() };
    });
    ok(`${w}px：「次へ」で段階が進む`, moved.before !== moved.after, `${moved.before} → ${moved.after}`);

    /* AI アシスタントは、下の帯から引き出せること（上のタブを消したので、
       ここから開けないと二度と開けなくなる）。 */
    const sheet = await pg.evaluate(async () => {
      const r = window.__qm.root;
      const before = !!r.querySelector("#wsSide.is-open");
      const b = r.querySelector('[data-act="qm-pane"][data-id="side"]');
      if (b) b.click();
      await new Promise((x) => setTimeout(x, 400));
      const el = r.querySelector("#wsSide");
      return { before, open: !!(el && el.classList.contains("is-open")), has: !!b };
    });
    ok(`${w}px：AI アシスタントを下の帯から開ける`, sheet.has && sheet.open,
       JSON.stringify(sheet));
    await pg.screenshot({ path: path.join(OUT, `sp${w}.png`) });
  }

  console.log("");
  log.forEach((l) => console.log(l));
  console.log(`\n══ まとめ ══\n  合格 ${pass} / 不合格 ${fail}\n画像: ${OUT}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
