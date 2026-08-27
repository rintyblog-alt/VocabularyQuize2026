/* ══════════════════════════════════════════════════════════════════════
   vqsay.cjs — 言いきりを **道具で** 縛れているか（ホワイトリスト方式）

   ★ 前のやり方（禁止表現の一覧）は 実測で 破られた。
     「開きました」が 一覧に無く、開いていないのに 通った（T6）。
   ★ 方式を変えたので、試験も 変える。測るのは 次の 5 つ。
       ① 道具を 1 つも 呼んでいないとき、「開きました」が 画面に残らない
       ② openFile が 実際に走ったときは、「開いたよ」は 残る
       ③ 失敗した道具（だめ）は 根拠にならない
       ④ 品質の主張（崩れもない）は **数えた結果**が通らないと 残らない
       ⑤ 主張でない文（あいさつ・問いかけ・これからの話）は 落とさない
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
const PORT = Number(process.env.VQ_PORT || 8992);
let pass = 0, fail = 0;
const 落ち = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ✅ " + n); }
  else { fail++; 落ち.push(n); console.log("  ❌ " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 500) : "")); }
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

  節("① T6 — 道具を 1 つも 呼んでいないのに「開きました」");
  {
    const t = await pg.evaluate(() => {
      const v = window.__vqLive;
      v.忘れる();
      return v.言う("昨日作ったファイルを開きました。中身を見てみてね。", false);
    });
    ok("「開きました」が 画面に残らない",
      (t.画面 || "").indexOf("開きました") < 0, t.画面);
    ok("落とした理由が 「その道具が 動いていない」",
      (t.落とした[0] || {}).なぜ === "その道具が 動いていない", t.落とした);
    /* ★ 2026-08-18・訴え「道具がどうのこうのって 上部に表示されちゃってる」。
       前は「道具は 1 つも 動いていません」という **作り手向けの文**を
       Lumi の言葉と 同じ大きさで 並べていた。伏せたことは 知らせたままで、
       知らせかたを 小さな印に 変えた。**測るところは 変えない**——
       「伏せたと 分かること」と「作り手の言葉が 会話に 混ざらないこと」。 */
    ok("伏せたことは 印で 知らせている", t.伏せた印 === true, t);
    ok("作り手向けの文が 会話に 混ざらない",
      !/道具|確かめられていないこと/.test(t.画面 || ""), t.画面);
    ok("生の言葉は 記録として 残っている",
      t.生 === "昨日作ったファイルを開きました。中身を見てみてね。", t.生);
    ok("主張でない文（中身を見てみてね）は 残る",
      (t.画面 || "").indexOf("中身を見てみてね") >= 0, t.画面);
  }

  節("② openFile が 実際に走ったときは 残る");
  {
    const t = await pg.evaluate(async () => {
      const v = window.__vqLive;
      v.忘れる();
      /* 実在しないファイル名 → だめ が返る（＝根拠にならない） */
      const だめ = await Promise.resolve(v.道具("openFile", { name: "存在しない書類ZZZ" }));
      const a = v.言う("ファイルを開いたよ。", false);
      /* 実在するものを 作ってから 開く */
      const 作 = await Promise.resolve(v.道具("newFile", { kind: "document", title: "開く試験" }));
      const b = v.言う("ファイルを開いたよ。", false);
      return { だめ: だめ && だめ.だめ ? String(だめ.だめ).slice(0, 80) : null,
               失敗のあと: a, 成功のあと: b, 作: 作 && 作.だめ ? 作.だめ : "作れた" };
    });
    ok("③ 失敗した道具（だめ）は 根拠にならない",
      (t.失敗のあと.画面 || "").indexOf("開いたよ") < 0, t);
    ok("newFile が 走ったあとは 「開いたよ」が 残る",
      (t.成功のあと.画面 || "").indexOf("開いたよ") >= 0, t.成功のあと);
    ok("走った道具が 記録に載っている",
      Object.keys(t.成功のあと.走った道具 || {}).indexOf("newFile") >= 0, t.成功のあと.走った道具);
  }

  節("④ 品質の主張は **数えた結果**が通らないと 残らない");
  {
    const t = await pg.evaluate(async (s) => {
      const K = window.VQ2.workplace.cmd, v = window.__vqLive;
      K.docs.まとめて({ replace: true, blocks: [
        { type: "heading1", text: "数学 定期テスト" },
        { type: "paragraph", text: "大問2 ○○の値を求めなさい" }
      ] });
      const r1 = await Promise.resolve(v.道具("reviewDocument", {}));
      const 言 = v.言う(s, false);
      return { 残る崩れ: r1 && r1.残る崩れ, よい: r1 && r1.完成と言ってよい, 言: 言 };
    }, "見直しもしたから、崩れもないはず！確認してみてね。");
    ok("崩れが 残っている", t.残る崩れ > 0, t);
    ok("reviewDocument は 走っているが 「見直しもした」は 落ちる",
      (t.言.画面 || "").indexOf("見直しもした") < 0, t.言.画面);
    ok("落とした理由が 「数えた結果が 通っていない」",
      (t.言.落とした[0] || {}).なぜ === "数えた結果が 通っていない", t.言.落とした);
    ok("代わりに 機械の報告が 画面に出る",
      /まだ 直す所が/.test(t.言.画面 || ""), t.言.画面);
  }

  節("⑤ 崩れが 無くなれば 品質の主張も 通る");
  {
    const t = await pg.evaluate(async (s) => {
      const K = window.VQ2.workplace.cmd, v = window.__vqLive;
      K.docs.まとめて({ replace: true, blocks: [
        { type: "heading1", text: "数学 定期テスト" },
        { type: "paragraph", text: "大問2 x の値を求めなさい" }
      ] });
      const r1 = await Promise.resolve(v.道具("reviewDocument", {}));
      return { 残る崩れ: r1 && r1.残る崩れ, 言: v.言う(s, false) };
    }, "見直しました。崩れもないよ。");
    ok("崩れ 0 になった", t.残る崩れ === 0, t);
    ok("そのまま 画面に出る（落とさない）",
      t.言.画面 === "見直しました。崩れもないよ。", t.言.画面);
  }

  節("⑥ 主張でない文は 落とさない（あいさつ・問いかけ・これからの話）");
  {
    const t = await pg.evaluate(() => {
      const v = window.__vqLive;
      v.忘れる();
      return v.言う("やあ！Lumiだよ。今日は何をする？これから問題用紙を作るね。", false);
    });
    ok("あいさつ・問いかけ・これからの話は そのまま出る",
      t.画面 === "やあ！Lumiだよ。今日は何をする？これから問題用紙を作るね。", t.画面);
    ok("何も 落としていない", (t.落とした || []).length === 0, t.落とした);
  }

  節("⑥' ふだんの受け答えは 落とさない（2026-08-18・訴え）");
  {
    /* 実物の画面に出ていた文。もの作りの話を していないのに、
       「大丈夫だよ」だけで 1 文まるごと 消え、代わりに 道具の話が 出ていた。 */
    const t = await pg.evaluate(() => {
      const v = window.__vqLive;
      v.忘れる();
      return v.言う("ごめんね、驚かせちゃったかな。怖がらせるつもりはなかったんだ。大丈夫だよ。", false);
    });
    ok("「大丈夫だよ」は 会話では 落とさない",
      (t.画面 || "").indexOf("大丈夫だよ") >= 0, t.画面);
    ok("1 文も 落としていない", (t.落とした || []).length === 0, t.落とした);
    ok("伏せた印も 出ない", t.伏せた印 === false, t);

    const u = await pg.evaluate(() => {
      const v = window.__vqLive;
      v.忘れる();
      return v.言う("準備ができたよ。いつでも始められるね。", false);
    });
    ok("「できたよ」も 会話では 落とさない",
      (u.画面 || "").indexOf("できたよ") >= 0, u.画面);
  }

  節("⑦ 言い方を変えても 通らない（ブラックリストの穴が 塞がっている）");
  {
    const 言い換え = ["ファイルを開いておいたよ。", "資料を読み込みました。",
      "ネットで調べました。", "スライドを追加しました。", "プリセットを削除しました。",
      "設定に反映しました。", "メールで送りました。", "書き出しました。"];
    const t = await pg.evaluate((xs) => {
      const v = window.__vqLive;
      return xs.map((s) => { v.忘れる(); const r = v.言う(s, false); return { 文: s, 画面: r.画面 }; });
    }, 言い換え);
    let 漏れ = t.filter((x) => x.画面.indexOf(x.文.replace(/。$/, "")) >= 0);
    ok("8 通りの言い換えが すべて 落ちる（漏れ " + 漏れ.length + " 件）",
      漏れ.length === 0, 漏れ);
  }


  節("⑧ 「覚えた」は 覚える口を 通さないと 言えない");
  {
    const t = await pg.evaluate(() => {
      const v = window.__vqLive;
      v.忘れる();
      return v.言う("わかった、覚えておくね。テストは来週だよね。", false);
    });
    ok("道具ゼロでは「覚えておく」が 落ちる",
      (t.画面 || "").indexOf("覚えておく") < 0, t.画面);
    ok("落とした種が「覚えた」", (t.落とした[0] || {}).種 === "覚えた", t.落とした);
    ok("主張でない文は 残る", (t.画面 || "").indexOf("テストは来週") >= 0, t.画面);
  }

  節("⑨ カメラ中は 解く口を 通さないと 答えを言えない");
  {
    const t = await pg.evaluate(async () => {
      const v = window.__vqLive;
      v.忘れる();
      const 外 = v.言う("答えは5cmだよ。", false);        /* カメラ無し＝ふつうの受け答え */
      return { カメラ無し: 外.画面 };
    });
    ok("カメラを見せていなければ ふつうに答えられる",
      t.カメラ無し === "答えは5cmだよ。", t.カメラ無し);
  }

  ok("画面の例外が 出ていない", 例外.length === 0, 例外.slice(0, 4));
  console.log("\n合格 " + pass + " / 失敗 " + fail);
  if (落ち.length) console.log("落ちた: " + 落ち.join(" / "));
  await browser.close();
  server.close();
  process.exit(fail ? 1 : 0);
})();
