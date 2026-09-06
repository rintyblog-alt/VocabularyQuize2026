#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqsurvivemode.cjs — **遊び方の 違いが 画面に 出ているか**。

   ★ 直す前（2026-08-31）は、6 つの 遊び方の どれを 選んでも
     **走っている 画面が まったく 同じ**だった。実写で 気づいた:
       ・サバイバル … 残機 3 が あるのに どこにも 出ない。
                      あと 何回 落ちられるか 分からないまま 脱落する。
       ・クイズラッシュ … 100 秒で 打ち切る のに 時計が **増えていく**。
                          勝ち負けは 通った 門の 数 なのに、順位表は 進んだ 割合。
       ・勝ち抜き … 3 本 走る のに **何戦目か 出ない**。
     見えない 決まりは 決まりでは ない。

   見るもの:
     ① レース … 札も 計器も 出さない（要らない ものは 置かない）
     ② サバイバル … 札・残機（♥ の 数）・残り 人数
     ③ サバイバル … 落ちると 残機が 減る／0 で 脱落・一覧が 薄くなる
     ④ クイズラッシュ … 時計が **減る**・残り 10 秒で 印・順位表は 門の 数
     ⑤ 勝ち抜き … 「勝ち抜き 1/3」
     ⑥ タイムアタック … 札だけ（計器なし）
     ⑦ チーム戦 … 札 と 組の 点

   使い方: node vqsurvivemode.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || process.env.VQ_API || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では 実行しません。"); process.exit(2); }
const { chromium } = require("playwright");
const 待 = (m) => new Promise((s) => setTimeout(s, m));
let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 200) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 320) : "")); }
};

/* その 遊び方で 試合を 始め、HUD の ようすを 返す。 */
async function 走らせる(pg, mode, 秒) {
  await pg.evaluate((m) => {
    const A = window.VocabuSurvive.__app;
    const lb = A.shell.get("lobby");
    lb.courseIndex = 0; lb.mode = m; lb.botCount = 3; lb._save(); lb._render();
    document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot
      .querySelector(".vs-lb-start").click();
  }, mode);
  await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "match", null, { timeout: 60000 });
  await 待(秒 === undefined ? 4200 : 秒);
  return await pg.evaluate(() => {
    const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
    const 見え = (el) => !!(el && !el.classList.contains("vs-hide") && el.getBoundingClientRect().width > 0);
    const meter = r.querySelector(".vs-hud-meter");
    const mode = r.querySelector(".vs-hud-mode");
    const time = r.querySelector(".vs-hud-time");
    const 一覧 = Array.from(r.querySelectorAll(".vs-hud-row"))
      .filter((li) => li.style.display !== "none")
      .map((li) => ({ 値: li.querySelector(".vs-hud-pc").textContent,
                      out: li.getAttribute("data-out") }));
    return {
      札: 見え(mode) ? mode.textContent.trim() : "",
      計器: 見え(meter),
      計器文: meter ? meter.querySelector(".vs-hud-mt").textContent.trim() : "",
      残: meter ? meter.querySelectorAll(".vs-hud-heart").length : 0,
      残生: meter ? meter.querySelectorAll('.vs-hud-heart[data-off="0"]').length : 0,
      時: time ? time.textContent.trim() : "",
      急: time ? time.getAttribute("data-hurry") : "",
      一覧,
      組: 見え(r.querySelector(".vs-hud-team"))
    };
  });
}

async function ロビーへ(pg) {
  await pg.evaluate(() => {
    window.VocabuSurvive.__app.goLobby();
  });
  await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "lobby", null, { timeout: 30000 });
  await 待(500);
}

