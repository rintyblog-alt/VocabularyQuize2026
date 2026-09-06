#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqsurviveshot.cjs — VocabuSurvive を **目で 見る** ための 写真取り。

   直したら 数だけでなく 実際の 絵を 見ないと、
   「動いているが ひどい」に 気づけない（2026-08-31 の 出発点が それだった）。

   使い方:
     node vqsurviveshot.cjs                      … PC・縦・横 の 3 面
     node vqsurviveshot.cjs --面 sp              … 1 面だけ
     node vqsurviveshot.cjs --コース 12          … コースの 番号（0 始まり）
     node vqsurviveshot.cjs --出 shots/a         … 置き場
     node vqsurviveshot.cjs --秒 12              … 走らせる 秒数

   置き場の 既定: exports/survive-shots/
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs"), path = require("path");
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では 撮りません。"); process.exit(2); }
const { chromium } = require("playwright");
const 待 = (m) => new Promise((s) => setTimeout(s, m));

function 引数(名, 既定) {
  const i = process.argv.indexOf(名);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : 既定;
}
const OUT = path.resolve(引数("--出", "exports/survive-shots"));
const コース = Number(引数("--コース", "12"));
const 秒 = Number(引数("--秒", "9"));
const 面指定 = 引数("--面", "");
const 走る = Number(引数("--走る", "0"));
const 画質 = 引数("--画質", "");
const 明暗 = 引数("--明暗", "");   /* light / dark。指定しないと 本体の 設定のまま */
fs.mkdirSync(OUT, { recursive: true });

const 面ら = [
  { 名: "pc",  vp: { width: 1440, height: 900 }, touch: false },
  { 名: "sp",  vp: { width: 390, height: 844 },  touch: true },
  { 名: "spL", vp: { width: 844, height: 390 },  touch: true },
  /* いちばん 狭い 実機（iPhone SE 第1世代）と、大きな 画面。
     ふだんは 撮らない（--面 で 指定した ときだけ）。 */
  { 名: "sp320", vp: { width: 320, height: 568 }, touch: true },
  { 名: "wide",  vp: { width: 2560, height: 1440 }, touch: false }
].filter((f) => 面指定 ? f.名 === 面指定 : (f.名 !== "sp320" && f.名 !== "wide"));

async function 掃除(pg) {
  await pg.evaluate(() => {
    const f = () => {
      document.body.classList.remove("auth-booting", "auth-gate-open", "first-launch-open");
      for (const id of ["authGate","authBootSplash","firstLaunchOverlay","globalLoadingOverlay","vqTour","vqNewAuth","vqNewsFlash"]) {
        const e = document.getElementById(id); if (e) { e.classList.add("hidden"); e.style.display = "none"; }
      }
    };
    f(); if (!window.__vqShotGuard) window.__vqShotGuard = setInterval(f, 150);
  });
}
const 影 = (pg, fn, arg) => pg.evaluate(([f, a]) => {
  const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
  return new Function("r", "a", "return (" + f + ")(r, a)")(r, a);
}, [String(fn), arg]);

