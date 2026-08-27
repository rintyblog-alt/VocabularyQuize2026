/* ══════════════════════════════════════════════════════════════════════════
   vqadminsync.cjs — 管理ダッシュボードが **本番と そろっているか**

   訴え（2026-08-20）: 「管理ダッシュボードと 今の本番を 同期させたい」

   実際に 食い違っていたもの（実測）:
     ・上限表「Quick Chat の 主は Gemini」／ 本番 CHAT_PROVIDER = workers_ai
     ・上限表に Gemini の鍵 5 本 ／ 本番の 秘密は GEMINI_API_KEY〜_5 の 5 本
     ・Quick Chat 専用の鍵は GEMINI_CHAT_KEY の 1 本だけ（生成の鍵を借りていない）

   直したやりかた:
     上限（RPM/TPM/RPD）は 提供元が 決めるので 表のまま。
     **どこで・どのモデルで・鍵 何本で 動かしているか**は 本体から 直に 読む。
     食い違ったら 画面に 名指しで 出す（勝手に 書き換えない）。

   使い方: node vqadminsync.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs");
const path = require("path");

let pass = 0, fail = 0; const 落ち = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ✅ " + n); }
  else { fail++; 落ち.push(n); console.log("  ❌ " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 300) : "")); }
};
const 節 = (t) => console.log("\n■ " + t);

/* admin.js から 関数を そのまま 取り出す（実コードを 動かす） */
function 取り出す(名) {
  const src = fs.readFileSync(path.join(__dirname, "server/src/admin.js"), "utf8");
  const i = src.indexOf("function " + 名 + "(");
  if (i < 0) throw new Error(名 + " が 見つかりません");
  let 深 = 0, 終 = -1;
  for (let k = src.indexOf("{", i); k < src.length; k++) {
    if (src[k] === "{") 深++;
    else if (src[k] === "}") { 深--; if (!深) { 終 = k + 1; break; } }
  }
  return src.slice(i, 終);
}

