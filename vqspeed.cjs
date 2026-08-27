/* 資料ありの生成がどれだけ速くなったかを、同じ条件で 3 通り測る（§33）。

   測るのは 3 つ。
     ① 資料なし          … いまの速い経路。**壊していないこと**の確認
     ② 新しい資料あり     … 初回。解析が要るぶん遅いのは当然
     ③ 解析済みの資料あり … 2 回目。目標は ①の 1.5 倍以内

   ②と③は**まったく同じ資料・同じ指示**で連続して流す。
   ③が②とほぼ同じ時間なら、解析結果が使い回されていない。

   Bridge へ直接投げる（UI の描画時間を混ぜない）。
   実 AI を使うので**必ず 1 本ずつ直列**に流す。並列にすると
   同時実行の上限（2）に当たって数値が意味を失う。

   実行:
     node vqspeed.cjs                 … 3 条件を 1 回ずつ
     node vqspeed.cjs --repeat 3      … 各条件を 3 回（ばらつきを見る）
     node vqspeed.cjs --out artifacts/speed-after.json

   前提: Bridge が動いていること（https://127.0.0.1:17891/health が 200）。
*/
const fs = require("fs");
const path = require("path");
/* Bridge は自己署名証明書で立っている（server/.lan-cert）。
   相手は 127.0.0.1 の自分の Bridge だけなので、この計測スクリプトの中でだけ
   証明書の検証を切る。**製品コードでは絶対にやらないこと。** */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const BASE = process.env.VQ_BRIDGE || "https://127.0.0.1:17891";
const HEAD = { "Content-Type": "application/json", Origin: "https://127.0.0.1:8791" };

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const REPEAT = Number(arg("--repeat", "1")) || 1;
const OUT = arg("--out", null);
const COUNT = Number(arg("--count", "10")) || 10;

const 教材 = fs.readFileSync(
  path.join(__dirname, "tmp_exam_build", "nihonshi-large.txt"), "utf8");

const 指示 = "この資料から " + COUNT + " 問の試験問題を作ってください。"
  + "空欄補充を " + Math.floor(COUNT / 2) + " 問、正誤を " + Math.ceil(COUNT / 2) + " 問にしてください。";
const 指示_資料なし = "日本史（律令国家と摂関政治）について " + COUNT + " 問の試験問題を作ってください。"
  + "空欄補充を " + Math.floor(COUNT / 2) + " 問、正誤を " + Math.ceil(COUNT / 2) + " 問にしてください。";

/* ── SSE を読み切って、要点だけ返す ───────────────────────── */
async function run(body, label) {
  const t0 = Date.now();
  let firstToken = null, firstQuestion = null, err = null;
  let structured = null, usage = null;
  const stages = [];
  const acts = [];

  const res = await fetch(BASE + "/chat/completions", {
    method: "POST", headers: HEAD, body: JSON.stringify(body)
  }).catch((e) => ({ ok: false, status: 0, _e: String(e && e.message) }));

  if (!res || !res.ok) {
    return { label, ok: false, err: "HTTP " + (res && res.status) + " " + ((res && res._e) || "") };
  }
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = "", ev = "", data = "";
  while (true) {
    const c = await reader.read();
    if (c.done) break;
    buf += dec.decode(c.value, { stream: true });
    const lines = buf.split("\n"); buf = lines.pop() || "";
    for (const L of lines) {
      if (L.startsWith("event: ")) { ev = L.slice(7).trim(); continue; }
      if (L.startsWith("data: ")) { data = L.slice(6); continue; }
      if (L !== "") continue;
      if (!ev) continue;
      let j = null; try { j = JSON.parse(data); } catch (e) {}
      if (j) {
        if (ev === "token" && firstToken === null) firstToken = Date.now() - t0;
        if (ev === "usage") usage = j;
        if (ev === "structured") {
          structured = j;
          if (firstQuestion === null) firstQuestion = Date.now() - t0;
        }
        if (ev === "error") err = j.message || j.code;
        if (ev === "activity") {
          if (j.status === "completed") { stages.push({ s: j.stage || j.label, ms: j.ms }); acts.push(j.label); }
        }
        /* 1 問できた時点が分かるなら、そこを最初の問題の時刻とする */
        if (ev === "question" && firstQuestion === null) firstQuestion = Date.now() - t0;
      }
      ev = ""; data = "";
    }
  }
  const totalMs = Date.now() - t0;
  let made = 0, types = {};
  try {
    const d = (structured && (structured.data || structured)) || {};
    const qs = [];
    (d.sections || []).forEach((s) => (s.questions || []).forEach((q) => qs.push(q)));
    (d.questions || []).forEach((q) => qs.push(q));
    made = qs.length;
    qs.forEach((q) => {
      const t = String(q.questionType || q.type || "?");
      types[t] = (types[t] || 0) + 1;
    });
  } catch (e) {}
  return {
    label, ok: !err, err, totalMs, firstTokenMs: firstToken, firstQuestionMs: firstQuestion,
    made, types, modelCalls: (usage && usage.modelCalls) || 0,
    stages, acts: acts.slice(0, 30)
  };
}

