/* ══════════════════════════════════════════════════════════════════════
   Vocabu Workplace — 直接の操作の確認（実マウス・実キーボード）

   利用者から挙がった 4 点を、**画面を実際に触る手順で**確かめる。
   ・スライドを掴んで動かせるか（選んでいない要素を最初に掴んだ場合も）
   ・Docs / Slides / Sheets へ直接文字を打てるか（日本語の変換も）
   ・右クリックで操作できるか
   ・文字の色を変えられるか（文字を選ぶ → ツールバーを押す、という本物の順番で）

   使い方: node vqwpinput.cjs
   ══════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const http = require("http"); const fs = require("fs"); const path = require("path");
const ROOT = path.join(__dirname, "client"); const PORT = Number(process.env.VQ_PORT || 8984);
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

  async function boot() {
    await pg.goto(`http://127.0.0.1:${PORT}/index.html?vq2=all`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await pg.waitForFunction(() => window.VQ2 && window.VQ2.workplace && window.VQ2.workplace.home, { timeout: 40000 });
    await pg.evaluate(() => { const o = document.getElementById("firstLaunchOverlay"); if (o) o.style.display = "none"; });
  }
  const openEditor = async (kind, id) => {
    await pg.evaluate((k) => {
      const W = window.VQ2.workplace;
      W[k].open({ item: W.model.newItem(k === "docs" ? "document" : k === "sheets" ? "spreadsheet"
        : k === "slides" ? "presentation" : "form", { title: "入力テスト" }),
        content: W.model.emptyContent(k === "docs" ? "document" : k === "sheets" ? "spreadsheet"
          : k === "slides" ? "presentation" : "form") });
    }, kind);
    await pg.waitForSelector("#" + id, { timeout: 15000 });
    await sleep(500);
  };
  const close = async (id) => {
    await pg.evaluate((i) => { const h = document.getElementById(i);
      if (h) h.shadowRoot.querySelector('[data-act="close"]').click(); }, id);
    await sleep(700);
    await pg.evaluate(() => {
      document.querySelectorAll(".vq2-host").forEach(h => { if (h.__vq2) h.__vq2.forceClose("t"); });
    });
    await sleep(300);
  };

  await boot();

  /* ══ ① スライド：掴んで動かす ══════════════════════════════ */
  section("スライド：掴んで動かせる（選んでいない要素も）");
  await openEditor("slides", "vq-wp-slides");
  {
    /* テキストを 2 つ置き、2 つ目を選んだ状態にしてから **1 つ目** を掴む。
       これが前は動かなかった条件。 */
    await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-slides").shadowRoot;
      sr.querySelector('[data-act="add"][data-val="text"]').click();
    });
    await sleep(350);
    await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-slides").shadowRoot;
      sr.querySelector('[data-act="add"][data-val="shape"]')
        || sr.querySelector('[data-act="shape-menu"]').click();
    });
    await sleep(350);
    await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-slides").shadowRoot;
      const b = sr.querySelector('[data-s="rect"]'); if (b) b.click();
    });
    await sleep(400);
    /* 2 つが同じ場所に重なるので、図形のほうを右下へどけてから掴む。 */
    await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-slides").shadowRoot;
      const setN = (act, v) => {
        const n = sr.querySelector('[data-act="' + act + '"]');
        n.value = String(v);
        n.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      };
      setN("el-x", 640); setN("el-y", 340);
    });
    await sleep(400);
    const info = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-slides").shadowRoot;
      const els = Array.from(sr.querySelectorAll(".wpp-canvas .wpp-el"));
      const sel = sr.querySelector(".wpp-canvas .wpp-el.is-sel");
      const target = els.filter(e => e !== sel)[0] || els[0];
      const r = target.getBoundingClientRect();
      /* 2 つが重なっていると、狙った相手を掴めない。
         重なっていない場所（左端の少し内側）を掴む点にする。 */
      const px = r.x + 8, py = r.y + r.height / 2;
      const top = sr.elementFromPoint ? sr.elementFromPoint(px, py) : null;
      const topEl = top && top.closest ? top.closest("[data-el]") : null;
      return { count: els.length, selId: sel && sel.getAttribute("data-el"),
        targetId: target.getAttribute("data-el"),
        underPointer: topEl ? topEl.getAttribute("data-el") : null,
        x: px, y: py, left: target.style.left, top: target.style.top };
    });
    /* 新しいスライドは、選んだレイアウトの枠（見出しなど）が最初から入っている。
       そこへテキストと図形を足すので、2 つ以上あれば足せている。 */
    ok("要素を足せる", info.count >= 2, info);
    ok("掴む相手は「選ばれていない方」", info.targetId !== info.selId, info);
    ok("掴む点に、狙った要素がいちばん上にある",
      info.underPointer === info.targetId, info);
    await pg.mouse.move(info.x, info.y);
    await pg.mouse.down();
    await pg.mouse.move(info.x + 140, info.y + 90, { steps: 12 });
    await sleep(150);
    const mid = await pg.evaluate((id) => {
      const sr = document.getElementById("vq-wp-slides").shadowRoot;
      const n = sr.querySelector('[data-el="' + id + '"]');
      const ro = sr.querySelector(".wpp-readout");
      return { left: n.style.left, top: n.style.top,
        readout: ro && !ro.hidden ? ro.textContent : null };
    }, info.targetId);
    ok("ドラッグ中にその場で動く", mid.left !== info.left || mid.top !== info.top,
      { 前: info.left + "," + info.top, 中: mid.left + "," + mid.top });
    ok("動かしながら位置と大きさが出る", !!mid.readout && /X \d+/.test(mid.readout), mid.readout);
    await pg.mouse.up();
    await sleep(400);
    const after = await pg.evaluate((id) => {
      const W = window.VQ2.workplace;
      const sr = document.getElementById("vq-wp-slides").shadowRoot;
      const n = sr.querySelector('[data-el="' + id + '"]');
      const num = sr.querySelector('[data-act="el-x"]');
      return { left: n.style.left, top: n.style.top, panelX: num ? num.value : null };
    }, info.targetId);
    ok("離した位置がそのまま残る", after.left === mid.left && after.top === mid.top, { mid, after });
    ok("右のパネルの数値も合っている",
      after.panelX !== null && Math.abs(Number(after.panelX) - parseInt(after.left, 10)) <= 1,
      after);
  }

  /* ══ ② スライド：キャンバスに直接打つ ══════════════════════ */
  section("スライド：キャンバスの上に直接文字を打てる");
  {
    const pos = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-slides").shadowRoot;
      const t = Array.from(sr.querySelectorAll(".wpp-canvas .wpp-el"))
        .filter(e => e.querySelector(".wpp-el__t"))[0];
      const r = t.getBoundingClientRect();
      /* 図形と重ならない左端の少し内側を狙う */
      return { id: t.getAttribute("data-el"), x: r.x + 8, y: r.y + r.height / 2 };
    });
    await pg.mouse.dblclick(pos.x, pos.y);
    await sleep(400);
    const editable = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-slides").shadowRoot;
      const n = sr.querySelector(".wpp-el__t.is-editing");
      return { editing: !!n, focused: sr.activeElement === n };
    });
    ok("二重クリックで打てる状態になる", editable.editing === true, editable);
    await pg.keyboard.press("Control+A");
    await pg.keyboard.type("直接うった文字", { delay: 12 });
    await sleep(300);
    const typed = await pg.evaluate((id) => {
      const sr = document.getElementById("vq-wp-slides").shadowRoot;
      const n = sr.querySelector('[data-el="' + id + '"] .wpp-el__t');
      return { shown: n.textContent };
    }, pos.id);
    ok("打った文字がキャンバスに出る", /直接うった文字/.test(typed.shown), typed);
    await pg.keyboard.press("Escape");
    await sleep(400);
    const saved = await pg.evaluate(() => {
      const c = JSON.parse(localStorage.getItem("vq2.wp.content.v1") || "{}");
      return JSON.stringify(c).indexOf("直接うった文字") >= 0;
    });
    ok("打った文字が保存されている", saved === true);
  }

  /* ══ ③ スライド：右クリック ════════════════════════════════ */
  section("スライド：右クリックで操作できる");
  {
    const pos = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-slides").shadowRoot;
      const t = sr.querySelector(".wpp-canvas .wpp-el");
      const r = t.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await pg.mouse.click(pos.x, pos.y, { button: "right" });
    await sleep(350);
    const menu = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-slides").shadowRoot;
      const m = sr.querySelector(".wp-ctxmenu");
      return { open: !!m, items: m ? Array.from(m.querySelectorAll(".wp-ctxmenu__i")).map(b => b.textContent.trim()) : [] };
    });
    ok("要素の上で右クリック → メニューが出る", menu.open === true, menu);
    ok("削除・複製・最前面などが並ぶ",
      menu.items.some(t => /削除/.test(t)) && menu.items.some(t => /複製/.test(t))
      && menu.items.some(t => /最前面/.test(t)), menu.items);
    /* 実際に押して動くか */
    const before = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-slides").shadowRoot;
      return sr.querySelectorAll(".wpp-canvas .wpp-el").length;
    });
    await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-slides").shadowRoot;
      const b = Array.from(sr.querySelectorAll(".wp-ctxmenu__i")).filter(x => /複製する/.test(x.textContent))[0];
      if (b) b.click();
    });
    await sleep(400);
    const nAfter = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-slides").shadowRoot;
      return sr.querySelectorAll(".wpp-canvas .wpp-el").length;
    });
    ok("メニューの項目が実際に動く（複製で 1 つ増える）", nAfter === before + 1, { before, nAfter });

    /* 何も無いところの右クリック */
    const empty = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-slides").shadowRoot;
      const cv = sr.querySelector(".wpp-canvas").getBoundingClientRect();
      return { x: cv.x + cv.width - 30, y: cv.y + cv.height - 30 };
    });
    await pg.mouse.click(empty.x, empty.y, { button: "right" });
    await sleep(350);
    const m2 = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-slides").shadowRoot;
      const m = sr.querySelector(".wp-ctxmenu");
      return m ? Array.from(m.querySelectorAll(".wp-ctxmenu__i")).map(b => b.textContent.trim()) : [];
    });
    ok("何も無いところでも右クリックで作れる", m2.some(t => /ここにテキストを置く/.test(t)), m2);
    await pg.keyboard.press("Escape");
  }
  await close("vq-wp-slides");

  /* ══ ④ Docs：文字の色 ══════════════════════════════════════ */
  section("Docs：文字を選んでツールバーから色を変えられる");
  await openEditor("docs", "vq-wp-docs");
  {
    /* 人と同じように、段落の中へキーボードで打つ。
       textContent を直に入れると段落（<p>）ごと消えてしまい、
       本物の使い方と違う形になる。 */
    {
      const start = await pg.evaluate(() => {
        const sr = document.getElementById("vq-wp-docs").shadowRoot;
        const d = sr.querySelector(".wpd-doc, .wpd-b__c");
        const p = d.firstElementChild || d;
        const rc = p.getBoundingClientRect();
        return { x: rc.x + 10, y: rc.y + 10 };
      });
      await pg.mouse.click(start.x, start.y); await sleep(150);
      await pg.keyboard.type("この文字の色を変えたい", { delay: 12 });
    }
    await sleep(450);
    /* 実際のマウスで文字を選ぶ */
    const r = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      const _d = sr.querySelector(".wpd-doc, .wpd-b__c");
      /* 本文は 1 枚の続き物。真ん中は空白なので、文字のある最初の行を掴む。 */
      const c = (_d.firstElementChild || _d).getBoundingClientRect();
      return { x1: c.x + 4, y: c.y + Math.min(c.height, 22) / 2, x2: c.x + c.width - 4 };
    });
    await pg.mouse.move(r.x1, r.y); await pg.mouse.down();
    await pg.mouse.move(r.x2, r.y, { steps: 8 }); await pg.mouse.up();
    await sleep(250);
    const hadSel = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      const s = sr.getSelection ? sr.getSelection() : window.getSelection();
      return s && s.rangeCount ? String(s.toString()) : "";
    });
    ok("マウスで文字を選べる", hadSel.length > 3, hadSel);

    /* ツールバーの「色」を押す（ここで選択が消えるのが前の不具合） */
    await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      sr.querySelector('[data-act="color-menu"]').click();
    });
    await sleep(350);
    /* 色は 1 段で開く（途中の「文字の色 / 背景」を選ばせる段は無くしてある）。 */
    const menu1 = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      const p = sr.querySelector(".wp-cp");
      return p ? Array.from(p.querySelectorAll(".wp-cp__seg .wp-seg__b")).map(b => b.textContent.trim()) : [];
    });
    ok("色の窓に「文字の色」が出る", menu1.some(t => /文字の色/.test(t)), menu1);
    const pop = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      const p = sr.querySelector(".wp-cp");
      return { open: !!p, swatches: p ? p.querySelectorAll(".wp-cp__s").length : 0,
        note: p ? p.textContent.slice(0, 40) : "" };
    });
    ok("色の小窓が出る", pop.open && pop.swatches >= 8, pop);
    ok("選んだ文字に当たると出ている", /選んだ文字に当てます/.test(pop.note), pop.note);
    await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      sr.querySelector('.wp-cp__s[data-c="#dc2626"]').click();
    });
    await sleep(350);
    const colored = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      const c = sr.querySelector(".wpd-doc, .wpd-b__c");
      const saved = JSON.parse(localStorage.getItem("vq2.wp.content.v1") || "{}");
      return { html: c.innerHTML.slice(0, 200),
        colored: /dc2626|rgb\(220, 38, 38\)/i.test(c.innerHTML),
        inSave: JSON.stringify(saved).indexOf("dc2626") >= 0 };
    });
    ok("★文字の色が実際に変わる", colored.colored === true, colored.html);
    ok("色が保存にも入る", colored.inSave === true, colored.inSave);

    /* 太字。色を当てたあとは中身が入れ替わっているので、座標を取り直して選ぶ。 */
    const r2 = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      const _d = sr.querySelector(".wpd-doc, .wpd-b__c");
      /* 本文は 1 枚の続き物。真ん中は空白なので、文字のある最初の行を掴む。 */
      const c = (_d.firstElementChild || _d).getBoundingClientRect();
      return { x1: c.x + 4, y: c.y + Math.min(c.height, 22) / 2, x2: c.x + c.width - 4 };
    });
    /* 人の手つきに合わせる。書式を当てた直後は中身の要素が入れ替わっているので、
       いきなり押し下げると、入れ替わる前の要素を掴んだ扱いになって選択が始まらない
       （自動操作でだけ起きる。人は必ず一度どこかを押している）。 */
    await pg.mouse.move(r2.x1 + 30, r2.y); await sleep(60);
    await pg.mouse.click(r2.x1 + 30, r2.y); await sleep(120);
    await pg.mouse.move(r2.x1, r2.y); await sleep(60); await pg.mouse.down();
    await pg.mouse.move(r2.x2, r2.y, { steps: 8 }); await pg.mouse.up();
    await sleep(250);
    const selBeforeBold = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      const s = sr.getSelection ? sr.getSelection() : window.getSelection();
      return { text: s && s.rangeCount ? String(s.toString()) : "", collapsed: s ? s.isCollapsed : null };
    });
    ok("色を当てたあとでも文字を選び直せる", selBeforeBold.text.length > 3, selBeforeBold);
    await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      sr.querySelector('[data-act="fmt"][data-val="bold"]').click();
    });
    await sleep(300);
    const bolded = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      return sr.querySelector(".wpd-doc, .wpd-b__c").innerHTML;
    });
    ok("★太字もツールバーから効く", /<b>|<strong>|font-weight/i.test(bolded), bolded.slice(0, 160));
  }

  section("Docs：右クリックで操作できる");
  {
    const r = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      const _d = sr.querySelector(".wpd-doc, .wpd-b__c");
      /* 本文は 1 枚の続き物。真ん中は空白なので、文字のある最初の行を掴む。 */
      const c = (_d.firstElementChild || _d).getBoundingClientRect();
      return { x: c.x + 20, y: c.y + Math.min(c.height, 22) / 2 };
    });
    await pg.mouse.click(r.x, r.y, { button: "right" });

    await sleep(350);
    const menu = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      const m = sr.querySelector(".wp-ctxmenu");
      return m ? Array.from(m.querySelectorAll(".wp-ctxmenu__i")).map(b => b.textContent.trim()) : [];
    });
    ok("文章の上で右クリック → メニューが出る", menu.length > 5, menu.slice(0, 6));
    ok("色・スタイル・削除がある",
      menu.some(t => /文字色/.test(t)) && menu.some(t => /スタイル/.test(t))
      && menu.some(t => /削除/.test(t)), menu);
    await pg.keyboard.press("Escape");
  }
  await close("vq-wp-docs");

  /* ══ ⑤ Sheets：直接入力 ════════════════════════════════════ */
  section("Sheets：セルを押してすぐ打てる（日本語も）");
  await openEditor("sheets", "vq-wp-sheets");
  {
    const c = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-sheets").shadowRoot;
      const cell = sr.querySelector('.wps-c[data-r="2"][data-c="1"]');
      const r = cell.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await pg.mouse.click(c.x, c.y);
    await sleep(250);
    const focused = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-sheets").shadowRoot;
      const g = sr.querySelector(".wps-ghost");
      return { hasGhost: !!g, focused: sr.activeElement === g };
    });
    ok("セルを押すと入力の受け口が用意される", focused.hasGhost && focused.focused, focused);

    await pg.keyboard.type("123", { delay: 25 });
    await sleep(200);
    const live = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-sheets").shadowRoot;
      const g = sr.querySelector(".wps-ghost");
      return { live: g.classList.contains("is-live"), value: g.value };
    });
    ok("押してすぐ打てる（入力欄が出る）", live.live === true && live.value === "123", live);
    await pg.keyboard.press("Enter");
    await sleep(300);
    const val = await pg.evaluate(() => {
      const W = window.VQ2.workplace;
      const c = JSON.parse(localStorage.getItem("vq2.wp.content.v1") || "{}");
      const items = JSON.parse(localStorage.getItem("vq2.wp.items.v1") || "[]");
      const it = items.filter(i => i.itemType === "spreadsheet")[0];
      const cells = c[it.id].content.sheets[0].cells;
      return cells.B2 ? cells.B2.v : null;
    });
    ok("打った値がセルに入る", val === 123, val);

    /* 日本語（変換）を模した経路：composition イベント → input */
    const jp = await pg.evaluate(async () => {
      const sr = document.getElementById("vq-wp-sheets").shadowRoot;
      const g = sr.querySelector(".wps-ghost");
      g.focus();
      g.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, composed: true }));
      g.value = "にほんご";
      g.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
      await new Promise(r => setTimeout(r, 80));
      const wasLive = g.classList.contains("is-live");
      g.value = "日本語";
      g.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, composed: true, data: "日本語" }));
      g.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true }));
      await new Promise(r => setTimeout(r, 80));
      g.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, composed: true }));
      await new Promise(r => setTimeout(r, 300));
      return { wasLive };
    });
    ok("変換を始めた時点で入力欄になる（日本語が打てる）", jp.wasLive === true, jp);
    const jpVal = await pg.evaluate(() => {
      const c = JSON.parse(localStorage.getItem("vq2.wp.content.v1") || "{}");
      const items = JSON.parse(localStorage.getItem("vq2.wp.items.v1") || "[]");
      const it = items.filter(i => i.itemType === "spreadsheet")[0];
      const cells = c[it.id].content.sheets[0].cells;
      return Object.keys(cells).map(k => cells[k].v).filter(v => v === "日本語").length;
    });
    ok("日本語がセルに入る", jpVal >= 1, jpVal);
  }

  section("Sheets：右クリックで操作できる");
  {
    /* 挿入の効果が見えるよう、値の入っている行より **上** で右クリックする。 */
    const c = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-sheets").shadowRoot;
      const cell = sr.querySelector('.wps-c[data-r="1"][data-c="1"]');
      const r = cell.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await pg.mouse.click(c.x, c.y, { button: "right" });
    await sleep(350);
    const menu = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-sheets").shadowRoot;
      const m = sr.querySelector(".wp-ctxmenu");
      return m ? Array.from(m.querySelectorAll(".wp-ctxmenu__i")).map(b => b.textContent.trim()) : [];
    });
    ok("セルの上で右クリック → メニューが出る", menu.length > 8, menu.slice(0, 6));
    ok("行列の挿入削除・コピー・並べ替えがある",
      menu.some(t => /行を挿入/.test(t)) && menu.some(t => /この列を削除/.test(t))
      && menu.some(t => /コピー/.test(t)) && menu.some(t => /並べ替え/.test(t)), menu);
    /* 押して実際に効くか */
    const rows0 = await pg.evaluate(() => {
      const c = JSON.parse(localStorage.getItem("vq2.wp.content.v1") || "{}");
      const items = JSON.parse(localStorage.getItem("vq2.wp.items.v1") || "[]");
      const it = items.filter(i => i.itemType === "spreadsheet")[0];
      return Object.keys(c[it.id].content.sheets[0].cells).join(",");
    });
    await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-sheets").shadowRoot;
      const b = Array.from(sr.querySelectorAll(".wp-ctxmenu__i")).filter(x => /^行を挿入/.test(x.textContent.trim()))[0];
      if (b) b.click();
    });
    await sleep(600);
    const rows1 = await pg.evaluate(() => {
      const c = JSON.parse(localStorage.getItem("vq2.wp.content.v1") || "{}");
      const items = JSON.parse(localStorage.getItem("vq2.wp.items.v1") || "[]");
      const it = items.filter(i => i.itemType === "spreadsheet")[0];
      return Object.keys(c[it.id].content.sheets[0].cells).join(",");
    });
    ok("「行を挿入」でセルが実際にずれる", rows0 !== rows1, { rows0, rows1 });
  }
  await close("vq-wp-sheets");

  /* ══ ⑥ Forms：右クリック ══════════════════════════════════ */
  section("Forms：右クリックで操作できる");
  await openEditor("forms", "vq-wp-forms");
  {
    await pg.evaluate(async () => {
      const sr = document.getElementById("vq-wp-forms").shadowRoot;
      sr.querySelector('[data-act="add-sheet"]').click();
      await new Promise(r => setTimeout(r, 300));
      const b = sr.querySelector('[data-t="single_choice"]'); if (b) b.click();
    });
    await sleep(600);
    const c = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-forms").shadowRoot;
      const card = sr.querySelector(".wpf-card[data-fid]");
      const r = card.getBoundingClientRect();
      return { x: r.x + 40, y: r.y + 20 };
    });
    await pg.mouse.click(c.x, c.y, { button: "right" });
    await sleep(350);
    const menu = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-forms").shadowRoot;
      const m = sr.querySelector(".wp-ctxmenu");
      return m ? Array.from(m.querySelectorAll(".wp-ctxmenu__i")).map(b => b.textContent.trim()) : [];
    });
    ok("質問の上で右クリック → メニューが出る", menu.length > 5, menu.slice(0, 6));
    ok("必須切替・複製・形式変更・削除がある",
      menu.some(t => /必須/.test(t)) && menu.some(t => /複製/.test(t))
      && menu.some(t => /形式を変える/.test(t)) && menu.some(t => /削除/.test(t)), menu);
    await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-forms").shadowRoot;
      const b = Array.from(sr.querySelectorAll(".wp-ctxmenu__i")).filter(x => /必須にする/.test(x.textContent))[0];
      if (b) b.click();
    });
    await sleep(500);
    const req = await pg.evaluate(() => {
      const c = JSON.parse(localStorage.getItem("vq2.wp.content.v1") || "{}");
      const items = JSON.parse(localStorage.getItem("vq2.wp.items.v1") || "[]");
      const it = items.filter(i => i.itemType === "form")[0];
      return c[it.id].content.sections[0].fields[0].required;
    });
    ok("「必須にする」が実際に効く", req === true, req);
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
})().catch(async (e) => { console.error("実行できませんでした:", e); process.exit(2); });
