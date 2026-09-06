#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   vqauthfix.cjs — 設定からの **パスワード変更** と **Google と結ぶ**（2026-09-01）

   訴え:「アプリ設定から、パスワード変更画面が 出て こなく なった。スマホも PC も。
         クリックしたら 消えちゃう。設定画面の モーダルが。
         あとは、Google との 連携画面も 開いて すぐ 消えちゃう 一瞬で」

   直す前に **実際に 再現した**（ログインした 状態で 測った）:
     ・パスワード: 設定が block → none（閉じる）だけ。#authGate は hidden の まま、
       新しい Auth も display:none。**何も 開かない。**
       真因 = 行が data-action="authChangePwSubmitBtn"、つまり **送信ボタン**を
       押していた。開く ボタンでは ない ので、隠れた 画面の 中で 入力の 検査に
       落ちて 終わる。
     ・Google: 行は data-nav="account" ＝ **いま 居る 場所へ 移る だけ**。
       描き直しの ちらつきだけが 起きる。

   使い方: node vqauthfix.cjs      （要 dev サーバ 127.0.0.1:8791）
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const { chromium } = require("playwright");
let ok = 0, ng = 0; const 落 = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (c, t, d) => { if (c) { ok++; console.log("  ok   " + t + (d !== undefined ? "  → " + JSON.stringify(d).slice(0, 220) : "")); }
  else { ng++; 落.push(t); console.log("  NG   " + t + (d !== undefined ? "  → " + JSON.stringify(d).slice(0, 320) : "")); } };
const 待 = (m) => new Promise(s => setTimeout(s, m));
const J = (p, b, h) => fetch(BASE + p, { method: "POST", headers: Object.assign({ "content-type": "application/json" }, h || {}), body: JSON.stringify(b) }).then(r => r.json());

