/* ══════════════════════════════════════════════════════════════════════════
   vqflash.cjs — 起動したときの「新しいお知らせ」と、通知音

   見るところ:
     ① 通知音のファイルが 7 つとも本当に配られている
     ② 設定「音 → 通知音」に デフォルト＋7 種＋鳴らさない があり、既定は デフォルト
        （2026-08-19 に 利用者の希望で デフォルト（n0）を 通知音 1 の前に置き、初期値にした）
     ③ 選ぶとその場で鳴る（試聴）／起動のときは勝手に鳴らない
     ④ 起動したとき、新しいお知らせがあれば PC は右上・スマホは上に出る
     ⑤ 一度出したら、次の起動では同じお知らせで出ない
     ⑥ 押すと NEWS へ行く／×で消える
     ⑦ 「鳴らさない」にすると音を作らない
   ══════════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const fs = require("node:fs");
fs.mkdirSync("shots/flash", { recursive: true });

const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  NG   " + n + (x ? "  → " + x : ""))); };

/* 音は headless では実際には鳴らないので、Audio を包んで「何を鳴らそうとしたか」を数える。
   ページが動き出す前に仕込む。 */
const SPY = `
  window.__vqPlayed = [];
  (function () {
    var A = window.Audio;
    window.Audio = function (src) {
      var a = new A(src);
      window.__vqPlayed.push({ src: String(src || ""), at: Date.now() });
      var p = a.play.bind(a);
      a.play = function () { try { return p(); } catch (e) { return Promise.reject(e); } };
      return a;
    };
    window.Audio.prototype = A.prototype;
  })();
`;

