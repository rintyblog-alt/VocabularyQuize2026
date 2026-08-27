#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqsurviveaudit.cjs — 最終監査（要件 45）。

   「作り終えたと 思っても 終わらない」。もう一度 全部を 見る。

     ① 開いて 閉じてを 繰り返しても 溜まらない（後始末）
     ② ログインしていなくても 遊べる（1 人・タイムアタック）
     ③ 鍵盤だけで 遊べる（マウス なし）
     ④ 読み上げ・目印（aria）が 付いている
     ⑤ 画面の 中に 本体の CSS が 入って こない（影の DOM）
     ⑥ 大きさを 変えても 崩れない
     ⑦ タブを 隠して 戻しても 続く
     ⑧ 例外が 一度も 出ない
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const { chromium } = require("playwright");
const { serve } = require("./vqsrvserve.cjs");
const PORT = Number(process.env.VQ_PORT || 8985);
const BASE = "http://127.0.0.1:" + PORT;
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ok   " + n); }
  else { fail++; bad.push(n); console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 300) : "")); }
};
const 節 = (t) => console.log("\n══ " + t + " ══");
const 待つ = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const srv = await serve(PORT);
  const b = await chromium.launch({
    args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader",
           "--disable-dev-shm-usage", "--js-flags=--expose-gc"]
  });
  const errs = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => errs.push("pageerror: " + String(e && e.message || e)));
    pg.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text().slice(0, 200)); });

    const どける = () => pg.evaluate(() => {
      const f = () => {
        document.body.classList.remove("auth-booting", "auth-gate-open", "first-launch-open");
        for (const id of ["authGate", "authBootSplash", "firstLaunchOverlay", "globalLoadingOverlay"]) {
          const e = document.getElementById(id); if (e) e.classList.add("hidden");
        }
      };
      f(); if (!window.__g) window.__g = setInterval(f, 120);
    });

    await pg.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    await pg.waitForFunction(() => !!document.getElementById("appSurvivePage"), null, { timeout: 20000 });
    await どける();

    節("① 開いて 閉じてを 繰り返す");
    const 開く = async () => {
      await pg.evaluate(() => document.querySelector('#appTabBar [data-app-tab="survive"]').click());
      await pg.waitForFunction(() => window.VocabuSurvive && window.VocabuSurvive.state().opened, null, { timeout: 45000, polling: 250 });
      await pg.waitForFunction(() => (window.VocabuSurvive.state().loaded || []).length >= 5, null, { timeout: 45000, polling: 250 }).catch(() => {});
    };
    const 閉じる = async () => {
      await pg.evaluate(() => document.querySelector('#appTabBar [data-app-tab="home"]').click());
      await pg.waitForFunction(() => !window.VocabuSurvive.state().opened, null, { timeout: 20000, polling: 200 });
    };
    await 開く(); await 閉じる();
    const 前 = await pg.evaluate(() => {
      if (window.gc) window.gc();
      return { host: document.querySelectorAll("#appSurvivePage .vq-survive-host").length,
               canvas: document.querySelectorAll("canvas").length,
               mem: (performance.memory && performance.memory.usedJSHeapSize) || 0 };
    });
    for (let i = 0; i < 5; i++) { await 開く(); await 待つ(500); await 閉じる(); }
    await 待つ(800);
    const 後 = await pg.evaluate(() => {
      if (window.gc) window.gc();
      return { host: document.querySelectorAll("#appSurvivePage .vq-survive-host").length,
               canvas: document.querySelectorAll("canvas").length,
               mem: (performance.memory && performance.memory.usedJSHeapSize) || 0 };
    });
    console.log("     器 " + 前.host + "→" + 後.host + " / 板 " + 前.canvas + "→" + 後.canvas
      + " / メモリ " + (前.mem / 1048576).toFixed(1) + "→" + (後.mem / 1048576).toFixed(1) + "MB");
    ok("閉じたら 器が 残らない", 後.host === 0, 後.host);
    ok("板が 溜まらない", 後.canvas <= 前.canvas + 1, { 前: 前.canvas, 後: 後.canvas });
    ok("メモリが 5 倍に ならない", 後.mem < Math.max(120 * 1048576, 前.mem * 5), { 前: 前.mem, 後: 後.mem });

    節("② ログインしていなくても 遊べる");
    await 開く();
    const st = await pg.evaluate(() => window.VocabuSurvive.state());
    ok("読み込みで 例外が 出ない", !st.error, st.error);
    await pg.waitForFunction(() => {
      const h = document.querySelector("#appSurvivePage .vq-survive-host");
      return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vs-load-start"));
    }, null, { timeout: 45000, polling: 250 });
    await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      r.querySelector(".vs-load-start").click();
    });
    await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "lobby", null, { timeout: 20000 });
    const lb = await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      return { note: (r.querySelector(".vs-lb-friendnote") || {}).textContent || "",
               start: !!r.querySelector(".vs-lb-start"),
               startDisabled: r.querySelector(".vs-lb-start").disabled };
    });
    ok("札が 無くても スタートは 押せる", lb.start && !lb.startDisabled, lb);
    ok("友だちの 欄が 案内を 出す", /ログイン/.test(lb.note), lb.note);

    節("②' 設定（画質・音）");
    const 設定 = await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const det = r.querySelector(".vs-lb-settings");
      if (det) det.open = true;
      const q = Array.from(r.querySelectorAll(".vs-lb-q")).map((b) => b.getAttribute("data-q"));
      const 選 = r.querySelector('.vs-lb-q[aria-checked="true"]');
      return { q, 選: 選 ? 選.getAttribute("data-q") : "",
               vol: !!r.querySelector(".vs-lb-range"),
               music: !!r.querySelector('.vs-lb-toggle[aria-pressed]') };
    });
    ok("画質が 5 段 選べる（自動 含む）", 設定.q.join(",") === "auto,low,medium,high,ultra", 設定.q);
    ok("既定は 自動", 設定.選 === "auto", 設定.選);
    ok("音の 大きさを 変えられる", 設定.vol);
    ok("曲の 入切が ある", 設定.music);
    /* 実際に 変えて 覚えるか */
    const 変えた = await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      r.querySelector('.vs-lb-q[data-q="low"]').click();
      return { 覚え: localStorage.getItem("vq.survive.tier.v1"),
               tier: window.VocabuSurvive.state().tier };
    });
    ok("選んだ 画質を 覚える", 変えた.覚え === "low", 変えた);
    ok("その場で 段が 変わる", 変えた.tier === "low", 変えた);
    await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      r.querySelector('.vs-lb-q[data-q="auto"]').click();
    });

    節("③ 鍵盤だけで 遊べる");
    await pg.evaluate(() => window.VocabuSurvive.__app.startMatch({ courseId: "c01", bots: 2, myName: "監査", myColor: 0, seed: 1 }));
    await pg.waitForFunction(() => {
      const m = window.VocabuSurvive.__app.shell.get("match");
      return m && m.sim && m.sim.phase === "running";
    }, null, { timeout: 25000 });
    const y0 = await pg.evaluate(() => { const m = window.VocabuSurvive.__app.shell.get("match"); return { yaw: m.cam.wantYaw, z: m.local.z }; });
    await pg.keyboard.down("KeyQ"); await 待つ(500); await pg.keyboard.up("KeyQ");
    const y1 = await pg.evaluate(() => window.VocabuSurvive.__app.shell.get("match").cam.wantYaw);
    /* Q は 左（wantYaw が 増える）。前向きは -x 側へ 回る。 */
    ok("Q で カメラが 左へ 回る", y1 > y0.yaw + 0.2, { 前: y0.yaw, 後: y1 });
    await pg.keyboard.down("KeyE"); await 待つ(500); await pg.keyboard.up("KeyE");
    const y2 = await pg.evaluate(() => window.VocabuSurvive.__app.shell.get("match").cam.wantYaw);
    ok("E で 右へ 回る（Q の 逆）", y2 < y1 - 0.2, { 前: y1, 後: y2 });
    await pg.keyboard.down("KeyW"); await 待つ(1200); await pg.keyboard.up("KeyW");
    const z1 = await pg.evaluate(() => window.VocabuSurvive.__app.shell.get("match").local.progress);
    ok("W で 走る", z1 > 4, z1);
    await pg.keyboard.press("Space");
    await 待つ(200);
    const air = await pg.evaluate(() => window.VocabuSurvive.__app.shell.get("match").local.y);
    ok("Space で 跳ぶ", air > 0.3, air);

    節("④ 読み上げ・目印");
    const a11y = await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const live = r.querySelector('[aria-live]');
      const prog = r.querySelector('[role="progressbar"]');
      const btns = Array.from(r.querySelectorAll("button"));
      const 名なし = btns.filter((b) => !b.textContent.trim() && !b.getAttribute("aria-label"));
      const list = r.querySelector('.vs-hud-list');
      return {
        live: !!live, prog: !!prog, btns: btns.length, 名なし: 名なし.length,
        listLabel: list ? list.getAttribute("aria-label") : "",
        quizDialog: !!r.querySelector('.vs-quiz[role="dialog"]')
      };
    });
    ok("読み上げ用の 生放送欄が ある", a11y.live);
    ok("名前の 無い ボタンが ない", a11y.名なし === 0, a11y.名なし);
    ok("順位表に 名前が 付いている", !!a11y.listLabel, a11y.listLabel);
    ok("クイズの 窓に 役目が 付いている", a11y.quizDialog);

    節("⑤ 本体の CSS が 入って こない");
    const iso = await pg.evaluate(() => {
      const host = document.querySelector("#appSurvivePage .vq-survive-host");
      const r = host.shadowRoot;
      /* 本体の 目立つ 決まりを 差し込んで、影の 中が 影響を 受けない ことを 見る */
      const st = document.createElement("style");
      st.textContent = "button, .vs-btn, canvas { display:none !important; background:red !important; }";
      document.head.appendChild(st);
      const cv = r.querySelector("canvas");
      const cs = cv ? getComputedStyle(cv) : null;
      const res = { display: cs ? cs.display : "", w: cv ? cv.clientWidth : 0 };
      st.remove();
      return res;
    });
    ok("外から display:none を 掛けても 影の 中は 無事", iso.display !== "none" && iso.w > 100, iso);

    節("⑥ 大きさを 変える");
    for (const [w, h] of [[360, 640], [768, 1024], [1440, 900], [844, 390]]) {
      await pg.setViewportSize({ width: w, height: h });
      /* ★ **本体の 置き直しが 終わるまで 待つ。**
         500ms 固定では 足りない ことが ある（サイドバーの 畳みが 遅れて、
         その 隙に 測ると 遊びの 板が 59px に 見える）。
         「幅が 2 回 続けて 同じ」に なるまで 待つ。測る 対象は 変えない。 */
      await pg.waitForFunction(() => {
        const el = document.getElementById("appSurvivePage");
        const w2 = Math.round(el.getBoundingClientRect().width);
        const 前 = window.__vsW;
        window.__vsW = w2;
        return 前 === w2;
      }, null, { timeout: 6000, polling: 260 }).catch(() => {});
      await 待つ(300);
      const sz = await pg.evaluate(() => {
        const m = window.VocabuSurvive.__app.shell.get("match");
        const el = document.getElementById("appSurvivePage");
        const r = el.getBoundingClientRect();
        return { cw: m.canvas.width, ch: m.canvas.height, top: Math.round(r.top), h: Math.round(r.height), vh: window.innerHeight };
      });
      ok(w + "×" + h + " で 板が 立つ", sz.cw > 100 && sz.ch > 100, sz);
      ok(w + "×" + h + " で 画面から はみ出さない", sz.top + sz.h <= sz.vh + 8, sz);
    }
    await pg.setViewportSize({ width: 1280, height: 800 });

    節("⑦ 隠して 戻す");
    const 前進 = await pg.evaluate(() => window.VocabuSurvive.__app.shell.get("match").local.progress);
    await pg.evaluate(() => {
      Object.defineProperty(document, "hidden", { value: true, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await 待つ(900);
    await pg.evaluate(() => {
      Object.defineProperty(document, "hidden", { value: false, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await 待つ(600);
    const 生きてる = await pg.evaluate(() => {
      const m = window.VocabuSurvive.__app.shell.get("match");
      return { running: m.running, phase: m.sim.phase, cw: m.canvas.width, pr: m.local.progress };
    });
    ok("戻っても 試合が 続いている", 生きてる.running && 生きてる.phase === "running", 生きてる);
    ok("戻っても 板が 潰れていない", 生きてる.cw > 100, 生きてる.cw);
    ok("戻っても 進みが 消えていない", 生きてる.pr >= 前進 - 1, { 前: 前進, 後: 生きてる.pr });

    節("⑦-b スマホの 幅で 触れるか");
    /* ★ 以前は 1080px 以下で 左の 箱を まるごと 消して いた。
       消すと **色も かぶりものも 友だちも スマホから 触れなく なる**。 */
    for (const [w, h] of [[390, 844], [360, 640]]) {
      await pg.setViewportSize({ width: w, height: h });
      await pg.evaluate(() => { const app = window.VocabuSurvive.__app;
        const m = app.shell.get("match"); if (m && m.quiz && m.quiz.close) m.quiz.close();
        return app.goLobby(); });
      await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "lobby",
        null, { timeout: 20000, polling: 250 });
      await 待つ(700);
      const t = await pg.evaluate(() => {
        const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
        const rb = r.querySelector(".vs-root").getBoundingClientRect();
        const 触れる = (sel) => {
          const e = r.querySelector(sel); if (!e) return false;
          const b = e.getBoundingClientRect();
          return b.width > 8 && b.height > 8 && getComputedStyle(e).display !== "none";
        };
        let はみ = 0;
        for (const e of r.querySelectorAll(".vs-lobby *")) {
          const b = e.getBoundingClientRect();
          if (b.width > 0 && (b.right > rb.right + 2 || b.left < rb.left - 2)) はみ++;
        }
        return { 色: 触れる(".vs-lb-colors"), 帽: 触れる(".vs-lb-hatbox"),
          問: 触れる(".vs-lb-qz"), 記: 触れる(".vs-lb-rec-tabs"),
          遊: r.querySelectorAll(".vs-lb-mode").length, はみ };
      });
      ok(w + "×" + h + " 色を 選べる", t.色, t);
      ok(w + "×" + h + " かぶりものを 選べる", t.帽, t);
      ok(w + "×" + h + " 門の 問題を 選べる", t.問, t);
      ok(w + "×" + h + " 記録の 範囲を 選べる", t.記, t);
      ok(w + "×" + h + " 遊び方が 6 つ 出る", t.遊 === 6, t.遊);
      ok(w + "×" + h + " **横に はみ出さない**", t.はみ === 0, t);
    }
    await pg.setViewportSize({ width: 1280, height: 800 });
    await 待つ(500);

    節("⑧ 例外");
    const 無視 = /favicon|net::ERR_|Failed to load resource|firebase|config\.public|\/api\/|AudioContext|play\(\) failed/i;
    const 実害 = errs.filter((e) => !無視.test(e));
    ok("実害の ある 例外が 0 件", 実害.length === 0, 実害.slice(0, 6));
    console.log("     （参考）出た 全部: " + errs.length + " 件");
  } finally {
    await b.close(); srv.close();
  }
  console.log("\n────────────────────────────────");
  console.log("  ok " + pass + " / NG " + fail);
  if (bad.length) console.log("  落ちたもの:\n   - " + bad.join("\n   - "));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
