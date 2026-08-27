/* 画面から実際に資料なしで作らせる（本物の Bridge を使う）。本文は出さない。 */
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({ headless: true });
  const pg = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e).slice(0, 180)));
  await pg.goto("http://127.0.0.1:8791/?vqdev=1&vq2=all&cb=" + Date.now(), { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(2500);
  await pg.evaluate(() => window.VQ2.quickMock.open({}));
  await pg.waitForTimeout(1200);

  const t0 = Date.now();
  const res = await pg.evaluate(async () => {
    const root = document.getElementById("vq2-quick-mock").shadowRoot;
    const ta = root.querySelector("textarea");
    const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
    set.call(ta, "中学理科・光と音の要点から 6 問つくって。4択中心で。");
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    /* 大問 1・6 問にそろえる */
    const setNum = (label, v) => {
      const inputs = [...root.querySelectorAll("input")];
      for (const i of inputs) {
        const w = i.closest(".vq2-field, label, div");
        if (w && (w.innerText || "").indexOf(label) >= 0) {
          const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
          s.call(i, String(v)); i.dispatchEvent(new Event("input", { bubbles: true }));
          i.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }
      }
      return false;
    };
    setNum("大問数", 1); setNum("設問数", 6);
    await new Promise((r) => setTimeout(r, 400));
    root.querySelector('[data-act="generate-direct"]').click();
    /* できあがるまで待つ（最長 8 分） */
    for (let i = 0; i < 480; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const QM = window.VQ2.quickMock;
      const s = window.__vqQmState;
      const txt = (root.querySelector(".vq2-root") || root).innerText || "";
      if (/紙面を作る|保存/.test(txt) && !/作っています/.test(txt)) break;
    }
    const txt = (root.querySelector(".vq2-root") || root).innerText || "";
    return { text: txt.slice(0, 2500) };
  });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  /* 保存されたものではなく、画面に出ている件数だけを見る */
  const info = await pg.evaluate(() => {
    const root = document.getElementById("vq2-quick-mock").shadowRoot;
    const t = (root.querySelector(".vq2-root") || root).innerText || "";
    const m = t.match(/全部で\s*(\d+)\s*問/);
    return {
      made: m ? Number(m[1]) : null,
      hasError: /うまくいきませんでした|作れませんでした/.test(t),
      hasSourceComplaint: /資料から出題できません|使用する資料がありません/.test(t),
      shortfall: /足りません/.test(t)
    };
  });
  console.log("時間: " + secs + " 秒");
  console.log(JSON.stringify(info, null, 1));
  console.log("JS エラー: " + (errs.length ? errs.join(" / ") : "なし"));
  await pg.screenshot({ path: "shots/promptui/03-e2e.png", fullPage: false });
  await b.close();
})();
