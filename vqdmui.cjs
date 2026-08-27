/* ══════════════════════════════════════════════════════════════════════════
   vqdmui.cjs — DM の 画面を 本物の Chromium で 確かめる
   ・左のサイドパネルに DM が 出る／未読の印が 付く
   ・探す → 話しかける → 送る が 画面から 通る
   ・日付の区切り・時刻・既読・上限の帯
   ・スタンプ盤（大量）・返信・ピン・削除・報告
   ・暗い画面でも 文字が 読める
   本番では 走らせない。
   ══════════════════════════════════════════════════════════════════════════ */
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const { chromium } = require("playwright");

let 済 = 0, 落 = 0; const 印 = [];
function ok(名, 真, 補) {
  if (真) { 済++; 印.push("  ✅ " + 名 + (補 ? "  " + 補 : "")); }
  else { 落++; 印.push("  ❌ " + 名 + (補 ? "  " + 補 : "")); }
}
function 節(t) { 印.push("\n── " + t + " " + "─".repeat(Math.max(0, 54 - t.length))); }

async function req(path, { method = "GET", body, token } = {}) {
  const h = { "content-type": "application/json" };
  if (token) h.authorization = "Bearer " + token;
  const r = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, j: await r.json().catch(() => ({})) };
}
let n = 0;
async function 作る(名) {
  n++;
  const tag = `ui${Date.now().toString(36)}${n}`;
  const s = await req("/api/auth/register/start", { method: "POST",
    body: { email: `vqdmui.${tag}@gmail.com`, gradePrefix: "H2", nickname: 名 + tag, password: "Testing!2345" } });
  const v = await req("/api/auth/register/verify", { method: "POST", body: { challengeId: s.j.challengeId, code: s.j.devCode } });
  const c = await req("/api/auth/register/consent", { method: "POST",
    body: { registrationSession: v.j.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: "482913" } });
  const me = await req("/api/auth/me", { token: c.j.token });
  return { token: c.j.token, uid: Number(me.j?.user?.id || me.j?.id || 0), nickname: 名 + tag };
}

/* 影の DOM の中まで 探す */
const 中 = (sel) => `document.getElementById("vqDM").shadowRoot.querySelector(${JSON.stringify(sel)})`;
const 中みんな = (sel) => `document.getElementById("vqDM").shadowRoot.querySelectorAll(${JSON.stringify(sel)})`;

