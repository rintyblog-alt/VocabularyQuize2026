/* ══════════════════════════════════════════════════════════════════════
   **実際の 画面と 同じ 頼みかた**で 測る（開発版のみ）。

   画面（vq-make）は requestsOf が 大問ごとに 刻んだ 頼みを 送る。
   1 回の 頼み = 1 つの 大問ぶん（多くて 5 問）。

   ここで 比べるのは その 1 点だけ:
     絞らない … 毎回 **全 12 大問**を parts に 載せる（〜2026-09-05 の 形）
     絞る     … その 頼みが 作る **1 大問だけ**を 載せる（新しい 形）

   使い方: node vqpartsperf.cjs [大問数] [1大問あたりの問数]
   ══════════════════════════════════════════════════════════════════════ */
const BASE = process.env.VQ_API || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const 大問数 = parseInt(process.argv[2] || "12", 10);
const 一大問 = parseInt(process.argv[3] || "4", 10);
const 同時 = 2;                       /* 画面の concurrency（預けた資料つき） */

async function api(method, p, body, token) {
  const h = { "Content-Type": "application/json" };
  if (token) h.Authorization = "Bearer " + token;
  const r = await fetch(BASE + p, { method, headers: h,
    body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text();
  let d = null; try { d = t ? JSON.parse(t) : null; } catch (e) { d = { raw: t.slice(0, 300) }; }
  return { status: r.status, data: d || {} };
}
async function 検証アカウント() {
  const nick = "prt" + Date.now().toString(36).slice(-6);
  const r = await api("POST", "/api/auth/register",
    { gradePrefix: "H3", nickname: nick, password: "DevGen#2026a", tosAccepted: true, tosVersion: "1" });
  if (r.data.token) return r.data.token;
  const a = await api("POST", "/api/auth/register/start",
    { email: nick + "@gmail.com", gradePrefix: "H3", nickname: nick, password: "DevGen#2026a" });
  const b = await api("POST", "/api/auth/register/verify",
    { challengeId: a.data.challengeId, code: a.data.devCode });
  const c = await api("POST", "/api/auth/register/consent",
    { registrationSession: b.data.registrationSession, agreeTerms: true,
      agreePrivacy: true, agreeAge: true, pin: "8306" });
  if (!c.data.token) { console.error("検証アカウントを作れません"); process.exit(1); }
  return c.data.token;
}

const 題 = ["古代の 政治と 外交", "荘園と 武士の 登場", "室町の 経済", "戦国の 城下町",
  "江戸の 身分制", "享保の 改革", "開国と 条約", "明治の 殖産興業",
  "大正の 都市文化", "昭和の 恐慌", "戦後の 改革", "高度経済成長"];
const 形式 = ["single_choice", "fill_blank", "text_input", "free_text"];
const 全大問 = [];
for (let i = 0; i < 大問数; i++) {
  全大問.push({ title: "第" + (i + 1) + "問　" + 題[i % 12],
    field: 題[i % 12], where: "p." + (i * 20 + 1) + "-" + (i * 20 + 20), count: 一大問 });
}

function 頼み(i, 絞る) {
  const plan = {}; 形式.forEach((f) => { plan[f] = Math.max(1, Math.round(一大問 / 形式.length)); });
  return {
    prompt: "高校 日本史探究の 定期考査を 作ってください。用語の 意味と 因果関係を 問う 設問に。",
    count: 一大問, questionTypes: 形式, questionPlan: plan,
    exam: true, subject: "日本史探究", level: "標準", kind: "exam",
    parts: 絞る ? [全大問[i]] : 全大問
  };
}

async function 一巡(絞る, token) {
  const t0 = Date.now();
  let 出来 = 0, AI = 0, 超過 = 0, 断り = "";
  const 順 = [];
  for (let i = 0; i < 大問数; i++) 順.push(i);
  let at = 0;
  async function 走る() {
    while (at < 順.length) {
      const i = 順[at++];
      const r = await api("POST", "/api/aigen/questions", 頼み(i, 絞る), token);
      const m = (r.data && r.data.metrics) || {};
      出来 += ((r.data && r.data.questions) || []).length;
      AI += m.aiCalls || 0;
      if (m.subrequestLimit) 超過++;
      if (m.lastError && !断り) 断り = String(m.lastError).slice(0, 70);
    }
  }
  const 本 = [];
  for (let k = 0; k < 同時; k++) 本.push(走る());
  await Promise.all(本);
  return { 秒: Math.round((Date.now() - t0) / 100) / 10, 出来, AI, 超過, 断り };
}

(async () => {
  const token = await 検証アカウント();
  const 予定 = 大問数 * 一大問;
  console.log(`\n大問 ${大問数}・各 ${一大問} 問（合わせて ${予定} 問）／${同時} 本ずつ 同時\n`);
  /* ★ 1 巡ずつ 回せる ように する（2026-09-06）。
     12 大問を 2 巡 まとめて 回すと 10 分を 超えて 殺される（実測 137）。 */
  const 選 = String(process.argv[4] || "both");
  const 表 = [["絞らない（前の形・全大問を毎回）", false],
              ["絞る（新しい形・その大問だけ）", true]]
    .filter(([, 絞る]) => 選 === "both" || (選 === "before" ? !絞る : 絞る));
  for (const [名, 絞る] of 表) {
    const x = await 一巡(絞る, token);
    console.log(`  ${名.padEnd(34)}  ${String(x.秒).padStart(6)}s  `
      + `${x.出来}/${予定}問  AI${x.AI}回`
      + (x.超過 ? `  ★天井${x.超過}件` : "")
      + (x.断り ? `  ⚠ ${x.断り}` : ""));
  }
  console.log("");
})();
