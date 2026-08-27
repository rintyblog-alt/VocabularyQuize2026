/* スキャンPDF（文字レイヤが無い＝画像だけのPDF）を読めるか実測する。
   ブラウザで文字を描いた JPEG を作り、それだけを貼ったPDFを組み立てて添付する。
   実行: node vqchatscan.cjs */
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const TMP = "/private/tmp/claude-501/-Users-user-Downloads-word-practice-v26-menu-terms-report-emailjs/ea86a79f-1ff2-4347-9303-995fcdd2a12d/scratchpad/vqscan";
const HIDE = `#vqbFlow,#mob-tut-overlay,#mobBarTutorial,#firstLaunchOverlay,#vqOnboardingOverlay{display:none !important;}`;

async function login(pg) {
  await pg.goto("http://127.0.0.1:8791/?vqdev=1", { waitUntil: "domcontentloaded", timeout: 30000 });
  await pg.addStyleTag({ content: HIDE });
  await pg.waitForFunction(() => document.getElementById("authLoginSubmitBtn"), { timeout: 20000 });
  await pg.evaluate(() => {
    const setV = (el, v) => { const p = el.tagName === "SELECT" ? HTMLSelectElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(p.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); };
    setV(document.getElementById("authLoginGrade"), "H3");
    setV(document.getElementById("authLoginNickname"), "tester");
    setV(document.getElementById("authLoginPassword"), "Abcd1234");
    document.getElementById("authLoginSubmitBtn").click();
  });
  await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 30000 });
  await pg.addStyleTag({ content: HIDE });
  await pg.waitForTimeout(2200);
  for (let i = 0; i < 3; i++) {
    const c = await pg.evaluate(() => { const bd = document.querySelector(".ui-modal-backdrop");
      if (!bd || getComputedStyle(bd).display === "none") return false;
      const b2 = document.getElementById("uiModalOk") || document.getElementById("uiModalCancel");
      if (b2) { b2.click(); return true; } return false; });
    if (!c) break; await pg.waitForTimeout(400);
  }
  await pg.evaluate(() => { const n = document.getElementById("vqNewAuth"); if (n) n.style.display = "none"; });
  await pg.evaluate(() => { const e = document.querySelector('#appTabBar [data-app-tab="chat"]'); if (e) e.click(); });
  await pg.waitForTimeout(1800);
}

/* JPEG を貼っただけのPDFを組み立てる（文字レイヤは入れない＝スキャン相当） */
function buildScanPdf(jpegs, w, h) {
  const objs = [];
  const push = (s) => { objs.push(s); return objs.length; };
  const kids = [];
  const pageIds = [];
  /* 1: Catalog, 2: Pages は最後に番号を決めるので先に予約 */
  const catalogId = push(null), pagesId = push(null);
  jpegs.forEach((jp) => {
    const imgId = push("<< /Type /XObject /Subtype /Image /Width " + w + " /Height " + h +
      " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + jp.length +
      " >>\nstream\n@@BIN@@\nendstream");
    const contents = "q " + w + " 0 0 " + h + " 0 0 cm /Im0 Do Q";
    const cId = push("<< /Length " + contents.length + " >>\nstream\n" + contents + "\nendstream");
    const pId = push("<< /Type /Page /Parent " + pagesId + " 0 R /MediaBox [0 0 " + w + " " + h + "]" +
      " /Resources << /XObject << /Im0 " + imgId + " 0 R >> >> /Contents " + cId + " 0 R >>");
    objs[imgId - 1] = { bin: jp, head: objs[imgId - 1] };
    pageIds.push(pId); kids.push(pId + " 0 R");
  });
  objs[catalogId - 1] = "<< /Type /Catalog /Pages " + pagesId + " 0 R >>";
  objs[pagesId - 1] = "<< /Type /Pages /Kids [" + kids.join(" ") + "] /Count " + pageIds.length + " >>";

  const parts = [Buffer.from("%PDF-1.4\n")];
  let pos = parts[0].length;
  const offsets = [];
  objs.forEach((o, i) => {
    offsets[i] = pos;
    let head, bin = null;
    if (o && typeof o === "object" && o.bin) { head = o.head; bin = o.bin; } else head = o;
    const a = Buffer.from((i + 1) + " 0 obj\n");
    let body;
    if (bin) {
      const [pre, post] = head.split("@@BIN@@");
      body = Buffer.concat([Buffer.from(pre), bin, Buffer.from(post)]);
    } else body = Buffer.from(head);
    const b = Buffer.concat([a, body, Buffer.from("\nendobj\n")]);
    parts.push(b); pos += b.length;
  });
  const xrefPos = pos;
  let xref = "xref\n0 " + (objs.length + 1) + "\n0000000000 65535 f \n";
  offsets.forEach((o) => { xref += String(o).padStart(10, "0") + " 00000 n \n"; });
  xref += "trailer\n<< /Size " + (objs.length + 1) + " /Root " + catalogId + " 0 R >>\nstartxref\n" + xrefPos + "\n%%EOF\n";
  parts.push(Buffer.from(xref));
  return Buffer.concat(parts);
}

