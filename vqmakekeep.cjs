#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqmakekeep.cjs — 試験づくりの 窓が **描き直しても 元の 場所に 戻る**

   訴え（2026-09-01）:
     「試験作成の ところで さ、いちいち 更新すると、上に 戻ったり、
       設定してたのが リセットされちゃう。コレ 修正できる？
       あの モーダルの とこね」

   直す前の 作り:
     描く() は 窓の 中身を **まるごと 作り直して いた**（box.innerHTML = …）。
     そのため 描き直すたびに
       ・巻き（.w）が 先頭へ 戻る
       ・打っていた 欄から 指が 離れ、打った 位置（カーソル）も 消える
       ・出てくる ときの 動き（vmUp .24s）が やり直される＝跳ねて 見える
     形式の 札を 1 つ 押すだけで これが 起きる。資料を 読み込んで いる 間は
     読取器の 知らせで **何度も** 描き直すので、なおさら。

     さらに 本物の「消える」が 1 つ あった:
       「ほかに 伝えること」の 欄は **条件（st.条件.instruction）から 描いて いる**のに、
       打った ものは **表紙（st.表紙.instruction）へ 書いて いた**。
       読み元と 書き先が 違うので、描き直すたびに **打った ものが 本当に 消えて いた**。

   ここで 見るもの:
     ① 同じ 画面の 描き直しでは 巻きが 戻らない
     ② 打っていた 欄に 指が 残る／カーソルの 位置も 残る
     ③ 「ほかに 伝えること」が 消えない（＝条件へ 書かれて いる）
     ④ 描き直しでは 出てくる 動きを やり直さない
     ⑤ 画面が **変わった** ときは これまでどおり（別の 話なので 戻す ほうが 正しい）

   使い方: VQ_BASE=http://127.0.0.1:8791 node vqmakekeep.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const { chromium } = require("playwright");
