/* P0：biomimetics.pdf（60.5MB）で資料作問が壊れる件の再現。

   モックは使わない。ブラウザから実際に添付し、解析させ、10 問を頼む。
   そのうえで「どこで最初に食い違ったか」を出すために、次を jobId 単位で記録する。

     attachmentId / analysisJobId / generationJobId
     添付状態の全遷移 / ページ総数 / 解析対象ページ数
     成功・低信頼・文字なし・失敗ページ数
     extractedText 文字数 / evidence 数
     論点抽出の入出力 / 問題生成の入出力 / 構造化解析の結果
     再試行回数 / completed を発火した場所

   実行: node vqp0repro.cjs [出力先]
*/
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
const BRIDGE = process.env.VQ_BRIDGE || "http://127.0.0.1:17891";
const PDF = process.env.VQ_PDF || "/Users/user/Downloads/biomimetics.pdf";
const COUNT = Number(process.env.VQ_Q) || 10;
const OUT = process.argv[2] || "shots/p0";
fs.mkdirSync(OUT, { recursive: true });

const LOG = [];
function rec(kind, data) {
  const e = { at: Date.now(), kind, data };
  LOG.push(e);
  return e;
}

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
  await pg.evaluate((u) => {
    try { localStorage.setItem("vq.chat.localai.v1", JSON.stringify({ url: u, token: "" })); } catch (e) {}
  }, BRIDGE);
}
function inShadow(pg, body, arg) {
  return pg.evaluate(({ src, a }) => {
    const host = document.getElementById("vq2-preset-studio");
    if (!host || !host.shadowRoot) return { __no: true };
    const root = host.shadowRoot.querySelector(".vq2-root");
    return new Function("root", "args", src)(root, a);
  }, { src: body, a: arg === undefined ? null : arg });
}
function chips(pg) {
  return inShadow(pg, `
    return Array.from(root.querySelectorAll(".vq2-att")).map(function (c) {
      return {
        id: c.getAttribute("data-attid"),
        name: (c.querySelector(".vq2-att-n") || {}).textContent || "",
        state: (c.querySelector(".vq2-att-st") || {}).textContent || "",
        upload: (c.querySelector(".vq2-att-upn") || {}).textContent || "",
        pages: Array.from(c.querySelectorAll(".vq2-att-pc")).map(function (x) { return x.textContent; }),
        summary: (c.querySelector(".vq2-att-psum") || {}).textContent || "",
        actions: Array.from(c.querySelectorAll("[data-attact]"))
          .map(function (x) { return x.getAttribute("data-attact"); })
      };
    });`);
}

