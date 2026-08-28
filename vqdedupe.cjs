/* ══════════════════════════════════════════════════════════════════════════
   vqdedupe.cjs — **重なりの 始末**が ほんとうに 効くかを 実物で 見る。

   訴え（2026-08-28）:「Workplace の 高度な 機能を 増やして。
     壊さずに 一つずつ 丁寧に。**機能するかも** 含めて」

   見るところ:
     ① 「見つける」は **1 マスも 消さない**
     ② 大文字小文字・全半角・前後の 空白の ちがいは 同じ ものと 見る
     ③ 空の マスは 重複と 見なさない
     ④ 「消す」は **いちばん上を 残す**（あとから 入れた ほうを 消す）
     ⑤ 消したあと 行が 詰まる（すき間が 空かない）／ほかの 列も ついてくる
     ⑥ 巻き戻せる（undoLast）

   使い方: VQ_TOKEN=<札> node vqdedupe.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const { chromium } = require("playwright");
const BASE = process.env.VQ_BASE || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) {
  console.error("本番では実行しません。"); process.exit(2);
}
const token = process.env.VQ_TOKEN;
if (!token) { console.error("VQ_TOKEN を 渡してください。"); process.exit(2); }

/* 1 行目は 見出し。A 列で 重なりを 見る。 */
const 表 = [
  ["単語", "意味"],
  ["apple", "りんご"],
  ["Apple", "リンゴ"],        /* 大文字ちがい → 重なり */
  ["banana", "バナナ"],
  ["  apple  ", "アップル"],  /* 空白ちがい → 重なり */
  ["", "空っぽ"],             /* 空は 重複と 見なさない */
  ["ｂanana", "ばなな"],       /* 全角ちがい → 重なり */
  ["cherry", "さくらんぼ"]
];
/* 残るのは: 見出し / apple / banana / （空）/ cherry = 5 行 */

(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const 例外 = [];
  page.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 160)));
  await page.addInitScript((tk) => {
    try { localStorage.setItem("app.auth.token.v1", tk); localStorage.setItem("app.auth.mode.v1", "user"); } catch (e) {}
  }, token);
  await page.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.VQ2 && window.VQ2.workplace && window.VQ2.workplace.cmd, null, { timeout: 60000 });
  await page.waitForTimeout(2500);

  let 落 = 0;
  const 見 = (ok, 名, 追) => { console.log((ok ? "✓ " : "✗ ") + 名 + (追 !== undefined ? " → " + JSON.stringify(追).slice(0, 260) : "")); if (!ok) 落++; };

  const 出 = await page.evaluate(async (表) => {
    const K = window.VQ2.workplace.cmd;
    await Promise.resolve(K.ファイル.作る({ kind: "spreadsheet", title: "重なりの 検査" }));
    await new Promise((s) => setTimeout(s, 1200));
    K.sheets.セル({ rows: 表, start: "A1" });
    await new Promise((s) => setTimeout(s, 500));
    const 読 = () => {
      const sh = K.本体().sheets[0];
      const o = {};
      Object.keys(sh.cells || {}).forEach((k) => { o[k] = sh.cells[k].v; });
      return o;
    };
    const 前 = 読();
    const 見 = K.sheets.重複({ op: "見つける", column: "A" });
    const 見たあと = 読();
    const 消 = K.sheets.重複({ op: "消す", column: "A" });
    await new Promise((s) => setTimeout(s, 400));
    const 後 = 読();
    const 巻 = K.巻き戻す({});
    await new Promise((s) => setTimeout(s, 400));
    const 戻 = 読();
    return { 前, 見, 見たあと, 消, 後, 巻: JSON.stringify(巻).slice(0, 160), 戻 };
  }, 表);

  console.log("見つけた:", JSON.stringify({ 重なり: 出.見.重なり, 中身: 出.見.中身 }));
  console.log("消したあと:", JSON.stringify(出.後));

  見(JSON.stringify(出.前) === JSON.stringify(出.見たあと), "① 「見つける」は 1 マスも 消さない");
  見(出.見.重なり === 3, "② 大文字・全角・空白の ちがいは 同じ ものと 見る（重なり " + 出.見.重なり + "）", 出.見.中身);
  見(!(出.見.中身 || []).some((x) => /^6 行目/.test(x)), "③ 空の マスは 重複と 見なさない", 出.見.中身);
  見(出.後.A2 === "apple" && 出.後.A3 === "banana",
     "④ いちばん上を 残す（apple / banana）", { A2: 出.後.A2, A3: 出.後.A3 });
  見(出.後.A5 === "cherry" && !出.後.A6 && !出.後.A7,
     "⑤ 行が 詰まる（cherry が 5 行目・6 行目 以降は 空）",
     { A4: 出.後.A4, A5: 出.後.A5, A6: 出.後.A6 });
  見(出.後.B2 === "りんご" && 出.後.B5 === "さくらんぼ",
     "⑤ ほかの 列も ついてくる", { B2: 出.後.B2, B5: 出.後.B5 });
  見(JSON.stringify(出.戻) === JSON.stringify(出.前), "⑥ 巻き戻せる", 出.巻);
  見(例外.length === 0, "⑦ 画面の 例外 0 件", 例外.slice(0, 3));

  await b.close();
  console.log(`\n落ち ${落} 件`);
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error("✗ 途中で 落ちた:", e && e.stack); process.exit(1); });
