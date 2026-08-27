/* Quick Mock の速度を実測する。

   総時間だけでは何も直せない。工程ごとに
     所要時間 / 入力Token / 出力Token / 再処理回数 / 作りすぎて捨てた問題数
   を出す。最適化の前後で同じものを取り、同じ形で比べる。

   実行:
     node vqmockperf.cjs before          … 1回だけ測って exports/mockperf-before.json へ
     node vqmockperf.cjs after           … 同上（after）
     node vqmockperf.cjs before 3        … 3回まわして p50 / p95 まで出す
     node vqmockperf.cjs compare         … before と after を並べる
*/
const { chromium } = require("playwright");
const fs = require("fs");
const os = require("os");
const path = require("path");

const LABEL = process.argv[2] || "before";
const RUNS = Math.max(1, parseInt(process.argv[3] || "1", 10));
const OUT = path.join(__dirname, "exports", "mockperf-" + LABEL + ".json");
const URL = "http://127.0.0.1:8791/?vqdev=1";
const HIDE = `#vqbFlow,#mob-tut-overlay,#mobBarTutorial,#firstLaunchOverlay,#vqOnboardingOverlay{display:none !important;}`;

/* 測定条件は固定する。条件が動くと前後比較が意味を失う。 */
const COND = {
  title: "1学期期末考査", subject: "日本史探究", grade: "H3",
  durationMinutes: 50, totalPoints: 100, sectionCount: 3, questionCount: 9,
  instruction: "添付した資料の範囲から、記述も入れて作ってください。"
};

const SAMPLE = path.join(os.tmpdir(), "vqmockperf-source.txt");
fs.writeFileSync(SAMPLE, [
  "【ヴェルナ地方史 要点】",
  "812年 ドルヴァス朝が成立。初代王アスカル1世が都をリューンに置いた。",
  "839年 ザルカンド条約により、隣国トレーシャとの国境が現在の位置に定まった。",
  "840年 王都リューンで大市が開かれ、香辛料と羊毛の交易が本格化した。",
  "873年 アスカル3世が「三部会」を招集し、貴族・聖職者・都市代表が政策を協議した。",
  "901年 ドルヴァス朝は分裂し、東西二つの王国に分かれた。",
  "経済: 羊毛は西部の高地で生産され、リューンを経由して輸出された。",
  "文化: 三部会の記録は羊皮紙に残され、のちの法典編纂の基礎となった。",
  "社会: 都市代表の参加は、商人層の政治的発言力が高まったことを示している。"
].join("\n"), "utf8");

function pct(arr, p) {
  if (!arr.length) return null;
  const a = arr.slice().sort((x, y) => x - y);
  const i = Math.min(a.length - 1, Math.max(0, Math.ceil((p / 100) * a.length) - 1));
  return a[i];
}
const sum = (a) => a.reduce((x, y) => x + y, 0);

