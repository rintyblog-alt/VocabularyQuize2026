/* ══════════════════════════════════════════════════════════════════════════
   vqgroqkeys.cjs — Groq の鍵を 6 本まで、1 本目から順に使う（2026-08-13）

     1 本目が尽きたら 2 本目、2 が尽きたら 3 …… 6 まで。
     Gemini（aigenGeminiKeys / aigenGeminiTry）と同じ考え方でそろえた。

   ここでは **本物の Groq を叩かない。** worker.js から切り替えの部分だけを
   取り出し、偽の応答を返す fetch を差し込んで順番を数える。
   （本物を叩くと、確かめるだけで 1 日ぶんを削ってしまう）
   ══════════════════════════════════════════════════════════════════════════ */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SRC = path.join(__dirname, "server", "src", "worker.js");

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (detail ? "  → " + detail : "")); }
};

/* worker.js から、使いたい関数の定義だけを切り出して動かす。
   （まるごと読み込むと Cloudflare の実行環境が要る） */
function loadPieces() {
  const src = fs.readFileSync(SRC, "utf8");
  const want = ["aigenGroqKeys", "aigenGroqKeyBad", "groqRestKey", "groqResting",
                "groqResetMs", "groqRest", "aigenCallGroq", "aigenCallGroqOnce"];
  let code = "const GROQ_REST = new Map();\n";
  for (const name of want) {
    const re = new RegExp("(?:^|\\n)(async\\s+)?function\\s+" + name + "\\s*\\([\\s\\S]*?\\n\\}", "m");
    const m = src.match(re);
    if (!m) throw new Error(name + " が見つかりません");
    code += m[0] + "\n";
  }
  code += "\nmodule.exports = { " + want.join(", ") + ", GROQ_REST };\n";
  const sandbox = { module: { exports: {} }, console, setTimeout, clearTimeout,
                    AbortController, Date, Math, JSON, Number, String, Array, Map,
                    qreditSafeInt: (v, d) => { const n = Number(v); return Number.isFinite(n) ? Math.floor(n) : d; } };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  /* const は文脈オブジェクトの持ち物にならないので、module.exports から取る。
     fetch だけは差し替えたいので、文脈そのものへ入れる口を返す。 */
  const api = sandbox.module.exports;
  api.setFetch = (f) => { sandbox.fetch = f; };
  return api;
}

/* 偽の Groq。鍵ごとに「何を返すか」を決めておく。 */
function fakeFetch(plan, log) {
  return async (url, init) => {
    const auth = String((init.headers || {}).Authorization || "");
    const key = auth.replace(/^Bearer\s+/, "");
    log.push(key);
    const how = plan[key] || { status: 500, body: "unknown key" };
    const headers = new Map(Object.entries(how.headers || {}));
    return {
      ok: how.status >= 200 && how.status < 300,
      status: how.status,
      headers: { forEach: (fn) => headers.forEach((v, k) => fn(v, k)) },
      text: async () => how.status < 300
        ? JSON.stringify({ choices: [{ message: { content: "{}" } }] })
        : String(how.body || "error")
    };
  };
}

