#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   vqlumideck.cjs — deck（3 枚以上の 資料）に **図が 入るか**（2026-08-28）

   なぜ 要るか:
     道具の 説明に「3 枚以上の 資料は **必ず** deck* を使う」と 書いてある。
     つまり 利用者が 実際に 頼む プレゼンは ほぼ 全部 この道を 通る。
     slidesWrite に 図を 通しただけでは、**本番の道には 図が 無い**。

   ここで 見ること:
     ① deckWrite の どの枠でも svg を 渡すと 図に なる
     ② 図は **清められて** から 入る（deck は slidesWrite を 通らない）
     ③ 借りた絵（src + credit）も 入り、出どころが 消えない
     ④ 外の 住所を そのまま 貼らせない（中継に されない）
     ⑤ 通らなかった 図は **黙らずに 返す**
     ⑥ 図の 枠が 「空のスロット」に ならない（関門を 通る）
   ══════════════════════════════════════════════════════════════════════ */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright");

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

const よいSVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 120">'
  + '<rect x="4" y="30" width="80" height="50" rx="8" fill="#756DB3"/>'
  + '<text x="44" y="60" fill="#fff" font-size="14" text-anchor="middle">水</text>'
  + '<line x1="88" y1="55" x2="118" y2="55" stroke="#333" stroke-width="3"/></svg>';
const 危ないSVG = '<svg viewBox="0 0 10 10" onload="alert(1)">'
  + '<script>alert(1)<\/script><rect width="10" height="10" onclick="alert(1)"/>'
  + '<image href="https://evil.example.test/a.png"/></svg>';

