/* ══════════════════════════════════════════════════════════════════════════
   vqloading.cjs — 全画面の「読み込み中」が **勝手に 出ない** ことを 確かめる

   直したもの:
     ・通知の 取り直し（60 秒おき・窓に 戻るたび・ホームを 開くたび）が
       showLoading() を 呼んでいたので、**どの画面に いても 1 分おきに
       全画面の 液体ローディングが 出ていた**。プリセット一覧で 実測すると
       63.5 秒・123.5 秒ちょうどに 出る、という 形で 再現した。
     ・対戦の マッチング待ち（2 秒おき）も 同じ 覆いを 出していた。
     ・数え上げなので、返らない 約束が 1 つ あると 覆いが 外れなくなる
       （人には「リロードするしかない」としか 見えない）。

   ここで 測ること:
     ① 何も 触らずに 150 秒 → 覆いは 一度も 出ない
     ② それでも 通知の 見張りは 生きている（API を 叩いている）
     ③ 人が 頼んだ ときの 覆いは これまで どおり 出る・消える
     ④ 外れなくなっても 45 秒で 自分で 外れる
     ⑤ 窓に 戻る たびに 取り直さない（間を あける）
     ⑥ 対戦の 2 秒おきの 見張りは 覆いを 出さない（元の 字で 確かめる）

   本番では 走らせない。
   ══════════════════════════════════════════════════════════════════════════ */
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const { chromium } = require("playwright");
const fs = require("node:fs");

let 済 = 0, 落 = 0; const 印 = [];
function ok(名, 真, 補) {
  if (真) { 済++; 印.push("  ✅ " + 名 + (補 ? "  " + 補 : "")); }
  else { 落++; 印.push("  ❌ " + 名 + (補 ? "  " + 補 : "")); }
}
function 節(t) { 印.push("\n── " + t + " " + "─".repeat(Math.max(0, 52 - t.length))); }

async function req(path, { method = "GET", body, token } = {}) {
  const h = { "content-type": "application/json" };
  if (token) h.authorization = "Bearer " + token;
  const r = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, j: await r.json().catch(() => ({})) };
}
async function 作る() {
  const tag = "vqld" + Date.now().toString(36);
  const s = await req("/api/auth/register/start", { method: "POST",
    body: { email: `${tag}@gmail.com`, gradePrefix: "H2", nickname: tag, password: "Testing!2345" } });
  const v = await req("/api/auth/register/verify", { method: "POST",
    body: { challengeId: s.j.challengeId, code: s.j.devCode } });
  const c = await req("/api/auth/register/consent", { method: "POST",
    body: { registrationSession: v.j.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: "482913" } });
  if (!c.j.token) throw new Error("登録できません: " + JSON.stringify(c.j).slice(0, 200));
  return c.j.token;
}

