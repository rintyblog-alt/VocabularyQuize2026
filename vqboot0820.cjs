/* 起動の 一瞬を 実際の ブラウザで 測る（2026-08-20）
   訴え「強制読み込みで HTML 剥き出しの画面と 黒く塗りつぶされたアイコンが 一瞬 出る」

   本物の Chromium で client/ を出し、CSS だけ 遅らせて その瞬間を 止めて調べる。
   画素は スクショを 取り込んで 実測する（目で見ない）。
   直す前の index.before.html も 同じ手で 測り、確かに 出ていたことを 確かめる。   */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = path.join(__dirname, "client");
const BEFORE = process.env.VQ_BEFORE || "";
const 待たせる = Number(process.env.VQ_CSS_DELAY || 2000);

let 済 = 0, 落 = 0;
const 印 = [];
function ok(名, 真, 補) {
  if (真) { 済++; 印.push("  ✅ " + 名 + (補 ? "  " + 補 : "")); }
  else { 落++; 印.push("  ❌ " + 名 + (補 ? "  " + 補 : "")); }
}

const 種 = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
  ".ico": "image/x-icon", ".woff2": "font/woff2", ".m4a": "audio/mp4" };

function 立てる() {
  return new Promise((解) => {
    const s = http.createServer((req, res) => {
      let u = decodeURIComponent(String(req.url || "/").split("?")[0]);
      if (u === "/before.html" && BEFORE) {
        const b = fs.readFileSync(BEFORE);
        res.writeHead(200, { "content-type": 種[".html"] }); res.end(b); return;
      }
      if (u === "/") u = "/index.html";
      const f = path.join(ROOT, u);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        res.writeHead(404); res.end("no"); return;
      }
      res.writeHead(200, { "content-type": 種[path.extname(f)] || "application/octet-stream" });
      res.end(fs.readFileSync(f));
    });
    s.listen(0, "127.0.0.1", () => 解(s));
  });
}

/* スクショの 画素を 読む係。ブラウザ自身に 解かせる。 */
async function 画素(ctx, buf) {
  const p = await ctx.newPage();
  await p.setContent("<canvas id=c></canvas>");
  const d = await p.evaluate(async (b64) => {
    const im = new Image();
    await new Promise((r, j) => { im.onload = r; im.onerror = j; im.src = "data:image/png;base64," + b64; });
    const c = document.getElementById("c"); c.width = im.width; c.height = im.height;
    const g = c.getContext("2d"); g.drawImage(im, 0, 0);
    const a = g.getImageData(0, 0, im.width, im.height).data;
    return { w: im.width, h: im.height, a: Array.from(a) };
  }, buf.toString("base64"));
  await p.close();
  return {
    幅: d.w, 高: d.h,
    取る(x, y) { const i = ((y | 0) * d.w + (x | 0)) * 4; return [d.a[i], d.a[i + 1], d.a[i + 2]]; },
    /* とても 明るい 点の 数（＝リボンと V が 描けているか） */
    明るい数(枠) {
      let n = 0;
      for (let y = Math.max(0,枠.y | 0); y < Math.min(d.h, (枠.y + 枠.height) | 0); y++)
        for (let x = Math.max(0, 枠.x | 0); x < Math.min(d.w, (枠.x + 枠.width) | 0); x++) {
          const i = (y * d.w + x) * 4;
          if (d.a[i] > 215 && d.a[i + 1] > 210 && d.a[i + 2] > 225) n++;
        }
      return n;
    },
    /* まっ黒に 近い 点の 数（枠の中） */
    黒の数(枠) {
      let n = 0;
      for (let y = Math.max(0,枠.y | 0); y < Math.min(d.h, (枠.y + 枠.height) | 0); y++)
        for (let x = Math.max(0, 枠.x | 0); x < Math.min(d.w, (枠.x + 枠.width) | 0); x++) {
          const i = (y * d.w + x) * 4;
          if (d.a[i] < 40 && d.a[i + 1] < 40 && d.a[i + 2] < 40 && d.a[i + 3] > 200) n++;
        }
      return n;
    },
  };
}

/* 対照。CSS を 遅らせずに 読んだとき、もともと 隠れている 物を 数える。
   （#vqna-early の 決まりや、design 上 visibility:hidden の 物が いる） */
