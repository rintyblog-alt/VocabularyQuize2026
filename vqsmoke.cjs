/* 出したものを ブラウザで 1 回開いて、赤い字と 取り逃しが 無いかだけ見る。 */
const { chromium } = require("playwright");
const 先 = process.argv[2] || "";
if (!/-dev\.|127\.0\.0\.1|localhost|vocabuquiz\.app/.test(先)) { console.error("行き先を指定してください"); process.exit(2); }
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 430, height: 932 } });
  const page = await ctx.newPage();
  const 赤 = [], 失 = [];
  page.on("pageerror", (e) => 赤.push(String(e && e.message).slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) 赤.push(m.text().slice(0, 200)); });
  page.on("response", (r) => { if (r.status() >= 400 && !/\/api\//.test(r.url())) 失.push(r.status() + " " + r.url().slice(0, 110)); });
  const t0 = Date.now();
  await page.goto(先, { waitUntil: "load", timeout: 120000 });
  await page.waitForTimeout(6000);
  const d = await page.evaluate(() => {
    let 網 = 0, 溜 = 0;
    for (const e of performance.getEntriesByType("resource")) {
      if ((e.transferSize || 0) === 0 && (e.decodedBodySize || 0) > 0) 溜 += e.decodedBodySize; else 網 += e.transferSize || 0;
    }
    const sp = document.getElementById("authBootSplash");
    return { VQ2: typeof window.VQ2, live: typeof window.__vqLive, 札: typeof window.__vqBootHold,
             要素: document.querySelectorAll("*").length, 網, 溜,
             起動の枚: sp ? (sp.classList.contains("hidden") ? "しまわれた" : "出ている") : "無い",
             読める: (document.body.innerText || "").replace(/\s+/g, " ").trim().slice(0, 120) };
  });
  console.log("  " + 先);
  console.log("  読み終わり " + (Date.now() - t0) + "ms / 要素 " + d.要素 + " / VQ2=" + d.VQ2 + " __vqLive=" + d.live + " 札=" + d.札);
  console.log("  網から " + (d.網 / 1048576).toFixed(2) + "MB / 溜めから " + (d.溜 / 1048576).toFixed(2) + "MB / 起動の1枚: " + d.起動の枚);
  console.log("  画面の字: " + d.読める);
  console.log("  赤い字 " + 赤.length + " / 取り逃し " + 失.length);
  赤.slice(0, 5).forEach((x) => console.log("    ! " + x));
  失.slice(0, 5).forEach((x) => console.log("    ! " + x));
  await b.close();
  process.exit(赤.length || 失.length ? 1 : 0);
})();