async function boot(pg, opt) {
  opt = opt || {};
  await pg.goto(BASE + "/?vqdev=1&cb=" + Date.now(), { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(4200);
  await pg.evaluate(() => {
    ["firstLaunchOverlay", "vqbFlow", "vqNewAuth", "authGate", "authBootSplash", "vqOnboardingOverlay"].forEach((id) => {
      const e = document.getElementById(id);
      if (e) { e.hidden = true; e.style.setProperty("display", "none", "important"); }
    });
    document.body.classList.remove("auth-booting", "auth-gate-open");
    const a = document.getElementById("app"); if (a) a.style.setProperty("display", "block", "important");
    document.body.setAttribute("data-ui-v2", "1");
    /* 案内（vq-tour）は別のテストで見る。ここでは邪魔になるので「見たこと」にする。 */
    try {
      localStorage.setItem("vq.tour.v1", JSON.stringify({
        pin: 1, preset: 1, feed: 1, news: 1, insight: 1, chat: 1, notif: 1, mock: 1, presetmake: 1, settings: 1
      }));
      const tv = document.getElementById("vqTour"); if (tv) tv.style.display = "none";
    } catch (e) {}

    const sk = document.getElementById("vqObSkipBtn"); if (sk) sk.click();
  });
  await pg.waitForTimeout(opt.wait || 1600);
}
const flash = (pg) => pg.evaluate(() => {
  const h = document.getElementById("vqNewsFlash");
  if (!h || !h.shadowRoot) return null;
  const c = h.shadowRoot.querySelector(".card");
  const r = h.getBoundingClientRect();
  return {
    text: (c ? c.textContent : "").replace(/\s+/g, " ").trim(),
    x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width),
    vw: window.innerWidth
  };
});

(async () => {
  const b = await chromium.launch({ headless: true });

  console.log("\n### 通知音のファイル");
  for (let i = 1; i <= 7; i++) {
    const r = await fetch(BASE + "/assets/notify/n" + i + ".m4a");
    const buf = await r.arrayBuffer();
    ok("通知音 " + i + " が配られている", r.ok && buf.byteLength > 50000 &&
      String(r.headers.get("content-type") || "").indexOf("audio") >= 0,
      r.status + " / " + buf.byteLength + " / " + r.headers.get("content-type"));
  }

  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(SPY);
  const pg = await ctx.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e).slice(0, 170)));
  await boot(pg);

  console.log("\n### 起動したときのお知らせ");
  await pg.waitForTimeout(2600);
  const f = await flash(pg);
  ok("起動したら出る", !!f && f.text.length > 4, f ? f.text.slice(0, 60) : "出なかった");
  if (f) {
    ok("PC は右上に出る", f.x > f.vw / 2 && f.y < 120, "x=" + f.x + " y=" + f.y + " vw=" + f.vw);
    ok("幅がはみ出していない", f.x + f.w <= f.vw, "右端 " + (f.x + f.w) + " / " + f.vw);
  }
  await pg.screenshot({ path: "shots/flash/お知らせ-PC.png" });

  const played = await pg.evaluate(() => window.__vqPlayed.map((x) => x.src));
  ok("出るときに通知音を鳴らそうとする", played.some((s) => /\/assets\/notify\/n\d\.m4a/.test(s)), played.join(","));
  ok("既定は デフォルト（n0）", played.some((s) => /n0\.m4a/.test(s)), played.join(","));

  console.log("\n### 印が残る（次の起動では出さない）");
  const seen1 = await pg.evaluate(() => localStorage.getItem("vq.news.flash.v1"));
  ok("見せた印が残る", !!seen1 && Number(JSON.parse(seen1).at) > 0, String(seen1));
  await boot(pg);
  await pg.waitForTimeout(3200);
  ok("2 回目の起動では出ない", (await flash(pg)) === null);

  console.log("\n### 押したときの動き");
  await pg.evaluate(() => localStorage.removeItem("vq.news.flash.v1"));
  await boot(pg);
  await pg.waitForTimeout(3200);
  ok("印を消せばまた出る", (await flash(pg)) !== null);
  await pg.evaluate(() => {
    const r = document.getElementById("vqNewsFlash").shadowRoot;
    r.querySelector("[data-open]").click();
  });
  await pg.waitForTimeout(900);
  ok("押すと NEWS へ行く", (await pg.evaluate(() => document.body.getAttribute("data-app-tab"))) === "news",
    await pg.evaluate(() => document.body.getAttribute("data-app-tab")));
  ok("押したら消える", (await flash(pg)) === null);

  await pg.evaluate(() => localStorage.removeItem("vq.news.flash.v1"));
  await boot(pg);
  await pg.waitForTimeout(3200);
  await pg.evaluate(() => {
    const r = document.getElementById("vqNewsFlash").shadowRoot;
    r.querySelector("[data-x]").click();
  });
  await pg.waitForTimeout(500);
  ok("× で消える", (await flash(pg)) === null);

  console.log("\n### 設定（音 → 通知音）");
  await pg.evaluate(() => window.__vqOpenSettings());
  await pg.waitForTimeout(500);
  await pg.evaluate(() => {
    const r = document.getElementById("vqSettings").shadowRoot;
    r.querySelector('.nav[data-nav="sound"]').click();
  });
  await pg.waitForTimeout(350);
  const opts = await pg.evaluate(() => {
    const r = document.getElementById("vqSettings").shadowRoot;
    const s = r.querySelector('select.sel[data-set="sound.notify"]');
    return s ? { vals: Array.from(s.options).map((o) => o.value), cur: s.value } : null;
  });
  ok("通知音の欄がある", !!opts, "");
  if (opts) {
    ok("デフォルト＋7 種＋鳴らさない がある", opts.vals.length === 9 && opts.vals[0] === "off" &&
      opts.vals.slice(1).join(",") === "n0,n1,n2,n3,n4,n5,n6,n7", opts.vals.join(","));
    ok("既定で デフォルト が選ばれている", opts.cur === "n0", opts.cur);
  }

  await pg.evaluate(() => { window.__vqPlayed.length = 0; });
  await pg.evaluate(() => {
    const r = document.getElementById("vqSettings").shadowRoot;
    const s = r.querySelector('select.sel[data-set="sound.notify"]');
    s.value = "n5"; s.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await pg.waitForTimeout(700);
  const p2 = await pg.evaluate(() => window.__vqPlayed.map((x) => x.src));
  ok("選ぶとその場で試聴できる", p2.some((s) => /n5\.m4a/.test(s)), p2.join(","));
  ok("選んだ音が保存される", (await pg.evaluate(() => window.__vqSet.get("sound.notify"))) === "n5");

  await pg.evaluate(() => { window.__vqPlayed.length = 0; });
  await pg.evaluate(() => {
    const r = document.getElementById("vqSettings").shadowRoot;
    const s = r.querySelector('select.sel[data-set="sound.notify"]');
    s.value = "off"; s.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await pg.waitForTimeout(600);
  ok("「鳴らさない」では音を作らない",
    (await pg.evaluate(() => window.__vqPlayed.length)) === 0,
    String(await pg.evaluate(() => window.__vqPlayed.length)));

  /* 起動のときに勝手に鳴らないこと（設定の当て直しで鳴らさない） */
  await pg.evaluate(() => {
    const r = document.getElementById("vqSettings").shadowRoot;
    const s = r.querySelector('select.sel[data-set="sound.notify"]');
    s.value = "n3"; s.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await pg.waitForTimeout(500);
  await pg.evaluate(() => { localStorage.setItem("vq.news.flash.v1", JSON.stringify({ at: Date.now() + 864000000 })); });
  await boot(pg);
  await pg.waitForTimeout(3400);
  const p3 = await pg.evaluate(() => window.__vqPlayed.map((x) => x.src));
  ok("お知らせが無いときは起動しても鳴らない", !p3.some((s) => /\/assets\/notify\//.test(s)), p3.join(","));
  ok("設定は残っている", (await pg.evaluate(() => window.__vqSet.get("sound.notify"))) === "n3");
  ok("画面の失敗が出ていない（PC）", errs.length === 0, errs.join(" / "));

  console.log("\n### スマホ");
  const mctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await mctx.addInitScript(SPY);
  const mp = await mctx.newPage();
  const merrs = [];
  mp.on("pageerror", (e) => merrs.push(String(e).slice(0, 170)));
  await boot(mp);
  await mp.waitForTimeout(3200);
  const mf = await flash(mp);
  ok("スマホでも出る", !!mf, mf ? mf.text.slice(0, 50) : "出なかった");
  if (mf) {
    ok("スマホは上に出る（横いっぱい）", mf.y < 110 && mf.w > mf.vw * 0.85 && mf.x < 20,
      "x=" + mf.x + " y=" + mf.y + " w=" + mf.w + " vw=" + mf.vw);
    ok("スマホでもはみ出していない", mf.x + mf.w <= mf.vw, "右端 " + (mf.x + mf.w) + " / " + mf.vw);
  }
  await mp.screenshot({ path: "shots/flash/お知らせ-スマホ.png" });
  ok("画面の失敗が出ていない（スマホ）", merrs.length === 0, merrs.join(" / "));

  await b.close();
  console.log("\n合格 " + pass + " / 不合格 " + fail);
  process.exit(fail ? 1 : 0);
})();
