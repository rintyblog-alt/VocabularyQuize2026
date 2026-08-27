/* Phase 1：いま資料のどこまでが実際に参照されているかを測る。

   推測で topK を増やさないために、まず数える。
   ・chunk は何個できるか
   ・そのうち何個が選ばれるか
   ・参照されるページ番号／されないページ番号
   ・資料カバー率

   生成は回さない。Context Engine をそのまま呼んで数えるだけ。

   実行: node vqcovermeasure.cjs
*/
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
const JA_PDF = path.join(__dirname, "artifacts", "quick-mock-phase13",
                         "日本史探究 1学期期末考査資料.pdf");

/* PDF の文章はブラウザ（PDF.js）でしか取り出せない。そこだけ借りる。 */
async function extractPdf(file) {
  const browser = await chromium.launch();
  const pg = await browser.newPage();
  await pg.goto(BASE + "/?vqdev=1&cb=" + Date.now(), { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.waitForFunction(() => !!window.__vqChatFiles, { timeout: 30000 });
  const r = await pg.evaluate(async (f) => {
    const F = window.__vqChatFiles;
    const bin = atob(f.b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    await F.add([new File([arr], f.name, { type: "application/pdf" })]);
    for (let i = 0; i < 200; i++) {
      const it = F.list();
      if (it.length && !it.some((x) => x.status === "queued" || x.status === "extracting")) break;
      await new Promise((res) => setTimeout(res, 250));
    }
    const x = F.list()[0];
    return { name: x.name, pageCount: x.pageCount, text: String(x.text || ""),
             pages: (x.pages || []).map((p) => ({ n: p.pageNumber, c: String(p.text || "").length })) };
  }, { name: path.basename(file), b64: fs.readFileSync(file).toString("base64") });
  await browser.close();
  return r;
}

(async () => {
  console.log("══ いまの資料カバー率（生成は回さず数えるだけ）══");
  const { buildContext } = await import("./local-ai/src/context/context-engine.mjs");
  const { chunkAll } = await import("./local-ai/src/context/chunker.mjs");

  const doc = await extractPdf(JA_PDF);
  console.log("  資料: " + doc.name);
  console.log("  ページ数: " + doc.pageCount + " / 本文 " + doc.text.length + " 字");

  const att = [{ id: "a1", name: doc.name, kind: "pdf", fileType: "pdf",
                 extractedText: doc.text, extractedCharacterCount: doc.text.length,
                 pageCount: doc.pageCount }];

  const all = chunkAll(att);
  console.log("\n── 区間 ──");
  console.log("  chunk 総数: " + all.length);
  const allPages = [...new Set(all.map((c) => c.page).filter((p) => p != null))].sort((a, b) => a - b);
  console.log("  chunk が指すページ: " + allPages.join(", "));

  /* 実際の依頼と同じ形で組み立てる（10 問・資料限定） */
  const ctx = await buildContext({
    system: "テスト",
    userMessage: "添付した資料全体から、まんべんなく4択問題を10問作ってください。",
    attachments: att, history: [], maxContextTokens: 12000, sourceOnly: true
  });

  const used = ctx.store.items;
  const usedPages = [...new Set(used.map((e) => e.page).filter((p) => p != null))].sort((a, b) => a - b);
  const missPages = allPages.filter((p) => usedPages.indexOf(p) < 0);

  console.log("\n── 実際に参照される範囲 ──");
  console.log("  evidence 総数     : " + used.length);
  console.log("  選ばれた chunk    : " + used.length + " / " + all.length);
  console.log("  参照されるページ  : " + (usedPages.join(", ") || "なし"));
  console.log("  参照されないページ: " + (missPages.join(", ") || "なし"));
  const rate = allPages.length ? Math.round((usedPages.length / allPages.length) * 100) : 0;
  console.log("  資料カバー率      : " + rate + "%（ページ基準）");
  const crate = all.length ? Math.round((used.length / all.length) * 100) : 0;
  console.log("                      " + crate + "%（区間基準）");

  console.log("\n── 落とした理由（警告として出ているもの）──");
  (ctx.warnings || []).forEach((w) => console.log("  " + w));

  console.log("\n── full-coverage が見る範囲 ──");
  console.log("  coverageChunks: " + (ctx.coverageChunks || []).length + " 区間"
    + "（検索で絞る前。ここを 4 区間ずつ全部見る）");
  const covPages = [...new Set((ctx.coverageChunks || []).map((c) => c.page).filter((p) => p != null))];
  console.log("  そのページ    : " + covPages.sort((a, b) => a - b).join(", "));

  console.log("\n── まとめ ──");
  console.log("  いま      : " + used.length + " / " + all.length + " 区間、"
    + usedPages.length + " / " + allPages.length + " ページ（" + rate + "%）");
  console.log("  full-coverage 後: " + (ctx.coverageChunks || []).length + " / " + all.length
    + " 区間、" + covPages.length + " / " + allPages.length + " ページ（100%）");
})().catch((e) => { console.error(e); process.exit(1); });
