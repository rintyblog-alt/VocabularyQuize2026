/* ══════════════════════════════════════════════════════════════════════
   AI Activity — 端末の台帳とサーバの台帳が揃うかの確認（実ブラウザ・開発環境）

   確かめること:
     ・仕事を始めるとサーバ側にも 1 件できる
     ・段が進むとサーバ側の進捗も動く（**段の数からしか動かない**）
     ・終わるとサーバ側も終わる。途中結果も届く
     ・ブラウザを閉じて開き直しても、サーバから取り戻せる
     ・別の端末（別のブラウザ）から、同じ人の仕事が見える
     ・ログインしていないときは、今までどおり端末の中だけで動く（止まらない）

   使い方: node vqaijobsync.cjs
   ══════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const BASE = process.env.VQ_API || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => { c ? (pass++, console.log("  ok   " + n))
  : (fail++, bad.push(n), console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 300) : ""))); };
const section = (t) => console.log("\n══ " + t + " ══");
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function api(method, path, body, token) {
  const h = { "Content-Type": "application/json" };
  if (token) h.Authorization = "Bearer " + token;
  const r = await fetch(BASE + path, { method, headers: h,
    body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text();
  let d = null; try { d = t ? JSON.parse(t) : null; } catch (e) { d = { raw: t.slice(0, 160) }; }
  return { status: r.status, data: d || {} };
}

(async () => {
  console.log("接続先: " + BASE + "（開発環境）");
  const nick = "sync" + Date.now().toString(36).slice(-6);
  const reg = await api("POST", "/api/auth/register",
    { gradePrefix: "H1", nickname: nick, password: "DevSync#2026a", tosAccepted: true, tosVersion: "1" });
  if (!reg.data.token) { console.error("検証アカウントを作れません:", reg.data); process.exit(1); }
  const token = reg.data.token;
  console.log("検証アカウント: " + nick);

  const browser = await chromium.launch();
  const open = async (withToken) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const pg = await ctx.newPage();
    if (withToken) {
      await pg.addInitScript((t) => {
        localStorage.setItem("app.auth.token.v1", t);
        localStorage.setItem("app.auth.mode.v1", "user");
      }, token);
    }
    await pg.goto(BASE + "/index.html?vq2=all", { waitUntil: "domcontentloaded", timeout: 60000 });
    await pg.waitForFunction(() => window.VQ2 && window.VQ2.aijob, { timeout: 40000 });
    await pg.evaluate(() => { const o = document.getElementById("firstLaunchOverlay"); if (o) o.style.display = "none"; });
    return { ctx, pg };
  };

  section("始めるとサーバにも 1 件できる");
  const a = await open(true);
  const started = await a.pg.evaluate(() => {
    const J = window.VQ2.aijob;
    const r = J.start({
      jobType: "mock_generation", title: "Quick Mock を作成中",
      startKey: "sync-test-1",
      steps: ["資料を解析", "重要ポイントを抽出", "問題を生成", "問題を検証", "不足問題を修正", "最終確認"]
    });
    return { id: r.job.id, enabled: J.sync.enabled() };
  });
  ok("台帳の写しが有効（ログイン済み）", started.enabled === true, started);
  await sleep(2500);
  const l1 = await api("GET", "/api/aijob/list?limit=10", undefined, token);
  ok("★サーバ側にも 1 件できている", (l1.data?.jobs || []).length === 1, (l1.data?.jobs || []).length);
  const remote = (l1.data?.jobs || [])[0] || {};
  ok("題名が届いている", remote.title === "Quick Mock を作成中", remote.title);
  ok("段が 6 つ届いている", (remote.stages || []).length === 6, (remote.stages || []).length);

  section("段が進むと、サーバの進捗も動く");
  await a.pg.evaluate((id) => {
    const J = window.VQ2.aijob;
    J.step(id, "資料を解析");
    J.step(id, "重要ポイントを抽出");
    J.step(id, "問題を生成");
  }, started.id);
  await sleep(2600);
  const g1 = await api("GET", "/api/aijob/get?id=" + encodeURIComponent(remote.jobId), undefined, token);
  const p1 = g1.data?.job?.progress || 0;
  ok("★進捗が段の数どおりに動く（2/6 = 0.333）", Math.abs(p1 - 2 / 6) < 0.001, p1);
  ok("いまの段が届いている", g1.data?.job?.currentStage === "問題を生成", g1.data?.job?.currentStage);
  ok("実行中になっている", g1.data?.job?.status === "running", g1.data?.job?.status);

  section("途中結果と、終わり");
  await a.pg.evaluate((id) => {
    const J = window.VQ2.aijob;
    J.keepPartial(id, { questions: [{ id: "q1" }, { id: "q2" }, { id: "q3" }] }, { counts: { done: 3, total: 20 } });
  }, started.id);
  await sleep(2200);
  const g2 = await api("GET", "/api/aijob/get?id=" + encodeURIComponent(remote.jobId), undefined, token);
  ok("★途中結果がサーバにも残る", (g2.data?.job?.partial?.questions || []).length === 3, g2.data?.job?.partial);
  ok("できた数が届いている", g2.data?.job?.made === 3, g2.data?.job?.made);

  await a.pg.evaluate((id) => {
    window.VQ2.aijob.fail(id, null, { code: "TIMEOUT", message: "時間切れ" });
  }, started.id);
  await sleep(2200);
  const g3 = await api("GET", "/api/aijob/get?id=" + encodeURIComponent(remote.jobId), undefined, token);
  ok("★失敗しても途中結果は消えない", (g3.data?.job?.partial?.questions || []).length === 3, g3.data?.job?.partial);
  ok("できたぶんがあるので partial で終わる", g3.data?.job?.status === "partial", g3.data?.job?.status);
  ok("理由が残る", g3.data?.job?.error?.code === "TIMEOUT", g3.data?.job?.error);

  section("別の端末から見える");
  const b = await open(true);
  const pulled = await b.pg.evaluate(() => window.VQ2.aijob.sync.pull({ limit: 10 }));
  ok("取り込みが成功する", pulled?.ok === true, pulled);
  ok("★別の端末に、同じ人の仕事が現れる", (pulled?.added || 0) >= 1, pulled);
  const seen = await b.pg.evaluate(() =>
    window.VQ2.aijob.list({}).filter((j) => j.fromOtherDevice).map((j) => ({ t: j.title, s: j.status, n: (j.partial && j.partial.questions || []).length })));
  ok("題名・状態・できた数まで見える",
    seen.length >= 1 && seen[0].t === "Quick Mock を作成中" && seen[0].n === 3, seen);

  section("同じ操作を 2 回押しても 1 件");
  await b.pg.evaluate(() => {
    const J = window.VQ2.aijob;
    J.start({ jobType: "preset_generation", title: "二重テスト", startKey: "dup-key-1", steps: ["a", "b"] });
  });
  await sleep(2000);
  await b.pg.evaluate(() => {
    /* 端末側の重複判定を通り抜けさせるため、いったん終わらせてから同じ鍵で押す。
       ここでサーバが 1 件に畳めるかを見る。 */
    const J = window.VQ2.aijob;
    const j = J.list({}).filter((x) => x.startKey === "dup-key-1")[0];
    if (j) J.done(j.id, {});
    J.start({ jobType: "preset_generation", title: "二重テスト（2回目）", startKey: "dup-key-1", steps: ["a", "b"] });
  });
  await sleep(2600);
  const l2 = await api("GET", "/api/aijob/list?limit=20", undefined, token);
  const dups = (l2.data?.jobs || []).filter((j) => /二重テスト/.test(j.title || ""));
  ok("★同じ鍵はサーバ側で 1 件に畳まれる", dups.length === 1, dups.map((d) => d.title));

  section("ログインしていなくても止まらない");
  const c = await open(false);
  const noAuth = await c.pg.evaluate(() => {
    const J = window.VQ2.aijob;
    const r = J.start({ jobType: "preset_generation", title: "ログイン無し", steps: ["a", "b"] });
    J.step(r.job.id, "a");
    return { enabled: J.sync.enabled(), status: J.get(r.job.id).status, progress: J.get(r.job.id).progress };
  });
  ok("写しは無効になる", noAuth.enabled === false, noAuth);
  ok("★それでも端末の中では今までどおり動く", noAuth.status === "running", noAuth);

  const errs = await a.pg.evaluate(() => window.__vqErrs || null);
  ok("画面のエラーが無い", errs === null || (errs || []).length === 0, errs);

  console.log("\n  合格 " + pass + " / 不合格 " + fail);
  if (bad.length) console.log("  直すところ:\n    - " + bad.join("\n    - "));
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("実行できませんでした:", e); process.exit(1); });
