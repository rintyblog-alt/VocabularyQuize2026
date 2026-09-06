#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqlisten.cjs — リスニングの 音（2026-09-02・訴え）

   訴え:「リスニングの 音が **モバイルだと 再生できない**。」

   真因（読んで 突き止めた）:
     問題の 音声には 2 つの 道が ある。
       ・原稿を 読み上げる 道 … VQ2.tts.playQuestion → **1 つの 器**（2026-08-28 に 直した）
       ・音声ファイルの 道   … playSrc が **その場で new Audio(src)** ← ここ
     iPhone / スマホの Chrome は「さわった その流れで play() を 呼んだ 器」
     しか 鳴らさない。作り直すと 断られる。
     しかも `p.catch(function () {})` で **黙って いた** ので、
     押しても 何も 起きず、理由も 出なかった。

   ★ Playwright では iOS の 決まりを 再現できない（既知）。
     だから「**新しい 器を 作って いない**」ことを 数えて 見る。
     器を 作らなければ、鍵の 開いた 器が 使われる。

   使い方: node vqlisten.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const { chromium, webkit } = require("playwright");
let ok = 0, ng = 0; const 落 = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (c, t, d) => { if (c) { ok++; console.log("  ok   " + t + (d !== undefined ? "  → " + JSON.stringify(d).slice(0, 200) : "")); }
  else { ng++; 落.push(t); console.log("  NG   " + t + (d !== undefined ? "  → " + JSON.stringify(d).slice(0, 300) : "")); } };
const 待 = (m) => new Promise(s => setTimeout(s, m));

/* 器の 数を 数える。**読み込みより 先に** 仕掛ける。 */
const 数える仕掛け = () => {
  window.__作った = [];
  const 元 = window.Audio;
  window.Audio = function (...a) { window.__作った.push(String(a[0] || "")); return new 元(...a); };
  window.Audio.prototype = 元.prototype;
  const 元CE = Document.prototype.createElement;
  Document.prototype.createElement = function (t, ...r) {
    if (String(t).toLowerCase() === "audio") window.__作った.push("createElement");
    return 元CE.call(this, t, ...r);
  };
};

async function 一台(browserType, 名, 幅, 高, 携) {
  const b = await browserType.launch();
  const ctx = await b.newContext({ viewport: { width: 幅, height: 高 }, isMobile: 携 && browserType === chromium, hasTouch: 携 });
  await ctx.addInitScript(数える仕掛け);
  await ctx.addInitScript(() => { try {
    localStorage.setItem("vq.install.hide.v1", "1");
    localStorage.setItem("vq.newauth.introSeen.v1", "1");
  } catch (e) {} });
  const pg = await ctx.newPage();
  const 例外 = []; pg.on("pageerror", e => 例外.push(String(e).slice(0, 140)));
  /* 音は 本物を 取りに 行かない。短い WAV を 返す。 */
  await pg.route("**/vqtest-audio.wav", r => r.fulfill({ status: 200, contentType: "audio/wav",
    body: Buffer.from("UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=", "base64") }));
  await pg.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => window.VQ2 && window.VQ2.qrender && window.VQ2.tts, null, { timeout: 30000 });
  await 待(2500);
  return { b, pg, 例外, 名 };
}

/* リスニング問題（音声ファイル）を 1 問 描いて、再生ボタンを 押す。 */
const 舞台 = (pg, src) => pg.evaluate((src) => {
  const q = {
    id: "L1", engine: "audio_choice", type: "audio_choice",
    prompt: "音声を聞いて答えましょう。",
    media: [{ kind: "audio", src: src }],
    settings: { replayLimit: 2, playbackRate: 1 },
    choices: [{ id: "a", text: "りんご", isCorrect: true }, { id: "b", text: "みかん" }]
  };
  let host = document.getElementById("vqtest-stage");
  if (host) host.remove();
  host = document.createElement("div");
  host.id = "vqtest-stage";
  host.style.cssText = "position:fixed;left:0;top:0;width:520px;z-index:2147483647;background:#fff";
  document.body.appendChild(host);
  host.innerHTML = window.VQ2.qrender.html(q, null, {});
  const opts = { replayCount: 0 };
  window.__opts = opts;
  /* bind は **位置引数**（container, question, value, opts）。 */
  window.VQ2.qrender.bind(host, q, null, Object.assign(opts, {
    onChange: function () {}, onLocalState: function (s) { Object.assign(opts, s); }
  }));
  window.__作った.length = 0;              /* 描くまでの ぶんは 数えない */
  return { 箱: !!host.querySelector(".vq2-audio"),
           src: (host.querySelector(".vq2-audio") || {}).getAttribute
             ? host.querySelector(".vq2-audio").getAttribute("data-audio-src") : "",
           形: host.querySelector(".vq2-audio") ? host.querySelector(".vq2-audio").getAttribute("data-audio-mode") : "" };
}, src);

const 見る = (pg) => pg.evaluate(() => {
  const box = document.querySelector("#vqtest-stage .vq2-audio");
  return { 作った: window.__作った.slice(),
           説明: (box.querySelector(".vq2-audio-meta") || {}).textContent || "",
           押せる: !(box.querySelector('[data-act="qr-audio-play"]') || {}).disabled,
           回数: window.__opts.replayCount,
           帯: (box.querySelector(".vq2-audio-fill") || {}).style.width };
});

