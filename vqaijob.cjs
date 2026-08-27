/* ══════════════════════════════════════════════════════════════════════
   AI Activity — 仕事の台帳（Job）と資料の読み取り置き場の確認（開発環境のみ）

   確かめること:
     ・仕事を始められる／取り直せる／一覧に出る
     ・**同じ操作を 2 回押しても 1 件**（idempotencyKey）
     ・**進捗は段の数からしか出ない**（送りつけた progress は効かない）
     ・途中結果は失敗しても消えない
     ・取り消しても、できたぶんは残る
     ・**他人の仕事は見えない・触れない**
     ・資料の読み取りは、同じ指紋なら 2 回目に当たる
     ・読み取りの版を上げると、古い結果は使われない

   使い方: node vqaijob.cjs
   ══════════════════════════════════════════════════════════════════════ */
const BASE = process.env.VQ_API || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => { c ? (pass++, console.log("  ok   " + n))
  : (fail++, bad.push(n), console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 300) : ""))); };
const section = (t) => console.log("\n══ " + t + " ══");

async function api(method, path, body, token) {
  const h = { "Content-Type": "application/json" };
  if (token) h.Authorization = "Bearer " + token;
  const r = await fetch(BASE + path, { method, headers: h,
    body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text();
  let data = null; try { data = t ? JSON.parse(t) : null; } catch (e) { data = { raw: t.slice(0, 160) }; }
  return { status: r.status, data: data || {} };
}
async function makeUser(tag) {
  const nick = tag + Date.now().toString(36).slice(-6) + Math.floor(Math.random() * 90 + 10);
  const reg = await api("POST", "/api/auth/register",
    { gradePrefix: "H1", nickname: nick, password: "DevJob#2026a", tosAccepted: true, tosVersion: "1" });
  if (!reg.data.token) throw new Error("検証アカウントを作れません: " + JSON.stringify(reg.data).slice(0, 200));
  return { nick, token: reg.data.token };
}

const STAGES = [
  { id: "doc", label: "資料を解析", state: "pending" },
  { id: "index", label: "重要ポイントを抽出", state: "pending" },
  { id: "gen", label: "問題を生成", state: "pending" },
  { id: "val", label: "問題を検証", state: "pending" },
  { id: "rep", label: "不足問題を修正", state: "pending" },
  { id: "pub", label: "最終確認", state: "pending" }
];
const mark = (upto) => STAGES.map((s, i) => ({ ...s, state: i < upto ? "done" : (i === upto ? "running" : "pending") }));

(async () => {
  console.log("接続先: " + BASE + "（開発環境）");
  const me = await makeUser("aij");
  const other = await makeUser("aio");
  console.log("検証アカウント: " + me.nick + " / " + other.nick);

  section("仕事を始める・取り直す");
  const idem = "test-" + Date.now().toString(36);
  const s1 = await api("POST", "/api/aijob/start", {
    type: "mock_generation", title: "Quick Mock を作成中",
    idempotencyKey: idem, stages: STAGES, planned: 20,
    executor: "bridge", engineVersion: "v2", estimate: { cost: 0.012 }
  }, me.token);
  ok("仕事を始められる", s1.status === 200 && !!s1.data?.job?.jobId, s1.data);
  const jobId = s1.data?.job?.jobId;
  ok("最初は待ち状態", s1.data?.job?.status === "queued", s1.data?.job?.status);
  ok("最初の進捗は 0", s1.data?.job?.progress === 0, s1.data?.job?.progress);

  const s2 = await api("POST", "/api/aijob/start", {
    type: "mock_generation", idempotencyKey: idem, stages: STAGES
  }, me.token);
  ok("★同じ鍵で 2 回押しても 1 件", s2.data?.reused === true && s2.data?.job?.jobId === jobId,
    { reused: s2.data?.reused, id1: jobId, id2: s2.data?.job?.jobId });

  const g1 = await api("GET", "/api/aijob/get?id=" + encodeURIComponent(jobId), undefined, me.token);
  ok("あとから取り直せる", g1.status === 200 && g1.data?.job?.jobId === jobId, g1.data);

  section("進捗は段の数からしか出ない");
  const u1 = await api("POST", "/api/aijob/update", {
    jobId, status: "running", stages: mark(2), currentStage: "gen",
    progress: 0.99,                     /* ← 嘘の進捗。効かないこと */
    made: 6, planned: 20,
    metrics: { aiCalls: 3, cacheHits: 1, cacheMisses: 1, tokensIn: 4200, tokensOut: 1800, cost: 0.004 }
  }, me.token);
  ok("実行中にできる", u1.data?.job?.status === "running", u1.data?.job?.status);
  ok("★送りつけた progress は効かない（2/6 = 0.333）",
    Math.abs((u1.data?.job?.progress || 0) - 2 / 6) < 0.001, u1.data?.job?.progress);
  ok("AI 呼び出し回数が残る", u1.data?.job?.aiCalls === 3, u1.data?.job?.aiCalls);
  ok("キャッシュの当たり外れが残る",
    u1.data?.job?.cacheHits === 1 && u1.data?.job?.cacheMisses === 1, u1.data?.job);
  ok("最初の 1 問までの時間が測れている", (u1.data?.job?.timeToFirstResultMs || 0) >= 0, u1.data?.job?.timeToFirstResultMs);

  section("途中結果は捨てない");
  const partial = { questions: Array.from({ length: 6 }, (_, i) => ({ id: "q" + i, type: "ordering" })) };
  const u2 = await api("POST", "/api/aijob/update", { jobId, stages: mark(3), partial, made: 6 }, me.token);
  ok("途中結果を預けられる", (u2.data?.job?.partial?.questions || []).length === 6, u2.data?.job?.partial);

  const fin = await api("POST", "/api/aijob/finish", {
    jobId, status: "partial", stages: mark(5), made: 17,
    error: { code: "SOURCE_INSUFFICIENT", message: "資料から作れたのは 17 問でした。" },
    metrics: { aiCalls: 9, cost: 0.021 }
  }, me.token);
  ok("一部だけできた、で終われる", fin.data?.job?.status === "partial", fin.data?.job?.status);
  ok("★失敗の理由が残る", fin.data?.job?.error?.code === "SOURCE_INSUFFICIENT", fin.data?.job?.error);
  ok("★終わったあとも途中結果は残っている",
    (fin.data?.job?.partial?.questions || []).length === 6, fin.data?.job?.partial);
  ok("かかった費用が残る", fin.data?.job?.actualCost === 0.021, fin.data?.job?.actualCost);

  const u3 = await api("POST", "/api/aijob/update", { jobId, status: "running" }, me.token);
  ok("終わった仕事は巻き戻らない", u3.data?.job?.status === "partial", u3.data?.job?.status);

  section("取り消しても、できたぶんは残る");
  const c0 = await api("POST", "/api/aijob/start", {
    type: "preset_generation", title: "プリセットを作成中", stages: STAGES
  }, me.token);
  const cid = c0.data?.job?.jobId;
  await api("POST", "/api/aijob/update", {
    jobId: cid, status: "running", stages: mark(2), made: 4,
    partial: { questions: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }] }
  }, me.token);
  const c1 = await api("POST", "/api/aijob/cancel", { jobId: cid }, me.token);
  ok("取り消せる", c1.data?.job?.status === "cancelled", c1.data?.job?.status);
  ok("★取り消しても、できた 4 問は残る",
    (c1.data?.job?.partial?.questions || []).length === 4, c1.data?.job?.partial);

  section("一覧");
  const l1 = await api("GET", "/api/aijob/list?limit=10", undefined, me.token);
  ok("自分の仕事が並ぶ", (l1.data?.jobs || []).length >= 2, (l1.data?.jobs || []).length);
  const l2 = await api("GET", "/api/aijob/list?limit=10&live=1", undefined, me.token);
  ok("動いているものだけに絞れる",
    (l2.data?.jobs || []).every((j) => ["queued", "running", "validating", "repairing"].indexOf(j.status) >= 0),
    (l2.data?.jobs || []).map((j) => j.status));

  section("他人のものは見えない");
  const x1 = await api("GET", "/api/aijob/get?id=" + encodeURIComponent(jobId), undefined, other.token);
  ok("★他人の仕事は取れない", x1.status === 404, x1.status);
  const x2 = await api("POST", "/api/aijob/update", { jobId, status: "completed" }, other.token);
  ok("★他人の仕事は書き換えられない", x2.status === 404, x2.status);
  const x3 = await api("POST", "/api/aijob/cancel", { jobId }, other.token);
  ok("★他人の仕事は取り消せない", x3.status === 404, x3.status);
  const x4 = await api("GET", "/api/aijob/list?limit=10", undefined, other.token);
  ok("★他人の一覧に自分のものが混ざらない",
    (x4.data?.jobs || []).every((j) => j.jobId !== jobId), (x4.data?.jobs || []).length);
  const x5 = await api("GET", "/api/aijob/list?limit=10");
  ok("ログインしていないと使えない", x5.status === 401, x5.status);

  section("同じ鍵は人が違えば別の仕事");
  const s3 = await api("POST", "/api/aijob/start", {
    type: "mock_generation", idempotencyKey: idem, stages: STAGES
  }, other.token);
  ok("★他人と鍵がぶつからない",
    s3.status === 200 && s3.data?.job?.jobId !== jobId, { id: s3.data?.job?.jobId });

  section("資料の読み取り置き場");
  const fp = "fp_" + Date.now().toString(36) + "_v1";
  const d0 = await api("GET", "/api/aidoc/get?fingerprint=" + fp, undefined, me.token);
  ok("最初は当たらない", d0.data?.hit === false, d0.data);
  const idx = {
    documentId: "doc1",
    sections: [
      { id: "s1", title: "はじめに", content: "…", importance: 0.4, keyTerms: ["A"], sourcePages: [1] },
      { id: "s2", title: "第1章", content: "…", importance: 0.92, keyTerms: ["B", "C"], sourcePages: [4, 5] }
    ]
  };
  const p0 = await api("POST", "/api/aidoc/put", {
    fingerprint: fp, contentHash: "abc123", parserVersion: "p1", extractionVersion: "v1",
    index: idx, bytes: 120000, pages: 10
  }, me.token);
  ok("読み取り結果を預けられる", p0.data?.ok === true, p0.data);
  const d1 = await api("GET", "/api/aidoc/get?fingerprint=" + fp, undefined, me.token);
  ok("★2 回目は当たる（読み直さない）", d1.data?.hit === true, d1.data?.hit);
  ok("章立てがそのまま返る", (d1.data?.index?.sections || []).length === 2, d1.data?.index);
  ok("当たった回数が数えられている", (d1.data?.hits || 0) >= 1, d1.data?.hits);

  const d2 = await api("GET", "/api/aidoc/get?fingerprint=" + fp, undefined, other.token);
  ok("★他人の読み取り結果は使えない", d2.data?.hit === false, d2.data);

  const fp2 = fp.replace(/_v1$/, "_v2");
  const d3 = await api("GET", "/api/aidoc/get?fingerprint=" + fp2, undefined, me.token);
  ok("★読み取りの版を上げると当たらない（作り直しが効く）", d3.data?.hit === false, d3.data);

  const big = { sections: Array.from({ length: 4000 }, (_, i) => ({ id: "s" + i, content: "x".repeat(200) })) };
  const p1 = await api("POST", "/api/aidoc/put", { fingerprint: fp + "_big", index: big }, me.token);
  ok("★大きすぎるものは黙って切らずに断る", p1.data?.code === "TOO_LARGE", p1.data);

  console.log("\n  合格 " + pass + " / 不合格 " + fail);
  if (bad.length) console.log("  直すところ:\n    - " + bad.join("\n    - "));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("実行できませんでした:", e); process.exit(1); });
