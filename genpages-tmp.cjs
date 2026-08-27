const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const OUT = "/private/tmp/claude-501/-Users-user-Downloads-word-practice-v26-menu-terms-report-emailjs/ea86a79f-1ff2-4347-9303-995fcdd2a12d/scratchpad/pages";
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage();
  await pg.goto("http://127.0.0.1:8791/?vqdev=1", { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.waitForFunction(() => !!window.__vqChatFiles, { timeout: 30000 });
  const imgs = await pg.evaluate(async (b64) => {
    const F = window.__vqChatFiles;
    const bin = atob(b64); const a = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    await F.add([new File([a], "biomimetics.pdf", { type: "application/pdf" })]);
    for (let i = 0; i < 400; i++) {
      const it = F.list();
      if (it.length && !it.some((x) => x.status === "queued" || x.status === "extracting")) break;
      await new Promise((r) => setTimeout(r, 300));
    }
    return (F.list()[0].pageImages || []).map((p) => ({ n: p.pageNumber, d: p.dataUrl }));
  }, fs.readFileSync("/Users/user/Downloads/biomimetics.pdf").toString("base64"));
  imgs.forEach((p) => {
    const c = p.d.indexOf(","); 
    fs.writeFileSync(path.join(OUT, "p" + String(p.n).padStart(2,"0") + ".png"),
      Buffer.from(p.d.slice(c + 1), "base64"));
  });
  console.log("ページ画像 " + imgs.length + " 枚 → " + OUT);
  await b.close();
})();
