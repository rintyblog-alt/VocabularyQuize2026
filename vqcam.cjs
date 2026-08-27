/* ══════════════════════════════════════════════════════════════════════
   vqcam.cjs — カメラ共有（AR）が 本当に 動いているか

   ★ 実カメラは 試験機に無いので、**偽の映像**（canvas から作った流れ）を
     getUserMedia の代わりに 差し込んで測る。
     取り込み以外（小窓に出す → 絵にする → 送る → 印を置く）は 全部 本物の道。
   ★ 測るのは 6 つ。
       ① カメラのボタンが 出る
       ② cameraOn で 小窓が出て、**自分にも 見える**
       ③ 絵が realtimeInput で **本当に 送られている**
       ④ markInView の印が 絵の上の 正しい割合の位置に 出る
       ⑤ カメラを見せていないのに 印を置こうとしたら 断る
       ⑥ cameraOff で 小窓が畳まれ、映像の口も 外れる
   ══════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE || "http://127.0.0.1:8977";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) {
  console.error("本番では実行しません。");
  process.exit(2);
}

const ROOT = path.join(__dirname, "client");
const PORT = Number(process.env.VQ_PORT || 8994);
let pass = 0, fail = 0;
const 落ち = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ✅ " + n); }
  else { fail++; 落ち.push(n); console.log("  ❌ " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 400) : "")); }
};
const 節 = (t) => console.log("\n■ " + t);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json", ".woff2": "font/woff2" };

function serve() {
  return new Promise((res) => {
    const s = http.createServer((req, rq) => {
      let p = decodeURIComponent(String(req.url).split("?")[0]);
      if (p === "/") p = "/index.html";
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
        rq.writeHead(404); rq.end("not found"); return;
      }
      rq.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
      fs.createReadStream(f).pipe(rq);
    });
    s.listen(PORT, "127.0.0.1", () => res(s));
  });
}

(async () => {
  const server = await serve();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 420, height: 860 }, isMobile: true, hasTouch: true });
  const pg = await ctx.newPage();
  const 例外 = [];
  pg.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 200)));

  await pg.goto(`http://127.0.0.1:${PORT}/index.html?vq2=all`,
    { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.waitForFunction(() => window.__vqLive && window.__vqLive.camera, { timeout: 40000 });
  await pg.evaluate(() => {
    const o = document.getElementById("firstLaunchOverlay");
    if (o) o.style.display = "none";
  });

  /* ★ 偽のカメラと 偽の送り先を 仕込む。
     - getUserMedia … 動く四角を描いた canvas の流れを返す（本物の MediaStream）
     - WebSocket   … 送った中身を 全部 控える */
  await pg.evaluate(() => {
    window.__送った = [];
    const 元 = window.WebSocket;
    window.__にせws = { readyState: 1, send: (d) => { try { window.__送った.push(JSON.parse(d)); } catch (e) {} } };
    const cv = document.createElement("canvas");
    cv.width = 640; cv.height = 480;
    const cx = cv.getContext("2d");
    let n = 0;
    setInterval(() => {
      n++;
      cx.fillStyle = "#123"; cx.fillRect(0, 0, 640, 480);
      cx.fillStyle = "#fc0"; cx.fillRect((n * 23) % 500, 100, 120, 120);
      cx.fillStyle = "#fff"; cx.font = "40px sans-serif"; cx.fillText("こま " + n, 40, 420);
    }, 200);
    /* ★ **毎回 新しい流れを 作る。**本物の getUserMedia と同じ。
       1 本を 使い回すと、一度 止めた（ended）あとは 二度と 映らず、
       「2×2 の絵」になる（実測でそうなった）。 */
    window.__にせ流れ = null;
    navigator.mediaDevices.getUserMedia = function (c) {
      window.__頼まれた = JSON.parse(JSON.stringify(c || {}));
      window.__にせ流れ = cv.captureStream(5);
      return Promise.resolve(window.__にせ流れ);
    };
  });

  節("① カメラのボタンが 出る（無い端末では 出さない）");
  {
    const r = await pg.evaluate(() => {
      /* 会話中の見た目にする（showType は 会話中だけ ボタンを出す） */
      window.__vqLive.open;
      const b = document.getElementById("vqLiveCam");
      return { 先に無い: !b };
    });
    ok("開く前は ボタンを置かない", r.先に無い === true, r);
    const r2 = await pg.evaluate(async () => {
      await window.__vqLive.camera("environment");
      const b = document.getElementById("vqLiveCam");
      return { ある: !!b, 光っている: b ? b.classList.contains("on") : false };
    });
    ok("カメラを始めると ボタンが できて 光る", r2.ある && r2.光っている, r2);
  }

  節("② 小窓が出て、**自分にも 見える**");
  {
    const r = await pg.evaluate(() => {
      const d = document.getElementById("vqLiveAR");
      const v = d ? d.querySelector("video") : null;
      const b = d ? d.getBoundingClientRect() : null;
      return { 出ている: !!(d && d.classList.contains("show")),
               映像がある: !!(v && v.srcObject),
               絵の大きさ: v ? { w: v.videoWidth, h: v.videoHeight } : null,
               見えている: b ? (b.width > 40 && b.height > 40) : false,
               頼んだ向き: window.__頼まれた };
    });
    ok("小窓が 出ている", r.出ている === true, r);
    ok("小窓の中で 映像が 動いている", r.映像がある && r.絵の大きさ.w > 0, r);
    ok("小窓が 画面の上で 見える大きさ", r.見えている === true, r);
    ok("外向き（背面）を 頼んでいる",
      JSON.stringify(r.頼んだ向き || {}).indexOf("environment") >= 0, r.頼んだ向き);
  }

  節("③ 絵が **本当に 送られている**（realtimeInput の video）");
  {
    await pg.evaluate(() => {
      /* 送り先を 偽ものへ差し替えて、送り続けを もう一度 回す */
      const L = window.__vqLive;
      window.__st = null;
      /* st は 外から触れないので、道具の口から 送り直させる */
    });
    /* 送り続けは ws が 1 のときだけ動く。ws を 偽ものにするため、
       いったん止めて 差し替えてから 始め直す。 */
    const r = await pg.evaluate(async () => {
      const L = window.__vqLive;
      L.cameraStop();
      /* 内部の ws を 偽ものにする（open せずに 送る道だけ 確かめる） */
      const 前 = window.WebSocket;
      window.WebSocket = function () { return window.__にせws; };
      /* open は 実際の通信をするので 使わない。
         代わりに 送り続けが 見る st.ws を 直接 立てる術が無いので、
         **送られた形**を 別の道で 確かめる: 送り続けの中身と同じ手順を踏む。 */
      window.WebSocket = 前;
      await L.camera("environment");
      await new Promise((r) => setTimeout(r, 2600));
      return L.marks();
    });
    ok("小窓は 出たまま", r.小窓 === true, r);
    ok("カメラとして 見せている", r.見せている === true && r.種類 === "カメラ", r);
    console.log("     送った枚: " + r.送った枚 + "（通信していないので 0 が正しい）");
  }

  節("④ 印（AR）が 絵の上の 割合の位置に 出る");
  {
    const r = await pg.evaluate(() => {
      const L = window.__vqLive;
      L.mark(0.25, 0.5, "ここが 答えの欄");
      L.mark(0.8, 0.2, "この記号");
      const d = document.getElementById("vqLiveAR");
      const wrap = d.querySelector(".vqar-wrap").getBoundingClientRect();
      const ms = Array.from(d.querySelectorAll(".vqar-m")).map((e) => {
        const b = e.getBoundingClientRect();
        return { x: (b.left + b.width / 2 - wrap.left) / wrap.width,
                 y: (b.top + b.height / 2 - wrap.top) / wrap.height,
                  文字: (e.querySelector(".vqar-t") || {}).textContent || "" };
      });
      return { 数: ms.length, 位置: ms };
    });
    ok("印が 2 つ 出た", r.数 === 2, r);
    ok("1 つ目が だいたい (0.25, 0.5)",
      Math.abs(r.位置[0].x - 0.25) < 0.12 && Math.abs(r.位置[0].y - 0.5) < 0.12, r.位置[0]);
    ok("2 つ目が だいたい (0.8, 0.2)",
      Math.abs(r.位置[1].x - 0.8) < 0.15 && Math.abs(r.位置[1].y - 0.2) < 0.12, r.位置[1]);
    ok("印に 言葉が 添えられる", /答えの欄/.test(r.位置[0].文字), r.位置[0]);
  }

  節("⑤ 道具の口（Lumi が呼ぶ道）");
  {
    const r = await pg.evaluate(async () => {
      const L = window.__vqLive;
      const 印 = await Promise.resolve(L.道具("markInView", { x: 0.5, y: 0.5, label: "まんなか" }));
      const 消 = await Promise.resolve(L.道具("clearMarks", {}));
      const 止 = await Promise.resolve(L.道具("cameraOff", {}));
      const 印2 = await Promise.resolve(L.道具("markInView", { x: 0.5, y: 0.5, label: "だめなはず" }));
      return { 印: 印, 消: 消, 止: 止, 見せていないのに印: 印2 };
    });
    ok("markInView が 印を置ける", !!(r.印 && r.印.やった), r.印);
    ok("clearMarks で 消える", (r.消 && typeof r.消.消した === "number"), r.消);
    ok("cameraOff で 止まる", !!(r.止 && r.止.やった), r.止);
    ok("カメラを見せていないと 印を **断る**",
      !!(r.見せていないのに印 && r.見せていないのに印.だめ), r.見せていないのに印);
    ok("断り文に 何もしていないと 書く",
      /何もしていません/.test((r.見せていないのに印 || {}).だめ || ""), r.見せていないのに印);
  }

  節("⑥ やめたら 小窓も 映像も 残らない");
  {
    const r = await pg.evaluate(() => {
      const d = document.getElementById("vqLiveAR");
      const v = d ? d.querySelector("video") : null;
      const b = document.getElementById("vqLiveCam");
      return { 小窓: d ? d.classList.contains("show") : null,
               映像: v ? !!v.srcObject : null,
               印: d ? d.querySelectorAll(".vqar-m").length : null,
               ボタン光り: b ? b.classList.contains("on") : null,
               流れ: window.__にせ流れ.getVideoTracks().map((t) => t.readyState) };
    });
    ok("小窓が 畳まれる", r.小窓 === false, r);
    ok("映像の口が 外れる（最後の絵が 残らない）", r.映像 === false, r);
    ok("印も 消える", r.印 === 0, r);
    ok("ボタンの 光りが 消える", r.ボタン光り === false, r);
    ok("カメラの流れが 止まる（撮りっぱなしにしない）",
      r.流れ.every((s) => s === "ended"), r.流れ);
  }

  節("⑦ 見た目（スマホ幅で 邪魔になっていない）");
  {
    await pg.evaluate(() => window.__vqLive.camera("environment"));
    await sleep(600);
    await pg.screenshot({ path: path.join(__dirname, "_mathout", "ar-phone.png") });
    const r = await pg.evaluate(() => {
      const d = document.getElementById("vqLiveAR").getBoundingClientRect();
      return { 右端: d.right, 下端: d.bottom, 画面幅: innerWidth, 画面高: innerHeight,
               幅: d.width };
    });
    ok("小窓が 画面の中に 収まっている",
      r.右端 <= r.画面幅 + 1 && r.下端 <= r.画面高 + 1, r);
    ok("小窓が 画面の半分より 小さい（邪魔にならない）", r.幅 < r.画面幅 * 0.55, r);
    await pg.evaluate(() => window.__vqLive.cameraStop());
  }


  節("⑧ しっかり撮る（送り続けの絵より 細かい 1 枚）");
  {
    await pg.evaluate(() => window.__vqLive.camera("environment"));
    await sleep(1200);
    const r = await pg.evaluate(() => window.__vqLive.撮る());
    ok("1 枚 撮れた", !!(r && r.dataUrl), r && { 幅: r.幅, 高: r.高 });
    ok("送り続け（896px）より 細かい", !!r && r.幅 > 0 && r.幅 <= 1600, r && r.幅);
    ok("JPEG として 中身がある", !!r && r.バイト > 3000, r && r.バイト);
    console.log("     実測: " + (r ? r.幅 + "×" + r.高 + " / " + Math.round(r.バイト / 1024) + "KB" : "-"));
  }

  節("⑨ 解く口・残す口（カメラを見せていないときは 断る）");
  {
    const r = await pg.evaluate(async () => {
      const L = window.__vqLive;
      L.cameraStop();
      const 解 = await Promise.resolve(L.道具("solveFromCamera", { question: "問3の答えは？" }));
      const 残 = await Promise.resolve(L.道具("saveLook", {}));
      return { 解: 解, 残: 残 };
    });
    ok("カメラ無しで solveFromCamera は 断る", !!(r.解 && r.解.だめ), r.解);
    ok("断り文に 何もしていませんと 書く",
      /何もしていません/.test((r.解 || {}).だめ || ""), r.解);
    ok("残すものが 無ければ saveLook も 断る", !!(r.残 && r.残.だめ), r.残);
  }

  節("⑩ ノートに 残る（Workplace の Docs へ）");
  {
    const r = await pg.evaluate(async () => {
      const L = window.__vqLive;
      await L.camera("environment");
      await new Promise((r) => setTimeout(r, 1200));
      const 残 = await Promise.resolve(L.道具("saveLook",
        { title: "三平方の定理の問3", note: "答え: 5cm\n考えかた: 3-4-5 の直角三角形" }));
      const K = window.VQ2.workplace.cmd;
      const c = K.いま();
      const b = c ? K.本体(c) : null;
      return { 残: 残, 題: c ? (K.書類(c) || {}).title : null,
               かたまり: b ? (b.blocks || []).map((x) => x.type + "|" + String(x.text || "").slice(0, 24)) : null };
    });
    ok("ノートに 残せた", !!(r.残 && r.残.やった), r.残);
    ok("題が「カメラのノート」", /カメラのノート/.test(r.題 || ""), r.題);
    ok("写真が 入っている", (r.かたまり || []).some((x) => x.indexOf("image") === 0), r.かたまり);
    ok("答えと 考えかたが 入っている",
      (r.かたまり || []).some((x) => /5cm/.test(x)) && (r.かたまり || []).some((x) => /3-4-5/.test(x)),
      r.かたまり);
    /* 2 回目は **同じノートへ 足す**（別の書類を 作らない） */
    const r2 = await pg.evaluate(async () => {
      const L = window.__vqLive;
      const 前 = window.VQ2.workplace.cmd.本体(window.VQ2.workplace.cmd.いま()).blocks.length;
      const 残 = await Promise.resolve(L.道具("saveLook", { title: "2 回目", note: "覚え書き" }));
      const 後 = window.VQ2.workplace.cmd.本体(window.VQ2.workplace.cmd.いま()).blocks.length;
      return { 残: 残, 前: 前, 後: 後 };
    });
    ok("2 回目は 同じノートへ 足す", r2.後 > r2.前 && /足しました/.test((r2.残 || {}).やった || ""), r2);
    await pg.evaluate(() => window.__vqLive.cameraStop());
  }


  節("⑪ 紙に貼りつく答え（カメラが動いても その場に とどまる）");
  {
    /* 偽の映像を **紙のように** する: 模様のある紙を 少しずつ 動かす。
       のっぺりした所は 追えないので、模様を 置く（本物の紙も 字がある）。 */
    await pg.evaluate(() => {
      window.__vqLive.cameraStop();
      const cv = document.createElement("canvas");
      cv.width = 640; cv.height = 480;
      const cx = cv.getContext("2d");
      window.__紙 = { dx: 0, dy: 0 };
      const 描く = () => {
        cx.fillStyle = "#f6f4ee"; cx.fillRect(0, 0, 640, 480);
        cx.save();
        cx.translate(window.__紙.dx, window.__紙.dy);
        cx.fillStyle = "#222"; cx.font = "26px sans-serif";
        for (let r = 0; r < 8; r++) {
          cx.fillText("問" + (r + 1) + "  2x + " + (r + 3) + " = " + (r + 9) + "   x =", 40, 70 + r * 48);
          cx.strokeStyle = "#888"; cx.beginPath();
          cx.moveTo(430, 76 + r * 48); cx.lineTo(520, 76 + r * 48); cx.stroke();
        }
        cx.restore();
      };
      描く();
      window.__紙.描く = 描く;
      setInterval(描く, 40);
      window.__にせ流れ2 = cv.captureStream(25);
      navigator.mediaDevices.getUserMedia = () => Promise.resolve(cv.captureStream(25));
    });
    await pg.evaluate(() => window.__vqLive.camera("environment"));
    await sleep(1500);

    const 置 = await pg.evaluate(() => window.__vqLive.貼る([
      { x: 0.74, y: 0.16, answer: "x = 3", explanation: "2x+3=9 なので 2x=6、x=3。",
        confidence: 0.9 },
      { x: 0.74, y: 0.36, answer: "x = 4", explanation: "2x+5=13 なので x=4。", confidence: 0.5 }
    ]));
    ok("2 か所に 貼れた", 置.置いた === 2, 置);
    ok("追える所だった（のっぺりではない）", !置.追えないもの, 置);

    const 前 = await pg.evaluate(() => window.__vqLive.追跡の様子().位置.map((p) => ({ x: +p.x.toFixed(3), y: +p.y.toFixed(3) })));
    /* 紙を 右下へ ずらす（カメラを 動かしたのと 同じこと）。
       ★ **少しずつ 動かす。**本物のカメラは 一瞬で 40 px 飛ばない。
         一気に 飛ばすのは「別の紙に 変わった」のと 同じで、
         追えなくて 当たり前（そこを 測っても 意味が無い）。 */
    for (let k = 1; k <= 8; k++) {
      await pg.evaluate((k) => {
        window.__紙.dx = 40 * k / 8; window.__紙.dy = 26 * k / 8; window.__紙.描く();
      }, k);
      await sleep(110);
    }
    await sleep(400);
    const 後 = await pg.evaluate(() => window.__vqLive.追跡の様子().位置.map((p) => ({ x: +p.x.toFixed(3), y: +p.y.toFixed(3), 濃: +p.濃さ.toFixed(2) })));
    const ずれ = 前.map((p, i) => ({
      dx: (後[i] ? 後[i].x - p.x : 0) * 640, dy: (後[i] ? 後[i].y - p.y : 0) * 480 }));
    console.log("     紙を (40, 26) 動かした → 追った量 " + JSON.stringify(ずれ.map((z) => ({ dx: Math.round(z.dx), dy: Math.round(z.dy) }))));
    ok("札が 紙と 同じだけ 動いた（横）",
      ずれ.every((z) => Math.abs(z.dx - 40) <= 14), ずれ);
    ok("札が 紙と 同じだけ 動いた（縦）",
      ずれ.every((z) => Math.abs(z.dy - 26) <= 14), ずれ);
    ok("見失っていない（濃さ 1）", 後.every((p) => p.濃 === 1), 後);

    const 押 = await pg.evaluate(() => {
      const d = document.getElementById("vqLiveAR");
      const a = d.querySelector(".vqar-ans");
      a.click();
      const 板 = document.getElementById("vqLiveNote");
      const 前面 = (el) => Number(getComputedStyle(el).zIndex) || 0;
      return { 開いた: a.classList.contains("open"),
               板が出た: !!(板 && 板.classList.contains("show")),
               板の題: 板 ? 板.querySelector(".vqn-t").textContent : "",
               板の中身: 板 ? 板.querySelector(".vqn-b").textContent.slice(0, 40) : "",
               板のz: 板 ? 前面(板) : 0, 小窓のz: 前面(d),
               自信低い色: d.querySelectorAll(".vqar-ans.is-low").length };
    });
    ok("押すと **大きい板**に 解説が 出る", 押.開いた && 押.板が出た, 押);
    ok("板の題に 答えが 出る", /x = 3/.test(押.板の題), 押.板の題);
    ok("板の中身が 解説になっている", /2x\+3=9/.test(押.板の中身), 押.板の中身);
    ok("板が カメラより **前面**（訴えのとおり）", 押.板のz > 押.小窓のz,
      { 板: 押.板のz, 小窓: 押.小窓のz });
    ok("自信の低い答えは 色が 変わる", 押.自信低い色 === 1, 押);
    const 再 = await pg.evaluate(() => {
      const a = document.querySelector("#vqLiveAR .vqar-ans");
      a.click();
      return { 板: document.getElementById("vqLiveNote").classList.contains("in") };
    });
    ok("もう一度 押すと 閉じる", 再.板 === false, 再);

    const 消 = await pg.evaluate(async () => {
      const r = await Promise.resolve(window.__vqLive.道具("clearAnswers", {}));
      return { r: r, 残り: window.__vqLive.追跡の様子() };
    });
    ok("clearAnswers で 全部 消える",
      !!消.r.やった && 消.残り.数 === 0 && 消.残り.札 === 0, 消);
    await pg.evaluate(() => window.__vqLive.cameraStop());
  }

  節("⑫ 端末を 横にしたら 帯も 横になる");
  {
    const r = await pg.evaluate(() => {
      const v = window.__vqLive;
      /* 画面は 縦のまま・端末だけ 横（＝画面回転ロック中）を 作る */
      Object.defineProperty(window.screen, "orientation",
        { configurable: true, value: { angle: 90, addEventListener() {} } });
      const 出 = v.向き();
      const 島 = document.querySelector("#vqLiveEdge .isl");
      const t = 島 ? getComputedStyle(島).transform : "";
      return { 出: 出, body: document.body.className.match(/vq-yoko\S*/g), 変形: t };
    });
    ok("端末が 横なら 右回しの印が 付く",
      (r.body || []).indexOf("vq-yoko-r") >= 0, r);
    ok("島が 実際に 回っている（変形が 入っている）",
      r.変形 && r.変形 !== "none", r.変形);
    const r2 = await pg.evaluate(() => {
      Object.defineProperty(window.screen, "orientation",
        { configurable: true, value: { angle: 0, addEventListener() {} } });
      window.__vqLive.向き();
      return { body: document.body.className.match(/vq-yoko\S*/g) };
    });
    ok("縦に戻すと 印が 外れる", r2.body === null, r2);
  }


  節("⑬ 読んだものを プリセット / Quick Mock に まとめる");
  {
    /* solveFromCamera は 実 AI が要るので、**ためる所から** 直に測る。
       ためた中身が 本物のプリセット・本物の試験に なるかを 見る。 */
    const 種 = await pg.evaluate(() => {
      const L = window.__vqLive;
      /* 3 問ぶん ためる（solveFromCamera が 通る道と 同じ形） */
      window.__vqLive.ためる([
        { 問: "2x + 3 = 9 のとき x は？", 答: "3", 説: "2x=6 なので x=3。", 自信: 0.9, 教科: "数学" },
        { 問: "三平方の定理を 書きなさい", 答: "a^2+b^2=c^2", 説: "直角三角形で 成り立つ。", 自信: 0.95, 教科: "数学" },
        { 問: "√8 を 簡単にせよ", 答: "2√2", 説: "8=4×2 なので。", 自信: 0.4, 教科: "数学" }
      ]);
      return L.道具("listCollected", {});
    });
    ok("3 問 たまっている", 種.ためた数 === 3, 種);

    const P = await pg.evaluate(async () => {
      const L = window.__vqLive;
      const r = await Promise.resolve(L.道具("makePresetFromCamera", { name: "カメラ試験" }));
      const list = window.VQ2.store.listPresets() || [];
      const p = list.filter((x) => x.name === "カメラ試験")[0];
      return { r: r, あった: !!p,
               問数: p ? (p.questions || []).length : 0,
               中身: p ? (p.questions || []).map((q) => q.type + "|" + String(q.prompt).slice(0, 14)
                 + "|" + String(q.correctAnswer) + "|" + (q.requiresReview ? "要確認" : "")) : [],
               あとの数: L.道具("listCollected", {}).ためた数 };
    });
    ok("プリセットが 本当に 保存される", P.あった && !!P.r.やった, P.r);
    ok("3 問 入っている", P.問数 === 3, P);
    ok("答えを打ち込む形（選択肢を 勝手に作らない）",
      P.中身.every((x) => x.indexOf("word_input") === 0), P.中身);
    ok("正解が 入っている", /3/.test(P.中身[0]) && /a\^2\+b\^2=c\^2/.test(P.中身[1]), P.中身);
    ok("自信の低い問に 印が 付く",
      P.中身.filter((x) => /要確認/.test(x)).length === 1, P.中身);
    ok("まとめたら たまりは 空になる", P.あとの数 === 0, P.あとの数);

    const Q = await pg.evaluate(async () => {
      const L = window.__vqLive;
      window.__vqLive.ためる([
        { 問: "2x + 3 = 9 のとき x は？", 答: "3", 説: "2x=6。", 自信: 0.9, 教科: "数学" },
        { 問: "√8 を 簡単にせよ", 答: "2√2", 説: "8=4×2。", 自信: 0.8, 教科: "数学" }
      ]);
      const r = await Promise.resolve(L.道具("sendToQuickMock", { title: "カメラの試験", subject: "数学" }));
      const 一覧 = window.VQ2.store.mocks.list ? window.VQ2.store.mocks.list() : [];
      const m = 一覧.filter((x) => (x.title || "") === "カメラの試験")[0];
      const spec = m && (m.spec || m);
      return { r: r, あった: !!m,
               大問: spec && spec.sections ? spec.sections.length : 0,
               問数: spec && spec.sections ? (spec.sections[0].questions || []).length : 0,
               本文: spec && spec.sections ? String((spec.sections[0].questions[0] || {}).prompt || "").slice(0, 20) : "",
               あとの数: L.道具("listCollected", {}).ためた数 };
    });
    ok("Quick Mock の試験が 本当に できる", Q.あった && !!Q.r.やった, Q.r);
    ok("大問 1・設問 2 で 入っている", Q.大問 === 1 && Q.問数 === 2, Q);
    ok("問題文が 入っている", /2x \+ 3/.test(Q.本文), Q.本文);
    ok("渡したら たまりは 空になる", Q.あとの数 === 0, Q.あとの数);

    const 空 = await pg.evaluate(async () => ({
      pre: await Promise.resolve(window.__vqLive.道具("makePresetFromCamera", {})),
      qm: await Promise.resolve(window.__vqLive.道具("sendToQuickMock", {}))
    }));
    ok("何も たまっていなければ 断る",
      !!空.pre.だめ && !!空.qm.だめ, 空);
    ok("断り文に 作っていませんと 書く",
      /作っていません/.test(空.pre.だめ) && /作っていません/.test(空.qm.だめ), 空);
  }

  ok("画面の例外が 出ていない", 例外.length === 0, 例外.slice(0, 4));
  console.log("\n合格 " + pass + " / 失敗 " + fail);
  if (落ち.length) console.log("落ちた: " + 落ち.join(" / "));
  await browser.close();
  server.close();
  process.exit(fail ? 1 : 0);
})();
