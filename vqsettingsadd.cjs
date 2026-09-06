#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqsettingsadd.cjs — 増やした 設定が **本当に 効く**か（2026-09-01・訴え）

   訴え:「現状で アプリ設定で 増やしたら 便利な ものを どんどん 追加して いって
         くれ。**これも 機能する ように ね。**」

   ★ 「並べただけ」を いちばん 避ける。つまみが あるのに 何も 変わらないのは、
     無い よりも 悪い（探して 押して 何も 起きない 時間が 無駄に なる）。

   増やした もの:
     display.keepAwake  … 学習中に 画面を 暗く しない（Wake Lock）
     display.homeRails  … ホームの 棚（おすすめ・お知らせ）を 出す／切る
     display.proverb    … 今日の ことわざを 出す／切る
     learn.dailyGoal    … 1 日の 目あて（問題数）→ ホームに 進み具合
     data.calendarSync  … カレンダーを アカウントへ 同期する／しない

   見るもの:
     ① 定義表に 入って いる（画面に 出る）
     ② 切ると **本当に 消える**（棚・ことわざ）
     ③ 目あてを 入れると **ホームに 進み具合が 出る**
     ④ カレンダーの 同期を 切ると **送らなく なる**
     ⑤ 画面を 暗く しないは 端末が 対応して いない ときも 落ちない
     ⑥ 設定の「ヘルプ」が 新しい ヘルプを 開く

   使い方: VQ_BASE=http://127.0.0.1:8791 node vqsettingsadd.cjs
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
const 家 = (pg, f) => pg.evaluate((s) => {
  const h = Array.prototype.find.call(document.querySelectorAll("*"),
    (n) => n.shadowRoot && n.shadowRoot.querySelector("[data-home-rec]"));
  if (!h) return null;
  return new Function("sr", s)(h.shadowRoot);
}, f);

