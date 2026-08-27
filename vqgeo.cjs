/* ══════════════════════════════════════════════════════════════════════
   vqgeo.cjs — 図形・グラフを **全部 描いて 点検する**

   ★ 訴え（2026-08-17）「数学界・理系界隈に ある 記号・図形・表に 対応して。
     必ず ずれなく 描画ミスも なく 表示できるように。これ 絶対条件」。

   ★ だから ここでは **1 つずつ 実際に 描いて、機械が 見る**。
       ・SVG が 出たか
       ・NaN / Infinity が 混ざっていないか
       ・**枠から はみ出していないか**（＝ずれ）
       ・中身が 空でないか
       ・ボードに 入れたとき 画面から はみ出さないか
     1 つでも 落ちたら 名前を 出して 失敗にする。
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
const PORT = Number(process.env.VQ_PORT || 8996);
let pass = 0, fail = 0;
const 落ち = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ✅ " + n); }
  else { fail++; 落ち.push(n); console.log("  ❌ " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 300) : "")); }
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

/* 描けて ほしいもの（1 行 = 1 図） */
const 図ら = [
  ["関数（1次）", "関数: y = 2x + 1"],
  ["関数（2次）", "関数: y = x^2 - 2x - 3"],
  ["関数（3次）", "関数: y = x^3 - 3x"],
  ["関数（反比例）", "関数: y = 6/x"],
  ["関数（√）", "関数: y = sqrt(x)"],
  ["関数（絶対値）", "関数: y = abs(x - 1)"],
  ["関数（sin）", "関数: y = sin(x)"],
  ["関数（cos）", "関数: y = cos(2x)"],
  ["関数（指数）", "関数: y = exp(x)"],
  ["関数（対数）", "関数: y = ln(x)"],
  ["散布図", "散布図: (1,2) (2,3) (3,5) (4,4) (5,7) (6,8)"],
  ["散布図（x: y: 形式）", "散布図: x: 1,2,3,4,5 y: 2,4,5,4,6"],
  ["円グラフ", "円グラフ: りんご 30, みかん 20, ぶどう 50"],
  ["棒グラフ", "棒グラフ: 国語 60, 数学 80, 英語 70"],
  ["折れ線グラフ", "折れ線: 4月 10, 5月 22, 6月 18, 7月 30"],
  ["ヒストグラム", "ヒストグラム: 0-10 3, 10-20 7, 20-30 5"],
  ["箱ひげ図", "箱ひげ: 2,4,5,7,8,9,12,15"],
  ["正多角形", "正多角形: 6 r=2"],
  ["扇形", "扇形: r=3 角=60"],
  ["楕円", "楕円: a=4 b=2"],
  ["平行四辺形", "平行四辺形: 5, 3 角=60"],
  ["台形", "台形: 上=3 下=6 高=4"],
  ["立方体", "立方体: 4"],
  ["直方体", "直方体: 5, 3, 4"],
  ["円柱", "円柱: r=2 h=5"],
  ["円錐", "円錐: r=3 h=4"],
  ["球", "球: r=3"],
  ["角錐", "角錐: 4, 5, 4"],
  /* 第 2 弾 */
  ["ベン図（2つ）", "ベン図: 数学 30, 英語 20"],
  ["ベン図（3つ）", "ベン図: A 10, B 12, C 8"],
  ["単位円", "単位円: 60"],
  ["樹形図", "樹形図: 表,裏 / 表,裏 / 表,裏"],
  ["数直線", "数直線: -3 <= x < 2.5"],
  ["円と接線", "円と接線: r=3 d=5"],
  ["ベクトル", "ベクトル: a(3,4) b(-2,1)"],
  ["正四面体", "正四面体: 3"],
  ["正八面体", "正八面体: 3"],
  ["展開図（直方体）", "展開図: 直方体 3,4,5"],
  ["展開図（円柱）", "展開図: 円柱 r=2 h=5"],
  ["回路", "回路: 電池 - スイッチ - 抵抗 - 電球"],
  ["力の図", "力: 右 10, 下 5, 上 5"],
  /* 第 3 弾 */
  ["相似", "相似: 3, 4, 5 比 1.6"],
  ["合同", "合同: 3, 4, 5"],
  ["垂線", "垂線: (0,0) (5,0) (2,3)"],
  ["角の二等分線", "二等分線: 70"],
  ["不等式の領域", "領域: y > 2x + 1"],
  ["不等式の領域（2次）", "領域: y <= x^2 - 2"],
  ["複素数平面", "複素数: 3+4i, -2+1i"],
  ["極座標", "極座標: r = 2cos(3x)"],
  ["空間座標", "空間: (2,3,4)"],
  ["正十二面体", "正十二面体: 2"],
  ["正二十面体", "正二十面体: 2"],
  ["構造式（メタン）", "構造式: CH4"],
  ["構造式（水）", "構造式: H2O"],
  ["構造式（二酸化炭素）", "構造式: CO2"],
  ["ベンゼン環", "ベンゼン:"],
  ["並列回路", "回路: 電池 - (抵抗 | 電球) - スイッチ"],
  ["斜面", "斜面: 角=30 質量=2"],
  ["ばね", "ばね: k=20 x=0.15"],
  ["年表", "年表: 1600 関ヶ原, 1603 江戸幕府, 1868 明治維新, 1945 終戦"]
];

