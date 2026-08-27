/* Bridge が書き出した metrics.jsonl を、工程別・Role 別にまとめて比べる。

   Bridge は生成のたびに 1 行ずつ JSONL を書いている（有効化は不要）。
     ~/Library/Application Support/VocabuQuiz/Logs/metrics.jsonl
   1 行に totalMs / queuedMs / stages[] / calls[] / トークン数 / retries が入る。

   ところがこれを**表にする道具が無かった**ため、
   「速くなった／遅くなった」を実測で言えなかった。ここがその道具。

   使い方:
     node vqmetrics.cjs                       … 既定のログを要約
     node vqmetrics.cjs <file>                … 指定のログを要約
     node vqmetrics.cjs <before> <after>      … 2 つを比べる
     node vqmetrics.cjs <file> --since <ISO>  … その時刻以降だけ
     node vqmetrics.cjs <file> --task mock_generation

   注意:
     ・metrics.jsonl は 5MB で世代送りされる。**計測の前に必ず退避すること**。
     ・件数が少ない区間の p50 は当てにならない。n を必ず見ること。
*/
const fs = require("fs");
const os = require("os");
const path = require("path");

const DEFAULT_LOG = path.join(os.homedir(),
  "Library", "Application Support", "VocabuQuiz", "Logs", "metrics.jsonl");

/* ── 引数 ── */
const argv = process.argv.slice(2);
const files = [];
let since = null, taskFilter = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--since") { since = Date.parse(argv[++i]); continue; }
  if (a === "--task") { taskFilter = argv[++i]; continue; }
  if (a.startsWith("--")) continue;
  files.push(a);
}
if (!files.length) files.push(DEFAULT_LOG);

function read(file) {
  if (!fs.existsSync(file)) {
    console.error("ログがありません: " + file);
    process.exit(1);
  }
  const out = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let d; try { d = JSON.parse(line); } catch (e) { continue; }
    if (!d || !d.totalMs) continue;
    if (since && Date.parse(d.t) < since) continue;
    if (taskFilter && d.taskType !== taskFilter) continue;
    out.push(d);
  }
  return out;
}

const pct = (arr, q) => {
  if (!arr.length) return 0;
  const v = arr.slice().sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.floor(v.length * q))];
};
const s = (ms) => (ms / 1000).toFixed(1);
const pad = (v, n) => String(v).padEnd(n);
const rpad = (v, n) => String(v).padStart(n);

/* ── 1 本ぶんの集計 ── */
function summarize(rows) {
  const byTask = new Map();
  const byStage = new Map();
  const byRole = new Map();
  let retries = 0, promptTok = 0, compTok = 0, queued = 0;

  for (const d of rows) {
    const t = d.taskType || "?";
    if (!byTask.has(t)) byTask.set(t, []);
    byTask.get(t).push(d.totalMs);

    queued += d.queuedMs || 0;
    retries += (d.retries || []).length;
    promptTok += d.promptTokens || 0;
    compTok += d.completionTokens || 0;

    for (const st of d.stages || []) {
      if (!st || !st.stage) continue;
      const cur = byStage.get(st.stage) || { n: 0, ms: [], sum: 0 };
      cur.n++; cur.ms.push(st.ms || 0); cur.sum += st.ms || 0;
      byStage.set(st.stage, cur);
    }
    for (const c of d.calls || []) {
      if (!c || !c.role) continue;
      const cur = byRole.get(c.role) || { n: 0, ms: [], sum: 0, out: 0 };
      cur.n++; cur.ms.push(c.ms || 0); cur.sum += c.ms || 0; cur.out += c.out || 0;
      byRole.set(c.role, cur);
    }
  }
  return { rows, byTask, byStage, byRole, retries, promptTok, compTok, queued };
}

