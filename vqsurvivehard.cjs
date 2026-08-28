#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqsurvivehard.cjs — 意地の悪い 場面でも 遊べるか。

   実際に 起きる こと:
     ① プライベート窓 … IndexedDB が 開けない（ゴースト・自作コースが 使えない）
     ② 容量いっぱい   … localStorage が 例外を 投げる（設定が 保存できない）
     ③ 通信が 死ぬ     … 問題も 記録も 取れない
     ④ とても 遅い 回線 … 束が 届くまで 時間が かかる
     ⑤ WebGL2 が 無い   … 古い 端末（WebGL1 へ 落ちる）
     ⑥ 音が 出せない   … AudioContext が 作れない

   どれでも **遊べなく なっては いけない。**
   使い方: 先に  cd server && ./dev-local.sh echo 8795
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_API || "http://127.0.0.1:8795";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ok   " + n); }
  else { fail++; bad.push(n); console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 300) : "")); }
};
const 節 = (t) => console.log("\n══ " + t + " ══");
const 待つ = (ms) => new Promise((r) => setTimeout(r, ms));
const { chromium } = require("playwright");

/** 壊した 状態で ロビーまで 行けるか を 通す。 */
async function 通す(br, 壊す, opt) {
  opt = opt || {};
  const ctx = await br.newContext({ viewport: { width: 1180, height: 800 } });
  if (opt.offline) await ctx.setOffline(false);
  const errs = [], 外 = [];
  const pg = await ctx.newPage();
  /* ★ 見るのは **VocabuSurvive の 中の 例外**だけ。
     壊し方に よっては 本体の 側が 先に 転ぶ（例: matchMedia を 消すと
     index.html の 飾りが 転ぶ）が、それは この 検査の 話では ない。
     本体の ぶんは 数だけ 出す。 */
  pg.on("pageerror", (e) => {
    const st = String((e && e.stack) || "");
    const msg = String((e && e.message) || e);
    if (/vq-survive\.[0-9a-f]+\.js|vocabu-survive\//.test(st)) errs.push(msg + " @ " + (st.split("\n")[1] || "").trim());
    else 外.push(msg);
  });
  await ctx.addInitScript(壊す);
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
  await pg.waitForFunction(() => {
    const h = document.querySelector("#appSurvivePage .vq-survive-host");
    return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vs-load-start"));
  }, null, { timeout: 45000, polling: 250 });
  if (opt.offline) await ctx.setOffline(true);
  await pg.evaluate(() => document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot.querySelector(".vs-load-start").click());
  await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "lobby",
    null, { timeout: 30000, polling: 250 });
  /* 走る */
  await pg.evaluate(() => {
    const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
    const lb = window.VocabuSurvive.__app.shell.get("lobby");
    lb.courseIndex = 0; lb.botCount = 2; lb.mode = "race"; lb._render();
    r.querySelector(".vs-lb-start").click();
  });
  await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "match", null, { timeout: 30000, polling: 250 });
  await pg.evaluate(() => {
    const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
    const b = r.querySelector(".vs-help .vs-btn"); if (b) b.click();
  });
  await 待つ(4200);
  const st = await pg.evaluate(() => {
    const m = window.VocabuSurvive.__app.shell.get("match");
    return {
      画面: window.VocabuSurvive.state().screen,
      板: [m.canvas.width, m.canvas.height],
      相: m.sim.phase, 秒: Math.round(m.sim.raceTime * 10) / 10,
      問: (m.questions || []).length,
      人: m.sim.players.length,
      描: (m.renderer.stats || {}).draws | 0,
      webgl2: window.VocabuSurvive.state().webgl2
    };
  });
  const 実害 = errs.filter((e) => !/favicon|net::ERR_|Failed to load resource|firebase/i.test(e));
  await ctx.close();
  return { st, errs: 実害, 外: 外.length };
}

