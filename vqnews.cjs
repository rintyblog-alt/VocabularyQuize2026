/* NEWS（vq-news）を、ログイン状態で実際に触って確かめる。
   使い方: VQ_TOKEN=... VQ_ADMIN=... node vqnews.cjs                          */
const { chromium } = require("playwright");
const fs = require("node:fs");
fs.mkdirSync("shots/news", { recursive: true });

const BASE = "http://127.0.0.1:8791";
let TOKEN = process.env.VQ_TOKEN || "";
const ADMIN = process.env.VQ_ADMIN || "";

/* 端末ごとに新しい利用者を作る。既読は戻せないので、
   「未読がある状態」から測るにはこれが一番確かめやすい。 */
async function freshAccount(tag) {
  const j = async (u, b) => (await fetch(BASE + u, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b)
  })).json();
  /* ニックネームは重ならないようにする（同じ名前だと 2 人めが作れない） */
  const uniq = tag + String(Date.now()).slice(-7);
  const r1 = await j("/api/auth/register/start", {
    email: "vq" + uniq + "@gmail.com", gradePrefix: "H2",
    nickname: "vq" + uniq, password: "Testpass123!"
  });
  if (!r1.devCode) { console.log("  （登録できませんでした: " + JSON.stringify(r1).slice(0, 160) + "）"); return null; }
  const r2 = await j("/api/auth/register/verify", { challengeId: r1.challengeId, code: r1.devCode });
  const r3 = await j("/api/auth/register/consent", {
    /* 暗証番号（PIN）が要るようになったので、検証用アカウントにも決めておく */
    registrationSession: r2.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: "8306"
  });
  return r3.token || null;
}

let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log("  ok   " + n))
                            : (fail++, console.log("  NG   " + n + (x ? "  → " + x : ""))); };

const F = (pg, s) => pg.evaluate((x) => !!document.getElementById("vqNews").shadowRoot.querySelector(x), s);
const N = (pg, s) => pg.evaluate((x) => document.getElementById("vqNews").shadowRoot.querySelectorAll(x).length, s);
const C = (pg, s) => pg.evaluate((x) => {
  const e = document.getElementById("vqNews").shadowRoot.querySelector(x);
  if (e) e.click(); return !!e;
}, s);
const T = (pg, s) => pg.evaluate((x) => {
  const e = document.getElementById("vqNews").shadowRoot.querySelector(x);
  return e ? (e.innerText || "").replace(/\s+/g, " ").trim() : "";
}, s);
const TYPE = (pg, s, v) => pg.evaluate(([x, val]) => {
  const e = document.getElementById("vqNews").shadowRoot.querySelector(x);
  if (!e) return false;
  e.value = val; e.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}, [s, v]);
/* 管理の編集シート（body 直下の別ホスト） */
const OF = (pg, s) => pg.evaluate((x) => {
  const h = document.getElementById("vqNewsOverlay");
  return !!(h && h.shadowRoot.querySelector(x));
}, s);
const OC = (pg, s) => pg.evaluate((x) => {
  const h = document.getElementById("vqNewsOverlay");
  const e = h && h.shadowRoot.querySelector(x);
  if (e) e.click(); return !!e;
}, s);
const OT = (pg, s) => pg.evaluate((x) => {
  const h = document.getElementById("vqNewsOverlay");
  const e = h && h.shadowRoot.querySelector(x);
  return e ? (e.innerText || "").replace(/\s+/g, " ").trim() : "";
}, s);
const OSET = (pg, s, v) => pg.evaluate(([x, val]) => {
  const h = document.getElementById("vqNewsOverlay");
  const e = h && h.shadowRoot.querySelector(x);
  if (!e) return false;
  e.value = val; e.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}, [s, v]);

