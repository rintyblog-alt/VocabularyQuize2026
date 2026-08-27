#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   vqwpsvg.cjs — 図（SVG）と 参考資料が **画面に 入るか**（2026-08-28）

   訴え:
     「生成時に、スライドに 新たに 参考資料（フリーのものを ネットから
       持ってきたり）、SVG で 精密に 素早く 正確に 描写したり…
       これは プレゼンだけじゃないからな？ 他の 3 つも そう」

   ここで 見ること（本物の 出来上がりを Chromium で 動かす）:
     ① Slides の 道具に「図（SVG）」と「参考資料」が 出る
     ② 図を 入れると **清められた もの**が 出る（危ないものは 残らない）
     ③ Docs の 挿入にも 両方 出る／入れると 出る
     ④ 参考資料は **出どころが 必ず 付く**（CC の 決まり）
     ⑤ 保存して 開き直しても **図が 消えない**（figure の 取り違え）
     ⑥ 紙（PDF）にも 図と 出どころが 乗る
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

const 危ないSVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60" onload="alert(1)">'
  + '<script>alert(1)<\/script>'
  + '<rect width="100" height="60" fill="#756DB3" onclick="alert(1)"/>'
  + '<image href="https://evil.example.test/a.png"/>'
  + '<text x="10" y="35" fill="#fff">図</text></svg>';

