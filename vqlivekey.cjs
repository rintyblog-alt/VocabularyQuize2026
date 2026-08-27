#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   vqlivekey.cjs — 「繋がらないことがある」を 実機で 追う（2026-08-28）

   訴え: 「繋がらないことがある、そもそも Lumi が。」

   実測で 分かったこと（2026-08-28）:
     鍵 5 本のうち **GEMINI_API_KEY_3（番号 2）が 完全に 死んでいた**。
       1008 "Your project has been denied access."
     ・札（トークン）の 発行は **通る**ので、発行だけ見る 調べ口では 見えない
     ・画面は 「quota / exceeded / billing」の 字でしか 鍵を 避けていなかった
       → "denied access" は すり抜け、**その鍵を 永久に 避けない**
     ・サーバの 回しかたは `Date.now()/60000 % 本数`
       → **1 分のあいだ 全員が 同じ鍵**。死んだ鍵の 1 分は 誰も 繋がらない

   ここで 見ること:
     ① 死んだ鍵に 当たっても **最後には 話せる**（setup まで 行く）
     ② 死んだ鍵は **端末に 覚えて**、次の会話では 最初から 避ける
     ③ 覚えるのは 出入り禁止=6 時間 / 混雑=90 秒 と 分かれている
     ④ 全部は 避けない（1 本は 必ず 残す）
     ⑤ サーバの 鍵の 回しかたが **人ごとに ずれる**

   使い方: node vqlivekey.cjs   （検証環境のみ。本番では走らせない）
   ══════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright");

const BASE = process.env.VQ_API || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

const 根 = __dirname;
let OK = 0, NG = 0;
const ok = (n, m) => { OK++; console.log("  OK  " + n + (m ? " … " + m : "")); };
const ng = (n, m) => { NG++; console.log("  NG  " + n + (m ? " … " + m : "")); };
const 見 = (n, c, m) => (c ? ok(n, m) : ng(n, m));
const 束 = (前) => {
  const d = path.join(根, "client", "js");
  const f = fs.readdirSync(d).find((x) => new RegExp("^" + 前 + "\\.[0-9a-f]+\\.js$").test(x));
  return fs.readFileSync(path.join(d, f), "utf8");
};