/* 断って ほしいもの（数が 読めない・作れない） */
const 断る = [
  ["数が 無い 円グラフ", "円グラフ: りんご みかん"],
  ["半径が 0 の 球", "球: r=0"],
  ["辺が 足りない 直方体", "直方体: 3"],
  ["読めない 関数", "関数: y = にゃーん"],
  ["名前が 1 つの ベン図", "ベン図: 数学"],
  ["段の無い 樹形図", "樹形図: "],
  ["距離が 半径より 小さい 接線", "円と接線: r=5 d=2"],
  ["成り立たない 相似", "相似: 1, 1, 5 比 2"],
  ["角度が 180 以上の 二等分線", "二等分線: 200"],
  ["知らない 構造式", "構造式: XYZ123"],
  ["年が 1 つだけの 年表", "年表: 1600 関ヶ原"]
];

(async () => {
  const server = await serve();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1000 } });
  const pg = await ctx.newPage();
  const 例外 = [];
  pg.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 200)));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html?vq2=all`,
    { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.waitForFunction(() => window.VQG && window.VQG.more && window.VQMD, { timeout: 40000 });
  await pg.evaluate(() => {
    const o = document.getElementById("firstLaunchOverlay");
    if (o) o.style.display = "none";
  });

  節("① 1 つずつ 描いて、枠から はみ出していないか 見る");
  {
    const r = await pg.evaluate((一覧) => {
      const 出 = {};
      一覧.forEach(([名, 行]) => {
        let svg = null, 理由 = "";
        try { svg = window.VQG.more.一行(行); } catch (e) { 理由 = String(e.message); }
        if (!svg) { try { svg = window.VQG.sci.一行(行); } catch (e2) { 理由 = String(e2.message); } }
        if (!svg) { 出[名] = { だめ: 理由 || window.VQG.sci.なぜだめ() || window.VQG.more.なぜだめ() || "描けない" }; return; }
        const m = /width="(\d+)" height="(\d+)"/.exec(svg);
        出[名] = { 幅: m ? +m[1] : 0, 高: m ? +m[2] : 0,
                   点検: window.VQG.more.点検(m ? +m[1] : 0, m ? +m[2] : 0,
                     svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "")) || "よし",
                   バイト: svg.length };
      });
      return 出;
    }, 図ら);
    const だめ = Object.keys(r).filter((k) => r[k].だめ);
    const 崩れ = Object.keys(r).filter((k) => r[k].点検 && r[k].点検 !== "よし");
    ok(図ら.length + " 種類 すべて 描ける（描けない " + だめ.length + " 件）",
      だめ.length === 0, だめ.map((k) => k + ": " + r[k].だめ));
    ok("枠から はみ出しているものが 無い（" + 崩れ.length + " 件）",
      崩れ.length === 0, 崩れ.map((k) => k + ": " + r[k].点検));
    ok("中身が 薄すぎるものが 無い",
      Object.keys(r).every((k) => r[k].だめ || r[k].バイト > 200),
      Object.keys(r).filter((k) => !r[k].だめ && r[k].バイト <= 200));
  }

  節("② 数が 読めないものは **描かない**（それらしい絵を 作らない）");
  {
    const r = await pg.evaluate((一覧) => {
      const 出 = {};
      一覧.forEach(([名, 行]) => {
        let svg = null;
        try { svg = window.VQG.more.一行(行); } catch (e) {}
        if (!svg) { try { svg = window.VQG.sci.一行(行); } catch (e2) {} }
        出[名] = !svg;
      });
      return 出;
    }, 断る);
    Object.keys(r).forEach((k) => ok(k + " は 描かない", r[k] === true, r[k]));
  }

  節("③ 値が 図に **そのとおり** 出ているか（目分量で 置いていない）");
  {
    const r = await pg.evaluate(() => {
      const M = window.VQG.more;
      /* 棒グラフ: 60/80/70 の 高さの比が そのとおりか */
      const bar = M.棒グラフ([{ 名: "A", 値: 60 }, { 名: "B", 値: 80 }, { 名: "C", 値: 70 }]);
      const hs = [...bar.matchAll(/<rect[^>]*height="([\d.]+)"/g)].map((m) => +m[1]);
      /* 円グラフ: 30/20/50 の 割合が 出ているか */
      const pie = M.円グラフ([{ 名: "a", 値: 30 }, { 名: "b", 値: 20 }, { 名: "c", 値: 50 }]);
      const pcts = [...pie.matchAll(/>(\d+)%</g)].map((m) => +m[1]);
      /* 球: 体積が 4/3πr^3 か */
      const s = M.球(3);
      const vol = /体積 ([\d.]+)/.exec(s);
      /* 扇形: 弧の長さが 2πr(θ/360) か */
      const f = M.扇形(3, 60);
      const arc = /弧 ([\d.]+)/.exec(f);
      return { 棒: hs, 円: pcts,
               球の体積: vol ? +vol[1] : null, 正しい球: Math.round(4 / 3 * Math.PI * 27 * 100) / 100,
               扇の弧: arc ? +arc[1] : null, 正しい弧: Math.round(2 * Math.PI * 3 / 6 * 100) / 100 };
    });
    ok("棒の高さが 60:80:70 の 比に なっている",
      r.棒.length === 3 && Math.abs(r.棒[0] / r.棒[1] - 60 / 80) < 0.02
      && Math.abs(r.棒[2] / r.棒[1] - 70 / 80) < 0.02, r.棒);
    ok("円グラフの 割合が 30/20/50 と 出る",
      r.円.indexOf(30) >= 0 && r.円.indexOf(20) >= 0 && r.円.indexOf(50) >= 0, r.円);
    ok("球の体積が 4/3πr³ と 合う（" + r.球の体積 + "）",
      Math.abs(r.球の体積 - r.正しい球) < 0.02, r);
    ok("扇形の 弧の長さが 2πr(θ/360) と 合う（" + r.扇の弧 + "）",
      Math.abs(r.扇の弧 - r.正しい弧) < 0.02, r);

    /* 第 3 弾の 値も 数で 確かめる */
    const r2 = await pg.evaluate(() => {
      const S = window.VQG.sci;
      const 垂 = S.垂線({ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 2, y: 3 });
      const H = /H\(([-\d.]+), ([-\d.]+)\)　PH = ([\d.]+)/.exec(垂);
      const ば = S.ばね(20, 0.15);
      const F = /F = kx = ([\d.]+)N ／ 位置エネルギー ([\d.]+)J/.exec(ば);
      const 斜 = S.斜面(30, 2);
      const N = /斜面方向 ([\d.]+)N ／ 垂直方向 ([\d.]+)N/.exec(斜);
      const 十 = S.正多面体2("正十二面体", 2);
      const V = /体積 ([\d.]+)/.exec(十);
      const 複 = S.複素数("3+4i");
      const Z = /\|z\| = ([\d.]+)　偏角 ([\d.]+)/.exec(複);
      return {
        垂線の足: H ? [+H[1], +H[2], +H[3]] : null,
        ばね: F ? [+F[1], +F[2]] : null,
        斜面: N ? [+N[1], +N[2]] : null,
        十二面体: V ? +V[1] : null,
        複素数: Z ? [+Z[1], +Z[2]] : null
      };
    });
    ok("垂線の足が (2,0)・PH = 3 と 出る",
      r2.垂線の足 && r2.垂線の足[0] === 2 && r2.垂線の足[1] === 0
      && Math.abs(r2.垂線の足[2] - 3) < 0.01, r2.垂線の足);
    ok("ばね F = kx = 3N・E = ½kx² = 0.225J",
      r2.ばね && Math.abs(r2.ばね[0] - 3) < 0.01 && Math.abs(r2.ばね[1] - 0.225) < 0.001, r2.ばね);
    ok("斜面 30°・2kg → 斜面方向 9.8N・垂直 16.97N",
      r2.斜面 && Math.abs(r2.斜面[0] - 9.8) < 0.05 && Math.abs(r2.斜面[1] - 16.97) < 0.05, r2.斜面);
    ok("正十二面体 a=2 の 体積 = (15+7√5)/4·a³",
      r2.十二面体 !== null
      && Math.abs(r2.十二面体 - (15 + 7 * Math.sqrt(5)) / 4 * 8) < 0.01, r2.十二面体);
    ok("複素数 3+4i → |z| = 5・偏角 53.1°",
      r2.複素数 && Math.abs(r2.複素数[0] - 5) < 0.01
      && Math.abs(r2.複素数[1] - 53.1) < 0.1, r2.複素数);
  }

  節("④ ボードに 全部 並べて、画面から はみ出さないか 見る");
  {
    const r = await pg.evaluate(async (一覧) => {
      const md = "```図形\n" + 一覧.map((x) => x[1]).join("\n") + "\n```";
      await Promise.resolve(window.__vqLive.道具("showNote", { title: "図の総なめ", markdown: md }));
      await new Promise((x) => setTimeout(x, 400));
      const d = document.getElementById("vqLiveNote");
      const b = d.getBoundingClientRect();
      const gs = Array.from(d.querySelectorAll(".vqg"));
      const はみ = gs.filter((e) => {
        const r2 = e.getBoundingClientRect();
        return r2.right > b.right + 1 || r2.left < b.left - 1;
      }).length;
      const 空 = gs.filter((e) => e.getBoundingClientRect().height < 20).length;
      return { 図の数: gs.length, はみ出し: はみ, 空: 空, 断り: d.querySelectorAll(".vqmd-geo-ng").length };
    }, 図ら);
    ok("ボードに " + 図ら.length + " 個 すべて 出る", r.図の数 === 図ら.length, r);
    ok("ボードから はみ出すものが 無い", r.はみ出し === 0, r);
    ok("つぶれているものが 無い", r.空 === 0, r);
    await pg.screenshot({ path: path.join(__dirname, "_mathout", "geo-all.png"), fullPage: true });
  }

  節("⑤ **人が ふつうに 書く 言いかた**で 描けるか（2026-08-17・実測で 足した）");
  {
    /* ★ 30 通り 試したら **18 通りが 落ちていた**。
       落ちていたのは AI が 書きそうな 形ばかりだった:
       日本語の 寸法語（半径・底辺・高さ・一辺・中心角）、単位つき（3 cm・60度・2kg）、
       和名（直角三角形・正三角形・正六角形・メタン）。
       **書き方を 覚えさせる**のでなく **こちらが 受ける**。ここで 固定する。 */
    const 言いかた = [
      "円: 半径3", "円 半径=3", "円: r = 3 cm", "球 半径3", "球: 直径6",
      "扇形: 半径3 中心角60", "扇形 r=3 θ=60",
      "三角形: 底辺4 高さ3", "直角三角形: 3,4,5", "正三角形: 4",
      "円柱: 半径2 高さ5", "円錐 半径3 高さ4", "立方体 一辺4",
      "正多角形: 正六角形 r=2", "正六角形 r=2",
      "平行四辺形 底辺5 斜辺3 角度60", "台形 上底3 下底6 高さ4",
      "棒グラフ: 国語=60, 数学=80", "円グラフ: りんご50% みかん30% ぶどう20%",
      "折れ線グラフ: 1月 10, 2月 20", "散布図 (1,2),(2,3),(3,5)",
      "ヒストグラム 0以上10未満 3", "箱ひげ 1 3 5 7 9",
      "ベン図: A と B", "単位円 60度", "数直線 -3≦x<2.5",
      "年表: 1600年 関ヶ原, 1868年 明治維新",
      "斜面 30度 2kg", "ばね k=20N/m x=0.15m", "回路 電池-抵抗-電球",
      "構造式 メタン", "複素数平面: 3+4i", "空間座標 (2,3,4)",
      "y = x^2 - 2x - 3", "関数: y = 6/x"
    ];
    const r = await pg.evaluate((一覧) => {
      const だめ = [];
      一覧.forEach((l) => {
        let g = null;
        try { g = window.VQG.more.一行(l); } catch (e) {}
        if (!g) { try { g = window.VQG.sci.一行(l); } catch (e) {} }
        if (!g) { try { const z = window.VQG.描く(l); g = (z && z.svg) ? z.svg : null; } catch (e) {} }
        if (!g) だめ.push(l);
      });
      return { だめ: だめ };
    }, 言いかた);
    ok("自然な 言いかた " + 言いかた.length + " 通りが すべて 図に なる", r.だめ.length === 0, r.だめ);
  }

  ok("画面の例外が 出ていない", 例外.length === 0, 例外.slice(0, 4));
  console.log("\n合格 " + pass + " / 失敗 " + fail);
  if (落ち.length) console.log("落ちた: " + 落ち.join(" / "));
  await browser.close();
  server.close();
  process.exit(fail ? 1 : 0);
})();
