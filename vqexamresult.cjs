/* ══════════════════════════════════════════════════════════════════════════
   vqexamresult.cjs — 試験の **結果画面**と **問題用紙への 書き込み**

   依頼（2026-08-30・Rinty さん／画像つき）
     「試験モードの 採点画面だけ こんな 感じに すると いいかも。
       試験中は 左側では、問題用紙に ペン・マーカーなどで 書き込みが できたり。
       結果画面は、プリセットとは 分けて、こんな 感じに したりさ。
       これ レイアウトと 配置 画像と 全く 同じに して 欲しい」
     「あと この 左に メモした ものは 同じ アカウントなら 絶対に 残るように。
       プリセットを 複製したら、新しい ほうの 同じ プリセットの ときは
       リセットしても いいけど」

   直す前:
     ★ 採点が 終わると 受験の 画面を **閉じて**、プリセットと 同じ 結果画面へ
       飛んでいた。試験には 紙面も 手書きも あるのに 何も 見られなかった。
     ★ 問題用紙に 書き込む 道具が 無かった。

   見るのは:
     ① 試験中に ペン・マーカー・消しゴムで 書ける
     ② 書いた ものが **保存され、開き直しても 残る**（アカウントの 置き場）
     ③ 複製した プリセット（別の id）は **空から 始まる**
     ④ 採点が 終わると **試験だけの 結果画面**が 出る（プリセットの 結果へ 飛ばない）
     ⑤ 画像と 同じ 置き（上バー・左の 紙・右の 採点・下の 道具バー）
     ⑥ 問題／解答／解説 で 左の 紙が 変わる
     ⑦ 前の問題・次の問題で 右の 中身が 変わる

   使い方: VQ_BASE=http://127.0.0.1:8791 node vqexamresult.cjs
   ══════════════════════════════════════════════════════════════════════════ */
"use strict";
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
if (!/127\.0\.0\.1|localhost|-dev\./.test(BASE)) { console.error("本番では実行しません。"); process.exit(2); }
const { chromium } = require("playwright");

