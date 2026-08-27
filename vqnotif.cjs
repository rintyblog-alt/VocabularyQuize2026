/* 通知（vq-notif）を、実際の通知を入れて確かめる。
   使い方: node vqnotif.cjs                                                    */
const { chromium } = require("playwright");
const fs = require("node:fs");
fs.mkdirSync("shots/notif", { recursive: true });

const BASE = "http://127.0.0.1:8791";
const NOTIF_KEY = "app.notifications.v1";
const SEEN_KEY = "app.notifications.seenAt.v1";

let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log("  ok   " + n))
                            : (fail++, console.log("  NG   " + n + (x ? "  → " + x : ""))); };

const F = (pg, s) => pg.evaluate((x) => !!document.getElementById("vqNotif").shadowRoot.querySelector(x), s);
const N = (pg, s) => pg.evaluate((x) => document.getElementById("vqNotif").shadowRoot.querySelectorAll(x).length, s);
const C = (pg, s) => pg.evaluate((x) => {
  const e = document.getElementById("vqNotif").shadowRoot.querySelector(x);
  if (e) e.click(); return !!e;
}, s);
const T = (pg, s) => pg.evaluate((x) => {
  const e = document.getElementById("vqNotif").shadowRoot.querySelector(x);
  return e ? (e.innerText || "").replace(/\s+/g, " ").trim() : "";
}, s);

/* 検証用の通知。作り話の数を画面へ直に書かず、本体が読む所へ入れて
   本体の一覧・既読を通して出させる。 */
function notifs() {
  const now = Date.now();
  return [
    { id: "n1", type: "follow_received", actorUserId: 12, title: "H2 ゆうき さんにフォローされました",
      body: "プロフィールから相手を見られます。", category: "Social", priority: "normal",
      meta: {}, ts: now - 5 * 60000 },
    { id: "n2", type: "private_follow_request", actorUserId: 34, title: "閲覧リクエストが届いています",
      body: "H1 みなと さんが、あなたの非公開プロフィールを見たがっています。",
      category: "Social", priority: "high", meta: {}, ts: now - 40 * 60000 },
    { id: "n3", type: "login_failed", actorUserId: 0, title: "ログインに失敗しました",
      body: "知らない端末からの試行です。\n\n心当たりがなければ、パスワードを変えてください。",
      category: "Security", priority: "high", meta: {}, ts: now - 5 * 3600000 },
    { id: "n4", type: "update", actorUserId: 0, title: "Quick Mock が速くなりました",
      body: "同じ品質のまま、1 問あたりの時間を縮めました。",
      category: "Update", priority: "normal", meta: {}, ts: now - 2 * 86400000 },
    { id: "n5", type: "private_follow_approved", actorUserId: 56, title: "閲覧リクエストが承認されました",
      body: "相手のプロフィールを見られるようになりました。",
      category: "Social", priority: "normal", meta: { status: "approved" }, ts: now - 6 * 86400000 }
  ];
}