(async () => {
  console.log("══ P0 再現：biomimetics.pdf ══");
  const st = fs.statSync(PDF);
  console.log("  資料: " + path.basename(PDF) + " / " + (st.size / 1048576).toFixed(1) + "MB");
  console.log("  問題数: " + COUNT + " / 資料だけを根拠にする: ON");

  const lim = await fetch(BRIDGE + "/attachments/limits").then((r) => r.json()).catch(() => null);
  if (!lim) { console.log("\n  NG  Bridge へ繋がりません。実ファイルの確認はできません。"); process.exit(1); }

  const startedAt = Date.now();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 980 } });
  const pg = await ctx.newPage();
  pg.on("pageerror", (e) => rec("pageerror", String(e).slice(0, 300)));
  pg.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text()))
      rec("consoleerror", m.text().slice(0, 300));
  });

  /* 生成要求と、返ってきた SSE を丸ごと押さえる */
  const requests = [];
  await pg.route("**/chat/completions", async (route) => {
    let body = null;
    try { body = JSON.parse(route.request().postData() || "{}"); } catch (e) {}
    const entry = {
      at: Date.now(),
      attachments: (body && body.attachments || []).map((a) => ({
        id: a.id, attachmentId: a.attachmentId, jobId: a.jobId, name: a.name,
        kind: a.kind, pageNumber: a.pageNumber, parent: a.parentAttachmentId,
        chars: (a.extractedText || "").length, hasB64: !!a.imageBase64,
        pageCount: a.pageCount
      })),
      options: body && body.options,
      message: (body && body.message || "").slice(0, 120),
      bytes: (route.request().postData() || "").length
    };
    requests.push(entry);
    rec("request", entry);
    await route.continue();
  });

  await login(pg);
  await pg.evaluate(() => {
    document.querySelectorAll(".vq2-host").forEach((h) => h.remove());
    window.VQ2.open.presetStudio({});
  });
  await pg.waitForFunction(() => {
    const h = document.getElementById("vq2-preset-studio");
    return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vq2-root"));
  }, { timeout: 20000 });

  /* ── 添付 ── */
  console.log("\n── 添付 ──");
  const chooser = pg.waitForEvent("filechooser", { timeout: 20000 });
  await pg.evaluate(() => {
    document.getElementById("vq2-preset-studio").shadowRoot
      .querySelector("[data-tlattach]").click();
  });
  (await chooser).setFiles([PDF]);

  /* 添付カードの状態を、変わるたびに残す */
  const seen = new Set();
  const t0 = Date.now();
  let busy = true;
  while (Date.now() - t0 < 900000) {
    const c = await chips(pg);
    const b = await pg.evaluate(() => !!window.VQ2.__psAttachBusy);
    const key = JSON.stringify(c.map((x) => [x.name, x.state, x.upload, x.pages, x.actions]));
    if (!seen.has(key)) {
      seen.add(key);
      rec("chip", c);
      c.forEach((x) => console.log("  [" + ((Date.now() - t0) / 1000).toFixed(0) + "s] "
        + x.state + (x.upload ? " / " + x.upload : "") + (x.pages.length ? " / " + x.pages.join(" ") : "")));
    }
    if (!b && c.length) { busy = false; break; }
    await pg.waitForTimeout(400);
  }
  const jobId = await pg.evaluate(() => window.VQ2.__psJobId || null);
  console.log("  jobId: " + jobId);
  const jobSt = jobId ? await fetch(BRIDGE + "/attachments/status?job=" + encodeURIComponent(jobId))
    .then((r) => r.json()).catch(() => null) : null;
  if (jobSt && jobSt.job) {
    rec("jobstatus", jobSt.job);
    console.log("  置き場所の中身:");
    jobSt.job.files.forEach((f) => console.log("    " + f.kind + " " + f.name.slice(0, 44)
      + " " + (f.bytes / 1048576).toFixed(2) + "MB " + f.status));
  }
  /* 端末側で PDF から何が取れたか */
  const local = await pg.evaluate(() => (window.__vqChatFiles ? window.__vqChatFiles.list() : [])
    .map((x) => ({ name: x.name, status: x.status, pageCount: x.pageCount,
                   chars: String(x.text || "").length,
                   pagesWithText: (x.pages || []).filter((p) => p.text).length,
                   pageImages: (x.pageImages || []).length })));
  rec("localextract", local);
  console.log("  端末側の読み取り: " + JSON.stringify(local));

  await pg.screenshot({ path: path.join(OUT, "01-attached.png") });

  /* ── 生成 ── */
  console.log("\n── 生成（" + COUNT + "問・資料だけを根拠にする ON）──");
  await inShadow(pg, `
    var chk = root.querySelector('[data-key="sourceOnly"]');
    if (chk && !chk.checked) chk.click();
    var box = root.querySelector("[data-tlinput]");
    box.value = args.m;
    box.dispatchEvent(new Event("input", { bubbles: true }));
    root.querySelector("[data-tlsend]").click();
    return true;`, { m: "添付した資料だけを根拠に、4択問題を" + COUNT + "問作ってください。" });

  const tl = new Set();
  const g0 = Date.now();
  let last = null;
  while (Date.now() - g0 < 1500000) {
    last = await inShadow(pg, `
      return {
        q: root.querySelectorAll(".vq2-qcard").length,
        diff: !!root.querySelector('[data-act="apply-all"]'),
        busy: !!root.querySelector(".vq2-aiact.is-busy"),
        lines: Array.from(root.querySelectorAll(".vq2-tl-t, .vq2-tl-s"))
                 .map(function (x) { return x.textContent; })
      };`);
    for (const L of last.lines) {
      if (tl.has(L)) continue;
      tl.add(L);
      rec("timeline", L);
      console.log("  [" + ((Date.now() - g0) / 1000).toFixed(0) + "s] " + L);
    }
    if (last.q > 0 || last.diff) break;
    if (/AIの結果を問題として読み取れませんでした|AI の結果を問題として読み取れませんでした/.test(last.lines.join("|"))
        && !last.busy) break;
    if (/生成の上限に達しました/.test(last.lines.join("|")) && !last.busy) break;
    await pg.waitForTimeout(600);
  }

  /* 差分として出たものを取り込んで、実際に何問並ぶかを見る。
     取り込まずにカードを数えると「0 問」と読み違える。 */
  const applied = await inShadow(pg, `
    var b = root.querySelector('[data-act="apply-all"]');
    if (!b) return { had: false };
    b.click(); return { had: true };`);
  if (applied.had) {
    await pg.waitForTimeout(2000);
    last = await inShadow(pg, `
      return { q: root.querySelectorAll(".vq2-qcard").length, diff: false, busy: false,
               lines: Array.from(root.querySelectorAll(".vq2-tl-t")).map(function (x) { return x.textContent; }) };`);
  }
  await pg.screenshot({ path: path.join(OUT, "02-after-generate.png") });

  /* ── まとめ ── */
  console.log("\n── 結果 ──");
  console.log("  問題カード: " + last.q + "（差分を取り込んで確認）");
  console.log("  「処理が完了しました」の有無: "
    + ([...tl].some((x) => /処理が完了しました/.test(x)) ? "出た" : "出ていない")
    + " ／ 問題数 " + last.q);
  console.log("  資料なしへのフォールバック: "
    + ([...tl].some((x) => /これまでどおりの作り方で進めます/.test(x)) ? "起きた（違反）" : "起きていない"));
  const chipsEnd = await chips(pg);
  rec("chip_end", chipsEnd);
  chipsEnd.forEach((c) => console.log("  添付カード: " + c.state
    + (c.pages.length ? " / " + c.pages.join(" ") : "")
    + (c.actions.length ? " / 手: " + c.actions.join(",") : "")));

  console.log("\n  送った要求: " + requests.length + " 本");
  requests.forEach((r, i) => {
    console.log("   " + (i + 1) + ". " + (r.bytes / 1024).toFixed(1) + "KB / 添付 "
      + r.attachments.length + " 件 / sourceOnly=" + (r.options && r.options.sourceOnly));
    r.attachments.forEach((a) => console.log("      " + a.kind + " " + String(a.name).slice(0, 34)
      + " chars=" + a.chars + " page=" + (a.pageNumber || "-") + " b64=" + a.hasB64));
  });

  /* ── 必須計測 ── */
  try {
    const os = require("node:os");
    const tf = path.join(os.homedir(), "Library", "Application Support", "VocabuQuiz", "Logs", "raw-trace.jsonl");
    const rows = fs.readFileSync(tf, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const mc = rows.filter((r) => r.kind === "model_call" && r.t >= new Date(startedAt).toISOString());
    const v = mc.filter((r) => r.role === "vision-analyst");
    const gen = mc.filter((r) => r.role === "preset-generator");
    const pat = mc.filter((r) => r.role === "preset-patcher");
    const trunc = mc.filter((r) => (r.response || {}).looksTruncated);
    console.log("\n── 計測 ──");
    console.log("  Vision 呼び出し回数      : " + v.length);
    console.log("  論点抽出時の画像枚数     : "
      + mc.filter((r) => r.role === "main-writer").map((r) => r.images).join(",") || "0");
    console.log("  問題生成時の画像枚数     : " + (gen.map((r) => r.images).join(",") || "0"));
    console.log("  ページ解析の合計時間     : " + (v.reduce((n, r) => n + r.ms, 0) / 1000).toFixed(0) + " 秒");
    console.log("  問題生成の呼び出し       : " + gen.length + " 回 / "
      + (gen.reduce((n, r) => n + r.ms, 0) / 1000).toFixed(0) + " 秒");
    console.log("  出力が途中で切れた回数   : " + trunc.filter((r) => r.role !== "vision-analyst").length);
    console.log("  修復の呼び出し           : " + pat.length + " 回 / "
      + (pat.reduce((n, r) => n + r.ms, 0) / 1000).toFixed(0) + " 秒");
    console.log("  モデル呼び出し合計       : " + mc.length + " 回 / "
      + (mc.reduce((n, r) => n + r.ms, 0) / 1000).toFixed(0) + " 秒");
  } catch (e) { console.log("  （計測ログを読めません: " + e.message + "）"); }
  console.log("  10 問完成までの総時間    : " + ((Date.now() - startedAt) / 1000).toFixed(0) + " 秒");

  fs.writeFileSync(path.join(OUT, "trace.json"), JSON.stringify(LOG, null, 1));
  console.log("\n  記録: " + path.join(OUT, "trace.json"));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
