#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqsurvivefit.cjs — **文字が つぶれて いないか**。どの 幅でも。

   ★ 2026-08-31 に 見つけた 不具合:
     390px の ロビーで 「今日の コース」の 札が 84px まで 縮み、
     **コース名が 幅 0 に なって 消えて いた**。
     枠は 見えて いる のに 中身だけ 無い ので、撮った 絵を
     ざっと 見ても 気づかない（「札が 出ている」と 思って しまう）。

   ここで 見るのは 1 つだけ:
     **文字が 入って いる のに 幅 0 の 部品が ないか。**
     （flex で 押し負けた ものは 必ず これに なる）
   ＋ 横に はみ出して いないか。

   ★ **この 検査が 本当に その 不具合を 捕まえるか を 確かめた。**
     直しを 一度 戻して 走らせると 390 で
       NG {"類":"vs-lb-daily-n","文":"嵐の橋","w":0}
     と 出た。戻すと 通る。捕まえない 検査を 置かない。

   横に 流せる 入れ物（rail）の 中は はみ出しでは ない。
   これを 除かないと 「右へ まだ 続く」作りが 全部 不具合に 見える。

   幅: 320 / 390 / 430 / 768 / 横向き 844×390

   使い方: node vqsurvivefit.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || process.env.VQ_API || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では 実行しません。"); process.exit(2); }
const { chromium } = require("playwright");
const 待 = (m) => new Promise((s) => setTimeout(s, m));
let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 240) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 420) : "")); }
};

/* 影の DOM の 中を すべて 見て、「文字が あるのに 幅 0」を 拾う。 */
const 調べる = `(() => {
  const host = document.querySelector("#appSurvivePage .vq-survive-host");
  if (!host || !host.shadowRoot) return { err: "影の DOM が ない" };
  const W = window.innerWidth;
  const つぶれ = [], はみ = [];
  const 見える = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    if (Number(cs.opacity) < 0.02) return false;
    return true;
  };
  /* 横に 流せる 入れ物（rail など）の 中は はみ出しでは ない。
     ★ これを 入れないと 「右へ まだ 続く」作りが 全部 不具合に 見える。 */
  const 流せる中 = (el) => {
    let p = el.parentElement;
    while (p) {
      const cs = getComputedStyle(p);
      if ((cs.overflowX === "auto" || cs.overflowX === "scroll") && p.scrollWidth > p.clientWidth + 2) return true;
      p = p.parentElement || (p.getRootNode() && p.getRootNode().host) || null;
    }
    return false;
  };
  const 歩く = (root) => {
    for (const el of root.querySelectorAll("*")) {
      if (el.tagName === "CANVAS" || el.tagName === "SVG" || el.tagName === "STYLE") continue;
      /* 自分が 直に 持っている 文字だけ 見る（入れ子の 合計では ない） */
      let 文 = "";
      for (const n of el.childNodes) if (n.nodeType === 3) 文 += n.nodeValue;
      文 = 文.replace(/\\s+/g, "");
      if (!文) continue;
      if (!見える(el)) continue;
      let p = el.parentElement, 隠 = false;
      while (p && p !== root) { if (!見える(p)) { 隠 = true; break; } p = p.parentElement; }
      if (隠) continue;
      const b = el.getBoundingClientRect();
      if (b.height < 1) continue;                    /* 高さも 0 = 畳まれている 中身 */
      const 道 = el.className && String(el.className).slice(0, 40);
      if (b.width < 1) つぶれ.push({ 類: 道, 文: 文.slice(0, 14), w: +b.width.toFixed(1) });
      else if (b.right > W + 1.5 && !流せる中(el)) はみ.push({ 類: 道, 文: 文.slice(0, 14), 右: +b.right.toFixed(1), 幅: W });
    }
  };
  歩く(host.shadowRoot);
  return { つぶれ, はみ, 数: host.shadowRoot.querySelectorAll("*").length };
})()`;

