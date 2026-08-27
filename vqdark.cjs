/* ══════════════════════════════════════════════════════════════════════════
   vqdark.cjs — ダーク・アクセントの色・角の丸みが「全部の画面」に効くか

   直書きの色（#fff / #2B2836 …）をトークン（--vq-*）へ置き換えたので、
   ・テーマを変えると層の中まで色が変わる
   ・アクセントを変えるとボタンや選択中の色が一斉に変わる
   ・角の倍率を変えるとカードの角が一斉に変わる
   はずである。それを画面ごとに実際に測る。
   ══════════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const fs = require("node:fs");
fs.mkdirSync("shots/dark", { recursive: true });

const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  NG   " + n + (x ? "  → " + x : ""))); };
const lum = (s) => { const m = String(s || "").match(/\d+/g); return m ? (Number(m[0]) + Number(m[1]) + Number(m[2])) / 3 : -1; };

/* 画面ごとの「面」と「文字」の代表。shadow root の中を見る。 */
const SPOTS = [
  { tab: "home", host: "vqScreens", surf: ".wrap", ink: ".hero__title,.ph__title,h1,h2", name: "ホーム" },
  { tab: "inbox", host: "vqFeed", surf: ".col,.card,.post", ink: ".name,h1,h2", name: "Feed" },
  { tab: "news", host: "vqNews", surf: ".art,.card", ink: "h1,h3", name: "NEWS" },
  { tab: "insight", host: "vqInsight", surf: ".card,.wrap", ink: "h1,h2,.k", name: "Insights" },
  { tab: "notifications", host: "vqNotif", surf: ".art,.card,.wrap", ink: "h1,h3", name: "通知" },
  { tab: "chat", host: "vqChat", surf: ".root", ink: ".side,.stitle,h1", name: "Quick Chat" }
];

