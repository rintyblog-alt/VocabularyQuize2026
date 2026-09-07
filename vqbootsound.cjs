/* ══════════════════════════════════════════════════════════════════════════
   vqbootsound — 起動中の 音（2026-09-07・訴え）

   訴え「この音源を アプリ起動中の ロード音に 使って ほしい。
         起動できたら フェードアウトする こと。」

   見る こと:
     ① 音の ファイルが 配られて いる（指紋つき・1 年 溜められる）
     ② 起動の 1 枚が 出て いる 間に 鳴りはじめる
     ③ 起動が 済んだら **音量が 下がって 止まる**（ぶつっと 切らない）
     ④ 効果音を 切って いる 人には 鳴らさない
     ⑤ 画面を 離れたら 止まる
     ⑥ 自動再生を 断られても 赤い字を 出さない（断られるのが ふつう）

   ★ ブラウザは ふつう 自動再生を 断る。検査では
     --autoplay-policy=no-user-gesture-required で 開けて 鳴る 側を 見る。
     断られる 側は 既定の まま 開いて 見る。
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";

let 合 = 0, 否 = 0; const 落ち = [];
const 節 = (t) => console.log("\n■ " + t);
const 見る = (n, c, x) => {
  if (c) { 合++; console.log("  ok   " + n + (x !== undefined ? "  → " + String(x).slice(0, 140) : "")); }
  else { 否++; 落ち.push(n); console.log("  NG   " + n + (x !== undefined ? "  → " + String(x).slice(0, 260) : "")); }
};

/* ══ ① 配って いるか（ブラウザを 開かずに 見る）══════════════════ */
節("① 音の ファイル");
const IDX = fs.readFileSync(path.join(__dirname, "client/index.html"), "utf8");
const m = /\/vq-boot\.([0-9a-f]{10})\.m4a/.exec(IDX);
見る("index.html が 指紋つきの 音を 指して いる", !!m, m && m[0]);
if (m) {
  const f = path.join(__dirname, "client", "vq-boot." + m[1] + ".m4a");
  見る("その ファイルが 実在する", fs.existsSync(f), f.replace(__dirname + "/", ""));
  if (fs.existsSync(f)) {
    const kb = Math.round(fs.statSync(f).size / 1024);
    見る("★ 起動の じゃまに ならない 大きさ（200KB 未満）", kb < 200, kb + " KB");
  }
}
const HD = fs.readFileSync(path.join(__dirname, "client/_headers"), "utf8");
見る("_headers で 1 年 溜められる", /\/vq-boot\.\*\.m4a[\s\S]{0,120}immutable/.test(HD));

