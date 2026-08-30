/* ══════════════════════════════════════════════════════════════════════════
   vqexamjobs.cjs — **試験づくりが プリセットを 増やさないか**を 測る

   訴え（2026-08-30・Rinty さん）
     「しかもプリセットも増殖されてるし。。何これまじ」
     「またプリセットに分割して一覧に追加されてるし。」

   なぜ 増えたか:
     1 回の「作って」は 中で 何回にも 分けて 頼まれる（20 問なら 4 回）。
     その 仕事に **プリセットづくりと 同じ 名札**（preset-gen）が 付いていたので、
     うしろの 拾い上げが 1 件ずつ プリセットに していた。
     しかも「画面が 受け取った」印は **10 分 たつと 無視される** 決まりなので、
     ちゃんと 受け取っていても、あとから もう一度 拾われていた。

   見るのは:
     ① 試験の 仕事には 別の 名札（exam-gen）が 付く
     ② 拾い上げは 名札で 見送る
     ③ 「こちらで 面倒を 見る」印（owned）は **取り消されない**
     ④ 注文の 目印（vqmk-）でも 見送る
     ⑤ 帯（作成中）には ちゃんと 出る（走っていることは 隠さない）

   使い方: VQ_BASE=http://127.0.0.1:8791 node vqexamjobs.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const fs = require("fs");
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const { chromium } = require("playwright");

let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 220) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 400) : "")); }
};
const j = (r) => r.json().catch(() => ({}));
async function 札() {
  const 印 = Date.now().toString(36) + Math.floor(Math.random() * 9999);
  const r = await fetch(BASE + "/api/auth/register/start", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "ej" + 印 + "@gmail.com", gradePrefix: "H2", nickname: ("e" + 印).slice(0,14), password: "Passw0rd!z3" }) }).then(j);
  const v = await fetch(BASE + "/api/auth/register/verify", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeId: r.challengeId, code: r.devCode }) }).then(j);
  const c = await fetch(BASE + "/api/auth/register/consent", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ registrationSession: v.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: "1379" }) }).then(j);
  if (!c.token) throw new Error("札が 取れない: " + JSON.stringify(c).slice(0, 200));
  return c.token;
}

/* ① サーバ側は コードを 直に 読む（AI を 呼ばずに 名札の 決まりを 見る） */
節("① 試験の 仕事には 別の 名札が 付く（サーバ）");
{
  const w = fs.readFileSync("server/src/worker.js", "utf8");
  見(/exam-gen/.test(w), "★ exam-gen という 名札が ある");
  見(/String\(o\.kind \|\| ""\) === "exam" \? "exam-gen" : "preset-gen"/.test(w),
     "★ kind が exam の ときだけ exam-gen に する");
  見(/kind: body\?\.exam === true \|\| String\(body\?\.kind \|\| ""\) === "exam" \? "exam" : ""/.test(w),
     "★ 試験の 頼み（exam:true）から 名札を 決める");
}

節("② 拾い上げは 名札・印・注文の 目印で 見送る（画面）");
{
  const c = fs.readFileSync("js-src/vq-core.4c23719c62.js", "utf8");
  見(/const 済み = all\.filter\(\(j\) => j && String\(j\.type \|\| ""\) === "preset-gen"/.test(c),
     "拾い上げは preset-gen だけを 見る");
  見(/jobOwned\(String\(j\.jobId \|\| ""\)\)\)/.test(c), "★「面倒を 見る」印を 見る");
  見(/!\/\^vqmk-\/\.test\(String\(j\.inputReference \|\| ""\)\)/.test(c), "★ 注文の 目印（vqmk-）でも 見送る");
  見(/t === "preset-gen" \|\| t === "exam-gen"/.test(c), "★ 帯（作成中）には 試験も 出す");
}

(async () => {
  console.log("\n測る先:", BASE);
  const tok = await 札();
  const b = await chromium.launch();
  const ctx = await b.newContext(); const page = await ctx.newPage();
  const 例外 = []; page.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 200)));
  await page.addInitScript((t) => { localStorage.setItem("app.auth.token.v1", t);
    localStorage.setItem("app.auth.mode.v1", "user");
    localStorage.setItem("vq.tour.v1", JSON.stringify({ home:1,preset:1,feed:1,dm:1,insight:1 })); }, tok);
  await page.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!(window.VQ2 && window.VQ2.aigen), null, { timeout: 60000 });

  節("③ 「面倒を 見る」印は 取り消されない");
  const 印 = await page.evaluate(() => {
    const A = window.VQ2.aigen;
    A.markJobOwned("job-abc");
    return { 付く: A.jobOwned("job-abc"), 別: A.jobOwned("job-xyz"),
             残る: JSON.parse(localStorage.getItem("vq2.aigen.owned.v1") || "[]").indexOf("job-abc") >= 0 };
  });
  見(印.付く === true, "★ 印が 付く");
  見(印.別 === false, "関係ない 仕事には 付かない");
  見(印.残る === true, "★ 読み込み直しても 残る（localStorage）");
  const 生き残り = await page.evaluate(async () => {
    location.reload();
    return true;
  }).catch(() => true);
  await page.waitForFunction(() => !!(window.VQ2 && window.VQ2.aigen), null, { timeout: 60000 });
  const 後 = await page.evaluate(() => window.VQ2.aigen.jobOwned("job-abc"));
  見(後 === true, "★ 読み込み直しても 効いている", 後);

  節("④ 試験づくりは 始まった 時点で 印を 付ける");
  {
    const c = fs.readFileSync("js-src/vq2-app.b85018b5b8.js", "utf8");
    見(/if \(o\.selfManaged === true\) \{[\s\S]{0,120}markJobOwned\(j\.jobId\)/.test(c),
       "★ selfManaged の 仕事は 始まった 時点で 印を 付ける");
    const m = fs.readFileSync("js-src/vq-make.js", "utf8");
    見(/selfManaged: true/.test(m), "★ 試験づくりは selfManaged で 頼む");
    見(/kind: "exam"/.test(m), "★ 試験づくりは kind:\"exam\" で 頼む");
    見(/注文番号 = "vqmk-"/.test(m), "★ 注文の 目印は vqmk- で 始まる");
  }

  見(例外.length === 0, "例外が 出ていない", 例外);
  await b.close();
  console.log("\n────────────────────────────");
  console.log("通った: " + 済 + " / 落ちた: " + 落);
  if (落ち.length) console.log("落ちたもの:\n  - " + 落ち.join("\n  - "));
  process.exit(落 ? 1 : 0);
})();
