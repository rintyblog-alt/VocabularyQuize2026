/* ══════════════════════════════════════════════════════════════════════════
   vqselect.cjs — 開く一覧が **アプリ自身のもの**に なっているか 数える

   訴え（2026-08-30・Rinty さん）
     「アプリの ドロップダウン、独自のものとして 用意しない？
       今は 全て システムのものに なってるから」

   直す前（実測）: 51 個中 **8 個**だけ。残り 43 個は システムの 一覧。
     ① 影の DOM が 見えていなかった（いまの 画面は ほぼ 全部 影）
     ② 起動時に 隠れていた ものを 永久に 飛ばしていた

   見るのは:
     ① 画面じゅうの select が **1 つ残らず** 独自に なっている
     ② 影の DOM の 中でも 開く（メニューが その 影の 中に 出る）
     ③ 選ぶと value が 変わり change が 飛ぶ（既存の 作りが そのまま 動く）
     ④ キーボードで 開いて 選べる
     ⑤ 狭い 画面では 下から 出る 板に なる
     ⑥ システムの 一覧を 出さない（pointerdown を 止めている）

   使い方: VQ_BASE=http://127.0.0.1:8791 node vqselect.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const { chromium } = require("playwright");

let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 220) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 400) : "")); }
};
const 待 = (ms) => new Promise((s) => setTimeout(s, ms));

(async () => {
  console.log("測る先:", BASE);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 900 } });
  const page = await ctx.newPage();
  const 例外 = [];
  page.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 200)));
  await page.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__vqcsCount, null, { timeout: 60000 });
  await 待(6000);

  節("① 画面じゅうの select");
  const 数 = await page.evaluate(() => window.__vqcsCount());
  見(数.全 > 20, "select が 見つかる", 数);
  見(数.独自 === 数.全, "★ 1 つ残らず 独自に なっている", 数);

  節("② 影の DOM の 中でも 開く");
  await page.waitForFunction(() => !!window.__vqMake, null, { timeout: 30000 });
  await page.evaluate(() => {
    window.__vqMake.open({ kind: "exam" });
    window.__vqMake.表紙を入れる({ examName: "確かめ", subject: "生物基礎" });
    window.__vqMake.条件を入れる({});
  });
  /* 条件の 段へ（ここに 紙面の 型・解答用紙の 型の 2 つが ある）。 */
  await page.evaluate(() => {
    const r = document.getElementById("vqMake").shadowRoot;
    const b = r.querySelector('[data-a="go"]');
    if (b) b.click();
  });
  await 待(800);
  const 影 = await page.evaluate(() => {
    const r = document.getElementById("vqMake").shadowRoot;
    const s = Array.from(r.querySelectorAll("select"));
    return { 数: s.length, 独自: s.filter((x) => x.__vqcs).length,
             id: s.map((x) => x.id) };
  });
  見(影.数 >= 2, "影の 中に select が ある", 影);
  見(影.独自 === 影.数, "★ 影の 中の select も 独自に なっている", 影);

  const 開い = await page.evaluate(async () => {
    const r = document.getElementById("vqMake").shadowRoot;
    const s = r.querySelector("select");
    s.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true, button: 0, cancelable: true }));
    await new Promise((z) => setTimeout(z, 200));
    const m = r.querySelector(".vqcs-menu");
    return { 影の中に出た: !!m, 項目: m ? m.querySelectorAll(".vqcs-opt").length : 0,
             ネイティブの数: s.options.length,
             layer: !!r.getElementById("vqcs-layer"),
             style: !!r.getElementById("vqcs-style"),
             文書側に出た: !!document.querySelector(".vqcs-menu") };
  });
  見(開い.影の中に出た, "★ メニューが **その 影の 中**に 出る", 開い);
  見(!開い.文書側に出た, "文書側には 出ない（影の 上に 隠れないため）");
  見(開い.項目 === 開い.ネイティブの数, "項目の 数が ネイティブと 合う", 開い);
  見(開い.style && 開い.layer, "影ごとに 見た目と 置き場を 入れている");

  節("③ 選ぶと 中身が 変わる");
  const 選 = await page.evaluate(async () => {
    const r = document.getElementById("vqMake").shadowRoot;
    const s = r.querySelector("select");
    const 前 = s.value;
    let ch = 0, inp = 0;
    s.addEventListener("change", () => ch++);
    s.addEventListener("input", () => inp++);
    const opts = r.querySelectorAll(".vqcs-opt");
    const 狙 = opts[Math.min(1, opts.length - 1)];
    狙.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await new Promise((z) => setTimeout(z, 200));
    return { 前, 後: s.value, change: ch, input: inp,
             閉じた: !r.querySelector(".vqcs-menu") };
  });
  見(選.後 !== 選.前, "value が 変わった", 選);
  見(選.change === 1 && 選.input === 1, "change と input が 1 回ずつ 飛ぶ", 選);
  見(選.閉じた, "選んだら 閉じる");

  節("④ キーボード");
  const 鍵 = await page.evaluate(async () => {
    const r = document.getElementById("vqMake").shadowRoot;
    const s = r.querySelector("select");
    s.focus();
    s.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, composed: true, cancelable: true }));
    await new Promise((z) => setTimeout(z, 150));
    const 開 = !!r.querySelector(".vqcs-menu");
    s.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true, cancelable: true }));
    await new Promise((z) => setTimeout(z, 150));
    return { 開, 閉: !r.querySelector(".vqcs-menu") };
  });
  見(鍵.開, "↓ で 開く");
  見(鍵.閉, "Esc で 閉じる");

  節("⑤ システムの 一覧を 出さない");
  const 止 = await page.evaluate(() => {
    const r = document.getElementById("vqMake").shadowRoot;
    const s = r.querySelector("select");
    const e = new PointerEvent("pointerdown", { bubbles: true, composed: true, button: 0, cancelable: true });
    s.dispatchEvent(e);
    const d = e.defaultPrevented;
    window.__vqcsClose();
    return d;
  });
  見(止 === true, "★ pointerdown を 止めている（＝システムの 一覧が 開かない）");

  節("⑥ 狭い 画面は 下から 出る 板");
  await page.setViewportSize({ width: 390, height: 780 });
  await 待(400);
  const 板 = await page.evaluate(async () => {
    const r = document.getElementById("vqMake").shadowRoot;
    const s = r.querySelector("select");
    s.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true, button: 0, cancelable: true }));
    await new Promise((z) => setTimeout(z, 250));
    const m = r.querySelector(".vqcs-menu");
    const sc = r.querySelector(".vqcs-scrim");
    const b = m ? m.getBoundingClientRect() : null;
    const 高 = m ? getComputedStyle(m.querySelector(".vqcs-opt")).minHeight : "";
    const 押 = m ? Math.round(m.querySelector(".vqcs-opt").getBoundingClientRect().height) : 0;
    const 見出し = m ? !!m.querySelector(".vqcs-ttl") : false;
    window.__vqcsClose();
    return { 板: m ? m.classList.contains("is-sheet") : false, 幕: !!sc,
             下: b ? Math.round(innerHeight - b.bottom) : -1,
             幅: b ? Math.round(b.width) : 0, 画面幅: innerWidth, 押, 見出し };
  });
  見(板.板, "板に なる", 板);
  見(板.幕, "うしろに 幕が 出る（外を 押すと 閉じる）");
  見(板.下 <= 1, "画面の 下に つく", 板.下);
  見(板.幅 > 板.画面幅 * 0.9, "画面いっぱいに 広がる", { 幅: 板.幅, 画面: 板.画面幅 });
  見(板.押 >= 44, "指で 押せる 大きさ（44px 以上）", 板.押);
  見(板.見出し, "何を 選ぶのかが 板に 出る");

  await page.setViewportSize({ width: 1180, height: 900 });
  await 待(300);
  const 戻 = await page.evaluate(async () => {
    const r = document.getElementById("vqMake").shadowRoot;
    const s = r.querySelector("select");
    s.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true, button: 0, cancelable: true }));
    await new Promise((z) => setTimeout(z, 200));
    const m = r.querySelector(".vqcs-menu");
    const o = { 板: m ? m.classList.contains("is-sheet") : null, 幕: !!r.querySelector(".vqcs-scrim") };
    window.__vqcsClose();
    return o;
  });
  見(戻.板 === false && !戻.幕, "広い 画面へ 戻すと ふつうの 一覧に 戻る", 戻);

  節("⑦ 触る 画面（2026-08-31・訴え「モバイルだと システムが 勝ってる」）");
  {
    /* ★ 触る 画面の 合図は pointerdown だけでは ない。
       iOS は touchstart、Android は click で 端末の 一覧が 出る。
       どれも 止めて、独自の 一覧が **1 回だけ** 開く ことを 見る。 */
    await page.setViewportSize({ width: 390, height: 800 });
    await 待(400);
    const 触 = await page.evaluate(async () => {
      const rr = document.getElementById("vqMake").shadowRoot;
      const s = rr.querySelector("select");
      const 出 = { 止めた: {}, 開いた: {} };
      function 印(t) {
        if (t === "touchstart") {
          const b = s.getBoundingClientRect();
          const tc = new Touch({ identifier: 1, target: s, clientX: b.left + 5, clientY: b.top + 5 });
          return new TouchEvent("touchstart", { bubbles: true, cancelable: true, composed: true,
            touches: [tc], targetTouches: [tc], changedTouches: [tc] });
        }
        if (t === "click") return new MouseEvent("click", { bubbles: true, cancelable: true, composed: true });
        return new PointerEvent("pointerdown", { bubbles: true, cancelable: true, composed: true, button: 0, isPrimary: true });
      }
      for (const t of ["pointerdown", "touchstart", "click"]) {
        window.__vqcsClose();
        await new Promise((z) => setTimeout(z, 900));
        const ev = 印(t);
        s.dispatchEvent(ev);
        await new Promise((z) => setTimeout(z, 250));
        出.止めた[t] = ev.defaultPrevented;
        出.開いた[t] = !!rr.querySelector(".vqcs-menu");
      }
      /* 1 回の 操作（3 つ 続けて）で 開くのは 1 回だけ＝開いた まま。 */
      window.__vqcsClose();
      await new Promise((z) => setTimeout(z, 900));
      ["pointerdown", "touchstart", "click"].forEach((t) => s.dispatchEvent(印(t)));
      await new Promise((z) => setTimeout(z, 300));
      const m = rr.querySelector(".vqcs-menu");
      出.続けて開いている = !!m;
      出.板 = m ? m.classList.contains("is-sheet") : false;
      window.__vqcsClose();
      return 出;
    });
    見(触.止めた.pointerdown, "★ pointerdown を 止める");
    見(触.止めた.touchstart, "★ touchstart を 止める（iOS は ここで 端末の 一覧が 出る）");
    見(触.止めた.click, "★ click を 止める（Android は ここで 出る）");
    見(触.開いた.pointerdown && 触.開いた.touchstart && 触.開いた.click,
       "★ どの 合図でも 独自の 一覧が 開く", JSON.stringify(触.開いた));
    見(触.続けて開いている,
       "★ 1 回の 操作（3 つ 続けて）でも 開いた まま（開いて すぐ 閉じない）");
    見(触.板, "狭い 画面なので 下から 出る 板");
    await page.setViewportSize({ width: 1180, height: 900 });
    await 待(300);
  }

  節("例外");
  見(例外.length === 0, "画面の 例外 0 件", 例外.slice(0, 3));

  console.log("\n══ まとめ ══");
  console.log("  ok " + 済 + " / NG " + 落);
  if (落) console.log("  落ちた: " + 落ち.join(" / "));
  await browser.close();
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