async function prep(pg, opts) {
  await pg.goto(BASE + "/?vqdev=1&cb=" + Date.now(), { waitUntil: "domcontentloaded" });
  await pg.evaluate(([t, ak]) => {
    localStorage.setItem("app.auth.token.v1", t);
    if (ak) localStorage.setItem("vq_admin_key", ak);
    else localStorage.removeItem("vq_admin_key");
  }, [TOKEN, (opts && opts.admin) || ""]);
  await pg.reload({ waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(3200);
  await pg.evaluate(() => {
    ["firstLaunchOverlay", "vqbFlow", "vqNewAuth", "authGate", "authBootSplash"].forEach((id) => {
      const e = document.getElementById(id);
      if (e) { e.hidden = true; e.style.setProperty("display", "none", "important"); }
    });
    /* 本体のお知らせダイアログが出ていたら閉じる（画面を隠してしまうので） */
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

    document.body.setAttribute("data-app-tab", "news");
  });
  await pg.waitForTimeout(2600);
  /* あとから出てくる本体のダイアログも閉じる（画面を隠してしまうので） */
  await pg.evaluate(() => {
    document.querySelectorAll('[data-act="dlg-x"],[data-act="dlg-o"]').forEach((x) => x.click());
  });
  await pg.waitForTimeout(400);
}

/* 既読の記録を消して、毎回「未読がある」状態から測る */
async function unread() {
  const r = await fetch(BASE + "/api/news/list", { headers: { authorization: "Bearer " + TOKEN } });
  return (await r.json()).unread || 0;
}

(async () => {
  const b = await chromium.launch({ headless: true });

  for (const dev of [{ n: "PC", w: 1440, h: 950, m: false }, { n: "スマホ", w: 390, h: 844, m: true }]) {
    const ctx = await b.newContext({
      viewport: { width: dev.w, height: dev.h }, deviceScaleFactor: 2, isMobile: dev.m, hasTouch: dev.m
    });
    const t = await freshAccount("news");
    if (!t) { console.log("検証用アカウントを作れませんでした。"); process.exit(1); }
    TOKEN = t;
    const pg = await ctx.newPage();
    const errs = [];
    pg.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
    await prep(pg, {});

    console.log("\n== " + dev.n + "（ふつうの利用者）==");
    ok(dev.n + "：新しい NEWS が出ている", await F(pg, ".wrap .head h1"));
    ok(dev.n + "：旧画面は隠れている",
       await pg.evaluate(() => {
         const p = document.getElementById("appNewsPage");
         const g = document.getElementById("appNewsGrid");
         return !!p && (!g || getComputedStyle(g).display === "none" || !g.offsetParent);
       }));
    ok(dev.n + "：見出しが NEWS", (await T(pg, ".head h1")) === "NEWS", await T(pg, ".head h1"));
    const cards = await N(pg, ".card");
    ok(dev.n + "：お知らせが並ぶ", cards >= 3, String(cards));
    ok(dev.n + "：下書きは出ていない", (await T(pg, ".wrap")).indexOf("下書き") < 0);
    ok(dev.n + "：管理のボタンは出ていない", !(await F(pg, '[data-a="new"]')));
    ok(dev.n + "：直す・消すも出ていない", !(await F(pg, '[data-a="edit"]')));

    ok(dev.n + "：カテゴリで絞れる形がある", (await N(pg, '[data-a="cat"]')) >= 2);
    ok(dev.n + "：重要の印が出る", (await T(pg, ".kind--important")).indexOf("重要") >= 0);
    ok(dev.n + "：未読の印が出る", (await N(pg, ".new")) > 0);

    /* 横にはみ出していないか */
    const over = await pg.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));
    ok(dev.n + "：横にはみ出さない", over <= 1, over + "px");

    await pg.screenshot({ path: "shots/news/" + dev.n + "-一覧.png", fullPage: false });

    /* 絞り込み */
    await C(pg, '[data-a="cat"][data-cat="maintenance"]');
    await pg.waitForTimeout(320);
    /* カテゴリの印だけを見る（重要 / 下書きの印も .kind なので外す） */
    const only = await pg.evaluate(() => Array.from(document.getElementById("vqNews")
      .shadowRoot.querySelectorAll(".card .kind:not(.kind--important):not(.kind--draft)"))
      .map((e) => e.innerText.trim()));
    ok(dev.n + "：メンテナンスだけになる",
       only.length > 0 && only.every((t) => t.indexOf("メンテナンス") >= 0), JSON.stringify(only));
    await C(pg, '[data-a="cat"][data-cat=""]');
    await pg.waitForTimeout(300);
    ok(dev.n + "：すべてに戻せる", (await N(pg, ".card")) === cards);

    /* 探す */
    await TYPE(pg, "[data-q]", "メンテ");
    await pg.waitForTimeout(320);
    const found = await N(pg, ".card");
    ok(dev.n + "：言葉で探せる", found > 0 && found < cards, String(found));
    ok(dev.n + "：探しても打ち込みが消えない",
       (await pg.evaluate(() => document.getElementById("vqNews").shadowRoot
         .querySelector("[data-q]").value)) === "メンテ");
    await TYPE(pg, "[data-q]", "でたらめな言葉xyz");
    await pg.waitForTimeout(320);
    ok(dev.n + "：見つからないときは空の案内", (await T(pg, ".empty h3")).indexOf("見つかりません") >= 0,
       await T(pg, ".empty h3"));
    await TYPE(pg, "[data-q]", "");
    await pg.waitForTimeout(320);

    /* 未読だけ */
    await C(pg, '[data-a="unread"]');
    await pg.waitForTimeout(320);
    ok(dev.n + "：未読だけに絞れる", (await N(pg, ".card")) > 0);
    await C(pg, '[data-a="unread"]');
    await pg.waitForTimeout(320);

    /* 本文へ */
    const before = await unread();
    await C(pg, ".card");
    await pg.waitForTimeout(1800);
    ok(dev.n + "：押すと本文が開く", await F(pg, ".art"));
    ok(dev.n + "：題が出る", (await T(pg, ".art h1")).length > 0, await T(pg, ".art h1"));
    ok(dev.n + "：本文が段落で出る", (await N(pg, ".body p")) >= 1);
    /* ★ 2026-09-03 に 直した。
       もとは「.body に img が 1 つも 無いこと」を 見ていたが、
       2026-09-02 に **本文の 中に 画面の 写真を 置ける**ようにしたので、
       この 見かたでは 正しい 記事が 落ちる。
       本当に 守りたいのは「打ち込んだ ものが HTML として 動かない」こと:
         ・script / iframe は 1 つも 作らない
         ・絵は **自分のところの 道だけ**（外の URL を 読ませない） */
    ok(dev.n + "：本文は文字として出る（HTML にしない）",
       await pg.evaluate(() => {
         const b = document.getElementById("vqNews").shadowRoot.querySelector(".body");
         if (!b) return false;
         if (b.querySelector("script,iframe,object,embed")) return false;
         return Array.from(b.querySelectorAll("img"))
           .every((i) => /^\//.test(i.getAttribute("src") || ""));
       }));
    const link = await pg.evaluate(() => {
      const a = document.getElementById("vqNews").shadowRoot.querySelector(".lnk a");
      return a ? { href: a.getAttribute("href"), rel: a.getAttribute("rel"), tgt: a.getAttribute("target") } : null;
    });
    ok(dev.n + "：外のリンクは別タブ・素性を渡さない",
       !!link && link.tgt === "_blank" && /noopener/.test(link.rel) && /noreferrer/.test(link.rel),
       JSON.stringify(link));
    await pg.screenshot({ path: "shots/news/" + dev.n + "-本文.png" });

    const after = await unread();
    ok(dev.n + "：開くと既読になる", after === before - 1, before + " → " + after);
    ok(dev.n + "：ナビの印も合う",
       await pg.evaluate((n) => {
         const el = document.querySelector("[data-news-badge]");
         if (!el) return false;
         return n > 0 ? el.textContent === String(n) : el.classList.contains("hidden");
       }, after), String(after));

    await C(pg, '[data-a="back"]');
    await pg.waitForTimeout(500);
    ok(dev.n + "：一覧へ戻れる", await F(pg, ".grid"));

    /* すべて既読 */
    await C(pg, '[data-a="read-all"]');
    await pg.waitForTimeout(1800);
    ok(dev.n + "：すべて既読にできる", (await unread()) === 0, String(await unread()));
    ok(dev.n + "：未読の印が消える", (await N(pg, ".new")) === 0);
    ok(dev.n + "：済んだことを伝える", (await OT(pg, ".toast")).indexOf("既読") >= 0, await OT(pg, ".toast"));
    ok(dev.n + "：ナビの印も消える",
       await pg.evaluate(() => {
         const el = document.querySelector("[data-news-badge]");
         return !el || el.classList.contains("hidden");
       }));

    ok(dev.n + "：画面の失敗が出ていない", errs.length === 0, errs.join(" / "));
    await ctx.close();
  }

  /* ── 管理者として ── */
  if (ADMIN) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 2 });
    const pg = await ctx.newPage();
    const errs = [];
    pg.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
    TOKEN = (await freshAccount("adm")) || TOKEN;
    await prep(pg, { admin: ADMIN });

    console.log("\n== 管理者 ==");
    ok("管理：記事を書くボタンが出る", await F(pg, '[data-a="new"]'));
    ok("管理：直す・消すが出る", (await N(pg, '[data-a="edit"]')) > 0);
    ok("管理：下書きも見える", (await T(pg, ".wrap")).indexOf("下書き") >= 0);

    await C(pg, '[data-a="new"]');
    await pg.waitForTimeout(500);
    ok("管理：編集シートが開く", await OF(pg, ".sheet"));
    ok("管理：シートが左パネルより上にある",
       await pg.evaluate(() => {
         const h = document.getElementById("vqNewsOverlay");
         const sh = document.getElementById("vqShell");
         return h && Number(getComputedStyle(h).zIndex) > (sh ? Number(getComputedStyle(sh).zIndex) || 0 : 0);
       }));
    /* 題を入れずに保存 → 止まる */
    await OC(pg, '[data-a="ed-save"]');
    await pg.waitForTimeout(420);
    ok("管理：題が無いと止める", (await OT(pg, ".ed-err")).indexOf("タイトル") >= 0, await OT(pg, ".ed-err"));

    const mark = "検証用のお知らせ " + Date.now();
    await OSET(pg, '[data-e="title"]', mark);
    await OSET(pg, '[data-e="summary"]', "テストで作りました。");
    await OSET(pg, '[data-e="body"]', "一段落め。\n\n二段落め。");
    await OC(pg, '[data-a="ed-cat"][data-cat="incident"]');
    await pg.waitForTimeout(260);
    ok("管理：カテゴリを選ぶと残る",
       await pg.evaluate(() => document.getElementById("vqNewsOverlay").shadowRoot
         .querySelector('[data-a="ed-cat"][data-cat="incident"]').getAttribute("aria-selected") === "true"));
    ok("管理：カテゴリを選んでも題が消えない",
       (await pg.evaluate(() => document.getElementById("vqNewsOverlay").shadowRoot
         .querySelector('[data-e="title"]').value)) === mark);

    await OC(pg, '[data-a="ed-save"]');
    await pg.waitForTimeout(2600);
    ok("管理：保存するとシートが閉じる", !(await OF(pg, ".sheet")));
    ok("管理：一覧に出る", (await T(pg, ".wrap")).indexOf(mark) >= 0);

    /* サーバにも入っているか */
    const listed = await (await fetch(BASE + "/api/news/list")).json();
    const made = (listed.items || []).find((x) => x.title === mark);
    ok("管理：本当に保存されている", !!made, made ? made.id : "");
    ok("管理：選んだカテゴリで入っている", !!made && made.category === "incident", made && made.category);

    /* 直す */
    await pg.evaluate((id) => {
      const e = document.getElementById("vqNews").shadowRoot
        .querySelector('[data-a="edit"][data-id="' + id + '"]');
      if (e) e.click();
    }, made ? made.id : "");
    await pg.waitForTimeout(1600);
    ok("管理：直す画面に前の中身が入っている",
       (await pg.evaluate(() => document.getElementById("vqNewsOverlay").shadowRoot
         .querySelector('[data-e="title"]').value)) === mark);
    ok("管理：本文も取り直して入っている",
       (await pg.evaluate(() => document.getElementById("vqNewsOverlay").shadowRoot
         .querySelector('[data-e="body"]').value)).indexOf("二段落め") >= 0);
    await OSET(pg, '[data-e="title"]', mark + "（直した）");
    await OC(pg, '[data-a="ed-save"]');
    await pg.waitForTimeout(2600);
    const listed2 = await (await fetch(BASE + "/api/news/list")).json();
    ok("管理：直した題で保存される",
       (listed2.items || []).some((x) => x.title === mark + "（直した）"));

    /* 消す */
    let asked = false;
    pg.once("dialog", async (d) => { asked = true; await d.accept(); });
    await pg.evaluate((id) => {
      const e = document.getElementById("vqNews").shadowRoot
        .querySelector('[data-a="del"][data-id="' + id + '"]');
      if (e) e.click();
    }, made ? made.id : "");
    await pg.waitForTimeout(2600);
    ok("管理：消す前に確かめてくる", asked);
    const listed3 = await (await fetch(BASE + "/api/news/list")).json();
    ok("管理：本当に消える", !(listed3.items || []).some((x) => x.id === (made && made.id)));

    await pg.screenshot({ path: "shots/news/管理-一覧.png" });
    ok("管理：画面の失敗が出ていない", errs.length === 0, errs.join(" / "));
    await ctx.close();
  } else {
    console.log("\n（VQ_ADMIN が無いので管理の確認は飛ばしました）");
  }

  await b.close();
  console.log("\n合格 " + pass + " / 不合格 " + fail);
  process.exit(fail ? 1 : 0);
})();