async function もとから(ctx, url) {
  const p = await ctx.newPage();
  await p.route("**/*", (route) => {
    const u = route.request().url();
    if (/\/js\/|\/js-src\/|\.js(\?|$)/.test(u)) { route.abort(); return; }
    route.continue();
  });
  p.on("pageerror", () => {});
  await p.goto(url, { waitUntil: "load" }).catch(() => {});
  await p.waitForTimeout(500);
  const r = await p.evaluate(() => Array.from(document.body.children)
    .filter((el) => getComputedStyle(el).visibility === "hidden" && el.id !== "authBootSplash")
    .map((el) => el.id || el.tagName).sort());
  await p.close();
  return r;
}

async function 測る(ctx, url, 名) {
  const p = await ctx.newPage();
  await p.route("**/*", (route) => {
    const u = route.request().url();
    /* アイコンの書体だけは 遅らせない。あれは わざと 先に 当てている（読み込みを 止める）ので、
       遅らせると 本文の 組み立て自体が 止まり、測りたい 瞬間が 作れない。 */
    if (/\/css\//.test(u) && !/material-symbols/.test(u)) { setTimeout(() => route.continue(), 待たせる); return; }
    if (/\/js\/|\/js-src\/|\.js(\?|$)/.test(u)) { route.abort(); return; }
    route.continue();
  });
  p.on("pageerror", () => {});
  p.goto(url, { waitUntil: "commit" }).catch(() => {});
  await p.waitForSelector("#authBootSplash", { state: "attached", timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(300);           /* CSS は まだ 届いていない 時点 */

  const 状 = await p.evaluate(() => {
    const 見え = (el) => getComputedStyle(el).visibility;
    const 出 = (el) => getComputedStyle(el).display;
    const sp = document.getElementById("authBootSplash");
    const 直下 = Array.from(document.body.children);
    const 漏れ = 直下.filter((el) => el.id !== "authBootSplash"
      && 見え(el) !== "hidden" && 出(el) !== "none"
      && el.getBoundingClientRect().height > 4);
    const r = sp && sp.querySelector(".vqload-ring");
    const v = sp && sp.querySelector(".vqload-v");
    const t = sp && sp.querySelector(".vqload-tail");
    const sh = sp && sp.querySelector(".vqload-sheen");
    const ob = sp && sp.querySelector(".vqload-orbit");
    const mk = sp && sp.querySelector(".vqload-svg");
    return {
      札: document.documentElement.classList.contains("vq-css-wait"),
      CSS来た: !!Array.from(document.styleSheets).find((s) => /vq-ds/.test(s.href || "")),
      splash見え: sp ? 見え(sp) : "無",
      splash出: sp ? 出(sp) : "無",
      漏れ: 漏れ.map((e) => (e.id || e.tagName) + ":" + Math.round(e.getBoundingClientRect().height)),
      輪fill: r ? getComputedStyle(r).fill : "無",
      輪stroke: r ? getComputedStyle(r).stroke : "無",
      Vfill: v ? getComputedStyle(v).fill : "無",
      尾fill: t ? getComputedStyle(t).fill : "無",
      光沢: sh ? getComputedStyle(sh).display : "無",
      粒: ob ? getComputedStyle(ob).display : "無",
      枠: mk ? (() => { const b = mk.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; })() : null,
    };
  });

  const shot = await p.screenshot();
  const 図 = await 画素(ctx, shot);
  const 黒 = 状.枠 ? 図.黒の数(状.枠) : -1;
  const 明 = 状.枠 ? 図.明るい数({ x: 状.枠.x + 状.枠.width * .12, y: 状.枠.y + 状.枠.height * .12, width: 状.枠.width * .76, height: 状.枠.height * .76 }) : -1;
  const 全黒 = 図.黒の数({ x: 0, y: 0, width: 図.幅, height: 図.高 });

  /* CSS が 届いたあと */
  await p.waitForTimeout(待たせる + 900);
  const 後 = await p.evaluate(() => {
    const sp = document.getElementById("authBootSplash");
    const r = sp && sp.querySelector(".vqload-ring");
    const 直下 = Array.from(document.body.children)
      .filter((el) => getComputedStyle(el).visibility === "hidden" && el.id !== "authBootSplash")
      .map((el) => (el.id || el.tagName));
    return {
      札: document.documentElement.classList.contains("vq-css-wait"),
      CSS来た: !!Array.from(document.styleSheets).find((s) => /vq-ds/.test(s.href || "")),
      輪stroke: r ? getComputedStyle(r).stroke : "無",
      輪fill: r ? getComputedStyle(r).fill : "無",
      隠れ残り: 直下,
    };
  });
  await p.close();
  return { 名, 状, 黒, 明, 全黒, 後 };
}

(async () => {
  const s = await 立てる();
  const port = s.address().port;
  const base = "http://127.0.0.1:" + port;
  if (!/127\.0\.0\.1|localhost|-dev\./.test(base)) { console.error("本番では実行しません。"); process.exit(2); }
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 });

  const 元 = await もとから(ctx, base + "/index.html");
  const 今 = await 測る(ctx, base + "/index.html", "いま");

  console.log("── CSS が 届く前（" + 待たせる + "ms 遅らせた）─────────────");
  console.log("   " + JSON.stringify(今.状, null, 0).slice(0, 600));
  console.log("   マークの中の まっ黒な点 = " + 今.黒 + " / 明るい点 = " + 今.明 + " / 画面全部の黒 = " + 今.全黒);

  ok("① 見せない札が 付いている", 今.状.札 === true);
  ok("② その時点で 外の CSS は まだ 届いていない", 今.状.CSS来た === false);
  ok("③ 起動の 1 枚は 見えている", 今.状.splash見え === "visible" && 今.状.splash出 === "flex", 今.状.splash見え + "/" + 今.状.splash出);
  ok("④ body 直下に 素のまま 出ている物が 無い", 今.状.漏れ.length === 0, JSON.stringify(今.状.漏れ));
  ok("⑤ 輪が 黒く 塗られていない（fill:none）", 今.状.輪fill === "none", 今.状.輪fill);
  ok("⑥ 輪の 線が リボンの 塗り", /vqlRibbon/.test(今.状.輪stroke), 今.状.輪stroke);
  ok("⑦ V が 黒く 塗られていない（fill:none）", 今.状.Vfill === "none", 今.状.Vfill);
  ok("⑧ 尾が マークの 塗り", /vqlMark/.test(今.状.尾fill), 今.状.尾fill);
  ok("⑨ 光沢は 描かない", 今.状.光沢 === "none", 今.状.光沢);
  ok("⑩ 粒は 描かない", 今.状.粒 === "none", 今.状.粒);
  ok("⑪ マークの中に まっ黒な点が 無い", 今.黒 === 0, "点=" + 今.黒);
  ok("⑫ 画面全部にも まっ黒な塊が 無い", 今.全黒 < 50, "点=" + 今.全黒);
  ok("⑫b マークの 輪と V が ちゃんと 描けている", 今.明 > 300, "明るい点=" + 今.明);

  console.log("── CSS が 届いたあと ────────────────────────────────");
  console.log("   " + JSON.stringify(今.後));
  ok("⑬ 札が 外れている", 今.後.札 === false);
  ok("⑭ 外の CSS が 当たっている", 今.後.CSS来た === true);
  /* もとから 隠れている物（#vqna-early の 決まり など）より 増えていなければ よい。
     あちらは 9 秒で 自分から 外れるので、数が 減ることは ある。 */
  ok("⑮ 隠したものが 元に 戻っている（もとから の 範囲に 収まる）",
     今.後.隠れ残り.every((k) => 元.indexOf(k) >= 0),
     JSON.stringify(今.後.隠れ残り.slice().sort()) + " / もとから " + JSON.stringify(元));
  ok("⑯ 届いたあとの 見た目は 属性に 邪魔されていない", 今.後.輪fill === "none" && /vqlRibbon/.test(今.後.輪stroke), 今.後.輪fill + " / " + 今.後.輪stroke);

  if (BEFORE) {
    const 前 = await 測る(ctx, base + "/before.html", "直す前");
    console.log("── 直す前（同じ測りかた）───────────────────────────");
    console.log("   マークの中の まっ黒な点 = " + 前.黒 + " / 画面全部 = " + 前.全黒 + " / 漏れ " + 前.状.漏れ.length + " 個");
    ok("⑰ 直す前は 素の画面が 出ていた", 前.状.漏れ.length > 0, 前.状.漏れ.slice(0, 4).join(" "));
    ok("⑱ 直す前は マークが 黒く 塗られていた", 前.黒 > 100, "点=" + 前.黒);
  }

  await b.close(); s.close();
  console.log(印.join("\n"));
  console.log("\n" + (落 === 0 ? "通った" : "落ちた") + "  " + 済 + "/" + (済 + 落));
  process.exit(落 === 0 ? 0 : 1);
})();
