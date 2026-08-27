/* 生成の品質と速度を、設定ファイルのケースで測る（§5・§21）。

   ── 設計の約束 ────────────────────────────────────────────
   ・テストケースは bench/cases.json だけに置く。コードへ散らさない。
   ・**特定の文言を検出して通す実装**が入っていないか見るため、
     同じ意図を別の言い方で書いたケースを混ぜてある。
   ・採点は「形式」ではなく **engine（聞き方の仕組み）** で見る。
     reorder_english も ordering も同じ reorder。呼び名の違いで
     合否が変わると、正規化を直すたびに点が動いてしまう。
   ・秒はローカル LLM のばらつきが大きい（実測で同じ条件が 2.4 倍ぶれた）。
     **呼び出し回数**を必ず併記する。

   実行:
     node vqbench.cjs                       … 全ケース
     node vqbench.cjs --group A             … グループを絞る
     node vqbench.cjs --case A1-reorder-10  … 1 ケースだけ
     node vqbench.cjs --out artifacts/bench/before.json
     node vqbench.cjs --compare a.json b.json   … 前後を比べる

   前提: Bridge が動いていること。
   **Bridge は起動時のコードを持ち続ける。local-ai を直したら必ず再起動すること。**
   （2026-08-05 の実測: 9 時間前に起動した Bridge を相手に測っていて、
     サーバ側の変更が一つも効いていなかった。）
*/
const fs = require("fs");
const path = require("path");

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const BASE = process.env.VQ_BRIDGE || "https://127.0.0.1:17891";
const HEAD = { "Content-Type": "application/json", Origin: "https://127.0.0.1:8791" };
const ROOT = __dirname;

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const ONLY_GROUP = arg("--group", null);
const ONLY_CASE = arg("--case", null);
const OUT = arg("--out", null);
const COMPARE = argv.indexOf("--compare");

/* ── 形式 → engine の対応（サーバの生成物を使う。写しを持たない） ── */
let ENGINE_BY_TYPE = {};
try {
  ENGINE_BY_TYPE = JSON.parse(fs.readFileSync(
    path.join(ROOT, "local-ai/src/schemas/question-types.generated.json"), "utf8")).engineByType || {};
} catch (e) { /* 無くても粗い語だけで動く */ }
/* 粗い 4 語も engine へ寄せる */
const COARSE = { multiple_choice: "single_choice", true_false: "true_false",
                 short_answer: "text_input", descriptive: "free_text" };
function engineOf(t) {
  const s = String(t || "");
  return ENGINE_BY_TYPE[s] || COARSE[s] || s;
}

/* ── 資料の作り方 ─────────────────────────────────────────── */
function buildAttachments(profile, defs) {
  const p = defs[profile];
  if (!p || p.kind === "none") return null;
  if (p.kind === "text") {
    let t = fs.readFileSync(path.join(ROOT, p.file), "utf8");
    if (p.repeat) t = Array.from({ length: p.repeat }, (_, i) =>
      "[p." + (i + 1) + "] " + t).join("\n\n");
    else t = "[p.1] " + t;
    return [{ id: "a1", name: "資料.pdf", kind: "pdf", extractedText: t, pageCount: p.pages || 1 }];
  }
  if (p.kind === "images") {
    const dir = path.join(ROOT, p.dir);
    const files = fs.readdirSync(dir).filter((f) => /\.png$/i.test(f)).sort().slice(0, p.pages || 3);
    return files.map((f, i) => ({
      id: "a" + (i + 1), name: "資料（" + (i + 1) + "ページ）.png", kind: "image",
      pageNumber: i + 1, pageCount: files.length,
      imageBase64: fs.readFileSync(path.join(dir, f)).toString("base64")
    }));
  }
  return null;
}

