/* ══════════════════════════════════════════════════════════════════════
   画面の下端に、何も無い帯が残っていないか

   なぜ数えるのか:
     下に空ける余白を 3 か所が別々の数字で持っていた。
       body … 60px ＋ 安全領域   main … 96px ＋ 安全領域
       実際に出ている帯 … 52 ＋ 12 ＋ 安全領域
     ブラウザで見ているときは安全領域が 0 なので、差はブラウザの下バーに
     隠れて見えない。ホーム画面から開くと安全領域が 34px になり、
     差がそのまま **何も無い帯** として下に出る。

     ここでは安全領域を 0 のまま測るが、いまは
     「main の余白 ＝ 帯の実測値」という **同じ値から引いた式** にしたので、
     安全領域がいくつになっても差は出ない。その等式を確かめる。

   見るところ:
     ① 帯の高さが --vq-mobbar-h として配られている
     ② main の下の余白が、その帯の高さと一致する（±1px）
     ③ body に下の余白が焼かれていない
     ④ 中身の下端が、帯の上端より下へ潜っていない
     ⑤ 画面より下に、何も無い帯が残っていない
     ⑥ 左パネルを開いても、クイズ中でも同じ

   使い方: VQ_BASE=… node vqbottom.cjs
   ══════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
/* 島と 下端の すきま。#vqMobBar の SAFE_EXTRA と そろえる */
const SAFE_EXTRA = (() => {
  const m = /var SAFE_EXTRA = (\d+);/.exec(require("fs").readFileSync(require("path").join(__dirname, "client", "index.html"), "utf8"));
  return m ? parseInt(m[1], 10) : 8;
})();
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => { c ? (pass++, console.log("  ok   " + n))
  : (fail++, bad.push(n), console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 220) : ""))); };
const section = (t) => console.log("\n══ " + t + " ══");

const measure = (pg) => pg.evaluate(() => {
  const num = (v) => Math.round(parseFloat(v) || 0);
  const bar = document.getElementById("vqMobBar");
  const barShown = !!bar && getComputedStyle(bar).display !== "none";
  const barH = barShown ? Math.round(bar.getBoundingClientRect().height) : 0;
  const varH = num(getComputedStyle(document.documentElement).getPropertyValue("--vq-mobbar-h"));
  const main = document.querySelector("main");
  const mainPad = main ? num(getComputedStyle(main).paddingBottom) : null;
  const bodyPad = num(getComputedStyle(document.body).paddingBottom);
  /* 画面の下に、まだスクロールできる余りがどれだけあるか */
  const doc = document.documentElement;
  const overflow = Math.max(0, doc.scrollHeight - doc.clientHeight);
  /* 中身のいちばん下（帯そのものは除く） */
  let lowest = 0;
  const skip = new Set(["VQMOBBAR"]);
  document.querySelectorAll("main, main *").forEach((e) => {
    if (skip.has(e.id)) return;
    const r = e.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.bottom > lowest) lowest = r.bottom;
  });
  return {
    barShown, barH, varH, mainPad, bodyPad, overflow,
    lowest: Math.round(lowest),
    viewH: doc.clientHeight,
    barTop: barShown ? Math.round(bar.getBoundingClientRect().top) : null
  };
});

async function boot(br, w, h) {
  const ctx = await br.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: w <= 820, hasTouch: w <= 820 });
  const pg = await ctx.newPage();
  const errs = []; pg.on("pageerror", (e) => errs.push(String(e.message).slice(0, 160)));
  await pg.goto(BASE + "/?vqdev=1&cb=" + Date.now(), { waitUntil: "domcontentloaded", timeout: 180000 });
  await pg.waitForTimeout(5200);
  await pg.evaluate(() => {
    ["firstLaunchOverlay", "vqbFlow", "vqNewAuth", "authGate", "authBootSplash", "vqPin", "vqTour", "appQreditCardOverlay"].forEach((id) => {
      const e = document.getElementById(id); if (e) { e.hidden = true; e.style.setProperty("display", "none", "important"); }
    });
    document.body.classList.remove("auth-booting", "auth-gate-open");
    const a = document.getElementById("app"); if (a) a.style.setProperty("display", "block", "important");
    document.body.setAttribute("data-ui-v2", "1");
  });
  await pg.waitForTimeout(2200);
  return { pg, errs };
}

