#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   vqlumidraw.cjs — Lumi が **自分の手で 図を 置けるか**（2026-08-28）

   訴え（実測・screenshot）:
     「スライドで 図（SVG）を 開いて、AI に 描いてもらって」
       → Lumi:「スライド『光合成の流れ図』を 作成して、流れを 文字で 入れました。
                 **図の生成はできませんでした。**」

   真因:
     図も 参考資料も **画面の 窓しか 入口が 無かった**。
     窓は 影の DOM の 中で、lookScreen → tapItem からは ほぼ 当たらない。
     ＝ 道具が 無いのに 頼まれていた。断るのが 正しい 動きだった。

   ここで 見ること:
     ① slidesWrite に type:"svg" で **直に 置ける**
     ② 「図」「flowchart」などの 言いかたでも 通る（言い換え）
     ③ 危ない SVG は **置かずに 断る**（黙って 空の 箱を 残さない）
     ④ docsWrite にも 同じ 口が ある／保存で 消えない
     ⑤ 出どころ（credit）を 渡すと **落とさず** 連れて行く
     ⑥ 宣言（worker.js）に svg / findPicture / usePicture が ある
     ⑦ vq-live に findPicture / usePicture の 実体と 呼び分けが ある
     ⑧ できること() が **窓を 押しに 行けと 言わない**
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
/* 説明の コメントを 外してから 探す（自分の 書いた 説明に 当たらないため） */
const 素 = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const よいSVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 120">'
  + '<rect x="4" y="30" width="80" height="50" rx="8" fill="#756DB3"/>'
  + '<text x="44" y="60" fill="#fff" font-size="14" text-anchor="middle">水</text>'
  + '<line x1="88" y1="55" x2="118" y2="55" stroke="#333" stroke-width="3"/>'
  + '<text x="150" y="60" font-size="14">光合成</text></svg>';
const 危ないSVG = '<svg viewBox="0 0 10 10" onload="alert(1)">'
  + '<script>alert(1)<\/script><rect width="10" height="10" onclick="alert(1)"/>'
  + '<image href="https://evil.example.test/a.png"/></svg>';
const フェンス付き = "```svg\n" + よいSVG + "\n```";

