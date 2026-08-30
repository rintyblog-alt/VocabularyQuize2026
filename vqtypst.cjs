/* ══════════════════════════════════════════════════════════════════════════
   vqtypst.cjs — 組版（Typst）が **この端末の ブラウザで 走るか**を 実物で 測る

   訴え（2026-08-30・Rinty さん）「Typst を Mac から 離す」

   これまで 組版は Mac の Bridge でしか 走らず、`available:false` のままだった。
   Cloudflare Worker では Typst は 走らせられないので、
   残る 道は **ブラウザで wasm を 動かす**こと。

   ここで 見るのは:
     ① 何も 押さない うちは **1 バイトも 取りに 行かない**（20MB ある）
     ② 用意すると 実際に 走り、自己点検（日本語が 組める）に 通る
     ③ 本物の 試験の 原稿が **本物の PDF** に なる（ページ・日本語・埋め込み書体）
     ④ 2 回目は 速い（溜まっている）
     ⑤ 用意できていない うちは「使える」と **言わない**

   ★ 20MB を 取りに 行くので 時間が かかる。急ぐときは 走らせない。

   使い方: VQ_BASE=http://127.0.0.1:8791 node vqtypst.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const { chromium } = require("playwright");

let 済 = 0, 落 = 0;
const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + String(追).slice(0, 240) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + String(追).slice(0, 500) : "")); }
};
const 待 = (ms) => new Promise((s) => setTimeout(s, ms));
const j = (r) => r.json().catch(() => ({}));

async function 札() {
  const 印 = Date.now().toString(36) + Math.floor(Math.random() * 9999);
  const H = { "Content-Type": "application/json" };
  const r = await fetch(BASE + "/api/auth/register/start", { method: "POST", headers: H,
    body: JSON.stringify({ email: "vqy" + 印 + "@gmail.com", gradePrefix: "H2",
      nickname: ("y" + 印).slice(0, 14), password: "Passw0rd!z3" }) }).then(j);
  const v = await fetch(BASE + "/api/auth/register/verify", { method: "POST", headers: H,
    body: JSON.stringify({ challengeId: r.challengeId, code: r.devCode }) }).then(j);
  const c = await fetch(BASE + "/api/auth/register/consent", { method: "POST", headers: H,
    body: JSON.stringify({ registrationSession: v.registrationSession, agreeTerms: true,
      agreePrivacy: true, agreeAge: true, pin: "1379" }) }).then(j);
  if (!c.token) throw new Error("札が 取れない");
  return c.token;
}

/* 試験を その場で こしらえる（AI は 使わない） */
const 試験を置く = () => {
  const VQ2 = window.VQ2, MC = VQ2.mockCompiler, ST = VQ2.store;
  const p = MC.plan({ title: "期末考査", subject: "日本史探究", durationMinutes: 50,
    totalPoints: 60, sectionCount: 2, questionCount: 6,
    types: { multiple_choice_single: true, short_answer: true },
    difficulty: "mixed", allowExternalKnowledge: true, requireSources: false });
  const filled = {};
  p.sections.forEach((s) => s.questions.forEach((q) => {
    filled[q.id] = q.type === "multiple_choice_single"
      ? { question: "問" + q.number + "　次の文の空欄に入る語として最も適当なものを一つ選べ。",
          type: q.type, answer: "大化の改新", explanation: "かいせつ",
          choices: [{ text: "大化の改新" }, { text: "応仁の乱" }, { text: "承久の変" }, { text: "壬申の乱" }] }
      : { question: "問" + q.number + "　次の問いに四十字以内で答えよ。", type: q.type,
          answer: "こたえ" + q.number, explanation: "かいせつ" };
  }));
  const a = MC.assemble(p, filled, {});
  a.spec.id = "typ-test-1";
  a.spec.cover = { examName: "期末考査", subject: "日本史探究", examDate: "2026年8月30日",
    instructions: ["解答はすべて解答用紙に記入すること。"], studentFields: ["年", "組", "番", "氏名"] };
  const r = ST.saveExam(a.spec, {});
  return { ok: !!(r && r.ok), id: a.spec.id };
};

