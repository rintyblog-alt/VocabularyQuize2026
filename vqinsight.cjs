/* ══════════════════════════════════════════════════════════════════════
   学習データの統合と Insight（作り直し後）を、実画面で確かめる。
   使い方: node vqinsight.cjs

   ・新しいクイズ / Quick Mock の結果がホームと Insight へ届くか
   ・同じ結果を保存し直しても二重に数えないか
   ・採点待ちを 0 点にしないか
   ・記録が無いとき・少ないときに、巨大な空白や作り話を出さないか
   ・ホームには無い分析（科目・単元・形式・苦手・試験・習慣）が出るか
   ・グラフだけで伝えず、同じ数字を表でも出すか
   ・横にはみ出さないか
   ══════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const fs = require("node:fs");
fs.mkdirSync("shots/insight", { recursive: true });
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  NG   " + n + (x ? "  → " + x : ""))); };

const HIDE = () => {
  ["firstLaunchOverlay", "vqbFlow", "vqNewAuth", "authGate", "authBootSplash"].forEach((id) => {
    const e = document.getElementById(id);
    if (e) { e.hidden = true; e.style.setProperty("display", "none", "important"); }
  });
  document.querySelectorAll('[data-act="dlg-x"],[data-act="dlg-o"]').forEach((x) => x.click());
  document.body.classList.remove("auth-booting", "auth-gate-open");
  const a = document.getElementById("app");
  if (a) a.style.setProperty("display", "block", "important");
  document.body.setAttribute("data-ui-v2", "1");
  try {
    localStorage.setItem("vq.tour.v1", JSON.stringify({
      pin: 1, preset: 1, feed: 1, news: 1, insight: 1, chat: 1,
      notif: 1, mock: 1, presetmake: 1, settings: 1
    }));
    const tv = document.getElementById("vqTour"); if (tv) tv.style.display = "none";
  } catch (e) {}
};

/* 学習の記録をこしらえる。
   **画面へ数字を直に書かない。** 実際に結果を保存する経路を通し、
   本体の集計を経て画面へ出させる。 */
const SEED = (spec) => {
  const L = VQ2.learning, ST = VQ2.store;
  const DAY = 86400000;
  L.clearAll();
  try { localStorage.setItem(L.LEGACY_SESSIONS_KEY, "[]"); } catch (e) {}
  const mk = (o) => {
    const n = o.items;
    const items = [];
    for (let i = 0; i < n; i++) {
      const pending = o.pending && i >= n - o.pending;
      items.push({
        questionId: o.id + "-q" + i,
        type: i % 3 === 0 ? "summarize" : "multiple_choice_single",
        engine: i % 3 === 0 ? "free_text" : "single_choice",
        answered: true,
        correct: pending ? null : i < o.correct,
        score: pending ? null : (i < o.correct ? 1 : 0),
        maxScore: 1, timeMs: 9000 + i * 500,
        hintUsed: i % 5 === 0, flagged: false, confidence: null,
        method: pending ? "ai" : "rule"
      });
    }
    return {
      id: o.id, kind: o.kind || "quiz",
      presetId: o.presetId || "p1", presetName: o.name || "テスト用プリセット",
      mode: o.mode || "practice",
      finishedAt: new Date(Date.now() - o.daysAgo * DAY).toISOString(),
      elapsedMs: 240000, items,
      score: items.reduce((a, x) => a + (x.score || 0), 0), maxScore: n,
      questionsSnapshot: items.map((x, i) => ({
        id: x.questionId, type: x.type,
        subject: o.subject || "英語",
        unit: i % 2 === 0 ? "関係代名詞" : "仮定法"
      }))
    };
  };
  (spec || []).forEach((o) => { ST.results.put(mk(o)); });
  return { sessions: L.listSessions({}).length };
};

async function goInsight(pg) {
  await pg.evaluate(() => {
    const b = document.querySelector('#appTabBar [data-app-tab="insight"]');
    if (b) b.click();
    else document.body.setAttribute("data-app-tab", "insight");
  });
  await pg.waitForTimeout(1500);
}

