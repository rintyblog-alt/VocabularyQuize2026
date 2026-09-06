#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqsurviveperf.cjs — 速さを 測る（要件 24 / 37）。

   ★ 検査の 端末は **SwiftShader（絵を CPU で 描く）**。
     だから 「1 秒に 何枚」は 実機の 目安に ならない。
     代わりに **端末に 依らない 数**を 測る:
       ・1 フレームぶんの JS の 時間（考える 時間）
       ・描き回数 / 並べた数 / 面の数
       ::・落とす 量と 解析の 時間
       ・使っている メモリ
     これらは GPU が 速くても 遅くても 同じ。ここが 太っていれば
     どの 端末でも 重い。

   使い方: node vqsurviveperf.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const { chromium } = require("playwright");
const { serve } = require("./vqsrvserve.cjs");
const fs = require("fs");
const PORT = Number(process.env.VQ_PORT || 8979);
const BASE = "http://127.0.0.1:" + PORT;
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ok   " + n); }
  else { fail++; bad.push(n); console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 260) : "")); }
};
const 節 = (t) => console.log("\n══ " + t + " ══");
const 待つ = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  /* ── ① 落とす 量 ── */
  節("① 落とす 量");
  const jsdir = "client/js";
  const f = fs.readdirSync(jsdir).find((x) => /^vq-survive\.[0-9a-f]{10}\.js$/.test(x));
  const bytes = fs.statSync(jsdir + "/" + f).size;
  const gz = require("zlib").gzipSync(fs.readFileSync(jsdir + "/" + f)).length;
  console.log("     " + f + " : " + (bytes / 1024).toFixed(1) + "KB（圧縮して " + (gz / 1024).toFixed(1) + "KB）");
  /* ★ 目安を 400KB / 120KB → 420KB / 132KB に した（2026-08-31）。
     訴え「プロダクトレベルまで」で 足した もの:
       後処理（にじみ・階調・色）／接地影／床の 目地／星／
       世界観（地方・育ち・記章）／曲 12 種／合図の 見せ場。
     ★ 上げる 前に **減らせる ものは 減らした**（合わせて −54KB）:
       ・組む ときの 文字を utf8 に（日本語が \uXXXX で 倍に なっていた）
       ・CSS / GLSL の 中の 注釈と 字下げを 組む ときに 落とす
     ★ 実測の 意味: 圧縮して 122KB。細い 回線（実測 1.2Mbps）で **0.82 秒**。
       1 年 覚えて もらえる ので 2 回目は 0 秒。
       借り物（Babylon.js 4.5MB＝30 秒）を 避けた 意味は まだ 十分 残っている。
     ★ 420/132 → 440/142（同じ 日の 07:30）。控えの 問題を 80 → 200 に した ぶん。
       **先に 減らす 手を 探した うえで 上げて いる**:
         ・組む ときの 文字を utf8 に … 済み（−40KB）
         ・CSS / GLSL の 注釈と 字下げを 落とす … 済み（−14KB）
         ・問題を 詰めた 書き方に する … **やらない**。
           punctuation は 200 行で 7KB だが、圧縮すると 1KB 未満に なる。
           読みにくく する 割に 効かない（見積もりで 判断）。
       実測: 426KB / 圧縮 134KB。細い 回線（1.2Mbps）で **0.89 秒**。1 年 覚える。
       2026-08-28 の 出発点は 373KB / 101KB。この 日 足した すべてで +33KB（圧縮）＝ +0.22 秒。
     ★ 次に 減らせるのは **コースを 作る 画面**（editor3d ほか 32KB / 圧縮 約 10KB）を
       押した ときに 読む こと。ふだん 遊ぶ 人は 開かない。
       やる ときは 取りに行きが 1 本 増える ことを 測ってから。 */
  ok("束が 440KB 未満", bytes < 440 * 1024, bytes);
  ok("圧縮して 142KB 未満", gz < 142 * 1024, gz);
  console.log("     参考: Babylon.js を 借りると 約 4,500KB。旧 v1/v2 は それを 前提にしていた（不在で 起動不能）。");
  /* 素の モジュールの まま 配ったら 何本に なるか */
  let 本数 = 0;
  (function walk(d) {
    for (const x of fs.readdirSync(d)) {
      const p = d + "/" + x;
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (x.endsWith(".js")) 本数++;
    }
  })("client/assets/vocabu-survive");
  console.log("     束ねないと " + 本数 + " 本の 取りに行きに なる（細い回線で 数秒）");

  const srv = await serve(PORT);
  const b = await chromium.launch({
    args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader",
           "--disable-dev-shm-usage", "--js-flags=--expose-gc"]
  });
  const 結果 = {};
  try {
    for (const [名, vw, vh, tier] of [["机の上", 1440, 900, "high"], ["机の上(最高)", 1440, 900, "ultra"],
                                       ["スマホ", 390, 844, "medium"], ["低い端末", 390, 844, "low"]]) {
      節("② " + 名 + "（" + vw + "×" + vh + " / 段 " + tier + "）");
      const ctx = await b.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
      const pg = await ctx.newPage();
      const errs = [];
      pg.on("pageerror", (e) => errs.push(String(e && e.message || e)));
      await pg.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
      await pg.waitForFunction(() => !!document.getElementById("appSurvivePage"), null, { timeout: 20000 });
      await pg.evaluate((t) => {
        const 消す = () => {
          document.body.classList.remove("auth-booting", "auth-gate-open", "first-launch-open");
          for (const id of ["authGate", "authBootSplash", "firstLaunchOverlay", "globalLoadingOverlay"]) {
            const e = document.getElementById(id); if (e) e.classList.add("hidden");
          }
        };
        消す(); if (!window.__g) window.__g = setInterval(消す, 120);
        try { localStorage.setItem("vq.survive.tier.v1", t); } catch (e) {}
      }, tier);
      const t0 = Date.now();
      await pg.evaluate(() => document.querySelector('#appTabBar [data-app-tab="survive"]').click());
      await pg.waitForFunction(() => window.VocabuSurvive && window.VocabuSurvive.state().opened, null, { timeout: 25000 });
      const 開くまで = Date.now() - t0;
      await pg.waitForFunction(() => (window.VocabuSurvive.state().loaded || []).length >= 5, null, { timeout: 25000 }).catch(() => {});
      const 用意まで = Date.now() - t0;
      /* ★ 「開くまで」には **本体の 5.8MB の JS との 取り合い**が 混ざる。
         VocabuSurvive 自身の 費用を 切り出して 見る。 */
      const 自分の費用 = await pg.evaluate(() => {
        const e = performance.getEntriesByType("resource").find((r) => /vq-survive\.[0-9a-f]{10}\.js/.test(r.name));
        return e ? { 取りに行き: Math.round(e.responseEnd - e.startTime), 大きさ: Math.round((e.encodedBodySize || 0) / 1024) } : null;
      });

      /* 試合へ */
      await pg.evaluate(() => {
        const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
        r.querySelector(".vs-load-start").click();
      });
      await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "lobby", null, { timeout: 20000 });
      /* いちばん 重い コースで 測る（c29 最後の試練） */
      await pg.evaluate(() => {
        const app = window.VocabuSurvive.__app;
        app.startMatch({ courseId: "c29", bots: 7, myName: "計測", myColor: 0, seed: 5 });
      });
      await pg.waitForFunction(() => {
        const ms = window.VocabuSurvive.__app.shell.get("match");
        return ms && ms.sim && ms.sim.phase === "running";
      }, null, { timeout: 25000 }).catch(() => {});

      /* JS の 時間を 測る（描きの 積み上げ＋物理） */
      const m = await pg.evaluate(async () => {
        const ms = window.VocabuSurvive.__app.shell.get("match");
        const orig = ms.tick.bind(ms);
        const 時間 = [];
        ms.tick = function (dt) { const a = performance.now(); orig(dt); 時間.push(performance.now() - a); };
        /* 走らせる */
        const { Bot } = await import("/assets/vocabu-survive/game/bot.js");
        const bot = new Bot(ms.local, ms.course, { level: "perfect", seed: 9 });
        const oc = ms._collectInputs.bind(ms);
        ms._collectInputs = function () { oc(); if (ms.sim.phase === "running" && !ms.local.finished) ms.inputs.set(ms.local.id, bot.decide(ms.sim.time)); };
        await new Promise((r) => setTimeout(r, 6000));
        時間.sort((a, b) => a - b);
        const st = ms.renderer.stats;
        return {
          frames: 時間.length,
          p50: 時間[(時間.length / 2) | 0] || 0,
          p95: 時間[Math.floor(時間.length * 0.95)] || 0,
          max: 時間[時間.length - 1] || 0,
          draws: st.draws, instances: st.instances, culled: st.culled, tris: st.tris | 0,
          w: ms.canvas.width, h: ms.canvas.height,
          tier: ms.settings.tier, shadow: !!ms.settings.shadow,
          solids: ms.course.world.solids.length, obstacles: ms.course.obstacles.length,
          mem: (performance.memory && performance.memory.usedJSHeapSize) || 0
        };
      });
      結果[名] = m;
      console.log("     開くまで " + 開くまで + "ms / 用意まで " + 用意まで + "ms"
        + (自分の費用 ? "（うち 束の 取りに行き " + 自分の費用.取りに行き + "ms）" : ""));
      console.log("     板 " + m.w + "×" + m.h + " / 影 " + (m.shadow ? "あり" : "なし"));
      console.log("     1 コマの JS: 中央 " + m.p50.toFixed(2) + "ms / 95% " + m.p95.toFixed(2) + "ms / 最悪 " + m.max.toFixed(2) + "ms");
      console.log("     描き " + m.draws + " 回 / 並び " + m.instances + " / 捨て " + m.culled + " / 面 " + m.tris);
      console.log("     当たり " + m.solids + " 個 / 仕掛け " + m.obstacles + " / メモリ " + (m.mem / 1048576).toFixed(1) + "MB");

      /* ★ 線は **VocabuSurvive 自身の 費用**に 引く。
         「開くまで」には 本体の vq-core 2.4MB・vq2-app 3.0MB との
         取り合いが 混ざる（冷えた 1 回目は 4.2 秒、2 回目 以降は 0.4 秒）。
         そこは VocabuSurvive の 責任では ないので、別に 記録するに とどめる。 */
      ok(名 + ": 束の 取りに行きが 800ms 未満", !自分の費用 || 自分の費用.取りに行き < 800,
        自分の費用);
      if (開くまで >= 3000) console.log("     ⚠ 開くまで " + 開くまで + "ms（本体の JS 5.8MB との 取り合い。冷えた 1 回目だけ）");
      ok(名 + ": 1 コマの JS 中央が 8ms 未満", m.p50 < 8, m.p50);
      ok(名 + ": 95% でも 16ms 未満", m.p95 < 16, m.p95);
      /* ★ 目安を 40 → 44 に した（2026-08-31）。
         足元の 接地影（薄い 円盤）を 全員に 1 枚 敷いた ぶん、
         描き回数が 1 回 増える（低い 端末で ちょうど 40 に なった）。
         「浮いて 見える」が 直る 価値の ほうが 大きい と 判断した。
         **形を 増やすと ここが 増える。** 増やす ときは 必ず ここを 見る。 */
      /* ★ 44 → 52（2026-08-31・30 本を 走らせて 実測）。
         止まって いる ときは 29〜36 回。**走り出すと 粒（土ぼこり・火の粉）が
         別の 形の まとまりを 起こす**ので 41〜44 回まで 増える。
         44 は もう 目安に なって いない（測る 場所で 通ったり 落ちたり する）。
         ★ この 目安が 守って いるのは 「形を 増やしすぎない こと」。
           **形を 1 つ 足すと 最大 3 回 増える**（粗さ 3 段ぶん）。
           50 を 超えたら 形が 増えすぎて いる と 見る。 */
      ok(名 + ": 描き回数 52 回 未満", m.draws < 52, m.draws);
      ok(名 + ": 視界の 外を 捨てている", m.culled > 0, m.culled);
      ok(名 + ": 例外 0 件", errs.length === 0, errs.slice(0, 3));
      await ctx.close();
    }

    節("③ 段ごとの 違い");
    const 高 = 結果["机の上"], 低 = 結果["低い端末"], 最高 = 結果["机の上(最高)"];
    ok("低い端末は 画素が 少ない", 低.w * 低.h < 高.w * 高.h, { 低: 低.w + "x" + 低.h, 高: 高.w + "x" + 高.h });
    ok("低い端末は 影を 焼かない", 低.shadow === false, 低.shadow);
    ok("最高は 影を 焼く", 最高.shadow === true, 最高.shadow);
    ok("低い端末の ほうが JS も 軽い", 低.p50 <= 高.p50 * 1.35, { 低: 低.p50, 高: 高.p50 });

    節("④ 面の 数（要件 23: 面は 少なく、質は 画素で）");
    console.log("     いちばん 重い コースで " + 高.tris + " 面");
    ok("面が 20 万 未満", 高.tris < 200000, 高.tris);
    ok("並べた ものの 大半を 捨てている", 高.culled > 高.instances * 0.2, { 並: 高.instances, 捨: 高.culled });
  } finally {
    await b.close(); srv.close();
  }
  console.log("\n────────────────────────────────");
  console.log("  ok " + pass + " / NG " + fail);
  if (bad.length) console.log("  落ちたもの:\n   - " + bad.join("\n   - "));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
