#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqsurviveengine.cjs — VocabuSurvive の 描画の土台が **本当に 描けるか**。

   ここで 見ること:
     ① 例外なく 起動する（shader が 通る）
     ② 画が 出る（読んだ 画素が 空色 だけで ない）
     ③ まとめ描きが 効いている（描き回数 ≪ 並べた数）
     ④ 視界の 外を 捨てている
     ⑤ 段（低/中/高）を 変えると 画素数・影が 変わる
     ⑥ 後始末で WebGL の 文脈が 残らない

   使い方: node vqsurviveengine.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const { chromium } = require("playwright");
const { serve } = require("./vqsrvserve.cjs");
const PORT = Number(process.env.VQ_PORT || 8974);
const BASE = "http://127.0.0.1:" + PORT;
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ok   " + n); }
  else { fail++; bad.push(n); console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 300) : "")); }
};
const 節 = (t) => console.log("\n══ " + t + " ══");
const 待つ = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const srv = await serve(PORT);
  const b = await chromium.launch({
    args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader",
           "--ignore-gpu-blocklist", "--enable-webgl", "--disable-dev-shm-usage"]
  });
  const errs = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => errs.push(String(e && e.message || e)));
    pg.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });

    節("① 起動する");
    await pg.goto(BASE + "/vocabu-survive-lab.html", { waitUntil: "load" });
    await pg.waitForFunction(() => window.__lab && (window.__lab.ready || window.__lab.error), null, { timeout: 20000 }).catch(() => {});
    const lab = await pg.evaluate(() => window.__lab && JSON.parse(JSON.stringify({
      ready: window.__lab.ready, error: window.__lab.error, caps: window.__lab.caps, settings: window.__lab.settings
    })));
    ok("例外なく 起動する", !!lab && lab.ready && !lab.error, lab && lab.error);
    if (lab && lab.caps) console.log("     端末: 段=" + lab.caps.tier + " GL2=" + lab.caps.webgl2 + " 芯=" + lab.caps.cores + " 描画器=" + String(lab.caps.renderer).slice(0, 60));

    await 待つ(1200);

    節("② 画が 出る");
    /* ★ 画素は **描いた その場**で 読んだ ものを 見る。
       あとから readPixels しても 真っ黒に なる（裏の絵は 捨てられている）。 */
    const px = await pg.evaluate(() => window.__lab.pixels);
    ok("画素を 読める", Array.isArray(px) && px.length === 9, px);
    if (Array.isArray(px)) {
      const uniq = new Set(px.map((p) => p.join(",")));
      ok("真っ黒では ない", px.some((p) => p[0] + p[1] + p[2] > 40), px.slice(0, 3));
      ok("1 色で 塗り潰されていない（＝物が 描けている）", uniq.size >= 3, Array.from(uniq));
      console.log("     読んだ色: " + px.slice(0, 5).map((p) => "rgb(" + p.join(",") + ")").join(" "));
    }

    /* 撮った 絵そのものも 見る（readPixels と 別の 経路） */
    const shotPath = "/private/tmp/claude-501/-Users-user-Downloads-word-practice-v26-menu-terms-report-emailjs/ea86a79f-1ff2-4347-9303-995fcdd2a12d/scratchpad/survive-engine.png";
    await pg.screenshot({ path: shotPath });
    const buf = require("fs").readFileSync(shotPath);
    ok("撮った 絵が 1 万バイト 以上（＝一色の 画では ない）", buf.length > 10000, buf.length);
    console.log("     絵: " + shotPath + " (" + (buf.length / 1024).toFixed(0) + "KB)");

    節("③ まとめ描き");
    const st = await pg.evaluate(() => JSON.parse(JSON.stringify(window.__lab.stats)));
    console.log("     描き " + st.draws + " 回 / 並べた " + st.instances + " 個 / 捨て " + st.culled + " 個 / 面 " + (st.tris | 0));
    ok("並べた 数 > 描き 回数（まとめられている）", st.instances > st.draws * 3, st);
    ok("描き 回数が 形の 数の 範囲に 収まる（≦21）", st.draws <= 21, st.draws);

    節("④ 視界の 外を 捨てる");
    ok("捨てた ものが ある", st.culled > 0, st.culled);
    ok("並べた + 捨てた が 置いた数（422）に 近い", Math.abs((st.instances + st.culled) - 422) <= 2, { i: st.instances, c: st.culled });

    節("⑤ 段を 変えると 変わる");
    const low = await (async () => {
      const p2 = await ctx.newPage();
      await p2.goto(BASE + "/vocabu-survive-lab.html?tier=low", { waitUntil: "load" });
      await p2.waitForFunction(() => window.__lab && (window.__lab.ready || window.__lab.error), null, { timeout: 20000 }).catch(() => {});
      const r = await p2.evaluate(() => ({
        err: window.__lab.error, tier: window.__lab.settings.tier,
        shadow: window.__lab.settings.shadow, w: window.__renderer.canvas.width, h: window.__renderer.canvas.height
      }));
      await p2.close(); return r;
    })();
    const high = await (async () => {
      const p2 = await ctx.newPage();
      await p2.goto(BASE + "/vocabu-survive-lab.html?tier=high", { waitUntil: "load" });
      await p2.waitForFunction(() => window.__lab && (window.__lab.ready || window.__lab.error), null, { timeout: 20000 }).catch(() => {});
      const r = await p2.evaluate(() => ({
        err: window.__lab.error, tier: window.__lab.settings.tier,
        shadow: window.__lab.settings.shadow, w: window.__renderer.canvas.width, h: window.__renderer.canvas.height
      }));
      await p2.close(); return r;
    })();
    ok("低: 影 なし", low && low.shadow === false, low);
    ok("高: 影 あり", high && high.shadow === true, high);
    ok("低の ほうが 画素が 少ない", low.w * low.h < high.w * high.h, { low: low.w + "x" + low.h, high: high.w + "x" + high.h });
    ok("低でも 例外なく 動く", !low.err, low.err);
    ok("高でも 例外なく 動く", !high.err, high.err);

    節("⑥ 後始末");
    const gone = await pg.evaluate(() => {
      try { window.__renderer.destroy(); return window.__renderer.gl === null; } catch (e) { return "ex:" + e.message; }
    });
    ok("destroy で 文脈を 手放す", gone === true, gone);

    節("⑦ 例外が 出ていない");
    ok("pageerror / console.error が 0 件", errs.length === 0, errs.slice(0, 4));
  } finally {
    await b.close(); srv.close();
  }
  console.log("\n────────────────────────────────");
  console.log("  ok " + pass + " / NG " + fail);
  if (bad.length) console.log("  落ちたもの:\n   - " + bad.join("\n   - "));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
