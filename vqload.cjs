/* いま何にどれだけ時間を使っているかを、記録から読む。

   実行:
     node vqload.cjs            … 全期間
     node vqload.cjs 24         … 直近 24 時間
     node vqload.cjs 24 stages  … 工程ごとの内訳も出す

   読むもの: ~/Library/Application Support/VocabuQuiz/Logs/metrics.jsonl
   （数字だけ。会話本文・添付・利用者IDは入っていない）
*/
const fs = require("fs");
const os = require("os");
const path = require("path");

const FILE = path.join(os.homedir(), "Library", "Application Support", "VocabuQuiz", "Logs", "metrics.jsonl");
const HOURS = Number(process.argv[2]) || 0;
const WANT_STAGES = process.argv.includes("stages");

if (!fs.existsSync(FILE)) {
  console.log("記録がまだありません:", FILE);
  console.log("Bridge を動かして 1 回でも生成すると作られます。");
  process.exit(0);
}

const cutoff = HOURS ? Date.now() - HOURS * 3600 * 1000 : 0;
const rows = fs.readFileSync(FILE, "utf8").trim().split("\n")
  .map((l) => { try { return JSON.parse(l); } catch { return null; } })
  .filter((r) => r && (!cutoff || new Date(r.t).getTime() >= cutoff));

if (!rows.length) { console.log("その期間の記録はありません。"); process.exit(0); }

const pc = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const sec = (ms) => (ms / 1000).toFixed(0);
const pad = (s, n) => String(s).padEnd(n);
const rpad = (s, n) => String(s).padStart(n);

console.log(`\n══ 負荷のまとめ（${HOURS ? "直近 " + HOURS + " 時間" : "全期間"}・${rows.length} 件）══`);
console.log(`  期間: ${rows[0].t} 〜 ${rows[rows.length - 1].t}`);

/* ── 種類ごと ── */
const ok = rows.filter((r) => r.status !== "failed" && r.status !== "cancelled");
const ng = rows.filter((r) => r.status === "failed");
const cx = rows.filter((r) => r.status === "cancelled");

const by = {};
for (const r of ok) { const k = r.taskType || "(不明)"; (by[k] = by[k] || []).push(r); }

console.log(`\n── 種類ごと（成功したもの）──`);
console.log("  " + pad("種類", 20) + rpad("件数", 5) + rpad("p50秒", 7) + rpad("p95秒", 7)
  + rpad("待ちp50秒", 10) + rpad("呼出", 6) + rpad("入力Tok", 9));
for (const k of Object.keys(by).sort((a, b) => by[b].length - by[a].length)) {
  const a = by[k];
  console.log("  " + pad(k, 20) + rpad(a.length, 5)
    + rpad(sec(pc(a.map((x) => x.totalMs || 0), 0.5)), 7)
    + rpad(sec(pc(a.map((x) => x.totalMs || 0), 0.95)), 7)
    + rpad(sec(pc(a.map((x) => x.queuedMs || 0), 0.5)), 10)
    + rpad(pc(a.map((x) => x.modelCalls || 0), 0.5), 6)
    + rpad(pc(a.map((x) => x.promptTokens || 0), 0.5), 9));
}

/* ── 待ち時間 ── */
const waited = ok.filter((r) => (r.queuedMs || 0) > 1000);
console.log(`\n── 順番待ち ──`);
console.log(`  待たされた依頼: ${waited.length} / ${ok.length} 件`
  + (waited.length ? `（p50 ${sec(pc(waited.map((x) => x.queuedMs), 0.5))}秒 / 最長 ${sec(Math.max(...waited.map((x) => x.queuedMs)))}秒）` : ""));

/* ── 人ごと ── */
const people = {};
for (const r of rows) { const w = r.owner || "(不明)"; (people[w] = people[w] || []).push(r); }
const names = Object.keys(people).sort((a, b) =>
  people[b].reduce((x, y) => x + (y.totalMs || 0), 0) - people[a].reduce((x, y) => x + (y.totalMs || 0), 0));
console.log(`\n── 人ごと（${names.length} 人）──`);
names.slice(0, 10).forEach((w) => {
  const a = people[w];
  const mins = Math.round(a.reduce((x, y) => x + (y.totalMs || 0), 0) / 60000);
  console.log(`  ${pad(w, 12)}${rpad(a.length, 5)} 件 / ${rpad(mins, 5)} 分`);
});

/* ── 失敗 ── */
if (ng.length || cx.length) {
  console.log(`\n── 失敗・中断 ──`);
  console.log(`  失敗 ${ng.length} 件 / 中断 ${cx.length} 件`);
  const byCode = {};
  for (const r of ng) { const k = (r.code || "(不明)") + " @ " + (r.stoppedAt || "?"); byCode[k] = (byCode[k] || 0) + 1; }
  Object.keys(byCode).sort((a, b) => byCode[b] - byCode[a]).slice(0, 8)
    .forEach((k) => console.log(`    ${rpad(byCode[k], 4)} 件  ${k}`));
}

/* ── 工程ごと ── */
if (WANT_STAGES) {
  const st = {};
  for (const r of rows) for (const s of r.stages || []) {
    const b = st[s.stage] || (st[s.stage] = { n: 0, total: 0, all: [] });
    b.n++; b.total += s.ms || 0; b.all.push(s.ms || 0);
  }
  console.log(`\n── 工程ごと（遅い順）──`);
  console.log("  " + pad("工程", 24) + rpad("回数", 6) + rpad("合計分", 8) + rpad("p50秒", 7) + rpad("p95秒", 7));
  Object.keys(st).sort((a, b) => st[b].total - st[a].total).slice(0, 16).forEach((k) => {
    const b = st[k];
    console.log("  " + pad(k, 24) + rpad(b.n, 6) + rpad((b.total / 60000).toFixed(1), 8)
      + rpad(sec(pc(b.all, 0.5)), 7) + rpad(sec(pc(b.all, 0.95)), 7));
  });
}

/* ── 合計 ── */
const totalMin = Math.round(rows.reduce((a, b) => a + (b.totalMs || 0), 0) / 60000);
const spanMin = Math.max(1, Math.round((new Date(rows[rows.length - 1].t) - new Date(rows[0].t)) / 60000));
console.log(`\n── 合計 ──`);
console.log(`  モデル稼働 ${totalMin} 分 / 実時間 ${spanMin} 分（稼働率 ${Math.round(totalMin / spanMin * 100)}%）`);
console.log(`  入力 ${(rows.reduce((a, b) => a + (b.promptTokens || 0), 0) / 1000).toFixed(0)}k Token`
  + ` / 出力 ${(rows.reduce((a, b) => a + (b.completionTokens || 0), 0) / 1000).toFixed(0)}k Token`);
console.log(`\n記録: ${FILE}\n`);
