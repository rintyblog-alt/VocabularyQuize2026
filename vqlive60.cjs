/* ══════════════════════════════════════════════════════════════════════════
   vqlive60.cjs — 音声会話が **勝手に 使い切られない** / **固まらない**

   訴え（2026-08-20）:
     「Lumi が、今日の 音声会話を 使い切ったって言って 起動できなくなった。
       そして、10 分弱で 繋ぎ直しになって、応答も しなくなる。
       島では ずっと『繋ぎ直しています』の 文字が。」

   見ること:
     ① 1 日の 回数は **会話の数**で 数えているか
        （繋ぎ直しを 何度 しても 1 回のまま）
     ② 名札の 無い 古い呼び方でも 壊れていないか
     ③ 画面: 繋ぎ直すたび **同じ 名札**を 送っているか
     ④ 画面: トークン取りが 返ってこなくても **固まらない**か
        （25 秒で 見切って やり直す。5 回で 正直に 終わる）

   使い方: node vqlive60.cjs      （先に server/dev-local.sh echo）
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_API || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

let pass = 0, fail = 0; const 落ち = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ✅ " + n); }
  else { fail++; 落ち.push(n); console.log("  ❌ " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 300) : "")); }
};
const 節 = (t) => console.log("\n■ " + t);

async function api(method, p2, body, token) {
  const h = { "Content-Type": "application/json" };
  if (token) h.Authorization = "Bearer " + token;
  const r = await fetch(BASE + p2, { method, headers: h,
    body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text();
  let data = null; try { data = t ? JSON.parse(t) : null; } catch (e) { data = { raw: t.slice(0, 200) }; }
  return { status: r.status, data: data || {} };
}
async function 人を作る(印) {
  const nick = 印 + Date.now().toString(36).slice(-6) + Math.floor(Math.random() * 90 + 10);
  const r = await api("POST", "/api/auth/register",
    { gradePrefix: "H1", nickname: nick, password: "DevLive#2026a", tosAccepted: true, tosVersion: "1" });
  if (!r.data.token) throw new Error("検証アカウントを作れません: " + JSON.stringify(r.data).slice(0, 200));
  return { nick, token: r.data.token };
}

function 読む(名) {
  const d = path.join(__dirname, process.env.VQ_MIN ? "client/js" : "js-src");
  const f = fs.readdirSync(d).find((x) => new RegExp("^" + 名 + "\\.[0-9a-f]{10}\\.js$").test(x));
  if (!f) throw new Error(名 + " が ありません");
  return fs.readFileSync(path.join(d, f), "utf8");
}

const 台紙 = `<!doctype html><meta charset="utf-8"><title>live60</title><body></body>`;

(async () => {
  console.log("接続先: " + BASE);

  節("① 数え方そのものを 動かす（鍵が 無くても 確かめられる）");
  {
    /* worker.js から liveConvDecide を 取り出して、偽の DB で 動かす。 */
    const src = fs.readFileSync(path.join(__dirname, "server/src/worker.js"), "utf8");
    const i = src.indexOf("async function liveConvDecide(");
    if (i < 0) throw new Error("liveConvDecide が 見つかりません");
    let 深 = 0, 終 = -1;
    for (let k = src.indexOf("{", i); k < src.length; k++) {
      if (src[k] === "{") 深++;
      else if (src[k] === "}") { 深--; if (!深) { 終 = k + 1; break; } }
    }
    const 本体 = src.slice(i, 終);
    const 決める = new Function("LIVE_DAILY_MAX",
      本体 + "\nreturn liveConvDecide;")(80);

    /* 偽の D1。live_conv の 行だけ 覚える。 */
    const 作る = () => {
      const 行 = new Map();          /* key: user|day|sid */
      const 数 = new Map();          /* key: user|day → n */
      return { 行, 数, DB: { prepare(q) {
        let a = [];
        const self = {
          bind(...x) { a = x; return self; },
          async first() {
            if (/COUNT\(\*\) AS n FROM live_conv/.test(q)) {
              let c = 0; for (const k of 行.keys()) if (k.startsWith(a[0] + "|" + a[1] + "|")) c++;
              return { n: c };
            }
            if (/SELECT 1 AS x FROM live_conv/.test(q))
              return 行.has(a[0] + "|" + a[1] + "|" + a[2]) ? { x: 1 } : null;
            if (/SELECT n FROM live_sessions/.test(q)) {
              const v = 数.get(a[0] + "|" + a[1]);
              return v === undefined ? null : { n: v };
            }
            return null;
          },
          async run() {
            if (/INSERT OR IGNORE INTO live_conv/.test(q)) 行.set(a[0] + "|" + a[1] + "|" + a[2], 1);
            if (/INSERT INTO live_sessions/.test(q)) {
              const k = a[0] + "|" + a[1];
              数.set(k, (数.get(k) || 0) + 1);
            }
            if (/DELETE FROM live_conv/.test(q)) {
              for (const k of [...行.keys()]) {
                const d = k.split("|")[1];
                if (k.startsWith(a[0] + "|") && d < a[1]) 行.delete(k);
              }
            }
            return { success: true };
          }
        };
        self.run.catch = undefined;
        return self;
      } } };
    };

    const 場 = 作る();
    const env = { DB: 場.DB };
    const 日 = "2026-08-20";
    /* ★ 同じ 名札で 8 回（＝ 10 分ごとの 繋ぎ替えを 8 回）*/
    const 出 = [];
    for (let k = 0; k < 8; k++) {
      const r = await 決める(env, "u1", 日, "sidA", k > 0, false);
      if (r.数える口) await r.数える口();
      出.push(r.数えた数);
    }
    console.log("     同じ名札 8 回 → used " + 出.join(","));
    ok("★ 同じ 会話は **何度 繋ぎ直しても 1 回**", 出.every((x) => x === 1), 出);
    ok("行は 1 つだけ", 場.行.size === 1, [...場.行.keys()]);

    const b = await 決める(env, "u1", 日, "sidB", false, false);
    if (b.数える口) await b.数える口();
    ok("★ 別の 会話は 1 つ 増える", b.数えた数 === 2, b.数えた数);

    /* ★ 別の人の 分は 混ざらない */
    const 他 = await 決める(env, "u2", 日, "sidA", false, false);
    ok("★ 人ごとに 別で 数える", 他.数えた数 === 1, 他.数えた数);

    /* ★ 上限。80 まで 埋めてから 81 本目 */
    for (let k = 0; k < 78; k++) {
      const r = await 決める(env, "u1", 日, "s" + k, false, false);
      if (r.数える口) await r.数える口();
    }
    const 満 = await 決める(env, "u1", 日, "sidZ", false, false);
    ok("★ 80 を 超えたら 断る", !!満.断る && 満.断る.code === "LIVE_DAILY_LIMIT", 満.断る);
    /* ★★ ここが 芯。**話している 最中の 会話は 切らない** */
    const 続 = await 決める(env, "u1", 日, "sidA", true, false);
    ok("★★ すでに 始めた 会話は 上限でも **切られない**",
       !続.断る, 続.断る);

    /* 古い画面（名札なし）でも 壊れない */
    const 古1 = await 決める(env, "u3", 日, "", false, false);
    if (古1.数える口) await 古1.数える口();
    const 古2 = await 決める(env, "u3", 日, "", true, false);
    ok("名札なし: 1 回目は 数える", 古1.数えた数 === 1, 古1.数えた数);
    ok("名札なし: 繋ぎ直しは 数えない", 古2.数えた数 === 0 && !古2.数える口, 古2.数えた数);
  }

  節("①' 実際の 口でも 通るか（鍵が あるときだけ）");
  const 私 = await 人を作る("lv");
  const sid = "conv-" + Date.now().toString(36);
  const 回 = [];
  for (let i = 0; i < 4; i++) {
    const r = await api("POST", "/api/live/token", { sid, resume: i > 0 }, 私.token);
    回.push({ status: r.status, used: r.data.used, code: r.data.code });
  }
  console.log("     " + JSON.stringify(回));
  if (回[0].status === 503) {
    console.log("     （この worker には Gemini の鍵が 無いので ①②は 飛ばします）");
  } else {
    ok("1 回目が 通る", 回[0].status === 200, 回[0]);
    ok("★ 同じ 名札なら 何度 繋ぎ直しても used が 増えない",
       回.every((x) => x.used === 回[0].used), 回);
    /* ★ ここが 訴えの 芯。前は resume を 画面の 数で 決めていて、
       道具が 動くたび 0 に戻るので **毎回 数えられていた**。 */
    const 別 = await api("POST", "/api/live/token", { sid: sid + "-b" }, 私.token);
    console.log("     別の 会話: used=" + 別.data.used);
    ok("★ 別の 会話なら 1 つ 増える", 別.data.used === 回[0].used + 1, 別.data);

    節("② 名札を 送らない 古い画面でも 動く");
    const 古 = await api("POST", "/api/live/token", {}, 私.token);
    ok("名札なしでも 通る", 古.status === 200, { status: 古.status, code: 古.data.code });
    ok("上限も 返す", Number(古.data.limit) > 0, 古.data.limit);
  }

  /* ── 画面側 ────────────────────────────────────────────── */
  const ライブ = 読む("vq-live");
  const 束 = 読む("bundle-core");
  const PORT = Number(process.env.VQ_PORT || 8994);
  const srv = http.createServer((req, res) => {
    if (req.url === "/" || req.url.startsWith("/?")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(台紙);
    }
    res.writeHead(404); res.end("");
  });
  await new Promise((r) => srv.listen(PORT, "127.0.0.1", r));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  const 赤 = [];
  page.on("pageerror", (e) => 赤.push(String(e && e.message || e)));
  await page.goto("http://127.0.0.1:" + PORT + "/", { waitUntil: "domcontentloaded" });

  await page.evaluate(() => {
    localStorage.setItem("app.auth.token.v1", "test-token-0123456789abcdef");
    window.__頼み = [];          /* /api/live/token へ 送った 中身 */
    window.__止める = false;     /* true にすると トークン取りが **返らなくなる** */
    class 偽WS {
      constructor(u) { this.url = u; this.readyState = 1; window.__ws = this;
        setTimeout(() => this.onopen && this.onopen(), 0); }
      send(t) { try {
        const j = JSON.parse(t);
        if (j.setup) setTimeout(() => this.onmessage &&
          this.onmessage({ data: JSON.stringify({ setupComplete: {} }) }), 5);
      } catch (e) {} }
      close() { this.readyState = 3; if (this.onclose) this.onclose({ code: 1000, reason: "" }); }
    }
    window.WebSocket = 偽WS;
    class 偽Node { constructor() { this.port = { postMessage() {}, onmessage: null }; }
      connect() {} disconnect() {} }
    window.AudioWorkletNode = 偽Node;
    const つなぎ = { connect() { return this; }, disconnect() {} };
    class 偽Ctx {
      constructor() { this.state = "running"; this.sampleRate = 48000; this.currentTime = 0;
        this.destination = Object.assign({}, つなぎ);
        this.audioWorklet = { addModule: () => Promise.resolve() }; }
      createMediaStreamSource() { return Object.assign({}, つなぎ); }
      createGain() { return Object.assign({ gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {},
        exponentialRampToValueAtTime() {}, cancelScheduledValues() {} } }, つなぎ); }
      createBuffer(c, l, s) { return { numberOfChannels: c, length: l, sampleRate: s,
        duration: l / s, getChannelData: () => new Float32Array(l) }; }
      createBufferSource() { return Object.assign({ buffer: null, loop: false, start() {}, stop() {} }, つなぎ); }
      createOscillator() { return Object.assign({ frequency: { value: 440, setValueAtTime() {} },
        type: "sine", start() {}, stop() {} }, つなぎ); }
      decodeAudioData(b, k) { const buf = this.createBuffer(1, 1024, 48000);
        if (k) { k(buf); return; } return Promise.resolve(buf); }
      resume() { return Promise.resolve(); } suspend() { return Promise.resolve(); }
      close() { this.state = "closed"; return Promise.resolve(); }
    }
    window.AudioContext = 偽Ctx; window.webkitAudioContext = 偽Ctx;
    navigator.mediaDevices = navigator.mediaDevices || {};
    navigator.mediaDevices.getUserMedia = () => Promise.resolve({
      getTracks: () => [{ readyState: "live", muted: false, stop() {} }] });
    window.fetch = (u, o) => {
      const url = String(u || "");
      if (url.indexOf("/api/live/token") >= 0) {
        try { window.__頼み.push(JSON.parse(String((o && o.body) || "{}"))); } catch (e) {}
        if (window.__止める) {
          /* **返さない**。ただし abort は 尊重する（本物と 同じふるまい）。 */
          return new Promise((_, ng) => {
            const sg = o && o.signal;
            if (sg) sg.addEventListener("abort", () => ng(new Error("AbortError")));
          });
        }
      }
      return Promise.resolve({ ok: true, status: 200,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(64)),
        json: () => Promise.resolve({ token: "t", keyIndex: 0, keyCount: 1,
                                      maxMs: 3600000, used: 1, limit: 80 }) });
    };
  });
  await page.addScriptTag({ content: 束 });
  await page.addScriptTag({ content: ライブ });
  await page.waitForTimeout(200);

  節("③ 繋ぎ直しても **同じ名札**を 送っているか（画面）");
  const 名札 = await page.evaluate(async () => {
    const L = window.__vqLive;
    await L.open();
    for (let i = 0; i < 60 && !window.__ws; i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 400));
    /* 予告どおりの 繋ぎ替え（goAway）を 3 回 起こす */
    for (let i = 0; i < 3; i++) {
      window.__ws.onmessage({ data: JSON.stringify({ goAway: { timeLeft: "50s" } }) });
      await new Promise((r) => setTimeout(r, 700));
    }
    const s = window.__頼み.map((x) => x.sid || "(無し)");
    return { 送った: s, 回数: s.length, 種類: [...new Set(s)].length };
  });
  console.log("     " + JSON.stringify(名札));
  ok("繋ぎ直しが 起きている（2 回以上 頼んだ）", 名札.回数 >= 2, 名札);
  ok("★ 名札が 空でない", 名札.送った.every((x) => x && x !== "(無し)"), 名札);
  ok("★ 何度 繋ぎ直しても **名札は 1 種類**", 名札.種類 === 1, 名札);

  節("④ トークン取りが 返ってこなくても 固まらない");
  const 固 = await page.evaluate(async () => {
    const L = window.__vqLive;
    L.close ? L.close() : null;
    await new Promise((r) => setTimeout(r, 800));
    window.__止める = true;
    window.__頼み.length = 0;
    const 始 = Date.now();
    await L.open();
    const 島 = () => (document.querySelector("#vqLiveEdge .isl span") || {}).textContent || "";
    const 記録 = [];
    /* 30 秒 見張る。25 秒で 見切って やり直すはず。 */
    for (let i = 0; i < 62; i++) {
      await new Promise((r) => setTimeout(r, 500));
      記録.push({ 秒: Math.round((Date.now() - 始) / 1000), 頼み: window.__頼み.length, 島: 島() });
      if (window.__頼み.length >= 2) break;
    }
    window.__止める = false;
    return { 記録: 記録.slice(-4), 頼み: window.__頼み.length,
             かかった: Math.round((Date.now() - 始) / 1000) };
  });
  console.log("     " + JSON.stringify(固.記録));
  ok("★ 返ってこなくても **やり直す**（2 回目の 頼みが 出る）", 固.頼み >= 2, 固);
  ok("★ 30 秒 以内に やり直す", 固.かかった <= 32, 固.かかった);

  節("⑤ 6 区間（60 分ぶん）つなぎ替えて 生き残るか");
  const 区 = await page.evaluate(async () => {
    const L = window.__vqLive;
    window.__止める = false;
    if (L.close) L.close();
    await new Promise((r) => setTimeout(r, 900));
    window.__頼み.length = 0;
    await L.open();
    for (let i = 0; i < 60 && !window.__ws; i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 500));
    const 記録 = [Object.assign({ 手: 0 }, L.区間())];
    /* 10 分ごとの 予告（goAway）を 6 回。実物と 同じ 形。 */
    for (let i = 1; i <= 6; i++) {
      window.__ws.onmessage({ data: JSON.stringify({ goAway: { timeLeft: "50s" } }) });
      await new Promise((r) => setTimeout(r, 900));
      記録.push(Object.assign({ 手: i }, L.区間()));
    }
    return { 記録, 頼み: window.__頼み.length,
             会話中: !!(L.状態 ? L.状態().会話中 : true) };
  });
  区.記録.forEach((x) => console.log("     " + JSON.stringify(x)));
  ok("★ 6 回 つなぎ替えても 繋がったまま",
     区.記録[区.記録.length - 1].繋がっている === true, 区.記録);
  ok("★ 区間が 7 まで 進む（1 + 6 回）",
     区.記録[区.記録.length - 1].区間 === 7, 区.記録);
  ok("★ つなぎ替えのたびに 取り直している（7 回）", 区.頼み === 7, 区.頼み);
  ok("★ 60 分ぶんの のこりが ある",
     区.記録[区.記録.length - 1].のこり分 >= 55, 区.記録);

  節("⑥ 黙っていても すぐ 終わらないか（10 分の 打ち切りを やめた）");
  const 黙 = await page.evaluate(() => window.__vqLive.区間());
  console.log("     " + JSON.stringify(黙));
  ok("★ 黙りの 上限が 60 分（前は 10 分で 終わっていた）", 黙.黙りの上限分 >= 55, 黙);

  節("⑦ 解説の あいだは マイクを 止めるか");
  const 解 = await page.evaluate(async () => {
    const L = window.__vqLive;
    L.板("解説の テスト", "# あ\n\n一つめ。\n\n二つめ。\n\n三つめ。\n");
    await new Promise((r) => setTimeout(r, 350));
    const d = document.getElementById("vqLiveNote");
    const b = d.querySelector(".vqn-p");
    const 前 = { ミュート: !!L.mic().止めている, 見た目: b.getAttribute("aria-label") };
    b.click();
    await new Promise((r) => setTimeout(r, 400));
    const 中 = { ミュート: !!(document.body.classList.contains("vq-live-mute")),
                 見た目: b.getAttribute("aria-label"),
                 押されている: b.getAttribute("aria-pressed"),
                 止まる印: /rect/.test(b.innerHTML) };
    b.click();                       /* もう一度 押して 止める */
    await new Promise((r) => setTimeout(r, 500));
    const 後 = { ミュート: !!(document.body.classList.contains("vq-live-mute")),
                 見た目: b.getAttribute("aria-label"),
                 三角: /M7 4l12 8/.test(b.innerHTML) };
    return { 前, 中, 後 };
  });
  console.log("     " + JSON.stringify(解));
  ok("★ 解説の あいだは マイクが 止まる", 解.中.ミュート === true, 解);
  ok("★ ボタンが「止める」に 変わる", /止める/.test(解.中.見た目 || ""), 解.中);
  ok("★ 止めの印（■■）に なる", 解.中.止まる印 === true, 解.中);
  ok("★ 止めたら マイクが 戻る", 解.後.ミュート === false, 解.後);
  ok("★ ボタンが ▶ に 戻る", 解.後.三角 === true, 解.後);

  節("⑧ 例外が 出ていない");
  ok("画面の例外が 0（" + 赤.length + "）", 赤.length === 0, 赤.slice(0, 4));

  await browser.close(); srv.close();
  console.log("\n════════════════════════════════════════════");
  console.log("  合計 " + (pass + fail) + " 件 / 通った " + pass + " / 落ちた " + fail);
  if (落ち.length) { console.log("  落ちたもの:"); 落ち.forEach((x) => console.log("   - " + x)); }
  console.log("════════════════════════════════════════════");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("落ちました: " + (e && e.stack || e)); process.exit(1); });