async function 開く(pg) {
  await pg.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => !!document.getElementById("appSurvivePage"), null, { timeout: 60000 });
  await pg.evaluate(() => { const f = () => { document.body.classList.remove("auth-booting","auth-gate-open","first-launch-open");
    for (const id of ["authGate","authBootSplash","firstLaunchOverlay","globalLoadingOverlay","vqTour","vqNewAuth","vqNewsFlash"]) {
      const e = document.getElementById(id); if (e) { e.classList.add("hidden"); e.style.display = "none"; } } }; f(); setInterval(f, 150); });
  await pg.evaluate(() => { try { localStorage.setItem("vq.survive.helpseen.v1", "1"); } catch (e) {} });
  await pg.evaluate(() => document.querySelector('#appTabBar [data-app-tab="survive"]').click());
  await pg.waitForFunction(() => window.VocabuSurvive && window.VocabuSurvive.state().opened, null, { timeout: 120000, polling: 250 });
  await pg.waitForFunction(() => { const h = document.querySelector("#appSurvivePage .vq-survive-host");
    return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vs-load-start")); }, null, { timeout: 120000, polling: 250 });
  await pg.evaluate(() => document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot.querySelector(".vs-load-start").click());
  await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "lobby", null, { timeout: 40000 });
  await 待(1100);
}

const 画面 = [
  { 名: "320", vp: { width: 320, height: 640 }, touch: true },
  { 名: "390", vp: { width: 390, height: 844 }, touch: true },
  { 名: "430", vp: { width: 430, height: 932 }, touch: true },
  { 名: "横 844x390", vp: { width: 844, height: 390 }, touch: true },
  { 名: "768", vp: { width: 768, height: 1024 }, touch: true },
  { 名: "机 1440", vp: { width: 1440, height: 900 }, touch: false }
];

