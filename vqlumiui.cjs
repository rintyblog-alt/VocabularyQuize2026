/* ══════════════════════════════════════════════════════════════════════════
   vqlumiui.cjs — Lumi の画面まわり（2026-08-18 の訴え）

   訴え:
     ① 文字で打つ画面で **自分と Lumi のやりとり**を さかのぼって見たい。
        空間に メッセージが 浮かんでいる感じ。邪魔なときは しまえるように。
     ② 右下の カメラと 文字のボタンが **離れすぎ**。もっと隣に。
     ③ そのボタンを 設定で 出す／出さない を選べるように。
     ④ 返事が 長いとき、**2 行を超えたら** 展開／たたむ で 制御したい。
     ⑤ ボードの位置・ボードのたたむ／ひらく・カメラの小窓の位置を
        画面の中で 自由に 決めたい。
     ⑥ スマホでも PC でも 効くこと。

   使い方: node vqlumiui.cjs
   ══════════════════════════════════════════════════════════════════════════ */
const { chromium, devices } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE || "http://127.0.0.1";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

const ROOT = path.join(__dirname, "client");
const PORT = Number(process.env.VQ_PORT || 8994);
let pass = 0, fail = 0; const 落ち = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ✅ " + n); }
  else { fail++; 落ち.push(n); console.log("  ❌ " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 400) : "")); }
};
const 節 = (t) => console.log("\n■ " + t);
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json", ".woff2": "font/woff2", ".m4a": "audio/mp4" };

function serve() {
  return new Promise((res) => {
    const s = http.createServer((req, rq) => {
      let p = decodeURIComponent(String(req.url).split("?")[0]);
      if (p === "/") p = "/index.html";
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rq.writeHead(404); rq.end("x"); return; }
      rq.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" });
      fs.createReadStream(f).pipe(rq);
    });
    s.listen(PORT, "127.0.0.1", () => res(s));
  });
}

const 長文 = "これは とても 長い 返事です。".repeat(14);