/* 覆いの 出入りを 記録する 見張りを 画面の 中に 置く */
const 見張りを置く = () => {
  const ov = document.getElementById("globalLoadingOverlay");
  window.__ovLog = [];
  const t0 = performance.now();
  let 前 = !ov.classList.contains("hidden");
  const 見る = () => {
    const 出 = !ov.classList.contains("hidden");
    if (出 === 前) return;
    前 = 出;
    window.__ovLog.push({ ms: Math.round(performance.now() - t0), 出, 画面: document.body.dataset.appTab || "" });
  };
  new MutationObserver(見る).observe(ov, { attributes: true, attributeFilter: ["class"] });
  /* 骨組み（ホームの shimmer）も 同じ 輪で 出る。こちらも 見ておく。 */
  window.__sklLog = [];
  new MutationObserver(() => {
    const 出 = document.body.classList.contains("vqskl-on");
    const 前 = window.__sklLog.length ? window.__sklLog[window.__sklLog.length - 1].出 : false;
    if (出 !== 前) window.__sklLog.push({ ms: Math.round(performance.now() - t0), 出 });
  }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
};

(async () => {
  const token = await 作る();
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  const p = await ctx.newPage();
  const 画面の失敗 = [];
  p.on("pageerror", (e) => 画面の失敗.push(String(e.message).slice(0, 160)));
  let 通知API = 0;
  p.on("request", (r) => { if (/\/api\/user\/notifications/.test(r.url())) 通知API++; });

  await p.addInitScript(([t]) => { try { localStorage.setItem("app.auth.token.v1", t); } catch (e) {} }, [token]);
  await p.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await p.addStyleTag({ content: "#vqPin,#vqTour,#vqLumiTour{display:none!important}" }).catch(() => {});
  await p.waitForFunction(() => !!document.getElementById("globalLoadingOverlay"), null, { timeout: 30000 });
  await p.evaluate(見張りを置く);

  節("① 何も 触らずに 150 秒");
  await p.waitForTimeout(5000);
  await p.evaluate(() => { try { window.__vqQredit.goTab("library"); } catch (e) {} });
  await p.waitForTimeout(2000);
  ok("プリセット一覧に いる", await p.evaluate(() => document.body.dataset.appTab) === "library");
  await p.waitForTimeout(150000);   /* 60 秒の 見張りを 2 回 またぐ */

  const 出入り = await p.evaluate(() => window.__ovLog);
  const 出た = 出入り.filter((e) => e.出);
  ok("全画面の 覆いは 一度も 出ない", 出た.length === 0,
    出た.length ? JSON.stringify(出た) : "150 秒で 0 回");
  const 骨 = await p.evaluate(() => window.__sklLog.filter((e) => e.出));
  ok("ホームの 骨組みも 勝手に 出ない", 骨.length === 0, `${骨.length} 回`);

  節("② それでも 通知の 見張りは 生きている");
  ok("通知の API を 定期的に 叩いている", 通知API >= 2, `${通知API} 回 / 155 秒`);
  ok("画面の 失敗が 出ていない", 画面の失敗.length === 0, 画面の失敗.join(" | "));

  節("③ 人が 頼んだ ときの 覆いは 出る");
  await p.evaluate(() => window.__showGlobalLoading("共有コードを作成中…"));
  await p.waitForTimeout(150);
  ok("頼めば 出る", await p.evaluate(() =>
    !document.getElementById("globalLoadingOverlay").classList.contains("hidden")));
  ok("頼んだ 文が 出る", (await p.evaluate(() =>
    (document.getElementById("globalLoadingText") || {}).textContent || "")).includes("共有コード"));
  await p.evaluate(() => window.__hideGlobalLoading());
  await p.waitForTimeout(700);
  ok("終われば 消える", await p.evaluate(() =>
    document.getElementById("globalLoadingOverlay").classList.contains("hidden")));

  節("④ 外れなくなっても 自分で 外れる");
  const 警告 = [];
  p.on("console", (m) => { if (m.type() === "warning" && /\[loading\]/.test(m.text())) 警告.push(m.text()); });
  await p.evaluate(() => window.__showGlobalLoading("返ってこない 何か…"));  /* わざと 外さない */
  await p.waitForTimeout(1000);
  ok("いったんは 出たまま", await p.evaluate(() =>
    !document.getElementById("globalLoadingOverlay").classList.contains("hidden")));
  await p.waitForTimeout(47000);    /* 見張りは 45 秒 */
  ok("45 秒で 自分で 外れる", await p.evaluate(() =>
    document.getElementById("globalLoadingOverlay").classList.contains("hidden")));
  ok("何で 詰まったかを 記録に 残す", 警告.some((t) => /返ってこない/.test(t)), 警告.join(" | "));

  節("⑤ 窓に 戻る たびに 取り直さない");
  const 前回 = 通知API;
  for (let i = 0; i < 5; i++) {
    await p.evaluate(() => window.dispatchEvent(new Event("focus")));
    await p.waitForTimeout(400);
  }
  await p.waitForTimeout(1500);
  ok("5 回 戻っても 取り直しは 増えない", 通知API - 前回 === 0, `+${通知API - 前回} 回`);

  節("⑥ 対戦の 見張りも 覆いを 出さない");
  const 元 = fs.readFileSync("js-src/vq-core.4c23719c62.js", "utf8");
  const 対戦 = 元.slice(元.indexOf("async function _battlePollStatusOnce"), 元.indexOf("async function _battlePollStatusOnce") + 900);
  ok("2 秒おきの status は skipLoading", /battle\/status/.test(対戦) && /skipLoading:\s*true/.test(対戦));
  ok("通知の 取り直しに showLoading が 残っていない",
    !/showLoading\([^)]*通知を読み込み中/.test(元));

  await b.close();
  console.log(印.join("\n"));
  console.log(`\n  ok ${済} / NG ${落}`);
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
