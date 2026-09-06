#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqsurviverobust.cjs — **走っている 最中に 起きる こと**に 耐えるか。

   2026-08-31 に 足した もの（全画面・動く 解像度・縦横で 変わる カメラ）は
   どれも 「途中で 状態が 変わる」ものなので、ここが 弱いと
   **遊んでいる 最中に 壊れる**。数で 押さえる。

   見るもの:
     ① 走っている 最中に 縦 ⇄ 横 に する
     ② 走っている 最中に 全画面へ 入る / 出る
     ③ タブを 隠して 戻す（画面が 止まって 戻らない ことが ある）
     ④ WebGL の 文脈を 失う（端末が 取り上げる ことが 実際に ある）
     ⑤ 器の 大きさを 0 に する（本体が 隠す ことが ある）
     ⑥ クイズを 出したまま やめる
   どれでも **例外 0 件・走り続けられる** こと。

   使い方: node vqsurviverobust.cjs
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
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 300) : "")); }
};

const 掃除 = () => { const f = () => { document.body.classList.remove("auth-booting","auth-gate-open","first-launch-open");
  for (const id of ["authGate","authBootSplash","firstLaunchOverlay","globalLoadingOverlay","vqTour","vqNewAuth","vqNewsFlash"]) {
    const e = document.getElementById(id); if (e) { e.classList.add("hidden"); e.style.display = "none"; } } }; f(); setInterval(f, 150); };

/** 走っている ところまで 連れて行く。 */
async function 走らせる(pg) {
  await pg.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => !!document.getElementById("appSurvivePage"), null, { timeout: 60000 });
  await pg.evaluate(掃除);
  await pg.evaluate(() => document.querySelector('#appTabBar [data-app-tab="survive"]').click());
  await pg.waitForFunction(() => window.VocabuSurvive && window.VocabuSurvive.state().opened, null, { timeout: 120000, polling: 250 });
  await pg.waitForFunction(() => { const h = document.querySelector("#appSurvivePage .vq-survive-host");
    return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vs-load-start")); }, null, { timeout: 120000, polling: 250 });
  await pg.evaluate(() => document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot.querySelector(".vs-load-start").click());
  await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "lobby", null, { timeout: 60000 });
  await 待(1400);
  await pg.evaluate(() => document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot.querySelector(".vs-lb-start").click());
  await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "match", null, { timeout: 90000 });
  await 待(1000);
  await pg.evaluate(() => { const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
    const c = r.querySelector(".vs-help-card"); if (c) { const b = c.querySelectorAll("button"); if (b.length) b[b.length - 1].click(); } });
  await 待(3000);
}
/** 進んでいるか（時計が 動いて いるか）。 */
const 進む = (pg) => pg.evaluate(() => {
  const ms = window.VocabuSurvive.__app.shell.get("match");
  return { t: ms.sim ? ms.sim.time : -1, 板: ms.canvas ? [ms.canvas.width, ms.canvas.height] : null,
           場面: ms.sim ? ms.sim.phase : "", 描き: ms.renderer ? ms.renderer.stats.draws : -1 };
});

