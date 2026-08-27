#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   vqlumipic.cjs — 参考資料を **Lumi の 口から 最後まで**（2026-08-28）

   vqlumidraw.cjs は 画面の 受け口までを 見る。ここは その先、
   **本当に 外から 絵を 見つけて、取り込んで、資料に 入るか**を 通しで 見る。

     ① findPicture が 外から 見つける（Wikimedia / Openverse）
     ② **探しただけでは 何も 置かない**
     ③ usePicture が こちらの 置き場へ 写して src と credit を 返す
     ④ その src と credit を slidesWrite に 渡すと 画面に 出る
     ⑤ **出どころ（作者・決まり）が 画面から 消えない**（CC の 条件）
     ⑥ 番号を 間違えたら 何も せずに 断る

   使い方: node vqlumipic.cjs   （先に server/dev-local.sh echo 8791）
   ══════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright");

const BASE = process.env.VQ_API || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

const 根 = __dirname;
let OK = 0, NG = 0;
const ok = (n, m) => { OK++; console.log("  OK  " + n + (m ? " … " + m : "")); };
const ng = (n, m) => { NG++; console.log("  NG  " + n + (m ? " … " + m : "")); };
const 見 = (n, c, m) => (c ? ok(n, m) : ng(n, m));
const 束 = (前) => {
  const d = path.join(根, "client", "js");
  const f = fs.readdirSync(d).find((x) => new RegExp("^" + 前 + "\\.[0-9a-f]+\\.js$").test(x));
  return fs.readFileSync(path.join(d, f), "utf8");
};

async function 人を作る() {
  const nick = "pic" + Date.now().toString(36).slice(-6) + Math.floor(Math.random() * 90 + 10);
  const r = await fetch(BASE + "/api/auth/register", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gradePrefix: "H1", nickname: nick,
      password: "DevPic#2026a", tosAccepted: true, tosVersion: "1" })
  });
  const d = await r.json();
  if (!d.token) throw new Error("検証アカウントを作れません: " + JSON.stringify(d).slice(0, 160));
  return d.token;
}

