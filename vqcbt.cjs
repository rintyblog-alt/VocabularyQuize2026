/* ══════════════════════════════════════════════════════════════════════════
   vqcbt.cjs — 試験が **CBT（左＝問題冊子／右＝解答欄）で 開くか**を 実物で 見る

   訴え（2026-08-30・Rinty さん）
     「しかも CBT に ならないし。試験モードに ならない。
       PDF が 左で、右を 解答欄でしょ？」

   分かった 真因は 2 つ:
     ① vq-make の 合図が かぶっていた。選ぶ画面の「試験」も、受験の ボタンも
        どちらも data-a="exam"。先に 出てくる 分岐で 必ず return するので、
        受験する() は **一度も 呼ばれていなかった**。
     ② 一覧の 試験カードは data-preset-start。vq2-app が 捕捉フェーズで
        横取りして **1 問ずつの 出題画面**を 開いていた。

   ここで 見るのは 1 つだけ:
     試験を 作った あと、**左に 紙面・右に 解答欄** が 出るか。

   使い方: VQ_BASE=http://127.0.0.1:8791 node vqcbt.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const { chromium } = require("playwright");

let 済 = 0, 落 = 0;
const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 220) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 400) : "")); }
};
const 待 = (ms) => new Promise((s) => setTimeout(s, ms));
const j = (r) => r.json().catch(() => ({}));

async function 札() {
  const 印 = Date.now().toString(36) + Math.floor(Math.random() * 9999);
  const H = { "Content-Type": "application/json" };
  const r = await fetch(BASE + "/api/auth/register/start", { method: "POST", headers: H,
    body: JSON.stringify({ email: "vqc" + 印 + "@gmail.com", gradePrefix: "H2",
      nickname: ("c" + 印).slice(0, 14), password: "Passw0rd!z3" }) }).then(j);
  const v = await fetch(BASE + "/api/auth/register/verify", { method: "POST", headers: H,
    body: JSON.stringify({ challengeId: r.challengeId, code: r.devCode }) }).then(j);
  const c = await fetch(BASE + "/api/auth/register/consent", { method: "POST", headers: H,
    body: JSON.stringify({ registrationSession: v.registrationSession, agreeTerms: true,
      agreePrivacy: true, agreeAge: true, pin: "1379" }) }).then(j);
  if (!c.token) throw new Error("札が 取れない");
  return c.token;
}

/* AI を 待たずに 測るため、**試験そのものは その場で 組む**。
   ここで 見たいのは 受験の 画面であって、生成では ない。 */
