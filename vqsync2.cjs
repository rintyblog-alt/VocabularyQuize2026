/* ══════════════════════════════════════════════════════════════════════════
   vqsync2.cjs — アカウント同期を **実際に 2 台で** 動かす（2026-08-26）

   訴え:「アカウント同士での 同期は 必ず 行うこと。
          例えば、プリセット、設定、インサイト、学習履歴」

   ★ ここは 形ではなく **本当に 揃うか**を 見る。
     ① 別々の 端末で 作った ものが 両方に 揃う（片方が 消えない）
     ② **消したら 消えたまま**（他端末から 生き返らない）＝ 抜け殻が 効く
     ③ 消した ぶんが **サーバへ 上がる**（更新時刻が 下がって 断られない）
     ④ 学習の 記録も 揃う（前は 端末だけだった）
     ⑤ 引いた 直後に 画面が 描き直る

   本番では 走らせない。   使いかた: node vqsync2.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const { chromium } = require("playwright");

let 済 = 0, 落 = 0; const 印 = []; const 落ち = [];
function ok(名, 真, 補) {
  if (真) { 済++; 印.push("  ✅ " + 名 + (補 === undefined ? "" : "  " + 短(補))); }
  else { 落++; 落ち.push(名); 印.push("  ❌ " + 名 + (補 === undefined ? "" : "  " + 短(補))); }
}
function 短(v) { const s = typeof v === "string" ? v : JSON.stringify(v); return String(s).slice(0, 240); }
function 節(t) { 印.push("\n── " + t + " " + "─".repeat(Math.max(0, 56 - t.length))); }

async function req(path, { method = "GET", body, token } = {}) {
  const h = { "content-type": "application/json" };
  if (token) h.authorization = "Bearer " + token;
  const r = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, j: await r.json().catch(() => ({})) };
}
async function 作る() {
  const tag = `sy${Date.now().toString(36)}`;
  const s = await req("/api/auth/register/start", { method: "POST",
    body: { email: `vqsy.${tag}@gmail.com`, gradePrefix: "H2", nickname: "sy" + tag, password: "Testing!2345" } });
  if (!s.j.devCode) throw new Error("devCode が返りません: " + JSON.stringify(s.j).slice(0, 160));
  const v = await req("/api/auth/register/verify", { method: "POST",
    body: { challengeId: s.j.challengeId, code: s.j.devCode } });
  const c = await req("/api/auth/register/consent", { method: "POST",
    body: { registrationSession: v.j.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: "482913" } });
  return c.j.token;
}

/* 1 台ぶんの ブラウザ（別々の 端末に 見せるため context を 分ける） */
async function 端末(b, token, 名) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const 失敗 = [];
  p.on("pageerror", (e) => 失敗.push(名 + ": " + String(e.message).slice(0, 140)));
  await p.addInitScript(([t]) => { try { localStorage.setItem("app.auth.token.v1", t); } catch (e) {} }, [token]);
  await p.goto(BASE + "/?vqdev=1&cb=" + Date.now(), { waitUntil: "domcontentloaded" });
  await p.waitForFunction(() => !!(window.VQ2 && window.VQ2.store && window.VQCLOUD),
    null, { timeout: 45000 }).catch(() => {});
  return { p, 失敗, ctx };
}
/* 口の 名前は VQCLOUD の 実物に 合わせる（いま揃える / 揃えを引く）。
   ★ evaluate に **文字列**を 渡すときは 呼び出しの () まで 書くこと。
     関数の 形だけ 渡すと **作られるだけで 呼ばれない**（実測で 踏んだ）。 */
const 揃える = `(async () => { try { return await window.VQCLOUD["いま揃える"](); } catch (e) { return {だめ:String(e)}; } })()`;
const 引く   = `(async () => { try { return await window.VQCLOUD["揃えを引く"](); } catch (e) { return {だめ:String(e)}; } })()`;

