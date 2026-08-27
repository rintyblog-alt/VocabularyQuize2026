/* ══════════════════════════════════════════════════════════════════════════
   vqlivenoise.cjs — Lumi が **雑音で 割り込まれない**か／
                     それでも **人の声では 割り込める**かを 実際に 動かして 測る

   訴え（2026-08-20）:
     「Lumi が おかしい。なんか ずっと 考えています。とか、
       返答中に 周囲の 雑音や 声を 聞き取ってしまったりして」

   ★ ふたつは つながっていた
     ① 雑音（100ms の 物音）でも 割り込みの 判定を 通っていた
        → マイクが 開き、溜めた 1.2 秒＋2.5 秒を まとめて 送る
        → 向こうが 「人が 話しかけた」と 判じて 自分の 声を 止める（interrupted）
     ② その interrupted の 受け口で **考え中の 帯と 音を 畳んでいなかった**
        → 「考えています」が 45 秒の 打ち切りまで 出っぱなし

   どう 試すか（実 AI は 使わない）:
     WebSocket と AudioWorklet を 偽物に 差し替え、
     マイクの 大きさ（rms）を こちらから 流し込んで、
     **実際の 判断コード**が 開けるか 開けないかを 見る。

   使い方: node vqlivenoise.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE || "http://127.0.0.1";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

const ROOT = path.join(__dirname, "client");
const PORT = Number(process.env.VQ_PORT || 8997);
let pass = 0, fail = 0; const 落ち = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ✅ " + n + (x !== undefined ? "  " + JSON.stringify(x).slice(0, 160) : "")); }
  else { fail++; 落ち.push(n); console.log("  ❌ " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 400) : "")); }
};
const 節 = (t) => console.log("\n■ " + t);

function ライブの中身() {
  const d = path.join(__dirname, "js-src");
  const f = fs.readdirSync(d).find((x) => /^vq-live\.[0-9a-f]{10}\.js$/.test(x));
  if (!f) throw new Error("js-src に vq-live が ありません");
  return fs.readFileSync(path.join(d, f), "utf8");
}
const 台紙 = `<!doctype html><meta charset="utf-8"><title>live noise</title><body></body>`;

(async () => {
  const 中身 = ライブの中身();

  const srv = http.createServer((req, res) => {
    if (req.url === "/" || req.url.startsWith("/?")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(台紙);
    }
    const p = path.join(ROOT, req.url.split("?")[0].replace(/^\//, ""));
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      res.writeHead(200, { "Content-Type": req.url.endsWith(".js") ? "text/javascript" : "text/plain" });
      return res.end(fs.readFileSync(p));
    }
    res.writeHead(404); res.end("");
  });
  await new Promise((r) => srv.listen(PORT, "127.0.0.1", r));

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const 赤 = [];
  page.on("pageerror", (e) => 赤.push(String(e && e.message || e)));
  await page.goto(BASE + ":" + PORT + "/", { waitUntil: "domcontentloaded" });

  await page.evaluate(() => {
    window.__送った = []; window.__worklet = {};
    class 偽WS {
      constructor(u) { this.url = u; this.readyState = 1; window.__ws = this; setTimeout(() => this.onopen && this.onopen(), 0); }
      send(t) {
        try {
          const j = JSON.parse(t);
          if (j.realtimeInput && j.realtimeInput.audio) window.__送った.push(Date.now());
          if (j.setup) setTimeout(() => this.onmessage && this.onmessage({ data: JSON.stringify({ setupComplete: {} }) }), 5);
        } catch (e) {}
      }
      close() { this.readyState = 3; if (this.onclose) this.onclose({ code: 1000 }); }
    }
    window.WebSocket = 偽WS;
    class 偽Node {
      constructor(ctx, 名) {
        this.名 = 名;
        this.port = { postMessage: (m) => { (window.__worklet[名] = window.__worklet[名] || []).push(m); }, onmessage: null };
        window.__worklet["node:" + 名] = this;
      }
      connect() {} disconnect() {}
    }
    window.AudioWorkletNode = 偽Node;
    const つなぎ = { connect() { return this; }, disconnect() {} };
    class 偽Ctx {
      constructor() {
        this.state = "running"; this.sampleRate = 48000; this.currentTime = 0;
        this.destination = Object.assign({}, つなぎ);
        this.audioWorklet = { addModule: () => Promise.resolve() };
      }
      createMediaStreamSource() { return Object.assign({}, つなぎ); }
      createGain() { return Object.assign({ gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {}, exponentialRampToValueAtTime() {} } }, つなぎ); }
      createBuffer(ch, len, sr) { return { numberOfChannels: ch, length: len, sampleRate: sr, duration: len / sr, getChannelData: () => new Float32Array(len) }; }
      createBufferSource() { return Object.assign({ buffer: null, loop: false, playbackRate: { value: 1 }, start() {}, stop() {}, onended: null }, つなぎ); }
      createOscillator() { return Object.assign({ frequency: { value: 440, setValueAtTime() {} }, type: "sine", start() {}, stop() {} }, つなぎ); }
      createAnalyser() { return Object.assign({ fftSize: 2048, frequencyBinCount: 1024, getByteFrequencyData() {}, getFloatTimeDomainData() {} }, つなぎ); }
      createDynamicsCompressor() { return Object.assign({}, つなぎ); }
      createStereoPanner() { return Object.assign({ pan: { value: 0 } }, つなぎ); }
      createMediaStreamDestination() { return Object.assign({ stream: { getTracks: () => [] } }, つなぎ); }
      decodeAudioData(b, ok2) { const buf = this.createBuffer(1, 1024, 48000); if (ok2) { ok2(buf); return; } return Promise.resolve(buf); }
      resume() { this.state = "running"; return Promise.resolve(); }
      suspend() { return Promise.resolve(); }
      close() { this.state = "closed"; return Promise.resolve(); }
    }
    window.AudioContext = 偽Ctx; window.webkitAudioContext = 偽Ctx;
    navigator.mediaDevices = navigator.mediaDevices || {};
    navigator.mediaDevices.getUserMedia = () => Promise.resolve({ getTracks: () => [{ readyState: "live", muted: false, stop() {} }] });
    localStorage.setItem("app.auth.token.v1", "test-token-0123456789abcdef");
    window.fetch = () => Promise.resolve({ ok: true, status: 200,
      json: () => Promise.resolve({ token: "t", keyIndex: 0, keyCount: 1, maxMs: 3600000 }) });

    /* ── 手つだい ────────────────────────────────────────── */
    window.__無音 = btoa(String.fromCharCode.apply(null, new Uint8Array(3200)));
    window.__喋らせる = function () {
      window.__ws.onmessage({ data: JSON.stringify({ serverContent: {
        modelTurn: { parts: [{ inlineData: { mimeType: "audio/pcm;rate=24000", data: window.__無音 } }] } } }) });
    };
    window.__遮られた = function () {
      window.__ws.onmessage({ data: JSON.stringify({ serverContent: { interrupted: true } }) });
    };
    /* マイクの 大きさを n 回 流す（100ms ごと ＝ 本物と 同じ 間隔） */
    window.__流す = async function (rms, 回, muted) {
      const node = window.__worklet["node:vq-mic-down"];
      for (let i = 0; i < 回; i++) {
        node.port.onmessage({ data: { type: "level", rms: rms, muted: muted !== false } });
        await new Promise((r) => setTimeout(r, 100));
      }
    };
    window.__開いた回数 = function () {
      return (window.__worklet["vq-mic-down"] || [])
        .filter((m) => m && m.type === "mute" && m.on === false).length;
    };
  });

  await page.addScriptTag({ content: 中身 });
  await page.waitForTimeout(300);

  節("① 立ち上がる");
  ok("vq-live が 立ち上がる", await page.evaluate(() => !!window.__vqLive));

  const 始めた = await page.evaluate(async () => {
    const L = window.__vqLive;
    await L.open();
    for (let i = 0; i < 60 && !window.__ws; i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 500));
    const node = window.__worklet["node:vq-mic-down"];
    return { ws: !!window.__ws, 受け口: !!(node && node.port.onmessage) };
  });
  ok("繋がって マイクの 受け口が 付く", 始めた.ws && 始めた.受け口, 始めた);

  /* ══ ② 物音（100ms だけ）では 割り込まない ═══════════════════ */
  節("② 物音（0.05 が 100ms だけ）では 割り込まない");
  const 物音 = await page.evaluate(async () => {
    const L = window.__vqLive;
    window.__喋らせる();
    await new Promise((r) => setTimeout(r, 400));      /* 鳴り始めから 150ms を 越えさせる */
    const 前 = window.__開いた回数();
    await window.__流す(0.05, 1);                       /* 1 かたまり ＝ 100ms */
    await window.__流す(0.001, 6);                      /* すぐ 静かに なる */
    await new Promise((r) => setTimeout(r, 300));
    return { 前, 後: window.__開いた回数(), 様子: L.state().送り口 };
  });
  ok("100ms の 物音では マイクを 開けない", 物音.後 === 物音.前,
    { 前: 物音.前, 後: 物音.後, 続いた数: 物音.様子.続いた数 });

  /* ══ ③ 人の ひと言（200ms 続く）では 割り込む ═══════════════ */
  節("③ 人の ひと言（0.05 が 200ms 続く）では 割り込む");
  const ひと言 = await page.evaluate(async () => {
    const L = window.__vqLive;
    await new Promise((r) => setTimeout(r, 2200));     /* 試す 間隔（1.8 秒）を あける */
    window.__喋らせる();
    await new Promise((r) => setTimeout(r, 400));
    const 前 = window.__開いた回数();
    await window.__流す(0.05, 3);                       /* 300ms 続く */
    await new Promise((r) => setTimeout(r, 300));
    return { 前, 後: window.__開いた回数(), 様子: L.state().送り口 };
  });
  ok("200ms 続いたら マイクを 開ける", ひと言.後 > ひと言.前,
    { 前: ひと言.前, 後: ひと言.後 });

  /* ══ ④ とびきり 大きい 1 回では すぐ 割り込む ═══════════════ */
  節("④ とびきり 大きい 1 回（0.09）では すぐ 割り込む");
  const とびきり = await page.evaluate(async () => {
    const L = window.__vqLive;
    await new Promise((r) => setTimeout(r, 3200));
    window.__喋らせる();
    await new Promise((r) => setTimeout(r, 400));
    const 前 = window.__開いた回数();
    await window.__流す(0.09, 1);                       /* 1 かたまり だけ */
    await new Promise((r) => setTimeout(r, 300));
    return { 前, 後: window.__開いた回数(), 線: L.state().送り口.いまの線 };
  });
  ok("はっきり 言えば 100ms でも 開ける", とびきり.後 > とびきり.前,
    { 前: とびきり.前, 後: とびきり.後, 線: とびきり.線 });

  /* ══ ⑤ うるさい 部屋では 線が 上がる ═══════════════════════ */
  節("⑤ うるさい 部屋（0.03 が ずっと 鳴っている）");
  const うるさい = await page.evaluate(async () => {
    const L = window.__vqLive;
    /* Lumi が 黙っている 間に 部屋の 静けさを 学ばせる（muted:false） */
    await window.__流す(0.03, 25, false);
    const 学んだ = L.state().送り口;
    await new Promise((r) => setTimeout(r, 2200));
    window.__喋らせる();
    await new Promise((r) => setTimeout(r, 400));
    const 前 = window.__開いた回数();
    await window.__流す(0.05, 3);                       /* 同じ 0.05 でも 今度は 通らないはず */
    await new Promise((r) => setTimeout(r, 300));
    const 中 = window.__開いた回数();
    await new Promise((r) => setTimeout(r, 2400));
    window.__喋らせる();
    await new Promise((r) => setTimeout(r, 400));
    await window.__流す(0.14, 3);                       /* はっきり 大きい 声なら 通る */
    await new Promise((r) => setTimeout(r, 300));
    return { 学んだ, 前, 中, 後: window.__開いた回数(), 様子: L.state().送り口 };
  });
  ok("部屋の 静けさを 覚えている", (うるさい.学んだ.部屋の静けさ || 0) > 0.01,
    { 部屋: うるさい.学んだ.部屋の静けさ, 線: うるさい.学んだ.部屋から作った線 });
  ok("うるさい 部屋では 0.05 では 開かない", うるさい.中 === うるさい.前,
    { 前: うるさい.前, 中: うるさい.中, 線: うるさい.様子.いまの線 });
  ok("それでも 大きい 声（0.14）では 開く", うるさい.後 > うるさい.中,
    { 中: うるさい.中, 後: うるさい.後 });
  ok("線を 上げすぎない（0.06 まで）", (うるさい.様子.部屋から作った線 || 0) <= 0.061,
    うるさい.様子.部屋から作った線);

  /* ══ ⑥ 静かな 部屋では これまでどおり 効く ═══════════════════ */
  節("⑥ 静かな 部屋（0.002）では これまでどおり");
  const 静か = await page.evaluate(async () => {
    const L = window.__vqLive;
    await window.__流す(0.002, 40, false);              /* 静けさを 学び直す */
    const 学んだ = L.state().送り口;
    await new Promise((r) => setTimeout(r, 2200));
    window.__喋らせる();
    await new Promise((r) => setTimeout(r, 400));
    const 前 = window.__開いた回数();
    const 途中 = [];
    for (let i = 0; i < 4; i++) {
      await window.__流す(0.04, 1);
      const q = L.state().送り口;
      途中.push({ 線: q.いまの線, 続: q.続いた数, 開: window.__開いた回数(), 空: q.空振り, 漏: q.回り込み, 窓: q.底の窓 });
    }
    await new Promise((r) => setTimeout(r, 300));
    return { 学んだ, 前, 後: window.__開いた回数(), 途中, 様子: L.state().送り口 };
  });
  ok("静かな 部屋なら 線は 感度のまま",
    (静か.学んだ.部屋から作った線 || 0) < (静か.学んだ.素の感度 || 0.026),
    { 部屋から作った線: 静か.学んだ.部屋から作った線, 素の感度: 静か.学んだ.素の感度 });
  console.log("     " + JSON.stringify(静か.途中));
  ok("小さめの 声（0.04）でも 開く", 静か.後 > 静か.前, { 前: 静か.前, 後: 静か.後 });

  /* ══ ⑦ 遮られたら 考え中を 畳む（いちばんの 訴え）═══════════ */
  節("⑦ 遮られたら 「考えています」の 帯と 音が 畳まれる");
  /* ★ 作り物では なく **人が 打つのと 同じ道**（__vqLive.打つ）を 通す。
     ここを 通ると 作業開始("考えています") と st.thinking が 立つ。 */
  const 遮り結果 = await page.evaluate(async () => {
    const L = window.__vqLive;
    const 打てた = L.打つ("こんにちは");
    await new Promise((r) => setTimeout(r, 500));
    const 前 = L.作業();
    window.__遮られた();
    await new Promise((r) => setTimeout(r, 500));
    return { 打てた, 前, 後: L.作業() };
  });
  console.log("     " + JSON.stringify(遮り結果));
  ok("文字の 帯から 実際に 送れる", 遮り結果.打てた === true, 遮り結果.打てた);
  ok("遮られる前は 「考えています」が 立っている",
    !!(遮り結果.前 && 遮り結果.前.考え中 && 遮り結果.前.workN > 0), 遮り結果.前);
  ok("★ 遮られたら 考え中の 印が 落ちる",
    !!(遮り結果.後 && !遮り結果.後.考え中), 遮り結果.後);
  ok("★ 遮られたら 作業の数も 0 に 戻る",
    !!(遮り結果.後 && (遮り結果.後.workN || 0) === 0), 遮り結果.後);
  ok("★ 遮られたら 考え中の 音も 止まる",
    !!(遮り結果.後 && !遮り結果.後.鳴っている), 遮り結果.後);

  /* ══ ⑧ 自分の 声の 回り込み（スピーカー漏れ）では 開かない ═══════
     ★ 見積りは 「直近 4 秒の 底」なので、鳴り始めの 数秒は まだ 育っていない。
       ここで 見たいのは **見積りが 育ったあと、鳴りっぱなしの 漏れで
       開き続けないか**。だから 先に 4 秒ぶん 流してから 数える。 */
  節("⑧ 自分の 声の 回り込み（0.05 が 鳴りっぱなし）では 開き続けない");
  const 漏れ = await page.evaluate(async () => {
    const L = window.__vqLive;
    await new Promise((r) => setTimeout(r, 2400));
    window.__喋らせる();
    await new Promise((r) => setTimeout(r, 400));
    /* ★ ふつうの 返事は 音が **次々 届く**。ここでも そう する
       （届かなくなると 「詰まっている」と 判じられるのが 正しい 動き）。 */
    for (let i = 0; i < 9; i++) { window.__喋らせる(); await window.__流す(0.05, 5); }
    const q1 = L.state().送り口;
    const 途中 = window.__開いた回数();
    const 詰1 = q1.詰まりを外した回数;
    for (let i = 0; i < 6; i++) { window.__喋らせる(); await window.__流す(0.05, 5); }
    const q2 = L.state().送り口;
    return { 途中, 後: window.__開いた回数(), 詰1, 詰2: q2.詰まりを外した回数,
             漏れの見積り: q2.回り込み, 線: q2.いまの線, 見張りの線: q2.素の感度 };
  });
  console.log("     " + JSON.stringify(漏れ));
  ok("鳴りっぱなしの 漏れを 見積もれている", (漏れ.漏れの見積り || 0) >= 0.04,
    { 見積り: 漏れ.漏れの見積り, 線: 漏れ.線 });
  ok("★ 見積りが 育ったら、漏れでは もう 開かない（自分の声で 止まらない）",
    漏れ.後 === 漏れ.途中, { 途中: 漏れ.途中, 後: 漏れ.後 });
  ok("★ 見張り（塞ぎ外し）も 漏れでは 動かない",
    漏れ.詰2 === 漏れ.詰1, { 前: 漏れ.詰1, 後: 漏れ.詰2 });

  節("⑧ 例外が 出ていない");
  ok("画面の例外が 0", 赤.length === 0, 赤.slice(0, 3));

  await browser.close(); srv.close();
  console.log("\n════════════════════════════════════════════");
  console.log("  合計 " + (pass + fail) + " 件 / 通った " + pass + " / 落ちた " + fail);
  if (落ち.length) console.log("  落ちたもの:\n   - " + 落ち.join("\n   - "));
  console.log("════════════════════════════════════════════");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("途中で 止まりました: " + (e && e.message ? e.message : e)); process.exit(2); });