async function 一台(browser, 名, ctxOpts) {
  const ctx = await browser.newContext(ctxOpts);
  const pg = await ctx.newPage();
  const 例外 = [];
  pg.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 160)));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html?vq2=all`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.waitForFunction(() => window.__vqLive && window.__vqLive.言う, { timeout: 40000 });
  await pg.evaluate(() => {
    const o = document.getElementById("firstLaunchOverlay"); if (o) o.style.display = "none";
    window.__vqLive.忘れる();
  });

  console.log(`\n════ ${名} ════`);

  /* ── ② 右下のボタンが 隣どうしか ───────────────────────────── */
  節(`${名} / ② 右下のボタンの並び`);
  {
    const d = await pg.evaluate(() => window.__vqLive.ボタン(true));
    ok("置き場がある", d.置き場 === true, d);
    ok("並びは マイク → 履歴 → カメラ → 文字",
      JSON.stringify(d.並び) === JSON.stringify(["vqLiveMic", "vqLiveLogBtn", "vqLiveCam", "vqLiveType"]), d.並び);

    await pg.waitForTimeout(300);
    const 位 = await pg.evaluate(() => {
      const d2 = document.getElementById("vqLiveDock");
      const r = (id) => { const e = document.getElementById(id); if (!e) return null;
        const b = e.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), c: Math.round(b.left + b.width / 2), w: Math.round(b.width) }; };
      const box = d2.getBoundingClientRect();
      return { cam: r("vqLiveCam"), type: r("vqLiveType"), log: r("vqLiveLogBtn"),
               画面幅: window.innerWidth, 箱右: Math.round(box.right) };
    });
    const 隙 = 位.type && 位.cam ? 位.type.l - 位.cam.r : 999;
    const 芯 = 位.type && 位.cam ? 位.type.c - 位.cam.c : 999;
    ok(`カメラと文字の 隙間が 12px 以内（実測 ${隙}px）`, 隙 >= 0 && 隙 <= 12, 位);
    ok(`カメラと文字の 中心の差が 60px 以内（実測 ${芯}px・直す前は 104px）`, 芯 <= 60, 位);
    ok("履歴ボタンも 同じ列に 並ぶ", 位.log && 位.cam && (位.cam.l - 位.log.r) <= 12, 位);
    ok("画面の外へ 出ていない", 位.箱右 <= 位.画面幅, 位);
  }

  /* ── ③ 設定で 出す／出さない ─────────────────────────────── */
  節(`${名} / ③ 設定で ボタンを 出す・出さない`);
  {
    await pg.evaluate(() => window.__vqSet.set("voice.dock", false));
    await pg.waitForTimeout(200);
    const 消 = await pg.evaluate(() => {
      const d = document.getElementById("vqLiveDock");
      return { 印: document.body.classList.contains("vq-live-nodock"),
               見える: d ? d.getClientRects().length > 0 : false };
    });
    ok("切ると 置き場ごと 消える", 消.印 === true && 消.見える === false, 消);
    await pg.evaluate(() => window.__vqSet.set("voice.dock", true));
    await pg.waitForTimeout(200);
    const 戻 = await pg.evaluate(() => document.getElementById("vqLiveDock").getClientRects().length > 0);
    ok("入れると 戻る", 戻 === true);
  }

  /* ── ① 会話の履歴 ─────────────────────────────────────────── */
  節(`${名} / ① 会話の履歴`);
  {
    await pg.evaluate(() => {
      const v = window.__vqLive;
      v.私の言葉("次のテストの範囲を教えて");
      v.言う("いいよ。範囲は 教科書の 3 章までだね。", false);
      v.私の言葉("ありがとう");
    });
    const h = await pg.evaluate(() => window.__vqLive.履歴());
    ok("履歴に 3 件 入る", h.length === 3, h.map((x) => x.who));
    ok("自分の言葉と Lumi の言葉が 区別されている",
      h[0].who === "me" && h[1].who === "ai" && h[2].who === "me", h.map((x) => x.who));
    ok("中身が そのまま 残っている", h[0].text === "次のテストの範囲を教えて", h[0]);

    await pg.evaluate(() => window.__vqLive.履歴を出す(true));
    await pg.waitForTimeout(350);
    const 様 = await pg.evaluate(() => {
      const s = window.__vqLive.履歴の様子();
      const d = document.getElementById("vqLiveLog");
      const 玉 = Array.from(d.querySelectorAll(".vqlg-m"));
      const box = d.getBoundingClientRect();
      return { ...s, 文: 玉.map((x) => x.querySelector(".vqlg-t").textContent),
               自分が右: 玉[0].classList.contains("me") ? false : true,
               右寄せ: getComputedStyle(玉[0]).justifyContent,
               箱: { l: Math.round(box.left), r: Math.round(box.right), t: Math.round(box.top), b: Math.round(box.bottom) },
               画面: { w: window.innerWidth, h: window.innerHeight },
               素通り: getComputedStyle(d).pointerEvents,
               玉は押せる: getComputedStyle(玉[0].querySelector(".vqlg-c")).pointerEvents };
    });
    ok("出すと 画面に見える", 様.出ている === true && 様.件数 === 3, 様);
    ok("自分の玉は 右寄せ（Lumi と 見分けがつく）", 様.右寄せ === "flex-end", 様.右寄せ);
    ok("文が そのまま 出ている", 様.文[1] === "いいよ。範囲は 教科書の 3 章までだね。", 様.文);
    ok("箱そのものは 素通り（下の画面を 押せる）", 様.素通り === "none", 様.素通り);
    ok("玉は 押せる", 様.玉は押せる === "auto", 様.玉は押せる);
    ok("画面の外に はみ出していない",
      様.箱.l >= 0 && 様.箱.r <= 様.画面.w + 1 && 様.箱.b <= 様.画面.h + 1, 様);

    await pg.evaluate(() => window.__vqLive.履歴を出す(false));
    await pg.waitForTimeout(300);
    ok("しまうと 消える", (await pg.evaluate(() => window.__vqLive.履歴の様子().出ている)) === false);
  }

  /* ── ① 打つ画面から 出し入れ ───────────────────────────────── */
  節(`${名} / ① 打つ画面の 履歴ボタン`);
  {
    await pg.evaluate(() => window.__vqLive.bar(true));
    await pg.waitForTimeout(400);
    const a = await pg.evaluate(() => {
      const st = window.__vqLive.履歴の様子();
      const sr = document.getElementById("vqLiveBar").shadowRoot;
      const b = sr.querySelector(".log");
      const d = document.getElementById("vqLiveLog").getBoundingClientRect();
      const 帯 = sr.querySelector(".box").getBoundingClientRect();
      return { ...st, ボタン: !!b, 押した状態: b && b.getAttribute("aria-pressed"),
               履歴下端: Math.round(d.bottom), 入力欄上端: Math.round(帯.top) };
    });
    ok("打つ画面を 開くと 履歴も 出る", a.出ている === true, a);
    ok("入力欄に 履歴ボタンが ある", a.ボタン === true && a.押した状態 === "true", a);
    ok("履歴が 入力欄に かぶっていない", a.履歴下端 <= a.入力欄上端 + 1, a);

    await pg.evaluate(() => {
      document.getElementById("vqLiveBar").shadowRoot.querySelector(".log").click();
    });
    await pg.waitForTimeout(300);
    ok("入力欄のボタンで しまえる",
      (await pg.evaluate(() => window.__vqLive.履歴の様子().出ている)) === false);
    await pg.evaluate(() => {
      document.getElementById("vqLiveBar").shadowRoot.querySelector(".log").click();
    });
    await pg.waitForTimeout(300);
    ok("もう一度 押すと 戻る",
      (await pg.evaluate(() => window.__vqLive.履歴の様子().出ている)) === true);
    await pg.evaluate(() => window.__vqLive.bar(false));
    await pg.waitForTimeout(300);
  }

  /* ── ③ 設定で 履歴そのものを 切る ─────────────────────────── */
  節(`${名} / ③ 設定で 履歴を 切る`);
  {
    await pg.evaluate(() => window.__vqSet.set("voice.log", false));
    await pg.waitForTimeout(250);
    const r = await pg.evaluate(() => {
      window.__vqLive.履歴を出す(true);
      const d2 = window.__vqLive.ボタン(true);
      return { 出た: window.__vqLive.履歴の様子().出ている, 並び: d2.見えている };
    });
    ok("切ると 履歴は 出せない", r.出た === false, r);
    ok("切ると 履歴ボタンも 出ない", r.並び.indexOf("vqLiveLogBtn") < 0, r.並び);
    await pg.evaluate(() => window.__vqSet.set("voice.log", true));
    await pg.waitForTimeout(250);
  }

  /* ── ④ 2 行を超えたら 展開・たたむ ────────────────────────── */
  節(`${名} / ④ 長い返事を 畳む`);
  {
    await pg.evaluate(() => { window.__vqLive.島を開く(false); window.__vqLive.言う("うん、そうだね。", false); });
    await pg.waitForTimeout(250);
    const 短 = await pg.evaluate(() => window.__vqLive.島の様子());
    ok("短い返事には ボタンを 出さない", 短.ボタン === false && 短.畳んでいる === false, 短);

    await pg.evaluate((t) => window.__vqLive.言う(t, false), 長文);
    await pg.waitForTimeout(250);
    const 長 = await pg.evaluate(() => {
      const s = window.__vqLive.島の様子();
      const sp = document.querySelector("#vqLiveEdge .isl span");
      const lh = parseFloat(getComputedStyle(sp).lineHeight);
      return { ...s, 高さ: Math.round(sp.getBoundingClientRect().height), 行: Math.round(lh) };
    });
    ok("2 行を超えたら 畳む", 長.畳んでいる === true, 長);
    ok("「つづきを読む」が 出る", 長.ボタン === true && 長.文言 === "つづきを読む", 長);
    ok(`畳んだ高さが 2 行ぶん（実測 ${長.高さ}px / 1 行 ${長.行}px）`,
      長.高さ <= 長.行 * 2 + 4, 長);

    await pg.evaluate(() => document.querySelector("#vqLiveEdge .isl .vqmore").click());
    await pg.waitForTimeout(250);
    const 開 = await pg.evaluate(() => {
      const s = window.__vqLive.島の様子();
      const sp = document.querySelector("#vqLiveEdge .isl span");
      return { ...s, 高さ: Math.round(sp.getBoundingClientRect().height) };
    });
    ok("押すと ひらく", 開.畳んでいる === false && 開.文言 === "たたむ", 開);
    ok("ひらくと 高さが 増える", 開.高さ > 長.高さ, { 前: 長.高さ, 後: 開.高さ });

    await pg.evaluate((t) => window.__vqLive.言う(t + "もうひとつ。", false), 長文);
    await pg.waitForTimeout(250);
    ok("次の返事でも ひらいたまま（読んでいる最中に 引っ込まない）",
      (await pg.evaluate(() => window.__vqLive.島の様子().畳んでいる)) === false);
    await pg.evaluate(() => document.querySelector("#vqLiveEdge .isl .vqmore").click());
    await pg.waitForTimeout(200);

    /* 履歴の玉も 同じ決まり */
    await pg.evaluate((t) => {
      window.__vqLive.私の言葉(t);
      window.__vqLive.履歴を出す(true);
    }, 長文);
    await pg.waitForTimeout(350);
    const 玉 = await pg.evaluate(() => {
      const d = document.getElementById("vqLiveLog");
      const 末 = d.querySelectorAll(".vqlg-m")[d.querySelectorAll(".vqlg-m").length - 1];
      const t = 末.querySelector(".vqlg-t");
      return { long: 末.classList.contains("long"), clip: 末.classList.contains("clip"),
               ボタン見える: 末.querySelector(".vqlg-more").getClientRects().length > 0,
               高さ: Math.round(t.getBoundingClientRect().height),
               行: Math.round(parseFloat(getComputedStyle(t).lineHeight)) };
    });
    ok("履歴の 長い玉も 2 行で 畳む", 玉.long === true && 玉.clip === true, 玉);
    ok("玉に 「つづきを読む」が 出る", 玉.ボタン見える === true, 玉);
    ok(`玉の高さも 2 行ぶん（実測 ${玉.高さ}px）`, 玉.高さ <= 玉.行 * 2 + 4, 玉);
    await pg.evaluate(() => {
      const d = document.getElementById("vqLiveLog");
      const 末 = d.querySelectorAll(".vqlg-m")[d.querySelectorAll(".vqlg-m").length - 1];
      末.querySelector(".vqlg-more").click();
    });
    await pg.waitForTimeout(250);
    ok("玉も 押すと ひらく",
      (await pg.evaluate(() => {
        const d = document.getElementById("vqLiveLog");
        const 末 = d.querySelectorAll(".vqlg-m")[d.querySelectorAll(".vqlg-m").length - 1];
        return !末.classList.contains("clip") && 末.querySelector(".vqlg-more").textContent === "たたむ";
      })) === true);
    await pg.evaluate(() => window.__vqLive.履歴を出す(false));
  }

  /* ── ⑤ ボードの たたむ・位置 ──────────────────────────────── */
  節(`${名} / ⑤ ボードを たたむ・動かす`);
  {
    await pg.evaluate(() => window.__vqLive.板("三平方の定理", "**a² + b² = c²**\n\n- 直角三角形だけ\n- 斜辺が c"));
    await pg.waitForTimeout(350);
    const 出 = await pg.evaluate(() => {
      const d = document.getElementById("vqLiveNote");
      return { 見える: d.getClientRects().length > 0,
               中身: d.querySelector(".vqn-b").getClientRects().length > 0,
               つまみ: !!d.querySelector(".vqn-g"), たたむ: !!d.querySelector(".vqn-f") };
    });
    ok("ボードが 出る", 出.見える === true && 出.中身 === true, 出);
    ok("つまむ所と たたむボタンが ある", 出.つまみ === true && 出.たたむ === true, 出);

    await pg.evaluate(() => document.getElementById("vqLiveNote").querySelector(".vqn-f").click());
    await pg.waitForTimeout(300);
    const 畳 = await pg.evaluate(() => {
      const d = document.getElementById("vqLiveNote");
      return { 中身: d.querySelector(".vqn-b").getClientRects().length > 0,
               頭: d.querySelector(".vqn-h").getClientRects().length > 0,
               高さ: Math.round(d.getBoundingClientRect().height) };
    });
    ok("たたむと 中身が 隠れる", 畳.中身 === false, 畳);
    ok("たたんでも 頭は 残る（またひらける）", 畳.頭 === true, 畳);

    /* たたんだまま 次の板 → たたんだ状態が 続く */
    await pg.evaluate(() => window.__vqLive.板("つぎ", "本文"));
    await pg.waitForTimeout(300);
    ok("次のボードも たたんだまま 出る",
      (await pg.evaluate(() => document.getElementById("vqLiveNote").querySelector(".vqn-b").getClientRects().length === 0)) === true);
    await pg.evaluate(() => document.getElementById("vqLiveNote").querySelector(".vqn-f").click());
    await pg.waitForTimeout(300);
    ok("ひらくと 中身が 戻る",
      (await pg.evaluate(() => document.getElementById("vqLiveNote").querySelector(".vqn-b").getClientRects().length > 0)) === true);

    /* 指でつまんで 動かす（本物の pointer で動かす） */
    const 前 = await pg.evaluate(() => window.__vqLive.置き場().板);
    const 頭 = await pg.evaluate(() => {
      const r = document.getElementById("vqLiveNote").querySelector(".vqn-h").getBoundingClientRect();
      return { x: Math.round(r.left + 60), y: Math.round(r.top + r.height / 2) };
    });
    await pg.mouse.move(頭.x, 頭.y);
    await pg.mouse.down();
    await pg.mouse.move(頭.x - 40, 頭.y + 90, { steps: 8 });
    await pg.mouse.up();
    await pg.waitForTimeout(250);
    const 後 = await pg.evaluate(() => window.__vqLive.置き場().板);
    ok("見出しを つまむと 動く", 後.動かした === true && Math.abs(後.y - 前.y) >= 40, { 前, 後 });

    /* 中身をなぞっても 動かない（読むための スクロールを 奪わない） */
    const 中 = await pg.evaluate(() => {
      const r = document.getElementById("vqLiveNote").querySelector(".vqn-b").getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 10) };
    });
    const 動前 = await pg.evaluate(() => window.__vqLive.置き場().板);
    await pg.mouse.move(中.x, 中.y);
    await pg.mouse.down();
    await pg.mouse.move(中.x + 70, 中.y + 70, { steps: 6 });
    await pg.mouse.up();
    await pg.waitForTimeout(200);
    const 動後 = await pg.evaluate(() => window.__vqLive.置き場().板);
    ok("中身を なぞっても 動かない", 動前.x === 動後.x && 動前.y === 動後.y, { 動前, 動後 });

    /* 置いた場所は 残る */
    await pg.evaluate(() => window.__vqLive.板を閉じる());
    await pg.waitForTimeout(250);
    await pg.evaluate(() => window.__vqLive.板("もどってきた", "本文"));
    await pg.waitForTimeout(400);
    const 再 = await pg.evaluate(() => window.__vqLive.置き場().板);
    ok("閉じて開き直しても 同じ場所に 出る",
      再.動かした === true && Math.abs(再.x - 動後.x) <= 2 && Math.abs(再.y - 動後.y) <= 2, { 動後, 再 });

    /* 画面の外へ 逃げない */
    await pg.evaluate(() => window.__vqLive.動かす("板", 9999, 9999));
    await pg.waitForTimeout(200);
    const 端 = await pg.evaluate(() => {
      const p = window.__vqLive.置き場().板;
      return { ...p, w: window.innerWidth, h: window.innerHeight };
    });
    ok("画面の外へ 逃がさない（56px は 残る）",
      端.x <= 端.w - 56 + 1 && 端.y <= 端.h - 40 + 1 && 端.x + 端.w >= 0, 端);

    await pg.evaluate(() => window.__vqLive.置き場を戻す("板"));
    await pg.waitForTimeout(250);
    ok("位置を 元に戻せる",
      (await pg.evaluate(() => window.__vqLive.置き場().板.動かした)) === false);

    /* ★ スマホは **本物の指**で 動かす（2026-08-18）。
       マウスで動いても、指で動くとは 限らない
       （touch-action を 付け忘れると 画面が スクロールするだけになる）。 */
    if (ctxOpts.hasTouch) {
      const cdp = await pg.context().newCDPSession(pg);
      const なぞる = async (x1, y1, x2, y2) => {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x1, y: y1 }] });
        for (let i = 1; i <= 6; i++) {
          await cdp.send("Input.dispatchTouchEvent", { type: "touchMove",
            touchPoints: [{ x: x1 + (x2 - x1) * i / 6, y: y1 + (y2 - y1) * i / 6 }] });
          await pg.waitForTimeout(20);
        }
        await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      };
      const 前2 = await pg.evaluate(() => ({ ...window.__vqLive.置き場().板, 縦: window.scrollY }));
      const h2 = await pg.evaluate(() => {
        const r = document.getElementById("vqLiveNote").querySelector(".vqn-h").getBoundingClientRect();
        return { x: Math.round(r.left + 70), y: Math.round(r.top + r.height / 2) };
      });
      await なぞる(h2.x, h2.y, h2.x - 30, h2.y + 110);
      await pg.waitForTimeout(300);
      const 後2 = await pg.evaluate(() => ({ ...window.__vqLive.置き場().板, 縦: window.scrollY }));
      ok("指でも つまんで 動かせる",
        後2.動かした === true && Math.abs(後2.y - 前2.y) >= 50, { 前2, 後2 });
      ok("指で動かしても 画面が スクロールしない", 後2.縦 === 前2.縦, { 前2, 後2 });
      await pg.evaluate(() => window.__vqLive.置き場を戻す("板"));
      await pg.waitForTimeout(200);
    }
    await pg.evaluate(() => window.__vqLive.板を閉じる());
  }

  /* ── ⑤ カメラの小窓 ───────────────────────────────────────── */
  節(`${名} / ⑤ カメラの小窓を 動かす`);
  {
    const 始 = await pg.evaluate(async () => {
      try { await window.__vqLive.camera("user"); } catch (e) {}
      await new Promise((r) => setTimeout(r, 900));
      const d = document.getElementById("vqLiveAR");
      return { ある: !!d, 見える: d ? d.getClientRects().length > 0 : false,
               つまみ: !!(d && d.querySelector(".vqar-grip")) };
    });
    if (!始.見える) {
      console.log("  --   カメラを 使えない環境のため、小窓の実測は 飛ばす（" + JSON.stringify(始) + "）");
    } else {
      ok("小窓に つまむ所が ある", 始.つまみ === true, 始);
      const 前 = await pg.evaluate(() => window.__vqLive.置き場().小窓);
      const g = await pg.evaluate(() => {
        const r = document.getElementById("vqLiveAR").querySelector(".vqar-grip").getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
      });
      await pg.mouse.move(g.x, g.y);
      await pg.mouse.down();
      await pg.mouse.move(g.x + 120, g.y - 120, { steps: 8 });
      await pg.mouse.up();
      await pg.waitForTimeout(250);
      const 後 = await pg.evaluate(() => window.__vqLive.置き場().小窓);
      ok("小窓も つまんで 動く", 後.動かした === true && Math.abs(後.x - 前.x) >= 60, { 前, 後 });
      await pg.evaluate(() => { window.__vqLive.置き場を戻す("小窓"); window.__vqLive.cameraStop(); });
    }
  }

  /* ── ⑦ こちらから マイクを止める ──────────────────────────── */
  節(`${名} / ⑦ マイクを止める`);
  {
    const d = await pg.evaluate(() => window.__vqLive.ボタン(true));
    ok("マイクのボタンが 置き場の いちばん左にある", d.並び[0] === "vqLiveMic", d.並び);

    const 前 = await pg.evaluate(() => window.__vqLive.マイク());
    ok("はじめは 止まっていない", 前.止めている === false && 前.印 === false, 前);

    await pg.evaluate(() => document.getElementById("vqLiveMic").click());
    await pg.waitForTimeout(250);
    const 後 = await pg.evaluate(() => {
      const b = document.getElementById("vqLiveMic");
      const dot = document.querySelector("#vqLiveEdge .dot");
      return { ...window.__vqLive.マイク(),
               赤: getComputedStyle(b).backgroundColor,
               押した: b.getAttribute("aria-pressed"),
               名: b.getAttribute("aria-label"),
               斜線: getComputedStyle(b.querySelector(".sl")).display,
               点: dot ? getComputedStyle(dot).backgroundColor : null };
    });
    ok("押すと 止まる", 後.止めている === true && 後.印 === true, 後);
    ok("ボタンが 赤くなる（紫＝働いている と 見分けがつく）",
      /rgb\(229, 72, 77\)/.test(後.赤), 後.赤);
    ok("マイクに 斜線が 入る", 後.斜線 === "block", 後.斜線);
    ok("読み上げにも 伝わる", 後.押した === "true" && /止めています/.test(後.名 || ""), 後);
    ok("画面の上の点も 赤くなる（ボタンを見ていなくても 気づける）",
      /rgb\(229, 72, 77\)/.test(後.点 || ""), 後.点);

    /* 文字を打つ画面を 開け閉めしても 止めが 解けないこと
       （showBar は 閉じるときに muteMic(false) を通る） */
    await pg.evaluate(() => window.__vqLive.bar(true));
    await pg.waitForTimeout(250);
    await pg.evaluate(() => window.__vqLive.bar(false));
    await pg.waitForTimeout(350);
    ok("打つ画面を 開け閉めしても 止めたまま",
      (await pg.evaluate(() => window.__vqLive.マイク().止めている)) === true);

    await pg.evaluate(() => document.getElementById("vqLiveMic").click());
    await pg.waitForTimeout(250);
    const 戻 = await pg.evaluate(() => window.__vqLive.マイク());
    ok("もう一度 押すと 戻る", 戻.止めている === false && 戻.印 === false, 戻);
  }

  /* ── ⑧ Quick Chat へ 会話として残す ───────────────────────── */
  節(`${名} / ⑧ Quick Chat へ 残す`);
  {
    await pg.evaluate(() => {
      const v = window.__vqLive;
      v.履歴を出す(false);
      /* いったん まっさらにする（前の節で 溜まった やりとりも 消す） */
      v.履歴を消す();
      localStorage.removeItem("app.chat.sessions.v2");
      localStorage.removeItem("vq.lumi.chats.v1");
    });

    const 少 = await pg.evaluate(() => window.__vqLive.残す("試験"));
    ok("やりとりが 足りなければ 残さない", !!(少 && 少.だめ), 少);

    await pg.evaluate(() => {
      const v = window.__vqLive;
      v.私の言葉("明日の英検の面接ってどんな流れ？");
      v.言う("入室 → あいさつ → 音読 → 質問 4 つ、の順だよ。音読は 20 秒 黙読してから 読むよ。", false);
      v.私の言葉("音読で気をつけることは？");
      v.言う("固有名詞で 止まらないこと。読み方が 分からなくても 止まらず 進むほうが 点になるよ。", false);
    });
    const r = await pg.evaluate(() => window.__vqLive.残す("試験"));
    ok("残せる", !!(r && r.保存した), r);
    ok("題は 最初の自分の言葉から 作る", /英検の面接/.test(r.題 || ""), r.題);
    ok("4 件 入っている", r.件数 === 4, r);

    const 中 = await pg.evaluate((id) => {
      const 一覧 = JSON.parse(localStorage.getItem("app.chat.sessions.v2") || "[]");
      const 本文 = JSON.parse(localStorage.getItem("app.chat.ses." + id + ".v2") || "[]");
      return { 一覧: 一覧.map((x) => ({ id: x.id, title: x.title, n: x.messageCount })),
               本文: 本文.map((m) => ({ role: m.role, text: m.text, intent: m.intent })) };
    }, r.id);
    ok("Quick Chat の 会話一覧に 1 件 増える",
      中.一覧.length === 1 && 中.一覧[0].id === r.id && 中.一覧[0].n === 4, 中.一覧);
    ok("自分の発言は user、Lumi は ai",
      中.本文[0].role === "user" && 中.本文[1].role === "ai"
      && 中.本文[2].role === "user" && 中.本文[3].role === "ai", 中.本文.map((m) => m.role));
    ok("中身が そのまま 残っている",
      中.本文[0].text === "明日の英検の面接ってどんな流れ？"
      && /固有名詞で 止まらないこと/.test(中.本文[3].text), 中.本文);
    ok("Quick Chat の 形式（Lumi 専用の入れ物を 作っていない）",
      中.本文.every((m) => m.role && typeof m.text === "string"), 中.本文[0]);

    const 二 = await pg.evaluate(() => window.__vqLive.残す("二度目"));
    const 数 = await pg.evaluate(() => JSON.parse(localStorage.getItem("app.chat.sessions.v2") || "[]").length);
    ok("同じ会話を 二度 押しても 増えない", 二.同じ === true && 数 === 1, { 二, 数 });

    /* Quick Chat の本体が 一覧を書き戻して 消したときの ふるまい */
    const 戻 = await pg.evaluate(() => {
      localStorage.setItem("app.chat.sessions.v2", JSON.stringify([]));   /* 本体が 書き戻した想定 */
      const n = window.__vqLive.並べ直す();
      const 一覧 = JSON.parse(localStorage.getItem("app.chat.sessions.v2") || "[]");
      return { n, 件: 一覧.length, id: (一覧[0] || {}).id, title: (一覧[0] || {}).title };
    });
    ok("一覧から 消えても 並べ直せる（本文は 残っている）",
      戻.n === 1 && 戻.件 === 1 && 戻.id === r.id, 戻);

    const 空 = await pg.evaluate((id) => {
      localStorage.setItem("app.chat.sessions.v2", JSON.stringify([]));
      localStorage.removeItem("app.chat.ses." + id + ".v2");             /* 本文まで 無くなった */
      const n = window.__vqLive.並べ直す();
      return { n, 件: JSON.parse(localStorage.getItem("app.chat.sessions.v2") || "[]").length };
    }, r.id);
    ok("本文が 無いものは 一覧に 戻さない（空の行を 作らない）",
      空.n === 0 && 空.件 === 0, 空);

    /* 履歴の頭の ボタンからも 残せる */
    await pg.evaluate((id) => {
      localStorage.removeItem("vq.lumi.chats.v1");
      localStorage.setItem("app.chat.sessions.v2", "[]");
      void id;
      window.__vqLive.履歴を出す(true);
    }, r.id);
    await pg.waitForTimeout(350);
    const ボタン = await pg.evaluate(() => {
      const b = document.querySelector("#vqLiveLog .vqlg-save");
      return { ある: !!b, 見える: b ? b.getClientRects().length > 0 : false,
               文: b ? b.textContent : "", 押せる: b ? getComputedStyle(b).pointerEvents : "",
               白: b ? getComputedStyle(b).backgroundColor : "" };
    });
    ok("履歴の頭に 「Quick Chat に残す」が ある",
      ボタン.ある && ボタン.見える && /Quick Chat に残す/.test(ボタン.文), ボタン);
    ok("その ボタンは 押せる（箱が 素通りでも）", ボタン.押せる === "auto", ボタン.押せる);
    await pg.evaluate(() => document.querySelector("#vqLiveLog .vqlg-save").click());
    await pg.waitForTimeout(250);
    const 押後 = await pg.evaluate(() => ({
      文: document.querySelector("#vqLiveLog .vqlg-save").textContent,
      件: JSON.parse(localStorage.getItem("app.chat.sessions.v2") || "[]").length
    }));
    ok("押すと 残り、押したことが 分かる",
      押後.件 === 1 && /残しました/.test(押後.文), 押後);
    await pg.evaluate(() => window.__vqLive.履歴を出す(false));
  }

  /* ── 見た目が アプリの一括指定に 潰されていないか ─────────────
     ★ このアプリは body[data-ui-v2] の button 一括指定を !important で
       塗ってくる。実測で、黒い帯の中の「つづきを読む」が **白い箱**に
       なっていた。色と形は 毎回 測る。 */
  節(`${名} / 見た目が 一括指定に 負けていないか`);
  {
    await pg.evaluate((t) => { window.__vqLive.島を開く(false); window.__vqLive.言う(t, false); }, 長文);
    await pg.waitForTimeout(300);
    await pg.evaluate(() => window.__vqLive.ボタン(true));
    await pg.waitForTimeout(350);   /* 出てくる動き（scale .9 → 1）が 終わるのを 待つ */
    const v = await pg.evaluate(() => {
      const g = (e) => { const s = getComputedStyle(e);
        return { bg: s.backgroundColor, color: s.color, r: s.borderTopLeftRadius,
                 w: Math.round(e.getBoundingClientRect().width),
                 h: Math.round(e.getBoundingClientRect().height) }; };
      return { more: g(document.querySelector("#vqLiveEdge .isl .vqmore")),
               type: g(document.getElementById("vqLiveType")),
               log: g(document.getElementById("vqLiveLogBtn")) };
    });
    ok("「つづきを読む」に 白い箱が つかない",
      /rgba\(0, 0, 0, 0\)|transparent/.test(v.more.bg), v.more);
    ok("「つづきを読む」の字は 白い（黒い帯の上で 読める）",
      /255, 255, 255/.test(v.more.color), v.more);
    /* 700px 以下は 40px（指の当たりは 44px 以上を 別に見る） */
    const 期待 = (await pg.evaluate(() => window.innerWidth)) <= 700 ? 40 : 44;
    ok(`置き場のボタンは 丸い ${期待}px`, v.type.w === 期待 && v.type.h === 期待
      && parseFloat(v.type.r) >= 20, v.type);
    ok("履歴ボタンも 同じ大きさ", v.log.w === 期待 && v.log.h === 期待, v.log);

    /* 映している間の色。ここが 白のままだと 映しているか 分からない。 */
    const 映 = await pg.evaluate(async () => {
      try { await window.__vqLive.camera("user"); } catch (e) {}
      await new Promise((r) => setTimeout(r, 900));
      const c = document.getElementById("vqLiveCam");
      if (!c || !c.classList.contains("on")) return { 使えない: true, cls: c ? c.className : null };
      const s = getComputedStyle(c);
      /* いまのテーマのアクセントを その場で読む（決め打ちしない） */
      const 期待 = (function () {
        const p = document.createElement("span");
        p.style.color = getComputedStyle(document.documentElement).getPropertyValue("--vq-accent").trim() || "#756DB3";
        document.body.appendChild(p);
        const v = getComputedStyle(p).color; p.remove();
        return v.replace("rgb(", "rgb(");
      })();
      return { bg: s.backgroundColor, color: s.color, 期待: 期待,
               テーマ: document.documentElement.getAttribute("data-theme-mode") };
    });
    if (映.使えない) console.log("  --   カメラを 使えない環境のため 色の実測は 飛ばす");
    else {
      /* ★ 色を決め打ちしない（2026-08-18・実測で踏んだ）。
         アプリの「自動」テーマは **時刻で** 明暗が変わる（18:00 からダーク）。
         明るいときの紫を決め打ちしていたので、夕方に走らせると落ちた。
         見たいのは「白のままではなく、そのテーマのアクセントで塗られている」こと。 */
      ok("映している間は ボタンの色が 変わる（白のままにしない）",
        !/rgb\(255, 255, 255\)/.test(映.bg) && 映.bg === 映.期待, 映);
      await pg.evaluate(() => window.__vqLive.cameraStop());
    }
  }

  ok(`${名}: 画面の失敗が 出ていない`, 例外.length === 0, 例外.slice(0, 3));
  await ctx.close();
}

/* ★ 残した会話が **本当に Quick Chat で 読めるか**。
   localStorage に 書けた だけでは 足りない（形が違えば 出ない）。
   実際に Quick Chat を 開いて、一覧に 出て、押したら 中身が 読めることを 見る。 */
async function QuickChatで開けるか(browser) {
  節("残した会話が Quick Chat で 読めるか（実際に 開く）");
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();
  const 例外 = [];
  pg.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 160)));
  await pg.goto(`http://127.0.0.1:${PORT}/index.html?vq2=all`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.waitForFunction(() => window.__vqLive && window.__vqLive.残す, { timeout: 40000 });
  await pg.evaluate(() => { const o = document.getElementById("firstLaunchOverlay"); if (o) o.style.display = "none"; });

  const r = await pg.evaluate(() => {
    const v = window.__vqLive;
    v.履歴を消す();
    v.私の言葉("明日の英検の面接ってどんな流れ？");
    v.言う("入室 → あいさつ → 音読 → 質問 4 つ、の順だよ。", false);
    v.私の言葉("音読で気をつけることは？");
    v.言う("固有名詞で 止まらないこと。読み方が 分からなくても 進むほうが 点になるよ。", false);
    return v.残す("試験");
  });
  ok("残せた", !!(r && r.保存した), r);

  await pg.evaluate(() => {
    const t = document.querySelector('#appTabBar [data-app-tab="chat"]');
    if (t) t.click(); else document.body.setAttribute("data-app-tab", "chat");
  });
  await pg.waitForTimeout(2500);

  const 一覧 = await pg.evaluate((id) => {
    const h = document.getElementById("vqChat");
    if (!h || !h.shadowRoot) return { だめ: "Quick Chat の画面が 無い" };
    const row = Array.from(h.shadowRoot.querySelectorAll("[data-ses]"))
      .find((x) => x.getAttribute("data-ses") === id);
    return { ある: !!row, 題: row ? (row.textContent || "").trim() : "" };
  }, r.id);
  ok("Quick Chat の 会話一覧に 出る", 一覧.ある === true, 一覧);
  ok("題も そのまま 出る", /英検の面接/.test(一覧.題 || ""), 一覧.題);

  await pg.evaluate((id) => {
    const sr = document.getElementById("vqChat").shadowRoot;
    const row = Array.from(sr.querySelectorAll("[data-ses]")).find((x) => x.getAttribute("data-ses") === id);
    if (row) row.click();
  }, r.id);
  await pg.waitForTimeout(2000);

  const 中 = await pg.evaluate(() => {
    const sr = document.getElementById("vqChat").shadowRoot;
    return Array.from(sr.querySelectorAll(".msg"))
      .map((x) => ({ 誰: x.classList.contains("user") ? "me" : "ai", t: (x.textContent || "").trim() }))
      .filter((m) => m.t);
  });
  ok("押すと 中身が 読める（4 件）", 中.length === 4, 中.map((m) => m.誰));
  ok("自分と Lumi が 分かれて 出る",
    中[0].誰 === "me" && 中[1].誰 === "ai" && 中[2].誰 === "me" && 中[3].誰 === "ai", 中.map((m) => m.誰));
  ok("言葉が そのまま 残っている",
    中[0].t === "明日の英検の面接ってどんな流れ？" && /固有名詞で 止まらないこと/.test(中[3].t), 中);
  ok("Quick Chat で 画面の失敗が 出ていない", 例外.length === 0, 例外.slice(0, 3));
  await ctx.close();
}

