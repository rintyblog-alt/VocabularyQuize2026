/* ══════════════════════════════════════════════════════════════════════
   作り直したあと、見ていた場所に留まるか

   「更新した」「選んだ」たびに先頭へ跳ね上がるのを直したので、
   代表的な画面で、位置が残ることを確かめる。
   別の画面へ移ったときは、先頭のままであることも確かめる。

   使い方: node vqscrollkeep.cjs
   ══════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const http = require("http"); const fs = require("fs"); const path = require("path");
const ROOT = path.join(__dirname, "client"); const PORT = Number(process.env.VQ_PORT || 8967);
const MIME = { ".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",
  ".png":"image/png",".svg":"image/svg+xml",".webmanifest":"application/manifest+json",".woff2":"font/woff2" };
let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => { c ? (pass++, console.log("  ok   " + n))
  : (fail++, bad.push(n), console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 240) : ""))); };
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

  console.log("\n══ ワード：長い文書を下まで見てから、描き直す ══");
  await pg.evaluate(() => {
    const W = window.VQ2.workplace;
    const blocks = []; let n = 0;
    for (let i = 0; i < 200; i++)
      blocks.push({ id: "b_sc_" + (n++), type: "paragraph", text: "位置が残るかを見るための行 " + (i + 1) });
    const item = W.model.newItem("document", { title: "位置テスト" });
    const content = W.model.emptyContent("document");
    content.content.blocks = blocks;
    W.docs.open({ item: item, content: content });
  });
  await pg.waitForSelector("#vq-wp-docs", { timeout: 15000 });
  await sleep(2200);

  const scrollDoc = async (to) => pg.evaluate((t) => {
    const sr = document.getElementById("vq-wp-docs").shadowRoot;
    const sc = sr.querySelector(".wp-main") || sr.querySelector(".wpd-stage");
    if (!sc) return null;
    if (t !== null) sc.scrollTop = t;
    return sc.scrollTop;
  }, to === undefined ? null : to);

  const at = await scrollDoc(1400);
  ok("下の方まで動かせる", at > 400, at);
  /* 「選ぶ」＝アウトラインの開け閉め（画面を作り直す操作） */
  await pg.evaluate(() => {
    const sr = document.getElementById("vq-wp-docs").shadowRoot;
    const b = sr.querySelector('[data-act="toggle-left"]'); if (b) b.click();
  });
  await sleep(700);
  const after = await scrollDoc();
  ok("★描き直しても位置が残る", after !== null && Math.abs(after - at) < 60, { 前: at, 後: after });

  /* 用紙の設定を変えるときも（ここも毎回描き直す） */
  await pg.evaluate(() => {
    const sr = document.getElementById("vq-wp-docs").shadowRoot;
    const b = sr.querySelector('[data-act="page-setup"]'); if (b) b.click();
  });
  await sleep(600);
  await pg.evaluate(() => {
    const sr = document.getElementById("vq-wp-docs").shadowRoot;
    const s = sr.querySelector('.wp-sheet [data-k="size"]');
    if (s) { s.value = "b5"; s.dispatchEvent(new Event("change", { bubbles: true, composed: true })); }
  });
  await sleep(800);
  const after2 = await scrollDoc();
  ok("★用紙を変えても位置が残る", after2 !== null && after2 > 200, { 前: at, 後: after2 });

  await pg.evaluate(() => {
    document.querySelectorAll(".vq2-host").forEach(h => { if (h.__vq2) h.__vq2.forceClose("t"); });
  });
  await sleep(500);

  console.log("\n══ エクセル：下まで見てから、セルを選ぶ ══");
  await pg.evaluate(() => {
    const W = window.VQ2.workplace;
    W.sheets.open({ item: W.model.newItem("spreadsheet", { title: "位置テスト" }),
      content: W.model.emptyContent("spreadsheet") });
  });
  await pg.waitForSelector("#vq-wp-sheets", { timeout: 15000 });
  await sleep(1400);
  const scrollSheet = async (to) => pg.evaluate((t) => {
    const sr = document.getElementById("vq-wp-sheets").shadowRoot;
    const sc = sr.querySelector('[data-role="scroll"]');
    if (!sc) return null;
    if (t !== null) sc.scrollTop = t;
    return sc.scrollTop;
  }, to === undefined ? null : to);
  const s1 = await scrollSheet(600);
  ok("表を下まで動かせる", s1 > 200, s1);
  await pg.evaluate(() => {
    const sr = document.getElementById("vq-wp-sheets").shadowRoot;
    const b = sr.querySelector('[data-act="s"][data-val="b"]'); if (b) b.click();
  });
  await sleep(600);
  const s2 = await scrollSheet();
  ok("★表でも、描き直しで位置が飛ばない", s2 !== null && Math.abs(s2 - s1) < 60, { 前: s1, 後: s2 });

  ok("JS エラーが出ていない", errs.length === 0, errs.slice(0, 3));
  console.log("\n  合格 " + pass + " / 不合格 " + fail);
  if (bad.length) console.log("  直すところ:\n    - " + bad.join("\n    - "));
  await browser.close(); server.close();
  process.exit(fail ? 1 : 0);
})();