(async () => {
  console.log("═══ vqgroqkeys — 6 本の鍵を順に使う ═══");
  const S = loadPieces();

  console.log("\n① 6 本まで読む");
  const env6 = { GROQ_API_KEY: "k1", GROQ_API_KEY_2: "k2", GROQ_API_KEY_3: "k3",
                 GROQ_API_KEY_4: "k4", GROQ_API_KEY_5: "k5", GROQ_API_KEY_6: "k6" };
  ok("6 本そろう", S.aigenGroqKeys(env6).length === 6, String(S.aigenGroqKeys(env6).length));
  ok("入れた順のまま", S.aigenGroqKeys(env6).join(",") === "k1,k2,k3,k4,k5,k6");
  ok("同じ鍵を 2 回入れても 1 本",
    S.aigenGroqKeys({ GROQ_API_KEY: "a", GROQ_API_KEY_2: "a" }).length === 1);
  ok("空欄は飛ばす",
    S.aigenGroqKeys({ GROQ_API_KEY: "a", GROQ_API_KEY_2: "", GROQ_API_KEY_3: "c" }).join(",") === "a,c");
  ok("7 本目は読まない（枠は 6 本）",
    S.aigenGroqKeys({ ...env6, GROQ_API_KEY_7: "k7" }).length === 6);

  console.log("\n② 次の鍵へ回す条件");
  ok("429（使い切り）→ 次へ", S.aigenGroqKeyBad(429, "") === true);
  ok("401（権限なし）→ 次へ", S.aigenGroqKeyBad(401, "") === true);
  ok("403 → 次へ", S.aigenGroqKeyBad(403, "") === true);
  ok("400 + api key → 次へ", S.aigenGroqKeyBad(400, "Invalid API Key provided") === true);
  ok("400（内容が悪いだけ）→ 回さない", S.aigenGroqKeyBad(400, "messages must be an array") === false);
  ok("500 → 回さない", S.aigenGroqKeyBad(500, "") === false);
  ok("時間切れ(0) → 回さない", S.aigenGroqKeyBad(0, "時間切れ") === false);

  const call = async (plan, env) => {
    const log = [];
    S.setFetch(fakeFetch(plan, log));
    S.GROQ_REST.clear();
    const r = await S.aigenCallGroq(env || env6, "openai/gpt-oss-20b",
      { messages: [{ role: "user", content: "x" }], max_tokens: 8, temperature: 0, response_format: null });
    return { log, r };
  };
  const OK = { status: 200 };
  const DEAD = { status: 429, body: "rate_limit_exceeded: tokens per day" };

  console.log("\n③ 1 本目が尽きたら 2 本目へ");
  {
    const { log, r } = await call({ k1: DEAD, k2: OK, k3: OK, k4: OK, k5: OK, k6: OK });
    ok("k1 → k2 の順で叩く", log.join(",") === "k1,k2", log.join(","));
    ok("2 本目で通る", !r.err, String(r.err || ""));
    ok("何番目で通ったかが分かる", r.使った鍵 === 2, String(r.使った鍵));
  }

  console.log("\n④ 5 本尽きても 6 本目まで回る");
  {
    const { log, r } = await call({ k1: DEAD, k2: DEAD, k3: DEAD, k4: DEAD, k5: DEAD, k6: OK });
    ok("k1〜k6 を順に叩く", log.join(",") === "k1,k2,k3,k4,k5,k6", log.join(","));
    ok("6 本目で通る", !r.err && r.使った鍵 === 6, String(r.使った鍵) + " / " + String(r.err || ""));
  }

  console.log("\n⑤ 6 本とも尽きたら、黙って作らずに最後の失敗を返す");
  {
    const { log, r } = await call({ k1: DEAD, k2: DEAD, k3: DEAD, k4: DEAD, k5: DEAD, k6: DEAD });
    ok("6 本すべてを試す", log.length === 6, String(log.length));
    ok("失敗として返る（成功に見せかけない）", !!r.err, JSON.stringify(r).slice(0, 90));
    ok("status が残る", r.status === 429, String(r.status));
  }

  console.log("\n⑥ 鍵のせいでない失敗は、回さずに止める");
  {
    const { log } = await call({ k1: { status: 400, body: "messages must be an array" }, k2: OK });
    ok("1 本で止める（無駄に回さない）", log.join(",") === "k1", log.join(","));
  }
  {
    const { log } = await call({ k1: { status: 500, body: "server error" }, k2: OK });
    ok("500 でも回さない", log.join(",") === "k1", log.join(","));
  }

  console.log("\n⑦ 尽きた鍵は、しばらく飛ばす（無駄な往復を捨てない）");
  {
    const log1 = [];
    S.setFetch(fakeFetch({ k1: DEAD, k2: OK }, log1));
    S.GROQ_REST.clear();
    await S.aigenCallGroq(env6, "m", { messages: [], max_tokens: 8, response_format: null });
    const log2 = [];
    S.setFetch(fakeFetch({ k1: DEAD, k2: OK }, log2));
    await S.aigenCallGroq(env6, "m", { messages: [], max_tokens: 8, response_format: null });
    ok("1 回目は k1 から", log1[0] === "k1", log1.join(","));
    ok("2 回目は k1 を飛ばして k2 から", log2.join(",") === "k2", log2.join(","));
  }
  {
    /* 全部が休みなら、飛ばさずに叩く（何も作らないよりまし） */
    S.GROQ_REST.clear();
    const dead = { k1: DEAD, k2: DEAD, k3: DEAD, k4: DEAD, k5: DEAD, k6: DEAD };
    const l1 = []; S.setFetch(fakeFetch(dead, l1));
    await S.aigenCallGroq(env6, "m", { messages: [], max_tokens: 8, response_format: null });
    const l2 = []; S.setFetch(fakeFetch({ ...dead, k1: OK }, l2));
    await S.aigenCallGroq(env6, "m", { messages: [], max_tokens: 8, response_format: null });
    ok("全部休みでも叩きにいく", l2.length > 0, "叩いた数 " + l2.length);
  }

  console.log("\n⑧ 鍵が 1 本のときは、これまでどおり少し待ってやり直す");
  {
    const log = [];
    S.setFetch(fakeFetch({ k1: { status: 429, headers: { "retry-after": "1" }, body: "slow down" } }, log));
    S.GROQ_REST.clear();
    const t = Date.now();
    const r = await S.aigenCallGroq({ GROQ_API_KEY: "k1" }, "m",
      { messages: [], max_tokens: 8, response_format: null });
    ok("同じ鍵で 2 回叩く", log.join(",") === "k1,k1", log.join(","));
    ok("待ってからやり直している", Date.now() - t >= 900, String(Date.now() - t) + "ms");
    ok("待った時間が分かる", r.waited > 0, String(r.waited));
  }
  {
    /* 会話文など、待ってはいけない呼び出し */
    const log = [];
    S.setFetch(fakeFetch({ k1: { status: 429, body: "x" } }, log));
    await S.aigenCallGroq({ GROQ_API_KEY: "k1" }, "m",
      { messages: [], max_tokens: 8, response_format: null, noWait: true });
    ok("noWait なら待たずに 1 回で返す", log.join(",") === "k1", log.join(","));
  }

  console.log("\n⑨ 休ませる長さを、返事に書いてある値から決める");
  /* 実測のヘッダー: x-ratelimit-reset-tokens="600ms" / reset-requests="2m52.8s" */
  ok('"600ms" を読める', S.groqResetMs("600ms") === 600, String(S.groqResetMs("600ms")));
  ok('"2m52.8s" を読める', Math.round(S.groqResetMs("2m52.8s")) === 172800, String(S.groqResetMs("2m52.8s")));
  ok('"13.5s" を読める', S.groqResetMs("13.5s") === 13500, String(S.groqResetMs("13.5s")));
  ok('"3"（retry-after の秒）を読める', S.groqResetMs("3") === 3000, String(S.groqResetMs("3")));
  ok("読めないものは 0", S.groqResetMs("なにか") === 0 && S.groqResetMs("") === 0);
  {
    const now = Date.now();
    S.GROQ_REST.clear();
    /* 1 分あたりの詰まり → すぐ戻す（10 分も休ませない） */
    S.groqRest("kx", { "x-ratelimit-reset-tokens": "600ms" }, now);
    const till = S.GROQ_REST.get(S.groqRestKey("kx")) - now;
    ok("1 分あたりの詰まりは短く休む（1 分以内）", till <= 60000, String(till) + "ms");
    ok("短すぎない（1 秒以上）", till >= 1000, String(till) + "ms");
    S.GROQ_REST.clear();
    /* 何も書いていない → 10 分 */
    S.groqRest("ky", {}, now);
    const till2 = S.GROQ_REST.get(S.groqRestKey("ky")) - now;
    ok("書いていなければ 10 分", Math.round(till2 / 60000) === 10, String(Math.round(till2 / 60000)) + "分");
    S.GROQ_REST.clear();
  }

  console.log("\n⑩ 鍵が 1 本も無いとき");
  {
    const r = await S.aigenCallGroq({}, "m", { messages: [], max_tokens: 8 });
    ok("未設定として返る", /未設定/.test(String(r.err || "")), String(r.err));
  }

  console.log("\n─────────────────────────────");
  console.log("通過 " + pass + " / 失敗 " + fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("落ちた:", e); process.exit(1); });
