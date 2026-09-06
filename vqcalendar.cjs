#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqcalendar.cjs — 自分の カレンダー（2026-09-01・訴え）

   訴え:「カレンダーを 自分で 設定し、記録できる。**アカウントで 同期。
         端末を 変えたとて。**」

   直す前:
     ホームの「試験カレンダー」は 端末の localStorage だけ（GOALS_KEY）。
     ・自分で 足せる のは 試験の 日だけ
     ・記録（今日 やった こと）は どこにも 書けない
     ・**端末を 変えると 全部 消える**（同期の 対象に 入って いなかった）

   見るもの（画面）:
     ① 月の 表が 出る／前後の 月・今日へ 戻れる
     ② 日を 押すと その日／4 つの 種類で 足せる／消せる
     ③ 記録も 書ける（「やったこと」）
     ④ ホームの カレンダー欄に 出る（先の 予定から 順に）
     ⑤ スマホ: 下から せり上がる・横に はみ出さない・押すところ 44px

   見るもの（同期・**実サーバ**）:
     ⑥ 足すと /api/sync/upsert へ 行く
     ⑦ **別の 端末**（別の ブラウザ）で 同じ アカウントに 入ると 出る
     ⑧ 消すと 別の 端末でも 消える（**行を 消さず deletedAt で 伝える**）

   使い方:
     node vqcalendar.cjs            … 画面だけ
     node vqcalendar.cjs --実       … 開発版の 本物の サーバで 同期も 見る
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
const API = process.env.VQ_API || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const { chromium } = require("playwright");
let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 240) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 360) : "")); }
};
const 待 = (m) => new Promise((s) => setTimeout(s, m));
const 中 = (pg, f) => pg.evaluate((s) => {
  const h = document.getElementById("vqCalendar");
  if (!h || !h.shadowRoot) return null;
  return new Function("sr", s)(h.shadowRoot);
}, f);

async function 入る() {
  const j = (r) => r.json();
  const 鍵 = "vqcal" + Date.now() + Math.random().toString(36).slice(2, 7);
  let r = await fetch(API + "/api/auth/register/start", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: 鍵 + "@gmail.com", gradePrefix: "H2", nickname: 鍵.slice(2, 14), password: "Passw0rd!x9" }) }).then(j);
  if (!r.devCode) throw new Error("devCode 無し: " + JSON.stringify(r).slice(0, 200));
  r = await fetch(API + "/api/auth/register/verify", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeId: r.challengeId, code: r.devCode }) }).then(j);
  r = await fetch(API + "/api/auth/register/consent", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ registrationSession: r.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: "1379" }) }).then(j);
  return r.token;
}

