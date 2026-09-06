#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqexamdetail.cjs — 試験の 詳細と 公開（2026-09-01・訴え）

   訴え:「試験を 公開できる ように して。今のままだと、試験を クリックすると、
         詳細が でない。プリセットと 同じように 試験も 詳細モードを 表示させて。
         そこから 公開が できるように。」

   直す前:
     一覧の 試験の カードは 押した 瞬間に **CBT（受験）へ 飛んで いた**。
     何問 あるのかも 見られず、公開の 口も どこにも 無かった。

   見るもの:
     ① 試験を 押すと **詳細が 開く**（いきなり 受験に ならない）
     ② 大問・問数・満点・時間 が 出る
     ③ 公開の 欄が 開き、`/api/preset/publish` を 叩く
     ④ 送る 中身が 正しい（isPublic・preset・slug・publicTitle）
     ⑤ 公開した あと 札が「公開中」に 変わり、端末にも 覚える
     ⑥ 非公開に 戻せる
     ⑦ 断られたら **理由を 出す**（黙って 成功に しない）
     ⑧ スマホでは 下から せり上がる（真ん中の 窓は 指が 届かない）

   使い方: VQ_BASE=http://127.0.0.1:8791 node vqexamdetail.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const { chromium } = require("playwright");
let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 240) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 360) : "")); }
};
const 待 = (m) => new Promise((s) => setTimeout(s, m));

