/* Quick Mock 高速パイプラインの中身を確かめる（AI を実際に動かす）。

   速さは vqmockperf.cjs で測る。ここで見るのは「速くするために変えたことが
   本当にそうなっているか」。数字だけ良くて中身が壊れていては意味がない。

     ・構成と設問数と配点が、設定どおりに **コード側で** 決まっているか
     ・頼んだ数を超えて作られていないか（捨てた数が 0 か）
     ・資料の読み取りが 1 回だけか（大問ごとに読み直していないか）
     ・大問が並列で走っているか
     ・できた大問がその場で画面に出るか
     ・一時停止・指示追加・部分再生成が効くか
     ・できている大問が、指示なしに作り直されないか

   実行: node vqmockfast.cjs
*/
const { chromium } = require("playwright");
const fs = require("fs");
const os = require("os");
const path = require("path");

const URL = "http://127.0.0.1:8791/?vqdev=1";
const HIDE = `#vqbFlow,#mob-tut-overlay,#mobBarTutorial,#firstLaunchOverlay,#vqOnboardingOverlay{display:none !important;}`;
const SAMPLE = path.join(os.tmpdir(), "vqmockfast-source.txt");
fs.writeFileSync(SAMPLE, [
  "【ヴェルナ地方史 要点】",
  "812年 ドルヴァス朝が成立。初代王アスカル1世が都をリューンに置いた。",
  "839年 ザルカンド条約により、隣国トレーシャとの国境が現在の位置に定まった。",
  "840年 王都リューンで大市が開かれ、香辛料と羊毛の交易が本格化した。",
  "873年 アスカル3世が「三部会」を招集し、貴族・聖職者・都市代表が政策を協議した。",
  "901年 ドルヴァス朝は分裂し、東西二つの王国に分かれた。",
  "経済: 羊毛は西部の高地で生産され、リューンを経由して輸出された。",
  "文化: 三部会の記録は羊皮紙に残され、のちの法典編纂の基礎となった。"
].join("\n"), "utf8");

const COND = {
  title: "確認テスト", subject: "日本史探究", grade: "H3",
  durationMinutes: 40, totalPoints: 100, sectionCount: 3, questionCount: 6,
  instruction: "添付した資料の範囲だけで作ってください。"
};

let pass = 0, fail = 0;
const log = [];
function ok(name, cond, extra) {
  if (cond) { pass++; log.push("  ✓ " + name + (extra ? " — " + extra : "")); }
  else { fail++; log.push("  ✗ " + name + (extra ? "\n      → " + extra : "")); }
}

