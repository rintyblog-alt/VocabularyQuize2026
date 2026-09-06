/* ページ解析の 3 方式を、同じ 10 ページで比べる。

   A. Qwen3-VL で全文を書き起こす・1 ページずつ順番に
   B. Qwen3-VL で全文を書き起こす・2 ページ並列
   C. macOS の文字認識を一次読み取りにし、
      並べ直しだけ Qwen3-VL に小さな JSON で返させる（Level 2）

   D（RecognizeDocumentsRequest）は、この環境の SDK に無いので比べられない。
   実行時 macOS は 26.5.2 だが、入っている SDK は 15.5 で
   RecognizeDocumentsRequest / DocumentObservation がコンパイルできない（確認済み）。

   実行: node vqocrbench.cjs [方式...]   例: node vqocrbench.cjs A B C
*/
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const OLLAMA = process.env.VQ_OLLAMA || "http://127.0.0.1:11434";
const MODEL = process.env.VQ_VL_MODEL || "hf.co/Qwen/Qwen3-VL-30B-A3B-Instruct-GGUF:Q4_K_M";
const PAGES = process.env.VQ_PAGES
  || require("path").join(__dirname, "_fixtures", "pages");
const OCR_BIN = path.join(__dirname, "local-ai", "native", "page-ocr");
const WANT = (process.argv.slice(2).length ? process.argv.slice(2) : ["A", "B", "C"])
  .map((s) => s.toUpperCase());

const files = fs.readdirSync(PAGES).filter((f) => /\.png$/.test(f)).sort()
  .map((f) => path.join(PAGES, f));

function b64(p) { return fs.readFileSync(p).toString("base64"); }

/* ── Qwen3-VL 1 回 ── */
async function qwen(prompt, images, numPredict) {
  const t0 = Date.now();
  const r = await fetch(OLLAMA + "/api/generate", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL, prompt, images: images || [], stream: false,
      options: { temperature: 0.2, num_predict: numPredict, num_ctx: 16384 }
    })
  });
  const j = await r.json();
  return {
    text: String(j.response || ""),
    ms: Date.now() - t0,
    /* エンジンが「なぜ止まったか」。length なら出力上限に当たっている。 */
    doneReason: j.done_reason || null,
    truncated: j.done_reason === "length",
    outTokens: j.eval_count || 0,
    inTokens: j.prompt_eval_count || 0
  };
}

const TRANSCRIBE = [
  "【画像】\n1. 画像 1", "",
  "この画像に写っている文字を、そのまま書き取ってください。",
  "写っていないことは書かないでください。想像で補わないでください。",
  "次の見出しをそのまま使って答えてください。", "",
  "【本文】", "（写っている文章をそのまま。改行も残す。読み取れない箇所は［不明］。",
  "　文字が写っていなければ「なし」とだけ書く）", "",
  "【図表】", "（図・表・グラフがあれば、読み取れた項目と数値。無ければ「なし」）", "",
  "【読み取れなかったもの】", "（あれば書く。無ければ「なし」）"
].join("\n");

/* ── OCR（かたまりで受け取る）── */
function ocrBlocks(paths) {
  const t0 = Date.now();
  const out = execFileSync(OCR_BIN, ["--blocks", ...paths],
    { maxBuffer: 64 * 1024 * 1024 }).toString();
  const rows = out.split("\n").filter(Boolean).map((l) => JSON.parse(l));
  return { rows, ms: Date.now() - t0 };
}

/* ── Level 判定 ──
   OCR をそのまま採用してよいか（Level 1）、並べ直しが要るか（Level 2）、
   読み取り自体を任せるか（Level 3）を、OCR の結果から決める。 */
function levelOf(r) {
  if (!r || !r.ok || r.chars < 80) return { level: 3, why: "文字がほとんど取れていない" };
  if (r.confidence < 0.6) return { level: 3, why: "確度が低い（" + r.confidence.toFixed(2) + "）" };
  const blocks = r.blocks || [];
  const kinds = new Set(blocks.map((b) => b.type));
  /* 段が取れていて、語彙欄などの割り込みが無ければそのまま使える */
  const mixed = kinds.has("vocabulary") || kinds.has("note");
  if (r.columns >= 2 && !mixed) return { level: 1, why: "段が取れていて割り込みが無い" };
  if (!mixed && blocks.length <= 30) return { level: 1, why: "単純なレイアウト" };
  return { level: 2, why: "読み順が確定できない（本文と傍注が混在）" };
}

/* ── Level 2：並べ直しだけ頼む ──
   本文を書き直させない。**かたまりの並びと種類だけ**を小さな JSON で返させる。 */
/* 行のままだと数が多すぎる。1 ページ 71 行を並べ直させると、
   ID を 71 個返すだけで 1,000 トークンを超え、全文を書かせるのと変わらない
   （実測: 出力 10,853 トークン / 320 秒で、直列の全文解析より遅かった）。
   先に段落へまとめてから、段落の並びだけを返させる。 */
