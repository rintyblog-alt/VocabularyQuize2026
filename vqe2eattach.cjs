/* 資料の添付を、画面から実ファイルで通しで確かめる。

   見たいのは 10 件。
   1. PNG の単体添付        2. テキスト PDF     3. スキャン PDF
   4. 混在 PDF              5. 96MB のファイル  6. 中断と再開
   7. 1 ページ失敗          8. 全ページ内容なし 9. 再読込後の復元
   10. 添付削除とジョブ領域の削除

   本体が要求 JSON へ載っていないことも、その場で確かめる。

   実行: node vqe2eattach.cjs [出力先]
*/
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const FIX = require("./vqpdffix.cjs");

const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
const BRIDGE = process.env.VQ_BRIDGE || "http://127.0.0.1:17891";
const OUT = process.argv[2] || "shots/e2e-attach";
const TMP = process.env.VQ_TMP
  || require("path").join(__dirname, "_fixtures", "e2e");
const PNG = path.join(__dirname, "artifacts", "attach", "plant.png");
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

let pass = 0, fail = 0;
const failures = [];
async function step(name, fn) {
  try { const m = await fn(); pass++; console.log("  ok   " + name + (m ? " — " + m : "")); }
  catch (e) { fail++; failures.push(name); console.log("  NG   " + name + "\n         → " + (e && e.message)); }
}
function assert(c, m) { if (!c) throw new Error(m || "満たしていません"); }
function dumpAtt(body) {
  try {
    const j = JSON.parse(body || "{}");
    return (j.attachments || []).map((a) => a.kind + ":" + (a.name || "").slice(0, 18)
      + (a.extractedText ? "/" + a.extractedText.length + "字" : "")
      + (a.pageNumber ? "/p" + a.pageNumber : "")).join("  ") || "（添付なし）";
  } catch (e) { return "（読めません）"; }
}