(async () => {
  console.log("撮る先:", BASE, "→", OUT);
  for (const 面 of 面ら) {
    const browser = await chromium.launch({ args: ["--use-gl=angle", "--enable-unsafe-swiftshader"] });
    const ctx = await browser.newContext({ viewport: 面.vp, hasTouch: 面.touch });
    const pg = await ctx.newPage();
    const 例外 = [];
    pg.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 160)));
    await pg.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await pg.waitForFunction(() => !!document.getElementById("appSurvivePage"), null, { timeout: 40000 });
    /* ★ 明暗を 決め打ちで 試せる ように する（2026-08-31）。
       朝 6 時に 本体が ライトへ 切り替わった とたん、**それまで 見えて いなかった
       不具合が 4 つ 出た**。片方だけ 見て いると 半分しか 見て いない。 */
    if (明暗) await pg.evaluate((m) => {
      document.documentElement.setAttribute("data-theme-mode", m);
      try { localStorage.setItem("app.theme.v1", m.toUpperCase()); } catch (e) {}
    }, 明暗);
    await 掃除(pg);
    await pg.evaluate(() => document.querySelector('#appTabBar [data-app-tab="survive"]').click());
    await pg.waitForFunction(() => window.VocabuSurvive && window.VocabuSurvive.state().opened, null, { timeout: 90000, polling: 250 });
    if (画質) await pg.evaluate((q) => { try { window.VocabuSurvive.__app.setQuality(q); } catch (e) {} }, 画質);
    await 待(2200);
    await pg.screenshot({ path: `${OUT}/${面.名}-1-loading.png` });

    await pg.waitForFunction(() => {
      const h = document.querySelector("#appSurvivePage .vq-survive-host");
      return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vs-load-start"));
    }, null, { timeout: 90000, polling: 250 });
    await 影(pg, (r) => r.querySelector(".vs-load-start").click());
    await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "lobby", null, { timeout: 40000 });
    await 待(2200);
    await pg.screenshot({ path: `${OUT}/${面.名}-2-lobby.png` });

    /* コースの 窓を 開けてから 選ぶ（記章や 目標タイムも ここに 出る）。 */
    await 影(pg, (r) => { const t = r.querySelector('[data-tile="course"]'); if (t) t.click(); });
    await 待(700);
    await 影(pg, (r, a) => { const c = r.querySelectorAll(".vs-lb-cc"); if (c[a]) c[a].click(); }, コース);
    await 待(900);
    await pg.screenshot({ path: `${OUT}/${面.名}-2b-course.png` });
    await 影(pg, (r) => { const x = r.querySelector('.vs-lb-pane[data-pane="course"] .vs-lb-x'); if (x) x.click(); });
    await 待(500);

    /* 窓を ひと通り 撮る（きせかえ・みんなで・設定）。 */
    for (const [k, 名] of [["look", "look"], ["party", "party"], ["setting", "setting"], ["stats", "stats"], ["mine", "mine"]]) {
      /* ★ 窓は 画面の 中の 関数で 開ける。ボタンを 探して 押すと
         「？」を 押して あそびかたが 出る（実際に 一度 やった）。 */
      await pg.evaluate((a) => {
        const lb = window.VocabuSurvive.__app.shell.get("lobby");
        if (lb && lb._openPane) lb._openPane(a);
      }, k);
      await 待(650);
      await pg.screenshot({ path: `${OUT}/${面.名}-2c-${名}.png` });
      await 影(pg, (r, a) => { const x = r.querySelector('.vs-lb-pane[data-pane="' + a + '"] .vs-lb-x'); if (x) x.click(); }, k);
      await 待(350);
    }

    await 影(pg, (r) => r.querySelector(".vs-lb-start").click());
    await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "match", null, { timeout: 60000 });
    await 待(1400);
    await pg.screenshot({ path: `${OUT}/${面.名}-3-help.png` });
    /* 合図の 見せ場（説明を 閉じた 直後の 1 秒）も 撮る。 */
    await 影(pg, (r) => { const c = r.querySelector(".vs-help-card"); if (c) { const b = c.querySelectorAll("button"); if (b.length) b[b.length - 1].click(); } });
    await 待(700);
    await pg.screenshot({ path: `${OUT}/${面.名}-3b-intro.png` });
    await 待(1900);
    await pg.screenshot({ path: `${OUT}/${面.名}-4-start.png` });
    /* ★ 実際に 走らせて **コースの 途中**も 見る（2026-08-31）。
       立ち止まった 出発点だけ 見ていると、真ん中の 出来を 見落とす。
       棒を 前に 倒し、たまに 跳ぶ。ボットと 同じ 入り口を 使う。 */
    if (走る) {
      await pg.evaluate(() => {
        const ms = window.VocabuSurvive.__app.shell.get("match");
        if (window.__vqRun) clearInterval(window.__vqRun);
        let n = 0;
        window.__vqRun = setInterval(() => {
          try {
            ms.input.setAxis(0, -1);
            if (++n % 26 === 0) { ms.input.pressJump(); setTimeout(() => ms.input.releaseJump(), 160); }
          } catch (e) {}
        }, 50);
      });
    }
    await 待(秒 * 1000);
    await pg.screenshot({ path: `${OUT}/${面.名}-5-race.png` });
    if (走る) {
      await 待(Math.max(0, 走る) * 1000);
      await pg.screenshot({ path: `${OUT}/${面.名}-5c-mid.png` });
      await pg.evaluate(() => { if (window.__vqRun) clearInterval(window.__vqRun);
        const ms = window.VocabuSurvive.__app.shell.get("match"); ms.input.setAxis(0, 0); });
    }

    /* クイズの 窓。門まで 走らせると 時間が かかるので 同じ 板に 見本を 入れる。 */
    await pg.evaluate(() => {
      const ms = window.VocabuSurvive.__app.shell.get("match");
      ms.quiz.ask({ prompt: "abandon", tag: "ことばの 門",
        choices: ["見捨てる", "褒めたたえる", "たしかめる", "組み立てる"], answer: 0 }, 12);
    }).catch(() => {});
    await 待(700);
    await pg.screenshot({ path: `${OUT}/${面.名}-5b-quiz.png` });
    await pg.evaluate(() => { const ms = window.VocabuSurvive.__app.shell.get("match"); ms.quiz.close(); }).catch(() => {});
    await 待(300);

    /* ★ ゴールの ひと呼吸は **いちばん あとに**（2026-08-31）。
       ここで local.finished を 立てる ので、先に やると
       その あとの 撮り物の 順位が 狂う（finishOrder に 入って いない ため
       ゴールした 人と 走って いる 人の 番号が どちらも 1 から 始まる）。 */
    /* ゴールの ひと呼吸。実際に ゴールさせると 何分も かかるので、
       ゴールした ことに して 同じ 道を 通す。 */
    await pg.evaluate(() => {
      const ms = window.VocabuSurvive.__app.shell.get("match");
      const p = ms.local;
      p.finished = true; p.finishTime = 62.4; p.rank = 1; p.eliminated = false;
      ms._finish();
    }).catch(() => {});
    await 待(650);
    await pg.screenshot({ path: `${OUT}/${面.名}-6b-goal.png` });
    await 待(1200);
    await pg.evaluate(() => { const ms = window.VocabuSurvive.__app.shell.get("match"); ms.result.hide(); }).catch(() => {});
    await 待(200);

    /* 結果の 画面。実際に ゴールするまで 走らせると 何分も かかるので、
       同じ 板に 見本の 値を 入れて 見る（見た目を 確かめる ため）。 */
    await pg.evaluate(() => {
      const ms = window.VocabuSurvive.__app.shell.get("match");
      ms.result.show({
        rank: 2, total: 4, time: 74.28, correct: 5, wrong: 2, respawns: 1, xp: 132,
        best: 78.9, newBest: true, courseName: ms.course ? ms.course.def.name : "コース",
        courseDef: ms.course ? ms.course.def : null,
        finished: true, eliminated: false,
        standings: [
          { name: "コーラル", rank: 1, me: false, colorIndex: 2, finished: true, finishTime: 71.4, pct: 1 },
          { name: "あなた", rank: 2, me: true, colorIndex: 0, finished: true, finishTime: 74.28, pct: 1 },
          { name: "ミント", rank: 3, me: false, colorIndex: 4, finished: true, finishTime: 80.1, pct: 1 },
          { name: "サン", rank: 4, me: false, colorIndex: 6, finished: false, pct: 0.62 }
        ],
        missed: [{ q: "abandon", a: "見捨てる" }, { q: "vivid", a: "鮮やかな" }]
      });
    }).catch(() => {});
    await 待(900);
    await pg.screenshot({ path: `${OUT}/${面.名}-6-result.png` });
    await pg.evaluate(() => { const ms = window.VocabuSurvive.__app.shell.get("match"); ms.result.hide(); }).catch(() => {});

    const 実 = await pg.evaluate(() => {
      const A = window.VocabuSurvive.__app, ms = A.shell.get("match");
      const host = document.getElementById("appSurvivePage");
      const r = host.getBoundingClientRect();
      return {
        tier: A.settings && A.settings.tier,
        没入: document.body.classList.contains("vq-survive-immersive"),
        本当の全画面: !!document.fullscreenElement,
        器: { w: Math.round(r.width), h: Math.round(r.height) },
        画面: { w: innerWidth, h: innerHeight },
        板: ms && ms.canvas ? { w: ms.canvas.width, h: ms.canvas.height } : null,
        描き: ms && ms.renderer ? ms.renderer.stats : null,
        後処理: ms && ms.renderer && ms.renderer.postInfo ? ms.renderer.postInfo() : null,
        解像度: ms && ms.renderer && ms.renderer.dynInfo ? ms.renderer.dynInfo() : null,
        コース: ms && ms.course ? ms.course.id : "",
        場面: ms && ms.sim ? ms.sim.phase : ""
      };
    }).catch((e) => ({ err: String(e).slice(0, 140) }));
    console.log(" ", 面.名, JSON.stringify(実), 例外.length ? ("例外:" + 例外.slice(0, 2)) : "");
    await browser.close();
  }
  console.log("できました:", OUT);
})().catch((e) => { console.error(e); process.exit(1); });
