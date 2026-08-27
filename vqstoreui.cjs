/* ══════════════════════════════════════════════════════════════════════
   vqstoreui.cjs — 会話の 置き場所を **本物のブラウザで** 確かめる

   なぜ 要るか:
     サーバの口が 通ることと、画面から 使えることは 別。
     とくに ここは localStorage を 横から見る 作りなので、
       ・会話以外の 鍵まで 触っていないか
       ・localStorage が 一杯でも 失わないか
       ・端末を 変えたつもり（記憶を 空にする）で 引き直せるか
     を 実際に 動かさないと 分からない。

   使い方: node vqstoreui.cjs      （先に server/dev-local.sh echo を 立てておく）
   ══════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_UI || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) {
  console.error("本番では実行しません。");
  process.exit(2);
}

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => {
  if (c) { pass++; console.log("  ok   " + n); }
  else { fail++; bad.push(n); console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 400) : "")); }
};
const 節 = (t) => console.log("\n══ " + t + " ══");

(async () => {
  const { chromium } = require("playwright");
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const 赤 = [];
  page.on("pageerror", (e) => 赤.push(String(e && e.message || e)));

  console.log("開く: " + BASE);
  await page.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3500);

  /* ── 検証アカウントを 作って 札を 置く ─────────────────────── */
  const 私 = await page.evaluate(async (b) => {
    const nick = "ui" + Date.now().toString(36).slice(-6) + Math.floor(Math.random() * 90 + 10);
    const r = await fetch(b + "/api/auth/register", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gradePrefix: "H1", nickname: nick, password: "DevStore#2026a",
                             tosAccepted: true, tosVersion: "1" })
    });
    const d = await r.json();
    if (d.token) localStorage.setItem("vq.auth.token", d.token);
    return { nick, token: d.token || "" };
  }, BASE);
  ok("検証アカウントを 作れた", !!私.token, 私.nick);

  節("① 仕掛けが 立ち上がっている");
  const 在る = await page.evaluate(() => ({
    cloud: typeof window.VQCLOUD === "object",
    idb: typeof window.VQIDB === "object",
    様子: window.VQCLOUD ? window.VQCLOUD.様子() : null
  }));
  ok("VQCLOUD が 立ち上がっている", 在る.cloud, 在る);
  ok("VQIDB も 生きている（前の仕掛けを 壊していない）", 在る.idb, 在る);

  節("② 会話以外の 鍵は 触らない（ここを 間違えると 全部 壊れる）");
  const 素通し = await page.evaluate(() => {
    const 印 = "vq.test.素通し." + Math.random();
    localStorage.setItem(印, "そのまま");
    const 読めた = localStorage.getItem(印) === "そのまま";
    /* 本当に localStorage に 入っているか（写しではなく） */
    const 生 = Object.prototype.hasOwnProperty.call(localStorage, 印) || localStorage.getItem(印) !== null;
    localStorage.removeItem(印);
    const 消えた = localStorage.getItem(印) === null;
    /* 別の大事な鍵も 触られていないこと */
    localStorage.setItem("vq.test.settings", JSON.stringify({ a: 1 }));
    const 設定 = localStorage.getItem("vq.test.settings");
    localStorage.removeItem("vq.test.settings");
    return { 読めた, 生, 消えた, 設定 };
  });
  ok("ふつうの鍵は そのまま 読み書きできる", 素通し.読めた && 素通し.生 && 素通し.消えた, 素通し);
  ok("ふつうの鍵の 中身が 変わらない", 素通し.設定 === '{"a":1}', 素通し.設定);

  節("③ 書いたら サーバへ 届く");
  const 送った = await page.evaluate(async () => {
    const id = "ui-ses-1";
    localStorage.setItem("app.chat.sessions.v2", JSON.stringify([
      { id: id, title: "画面から 書いた会話", updatedAt: Date.now() }
    ]));
    localStorage.setItem("app.chat.ses." + id + ".v2", JSON.stringify([
      { id: "m1", role: "user", text: "こんにちは" },
      { id: "m2", role: "ai", text: "こんにちは。今日は 何を 覚えますか。" }
    ]));
    const r = await window.VQCLOUD.いま送る();
    return r;
  });
  ok("サーバへ 送れた", 送った && 送った.送った >= 1, 送った);

  const サーバに = await page.evaluate(async (b) => {
    const t = localStorage.getItem("vq.auth.token");
    const r = await fetch(b + "/api/chat/sessions?full=1", { headers: { Authorization: "Bearer " + t } });
    return await r.json();
  }, BASE);
  const S1 = (サーバに.sessions || []).find((x) => x.id === "ui-ses-1");
  ok("サーバに 会話が 在る", !!S1, (サーバに.sessions || []).map((x) => x.id));
  ok("見出しも 届いている", S1 && S1.title === "画面から 書いた会話", S1 && S1.title);
  ok("本文も 届いている", S1 && /こんにちは/.test(String(S1.body || "")), S1 && String(S1.body).slice(0, 60));

  節("④ 端末を 変えても 戻ってくる");
  const 戻り = await page.evaluate(async () => {
    /* 端末を 変えたのと 同じ状態にする: 手元も 写しも 空にする */
    const 札 = localStorage.getItem("vq.auth.token");
    Object.keys(window.VQCLOUD.記憶).forEach((k) => { delete window.VQCLOUD.記憶[k]; });
    localStorage.clear();
    localStorage.setItem("vq.auth.token", 札);
    const 前 = localStorage.getItem("app.chat.ses.ui-ses-1.v2");
    const r = await window.VQCLOUD.引く(true);
    const 後 = localStorage.getItem("app.chat.ses.ui-ses-1.v2");
    const 一覧 = JSON.parse(localStorage.getItem("app.chat.sessions.v2") || "[]");
    return { 前, 後, 一覧, r };
  });
  ok("空にした直後は 何も 無い", 戻り.前 === null, 戻り.前);
  ok("引いたら 本文が 戻る", /こんにちは/.test(String(戻り.後 || "")), String(戻り.後 || "").slice(0, 60));
  ok("一覧も 戻る", (戻り.一覧 || []).some((x) => x.id === "ui-ses-1"), 戻り.一覧);
  ok("見出しも 戻る", ((戻り.一覧 || [])[0] || {}).title === "画面から 書いた会話", 戻り.一覧);

  節("⑤ 手元が 一杯でも 失わない（いちばん 起きていたこと）");
  const 一杯 = await page.evaluate(async () => {
    /* localStorage を わざと 埋める（4.4MB の壁）。 */
    const 詰め = "x".repeat(256 * 1024);
    let 詰めた = 0;
    try { for (let i = 0; i < 40; i++) { localStorage.setItem("vq.test.詰め" + i, 詰め); 詰めた++; } }
    catch (e) { /* 一杯になった。ここからが 本番 */ }

    const id = "ui-ses-2";
    const 本文 = JSON.stringify([{ id: "m1", role: "user", text: "一杯のときに 書いた会話" }]);
    const 一覧 = JSON.parse(localStorage.getItem("app.chat.sessions.v2") || "[]");
    一覧.push({ id: id, title: "一杯のとき", updatedAt: Date.now() });
    localStorage.setItem("app.chat.sessions.v2", JSON.stringify(一覧));
    localStorage.setItem("app.chat.ses." + id + ".v2", 本文);

    /* 素の localStorage には 入らなかったかもしれない。**それでも 読めること**。 */
    const 読めた = localStorage.getItem("app.chat.ses." + id + ".v2");
    const r = await window.VQCLOUD.いま送る();
    /* 片づける */
    for (let i = 0; i < 詰めた; i++) { try { localStorage.removeItem("vq.test.詰め" + i); } catch (e) {} }
    return { 詰めた, 読めた, r, 様子: window.VQCLOUD.様子() };
  });
  ok("手元を 実際に 一杯にできた", 一杯.詰めた > 0, 一杯.詰めた + " 個 詰めた");
  ok("一杯でも 書いた会話を そのまま 読める", /一杯のときに 書いた会話/.test(String(一杯.読めた || "")),
     String(一杯.読めた || "").slice(0, 80));
  ok("一杯でも サーバへ 送れる", 一杯.r && 一杯.r.送った >= 1, 一杯.r);

  const 一杯の後 = await page.evaluate(async (b) => {
    const t = localStorage.getItem("vq.auth.token");
    const r = await fetch(b + "/api/chat/sessions?id=ui-ses-2", { headers: { Authorization: "Bearer " + t } });
    return await r.json();
  }, BASE);
  ok("一杯のときの会話が サーバに 残っている",
     一杯の後.session && /一杯のときに 書いた会話/.test(String(一杯の後.session.body || "")),
     一杯の後.session && String(一杯の後.session.body || "").slice(0, 80));

  節("⑥ 読み込まれる前から 在った会話も 取り残さない");
  /* ★ この仕掛けは 束の いちばん後ろで 立ち上がる。
     つまり 立ち上がる前から 手元に 在った会話は、
     もう一度 触られない限り **一度も 送られない**。
     いままでの会話が そのまま 端末に 取り残される、という話。 */
  const 取り残し = await page.evaluate(async () => {
    const 札 = localStorage.getItem("vq.auth.token");
    /* 仕掛けを 知らないまま 手元に 会話が 在る状態を 作る */
    Object.keys(window.VQCLOUD.記憶).forEach((k) => { delete window.VQCLOUD.記憶[k]; });
    const 素書き = Storage.prototype.setItem;      /* 包む前の 本物 */
    const id = "ui-ses-old";
    素書き.call(localStorage, "app.chat.sessions.v2", JSON.stringify([
      { id: id, title: "むかしからある会話", updatedAt: 1700000000000 }
    ]));
    素書き.call(localStorage, "app.chat.ses." + id + ".v2",
      JSON.stringify([{ id: "m1", role: "user", text: "これは 前から 手元に 在った" }]));
    localStorage.setItem("vq.auth.token", 札);
    const r = await window.VQCLOUD.引く(true);
    await new Promise((x) => setTimeout(x, 2200));
    return r;
  });
  ok("取り残しに 気づく", 取り残し && 取り残し.送り出す >= 1, 取り残し);
  const 拾えた = await page.evaluate(async (b) => {
    const t = localStorage.getItem("vq.auth.token");
    const r = await fetch(b + "/api/chat/sessions?id=ui-ses-old", { headers: { Authorization: "Bearer " + t } });
    return await r.json();
  }, BASE);
  ok("前から在った会話も サーバへ 上がる",
     拾えた.session && /前から 手元に 在った/.test(String(拾えた.session.body || "")),
     拾えた.session && String(拾えた.session.body || "").slice(0, 60));

  節("⑦ 消したら 他の端末でも 消える");
  const 消し = await page.evaluate(async (b) => {
    localStorage.removeItem("app.chat.ses.ui-ses-2.v2");
    await new Promise((r) => setTimeout(r, 900));
    const t = localStorage.getItem("vq.auth.token");
    const r = await fetch(b + "/api/chat/sessions?id=ui-ses-2", { headers: { Authorization: "Bearer " + t } });
    const d = await r.json();
    return { 手元: localStorage.getItem("app.chat.ses.ui-ses-2.v2"), 印: d.session && d.session.deletedAt };
  }, BASE);
  ok("手元から 消えている", 消し.手元 === null, 消し.手元);
  ok("サーバにも 消した印が 付く", 消し.印 > 0, 消し);

  節("⑧ 赤い字（例外）が 出ていない");
  const 新しい赤 = 赤.filter((x) => !/favicon|net::ERR|Failed to load resource/i.test(x));
  ok("画面の例外が 0（" + 新しい赤.length + "）", 新しい赤.length === 0, 新しい赤.slice(0, 5));

  await browser.close();
  console.log("\n════════════════════════════════════════════");
  console.log("  合計 " + (pass + fail) + " 件 / 通った " + pass + " / 落ちた " + fail);
  if (bad.length) { console.log("  落ちたもの:"); bad.forEach((b) => console.log("   - " + b)); }
  console.log("════════════════════════════════════════════");
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("落ちました: " + (e && e.stack || e)); process.exit(1); });