(async () => {
  /* ── 使い捨ての アカウントを 作る ─────────────────────────── */
  const 印 = Date.now().toString(36).slice(-6);
  const ID = "pwfix" + 印, PW0 = "Oldpass" + 印, PW1 = "Newpass" + 印;
  const st = await J("/api/auth/register/start", { email: "pwfix" + 印 + "@gmail.com",
    gradePrefix: "H1", nickname: ID, password: PW0, password2: PW0 });
  if (!st.ok) { console.error("作れませんでした:", st); process.exit(1); }
  const vf = await J("/api/auth/register/verify", { challengeId: st.challengeId, code: st.devCode });
  const cs = await J("/api/auth/register/consent", { registrationSession: vf.registrationSession,
    agreeTerms: true, agreePrivacy: true, pin: "471902" });
  if (!cs.ok) { console.error("作れませんでした:", cs); process.exit(1); }
  const li = await J("/api/auth/login", { nickname: ID, password: PW0, gradePrefix: "H1" });
  const TOK = li.token;
  console.log("検査用アカウント:", ID);

  const b = await chromium.launch();
  const 例外 = [];

  async function 場(幅, 高, 携) {
    const ctx = await b.newContext({ viewport: { width: 幅, height: 高 }, isMobile: 携, hasTouch: 携 });
    await ctx.addInitScript(t => { try {
      localStorage.setItem("app.auth.token.v1", t);
      localStorage.setItem("app.auth.mode.v1", "user");
      localStorage.setItem("app.auth.expiresAt.v1", String(Date.now() + 30 * 86400000));
      localStorage.setItem("app.firstLaunchDone.v1", "1");
      localStorage.setItem("vq.install.hide.v1", "1");     /* 入れかたの 案内は 邪魔なので 出さない */
      localStorage.setItem("vq.newauth.introSeen.v1", "1");
    } catch (e) {} }, TOK);
    const pg = await ctx.newPage();
    pg.on("pageerror", e => 例外.push(String(e).slice(0, 140)));
    await pg.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
    await pg.waitForFunction(() => !!window.__vqOpenSettings, null, { timeout: 25000 });
    await 待(7000);
    return { ctx, pg };
  }
  async function アカウントへ(pg) {
    await pg.evaluate(() => window.__vqOpenSettings());
    await 待(1400);
    await pg.evaluate(() => document.getElementById("vqSettings").shadowRoot
      .querySelector('[data-nav="account"]').click());
    await 待(1400);
  }
  const 様子 = (pg) => pg.evaluate(() => {
    const h = document.getElementById("vqSettings");
    const na = document.getElementById("vqNewAuth")
      || Array.prototype.find.call(document.querySelectorAll("*"),
        n => n.shadowRoot && n.shadowRoot.querySelector(".qz-auth,[data-form]"));
    const sr = na && na.shadowRoot;
    return { 設定: h ? getComputedStyle(h).display : "無",
             認証: na ? getComputedStyle(na).display : "無",
             題: sr ? (sr.querySelector("h1,h2,.vq-auth__title,[class*=title]") || {}).textContent : "",
             形: sr ? Array.from(sr.querySelectorAll("form[data-form]")).map(f => f.getAttribute("data-form")) : [],
             欄: sr ? Array.from(sr.querySelectorAll("input")).map(i => i.id).filter(Boolean) : [] };
  });

  /* ── ① PC: パスワードを変える ─────────────────────────── */
  節("① PC（1280）— パスワードを変える");
  let { ctx, pg } = await 場(1280, 900, false);
  await アカウントへ(pg);

  const 行 = await pg.evaluate(() => {
    const sr = document.getElementById("vqSettings").shadowRoot;
    const r = Array.from(sr.querySelectorAll("button.row")).find(x => /パスワードを変える/.test(x.textContent));
    return r ? { 属: Array.from(r.attributes).map(a => a.name), 旧: r.getAttribute("data-action") } : null;
  });
  見(行 && 行.属.indexOf("data-pwchange") >= 0, "行が 変更画面を 開く ものに なって いる", 行);
  見(行 && !行.旧, "★ **送信ボタンを 押す 作りでは ない**", 行 && 行.旧);

  const 前 = await 様子(pg);
  見(前.設定 === "block" && 前.認証 === "none", "（前提）設定が 開いて いて 認証は 閉じて いる", 前);

  await pg.evaluate(() => {
    const sr = document.getElementById("vqSettings").shadowRoot;
    Array.from(sr.querySelectorAll("button.row")).find(x => /パスワードを変える/.test(x.textContent)).click();
  });
  await 待(2000);
  const 後 = await 様子(pg);
  見(後.認証 !== "none" && 後.認証 !== "無", "★★ **パスワードの 画面が 出る**（設定が 消えて 終わらない）", 後);
  見(後.形.indexOf("cp") >= 0, "★★ **パスワード変更の 入力欄が ある**", 後.形);
  見(/パスワードを変える/.test(後.題 || ""), "★ 見出しが「パスワードを変える」", 後.題);
  見(後.欄.indexOf("vqnaCpOld") >= 0 && 後.欄.indexOf("vqnaCpNew") >= 0
     && 後.欄.indexOf("vqnaCpNew2") >= 0, "★ 3 つの 欄（いま／新しい／確認）", 後.欄);

  節("② 入力の 見張り");
  const 押せるか = (pg2) => pg2.evaluate(() => {
    const na = document.getElementById("vqNewAuth")
      || Array.prototype.find.call(document.querySelectorAll("*"), n => n.shadowRoot && n.shadowRoot.querySelector('form[data-form="cp"]'));
    const f = na.shadowRoot.querySelector('form[data-form="cp"]');
    return !f.querySelector('button[type="submit"]').disabled;
  });
  const 打つ = async (o, n, n2) => {
    await pg.evaluate((v) => {
      const na = document.getElementById("vqNewAuth")
        || Array.prototype.find.call(document.querySelectorAll("*"), x => x.shadowRoot && x.shadowRoot.querySelector('form[data-form="cp"]'));
      const sr = na.shadowRoot;
      const set = (id, val) => { const e = sr.querySelector("#" + id); if (e) { e.value = val;
        e.dispatchEvent(new Event("input", { bubbles: true, composed: true })); } };
      set("vqnaCpOld", v[0]); set("vqnaCpNew", v[1]); set("vqnaCpNew2", v[2]);
    }, [o, n, n2]);
    await 待(300);
  };
  await 打つ("", "", "");
  見(!(await 押せるか(pg)), "空では 押せない");
  await 打つ(PW0, "short", "short");
  見(!(await 押せるか(pg)), "★ 8 文字 未満は 押せない");
  await 打つ(PW0, PW1, PW1 + "x");
  見(!(await 押せるか(pg)), "★ 確認が 合わないと 押せない");
  await 打つ(PW0, PW0, PW0);
  見(!(await 押せるか(pg)), "★★ **いまと 同じ パスワードは 押せない**");
  await 打つ(PW0, PW1, PW1);
  見(await 押せるか(pg), "★ そろうと 押せる");

  節("②-b 空の うちは 赤い 注意を 出さない");
  /* 直す前: hidden 属性だけで 隠して いたが .vq-field__error の display に 負け、
     **1 字も 打って いないのに 赤い 注意が 2 つ**出て いた（実機の 絵で 見つけた）。 */
  await 打つ("", "", "");
  const 赤 = await pg.evaluate(() => {
    const na = document.getElementById("vqNewAuth")
      || Array.prototype.find.call(document.querySelectorAll("*"), x => x.shadowRoot && x.shadowRoot.querySelector('form[data-form="cp"]'));
    const sr = na.shadowRoot;
    const 見 = (q) => { const e = sr.querySelector(q); return e ? getComputedStyle(e).display !== "none" : null; };
    return { 同じ: 見("[data-cp-same]"), 不一致: 見("[data-cp-diff]"), 目安: 見("[data-cp-hint]") };
  });
  見(赤.同じ === false && 赤.不一致 === false, "★★ **空の うちは 赤い 注意を 出さない**", 赤);
  見(赤.目安 === true, "★ 「8文字以上」の 目安は 出す", 赤.目安);
  await 打つ(PW0, PW1, PW1 + "x");
  const 赤2 = await pg.evaluate(() => {
    const na = document.getElementById("vqNewAuth")
      || Array.prototype.find.call(document.querySelectorAll("*"), x => x.shadowRoot && x.shadowRoot.querySelector('form[data-form="cp"]'));
    const e = na.shadowRoot.querySelector("[data-cp-diff]");
    return e ? getComputedStyle(e).display !== "none" : null;
  });
  見(赤2 === true, "★ 合わない ときは ちゃんと 出す", 赤2);
  await 打つ(PW0, PW1, PW1);

  節("③ 本当に 変わるか");
  await pg.evaluate(() => {
    const na = document.getElementById("vqNewAuth")
      || Array.prototype.find.call(document.querySelectorAll("*"), x => x.shadowRoot && x.shadowRoot.querySelector('form[data-form="cp"]'));
    na.shadowRoot.querySelector('form[data-form="cp"] button[type="submit"]').click();
  });
  await 待(3000);
  const 済 = await pg.evaluate(() => {
    const na = document.getElementById("vqNewAuth")
      || Array.prototype.find.call(document.querySelectorAll("*"), x => x.shadowRoot && x.shadowRoot.querySelector(".qz-auth"));
    const sr = na.shadowRoot;
    return { 文: Array.from(sr.querySelectorAll("h1,h2,h3,[class*=title]"))
               .map(x => x.textContent).join(" ").slice(0, 90),
             まだ入力: !!sr.querySelector('form[data-form="cp"]') };
  });
  見(!済.まだ入力 && /変えました/.test(済.文), "★★ **変えましたと 出る**", 済.文.slice(0, 40));

  const 旧で = await J("/api/auth/login", { nickname: ID, password: PW0, gradePrefix: "H1" });
  const 新で = await J("/api/auth/login", { nickname: ID, password: PW1, gradePrefix: "H1" });
  見(!旧で.token, "★★ **古い パスワードでは 入れない**", 旧で.code);
  見(!!新で.token, "★★ **新しい パスワードで 入れる**（絵だけの 画面では ない）", !!新で.token);

  節("④ Google と 結ぶ");
  await pg.evaluate(() => {
    const na = document.getElementById("vqNewAuth")
      || Array.prototype.find.call(document.querySelectorAll("*"), x => x.shadowRoot && x.shadowRoot.querySelector(".qz-auth"));
    const b2 = Array.from(na.shadowRoot.querySelectorAll("[data-act='cp-close']"))[0];
    if (b2) b2.click();
  });
  await 待(1200);
  await アカウントへ(pg);
  const g行 = await pg.evaluate(() => {
    const sr = document.getElementById("vqSettings").shadowRoot;
    const r = Array.from(sr.querySelectorAll("button.row")).find(x => /Google と結ぶ/.test(x.textContent));
    return r ? { 属: Array.from(r.attributes).map(a => a.name + "=" + a.value),
                 札: (r.querySelector(".btn") || {}).textContent } : null;
  });
  見(g行 && g行.属.some(a => /^data-sociallink=/.test(a)),
    "★★ **Google の 行が 結ぶ 画面へ 向く**（いま 居る 場所へ 移る だけでは ない）", g行);
  見(g行 && g行.札 === "結ぶ", "★ 札が「結ぶ」（—では ない）", g行 && g行.札);

  await pg.evaluate(() => {
    const sr = document.getElementById("vqSettings").shadowRoot;
    Array.from(sr.querySelectorAll("button.row")).find(x => /Google と結ぶ/.test(x.textContent)).click();
  });
  await 待(2200);
  const g後 = await pg.evaluate(() => {
    const h = document.getElementById("vqSettings");
    const na = document.getElementById("vqNewAuth")
      || Array.prototype.find.call(document.querySelectorAll("*"), n => n.shadowRoot && n.shadowRoot.querySelector(".qz-auth"));
    const sr = na && na.shadowRoot;
    return { 設定: h ? getComputedStyle(h).display : "無",
             認証: na ? getComputedStyle(na).display : "無",
             文: sr ? Array.from(sr.querySelectorAll("h1,h2,h3,.vq-auth__title,[class*=title]"))
                   .map(x => x.textContent).join(" / ").slice(0, 110) : "",
             釦: sr ? Array.from(sr.querySelectorAll("[data-act]")).map(x => x.getAttribute("data-act")) : [] };
  });
  見(g後.認証 !== "none" && g後.認証 !== "無", "★★ **Google の 画面が 出たまま 残る**（一瞬で 消えない）", g後.認証);
  見(/Google と結ぶ/.test(g後.文), "★ 見出しが「Google と結ぶ」", g後.文.slice(0, 40));
  見(g後.釦.indexOf("sl-go") >= 0 && g後.釦.indexOf("sl-close") >= 0,
    "★ 「選ぶ」と「やめる」が ある", g後.釦);

  await 待(2500);
  const g維持 = await pg.evaluate(() => {
    const na = document.getElementById("vqNewAuth")
      || Array.prototype.find.call(document.querySelectorAll("*"), n => n.shadowRoot && n.shadowRoot.querySelector(".qz-auth"));
    return na ? getComputedStyle(na).display : "無";
  });
  見(g維持 !== "none", "★★ **数秒 経っても 消えない**", g維持);
  await ctx.close();

  /* ── ⑤ スマホでも 同じ ─────────────────────────────── */
  節("⑤ スマホ（390）でも 同じ");
  ({ ctx, pg } = await 場(390, 844, true));
  await アカウントへ(pg);
  await pg.evaluate(() => {
    const sr = document.getElementById("vqSettings").shadowRoot;
    Array.from(sr.querySelectorAll("button.row")).find(x => /パスワードを変える/.test(x.textContent)).click();
  });
  await 待(2200);
  const m = await 様子(pg);
  見(m.形.indexOf("cp") >= 0, "★★ **スマホでも パスワードの 画面が 出る**", m.形);
  const mはみ = await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  見(mはみ <= 0, "★ 横に はみ出さない", mはみ);
  await ctx.close();

  見(例外.length === 0, "例外 0 件", 例外.slice(0, 3));
  await b.close();
  console.log("\n" + "─".repeat(32) + "\n  ok " + ok + " / NG " + ng);
  if (ng) { console.log("  落ちた: " + 落.join(" / ")); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
