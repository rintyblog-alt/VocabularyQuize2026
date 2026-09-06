/* 添付が本当に何件・何MBまで通るのかを実測する。
   3ファイル同時 / 1MB / 5MB / 30MB を実際に投げて、弾かれた理由をそのまま出す。
   実行: node vqchatfiles.cjs */
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const TMP = require("path").join(__dirname, "_fixtures", "vqfiles");
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

function makeText(p, mb) {
  const line = "ヴェルナ王国の歴史。812年に建国され、840年に遷都した。塩の交易で栄えた。\n";
  const need = Math.round(mb * 1024 * 1024);
  const buf = Buffer.alloc(0);
  const chunks = []; let n = 0;
  while (n < need) { chunks.push(line); n += Buffer.byteLength(line); }
  fs.writeFileSync(p, chunks.join(""));
  return Math.round(fs.statSync(p).size / 1024 / 1024 * 10) / 10;
}

async function attachAndReport(pg, files, label) {
  await pg.evaluate(() => { try { window.__vqChatFiles.clear(); } catch (e) {} });
  await pg.waitForTimeout(300);
  const [ch] = await Promise.all([
    pg.waitForEvent("filechooser"),
    pg.evaluate(() => document.getElementById("vqChat").shadowRoot.querySelector('[data-a="attach"]').click())
  ]);
  await ch.setFiles(files);
  /* 解析が落ち着くまで待つ（失敗も含めて終わるのを待つ） */
  await pg.waitForFunction(() => {
    const l = window.__vqChatFiles.list();
    return l.length > 0 && l.every((f) => ["ready", "warning", "failed", "cancelled"].indexOf(f.status) >= 0);
  }, null, { timeout: 180000 }).catch(() => {});
  await pg.waitForTimeout(500);
  const o = await pg.evaluate(() => {
    const F = window.__vqChatFiles;
    const evs = F.events().filter((e) => e.type === "file.validation" && e.status === "failed");
    return {
      accepted: F.list().map((f) => f.name + "[" + f.status + (f.error ? ":" + f.error : "") + "]"),
      rejected: evs.map((e) => e.detail || e.label)
    };
  });
  console.log("\n【" + label + "】");
  console.log("  受け入れ: " + (o.accepted.length ? o.accepted.join(" / ") : "0件"));
  if (o.rejected.length) o.rejected.forEach((r) => console.log("  弾かれた理由: " + r));
  return o;
}

(async () => {
  fs.mkdirSync(TMP, { recursive: true });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();
  await login(pg);

  const lim = await pg.evaluate(() => {
    const L = window.__vqChatFiles.LIMITS, mb = (n) => Math.round(n / 1024 / 1024);
    return { doc: L.maxBytesByKind ? mb(L.maxBytesByKind.document) : "(旧)" + mb(L.maxFileBytes),
             img: L.maxBytesByKind ? mb(L.maxBytesByKind.image) : null,
             sheet: L.maxBytesByKind ? mb(L.maxBytesByKind.sheet) : null,
             files: L.maxFiles, total: mb(L.maxTotalBytes), textChars: L.maxTextChars };
  });
  console.log("画面が持っている上限: 文書 " + lim.doc + "MB / 画像 " + lim.img + "MB / 表 " + lim.sheet
    + "MB / " + lim.files + "件 / 合計 " + lim.total + "MB / 1ファイル文字数 " + lim.textChars);

  /* ① 3ファイル同時（小さめ） */
  const a = path.join(TMP, "a.txt"), b2 = path.join(TMP, "b.txt"), c = path.join(TMP, "c.txt");
  makeText(a, 0.2); makeText(b2, 0.2); makeText(c, 0.2);
  await attachAndReport(pg, [a, b2, c], "小さいファイル 3件同時");

  /* ② 1MB 1件 */
  const m1 = path.join(TMP, "m1.txt"); const s1 = makeText(m1, 1.2);
  await attachAndReport(pg, [m1], s1 + "MB を1件");

  /* ③ 8MB 1件 */
  const m8 = path.join(TMP, "m8.txt"); const s8 = makeText(m8, 8);
  await attachAndReport(pg, [m8], s8 + "MB を1件");

  /* ④ 3件 × 5MB */
  const p1 = path.join(TMP, "p1.txt"), p2 = path.join(TMP, "p2.txt"), p3 = path.join(TMP, "p3.txt");
  makeText(p1, 5); makeText(p2, 5); makeText(p3, 5);
  await attachAndReport(pg, [p1, p2, p3], "5MB × 3件同時");

  /* ⑤ 旧上限(25MB)を超える大きさ */
  const big = path.join(TMP, "big.txt"); const sb = makeText(big, 40);
  await attachAndReport(pg, [big], sb + "MB を1件（旧上限25MBを超える）");

  await b.close();
  fs.rmSync(TMP, { recursive: true, force: true });
})().catch(e => { console.error(e); process.exit(1); });
