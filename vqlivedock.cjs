/* ══════════════════════════════════════════════════════════════════════════
   vqlivedock.cjs — Lumi の 4 つの ボタン（マイク・チャット・カメラ・
                    メッセージ表示）が **起動ボタンと 同じ 高さ**に あるか

   訴え（2026-08-20）:
     「モバイルも PC もなんだけど、Lumi の マイク、チャット、カメラ、
       メッセージ表示の 4 つの ボタンの 位置を もう少し 上に して。
       Lumi を 起動するための ボタンくらいの 位置で いい」

   ★ どう 測るか（実 AI は 使わない）
     WebSocket と AudioWorklet を 偽物に 差し替えて 会話を 始め、
     出てきた ボタンの **実際の 座標**を 測る。
     起動ボタン（#vqLiveBtn）は 会話中は 消えるので、
     **計算後の bottom の 値**で 突き合わせる。

   使い方: node vqlivedock.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE || "http://127.0.0.1";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

const ROOT = path.join(__dirname, "client");
const PORT = Number(process.env.VQ_PORT || 8998);
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
const 台紙 = `<!doctype html><meta charset="utf-8"><title>live dock</title><body></body>`;

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
    await new Promise((r) => setTimeout(r, 800));
    return { ws: !!window.__ws, dock: !!document.getElementById("vqLiveDock") };
  });
  ok("会話が 始まって 置き場が できる", 始めた.ws && 始めた.dock, 始めた);

  /* ★ 会話の 履歴は **押して 出すまで 作られない**。
     重なりを 測りたいので、先に 出しておく。 */
  const 履歴出た = await page.evaluate(async () => {
    const b = document.getElementById("vqLiveLogBtn");
    if (b) b.click();
    await new Promise((r) => setTimeout(r, 500));
    const d = document.getElementById("vqLiveLog");
    return !!(d && d.classList.contains("show"));
  });
  ok("会話の 履歴を 出せる", 履歴出た === true, 履歴出た);

  /* ── 測る ─────────────────────────────────────────────────── */
  async function 測る(名) {
    return await page.evaluate(() => {
      const 数 = (v) => { const n = parseFloat(String(v || "").replace("px", "")); return isFinite(n) ? Math.round(n) : null; };
      const d = document.getElementById("vqLiveDock");
      const b = document.getElementById("vqLiveBtn");
      const lg = document.getElementById("vqLiveLog");
      const 中 = d ? Array.from(d.children).filter((el) => {
        const cs = getComputedStyle(el);
        return cs.display !== "none";
      }) : [];
      const r = d ? d.getBoundingClientRect() : null;
      return {
        置き場の下: d ? 数(getComputedStyle(d).bottom) : null,
        置き場の右: d ? 数(getComputedStyle(d).right) : null,
        起動の下: b ? 数(getComputedStyle(b).bottom) : null,
        起動の右: b ? 数(getComputedStyle(b).right) : null,
        履歴の下: lg ? 数(getComputedStyle(lg).bottom) : null,
        置き場の高さ: r ? Math.round(r.height) : 0,
        出ているボタン: 中.map((el) => el.id || el.className).slice(0, 8),
        画面の高さ: window.innerHeight
      };
    });
  }

  節("② PC（1280×860）");
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.waitForTimeout(400);
  const pc = await 測る("pc");
  console.log("     " + JSON.stringify(pc));
  ok("起動ボタンの 高さが 分かる", pc.起動の下 !== null, pc.起動の下);
  ok("★ 4 つの ボタンが 起動ボタンと 同じ 高さ", pc.置き場の下 === pc.起動の下,
    { 置き場: pc.置き場の下, 起動: pc.起動の下 });
  ok("右端も そろっている", pc.置き場の右 === pc.起動の右, { 置き場: pc.置き場の右, 起動: pc.起動の右 });
  ok("前より 上に なっている（14px では ない）", pc.置き場の下 > 60, pc.置き場の下 + "px");
  ok("画面の 中に 収まっている", pc.置き場の下 + pc.置き場の高さ < pc.画面の高さ,
    { 下: pc.置き場の下, 高さ: pc.置き場の高さ, 画面: pc.画面の高さ });
  ok("会話の 履歴と 重ならない", pc.履歴の下 >= pc.置き場の下 + pc.置き場の高さ,
    { 履歴: pc.履歴の下, 置き場: pc.置き場の下 + pc.置き場の高さ });

  節("③ スマホ（390×844）");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const sp = await 測る("sp");
  console.log("     " + JSON.stringify(sp));
  ok("★ 4 つの ボタンが 起動ボタンと 同じ 高さ", sp.置き場の下 === sp.起動の下,
    { 置き場: sp.置き場の下, 起動: sp.起動の下 });
  ok("右端も そろっている", sp.置き場の右 === sp.起動の右, { 置き場: sp.置き場の右, 起動: sp.起動の右 });
  ok("前より 上に なっている（14px では ない）", sp.置き場の下 > 50, sp.置き場の下 + "px");
  ok("画面の 中に 収まっている", sp.置き場の下 + sp.置き場の高さ < sp.画面の高さ,
    { 下: sp.置き場の下, 高さ: sp.置き場の高さ, 画面: sp.画面の高さ });
  ok("会話の 履歴と 重ならない", sp.履歴の下 >= sp.置き場の下 + sp.置き場の高さ,
    { 履歴: sp.履歴の下, 置き場: sp.置き場の下 + sp.置き場の高さ });
  ok("スマホは PC より 少し 下（端末に 合わせている）", sp.置き場の下 < pc.置き場の下,
    { スマホ: sp.置き場の下, PC: pc.置き場の下 });

  節("④ 文字の 帯を 出したとき");
  await page.evaluate(() => { try { window.__vqLive.bar(true); } catch (e) {} });
  await page.waitForTimeout(500);
  const 帯 = await 測る("bar");
  console.log("     " + JSON.stringify(帯));
  const 帯あり = await page.evaluate(() => document.body.classList.contains("vq-live-bar"));
  ok("帯が 出ている", 帯あり === true, 帯あり);
  /* ★ 打っている 間は 声の 道具（4 つ）は 引っ込む（もとから そういう 作り）。
     ここで 見たいのは 「帯の 上に 逃げているか」と 「重なっていないか」。 */
  ok("打っている 間は 4 つは 引っ込む", 帯.出ているボタン.length === 0, 帯.出ているボタン);
  ok("★ 置き場そのものは 帯の ぶん 上へ 逃げている", 帯.置き場の下 > sp.置き場の下,
    { 帯あり: 帯.置き場の下, 帯なし: sp.置き場の下 });
  ok("帯が 出ていても 履歴は その 上", 帯.履歴の下 > 帯.置き場の下,
    { 履歴: 帯.履歴の下, 置き場: 帯.置き場の下 });
  await page.evaluate(() => { try { window.__vqLive.bar(false); } catch (e) {} });

  節("⑤ 例外が 出ていない");
  ok("画面の例外が 0", 赤.length === 0, 赤.slice(0, 3));

  await browser.close(); srv.close();
  console.log("\n════════════════════════════════════════════");
  console.log("  合計 " + (pass + fail) + " 件 / 通った " + pass + " / 落ちた " + fail);
  if (落ち.length) console.log("  落ちたもの:\n   - " + 落ち.join("\n   - "));
  console.log("════════════════════════════════════════════");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("途中で 止まりました: " + (e && e.message ? e.message : e)); process.exit(2); });
