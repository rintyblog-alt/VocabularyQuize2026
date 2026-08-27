/* ══════════════════════════════════════════════════════════════════════
   ホーム画面から開いたとき（全画面）の上下端

   実機でしか値が入らない安全領域を、同じ値（上 59 / 下 34 = iPhone 15 相当）で
   差し込み、全画面の印も立てて確かめる。これが無いと、この不具合は
   手元のブラウザでは **一度も再現できない**（実際に 2 回見落とした）。

   見るところ:
     ① ログイン画面の見出しが、時計の下に潜っていない
     ② ログイン画面の中身が、ホームバーの帯に潜っていない
     ③ 本体の画面でも同じ
     ④ 画面の最上点・最下点が、後ろの色ではなく面の色で塗られている
     ⑤ ふつうのブラウザ表示では、余計な余白を足さない

   使い方: VQ_BASE=… node vqstandalone.cjs
   ══════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const fs = require("node:fs");
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
fs.mkdirSync("shots/standalone", { recursive: true });

const TOP = 59, BOTTOM = 34;   /* iPhone 15 の実測に近い値 */
let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => { c ? (pass++, console.log("  ok   " + n))
  : (fail++, bad.push(n), console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 240) : ""))); };
const section = (t) => console.log("\n══ " + t + " ══");

async function open(br, { standalone }) {
  const pg = await (await br.newContext({
    viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true
  })).newPage();
  const errs = []; pg.on("pageerror", (e) => errs.push(String(e.message).slice(0, 160)));
  /* 読み込みの前に入れる。あとから足すと、最初の描画に間に合わない。 */
  await pg.addInitScript(([on, top, bottom]) => {
    document.addEventListener("DOMContentLoaded", function () {
      if (on) document.documentElement.setAttribute("data-standalone", "1");
      document.documentElement.style.setProperty("--vq-safe-top", top + "px");
      document.documentElement.style.setProperty("--vq-safe-bottom", bottom + "px");
    });
  }, [standalone, TOP, BOTTOM]);
  await pg.goto(BASE + "/?cb=" + Date.now(), { waitUntil: "domcontentloaded", timeout: 180000 });
  await pg.waitForTimeout(6000);
  await pg.evaluate(([on, top, bottom]) => {
    if (on) document.documentElement.setAttribute("data-standalone", "1");
    else document.documentElement.removeAttribute("data-standalone");
    document.documentElement.style.setProperty("--vq-safe-top", top + "px");
    document.documentElement.style.setProperty("--vq-safe-bottom", bottom + "px");
  }, [standalone, TOP, BOTTOM]);
  await pg.waitForTimeout(1200);
  return { pg, errs };
}

/* 画面の上端・下端の帯に、何色が乗っているかを見る */
const edges = (pg) => pg.evaluate(() => {
  const H = window.innerHeight;
  const at = (y) => {
    const e = document.elementFromPoint(Math.round(window.innerWidth / 2), y);
    return e ? ((e.id || e.tagName) + (e.className && typeof e.className === "string" ? "." + e.className.split(" ")[0] : "")) : null;
  };
  /* ログイン画面のどの段が出ていても効くように、
     **見えている中身の一番上と一番下**を実際に測る。
     特定のクラス名を狙うと、段が違うだけで測れなくなる（実際にそうなった）。 */
  const authHost = document.getElementById("vqNewAuth");
  const shown = authHost && getComputedStyle(authHost).display !== "none";
  let barTop = null, contentBottom = null;
  if (shown && authHost.shadowRoot) {
    let hi = Infinity, lo = -Infinity;
    authHost.shadowRoot.querySelectorAll("*").forEach((el) => {
      if (el.children.length) return;                 /* 末端だけ数える */
      const t = (el.textContent || "").trim();
      const r = el.getBoundingClientRect();
      if (r.width < 6 || r.height < 6) return;
      if (!t && !/^(IMG|SVG|CANVAS)$/.test(el.tagName)) return;
      if (r.bottom <= 0 || r.top >= H) return;        /* 画面の外は数えない */
      if (r.top < hi) hi = r.top;
      if (r.bottom > lo) lo = r.bottom;
    });
    if (hi !== Infinity) barTop = Math.round(hi);
    if (lo !== -Infinity) contentBottom = Math.round(lo);
  }
  return {
    viewH: H,
    ログイン画面: !!shown,
    見出しの上: barTop,
    中身の下: contentBottom,
    最上点: at(2), 最下点: at(H - 2),
    hostPadTop: shown ? getComputedStyle(authHost).paddingTop : null,
    hostPadBottom: shown ? getComputedStyle(authHost).paddingBottom : null
  };
});