async function prep(pg, list, seenAt) {
  await pg.goto(BASE + "/?vqdev=1&cb=" + Date.now(), { waitUntil: "domcontentloaded" });
  await pg.evaluate(([k, sk, v, s]) => {
    if (v) localStorage.setItem(k, v); else localStorage.removeItem(k);
    localStorage.setItem(sk, String(s || 0));
  }, [NOTIF_KEY, SEEN_KEY, list ? JSON.stringify(list) : "", seenAt || 0]);
  await pg.reload({ waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(3400);
  await pg.evaluate(() => {
    ["firstLaunchOverlay", "vqbFlow", "vqNewAuth", "authGate", "authBootSplash"].forEach((id) => {
      const e = document.getElementById(id);
      if (e) { e.hidden = true; e.style.setProperty("display", "none", "important"); }
    });
    document.querySelectorAll('[data-act="dlg-x"],[data-act="dlg-o"]').forEach((x) => x.click());
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

    document.body.setAttribute("data-app-tab", "notifications");
  });
  await pg.waitForTimeout(2800);
  await pg.evaluate(() => {
    document.querySelectorAll('[data-act="dlg-x"],[data-act="dlg-o"]').forEach((x) => x.click());
  });
  await pg.waitForTimeout(400);
}

(async () => {
  const b = await chromium.launch({ headless: true });

  for (const dev of [{ n: "PC", w: 1440, h: 950, m: false }, { n: "スマホ", w: 390, h: 844, m: true }]) {
    const ctx = await b.newContext({
      viewport: { width: dev.w, height: dev.h }, deviceScaleFactor: 2, isMobile: dev.m, hasTouch: dev.m
    });
    const pg = await ctx.newPage();
    const errs = [];
    pg.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
    /* 5 件のうち 2 件だけ既読にしておく（未読の見え方を測るため） */
    const list = notifs();
    await prep(pg, list, list[2].ts);

    console.log("\n== " + dev.n + " ==");
    ok(dev.n + "：新しい通知画面が出ている", await F(pg, ".wrap .head h1"));
    ok(dev.n + "：旧画面は隠れている",
       await pg.evaluate(() => {
         const l = document.getElementById("appInboxList");
         return !l || getComputedStyle(l).display === "none" || !l.offsetParent;
       }));
    ok(dev.n + "：見出しが 通知", (await T(pg, ".head h1")) === "通知", await T(pg, ".head h1"));

    const rows = await N(pg, ".row");
    ok(dev.n + "：通知が並ぶ", rows === 5, String(rows));
    ok(dev.n + "：未読が 2 件出る", (await N(pg, ".row.is-new")) === 2, String(await N(pg, ".row.is-new")));
    ok(dev.n + "：未読の数を文で伝える", (await T(pg, ".head p")).indexOf("2 件") >= 0, await T(pg, ".head p"));

    /* 本体の数え方と突き合わせる（画面で数え直していないこと） */
    const truth = await pg.evaluate(() => {
      const l = window.__vqNotif.list(), s = window.__vqNotif.seenAt();
      return { total: l.length, unread: l.filter((n) => (n.ts || 0) > s).length };
    });
    ok(dev.n + "：一覧は本体のものを使っている", truth.total === rows, JSON.stringify(truth));
    ok(dev.n + "：未読の数も本体と一致する", truth.unread === 2, JSON.stringify(truth));

    ok(dev.n + "：要対応の印が出る", (await T(pg, ".tag--warn")).indexOf("要対応") >= 0, await T(pg, ".tag--warn"));
    ok(dev.n + "：承認済みの印が出る", (await T(pg, ".tag--ok")).indexOf("承認") >= 0, await T(pg, ".tag--ok"));
    ok(dev.n + "：種類ごとに絵が変わる",
       (await pg.evaluate(() => {
         const set = new Set(Array.from(document.getElementById("vqNotif").shadowRoot
           .querySelectorAll(".row .ico svg path")).map((p) => p.getAttribute("d")));
         return set.size;
       })) >= 3);

    const over = await pg.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));
    ok(dev.n + "：横にはみ出さない", over <= 1, over + "px");
    await pg.screenshot({ path: "shots/notif/" + dev.n + "-一覧.png" });

    /* 絞り込み */
    await C(pg, '[data-a="cat"][data-cat="Security"]');
    await pg.waitForTimeout(320);
    ok(dev.n + "：セキュリティだけになる", (await N(pg, ".row")) === 1, String(await N(pg, ".row")));
    await C(pg, '[data-a="cat"][data-cat=""]');
    await pg.waitForTimeout(320);
    await C(pg, '[data-a="unread"]');
    await pg.waitForTimeout(320);
    ok(dev.n + "：未読だけに絞れる", (await N(pg, ".row")) === 2, String(await N(pg, ".row")));
    await C(pg, '[data-a="unread"]');
    await pg.waitForTimeout(320);

    /* フォロー申請の その場での操作 */
    ok(dev.n + "：フォロー申請に 承認 / 断る が出る",
       (await F(pg, '[data-a="fl-ok"]')) && (await F(pg, '[data-a="fl-no"]')));
    ok(dev.n + "：ふつうの通知にはプロフィールへの入口が出る", await F(pg, '[data-a="who"]'));

    /* 押して本文へ。開くと既読になる。 */
    await C(pg, '.row[data-id="n1"]');
    await pg.waitForTimeout(700);
    ok(dev.n + "：押すと本文が開く", await F(pg, ".art"));
    ok(dev.n + "：題が出る", (await T(pg, ".art h1")).length > 0, await T(pg, ".art h1"));
    ok(dev.n + "：日時が出る", /\d+年\d+月\d+日/.test(await T(pg, ".art .when")), await T(pg, ".art .when"));
    ok(dev.n + "：本文が段落で出る", (await N(pg, ".body p")) >= 1);
    ok(dev.n + "：本文は文字として出る（HTML にしない）",
       await pg.evaluate(() => {
         const bx = document.getElementById("vqNotif").shadowRoot.querySelector(".body");
         return bx ? !bx.querySelector("script,iframe,img") : false;
       }));
    /* 開いただけでは既読にしない。
       既読は「ここまで見た」の 1 時刻なので、新しいものを開くと
       その下の古い未読まで巻き添えで消えてしまうため。 */
    ok(dev.n + "：開いただけでは未読を消さない",
       (await pg.evaluate(() => {
         const l = window.__vqNotif.list(), s = window.__vqNotif.seenAt();
         return l.filter((n) => (n.ts || 0) > s).length;
       })) === 2);
    ok(dev.n + "：本文にも未読だと分かる印が出る", (await T(pg, ".art .top")).indexOf("未読") >= 0,
       await T(pg, ".art .top"));
    await pg.screenshot({ path: "shots/notif/" + dev.n + "-本文.png" });

    await C(pg, '[data-a="back"]');
    await pg.waitForTimeout(500);
    ok(dev.n + "：一覧へ戻れる", await F(pg, ".list"));
    ok(dev.n + "：戻っても未読はそのまま", (await N(pg, ".row.is-new")) === 2,
       String(await N(pg, ".row.is-new")));

    /* すべて既読 */
    await C(pg, '[data-a="read-all"]');
    await pg.waitForTimeout(1800);
    ok(dev.n + "：すべて既読にできる",
       (await pg.evaluate(() => {
         const l = window.__vqNotif.list(), s = window.__vqNotif.seenAt();
         return l.filter((n) => (n.ts || 0) > s).length;
       })) === 0);
    ok(dev.n + "：未読の印が消える", (await N(pg, ".row.is-new")) === 0);
    /* 帯は少し遅れて出ることがあるので、出るまで待って測る */
    let toastTxt = "";
    for (let i = 0; i < 12; i++) {
      toastTxt = await pg.evaluate(() => {
        const h = document.getElementById("vqNotifToast");
        const e = h && h.shadowRoot.querySelector(".toast");
        return e ? e.innerText : "";
      });
      if (toastTxt) break;
      await pg.waitForTimeout(250);
    }
    ok(dev.n + "：済んだことを伝える", toastTxt.indexOf("既読") >= 0, toastTxt);
    ok(dev.n + "：ナビの印も消える",
       await pg.evaluate(() => {
         const el = document.querySelector("[data-sidebar-notify-count],[data-notify-dot]");
         return !el || el.classList.contains("hidden");
       }));

    ok(dev.n + "：画面の失敗が出ていない", errs.length === 0, errs.join(" / "));
    await ctx.close();
  }

  /* ── 通知が無いとき ── */
  {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 2 });
    const pg = await ctx.newPage();
    const errs = [];
    pg.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
    await prep(pg, [], 0);
    console.log("\n== 通知が無いとき ==");
    ok("通知なし：画面は出る", await F(pg, ".wrap .head h1"));
    ok("通知なし：まだ無いことを伝える", (await T(pg, ".empty h3")).length > 0, await T(pg, ".empty h3"));
    ok("通知なし：作り話の行を出さない", (await N(pg, ".row")) === 0);
    ok("通知なし：すべて既読のボタンは出さない", !(await F(pg, '[data-a="read-all"]')));
    ok("通知なし：画面の失敗が出ていない", errs.length === 0, errs.join(" / "));
    await pg.screenshot({ path: "shots/notif/通知なし.png" });
    await ctx.close();
  }

  await b.close();
  console.log("\n合格 " + pass + " / 不合格 " + fail);
  process.exit(fail ? 1 : 0);
})();
