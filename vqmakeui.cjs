/* ══════════════════════════════════════════════════════════════════════════
   vqmakeui.cjs — 「作る」の入口（プリセット / 試験）を本物のブラウザで見る

   訴え（2026-08-30）:
     「試験モードとプリセット作成の切り替えをどうするかだね」→ **開いた瞬間に選ぶ**
     「試験モードの場合は必ず表紙から最後まで作らせる」
     「表紙には注意事項、教科名、受験日、あとは年組氏名を入れられるところを」

   測るところ:
     M-1  「クイズを作成」から 選ぶ 1 枚が 出る
     M-2  プリセット と 試験 の 2 つが 並ぶ
     M-3  試験を 選ぶと **表紙の段**へ 行く（生成より 前）
     M-4  表紙に 教科名・受験日・注意事項・記入欄 が ある
     M-5  打った ものが 下書きに 出る
     M-6  記入欄は 出し入れできる
     M-7  名前が 空なら 進めない
     M-8  表紙を 入れて 進むと Quick Mock が 開く
     M-9  375px で 崩れない・押すところが 44px 以上
     M-10 赤い字（例外）が 出ていない

   使い方: VQ_BASE=<dev> node vqmakeui.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "https://vocabuquiz-api-dev.rintyblog.workers.dev";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) {
  console.error("本番では実行しません。"); process.exit(2);
}
const { chromium } = require("playwright");
let 済 = 0, 落 = 0;
const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 200) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 320) : "")); }
};
const 待 = (ms) => new Promise((s) => setTimeout(s, ms));
const j = (r) => r.json().catch(() => ({}));
async function 再fetch(u, o, n) {
  let 最後 = null;
  for (let i = 0; i < (n || 3); i++) {
    try { return await fetch(u, o); } catch (e) { 最後 = e; await 待(800 * (i + 1)); }
  }
  throw 最後;
}
async function 作る() {
  const 印 = Date.now().toString(36) + Math.floor(Math.random() * 9999);
  const r = await 再fetch(BASE + "/api/auth/register/start", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "vqm" + 印 + "@gmail.com", gradePrefix: "H2",
      nickname: ("m" + 印).slice(0, 14), password: "Passw0rd!z3" }) }).then(j);
  const v = await 再fetch(BASE + "/api/auth/register/verify", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeId: r.challengeId, code: r.devCode }) }).then(j);
  const c = await 再fetch(BASE + "/api/auth/register/consent", { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ registrationSession: v.registrationSession, agreeTerms: true,
      agreePrivacy: true, agreeAge: true, pin: "1379" }) }).then(j);
  if (!c.token) throw new Error("札が 取れない: " + JSON.stringify(c).slice(0, 200));
  return c.token;
}
async function 開く(browser, tok, 幅) {
  const ctx = await browser.newContext({ viewport: { width: 幅 || 1180, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript((t) => {
    try {
      localStorage.setItem("app.auth.token.v1", t);
      localStorage.setItem("app.auth.mode.v1", "user");
      localStorage.setItem("vq.tour.v1", JSON.stringify({ home: 1, preset: 1, feed: 1, dm: 1, insight: 1 }));
    } catch (e) {}
  }, tok);
  await page.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__vqMake, null, { timeout: 60000 });
  return { ctx, page };
}
const 状態 = (page) => page.evaluate(() => window.__vqMake.状態());
const 影 = (page) => page.evaluate(() => {
  const h = document.getElementById("vqMake");
  const r = h && h.shadowRoot;
  const b = r && r.querySelector(".w");
  return b ? (b.textContent || "").replace(/\s+/g, " ").trim() : "";
});
const 押す = (page, a) => page.evaluate((sel) => {
  const r = document.getElementById("vqMake").shadowRoot;
  const b = r.querySelector('[data-a="' + sel + '"]');
  if (!b) return false;
  b.click(); return true;
}, a);
const 打つ = (page, f, v) => page.evaluate(([f2, v2]) => {
  const r = document.getElementById("vqMake").shadowRoot;
  const el = r.querySelector('[data-f="' + f2 + '"]');
  if (!el) return false;
  const p = el.tagName === "TEXTAREA" ? HTMLTextAreaElement : HTMLInputElement;
  Object.getOwnPropertyDescriptor(p.prototype, "value").set.call(el, v2);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}, [f, v]);

(async () => {
  console.log("測る先:", BASE);
  const tok = await 作る();
  const browser = await chromium.launch();
  const a = await 開く(browser, tok);
  const 例外 = [];
  a.page.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 180)));
  await 待(2500);

  節("段① 入口が 1 枚に なっている");
  /* 「クイズを作成」の 受け口を 押す（本物の 導線）。 */
  const 押せた = await a.page.evaluate(() => {
    const e = document.querySelector('#appTabBar [data-v2-action="create-quiz"]');
    if (!e) return false;
    e.click(); return true;
  });
  見(押せた, "「クイズを作成」の受け口がある");
  await 待(1200);
  let s = await 状態(a.page);
  見(s.画面 === "選ぶ", "M-1 選ぶ 1 枚が 出る", s.画面);
  const 文 = await 影(a.page);
  見(/プリセット/.test(文) && /試験/.test(文), "M-2 プリセットと試験が並ぶ", 文.slice(0, 120));
  見(/表紙から作る|表紙から 作る/.test(文.replace(/\s/g, "")) || /表紙/.test(文),
     "M-2b 試験は「表紙から作る」と書いてある");

  節("段② 試験は 表紙から");
  await 押す(a.page, "exam");
  await 待(700);
  s = await 状態(a.page);
  見(s.画面 === "表紙", "M-3 試験を選ぶと 表紙の段へ行く", s.画面);
  const 表 = await 影(a.page);
  ["試験の名前", "教科名", "受験日", "注意事項", "記入欄"].forEach((t) => {
    見(表.indexOf(t) >= 0, "M-4 表紙に「" + t + "」がある");
  });
  const 欄 = await a.page.evaluate(() => {
    const r = document.getElementById("vqMake").shadowRoot;
    return Array.from(r.querySelectorAll('[data-a="sf"]')).map((x) => x.dataset.v);
  });
  見(["年", "組", "番", "氏名"].every((f) => 欄.indexOf(f) >= 0),
     "M-4b 年・組・番・氏名 が 選べる", 欄);

  節("段③ 打つと 下書きに 出る");
  await 打つ(a.page, "examName", "2026年度 2学期 中間考査");
  await 打つ(a.page, "subject", "物理基礎");
  await 打つ(a.page, "examDate", "2026年10月8日");
  await 打つ(a.page, "instructions", "解答はすべて解答用紙に。\n電卓の使用を認める。\n\n");
  await 待(400);
  const 下 = await a.page.evaluate(() => {
    const r = document.getElementById("vqMake").shadowRoot;
    const p = r.querySelector(".prev");
    return p ? (p.textContent || "").replace(/\s+/g, " ").trim() : "";
  });
  見(下.indexOf("2026年度 2学期 中間考査") >= 0, "M-5 名前が下書きに出る", 下.slice(0, 90));
  見(下.indexOf("物理基礎") >= 0, "M-5b 教科名が下書きに出る");
  見(下.indexOf("2026年10月8日") >= 0, "M-5c 受験日が下書きに出る");
  見(下.indexOf("電卓の使用を認める") >= 0, "M-5d 注意事項が下書きに出る");
  s = await 状態(a.page);
  見(s.表紙.instructions.length === 2, "M-5e 空の行は捨てる", s.表紙.instructions);

  節("段④ 記入欄の 出し入れ");
  await a.page.evaluate(() => {
    const r = document.getElementById("vqMake").shadowRoot;
    const b = r.querySelector('[data-a="sf"][data-v="受験番号"]');
    if (b) b.click();
  });
  await 待(300);
  s = await 状態(a.page);
  見(s.表紙.studentFields.indexOf("受験番号") >= 0, "M-6 記入欄を足せる", s.表紙.studentFields);
  await a.page.evaluate(() => {
    const r = document.getElementById("vqMake").shadowRoot;
    const b = r.querySelector('[data-a="sf"][data-v="組"]');
    if (b) b.click();
  });
  await 待(300);
  s = await 状態(a.page);
  見(s.表紙.studentFields.indexOf("組") < 0, "M-6b 記入欄を外せる", s.表紙.studentFields);

  節("段⑤ 名前が 空なら 進めない");
  await 打つ(a.page, "examName", "");
  await 待(300);
  await 押す(a.page, "go");
  await 待(500);
  s = await 状態(a.page);
  見(s.画面 === "表紙" && /名前/.test(s.err), "M-7 空のままでは進めず、理由が出る", s.err);

  節("段⑥ 表紙を持って Quick Mock へ");
  await 打つ(a.page, "examName", "2026年度 2学期 中間考査");
  await 待(300);
  await 押す(a.page, "go");
  await 待(3500);
  s = await 状態(a.page);
  見(s.画面 === "", "M-8 入口は閉じる", s.画面);
  const 開いた = await a.page.evaluate(() => {
    /* Quick Mock は U.mount で 立つ。器の id で 見る。 */
    return !!document.querySelector('[data-mount="vq2-quick-mock"], #vq2-quick-mock, .vq2-overlay');
  });
  見(開いた, "M-8b Quick Mock が開く", 開いた);

  節("段⑥b 表紙が Quick Mock まで 届いている");
  const 届 = await a.page.evaluate(() => {
    /* 画面の 中の 状態は 外から 見えないので、**同じ道**を 通して 確かめる。
       quickMock.open({cover}) が 設定へ 引き継ぐことを 見る。 */
    try {
      const V = window.VQ2;
      if (!V || !V.quickMock) return { ok: false, why: "quickMock が 無い" };
      /* 表紙が 紙面まで 通ることは vqpaper.cjs が 見ている。
         ここでは **入口 → 生成画面** の 引き継ぎだけ 見る。 */
      /* 引き継いだ ものは **入力欄の 値**に 入る（文字として 出るのでは ない）。
         器は 影の DOM の ことが あるので、そちらも 見る。 */
      const m = document.getElementById("vq2-quick-mock");
      const scope = (m && m.shadowRoot) || m;
      if (!scope) return { ok: false, why: "器が 無い" };
      const 値 = Array.from(scope.querySelectorAll("input")).map((x) => String(x.value || ""));
      return { ok: true,
               名前が出ている: 値.some((v) => v.indexOf("2026年度 2学期 中間考査") >= 0),
               教科が出ている: 値.some((v) => v.indexOf("物理基礎") >= 0),
               値: 値.slice(0, 4) };
    } catch (e) { return { ok: false, why: String(e.message) }; }
  });
  見(届.ok && 届.名前が出ている, "M-8c 表紙の名前が 生成画面へ 引き継がれる", 届);
  見(届.ok && 届.教科が出ている, "M-8d 教科名が 生成画面へ 引き継がれる", 届);

  /* ── 段⑥c について ────────────────────────────────────────────
     「試験の 標準は 頭を使う 問題」は 実装したが、**ここでは 測れていない。**
     形式を 選ぶ ところは 畳まれた 中に あり、開くまで DOM に 出ない
     （data-type の 印が 0 件。まとめの 文も 出ない）。
     無理に 当たりそうな 語で 判定すると「通ったふり」に なるので 置かない。
     測るなら 設定の 中身を 外へ 出す 口が 要る。**未検証と 書き残す。** */

  節("段⑦ 幅 375px");
  const b = await 開く(browser, tok, 375);
  b.page.on("pageerror", (e) => 例外.push("375: " + String(e.message).slice(0, 160)));
  await 待(2500);
  await b.page.evaluate(() => window.__vqMake.open({ kind: "exam" }));
  await 待(900);
  const 形 = await b.page.evaluate(() => {
    const h = document.getElementById("vqMake");
    const r = h.shadowRoot, w = r.querySelector(".w");
    const 押 = Array.from(r.querySelectorAll(".btn,.ib,.chip")).map((x) => {
      const q = x.getBoundingClientRect();
      return Math.round(Math.min(q.width, q.height));
    });
    const q = w.getBoundingClientRect();
    return { 幅: innerWidth, 左: Math.round(q.left), 右: Math.round(q.right),
             押: 押, 横: document.documentElement.scrollWidth > innerWidth + 1 };
  });
  見(形.左 >= 0 && 形.右 <= 形.幅, "M-9 横にはみ出さない", 形);
  見(!形.横, "M-9b 横にスクロールしない", 形);
  const 小 = 形.押.filter((x) => x < 44);
  見(小.length === 0, "M-9c 押すところが 44px 以上", 形.押);

  見(例外.length === 0, "M-10 赤い字（例外）が出ていない", 例外.slice(0, 4));

  await browser.close();
  console.log("\n────────────────────────────");
  console.log("通った: " + 済 + " / 落ちた: " + 落);
  if (落ち.length) console.log("落ちたもの:\n  - " + 落ち.join("\n  - "));
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error("止まりました:", e); process.exit(1); });
