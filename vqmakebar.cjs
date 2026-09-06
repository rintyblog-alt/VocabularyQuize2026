#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqmakebar.cjs — 作って いる あいだの 帯が **チカチカ しない**

   訴え（2026-09-01）:「試験作成 途中に、生成バーが 出るやん？
                        あれも チカチカ 更新するたびに なるから 修正を」

   直す前の 作り:
     進みは 1 秒に 何度も 来る。そのたび `描く()` で
     **窓の 中身を まるごと 作り直して いた**（box.innerHTML = …）。
     帯も 記録も 毎回 生まれ直す ので、
       ・帯が 0% から 描き直されて 点滅する
       ・記録の 行が 全部 作り直されて ちらつく
     ＝「更新する たびに チカチカ」。

   直したあと:
     `進みを塗る()` … 出来上がって いる ところは 触らず、
     **変わった 字と 幅だけ** 塗る。記録は 足りない ぶんだけ 足す。
     形が 変わる とき（ボタンの 入れ替え・断りの 出入り）だけ 建て直す。

   ここで 見るもの:
     ① 進みが 来ても **帯の 部品が 生まれ変わらない**（同じ もの が 残る）
     ② 幅と 字は ちゃんと 変わる（塗って いる）
     ③ 記録は **足りない ぶんだけ** 増える（全部 作り直さない）
     ④ 記録が 60 件で 切られても 同じ 行が 二度 出ない（通し番号）
     ⑤ 走り終わって ボタンが 変わる ときは 建て直す
     ⑥ 断りが 出る ときも 建て直す
     ⑦ 生成の 画面でも 巻きが 戻らない

   使い方: VQ_BASE=http://127.0.0.1:8791 node vqmakebar.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const { chromium } = require("playwright");
let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 240) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 360) : "")); }
};