/* ── 1 ケース実行 ─────────────────────────────────────────── */
async function runCase(c, defs, jobIds) {
  const t0 = Date.now();
  const atts = buildAttachments(c.profile, defs);
  const jobId = c.reuseJobOf ? jobIds[c.reuseJobOf] : ("bench-" + c.id + "-" + (Date.now() % 100000));
  jobIds[c.id] = jobId;

  const body = {
    requestId: "bench-" + c.id,
    message: c.prompt,
    modelId: "standard", thinkingLevel: "normal",
    options: { structuredOutput: c.engine === "mock" ? "mock" : "preset", jobId: jobId }
  };
  if (atts) { body.attachments = atts; body.options.sourceOnly = true; body.options.requireCitations = true; }

  let err = null, structured = null, usage = null, firstQ = null;
  const calls = [], stages = [];
  const res = await fetch(BASE + "/chat/completions", {
    method: "POST", headers: HEAD, body: JSON.stringify(body)
  }).catch((e) => ({ ok: false, status: 0, _e: String(e && e.message) }));
  if (!res || !res.ok) return { id: c.id, ok: false, err: "HTTP " + (res && res.status), totalMs: Date.now() - t0 };

  const rd = res.body.getReader(), dec = new TextDecoder();
  let buf = "", ev = "", data = "";
  while (true) {
    const ch = await rd.read();
    if (ch.done) break;
    buf += dec.decode(ch.value, { stream: true });
    const lines = buf.split("\n"); buf = lines.pop() || "";
    for (const L of lines) {
      if (L.startsWith("event: ")) { ev = L.slice(7).trim(); continue; }
      if (L.startsWith("data: ")) { data = L.slice(6); continue; }
      if (L !== "" || !ev) continue;
      let j = null; try { j = JSON.parse(data); } catch (e) {}
      if (j) {
        if (ev === "usage") usage = j;
        if (ev === "structured") { structured = j; if (firstQ === null) firstQ = Date.now() - t0; }
        if (ev === "error") err = j.message || j.code;
        if (ev === "metrics") {
          (j.calls || []).forEach((x) => calls.push(x));
          (j.stages || []).forEach((x) => stages.push(x));
        }
      }
      ev = ""; data = "";
    }
  }
  const totalMs = Date.now() - t0;

  /* できた問題を取り出す */
  const d = (structured && (structured.data || structured)) || {};
  const qs = [];
  (d.questions || []).forEach((q) => qs.push(q));
  (d.sections || []).forEach((s) => (s.questions || []).forEach((q) => qs.push(q)));

  const byEngine = {};
  qs.forEach((q) => {
    const e = engineOf(q.questionType || q.type);
    byEngine[e] = (byEngine[e] || 0) + 1;
  });
  /* 正答の有無と重複は **本番と同じ処理**（local-ai の canonical-answer）で数える。
     ここに写しを書くと、片方だけ直したときに数字がずれる。
     実測（2026-08-05）: 写しを持っていたせいで、中身が入っているのに
     「正答なし 10 問」と誤って減点していた（形式ごとの置き場所を知らなかった）。 */
  const CA = await import(
    "file://" + path.join(ROOT, "local-ai/src/orchestrator/canonical-answer.mjs"));
  const mm = CA.countMissingAnswers(qs, d.answerKey || []);
  const missingAnswer = mm.missing;
  const dup = CA.countDuplicates(qs);
  let missingExpl = 0;
  qs.forEach((q) => { if (!String(q.explanation || "").trim()) missingExpl++; });

  const pageReads = calls.filter((x) => /vision|ocr/i.test(String(x.role || ""))).length;
  const repairs = calls.filter((x) => /patcher|repair/i.test(String(x.role || ""))).length;

  return {
    id: c.id, group: c.group, engine: c.engine, profile: c.profile,
    ok: !err, err, totalMs, timeToFirstQuestionMs: firstQ,
    made: qs.length, byEngine, missingAnswer, missingExpl, duplicates: dup,
    aiCalls: (usage && usage.modelCalls) || calls.length,
    repairCalls: repairs, pageReads,
    roles: calls.map((x) => x.role + ":" + Math.round((x.ms || 0) / 1000) + "s"),
    stageFail: stages.filter((s) => s.status === "failed").map((s) => s.stage),
    /* 採点をやり直せるよう、生の問題も残す（実 AI を何度も回さないため）。
       採点側の数え方を直したときは --rescore で測り直さずに採り直せる。 */
    raw: { questions: qs, answerKey: d.answerKey || [] }
  };
}

