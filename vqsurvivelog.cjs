#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqsurvivelog.cjs — 2026-09-01 の 訴え 3 件

   ① 「ログを PC なら 左下に 表示して ほしい。落ちたとか、ゴールしたとか、
       チェックポイント 追加したとか なら ね」
      直す前: 出来事は toast（2.2 秒で 消える 帯）だけ。目を 離した 隙に
              誰が 落ちたのか・誰が ゴールしたのかが **どこにも 残らない**。

   ② 「オンラインで、他の人が ゴールしても、残ってる人を 自由に 観戦できる
       ように して ほしい」
      直す前: 自分が ゴールした 瞬間に _finish() → 結果の 板。
              まだ 走って いる 人が いても **見る 手立てが 無かった**
              （脱落した ときだけ 観戦に 入れた）。

   ③ 「2 回目以降から ロビーに 戻ると 背景が 黒く なって 機能しなく なって
       しまう やばい バグが ある」
      真因: ロビーの exit() は stage.destroy() → renderer.destroy() を 呼び、
            その 中で WEBGL_lose_context.loseContext() を 呼んで いる。
            **失った 文脈は その 板（canvas）に 貼り付く。**
            同じ 板へ もう一度 getContext("webgl2") を 頼んでも
            新しい 文脈は 作られず、**同じ 死んだ 文脈**が 返る。
            だから 2 回目の init() は 出来上がった ふりを して 真っ黒。
            失敗しないので 断りも 出ない＝いちばん 分かりにくい 落ちかた。
            試合の 側は もう 知って いた（match._rebuild）。ロビーにも 同じ 手当て。

   使い方: node vqsurvivelog.cjs
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
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 360) : "")); }
};
const SR = `document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot`;

async function 起こす(pg) {
  await pg.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => !!document.getElementById("appSurvivePage"), null, { timeout: 60000 });
  await pg.evaluate(() => { const f = () => { document.body.classList.remove("auth-booting", "auth-gate-open", "first-launch-open");
    for (const id of ["authGate", "authBootSplash", "firstLaunchOverlay", "globalLoadingOverlay", "vqTour", "vqNewAuth", "vqNewsFlash"]) {
      const e = document.getElementById(id); if (e) { e.classList.add("hidden"); e.style.display = "none"; } } }; f(); setInterval(f, 150); });
  await pg.evaluate(() => { try { localStorage.setItem("vq.survive.helpseen.v1", "1"); } catch (e) {} });
  await pg.evaluate(() => document.querySelector('#appTabBar [data-app-tab="survive"]').click());
  await pg.waitForFunction(() => window.VocabuSurvive && window.VocabuSurvive.state().opened, null, { timeout: 120000, polling: 250 });
  await pg.waitForFunction(() => { const h = document.querySelector("#appSurvivePage .vq-survive-host");
    return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vs-load-start")); }, null, { timeout: 120000, polling: 250 });
  await pg.evaluate(() => document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot.querySelector(".vs-load-start").click());
  await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "lobby", null, { timeout: 40000 });
  await 待(1200);
}
async function 試合へ(pg, mode) {
  await pg.evaluate((m) => {
    const lb = window.VocabuSurvive.__app.shell.get("lobby");
    lb.courseIndex = 0; lb.mode = m || "race"; lb.botCount = 3; lb._save(); lb._render();
    document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot.querySelector(".vs-lb-start").click();
  }, mode);
  await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "match", null, { timeout: 60000 });
  await 待(2500);
}
async function ロビーへ(pg) {
  await pg.evaluate(() => window.VocabuSurvive.__app.goLobby());
  await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "lobby", null, { timeout: 30000 });
  await 待(900);
}
/** ロビーの 立体の ようす。**死んだ 文脈を 掴んで いないか**を 見る。 */
const ロビーの立体 = (pg) => pg.evaluate(() => {
  const lb = window.VocabuSurvive.__app.shell.get("lobby");
  const R = lb.stage && lb.stage.renderer;
  const gl = R && R.gl;
  return {
    立体あり: !!lb.stage, 描き手あり: !!R, 文脈あり: !!gl,
    失っている: !!(gl && gl.isContextLost && gl.isContextLost()),
    板の印: lb.stageEl ? (lb.stageEl.__印 || (lb.stageEl.__印 = Math.random().toString(36).slice(2, 8))) : "",
    つないである: !!(lb.stageEl && lb.stageEl.isConnected),
    だめ印: !!lb._stageFailed
  };
});

