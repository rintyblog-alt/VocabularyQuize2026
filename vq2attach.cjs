/* 添付が実際に効いているかを確かめる。
   資料には実在しない固有名詞と年号だけを書いてあるので、
   それが問題文に出てくれば「資料を読んで作った」と言い切れる。 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const TMP = path.join(process.env.TMPDIR || "/tmp", "vq2attach");
const HIDE = "#vqNewAuth{display:none !important}";
const PS = `const h=document.getElementById("vq2-preset-studio");return h.shadowRoot.querySelector(".vq2-root");`;
const QM = `const h=document.getElementById("vq2-quick-mock");return h.shadowRoot.querySelector(".vq2-root");`;

let pass = 0, fail = 0;
const errs = [];
async function step(name, fn) {
  try { const r = await fn(); pass++; console.log("  ✓ " + name + (r ? " — " + r : "")); }
  catch (e) { fail++; console.log("  ✗ " + name + " — " + e.message); }
}
function assert(c, m) { if (!c) throw new Error(m || "assertion failed"); }

/* 資料を作る（実在しない王国の年表） */
const TXT = [
  "第1章 ヴェルナ王国の成立",
  "1. 西暦812年、族長カレン・ドルヴァスが三つの部族を統合し、ヴェルナ王国を建国した。",
  "2. 建国の翌年に定められたドルヴァス法典は、全17条から成り、土地の共有を原則とした。",
  "3. 840年、第二代国王ミルザ2世は都をアスカル城からリューン港へ遷した。",
  "4. リューン港は塩の交易で栄え、873年には年間およそ四千樽の塩を輸出した。",
  "5. 901年の「灰の乱」により王権は弱まり、地方領主のヴァルド家が実権を握った。"
].join("\n");
const PDF_LINES = [
  "Chapter 1: Founding of the Kingdom of Verna",
  "1. In 812 AD, chieftain Karen Dorvas united three tribes and founded Verna.",
  "2. The Dorvas Code, enacted the next year, had 17 articles and made land communal.",
  "3. In 840, King Mirza II moved the capital from Askar Castle to Ryun Harbour.",
  "4. Ryun Harbour thrived on salt trade, exporting about 4,000 barrels in 873.",
  "5. The Ash Revolt of 901 weakened the crown; the Vald family took real power."
];
function makePdf(lines) {
  const content = "BT /F1 12 Tf 40 780 Td 16 TL\n"
    + lines.map(l => "(" + l.replace(/[()\\]/g, "\\$&") + ") Tj T*").join("\n") + "\nET";
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    "<< /Length " + content.length + " >>\nstream\n" + content + "\nendstream",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  let out = "%PDF-1.4\n"; const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += (i + 1) + " 0 obj\n" + o + "\nendobj\n"; });
  const xref = out.length;
  out += "xref\n0 " + (objs.length + 1) + "\n0000000000 65535 f \n"
    + offs.map(o => String(o).padStart(10, "0") + " 00000 n \n").join("");
  out += "trailer\n<< /Size " + (objs.length + 1) + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF";
  return Buffer.from(out, "latin1");
}

async function login(pg) {
  await pg.goto("http://127.0.0.1:8791/?vqdev=1", { waitUntil: "domcontentloaded", timeout: 30000 });
  await pg.addStyleTag({ content: HIDE });
  await pg.waitForFunction(() => document.getElementById("authLoginSubmitBtn"), { timeout: 20000 });
  await pg.evaluate(() => {
    const setV = (el, v) => {
      const p = el.tagName === "SELECT" ? HTMLSelectElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(p.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    setV(document.getElementById("authLoginGrade"), "H3");
    setV(document.getElementById("authLoginNickname"), "tester");
    setV(document.getElementById("authLoginPassword"), "Abcd1234");
    document.getElementById("authLoginSubmitBtn").click();
  });
  await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 30000 });
  await pg.waitForTimeout(2500);
  for (let i = 0; i < 3; i++) {
    const c = await pg.evaluate(() => {
      const bd = document.querySelector(".ui-modal-backdrop");
      if (!bd || getComputedStyle(bd).display === "none") return false;
      const b2 = document.getElementById("uiModalOk") || document.getElementById("uiModalCancel");
      if (b2) { b2.click(); return true; } return false;
    });
    if (!c) break;
    await pg.waitForTimeout(300);
  }
  await pg.evaluate(() => { const n = document.getElementById("vqNewAuth"); if (n) n.style.display = "none"; });
}