(async () => {
  const b = await chromium.launch({ headless: true });

  for (const d of [{ n: "PC", w: 1440, h: 950, m: false }, { n: "スマホ", w: 390, h: 844, m: true }]) {
    const ctx = await b.newContext({ viewport: { width: d.w, height: d.h }, deviceScaleFactor: 2, isMobile: d.m, hasTouch: d.m });
    const pg = await ctx.newPage();
    const errs = [];
    pg.on("pageerror", (e) => errs.push(String(e).slice(0, 180)));
    await pg.goto(BASE + "/?vq2=all&vqdev=1&cb=" + Date.now(), { waitUntil: "domcontentloaded" });
    await pg.waitForTimeout(4000);
    await pg.evaluate(HIDE);
    await pg.waitForTimeout(800);

    console.log("\n══ " + d.n + " ══");

    /* ── 0. 基盤 ── */
    const base = await pg.evaluate(() => ({
      learning: !!(window.VQ2 && VQ2.learning),
      analytics: !!(window.VQ2 && VQ2.analytics),
      hooked: !!(window.VQ2 && VQ2.store && VQ2.store.results.__learnHooked)
    }));
    ok(d.n + "：学習データの基盤が載っている", base.learning && base.analytics);
    ok(d.n + "：結果の保存が学習記録へ結線されている", base.hooked);

    /* ── 1. 記録がまったく無いとき ── */
    await pg.evaluate(() => { VQ2.learning.clearAll(); });
    await goInsight(pg);
    const e0 = await pg.evaluate(() => {
      const h = document.getElementById("vqInsight");
      if (!h || !h.shadowRoot) return { none: true };
      const r = h.shadowRoot.querySelector(".wrap");
      const empty = r.querySelector(".empty");
      return {
        text: r.textContent,
        title: (r.querySelector(".head h1") || {}).textContent,
        hasEmpty: !!empty,
        emptyH: empty ? Math.round(empty.getBoundingClientRect().height) : 0,
        acts: [].map.call(r.querySelectorAll(".empty .act"), (x) => x.textContent.trim()),
        hasChart: !!r.querySelector("[data-chart] svg")
      };
    });
    ok(d.n + "：Insight が出る", !e0.none && e0.title === "Insight", e0.title);
    ok(d.n + "：記録が無くても次の一手を出す", e0.hasEmpty && e0.acts.length >= 2, JSON.stringify(e0.acts));
    ok(d.n + "：巨大な空白にしない", e0.emptyH > 0 && e0.emptyH < 560, e0.emptyH + "px");
    ok(d.n + "：どんな分析が出るかを説明する", /正答率/.test(e0.text) && /苦手/.test(e0.text));
    ok(d.n + "：作り話の図を描かない", !e0.hasChart);
    ok(d.n + "：作り話の数を出さない", !/\d+\s*%/.test(e0.text));

    /* ── 2. 学習を記録する ── */
    const seeded = await pg.evaluate(SEED, [
      { id: "s1", daysAgo: 0, items: 9, correct: 6 },
      { id: "s2", daysAgo: 1, items: 9, correct: 3 },
      { id: "s3", daysAgo: 2, items: 6, correct: 5, subject: "数学", presetId: "p2", name: "数学テスト" },
      { id: "s4", daysAgo: 4, items: 9, correct: 4 },
      { id: "s5", daysAgo: 6, items: 6, correct: 2 },
      { id: "s6", daysAgo: 9, items: 9, correct: 5 },
      { id: "m1", daysAgo: 3, items: 12, correct: 7, kind: "mock", mode: "mock", name: "第1回 模試" },
      { id: "m2", daysAgo: 1, items: 12, correct: 9, kind: "mock", mode: "mock", name: "第2回 模試", pending: 2 }
    ]);
    ok(d.n + "：結果を保存すると学習記録になる", seeded.sessions === 8, "セッション " + seeded.sessions);

    const mirrored = await pg.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem(VQ2.learning.LEGACY_SESSIONS_KEY) || "[]");
      return { n: raw.length, mine: raw.filter((x) => x.vq2SessionId).length };
    });
    ok(d.n + "：ホームが読む場所へも届く", mirrored.mine === 8, JSON.stringify(mirrored));

    const dbl = await pg.evaluate(() => {
      const before = VQ2.learning.listSessions({}).length;
      const r = VQ2.store.results.list()[0];
      VQ2.store.results.put(r);
      VQ2.store.results.put(r);
      return { before, after: VQ2.learning.listSessions({}).length };
    });
    ok(d.n + "：同じ結果を保存し直しても増えない", dbl.before === dbl.after, JSON.stringify(dbl));

    const pend = await pg.evaluate(() => {
      const s = VQ2.learning.listSessions({}).filter((x) => x.pendingCount > 0)[0];
      return s ? { pending: s.pendingCount, correct: s.correctCount, wrong: s.incorrectCount,
                   acc: s.accuracy, status: s.status } : null;
    });
    /* 12 問中 2 問が採点待ち → 採点が済んだのは 10 問。
       待っている 2 問を不正解側へ入れていないことを見る。 */
    ok(d.n + "：採点待ちを不正解として数えない",
       pend && pend.pending === 2 && (pend.correct + pend.wrong) === 10 && pend.status === "scoring",
       JSON.stringify(pend));

    /* ── 3. Insight の中身 ── */
    await goInsight(pg);
    const v = await pg.evaluate(() => {
      const sr = document.getElementById("vqInsight").shadowRoot;
      const r = sr.querySelector(".wrap");
      return {
        text: r.textContent,
        kpis: [].map.call(r.querySelectorAll(".kpi .k"), (x) => x.textContent.trim()),
        cards: [].map.call(r.querySelectorAll(".card-h h2"), (x) => x.textContent.trim()),
        pills: [].map.call(r.querySelectorAll('[data-a="range"]'), (x) => x.textContent.trim()),
        metrics: [].map.call(r.querySelectorAll('[data-a="metric"]'), (x) => x.textContent.trim()),
        hasChart: !!r.querySelector("[data-chart] svg"),
        hasTable: !!r.querySelector(".tbl"),
        weak: r.querySelectorAll(".weak").length,
        reasons: [].map.call(r.querySelectorAll(".why li"), (x) => x.textContent.trim()),
        mockRows: r.querySelectorAll(".mockrow").length,
        recs: r.querySelectorAll(".rec").length,
        pend: (r.textContent.match(/採点待ち/g) || []).length
      };
    });
    ok(d.n + "：主要な数が並ぶ", v.kpis.length >= 5, JSON.stringify(v.kpis));
    ok(d.n + "：期間を選べる", v.pills.length >= 4, JSON.stringify(v.pills));
    ok(d.n + "：指標を切り替えられる", v.metrics.length === 4, JSON.stringify(v.metrics));
    ok(d.n + "：グラフが出る", v.hasChart);
    ok(d.n + "：グラフと同じ数字を表でも出す", v.hasTable);
    ok(d.n + "：ホームには無い分析が並ぶ",
       ["科目ごと", "問題の形式ごと", "苦手なところ", "学習の習慣"].every((t) => v.cards.indexOf(t) >= 0),
       JSON.stringify(v.cards));
    ok(d.n + "：苦手が理由つきで出る", v.weak >= 1 && v.reasons.length >= 1,
       "苦手 " + v.weak + " 件 / 理由 " + v.reasons.length);
    ok(d.n + "：試験の分析が別に出る", v.mockRows >= 2, "行 " + v.mockRows);
    ok(d.n + "：採点待ちを画面でも待っていると書く", v.pend >= 1);
    ok(d.n + "：次のおすすめが出る", v.recs >= 1, "件 " + v.recs);
    ok(d.n + "：内部の ID を出さない",
       !/sub:|multiple_choice_single|summarize|free_text|quick_mock/.test(v.text),
       (v.text.match(/sub:[a-z]+|multiple_choice_single|summarize/g) || []).slice(0, 3).join(","));

    /* 画面の数が集計と一致するか（画面で数を作っていないこと） */
    const truth = await pg.evaluate(() => {
      const sr = document.getElementById("vqInsight").shadowRoot;
      const r = sr.querySelector(".wrap");
      const pillOn = [].filter.call(r.querySelectorAll('[data-a="range"]'),
        (x) => x.getAttribute("aria-selected") === "true")[0];
      const range = pillOn ? pillOn.getAttribute("data-v") : "30d";
      const s = VQ2.analytics.summary({ range });
      const kpis = [].map.call(r.querySelectorAll(".kpi"), (x) => ({
        k: x.querySelector(".k").textContent.trim(),
        n: x.querySelector(".n").textContent.trim()
      }));
      const acc = kpis.filter((x) => x.k === "正答率")[0];
      const ans = kpis.filter((x) => x.k === "答えた数")[0];
      return { range, acc: acc ? acc.n : "", ans: ans ? ans.n : "",
               trueAcc: String(s.current.accuracy), trueAns: String(s.current.answeredCount) };
    });
    ok(d.n + "：正答率が集計と一致する", truth.acc === truth.trueAcc, truth.acc + " / " + truth.trueAcc);
    ok(d.n + "：解答数が集計と一致する", truth.ans === truth.trueAns, truth.ans + " / " + truth.trueAns);

    /* ── 4. 指標の切り替えとツールチップ ── */
    const sw = await pg.evaluate(async () => {
      const sr = document.getElementById("vqInsight").shadowRoot;
      const m = [].filter.call(sr.querySelectorAll('[data-a="metric"]'), (x) => /学習時間/.test(x.textContent))[0];
      if (m) m.click();
      await new Promise((r) => setTimeout(r, 400));
      const sr2 = document.getElementById("vqInsight").shadowRoot;
      const on = [].filter.call(sr2.querySelectorAll('[data-a="metric"]'),
        (x) => x.getAttribute("aria-selected") === "true")[0];
      const box = sr2.querySelector("[data-chart]");
      const hit = box ? box.querySelector("rect[data-i]") : null;
      if (hit) hit.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 200));
      const tip = sr2.querySelector("[data-tip]");
      return { on: on ? on.textContent.trim() : "", tip: tip ? tip.textContent.trim() : "",
               shown: tip ? tip.classList.contains("on") : false };
    });
    ok(d.n + "：指標を切り替えられる（学習時間）", /学習時間/.test(sw.on), sw.on);
    ok(d.n + "：グラフに触ると値が出る", sw.shown && sw.tip.length > 0, sw.tip.slice(0, 40));

    /* ── 5. くらべられないときに 0% と言わない ── */
    const cmp = await pg.evaluate(async () => {
      const sr = document.getElementById("vqInsight").shadowRoot;
      const all = [].filter.call(sr.querySelectorAll('[data-a="range"]'), (x) => /全期間/.test(x.textContent))[0];
      if (all) all.click();
      await new Promise((r) => setTimeout(r, 700));
      const sr2 = document.getElementById("vqInsight").shadowRoot;
      return { na: [].map.call(sr2.querySelectorAll(".kpi .d.na"), (x) => x.textContent.trim()) };
    });
    ok(d.n + "：くらべられないときは理由を書く（0% と出さない）",
       cmp.na.length >= 1 && cmp.na.some((t) => /くらべ|ありません/.test(t)), JSON.stringify(cmp.na.slice(0, 2)));

    /* ── 6. 科目のドリルダウン ── */
    const drill = await pg.evaluate(async () => {
      const sr = document.getElementById("vqInsight").shadowRoot;
      const row = sr.querySelector('.row[data-a="subject"]');
      if (!row) return { none: true };
      const before = sr.querySelectorAll(".row").length;
      row.click();
      await new Promise((r) => setTimeout(r, 400));
      const sr2 = document.getElementById("vqInsight").shadowRoot;
      return { before, after: sr2.querySelectorAll(".row").length,
               expanded: sr2.querySelector('.row[data-a="subject"]').getAttribute("aria-expanded") };
    });
    ok(d.n + "：科目を押すと単元まで見られる",
       !drill.none && drill.after > drill.before && drill.expanded === "true", JSON.stringify(drill));

    /* ── 7. 形式は全部並べない ── */
    const types = await pg.evaluate(() => {
      const sr = document.getElementById("vqInsight").shadowRoot;
      const cards = [].slice.call(sr.querySelectorAll(".card"));
      const c = cards.filter((x) => /問題の形式ごと/.test(x.textContent))[0];
      if (!c) return { none: true };
      return { rows: c.querySelectorAll(".row").length, hasMore: !!c.querySelector('[data-a="alltypes"]') };
    });
    ok(d.n + "：形式は使った分だけ（130 個並べない）", !types.none && types.rows <= 6, "行 " + types.rows);

    /* ── 8. 横にはみ出さない ── */
    const over = await pg.evaluate(() => {
      const w = document.getElementById("vqInsight").shadowRoot.querySelector(".wrap");
      return { wrap: Math.max(0, w.scrollWidth - w.clientWidth) };
    });
    ok(d.n + "：横にはみ出さない", over.wrap === 0, over.wrap + "px");

    await pg.screenshot({ path: "shots/insight/insight-" + d.n + ".png" });

    /* ── 9. 記録はあるが、その期間には無い ── */
    const gone = await pg.evaluate(async () => {
      VQ2.learning.clearAll();
      const DAY = 86400000;
      VQ2.learning.recordResult({
        id: "old", kind: "quiz", presetId: "p1", presetName: "むかし", mode: "practice",
        finishedAt: new Date(Date.now() - 200 * DAY).toISOString(), elapsedMs: 60000,
        items: [{ questionId: "q1", type: "multiple_choice_single", engine: "single_choice",
                  answered: true, correct: true, score: 1, maxScore: 1, timeMs: 5000 }],
        score: 1, maxScore: 1,
        questionsSnapshot: [{ id: "q1", type: "multiple_choice_single", subject: "英語" }]
      });
      const sr = document.getElementById("vqInsight").shadowRoot;
      const p7 = [].filter.call(sr.querySelectorAll('[data-a="range"]'), (x) => /7日/.test(x.textContent))[0];
      if (p7) p7.click();
      await new Promise((r) => setTimeout(r, 800));
      return { text: document.getElementById("vqInsight").shadowRoot.querySelector(".wrap").textContent };
    });
    ok(d.n + "：この期間に無いときは 0 件と言い切らない",
       /この期間の記録はありません/.test(gone.text) && /ほかの期間には記録があります/.test(gone.text));

    ok(d.n + "：画面のエラーが出ていない", errs.length === 0, errs.slice(0, 2).join(" / "));
    await ctx.close();
  }

  await b.close();
  console.log("\n合格 " + pass + " / 不合格 " + fail);
  process.exit(fail ? 1 : 0);
})();