(async () => {
  const A = await 作る("uia");
  const B = await 作る("uib");

  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 820 } });
  const p = await ctx.newPage();
  const 画面の失敗 = [];
  p.on("pageerror", (e) => 画面の失敗.push(String(e.message).slice(0, 160)));

  await p.addInitScript(([t]) => {
    try { localStorage.setItem("app.auth.token.v1", t); } catch (e) {}
  }, [A.token]);
  await p.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await p.waitForFunction(() => !!window.__vqOpenDM, null, { timeout: 25000 }).catch(() => {});

  節("① 積み込み");
  ok("DM の部品が 読み込まれている", await p.evaluate(() => !!window.__vqOpenDM));
  ok("外へ出す口が そろっている",
    await p.evaluate(() => !!(window.__vqDM && window.__vqDM.開く && window.__vqDM.スタンプ数)));

  節("② 左のサイドパネル");
  await p.waitForTimeout(2500);
  const 側 = await p.evaluate(() => {
    const sh = document.getElementById("vqShell");
    if (!sh || !sh.shadowRoot) return { なし: true };
    const it = sh.shadowRoot.querySelector('.vqs-item[data-fn="dm"]');
    return { ある: !!it, 文: it ? (it.textContent || "").trim() : "", 印: !!(it && it.querySelector("[data-vq-dm-badge]")) };
  });
  ok("サイドパネルに DM が ある", 側.ある === true, JSON.stringify(側));
  ok("DM の 名前が 出ている", /DM/.test(側.文 || ""), 側.文);
  ok("未読の 印の 入れ物が ある", 側.印 === true);

  節("③ 開いて 相手を 探す");
  await p.evaluate(() => window.__vqOpenDM());
  await p.waitForTimeout(700);
  ok("画面が 開く", await p.evaluate(() => document.getElementById("vqDM").getAttribute("data-open") === "1"));
  ok("見出しが DM", await p.evaluate(`${中(".lhead h2")}.textContent.trim() === "DM"`));
  ok("まだ やりとりが 無いと 案内が 出る",
    await p.evaluate(`/まだ やりとりがありません/.test(${中(".list")}.textContent)`));

  await p.evaluate(([q]) => {
    const i = document.getElementById("vqDM").shadowRoot.querySelector("[data-q]");
    i.value = q; i.dispatchEvent(new Event("input", { bubbles: true }));
  }, [B.nickname]);
  await p.waitForTimeout(900);
  ok("探した人が 出る", await p.evaluate(`${中("[data-a='startdm']")} !== null`));

  await p.evaluate(`${中("[data-a='startdm']")}.click()`);
  await p.waitForTimeout(1200);
  ok("やりとりの画面へ 入る", await p.evaluate(() => document.getElementById("vqDM").getAttribute("data-pane") === "chat"));
  ok("相手の名前が 上に 出る", await p.evaluate(`/${B.nickname}/.test(${中(".chead .nm b")}.textContent)`));

  節("④ 上限の 帯（相互フォローでない）");
  ok("あと 3 件 と 出る", await p.evaluate(`/あと/.test(${中(".limit")}.textContent) && /3/.test(${中(".limit")}.textContent)`),
    await p.evaluate(`${中(".limit")}.textContent.trim().slice(0,50)`));

  節("⑤ 送る");
  await p.evaluate(() => {
    const t = document.getElementById("vqDM").shadowRoot.querySelector("[data-ta]");
    t.value = "画面から送りました"; t.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await p.evaluate(`${中("[data-a='send']")}.click()`);
  await p.waitForTimeout(1400);
  const 状 = await p.evaluate(() => {
    const r = document.getElementById("vqDM").shadowRoot;
    const ms = Array.from(r.querySelectorAll(".m"));
    const last = ms[ms.length - 1];
    return {
      数: ms.length,
      文: last ? (last.querySelector(".bub") || {}).textContent : "",
      自分: last ? last.classList.contains("me") : false,
      時刻: last ? (last.querySelector(".ts") || {}).textContent : "",
      日付: (r.querySelector(".daysep") || {}).textContent || "",
      帯: (r.querySelector(".limit") || {}).textContent || ""
    };
  });
  ok("吹き出しが 出る", 状.数 === 1 && 状.文 === "画面から送りました", JSON.stringify(状.文));
  ok("自分の側に 寄る", 状.自分 === true);
  ok("時刻が 付く", /^\d\d:\d\d$/.test(String(状.時刻 || "").trim()), 状.時刻);
  ok("日付の 区切りが 上に 出る", /今日/.test(状.日付), 状.日付);
  ok("残りが 2 件に 減る", /2/.test(状.帯), String(状.帯).trim().slice(0, 40));

  節("⑥ スタンプ盤");
  await p.evaluate(`${中("[data-a='pad']")}.click()`);
  await p.waitForTimeout(600);
  const 盤 = await p.evaluate(() => {
    const r = document.getElementById("vqDM").shadowRoot;
    return {
      ある: !!r.querySelector(".pad"),
      組: r.querySelectorAll(".padtabs button").length,
      粒: r.querySelectorAll(".padgrid button").length,
      総: window.__vqDM.スタンプ数()
    };
  });
  ok("スタンプ盤が 開く", 盤.ある === true);
  ok("組（カテゴリ）が 複数 ある", 盤.組 >= 5, String(盤.組));
  ok("スタンプが 大量に ある（500 種以上）", 盤.総 >= 500, String(盤.総) + " 種");
  ok("最初の組にも たくさん 出る", 盤.粒 >= 50, String(盤.粒));
  await p.evaluate(`${中(".padgrid button")}.click()`);
  await p.waitForTimeout(1200);
  const ス = await p.evaluate(() => {
    const r = document.getElementById("vqDM").shadowRoot;
    const ms = r.querySelectorAll(".m");
    const last = ms[ms.length - 1];
    return { 数: ms.length, 大: !!last.querySelector(".stamp"),
      字: last.querySelector(".stamp") ? last.querySelector(".stamp").textContent : "",
      大きさ: last.querySelector(".stamp") ? getComputedStyle(last.querySelector(".stamp")).fontSize : "" };
  });
  ok("スタンプが 送れる", ス.数 === 2 && ス.大 === true, JSON.stringify(ス.字));
  ok("スタンプは 大きく 出る", parseFloat(ス.大きさ) >= 40, ス.大きさ);

  節("⑦ 返信・ピン・メニュー");
  await p.evaluate(`${中(".m .kebab")}.click()`);
  await p.waitForTimeout(300);
  const 品 = await p.evaluate(() => Array.from(
    document.getElementById("vqDM").shadowRoot.querySelectorAll(".menu button")).map((b) => b.textContent.trim()));
  ok("メニューが 出る", 品.length >= 3, JSON.stringify(品));
  ok("返信が ある", 品.some((t) => /返信/.test(t)));
  ok("ピン留めが ある", 品.some((t) => /ピン/.test(t)));
  ok("自分のものには 取り消しが ある", 品.some((t) => /取り消/.test(t)));
  await p.evaluate(`${中(".menu [data-a='reply']")}.click()`);
  await p.waitForTimeout(400);
  ok("返信の 帯が 出る", await p.evaluate(`${中(".repbar")} !== null`));
  await p.evaluate(`${中("[data-a='unreply']")}.click()`);
  await p.waitForTimeout(300);
  ok("返信を やめられる", await p.evaluate(`${中(".repbar")} === null`));

  節("⑧ 上限を 使い切ったら 送れない");
  for (let i = 0; i < 2; i++) {
    await p.evaluate(([s]) => {
      const t = document.getElementById("vqDM").shadowRoot.querySelector("[data-ta]");
      t.value = s; t.dispatchEvent(new Event("input", { bubbles: true }));
    }, ["つづき" + i]);
    await p.evaluate(`${中("[data-a='send']")}.click()`);
    await p.waitForTimeout(1000);
  }
  const 切 = await p.evaluate(() => {
    const r = document.getElementById("vqDM").shadowRoot;
    return { 帯: (r.querySelector(".limit") || {}).textContent || "",
      赤: !!r.querySelector(".limit.ng"),
      止: !!r.querySelector("[data-ta]").disabled,
      送止: !!r.querySelector("[data-a='send']").disabled };
  });
  ok("使い切ると 赤い帯に なる", 切.赤 === true, String(切.帯).trim().slice(0, 44));
  ok("書き込み口が 止まる", 切.止 === true);
  ok("送るボタンも 止まる", 切.送止 === true);
  ok("直しかたが 書いてある", /フォロー/.test(切.帯));

  節("⑨ 一覧と 未読の印");
  await p.evaluate(`${中("[data-a='back']")}.click()`);
  await p.waitForTimeout(500);
  ok("一覧に 相手が 並ぶ", await p.evaluate(`${中みんな(".row")}.length >= 1`));
  ok("最後の一言が 出る", await p.evaluate(`/つづき|自分:/.test(${中(".row .rlast")}.textContent)`),
    await p.evaluate(`${中(".row .rlast")}.textContent`));

  /* 相手から 送らせて、印が 立つか */
  const tid = await p.evaluate(() => window.__vqDM.状態().部屋 || "");
  const 一 = await req("/api/dm/threads", { token: B.token });
  const bt = (一.j.threads || [])[0];
  await req("/api/dm/send", { method: "POST", body: { threadId: bt.id, kind: "text", body: "相手からの返事" }, token: B.token });
  await p.waitForTimeout(4200);
  const 未 = await p.evaluate(() => {
    const sh = document.getElementById("vqShell");
    const bd = sh && sh.shadowRoot ? sh.shadowRoot.querySelector("[data-vq-dm-badge]") : null;
    const r = document.getElementById("vqDM").shadowRoot;
    return { 数: window.__vqDM.未読(), 印: bd ? bd.textContent : "", 出: bd ? bd.classList.contains("on") : false,
      玉: (r.querySelector(".ub") || {}).textContent || "" };
  });
  ok("未読が 増える（3 秒ごとに 見に行く）", 未.数 >= 1, JSON.stringify(未));
  ok("サイドパネルに 未読の数が 出る", 未.出 === true && /\d/.test(未.印), 未.印);
  ok("一覧にも 未読の 玉が 出る", /\d/.test(未.玉), 未.玉);

  節("⑩ 暗い画面");
  /* ★ 暗い画面の 切り替えは **html[data-theme-mode="dark"]**（本体がここに書く）。
     data-theme では 何も 変わらない（前は それで 測っていて、
     明るいままの 色で 通していた）。 */
  await p.evaluate(() => document.documentElement.setAttribute("data-theme-mode", "dark"));
  await p.waitForTimeout(400);
  await p.evaluate(`${中(".row")}.click()`);
  await p.waitForTimeout(1200);
  const 色 = await p.evaluate(() => {
    const r = document.getElementById("vqDM").shadowRoot;
    const g = (s) => { const e = r.querySelector(s); return e ? getComputedStyle(e).color : ""; };
    const bg = (s) => { const e = r.querySelector(s); return e ? getComputedStyle(e).backgroundColor : ""; };
    return { 本文: g(".m.you .bub") || g(".m .bub"), 地: bg(".sheet"), 名: g(".chead .nm b"), 一覧: g(".rlast") };
  });
  function 明るさ(c) {
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c || "");
    if (!m) return -1;
    const f = [1, 2, 3].map((i) => { const v = Number(m[i]) / 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); });
    return .2126 * f[0] + .7152 * f[1] + .0722 * f[2];
  }
  function 比(a, b) { const x = 明るさ(a), y = 明るさ(b); if (x < 0 || y < 0) return 0; const h = Math.max(x, y), l = Math.min(x, y); return (h + .05) / (l + .05); }
  const 比1 = 比(色.本文, 色.地), 比2 = 比(色.名, 色.地);
  ok("本当に 暗い画面に なっている", 明るさ(色.地) >= 0 && 明るさ(色.地) < 0.2, 色.地 + " 明るさ " + 明るさ(色.地).toFixed(3));
  ok("暗い画面でも 本文が 読める（4.5 以上）", 比1 >= 4.5, 色.本文 + " / " + 色.地 + " = " + 比1.toFixed(2));
  ok("暗い画面でも 名前が 読める", 比2 >= 4.5, 色.名 + " = " + 比2.toFixed(2));

  節("⑪ せまい画面");
  await p.setViewportSize({ width: 420, height: 820 });
  await p.waitForTimeout(500);
  const 狭 = await p.evaluate(() => {
    const h = document.getElementById("vqDM"), r = h.shadowRoot;
    const 見 = (s) => { const e = r.querySelector(s); return e ? getComputedStyle(e).display !== "none" : false; };
    return { 面: h.getAttribute("data-pane"), 左: 見(".left"), 右: 見(".right"), 戻: 見(".backb"),
      はみ: r.querySelector(".sheet").scrollWidth > window.innerWidth + 2 };
  });
  ok("せまい画面では 片方だけ 出る", !(狭.左 && 狭.右), JSON.stringify(狭));
  ok("戻る矢印が 出る", 狭.戻 === true);
  ok("横に はみ出さない", 狭.はみ === false);

  節("⑫ 閉じかた");
  await p.keyboard.press("Escape");
  await p.waitForTimeout(400);
  ok("Esc で 閉じる", await p.evaluate(() => document.getElementById("vqDM").getAttribute("data-open") === "0"));
  ok("画面の失敗が 出ていない", 画面の失敗.length === 0, 画面の失敗.slice(0, 2).join(" / "));

  await b.close();
  console.log(印.join("\n"));
  console.log("\n" + (落 === 0 ? "通った" : "落ちた") + "  " + 済 + "/" + (済 + 落));
  process.exit(落 === 0 ? 0 : 1);
})().catch((e) => { console.error("止まりました:", e.message); process.exit(2); });
