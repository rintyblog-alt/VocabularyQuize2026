#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqsurviveland.cjs — **地平の 向こうに 土台が あるか**。

   ★ 訴え（2026-08-31）「全コース そうなんだけど、背景に 土台が ない」
     「地面が ない 背景に」。
     直す前は 空と 霧が ぶつかる だけで、地平の 向こうに 何も 無かった。
     どの コースも 白い 空間に 板が 浮いて 見えた（実写で 確認）。

   直しかた:
     空を 塗る ついでに **稜線**を 描く。板は 1 枚も 足さない ので
     描き回数 0・面 0。霧の 影響も 受けない（いちばん 奥に 居る）。

   見るもの:
     ① 10 の 風景 すべてに 土台の 決めごとが ある
     ② 試合に 入ると それが 描く側へ 渡っている
     ③ **本当に 画素が 変わる**（消した ときと 比べる）
     ④ 稜線が **平らでは ない**（山に 見える）
     ⑤ 風景を 変えると 色も 変わる
     ⑥ 弱い 端末でも 出る／描き回数は 増えない
     ⑦ 例外 0 件

   使い方: node vqsurviveland.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || process.env.VQ_API || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では 実行しません。"); process.exit(2); }
const { chromium } = require("playwright");
const zlib = require("zlib");
const 待 = (m) => new Promise((s) => setTimeout(s, m));
let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 200) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 320) : "")); }
};

/* PNG を ほどく。Playwright は 8bit RGBA・飛ばし無し で 出す。
   （画素を 見ずに 「出ている はず」で 済ませない ため。） */
function png(buf) {
  let p = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString("ascii", p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = ct === 6 ? 4 : ct === 2 ? 3 : ct === 4 ? 2 : 1;
  const stride = w * ch;
  const out = Buffer.alloc(w * h * ch);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const o = y * (stride + 1);
    const ft = raw[o];
    const cur = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? cur[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      let v = raw[o + 1 + x];
      if (ft === 1) v += a;
      else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[x] = v & 255;
    }
    cur.copy(out, y * stride); prev = cur;
  }
  return { w, h, ch, d: out };
}
const 画素 = (im, x, y) => { const o = (y * im.w + x) * im.ch; return [im.d[o], im.d[o + 1], im.d[o + 2]]; };
const 差 = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

async function 開く(pg, tier) {
  await pg.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => !!document.getElementById("appSurvivePage"), null, { timeout: 60000 });
  await pg.evaluate(() => { const f = () => { document.body.classList.remove("auth-booting","auth-gate-open","first-launch-open");
    for (const id of ["authGate","authBootSplash","firstLaunchOverlay","globalLoadingOverlay","vqTour","vqNewAuth","vqNewsFlash"]) {
      const e = document.getElementById(id); if (e) { e.classList.add("hidden"); e.style.display = "none"; } } }; f(); setInterval(f, 150); });
  await pg.evaluate((t) => { try { localStorage.setItem("vq.survive.helpseen.v1", "1");
    if (t) localStorage.setItem("vq.survive.tier.v1", t); } catch (e) {} }, tier || "");
  await pg.evaluate(() => document.querySelector('#appTabBar [data-app-tab="survive"]').click());
  await pg.waitForFunction(() => window.VocabuSurvive && window.VocabuSurvive.state().opened, null, { timeout: 120000, polling: 250 });
  await pg.waitForFunction(() => { const h = document.querySelector("#appSurvivePage .vq-survive-host");
    return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vs-load-start")); }, null, { timeout: 120000, polling: 250 });
  await pg.evaluate(() => document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot.querySelector(".vs-load-start").click());
  await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "lobby", null, { timeout: 40000 });
  await 待(1000);
}

async function 走る(pg, i) {
  await pg.evaluate((n) => {
    const lb = window.VocabuSurvive.__app.shell.get("lobby");
    lb.courseIndex = n; lb.mode = "timeattack"; lb.botCount = 0; lb._save(); lb._render();
    document.querySelector("#appSurvivePage .vq-survive-host").shadowRoot.querySelector(".vs-lb-start").click();
  }, i);
  await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "match", null, { timeout: 60000 });
  await 待(3800);
  /* 空だけが 見える ように カメラを 高く 置いて 止める。 */
  await pg.evaluate(() => {
    const ms = window.VocabuSurvive.__app.shell.get("match");
    ms.cam.update = function () {};
    const p = ms.local, cv = ms.renderer.canvas;
    ms.cam.setFree([p.x + 26, p.y + 16, p.z - 34], [p.x, p.y + 2, p.z + 30], cv.width / cv.height, 58);
  });
  await 待(360);
}

