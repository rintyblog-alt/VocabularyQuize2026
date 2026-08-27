/* ══════════════════════════════════════════════════════════════════════════
   vqlivestuck.cjs — Lumi の「聞こえていない」を **実際に動かして** 確かめる

   訴え（2026-08-19）:
     ① 繋ぎ直しのあと、こちらから 問いかけても **無反応**になる
     ② 普通に会話していても、たまに 1 回 反応せず、
        「え？」「ん？」と言うと「あーごめんごめん」と返る
     どちらも **こちらの声が 送られていない**という 1 つの話。

   なぜ この試験が 要るか:
     送り口には 塞ぐ印が 4 つ ある（speaking / 先出し中 / jingleOn / barOn）。
     どれかが 立ちっぱなしになると 完全に 無反応になるが、
     いままでの 見張り（watchMic）は **マイクが動いているか**しか 見ていない。
     だから「マイクは元気、でも 一言も 届いていない」に 誰も 気づけなかった。

   どう 試すか（実 AI は 使わない）:
     ・WebSocket と AudioWorklet を 偽物に 差し替える
     ・マイクの level（音の大きさ）を こちらから 流し込む
     ・**realtimeInput が 実際に 送られたか**を 数える
     これで 実際の判断コードを そのまま 動かせる。

   使い方: node vqlivestuck.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE || "http://127.0.0.1";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

const ROOT = path.join(__dirname, "client");
const PORT = Number(process.env.VQ_PORT || 8996);
let pass = 0, fail = 0; const 落ち = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ✅ " + n); }
  else { fail++; 落ち.push(n); console.log("  ❌ " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 400) : "")); }
};
const 節 = (t) => console.log("\n■ " + t);

/* ── 圧縮前の vq-live を そのまま 読む（中身を 検査したいので）───────── */
function ライブの中身() {
  const d = path.join(__dirname, "js-src");
  const f = fs.readdirSync(d).find((x) => /^vq-live\.[0-9a-f]{10}\.js$/.test(x));
  if (!f) throw new Error("js-src に vq-live が ありません");
  return fs.readFileSync(path.join(d, f), "utf8");
}

const 台紙 = `<!doctype html><meta charset="utf-8"><title>live stuck</title><body></body>`;