(async () => {
  const core = 束("bundle-core"), app = 束("vq2-app"), live = 束("vq-live");
  const srv = http.createServer((q, s) => {
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
  await p.addScriptTag({ content: core });
  await p.addScriptTag({ content: app });
  await p.addScriptTag({ content: live });
  await p.waitForTimeout(300);

  const r = await p.evaluate(async (o) => {
    const L = window.__vqLive, WP = window.VQ2.workplace;
    const 待 = (ms) => new Promise((r2) => setTimeout(r2, ms));
    window.__やられた = 0; window.alert = function () { window.__やられた++; };
    WP.slides.open({ item: { id: "dk1", itemType: "presentation", title: "光合成",
        appearance: { bannerType: "gradient", bannerValue: "#eee" } },
      content: { schemaVersion: 1, content: { theme: "minimal",
        slides: [{ id: "sl1", elements: [] }] } } });
    await 待(400);

    const 始 = await Promise.resolve(L.道具("deckStart",
      { title: "光合成のしくみ", pageCount: 4, audience: "高校生",
        purpose: "しくみを 伝える", lang: "ja" }));
    const 設 = await Promise.resolve(L.道具("deckDesign", {}));
    /* どの枠に 何を 書けばよいか、画面が 返している */
    const 枠 = (設 && 設.書くところ) || (始 && 始.書くところ) || [];
    window.__debug = { 始: JSON.stringify(始).slice(0, 500), 設: JSON.stringify(設).slice(0, 500) };
    /* 2 枚目の 1 番目の枠へ 図、3 枚目の 1 番目の枠へ 借りた絵、
       4 枚目へ 通らない 住所 を 入れてみる。他の枠は 文で 埋める。 */
    const credit = { author: "だれか", license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
      page: "https://commons.wikimedia.org/wiki/File:X", source: "Wikimedia Commons" };
    const 頁 = [];
    (枠 || []).forEach(function (P, pi) {
      const slots = (P.スロット || []).map(function (s, si) {
        const base = { slotIndex: s.slotIndex };
        if (pi === 1 && si === 0) return Object.assign(base, { svg: o.よい, caption: "光合成の流れ" });
        if (pi === 2 && si === 0) return Object.assign(base, { src: "/api/media/img/x.png", credit: credit });
        if (pi === 3 && si === 0) return Object.assign(base, { src: "https://evil.example.test/a.png" });
        if (s.role === "bullets" || s.role === "diagram")
          return Object.assign(base, { items: ["ひとつ", "ふたつ", "みっつ"] });
        if (s.role === "table") return Object.assign(base, { rows: [["項目", "値"], ["光", "強い"]] });
        if (s.role === "chart") return Object.assign(base, { chart: { type: "bar", labels: ["朝", "昼"], series: [{ name: "量", values: [3, 8] }] } });
        if (s.role === "metric") return Object.assign(base, { value: "92%", caption: "取り込み" });
        if (s.role === "quote") return Object.assign(base, { text: "光は 力なり", caption: "だれか" });
        if (s.role === "compare" || s.role === "steps" || s.role === "kpi" || s.role === "timeline")
          return Object.assign(base, { cells: [{ title: "あ", text: "いち", value: "1" }, { title: "い", text: "に", value: "2" }] });
        return Object.assign(base, { text: "光合成の話" });
      });
      頁.push({ page: P.page, slots: slots });
    });
    /* 危ない SVG も 別枠で 試す（清められて 入るはず） */
    if (頁[1] && 頁[1].slots[1]) 頁[1].slots[1] = { slotIndex: 頁[1].slots[1].slotIndex, svg: o.危ない };

    const 書 = await Promise.resolve(L.道具("deckWrite", { pages: 頁 }));
    await 待(700);
    const 本 = WP.current.session.content.content;
    const 全 = (本.slides || []).reduce((a2, s) => a2.concat(s.elements || []), []);
    const sh = document.getElementById("vq-wp-slides").shadowRoot;
    /* ★ 画布は **いま見ている 1 枚**しか 描かない。図を 置いたのは 2 枚目なので、
       そこへ 移ってから 見る（1 枚目を 見て「出ない」と 言うのは 検査の 誤り）。 */
    const 一覧 = sh.querySelector(".wpp-thumbs");
    const 札 = 一覧 ? [...一覧.children] : [];
    if (札[1]) { 札[1].click(); await 待(600); }
    const 画 = (sh.querySelector(".wpp-canvas") || {}).innerHTML || "";
    /* 図の 入った ページの 関門（空のスロット）を 見る */
    const 見直 = WP.cmd.slides.見直す({ slide: 2 });
    return {
      枠数: (枠 || []).length,
      枠に図の案内: JSON.stringify(((枠[0] || {}).スロット || [])[0] || {}).indexOf("図でもよい") >= 0,
      書: JSON.stringify(書).slice(0, 400),
      svg数: 全.filter((e) => e.type === "svg" && e.svg).length,
      image数: 全.filter((e) => e.type === "image" && e.src).length,
      credit有: 全.some((e) => e.type === "image" && e.credit && e.credit.license),
      危険: 全.some((e) => e.type === "svg" && /evil\.example|onload=|onclick=|<script/i.test(String(e.svg || ""))),
      外の住所: 全.some((e) => e.type === "image" && /^https?:/.test(String(e.src || ""))),
      置けなかった図: (書 && 書.置けなかった図) || null,
      見直: 見直 && 見直.見つかった数,
      画のsvg: (画.match(/<svg/g) || []).length,
      やられた: window.__やられた,
      デバグ: window.__debug,
      画長: 画.length,
      枚ごと: (本.slides || []).map((sl, i) => (i + 1) + ":" + (sl.elements || []).map((e) => e.type).join(",")),
      画の頭: 画.slice(0, 400)
    };
  }, { よい: よいSVG, 危ない: 危ないSVG });

  console.log("── deck に 図 ────────────────────────────────────────");
  見("書くところが 返る", r.枠数 >= 4, r.枠数 + " 枚ぶん");
  見("**枠ごとに「図でもよい」と 案内する**", r.枠に図の案内 === true);
  見("**svg が deck に 入る**", r.svg数 >= 1, "svg " + r.svg数 + " 個 / " + r.書.slice(0, 160));
  見("借りた絵（src）も 入る", r.image数 >= 1, "image " + r.image数 + " 個");
  見("**出どころ（credit）が 消えない**", r.credit有 === true);
  見("**清められてから 入る（危ないものが 残らない）**", r.危険 !== true);
  見("**外の 住所は そのまま 貼らせない**", r.外の住所 !== true);
  見("**通らなかった 図は 黙らずに 返す**",
    Array.isArray(r.置けなかった図) && r.置けなかった図.length >= 1,
    JSON.stringify(r.置けなかった図));
  見("画面にも 図が 出る", r.画のsvg >= 1, r.画のsvg + " 個");
  見("図の 枠が「空」に ならない", (r.見直 || 0) === 0, "崩れ " + r.見直 + " 件");
  見("**押しても 何も 起きない**", r.やられた === 0, "動いた回数 " + r.やられた);
  見("赤い字が 出ない", 例外.length === 0, 例外.slice(0, 2).join(" / "));
  if (NG) {
    console.log("\n（手がかり）画布 " + r.画長 + " 字 / 枚ごと " + JSON.stringify(r.枚ごと));
    console.log("（画布の頭）" + String(r.画の頭 || "").slice(0, 300));
  }

  await b.close(); srv.close();
  console.log("\n════════════════════════════════════════════");
  console.log("  合計 " + (OK + NG) + " 件 / 通った " + OK + " / 落ちた " + NG);
  console.log("════════════════════════════════════════════");
  process.exit(NG ? 1 : 0);
})();