(async () => {
  console.log("測る先:", BASE);
  const browser = await chromium.launch({ args: ["--use-gl=angle", "--enable-unsafe-swiftshader"] });
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  const pg = await ctx.newPage();
  const 例外 = [];
  pg.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 160)));
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
  await 待(1200);

  /* ── ① レース ─────────────────────────────────────────────── */
  節("⓪ 合図の あいだも 順位表が 読める");
  /* ★ 直す前は 3・2・1 の あいだ **「0 あなた 0%」が 4 行** 並んで いた
     （順位を 走り出してから しか 付けて いなかった。実写で 確認）。 */
  await pg.evaluate(() => {
    const lb = window.VocabuSurvive.__app.shell.get("lobby");
    lb.courseIndex = 0; lb.mode = "race"; lb.botCount = 3; lb._save(); lb._render();
    document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot.querySelector(".vs-lb-start").click();
  });
  await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "match", null, { timeout: 60000 });
  await 待(700);
  const 合図 = await pg.evaluate(() => {
    const ms = window.VocabuSurvive.__app.shell.get("match");
    const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
    return {
      相: ms.sim.phase,
      番: Array.from(r.querySelectorAll(".vs-hud-row")).filter((li) => li.style.display !== "none")
        .map((li) => li.querySelector(".vs-hud-no").textContent)
    };
  });
  見(合図.相 === "countdown", "まだ 合図の 途中", 合図.相);
  見(合図.番.length === 4 && 合図.番.join(",") === "1,2,3,4",
     "★ 合図の あいだも 1,2,3,4 と 並ぶ（0 が 並ばない）", 合図.番);
  await ロビーへ(pg);

  節("① レース（ふつう）");
  let s = await 走らせる(pg, "race");
  見(s.札 === "", "札を 出さない（ふつうの ときに 要らない）", s.札);
  見(!s.計器, "計器を 出さない");
  見(/^0:0/.test(s.時), "時計は 0 から 増える", s.時);
  見(s.一覧.length === 4, "一覧が 4 行", s.一覧.length);
  見(s.一覧.every((r) => /%$|GOAL/.test(r.値)), "右の 値は 進んだ 割合", s.一覧.map((r) => r.値));
  await ロビーへ(pg);

  /* ── ② サバイバル ─────────────────────────────────────────── */
  節("② サバイバル");
  s = await 走らせる(pg, "survival");
  見(s.札 === "サバイバル", "★ 札に 「サバイバル」", s.札);
  見(s.計器, "計器が 出る");
  見(s.残 === 3, "★ 残機の 印が 3 つ", s.残);
  見(s.残生 === 3, "はじめは 3 つとも 生きている", s.残生);
  見(/残り\s*4\s*人/.test(s.計器文), "★ 残り 人数が 出る", s.計器文);

  節("③ 落ちると 減る");
  const 減 = await pg.evaluate(async () => {
    const ms = window.VocabuSurvive.__app.shell.get("match");
    const p = ms.local;
    const 取 = () => { const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const m = r.querySelector(".vs-hud-meter");
      return { 生: m.querySelectorAll('.vs-hud-heart[data-off="0"]').length, 文: m.querySelector(".vs-hud-mt").textContent }; };
    const 落とす = () => new Promise((done) => {
      p.y = -80; p.vy = -20;
      let n = 0;
      const t = setInterval(() => { if (++n > 90 || p.y > -5) { clearInterval(t); done(); } }, 16);
    });
    const 前 = 取();
    await 落とす(); await new Promise((r) => setTimeout(r, 260));
    const 中 = 取();
    await 落とす(); await new Promise((r) => setTimeout(r, 260));
    await 落とす(); await new Promise((r) => setTimeout(r, 500));
    const 後 = 取();
    const r2 = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
    return { 前, 中, 後, 命: p.lives | 0, 脱: !!p.eliminated,
      薄: Array.from(r2.querySelectorAll('.vs-hud-row')).filter((li) => li.getAttribute("data-out") === "1").length,
      観: !r2.querySelector(".vs-spec").classList.contains("vs-hide") };
  });
  見(減.中.生 === 2, "★ 1 回 落ちると 残機が 1 つ 減る", 減.中);
  見(減.命 === 0 && 減.脱, "★ 3 回で 脱落", { 命: 減.命, 脱: 減.脱 });
  見(減.薄 >= 1, "★ 脱落した 人は 一覧で 薄くなる", 減.薄);
  見(減.観, "脱落したら 観戦の 帯が 出る");
  await ロビーへ(pg);

  /* ── ④ クイズラッシュ ─────────────────────────────────────── */
  節("④ クイズラッシュ");
  s = await 走らせる(pg, "quizrush");
  見(s.札 === "クイズラッシュ", "★ 札に 「クイズラッシュ」", s.札);
  見(s.計器 && /門\s*\d/.test(s.計器文), "★ 通った 門の 数が 出る", s.計器文);
  const 秒 = (t) => { const m = /(\d+):(\d+(?:\.\d+)?)/.exec(t); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; };
  const t1 = 秒(s.時);
  見(t1 > 90 && t1 < 100, "★ 時計が 100 秒から **減って いる**", s.時);
  await 待(1500);
  const s2 = await pg.evaluate(() => document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot.querySelector(".vs-hud-time").textContent);
  見(秒(s2) < t1, "時間が たつと さらに 減る", { 前: s.時, 後: s2 });
  見(s.一覧.every((r) => /門/.test(r.値)), "★ 順位表も 門の 数（勝ち負けと 揃える）", s.一覧.map((r) => r.値));
  const 急 = await pg.evaluate(() => {
    const ms = window.VocabuSurvive.__app.shell.get("match");
    ms.sim.raceTime = ms.sim.timeLimit - 6;
    return new Promise((done) => setTimeout(() => {
      const t = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot.querySelector(".vs-hud-time");
      done({ 印: t.getAttribute("data-hurry"), 文: t.textContent });
    }, 400));
  });
  見(急.印 === "1", "★ 残り 10 秒を 切ると 印が つく", 急);
  await ロビーへ(pg);

  /* ── ⑤ 勝ち抜き ───────────────────────────────────────────── */
  節("⑤ 勝ち抜き");
  s = await 走らせる(pg, "cup");
  見(/^勝ち抜き\s*1\/3$/.test(s.札), "★ 「勝ち抜き 1/3」が 出る", s.札);
  見(!s.計器, "計器は 出さない");
  await ロビーへ(pg);

  /* ── ⑥ タイムアタック ─────────────────────────────────────── */
  節("⑥ タイムアタック");
  s = await 走らせる(pg, "timeattack");
  見(s.札 === "タイムアタック", "札に 「タイムアタック」", s.札);
  見(!s.計器, "計器は 出さない");
  見(s.一覧.length === 1, "1 人だけ", s.一覧.length);
  await ロビーへ(pg);

  /* ── ⑦ チーム戦 ───────────────────────────────────────────── */
  節("⑦ チーム戦");
  s = await 走らせる(pg, "team");
  見(s.札 === "チーム戦", "札に 「チーム戦」", s.札);
  見(s.組, "★ 組の 点が 出る");
  見(!s.計器, "計器は 出さない（組の 点が その 役）");

  節("⑧ 指で 遊ぶ 縦の 画面で 重ならない");
  /* ★ 直す前は 計器を 時計と 順位の あいだ（1 行目の 真ん中）に 置いて いた。
     指の ときは **やめる／全画面の ボタンが そこへ 逃げてくる**ので、
     残機が ボタンの 下に 隠れた（390px の 実写で 見つけた）。 */
  const 縦 = await ctx.browser().newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p3 = await 縦.newPage();
  const 例外3 = []; p3.on("pageerror", (e) => 例外3.push(String(e.message).slice(0, 160)));
  await p3.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await p3.waitForFunction(() => !!document.getElementById("appSurvivePage"), null, { timeout: 60000 });
  await p3.evaluate(() => { const f = () => { document.body.classList.remove("auth-booting","auth-gate-open","first-launch-open");
    for (const id of ["authGate","authBootSplash","firstLaunchOverlay","globalLoadingOverlay","vqTour","vqNewAuth","vqNewsFlash"]) {
      const e = document.getElementById(id); if (e) { e.classList.add("hidden"); e.style.display = "none"; } } }; f(); setInterval(f, 150); });
  await p3.evaluate(() => { try { localStorage.setItem("vq.survive.helpseen.v1", "1"); } catch (e) {} });
  await p3.evaluate(() => document.querySelector('#appTabBar [data-app-tab="survive"]').click());
  await p3.waitForFunction(() => window.VocabuSurvive && window.VocabuSurvive.state().opened, null, { timeout: 120000, polling: 250 });
  await p3.waitForFunction(() => { const h = document.querySelector("#appSurvivePage .vq-survive-host");
    return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vs-load-start")); }, null, { timeout: 120000, polling: 250 });
  await p3.evaluate(() => document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot.querySelector(".vs-load-start").click());
  await p3.waitForFunction(() => window.VocabuSurvive.state().screen === "lobby", null, { timeout: 40000 });
  await 待(1000);
  await p3.evaluate(() => {
    const lb = window.VocabuSurvive.__app.shell.get("lobby");
    lb.courseIndex = 0; lb.mode = "survival"; lb.botCount = 5; lb._save(); lb._render();
    document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot.querySelector(".vs-lb-start").click();
  });
  await p3.waitForFunction(() => window.VocabuSurvive.state().screen === "match", null, { timeout: 60000 });
  await 待(4000);
  const 位置 = await p3.evaluate(() => {
    const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
    const box = (sel) => { const e = r.querySelector(sel); if (!e) return null;
      const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b2: b.bottom }; };
    return { 計: box(".vs-hud-meter"), 具: box(".vs-sys"), 時: box(".vs-hud-timebox"),
             順: box(".vs-hud-rank"), 帯: box(".vs-hud-meta"), 幅: window.innerWidth };
  });
  const 重 = (a, b) => !!(a && b) && !(a.r <= b.x || b.r <= a.x || a.b2 <= b.y || b.b2 <= a.y);
  見(!!位置.計 && 位置.計.w > 40, "計器が 縦でも 出る", 位置.計);
  見(!重(位置.計, 位置.具), "★ やめる／全画面の ボタンと 重ならない", { 計: 位置.計, 具: 位置.具 });
  見(!重(位置.計, 位置.時) && !重(位置.計, 位置.順), "時計・順位とも 重ならない");
  見(!重(位置.計, 位置.帯), "コース名の 帯とも 重ならない", { 計: 位置.計, 帯: 位置.帯 });
  見(位置.計 && 位置.計.r <= 位置.幅, "画面の 外へ はみ出さない", { 右: 位置.計 && 位置.計.r, 幅: 位置.幅 });
  await 縦.close();

  節("⑨ 例外");
  const 実 = 例外.concat(例外3 || []).filter((m) => !/ResizeObserver|Non-Error|Load failed|NetworkError|Failed to fetch/i.test(m));
  見(実.length === 0, "実害の ある 例外が 0 件", 実.slice(0, 3));

  console.log("\n────────────────────────────────");
  console.log("  ok " + 済 + " / NG " + 落);
  if (落) console.log("  落ちた: " + 落ち.join(" / "));
  await browser.close();
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
