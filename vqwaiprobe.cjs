/* ══════════════════════════════════════════════════════════════════════
   Workers AI の実測（開発環境のみ）

   「どのモデルが実在して、どれだけ待たされて、指示どおりの形で返すか」を
   推測ではなく数字で出す。設計はこの数字の上に載せる。

   測るもの:
     ・存在するか（存在しないモデル名を設計へ持ち込まない）
     ・かかった時間
     ・JSON で返せるか（出題は JSON で受け取る）
     ・指定した形式・問題数を守るか（4択と言われて4択を返すか）

   使い方:
     node vqwaiprobe.cjs             … 軽い疎通だけ
     node vqwaiprobe.cjs --gen       … 出題の実測（重い）
   ══════════════════════════════════════════════════════════════════════ */
const BASE = process.env.VQ_API || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const WANT_GEN = process.argv.indexOf("--gen") >= 0;

async function api(method, path, body, token) {
  const h = { "Content-Type": "application/json" };
  if (token) h.Authorization = "Bearer " + token;
  const r = await fetch(BASE + path, { method, headers: h,
    body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text();
  let d = null; try { d = t ? JSON.parse(t) : null; } catch (e) { d = { raw: t.slice(0, 200) }; }
  return { status: r.status, data: d || {} };
}

/* 口座の設定（wrangler.toml の vars）に実際に書かれているモデルだけを試す。
   ここに無いモデル名を設計へ持ち込まない。 */
const MODELS = [
  ["@cf/moonshotai/kimi-k2.6",                   "高品質（Preset 既定）"],
  ["@cf/zai-org/glm-4.7-flash",                  "高品質の控え"],
  ["@cf/meta/llama-4-scout-17b-16e-instruct",    "会話の既定"],
  ["@cf/meta/llama-3.1-8b-instruct",             "軽量"],
  ["@cf/meta/llama-3.1-8b-instruct-fp8-fast",    "軽量・速い"],
  ["@cf/meta/llama-3.2-11b-vision-instruct",     "画像つき"],
  ["@cf/llava-hf/llava-1.5-7b-hf",               "画像つき（小）"]
];

const GEN_SYSTEM =
  "あなたは日本の高校教材の作問者です。指示された形式と問題数を必ず守ります。"
  + "出力は JSON だけ。前置き・後書き・コードフェンスを書きません。";
const GEN_USER =
  "高校英語の問題を 3 問作ってください。\n"
  + "形式は必ず ordering（語句を正しい順に並べ替える）だけにしてください。4択にしてはいけません。\n"
  + "次の JSON で返してください:\n"
  + '{"questions":[{"id":"q1","type":"ordering","question":"...","items":["...","..."],"answer":["...","..."],"explanation":"..."}]}\n'
  + "items は 4 個以上にしてください。";

(async () => {
  console.log("接続先: " + BASE + "（開発環境）");
  const nick = "wai" + Date.now().toString(36).slice(-6);
  const reg = await api("POST", "/api/auth/register",
    { gradePrefix: "H1", nickname: nick, password: "DevWai#2026a", tosAccepted: true, tosVersion: "1" });
  if (!reg.data.token) { console.error("検証アカウントを作れません:", reg.data); process.exit(1); }
  const token = reg.data.token;

  console.log("\n══ ① 実在と応答（短い依頼）══");
  const alive = [];
  for (const [m, note] of MODELS) {
    const r = await api("POST", "/api/ai/probe",
      { model: m, prompt: "「光合成」を中学生向けに 1 文で説明してください。", max_tokens: 120 }, token);
    const d = r.data;
    if (d.ok) {
      alive.push(m);
      console.log(`  ok   ${m}\n       ${note} / ${d.ms}ms / ${d.chars}字 / ${d.charsPerSec}字ps`
        + (d.usage ? ` / usage ${JSON.stringify(d.usage)}` : ""));
      console.log(`       → ${String(d.head).replace(/\s+/g, " ").slice(0, 90)}`);
    } else {
      console.log(`  NG   ${m}\n       ${note} / ${d.ms}ms / ${String(d.error).slice(0, 150)}`);
    }
  }
  console.log(`\n  使えたモデル: ${alive.length} / ${MODELS.length}`);

  if (!WANT_GEN) {
    console.log("\n（出題の実測は --gen を付けて実行）");
    process.exit(0);
  }

  console.log("\n══ ② 出題（形式指定を守るか・JSON で返すか）══");
  const rows = [];
  for (const m of alive) {
    const r = await api("POST", "/api/ai/probe", {
      model: m, max_tokens: 1400, temperature: 0.2,
      messages: [{ role: "system", content: GEN_SYSTEM }, { role: "user", content: GEN_USER }]
    }, token);
    const d = r.data;
    if (!d.ok) { console.log(`  NG   ${m}  ${String(d.error).slice(0, 120)}`); continue; }
    /* 素の JSON か、``` に包まれていても中身が取れるかを見る。
       **切らずに全文を見る。** 途中で切ると必ず壊れて「返せなかった」になる。 */
    let parsed = null, fenced = false;
    const raw = String(d.text || d.head || "");
    let cand = raw.trim();
    const fence = cand.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) { cand = fence[1].trim(); fenced = true; }
    const brace = cand.indexOf("{");
    if (brace > 0) cand = cand.slice(brace);
    try { parsed = JSON.parse(cand); } catch (e) { parsed = null; }
    const qs = parsed && Array.isArray(parsed.questions) ? parsed.questions : [];
    const types = qs.map((q) => String(q && q.type || "")).filter(Boolean);
    const allOrdering = types.length > 0 && types.every((t) => /order/i.test(t));
    rows.push({ m, ms: d.ms, chars: d.chars, cps: d.charsPerSec,
                json: !!parsed, fenced, n: qs.length, allOrdering });
    console.log(`  ${m}`);
    console.log(`     ${d.ms}ms / ${d.chars}字 / ${d.charsPerSec}字ps`
      + ` / JSON ${parsed ? "○" : "×"}${fenced ? "（```付き）" : ""}`
      + ` / 問題数 ${qs.length}` + ` / 形式どおり ${allOrdering ? "○" : "×"}${types.length ? " [" + types.join(",") + "]" : ""}`);
    if (!parsed) console.log(`     → ${raw.replace(/\s+/g, " ").slice(0, 140)}`);
  }

  console.log("\n══ まとめ ══");
  const good = rows.filter((r) => r.json && r.allOrdering);
  if (good.length) {
    good.sort((a, b) => a.ms - b.ms);
    console.log("  形式を守って JSON で返せたもの（速い順）:");
    good.forEach((r) => console.log(`    ${r.ms}ms  ${r.m}  (${r.n}問)`));
  } else {
    console.log("  形式を守って JSON で返せたものはありませんでした。");
  }
  const bad = rows.filter((r) => !r.json || !r.allOrdering);
  if (bad.length) {
    console.log("  取りこぼしたもの:");
    bad.forEach((r) => console.log(`    ${r.m}  JSON ${r.json ? "○" : "×"} / 形式 ${r.allOrdering ? "○" : "×"}`));
  }
})().catch((e) => { console.error("実行できませんでした:", e); process.exit(1); });