(async () => {
  console.log("接続先: " + BASE);
  const 札 = await 人を作る();

  const core = 束("bundle-core"), app = 束("vq2-app"), live = 束("vq-live");
  const srv = http.createServer(async (q, s) => {
    /* ★ /api/… は 本物（dev-local）へ 渡す。
       本番では 画面も API も **同じ 出どころ**なので、
       ここを 渡さないと 絵だけが 出ない＝検査が 本物と ずれる。 */
    if (/^\/api\//.test(q.url)) {
      try {
        const r = await fetch(BASE + q.url, { headers: { Accept: "*/*" } });
        const b2 = Buffer.from(await r.arrayBuffer());
        s.writeHead(r.status, { "Content-Type": r.headers.get("content-type") || "application/octet-stream" });
        s.end(b2);
      } catch (e) { s.writeHead(502); s.end(""); }
      return;
    }
    const 実 = path.join(根, "client", decodeURIComponent(q.url.split("?")[0]));
    if (q.url !== "/" && fs.existsSync(実) && fs.statSync(実).isFile()) {
      const 型 = /\.js$/.test(実) ? "text/javascript" : /\.css$/.test(実) ? "text/css"
        : /\.woff2$/.test(実) ? "font/woff2" : "application/octet-stream";
      s.writeHead(200, { "Content-Type": 型 }); s.end(fs.readFileSync(実)); return;
    }
    s.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    s.end("<!doctype html><meta charset=utf-8><title>t</title><body>");
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const 港 = srv.address().port;
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
  const 例外 = [];
  p.on("pageerror", (e) => 例外.push(String(e).slice(0, 200)));
  await p.goto("http://127.0.0.1:" + 港 + "/");
  await p.evaluate((o) => {
    window.AUTH_API_BASE = o.base;
    try { localStorage.setItem("app.auth.token.v1", o.tok); } catch (e) {}
  }, { base: BASE, tok: 札 });
  await p.addScriptTag({ content: core });
  await p.addScriptTag({ content: app });
  await p.addScriptTag({ content: live });
  await p.waitForTimeout(300);

  console.log("\n── ①② 探す ──────────────────────────────────────────");
  const f = await p.evaluate(async () => {
    const L = window.__vqLive;
    const WP = window.VQ2.workplace;
    WP.slides.open({ item: { id: "sp1", itemType: "presentation", title: "t",
        appearance: { bannerType: "gradient", bannerValue: "#eee" } },
      content: { schemaVersion: 1, content: { theme: "minimal",
        slides: [{ id: "sl1", elements: [] }] } } });
    await new Promise((r) => setTimeout(r, 400));
    const 前 = (WP.current.session.content.content.slides[0].elements || []).length;
    const r1 = await Promise.resolve(L.道具("findPicture", { query: "photosynthesis diagram", limit: 5 }));
    const 後 = (WP.current.session.content.content.slides[0].elements || []).length;
    return { r1, 前, 後 };
  });
  見("外から 見つかる", !!(f.r1 && f.r1.見つかった数 > 0),
    JSON.stringify(f.r1).slice(0, 220));
  見("候補に 番号・決まり・作者が 付く",
    !!(f.r1 && (f.r1.候補 || []).length && f.r1.候補.every((x) => x.番号 && x.決まり)),
    JSON.stringify((f.r1 && f.r1.候補 || []).slice(0, 2)));
  見("**探しただけでは 何も 置かない**", f.前 === f.後, f.前 + " → " + f.後);
  見("次に すること を 返す", /usePicture/.test(String(f.r1 && f.r1.つぎ || "")));

  console.log("\n── ⑥ 番号ちがい ────────────────────────────────────");
  const w = await p.evaluate(async () => {
    const L = window.__vqLive;
    const WP = window.VQ2.workplace;
    const 前 = (WP.current.session.content.content.slides[0].elements || []).length;
    const r = await Promise.resolve(L.道具("usePicture", { number: 99 }));
    const 後 = (WP.current.session.content.content.slides[0].elements || []).length;
    return { r, 同じ: 前 === 後 };
  });
  見("**無い番号は 断る**", !!(w.r && w.r.だめ), JSON.stringify(w.r).slice(0, 160));
  見("断ったときは 何も 置かない", w.同じ === true);

  console.log("\n── ③④⑤ 取り込んで 置く ───────────────────────────");
  const u = await p.evaluate(async () => {
    const L = window.__vqLive;
    const WP = window.VQ2.workplace;
    const r2 = await Promise.resolve(L.道具("usePicture", { number: 1 }));
    if (!r2 || !r2.src) return { r2, 置けた: false };
    /* Lumi が するとおり、返ってきた src と credit を そのまま 渡す */
    const 置 = WP.cmd.slides.組む({ slide: 1, elements: [
      { type: "image", src: r2.src, credit: r2.credit, alt: r2.alt,
        x: 60, y: 60, w: 400, h: 300 }] });
    await new Promise((r) => setTimeout(r, 600));
    const sh = document.getElementById("vq-wp-slides").shadowRoot;
    const 画 = (sh.querySelector(".wpp-canvas") || {}).innerHTML || "";
    const es = WP.current.session.content.content.slides[0].elements || [];
    const 絵 = es.filter((e) => e.type === "image");
    /* 実際に 絵が 出るか（読み込めるか） */
    let 出た = false;
    try {
      const img = sh.querySelector(".wpp-canvas img");
      if (img) {
        for (let i = 0; i < 40 && !(img.complete && img.naturalWidth > 0); i++)
          await new Promise((r) => setTimeout(r, 100));
        出た = !!(img.complete && img.naturalWidth > 0);
      }
    } catch (e) {}
    return { r2, 置けた: !(置 && 置.だめ), 置文: JSON.stringify(置).slice(0, 200),
             credit有: 絵.some((e) => e.credit && e.credit.license),
             出どころ表示: /wp-credit/.test(画), 出た,
             credit中身: 絵[0] && 絵[0].credit };
  });
  見("**こちらの 置き場へ 写る**", /^\/api\/media\//.test(String(u.r2 && u.r2.src || "")),
    String(u.r2 && u.r2.src || JSON.stringify(u.r2)).slice(0, 160));
  見("出どころ（credit）を 返す",
    !!(u.r2 && u.r2.credit && u.r2.credit.license), JSON.stringify(u.r2 && u.r2.credit));
  見("**取り込んだだけでは まだ 置いていないと 言う**",
    /まだ 画面には 置いていません/.test(String(u.r2 && u.r2.つぎ || "")));
  見("slidesWrite に そのまま 渡すと 置ける", u.置けた === true, u.置文);
  見("**credit が model に 残る**", u.credit有 === true, JSON.stringify(u.credit中身));
  見("**出どころが 画面に 出る**", u.出どころ表示 === true);
  見("絵が 本当に 出る（読み込める）", u.出た === true);
  見("赤い字が 出ない", 例外.length === 0, 例外.slice(0, 2).join(" / "));

  await b.close(); srv.close();
  console.log("\n════════════════════════════════════════════");
  console.log("  合計 " + (OK + NG) + " 件 / 通った " + OK + " / 落ちた " + NG);
  console.log("════════════════════════════════════════════");
  process.exit(NG ? 1 : 0);
})();