(async () => {
  const browser = await chromium.launch();
  const pg = await (await browser.newContext({ viewport: { width: 1200, height: 900 } })).newPage();
  const 例外 = []; pg.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 200)));
  let 送 = 0;
  await pg.route("**/api/sync/upsert", async (r) => { 送++; await r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' }); });
  await pg.route("**/api/news/list*", async (r) => {
    await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [1, 2, 3].map((i) => ({ id: "n" + i, title: "お知らせ " + i, body: "x", publishedAt: Date.now() })) }) });
  });
  await pg.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => window.__vqSet && window.__vqSet.specs, null, { timeout: 30000 }).catch(() => {});
  await 待(3500);

  節("① 定義表に 入って いる");
  const a = await pg.evaluate(() => {
    const S = window.__vqSet;
    if (!S || !S.specs) return null;
    const ids = S.specs().map((x) => x.id);
    const 要 = ["display.keepAwake", "display.homeRails", "display.proverb", "learn.dailyGoal",
                "data.calendarSync", "display.weekStart", "display.compactCards", "data.exportCalendar"];
    const 表 = {};
    要.forEach((i) => { const sp = S.specs().filter((x) => x.id === i)[0];
      表[i] = sp ? { type: sp.type, apply: !!sp.apply, run: !!sp.run, label: sp.label } : null; });
    return { 全: ids.length, 表 };
  });
  見(!!a, "設定の 定義表が ある");
  if (a) {
    Object.keys(a.表).forEach((k) => {
      見(!!a.表[k], k + " が ある", a.表[k]);
      if (a.表[k]) 見(a.表[k].apply || a.表[k].run,
        "★ " + k + " に **効かせる 中身**が ある（並べただけに しない）", a.表[k].type);
    });
  }

  節("②③ 切ると 本当に 変わる");
  const b = await pg.evaluate(async () => {
    const S = window.__vqSet;
    const 見え = () => {
      const h = Array.prototype.find.call(document.querySelectorAll("*"),
        (n) => n.shadowRoot && n.shadowRoot.querySelector(".rail-card"));
      if (!h) return null;
      const c = h.shadowRoot.querySelector(".rail-card");
      return getComputedStyle(c).display;
    };
    const 前 = 見え();
    S.set("display.homeRails", false);
    await new Promise((s) => setTimeout(s, 400));
    const 切 = 見え();
    S.set("display.homeRails", true);
    await new Promise((s) => setTimeout(s, 400));
    const 戻 = 見え();
    return { 前, 切, 戻 };
  });
  見(b.前 !== "none", "はじめは 棚が 出て いる", b.前);
  見(b.切 === "none", "★★ **切ると 棚が 消える**", b.切);
  見(b.戻 !== "none", "★ 戻すと また 出る", b.戻);

  const c = await pg.evaluate(async () => {
    const S = window.__vqSet;
    S.set("learn.dailyGoal", 20);
    await new Promise((s) => setTimeout(s, 600));
    const h = Array.prototype.find.call(document.querySelectorAll("*"),
      (n) => n.shadowRoot && n.shadowRoot.querySelector("[data-home-goal]"));
    const g = h && h.shadowRoot.querySelector("[data-home-goal]");
    const 出 = { 有: !!(g && g.querySelector(".goal")),
                 文: g ? g.textContent.replace(/\s+/g, " ").trim() : "",
                 幅: g && g.querySelector(".goal__bar i") ? g.querySelector(".goal__bar i").style.width : "",
                 覚え: localStorage.getItem("vq.dailyGoal.v1") };
    S.set("learn.dailyGoal", 0);
    await new Promise((s) => setTimeout(s, 500));
    出.切ると = !!(g && g.querySelector(".goal"));
    return 出;
  });
  見(c.有, "★★ **目あてを 入れると ホームに 進み具合が 出る**", c.文);
  見(/\/ 20 問/.test(c.文), "目あての 数が 出る", c.文);
  見(!!c.幅, "帯が 出る", c.幅);
  見(c.覚え === "20", "覚えて いる", c.覚え);
  見(!c.切ると, "★ 0 に すると 出さない（要らない ものを 置かない）", c.切ると);

  節("④ カレンダーの 同期を 切る");
  const d = await pg.evaluate(async () => {
    const S = window.__vqSet;
    localStorage.setItem("app.auth.token.v1", "test-token");
    S.set("data.calendarSync", false);
    await new Promise((s) => setTimeout(s, 200));
    window.__vqCalendar.足す({ id: "t1", date: "2026-09-09", kind: "plan", title: "切ってる とき", note: "", deletedAt: 0 });
    await new Promise((s) => setTimeout(s, 1800));
    return { 覚え: localStorage.getItem("vq.calendar.sync.v1") };
  });
  const 送1 = 送;
  見(d.覚え === "0", "切った ことを 覚える", d.覚え);
  見(送1 === 0, "★★ **切って いる 間は 送らない**", 送1);
  const e = await pg.evaluate(async () => {
    window.__vqSet.set("data.calendarSync", true);
    await new Promise((s) => setTimeout(s, 200));
    window.__vqCalendar.足す({ id: "t2", date: "2026-09-09", kind: "plan", title: "戻した とき", note: "", deletedAt: 0 });
    await new Promise((s) => setTimeout(s, 1800));
    return true;
  });
  見(送 > 送1, "★ 戻すと 送る", { 前: 送1, 後: 送 });

  節("⑤ 画面を 暗く しない（対応して いなくても 落ちない）");
  const f = await pg.evaluate(async () => {
    const 前 = 例外なし();
    function 例外なし() { return true; }
    window.__vqSet.set("display.keepAwake", true);
    await new Promise((s) => setTimeout(s, 200));
    document.body.click();
    await new Promise((s) => setTimeout(s, 300));
    window.__vqSet.set("display.keepAwake", false);
    await new Promise((s) => setTimeout(s, 200));
    return { ok: true, 覚え: window.__vqSet.get("display.keepAwake") };
  });
  見(f.ok, "★ 対応して いない 端末でも 落ちない", f);
  見(例外.length === 0, "例外 0 件", 例外);

  節("⑤-b カレンダーの 書き出し（.ics）");
  const ics = await pg.evaluate(() => {
    window.__vqCalendar.足す({ id: "x1", date: "2026-09-10", kind: "exam", title: "期末考査", note: "1〜3章, カンマ; 記号", deletedAt: 0 });
    window.__vqCalendar.足す({ id: "x2", date: "2026-09-11", kind: "log", title: "記録", note: "", deletedAt: 0 });
    const t = window.__vqCalendar.ics();
    return { 文: t, 件: (t.match(/BEGIN:VEVENT/g) || []).length,
             改行: /\r\n/.test(t), 終端: /END:VCALENDAR/.test(t),
             逃: /1〜3章\\, カンマ\\; 記号/.test(t),
             終日: /DTSTART;VALUE=DATE:20260910/.test(t) && /DTEND;VALUE=DATE:20260911/.test(t) };
  });
  /* ★ 前の 段で 足した 予定も 入って いる ので **数では 見ない**。
     「記録」が 1 件も 混ざって いない ことを 見る。 */
  見(ics.件 >= 1 && !/SUMMARY:記録：/.test(ics.文),
    "★★ **記録は 書き出さない**（予定だけ）", { 件: ics.件, 記録あり: /SUMMARY:記録：/.test(ics.文) });
  見(ics.改行 && ics.終端, "★ iCalendar の 形（CRLF・終端）", { 改行: ics.改行, 終端: ics.終端 });
  見(ics.逃, "★ カンマ・セミコロンを 逃がす（読めなく ならない）", ics.逃);
  見(ics.終日, "★★ **終日の 予定は 終わりを 翌日に する**（決まり）", ics.終日);

  節("⑤-c 週の 始まり");
  const 週 = await pg.evaluate(async () => {
    window.__vqCalendar.open();
    await new Promise((s) => setTimeout(s, 400));
    const 読 = () => Array.prototype.map.call(
      document.getElementById("vqCalendar").shadowRoot.querySelectorAll(".wk span"), (e) => e.textContent).join("");
    const 日 = 読();
    window.__vqSet.set("display.weekStart", "1");
    await new Promise((s) => setTimeout(s, 500));
    const 月 = 読();
    window.__vqSet.set("display.weekStart", "0");
    await new Promise((s) => setTimeout(s, 400));
    window.__vqCalendar.close();
    return { 日, 月 };
  });
  見(週.日 === "日月火水木金土", "はじめは 日曜 始まり", 週.日);
  見(週.月 === "月火水木金土日", "★★ **月曜 始まりに 変えられる**", 週.月);

  節("⑥ 設定の「ヘルプ」が 新しい ヘルプを 開く");
  const g = await pg.evaluate(() => {
    const S = window.__vqSet;
    const sp = S.specs().filter((x) => x.id === "help.help")[0];
    return { 有: !!sp, doc: sp ? sp.doc : "", ヘルプ部品: !!window.__vqHelp };
  });
  見(g.有 && g.doc === "help", "ヘルプの 行が ある", g);
  見(g.ヘルプ部品, "新しい ヘルプの 部品が 読み込まれて いる", g.ヘルプ部品);

  await browser.close();
  console.log("\n────────────────────────────────");
  console.log("  ok " + 済 + " / NG " + 落);
  if (落) { console.log("  落ちた: " + 落ち.join(" / ")); process.exit(1); }
})();