(async () => {
  const br = await chromium.launch({
    args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader", "--disable-dev-shm-usage"]
  });
  try {
    const 場面 = [
      ["① IndexedDB が 開けない（プライベート窓）", () => {
        try {
          Object.defineProperty(window, "indexedDB", {
            get() { throw new Error("SecurityError: indexedDB は 使えません"); }
          });
        } catch (e) {}
      }],
      ["② localStorage が 例外を 投げる（容量いっぱい）", () => {
        try {
          const 元 = window.localStorage;
          Object.defineProperty(window, "localStorage", {
            get() {
              return {
                getItem: (k) => 元.getItem(k),
                setItem: () => { throw new Error("QuotaExceededError"); },
                removeItem: () => { throw new Error("QuotaExceededError"); },
                key: (i) => 元.key(i), get length() { return 元.length; }
              };
            }
          });
        } catch (e) {}
      }],
      ["③ localStorage が まるごと 無い", () => {
        try { Object.defineProperty(window, "localStorage", { get() { throw new Error("no storage"); } }); } catch (e) {}
      }],
      ["④ 音が 出せない", () => {
        try {
          window.AudioContext = function () { throw new Error("audio なし"); };
          window.webkitAudioContext = window.AudioContext;
        } catch (e) {}
      }],
      ["⑤ matchMedia が 無い", () => { try { delete window.matchMedia; } catch (e) { window.matchMedia = undefined; } }],
      ["⑥ clipboard が 無い", () => { try { delete navigator.clipboard; } catch (e) {} }]
    ];
    for (const [名, 壊す] of 場面) {
      節(名);
      let r = null;
      try { r = await 通す(br, 壊す); } catch (e) {
        ok(名 + " でも 遊べる", false, String(e && e.message || e).slice(0, 160));
        continue;
      }
      ok("試合まで 行ける", r.st.画面 === "match", r.st);
      ok("板が 立つ", r.st.板[0] > 100 && r.st.板[1] > 100, r.st.板);
      ok("走り出す", r.st.相 === "running" && r.st.秒 > 0, r.st);
      ok("問題が 用意される", r.st.問 > 0, r.st.問);
      ok("描けている", r.st.描 > 5, r.st.描);
      ok("VocabuSurvive の 例外 0 件", r.errs.length === 0, r.errs.slice(0, 3));
      if (r.外) console.log("     （本体側の 例外 " + r.外 + " 件。この 検査の 対象では ない）");
    }

    節("⑦ 通信が 死んでいる（束は 届いた あと）");
    let r7 = null;
    try { r7 = await 通す(br, () => {}, { offline: true }); } catch (e) {
      ok("通信が 死んでも 遊べる", false, String(e && e.message || e).slice(0, 160));
    }
    if (r7) {
      ok("試合まで 行ける", r7.st.画面 === "match", r7.st);
      ok("**控えの 問題で 門が 開く**", r7.st.問 > 0, r7.st.問);
      ok("走り出す", r7.st.相 === "running" && r7.st.秒 > 0, r7.st);
      ok("VocabuSurvive の 例外 0 件", r7.errs.length === 0, r7.errs.slice(0, 3));
      if (r7.外) console.log("     （本体側の 例外 " + r7.外 + " 件）");
    }

    節("⑧ 束の 大きさ");
    const fs = require("fs");
    const zlib = require("zlib");
    const 名 = fs.readdirSync("client/js").filter((f) => /^vq-survive\.[0-9a-f]+\.js$/.test(f));
    ok("束は 1 つだけ", 名.length === 1, 名);
    if (名.length === 1) {
      const buf = fs.readFileSync("client/js/" + 名[0]);
      const gz = zlib.gzipSync(buf).length;
      console.log("     " + Math.round(buf.length / 1024) + "KB（圧縮 " + Math.round(gz / 1024) + "KB）");
      /* ★ 旧 v1/v2 は 4.5MB の 3D 部品で 死んでいる。**そこへ 戻らない**。 */
      ok("圧縮して 200KB 以内", gz <= 200 * 1024, Math.round(gz / 1024) + "KB");
      ok("生でも 600KB 以内", buf.length <= 600 * 1024, Math.round(buf.length / 1024) + "KB");
    }
  } finally {
    await br.close().catch(() => {});
  }
  console.log("\n────────────────────────────────");
  console.log("  ok " + pass + " / NG " + fail);
  if (bad.length) console.log("  落ちたもの:\n   - " + bad.join("\n   - "));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
