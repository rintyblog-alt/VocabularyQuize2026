/* ══════════════════════════════════════════════════════════════════════════
   vqboardplay.cjs — 板の「再生（解説）」と「保存」を 実際に 動かして 確かめる

   訴え（2026-08-19）:
     ・「ボードが 出たときに、タイトルの 右側に 再生マークを 置いてほしい。
        再生すると ボードを 上から下まで Lumi が 解説できるように。
        解説している部分に マーカー・波線・ペン・文字を リアルタイムで」
     ・「AR Board は、ユーザーが 保存した時だけ 一覧に 追加しよう。
        再生ボタンの さらに右に 保存ボタン」

   実 AI は 使わない。WebSocket と 音まわりを 偽物に して、
   **実際の判断コードを そのまま** 動かす。

   使い方: node vqboardplay.cjs
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
  if (c) { pass++; console.log("  ✅ " + n); }
  else { fail++; 落ち.push(n); console.log("  ❌ " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 400) : "")); }
};
const 節 = (t) => console.log("\n■ " + t);

function 読む(名) {
  const d = path.join(__dirname, "js-src");
  const f = fs.readdirSync(d).find((x) => new RegExp("^" + 名 + "\\.[0-9a-f]{10}\\.js$").test(x));
  if (!f) throw new Error("js-src に " + 名 + " が ありません");
  return fs.readFileSync(path.join(d, f), "utf8");
}

const 台紙 = `<!doctype html><meta charset="utf-8"><title>board play</title><body></body>`;

(async () => {
  const ライブ = 読む("vq-live");
  const 束 = 読む("bundle-core");

  節("① 直したところが 入っているか（コードを 見る）");
  ok("見出しの右に 再生ボタン", /class="vqn-p"/.test(ライブ));
  ok("そのさらに右に 保存ボタン", /class="vqn-s"/.test(ライブ));
  ok("解説の 進行が ある", /function 解説を始める/.test(ライブ));
  /* ★ 2026-08-20: 合図を **その回のもの**に した（前は 1 つの入れ物に
     置いていたので、前の回の 時計が 次の回の 合図を 消していた）。 */
  ok("返事が 終わってから 次へ 進む", /解説\.合図/.test(ライブ));
  ok("★ 合図は その回のものだけ 受ける", /解説\.合図番/.test(ライブ));
  ok("話しかけられたら 止まる", /解説を止める\("話しかけられた"\)/.test(ライブ));
  ok("**勝手に 残さない**（文字の板）", !/出したものは \*\*AR Board に 残す\*\*/.test(ライブ));
  ok("**勝手に 残さない**（動くもの）", /勝手に 残さない/.test(ライブ));
  ok("保存の口が ある", /function 板を残す/.test(ライブ));
  ok("写真つきでも 残せる", /function 板を残す写真つき/.test(ライブ));
  ok("Lumi が 線を 引ける（boardMark）", /function boardMark/.test(ライブ));
  ok("Lumi が 書き足せる（boardWrite）", /function boardWrite/.test(ライブ));
  ok("区切りの番号を 教えられる（boardBlocks）", /function boardBlocks/.test(ライブ));
  ok("解説の部品が 束に 入っている", /VQB\.play/.test(束));

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
  const page = await browser.newPage({ viewport: { width: 900, height: 800 } });
  const 赤 = [];
  page.on("pageerror", (e) => 赤.push(String(e && e.message || e)));
  await page.goto(BASE + ":" + PORT + "/", { waitUntil: "domcontentloaded" });

  await page.evaluate(() => {
    window.__送った = [];
    window.__worklet = {};
    localStorage.setItem("app.auth.token.v1", "test-token-0123456789abcdef");
    class 偽WS {
      constructor(u) { this.url = u; this.readyState = 1; window.__ws = this;
        setTimeout(() => this.onopen && this.onopen(), 0); }
      send(t) {
        try {
          const j = JSON.parse(t);
          if (j.setup) setTimeout(() => this.onmessage &&
            this.onmessage({ data: JSON.stringify({ setupComplete: {} }) }), 5);
          if (j.clientContent) {
            window.__送った.push(JSON.stringify(j.clientContent).slice(0, 3000));
            /* 返事を 返す（番の 終わりまで）。実物と 同じ 形。 */
            setTimeout(() => { if (!this.onmessage) return;
              this.onmessage({ data: JSON.stringify({ serverContent: { turnComplete: true } }) });
            }, 60);
          }
        } catch (e) {}
      }
      close() { this.readyState = 3; if (this.onclose) this.onclose({ code: 1000 }); }
    }
    window.WebSocket = 偽WS;
    class 偽Node {
      constructor(ctx, 名) { this.名 = 名;
        this.port = { postMessage: (m) => { (window.__worklet[名] = window.__worklet[名] || []).push(m); },
                      onmessage: null };
        window.__worklet["node:" + 名] = this; }
      connect() {} disconnect() {}
    }
    window.AudioWorkletNode = 偽Node;
    const つなぎ = { connect() { return this; }, disconnect() {} };
    class 偽Ctx {
      constructor() { this.state = "running"; this.sampleRate = 48000; this.currentTime = 0;
        this.destination = Object.assign({}, つなぎ);
        this.audioWorklet = { addModule: () => Promise.resolve() }; }
      createMediaStreamSource() { return Object.assign({}, つなぎ); }
      createGain() { return Object.assign({ gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {},
        exponentialRampToValueAtTime() {}, cancelScheduledValues() {} } }, つなぎ); }
      createBuffer(ch, len, sr) { return { numberOfChannels: ch, length: len, sampleRate: sr,
        duration: len / sr, getChannelData: () => new Float32Array(len) }; }
      createBufferSource() { return Object.assign({ buffer: null, loop: false, start() {}, stop() {} }, つなぎ); }
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
    window.fetch = () => Promise.resolve({ ok: true, status: 200,
      json: () => Promise.resolve({ token: "t", keyIndex: 0, keyCount: 1, maxMs: 3600000 }) });
  });

  await page.addScriptTag({ content: 束 });
  await page.addScriptTag({ content: ライブ });
  await page.waitForTimeout(300);

  節("② 板を 出して、ボタンが 並んでいるか");
  const 並び = await page.evaluate(async () => {
    const L = window.__vqLive;
    await L.open();
    for (let i = 0; i < 60 && !window.__ws; i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 400));
    L.板("見出しの テスト",
      "# まとめ\n\nこれは 一つめの 段落です。よく 読んでください。\n\n"
      + "- 箇条書き の 一つめ\n- 箇条書き の 二つめ\n\n"
      + "二つめの 段落です。ここも 大事なところ。\n");
    await new Promise((r) => setTimeout(r, 400));
    const d = document.getElementById("vqLiveNote");
    if (!d) return { だめ: "板が 出ていません" };
    const h = d.querySelector(".vqn-h");
    const 順 = [...h.children].map((x) => x.className.replace(/\s.*/, ""));
    return { 順, 再生: !!d.querySelector(".vqn-p"), 保存: !!d.querySelector(".vqn-s"),
             残っている: (window.VQB.store.一覧() || []).length };
  });
  ok("板が 出る", !並び.だめ, 並び);
  ok("見出しの 右に 再生 → 保存 の順で 並ぶ",
     並び.順 && 並び.順.indexOf("vqn-t") < 並び.順.indexOf("vqn-p")
     && 並び.順.indexOf("vqn-p") < 並び.順.indexOf("vqn-s"), 並び.順);
  ok("★ 出しただけでは 一覧に 入らない", 並び.残っている === 0, 並び.残っている);

  節("③ 保存ボタンを 押したときだけ 一覧に 入る");
  const 保存 = await page.evaluate(async () => {
    const d = document.getElementById("vqLiveNote");
    const 前 = (window.VQB.store.一覧() || []).length;
    d.querySelector(".vqn-s").click();
    await new Promise((r) => setTimeout(r, 700));
    const 一 = window.VQB.store.一覧() || [];
    return { 前, 後: 一.length, 題: (一[0] || {}).title,
             印: d.querySelector(".vqn-s").classList.contains("done") };
  });
  ok("押したら 1 件 増える", 保存.後 === 保存.前 + 1, 保存);
  ok("中身が 入っている", 保存.題 === "見出しの テスト", 保存);
  ok("押したことが 見て分かる", 保存.印 === true, 保存);

  節("④ 再生（上から下まで 解説）");
  const 再 = await page.evaluate(async () => {
    const d = document.getElementById("vqLiveNote");
    window.__送った.length = 0;
    d.querySelector(".vqn-p").click();
    await new Promise((r) => setTimeout(r, 300));
    const 途中 = { on: d.querySelector(".vqn-p").classList.contains("on"),
                   目印: !!d.querySelector(".vqp-now"),
                   重ね板: !!d.querySelector(".vqp-lay") };
    /* ★ 線は **解説している 間**に 数える。
       終われば 片づけるので、終わったあとに 数えると 0 で 当たり前。 */
    await new Promise((r) => setTimeout(r, 700));
    const 途中の線 = d.querySelectorAll(".vqp-lay rect, .vqp-lay path").length;
    /* 区切りの 数だけ 進むのを 待つ */
    await new Promise((r) => setTimeout(r, 4500));
    return { 途中, 途中の線, 送った数: window.__送った.length,
             一つめ: String(window.__送った[0] || "").slice(0, 2500),
             線: d.querySelectorAll(".vqp-lay rect, .vqp-lay path").length,
             まだ: d.querySelector(".vqn-p").classList.contains("on") };
  });
  ok("押すと 解説が 始まる（印が つく）", 再.途中.on === true, 再.途中);
  ok("いま話している所に 目印が つく", 再.途中.目印 === true, 再.途中);
  ok("線を 引く 重ね板が 出る", 再.途中.重ね板 === true, 再.途中);
  /* ★ 2026-08-20 に **1 行ずつ → 意味のまとまりごと**へ 変えた（訴え
     「1 行 1 行 解説しているから 同じ説明を 2 回くらい する。くどい」）。
     だから 送る回数は **区切りの数より 少ない**のが 正しい。 */
  ok("まとまりごとに Lumi へ 渡している（1 回以上）", 再.送った数 >= 1, 再);
  ok("渡し方が 正しい（何番／全部 と 中身）", /\d+ \/ \d+/.test(再.一つめ), 再.一つめ);
  /* ★ **自動で 線を 引かなくなった**（2026-08-19・訴え
     「何でもかんでも 線を 引けば いいってもんじゃない」）。
     もとは 区切りごとに 必ず 1 本 引いていたので、全部に 線が 付き、
     **どこが 大事か 分からなくなっていた**。
     いまは 引くかどうかを Lumi が その場で 決める（boardMark）。
     いま話している ところは 目印（vqp-now）で 分かる。 */
  ok("★ 勝手に 線を 引かない", 再.途中の線 === 0, { 途中の線: 再.途中の線 });
  ok("代わりに いま話している所に 目印が 付く", 再.途中.目印 === true, 再.途中);
  ok("block の 番号を 伝えている（範囲でもよい）",
     /block=\d+/.test(再.一つめ) || /block=\d+〜\d+/.test(再.一つめ), 再.一つめ);

  節("⑤ Lumi が 自分で 線を 引ける・書き足せる");
  const 描く = await page.evaluate(async () => {
    const L = window.__vqLive;
    const 区 = await L.tool("boardBlocks", {});
    const m = await L.tool("boardMark", { style: "wave", block: 1 });
    const w = await L.tool("boardWrite", { text: "つまり こういうこと。", block: 1, instant: true });
    await new Promise((r) => setTimeout(r, 200));
    const d = document.getElementById("vqLiveNote");
    return { 区切りの数: (区.区切り || []).length, 引けた: !!m.やった, 書けた: !!w.やった,
             足した文字: !!d.querySelector(".vqp-add"),
             線: d.querySelectorAll(".vqp-lay rect, .vqp-lay path").length };
  });
  ok("区切りの番号を 返す", 描く.区切りの数 >= 3, 描く);
  ok("波線を 引ける", 描く.引けた === true, 描く);
  ok("文字を 書き足せる", 描く.書けた === true && 描く.足した文字 === true, 描く);

  節("⑥ もう一度 押すと 止まる／閉じたら 片づく");
  const 止め = await page.evaluate(async () => {
    const d = document.getElementById("vqLiveNote");
    const p = d.querySelector(".vqn-p");
    if (!p.classList.contains("on")) p.click();
    await new Promise((r) => setTimeout(r, 200));
    p.click();
    await new Promise((r) => setTimeout(r, 200));
    const 止まった = !p.classList.contains("on") && !d.querySelector(".vqp-now");
    window.__vqLive.板を閉じる ? window.__vqLive.板を閉じる() : d.querySelector(".vqn-x").click();
    await new Promise((r) => setTimeout(r, 300));
    return { 止まった, 重ね板: !!d.querySelector(".vqp-lay") };
  });
  ok("もう一度 押すと 止まる", 止め.止まった === true, 止め);
  ok("閉じたら 線も 片づく", 止め.重ね板 === false, 止め);

  節("⑦ 大きな仕事（30 件）を 預かれるか");
  /* ★ 前は 8 件までで、9 件目から **黙って 落ちて**いた。
     落ちたぶんは 誰も 気づけない（頼んだ人も Lumi も）。 */
  const 大 = await page.evaluate(async () => {
    const L = window.__vqLive;
    const 件 = []; for (let i = 1; i <= 30; i++) 件.push(i + " ページ目を 作る");
    const r = await L.tool("startTask", { goal: "30 ページの 資料を 作る", steps: 件 });
    const s1 = await L.tool("planShow", {});
    const 帯1 = document.getElementById("vqLiveProg");
    /* ★ stepDone は **画面に 証拠が 無いと 通さない**（意図した 守り）。
       「やった」と 言うだけでは 済んだことに ならない。
       だから まず 板に 印を 出し、その言葉を 証拠にする。 */
    const 証拠なし = await L.tool("stepDone", { step: "1 ページ目を 作る", evidence: "" });
    window.__証拠なし = !!証拠なし.だめ;
    const うそ = await L.tool("stepDone", { step: "1 ページ目を 作る", evidence: "どこにも無い言葉" });
    window.__うそ = !!うそ.だめ;
    for (let i = 0; i < 3; i++) {
      const 印 = "できました " + (i + 1) + " ページ目";
      L.板("進み具合", 印);
      await new Promise((r) => setTimeout(r, 120));
      await L.tool("stepDone", { step: (i + 1) + " ページ目を 作る", evidence: 印 });
    }
    const s2 = await L.tool("planShow", {});
    /* 途中で 足す */
    const add = await L.tool("planAdd", { steps: ["表紙を 作る", "目次を 作る"] });
    const s3 = await L.tool("planShow", {});
    const 帯 = document.getElementById("vqLiveProg");
    return { 預かった: s1.ぜんぶ, 済んだ: s2.済んだ, 足した: (add.足した || []).length,
             証拠なしは断る: window.__証拠なし, うそは断る: window.__うそ,
             足したあと: s3.ぜんぶ, のこり: s3.のこり.length,
             帯: !!帯, 帯の字: 帯 ? 帯.textContent.replace(/\s+/g, " ").trim() : "" };
  });
  ok("★ 30 件 ぜんぶ 預かる（前は 8 件で 落ちていた）", 大.預かった === 30, 大);
  ok("★ 証拠が 無ければ 済ませない", 大.証拠なしは断る === true, 大);
  ok("★ 画面に 無い言葉は 証拠に ならない", 大.うそは断る === true, 大);
  ok("証拠があれば 済んだと 数える", 大.済んだ === 3, 大);
  ok("途中で やることを 足せる", 大.足した === 2 && 大.足したあと === 32, 大);
  ok("のこりが 合う（30 − 3 済み ＋ 2 足した ＝ 29）", 大.のこり === 29, 大);
  ok("★ 進み具合が 画面に 出る", 大.帯 === true, 大);
  ok("何件目かが 見て 分かる", /\d+ \/ \d+/.test(大.帯の字), 大.帯の字);

  節("⑧ ★ 線が **字の 場所**に 引かれるか（ずれない）");
  /* ★ 実測で 踏んだ（2026-08-19）: VQB.play の CSS を **誰も 入れていなかった**。
     すると .vqp-lay の position:absolute が 効かず、重ね板は
     **ただの 要素として 本文の 後ろに 流し込まれる**。
     ・線は 字ではなく **本文の 下の 何もない所**に 並ぶ（40〜267px ずれた）
     ・重ね板の ぶん 板の 高さが **倍**になり、下に 大きな 空白が できる
     訴え「変なところに 線 引いてて、しかも 文字も 見えない」は これ。 */
  const ずれ = await page.evaluate(() => {
    const 外 = document.createElement("div");
    外.style.cssText = "position:fixed;left:40px;top:60px;width:520px;max-height:420px;"
      + "overflow:auto;padding:12px 14px;background:#fff;";
    const 中 = document.createElement("div");
    中.innerHTML = "<h3>ヒント</h3><ul><li>「共感」に関係があるよ。</li>"
      + "<li>意見が一緒になった時に使う言葉だよ。</li></ul>"
      + "<p>つまり、選択肢のどれかな？</p>"
      + "<p>A. 〜に賛成する</p><p>B. 〜に反対する</p><p>C. 〜を理解する</p><p>D. 〜を無視する</p>";
    外.appendChild(中); document.body.appendChild(外);
    const 前の高さ = 中.getBoundingClientRect().height;
    const 面 = VQB.play.作る({ 中身: 中, 巻物: 外 });
    const 区 = 面.区切り();
    [0, 3, 6].forEach((i) => { if (i < 区.length) 面.引く("wave", { block: i }); });
    const 並 = 中.querySelectorAll("h3,li,p");
    const 出 = { 区切り: 区.length, 最大ずれ: 0, 線: 0 };
    [...中.querySelectorAll(".vqp-lay path")].forEach((e) => {
      出.線++;
      const a2 = e.getBoundingClientRect();
      let 差 = 1e9;
      並.forEach((el) => {
        const b2 = el.getBoundingClientRect();
        差 = Math.min(差, Math.abs(b2.bottom - (a2.top + a2.height / 2)));
      });
      出.最大ずれ = Math.max(出.最大ずれ, Math.round(差));
    });
    出.高さの増え = Math.round(中.getBoundingClientRect().height - 前の高さ);
    出.重ね板の位置 = getComputedStyle(中.querySelector(".vqp-lay")).position;
    面.片づける(); 外.remove();
    return 出;
  });
  ok("線を 3 本 引けた", ずれ.線 === 3, ずれ);
  ok("★ 線が 字の 場所に 来る（ずれ " + ずれ.最大ずれ + "px ≦ 12）", ずれ.最大ずれ <= 12, ずれ);
  ok("★ 板の 高さが 増えない（重ね板が 流れに 入らない）", Math.abs(ずれ.高さの増え) <= 2, ずれ);
  ok("重ね板が 浮いている（absolute）", ずれ.重ね板の位置 === "absolute", ずれ);

  節("⑨ ★ Lumi に **板が 見えているか**");
  /* ★ 訴え「ボードや アプリの 画面が、Lumi には 見えていないのかも」。
     実測で その通りだった: 板を 出した状態で readScreen を 呼んでも
     読める字は **0 件**。readScreen は 板を わざと 読まない（正しい。
     読むと 自分の書いた $ や \frac を 読み上げ始める）。
     だが そのせいで **自分が 出した板の 中身を 一度も 見られなかった**。 */
  const 見え = await page.evaluate(async () => {
    const L = window.__vqLive;
    L.板("三角形の面積",
      "# 三角形の面積\n\n公式は **底辺 × 高さ ÷ 2** です。\n\n- 底辺は 6cm\n- 高さは 4cm\n\nだから 12 平方センチメートル。");
    await new Promise((r) => setTimeout(r, 400));
    const rs = await L.tool("readScreen", {});
    const ls = await L.tool("lookScreen", {});
    const bb = await L.tool("boardBlocks", {});
    return {
      読むに板あり: !!rs.ボード, 見るに板あり: !!ls.ボード,
      見出し: rs.ボード && rs.ボード.見出し,
      読みかたの案内: !!(rs.ボード && /boardBlocks/.test(String(rs.ボード.読みかた || ""))),
      区切り数: (bb.区切り || []).length,
      中身が読める: (bb.区切り || []).some((x) => /底辺|12 平方/.test(String(x.字 || ""))),
      boardの見出し: bb.見出し
    };
  });
  ok("★ 画面を 読むと 板が 出ていると 分かる", 見え.読むに板あり === true, 見え);
  ok("★ 画面を 見るときも 分かる", 見え.見るに板あり === true, 見え);
  ok("見出しが 伝わる", 見え.見出し === "三角形の面積", 見え);
  ok("どう 読むかが 書いてある", 見え.読みかたの案内 === true, 見え);
  ok("★ boardBlocks で **中身が 読める**", 見え.中身が読める === true, 見え);
  ok("boardBlocks にも 見出しが 付く", 見え.boardの見出し === "三角形の面積", 見え);

  節("⑩ 付箋と 色つきマーカー");
  const 付 = await page.evaluate(async () => {
    const L = window.__vqLive;
    const n1 = await L.tool("boardNote", { markdown: "## 覚えかた\n- **÷2** を 忘れない\n- 単位は cm²", block: 1, color: "aoi" });
    const m1 = await L.tool("boardMark", { style: "number", block: 2, color: "ももいろ", no: 1 });
    const m2 = await L.tool("boardMark", { style: "back", block: 0, color: "みどり" });
    await new Promise((r) => setTimeout(r, 200));
    const d = document.getElementById("vqLiveNote");
    return { 付箋: !!n1.やった, 番号: !!m1.やった, 背景: !!m2.やった,
             付箋の数: d.querySelectorAll(".vqp-tag").length,
             付箋に見出し: !!d.querySelector(".vqp-tag h2, .vqp-tag h3"),
             番号の玉: d.querySelectorAll(".vqp-no").length,
             塗り: d.querySelectorAll(".vqp-lay rect").length };
  });
  ok("付箋を 貼れる", 付.付箋 === true && 付.付箋の数 >= 1, 付);
  ok("★ 付箋に マークダウンが 効く", 付.付箋に見出し === true, 付);
  ok("番号つき下線を 引ける", 付.番号 === true && 付.番号の玉 >= 1, 付);
  ok("背景の 色つきマーカーを 引ける", 付.背景 === true && 付.塗り >= 1, 付);

  節("⑪ ★「閉じて」で クイズが 消えないか");
  /* ★ 訴え（2026-08-19）:「ボードや ゲームを 閉じてって、クイズ中の
     ゲームボードが 表示された状態で 指示すると、**クイズ画面が 閉じてしまい、
     せっかく 解いてきた クイズの 履歴が 消えた**」。
     「閉じる」は いちばん手前の 1 つだけ。クイズは 守る。 */
  const 閉 = await page.evaluate(async () => {
    const L = window.__vqLive;
    /* クイズを 解いている ことにする（VQ2.quizNow が 在る＝解いている） */
    window.VQ2 = window.VQ2 || {};
    window.VQ2.quizNow = { index: 3, total: 10, 答える() { return {}; },
                           つぎへ() { return true; }, 採点を見る() { return null; } };
    L.板("じゃまな ボード", "ここに 何か 書いてある。");
    await new Promise((r) => setTimeout(r, 300));
    const 板前 = !!document.getElementById("vqLiveNote").classList.contains("show");
    const r1 = await L.tool("closeScreen", {});
    await new Promise((r) => setTimeout(r, 400));
    const 板後 = !!document.getElementById("vqLiveNote").classList.contains("show");
    const クイズ残 = !!(window.VQ2 && window.VQ2.quizNow);
    /* もう一度「閉じて」。こんどは 手前に 何も 無い＝**閉じてはいけない** */
    const r2 = await L.tool("closeScreen", {});
    const クイズ残2 = !!(window.VQ2 && window.VQ2.quizNow);
    return { 板前, 板後, クイズ残, クイズ残2,
             一回目: { 閉じた: r1 && r1.閉じた, だめ: r1 && r1.だめ },
             二回目: { 閉じた: r2 && r2.閉じた, だめ: r2 && r2.だめ,
                       つぎ: String((r2 && r2.つぎ) || "").slice(0, 60) } };
  });
  ok("板が 出ている状態を 作れた", 閉.板前 === true, 閉);
  ok("★ 1 回目は **板だけ** 閉じる", 閉.板後 === false && /ボード/.test(String(閉.一回目.閉じた || "")), 閉);
  ok("★ クイズは 開いたまま", 閉.クイズ残 === true, 閉);
  ok("★ 2 回目は **閉じない**（クイズを 守る）", !!閉.二回目.だめ, 閉);
  ok("なぜ 閉じないかを 伝える", /消え|確かめ/.test(String(閉.二回目.だめ || "") + String(閉.二回目.つぎ || "")), 閉.二回目);
  ok("★ クイズは 消えていない", 閉.クイズ残2 === true, 閉);

  節("⑫ 例外が 出ていない");
  const 新赤 = 赤.filter((x) => !/favicon|ERR_|Failed to load/i.test(x));
  ok("画面の例外が 0（" + 新赤.length + "）", 新赤.length === 0, 新赤.slice(0, 4));

  await browser.close(); srv.close();
  console.log("\n════════════════════════════════════════════");
  console.log("  合計 " + (pass + fail) + " 件 / 通った " + pass + " / 落ちた " + fail);
  if (落ち.length) { console.log("  落ちたもの:"); 落ち.forEach((x) => console.log("   - " + x)); }
  console.log("════════════════════════════════════════════");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("落ちました: " + (e && e.stack || e)); process.exit(1); });
