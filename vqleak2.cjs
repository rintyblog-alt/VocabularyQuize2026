/* ══════════════════════════════════════════════════════════════════════════
   vqleak2.cjs — Lumi を **何度も 開いて 閉じて**、残りかすを 数える

   訴え（2026-08-20）:
     「2 回目以降 Lumi を 起動すると、会話が 途中で 切れたり、なんか 重い」

   見かた:
     開く → 閉じる を 3 回 くり返し、
       ・止め忘れた くり返し（setInterval）
       ・外し忘れた 見張り（addEventListener）
       ・作りっぱなしの 音の部品
     が **増え続けていないか** を 数える。
     増えるなら「2 回目以降 重い」は そこ。

   使い方: node vqleak2.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

let pass = 0, fail = 0; const 落ち = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ✅ " + n); }
  else { fail++; 落ち.push(n); console.log("  ❌ " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 400) : "")); }
};
const 節 = (t) => console.log("\n■ " + t);
function 読む(名) {
  const d = path.join(__dirname, process.env.VQ_MIN ? "client/js" : "js-src");
  const f = fs.readdirSync(d).find((x) => new RegExp("^" + 名 + "\\.[0-9a-f]{10}\\.js$").test(x));
  return fs.readFileSync(path.join(d, f), "utf8");
}

(async () => {
  const ライブ = 読む("vq-live"), 束 = 読む("bundle-core");
  const PORT = Number(process.env.VQ_PORT || 8991);
  const srv = http.createServer((q, s) => {
    if (/\.js(\?|$)/.test(q.url || "")) {
      /* 音の部品（worklet）は 中身が 要る。空でも JS として 返す。 */
      s.writeHead(200, { "Content-Type": "text/javascript" });
      return s.end("void 0;");
    }
    s.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    s.end("<!doctype html><meta charset=utf-8><body>");
  });
  await new Promise((r) => srv.listen(PORT, "127.0.0.1", r));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 800 } });
  const 赤 = [];
  page.on("pageerror", (e) => 赤.push(String(e && e.message || e)));
  await page.goto("http://127.0.0.1:" + PORT + "/", { waitUntil: "domcontentloaded" });

  /* ── 数える仕掛けを **読み込む前に** 入れる ── */
  await page.addInitScript(() => {
    window.__数 = { 間: new Set(), 見: new Map(), 音: 0, worklet: 0 };
    const si = window.setInterval, ci = window.clearInterval;
    window.setInterval = function (f, ms) { const id = si.apply(this, arguments); window.__数.間.add(id); return id; };
    window.clearInterval = function (id) { window.__数.間.delete(id); return ci.apply(this, arguments); };
    const 元足 = EventTarget.prototype.addEventListener;
    const 元外 = EventTarget.prototype.removeEventListener;
    const 名 = (t) => (t === document ? "doc" : t === window ? "win" : (t && t.id) ? "#" + t.id : (t && t.tagName) || "?");
    EventTarget.prototype.addEventListener = function (ty, fn, o) {
      try { if (this === document || this === window) {
        const k = 名(this) + ":" + ty;
        window.__数.見.set(k, (window.__数.見.get(k) || 0) + 1);
      } } catch (e) {}
      return 元足.apply(this, arguments);
    };
    EventTarget.prototype.removeEventListener = function (ty, fn, o) {
      try { if (this === document || this === window) {
        const k = 名(this) + ":" + ty;
        if (window.__数.見.has(k)) window.__数.見.set(k, Math.max(0, window.__数.見.get(k) - 1));
      } } catch (e) {}
      return 元外.apply(this, arguments);
    };
  });
  await page.reload({ waitUntil: "domcontentloaded" });

  await page.evaluate(() => {
    localStorage.setItem("app.auth.token.v1", "t");
    class 偽WS {
      constructor(u) { this.url = u; this.readyState = 1; window.__ws = this;
        setTimeout(() => this.onopen && this.onopen(), 0); }
      send(t) { try { const j = JSON.parse(t);
        if (j.setup) setTimeout(() => this.onmessage && this.onmessage({ data: JSON.stringify({ setupComplete: {} }) }), 5);
      } catch (e) {} }
      close() { this.readyState = 3; if (this.onclose) this.onclose({ code: 1000, reason: "" }); }
    }
    window.WebSocket = 偽WS;
    class 偽Node { constructor() { window.__数.worklet++; this.port = { postMessage() {}, onmessage: null }; }
      connect() {} disconnect() {} }
    window.AudioWorkletNode = 偽Node;
    const つ = { connect() { return this; }, disconnect() {} };
    class 偽Ctx {
      constructor() { this.state = "running"; this.sampleRate = 48000; this.currentTime = 0;
        this.destination = Object.assign({}, つ);
        this.audioWorklet = { addModule: () => Promise.resolve() }; }
      createMediaStreamSource() { return Object.assign({}, つ); }
      createGain() { return Object.assign({ gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {},
        exponentialRampToValueAtTime() {}, cancelScheduledValues() {} } }, つ); }
      createBuffer(c, l, s) { return { numberOfChannels: c, length: l, sampleRate: s, duration: l / s,
        getChannelData: () => new Float32Array(l) }; }
      createBufferSource() { window.__数.音++; return Object.assign({ buffer: null, loop: false, start() {}, stop() {} }, つ); }
      createOscillator() { return Object.assign({ frequency: { value: 440, setValueAtTime() {} }, type: "sine", start() {}, stop() {} }, つ); }
      decodeAudioData(b, k) { const buf = this.createBuffer(1, 1024, 48000); if (k) { k(buf); return; } return Promise.resolve(buf); }
      resume() { return Promise.resolve(); } suspend() { return Promise.resolve(); } close() { return Promise.resolve(); }
    }
    window.AudioContext = 偽Ctx; window.webkitAudioContext = 偽Ctx;
    navigator.mediaDevices = navigator.mediaDevices || {};
    navigator.mediaDevices.getUserMedia = () => Promise.resolve({ getTracks: () => [{ readyState: "live", muted: false, stop() {} }] });
    window.fetch = () => Promise.resolve({ ok: true, status: 200,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(64)),
      json: () => Promise.resolve({ token: "t", keyIndex: 0, keyCount: 1, maxMs: 3600000 }) });
  });
  await page.addScriptTag({ content: 束 });
  await page.addScriptTag({ content: ライブ });
  await page.waitForTimeout(200);

  節("① 開く → 閉じる を 3 回");
  const 記 = [];
  for (let i = 1; i <= 3; i++) {
    const r = await page.evaluate(async () => {
      const L = window.__vqLive;
      await L.open();
      for (let k = 0; k < 60 && !window.__ws; k++) await new Promise((x) => setTimeout(x, 50));
      await new Promise((x) => setTimeout(x, 700));
      /* 会話らしいことを 1 往復 */
      window.__ws.onmessage({ data: JSON.stringify({ serverContent: { outputTranscription: { text: "はい。" } } }) });
      window.__ws.onmessage({ data: JSON.stringify({ serverContent: { turnComplete: true } }) });
      await new Promise((x) => setTimeout(x, 400));
      const 中 = { 間: window.__数.間.size, worklet: window.__数.worklet };
      L.close();
      await new Promise((x) => setTimeout(x, 1800));
      const 見 = {}; window.__数.見.forEach((v, k) => { if (v > 0) 見[k] = v; });
      return { 中, 後: { 間: window.__数.間.size, 見, worklet: window.__数.worklet } };
    });
    記.push(r);
    console.log("     " + i + " 回目: 会話中の くり返し " + r.中.間
      + " / 閉じたあと " + r.後.間 + " ／ 音の部品 " + r.後.worklet);
  }
  console.log("     閉じたあとの 見張り: " + JSON.stringify(記[2].後.見));

  ok("★ 閉じたら くり返しが 残らない（1 回目）", 記[0].後.間 <= 2, 記[0].後);
  ok("★★ 2 回目・3 回目で **増えていない**",
     記[2].後.間 <= 記[0].後.間, 記.map((x) => x.後.間));
  ok("★ 会話中の くり返しも 増えない",
     記[2].中.間 <= 記[0].中.間, 記.map((x) => x.中.間));
  const 見張り増 = Object.keys(記[2].後.見).filter((k) => 記[2].後.見[k] > (記[0].後.見[k] || 0));
  ok("★★ 外し忘れた 見張りが 増えていない", 見張り増.length === 0,
     見張り増.map((k) => k + ": " + (記[0].後.見[k] || 0) + " → " + 記[2].後.見[k]));
  ok("音の部品が 増え続けない", 記[2].後.worklet <= 記[0].後.worklet * 3, 記.map((x) => x.後.worklet));

  節("② 閉じたあと **前の打ち込みを 持ち越さない**");
  const 持 = await page.evaluate(async () => {
    const L = window.__vqLive;
    /* 繋がる前に 打つ → 預かりになる */
    window.WebSocket = function () { throw new Error("まだ繋がらない"); };
    L.bar && L.bar(true);
    const 打 = L.打つ ? L.打つ("まえの会話の 打ち込み") : false;
    await new Promise((r) => setTimeout(r, 300));
    L.close();
    await new Promise((r) => setTimeout(r, 1500));
    const 残 = window.__数.間.size;
    /* 繋がるようにして もう一度 開く */
    class 偽WS2 {
      constructor() { this.readyState = 1; window.__ws = this; setTimeout(() => this.onopen && this.onopen(), 0); }
      send(t) { (window.__送った = window.__送った || []).push(t);
        try { const j = JSON.parse(t); if (j.setup) setTimeout(() => this.onmessage &&
          this.onmessage({ data: JSON.stringify({ setupComplete: {} }) }), 5); } catch (e) {} }
      close() { this.readyState = 3; if (this.onclose) this.onclose({ code: 1000 }); }
    }
    window.WebSocket = 偽WS2;
    window.__送った = [];
    await L.open();
    await new Promise((r) => setTimeout(r, 1500));
    const 送 = (window.__送った || []).join("");
    L.close();
    await new Promise((r) => setTimeout(r, 800));
    return { 打, 残, 持ち越した: 送.indexOf("まえの会話") >= 0 };
  });
  console.log("     " + JSON.stringify(持));
  ok("★★ 前の会話の 打ち込みを 次へ 持ち越さない", 持.持ち越した === false, 持);
  ok("★ 閉じたあと くり返しが 残らない（預かり中でも）", 持.残 <= 2, 持);

  節("③ 例外が 出ていない");
  ok("画面の例外が 0（" + 赤.length + "）", 赤.length === 0, 赤.slice(0, 3));

  await browser.close(); srv.close();
  console.log("\n════════════════════════════════════════════");
  console.log("  合計 " + (pass + fail) + " 件 / 通った " + pass + " / 落ちた " + fail);
  if (落ち.length) { console.log("  落ちたもの:"); 落ち.forEach((x) => console.log("   - " + x)); }
  console.log("════════════════════════════════════════════");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("落ちました: " + (e && e.stack || e)); process.exit(1); });
