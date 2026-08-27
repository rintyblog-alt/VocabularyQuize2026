/* プロフィールの編集・リンク・共有を、ログイン状態で実際に触って確かめる。
   使い方: VQ_TOKEN=... node vqpfedit.cjs                                     */
const { chromium } = require("playwright");
const fs = require("node:fs");
fs.mkdirSync("shots/pfedit", { recursive: true });

const BASE = "http://127.0.0.1:8791";
const TOKEN = process.env.VQ_TOKEN || "";
const IMG = process.env.VQ_IMG
  || "/private/tmp/claude-501/-Users-user-Downloads-word-practice-v26-menu-terms-report-emailjs/ea86a79f-1ff2-4347-9303-995fcdd2a12d/scratchpad/big.png";

let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log("  ok   " + n))
                            : (fail++, console.log("  NG   " + n + (x ? "  → " + x : ""))); };

/* Feed 本体の shadow */
const F = (pg, s) => pg.evaluate((x) => !!document.getElementById("vqFeed").shadowRoot.querySelector(x), s);
const C = (pg, s) => pg.evaluate((x) => {
  const e = document.getElementById("vqFeed").shadowRoot.querySelector(x);
  if (e) e.click(); return !!e;
}, s);
const T = (pg, s) => pg.evaluate((x) => {
  const e = document.getElementById("vqFeed").shadowRoot.querySelector(x);
  return e ? (e.innerText || "").replace(/\s+/g, " ").trim() : "";
}, s);
/* かぶせる画面（body 直下の別ホスト） */
const OF = (pg, s) => pg.evaluate((x) => {
  const h = document.getElementById("vqFeedLightbox");
  return !!(h && h.shadowRoot.querySelector(x));
}, s);
const OC = (pg, s) => pg.evaluate((x) => {
  const h = document.getElementById("vqFeedLightbox");
  const e = h && h.shadowRoot.querySelector(x);
  if (e) e.click(); return !!e;
}, s);
const OT = (pg, s) => pg.evaluate((x) => {
  const h = document.getElementById("vqFeedLightbox");
  const e = h && h.shadowRoot.querySelector(x);
  return e ? (e.innerText || "").replace(/\s+/g, " ").trim() : "";
}, s);
const OV = (pg, s) => pg.evaluate((x) => {
  const h = document.getElementById("vqFeedLightbox");
  const e = h && h.shadowRoot.querySelector(x);
  return e ? String(e.value) : null;
}, s);
const OSET = (pg, s, v) => pg.evaluate(([x, val]) => {
  const h = document.getElementById("vqFeedLightbox");
  const e = h && h.shadowRoot.querySelector(x);
  if (!e) return false;
  e.focus(); e.value = val;
  e.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}, [s, v]);
const ON = (pg, s) => pg.evaluate((x) => {
  const h = document.getElementById("vqFeedLightbox");
  return h ? h.shadowRoot.querySelectorAll(x).length : 0;
}, s);

async function prep(pg) {
  await pg.goto(BASE + "/?vqdev=1&cb=" + Date.now(), { waitUntil: "domcontentloaded" });
  await pg.evaluate((t) => localStorage.setItem("app.auth.token.v1", t), TOKEN);
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

    document.body.setAttribute("data-app-tab", "inbox");
  });
  await pg.waitForTimeout(2200);
  /* あとから出てくる本体のダイアログも閉じる（画面を隠してしまうので） */
  await pg.evaluate(() => {
    document.querySelectorAll('[data-act="dlg-x"],[data-act="dlg-o"]').forEach((x) => x.click());
  });
  await pg.waitForTimeout(400);
}

/* 前の実行の跡を消してから始める（「はじめは 0 行」を本当に 0 から測る） */
async function reset() {
  await fetch(BASE + "/api/profile/me", {
    method: "PUT",
    headers: { "content-type": "application/json", authorization: "Bearer " + TOKEN },
    body: JSON.stringify({ bio: "", message: "", links: [], bannerUrl: "", avatarUrl: "" })
  }).catch(() => {});
}


/* 検証用のアカウントをその場で作る（echo モードは確認コードが応答に返る） */
async function freshAccount(tag) {
  const j = async (u, b) => (await fetch(BASE + u, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b)
  })).json();
  /* ニックネームも重ならないようにする（同じ名前だと 2 人めが作れない） */
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