/* ── 採点（§21）──────────────────────────────────────────── */
function score(c, r) {
  const E = c.expected || {};
  const notes = [];
  let pts = 0, max = 0;
  const add = (got, of, why) => { pts += got; max += of; if (got < of) notes.push(why); };

  /* ── 断るのが正解のケース（矛盾・未対応）─────────────────────
     ここで問われているのは「作らないこと」。
     0 問なのを「正答なし」「重複なし」などの物差しで測ると、
     正しく断ったのに不合格になる（実測 2026-08-05: 0 秒・AI 0 回で
     正しく断ったのに 71 点・不合格と出た）。 */
  if (E.contractStatus) {
    const refused = r.made === 0;
    const noAi = (r.aiCalls || 0) === 0;
    const b0 = c.budget || {};
    const over = b0.maxTotalDurationMs && r.totalMs > b0.maxTotalDurationMs;
    const ns = [];
    if (!refused) ns.push(E.contractStatus + " のはずが " + r.made + " 問つくって完成扱いにした");
    if (!noAi) ns.push("断るべきなのに AI を " + r.aiCalls + " 回呼んだ");
    if (over) ns.push("時間超過 " + (r.totalMs / 1000).toFixed(0) + "s");
    const sc = refused ? (noAi ? 100 : 70) : 0;
    return { score: sc, pass: sc >= 90 && !over, notes: ns, overTime: !!over, overCalls: false };
  }

  /* 問題数 15 */
  if (E.totalQuestions != null) {
    const exact = r.made === E.totalQuestions;
    add(exact ? 15 : (r.made > 0 ? Math.max(0, 15 - Math.abs(r.made - E.totalQuestions) * 3) : 0), 15,
      "問題数 " + r.made + " / " + E.totalQuestions);
  } else if (E.allowShortfall) {
    add(r.made > 0 ? 15 : 0, 15, "1 問も作れていない");
  }

  /* 形式 20 */
  const engines = Object.keys(r.byEngine);
  if (E.exactEngineDistribution) {
    const want = E.exactEngineDistribution;
    const keys = Object.keys(want);
    let hit = 0;
    keys.forEach((k) => { if ((r.byEngine[k] || 0) === want[k]) hit++; });
    add(Math.round(20 * hit / keys.length), 20,
      "配分ちがい 期待 " + JSON.stringify(want) + " / 実際 " + JSON.stringify(r.byEngine));
  } else if (E.allowedEngines) {
    const bad = engines.filter((e) => E.allowedEngines.indexOf(e) < 0);
    const okCount = engines.length ? engines.length - bad.length : 0;
    add(bad.length === 0 && engines.length ? 20 : Math.round(20 * okCount / Math.max(1, engines.length)), 20,
      bad.length ? "指定外の形式: " + bad.join(",") : "形式が 1 つも出ていない");
  }

  /* 禁止形式 10 */
  if (E.forbiddenEngines) {
    const hit = engines.filter((e) => E.forbiddenEngines.indexOf(e) >= 0);
    add(hit.length ? 0 : 10, 10, "禁止形式が出た: " + hit.join(","));
  }

  /* 正答 10 */
  if (E.correctAnswerRequired !== false) {
    add(r.made && r.missingAnswer === 0 ? 10 : (r.made ? Math.max(0, 10 - r.missingAnswer * 2) : 0), 10,
      "正答なし " + r.missingAnswer + " 問");
  }
  /* 解説 5 */
  if (E.explanationRequired) {
    add(r.made && r.missingExpl === 0 ? 5 : Math.max(0, 5 - r.missingExpl), 5,
      "解説なし " + r.missingExpl + " 問");
  }
  /* 重複 5 */
  add(r.duplicates === 0 ? 5 : 0, 5, "重複 " + r.duplicates + " 問");

  /* 契約の状態（矛盾・未対応） */
  if (E.contractStatus) {
    const refused = r.made === 0;
    add(refused ? 20 : 0, 20,
      E.contractStatus + " のはずが " + r.made + " 問つくって完成扱いにした");
  }
  /* 同じ資料の 2 回目 */
  if (E.expectNoPageReads) {
    add(r.pageReads === 0 ? 10 : 0, 10, "2 回目なのにページを " + r.pageReads + " 回読んだ");
  }

  const pct = max ? Math.round(pts / max * 100) : 0;
  /* 予算 */
  const b = c.budget || {};
  const overTime = b.maxTotalDurationMs && r.totalMs > b.maxTotalDurationMs;
  const overCalls = b.maxAiCalls && r.aiCalls > b.maxAiCalls;
  if (overTime) notes.push("時間超過 " + (r.totalMs / 1000).toFixed(0) + "s > " + (b.maxTotalDurationMs / 1000) + "s");
  if (overCalls) notes.push("呼び出し超過 " + r.aiCalls + " > " + b.maxAiCalls);

  return { score: pct, pass: pct >= 90 && !overTime && !overCalls, notes, overTime: !!overTime, overCalls: !!overCalls };
}