(async () => {
  console.log("測る先:", BASE);
  const tok = await 札();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await ctx.newPage();
  const 例外 = [];
  const 取りに行った = [];
  const 外へ = [];
  page.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 200)));
  page.on("request", (r) => {
    const u = r.url();
    if (/\/typst\//.test(u) && u.indexOf(BASE) === 0) 取りに行った.push(u.split("/typst/")[1]);
    if (!/^(http:\/\/127\.0\.0\.1|http:\/\/localhost|data:|blob:)/.test(u)) 外へ.push(u);
  });
  await page.addInitScript((t) => {
    try {
      localStorage.setItem("app.auth.token.v1", t);
      localStorage.setItem("app.auth.mode.v1", "user");
      localStorage.setItem("vq.tour.v1", JSON.stringify({ home: 1, preset: 1, feed: 1, dm: 1, insight: 1 }));
    } catch (e) {}
  }, tok);
  await page.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VQTYPST, null, { timeout: 60000 });
  await page.evaluate(() => { try { window.__vqLoadLibs && window.__vqLoadLibs(); } catch (e) {} });
  await page.waitForFunction(() => !!(window.VQ2 && window.VQ2.store && window.VQ2.typstRenderer),
    null, { timeout: 60000 });
  await 待(1500);

  節("① 押すまでは 1 バイトも 取りに 行かない");
  {
    const 大 = await page.evaluate(() => window.VQTYPST.大きさ());
    console.log("     大きさ: " + 大.MB + "MB " + JSON.stringify(大.内訳));
    見(取りに行った.length === 0, "起動では /typst/ を 1 つも 取りに 行かない", 取りに行った.join(","));
    const 状 = await page.evaluate(() => window.VQTYPST.状態());
    見(状.済み === false && 状.使える === false, "まだ 使えると 言わない", JSON.stringify(状));
    const A = await page.evaluate(() => {
      const a = window.VQ2.pdfRenderer.adapter("typst");
      return { available: a.available(), installable: a.installable ? a.installable() : null };
    });
    見(A.available === false, "★ 使えるふりを しない（available は false）", JSON.stringify(A));
    見(A.installable === true, "でも「入れれば 使える」とは 言う");
  }

  節("② 用意する（20MB を 読む。時間が かかる）");
  const t0 = Date.now();
  const 用意 = await page.evaluate(async () => {
    const 進 = [];
    const r = await window.VQTYPST.用意する((pr) => { 進.push(pr.段 + ":" + Math.round((pr.割合 || 0) * 100)); });
    return { r: r, 段: [...new Set(進.map((x) => x.split(":")[0]))], 回: 進.length };
  });
  const 秒 = Math.round((Date.now() - t0) / 100) / 10;
  見(用意.r && 用意.r.ok, "用意できた（自己点検に 通った）",
     JSON.stringify(用意.r) + " " + 秒 + "秒 段=" + 用意.段.join(">"));
  見(用意.回 > 3, "進み具合を 知らせている（黙って 待たせない）", 用意.回 + " 回");
  見(取りに行った.some((x) => /wasm\.gz/.test(x)), "本体を 取りに 行った", 取りに行った.join(", "));
  見(取りに行った.some((x) => /Serif/.test(x)) && 取りに行った.some((x) => /Sans/.test(x)),
     "明朝と ゴシックの 両方を 取りに 行った");
  const 状2 = await page.evaluate(() => window.VQTYPST.状態());
  見(状2.使える === true, "ここで はじめて「使える」と 言う", JSON.stringify(状2));
  const A2 = await page.evaluate(() => window.VQ2.pdfRenderer.adapter("typst").available());
  見(A2 === true, "紙面の 側からも 使えると 見える");

  節("③ 本物の 試験を PDF に する");
  const 置 = await page.evaluate(試験を置く);
  見(置.ok, "試験を 置いた", JSON.stringify(置));
  const 出 = await page.evaluate(async () => {
    const ST = window.VQ2.store, R = window.VQ2.pdfRenderer;
    const spec = ST.getExam("typ-test-1");
    const A = R.adapter("typst");
    const t0 = performance.now();
    const b = A.build(spec, null, { cover: true });
    const t1 = performance.now();
    if (!b.ok) return { err: b.message || b.error };
    const c = await A.compile(b.questionPaper);
    const t2 = performance.now();
    if (!c.ok) return { err: c.message, 原稿字: b.questionPaper.length };
    const u = c.pdf;
    let head = ""; for (let i = 0; i < 5; i++) head += String.fromCharCode(u[i]);
    let txt = ""; for (let i = 0; i < Math.min(u.length, 200000); i++) txt += String.fromCharCode(u[i]);
    /* 解答用紙も 組む（2 回目は 速いはず）。 */
    const t3 = performance.now();
    const c2 = await A.compile(b.answerSheet);
    const t4 = performance.now();
    return {
      原稿字: b.questionPaper.length, bytes: u.length, head: head,
      ページ: (txt.match(/\/Type\s*\/Page[^s]/g) || []).length,
      書体: [...new Set((txt.match(/\/BaseFont\s*\/([A-Za-z0-9+#,\-]+)/g) || [])
        .map((x) => x.replace(/.*\//, "").replace(/^[A-Z]{6}\+/, "")))],
      原稿ms: Math.round(t1 - t0), 組版ms: Math.round(t2 - t1),
      解答用紙ok: !!(c2 && c2.ok), 解答用紙ms: Math.round(t4 - t3),
      解答用紙bytes: c2 && c2.pdf ? c2.pdf.length : 0
    };
  });
  if (出.err) { 見(false, "PDF に できた", 出.err); }
  else {
    見(出.head === "%PDF-", "★ 本物の PDF が 出た", 出.head + " " + 出.bytes + " バイト");
    見(出.ページ >= 2, "ページが 2 枚 以上", 出.ページ);
    見(出.書体.some((f) => /Noto(Serif|Sans)JP/.test(f)),
       "★ 日本語の 書体が **埋め込まれている**（豆腐に ならない）", 出.書体.join(", "));
    見(出.組版ms < 5000, "組版は 数秒で 終わる", 出.原稿ms + "ms（原稿）＋ " + 出.組版ms + "ms（組版）");
    見(出.解答用紙ok, "解答用紙も 組める", 出.解答用紙bytes + " バイト");
    見(出.解答用紙ms < 3000, "2 枚目は 速い（溜まっている）", 出.解答用紙ms + "ms");
  }

  節("④ 画面から 押せる");
  {
    /* 紙面の 段まで 進め、組版の 欄が 出るかを 見る。 */
    const 中 = await page.evaluate(async () => {
      const ST = window.VQ2.store;
      window.__vqMake.open({ kind: "exam" });
      /* 出来上がった 試験を 差し込んで、紙面の 段へ 飛ばす。 */
      window.__vqMake.試験を入れる && window.__vqMake.試験を入れる(ST.getExam("typ-test-1"));
      await new Promise((r) => setTimeout(r, 400));
      const sr = document.getElementById("vqMake").shadowRoot;
      return { ある: !!sr, 合図: [...sr.querySelectorAll("[data-a]")].map((e) => e.dataset.a),
               画面: window.__vqMake.状態().画面 };
    });
    見(中.ある, "作る画面が 開いた", 中.画面);
    見(中.合図.indexOf("pdf-q") >= 0 || 中.画面 !== "紙面",
       "紙面の 段なら PDF の 札が 出る", 中.画面 + " / " + 中.合図.join(","));
    await page.evaluate(() => window.__vqMake.閉じる());
  }

  節("⑤ 外へ 出ていないか");
  {
    /* ★ fonts.googleapis.com（Inter / Fira Code）は **画面の 書体**で、
       組版とは 関係が 無い（前から 読んでいる）。ここでは 数えない。 */
    const 組版の外 = 外へ.filter((u) => /typst|wasm|jsdelivr|unpkg|gstatic\/s\/noto/i.test(u));
    見(組版の外.length === 0, "★ 組版の ために **外の サーバへ 出ない**",
       [...new Set(組版の外.map((u) => u.replace(/^(https?:\/\/[^/]+).*/, "$1")))].join(", ")
       + (組版の外.length ? "（" + 組版の外.length + " 本）" : ""));
    if (組版の外.length) console.log("     例: " + 組版の外.slice(0, 3).join("\n          "));
  }

  節("⑥ 赤い字（例外）");
  見(例外.length === 0, "例外が 出ていない", 例外.join(" | "));

  await browser.close();
  console.log("\n────────────────────────────");
  console.log("通った: " + 済 + " / 落ちた: " + 落);
  if (落ち.length) console.log("落ちたもの:\n  - " + 落ち.join("\n  - "));
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error("止まりました:", e); process.exit(1); });