(async () => {
  const br = await chromium.launch({ headless: true });
  let standaloneTop = null;

  section("全画面（ホーム画面から開いた）— 安全領域 上" + TOP + " 下" + BOTTOM);
  {
    const { pg, errs } = await open(br, { standalone: true });
    const e = await edges(pg);
    console.log("   " + JSON.stringify(e));
    await pg.screenshot({ path: "shots/standalone/全画面.png" });
    ok("全画面と判定されている", await pg.evaluate(() => document.documentElement.getAttribute("data-standalone") === "1"));
    if (e.ログイン画面) {
      ok("★中身が時計の下に潜っていない", e.見出しの上 !== null && e.見出しの上 >= TOP, { 中身の上: e.見出しの上, 安全領域: TOP });
      ok("★中身がホームバーの帯に潜っていない", e.中身の下 !== null && e.中身の下 <= e.viewH - BOTTOM + 1,
        { 中身の下: e.中身の下, 下限: e.viewH - BOTTOM });
      standaloneTop = e.見出しの上;
      ok("上の余白が入っている", (parseFloat(e.hostPadTop) || 0) === TOP, e.hostPadTop);
      ok("下の余白が入っている", (parseFloat(e.hostPadBottom) || 0) === BOTTOM, e.hostPadBottom);
    } else {
      ok("★画面の最上点が塗られている", !!e.最上点, e.最上点);
      ok("★画面の最下点が塗られている", !!e.最下点, e.最下点);
    }
    ok("画面の失敗が出ていない", errs.length === 0, errs.slice(0, 3));
    await pg.context().close();
  }

  section("ふつうのブラウザ表示 — 余計な余白を足さない");
  {
    const { pg, errs } = await open(br, { standalone: false });
    const e = await edges(pg);
    console.log("   " + JSON.stringify(e));
    await pg.screenshot({ path: "shots/standalone/ブラウザ.png" });
    ok("全画面とは判定されない", await pg.evaluate(() => !document.documentElement.hasAttribute("data-standalone")));
    if (e.ログイン画面) {
      ok("上に余白を足さない", (parseFloat(e.hostPadTop) || 0) === 0, e.hostPadTop);
      ok("下に余白を足さない", (parseFloat(e.hostPadBottom) || 0) === 0, e.hostPadBottom);
      /* 全画面のときと比べて、ちょうど安全領域ぶんだけ下から始まっているか。
         「上のほう」といった曖昧な条件ではなく、差が TOP と一致するかを見る。 */
      ok("★全画面との差が、ちょうど安全領域ぶん",
        e.見出しの上 !== null && standaloneTop !== null && Math.abs((standaloneTop - e.見出しの上) - TOP) <= 1,
        { 全画面: standaloneTop, ブラウザ: e.見出しの上, 差: standaloneTop - e.見出しの上, 期待: TOP });
    }
    ok("画面の失敗が出ていない", errs.length === 0, errs.slice(0, 3));
    await pg.context().close();
  }

  section("画面ごと — 下端にすきまが残らないか（構造が違う画面がある）");
  {
    const { pg } = await open(br, { standalone: true });
    await pg.evaluate(() => {
      ["firstLaunchOverlay", "vqbFlow", "vqNewAuth", "authGate", "authBootSplash", "vqPin", "vqTour"].forEach((id) => {
        const e = document.getElementById(id); if (e) { e.hidden = true; e.style.setProperty("display", "none", "important"); }
      });
      document.body.classList.remove("auth-booting", "auth-gate-open");
      const a = document.getElementById("app"); if (a) a.style.setProperty("display", "block", "important");
      document.body.setAttribute("data-ui-v2", "1");
    });
    await pg.waitForTimeout(2200);
    /* ホームとプリセットだけ #vqScreens（画面いっぱいの固定レイヤー）で描かれる。
       固定レイヤーは webview の外側を塗れないので、webview が押し込まれていると
       この 2 画面だけ下に帯が残る。ほかの画面は通常の流れなので目立たない。
       全画面のときに全部の画面で下端が埋まっているかを、まとめて見る。 */
    for (const tab of ["home", "library", "inbox", "notifications", "qredit"]) {
      await pg.evaluate((t) => {
        const b = document.querySelector('#appTabBar [data-app-tab="' + t + '"]');
        if (b) b.click(); else document.body.setAttribute("data-app-tab", t);
      }, tab);
      await pg.waitForTimeout(1500);
      const m = await pg.evaluate(() => {
        const H = window.innerHeight;
        const bar = document.getElementById("vqMobBar");
        const r = bar ? bar.getBoundingClientRect() : null;
        const scr = document.getElementById("vqScreens");
        const covered = !!scr && document.body.classList.contains("vqscr-on");
        const at = (y) => { const e = document.elementFromPoint(Math.round(window.innerWidth / 2), y); return e ? (e.id || e.tagName) : null; };
        return {
          tab: document.body.getAttribute("data-app-tab"),
          覆い: covered ? "vqScreens" : "通常",
          すきま: r ? Math.round(H - r.bottom) : null,
          最下点: at(H - 2)
        };
      });
      console.log("   " + JSON.stringify(m));
      ok(m.tab + " — 帯が下端まで届く", m.すきま === 0, m);
      ok(m.tab + " — 最下点が塗られている", !!m.最下点, m);
    }
    await pg.context().close();
  }

  await br.close();
  console.log("\n合格 " + pass + " / 不合格 " + fail);
  if (bad.length) console.log("直すところ:\n  - " + bad.join("\n  - "));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("実行できませんでした:", e); process.exit(1); });
