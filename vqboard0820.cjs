/* ══════════════════════════════════════════════════════════════════════════
   vqboard0820.cjs — 2026-08-20 の 訴え 4 つを 実際に 動かして 確かめる

   訴え:
     ①「矢印の位置が ちょっと 気になる」
     ②「毎回 再生ボタンの 解説が 同じ マークダウンで 出てくるから
        型が あるのかと ちょっと 疑ってしまう。型は 大枠でいい。
        **毎回 必ず ランダムに** なるようにして」
     ③「他の マークダウンも 増やしていいよ。さらに 増やしても」
     ④「普通の ボードを 全画面に したりだとかも。ゲームや アプリの
        ボードと 同じように、ボードを 自由に 縮小拡大できたりとかも いいかも」

   実 AI は 使わない。WebSocket と 音まわりを 偽物に して、
   **実際の判断コードを そのまま** 動かす。

   使い方: node vqboard0820.cjs
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

/* VQ_MIN=1 で **配っているもの（圧縮ずみ）**を 動かす。
   ★ 中身を 文字で 探す 検査は 圧縮で 名前が 変わるので、
     そこだけ 生の source を 読む（第 2 引数）。 */
function 読む(名, 生) {
  const d = path.join(__dirname, (!生 && process.env.VQ_MIN) ? "client/js" : "js-src");
  const f = fs.readdirSync(d).find((x) => new RegExp("^" + 名 + "\\.[0-9a-f]{10}\\.js$").test(x));
  if (!f) throw new Error("js-src に " + 名 + " が ありません");
  return fs.readFileSync(path.join(d, f), "utf8");
}

const 台紙 = `<!doctype html><meta charset="utf-8"><title>board 0820</title><body></body>`;

/* 板に 出す 中身。左端の 見出し（x≒0）を わざと 入れる
   ——**そこが 矢印の はみ出しが 起きる 所**。 */
const 中身 = [
  "# 国家の 三要素",
  "",
  "国家が 成り立つために 必要な 3 つの 大事なもの",
  "",
  "1. **領域**（国土）",
  "  - 国の 広さ、場所。",
  "2. **国民**",
  "  - そこに 住む 人々。",
  "3. **主権**（統治する 力）",
  "  - 国の ルールを 自分たちで 決める 権利。",
  "",
  "---",
  "",
  "**これらが そろって 初めて 国家に なるよ！**"
].join("\n");