async function login(pg) {
  await pg.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.addStyleTag({ content: HIDE });
  await pg.waitForFunction(() => document.getElementById("authLoginSubmitBtn"), { timeout: 30000 });
  await pg.evaluate(() => {
    const setV = (el, v) => {
      const p = el.tagName === "SELECT" ? HTMLSelectElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(p.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    setV(document.getElementById("authLoginGrade"), "H3");
    setV(document.getElementById("authLoginNickname"), "perf");
    setV(document.getElementById("authLoginPassword"), "Abcd1234");
    document.getElementById("authLoginSubmitBtn").click();
  });
  await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 60000 });
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

async function oneRun(pg, i) {
  console.log(`\n── ${LABEL} run ${i + 1}/${RUNS} ──`);
  const step = (s) => console.log("   … " + s);
  await pg.evaluate((legacy) => {
    window.__vqMetrics = [];
    window.__vqMockWaste = [];
    /* 何を送っているのかを測る（製品コードは触らず、ここで包むだけ）。
       本文は残さない。長さと値だけ。 */
    window.__vqSent = [];
    /* Phase 11: 形式配分をコード側で確定させる（モデルに選ばせない）。 */
    window.__vqMockTypeMix = { multiple_choice: 3, true_false: 2, short_answer: 2, descriptive: 2 };
    try {
      const AI = window.VQ2.ai, orig = AI.generateMock;
      AI.generateMock = function (o) {
        const rec = {
          at: Date.now(),
          instructionChars: String(o.instruction || "").length,
          count: o.count, sectionCount: o.sectionCount,
          skipDocumentAnalysis: !!o.skipDocumentAnalysis,
          sourceOnly: !!o.sourceOnly,
          evidenceChars: (o.attachments || []).reduce(
            (a, x) => a + String(x.extractedText || x.text || "").length, 0),
          /* 指示文の内訳。見出しで切って長さだけ数える。 */
          blueprintChars: (String(o.instruction || "").split("【承認された構成案（全体）】")[1] || "")
            .split("すでに次の設問を作ってあります")[0].length,
          madeListChars: (String(o.instruction || "").split("すでに次の設問を作ってあります")[1] || "").length,
          hasCountInPrompt: /設問は \d+ 問/.test(String(o.instruction || "")),
          titleInPrompt: (String(o.instruction || "").match(/大問\d+「([^」]{0,40})」/) || [])[1] || "",
          activities: null
        };
        window.__vqSent.push(rec);
        const wrapAct = o.onActivity;
        o.onActivity = function (items, one) {
          try {
            rec.activities = (items || []).map((a) => ({
              type: a.type, status: a.status, detail: String(a.detail || "").slice(0, 200)
            }));
          } catch (e) {}
          if (wrapAct) wrapAct(items, one);
        };
        return orig.call(AI, o);
      };
    } catch (e) {}
    /* before はクライアント側も最適化前の決め方に戻す
       （構成案まかせの大問数・設問数・配点／大問は 1 本ずつ直列）。
       Bridge 側は VQ_FAST_MOCK=0 で起動しておくこと。 */
    window.__vqMockLegacy = legacy;
  }, LABEL === "before");
  step("Quick Mock を開く");
  await pg.evaluate(() => window.VQ2.quickMock.open({}));
  await pg.waitForFunction(() => {
    const h = document.querySelector(".vq2-host");
    return !!(h && h.shadowRoot && h.shadowRoot.querySelector('[data-act="attach"]'));
  }, null, { timeout: 120000 });
  await pg.waitForTimeout(800);

  /* 資料を1件添付する（実際の使われ方に合わせる） */
  step("資料を添付");
  pg.once("filechooser", async (fc) => { await fc.setFiles(SAMPLE); });
  await pg.evaluate(() => {
    const r = document.querySelector(".vq2-host").shadowRoot;
    const b = r.querySelector('[data-act="attach"]');
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
  /* 条件を入れる */
  await pg.evaluate((c) => {
    const r = document.querySelector(".vq2-host").shadowRoot;
    const set = (key, val) => {
      const el = r.querySelector(`[data-key="${key}"]`);
      if (!el) return false;
      const P = el.tagName === "SELECT" ? HTMLSelectElement
        : el.tagName === "TEXTAREA" ? HTMLTextAreaElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(P.prototype, "value").set.call(el, String(val));
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    };
    Object.keys(c).forEach((k) => set(k, c[k]));
  }, COND);
  await pg.waitForTimeout(600);

  /* 入ったことを確かめる。入っていない条件で測っても比較にならない。 */
  const applied = await pg.evaluate((keys) => {
    const r = document.querySelector(".vq2-host").shadowRoot;
    const out = {};
    keys.forEach((k) => {
      const el = r.querySelector(`[data-key="${k}"]`);
      out[k] = el ? el.value : null;
    });
    return out;
  }, Object.keys(COND));
  const missed = Object.keys(COND).filter((k) => String(applied[k]) !== String(COND[k]));
  if (missed.length) {
    throw new Error("条件を入れられませんでした: "
      + missed.map((k) => k + "（指定 " + COND[k] + " / 実際 " + applied[k] + "）").join(" / "));
  }
  step("条件を確認: 大問 " + applied.sectionCount + " / 設問 " + applied.questionCount
    + " / " + applied.totalPoints + "点");

  const t0 = Date.now();

  /* 構成案 → 生成。実際の導線と同じ順で押す。 */
  step("構成案を作らせる");
  const tBp0 = Date.now();
  await pg.evaluate(() => {
    const r = document.querySelector(".vq2-host").shadowRoot;
    const b = r.querySelector('[data-act="blueprint"]');
    if (b) b.click();
  });
  await pg.waitForFunction(() => {
    const h = document.querySelector(".vq2-host");
    if (!h) return false;
    const r = h.shadowRoot;
    return !!r.querySelector('[data-act="generate"], [data-act="generate-direct"]');
  }, null, { timeout: 900000 });
  const blueprintMs = Date.now() - tBp0;
  console.log(`   構成案: ${(blueprintMs / 1000).toFixed(1)}s`);

  step("試験を作らせる");
  const tGen0 = Date.now();
  await pg.evaluate(() => {
    const r = document.querySelector(".vq2-host").shadowRoot;
    const b = r.querySelector('[data-act="generate"]') || r.querySelector('[data-act="generate-direct"]');
    if (b) b.click();
  });
  await pg.waitForTimeout(2500);        /* 生成が始まるのを待ってから完成判定に入る */
  /* 完成の判定。
     高速版は「できた大問からその場で出す」ので、[data-q] が出ただけでは終わっていない。
     生成中の操作バー（.vq2-genbar）が消えて、かつ設問が出ている状態を完成とする。
     最適化前にはこのバーが無いので、その場合は設問の出現で判定する。 */
  await pg.waitForFunction(() => {
    const h = document.querySelector(".vq2-host");
    if (!h || !h.shadowRoot) return false;
    const sr = h.shadowRoot;
    if (sr.querySelector(".vq2-genbar")) return false;          /* まだ作っている */
    return !!sr.querySelector("[data-q]")
      && !!sr.querySelector('[data-act="artifacts"], [data-act="repair"], [data-act="back-setup"]');
  }, null, { timeout: 1800000, polling: 2000 }).catch(async (e) => {
    /* 待ちきれなかったときは、何で止まっているのかを出す。
       「タイムアウトしました」だけでは次に何を直せばいいか分からない。 */
    const d = await pg.evaluate(() => {
      const h = document.querySelector(".vq2-host");
      if (!h || !h.shadowRoot) return { host: false };
      const sr = h.shadowRoot;
      return {
        host: true,
        genbar: (sr.querySelector(".vq2-genbar-t") || {}).textContent || null,
        questions: sr.querySelectorAll("[data-q]").length,
        actions: ["artifacts", "repair", "back-setup", "generate"]
          .filter((a) => !!sr.querySelector('[data-act="' + a + '"]')),
        running: (window.VQ2 && window.VQ2.ai && window.VQ2.ai.runningCount)
          ? window.VQ2.ai.runningCount() : null,
        lastLogs: Array.from(sr.querySelectorAll(".vq2-chat [class*=log], .vq2-chat li"))
          .slice(-6).map((x) => (x.textContent || "").trim().slice(0, 80))
      };
    }).catch(() => null);
    console.log("   ! 完成を待てませんでした: " + JSON.stringify(d, null, 1));
    throw e;
  });
  const generateMs = Date.now() - tGen0;
  const totalMs = Date.now() - t0;
  console.log(`   生成: ${(generateMs / 1000).toFixed(1)}s ／ 合計 ${(totalMs / 1000).toFixed(1)}s`);

  const got = await pg.evaluate(() => {
    const r = document.querySelector(".vq2-host").shadowRoot;
    const txt = (r.textContent || "").replace(/\s+/g, " ");
    const m = txt.match(/(\d{1,4})\s*点/);
    return {
      metrics: window.__vqMetrics || [],
      waste: window.__vqMockWaste || [],
      sent: window.__vqSent || [],
      questionsOnScreen: r.querySelectorAll("[data-q]").length,
      pointsSeen: m ? Number(m[1]) : null
    };
  });

  return Object.assign({ blueprintMs, generateMs, totalMs }, got);
}

function summarize(runs) {
  const allCalls = [];
  const byStage = {};
  let promptTokens = 0, completionTokens = 0, modelCalls = 0, retries = [];
  let asked = 0, made = 0, dropped = 0;

  for (const r of runs) {
    for (const m of r.metrics) {
      promptTokens += m.promptTokens || 0;
      completionTokens += m.completionTokens || 0;
      modelCalls += m.modelCalls || 0;
      retries = retries.concat(m.retries || []);
      for (const s of m.stages || []) {
        (byStage[s.stage] = byStage[s.stage] || []).push(s.ms);
      }
      for (const c of m.calls || []) allCalls.push(c);
    }
    for (const w of r.waste) { asked += w.asked; made += w.made; dropped += w.dropped; }
  }

  const totals = runs.map((r) => r.totalMs);
  const gens = runs.map((r) => r.generateMs);
  const bps = runs.map((r) => r.blueprintMs);

  const retryCount = {};
  retries.forEach((t) => { retryCount[t] = (retryCount[t] || 0) + 1; });

  const stages = Object.keys(byStage).map((k) => ({
    stage: k, n: byStage[k].length,
    totalMs: sum(byStage[k]), p50: pct(byStage[k], 50), p95: pct(byStage[k], 95)
  })).sort((a, b) => b.totalMs - a.totalMs);

  const roles = {};
  allCalls.forEach((c) => {
    const k = c.role + "/" + c.model;
    roles[k] = roles[k] || { role: k, n: 0, ms: 0, out: 0 };
    roles[k].n++; roles[k].ms += c.ms || 0; roles[k].out += c.out || 0;
  });

  return {
    label: LABEL, runs: runs.length, condition: COND,
    total: { p50: pct(totals, 50), p95: pct(totals, 95), all: totals },
    blueprint: { p50: pct(bps, 50), p95: pct(bps, 95) },
    generate: { p50: pct(gens, 50), p95: pct(gens, 95) },
    tokens: { prompt: promptTokens, completion: completionTokens, modelCalls },
    retries: retryCount, retryTotal: retries.length,
    waste: { asked, made, dropped, wastePct: made ? +(100 * dropped / made).toFixed(1) : 0 },
    stages,
    roles: Object.values(roles).sort((a, b) => b.ms - a.ms),
    questionsOnScreen: runs.map((r) => r.questionsOnScreen),
    /* 何大問ぶん実際に生成が走ったか。ここが指定より少なければ、
       速くなったのではなく「作れていない」。必ず並べて出す。 */
    sectionsMade: runs.reduce((a, r) => a + r.waste.length, 0)
  };
}

function show(s) {
  const sec = (ms) => ms == null ? "—" : (ms / 1000).toFixed(1) + "s";
  console.log(`\n═══ ${s.label}（${s.runs} 回）═══`);
  console.log(`\n合計       p50 ${sec(s.total.p50)} / p95 ${sec(s.total.p95)}`);
  console.log(`  構成案   p50 ${sec(s.blueprint.p50)} / p95 ${sec(s.blueprint.p95)}`);
  console.log(`  生成     p50 ${sec(s.generate.p50)} / p95 ${sec(s.generate.p95)}`);
  console.log(`\nToken     入力 ${s.tokens.prompt} / 出力 ${s.tokens.completion} / モデル呼び出し ${s.tokens.modelCalls} 回`);
  console.log(`再処理     ${s.retryTotal} 回  ${JSON.stringify(s.retries)}`);
  console.log(`作りすぎ   頼んだ ${s.waste.asked} 問 → 作られた ${s.waste.made} 問 → 捨てた ${s.waste.dropped} 問（${s.waste.wastePct}%）`);
  console.log(`できた     大問 ${s.sectionsMade == null ? "—" : s.sectionsMade} / 画面の設問 ${(s.questionsOnScreen || []).join(",")} 問（指定 ${s.condition.sectionCount} 大問 / ${s.condition.questionCount} 問）`);
  console.log(`\n工程ごと（合計時間の多い順）`);
  console.log("  " + "工程".padEnd(26) + "回数  合計      p50      p95");
  s.stages.slice(0, 16).forEach((x) => {
    console.log("  " + x.stage.padEnd(26)
      + String(x.n).padStart(3) + "  " + sec(x.totalMs).padStart(8)
      + " " + sec(x.p50).padStart(8) + " " + sec(x.p95).padStart(8));
  });
  console.log(`\nRole ごと（モデル実行時間）`);
  s.roles.slice(0, 12).forEach((x) => {
    console.log("  " + x.role.padEnd(30) + String(x.n).padStart(3) + " 回  "
      + sec(x.ms).padStart(8) + "  出力 " + String(x.out).padStart(6) + " tok");
  });
  console.log("");
}

(async () => {
  if (LABEL === "compare") {
    /* 保存形式は { summary, runs }。summary を取り出す。 */
    const load = (n) => {
      const j = JSON.parse(fs.readFileSync(path.join(__dirname, "exports", "mockperf-" + n + ".json"), "utf8"));
      return j.summary || j;
    };
    const a = load(process.argv[3] || "before");
    const b = load(process.argv[4] || "after");
    show(a); show(b);
    const d = (x, y) => (y && x) ? ((y - x) / x * 100).toFixed(0) + "%" : "—";
    console.log("═══ 差 ═══");
    console.log("  合計 p50   " + (a.total.p50 / 1000).toFixed(1) + "s → " + (b.total.p50 / 1000).toFixed(1) + "s（" + d(a.total.p50, b.total.p50) + "）");
    console.log("  合計 p95   " + (a.total.p95 / 1000).toFixed(1) + "s → " + (b.total.p95 / 1000).toFixed(1) + "s（" + d(a.total.p95, b.total.p95) + "）");
    console.log("  出力Token  " + a.tokens.completion + " → " + b.tokens.completion + "（" + d(a.tokens.completion, b.tokens.completion) + "）");
    console.log("  入力Token  " + a.tokens.prompt + " → " + b.tokens.prompt + "（" + d(a.tokens.prompt, b.tokens.prompt) + "）");
    console.log("  呼び出し   " + a.tokens.modelCalls + " → " + b.tokens.modelCalls + " 回");
    console.log("  再処理     " + a.retryTotal + " → " + b.retryTotal + " 回");
    console.log("  捨てた問題 " + a.waste.dropped + " → " + b.waste.dropped + " 問");
    /* 仕事量が違うと総時間の比較は誤解を生む。
       最適化前は指定（大問3・設問9）を無視して 10 大問 26 問を作りに行っていたので、
       「1 問あたり何秒か」も並べて出す。 */
    const perQ = (x) => {
      const q = x.waste && x.waste.made ? x.waste.made : null;
      return q ? (x.total.p50 / 1000 / q).toFixed(1) + "s/問（作られた " + q + " 問）" : "—";
    };
    console.log("");
    console.log("  仕事量が違う点に注意:");
    console.log("    before  大問 " + (a.sectionsMade == null ? "?" : a.sectionsMade)
      + " ・ 頼んだ " + a.waste.asked + " 問 ・ 作られた " + a.waste.made + " 問 → " + perQ(a));
    console.log("    after   大問 " + (b.sectionsMade == null ? "?" : b.sectionsMade)
      + " ・ 頼んだ " + b.waste.asked + " 問 ・ 作られた " + b.waste.made + " 問 → " + perQ(b));
    console.log("");
    process.exit(0);
  }

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();
  pg.on("pageerror", (e) => console.log("  [pageerror] " + e.message));

  const runs = [];
  try {
    await login(pg);
    for (let i = 0; i < RUNS; i++) runs.push(await oneRun(pg, i));
  } catch (e) {
    console.log("\n実行中に失敗: " + (e && e.message));
  }
  await browser.close();

  if (!runs.length) { console.log("計測できませんでした。"); process.exit(1); }
  const s = summarize(runs);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ summary: s, runs }, null, 1), "utf8");
  show(s);
  console.log("→ " + OUT + "\n");
})();