let 済 = 0, 落 = 0; const 落ち = [];
const 節 = (t) => console.log("\n══ " + t + " ══");
const 見 = (ok, 名, 追) => {
  if (ok) { 済++; console.log("  ok   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 200) : "")); }
  else { 落++; 落ち.push(名); console.log("  NG   " + 名 + (追 !== undefined ? "  → " + JSON.stringify(追).slice(0, 320) : "")); }
};
const 待 = (ms) => new Promise((s) => setTimeout(s, ms));
const j = (r) => r.json().catch(() => ({}));

async function 札() {
  const 印 = Date.now().toString(36) + Math.floor(Math.random() * 9999);
  const H = { "Content-Type": "application/json" };
  const r = await fetch(BASE + "/api/auth/register/start", { method: "POST", headers: H,
    body: JSON.stringify({ email: "vqr" + 印 + "@gmail.com", gradePrefix: "H2",
      nickname: ("r" + 印).slice(0, 14), password: "Passw0rd!z3" }) }).then(j);
  const v = await fetch(BASE + "/api/auth/register/verify", { method: "POST", headers: H,
    body: JSON.stringify({ challengeId: r.challengeId, code: r.devCode }) }).then(j);
  const c = await fetch(BASE + "/api/auth/register/consent", { method: "POST", headers: H,
    body: JSON.stringify({ registrationSession: v.registrationSession, agreeTerms: true,
      agreePrivacy: true, agreeAge: true, pin: "1379" }) }).then(j);
  if (!c.token) throw new Error("札が 取れない");
  return c.token;
}

/* 記述を 混ぜた 短い 試験。id を 変えて 2 本 置ける（複製の 確かめ）。 */
const 試験を置く = (id) => {
  const S = window.VQ2.schema;
  const qs = [];
  for (let i = 1; i <= 4; i++) {
    const 記 = i === 2;
    qs.push({
      id: id + "-q" + i, schemaVersion: S.SCHEMA_VERSION, sectionId: id + "-s1",
      number: i, globalNumber: i,
      type: 記 ? "long_answer" : "multiple_choice_single",
      prompt: "設問 " + i + " の 本文を 読んで 答えよ。".repeat(2),
      promptRichText: null, media: [], contentBlocks: [],
      choices: 記 ? [] : [{ id: "c1", text: "あ", isCorrect: true }, { id: "c2", text: "い", isCorrect: false },
                           { id: "c3", text: "う", isCorrect: false }, { id: "c4", text: "え", isCorrect: false }],
      correctAnswer: 記 ? "埴輪。墳丘の 縁や 周辺に 並べ、死者の ための 祭りや 威信の 表象。" : null,
      acceptedAnswers: 記 ? ["埴輪"] : [],
      explanation: "解説の 本文。", choiceExplanations: null,
      answerBindingId: id + "-b" + i, points: 10,
      criterionAllocation: null,
      scoringRubric: 記 ? { items: [
        { id: "r1", description: "名称の 特定（埴輪）", points: 5 },
        { id: "r2", description: "設置目的に 触れている", points: 5 }] } : null,
      estimatedSeconds: 60, difficulty: "normal", topic: "単元", tags: [],
      sourceReferences: [], requiresReview: false, confidence: null, validationIssues: []
    });
  }
  const spec = {
    id: id, schemaVersion: S.SCHEMA_VERSION, ownerId: "",
    title: "2025年度 中間考査", subject: "歴史総合", grade: "高校2年",
    durationMinutes: 50, totalPoints: 40, instructions: "", sourceMode: "open",
    cover: { examName: "2025年度 中間考査", subject: "歴史総合", examDate: "2026年8月30日",
             instructions: ["解答は 解答欄へ。"], studentFields: ["年", "組", "番", "氏名"] },
    sections: [{ id: id + "-s1", number: 1, title: "大問一", instructions: "", points: 40, questions: qs }],
    answerBindings: qs.map((q, i) => ({ id: id + "-b" + (i + 1), questionId: q.id,
      sectionId: id + "-s1", number: String(i + 1), blankCount: 1,
      kind: i === 1 ? "text" : "choice" })),
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
  await page.evaluate(() => { try { window.__vqLoadLibs && window.__vqLoadLibs(); } catch (e) {} });
  await page.waitForFunction(() => !!(window.VQ2 && window.VQ2.examWorkspace && window.VQ2.store),
    null, { timeout: 60000 });
  await 待(1200);
  await page.evaluate(() => {
    window.__vqew = function () {
      var h = Array.prototype.slice.call(document.querySelectorAll("*"))
        .filter(function (e) { return e.id && /vq2-exam-workspace/.test(e.id); })[0];
      return h ? (h.shadowRoot || h) : null;
    };
  });
  見(await page.evaluate(試験を置く, "res-a"), "試験を 置けた");

  /* ── 受験を 開いて 表紙を 抜ける ── */
  async function 開いて始める(id) {
    await page.evaluate((i) => window.VQ2.examWorkspace.open({ mockId: i }), id);
    await 待(2200);
    /* 中断した 受験が あると「続きから？」と 聞かれる。続きから 入る。 */
    await page.evaluate(() => {
      const r = __vqew();
      const b = Array.from(r.querySelectorAll("button"))
        .find((x) => /続きから/.test((x.textContent || "").trim()));
      if (b) b.click();
    });
    await 待(1500);
    await page.evaluate(() => {
      const r = __vqew();
      r.querySelectorAll("[data-exm]").forEach((el, n) => {
        el.value = ["2", "A", "7", "松代 倫"][n] || "x";
        el.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      });
    });
    await 待(300);
    await page.evaluate(() => {
      const b = __vqew().querySelector('[data-act="exam-start"]');
      if (b) b.click();
    });
    await 待(2500);
  }
  await 開いて始める("res-a");
  見(await page.evaluate(() => !!__vqew().querySelector("#examPaper iframe")), "紙面が 出た");

  節("① 問題用紙に 書き込める");
  {
    const 道 = await page.evaluate(() => {
      const r = __vqew();
      const b = r.querySelector('[data-act="ink"]');
      if (b) b.click();
      return { ボタン: !!b,
               道具: Array.from(r.querySelectorAll("[data-inkt]")).map((e) => e.dataset.inkt),
               色: r.querySelectorAll("[data-inkc]").length };
    });
    await 待(300);
    見(道.ボタン, "手書きの ボタンが ある");
    見(道.道具.join(",") === "pen,marker,eraser", "ペン・マーカー・消しゴムが ある", 道.道具);
    見(道.色 >= 4, "色が 4 つ 以上 ある", 道.色);
    const 板 = await page.evaluate(() => {
      const cv = __vqew().querySelector("canvas.vq2-ink");
      return { ある: !!cv, 触れる: cv ? getComputedStyle(cv).pointerEvents : "" };
    });
    見(板.ある, "書き込みの 板が 紙の 上に ある");
    見(板.触れる === "auto", "道具を 出すと 触れる（出す前は 触れない）", 板.触れる);
    /* 実際に 線を 引く。 */
    const 引 = await page.evaluate(async () => {
      const r = __vqew();
      const cv = r.querySelector("canvas.vq2-ink");
      const b = cv.getBoundingClientRect();
      function ev(t, x, y) {
        cv.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: x, clientY: y,
          pointerId: 1, buttons: 1, isPrimary: true }));
      }
      ev("pointerdown", b.left + 60, b.top + 80);
      for (let i = 1; i <= 12; i++) { ev("pointermove", b.left + 60 + i * 8, b.top + 80 + i * 3); await new Promise((z) => setTimeout(z, 8)); }
      ev("pointerup", b.left + 160, b.top + 120);
      await new Promise((z) => setTimeout(z, 700));
      return window.VQ2.store.loadNotes("res-a").length;
    });
    見(引 === 1, "★ 1 本 引くと 1 本 保存される", 引);
    /* マーカーで もう 1 本。 */
    const 引2 = await page.evaluate(async () => {
      const r = __vqew();
      r.querySelector('[data-inkt="marker"]').click();
      await new Promise((z) => setTimeout(z, 200));
      const cv = r.querySelector("canvas.vq2-ink");
      const b = cv.getBoundingClientRect();
      function ev(t, x, y) {
        cv.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: x, clientY: y,
          pointerId: 2, buttons: 1, isPrimary: true }));
      }
      ev("pointerdown", b.left + 60, b.top + 200);
      for (let i = 1; i <= 10; i++) { ev("pointermove", b.left + 60 + i * 10, b.top + 200); await new Promise((z) => setTimeout(z, 8)); }
      ev("pointerup", b.left + 160, b.top + 200);
      await new Promise((z) => setTimeout(z, 700));
      const n = window.VQ2.store.loadNotes("res-a");
      return { 数: n.length, 種: n.map((x) => x.t) };
    });
    見(引2.数 === 2 && 引2.種.indexOf("marker") >= 0, "★ マーカーでも 引ける", 引2);
  }

  節("② 開き直しても 残る（同じ アカウント）");
  {
    /* ★ **画面を まるごと 開き直す**（いちばん 強い 確かめ）。
       DOM を 手で 剥がすと 作業場が 中途半端に 残るので、読み込み直す。 */
    await page.goto(BASE + "/?vqdev=1", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => { try { window.__vqLoadLibs && window.__vqLoadLibs(); } catch (e) {} });
    await page.waitForFunction(() => !!(window.VQ2 && window.VQ2.examWorkspace && window.VQ2.store),
      null, { timeout: 60000 });
    await page.evaluate(() => {
      window.__vqew = function () {
        var h = Array.prototype.slice.call(document.querySelectorAll("*"))
          .filter(function (e) { return e.id && /vq2-exam-workspace/.test(e.id); })[0];
        return h ? (h.shadowRoot || h) : null;
      };
    });
    await 待(1200);
    await 開いて始める("res-a");
    await page.evaluate(() => {
      const b = __vqew().querySelector('[data-act="ink"]');
      if (b) b.click();
    });
    await 待(1200);
    const 戻 = await page.evaluate(() => {
      const r = __vqew();
      return { 保存: window.VQ2.store.loadNotes("res-a").length,
               板: !!r.querySelector("canvas.vq2-ink"),
               紙: !!r.querySelector("#examPaper"),
               枠: !!r.querySelector("#examPaper iframe"),

               器の数: document.querySelectorAll("[id*='vq2-exam-workspace']").length };
    });
    見(戻.保存 === 2, "★ 書いた ものが 残っている", 戻.保存);
    見(戻.板, "板も 出ている", JSON.stringify(戻));
    見(戻.枠, "紙も 出ている");
  }

  節("③ 複製（別の id）は 空から 始まる");
  {
    見(await page.evaluate(試験を置く, "res-b"), "もう 1 本 置けた（複製の かわり）");
    const 空 = await page.evaluate(() => window.VQ2.store.loadNotes("res-b").length);
    見(空 === 0, "★ 新しい ほうは 何も 引き継がない", 空);
    const 元 = await page.evaluate(() => window.VQ2.store.loadNotes("res-a").length);
    見(元 === 2, "元の ほうは そのまま", 元);
  }

  節("④⑤ 採点が 終わると 試験だけの 結果画面");
  {
    /* 選択は 答えて、記述にも 書く。AI 採点は 手元では 走らないので、
       決定論の 採点で 結果画面まで 行くことを 見る。 */
    const 出 = await page.evaluate(async () => {
      const r = __vqew();
      /* 解答欄へ 答える。 */
      const picks = r.querySelectorAll("[data-pick]");
      if (picks.length) picks[0].click();
      const ta = r.querySelector("#answerPane textarea, #answerPane input[data-text]");
      if (ta) { ta.value = "埴輪。墳丘に 並べた。"; ta.dispatchEvent(new Event("input", { bubbles: true })); }
      await new Promise((z) => setTimeout(z, 400));
      const btns = Array.from(r.querySelectorAll("button"));
      const sb = r.querySelector('[data-act="submit"]')
        || btns.find((b) => /提出/.test((b.textContent || "").trim()));
      if (sb) sb.click();
      await new Promise((z) => setTimeout(z, 400));
      return { 押した: !!sb };
    });
    見(出.押した, "提出を 押せた");
    /* 窓の OK を 影の 中から 探して 押す。 */
    for (let i = 0; i < 20; i++) {
      const done = await page.evaluate(() => {
        const r = __vqew();
        if (r.querySelector(".vq2-xr")) return true;
        /* 「提出しますか」の 窓の OK を 押す（見出しの 提出ボタンとは 別）。 */
        const btns = Array.from(r.querySelectorAll("button"));
        const ok = btns.filter((b) => /^提出(する)?$/.test((b.textContent || "").trim()))
          .filter((b) => !b.closest("#paperBar") && b.getAttribute("data-act") !== "submit");
        if (ok.length) { ok[ok.length - 1].click(); return false; }
        return false;
      });
      if (done) break;
      await 待(600);
    }
    await 待(1500);
    const 画 = await page.evaluate(() => {
      const r = __vqew();
      const xr = r.querySelector(".vq2-xr");
      if (!xr) return { なし: true };
      return {
        上: !!r.querySelector(".vq2-xr-top"),
        切替: Array.from(r.querySelectorAll("[data-xrtab]")).map((e) => e.textContent.trim()),
        右上: Array.from(r.querySelectorAll(".vq2-xr-topr button")).map((e) => e.textContent.trim()),
        左の紙: !!r.querySelector(".vq2-xr-paper"),
        右: !!r.querySelector(".vq2-xr-side"),
        点: (r.querySelector(".vq2-xr-n") || {}).textContent,
        満点: (r.querySelector(".vq2-xr-sl") || {}).textContent,
        内訳: r.querySelectorAll(".vq2-xr-li").length,
        小タブ: Array.from(r.querySelectorAll("[data-xrsub]")).map((e) => e.textContent.trim()),
        改善: !!r.querySelector(".vq2-xr-col:last-child"),
        下: !!r.querySelector(".vq2-xr-bot"),
        道具: Array.from(r.querySelectorAll("[data-xrink]")).map((e) => e.textContent.trim()),
        拡縮: Array.from(r.querySelectorAll('.vq2-xr-tools [data-act]')).map((e) => e.textContent.trim()),
        行き来: Array.from(r.querySelectorAll(".vq2-xr-nav button, .vq2-xr-num")).map((e) => e.textContent.trim()),
        解説へ: (r.querySelector('[data-act="xr-explain"]') || {}).textContent,
        プリセットの結果: !!document.querySelector("[id*='result-view'],[id*='vq2-result']")
      };
    });
    if (画.なし) {
      const 様 = await page.evaluate(() => {
        const r = __vqew();
        const b = r.querySelector(".vq2-root");
        return { 中: b ? (b.textContent || "").replace(/\s+/g, " ").slice(0, 200) : "(root なし)",
                 ボタン: Array.from(r.querySelectorAll("button")).map((e) => (e.textContent || "").trim())
                   .filter(Boolean).slice(0, 12).join("/"),
                 別画面: Array.from(document.querySelectorAll("[id^='vq2-']")).map((e) => e.id).join(",") };
      });
      console.log("  いまの 画面: " + JSON.stringify(様));
    }
    見(!画.なし, "★ 試験だけの 結果画面が 出た（プリセットの 結果へ 飛ばない）", 画.なし ? "出ていない" : "");
    if (画.なし) { console.log("  （以降は 飛ばす）"); }
    else {
      見(画.上 && 画.左の紙 && 画.右 && 画.下, "★ 上バー・左の紙・右の採点・下バー の 4 段");
      見(画.切替.join("/") === "問題/解答/解説", "★ 上の 切り替えが 問題・解答・解説", 画.切替);
      見(/ダウンロード/.test(画.右上.join("")) && /終了/.test(画.右上.join("")),
         "★ 右上に 答案の ダウンロードと 終了", 画.右上);
      見(/\d/.test(String(画.点 || "")) && /点/.test(String(画.満点 || "")),
         "★ 点が 大きく 出る", 画.点 + 画.満点);
      見(画.内訳 >= 1, "★ 配点内訳が 並ぶ", 画.内訳);
      見(画.小タブ.join("/") === "採点根拠/改善前との比較", "★ 採点根拠 と 改善前との比較", 画.小タブ);
      見(画.道具.join(",") === "ペン,マーカー,消しゴム", "★ 下バーに ペン・マーカー・消しゴム", 画.道具);
      見(画.拡縮.join(",").indexOf("縮小") >= 0 && 画.拡縮.join(",").indexOf("拡大") >= 0,
         "★ 下バーに 拡大・縮小", 画.拡縮);
      見(画.行き来.join(",").indexOf("問題一覧に 戻る") >= 0
         && /問 1 \/ 4/.test(画.行き来.join(",")), "★ 問題の 行き来と 何問目", 画.行き来);
      見(/解説/.test(String(画.解説へ || "")), "★ 解説を 確認する", 画.解説へ);
      見(!画.プリセットの結果, "★ プリセットの 結果画面は 開かない");

      節("⑥ 問題／解答／解説 で 左の 紙が 変わる");
      const 紙 = {};
      for (const t of ["paper", "answer", "explain"]) {
        await page.evaluate((k) => __vqew().querySelector('[data-xrtab="' + k + '"]').click(), t);
        await 待(1600);
        紙[t] = await page.evaluate(() => {
          const f = __vqew().querySelector(".vq2-xr-paper iframe");
          const d = f && f.contentDocument;
          return d ? (d.body.textContent || "").replace(/\s+/g, "").slice(0, 60) : "";
        });
      }
      見(紙.paper && 紙.answer && 紙.explain, "3 つとも 紙が 出る");
      見(new Set(Object.values(紙)).size === 3, "★ 3 つとも 中身が 違う",
         Object.keys(紙).map((k) => k + ":" + 紙[k].slice(0, 18)).join(" | "));
      見(/解説/.test(紙.explain), "解説の 紙に 解説が ある", 紙.explain.slice(0, 30));

      節("⑦ 前の問題・次の問題");
      await page.evaluate(() => __vqew().querySelector('[data-xrtab="answer"]').click());
      await 待(1200);
      const 移 = await page.evaluate(async () => {
        const r = __vqew();
        const 前 = (r.querySelector(".vq2-xr-num") || {}).textContent;
        r.querySelector('[data-act="xr-next"]').click();
        await new Promise((z) => setTimeout(z, 400));
        const 後 = (r.querySelector(".vq2-xr-num") || {}).textContent;
        const 満 = (r.querySelector(".vq2-xr-sl") || {}).textContent;
        return { 前: String(前 || "").trim(), 後: String(後 || "").trim(), 満: String(満 || "").trim() };
      });
      見(移.前 !== 移.後, "★ 次の問題で 番号が 進む", 移);
      見(/点/.test(移.満), "右の 採点も その 設問の ものに なる", 移.満);

      節("⑧ 結果画面でも 書き込める");
      const 書 = await page.evaluate(async () => {
        const r = __vqew();
        /* ★ 道具は **押すと しまえる**（同じ ものを もう一度 押すと off）。
           試験中に 出したまま 結果へ 来ているので、出ていなければ 出す。 */
        for (let k = 0; k < 2; k++) {
          const cv0 = r.querySelector("canvas.vq2-ink");
          if (cv0 && cv0.classList.contains("is-on")) break;
          r.querySelector('[data-xrink="pen"]').click();
          await new Promise((z) => setTimeout(z, 400));
        }
        const 押 = r.querySelector('[data-xrink="pen"]');
        const 押した = 押 ? 押.className : "";
        const cv = r.querySelector("canvas.vq2-ink");
        if (!cv) return { 板: false };
        const b = cv.getBoundingClientRect();
        function ev(t, x, y) {
          cv.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: x, clientY: y,
            pointerId: 3, buttons: 1, isPrimary: true }));
        }
        ev("pointerdown", b.left + 40, b.top + 300);
        for (let i = 1; i <= 8; i++) { ev("pointermove", b.left + 40 + i * 9, b.top + 300 + i * 2); await new Promise((z) => setTimeout(z, 8)); }
        ev("pointerup", b.left + 120, b.top + 320);
        await new Promise((z) => setTimeout(z, 700));
        return { 板: true, 数: window.VQ2.store.loadNotes("res-a").length,
                 触れる: getComputedStyle(cv).pointerEvents,
                 印: cv.className, 押: 押した,

                 上: (function () { const b = cv.getBoundingClientRect();
                   const el = (cv.getRootNode()).elementFromPoint(b.left + 60, b.top + 310);
                   return el ? (el.tagName + "." + el.className) : "なし"; })() };
      });
      見(書.板, "結果画面にも 板が ある");
      見(書.数 === 3, "★ 結果画面で 引いた 線も 残る", JSON.stringify(書));
    }
  }

  節("⑪ スマホの 結果画面（2026-08-31・訴え「スマホに 最適化した？」）");
  {
    /* 直す前（実測 390px）: 上バーの 中身 441px・下バーの 中身 821px で
       横に あふれ、採点パネルへ 行く 道も 無かった。 */
    await page.setViewportSize({ width: 390, height: 844 });
    await 待(1800);
    const m1 = await page.evaluate(() => {
      const r = __vqew(); const xr = r.querySelector(".vq2-xr");
      const 幅 = (q) => { const e = r.querySelector(q); return e ? Math.round(e.getBoundingClientRect().width) : 0; };
      const 中 = (q) => { const e = r.querySelector(q); return e ? Math.round(e.scrollWidth) : 0; };
      return {
        m: xr ? xr.className.indexOf("is-m") >= 0 : false,
        上: [幅(".vq2-xr-top"), 中(".vq2-xr-top")],
        下: [幅(".vq2-xr-bot"), 中(".vq2-xr-bot")],
        横: xr ? xr.scrollWidth > xr.clientWidth + 1 : false,
        紙帯: !!r.querySelector(".vq2-xr-segrow"),
        面帯: [...r.querySelectorAll("[data-xrpane]")].map((e) => e.textContent.trim()),
        二段: r.querySelectorAll(".vq2-xr-botrow").length,
        押: [...r.querySelectorAll(".vq2-xr button")].filter((e) => e.getClientRects().length)
          .map((e) => Math.round(e.getBoundingClientRect().height)).filter((x) => x > 0)
      };
    });
    見(m1.m, "スマホの 組みに なる");
    見(m1.上[0] >= m1.上[1], "★ 上バーが 画面から はみ出さない", m1.上);
    見(m1.下[0] >= m1.下[1], "★ 下バーが 画面から はみ出さない", m1.下);
    見(!m1.横, "★ 横に スクロールしない");
    見(m1.紙帯, "★ 問題・解答・解説は 帯を 1 本 下ろす");
    見(m1.面帯.join("/") === "問題用紙/採点結果", "★ 紙 ⇄ 採点の 切り替えが ある", m1.面帯);
    見(m1.二段 === 2, "★ 下バーは 2 段", m1.二段);
    見(m1.押.every((h) => h >= 43), "★ 押す ところが 43px 以上", m1.押.join(","));
    /* 採点へ 切り替える。 */
    const m2 = await page.evaluate(async () => {
      const r = __vqew();
      r.querySelector('[data-xrpane="side"]').click();
      await new Promise((z) => setTimeout(z, 600));
      const xr = r.querySelector(".vq2-xr");
      const sd = r.querySelector(".vq2-xr-side");
      return { 採点: !!sd && !sd.hidden && sd.getBoundingClientRect().width > 0,
               紙: !r.querySelector(".vq2-xr-left").hidden,
               横: xr.scrollWidth > xr.clientWidth + 1,
               列: (() => { const t = r.querySelector(".vq2-xr-two"); return t ? getComputedStyle(t).gridTemplateColumns : ""; })(),
               道具: r.querySelectorAll("[data-xrink]").length };
    });
    見(m2.採点, "★ 採点結果へ 行ける");
    見(!m2.紙, "紙は 引っ込む（1 つずつ 出す）");
    見(!m2.横, "★ 採点側も 横に スクロールしない");
    見(m2.列.split(" ").length === 1, "★ 採点の 中は 1 列に なる", m2.列);
    見(m2.道具 === 0, "採点を 見ている ときは 書き込みの 道具を 出さない", m2.道具);
    /* 紙へ 戻す。 */
    await page.evaluate(() => __vqew().querySelector('[data-xrpane="paper"]').click());
    await 待(800);
    const m3 = await page.evaluate(() => {
      const r = __vqew();
      const f = r.querySelector("#examPaper iframe");
      const d = f && f.contentDocument;
      return { 紙: !r.querySelector(".vq2-xr-left").hidden,
               倍率: d ? (getComputedStyle(d.body).zoom || "") : "",
               道具: r.querySelectorAll("[data-xrink]").length };
    });
    見(m3.紙 && m3.道具 === 3, "★ 紙へ 戻すと 道具も 戻る", m3);
    /* ★ スマホは 読みやすさを 切り替えられる（46%＝5pt では 読めない）。 */
    const m4 = await page.evaluate(async () => {
      const r = __vqew();
      const b = r.querySelector('.vq2-xr-bot [data-act="reflow"]');
      const 前 = b ? b.textContent.trim() : "(なし)";
      if (b) b.click();
      await new Promise((z) => setTimeout(z, 1600));
      const f = r.querySelector("#examPaper iframe");
      const d = f && f.contentDocument;
      const pg = d && d.querySelector(".page");
      const q = d && (d.querySelector(".q-text") || d.querySelector("body"));
      return { 札: 前,
               後の札: (r.querySelector('.vq2-xr-bot [data-act="reflow"]') || {}).textContent,
               倍率: d ? Number(getComputedStyle(d.body).zoom || 1) : 0,
               字: q ? Math.round(parseFloat(getComputedStyle(q).fontSize)) : 0,
               紙幅: pg ? Math.round(pg.getBoundingClientRect().width) : 0,
               欄幅: Math.round(r.querySelector("#examPaper").clientWidth) };
    });
    見(m4.札 === "紙のまま", "★ スマホは はじめから 折り返して 読む（札は「紙のまま」）", m4.札);
    見(m4.後の札 === "読みやすく", "★ 押すと 紙のままに なる", m4.後の札);
    見(m4.倍率 < 0.8, "紙のままでは 幅に 合わせて 縮める", m4.倍率);
    見(m4.紙幅 > 0 && m4.紙幅 <= m4.欄幅 + 2, "★ 紙が 欄に 収まる", m4);
    /* もう一度 押して 折り返しへ 戻す。ここが 読める 大きさ。 */
    const m5 = await page.evaluate(async () => {
      const r = __vqew();
      r.querySelector('.vq2-xr-bot [data-act="reflow"]').click();
      await new Promise((z) => setTimeout(z, 1600));
      const d = r.querySelector("#examPaper iframe").contentDocument;
      const q = d.querySelector(".q-text") || d.body;
      const pg = d.querySelector(".page");
      return { 倍率: Number(getComputedStyle(d.body).zoom || 1),
               字: Math.round(parseFloat(getComputedStyle(q).fontSize)),
               紙幅: pg ? Math.round(pg.getBoundingClientRect().width) : 0,
               欄幅: Math.round(r.querySelector("#examPaper").clientWidth) };
    });
    見(Math.abs(m5.倍率 - 1) < 0.01, "★ 折り返しでは 縮めない（倍率 1）", m5.倍率);
    見(m5.字 >= 12, "★ 文字が 読める 大きさ（46%＝5pt に しない）", m5.字 + "px");
    見(m5.紙幅 <= m5.欄幅 + 2, "★ 折り返しでも 欄に 収まる", m5);
    await page.setViewportSize({ width: 1440, height: 950 });
    await 待(1500);
    const pc = await page.evaluate(() => {
      const r = __vqew();
      const f = r.querySelector("#examPaper iframe");
      const d = f && f.contentDocument;
      return { 倍率: d ? Number(getComputedStyle(d.body).zoom || 1) : 0,
               両方: !r.querySelector(".vq2-xr-left").hidden && !r.querySelector(".vq2-xr-side").hidden,
               面帯: r.querySelectorAll("[data-xrpane]").length };
    });
    見(Math.abs(pc.倍率 - 1) < 0.01, "★ PC に 戻すと 紙は 100%", pc.倍率);
    見(pc.両方, "PC は 左右 とも 出る");
    見(pc.面帯 === 0, "PC では 切り替えの 帯を 出さない");
  }

  節("⑩ 見た目を 1 枚 撮る");
  {
    try {
      /* Lumi の はじめかたの 案内が 前に 出ていたら 閉じる（画像が ぼける）。 */
      await page.evaluate(() => {
        function 潜(n, 出) {
          if (!n) return;
          if (n.shadowRoot) 潜(n.shadowRoot, 出);
          const c = n.children || [];
          for (let i = 0; i < c.length; i++) 潜(c[i], 出);
          if (n.tagName === "BUTTON" && /^(あとで|もう出さない|閉じる|スキップ)$/.test((n.textContent || "").trim()))
            出.push(n);
        }
        const 出 = [];
        潜(document.body, 出);
        出.forEach((b) => { try { b.click(); } catch (e) {} });
      });
      await 待(700);
      /* 2 段階（あとで → もう出さない）の ことが ある。もう一度 押す。 */
      await page.evaluate(() => {
        function 潜(n, 出) {
          if (!n) return;
          if (n.shadowRoot) 潜(n.shadowRoot, 出);
          const c = n.children || [];
          for (let i = 0; i < c.length; i++) 潜(c[i], 出);
          if (n.tagName === "BUTTON" && /^(あとで|もう出さない|閉じる|スキップ)$/.test((n.textContent || "").trim()))
            出.push(n);
        }
        const 出 = [];
        潜(document.body, 出);
        出.forEach((b) => { try { b.click(); } catch (e) {} });
      });
      await 待(900);
      await page.evaluate(() => __vqew().querySelector('[data-xrtab="answer"]').click());
      await 待(1600);
      const h = await page.$("#vq2-exam-workspace, [id*='vq2-exam-workspace']");
      if (h) await h.screenshot({ path: (process.env.VQ_SHOT || "/tmp") + "/exam-result.png" });
      見(!!h, "結果画面の 画像を 出した（PC）", (process.env.VQ_SHOT || "/tmp") + "/exam-result.png");
      /* スマホの ぶんも 撮る（紙と 採点の 2 枚）。 */
      await page.setViewportSize({ width: 390, height: 844 });
      await 待(1800);
      const h2 = await page.$("[id*='vq2-exam-workspace']");
      if (h2) await h2.screenshot({ path: (process.env.VQ_SHOT || "/tmp") + "/exam-result-m1.png" });
      await page.evaluate(() => __vqew().querySelector('[data-xrpane="side"]').click());
      await 待(700);
      const h3 = await page.$("[id*='vq2-exam-workspace']");
      if (h3) await h3.screenshot({ path: (process.env.VQ_SHOT || "/tmp") + "/exam-result-m2.png" });
      見(!!h2 && !!h3, "スマホの 画像も 出した（紙 と 採点）");
    } catch (e) { 見(false, "結果画面の 画像を 出した", String(e.message).slice(0, 80)); }
  }

  節("⑨ 例外");
  見(例外.length === 0, "画面の 例外 0 件", 例外.slice(0, 3));

  console.log("\n────────────────────────────────");
  console.log("通った: " + 済 + " / 落ちた: " + 落);
  if (落) console.log("落ちたもの:\n  - " + 落ち.join("\n  - "));
  await browser.close();
  process.exit(落 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
