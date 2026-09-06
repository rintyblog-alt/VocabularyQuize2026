#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqhelpreach.cjs — **困った その 場から** ヘルプへ 行けるか（2026-09-01）

   ★ ヘルプは「どこかに ある」だけでは 使われない。
     いま 見て いる 画面の 説明へ、その場から 行ける ことが 大事。
   ★ 段ごとに **行き先が 変わる**（表紙で 困った 人に 紙面の 記事を 出さない）。

   見るもの:
     ① カレンダー / 試験の 詳細 / 文章添削 / 作る画面 に「?」が ある
     ② 押すと **その 画面に 合った 記事**が 開く
     ③ 閉じる ボタンと 重ならない
     ④ 左の 帯にも「ヘルプ」が ある
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const { chromium } = require("playwright");
let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 220) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 320) : "")); }
};
const 待 = (m) => new Promise((s) => setTimeout(s, m));

(async () => {
  const browser = await chromium.launch();
  const pg = await (await browser.newContext({ viewport: { width: 1200, height: 900 } })).newPage();
  const 例外 = []; pg.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 180)));
  await pg.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => !!window.__vqHelp && !!window.__vqCalendar && !!window.__vqExamDetail && !!window.__vqWrite && !!window.__vqMake,
    null, { timeout: 30000 });
  await pg.waitForFunction(() => window.VQ2 && window.VQ2.store && window.VQ2.store.saveExam, null, { timeout: 60000 }).catch(() => {});
  await 待(2500);

  const 試 = async (名, 器, 開く, 待ms) => {
    await pg.evaluate(() => { try { window.__vqHelp.close(); } catch (e) {} });
    await pg.evaluate(開く).catch(() => {});
    await 待(待ms || 700);
    const r = await pg.evaluate((id) => {
      const h = document.getElementById(id);
      const sr = h && h.shadowRoot;
      if (!sr) return { 無: true };
      const b = sr.querySelector('[data-a="help"]');
      if (!b) return { 札なし: true };
      const rb = b.getBoundingClientRect();
      /* ★ 背の 覆い（.bd）も data-a="close" を 持つ。
         それと 比べると **必ず 重なる**ので、覆いは 外す。 */
      const x = Array.prototype.find.call(sr.querySelectorAll('[data-a="close"]'),
        (e) => !e.classList.contains("bd"));
      const rx = x ? x.getBoundingClientRect() : null;
      return { w: Math.round(rb.width), h: Math.round(rb.height),
               重: rx ? !(rb.right < rx.left - 1 || rb.left > rx.right + 1 || rb.bottom < rx.top - 1 || rb.top > rx.bottom + 1) : false };
    }, 器);
    見(r && !r.無 && !r.札なし, 名 + "：「?」が ある", r);
    if (r && !r.無 && !r.札なし) {
      見(!r.重, 名 + "：閉じると 重ならない", r.重);
      見(Math.min(r.w, r.h) >= 32, 名 + "：押せる 大きさ", [r.w, r.h]);
      const 先 = await pg.evaluate(async (id) => {
        document.getElementById(id).shadowRoot.querySelector('[data-a="help"]').click();
        await new Promise((s) => setTimeout(s, 450));
        return window.__vqHelp.状態();
      }, 器);
      見(先 && 先.開 && 先.面 === "art" && !!先.id, "★★ " + 名 + "：**その 画面の 記事が 開く**", 先 && 先.id);
      return 先 && 先.id;
    }
    return "";
  };

  節("① ② ③ 各画面から");
  await 試("カレンダー", "vqCalendar", () => window.__vqCalendar.open());
  await pg.evaluate(() => {
    try {
      window.VQ2.store.saveExam({ id: "hr-1", title: "t", subject: "日本史", totalPoints: 100, durationMinutes: 50,
        cover: { examName: "ためし", subject: "日本史" },
        sections: [{ number: 1, title: "大問1", points: 100, questions: [{ id: "q1", type: "single_choice",
          question: "q", choices: ["ア", "イ", "ウ", "エ"], answer: "ア", points: 100 }] }] }, { force: true });
    } catch (e) {}
  });
  await 試("試験の 詳細", "vqExamDetail", () => window.__vqExamDetail.open("hr-1"));
  await 試("文章添削", "vqWrite", () => window.__vqWrite.open());

  節("④ 作る 画面は **段ごとに 行き先が 変わる**");
  /* ★ ほかの 窓を **閉じてから**。文章添削も [data-box] を 持つので、
     ざっくり 探すと そちらを 掴む（実測で 掴んだ）。 */
  await pg.evaluate(() => { try { window.__vqHelp.close(); window.__vqWrite.close(); window.__vqCalendar.close(); window.__vqExamDetail.close(); } catch (e) {} });
  await 待(400);
  const 段 = await pg.evaluate(async () => {
    const 器 = () => document.getElementById("vqMake") || Array.prototype.find.call(document.querySelectorAll("*"),
      (n) => n.shadowRoot && n.shadowRoot.querySelector('[data-a="go"],[data-a="run"],#vm-name'));
    const 取 = () => {
      const h = 器();
      const b = h && h.shadowRoot.querySelector('[data-a="help"]');
      return b ? b.getAttribute("data-v") : null;
    };
    window.__vqMake.open({ kind: "exam" });
    await new Promise((s) => setTimeout(s, 500));
    const 表 = 取();
    const sr = 器().shadowRoot;
    const n2 = sr.getElementById("vm-name");
    n2.value = "ためし"; n2.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    sr.querySelector('[data-a="go"]').click();
    await new Promise((s) => setTimeout(s, 500));
    const 条 = 取();
    return { 表, 条 };
  });
  見(段.表 === "make-exam", "★ 表紙の 段 → 試験の 作りかた", 段.表);
  見(段.条 === "make-exam", "条件の 段 → 試験の 作りかた", 段.条);
  const 開 = await pg.evaluate(async () => {
    const h = document.getElementById("vqMake") || Array.prototype.find.call(document.querySelectorAll("*"),
      (n) => n.shadowRoot && n.shadowRoot.querySelector('[data-a="run"],[data-a="go"]'));
    h.shadowRoot.querySelector('[data-a="help"]').click();
    await new Promise((s) => setTimeout(s, 450));
    return window.__vqHelp.状態();
  });
  見(開 && 開.開 && 開.id === "make-exam", "★★ **作る 画面からも 開く**", 開 && 開.id);

  節("⑤ 左の 帯からも");
  await pg.evaluate(() => { try { window.__vqHelp.close(); window.__vqMake.閉じる(); } catch (e) {} });
  const 帯 = await pg.evaluate(async () => {
    const 潜 = (r, d) => {
      if (!r || d > 7) return null;
      const 並 = r.querySelectorAll ? r.querySelectorAll("[data-fn='help']") : [];
      if (並.length) return 並[0];
      const 全 = r.querySelectorAll ? r.querySelectorAll("*") : [];
      for (const e of 全) if (e.shadowRoot) { const f = 潜(e.shadowRoot, d + 1); if (f) return f; }
      return null;
    };
    const b = 潜(document, 0);
    if (!b) return { 無: true };
    b.click();
    await new Promise((s) => setTimeout(s, 450));
    return { 開: window.__vqHelp.状態().開, 面: window.__vqHelp.状態().面 };
  });
  見(帯 && !帯.無 && 帯.開, "★ 左の 帯からも 開く", 帯);
  見(帯 && 帯.面 === "top", "帯からは 目次が 出る（画面の 説明では ない）", 帯 && 帯.面);

  見(例外.length === 0, "画面の 例外 0 件", 例外);
  await browser.close();
  console.log("\n────────────────────────────────");
  console.log("  ok " + 済 + " / NG " + 落);
  if (落) { console.log("  落ちた: " + 落ち.join(" / ")); process.exit(1); }
})();
