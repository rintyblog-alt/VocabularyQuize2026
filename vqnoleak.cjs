/* ══════════════════════════════════════════════════════════════════════════
   vqnoleak.cjs — 画面に「中の仕組み」を出さない（2026-08-13）

     ① LUMI の見出しに β の印が無い
     ② 使用制限に「あと ○%（○ 回）」が無い（使用済みの割合だけ）
     ③ 画面に出る文言に この Mac / クラウド / 提供元名 / モデル名 が無い

   ③ はファイル全体の文字列を走査する。コメントは対象外。
   利用規約の本文（「クラウド保存」）だけは法的文書なので除く。
   ══════════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const HTML = path.join(__dirname, "client", "index.html");

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (detail ? "  → " + detail : "")); }
};

/* ── ③ ファイル全体の走査 ───────────────────────────────────── */
function sweep() {
  const src = require("./vqsrc.cjs").丸ごと();
  const L = src.split("\n");
  /* 「どこで動いているか」を明かす言葉 */
  const NG = /(この Mac|Mac（|クラウド|Gemini|gemini|gpt-oss|GPT-oss|Groq|groq|llama)/;
  const STR = /"((?:[^"\\]|\\.){2,140})"|'((?:[^'\\]|\\.){2,140})'/g;
  /* 除外: 利用規約の本文（法的文書。「クラウド保存」を含む） */
  const ALLOW = [/AI機能、クラウド保存、データベース/];

  const hits = [];
  for (let i = 0; i < L.length; i++) {
    const t = L[i].trim();
    if (t.startsWith("*") || t.startsWith("/*") || t.startsWith("//")) continue;
    let m;
    STR.lastIndex = 0;
    while ((m = STR.exec(L[i]))) {
      const v = m[1] || m[2] || "";
      if (!NG.test(v)) continue;
      /* 日本語を含むもの＝画面に出す文言 */
      if (!/[ぁ-んァ-ン一-龥]/.test(v)) continue;
      if (ALLOW.some((re) => re.test(v))) continue;
      hits.push((i + 1) + ": " + v.slice(0, 90));
    }
  }
  console.log("\n③ 画面の文言に中の仕組みが出ていない");
  ok("この Mac / クラウド / 提供元名 / モデル名 を含む文言が 0 件",
    hits.length === 0, hits.join("  |  "));

  console.log("\n① β の印");
  ok("LUMI の見出しに β を付ける HTML が無い",
    src.indexOf('<span class="vq2-beta" title="この機能は開発中です">β</span>') < 0);

  console.log("\n② 使用制限の内訳");
  ok("「あと ○%」を出す HTML が無い", src.indexOf('vq2-us-rest">あと ') < 0);
  ok("「（○ 回）」を出す式が無い", src.indexOf('u.remaining != null ? "（" + u.remaining + " 回）"') < 0);
}

/* ── 実際に開いて確かめる ───────────────────────────────────── */
async function live() {
  const br = await chromium.launch();
  const pg = await br.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e.message).slice(0, 120)));
  await pg.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.waitForFunction(() => window.VQ2 && VQ2.activity, null, { timeout: 60000 });

  console.log("\n① LUMI のパネルを実際に出して確かめる");
  const r1 = await pg.evaluate(() => {
    /* 部品をそのまま作って中身を見る */
    const A = VQ2.activity;
    if (!A || !A.Panel) return { 作れない: true, 名: Object.keys(A || {}) };
    const p = new A.Panel({ title: "LUMI" });
    const html = p.html();
    return {
      見出し: (html.match(/vq2-aiact-t">([\s\S]{0,80})/) || [])[1] || "",
      βがある: html.indexOf("vq2-beta") >= 0 || html.indexOf(">β<") >= 0
    };
  });
  if (r1.作れない) ok("Panel を作れる", false, "activity の中身: " + (r1.名 || []).join(","));
  else {
    ok("見出しに β が無い", !r1.βがある, r1.見出し);
    ok("見出しは LUMI のまま", r1.見出し.indexOf("LUMI") >= 0, r1.見出し);
  }

  console.log("\n② 使用制限のモーダルを実際に出して確かめる");
  const r2 = await pg.evaluate(() => {
    const A = VQ2.activity;
    if (!A || !A.usageModalHtml) return { 作れない: true, 名: Object.keys(A || {}) };
    /* 半分使った状態を、キャッシュへ直接置いて描かせる */
    const half = { used: 5, limit: 10, percentage: 50, remaining: 5, resetAt: Date.now() + 3600e3 };
    A.usageCache.loading = false;
    A.usageCache.error = "";
    A.usageCache.at = Date.now();
    A.usageCache.data = { loggedIn: true, plan: "free", unlimited: false,
                          daily: half, weekly: Object.assign({}, half) };
    const html = A.usageModalHtml();
    return {
      html: html.slice(0, 600),
      /* 「あと ○%」だけを見る。「あと 1時間後にリセット」は
         内訳ではなく次にリセットされる時刻なので、残してよい。 */
      あと割合がある: /あと\s*\d+\s*%/.test(html),
      リセット時刻: (html.match(/[^<>]{0,24}リセット[^<>]{0,8}/) || [])[0] || "(無し)",
      回がある: /（\s*\d+\s*回）/.test(html),
      使用済みがある: html.indexOf("使用済み") >= 0
    };
  });
  if (r2.作れない) ok("usageModalHtml を呼べる", false, "activity の中身: " + (r2.名 || []).join(","));
  else {
    ok("「あと ○%」が出ない", !r2.あと割合がある);
    ok("リセットまでの時間は残っている（内訳ではないため）",
      r2.リセット時刻 !== "(無し)", r2.リセット時刻);
    ok("「（○ 回）」が出ない", !r2.回がある);
    ok("使用済みの割合は出る（帯だけにはしない）", r2.使用済みがある);
  }

  ok("画面エラーが出ていない", errs.length === 0, errs.join(" / "));
  await br.close();
}

(async () => {
  console.log("═══ vqnoleak — 中の仕組みを画面に出さない ═══");
  sweep();
  await live();
  console.log("\n─────────────────────────────");
  console.log("通過 " + pass + " / 失敗 " + fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("落ちた:", e); process.exit(1); });
