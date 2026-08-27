/* ══════════════════════════════════════════════════════════════════════════
   vqfreeze.cjs — **固まる**の原因を 機械で 突き止める

   訴え（2026-08-20）:
     「なんで 1 回 返事して 島に 何も 出なくなって、固まるんだろう」
     「思考中の 音楽も ずっと 鳴り続けたりする ことが よくある」

   目のつけどころ:
     道具（toolCall）は **返事を 返すまで 会話が 止まる**。
     返しそこねると
       ・向こうは 待ち続ける → 島に 何も 出ない・固まる
       ・作業の 数（workN）が 減らない → **考え中の 音が 鳴りっぱなし**
     ふたつの 訴えは **同じ 根**の 可能性が 高い。

   すること: 宣言されている 道具を **1 つずつ 実際に 呼び**、
     ・返事が 返るか
     ・何ミリ秒 かかるか
     ・呼んだあと 作業の音（workN / workSrc）が 残っていないか
   を 測る。

   使い方: node vqfreeze.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE || "http://127.0.0.1";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

const ROOT = path.join(__dirname, "client");
const PORT = Number(process.env.VQ_PORT || 8995);
const 待つ上限 = Number(process.env.VQ_WAIT || 9000);
let pass = 0, fail = 0; const 落ち = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ✅ " + n); }
  else { fail++; 落ち.push(n); console.log("  ❌ " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 400) : "")); }
};
const 節 = (t) => console.log("\n■ " + t);

/* VQ_MIN=1 で **配っているもの（圧縮ずみ）**を そのまま 動かす。
   本番と 同じ ものを 動かして 確かめるため。 */
function 読む(名) {
  const d = path.join(__dirname, process.env.VQ_MIN ? "client/js" : "js-src");
  const f = fs.readdirSync(d).find((x) => new RegExp("^" + 名 + "\\.[0-9a-f]{10}\\.js$").test(x));
  if (!f) throw new Error("js-src に " + 名 + " が ありません");
  return fs.readFileSync(path.join(d, f), "utf8");
}

