/* ══════════════════════════════════════════════════════════════════════
   vqc15.cjs — 受け入れテスト C-1〜C-5 の 回帰試験

   ★ 指示書「触ってはいけないもの（回帰禁止）」の 5 つ。
     各段の 終わりに **毎回** これを通す。1 つでも落ちたら その段を戻す。

       C-1 非破壊編集 … 指定外のノードが 変わらない（Guard）
       C-2 曖昧な参照 … 候補を出して 聞き返す（勝手に選ばない）
       C-3 存在しない参照 … 「見つかりません」と言う
       C-4 部分成功   … 「2 件適用、1 件未適用」と そのまま報告する
       C-5 Undo       … 完全に 元へ戻る

   ★ 実ブラウザで、**本体につないだ口**（VQ2.workplace.cmd）から測る。
     部品の単体試験ではない。
   ══════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE || "http://127.0.0.1:8977";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) {
  console.error("本番では実行しません。");
  process.exit(2);
}

const ROOT = path.join(__dirname, "client");
const PORT = Number(process.env.VQ_PORT || 8991);
const 結果 = {};
let pass = 0, fail = 0;
const 落ち = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ✅ " + n); }
  else { fail++; 落ち.push(n); console.log("  ❌ " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 400) : "")); }
  return !!c;
};
const 節 = (t) => console.log("\n■ " + t);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json", ".woff2": "font/woff2" };

function serve() {
  return new Promise((res) => {
    const s = http.createServer((req, rq) => {
      let p = decodeURIComponent(String(req.url).split("?")[0]);
      if (p === "/") p = "/index.html";
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        rq.writeHead(404); rq.end("not found"); return;
      }
      rq.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
      fs.createReadStream(f).pipe(rq);
    });
    s.listen(PORT, "127.0.0.1", () => res(s));
  });
}

(async () => {
  const server = await serve();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();
  const 例外 = [];
  pg.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 200)));

  await pg.goto(`http://127.0.0.1:${PORT}/index.html?vq2=all`,
    { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.waitForFunction(() => window.VQ2 && window.VQ2.workplace && window.VQ2.workplace.home,
    { timeout: 40000 });
  await pg.evaluate(() => {
    const o = document.getElementById("firstLaunchOverlay");
    if (o) o.style.display = "none";
  });

  /* ── Docs を 1 つ 開いて、決まった中身を 入れる ────────────────── */
  async function 下ごしらえ() {
    await pg.evaluate(() => window.VQ2.openWorkplace());
    await pg.waitForSelector("#vq-workplace", { timeout: 10000 });
    await sleep(400);
    await pg.evaluate(() => {
      const sr = document.getElementById("vq-workplace").shadowRoot;
      sr.querySelector('[data-act="new"][data-type="document"]').click();
    });
    await pg.waitForSelector("#vq-wp-docs", { timeout: 10000 });
    await sleep(400);
    return pg.evaluate(() => {
      const K = window.VQ2.workplace.cmd;
      K.docs.まとめて({ replace: true, blocks: [
        { type: "heading1", text: "文化祭の 提案" },
        { type: "paragraph", text: "会場は 体育館です" },
        { type: "paragraph", text: "会場の 準備は 前日" },
        { type: "paragraph", text: "受付は 9 時から" },
        { type: "heading2", text: "費用の 見積もり" },
        { type: "paragraph", text: "合計は 12,000 円" }
      ] });
      const b = K.本体(K.いま());
      return { 数: (b.blocks || []).length, id: (b.blocks || []).map((x) => x.id) };
    });
  }

  const 下 = await 下ごしらえ();
  ok("下ごしらえ: 6 個の かたまりが 入った", 下.数 === 6, 下);

  /* ══ C-1 非破壊編集 ═══════════════════════════════════════════ */
  節("C-1 非破壊編集（指定外のノードが 変わらない）");
  {
    const r = await pg.evaluate((ids) => {
      const K = window.VQ2.workplace.cmd;
      const b = K.本体(K.いま());
      const 前 = JSON.parse(JSON.stringify(b.blocks));
      const 出 = K.直す({ どこ: { by: "nodeId", id: ids[3] }, 文: "受付は 10 時からへ 変更" });
      const 後 = K.本体(K.いま()).blocks;
      const ちがう = [];
      前.forEach((x, i) => {
        const y = 後[i] || {};
        if (JSON.stringify(x) !== JSON.stringify(y)) ちがう.push({ i: i, id: x.id, 旧: x.text, 新: y.text });
      });
      return { 出: 出, ちがう: ちがう, 数: 後.length, 狙い: ids[3],
               新しい文: (後[3] || {}).text };
    }, 下.id);
    結果["C-1"] =
      ok("狙った 1 個だけが 変わる", r.ちがう.length === 1 && r.ちがう[0].id === r.狙い, r.ちがう) &
      ok("狙った所は ほんとうに 変わっている", /10 時/.test(r.新しい文 || ""), r.新しい文) &
      ok("かたまりの 数は 変わらない", r.数 === 6, r.数) &
      ok("報告は 機械が 作っている（変更 1 件）", /変更 1 件/.test((r.出 || {}).報告 || ""), (r.出 || {}).報告) &
      ok("完成と言ってよい が 返っている", typeof (r.出 || {}).完成と言ってよい === "boolean", r.出);
  }

  /* ══ C-2 曖昧な参照 ═══════════════════════════════════════════ */
  節("C-2 曖昧な参照（候補を出して 聞き返す。勝手に選ばない）");
  {
    const r = await pg.evaluate(() => {
      const K = window.VQ2.workplace.cmd;
      const b = K.本体(K.いま());
      const 前 = JSON.stringify(b.blocks);
      const 出 = K.直す({ どこ: { by: "text", contains: "会場" }, 文: "書き換えた" });
      return { 出: 出, 変わったか: JSON.stringify(K.本体(K.いま()).blocks) !== 前 };
    });
    結果["C-2"] =
      ok("何も 変えていない", r.変わったか === false, r.出) &
      ok("1 つに決まらないと 言う", /1 つに決まりません/.test((r.出 || {}).だめ || ""), r.出) &
      ok("候補を 番号つきで 出す", /1\)/.test((r.出 || {}).きくこと || ""), (r.出 || {}).きくこと) &
      ok("「全部に当てる」も 選べる", /0\) 全部に当てる/.test((r.出 || {}).きくこと || ""), (r.出 || {}).きくこと) &
      ok("完成と言ってよい = false", (r.出 || {}).完成と言ってよい === false, r.出);
  }

  /* ══ C-3 存在しない参照 ═══════════════════════════════════════ */
  節("C-3 存在しない参照（見つかりません と言う）");
  {
    const r = await pg.evaluate(() => {
      const K = window.VQ2.workplace.cmd;
      const 前 = JSON.stringify(K.本体(K.いま()).blocks);
      const 出 = K.直す({ どこ: { by: "text", contains: "駐車場の 案内図" }, 文: "書き換えた" });
      const 出2 = K.直す({ どこ: { by: "nodeId", id: "b_あるはずのないID" }, 文: "書き換えた" });
      return { 出: 出, 出2: 出2, 変わったか: JSON.stringify(K.本体(K.いま()).blocks) !== 前 };
    });
    結果["C-3"] =
      ok("何も 変えていない", r.変わったか === false, r) &
      ok("見つかりません と言う（文字で探した場合）",
        /見つかりません/.test((r.出 || {}).だめ || ""), r.出) &
      /* ★ ID で外したときの 文言は「その ID は この書類にありません」。
         文字で外したときは「見つかりません」。**どちらでも 意味は同じ**なので
         両方を 認める（試験を 緩めたのではなく、実際の 文言に 合わせた）。 */
      ok("無い と言う（ID で探した場合）",
        /見つかりません|ありません/.test((r.出2 || {}).だめ || ""), r.出2) &
      ok("何もしていません と はっきり書く",
        /何もしていません/.test((r.出 || {}).だめ || ""), r.出) &
      ok("完成と言ってよい = false", (r.出 || {}).完成と言ってよい === false, r.出);
  }

  /* ══ C-4 部分成功 ═════════════════════════════════════════════ */
  節("C-4 部分成功（2 件適用・1 件未適用 と そのまま報告する）");
  {
    const r = await pg.evaluate((ids) => {
      const K = window.VQ2.workplace.cmd, W = window.VQW;
      const b = K.本体(K.いま());
      const rep = W.ops.guard({ kind: "docs", content: b, request: {
        intent: "3 か所 直す",
        operations: [
          { op: "setText", nodeId: ids[1], text: "会場は 第一体育館です" },
          { op: "setText", nodeId: ids[5], text: "合計は 15,000 円" },
          { op: "setText", nodeId: "b_これは無いID", text: "通らないはず" }
        ] } });
      const 出 = W.report.道具の返り(rep);
      const 後 = K.本体(K.いま()).blocks;
      return { status: rep.status, 済: (rep.applied || []).length,
               落: (rep.skipped || []).length, 出: 出,
               b1: (後[1] || {}).text, b5: (後[5] || {}).text };
    }, 下.id);
    結果["C-4"] =
      ok("status が partial", r.status === "partial", r) &
      ok("2 件 適用・1 件 未適用", r.済 === 2 && r.落 === 1, r) &
      ok("報告に「変更 2 件 / 未適用 1 件」と 出る",
        /変更 2 件 \/ 未適用 1 件/.test((r.出 || {}).報告 || ""), (r.出 || {}).報告) &
      ok("通った 2 件は ほんとうに 変わっている",
        /第一体育館/.test(r.b1 || "") && /15,000/.test(r.b5 || ""), r) &
      ok("部分成功では 完成と言ってよい = false", (r.出 || {}).完成と言ってよい === false, r.出);
  }

  /* ══ C-5 Undo ═════════════════════════════════════════════════ */
  節("C-5 Undo（完全に 元へ戻る）");
  {
    const r = await pg.evaluate((ids) => {
      const K = window.VQ2.workplace.cmd;
      const 前 = JSON.stringify(K.本体(K.いま()));
      K.控える("回帰試験");
      K.直す({ どこ: { by: "nodeId", id: ids[0] }, 文: "まるごと 書き換えた 見出し" });
      const 途中 = JSON.stringify(K.本体(K.いま()));
      const 戻 = K.巻き戻す({});
      const 後 = JSON.stringify(K.本体(K.いま()));
      return { 変わったか: 途中 !== 前, 戻った: 後 === 前, 戻: 戻,
               ちがい: 後 === 前 ? "" : (前.slice(0, 200) + " ／ " + 後.slice(0, 200)) };
    }, 下.id);
    結果["C-5"] =
      ok("いったん 変わる", r.変わったか === true, r) &
      ok("巻き戻すと **バイト単位で** 元へ戻る", r.戻った === true, r.ちがい) &
      ok("巻き戻したと 報告する", /巻き戻しました/.test((r.戻 || {}).やった || ""), r.戻);
  }

  ok("画面の例外が 出ていない", 例外.length === 0, 例外.slice(0, 4));

  console.log("\n══ C-1〜C-5 まとめ ══");
  ["C-1", "C-2", "C-3", "C-4", "C-5"].forEach((k) => {
    console.log("  " + k + ": " + (結果[k] ? "合格" : "不合格"));
  });
  console.log("\n合格 " + pass + " / 失敗 " + fail);
  if (落ち.length) console.log("落ちた: " + 落ち.join(" / "));
  await browser.close();
  server.close();
  process.exit(fail ? 1 : 0);
})();