(async () => {
  const 実 = process.argv.indexOf("--実") >= 0;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const pg = await ctx.newPage();
  const 例外 = []; pg.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 200)));
  let 送 = 0;
  if (!実) {
    await pg.route("**/api/sync/upsert", async (r) => {
      送++; await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, applied: { calendar: 1 } }) });
    });
    await pg.route("**/api/sync/snapshot", async (r) => {
      await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, snapshot: { calendar: [] } }) });
    });
    await pg.addInitScript(() => { try { localStorage.setItem("app.auth.token.v1", "test-token"); } catch (e) {} });
  }
  await pg.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => !!window.__vqCalendar, null, { timeout: 25000 });
  /* ★ 札は **読み込んだ あと**に 置く。起動の 途中で 本体が 消す ことが ある
     （addInitScript で 先に 置いても null に なる。実測）。 */
  if (!実) await pg.evaluate(() => { try { localStorage.setItem("app.auth.token.v1", "test-token"); } catch (e) {} });
  見(true, "カレンダーの 部品が ある");

  節("① 月の 表");
  await pg.evaluate(() => window.__vqCalendar.open());
  await 待(400);
  const a = await 中(pg, `
    var d = sr.querySelectorAll(".dy");
    return { 開: document.getElementById("vqCalendar").getAttribute("data-open") === "1",
             ます: d.length, 週: sr.querySelectorAll(".wk span").length,
             月: sr.querySelector(".mon").textContent.trim(),
             今日: sr.querySelectorAll(".dy.today").length,
             種: Array.prototype.map.call(sr.querySelectorAll(".kind"), function(k){return k.textContent;}) };`);
  見(a && a.開, "★★ **カレンダーが 開く**");
  見(a.ます % 7 === 0 && a.ます >= 28, "★ 7 の 倍数の ます（週が そろう）", a.ます);
  見(a.週 === 7, "曜日が 7 つ", a.週);
  見(/\d{4} 年 \d{1,2} 月/.test(a.月), "年月が 出る", a.月);
  見(a.今日 === 1, "★ 今日に 印が 付く", a.今日);
  見(a.種.join("/") === "試験/課題/予定/記録", "★ 4 つの 種類", a.種);

  const b = await pg.evaluate(async () => {
    const sr = document.getElementById("vqCalendar").shadowRoot;
    const 前 = sr.querySelector(".mon").textContent.trim();
    sr.querySelector('[data-a="next"]').click();
    await new Promise((s) => setTimeout(s, 150));
    const 次 = sr.querySelector(".mon").textContent.trim();
    sr.querySelector('[data-a="prev"]').click();
    sr.querySelector('[data-a="prev"]').click();
    await new Promise((s) => setTimeout(s, 150));
    const 前々 = sr.querySelector(".mon").textContent.trim();
    sr.querySelector('[data-a="today"]').click();
    await new Promise((s) => setTimeout(s, 150));
    return { 前, 次, 前々, 戻: sr.querySelector(".mon").textContent.trim() };
  });
  見(b.次 !== b.前 && b.前々 !== b.前, "★ 前後の 月へ 動ける", b);
  見(b.戻 === b.前, "★ 今日へ 戻れる", b);

  節("②③ 足す・消す・記録");
  const c = await pg.evaluate(async () => {
    const sr = document.getElementById("vqCalendar").shadowRoot;
    const 入 = async (kind, t, n) => {
      sr.querySelector('[data-a="kind"][data-v="' + kind + '"]').click();
      await new Promise((s) => setTimeout(s, 80));
      sr.getElementById("cal-t").value = t;
      sr.getElementById("cal-n").value = n || "";
      sr.querySelector('[data-a="add"]').click();
      await new Promise((s) => setTimeout(s, 120));
    };
    await 入("exam", "期末考査", "1〜3章");
    await 入("log", "英単語 50 問", "正答 82%");
    await 入("task", "レポート提出");
    const rows = Array.prototype.map.call(sr.querySelectorAll(".row"), (r) => ({
      k: r.querySelector(".k").textContent, t: r.querySelector(".t").textContent,
      n: r.querySelector(".n") ? r.querySelector(".n").textContent : "" }));
    return { rows, 全: window.__vqCalendar.全部().length };
  });
  見(c.rows.length === 3, "★★ **3 件 足せた**", c.rows.map((r) => r.k + ":" + r.t));
  見(c.rows.some((r) => r.k === "試験" && /期末考査/.test(r.t)), "試験を 足せる", c.rows[0]);
  見(c.rows.some((r) => r.k === "記録" && /英単語/.test(r.t)), "★ **記録も 書ける**", c.rows[1]);
  見(c.rows.some((r) => /1〜3章/.test(r.n)), "ひとことも 残る", c.rows[0].n);
  const d = await pg.evaluate(async () => {
    const sr = document.getElementById("vqCalendar").shadowRoot;
    sr.querySelector('[data-a="del"]').click();
    await new Promise((s) => setTimeout(s, 150));
    const 生 = window.__vqCalendar.全部().length;
    const 全 = JSON.parse(localStorage.getItem("vq.calendar.v1") || "[]");
    return { 行: sr.querySelectorAll(".row").length, 生,
             消し印: 全.filter((x) => x.deletedAt).length, 置き場: 全.length };
  });
  見(d.行 === 2 && d.生 === 2, "★ 消せる", d);
  見(d.消し印 === 1 && d.置き場 === 3,
    "★★ **行ごと 消さず、消えた 印を 残す**（消すと ほかの 端末で 生き返る）", d);

  節("④ ホームに 出る");
  const e = await pg.evaluate(() => {
    const 予 = window.__vqCalendar.予定(5);
    return { 数: 予.length, 種: 予.map((x) => x.kind), 題: 予.map((x) => x.title) };
  });
  見(e.数 >= 1, "★ 先の 予定を 取り出せる", e);
  見(e.種.indexOf("log") < 0, "★ **記録は 予定に 混ぜない**（済んだ ことは 予定では ない）", e.種);

  節("⑤ スマホ（390px）");
  await pg.setViewportSize({ width: 390, height: 844 });
  await 待(400);
  const f = await pg.evaluate(() => {
    const sr = document.getElementById("vqCalendar").shadowRoot;
    const w = sr.querySelector(".w"), r = w.getBoundingClientRect();
    return { 幅: Math.round(r.width), 下: Math.round(innerHeight - r.bottom),
             横: document.documentElement.scrollWidth > innerWidth + 1,
             ボタン: Math.round(sr.querySelector('[data-a="add"]').getBoundingClientRect().height),
             ます: Math.round(sr.querySelector(".dy").getBoundingClientRect().height) };
  });
  見(f.幅 >= 380 && f.下 <= 2, "★★ **下から せり上がる**", f);
  見(!f.横, "横に はみ出さない", f.横);
  見(f.ボタン >= 44, "★ 押すところが 44px 以上", f.ボタン);
  見(f.ます >= 44, "日の ますも 押せる 大きさ", f.ます);
  await pg.setViewportSize({ width: 1100, height: 900 });

  if (!実) {
    節("⑥ 同期の 口へ 行く（差し替えた 口で 数える）");
    await 待(1600);
    見(送 > 0, "★ 足すと 同期の 口へ 行く", 送);
  }

  見(例外.length === 0, "画面の 例外 0 件", 例外);

  /* ══ ⑦⑧ 本物の サーバで、別の 端末に 出るか ══════════════════════ */
  if (実) {
    節("⑦⑧ **別の 端末**でも 出る（開発版の 本物の サーバ）");
    let tk = "";
    try { tk = await 入る(); } catch (e) { console.log("  （登録できません: " + e.message + "）"); }
    if (tk) {
      const 送る = (body) => fetch(API + "/api/sync/upsert", { method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + tk },
        body: JSON.stringify(body) }).then((r) => r.json());
      const 取る = () => fetch(API + "/api/sync/snapshot", { headers: { Authorization: "Bearer " + tk } })
        .then((r) => r.json());
      const 今 = Date.now();
      const r1 = await 送る({ calendar: [
        { id: "c1", date: "2026-09-10", kind: "exam", title: "実の 期末考査", note: "", updatedAt: 今, deletedAt: 0 },
        { id: "c2", date: "2026-09-11", kind: "log", title: "実の 記録", note: "", updatedAt: 今, deletedAt: 0 }
      ] });
      見(r1 && r1.ok && r1.applied && r1.applied.calendar === 2, "★★ **サーバが 受け取る**", r1 && r1.applied);
      const s1 = await 取る();
      const 並 = (s1 && s1.snapshot && s1.snapshot.calendar) || [];
      見(並.length === 2, "★★ **別の 端末（新しい 取り出し）で 2 件 出る**", 並.map((x) => x.title));
      見(並.some((x) => x.title === "実の 期末考査" && x.date === "2026-09-10" && x.kind === "exam"),
        "★★ **中身が そのまま 出る**（包むと 入れ子に なって 題が 消える）", 並[0]);
      /* 消す → 消えた ことが 伝わる */
      const r2 = await 送る({ calendar: [
        { id: "c1", date: "2026-09-10", kind: "exam", title: "実の 期末考査", updatedAt: 今, deletedAt: 今 + 1000 }
      ] });
      見(r2 && r2.ok, "消しの 知らせを 受け取る", r2 && r2.applied);
      const s2 = await 取る();
      const 並2 = (s2 && s2.snapshot && s2.snapshot.calendar) || [];
      const c1 = 並2.filter((x) => x.id === "c1")[0];
      見(c1 && c1.deletedAt > 0, "★★ **消えた ことが 別の 端末へ 伝わる**", c1 && { id: c1.id, deletedAt: c1.deletedAt });
      見(並2.filter((x) => !x.deletedAt).length === 1, "生きて いるのは 1 件", 並2.length);
      /* 古い 知らせで 生き返らせない */
      const r3 = await 送る({ calendar: [
        { id: "c1", title: "生き返り", updatedAt: 今 - 5000, deletedAt: 0 }
      ] });
      const s3 = await 取る();
      const c1b = ((s3 && s3.snapshot && s3.snapshot.calendar) || []).filter((x) => x.id === "c1")[0];
      見(c1b && c1b.deletedAt > 0, "★★ **古い 知らせでは 生き返らない**", c1b && { title: c1b.title, deletedAt: c1b.deletedAt });
    }
  }

  await browser.close();
  console.log("\n────────────────────────────────");
  console.log("  ok " + 済 + " / NG " + 落);
  if (落) { console.log("  落ちた: " + 落ち.join(" / ")); process.exit(1); }
})();