function toParagraphs(blocks) {
  const map = new Map();
  for (const b of blocks || []) {
    const k = b.paragraphId;
    if (!map.has(k)) map.set(k, { id: k, type: b.type, lines: [], x: b.boundingBox.x,
                                  top: 1 - b.boundingBox.y, conf: 0, n: 0 });
    const g = map.get(k);
    g.lines.push(b.text);
    g.conf += b.confidence; g.n++;
    g.x = Math.min(g.x, b.boundingBox.x);
    g.top = Math.min(g.top, 1 - b.boundingBox.y);
    /* 段落の種類は、そこに多い種類にする */
    if (b.type === "heading") g.type = "heading";
  }
  return [...map.values()].map((g) => ({
    id: g.id, type: g.type, text: g.lines.join(" "),
    x: g.x, top: g.top, confidence: g.conf / Math.max(1, g.n), lines: g.lines
  }));
}
function reorderPrompt(paras) {
  const list = paras.map((b) =>
    b.id + "|" + b.type + "|左" + Math.round(b.x * 100)
    + " 上" + Math.round(b.top * 100) + "|" + b.text.slice(0, 70)).join("\n");
  return [
    "この画像から文字を機械的に読み取りました。ただし**読む順番が分かりません**。",
    "画像を見て、人が読む順番に並べ直してください。",
    "",
    "各行の形式: まとまりID|推定の種類|位置|文字の先頭",
    list,
    "",
    "次の JSON だけを返してください。**文字は書き直さないでください。ID だけを並べてください。**",
    '{"order":["まとまりIDを読む順に"],"drop":["本文に不要なID（ページ番号・柱・語彙欄など）"]}',
    "order には、drop に入れたもの以外のすべての ID を入れてください。"
  ].join("\n");
}
function applyOrder(paras, obj) {
  const byId = new Map(paras.map((b) => [b.id, b]));
  const drop = new Set((obj && obj.drop) || []);
  const order = ((obj && obj.order) || []).filter((id) => byId.has(id) && !drop.has(id));
  /* 返ってこなかったかたまりは末尾に足す（黙って捨てない） */
  const seen = new Set(order);
  for (const b of paras) if (!seen.has(b.id) && !drop.has(b.id)) order.push(b.id);
  return order.map((id) => byId.get(id)).filter(Boolean);
}
function extractJson(s) {
  const t = String(s || "");
  const i = t.indexOf("{"), j = t.lastIndexOf("}");
  if (i < 0 || j <= i) return null;
  try { return JSON.parse(t.slice(i, j + 1)); } catch { }
  return null;
}

/* ── 方式 A / B ── */
async function runQwenAll(parallel) {
  const t0 = Date.now();
  const res = new Array(files.length);
  let next = 0;
  const worker = async () => {
    while (true) {
      const i = next++;
      if (i >= files.length) return;
      const s = Date.now();
      const r = await qwen(TRANSCRIBE, [b64(files[i])], 3000);
      res[i] = Object.assign({ page: i + 1, startedAt: s, endedAt: Date.now() }, r);
    }
  };
  await Promise.all(Array.from({ length: parallel }, worker));
  return { ms: Date.now() - t0, pages: res };
}

/* ── 方式 C ── */
async function runHybrid() {
  const t0 = Date.now();
  const o = ocrBlocks(files);
  const levels = o.rows.map(levelOf);
  const out = [];
  let qwenCalls = 0, qwenMs = 0, outTokens = 0, truncated = 0;
  for (let i = 0; i < o.rows.length; i++) {
    const r = o.rows[i], lv = levels[i];
    if (lv.level === 1) {
      out.push({ page: i + 1, level: 1, text: r.text, blocks: (r.blocks || []).length });
      continue;
    }
    if (lv.level === 2) {
      const paras = toParagraphs(r.blocks || []);
      const q = await qwen(reorderPrompt(paras), [b64(files[i])], 900);
      qwenCalls++; qwenMs += q.ms; outTokens += q.outTokens;
      if (q.truncated) truncated++;
      const obj = extractJson(q.text);
      const ordered = (obj && obj.order) ? applyOrder(paras, obj) : [];
      /* 中身がほとんど残らない返答は、並べ直しに失敗したものとして扱う。
         崩れた順や空の本文を、黙って evidence にしない。 */
      const kept = ordered.reduce((n, x) => n + x.text.replace(/\s/g, "").length, 0);
      const all = paras.reduce((n, x) => n + x.text.replace(/\s/g, "").length, 0);
      if (ordered.length && kept >= all * 0.5) {
        out.push({ page: i + 1, level: 2, text: ordered.map((x) => x.lines.join("\n")).join("\n\n"),
                   blocks: ordered.length, paragraphs: paras.length,
                   reorderMs: q.ms, outTokens: q.outTokens });
        continue;
      }
      lv.why = ordered.length ? "並べ直しで本文が大きく減った" : "並べ直しの返答を読めなかった";
      /* 並べ直しに失敗したら Level 3 へ落とす（黙って崩れた順で使わない） */
      lv.level = 3;
    }
    const q = await qwen(TRANSCRIBE, [b64(files[i])], 3000);
    qwenCalls++; qwenMs += q.ms; outTokens += q.outTokens;
    if (q.truncated) truncated++;
    out.push({ page: i + 1, level: 3, text: q.text, why: lv.why,
               transcribeMs: q.ms, outTokens: q.outTokens });
  }
  return { ms: Date.now() - t0, ocrMs: o.ms, pages: out,
           qwenCalls, qwenMs, outTokens, truncated,
           levels: levels.map((l) => l.level) };
}

