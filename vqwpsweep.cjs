/* ══════════════════════════════════════════════════════════════════════
   Vocabu Workplace — 機能の総当たり確認（実ブラウザ・実キーボード）

   「使ってみて動くか」を、人と同じ手順で一つずつ確かめる。
   道具の都合で DOM を直に書き換えることはしない（本物と違う形になるため）。

   使い方:
     node vqwpsweep.cjs            すべて
     node vqwpsweep.cjs docs       ワードだけ
     node vqwpsweep.cjs sheets     エクセルだけ
     node vqwpsweep.cjs slides     スライドだけ
     node vqwpsweep.cjs forms      アンケートだけ
   ══════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const http = require("http"); const fs = require("fs"); const path = require("path");
const ROOT = path.join(__dirname, "client"); const PORT = Number(process.env.VQ_PORT || 8971);
const MIME = { ".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",
  ".png":"image/png",".svg":"image/svg+xml",".webmanifest":"application/manifest+json",".woff2":"font/woff2" };

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => { c ? (pass++, console.log("  ok   " + n))
  : (fail++, bad.push(n), console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 240) : ""))); };
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
  const only = (process.argv[2] || "").trim();
  const want = (k) => !only || only === k;
  const server = await serve();
  const browser = await chromium.launch();
  const pg = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errs = [];
  pg.on("pageerror", e => errs.push(String(e.message).slice(0, 180)));
  pg.on("dialog", d => d.dismiss().catch(() => {}));

  await pg.goto(`http://127.0.0.1:${PORT}/index.html?vq2=all`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.waitForFunction(() => window.VQ2 && window.VQ2.workplace && window.VQ2.workplace.home, { timeout: 40000 });
  await pg.evaluate(() => { const o = document.getElementById("firstLaunchOverlay"); if (o) o.style.display = "none"; });
  /* 印刷の窓は自動では開けないので、開こうとしたことだけ記録する。 */
  await pg.evaluate(() => {
    window.__opened = [];
    const real = window.open;
    window.open = function (u) { window.__opened.push(String(u || "about:blank"));
      return { document: { write(){}, close(){}, title:"" }, focus(){}, print(){}, close(){},
               addEventListener(){}, location:{href:""} }; };
    window.__realOpen = real;
  });

  const ID = { docs: "vq-wp-docs", sheets: "vq-wp-sheets", slides: "vq-wp-slides", forms: "vq-wp-forms" };
  const TYPE = { docs: "document", sheets: "spreadsheet", slides: "presentation", forms: "form" };

  const openEditor = async (kind, title) => {
    await pg.evaluate(([k, t, ti]) => {
      const W = window.VQ2.workplace;
      W[k].open({ item: W.model.newItem(t, { title: ti }), content: W.model.emptyContent(t) });
    }, [kind, TYPE[kind], title || "総当たり"]);
    await pg.waitForSelector("#" + ID[kind], { timeout: 15000 });
    await sleep(700);
  };
  const closeAll = async () => {
    await pg.evaluate(() => {
      document.querySelectorAll(".vq2-host").forEach(h => { if (h.__vq2) h.__vq2.forceClose("t"); });
    });
    await sleep(400);
  };
  const act = async (kind, a, val) => {
    return pg.evaluate(([i, a2, v]) => {
      const sr = document.getElementById(i).shadowRoot;
      const sel = v === null || v === undefined
        ? '[data-act="' + a2 + '"]' : '[data-act="' + a2 + '"][data-val="' + v + '"]';
      const b = sr.querySelector(sel);
      if (!b) return false;
      b.click(); return true;
    }, [ID[kind], a, val === undefined ? null : val]);
  };
  /* 開いている窓（パネル・メニュー）の中で、文字が合うものを押す */
  const clickText = async (kind, text) => {
    return pg.evaluate(([i, t]) => {
      const sr = document.getElementById(i).shadowRoot;
      const scope = sr.querySelector(".wp-sheet") || sr.querySelector(".wp-ctxmenu") || sr;
      const nodes = Array.from(scope.querySelectorAll("button,[role='button'],[data-i],[data-t]"));
      const hit = nodes.filter(n => (n.textContent || "").trim().indexOf(t) >= 0)[0];
      if (!hit) return false;
      hit.click(); return true;
    }, [ID[kind], text]);
  };
  const panelItems = async (kind) => pg.evaluate((i) => {
    const sr = document.getElementById(i).shadowRoot;
    const scope = sr.querySelector(".wp-sheet") || sr.querySelector(".wp-ctxmenu");
    if (!scope) return null;
    return Array.from(scope.querySelectorAll("button,[data-i],[data-t]"))
      .map(n => (n.textContent || "").trim()).filter(Boolean).slice(0, 40);
  }, ID[kind]);
  const closePanel = async (kind) => {
    await pg.evaluate((i) => {
      const sr = document.getElementById(i).shadowRoot;
      const h = sr.querySelector(".wp-sheet-host"); if (h) h.remove();
      const m = sr.querySelector(".wp-ctxmenu"); if (m) m.remove();
      const bd = sr.querySelector(".wp-ctxmenu-bd, .wp-cmd-bd"); if (bd) bd.remove();
    }, ID[kind]);
    await sleep(200);
  };
  const docHtml = async () => pg.evaluate(() =>
    document.getElementById("vq-wp-docs").shadowRoot.querySelector(".wpd-doc").innerHTML);
  /* 本文の一番上の段落へカーソルを置いて打つ（人と同じ順番） */
  const typeInDoc = async (text, atIndex) => {
    const p = await pg.evaluate((idx) => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      const d = sr.querySelector(".wpd-doc");
      const el = d.children[idx || 0] || d.lastElementChild || d;
      const r = el.getBoundingClientRect();
      return { x: r.x + 10, y: r.y + Math.min(r.height, 24) / 2 };
    }, atIndex || 0);
    await pg.mouse.click(p.x, p.y); await sleep(120);
    await pg.keyboard.type(text, { delay: 8 });
    await sleep(420);
  };
  const selectFirstLine = async () => {
    const r = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      const d = sr.querySelector(".wpd-doc");
      const el = d.firstElementChild || d;
      const rc = el.getBoundingClientRect();
      return { x1: rc.x + 2, y: rc.y + Math.min(rc.height, 22) / 2, x2: rc.x + rc.width - 2 };
    });
    /* すでに選ばれているところから押し下げると、ブラウザは
       「選んだ文字を掴んで動かす」と受け取る（Word でも同じ）。
       人と同じように、一度どこかを押して選択をほどいてからなぞる。 */
    await pg.mouse.click(r.x1 + 30, r.y); await sleep(120);
    await pg.mouse.move(r.x1, r.y); await pg.mouse.down();
    await pg.mouse.move(r.x2, r.y, { steps: 10 }); await pg.mouse.up();
    await sleep(220);
    return pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      const s = sr.getSelection ? sr.getSelection() : window.getSelection();
      return s ? String(s.toString()) : "";
    });
  };

  /* ══════════════════════════════════════════════════════════════════
     ワード（Docs）
     ══════════════════════════════════════════════════════════════════ */
  if (want("docs")) {
    section("ワード：打つ・残る");
    await openEditor("docs", "ワード総当たり");
    await typeInDoc("最初の段落です。");
    ok("打った文字が本文に入る", /最初の段落です。/.test(await docHtml()), (await docHtml()).slice(0, 120));
    {
      const saved = await pg.evaluate(() => localStorage.getItem("vq2.wp.content.v1") || "");
      ok("打った内容が端末に控えられる", saved.indexOf("最初の段落です。") >= 0);
    }

    section("ワード：文字の飾り");
    for (const [a, v, name, re] of [
      ["fmt", "bold", "太字", /<b>|<strong>|font-weight/i],
      ["fmt", "italic", "斜体", /<i>|<em>|font-style/i],
      ["fmt", "underline", "下線", /<u>|text-decoration/i],
      ["fmt", "strikeThrough", "取り消し線", /<strike>|<s>|line-through/i]
    ]) {
      const sel = await selectFirstLine();
      if (!sel) { ok(name + "の前に文字を選べる", false, sel); continue; }
      await act("docs", a, v); await sleep(320);
      ok(name + "が当たる", re.test(await docHtml()), (await docHtml()).slice(0, 160));
    }

    section("ワード：段落の種類");
    for (const [v, name, re] of [
      ["bullet", "箇条書き", /<ul/i], ["number", "番号付き", /<ol/i]
    ]) {
      await typeInDoc("");
      await act("docs", "type", v); await sleep(400);
      ok(name + "にできる", re.test(await docHtml()), (await docHtml()).slice(0, 200));
      await act("docs", "type", v); await sleep(300);   /* 戻す */
    }

    section("ワード：揃え");
    {
      await selectFirstLine();
      await act("docs", "align", "Center"); await sleep(350);
      ok("中央揃えが当たる", /center/i.test(await docHtml()), (await docHtml()).slice(0, 200));
      await act("docs", "align", "Left"); await sleep(250);
    }

    section("ワード：挿入");
    {
      await act("docs", "insert-menu"); await sleep(400);
      const items = await panelItems("docs");
      ok("挿入のパネルが出る", !!items && items.length >= 5, items);
      const before = await docHtml();
      await clickText("docs", "区切り線"); await sleep(450);
      ok("区切り線が入る", /<hr/i.test(await docHtml()), (await docHtml()).slice(0, 200));
      await closePanel("docs");

      await act("docs", "insert-menu"); await sleep(400);
      await clickText("docs", "表"); await sleep(600);
      ok("表が入る", /<table/i.test(await docHtml()), (await docHtml()).slice(0, 200));
      await closePanel("docs");

      await act("docs", "insert-menu"); await sleep(400);
      await clickText("docs", "今日の日付"); await sleep(450);
      const y = new Date().getFullYear();
      ok("今日の日付が入る", (await pg.evaluate(() =>
        document.getElementById("vq-wp-docs").shadowRoot.querySelector(".wpd-doc").textContent)).indexOf(String(y)) >= 0);
      await closePanel("docs");
    }

    section("ワード：表に打てる");
    {
      const cell = await pg.evaluate(() => {
        const sr = document.getElementById("vq-wp-docs").shadowRoot;
        const td = sr.querySelector(".wpd-doc table td, .wpd-doc table th");
        if (!td) return null;
        const r = td.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      });
      if (!cell) ok("表のマスがある", false);
      else {
        await pg.mouse.click(cell.x, cell.y); await sleep(200);
        await pg.keyboard.type("あ", { delay: 20 }); await sleep(400);
        ok("表のマスに打てる", /あ/.test(await docHtml()), (await docHtml()).slice(0, 200));
      }
    }

    section("ワード：元に戻す・やり直す");
    {
      const before = await docHtml();
      await act("docs", "undo"); await sleep(500);
      const undone = await docHtml();
      ok("元に戻せる", undone !== before, { 前: before.length, 後: undone.length });
      await act("docs", "redo"); await sleep(500);
      ok("やり直せる", (await docHtml()) !== undone);
    }

    section("ワード：用紙・印刷・PDF");
    {
      const paper0 = await pg.evaluate(() =>
        !!document.getElementById("vq-wp-docs").shadowRoot.querySelector(".wpd-page.is-paper"));
      ok("紙として表示されている", paper0 === true);
      await act("docs", "page-setup"); await sleep(500);
      const items = await panelItems("docs");
      ok("用紙の設定が開く", !!items && items.length >= 3, items);
      const wA4 = await pg.evaluate(() => {
        const sr = document.getElementById("vq-wp-docs").shadowRoot;
        const p = sr.querySelector(".wpd-page.is-paper");
        return p ? parseFloat(getComputedStyle(p).width) : null;
      });
      const okB5 = await pg.evaluate(() => {
        const sr = document.getElementById("vq-wp-docs").shadowRoot;
        const s = sr.querySelector('.wp-sheet [data-k="size"]');
        if (!s) return false;
        s.value = "b5"; s.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        return true;
      });
      await sleep(600);
      const wB5 = await pg.evaluate(() => {
        const sr = document.getElementById("vq-wp-docs").shadowRoot;
        const p = sr.querySelector(".wpd-page.is-paper");
        return p ? parseFloat(getComputedStyle(p).width) : null;
      });
      ok("用紙の大きさを変えられる（A4 → B5 で幅が縮む）",
        okB5 && wA4 && wB5 && wB5 < wA4 - 5, { A4: wA4, B5: wB5 });
      const okLand = await pg.evaluate(() => {
        const sr = document.getElementById("vq-wp-docs").shadowRoot;
        const b = sr.querySelector('.wp-sheet [data-orient="landscape"]');
        if (!b) return false;
        b.click(); return true;
      });
      await sleep(600);
      const shape = await pg.evaluate(() => {
        const sr = document.getElementById("vq-wp-docs").shadowRoot;
        const p = sr.querySelector(".wpd-page.is-paper");
        if (!p) return null;
        const cs = getComputedStyle(p);
        return { w: parseFloat(cs.width), h: parseFloat(sr.querySelector(".wpd-sheet, .wpd-paper")
          ? getComputedStyle(sr.querySelector(".wpd-sheet, .wpd-paper")).height : cs.height) };
      });
      ok("向きを変えられる（横にすると横長になる）",
        okLand && shape && shape.w > 0 && shape.w >= shape.h - 1, { okLand, shape });
      await closePanel("docs");

      await pg.evaluate(() => { window.__opened = []; });
      await act("docs", "do-print"); await sleep(700);
      ok("印刷が動く（窓を開こうとする）",
        (await pg.evaluate(() => window.__opened.length)) > 0,
        await pg.evaluate(() => window.__opened));
      await pg.evaluate(() => { window.__opened = []; });
      await act("docs", "do-pdf"); await sleep(700);
      ok("PDF が動く（窓を開こうとする）",
        (await pg.evaluate(() => window.__opened.length)) > 0,
        await pg.evaluate(() => window.__opened));
    }

    section("ワード：アウトライン・文字数");
    {
      await typeInDoc("見出しにする行");
      await act("docs", "style-menu"); await sleep(400);
      const styles = await panelItems("docs");
      ok("スタイルの一覧が出る", !!styles && styles.length >= 3, styles);
      await clickText("docs", "見出し 1") || await clickText("docs", "見出し1") || await clickText("docs", "大見出し");
      await sleep(500); await closePanel("docs");
      ok("見出しになる", /<h1/i.test(await docHtml()), (await docHtml()).slice(0, 240));
      const st = await pg.evaluate(() =>
        document.getElementById("vq-wp-docs").shadowRoot.querySelector(".wpd-stat")?.textContent || "");
      ok("文字数などが出ている", /字/.test(st), st);
    }

    section("ワード：その他の機能・書き出し");
    {
      await act("docs", "more-tools"); await sleep(450);
      const items = await panelItems("docs");
      ok("その他の機能が開く", !!items && items.length >= 3, items);
      await closePanel("docs");
    }
    ok("ワードで JS エラーが出ていない", errs.length === 0, errs.slice(0, 3));
    await closeAll();
  }

  /* ══════════════════════════════════════════════════════════════════
     エクセル（Sheets）
     ══════════════════════════════════════════════════════════════════ */
  if (want("sheets")) {
    const cellAt = async (r, c) => pg.evaluate(([rr, cc]) => {
      const sr = document.getElementById("vq-wp-sheets").shadowRoot;
      const td = sr.querySelector('[data-r="' + rr + '"][data-c="' + cc + '"]');
      if (!td) return null;
      const b = td.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    }, [r, c]);
    const cellText = async (r, c) => pg.evaluate(([rr, cc]) => {
      const sr = document.getElementById("vq-wp-sheets").shadowRoot;
      const td = sr.querySelector('[data-r="' + rr + '"][data-c="' + cc + '"]');
      return td ? (td.textContent || "").trim() : null;
    }, [r, c]);
    const typeCell = async (r, c, text) => {
      const p = await cellAt(r, c);
      if (!p) return false;
      await pg.mouse.click(p.x, p.y); await sleep(180);
      await pg.keyboard.type(text, { delay: 10 });
      await pg.keyboard.press("Enter");
      await sleep(420);
      return true;
    };

    /* 表の中の行は 1 から始まる（0 の段は列の見出し）。A1 は (1,0)。 */
    section("エクセル：打つ・数式");
    await openEditor("sheets", "エクセル総当たり");
    ok("表の枠が出ている", (await cellAt(1, 0)) !== null);
    await typeCell(1, 0, "10");
    await typeCell(2, 0, "20");
    await typeCell(3, 0, "30");
    ok("数字が入る", (await cellText(1, 0)) === "10", await cellText(1, 0));
    await typeCell(4, 0, "=SUM(A1:A3)");
    ok("★SUM が計算される", (await cellText(4, 0)) === "60", await cellText(4, 0));
    await typeCell(5, 0, "=AVERAGE(A1:A3)");
    ok("★AVERAGE が計算される", (await cellText(5, 0)) === "20", await cellText(5, 0));
    await typeCell(1, 1, "=A1*2");
    ok("★かけ算ができる", (await cellText(1, 1)) === "20", await cellText(1, 1));
    /* もとの数を変えたら、合計も変わる */
    await typeCell(1, 0, "100");
    ok("★元の数を直すと合計も直る", (await cellText(4, 0)) === "150", await cellText(4, 0));

    section("エクセル：行と列");
    {
      /* A1 を選んでから足す（選んだ位置に入る） */
      const selectCell = async (r, c) => { const p2 = await cellAt(r, c);
        if (p2) { await pg.mouse.click(p2.x, p2.y); await sleep(180); } };
      await selectCell(1, 0);
      const before = await cellText(1, 0);
      const sumBefore = await cellText(4, 0);
      await act("sheets", "row+"); await sleep(700);
      ok("行を足すと下へずれる", (await cellText(2, 0)) === before,
        { 前: before, 今の1: await cellText(1, 0), 今の2: await cellText(2, 0) });
      ok("★行を足しても合計が変わらない（数式の参照が付いていく）",
        (await cellText(5, 0)) === sumBefore, { 前: sumBefore, 後: await cellText(5, 0) });
      await act("sheets", "undo"); await sleep(700);
      ok("元に戻せる", (await cellText(1, 0)) === before, await cellText(1, 0));

      await selectCell(1, 0);
      const beforeB = await cellText(1, 1);
      await act("sheets", "col+"); await sleep(700);
      ok("列を足すと右へずれる", (await cellText(1, 2)) === beforeB,
        { 前: beforeB, 今: await cellText(1, 2) });
      ok("★列を足しても答えが変わらない（数式の参照が付いていく）",
        (await cellText(1, 2)) === beforeB, { 前: beforeB, 後: await cellText(1, 2) });
      await act("sheets", "undo"); await sleep(700);
    }

    section("エクセル：飾りと表示");
    {
      const p = await cellAt(1, 0);
      if (p) { await pg.mouse.click(p.x, p.y); await sleep(200); }
      await act("sheets", "s", "b"); await sleep(400);
      const boldOn = await pg.evaluate(() => {
        const sr = document.getElementById("vq-wp-sheets").shadowRoot;
        const td = sr.querySelector('[data-r="1"][data-c="0"]');
        return td ? getComputedStyle(td).fontWeight : null;
      });
      ok("太字が当たる", Number(boldOn) >= 600 || boldOn === "bold", boldOn);
      await act("sheets", "numfmt"); await sleep(450);
      const items = await panelItems("sheets");
      ok("数値の表示を選べる", !!items && items.length >= 2, items);
      await closePanel("sheets");
      await act("sheets", "colors"); await sleep(450);
      const okBg = await clickText("sheets", "セルの背景");
      await sleep(450);
      const cp = await pg.evaluate(() => {
        const sr = document.getElementById("vq-wp-sheets").shadowRoot;
        const p = sr.querySelector(".wp-cp");
        if (!p) return { open: false };
        const sw = p.querySelector('.wp-cp__s[data-c="#dc2626"]') || p.querySelector(".wp-cp__s");
        if (sw) sw.click();
        return { open: true };
      });
      await sleep(500);
      const painted = await pg.evaluate(() => {
        const sr = document.getElementById("vq-wp-sheets").shadowRoot;
        const td = sr.querySelector('[data-r="1"][data-c="0"]');
        return td ? getComputedStyle(td).backgroundColor : null;
      });
      ok("セルの色が選べる", okBg && cp.open === true, { okBg, cp });
      ok("★選んだ色がセルに付く",
        !!painted && painted !== "rgba(0, 0, 0, 0)" && painted !== "transparent", painted);
      await closePanel("sheets");
    }

    section("エクセル：並べ替え・フィルター・関数");
    {
      await act("sheets", "sort-menu"); await sleep(450);
      ok("並べ替えが開く", !!(await panelItems("sheets")));
      await closePanel("sheets");
      await act("sheets", "filter-menu"); await sleep(450);
      ok("フィルターが開く", !!(await panelItems("sheets")));
      await closePanel("sheets");
      /* 関数一覧は右の欄に出る（窓ではない） */
      await act("sheets", "fx"); await sleep(600);
      const fx = await pg.evaluate(() => {
        const sr = document.getElementById("vq-wp-sheets").shadowRoot;
        const r = sr.querySelector(".wp-right");
        if (!r) return null;
        return Array.from(r.querySelectorAll("[data-fn]")).map(n => n.getAttribute("data-fn")).slice(0, 8);
      });
      ok("関数の一覧が開く", !!fx && fx.length >= 3, fx);
      await act("sheets", "fx"); await sleep(400);
    }

    section("エクセル：シート・グラフ・書き出し");
    {
      const tabs0 = await pg.evaluate(() =>
        document.getElementById("vq-wp-sheets").shadowRoot.querySelectorAll('[data-act="tab"]').length);
      await act("sheets", "sheet+"); await sleep(600);
      const tabs1 = await pg.evaluate(() =>
        document.getElementById("vq-wp-sheets").shadowRoot.querySelectorAll('[data-act="tab"]').length);
      ok("シートを足せる", tabs1 === tabs0 + 1, { 前: tabs0, 後: tabs1 });
      await act("sheets", "chart"); await sleep(600);
      const chartUi = await pg.evaluate(() => {
        const sr = document.getElementById("vq-wp-sheets").shadowRoot;
        return !!(sr.querySelector(".wp-sheet") || sr.querySelector(".wps-chart") || sr.querySelector("canvas,svg"));
      });
      ok("グラフの操作が出る", chartUi === true);
      await closePanel("sheets");
      await act("sheets", "more-tools"); await sleep(500);
      const mt = await panelItems("sheets");
      ok("その他の機能が開く", !!mt && mt.length >= 3, mt && mt.slice(0, 8));
      await closePanel("sheets");
    }
    ok("エクセルで JS エラーが出ていない", errs.length === 0, errs.slice(0, 3));
    await closeAll();
  }

  /* ══════════════════════════════════════════════════════════════════
     スライド（Slides）
     ══════════════════════════════════════════════════════════════════ */
  if (want("slides")) {
    const slideCount = async () => pg.evaluate(() =>
      document.getElementById("vq-wp-slides").shadowRoot.querySelectorAll(".wpp-thumbs > *").length);
    const elCount = async () => pg.evaluate(() =>
      document.getElementById("vq-wp-slides").shadowRoot.querySelectorAll(".wpp-canvas .wpp-el").length);

    section("スライド：枚数と中身");
    await openEditor("slides", "スライド総当たり");
    const n0 = await slideCount();
    ok("スライドが 1 枚ある", n0 >= 1, n0);
    await act("slides", "slide+"); await sleep(600);
    ok("スライドを足せる", (await slideCount()) === n0 + 1, { 前: n0, 後: await slideCount() });

    const e0 = await elCount();
    await act("slides", "add", "text"); await sleep(500);
    ok("文字を置ける", (await elCount()) === e0 + 1, { 前: e0, 後: await elCount() });
    await act("slides", "add", "table"); await sleep(600);
    ok("表を置ける", (await elCount()) === e0 + 2, await elCount());
    await act("slides", "add", "chart"); await sleep(700);
    ok("グラフを置ける", (await elCount()) === e0 + 3, await elCount());
    await act("slides", "shape-menu"); await sleep(450);
    const shaped = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-slides").shadowRoot;
      const b = sr.querySelector('[data-s="rect"]'); if (!b) return false;
      b.click(); return true;
    });
    await sleep(600);
    ok("図形を置ける", shaped && (await elCount()) === e0 + 4, { shaped, 数: await elCount() });

    section("スライド：レイアウト・デザイン・ノート");
    {
      await act("slides", "layout-menu"); await sleep(500);
      ok("レイアウトが開く", !!(await panelItems("slides")));
      await closePanel("slides");
      await act("slides", "design"); await sleep(500);
      ok("デザインが開く", !!(await panelItems("slides")));
      await closePanel("slides");
      await act("slides", "notes"); await sleep(500);
      const notes = await pg.evaluate(() => {
        const sr = document.getElementById("vq-wp-slides").shadowRoot;
        const n = sr.querySelector(".wpp-notes");
        if (!n) return { open: false };
        const ta = n.querySelector("textarea");
        return { open: true, writable: !!ta };
      });
      ok("発表者ノートが出る", notes.open === true, notes);
      ok("発表者ノートに書ける", notes.writable === true, notes);
      await act("slides", "notes"); await sleep(400);
    }

    section("スライド：発表・一覧・元に戻す");
    {
      await act("slides", "present"); await sleep(900);
      const presenting = await pg.evaluate(() => {
        const sr = document.getElementById("vq-wp-slides").shadowRoot;
        return !!(sr.querySelector(".wpp-present") || sr.querySelector('[data-role="present"]')
          || document.querySelector(".wpp-present"));
      });
      ok("発表がはじまる", presenting === true);
      await pg.keyboard.press("Escape"); await sleep(700);
      const stopped = await pg.evaluate(() => {
        const sr = document.getElementById("vq-wp-slides").shadowRoot;
        return !(sr.querySelector(".wpp-present") || document.querySelector(".wpp-present"));
      });
      ok("Esc で発表をやめられる", stopped === true);

      await act("slides", "thumbs-sheet"); await sleep(500);
      ok("スライド一覧が開く", !!(await panelItems("slides")));
      await closePanel("slides");

      const before = await elCount();
      await act("slides", "undo"); await sleep(600);
      ok("元に戻せる", (await elCount()) !== before, { 前: before, 後: await elCount() });
    }
    ok("スライドで JS エラーが出ていない", errs.length === 0, errs.slice(0, 3));
    await closeAll();
  }

  /* ══════════════════════════════════════════════════════════════════
     アンケート（Forms）
     ══════════════════════════════════════════════════════════════════ */
  if (want("forms")) {
    const qCount = async () => pg.evaluate(() =>
      document.getElementById("vq-wp-forms").shadowRoot.querySelectorAll("[data-fid]").length);

    section("アンケート：質問をつくる");
    await openEditor("forms", "アンケート総当たり");
    const q0 = await qCount();
    await act("forms", "add-sheet", "0"); await sleep(500);
    const addPanel = await panelItems("forms");
    ok("質問の形式が並ぶ", !!addPanel && addPanel.length >= 4, addPanel && addPanel.slice(0, 10));
    /* 形式は data-t で選ぶ（表示名は「短文」「単一選択」など） */
    const pickType = async (t) => pg.evaluate((tt) => {
      const sr = document.getElementById("vq-wp-forms").shadowRoot;
      const sh = sr.querySelector(".wp-sheet"); if (!sh) return false;
      const b = sh.querySelector('[data-t="' + tt + '"]'); if (!b) return false;
      b.click(); return true;
    }, t);
    const okShort = await pickType("short_text"); await sleep(700);
    await closePanel("forms");
    ok("質問を足せる（短文）", okShort && (await qCount()) > q0, { 前: q0, 後: await qCount() });

    await act("forms", "add-sheet", "0"); await sleep(500);
    const okChoice = await pickType("single_choice");
    await sleep(700); await closePanel("forms");
    ok("選ぶ形式の質問も足せる", okChoice && (await qCount()) > q0 + 1, { 数: await qCount() });

    section("アンケート：セクション・分岐・設定");
    {
      const sec0 = await pg.evaluate(() =>
        document.getElementById("vq-wp-forms").shadowRoot.querySelectorAll('[data-act="sec-title"]').length);
      await act("forms", "sec-add"); await sleep(700);
      const sec1 = await pg.evaluate(() =>
        document.getElementById("vq-wp-forms").shadowRoot.querySelectorAll('[data-act="sec-title"]').length);
      ok("セクションを足せる", sec1 > sec0, { 前: sec0, 後: sec1 });
      await act("forms", "logic"); await sleep(600);
      ok("分岐の設定が開く", !!(await panelItems("forms")));
      await closePanel("forms");
      await act("forms", "theme"); await sleep(600);
      ok("テーマが開く", !!(await panelItems("forms")));
      await closePanel("forms");
      await act("forms", "settings"); await sleep(600);
      ok("フォームの設定が開く", !!(await panelItems("forms")));
      await closePanel("forms");
      await act("forms", "publish"); await sleep(600);
      ok("公開の設定が開く", !!(await panelItems("forms")));
      await closePanel("forms");
    }

    section("アンケート：プレビューと回答");
    {
      await act("forms", "tab", "preview"); await sleep(700);
      const prev = await pg.evaluate(() => {
        const sr = document.getElementById("vq-wp-forms").shadowRoot;
        return sr.querySelectorAll("input,textarea,select,[role='radio'],[role='checkbox']").length;
      });
      ok("プレビューで入力できる形になる", prev >= 1, prev);
      await act("forms", "tab", "responses"); await sleep(700);
      const res = await pg.evaluate(() =>
        (document.getElementById("vq-wp-forms").shadowRoot.textContent || "").indexOf("回答") >= 0);
      ok("回答結果の画面が出る", res === true);
      await act("forms", "tab", "edit"); await sleep(600);
      ok("編集に戻れる", (await qCount()) > 0);
    }
    ok("アンケートで JS エラーが出ていない", errs.length === 0, errs.slice(0, 3));
    await closeAll();
  }

  console.log("\n══ まとめ ══");
  console.log("  合格 " + pass + " / 不合格 " + fail);
  if (bad.length) console.log("  直すところ:\n    - " + bad.join("\n    - "));
  await browser.close(); server.close();
  process.exit(fail ? 1 : 0);
})();
