"use strict";
/* 「アプリとして 入れる」案内の 検査（2026-09-01）
   走らせかた:  node vqinstall.cjs            （実ブラウザ・要 dev サーバ）
   直す前の 版で 落ちる ことを 確かめて ある。 */
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
let ok = 0, ng = 0; const 落 = [];
function 見(c, t, d) { if (c) { ok++; console.log("  ok   " + t + (d !== undefined ? "  → " + JSON.stringify(d) : "")); }
  else { ng++; 落.push(t); console.log("  NG   " + t + (d !== undefined ? "  → " + JSON.stringify(d) : "")); } }
function 節(t) { console.log("\n══ " + t + " ══"); }
const 待 = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const { chromium } = require("playwright");
  const b = await chromium.launch();

  /* ── ① 開いたら 勝手に 出る ───────────────────────────── */
  節("① 開いたら いちばん 最初に 出る");
  let ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  let pg = await ctx.newPage();
  const 例外 = []; pg.on("pageerror", e => 例外.push(String(e).slice(0, 140)));
  await pg.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => !!window.__vqInstall, null, { timeout: 20000 });
  見(true, "読み込まれる");

  /* ★ **ログインする 前から 出す**（追いの 訴え）。
     入って いない 人にも 案内する。重なり順が 認証画面より 上か も 見る。 */
  await 待(4000);
  const 前 = await pg.evaluate(() => {
    const h = document.getElementById("vqInstall");
    const 認 = document.getElementById("vqNewAuth")
      || Array.prototype.find.call(document.querySelectorAll("*"),
        n => n.shadowRoot && n.shadowRoot.querySelector(".vqna-auth, [data-vqna]"));
    const z = (el) => el ? parseInt(getComputedStyle(el).zIndex || "0", 10) : 0;
    return { 未ログイン: document.body.classList.contains("auth-gate-open"),
             開: h && h.getAttribute("data-open"),
             案内z: z(h), 認証z: 認 ? z(認) : null };
  });
  見(前.未ログイン, "（前提）ログインして いない 状態", 前.未ログイン);
  見(前.開 === "1", "★★ **ログインする 前から 出る**", 前);
  見(前.認証z === null || 前.案内z > 前.認証z,
    "★★ **ログイン画面より 上に 出る**（下に 隠れない）", { 案内: 前.案内z, 認証: 前.認証z });
  const 出た = await pg.evaluate(() => {
    const h = document.getElementById("vqInstall");
    return { 有: !!h, 開: h && h.getAttribute("data-open") === "1",
             状: window.__vqInstall.状態() };
  });
  見(出た.有 && 出た.開, "★★ 何も しなくても 出る", 出た.状);
  見(出た.状.面 === "pc", "PC では Chrome の 案内から", 出た.状.面);

  const 見出し = await pg.evaluate(() => {
    const sr = document.getElementById("vqInstall").shadowRoot;
    return { h1: sr.querySelector(".h1").textContent,
             h2: sr.querySelector(".h2").textContent.slice(0, 30) };
  });
  見(/アプリ/.test(見出し.h1) && /便利/.test(見出し.h1), "★ 見出しが「アプリとして 入れると 便利です！」", 見出し.h1);

  /* ── ② Chrome の 再現 ─────────────────────────────── */
  節("② Chrome の 見た目を 忠実に");
  const cr = await pg.evaluate(() => {
    const sr = document.getElementById("vqInstall").shadowRoot;
    const c = sr.querySelector("[data-cr]");
    if (!c) return null;
    const url = c.querySelector(".cr-url");
    const 右 = Array.from(c.querySelectorAll(".cr-right .cr-ic"));
    const 印 = c.querySelector("[data-install]");
    const ir = 印.getBoundingClientRect(), ur = url.getBoundingClientRect();
    return { タブ: !!c.querySelector(".cr-tab"),
             url: url.textContent.trim(),
             鍵: !!url.querySelector("svg"),
             右の数: 右.length,
             入れる印が右: ir.left > ur.right,
             矢印: !!sr.querySelector("[data-cur] svg"),
             丸: sr.querySelector("[data-ring]").className.baseVal || sr.querySelector("[data-ring]").getAttribute("class") };
  });
  見(cr && cr.タブ, "タブバーが ある");
  見(cr && cr.url === "www.vocabuquiz.app", "★ アドレスが 本物と 同じ", cr && cr.url);
  見(cr && cr.鍵, "鍵アイコンが ある");
  見(cr && cr.入れる印が右, "★★ **入れる 印が アドレスバーの 右**（本物と 同じ 位置）");
  見(cr && cr.右の数 === 4, "右の 並びは 4 つ（入れる/星/拡張/⋮）", cr && cr.右の数);
  見(cr && cr.矢印, "★ マウスの 矢印が 描かれて いる");
  const 矢 = await pg.evaluate(() => document.getElementById("vqInstall")
    .shadowRoot.querySelector("[data-cur]").classList.contains("finger"));
  見(矢 === false, "★ PC は **矢印**（指では ない）", 矢);

  await 待(1800);
  const 丸1 = await pg.evaluate(() => {
    const sr = document.getElementById("vqInstall").shadowRoot;
    const c = sr.querySelector("[data-cr]"), r = sr.querySelector("[data-ring]");
    const 印 = c.querySelector("[data-install]"), cur = sr.querySelector("[data-cur]");
    const rr = r.getBoundingClientRect(), ir = 印.getBoundingClientRect(), ur = cur.getBoundingClientRect();
    return { 光: r.classList.contains("on"),
             丸のずれ: Math.round(Math.hypot(rr.left + rr.width/2 - (ir.left + ir.width/2),
                                             rr.top + rr.height/2 - (ir.top + ir.height/2))),
             矢のずれ: Math.round(Math.hypot(ur.left + 3 - (ir.left + ir.width/2),
                                             ur.top + 3 - (ir.top + ir.height/2))) };
  });
  見(丸1.光, "★ 赤い 丸が 印に 出る");
  見(丸1.丸のずれ <= 3, "★★ **丸が 入れる 印の 真上**", 丸1.丸のずれ);
  見(丸1.矢のずれ <= 4, "★★ **矢印が 印まで 動く**", 丸1.矢のずれ);

  /* ── ③ 次へ で 窓が 出る ──────────────────────────── */
  節("③ 次へ／前へ");
  await pg.evaluate(() => document.getElementById("vqInstall").shadowRoot
    .querySelector("[data-a='next']").click());
  await 待(2300);
  const 窓 = await pg.evaluate(() => {
    const sr = document.getElementById("vqInstall").shadowRoot;
    const d = sr.querySelector("[data-dlg]");
    return { 出た: d.classList.contains("on"), 題: d.querySelector("h4").textContent,
             名: d.querySelector(".cr-dlg-t").textContent,
             u: d.querySelector(".cr-dlg-u").textContent,
             釦: Array.from(d.querySelectorAll(".cr-btn")).map(x => x.textContent),
             段: window.__vqInstall.状態().段,
             点: sr.querySelectorAll(".dot.on").length };
  });
  見(窓.出た, "★★ **「アプリのインストール」の 窓が 出る**");
  見(窓.題 === "アプリのインストール", "★ 題が 本物と 同じ", 窓.題);
  見(窓.名 === "VocabuQuiz" && 窓.u === "www.vocabuquiz.app", "名前と アドレスが 入る", [窓.名, 窓.u]);
  見(窓.釦.join("/") === "キャンセル/インストール", "★ ボタンが 本物と 同じ 2 つ", 窓.釦);
  見(窓.段 === 1 && 窓.点 === 1, "段が 1 つ 進む");

  await pg.evaluate(() => document.getElementById("vqInstall").shadowRoot
    .querySelector("[data-a='prev']").click());
  await 待(400);
  見(await pg.evaluate(() => window.__vqInstall.状態().段) === 0, "★ 前へ で 戻る");

  const 止 = await pg.evaluate(() => {
    const sr = document.getElementById("vqInstall").shadowRoot;
    return sr.querySelector("[data-a='prev']").disabled;
  });
  見(止, "いちばん 前では「前へ」が 押せない");

  /* 3 段目 */
  await pg.evaluate(() => { const sr = document.getElementById("vqInstall").shadowRoot;
    sr.querySelector("[data-a='next']").click(); });
  await 待(300);
  await pg.evaluate(() => { const sr = document.getElementById("vqInstall").shadowRoot;
    sr.querySelector("[data-a='next']").click(); });
  await 待(1800);
  const 三 = await pg.evaluate(() => {
    const sr = document.getElementById("vqInstall").shadowRoot;
    const ok2 = sr.querySelector("[data-dlgok]"), r = sr.querySelector("[data-ring]");
    const rr = r.getBoundingClientRect(), br = ok2.getBoundingClientRect();
    return { ずれ: Math.round(Math.hypot(rr.left + rr.width/2 - (br.left + br.width/2),
                                         rr.top + rr.height/2 - (br.top + br.height/2))),
             最後: !sr.querySelector("[data-a='next']"),
             文: sr.querySelector(".step-t").textContent };
  });
  見(三.ずれ <= 4, "★★ **3 段目は「インストール」ボタンを 指す**", 三.ずれ);
  見(三.最後, "★ 最後の 段では「次へ」が 消える");
  見(/インストール/.test(三.文), "説明が「インストール を 押す」", 三.文.slice(0, 24));

  /* ── ④ Safari（スマホ）の 再現 ────────────────────── */
  節("④ Safari の 見た目を 忠実に");
  await pg.evaluate(() => document.getElementById("vqInstall").shadowRoot
    .querySelector("[data-a='面'][data-v='ph']").click());
  await 待(1600);
  const sf = await pg.evaluate(() => {
    const sr = document.getElementById("vqInstall").shadowRoot;
    const ph = sr.querySelector("[data-ph]");
    if (!ph) return null;
    const t = Array.from(ph.querySelectorAll(".ph-tools .ph-t"));
    const 共 = ph.querySelector("[data-share]");
    const r = sr.querySelector("[data-ring]").getBoundingClientRect();
    const sr2 = 共.getBoundingClientRect();
    return { 道具の数: t.length, 共有の位置: t.indexOf(共),
             アドレス: ph.querySelector(".ph-adr span:nth-child(2)").textContent,
             ぁあ: !!ph.querySelector(".ph-adr .aA"),
             下にある: ph.querySelector(".ph-bar").getBoundingClientRect().top
                      > ph.querySelector(".ph-body").getBoundingClientRect().top,
             丸のずれ: Math.round(Math.hypot(r.left + r.width/2 - (sr2.left + sr2.width/2),
                                             r.top + r.height/2 - (sr2.top + sr2.height/2))),
             段数: window.__vqInstall.状態().段数 };
  });
  見(sf && sf.道具の数 === 5, "★ 下の 帯は 5 つ（戻る/進む/共有/ブック/タブ）", sf && sf.道具の数);
  見(sf && sf.共有の位置 === 2, "★★ **共有は 真ん中**（本物の Safari と 同じ）", sf && sf.共有の位置);
  見(sf && sf.アドレス === "vocabuquiz.app", "アドレスが 入る", sf && sf.アドレス);
  見(sf && sf.ぁあ, "★ 左の「ぁあ」も 再現", sf && sf.ぁあ);
  見(sf && sf.下にある, "★ アドレスバーが **下**（iOS 15 以降の 既定）");
  見(sf && sf.丸のずれ <= 4, "★★ **指が 共有ボタンを 指す**", sf && sf.丸のずれ);
  見(sf && sf.段数 === 4, "スマホは 4 段", sf && sf.段数);

  const iOS26 = await pg.evaluate(() => document.getElementById("vqInstall")
    .shadowRoot.querySelector(".hint").textContent);
  見(/iOS 26/.test(iOS26) && /⋯/.test(iOS26), "★★ **iOS 26 で 場所が 変わった ことも 書く**", iOS26.slice(0, 46));

  節("④-b 時計は 本物・動かすのは 指");
  /* 訴え（2026-09-01）「時計あるじゃん？ これはさ、**リアルタイムにして**」
     「スマホの アニメーションは、マウスじゃ なくて、**指**の 方が いいかも」 */
  const 時 = await pg.evaluate(() => {
    const sr = document.getElementById("vqInstall").shadowRoot;
    const e = sr.querySelector("[data-clock]");
    const d = new Date();
    return { 出: e && e.textContent.trim(),
             いま: d.getHours() + ":" + ("0" + d.getMinutes()).slice(-2),
             時: d.getHours(), 分: d.getMinutes(),
             指: sr.querySelector("[data-cur]").classList.contains("finger"),
             電波: sr.querySelectorAll(".ph-sig svg").length };
  });
  /* 12 時制でも 24 時制でも 通る ように 分で 見る（頭の 0 は 落とす 決まり）。 */
  const 分あう = 時.出 && 時.出.indexOf(":" + ("0" + 時.分).slice(-2)) >= 0;
  const 時あう = 時.出 && (new RegExp("(^|\\s)" + (時.時 % 12 || 12) + ":").test(時.出)
    || new RegExp("(^|\\s)" + 時.時 + ":").test(時.出));
  見(時.出 !== "9:41", "★★ **9:41 の まま では ない**（作りものの 時刻を 出さない）", 時.出);
  見(分あう && 時あう, "★★ **時計が いまの 時刻**", { 出: 時.出, いま: 時.いま });
  見(時.指 === true, "★★ **スマホは 指**（マウスの 矢印では ない）", 時.指);
  見(時.電波 === 3, "★ 電波・Wi-Fi・電池を 描いて いる（絵文字では ない）", 時.電波);

  /* 動くか（10 秒 ごとに 書き替える。時計を 進めて 確かめる） */
  const 前時 = 時.出;
  await pg.evaluate(() => {
    const D = Date; const t0 = D.now();
    // eslint-disable-next-line no-global-assign
    window.Date = class extends D {
      constructor(...a) { if (a.length) { super(...a); return; } super(t0 + 3600000); }
      static now() { return t0 + 3600000; }
    };
  });
  await 待(11000);
  const 後時 = await pg.evaluate(() => document.getElementById("vqInstall")
    .shadowRoot.querySelector("[data-clock]").textContent.trim());
  見(後時 !== 前時, "★★ **時が 経つと 書き替わる**（止まった 時計に しない）", { 前: 前時, 後: 後時 });

  節("⑤ 共有シートと「ホーム画面に追加」");
  await pg.evaluate(() => document.getElementById("vqInstall").shadowRoot
    .querySelector("[data-a='next']").click());
  await 待(2000);
  const sh = await pg.evaluate(() => {
    const sr = document.getElementById("vqInstall").shadowRoot;
    const s = sr.querySelector("[data-sh]");
    const 行 = Array.from(s.querySelectorAll(".sh-r span")).map(x => x.textContent);
    const 的 = s.querySelector("[data-addrow]");
    const r = sr.querySelector("[data-ring]").getBoundingClientRect();
    const tr = 的.getBoundingClientRect();
    return { 出た: s.classList.contains("on"), 行,
             光: 的.classList.contains("hit"),
             ずれ: Math.round(Math.hypot(r.left + r.width/2 - (tr.left + tr.width/2),
                                         r.top + r.height/2 - (tr.top + tr.height/2))),
             上: s.querySelector(".sh-hd b").textContent };
  });
  見(sh.出た, "★★ **共有シートが せり上がる**");
  見(sh.行[0] === "コピー", "① コピー", sh.行[0]);
  見(sh.行[1] === "リーディングリストに追加", "② リーディングリストに追加", sh.行[1]);
  見(sh.行[2] === "ブックマークを追加", "③ ブックマークを追加", sh.行[2]);
  見(sh.行[5] === "ホーム画面に追加", "★★ **⑥ ホーム画面に追加**（本物の 並び順）", sh.行[5]);
  見(sh.上 === "VocabuQuiz", "上に サイト名が 出る", sh.上);
  見(sh.ずれ <= 4, "★★ **指が「ホーム画面に追加」を 指す**", sh.ずれ);

  await pg.evaluate(() => document.getElementById("vqInstall").shadowRoot
    .querySelector("[data-a='next']").click());
  await 待(1700);
  const ad = await pg.evaluate(() => {
    const sr = document.getElementById("vqInstall").shadowRoot;
    const a = sr.querySelector("[data-add]");
    const r = sr.querySelector("[data-ring]").getBoundingClientRect();
    const ok2 = a.querySelector("[data-addok]").getBoundingClientRect();
    return { 出た: a.classList.contains("on"),
             題: a.querySelector(".add-hd b").textContent,
             左: a.querySelector(".add-hd span").textContent,
             右: a.querySelector("[data-addok]").textContent,
             名: a.querySelector(".add-nm b").textContent,
             u: a.querySelector(".add-nm i").textContent,
             ずれ: Math.round(Math.hypot(r.left + r.width/2 - (ok2.left + ok2.width/2),
                                         r.top + r.height/2 - (ok2.top + ok2.height/2))) };
  });
  見(ad.出た, "★★ **「ホーム画面に追加」の 板が 出る**");
  見(ad.題 === "ホーム画面に追加", "題が 本物と 同じ", ad.題);
  見(ad.左 === "キャンセル" && ad.右 === "追加", "★ 左が キャンセル・右が 追加", [ad.左, ad.右]);
  見(ad.名 === "VocabuQuiz" && /vocabuquiz\.app/.test(ad.u), "名前と アドレスが 入る", [ad.名, ad.u]);
  見(ad.ずれ <= 4, "★★ **指が「追加」を 指す**", ad.ずれ);

  await pg.evaluate(() => document.getElementById("vqInstall").shadowRoot
    .querySelector("[data-a='next']").click());
  await 待(1400);
  const hm = await pg.evaluate(() => {
    const sr = document.getElementById("vqInstall").shadowRoot;
    const h = sr.querySelector("[data-home]");
    return { 出た: h.classList.contains("on"),
             名: h.querySelector(".home-l").textContent,
             印: !!h.querySelector(".home-a.me") };
  });
  見(hm.出た && hm.印, "★★ **ホーム画面に アイコンが 増える**");
  見(hm.名 === "VocabuQuiz", "アイコンの 名前", hm.名);

  /* ── ⑥ チェックを 入れたら 二度と 出ない ────────────── */
  節("⑥ 「次から 出さない」");
  await pg.evaluate(() => {
    const sr = document.getElementById("vqInstall").shadowRoot;
    const c = sr.querySelector("[data-a='hide']");
    c.checked = true; c.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
  });
  await 待(200);
  見(await pg.evaluate(() => window.__vqInstall.状態().出さない), "チェックが 効く");
  await pg.evaluate(() => document.getElementById("vqInstall").shadowRoot
    .querySelector("[data-a='close']").click());
  await 待(300);
  const 覚 = await pg.evaluate(() => ({
    閉: document.getElementById("vqInstall").getAttribute("data-open"),
    印: localStorage.getItem("vq.install.hide.v1"),
    もう: window.__vqInstall.出すべきか() }));
  見(覚.閉 !== "1", "閉じる");
  見(覚.印 === "1" && 覚.もう === false, "★★ **覚える**", 覚);

  await pg.reload({ waitUntil: "domcontentloaded" });
  await 待(6500);
  見(await pg.evaluate(() => document.getElementById("vqInstall")
    && document.getElementById("vqInstall").getAttribute("data-open")) !== "1",
    "★★ **入れ直しても もう 出ない**");
  見(例外.length === 0, "例外 0 件", 例外.slice(0, 2));
  await ctx.close();

  /* ── ⑦ スマホで 開くと Safari から ─────────────────── */
  節("⑦ スマホ（390px）");
  ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 "
      + "(KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" });
  pg = await ctx.newPage();
  await pg.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => !!window.__vqInstall, null, { timeout: 20000 });
  await 待(5000);
  const m = await pg.evaluate(() => {
    const h = document.getElementById("vqInstall"); if (!h) return null;
    const sr = h.shadowRoot, w = sr.querySelector(".w");
    if (!w) return { 開: false };
    const r = w.getBoundingClientRect();
    const 釦 = Array.from(sr.querySelectorAll(".btn,.chk")).map(x => Math.round(x.getBoundingClientRect().height));
    return { 開: h.getAttribute("data-open") === "1", 面: window.__vqInstall.状態().面,
             幅: Math.round(r.width), 下: Math.round(innerHeight - r.bottom),
             はみ: Math.round(document.documentElement.scrollWidth - innerWidth),
             低い釦: 釦.filter(x => x < 40), 高: Math.round(r.height) };
  });
  見(m && m.開, "★ スマホでも 出る");
  見(m && m.面 === "ph", "★★ **スマホでは Safari の 案内から**", m && m.面);
  見(m && m.下 === 0 && m.幅 === 390, "★ 下から せり上がる 板（幅いっぱい）", m && { 幅: m.幅, 下: m.下 });
  見(m && m.高 <= 844, "画面から はみ出さない", m && m.高);
  見(m && m.はみ === 0, "★ 横に はみ出さない", m && m.はみ);
  見(m && m.低い釦.length === 0, "★ 押すところは 40px 以上", m && m.低い釦);

  /* ★ スマホで **次へ／前へ が 画面の 中に 見えて いる**か。
     直す前: 板の 中で 下へ こぼれ、スクロールしないと 押せなかった。 */
  const 足 = await pg.evaluate(() => {
    const sr = document.getElementById("vqInstall").shadowRoot;
    const 次 = sr.querySelector("[data-a='next']");
    const r = 次.getBoundingClientRect();
    const 上の物 = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { 下: Math.round(innerHeight - r.bottom), 上: Math.round(r.top),
             見える: r.top >= 0 && r.bottom <= innerHeight,
             塞がれていない: !!上の物 };
  });
  見(足.見える, "★★ **「次へ」が 画面の 中に 見えて いる**（すべらせずに 押せる）", 足);

  /* 生の ** が 出て いないか（強調の 印は 太字に なる） */
  const 印字 = await pg.evaluate(() => {
    const sr = document.getElementById("vqInstall").shadowRoot;
    return { 文: sr.querySelector(".step-t").textContent,
             補: sr.querySelector(".hint") ? sr.querySelector(".hint").textContent : "",
             太: sr.querySelectorAll(".hint b").length };
  });
  見(印字.文.indexOf("**") < 0 && 印字.補.indexOf("**") < 0,
    "★★ **強調の 印（**）が 生の まま 出て いない**", 印字.補.slice(0, 40));
  見(印字.太 > 0, "★ 補足の 中も 太字に なる", 印字.太);
  await ctx.close();

  /* ── ⑧ もう 入って いる 人には 出さない ─────────────── */
  節("⑦-c 背の 低い 画面（320×568）");
  /* 直す前: 説明も 段の 点も 全部 画面の 外に 落ちて いた（絵が 大きすぎた）。 */
  ctx = await b.newContext({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });
  pg = await ctx.newPage();
  await pg.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => !!window.__vqInstall, null, { timeout: 20000 });
  await 待(5000);
  const 小 = await pg.evaluate(() => {
    const sr = document.getElementById("vqInstall").shadowRoot;
    const 中 = (q) => { const e = sr.querySelector(q); if (!e) return null;
      const r = e.getBoundingClientRect();
      return { 上: Math.round(r.top), 下: Math.round(innerHeight - r.bottom),
               見: r.top >= -1 && r.bottom <= innerHeight + 1 }; };
    return { 次: 中("[data-a='next']"), 説: 中(".step-t"), 見出: 中(".h1"),
             はみ: Math.round(document.documentElement.scrollWidth - innerWidth) };
  });
  見(小.見出 && 小.見出.見, "★ 見出しが 見える", 小.見出);
  見(小.説 && 小.説.見, "★★ **説明が 画面の 中に 入る**", 小.説);
  見(小.次 && 小.次.見, "★★ **「次へ」が 押せる**", 小.次);
  見(小.はみ === 0, "★ 横に はみ出さない", 小.はみ);
  await ctx.close();

  節("⑦-b 設定から もう 一度 見られる");
  /* 「次から 出さない」に した あと、**戻り道が 無いと 消しっぱなし**に なる。 */
  ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  pg = await ctx.newPage();
  await pg.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => !!window.__vqSet && !!window.__vqInstall, null, { timeout: 20000 });
  await pg.evaluate(() => localStorage.setItem("vq.install.hide.v1", "1"));
  await 待(1500);
  const 戻 = await pg.evaluate(() => {
    const d = window.__vqSet.spec("app.installTour");
    return { 有: !!d, 名: d && d.label, 種: d && d.type, 組: d && d.group,
             一覧に: window.__vqSet.inGroup("data").some(x => x.id === "app.installTour") };
  });
  見(戻.有 && 戻.種 === "action", "★★ **設定に「アプリの入れかたを見る」が ある**", 戻);
  見(戻.一覧に, "★ 設定の 一覧（データ）に 並ぶ", 戻.一覧に);
  const 戻2 = await pg.evaluate(() => {
    try { window.__vqSet.spec("app.installTour").run(); }
    catch (e) { return { 訳: String(e).slice(0, 80) }; }
    return null;
  });
  await 待(800);
  const 開2 = await pg.evaluate(() => ({
    開: document.getElementById("vqInstall")
      && document.getElementById("vqInstall").getAttribute("data-open"),
    印: localStorage.getItem("vq.install.hide.v1") }));
  見(開2.開 === "1", "★★ **押すと 案内が また 開く**", 開2.開 || 戻2);
  見(開2.印 !== "1", "★ 「次から 出さない」の 印が 外れる", 開2.印);
  await ctx.close();

  節("⑧ もう 入って いる 人");
  ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  pg = await ctx.newPage();
  await pg.addInitScript(() => {
    const 元 = window.matchMedia.bind(window);
    window.matchMedia = function (q) {
      if (/display-mode:\s*standalone/.test(q)) return { matches: true, media: q,
        addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} };
      return 元(q);
    };
  });
  await pg.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await pg.waitForFunction(() => !!window.__vqInstall, null, { timeout: 20000 });
  await 待(6000);
  const 入 = await pg.evaluate(() => ({
    入: window.__vqInstall.入っているか(), 出: window.__vqInstall.出すべきか(),
    開: document.getElementById("vqInstall") && document.getElementById("vqInstall").getAttribute("data-open") }));
  見(入.入 === true && 入.出 === false, "アプリで 開いて いると 分かる", 入);
  見(入.開 !== "1", "★★ **もう 入って いる 人には 出さない**");
  await ctx.close();

  await b.close();
  console.log("\n" + "─".repeat(32) + "\n  ok " + ok + " / NG " + ng);
  if (ng) { console.log("  落ちた: " + 落.join(" / ")); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
