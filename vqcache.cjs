/* 解析キャッシュが実際にどれだけ効くかを測る。

   ── なぜ専用のスクリプトが要るか（2026-08-05 の反省）──────────
   最初 vqspeed.cjs で測ったが、資料に **テキスト**（extractedText）を使っていた。
   今回直したのは「ページ画像を Vision で読む処理」のキャッシュなので、
   テキスト資料ではその処理がそもそも走らない。
   **測っている対象が違っていた。**

   ここではページ画像を渡す。同じ画像を 2 回投げて、
     ・2 回目に Vision（ページの読み取り）が走るか
     ・工程ごとの時間がどう変わるか
   を見る。**秒だけでなく「何回モデルを呼んだか」を必ず見る**
   （ローカルの LLM は同じ仕事でも 2 倍以上ぶれるため、
    秒だけでは何も言えないことが実測で分かっている）。

   実行:
     node vqcache.cjs                 … 3 ページ × 2 回
     node vqcache.cjs --pages 5 --repeat 2
*/
const fs = require("fs");
const path = require("path");

/* Bridge は自己署名証明書。相手は 127.0.0.1 の自分の Bridge だけ。 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const BASE = process.env.VQ_BRIDGE || "https://127.0.0.1:17891";
const HEAD = { "Content-Type": "application/json", Origin: "https://127.0.0.1:8791" };

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const PAGES = Number(arg("--pages", "3")) || 3;
const REPEAT = Number(arg("--repeat", "2")) || 2;
const OUT = arg("--out", null);

const DIR = path.join(__dirname, "tmp_kanji_pages_img");
const files = fs.readdirSync(DIR).filter((f) => /\.png$/i.test(f)).sort().slice(0, PAGES);
if (!files.length) { console.error("ページ画像がありません: " + DIR); process.exit(1); }

function attachments() {
  return files.map((f, i) => ({
    id: "a" + (i + 1), name: "資料（" + (i + 1) + "ページ）.png", kind: "image",
    pageNumber: i + 1, pageCount: files.length,
    imageBase64: fs.readFileSync(path.join(DIR, f)).toString("base64")
  }));
}

async function run(label, jobId, n, atts) {
  const t0 = Date.now();
  let err = null, usage = null, structured = null;
  const stages = [];
  const acts = [];
  const res = await fetch(BASE + "/chat/completions", {
    method: "POST", headers: HEAD,
    body: JSON.stringify({
      requestId: "cache" + n, message: "この資料から 6 問の問題を作ってください。",
      modelId: "standard", thinkingLevel: "normal",
      attachments: atts,
      options: { structuredOutput: "preset", sourceOnly: true, jobId: jobId }
    })
  }).catch((e) => ({ ok: false, status: 0, _e: String(e && e.message) }));
  if (!res || !res.ok) return { label, ok: false, err: "HTTP " + (res && res.status) };

  const rd = res.body.getReader(), dec = new TextDecoder();
  let buf = "", ev = "", data = "";
  while (true) {
    const c = await rd.read();
    if (c.done) break;
    buf += dec.decode(c.value, { stream: true });
    const lines = buf.split("\n"); buf = lines.pop() || "";
    for (const L of lines) {
      if (L.startsWith("event: ")) { ev = L.slice(7).trim(); continue; }
      if (L.startsWith("data: ")) { data = L.slice(6); continue; }
      if (L !== "" || !ev) continue;
      let j = null; try { j = JSON.parse(data); } catch (e) {}
      if (j) {
        if (ev === "usage") usage = j;
        if (ev === "structured") structured = j;
        if (ev === "error") err = j.message || j.code;
        if (ev === "metrics") { (j.stages || []).forEach((s) => stages.push(s)); (j.calls || []).forEach((c2) => acts.push(c2)); }
      }
      ev = ""; data = "";
    }
  }
  let made = 0;
  try {
    const d = (structured && (structured.data || structured)) || {};
    made = (d.questions || []).length
      + (d.sections || []).reduce((a, s) => a + (s.questions || []).length, 0);
  } catch (e) {}
  /* ページを読んだ回数（キャッシュが効いていれば 2 回目は 0 になるはず） */
  const vision = acts.filter((c) => /vision|ocr|coverage/i.test(String(c.role || ""))).length;
  const visionMs = acts.filter((c) => /vision|ocr|coverage/i.test(String(c.role || "")))
    .reduce((a, c) => a + (c.ms || 0), 0);
  return {
    label, ok: !err, err, totalMs: Date.now() - t0, made,
    modelCalls: (usage && usage.modelCalls) || acts.length,
    visionCalls: vision, visionMs,
    roles: acts.map((c) => c.role + ":" + Math.round((c.ms || 0) / 100) / 10 + "s")
  };
}

(async () => {
  const h = await fetch(BASE + "/health").catch(() => null);
  if (!h || !h.ok) { console.error("Bridge へ繋がりません: " + BASE); process.exit(1); }
  console.log("Bridge: OK  ページ " + files.length + " 枚  各 " + REPEAT + " 回\n");

  const atts = attachments();
  const out = { at: new Date().toISOString(), pages: files.length, repeat: REPEAT, runs: [] };

  for (let i = 0; i < REPEAT; i++) {
    const jobId = "cache-" + i;      /* 同じ job で 2 回投げる */
    for (let k = 1; k <= 2; k++) {
      const label = k === 1 ? "1 回目（はじめての資料）" : "2 回目（同じ資料）";
      process.stdout.write("  [" + (i + 1) + "] " + label + " … ");
      const r = await run(label, jobId, i + "-" + k, atts);
      out.runs.push(Object.assign({ round: i + 1, nth: k }, r));
      if (!r.ok) { console.log("失敗: " + r.err); continue; }
      console.log((r.totalMs / 1000).toFixed(1) + "s"
        + "  ページ読み取り " + r.visionCalls + " 回（" + (r.visionMs / 1000).toFixed(1) + "s）"
        + "  モデル計 " + r.modelCalls + " 回"
        + "  できた " + r.made + " 問");
    }
  }

  const pick = (n) => out.runs.filter((r) => r.ok && r.nth === n);
  const sum = (a, f) => a.reduce((x, r) => x + f(r), 0);
  const A = pick(1), B = pick(2);
  console.log("\n══ まとめ ══");
  if (A.length && B.length) {
    console.log("  ページ読み取りの回数  1 回目 計 " + sum(A, (r) => r.visionCalls)
      + " 回  →  2 回目 計 " + sum(B, (r) => r.visionCalls) + " 回");
    console.log("  ページ読み取りの時間  1 回目 計 " + (sum(A, (r) => r.visionMs) / 1000).toFixed(1)
      + "s  →  2 回目 計 " + (sum(B, (r) => r.visionMs) / 1000).toFixed(1) + "s");
    console.log("  全体の所要（中央値）  1 回目 " + (sum(A, (r) => r.totalMs) / A.length / 1000).toFixed(1)
      + "s  →  2 回目 " + (sum(B, (r) => r.totalMs) / B.length / 1000).toFixed(1) + "s");
    console.log("\n  ※ 秒はローカル LLM のばらつきが大きい（実測で同じ条件が 2.4 倍ぶれた）。");
    console.log("  ※ **回数**のほうが、キャッシュが効いたかどうかの確かな証拠になる。");
  }
  if (OUT) {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
    console.log("\n記録: " + OUT);
  }
  console.log("");
})().catch((e) => { console.error(e); process.exit(1); });