(async () => {
  節("① 口が ある");
  let { b, pg, 例外 } = await 一台(chromium, "Chrome", 390, 844, true);
  const 口 = await pg.evaluate(() => ({
    playUrl: typeof window.VQ2.tts.playUrl === "function",
    play: typeof window.VQ2.tts.play === "function" }));
  見(口.playUrl, "★★ **住所を そのまま 鳴らす 口（playUrl）が ある**", 口);

  節("② スマホ（Chrome 390）— 音声ファイルの リスニング");
  const 台 = await 舞台(pg, "/vqtest-audio.wav");
  見(台.箱, "再生ボタンの 箱が 出る", 台);
  見(台.形 !== "script", "★ 音声ファイルの 道（原稿では ない）", 台.形);
  /* 1 回目。器は **この 1 回だけ** 作られる（鍵を開ける が 最初の さわりで 用意する）。 */
  await pg.evaluate(() => document.querySelector('#vqtest-stage [data-act="qr-audio-play"]').click());
  await 待(2200);
  const r1 = await 見る(pg);
  見(r1.作った.length <= 1, "★ 器は 多くても 1 つだけ 作る", r1.作った);
  見(r1.回数 === 1, "★ 鳴った 回だけ 数える", r1.回数);
  見(!/再生できません|見つかりません/.test(r1.説明), "★ 断りが 出ていない", r1.説明);

  /* ★ ここが 本番。2 回目は **1 つも 作らない**＝ 鍵の 開いた 器を 使い回す。
     直す前は 押すたび new Audio(src) を 作って いた（＝ 毎回 1 つ 増える）。 */
  await pg.evaluate(() => { window.__作った.length = 0; });
  await pg.evaluate(() => document.querySelector('#vqtest-stage [data-act="qr-audio-play"]').click());
  await 待(2200);
  const r1b = await 見る(pg);
  見(r1b.作った.length === 0,
    "★★ **2 回目は 器を 作らない**（鍵の 開いた 器で 鳴らす）", r1b.作った);
  見(r1b.回数 === 2, "★ 2 回 数える", r1b.回数);

  節("③ 鳴らせない ときは **黙らない**");
  await 舞台(pg, "/vqtest-missing.wav");
  await pg.route("**/vqtest-missing.wav", r => r.fulfill({ status: 404, body: "" }));
  await pg.evaluate(() => document.querySelector('#vqtest-stage [data-act="qr-audio-play"]').click());
  await 待(2500);
  const r2 = await 見る(pg);
  見(/再生できません|音の形/.test(r2.説明),
    "★★ **理由が 画面に 出る**（黙って 何も 起きない を やめる）", r2.説明);
  見(r2.押せる, "★ 押し直せる（回数を 減らさない）", { 押せる: r2.押せる, 回数: r2.回数 });
  見(r2.回数 === 0, "★★ **鳴らなかった 回は 数えない**", r2.回数);

  節("④ 選択肢ごとの 音声も 同じ 器");
  await pg.evaluate(() => {
    const q = { id: "L2", engine: "audio_choice", type: "audio_choice", prompt: "どれ？",
      choices: [{ id: "a", text: "A", audio: "/vqtest-audio.wav", isCorrect: true }, { id: "b", text: "B" }] };
    const host = document.getElementById("vqtest-stage");
    host.innerHTML = window.VQ2.qrender.html(q, null, {});
    window.VQ2.qrender.bind(host, q, null, { onChange: function () {}, onLocalState: function () {} });
    window.__作った.length = 0;
  });
  const 玉 = await pg.evaluate(() => {
    const el = document.querySelector('#vqtest-stage [data-act="qr-choice-audio"]');
    if (!el) return null; el.click(); return true;
  });
  await 待(1800);
  const r3 = await pg.evaluate(() => window.__作った.slice());
  見(玉 === null || r3.length === 0,
    "★★ **選択肢の 音声でも 器を 作らない**", { 玉: 玉, 作った: r3 });

  見(例外.length === 0, "例外 0 件", 例外.slice(0, 3));
  await b.close();

  /* ── ⑤ Safari（WebKit）でも 同じ ── */
  節("⑤ Safari（WebKit・iPhone の 大きさ）");
  ({ b, pg, 例外 } = await 一台(webkit, "Safari", 390, 844, true));
  const w口 = await pg.evaluate(() => typeof window.VQ2.tts.playUrl === "function");
  見(w口, "★ playUrl が ある");
  const w台 = await 舞台(pg, "/vqtest-audio.wav");
  見(w台.箱, "再生ボタンの 箱が 出る", w台.形);
  await pg.evaluate(() => document.querySelector('#vqtest-stage [data-act="qr-audio-play"]').click());
  await 待(2500);
  await pg.evaluate(() => { window.__作った.length = 0; });
  await pg.evaluate(() => document.querySelector('#vqtest-stage [data-act="qr-audio-play"]').click());
  await 待(2500);
  const w1 = await 見る(pg);
  見(w1.作った.length === 0, "★★ **Safari でも（2 回目に）器を 作らない**", w1.作った);
  見(例外.length === 0, "例外 0 件", 例外.slice(0, 3));
  await b.close();

  console.log("\n" + "─".repeat(32) + "\n  ok " + ok + " / NG " + ng);
  if (ng) { console.log("  落ちた: " + 落.join(" / ")); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