/* ★ 打った字・話した声が 履歴へ入る **本番の 2 か所**。
   ここは 通信を張らないと 通れないので、外から叩く口（私の言葉）と
   **同じ関数**を呼んでいることを 中身で 確かめる。
   （＝この試験で測れているのは 見た目と 出し入れ。実際に 送ったときに
     入ることは、この呼び出しが 残っていることで 担保している。） */
function 中身を見る() {
  節("本番の 呼び出しが 残っているか（コードを 見る）");
  const src = require("./vqsrc.cjs").丸ごと();
  const 生 = require("./vqsrc.cjs").塊("vq-live");   /* 外のファイルへ出したので id で取り出す（2026-08-18）*/
  ok("打った字 → 履歴（sendTyped の中）",
    /turnComplete: true \} \}\)\);[\s\S]{0,220}履歴を書く\("me", t\)/.test(生));
  ok("話した声 → 履歴（inputTranscription の中）",
    /st\.mine = [\s\S]{0,200}履歴を書く\("me", 声, false, true\)/.test(生));
  ok("Lumi の言葉 → 履歴（said の中）", /履歴を書く\("ai", 出す, !!more\)/.test(生));
  ok("外から叩く口も 同じ関数を 呼ぶ",
    /私の言葉: function \(t, 声\) \{ 履歴を書く\("me", t, false, !!声\)/.test(生));

  /* ★ マイクを開ける経路は 4 か所ある。**1 か所でも 漏れると
     「止めたのに 声が届く」**——止めた本人には いちばん気づけない壊れ方。
     実際に開くのは 通信中だけなので、ここは 中身で 確かめる。 */
  節("マイクの止めが すべての経路で 効いているか（コードを 見る）");
  ok("① 半二重の止め（muteMic）",
    /function muteMic\(on\) \{\s*var 実際 = !!on \|\| !!st\.speaking \|\| 手で止めているか\(\);/.test(生));
  ok("② 0.5 秒ごとの 合わせ直し（syncMute）",
    /var 欲しい = \(!!st\.speaking && Date\.now\(\) > \(st\.probeUntil \|\| 0\)\) \|\| 手で止めているか\(\);/.test(生));
  ok("③ Lumi が喋り終わったとき（setMuted）",
    /postMessage\(\{ type: "mute", on: !!on \|\| 手で止めているか\(\) \}\)/.test(生));
  /* ★ 待ち時間を 800ms → 150ms へ 下げた（2026-08-19・訴え「1 回で 通じない」）。
     鳴り始めの 0.8 秒は 割り込みを 見ていなかったので、
     返事の 出だしに かぶせた ひと言が **丸ごと 消えていた**。
     ここで 守りたいのは 待ち時間の 値ではなく
     **手で止めているときは 開かない**こと。そちらを 見る。 */
  ok("④ 声で割り込むとき（自分の声で 開かない）",
    /鳴り始めから > 150 && !手で止めているか\(\)/.test(生)
    && /if \(!手で止めているか\(\)\)\s*try \{ st\.micNode\.port\.postMessage\(\{ type: "mute", on: false \}\)/.test(生));
  ok("会話が終わったら 止めを 持ち越さない", /マイクを止める\(false\);/.test(生));

  節("会話の終わりに Quick Chat へ 残しているか（コードを 見る）");
  ok("設定が入っていれば 会話の終わりに 残す",
    /if \(残す設定か\(\)\) \{ try \{ 会話をChatへ保存\("会話の終わり"\)/.test(生));
  ok("並べ直しは 読み込みと Quick Chat を開いたときの 2 回",
    /並べ直しを仕掛ける/.test(生) && /attributeFilter: \["data-app-tab"\]/.test(生));
}

(async () => {
  const server = await serve();
  const browser = await chromium.launch({
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"]
  });
  await 一台(browser, "PC 1440", { viewport: { width: 1440, height: 900 }, permissions: ["camera"] });
  await 一台(browser, "iPhone 14", { ...devices["iPhone 14"], hasTouch: true, permissions: ["camera"] });
  await QuickChatで開けるか(browser);
  await browser.close();
  server.close();
  中身を見る();
  console.log(`\n合格 ${pass} / 失敗 ${fail}`);
  if (落ち.length) console.log("落ちた:\n  - " + 落ち.join("\n  - "));
  process.exit(fail ? 1 : 0);
})();