(async () => {
  /* ══ ⑥⑦⑧ 中身を 読むだけで 分かること（画面より 先に）══════════ */
  console.log("── ⑥ 宣言（worker.js）────────────────────────────────");
  {
    const w = fs.readFileSync(path.join(根, "server", "src", "worker.js"), "utf8");
    const 素w = 素(w);
    見("slidesWrite の 種類に \"svg\" が ある",
      /type: S\("種類", \[[^\]]*"svg"/.test(素w));
    見("slidesWrite に svg の 引数が ある", /svg: S\("svg のとき/.test(素w));
    見("docsWrite に svg の 引数が ある",
      素w.split('fn("docsWrite"')[1] ? /svg: S\("svg のとき/.test(素w.split('fn("docsWrite"')[1].slice(0, 4000)) : false);
    見("findPicture が 宣言されている", /fn\("findPicture"/.test(素w));
    見("usePicture が 宣言されている", /fn\("usePicture"/.test(素w));
    見("**「画像は 声からは入れられません」を もう 言わない**",
      !/画像は 声からは入れられません/.test(素w),
      (素w.match(/画像は 声からは入れられません/g) || []).length + " か所");
    /* 宣言が 本当に 作れるか（形が 壊れていないか） */
    let 数 = 0, 作れた = false;
    try {
      const m = /functionDeclarations: \[/.exec(w);
      作れた = !!m;
      /* 実際の 個数は vqtooldecl.cjs が 見る。ここは 名前が 入ったかだけ */
      数 = (w.match(/\n      fn\("/g) || []).length;
    } catch (e) {}
    見("宣言の 並びが 読める", 作れた, "fn( の 数 " + 数);
  }

  console.log("── ⑦ 実体と 呼び分け（vq-live）───────────────────────");
  {
    const src = fs.readFileSync(
      path.join(根, "js-src", fs.readdirSync(path.join(根, "js-src")).find((x) => /^vq-live\./.test(x))), "utf8");
    const 素s = 素(src);
    見("findPicture の 実体が ある", /function findPicture\(/.test(素s));
    見("usePicture の 実体が ある", /function usePicture\(/.test(素s));
    見("findPicture を 呼び分けている", /name === "findPicture"/.test(素s));
    見("usePicture を 呼び分けている", /name === "usePicture"/.test(素s));
    見("**探しただけでは 置いていないと 言う**", /まだ 何も 置いていません/.test(素s));
    見("**credit を 落とすなと 言う**", /credit を 落とさないこと/.test(素s));
    見("外へ 出かける 道具として 締め切りが 長い",
      /長くかかる道具 = \{ findPicture: 1, usePicture: 1/.test(素s));
    /* 出来上がり（client/js）にも 入っているか。圧縮で 日本語は \uXXXX に なるので
       ここは **英字の 名前**だけで 見る。 */
    const 出 = 束("vq-live");
    見("出来上がりにも findPicture が 入っている", 出.indexOf("findPicture") >= 0);
    見("出来上がりにも usePicture が 入っている", 出.indexOf("usePicture") >= 0);
  }

  /* ══ ①〜⑤ 本物を 動かす ═══════════════════════════════════════ */
  const core = 束("bundle-core"), app = 束("vq2-app");
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
  async function 頁() {
    const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
    const 例外 = [];
    p.on("pageerror", (e) => 例外.push(String(e).slice(0, 200)));
    await p.goto("http://127.0.0.1:" + 港 + "/");
    await p.addScriptTag({ content: core });
    await p.addScriptTag({ content: app });
    await p.waitForTimeout(200);
    return { p, 例外 };
  }

  console.log("── ①②③ Slides を Lumi の 口から ─────────────────────");
  {
    const { p, 例外 } = await 頁();
    const r = await p.evaluate(async (o) => {
      const WP = window.VQ2.workplace;
      const 待 = (ms) => new Promise((r2) => setTimeout(r2, ms));
      window.__やられた = 0; window.alert = function () { window.__やられた++; };
      WP.slides.open({ item: { id: "s1", itemType: "presentation", title: "t",
          appearance: { bannerType: "gradient", bannerValue: "#eee" } },
        content: { schemaVersion: 1, content: { theme: "minimal",
          slides: [{ id: "sl1", elements: [] }] } } });
      await 待(400);
      const K = WP.cmd;
      const 良 = K.slides.組む({ slide: 1, elements: [
        { type: "svg", svg: o.よい, x: 60, y: 60, w: 400, h: 160 }] });
      await 待(200);
      /* 言い換え: 「図」「flowchart」でも 通るか */
      const 別 = K.slides.組む({ slide: 1, elements: [
        { type: "図", svg: o.フェンス, x: 60, y: 260, w: 300, h: 120 },
        { type: "flowchart", svg: o.よい, x: 480, y: 260, w: 300, h: 120 }] });
      await 待(200);
      /* 危ないもの */
      const 悪 = K.slides.組む({ slide: 1, elements: [
        { type: "svg", svg: "<p>これは svg じゃない</p>", x: 10, y: 10, w: 100, h: 100 }] });
      const 危 = K.slides.組む({ slide: 1, elements: [
        { type: "svg", svg: o.危ない, x: 700, y: 60, w: 200, h: 120 }] });
      await 待(300);
      const 本 = WP.current.session.content.content;
      const es = (本.slides[0].elements || []);
      const sh = document.getElementById("vq-wp-slides").shadowRoot;
      const 画 = (sh.querySelector(".wpp-canvas") || {}).innerHTML || "";
      try { const rc = sh.querySelector(".wpp-canvas rect"); if (rc) rc.dispatchEvent(new MouseEvent("click", { bubbles: true })); } catch (e) {}
      return {
        良: 良 && !良.だめ, 良文: JSON.stringify(良).slice(0, 200),
        別: 別 && !別.だめ,
        悪だめ: !!(悪 && 悪.だめ), 悪文: (悪 && 悪.だめ) || "",
        危あり: !!(危 && !危.だめ),
        種: es.map((e) => e.type),
        svg持ち: es.filter((e) => e.type === "svg" && e.svg).length,
        画のsvg: (画.match(/<svg/g) || []).length,
        危険: /evil\.example|onload=|onclick=|<script/i.test(画),
        やられた: window.__やられた
      };
    }, { よい: よいSVG, 危ない: 危ないSVG, フェンス: フェンス付き });
    見("**Lumi が type:\"svg\" で 図を 置ける**", r.良 === true, r.良文);
    見("「図」「flowchart」の 言いかたでも 通る", r.別 === true);
    見("置いた 図が model に 残る", r.svg持ち >= 3, "svg 持ち " + r.svg持ち + " / " + JSON.stringify(r.種));
    見("画面にも 図が 出る", r.画のsvg >= 3, r.画のsvg + " 個");
    見("**SVG でないものは 断る**", r.悪だめ === true, r.悪文.slice(0, 80));
    見("危ない SVG も 清めて 通す（形は 残る）", r.危あり === true);
    見("**危ないものが 残らない**", r.危険 !== true);
    見("**押しても 何も 起きない**", r.やられた === 0, "動いた回数 " + r.やられた);
    見("赤い字が 出ない", 例外.length === 0, 例外.slice(0, 2).join(" / "));
    await p.close();
  }

  console.log("── ④⑤ Docs を Lumi の 口から ────────────────────────");
  {
    const { p, 例外 } = await 頁();
    const r = await p.evaluate(async (o) => {
      const WP = window.VQ2.workplace;
      const 待 = (ms) => new Promise((r2) => setTimeout(r2, ms));
      WP.docs.open({ item: { id: "d1", itemType: "document", title: "t",
          appearance: { bannerType: "gradient", bannerValue: "#eee" } },
        content: { schemaVersion: 1, content: {
          blocks: [{ id: "b1", type: "paragraph", text: "はじめ" }],
          page: WP.paper.defaults() } } });
      await 待(400);
      const K = WP.cmd;
      const credit = { author: "だれか", license: "CC BY-SA 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
        page: "https://commons.wikimedia.org/wiki/File:X", source: "Wikimedia Commons" };
      const 良 = K.docs.まとめて({ blocks: [
        { type: "heading1", text: "光合成" },
        { type: "svg", svg: o.よい, caption: "流れ" },
        { type: "図", svg: o.フェンス },
        { type: "image", src: "/api/media/img/x.png", credit: credit, caption: "借りた絵" }] });
      await 待(300);
      /* 中身の 無い 図は **空の 箱を 残さない** */
      const 空 = K.docs.まとめて({ blocks: [{ type: "svg", svg: "" }] });
      await 待(200);
      const 本 = WP.current.session.content.content;
      const bs = 本.blocks || [];
      const sh = document.getElementById("vq-wp-docs").shadowRoot;
      const 画 = (sh.querySelector(".wpd-doc") || sh).innerHTML || "";
      /* 保存を 走らせて 消えないか */
      let 後 = [];
      try {
        const el = sh.querySelector('.wpd-doc [contenteditable="true"]');
        if (el) el.dispatchEvent(new Event("input", { bubbles: true }));
        await 待(700);
        後 = (WP.current.session.content.content.blocks || [])
          .map((x) => x.type + (x.svg ? "(図あり)" : "") + (x.credit ? "(出どころあり)" : ""));
      } catch (e) { 後 = ["読めず"]; }
      return {
        良: 良 && !良.だめ, 良文: JSON.stringify(良).slice(0, 200),
        空だめ: !!(空 && 空.だめ),
        svg数: bs.filter((x) => x.type === "svg" && x.svg).length,
        空箱: bs.filter((x) => x.type === "svg" && !x.svg).length,
        credit有: bs.some((x) => x.type === "image" && x.credit),
        画のsvg: (画.match(/<svg/g) || []).length,
        出どころ: /wp-credit/.test(画),
        後
      };
    }, { よい: よいSVG, フェンス: フェンス付き });
    見("**Lumi が docsWrite で 図を 置ける**", r.良 === true, r.良文);
    見("「図」の 言いかたも 通る（image へ 逃げない）", r.svg数 >= 2, "svg " + r.svg数 + " 個");
    見("**中身の 無い 図は 断る**", r.空だめ === true);
    見("**空の 箱を 残さない**", r.空箱 === 0, "空箱 " + r.空箱 + " 個");
    見("画面にも 図が 出る", r.画のsvg >= 2, r.画のsvg + " 個");
    見("**出どころ（credit）を 落とさない**", r.credit有 === true);
    見("出どころが 画面に 出る", r.出どころ === true);
    見("**保存しても 図と 出どころが 消えない**",
      r.後.some((x) => /^svg\(図あり\)/.test(x)) && r.後.some((x) => /出どころあり/.test(x)),
      JSON.stringify(r.後));
    見("赤い字が 出ない", 例外.length === 0, 例外.slice(0, 2).join(" / "));
    await p.close();
  }

  console.log("── ⑧ できること() が 何と 言うか ────────────────────");
  {
    const { p, 例外 } = await 頁();
    const r = await p.evaluate(async () => {
      const WP = window.VQ2.workplace;
      const 待 = (ms) => new Promise((r2) => setTimeout(r2, ms));
      WP.slides.open({ item: { id: "s9", itemType: "presentation", title: "t",
          appearance: { bannerType: "gradient", bannerValue: "#eee" } },
        content: { schemaVersion: 1, content: { theme: "minimal", slides: [{ id: "x", elements: [] }] } } });
      await 待(300);
      const c = WP.cmd.できること();
      return { 文: JSON.stringify(c["絵について"] || ""),
               部品: JSON.stringify(c["Slides の部品"] || []),
               かたまり: JSON.stringify(c["Docs のかたまり"] || []) };
    });
    見("**「窓を 押しに 行け」と 言わない**", !/lookScreen|tapItem|typeInto/.test(r.文), r.文.slice(0, 120));
    見("type:\"svg\" を 案内する", /svg/.test(r.文));
    見("findPicture → usePicture を 案内する",
      /findPicture/.test(r.文) && /usePicture/.test(r.文));
    見("credit を 落とすなと 言う", /credit/.test(r.文));
    見("Slides の部品に svg が 出る", /"svg"/.test(r.部品), r.部品.slice(0, 200));
    見("Docs のかたまりに svg が 出る", /"svg"/.test(r.かたまり), r.かたまり.slice(0, 220));
    見("赤い字が 出ない", 例外.length === 0, 例外.slice(0, 2).join(" / "));
    await p.close();
  }

  await b.close(); srv.close();
  console.log("\n════════════════════════════════════════════");
  console.log("  合計 " + (OK + NG) + " 件 / 通った " + OK + " / 落ちた " + NG);
  console.log("════════════════════════════════════════════");
  process.exit(NG ? 1 : 0);
})();