(async () => {
  /* ── どの鍵が 死んでいるか、サーバに 聞く ─────────────────── */
  const 点検 = await (await fetch(BASE + "/api/live/keys/check")).json();
  console.log("── 鍵の点検 ──────────────────────────────────────────");
  (点検.結果 || []).forEach((x) => {
    console.log(`  ${x.番号} ${x.名前}  ${x.使える ? "話せる" : "×  " + x.どこで + " " + (x.なぜ || "")}`);
  });
  const 死んだ = (点検.結果 || []).filter((x) => !x.使える).map((x) => x.番号);
  const 生きた = (点検.結果 || []).filter((x) => x.使える).map((x) => x.番号);
  見("点検口が 鍵ごとに 使えるかを 返す",
    Array.isArray(点検.結果) && 点検.結果.length > 0 && 点検.結果.every((x) => x.名前),
    `${点検.使える本数}/${点検.鍵の本数} 本 使える`);
  if (!生きた.length) { console.log("\n生きている鍵が 1 本も ありません。ここで やめます。"); process.exit(1); }

  /* ── 画面を 立ち上げる（マイクは にせもの）───────────────── */
  const 人 = await (await fetch(BASE + "/api/auth/register", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gradePrefix: "H1", nickname: "lv" + Date.now().toString(36).slice(-6) + "99",
      password: "DevLv#2026a", tosAccepted: true, tosVersion: "1" })
  })).json();
  if (!人.token) { console.log("検証アカウントを作れません"); process.exit(1); }

  const core = 束("bundle-core"), app = 束("vq2-app"), live = 束("vq-live");
  const srv = http.createServer((q, s) => {
    const 実 = path.join(根, "client", decodeURIComponent(q.url.split("?")[0]));
    if (q.url !== "/" && fs.existsSync(実) && fs.statSync(実).isFile()) {
      const 型 = /\.js$/.test(実) ? "text/javascript" : /\.css$/.test(実) ? "text/css"
        : /\.woff2$/.test(実) ? "font/woff2" : "application/octet-stream";
      s.writeHead(200, { "Content-Type": 型 }); s.end(fs.readFileSync(実)); return;
    }
    s.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    s.end("<!doctype html><meta charset=utf-8><title>t</title><body>");
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const 港 = srv.address().port;
  const b = await chromium.launch({ args: [
    "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream",
    "--autoplay-policy=no-user-gesture-required"
  ] });
  const ctx = await b.newContext({ permissions: ["microphone"] });
  const p = await ctx.newPage();
  const 例外 = [];
  p.on("pageerror", (e) => 例外.push(String(e).slice(0, 200)));
  await p.goto("http://127.0.0.1:" + 港 + "/");
  await p.evaluate((o) => {
    window.AUTH_API_BASE = o.base;
    try { localStorage.setItem("app.auth.token.v1", o.tok); } catch (e) {}
  }, { base: BASE, tok: 人.token });
  await p.addScriptTag({ content: core });
  await p.addScriptTag({ content: app });
  await p.addScriptTag({ content: live });
  await p.waitForTimeout(300);

  /* ── ① 死んだ鍵から 始めても 話せるか ───────────────────── */
  console.log("\n── ① 死んだ鍵から 始めて 立て直せるか ──────────────");
  const 一 = await p.evaluate(async (o) => {
    const L = window.__vqLive;
    /* **わざと 死んだ鍵に 当てる。**
       画面が 送る avoid を 上書きして「生きている鍵は 避ける」と 言わせ、
       1 回目に 必ず 死んだ鍵を 引かせる。立て直せれば 本物。 */
    const 生 = new Set(o.生きた);
    const 元 = window.fetch;
    let 何回目 = 0; const 送った = [];
    window.fetch = function (u, init) {
      try {
        if (String(u).indexOf("/api/live/token") >= 0 && init && init.body) {
          const j = JSON.parse(init.body);
          何回目++;
          if (何回目 === 1) j.avoid = o.生きた.slice();      /* 1 回目は 死んだ鍵しか 残らない */
          送った.push({ 回: 何回目, avoid: (j.avoid || []).slice() });
          init = Object.assign({}, init, { body: JSON.stringify(j) });
        }
      } catch (e) {}
      return 元.apply(this, [u, init]);
    };
    try { localStorage.removeItem("vq.live.badkeys.v1"); } catch (e) {}
    L.open();
    for (let i = 0; i < 200; i++) {
      const s = L.state();
      if (s.話せている) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    const s = L.state();
    const 控 = JSON.parse(localStorage.getItem("vq.live.badkeys.v1") || "{}");
    L.close();
    window.fetch = 元;
    return { 話せている: !!s.話せている, 使った鍵: s.使った鍵,
             この会話で避けた鍵: s.この会話で避けた鍵, 端末: s.端末で避けている鍵,
             最後に切れた訳: s.最後に切れた訳, 送った,
             控: Object.keys(控).map((k) => ({ 鍵: Number(k),
               のこり秒: Math.round(((控[k] && 控[k].until ? 控[k].until : 控[k]) - Date.now()) / 1000),
               訳: String((控[k] && 控[k].why) || "").slice(0, 60) })) };
  }, { 生きた, 死んだ });

  console.log("     送った avoid: " + JSON.stringify(一.送った));
  console.log("     最後に切れた訳: " + (一.最後に切れた訳 || "（なし）"));
  見("**死んだ鍵から 始めても 最後には 話せる**", 一.話せている === true,
    "使った鍵=" + 一.使った鍵);
  見("死んだ鍵を この会話で 避けた",
    死んだ.every((d) => (一.この会話で避けた鍵 || []).indexOf(d) >= 0),
    JSON.stringify(一.この会話で避けた鍵));
  見("**端末に 覚えた**", (一.控 || []).some((x) => 死んだ.indexOf(x.鍵) >= 0),
    JSON.stringify(一.控));
  見("出入り禁止は **長く** 覚える（90 秒より ずっと先）",
    (一.控 || []).filter((x) => 死んだ.indexOf(x.鍵) >= 0).every((x) => x.のこり秒 > 3000),
    JSON.stringify(一.控));

  /* ── ② 次の会話では 最初から 避けるか ───────────────────── */
  console.log("\n── ② 次の会話では 最初から 避けるか ────────────────");
  const 二 = await p.evaluate(async () => {
    const L = window.__vqLive;
    const 元 = window.fetch; const 送った = [];
    window.fetch = function (u, init) {
      try {
        if (String(u).indexOf("/api/live/token") >= 0 && init && init.body) {
          const j = JSON.parse(init.body);
          送った.push(j.avoid || []);
          if (!window.__why) window.__why = j.avoidWhy || {};
        }
      } catch (e) {}
      return 元.apply(this, [u, init]);
    };
    L.open();
    for (let i = 0; i < 200; i++) { if (L.state().話せている) break; await new Promise((r) => setTimeout(r, 250)); }
    const s = L.state();
    L.close(); window.fetch = 元;
    return { 話せている: !!s.話せている, 使った鍵: s.使った鍵, 初回のavoid: 送った[0] || [],
             初回のwhy: window.__why || {}, 回数: 送った.length };
  });
  見("**訳も 一緒に サーバへ 送る**",
    !!(二.初回のwhy && Object.keys(二.初回のwhy).length
       && 死んだ.every((d) => /denied|1008/i.test(String(二.初回のwhy[d] || "")))),
    JSON.stringify(二.初回のwhy));
  見("**最初の 1 回目から 死んだ鍵を 避ける**",
    死んだ.every((d) => (二.初回のavoid || []).indexOf(d) >= 0),
    JSON.stringify(二.初回のavoid));
  見("2 回目の会話も 話せる", 二.話せている === true, "使った鍵=" + 二.使った鍵);
  見("**寄り道せずに 1 回で 繋がる**", 二.回数 === 1, 二.回数 + " 回 札を取った");

  /* ── ④ 全部は 避けない ──────────────────────────────────── */
  console.log("\n── ④ 全部を 避けない（1 本は 必ず 残す）────────────");
  const 四 = await p.evaluate((本) => {
    const L = window.__vqLive;
    const 期 = Date.now() + 6 * 3600 * 1000, o = {};
    for (let i = 0; i < 本; i++) o[i] = { until: 期, why: "denied（検査）" };
    localStorage.setItem("vq.live.badkeys.v1", JSON.stringify(o));
    const 元 = window.fetch; let 送 = null;
    window.fetch = function (u, init) {
      try {
        if (String(u).indexOf("/api/live/token") >= 0 && init && init.body && 送 === null) {
          const j = JSON.parse(init.body); 送 = j.avoid || []; window.__why4 = j.avoidWhy || {};
        }
      } catch (e) {}
      return 元.apply(this, [u, init]);
    };
    L.open();
    return new Promise((r) => setTimeout(() => {
      L.close(); window.fetch = 元;
      localStorage.removeItem("vq.live.badkeys.v1");
      r({ 送: 送, 本, why: window.__why4 || {} });
    }, 4000));
  }, 点検.鍵の本数);
  見("全部 死んでいても **1 本は 試す**",
    Array.isArray(四.送) && 四.送.length <= 四.本 - 1,
    "避けた " + JSON.stringify(四.送) + " / 全 " + 四.本 + " 本");
  見("**手で 書いた 控えは みんなの控えへ 流さない**",
    !四.why || Object.keys(四.why).length === 0
      || Object.keys(四.why).every((k) => Number(k) === 2),
    "送った訳 " + JSON.stringify(四.why));

  /* ── ⑤ サーバの 回しかたが 人ごとに ずれる ───────────────── */
  console.log("\n── ⑤ 鍵の 回しかたが 人ごとに ずれるか ─────────────");
  /* 点検は みんなの控えを **実測で 上書き**する。ここで 1 回 走らせて、
     前の 検査で 付いた 印を 落としてから 見る。 */
  await fetch(BASE + "/api/live/keys/check").then((r) => r.json()).catch(() => null);
  const 頭 = [];
  for (let i = 0; i < 6; i++) {
    const u = await (await fetch(BASE + "/api/auth/register", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gradePrefix: "H1", nickname: "sp" + Date.now().toString(36).slice(-5) + i + "7",
        password: "DevSp#2026a", tosAccepted: true, tosVersion: "1" })
    })).json();
    if (!u.token) continue;
    const r = await (await fetch(BASE + "/api/live/token", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + u.token },
      body: JSON.stringify({ voice: "", resume: false, sid: "sp" + i, avoid: [] })
    })).json();
    if (typeof r.keyIndex === "number") 頭.push(r.keyIndex);
  }
  const 種類 = [...new Set(頭)].length;
  見("**同じ 1 分でも 人によって 別の鍵から 始まる**", 種類 >= 2,
    "6 人が 引いた鍵: " + JSON.stringify(頭) + "（" + 種類 + " 種類）");

  見("赤い字が 出ない", 例外.length === 0, 例外.slice(0, 2).join(" / "));

  await b.close(); srv.close();
  console.log("\n════════════════════════════════════════════");
  console.log("  合計 " + (OK + NG) + " 件 / 通った " + OK + " / 落ちた " + NG);
  console.log("════════════════════════════════════════════");
  process.exit(NG ? 1 : 0);
})();
