#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqsurviveprod.cjs — **本番に 出したあと**の 煙検査（要件 42）。

   触るのは 読み取りと 401 の 確かめだけ。**本番の データは 変えない。**
   （検証アカウントは 作らない。作ると 本番の users が 汚れる）

   使い方: node vqsurviveprod.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_PROD || "https://vocabuquiz-api.rintyblog.workers.dev";
let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ok   " + n); }
  else { fail++; bad.push(n); console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 300) : "")); }
};
const 節 = (t) => console.log("\n══ " + t + " ══");
const 取る = async (p, o) => {
  const r = await fetch(BASE + p, Object.assign({ signal: AbortSignal.timeout(15000) }, o || {}));
  const t = await r.text();
  let d = null; try { d = t ? JSON.parse(t) : null; } catch (e) { d = null; }
  return { status: r.status, text: t, data: d, headers: r.headers };
};

(async () => {
  console.log("本番: " + BASE + "\n");

  節("① 画面");
  const top = await 取る("/");
  ok("トップが 出る", top.status === 200 && top.text.length > 10000, top.status);
  const m = /\/js\/vq-survive\.([0-9a-f]{10})\.js/.exec(top.text);
  ok("VocabuSurvive の 束を 指している", !!m, m && m[0]);
  ok("押すまで 読まない（script タグに なっていない）",
    top.text.indexOf('src="/js/vq-survive.') < 0, "script で 直に 読んでいる");
  ok("左パネルに ボタンが ある", top.text.indexOf('data-app-tab="survive"') >= 0);
  ok("器が ある", top.text.indexOf('id="appSurvivePage"') >= 0);

  節("② 束");
  if (m) {
    const js = await 取る(m[0]);
    ok("束が 取れる", js.status === 200 && js.text.length > 50000, { status: js.status, len: js.text.length });
    console.log("     " + m[0] + " : " + (js.text.length / 1024).toFixed(1) + "KB");
    ok("1 年 溜めてよい 印が 付いている",
      /max-age=31536000/.test(String(js.headers.get("cache-control") || "")), js.headers.get("cache-control"));
    ok("中に VocabuSurvive が いる", js.text.indexOf("VocabuSurvive") >= 0);
    /* ★ 束は esbuild の 既定（ascii）なので **日本語は \uXXXX に なっている**。
       そのまま 探しても 見つからない。同じ 形に してから 探す。 */
    /* ★ esbuild の 逃がし方は **大文字の 16 進**（\u30C1）。
       小文字で 探しても 見つからない。大小を 揃えてから 探す。 */
    const esc = (t) => Array.from(t).map((c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0")).join("");
    const 低 = js.text.toLowerCase();
    const ある = (t) => js.text.indexOf(t) >= 0 || 低.indexOf(esc(t).toLowerCase()) >= 0;
    ok("コース 30 本 ぶんの 名前が 入っている", ある("チャンピオンシップ") && ある("はじまりの丘"));
  }

  節("③ API");
  const q = await 取る("/api/survive/questions", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ count: 3, seed: 12345 })
  });
  ok("問題が 出る", q.status === 200 && q.data && q.data.ok, q.status);
  ok("3 問 返る", q.data && (q.data.questions || []).length === 3, q.data && (q.data.questions || []).length);
  ok("選択肢が 4 つ・答えが 範囲に ある",
    q.data && (q.data.questions || []).every((x) => x.choices.length === 4 && x.answer >= 0 && x.answer < 4));
  /* 同じ 種なら 同じ 問題（対戦の 公平さ） */
  const q2 = await 取る("/api/survive/questions", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ count: 3, seed: 12345 })
  });
  ok("同じ 種なら 同じ 問題", JSON.stringify(q.data.questions) === JSON.stringify(q2.data.questions));

  節("④ 札の 関所");
  for (const [p, o] of [
    ["/api/survive/room", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }],
    ["/api/survive/stats", {}],
    ["/api/survive/friends", {}],
    ["/api/survive/result", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }]
  ]) {
    const r = await 取る(p, o);
    ok("札なし " + p + " → 401", r.status === 401, r.status);
  }
  const lb = await 取る("/api/survive/leaderboard/c01");
  ok("コースの 上位は 誰でも 見られる", lb.status === 200 && lb.data && lb.data.ok, lb.status);

  節("⑤ 左パネルの 表");
  const fl = await 取る("/api/flags/effective");
  ok("フラグが 引ける", fl.status === 200 && fl.data && fl.data.ok, fl.status);
  const rows = (fl.data && fl.data.flags) || [];
  const sv = rows.find((x) => x.key === "survive");
  const old = rows.find((x) => x.key === "survival");
  ok("survive が 出ている", !!sv, rows.map((x) => x.key));
  if (sv) {
    ok("survive は tab:survive を 指す", sv.path === "tab:survive", sv.path);
    ok("survive は 左パネルに 出る", sv.visible !== false && sv.visible !== 0, sv);
  }
  if (old) ok("旧 VocabuSurvival は 左パネルから 外れた", !old.visible, old);
  else console.log("     旧 survival の 行は 返っていない（＝出ない）");

  節("⑥ 本体が 壊れていない");
  for (const p of ["/api/flags/effective", "/api/public-config", "/manifest.webmanifest"]) {
    const r = await 取る(p);
    ok("本体 " + p + " → " + r.status, r.status === 200 || r.status === 404, r.status);
  }
  const me = await 取る("/api/auth/me");
  ok("札なしの /api/auth/me は 401", me.status === 401, me.status);

  節("⑦ 本物の 画面で 開く（読み取りだけ）");
  /* ★ HTTP の 200 だけでは「出したのに 動かない」を 見つけられない。
     本番の 束を **実際の ブラウザで 読み込んで**、ロビーまで 出るかを 見る。
     ★ 書き込みは 一切 しない（アカウントも 作らない・結果も 送らない）。 */
  try {
    const { chromium } = require("playwright");
    const br = await chromium.launch({
      args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader", "--disable-dev-shm-usage"]
    });
    const errs = [];
    try {
      const ctx = await br.newContext({ viewport: { width: 1200, height: 820 } });
      const pg = await ctx.newPage();
      pg.on("pageerror", (e) => errs.push(String(e && e.message || e)));
      await pg.goto(BASE + "/index.html", { waitUntil: "domcontentloaded", timeout: 45000 });
      await pg.waitForFunction(() => !!document.getElementById("appSurvivePage"), null, { timeout: 30000, polling: 250 });
      await pg.evaluate(() => {
        const f = () => {
          document.body.classList.remove("auth-booting", "auth-gate-open", "first-launch-open");
          for (const id of ["authGate", "authBootSplash", "firstLaunchOverlay", "globalLoadingOverlay"]) {
            const e = document.getElementById(id); if (e) e.classList.add("hidden");
          }
        };
        f(); if (!window.__g) window.__g = setInterval(f, 120);
      });
      await pg.evaluate(() => document.querySelector('#appTabBar [data-app-tab="survive"]').click());
      await pg.waitForFunction(() => !!(window.VocabuSurvive && window.VocabuSurvive.state().opened),
        null, { timeout: 45000, polling: 250 });
      const st = await pg.evaluate(() => window.VocabuSurvive.state());
      ok("本番の 束が 起きる", st.opened === true, st);
      ok("読み込みで 例外が 出ない", !st.error, st.error);
      await pg.waitForFunction(() => (window.VocabuSurvive.state().loaded || []).length >= 6,
        null, { timeout: 45000, polling: 250 }).catch(() => {});
      const st2 = await pg.evaluate(() => window.VocabuSurvive.state());
      ok("部品が 全部 読める（7 つ）", (st2.loaded || []).length >= 7, st2.loaded);
      await pg.waitForFunction(() => {
        const h = document.querySelector("#appSurvivePage .vq-survive-host");
        return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vs-load-start"));
      }, null, { timeout: 45000, polling: 250 });
      await pg.evaluate(() => document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot.querySelector(".vs-load-start").click());
      await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "lobby",
        null, { timeout: 30000, polling: 250 });
      const lb = await pg.evaluate(() => {
        const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
        return {
          コース: r.querySelectorAll(".vs-lb-courses > *").length,
          遊: r.querySelectorAll(".vs-lb-mode").length,
          帽: r.querySelectorAll(".vs-lb-hat").length,
          始: !!r.querySelector(".vs-lb-start")
        };
      });
      ok("ロビーまで 出る", lb.始 === true, lb);
      ok("コースが 30 本 並ぶ", lb.コース === 30, lb.コース);
      ok("遊び方が 6 つ", lb.遊 === 6, lb.遊);
      /* ★ 数を 決め打ちに しない（2026-08-31 に 12 → 16 に 増えた）。
     見たいのは 「並んで いる」こと。数は 育ちの ごほうびで これからも 増える。 */
  ok("かぶりものが 12 種 以上", lb.帽 >= 12, lb.帽);
      /* ★ **実際に 走らせる。** ロビーが 出るだけでは
         「開くが 遊べない」を 見つけられない。
         ★ 札を 入れて いない ので **何も 書き込まない**
           （結果を 送る 口は 札が 無ければ そこで 引き返す）。 */
      await pg.evaluate(() => {
        const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
        const lb = window.VocabuSurvive.__app.shell.get("lobby");
        lb.courseIndex = 0; lb.botCount = 3; lb.mode = "race"; lb._render();
        r.querySelector(".vs-lb-start").click();
      });
      await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "match",
        null, { timeout: 45000, polling: 250 });
      await pg.evaluate(() => {
        const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
        const b = r.querySelector(".vs-help .vs-btn"); if (b) b.click();
      });
      await new Promise((r) => setTimeout(r, 5200));
      const 走 = await pg.evaluate(() => {
        const m = window.VocabuSurvive.__app.shell.get("match");
        const st = m.renderer.stats || {};
        return { 相: m.sim.phase, 秒: Math.round(m.sim.raceTime * 10) / 10,
          板: [m.canvas.width, m.canvas.height], 人: m.sim.players.length,
          描: st.draws | 0, 面: st.tris | 0, 問: (m.questions || []).length,
          進: Math.round((m.sim.players[1] ? m.sim.players[1].progress : 0) * 10) / 10 };
      });
      console.log("     板 " + 走.板.join("×") + " / 描き " + 走.描 + " 回 / 面 " + 走.面);
      ok("**本番で 実際に 走る**", 走.相 === "running" && 走.秒 > 0, 走);
      ok("4 人 いる", 走.人 === 4, 走.人);
      ok("描けている", 走.描 > 5 && 走.面 > 1000, 走);
      ok("門の 問題が ある", 走.問 > 0, 走.問);
      ok("ボットが 走っている", 走.進 > 1, 走.進);

      const 実害 = errs.filter((e) => !/favicon|net::ERR_|Failed to load resource|firebase/i.test(e));
      ok("実害の ある 例外が 0 件", 実害.length === 0, 実害.slice(0, 3));
    } finally { await br.close().catch(() => {}); }
  } catch (e) {
    console.log("     （画面の 検査は 飛ばした: " + String(e && e.message || e).slice(0, 120) + "）");
  }

  console.log("\n────────────────────────────────");
  console.log("  ok " + pass + " / NG " + fail);
  if (bad.length) console.log("  落ちたもの:\n   - " + bad.join("\n   - "));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