const 試験を置く = () => {
  const S = window.VQ2.schema;
  const qs = [];
  for (let i = 1; i <= 6; i++) {
    const 選 = i <= 3;
    qs.push({
      id: "q" + i, schemaVersion: S.SCHEMA_VERSION, sectionId: i <= 3 ? "s1" : "s2",
      number: i <= 3 ? i : i - 3, globalNumber: i,
      type: 選 ? "multiple_choice_single" : "short_answer",
      prompt: "設問 " + i + " の 本文", promptRichText: null, media: [],
      contentBlocks: i === 4
        ? [{ type: "chart", chartType: "bar", labels: ["東", "西"],
             series: [{ name: "量", values: [8, 5] }], caption: "産出量" }]
        : [],
      choices: 選 ? [{ id: "c1", text: "あ", isCorrect: true }, { id: "c2", text: "い", isCorrect: false },
                     { id: "c3", text: "う", isCorrect: false }, { id: "c4", text: "え", isCorrect: false }] : [],
      correctAnswer: 選 ? null : "こたえ", acceptedAnswers: 選 ? [] : ["こたえ"],
      explanation: "解説", choiceExplanations: null,
      answerBindingId: "b" + i, points: 10, criterionAllocation: null, scoringRubric: null,
      estimatedSeconds: 60, difficulty: "normal", topic: "単元", tags: [],
      sourceReferences: [], requiresReview: false, confidence: null, validationIssues: []
    });
  }
  const spec = {
    id: "cbt-test-1", schemaVersion: S.SCHEMA_VERSION, ownerId: "",
    title: "CBT の たしかめ", subject: "地理総合", grade: "高校2年",
    durationMinutes: 50, totalPoints: 60, instructions: "", sourceMode: "open",
    cover: { examName: "CBT の たしかめ", subject: "地理総合", examDate: "2026年8月30日",
             instructions: ["解答は 解答欄へ。"], studentFields: ["年", "組", "番", "氏名"] },
    sections: [
      { id: "s1", number: 1, title: "大問一", instructions: "", points: 30, questions: qs.slice(0, 3) },
      { id: "s2", number: 2, title: "大問二", instructions: "", points: 30, questions: qs.slice(3) }
    ],
    answerBindings: qs.map((q, i) => ({ id: "b" + (i + 1), questionId: q.id,
      sectionId: q.sectionId, number: String(i + 1), blankCount: 1,
      kind: i < 3 ? "choice" : "text" })),
    paper: { size: "A4", orientation: "portrait", columns: 1, writingDirection: "horizontal",
             margins: { top: 20, bottom: 20, left: 18, right: 18 } },
    layout: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  /* 器は preset（2026-08-30）。試験も プリセットの 一種として 置く。 */
  const r = window.VQ2.store.saveExam(spec, {});
  return { ok: !!(r && r.ok), id: spec.id, なぜ: (r && r.message) || "",
           試験か: !!window.VQ2.store.isExam(window.VQ2.store.getPreset(spec.id)) };
};

(async () => {
  console.log("測る先:", BASE);
  const tok = await 札();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await ctx.newPage();
  const 例外 = [];
  page.on("pageerror", (e) => 例外.push(String(e.message).slice(0, 200)));
  await page.addInitScript((t) => {
    try {
      localStorage.setItem("app.auth.token.v1", t);
      localStorage.setItem("app.auth.mode.v1", "user");
      localStorage.setItem("vq.tour.v1", JSON.stringify({ home: 1, preset: 1, feed: 1, dm: 1, insight: 1 }));
    } catch (e) {}
  }, tok);
  await page.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__vqMake, null, { timeout: 60000 });
  /* vq2-app は あとから 読む。読み終わるまで 待つ。 */
  await page.evaluate(() => { try { window.__vqLoadLibs && window.__vqLoadLibs(); } catch (e) {} });
  await page.waitForFunction(() => !!(window.VQ2 && window.VQ2.examWorkspace && window.VQ2.store),
    null, { timeout: 60000 });
  await 待(1200);

  節("① 合図が かぶっていない（真因①）");
  {
    /* 選ぶ画面の「試験」と 受験の ボタンが 同じ 合図なら、後ろは 死ぬ。 */
    await page.evaluate(() => window.__vqMake.open());
    await 待(600);
    const 出 = await page.evaluate(() => {
      const r = document.getElementById("vqMake").shadowRoot;
      return [...r.querySelectorAll("[data-a]")].map((e) => e.dataset.a);
    });
    見(出.indexOf("exam") >= 0, "選ぶ画面に「試験」の 札が ある", 出);
    await page.evaluate(() => {
      document.getElementById("vqMake").shadowRoot.querySelector('[data-a="exam"]').click();
    });
    await 待(500);
    const 画 = await page.evaluate(() => window.__vqMake.状態().画面);
    見(画 === "表紙", "「試験」を 押すと 表紙へ 行く（受験に なってしまわない）", 画);
    await page.evaluate(() => window.__vqMake.閉じる());
    await 待(300);
  }

  節("② 試験を 置いて、一覧の カードから 受験する（真因②）");
  const 置 = await page.evaluate(試験を置く);
  見(置.ok, "試験を 保存できた", 置);

  {
    /* 一覧を 開き直して、試験の カードが 出るのを 待つ。 */
    await page.evaluate(() => {
      const b = document.querySelector('#appTabBar [data-app-tab="library"]')
        || document.querySelector('[data-app-tab="library"]');
      if (b) b.click();
    });
    await 待(2500);
    const 札状 = await page.evaluate(() => {
      const h = document.getElementById("vqScreens");
      const r = h && h.shadowRoot;
      if (!r) return { なし: "vqScreens が ない" };
      const c = r.querySelector("[data-exam-open]");
      const g = r.querySelector("[data-exam-start]");
      return {
        カード: !!c, ボタン: !!g,
        文: g ? (g.textContent || "").trim() : "",
        札: c ? !!c.querySelector(".pc__badge") : false,
        表紙: c ? !!c.querySelector(".pc-exam") : false,
        旧開始: !!r.querySelector('[data-preset-start="cbt-test-1"]')
      };
    });
    見(札状.カード, "試験の カードは data-exam-open（クイズ画面へ 行かない）", 札状);
    見(札状.ボタン && 札状.文 === "受験する", "ボタンが「受験する」に なる", 札状.文);
    見(札状.表紙, "カードの 絵は 表紙の 縮小見本");
    見(!札状.旧開始, "**旧い data-preset-start が 付いていない**（横取りされない）");
    /* 器の 統合（2026-08-30）。試験も プリセットの 一覧・検索に 乗る。 */
    const 器 = await page.evaluate(() => {
      const ST = window.VQ2.store;
      const p = ST.getPreset("cbt-test-1");
      return { preset: !!p, 試験: !!(p && ST.isExam(p)),
               一覧: ST.listPresets().some((x) => x.id === "cbt-test-1"),
               試験一覧: ST.listExams().some((x) => x.id === "cbt-test-1"),
               問: p ? (p.questions || []).length : 0 };
    });
    見(器.preset && 器.試験, "試験は preset として 置かれている", JSON.stringify(器));
    見(器.一覧 && 器.試験一覧, "プリセットの 一覧にも 試験の 一覧にも 出る");
    見(器.問 === 6, "設問が preset.questions に 入っている", 器.問);

    if (札状.ボタン) {
      await page.evaluate(() => {
        document.getElementById("vqScreens").shadowRoot.querySelector("[data-exam-start]").click();
      });
      await 待(3000);
    }
  }

  /* ★ 受験は **表紙の 段**から 始まる（2026-08-30・訴え）。
     年組番氏名・受験番号を 入れて「開始する」を 押すまで 中は 出ない。 */
  await page.evaluate(async () => {
    function 深(sel) {
      var out = [];
      (function 掘る(root) {
        try { root.querySelectorAll(sel).forEach(function (x) { out.push(x); }); } catch (e) {}
        try { root.querySelectorAll("*").forEach(function (el) { if (el.shadowRoot) 掘る(el.shadowRoot); }); } catch (e) {}
      })(document);
      return out;
    }
    深("[data-exm]").forEach(function (el) {
      var k = el.getAttribute("data-exm");
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set
        .call(el, k === "受験番号" ? "12345678" : (k === "氏名" ? "検査 太郎" : "1"));
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    var b = 深('[data-act="exam-start"]')[0];
    if (b) b.click();
    await new Promise(function (r) { setTimeout(r, 1000); });
  });
  await 待(1200);

  節("③ 開いたのは CBT（左＝問題冊子／右＝解答欄）");
  {
    const 姿 = await page.evaluate(() => {
      /* 受験の 作業場は U.mount で 置かれる。中身は 影の DOM。 */
      function 潜る(n, 出) {
        if (!n) return;
        if (n.shadowRoot) 潜る(n.shadowRoot, 出);
        const ch = n.children || [];
        for (let i = 0; i < ch.length; i++) 潜る(ch[i], 出);
        if (n.tagName === "IFRAME") 出.枠++;
      }
      const host = [...document.querySelectorAll("*")]
        .filter((e) => e.id && /vq2-exam-workspace/.test(e.id))[0]
        || document.querySelector("[id*='exam-workspace']");
      if (!host) return { なし: true, id一覧: [...document.querySelectorAll("[id^='vq2-']")].map((e) => e.id) };
      const sr = host.shadowRoot || host;
      const 出 = { 枠: 0 };
      潜る(host, 出);
      const 全 = (sr.textContent || "").replace(/\s+/g, " ");
      const 左 = sr.getElementById ? sr.getElementById("paperPane") : sr.querySelector("#paperPane");
      const 右 = sr.getElementById ? sr.getElementById("answerPane") : sr.querySelector("#answerPane");
      const R = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.left), w: Math.round(b.width) }; };
      return {
        なし: false, iframe: 出.枠, 文: 全.slice(0, 220),
        左: R(左), 右: R(右),
        大問: /大問/.test(全), 残り時間: /:\d\d/.test(全),
        欄の数: sr.querySelectorAll("[data-arow]").length
      };
    });
    見(!姿.なし, "受験の 作業場が 開いた", 姿.なし ? 姿 : "");
    if (!姿.なし) {
      見(姿.iframe >= 1, "左に 紙面（iframe）が ある", 姿.iframe);
      見(!!(姿.左 && 姿.右), "左と 右の 2 つに 分かれている", { 左: 姿.左, 右: 姿.右 });
      見(!!(姿.左 && 姿.右 && 姿.左.x < 姿.右.x), "**紙面が 左・解答欄が 右**", { 左: 姿.左, 右: 姿.右 });
      見(姿.大問, "大問の 見出しが 出る");
      見(姿.欄の数 >= 6, "解答欄が 設問の 数だけ ある", 姿.欄の数);
    }
  }

  節("④ 旧い 作業場でも 同じ 試験が 開ける（器を 変えても 落とさない）");
  {
    /* CBT を 閉じてから。 */
    await page.evaluate(() => {
      const h = [...document.querySelectorAll("[id^='vq2-']")].filter((e) => /exam-workspace/.test(e.id))[0];
      if (h && h.__vq2 && h.__vq2.forceClose) h.__vq2.forceClose("test");
    });
    await 待(800);
    const 旧 = await page.evaluate(async () => {
      if (!window.VQ2.quickMock || !window.VQ2.quickMock.open) return { なし: true };
      window.VQ2.quickMock.open({ mockId: "cbt-test-1" });
      await new Promise((r) => setTimeout(r, 1200));
      const h = [...document.querySelectorAll("[id^='vq2-']")].filter((e) => /quick-mock|mock/.test(e.id))[0];
      const sr = h && h.shadowRoot;
      const 文 = sr ? (sr.textContent || "").replace(/\s+/g, " ") : "";
      return { 開いた: !!sr, 題: /CBT の たしかめ/.test(文), 大問: /大問/.test(文),
               先頭: 文.slice(0, 120) };
    });
    見(!旧.なし && 旧.開いた, "旧い 作業場が 開く（消していない）", JSON.stringify(旧).slice(0, 200));
    見(!!旧.題, "★ preset に 移した 試験が **旧い 画面でも 読める**", 旧.先頭);
  }

  節("⑤ 赤い字（例外）");
  見(例外.length === 0, "例外が 出ていない", 例外);

  await browser.close();
  console.log("\n────────────────────────────");
  console.log("通った: " + 済 + " / 落ちた: " + 落);
  if (落ち.length) console.log("落ちたもの:\n  - " + 落ち.join("\n  - "));
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error("止まりました:", e); process.exit(1); });
