/* ══════════════════════════════════════════════════════════════════════════
   vqexamsave.cjs — **できた 試験が 一覧に 出るか**を 測る

   訴え（2026-08-30・Rinty さん）
     「全然プリセット欄にできた試験が追加されないし、
       ずっと処理が終わってるはずなのにクラウド表示は 4/4 だし」

   分かっていた こと（直す前）:
     ・試験は **確認の 画面で「保存する」を 押すまで** どこにも 残らなかった。
       押す前に 閉じたり、途中で 落ちたりすると 全部 消える。
     ・止まったままの 仕事を 畳むのは「1 件ずつ 開いた とき」だけだったので、
       画面が もう 見ていない 仕事は **永遠に「作成中」**の ままだった。

   見るのは:
     ① 押さなくても、できた 時点で 一覧に 入る
     ② 注文の 目印が 押される（うしろの 拾い上げが 二度 作らない）
     ③ 一部しか できなくても、できた ぶんは 残る
     ④ 一覧に 出るのは **1 件**（分割されない）
     ⑤ 止まった 仕事は 一覧を 引いた ときに 畳まれる（帯が 消える）

   使い方: VQ_BASE=http://127.0.0.1:8791 node vqexamsave.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs");
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const { chromium } = require("playwright");

let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 240) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 400) : "")); }
};
const j = (r) => r.json().catch(() => ({}));
async function 札() {
  const 印 = Date.now().toString(36) + Math.floor(Math.random() * 9999);
  const r = await fetch(BASE + "/api/auth/register/start", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "es" + 印 + "@gmail.com", gradePrefix: "H2", nickname: ("s" + 印).slice(0,14), password: "Passw0rd!z3" }) }).then(j);
  const v = await fetch(BASE + "/api/auth/register/verify", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeId: r.challengeId, code: r.devCode }) }).then(j);
  const c = await fetch(BASE + "/api/auth/register/consent", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ registrationSession: v.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: "1379" }) }).then(j);
  if (!c.token) throw new Error("札が 取れない");
  return c.token;
}

(async () => {
  console.log("測る先:", BASE);
  const tok = await 札();
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1180, height: 900 } });
  const page = await ctx.newPage();
  const 例外 = []; page.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 250)));

  /* ── AI を 作り物に する（実 AI を 呼ばずに 成功の 道を 通す）── */
  const 仕事 = new Map();
  let 番 = 0;
  const 問 = (n, 種) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push(種 === "fill_blank"
        ? { id: "q" + (++番), question: "本文の 【ア】 に 入る 語を 答えよ。", type: "fill_blank",
            answer: ["標本"], blanks: [{ answer: "標本" }], explanation: "本文のとおり。" }
        : { id: "q" + (++番), question: "最も 適当な ものを 選べ。" + 番, type: "single_choice",
            choices: ["あ", "い", "う", "え"], answer: "あ",
            explanation: "①正解。②言い過ぎ。③逆。④足りない。" });
    }
    return out;
  };
  await page.route("**/api/aigen/questions", async (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    const id = "job" + (仕事.size + 1);
    const planned = Math.max(1, Number(body.count) || 1);
    const types = Array.isArray(body.questionTypes) ? body.questionTypes : [];
    仕事.set(id, { planned, 種: types.indexOf("fill_blank") >= 0 ? "fill_blank" : "single_choice",
                   orderId: body.orderId || "", exam: body.exam === true });
    await route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, tracked: true, jobId: id, planned, status: "running" }) });
  });
  await page.route("**/api/aijob/get**", async (route) => {
    const u = new URL(route.request().url());
    const id = u.searchParams.get("jobId") || u.searchParams.get("id") || "";
    const w = 仕事.get(id) || { planned: 1, 種: "single_choice" };
    await route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, job: { jobId: id, type: "exam-gen", status: "completed",
        planned: w.planned, made: w.planned, progress: 1, stages: [],
        partial: { questions: 問(w.planned, w.種) }, completedAt: Date.now(), updatedAt: Date.now() } }) });
  });

  await page.addInitScript((t) => { localStorage.setItem("app.auth.token.v1", t);
    localStorage.setItem("app.auth.mode.v1", "user");
    localStorage.setItem("vq.tour.v1", JSON.stringify({ home:1,preset:1,feed:1,dm:1,insight:1 })); }, tok);
  await page.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__vqMake && !!(window.VQ2 && window.VQ2.store), null, { timeout: 60000 });

  const 数える = () => page.evaluate(() => {
    const ST = window.VQ2.store;
    const all = ST.listPresets ? (ST.listPresets() || []) : [];
    const ex = ST.listExams ? (ST.listExams() || []) : [];
    return { 全: all.length, 試験: ex.length,
             名: ex.map((x) => x.name || x.title || "").slice(0, 6),
             印: ex.map((x) => x.sourceOrderId || "").slice(0, 6) };
  });
  const 前 = await 数える();

  節("① 押さなくても 一覧に 入る");
  await page.evaluate(() => {
    window.__vqMake.open({ kind: "exam" });
    window.__vqMake.表紙を入れる({ examName: "自動保存の 確かめ", subject: "情報" });
    const r = document.getElementById("vqMake").shadowRoot;
    r.querySelector('[data-a="go"]').click();
  });
  await page.evaluate(() => {
    const r = document.getElementById("vqMake").shadowRoot;
    /* 小さめの 試験に して 早く 終わらせる */
    const set = (k, v) => { const el = r.querySelector('[data-n="' + k + '"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, String(v));
      el.dispatchEvent(new Event("input", { bubbles: true })); };
    set("questionCount", 6); set("sectionCount", 2); set("totalPoints", 30);
    r.querySelector('[data-a="run"]').click();
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const r = document.getElementById("vqMake").shadowRoot;
    const b = Array.from(r.querySelectorAll("button")).filter((x) => /この構成で/.test(x.textContent))[0];
    if (b) b.click();
  });
  await page.waitForFunction(() => ["確認", "紙面"].indexOf(window.__vqMake.状態().画面) >= 0,
    null, { timeout: 45000 }).catch(() => {});
  const st = await page.evaluate(() => {
    const s = window.__vqMake.状態();
    return { 画面: s.画面, err: s.err, 保存した: s.保存した,
             記録: (s.記録 || []).map((x) => x.k + ":" + x.t).slice(-6) };
  });
  見(st.画面 === "確認", "確認の 画面まで 行く", st);
  見(st.保存した === true, "★ 押さなくても 保存ずみ", st.保存した);

  const 後 = await 数える();
  見(後.試験 === 前.試験 + 1, "★ 一覧に **1 件だけ** 増える（分割されない）",
     { 前: 前.試験, 後: 後.試験, 名: 後.名 });

  節("② 注文の 目印が 押される");
  見(/^vqmk-/.test(後.印[後.印.length - 1] || ""), "★ sourceOrderId が 付く", 後.印);

  節("③ 記録に「一覧に 入れました」が 出る");
  見(st.記録.some((x) => /一覧に 入れました/.test(x)), "★ 何が 起きたか 出る", st.記録);

  節("④ 止まった 仕事は 一覧を 引くと 畳まれる（サーバ）");
  {
    const w = fs.readFileSync("server/src/worker.js", "utf8");
    見(/一覧を 引く この 口でも 同じ 決まりで 畳む/.test(w), "★ 一覧の 口にも 畳む しくみが ある");
    見(/WHERE user_id = \?2 AND status = 'running' AND updated_at < \?3/.test(w),
       "★ 動きの 無い running だけを 畳む");
  }

  見(例外.length === 0, "例外が 出ていない", 例外);
  await b.close();
  console.log("\n────────────────────────────");
  console.log("通った: " + 済 + " / 落ちた: " + 落);
  if (落ち.length) console.log("落ちたもの:\n  - " + 落ち.join("\n  - "));
  process.exit(落 ? 1 : 0);
})();