async function boot(pg) {
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
    try { window.__vqNewsFlash.close(); } catch (e) {}
  });
  await pg.waitForTimeout(1600);
}
const setTheme = (pg, m) => pg.evaluate((m) => {
  const s = document.getElementById("settingsThemeSelect");
  s.value = m; s.dispatchEvent(new Event("change", { bubbles: true }));
}, m);
const probe = (pg, spot) => pg.evaluate((sp) => {
  const h = document.getElementById(sp.host);
  if (!h || !h.shadowRoot) return null;
  const s = h.shadowRoot.querySelector(sp.surf);
  const i = h.shadowRoot.querySelector(sp.ink);
  const bgOf = (el) => {
    /* 透明なら親をたどって、実際に塗られている色を取る */
    let n = el;
    for (let k = 0; k < 6 && n; k++) {
      const c = getComputedStyle(n).backgroundColor;
      if (c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent") return c;
      n = n.parentElement || (n.getRootNode() && n.getRootNode().host);
    }
    return "";
  };
  return {
    surf: s ? bgOf(s) : "", ink: i ? getComputedStyle(i).color : "",
    rad: s ? getComputedStyle(s).borderTopLeftRadius : ""
  };
}, spot);

/* 層は遅れて組み上がる。取れるまで少し待ってから測る。 */
async function settle(pg, sp) {
  await pg.evaluate((t) => document.body.setAttribute("data-app-tab", t), sp.tab);
  let r = null;
  for (let i = 0; i < 12; i++) {
    await pg.waitForTimeout(500);
    r = await probe(pg, sp);
    if (r && r.surf && r.ink) return r;
  }
  return r;
}

(async () => {
  const b = await chromium.launch({ headless: true });
  const pg = await (await b.newContext({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 2 })).newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e).slice(0, 170)));
  await boot(pg);

  /* 各画面を一度ずつ開いて、層を組み上げさせる */
  for (const sp of SPOTS) {
    await pg.evaluate((t) => document.body.setAttribute("data-app-tab", t), sp.tab);
    await pg.waitForTimeout(1200);
  }

  const light = {}, dark = {};
  console.log("\n### ライト");
  await setTheme(pg, "LIGHT"); await pg.waitForTimeout(900);
  for (const sp of SPOTS) {
    light[sp.tab] = await settle(pg, sp);
    ok(sp.name + "：面が明るい", light[sp.tab] && lum(light[sp.tab].surf) > 170,
      JSON.stringify(light[sp.tab]));
  }

  console.log("\n### ダーク");
  await setTheme(pg, "DARK"); await pg.waitForTimeout(900);
  for (const sp of SPOTS) {
    dark[sp.tab] = await settle(pg, sp);
    const d = dark[sp.tab];
    ok(sp.name + "：面が暗くなる", d && lum(d.surf) < 90, JSON.stringify(d));
    ok(sp.name + "：文字が明るくなる", d && lum(d.ink) > 140, d ? d.ink : "");
    ok(sp.name + "：面と文字が離れている", d && Math.abs(lum(d.surf) - lum(d.ink)) > 70,
      d ? lum(d.surf).toFixed(0) + " vs " + lum(d.ink).toFixed(0) : "");
    await pg.screenshot({ path: "shots/dark/" + sp.tab + ".png" });
  }
  /* 設定画面もダークになるか */
  await pg.evaluate(() => window.__vqOpenSettings());
  await pg.waitForTimeout(700);
  const setDark = await pg.evaluate(() => {
    const r = document.getElementById("vqSettings").shadowRoot;
    const m = r.querySelector(".modal"), t = r.querySelector(".row__label");
    return { bg: getComputedStyle(m).backgroundColor, fg: t ? getComputedStyle(t).color : "" };
  });
  ok("設定：面が暗くなる", lum(setDark.bg) < 90, JSON.stringify(setDark));
  ok("設定：文字が明るくなる", lum(setDark.fg) > 140, setDark.fg);
  await pg.screenshot({ path: "shots/dark/settings.png" });

  console.log("\n### アクセントの色");
  await setTheme(pg, "LIGHT"); await pg.waitForTimeout(700);
  const accentOf = () => pg.evaluate(() => {
    const r = document.getElementById("vqSettings").shadowRoot;
    const nav = r.querySelector(".nav.on");
    const sw = r.querySelector(".sw.on");
    return {
      root: getComputedStyle(document.documentElement).getPropertyValue("--vq-accent").trim(),
      nav: nav ? getComputedStyle(nav).color : "",
      sw: sw ? getComputedStyle(sw).backgroundColor : ""
    };
  });
  const a0 = await accentOf();
  await pg.evaluate(() => {
    const r = document.getElementById("vqSettings").shadowRoot;
    r.querySelector('.nav[data-nav="display"]').click();
  });
  await pg.waitForTimeout(300);
  await pg.evaluate(() => {
    const r = document.getElementById("vqSettings").shadowRoot;
    const s = r.querySelector('select.sel[data-set="display.accent"]');
    s.value = "teal"; s.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await pg.waitForTimeout(700);
  const a1 = await accentOf();
  ok("アクセントの値が変わる", a1.root.toLowerCase() === "#3e8f86", a0.root + " → " + a1.root);
  const rgb = (x) => (String(x).match(/\d+/g) || [0, 0, 0]).map(Number);
  ok("設定画面の選択中の色が変わる",
    a1.nav !== a0.nav && rgb(a1.nav)[1] > rgb(a1.nav)[0], a0.nav + " → " + a1.nav);
  ok("入／切のつまみの色も変わる", a1.sw !== a0.sw, a0.sw + " → " + a1.sw);

  /* 別の画面（NEWS）にも届くか */
  await pg.evaluate(() => window.__vqCloseSettings());
  await pg.evaluate(() => document.body.setAttribute("data-app-tab", "news"));
  await pg.waitForTimeout(1200);
  const newsAccent = await pg.evaluate(() => {
    const h = document.getElementById("vqNews");
    const c = h.shadowRoot.querySelector(".chip[aria-selected='true'],.chip.on,.chip");
    return c ? getComputedStyle(c).getPropertyValue("--vq-accent").trim() : "";
  });
  ok("ほかの画面にも同じ色が届く", newsAccent.toLowerCase() === "#3e8f86", newsAccent);
  await pg.screenshot({ path: "shots/dark/アクセント-teal.png" });

  console.log("\n### 角の丸み");
  await pg.evaluate(() => window.__vqOpenSettings());
  await pg.waitForTimeout(500);
  await pg.evaluate(() => {
    const r = document.getElementById("vqSettings").shadowRoot;
    r.querySelector('.nav[data-nav="display"]').click();
  });
  await pg.waitForTimeout(300);
  const radBefore = await pg.evaluate(() => {
    const r = document.getElementById("vqSettings").shadowRoot;
    return getComputedStyle(r.querySelector(".grp")).borderTopLeftRadius;
  });
  await pg.evaluate(() => {
    const r = document.getElementById("vqSettings").shadowRoot;
    r.querySelector('.seg button[data-set="display.radius"][data-val="square"]').click();
  });
  await pg.waitForTimeout(500);
  const radSquare = await pg.evaluate(() => {
    const r = document.getElementById("vqSettings").shadowRoot;
    return getComputedStyle(r.querySelector(".grp")).borderTopLeftRadius;
  });
  ok("「角ばる」で角が小さくなる", parseFloat(radSquare) < parseFloat(radBefore) - 2,
    radBefore + " → " + radSquare);
  await pg.evaluate(() => {
    const r = document.getElementById("vqSettings").shadowRoot;
    r.querySelector('.seg button[data-set="display.radius"][data-val="round"]').click();
  });
  await pg.waitForTimeout(500);
  const radRound = await pg.evaluate(() => {
    const r = document.getElementById("vqSettings").shadowRoot;
    return getComputedStyle(r.querySelector(".grp")).borderTopLeftRadius;
  });
  ok("「丸い」で角が大きくなる", parseFloat(radRound) > parseFloat(radBefore) + 2,
    radBefore + " → " + radRound);
  await pg.evaluate(() => window.__vqCloseSettings());
  await pg.evaluate(() => document.body.setAttribute("data-app-tab", "news"));
  await pg.waitForTimeout(1200);
  const newsRad = await pg.evaluate(() => {
    const h = document.getElementById("vqNews");
    const c = h.shadowRoot.querySelector(".art,.card");
    return c ? getComputedStyle(c).borderTopLeftRadius : "";
  });
  ok("ほかの画面の角も一緒に動く", parseFloat(newsRad) > 20, newsRad);
  await pg.screenshot({ path: "shots/dark/角-丸い.png" });

  /* 丸ボタン（999px）は動かないこと */
  const pill = await pg.evaluate(() => {
    const h = document.getElementById("vqNews");
    const c = h.shadowRoot.querySelector(".chip");
    return c ? getComputedStyle(c).borderTopLeftRadius : "";
  });
  ok("丸いボタンは丸のまま", parseFloat(pill) > 100, pill);

  ok("画面の失敗が出ていない", errs.length === 0, errs.join(" / "));
  await b.close();
  console.log("\n合格 " + pass + " / 不合格 " + fail);
  process.exit(fail ? 1 : 0);
})();
