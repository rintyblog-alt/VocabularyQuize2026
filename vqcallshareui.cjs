/* ══════════════════════════════════════════════════════════════════════════
   vqcallshareui.cjs — 通話中の **画面の 同席** を 本物の ブラウザで 見る。

   訴え（2026-08-30）:「VocabuQuiz内だけの画面共有、Lumiの呼び出しを行えるように」

   ここで いちばん 大事なのは 2 つ:
     ① 通話の 窓は **画面いっぱいの 幕**。畳めなければ アプリが 見えず、
        画面を 同席する 意味が 消える。→ 畳めること
     ② 送るのは 映像では なく **いま 見えている 文**。その 文が
        本当に いまの 画面の ものに なっているか（からっぽ・別の画面 では ない）

   測るところ:
     P-1  通話中に「画面」と「畳む」の ボタンが ある
     P-2  「画面」を 押すと 自動で 畳む（幕が 消え、アプリが 触れる）
     P-3  畳んだ 帯から 切る・ミュート・戻す が できる
     P-4  画面を 写した 中身が **いま 見えている もの**に なっている
     P-5  タブを 移ると 写した 中身も 変わる
     P-6  相手に 同席の 帯が 出て、こちらの 画面の 文が 見えている
     P-7  相手が 自動で 同じ タブへ 移る（追従）
     P-8  追従を やめられる／もう一度 入れられる
     P-9  やめると 相手の 帯が 消える
     P-10 通話が 終わると 同席も 止まる（畳みも 戻る）
     P-11 375px で 崩れない（横に はみ出さない・押すところが 44px 以上）
     P-12 アプリの 外は 写らない（映像を 一切 取っていない）

   使い方: VQ_BASE=<dev> node vqcallshareui.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) {
  console.error("本番では実行しません。"); process.exit(2);
}
const { chromium } = require("playwright");
let 済 = 0, 落 = 0;
const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 220) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 400) : "")); }
};
const 待 = (ms) => new Promise((s) => setTimeout(s, ms));
const j = (r) => r.json().catch(() => ({}));
async function 再fetch(u, o, n) {
  let 最後 = null;
  for (let i = 0; i < (n || 3); i++) {
    try { return await fetch(u, o); }
    catch (e) { 最後 = e; await new Promise((s) => setTimeout(s, 800 * (i + 1))); }
  }
  throw 最後;
}
async function 作る(名) {
  const 印 = Date.now().toString(36) + Math.floor(Math.random() * 9999);
  const r = await 再fetch(BASE + "/api/auth/register/start", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "vqp" + 印 + "@gmail.com", gradePrefix: "H2",
      nickname: (名 + 印).slice(0, 14), password: "Passw0rd!z3" }) }).then(j);
  const v = await 再fetch(BASE + "/api/auth/register/verify", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeId: r.challengeId, code: r.devCode }) }).then(j);
  const c = await 再fetch(BASE + "/api/auth/register/consent", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ registrationSession: v.registrationSession, agreeTerms: true,
      agreePrivacy: true, agreeAge: true, pin: "1379" }) }).then(j);
  if (!c.token) throw new Error("札が 取れない: " + JSON.stringify(c).slice(0, 200));
  return { token: c.token, uid: Number(c.user && c.user.id) };
}
async function api(path, tok, opts = {}) {
  const h = { "Content-Type": "application/json" };
  if (tok) h.Authorization = "Bearer " + tok;
  const r = await 再fetch(BASE + path, { method: opts.method || "GET", headers: h,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  return { status: r.status, j: await j(r) };
}
async function 開く(browser, tok, 幅) {
  const ctx = await browser.newContext({
    viewport: { width: 幅 || 1180, height: 900 },
    permissions: ["microphone"]
  });
  const page = await ctx.newPage();
  await page.addInitScript((t) => {
    try {
      localStorage.setItem("app.auth.token.v1", t);
      localStorage.setItem("app.auth.mode.v1", "user");
      localStorage.setItem("vq.tour.v1", JSON.stringify({ home: 1, preset: 1, feed: 1, dm: 1, insight: 1 }));
    } catch (e) {}
  }, tok);
  await page.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__vqCall, null, { timeout: 60000 });
  await page.evaluate(() => {
    Array.from(document.querySelectorAll("body > *")).forEach((h) => {
      const t = (h.shadowRoot ? h.shadowRoot.textContent : h.textContent) || "";
      if (/はじめかた|声で話しかけてみよう|もう出さない|5 つだけ/.test(t)) h.remove();
    });
  });
  return { ctx, page };
}
const 状態 = (page) => page.evaluate(() => window.__vqCall.状態());
const 同席 = (page) => page.evaluate(() => window.__vqCall.同席());
const 影 = (page) => page.evaluate(() => {
  const h = document.getElementById("vqCall");
  return h && h.shadowRoot ? (h.shadowRoot.textContent || "").replace(/\s+/g, " ") : "";
});
const 押す = (page, a) => page.evaluate((sel) => {
  const r = document.getElementById("vqCall").shadowRoot;
  const b = r.querySelector('[data-a="' + sel + '"]');
  if (!b) return false;
  b.click(); return true;
}, a);

(async () => {
  console.log("測る先:", BASE);
  const A = await 作る("pA"); await 待(900);
  const B = await 作る("pB");
  await api("/api/follow/toggle", A.token, { method: "POST", body: { targetUserId: B.uid, follow: true } });
  await api("/api/follow/toggle", B.token, { method: "POST", body: { targetUserId: A.uid, follow: true } });
  await api("/api/call/consent", A.token, { method: "POST", body: { agree: true } });
  await api("/api/call/consent", B.token, { method: "POST", body: { agree: true } });
  console.log("A =", A.uid, "/ B =", B.uid);

  const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });

  const a = await 開く(browser, A.token);
  const b = await 開く(browser, B.token, 375);      /* 相手は スマホの 幅で 見る */
  const 例外 = [];
  a.page.on("pageerror", (e) => 例外.push("A: " + String(e.message).slice(0, 160)));
  b.page.on("pageerror", (e) => 例外.push("B: " + String(e.message).slice(0, 160)));
  await 待(1500);

  節("通話を つなぐ");
  /* 合図の 通り道が つながるまで 待つ（ws が 1 = 生きている）。
     ここを 待たずに かけると、着信が 誰にも 届かない。 */
  for (let i = 0; i < 40; i++) {
    const x = await 状態(b.page);
    if (x.ws === 1) break;
    await 待(500);
  }
  await a.page.evaluate((id) => window.__vqCall.かける(id), B.uid);
  /* 着信の 画面に なるまで 待つ（決め打ちの 秒数だと たまに 落ちる）。 */
  for (let i = 0; i < 40; i++) {
    const x = await 状態(b.page);
    if (x.画面 === "着信") break;
    await 待(500);
  }
  console.log("  着信まで:", JSON.stringify(await 状態(b.page)));
  await 押す(b.page, "accept");
  await 待(4000);
  let sa = await 状態(a.page), sb = await 状態(b.page);
  見(sa.画面 === "通話中" && sb.画面 === "通話中", "つながった", { A: sa.画面, B: sb.画面 });
  if (sa.画面 !== "通話中") { console.log("先へ 進めません"); await browser.close(); process.exit(1); }

  節("段① 畳む — 幕の ままでは アプリが 見えない");

  /* P-1 ボタンが ある */
  const ボタン = await a.page.evaluate(() => {
    const r = document.getElementById("vqCall").shadowRoot;
    return Array.from(r.querySelectorAll("[data-a]")).map((x) => x.dataset.a);
  });
  見(ボタン.indexOf("share") >= 0, "P-1a「画面」の ボタンが ある", ボタン);
  見(ボタン.indexOf("fold") >= 0, "P-1b「畳む」の ボタンが ある", ボタン);
  見(ボタン.indexOf("lumi") >= 0, "P-1c「Lumi」の ボタンが ある（呼び出し）", ボタン);

  /* P-2 「画面」を 押すと 畳む */
  await 押す(a.page, "share");
  await 待(2500);
  let 同A = await 同席(a.page);
  見(同A.出している === true, "P-2a「画面」で 同席が 始まる", 同A);
  見(同A.畳んだ === true, "P-2b 押すと **自動で 畳む**", 同A);
  const 幕 = await a.page.evaluate(() => {
    const h = document.getElementById("vqCall");
    const bd = h.shadowRoot.querySelector(".bd");
    return { 幕: bd ? getComputedStyle(bd).display : "(無し)",
             min: h.getAttribute("data-min"),
             触り: getComputedStyle(h).pointerEvents };
  });
  /* 畳んだ ときは 幕そのものを 描かない（あっても display:none）。 */
  見(幕.min === "1" && (幕.幕 === "(無し)" || 幕.幕 === "none"), "P-2c 幕が 無くなる", 幕);
  見(幕.触り === "none", "P-2d 幕の 外は 触りが 下へ 通る（アプリが 使える）", 幕);

  /* ★ 実際に アプリを 触れるか。
     旧タブ（#appTabBar [data-app-tab]）は **新しい 左パネルの 下に 隠す 作り**
     なので、そこを 見ても 意味が ない。**通話の 窓が 前を ふさいでいないか**を
     画面の 何か所かで 直に 見る。 */
  const ふさぎ = await a.page.evaluate(() => {
    const 点 = [[innerWidth / 2, innerHeight / 2], [innerWidth / 2, innerHeight - 40],
                [60, innerHeight / 2], [innerWidth - 60, 120]];
    return 点.map(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return el ? (el.id || el.tagName) : "(なし)";
    });
  });
  見(ふさぎ.every((x) => x !== "vqCall"), "P-2e 通話の 窓が アプリの 前を ふさいでいない", ふさぎ);

  /* 帯そのものは ちゃんと 押せる（触りを 通しすぎて いない） */
  const 帯が押せる = await a.page.evaluate(() => {
    const r = document.getElementById("vqCall").shadowRoot;
    const b2 = r.querySelector('.mb[data-a="hangup"]');
    if (!b2) return "(帯が無い)";
    const q = b2.getBoundingClientRect();
    const el = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
    return el && el.id === "vqCall" ? "押せる" : "届かない:" + (el && (el.id || el.tagName));
  });
  見(帯が押せる === "押せる", "P-2f 畳んだ 帯じたいは 押せる", 帯が押せる);

  節("段② 写した 中身が いまの 画面か");

  /* P-4 写す */
  await a.page.evaluate(() => {
    const t = document.querySelector('#appTabBar [data-app-tab="library"]');
    if (t) t.click();
  });
  await 待(2500);
  let 写 = await a.page.evaluate(() => window.__vqCall.画面を写す());
  見(写 && 写.tab === "library", "P-4a いまの タブを 写している", 写 && { tab: 写.tab, where: 写.where });
  見(写 && 写.lines && 写.lines.length > 0, "P-4b 画面の 文を 拾えている",
     写 && 写.lines && 写.lines.slice(0, 4));
  見(写 && !写.lines.some((x) => /^(school|timer|arrow_back|home|menu|search|close)$/.test(x)),
     "P-4c アイコンの 字（school 等）を 拾っていない", 写 && 写.lines && 写.lines.slice(0, 8));
  見(写 && 写.go && 写.go.tab === "library", "P-4d 行き先が 付く", 写 && 写.go);

  /* P-5 タブを 移ると 変わる */
  await a.page.evaluate(() => {
    const t = document.querySelector('#appTabBar [data-app-tab="news"]');
    if (t) t.click();
  });
  await 待(2500);
  const 写2 = await a.page.evaluate(() => window.__vqCall.画面を写す());
  見(写2 && 写2.tab === "news" && 写2.where !== (写 && 写.where),
     "P-5 タブを 移ると 写した 中身も 変わる",
     { 前: 写 && 写.where, 後: 写2 && 写2.where });

  節("段③ 相手に 見えているか");

  await 待(3000);
  let 同B = await 同席(b.page);
  見(同B.受けている === true, "P-6a 相手が 受け取っている", 同B);
  見(!!同B.最新 && !!同B.最新.where, "P-6b 相手の 手元に 画面が 届いている",
     同B.最新 && { where: 同B.最新.where, 行: (同B.最新.lines || []).length });
  /* ★ 空の 帯を 相手に 出さない（Insights で 0 行 だったのが 実際に あった） */
  見(!!同B.最新 && (同B.最新.lines || []).length > 0,
     "P-6b2 中身（画面の 文）が 空で ない", 同B.最新 && (同B.最新.lines || []).slice(0, 4));
  /* 帯の 中の 字だけ 見る（style の 中身は 数えない） */
  const 帯の字 = await b.page.evaluate(() => {
    const r = document.getElementById("vqCall").shadowRoot;
    const co = r.querySelector(".co");
    return co ? (co.textContent || "").replace(/\s+/g, " ").trim() : "";
  });
  見(/の 画面/.test(帯の字), "P-6c 同席の 帯が 出ている", 帯の字.slice(0, 180));
  見(同B.畳んだ === true, "P-6d 受け取ると 相手側も 自動で 畳む", 同B);

  /* P-7 追従 */
  const 相手のタブ = await b.page.evaluate(() => document.body.getAttribute("data-app-tab"));
  見(相手のタブ === "news", "P-7 相手が 同じ タブへ 自動で 移る（追従）",
     { 相手: 相手のタブ, こちら: 写2 && 写2.tab });

  /* P-8 追従を やめる */
  await 押す(b.page, "co-follow");
  await 待(600);
  同B = await 同席(b.page);
  見(同B.追う === false, "P-8a 追従を やめられる", 同B);
  await a.page.evaluate(() => {
    const t = document.querySelector('#appTabBar [data-app-tab="library"]');
    if (t) t.click();
  });
  await 待(3200);
  const 追わない = await b.page.evaluate(() => document.body.getAttribute("data-app-tab"));
  見(追わない === "news", "P-8b やめた あとは ついて 行かない", 追わない);
  /* 押して 移る */
  await 押す(b.page, "co-go");
  await 待(1200);
  const 押して移る = await b.page.evaluate(() => document.body.getAttribute("data-app-tab"));
  見(押して移る === "library", "P-8c「同じ 画面へ」で 移れる", 押して移る);

  節("段④ 幅 375px で 崩れないか");

  const 形 = await b.page.evaluate(() => {
    const h = document.getElementById("vqCall");
    const r = h.shadowRoot;
    const p = r.querySelector(".pill"), co = r.querySelector(".co");
    const 右 = (e) => e ? Math.round(e.getBoundingClientRect().right) : 0;
    const 左 = (e) => e ? Math.round(e.getBoundingClientRect().left) : 0;
    const 押 = Array.from(r.querySelectorAll(".mb,.tb")).map((x) => {
      const b2 = x.getBoundingClientRect();
      return Math.round(Math.min(b2.width, b2.height));
    });
    return { 幅: innerWidth, 帯右: 右(p), 帯左: 左(p), 札右: 右(co), 押: 押,
             横スクロール: document.documentElement.scrollWidth > innerWidth + 1 };
  });
  見(形.帯右 <= 形.幅 && 形.帯左 >= 0, "P-11a 帯が 横に はみ出さない", 形);
  見(形.札右 <= 形.幅, "P-11b 同席の 札が 横に はみ出さない", 形);
  見(!形.横スクロール, "P-11c 横に スクロールしない", 形);
  見(形.押.length > 0 && Math.min.apply(null, 形.押) >= 44,
     "P-11d 押すところが 44px 以上", 形.押);

  節("段⑤ 止める・終わる");

  /* P-3 畳んだ 帯から ミュート */
  await 押す(a.page, "mute");
  await 待(400);
  sa = await 状態(a.page);
  見(sa.画面 === "通話中", "P-3a 畳んだ ままで ミュートできる", sa);
  await 押す(a.page, "mute");

  /* P-3b 戻す */
  await 押す(a.page, "unfold");
  await 待(500);
  同A = await 同席(a.page);
  見(同A.畳んだ === false && 同A.出している === true,
     "P-3b 戻しても 同席は 続く", 同A);
  await 押す(a.page, "fold");
  await 待(400);

  /* P-9 やめると 相手の 帯が 消える */
  await 押す(a.page, "share-off");
  await 待(2000);
  同A = await 同席(a.page);
  同B = await 同席(b.page);
  見(同A.出している === false, "P-9a やめられる", 同A);
  見(同B.受けている === false && !同B.最新, "P-9b 相手の 帯が 消える", 同B);

  /* P-12 映像を 一切 取っていない */
  const 映像 = await a.page.evaluate(() => {
    return {
      画面取り: typeof navigator.mediaDevices?.getDisplayMedia,
      映像トラック: (function () {
        let n = 0;
        try {
          document.querySelectorAll("video").forEach((v) => {
            if (v.srcObject && v.srcObject.getVideoTracks) n += v.srcObject.getVideoTracks().length;
          });
        } catch (e) {}
        return n;
      })()
    };
  });
  見(映像.映像トラック === 0, "P-12 映像は 1 本も 取っていない（アプリの 外は 写らない）", 映像);

  /* P-10 通話が 終わると 同席も 止まる */
  await 押す(a.page, "share");
  await 待(1800);
  await 押す(a.page, "hangup");
  await 待(3000);
  同A = await 同席(a.page);
  同B = await 同席(b.page);
  見(同A.出している === false && 同A.畳んだ === false,
     "P-10a 切ると 同席も 畳みも 戻る", 同A);
  見(同B.受けている === false, "P-10b 相手側も 戻る", 同B);

  見(例外.length === 0, "赤い字（例外）が 出ていない", 例外.slice(0, 4));

  await browser.close();
  console.log("\n────────────────────────────");
  console.log("通った: " + 済 + " / 落ちた: " + 落);
  if (落ち.length) console.log("落ちたもの:\n  - " + 落ち.join("\n  - "));
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error("止まりました:", e); process.exit(1); });