/* worker.js から 道具の名前を 実際に 作らせて 取り出す（vqtooldecl と 同じやり方） */
function 道具の名前() {
  const src = fs.readFileSync(path.join(__dirname, "server/src/worker.js"), "utf8");
  const i = src.indexOf("var fn = function (name, desc, props, req) {");
  if (i < 0) throw new Error("fn の 決めどころが 見つかりません");
  const 前 = src.slice(0, i).split("\n");
  let 行 = -1;
  for (let k = 前.length - 1; k >= 0; k--) {
    if (/^(?:async\s+)?function\s+[A-Za-z0-9_]+\s*\(/.test(前[k])) { 行 = k; break; }
  }
  const 頭 = 前.slice(0, 行).join("\n").length + (行 ? 1 : 0);
  let 深 = 0, 終 = -1;
  for (let k = src.indexOf("{", 頭); k < src.length; k++) {
    if (src[k] === "{") 深++;
    else if (src[k] === "}") { 深--; if (!深) { 終 = k + 1; break; } }
  }
  const 本体 = src.slice(頭, 終);
  const 名 = /function\s+([A-Za-z0-9_]+)\s*\(/.exec(本体)[1];
  const 作る = new Function("env", "cfg", 本体 + "\nreturn " + 名 + "(env, cfg);");
  let 出 = null;
  for (const 引数 of [[{}, {}], [{}], []]) {
    try { 出 = 作る.apply(null, 引数); if (出) break; } catch (e) { 出 = null; }
  }
  const 並 = Array.isArray(出) ? 出 : [出];
  const 全 = [];
  並.forEach((x) => (x && x.functionDeclarations || []).forEach((f) => 全.push(f.name)));
  return 全;
}

/* 時間の かかるのが **当たり前**の道具には、短い引数を 渡す */
const 引数 = {
  waitFor: { seconds: 3, text: "出ないことば" },
  showNote: { title: "ためし", markdown: "# あ\n\n本文" },
  boardNote: { markdown: "ためし" },
  boardMark: { style: "marker" },
  boardWrite: { text: "ためし" },
  showApp: { title: "ためし", code: "<div id=x>やあ</div><script>document.getElementById('x').textContent='うごいた'</script>" },
  say: { text: "ためし" },
  remember: { text: "ためし" }
};

const 台紙 = `<!doctype html><meta charset="utf-8"><title>freeze</title><body></body>`;

(async () => {
  const ライブ = 読む("vq-live");
  const 束 = 読む("bundle-core");
  const 名前 = 道具の名前();
  console.log("宣言されている 道具: " + 名前.length + " 個");

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
  const page = await browser.newPage({ viewport: { width: 1000, height: 820 } });
  const 赤 = [];
  page.on("pageerror", (e) => 赤.push(String(e && e.message || e)));
  await page.goto(BASE + ":" + PORT + "/", { waitUntil: "domcontentloaded" });

  await page.evaluate(() => {
    window.__送った = [];
    localStorage.setItem("app.auth.token.v1", "test-token-0123456789abcdef");
    class 偽WS {
      constructor(u) { this.url = u; this.readyState = 1; window.__ws = this;
        setTimeout(() => this.onopen && this.onopen(), 0); }
      send(t) {
        window.__送った.push(t);
        try {
          const j = JSON.parse(t);
          if (j.setup) setTimeout(() => this.onmessage &&
            this.onmessage({ data: JSON.stringify({ setupComplete: {} }) }), 5);
        } catch (e) {}
      }
      close() { this.readyState = 3; if (this.onclose) this.onclose({ code: 1000 }); }
    }
    window.WebSocket = 偽WS;
    class 偽Node { constructor() { this.port = { postMessage() {}, onmessage: null }; }
      connect() {} disconnect() {} }
    window.AudioWorkletNode = 偽Node;
    const つなぎ = { connect() { return this; }, disconnect() {} };
    window.__音 = { 作った: 0, 止めた: 0 };
    class 偽Ctx {
      constructor() { this.state = "running"; this.sampleRate = 48000; this.currentTime = 0;
        this.destination = Object.assign({}, つなぎ);
        this.audioWorklet = { addModule: () => Promise.resolve() }; }
      createMediaStreamSource() { return Object.assign({}, つなぎ); }
      createGain() { return Object.assign({ gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {},
        exponentialRampToValueAtTime() {}, cancelScheduledValues() {} } }, つなぎ); }
      createBuffer(ch, len, sr) { return { numberOfChannels: ch, length: len, sampleRate: sr,
        duration: len / sr, getChannelData: () => new Float32Array(len) }; }
      createBufferSource() { window.__音.作った++;
        return Object.assign({ buffer: null, loop: false, start() {},
          stop() { window.__音.止めた++; } }, つなぎ); }
      createOscillator() { return Object.assign({ frequency: { value: 440, setValueAtTime() {} },
        type: "sine", start() {}, stop() {} }, つなぎ); }
      decodeAudioData(b, ok2) { const buf = this.createBuffer(1, 1024, 48000);
        if (ok2) { ok2(buf); return; } return Promise.resolve(buf); }
      resume() { return Promise.resolve(); } suspend() { return Promise.resolve(); }
      close() { this.state = "closed"; return Promise.resolve(); }
    }
    window.AudioContext = 偽Ctx; window.webkitAudioContext = 偽Ctx;
    navigator.mediaDevices = navigator.mediaDevices || {};
    navigator.mediaDevices.getUserMedia = () => Promise.resolve({
      getTracks: () => [{ readyState: "live", muted: false, stop() {} }] });
    window.fetch = (u) => Promise.resolve({ ok: true, status: 200,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(64)),
      json: () => Promise.resolve({ token: "t", keyIndex: 0, keyCount: 1, maxMs: 3600000 }) });
  });

  await page.addScriptTag({ content: 束 });
  await page.addScriptTag({ content: ライブ });
  await page.waitForTimeout(300);
  await page.evaluate(async () => {
    await window.__vqLive.open();
    for (let i = 0; i < 60 && !window.__ws; i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 400));
  });

  節("① 道具を 1 つずつ 呼んで、**返事が 返るか**");
  const 結果 = [];
  for (const name of 名前) {
    const r = await page.evaluate(async ([name, a, 上限]) => {
      const ws = window.__ws;
      const id = "t-" + name + "-" + (window.__n = (window.__n || 0) + 1);
      const 先 = window.__送った.length;
      const 始 = Date.now();
      ws.onmessage({ data: JSON.stringify({ toolCall: { functionCalls: [{ id, name, args: a }] } }) });
      let 返り = null;
      while (Date.now() - 始 < 上限) {
        for (let i = 先; i < window.__送った.length; i++) {
          const t = window.__送った[i];
          if (t.indexOf('"toolResponse"') >= 0 && t.indexOf(id) >= 0) { 返り = t; break; }
        }
        if (返り) break;
        await new Promise((x) => setTimeout(x, 40));
      }
      const かかった = Date.now() - 始;
      /* 呼んだあと 作業の音が 残っていないか（少し待ってから 見る） */
      await new Promise((x) => setTimeout(x, 260));
      const w = window.__vqLive.作業 ? window.__vqLive.作業() : {};
      return { name, 返った: !!返り, かかった, 作業数: w.workN, 鳴っている: !!w.鳴っている };
    }, [name, 引数[name] || {}, 待つ上限]);
    結果.push(r);
    if (!r.返った) console.log("     ⚠ " + name + " … " + r.かかった + "ms で **返事なし**");
    else if (r.かかった > 2500) console.log("     ・" + name + " … " + r.かかった + "ms");
  }
  const 返らず = 結果.filter((x) => !x.返った);
  const 遅い = 結果.filter((x) => x.返った && x.かかった > 2500);
  console.log("     返事なし " + 返らず.length + " / 遅い " + 遅い.length + " / 全 " + 結果.length);
  ok("★ **返事の 返らない 道具が 0**", 返らず.length === 0,
     返らず.map((x) => x.name));

  節("② 呼び終わったあと、考え中の 音が 残っていないか");
  const 音 = await page.evaluate(async () => {
    await new Promise((r) => setTimeout(r, 1200));
    const s = window.__vqLive.作業 ? window.__vqLive.作業() : {};
    return { workN: s.workN, 鳴っている: !!s.鳴っている, 帯: s.帯,
             島: (document.querySelector("#vqLiveEdge .isl span") || {}).textContent };
  });
  console.log("     " + JSON.stringify(音));
  ok("★ 作業の数が 0 に 戻っている", (音.workN || 0) === 0, 音);
  ok("★ 考え中の 音が 止まっている", 音.鳴っている === false, 音);

  節("③ 道具を 呼んだあとも 島が 動くか");
  const 島 = await page.evaluate(async () => {
    const ws = window.__ws;
    const 出 = [];
    for (const t of ["いちど目の 返事です。", "にど目の 返事です。", "さんど目の 返事です。"]) {
      ws.onmessage({ data: JSON.stringify({ serverContent: {
        outputTranscription: { text: t } } }) });
      await new Promise((r) => setTimeout(r, 120));
      出.push((document.querySelector("#vqLiveEdge .isl span") || {}).textContent || "");
      ws.onmessage({ data: JSON.stringify({ serverContent: { turnComplete: true } }) });
      await new Promise((r) => setTimeout(r, 120));
    }
    return 出;
  });
  console.log("     " + JSON.stringify(島));
  ok("★ 1 回目も 2 回目も 3 回目も 島に 出る",
     島.length === 3 && 島.every((x) => x && x.indexOf("返事です") >= 0), 島);

  節("④ 文字で 続けて 送ったとき（考え中の 音が 鳴りっぱなしに ならないか）");
  const 続け = await page.evaluate(async () => {
    const L = window.__vqLive;
    const 出 = [];
    /* ★ ①で 道具を ひととおり 呼んだので、会話を 閉じる道具まで 走っている。
       ここは **繋がっている状態**で 確かめたいので 開き直す。 */
    await L.open();
    for (let i = 0; i < 80 && !window.__ws; i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 500));
    出.push({ 手: "はじめ", 繋がり: !!window.__ws });
    for (let i = 0; i < 3; i++) {
      if (!L.打つ("たのみ " + (i + 1))) return { だめ: "文字を 送れません" };
      await new Promise((r) => setTimeout(r, 320));
      出.push(Object.assign({ 手: i + 1 }, L.作業()));
    }
    /* Lumi が 1 回 返事する（声 → 書き起こし → 番の終わり） */
    window.__ws.onmessage({ data: JSON.stringify({ serverContent: {
      modelTurn: { parts: [{ inlineData: { data: "AAAA" } }] } } }) });
    await new Promise((r) => setTimeout(r, 200));
    window.__ws.onmessage({ data: JSON.stringify({ serverContent: {
      outputTranscription: { text: "はい、やるね。" } } }) });
    window.__ws.onmessage({ data: JSON.stringify({ serverContent: { turnComplete: true } }) });
    await new Promise((r) => setTimeout(r, 900));
    return { 出, 後: L.作業(),
             島: (document.querySelector("#vqLiveEdge .isl span") || {}).textContent };
  });
  if (続け.だめ) ok("文字を 送れる", false, 続け);
  else {
    続け.出.forEach((x) => console.log("     " + JSON.stringify(x)));
    console.log("     返事のあと: " + JSON.stringify(続け.後) + " ／ 島「" + 続け.島 + "」");
    ok("★ 3 回 続けて 送っても 作業の数が ふくらまない",
       続け.出.every((x) => (x.workN || 0) <= 1), 続け.出);
    ok("★ 返事が 来たら 作業の数が 0 に 戻る", (続け.後.workN || 0) === 0, 続け.後);
    ok("★ 返事が 来たら 考え中の 音が 止まる", 続け.後.鳴っている === false, 続け.後);
    ok("★ 島に 返事が 出る", String(続け.島 || "").indexOf("やるね") >= 0, 続け.島);
  }

  節("⑤ **返ってこない 道具**でも 固まらない（締め切り）");
  const 締 = await page.evaluate(async () => {
    window.VQ_TOOL_DEADLINE = 1500;                 /* 確かめるため 短くする */
    /* 枠が 何も 報せない ＝ 永久に 返らない 道具を 作る */
    const 元 = window.VQB.app.枠;
    window.VQB.app.枠 = function () { return { 片づける() {}, 拡大() {}, 全画面にする() {} }; };
    const ws = window.__ws, id = "t-hang-1";
    const 先 = window.__送った.length, 始 = Date.now();
    ws.onmessage({ data: JSON.stringify({ toolCall: { functionCalls: [
      { id, name: "showApp", args: { title: "返らない", code: "<div>あ</div>" } }] } }) });
    let 返り = null;
    while (Date.now() - 始 < 8000) {
      for (let i = 先; i < window.__送った.length; i++) {
        const t = window.__送った[i];
        if (t.indexOf('"toolResponse"') >= 0 && t.indexOf(id) >= 0) { 返り = t; break; }
      }
      if (返り) break;
      await new Promise((x) => setTimeout(x, 40));
    }
    const かかった = Date.now() - 始;
    await new Promise((x) => setTimeout(x, 400));
    const w = window.__vqLive.作業();
    window.VQB.app.枠 = 元; delete window.VQ_TOOL_DEADLINE;
    return { 返った: !!返り, かかった, 中身: String(返り || "").slice(0, 260), 作業: w };
  });
  console.log("     " + 締.かかった + "ms ／ " + 締.中身);
  ok("★ 返ってこない 道具でも **必ず 返事が 返る**", 締.返った === true, 締);
  ok("時間切れだと 分かる 返事", /\\u6642\\u9593|秒|待っても/.test(締.中身) || 締.中身.indexOf("だめ") >= 0, 締.中身);
  ok("★ そのとき 考え中の 音も 止まる", 締.作業.鳴っている === false, 締.作業);
  ok("★ 作業の数も 0 に 戻る", (締.作業.workN || 0) === 0, 締.作業);

  節("⑥ 打っている最中は 手を出さない（答え合わせを 先回りしない）");
  const 打 = await page.evaluate(async () => {
    const L = window.__vqLive;
    /* クイズの 入力欄の かわり（Lumi の 部品では ない ふつうの 入力欄） */
    const box = document.createElement("div");
    box.innerHTML = '<h2>問 3</h2><input type="text" id="ans" value="">';
    document.body.appendChild(box);
    const inp = document.getElementById("ans");
    inp.focus(); inp.value = "パーソナルコン";
    inp.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    await new Promise((r) => setTimeout(r, 120));
    const 打っている = await Promise.resolve(L.道具("readScreen", {}));
    /* 打鍵から 4 秒 以上 空ける */
    await new Promise((r) => setTimeout(r, 4300));
    const 打ち終わり = await Promise.resolve(L.道具("readScreen", {}));
    box.remove();
    return { 中: String(打っている.入力中 || ""), 後: String(打ち終わり.入力中 || "") };
  });
  ok("★ 打っている 最中は そう 伝える", 打.中.indexOf("打っている最中") >= 0, 打);
  ok("★ 答え合わせを しないよう 言う", 打.中.indexOf("答え合わせを しないでください") >= 0, 打);
  ok("★ 次へ 進めないよう 言う", 打.中.indexOf("次の 問題へ 進めないでください") >= 0, 打);
  ok("★ 打ち終わって 間が あけば 断りは 消える", 打.後 === "", 打);

  節("⑤ 例外が 出ていない");
  ok("画面の例外が 0（" + 赤.length + "）", 赤.length === 0, 赤.slice(0, 4));

  await browser.close();
  srv.close();
  console.log("\n════════════════════════════════════════════");
  console.log("  合計 " + (pass + fail) + " 件 / 通った " + pass + " / 落ちた " + fail);
  if (落ち.length) { console.log("  落ちたもの:"); 落ち.forEach((x) => console.log("   - " + x)); }
  console.log("════════════════════════════════════════════");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("落ちました: " + (e && e.stack || e)); process.exit(1); });
