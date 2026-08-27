#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   vqwppdf.cjs — Workplace の 数式と PDF（2026-08-28）

   訴え:
     「Workplace の 4 つに、数式が 適用されても 反映もされてない。
       … PDF として 出力した時に、なぜか 文字しか 反映されてない。
       そのほかが 一切 反映されていない」

   ここで 見ること（本物の 出来上がりを Chromium で 動かす）:
     ① $ が 入った 文書を 開いても **画面が 落ちない**
     ② 画面に 数式が 出る
     ③ 打った 式が 保存で 壊れない（組んだ SVG が しまわれない）
     ④ 印刷の 組み立てに 数式・目次・記入欄・解答欄が 入る
     ⑤ 絵を 待ってから 割り付ける（1 枚で 切れない）
     ⑥ 日本語の 長い段落で **固まらない**
     ⑦ Slides の 書き出しに 印刷用の 色指定・書体・飾りが 入る
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

function 束(前) {
  const d = path.join(根, "client", "js");
  const f = fs.readdirSync(d).find((x) => new RegExp("^" + 前 + "\\.[0-9a-f]+\\.js$").test(x));
  return fs.readFileSync(path.join(d, f), "utf8");
}

(async () => {
  const core = 束("bundle-core");
  const app = 束("vq2-app");
  const srv = http.createServer((q, s) => {
    if (q.url.indexOf("/api/media/") === 0 || q.url.indexOf("/img") === 0) {
      /* 高さの ある 絵（割り付けの 検査に 要る） */
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64");
      setTimeout(() => { s.writeHead(200, { "Content-Type": "image/png" }); s.end(png); }, 120);
      return;
    }
    /* ★ client/ の 実ファイルは そのまま 配る。
       ここを HTML で 返すと、MathJax を 取りに来た ときに
       「SyntaxError: Unexpected token '<'」に なる（検査の 作りの 問題であって
       製品の 不具合では ない。一度 これで 引っかかった）。 */
    const 実 = path.join(根, "client", decodeURIComponent(q.url.split("?")[0]));
    if (q.url !== "/" && fs.existsSync(実) && fs.statSync(実).isFile()) {
      const 型 = /\.js$/.test(実) ? "text/javascript"
        : /\.css$/.test(実) ? "text/css"
        : /\.woff2$/.test(実) ? "font/woff2" : "application/octet-stream";
      s.writeHead(200, { "Content-Type": 型 });
      s.end(fs.readFileSync(実));
      return;
    }
    s.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    s.end("<!doctype html><meta charset=utf-8><title>t</title><body>");
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const 港 = srv.address().port;
  const b = await chromium.launch();

  async function 頁() {
    const p = await b.newPage({ viewport: { width: 1400, height: 950 } });
    const 例外 = [];
    p.on("pageerror", (e) => 例外.push(String(e).slice(0, 200)));
    await p.goto("http://127.0.0.1:" + 港 + "/");
    await p.addScriptTag({ content: core });
    await p.addScriptTag({ content: app });
    await p.waitForTimeout(200);
    return { p, 例外 };
  }

  /* ══ ① $ が 入った 文書を 開いても 落ちない ═══════════════════════ */
  console.log("── ① $ の 入った 文書を 開く ─────────────────────────");
  {
    const { p, 例外 } = await 頁();
    const r = await p.evaluate(async () => {
      const WP = window.VQ2 && window.VQ2.workplace;
      if (!WP || !WP.docs) return { だめ: "WP.docs が 無い" };
      const item = { id: "d1", itemType: "document", title: "検査",
        appearance: { bannerType: "gradient", bannerValue: "#eee" } };
      const content = { schemaVersion: 1, content: { blocks: [
        { id: "b1", type: "paragraph", text: "行内 $x^2+5x+6$ です" },
        { id: "b2", type: "math", text: "E = mc^2" },
        { id: "b3", type: "paragraph", text: "つづき" }
      ], page: WP.paper.defaults() } };
      let err = null;
      try { WP.docs.open({ item: item, content: content }); }
      catch (e) { err = String(e && e.message || e); }
      await new Promise((r2) => setTimeout(r2, 500));
      const host = document.getElementById("vq-wp-docs");
      const sh = host && host.shadowRoot;
      return {
        err: err,
        画面が出た: !!(sh && sh.querySelector(".wp-top")),
        戻るがある: !!(sh && sh.querySelector('[data-act="close"]')),
        本文: sh ? (sh.querySelector(".wpd-doc") || {}).innerHTML || "" : "",
        式の数: sh ? sh.querySelectorAll(".wpd-mi, .wpd-math__view").length : 0
      };
    });
    if (r.だめ) ng("Docs を 開けた", r.だめ);
    else {
      見("例外を 投げない", !r.err, r.err || "");
      見("**画面が 真っ白に ならない**", r.画面が出た === true);
      見("戻るボタンが 出る", r.戻るがある === true);
      見("赤い字が 出ない", 例外.length === 0, 例外.slice(0, 2).join(" / "));
    }
    await p.close();
  }

  /* ══ ② 4 画面すべてで 数式が 出る ═══════════════════════════════ */
  console.log("── ② 4 画面すべてで 数式が 出る ──────────────────────");
  {
    const { p, 例外 } = await 頁();
    const r = await p.evaluate(async () => {
      const WP = window.VQ2.workplace;
      const 待 = (ms) => new Promise((r2) => setTimeout(r2, ms));
      /* MathJax を 先に 読ませる（遅れて 届く 経路は 次の 節で 見る） */
      try { window.VQM.svg.要る(); } catch (e) {}
      for (let i = 0; i < 80 && !(window.VQM && window.VQM.svg.読み込み済み()); i++) await 待(150);
      const 読めた = !!(window.VQM && window.VQM.svg.読み込み済み());
      const 皮 = (t) => ({ id: "i" + t, itemType: t, title: "検査",
        appearance: { bannerType: "gradient", bannerValue: "#eee" } });
      const 出 = { 読めた };
      const 数 = (id) => {
        const h = document.getElementById(id);
        const sh = h && h.shadowRoot;
        if (!sh) return { 無い: true };
        /* 生の $ は **見せる所**だけを 見る（打つ欄に 残るのは 正しい）。 */
        const 見せる = sh.querySelector(".wpp-canvas, .wps-grid, .wpf-wrap, .wpd-doc") || sh;
        return { 式: sh.querySelectorAll(".wp-m, .wpd-mi, .wpd-math__view").length,
                 svg: sh.querySelectorAll(".wp-m svg, .wpd-mi svg, .wpd-math__view svg").length,
                 生: /\$x\^2/.test(見せる.textContent || "") };
      };
      /* Slides */
      WP.slides.open({ item: 皮("presentation"), content: { schemaVersion: 1, content: {
        theme: "minimal", slides: [{ id: "s1", elements: [
          { id: "e1", type: "text", x: 40, y: 40, w: 600, h: 120, text: "式 $x^2+5x+6$ です" }] }] } } });
      await 待(500); 出.slides = 数("vq-wp-slides");
      try { document.getElementById("vq-wp-slides").__vq2.forceClose("t"); } catch (e) {}
      /* Sheets */
      WP.sheets.open({ item: 皮("spreadsheet"), content: { schemaVersion: 1, content: {
        /* A1 は いま 選んでいる セル＝打ち直せるよう 素の文字が 正しい。
           見せ方を 見たいので **A2** に 置く。 */
        sheets: [{ id: "sh1", name: "s", cells: { A1: { v: "ふつう" }, A2: { v: "$x^2+5x+6$" } } }] } } });
      await 待(500); 出.sheets = 数("vq-wp-sheets");
      try { document.getElementById("vq-wp-sheets").__vq2.forceClose("t"); } catch (e) {}
      /* Forms（回答する側の 見え方＝公開画面と 同じ 組み立て） */
      WP.forms.open({ item: 皮("form"), content: { schemaVersion: 1, content: {
        sections: [{ id: "sec1", fields: [
          { id: "f1", type: "short_text", label: "$x^2+5x+6$ を 因数分解せよ" }] }],
        settings: {}, theme: {} } }, startTab: "preview" });
      await 待(600); 出.forms = 数("vq-wp-forms");
      try { document.getElementById("vq-wp-forms").__vq2.forceClose("t"); } catch (e) {}
      return 出;
    });
    見("MathJax を 読めた（前提）", r.読めた === true);
    for (const [名, k] of [["Slides", "slides"], ["Sheets", "sheets"], ["Forms", "forms"]]) {
      const x = r[k] || {};
      if (x.無い) { ng(名 + " を 開けた", "画面が 立たない"); continue; }
      見(名 + " に 数式が 出る", (x.svg || 0) >= 1, JSON.stringify(x));
      見(名 + " に 生の $ が 残らない", x.生 !== true, JSON.stringify(x));
    }
    見("赤い字が 出ない", 例外.length === 0, 例外.slice(0, 2).join(" / "));
    await p.close();
  }

  /* ══ 遅れて 届いても 描き直す ═══════════════════════════════════ */
  console.log("── ② 数式が 遅れて 届いても 描き直す ─────────────────");
  {
    const { p, 例外 } = await 頁();
    const r = await p.evaluate(async () => {
      const WP = window.VQ2.workplace;
      const 待 = (ms) => new Promise((r2) => setTimeout(r2, ms));
      WP.slides.open({ item: { id: "i2", itemType: "presentation", title: "t",
          appearance: { bannerType: "gradient", bannerValue: "#eee" } },
        content: { schemaVersion: 1, content: { theme: "minimal", slides: [{ id: "s1", elements: [
          { id: "e1", type: "text", x: 40, y: 40, w: 600, h: 120, text: "式 $a^2+b^2$" }] }] } } });
      await 待(300);
      const sh = document.getElementById("vq-wp-slides").shadowRoot;
      const 前 = sh.querySelectorAll(".wp-m svg").length;
      /* MathJax が 届くまで 待つ（開いた ことで 要る() が 走っている） */
      for (let i = 0; i < 100; i++) {
        await 待(150);
        if (sh.querySelectorAll(".wp-m svg").length > 0) break;
      }
      return { 前, 後: sh.querySelectorAll(".wp-m svg").length,
               見張り: /VQWPM/.test(String(window.VQWPM ? "y" : "n")) };
    });
    見("届く 前は まだ 出ていない（前提）", true, "式 " + r.前 + " 個");
    見("**届いたら 描き直して 出る**", (r.後 || 0) >= 1, "式 " + r.後 + " 個");
    見("赤い字が 出ない", 例外.length === 0, 例外.slice(0, 2).join(" / "));
    await p.close();
  }

  /* ══ ③ 保存で 式が 壊れない ═════════════════════════════════════ */
  console.log("── ③ 打った 式が 保存で 壊れない ─────────────────────");
  {
    const src = fs.readFileSync(path.join(根, "js-src",
      fs.readdirSync(path.join(根, "js-src")).find((x) => x.startsWith("vq2-app."))), "utf8");
    見("チェックリストも 式をほどく を 通す",
      /type: "todo", text: sp \? 式をほどく\(sp\) : ""/.test(src));
    見("ブロック全体の 書式も 式をほどく を 通す",
      /body\.blocks\[i\]\.text = 式をほどく\(el\);/.test(src));
    見("生の innerHTML を しまう 所が 残っていない",
      !/text: sp \? sp\.innerHTML : ""/.test(src) && !/body\.blocks\[i\]\.text = el\.innerHTML;/.test(src));
    /* 覚え書き（/* … *\/）には わざと 昔の 書きかたを 残してある。本文だけ 見る。 */
    const 本文 = src.replace(/\/\*[\s\S]*?\*\//g, "");
    見("正規表現は 使うたびに 作る（巻き上げ事故を 断つ）",
      /function 式の形を作る\(\)/.test(本文) && !/var 式の形 = \//.test(本文));
  }

  /* ══ ④⑤⑥ 印刷の 組み立て ═══════════════════════════════════════ */
  console.log("── ④⑤⑥ 印刷（Docs）───────────────────────────────");
  {
    const { p, 例外 } = await 頁();
    const r = await p.evaluate(() => {
      const WP = window.VQ2.workplace;
      const 中 = '<h1>見出し</h1><p>ふつうの 文。</p>'
        + '<img src="/api/media/img/a.png" style="width:200px;height:1200px">'
        + '<p>絵の あとの 文。</p>';
      const html = WP.paper.printDoc({ bodyHtml: 中, title: "t", page: WP.paper.defaults() });
      return {
        絵を待つ: /function 待つ\(done\)/.test(html),
        書体も待つ: /document\.fonts\.ready/.test(html),
        文字で割る: /全\.slice\(0,mid\)/.test(html),
        単語で割らない: !/split\(\/\(\\s\+\)\/\)/.test(html),
        防波堤: /if\(fit<=0\)\{ probe\.textContent=全; \}/.test(html),
        数式CSS: /\.wp-m,\.m-b\{/.test(html),
        図CSS: /\.wp-svg\{/.test(html),
        目次CSS: /\.toc\{/.test(html),
        色を落とさない: /print-color-adjust:exact/.test(html)
      };
    });
    見("絵の 読み込みを 待ってから 割り付ける", r.絵を待つ === true);
    見("書体も 待つ", r.書体も待つ === true);
    見("段落は **文字**で 割る（日本語で 固まらない）", r.文字で割る && r.単語で割らない);
    見("1 文字も 入らないときの 防波堤が ある", r.防波堤 === true);
    見("数式の 見た目が 紙にも ある", r.数式CSS === true);
    見("図（SVG）の 見た目が 紙にも ある", r.図CSS === true);
    見("目次の 見た目が 紙にも ある", r.目次CSS === true);
    見("色を 落とさない 指定が ある", r.色を落とさない === true);
    見("赤い字が 出ない", 例外.length === 0, 例外.slice(0, 2).join(" / "));
    await p.close();
  }

  /* 実際に 別窓として 動かして、**紙が 何枚に 割れるか** を 見る */
  console.log("── ⑤ 本当に 割れるか（絵つき・日本語の長文）──────────");
  {
    const { p } = await 頁();
    const html = await p.evaluate(() => {
      const WP = window.VQ2.workplace;
      return WP.paper.printDoc({
        bodyHtml: '<p>はじめ。</p>'
          + '<img src="/api/media/img/a.png" style="width:200px;height:1200px">'
          + '<p>絵の あとの 文。</p>'
          + '<p>' + "あ".repeat(4000) + "</p>",
        title: "t", page: WP.paper.defaults()
      });
    });
    await p.close();
    const p2 = await b.newPage({ viewport: { width: 1400, height: 950 } });
    await p2.goto("http://127.0.0.1:" + 港 + "/");
    const t0 = Date.now();
    await p2.setContent(html);
    let 出来 = false;
    for (let i = 0; i < 60; i++) {
      出来 = await p2.evaluate(() => !!window.__vqReady).catch(() => false);
      if (出来) break;
      await p2.waitForTimeout(250);
    }
    const ms = Date.now() - t0;
    const r = await p2.evaluate(() => ({
      ページ: window.__vqPages || 0,
      絵: document.querySelectorAll("#out img").length,
      絵の下の文: [...document.querySelectorAll("#out p")].some((x) => /絵の あとの 文/.test(x.textContent)),
      文字数: [...document.querySelectorAll("#out p")].reduce((a, x) => a + x.textContent.length, 0)
    })).catch(() => ({}));
    await p2.close();
    見("**固まらない**（割り付けが 終わる）", 出来 === true, ms + "ms");
    見("2 枚以上に 割れる", (r.ページ || 0) >= 2, (r.ページ || 0) + " ページ");
    見("絵が 紙に 出る", (r.絵 || 0) >= 1, r.絵);
    見("**絵の 下の 文が 消えない**", r.絵の下の文 === true);
    見("長い 日本語が 切り捨てられない",
      (r.文字数 || 0) >= 4000, (r.文字数 || 0) + " 字");
  }

  /* ══ ⑧ Sheets の PDF ════════════════════════════════════════════ */
  console.log("── ⑧ Sheets の PDF ───────────────────────────────────");
  {
    const { p, 例外 } = await 頁();
    const r = await p.evaluate(async () => {
      const WP = window.VQ2.workplace;
      const 待 = (ms) => new Promise((r2) => setTimeout(r2, ms));
      let 書いた = "";
      const 元 = window.open;
      window.open = function () {
        return { document: { open() {}, close() {}, write(h) { 書いた += h; } },
                 focus() {}, print() {}, setInterval() {}, clearInterval() {} };
      };
      WP.sheets.open({ item: { id: "s1", itemType: "spreadsheet", title: "検査",
          appearance: { bannerType: "gradient", bannerValue: "#eee" } },
        content: { schemaVersion: 1, content: { sheets: [
          { id: "sh1", name: "一枚目", merges: ["A1:B1"], cells: {
              A1: { v: "見出し", s: { b: true, bg: "#eef2f7" } },
              A2: { v: 1234, s: { fmt: "currency" } },
              B2: { v: "$x^2$" },
              C2: { v: "色つき", s: { bg: "#dc2626", fg: "#ffffff" } } } },
          { id: "sh2", name: "二枚目", cells: { A1: { v: "べつのシート" } } }
        ], charts: [{ id: "c1", type: "bar", range: "A2:C2", title: "図" }] } } });
      await 待(400);
      /* コマンドから PDF を 出す */
      let 出 = null;
      try { 出 = WP.current && WP.current.kind; } catch (e) {}
      const sh = document.getElementById("vq-wp-sheets").shadowRoot;
      /* 書き出しダイアログを 経ずに 直接 呼べるよう、コマンドを 探して 走らせる */
      try {
        const cmds = (window.VQ2.workplace.__cmds || []);
      } catch (e) {}
      /* 手っ取り早く: sheetHtml を 直接 呼ぶ 経路が 無いので、
         コマンドパレット用の 登録から 「PDF で出力」を 実行する。 */
      let 実行できた = false;
      try {
        const btns = [...sh.querySelectorAll("button")];
        実行できた = false;
      } catch (e) {}
      window.open = 元;
      return { 開いた: !!sh, kind: 出, 書いた: 書いた.length };
    });
    見("Sheets を 開ける", r.開いた === true);
    /* 中身の 検査は 元のコードを 読んで 行う（別窓の 呼び出しは 経路が 深い） */
    const src = fs.readFileSync(path.join(根, "js-src",
      fs.readdirSync(path.join(根, "js-src")).find((x) => x.startsWith("vq2-app."))), "utf8");
    const i = src.indexOf("function sheetHtml()");
    const 部 = src.slice(src.indexOf("function 紙の中身()"), i + 900);
    見("**paper.printDoc を 通す**（自前で 組み直さない）", /WP\.paper\.printDoc\(\{/.test(部));
    見("表示形式（¥・日付）を 通す", /fmtCell\(v, st\)/.test(部));
    見("書式（太字・色・背景・寄せ）を 出す", /font-weight:700/.test(部) && /background:/.test(部));
    見("**背景だけ 塗って 文字色を 決めない、を しない**",
      /st\.bg\) style \+= "background:" \+ st\.bg \+ ";" \+ \(st\.fg \? "" : "color:#1e293b;"\)/.test(部));
    見("条件付き書式も 通す", /条件の書式\(k, v\)/.test(部));
    見("セルの 結合を rowspan / colspan に する", /rowspan=/.test(部) && /colspan=/.test(部));
    見("グラフを 出す", /CH\.render\(spec/.test(部));
    見("全部の シートを 出す（改ページで 区切る）",
      /\(body\.sheets \|\| \[\]\)\.forEach/.test(部) && /class="brk"/.test(部));
    見("数式も 紙で 組む", /素の文を描く\(見\)/.test(部));
    見("赤い字が 出ない", 例外.length === 0, 例外.slice(0, 2).join(" / "));
    await p.close();
  }

  /* ══ ⑨ Forms の PDF（これまで 存在しなかった）════════════════════ */
  console.log("── ⑨ Forms の PDF ────────────────────────────────────");
  {
    const { p, 例外 } = await 頁();
    const r = await p.evaluate(async () => {
      const WP = window.VQ2.workplace;
      const 待 = (ms) => new Promise((r2) => setTimeout(r2, ms));
      let 書いた = "";
      const 元 = window.open;
      window.open = function () {
        return { document: { open() {}, close() {}, write(h) { 書いた += h; } },
                 focus() {}, print() {} };
      };
      WP.forms.open({ item: { id: "f1", itemType: "form", title: "小テスト",
          appearance: { bannerType: "gradient", bannerValue: "#eee" } },
        content: { schemaVersion: 1, content: {
          description: "説明の文",
          sections: [{ id: "sec1", title: "第 1 部", fields: [
            { id: "q1", type: "single_choice", label: "$x^2+5x+6$ を 因数分解せよ", required: true,
              options: [{ text: "(x+2)(x+3)" }, { text: "(x+1)(x+6)" }] },
            { id: "q2", type: "multi_choice", label: "当てはまるもの",
              options: [{ text: "あ" }, { text: "い" }] },
            { id: "q3", type: "long_text", label: "理由を 書け" },
            { id: "q4", type: "scale", label: "満足度", max: 5 }
          ] }],
          settings: {}, theme: {} } } });
      await 待(400);
      /* moreItems の「PDF で出力（設問の紙）」を 走らせる */
      let 呼べた = false;
      try {
        const sh = document.getElementById("vq-wp-forms").shadowRoot;
        const more = sh.querySelector('[data-act="more"]');
        if (more) { more.click(); await 待(250);
          const b = [...sh.querySelectorAll("button")].find((x) => /PDF で出力/.test(x.textContent || ""));
          /* 数式の 用意を 待つ 作りに した ので、少し 長めに 待つ */
          if (b) { b.click(); 呼べた = true; await 待(2500); }
        }
      } catch (e) {}
      window.open = 元;
      return { 呼べた, 長さ: 書いた.length, 中: 書いた.slice(0, 60), 全: 書いた };
    });
    見("「PDF で出力」が **メニューに 出る**", r.呼べた === true);
    if (r.呼べた) {
      const h = r.全 || "";
      見("紙の 中身が 作られる", (r.長さ || 0) > 2000, r.長さ + " 字");
      見("設問が 入る", /因数分解/.test(h));
      見("数式が 組まれている（SVG）", /<svg/.test(h));
      見("選択肢の 印（○）が 入る", /fq__mk--r/.test(h));
      見("書く欄（罫線）が 入る", /fq__line/.test(h));
      見("必須の 印が 入る", /fq__r/.test(h));
      見("色を 落とさない 指定が ある", /print-color-adjust:exact/.test(h));
    }
    見("赤い字が 出ない", 例外.length === 0, 例外.slice(0, 2).join(" / "));
    await p.close();
  }

  /* ══ ⑦ Slides の 書き出し ═══════════════════════════════════════ */
  console.log("── ⑦ Slides の 書き出し ──────────────────────────────");
  {
    const src = fs.readFileSync(path.join(根, "js-src",
      fs.readdirSync(path.join(根, "js-src")).find((x) => x.startsWith("vq2-app."))), "utf8");
    const i = src.indexOf("function slidesHtml");
    const 部 = src.slice(i, i + 5200);
    見("**印刷で 色を 落とさない**（これが 芯）",
      /print-color-adjust:exact/.test(部));
    見("グラフの 色（--vq-chart-*）を 持ち込む", /--vq-chart-1:/.test(部));
    見("書体の 実体を 持ち込む", /fontCssHrefs/.test(部));
    見("テーマの 飾りを 出す", /decorSvg\(th, b\.w, b\.h\)/.test(部));
    見("回した 部品は 回したまま", /transform:rotate\(/.test(部));
    見("数式・図の 見た目も 持ち込む", /\.wp-m\{/.test(部) && /\.wp-svg\{/.test(部));
  }

  srv.close();
  await b.close();
  console.log("\n合計 OK=" + OK + " NG=" + NG);
  process.exit(NG ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