(async () => {
  console.log("測る先:", BASE);
  const browser = await chromium.launch({ args: ["--use-gl=angle", "--enable-unsafe-swiftshader"] });
  const ctx = await browser.newContext({ viewport: { width: 900, height: 620 } });
  const pg = await ctx.newPage();
  const 例外 = [];
  pg.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 160)));
  await 開く(pg);

  /* ★ ロビーは いちばん 先に 見る（試合を 何度も 作った あとだと
     WebGL の 文脈の 上限に ぶつかって 舞台が 立たない。
     **測れなく なるのは 検査の 都合**で、本物の 不具合では ない）。 */
  節("① ロビーの 舞台に 土台が ある");
  /* ★ ロビーは **いちばん 長く 見る 画面**。ここが 空っぽの ままだと
     「浮いている」 印象は 消えない。 */
  await 待(1400);
  const 舞 = await pg.evaluate(() => {
    const lb = window.VocabuSurvive.__app.shell.get("lobby");
    const R = lb.stage && lb.stage.renderer;
    return R ? { land: !!R.sky.land, h: R.sky.land && R.sky.land.h, a: R.sky.land && R.sky.land.a.slice() } : null;
  });
  見(舞 && 舞.land, "★ ロビーの 舞台にも 土台が ある", 舞);
  /* コースを 変えると 山の 色も 変わる（すぐには 飛ばず 寄っていく） */
  const 変色 = await pg.evaluate(async () => {
    const lb = window.VocabuSurvive.__app.shell.get("lobby");
    const R = lb.stage.renderer;
    const 前 = R.sky.land.a.slice();
    lb.courseIndex = 18; lb._render();           /* 溶岩 */
    await new Promise((r) => setTimeout(r, 1600));
    const 後 = R.sky.land.a.slice();
    return { 前, 後 };
  });
  const d色 = Math.abs(変色.前[0] - 変色.後[0]) + Math.abs(変色.前[1] - 変色.後[1]) + Math.abs(変色.前[2] - 変色.後[2]);
  見(d色 > 0.08, "★ コースを えらび直すと 山の 色も 変わる", { 差: d色.toFixed(3), ...変色 });

  節("② 10 の 風景 すべてに 土台が ある");
  /* 実際に 走らせて 描く側へ 渡った ものを 数える（表を 読むだけに しない）。 */
  const 代表 = [[0,"meadow"],[2,"candy"],[4,"forest"],[7,"ruins"],[9,"sky"],[10,"neon"],[12,"ice"],[18,"lava"],[29,"arena"]];
  const 土台 = {};
  for (const [i, 名] of 代表) {
    await 走る(pg, i);
    土台[名] = await pg.evaluate(() => {
      const R = window.VocabuSurvive.__app.shell.get("match").renderer;
      const L = R.sky.land;
      return L ? { h: L.h, sharp: L.sharp, base: L.base, a: L.a, b: L.b } : null;
    });
    if (名 !== "arena") { await pg.evaluate(() => window.VocabuSurvive.__app.goLobby());
      await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "lobby", null, { timeout: 30000 }); await 待(400); }
  }
  見(Object.values(土台).every((v) => v && v.h > 0), "★ どの 風景にも 土台の 決めごとが ある",
     Object.keys(土台).length + " 風景");
  const 色 = Object.values(土台).map((v) => v.a.join(","));
  見(new Set(色).size === 色.length, "★ 風景ごとに 色が ちがう（同じ 山を 使い回して いない）", new Set(色).size);
  const 高 = Object.values(土台).map((v) => v.h);
  見(new Set(高).size >= 6, "高さも 風景で 変える", Array.from(new Set(高)).sort());

  節("③ 本当に 画素が 変わる（消した ときと 比べる）");
  /* いまは arena に 居る。草原へ 戻して 測る。 */
  await pg.evaluate(() => window.VocabuSurvive.__app.goLobby());
  await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "lobby", null, { timeout: 30000 });
  await 待(400);
  await 走る(pg, 0);
  const 有 = png(await pg.screenshot());
  await pg.evaluate(() => { const R = window.VocabuSurvive.__app.shell.get("match").renderer;
    R.__land = R.sky.land; R.sky.land = null; });
  await 待(320);
  const 無 = png(await pg.screenshot());
  await pg.evaluate(() => { const R = window.VocabuSurvive.__app.shell.get("match").renderer; R.sky.land = R.__land; });
  await 待(320);

  見(有.w === 無.w && 有.h === 無.h && 有.w > 0, "絵を 読めた", { w: 有.w, h: 有.h });
  /* 地平の 帯（画面の 上 25% 〜 50%）で 数える */
  const y0 = Math.round(有.h * 0.25), y1 = Math.round(有.h * 0.50);
  let 変 = 0, 全 = 0, 最大 = 0;
  for (let y = y0; y < y1; y += 2) for (let x = 0; x < 有.w; x += 3) {
    const d = 差(画素(有, x, y), 画素(無, x, y)); 全++;
    if (d > 8) 変++; if (d > 最大) 最大 = d;
  }
  見(変 / 全 > 0.10, "★ 地平の 帯の 画素が **実際に 変わる**",
     { 変わった: (100 * 変 / 全).toFixed(1) + "%", 最大差: 最大 });
  見(最大 > 24, "変わり方が 目で 分かる 大きさ", 最大);

  節("④ 稜線が 平らでは ない（山に 見える）");
  /* 列ごとに 「変わり始める 高さ」を 探す。同じ 高さなら ただの 帯。 */
  const 上端 = [];
  for (let x = 6; x < 有.w - 6; x += 9) {
    let t = -1;
    for (let y = y0; y < y1; y++) { if (差(画素(有, x, y), 画素(無, x, y)) > 8) { t = y; break; } }
    if (t >= 0) 上端.push(t);
  }
  const 平均 = 上端.reduce((a, b) => a + b, 0) / Math.max(1, 上端.length);
  const ばら = Math.sqrt(上端.reduce((a, b) => a + (b - 平均) * (b - 平均), 0) / Math.max(1, 上端.length));
  見(上端.length > 40, "ほとんどの 列で 稜線が 見つかる", 上端.length);
  見(ばら > 2.2, "★ 稜線の 高さが 列ごとに ちがう（＝山）", { ばらつき: ばら.toFixed(2) + "px",
     上: Math.min.apply(null, 上端), 下: Math.max.apply(null, 上端) });
  見(Math.max.apply(null, 上端) - Math.min.apply(null, 上端) > 8, "いちばん 高い 山と 低い 谷の 差が ある",
     Math.max.apply(null, 上端) - Math.min.apply(null, 上端));

  節("⑤ 夜の 風景は 街の 影（山では なく ビル）");
  /* ★ 山と 街の 違いは **段差**。
     ビルは 縦の 壁で 隣と 高さが 一気に 変わる。
     山は なだらかに 上下する ので 大きな 段差は めったに 出ない。
     （はじめは 「屋上が 平らか」で 見ようと したが、
       それは **高さの 幅**に 引きずられて 逆に 出た。実測 街 34% / 山 74%。
       段差の ほうが 形そのものを 見ている。） */
  const 段差 = (im, なし) => {
    const 上 = [];
    for (let x = 4; x < im.w - 4; x += 2) {
      let t = -1;
      for (let y = y0; y < y1; y++) { if (差(画素(im, x, y), 画素(なし, x, y)) > 8) { t = y; break; } }
      上.push(t);
    }
    let 大 = 0, 数 = 0;
    for (let i = 1; i < 上.length; i++) {
      if (上[i] < 0 || 上[i - 1] < 0) continue;
      数++; if (Math.abs(上[i] - 上[i - 1]) >= 4) 大++;
    }
    return 数 ? 大 / 数 : 0;
  };
  const 山段 = 段差(有, 無);
  await pg.evaluate(() => window.VocabuSurvive.__app.goLobby());
  await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "lobby", null, { timeout: 30000 });
  await 待(400);
  await 走る(pg, 10);                                   /* 消える足場 = ネオン */
  const 形 = await pg.evaluate(() => window.VocabuSurvive.__app.shell.get("match").renderer.sky.land.shape || 1);
  見(形 === 2, "★ ネオンは 街（形 2）", 形);
  const 街有 = png(await pg.screenshot());
  await pg.evaluate(() => { const R = window.VocabuSurvive.__app.shell.get("match").renderer; R.__land = R.sky.land; R.sky.land = null; });
  await 待(320);
  const 街無 = png(await pg.screenshot());
  await pg.evaluate(() => { const R = window.VocabuSurvive.__app.shell.get("match").renderer; R.sky.land = R.__land; });
  await 待(320);
  const 街段 = 段差(街有, 街無);
  見(街段 > 山段 + 0.08, "★ 街は 縦の 壁で 段差が 出る（山は なだらか）",
     { 街: (100 * 街段).toFixed(0) + "%", 山: (100 * 山段).toFixed(0) + "%" });
  見(街段 > 0.12, "段差の 割合が 十分（ビルに 見える）", (100 * 街段).toFixed(0) + "%");
  await pg.evaluate(() => window.VocabuSurvive.__app.goLobby());
  await pg.waitForFunction(() => window.VocabuSurvive.state().screen === "lobby", null, { timeout: 30000 });
  await 待(400);
  await 走る(pg, 0);

  節("⑥ 描き回数は 増えない（板を 足して いない）");
  const 数 = await pg.evaluate(async () => {
    const ms = window.VocabuSurvive.__app.shell.get("match");
    const 取 = () => ({ d: ms.renderer.stats.draws, t: ms.renderer.stats.tris });
    const 有 = 取();
    ms.renderer.sky.land = null;
    await new Promise((r) => setTimeout(r, 300));
    const 無 = 取();
    ms.renderer.sky.land = ms.renderer.__land;
    return { 有, 無 };
  });
  見(数.有.d === 数.無.d, "★ 描き回数が 同じ", 数);
  見(Math.abs(数.有.t - 数.無.t) < 400, "面の 数も ほぼ 同じ", { 有: 数.有.t, 無: 数.無.t });

  節("⑦ 弱い 端末でも 出る");
  const p2 = await ctx.newPage();
  const 例外2 = []; p2.on("pageerror", (e) => 例外2.push(String(e.message).slice(0, 160)));
  await 開く(p2, "low");
  await 走る(p2, 0);
  const 低 = await p2.evaluate(() => {
    const ms = window.VocabuSurvive.__app.shell.get("match");
    return { tier: ms.renderer.settings.tier, land: !!ms.renderer.sky.land, 影: ms.renderer.settings.shadow };
  });
  見(低.tier === "low" && !低.影, "低い 段で 動いている", 低);
  見(低.land, "★ 低い 段でも 土台が 出る（弱い 人だけ 空っぽに しない）");
  const 低絵 = png(await p2.screenshot());
  await p2.evaluate(() => { const R = window.VocabuSurvive.__app.shell.get("match").renderer; R.__land = R.sky.land; R.sky.land = null; });
  await 待(320);
  const 低無 = png(await p2.screenshot());
  let 低変 = 0, 低全 = 0;
  for (let y = Math.round(低絵.h * 0.25); y < Math.round(低絵.h * 0.5); y += 2)
    for (let x = 0; x < 低絵.w; x += 3) { 低全++; if (差(画素(低絵, x, y), 画素(低無, x, y)) > 8) 低変++; }
  見(低変 / 低全 > 0.06, "低い 段でも 画素が 変わる", (100 * 低変 / 低全).toFixed(1) + "%");
  await p2.close();

  節("⑧ 例外");
  const 実 = 例外.concat(例外2).filter((m) => !/ResizeObserver|Non-Error|Load failed|NetworkError|Failed to fetch/i.test(m));
  見(実.length === 0, "実害の ある 例外が 0 件", 実.slice(0, 3));

  console.log("\n────────────────────────────────");
  console.log("  ok " + 済 + " / NG " + 落);
  if (落) console.log("  落ちた: " + 落ち.join(" / "));
  await browser.close();
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