(async () => {
  if (!TOKEN) { console.log("VQ_TOKEN が要ります。"); process.exit(1); }
  const b = await chromium.launch({ headless: true });

  for (const dev of [{ n: "PC", w: 1440, h: 950, m: false }, { n: "スマホ", w: 390, h: 844, m: true }]) {
    const ctx = await b.newContext({
      viewport: { width: dev.w, height: dev.h }, deviceScaleFactor: 2,
      isMobile: dev.m, hasTouch: dev.m, permissions: ["clipboard-read", "clipboard-write"]
    });
    await reset();
    const pg = await ctx.newPage();
    const errs = [];
    pg.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
    await prep(pg);

    console.log("\n== " + dev.n + " ==");
    await pg.evaluate(() => window.__vqOpenProfile(""));
    await pg.waitForTimeout(2400);
    ok(dev.n + "：自分のプロフィールが開く", await F(pg, ".pf-head"));
    ok(dev.n + "：編集ボタンがある", await F(pg, '[data-a="pf-edit"]'));

    /* ── 編集シート ── */
    await C(pg, '[data-a="pf-edit"]');
    await pg.waitForTimeout(500);
    ok(dev.n + "：編集シートが開く", await OF(pg, ".sheet"));
    ok(dev.n + "：見出しが出る", (await OT(pg, ".sh-h h2")) === "プロフィールを編集", await OT(pg, ".sh-h h2"));
    ok(dev.n + "：表紙の写真ボタンがある", await OF(pg, '[data-a="ed-pick"][data-kind="banner"]'));
    ok(dev.n + "：アイコンの写真ボタンがある", await OF(pg, '[data-a="ed-pick"][data-kind="avatar"]'));
    ok(dev.n + "：表示名が入っている", (await OV(pg, '[data-e="name"]') || "").length > 0,
       await OV(pg, '[data-e="name"]'));
    ok(dev.n + "：@ が入っている", (await OV(pg, '[data-e="handle"]') || "").length > 0,
       await OV(pg, '[data-e="handle"]'));
    ok(dev.n + "：自己紹介欄がある", await OF(pg, '[data-e="bio"]'));
    ok(dev.n + "：ひとこと欄がある", await OF(pg, '[data-e="msg"]'));
    ok(dev.n + "：公開範囲が 2 択で出る", (await ON(pg, '[data-a="ed-vis"]')) === 2);
    ok(dev.n + "：フォロー一覧の公開も出る", (await ON(pg, '[data-a="ed-fvis"]')) === 2);

    /* かぶせる画面が左パネルより上か */
    const z = await pg.evaluate(() => {
      const h = document.getElementById("vqFeedLightbox");
      const sh = document.getElementById("vqShell");
      return { lb: h ? Number(getComputedStyle(h).zIndex) : -1,
               shell: sh ? Number(getComputedStyle(sh).zIndex) || 0 : 0 };
    });
    ok(dev.n + "：編集シートが左パネルより上にある", z.lb > z.shell, JSON.stringify(z));

    /* 横にはみ出していないか */
    const wide = await pg.evaluate(() => {
      const h = document.getElementById("vqFeedLightbox");
      const s = h && h.shadowRoot.querySelector(".sheet");
      if (!s) return -1;
      const r = s.getBoundingClientRect();
      return Math.max(0, Math.round(r.right - window.innerWidth)) + Math.max(0, Math.round(-r.left));
    });
    ok(dev.n + "：シートが画面からはみ出さない", wide === 0, "はみ出し " + wide + "px");

    /* ── リンクの足し引き ── */
    ok(dev.n + "：はじめはリンク 0 行", (await ON(pg, "[data-lnk]")) === 0);
    await OC(pg, '[data-a="ed-lnk-add"]');
    await pg.waitForTimeout(200);
    ok(dev.n + "：リンクを 1 行足せる", (await ON(pg, "[data-lnk]")) === 1);
    for (let i = 0; i < 5; i++) { await OC(pg, '[data-a="ed-lnk-add"]'); await pg.waitForTimeout(120); }
    ok(dev.n + "：リンクは 5 行で止まる", (await ON(pg, "[data-lnk]")) === 5,
       String(await ON(pg, "[data-lnk]")));
    ok(dev.n + "：5 行になると足せなくなる",
       await pg.evaluate(() => document.getElementById("vqFeedLightbox")
         .shadowRoot.querySelector('[data-a="ed-lnk-add"]').disabled));
    /* 3 行消す */
    for (let i = 0; i < 3; i++) { await OC(pg, "[data-a='ed-lnk-del']"); await pg.waitForTimeout(140); }
    ok(dev.n + "：リンクを消せる", (await ON(pg, "[data-lnk]")) === 2, String(await ON(pg, "[data-lnk]")));

    /* ── 打った中身が作り直しで消えないか（ここが壊れやすい）── */
    await OSET(pg, '[data-e="bio"]', "英語と日本史をやっています。\n毎日30分。");
    await OSET(pg, '[data-e="msg"]', "共通テストまで残り半年");
    await pg.evaluate(() => {
      const r = document.getElementById("vqFeedLightbox").shadowRoot.querySelectorAll("[data-lnk]");
      const set = (el, v) => { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); };
      set(r[0].querySelector("[data-lnk-l]"), "まとめノート");
      set(r[0].querySelector("[data-lnk-u]"), "https://example.com/notes");
      set(r[1].querySelector("[data-lnk-l]"), "");
      set(r[1].querySelector("[data-lnk-u]"), "https://vocabuquiz.app/");
    });
    await OC(pg, '[data-a="ed-vis"][data-v="public"]');   /* 作り直しを起こす */
    await pg.waitForTimeout(260);
    ok(dev.n + "：作り直しても自己紹介が消えない",
       (await OV(pg, '[data-e="bio"]') || "").indexOf("毎日30分") >= 0, await OV(pg, '[data-e="bio"]'));
    ok(dev.n + "：作り直してもリンクが消えない",
       (await pg.evaluate(() => document.getElementById("vqFeedLightbox").shadowRoot
         .querySelectorAll("[data-lnk-u]")[0].value)) === "https://example.com/notes");

    /* ── 間違ったリンクは送る前に止める ── */
    await pg.evaluate(() => {
      const r = document.getElementById("vqFeedLightbox").shadowRoot.querySelectorAll("[data-lnk]");
      const el = r[1].querySelector("[data-lnk-u]");
      el.value = "example.com"; el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await OC(pg, '[data-a="ed-save"]');
    await pg.waitForTimeout(420);
    ok(dev.n + "：http で始まらないリンクは止める", (await OT(pg, ".ed-err")).indexOf("http") >= 0,
       await OT(pg, ".ed-err"));
    ok(dev.n + "：止めたのでシートは開いたまま", await OF(pg, ".sheet"));
    await pg.evaluate(() => {
      const r = document.getElementById("vqFeedLightbox").shadowRoot.querySelectorAll("[data-lnk]");
      const el = r[1].querySelector("[data-lnk-u]");
      el.value = "https://vocabuquiz.app/"; el.dispatchEvent(new Event("input", { bubbles: true }));
    });

    /* ── 写真をあげる ── */
    const [chooser] = await Promise.all([
      pg.waitForEvent("filechooser"),
      OC(pg, '[data-a="ed-pick"][data-kind="banner"]')
    ]);
    await chooser.setFiles(IMG);
    await pg.waitForTimeout(2600);
    ok(dev.n + "：表紙の写真が入る", await OF(pg, ".ed-cover img"));
    ok(dev.n + "：表紙を外すボタンが出る", await OF(pg, '[data-a="ed-drop"][data-kind="banner"]'));

    const [chooser2] = await Promise.all([
      pg.waitForEvent("filechooser"),
      OC(pg, '[data-a="ed-pick"][data-kind="avatar"]')
    ]);
    await chooser2.setFiles(IMG);
    await pg.waitForTimeout(2600);
    ok(dev.n + "：アイコンの写真が入る", await OF(pg, ".ed-ava img"));

    await pg.screenshot({ path: "shots/pfedit/" + dev.n + "-編集.png" });

    /* ── 保存 ── */
    await OC(pg, '[data-a="ed-save"]');
    await pg.waitForTimeout(1500);
    ok(dev.n + "：保存するとシートが閉じる", !(await OF(pg, ".sheet")));
    ok(dev.n + "：保存できたと伝える帯が出る", (await OT(pg, ".toast")).indexOf("保存") >= 0,
       await OT(pg, ".toast"));
    ok(dev.n + "：プロフィールに自己紹介が出る", (await T(pg, ".pf-bio")).indexOf("毎日30分") >= 0,
       await T(pg, ".pf-bio"));
    ok(dev.n + "：ひとことが出る", (await T(pg, ".pf-msg")).indexOf("残り半年") >= 0, await T(pg, ".pf-msg"));
    ok(dev.n + "：リンクが 2 件出る",
       (await pg.evaluate(() => document.getElementById("vqFeed").shadowRoot
         .querySelectorAll(".pf-link").length)) === 2);
    const la = await pg.evaluate(() => {
      const a = document.getElementById("vqFeed").shadowRoot.querySelector(".pf-link");
      return a ? { href: a.getAttribute("href"), rel: a.getAttribute("rel"), tgt: a.getAttribute("target"),
                   txt: a.innerText.trim() } : null;
    });
    ok(dev.n + "：リンクは別タブ・素性を渡さない",
       !!la && la.tgt === "_blank" && /noopener/.test(la.rel) && /noreferrer/.test(la.rel), JSON.stringify(la));
    ok(dev.n + "：リンクの名前が出る", !!la && la.txt === "まとめノート", la && la.txt);
    ok(dev.n + "：表紙の写真が出る", await F(pg, ".pf-cover img"));
    ok(dev.n + "：アイコンの写真が出る", await F(pg, ".pf-ava img"));

    /* 帯は数秒で消える */
    await pg.waitForTimeout(3000);
    ok(dev.n + "：帯はしばらくで消える", !(await OF(pg, ".toast")));

    await pg.screenshot({ path: "shots/pfedit/" + dev.n + "-プロフィール.png" });

    /* ── 名前を空にした自己紹介リンクはドメインが出る ── */
    ok(dev.n + "：名前を空にすると住所が出る",
       (await pg.evaluate(() => {
         const l = document.getElementById("vqFeed").shadowRoot.querySelectorAll(".pf-link");
         return l[1] ? l[1].innerText.trim() : "";
       })) === "vocabuquiz.app");

    /* ── 共有 ── */
    await C(pg, '[data-a="pf-share"]');
    await pg.waitForTimeout(420);
    ok(dev.n + "：共有シートが開く", await OF(pg, ".shr"));
    const su = await OT(pg, ".shr-u");
    ok(dev.n + "：共有の住所が ?u= になっている", /\?u=\d+$/.test(su), su);
    ok(dev.n + "：コピーの選択肢がある", await OF(pg, '[data-a="sh-copy"]'));
    ok(dev.n + "：メールの選択肢がある", await OF(pg, '[data-a="sh-mail"]'));
    await OC(pg, '[data-a="sh-copy"]');
    await pg.waitForTimeout(600);
    const clip = await pg.evaluate(() => navigator.clipboard.readText().catch(() => ""));
    ok(dev.n + "：押すと本当にコピーされる", /\?u=\d+$/.test(clip), clip);
    ok(dev.n + "：コピーしたと伝える", (await OT(pg, ".toast")).indexOf("コピー") >= 0, await OT(pg, ".toast"));
    await pg.keyboard.press("Escape");
    await pg.waitForTimeout(320);
    ok(dev.n + "：Esc で共有シートが閉じる", !(await OF(pg, ".shr")));

    /* ── 共有された住所で開き直す ── */
    const shared = clip;
    await pg.goto(shared.replace(BASE, BASE) + "&vqdev=1", { waitUntil: "domcontentloaded" });
    await pg.waitForTimeout(3600);
    await pg.evaluate(() => {
      ["firstLaunchOverlay", "vqbFlow", "vqNewAuth", "authGate", "authBootSplash"].forEach((id) => {
        const e = document.getElementById(id);
        if (e) { e.hidden = true; e.style.setProperty("display", "none", "important"); }
      });
      document.body.classList.remove("auth-booting", "auth-gate-open");
      const a = document.getElementById("app"); if (a) a.style.setProperty("display", "block", "important");
      document.body.setAttribute("data-ui-v2", "1");
    });
    await pg.waitForTimeout(2600);
    ok(dev.n + "：共有された住所でプロフィールが開く", await F(pg, ".pf-head"));
    ok(dev.n + "：?u= が住所から消える",
       (await pg.evaluate(() => location.search)).indexOf("u=") < 0,
       await pg.evaluate(() => location.search));

    /* ── やめるときに書きかけを守る ── */
    await pg.evaluate(() => window.__vqOpenProfile(""));
    await pg.waitForTimeout(2200);
    await C(pg, '[data-a="pf-edit"]');
    await pg.waitForTimeout(420);
    await OSET(pg, '[data-e="msg"]', "書きかけの内容");
    let asked = false;
    pg.once("dialog", async (d) => { asked = true; await d.dismiss(); });
    await OC(pg, '[data-a="ed-close"]');
    await pg.waitForTimeout(500);
    ok(dev.n + "：書きかけがあると確かめてくる", asked);
    ok(dev.n + "：断ると閉じない", await OF(pg, ".sheet"));
    let asked2 = false;
    pg.once("dialog", async (d) => { asked2 = true; await d.accept(); });
    await OC(pg, '[data-a="ed-close"]');
    await pg.waitForTimeout(500);
    ok(dev.n + "：良ければ閉じる", asked2 && !(await OF(pg, ".sheet")));

    /* 何も触っていなければ黙って閉じる */
    await C(pg, '[data-a="pf-edit"]');
    await pg.waitForTimeout(420);
    let asked3 = false;
    pg.once("dialog", async (d) => { asked3 = true; await d.accept(); });
    await OC(pg, '[data-a="ed-close"]');
    await pg.waitForTimeout(460);
    ok(dev.n + "：触っていなければ聞かずに閉じる", !asked3 && !(await OF(pg, ".sheet")));

    ok(dev.n + "：画面の失敗が出ていない", errs.length === 0, errs.join(" / "));
    await ctx.close();
  }

  /* ── 触っていない表示名で、待ちを始めてしまわないか ──
     欄には学年＋ニックネームが入っている。そのまま保存したときに
     「変えた」と数えられると、7 日 / 30 日ぶん動けなくなる。 */
  {
    const tok = await freshAccount("cool");
    if (!tok) { fail++; console.log("\n  NG   待ちの確認：検証用アカウントを作れなかった"); }
    else {
      const ctx = await b.newContext({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 2 });
      const pg = await ctx.newPage();
      await pg.goto(BASE + "/?vqdev=1&cb=" + Date.now(), { waitUntil: "domcontentloaded" });
      await pg.evaluate((t) => localStorage.setItem("app.auth.token.v1", t), tok);
      await pg.reload({ waitUntil: "domcontentloaded" });
      await pg.waitForTimeout(3200);
      await pg.evaluate(() => {
        ["firstLaunchOverlay", "vqbFlow", "vqNewAuth", "authGate", "authBootSplash"].forEach((id) => {
          const e = document.getElementById(id);
          if (e) { e.hidden = true; e.style.setProperty("display", "none", "important"); }
        });
        document.body.classList.remove("auth-booting", "auth-gate-open");
        const a = document.getElementById("app"); if (a) a.style.setProperty("display", "block", "important");
        document.body.setAttribute("data-ui-v2", "1");
        document.body.setAttribute("data-app-tab", "inbox");
      });
      await pg.waitForTimeout(2200);
      console.log("\n== 変えていない項目の扱い ==");
      await pg.evaluate(() => window.__vqOpenProfile(""));
      await pg.waitForTimeout(2400);
      await C(pg, '[data-a="pf-edit"]');
      await pg.waitForTimeout(500);
      ok("はじめは表示名の欄が触れる",
         await pg.evaluate(() => !document.getElementById("vqFeedLightbox")
           .shadowRoot.querySelector('[data-e="name"]').disabled));
      /* 自己紹介だけ書いて保存する */
      await OSET(pg, '[data-e="bio"]', "自己紹介だけ変える");
      await OC(pg, '[data-a="ed-save"]');
      await pg.waitForTimeout(1800);
      const after = await (await fetch(BASE + "/api/profile/me",
        { headers: { authorization: "Bearer " + tok } })).json();
      ok("自己紹介は保存されている", (after.profile || {}).bio === "自己紹介だけ変える",
         JSON.stringify((after.profile || {}).bio));
      ok("表示名の待ちが始まっていない", Number((after.profile || {}).nextDisplayNameChangeAt || 0) === 0,
         String((after.profile || {}).nextDisplayNameChangeAt));
      ok("@ の待ちも始まっていない", Number((after.profile || {}).nextHandleChangeAt || 0) === 0,
         String((after.profile || {}).nextHandleChangeAt));
      /* 本当に変えたときは待ちが始まる */
      await C(pg, '[data-a="pf-edit"]');
      await pg.waitForTimeout(500);
      await OSET(pg, '[data-e="name"]', "山田 太郎");
      await OC(pg, '[data-a="ed-save"]');
      await pg.waitForTimeout(1800);
      const after2 = await (await fetch(BASE + "/api/profile/me",
        { headers: { authorization: "Bearer " + tok } })).json();
      ok("変えたときは名前が入れ替わる", (after2.profile || {}).displayName === "山田 太郎",
         (after2.profile || {}).displayName);
      ok("変えたときだけ待ちが始まる", Number((after2.profile || {}).nextDisplayNameChangeAt || 0) > 0);
      await C(pg, '[data-a="pf-edit"]');
      await pg.waitForTimeout(500);
      ok("待ちのあいだは表示名の欄が触れない",
         await pg.evaluate(() => document.getElementById("vqFeedLightbox")
           .shadowRoot.querySelector('[data-e="name"]').disabled));
      ok("いつから変えられるかを伝える",
         /次に変えられるのは/.test(await OT(pg, ".fld .note.warn")), await OT(pg, ".fld .note.warn"));
      await ctx.close();
    }
  }

  await b.close();
  console.log("\n合格 " + pass + " / 不合格 " + fail);
  process.exit(fail ? 1 : 0);
})();
