#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   vqpresetroom.cjs — プリセットの 置き場（2026-08-28）

   訴え:
     「プリセットが みんな 保存できない。すぐ 容量いっぱいに なってしまうから。
       割り当て 考えて欲しい。コレじゃ 何もできん。」
     「記述問題や、グラフの問題とかで、エラーが。」

   実測で 分かっていたこと（2026-08-28）:
     ・本番 D1 で いちばん 大きい 塊は 2.01MB。12MB の 上限には 誰も 届いていない
       ＝ **サーバは 詰まっていない**
     ・詰まっていたのは **端末の localStorage（約 4.4MB）**
         wordPractice400.presets.v1 … 2.01MB
         vq2.presets.v1             … 0.88MB
     ・記述・グラフは 中身が 大きい（模範解答・採点基準・グラフの数値）ので
       溢れる きっかけに なりやすい

   ここで 見ること:
     ① 手元が いっぱいでも プリセットを 保存できる
     ② 保存したものを **読み直せる**（IndexedDB から）
     ③ 開き直しても 消えない
     ④ **空で 上書きしない**（用意の 途中に 全部 消えない）
     ⑤ 手元に 余裕が あるうちは これまでどおり（動きを 変えない）
     ⑥ 大きい鍵が localStorage から 退いている（容量が 空く）
   ══════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { chromium } = require("playwright");

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
  const core = 束("bundle-core"), app = 束("vq2-app");
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
  const b = await chromium.launch();
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  const 例外 = [];
  p.on("pageerror", (e) => 例外.push(String(e).slice(0, 200)));
  await p.goto("http://127.0.0.1:" + 港 + "/");

  /* ── ⑤ まず 余裕が あるとき ─────────────────────────────── */
  console.log("── ⑤ 手元に 余裕が あるとき（動きを 変えない）──────");
  await p.addScriptTag({ content: core });
  await p.addScriptTag({ content: app });
  await p.waitForTimeout(600);
  const 五 = await p.evaluate(async () => {
    const ST = window.VQ2.store || {};
    return { 口: Object.keys(ST).slice(0, 14),
             presets: ST.presets ? Object.keys(ST.presets).slice(0, 10) : null };
  });
  console.log("     store の 口: " + JSON.stringify(五.口));
  console.log("     presets の 口: " + JSON.stringify(五.presets));

  /* ── ①②④ 手元を 埋めてから 保存する ───────────────────── */
  console.log("\n── ①②④ 手元が いっぱいでも 保存できるか ──────────");
  const 一 = await p.evaluate(async () => {
    const 待 = (ms) => new Promise((r) => setTimeout(r, ms));
    const I = window.VQIDB;
    await I.用意を待つ();
    /* 手元を **わざと 埋める**（4.4MB の 壁を 作る） */
    let 詰めた = 0;
    try {
      for (let i = 0; i < 400; i++) { localStorage.setItem("__ふさぎ" + i, "z".repeat(200000)); 詰めた++; }
    } catch (e) {}
    /* この時点で setItem は 落ちる */
    let 手元が満杯 = false;
    try { localStorage.setItem("__ためし", "y".repeat(400000)); } catch (e) { 手元が満杯 = true; }

    const 大きいプリセット = Array.from({ length: 40 }, (_, i) => ({
      id: "big" + i, schemaVersion: 2, ownerId: "local", name: "記述とグラフ " + i,
      updatedAt: new Date().toISOString(), createdAt: new Date().toISOString(),
      questions: Array.from({ length: 10 }, (_, j) => ({
        id: "q" + j, schemaVersion: 2, number: j + 1,
        type: j % 2 ? "long_answer" : "chart_read",
        prompt: "説明しなさい。".repeat(20),
        explanation: "根拠と解説。".repeat(120),
        points: 4, correctAnswer: "模範解答の文。".repeat(10), acceptedAnswers: [],
        scoringRubric: { items: [{ id: "r1", description: "根拠が書けている", points: 2 },
                                  { id: "r2", description: "用語が正しい", points: 2 }] },
        chart: { type: "bar", labels: ["ア", "イ", "ウ"], series: [{ name: "数", values: [1, 2, 3] }] }
      }))
    }));
    const 文 = JSON.stringify(大きいプリセット);
    /* ★ **画面と 同じ道**（VQ2.store.savePreset）を 通す。
       ここが 通らないと 「プリセットが 保存できない」は 直っていない。 */
    const ST = window.VQ2.store;
    let 使った = "savePreset", r = { ok: true }, 保存できた = 0, 断り = "";
    for (const pr of 大きいプリセット) {
      const w = ST.savePreset(pr);
      if (w && w.ok === false) { r = w; 断り = String(w.message || w.error || "")
        + " || " + JSON.stringify(w.issues || w.errors || w.detail || {}).slice(0, 400); break; }
      保存できた++;
    }
    r.保存できた = 保存できた; r.断り = 断り;
    await 待(900);
    /* 空で 潰さないか */
    let 空を止めた = false;
    try {
      const 前 = I.鏡から("vq2.presets.v1");
      I.鏡へ("vq2.presets.v1", 前);   /* 触っても 変わらないこと */
      空を止めた = (I.鏡から("vq2.presets.v1") || "").length > 1000;
    } catch (e) {}
    for (let i = 0; i < 詰めた; i++) { try { localStorage.removeItem("__ふさぎ" + i); } catch (e) {} }
    let 読み戻し = -1;
    try { 読み戻し = (ST.listPresets() || []).length; } catch (e) {}
    const 調 = {};
    ["vq2.presets.v1", "wordPractice400.presets.v1"].forEach((k) => {
      調[k] = { 手元: (() => { try { const v = localStorage.getItem(k); return v === null ? "null" : v.length; } catch (e) { return "err"; } })(),
                鏡: (I.鏡から(k) || "").length, 用意: I.用意できた(k), ある: I.鏡にある(k) };
    });
    調.__owner = ST.currentOwnerId ? ST.currentOwnerId() : "?";
    return { 手元が満杯, 使った, 結: r, 保存の大きさ: 文.length, 読み戻し,
             鏡の大きさ: (I.鏡から("vq2.presets.v1") || "").length, 空を止めた, 調 };
  });
  見("手元を いっぱいに できた（検査の 前提）", 一.手元が満杯 === true);
  console.log("     （手がかり）" + JSON.stringify(一.調));
  見("★ 手元が いっぱいでも **40 件 全部 保存できる**",
    一.結 && 一.結.ok !== false && 一.結.保存できた === 40,
    "保存できた " + (一.結 && 一.結.保存できた) + " 件 " + ((一.結 && 一.結.断り) || ""));
  見("保存の 呼び出しが 断られない", (一.結 && 一.結.ok) !== false,
    JSON.stringify((一.結 && 一.結.断り) || "断りなし").slice(0, 120));

  /* ── ②' 置き場そのものを 直に 測る（手元に 入らない 大きさ）──── */
  console.log("\n── ②\' 手元に 入らない 大きさを 置けるか ─────────────");
  const 二 = await p.evaluate(async () => {
    const I = window.VQIDB;
    await I.用意を待つ();
    /* 手元の 上限（約 4.4MB）を 確実に 超える 大きさ */
    const 一覧 = Array.from({ length: 60 }, (_, i) => ({
      id: "L" + i, ownerId: "local", name: "大きい " + i,
      本文: "あ".repeat(100000)          /* 1 件 100,000 字 → 全体 6,000,000 字 */
    }));
    const 文 = JSON.stringify(一覧);
    let 手元は無理 = false;
    try { localStorage.setItem("__大ためし", 文); localStorage.removeItem("__大ためし"); }
    catch (e) { 手元は無理 = true; }
    /* 画面の writeAll と 同じ 道（store の 内部）を 通せないので、
       readAll / writeAll と 同じ 作りを ここで 呼ぶ。 */
    I.鏡へ("vq2.presets.v1", 文);
    try { localStorage.removeItem("vq2.presets.v1"); } catch (e) {}
    await new Promise((r) => setTimeout(r, 900));
    const 読 = I.鏡から("vq2.presets.v1") || "";
    let 件 = -1; try { 件 = JSON.parse(読).length; } catch (e) {}
    return { 手元は無理, 大きさ: 文.length, 読の大きさ: 読.length, 件 };
  });
  見("手元には 入らない 大きさ（検査の 前提）", 二.手元は無理 === true,
    Math.round(二.大きさ / 1024 / 1024 * 10) / 10 + "MB");
  見("★ 広い置き場には **入る**", 二.件 === 60,
    Math.round(二.読の大きさ / 1024 / 1024 * 10) / 10 + "MB / " + 二.件 + " 件");

  /* ── ③ 開き直しても 消えない ─────────────────────────── */
  console.log("\n── ③ 開き直しても 残るか ──────────────────────────");
  const p2 = await ctx.newPage();
  const 例外2 = [];
  p2.on("pageerror", (e) => 例外2.push(String(e).slice(0, 200)));
  await p2.goto("http://127.0.0.1:" + 港 + "/");
  await p2.addScriptTag({ content: core });
  await p2.addScriptTag({ content: app });
  await p2.waitForTimeout(1200);
  const 三 = await p2.evaluate(async () => {
    await window.VQIDB.用意を待つ();
    const 文 = window.VQIDB.鏡から("vq2.presets.v1") || "";
    let n = 0; try { n = JSON.parse(文).length; } catch (e) { n = -1; }
    let 読み戻しの大きさ = 0;
    try { 読み戻しの大きさ = (localStorage.getItem("vq2.presets.v1") || "").length; } catch (e) {}
    return { 大きさ: 文.length, 件数: n, 読み戻しの大きさ,
             /* ★ getItem は VQCLOUD が 横取りして 写しを 返す（2026-08-28 に そうした）。
                「素の localStorage に 残っているか」は **鍵の 並び**で 見る。 */
             手元: (() => { try {
               for (let i = 0; i < localStorage.length; i++)
                 if (localStorage.key(i) === "vq2.presets.v1") return 1;
               return 0;
             } catch (e) { return -1; } })() };
  });
  見("★ 開き直しても **残っている**", 三.件数 === 60, "件数 " + 三.件数);
  見("★ 素の localStorage には 置いていない", 三.手元 === 0,
    "素に " + (三.手元 ? "残っている" : "無い") + " / 広い置き場 " + Math.round(三.大きさ / 1024) + "KB");
  見("★ 横取りした getItem が **新しいほう**を返す",
    三.読み戻しの大きさ >= 三.大きさ * 0.9,
    Math.round((三.読み戻しの大きさ || 0) / 1024) + "KB");

  /* ── ⑦ 手元が 一杯のとき **新しいほうが 消えない** ───────────
     ★ 2026-08-28 の 実測で 見つけた 芯。
       setItem は 容量あふれを 握りつぶすのに getItem は 素を 読んでいたので、
       「保存できた」と 見えて 読み返すと **古いまま**、
       しかも サーバへ 送られるのも 古いほうだった。 */
  console.log("\n── ⑦ 手元が 一杯でも 新しいほうが 生き残るか ─────────");
  const p3 = await ctx.newPage();
  const 例外3 = [];
  p3.on("pageerror", (e) => 例外3.push(String(e).slice(0, 200)));
  await p3.goto("http://127.0.0.1:" + 港 + "/");
  await p3.addScriptTag({ content: core });
  await p3.addScriptTag({ content: app });
  await p3.waitForTimeout(800);
  const 七 = await p3.evaluate(async () => {
    const 待 = (ms) => new Promise((r) => setTimeout(r, ms));
    await window.VQIDB.用意を待つ();
    /* まず 小さい 値を 入れておく（これが 古いほう） */
    const 古 = JSON.stringify([{ id: "old", ownerId: "local", name: "ふるい" }]);
    localStorage.setItem("vq2.presets.v1", 古);
    await 待(300);
    /* 手元を 埋める */
    let 詰めた = 0;
    try { for (let i = 0; i < 400; i++) { localStorage.setItem("__ふさぎ" + i, "z".repeat(200000)); 詰めた++; } }
    catch (e) {}
    /* 大きい 新しい 値を 保存（例外は 投げないはず） */
    const 新 = JSON.stringify(Array.from({ length: 30 }, (_, i) => ({
      id: "new" + i, ownerId: "local", name: "あたらしい " + i, 本文: "あ".repeat(80000) })));
    let 投げた = false;
    try { localStorage.setItem("vq2.presets.v1", 新); } catch (e) { 投げた = true; }
    await 待(900);
    const 読 = localStorage.getItem("vq2.presets.v1") || "";
    let 件 = -1; try { 件 = JSON.parse(読).length; } catch (e) {}
    /* 同期が どちらを 送ろうとしているか */
    let 送る大きさ = -1;
    try {
      const 様 = window.VQCLOUD && window.VQCLOUD.様子 ? window.VQCLOUD.様子() : null;
      const t = 様 && 様.揃えるもの && 様.揃えるもの["vq2.presets.v1"];
      送る大きさ = t ? (t.バイト !== undefined ? t.バイト : t.大きさ) : -1;
    } catch (e) {}
    for (let i = 0; i < 詰めた; i++) { try { localStorage.removeItem("__ふさぎ" + i); } catch (e) {} }
    return { 投げた, 読の大きさ: 読.length, 件, 新の大きさ: 新.length, 送る大きさ, 古の大きさ: 古.length };
  });
  見("保存で 例外を 投げない（これまでどおり）", 七.投げた === false);
  見("★★ **読み返すと 新しいほう**（古いまま に ならない）",
    七.件 === 30, "件数 " + 七.件 + " / " + Math.round(七.読の大きさ / 1024) + "KB（新は "
      + Math.round(七.新の大きさ / 1024) + "KB・古は " + 七.古の大きさ + "字）");
  見("★★ サーバへも **新しいほう**を 送ろうとする",
    七.送る大きさ === -1 || 七.送る大きさ > 七.古の大きさ * 10,
    "送る " + 七.送る大きさ + " / 古 " + 七.古の大きさ);
  見("赤い字が 出ない（⑦）", 例外3.length === 0, 例外3.slice(0, 2).join(" / "));

  /* ── ⑥ 中身の 検査 ───────────────────────────────────── */
  console.log("\n── ⑥ 作りの 検査 ──────────────────────────────────");
  const 素 = (x) => x.replace(/\/\*[\s\S]*?\*\//g, "");
  const idb = 素(fs.readFileSync(path.join(根, "client", "core", "store", "idb.js"), "utf8"));
  const src = 素(fs.readFileSync(path.join(根, "js-src",
    fs.readdirSync(path.join(根, "js-src")).find((x) => /^vq2-app\./.test(x))), "utf8"));
  ["wordPractice400.presets.v1", "vq2.presets.v1", "vq2.presetAttachments.v1",
   "vq2.mocks.v1", "vq2.results.v1"].forEach((k) => {
    見("　広い置き場へ移す鍵に " + k, idb.indexOf('"' + k + '"') >= 0);
  });
  見("同期で読める鏡がある", /鏡にある: 鏡にある, 鏡から: 鏡から, 鏡へ: 鏡へ/.test(idb));
  見("★ 空で上書きしない歯止めがある", /function 空で潰しかけ/.test(src));
  見("手元がいっぱいなら広い置き場へ逃がす", /広\.鏡へ\(key, 文\);\s*try \{ root\.localStorage\.removeItem\(key\); \}/.test(src));
  見("読むときも広い置き場を見る", /var I = 広い置き場\(key\);\s*if \(I\) raw = I\.鏡から\(key\);/.test(src));
  const cl = 素(fs.readFileSync(path.join(根, "client", "core", "store", "cloud.js"), "utf8"));
  見("★ 揃える鍵は getItem でも 写しを先に返す", /if \(揃える鍵か\(k\)\) \{[\s\S]{0,200}記憶\[k\]/.test(cl));
  見("★ 鍵を読む も 写しを先に見る", /function 鍵を読む\(k\) \{\s*if \(Object\.prototype\.hasOwnProperty\.call\(記憶, k\)\)/.test(cl));
  見("★ あふれたら 素の古い値を消して 広い置き場へ",
    /I1\.鏡へ\(k, String\(v\)\)/.test(cl) && /素の消し\(k\)/.test(cl));
  見("★ 送る大きさを **バイト**で数える（日本語で3倍ずれない）",
    /function バイト数/.test(cl) && /var 大 = バイト数\(荷\[i\]\.value\)/.test(cl));
  見("赤い字が 出ない", 例外.length === 0 && 例外2.length === 0,
    例外.concat(例外2).slice(0, 2).join(" / "));

  await b.close(); srv.close();
  console.log("\n════════════════════════════════════════════");
  console.log("  合計 " + (OK + NG) + " 件 / 通った " + OK + " / 落ちた " + NG);
  console.log("════════════════════════════════════════════");
  process.exit(NG ? 1 : 0);
})();
