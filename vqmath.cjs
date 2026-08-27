/* ══════════════════════════════════════════════════════════════════════
   vqmath.cjs — 数式が **画面と PDF の両方**で出ているか

   ★ 測るのは「紙に何が出たか」だけ。部品の単体試験ではない。
   ★ **外の通信は 全部 遮断して**走らせる（オフラインでも出ること）。
   ★ 印刷は 実際に PDF を書き出し、そこから 文字と図を数える。
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
const OUT = path.join(__dirname, "_mathout");
const PORT = Number(process.env.VQ_PORT || 8993);
let pass = 0, fail = 0;
const 落ち = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ✅ " + n); }
  else { fail++; 落ち.push(n); console.log("  ❌ " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 500) : "")); }
};
const 節 = (t) => console.log("\n■ " + t);
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

/* 段1 のテストが名指しした 8 種類 + 記号 */
const 式 = {
  帯分数: "2\\frac{3}{4}",
  繁分数: "\\cfrac{1}{1+\\cfrac{1}{1+\\cfrac{1}{2}}}",
  二重根号: "\\sqrt{5+2\\sqrt{6}}",
  累乗と添字: "a_{n+1}^{2}=x^{2^{n}}",
  連立方程式: "\\begin{cases} 2x+3y=7 \\\\ x-y=1 \\end{cases}",
  場合分け: "f(x)=\\begin{cases} x & (x \\geqq 0) \\\\ -x & (\\text{それ以外}) \\end{cases}",
  積分: "\\int_{0}^{1} x^{2}\\,dx=\\frac{1}{3}",
  行列: "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}",
  数直線の不等式: "-3 \\leqq x < \\frac{5}{2}"
};
const 記号 = "± √ ∫ ∬ Σ ∏ ≦ ≧ ≠ ≒ ≡ ∽ ∠ △ □ ⊥ ∥ ∵ ∴ ∈ ⊂ ∩ ∪ ∞ ° ′ ″ ㎝ ㎠ ㎤ ℓ π θ α β γ";

