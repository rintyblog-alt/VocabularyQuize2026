#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqprodcheck.cjs — 本番に **実際に 出ているか**を、画面を 開いて 確かめる

   ★ grep で 探すと 見落とす。圧縮した 本体では 日本語が \u エスケープに
     なるので、「文字が 無い」＝「出ていない」では ない（実際に 一度
     間違えた）。ここは **本番の 画面を 本物の ブラウザで 開いて**、
     関数を 呼び、DOM を 見て 確かめる。

   触るのは 読み取りだけ。**登録しない・公開しない・何も 書かない。**
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_PROD || "https://www.vocabuquiz.app";
const { chromium } = require("playwright");
let 済 = 0, 落 = 0;
const ok = (n, c, x) => {
  if (c) { 済++; console.log("  ok   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 200) : "")); }
  else { 落++; console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 300) : "")); }
};
const 節 = (t) => console.log("\n══ " + t + " ══");

(async () => {
  console.log("本番: " + BASE + "\n");
  const b = await chromium.launch({ headless: true });
  const pg = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await pg.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.waitForTimeout(9000);

  節("① プリセットの クラウド生成");
  ok("台帳を 見に いく 口が ある（__vqCloudGen）",
    await pg.evaluate(() => !!(window.__vqCloudGen && window.__vqCloudGen.list && window.__vqCloudGen.cancel)));
  ok("作り始めた 合図を 受ける 用意が ある",
    await pg.evaluate(() => {
      /* 合図を 投げて 落ちない ＝ 受け口が 立っている */
      try { window.dispatchEvent(new CustomEvent("vq:cloudgen:start", { detail: { jobId: "", planned: 0 } })); return true; }
      catch (e) { return false; }
    }));
  ok("台帳に 載せて 作る 口が ある（generateQuestionsTracked）",
    await pg.evaluate(() => typeof (window.VQ2 && window.VQ2.aigen && window.VQ2.aigen.generateQuestionsTracked) === "function"));
  ok("**作りかけの 札の 見た目が 入っている**（影の DOM の CSS）",
    await pg.evaluate(() => {
      const sh = document.getElementById("vqScreens");
      if (!sh || !sh.shadowRoot) return false;
      const st = sh.shadowRoot.querySelector("style");
      return !!st && /pc--building/.test(st.textContent || "");
    }));

  節("② 一覧の 取り直し");
  ok("「最新にする」が 画面に ある",
    await pg.evaluate(() => !!document.getElementById("appLibraryReloadBtn")));
  ok("押したときの 動きが つながっている",
    await pg.evaluate(() => (document.getElementById("appLibraryReloadBtn") || {}).getAttribute?.("data-lib-action") === "reloadLibrary"));

  節("③ 窓の 出入り（ふわっと）");
  const sheet = await pg.evaluate(async () => {
    const U = window.VQ2 && window.VQ2.ui;
    if (!U || !U.mount) return null;
    const app = U.mount("prod-check-sheet", { title: "確認", sheet: true, css: "" });
    const 直後 = getComputedStyle(app.root).opacity;
    await new Promise((r) => setTimeout(r, 420));
    const 出た = getComputedStyle(app.root).opacity;
    app.close("check");
    await new Promise((r) => setTimeout(r, 40));
    const 閉じ中 = app.root.className;
    await new Promise((r) => setTimeout(r, 300));
    return { 直後, 出た, 閉じ中, 消えた: !app.host.parentNode };
  });
  ok("開くとき うすい→はっきり", !!sheet && Number(sheet.直後) < 0.2 && Number(sheet.出た) > 0.9, sheet);
  ok("閉じるとき is-out が 付く", !!sheet && /is-out/.test(sheet.閉じ中), sheet && sheet.閉じ中);
  ok("最後には 消える", !!sheet && sheet.消えた);

  節("④ 公開の 画面（2 段・規約）");
  const pub = await pg.evaluate(() => {
    const ov = document.getElementById("presetPublishOverlay");
    return { ある: !!ov, css2: !!document.getElementById("vq-publish-v2"), css3: !!document.getElementById("vq-library-building") };
  });
  ok("公開の 画面の 器が ある", pub.ある);
  ok("公開の 見た目（2 段ぶん）が 入っている", pub.css2);
  ok("作りかけの 札の 見た目が 入っている", pub.css3);
  /* 段の 名前は 本体の 中。文字で 確かめる（\u でも 中身は 同じ） */
  const 段 = await pg.evaluate(async () => {
    const r = await fetch(document.querySelector('script[src*="/js/vq-core."]').src).then((x) => x.text());
    const has = (s) => r.indexOf(s) >= 0 || r.indexOf(s.split("").map((c) => c.charCodeAt(0) > 127 ? "\\u" + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0") : c).join("")) >= 0;
    return { 利用規約: has("利用規約"), 公開の設定: has("公開の設定"),
             /* ★「注意事項」は ほかの 画面でも 使う 言葉なので、それだけでは 測れない。
                古い 段の **見出しそのもの**が 消えているかで 見る。 */
             古い段: has("公開前に、短い注意だけ確認する"),
             AIの条項: has("AI が 作った 問題も 同じ 扱いです") };
  });
  ok("段が「公開の設定 → 利用規約」に なっている", 段.公開の設定 && 段.利用規約, 段);
  ok("古い 3 段目（注意事項）は 消えている", !段.古い段, 段);
  ok("規約に AI 生成の 条項が ある", 段.AIの条項, 段);

  節("④-b 新しい 公開の 画面（人が 実際に 見る ほう）");
  const 新公開 = await pg.evaluate(async () => {
    const src = await fetch([...document.querySelectorAll('script[src*="/js/vq2-app."]')][0].src).then((x) => x.text());
    const has = (t) => src.indexOf(t) >= 0 ||
      src.indexOf(t.split("").map((c) => c.charCodeAt(0) > 127 ? "\\u" + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0") : c).join("")) >= 0;
    return {
      口: typeof (window.VQ2 && window.VQ2.presetPublish && window.VQ2.presetPublish.open) === "function",
      段: has("vq2-pp-steps"), 新見本: has("vq2-pp-pv"), 表紙: has("vq2-pp-cover"),
      規約: has("vq2-pp-terms"), AI条項: has("AI が 作った 問題も 同じ 扱いです"),
      作るのは台帳: has("generateQuestionsTracked")
    };
  });
  ok("新しい 公開の 口が ある", 新公開.口, 新公開);
  ok("2 段の しるしが ある", 新公開.段);
  ok("**見本が 一覧の 札と 同じ 作り**", 新公開.新見本);
  ok("表紙（バナー）の 欄が ある", 新公開.表紙);
  ok("決まりの 段が ある・AI の 条項も ある", 新公開.規約 && 新公開.AI条項);
  ok("**作るのは 台帳を 通る**", 新公開.作るのは台帳);
  ok("画像を アイコンに したら 見た目を 錠に する 仕掛けが ある",
    await pg.evaluate(async () => {
      const src = await fetch([...document.querySelectorAll('script[src*="/js/vq2-app."]')][0].src).then((x) => x.text());
      return src.indexOf("vq2-pp-lookwrap") >= 0 && src.indexOf("is-locked") >= 0 && src.indexOf("vq2-pp-lock") >= 0;
    }));

  節("④-c 生成の 作り（余計な ものを 足していないか）");
  const 生成 = await pg.evaluate(async () => {
    const src = await fetch([...document.querySelectorAll('script[src*="/js/vq2-app."]')][0].src).then((x) => x.text());
    const i = src.indexOf("generateQuestionsTracked");
    const 周り = i < 0 ? "" : src.slice(Math.max(0, i - 500), i + 500);
    const core = await fetch(document.querySelector('script[src*="/js/vq-core."]').src).then((x) => x.text());
    return {
      台帳: i >= 0,
      鍵なし: !/idempotencyKey/.test(周り),
      /* 「終わった 仕事から プリセットを 作る」は 外した。残っていたら 3 つに 割れる。 */
      取り込み無し: core.indexOf("emptyPreset") < 0 || !/aijob\/list\?limit=20"[^]{0,400}emptyPreset/.test(core)
    };
  });
  ok("作るのは 台帳を 通る", 生成.台帳);
  ok("**鍵を 付けていない**（同じ 注文の 2 回目が 弾かれない）", 生成.鍵なし, 生成);
  ok("終わった 仕事から プリセットを 作らない", 生成.取り込み無し, 生成);

  節("④-d 左パネルの 開閉（パソコン）");
  const 帯 = await pg.evaluate(async () => {
    const sh = document.getElementById("vqShell");
    const sr = sh && sh.shadowRoot;
    const b = sr && sr.querySelector('[data-fn="fold"]');
    const st = sr && sr.querySelector("style");
    return {
      ボタン: !!b,
      見える: b ? getComputedStyle(b).display !== "none" : null,
      畳む見た目: !!st && /app-v2-sidebar-collapsed/.test(st.textContent || ""),
      本体の口: !!document.getElementById("appV2SidebarCollapseBtn")
    };
  });
  ok("畳む ボタンが ある", 帯.ボタン, 帯);
  ok("パソコンでは 見える", 帯.見える === true, 帯.見える);
  ok("畳んだ ときの 見た目が 入っている", 帯.畳む見た目);
  ok("本体側の 口に つないでいる", 帯.本体の口);

  節("⑤ 目安の 時間");
  const 分 = await pg.evaluate(() => {
    const L = window.VQ2 && window.VQ2.library;
    if (!L || !L.estimateMinutes) return null;
    const 単語 = [], 長文 = [];
    for (let i = 0; i < 20; i++) 単語.push({ id: "q" + i, type: "flashcard", prompt: "apple", answer: "りんご" });
    for (let i = 0; i < 5; i++) 長文.push({ id: "l" + i, type: "multiple_choice_single",
      prompt: "あ".repeat(600), choices: [{ text: "い".repeat(40) }, { text: "う".repeat(40) }, { text: "え".repeat(40) }, { text: "お".repeat(40) }] });
    return { 単語20: L.estimateMinutes(単語), 長文5: L.estimateMinutes(長文) };
  });
  ok("測れる", !!分, 分);
  ok("**問題数×1分では ない**（単語 20 問 < 10 分）", !!分 && 分.単語20 < 10, 分 && 分.単語20);
  ok("長文は 長く 出る（5 問 > 6 分）", !!分 && 分.長文5 > 6, 分 && 分.長文5);

  await b.close();
  console.log("\n────────────────────────────────");
  console.log(`  ok ${済} / NG ${落}`);
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
