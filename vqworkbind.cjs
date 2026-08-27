/* ══════════════════════════════════════════════════════════════════════
   vqworkbind.cjs — 基盤（client/core/）が **本体につながっているか**

   ・vqwork.cjs は core を 単体で 確かめる。ここは **実ブラウザ**で、
     画面・保存・道具の口まで つながっているかを 見る。
   ・いちばん怖いのは 「組んだ数式が 保存されて 元が消える」こと。
     まず そこを 見る。
   ══════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE || "http://127.0.0.1:8977";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) {
  console.error("本番では実行しません。");
  process.exit(2);
}

const ROOT = path.join(__dirname, "client");
const PORT = Number(process.env.VQ_PORT || 8979);
let pass = 0, fail = 0;
const 落ち = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ✅ " + n); }
  else { fail++; 落ち.push(n); console.log("  ❌ " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 240) : "")); }
};
const 節 = (t) => console.log("\n■ " + t);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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

(async () => {
  const server = await serve();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();
  const 例外 = [];
  pg.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 200)));

  await pg.goto(`http://127.0.0.1:${PORT}/index.html?vq2=all`,
    { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.waitForFunction(() => window.VQ2 && window.VQ2.workplace && window.VQ2.workplace.home,
    { timeout: 40000 });
  await pg.evaluate(() => {
    const o = document.getElementById("firstLaunchOverlay");
    if (o) o.style.display = "none";
  });

  節("基盤が 読み込まれている");
  {
    const m = await pg.evaluate(() => {
      const W = window.VQW || {};
      return { ir: !!(W.ir && W.ir.toIR), ops: !!(W.ops && W.ops.guard),
        selector: !!(W.selector && W.selector.resolve),
        validate: !!(W.validate && W.validate.run),
        report: !!(W.report && W.report.道具の返り),
        doctype: !!(W.doctype && W.doctype.registry),
        exam: !!(W.doctype && W.doctype.exam),
        pipeline: !!(W.pipeline && W.pipeline.repair),
        snapshot: !!(W.snapshot && W.snapshot.newHistory) };
    });
    Object.keys(m).forEach((k) => ok("VQW." + k + " が居る", m[k] === true, m));
    const cmd = await pg.evaluate(() => {
      const C = window.VQ2.workplace.cmd;
      return { 選択: typeof C.選択, 直す: typeof C.直す, 下見: typeof C.下見,
               基盤の検査: typeof C.基盤の検査 };
    });
    ok("WP.cmd に 基盤の口が 生えている",
      Object.keys(cmd).every((k) => cmd[k] === "function"), cmd);
  }

  節("書式カタログが ファイルから 読める（デプロイ不要の形）");
  {
    const r = await pg.evaluate(async () => {
      await window.VQW.doctype.registry.load();
      const 一 = window.VQW.doctype.registry.一覧();
      const e = window.VQW.doctype.fallback.探す("テスト用紙", "docs");
      const n = window.VQW.doctype.fallback.探す("給与明細書", "docs");
      return { 数: 一.length, id: 一.map((x) => x.id),
               exact: e.match, none: n.match, 断り: n.画面に出す,
               具合: window.VQW.doctype.registry.具合() };
    });
    ok("3 つの書式が 読めている", r.数 >= 3, r);
    ok("問題用紙・解答用紙・解答解説が 揃っている",
      ["exam_paper", "answer_sheet", "answer_key"].every((k) => r.id.indexOf(k) >= 0), r.id);
    ok("別名（テスト用紙）で 引ける", r.exact === "exact", r.exact);
    ok("知らない書類は none と 言う", r.none === "none", r.none);
    ok("none のとき 正式な書式ではないと 画面に出す", /正式な/.test(r.断り || ""), r.断り);
  }

  /* ── Docs を開く ── */
  await pg.evaluate(() => window.VQ2.openWorkplace());
  await pg.waitForSelector("#vq-workplace", { timeout: 10000 });
  await sleep(500);
  await pg.evaluate(() => {
    const sr = document.getElementById("vq-workplace").shadowRoot;
    sr.querySelector('[data-act="new"][data-type="document"]').click();
  });
  await pg.waitForSelector("#vq-wp-docs", { timeout: 10000 });
  await sleep(500);

  節("数式（生の $…$ が そのまま 出ない・打った元は 消えない）");
  {
    await pg.evaluate(() => {
      const c = window.VQ2.workplace.current;
      const b = c.session.content.content;
      b.blocks = [
        { id: "m_a", type: "paragraph", text: "面積は $S = \\pi r^2$ で 求まります" },
        { id: "m_b", type: "math", text: "x^2 + 5x + 6 = 0" },
        { id: "m_c", type: "paragraph", text: "こわれた式 $\\frac{1}{2$ は そのまま出す" }
      ];
      c.paint();
    });
    /* ★ 数式の道具（MathJax）は **数式が出てきたときだけ** 読み込む。
       読み終わると vqm:ready が飛び、画面が塗り直される。それを待つ。
       （2.28MB を いつも読むのは 無駄なので、遅延読み込みにしてある。） */
    await pg.waitForFunction(() => {
      const sr = document.getElementById("vq-wp-docs");
      if (!sr || !sr.shadowRoot) return false;
      return !!sr.shadowRoot.querySelector(".wpd-mi svg");
    }, { timeout: 30000 }).catch(() => {});
    await sleep(400);
    const 見た目 = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      const a = sr.querySelector('[data-id="m_a"]');
      const b = sr.querySelector('[data-id="m_b"]');
      const c = sr.querySelector('[data-id="m_c"]');
      return {
        /* ★ 2026-08-17: KaTeX（CDN）→ 自前配信の MathJax/SVG へ替えた。
           見るものを .katex から svg に変えただけで、**確かめている中身は同じ**
           （文の中の $…$ が 組まれていること）。 */
        文の中に組んだ式: !!(a && a.querySelector(".wpd-mi svg")),
        文の残り: a ? a.textContent.indexOf("面積は") : -1,
        数式の箱: !!(b && b.querySelector(".wpd-math__view svg")),
        数式の元が見える: b ? b.querySelector(".wpd-math__src").textContent.trim() : "",
        こわれた式はそのまま: c ? c.textContent.indexOf("$\\frac{1}{2$") >= 0 : false,
        生のドルが残っていないか: a ? a.textContent.indexOf("$") : -1
      };
    });
    ok("文の中の $…$ が SVG で 組まれる", 見た目.文の中に組んだ式 === true, 見た目);
    ok("式のまわりの 日本語は そのまま 残る", 見た目.文の残り === 0, 見た目);
    ok("組んだあと 生の $ が 画面に 出ていない", 見た目.生のドルが残っていないか < 0, 見た目);
    ok("math の箱が SVG で 組まれる", 見た目.数式の箱 === true, 見た目);
    ok("math の箱は **元の文字も** 見える（直せる）",
      見た目.数式の元が見える === "x^2 + 5x + 6 = 0", 見た目.数式の元が見える);
    ok("組めない式は そのままの文字で 出す（黙って消さない）",
      見た目.こわれた式はそのまま === true, 見た目);

    /* ★ ここが 本番。harvest（保存の元）で 元の $…$ に 戻るか。
       ★ ただ input を投げて 読み直すだけだと、**harvest が動いていなくても
         通ってしまう**（もともと自分で入れた値と 同じだから）。
         そこで **画面の側に 1 文字 足してから** 読む。
         足した字が 入っていれば harvest は 確かに 動いている。 */
    await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      const docEl = sr.querySelector('[data-role="doc"]');
      const a = docEl.querySelector('[data-id="m_a"]');
      a.appendChild(document.createTextNode("。追記"));
      docEl.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    });
    await sleep(600);
    const 往復 = await pg.evaluate(() => {
      const b = window.VQ2.workplace.current.session.content.content;
      const 表 = {};
      b.blocks.forEach((x) => { 表[x.id] = x.text; });
      return 表;
    });
    ok("画面で足した字が 保存の元へ 入る（harvest が 本当に 動いている）",
      /。追記/.test(往復.m_a || ""), 往復.m_a);
    ok("保存の元に 数式の HTML が 混ざっていない",
      Object.keys(往復).every((k) => String(往復[k]).indexOf("<svg") < 0
        && String(往復[k]).indexOf("katex") < 0), 往復);
    ok("文の中の式が **元の $…$ に 戻る**",
      /\$S = \\pi r\^2\$/.test(往復.m_a || ""), 往復.m_a);
    ok("math の箱の 元が 変わらない", (往復.m_b || "").indexOf("x^2 + 5x + 6 = 0") >= 0, 往復.m_b);
  }

  節("記入欄（持っていない値を 埋めない ための 箱）");
  {
    await pg.evaluate(() => {
      const c = window.VQ2.workplace.current;
      const b = c.session.content.content;
      b.blocks = [
        { id: "f_1", type: "field", text: "", key: "氏名", label: "氏名",
          dataType: "text", hint: "氏名を書く欄です" },
        { id: "a_1", type: "answerSpace", text: "", lines: 3, label: "問 1" }
      ];
      c.paint();
    });
    await sleep(300);
    const 見 = await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      const f = sr.querySelector('[data-id="f_1"]');
      const a = sr.querySelector('[data-id="a_1"]');
      return { 欄がある: !!f, 名札: f ? f.querySelector(".wpd-field__l").textContent : "",
        ヒント: f ? f.querySelector(".wpd-field__v").getAttribute("data-ph") : "",
        中身が空: f ? f.querySelector(".wpd-field__v").textContent.trim() === "" : false,
        解答欄の線: a ? a.querySelectorAll(".wpd-ans__l").length : 0 };
    });
    ok("記入欄が 名札つきで 出る", 見.欄がある === true && 見.名札 === "氏名", 見);
    ok("記入欄は 空のまま（値を 作らない）", 見.中身が空 === true, 見);
    ok("記入欄に 入力ヒントが 出る", /氏名を書く/.test(見.ヒント || ""), 見.ヒント);
    ok("解答欄が 3 行 引かれる", 見.解答欄の線 === 3, 見.解答欄の線);

    /* 人が打ったら「人が入れた値」の印がつく（検査が 捏造と 見なさない） */
    await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      const v = sr.querySelector('[data-id="f_1"] .wpd-field__v');
      v.innerHTML = "山田太郎";
      sr.querySelector('[data-role="doc"]').dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    });
    await sleep(600);   /* harvest は 打ち終わってから 走る（すぐには 読めない） */
    const 打つ = await pg.evaluate(() => {
      const b = window.VQ2.workplace.current.session.content.content;
      const f = b.blocks.filter((x) => x.id === "f_1")[0] || {};
      return { text: f.text, key: f.key, label: f.label, userEntered: f.userEntered };
    });
    ok("打った値が 保存される", 打つ.text === "山田太郎", 打つ);
    ok("欄の名前（key / label）が 消えない", 打つ.key === "氏名" && 打つ.label === "氏名", 打つ);
    ok("人が入れた値として 印がつく", 打つ.userEntered === true, 打つ);
  }

  節("見直し（○○ や 生の数式を 本体の見直しが 見つける）");
  {
    const r = await pg.evaluate(() => {
      const c = window.VQ2.workplace.current;
      const b = c.session.content.content;
      b.blocks = [
        { id: "p_1", type: "heading1", text: "会場について" },
        { id: "p_2", type: "paragraph", text: "担当は ○○ さんです" },
        { id: "p_3", type: "paragraph", text: "\\(a+b\\) と 書いた場合" }
      ];
      c.paint();
      return window.VQ2.workplace.cmd.見直す({});
    });
    const 文字 = JSON.stringify(r);
    ok("見直しが 「○○」を 見つける", /埋めていない印/.test(文字), r.見つかったもの);
    ok("見直しが \\( \\) の書きかたを 見つける", /読めません|\\\\\(/.test(文字), r.見つかったもの);
    ok("見つかった数が 0 ではない", r.見つかった数 >= 2, r.見つかった数);
  }

  節("指した所を 直す（1 つに決まらなければ 何もしない）");
  {
    const 曖昧 = await pg.evaluate(() => {
      const c = window.VQ2.workplace.current;
      const b = c.session.content.content;
      b.blocks = [
        { id: "s_1", type: "paragraph", text: "会場は 体育館です" },
        { id: "s_2", type: "paragraph", text: "会場の 準備は 前日" },
        { id: "s_3", type: "paragraph", text: "受付は 9 時から" }
      ];
      c.paint();
      const 前 = JSON.stringify(b.blocks);
      const r = window.VQ2.workplace.cmd.直す({
        まとめて: [{ どこ: { by: "text", contains: "会場" }, 文: "書き換えた" }] });
      return { r: r, 変わったか: JSON.stringify(b.blocks) !== 前 };
    });
    ok("2 か所 当たったら **何もしない**", 曖昧.変わったか === false, 曖昧.r);
    ok("候補を 番号つきで 返す", /1\)/.test((曖昧.r || {}).きくこと || ""), (曖昧.r || {}).きくこと);
    ok("完成と言ってよい = false", 曖昧.r.完成と言ってよい === false, 曖昧.r);

    const 一件 = await pg.evaluate(async () => {
      const r = await window.VQ2.workplace.cmd.直す({
        まとめて: [{ どこ: { by: "text", contains: "受付" }, 文: "受付は 8 時 30 分から" }] });
      const b = window.VQ2.workplace.current.session.content.content;
      return { r: r, いま: b.blocks.map((x) => x.text) };
    });
    ok("1 か所に決まれば 直る", /8 時 30 分/.test(一件.いま.join("")), 一件.いま);
    ok("ほかの所は 変わっていない",
      一件.いま[0] === "会場は 体育館です" && 一件.いま[1] === "会場の 準備は 前日", 一件.いま);
    ok("報告を 機械が 作って 返す", /変更 1 件/.test((一件.r || {}).報告 || ""), (一件.r || {}).報告);
    ok("旧と新を 並べて 出す", /旧「受付は 9 時から」/.test((一件.r || {}).報告 || ""), (一件.r || {}).報告);
    ok("崩れが 無ければ 完成と言ってよい", 一件.r.完成と言ってよい === true, 一件.r);
  }

  節("ピン留め（留めた所は 触らせない）");
  {
    const r = await pg.evaluate(async () => {
      const c = window.VQ2.workplace.current;
      const b = c.session.content.content;
      b.blocks = [{ id: "k_1", type: "paragraph", text: "ここは 触らないで" },
                  { id: "k_2", type: "paragraph", text: "ここは 直してよい" }];
      c.paint();
      await window.VQ2.workplace.cmd.直す({ まとめて: [{ どこ: { by: "nodeId", id: "k_1" }, 留める: true }] });
      const 出 = await window.VQ2.workplace.cmd.直す({ まとめて: [
        { どこ: { by: "nodeId", id: "k_1" }, 文: "こっそり書き換え" },
        { どこ: { by: "nodeId", id: "k_2" }, 文: "こちらは 直る" }] });
      return { 出: 出, いま: b.blocks.map((x) => x.text), 錠: (b.__work || {}).locks };
    });
    ok("ピン留めが 記録される", (r.錠 || []).indexOf("k_1") >= 0, r.錠);
    ok("留めた所は 触らない", r.いま[0] === "ここは 触らないで", r.いま);
    ok("留めていない所は 直る", r.いま[1] === "こちらは 直る", r.いま);
    ok("触らなかったことを 報告に 出す", /未適用/.test((r.出 || {}).報告 || ""), (r.出 || {}).報告);
  }

  節("画面で 選んでいる所を 使える（「ここを直して」の ここ）");
  {
    const r = await pg.evaluate(async () => {
      const c = window.VQ2.workplace.current;
      const b = c.session.content.content;
      b.blocks = [{ id: "v_1", type: "paragraph", text: "1 つめ" },
                  { id: "v_2", type: "paragraph", text: "2 つめ" }];
      c.paint();
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      const el = sr.querySelector('[data-id="v_2"]');
      const rg = document.createRange(), s = window.getSelection();
      rg.selectNodeContents(el); rg.collapse(true);
      s.removeAllRanges(); s.addRange(rg);
      const 選 = window.VQ2.workplace.cmd.選択();
      const 直 = await window.VQ2.workplace.cmd.直す({ まとめて: [{ 文: "選んだ所を 直した" }] });
      return { 選: 選, いま: b.blocks.map((x) => x.text), 直: 直 };
    });
    ok("選んでいる かたまりの id が 取れる", (r.選.ids || [])[0] === "v_2", r.選);
    ok("場所を 言わなくても 選んだ所が 直る", r.いま[1] === "選んだ所を 直した", r.いま);
    ok("選んでいない所は 変わらない", r.いま[0] === "1 つめ", r.いま);
  }

  節("問題用紙（既存の問題 JSON から 3 枚）");
  {
    const r = await pg.evaluate(() => {
      const 問 = [
        { id: "q1", type: "multiple_choice_single", prompt: "正しいものを 選びなさい。", points: 5,
          choices: [{ text: "光は 波である", isCorrect: true }, { text: "光は 音である" },
                    { text: "光は 液体である" }, { text: "光は 金属である" }],
          explanation: "光は 波と 粒の 両方の 性質を もつ。" },
        { id: "q2", type: "short_answer", prompt: "水の 化学式を 書きなさい。",
          points: 3, correctAnswer: "H2O" }
      ];
      const 三 = window.VQW.doctype.exam.三枚(問, { 試験名: "中間試験", 科目: "理科", 試験時間: 50 });
      const doc = window.VQW.ir.toIR("docs", 三.exam_paper);
      return { 満点: 三.満点,
        記入欄: 三.exam_paper.blocks.filter((b) => b.type === "field").map((b) => b.key),
        値が入っていないか: 三.exam_paper.blocks.filter((b) => b.type === "field")
          .every((b) => b.text === ""),
        選択肢: JSON.stringify(三.exam_paper).indexOf("ア．光は 波である") >= 0,
        解答欄: 三.answer_sheet.blocks.filter((b) => b.type === "answerSpace").length,
        正解: JSON.stringify(三.answer_key).indexOf("正解: ア") >= 0,
        崩れ: window.VQW.validate.run("docs", 三.answer_sheet, {}).errors.length,
        埋めていない印: window.VQW.validate.placeholder.check(doc, {}).length };
    });
    ok("満点が 配点の合計（5+3=8）", r.満点 === 8, r.満点);
    ok("氏名・クラス・出席番号が 記入欄として 置かれる",
      ["氏名", "クラス", "出席番号"].every((k) => r.記入欄.indexOf(k) >= 0), r.記入欄);
    ok("記入欄に 値を 入れていない", r.値が入っていないか === true, r);
    ok("選択肢が ア・イ・ウ・エ", r.選択肢 === true, r);
    ok("解答用紙の解答欄が 問題数と 同じ", r.解答欄 === 2, r.解答欄);
    ok("解答解説に 正解が 出る", r.正解 === true, r);
    ok("解答用紙に 崩れが 無い", r.崩れ === 0, r.崩れ);
    ok("問題用紙に 埋めていない印が 0 個", r.埋めていない印 === 0, r.埋めていない印);
  }

  /* ── Sheets ── */
  節("表（列幅を 自動で 中身へ合わせる・値の型）");
  {
    await pg.evaluate(() => {
      const sr = document.getElementById("vq-wp-docs").shadowRoot;
      sr.querySelector('[data-act="close"]').click();
    });
    await sleep(700);
    await pg.evaluate(() => window.VQ2.openWorkplace());
    await pg.waitForSelector("#vq-workplace", { timeout: 10000 });
    await sleep(600);
    await pg.evaluate(() => {
      const sr = document.getElementById("vq-workplace").shadowRoot;
      sr.querySelector('[data-act="new"][data-type="spreadsheet"]').click();
    });
    await pg.waitForSelector("#vq-wp-sheets", { timeout: 10000 });
    await sleep(600);

    const r = await pg.evaluate(async () => {
      const C = window.VQ2.workplace.cmd;
      const 出 = await C.sheets.セル({ cells: [
        { ref: "A1", value: "項目" }, { ref: "B1", value: "金額" },
        { ref: "A2", value: "厚生年金保険料" }, { ref: "B2", value: "18300" },
        { ref: "A3", value: "健康保険料" }, { ref: "B3", value: "9800" },
        { ref: "B4", formula: "=SUM(B2:B3)" }
      ] });
      const b = window.VQ2.workplace.current.session.content.content;
      const sh = b.sheets[0];
      return { 出: 出, colW: sh.colW, 入る: window.VQW.validate.sheets.入る文字数(sh.colW[0] || 96),
               検: window.VQW.validate.run("sheets", b, {}).errors.map((e) => e.code) };
    });
    ok("長いマスに合わせて 列幅が 広がる", Number((r.colW || {})[0]) >= 107, r.colW);
    ok("広げたことを 報告に 出す", /A/.test((r.出 || {}).列幅を合わせた || ""), (r.出 || {}).列幅を合わせた);
    ok("広げたあと 切れが 残っていない", r.検.indexOf("colTooNarrow") < 0, r.検);

    const r2 = await pg.evaluate(async () => {
      const C = window.VQ2.workplace.cmd;
      await C.sheets.セル({ cells: [{ ref: "B5", value: "1,200円" }] });
      const b = window.VQ2.workplace.current.session.content.content;
      return { B5: b.sheets[0].cells.B5,
               検: window.VQW.validate.run("sheets", b, {}).errors.map((e) => e.code) };
    });
    ok("「1,200円」は 数に 直される（合計に 数えられるように）",
      (r2.B5 || {}).v === "1200", r2.B5);
    ok("直したあと 文字の数が 残っていない", r2.検.indexOf("numberAsText") < 0, r2.検);
  }

  節("JS の例外が 出ていない");
  {
    const 実 = 例外.filter((e) => !/Failed to fetch|NetworkError|ERR_|net::/.test(e));
    ok("例外 0 件", 実.length === 0, 実.slice(0, 5));
  }

  console.log("\n══════════════════════════════════════════");
  console.log("  " + pass + " / " + (pass + fail) + " 件 通過");
  if (落ち.length) { console.log("\n  落ちたもの:"); 落ち.forEach((s) => console.log("   ・" + s)); }
  console.log("══════════════════════════════════════════");

  await browser.close();
  server.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("実行できませんでした: " + (e && e.stack || e)); process.exit(2); });