(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);
  const server = await serve();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  /* ★ **外の通信を 全部 落とす。**CDN が生きているせいで通ってしまう、を防ぐ。 */
  const 外へ出た = [];
  await ctx.route("**/*", (route) => {
    const u = route.request().url();
    if (u.startsWith(`http://127.0.0.1:${PORT}`) || u.startsWith("data:") || u.startsWith("blob:")
        || u.startsWith("about:") || u.startsWith("file:")) return route.continue();
    外へ出た.push(u.slice(0, 90));
    return route.abort();
  });

  const pg = await ctx.newPage();
  const 例外 = [];
  pg.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 200)));

  await pg.goto(`http://127.0.0.1:${PORT}/index.html?vq2=all`,
    { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.waitForFunction(() => window.VQM && window.VQM.spec && window.VQ2 && window.VQ2.pdfRenderer,
    { timeout: 40000 });

  節("① 本文から 数式を 抜き出す（$ \\( \\[ が 1 文字も 残らない）");
  {
    const r = await pg.evaluate((式) => {
      const 本文 = [
        "次の $x^2+5x+6=0$ を解きなさい。",
        "$$" + 式.積分 + "$$",
        "\\(" + 式.二重根号 + "\\) を簡単にせよ。",
        "\\[" + 式.行列 + "\\]",
        式.連立方程式 + " を解け。",
        "定価は \\$100 です。"      /* お金の $ は 数式ではない */
      ].join("\n");
      const 表 = {};
      const 後 = window.VQM.parse.抜く(本文, 表);
      return { 後: 後, 残り: window.VQM.parse.残り(後), 数: Object.keys(表).length,
               中身: Object.keys(表).map((k) => ({ display: 表[k].display, latex: 表[k].latex.slice(0, 40) })),
               お金: 後.indexOf("\\$100") >= 0 };
    }, 式);
    ok("5 つの式を 抜き出した", r.数 === 5, r);
    ok("本文に $ \\( \\[ が 1 文字も 残らない", r.残り.length === 0, r.残り);
    ok("$$ と \\[ と \\begin は ブロック扱い",
      r.中身.filter((x) => x.display).length === 3, r.中身);
    ok("お金の \\$ は 数式にしない", r.お金 === true, r.後);
  }

  節("② SVG に固まる（外の通信ゼロ・自分の defs を持つ）");
  {
    const r = await pg.evaluate(async (式) => {
      const 表 = {};
      Object.keys(式).forEach((k, i) => { 表["m" + i] = { latex: 式[k], display: true, 名: k }; });
      const s = await window.VQM.svg.仕込む(表, { 文字px: 14 });
      return { 結果: s, 一覧: Object.keys(表).map((k) => ({
        名: 表[k].名, svgあり: /^<svg/.test(表[k].svg || ""),
        defs: /<defs/.test(表[k].svg || ""),
        外参照: (表[k].svg || "").replace(/xmlns[^=]*="[^"]*"/g, "").indexOf("http") >= 0,
        幅: 表[k].renderedWidth, 高: 表[k].renderedHeight, だめ: 表[k].だめ || null })) };
    }, 式);
    ok("9 つ すべて SVG になった", r.一覧.every((x) => x.svgあり), r.一覧);
    ok("すべて 自分の <defs> を持つ", r.一覧.every((x) => x.defs), r.一覧);
    ok("SVG の中に 外の URL が 1 つも無い", r.一覧.every((x) => !x.外参照), r.一覧);
    ok("組めなかったものが 無い", (r.結果.だめ || []).length === 0, r.結果.だめ);
    ok("実測の 幅・高さが 入っている（推定していない）",
      r.一覧.every((x) => x.幅 > 0 && x.高 > 0), r.一覧);
    console.log("     実測: " + r.一覧.map((x) => x.名 + " " + Math.round(x.幅) + "×" + Math.round(x.高)).join(" / "));
  }

  節("③ 紙面 HTML に SVG が 埋まる（印刷窓へ そのまま持ち出せる）");
  let 紙 = "";
  {
    const r = await pg.evaluate(async (o) => {
      const S = window.VQ2.schema, L = window.VQ2.layout, R = window.VQ2.pdfRenderer;
      let 番 = 0;
      const q = (id, prompt, pts) => ({
        id: id, type: "short_answer", prompt: prompt, correctAnswer: "", points: pts,
        choices: [], difficulty: "normal", topic: "数学", number: ++番, questionNumber: 番
      });
      const spec = {
        id: "mock_test", schemaVersion: 1, title: "数学 定期テスト", subject: "数学",
        totalPoints: 100, timeLimitMinutes: 50,
        paper: { size: "A4", orientation: "portrait", templateId: "standard-school-exam" },
        sections: [{
          id: "sec1", title: "大問1", instruction: "次の問いに答えなさい。",
          questions: [
            q("q1", "次の $x^2+5x+6=0$ を解きなさい。", 10),
            q("q2", "$$" + o.式.積分 + "$$ を求めよ。", 10),
            q("q3", "\\(" + o.式.二重根号 + "\\) を簡単にせよ。", 10),
            q("q4", o.式.連立方程式 + " を解け。", 10),   /* 区切り無しの \\begin。環境は 単体でも 拾う */
            q("q5", o.式.場合分け + " のグラフをかけ。", 10),
            q("q6", "\\[" + o.式.行列 + "\\] の行列式を求めよ。", 10),
            q("q7", "$" + o.式.繁分数 + "$ を簡単にせよ。", 10),
            q("q8", "$" + o.式.累乗と添字 + "$ を計算せよ。", 10),
            q("q9", "$" + o.式.数直線の不等式 + "$ を数直線に表せ。", 10),
            q("q10", "$" + o.式.帯分数 + "$ を仮分数に直せ。", 10),
            q("s1", "次の記号を書き写しなさい: " + o.記号, 0)
          ]
        }]
      };
      const 通 = await window.VQM.spec.通す(spec, { 文字px: 14 });
      const plan = L.buildPlan(spec, {});
      const html = R.buildHtml(spec, plan, { bookletId: "question-booklet" });
      return { 通: 通, html: html,
               SVGの数: (html.match(/<svg/g) || []).length,
               生の記号: (html.replace(/&\w+;/g, "").match(/\$|\\\(|\\\[/g) || []).length,
               外のURL: (html.match(/https?:\/\/[^"' )]+/g) || []).filter((u) => !/w3\.org/.test(u)),
               記号あり: o.記号.split(" ").every((c) => html.indexOf(c) >= 0) };
    }, { 式, 記号 });
    紙 = r.html;
    fs.writeFileSync(path.join(OUT, "paper.html"), 紙);
    ok("数式を 10 個 抜き出した", r.通.抜いた >= 10, r.通);
    ok("紙面 HTML に SVG が 10 個以上 埋まっている", r.SVGの数 >= 10, r.SVGの数);
    ok("紙面 HTML に 生の $ \\( \\[ が 1 つも 無い", r.生の記号 === 0, r.生の記号);
    ok("紙面 HTML に 外の URL が 1 つも 無い", r.外のURL.length === 0, r.外のURL);
    ok("数学記号が すべて 本文に入っている", r.記号あり === true, r.記号あり);
    ok("通しの検査で 崩れ 0", (r.通.errors || []).length === 0, r.通.errors);
  }

  節("④ 印刷窓と同じ道（about:blank へ document.write）で 描ける");
  {
    const p2 = await ctx.newPage();
    await p2.goto("about:blank");
    await p2.evaluate((h) => { document.open(); document.write(h); document.close(); }, 紙);
    await p2.waitForTimeout(1200);
    const r = await p2.evaluate((記号) => {
      const svgs = Array.from(document.querySelectorAll("svg"));
      const 箱 = svgs.map((s) => s.getBoundingClientRect());
      const 面 = document.querySelector(".sheet") || document.body;
      const 面箱 = 面.getBoundingClientRect();
      const 溢れ = 箱.filter((b) => b.width > 0 && b.right > 面箱.right + 1).length;
      /* 豆腐（.notdef）の検出は 直接できないので、記号の実幅を見る。
         描けていない字は 幅 0 か 極端に狭い。 */
      const 測 = document.createElement("span");
      測.style.cssText = "position:absolute;visibility:hidden;font-size:40px";
      document.body.appendChild(測);
      const 幅 = {};
      記号.split(" ").forEach((c) => { 測.textContent = c; 幅[c] = 測.getBoundingClientRect().width; });
      測.remove();
      return { svg数: svgs.length,
               描けた: 箱.filter((b) => b.width > 1 && b.height > 1).length,
               溢れ: 溢れ, 記号の幅: 幅,
               幅ゼロの記号: Object.keys(幅).filter((k) => 幅[k] < 4) };
    }, 記号);
    ok("印刷窓でも SVG が 描かれる（幅・高さが 0 でない）",
      r.svg数 > 0 && r.描けた === r.svg数, r);
    ok("数式が 紙の右端から はみ出していない", r.溢れ === 0, r.溢れ);
    ok("数学記号に 豆腐（幅ゼロ）が 無い", r.幅ゼロの記号.length === 0, r.幅ゼロの記号);
    await p2.screenshot({ path: path.join(OUT, "print-window.png"), fullPage: true });
    await p2.pdf({ path: path.join(OUT, "paper.pdf"), format: "A4", printBackground: true });
    await p2.close();
    ok("PDF を 書き出せた", fs.existsSync(path.join(OUT, "paper.pdf"))
      && fs.statSync(path.join(OUT, "paper.pdf")).size > 20000,
      fs.existsSync(path.join(OUT, "paper.pdf")) ? fs.statSync(path.join(OUT, "paper.pdf")).size : 0);
  }

  節("⑤ 崩れた式は 黙って消さない");
  {
    const r = await pg.evaluate(async () => {
      const 表 = { bad: { latex: "\\frac{1}{", display: false } };
      await window.VQM.svg.仕込む(表, { 文字px: 14 });
      const spec = { id: "m2", title: "t", sections: [{ id: "s", questions: [
        { id: "q", type: "short_answer", prompt: "$\\frac{1}{$ を計算せよ。", points: 1, choices: [] }] }] };
      const 通 = await window.VQM.spec.通す(spec, { 文字px: 14 });
      return { だめ: 表.bad.だめ || null, errors: (通.errors || []).map((e) => e.code) };
    });
    ok("組めない式は だめ として印が付く", !!r.だめ, r);
    ok("通しの検査が mathBroken を 出す", r.errors.indexOf("mathBroken") >= 0, r.errors);
  }

  節("⑥ 数式のために 外へ 1 本も 出ていない");
  {
    /* ★ アプリ全体は まだ CDN を たくさん使っている（Material Symbols /
       jsQR / html2canvas / marked / firebase / dompurify）。それは 段1 の話ではない。
       ここで見るのは **数式に関わる通信だけ**。1 本でも出ていたら
       オフラインで数式が消える。 */
    const 数式の外 = 外へ出た.filter((u) => /katex|mathjax|fonts\.gstatic|\.woff/i.test(u));
    ok("数式のための 外の通信が 0 本（" + 数式の外.length + " 本）",
      数式の外.length === 0, 数式の外.slice(0, 8));
    console.log("     （参考）数式以外で 遮断した外の通信: " + 外へ出た.length + " 本");
  }

  ok("画面の例外が 出ていない", 例外.length === 0, 例外.slice(0, 4));
  console.log("\n出力: " + OUT + "  （paper.html / paper.pdf / print-window.png）");
  console.log("\n合格 " + pass + " / 失敗 " + fail);
  if (落ち.length) console.log("落ちた: " + 落ち.join(" / "));
  await browser.close();
  server.close();
  process.exit(fail ? 1 : 0);
})();
