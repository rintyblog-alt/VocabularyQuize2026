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
     ⑤ 狭い 画面では **押した ところの 直下**に 出る（2026-08-31・訴え）
     ⑥ 下部バー（#vqMobBar）に 被らない ＝ document.body に 出す
     ⑦ システムの 一覧を 出さない（合図を 止め、焦点を 当てない）

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
    const m = document.querySelector(".vqcs-menu");
    const 置 = window.__vqcsWhere();
    return { 文書側に出た: !!m, 項目: m ? m.querySelectorAll(".vqcs-opt").length : 0,
             ネイティブの数: s.options.length,
             影の中: !!r.querySelector(".vqcs-menu"),
             layer: !!document.getElementById("vqcs-layer"),
             style: !!document.getElementById("vqcs-style"),
             body直下: 置 ? 置.body : false };
  });
  見(開い.文書側に出た, "★ 影の 中の select でも 一覧が 開く", 開い);
  見(開い.body直下 && !開い.影の中,
     "★ 一覧は **document.body** に 出る（影の 中だと 下部バーに 負ける）", 開い);
  見(開い.項目 === 開い.ネイティブの数, "項目の 数が ネイティブと 合う", 開い);
  見(開い.style && 開い.layer, "見た目と 置き場が 文書側に ある");

  節("③ 選ぶと 中身が 変わる");
  const 選 = await page.evaluate(async () => {
    const r = document.getElementById("vqMake").shadowRoot;
    const s = r.querySelector("select");
    const 前 = s.value;
    let ch = 0, inp = 0;
    s.addEventListener("change", () => ch++);
    s.addEventListener("input", () => inp++);
    const opts = document.querySelectorAll(".vqcs-opt");
    const 狙 = opts[Math.min(1, opts.length - 1)];
    狙.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
    await new Promise((z) => setTimeout(z, 200));
    return { 前, 後: s.value, change: ch, input: inp,
             閉じた: !document.querySelector(".vqcs-menu") };
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
    const 開 = !!document.querySelector(".vqcs-menu");
    s.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true, cancelable: true }));
    await new Promise((z) => setTimeout(z, 150));
    return { 開, 閉: !document.querySelector(".vqcs-menu") };
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

  節("⑥ 狭い 画面は **押した ところの 直下**（2026-08-31・訴え）");
  await page.setViewportSize({ width: 390, height: 780 });
  await 待(500);
  const 直下 = await page.evaluate(async () => {
    const r = document.getElementById("vqMake").shadowRoot;
    const s = r.querySelector("select");
    s.scrollIntoView({ block: "center" });
    await new Promise((z) => setTimeout(z, 120));
    const sb = s.getBoundingClientRect();
    s.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true,
      button: 0, cancelable: true, pointerType: "touch", isPrimary: true }));
    await new Promise((z) => setTimeout(z, 250));
    const m = document.querySelector(".vqcs-menu");
    const b = m ? m.getBoundingClientRect() : null;
    const 押 = m ? Math.round(m.querySelector(".vqcs-opt").getBoundingClientRect().height) : 0;
    const 置 = window.__vqcsWhere();
    /* 下部バーの 上端（実物）。出ていなければ 画面の 下。 */
    const bar = document.getElementById("vqMobBar");
    const 帯 = bar && getComputedStyle(bar).display !== "none"
      ? Math.round(bar.getBoundingClientRect().top) : innerHeight;
    window.__vqcsClose();
    return { 触: 置 ? 置.触 : false, 上向き: 置 ? 置.上向き : null,
             選の下: Math.round(sb.bottom), 選の左: Math.round(sb.left), 選の幅: Math.round(sb.width),
             上: b ? Math.round(b.top) : -1, 下: b ? Math.round(b.bottom) : -1,
             左: b ? Math.round(b.left) : -1, 幅: b ? Math.round(b.width) : 0,
             押, 帯, 画面幅: innerWidth, 画面高: innerHeight,
             板が残っている: m ? m.classList.contains("is-sheet") : false };
  });
  見(!直下.板が残っている, "下から 出る 板は もう 使わない", 直下.板が残っている);
  見(直下.触, "触る 画面の 見た目に なる（is-touch）", 直下.触);
  見(直下.上向き === false, "下に 出る（上へ 逃げていない）", 直下.上向き);
  見(Math.abs(直下.上 - 直下.選の下) <= 12,
     "★ 押した ところの **直下**に 出る", { 選の下: 直下.選の下, 一覧の上: 直下.上 });
  見(Math.abs(直下.左 - 直下.選の左) <= 12,
     "左端が 押した ところと そろう", { 選の左: 直下.選の左, 一覧の左: 直下.左 });
  見(直下.押 >= 44, "指で 押せる 大きさ（44px 以上）", 直下.押);
  見(直下.幅 >= Math.min(220, 直下.画面幅 - 16) - 2, "指で 読める 幅が ある", 直下.幅);

  節("⑦ 下部バー（ナビゲーションバー）に 被らない");
  {
    /* ★ 訴え「下部バーに 被ってしまう ことが ある」。
       芯は **一覧を 影の 中に 出していた** こと。影の 重なりは 持ち主に
       閉じ込められるので、z-index を いくら 上げても #vqMobBar(9990) に
       負ける。document.body に 出し、そのうえで 帯の 上端で 止める。 */
    const 帯 = await page.evaluate(async () => {
      const bar = document.getElementById("vqMobBar");
      if (!bar) return { 帯なし: true };
      const cs = getComputedStyle(bar);
      const br = bar.getBoundingClientRect();
      const r = document.getElementById("vqMake").shadowRoot;
      /* 画面の いちばん下に 近い select を 選ぶ（帯に 掛かりやすい ところ）。 */
      const ss = Array.from(r.querySelectorAll("select"))
        .filter((x) => x.getBoundingClientRect().height > 0);
      const s = ss.sort((a, b2) =>
        b2.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0];
      if (!s) return { selectなし: true };
      s.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true,
        button: 0, cancelable: true, pointerType: "touch", isPrimary: true }));
      await new Promise((z) => setTimeout(z, 250));
      const 置 = window.__vqcsWhere();
      /* 一覧の 上の 点を 誰が 拾うか（＝本当に 上に いるか）。 */
      const m = document.querySelector(".vqcs-menu");
      let 手前 = null;
      if (m) {
        const b = m.getBoundingClientRect();
        const el = document.elementFromPoint(Math.round(b.left + b.width / 2),
                                             Math.round(b.top + Math.min(20, b.height / 2)));
        手前 = el ? (el.id || el.className || el.tagName) : null;
        手前 = String(手前).slice(0, 40);
      }
      window.__vqcsClose();
      return { 見えている: cs.display !== "none", 帯の上: Math.round(br.top),
               帯の高: Math.round(br.height),
               一覧の下: 置 ? 置.下 : -1, 限り: 置 ? 置.限り : -1,
               body直下: 置 ? 置.body : false, 手前 };
    });
    if (帯.帯なし || 帯.selectなし || !帯.見えている) {
      見(true, "下部バーが 出ていないので 見送り", 帯);
    } else {
      見(帯.一覧の下 <= 帯.帯の上,
         "★ 一覧が 下部バーに 掛からない", { 一覧の下: 帯.一覧の下, 帯の上: 帯.帯の上 });
      見(帯.限り <= 帯.帯の上, "下の 限りを 帯の 上端に 合わせている", 帯);
      見(帯.body直下, "一覧が document.body に 出ている（重なりが 閉じ込められない）", 帯);
      見(!/vqMobBar/.test(String(帯.手前 || "")), "一覧の 上に 帯が 乗っていない", 帯.手前);
    }
  }

  await page.setViewportSize({ width: 1180, height: 900 });
  await 待(300);
  const 戻 = await page.evaluate(async () => {
    const r = document.getElementById("vqMake").shadowRoot;
    const s = r.querySelector("select");
    s.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true, button: 0, cancelable: true, pointerType: "mouse" }));
    await new Promise((z) => setTimeout(z, 200));
    const m = document.querySelector(".vqcs-menu");
    const o = { 触: m ? m.classList.contains("is-touch") : null, 幕: !!document.querySelector(".vqcs-scrim") };
    window.__vqcsClose();
    return o;
  });
  見(戻.触 === false && !戻.幕, "広い 画面へ 戻すと ふつうの 一覧に 戻る", 戻);

  節("⑧ 触る 画面（2026-08-31・訴え「モバイルだと システムが 勝ってる」）");
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
        出.開いた[t] = !!document.querySelector(".vqcs-menu");
      }
      /* 1 回の 操作（3 つ 続けて）で 開くのは 1 回だけ＝開いた まま。 */
      window.__vqcsClose();
      await new Promise((z) => setTimeout(z, 900));
      ["pointerdown", "touchstart", "click"].forEach((t) => s.dispatchEvent(印(t)));
      await new Promise((z) => setTimeout(z, 300));
      const m = document.querySelector(".vqcs-menu");
      出.続けて開いている = !!m;
      出.触 = m ? m.classList.contains("is-touch") : false;
      出.焦点 = rr.activeElement ? rr.activeElement.tagName : null;
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
    見(触.触, "狭い 画面なので 指で 押せる 見た目に なる");
    見(触.焦点 !== "SELECT",
       "★ 触って 開いた ときは select に **焦点を 当てない**（iOS は 焦点だけで 端末の 一覧が 出る）",
       触.焦点);
    await page.setViewportSize({ width: 1180, height: 900 });
    await 待(300);
  }

  節("⑨ 本物の 指で 触る（hasTouch・実際に tap する）");
  {
    /* ★ ここまでは 作った 合図。ここは **本物の tap**。
       iOS で 端末の 一覧が 出る 引き金は 「select に 焦点が 入る」こと なので、
       触った あと・選んだ あとに 焦点が 入っていない ことを 見る。 */
    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true });
    const p2 = await ctx2.newPage();
    const 例外2 = [];
    p2.on("pageerror", (e) => 例外2.push(String(e.message).slice(0, 200)));
    await p2.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
    await p2.waitForFunction(() => !!window.__vqMake, null, { timeout: 60000 });
    await 待(4000);
    await p2.evaluate(() => {
      window.__vqMake.open({ kind: "exam" });
      window.__vqMake.表紙を入れる({ examName: "確かめ", subject: "生物基礎" });
      window.__vqMake.条件を入れる({});
      const r = document.getElementById("vqMake").shadowRoot;
      const b = r.querySelector('[data-a="go"]'); if (b) b.click();
    });
    await 待(900);
    const 的 = p2.locator("select#vm-layoutMode");
    await 的.scrollIntoViewIfNeeded();
    await 待(200);
    await 的.tap();
    await 待(350);
    const 触実 = await p2.evaluate(() => {
      const r = document.getElementById("vqMake").shadowRoot;
      const s = r.querySelector("select#vm-layoutMode");
      const m = document.querySelector(".vqcs-menu");
      const b = m ? m.getBoundingClientRect() : null;
      const sb = s.getBoundingClientRect();
      const bar = document.getElementById("vqMobBar");
      const 帯 = bar && getComputedStyle(bar).display !== "none"
        ? Math.round(bar.getBoundingClientRect().top) : innerHeight;
      return { 開いた: !!m, 触: m ? m.classList.contains("is-touch") : false,
               焦点: r.activeElement ? (r.activeElement.id || r.activeElement.tagName) : null,
               上: b ? Math.round(b.top) : -1, 下: b ? Math.round(b.bottom) : -1,
               選の下: Math.round(sb.bottom), 帯 };
    });
    見(触実.開いた, "★ 本物の tap で 独自の 一覧が 開く", 触実);
    見(触実.焦点 !== "vm-layoutMode",
       "★ 触った あと select に 焦点が 入っていない（＝端末の 一覧が 出ない）", 触実.焦点);
    見(Math.abs(触実.上 - 触実.選の下) <= 12, "押した ところの 直下に 出る", 触実);
    見(触実.下 <= 触実.帯, "★ 下部バーに 掛からない", { 下: 触実.下, 帯: 触実.帯 });

    /* 選んだ あと。前は closeMenu(true) が focus() を 呼び、
       選ぶ たびに 端末の 一覧が 出ていた。 */
    const 前 = await p2.evaluate(() => document.getElementById("vqMake").shadowRoot
      .querySelector("select#vm-layoutMode").value);
    await p2.locator(".vqcs-menu .vqcs-opt").nth(2).tap();
    await 待(350);
    const 選実 = await p2.evaluate(() => {
      const r = document.getElementById("vqMake").shadowRoot;
      const s = r.querySelector("select#vm-layoutMode");
      return { 値: s.value, 閉じた: !document.querySelector(".vqcs-menu"),
               焦点: r.activeElement ? (r.activeElement.id || r.activeElement.tagName) : null };
    });
    見(選実.値 !== 前, "指で 選ぶと 中身が 変わる", { 前, 後: 選実.値 });
    見(選実.閉じた, "選んだら 閉じる");
    見(選実.焦点 !== "vm-layoutMode",
       "★ 選んだ あとも 焦点を 戻さない（ここが 「選ぶ たびに システムの 一覧」の 芯）", 選実.焦点);
    見(例外2.length === 0, "触る 画面の 例外 0 件", 例外2.slice(0, 3));
    await ctx2.close();
  }

  節("⑩ 設定 → 画面と表示 → フォント（訴えの 画面 そのもの）");
  {
    /* ★ Rinty さんが 見せてくれた 画面。61 種類 ある 長い 一覧なので、
       ここが いちばん 端末の 一覧に 負けやすい。本物の tap で 見る。 */
    const ctx3 = await browser.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true });
    const p3 = await ctx3.newPage();
    const 例外3 = [];
    p3.on("pageerror", (e) => 例外3.push(String(e.message).slice(0, 200)));
    await p3.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
    await p3.waitForFunction(() => !!window.__vqOpenSettings, null, { timeout: 60000 });
    await 待(3500);
    /* 更新案内（#vqTour）が 前に 出ていると 触れないので 閉じる。 */
    const 案内を閉じる = async () => {
      await p3.evaluate(() => {
        const t = document.getElementById("vqTour");
        if (!t) return;
        const b = t.shadowRoot && t.shadowRoot.querySelector("[data-skip]");
        if (b) b.click();
        t.style.display = "none"; t.style.pointerEvents = "none";
      });
      /* 入口の 画面（未ログイン）も どける。ここで 見たいのは 置き場所だけ。 */
      await p3.evaluate(() => {
        const a = document.getElementById("vqNewAuth");
        if (a) { a.style.display = "none"; a.style.pointerEvents = "none"; }
      });
    };
    await 案内を閉じる();
    await p3.evaluate(() => window.__vqOpenSettings());
    await 待(1200);
    /* 狭い 画面は 目次から 入る。「画面と表示」の 部屋へ 移る。 */
    await p3.evaluate(() => {
      const r = document.getElementById("vqSettings").shadowRoot;
      const b = r.querySelector('[data-nav="display"]');
      if (b) b.click();
    });
    await 待(900);
    const 見つけ = await p3.evaluate(() => {
      const h = document.getElementById("vqSettings");
      const r = h && h.shadowRoot;
      const s = r && r.querySelector('select[data-set="display.fontFamily"]');
      return { 画面: !!r, ある: !!s, 独自: s ? !!s.__vqcs : false, 数: s ? s.options.length : 0 };
    });
    見(見つけ.ある, "フォントの 選択欄が ある", 見つけ);
    見(見つけ.独自, "★ フォントの 選択欄も 独自に なっている", 見つけ);
    if (見つけ.ある) {
      await 案内を閉じる();
      const 的 = p3.locator('#vqSettings select[data-set="display.fontFamily"]');
      await 的.scrollIntoViewIfNeeded();
      await 待(250);
      await 的.tap();
      await 待(400);
      const 出 = await p3.evaluate(() => {
        const r = document.getElementById("vqSettings").shadowRoot;
        const s = r.querySelector('select[data-set="display.fontFamily"]');
        const m = document.querySelector(".vqcs-menu");
        const b = m ? m.getBoundingClientRect() : null;
        const sb = s.getBoundingClientRect();
        const bar = document.getElementById("vqMobBar");
        const 帯 = bar && getComputedStyle(bar).display !== "none"
          ? Math.round(bar.getBoundingClientRect().top) : innerHeight;
        return { 開いた: !!m, 項目: m ? m.querySelectorAll(".vqcs-opt").length : 0,
                 元の数: s.options.length,
                 焦点: r.activeElement ? String(r.activeElement.getAttribute("data-set") || r.activeElement.tagName) : null,
                 当たり: getComputedStyle(s).pointerEvents,
                 上: b ? Math.round(b.top) : -1, 下: b ? Math.round(b.bottom) : -1,
                 選の下: Math.round(sb.bottom), 帯, 画面高: innerHeight };
      });
      見(出.開いた && 出.項目 === 出.元の数, "★ 61 種類の 一覧が 独自で 開く", 出);
      見(出.焦点 !== "display.fontFamily",
         "★ 焦点が select に 入っていない（＝端末の 一覧が 出ない）", 出.焦点);
      見(出.当たり === "none", "開いている あいだ select は 触れない（2 度目の tap が 端末へ 行かない）", 出.当たり);
      見(出.下 <= 出.帯, "★ 下部バーに 掛からない", { 下: 出.下, 帯: 出.帯 });
      見(Math.abs(出.上 - 出.選の下) <= 12 || 出.上 >= 8, "画面から はみ出さない", 出);
      await p3.locator(".vqcs-menu .vqcs-opt").nth(3).tap();
      await 待(400);
      const 後 = await p3.evaluate(() => {
        const r = document.getElementById("vqSettings").shadowRoot;
        const s = r.querySelector('select[data-set="display.fontFamily"]');
        return { 閉じた: !document.querySelector(".vqcs-menu"), 当たり: getComputedStyle(s).pointerEvents,
                 焦点: r.activeElement ? String(r.activeElement.getAttribute("data-set") || r.activeElement.tagName) : null };
      });
      見(後.閉じた, "選んだら 閉じる");
      見(後.当たり !== "none", "閉じたら 当たり判定を 戻す", 後.当たり);
      見(後.焦点 !== "display.fontFamily", "★ 選んだ あとも 焦点を 戻さない", 後.焦点);
    }
    見(例外3.length === 0, "設定の 例外 0 件", 例外3.slice(0, 3));
    await ctx3.close();
  }

  節("例外");
  見(例外.length === 0, "画面の 例外 0 件", 例外.slice(0, 3));

  console.log("\n══ まとめ ══");
  console.log("  ok " + 済 + " / NG " + 落);
  if (落) console.log("  落ちた: " + 落ち.join(" / "));
  await browser.close();
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