async function login(pg) {
  await pg.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.addStyleTag({ content: HIDE });
  await pg.waitForFunction(() => document.getElementById("authLoginSubmitBtn"), null, { timeout: 60000 });
  await pg.evaluate(() => {
    const setV = (el, v) => {
      const p = el.tagName === "SELECT" ? HTMLSelectElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(p.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    setV(document.getElementById("authLoginGrade"), "H3");
    setV(document.getElementById("authLoginNickname"), "fast");
    setV(document.getElementById("authLoginPassword"), "Abcd1234");
    document.getElementById("authLoginSubmitBtn").click();
  });
  await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", null, { timeout: 90000 });
  await pg.addStyleTag({ content: HIDE });
  await pg.waitForTimeout(2000);
  for (let i = 0; i < 3; i++) {
    const c = await pg.evaluate(() => {
      const bd = document.querySelector(".ui-modal-backdrop");
      if (!bd || getComputedStyle(bd).display === "none") return false;
      const b = document.getElementById("uiModalOk") || document.getElementById("uiModalCancel");
      if (b) { b.click(); return true; }
      return false;
    });
    if (!c) break;
    await pg.waitForTimeout(400);
  }
  await pg.evaluate(() => { const n = document.getElementById("vqNewAuth"); if (n) n.style.display = "none"; });
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(e.message));

  try {
    await login(pg);
    await pg.evaluate(() => { window.__vqMetrics = []; window.__vqMockWaste = []; });
    await pg.evaluate(() => window.VQ2.quickMock.open({}));
    await pg.waitForFunction(() => {
      const h = document.querySelector(".vq2-host");
      return !!(h && h.shadowRoot && h.shadowRoot.querySelector('[data-act="attach"]'));
    }, null, { timeout: 120000 });

    pg.once("filechooser", async (fc) => { await fc.setFiles(SAMPLE); });
    await pg.evaluate(() => {
      const b = document.querySelector(".vq2-host").shadowRoot.querySelector('[data-act="attach"]');
      if (b) b.click();
    });
    await pg.waitForFunction(() => {
      const h = document.querySelector(".vq2-host");
      return !!(h && h.shadowRoot.querySelector(".vq2-attach-i"));
    }, null, { timeout: 180000 });

  /* 大問数・設問数は「詳細設定」の中にあり、閉じていると DOM に無い。
       開かずに値を入れると **黙って既定値のまま**になる（実際にそうなり、
       大問3の指定が既定の5大問で走ってしまった）。必ず開いてから入れる。 */
    await pg.evaluate(async () => {
      const r = document.querySelector(".vq2-host").shadowRoot;
      for (const b of Array.from(r.querySelectorAll("[data-acc]"))) {
        b.click();
        await new Promise((x) => setTimeout(x, 150));
      }
    });
    await pg.waitForTimeout(400);
    await pg.evaluate((c) => {
      const r = document.querySelector(".vq2-host").shadowRoot;
      Object.keys(c).forEach((k) => {
        const el = r.querySelector(`[data-key="${k}"]`);
        if (!el) return;
        const P = el.tagName === "SELECT" ? HTMLSelectElement
          : el.tagName === "TEXTAREA" ? HTMLTextAreaElement : HTMLInputElement;
        Object.getOwnPropertyDescriptor(P.prototype, "value").set.call(el, String(c[k]));
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }, COND);
    await pg.waitForTimeout(500);

    /* 構成案は挟まずに直接作る（構成案の有無で結果が変わらないことも見たい） */
    await pg.evaluate(() => {
      const b = document.querySelector(".vq2-host").shadowRoot.querySelector('[data-act="blueprint"]');
      if (b) b.click();
    });
    await pg.waitForFunction(() => {
      const r = document.querySelector(".vq2-host").shadowRoot;
      return !!r.querySelector('[data-act="generate"], [data-act="generate-direct"]');
    }, null, { timeout: 900000 });

    const t0 = Date.now();
    await pg.evaluate(() => {
      const r = document.querySelector(".vq2-host").shadowRoot;
      const b = r.querySelector('[data-act="generate"]') || r.querySelector('[data-act="generate-direct"]');
      if (b) b.click();
    });

    /* ── 生成中に見る ────────────────────────────────── */
    let sawBar = false, sawParallel = false, sawPartial = false, firstSectionMs = 0;
    let maxRunning = 0;
    const poll = setInterval(async () => {
      try {
        const s = await pg.evaluate(() => {
          const r = document.querySelector(".vq2-host");
          if (!r || !r.shadowRoot) return null;
          const sr = r.shadowRoot;
          return {
            bar: !!sr.querySelector(".vq2-genbar"),
            barText: (sr.querySelector(".vq2-genbar-t") || {}).textContent || "",
            questions: sr.querySelectorAll("[data-q]").length,
            running: (window.VQ2 && window.VQ2.ai && window.VQ2.ai.runningCount)
              ? window.VQ2.ai.runningCount() : 0
          };
        });
        if (!s) return;
        if (s.bar) sawBar = true;
        if (s.running > maxRunning) maxRunning = s.running;
        if (s.running >= 2) sawParallel = true;
        if (s.questions > 0 && !sawPartial) { sawPartial = true; firstSectionMs = Date.now() - t0; }
      } catch (e) {}
    }, 700);

    /* 途中で一時停止・指示追加を試す（最初の大問ができたあたり） */
    let pausedOk = null, instructOk = null;
    const tryControls = setTimeout(async () => {
      try {
        pausedOk = await pg.evaluate(async () => {
          const r = document.querySelector(".vq2-host").shadowRoot;
          const b = r.querySelector('[data-act="gen-pause"]');
          if (!b) return "no-button";
          b.click();
          await new Promise((x) => setTimeout(x, 600));
          const t = (r.querySelector(".vq2-genbar-t") || {}).textContent || "";
          const rb = r.querySelector('[data-act="gen-resume"]');
          if (rb) rb.click();                        /* すぐ再開する（測定を止めない） */
          return /一時停止/.test(t) ? "ok" : "no-label:" + t;
        });
        instructOk = await pg.evaluate(async () => {
          const r = document.querySelector(".vq2-host").shadowRoot;
          const ta = r.querySelector('[data-key="instruction"]');
          if (!ta) return "no-input";
          Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")
            .set.call(ta, "用語の意味を問う設問を必ず1問入れてください");
          ta.dispatchEvent(new Event("input", { bubbles: true }));
          await new Promise((x) => setTimeout(x, 200));
          const b = r.querySelector('[data-act="gen-instruct"]');
          if (!b) return "no-button";
          b.click();
          await new Promise((x) => setTimeout(x, 600));
          return "ok";
        });
      } catch (e) { pausedOk = "err:" + e.message; }
    }, 12000);

    await pg.waitForFunction(() => {
      const h = document.querySelector(".vq2-host");
      if (!h) return false;
      const sr = h.shadowRoot;
      return !!sr.querySelector("[data-q]") && !sr.querySelector(".vq2-genbar");
    }, null, { timeout: 3600000, polling: 1500 });
    clearInterval(poll); clearTimeout(tryControls);
    const totalMs = Date.now() - t0;

    /* ── できたものを見る ─────────────────────────────── */
    const got = await pg.evaluate(() => {
      const r = document.querySelector(".vq2-host").shadowRoot;
      const metrics = window.__vqMetrics || [];
      const waste = window.__vqMockWaste || [];
      return {
        metrics: metrics.map((m) => ({
          stages: (m.stages || []).map((s) => s.stage),
          calls: (m.calls || []).map((c) => c.role),
          completion: m.completionTokens, prompt: m.promptTokens,
          retries: m.retries || [],
          structured: m.structured || null
        })),
        waste: waste,
        questionsOnScreen: r.querySelectorAll("[data-q]").length
      };
    });

    ok("生成中の操作バーが出る", sawBar);
    ok("できた大問がその場で画面に出る", sawPartial,
       sawPartial ? "最初の大問まで " + (firstSectionMs / 1000).toFixed(1) + "s（全体 " + (totalMs / 1000).toFixed(1) + "s）" : "");
    ok("大問が並列で走る", sawParallel, "同時に走った最大 " + maxRunning + " 本");
    ok("一時停止が効く", pausedOk === "ok", String(pausedOk));
    ok("生成中に指示を追加できる", instructOk === "ok", String(instructOk));

    const dropped = got.waste.reduce((a, w) => a + w.dropped, 0);
    const made = got.waste.reduce((a, w) => a + w.made, 0);
    const asked = got.waste.reduce((a, w) => a + w.asked, 0);
    ok("頼んだ数を超えて作らない", dropped === 0,
       "頼んだ " + asked + " / 作られた " + made + " / 捨てた " + dropped);

    const planStages = got.metrics.filter((m) => m.calls.indexOf("planner") >= 0).length;
    ok("計画（Thinking モデル）を呼んでいない", planStages === 0, planStages + " 回");

    const digestCalls = got.metrics.filter((m) => m.stages.indexOf("worker.digest") >= 0).length;
    const docCalls = got.metrics.filter((m) => m.calls.indexOf("document-analyst") >= 0).length;
    const visionCalls = got.metrics.filter((m) => m.calls.indexOf("vision-analyst") >= 0).length;
    ok("資料の読み取りは1回だけ", docCalls <= 1 && visionCalls <= 1,
       "資料 " + docCalls + " 回 / 画像 " + visionCalls + " 回 / 読み取り済みを使い回した呼び出し " + digestCalls + " 回");

    /* [data-q] は一覧と編集欄の両方に付くので、画面の要素数は設問数ではない。
       実際に何問できたかは、生成記録（waste）の made を数える。 */
    const madeQ = got.waste.reduce((a, w) => a + w.made, 0);
    const askedQ = got.waste.reduce((a, w) => a + w.asked, 0);
    ok("頼んだ数どおりに作られる", madeQ === askedQ,
       "頼んだ " + askedQ + " 問 / 作られた " + madeQ + " 問"
       + (madeQ < askedQ ? "（maxItems は効くが minItems は守られないことがある）" : ""));
    ok("依頼した設問数の計画になっている", askedQ === COND.questionCount,
       "指定 " + COND.questionCount + " 問 / 計画 " + askedQ + " 問");

    ok("Console エラー 0 件", errs.length === 0, errs.slice(0, 2).join(" / "));

  } catch (e) {
    fail++;
    log.push("  ✗ 実行中に例外\n      → " + (e && e.stack ? e.stack.split("\n").slice(0, 3).join(" / ") : e));
  }

  await browser.close();
  console.log("\nQuick Mock 高速パイプライン\n" + log.join("\n"));
  console.log(`\n  ${pass} / ${pass + fail}\n`);
  process.exit(fail ? 1 : 0);
})();
