/* 再読込したあと、添付と解析結果が戻るかを実ブラウザで確かめる。

   これまで手で確かめていた 2 件目。見たいのは次のとおり。
   ・分割アップロード → ページ解析 → 再読込 → 同じプリセットを開き直す
   ・置き場所の ID、ファイルの素性、解析ジョブの状態、ページごとの結果、
     除外ページ、選べる操作、「資料だけを根拠にする」が戻る
   ・置き場所が消えているときは、戻ったふりをせず期限切れと言う

   実行: node vqrestore.cjs [出力先]
*/
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const FIX = require("./vqpdffix.cjs");

const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
const BRIDGE = process.env.VQ_BRIDGE || "http://127.0.0.1:17891";
const OUT = process.argv[2] || "shots/restore";
const TMP = process.env.VQ_TMP
  || "/private/tmp/claude-501/-Users-user-Downloads-word-practice-v26-menu-terms-report-emailjs/ea86a79f-1ff2-4347-9303-995fcdd2a12d/scratchpad/e2e";
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

let pass = 0, fail = 0;
const failures = [];
async function step(name, fn) {
  try { const m = await fn(); pass++; console.log("  ok   " + name + (m ? " — " + m : "")); }
  catch (e) { fail++; failures.push(name); console.log("  NG   " + name + "\n         → " + (e && e.message)); }
}
function assert(c, m) { if (!c) throw new Error(m || "満たしていません"); }

