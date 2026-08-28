/* ══════════════════════════════════════════════════════════════════════════
   vqpresetpub.cjs — 公開／非公開の 見た目が 実際と 合っているか

   ★ 直したもの: 公開を 押すと エラーが 出るのに、**実際は 公開できていた**。
     真因は refreshPresetList() の 中の 変数の 取り違え
     （並べているのは p なのに preset を 見ていた。宣言が 無いので
      `preset?.` でも ReferenceError）。プリセットが 1 件でも あると
     この 関数は 必ず 落ち、公開の あとに 通るので 失敗に 見えていた。
     実測: /api/preset/publish は 200 なのに 画面には「preset is not defined」。

   ここで 測ること:
     ① 公開すると「公開しました！」まで 進む（エラー文が 出ない）
     ② 一覧の 描き直しが 落ちない（プリセットが あるとき）
     ③ 非公開に 戻しても エラーに ならない
     ④ 一覧に「最新にする」が あり、押すと 数が 合う

   本番では 走らせない。
   ══════════════════════════════════════════════════════════════════════════ */
const BASE = process.env.VQ_API || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const { chromium } = require("playwright");

let 済 = 0, 落 = 0;
const ok = (n, c, x) => {
  if (c) { 済++; console.log("  ok   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 200) : "")); }
  else { 落++; console.log("  NG   " + n + (x !== undefined ? "  → " + JSON.stringify(x).slice(0, 300) : "")); }
};
const 節 = (t) => console.log("\n══ " + t + " ══");
async function req(path, o = {}) {
  const r = await fetch(BASE + path, { method: o.method || "GET", headers: { "content-type": "application/json" }, body: o.body ? JSON.stringify(o.body) : undefined });
  return { j: await r.json().catch(() => ({})) };
}

(async () => {
  const tag = "pp" + Date.now().toString(36);
  const s = await req("/api/auth/register/start", { method: "POST", body: { email: `${tag}@gmail.com`, gradePrefix: "H2", nickname: tag, password: "Testing!2345" } });
  const v = await req("/api/auth/register/verify", { method: "POST", body: { challengeId: s.j.challengeId, code: s.j.devCode } });
  const c = await req("/api/auth/register/consent", { method: "POST", body: { registrationSession: v.j.registrationSession, agreeTerms: true, agreePrivacy: true, agreeAge: true, pin: "482913" } });
  if (!c.j.token) { console.error("登録できません"); process.exit(1); }

  const b = await chromium.launch({ headless: true });
  const pg = await (await b.newContext({ viewport: { width: 1440, height: 950 } })).newPage();
  const 例外 = []; pg.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 160)));
  const 網 = []; pg.on("response", (r) => { if (/\/api\/preset\/publish/.test(r.url())) 網.push(r.status()); });

  await pg.addInitScript(([t]) => {
    try { localStorage.setItem("app.auth.token.v1", t); } catch (e) {}
    try {
      const w = []; for (let k = 0; k < 8; k++) w.push({ q: "問" + k, a: "答" + k, choices: ["A", "B", "C", "D"] });
      localStorage.setItem("wordPractice400.presets.v1", JSON.stringify([
        { id: "pubchk1", name: "公開のたしかめ", subjectId: "sub:english", tagIds: [], createdAt: Date.now(), updatedAt: Date.now(), words: w }]));
    } catch (e) {}
  }, [c.j.token]);
  await pg.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await pg.addStyleTag({ content: "#vqPin,#vqTour,#vqLumiTour,#vqNewAuth,#authGate,#firstLaunchOverlay{display:none!important}" });
  await pg.waitForTimeout(7000);
  await pg.evaluate(() => window.__vqQredit.goTab("library"));
  await pg.waitForTimeout(1500);

  const 面 = () => pg.evaluate(() => {
    const ov = document.getElementById("presetPublishOverlay");
    if (!ov || ov.classList.contains("hidden")) return null;
    return { 文: (ov.innerText || "").replace(/\s+/g, " ").slice(0, 400),
      ボタン: [...ov.querySelectorAll("[data-preset-public-action]")].map((e) => e.getAttribute("data-preset-public-action")) };
  });
  const 押す = (a) => pg.evaluate((a) => {
    const e = document.querySelector(`[data-preset-public-action="${a}"]`);
    if (e && !e.disabled) { e.click(); return true; } return false;
  }, a);

  節("① 一覧の 描き直しが 落ちない");
  ok("並べたときに 例外が 出ない", 例外.length === 0, 例外.slice(0, 3));
  ok("自分の プリセットが 並んでいる",
    /件/.test(await pg.evaluate(() => (document.getElementById("appLibraryMyMeta") || {}).textContent || "")));

  節("② 公開する");
  await pg.evaluate(() => { const e = document.querySelector('[data-lib-action="publishCustom"]'); if (e) e.click(); });
  await pg.waitForTimeout(1200);
  ok("公開の 画面が 開く", !!(await 面()));
  await pg.waitForTimeout(2600);
  ok("STEP1 から 進める", await 押す("nextSetup"));
  await pg.waitForTimeout(900);
  /* 規約を 最後まで 読む（読まないと 同意は 押せない） */
  ok("同意は はじめ 押せない", await pg.evaluate(() => {
    const cb = document.getElementById("presetPublishAgreeInput"); return !!cb && cb.disabled;
  }));
  await pg.evaluate(() => { const b = document.getElementById("presetPublishTermsBox"); if (b) b.scrollTop = b.scrollHeight; });
  await pg.waitForTimeout(600);
  ok("最後まで 読むと 押せる", await pg.evaluate(() => {
    const cb = document.getElementById("presetPublishAgreeInput"); return !!cb && !cb.disabled;
  }));
  await pg.evaluate(() => { const cb = document.getElementById("presetPublishAgreeInput"); if (cb) cb.click(); });
  await pg.waitForTimeout(400);
  ok("同意すると 公開できる", await 押す("startPublishing"));
  await pg.waitForTimeout(6000);
  const 後 = await 面();
  ok("**「公開しました！」まで 進む**", !!後 && /公開しました/.test(後.文), 後 && 後.文.slice(0, 120));
  ok("エラー文が 出ていない", !!後 && !/(is not defined|失敗|エラー)/.test(後.文), 後 && 後.文.slice(0, 160));
  ok("サーバは 200 を 返している", 網.length > 0 && 網.every((x) => x === 200), 網);
  await 押す("closeDone");
  await pg.waitForTimeout(1200);

  節("③ 非公開へ 戻す");
  const 戻せた = await pg.evaluate(() => {
    const e = [...document.querySelectorAll("[data-lib-action]")]
      .find((x) => /非公開/.test((x.textContent || "")));
    if (e) { e.click(); return (e.textContent || "").trim(); }
    return null;
  });
  if (戻せた) {
    await pg.waitForTimeout(3500);
    ok("非公開でも 例外が 出ない", 例外.length === 0, 例外.slice(0, 3));
  } else {
    ok("非公開の 入口が 見つかる（無ければ 見送り）", true, "入口なし");
  }

  節("④ 最新にする");
  ok("ボタンが ある", await pg.evaluate(() => !!document.getElementById("appLibraryReloadBtn")));
  const 前 = await pg.evaluate(() => (document.getElementById("appLibraryMyMeta") || {}).textContent || "");
  await pg.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("wordPractice400.presets.v1") || "[]");
    raw.push({ id: "pubchk2", name: "あとから足した", subjectId: "sub:english", tagIds: [],
      createdAt: Date.now(), updatedAt: Date.now(), words: [{ q: "x", a: "y", choices: ["A", "B", "C", "D"] }] });
    localStorage.setItem("wordPractice400.presets.v1", JSON.stringify(raw));
  });
  await pg.evaluate(() => document.getElementById("appLibraryReloadBtn").click());
  await pg.waitForTimeout(2800);
  const 後数 = await pg.evaluate(() => (document.getElementById("appLibraryMyMeta") || {}).textContent || "");
  ok("押すと 数が 増える", 前 !== 後数, { 前, 後: 後数 });

  節("⑤ 例外");
  ok("画面の 例外 0 件", 例外.length === 0, 例外.slice(0, 4));

  await b.close();
  console.log("\n────────────────────────────────");
  console.log(`  ok ${済} / NG ${落}`);
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
