/* ══════════════════════════════════════════════════════════════════════
   Quick Mock が「クラウド（Workers AI）」で問題を作れるかの確認（開発環境）

   Mac の Bridge を使わずに、画面から問題ができることを確かめる。
   ここが通れば、Mac が寝ていても問題が作れる。

   確かめること:
     ・接続層が使える（ログイン済みなら cloud を選ぶ）
     ・頼んだ形式どおりに返る（並べ替えと言ったら並べ替えだけ）
     ・矛盾した指示では 1 問も作らない
     ・作れなかったぶんを黙って埋めない
     ・この Mac を使う設定にすれば、これまでどおり Bridge を見に行く

   使い方: node vqcloudgen.cjs
   ══════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const BASE = process.env.VQ_API || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }

let pass = 0, fail = 0; const bad = [];
const ok = (n, c, x) => { c ? (pass++, console.log("  ok   " + n))
  : (fail++, bad.push(n), console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 300) : ""))); };
const section = (t) => console.log("\n══ " + t + " ══");

async function api(method, p, body, token) {
  const h = { "Content-Type": "application/json" };
  if (token) h.Authorization = "Bearer " + token;
  const r = await fetch(BASE + p, { method, headers: h,
    body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await r.text();
  let d = null; try { d = t ? JSON.parse(t) : null; } catch (e) { d = { raw: t.slice(0, 200) }; }
  return { status: r.status, data: d || {} };
}

(async () => {
  const nick = "cg" + Date.now().toString(36).slice(-6);
  const reg = await api("POST", "/api/auth/register",
    { gradePrefix: "H1", nickname: nick, password: "DevCg#2026a", tosAccepted: true, tosVersion: "1" });
  if (!reg.data.token) { console.error("検証アカウントを作れません:", reg.data); process.exit(1); }
  const token = reg.data.token;

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on("pageerror", e => errs.push(String(e.message).slice(0, 180)));
  await pg.addInitScript((t) => {
    localStorage.setItem("app.auth.token.v1", t);
    localStorage.setItem("app.auth.mode.v1", "user");
  }, token);
  await pg.goto(BASE + "/index.html?vq2=all", { waitUntil: "domcontentloaded", timeout: 180000 });
  await pg.waitForFunction(() => window.VQ2 && window.VQ2.aigen, { timeout: 40000 });
  await pg.evaluate(() => { const o = document.getElementById("firstLaunchOverlay"); if (o) o.style.display = "none"; });

  section("接続層");
  const av = await pg.evaluate(() => window.VQ2.aigen.available());
  ok("クラウドが使える（ログイン済み）", av === true, av);
  const pick = await pg.evaluate(() => window.VQ2.aigen.pickExecutor());
  ok("既定でクラウドを選ぶ", pick === "cloud", pick);

  /* クラウドの今日ぶんを使い切っているかを先に見る。
     使い切っているときに「作れない」を不合格にすると、
     道具の側の問題を実装の問題として数えてしまう。
     そのときは **切り替えが効くか**を代わりに確かめる。 */
  const quota = await pg.evaluate(() => window.VQ2.aigen.generateQuestions({
    prompt: "英語の並べ替え問題を2問作ってください。"
  }).then((r) => ({ ok: true, n: (r.questions || []).length }),
          (e) => ({ ok: false, blocked: e && e.blocked, fb: !!(e && e.fallbackToLocal), msg: e && e.userMessage })));

  if (!quota.ok && quota.blocked === "QUOTA_EXHAUSTED") {
    section("クラウドの今日ぶんを使い切っている状態での動き");
    ok("★枠切れだと分かる形で返る", quota.blocked === "QUOTA_EXHAUSTED", quota);
    ok("★この端末へ切り替えてよい、と分かる", quota.fb === true, quota);
    ok("利用者に見せる言葉がある", /切り替え/.test(String(quota.msg || "")), quota.msg);
    console.log("       ※ 生成そのものの確認は、枠が戻ってから（UTC 0 時 ＝ 日本時間 朝 9 時）");

    const back = await pg.evaluate(() => {
      window.VQ2.aigen.setExecutorPref("local");
      return window.VQ2.aigen.pickExecutor();
    });
    ok("設定どおり この Mac を選ぶ", back === "local", back);
    await pg.evaluate(() => window.VQ2.aigen.setExecutorPref("auto"));
    ok("画面のエラーが無い", errs.length === 0, errs.slice(0, 3));
    console.log("\n  合格 " + pass + " / 不合格 " + fail);
    if (bad.length) console.log("  直すところ:\n    - " + bad.join("\n    - "));
    await browser.close();
    process.exit(fail ? 1 : 0);
  }

  section("頼んだ形式どおりに返る");
  const r1 = await pg.evaluate(() => window.VQ2.aigen.generateQuestions({
    prompt: "高校英語の英文並び替え問題を6問作ってください。並び替え以外は使わないでください。正答と日本語解説を付けてください。"
  }));
  ok("問題ができる", (r1.questions || []).length > 0, { n: (r1.questions || []).length, status: r1.status });
  ok("★6 問そろう", (r1.questions || []).length === 6, (r1.questions || []).length);
  ok("★並べ替え以外が混ざらない",
    (r1.questions || []).every((q) => q.type === "reorder"),
    Array.from(new Set((r1.questions || []).map((q) => q.type))));
  ok("並べ替えの札（items）が付いている",
    (r1.questions || []).every((q) => Array.isArray(q.items) && q.items.length >= 4),
    (r1.questions || [])[0]);
  ok("正答が付いている", (r1.questions || []).every((q) => q.answer != null && String(q.answer).length));
  ok("解説が付いている", (r1.questions || []).every((q) => String(q.explanation || "").trim().length > 0));
  ok("費用が記録されている", (r1.usage || {}).neurons > 0, r1.usage);
  console.log(`       → ${Math.round((r1.usage || {}).ms / 1000)}秒 / AI ${(r1.usage || {}).aiCalls} 回 / ${Math.round((r1.usage || {}).neurons)} neurons`);

  section("矛盾した指示では作らない");
  const r2 = await pg.evaluate(() => window.VQ2.aigen.generateQuestions({
    prompt: "全問4択にしてください。ただし、4択問題は禁止です。10問作ってください。"
  }));
  ok("★1 問も作らない", (r2.questions || []).length === 0, (r2.questions || []).length);
  ok("★AI を呼んでいない", (r2.usage || {}).aiCalls === 0, r2.usage);
  ok("理由が返る", !!String(r2.reason || "").trim(), r2.reason);

  section("作れなかったぶんを黙って埋めない");
  const r3 = await pg.evaluate(() => window.VQ2.aigen.generateQuestions({
    prompt: "日本史の問題を12問作ってください。"
  }));
  const made = (r3.questions || []).length;
  ok("頼んだ数を超えて水増ししない", made <= 12, made);
  if (made < 12) ok("足りないときは、そう言う", (r3.warnings || []).some((w) => /作れませんでした/.test(w)), r3.warnings);
  else ok("12 問そろう", made === 12, made);

  section("この Mac を使う設定にすると、これまでどおり");
  const back = await pg.evaluate(() => {
    window.VQ2.aigen.setExecutorPref("local");
    return window.VQ2.aigen.pickExecutor();
  });
  ok("設定どおり この Mac を選ぶ", back === "local", back);
  await pg.evaluate(() => window.VQ2.aigen.setExecutorPref("auto"));

  ok("画面のエラーが無い", errs.length === 0, errs.slice(0, 3));
  console.log("\n  合格 " + pass + " / 不合格 " + fail);
  if (bad.length) console.log("  直すところ:\n    - " + bad.join("\n    - "));
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error("実行できませんでした:", e); process.exit(1); });