(async () => {
  節("① 本体が「実際の中身」を 返しているか（コードを 見る）");
  const w = fs.readFileSync(path.join(__dirname, "server/src/worker.js"), "utf8");
  ok("設定を そのまま 返す口が ある", /AIの実際:/.test(w));
  ok("Quick Chat の 提供元を 見ている", /CHAT_PROVIDER/.test(w) && /QuickChat:/.test(w));
  ok("鍵の 本数を 数えている", /aigenGeminiChatKeys\(env\)/.test(w) && /aigenGroqKeys\(env\)/.test(w));
  ok("音声会話も 入っている", /音声会話: \{ モデル: LIVE_MODEL/.test(w));
  ok("借りているかも 分かる", /生成の鍵を借りている/.test(w));

  節("② ズレの 見つけかたを 実際に 動かす");
  const 比べる = new Function(
    "const S = (v) => (v === undefined || v === null ? '' : String(v));\n" +
    "const N = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : (d === undefined ? 0 : d); };\n" +
    取り出す("実際とくらべる") + "\nreturn 実際とくらべる;")();

  /* 種として 入っている 上限表（server/src/admin.js の SEED_PROVIDER_LIMITS と同じ） */
  const 表 = [
    { key: "groq:openai/gpt-oss-20b", provider: "groq", model: "openai/gpt-oss-20b", keys: 6 },
    { key: "groq:openai/gpt-oss-120b", provider: "groq", model: "openai/gpt-oss-120b", keys: 6 },
    { key: "gemini:gemini-3.1-flash-lite", provider: "gemini", model: "gemini-3.1-flash-lite", keys: 5 },
    { key: "gemini:gemini-3.5-flash-lite", provider: "gemini", model: "gemini-3.5-flash-lite", keys: 5 },
    { key: "workers_ai:default", provider: "workers_ai", model: "@cf/*", keys: 1 },
    { key: "local:bridge", provider: "local", model: "bridge", keys: 1 }
  ];

  /* いまの 本番と 同じ 姿 */
  const 本番 = { AIの実際: {
    QuickChat: { 提供元: "workers_ai",
      モデル: ["@cf/meta/llama-4-scout-17b-16e-instruct"], 鍵の本数: 0, 専用の鍵: 1,
      生成の鍵を借りている: false },
    生成: {
      gemini: { 鍵の本数: 5, モデル: ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite"] },
      groq: { 鍵の本数: 6, モデル: ["openai/gpt-oss-20b", "openai/gpt-oss-120b"] },
      workers_ai: { 鍵の本数: 1, モデル: ["@cf/moonshotai/kimi-k2.6", "@cf/zai-org/glm-4.7-flash"] }
    },
    音声会話: { モデル: "gemini-3.1-flash-live-preview", 鍵の本数: 5, 一日の上限: 80 }
  } };

  const r = 比べる(本番, 表);
  console.log("     見つかったズレ:");
  r.ズレ.forEach((z) => console.log("       ・[" + z.種 + "] " + z.文));
  ok("★ Quick Chat が Gemini で 動いていないことに 気づく",
     r.ズレ.some((z) => z.種 === "QuickChat の 提供元"), r.ズレ);
  ok("★ 音声会話のモデルが 表に 無いことに 気づく",
     r.ズレ.some((z) => z.種 === "表に無い" && /live/.test(z.model)), r.ズレ);
  ok("Groq は 表と そろっているので 何も 言わない",
     !r.ズレ.some((z) => z.provider === "groq" && z.種 === "鍵の本数"), r.ズレ);
  ok("Gemini の 鍵 5 本も そろっている",
     !r.ズレ.some((z) => z.provider === "gemini" && z.種 === "鍵の本数"), r.ズレ);

  節("③ そろっていれば 何も 言わない");
  const そろい = { AIの実際: {
    QuickChat: { 提供元: "gemini", モデル: ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite"],
      鍵の本数: 5, 専用の鍵: 5, 生成の鍵を借りている: false },
    生成: {
      gemini: { 鍵の本数: 5, モデル: ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite"] },
      groq: { 鍵の本数: 6, モデル: ["openai/gpt-oss-20b", "openai/gpt-oss-120b"] }
    },
    音声会話: { モデル: "gemini-3.1-flash-lite", 鍵の本数: 5, 一日の上限: 80 }
  } };
  const 表2 = 表.filter((x) => x.provider !== "local" && x.provider !== "workers_ai");
  const r2 = 比べる(そろい, 表2);
  console.log("     " + JSON.stringify(r2.ズレ.map((z) => z.文)));
  ok("★ ズレ 0", r2.ズレ.length === 0, r2.ズレ);

  節("④ 鍵の 本数が 変わったら 気づくか");
  const 増 = JSON.parse(JSON.stringify(そろい));
  増.AIの実際.生成.gemini.鍵の本数 = 6;
  増.AIの実際.QuickChat.鍵の本数 = 6;
  増.AIの実際.音声会話.鍵の本数 = 6;
  const r3 = 比べる(増, 表2);
  ok("★ 5 鍵の表に 6 鍵の本番 → 名指しで 出る",
     r3.ズレ.some((z) => z.種 === "鍵の本数" && z.実際 === 6 && z.表 === 5), r3.ズレ);
  console.log("     " + (r3.ズレ[0] ? r3.ズレ[0].文 : "(無し)"));

  節("⑤ 鍵を 借りていたら 教えるか");
  const 借 = JSON.parse(JSON.stringify(そろい));
  借.AIの実際.QuickChat.専用の鍵 = 0;
  借.AIの実際.QuickChat.生成の鍵を借りている = true;
  const r4 = 比べる(借, 表2);
  ok("★ 生成の鍵を 借りていると 分かる",
     r4.ズレ.some((z) => z.種 === "鍵の 借用"), r4.ズレ);

  節("⑥ 画面に 出しているか");
  const html = fs.readFileSync(path.join(__dirname, "client/admin.html"), "utf8");
  ok("実際の中身の 表が ある", /いま本番が動かしている中身/.test(html));
  ok("ズレを 出している", /上限表と 本番が /.test(html));
  ok("そろっているときも 言う", /上限表と 本番は そろっています/.test(html));
  ok("鍵の 借用を 出している", /生成の鍵を借用/.test(html));
  ok("提供元の口が 実際を 返す", /実際: くらべ\.実際/.test(fs.readFileSync(path.join(__dirname, "server/src/admin.js"), "utf8")));
  ok("最初の画面にも 警告を 出す",
     /設定のズレ: /.test(fs.readFileSync(path.join(__dirname, "server/src/admin.js"), "utf8")));

  console.log("\n════════════════════════════════════════════");
  console.log("  合計 " + (pass + fail) + " 件 / 通った " + pass + " / 落ちた " + fail);
  if (落ち.length) { console.log("  落ちたもの:"); 落ち.forEach((x) => console.log("   - " + x)); }
  console.log("════════════════════════════════════════════");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("落ちました: " + (e && e.stack || e)); process.exit(1); });
