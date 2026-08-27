/* Quick Chat の見え方を実測する。
   直す前と後の差を数字で残すための計測用（合否ではなく寸法を出す）。
   実行: node vqchatprobe.cjs */
const { chromium } = require("playwright");
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

/* Shadow DOM の中を測る */
const probeDD = (which) => {
  const root = document.getElementById("vqChat").shadowRoot;
  const btn = root.querySelector('[data-a="' + which + 'Menu"]');
  btn.click();
  const dd = root.querySelector('[data-dd="' + which + '"]');
  const r = dd.getBoundingClientRect();
  const br = btn.getBoundingClientRect();
  const comp = root.querySelector(".composer").getBoundingClientRect();
  const items = dd.querySelectorAll("button").length;
  /* 実際にその座標で押せるか（別要素が最前面なら押せない） */
  const cx = Math.round(r.left + r.width / 2);
  const cy = Math.round(r.top + Math.min(r.height - 8, 24));
  let hitOk = false;
  if (r.width && cy > 0 && cy < innerHeight) {
    const top = root.elementFromPoint ? root.elementFromPoint(cx, cy) : null;
    hitOk = !!(top && dd.contains(top));
  }
  return {
    viewportH: innerHeight,
    ddTop: Math.round(r.top), ddBottom: Math.round(r.bottom), ddH: Math.round(r.height),
    btnTop: Math.round(br.top),
    composerBottom: Math.round(comp.bottom),
    items,
    offBottom: Math.round(Math.max(0, r.bottom - innerHeight)),
    offTop: Math.round(Math.max(0, 0 - r.top)),
    overlapsComposer: r.top < comp.bottom && r.bottom > comp.bottom,
    clickable: hitOk
  };
};

/* 会話が始まった状態にする（入力欄が下へ移る）。実DOMへ足して鏡写しに拾わせる。 */
const seed = (n) => {
  const list = document.getElementById("appChatList");
  for (let i = 0; i < n; i++) {
    for (const role of ["is-user", "is-ai"]) {
      const d = document.createElement("div");
      d.className = "app-chat-msg " + role;
      d.setAttribute("data-chat-msg-id", "probe-" + i + "-" + role);
      d.innerHTML = '<div class="app-chat-bubble">計測用のメッセージ ' + (i + 1) +
        "。これは実際の会話ではなく、入力欄を下へ移すためのダミーです。</div>";
      list.appendChild(d);
    }
  }
};

(async () => {
  const b = await chromium.launch({ headless: true });
  const out = {};
  for (const [name, vp] of [["PC", { width: 1440, height: 900 }], ["モバイル", { width: 390, height: 844 }]]) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 2 });
    const pg = await ctx.newPage();
    await login(pg);
    await pg.evaluate(seed, 12);
    await pg.waitForTimeout(1200);
    out[name] = {};
    for (const w of ["think", "model"]) out[name][w] = await pg.evaluate(probeDD, w);
    await ctx.close();
  }
  console.log("══ 思考レベル/モデルの選択パネル 実測 ══\n");
  for (const k of Object.keys(out)) {
    for (const w of ["think", "model"]) {
      const d = out[k][w];
      console.log(`[${k} / ${w === "think" ? "思考レベル" : "モデル"}]`);
      console.log(`  画面高 ${d.viewportH} / パネル top ${d.ddTop} bottom ${d.ddBottom}（高さ ${d.ddH}・${d.items}項目）`);
      console.log(`  画面下からのはみ出し: ${d.offBottom}px / 画面上: ${d.offTop}px`);
      /* 正しく開けば パネル下端 = ボタン上端 - 6px になる */
      const want = d.btnTop - 6, gap = d.ddBottom - want;
      console.log(`  ボタン上端 ${d.btnTop} → パネル下端は ${want} が正しい。実際 ${d.ddBottom}（ずれ ${gap >= 0 ? "+" : ""}${gap}px）`);
      console.log(`  入力欄と重なる: ${d.overlapsComposer ? "はい" : "いいえ"} / 実際に押せる: ${d.clickable ? "はい" : "いいえ"}`);
      console.log("");
    }
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
