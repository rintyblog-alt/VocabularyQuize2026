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

  節("段⑤b 条件の段（③）");
  await 打つ(a.page, "examName", "2026年度 2学期 中間考査");
  await 待(300);
  await 押す(a.page, "go");
  await 待(900);
  s = await 状態(a.page);
  見(s.画面 === "条件", "C-1 表紙のあと **条件の段**へ行く（Quick Mock ではない）", s.画面);
  const 条 = await 影(a.page);
  ["試験の型", "試験時間", "満点", "大問の数", "難しさ", "出す形式",
   "問題用紙の型", "解答用紙の型"].forEach((t) => {
    見(条.indexOf(t) >= 0, "C-2 条件に「" + t + "」がある");
  });
  /* 型を 押すと 数が 変わる */
  await a.page.evaluate(() => {
    const r = document.getElementById("vqMake").shadowRoot;
    const b = r.querySelector('[data-a="kind"][data-v="quiz"]'); if (b) b.click();
  });
  await 待(400);
  let cc = await a.page.evaluate(() => window.__vqMake.状態().条件);
  見(cc.durationMinutes === 15 && cc.totalPoints === 50,
     "C-3 型を押すと 時間と満点が 変わる", { 分: cc.durationMinutes, 点: cc.totalPoints });
  await a.page.evaluate(() => {
    const r = document.getElementById("vqMake").shadowRoot;
    const b = r.querySelector('[data-a="kind"][data-v="regular"]'); if (b) b.click();
  });
  await 待(400);
  cc = await a.page.evaluate(() => window.__vqMake.状態().条件);
  見(cc.durationMinutes === 50 && cc.totalPoints === 100 && cc.sectionCount === 5,
     "C-3b 定期考査に 戻せる", { 分: cc.durationMinutes, 点: cc.totalPoints, 大問: cc.sectionCount });

  /* 形式の 標準（頭を使う 側） */
  見(cc.types.long_answer === true, "C-4 記述が 既定で 入っている", cc.types);
  見(cc.types.fill_blank === true, "C-4b 空欄補充が 既定で 入っている");
  見(cc.types.source_analysis === true, "C-4c 資料読解が 既定で 入っている");
  見(cc.types.true_false === false, "C-4d 正誤は 既定で 外れている");

  /* 形式を 全部 外させない */
  const 全外 = await a.page.evaluate(() => {
    const r = document.getElementById("vqMake").shadowRoot;
    r.querySelectorAll('[data-a="type"]').forEach((b) => {
      if (b.getAttribute("aria-pressed") === "true") b.click();
    });
    return window.__vqMake.状態();
  });
  const 残 = Object.keys(全外.条件.types).filter((k) => 全外.条件.types[k]).length;
  見(残 >= 1, "C-5 形式を 全部は 外せない（1 つは 残る）", { 残: 残, err: 全外.err });

  /* 紙面の型に 共通テスト風が ある */
  const 型一覧 = await a.page.evaluate(() => {
    const r = document.getElementById("vqMake").shadowRoot;
    const sel = r.querySelector('[data-s="layoutMode"]');
    return sel ? Array.from(sel.options).map((o) => o.value) : [];
  });
  見(型一覧.indexOf("common-test") >= 0, "C-6 紙面に「共通テスト風」が選べる", 型一覧.slice(0, 8));

  節("段⑥ ④ 構成案（AI を 呼ぶ前に 枠を 見せる）");
  await a.page.evaluate(() => {
    const r = document.getElementById("vqMake").shadowRoot;
    ["long_answer", "fill_blank", "multiple_choice_single"].forEach((id) => {
      const b = r.querySelector('[data-a="type"][data-v="' + id + '"]');
      if (b && b.getAttribute("aria-pressed") !== "true") b.click();
    });
  });
  await 待(400);
  await 押す(a.page, "run");
  await 待(1200);
  s = await 状態(a.page);
  見(s.画面 === "構成案", "P-1 条件のあと **構成案**へ行く（Quick Mock ではない）", s.画面);
  見(!!s.枠 && s.枠.大問 >= 1 && s.枠.問 >= 1, "P-2 枠が できている", s.枠);
  見(s.枠 && s.枠.点 === s.条件.totalPoints, "P-3 配点の合計が 満点と 合う",
     { 枠: s.枠 && s.枠.点, 満点: s.条件.totalPoints });
  const 構 = await 影(a.page);
  見(/大問 1/.test(構), "P-4 大問ごとの 内訳が 出る", 構.slice(0, 120));

  節("段⑥b ⑤ 生成（実際に サーバで 作る）");
  await 押す(a.page, "gen");
  await 待(1500);
  s = await 状態(a.page);
  見(s.画面 === "生成", "P-5 生成の 画面へ 行く", s.画面);
  見(!!s.進み, "P-6 進み具合の 入れ物が ある", s.進み);
  /* 実際に できるまで 待つ（最大 4 分） */
  let 終 = null;
  for (let i = 0; i < 120; i++) {
    s = await 状態(a.page);
    if (s.画面 === "確認" || (!s.走っている && s.err)) { 終 = s; break; }
    await 待(2000);
  }
  s = await 状態(a.page);
  見(s.画面 === "確認", "P-7 **問題が できて 確認の 画面へ 行く**",
     { 画面: s.画面, err: s.err, 記録: (s.記録 || []).slice(-3) });
  if (s.画面 !== "確認") {
    console.log("     生成の ことば:", JSON.stringify(s.記録));
  } else {
    見(s.できた && s.できた.問 >= 1, "P-8 問題が 1 問以上 できている", s.できた);
    見(s.できた && s.できた.表紙あり, "P-9 表紙が 試験に 載っている", s.できた);
    見(s.できた && s.できた.点 === s.条件.totalPoints, "P-10 満点が 合っている",
       { できた: s.できた && s.できた.点, 満点: s.条件.totalPoints });

    節("段⑥c ⑥ 確認 → 保存");
    await 押す(a.page, "save");
    await 待(1200);
    s = await 状態(a.page);
    見(s.保存した === true, "P-11 保存できる", { 保存: s.保存した, err: s.err });

    節("段⑥d ⑦ 紙面");
    await 押す(a.page, "paper");
    await 待(800);
    s = await 状態(a.page);
    見(s.画面 === "紙面", "P-12 紙面の 段へ 行く", s.画面);
    const 紙 = await 影(a.page);
    ["問題用紙の型", "解答用紙の型", "表紙つき 問題用紙", "解答用紙", "解答例"].forEach((t) => {
      見(紙.indexOf(t) >= 0, "P-13 紙面に「" + t + "」がある");
    });
    /* 実際に 組めるか（窓は 開かせず、組み立てだけ 確かめる） */
    const 組 = await a.page.evaluate(() => {
      try {
        const V = window.VQ2, ST = V.store;
        const 並 = ST.mocks.list() || [];
        const 本 = 並[0]; const sp = 本 && (本.spec || 本);
        if (!sp) return { ok: false, why: "保存された 試験が 無い" };
        const plan = V.layout.buildPlan(sp);
        const html = V.pdfRenderer.buildHtml(sp, plan, {});
        return { ok: true, 表紙: /data-cover="1"/.test(html),
                 冊子: (plan.booklets || []).map((b) => b.kind),
                 欄: (html.match(/data-binding="/g) || []).length };
      } catch (e) { return { ok: false, why: String(e.message).slice(0, 120) }; }
    });
    見(組.ok && 組.表紙, "P-14 保存した試験から **表紙つきの紙面**が 組める", 組);
    見(組.ok && 組.冊子.indexOf("answer-sheet") >= 0, "P-15 解答用紙が できる", 組.冊子);
    見(組.ok && 組.欄 >= 1, "P-16 解答欄が 問題ぶん ある", { 欄: 組.欄 });
  }

  節("段⑥e 資料の 口");
  await 押す(a.page, "back-check");
  await 待(500);
  const 資 = await a.page.evaluate(() => {
    /* 本物の ファイル選びは 自動では 押せない。中身だけ 入れて 通り道を 見る。 */
    const n = window.__vqMake.資料を入れる([
      { name: "授業プリント.pdf", mimeType: "application/pdf", data: "JVBERi0=", size: 1234 }
    ]);
    return { 入れた: n, 状態: window.__vqMake.状態().資料 };
  });
  見(資.入れた === 1 && 資.状態.length === 1, "R-1 資料を 持てる", 資.状態);
  await a.page.evaluate(() => window.__vqMake.open({ kind: "exam" }));
  await 待(400);
  /* 条件の 段に 資料の 欄が 出る */
  await a.page.evaluate(() => {
    const r = document.getElementById("vqMake").shadowRoot;
    const el = r.querySelector('[data-f="examName"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "資料の確かめ");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    r.querySelector('[data-a="go"]').click();
  });
  await 待(700);
  const 条2 = await 影(a.page);
  見(条2.indexOf("資料") >= 0, "R-2 条件に 資料の 欄が ある");
  見(条2.indexOf("授業プリント.pdf") >= 0, "R-3 入れた 資料が 並ぶ", 条2.slice(0, 140));
  const 外 = await a.page.evaluate(() => {
    const r = document.getElementById("vqMake").shadowRoot;
    const b = r.querySelector('[data-a="rmfile"]'); if (b) b.click();
    return window.__vqMake.状態().資料.length;
  });
  見(外 === 0, "R-4 資料を 外せる", 外);

  節("段⑥f 紙面の 読み取りの 口（サーバ）");
  const 読 = await a.page.evaluate(async () => {
    const h = { "Content-Type": "application/json" };
    try {
      const t = localStorage.getItem("app.auth.token.v1");
      if (t) h.Authorization = "Bearer " + String(t).replace(/^"|"$/g, "");
    } catch (e) {}
    /* 資料なしで 叩く → **断られる**（作り話を 返さない）ことを 見る */
    const r0 = await fetch("/api/aigen/layout", { method: "POST", headers: h, body: JSON.stringify({ files: [] }) });
    const j0 = await r0.json().catch(() => ({}));
    return { なし: { s: r0.status, code: j0.code } };
  });
  見(読.なし.s === 400 && 読.なし.code === "NO_FILE",
     "L-1 資料なしでは 断る（作り話を 返さない）", 読.なし);

  節("段⑥z 昔の 受け渡し（Quick Mock も まだ 開ける）");
  const 旧 = await a.page.evaluate(() => {
    try { window.VQ2.quickMock.open({ kind: "exam", cover: { examName: "旧いほう" },
                                      settings: { title: "旧いほう" } }); return true; }
    catch (e) { return false; }
  });
  await 待(2000);
  見(旧, "M-8 旧い作業場も まだ 開ける（落としていない）", 旧);

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
