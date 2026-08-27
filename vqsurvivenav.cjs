#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqsurvivenav.cjs — 入口が 本当に 通るか（Phase 1）。

   ここで 見ること:
     ① 左パネルに VocabuSurvive が 出る
     ② **開くまで 束を 読まない**（見ない人には 1 バイトも 流れない）
     ③ 押すと 束が 届き、読み込み画面が 出る
     ④ 読み込み画面に 題字・START・版・読み込みの印 が ある
     ⑤ 別のタブへ 移ると 後始末される
     ⑥ 旧 VocabuSurvival（Error 2800）は 左パネルから 消えている
     ⑦ 例外が 出ていない
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const { chromium } = require("playwright");
const { serve } = require("./vqsrvserve.cjs");
const PORT = Number(process.env.VQ_PORT || 8975);
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
    args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader", "--disable-dev-shm-usage"]
  });
  const errs = [];
  const 取りに行った = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => errs.push("pageerror: " + String(e && e.message || e)));
    pg.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text().slice(0, 200)); });
    pg.on("request", (r) => 取りに行った.push(r.url()));

    節("① 画面が 立ち上がる");
    await pg.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    /* 認証を 通さずに タブだけ 見たいので、本体の 起動を 待つ */
    await pg.waitForFunction(() => !!document.getElementById("appSurvivePage"), null, { timeout: 20000 });
    ok("VocabuSurvive の 器が ある", true);
    const btn = await pg.$('#appTabBar [data-app-tab="survive"]');
    ok("左パネルに ボタンが ある", !!btn);

    節("② 開くまで 読まない");
    const 束の道 = await pg.evaluate(() => window.__VQ_SURVIVE_SRC || "");
    ok("束の 置き場が 分かる", /^\/js\/vq-survive\.[0-9a-f]{10}\.js$/.test(束の道), 束の道);
    await 待つ(1500);
    const 先に読んだ = 取りに行った.filter((u) => u.includes("vq-survive."));
    ok("この時点で まだ 読んでいない", 先に読んだ.length === 0, 先に読んだ);
    /* 旧 survival は 毎回 読まれている（比較のため 出すだけ） */
    const 旧 = 取りに行った.filter((u) => /survival(-v\d)?\//.test(u));
    console.log("     参考: 旧 survival は 起動時に " + 旧.length + " 本 読まれている");

    節("③ 押すと 出る");
    /* 認証の 覆いを どけて タブを 押せるように する（検査だけの 手当て）。
       ★ 覆いは あとから **もう一度** 出てくる（未ログインなので）。
         その たびに どけないと 中身の 高さが 0 のまま 測れない。 */
    const 覆いをどける = () => pg.evaluate(() => {
      document.body.classList.remove("auth-booting", "auth-gate-open", "first-launch-open");
      for (const id of ["authGate", "authBootSplash", "firstLaunchOverlay", "globalLoadingOverlay"]) {
        const e = document.getElementById(id); if (e) e.classList.add("hidden");
      }
      const app = document.getElementById("app"); if (app) app.style.display = "";
    });
    await 覆いをどける();
    await pg.evaluate(() => { document.querySelector('#appTabBar [data-app-tab="survive"]').click(); });
    await pg.waitForFunction(() => !!window.VocabuSurvive, null, { timeout: 20000 }).catch(() => {});
    const あとで読んだ = 取りに行った.filter((u) => u.includes("vq-survive."));
    ok("押したら 読みに 行った", あとで読んだ.length === 1, あとで読んだ);
    ok("window.VocabuSurvive が 生えた", await pg.evaluate(() => !!window.VocabuSurvive));
    await pg.waitForFunction(() => {
      const st = window.VocabuSurvive && window.VocabuSurvive.state();
      return st && st.opened && st.screen === "loading";
    }, null, { timeout: 15000 }).catch(() => {});
    const st = await pg.evaluate(() => window.VocabuSurvive ? window.VocabuSurvive.state() : null);
    ok("読み込み画面が 出ている", st && st.opened && st.screen === "loading", st);
    console.log("     ようす: " + JSON.stringify(st));

    節("④ 読み込み画面の 中身");
    const inside = await pg.evaluate(() => {
      const hostEl = document.querySelector("#appSurvivePage .vq-survive-host");
      if (!hostEl || !hostEl.shadowRoot) return { err: "影の DOM が ない" };
      const r = hostEl.shadowRoot;
      const title = r.querySelector(".vs-load-title");
      const start = r.querySelector(".vs-load-start");
      const bar = r.querySelector(".vs-load-bar");
      const ver = r.querySelector(".vs-load-ver");
      const cv = r.querySelector("canvas.vs-canvas");
      return {
        title: title ? title.textContent : "",
        start: start ? start.textContent.trim() : "",
        bar: !!bar, barRole: bar ? bar.getAttribute("role") : "",
        ver: ver ? ver.textContent : "",
        canvas: !!cv, canvasW: cv ? cv.width : 0
      };
    });
    ok("題字が VOCABUSURVIVE", inside.title === "VOCABUSURVIVE", inside.title);
    ok("START の ボタンが ある", inside.start === "START", inside.start);
    ok("読み込みの 印が ある（role=progressbar）", inside.bar && inside.barRole === "progressbar", inside);
    ok("版が 出ている", /^v\d+\.\d+\.\d+$/.test(String(inside.ver || "")), inside.ver);
    ok("立体の 板が ある", inside.canvas === true, inside);
    /* 板の 大きさは 描き始めてから 入る。**入るまで 待つ**
       （固定の 待ち時間だと 遅い端末で 落ちる）。 */
    await 覆いをどける();
    await pg.waitForFunction(() => {
      const host = document.querySelector("#appSurvivePage .vq-survive-host");
      if (!host || !host.shadowRoot) return false;
      const cv = host.shadowRoot.querySelector("canvas.vs-canvas");
      return !!cv && cv.width > 100 && cv.height > 100;
    }, null, { timeout: 15000 }).catch(() => {});
    const cw = await pg.evaluate(() => {
      const r = document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot;
      const cv = r.querySelector("canvas.vs-canvas");
      return cv ? { w: cv.width, h: cv.height } : null;
    });
    ok("板に 大きさが 入っている（＝描いている）", cw && cw.w > 100 && cw.h > 100, cw);

    節("⑤ 高さが 器に 収まる");
    await 覆いをどける();
    await pg.evaluate(() => window.dispatchEvent(new Event("resize")));
    await 待つ(220);
    const box = await pg.evaluate(() => {
      const el = document.getElementById("appSurvivePage");
      const r = el.getBoundingClientRect();
      const chain = []; let n = el.parentElement;
      while (n && n !== document.documentElement) {
        const cs = getComputedStyle(n), rr = n.getBoundingClientRect();
        chain.push((n.tagName + (n.id ? "#" + n.id : "")) + " " + cs.display + " h" + Math.round(rr.height));
        n = n.parentElement;
      }
      return { top: Math.round(r.top), h: Math.round(r.height), vh: window.innerHeight,
               tab: document.body.dataset.appTab, disp: getComputedStyle(el).display,
               inlineH: el.style.height, chain, bodyCls: document.body.className };
    });
    ok("下端が 画面の 中に 収まる", box.top + box.h <= box.vh + 6, box);
    ok("高さが 320px 以上", box.h >= 320, box);

    節("⑥ 別のタブへ 移ると 片づく");
    await pg.evaluate(() => { document.querySelector('#appTabBar [data-app-tab="home"]').click(); });
    await 待つ(500);
    const st2 = await pg.evaluate(() => window.VocabuSurvive.state());
    ok("閉じている", st2.opened === false, st2);
    const gone = await pg.evaluate(() => !document.querySelector("#appSurvivePage .vq-survive-host"));
    ok("器の 中が 空になった", gone === true);

    節("⑦ 旧 VocabuSurvival");
    const old = await pg.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("#appTabBar [data-app-tab]"));
      return btns.map((b) => b.getAttribute("data-app-tab"));
    });
    console.log("     左パネルの タブ: " + old.join(", "));
    ok("survive が 並んでいる", old.includes("survive"), old);

    節("⑧ 例外");
    const 無視 = /favicon|net::ERR_|Failed to load resource|firebase|config\.public|\/api\//i;
    const 実害 = errs.filter((e) => !無視.test(e));
    ok("実害の ある 例外が 0 件", 実害.length === 0, 実害.slice(0, 5));
    if (errs.length) console.log("     （参考）出た 全部: " + errs.length + " 件");
  } finally {
    await b.close(); srv.close();
  }
  console.log("\n────────────────────────────────");
  console.log("  ok " + pass + " / NG " + fail);
  if (bad.length) console.log("  落ちたもの:\n   - " + bad.join("\n   - "));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
