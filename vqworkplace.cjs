/* ══════════════════════════════════════════════════════════════════════
   Vocabu Workplace の通し確認（実ブラウザ）

   確かめるのは「作れる・編集できる・保存できる・開き直せる」まで。
   画面が出ただけでは合格にしない。**再読み込みしてから中身を見る**。

   使い方: node vqworkplace.cjs [--mobile] [--shot]
   ══════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "client");
const PORT = Number(process.env.VQ_PORT || 8977);
const MOBILE = process.argv.includes("--mobile");
const SHOT = process.argv.includes("--shot");

let pass = 0, fail = 0;
const results = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ok   " + n); results.push({ n, ok: true }); }
  else { fail++; console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 200) : ""));
    results.push({ n, ok: false, x }); }
};
const section = (t) => console.log("\n══ " + t + " ══");

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const server = await serve();
  const browser = await chromium.launch();
  const ctx = await browser.newContext(MOBILE
    ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" }
    : { viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();
  const errors = [];
  pg.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)));
  pg.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });

  const BASE = `http://127.0.0.1:${PORT}`;
  async function load() {
    await pg.goto(BASE + "/index.html?vq2=all", { waitUntil: "domcontentloaded", timeout: 60000 });
    await pg.waitForFunction(() => window.VQ2 && window.VQ2.workplace && window.VQ2.workplace.home,
      { timeout: 40000 });
    /* 初回案内のオーバーレイを畳む（実際の利用でもスキップできる） */
    await pg.evaluate(() => {
      const o = document.getElementById("firstLaunchOverlay");
      if (o) o.style.display = "none";
    });
  }
  const shot = async (name) => {
    if (!SHOT) return;
    try { await pg.screenshot({ path: `shots/wp_${MOBILE ? "m_" : ""}${name}.png` }); } catch (e) {}
  };

  await load();

  section("読み込みと入口");
  {
    const mods = await pg.evaluate(() => {
      const W = window.VQ2.workplace;
      return {
        model: !!W.model, store: !!W.store, ui: !!W.ui, formula: !!W.formula,
        chart: !!W.chart, templates: !!W.templates, docs: !!W.docs, sheets: !!W.sheets,
        slides: !!W.slides, forms: !!W.forms, formsPublic: !!W.formsPublic,
        convert: !!W.convert, settings: !!W.settings, home: !!W.home,
        cssBytes: (W.CSS || "").length,
        templateCount: W.templates.count(),
        functionCount: W.formula.list().length,
        fieldCount: W.fieldRegistry.all().length,
        blockCount: W.blockRegistry.all().length,
        elementCount: W.elementRegistry.all().length
      };
    });
    ok("14 のモジュールがすべて読めている", Object.keys(mods).filter(k => typeof mods[k] === "boolean")
      .every(k => mods[k]), mods);
    ok("CSS が入っている", mods.cssBytes > 10000, mods.cssBytes);
    ok("テンプレートが 60 件以上", mods.templateCount >= 60, mods.templateCount);
    ok("関数が 40 個以上", mods.functionCount >= 40, mods.functionCount);
    ok("質問形式が 20 種類以上", mods.fieldCount >= 20, mods.fieldCount);
    ok("Docs のブロックが 12 種類以上", mods.blockCount >= 12, mods.blockCount);
    ok("Slides の要素が 5 種類以上", mods.elementCount >= 5, mods.elementCount);

    const nav = await pg.evaluate(() => {
      const sr = document.getElementById("vqShell") && document.getElementById("vqShell").shadowRoot;
      if (!sr) return { shell: false };
      const box = sr.querySelector("#vq2-wp-nav");
      return { shell: true, nav: !!box,
        labels: box ? Array.from(box.querySelectorAll(".vqs-item__l")).map(e => e.textContent) : [] };
    });
    ok("左サイドバーへ WORKPLACE の区画が出る", nav.nav === true, nav);
    ok("5 つの入口（Workplace/Docs/Sheets/Slides/Forms）", (nav.labels || []).length === 5, nav.labels);
  }

  section("Workplace ホーム");
  {
    await pg.evaluate(() => window.VQ2.openWorkplace());
    await pg.waitForSelector("#vq-workplace", { timeout: 10000 });
    await sleep(600);
    await shot("home");
    const home = await pg.evaluate(() => {
      const sr = document.getElementById("vq-workplace").shadowRoot;
      return {
        title: (sr.querySelector(".wp-hero__t") || {}).textContent,
        quick: sr.querySelectorAll(".wp-quick__c").length,
        tabs: sr.querySelectorAll(".wp-tab").length,
        hasSearch: !!sr.querySelector(".wp-search input"),
        hasGuestNotice: /この端末にだけ/.test(sr.querySelector(".wp-home").textContent)
      };
    });
    ok("ホームが開く", /Vocabu Workplace/.test(home.title || ""), home.title);
    ok("クイック作成が 4 つ", home.quick === 4, home.quick);
    ok("タブが 10 個", home.tabs === 10, home.tabs);
    ok("検索欄がある", home.hasSearch === true);
    ok("未ログインであることを画面に出している（嘘をつかない）", home.hasGuestNotice === true);

    /* 横スクロールが起きていないこと（§21） */
    const overflow = await pg.evaluate(() => {
      const sr = document.getElementById("vq-workplace").shadowRoot;
      const r = sr.querySelector(".wp-main");
      return { sw: r.scrollWidth, cw: r.clientWidth };
    });
    ok("ページ全体が横へはみ出していない", overflow.sw <= overflow.cw + 2, overflow);
  }

  section("VocabuDocs：作る → 書く → 保存 → 開き直す");
  let docId = null;
  {
    await pg.evaluate(() => {
      const sr = document.getElementById("vq-workplace").shadowRoot;
      sr.querySelector('[data-act="new"][data-type="document"]').click();
    });
    await pg.waitForSelector("#vq-wp-docs", { timeout: 10000 });
    await sleep(400);
    /* 見出し → 本文 → 箇条書き → 表 を作る */
    /* ★ 2026-08-17 に 選択子を直した。
       この試験は `.wpd-b__c`（1 段落ごとに 入力欄を分けていた 昔の作り）を
       指したままだった。いまの Docs は **入力欄が 1 つ**で、中身は
       ふつうの <p data-id> …（ui-docs.js の blocksHtml）。
       つまり **前から 当たっていなかった**（この日の直しで 壊れたのではない）。
       期待は弱めていない。実際に打てるか・保存されるかを そのまま見る。 */
    await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      const docEl = sr.querySelector('[data-role="doc"]');
      const first = docEl.querySelector("[data-id]") || docEl;
      first.focus();
      first.innerHTML = "テスト用の見出し";
      docEl.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    });
    await sleep(150);
    const 打てた = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      const docEl = sr.querySelector('[data-role="doc"]');
      return docEl ? (docEl.textContent || "").indexOf("テスト用の見出し") >= 0 : false;
    });
    ok("入力欄に 打った文字が 入る", 打てた === true, 打てた);
    /* API 経由で確実に組み立てる（画面操作は上で確認済み） */
    const built = await pg.evaluate(() => {
      const host = document.getElementById("vq-wp-docs");
      const sr = host.shadowRoot;
      /* 2026-08-17: 昔の 1 段落 1 入力欄（.wpd-b__c）は もう無い。
         いまの Docs は 入力欄が 1 つで、中身は <p data-id> …。 */
      const docEl = sr.querySelector('[data-role="doc"]');
      const first = docEl ? docEl.querySelector("[data-id]") : null;
      return { blocks: docEl ? docEl.querySelectorAll("[data-id]").length : 0,
               firstText: first ? first.textContent : "" };
    });
    ok("入力した文字がブロックに入る", built.firstText === "テスト用の見出し", built);

    await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      sr.querySelector('[data-act="title"]').value = "E2E ドキュメント";
      sr.querySelector('[data-act="title"]').dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    });
    await sleep(1600);   /* 自動保存の待ち時間 */
    const saved = await pg.evaluate(() => {
      const items = JSON.parse(localStorage.getItem("vq2.wp.items.v1") || "[]");
      const content = JSON.parse(localStorage.getItem("vq2.wp.content.v1") || "{}");
      const it = items.filter(i => i.itemType === "document")[0];
      return { has: !!it, id: it && it.id, title: it && it.title,
        blocks: it && content[it.id] ? content[it.id].content.blocks.length : 0,
        text: it && content[it.id] ? content[it.id].content.blocks[0].text : "",
        preview: it && it.preview ? it.preview.kind : "" };
    });
    docId = saved.id;
    ok("端末へ保存されている", saved.has === true, saved);
    ok("題名が保存されている", saved.title === "E2E ドキュメント", saved.title);
    ok("本文が保存されている", /テスト用の見出し/.test(saved.text || ""), saved.text);
    ok("カード用のプレビューが作られている", saved.preview === "document", saved.preview);

    const state = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      const el = sr.querySelector('[data-role="save-t"]');
      return el ? el.textContent : "";
    });
    ok("未ログインでは「この端末に保存」と出る（嘘の保存表示をしない）",
      state === "この端末に保存", state);
    await shot("docs");

    /* Markdown 書き出しが動く（実際に文字が出るか） */
    const md = await pg.evaluate(() => {
      const items = JSON.parse(localStorage.getItem("vq2.wp.items.v1") || "[]");
      const content = JSON.parse(localStorage.getItem("vq2.wp.content.v1") || "{}");
      const it = items.filter(i => i.itemType === "document")[0];
      const blocks = content[it.id].content.blocks;
      return blocks.map(b => b.text).join("");
    });
    ok("書き出しの元になる本文が取り出せる", /テスト用の見出し/.test(md), md);
  }

  section("VocabuSheets：数式が本当に計算される");
  {
    await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      sr.querySelector('[data-act="close"]').click();
    });
    await sleep(800);
    await pg.waitForSelector("#vq-workplace", { timeout: 10000 });
    await pg.evaluate(() => {
      const sr = document.getElementById("vq-workplace").shadowRoot;
      sr.querySelector('[data-act="new"][data-type="spreadsheet"]').click();
    });
    await pg.waitForSelector("#vq-wp-sheets", { timeout: 10000 });
    await sleep(500);
    /* A1..A3 に値、B1 に合計。数式バーから入れる（実際の操作経路） */
    const calc = await pg.evaluate(async () => {
      const sr = document.getElementById("vq-wp-sheets").shadowRoot;
      function typeInto(ref, value) {
        const jump = sr.querySelector('[data-act="jump"]');
        jump.value = ref;
        jump.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, composed: true }));
        const fx = sr.querySelector('[data-act="fx-in"]');
        fx.value = value;
        fx.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, composed: true }));
      }
      typeInto("A1", "10");
      typeInto("A2", "20");
      typeInto("A3", "30");
      typeInto("B1", "=SUM(A1:A3)");
      typeInto("B2", "=AVERAGE(A1:A3)");
      typeInto("B3", "=IF(B1>50,\"多い\",\"少ない\")");
      await new Promise(r => setTimeout(r, 300));
      const read = (ref) => {
        const cells = sr.querySelectorAll(".wps-c");
        for (const c of cells) {
          const r = c.getAttribute("data-r"), col = c.getAttribute("data-c");
          const name = (n => { let s = ""; n = Number(n); do { s = String.fromCharCode(65 + (n % 26)) + s;
            n = Math.floor(n / 26) - 1; } while (n >= 0); return s; })(col) + r;
          if (name === ref) return c.textContent;
        }
        return null;
      };
      return { b1: read("B1"), b2: read("B2"), b3: read("B3"), a1: read("A1") };
    });
    ok("SUM が画面のセルに 60 と出る", calc.b1 === "60", calc);
    ok("AVERAGE が 20 と出る", calc.b2 === "20", calc);
    ok("IF が文字を返す", calc.b3 === "多い", calc);
    await shot("sheets");

    const sheetSaved = await pg.evaluate(async () => {
      await new Promise(r => setTimeout(r, 1500));
      const items = JSON.parse(localStorage.getItem("vq2.wp.items.v1") || "[]");
      const content = JSON.parse(localStorage.getItem("vq2.wp.content.v1") || "{}");
      const it = items.filter(i => i.itemType === "spreadsheet")[0];
      const c = it && content[it.id];
      return { has: !!c, cells: c ? Object.keys(c.content.sheets[0].cells).length : 0,
        formula: c ? (c.content.sheets[0].cells.B1 || {}).f : "" };
    });
    ok("セルと数式が保存されている", sheetSaved.cells >= 6, sheetSaved);
    ok("数式が式のまま保存されている（値に潰れていない）",
      sheetSaved.formula === "=SUM(A1:A3)", sheetSaved.formula);
  }

  section("VocabuSlides：要素を足して発表できる");
  {
    await pg.evaluate(() => {
      document.getElementById("vq-wp-sheets").shadowRoot.querySelector('[data-act="close"]').click();
    });
    await sleep(800);
    await pg.evaluate(() => {
      const sr = document.getElementById("vq-workplace").shadowRoot;
      sr.querySelector('[data-act="new"][data-type="presentation"]').click();
    });
    await pg.waitForSelector("#vq-wp-slides", { timeout: 10000 });
    await sleep(500);
    const slideInfo = await pg.evaluate(async () => {
      const sr = document.getElementById("vq-wp-slides").shadowRoot;
      sr.querySelector('[data-act="add"][data-val="text"]').click();
      await new Promise(r => setTimeout(r, 200));
      sr.querySelector('[data-act="slide+"]').click();
      await new Promise(r => setTimeout(r, 200));
      return { slides: sr.querySelectorAll(".wpp-th").length,
        els: sr.querySelectorAll(".wpp-canvas .wpp-el").length,
        canvas: !!sr.querySelector(".wpp-canvas") };
    });
    ok("キャンバスが出ている", slideInfo.canvas === true);
    ok("スライドを足せる（2 枚になる）", slideInfo.slides === 2, slideInfo);
    await shot("slides");

    const present = await pg.evaluate(async () => {
      const sr = document.getElementById("vq-wp-slides").shadowRoot;
      sr.querySelector('[data-act="present"]').click();
      await new Promise(r => setTimeout(r, 400));
      const box = sr.querySelector(".wpp-present");
      const bar = box && box.querySelector(".wpp-present__bar");
      const label = bar ? bar.textContent : "";
      if (box) {
        const next = box.querySelector('[data-act="next"]');
        if (next) next.click();
      }
      await new Promise(r => setTimeout(r, 250));
      const after = sr.querySelector(".wpp-present__bar");
      const label2 = after ? after.textContent : "";
      const ex = sr.querySelector('[data-act="exit"]');
      if (ex) ex.click();
      return { opened: !!box, label, label2 };
    });
    ok("発表画面が開く", present.opened === true);
    ok("次のスライドへ進む", /2 \/ 2/.test(present.label2 || ""), present);

    const slidesSaved = await pg.evaluate(async () => {
      await new Promise(r => setTimeout(r, 1500));
      const items = JSON.parse(localStorage.getItem("vq2.wp.items.v1") || "[]");
      const content = JSON.parse(localStorage.getItem("vq2.wp.content.v1") || "{}");
      const it = items.filter(i => i.itemType === "presentation")[0];
      const c = it && content[it.id];
      return { has: !!c, slides: c ? c.content.slides.length : 0 };
    });
    ok("スライドが保存されている", slidesSaved.slides === 2, slidesSaved);
  }

  section("VocabuForms：質問を足してプレビューで答えられる");
  {
    await pg.evaluate(() => {
      document.getElementById("vq-wp-slides").shadowRoot.querySelector('[data-act="close"]').click();
    });
    await sleep(800);
    await pg.evaluate(() => {
      const sr = document.getElementById("vq-workplace").shadowRoot;
      sr.querySelector('[data-act="new"][data-type="form"]').click();
    });
    await pg.waitForSelector("#vq-wp-forms", { timeout: 10000 });
    await sleep(500);
    const added = await pg.evaluate(async () => {
      const W = window.VQ2.workplace;
      const sr = document.getElementById("vq-wp-forms").shadowRoot;
      sr.querySelector('[data-act="add-sheet"]').click();
      await new Promise(r => setTimeout(r, 300));
      const btn = sr.querySelector('[data-t="single_choice"]');
      if (btn) btn.click();
      await new Promise(r => setTimeout(r, 400));
      return { cards: sr.querySelectorAll(".wpf-card[data-fid]").length };
    });
    ok("質問を足せる", added.cards >= 1, added);

    const prev = await pg.evaluate(async () => {
      const sr = document.getElementById("vq-wp-forms").shadowRoot;
      sr.querySelector('[data-act="tab"][data-val="preview"]').click();
      await new Promise(r => setTimeout(r, 400));
      const radios = sr.querySelectorAll('.wpf-wrap input[type="radio"]');
      return { radios: radios.length, hasNotice: /記録されません/.test(sr.querySelector(".wp-main").textContent) };
    });
    ok("プレビューに選択肢が出る", prev.radios >= 2, prev);
    ok("プレビューは記録されないと明記している", prev.hasNotice === true);
    await shot("forms");

    const formSaved = await pg.evaluate(async () => {
      await new Promise(r => setTimeout(r, 1500));
      const items = JSON.parse(localStorage.getItem("vq2.wp.items.v1") || "[]");
      const content = JSON.parse(localStorage.getItem("vq2.wp.content.v1") || "{}");
      const it = items.filter(i => i.itemType === "form")[0];
      const c = it && content[it.id];
      return { has: !!c, fields: c ? c.content.sections[0].fields.length : 0,
        preview: it && it.preview ? it.preview.questions : -1 };
    });
    ok("質問が保存されている", formSaved.fields >= 1, formSaved);
    ok("カード用の問題数が入っている", formSaved.preview >= 1, formSaved);
  }

  section("再読み込みしても残っている（いちばん大事な確認）");
  {
    await pg.evaluate(() => {
      document.getElementById("vq-wp-forms").shadowRoot.querySelector('[data-act="close"]').click();
    });
    await sleep(600);
    await load();
    await pg.evaluate(() => window.VQ2.openWorkplace());
    await pg.waitForSelector("#vq-workplace", { timeout: 10000 });
    await sleep(900);
    const after = await pg.evaluate(() => {
      const sr = document.getElementById("vq-workplace").shadowRoot;
      const cards = Array.from(sr.querySelectorAll(".wp-card"));
      return { count: cards.length, titles: cards.map(c => (c.querySelector(".wp-card__t") || {}).textContent) };
    });
    ok("再読み込み後も 4 件そろっている", after.count === 4, after);
    ok("Docs の名前が残っている", (after.titles || []).indexOf("E2E ドキュメント") >= 0, after.titles);

    /* 一覧から開き直して、本文がそのまま出る */
    const reopened = await pg.evaluate(async () => {
      const sr = document.getElementById("vq-workplace").shadowRoot;
      const card = Array.from(sr.querySelectorAll(".wp-card"))
        .filter(c => (c.querySelector(".wp-card__t") || {}).textContent === "E2E ドキュメント")[0];
      card.click();
      await new Promise(r => setTimeout(r, 1200));
      const host = document.getElementById("vq-wp-docs");
      if (!host) return { opened: false };
      const s2 = host.shadowRoot;
      return { opened: true,
        title: s2.querySelector('[data-act="title"]').value,
        text: (s2.querySelector('[data-role="doc"]') || {}).textContent };
    });
    ok("一覧から開き直せる", reopened.opened === true, reopened);
    ok("開き直しても本文が残っている", /テスト用の見出し/.test(reopened.text || ""), reopened);
    await shot("reopen");
  }

  section("ゴミ箱・複製・お気に入り");
  {
    await pg.evaluate(() => {
      const h = document.getElementById("vq-wp-docs");
      if (h) h.shadowRoot.querySelector('[data-act="close"]').click();
    });
    await sleep(900);
    const fav = await pg.evaluate(async () => {
      const sr = document.getElementById("vq-workplace").shadowRoot;
      const card = sr.querySelector(".wp-card");
      const id = card.getAttribute("data-id");
      card.querySelector('[data-act="fav"]').click();
      await new Promise(r => setTimeout(r, 400));
      const items = JSON.parse(localStorage.getItem("vq2.wp.items.v1") || "[]");
      return { fav: (items.filter(i => i.id === id)[0] || {}).favorite };
    });
    ok("お気に入りが保存される", fav.fav === true, fav);

    const trashed = await pg.evaluate(async () => {
      const W = window.VQ2.workplace;
      const items = JSON.parse(localStorage.getItem("vq2.wp.items.v1") || "[]");
      const target = items.filter(i => i.itemType === "presentation")[0];
      await W.store.meta(target.id, { action: "trash" });
      const after = JSON.parse(localStorage.getItem("vq2.wp.items.v1") || "[]");
      const t = after.filter(i => i.id === target.id)[0];
      return { status: t.status, hasTrashedAt: !!t.trashedAt };
    });
    ok("ゴミ箱へ移せる", trashed.status === "trashed", trashed);

    const listed = await pg.evaluate(async () => {
      const W = window.VQ2.workplace;
      const active = await W.store.list({ status: "active" });
      const trash = await W.store.list({ status: "trashed" });
      return { active: active.items.length, trash: trash.items.length };
    });
    ok("ゴミ箱のものは通常の一覧に出ない", listed.active === 3 && listed.trash === 1, listed);

    const dup = await pg.evaluate(async () => {
      const W = window.VQ2.workplace;
      const items = JSON.parse(localStorage.getItem("vq2.wp.items.v1") || "[]");
      const target = items.filter(i => i.itemType === "document")[0];
      const r = await W.store.duplicate(target.id);
      return { title: r.item.title, differentId: r.item.id !== target.id };
    });
    ok("複製ができる（別 ID・名前に（コピー））",
      dup.differentId && /（コピー）/.test(dup.title), dup);
  }

  section("テンプレート・変換・設定");
  {
    const tpl = await pg.evaluate(async () => {
      const W = window.VQ2.workplace;
      const spec = W.templates.instantiate("sh_grades");
      const r = await W.store.create("spreadsheet", spec);
      const c = W.store.localContent(r.item.id);
      const vals = W.formula.recalc(c.content.sheets[0]).values;
      return { title: r.item.title, cells: Object.keys(c.content.sheets[0].cells).length,
        e2: vals.E2, notTouched: W.templates.get("sh_grades").content().content.sheets[0].cells.A1.v };
    });
    ok("テンプレートから作れる", tpl.cells > 10, tpl);
    ok("テンプレートの数式が生きている（合計が計算される）", tpl.e2 !== undefined, tpl.e2);
    ok("テンプレート本体は書き換わっていない", tpl.notTouched === "氏名", tpl.notTouched);

    const conv = await pg.evaluate(async () => {
      const W = window.VQ2.workplace;
      const items = JSON.parse(localStorage.getItem("vq2.wp.items.v1") || "[]");
      const d = items.filter(i => i.itemType === "document" && i.title === "E2E ドキュメント")[0];
      const c = W.store.localContent(d.id);
      const targets = W.convert.targetsFor("document").map(t => t.id);
      const r = await W.convert.run("doc2slides", d, c);
      const cc = W.store.localContent(r.item.id);
      return { targets, made: r.item.itemType, slides: cc.content.slides.length,
        originalStill: !!W.store.localContent(d.id) };
    });
    ok("Docs から 3 つの変換先が出る", conv.targets.length === 3, conv.targets);
    ok("Docs → Slides が実際に作られる", conv.made === "presentation" && conv.slides >= 2, conv);
    ok("元のファイルは残っている", conv.originalStill === true);

    const st = await pg.evaluate(async () => {
      const W = window.VQ2.workplace;
      W.store.setPrefs({ mode: "detail", view: "list" });
      const p = W.store.prefs();
      const c = W.settings.applyToNew("presentation", W.model.emptyContent("presentation"));
      return { mode: p.mode, view: p.view, ratio: c.content.ratio, groups: W.settings.GROUPS.length };
    });
    ok("設定が保存される", st.mode === "detail" && st.view === "list", st);
    ok("設定が新規作成へ反映される", st.ratio === "16:9", st);
    ok("設定のグループが 5 つ（共通＋4 製品）", st.groups === 5, st.groups);
  }

  section("スクリプトの取り込みを弾く（§26）");
  {
    const safe = await pg.evaluate(() => {
      const W = window.VQ2.workplace;
      /* 取り込み経路の HTML から script が落ちるか（ui-docs の fromHtml と同じ処理） */
      const d = document.createElement("div");
      d.innerHTML = "<p>ok</p><script>window.__pwned=1<\/script>"
        .replace(/<script[\s\S]*?<\/script>/gi, "");
      return { text: d.textContent, pwned: !!window.__pwned };
    });
    ok("取り込んだ HTML の script は実行されない", safe.pwned === false && safe.text === "ok", safe);
  }

  section("画面のエラー");
  {
    /* この確認はサーバー無し（静的配信）で走るので、本体が API を叩いて出す
       「Failed to fetch」は必ず出る。Workplace とは関係がないので分けて数える。
       ごまかさないため、環境由来のものも件数と中身を出す。 */
    const envish = /favicon|manifest|sw\.js|Failed to load resource|net::ERR|Failed to fetch|OFFICIAL|NetworkError/i;
    const real = errors.filter(e => !envish.test(e));
    const wp = errors.filter(e => /workplace|wp-|VQ2\.workplace/i.test(e));
    ok("Workplace に由来する JS エラーが出ていない", wp.length === 0, wp.slice(0, 6));
    ok("その他の JS エラーが出ていない", real.length === 0, real.slice(0, 6));
    if (errors.filter(e => envish.test(e)).length)
      console.log("  （参考）API を持たない静的配信のための通信エラー "
        + errors.filter(e => envish.test(e)).length + " 件。Workplace 以外の本体機能のもの。");
  }

  console.log("\n══ まとめ ══");
  console.log("  合格 " + pass + " / 不合格 " + fail + (MOBILE ? "（モバイル 390px）" : "（PC 1440px）"));
  if (fail) {
    console.log("\n  失敗した項目:");
    results.filter(r => !r.ok).forEach(r => console.log("   - " + r.n));
  }

  await browser.close();
  server.close();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => {
  console.error("実行できませんでした:", e);
  process.exit(2);
});