(async () => {
  console.log("測る先:", BASE);
  const browser = await chromium.launch({ args: ["--use-gl=angle", "--enable-unsafe-swiftshader"] });
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 760 } });
  const pg = await ctx.newPage();
  const 例外 = [];
  pg.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 160)));
  await 起こす(pg);

  /* ══ ③ ロビーが 黒く ならない ══════════════════════════════════ */
  節("③ 2 回目以降も ロビーの 背景が 生きて いる");
  const a1 = await ロビーの立体(pg);
  見(a1.立体あり && a1.文脈あり && !a1.失っている, "1 回目: 立体が 生きて いる", a1);

  await 試合へ(pg);
  await ロビーへ(pg);
  const a2 = await ロビーの立体(pg);
  見(a2.立体あり && a2.文脈あり, "2 回目: 立体が ある", a2);
  /* ★ 「失って いない」だけを 見ては いけない。立体が **建たなかった**
     ときも gl が 無いので false に なり、素通りする（実際 素通りした）。
     **建って いて、かつ 生きて いる**ことを 見る。 */
  見(a2.立体あり && a2.文脈あり && !a2.失っている,
    "★★ **2 回目も 立体が 建ち、文脈が 生きて いる**（直す前は ここで 真っ黒）", a2);
  見(a2.板の印 !== a1.板の印, "★ 板ごと 取り替えて いる（同じ 板は 使えない）", { 前: a1.板の印, 後: a2.板の印 });
  見(a2.つないである, "新しい 板が 画面に 入って いる", a2.つないである);

  await 試合へ(pg);
  await ロビーへ(pg);
  const a3 = await ロビーの立体(pg);
  見(a3.立体あり && a3.文脈あり && !a3.失っている, "★ 3 回目も 生きて いる（「2 回目以降」なので 続けて 確かめる）", a3);
  見(a3.板の印 !== a2.板の印, "3 回目も 板を 取り替えて いる", { 前: a2.板の印, 後: a3.板の印 });
  見(!a3.だめ印, "「立体は 出せない」の 印が 立って いない", a3.だめ印);

  /* ══ ① できごとの 記録（左下・PC）══════════════════════════════ */
  節("① できごとの 記録が 左下に 積まれる");
  await 試合へ(pg);
  const 記 = await pg.evaluate(() => {
    const A = window.VocabuSurvive.__app;
    const m = A.shell.get("match");
    const 他 = m.sim.players.filter((p) => p !== m.local)[0];
    m.hud.logClear();
    m._onEvents([
      { t: "checkpoint", p: m.local, index: 1 },
      { t: "respawn", p: m.local, lives: 2 },
      { t: "checkpoint", p: 他, index: 2 },
      { t: "respawn", p: 他 },
      { t: "finish", p: 他, rank: 1 }
    ]);
    const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
    const box = r.querySelector(".vs-hud-log");
    const cs = box ? getComputedStyle(box) : null;
    const rc = box ? box.getBoundingClientRect() : null;
    const w = r.host.getBoundingClientRect();
    return {
      ある: !!box,
      行: Array.prototype.map.call(box ? box.children : [],
        (li) => ({ 印: li.getAttribute("data-kind"),
                   文: li.querySelector(".vs-log-x").textContent,
                   時: li.querySelector(".vs-log-t").textContent })),
      見える: !!(cs && cs.display !== "none" && rc.width > 0),
      左: rc ? Math.round(rc.left - w.left) : -1,
      下: rc ? Math.round(w.bottom - rc.bottom) : -1
    };
  });
  見(記.ある, "記録の 器が ある");
  見(記.見える, "PC（1100px）では 見える", { 左: 記.左, 下: 記.下 });
  見(記.左 >= 0 && 記.左 < 200, "★ **左**に ある", 記.左);
  見(記.下 >= 0 && 記.下 < 200, "★ **下**に ある", 記.下);
  const 文一覧 = 記.行.map((x) => x.文);
  見(文一覧.some((t) => /中間地点 1 を 通った/.test(t)), "★ 自分の 中間地点が 残る", 文一覧);
  見(文一覧.some((t) => /^落ちた/.test(t)), "★ **落ちた**が 残る", 文一覧);
  見(文一覧.some((t) => /が 中間地点 2/.test(t)), "★ ほかの 人の 中間地点も 残る", 文一覧);
  見(文一覧.some((t) => /が 落ちた/.test(t)), "★ ほかの 人が 落ちたのも 残る", 文一覧);
  見(文一覧.some((t) => /が ゴール（1位）/.test(t)), "★ **ゴール**が 残る", 文一覧);
  見(記.行.some((x) => x.印 === "me"), "自分の ことは 印が 違う", 記.行.map((x) => x.印));
  見(記.行.every((x) => /^\d+:\d\d/.test(x.時)), "時刻が 付く", 記.行.map((x) => x.時));
  const 溢 = await pg.evaluate(() => {
    const m = window.VocabuSurvive.__app.shell.get("match");
    for (let i = 0; i < 20; i++) m.hud.log("ためし " + i, "");
    return document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot
      .querySelectorAll(".vs-hud-log li").length;
  });
  見(溢 === 8, "★ 溜まりすぎない（直近 8 件まで。画面を 覆わない）", 溢);

  /* 狭い 画面／指の 端末では 出さない（走る 棒の 場所） */
  await pg.setViewportSize({ width: 640, height: 900 });
  await 待(300);
  const 狭 = await pg.evaluate(() => {
    const box = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot.querySelector(".vs-hud-log");
    return box ? getComputedStyle(box).display : "(無し)";
  });
  見(狭 === "none", "★ 狭い 画面では 出さない（左下は 走る 棒の 場所）", 狭);
  await pg.setViewportSize({ width: 1100, height: 760 });
  await 待(300);

  /* ══ ② ゴールしても 残って いる 人を 観戦できる ═══════════════ */
  節("② ゴールした あと、残って いる 人を 自由に 観戦できる");
  const 観 = await pg.evaluate(async () => {
    const m = window.VocabuSurvive.__app.shell.get("match");
    /* オンラインの ふり（この 手当ては オンラインの ときだけ 効く）。 */
    m.net = { sendFinish() {}, close() {} };
    m.settings = Object.assign({}, m.settings, { calm: true });   /* 回り込みを 飛ばす */
    m._done = false;
    m.local.finished = true; m.local.rank = 1;
    m._onEvents([{ t: "finish", p: m.local, rank: 1 }]);
    await new Promise((s) => setTimeout(s, 400));
    const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
    const band = r.querySelector(".vs-spec");
    const 残り = m._spectateAlive().map((p) => p.name);
    return {
      画面: window.VocabuSurvive.state().screen,
      観戦中: !!m.spectate,
      見ている: m.spectate ? (m.sim.players.filter((p) => p.id === m.spectate.id)[0] || {}).name : "",
      帯: !!(band && !band.classList.contains("vs-hide")),
      名: band ? band.querySelector(".vs-spec-nm").textContent : "",
      結果の口: !!(band && band.querySelector(".vs-spec-e")),
      残り, 鍵: !!m._specKey, 済: !!m._done
    };
  });
  見(観.観戦中, "★★ **ゴールしても 結果へ 飛ばず 観戦に 入る**", 観);
  見(観.帯, "観戦の 帯が 出る", 観.帯);
  見(観.残り.length > 0 && 観.名 === 観.見ている, "見て いる 人の 名前が 出る", { 名: 観.名, 残り: 観.残り });
  見(観.結果の口, "★ 「結果を 見る」が ある（閉じ込めない）", 観.結果の口);
  見(!観.済, "まだ 結果を 出して いない", 観.済);
  見(観.鍵, "★ ← → でも 入れ替えられる（自由に 見る）", 観.鍵);

  const 送 = await pg.evaluate(() => {
    const m = window.VocabuSurvive.__app.shell.get("match");
    const 前 = m.spectate.id;
    m._spectateStep(1);
    const 後 = m.spectate.id;
    /* 見て いる 人が ゴールしても、残って いる 人へ 移る（終わらない）。 */
    const 見中 = m.sim.players.filter((p) => p.id === m.spectate.id)[0];
    const 残数 = m._spectateAlive().length;
    if (残数 > 1) { 見中.finished = true; m._spectateTick(); }
    return { 前, 後, 移った: m.spectate ? m.spectate.id : "", 残数, 済: !!m._done };
  });
  見(送.前 !== 送.後 || 送.残数 <= 1, "★ ◀▶ で 相手が 変わる", 送);
  見(送.残数 <= 1 || (送.移った && 送.移った !== 送.後), "★★ **見て いた 人が ゴールしても 残りへ 移る**（終わらない）", 送);

  const 終 = await pg.evaluate(async () => {
    const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
    r.querySelector(".vs-spec-e").click();
    await new Promise((s) => setTimeout(s, 2200));
    const m = window.VocabuSurvive.__app.shell.get("match");
    const res = r.querySelector(".vs-result");
    return { 済: !!m._done, 観戦: !!m.spectate, 鍵: !!m._specKey,
             結果: !!(res && !res.classList.contains("vs-hide")) };
  });
  見(終.済, "★ 「結果を 見る」で 結果へ 行ける", 終);
  見(!終.観戦 && !終.鍵, "観戦を たたむ（鍵も 外す）", 終);

  見(例外.length === 0, "画面の 例外 0 件", 例外);
  await browser.close();
  console.log("\n────────────────────────────────");
  console.log("  ok " + 済 + " / NG " + 落);
  if (落) { console.log("  落ちた: " + 落ち.join(" / ")); process.exit(1); }
})();