(async () => {
  const br = await chromium.launch({ headless: true });

  section("スマホ幅（390x844）");
  {
    const { pg, errs } = await boot(br, 390, 844);
    let m = await measure(pg);
    console.log("   " + JSON.stringify(m));
    ok("① 帯の高さが配られている", m.varH > 0 && m.barShown, m);
    ok("① 配られた値が実際の帯と一致", Math.abs(m.varH - m.barH) <= 1, { varH: m.varH, barH: m.barH });
    ok("② main の下の余白＝帯の高さ", m.mainPad !== null && Math.abs(m.mainPad - m.barH) <= 1, { mainPad: m.mainPad, barH: m.barH });
    ok("③ body に下の余白が焼かれていない", m.bodyPad === 0, m.bodyPad);
    ok("⑤ 何も無い帯が残っていない", m.overflow <= 2, { はみ出し: m.overflow });

    /* ④ は「いちばん下まで送ったとき」に見る。
       送る前の位置で比べても、まだ画面の外にある中身まで数えてしまう。 */
    /* ④ ページのいちばん下（フッタ）まで送って、それが帯に隠れないか。
       この画面は body ではなく中の箱が動くので、
       送る先を自分で探すより **その要素を見せろ**と言うほうが確実。 */
    const tail = await pg.evaluate(async () => {
      const foot = document.getElementById("appHomeFooter");
      if (!foot) return { skip: "フッタが無い" };
      /* この要素を抱えている「実際に動く箱」を、親をたどって見つける。
         scrollIntoView だけだと、下の余白を飛び越えた位置で止まるので、
         「いちばん下まで送りきった状態」にはならない。 */
      let sc = foot.parentElement, guard = 0;
      while (sc && guard++ < 30) {
        if (sc.scrollHeight - sc.clientHeight > 4) break;
        sc = sc.parentElement;
      }
      if (!sc) sc = document.scrollingElement || document.documentElement;
      sc.scrollTop = sc.scrollHeight;
      await new Promise((r) => setTimeout(r, 700));
      const bar = document.getElementById("vqMobBar");
      const barTop = bar ? Math.round(bar.getBoundingClientRect().top) : window.innerHeight;
      const r = foot.getBoundingClientRect();
      return {
        footBottom: Math.round(r.bottom), barTop, viewH: window.innerHeight,
        scroller: (sc.id || sc.tagName) + "", 残り: Math.round(sc.scrollHeight - sc.clientHeight - sc.scrollTop)
      };
    });
    console.log("   いちばん下まで送ったとき: " + JSON.stringify(tail));
    if (tail.skip) console.log("   （" + tail.skip + "ので ④ は見送り）");
    else ok("④ いちばん下まで送ると、フッタが帯より上に出る", tail.footBottom <= tail.barTop + 2, tail);

    section("左パネルを開いたとき");
    await pg.evaluate(() => {
      const t = document.getElementById("appV2SidebarToggle");
      if (t) t.click(); else document.body.classList.add("app-v2-sidebar-open");
    });
    await pg.waitForTimeout(1200);
    m = await measure(pg);
    console.log("   " + JSON.stringify(m));
    ok("③ body の余白は 0 のまま", m.bodyPad === 0, m.bodyPad);
    ok("⑤ 何も無い帯が出ない", m.overflow <= 2, { はみ出し: m.overflow });
    await pg.evaluate(() => {
      const t = document.getElementById("appV2SidebarToggle");
      if (t) t.click(); else document.body.classList.remove("app-v2-sidebar-open");
    });
    await pg.waitForTimeout(800);

    section("クイズの集中モード");
    await pg.evaluate(() => document.body.classList.add("quiz-focus"));
    await pg.waitForTimeout(900);
    m = await measure(pg);
    console.log("   " + JSON.stringify(m));
    ok("帯は消える", !m.barShown, m.barShown);
    ok("配られる高さも 0 になる", m.varH === 0, m.varH);
    ok("③ body の余白は 0", m.bodyPad === 0, m.bodyPad);
    await pg.evaluate(() => document.body.classList.remove("quiz-focus"));

    ok("画面の失敗が出ていない", errs.length === 0, errs.slice(0, 3));
    await pg.context().close();
  }

  section("ホームバーのある機種（安全領域 34px を入れて確かめる）");
  {
    const { pg } = await boot(br, 390, 844);
    /* 安全領域は実機でしか値が入らないので、同じ値を差し込んで測る。 */
    await pg.evaluate(() => document.documentElement.style.setProperty("--vq-safe-bottom", "34px"));
    await pg.evaluate(() => window.dispatchEvent(new Event("resize")));
    await pg.waitForTimeout(900);
    const m = await pg.evaluate(() => {
      const bar = document.getElementById("vqMobBar");
      const r = bar.getBoundingClientRect();
      const sr = bar.shadowRoot;
      const item = sr.querySelector(".t");
      const ir = item ? item.getBoundingClientRect() : null;
      return {
        viewH: window.innerHeight,
        barBottom: Math.round(r.bottom),
        barH: Math.round(r.height),
        すきま: Math.round(window.innerHeight - r.bottom),
        アイコンの下: ir ? Math.round(window.innerHeight - ir.bottom) : null,
        varH: Math.round(parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--vq-mobbar-h")) || 0),
        mainPad: Math.round(parseFloat(getComputedStyle(document.querySelector("main")).paddingBottom) || 0),
        下端にあるもの: (() => { const e = document.elementFromPoint(195, window.innerHeight - 2); return e ? (e.id || e.tagName) : ""; })(),
        器の当たり: (() => { const b = document.getElementById("vqMobBar"); return b ? getComputedStyle(b).pointerEvents : ""; })()
      };
    });
    console.log("   " + JSON.stringify(m));
    ok("★帯が画面のいちばん下まで届く", m.すきま === 0, m);
    /* ★ 2026-09-03 から **浮いた 島**。器は 画面の 下端まで あるが
       素通し（pointer-events:none）なので、最下点に 出るのは その 下に
       ある もの。器が 最下点を 取っていない ことは 崩れでは ない。
       見るべきは「器が 下端まで 届いている」（すきま === 0）の ほう。 */
    ok("★器は 素通り（島だけが 押せる）", m.器の当たり === "none", m.器の当たり);
    /* 島は わざと 浮かせる。空きは 安全領域 ＋ すきま(SAFE_EXTRA)。
       ブラウザは 安全領域 0 なので すきま ぶん だけに なる。 */
    ok("★島の 下の 空きが すきま ＋ 安全領域",
      m.アイコンの下 !== null && Math.abs(m.アイコンの下 - (SAFE_EXTRA + 4)) <= 2,
      { 空き: m.アイコンの下, 期待: SAFE_EXTRA + 4 });
    ok("配る高さも安全領域を含む", Math.abs(m.varH - m.barH) <= 1, { varH: m.varH, barH: m.barH });
    ok("main の余白も追従する", Math.abs(m.mainPad - m.barH) <= 1, { mainPad: m.mainPad, barH: m.barH });
    await pg.context().close();
  }

  section("タブレット幅（834x1112）— 旧バーの条件(768px)との隙間");
  {
    const { pg } = await boot(br, 834, 1112);
    const m = await measure(pg);
    console.log("   " + JSON.stringify(m));
    ok("帯が出ているなら、その高さが配られている", !m.barShown || m.varH > 0, m);
    ok("② main の下の余白＝帯の高さ", m.mainPad !== null && Math.abs(m.mainPad - m.barH) <= 1, { mainPad: m.mainPad, barH: m.barH });
    ok("③ body に下の余白が焼かれていない", m.bodyPad === 0, m.bodyPad);
    ok("⑤ 何も無い帯が残っていない", m.overflow <= 2, { はみ出し: m.overflow });
    await pg.context().close();
  }

  section("PC 幅（1440x900）— 帯は出ない");
  {
    const { pg } = await boot(br, 1440, 900);
    const m = await measure(pg);
    console.log("   " + JSON.stringify(m));
    ok("帯は出ない", !m.barShown, m.barShown);
    ok("下に余白を取らない", (m.mainPad || 0) <= 1 && m.bodyPad === 0, { mainPad: m.mainPad, bodyPad: m.bodyPad });
    await pg.context().close();
  }

  await br.close();
  console.log("\n合格 " + pass + " / 不合格 " + fail);
  if (bad.length) console.log("直すところ:\n  - " + bad.join("\n  - "));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("実行できませんでした:", e); process.exit(1); });