const SPEC = {
  id: "exam-test-1", title: "ためしの 期末考査", subject: "日本史",
  totalPoints: 100, durationMinutes: 50,
  cover: { examName: "2026年度 1学期 期末考査", subject: "日本史",
           examDate: "2026年9月1日", instructions: ["机の上には 何も 置かない"],
           fields: ["年", "組", "番号", "氏名"] },
  sections: [
    { number: 1, title: "古代", points: 40, questions: [
      { id: "q1", type: "single_choice", question: "大化の改新は 何年か。", choices: ["645", "701", "710", "794"], answer: "645", points: 20 },
      { id: "q2", type: "single_choice", question: "平城京に 都を 移したのは。", choices: ["694", "710", "784", "794"], answer: "710", points: 20 }] },
    { number: 2, title: "中世", points: 60, questions: [
      { id: "q3", type: "single_choice", question: "鎌倉幕府を 開いたのは。", choices: ["源頼朝", "足利尊氏", "平清盛", "北条時宗"], answer: "源頼朝", points: 30 },
      { id: "q4", type: "short_answer", question: "承久の乱は 何年か。", answer: "1221", points: 30 }] }
  ]
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  const pg = await ctx.newPage();
  const 例外 = []; pg.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 200)));

  /* 公開の 口を 差し替える。**何が 届いたか**を 控える。 */
  let 届 = null; let 返す = { ok: true, slug: "tameshi-kimatsu", publicTitle: "ためしの 期末考査", updatedAt: Date.now() };
  let 状態 = 200;
  await pg.route("**/api/preset/publish", async (route) => {
    届 = JSON.parse(route.request().postData() || "{}");
    await route.fulfill({ status: 状態, contentType: "application/json", body: JSON.stringify(返す) });
  });

  /* 公開は ログインが 要る。口は 差し替えて あるので 札だけ 置く。 */
  await pg.addInitScript(() => { try { localStorage.setItem("app.auth.token.v1", "test-token"); } catch (e) {} });
  await pg.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => !!window.__vqExamDetail, null, { timeout: 25000 });
  await pg.waitForFunction(() => window.VQ2 && window.VQ2.store && window.VQ2.store.saveExam,
    null, { timeout: 60000 }).catch(() => {});
  見(await pg.evaluate(() => !!window.__vqExamDetail), "詳細の 部品が ある");

  /* 試験を 1 本 置く */
  const 置 = await pg.evaluate((sp) => {
    try { return window.VQ2.store.saveExam(sp, { force: true }); } catch (e) { return { ok: false, e: String(e) }; }
  }, SPEC);
  見(置 && 置.ok !== false, "ためしの 試験を 置けた", 置);

  節("① 押すと 詳細が 開く（いきなり 受験に ならない）");
  await pg.evaluate(() => window.__vqExamDetail.open("exam-test-1"));
  await 待(300);
  const 見た = await pg.evaluate(() => {
    const h = document.getElementById("vqExamDetail");
    const sr = h && h.shadowRoot;
    if (!sr) return null;
    const w = sr.querySelector(".w");
    return {
      開: h.getAttribute("data-open") === "1",
      題: sr.querySelector(".cv-t") ? sr.querySelector(".cv-t").textContent : "",
      科: sr.querySelector(".cv-k") ? sr.querySelector(".cv-k").textContent : "",
      数: Array.prototype.map.call(sr.querySelectorAll(".num"), (n) => n.textContent.replace(/\s+/g, " ").trim()),
      大問: sr.querySelectorAll(".sec").length,
      札: sr.querySelector(".pub") ? sr.querySelector(".pub").textContent.trim() : "",
      ボタン: Array.prototype.map.call(sr.querySelectorAll(".ft .btn"), (b) => b.textContent.trim()),
      幅: w ? Math.round(w.getBoundingClientRect().width) : 0
    };
  });
  見(見た && 見た.開, "★★ **詳細が 開く**");
  見(/2026年度 1学期 期末考査/.test(見た.題), "試験の 名前が 出る", 見た.題);
  見(/日本史/.test(見た.科), "教科が 出る", 見た.科);
  節("② 数が 出る");
  見(見た.数.join("/").indexOf("2大問") >= 0, "★ 大問の 数", 見た.数);
  見(見た.数.join("/").indexOf("4問") >= 0, "★ 問題の 数", 見た.数);
  見(見た.数.join("/").indexOf("100点") >= 0, "★ 満点", 見た.数);
  見(見た.数.join("/").indexOf("50分") >= 0, "★ 時間", 見た.数);
  見(見た.大問 === 2, "大問の 内訳が 並ぶ", 見た.大問);
  見(/自分だけ/.test(見た.札), "いまは 非公開だと 分かる", 見た.札);
  見(見た.ボタン.some((b) => /受験する/.test(b)), "受験の 口が ある", 見た.ボタン);
  見(見た.ボタン.some((b) => /公開する/.test(b)), "★★ **公開の 口が ある**", 見た.ボタン);

  節("③④ 公開する");
  await pg.evaluate(() => {
    const sr = document.getElementById("vqExamDetail").shadowRoot;
    Array.prototype.find.call(sr.querySelectorAll(".ft .btn"), (b) => /公開する/.test(b.textContent)).click();
  });
  await 待(200);
  const 欄 = await pg.evaluate(() => {
    const sr = document.getElementById("vqExamDetail").shadowRoot;
    const t = sr.getElementById("ed-t"), s = sr.getElementById("ed-s");
    if (s) { s.value = "tameshi-kimatsu"; s.dispatchEvent(new Event("input", { bubbles: true, composed: true })); }
    return { 題欄: !!t, ID欄: !!s, 題: t ? t.value : "" };
  });
  見(欄.題欄 && 欄.ID欄, "★ 公開名と 公開ID を 決められる", 欄);
  await pg.evaluate(() => {
    const sr = document.getElementById("vqExamDetail").shadowRoot;
    Array.prototype.find.call(sr.querySelectorAll(".ft .btn"), (b) => /この 内容で 公開/.test(b.textContent)).click();
  });
  await 待(600);
  if (!届) {
    const 断0 = await pg.evaluate(() => {
      const sr = document.getElementById("vqExamDetail").shadowRoot;
      return sr.querySelector(".err") ? sr.querySelector(".err").textContent.trim() : "(断りなし)";
    });
    console.log("    （叩けなかった とき の 画面の 断り）:", 断0);
  }
  見(!!届, "★★ **公開の 口を 叩いた**", 届 ? Object.keys(届) : null);
  if (届) {
    見(届.isPublic === true, "isPublic が true", 届.isPublic);
    見(届.slug === "tameshi-kimatsu", "★ 公開ID が 届く", 届.slug);
    見(!!(届.preset && 届.preset.exam && (届.preset.exam.sections || []).length === 2),
      "★★ **試験の 中身（大問）が そのまま 届く**",
      届.preset ? Object.keys(届.preset) : null);
    見(!!(届.preset && (届.preset.questions || []).length === 4),
      "問題も 届く（器は プリセット）", 届.preset ? (届.preset.questions || []).length : -1);
  }
  節("⑤ 公開した あと");
  const 後 = await pg.evaluate(() => {
    const sr = document.getElementById("vqExamDetail").shadowRoot;
    const p = window.VQ2.store.getExamPreset("exam-test-1");
    return { 札: sr.querySelector(".pub") ? sr.querySelector(".pub").textContent.trim() : "",
             知: sr.querySelector(".ok") ? sr.querySelector(".ok").textContent.trim() : "",
             覚え: p && p.publicMeta ? { isPublic: p.publicMeta.isPublic, slug: p.publicMeta.slug } : null,
             ボタン: Array.prototype.map.call(sr.querySelectorAll(".ft .btn"), (b) => b.textContent.trim()) };
  });
  見(/公開中/.test(後.札), "★★ **札が「公開中」に 変わる**", 後.札);
  見(/公開しました/.test(後.知), "できたことを 言う", 後.知);
  見(後.覚え && 後.覚え.isPublic === true && 後.覚え.slug === "tameshi-kimatsu",
    "★ 端末にも 覚える（開き直しても 公開中）", 後.覚え);
  見(後.ボタン.some((b) => /非公開に 戻す/.test(b)), "★ 非公開に 戻す 口が 出る", 後.ボタン);

  節("⑥ 非公開に 戻す");
  届 = null; 返す = { ok: true };
  await pg.evaluate(() => {
    const sr = document.getElementById("vqExamDetail").shadowRoot;
    Array.prototype.find.call(sr.querySelectorAll(".ft .btn"), (b) => /非公開に 戻す/.test(b.textContent)).click();
  });
  await 待(600);
  見(届 && 届.isPublic === false, "★ isPublic が false で 届く", 届 && 届.isPublic);
  const 戻 = await pg.evaluate(() => {
    const sr = document.getElementById("vqExamDetail").shadowRoot;
    const p = window.VQ2.store.getExamPreset("exam-test-1");
    return { 札: sr.querySelector(".pub").textContent.trim(),
             覚え: p && p.publicMeta ? p.publicMeta.isPublic : null };
  });
  見(/自分だけ/.test(戻.札) && 戻.覚え === false, "★ 札も 覚えも 戻る", 戻);

  節("⑦ 断られたら 理由を 出す");
  状態 = 409; 返す = { ok: false, code: "PUBLIC_ID_TAKEN", message: "この公開IDはすでに使われています。" };
  await pg.evaluate(() => {
    const sr = document.getElementById("vqExamDetail").shadowRoot;
    Array.prototype.find.call(sr.querySelectorAll(".ft .btn"), (b) => /公開する/.test(b.textContent)).click();
  });
  await 待(200);
  await pg.evaluate(() => {
    const sr = document.getElementById("vqExamDetail").shadowRoot;
    Array.prototype.find.call(sr.querySelectorAll(".ft .btn"), (b) => /この 内容で 公開/.test(b.textContent)).click();
  });
  await 待(600);
  const 断 = await pg.evaluate(() => {
    const sr = document.getElementById("vqExamDetail").shadowRoot;
    const p = window.VQ2.store.getExamPreset("exam-test-1");
    return { 断り: sr.querySelector(".err") ? sr.querySelector(".err").textContent.trim() : "",
             覚え: p && p.publicMeta ? p.publicMeta.isPublic : null };
  });
  見(/すでに 使われています|すでに使われています/.test(断.断り), "★★ **断られた 理由が そのまま 出る**", 断.断り);
  見(断.覚え === false, "★ 断られたら 公開中に しない（嘘を つかない）", 断.覚え);

  節("⑦-b ★ **窓が 画面の 中央に 出る**");
  /* 訴え（2026-09-01）「プリセット一覧の 試験の 詳細モーダルが 中央に して ほしい」。
     真因: 出て くる 動き（edUp）の 終わりが transform:none で、
     **中央へ 寄せる translate(-50%,-50%) を 打ち消して いた**（fill-mode:both）。
     つまり 左上の 角が 画面の 真ん中に 来て、右下へ はみ出して いた
     （実測 1440px で 左余白 720・右余白 0・下は 45px はみ出し）。 */
  for (const 幅 of [1440, 1200, 1024]) {
    await pg.setViewportSize({ width: 幅, height: 900 });
    await 待(500);
    await pg.evaluate(() => { window.__vqExamDetail.close(); });
    await 待(200);
    await pg.evaluate(() => window.__vqExamDetail.open("exam-test-1"));
    await 待(700);
    const 位 = await pg.evaluate(() => {
      const w = document.getElementById("vqExamDetail").shadowRoot.querySelector(".w");
      const r = w.getBoundingClientRect();
      return { 左: Math.round(r.left), 右: Math.round(innerWidth - r.right),
               上: Math.round(r.top), 下: Math.round(innerHeight - r.bottom) };
    });
    見(Math.abs(位.左 - 位.右) <= 2, "★★ " + 幅 + "px：**左右が そろう**", 位);
    見(位.下 >= 0 && Math.abs(位.上 - 位.下) <= 2, "★ " + 幅 + "px：上下も そろう（はみ出さない）", 位);
  }
  await pg.setViewportSize({ width: 1100, height: 800 });
  await 待(400);

  節("⑧ スマホ（390px）");
  await pg.setViewportSize({ width: 390, height: 844 });
  await 待(300);
  const 携 = await pg.evaluate(() => {
    const sr = document.getElementById("vqExamDetail").shadowRoot;
    const w = sr.querySelector(".w");
    const r = w.getBoundingClientRect();
    return { 幅: Math.round(r.width), 下: Math.round(innerHeight - r.bottom),
             横: document.documentElement.scrollWidth > innerWidth + 1,
             ボタン高: Math.round(sr.querySelector(".ft .btn").getBoundingClientRect().height) };
  });
  見(携.幅 >= 380, "★ 画面いっぱいに 出る", 携.幅);
  見(携.下 <= 2, "★★ **下から せり上がる**（真ん中の 窓は 指が 届かない）", 携.下);
  見(!携.横, "横に はみ出さない", 携.横);
  見(携.ボタン高 >= 44, "★ 押すところが 44px 以上", 携.ボタン高);

  見(例外.length === 0, "画面の 例外 0 件", 例外);
  await browser.close();
  console.log("\n────────────────────────────────");
  console.log("  ok " + 済 + " / NG " + 落);
  if (落) { console.log("  落ちた: " + 落ち.join(" / ")); process.exit(1); }
})();