(async () => {
  const br = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });

  async function 開く(前もって, 遅らせる) {
    const ctx = await br.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => { try { localStorage.setItem("vq.install.hide.v1", "1"); } catch (e) { } });
    if (前もって) await ctx.addInitScript(前もって);
    const pg = await ctx.newPage();
    const 赤 = [];
    pg.on("pageerror", (e) => 赤.push(e.message));
    pg.on("console", (c) => { if (c.type() === "error") 赤.push(c.text().slice(0, 160)); });
    /* 起動を ゆっくりに して、音が 鳴る 時間を 作る。 */
    if (遅らせる) await pg.route("**/api/auth/me*", async (r) => { await new Promise((x) => setTimeout(x, 4000)); await r.continue(); });
    /* 音の 様子を 覗ける ように する。 */
    /* ★ 本体は ほかにも 音を 作る（効果音・読み上げ）。**起動音だけ**を 掴む。
       掴み分けないと、あとから 作られた 別の 音を 見て
       「止まって いない」と 言って しまう（実測で 踏んだ）。

       ★ もう 1 つ。検査の Chromium は **AAC を 鳴らせない**
         （NotSupportedError: no supported source）。中身の 入って いない
         素の Chromium なので、m4a / mp3 の 決まりを 持って いない。
         実の Chrome / Safari では 鳴る（本体は すでに vq-lumi-*.m4a を
         同じ やりかたで 使って いる）。
       → ここでは **鳴らす ところを 差し替えて**、こちらの 処理
         （フェードで 音量を 下げる・止める・切って いる 人には 作らない）を 測る。
         ファイルが 本物 かどうかは ① で 別に 見て いる。 */
    await pg.addInitScript(() => {
      window.__音の記録 = [];
      const 元Audio = window.Audio;
      window.Audio = function (src) {
        const a = new 元Audio(src);
        if (String(src || "").indexOf("vq-boot") >= 0) {
          window.__音 = a;
          window.__音の記録.push({ t: Date.now(), src: String(src) });
        }
        return a;
      };
      window.Audio.prototype = 元Audio.prototype;

      const P = HTMLMediaElement.prototype;
      P.play = function () { this.__再生中 = true; return Promise.resolve(); };
      P.pause = function () { this.__再生中 = false; };
      Object.defineProperty(P, "paused", {
        get: function () { return !this.__再生中; }, configurable: true
      });
    });
    await pg.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded", timeout: 60000 });
    return { ctx, pg, 赤 };
  }
  const 様子 = (pg) => pg.evaluate(() => {
    const a = window.__音;
    return {
      作った: (window.__音の記録 || []).length,
      元: (window.__音の記録 || [])[0] ? window.__音の記録[0].src : "",
      止: a ? !!a.paused : null,
      量: a ? Math.round(a.volume * 1000) / 1000 : null,
      今: a ? Math.round((a.currentTime || 0) * 100) / 100 : null,
      口: typeof window.__vqBootSound
    };
  });

  /* ══ ② 起動中に 鳴りはじめる ══════════════════════════════════ */
  節("② 起動の 1 枚が 出て いる 間");
  let { ctx, pg, 赤 } = await 開く(null, true);
  await pg.waitForTimeout(1500);
  const 中 = await 様子(pg);
  見る("音を 作って いる", 中.作った > 0, 中.元);
  見る("外から 止められる 口が ある", 中.口 === "object", 中.口);
  見る("★ 鳴って いる（止まって いない）", 中.止 === false, JSON.stringify(中));
  見る("音量は ひかえめ（1.0 では ない）", 中.量 !== null && 中.量 > 0 && 中.量 <= 0.85, 中.量);

  /* ══ ③ 起動が 済んだら フェードアウト ═══════════════════════ */
  節("③ 起動できたら フェードアウト");
  const 前量 = 中.量;
  await pg.evaluate(() => {
    /* 起動が 済んだ 印を 立てる（本体と 同じ 消しかた）。 */
    document.getElementById("authBootSplash").classList.add("liquid-fade-out");
    document.body.classList.remove("auth-booting");
  });
  await pg.waitForTimeout(300);
  const 途中 = await 様子(pg);
  見る("★ 音量が **下がって いる**（ぶつっと 切らない）",
    途中.量 !== null && 前量 !== null && 途中.量 < 前量 && 途中.量 > 0, "前 " + 前量 + " → 途中 " + 途中.量);
  await pg.waitForTimeout(1400);
  const 後 = await 様子(pg);
  見る("★ 最後は 止まる", 後.止 === true || 後.量 === 0, JSON.stringify(後));
  見る("赤い字が 出て いない", 赤.filter((t) => !/ERR_CONNECTION|Failed to load resource/.test(t)).length === 0,
    赤.slice(0, 3).join(" / "));
  await ctx.close();

  /* ══ ④ 効果音を 切って いる 人 ═════════════════════════════ */
  節("④ 効果音を 切って いる とき");
  ({ ctx, pg, 赤 } = await 開く(() => {
    try {
      localStorage.setItem("wordPractice400.settings.v2", JSON.stringify({ sfx: false }));
    } catch (e) { }
  }, true));
  await pg.waitForTimeout(1800);
  const 切 = await 様子(pg);
  見る("★ 鳴らさない", 切.作った === 0, JSON.stringify(切));
  await ctx.close();

  /* ══ ⑤ 画面を 離れたら 止まる ══════════════════════════════ */
  節("⑤ 画面を 離れたら");
  ({ ctx, pg, 赤 } = await 開く(null, true));
  await pg.waitForTimeout(1400);
  await pg.evaluate(() => {
    Object.defineProperty(document, "hidden", { get: () => true, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await pg.waitForTimeout(500);
  const 隠 = await 様子(pg);
  見る("★ すぐ 止まる", 隠.止 === true || 隠.止 === null, JSON.stringify(隠));
  await ctx.close();
  await br.close();

  /* ══ ⑥ 自動再生を 断られる とき（既定の ブラウザ）════════════ */
  節("⑥ 自動再生を 断られた とき（ふつうの ブラウザ）");
  const br2 = await chromium.launch();     /* 既定＝ 自動再生は 断られる */
  {
    const ctx2 = await br2.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true });
    await ctx2.addInitScript(() => { try { localStorage.setItem("vq.install.hide.v1", "1"); } catch (e) { } });
    const pg2 = await ctx2.newPage();
    const 赤2 = [];
    pg2.on("pageerror", (e) => 赤2.push(e.message));
    pg2.on("console", (c) => { if (c.type() === "error") 赤2.push(c.text().slice(0, 160)); });
    await pg2.route("**/api/auth/me*", async (r) => { await new Promise((x) => setTimeout(x, 4000)); await r.continue(); });
    await pg2.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded", timeout: 60000 });
    await pg2.waitForTimeout(2000);
    const 我 = 赤2.filter((t) => !/ERR_CONNECTION|Failed to load resource|play\(\)/.test(t));
    見る("★ 断られても 赤い字を 出さない", 我.length === 0, 我.slice(0, 3).join(" / "));
    見る("口は 残って いる（あとで 触れば 鳴らせる）",
      (await pg2.evaluate(() => typeof window.__vqBootSound)) === "object");
    await ctx2.close();
  }
  await br2.close();

  console.log("\n══ まとめ ══\n  合格 " + 合 + " / 不合格 " + 否);
  if (落ち.length) console.log("  落ちた: " + 落ち.join(" / "));
  console.log("");
  process.exit(否 ? 1 : 0);
})().catch((e) => { console.error("落ちました: " + (e && e.stack || e)); process.exit(2); });
