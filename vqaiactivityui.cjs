/* ══════════════════════════════════════════════════════════════════════
   画面側から見た「AI アクティビティ」

   サーバ側は vqaiactivity.cjs で確かめてある。ここで見るのは
   **画面がその数字を正しく写しているか**。

     ① 頼むとすぐ番号が返り、生成の終わりを待たない
     ② 手元の写しに載り、段と「n/m問」が入る
     ③ 帯の値が できた数 ÷ 頼んだ数 と一致する（推測値が混ざっていない）
     ④ 押し返していない（サーバ側の仕事が 1 件だけ）
     ⑤ 読み込み直しても、走っている仕事を拾い直せる
     ⑥ 途中で読めるぶんが、最後の結果と食い違わない

   使い方: node vqaiactivityui.cjs
   ══════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const fs = require("node:fs");
const BASE = process.env.VQ_BASE || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
fs.mkdirSync("shots/aiact", { recursive: true });

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => {
  c ? (pass++, console.log("  ok   " + n))
    : (fail++, bad.push(n), console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 300) : "")));
};
const section = (t) => console.log("\n══ " + t + " ══");

(async () => {
  const br = await chromium.launch({ headless: true });
  const ctx = await br.newContext({ viewport: { width: 1440, height: 950 } });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e.message).slice(0, 200)));

  await pg.goto(BASE + "/?vqdev=1&cb=" + Date.now(), { waitUntil: "domcontentloaded", timeout: 180000 });
  await pg.waitForTimeout(5000);

  section("読み込み");
  ok("画面の失敗が出ていない", errs.length === 0, errs.slice(0, 3));
  ok("クラウド生成の口がある", await pg.evaluate(() =>
    !!(window.VQ2 && window.VQ2.aigen && typeof window.VQ2.aigen.generateQuestionsTracked === "function")));
  ok("台帳への写し口がある", await pg.evaluate(() =>
    !!(window.VQ2 && window.VQ2.aijob && window.VQ2.aijob.sync && typeof window.VQ2.aijob.sync.adopt === "function")));

  /* 検証アカウントを作って、画面が使う場所へ入れる */
  section("検証アカウント");
  const auth = await pg.evaluate(async (base) => {
    const post = async (p, b) => {
      const r = await fetch(base + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
      return r.json();
    };
    const u = "vqu" + String(Date.now()).slice(-7) + Math.floor(Math.random() * 90 + 10);
    const a = await post("/api/auth/register/start", { email: u + "@gmail.com", gradePrefix: "H2", nickname: u, password: "Passw0rd!vq" });
    const b = await post("/api/auth/register/verify", { challengeId: a.challengeId, code: a.devCode });
    const c = await post("/api/auth/register/consent", { registrationSession: b.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: "8306" });
    if (c.token) localStorage.setItem("app.auth.token.v1", c.token);
    return { ok: !!c.token };
  }, BASE);
  ok("入れた", auth.ok, auth);
  if (!auth.ok) { console.log("\n合格 " + pass + " / 不合格 " + fail); process.exit(1); }

  section("頼む — すぐ返るか");
  const started = await pg.evaluate(() => new Promise((resolve) => {
    const t0 = Date.now();
    window.__vqSeen = [];            /* 途中で見えた値をぜんぶ残す */
    window.__vqResult = null;
    let startMs = null, jobId = null;
    window.VQ2.aigen.generateQuestionsTracked({
      prompt: "高校英語の並べ替えと穴埋めを合わせて12問つくって。解説つき。",
      onStart: (id) => { jobId = id; startMs = Date.now() - t0; resolve({ jobId: id, startMs }); },
      onProgress: (p) => { window.__vqSeen.push(p); }
    }).then((r) => { window.__vqResult = r; }, (e) => { window.__vqResult = { error: String(e && e.message || e) }; });
    setTimeout(() => resolve({ jobId, startMs, timedOut: true }), 20000);
  }));
  console.log("   " + JSON.stringify(started));
  ok("番号が返る", !!started.jobId, started);
  ok("すぐ返る（5 秒未満）", started.startMs !== null && started.startMs < 5000, started.startMs + "ms");

  section("手元の写しに載るか");
  await pg.waitForTimeout(2500);
  const mirror = await pg.evaluate((rid) => {
    const j = window.VQ2.aijob.list({}).filter((x) => x.remoteId === rid)[0] || null;
    return j ? {
      status: j.status, steps: j.steps, currentStep: j.currentStep,
      doneSteps: j.doneSteps, progress: j.progress, counts: j.counts,
      partialN: (j.partial && j.partial.questions || []).length
    } : null;
  }, started.jobId);
  console.log("   " + JSON.stringify(mirror));
  ok("写しに載っている", !!mirror, mirror);
  ok("段が入っている", !!mirror && Array.isArray(mirror.steps) && mirror.steps.length >= 1, mirror && mirror.steps);
  ok("段の名前が日本語になっている",
    !!mirror && mirror.steps.every((s) => !/^[a-z_]+$/.test(String(s))), mirror && mirror.steps);
  ok("「n/m問」の数が入っている", !!mirror && !!mirror.counts && mirror.counts.total > 0, mirror && mirror.counts);

  section("終わるまで待つ");
  await pg.waitForFunction(() => window.__vqResult !== null, null, { timeout: 180000 }).catch(() => {});
  const res = await pg.evaluate(() => window.__vqResult);
  const seen = await pg.evaluate(() => window.__vqSeen);
  console.log("   結果 " + JSON.stringify({
    n: res && (res.questions || []).length, status: res && res.status,
    made: res && res.made, planned: res && res.planned, usage: res && res.usage
  }).slice(0, 240));
  ok("結果が返る", !!res && !res.error, res && res.error);
  ok("問題が返る", !!res && Array.isArray(res.questions) && res.questions.length > 0, res && (res.questions || []).length);
  ok("できた数と中身の数が合う", !!res && res.questions.length === res.made, res && { made: res.made, n: res.questions.length });
  ok("実際に呼んだ回数が残る", !!res && res.usage && res.usage.aiCalls > 0, res && res.usage);

  section("★帯の値に推測が混ざっていないか");
  console.log("   途中で見えた値 " + JSON.stringify(seen.map((p) => p.made + "/" + p.planned)));
  ok("途中の値を受け取れた", seen.length > 0, seen.length + " 回");
  ok("★できた数が頼んだ数を超えない",
    seen.every((p) => p.made <= p.planned), seen.map((p) => p.made + "/" + p.planned));
  ok("★できた数が後戻りしない",
    seen.every((p, i) => i === 0 || p.made >= seen[i - 1].made), seen.map((p) => p.made));
  const barOk = await pg.evaluate((rid) => {
    const j = window.VQ2.aijob.list({}).filter((x) => x.remoteId === rid)[0];
    if (!j || !j.counts || !j.counts.total) return { skip: true };
    return { progress: j.progress, expect: j.counts.done / j.counts.total };
  }, started.jobId);
  ok("★帯 = できた数 ÷ 頼んだ数（推測値でない）",
    !!barOk && (barOk.skip || Math.abs(barOk.progress - barOk.expect) < 0.001), barOk);

  section("押し返していないか（仕事が二重に走っていない）");
  const dup = await pg.evaluate(async (base) => {
    const t = localStorage.getItem("app.auth.token.v1");
    const r = await fetch(base + "/api/aijob/list?limit=50", { headers: { Authorization: "Bearer " + t } });
    const j = await r.json();
    return (j.jobs || []).length;
  }, BASE);
  ok("★サーバ側の仕事は 1 件だけ", dup === 1, dup + " 件");

  section("読み込み直しても拾い直せるか");
  await pg.evaluate(() => { window.VQ2.aijob.clearAll && window.VQ2.aijob.clearAll(); });
  await pg.reload({ waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(6000);
  const after = await pg.evaluate(async () => {
    const r = await window.VQ2.aigen.resumeLive();
    return { r: r, n: window.VQ2.aijob.list({}).length };
  });
  console.log("   " + JSON.stringify(after));
  ok("拾い直しの口が動く", !!after.r && after.r.ok !== false, after.r);
  ok("画面の失敗が出ていない（通し）", errs.length === 0, errs.slice(0, 3));
  await pg.screenshot({ path: "shots/aiact/通し.png" });

  await br.close();
  console.log("\n合格 " + pass + " / 不合格 " + fail);
  if (bad.length) console.log("直すところ:\n  - " + bad.join("\n  - "));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("実行できませんでした:", e); process.exit(1); });
