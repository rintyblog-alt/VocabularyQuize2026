/* ══════════════════════════════════════════════════════════════════════════
   vqlumiuntil.cjs — 使用量の枠の「いつまでの目安か」（2026-08-13）

   なぜ入れたか:
     無料の上限を 日次 10→50 / 週次 40→200 に上げた。ただしこれは
     **供給から逆算した仮の値**で、本番で実際に何回使われるかを見て決め直す。
     黙って変えると「昨日はできたのに」になるので、期限を先に見せておく。

   ここで守りたいこと:
     ① サーバが期限（limitUntil）と、過ぎたかどうか（limitExpired）を返す
     ② **過ぎたかの判定はサーバ**。端末の時計を使わない
     ③ 期限が未設定（0）のときは画面に何も出さない
     ④ 期限は env で変えられる（コードを触らずに延ばせる）
     ⑤ 画面は使用量のすぐ下に出す
   ══════════════════════════════════════════════════════════════════════════ */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const SRC = path.join(__dirname, "server", "src", "worker.js");
const CLIENT = path.join(__dirname, "client", "index.html");
const TOML = path.join(__dirname, "server", "wrangler.dev.toml");

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (detail ? "  → " + detail : "")); }
};

const src = require("./vqsrc.cjs").丸ごと();
const client = fs.readFileSync(CLIENT, "utf8");
const toml = fs.readFileSync(TOML, "utf8");

/* サーバの方針の関数だけ取り出して動かす。 */
function loadPolicy() {
  const m = src.match(/function lumiUsagePolicy\([\s\S]*?\n\}/);
  if (!m) throw new Error("lumiUsagePolicy が見つかりません");
  const sb = { module: { exports: {} }, String, Number, Date, Math };
  vm.createContext(sb);
  vm.runInContext(m[0] + "\nmodule.exports = lumiUsagePolicy;", sb);
  return sb.module.exports;
}
const lumiUsagePolicy = loadPolicy();

console.log("\n① 期限を読んで返す");
{
  const env = { LUMI_DAILY_LIMIT: "50", LUMI_WEEKLY_LIMIT: "200",
    LUMI_LIMIT_UNTIL: "2026-09-30T23:59:59+09:00" };
  const p = lumiUsagePolicy(env, { plan: "free" });
  ok("上限がそのまま読める（日次 50）", p.dailyLimit === 50, "dailyLimit=" + p.dailyLimit);
  ok("上限がそのまま読める（週次 200）", p.weeklyLimit === 200, "weeklyLimit=" + p.weeklyLimit);
  ok("期限が数値で返る", typeof p.until === "number" && p.until > 0, "until=" + p.until);
  /* 2026-09-30 23:59:59 +09:00 は日本時間の 9/30 23:59。 */
  const jst = new Date(p.until).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  ok("日本時間で 2026/9/30 23:59 になる", /2026\/9\/30\s+23:59/.test(jst), jst);
}

console.log("\n② 未設定・壊れた値でも落ちない");
{
  const none = lumiUsagePolicy({ LUMI_DAILY_LIMIT: "50" }, { plan: "free" });
  ok("期限が未設定なら 0（画面は何も出さない）", none.until === 0, "until=" + none.until);
  const bad = lumiUsagePolicy({ LUMI_LIMIT_UNTIL: "いつか" }, { plan: "free" });
  ok("読めない値でも 0 を返す（落ちない）", bad.until === 0, "until=" + bad.until);
  const empty = lumiUsagePolicy({ LUMI_LIMIT_UNTIL: "   " }, { plan: "free" });
  ok("空白だけでも 0 を返す", empty.until === 0, "until=" + empty.until);
}

console.log("\n③ 無制限の人にも期限は付く（表示のため）");
{
  const p = lumiUsagePolicy({ LUMI_LIMIT_UNTIL: "2026-09-30T23:59:59+09:00" },
    { plan: "free", unlimited: true });
  ok("無制限でも until を返す", p.until > 0, "until=" + p.until);
  ok("無制限の上限は -1 のまま", p.dailyLimit === -1 && p.weeklyLimit === -1);
}

console.log("\n④ サーバが「過ぎたか」を判定して返す（端末の時計を信じない）");
{
  ok("limitUntil を返している", /limitUntil: policy\.until \|\| 0,/.test(src));
  ok("limitExpired をサーバ側で出している",
    /limitExpired: !!\(policy\.until && now > policy\.until\),/.test(src));
  /* 画面側で日付を比べていないこと。ここが崩れると端末の時計で挙動が変わる。 */
  const fn = client.match(/function usageLimitUntil\([\s\S]*?\n  \}/);
  ok("画面の関数がある", !!fn);
  if (fn) {
    ok("画面で日付を比べていない（Date.now と比較しない）",
      !/Date\.now\(\)\s*[<>]/.test(fn[0]) && !/limitUntil\s*[<>]/.test(fn[0]));
    ok("過ぎたかはサーバの limitExpired を見ている", /d\.limitExpired/.test(fn[0]));
    ok("期限が 0 のときは何も出さない", /if \(!d \|\| !d\.limitUntil\) return "";/.test(fn[0]));
    ok("サーバの時間帯（timezone）で表示する", /d\.timezone \|\| "Asia\/Tokyo"/.test(fn[0]));
    ok("日付の組み立てで落ちない（try で囲ってある）", /catch \(e\) \{ return ""; \}/.test(fn[0]));
    /* ══ 言い回し ══════════════════════════════════════════════
       「◯◯までの枠」とだけ伝える。理由の説明は入れない（本人の指示）。 */
    ok("「◯◯までの枠」と出している", /" までの枠<\/span>|<\/b> までの枠<\/span>/.test(fn[0]));
    ok("「目安です」と書いていない", !/目安です/.test(fn[0]));
    ok("「決め直します」と書いていない", !/決め直します/.test(fn[0]));
    ok("「見直しています」と書いていない", !/見直しています/.test(fn[0]));
    ok("期限切れも短い言い回し（までの枠でした）", /までの枠でした/.test(fn[0]));
  }
}

console.log("\n⑤ 画面の置き場所と設定");
{
  ok("使用量のすぐ下に出している", /\+ usageLimitUntil\(d\)\n\s*\+ "<\/div>" \+ foot\(\);/.test(client));
  ok("設定に LUMI_LIMIT_UNTIL がある", /LUMI_LIMIT_UNTIL\s*=\s*"2026-09-30T23:59:59\+09:00"/.test(toml));
  ok("無料の上限が 日次 50 になっている", /LUMI_DAILY_LIMIT\s*=\s*"50"/.test(toml));
  ok("無料の上限が 週次 200 になっている", /LUMI_WEEKLY_LIMIT\s*=\s*"200"/.test(toml));
  ok("有料は据え置き（日次 100）", /LUMI_DAILY_LIMIT_PAID\s*=\s*"100"/.test(toml));
  ok("有料は据え置き（週次 400）", /LUMI_WEEKLY_LIMIT_PAID\s*=\s*"400"/.test(toml));
}

console.log("\n" + (fail === 0 ? "✅ 全部通りました" : "❌ 落ちています") + "  通過 " + pass + " / 失敗 " + fail);
process.exit(fail === 0 ? 0 : 1);
