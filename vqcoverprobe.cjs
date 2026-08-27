/* 実際の資料で、全区間を見ているかを確かめる。

   これまでは「資料が長いため、質問に関連する 12 区間だけを参照しました（全 17 区間）」
   という状態だった。残り 5 区間は一度も読まれていない。
   ここでは全 17 区間を 4 つずつ、最後まで見ているかを実測する。

   実行: node vqcoverprobe.cjs [問題数]
*/
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const BRIDGE = process.env.VQ_BRIDGE || "http://127.0.0.1:17891";
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
const COUNT = Number(process.argv[2]) || 12;
const PDF = path.join(__dirname, "artifacts", "quick-mock-phase13",
                      "日本史探究 1学期期末考査資料.pdf");

/* PDF の文章はブラウザ（PDF.js）でしか取り出せないので、そこだけ借りる。 */
async function extractPdf(file) {
  const browser = await chromium.launch();
  const pg = await browser.newPage();
  await pg.goto(BASE + "/?vqdev=1&cb=" + Date.now(),
    { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.waitForFunction(() => !!window.__vqChatFiles, { timeout: 30000 });
  const r = await pg.evaluate(async (f) => {
    const F = window.__vqChatFiles;
    const bin = atob(f.b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    await F.add([new File([arr], f.name, { type: "application/pdf" })]);
    for (let i = 0; i < 200; i++) {
      const it = F.list();
      if (it.length && !it.some((x) => x.status === "queued" || x.status === "extracting")) break;
      await new Promise((res) => setTimeout(res, 250));
    }
    const x = F.list()[0];
    return { name: x.name, pageCount: x.pageCount, text: String(x.text || "") };
  }, { name: path.basename(file), b64: fs.readFileSync(file).toString("base64") });
  await browser.close();
  return r;
}

(async () => {
  console.log("══ 資料全体を見ているか（実資料）══");
  const doc = await extractPdf(PDF);
  console.log("  資料: " + doc.name + " / " + doc.pageCount + " ページ / "
    + doc.text.length + " 字");

  const req = {
    message: "添付した資料全体から、まんべんなく4択問題を" + COUNT + "問作ってください。",
    thinkingLevel: "normal",
    attachments: [{ id: "a1", name: doc.name, kind: "pdf", fileType: "pdf",
                    extractedText: doc.text, extractedCharacterCount: doc.text.length,
                    pageCount: doc.pageCount }],
    taskHint: "preset_generation",
    options: Object.assign({ sourceOnly: true, requireEvidence: true, questionCount: COUNT, schema: "preset" },
      process.env.NOCOV ? { fullCoverage: false } : {}),
    plan: "free", ownerId: "coverprobe"
  };

  const t0 = Date.now();
  const res = await fetch(BRIDGE + "/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req)
  });
  if (!res.ok) { console.log("HTTP " + res.status); process.exit(1); }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", ev = null;
  const digest = [], out = { metrics: null, error: null, structured: null };
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) {
      if (line.startsWith("event:")) { ev = line.slice(6).trim(); continue; }
      if (!line.startsWith("data:")) continue;
      let j = null;
      try { j = JSON.parse(line.slice(5).trim()); } catch (e) { continue; }
      if (ev === "activity" && j.type === "worker.digest") digest.push(j.label);
      else if (ev === "metrics") out.metrics = j;
      else if (ev === "error") out.error = j;
      else if (ev === "structured") out.structured = j;
    }
  }

  console.log("\n── 画面に出た工程 ──");
  [...new Set(digest)].forEach((d) => console.log("  " + d));

  const c = (out.metrics && out.metrics.coverage) || null;
  console.log("\n── 到達 ──");
  if (!c) console.log("  （coverage が返っていません）");
  else {
    console.log("  totalChunks      " + c.totalChunks);
    console.log("  processedChunks  " + c.processedChunks);
    console.log("  failedChunks     " + JSON.stringify(c.failedChunks));
    console.log("  excludedChunks   " + JSON.stringify(c.excludedChunks));
    console.log("  currentBatch     " + c.currentBatch + " / " + c.totalBatches);
    console.log("  coveragePercent  " + c.coveragePercent + "%");
    console.log("  state            " + c.state + "（" + c.reason + "）");
    console.log("  ページ範囲       " + JSON.stringify(c.pageRanges));
    console.log("  論点 " + c.topics + " ／ 重複 " + c.duplicates);
    if (c.allocation) {
      console.log("\n── 配分 ──");
      c.allocation.forEach((a) => console.log("  " + a.topic
        + (a.pages ? "（p." + a.pages.from + "〜" + a.pages.to + "）" : "")
        + " … " + a.questions + " 問"));
      console.log("  合計 " + c.allocation.reduce((s, a) => s + a.questions, 0) + " 問");
    }
  }

  if (out.metrics) {
    console.log("\n── 生成の内訳 ──");
    console.log("  tokenPlan   " + JSON.stringify(out.metrics.tokenPlan));
    console.log("  qualityGate " + JSON.stringify(out.metrics.qualityGate));
    console.log("  structured  " + JSON.stringify(out.metrics.structured));
    console.log("  retries     " + JSON.stringify(out.metrics.retries));
    console.log("  regen       " + JSON.stringify(out.metrics.regenMetric));
    console.log("  warnings    " + out.metrics.warnings);
  }
  const d = out.structured && (out.structured.data || out.structured);
  const qs = (d && (d.questions || (d.sections || []).flatMap((s) => s.questions || []))) || [];
  console.log("\n── 結果 ──");
  if (out.error) console.log("  失敗: " + out.error.code + " / " + out.error.message);
  else console.log("  ✓ " + qs.length + " 問");
  console.log("  所要 " + ((Date.now() - t0) / 1000).toFixed(1) + " 秒");

  /* 判定 */
  let ng = 0;
  const check = (ok, m) => { console.log((ok ? "  ok   " : "  NG   ") + m); if (!ok) ng++; };
  console.log("\n── 判定 ──");
  check(!!c, "coverage の記録が返る");
  if (c) {
    check(c.totalChunks > 4, "区間が 4 より多い（" + c.totalChunks + " 区間）");
    check(c.processedChunks === c.totalChunks - c.excludedChunks.length,
      "全区間を処理した（" + c.processedChunks + " / " + c.totalChunks + "）");
    check(c.coveragePercent === 100, "到達率 100%（" + c.coveragePercent + "%）");
    check(c.state === "completed", "completed（" + c.state + "）");
    check(c.totalBatches === Math.ceil(c.totalChunks / 4),
      "4 区間ずつに分けた（" + c.totalBatches + " 回）");
    check(!!c.allocation && c.allocation.reduce((s, a) => s + a.questions, 0) === COUNT,
      "問題数を先に配った（合計 " + (c.allocation
        ? c.allocation.reduce((s, a) => s + a.questions, 0) : 0) + " / " + COUNT + "）");
  }
  check(digest.some((x) => /区間に分割しました/.test(x)), "「N区間に分割しました」が出る");
  check(digest.some((x) => /区間を確認しています/.test(x)), "「N / M区間を確認しています」が出る");
  check(digest.some((x) => /区間を確認しました/.test(x)), "「M / M区間を確認しました」が出る");
  check(digest.some((x) => /資料全体から論点を整理しました/.test(x)), "「資料全体から論点を整理しました」が出る");
  check(digest.some((x) => /問へ配分しています/.test(x)), "「N問へ配分しています」が出る");
  process.exit(ng ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
