/* ══════════════════════════════════════════════════════════════════════════
   vqaigenmodels.cjs — 作問に使う Groq のモデルと、言語の判定（2026-08-13）

     ① 作問に使うモデルが 5 つ。枠はモデルごとに別なので、並べるだけで増える
        （compound 系は中で 120b を呼ぶので入れない。増えない）
     ② 8/16 に廃止される llama-3.1-8b-instant を入れていない
     ③ 「英単語」の問題が「頼んでいない言語」として捨てられない
        （VocabuQuiz でいちばん多い頼まれ方なのに、抜けていた）

   ①②はファイルを読むだけ。③は判定の関数を取り出して動かす。
   実際の作問での確認は別途おこない、結果は worker.js の注釈に残してある。
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

const src = fs.readFileSync(SRC, "utf8");

/* 判定の部分だけ取り出して動かす */
function load() {
  const grab = (re, what) => { const m = src.match(re); if (!m) throw new Error(what + " が見つかりません"); return m[0]; };
  const code = grab(/const AIGEN_ENGLISH_ASK_RE\s*=[\s\S]*?;/, "英語判定")
    + "\n" + grab(/const AIGEN_JA_RE\s*=.*?;/, "日本語判定")
    + "\n" + grab(/function aigenWrongLanguage\([\s\S]*?\n\}/, "aigenWrongLanguage")
    + "\nmodule.exports = { AIGEN_ENGLISH_ASK_RE, aigenWrongLanguage };";
  const sb = { module: { exports: {} }, String, RegExp };
  vm.createContext(sb); vm.runInContext(code, sb);
  return sb.module.exports;
}

console.log("═══ vqaigenmodels — 作問モデルと言語の判定 ═══");

console.log("\n① 作問に使うモデル");
const m = src.match(/const AIGEN_GROQ_MODELS = \[([\s\S]*?)\];/);
const list = m ? (m[1].match(/"([^"]+)"/g) || []).map((s) => s.replace(/"/g, "")) : [];
ok("一覧を読めた", list.length > 0, String(list.length));
ok("5 つある", list.length === 5, list.join(" / "));
for (const want of ["openai/gpt-oss-20b", "openai/gpt-oss-120b", "openai/gpt-oss-safeguard-20b",
                    "llama-3.3-70b-versatile", "qwen/qwen3.6-27b"]) {
  ok("  " + want + " が入っている", list.indexOf(want) >= 0);
}
ok("重複が無い", new Set(list).size === list.length);

console.log("\n② 廃止・不向きなモデルを入れていない");
/* 8/16 廃止。入れると、その日から作れなくなる。 */
ok("llama-3.1-8b-instant を入れていない（8/16 廃止）",
  list.indexOf("llama-3.1-8b-instant") < 0);
/* ★ compound 系は中で gpt-oss-120b を呼ぶ。入れても枠は増えず、120b を食うだけ。
   実測: compound-mini 5 回で 120b の残りが 4 減り、20b は 0 だった。 */
ok("groq/compound を入れていない（中で 120b を呼ぶ）", list.indexOf("groq/compound") < 0);
ok("groq/compound-mini を入れていない（中で 120b を呼ぶ）", list.indexOf("groq/compound-mini") < 0);
for (const ng of ["whisper-large-v3", "whisper-large-v3-turbo", "allam-2-7b",
                  "meta-llama/llama-prompt-guard-2-22m", "meta-llama/llama-prompt-guard-2-86m",
                  "canopylabs/orpheus-v1-english"]) {
  ok("  作問向きでない " + ng + " を入れていない", list.indexOf(ng) < 0);
}

console.log("\n③ 「英単語」の問題が捨てられない");
const S = load();
/* お題が英語学習のとき、英語だけの問題文を「言語ちがい」で捨ててはいけない。 */
const 英語だけの問題 = "What does apple mean?";
const 英語のお題 = [
  "中学3年生向けの英単語の4択問題を10問。",
  "英熟語を10問つくって",
  "英会話でよく使う表現の問題",
  "英検3級レベルの問題を20問",
  "和英の問題を作って",
  "イディオムの問題",
  "ボキャブラリーを増やす問題",
  "アルファベットの問題",
  "TOEIC の問題を10問",
  "vocabulary quiz",
  "英語の問題を10問",          /* もとから通っていたもの */
  "スペルの問題",
  "つづりの問題",
  "綴りの問題"
];
for (const ask of 英語のお題) {
  ok("  「" + ask.slice(0, 16) + "」→ 英語の問題を捨てない",
    S.aigenWrongLanguage(ask, 英語だけの問題) === false);
}

console.log("\n④ 日本語のお題では、英語だけの問題を今までどおり捨てる");
for (const ask of ["日本の江戸時代についての4択問題を10問",
                   "中学2年生の一次関数の問題を10問",
                   "理科の光の性質の問題"]) {
  ok("  「" + ask.slice(0, 14) + "」→ 英語だけの問題は捨てる",
    S.aigenWrongLanguage(ask, 英語だけの問題) === true);
}
/* 日本語がひと文字でも入っていれば通す（DNA・AIDS などのため） */
ok("日本語のお題でも、日本語が入った問題は通す",
  S.aigenWrongLanguage("理科の問題", "DNA の正式名称は？") === false);
ok("英字が 2 語までなら通す（用語だけ英語）",
  S.aigenWrongLanguage("理科の問題", "AIDS とは") === false);

console.log("\n─────────────────────────────");
console.log("通過 " + pass + " / 失敗 " + fail);
process.exit(fail ? 1 : 0);
