/* ══════════════════════════════════════════════════════════════════════
   出題形式を決める画面（V3 §14 / §26 / §27 / §28）

   ・頼む前に「何を作るつもりか」が見える
   ・「4 択を使わない」が実際に効く
   ・使えない形式には理由と代わりが出る（黙って 4 択へ置き換えない）
   ・決めたことが開き直しても残る
   ══════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
let pass = 0, fail = 0;
const errs = [];
const ok = (n, c, x) => { c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  NG   " + n + (x ? "  → " + x : ""))); };
const HIDE = "#vqNewAuth{display:none !important}";

async function login(pg, url) {
  await pg.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await pg.addStyleTag({ content: HIDE });
  await pg.waitForFunction(() => document.getElementById("authLoginSubmitBtn"), { timeout: 20000 });
  await pg.evaluate(() => {
    const setV = (el, v) => {
      const p = el.tagName === "SELECT" ? HTMLSelectElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(p.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    setV(document.getElementById("authLoginGrade"), "H3");
    setV(document.getElementById("authLoginNickname"), "tester");
    setV(document.getElementById("authLoginPassword"), "Abcd1234");
    document.getElementById("authLoginSubmitBtn").click();
  });
  await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 30000 });
  await pg.addStyleTag({ content: HIDE });
  await pg.waitForTimeout(1800);
  for (let i = 0; i < 3; i++) {
    const c = await pg.evaluate(() => {
      const bd = document.querySelector(".ui-modal-backdrop");
      if (!bd || getComputedStyle(bd).display === "none") return false;
      const b2 = document.getElementById("uiModalOk") || document.getElementById("uiModalCancel");
      if (b2) { b2.click(); return true; } return false;
    });
    if (!c) break;
    await pg.waitForTimeout(300);
  }
}
async function inShadow(pg, hostId, body, arg) {
  return pg.evaluate(({ id, src, a }) => {
    const host = document.getElementById(id);
    if (!host || !host.shadowRoot) return { __no: true };
    const root = host.shadowRoot.querySelector(".vq2-root");
    return new Function("root", "args", src)(root, a);
  }, { id: hostId, src: body, a: arg === undefined ? null : arg });
}
async function waitHost(pg, id) {
  await pg.waitForFunction((i) => {
    const h = document.getElementById(i);
    return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vq2-root"));
  }, id, { timeout: 20000 });
}
async function openStudio(pg) {
  await pg.evaluate(() => {
    document.querySelectorAll(".vq2-host").forEach((h) => h.remove());
    document.body.style.overflow = "";
    window.VQ2.open.presetStudio({});
  });
  await waitHost(pg, "vq2-preset-studio");
  await pg.waitForTimeout(300);
}
/* 形式シートを開く */
async function openMix(pg) {
  await inShadow(pg, "vq2-preset-studio", `
    const b = root.querySelector('[data-act="open-mix"]');
    if (!b) return false;
    b.click(); return true;`);
  await waitHost(pg, "vq2-preset-mix");
  await pg.waitForTimeout(300);
}
/* いま出ている「作る予定」を読む */
async function plan(pg) {
  return inShadow(pg, "vq2-preset-mix", `
    const rows = [...root.querySelectorAll(".vq2-mix-row")].map(r => ({
      n: Number(r.querySelector(".vq2-mix-n").textContent.trim()),
      name: r.querySelector("b").textContent.trim(),
      why: (r.querySelector(".vq2-mix-why") || {}).textContent || ""
    }));
    return {
      rows: rows,
      total: rows.reduce((a, r) => a + r.n, 0),
      ng: [...root.querySelectorAll(".vq2-mix-ng > div")].map(d => d.textContent.trim()),
      notes: [...root.querySelectorAll(".vq2-mix-notes li")].map(li => li.textContent.trim()),
      hint: (root.querySelector(".vq2-card .vq2-hint") || {}).textContent || ""
    };`);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const pg = await ctx.newPage();
  pg.on("pageerror", (e) => errs.push(String(e).slice(0, 180)));
  await login(pg, "http://127.0.0.1:8791/?vqdev=1");
  await openStudio(pg);

  console.log("\n── 開く ──");
  await openMix(pg);
  const p0 = await plan(pg);
  ok("作る予定が出る", p0.rows.length > 0, JSON.stringify(p0.rows.slice(0, 3)));
  ok("4 択だけにならない", p0.rows.length >= 4, p0.rows.map((r) => r.name).join("・"));
  ok("なぜその形式かが出る", p0.rows.some((r) => r.why.length > 0),
     JSON.stringify(p0.rows.slice(0, 2)));
  ok("合計が出る", p0.total > 0, String(p0.total));

  console.log("\n── 使わないもの ──");
  await inShadow(pg, "vq2-preset-mix", `
    const c = root.querySelector('[data-mix-flag="noFourChoice"]');
    c.checked = true; c.dispatchEvent(new Event("change", { bubbles: true }));
    return true;`);
  await pg.waitForTimeout(400);
  const p1 = await plan(pg);
  ok("「選択式を使わない」が効く",
     !p1.rows.some((r) => /^4択$|^2択$|^3択$|^○×$/.test(r.name)),
     p1.rows.map((r) => r.name).join("・"));
  ok("外しても問題数は変わらない", p1.total === p0.total, p1.total + "/" + p0.total);
  ok("外しても形式は足りている", p1.rows.length >= 4, p1.rows.map((r) => r.name).join("・"));

  /* 戻す */
  await inShadow(pg, "vq2-preset-mix", `
    const c = root.querySelector('[data-mix-flag="noFourChoice"]');
    c.checked = false; c.dispatchEvent(new Event("change", { bubbles: true }));
    return true;`);
  await pg.waitForTimeout(400);

  console.log("\n── 使えない形式（黙って 4 択にしない）──");
  const openedCat = await inShadow(pg, "vq2-preset-mix", `
    const b = [...root.querySelectorAll("[data-mix-cat]")]
      .filter(x => /画像|図表/.test(x.textContent))[0];
    if (!b) return false;
    b.click(); return true;`);
  await pg.waitForTimeout(400);
  const ng = await inShadow(pg, "vq2-preset-mix", `
    return [...root.querySelectorAll(".vq2-mix-t.is-ng")].map(d => d.textContent.trim()).slice(0, 6);`);
  ok("画像・図表の分類を開ける", openedCat === true);
  ok("使えない形式に理由が出る", ng.length > 0 && ng.some((t) => /画像|音声|表|図|資料/.test(t)),
     JSON.stringify(ng.slice(0, 3)));

  console.log("\n── 形式を選ぶ ──");
  const picked = await inShadow(pg, "vq2-preset-mix", `
    const b = [...root.querySelectorAll("[data-mix-cat]")].filter(x => /並べ替え/.test(x.textContent))[0];
    if (b) b.click();
    return true;`);
  await pg.waitForTimeout(350);
  const chose = await inShadow(pg, "vq2-preset-mix", `
    const t = root.querySelector("[data-mix-toggle]");
    if (!t) return null;
    const id = t.getAttribute("data-mix-toggle");
    t.click();
    return id;`);
  await pg.waitForTimeout(400);
  const p2 = await plan(pg);
  ok("選んだ形式が予定に入る", !!chose && p2.rows.length >= 1, String(chose));
  ok("選んでも合計は変わらない", p2.total === p0.total, p2.total + "/" + p0.total);

  console.log("\n── 決めたことが残る ──");
  await inShadow(pg, "vq2-preset-mix", `root.querySelector('[data-act="ok"]').click(); return true;`);
  await pg.waitForTimeout(600);
  const label = await inShadow(pg, "vq2-preset-studio", `
    const b = root.querySelector('[data-act="open-mix"]');
    return b ? b.textContent.trim() : "";`);
  ok("決めた内容がボタンに出る", /形式/.test(label), label);

  ok("画面のエラーが出ていない", errs.length === 0, errs.slice(0, 2).join(" / "));

  await browser.close();
  console.log("\n合格 " + pass + " / 不合格 " + fail);
  process.exit(fail ? 1 : 0);
})();