async function attach(pg, rootSrc, files) {
  /* 添付は本体側（__vqChatFiles）に溜まる。前の検証の残りを消してから足す。 */
  await pg.evaluate(() => { try { window.__vqChatFiles.clear(); } catch (e) {} });
  const [chooser] = await Promise.all([
    pg.waitForEvent("filechooser"),
    pg.evaluate((src) => { new Function(src)().querySelector('[data-act="attach"]').click(); }, rootSrc)
  ]);
  await chooser.setFiles(files);
  await pg.waitForFunction((src) => {
    const root = new Function(src)();
    return root.querySelectorAll(".vq2-attach-i").length > 0 && !root.querySelector(".vq2-attach .vq2-spin");
  }, rootSrc, { timeout: 180000 });
  return pg.evaluate((src) => Array.from(new Function(src)().querySelectorAll(".vq2-attach-i"))
    .map(e => e.textContent.trim()), rootSrc);
}

(async () => {
  fs.mkdirSync(TMP, { recursive: true });
  fs.writeFileSync(path.join(TMP, "verna.txt"), TXT, "utf8");
  fs.writeFileSync(path.join(TMP, "verna.pdf"), makePdf(PDF_LINES));

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();
  pg.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  await login(pg);

  /* 画像はブラウザで作る（外部素材を持ち込まない） */
  const png = await pg.evaluate(() => {
    const c = document.createElement("canvas"); c.width = 900; c.height = 520;
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, 900, 520);
    g.fillStyle = "#111"; g.font = "bold 30px sans-serif";
    g.fillText("Kingdom of Verna - Class Handout", 40, 60);
    g.font = "24px sans-serif";
    ["812  Karen Dorvas founds Verna", "813  Dorvas Code, 17 articles",
     "840  Capital moves to Ryun Harbour", "873  Salt export: 4,000 barrels",
     "901  The Ash Revolt, Vald family rules"].forEach((t, i) => g.fillText(t, 40, 130 + i * 54));
    return c.toDataURL("image/png");
  });
  fs.writeFileSync(path.join(TMP, "verna.png"), Buffer.from(png.split(",")[1], "base64"));

  console.log("\n══ Preset Studio の添付 ══");
  await pg.evaluate(() => window.VQ2.open.presetStudio({}));
  await pg.waitForFunction(() => {
    const h = document.getElementById("vq2-preset-studio");
    return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vq2-root"));
  }, null, { timeout: 15000 });
  await pg.waitForTimeout(600);

  let rows = [];
  await step("PDF とテキストを添付すると、何を読み取ったかが出る", async () => {
    rows = await attach(pg, PS, [path.join(TMP, "verna.pdf"), path.join(TMP, "verna.txt")]);
    assert(rows.length === 2, "表示が 2 件でない: " + rows.length);
    assert(/ページ/.test(rows.join(" ")), "PDF のページ数が出ていない: " + rows.join(" / "));
    return rows.join(" / ");
  });

  await step("資料の中身から問題ができる（指示も効いている）", async () => {
    await pg.waitForTimeout(1500);
    const t0 = Date.now();
    await pg.evaluate((src) => {
      const root = new Function(src)();
      const ta = root.querySelector('[data-key="autoInstruction"]');
      ta.value = "添付した資料だけを根拠に、4択問題を4問作ってください。年号を必ず含めてください。";
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      root.querySelector('[data-act="ai-generate"]').click();
    }, PS);
    await pg.waitForFunction((src) => {
      const root = new Function(src)();
      return !!root.querySelector('[data-act="apply-all"]') || !!root.querySelector(".vq2-note.is-err");
    }, PS, { timeout: 600000 });
    const out = await pg.evaluate((src) => {
      const root = new Function(src)();
      return { err: (root.querySelector(".vq2-note.is-err") || {}).textContent || null, body: root.textContent };
    }, PS);
    assert(!out.err, out.err);
    const words = ["ヴェルナ", "ドルヴァス", "ミルザ", "リューン", "アスカル", "ヴァルド", "812", "840", "873", "901"];
    const hit = words.filter(w => out.body.includes(w));
    assert(hit.length >= 4, "資料由来の語が出ていない（" + hit.length + " 語）");
    return hit.length + " / " + words.length + " 語が問題に出た（" + hit.slice(0, 6).join("・") + "…）／ "
      + ((Date.now() - t0) / 1000).toFixed(1) + "s";
  });

  await step("適用するとプリセットの問題になる", async () => {
    await pg.evaluate((src) => {
      const b = new Function(src)().querySelector('[data-act="apply-all"]'); if (b) b.click();
    }, PS);
    await pg.waitForTimeout(1500);
    const n = await pg.evaluate((src) => new Function(src)().querySelectorAll("[data-qid]").length, PS);
    assert(n > 0, "一覧に入っていない");
    await pg.evaluate(() => { const h = document.getElementById("vq2-preset-studio"); if (h && h.__vq2) h.__vq2.forceClose("test"); });
    await pg.waitForTimeout(400);
    return n + " 問";
  });

  console.log("\n══ 画像（Vision）══");
  await pg.evaluate(() => window.VQ2.open.presetStudio({}));
  await pg.waitForFunction(() => {
    const h = document.getElementById("vq2-preset-studio");
    return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vq2-root"));
  }, null, { timeout: 15000 });
  await pg.waitForTimeout(600);

  await step("画像を添付すると画像として扱われる", async () => {
    const r = await attach(pg, PS, [path.join(TMP, "verna.png")]);
    assert(/画像/.test(r.join(" ")), "画像として扱われていない: " + r.join(" / "));
    return r.join(" / ");
  });

  await step("画像の中身から問題ができる", async () => {
    await pg.waitForTimeout(1500);
    const t0 = Date.now();
    await pg.evaluate((src) => {
      const root = new Function(src)();
      const ta = root.querySelector('[data-key="autoInstruction"]');
      ta.value = "添付した画像だけを根拠に、4択問題を3問作ってください。年号を必ず含めてください。";
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      root.querySelector('[data-act="ai-generate"]').click();
    }, PS);
    await pg.waitForFunction((src) => {
      const root = new Function(src)();
      return !!root.querySelector('[data-act="apply-all"]') || !!root.querySelector(".vq2-note.is-err");
    }, PS, { timeout: 600000 });
    const out = await pg.evaluate((src) => {
      const root = new Function(src)();
      return { err: (root.querySelector(".vq2-note.is-err") || {}).textContent || null, body: root.textContent };
    }, PS);
    assert(!out.err, out.err);
    const words = ["812", "813", "840", "873", "901", "Verna", "ヴェルナ", "Dorvas", "ドルヴァス", "Ryun", "リューン"];
    const hit = words.filter(w => out.body.includes(w));
    assert(hit.length >= 2, "画像から読み取れていない（" + hit.length + " 語）");
    await pg.evaluate(() => { const h = document.getElementById("vq2-preset-studio"); if (h && h.__vq2) h.__vq2.forceClose("test"); });
    await pg.waitForTimeout(400);
    return hit.length + " 語が問題に出た（" + hit.join("・") + "）／ " + ((Date.now() - t0) / 1000).toFixed(1) + "s";
  });

  console.log("\n══ Quick Mock の添付 ══");
  await step("試験作成でも同じように読み取れる", async () => {
    await pg.evaluate(() => window.VQ2.open.quickMock({}));
    await pg.waitForFunction(() => {
      const h = document.getElementById("vq2-quick-mock");
      return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vq2-root"));
    }, null, { timeout: 15000 });
    await pg.waitForTimeout(600);
    const r = await attach(pg, QM, [path.join(TMP, "verna.pdf"), path.join(TMP, "verna.txt")]);
    /* Quick Mock は 2 ペイン。右の入力欄（composer）に本体を出し、
       左の設定ペインには「何から作りますか」の控えとして同じ一覧を映す。
       つまり 2 ファイルなら chip は 4 個ある。数えるのは入力欄のほうだけ。 */
    const panes = await pg.evaluate((src) => {
      const root = new Function(src)();
      const inComposer = Array.from(root.querySelectorAll(".vq2-composer .vq2-attach-i"))
        .map(e => (e.querySelector(".vq2-attach-n") || {}).textContent || "");
      const mirrored = Array.from(root.querySelectorAll(".vq2-attach-i"))
        .map(e => (e.querySelector(".vq2-attach-n") || {}).textContent || "")
        .filter(n => !inComposer.includes(n) || true);
      return { composer: inComposer, all: mirrored.length };
    }, QM);
    assert(panes.composer.length === 2, "入力欄の表示が 2 件でない: " + panes.composer.length);
    assert(panes.all === 4, "左の控えと合わせて 4 件にならない: " + panes.all);
    assert(r.length === 4, "全体の chip 数が 4 件でない: " + r.length);
    const chars = await pg.evaluate((src) => {
      const root = new Function(src)();
      return Array.from(root.querySelectorAll(".vq2-attach-s")).map(e => e.textContent).join(" / ");
    }, QM);
    await pg.waitForTimeout(1200);
    await pg.evaluate(() => { const h = document.getElementById("vq2-quick-mock"); if (h && h.__vq2) h.__vq2.forceClose("test"); });
    return r.join(" / ");
  });

  await step("Console エラー 0 件", async () => {
    assert(errs.length === 0, errs.join(" / "));
    return "0 件";
  });

  await browser.close();
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\n結果: ${pass} / ${pass + fail} 通過` + (fail ? `（失敗 ${fail}）` : ""));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