(async () => {
  console.log("══ ページ解析 3 方式の比較（biomimetics.pdf 全 " + files.length + " ページ）══");
  console.log("  D（RecognizeDocumentsRequest）は SDK 15.5 に無いため比較できません\n");
  const results = {};

  if (WANT.includes("A")) {
    console.log("── A. Qwen 全文・直列 ──");
    const r = await runQwenAll(1);
    const tr = r.pages.filter((p) => p.truncated).length;
    console.log("  総時間 " + (r.ms / 1000).toFixed(0) + " 秒 / 1 ページ平均 "
      + (r.ms / files.length / 1000).toFixed(1) + " 秒");
    console.log("  出力トークン計 " + r.pages.reduce((n, p) => n + p.outTokens, 0)
      + " / 途中で切れた " + tr + " ページ");
    console.log("  文字数 " + r.pages.map((p) => p.text.replace(/\s/g, "").length).join(", "));
    results.A = { ms: r.ms, truncated: tr, calls: files.length,
                  outTokens: r.pages.reduce((n, p) => n + p.outTokens, 0) };
  }

  if (WANT.includes("B")) {
    console.log("\n── B. Qwen 全文・2 並列 ──");
    const r = await runQwenAll(2);
    const tr = r.pages.filter((p) => p.truncated).length;
    /* 本当に重なって走ったかを、時刻の重なりで確かめる */
    let overlaps = 0;
    for (let i = 0; i < r.pages.length; i++)
      for (let j = i + 1; j < r.pages.length; j++)
        if (r.pages[i].startedAt < r.pages[j].endedAt && r.pages[j].startedAt < r.pages[i].endedAt)
          overlaps++;
    console.log("  総時間 " + (r.ms / 1000).toFixed(0) + " 秒 / 1 ページ平均 "
      + (r.ms / files.length / 1000).toFixed(1) + " 秒");
    console.log("  実際に重なって処理された組: " + overlaps + " 組（0 なら並列になっていない）");
    console.log("  出力トークン計 " + r.pages.reduce((n, p) => n + p.outTokens, 0)
      + " / 途中で切れた " + tr + " ページ");
    results.B = { ms: r.ms, truncated: tr, calls: files.length, overlaps,
                  outTokens: r.pages.reduce((n, p) => n + p.outTokens, 0) };
  }

  if (WANT.includes("C")) {
    console.log("\n── C. 文字認識 ＋ Qwen で並べ直し ──");
    const r = await runHybrid();
    const cnt = { 1: 0, 2: 0, 3: 0 };
    r.levels.forEach((l) => { cnt[l]++; });
    console.log("  総時間 " + (r.ms / 1000).toFixed(0) + " 秒"
      + "（文字認識 " + (r.ocrMs / 1000).toFixed(1) + " 秒 / Qwen " + (r.qwenMs / 1000).toFixed(0) + " 秒）");
    console.log("  Level 1（そのまま採用）" + cnt[1] + " ページ / "
      + "Level 2（並べ直し）" + cnt[2] + " ページ / Level 3（全文再解析）" + cnt[3] + " ページ");
    console.log("  Qwen 呼び出し " + r.qwenCalls + " 回 / 出力トークン計 " + r.outTokens
      + " / 途中で切れた " + r.truncated + " ページ");
    console.log("  文字数 " + r.pages.map((p) => p.text.replace(/\s/g, "").length).join(", "));
    results.C = { ms: r.ms, truncated: r.truncated, calls: r.qwenCalls,
                  outTokens: r.outTokens, levels: cnt };
    fs.writeFileSync("/tmp/hybrid-pages.json", JSON.stringify(r.pages, null, 1));
    console.log("  本文の中身: /tmp/hybrid-pages.json");
  }

  console.log("\n══ まとめ ══");
  console.log("  方式  総時間   Qwen呼出  出力トークン  打ち切り");
  for (const k of ["A", "B", "C"]) {
    const r = results[k];
    if (!r) continue;
    console.log("   " + k + "   " + String((r.ms / 1000).toFixed(0) + " 秒").padStart(7)
      + String(r.calls).padStart(9) + String(r.outTokens).padStart(13)
      + String(r.truncated).padStart(9));
  }
})().catch((e) => { console.error(e); process.exit(1); });
