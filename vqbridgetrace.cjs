/* Bridge 経由のページ解析が、直接実行より 225 秒遅い件の切り分け。

   同じ 10 ページ・ウォーム状態で、層を 1 つずつ足しながら測る。

     A. Ollama へ直接 HTTP（vqocrbench の A と同じ形）
     B. ＋ ModelRunner / vision-analyst（Bridge が実際に送る最終リクエスト）
     C. ＋ ingestImageEvidence（下読み・evidence・キャッシュ・ジョブ状態）

   どの層で増えるかを見る。処理順序や設定値は**変えない**。測るだけ。

   実行: node vqbridgetrace.cjs A B C
         VQ_TIMELINE=/path/to/timeline.jsonl node vqbridgetrace.cjs C
*/
const fs = require("node:fs");
const path = require("node:path");

const OLLAMA = process.env.VQ_OLLAMA || "http://127.0.0.1:11434";
const PAGES = process.env.VQ_PAGES
  || "/private/tmp/claude-501/-Users-user-Downloads-word-practice-v26-menu-terms-report-emailjs/ea86a79f-1ff2-4347-9303-995fcdd2a12d/scratchpad/pages";
const WANT = (process.argv.slice(2).length ? process.argv.slice(2) : ["A", "B", "C"])
  .map((s) => s.toUpperCase());

const files = fs.readdirSync(PAGES).filter((f) => /\.png$/.test(f)).sort()
  .map((f) => path.join(PAGES, f));
const b64 = (p) => fs.readFileSync(p).toString("base64");

const HERE = path.join(__dirname, "local-ai");
const CFG = JSON.parse(fs.readFileSync(path.join(HERE, "config", "models.json"), "utf8"));
const MODEL = CFG.models["standard-instruct"].ref;

/* 壁時計ではなく単調時計。経過の比較に Date.now() を使わない。 */
const hr = () => Number(process.hrtime.bigint()) / 1e6;

/* ── A：直接 ─────────────────────────────────────────────── */
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

async function runA() {
  const rows = [];
  const t0 = hr();
  for (let i = 0; i < files.length; i++) {
    const s = hr();
    const r = await fetch(OLLAMA + "/api/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL, prompt: TRANSCRIBE, images: [b64(files[i])], stream: false,
        options: { temperature: 0.2, num_predict: 3000, num_ctx: 16384 }
      })
    });
    const j = await r.json();
    rows.push({
      page: i + 1, wallMs: +(hr() - s).toFixed(0),
      loadMs: +((j.load_duration || 0) / 1e6).toFixed(0),
      promptEvalMs: +((j.prompt_eval_duration || 0) / 1e6).toFixed(0),
      evalMs: +((j.eval_duration || 0) / 1e6).toFixed(0),
      inTok: j.prompt_eval_count || 0, outTok: j.eval_count || 0,
      doneReason: j.done_reason || null
    });
    process.stdout.write(".");
  }
  return { rows, totalMs: +(hr() - t0).toFixed(0) };
}

/* ── B / C：Bridge の中身を直接使う ──────────────────────── */
async function loadBridge() {
  const u = (p) => require("node:url").pathToFileURL(path.join(HERE, "src", p)).href;
  const [{ OllamaProvider }, { ModelManager }, { Budget }, { ModelRunner },
         vision, ingest, TM] = await Promise.all([
    import(u("providers/ollama.mjs")), import(u("orchestrator/model-manager.mjs")),
    import(u("orchestrator/budget-manager.mjs")), import(u("orchestrator/model-runner.mjs")),
    import(u("roles/vision-analyst.mjs")), import(u("orchestrator/pipeline-structured.mjs")),
    import(u("diagnostics/timeline.mjs"))
  ]);
  const provider = new OllamaProvider(CFG);
  const models = new ModelManager(provider, CFG);
  return { provider, models, Budget, ModelRunner, vision, ingest, TM };
}

function makeRunner(B, budgetLevel) {
  const budget = new B.Budget(budgetLevel || "normal",
    (CFG.orchestrator && CFG.orchestrator.budgets && CFG.orchestrator.budgets[budgetLevel || "normal"]) || null);
  /* 読み取りだけを測る。生成ぶんの上限で途中から呼べなくなると
     「速くなった」に見えてしまうので、読み取りぶんは確保しておく。 */
  if (budget.reserveVision) budget.reserveVision(files.length);
  const runner = new B.ModelRunner({
    provider: B.provider, models: B.models, cfg: CFG, budget,
    signal: null, onEvent: () => {}, jobId: "trace"
  });
  return { runner, budget };
}

