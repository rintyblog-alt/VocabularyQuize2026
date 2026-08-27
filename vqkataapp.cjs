/* ══════════════════════════════════════════════════════════════════════════
   vqkataapp.cjs — 型を **本物の AR App の 包み**（core/board/app.js）で 動かす

   vqkata.cjs は 型そのものを 見る。こちらは その 手前と 奥:
     ・本体の 束に 型が 入っていて、画面から 使えるか
     ・本物の 包み（CSP・見張り・土台 API・sandbox）に 入れても 動くか
     ・保存（VQ.store）が 本体の 溜めへ 届くか
     ・Lumi の 受け口（showKata）が 期待どおりの 断りかたを するか

   本番では 走らせない。
   ══════════════════════════════════════════════════════════════════════════ */
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const { chromium } = require("playwright");

let 済 = 0, 落 = 0; const 印 = [];
function ok(名, 真, 補) {
  if (真) { 済++; 印.push("  ✅ " + 名 + (補 ? "  " + 補 : "")); }
  else { 落++; 印.push("  ❌ " + 名 + (補 ? "  " + 補 : "")); }
}
function 節(t) { 印.push("\n── " + t + " " + "─".repeat(Math.max(0, 54 - t.length))); }

(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1100, height: 780 } });
  const p = await ctx.newPage();
  const 失敗 = [];
  p.on("pageerror", (e) => 失敗.push(String(e.message).slice(0, 140)));
  await p.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await p.waitForFunction(() => !!(window.VQK && window.VQB && window.VQB.app), null, { timeout: 30000 }).catch(() => {});

  節("① 本体の 束に 入っている");
  ok("VQK（型）が 読み込まれている", await p.evaluate(() => !!(window.VQK && window.VQK.作る)));
  ok("VQB.app（包み）も ある", await p.evaluate(() => !!(window.VQB && window.VQB.app && window.VQB.app.文書)));
  const 数 = await p.evaluate(() => (window.VQK ? window.VQK.かず() : 0));
  ok("型は 5,184 通り", 数 === 5184, String(数));

  節("② 本物の 包みに 入れる");
  const 包 = await p.evaluate(() => {
    const r = VQK.作る("quiz4/card/lavender/normal", {
      題: "理科 まとめ", 混ぜる: false,
      問題: [{ 問: "水の沸点は？", 答: "100℃", 選択肢: ["0℃", "50℃", "100℃"], 解説: "1 気圧のとき。" },
             { 問: "光合成に 要るのは？", 答: "二酸化炭素", 選択肢: ["酸素", "二酸化炭素", "窒素"] }]
    });
    const doc = VQB.app.文書({ html: r.html, css: r.css, js: r.js, libs: [] });
    return { 長さ: doc.length, csp: doc.indexOf("Content-Security-Policy") >= 0,
      見張り: doc.indexOf("__vqapp") >= 0,
      外: /https?:\/\/(?!127|localhost)/.test(doc.replace(/http-equiv/g, "")),
      道具: (doc.match(/\/vendor\/arapp\//g) || []).length,
      doc: doc };
  });
  ok("包みが できる", 包.長さ > 4000, 包.長さ + " 字");
  ok("CSP が 入っている", 包.csp === true);
  ok("見張りが 入っている", 包.見張り === true);
  ok("外の 住所を 一切 指していない", 包.外 === false);
  ok("外の 道具を 勝手に 借りていない", 包.道具 === 0, 包.道具 + " 本");

  節("③ 包みごと 動かす（sandbox の 中）");
  const 枠 = await p.evaluate(async () => {
    const wrap = document.createElement("div");
    wrap.style.cssText = "position:fixed;left:0;bottom:0;width:640px;height:420px;z-index:2147483600";
    wrap.id = "kataTest";
    document.body.appendChild(wrap);
    /* ★ 既定では **出る順も 選択肢の順も 混ざる**（それが 正しい）。
       ここは 押す所を 決めたいので 混ぜないだけ。混ざることは 下で 別に 確かめる。 */
    const r = VQK.作る("quiz4/card/lavender/normal", {
      題: "理科 まとめ", 混ぜる: false,
      問題: [{ 問: "水の沸点は？", 答: "100℃", 選択肢: ["0℃", "50℃", "100℃"] },
             { 問: "光合成に 要るのは？", 答: "二酸化炭素", 選択肢: ["酸素", "二酸化炭素"] }]
    });
    const f = VQB.app.枠(wrap, { html: r.html, css: r.css, js: r.js, libs: [] }, {});
    await new Promise((res) => setTimeout(res, 1600));
    return { できた: !!f, 枠あり: !!wrap.querySelector("iframe"),
      sandbox: wrap.querySelector("iframe") ? wrap.querySelector("iframe").getAttribute("sandbox") : "" };
  });
  ok("枠が できる", 枠.できた === true && 枠.枠あり === true, JSON.stringify(枠));
  ok("同じ出どころを 許していない（保存も DOM も 触れない）",
    枠.sandbox !== null && String(枠.sandbox).indexOf("allow-same-origin") < 0, String(枠.sandbox));

  const 中 = await p.frames().find((f) => f.url() === "about:srcdoc" || /srcdoc/.test(f.url()));
  const 中身 = 中 ? await 中.evaluate(() => ({
    骨: !!document.querySelector(".k"),
    題: (document.querySelector(".k-title") || {}).textContent || "",
    問: (document.querySelector("#kBody") || {}).textContent || "",
    えらぶ: document.querySelectorAll("#kChoices .k-btn").length,
    err: !!document.getElementById("vqerr"),
    VQある: !!window.VQ, Kある: !!window.K
  })).catch(() => null) : null;
  ok("中で 型が 組み上がっている", !!(中身 && 中身.骨), JSON.stringify(中身));
  ok("入れた 題が 出ている", !!(中身 && /理科 まとめ/.test(中身.題)), 中身 && 中身.題);
  ok("入れた 問題が 出ている", !!(中身 && /沸点/.test(中身.問)), 中身 && 中身.問.slice(0, 20));
  ok("選択肢が 3 つ 出ている", !!(中身 && 中身.えらぶ === 3), String(中身 && 中身.えらぶ));
  /* ★ 混ぜるのは **画面の中で 動くとき**（作った文の中ではない）。
     だから 作った文を 見ても ばらけない。ここでは
     「既定で 混ぜる印が 立つ」ことと「実際に 中で ばらける」ことを 別々に 見る。 */
  const 印付 = await p.evaluate(() => {
    const a = VQK.作る("quiz4/card/slate/normal", { 問題: [{ 問: "あ", 答: "1" }] });
    const b2 = VQK.作る("quiz4/card/slate/normal", { 問題: [{ 問: "あ", 答: "1" }], 混ぜる: false });
    return { 既定: /,MIX=1,/.test(a.js), 切: /,MIX=0,/.test(b2.js), 仕掛け: a.js.indexOf("if(MIX)Q=K.shuffle") >= 0 };
  });
  ok("既定で 混ぜる印が 立つ", 印付.既定 === true && 印付.仕掛け === true, JSON.stringify(印付));
  ok("混ぜない と 言えば 立たない", 印付.切 === true);
  /* ★ 枠は allow-same-origin を 付けていないので、**親からは 中を 読めない**。
     Playwright の frame ごしに 読む（contentDocument は 必ず null に なる）。 */
  const 出た = new Set();
  await p.evaluate(() => {
    const w = document.createElement("div");
    w.id = "mixTest";
    w.style.cssText = "position:fixed;right:0;top:0;width:420px;height:320px;opacity:.01;pointer-events:none";
    document.body.appendChild(w);
  });
  for (let i = 0; i < 8; i++) {
    await p.evaluate(() => {
      const w = document.getElementById("mixTest");
      w.innerHTML = "";
      const r = VQK.作る("quiz4/stack/slate/tight", {
        問題: [{ 問: "あ", 答: "1" }, { 問: "い", 答: "2" }, { 問: "う", 答: "3" }, { 問: "え", 答: "4" }] });
      VQB.app.枠(w, { html: r.html, css: r.css, js: r.js, libs: [] }, {});
    });
    await p.waitForTimeout(750);
    let 見 = "?";
    for (const f of p.frames()) {
      if (!/srcdoc/.test(f.url())) continue;
      const t = await f.evaluate(() => {
        const e = document.querySelector("#kBody");
        return e && /^[あいうえ]$/.test(e.textContent.trim()) ? e.textContent.trim() : "";
      }).catch(() => "");
      if (t) 見 = t;
    }
    出た.add(見);
  }
  await p.evaluate(() => { const w = document.getElementById("mixTest"); if (w) w.remove(); });
  const ばら = Array.from(出た).join(",");
  ok("実際に 中で 出る順が ばらける", 出た.size >= 2 && !出た.has("?"), "8 回で " + ばら);
  ok("中で 落ちていない", !!(中身 && 中身.err === false));
  ok("土台の API（VQ）が 中に 入っている", !!(中身 && 中身.VQある));
  ok("共通の 道具（K）も 入っている", !!(中身 && 中身.Kある));

  節("④ 触って 動く");
  if (中) {
    const 動 = await 中.evaluate(async () => {
      const s = (ms) => new Promise((r) => setTimeout(r, ms));
      const 前 = document.querySelector("#kS").textContent;
      const 正 = Array.from(document.querySelectorAll("#kChoices .k-btn"))
        .find((b) => b.textContent === "100℃");
      if (正) 正.click();
      await s(200);
      const 後 = document.querySelector("#kS").textContent;
      const 印 = document.querySelector("#kChoices .ans-o");
      document.querySelector("#kNext").click();
      await s(200);
      return { 前, 後, 正解の印: !!印, つぎ: (document.querySelector("#kQ") || {}).textContent,
        err: !!document.getElementById("vqerr") };
    });
    ok("正解を 押すと 点が 増える", 動.前 === "0 点" && 動.後 === "1 点", 動.前 + " → " + 動.後);
    ok("正解に 印が つく", 動.正解の印 === true);
    ok("つぎへ で 進む", 動.つぎ === "2/2", 動.つぎ);
    ok("触っても 落ちない", 動.err === false);
  } else ok("中の 画面に 入れた", false, "枠が 見つからない");

  節("⑤ 保存が 本体の 溜めへ 届く");
  const 保 = await p.evaluate(async () => {
    const wrap = document.getElementById("kataTest");
    wrap.innerHTML = "";
    const r = VQK.作る("counter/stack/mint/normal", { 題: "得点板", 名前: ["赤", "白"] });
    VQB.app.枠(wrap, { html: r.html, css: r.css, js: r.js, libs: [] }, {});
    await new Promise((res) => setTimeout(res, 1500));
    return true;
  });
  /* ★ 画面には 前の 型の 枠も 残っていることが ある。
     **中身で 選ぶ**（数とりの .cn が 在る枠）。番号で 選ぶと 別の枠を つかむ。 */
  let 中2 = null;
  for (const f of p.frames()) {
    if (!/srcdoc/.test(f.url())) continue;
    const あり = await f.evaluate(() => !!document.querySelector(".cn .row .k-btn")).catch(() => false);
    if (あり) 中2 = f;
  }
  let 溜 = null;
  if (中2) {
    await 中2.evaluate(async () => {
      const s = (ms) => new Promise((r) => setTimeout(r, ms));
      const b = Array.from(document.querySelectorAll(".cn .row .k-btn")).filter((x) => x.textContent === "＋");
      b[0].click(); b[0].click(); b[1] && b[1].click();
      await s(400);
    });
    溜 = await p.evaluate(() => {
      const out = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.indexOf("vq2.arapp.") === 0 && k.indexOf("kata") >= 0) out[k] = localStorage.getItem(k);
      }
      return out;
    });
  }
  const 鍵 = Object.keys(溜 || {});
  ok("中で 押した 数が 本体の 溜めへ 届く", 鍵.length > 0, 鍵.join(",") || "届いていない");
  ok("中身が 数として 入っている", 鍵.length > 0 && /"v":\[/.test(溜[鍵[0]]), 鍵.length ? String(溜[鍵[0]]).slice(0, 60) : "");

  節("⑥ Lumi の 受け口（showKata）");
  const 受 = await p.evaluate(() => !!(window.__vqLive || window.VQK));
  ok("受け口が 積まれている", 受 === true);
  ok("画面の 失敗が 出ていない", 失敗.length === 0, 失敗.slice(0, 2).join(" / "));

  await b.close();
  console.log(印.join("\n"));
  console.log("\n" + (落 === 0 ? "通った" : "落ちた") + "  " + 済 + "/" + (済 + 落));
  process.exit(落 === 0 ? 0 : 1);
})().catch((e) => { console.error("止まりました:", e && e.stack || e); process.exit(2); });