(async () => {
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
  const 皮 = (t) => ({ id: "i" + t, itemType: t, title: "検査",
    appearance: { bannerType: "gradient", bannerValue: "#eee" } });

  /* ══ ① ② Slides ═════════════════════════════════════════════════ */
  console.log("── ①② Slides に 図（SVG）─────────────────────────────");
  {
    const { p, 例外 } = await 頁();
    const r = await p.evaluate(async (危) => {
      const WP = window.VQ2.workplace;
      const 待 = (ms) => new Promise((r2) => setTimeout(r2, ms));
      window.__やられた = 0;
      window.alert = function () { window.__やられた++; };
      WP.slides.open({ item: { id: "s1", itemType: "presentation", title: "t",
          appearance: { bannerType: "gradient", bannerValue: "#eee" } },
        content: { schemaVersion: 1, content: { theme: "minimal",
          slides: [{ id: "sl1", elements: [] }] } } });
      await 待(400);
      const sh = document.getElementById("vq-wp-slides").shadowRoot;
      const 道具 = [...sh.querySelectorAll("button")].map((x) => (x.getAttribute("aria-label") || x.textContent || "").trim());
      /* 図（SVG）の 窓を 開いて、危ない SVG を 入れてみる */
      const 図b = [...sh.querySelectorAll("button")].find((x) => /図（SVG）/.test(x.textContent || x.getAttribute("aria-label") || ""));
      let 入った = false, 中 = "";
      if (図b) {
        図b.click(); await 待(250);
        const ta = sh.querySelector('[data-k="svg"]');
        if (ta) {
          ta.value = 危;
          ta.dispatchEvent(new Event("input", { bubbles: true }));
          const okb = [...sh.querySelectorAll("button")].find((x) => /入れる/.test(x.textContent || ""));
          if (okb) { okb.click(); 入った = true; await 待(400); }
        }
        中 = (sh.querySelector(".wpp-canvas") || {}).innerHTML || "";
      }
      /* 押しても 何も 起きないこと */
      try { const rc = sh.querySelector(".wpp-canvas rect"); if (rc) rc.dispatchEvent(new MouseEvent("click", { bubbles: true })); } catch (e) {}
      return { 道具, 入った, svgの数: (中.match(/<svg/g) || []).length,
               危険: /evil\.example|onload=|onclick=|<script/i.test(中),
               やられた: window.__やられた, 中: 中.slice(0, 200) };
    }, 危ないSVG);
    見("道具に「図（SVG）」が 出る", r.道具.some((x) => /図（SVG）/.test(x)), "");
    見("道具に「参考資料」が 出る", r.道具.some((x) => /参考資料/.test(x)), "");
    見("図を 入れられる", r.入った === true);
    見("入れた 図が 出る", (r.svgの数 || 0) >= 1, r.svgの数 + " 個");
    見("**危ないものが 残らない**", r.危険 !== true, r.中.slice(0, 90));
    見("**押しても 何も 起きない**", r.やられた === 0, "動いた回数 " + r.やられた);
    見("赤い字が 出ない", 例外.length === 0, 例外.slice(0, 2).join(" / "));
    await p.close();
  }

  /* ══ ③⑤ Docs ════════════════════════════════════════════════════ */
  console.log("── ③⑤ Docs に 図（SVG）───────────────────────────────");
  {
    const { p, 例外 } = await 頁();
    const r = await p.evaluate(async (危) => {
      const WP = window.VQ2.workplace;
      const 待 = (ms) => new Promise((r2) => setTimeout(r2, ms));
      WP.docs.open({ item: { id: "d1", itemType: "document", title: "t",
          appearance: { bannerType: "gradient", bannerValue: "#eee" } },
        content: { schemaVersion: 1, content: {
          blocks: [{ id: "b1", type: "paragraph", text: "はじめ" }],
          page: WP.paper.defaults() } } });
      await 待(400);
      const sh = document.getElementById("vq-wp-docs").shadowRoot;
      /* 挿入メニューに 出るか */
      const 挿 = [...sh.querySelectorAll("button")].find((x) => /挿入/.test(x.getAttribute("aria-label") || x.textContent || ""));
      let 一覧 = [];
      if (挿) { 挿.click(); await 待(250);
        一覧 = [...sh.querySelectorAll("[data-t]")].map((x) => (x.textContent || "").trim());
        const 図 = [...sh.querySelectorAll("[data-t]")].find((x) => /図（SVG）/.test(x.textContent || ""));
        if (図) { 図.click(); await 待(250);
          const ta = sh.querySelector('[data-k="svg"]');
          if (ta) { ta.value = 危; ta.dispatchEvent(new Event("input", { bubbles: true }));
            const okb = [...sh.querySelectorAll("button")].find((x) => /入れる/.test(x.textContent || ""));
            if (okb) { okb.click(); await 待(450); } }
        }
      }
      const 画面 = (sh.querySelector(".wpd-doc") || sh.querySelector(".wpd-page")
        || sh.querySelector(".wp-main") || sh).innerHTML || "";
      /* 保存を 走らせて、model から 消えないか 見る */
      let 保存後 = null;
      try {
        const el = sh.querySelector('.wpd-doc [contenteditable="true"]');
        if (el) el.dispatchEvent(new Event("input", { bubbles: true }));
        await 待(700);
        保存後 = (WP.current && WP.current.session && WP.current.session.content
          && WP.current.session.content.content.blocks || []).map((x) => x.type + (x.svg ? "(図あり)" : ""));
      } catch (e) { 保存後 = ["読めず: " + String(e).slice(0, 60)]; }
      return { 一覧, svgの数: (画面.match(/<svg/g) || []).length,
               危険: /evil\.example|onload=|onclick=|<script/i.test(画面), 保存後 };
    }, 危ないSVG);
    見("挿入に「図（SVG）」が 出る", (r.一覧 || []).some((x) => /図（SVG）/.test(x)), JSON.stringify(r.一覧));
    見("挿入に「参考資料をさがす」が 出る", (r.一覧 || []).some((x) => /参考資料/.test(x)), "");
    見("入れた 図が 出る", (r.svgの数 || 0) >= 1, r.svgの数 + " 個");
    見("**危ないものが 残らない**", r.危険 !== true);
    見("**保存しても 図が 消えない**",
      (r.保存後 || []).some((x) => /^svg\(図あり\)/.test(x)), JSON.stringify(r.保存後));
    見("赤い字が 出ない", 例外.length === 0, 例外.slice(0, 2).join(" / "));
    await p.close();
  }

  /* ══ ④⑥ 出どころと 紙 ═══════════════════════════════════════════ */
  console.log("── ④⑥ 出どころ（CC の 決まり）と 紙 ──────────────────");
  {
    const { p, 例外 } = await 頁();
    const r = await p.evaluate(async () => {
      const WP = window.VQ2.workplace;
      const 待 = (ms) => new Promise((r2) => setTimeout(r2, ms));
      const credit = { author: "だれか", license: "CC BY-SA 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
        page: "https://commons.wikimedia.org/wiki/File:X", source: "Wikimedia Commons" };
      WP.docs.open({ item: { id: "d2", itemType: "document", title: "t",
          appearance: { bannerType: "gradient", bannerValue: "#eee" } },
        content: { schemaVersion: 1, content: { blocks: [
          { id: "b1", type: "image", src: "/api/media/img/x.png", credit: credit, width: 60 },
          { id: "b2", type: "svg", svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#0a0"/></svg>', width: 50 }
        ], page: WP.paper.defaults() } } });
      await 待(400);
      const sh = document.getElementById("vq-wp-docs").shadowRoot;
      /* 紙のときは 用紙の 中に 入るので、器を 広く 取る。 */
      const 画面 = (sh.querySelector(".wpd-doc") || sh.querySelector(".wpd-page")
        || sh.querySelector(".wp-main") || sh).innerHTML || "";
      /* 紙の 中身 */
      let 紙 = "";
      const 元 = window.open;
      window.open = function () {
        return { document: { open() {}, close() {}, write(h) { 紙 += h; } }, focus() {}, print() {},
                 setInterval() {}, clearInterval() {} };
      };
      const b = [...sh.querySelectorAll("button")].find((x) => /PDF/.test(x.textContent || x.getAttribute("aria-label") || ""));
      if (b) { b.click(); await 待(2500); }
      window.open = 元;
      return { 画面出典: /wp-credit/.test(画面), 画面SVG: /<svg/.test(画面),
               紙: 紙.length, 紙出典: /wp-credit/.test(紙), 紙SVG: (紙.match(/<svg/g) || []).length,
               紙のCC: /CC BY-SA 4\.0/.test(紙) };
    });
    見("画面に 出どころが 出る", r.画面出典 === true);
    見("画面に 図が 出る", r.画面SVG === true);
    if ((r.紙 || 0) > 1000) {
      見("紙にも 出どころが 乗る", r.紙出典 === true);
      見("紙に 決まり（ライセンス）の 名が 乗る", r.紙のCC === true);
      見("紙にも 図が 乗る", (r.紙SVG || 0) >= 1, r.紙SVG + " 個");
    } else ng("PDF を 作れた", r.紙 + " 字");
    見("赤い字が 出ない", 例外.length === 0, 例外.slice(0, 2).join(" / "));
    await p.close();
  }

  srv.close();
  await b.close();
  console.log("\n合計 OK=" + OK + " NG=" + NG);
  process.exit(NG ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
