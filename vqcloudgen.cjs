/* ══════════════════════════════════════════════════════════════════════════
   vqcloudgen.cjs — AI で 作りかけの プリセットが **クラウドに 残る**か

   ★ これまでは 作成の 画面を 開いたままに して おかないと 止まっていた。
     サーバには すでに 台帳（ai_jobs）が あって「離れても 続く」ように
     なっていたのに、**画面が それを 見に いっていなかった**。

   ここで 測ること:
     ① 台帳に 走っている 仕事が あると、一覧に **うすい 札**が 出る
     ② 雲の しるしと **できた 割合（%）**が 出る
     ③ **再読み込みしても 残る**（端末に 覚えさせていないから）
     ④ 「止める」で 消える
     ⑤ 目安の 時間が 問題数×1分では なく、中身で 変わる

   本番では 走らせない。
   ══════════════════════════════════════════════════════════════════════════ */
const BASE = process.env.VQ_API || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const { chromium } = require("playwright");

let 済 = 0, 落 = 0;
const ok = (n, c, x) => {
  if (c) { 済++; console.log("  ok   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 180) : "")); }
  else { 落++; console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 300) : "")); }
};
const 節 = (t) => console.log("\n══ " + t + " ══");
async function req(path, o = {}) {
  const h = { "content-type": "application/json" };
  if (o.token) h.authorization = "Bearer " + o.token;
  const r = await fetch(BASE + path, { method: o.method || "GET", headers: h, body: o.body ? JSON.stringify(o.body) : undefined });
  return { status: r.status, j: await r.json().catch(() => ({})) };
}