(async () => {
  console.log("測る先:", BASE);
  const browser = await chromium.launch({ args: ["--use-gl=angle", "--enable-unsafe-swiftshader"] });
  const 例外 = [];
  for (const s of 画面) {
    const ctx = await browser.newContext({ viewport: s.vp, hasTouch: s.touch, isMobile: s.touch && s.vp.width < 800 });
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => 例外.push(s.名 + ": " + String(e.message).slice(0, 120)));
    await 開く(pg);

    節("ロビー（" + s.名 + "）");
    const r1 = await pg.evaluate(調べる);
    見(!r1.err && r1.つぶれ.length === 0, "文字が あるのに 幅 0 の 部品が ない", r1.つぶれ || r1.err);
    見(!r1.err && r1.はみ.length === 0, "横に はみ出して いない", r1.はみ || r1.err);

    /* コースの 窓・きせかえ の 窓も 開いて 見る（畳んだ ままだと 何も 測れない） */
    for (const [鍵, 呼] of [["course", "コースの 窓"], ["look", "きせかえの 窓"], ["setting", "設定の 窓"]]) {
      /* ★ **本当に 開いたか を 確かめてから 測る。**
         直す前は 「[data-pane=...] を click」で 済ませていたが、
         それに 当たるのは 板 そのもの（閉じて いる）で、
         押しても 何も 起きて いなかった。
         6 つの 幅 × 3 つの 窓 ＝ 18 件が **何も 測って いなかった**（2026-08-31）。 */
      const 開けた = await pg.evaluate((k) => {
        const lb = window.VocabuSurvive.__app.shell.get("lobby");
        if (!lb || !lb._openPane) return false;
        lb._openPane(k);
        const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
        const p2 = r.querySelector('.vs-lb-pane[data-pane="' + k + '"]');
        return !!(p2 && p2.getAttribute("data-on") === "1");
      }, 鍵);
      見(開けた, 呼 + ": 実際に 開く", 開けた);
      if (!開けた) continue;
      await 待(500);
      const r = await pg.evaluate(調べる);
      見(!r.err && r.つぶれ.length === 0, 呼 + ": 幅 0 の 文字が ない", r.つぶれ || r.err);
      見(!r.err && r.はみ.length === 0, 呼 + ": はみ出して いない", r.はみ || r.err);
      /* ★ 窓を **閉じられる** こと。狭い 画面では 下から 出る 板に なる ので、
         閉じる ところが 画面の 外に 行くと そこから 戻れなく なる。 */
      const 閉じ = await pg.evaluate(() => {
        const r2 = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
        const pane = r2.querySelector('.vs-lb-pane[data-on="1"]');
        if (!pane) return null;
        const b = pane.querySelector(".vs-lb-x");
        if (!b) return { なし: true };
        const q = b.getBoundingClientRect();
        return { 上: Math.round(q.top), 下: Math.round(q.bottom), 高: window.innerHeight,
          幅: Math.round(q.width), 名: b.getAttribute("aria-label") || b.textContent };
      });
      見(!閉じ || 閉じ.なし || (閉じ.下 <= 閉じ.高 + 2 && 閉じ.上 >= -2 && 閉じ.幅 > 20),
        呼 + ": 閉じる ところが 画面の 中に ある", 閉じ);
      await pg.evaluate(() => { const lb = window.VocabuSurvive.__app.shell.get("lobby"); lb._openPane(""); }).catch(() => {});
      await 待(300);
    }

    節("走っている 間（" + s.名 + "）");
    await pg.evaluate(() => {
      const lb = window.VocabuSurvive.__app.shell.get("lobby");
      lb.courseIndex = 0; lb.mode = "survival"; lb.botCount = 5; lb._save(); lb._render();
      document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot.querySelector(".vs-lb-start").click();
    });
    await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "match", null, { timeout: 60000 });
    await 待(4200);
    const r2 = await pg.evaluate(調べる);
    見(!r2.err && r2.つぶれ.length === 0, "文字が あるのに 幅 0 の 部品が ない", r2.つぶれ || r2.err);
    見(!r2.err && r2.はみ.length === 0, "横に はみ出して いない", r2.はみ || r2.err);

    /* 門の 窓（いちばん 文字が 多い） */
    await pg.evaluate(() => {
      const ms = window.VocabuSurvive.__app.shell.get("match");
      const g = ms.course.gates && ms.course.gates[0];
      if (g) ms._askQuiz(ms.local, g);
    }).catch(() => {});
    await 待(700);
    const r3 = await pg.evaluate(調べる);
    見(!r3.err && r3.つぶれ.length === 0, "門の 窓: 幅 0 の 文字が ない", r3.つぶれ || r3.err);
    見(!r3.err && r3.はみ.length === 0, "門の 窓: はみ出して いない", r3.はみ || r3.err);

    /* ★ あそびかたの 板。**初めて 遊ぶ 人が いちばん 最初に 見る**ので、
       閉じる ボタンが 画面の 下に 隠れると そこで 詰む。 */
    await pg.evaluate(() => {
      const ms = window.VocabuSurvive.__app.shell.get("match");
      ms.quiz && ms.quiz.hide && ms.quiz.hide();
      ms.help.show();
      const d = ms.help.el.querySelector(".vs-help-more");
      if (d) d.open = true;                   /* くわしい 表も 開く（いちばん 長い 形） */
    }).catch(() => {});
    await 待(600);
    const rh = await pg.evaluate(調べる);
    見(!rh.err && rh.つぶれ.length === 0, "あそびかた: 幅 0 の 文字が ない", rh.つぶれ || rh.err);
    見(!rh.err && rh.はみ.length === 0, "あそびかた: はみ出して いない", rh.はみ || rh.err);
    const 閉 = await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const c = r.querySelector(".vs-help-card") || r.querySelector(".vs-help");
      const b = c && c.querySelector(".vs-btn");
      if (!b) return null;
      const q = b.getBoundingClientRect();
      return { 文: (b.textContent || "").slice(0, 12), 上: Math.round(q.top), 下: Math.round(q.bottom),
        高: window.innerHeight, 幅: Math.round(q.width) };
    });
    見(!!閉 && 閉.下 <= 閉.高 + 2 && 閉.上 >= -2 && 閉.幅 > 40,
      "★ あそびかたを 閉じる ボタンが 流さずに 見えている", 閉);
    await pg.evaluate(() => { const ms = window.VocabuSurvive.__app.shell.get("match"); ms.help.hide(); }).catch(() => {});
    await 待(300);

    /* ★ やめる かどうかの 窓。 */
    await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const b = r.querySelector(".vs-sysb-quit");
      if (b) b.click();
    }).catch(() => {});
    await 待(400);
    const rq = await pg.evaluate(調べる);
    見(!rq.err && rq.つぶれ.length === 0, "やめる 窓: 幅 0 の 文字が ない", rq.つぶれ || rq.err);
    見(!rq.err && rq.はみ.length === 0, "やめる 窓: はみ出して いない", rq.はみ || rq.err);
    await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const b = r.querySelector(".vs-quit .vs-btn");
      if (b) b.click();
    }).catch(() => {});
    await 待(300);

    /* ★ 結果の 画面が **いちばん 文字が 多い**（順位・成績 4 つ・記章・
       育ち・間違えた 単語・一覧・ボタン 5 つ）。名前を 長くして 試す。 */
    await pg.evaluate(() => {
      const ms = window.VocabuSurvive.__app.shell.get("match");
      ms.quiz && ms.quiz.hide && ms.quiz.hide();
      ms.result.show({
        rank: 2, total: 8, time: 134.28, correct: 5, wrong: 3, respawns: 12, xp: 1320,
        best: 178.9, newBest: true, courseName: ms.course ? ms.course.def.name : "コース",
        courseDef: ms.course ? ms.course.def : null,
        finished: true, eliminated: false,
        standings: [
          { name: "ながいなまえのひと", rank: 1, me: false, colorIndex: 2, finished: true, finishTime: 131.4, pct: 1 },
          { name: "あなた", rank: 2, me: true, colorIndex: 0, finished: true, finishTime: 134.28, pct: 1 },
          { name: "ミント", rank: 3, me: false, colorIndex: 4, finished: true, finishTime: 180.1, pct: 1 },
          { name: "サン", rank: 4, me: false, colorIndex: 6, finished: false, pct: 0.62 }
        ],
        missed: [{ q: "abandon", a: "見捨てる", y: "褒めたたえる" },
                 { q: "extraordinary", a: "並外れた", y: "ふつうの" }]
      });
    }).catch(() => {});
    await 待(800);
    const r4 = await pg.evaluate(調べる);
    見(!r4.err && r4.つぶれ.length === 0, "結果の 画面: 幅 0 の 文字が ない", r4.つぶれ || r4.err);
    見(!r4.err && r4.はみ.length === 0, "結果の 画面: はみ出して いない", r4.はみ || r4.err);
    /* 縦に 収まらない ときは **中で 巻ける** こと（画面の 外に 出ない）。 */
    const 巻 = await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const el = r.querySelector(".vs-res-card") || r.querySelector(".vs-res");
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { 上: Math.round(b.top), 下: Math.round(b.bottom), 高: window.innerHeight,
        巻ける: el.scrollHeight > el.clientHeight + 2 || getComputedStyle(el).overflowY !== "visible" };
    });
    見(!!巻 && 巻.下 <= 巻.高 + 2, "結果の 画面が 画面の 下から はみ出さない", 巻);
    /* ★ **押す ところは 流さずに 届く** こと（2026-08-31）。
       縦の スマホでは 成績・記章・育ち・間違えた 単語・一覧 と 長く、
       「もう一度」が 画面の 下に 隠れて いた。走る たびに 指で 探す ことに なる。 */
    const 主 = await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const b = r.querySelector(".vs-res-btns .vs-btn.is-mint");
      if (!b) return null;
      const q = b.getBoundingClientRect();
      return { 文: b.textContent, 上: Math.round(q.top), 下: Math.round(q.bottom),
        高: window.innerHeight, 幅: Math.round(q.width) };
    });
    見(!!主 && 主.下 <= 主.高 + 2 && 主.上 >= -2 && 主.幅 > 60,
      "★ いちばん 押したい ボタンが 流さずに 見えている", 主);

    await ctx.close();
  }

  節("例外");
  const 実 = 例外.filter((m) => !/ResizeObserver|Non-Error|Load failed|NetworkError|Failed to fetch/i.test(m));
  見(実.length === 0, "実害の ある 例外が 0 件", 実.slice(0, 4));

  console.log("\n────────────────────────────────");
  console.log("  ok " + 済 + " / NG " + 落);
  if (落) console.log("  落ちた: " + 落ち.join(" / "));
  await browser.close();
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
