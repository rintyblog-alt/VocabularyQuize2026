/* ══════════════════════════════════════════════════════════════════════════
   vqexammobile.cjs — 受験の 画面を **スマホで** 測る

   訴え（2026-08-30・Rinty さん）
     「スマホに 最適化して欲しい。左の 問題欄と 右の 解答欄を。
       今のままだと、左の 問題欄が 大きすぎる。
       あと いちいち 上に 戻ると スクロールが めんどくさいから これも なしに」

   直す前に 実際に 起きていた こと（実測）:
     ① 解答欄に style="width:420px" を **べた書き**していた。
        style は CSS に 勝つので、モバイル用の width:auto が 効かず、
        390px の 画面に 420px の 板が 入って 右端が 切れていた。
     ② 紙は A4（794px）を **倍率 1 のまま** 出していた。
        390px の 画面では 半分しか 見えず、横に スクロールしないと 読めない。
        倍率の 下限も 0.6 で、収まる ところまで 縮められなかった。
     ③ タブを 押すたび render() ＝ app.root.innerHTML の 書き換え。
        紙の iframe が 毎回 消えて 組み直され、読んでいた ところが
        **いちばん 上へ 戻って**いた。鍵盤が 出る（resize）だけでも 同じ。

   使い方: VQ_BASE=http://127.0.0.1:8791 node vqexammobile.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const { chromium } = require("playwright");

let 済 = 0, 落 = 0; const 落ち = [];
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
    body: JSON.stringify({ email: "vqm" + 印 + "@gmail.com", gradePrefix: "H2",
      nickname: ("m" + 印).slice(0, 14), password: "Passw0rd!z3" }) }).then(j);
  const v = await fetch(BASE + "/api/auth/register/verify", { method: "POST", headers: H,
    body: JSON.stringify({ challengeId: r.challengeId, code: r.devCode }) }).then(j);
  const c = await fetch(BASE + "/api/auth/register/consent", { method: "POST", headers: H,
    body: JSON.stringify({ registrationSession: v.registrationSession, agreeTerms: true,
      agreePrivacy: true, agreeAge: true, pin: "1379" }) }).then(j);
  if (!c.token) throw new Error("札が 取れない");
  return c.token;
}

/* 長い 試験を 置く（紙が 何ページにも なる ように）。 */
const 試験を置く = () => {
  const S = window.VQ2.schema;
  const qs = [];
  for (let i = 1; i <= 14; i++) {
    const 選 = i % 2 === 1;
    qs.push({
      id: "q" + i, schemaVersion: S.SCHEMA_VERSION, sectionId: i <= 7 ? "s1" : "s2",
      number: i <= 7 ? i : i - 7, globalNumber: i,
      type: 選 ? "multiple_choice_single" : "short_answer",
      prompt: "設問 " + i + " の 本文。".repeat(6),
      promptRichText: null, media: [], contentBlocks: [],
      choices: 選 ? [{ id: "c1", text: "あ", isCorrect: true }, { id: "c2", text: "い", isCorrect: false },
                     { id: "c3", text: "う", isCorrect: false }, { id: "c4", text: "え", isCorrect: false }] : [],
      correctAnswer: 選 ? null : "こたえ", acceptedAnswers: 選 ? [] : ["こたえ"],
      explanation: "解説", choiceExplanations: null,
      answerBindingId: "b" + i, points: 5, criterionAllocation: null, scoringRubric: null,
      estimatedSeconds: 60, difficulty: "normal", topic: "単元", tags: [],
      sourceReferences: [], requiresReview: false, confidence: null, validationIssues: []
    });
  }
  const spec = {
    id: "mob-test-1", schemaVersion: S.SCHEMA_VERSION, ownerId: "",
    title: "スマホの たしかめ", subject: "地理総合", grade: "高校2年",
    durationMinutes: 50, totalPoints: 70, instructions: "", sourceMode: "open",
    cover: { examName: "スマホの たしかめ", subject: "地理総合", examDate: "2026年8月30日",
             instructions: ["解答は 解答欄へ。"], studentFields: ["年", "組", "番", "氏名"] },
    sections: [
      { id: "s1", number: 1, title: "大問一", instructions: "", points: 35, questions: qs.slice(0, 7) },
      { id: "s2", number: 2, title: "大問二", instructions: "", points: 35, questions: qs.slice(7) }
    ],
    answerBindings: qs.map((q, i) => ({ id: "b" + (i + 1), questionId: q.id,
      sectionId: q.sectionId, number: String(i + 1), blankCount: 1,
      kind: i % 2 === 0 ? "choice" : "text" })),
    paper: { size: "A4", orientation: "portrait", columns: 1, writingDirection: "horizontal",
             margins: { top: 20, bottom: 20, left: 18, right: 18 } },
    layout: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
  const r = window.VQ2.store.saveExam(spec, {});
  return !!(r && r.ok);
};


(async () => {
  console.log("測る先:", BASE);
  const tok = await 札();
  const browser = await chromium.launch();
  /* iPhone 14 くらいの 幅。
     ★ isMobile / deviceScaleFactor は **付けない**。付けると Chrome の
       端末エミュレーションが CSS の mm を 端末の 実 DPI へ 読み替え、
       210mm が 381px に なって しまう（実測）。
       本物の 端末では 1in ＝ 96px なので 210mm ＝ 794px。
       付けたままだと「紙が はみ出す」現象が **測定の 中だけ 消える**。 */
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
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
  await page.evaluate(() => { try { window.__vqLoadLibs && window.__vqLoadLibs(); } catch (e) {} });
  await page.waitForFunction(() => !!(window.VQ2 && window.VQ2.examWorkspace && window.VQ2.store),
    null, { timeout: 60000 });
  await 待(1200);
  見(await page.evaluate(試験を置く), "試験を 置けた");

  /* 受験の 作業場は U.mount が 置く。名前ではなく **id** で 探す。 */
  await page.evaluate(() => {
    window.__vqew = function () {
      var h = Array.prototype.slice.call(document.querySelectorAll("*"))
        .filter(function (e) { return e.id && /vq2-exam-workspace/.test(e.id); })[0]
        || document.querySelector("[id*='exam-workspace']");
      return h ? (h.shadowRoot || h) : null;
    };
  });
  await page.evaluate(() => window.VQ2.examWorkspace.open({ mockId: "mob-test-1" }));
  await 待(2500);
  見(await page.evaluate(() => !!window.__vqew()), "受験の 画面が 開いた");

  節("① 表紙 → 開始（スマホでも 進める）");
  {
    const 状 = await page.evaluate(() => {
      const r = __vqew();
      return { タブ: !!r.querySelector(".vq2-tabs"),
               タブ数: r.querySelectorAll("[data-etab]").length,
               紙: !!r.querySelector("#paperPane"), 解: !!r.querySelector("#answerPane") };
    });
    見(状.タブ && 状.タブ数 === 2, "スマホは タブに なる（横並びに しない）", 状);
    /* 記入して 開始。 */
    await page.evaluate(() => {
      const r = __vqew();
      r.querySelectorAll("[data-exm]").forEach((i, n) => {
        i.value = ["2", "A", "7", "松代 倫"][n] || "x";
        i.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      });
    });
    await 待(400);
    await page.evaluate(() => {
      const r = __vqew();
      const b = r.querySelector('[data-act="exam-start"]');
      if (b) b.click();
    });
    await 待(2500);
    見(await page.evaluate(() => !!__vqew()
       .querySelector("#examPaper iframe")), "紙面が 出た");
  }

  節("② 画面から はみ出さない");
  {
    const 幅 = await page.evaluate(() => {
      const r = __vqew();
      const p = r.querySelector("#paperPane"), a = r.querySelector("#answerPane");
      const root = r.querySelector(".vq2-root");
      return { 画面: innerWidth,
               紙欄: Math.round(p.getBoundingClientRect().width),
               解欄: Math.round(a.getBoundingClientRect().width),
               解欄style: a.getAttribute("style") || "",
               横スクロール: root ? root.scrollWidth > root.clientWidth + 1 : false,
               体: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    見(幅.解欄 <= 幅.画面, "★ 解答欄が 画面幅を 超えない（前は 420px で 切れていた）", 幅);
    見(!/width: *420px/.test(幅.解欄style), "★ 420px の べた書きが 無い", 幅.解欄style);
    見(幅.紙欄 <= 幅.画面, "問題欄も 画面幅を 超えない", 幅.紙欄);
    見(!幅.横スクロール && !幅.体, "横に スクロールしない", 幅);
  }

  節("③ スマホは **折り返して 読む**（訴え「問題欄が 大きすぎる」）");
  {
    const 読 = await page.evaluate(() => {
      const r = __vqew();
      const d = r.querySelector("#examPaper iframe").contentDocument;
      const host = r.querySelector("#examPaper");
      const pg = d.querySelector(".page");
      const q = d.querySelector(".q-text") || d.querySelector(".q") || d.body;
      return { 折り返し: !!r.querySelector('[data-act="reflow"]'),
               紙幅: pg ? Math.round(pg.getBoundingClientRect().width) : -1,
               欄幅: Math.round(host.clientWidth),
               字: Math.round(parseFloat(getComputedStyle(q).fontSize) * 10) / 10,
               倍率: getComputedStyle(d.body).zoom,
               横: d.documentElement.scrollWidth > d.documentElement.clientWidth + 2 };
    });
    見(読.折り返し, "スマホには 切り替えの ボタンが ある");
    見(読.紙幅 > 0 && 読.紙幅 <= 読.欄幅 + 2, "★ 紙が 画面の 幅に 収まる", 読);
    見(!読.横, "★ 横に スクロールしない", 読);
    /* ここが 芯。**収まっても 読めなければ 意味が ない。** */
    見(読.字 >= 12, "★ 文字が 読める 大きさの まま（縮めて 5pt に しない）", 読.字 + "px");
    見(Number(読.倍率 || 1) >= 0.99, "★ 折り返しでは 縮めない（倍率 1）", 読.倍率);
  }

  節("③b 紙のままにも 戻せる（そのときは 幅に 合わせる）");
  {
    await page.evaluate(() => __vqew().querySelector('[data-act="reflow"]').click());
    await 待(1500);
    const 紙 = await page.evaluate(() => {
      const r = __vqew();
      const f = r.querySelector("#examPaper iframe");
      const host = r.querySelector("#examPaper");
      const d = f.contentDocument;
      /* 紙の 中身は .sheet（版面）。.page は ただの 入れ物で 幅を 持たない。 */
      const sh = d.querySelector(".sheet");
      const pg = d.querySelector(".page");
      /* 倍率は 貼り直した <style> の 中に 入る ことも ある。
         **効いている 値**を 見る（インラインだけ 見ると 空に 見える）。 */
      const z = getComputedStyle(d.body).zoom || d.body.style.zoom || "";
      return { 欄幅: Math.round(host.clientWidth), 倍率: z,
               版面: sh ? Math.round(sh.getBoundingClientRect().width) : -1,
               紙: pg ? Math.round(pg.getBoundingClientRect().width) : -1,
               中の幅: d.documentElement.clientWidth,
               窓: f.contentWindow.innerWidth,
               体幅: Math.round(d.documentElement.scrollWidth),
               中の横スクロール: d.documentElement.scrollWidth > d.documentElement.clientWidth + 2 };
    });
    見(Number(紙.倍率) > 0 && Number(紙.倍率) < 0.8, "★ 幅に 合わせて 縮めた（倍率 1 の ままに しない）", 紙);
    見(紙.紙 > 0 && 紙.紙 <= 紙.欄幅 + 2, "★ 紙 1 枚（A4）が 欄に 収まる", 紙);
    見(紙.版面 > 0 && 紙.版面 <= 紙.欄幅 + 2, "★ 版面が 欄に 収まる", 紙);
    見(!紙.中の横スクロール, "★ 紙を 横に スクロールしなくても 読める", 紙);
    /* 折り返しへ 戻して 続ける（以降は 既定の 見え方で 測る）。 */
    await page.evaluate(() => __vqew().querySelector('[data-act="reflow"]').click());
    await 待(1500);
  }

  節("④ タブを 行き来しても 上へ 戻らない（訴え）");
  {
    const 結 = await page.evaluate(async () => {
      const r = __vqew();
      const f0 = r.querySelector("#examPaper iframe");
      const d = f0.contentDocument;
      /* 下の ほうまで 読み進める。 */
      d.documentElement.scrollTop = 900; d.body.scrollTop = 900;
      await new Promise((z) => setTimeout(z, 200));
      const 前 = Math.round(d.documentElement.scrollTop || d.body.scrollTop);
      /* 解答用紙 → 問題用紙 と 行き来する。 */
      r.querySelector('[data-etab="answers"]').click();
      await new Promise((z) => setTimeout(z, 350));
      const 解が出た = !r.querySelector("#answerPane").hidden && r.querySelector("#paperPane").hidden;
      r.querySelector('[data-etab="paper"]').click();
      await new Promise((z) => setTimeout(z, 450));
      const f1 = r.querySelector("#examPaper iframe");
      const d1 = f1.contentDocument;
      return { 前, 後: Math.round(d1.documentElement.scrollTop || d1.body.scrollTop),
               同じiframe: f0 === f1, 解が出た,
               紙が出た: !r.querySelector("#paperPane").hidden };
    });
    見(結.前 > 500, "下の ほうまで 読み進めた", 結.前);
    見(結.解が出た, "解答用紙タブに 移れる");
    見(結.紙が出た, "問題用紙タブへ 戻れる");
    見(結.同じiframe, "★ 紙を 組み直していない（同じ iframe の まま）", 結.同じiframe);
    見(Math.abs(結.後 - 結.前) <= 4, "★ 読んでいた ところに 戻る（上へ 飛ばない）", 結);
  }

  節("⑤ 文字を 打っても（鍵盤が 出ても）上へ 戻らない");
  {
    const 結 = await page.evaluate(async () => {
      const r = __vqew();
      const f0 = r.querySelector("#examPaper iframe");
      const 前 = Math.round(f0.contentDocument.documentElement.scrollTop);
      /* 鍵盤が 出ると 高さが 変わる。resize と 同じ ことを 起こす。 */
      window.dispatchEvent(new Event("resize"));
      await new Promise((z) => setTimeout(z, 400));
      const f1 = r.querySelector("#examPaper iframe");
      return { 前, 後: Math.round(f1.contentDocument.documentElement.scrollTop),
               同じiframe: f0 === f1 };
    });
    見(結.同じiframe, "★ 幅が 変わっただけでは 紙を 作り直さない", 結);
    見(Math.abs(結.後 - 結.前) <= 4, "★ 読んでいた ところが 動かない", 結);
  }

  節("⑥ 指で 押せる 大きさ・拡大の 戻りかた");
  {
    const 押 = await page.evaluate(() => {
      const r = __vqew();
      return Array.from(r.querySelectorAll("[data-etab],[data-act]"))
        .filter((e) => e.offsetParent !== null)
        .map((e) => Math.round(e.getBoundingClientRect().height))
        .filter((h) => h > 0);
    });
    見(押.every((h) => h >= 36), "押すところが 36px 以上", 押);
    /* 拡大は **紙のまま**の ときの 話。折り返し中は 出さない（効かない ものを 出さない）。 */
    await page.evaluate(() => __vqew().querySelector('[data-act="reflow"]').click());
    await 待(1500);
    const 戻 = await page.evaluate(async () => {
      const r = __vqew();
      const d = () => r.querySelector("#examPaper iframe").contentDocument;
      for (let i = 0; i < 8; i++) { r.querySelector('[data-act="zoom-in"]').click(); await new Promise((z) => setTimeout(z, 40)); }
      const 拡 = Number(d().body.style.zoom);
      r.querySelector('[data-act="zoom-fit"]').click();
      await new Promise((z) => setTimeout(z, 200));
      return { 拡, 戻: Number(d().body.style.zoom) };
    });
    見(戻.拡 > 0.8, "拡大できる（紙のままの とき）", 戻.拡);
    見(戻.戻 < 0.8, "★ 「%」を 押すと 幅に 合わせ直す（拡大しすぎて 戻れない、が 無い）", 戻);
  }

  節("⑦ 例外");
  見(例外.length === 0, "画面の 例外 0 件", 例外.slice(0, 3));

  console.log("\n────────────────────────────────");
  console.log("通った: " + 済 + " / 落ちた: " + 落);
  if (落) console.log("落ちたもの:\n  - " + 落ち.join("\n  - "));
  await browser.close();
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