function printOne(label, S) {
  console.log("\n══ " + label + "（" + S.rows.length + " 件）══");

  console.log("\n── 種類ごとの所要 ──");
  console.log("  " + pad("taskType", 22) + rpad("n", 5) + rpad("p50", 9) + rpad("p90", 9) + rpad("最大", 9));
  [...S.byTask.entries()].sort((a, b) => b[1].length - a[1].length).forEach(([k, v]) => {
    console.log("  " + pad(k, 22) + rpad(v.length, 5)
      + rpad(s(pct(v, 0.5)) + "s", 9) + rpad(s(pct(v, 0.9)) + "s", 9)
      + rpad(s(Math.max(...v)) + "s", 9));
  });

  console.log("\n── 工程ごと（1 回あたり p50 / 合計に占める割合）──");
  const totalStage = [...S.byStage.values()].reduce((a, v) => a + v.sum, 0) || 1;
  console.log("  " + pad("stage", 26) + rpad("n", 6) + rpad("p50", 9) + rpad("割合", 8));
  [...S.byStage.entries()].sort((a, b) => b[1].sum - a[1].sum).slice(0, 14).forEach(([k, v]) => {
    console.log("  " + pad(k, 26) + rpad(v.n, 6) + rpad(s(pct(v.ms, 0.5)) + "s", 9)
      + rpad((v.sum / totalStage * 100).toFixed(1) + "%", 8));
  });

  console.log("\n── Role ごと（モデル呼び出し）──");
  console.log("  " + pad("role", 26) + rpad("回数", 6) + rpad("p50", 9) + rpad("出力計", 10));
  [...S.byRole.entries()].sort((a, b) => b[1].sum - a[1].sum).slice(0, 12).forEach(([k, v]) => {
    console.log("  " + pad(k, 26) + rpad(v.n, 6) + rpad(s(pct(v.ms, 0.5)) + "s", 9)
      + rpad(v.out, 10));
  });

  console.log("\n── そのほか ──");
  console.log("  やり直し（retries）: " + S.retries + " 件");
  console.log("  待ち時間の合計    : " + s(S.queued) + "s");
  console.log("  トークン（入/出） : " + S.promptTok + " / " + S.compTok);
}

/* ── 2 本の比較 ── */
function compare(A, B) {
  console.log("\n══ 比較（前 → 後）══");
  const keys = new Set([...A.byTask.keys(), ...B.byTask.keys()]);
  console.log("\n── 種類ごとの p50 ──");
  console.log("  " + pad("taskType", 22) + rpad("前 n", 6) + rpad("前 p50", 10)
    + rpad("後 n", 6) + rpad("後 p50", 10) + rpad("変化", 10));
  for (const k of keys) {
    const a = A.byTask.get(k) || [], b = B.byTask.get(k) || [];
    if (!a.length || !b.length) {
      console.log("  " + pad(k, 22) + rpad(a.length, 6) + rpad(a.length ? s(pct(a, 0.5)) + "s" : "-", 10)
        + rpad(b.length, 6) + rpad(b.length ? s(pct(b, 0.5)) + "s" : "-", 10) + rpad("（比較不可）", 10));
      continue;
    }
    const pa = pct(a, 0.5), pb = pct(b, 0.5);
    const r = pa ? (pb / pa) : 0;
    const mark = r < 0.95 ? ("×" + (1 / r).toFixed(2) + " 速い")
      : r > 1.05 ? ("×" + r.toFixed(2) + " 遅い") : "ほぼ同じ";
    console.log("  " + pad(k, 22) + rpad(a.length, 6) + rpad(s(pa) + "s", 10)
      + rpad(b.length, 6) + rpad(s(pb) + "s", 10) + rpad(mark, 10));
  }

  console.log("\n── 工程ごとの p50 ──");
  const sk = new Set([...A.byStage.keys(), ...B.byStage.keys()]);
  console.log("  " + pad("stage", 26) + rpad("前 p50", 10) + rpad("後 p50", 10) + rpad("前 n", 7) + rpad("後 n", 7));
  for (const k of sk) {
    const a = A.byStage.get(k), b = B.byStage.get(k);
    console.log("  " + pad(k, 26)
      + rpad(a ? s(pct(a.ms, 0.5)) + "s" : "-", 10)
      + rpad(b ? s(pct(b.ms, 0.5)) + "s" : "-", 10)
      + rpad(a ? a.n : 0, 7) + rpad(b ? b.n : 0, 7));
  }
  console.log("\n  ※ 件数（n）が少ない行の p50 は当てにならない。必ず n を見ること。");
}

const A = summarize(read(files[0]));
if (files.length === 1) {
  printOne(path.basename(files[0]), A);
} else {
  const B = summarize(read(files[1]));
  printOne("前: " + path.basename(files[0]), A);
  printOne("後: " + path.basename(files[1]), B);
  compare(A, B);
}
console.log("");