(async () => {
  const 中身 = ライブの中身();

  /* ── まず コードを 読むだけで 分かることを 確かめる ───────────── */
  節("① 直したところが コードに 入っているか");
  ok("割り込みの 待ち時間が 150ms（前は 800ms）", /鳴り始めから > 150/.test(中身));
  /* ★ 2026-08-20 に 見直した。1 かたまり（100ms）だと 物音や となりの 声でも
     通ってしまった（訴え「返答中に 周囲の 雑音や 声を 聞き取ってしまう」）。
     2 かたまり（200ms）続くか、とびきり 大きい 1 回。
     2026-08-19 の 前（3 かたまり＋800ms 待ち）より ずっと 速い。 */
  ok("2 かたまり か とびきり 大きい 1 回で 割り込む",
     /var 要る = 2 \+ Math\.min\(2, st\.probeNg/.test(中身)
     && /st\.bargeN >= 要る \|\| とびきり/.test(中身));
  ok("とびきり の 目安が ある（線の 2.5 倍）", /とびきり = rms > 線 \* 2\.5/.test(中身));
  ok("部屋の 静けさを 線に 足している", /部屋の線/.test(中身) && /st\.部屋/.test(中身));
  ok("遮られたら 考え中の 帯と 音を 畳む",
     /if \(sc\.interrupted\)[\s\S]{0,1400}?st\.thinking = false/.test(中身));
  ok("道具は どの道を 通っても 締める", /必ず締める/.test(中身));
  ok("見張りは ふつうの 返事では 動かない", /本当に詰まり/.test(中身));
  ok("回り込みは 番を またいで 覚える", /st\.漏れ窓/.test(中身) && /function 底\(/.test(中身));
  ok("空振り 3 回での 打ち切りが 無い", !/\(st\.probeNg \|\| 0\) < 3/.test(中身));
  ok("まだ 喋っていれば 見きわめを 延ばす", /probeExt/.test(中身));
  ok("短い ひと言も 拾う（3 かたまりで 本物）", /st\.probeHit >= 3/.test(中身));
  ok("送れた時刻を 残している", /st\.sentAt = Date\.now\(\)/.test(中身));
  ok("詰まりの 見張りが ある", /塞ぎを 外す/.test(中身));
  ok("繋ぎ直しで 回り込みの見積りを 捨てる", /st\.echo = undefined/.test(中身));
  ok("繋ぎ直しの 巡（あきらめない）が ある", /st\.巡/.test(中身));
  ok("strict で 落ちる arguments.callee が 無い",
     !/arguments\.callee\s*[,)]/.test(中身));
  ok("見張りが 自分を 止めない（clearInterval で 諦めない）",
     !/clearInterval\(st\.iMic\);\s*\n\s*say\("マイクの音が届きません。アプリを開き直/.test(中身));

  /* ── 実際に 動かす ───────────────────────────────────────── */
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
  if (process.env.VQ_DEBUG) page.on("console", (m) => console.log("    [画面] " + m.text().slice(0, 200)));
  await page.goto(BASE + ":" + PORT + "/", { waitUntil: "domcontentloaded" });

  /* 偽の音まわりを 先に 置いてから vq-live を 読ませる */
  await page.evaluate(() => {
    window.__送った = [];
    window.__worklet = {};
    class 偽WS {
      constructor(u) { this.url = u; this.readyState = 1; window.__ws = this; setTimeout(() => this.onopen && this.onopen(), 0); }
      send(t) {
        try {
          const j = JSON.parse(t);
          if (j.realtimeInput && j.realtimeInput.audio) window.__送った.push(Date.now());
          /* ★ setup を 受けたら setupComplete を 返す。
             これが 無いと 実装の ready が 一生 false のままで、
             マイクの音は 1 かたまりも 送られない（＝何も 試せない）。 */
          if (j.setup) setTimeout(() => this.onmessage && this.onmessage({ data: JSON.stringify({ setupComplete: {} }) }), 5);
        } catch (e) {}
      }
      close() { this.readyState = 3; if (this.onclose) this.onclose({ code: 1000 }); }
    }
    window.WebSocket = 偽WS;
    class 偽Node {
      constructor(ctx, 名) { this.名 = 名; this.port = { postMessage: (m) => { (window.__worklet[名] = window.__worklet[名] || []).push(m); }, onmessage: null }; window.__worklet["node:" + 名] = this; }
      connect() {} disconnect() {}
    }
    window.AudioWorkletNode = 偽Node;
    /* ★ 実装は ensureCtx の中で keepAlive() を 呼び、
       createBuffer / createBufferSource を 使う。用意していないと
       try の中で 落ちて st.ctx が null になり、**会話が 始まらない**。 */
    const つなぎ = { connect() { return this; }, disconnect() {} };
    class 偽Ctx {
      constructor() {
        this.state = "running"; this.sampleRate = 48000; this.currentTime = 0;
        this.destination = Object.assign({}, つなぎ);
        this.audioWorklet = { addModule: () => Promise.resolve() };
      }
      createMediaStreamSource() { return Object.assign({}, つなぎ); }
      createGain() { return Object.assign({ gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {} } }, つなぎ); }
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
    navigator.mediaDevices.getUserMedia = () => Promise.resolve({
      getTracks: () => [{ readyState: "live", muted: false, stop() {} }]
    });
    /* ★ 実装は「ログインしているか」を app.auth.token.v1 で 見ている。
       置かないと 出してよい場面か() が false になり、会話が 始まらない。 */
    localStorage.setItem("app.auth.token.v1", "test-token-0123456789abcdef");
    window.fetch = () => Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({ token: "t", keyIndex: 0, keyCount: 1, maxMs: 3600000 })
    });
  });

  await page.addScriptTag({ content: 中身 });
  await page.waitForTimeout(300);

  const 下調べ = await page.evaluate(() => {
    var r = { AudioContext: typeof window.AudioContext, 作れた: false, だめ: "" };
    try { var c = new window.AudioContext();
      var b = c.createBuffer(1,1,c.sampleRate); var sc = c.createBufferSource();
      sc.buffer=b; sc.loop=true; var g=c.createGain(); g.gain.value=0;
      sc.connect(g); g.connect(c.destination); sc.start(0); r.作れた=true;
    } catch(e){ r.だめ = String(e && e.message || e); }
    r.場面 = (function(){ try { return !!(window.__vqLive); } catch(e){ return "?"; } })();
    return r;
  });
  console.log("    下調べ:", JSON.stringify(下調べ));
  const 立った = await page.evaluate(() => !!window.__vqLive);
  節("② 偽の音まわりで 実際に 立ち上がるか");
  ok("vq-live が 立ち上がる", 立った);
  if (!立った) {
    await browser.close(); srv.close();
    console.log("\n★ 立ち上がらないので ここで 止めます"); process.exit(1);
  }

  /* 会話を 始めて、マイクの level を こちらから 流す */
  節("③ 送り口が 塞がったとき 自分で 開くか");
  /* ★ わざと 印を 立てるのではなく、**本物の道**で 塞ぐ。
     偽の WebSocket から 音の返事を 流し込むと、実装が setMuted(true) を
     呼んで st.speaking が 立つ。そのうえで 話しかける。 */
  const 結果 = await page.evaluate(async () => {
    const L = window.__vqLive;
    try { await L.open(); } catch (e) { return { だめ: "open で 落ちた: " + (e && e.message) }; }
    for (let i = 0; i < 60 && !window.__ws; i++) await new Promise((r) => setTimeout(r, 50));
    if (!window.__ws) return { だめ: "つながらなかった", 様子: (L.state && L.state()) || null };
    await new Promise((r) => setTimeout(r, 500));
    const node = window.__worklet["node:vq-mic-down"];
    if (!node || !node.port.onmessage) return { だめ: "マイクの受け口が 付いていない" };

    /* Lumi が 喋り出した ことにする（本物の受け取り口を 通す） */
    const 無音 = btoa(String.fromCharCode.apply(null, new Uint8Array(3200)));
    window.__ws.onmessage({ data: JSON.stringify({ serverContent: {
      modelTurn: { parts: [{ inlineData: { mimeType: "audio/pcm;rate=24000", data: 無音 } }] } } }) });
    await new Promise((r) => setTimeout(r, 200));
    const 様子1 = L.state();

    /* **喋っている最中に 話しかける**（ここが 訴えの場面）。
       さらに 送り口が 詰まった状態を 作るため、送れた時刻を 古くしておく。 */
    const 記録 = () => (window.__worklet["vq-mic-down"] || []).slice();
    const 前 = window.__送った.length;
    const 前の記録 = 記録().length;

    /* 1.6 秒 話し続ける（100ms ごとに 音の大きさと 実際の音） */
    for (let i = 0; i < 40; i++) {
      node.port.onmessage({ data: { type: "level", rms: 0.09, muted: true } });
      node.port.onmessage({ data: new ArrayBuffer(640) });
      await new Promise((r) => setTimeout(r, 40));
    }
    const 後 = window.__送った.length;
    const 命令 = 記録().slice(前の記録);
    return {
      送れた: 後 - 前,
      様子1: 様子1.送り口, 様子2: L.state().送り口,
      止めを外した: 命令.some((m) => m && m.type === "mute" && m.on === false),
      頭を拾い直した: 命令.some((m) => m && m.type === "flush"),
      命令の数: 命令.length
    };
  });

  if (結果.だめ) {
    ok("詰まりから 自分で 復帰する", false, 結果);
  } else {
    ok("喋っている最中でも こちらの声が 送られる", 結果.送れた > 0, 結果);
    ok("マイクの止めを 外している", 結果.止めを外した === true, 結果);
    ok("言葉の頭を 拾い直している（flush）", 結果.頭を拾い直した === true, 結果);
  }

  節("④ 話しかけている 最中に Lumi が 喋り出しても 締め出されないか");
  /* ★ ここが 「1 回 言っても 反応しない」の 正体（実測）。
     回り込みの見積りは Lumi が 喋り出すたびに 捨てられる。
     その瞬間に こちらが 話していると、**自分の声が
     「回り込み」として 学習され**、線が その 2.8 倍に 上がる。
     0.09 で 話す人の 線が 0.25 になり、その番の あいだ 割り込めない。
     言い直すと 番が 変わって 通る ＝「あーごめんごめん」。 */
  const 締め出し = await page.evaluate(async () => {
    const L = window.__vqLive;
    const node = window.__worklet["node:vq-mic-down"];
    const 無音 = btoa(String.fromCharCode.apply(null, new Uint8Array(3200)));

    /* いったん 落ち着かせる */
    for (let i = 0; i < 10; i++) {
      node.port.onmessage({ data: { type: "level", rms: 0.001, muted: false } });
      await new Promise((r) => setTimeout(r, 20));
    }
    /* **話しながら** Lumi が 喋り出す（いちばん 起きやすい 場面） */
    node.port.onmessage({ data: { type: "level", rms: 0.09, muted: false } });
    window.__ws.onmessage({ data: JSON.stringify({ serverContent: {
      modelTurn: { parts: [{ inlineData: { mimeType: "audio/pcm;rate=24000", data: 無音 } }] } } }) });
    await new Promise((r) => setTimeout(r, 60));
    /* 喋り出した 直後の 数かたまりを こちらの声で 埋める */
    for (let i = 0; i < 6; i++) {
      node.port.onmessage({ data: { type: "level", rms: 0.09, muted: true } });
      await new Promise((r) => setTimeout(r, 20));
    }
    /* ★ 見るのは 線の 値ではなく **割り込めたか**。
       線が 狂っても 二本目の道で 拾えれば 利用者の 困りごとは 消える。 */
    const 前 = (window.__worklet["vq-mic-down"] || []).length;
    for (let i = 0; i < 25; i++) {
      node.port.onmessage({ data: { type: "level", rms: 0.09, muted: true } });
      await new Promise((r) => setTimeout(r, 20));
    }
    const 命令 = (window.__worklet["vq-mic-down"] || []).slice(前);
    const 様 = L.state().送り口;
    return {
      線: 様.いまの線, 感度: 様.素の感度, 声: 0.09,
      割り込めた: 命令.some((m) => m && m.type === "flush")
                || 命令.some((m) => m && m.type === "mute" && m.on === false),
      命令: 命令.map((m) => m && m.type + (m.on !== undefined ? ":" + m.on : "")).slice(0, 8)
    };
  });
  ok("線が 押し上げられても 割り込める（線 " + 締め出し.線.toFixed(3)
     + " / 声 " + 締め出し.声 + "）", 締め出し.割り込めた === true, 締め出し);

  節("⑤ 見張りが 暴走しないか（うるさい部屋）");
  /* ★ 訴え「Lumi が ずっと 繋ぎ直しています に なってしまう」。
     見張りは「声が 出ているのに 送れていない」で 動くが、
     **塞いでいる印が 無いとき**にも 当たっていた。
     当たるたびに flush（溜めた 1.2 秒ぶんを まとめて 送る）を 投げるので、
     うるさい部屋では 1.2 秒おきに 永久に 送り続け、
     送りすぎで 切られ → 繋ぎ直し、の輪に なる。
     ★ 状態は 外から 触らない。**本物の道**（何も 塞がない）で 確かめる。 */
  const 暴走 = await page.evaluate(async () => {
    const L = window.__vqLive;
    const node = window.__worklet["node:vq-mic-down"];
    const 前状態 = L.state().送り口;
    const 前 = (window.__worklet["vq-mic-down"] || []).length;
    /* うるさい部屋（ずっと 線を 超える音）を 8 秒ぶん。**塞いでいない**。 */
    for (let i = 0; i < 200; i++) {
      node.port.onmessage({ data: { type: "level", rms: 0.08, muted: false } });
      node.port.onmessage({ data: new ArrayBuffer(640) });
      await new Promise((r) => setTimeout(r, 40));
    }
    const 命令 = (window.__worklet["vq-mic-down"] || []).slice(前);
    const 後状態 = L.state().送り口;
    return { 増えた外し: (後状態.詰まりを外した回数 || 0) - (前状態.詰まりを外した回数 || 0),
             先出しの数: 命令.filter((m) => m && m.type === "flush").length,
             塞がっていたか: 後状態.喋っている || 後状態.先出し中 || 後状態.効果音中 };
  });
  ok("そもそも 塞がっていない", 暴走.塞がっていたか === false, 暴走);
  ok("★ 塞がっていないのに 外しに 行かない", 暴走.増えた外し === 0, 暴走);
  ok("★ flush を 連発しない", 暴走.先出しの数 === 0, 暴走);

  節("⑥ 本当に 塞がっているときは ちゃんと 助ける");
  const 助け = await page.evaluate(async () => {
    const L = window.__vqLive;
    const node = window.__worklet["node:vq-mic-down"];
    const 無音 = btoa(String.fromCharCode.apply(null, new Uint8Array(3200)));
    /* 本物の道で 塞ぐ（Lumi が 喋り出す） */
    window.__ws.onmessage({ data: JSON.stringify({ serverContent: {
      modelTurn: { parts: [{ inlineData: { mimeType: "audio/pcm;rate=24000", data: 無音 } }] } } }) });
    await new Promise((r) => setTimeout(r, 200));
    const 前状態 = L.state().送り口;
    const 前 = (window.__worklet["vq-mic-down"] || []).length;
    const 前送 = window.__送った.length;
    /* 塞がった まま 8 秒 話しかけ続ける */
    for (let i = 0; i < 200; i++) {
      node.port.onmessage({ data: { type: "level", rms: 0.09, muted: true } });
      node.port.onmessage({ data: new ArrayBuffer(640) });
      await new Promise((r) => setTimeout(r, 40));
    }
    const 命令 = (window.__worklet["vq-mic-down"] || []).slice(前);
    const 後状態 = L.state().送り口;
    return { 塞がっていた: 前状態.喋っている,
             増えた外し: (後状態.詰まりを外した回数 || 0) - (前状態.詰まりを外した回数 || 0),
             先出しの数: 命令.filter((m) => m && m.type === "flush").length,
             送れた: window.__送った.length - 前送 };
  });
  /* ★ ここで いちばん 大事なのは **送りすぎないこと**。
     flush は 溜めた 1.2 秒ぶんを まとめて 送るので、
     8 秒 話し続けて 何度も 投げると 送りすぎで 切られる
     （実測: 直す前は 8 秒で **25 回**。それが 訴えの 原因だった）。 */
  ok("★ 8 秒 話し続けても flush は 3 回まで（前は 25 回）", 助け.先出しの数 <= 3, 助け);
  ok("★ 外しに 行く回数も 抑えられている", 助け.増えた外し <= 2, 助け);
  ok("声は ちゃんと 送れている", 助け.送れた > 0, 助け);

  節("⑦ 例外が 出ていない");
  const 新赤 = 赤.filter((x) => !/favicon|ERR_|Failed to load/i.test(x));
  ok("画面の例外が 0（" + 新赤.length + "）", 新赤.length === 0, 新赤.slice(0, 4));

  await browser.close(); srv.close();
  console.log("\n════════════════════════════════════════════");
  console.log("  合計 " + (pass + fail) + " 件 / 通った " + pass + " / 落ちた " + fail);
  if (落ち.length) { console.log("  落ちたもの:"); 落ち.forEach((x) => console.log("   - " + x)); }
  console.log("════════════════════════════════════════════");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("落ちました: " + (e && e.stack || e)); process.exit(1); });
