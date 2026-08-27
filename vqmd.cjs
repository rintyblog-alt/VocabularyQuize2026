/* ══════════════════════════════════════════════════════════════════════
   vqmd.cjs — Lumi の板（マークダウン）が 本当に かたちになるか

   ★ 測るのは 見た目ではなく **中身**。
       ① 強調・下線・色・取り消しが 効く
       ② 表・箇条書き・引用・区切り・コードが 組まれる
       ③ 図（-> でつなぐ）が 箱と矢印になる
       ④ 数式が **SVG** になる（外の通信ゼロ）
       ⑤ **生の HTML は 通さない**（差し込みの穴が 無い）
       ⑥ 道具の口（showNote / hideNote）から 出せる・閉じられる
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
const PORT = Number(process.env.VQ_PORT || 8995);
let pass = 0, fail = 0;
const 落ち = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ✅ " + n); }
  else { fail++; 落ち.push(n); console.log("  ❌ " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 400) : "")); }
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

const 見本 = [
  "# 二次方程式の解きかた",
  "",
  "**因数分解**できるなら それが いちばん早い。__たすきがけ__ を 覚える。",
  "できないときは ==r:解の公式== を使う。~~あてずっぽう~~ は しない。",
  "",
  "$$x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}$$",
  "",
  "1. 式を $ax^2+bx+c=0$ の形にする",
  "2. 因数分解できるか 見る",
  "   - できる → そのまま 解く",
  "   - できない → 公式",
  "3. 答えを 代入して 確かめる",
  "",
  "| 判別式 | 解の数 |",
  "|---|---|",
  "| $b^2-4ac>0$ | 2 個 |",
  "| $b^2-4ac=0$ | 1 個 |",
  "| $b^2-4ac<0$ | 実数では なし |",
  "",
  "> 代入して 確かめるまでが 1 問です。",
  "",
  "```図",
  "式を整える -> 因数分解を試す -> 公式 -> 確かめ",
  "```",
  "",
  "---",
  "`x = 2` のように 書いて 提出する。"
].join("\n");

(async () => {
  const server = await serve();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1000 } });
  const 外へ出た = [];
  await ctx.route("**/*", (route) => {
    const u = route.request().url();
    if (u.startsWith(`http://127.0.0.1:${PORT}`) || /^(data|blob|about|file):/.test(u)) return route.continue();
    外へ出た.push(u.slice(0, 80));
    return route.abort();
  });
  const pg = await ctx.newPage();
  const 例外 = [];
  pg.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 200)));

  await pg.goto(`http://127.0.0.1:${PORT}/index.html?vq2=all`,
    { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.waitForFunction(() => window.VQMD && window.VQMD.render && window.__vqLive,
    { timeout: 40000 });
  await pg.evaluate(() => {
    const o = document.getElementById("firstLaunchOverlay");
    if (o) o.style.display = "none";
  });

  節("① 強調・下線・色・取り消し");
  {
    const h = await pg.evaluate((s) => window.VQMD.render(s), 見本);
    ok("**太字** が strong になる", /<strong>因数分解<\/strong>/.test(h), h.slice(0, 200));
    ok("__下線__ が u になる", /<u>たすきがけ<\/u>/.test(h), null);
    ok("==r:…== が 赤い印になる", /<mark class="vqmd-r">解の公式<\/mark>/.test(h), null);
    ok("~~取り消し~~ が s になる", /<s>あてずっぽう<\/s>/.test(h), null);
    ok("# 見出しが h1 になる", /<h1 class="vqmd-h">二次方程式の解きかた<\/h1>/.test(h), null);
  }

  節("② 表・箇条書き・引用・区切り・コード");
  {
    const h = await pg.evaluate((s) => window.VQMD.render(s), 見本);
    ok("表が組まれる（見出し 2 列・本文 3 行）",
      /<table class="vqmd-t">/.test(h) && (h.match(/<tr>/g) || []).length === 4, (h.match(/<tr>/g) || []).length);
    ok("番号つきと 入れ子の箇条書きが 出る",
      /<ol class="vqmd-ol">/.test(h) && /<ul class="vqmd-ul">/.test(h), null);
    ok("引用が blockquote になる", /<blockquote class="vqmd-q">/.test(h), null);
    ok("--- が hr になる", /<hr class="vqmd-hr">/.test(h), null);
    ok("`その場のコード` が code になる", /<code class="vqmd-c">x = 2<\/code>/.test(h), null);
  }

  節("③ 図（-> でつなぐ）");
  {
    const h = await pg.evaluate((s) => window.VQMD.render(s), 見本);
    const 箱 = (h.match(/vqmd-zu-b/g) || []).length;
    const 矢 = (h.match(/vqmd-zu-a/g) || []).length;
    ok("箱が 4 つ・矢印が 3 つ", 箱 === 4 && 矢 === 3, { 箱, 矢 });
  }

  節("④ 数式が SVG になる（外の通信ゼロ）");
  {
    const r = await pg.evaluate(async (s) => {
      await window.VQM.svg.用意();
      const h = window.VQMD.render(s);
      return { svg: (h.match(/<svg/g) || []).length,
               生ドル: (h.replace(/&\w+;/g, "").match(/\$/g) || []).length,
               外: /https?:\/\//.test(h.replace(/xmlns[^=]*="[^"]*"/g, "")) };
    }, 見本);
    ok("数式が すべて SVG になる（$$1 つ + 文中 4 つ）", r.svg >= 5, r);
    ok("生の $ が 1 つも 残らない", r.生ドル === 0, r);
    ok("SVG に 外の URL が 無い", r.外 === false, r);
  }

  節("⑤ 生の HTML は 通さない（差し込みの穴が 無い）");
  {
    const r = await pg.evaluate(() => {
      const 悪 = [
        '<img src=x onerror="window.__やられた=1">',
        '<script>window.__やられた=1<\/script>',
        '[押して](javascript:window.__やられた=1)',
        '<div onclick="window.__やられた=1">押して</div>',
        '`<img src=x onerror=alert(1)>`'
      ].join("\n\n");
      const h = window.VQMD.render(悪);
      const d = document.createElement("div");
      d.innerHTML = h;
      document.body.appendChild(d);
      const 出 = { やられた: !!window.__やられた,
                   img: d.querySelectorAll("img").length,
                   script: d.querySelectorAll("script").length,
                   onclick: d.querySelectorAll("[onclick],[onerror]").length,
                   a: d.querySelectorAll("a").length,
                   文: d.textContent.slice(0, 60) };
      d.remove();
      return 出;
    });
    ok("script が 1 つも 生えない", r.script === 0, r);
    ok("img が 1 つも 生えない", r.img === 0, r);
    ok("onclick / onerror が 1 つも 生えない", r.onclick === 0, r);
    ok("javascript: のリンクが 生えない（a タグ 0）", r.a === 0, r);
    ok("何も 実行されていない", r.やられた === false, r);
    ok("危ない字は **文字として** 出る", /<img/.test(r.文) || /押して/.test(r.文), r.文);
  }

  節("⑥ 道具の口（showNote / hideNote）");
  {
    const r = await pg.evaluate(async (s) => {
      const L = window.__vqLive;
      const 出 = await Promise.resolve(L.道具("showNote", { title: "二次方程式", markdown: s }));
      const d = document.getElementById("vqLiveNote");
      const b = d ? d.getBoundingClientRect() : null;
      return { 出: 出, 見えている: !!(d && d.classList.contains("show")),
               題: d ? d.querySelector(".vqn-t").textContent : null,
               表: d ? d.querySelectorAll(".vqmd-t").length : 0,
               図: d ? d.querySelectorAll(".vqmd-zu-b").length : 0,
               式: d ? d.querySelectorAll("svg").length : 0,
               幅: b ? Math.round(b.width) : 0, 高: b ? Math.round(b.height) : 0,
               画面幅: innerWidth };
    }, 見本);
    ok("showNote で 板が 出る", r.見えている === true && !!r.出.やった, r.出);
    ok("見出しが 出る", r.題 === "二次方程式", r.題);
    ok("板の中に 表がある", r.表 === 1, r.表);
    ok("板の中に 図がある", r.図 === 4, r.図);
    ok("板の中に 数式（SVG）がある", r.式 >= 5, r.式);
    ok("板が 画面に 収まっている", r.幅 <= r.画面幅 && r.高 > 100, r);
    await pg.screenshot({ path: path.join(__dirname, "_mathout", "note.png") });
    const r2 = await pg.evaluate(async () => {
      const 閉 = await Promise.resolve(window.__vqLive.道具("hideNote", {}));
      await new Promise((r) => setTimeout(r, 300));
      const d = document.getElementById("vqLiveNote");
      return { 閉: 閉, まだ見えている: d.classList.contains("show") };
    });
    ok("hideNote で 閉じる", !r2.まだ見えている && !!r2.閉.やった, r2);
    const r3 = await pg.evaluate(async () =>
      await Promise.resolve(window.__vqLive.道具("showNote", { markdown: "" })));
    ok("中身が 空なら 断る", !!r3.だめ, r3);
  }

  節("⑦ 飾りの無い文は そのまま");
  {
    const r = await pg.evaluate(() => ({
      飾り無し: window.VQMD.飾りがある("こんにちは。今日は何をする？"),
      飾りあり: window.VQMD.飾りがある("**大事**なところ"),
      素: window.VQMD.素("# 見出し\n- **太字** の項目\n| a | b |")
    }));
    ok("飾りの有無を 見分ける", r.飾り無し === false && r.飾りあり === true, r);
    ok("素の文に 直せる（読み上げ・記録用）",
      r.素.indexOf("**") < 0 && r.素.indexOf("#") < 0 && /見出し/.test(r.素), r.素);
  }

  節("⑧ 外の道具に 頼っていない");
  {
    /* ★ ここまでの ①〜⑦ は **外の通信を 全部 遮断したまま** 通っている。
       それが「頼っていない」ことの 証拠。
       アプリの別の所（Quick Chat など）は まだ marked / highlight.js を
       CDN から読むが、**板は 1 つも 使っていない**。混ぜて数えない。 */
    const 数式の外 = 外へ出た.filter((u) => /katex|mathjax|fonts\.gstatic|\.woff/i.test(u));
    ok("数式のために 外へ 出ていない（" + 数式の外.length + " 本）",
      数式の外.length === 0, 数式の外.slice(0, 5));
    const 使った = await pg.evaluate(() => ({
      marked: typeof window.marked, dompurify: typeof window.DOMPurify,
      板の描画元: String(window.VQMD.render).indexOf("marked") < 0 ? "自前" : "marked"
    }));
    ok("板の描画は 自前（marked を 使っていない）", 使った.板の描画元 === "自前", 使った);
    console.log("     （参考）遮断した 外の通信: " + 外へ出た.length + " 本"
      + "（アプリの別機能のもの。板は 1 本も 使っていない）");
  }


  節("⑨ 数式が まだ 読み込めていないときも、あとで 組み直す");
  {
    /* ★ 実測の不具合（2026-08-17）: MathJax は 数式が出てから 読み込むので、
       **1 回目の板は $…$ が そのままの字**で出ていた。それが 画面の文として
       Lumi へ戻り、\frac などを 読み上げ始めた（「変な英語」の正体）。 */
    const r = await pg.evaluate(async () => {
      const L = window.__vqLive;
      /* まだ 読み込んでいない状態から 始める（読み込み済みなら そのまま通る） */
      const 先 = window.VQM.svg.読み込み済み();
      await Promise.resolve(L.道具("showNote",
        { title: "式のテスト", markdown: "答えは $\\frac{1}{2}$ だよ。" }));
      const d = document.getElementById("vqLiveNote");
      const すぐ = { svg: d.querySelectorAll("svg").length,
                     文: (d.querySelector(".vqn-b").textContent || "") };
      /* 読み込みが 終わるまで 待つ */
      await window.VQM.svg.用意();
      await new Promise((r) => setTimeout(r, 900));
      const あと = { svg: d.querySelectorAll("svg").length,
                     文: (d.querySelector(".vqn-b").textContent || "") };
      return { 先に読み込み済み: 先, すぐ, あと };
    });
    ok("最後には 数式が SVG に なっている", r.あと.svg >= 1, r);
    ok("最後には 生の $ が 板に 残っていない",
      (r.あと.文.match(/\$/g) || []).length === 0, r.あと.文);
    console.log("     出した直後: SVG " + r.すぐ.svg + " ／ 読み込み後: SVG " + r.あと.svg);
  }

  節("⑩ 板と帯は 画面の文として 読み返さない（自分の記号を 読み上げない）");
  {
    const r = await pg.evaluate(async () => {
      const L = window.__vqLive;
      await Promise.resolve(L.道具("showNote",
        { title: "読み返し", markdown: "これは $x^2+1$ の話。" }));
      const rr = await Promise.resolve(L.道具("readScreen", {}));
      const 全 = JSON.stringify(rr || {});
      return { 記号が混ざる: 全.indexOf("x^2+1") >= 0 || 全.indexOf("\\frac") >= 0,
               見出しが分かる: 全.indexOf("読み返し") >= 0,
               中身: 全.slice(0, 300) };
    });
    /* ★ 2026-08-19 に **決めが 変わった**（訴え「ボードが Lumi に
       見えていないのかもしれない。見えるようにして」）。
         ・板の **記号（$ や \frac）は 今も 混ぜない**（読み上げてしまう）
         ・ただし **板が 出ていること と 見出し**は 分かるようにする
           （前は 0 件で 返っていたので、自分が 出した板を 一度も 見られなかった）
       中身そのものは boardBlocks で 読む。 */
    ok("板の 記号が 画面の文に 混ざらない", r.記号が混ざる === false, r.中身);
    ok("★ 板が 出ていることは 分かる（見出しが 届く）", r.見出しが分かる === true, r.中身);
  }


  節("⑪ 数式の 書きかたを **4 通りとも** 拾う（反映されないことがある の直し）");
  {
    const r = await pg.evaluate(async () => {
      await window.VQM.svg.用意();
      const 形 = {
        "$…$": "答えは $x^2+1$ だよ。",
        "$$…$$": "$$x=\\frac{1}{2}$$",
        "\\(…\\)": "答えは \\(x^2+1\\) だよ。",
        "\\[…\\]": "\\[x=\\frac{1}{2}\\]",
        "begin環境": "\\begin{cases} x+y=3 \\\\ x-y=1 \\end{cases}"
      };
      const 出 = {};
      Object.keys(形).forEach((k) => {
        const h = window.VQMD.render(形[k]);
        出[k] = { svg: (h.match(/<svg/g) || []).length,
                  生: (h.replace(/&\w+;/g, "").match(/\$|\\\(|\\\[|\\begin/g) || []).length };
      });
      return 出;
    });
    Object.keys(r).forEach((k) => {
      ok(k + " が SVG になる", r[k].svg >= 1, r[k]);
      ok(k + " の 生の記号が 残らない", r[k].生 === 0, r[k]);
    });
  }

  節("⑫ 上の帯（島）でも 飾りと 数式が 効く");
  {
    const r = await pg.evaluate(async () => {
      await window.VQM.svg.用意();
      const v = window.__vqLive;
      v.忘れる();
      const 言 = v.言う("**大事**なのは $x^2+5x+6=0$ の形。\n- 因数分解\n- 解の公式", false);
      const sp = document.querySelector("#vqLiveEdge .isl span");
      return { 画面: 言.画面,
               svg: sp ? sp.querySelectorAll("svg").length : -1,
               太字: sp ? sp.querySelectorAll("strong").length : -1,
               箇条: sp ? sp.querySelectorAll("li").length : -1,
               生ドル: sp ? (sp.textContent.match(/\$/g) || []).length : -1,
               左寄せ: sp ? getComputedStyle(sp).textAlign : "" };
    });
    ok("帯の中で 数式が SVG になる", r.svg >= 1, r);
    ok("帯の中で 太字が 効く", r.太字 === 1, r);
    ok("帯の中で 箇条書きが 出る", r.箇条 === 2, r);
    ok("帯に 生の $ が 残らない", r.生ドル === 0, r);
    ok("飾りが あるときは 左そろえ", r.左寄せ === "left", r.左寄せ);
  }

  節("⑬ 飾りの無い ふつうの返事は これまでどおり");
  {
    const r = await pg.evaluate(() => {
      const v = window.__vqLive;
      v.忘れる();
      const 言 = v.言う("こんにちは。今日は 何を する？", false);
      const sp = document.querySelector("#vqLiveEdge .isl span");
      return { 画面: 言.画面, タグ: sp ? sp.children.length : -1,
               そろえ: sp ? getComputedStyle(sp).textAlign : "" };
    });
    ok("そのまま 文字で 出る", r.画面 === "こんにちは。今日は 何を する？", r.画面);
    ok("よけいなタグを 足さない", r.タグ === 0, r.タグ);
    ok("中央そろえのまま", r.そろえ === "center", r.そろえ);
  }


  節("⑭ 崩れやすい 書き方（実際に 崩れていたもの）");
  {
    const r = await pg.evaluate(async () => {
      await window.VQM.svg.用意();
      const 試 = {
        "式に = が入るマーカー": ["答えは ==x=3== だよ", { mark: 1, 残: 0 }],
        "マーカーの中に 数式": ["==答えは $x=2$==", { mark: 1, 残: 0, svg: 1 }],
        "色つき（すき間あり）": ["== r: 大事 ==", { mark: 1, 残: 0, 赤: 1 }],
        "太字の中に 数式": ["**答えは $x=2$**", { strong: 1, 残: 0, svg: 1 }],
        "見出しに 数式": ["# $x^2$ の解きかた", { 残: 0, svg: 1 }],
        "マーカー 2 つ": ["==A== と ==B==", { mark: 2, 残: 0 }],
        "取り消しに =": ["~~x=5~~", { 残: 0 }],
        "表の中に マーカーと式": ["| a | b |\n|---|---|\n| ==大事== | $x=1$ |",
          { mark: 1, 残: 0, svg: 1 }],
        "番号つきの下線": ["__1:ここ__ を 見て", { 残: 0, 番号: 1 }],
        "橙のマーカー": ["==o:ここ==", { mark: 1, 残: 0 }]
      };
      const 出 = {};
      Object.keys(試).forEach((k) => {
        const h = window.VQMD.render(試[k][0]);
        出[k] = { 期待: 試[k][1],
          mark: (h.match(/<mark/g) || []).length,
          strong: (h.match(/<strong>/g) || []).length,
          svg: (h.match(/<svg/g) || []).length,
          赤: (h.match(/vqmd-r/g) || []).length,
          番号: (h.match(/vqmd-no/g) || []).length,
          残: (h.match(/==|~~|\*\*|__/g) || []).length,
          文: h.replace(/<svg[\s\S]*?<\/svg>/g, "[式]").replace(/<[^>]+>/g, "").slice(0, 34) };
      });
      return 出;
    });
    Object.keys(r).forEach((k) => {
      const x = r[k], e = x.期待;
      const 合 = Object.keys(e).every((f) => x[f] === e[f]);
      ok(k, 合, { 出た: { mark: x.mark, strong: x.strong, svg: x.svg, 赤: x.赤, 番号: x.番号, 残: x.残 },
                  期待: e, 文: x.文 });
    });
  }


  節("⑮ 図形（数直線・三角形・円・長方形・座標）");
  {
    const r = await pg.evaluate(async () => {
      await window.VQM.svg.用意();
      const 図 = ["数直線: -3 <= x < 2.5", "三角形: 3, 4, 5 直角", "円: r=5",
                  "長方形: たて3 よこ5", "座標: y = 2x + 1"];
      const md = "```図\n" + 図.join("\n") + "\n```";
      await Promise.resolve(window.__vqLive.道具("showNote", { title: "図", markdown: md }));
      const d = document.getElementById("vqLiveNote");
      const b = d.getBoundingClientRect();
      /* 図は 3 つの 描き手が いる（かんたん図 / 図形エンジン / 座標エンジン）。
         **どれが 描いたかは 問わない**。5 行が 5 つの 図に なることを 見る。 */
      const fs = Array.from(d.querySelectorAll(".vqmd-fig, .vqmd-geo > svg, .vqmd-zu-f > svg")).map((e) => {
        const r2 = e.getBoundingClientRect();
        return { w: Math.round(r2.width), h: Math.round(r2.height),
                 はみ出し: r2.right > b.right + 1, 中身: e.innerHTML.length };
      });
      /* 数が 読めないものは **描かない**（それらしい図を 作らない） */
      const だめ = window.VQMD.render("```図\n三角形: たぶん おおきい\n```");
      return { 図: fs, 読めないとき: { svg: (だめ.match(/<svg/g) || []).length,
                                        文字: /たぶん おおきい/.test(だめ) } };
    });
    ok("5 つとも 図になる", r.図.length === 5, r.図);
    ok("どれも ボードから はみ出さない", r.図.every((f) => !f.はみ出し), r.図);
    ok("どれも 実寸で 出る（引き伸ばされない）",
      r.図.every((f) => f.w > 60 && f.w <= 300 && f.h > 30), r.図);
    ok("中身が 空の図が 無い", r.図.every((f) => f.中身 > 100), r.図.map((f) => f.中身));
    ok("数が 読めないときは **描かず 文字のまま**",
      r.読めないとき.svg === 0 && r.読めないとき.文字 === true, r.読めないとき);
    console.log("     実寸: " + r.図.map((f) => f.w + "×" + f.h).join(" / "));
  }


  節("⑯ 図形エンジン（位置が ずれない・大きさが 違わない）");
  {
    const r = await pg.evaluate(() => {
      const G = window.VQG;
      const 出 = {};
      /* ① 3 辺だけ 渡す → 座標を こちらで 作る。長さは **ぴったり** 合うこと */
      const t = G.描く("三角形 3,4,5\n直角 A", {});
      出.三辺 = { svg: !!t.svg, 長さ: t.長さ };
      /* ② 縦横が 同じ倍率か（正方形が 正方形のまま か） */
      const sq = G.描く("点 A(0,0) B(4,0) C(4,4) D(0,4)\n多角形 A B C D", {});
      const m = /width="(\d+)" height="(\d+)"/.exec(sq.svg || "");
      出.正方形 = { w: m ? +m[1] : 0, h: m ? +m[2] : 0 };
      /* ③ 言われた長さと 座標が 食い違ったら **描かない** */
      出.食い違い = G.描く("点 A(0,0) B(3,0)\n線 A-B\n辺 A-B = 7", {});
      /* ④ 合っていれば 描く */
      出.合っている = G.描く("点 A(0,0) B(3,0)\n線 A-B\n辺 A-B = 3", {});
      /* ⑤ 成り立たない三角形は 断る */
      出.作れない = G.描く("三角形 1,1,5", {});
      /* ⑥ 円・関数・軸 */
      出.円 = G.描く("点 O(0,0)\n円 O r=2", {});
      出.関数 = G.描く("関数 y = x^2 - 1", {});
      /* ⑦ 座標の 位置が 実際に 合っているか（B は A の 右 4） */
      const p = G.描く("点 A(0,0) B(4,0) C(0,3)\n多角形 A B C", {});
      const 円ら = [...(p.svg || "").matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="2.6"/g)]
        .map((x) => ({ x: +x[1], y: +x[2] }));
      出.点の位置 = 円ら;
      出.倍率 = p.倍率;
      return 出;
    });

    ok("3 辺だけで 三角形が 描ける", r.三辺.svg === true, r.三辺);
    const L = {}; (r.三辺.長さ || []).forEach((x) => { L[x.辺] = x.長さ; });
    ok("3, 4, 5 が **ぴったり** 出る",
      L.AB === 3 && L.AC === 4 && L.BC === 5, L);
    ok("正方形は 正方形のまま（縦横 同じ倍率）",
      Math.abs(r.正方形.w - r.正方形.h) <= 1, r.正方形);
    /* ★ 約束を 変えた（2026-08-17・訴え「図が 書けないと 言われる」）。
       前: 食い違ったら **描かない**
       今: **描く。ただし 貼る数字は 座標から 出したもの**（嘘の数字は 出さない）。
           食い違ったことは 下に 一言 出す。図が 出ないより ずっとよい。 */
    ok("食い違っても 描く（図が 出ないほうが 困る）", !!r.食い違い.svg, r.食い違い);
    ok("**書かれた 7 は どこにも 出ない**（嘘の数字を 貼らない）",
      (r.食い違い.svg || "").indexOf(">7<") < 0, r.食い違い.svg && r.食い違い.svg.slice(0, 120));
    ok("座標から 出した 3 を 貼る", (r.食い違い.svg || "").indexOf(">3<") >= 0, r.食い違い.svg);
    ok("食い違ったことを 黙らない", (r.食い違い.ちがい || []).length === 1, r.食い違い.ちがい);
    ok("合っていれば 描く", !!r.合っている.svg, r.合っている.だめ);
    ok("成り立たない三角形は 断る",
      !!r.作れない.だめ && /作れません/.test(r.作れない.だめ), r.作れない);
    ok("円が 描ける", !!r.円.svg, r.円.だめ);
    ok("関数（2 次）が 描ける", !!r.関数.svg && /polyline/.test(r.関数.svg), r.関数.だめ);
    /* 点の 置きかたを 数で 確かめる: A(0,0) B(4,0) C(0,3)
       → B は A の 右へ 4×倍率、C は A の 上へ 3×倍率 */
    const P = r.点の位置, s2 = r.倍率;
    if (P && P.length === 3) {
      const A = P[0], B = P[1], C = P[2];
      ok("B は A の 右へ ちょうど 4",
        Math.abs((B.x - A.x) - 4 * s2) < 1.2 && Math.abs(B.y - A.y) < 1.2,
        { dx: B.x - A.x, 期待: 4 * s2, dy: B.y - A.y });
      ok("C は A の 上へ ちょうど 3",
        Math.abs((A.y - C.y) - 3 * s2) < 1.2 && Math.abs(C.x - A.x) < 1.2,
        { dy: A.y - C.y, 期待: 3 * s2, dx: C.x - A.x });
    } else ok("点が 3 つ 描かれる", false, P);
  }

  節("⑯-2 書き方の ゆれと、直せるものは 直す");
  {
    const r = await pg.evaluate(() => {
      const G = window.VQG;
      const 試 = {
        "点の語なし": "A(0,0) B(4,0) C(0,3)\n多角形 A B C",
        "三角形ABC（くっつき）": "点 A(0,0) B(4,0) C(0,3)\n三角形ABC",
        "辺 AB（ハイフン無し）": "点 A(0,0) B(4,0)\n線 AB\n辺 AB = 4",
        "コメント行あり": "// 直角三角形\n点 A(0,0) B(4,0) C(0,3)\n多角形 A B C",
        "説明文まじり": "点 A(0,0) B(4,0) C(0,3)\n多角形 A B C\nこれは 直角三角形です",
        "英語": "point A(0,0) B(4,0) C(0,3)\npolygon A B C",
        "全角カッコ": "点 A（0,0） B（4,0） C（0,3）\n多角形 A B C"
      };
      const 出 = { 通った: [], 落ちた: [] };
      Object.keys(試).forEach((k) => {
        const g = G.描く(試[k], {});
        (g.svg ? 出.通った : 出.落ちた).push(k + (g.svg ? "" : ": " + g.だめ));
      });
      /* AI が やりがち: 座標は いいかげん・辺の長さは 正しい → **作り直す** */
      const 直 = G.描く("点 A(0,0) B(5,0) C(2,4)\n三角形 A B C\n辺 A-B = 3\n辺 A-C = 4\n辺 B-C = 5", {});
      出.作り直し = { 作り直した: 直.作り直した, 長さ: 直.長さ };
      /* 断るべきもの */
      出.作れない = !!G.描く("三角形 1,1,5", {}).だめ;
      出.点が無い = !!G.描く("多角形 A B C", {}).だめ;
      return 出;
    });
    ok("7 通りの 書き方が すべて 通る（落ち " + r.落ちた.length + " 件）",
      r.落ちた.length === 0, r.落ちた);
    ok("座標が いいかげんでも 辺の長さから **作り直す**",
      (r.作り直し.作り直した || []).length === 1, r.作り直し);
    const L2 = {}; (r.作り直し.長さ || []).forEach((x) => { L2[x.辺] = x.長さ; });
    ok("作り直したあと 3, 4, 5 が ぴったり",
      L2.AB === 3 && L2.AC === 4 && L2.BC === 5, L2);
    ok("作れない三角形は いまも 断る", r.作れない === true, r);
    ok("点が 決まっていなければ いまも 断る", r.点が無い === true, r);
  }

  節("⑰ ボードに 図形を 出す（```図形）");
  {
    const r = await pg.evaluate(async () => {
      const md = "```図形\n点 A(0,0) B(4,0) C(0,3)\n多角形 A B C\n直角 A\n辺 A-B\n辺 A-C\n辺 B-C\n```"
        + "\n\n```図形\n三角形 5,5,6\n印 A-B\n印 A-C\n```"
        + "\n\n```図形\n点 A(0,0) B(9,9)\n辺 A-B = 3\n```";
      await Promise.resolve(window.__vqLive.道具("showNote", { title: "図形", markdown: md }));
      const d = document.getElementById("vqLiveNote");
      const b = d.getBoundingClientRect();
      const gs = Array.from(d.querySelectorAll(".vqg")).map((e) => {
        const r2 = e.getBoundingClientRect();
        return { w: Math.round(r2.width), h: Math.round(r2.height), はみ出し: r2.right > b.right + 1 };
      });
      return { 図: gs, 断り: d.querySelectorAll(".vqmd-geo-ng").length,
               注意: d.querySelectorAll(".vqmd-geo-note").length,
               注意文: (d.querySelector(".vqmd-geo-note") || {}).textContent || "" };
    });
    ok("3 つとも 描かれる（食い違いも 描く）", r.図.length === 3, r.図);
    ok("ボードから はみ出さない", r.図.every((f) => !f.はみ出し), r.図);
    ok("断りは 出ない（描けるものは 描く）", r.断り === 0, r);
    ok("食い違いは 図の 下に 一言 出す", r.注意 >= 1, r);
  }


  節("⑱ 囲みの無い \\frac なども 数式になる（訴え「frac が 効いていない」）");
  {
    const r = await pg.evaluate(async () => {
      await window.VQM.svg.用意();
      const 試 = {
        "囲み無しの frac": ["答えは \\frac{1}{2} だよ。", 1],
        "囲み無しの sqrt": ["\\sqrt{2} は およそ 1.41。", 1],
        "囲み無しの pm": ["x = 3 \\pm 1 です。", 1],
        "囲み無しの pi と 累乗": ["面積は \\pi r^{2} です。", 1],
        "入れ子の frac": ["\\frac{\\frac{1}{2}}{3} を 計算。", 1],
        "数式でない \\ は そのまま": ["C:\\Users\\test の 場所", 0]
      };
      const 出 = {};
      Object.keys(試).forEach((k) => {
        const h = window.VQMD.render(試[k][0]);
        出[k] = { svg: (h.match(/<svg/g) || []).length, 期待: 試[k][1],
                  生: (h.match(/\\frac|\\sqrt|\\pm|\\pi/g) || []).length,
                  文: h.replace(/<svg[\s\S]*?<\/svg>/g, "[式]").replace(/<[^>]+>/g, "").slice(0, 28) };
      });
      return 出;
    });
    Object.keys(r).forEach((k) => {
      ok(k, r[k].svg === r[k].期待 && r[k].生 === 0, r[k]);
    });
  }

  節("⑲ AR Board（ボードが 消えずに 残る・写真つき）");
  {
    const r = await pg.evaluate(async () => {
      const S = window.VQB.store;
      /* 前のものを 消してから 測る */
      S.全消し();
      /* 写真つきで 1 枚 しまう（小さな 赤い 四角） */
      const cv = document.createElement("canvas");
      cv.width = 900; cv.height = 700;
      const cx = cv.getContext("2d");
      cx.fillStyle = "#c33"; cx.fillRect(0, 0, 900, 700);
      const 大きい写真 = cv.toDataURL("image/jpeg", 0.92);
      const a = await S.足す({ title: "三平方の定理", markdown: "# 三平方\n$a^2+b^2=c^2$",
                               photo: 大きい写真, source: "camera", subject: "数学" });
      const b = await S.足す({ title: "写真なしのボード", markdown: "**大事**な話" });
      const 一 = S.一覧();
      const 取 = S.取る(a.id);
      /* 写真は 小さくして しまわれているか */
      const 縮 = await new Promise((res) => {
        const im = new Image(); im.onload = () => res({ w: im.width, h: im.height });
        im.onerror = () => res(null); im.src = 取.photo;
      });
      return { しまえた: !!a.id, 写真あり: a.写真あり, 数: 一.length,
               新しいものが先: 一[0].title,
               もとの大きさ: 大きい写真.length, しまった大きさ: 取.photo.length,
               縮んだ: 縮, 写真なし: !S.取る(b.id).photo,
               使っている量: S.使っている量() };
    });
    ok("ボードを しまえる", r.しまえた && r.数 === 2, r);
    ok("写真も 一緒に 入る", r.写真あり === true, r);
    ok("写真は **小さくして** しまう（元のままにしない）",
      r.しまった大きさ < r.もとの大きさ * 0.5 && r.縮んだ && r.縮んだ.w <= 480, r);
    ok("新しいものが 先に 並ぶ", r.新しいものが先 === "写真なしのボード", r.新しいものが先);
    ok("写真の無いものも しまえる", r.写真なし === true, r);
    console.log("     写真: " + Math.round(r.もとの大きさ / 1024) + "KB → "
      + Math.round(r.しまった大きさ / 1024) + "KB（" + r.縮んだ.w + "×" + r.縮んだ.h + "）"
      + " ／ 置き場: " + r.使っている量 + "KB");

    /* 画面（一覧 → 中身） */
    const u = await pg.evaluate(async () => {
      window.VQB.ui.開く({});
      await new Promise((x) => setTimeout(x, 500));
      const h = document.getElementById("vq2-ar-board");
      const sr = h && h.shadowRoot;
      const カード = sr ? sr.querySelectorAll(".vqb-card").length : -1;
      const 写真 = sr ? sr.querySelectorAll(".vqb-thumb img").length : -1;
      const 印 = sr ? sr.querySelectorAll(".vqb-tag").length : -1;
      if (sr) sr.querySelector(".vqb-card").click();
      await new Promise((x) => setTimeout(x, 400));
      const 中 = sr ? { 本文: sr.querySelectorAll(".vqmd").length,
                        操作: sr.querySelectorAll(".vqb-bar button").length } : null;
      return { カード, 写真, 印, 中 };
    });
    ok("一覧に カードが 2 枚 出る", u.カード === 2, u);
    ok("写真つきの カードに 写真が 出る", u.写真 === 1, u);
    ok("カメラの印が つく", u.印 === 1, u);
    ok("押すと 中身が 出る", u.中 && u.中.本文 === 1, u.中);
    ok("名前を変える・消す が ある", u.中 && u.中.操作 === 3, u.中);
    await pg.screenshot({ path: path.join(__dirname, "_mathout", "arboard.png") });
  }

  /* ★ 2026-08-19 に **決めが 変わった**（訴え
       「AR Board は、ユーザーが 保存した時だけ 一覧に 追加しよう」）。
     出した瞬間に 残していたので、試しに 出したものまで 全部 溜まり、
     要るものが 埋もれていた。いまは **保存ボタンを 押したときだけ** 入る。 */
  節("⑳ ボードは **押したときだけ** AR Board に 残る");
  {
    const r = await pg.evaluate(async () => {
      window.VQB.store.全消し();
      await Promise.resolve(window.__vqLive.道具("showNote",
        { title: "押すまで残らない", markdown: "答えは $x=2$" }));
      await new Promise((x) => setTimeout(x, 400));
      const 出しただけ = window.VQB.store.一覧().length;
      /* 見出しの 右の 保存ボタンを 押す */
      const b = document.querySelector("#vqLiveNote .vqn-s");
      if (b) b.click();
      await new Promise((x) => setTimeout(x, 600));
      const 一 = window.VQB.store.一覧();
      const 道 = await Promise.resolve(window.__vqLive.道具("listBoards", {}));
      return { 出しただけ, 数: 一.length, 題: 一[0] && 一[0].title, 道: 道,
               ボタンがある: !!b };
    });
    ok("★ 出しただけでは 残らない", r.出しただけ === 0, r);
    ok("保存ボタンが ある", r.ボタンがある === true, r);
    ok("押したら 残る", r.数 === 1 && r.題 === "押すまで残らない", r);
    ok("listBoards が 数を 返す", r.道.残してある数 === 1, r.道);
  }

  ok("画面の例外が 出ていない", 例外.length === 0, 例外.slice(0, 4));
  console.log("\n合格 " + pass + " / 失敗 " + fail);
  if (落ち.length) console.log("落ちた: " + 落ち.join(" / "));
  await browser.close();
  server.close();
  process.exit(fail ? 1 : 0);
})();
