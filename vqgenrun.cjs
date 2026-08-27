/* ══════════════════════════════════════════════════════════════════════
   作りかけの試験が、画面を離れても残るか

   これまで作成中の状態は Quick Mock の open() の中にあったので、
   **閉じた瞬間に作りかけも、出したことばも消えていた**。
   ここで見るのは、それが画面の外（VQ2.genrun）に残っているか。

     ① 作りかけが端末に保存される
     ② 出したことばが残り、開き直すと読める
     ③ 「できた数 / 頼んだ数」が実数で入る（推測が混ざらない）
     ④ プリセット一覧に「作成中」として出る
     ⑤ 帯の幅が できた数 ÷ 頼んだ数 と一致する
     ⑥ 足りないのに「できました」と書かない
     ⑦ 読み込み直しても残っている
     ⑧ ことばが少しずつ出る（一気に出ない）

   使い方: node vqgenrun.cjs
   ══════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const fs = require("node:fs");
const BASE = process.env.VQ_BASE || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
fs.mkdirSync("shots/genrun", { recursive: true });

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => {
  c ? (pass++, console.log("  ok   " + n))
    : (fail++, bad.push(n), console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 280) : "")));
};
const section = (t) => console.log("\n══ " + t + " ══");

(async () => {
  const br = await chromium.launch({ headless: true });
  const ctx = await br.newContext({ viewport: { width: 1440, height: 950 } });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e.message).slice(0, 200)));
  await pg.goto(BASE + "/?vqdev=1&cb=" + Date.now(), { waitUntil: "domcontentloaded", timeout: 180000 });
  await pg.waitForTimeout(6000);

  section("入れ物がある");
  ok("画面の失敗が出ていない", errs.length === 0, errs.slice(0, 3));
  const api = await pg.evaluate(() => {
    const g = window.VQ2 && window.VQ2.genrun;
    return {
      has: !!g,
      fns: g ? ["begin", "log", "progress", "finish", "list", "active", "get", "remove", "onChange"]
        .filter((k) => typeof g[k] === "function") : []
    };
  });
  ok("VQ2.genrun がある", api.has, api);
  ok("必要な口がそろっている", api.fns.length === 9, api.fns);

  section("作りかけが残る");
  const made = await pg.evaluate(() => {
    const g = window.VQ2.genrun;
    const r = g.begin({ title: "光合成の小テスト", planned: 12 });
    g.log(r.id, "step", "大問 2 ・ 全 12 問の枠を先に決めました");
    g.log(r.id, "done", "大問1 の 第1問〜第5問（現在 5 / 12問）");
    g.progress(r.id, { made: 5, planned: 12, stage: "問題を作っています" });
    return { id: r.id, list: g.list().length };
  });
  ok("作りかけが 1 件できた", made.list >= 1, made);

  const stored = await pg.evaluate((id) => {
    /* **端末に保存されているか**を、入れ物ごしではなく直接見る。
       ここを画面の中の変数で見ると、保存できていなくても通ってしまう。 */
    const raw = JSON.parse(localStorage.getItem("vq2.genrun.v1") || "{}");
    const all = Object.keys(raw).map((k) => raw[k]).reduce((a, b) => a.concat(b), []);
    const r = all.filter((x) => x && x.id === id)[0] || null;
    return r ? { made: r.made, planned: r.planned, status: r.status, logs: (r.logs || []).length, stage: r.stage } : null;
  }, made.id);
  console.log("   " + JSON.stringify(stored));
  ok("★端末に保存されている", !!stored, stored);
  ok("★できた数と頼んだ数が実数で入る", !!stored && stored.made === 5 && stored.planned === 12, stored);
  ok("★出したことばが残っている", !!stored && stored.logs === 2, stored && stored.logs);
  ok("作成中になっている", !!stored && stored.status === "running", stored && stored.status);

  section("プリセット一覧に「作成中」として出る");
  await pg.evaluate(() => {
    ["firstLaunchOverlay", "vqbFlow", "vqNewAuth", "authGate", "authBootSplash", "vqPin", "vqTour"].forEach((id) => {
      const e = document.getElementById(id); if (e) { e.hidden = true; e.style.setProperty("display", "none", "important"); }
    });
    document.body.classList.remove("auth-booting", "auth-gate-open");
    const a = document.getElementById("app"); if (a) a.style.setProperty("display", "block", "important");
    document.body.setAttribute("data-ui-v2", "1");
    const b = document.querySelector('#appTabBar [data-app-tab="library"]');
    if (b) b.click(); else document.body.setAttribute("data-app-tab", "library");
  });
  await pg.waitForTimeout(2500);
  const card = await pg.evaluate(() => {
    const block = document.getElementById("appLibraryGenRunBlock");
    const list = document.getElementById("appLibraryGenRunList");
    const c = list && list.querySelector(".app-library-draft-card");
    const bar = c && c.querySelector(".app-genrun-bar > span");
    return {
      shown: !!block && !block.classList.contains("hidden"),
      title: c ? (c.querySelector(".app-library-draft-title") || {}).textContent : null,
      meta: c ? (c.querySelector(".app-library-draft-meta") || {}).textContent : null,
      width: bar ? bar.style.width : null,
      actions: c ? Array.from(c.querySelectorAll("[data-lib-action]")).map((b) => b.getAttribute("data-lib-action")) : []
    };
  });
  console.log("   " + JSON.stringify(card));
  ok("「作成中」の欄が出ている", card.shown, card);
  ok("題名が出ている", String(card.title || "").indexOf("光合成") >= 0, card.title);
  ok("★「5 / 12問」が出ている", String(card.meta || "").indexOf("5 / 12問") >= 0, card.meta);
  ok("★帯 = できた数 ÷ 頼んだ数", card.width === Math.round((5 / 12) * 100) + "%", { 実際: card.width, 期待: Math.round((5 / 12) * 100) + "%" });
  ok("開くボタンがある", card.actions.indexOf("openGenRun") >= 0, card.actions);
  await pg.screenshot({ path: "shots/genrun/作成中.png" });

  section("足りないのに「できました」と書かない");
  const fin = await pg.evaluate((id) => {
    const g = window.VQ2.genrun;
    g.finish(id, { made: 9, questions: [] });        /* 12 問頼んで 9 問 */
    const r = g.get(id);
    return { status: r.status, made: r.made, planned: r.planned };
  }, made.id);
  console.log("   " + JSON.stringify(fin));
  ok("★9/12 は「できました」にしない", fin.status === "partial", fin);

  const fin2 = await pg.evaluate(() => {
    const g = window.VQ2.genrun;
    const r = g.begin({ title: "そろった試験", planned: 3 });
    g.finish(r.id, { made: 3, questions: [{ q: 1 }, { q: 2 }, { q: 3 }] });
    return g.get(r.id).status;
  });
  ok("そろっていれば「できました」", fin2 === "done", fin2);

  section("読み込み直しても残る");
  await pg.reload({ waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(5000);
  const after = await pg.evaluate((id) => {
    const r = window.VQ2.genrun.get(id);
    return r ? { made: r.made, planned: r.planned, status: r.status, logs: (r.logs || []).length } : null;
  }, made.id);
  console.log("   " + JSON.stringify(after));
  ok("★読み込み直しても残っている", !!after, after);
  ok("★ことばも残っている", !!after && after.logs === 2, after && after.logs);

  section("ことばが少しずつ出る");
  const stagger = await pg.evaluate(() => new Promise((resolve) => {
    const ACT = window.VQ2 && window.VQ2.activity;
    if (!ACT || !ACT.Timeline) return resolve({ skip: true });
    /* 器は Timeline 自身が組む。bind() を呼ばないと DOM を持たない。 */
    const host = document.createElement("div");
    document.body.appendChild(host);
    const tl = new ACT.Timeline({});
    tl.bind(host);
    const t0 = Date.now();
    /* 一度に 6 行入れる。**同時に全部は出ない**のが正しい。 */
    for (let i = 0; i < 6; i++) tl.push({ kind: "info", title: "行 " + i, status: "done" });
    const first = host.querySelectorAll("[data-tlid]").length;
    setTimeout(() => {
      const mid = host.querySelectorAll("[data-tlid]").length;
      setTimeout(() => {
        const end = host.querySelectorAll("[data-tlid]").length;
        const fade = host.querySelector(".is-fadein");
        host.remove();
        resolve({ first: first, mid: mid, end: end, ms: Date.now() - t0, fade: !!fade });
      }, 900);
    }, 120);
  }));
  console.log("   " + JSON.stringify(stagger));
  if (stagger.skip) { ok("タイムラインを試せた", false, "VQ2.activity が無い"); }
  else {
    ok("★入れた瞬間に全部は出ない", stagger.first < 6, stagger);
    ok("★少しずつ増える", stagger.mid > stagger.first, stagger);
    ok("★最後は全部出る", stagger.end === 6, stagger);
    ok("ふわっと出る印が付く", stagger.fade === true, stagger);
  }

  ok("画面の失敗が出ていない（通し）", errs.length === 0, errs.slice(0, 3));
  await br.close();
  console.log("\n合格 " + pass + " / 不合格 " + fail);
  if (bad.length) console.log("直すところ:\n  - " + bad.join("\n  - "));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("実行できませんでした:", e); process.exit(1); });