let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 220) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 340) : "")); }
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 900, height: 640 } });
  const page = await ctx.newPage();
  const 例外 = [];
  page.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 200)));
  await page.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__vqMake, null, { timeout: 25000 }).catch(() => {});
  見(await page.evaluate(() => !!window.__vqMake), "作る 画面の 部品が ある");

  /* 影の DOM の 中を 触る ための 道具。 */
  const 影 = () => page.evaluateHandle(() => {
    const h = document.querySelector("[data-vq-make],[data-vqmake]")
      || Array.prototype.find.call(document.querySelectorAll("*"), (n) => n.shadowRoot && n.shadowRoot.querySelector("[data-box]"));
    return h && h.shadowRoot ? h.shadowRoot : null;
  });
  const 中で = (fn, arg) => page.evaluate(({ f, a }) => {
    const h = Array.prototype.find.call(document.querySelectorAll("*"),
      (n) => n.shadowRoot && n.shadowRoot.querySelector("[data-box]"));
    const sr = h && h.shadowRoot;
    if (!sr) return null;
    // eslint-disable-next-line no-new-func
    return new Function("sr", "a", f)(sr, a);
  }, { f: fn, a: arg === undefined ? null : arg });

  /* 表紙 → 条件 へ */
  await page.evaluate(() => window.__vqMake.open({ kind: "exam" }));
  await page.waitForTimeout(400);
  /* 名前を 入れないと 条件へ 進めない（そういう 作り）。 */
  await 中で(`
    var n = sr.getElementById("vm-name");
    n.value = "2026年度 1学期 期末考査";
    n.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    sr.querySelector('[data-a="go"]').click();
    return null;
  `);
  await page.waitForTimeout(400);
  const 画面 = await page.evaluate(() => window.__vqMake.状態().画面);
  見(画面 === "条件", "条件の 画面へ 来た", 画面);

  節("① 巻きが 戻らない／② 指が 残る");
  /* 下まで 巻いて、「ほかに 伝えること」に 打つ。 */
  await 中で(`
    var w = sr.querySelector(".w");
    w.scrollTop = w.scrollHeight;
    var t = sr.getElementById("vm-inst");
    t.focus();
    t.value = "配った プリントの 範囲だけで。記述は 40 字以内で 2 問。";
    t.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    t.setSelectionRange(5, 5);
    return null;
  `);
  await page.waitForTimeout(200);
  const 前 = await 中で(`
    var w = sr.querySelector(".w");
    return { 巻: w.scrollTop, 焦: sr.activeElement && sr.activeElement.id, 位: (function(){
      try { return sr.activeElement.selectionStart; } catch(e){ return -1; } })() };
  `);
  見(前 && 前.巻 > 40, "下まで 巻けた", 前);
  見(前 && 前.焦 === "vm-inst", "打つ 欄に 指が ある", 前 && 前.焦);

  /* 描き直しを 起こす（形式の 札を 1 つ 押す＝いちばん よく やる 操作）。 */
  await 中で('sr.querySelector(\'[data-a="type"]\').click();');
  await page.waitForTimeout(300);
  const 後 = await 中で(`
    var w = sr.querySelector(".w");
    var t = sr.getElementById("vm-inst");
    return { 巻: w.scrollTop, 焦: sr.activeElement && sr.activeElement.id,
             位: (function(){ try { return sr.activeElement.selectionStart; } catch(e){ return -1; } })(),
             文: t ? t.value : "(欄が 無い)",
             動: (w.className || "") };
  `);
  見(後 && Math.abs(後.巻 - 前.巻) <= 4, "★★ **巻きが 元の ところに 残る**（直す前は 0 へ 戻った）", { 前: 前.巻, 後: 後.巻 });
  見(後 && 後.焦 === "vm-inst", "★★ **打っていた 欄に 指が 残る**", 後 && 後.焦);
  見(後 && 後.位 === 5, "★ カーソルの 位置も 残る（先頭へ 飛ばない）", 後 && 後.位);

  節("③ 「ほかに 伝えること」が 消えない");
  見(後 && /配った プリントの 範囲だけで/.test(後.文),
    "★★ **打った ものが 残る**（直す前は 読み元 条件・書き先 表紙 で 毎回 消えた）", 後 && 後.文);
  const 状 = await page.evaluate(() => window.__vqMake.状態());
  見(状 && /配った プリントの 範囲だけで/.test(String(状.条件.instruction || "")),
    "★ **条件**の ほうに 入って いる", 状 && 状.条件.instruction);
  見(!(状 && String(状.表紙.instruction || "").trim()),
    "表紙の ほうへは 入れない（持ちものを 取り違えない）", 状 && 状.表紙.instruction);

  節("④ 描き直しでは 動きを やり直さない");
  見(後 && /\bkeep\b/.test(後.動), "★ 同じ 画面の 描き直しには keep が 付く（animation を 止める）", 後 && 後.動);

  節("⑤ 画面が 変わった ときは これまでどおり");
  await 中で('sr.querySelector(\'[data-a="back-cover"]\').click();');
  await page.waitForTimeout(300);
  const 表 = await 中で('var w = sr.querySelector(".w"); return { 巻: w.scrollTop, 動: w.className };');
  見(表 && !/\bkeep\b/.test(表.動), "★ 画面が 変わった ときは keep を 付けない（出てくる 動きは 出す）", 表 && 表.動);
  見(表 && 表.巻 === 0, "別の 画面は 先頭から", 表 && 表.巻);
  /* 戻ると、その 画面で 見て いた ところへ 戻る。 */
  await 中で('sr.querySelector(\'[data-a="go"]\').click();');
  await page.waitForTimeout(300);
  const 戻 = await 中で('var w = sr.querySelector(".w"); return w.scrollTop;');
  見(Math.abs(Number(戻) - Number(前.巻)) <= 6,
    "★ 前に 見て いた ところへ 戻る（行き来しても 探し直さない）", { 前: 前.巻, 戻: 戻 });

  節("④-b ★ **選び欄（ドロップダウン）でも 巻きが 戻らない**");
  /* 訴え「**選択したり** して 更新すると 上に スクロールして しまう」。
     真因は 独自ドロップダウンの focus()。focus() は 既定で
     **その 部品が 見える ところまで 親を 巻き戻す**ので、
     窓の 上に ある 選び欄を 選ぶと 下まで 巻いた 画面が 先頭へ 戻って いた
     （実測 333 → 0）。preventScroll で 焦点だけ 移す。 */
  const 選 = await page.evaluate(async () => {
    const M = window.__vqMake;
    /* 選び欄が ある 画面（紙面）へ 直に 行く。 */
    M.試験を入れる({ id: "kp-1", title: "ためし", subject: "日本史",
      totalPoints: 100, durationMinutes: 50,
      cover: { examName: "ためしの試験", subject: "日本史" },
      sections: [1, 2, 3].map((n) => ({ number: n, title: "大問" + n, points: 33,
        questions: [1, 2, 3, 4].map((i) => ({ id: "q" + n + i, type: "single_choice",
          question: "問題 " + n + "-" + i + " の 本文です。".repeat(3),
          choices: ["ア", "イ", "ウ", "エ"], answer: "ア", points: 8 })) })) });
    await new Promise((s) => setTimeout(s, 700));
    const h = Array.prototype.find.call(document.querySelectorAll("*"),
      (n) => n.shadowRoot && n.shadowRoot.querySelector("[data-box]"));
    const sr = h.shadowRoot;
    const w = sr.querySelector(".w");
    const sel = sr.querySelector(".w select");
    if (!w || !sel) return { 無: true };
    w.scrollTop = w.scrollHeight;
    const 前 = w.scrollTop;
    sel.click();
    await new Promise((s) => setTimeout(s, 250));
    const 後 = sr.querySelector(".w").scrollTop;
    /* 焦点は ちゃんと 移って いる（キーボードで 続けられる）。 */
    const 焦 = sr.activeElement === sel;
    return { 前, 後, 焦, 画面: window.__vqMake.状態().画面 };
  });
  見(!選.無 && 選.前 > 40, "下まで 巻けた（紙面の 画面）", 選);
  見(!選.無 && Math.abs(選.後 - 選.前) <= 6,
    "★★ **選び欄を 押しても 巻きが 戻らない**（直す前は 先頭へ 戻った）", 選);


  見(例外.length === 0, "画面の 例外 0 件", 例外);
  await browser.close();
  console.log("\n────────────────────────────────");
  console.log("  ok " + 済 + " / NG " + 落);
  if (落) { console.log("  落ちた: " + 落ち.join(" / ")); process.exit(1); }
})();
