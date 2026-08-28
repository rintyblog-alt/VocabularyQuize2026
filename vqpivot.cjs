/* ══════════════════════════════════════════════════════════════════════════
   vqpivot.cjs — **集計表（ピボット）**が ほんとうに 数えられているかを 見る。

   訴え（2026-08-28）:「Workplace の 高度な 機能を 増やして。
     壊さずに 一つずつ 丁寧に。**機能するかも** 含めて」

   だから ここでは「呼べた」で 終わらせず、**出てきた 数を 検算**する。

   見るところ:
     ① 元の 表は 1 マスも 変わっていない
     ② 合計・平均・件数・最大・最小 が **手で 数えた 値と 一致**する
     ③ 式の 入った マス（=B2*2 など）も 計算した あとの 値で 数える
     ④ 数に ならない マス（「欠席」）は 合計から 外し、**その数を 返す**
     ⑤ 2 つの 列で まとめると 横にも 並ぶ
     ⑥ まとめる列を 渡さないと **何も せずに 断る**

   使い方: VQ_TOKEN=<札> node vqpivot.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const { chromium } = require("playwright");
const BASE = process.env.VQ_BASE || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) {
  console.error("本番では実行しません。"); process.exit(2);
}
const token = process.env.VQ_TOKEN;
if (!token) { console.error("VQ_TOKEN を 渡してください。"); process.exit(2); }

/* 検査で 使う 表（手で 数えた 答えも ここに 書いておく） */
const 表 = [
  ["クラス", "教科", "点", "倍"],
  ["A", "国語", 80, "=C2*2"],
  ["A", "算数", 60, "=C3*2"],
  ["B", "国語", 90, "=C4*2"],
  ["B", "算数", 70, "=C5*2"],
  ["B", "理科", "欠席", ""],
  ["C", "国語", 100, "=C7*2"]
];
/* 手で 数えた 答え */
const 正 = {
  合計: { A: 140, B: 160, C: 100 },
  平均: { A: 70, B: 80, C: 100 },
  件数: { A: 2, B: 3, C: 1 },
  最大: { A: 80, B: 90, C: 100 },
  倍の合計: { A: 280, B: 320, C: 200 }
};

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
    await Promise.resolve(K.ファイル.作る({ kind: "spreadsheet", title: "集計の 検査" }));
    await new Promise((s) => setTimeout(s, 1200));
    /* 表を 入れる */
    const put = K.sheets.セル({ rows: 表, start: "A1" });
    await new Promise((s) => setTimeout(s, 600));

    const 読む = (i) => {
      const b = K.本体(); const sh = b.sheets[i];
      const o = {};
      Object.keys(sh.cells || {}).forEach((k) => { o[k] = sh.cells[k].v; });
      return { 名: sh.name, cells: o };
    };
    const 元前 = JSON.stringify(読む(0).cells);
    if (!Object.keys(読む(0).cells).length) return { 入らない: JSON.stringify(put).slice(0, 300) };

    const r1 = K.sheets.集計({ rows: "A", values: "C", how: "合計" });
    const p合計 = 読む(K.本体().sheets.length - 1);
    const r2 = K.sheets.集計({ rows: "A", values: "C", how: "平均" });
    const p平均 = 読む(K.本体().sheets.length - 1);
    const r3 = K.sheets.集計({ rows: "A", how: "件数" });
    const p件数 = 読む(K.本体().sheets.length - 1);
    const r4 = K.sheets.集計({ rows: "A", values: "C", how: "最大" });
    const p最大 = 読む(K.本体().sheets.length - 1);
    const r5 = K.sheets.集計({ rows: "A", values: "D", how: "合計", to: "倍の合計" });
    const p倍 = 読む(K.本体().sheets.length - 1);
    const r6 = K.sheets.集計({ rows: "A", cols: "B", values: "C", how: "合計", to: "クロス" });
    const pクロス = 読む(K.本体().sheets.length - 1);
    const r7 = K.sheets.集計({ values: "C", how: "合計" });     /* まとめる列 なし */

    const 元後 = JSON.stringify(読む(0).cells);
    return { 元前, 元後, r1, r3, r5, r6, r7,
             p合計, p平均, p件数, p最大, p倍, pクロス,
             枚数: K.本体().sheets.length };
  }, 表);

  console.log("できたシート:", 出.枚数, "枚");
  console.log("合計の表:", JSON.stringify(出.p合計));
  console.log("クロスの表:", JSON.stringify(出.pクロス));
  console.log("倍（式）の表:", JSON.stringify(出.p倍));
  console.log("返り（合計）:", JSON.stringify(出.r1).slice(0, 300));

  見(出.元前 === 出.元後, "① 元の 表は 1 マスも 変わっていない");

  /* 集計表の 読みかた: A 列に まとめ名、B 列に 値。1 行目は 見出し。 */
  const 取 = (p) => {
    const o = {};
    Object.keys(p.cells).forEach((k) => {
      const m = /^([A-Z]+)(\d+)$/.exec(k); if (!m || m[1] !== "A" || m[2] === "1") return;
      o[p.cells[k]] = p.cells["B" + m[2]];
    });
    return o;
  };
  const c合 = 取(出.p合計), c平 = 取(出.p平均), c件 = 取(出.p件数), c最 = 取(出.p最大), c倍 = 取(出.p倍);
  見(JSON.stringify(c合) === JSON.stringify(正.合計), "② 合計が 手の 計算と 一致", { 出: c合, 正: 正.合計 });
  見(JSON.stringify(c平) === JSON.stringify(正.平均), "③ 平均が 一致（欠席は 外して 平均）", { 出: c平, 正: 正.平均 });
  見(JSON.stringify(c件) === JSON.stringify(正.件数), "④ 件数が 一致（欠席の 行も 1 件と 数える）", { 出: c件, 正: 正.件数 });
  見(JSON.stringify(c最) === JSON.stringify(正.最大), "⑤ 最大が 一致", { 出: c最, 正: 正.最大 });
  見(JSON.stringify(c倍) === JSON.stringify(正.倍の合計), "⑥ **式の 入った 列**も 計算後の 値で 数える", { 出: c倍, 正: 正.倍の合計 });
  見(Number(出.r1.数にならず外したマス) === 1, "⑦ 数に ならない マスの 数を 返す", 出.r1.数にならず外したマス);
  const kk = 出.pクロス.cells;
  見(kk.B1 && kk.C1 && kk.D1, "⑧ 2 列で まとめると 横にも 並ぶ", { B1: kk.B1, C1: kk.C1, D1: kk.D1 });
  見(!!(出.r7 && 出.r7.だめ), "⑨ まとめる列が 無ければ 何もせず 断る", 出.r7 && 出.r7.だめ);
  見(例外.length === 0, "⑩ 画面の 例外 0 件", 例外.slice(0, 3));

  await b.close();
  console.log(`\n落ち ${落} 件`);
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error("✗ 途中で 落ちた:", e && e.stack); process.exit(1); });