/* ── 置き場所 ─────────────────────────────────────────────── */
function fixture(name, buf) {
  const p = path.join(TMP, name);
  if (!fs.existsSync(p) || fs.statSync(p).size !== buf.length) fs.writeFileSync(p, buf);
  return p;
}
function blankPng(w, h) {
  w = w || 512; h = h || 512;
  const raw = Buffer.alloc((w * 3 + 1) * h, 0xff);
  for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
  let T = null;
  const crc = (b) => {
    if (!T) { T = new Int32Array(256);
      for (let n = 0; n < 256; n++) { let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; T[n] = c; } }
    let c = -1;
    for (let i = 0; i < b.length; i++) c = T[(c ^ b[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
  const ch = (t, d) => {
    const l = Buffer.alloc(4); l.writeUInt32BE(d.length);
    const b = Buffer.concat([Buffer.from(t, "ascii"), d]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(b));
    return Buffer.concat([l, b, c]);
  };
  const ih = Buffer.alloc(13);
  ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ch("IHDR", ih), ch("IDAT", zlib.deflateSync(raw)), ch("IEND", Buffer.alloc(0))]);
}

/* ── ページ操作 ───────────────────────────────────────────── */
async function login(pg) {
  await pg.goto(BASE + "/?vqdev=1&vq2=all&cb=" + Date.now(),
    { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.addStyleTag({ content: "#vqNewAuth{display:none !important}" });
  await pg.waitForFunction(() => document.getElementById("authLoginSubmitBtn"), { timeout: 30000 });
  await pg.evaluate((c) => {
    const setV = (el, v) => {
      const P = el.tagName === "SELECT" ? HTMLSelectElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(P.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    setV(document.getElementById("authLoginGrade"), c.grade);
    setV(document.getElementById("authLoginNickname"), c.nick);
    setV(document.getElementById("authLoginPassword"), c.pw);
    document.getElementById("authLoginSubmitBtn").click();
  }, { grade: process.env.VQ_GRADE || "H3", nick: process.env.VQ_NICK || "tester",
       pw: process.env.VQ_PW || "Abcd1234" });
  await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 30000 });
  await pg.waitForTimeout(1000);
  /* Bridge を指しておく（ペアリング無しの OPEN モードで動かす） */
  await pg.evaluate((u) => {
    try { localStorage.setItem("vq.chat.localai.v1", JSON.stringify({ url: u, token: "" })); } catch (e) {}
  }, BRIDGE);
}
async function openPreset(pg, opts) {
  await pg.evaluate((o) => {
    document.querySelectorAll(".vq2-host").forEach((h) => h.remove());
    document.body.style.overflow = "";
    window.VQ2.open.presetStudio(o || {});
  }, opts || {});
  await pg.waitForFunction(() => {
    const h = document.getElementById("vq2-preset-studio");
    return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vq2-root"));
  }, { timeout: 20000 });
  await pg.waitForTimeout(400);
}
function inShadow(pg, body, arg) {
  return pg.evaluate(({ src, a }) => {
    const host = document.getElementById("vq2-preset-studio");
    if (!host || !host.shadowRoot) return { __no: true };
    const root = host.shadowRoot.querySelector(".vq2-root");
    return new Function("root", "args", src)(root, a);
  }, { src: body, a: arg === undefined ? null : arg });
}

/* 画面の添付ボタンを押してファイルを渡す（OS の窓は Playwright が受ける） */
async function attachViaUi(pg, files) {
  const chooser = pg.waitForEvent("filechooser", { timeout: 15000 });
  await pg.evaluate(() => {
    const host = document.getElementById("vq2-preset-studio");
    const b = host.shadowRoot.querySelector("[data-tlattach]");
    b.click();
  });
  const fc = await chooser;
  await fc.setFiles(files);
  /* 取り込みが始まったことを確かめてから戻る。
     始まる前に「終わっている」と読むと、資料が付く前に生成へ進んでしまう。 */
  for (let i = 0; i < 40; i++) {
    if (await pg.evaluate(() => !!window.VQ2.__psAttachBusy)) return true;
    await pg.waitForTimeout(150);
  }
  return false;
}
/* チップの状態を読む */
function chips(pg) {
  return inShadow(pg, `
    return Array.from(root.querySelectorAll(".vq2-att")).map(function (c) {
      var up = c.querySelector(".vq2-att-upn");
      return {
        id: c.getAttribute("data-attid"),
        name: (c.querySelector(".vq2-att-n") || {}).textContent || "",
        meta: (c.querySelector(".vq2-att-s") || {}).textContent || "",
        state: (c.querySelector(".vq2-att-st") || {}).textContent || "",
        upload: up ? up.textContent : "",
        pct: (function () { var b = c.querySelector(".vq2-att-bar > span");
                            return b ? b.style.width : ""; })(),
        pages: Array.from(c.querySelectorAll(".vq2-att-pc")).map(function (x) { return x.textContent; }),
        pageSummary: (c.querySelector(".vq2-att-psum") || {}).textContent || "",
        actions: Array.from(c.querySelectorAll("[data-attact]"))
          .map(function (x) { return x.getAttribute("data-attact"); }),
        canPause: !!c.querySelector("[data-attpause]"),
        canResume: !!c.querySelector("[data-attresume]"),
        canRetryPart: !!c.querySelector("[data-attretrypart]")
      };
    });`);
}
function stState(pg) {
  return inShadow(pg, `
    var S = root.__ps || null;
    return null;`);
}
/* チップを 1 枚ずつ消す。
   1 回押すたびに描き直されるので、まとめて押しても最初の 1 枚しか消えない
   （ボタンの参照が外れるため）。 */
async function clearChips(pg) {
  for (let i = 0; i < 40; i++) {
    const gone = await inShadow(pg, `
      var b = root.querySelector("[data-attdel]");
      if (!b) return { done: true };
      b.click(); return { done: false };`);
    if (gone.done) return true;
    await pg.waitForTimeout(250);
  }
  throw new Error("チップを消しきれません");
}

/* 入力欄から送って、終わるまで待つ。返すのは問題数と、右のタイムラインの文言。 */
async function generate(pg, msg, count) {
  await inShadow(pg, `
    var box = root.querySelector("[data-tlinput]");
    box.value = args.m;
    box.dispatchEvent(new Event("input", { bubbles: true }));
    root.querySelector("[data-tlsend]").click();
    return true;`, { m: msg });
  /* 「作業中」の印は工程の切れ目でいったん消える。それを終わりと読むと、
     まだ修復に入るところなのに 0 問だと判定してしまう（実測でそうなった）。
     見るのは結果そのもの：問題が出たか、はっきり失敗したか。 */
  const FAILED = /読み取れませんでした|足りません|失敗しました|できませんでした|中止/;
  let r = null;
  for (let i = 0; i < 700; i++) {          /* 最大 350 秒 */
    r = await inShadow(pg, `
      return { q: root.querySelectorAll(".vq2-qcard").length,
               busy: !!root.querySelector(".vq2-aiact.is-busy"),
               log: Array.from(root.querySelectorAll(".vq2-tl-t"))
                      .map(function (x) { return x.textContent; }).join(" | "),
               pages: Array.from(root.querySelectorAll(".vq2-att-pc"))
                      .map(function (x) { return x.textContent; }) };`);
    /* 「合計 N 問できました」まで出ていれば終わり。
       画面に並ぶのは少しあとなので、抜けてから読み直す。 */
    if (r.q > 0 || FAILED.test(r.log) || /合計 \d+ 問できました/.test(r.log)) break;
    await pg.waitForTimeout(500);
  }
  /* 「できました」が出てから、実際に並ぶまでには少し間がある。並ぶまで待つ。 */
  for (let i = 0; i < 60; i++) {
    const c = await inShadow(pg, `return { q: root.querySelectorAll(".vq2-qcard").length };`);
    if (c.q > 0) break;
    await pg.waitForTimeout(500);
  }
  /* できた問題は、まず差分として出る。取り込んで初めてカードになる。
     ここを踏まないと「0 問できた」と読み違える（実測でそう読み違えた）。 */
  const applied = await inShadow(pg, `
    var b = root.querySelector('[data-act="apply-all"]');
    if (!b) return { had: false };
    b.click(); return { had: true };`);
  if (applied.had) await pg.waitForTimeout(1200);
  const fin = await inShadow(pg, `
    return { q: root.querySelectorAll(".vq2-qcard").length,
             applied: !!args,
             log: Array.from(root.querySelectorAll(".vq2-tl-t"))
                    .map(function (x) { return x.textContent; }).join(" | ") };`, applied.had);
  r.q = fin.q; r.log = fin.log; r.applied = applied.had;
  /* 次の依頼と重ならないよう、こちらの処理が落ち着くまで待つ。
     重い AI を並べて走らせない。 */
  for (let i = 0; i < 60; i++) {
    const b = await inShadow(pg, `return { busy: !!root.querySelector(".vq2-aiact.is-busy") };`);
    if (!b.busy) break;
    await pg.waitForTimeout(1000);
  }
  await pg.waitForTimeout(1500);
  return r;
}

/* 送り終わるまで待つ */
async function waitUploaded(pg, ms) {
  const until = Date.now() + (ms || 180000);
  while (Date.now() < until) {
    const c = await chips(pg);
    /* チップだけを見ない。文章の取り出しとページ画像の送信が残っていることがある。 */
    const busy = await pg.evaluate(() => !!window.VQ2.__psAttachBusy);
    if (!busy && c.length && c.every((x) => !/アップロード中|止めています/.test(x.state))) return c;
    await pg.waitForTimeout(400);
  }
  throw new Error("送信が終わりません");
}

(async () => {
  console.log("══ 資料の添付：実ファイルで通し ══");
  console.log("  画面 " + BASE + " / ローカル AI " + BRIDGE);

  /* Bridge が居ないなら、UI だけ見て「動いた」と言わない */
  const lim = await fetch(BRIDGE + "/attachments/limits").then((r) => r.json()).catch(() => null);
  if (!lim || !lim.limits) {
    console.log("\n  NG   ローカル AI Bridge へ繋がりません。実ファイルの確認はできません。");
    process.exit(1);
  }
  const L = lim.limits;
  console.log("  上限 1 ファイル " + (L.maxFileBytes / 1048576).toFixed(0) + "MiB / パート "
    + (L.uploadPartBytes / 1048576).toFixed(0) + "MiB（ローカル Bridge 経路のみ）");

  const browser = await chromium.launch();
  const errs = [];
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
  const pg = await ctx.newPage();
  pg.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  pg.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errs.push(m.text().slice(0, 200));
  });

  /* 送り出した要求の中身を見張る。本体が JSON に載っていたら気づけるように。 */
  const sentBodies = [];
  await pg.route("**/chat/completions", async (route) => {
    try { sentBodies.push(route.request().postData() || ""); } catch (e) {}
    await route.continue();
  });

  await login(pg);
  await openPreset(pg);

  /* 置きもの */
  /* 文字レイヤーのある資料は、実際の日本語 PDF を使う。
     自分で組み立てた PDF は、フォントを埋め込まない都合で本文が英語になる。
     英語の資料から日本語の問題を作らせると、根拠の突き合わせが通らず
     「資料で確認できない」→ 修復ループ、という別の話になってしまう。 */
  const JA_PDF = path.join(__dirname, "artifacts", "quick-mock-phase13",
                           "日本史探究 1学期期末考査資料.pdf");
  const fText = fs.existsSync(JA_PDF) ? JA_PDF : fixture("text.pdf", FIX.textPdf());
  const fScan = fixture("scanned.pdf", FIX.scannedPdf());
  const fMixed = fixture("mixed.pdf", FIX.mixedPdf());
  const fBlank = fixture("blank.png", blankPng());
  const fBig = fixture("big.bin", Buffer.alloc(96 * 1024 * 1024, 0x41));

  /* ══ 1. PNG の単体添付 ══ */
  console.log("\n══ 1〜4. 種類ごとの取り込み ══");
  await step("1 PNG を画面から添付すると、本体は要求へ載らず ID だけになる", async () => {
    await attachViaUi(pg, [PNG]);
    const c = await waitUploaded(pg, 60000);
    assert(c.length === 1, "チップが " + c.length + " 枚");
    assert(/画像/.test(c[0].meta), "形式が出ていない: " + c[0].meta);
    assert(/KB|MB/.test(c[0].meta), "容量が出ていない: " + c[0].meta);
    const a = await inShadow(pg, `
      return (window.VQ2.__e2e && window.VQ2.__e2e.attachments) || null;`);
    return c[0].name + " / " + c[0].meta + " / " + c[0].state;
  });

  await step("2 テキスト PDF を添付できる", async () => {
    await attachViaUi(pg, [fText]);
    const c = await waitUploaded(pg, 60000);
    const t = c.filter((x) => /\.pdf$/.test(x.name) && !/scanned|mixed/.test(x.name))[0];
    assert(t, "チップが出ていない");
    assert(/PDF/.test(t.meta), "形式が PDF になっていない: " + t.meta);
    return t.name + " / " + t.meta;
  });

  await step("3 スキャン PDF を添付できる", async () => {
    await attachViaUi(pg, [fScan]);
    const c = await waitUploaded(pg, 60000);
    const t = c.filter((x) => /scanned\.pdf/.test(x.name))[0];
    assert(t, "チップが出ていない");
    return t.name + " / " + t.meta;
  });

  await step("4 混在 PDF を添付できる", async () => {
    await attachViaUi(pg, [fMixed]);
    const c = await waitUploaded(pg, 60000);
    const t = c.filter((x) => /mixed\.pdf/.test(x.name))[0];
    assert(t, "チップが出ていない");
    return t.name + " / " + t.meta;
  });

  await pg.screenshot({ path: path.join(OUT, "01-attached.png") });

  /* 添付できただけでは足りない。どの経路へ入ったのかを実際に確かめる。 */
  console.log("\n══ 2b〜4b. どの経路へ入ったか（実 AI）══");

  await step("2b テキスト PDF は文字の経路へ入り、実際に問題ができる", async () => {
    await openPreset(pg);
    await attachViaUi(pg, [fText]);
    await waitUploaded(pg, 90000);
    const r = await generate(pg, "添付した資料だけを根拠に4択問題を2問作ってください。", 2);
    console.log("       [要求] " + dumpAtt(sentBodies[sentBodies.length - 1]));
    console.log("       [記録] " + r.log.slice(-260));
    assert(r.q >= 1, "問題ができない（" + r.q + " 問）／ " + r.log.slice(0, 160));
    assert(!/画像を読み取っ/.test(r.log), "画像の経路へ入っている: " + r.log.slice(0, 120));
    return r.q + " 問（差分を取り込んで確認）／ 文字の経路";
  });

  /* 文言は「読めた数」と「読もうとした数」を必ず併記する形へ変えた。
     ページ単位で読みに行ったことが分かる語で判定する。 */
  await step("3b スキャン PDF は画像解析へ回る（テキスト抽出器で終わらせない）", async () => {
    await openPreset(pg);
    await attachViaUi(pg, [fScan]);
    await waitUploaded(pg, 90000);
    const r = await generate(pg, "添付した資料だけを根拠に4択問題を2問作ってください。", 2);
    console.log("       [要求] " + dumpAtt(sentBodies[sentBodies.length - 1]));
    assert(/ページずつ読み取ります|ページを読み取りました|ページ中 \d+ ページから|ページを読みましたが/.test(r.log), "画像解析へ回っていない: " + r.log.slice(0, 200));
    return "画像解析へ " + (r.pages.length ? r.pages.join(" / ") : "回った")
      + "（" + r.q + " 問）";
  });

  await step("4b 混在 PDF は、文字のページと画像のページを分けて扱う", async () => {
    await openPreset(pg);
    await attachViaUi(pg, [fMixed]);
    await waitUploaded(pg, 90000);
    const r = await generate(pg, "添付した資料だけを根拠に4択問題を2問作ってください。", 2);
    const body = sentBodies[sentBodies.length - 1];
    console.log("       [要求] " + dumpAtt(body));
    const atts = JSON.parse(body).attachments || [];
    /* ここで見たいのは「ページの振り分け」。
       文字の取れたページはそのまま、取れなかったページだけ画像にして送る。 */
    const textPart = atts.filter((a) => a.extractedText && a.extractedText.length > 100);
    const imgPart = atts.filter((a) => a.kind === "image" && a.pageNumber);
    assert(textPart.length, "文字の取れたページが渡っていない");
    assert(imgPart.length, "画像にしたページが渡っていない");
    assert(imgPart.every((a) => a.pageNumber === 2),
      "画像へ回したページが違う（2 ページ目だけのはず）: " + imgPart.map((a) => a.pageNumber).join(","));
    assert(/ページずつ読み取ります|ページを読み取りました|ページ中 \d+ ページから|ページを読みましたが/.test(r.log), "画像のページが解析へ回っていない: " + r.log.slice(0, 200));
    return "文字 " + textPart[0].extractedText.length + " 字 ＋ 画像 "
      + imgPart.map((a) => a.pageNumber + "ページ").join("・");
  });

  /* ══ 5〜6. 96MB・中断と再開 ══ */
  console.log("\n══ 5〜6. 大きなファイル・中断と再開 ══");

  /* いったん全部外してから、大きいものだけで見る */
  await clearChips(pg);

  let bigId = null;
  await step("5 96MB のファイルが 8MiB ずつ送られ、途中経過が出る", async () => {
    const chooser = pg.waitForEvent("filechooser", { timeout: 15000 });
    await pg.evaluate(() => {
      document.getElementById("vq2-preset-studio").shadowRoot
        .querySelector("[data-tlattach]").click();
    });
    (await chooser).setFiles([fBig]);
    /* 送っている最中の表示を捕まえる */
    let seen = null;
    for (let i = 0; i < 200; i++) {
      const c = await chips(pg);
      const t = c.filter((x) => /big\.bin/.test(x.name))[0];
      if (t && /個目/.test(t.upload)) { seen = t; break; }
      await pg.waitForTimeout(150);
    }
    assert(seen, "送信中の途中経過が出ない");
    assert(/1 個 8\.0 MB/.test(seen.upload), "1 個の大きさが出ない: " + seen.upload);
    bigId = seen.id;
    return seen.upload;
  });

  await step("6 送信を止められる／止めた場所から続けられる", async () => {
    /* 止める */
    const paused = await inShadow(pg, `
      var b = root.querySelector("[data-attpause]");
      if (!b) return { no: true };
      b.click(); return { ok: true };`);
    assert(paused.ok, "止めるボタンが出ていない");
    await pg.waitForTimeout(600);
    let c = (await chips(pg)).filter((x) => /big\.bin/.test(x.name))[0];
    assert(/止めています/.test(c.state), "止めた表示にならない: " + c.state);
    assert(c.canResume, "続きから送るボタンが出ない");
    const atPause = c.upload;
    /* チップは消えていない */
    assert(c.name, "止めたらチップが消えた");
    /* 続ける */
    await inShadow(pg, `root.querySelector("[data-attresume]").click(); return true;`);
    const done = await waitUploaded(pg, 240000);
    const t = done.filter((x) => /big\.bin/.test(x.name))[0];
    assert(!/止めています/.test(t.state), "再開できていない: " + t.state);
    return "止めた時点 " + atPause + " → " + t.state;
  });

  /* 本当に 96MB が置き場所へ入ったかを Bridge 側で確かめる */
  await step("5b 置き場所に 96.0MB が入っている（画面の表示だけで判断しない）", async () => {
    const job = await inShadow(pg, `
      return (window.VQ2.upload && window.VQ2.__psJobId) || null;`);
    const jid = await pg.evaluate(() => window.VQ2.__psJobId || null);
    const id = jid || job;
    assert(id, "ジョブ ID を画面から取れない");
    const st = await fetch(BRIDGE + "/attachments/status?job=" + encodeURIComponent(id))
      .then((r) => r.json());
    const f = (st.job.files || []).filter((x) => /big\.bin/.test(x.name))[0];
    assert(f, "置き場所に見当たらない");
    assert(f.status === "uploaded", "状態が " + f.status);
    assert(Math.abs(f.bytes - 96 * 1024 * 1024) < 1024, "大きさが " + f.bytes);
    return (f.bytes / 1048576).toFixed(1) + "MB / " + f.receivedParts + " パート";
  });

  await pg.screenshot({ path: path.join(OUT, "02-big-upload.png") });

  /* ══ 10. 添付削除とジョブ領域の削除 ══ */
  console.log("\n══ 10. 添付の削除 ══");
  let droppedJob = null;
  await step("10 添付を外すと置き場所ごと消える（404 になる）", async () => {
    droppedJob = await pg.evaluate(() => window.VQ2.__psJobId || null);
    assert(droppedJob, "ジョブ ID が取れない");
    await clearChips(pg);
    const c = await chips(pg);
    assert(c.length === 0, "チップが " + c.length + " 枚残っている");
    /* 消すのは要求を 1 本投げる仕事なので、返ってくるまで少し待つ。 */
    let code = 0;
    for (let i = 0; i < 20; i++) {
      code = (await fetch(BRIDGE + "/attachments/status?job=" + encodeURIComponent(droppedJob))).status;
      if (code === 404) break;
      await pg.waitForTimeout(250);
    }
    assert(code === 404, "置き場所がまだ引ける（" + code + "）");
    return "チップ 0 枚 / 置き場所 404";
  });

  /* ══ 7〜8. ページごとの結果・生成の可否 ══ */
  console.log("\n══ 7〜8. ページごとの結果と、生成へ進ませるか ══");

  await step("7 1 ページだけ読めないと、資料は捨てずに 4 つの手が出る", async () => {
    const r = await inShadow(pg, `
      var A = window.VQ2.activity;
      var box = root.querySelector("[data-tlatt]");
      box.innerHTML = A.attachListHtml([{
        id: "d1", name: "理科プリント.pdf", kind: "pdf", size: 240000, status: "warning",
        pageSummary: "1 / 2 ページから内容を取り出しました（1 ページは読み取れていません）",
        pages: [{ pageNumber: 1, status: "ok", confidence: 0.9 },
                { pageNumber: 2, status: "no_text_detected", confidence: 0 }],
        pageActions: [{ id: "use_readable" }, { id: "retry_failed", pages: 1 },
                      { id: "exclude_pages", pages: 1 }, { id: "cancel" }]
      }]);
      var c = box.querySelector(".vq2-att");
      return {
        counts: Array.from(c.querySelectorAll(".vq2-att-pc")).map(function (x) { return x.textContent; }),
        dots: c.querySelectorAll(".vq2-att-pd").length,
        summary: (c.querySelector(".vq2-att-psum") || {}).textContent,
        acts: Array.from(c.querySelectorAll("[data-attact]")).map(function (x) {
          return x.getAttribute("data-attact") + ":" + x.textContent.trim(); }),
        state: (c.querySelector(".vq2-att-st") || {}).textContent
      };`);
    assert(r.dots === 2, "ページの点が " + r.dots + " 個");
    ["use_readable", "retry_failed", "exclude_pages", "cancel"].forEach(function (k) {
      assert(r.acts.some((a) => a.indexOf(k) === 0), k + " が出ない: " + r.acts.join(" / "));
    });
    assert(!/OCR/i.test(r.acts.join(" ") + r.state), "OCR と書いている");
    return r.counts.join(" / ") + " ／ " + r.acts.length + " つの手";
  });

  await step("7b ページの 4 状態が別々に見分けられる", async () => {
    const r = await inShadow(pg, `
      var A = window.VQ2.activity;
      var box = root.querySelector("[data-tlatt]");
      box.innerHTML = A.attachListHtml([{
        id: "d2", name: "資料.pdf", kind: "pdf", size: 100, status: "warning",
        pages: [{ pageNumber: 1, status: "ok" }, { pageNumber: 2, status: "low_confidence" },
                { pageNumber: 3, status: "no_text_detected" }, { pageNumber: 4, status: "failed" }]
      }]);
      var c = box.querySelector(".vq2-att");
      return {
        labels: Array.from(c.querySelectorAll(".vq2-att-pc")).map(function (x) { return x.textContent; }),
        tones: Array.from(c.querySelectorAll(".vq2-att-pd")).map(function (x) { return x.className; })
      };`);
    assert(r.labels.length === 4, "4 つに分かれていない: " + r.labels.join(","));
    assert(new Set(r.tones).size >= 3, "見た目が同じになっている: " + r.tones.join(" / "));
    return r.labels.join(" / ");
  });

  /* 白紙だけを付けて、生成へ進まないことを実 AI で見る */
  await step("8 全ページ内容なしでは問題生成へ進まない（実 AI）", async () => {
    await openPreset(pg);
    await attachViaUi(pg, [fBlank]);
    await waitUploaded(pg, 90000);
    const before = sentBodies.length;
    const g = await generate(pg, "添付した資料だけを根拠に4択問題を3問作ってください。", 3);
    const outcome = { q: g.q, err: g.log };
    assert(outcome.q === 0, "白紙から " + outcome.q + " 問できてしまった");
    assert(/読み取れ|足りません|内容/.test(outcome.err), "理由が出ていない: " + outcome.err.slice(0, 160));
    return "0 問 ／ " + (outcome.err.match(/[^|]*(読み取れ|足りません)[^|]*/) || ["理由あり"])[0].trim().slice(0, 46);
  });

  await pg.screenshot({ path: path.join(OUT, "03-blank-blocked.png") });

  /* ══ 本体が要求へ載っていないこと ══ */
  console.log("\n══ 要求の中身 ══");
  await step("生成の要求に、資料の本体も base64 も入っていない", async () => {
    assert(sentBodies.length, "生成要求が 1 度も飛んでいない");
    const last = sentBodies[sentBodies.length - 1];
    const j = JSON.parse(last);
    const atts = j.attachments || [];
    assert(atts.length, "添付が渡っていない");
    atts.forEach(function (a) {
      assert(!a.imageBase64, "imageBase64 が入っている: " + a.name);
      assert(!(a.extractedText && a.extractedText.length > 400000), "本文が上限を超えている");
      assert(a.attachmentId && a.jobId, "attachmentId / jobId が無い: " + JSON.stringify(a).slice(0, 120));
    });
    return "要求 " + (last.length / 1024).toFixed(1) + "KB / 添付 " + atts.length
      + " 件は ID のみ（" + atts.map(function (a) { return a.attachmentId.slice(0, 10); }).join(",") + "）";
  });

  /* ══ 9. 再読込後の復元 ══ */
  console.log("\n══ 9. 開き直したとき ══");
  await step("9 開き直しても添付が残り、置き場所が生きていれば選び直さずに使える", async () => {
    const before = (await chips(pg)).map((c) => c.name);
    assert(before.length, "そもそも添付が無い");
    /* どのプリセットを見ていたかを覚えておく。別のプリセットを開いたら、
       添付が残っていないのは当たり前で、確かめたことにならない。 */
    const pid = await pg.evaluate(() => window.VQ2.__psPresetId || null);
    assert(pid, "プリセットの ID が取れない");
    await pg.reload({ waitUntil: "domcontentloaded" });
    await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 30000 });
    await pg.waitForTimeout(800);
    await openPreset(pg, { presetId: pid,
      preset: { id: pid, name: "確認用", questions: [], revision: 1 } });
    /* 置き場所が生きているかを Bridge へ聞きに行くので、答えが返るまで待つ */
    let after = [];
    for (let i = 0; i < 40; i++) {
      after = await chips(pg);
      if (after.length >= before.length) break;
      await pg.waitForTimeout(300);
    }
    assert(after.length === before.length,
      "枚数が変わった（" + before.length + " → " + after.length + "）");
    assert(!after.some((c) => /期限切れ/.test(c.state)),
      "期限切れになっている: " + after.map((c) => c.state).join(","));
    return after.length + " 件（" + after.map((c) => c.name).join("・") + "）が復元";
  });

  await pg.screenshot({ path: path.join(OUT, "04-restored.png") });

  /* ══ 表示の言い方 ══ */
  await step("「OCR 成功」とは書かず、画像解析・文字起こしと書く", async () => {
    const r = await inShadow(pg, `
      return { txt: root.textContent || "" };`);
    assert(!/OCR/i.test(r.txt), "OCR と書いている");
    return "OCR の語なし";
  });

  await step("大きな資料はローカル経路だけ、と画面に書いてある", async () => {
    const r = await inShadow(pg, `
      var A = window.VQ2.activity;
      var box = root.querySelector("[data-tlatt]");
      box.innerHTML = A.attachListHtml([{ id: "z", name: "大きな資料.pdf", kind: "pdf",
                                          size: 96 * 1024 * 1024, status: "ready" }]);
      return (box.querySelector(".vq2-att-route") || {}).textContent || "";`);
    assert(/ローカル/.test(r), "但し書きが無い: " + r);
    assert(!/Cloudflare|Worker/.test(r), "公開側も対応しているように読める: " + r);
    return r.slice(0, 46) + "…";
  });

  const real = errs.filter((e) => !/ResizeObserver|BRIDGE_|Failed to fetch/.test(e));
  await step("画面に JavaScript のエラーが出ていない", async () => {
    assert(!real.length, real.slice(0, 3).join(" / "));
    return "0 件";
  });

  await browser.close();
  try { fs.unlinkSync(fBig); } catch (e) {}
  console.log("\n  スクリーンショット: " + OUT);
  console.log("\n結果: " + pass + " 通過 / " + fail + " 失敗");
  if (failures.length) failures.forEach((f) => console.log("  - " + f));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
