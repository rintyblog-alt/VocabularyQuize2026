/* ══════════════════════════════════════════════════════════════════════════
   vqsheetrule.cjs — **入力規則**が ほんとうに 効くかを 実物で 見る。

   訴え（2026-08-28）:「Workplace の 高度な 機能を 増やして。
     壊さずに 一つずつ 丁寧に。**機能するかも** 含めて」

   見るところ:
     ① 規則を 置ける（一覧・数の 範囲）
     ② すでに 入っている 合わない マスを **数えて 返す**（勝手に 直さない）
     ③ 合わない マスに **赤い 印**が 付く（画面で 実際に 出ている）
     ④ **式の マスは 見ない**（計算の 結果を 打ち間違い扱いしない）
     ⑤ strict なら **打っても 入らない**（1 マスも 変わらない）
     ⑥ strict でなければ 入るが 印が 付く
     ⑦ 規則を 消せる

   使い方: VQ_TOKEN=<札> node vqsheetrule.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const { chromium } = require("playwright");
const BASE = process.env.VQ_BASE || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) {
  console.error("本番では実行しません。"); process.exit(2);
}
const token = process.env.VQ_TOKEN;
if (!token) { console.error("VQ_TOKEN を 渡してください。"); process.exit(2); }

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
  const 見 = (ok, 名, 追) => { console.log((ok ? "✓ " : "✗ ") + 名 + (追 !== undefined ? " → " + JSON.stringify(追).slice(0, 240) : "")); if (!ok) 落++; };

  const 出 = await page.evaluate(async () => {
    const K = window.VQ2.workplace.cmd;
    await Promise.resolve(K.ファイル.作る({ kind: "spreadsheet", title: "入力規則の 検査" }));
    await new Promise((s) => setTimeout(s, 1200));
    K.sheets.セル({ rows: [
      ["名前", "できた", "点", "倍"],
      ["あ", "○", 80, "=C2*2"],
      ["い", "△", 120, "=C3*2"],     /* △ は 一覧に 無い ／ 120 は 上限超え */
      ["う", "×", 50, "=C4*2"]
    ], start: "A1" });
    await new Promise((s) => setTimeout(s, 500));

    const r1 = K.sheets.規則({ op: "足す", range: "B2:B50", kind: "list", list: ["○", "×"], strict: true });
    const r2 = K.sheets.規則({ op: "足す", range: "C2:C50", kind: "number", min: 0, max: 100, strict: true });
    /* 式の 列にも かけてみる（見ないはず） */
    const r3 = K.sheets.規則({ op: "足す", range: "D2:D50", kind: "number", min: 0, max: 10, strict: false });
    const 一覧 = K.sheets.規則({ op: "一覧" });
    return { r1: r1, r2: r2, r3: r3, 一覧: 一覧,
             規則数: (K.本体().sheets[0].rules || []).length };
  });
  console.log("規則:", JSON.stringify(出.一覧));
  console.log("B 列（一覧）:", JSON.stringify(出.r1.いま合わないマス), " C 列（数）:", JSON.stringify(出.r2.いま合わないマス));
  console.log("D 列（式）:", JSON.stringify(出.r3.いま合わないマス));

  見(出.規則数 === 3, "① 規則を 3 つ 置けた", 出.規則数);
  見(JSON.stringify(出.r1.いま合わないマス) === JSON.stringify(["B3=△"]), "② 一覧に 無い マスを 数える", 出.r1.いま合わないマス);
  見(JSON.stringify(出.r2.いま合わないマス) === JSON.stringify(["C3=120"]), "③ 範囲を 外れた マスを 数える", 出.r2.いま合わないマス);
  見(出.r3.いま合わないマス === "なし", "④ **式の マスは 見ない**（160/240/100 でも 0 件）", 出.r3.いま合わないマス);

  /* 画面の 赤い 印 */
  const 印 = await page.evaluate(() => {
    const sh = document.getElementById("vq-wp-sheets").shadowRoot;
    const bad = Array.from(sh.querySelectorAll(".wps-c.is-bad"))
      .map((e) => e.getAttribute("data-r") + "/" + e.getAttribute("data-c") + " " + (e.getAttribute("title") || "").slice(0, 24));
    const list = sh.querySelectorAll(".wps-c.has-list").length;
    return { bad: bad, list: list };
  });
  console.log("画面の 印:", JSON.stringify(印));
  見(印.bad.length === 2, "⑤ 画面で 赤い 印が 2 マス（B3 と C3）", 印.bad);
  見(印.list > 0, "⑥ 一覧の マスに ▾ が 出る（" + 印.list + " マス）");

  /* strict の 打ち込み。**画面の commit を そのまま 通す**。
     in-page の el.click() では 選びが 動かない（mousedown を 見ているため）。
     Playwright の 本物の クリックで 選んでから 打つ。 */
  await page.click('.wps-c[data-r="4"][data-c="1"]');
  await page.waitForTimeout(400);
  const 打 = await page.evaluate(async () => {
    const sh = document.getElementById("vq-wp-sheets").shadowRoot;
    const 前 = JSON.stringify(window.VQ2.workplace.cmd.本体().sheets[0].cells);
    const g = sh.querySelector(".wps-ghost");
    let 打てた = false, どこ = "";
    if (g) {
      g.focus(); g.value = "◎";
      g.dispatchEvent(new Event("input", { bubbles: true }));
      g.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      打てた = true;
    }
    await new Promise((s) => setTimeout(s, 500));
    const 後 = JSON.stringify(window.VQ2.workplace.cmd.本体().sheets[0].cells);
    const a = JSON.parse(前), b2 = JSON.parse(後);
    const 差 = [];
    Object.keys(Object.assign({}, a, b2)).forEach((k) => {
      const x = JSON.stringify(a[k]), y = JSON.stringify(b2[k]);
      if (x !== y) 差.push(k + ": " + x + " → " + y);
    });
    return { 打てた: 打てた, 変わった: 前 !== 後, 差: 差 };
  });
  console.log("打ち込み:", JSON.stringify(打));
  見(打.打てた ? !打.変わった : true,
     打.打てた ? "⑦ strict の マスに 合わない 値は **入らない**" : "⑦ （入力欄を つかめず 見送り）", 打);

  /* ★ **ふつうの 打ち込みが 壊れていない**ことを 必ず 見る（2026-08-29）。
     規則の 見張りを commit の 先頭に 置いたので、ここを 見ないと
     「合う 値まで 入らない」に なっていても 気づけない。 */
  /* 入力欄（ghost）が 上に あって クリックが 通らないので、鍵盤で 動かす。 */
  await page.keyboard.press("ArrowDown");   /* B4 → B5（規則の 範囲の 中） */
  await page.waitForTimeout(400);
  const 良 = await page.evaluate(async () => {
    const sh = document.getElementById("vq-wp-sheets").shadowRoot;
    const 写 = () => JSON.parse(JSON.stringify(window.VQ2.workplace.cmd.本体().sheets[0].cells));
    const 前 = 写();
    const g = sh.querySelector(".wps-ghost");
    if (!g) return { 打てた: false };
    g.focus(); g.value = "○";
    g.dispatchEvent(new Event("input", { bubbles: true }));
    g.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await new Promise((s) => setTimeout(s, 500));
    const 後 = 写();
    const 差 = [];
    Object.keys(Object.assign({}, 前, 後)).forEach((k) => {
      const a = JSON.stringify(前[k]), b2 = JSON.stringify(後[k]);
      if (a !== b2) 差.push(k + ": " + a + " → " + b2);
    });
    return { 打てた: true, 差: 差 };
  });
  見(良.打てた ? (良.差 || []).length === 1 && /"v":"○"/.test((良.差 || [])[0] || "") : true,
     良.打てた ? "⑦-b 規則に **合う** 値は ふつうに 入る（" + (良.差 || []).join(" / ") + "）"
               : "⑦-b （入力欄を つかめず 見送り）", 良);

  await page.keyboard.press("ArrowDown");
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");  /* B6 → E6 */
  await page.waitForTimeout(400);
  const 外 = await page.evaluate(async () => {
    const sh = document.getElementById("vq-wp-sheets").shadowRoot;
    const g = sh.querySelector(".wps-ghost");
    if (!g) return { 打てた: false };
    g.focus(); g.value = "なんでも";
    g.dispatchEvent(new Event("input", { bubbles: true }));
    g.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await new Promise((s) => setTimeout(s, 500));
    const c = window.VQ2.workplace.cmd.本体().sheets[0].cells;
    return { 打てた: true, E6: c.E6 ? c.E6.v : null,
             どこ: Object.keys(c).filter((k) => c[k] && c[k].v === "なんでも") };
  });
  見(外.打てた ? (外.どこ || []).length === 1 : true,
     外.打てた ? "⑦-c 規則の 外の マスも ふつうに 入る（" + (外.どこ || []).join(",") + "）"
               : "⑦-c （入力欄を つかめず 見送り）", 外);

  /* 消す */
  const 消 = await page.evaluate(() => {
    const K = window.VQ2.workplace.cmd;
    const r = K.sheets.規則({ op: "消す", number: 1 });
    return { r: r, 数: (K.本体().sheets[0].rules || []).length };
  });
  見(消.数 === 2, "⑧ 規則を 消せる（3 → " + 消.数 + "）", 消.数);
  見(例外.length === 0, "⑨ 画面の 例外 0 件", 例外.slice(0, 3));

  await page.evaluate(() => {
    Array.from(document.querySelectorAll("body > *")).forEach((h) => {
      const t = (h.shadowRoot ? h.shadowRoot.textContent : h.textContent) || "";
      if (/はじめかた|声で話しかけてみよう|もう出さない/.test(t)) h.remove();
    });
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: (process.env.SP || ".") + "/sheet-rule.png" });
  await b.close();
  console.log(`\n落ち ${落} 件`);
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error("✗ 途中で 落ちた:", e && e.stack); process.exit(1); });