async function login(pg) {
  await pg.goto(BASE + "/?vqdev=1&vq2=all&cb=" + Date.now(),
    { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.addStyleTag({ content: "#vqNewAuth{display:none !important}" });
  await pg.waitForFunction(() => document.getElementById("authLoginSubmitBtn"), { timeout: 30000 });
  await pg.evaluate((c) => {
    const setV = (el, v) => {
      const P = el.tagName === "SELECT" ? HTMLSelectElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(P.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    setV(document.getElementById("authLoginGrade"), c.grade);
    setV(document.getElementById("authLoginNickname"), c.nick);
    setV(document.getElementById("authLoginPassword"), c.pw);
    document.getElementById("authLoginSubmitBtn").click();
  }, { grade: process.env.VQ_GRADE || "H3", nick: process.env.VQ_NICK || "tester",
       pw: process.env.VQ_PW || "Abcd1234" });
  await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 30000 });
  await pg.waitForTimeout(900);
  await pg.evaluate((u) => {
    try { localStorage.setItem("vq.chat.localai.v1", JSON.stringify({ url: u, token: "" })); } catch (e) {}
  }, BRIDGE);
}
function inShadow(pg, body, arg) {
  return pg.evaluate(({ src, a }) => {
    const host = document.getElementById("vq2-preset-studio");
    if (!host || !host.shadowRoot) return { __no: true };
    const root = host.shadowRoot.querySelector(".vq2-root");
    return new Function("root", "args", src)(root, a);
  }, { src: body, a: arg === undefined ? null : arg });
}
async function openPreset(pg, opts) {
  await pg.evaluate((o) => {
    document.querySelectorAll(".vq2-host").forEach((h) => h.remove());
    document.body.style.overflow = "";
    window.VQ2.open.presetStudio(o || {});
  }, opts || {});
  await pg.waitForFunction(() => {
    const h = document.getElementById("vq2-preset-studio");
    return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vq2-root"));
  }, { timeout: 20000 });
  await pg.waitForTimeout(400);
}
async function attach(pg, files) {
  const chooser = pg.waitForEvent("filechooser", { timeout: 20000 });
  await pg.evaluate(() => {
    document.getElementById("vq2-preset-studio").shadowRoot
      .querySelector("[data-tlattach]").click();
  });
  (await chooser).setFiles(files);
  for (let i = 0; i < 60; i++) {
    if (await pg.evaluate(() => !!window.VQ2.__psAttachBusy)) break;
    await pg.waitForTimeout(150);
  }
  for (let i = 0; i < 400; i++) {
    if (!(await pg.evaluate(() => !!window.VQ2.__psAttachBusy))) return true;
    await pg.waitForTimeout(300);
  }
  throw new Error("取り込みが終わりません");
}
function chips(pg) {
  return inShadow(pg, `
    return Array.from(root.querySelectorAll(".vq2-att")).map(function (c) {
      return {
        name: (c.querySelector(".vq2-att-n") || {}).textContent || "",
        meta: (c.querySelector(".vq2-att-s") || {}).textContent || "",
        state: (c.querySelector(".vq2-att-st") || {}).textContent || "",
        note: (c.querySelector(".vq2-att-note") || {}).textContent || "",
        pages: Array.from(c.querySelectorAll(".vq2-att-pc")).map(function (x) { return x.textContent; }),
        actions: Array.from(c.querySelectorAll("[data-attact]"))
                   .map(function (x) { return x.getAttribute("data-attact"); })
      };
    });`);
}
/* 解析結果を、実際に走らせずに作って入れる（読み取りに 5 分かけないため）。
   入れる形はサーバが返すものと同じ。 */
function seedAnalysis(pg, spec) {
  return inShadow(pg, `
    var VQ2 = window.VQ2;
    var host = document.getElementById("vq2-preset-studio");
    var d = null;
    var box = root.querySelector("[data-tlatt]");
    /* いま出ているチップの attachmentId を拾って、その資料の結果として入れる */
    var el = root.querySelector(".vq2-att");
    if (!el) return { no: true };
    var api = VQ2.__psApplyAnalysis;
    if (typeof api !== "function") return { noApi: true };
    api(args);
    return { ok: true };`, spec);
}

(async () => {
  console.log("══ 再読込したあとの復元 ══");
  const lim = await fetch(BRIDGE + "/attachments/limits").then((r) => r.json()).catch(() => null);
  if (!lim) { console.log("\n  NG  Bridge へ繋がりません。実ファイルの確認はできません。"); process.exit(1); }

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));

  const fMixed = path.join(TMP, "mixed.pdf");
  if (!fs.existsSync(fMixed)) fs.writeFileSync(fMixed, FIX.mixedPdf());

  await login(pg);
  await openPreset(pg);

  let presetId = null, jobId = null, beforeChips = null;

  await step("分割アップロードして、ページ解析の結果を持つ状態を作る", async () => {
    await attach(pg, [fMixed]);
    presetId = await pg.evaluate(() => window.VQ2.__psPresetId || null);
    jobId = await pg.evaluate(() => window.VQ2.__psJobId || null);
    assert(presetId && jobId, "ID が取れない");
    /* ページごとの結果を入れる（ok / low_confidence / failed を混ぜる） */
    const r = await seedAnalysis(pg, [{
      attachmentId: null, state: "partially_completed", outcome: "partial",
      totalPages: 3, usablePages: 2, summary: "2 / 3 ページから内容を取り出しました（1 ページは読み取れていません）",
      byStatus: { ok: 1, low_confidence: 1, failed: 1 },
      failedPages: [2], lowConfidencePages: [3],
      pages: [{ pageNumber: 1, status: "ok", confidence: 0.9, characterCount: 340 },
              { pageNumber: 2, status: "failed", confidence: 0, characterCount: 0 },
              { pageNumber: 3, status: "low_confidence", confidence: 0.4, characterCount: 120 }],
      actions: [{ id: "use_readable" }, { id: "retry_failed", pages: 1 },
                { id: "exclude_pages", pages: 1 }, { id: "cancel" }]
    }]);
    assert(!r.noApi, "結果を入れる口がありません");
    await pg.waitForTimeout(500);
    beforeChips = await chips(pg);
    assert(beforeChips.length === 1, "チップが " + beforeChips.length);
    assert(/一部読み取り/.test(beforeChips[0].state), "状態が " + beforeChips[0].state);
    return beforeChips[0].name + " / " + beforeChips[0].state + " / " + beforeChips[0].pages.join(" ");
  });

  await step("「資料だけを根拠にする」を切っておく（戻るかを見るため）", async () => {
    const r = await inShadow(pg, `
      var c = root.querySelector('[data-key="sourceOnly"]');
      if (c && c.checked) c.click();
      return { checked: !!(root.querySelector('[data-key="sourceOnly"]') || {}).checked };`);
    assert(r.checked === false, "切れていない");
    await pg.waitForTimeout(300);
    return "OFF にした";
  });

  let restored = null;
  await step("再読込して同じプリセットを開き直すと、添付が戻る", async () => {
    await pg.reload({ waitUntil: "domcontentloaded" });
    await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 30000 });
    await pg.waitForTimeout(700);
    await openPreset(pg, { presetId,
      preset: { id: presetId, name: "復元の確認", questions: [], revision: 1 } });
    for (let i = 0; i < 60; i++) {
      restored = await pg.evaluate(() => window.VQ2.__psRestored || null);
      if (restored && restored.files.length) break;
      await pg.waitForTimeout(300);
    }
    assert(restored && restored.files.length === 1, "戻っていない: " + JSON.stringify(restored));
    return restored.files.length + " 件";
  });

  await step("置き場所の ID と、ファイルの素性が戻る", async () => {
    const f = restored.files[0];
    assert(restored.jobId === jobId, "jobId が違う（" + restored.jobId + " / " + jobId + "）");
    assert(f.attachmentId, "attachmentId が無い");
    assert(f.jobId === jobId, "ファイルの jobId が違う");
    assert(/mixed\.pdf/.test(f.name), "ファイル名が違う: " + f.name);
    assert(f.size > 0, "ファイルサイズが 0");
    assert(f.kind === "pdf", "種類が " + f.kind);
    return "jobId ✓ / attachmentId ✓ / " + f.name + " / " + f.size + "B / " + f.kind;
  });

  await step("アップロード完了と解析ジョブの状態が戻る", async () => {
    const f = restored.files[0];
    assert(f.uploadState !== "uploading" && f.uploadState !== "expired",
      "アップロード状態が " + f.uploadState);
    assert(f.analysisState === "partially_completed", "解析ジョブの状態が " + f.analysisState);
    return "アップロード " + f.uploadState + " / 解析 " + f.analysisState;
  });

  await step("ページ総数と、状態ごとの内訳が戻る", async () => {
    const f = restored.files[0];
    assert(f.totalPages === 3, "総ページ数が " + f.totalPages);
    assert(f.ok === 1, "ok が " + f.ok);
    assert(f.low_confidence === 1, "low_confidence が " + f.low_confidence);
    assert(f.failed === 1, "failed が " + f.failed);
    assert(f.no_text_detected === 0, "no_text_detected が " + f.no_text_detected);
    return "全 3 ページ / ok 1 / 要確認 1 / 失敗 1 / 文字なし 0";
  });

  await step("ページごとの結果が戻る", async () => {
    const f = restored.files[0];
    assert(f.pageEvidence.length === 3, "ページ記録が " + f.pageEvidence.length);
    const m = {};
    f.pageEvidence.forEach((p) => { m[p.pageNumber] = p.status; });
    assert(m[1] === "ok" && m[2] === "failed" && m[3] === "low_confidence",
      "ページ状態が違う: " + JSON.stringify(m));
    return "p1=ok / p2=failed / p3=low_confidence";
  });

  await step("選べる操作が戻る", async () => {
    const f = restored.files[0];
    ["use_readable", "retry_failed", "exclude_pages", "cancel"].forEach((k) =>
      assert(f.actions.indexOf(k) >= 0, k + " が無い: " + f.actions.join(",")));
    return f.actions.join(" / ");
  });

  await step("「資料だけを根拠にする」の状態が戻る", async () => {
    assert(restored.sourceOnly === false,
      "戻っていない（" + restored.sourceOnly + "）");
    const c = await inShadow(pg, `
      return { checked: !!(root.querySelector('[data-key="sourceOnly"]') || {}).checked };`);
    assert(c.checked === false, "画面のチェックが戻っていない");
    return "OFF のまま戻った";
  });

  await step("画面のチップも「一部読み取り」で戻る", async () => {
    const c = await chips(pg);
    assert(c.length === 1, "チップが " + c.length);
    assert(/一部読み取り/.test(c[0].state), "状態が " + c[0].state);
    assert(c[0].pages.length >= 2, "ページの内訳が出ていない: " + c[0].pages.join(","));
    return c[0].state + " / " + c[0].pages.join(" ");
  });

  await pg.screenshot({ path: path.join(OUT, "01-restored.png") });

  /* ── 置き場所が消えていたとき ── */
  console.log("\n══ 一時データが消えていたとき ══");

  await step("置き場所を消してから開き直すと、期限切れと言う（戻ったふりをしない）", async () => {
    await fetch(BRIDGE + "/attachments/drop", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId })
    });
    await pg.reload({ waitUntil: "domcontentloaded" });
    await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 30000 });
    await pg.waitForTimeout(700);
    await openPreset(pg, { presetId,
      preset: { id: presetId, name: "復元の確認", questions: [], revision: 1 } });
    let c = [];
    for (let i = 0; i < 60; i++) {
      c = await chips(pg);
      if (c.length && /期限切れ/.test(c[0].state + c[0].note)) break;
      await pg.waitForTimeout(300);
    }
    assert(c.length === 1, "チップが " + c.length);
    assert(/期限切れ/.test(c[0].state), "状態が " + c[0].state);
    assert(/この資料の一時データは期限切れです。もう一度添付してください/.test(c[0].note),
      "文言が違う: " + c[0].note);
    assert(!/文字起こし済み|一部読み取り/.test(c[0].state), "読めたように見えている: " + c[0].state);
    return c[0].state + " ／ " + c[0].note;
  });

  await step("期限切れのものを AI へ渡さない", async () => {
    const r = await pg.evaluate(() => (window.VQ2.__psRestored || { files: [] }).files
      .map((f) => f.uploadState));
    assert(r.every((x) => x === "expired"), "期限切れになっていない: " + r.join(","));
    return "渡す対象から外れている";
  });

  await pg.screenshot({ path: path.join(OUT, "02-expired.png") });

  const real = errs.filter((e) => !/ResizeObserver|BRIDGE_|Failed to fetch/.test(e));
  await step("画面に JavaScript のエラーが出ていない", async () => {
    assert(!real.length, real.slice(0, 3).join(" / "));
    return "0 件";
  });

  await browser.close();
  console.log("\n  スクリーンショット: " + OUT);
  console.log("\n結果: " + pass + " 通過 / " + fail + " 失敗");
  if (failures.length) failures.forEach((f) => console.log("  - " + f));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
