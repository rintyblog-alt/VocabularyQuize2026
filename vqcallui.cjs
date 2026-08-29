/* ══════════════════════════════════════════════════════════════════════════
   vqcallui.cjs — 音声通話の **画面**を 実物で 見る。

   測るところ:
     W-1  合図の 通り道（WebSocket）で **着信が 押し出されて くる**
          （画面が 何秒かごとに 聞きに行くのでは ない）
     W-2  出ると 両方が 通話中に なる
     W-3  切ると 両方が 閉じる
     C-6  タブを 閉じると SFU の 部屋が 閉じる
     C-8  375px で 崩れない（横に はみ出さない・押すところが 44px 以上）
     U-1  同意の 画面が 先に 出る（同意していない 人）
     U-2  通話中に 通報の ボタンが 見えている
     U-3  タブを 閉じると 切れる ことを 断っている

   使い方: VQ_BASE=<dev> node vqcallui.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) {
  console.error("本番では実行しません。"); process.exit(2);
}
const { chromium } = require("playwright");
const { execSync } = require("child_process");
let 済 = 0, 落 = 0;
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 200) : "")); }
  else { 落++; console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 400) : "")); }
};
const 待 = (ms) => new Promise((s) => setTimeout(s, ms));
const j = (r) => r.json().catch(() => ({}));

async function 作る(名) {
  const 印 = Date.now().toString(36) + Math.floor(Math.random() * 9999);
  const r = await fetch(BASE + "/api/auth/register/start", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "vqu" + 印 + "@gmail.com", gradePrefix: "H2",
      nickname: (名 + 印).slice(0, 14), password: "Passw0rd!z3" }) }).then(j);
  const v = await fetch(BASE + "/api/auth/register/verify", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeId: r.challengeId, code: r.devCode }) }).then(j);
  const c = await fetch(BASE + "/api/auth/register/consent", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ registrationSession: v.registrationSession, agreeTerms: true,
      agreePrivacy: true, agreeAge: true, pin: "1379" }) }).then(j);
  if (!c.token) throw new Error("札が 取れない");
  return { token: c.token, uid: Number(c.user && c.user.id) };
}
async function api(path, tok, opts = {}) {
  const h = { "Content-Type": "application/json" };
  if (tok) h.Authorization = "Bearer " + tok;
  const r = await fetch(BASE + path, { method: opts.method || "GET", headers: h,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  return { status: r.status, j: await j(r) };
}
function d1(sql) {
  const out = execSync(
    "cd server && npx wrangler d1 execute vocabuquiz_auth_dev --remote --config wrangler.dev.toml"
    + " --json --command " + JSON.stringify(sql),
    { encoding: "utf8", maxBuffer: 20 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
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

(async () => {
  console.log("測る先:", BASE);
  const A = await 作る("uA"); await 待(900);
  const B = await 作る("uB");
  await api("/api/follow/toggle", A.token, { method: "POST", body: { targetUserId: B.uid, follow: true } });
  await api("/api/follow/toggle", B.token, { method: "POST", body: { targetUserId: A.uid, follow: true } });
  console.log("A =", A.uid, "/ B =", B.uid);

  const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });

  /* ── U-1 同意の 画面 ── */
  console.log("\n══ 同意の 画面 ══");
  let a = await 開く(browser, A.token);
  const 例外 = [];
  a.page.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 200)));
  await a.page.evaluate((id) => window.__vqCall.かける(id), B.uid);
  await 待(1800);
  let s = await 状態(a.page);
  見(s.画面 === "同意", "U-1 同意していなければ **同意の 画面が 先**に 出る", s);
  const 文 = await a.page.evaluate(() => {
    const h = document.getElementById("vqCall");
    return h && h.shadowRoot ? (h.shadowRoot.textContent || "").replace(/\s+/g, " ") : "";
  });
  見(/相互フォロー/.test(文) && /音声は 保存しません/.test(文) && /通報/.test(文) && /Lumi/.test(文),
    "U-1b 同意の 文に 決めごとが 書いてある");
  見(!/年齢|生年月日/.test(文), "U-1c 年齢の 確認は 出さない（指示どおり）");

  /* 同意して 進む */
  await a.page.evaluate(() => {
    const r = document.getElementById("vqCall").shadowRoot;
    r.querySelector('[data-a="consent-yes"]').click();
  });
  await 待(2200);
  s = await 状態(a.page);
  見(s.画面 === "発信中" || s.画面 === "", "U-1d 同意すると そのまま 発信へ 進む", s);
  /* B が まだ 同意していないので 断られる（画面に 出る） */
  const 断り = await a.page.evaluate(() => {
    const r = document.getElementById("vqCall").shadowRoot;
    const e = r.querySelector(".err");
    return e ? e.textContent : "";
  });
  見(/相手/.test(断り || ""), "U-1e 相手が 未同意なら 断られ、その 訳が 出る", 断り);
  await a.ctx.close();

  /* ── W-1〜W-3 合図の 通り道 ── */
  console.log("\n══ 合図の 通り道（WebSocket）══");
  await api("/api/call/consent", A.token, { method: "POST", body: { agree: true } });
  await api("/api/call/consent", B.token, { method: "POST", body: { agree: true } });
  a = await 開く(browser, A.token);
  const b = await 開く(browser, B.token, 375);   /* B は スマホの 幅で 見る（C-8） */
  a.page.on("pageerror", (e) => 例外.push("A:" + String(e.message).slice(0, 200)));
  b.page.on("pageerror", (e) => 例外.push("B:" + String(e.message).slice(0, 200)));
  await 待(2500);

  const t0 = Date.now();
  await a.page.evaluate((id) => window.__vqCall.かける(id), B.uid);
  /* ★ **押し出しで 来るか**を 見る。ポーリングなら 3 秒以上 かかる。 */
  let 着いた = 0;
  for (let i = 0; i < 40; i++) {
    const sb = await 状態(b.page);
    if (sb.画面 === "着信") { 着いた = Date.now() - t0; break; }
    await 待(100);
  }
  if (!着いた) {
    console.log("  A の 状態:", JSON.stringify(await 状態(a.page)));
    console.log("  B の 状態:", JSON.stringify(await 状態(b.page)));
    console.log("  A の 画面の 文:", await a.page.evaluate(() => {
      const h = document.getElementById("vqCall");
      return h && h.shadowRoot ? (h.shadowRoot.textContent || "").replace(/\s+/g, " ").slice(0, 200) : "(無い)";
    }));
    console.log("  B の WS:", await b.page.evaluate(() => {
      return { ws: typeof WebSocket, 立ってる: !!window.__vqCallInstalled };
    }));
  }
  見(着いた > 0, "W-1 着信が 相手の 画面に 出る", 着いた + "ms");
  見(着いた > 0 && 着いた < 2500, "W-1b **押し出し**で 来ている（2.5 秒 未満）", 着いた + "ms");

  /* C-8 375px で 崩れないか */
  const 見た目 = 着いた ? await b.page.evaluate(() => {
    const r = document.getElementById("vqCall").shadowRoot;
    const w = r.querySelector(".w");
    const 押 = Array.from(r.querySelectorAll("button")).map((x) => {
      const q = x.getBoundingClientRect();
      return { a: x.dataset.a || "", w: Math.round(q.width), h: Math.round(q.height) };
    });
    const q = w.getBoundingClientRect();
    return {
      幅: Math.round(q.width), 右: Math.round(q.right), 画面幅: window.innerWidth,
      横に伸びた: document.documentElement.scrollWidth > window.innerWidth + 1,
      押: 押
    };
  }) : { 幅: 0, 右: 0, 画面幅: 375, 横に伸びた: false, 押: [] };
  console.log("  375px の 着信:", JSON.stringify(見た目));
  見(!見た目.横に伸びた && 見た目.右 <= 見た目.画面幅 + 1,
    "C-8 375px で 横に はみ出さない", 見た目);
  見(見た目.押.length > 0 && 見た目.押.every((x) => x.w >= 44 && x.h >= 44),
    "C-8b 押すところは すべて 44×44 以上", 見た目.押);
  await b.page.screenshot({ path: (process.argv[2] || ".") + "/call-ring-375.png" });

  /* W-2 出る */
  await b.page.evaluate(() => {
    document.getElementById("vqCall").shadowRoot.querySelector('[data-a="accept"]').click();
  });
  await 待(3000);
  const sa = await 状態(a.page), sb2 = await 状態(b.page);
  見(sa.画面 === "通話中" && sb2.画面 === "通話中", "W-2 出ると 両方が 通話中に なる", { A: sa, B: sb2 });
  見(!!sa.sfu && !!sb2.sfu, "W-2b 両方が SFU の 部屋を 取っている（P2P では ない）",
    { A: sa.sfu, B: sb2.sfu });

  /* U-2 / U-3 通話中の 画面 */
  const 中身 = await a.page.evaluate(() => {
    const r = document.getElementById("vqCall").shadowRoot;
    return {
      文: (r.textContent || "").replace(/\s+/g, " "),
      ボタン: Array.from(r.querySelectorAll("button")).map((x) => x.dataset.a || "")
    };
  });
  見(中身.ボタン.indexOf("report") >= 0, "U-2 通話中に 通報の ボタンが 見えている", 中身.ボタン);
  見(中身.ボタン.indexOf("mute") >= 0 && 中身.ボタン.indexOf("hangup") >= 0
    && 中身.ボタン.indexOf("lumi") >= 0, "U-2b ミュート・切る・Lumi も ある", 中身.ボタン);
  見(/タブを 閉じる/.test(中身.文) && /ロック/.test(中身.文),
    "U-3 タブを 閉じる・ロックで 切れる ことを 断っている");
  await a.page.screenshot({ path: (process.argv[2] || ".") + "/call-talking.png" });
  await b.page.screenshot({ path: (process.argv[2] || ".") + "/call-talking-375.png" });

  const callId = sa.callId;

  /* C-6 タブを 閉じる → SFU の 部屋が 閉じる。
     ★ 画面の pagehide 頼みには しない（タブごと 消えると 届かない ことが ある）。
       合図の 通り道（WebSocket）が 切れた ことを **サーバが** 見て 始末する。
       12 秒 待って から 始末する ので、ここは 18 秒 待つ。 */
  await b.ctx.close();
  console.log("  タブを 閉じました。18 秒 待ちます…");
  await 待(18000);
  const 行 = d1("SELECT state, caller_session, callee_session FROM calls WHERE call_id='" + callId + "'");
  console.log("  タブを 閉じた あとの 行:", JSON.stringify(行[0]));
  見(行[0] && String(行[0].state) === "ended"
    && String(行[0].caller_session || "") === "" && String(行[0].callee_session || "") === "",
    "C-6 タブを 閉じると 通話が 終わり、SFU の 部屋が 残らない", 行[0]);

  /* W-3 A 側も 閉じる */
  const s3 = await 状態(a.page);
  見(s3.画面 !== "着信", "W-3 相手が 消えたら 着信の ままには ならない", s3);
  const 画面 = await 状態(a.page);
  見(画面.画面 !== "通話中" || 画面.callId === "", "W-3b 相手が 消えたら こちらの 画面も 通話中の ままに ならない", 画面);

  見(例外.length === 0, "画面の 例外 0 件", 例外.slice(0, 4));

  await browser.close();
  console.log(`\n────────────────────────────────`);
  console.log(`  ok ${済} / NG ${落}`);
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error("✗ 途中で 落ちた:", e && (e.stack || e)); process.exit(1); });
