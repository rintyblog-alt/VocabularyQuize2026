/* ══════════════════════════════════════════════════════════════════════════
   vqall — 検査を **まとめて 走らせる 唯一の 口**（2026-09-06）

   なぜ 要るのか（実測）:
     2026-09-06 時点で 検査は 495本 ある。なのに 全部を 走らせる 口が
     1つも 無かった（package.json すら 無い）。155本 は 30日 以上
     さわられて おらず、**動くかどうかも 分からない**。
     書いた 本人が 思い出した ときだけ 走る 495本 は、0本と あまり 変わらない。
     「前は 動いてた」も「圧縮ずみを 読んでいて 何も 測って いなかった」も、
     根は ここ 1つ。

   使いかた:
     node vqall.cjs                 静的だけ（サーバも ブラウザも 要らない）
     node vqall.cjs --server        サーバが 要る もの（先に dev-local.sh echo）
     node vqall.cjs --ui            ブラウザが 要る もの
     node vqall.cjs --all           ぜんぶ（実AI は 除く）
     node vqall.cjs --ai            本物の AI を 呼ぶ もの（枠を 使う）
     node vqall.cjs --list          走らせずに 一覧だけ
     node vqall.cjs --only vqpaper,vqmathtag
     node vqall.cjs --since 7       直近 7日に さわった ものだけ
     node vqall.cjs --jobs 4 --timeout 120

   決めごと:
     * 合否は **終了コード**だけで 見る（0=合格）。495本 すべて この作法。
     * **書き込む もの（道具）は 走らせない。** 貼り直しや 束ねは 検査ではない。
     * 結果は exports/ へ 落とす（gitignore 済み）。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const 根 = __dirname;

/* ── 道具（検査では ない）。走らせると 配布物を 書き換えて しまう ───────── */
const 道具 = new Set([
  "vqbundle",      /* client/core を 束ねる */
  "vqrehash",      /* 指紋を 貼り直す */
  "vqsrc",         /* js-src → client/js */
  "vqsurvive",     /* Survive を 組む */
  "vqsurviveworld",
  "vqsurviveprod",
  "vqprodcheck",   /* esbuild して 本番と 突き合わせる */
  "vqall",         /* 自分 */
  /* 引数を 取る 道具（検査では ない）。引数 無しだと 使いかたを 出して 終わる。 */
  "vqreplay",
  "vqtlreport",
]);

/* ── 引数 ────────────────────────────────────────────────────────────── */
const 引 = process.argv.slice(2);
function 値(名, 既定) {
  const i = 引.indexOf(名);
  return i >= 0 && 引[i + 1] ? 引[i + 1] : 既定;
}
const 一覧だけ = 引.includes("--list");
const 全部 = 引.includes("--all");
const 指定 = (値("--only", "") || "").split(",").map(s => s.trim().replace(/\.cjs$/, "")).filter(Boolean);
const 日数 = Number(値("--since", 0)) || 0;
const 並列 = Math.max(1, Number(値("--jobs", 0)) || 0);
const 制限秒 = Math.max(10, Number(値("--timeout", 90)));
const 欲しい種 = new Set();
if (引.includes("--server")) 欲しい種.add("サーバ");
if (引.includes("--ui")) 欲しい種.add("ブラウザ");
if (引.includes("--ai")) 欲しい種.add("実AI");
if (引.includes("--static")) 欲しい種.add("静的");
if (全部) { 欲しい種.add("静的"); 欲しい種.add("サーバ"); 欲しい種.add("ブラウザ"); }
if (!欲しい種.size && !指定.length) 欲しい種.add("静的");