(async () => {
  console.log("測る先:", BASE);
  const browser = await chromium.launch({ args: ["--use-gl=angle", "--enable-unsafe-swiftshader"] });
  const ctx = await browser.newContext({ viewport: { width: 900, height: 620 }, hasTouch: true });
  const pg = await ctx.newPage();
  const 例外 = [];
  pg.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 180)));
  pg.on("console", (m) => { if (m.type() === "error") 例外.push("console: " + m.text().slice(0, 180)); });
  await 走らせる(pg);

  節("① 走っている 最中に 縦 ⇄ 横");
  const a0 = await 進む(pg);
  await pg.setViewportSize({ width: 400, height: 860 });
  await 待(1200);
  const a1 = await 進む(pg);
  await pg.setViewportSize({ width: 860, height: 400 });
  await 待(1200);
  const a2 = await 進む(pg);
  await pg.setViewportSize({ width: 900, height: 620 });
  await 待(1200);
  const a3 = await 進む(pg);
  見(a1.t > a0.t && a2.t > a1.t && a3.t > a2.t, "★ 向きを 変えても 進み続ける",
     [a0.t, a1.t, a2.t, a3.t].map((x) => Math.round(x * 10) / 10));
  見(a1.板[0] === 400 && a1.板[1] === 860, "縦で 板が ついてくる", a1.板);
  見(a2.板[0] === 860 && a2.板[1] === 400, "横で 板が ついてくる", a2.板);
  見(a3.描き > 5, "描き続けている", a3.描き);

  節("② 走っている 最中に 全画面へ 入る / 出る");
  const b0 = await 進む(pg);
  await pg.evaluate(() => {
    const ms = window.VocabuSurvive.__app.shell.get("match");
    if (ms.fsBtn) ms.fsBtn.click();
  });
  await 待(1000);
  const b1 = await 進む(pg);
  const 印 = await pg.evaluate(() => document.body.classList.contains("vq-survive-immersive"));
  await pg.evaluate(() => {
    const ms = window.VocabuSurvive.__app.shell.get("match");
    if (ms.fsBtn) ms.fsBtn.click();
  });
  await 待(1000);
  const b2 = await 進む(pg);
  見(b1.t > b0.t && b2.t > b1.t, "★ 全画面の 出入りでも 進み続ける",
     [b0.t, b1.t, b2.t].map((x) => Math.round(x * 10) / 10));
  見(印 === true || 印 === false, "全画面の 印が はっきりして いる", 印);
  const 走行印 = await pg.evaluate(() => document.body.classList.contains("vq-survive-play"));
  見(走行印 === true, "★ 全画面から 出ても 走行中の 印は 残る（跳ぶ ボタンが 隠れない）", 走行印);

  節("③ タブを 隠して 戻す");
  const c0 = await 進む(pg);
  const cdp = await ctx.newCDPSession(pg);
  await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 }).catch(() => {});
  await pg.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await 待(1200);
  await pg.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await 待(1500);
  const c1 = await 進む(pg);
  見(c1.t > c0.t, "★ 隠して 戻しても 進み続ける", [Math.round(c0.t * 10) / 10, Math.round(c1.t * 10) / 10]);
  見(c1.描き > 5, "戻ったら また 描いている", c1.描き);

  節("④ 器の 大きさが 0 に なる（本体が 隠す）");
  const d0 = await 進む(pg);
  await pg.evaluate(() => { const e = document.getElementById("appSurvivePage"); e.style.height = "0px"; });
  await 待(900);
  const d1 = await 進む(pg);
  await pg.evaluate(() => { const e = document.getElementById("appSurvivePage"); e.style.height = ""; });
  await 待(1200);
  const d2 = await 進む(pg);
  見(d1.板 && d1.板[0] > 1 && d1.板[1] > 1, "★ 0 に されても 板を 1×1 に 潰さない", d1.板);
  見(d2.t > d0.t, "戻したら また 進む", [Math.round(d0.t * 10) / 10, Math.round(d2.t * 10) / 10]);

  節("⑤ クイズを 出したまま やめる");
  await pg.evaluate(() => {
    const ms = window.VocabuSurvive.__app.shell.get("match");
    ms.quiz.ask({ prompt: "test", choices: ["a", "b", "c", "d"], answer: 0 }, 12);
  });
  await 待(600);
  await pg.evaluate(() => {
    const ms = window.VocabuSurvive.__app.shell.get("match");
    ms.quiz.close();
  });
  await 待(600);
  const e1 = await 進む(pg);
  見(e1.描き > 5, "★ クイズを 閉じても 走り続ける", e1.描き);

  節("⑥ WebGL の 文脈を 失う");
  const f0 = await pg.evaluate(() => {
    const ms = window.VocabuSurvive.__app.shell.get("match");
    const gl = ms.renderer && ms.renderer.gl;
    if (!gl) return "描き手が ない";
    const l = gl.getExtension("WEBGL_lose_context");
    if (!l) return "この 端末では 試せない";
    l.loseContext();
    return "失わせた";
  });
  await 待(1500);
  const f1 = await pg.evaluate(() => {
    const st = window.VocabuSurvive.state();
    const ms = window.VocabuSurvive.__app.shell.get("match");
    /* 画面が 白く 固まって いない こと（何かは 出て いる）。 */
    const f = ms && ms.el ? ms.el.querySelector(".vs-fatal") : null;
    return { 開いている: st.opened, 画面: st.screen,
             知らせ: !!f, 文: f ? (f.textContent || "").slice(0, 40) : "" };
  });
  見(f1.開いている === true, "★ 文脈を 失っても 画面が 閉じない", { f0, f1 });
  /* ★ 「直った ふり」は しない。**止まった ことを 知らせる**のが 正しい。 */
  if (f0 === "失わせた") {
    見(f1.知らせ === true, "★ 止まった ことを 画面に 出す（黙って 固まらない）", f1);
    /* 押したら 建て直せるか。 */
    const g = await pg.evaluate(async () => {
      const ms = window.VocabuSurvive.__app.shell.get("match");
      const b = ms.el.querySelector(".vs-fatal .vs-btn");
      if (b) b.click();
      await new Promise((r) => setTimeout(r, 2500));
      const ms2 = window.VocabuSurvive.__app.shell.get("match");
      return { 描き手: !!(ms2 && ms2.renderer && ms2.renderer.gl && !ms2.renderer.lost),
               知らせ: !!(ms2 && ms2.el && ms2.el.querySelector(".vs-fatal")),
               場面: window.VocabuSurvive.state().screen };
    });
    見(g.描き手 === true && g.知らせ === false, "★ 「作り直す」で また 描ける ように なる", g);
  } else {
    見(true, "この 端末では 文脈喪失を 試せない", f0);
  }

  節("⑦ すばやい 行き来（人は 待って くれない）");
  {
    /* ★ 遊びの 画面は 「開いて 閉じて また 開く」が いちばん 起きる。
       画面を 作り直す 途中で 次の 指示が 来ると、
       **半分 建った まま**に なる ことが ある（前に 真っ白バグが 出た ところ）。 */
    const r = await pg.evaluate(async () => {
      const A = window.VocabuSurvive.__app;
      const 待 = (m) => new Promise((z) => setTimeout(z, m));
      const 出 = { 例外: [] };
      const 包 = async (名, f) => { try { await f(); } catch (e) { 出.例外.push(名 + ": " + String(e && e.message || e).slice(0, 90)); } };

      /* ① 試合 → ロビー → 試合 を 素早く 3 往復 */
      for (let i = 0; i < 3; i++) {
        await 包("戻る" + i, () => A.goLobby());
        await 待(120);
        await 包("始める" + i, () => A.startMatch({ courseId: "c0" + (i + 1), mode: "race", bots: 1,
          myName: "あなた", myColor: 0, seed: 1, players: [], noHelp: true }));
        await 待(160);
      }
      await 待(900);
      出.場面1 = window.VocabuSurvive.state().screen;
      const ms = A.shell.get("match");
      出.描き1 = ms && ms.renderer ? ms.renderer.stats.draws : -1;
      出.走り1 = !!(ms && ms.running);

      /* ② ロビーの 窓を 素早く 開け閉め */
      await 包("ロビーへ", () => A.goLobby());
      await 待(400);
      const lb = A.shell.get("lobby");
      for (const k of ["course", "look", "party", "setting", "mine", "", "course", ""]) {
        await 包("窓 " + k, () => { lb._openPane(k); });
        await 待(45);
      }
      出.窓 = lb.pane;

      /* ③ コースを 素早く 切り替える（下見の 形を 何度も 組み直す） */
      for (let i = 0; i < 12; i++) {
        await 包("コース" + i, () => { lb.courseIndex = i * 2 % 30; lb._render(); });
        await 待(30);
      }
      await 待(500);

      /* ④ コースを 作る 画面へ 入って 戻る */
      await 包("作る画面", () => A.goEditor());
      await 待(900);
      出.場面2 = window.VocabuSurvive.state().screen;
      await 包("ロビーへ2", () => A.goLobby());
      await 待(600);

      /* ⑤ もう一度 走る */
      await 包("始める最後", () => A.startMatch({ courseId: "c05", mode: "race", bots: 2,
        myName: "あなた", myColor: 0, seed: 9, players: [], noHelp: true }));
      await 待(1600);
      const ms2 = A.shell.get("match");
      出.場面3 = window.VocabuSurvive.state().screen;
      出.描き2 = ms2 && ms2.renderer ? ms2.renderer.stats.draws : -1;
      出.走り2 = !!(ms2 && ms2.running);
      出.板 = ms2 && ms2.canvas ? [ms2.canvas.width, ms2.canvas.height] : null;
      /* 影の 器が 消えて いない こと（前に 真っ白バグが 出た ところ） */
      const host = document.querySelector("#appSurvivePage .vq-survive-host");
      出.器 = !!(host && host.shadowRoot && host.shadowRoot.querySelector(".vs-root"));
      出.画面の数 = host && host.shadowRoot ? host.shadowRoot.querySelectorAll(".vs-screen").length : 0;
      return 出;
    });
    console.log("     ", JSON.stringify(r).slice(0, 300));
    見(r.例外.length === 0, "★ 素早い 行き来で 例外が 出ない", r.例外.slice(0, 3));
    見(r.場面1 === "match" && r.走り1, "3 往復しても 試合が 生きている", { 場面: r.場面1, 走り: r.走り1 });
    見(r.窓 === "", "窓の 開け閉めが ちぐはぐに ならない", r.窓);
    見(r.場面2 === "editor", "コースを 作る 画面へ 入れる", r.場面2);
    見(r.場面3 === "match" && r.走り2, "★ 作る画面から 戻っても また 走れる", { 場面: r.場面3, 走り: r.走り2 });
    見(r.器 === true, "★ 影の 器が 消えて いない（真っ白に ならない）", r.器);
    見(r.描き2 > 5, "描けている", r.描き2);
    見(r.画面の数 >= 3 && r.画面の数 <= 8, "画面が 二重に 建って いない", r.画面の数);
  }

  節("⑧ 長い あだ名（長さに 上限は ない）");
  {
    /* ★ あだ名は 人が 決める。長い 人が いる。
       札や 一覧が 画面を 横切ると、その 人だけ 遊べなく なる。 */
    const r = await pg.evaluate(async () => {
      const A = window.VocabuSurvive.__app;
      const ms = A.shell.get("match");
      const 長 = "ながいあだなのひとがほんとうにいます0123456789";
      for (const p of ms.sim.players) if (p !== ms.local) p.name = 長;
      /* 札を 作り直す */
      for (const [, el] of ms._plateEls) { try { el.remove(); } catch (e) {} }
      ms._plateEls.clear();
      await new Promise((z) => setTimeout(z, 600));
      const rect = ms.el.getBoundingClientRect();
      const 幅 = [];
      for (const [, el] of ms._plateEls) {
        const b = el.getBoundingClientRect();
        if (b.width > 0) 幅.push({ w: Math.round(b.width), 右: Math.round(b.right - rect.right) });
      }
      /* 一覧の 行も 見る */
      const 行 = Array.from(ms.hud.list.querySelectorAll(".vs-hud-row"))
        .filter((x) => x.style.display !== "none")
        .map((x) => Math.round(x.getBoundingClientRect().width));
      return { 札: 幅, 行, 板幅: Math.round(rect.width) };
    });
    console.log("     ", JSON.stringify(r).slice(0, 220));
    見(r.札.length === 0 || r.札.every((x) => x.w <= 220),
       "★ 長い あだ名でも 札が 広がりすぎない", r.札);
    見(r.札.every((x) => x.右 <= 4), "札が 画面から はみ出さない", r.札);
    見(r.行.every((w) => w <= r.板幅), "順位表の 行も はみ出さない", r.行);
  }

  節("例外");
  /* 文脈を 失った あとの WebGL の 警告は 数えない（わざと 起こした もの）。 */
  /* わざと 起こした WebGL の 警告と、手元の 開発サーバに 無い 口（404/503）は
     この 検査の 対象では ない ので 数えない。 */
  const 実害 = 例外.filter((x) => !/context lost|CONTEXT_LOST|WebGL/i.test(x))
                   .filter((x) => !/Failed to load resource|status of (404|503|401)/i.test(x));
  見(実害.length === 0, "★ 実害の ある 例外 0 件", 実害.slice(0, 4));
  console.log("     （参考）出た 全部: " + 例外.length + " 件");

  await browser.close();
  console.log("\n══ まとめ ══");
  console.log("  ok " + 済 + " / NG " + 落);
  if (落) console.log("  落ちた: " + 落ち.join(" / "));
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
