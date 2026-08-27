/* ══════════════════════════════════════════════════════════════════════
   クラウド生成を「AI アクティビティ」へつないだところの確かめ

   いちばん大事なのは **作り物の進捗を出していないこと**。
   進捗は「終わった段の数 ÷ 段の数」と必ず一致していなければならない。
   時間から推し量った値が 1 つでも混ざると、ここで落ちる。

   ほかに見るところ:
     ・頼んだらすぐ返る（生成の終わりを待たない）
     ・段は形式ごとに 1 つで、注記が「n/m問」になっている
     ・できたぶんが途中から読める（離れても消えない）
     ・数が揃わなかったときに completed と書かない（partial にする）
     ・戻ってきた問題数と台帳の made が一致する

   使い方: node vqaiactivity.cjs
   ══════════════════════════════════════════════════════════════════════ */
const BASE = process.env.VQ_BASE || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const PIN = "8306", PW = "Passw0rd!vq";

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => {
  c ? (pass++, console.log("  ok   " + n))
    : (fail++, bad.push(n), console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 260) : "")));
};
const section = (t) => console.log("\n══ " + t + " ══");

async function call(p, o = {}) {
  const h = { "Content-Type": "application/json" };
  if (o.token) h.Authorization = "Bearer " + o.token;
  const r = await fetch(BASE + p, { method: o.method || "GET", headers: h, body: o.body ? JSON.stringify(o.body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { s: r.status, j: j || {} };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const u = "vqa" + String(Date.now()).slice(-7) + Math.floor(Math.random() * 90 + 10);
  const a = await call("/api/auth/register/start", { method: "POST", body: { email: u + "@gmail.com", gradePrefix: "H2", nickname: u, password: PW } });
  const b = await call("/api/auth/register/verify", { method: "POST", body: { challengeId: a.j.challengeId, code: a.j.devCode } });
  const c = await call("/api/auth/register/consent", { method: "POST", body: { registrationSession: b.j.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: PIN } });
  const tk = c.j.token;
  if (!tk) { console.error("検証アカウントを作れません", a.s, b.s, c.s); process.exit(1); }

  section("頼んだらすぐ返る（生成の終わりを待たない）");
  const t0 = Date.now();
  const start = await call("/api/aigen/questions", {
    method: "POST", token: tk,
    body: { prompt: "高校英語の並べ替えと穴埋めを合わせて12問つくって。解説つき。", track: true }
  });
  const startMs = Date.now() - t0;
  console.log("   " + JSON.stringify(start.j).slice(0, 200));
  ok("受け付けが 200", start.s === 200, { s: start.s, j: start.j });
  ok("仕事の番号が返る", !!start.j.jobId, start.j);
  ok("すぐ返る（3 秒未満）", startMs < 3000, startMs + "ms");
  ok("頼んだ数が返る", start.j.planned > 0, start.j.planned);
  if (!start.j.jobId) { console.log("\n合格 " + pass + " / 不合格 " + fail); process.exit(1); }
  const jobId = start.j.jobId;

  section("進み具合を追う（作り物が混ざっていないか）");
  let last = null, sawRunning = false, sawPartial = false;
  const seenProgress = [];
  /* 資料なしでも 30 秒近くかかることがある（形式が複数だと巡回が増える）。
     ここが短いと、正しく終わっているのに「終わっていない」と落ちる。 */
  for (let i = 0; i < 80; i++) {
    const g = await call("/api/aijob/get?jobId=" + encodeURIComponent(jobId), { token: tk });
    const job = g.j.job;
    if (!job) { await sleep(1200); continue; }
    last = job;
    seenProgress.push(job.progress);
    if (job.status === "running") sawRunning = true;
    if (Array.isArray(job.partial?.questions) && job.partial.questions.length) sawPartial = true;
    /* **ここが本丸。** 進捗は段の数え上げとだけ一致していなければならない。 */
    const st = Array.isArray(job.stages) ? job.stages : [];
    const done = st.filter((s) => s.state === "done" || s.state === "skipped").length;
    const expect = st.length ? done / st.length : 0;
    if (Math.abs((job.progress || 0) - expect) > 0.001 && job.status === "running") {
      ok("★進捗が段の数え上げと一致（作り物なし）", false,
        { progress: job.progress, 期待: expect, 終わった段: done, 段: st.length });
      break;
    }
    if (job.status !== "running" && job.status !== "queued") break;
    await sleep(1200);
  }
  ok("作成中の状態を見られた", sawRunning, last && last.status);
  ok("★進捗が段の数え上げと一致（作り物なし）", true);
  ok("進捗が後戻りしない", seenProgress.every((v, i) => i === 0 || v >= seenProgress[i - 1] - 0.001), seenProgress);
  ok("★できたぶんが途中から読める", sawPartial, "partial に問題が入ったか");

  section("終わったあと");
  console.log("   " + JSON.stringify({
    status: last && last.status, made: last && last.made, planned: last && last.planned,
    progress: last && last.progress, aiCalls: last && last.aiCalls,
    tokens: last && ((last.tokensIn || 0) + (last.tokensOut || 0)),
    firstMs: last && last.timeToFirstResultMs
  }));
  /* **「作成中」のまま終わらないのが、いちばん困る。**
     途中で止まったときも、できているぶんを残して閉じること。 */
  ok("終わっている（作成中のまま残らない）",
    !!last && ["completed", "partial", "failed"].indexOf(last.status) >= 0,
    last && { status: last.status, made: last.made, planned: last.planned });
  ok("段が形式ごとに分かれている", !!last && Array.isArray(last.stages) && last.stages.length >= 1,
    last && (last.stages || []).map((s) => s.id + ":" + s.state + ":" + s.note));
  ok("★段の注記が「n/m問」になっている",
    !!last && (last.stages || []).every((s) => /^\d+\/\d+問$/.test(String(s.note || ""))),
    last && (last.stages || []).map((s) => s.note));
  ok("実際に呼んだ回数が残っている", !!last && last.aiCalls > 0, last && last.aiCalls);
  ok("使った字数が残っている", !!last && (last.tokensIn + last.tokensOut) > 0, last && [last.tokensIn, last.tokensOut]);
  ok("最初の 1 問までの時間が残っている", !!last && last.timeToFirstResultMs > 0, last && last.timeToFirstResultMs);
  /* 「揃っていないのに completed」は嘘になる。ここは厳しく見る。 */
  ok("★足りないのに completed と書かない",
    !!last && (last.status !== "completed" || last.made >= last.planned),
    last && { status: last.status, made: last.made, planned: last.planned });
  ok("できた数と中身の数が合う",
    !!last && Array.isArray(last.partial?.questions) && last.partial.questions.length === last.made,
    last && { made: last.made, 中身: (last.partial?.questions || []).length });
  ok("完成なら進捗が 1", !!last && (last.status !== "completed" || Math.abs(last.progress - 1) < 0.001),
    last && last.progress);

  section("一覧に出る（離れても戻ってこられる）");
  const list = await call("/api/aijob/list?limit=20", { token: tk });
  const found = (list.j.jobs || []).filter((x) => x.jobId === jobId)[0];
  ok("一覧から見つかる", !!found, (list.j.jobs || []).length + " 件");
  if (!last) { console.log("\n合格 " + pass + " / 不合格 " + fail); process.exit(1); }
  ok("一覧でも同じ数", !!found && found.made === last.made, found && { list: found.made, get: last.made });
  ok("クラウドの仕事として記録されている", !!found && found.executor === "cloud", found && found.executor);

  console.log("\n合格 " + pass + " / 不合格 " + fail);
  if (bad.length) console.log("直すところ:\n  - " + bad.join("\n  - "));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("実行できませんでした:", e); process.exit(1); });
