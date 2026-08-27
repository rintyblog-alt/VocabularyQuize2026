/* VQ_TIMELINE の記録を読んで、時間の行き先を表にする。

   ・ページごとの段階（下読み / モデル / evidence / 保存 / 送出 / ページ間の空白）
   ・Ollama が自分で測った内訳（読み込み / prompt eval / 生成）
   ・生成以外の問い合わせ（/api/ps, /api/tags）が何回あったか
   ・1 ページあたり Ollama を何回叩いたか（隠れた呼び出しの有無）

   実行: node vqtlreport.cjs <timeline.jsonl>
*/
const fs = require("node:fs");
const file = process.argv[2];
if (!file) { console.error("使い方: node vqtlreport.cjs <timeline.jsonl>"); process.exit(2); }
const rows = fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

const req = new Map();
for (const r of rows) {
  if (r.kind === "ollama.request") req.set(r.reqId, { req: r });
  else if (r.kind === "ollama.done" && req.has(r.reqId)) req.get(r.reqId).done = r;
  else if (r.kind === "ollama.firstByte" && req.has(r.reqId)) req.get(r.reqId).fb = r;
  else if (r.kind === "ollama.headers" && req.has(r.reqId)) req.get(r.reqId).hd = r;
}
const pages = rows.filter((r) => r.kind === "page");
const probes = rows.filter((r) => r.kind === "ollama.probe");

const sum = (a, f) => a.reduce((n, x) => n + (Number(f(x)) || 0), 0);
const s1 = (n) => +(n / 1000).toFixed(1);

/* ── ページ別 ── */
if (pages.length) {
  console.log("\n══ ページ別タイムライン（秒）══");
  console.table(pages.map((p) => ({
    page: p.page, 空白: s1(p.interPageGapMs || 0),
    下読み: s1((p.ocrProbeEnd || 0) - (p.ocrProbeStart || 0)),
    キャッシュ照会: s1((p.cacheLookupEnd || 0) - (p.cacheLookupStart || 0)),
    モデル: s1((p.modelEnd || 0) - (p.modelStart || 0)),
    evidence: s1((p.evidenceBuildEnd || 0) - (p.evidenceBuildStart || 0)),
    保存: s1((p.cacheWriteEnd || 0) - (p.cacheWriteStart || 0)),
    送出: s1((p.sseEmitEnd || 0) - (p.sseEmitStart || 0)),
    合計: s1(p.totalPageMs),
    numPredict: p.numPredict, 下読み字数: p.ocrChars,
    状態: p.status, キャッシュ: p.fromCache ? "○" : ""
  })));
  const tot = {
    ページ数: pages.length,
    ページ間の空白: s1(sum(pages, (p) => p.interPageGapMs)),
    下読み合計: s1(sum(pages, (p) => (p.ocrProbeEnd || 0) - (p.ocrProbeStart || 0))),
    モデル合計: s1(sum(pages, (p) => (p.modelEnd || 0) - (p.modelStart || 0))),
    "evidence合計": s1(sum(pages, (p) => (p.evidenceBuildEnd || 0) - (p.evidenceBuildStart || 0))),
    保存合計: s1(sum(pages, (p) => (p.cacheWriteEnd || 0) - (p.cacheWriteStart || 0))),
    送出合計: s1(sum(pages, (p) => (p.sseEmitEnd || 0) - (p.sseEmitStart || 0))),
    ページ合計: s1(sum(pages, (p) => p.totalPageMs))
  };
  console.log("\n══ 合計（秒）══");
  console.table([tot]);
}

/* ── Ollama 呼び出し ── */
console.log("\n══ Ollama 生成リクエスト " + req.size + " 件 ══");
console.table([...req.entries()].map(([id, e]) => {
  const r = e.req, d = e.done || {};
  return {
    reqId: id, 目的: r.purpose, numCtx: r.numCtx, numPredict: r.numPredict,
    画像: r.images, 送信KB: Math.round(r.requestBytes / 1024),
    sysChars: r.systemChars, usrChars: r.userChars, format: r.hasFormat ? "有" : "",
    読込ms: d.loadMs, prefill_ms: d.promptEvalMs, 生成ms: d.evalMs,
    最初の1バイトms: e.fb ? Math.round(e.fb.ms) : null,
    壁時計ms: d.wallMs ? Math.round(d.wallMs) : null,
    inTok: d.promptEvalCount, outTok: d.evalCount, done: d.doneReason
  };
}));

const dones = [...req.values()].map((e) => e.done).filter(Boolean);
console.log("\n══ Ollama 内部時間の合計（秒）══");
console.table([{
  呼び出し回数: dones.length,
  読み込み: s1(sum(dones, (d) => d.loadMs)),
  prefill: s1(sum(dones, (d) => d.promptEvalMs)),
  生成: s1(sum(dones, (d) => d.evalMs)),
  "Ollama内部計": s1(sum(dones, (d) => d.loadMs + d.promptEvalMs + d.evalMs)),
  "Bridge側の壁時計計": s1(sum(dones, (d) => d.wallMs)),
  差: s1(sum(dones, (d) => d.wallMs - (d.loadMs + d.promptEvalMs + d.evalMs))),
  入力トークン: sum(dones, (d) => d.promptEvalCount),
  出力トークン: sum(dones, (d) => d.evalCount),
  途中で切れた: dones.filter((d) => d.doneReason === "length").length
}]);

/* モデルの読み込みが繰り返されていないか */
const reload = dones.filter((d) => d.loadMs > 1000).length;
console.log("読み込みに 1 秒以上かかった呼び出し: " + reload + " 件"
  + (reload > 1 ? "（毎回読み直している疑い）" : "（読み直しは起きていない）"));

/* ── 生成以外の問い合わせ ── */
if (probes.length) {
  const by = {};
  for (const p of probes) { by[p.name] = by[p.name] || { 回数: 0, 合計ms: 0 }; by[p.name].回数++; by[p.name].合計ms += p.ms; }
  console.log("\n══ 生成以外の Ollama 問い合わせ ══");
  console.table(Object.entries(by).map(([k, v]) => ({ 種類: k, 回数: v.回数, 合計秒: s1(v.合計ms) })));
} else {
  console.log("\n生成以外の Ollama 問い合わせ: 0 件");
}

/* 1 ページあたり何回叩いたか */
if (pages.length) {
  console.log("\n1 ページあたりの Ollama 生成リクエスト: "
    + (req.size / pages.length).toFixed(2) + " 回"
    + (req.size > pages.length ? "（1 回を超えています。隠れた呼び出しがあります）" : ""));
}