(async () => {
  fs.mkdirSync(TMP, { recursive: true });
  const br = await chromium.launch();
  const ctx = await br.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();

  /* ページ画像を作る（文字は画像の中にしか無い） */
  const secret = "ザルカンド条約";
  await pg.goto("about:blank");
  const jpegs = await pg.evaluate((secret) => {
    const pages = [
      ["ヴェルナ王国 内部資料", "第1章 交易のあらまし", "塩と穀物の関税は据え置くこととする。", "港湾の運用は従前どおり。"],
      ["第2章 港の扱い", "839年に結ばれた " + secret + " により、", "リューン港の関税は免除される。", "この措置は当面のあいだ継続する。"]
    ];
    return pages.map((lines) => {
      const c = document.createElement("canvas");
      c.width = 1240; c.height = 1754;              /* A4 相当 150dpi */
      const g = c.getContext("2d");
      g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = "#111";
      g.font = "bold 52px 'Hiragino Sans', sans-serif";
      g.fillText(lines[0], 90, 160);
      g.font = "40px 'Hiragino Sans', sans-serif";
      lines.slice(1).forEach((t, i) => g.fillText(t, 90, 300 + i * 90));
      return { w: c.width, h: c.height, b64: c.toDataURL("image/jpeg", 0.9).split(",")[1] };
    });
  }, secret);

  const bufs = jpegs.map((j) => Buffer.from(j.b64, "base64"));
  const pdf = buildScanPdf(bufs, jpegs[0].w, jpegs[0].h);
  const p = path.join(TMP, "scan.pdf");
  fs.writeFileSync(p, pdf);
  console.log("スキャンPDFを作成: " + Math.round(pdf.length / 1024) + "KB / " + bufs.length + "ページ（文字レイヤなし）");

  await login(pg);
  const [ch] = await Promise.all([
    pg.waitForEvent("filechooser"),
    pg.evaluate(() => document.getElementById("vqChat").shadowRoot.querySelector('[data-a="attach"]').click())
  ]);
  await ch.setFiles([p]);
  await pg.waitForFunction(() => {
    const l = window.__vqChatFiles.list();
    return l.length > 0 && l.every((f) => ["ready", "warning", "failed"].indexOf(f.status) >= 0);
  }, null, { timeout: 180000 });

  const st0 = await pg.evaluate(() => window.__vqChatFiles.list().map(f => ({
    name: f.name, status: f.status, chars: (f.text || "").length,
    imgs: (f.pageImages || []).length, warn: (f.warnings || []).join(" / ")
  })));
  console.log("\n取り込み:");
  st0.forEach(f => console.log("  " + f.name + " [" + f.status + "] 文字 " + f.chars + " / 画像化 " + f.imgs + "ページ"
    + (f.warn ? "\n    警告: " + f.warn : "")));

  await pg.evaluate(() => {
    const r = document.getElementById("vqChat").shadowRoot;
    const ta = r.querySelector(".ta");
    ta.value = "この資料で、リューン港の関税が免除される根拠になっている条約の名前を答えて。";
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const t0 = Date.now();
  await pg.evaluate(() => document.getElementById("vqChat").shadowRoot.querySelector(".send").click());
  await pg.waitForFunction(() => {
    const r = document.getElementById("vqChat").shadowRoot;
    const n = r.querySelectorAll(".msg.ai");
    if (!n.length) return false;
    return !r.querySelector(".send").classList.contains("stop")
      && (n[n.length - 1].textContent || "").trim().length > 5;
  }, null, { timeout: 300000 }).catch(() => {});

  const o = await pg.evaluate(() => {
    const r = document.getElementById("vqChat").shadowRoot;
    const ai = r.querySelectorAll(".msg.ai");
    const ev = window.__vqChatFiles.events().filter(e => e.type === "scan.attach" || e.type === "pdf.render");
    return { ai: ((ai[ai.length - 1] || {}).textContent || "").trim(),
             err: (r.querySelector(".err") || {}).textContent || "",
             ev: ev.map(e => e.label) };
  });
  console.log("\n処理: " + o.ev.join(" / "));
  console.log("所要: " + Math.round((Date.now() - t0) / 1000) + "秒");
  if (o.err) console.log("エラー: ★" + o.err.slice(0, 120));
  console.log("返答: " + o.ai.slice(0, 260));
  console.log("\n画像の中の語（" + secret + "）を読めた: " + (o.ai.indexOf(secret) >= 0 ? "★はい（スキャンPDFが読めている）" : "いいえ"));

  await br.close();
  fs.rmSync(TMP, { recursive: true, force: true });
})().catch(e => { console.error(e); process.exit(1); });