(async () => {
  const ライブ = 読む("vq-live");
  const 束 = 読む("bundle-core");

  節("① 直したところが 入っているか（**元のコード**を 見る）");
  const 生ライブ0 = 読む("vq-live", true), 生束0 = 読む("bundle-core", true);
  ok("矢印は 1 行目を 指す", /行3\[0\] \|\| 場所\(的\)/.test(生束0));
  ok("矢印の 尾を 板の中に 収める", /尾x = Math\.max\(4, Math\.min\(板W - 4, 尾x\)\)/.test(生束0));
  ok("矢じりを 角度から 出す", /Math\.atan2\(頭y - 尾y, 頭x - 尾x\)/.test(生束0));
  ok("番号の玉が はみ出さない", /Math\.max\(10, r0\.x - 2\)/.test(生束0));
  ok("線の 控えを 持つ（引き直せる）", /var 台帳 = \[\], 座標もの = \[\]/.test(生束0));
  ok("引き直す 口が ある", /引き直す: 引き直す/.test(生束0));
  ok("大きさが 変わったら 引き直す", /直し待ち = setTimeout/.test(生束0));

  ok("チェックの 並びが 組める", /vqmd-ck/.test(生束0));
  ok("注意書き（囲み）が 組める", /vqmd-cal-/.test(生束0));
  ok("たためる", /vqmd-dt/.test(生束0));
  ok("ことばの意味（::）が 組める", /vqmd-dl/.test(生束0));
  ok("ふりがなが 振れる", /<ruby>\$1<rt>\$2<\/rt><\/ruby>/.test(生束0));
  ok("押す鍵が 出せる", /vqmd-k/.test(生束0));

  ok("帯は .vqn-b の **外**に 作る", /板の操作をつなぐ/.test(生ライブ0));
  ok("どの板でも 帯を 出す", /#vqLiveNote \.vqn-ops\{display:flex/.test(生ライブ0));
  ok("字の 大きさで 拡大縮小する", /function 板の倍率を当てる/.test(生ライブ0));
  ok("拡大したら 線を 引き直す", /function 線を引き直す/.test(生ライブ0));
  ok("板の 形を 回す", /function つぎの形/.test(生ライブ0));
  ok("付箋の 形も 回す", /function 付箋の書きかた/.test(生ライブ0));
  ok("番号の 取り違え（var の 巻き上げ）を 直した",
     /var o0番 = Number\.isFinite\(Number\(a\.no\)\)/.test(生ライブ0));
  ok("印を currentColor で 塗っていない", !/vqmd-cal-i[\s\S]{0,200}background:currentColor/.test(生束0));
  ok("チェックの 箱を 潰す font-size:0 を やめた",
     !/vqmd-ck\.on \.vqmd-bx\{color:inherit;font-size:0/.test(生束0));
  ok("形の 名に 使ってよい場面が 添えてある", /ときだけ/.test(生ライブ0));

  節("② マークダウンだけ 先に 組んでみる（画面 無しで）");
  {
    delete require.cache[require.resolve("./client/core/md/render.js")];
    require("./client/core/md/render.js");
    const M = globalThis.VQMD;
    const h = M.render([
      "- [ ] まだ", "- [x] 済んだ", "",
      "> [!大事] ここが 芯", "> - 中に 箇条書きも 入る", "",
      "??? もっと 細かく", "たたんだ 中身", "???", "",
      "領域 :: 国の 広さ", "主権 :: 決める 力", "",
      "H~2~O と x^2^ と [[Esc]] と {国家|こっか} と 主権《しゅけん》", "",
      "> ふつうの 引用"
    ].join("\n"));
    ok("チェック（空）", /vqmd-ck"/.test(h), h.slice(0, 120));
    ok("チェック（済）", /vqmd-ck on/.test(h));
    ok("注意書き（大事）", /vqmd-cal-kan/.test(h));
    ok("注意書きの 中に 箇条書きが 入る", /vqmd-cal-b[\s\S]*?vqmd-ul/.test(h));
    ok("たためる", /<details class="vqmd-dt"/.test(h));
    ok("ことばの意味", /<dl class="vqmd-dl"><dt>領域<\/dt><dd>国の 広さ<\/dd>/.test(h));
    ok("下つき H2O", /H<sub>2<\/sub>O/.test(h));
    ok("上つき x2", /x<sup>2<\/sup>/.test(h));
    ok("押す鍵", /<kbd class="vqmd-k">Esc<\/kbd>/.test(h));
    ok("ふりがな（かっこ）", /<ruby>国家<rt>こっか<\/rt><\/ruby>/.test(h));
    ok("ふりがな（《》）", /<ruby>主権<rt>しゅけん<\/rt><\/ruby>/.test(h));
    ok("ふつうの 引用は そのまま", /<blockquote class="vqmd-q">/.test(h));
    /* ★ 前からの 書きかたが 壊れていないか */
    const g = M.render("# み\n\n**太字** ==大事== ~~消し~~ `code`\n\n| a | b |\n|---|---|\n| 1 | 2 |\n");
    ok("（前から）見出し・太字・マーカー・取り消し・表",
       /<h1 class="vqmd-h">/.test(g) && /<strong>/.test(g) && /<mark>/.test(g)
       && /<s>消し<\/s>/.test(g) && /<table class="vqmd-t">/.test(g), g.slice(0, 200));
    /* ★ かぎかっこ代わりの 《》を ふりがなに しない */
    const k = M.render("答えは 《重要》 です。");
    ok("《漢字》は ふりがなに しない", !/<ruby>/.test(k), k);
    /* ★ 声に 出す文（素）から 記号が 落ちている */
    const 素 = M.素("> [!コツ] {国家|こっか} は H~2~O じゃない\n- [x] 済んだ");
    ok("声の文に 記号が 残らない",
       !/\[!/.test(素) && !/[{}|~]/.test(素) && /国家/.test(素), 素);
  }

  /* ── ここから 画面で 動かす ─────────────────────────────── */
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
  const page = await browser.newPage({ viewport: { width: 900, height: 820 } });
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
        try {
          const j = JSON.parse(t);
          if (j.setup) setTimeout(() => this.onmessage &&
            this.onmessage({ data: JSON.stringify({ setupComplete: {} }) }), 5);
          if (j.clientContent) {
            window.__送った.push(JSON.stringify(j.clientContent));
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
      constructor() { this.port = { postMessage() {}, onmessage: null }; }
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

  await page.evaluate(async (md) => {
    const L = window.__vqLive;
    await L.open();
    for (let i = 0; i < 60 && !window.__ws; i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 400));
    L.板("国家の 三要素の 解説", md);
    await new Promise((r) => setTimeout(r, 400));
  }, 中身);

  節("③ 矢印が **指したい所**を 指しているか");
  const 矢 = await page.evaluate(async () => {
    const L = window.__vqLive;
    const d = document.getElementById("vqLiveNote");
    const b = d.querySelector(".vqn-b");
    const 区 = await Promise.resolve(L.道具("boardBlocks", {}));
    const 出 = [];
    /* 見出し（左端・x≒0）を 含めて 3 か所に 引く */
    for (const i of [0, 1, 4]) {
      await Promise.resolve(L.道具("boardMark", { style: "arrow", block: i }));
    }
    await new Promise((r) => setTimeout(r, 200));
    const W = b.scrollWidth, H = b.scrollHeight;
    const 面 = b.querySelector(".vqp-lay");
    const 線 = [...面.querySelectorAll("path")];
    /* 尾 → 頭 の 直線だけ（矢じりは 3 点）を 拾う */
    const 軸 = 線.filter((p) => (p.getAttribute("d").match(/[ML]/g) || []).length === 2);
    for (const p of 軸) {
      const m = /M([\d.-]+) ([\d.-]+) L([\d.-]+) ([\d.-]+)/.exec(p.getAttribute("d"));
      出.push({ 尾x: +m[1], 尾y: +m[2], 頭x: +m[3], 頭y: +m[4] });
    }
    /* 指したい 所（block=0 の 1 行目）の 場所 */
    const 札 = "h1,h2,h3,h4,p,li,blockquote,pre,table,.vqmd-math,.vqm-svg,figure";
    const 並 = [...b.querySelectorAll(札)];
    const 見た = [];
    const 区切り = 並.filter((e) => {
      if (見た.some((x) => x.contains(e))) return false;
      if (!String(e.textContent || "").trim()) return false;
      見た.push(e); return true;
    });
    const bb = b.getBoundingClientRect();
    const 的 = [0, 1, 4].map((i) => {
      const e = 区切り[i];
      const r = document.createRange(); r.selectNodeContents(e);
      const c = [...r.getClientRects()].filter((x) => x.width > 2 && x.height > 2)[0]
              || e.getBoundingClientRect();
      return { 上: c.top - bb.top + b.scrollTop, 下: c.bottom - bb.top + b.scrollTop,
               左: c.left - bb.left + b.scrollLeft, 右: c.right - bb.left + b.scrollLeft };
    });
    return { W, H, 出, 的, 区切りの数: 区.区切り ? 区.区切り.length : (区.数 || 0) };
  });
  ok("矢印を 3 本 引けた", 矢.出.length === 3, 矢.出);
  ok("★ 尾が **板の外へ 出ない**（左端の 見出しでも）",
     矢.出.every((a) => a.尾x >= 0 && a.尾x <= 矢.W && a.尾y >= 0 && a.尾y <= 矢.H), 矢);
  ok("★ 頭も 板の中",
     矢.出.every((a) => a.頭x >= 0 && a.頭x <= 矢.W && a.頭y >= 0 && a.頭y <= 矢.H), 矢);
  {
    /* 頭が **1 行目の 高さ**に あるか（前は かたまり ぜんぶの まんなかだった） */
    const ずれ = 矢.出.map((a, i) => {
      const t = 矢.的[i];
      return Math.round(Math.min(Math.abs(a.頭y - (t.上 + t.下) / 2),
                                 Math.abs(a.頭y - t.上), Math.abs(a.頭y - t.下)));
    });
    console.log("     頭の 高さの ずれ: " + ずれ.join(" / ") + " px");
    ok("★ 頭が 1 行目の 高さに ある（ずれ 6px 以内）", ずれ.every((z) => z <= 6), ずれ);
  }
  {
    /* 頭が 字に かぶっていないか（横に 6〜20px 離す） */
    const 離れ = 矢.出.map((a, i) => {
      const t = 矢.的[i];
      if (a.頭x <= t.左) return Math.round(t.左 - a.頭x);
      if (a.頭x >= t.右) return Math.round(a.頭x - t.右);
      return -1;   /* 字の 上に 乗っている（上下から 指した ときだけ 許す） */
    });
    console.log("     字との 離れ: " + 離れ.join(" / ") + " px");
    ok("★ 頭が 字の 上に 乗らない（横から 指す ときは 4〜20px）",
       離れ.every((z) => z === -1 || (z >= 4 && z <= 20)), 離れ);
  }

  節("④ 番号の 玉が はみ出さない");
  const 玉 = await page.evaluate(async () => {
    const L = window.__vqLive;
    await Promise.resolve(L.道具("boardClear", {}));
    for (const i of [0, 4, 6]) await Promise.resolve(L.道具("boardMark", { style: "number", block: i }));
    await new Promise((r) => setTimeout(r, 150));
    const b = document.getElementById("vqLiveNote").querySelector(".vqn-b");
    return [...b.querySelectorAll(".vqp-no")].map((e) => ({ 左: parseFloat(e.style.left), 字: e.textContent }));
  });
  ok("玉が 3 つ 出る", 玉.length === 3, 玉);
  ok("★ 玉が 板の 左端から 出ない", 玉.every((x) => x.左 >= 10), 玉);
  ok("番が ①②③ と 続く", 玉.map((x) => x.字).join("") === "123", 玉);

  節("⑤ 番号を **指定できる**（var の 巻き上げの 直し）");
  const 番 = await page.evaluate(async () => {
    const L = window.__vqLive;
    await Promise.resolve(L.道具("boardClear", {}));
    await Promise.resolve(L.道具("boardMark", { style: "number", block: 1, no: 7 }));
    await new Promise((r) => setTimeout(r, 120));
    const b = document.getElementById("vqLiveNote").querySelector(".vqn-b");
    return [...b.querySelectorAll(".vqp-no")].map((e) => e.textContent);
  });
  ok("★ no=7 と 指したら 7 に なる", 番.join("") === "7", 番);

  節("⑥ 拡大・縮小・全画面（普通の 板でも）");
  const 帯 = await page.evaluate(() => {
    const d = document.getElementById("vqLiveNote");
    const ops = d.querySelector(".vqn-ops");
    const b = d.querySelector(".vqn-b");
    return { ある: !!ops, 見える: ops ? getComputedStyle(ops).display : "無し",
             中身の外: !!(ops && b && !b.contains(ops)),
             板の字: (b.textContent || "").indexOf("全画面") };
  });
  ok("★ 普通の 板にも 帯が 出る", 帯.ある && 帯.見える === "flex", 帯);
  ok("★ 帯は 中身の **外**（板の字に 混ざらない）", 帯.中身の外 === true && 帯.板の字 < 0, 帯);

  const 拡 = await page.evaluate(async () => {
    const d = document.getElementById("vqLiveNote");
    const b = d.querySelector(".vqn-b");
    const L = window.__vqLive;
    await Promise.resolve(L.道具("boardClear", {}));
    await Promise.resolve(L.道具("boardMark", { style: "marker", block: 2 }));
    await new Promise((r) => setTimeout(r, 150));
    const 前字 = parseFloat(getComputedStyle(b).fontSize);
    const 面 = b.querySelector(".vqp-lay");
    const 前線 = 面.querySelector("rect").getBoundingClientRect();
    /* 拡大を 3 回 押す */
    for (let i = 0; i < 3; i++) d.querySelector('[data-op="in"]').click();
    await new Promise((r) => setTimeout(r, 500));
    const 後字 = parseFloat(getComputedStyle(b).fontSize);
    const 面2 = b.querySelector(".vqp-lay");
    const 後線 = 面2.querySelector("rect").getBoundingClientRect();
    /* 引いた 所（block=2 の 1 行目）と 線が 合っているか */
    const 札 = "h1,h2,h3,h4,p,li,blockquote,pre,table";
    const 並 = [...b.querySelectorAll(札)];
    const 見た = [];
    const 区切り = 並.filter((e) => {
      if (見た.some((x) => x.contains(e))) return false;
      if (!String(e.textContent || "").trim()) return false;
      見た.push(e); return true;
    });
    const r = document.createRange(); r.selectNodeContents(区切り[2]);
    const c = [...r.getClientRects()].filter((x) => x.width > 2 && x.height > 2)[0];
    const 表示 = d.querySelector("[data-zoomv]").textContent;
    return { 前字, 後字, 表示,
             線の下: Math.round(後線.bottom), 字の下: Math.round(c.bottom),
             線の左: Math.round(後線.left), 字の左: Math.round(c.left),
             前の線の下: Math.round(前線.bottom) };
  });
  console.log("     字: " + 拡.前字 + "px → " + 拡.後字 + "px（" + 拡.表示 + "）");
  ok("★ 押すと 字が 大きくなる", 拡.後字 > 拡.前字 + 1, 拡);
  ok("表示が 130% に なる", 拡.表示 === "130%", 拡);
  ok("★ 拡大しても 線が 字に 付いてくる（下の ずれ 4px 以内）",
     Math.abs(拡.線の下 - 拡.字の下) <= 4, 拡);
  ok("★ 横の ずれも 4px 以内", Math.abs(拡.線の左 - 拡.字の左) <= 4, 拡);
  ok("（拡大前と 同じ所では ない＝ちゃんと 引き直している）",
     Math.abs(拡.線の下 - 拡.前の線の下) > 2, 拡);

  const 全 = await page.evaluate(async () => {
    const d = document.getElementById("vqLiveNote");
    d.querySelector('[data-op="reset"]').click();
    await new Promise((r) => setTimeout(r, 200));
    d.querySelector('[data-op="zen"]').click();
    await new Promise((r) => setTimeout(r, 350));
    const r1 = d.getBoundingClientRect();
    const 中 = { 全画面: d.classList.contains("vqn-zen"),
                 幅: Math.round(r1.width), 高: Math.round(r1.height),
                 文言: d.querySelector('[data-op="zen"]').textContent.trim() };
    d.querySelector('[data-op="zen"]').click();
    await new Promise((r) => setTimeout(r, 350));
    const r2 = d.getBoundingClientRect();
    return { 中, 戻り: { 全画面: d.classList.contains("vqn-zen"), 幅: Math.round(r2.width) },
             画面幅: window.innerWidth, 画面高: window.innerHeight };
  });
  ok("★ 普通の 板を 全画面に できる", 全.中.全画面 === true, 全);
  ok("画面 いっぱいに なる", 全.中.幅 >= 全.画面幅 - 2 && 全.中.高 >= 全.画面高 - 2, 全);
  ok("押すと「もどす」に 変わる", /もどす/.test(全.中.文言), 全.中);
  ok("★ もう一度 押すと 戻る", 全.戻り.全画面 === false && 全.戻り.幅 < 全.画面幅, 全);

  節("⑦ 板の 形が **毎回 変わる**");
  const 形 = await page.evaluate(async () => {
    const L = window.__vqLive;
    const 出 = [];
    for (let i = 0; i < 8; i++) {
      const r = await Promise.resolve(L.道具("showNote", { title: "形" + i, markdown: "# あ\n\n本文" }));
      const m = /次の 形: \*\*([^*]+)\*\*/.exec(String(r.つぎ || ""));
      出.push(m ? m[1] : "（無し）");
    }
    return 出;
  });
  console.log("     " + 形.join(" → "));
  ok("★ 毎回 形が 添えられる", 形.every((x) => x !== "（無し）"), 形);
  ok("★ 8 回とも ちがう形（使いきるまで 同じものを 出さない）",
     new Set(形).size === 8, 形);
  ok("同じ形が 続けて 出ない", 形.every((x, i) => i === 0 || x !== 形[i - 1]), 形);

  節("⑧ 付箋の 書きかたも 毎回 変わる（解説の 途中）");
  const 付 = await page.evaluate(async () => {
    const L = window.__vqLive;
    L.板("形の テスト",
      "# ひとつめ\n\n一つめの 話。\n\n# ふたつめ\n\n二つめの 話。\n\n"
      + "# みっつめ\n\n三つめの 話。\n\n# よっつめ\n\n四つめの 話。\n");
    await new Promise((r) => setTimeout(r, 300));
    window.__送った.length = 0;
    document.querySelector("#vqLiveNote .vqn-p").click();
    await new Promise((r) => setTimeout(r, 3000));
    const 手 = window.__送った
      .map((t) => (/今回 貼るなら こう 書いてみてください:\\n　　([^"\\]+)/.exec(t) || [])[1])
      .filter(Boolean);
    return { 数: window.__送った.length, 手 };
  });
  console.log("     " + 付.手.join(" ／ "));
  ok("解説の 番が 回っている", 付.数 >= 3, 付);
  ok("★ 付箋の 書きかたが 毎回 添えられる", 付.手.length >= 3, 付);
  ok("★ 続けて 同じ 書きかたに ならない",
     付.手.every((x, i) => i === 0 || x !== 付.手[i - 1]), 付.手);

  節("⑨ 印が **見えるか**（白地に 白で 消えていないか）");
  const 印 = await page.evaluate(async () => {
    const L = window.__vqLive;
    L.板("印の テスト",
      "> [!メモ] ためし\n\n> [!注意] ためし\n\n> [!コツ] ためし\n\n- [x] 済んだ\n- [ ] まだ\n");
    await new Promise((r) => setTimeout(r, 350));
    const d = document.getElementById("vqLiveNote");
    const b = d.querySelector(".vqn-b");
    /* 色を 数にする */
    const 解 = (s2) => {
      const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(s2 || "");
      return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null;
    };
    /* 透けている色を 下の色に 重ねる（実際に 見える色） */
    const 重ね = (上, 下) => ({ r: 上.r * 上.a + 下.r * (1 - 上.a),
                                g: 上.g * 上.a + 下.g * (1 - 上.a),
                                b: 上.b * 上.a + 下.b * (1 - 上.a), a: 1 });
    const 明るさ = (c) => { const f = (v) => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
      return .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b); };
    const 比 = (x, y) => { const a = 明るさ(x), b2 = 明るさ(y);
      return (Math.max(a, b2) + .05) / (Math.min(a, b2) + .05); };
    /* 下地（板そのもの）。透けていたら 白の 上に 重ねる */
    let 地 = 解(getComputedStyle(d).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
    if (地.a < 1) 地 = 重ね(地, { r: 255, g: 255, b: 255, a: 1 });

    const 見る = (e, 名) => {
      const c = getComputedStyle(e), r = e.getBoundingClientRect();
      const 字 = 解(c.color) || { r: 0, g: 0, b: 0, a: 1 };
      let 背 = 解(c.backgroundColor) || { r: 0, g: 0, b: 0, a: 0 };
      /* 印の 親（囲み）にも 薄い色が ある。順に 重ねる */
      let 下 = 地;
      const 親 = e.closest(".vqmd-cal");
      if (親) { const p2 = 解(getComputedStyle(親).backgroundColor); if (p2) 下 = 重ね(p2, 下); }
      const 実背 = 重ね(背, 下);
      return { 名, 中身: (e.textContent || "").trim(),
               幅: Math.round(r.width), 高: Math.round(r.height),
               字色: c.color, 背色: c.backgroundColor,
               比: Math.round(比(字, 実背) * 100) / 100 };
    };
    const 出 = [];
    b.querySelectorAll(".vqmd-cal-i").forEach((e) => 出.push(見る(e, "囲みの 印")));
    b.querySelectorAll(".vqmd-ck.on .vqmd-bx").forEach((e) => 出.push(見る(e, "チェック（済）")));
    b.querySelectorAll(".vqmd-ck:not(.on) .vqmd-bx").forEach((e) => 出.push(見る(e, "チェック（まだ）")));
    return 出;
  });
  印.forEach((x) => console.log("     " + x.名 + " 「" + x.中身 + "」 "
    + x.幅 + "×" + x.高 + "px  字" + x.字色 + " / 背" + x.背色 + "  くらべ " + x.比));
  ok("印が 5 つ ある（囲み 3・チェック 2）", 印.length === 5, 印.length);
  ok("★ 印が つぶれていない（10px 以上）",
     印.every((x) => x.幅 >= 10 && x.高 >= 10), 印);
  ok("★ 印が 背景に 沈んでいない（くらべ 3 以上）",
     印.every((x) => x.比 >= 3), 印);
  ok("★ チェック（済）に ✓ が 出ている",
     印.filter((x) => x.名 === "チェック（済）").every((x) => x.中身 === "✓"), 印);
  ok("囲みの 印に 字が 入っている",
     印.filter((x) => x.名 === "囲みの 印").every((x) => x.中身.length >= 1), 印);

  節("⑩ 関係ないものを 入れさせない（渡す ことばを 見る）");
  const 言 = await page.evaluate(async () => {
    const L = window.__vqLive;
    L.板("ことばの テスト", "# あ\n\n一つめ。\n\n二つめ。\n\n三つめ。\n");
    await new Promise((r) => setTimeout(r, 300));
    window.__送った.length = 0;
    document.querySelector("#vqLiveNote .vqn-p").click();
    await new Promise((r) => setTimeout(r, 2200));
    const 全 = window.__送った.join("\n");
    const r = await Promise.resolve(L.道具("showNote", { title: "つぎ", markdown: "# あ\n\n本文" }));
    return { 解説: 全, つぎ: String(r.つぎ || "") };
  });
  ok("★ 解説中: 合わないなら 貼らない と 伝える",
     /合わないなら 貼らないでください/.test(言.解説), 言.解説.slice(0, 200));
  ok("★ 解説中: 関係ないものを 作らせない",
     /関係ないもの/.test(言.解説) && /作らないでください/.test(言.解説), 言.解説.slice(0, 200));
  ok("★ 解説中: 形は おまけだと 言う", /形は おまけです/.test(言.解説), 言.解説.slice(0, 200));
  ok("★ 板を 出したとき: 合わなければ 別の形で よい",
     /話に 合わないなら 別の形で かまいません/.test(言.つぎ), 言.つぎ);
  ok("★ 板を 出したとき: 見本や 練習は 書かない",
     /見本や 練習は 書きません/.test(言.つぎ), 言.つぎ);
  ok("形の 名に 「〜ときだけ」が 添えてある",
     /ときだけ/.test(言.解説), 言.解説.slice(0, 200));

  節("⑪ 解説は **意味のまとまり**で（1 行ずつだと くどい）");
  const 段組 = await page.evaluate(async () => {
    const L = window.__vqLive;
    L.板("まとめの テスト",
      "# 光合成とは\n\n植物が **光** のエネルギーを使うはたらき。\n\n"
      + "- 材料は ==二酸化炭素== と 水\n- できるのは デンプンと 酸素\n- 場所は 葉緑体（ようりょくたい）\n\n"
      + "# 呼吸との ちがい\n\n呼吸は 昼も夜も おこなう。\n\n"
      + "> [!大事] 光合成は 光が あるときだけ\n");
    await new Promise((r) => setTimeout(r, 400));
    const d = document.getElementById("vqLiveNote");
    const 面 = window.VQB.play.作る({ 中身: d.querySelector(".vqn-b"), 巻物: d });
    const 段 = 面.段();
    const 行 = 面.数();
    面.片づける();
    return { 行, 段: 段.map((x) => ({ 見出し: x.見出し, 番号: x.番号, 重み: x.重み,
                                     見どころ: x.見どころ.map((g) => g.語 + "/" + g.種) })) };
  });
  console.log("     行 " + 段組.行 + " → まとまり " + 段組.段.length);
  段組.段.forEach((x) => console.log("       ■" + x.見出し + " 番号" + JSON.stringify(x.番号)
    + " 重み" + x.重み + " 見どころ" + JSON.stringify(x.見どころ)));
  ok("★ 行より まとまりの ほうが 少ない（くどくない）", 段組.段.length < 段組.行, 段組);
  ok("★ 見出しで 区切れている", 段組.段.length === 2
     && /光合成とは/.test(段組.段[0].見出し) && /ちがい/.test(段組.段[1].見出し), 段組.段);
  ok("★ 箇条書きは 1 つの まとまりに 入る", 段組.段[0].番号.length >= 4, 段組.段[0]);
  ok("★★ 蛍光ペンを 拾う", 段組.段[0].見どころ.some((g) => /二酸化炭素\/蛍光ペン/.test(g)), 段組.段[0]);
  ok("★★ 太字を 拾う", 段組.段[0].見どころ.some((g) => /光\/太字/.test(g)), 段組.段[0]);
  ok("★★ かっこの中を 拾う",
     段組.段[0].見どころ.some((g) => /ようりょくたい\/かっこの中/.test(g)), 段組.段[0]);
  ok("★ 注意書きの ある まとまりは 重みが 高い", 段組.段[1].重み >= 5, 段組.段[1]);

  節("⑫ 渡す ことばを 見る（必ず触れる・繰り返さない）");
  const 伝え = await page.evaluate(async () => {
    const L = window.__vqLive;
    L.板("まとめの テスト",
      "# 光合成とは\n\n植物が **光** を使う。\n\n- 材料は ==二酸化炭素==\n\n"
      + "# 呼吸\n\n夜も する。\n");
    await new Promise((r) => setTimeout(r, 350));
    window.__送った.length = 0;
    document.querySelector("#vqLiveNote .vqn-p").click();
    await new Promise((r) => setTimeout(r, 4000));
    return { 数: window.__送った.length, 全: window.__送った.join("\n---\n"),
             二つ目: String(window.__送った[1] || "").slice(0, 500) };
  });
  console.log("     送った回数 " + 伝え.数);
  ok("★ まとまりの数だけ 送る（行ごとでは ない）", 伝え.数 <= 4, 伝え.数);
  ok("★★ 必ず 触れる ところを 名指しする", /ここは 必ず 触れてください/.test(伝え.全), 伝え.全.slice(0, 200));
  ok("★★ 蛍光ペンの語を 渡している", /二酸化炭素/.test(伝え.全), 伝え.全.slice(0, 200));
  ok("★ 印の 種類も 伝える（蛍光ペン・太字・かっこの中）",
     /蛍光ペン|太字|かっこの中/.test(伝え.全), 伝え.全.slice(0, 200));
  ok("★★ もう話したことを 渡して 繰り返させない",
     /もう 話したこと/.test(伝え.全) && /同じことを 言い直さない/.test(伝え.全), 伝え.二つ目);
  ok("大事な所は しっかり・ふつうは 短く",
     /しっかり|短く/.test(伝え.全), 伝え.全.slice(0, 200));

  節("⑬ 必ず 上から順に（2 回 押しても 釣られない）");
  const 順 = await page.evaluate(async () => {
    const L = window.__vqLive;
    const 番 = () => window.__送った.map((t) => {
      const m = /【(\d+) \/ (\d+)】/.exec(t); return m ? Number(m[1]) : 0;
    }).filter(Boolean);
    L.板("順番の テスト",
      "# ひとつめ\n\n一の 話。\n\n# ふたつめ\n\n二の 話。\n\n# みっつめ\n\n三の 話。\n");
    await new Promise((r) => setTimeout(r, 350));
    const b = document.querySelector("#vqLiveNote .vqn-p");
    window.__送った.length = 0;
    b.click();                                   /* 1 回目 */
    await new Promise((r) => setTimeout(r, 900));
    const 途中 = 番();
    b.click();                                   /* 止める */
    await new Promise((r) => setTimeout(r, 400));
    const 止めた = { 動いている: b.getAttribute("aria-pressed") };
    window.__送った.length = 0;
    b.click();                                   /* もう一度 始める */
    await new Promise((r) => setTimeout(r, 4200));
    return { 途中, 止めた, 二回目: 番(), 全: window.__送った.length };
  });
  console.log("     1 回目 " + JSON.stringify(順.途中) + " ／ 止めたあと "
    + JSON.stringify(順.止めた) + " ／ 2 回目 " + JSON.stringify(順.二回目));
  ok("止めたら ボタンが 戻る", 順.止めた.動いている === "false", 順.止めた);
  ok("★★ 2 回目も **1 から** 始まる", 順.二回目[0] === 1, 順.二回目);
  ok("★★ 番号が 飛ばない・戻らない（上から順）",
     順.二回目.every(function (n, i) { return i === 0 || n === 順.二回目[i - 1] + 1; }), 順.二回目);
  ok("★ 同じ番号を 二度 送らない",
     new Set(順.二回目).size === 順.二回目.length, 順.二回目);
  ok("★ 3 つ 全部 話す", 順.二回目.length === 3, 順.二回目);

  節("⑭ 合図が 前の回に 釣られない（**元のコード**を 見る）");
  const 生ライブ = 読む("vq-live", true);
  ok("★ 合図は **その回のもの**", /解説\.合図番 === 回/.test(生ライブ));
  ok("★ 止めた回の 合図は 受けない", /解説 && 解説\.合図 && !解説\.止めた/.test(生ライブ));
  ok("★ 声が 鳴り終わってから 次へ", /!st\.speaking \|\| 待 > 30000/.test(生ライブ));

  節("⑮ 暗い画面でも 字が 読めるか（表・注意書き）");
  const 暗 = await page.evaluate(async () => {
    const 箱 = document.createElement("div");
    箱.className = "vqmd";
    箱.style.cssText = "color:#F4F3F9;background:#14121C;padding:10px";
    箱.innerHTML = window.VQMD.render(
      "| 語 | 意味 |\n|---|---|\n| 光合成 | 光で 作る |\n\n"
      + "> [!大事] ここが 芯\n\n- [ ] 確かめる\n\n用語 :: 説明\n");
    document.body.appendChild(箱);
    const 見 = (q) => { const e = 箱.querySelector(q); return e ? getComputedStyle(e).color : null; };
    const 出 = { 親: getComputedStyle(箱).color, th: 見("th"), td: 見("td"),
                 注意の題: 見(".vqmd-cal-t"), 注意の印: 見(".vqmd-cal-i"),
                 dt: 見("dt"), li: 見("li") };
    箱.remove();
    return 出;
  });
  console.log("     " + JSON.stringify(暗));
  ok("★★ 表の 見出しが 親と 同じ色（黒く ならない）", 暗.th === 暗.親, 暗);
  ok("★★ 表の 中身も 親と 同じ色", 暗.td === 暗.親, 暗);
  ok("★ 注意書きの 題も 読める色", 暗.注意の題 === 暗.親, 暗);
  ok("★ 注意書きの 印も 読める色", 暗.注意の印 === 暗.親, 暗);
  ok("★ 用語も 読める色", 暗.dt === 暗.親, 暗);
  ok("★ 箇条書きも 読める色", 暗.li === 暗.親, 暗);

  節("⑯ 例外が 出ていない");
  ok("画面の例外が 0（" + 赤.length + "）", 赤.length === 0, 赤.slice(0, 4));

  await browser.close();
  srv.close();

  console.log("\n════════════════════════════════════════════");
  console.log("  合計 " + (pass + fail) + " 件 / 通った " + pass + " / 落ちた " + fail);
  if (落ち.length) { console.log("  落ちたもの:"); 落ち.forEach((x) => console.log("   - " + x)); }
  console.log("════════════════════════════════════════════");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("落ちました: " + (e && e.stack || e)); process.exit(1); });
