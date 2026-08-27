/* ══════════════════════════════════════════════════════════════════════
   ワード：紙の切れ目の確認

   ・どの行も、紙をまたいで出ていないか（紙の外に文字が乗っていないか）
   ・箇条書き・番号付きが長いときも、行ごとに割れているか
   ・ページ数が数と合っているか
   ・全部を選んだとき、紙のすき間まで選ばれていないか

   使い方: node vqwppaper.cjs
   ══════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const http = require("http"); const fs = require("fs"); const path = require("path");
const ROOT = path.join(__dirname, "client"); const PORT = Number(process.env.VQ_PORT || 8969);
const MIME = { ".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",
  ".png":"image/png",".svg":"image/svg+xml",".webmanifest":"application/manifest+json",".woff2":"font/woff2" };
let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => { c ? (pass++, console.log("  ok   " + n))
  : (fail++, bad.push(n), console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 400) : ""))); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function serve() {
  return new Promise((res) => {
    const s = http.createServer((rq, rs) => {
      let p = decodeURIComponent(String(rq.url).split("?")[0]);
      if (p === "/") p = "/index.html";
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); rs.end("x"); return; }
      rs.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
      fs.createReadStream(f).pipe(rs);
    });
    s.listen(PORT, "127.0.0.1", () => res(s));
  });
}

(async () => {
  const server = await serve();
  const browser = await chromium.launch();
  const pg = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errs = [];
  pg.on("pageerror", e => errs.push(String(e.message).slice(0, 180)));

  await pg.goto(`http://127.0.0.1:${PORT}/index.html?vq2=all`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.waitForFunction(() => window.VQ2 && window.VQ2.workplace && window.VQ2.workplace.home, { timeout: 40000 });
  await pg.evaluate(() => { const o = document.getElementById("firstLaunchOverlay"); if (o) o.style.display = "none"; });

  /* 何ページにもなる長い文書を、保存されている形（blocks）で開く。
     AI が書いた資料と同じ構成：見出し・段落・長い番号付き・箇条書き。 */
  await pg.evaluate(() => {
    const W = window.VQ2.workplace;
    const blocks = [];
    const uid = (i) => "b_test_" + i;
    let n = 0;
    blocks.push({ id: uid(n++), type: "heading1", text: "確認テストの資料" });
    for (let s = 0; s < 6; s++) {
      blocks.push({ id: uid(n++), type: "heading2", text: "第 " + (s + 1) + " 節" });
      blocks.push({ id: uid(n++), type: "paragraph",
        text: "この段落は少し長めの文章です。紙の切れ目にかかったとき、途中で切れずに次の紙へ送られるかを見ます。" });
      for (let k = 0; k < 12; k++) {
        blocks.push({ id: uid(n++), type: "number",
          text: "以下の文を、目上の人へ出せるていねいな文体に直してください。「なんか気になるところあったら教えてね！」（" + (k + 1) + "）" });
      }
      for (let k = 0; k < 5; k++) {
        blocks.push({ id: uid(n++), type: "bullet", text: "A. 何か気になるところがあれば、お知らせください。（" + (k + 1) + "）" });
      }
    }
    const item = W.model.newItem("document", { title: "紙の切れ目テスト" });
    const content = W.model.emptyContent("document");
    content.content.blocks = blocks;
    W.docs.open({ item: item, content: content });
  });
  await pg.waitForSelector("#vq-wp-docs", { timeout: 15000 });
  await sleep(2500);

  const geo = await pg.evaluate(() => {
    const sr = document.getElementById("vq-wp-docs").shadowRoot;
    const docEl = sr.querySelector('[data-role="doc"]');
    const sheets = Array.from(sr.querySelectorAll(".wpd-sheet")).map(s => {
      const r = s.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    });
    if (!docEl || !sheets.length) return { none: true };
    /* 文字を持つ行をすべて拾う（箇条書きの中も） */
    const lines = [];
    const walk = (el) => {
      Array.from(el.children).forEach(c => {
        if (/wpd-gap/.test(c.className || "")) return;
        if (c.tagName === "UL" || c.tagName === "OL") { walk(c); return; }
        const t = (c.textContent || "").trim();
        if (!t) return;
        const r = c.getBoundingClientRect();
        if (r.height <= 0) return;
        lines.push({ t: t.slice(0, 26), top: r.top, bottom: r.bottom });
      });
    };
    walk(docEl);
    /* 各行が、どれか 1 枚の紙の中に収まっているか */
    const outside = [];
    lines.forEach(l => {
      const inside = sheets.some(s => l.top >= s.top - 1.5 && l.bottom <= s.bottom + 1.5);
      if (!inside) {
        const near = sheets.map((s, i) => ({ i, top: Math.round(s.top), bottom: Math.round(s.bottom) }))
          .filter(s => l.top < s.bottom && l.bottom > s.top);
        outside.push({ 行: l.t, 上: Math.round(l.top), 下: Math.round(l.bottom), またぐ紙: near });
      }
    });
    const label = (sr.querySelector('[data-role="pgcount"]') || {}).textContent || "";
    return { sheets: sheets.length, lines: lines.length, outside: outside.slice(0, 6),
      outsideCount: outside.length, label: label.trim() };
  });

  console.log("\n══ 紙の切れ目 ══");
  if (geo.none) ok("紙が出ている", false, geo);
  else {
    ok("紙が何枚も出ている", geo.sheets >= 3, geo.sheets);
    ok("行を全部拾えている", geo.lines > 50, geo.lines);
    ok("★どの行も紙からはみ出していない", geo.outsideCount === 0,
      { はみ出した数: geo.outsideCount, 例: geo.outside });
    ok("ページ数の表示が紙の枚数と合う",
      geo.label.indexOf("全 " + geo.sheets + " ページ") >= 0, { 表示: geo.label, 紙: geo.sheets });
  }

  console.log("\n══ 全部を選ぶ ══");
  {
    const r = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      const d = sr.querySelector(".wpd-doc");
      d.focus();
      const rc = (d.firstElementChild || d).getBoundingClientRect();
      return { x: rc.x + 20, y: rc.y + 10 };
    });
    await pg.mouse.click(r.x, r.y); await sleep(200);
    await pg.keyboard.press("Meta+a"); await sleep(300);
    const sel = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      const s = sr.getSelection ? sr.getSelection() : window.getSelection();
      if (!s || !s.rangeCount) return { text: "", rects: 0, gapPicked: 0 };
      const rg = s.getRangeAt(0);
      const gaps = Array.from(sr.querySelectorAll(".wpd-gap"));
      const picked = gaps.filter(g => rg.intersectsNode && rg.intersectsNode(g)).length;
      return { text: String(s.toString()).length, gaps: gaps.length, gapPicked: picked };
    });
    ok("全部を選べる", sel.text > 100, sel);
    ok("紙のすき間は選ばれない（見た目が壊れない）",
      (await pg.evaluate(() => {
        const sr = document.getElementById("vq-wp-docs").shadowRoot;
        const g = sr.querySelector(".wpd-gap");
        return g ? getComputedStyle(g).userSelect : "none";
      })) === "none");
    /* 選んだまま消しても、紙の組み直しが壊れないこと */
    await pg.keyboard.press("Backspace"); await sleep(900);
    const afterDel = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      return { sheets: sr.querySelectorAll(".wpd-sheet").length,
        text: (sr.querySelector(".wpd-doc").textContent || "").trim().length,
        gaps: sr.querySelectorAll(".wpd-gap").length };
    });
    ok("全部消しても紙が 1 枚に戻る", afterDel.sheets === 1 && afterDel.text === 0, afterDel);
  }

  ok("JS エラーが出ていない", errs.length === 0, errs.slice(0, 3));
  console.log("\n  合格 " + pass + " / 不合格 " + fail);
  if (bad.length) console.log("  直すところ:\n    - " + bad.join("\n    - "));
  await browser.close(); server.close();
  process.exit(fail ? 1 : 0);
})();
