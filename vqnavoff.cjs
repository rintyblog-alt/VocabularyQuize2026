/* ══════════════════════════════════════════════════════════════════════
   左パネルの「公開前の錠」（Qredit / Subscription）

   確かめること:
     A) 錠を掛けたとき … 灰色・押せない・案内が出る・押しても画面が移らない
     B) 錠を外したとき … 押せる・案内は消える・実際にその画面が開く

   錠の入り切りは localStorage の vq.nav.launchLock（"1" 掛ける / "0" 外す）。
   本体の既定値（NAV_LAUNCH_LOCK_DEFAULT）より、こちらが優先される。
   ══════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const fs = require("node:fs"); fs.mkdirSync("shots/nav", { recursive: true });
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  NG   " + n + (x ? "  → " + x : ""))); };

/* 錠の状態を決めてから開く。サイドバーは読み込み時に一度だけ組まれるので、
   あとから localStorage を書いても間に合わない。 */
async function boot(br, lock) {
  const pg = await (await br.newContext({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 2 })).newPage();
  const errs = []; pg.on("pageerror", (e) => errs.push(String(e).slice(0, 140)));
  await pg.addInitScript((v) => {
    localStorage.setItem("vq.nav.launchLock", v);
    localStorage.setItem("vq.tour.v1", JSON.stringify({
      pin: 1, preset: 1, feed: 1, news: 1, insight: 1, chat: 1, notif: 1, mock: 1, presetmake: 1, settings: 1
    }));
  }, lock);
  await pg.goto(BASE + "/?vqdev=1&cb=" + Date.now(), { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(4000);
  await pg.evaluate(() => {
    ["firstLaunchOverlay", "vqbFlow", "vqNewAuth", "authGate", "authBootSplash"].forEach((id) => {
      const e = document.getElementById(id); if (e) { e.hidden = true; e.style.setProperty("display", "none", "important"); }
    });
    document.querySelectorAll('[data-act="dlg-x"],[data-act="dlg-o"]').forEach((x) => x.click());
    document.body.classList.remove("auth-booting", "auth-gate-open");
    const a = document.getElementById("app"); if (a) a.style.setProperty("display", "block", "important");
    document.body.setAttribute("data-ui-v2", "1");
    const tv = document.getElementById("vqTour"); if (tv) tv.style.display = "none";
  });
  await pg.waitForTimeout(2000);
  return { pg, errs };
}

const readNav = (pg) => pg.evaluate(() => {
  const r = document.getElementById("vqShell").shadowRoot;
  const it = Array.from(r.querySelectorAll(".vqs-item"));
  const pick = (t) => it.find((x) => (x.innerText || "").trim().indexOf(t) === 0);
  const one = (e) => e ? {
    txt: e.innerText.replace(/\s+/g, " ").trim(),
    note: (e.querySelector(".vqs-item__n") || { innerText: "" }).innerText.trim(),
    noteFits: (() => {
      const a = e.getBoundingClientRect(), m = e.querySelector(".vqs-item__n");
      return m ? m.getBoundingClientRect().right <= a.right + 1 : true;
    })(),
    off: e.classList.contains("is-off"), dis: e.disabled,
    aria: e.getAttribute("aria-disabled"), tab: e.tabIndex,
    col: getComputedStyle(e).color, pe: getComputedStyle(e).pointerEvents
  } : null;
  /* 「灰色」は明暗テーマで値が変わるので、色そのものではなく
     **使っているトークン**（--vq-text-disabled）と一致するかを見る。
     ついでに、ふつうの項目とは違う色であることも確かめる。 */
  const probe = document.createElement("span");
  probe.style.color = "var(--vq-text-disabled)";
  document.body.appendChild(probe);
  const disabledColor = getComputedStyle(probe).color;
  probe.remove();
  return { q: one(pick("Qredit")), s: one(pick("Subscription")), home: one(pick("ホーム")), disabledColor };
});

const clickNav = (pg, label) => pg.evaluate((t) => {
  const r = document.getElementById("vqShell").shadowRoot;
  const el = Array.from(r.querySelectorAll(".vqs-item")).find((x) => (x.innerText || "").trim().indexOf(t) === 0);
  if (el) el.click();
  return !!el;
}, label);

(async () => {
  const br = await chromium.launch({ headless: true });

  console.log("\n### A) 錠を掛けたとき");
  {
    const { pg, errs } = await boot(br, "1");
    const before = await pg.evaluate(() => document.body.getAttribute("data-app-tab"));
    const info = await readNav(pg);
    const gray = (x) => !!x && x.off && x.col === info.disabledColor && x.col !== info.home.col;
    ok("Qredit が灰色", gray(info.q), (info.q && info.q.col) + " / 灰色は " + info.disabledColor);
    ok("Qredit が押せない", !!info.q && info.q.dis && info.q.pe === "none" && info.q.tab === -1);
    ok("Subscription が灰色", gray(info.s), (info.s && info.s.col) + " / 灰色は " + info.disabledColor);
    ok("Subscription が押せない", !!info.s && info.s.dis && info.s.pe === "none");
    ok("ほかの項目は今までどおり", !!info.home && !info.home.off && !info.home.dis, JSON.stringify(info.home));
    await clickNav(pg, "Qredit"); await clickNav(pg, "Subscription");
    await pg.waitForTimeout(1200);
    const after = await pg.evaluate(() => document.body.getAttribute("data-app-tab"));
    ok("押しても画面が移らない", after === before, before + " → " + after);
    /* 案内の日付は公開日が動くたびに変わるので、日付そのものではなく
       「両方に同じ、日付つきの案内が出ている」ことを見る。 */
    const noteOk = (t) => /^\d+月\d+日 launch$/.test(String(t || ""));
    ok("Qredit に公開日の案内が出る", noteOk(info.q && info.q.note), info.q && info.q.note);
    ok("Subscription にも同じ案内が出る", noteOk(info.s && info.s.note) && info.s.note === info.q.note, info.s && info.s.note);
    ok("はみ出していない", !!info.q && info.q.noteFits && info.s.noteFits);
    ok("ほかの項目には付かない", !!info.home && !info.home.note, info.home && info.home.note);
    ok("画面の失敗が出ていない", errs.length === 0, errs.join(" / "));
    await pg.screenshot({ path: "shots/nav/左パネル-錠あり.png" });
    await pg.context().close();
  }

  console.log("\n### B) 錠を外したとき（いまの検証中の状態）");
  {
    const { pg, errs } = await boot(br, "0");
    const info = await readNav(pg);
    ok("Qredit が押せる", !!info.q && !info.q.off && !info.q.dis && info.q.pe !== "none", JSON.stringify(info.q));
    ok("Subscription が押せる", !!info.s && !info.s.off && !info.s.dis && info.s.pe !== "none", JSON.stringify(info.s));
    ok("公開日の案内は消える", !!info.q && !info.q.note && !info.s.note, (info.q && info.q.note) + " / " + (info.s && info.s.note));

    await clickNav(pg, "Subscription");
    await pg.waitForTimeout(1500);
    const tab = await pg.evaluate(() => document.body.getAttribute("data-app-tab"));
    ok("Subscription を押すとその画面へ移る", tab === "subscription", String(tab));

    await clickNav(pg, "Qredit");
    await pg.waitForTimeout(2600);
    /* Qredit は「重ねる窓」ではなく 1 枚の画面になった。
       確かめるのは、タブが移って新しい画面が立ち上がることと、
       **古い窓が出てこない**こと。 */
    const q = await pg.evaluate(() => ({
      tab: document.body.getAttribute("data-app-tab") || "",
      mounted: !!document.getElementById("vqQredit"),
      oldSheet: (() => { const o = document.getElementById("appQreditOverlay"); return !!o && !o.classList.contains("hidden"); })(),
      oldCard: (() => { const o = document.getElementById("appQreditCardOverlay"); return !!o && !o.classList.contains("hidden"); })()
    }));
    ok("Qredit を押すとその画面へ移る", q.tab === "qredit", JSON.stringify(q));
    ok("新しい Qredit の画面が立ち上がる", q.mounted, JSON.stringify(q));
    ok("古い重ねる窓は出てこない", !q.oldSheet && !q.oldCard, JSON.stringify(q));
    ok("画面の失敗が出ていない", errs.length === 0, errs.join(" / "));
    await pg.screenshot({ path: "shots/nav/左パネル-錠なし.png" });
    await pg.context().close();
  }

  await br.close();
  console.log("\n合格 " + pass + " / 不合格 " + fail);
  process.exit(fail ? 1 : 0);
})();