async function runB(B) {
  const { runner } = makeRunner(B);
  const rows = [];
  const t0 = hr();
  for (let i = 0; i < files.length; i++) {
    const s = hr();
    const r = await B.vision.analyzeImages(runner, {
      images: [{ b64: b64(files[i]), name: "p" + (i + 1) }],
      question: "", numCtx: 16384, maxOut: 3000, mode: "transcribe"
    });
    rows.push({ page: i + 1, wallMs: +(hr() - s).toFixed(0),
                chars: String((r && r.text) || "").length,
                doneReason: (r && r.doneReason) || null });
    process.stdout.write(".");
  }
  return { rows, totalMs: +(hr() - t0).toFixed(0), calls: runner.metrics() };
}

async function runC(B) {
  const { runner, budget } = makeRunner(B);
  /* context.store は ingestImageEvidence が add() を呼ぶだけなので、
     受け皿だけ用意する（本物の Evidence Store は生成側の都合を持ち込む）。 */
  const added = [];
  const context = {
    images: files.map((f, i) => ({
      b64: b64(f), name: "biomimetics.pdf（" + (i + 1) + "ページ）",
      id: "img" + (i + 1), parentAttachmentId: "att1", pageNumber: i + 1,
      contentHash: "trace-" + path.basename(f) + "-" + fs.statSync(f).size
    })),
    store: { add: (c) => added.push(c), isEmpty: () => !added.length },
    files: []
  };
  const t0 = hr();
  const out = await B.ingest.ingestImageEvidence({
    runner, context, budget,
    request: { message: "", options: { questionCount: 10 } },
    emit: () => {}, numCtx: 16384,
    analysisText: ""
  });
  return {
    totalMs: +(hr() - t0).toFixed(0),
    visionCalls: out.visionCalls, cacheHits: out.cacheHits,
    ocrMs: out.ocrMs, ocrPages: out.ocrPages,
    added: out.added, pages: out.pages.map((p) => p.status),
    calls: runner.metrics()
  };
}

/* ── 測る前に状態をそろえる ──────────────────────────────────

   Ollama は「同じプロンプト＋同じ画像」の prefill を丸ごと覚えている。
   実測: 同じページを 2 度目に送ると prompt_eval が 7,598ms → 16ms になった。
   一度読んだ画像で測ると、画像を見る時間がまるごと消えて 2 倍速く見える。

   方式を比べるときは、毎回この覚えを捨ててから測る。
   keep_alive 0 でモデルを降ろすと KV も消える。降ろしたあと、
   本番と同じ num_ctx で載せ直してから測り始める（読み込み時間を混ぜない）。 */
async function reset() {
  await fetch(OLLAMA + "/api/generate", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, prompt: "", keep_alive: 0 })
  });
  await new Promise((r) => setTimeout(r, 2000));
  await fetch(OLLAMA + "/api/generate", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL, prompt: "1", stream: false, keep_alive: CFG.runtime.keepAlive,
      options: { num_ctx: 16384, num_predict: 1 }
    })
  });
}

(async () => {
  console.log("ページ数:", files.length, "／ モデル:", MODEL);
  const B = (WANT.includes("B") || WANT.includes("C")) ? await loadBridge() : null;
  const res = {};
  for (const w of WANT) {
    console.log("\n── " + w + " ──（覚えを捨ててから測ります）");
    await reset();
    const ps = await (await fetch(OLLAMA + "/api/ps")).json();
    console.log("  常駐:", (ps.models || []).map((m) => m.name + " " +
      ((m.size_vram || m.size || 0) / 1e9).toFixed(1) + "GB").join(", ") || "なし");
    const t = hr();
    if (w === "A") res.A = await runA();
    else if (w === "B") res.B = await runB(B);
    else if (w === "C") res.C = await runC(B);
    console.log("\n  総時間 " + ((hr() - t) / 1000).toFixed(1) + " 秒");
    console.log("  " + JSON.stringify(res[w].rows ? { totalMs: res[w].totalMs,
      rows: res[w].rows.length } : res[w], null, 0).slice(0, 400));
  }
  const outPath = process.env.VQ_OUT || "/tmp/vqbridgetrace.json";
  fs.writeFileSync(outPath, JSON.stringify(res, null, 2));
  console.log("\n記録:", outPath);

  console.log("\n方式  総時間");
  for (const w of WANT) console.log("  " + w + "   " + (res[w].totalMs / 1000).toFixed(1) + " 秒");
})();