(async () => {
  const tag = "cg" + Date.now().toString(36);
  const s = await req("/api/auth/register/start", { method: "POST", body: { email: `${tag}@gmail.com`, gradePrefix: "H2", nickname: tag, password: "Testing!2345" } });
  const v = await req("/api/auth/register/verify", { method: "POST", body: { challengeId: s.j.challengeId, code: s.j.devCode } });
  const c = await req("/api/auth/register/consent", { method: "POST", body: { registrationSession: v.j.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: "482913" } });
  const token = c.j.token;
  if (!token) { console.error("登録できません"); process.exit(1); }

  節("① 台帳に 作りかけを 置く");
  const st = await req("/api/aijob/start", { method: "POST", token, body: {
    type: "preset-gen", title: "光合成のしくみ", planned: 10, executor: "cloud",
    stages: [{ id: "plan", label: "組み立て", total: 1, done: 1 }, { id: "make", label: "作る", total: 10, done: 3 }] } });
  const jobId = st.j?.job?.jobId;
  ok("仕事を 作れる", st.status === 200 && !!jobId, { status: st.status, jobId });
  await req("/api/aijob/update", { method: "POST", token, body: { jobId, made: 3,
    stages: [{ id: "plan", label: "組み立て", total: 1, done: 1 }, { id: "make", label: "作る", total: 10, done: 3 }] } });
  const li = await req("/api/aijob/list?live=1&limit=20", { token });
  ok("live で 拾える", (li.j?.jobs || []).some((x) => x.jobId === jobId));

  const b = await chromium.launch({ headless: true });
  const pg = await (await b.newContext({ viewport: { width: 1440, height: 950 } })).newPage();
  const 例外 = []; pg.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 160)));
  await pg.addInitScript(([t]) => { try { localStorage.setItem("app.auth.token.v1", t); } catch (e) {} }, [token]);
  await pg.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await pg.addStyleTag({ content: "#vqPin,#vqTour,#vqLumiTour,#vqNewAuth,#authGate,#firstLaunchOverlay{display:none!important}" });
  await pg.waitForTimeout(7500);
  await pg.evaluate(() => window.__vqQredit.goTab("library"));
  await pg.waitForTimeout(3500);

  const 札 = () => pg.evaluate(() => {
    const sh = document.getElementById("vqScreens");
    const r = sh && sh.shadowRoot;
    const c = r && r.querySelector(".pc--building");
    if (!c) return null;
    return { 文: (c.innerText || "").replace(/\s+/g, " ").slice(0, 160),
      薄さ: Number(getComputedStyle(c).opacity),
      雲: /cloud_upload/.test(c.innerHTML),
      割合: ((c.querySelector(".pc--building__pct") || {}).textContent || ""),
      止める: !!c.querySelector("[data-cancelgen]") };
  });

  節("② うすい 札が 一覧に 出る");
  const a1 = await 札();
  ok("札が 出る", !!a1, a1);
  ok("**うすい**（1 より 小さい）", !!a1 && a1.薄さ < 1 && a1.薄さ > 0.4, a1 && a1.薄さ);
  ok("雲の しるしが ある", !!a1 && a1.雲);
  ok("**できた 割合が 出る**（3/10 → 30%）", !!a1 && a1.割合 === "30%", a1 && a1.割合);
  ok("何問中 何問か 出る", !!a1 && /3 \/ 10/.test(a1.文), a1 && a1.文.slice(0, 80));
  ok("止める 口が ある", !!a1 && a1.止める);

  節("②-b 作り始めた 合図で **その場で** 出る");
  {
    /* 一覧を 開いたまま、もう 1 件 始める。
       画面を 離れたり 読み込み直したり しなくても 出るか。 */
    const st2 = await req("/api/aijob/start", { method: "POST", token, body: {
      type: "preset-gen", title: "二件目のしごと", planned: 4, executor: "cloud",
      stages: [{ id: "make", label: "作る", total: 4, done: 1 }] } });
    const id2 = st2.j?.job?.jobId;
    await req("/api/aijob/update", { method: "POST", token, body: { jobId: id2, made: 1,
      stages: [{ id: "make", label: "作る", total: 4, done: 1 }] } });
    /* 生成の 口が 出す 合図と 同じ ものを 投げる */
    await pg.evaluate((d) => window.dispatchEvent(new CustomEvent("vq:cloudgen:start", { detail: d })), { jobId: id2, planned: 4 });
    await pg.waitForTimeout(2500);
    const n = await pg.evaluate(() => {
      const r = document.getElementById("vqScreens").shadowRoot;
      return r.querySelectorAll(".pc--building").length;
    });
    ok("**画面を 離れずに 2 件目が 出る**", n === 2, { 札の数: n });
    await req("/api/aijob/cancel", { method: "POST", token, body: { jobId: id2 } });
    await pg.waitForTimeout(300);
  }

  節("③ 再読み込みしても 残る");
  await pg.reload({ waitUntil: "domcontentloaded" });
  await pg.addStyleTag({ content: "#vqPin,#vqTour,#vqLumiTour,#vqNewAuth,#authGate,#firstLaunchOverlay{display:none!important}" });
  await pg.waitForTimeout(8000);
  await pg.evaluate(() => window.__vqQredit.goTab("library"));
  await pg.waitForTimeout(3500);
  const a2 = await 札();
  ok("**残っている**", !!a2, a2 && a2.文.slice(0, 60));
  ok("割合も 同じ", !!a2 && a2.割合 === "30%", a2 && a2.割合);

  節("④ 止める");
  await pg.evaluate(() => {
    const r = document.getElementById("vqScreens").shadowRoot;
    const b2 = r.querySelector("[data-cancelgen]"); if (b2) b2.click();
  });
  await pg.waitForTimeout(600);
  await pg.evaluate(() => { const o = document.querySelector('[data-act="dlg-o"]'); if (o) o.click(); });
  await pg.waitForTimeout(3000);
  const 後 = await req("/api/aijob/get?jobId=" + encodeURIComponent(jobId), { token });
  ok("台帳でも 止まっている", String(後.j?.job?.status || "") === "cancelled" || !(await 札()),
    { 台帳: 後.j?.job?.status, 札: !!(await 札()) });

  節("⑤ 目安の 時間が 中身で 変わる");
  const 分 = await pg.evaluate(() => {
    const L = window.VQ2 && window.VQ2.library;
    if (!L || !L.estimateMinutes) return null;
    const 単語 = [], 四択 = [], 長文 = [];
    for (let i = 0; i < 20; i++) 単語.push({ id: "q" + i, type: "flashcard", prompt: "apple", answer: "りんご" });
    for (let i = 0; i < 20; i++) 四択.push({ id: "c" + i, type: "multiple_choice_single",
      prompt: "次の うち 正しい ものを 選びなさい。日本国憲法の 三大原則の ひとつは どれか。",
      choices: [{ text: "国民主権" }, { text: "王権神授" }, { text: "教皇至上" }, { text: "神権政治" }] });
    for (let i = 0; i < 5; i++) 長文.push({ id: "l" + i, type: "multiple_choice_single",
      prompt: "あ".repeat(600), choices: [{ text: "い".repeat(40) }, { text: "う".repeat(40) }, { text: "え".repeat(40) }, { text: "お".repeat(40) }] });
    return { 単語20: L.estimateMinutes(単語), 四択20: L.estimateMinutes(四択), 長文5: L.estimateMinutes(長文) };
  });
  ok("測れる", !!分, 分);
  ok("**単語 20 問は 20 分も かからない**", !!分 && 分.単語20 < 10, 分 && 分.単語20);
  ok("4 択 20 問は 単語より 長い", !!分 && 分.四択20 > 分.単語20, 分);
  ok("**長文 5 問は 5 分では 終わらない**（前は 5 分だった）", !!分 && 分.長文5 > 6, 分 && 分.長文5);

  節("⑥ 例外");
  ok("画面の 例外 0 件", 例外.length === 0, 例外.slice(0, 4));

  await b.close();
  console.log("\n────────────────────────────────");
  console.log(`  ok ${済} / NG ${落}`);
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