/* ── 比較 ─────────────────────────────────────────────────── */
function compare(fa, fb) {
  const A = JSON.parse(fs.readFileSync(fa, "utf8"));
  const B = JSON.parse(fs.readFileSync(fb, "utf8"));
  const byId = (x) => Object.fromEntries((x.results || []).map((r) => [r.id, r]));
  const a = byId(A), b = byId(B);
  const ids = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  console.log("\n══ 前後の比較 ══");
  console.log("  " + "caseId".padEnd(22) + "点(前→後)".padEnd(16) + "問題数".padEnd(14) + "秒".padEnd(16) + "AI呼出");
  let ip = 0, dn = 0;
  ids.forEach((id) => {
    const x = a[id], y = b[id];
    if (!x || !y) { console.log("  " + id.padEnd(22) + "（片方のみ）"); return; }
    const d = y.score - x.score;
    if (d > 0) ip++; if (d < 0) dn++;
    console.log("  " + id.padEnd(22)
      + (x.score + "→" + y.score + (d > 0 ? " ↑" : d < 0 ? " ↓" : "  ")).padEnd(16)
      + (x.made + "→" + y.made).padEnd(14)
      + ((x.totalMs / 1000).toFixed(0) + "→" + (y.totalMs / 1000).toFixed(0) + "s").padEnd(16)
      + (x.aiCalls + "→" + y.aiCalls));
  });
  const avg = (o) => { const v = Object.values(o); return v.length ? Math.round(v.reduce((s, r) => s + r.score, 0) / v.length) : 0; };
  const tot = (o) => Object.values(o).reduce((s, r) => s + r.totalMs, 0);
  console.log("\n  平均点     " + avg(a) + " → " + avg(b));
  console.log("  合計時間   " + (tot(a) / 60000).toFixed(1) + "分 → " + (tot(b) / 60000).toFixed(1) + "分");
  console.log("  良化 " + ip + " 件 / 悪化 " + dn + " 件");
}

(async () => {
  if (COMPARE >= 0) { compare(argv[COMPARE + 1], argv[COMPARE + 2]); return; }

  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "bench/cases.json"), "utf8"));
  let cases = cfg.cases;
  if (ONLY_GROUP) cases = cases.filter((c) => String(c.group || "").indexOf(ONLY_GROUP) === 0);
  if (ONLY_CASE) cases = cases.filter((c) => c.id === ONLY_CASE);
  if (!cases.length) { console.error("ケースがありません"); process.exit(1); }

  const h = await fetch(BASE + "/health").catch(() => null);
  if (!h || !h.ok) { console.error("Bridge へ繋がりません: " + BASE); process.exit(1); }

  console.log("ケース " + cases.length + " 件（Bridge: " + BASE + "）");
  console.log("※ local-ai を直したあとは Bridge の再起動が要ります。\n");

  const out = { at: new Date().toISOString(), results: [] };
  const jobIds = {};
  for (const c of cases) {
    process.stdout.write("  " + c.id.padEnd(22) + " … ");
    let r;
    try { r = await runCase(c, cfg.profiles, jobIds); }
    catch (e) { r = { id: c.id, ok: false, err: String(e && e.message), totalMs: 0, made: 0, byEngine: {}, aiCalls: 0, repairCalls: 0, pageReads: 0, missingAnswer: 0, missingExpl: 0, duplicates: 0 }; }
    const s = score(c, r);
    Object.assign(r, s, { group: c.group });
    out.results.push(r);
    console.log((s.pass ? "合格" : "不合格") + " " + String(s.score).padStart(3) + "点  "
      + (r.totalMs / 1000).toFixed(0) + "s  " + r.made + "問  AI" + r.aiCalls + "回"
      + (r.pageReads ? " 読取" + r.pageReads : "")
      + (s.notes.length ? "  ← " + s.notes.slice(0, 2).join(" / ") : ""));
  }

  console.log("\n══ まとめ ══");
  const pass = out.results.filter((r) => r.pass).length;
  const avg = Math.round(out.results.reduce((s, r) => s + r.score, 0) / out.results.length);
  console.log("  合格 " + pass + " / " + out.results.length + "   平均 " + avg + " 点");
  console.log("  合計時間 " + (out.results.reduce((s, r) => s + r.totalMs, 0) / 60000).toFixed(1) + " 分");
  const ms = out.results.map((r) => r.totalMs).sort((a, b) => a - b);
  const p = (q) => ms.length ? (ms[Math.min(ms.length - 1, Math.floor(ms.length * q))] / 1000).toFixed(0) : 0;
  console.log("  1 件あたり p50 " + p(0.5) + "s / p95 " + p(0.95) + "s");

  const byGroup = {};
  out.results.forEach((r) => {
    const g = r.group || "?";
    (byGroup[g] = byGroup[g] || []).push(r);
  });
  console.log("\n  グループ別:");
  Object.keys(byGroup).sort().forEach((g) => {
    const v = byGroup[g];
    console.log("    " + g.padEnd(20) + " 合格 " + v.filter((r) => r.pass).length + "/" + v.length
      + "  平均 " + Math.round(v.reduce((s, r) => s + r.score, 0) / v.length) + " 点");
  });

  if (OUT) {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
    console.log("\n記録: " + OUT);
  }
  console.log("");
})().catch((e) => { console.error(e); process.exit(1); });
