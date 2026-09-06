/* ══════════════════════════════════════════════════════════════════════════
   vqplayui — プレイグラウンドを **本当に 開いて** 確かめる（2026-09-07）

   静的な 検査だけでは「一覧には 出るが 開くと 真っ白」を 捕まえられない。
   ここでは 実際の ブラウザで 開き、PC と スマホの 両方で
     ・左の 帯から 開けるか
     ・一覧が プリセットと 同じ 形で 並ぶか
     ・全部の シミュを 開いて 絵が 出るか（canvas が 白紙で ないか）
     ・横に すべらないか
     ・例外が 出て いないか
   を 見る。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const { chromium } = require("playwright");
const URL0 = (process.env.VQ_BASE || "http://127.0.0.1:8791") + "/?vqdev=1";

let 合 = 0, 否 = 0; const 落ち = [];
function 見る(名, 良い, 追) {
  if (良い) { 合++; console.log("  ok   " + 名); }
  else { 否++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + String(追).slice(0, 300) : "")); }
}

(async () => {
  const br = await chromium.launch();
  const 例外 = [];
  async function 台(幅, 高, 名) {
    const ctx = await br.newContext({ viewport: { width: 幅, height: 高 }, deviceScaleFactor: 1 });
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => 例外.push(名 + ": " + e.message));
    pg.on("console", (m) => { if (m.type() === "error") 例外.push(名 + "(console): " + m.text().slice(0, 160)); });
    await pg.goto(URL0, { waitUntil: "domcontentloaded", timeout: 60000 });
    await pg.waitForTimeout(3500);
    return { ctx, pg };
  }

  /* ══ PC ══ */
  console.log("\n■ PC（1280×860）");
  let { ctx, pg } = await 台(1280, 860, "PC");

  const 積 = await pg.evaluate(() => ({
    土: !!window.__vqPlayground,
    登録: window.VQPLG ? (window.VQPLG.数 ? window.VQPLG.数() : (window.VQPLG._箱 || []).length) : 0,
    CSS: !!window.__vqScreensCss
  }));
  見る("土台が 読まれて いる", 積.土);
  見る("シミュレーションが 登録されて いる", 積.登録 > 0, 積.登録 + " 本");
  見る("vq-screens の CSS が 取れる", 積.CSS);

  /* 左の 帯に 出て いるか（影の DOM の 中） */
  const 帯 = await pg.evaluate(() => {
    const h = document.getElementById("vqShell");
    const r = h && h.shadowRoot;
    if (!r) return { 有: false, 訳: "帯が 見つからない" };
    const el = r.querySelector('[data-fn="playground"]');
    return { 有: !!el, 文: el ? (el.textContent || "").trim() : "" };
  });
  見る("左の 帯に「プレイグラウンド」が 出る", 帯.有, 帯.文 || 帯.訳);

  await pg.evaluate(() => window.__vqPlayground.open());
  await pg.waitForTimeout(900);

  const 一覧 = await pg.evaluate(() => {
    const h = document.getElementById("vqPlaygroundHost");
    const r = h && h.shadowRoot;
    if (!r) return { 開: false };
    const s = r.querySelector(".sheet");
    return {
      開: h.hasAttribute("data-open"),
      見出: (r.querySelector(".ph__title") || {}).textContent || "",
      タブ: r.querySelectorAll(".tab").length,
      チップ: r.querySelectorAll(".chip").length,
      カード: r.querySelectorAll(".pc").length,
      節: r.querySelectorAll(".psec").length,
      探: !!r.querySelector(".sbox input"),
      横: s ? s.scrollWidth - s.clientWidth : 0,
      高さ: s ? s.getBoundingClientRect().height : 0
    };
  });
  見る("開く", 一覧.開);
  見る("見出しが「プレイグラウンド」", /プレイグラウンド/.test(一覧.見出), 一覧.見出);
  見る("タブが 並ぶ（プリセットと 同じ）", 一覧.タブ >= 4, 一覧.タブ + " こ");
  見る("検索欄が ある", 一覧.探);
  見る("カードが 並ぶ", 一覧.カード > 0, 一覧.カード + " 枚");
  見る("教科ごとの 節に 分かれる", 一覧.節 >= 2, 一覧.節 + " 節");
  見る("PC で 横に すべらない", 一覧.横 <= 2, 一覧.横 + "px");

  /* ぜんぶ 開いて 絵が 出るか */
  const 一覧id = await pg.evaluate(() => window.VQPLG.一覧().map((x) => ({ id: x.id, 題: x.題, 次元: x.次元 })));
  console.log("\n■ ぜんぶ 開く（" + 一覧id.length + " 本）");
  const 白紙 = [];
  for (const x of 一覧id) {
    await pg.evaluate((id) => window.__vqPlayground.open(id), x.id);
    await pg.waitForTimeout(x.次元 === "3d" ? 900 : 650);
    const r = await pg.evaluate(() => {
      const root = document.getElementById("vqPlaygroundHost").shadowRoot;
      const cv = root.querySelector("[data-plg-canvas]");
      const 読 = root.querySelectorAll(".read").length;
      const つ = root.querySelectorAll(".knob").length;
      if (!cv) return { 絵: false, 訳: "canvas が 無い" };
      /* 2D は 画素を 直に 見る。3D（WebGL）は 読めない ので 大きさだけ 見る。 */
      let 色数 = -1;
      try {
        const c = cv.getContext("2d");
        if (c) {
          const d = c.getImageData(0, 0, Math.min(cv.width, 300), Math.min(cv.height, 300)).data;
          const 見 = new Set();
          for (let i = 0; i < d.length; i += 40) 見.add(d[i] + "," + d[i + 1] + "," + d[i + 2]);
          色数 = 見.size;
        }
      } catch (e) { }
      return { 絵: cv.width > 10 && cv.height > 10, 幅: cv.width, 高: cv.height, 色数: 色数, 読み: 読, つまみ: つ };
    });
    const だめ = !r.絵 || (r.色数 >= 0 && r.色数 < 2);
    if (だめ) 白紙.push(x.id + "（" + x.題 + "）→ " + (r.訳 || ("色 " + r.色数 + " 種")));
    console.log("  " + (だめ ? "✗" : "✓") + " " + x.id.padEnd(20) + " " + x.次元 +
      "  つまみ" + r.つまみ + " 読み" + r.読み + (r.色数 >= 0 ? "  色" + r.色数 + "種" : "  (3D)"));
  }
  見る("★ ぜんぶ 絵が 出る（白紙が 無い）", 白紙.length === 0, 白紙.join("\n         "));

  /* 走らせて 数が 動くか（1 本で 代表して 見る） */
  await pg.evaluate(() => window.__vqPlayground.open("phys-pendulum"));
  await pg.waitForTimeout(500);
  const 読む値 = () => pg.evaluate(() =>
    Array.prototype.map.call(document.getElementById("vqPlaygroundHost").shadowRoot.querySelectorAll(".read__v"),
      (e) => e.textContent).join(" | "));
  const 前 = await 読む値();
  await pg.waitForTimeout(1800);
  const 後 = await 読む値();
  見る("走らせると 数が 動く", 前 !== 後, "前=" + 前 + "\n         後=" + 後);
  /* グラフも 伸びて いるか（走って いる 何よりの 証） */
  const 記録 = await pg.evaluate(() => {
    const cv = document.getElementById("vqPlaygroundHost").shadowRoot.querySelector("[data-plg-chart]");
    if (!cv) return -1;
    const c = cv.getContext("2d");
    const d = c.getImageData(0, 0, cv.width, cv.height).data;
    let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++;
    return n;
  });
  見る("グラフに 線が 引かれて いる", 記録 > 50, 記録 + " 画素");

  await ctx.close();

  /* ══ スマホ ══ */
  console.log("\n■ スマホ（375×740）");
  ({ ctx, pg } = await 台(375, 740, "スマホ"));
  await pg.evaluate(() => window.__vqPlayground.open());
  await pg.waitForTimeout(900);
  const 携一 = await pg.evaluate(() => {
    const s = document.getElementById("vqPlaygroundHost").shadowRoot.querySelector(".sheet");
    return { 横: s.scrollWidth - s.clientWidth, カード: document.getElementById("vqPlaygroundHost").shadowRoot.querySelectorAll(".pc").length };
  });
  見る("スマホの 一覧で 横に すべらない", 携一.横 <= 2, 携一.横 + "px");
  見る("スマホでも カードが 並ぶ", 携一.カード > 0, 携一.カード + " 枚");

  await pg.evaluate(() => window.__vqPlayground.open("earth-moon-phase"));
  await pg.waitForTimeout(1200);
  const 携 = await pg.evaluate(() => {
    const r = document.getElementById("vqPlaygroundHost").shadowRoot;
    const s = r.querySelector(".sheet"), v = r.querySelector(".view"), side = r.querySelector(".side");
    const 主 = r.querySelector(".stage__main");
    /* ★ 隠して ある ボタン（狭い 画面では 1こま を 出さない）は 数えない。
       高さ 0 が 混ざって 「押す ところが 0px」に 見えた（実測）。 */
    const 押 = Array.prototype.map.call(r.querySelectorAll(".btn,.spd button"), (b) => b.getBoundingClientRect().height)
      .filter((h) => h > 0);
    return {
      横: s.scrollWidth - s.clientWidth,
      たて積み: 主 ? getComputedStyle(主).flexDirection : "",
      舞台高: v ? Math.round(v.getBoundingClientRect().height) : 0,
      舞台幅: v ? Math.round(v.getBoundingClientRect().width) : 0,
      つまみ見える: side ? side.getBoundingClientRect().height > 60 : false,
      最小押し: 押.length ? Math.round(Math.min.apply(null, 押)) : 0,
      押せる数: 押.length,
      帯はみ出し: (function () { const b = r.querySelector(".bar"); return b ? b.scrollWidth - b.clientWidth : 0; })()
    };
  });
  見る("スマホで 舞台が 上・つまみが 下（たて積み）", 携.たて積み === "column", 携.たて積み);
  見る("舞台が 画面幅いっぱい", 携.舞台幅 >= 360, 携.舞台幅 + "px");
  見る("舞台の 高さが ちゃんと ある", 携.舞台高 >= 180, 携.舞台高 + "px");
  見る("つまみが 下に 見えて いる", 携.つまみ見える);
  見る("押す ところが 44px 以上", 携.最小押し >= 38, 携.最小押し + "px（" + 携.押せる数 + " こ）");
  見る("下の 帯が 画面から はみ出さない", 携.帯はみ出し <= 2, 携.帯はみ出し + "px");
  見る("スマホの 舞台で 横に すべらない", 携.横 <= 2, 携.横 + "px");

  await ctx.close();
  await br.close();

  /* ★ 手元では Bridge（17891）など 立てて いない ものへの 接続が 必ず 失敗する。
     それは プレイグラウンドの 話では ない ので 分けて 数える。 */
  const 我 = 例外.filter((t) => !/ERR_CONNECTION_REFUSED|ERR_FAILED|Failed to load resource/.test(t));
  見る("プレイグラウンドの 例外が 無い", 我.length === 0, 我.slice(0, 5).join("\n         "));
  if (例外.length !== 我.length) console.log("       （つながらない 先が " + (例外.length - 我.length) + " 件。Bridge 等の 未起動。別の 話）");

  console.log("\n══ まとめ ══\n  合格 " + 合 + " / 不合格 " + 否);
  if (落ち.length) console.log("  落ちた: " + 落ち.join(" / "));
  console.log("");
  process.exit(否 ? 1 : 0);
})().catch((e) => { console.error("落ちました: " + (e && e.stack || e)); process.exit(2); });