/* ── 条件 ─────────────────────────────────────────────────

   ここで大事な前提（2026-08-05 の実測で分かったこと）:

     **Quick Mock（試験）は資料が無いと作れない。**
     資料が無いと論点が 0 件になり、出題枠が 1 つも配れず
     insufficient_topics → no_blueprint で 7 ミリ秒で終わる。
     これは不具合ではなく設計（根拠の無い試験問題を作らない）。

   なので §33 の「資料なし」は**プリセット側**で測る。
   プリセットは一般知識からでも作れる、いまいちばん速い経路。

   測る条件:
     P① プリセット・資料なし        … 壊していないことの確認（§36）
     P② プリセット・新しい資料      … 初回（解析が要る）
     P③ プリセット・解析済み資料    … 2 回目（目標: P① の 1.5 倍以内）
     M② 試験・新しい資料            … 初回
     M③ 試験・解析済み資料          … 2 回目
   ────────────────────────────────────────────────────── */
function body(kind, withDoc, jobId, n) {
  const b = {
    requestId: "spd" + n,
    message: withDoc ? 指示 : 指示_資料なし,
    modelId: "standard",
    thinkingLevel: "normal",
    options: { structuredOutput: kind }
  };
  if (withDoc) {
    b.attachments = [{ id: "a1", name: "日本史まとめ.pdf", kind: "pdf",
                       extractedText: "[p.1] " + 教材, pageCount: 1 }];
    b.options.sourceOnly = true;
    b.options.requireCitations = true;
    if (jobId) b.options.jobId = jobId;
  }
  return b;
}

(async () => {
  /* Bridge の生死を先に見る。落ちているのに 0 秒と報告しないため。 */
  const h = await fetch(BASE + "/health").catch(() => null);
  if (!h || !h.ok) {
    console.error("Bridge へ繋がりません: " + BASE
      + "\n  先に  bash local-ai/scripts/start-open.sh  を実行してください。");
    process.exit(1);
  }
  console.log("Bridge: OK（" + BASE + "）  問題数: " + COUNT + "  各条件 " + REPEAT + " 回\n");

  const out = { at: new Date().toISOString(), count: COUNT, repeat: REPEAT, runs: [] };
  const jobId = "speed-" + Math.floor(Date.now() / 1000);

  const plan = [];
  for (let i = 0; i < REPEAT; i++) {
    const J = jobId + "-" + i;
    plan.push(["P① プリセット・資料なし",   () => run(body("preset", false, null, "pa" + i), "P① プリセット・資料なし")]);
    plan.push(["P② プリセット・新しい資料", () => run(body("preset", true, J + "p", "pb" + i), "P② プリセット・新しい資料")]);
    plan.push(["P③ プリセット・解析済み",   () => run(body("preset", true, J + "p", "pc" + i), "P③ プリセット・解析済み")]);
    plan.push(["M② 試験・新しい資料",       () => run(body("mock", true, J + "m", "mb" + i), "M② 試験・新しい資料")]);
    plan.push(["M③ 試験・解析済み",         () => run(body("mock", true, J + "m", "mc" + i), "M③ 試験・解析済み")]);
  }

  /* **必ず直列**。並列にすると同時実行の上限に当たって数値が壊れる。 */
  for (const [label, fn] of plan) {
    process.stdout.write("  " + label + " … ");
    const r = await fn();
    out.runs.push(r);
    if (!r.ok) { console.log("失敗: " + r.err); continue; }
    console.log((r.totalMs / 1000).toFixed(1) + "s"
      + "  最初の問題 " + (r.firstQuestionMs ? (r.firstQuestionMs / 1000).toFixed(1) + "s" : "-")
      + "  できた " + r.made + " 問"
      + "  モデル呼び出し " + r.modelCalls
      + "  " + JSON.stringify(r.types));
  }

  /* ── まとめ ── */
  const pick = (l) => out.runs.filter((r) => r.ok && r.label === l && r.made > 0).map((r) => r.totalMs);
  const med = (a) => { if (!a.length) return null; const v = a.slice().sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; };
  const M = {};
  ["P① プリセット・資料なし", "P② プリセット・新しい資料", "P③ プリセット・解析済み",
   "M② 試験・新しい資料", "M③ 試験・解析済み"].forEach((l) => { M[l] = med(pick(l)); });

  console.log("\n══ まとめ（中央値・成功したものだけ）══");
  Object.keys(M).forEach((l) => {
    console.log("  " + l.padEnd(26) + (M[l] === null ? "測れず" : (M[l] / 1000).toFixed(1) + "s"));
  });

  const P1 = M["P① プリセット・資料なし"], P2 = M["P② プリセット・新しい資料"], P3 = M["P③ プリセット・解析済み"];
  const M2 = M["M② 試験・新しい資料"], M3 = M["M③ 試験・解析済み"];
  console.log("");
  if (P1 && P3) {
    const r = P3 / P1;
    console.log("  §33: 解析済み ÷ 資料なし = " + r.toFixed(2) + " 倍"
      + "（目標 1.5 倍以内 → " + (r <= 1.5 ? "達成" : "未達") + "）");
  }
  if (P2 && P3) console.log("  プリセット 2 回目 ÷ 1 回目 = " + (P3 / P2).toFixed(2) + " 倍");
  if (M2 && M3) console.log("  試験 2 回目 ÷ 1 回目       = " + (M3 / M2).toFixed(2) + " 倍");

  if (OUT) {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
    console.log("\n記録: " + OUT);
  }
  console.log("");
})().catch((e) => { console.error(e); process.exit(1); });