(async () => {
  const browser = await chromium.launch();
  const pg = await (await browser.newContext({ viewport: { width: 900, height: 620 } })).newPage();
  const 例外 = []; pg.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 200)));
  await pg.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => !!window.__vqMake, null, { timeout: 25000 });

  /* 生成の 画面を 直に 出す（本物の AI は 呼ばない。出しかたを 見る）。 */
  const 出す = () => pg.evaluate(() => {
    const M = window.__vqMake;
    M.__試験の中 = M.__試験の中 || {};
    /* 内部を 触る 口は 無いので、window から 開いた あと 画面を 生成へ 移す。 */
    M.open({ kind: "exam" });
    return true;
  });
  await 出す();
  await pg.waitForTimeout(300);
  /* 表紙 → 条件 → （枠）→ 生成 */
  const 中で = (f) => pg.evaluate((s) => {
    const h = Array.prototype.find.call(document.querySelectorAll("*"),
      (n) => n.shadowRoot && n.shadowRoot.querySelector("[data-box]"));
    return new Function("sr", s)(h.shadowRoot);
  }, f);
  await 中で(`var n=sr.getElementById("vm-name"); n.value="ためしの試験";
    n.dispatchEvent(new Event("input",{bubbles:true,composed:true}));
    sr.querySelector('[data-a="go"]').click(); return null;`);
  await pg.waitForFunction(() => window.VQ2 && window.VQ2.mockCompiler && window.VQ2.mockCompiler.plan,
    null, { timeout: 60000 }).catch(() => {});
  await pg.waitForTimeout(300);
  await 中で(`sr.querySelector('[data-a="run"]').click(); return null;`);   /* → 構成案 */
  await pg.waitForTimeout(500);
  /* 生成は 本物の AI を 呼ぶので **押さない**。画面だけ 生成に して 進みを 流す。 */
  const 入れた = await pg.evaluate(() => {
    const M = window.__vqMake;
    return typeof M.__進みためし === "function";
  });
  見(入れた, "検査用の 口（__進みためし）が ある");
  if (!入れた) {
    console.log("\n（__進みためし が 無いので ここまで）");
  } else {
    節("① 帯が 生まれ変わらない");
    const a = await pg.evaluate(async () => {
      const M = window.__vqMake;
      M.__進みためし({ 画面: true, made: 0, total: 20, stage: "はじめています…", 記録: ["step:枠を 決めました"] });
      await new Promise((s) => setTimeout(s, 120));
      const h = Array.prototype.find.call(document.querySelectorAll("*"),
        (n) => n.shadowRoot && n.shadowRoot.querySelector("[data-box]"));
      const sr = h.shadowRoot;
      const bar = sr.querySelector(".bar > i");
      const log = sr.querySelector(".log");
      bar.__印 = "b1"; log.__印 = "L1";
      const 前 = { 幅: bar.style.width, 字: sr.querySelector(".barn").textContent, 行: log.children.length };
      /* 進みを 20 回 流す（本番と 同じ 頻度） */
      for (let i = 1; i <= 20; i++) {
        M.__進みためし({ made: i, total: 20, stage: "問題を 作っています（" + i + "）",
          記録: i % 4 === 0 ? ["note:" + i + " 問 できました"] : [] });
        await new Promise((s) => setTimeout(s, 20));
      }
      const bar2 = sr.querySelector(".bar > i");
      const log2 = sr.querySelector(".log");
      return {
        帯おなじ: bar2.__印 === "b1", 記録おなじ: log2.__印 === "L1",
        前, 後: { 幅: bar2.style.width, 字: sr.querySelector(".barn").textContent, 行: log2.children.length },
        文: Array.prototype.map.call(log2.children, (d) => d.textContent)
      };
    });
    見(a.帯おなじ, "★★ **帯の 部品が 生まれ変わらない**（直す前は 毎回 作り直し＝点滅）", a.帯おなじ);
    見(a.記録おなじ, "★★ **記録の 器も 生まれ変わらない**", a.記録おなじ);
    節("② 中身は ちゃんと 変わる");
    見(a.前.幅 !== a.後.幅 && a.後.幅 === "100%", "★ 帯の 幅が 変わる", { 前: a.前.幅, 後: a.後.幅 });
    見(/20 \/ 20 問/.test(a.後.字), "★ 数字も 変わる", a.後.字);
    節("③ 記録は 足りない ぶんだけ 増える");
    見(a.後.行 > a.前.行, "行が 増えて いる", { 前: a.前.行, 後: a.後.行 });
    見(new Set(a.文).size === a.文.length, "★ 同じ 行が 二度 出ない", a.文);
    見(a.後.行 <= 14, "溜まりすぎない（14 行まで）", a.後.行);

    節("④ たくさん 流しても ずれない（記録は 60 件で 切られる）");
    const b = await pg.evaluate(async () => {
      const M = window.__vqMake;
      for (let i = 0; i < 80; i++) {
        M.__進みためし({ made: 20, total: 20, 記録: ["note:たくさん " + i] });
      }
      await new Promise((s) => setTimeout(s, 120));
      const h = Array.prototype.find.call(document.querySelectorAll("*"),
        (n) => n.shadowRoot && n.shadowRoot.querySelector("[data-box]"));
      const 文 = Array.prototype.map.call(h.shadowRoot.querySelectorAll(".log > div"), (d) => d.textContent);
      return { 行: 文.length, 別: new Set(文).size, 末: 文[文.length - 1] };
    });
    見(b.行 === b.別, "★★ **80 件 流しても 同じ 行が 二度 出ない**（通し番号で 数えている）", b);
    見(/たくさん 79/.test(b.末), "いちばん 新しい ものが 下に 来る", b.末);

    節("⑤⑥ 形が 変わる ときは 建て直す");
    const c = await pg.evaluate(async () => {
      const M = window.__vqMake;
      const h = Array.prototype.find.call(document.querySelectorAll("*"),
        (n) => n.shadowRoot && n.shadowRoot.querySelector("[data-box]"));
      const sr = h.shadowRoot;
      sr.querySelector(".bar > i").__印 = "b2";
      M.__進みためし({ 走っている: false });
      await new Promise((s) => setTimeout(s, 120));
      const ft = sr.querySelector(".ft");
      const 建 = sr.querySelector(".bar > i").__印 !== "b2";
      sr.querySelector(".bar > i").__印 = "b3";
      M.__進みためし({ err: "ためしの 断り" });
      await new Promise((s) => setTimeout(s, 120));
      return { 建, ボタン: ft ? ft.textContent.trim() : "", 建2: sr.querySelector(".bar > i").__印 !== "b3",
               断り: !!sr.querySelector(".err") };
    });
    見(c.建, "★ 走り終わったら 建て直す（ボタンが 変わる ので）", c);
    見(/構成案へ戻る/.test(c.ボタン), "ボタンが 入れ替わって いる", c.ボタン);
    見(c.建2 && c.断り, "★ 断りが 出る ときも 建て直す", c);

    節("⑦ 生成の 画面でも 巻きが 戻らない");
    const d = await pg.evaluate(async () => {
      const M = window.__vqMake;
      M.__進みためし({ err: "", 走っている: true });
      await new Promise((s) => setTimeout(s, 100));
      const h = Array.prototype.find.call(document.querySelectorAll("*"),
        (n) => n.shadowRoot && n.shadowRoot.querySelector("[data-box]"));
      const sr = h.shadowRoot;
      const w = sr.querySelector(".w");
      w.scrollTop = w.scrollHeight;
      const 前 = w.scrollTop;
      M.__進みためし({ made: 5, total: 20, 記録: ["note:巻きの ためし"] });
      await new Promise((s) => setTimeout(s, 150));
      const w2 = sr.querySelector(".w");
      return { 前, 後: w2.scrollTop };
    });
    見(Math.abs(d.後 - d.前) <= 4 || d.前 === 0, "★ 巻きが 残る", d);
  }

  見(例外.length === 0, "画面の 例外 0 件", 例外);
  await browser.close();
  console.log("\n────────────────────────────────");
  console.log("  ok " + 済 + " / NG " + 落);
  if (落) { console.log("  落ちた: " + 落ち.join(" / ")); process.exit(1); }
})();