/* ── 分類 ────────────────────────────────────────────────────────────── */
const サーバ印 = /VQ_BASE|VQ_API|127\.0\.0\.1:(87|178)|localhost:(87|178)|:17891/;
const ブラウザ印 = /require\(\s*['"](puppeteer|playwright)/;
const 実AI印 = /GROQ_API_KEY|GEMINI_API_KEY|AIGEN_REAL|VQ_REAL_AI/;

/* ── 前提（立って いないと 必ず 落ちる もの）───────────────────────────
   これを 見ずに 走らせると「不合格 28本」に なり、**誰も 見なく なる**。
   立って いない ものは 不合格では なく **見送り**として、理由を 添えて 出す。 */
const 前提の表 = [
  { 名: "Bridge",     印: /1789[01]/,                       確かめ: { 元: "https://127.0.0.1:17891", 道: "/health" }, 直しかた: "bash local-ai/scripts/start-open.sh" },
  { 名: "Surviveサーバ", 印: /:8795|8795\b/,                  確かめ: { 元: "http://127.0.0.1:8795", 道: "/" },        直しかた: "Survive の 手元サーバを 立てる" },
  { 名: "合言葉",      印: /VQ_TOKEN/,                        環境: "VQ_TOKEN",       直しかた: "VQ_TOKEN=... を 付けて 走らせる" },
  { 名: "管理の合言葉", 印: /VQ_ADMIN_PASS/,                    環境: "VQ_ADMIN_PASS",  直しかた: "VQ_ADMIN_PASS=... を 付けて 走らせる" },
  { 名: "資料の見本", 印: /_fixtures/, 見本: "_fixtures/pages", 直しかた: "_fixtures/pages/ に 読み取りに かける 画像を 置く（VQ_PAGES=… でも 指せる）" },
  { 名: "起点の作業木", 印: /vqbase|git worktree/,              道あり: "/private/tmp/vqbase", 直しかた: "git worktree add /private/tmp/vqbase <起点のコミット>" },
];

/* ── **ひとりで 走らせる もの**（他を 巻き添えに する）─────────────────
   実測（2026-09-06）: vqstorekv / vqstorer2 は 手元サーバを pkill して
   自分で 立て直す。まとめて 走らせると **後ろの 検査が 全部 落ちる**。
   vq3fault は Bridge を 落とす。だから いちばん 最後に、1本ずつ。 */
const 独り占め = new Set(["vqstorekv", "vqstorer2", "vq3fault"]);

/* ── 長くかかる もの（実AI を 何本も 呼ぶ）。既定の 見切りでは 足りない。 */
const 長い = new Set(["vqaigen", "vqaiactivity", "vqformat", "vqpartsperf", "vqexamquality",
  "vqaifmt", "vqexamperf", "vqkokugoreal", "vqsurvivesoak", "vqttslisten", "vqaijob"]);

function 見立てる(名) {
  const p = path.join(根, 名 + ".cjs");
  let s = "";
  try { s = fs.readFileSync(p, "utf8"); } catch { return null; }
  const 種 = 実AI印.test(s) ? "実AI"
    : ブラウザ印.test(s) ? "ブラウザ"
      : サーバ印.test(s) ? "サーバ" : "静的";
  let 更新 = 0;
  try { 更新 = fs.statSync(p).mtimeMs; } catch { }
  const 要る = 前提の表.filter(x => x.印.test(s)).map(x => x.名);
  return { 名, 道: p, 種, 更新, 要る, 行: s.split("\n").length };
}

let 全件 = fs.readdirSync(根)
  .filter(f => /^vq.*\.cjs$/.test(f))
  .map(f => f.replace(/\.cjs$/, ""))
  .filter(n => !道具.has(n))
  .map(見立てる).filter(Boolean)
  .sort((a, b) => a.名.localeCompare(b.名));

if (指定.length) 全件 = 全件.filter(x => 指定.includes(x.名));
else 全件 = 全件.filter(x => 欲しい種.has(x.種));
if (日数) {
  const 境 = Date.now() - 日数 * 86400000;
  全件 = 全件.filter(x => x.更新 >= 境);
}

/* ── 一覧だけ ────────────────────────────────────────────────────────── */
if (一覧だけ) {
  const 数 = {};
  全件.forEach(x => { 数[x.種] = (数[x.種] || 0) + 1; });
  console.log("走らせる 検査 " + 全件.length + " 本");
  Object.keys(数).sort().forEach(k => console.log("  " + k.padEnd(8) + " " + 数[k]));
  全件.forEach(x => console.log("  " + x.種.padEnd(8) + " " + x.名 + "  (" + x.行 + "行)"));
  process.exit(0);
}

if (!全件.length) { console.log("走らせる ものが ありません。--list で 確かめて ください。"); process.exit(0); }

/* ── 前提が 立って いるか（1度だけ 確かめる）─────────────────────────── */
/* ★ node の fetch は この 手元では 通らない ことが ある（子プロセスの 検査は 通る）。
   立って いるかは **口が 開いて いるか**だけ 見る。HTTP まで 求めない。 */
const net = require("net");
function 口が開いているか(host, port, 待ち) {
  return new Promise(解決 => {
    const s = net.connect({ host, port });
    const 終い = (v) => { try { s.destroy(); } catch { } 解決(v); };
    s.setTimeout(待ち || 1500);
    s.once("connect", () => 終い(true));
    s.once("timeout", () => 終い(false));
    s.once("error", () => 終い(false));
  });
}
async function 生きているか(元) {
  try {
    const u = new URL(元);
    return await 口が開いているか(u.hostname, Number(u.port) || (u.protocol === "https:" ? 443 : 80));
  } catch { return false; }
}

const 立っていない = new Map();   /* 前提の名 → 直しかた */


async function 前提確認() {
  /* 手元サーバ */
  if (全件.some(x => x.種 === "サーバ" || x.種 === "ブラウザ")) {
    const 元 = process.env.VQ_BASE || "http://127.0.0.1:8791";
    if (!await 生きているか(元)) {
      立っていない.set("手元サーバ", "cd server && ./dev-local.sh echo");
    }
  }
  /* そのほかの 前提。**使う 検査が 1本でも ある ときだけ** 確かめる。 */
  for (const 前 of 前提の表) {
    if (!全件.some(x => (x.要る || []).includes(前.名))) continue;
    let ある = true;
    if (前.確かめ) ある = await 生きているか(前.確かめ.元);
    else if (前.環境) ある = !!process.env[前.環境];
    else if (前.道あり) ある = fs.existsSync(前.道あり);
    else if (前.見本) {
      const d = path.join(根, 前.見本);
      ある = fs.existsSync(d) && fs.readdirSync(d).some(f => !/^\./.test(f));
    }
    if (!ある) 立っていない.set(前.名, 前.直しかた);
  }
  if (立っていない.size) {
    console.log("\n── 立って いない 前提（使う 検査は **見送り**に します）──");
    for (const [k, v] of 立っていない) console.log("  " + k.padEnd(12) + " → " + v);
  }
}

/* 見送りに する か（手元サーバが 無いと サーバ／ブラウザは 全部 見送り） */
function 見送る理由(x) {
  if (立っていない.has("手元サーバ") && (x.種 === "サーバ" || x.種 === "ブラウザ")) return "手元サーバ";
  for (const n of (x.要る || [])) if (立っていない.has(n)) return n;
  return null;
}

/* ── 走らせる ────────────────────────────────────────────────────────── */
const 既定並列 = { 静的: 8, サーバ: 4, ブラウザ: 2, 実AI: 1 };
function 走る(x) {
  return new Promise(解決 => {
    const 始 = Date.now();
    const 子 = spawn(process.execPath, [x.道], {
      cwd: 根, env: process.env, stdio: ["ignore", "pipe", "pipe"],
    });
    let 出 = "", 誤 = "", 切れた = false;
    const 秒上限 = 長い.has(x.名) ? Math.max(制限秒, 300) : 制限秒;
    const 時計 = setTimeout(() => { 切れた = true; 子.kill("SIGKILL"); }, 秒上限 * 1000);
    子.stdout.on("data", d => { 出 += d; if (出.length > 400000) 出 = 出.slice(-200000); });
    子.stderr.on("data", d => { 誤 += d; if (誤.length > 400000) 誤 = 誤.slice(-200000); });
    子.on("close", code => {
      clearTimeout(時計);
      const 秒 = (Date.now() - 始) / 1000;
      解決({
        ...x, 秒: Math.round(秒 * 10) / 10, code, 切れた,
        結果: 切れた ? "時間切れ" : code === 0 ? "合格" : "不合格",
        末尾: (出 + "\n" + 誤).trim().split("\n").filter(Boolean).slice(-4).join("\n"),
      });
    });
    子.on("error", e => {
      clearTimeout(時計);
      解決({ ...x, 秒: 0, code: -1, 切れた: false, 結果: "起動できず", 末尾: String(e.message) });
    });
  });
}

async function 束で走る(組, 幅) {
  const 出 = []; let i = 0;
  const 走者 = new Array(Math.min(幅, 組.length)).fill(0).map(async () => {
    while (i < 組.length) {
      const x = 組[i++];
      const 理由 = 見送る理由(x);
      if (理由) {
        出.push({ ...x, 秒: 0, code: null, 結果: "見送り", 末尾: 理由 + " が 立って いない" });
        console.log("  － " + x.名.padEnd(24) + "     見送り（" + 理由 + "）");
        continue;
      }
      const r = await 走る(x);
      出.push(r);
      const 印 = r.結果 === "合格" ? "✓" : r.結果 === "不合格" ? "✗" : "!";
      console.log("  " + 印 + " " + r.名.padEnd(24) + String(r.秒).padStart(6) + "s  " +
        (r.結果 === "合格" ? "" : r.結果));
    }
  });
  await Promise.all(走者);
  return 出;
}

(async () => {
  await 前提確認();
  const 種順 = ["静的", "サーバ", "ブラウザ", "実AI"];
  const 全結果 = [];
  const 始 = Date.now();
  for (const 種 of 種順) {
    const 組 = 全件.filter(x => x.種 === 種 && !独り占め.has(x.名));
    if (!組.length) continue;
    const 幅 = 並列 || 既定並列[種] || 2;
    console.log("\n══ " + 種 + "（" + 組.length + "本・同時 " + 幅 + "）══");
    全結果.push(...await 束で走る(組, 幅));
  }
  /* ★ 最後に、ひとりずつ。手元サーバや Bridge を 落として 立て直す ので。 */
  const 独り = 全件.filter(x => 独り占め.has(x.名));
  if (独り.length) {
    console.log("\n══ ひとりで（" + 独り.length + "本）══");
    console.log("   ※ 手元サーバ・Bridge を 落として 立て直します。");
    全結果.push(...await 束で走る(独り, 1));
    console.log("   ※ 終わりました。手元サーバは 立て直された はずですが、");
    console.log("      続けて 何かを 走らせる ときは /api/status を 確かめて ください。");
  }

  const 合 = 全結果.filter(r => r.結果 === "合格");
  const 否 = 全結果.filter(r => r.結果 === "不合格");
  const 壊 = 全結果.filter(r => r.結果 === "時間切れ" || r.結果 === "起動できず");
  const 送 = 全結果.filter(r => r.結果 === "見送り");
  const 経過 = Math.round((Date.now() - 始) / 100) / 10;

  console.log("\n══ まとめ ══");
  console.log("  合格   " + 合.length);
  console.log("  不合格 " + 否.length);
  console.log("  壊れ   " + 壊.length + "（時間切れ・起動できず）");
  console.log("  見送り " + 送.length + "（前提が 立って いない）");
  console.log("  経過   " + 経過 + "s");

  if (否.length || 壊.length) {
    console.log("\n── 赤いもの ──");
    [...否, ...壊].sort((a, b) => a.名.localeCompare(b.名)).forEach(r => {
      console.log("\n  " + r.名 + "  [" + r.結果 + "]  " + r.秒 + "s");
      String(r.末尾 || "").split("\n").forEach(l => console.log("     " + l.slice(0, 200)));
    });
  }

  try {
    fs.mkdirSync(path.join(根, "exports"), { recursive: true });
    const 名 = "vqall-" + new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19) + ".json";
    fs.writeFileSync(path.join(根, "exports", 名),
      JSON.stringify({ 時刻: new Date().toISOString(), 経過, 合格: 合.length, 不合格: 否.length, 壊れ: 壊.length, 見送り: 送.length, 明細: 全結果 }, null, 1));
    console.log("\n  記録 → exports/" + 名);
  } catch { }

  process.exit(否.length + 壊.length ? 1 : 0);
})();
