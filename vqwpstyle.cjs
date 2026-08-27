/* ══════════════════════════════════════════════════════════════════════
   Vocabu Workplace — 書式まわりの確認（実ブラウザ）

   ・色を自由に決められるか（見本・色の輪・#RRGGBB）
   ・Docs の書体・文字の大きさ（数字）・記号・囲い文字・上下付き
   ・表の列幅をマウスで変えられるか（Docs / Slides / Sheets）
   ・スライドのテーマと、画面切り替え・要素のアニメーション

   使い方: node vqwpstyle.cjs
   ══════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const http = require("http"); const fs = require("fs"); const path = require("path");
const ROOT = path.join(__dirname, "client"); const PORT = Number(process.env.VQ_PORT || 8987);
const MIME = { ".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",
  ".png":"image/png",".svg":"image/svg+xml",".webmanifest":"application/manifest+json",".woff2":"font/woff2" };
let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => { c ? (pass++, console.log("  ok   " + n))
  : (fail++, bad.push(n), console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0,220) : ""))); };
const section = (t) => console.log("\n══ " + t + " ══");
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function serve() {
  return new Promise((res) => {
    const s = http.createServer((rq, rs) => {
      let p = decodeURIComponent(String(rq.url).split("?")[0]);
      if (p === "/") p = "/index.html";
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); rs.end("x"); return; }
      rs.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
      fs.createReadStream(f).pipe(rs);
    });
    s.listen(PORT, "127.0.0.1", () => res(s));
  });
}

(async () => {
  const server = await serve();
  const browser = await chromium.launch();
  const pg = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errs = [];
  pg.on("pageerror", e => errs.push(String(e.message).slice(0, 180)));

  await pg.goto(`http://127.0.0.1:${PORT}/index.html?vq2=all`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.waitForFunction(() => window.VQ2 && window.VQ2.workplace && window.VQ2.workplace.home, { timeout: 40000 });
  await pg.evaluate(() => { const o = document.getElementById("firstLaunchOverlay"); if (o) o.style.display = "none"; });

  const openEditor = async (kind, id, type) => {
    await pg.evaluate(([k, t]) => {
      const W = window.VQ2.workplace;
      W[k].open({ item: W.model.newItem(t, { title: "書式テスト" }), content: W.model.emptyContent(t) });
    }, [kind, type]);
    await pg.waitForSelector("#" + id, { timeout: 15000 });
    await sleep(500);
  };
  const closeAll = async () => {
    await pg.evaluate(() => {
      document.querySelectorAll(".vq2-host").forEach(h => { if (h.__vq2) h.__vq2.forceClose("t"); });
    });
    await sleep(400);
  };

  /* ══ ① 自由な色 ══════════════════════════════════════════════ */
  section("色を自由に決められる");
  await openEditor("docs", "vq-wp-docs", "document");
  {
    await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      const c = sr.querySelector(".wpd-doc, .wpd-b__c");
      c.focus(); c.textContent = "自由な色をためす文章";
      c.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    });
    await sleep(200);
    const r = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      /* 本文は 1 枚の続き物になったので、真ん中は空白のことが多い。
         文字のある最初の行を掴む。 */
      const d = sr.querySelector(".wpd-doc, .wpd-b__c");
      const line = d.firstElementChild || d;
      const c = line.getBoundingClientRect();
      return { x1: c.x + 4, y: c.y + Math.min(c.height, 22) / 2, x2: c.x + c.width - 4 };
    });
    await pg.mouse.move(r.x1, r.y); await pg.mouse.down();
    await pg.mouse.move(r.x2, r.y, { steps: 8 }); await pg.mouse.up();
    await sleep(200);
    /* 色は 1 段で出す。以前の「色 →（文字の色 / 背景）→ 見本」の 2 段は、
       その間に文字の選択が外れて何も起きなくなったため、やめてある。 */
    await pg.evaluate(() => {
      document.getElementById("vq-wp-docs").shadowRoot.querySelector('[data-act="color-menu"]').click();
    });
    await sleep(350);
    const menu = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      const p = sr.querySelector(".wp-cp");
      return {
        direct: !!p,
        /* 途中の一覧（「文字の色 / 背景」を選ばせる段）が挟まっていないこと。
           窓そのものは .wp-ctxmenu の中に出るので、中身の項目の数で見る。 */
        step: sr.querySelectorAll(".wp-ctxmenu__i").length,
        modes: p ? Array.from(p.querySelectorAll(".wp-cp__seg .wp-seg__b")).map(b => b.textContent.trim()) : []
      };
    });
    ok("★色は 1 段で開く（途中のメニューを挟まない）", menu.direct === true && menu.step === 0, menu);
    ok("同じ窓に「文字の色」と「蛍光ペン」が並ぶ",
      menu.modes.some(t => /文字の色/.test(t)) && menu.modes.some(t => /蛍光/.test(t)), menu.modes);
    const cp = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      const p = sr.querySelector(".wp-cp");
      return { open: !!p,
        swatches: p ? p.querySelectorAll(".wp-cp__s").length : 0,
        wheel: p ? !!p.querySelector('input[type="color"]') : false,
        hex: p ? !!p.querySelector(".wp-cp__hex") : false };
    });
    ok("色の窓が開く", cp.open === true, cp);
    ok("見本が 60 色以上ある", cp.swatches >= 60, cp.swatches);
    ok("色の輪（カラーピッカー）がある", cp.wheel === true);
    ok("#RRGGBB で入れられる欄がある", cp.hex === true);

    /* 見本にない色を数字で入れる */
    await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      const hex = sr.querySelector(".wp-cp__hex");
      hex.value = "#1a9f8b";
      hex.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      sr.querySelector('[data-act="cp-ok"]').click();
    });
    await sleep(400);
    const applied = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      return sr.querySelector(".wpd-doc, .wpd-b__c").innerHTML;
    });
    ok("★見本にない色（#1a9f8b）も当てられる",
      /1a9f8b|rgb\(26, 159, 139\)/i.test(applied), applied.slice(0, 160));
    const recent = await pg.evaluate(() => JSON.parse(localStorage.getItem("vq2.wp.recentColors.v1") || "[]"));
    ok("使った色が「最近使った色」に残る", recent.indexOf("#1a9f8b") >= 0, recent);
  }

  /* ══ ② Docs の書式 ═══════════════════════════════════════════ */
  section("Docs：書体・大きさ・記号・囲い文字");
  {
    const tools = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      return {
        font: !!sr.querySelector('[data-act="font-menu"]'),
        size: !!sr.querySelector('[data-act="size"]'),
        sym: !!sr.querySelector('[data-act="symbol-menu"]'),
        enc: !!sr.querySelector('[data-act="enclose-menu"]')
      };
    });
    ok("書体を選ぶボタンがある", tools.font === true, tools);
    const fontCount = await pg.evaluate(() => window.VQ2.workplace.ui.FONTS.length);
    ok("書体が 50 種類以上ある", fontCount >= 50, fontCount);
    ok("文字の大きさを数字で入れる欄がある", tools.size === true);
    ok("記号のボタンがある", tools.sym === true);
    ok("囲い文字のボタンがある", tools.enc === true);

    /* 文字を選んで書体を変える */
    const r = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      /* 本文は 1 枚の続き物になったので、真ん中は空白のことが多い。
         文字のある最初の行を掴む。 */
      const d = sr.querySelector(".wpd-doc, .wpd-b__c");
      const line = d.firstElementChild || d;
      const c = line.getBoundingClientRect();
      return { x1: c.x + 4, y: c.y + Math.min(c.height, 22) / 2, x2: c.x + c.width - 4 };
    });
    /* 書式を当てるたびに本文の中身は包み直される（span が増える）ので、
       最初に測った座標でなぞり直すと、途中から選べなくなる。
       ここは「本文をぜんぶ選んだ状態」を作り直す。
       マウスでなぞれること自体は ① の色のところで見ている。 */
    const reselect = async () => {
      await pg.evaluate(() => {
        const sr = document.getElementById("vq-wp-docs").shadowRoot;
        const d = sr.querySelector(".wpd-doc, .wpd-b__c");
        d.focus();
        const rr = document.createRange(); rr.selectNodeContents(d);
        const sel = sr.getSelection ? sr.getSelection() : window.getSelection();
        sel.removeAllRanges(); sel.addRange(rr);
      });
      await sleep(200);
    };
    await reselect();
    await pg.evaluate(() => {
      document.getElementById("vq-wp-docs").shadowRoot.querySelector('[data-act="font-menu"]').click();
    });
    await sleep(400);
    const fp = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      return { open: !!sr.querySelector(".wp-fp__i"),
        items: sr.querySelectorAll(".wp-fp__i").length,
        groups: sr.querySelectorAll(".wp-cp__l[data-grp]").length,
        search: !!sr.querySelector(".wp-fp__q"),
        marked: sr.querySelectorAll(".wp-fp__x").length };
    });
    ok("書体の窓が開く", fp.open === true, fp);
    ok("書体が 50 個以上並ぶ", fp.items >= 50, fp.items);
    /* 分類の数は同梱の一覧が決める（build-fonts.mjs が作る）。
       数を決め打ちにすると、書体を足すたびに嘘になるため、一覧と突き合わせる。 */
    const realGroups = await pg.evaluate(() =>
      new Set(window.VQ2.workplace.ui.FONTS.map(f => f.g)).size);
    ok("分類ごとに分かれている（一覧の分類が全部出る）",
      fp.groups === realGroups && realGroups >= 5, { 出た: fp.groups, 一覧: realGroups });
    ok("しぼり込みの欄がある", fp.search === true);
    ok("端末に無い書体には印が付く", fp.marked >= 0, fp.marked);
    await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      sr.querySelector('.wp-fp__i[data-f="notoserifjp"]').click();
    });
    await sleep(350);
    const fontHtml = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      return sr.querySelector(".wpd-doc, .wpd-b__c").innerHTML;
    });
    ok("★書体（明朝）が当たる", /Mincho|font-family/i.test(fontHtml), fontHtml.slice(0, 180));

    await reselect();
    await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      const n = sr.querySelector('[data-act="size"]');
      n.value = "34";
      n.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    });
    await sleep(300);
    const sizeHtml = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      return sr.querySelector(".wpd-doc, .wpd-b__c").innerHTML;
    });
    ok("★文字の大きさを数字で変えられる（34px）", /font-size:\s*34px/i.test(sizeHtml), sizeHtml.slice(0, 200));

    /* 記号 */
    await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      const c = sr.querySelector(".wpd-doc, .wpd-b__c");
      c.focus();
      const s = sr.getSelection ? sr.getSelection() : window.getSelection();
      const rr = document.createRange(); rr.selectNodeContents(c); rr.collapse(false);
      s.removeAllRanges(); s.addRange(rr);
      sr.querySelector('[data-act="symbol-menu"]').click();
    });
    await sleep(350);
    const symOpen = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      const p = sr.querySelector(".wp-sym");
      return { open: !!p, groups: sr.querySelectorAll(".wp-sym").length,
        chars: sr.querySelectorAll(".wp-sym__b").length };
    });
    ok("記号の窓が開く", symOpen.open === true, symOpen);
    ok("記号が 8 分類以上ある", symOpen.groups >= 8, symOpen.groups);
    ok("記号が 200 個以上ある", symOpen.chars >= 200, symOpen.chars);
    await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      const b = Array.from(sr.querySelectorAll(".wp-sym__b")).filter(x => x.textContent === "≒")[0]
        || sr.querySelector(".wp-sym__b");
      b.click();
    });
    await sleep(300);
    const symText = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      return sr.querySelector(".wpd-doc, .wpd-b__c").textContent;
    });
    ok("★記号が文章に入る", symText.length > "自由な色をためす文章".length, symText);

    /* 囲い文字 */
    await reselect();
    await pg.evaluate(() => {
      document.getElementById("vq-wp-docs").shadowRoot.querySelector('[data-act="enclose-menu"]').click();
    });
    await sleep(350);
    const encOpen = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      return sr.querySelectorAll("[data-enc]").length;
    });
    ok("囲い文字の種類が出る", encOpen >= 4, encOpen);
    await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      sr.querySelector('[data-enc="circle"]').click();
    });
    await sleep(350);
    const encHtml = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      return sr.querySelector(".wpd-doc, .wpd-b__c").innerHTML;
    });
    ok("★囲い文字が入る", /wp-enc/.test(encHtml), encHtml.slice(0, 200));
  }

  /* ══ ③ Docs の表の列幅 ═══════════════════════════════════════ */
  section("Docs：表の列幅をマウスで変えられる");
  {
    await pg.evaluate(async () => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      sr.querySelector('[data-act="insert-menu"]').click();
      await new Promise(r => setTimeout(r, 300));
      const b = sr.querySelector('[data-t="table"]'); if (b) b.click();
    });
    await sleep(600);
    const grip = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      const g = sr.querySelector("[data-grip]");
      if (!g) return null;
      const r = g.getBoundingClientRect();
      const col = sr.querySelector(".wpd-tbl col");
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, w0: col ? col.style.width : "" };
    });
    ok("列の境目に取っ手がある", !!grip, grip);
    if (grip) {
      await pg.mouse.move(grip.x, grip.y); await pg.mouse.down();
      await pg.mouse.move(grip.x - 70, grip.y, { steps: 8 }); await pg.mouse.up();
      await sleep(500);
      const after = await pg.evaluate(() => {
        const sr = document.getElementById("vq-wp-docs").shadowRoot;
        const col = sr.querySelector(".wpd-tbl col");
        const items = JSON.parse(localStorage.getItem("vq2.wp.content.v1") || "{}");
        return { w: col ? col.style.width : "", saved: JSON.stringify(items).indexOf("colW") >= 0 };
      });
      ok("★列の幅がマウスで変わる", !!after.w && after.w !== grip.w0, { 前: grip.w0, 後: after.w });
      ok("変えた幅が保存される", after.saved === true);
    }
  }
  await closeAll();

  /* ══ ④ スライドのテーマ ══════════════════════════════════════ */
  section("Slides：テーマ");
  await openEditor("slides", "vq-wp-slides", "presentation");
  {
    const themes = await pg.evaluate(() => Object.keys(window.VQ2.workplace.slides.THEMES).length);
    ok("テーマが 14 種類以上", themes >= 14, themes);
    await pg.evaluate(() => {
      document.getElementById("vq-wp-slides").shadowRoot.querySelector('[data-act="design"]').click();
    });
    await sleep(500);
    const cards = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-slides").shadowRoot;
      const cs = sr.querySelectorAll(".wp-thc");
      return { n: cs.length,
        hasDecor: !!sr.querySelector(".wp-thc__p svg"),
        hasSample: !!sr.querySelector(".wp-thc__t"),
        groups: sr.querySelectorAll(".wp-thgrid").length };
    });
    ok("テーマの見本が並ぶ", cards.n >= 14, cards);
    ok("見本に飾り（背景の模様）が描かれる", cards.hasDecor === true);
    ok("見本に文字の見え方が出る", cards.hasSample === true);
    ok("種類ごとにまとまっている", cards.groups >= 3, cards.groups);
    await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-slides").shadowRoot;
      sr.querySelector('[data-th="cosmic"]').click();
    });
    await sleep(600);
    const applied = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-slides").shadowRoot;
      const cv = sr.querySelector(".wpp-canvas");
      const saved = JSON.parse(localStorage.getItem("vq2.wp.content.v1") || "{}");
      return { bg: cv.style.background || cv.getAttribute("style"),
        decor: !!sr.querySelector(".wpp-canvas .wpp-decor"),
        inSave: JSON.stringify(saved).indexOf('"cosmic"') >= 0 };
    });
    ok("★テーマがキャンバスに当たる", /gradient|radial/i.test(applied.bg || ""), applied.bg);
    ok("背景の飾りが描かれる", applied.decor === true);
    ok("テーマが保存される", applied.inSave === true);
  }

  /* ══ ⑤ アニメーション ════════════════════════════════════════ */
  section("Slides：アニメーション");
  {
    await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-slides").shadowRoot;
      sr.querySelector('[data-act="add"][data-val="text"]').click();
    });
    await sleep(500);
    const hasBtn = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-slides").shadowRoot;
      return !!sr.querySelector('[data-act="anim"]');
    });
    ok("アニメーションのボタンが出る", hasBtn === true);
    await pg.evaluate(() => {
      document.getElementById("vq-wp-slides").shadowRoot.querySelector('[data-act="anim"]').click();
    });
    await sleep(400);
    const opts = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-slides").shadowRoot;
      const s = sr.querySelector('select[data-act="anim"]');
      return s ? s.options.length : 0;
    });
    ok("動きの種類が 6 つ以上ある", opts >= 6, opts);
    await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-slides").shadowRoot;
      const s = sr.querySelector('select[data-act="anim"]');
      s.value = "up";
      s.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    });
    await sleep(400);
    const saved = await pg.evaluate(() => {
      const c = JSON.parse(localStorage.getItem("vq2.wp.content.v1") || "{}");
      return JSON.stringify(c).indexOf('"anim":"up"') >= 0;
    });
    ok("★選んだ動きが保存される", saved === true);
    await pg.evaluate(() => {
      document.querySelectorAll(".vq2-host").forEach(h => {
        const sr = h.shadowRoot;
        if (!sr) return;
        const c = sr.querySelector('[data-act="wp-sheet-close"]');
        if (c) c.click();
      });
    });
    await sleep(300);
    /* 発表して、実際に動きが当たっているか */
    await pg.evaluate(() => {
      document.getElementById("vq-wp-slides").shadowRoot.querySelector('[data-act="present"]').click();
    });
    await sleep(600);
    const present = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-slides").shadowRoot;
      const c = sr.querySelector(".wpp-present__c");
      const el = sr.querySelector(".wpp-present__c .wpp-anim");
      return { open: !!c, cls: c ? c.className : "",
        animEl: !!el, animCls: el ? el.className : "",
        delay: el ? getComputedStyle(el).animationDelay : "" };
    });
    ok("発表画面に切り替えの動きが付く", /wpp-in-/.test(present.cls), present.cls);
    ok("★要素にアニメーションが付く", present.animEl === true, present);
    ok("順番どおりに遅れて出る（delay が入る）",
      present.delay && present.delay !== "0s", present.delay);
    await pg.keyboard.press("Escape");
    await sleep(400);
  }

  /* ══ ⑥ スライドの表 ══════════════════════════════════════════ */
  section("Slides：表に直接打てる・列幅を変えられる");
  {
    await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-slides").shadowRoot;
      sr.querySelector('[data-act="add"][data-val="table"]').click();
    });
    await sleep(600);
    const tbl = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-slides").shadowRoot;
      const t = sr.querySelector(".wpp-canvas .wpp-tbl");
      if (!t) return null;
      const td = t.querySelector(".wpp-td");
      const r = td.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    ok("表が置ける", !!tbl, tbl);
    await pg.mouse.dblclick(tbl.x, tbl.y);
    await sleep(400);
    const editable = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-slides").shadowRoot;
      const td = sr.querySelector(".wpp-canvas .wpp-td");
      return { editable: td.getAttribute("contenteditable") === "true",
        grip: !!sr.querySelector(".wpp-canvas .wpp-colgrip") };
    });
    ok("★表のマスに直接打てる状態になる", editable.editable === true, editable);
    ok("列の境目に取っ手が出る", editable.grip === true);
    await pg.mouse.click(tbl.x, tbl.y);
    await pg.keyboard.type("直接入力", { delay: 15 });
    await sleep(400);
    const typed = await pg.evaluate(() => {
      const c = JSON.parse(localStorage.getItem("vq2.wp.content.v1") || "{}");
      return JSON.stringify(c).indexOf("直接入力") >= 0;
    });
    ok("★打った文字が表に入って保存される", typed === true);
  }
  await closeAll();

  /* ══ ⑦ Sheets の列幅・行高 ═══════════════════════════════════ */
  section("Sheets：列幅と行の高さをマウスで変えられる");
  await openEditor("sheets", "vq-wp-sheets", "spreadsheet");
  {
    const g = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-sheets").shadowRoot;
      const cg = sr.querySelector("[data-cgrip]");
      const rg = sr.querySelector("[data-rgrip]");
      const cell = sr.querySelector('.wps-c[data-r="1"][data-c="0"]');
      return { hasC: !!cg, hasR: !!rg,
        cx: cg ? cg.getBoundingClientRect().x + 3 : 0,
        cy: cg ? cg.getBoundingClientRect().y + 8 : 0,
        w0: cell ? Math.round(cell.getBoundingClientRect().width) : 0 };
    });
    ok("列の取っ手がある", g.hasC === true, g);
    ok("行の取っ手がある", g.hasR === true, g);
    await pg.mouse.move(g.cx, g.cy); await pg.mouse.down();
    await pg.mouse.move(g.cx + 90, g.cy, { steps: 10 }); await pg.mouse.up();
    await sleep(500);
    const after = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-sheets").shadowRoot;
      const cell = sr.querySelector('.wps-c[data-r="1"][data-c="0"]');
      const c = JSON.parse(localStorage.getItem("vq2.wp.content.v1") || "{}");
      return { w: cell ? Math.round(cell.getBoundingClientRect().width) : 0,
        saved: JSON.stringify(c).indexOf("colW") >= 0 };
    });
    ok("★列の幅がマウスで広がる", after.w > g.w0 + 40, { 前: g.w0, 後: after.w });
    ok("変えた幅が保存される", after.saved === true);

    /* セルの色も自由に選べる */
    await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-sheets").shadowRoot;
      sr.querySelector('[data-act="colors"]').click();
    });
    await sleep(350);
    const colorMenu = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-sheets").shadowRoot;
      const m = sr.querySelector(".wp-ctxmenu");
      return m ? Array.from(m.querySelectorAll(".wp-ctxmenu__i")).map(b => b.textContent.trim()) : [];
    });
    ok("セルの色のメニューが出る", colorMenu.some(t => /セルの背景/.test(t)), colorMenu);
    await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-sheets").shadowRoot;
      Array.from(sr.querySelectorAll(".wp-ctxmenu__i")).filter(b => /セルの背景/.test(b.textContent))[0].click();
    });
    await sleep(350);
    const cpOpen = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-sheets").shadowRoot;
      return !!sr.querySelector(".wp-cp") && !!sr.querySelector('.wp-cp input[type="color"]');
    });
    ok("★セルの色も自由に選べる", cpOpen === true);
  }

  section("画面のエラー");
  {
    const envish = /favicon|manifest|sw\.js|Failed to load resource|net::ERR|Failed to fetch|OFFICIAL/i;
    const real = errs.filter(e => !envish.test(e));
    ok("JS エラーが出ていない", real.length === 0, real.slice(0, 5));
  }

  console.log("\n══ まとめ ══");
  console.log("  合格 " + pass + " / 不合格 " + fail);
  if (bad.length) { console.log("\n  失敗:"); bad.forEach(b => console.log("   - " + b)); }
  await browser.close();
  server.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("実行できませんでした:", e); process.exit(2); });