(async () => {
  const TOKEN = await 作る();
  const b = await chromium.launch({ headless: true });
  const A = await 端末(b, TOKEN, "A");
  const B = await 端末(b, TOKEN, "B");

  節("① 土台");
  const 口 = await A.p.evaluate(() => Object.keys(window.VQCLOUD || {}));
  ok("VQCLOUD が いる", 口.length > 0, 口);
  ok("VQ2.store が いる", await A.p.evaluate(() => !!(window.VQ2 && window.VQ2.store)));

  /* ── 作る ─────────────────────────────────── */
  節("② 別々の 端末で 作った ものが 両方に 揃う");
  /* ★ savePreset は 中身を 検査する（schemaVersion / name / 問題が 1 問以上）。
     形だけの ものを 渡すと VALIDATION で 弾かれ、
     「同期していない」ように 見えてしまう。ちゃんとした ものを 作る。 */
  const 作り = (id, 名) => ({
    schemaVersion: 2, id, name: 名,
    questions: [{ id: id + "_q1", number: 1, type: "multiple_choice_single",
                  prompt: "1 + 1 は？", question: "1 + 1 は？",
                  choices: [{ id: "a", text: "1", isCorrect: false },
                            { id: "b", text: "2", isCorrect: true }],
                  correctAnswer: "b" }]
  });
  const 作った = await A.p.evaluate((o) => window.VQ2.store.savePreset(o), 作り("sy_a1", "Aで作った"));
  ok("プリセットを 作れる（検査を 通る）", 作った && 作った.ok === true, 作った);
  await B.p.evaluate((o) => window.VQ2.store.savePreset(o), 作り("sy_b1", "Bで作った"));
  await A.p.evaluate(揃える); await B.p.evaluate(揃える);
  await A.p.waitForTimeout(1200);
  await A.p.evaluate(引く); await B.p.evaluate(引く);
  await A.p.waitForTimeout(1200);
  const 見 = async (pg) => pg.evaluate(() =>
    window.VQ2.store.listPresets({ includeLegacy: false }).map((x) => x.id).sort());
  const a1 = await 見(A.p), b1 = await 見(B.p);
  ok("★ A に 両方 ある", a1.includes("sy_a1") && a1.includes("sy_b1"), a1);
  ok("★ B に 両方 ある", b1.includes("sy_a1") && b1.includes("sy_b1"), b1);

  /* ── 消す ─────────────────────────────────── */
  節("③ 消したら **消えたまま**（生き返らない）");
  await A.p.evaluate(() => window.VQ2.store.deletePreset("sy_b1"));
  const a2 = await 見(A.p);
  ok("A の 一覧から 消えている", !a2.includes("sy_b1"), a2);
  const 墓 = await A.p.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("vq2.presets.v1") || "[]");
    const t = raw.filter((x) => x && x.deletedAt);
    return { 抜け殻: t.map((x) => x.id), 中身がある: t.some((x) => x.questions || x.title) };
  });
  ok("★ 抜け殻が 残っている（跡形なく 消していない）", 墓.抜け殻.includes("sy_b1"), 墓);
  ok("抜け殻に 中身は 残していない", 墓.中身がある === false, 墓);

  await A.p.evaluate(揃える);
  await A.p.waitForTimeout(1500);
  await B.p.evaluate(引く);
  await B.p.waitForTimeout(1500);
  const b2 = await 見(B.p);
  ok("★★ B からも 消えた（消しても 上がった＝時刻が 下がっていない）",
     !b2.includes("sy_b1"), b2);
  ok("消していない ぶんは 残っている", b2.includes("sy_a1"), b2);

  await B.p.evaluate(揃える);
  await B.p.waitForTimeout(1200);
  await A.p.evaluate(引く);
  await A.p.waitForTimeout(1200);
  const a3 = await 見(A.p);
  ok("★★ B から 引き直しても 生き返らない", !a3.includes("sy_b1"), a3);

  /* ── 学習の 記録 ───────────────────────────── */
  節("④ 学習の 記録も 揃う（前は 端末だけ だった）");
  const 送る鍵 = await A.p.evaluate(() => {
    try { return window.VQCLOUD["揃える鍵"] || null; } catch (e) { return null; }
  });
  await A.p.evaluate(() => {
    const k = "vq2.learn.sessions.v1";
    const now = new Date().toISOString();
    const me = window.VQ2.store.currentOwnerId();
    localStorage.setItem(k, JSON.stringify([
      { id: "ls_sync1", ownerId: me, userId: me, updatedAt: now, localDate: "2026-08-26", title: "同期テスト" }
    ]));
  });
  await A.p.evaluate(揃える);
  await A.p.waitForTimeout(1500);
  await B.p.evaluate(引く);
  await B.p.waitForTimeout(1500);
  const 学 = await B.p.evaluate(() => {
    try { return JSON.parse(localStorage.getItem("vq2.learn.sessions.v1") || "[]").map((x) => x.id); }
    catch (e) { return []; }
  });
  ok("★★ 学習セッションが 別の端末へ 届く", 学.includes("ls_sync1"), { 学, 送る鍵 });

  /* ── サーバに 本当に 入っているか ─────────────── */
  節("⑤ サーバ側にも 入っている");
  const 鯖 = await req("/api/account/store?key=vq2.learn.sessions.v1", { token: TOKEN });
  ok("サーバから 引ける", 鯖.status === 200 && 鯖.j && 鯖.j.value != null, 鯖.status);
  ok("★ 中身が 入っている", /ls_sync1/.test(String((鯖.j || {}).value || "")),
     String((鯖.j || {}).value || "").slice(0, 90));
  const 鯖P = await req("/api/account/store?key=vq2.presets.v1", { token: TOKEN });
  ok("★ プリセットの 抜け殻も サーバに ある（他端末が 引いて 消せる）",
     /"sy_b1"/.test(String((鯖P.j || {}).value || "")) && /deletedAt/.test(String((鯖P.j || {}).value || "")),
     String((鯖P.j || {}).value || "").slice(0, 140));

  節("⑥ 更新時刻の 印");
  const 印時 = await A.p.evaluate(() => {
    try { return JSON.parse(localStorage.getItem("vq.cloud.at.v1") || "{}"); } catch (e) { return {}; }
  });
  ok("★ 鍵ごとの 印が 残っている", Object.keys(印時).length > 0, Object.keys(印時));
  ok("プリセットの 印が ある", !!印時["vq2.presets.v1"], 印時["vq2.presets.v1"]);

  節("⑦ 画面の 落ち");
  ok("画面が 落ちていない", A.失敗.length === 0 && B.失敗.length === 0,
     A.失敗.concat(B.失敗).slice(0, 3));

  await b.close();
  console.log(印.join("\n"));
  console.log("\n══ 通った " + 済 + " / 落ちた " + 落 + " ══");
  if (落) console.log("落ちたもの:\n  - " + 落ち.join("\n  - "));
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error("例外: " + (e && e.stack || e)); process.exit(1); });
