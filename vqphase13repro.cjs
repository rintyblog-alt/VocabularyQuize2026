/* Phase 13 再現テスト（実 AI・1 回だけ）

   2026-07-27 21:29〜21:33 に破綻したのと同じ条件で回し、合格条件を機械で確かめる。

     入力: スラスラEnglish 2ページ / 日本史探究 17ページ / 資料限定 ON
     指示: 「スラスラはいらないから、この日本史の中から問題を作成してください。
            正誤問題が全体の8割になるようにしてね」
     設定: 5大問 / 20問 / 80点

   実行: node vqphase13repro.cjs
   出力: exports/phase13-repro.json
*/
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "exports", "phase13-repro.json");
const FIX = path.join(__dirname, "artifacts", "quick-mock-phase13");
const URL = "http://127.0.0.1:8791/?vqdev=1";
const HIDE = `#vqbFlow,#mob-tut-overlay,#mobBarTutorial,#firstLaunchOverlay,#vqOnboardingOverlay{display:none !important;}`;

const FILES = [
  path.join(FIX, "スラスラEnglish.pdf"),
  path.join(FIX, "日本史探究 1学期期末考査資料.pdf")
];
const INSTRUCTION = "スラスラはいらないから、この日本史の中から問題を作成してください。正誤問題が全体の8割になるようにしてね";
const COND = {
  title: "1学期期末考査", subject: "日本史探究", grade: "H3",
  durationMinutes: 50, totalPoints: 80, sectionCount: 5, questionCount: 20,
  instruction: INSTRUCTION
};

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
    setV(document.getElementById("authLoginNickname"), "p13");
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

(async () => {
  const t00 = Date.now();
  const browser = await chromium.launch({ args: ["--disable-dev-shm-usage"] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const pg = await ctx.newPage();

  /* Console error は **URL まで**残す。
     「Failed to load resource」だけでは何の失敗か分からず、分類もできない。
     全件を出したうえで、Quick Mock 由来かどうかを URL で分ける。 */
  const consoleErrors = [];
  pg.on("console", (m) => {
    if (m.type() !== "error") return;
    let url = "";
    try { url = (m.location() && m.location().url) || ""; } catch (e) {}
    consoleErrors.push({ text: String(m.text()).slice(0, 160), url: url.slice(0, 200) });
  });
  pg.on("pageerror", (e) => consoleErrors.push({ text: "pageerror: " + String(e.message).slice(0, 160), url: "" }));
  pg.on("requestfailed", (r) => {
    consoleErrors.push({ text: "requestfailed: " + ((r.failure() || {}).errorText || ""), url: r.url().slice(0, 200) });
  });

  const step = (s) => console.log("   … " + s);
  console.log("── Phase 13 再現テスト ──");
  await login(pg);

  /* 送ったものを記録する（製品コードは触らない。ここで包むだけ） */
  await pg.evaluate(() => {
    window.__vqSent = [];
    window.__vqMetrics = [];
    window.__vqMockWaste = [];
    const AI = window.VQ2.ai, orig = AI.generateMock;
    AI.generateMock = function (o) {
      const rec = {
        at: Date.now(),
        count: o.count,
        sectionCount: o.sectionCount,
        questionTypes: (o.questionTypes || []).slice(),
        includedAttachmentIds: (o.includedAttachmentIds || []).slice(),
        retrievalQuery: String(o.retrievalQuery || ""),
        requireEvidence: !!o.requireEvidence,
        sourceOnly: !!o.sourceOnly,
        sentAttachmentNames: (o.attachments || []).map((a) => a.name),
        instructionChars: String(o.instruction || "").length
      };
      window.__vqSent.push(rec);
      return orig.call(AI, o).then((res) => {
        rec.qualityGate = res && res.qualityGate;
        rec.evidenceAudit = res && res.evidenceAudit;
        rec.sourcePlan = res && res.sourcePlan;
        const m = (res && res.metrics) || {};
        rec.regenMetric = m.regenMetric || null;
        rec.verifyDetail = m.verifyDetail || null;
        rec.idRepair = m.idRepair || null;
        rec.structureMetric = m.structureMetric || null;
        return res;
      }, (e) => { rec.error = e && (e.code || e.message); throw e; });
    };
  });

  step("Quick Mock を開く");
  await pg.evaluate(() => window.VQ2.quickMock.open({}));
  await pg.waitForFunction(() => {
    const h = document.querySelector(".vq2-host");
    return !!(h && h.shadowRoot && h.shadowRoot.querySelector('[data-act="attach"]'));
  }, null, { timeout: 120000 });
  await pg.waitForTimeout(800);

  step("資料を 2 件添付（PDF）");
  pg.once("filechooser", async (fc) => { await fc.setFiles(FILES); });
  await pg.evaluate(() => {
    const r = document.querySelector(".vq2-host").shadowRoot;
    const b = r.querySelector('[data-act="attach"]');
    if (b) b.click();
  });
  await pg.waitForFunction(() => {
    const h = document.querySelector(".vq2-host");
    return h && h.shadowRoot.querySelectorAll(".vq2-attach-i").length >= 2;
  }, null, { timeout: 300000 });
  await pg.waitForTimeout(1200);

  const attachInfo = await pg.evaluate(() => {
    const q = window.VQ2.quickMock;
    const st = window.__vqQMState;
    return null;
  }).catch(() => null);

  /* 詳細設定を開いてから条件を入れる（閉じていると DOM に無く、黙って既定値になる） */
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

  const applied = await pg.evaluate((keys) => {
    const r = document.querySelector(".vq2-host").shadowRoot;
    const out = {};
    keys.forEach((k) => { const el = r.querySelector(`[data-key="${k}"]`); out[k] = el ? el.value : null; });
    return out;
  }, Object.keys(COND));
  const missed = Object.keys(COND).filter((k) => String(applied[k]) !== String(COND[k]));
  if (missed.length) throw new Error("条件を入れられませんでした: " + JSON.stringify(missed));
  step(`条件: ${applied.sectionCount} 大問 / ${applied.questionCount} 問 / ${applied.totalPoints} 点`);

  /* 資料限定 ON を確かめる */
  const srcOnly = await pg.evaluate(() => {
    const r = document.querySelector(".vq2-host").shadowRoot;
    const el = r.querySelector('[data-key="sourceOnly"]');
    return el ? !!el.checked : null;
  });
  step("資料限定: " + (srcOnly ? "ON" : "OFF"));

  const t0 = Date.now();
  step("構成案を作らせる");
  const tBp = Date.now();
  await pg.evaluate(() => {
    const r = document.querySelector(".vq2-host").shadowRoot;
    const b = r.querySelector('[data-act="blueprint"]');
    if (b) b.click();
  });
  await pg.waitForFunction(() => {
    const h = document.querySelector(".vq2-host");
    return !!(h && h.shadowRoot.querySelector('[data-act="generate"], [data-act="generate-direct"]'));
  }, null, { timeout: 900000 });
  const blueprintMs = Date.now() - tBp;
  console.log(`   構成案: ${(blueprintMs / 1000).toFixed(1)}s`);

  step("試験を作らせる");
  const tGen = Date.now();
  await pg.evaluate(() => {
    const r = document.querySelector(".vq2-host").shadowRoot;
    const b = r.querySelector('[data-act="generate"]') || r.querySelector('[data-act="generate-direct"]');
    if (b) b.click();
  });
  await pg.waitForTimeout(2500);
  await pg.waitForFunction(() => {
    const h = document.querySelector(".vq2-host");
    if (!h || !h.shadowRoot) return false;
    const sr = h.shadowRoot;
    if (sr.querySelector(".vq2-genbar")) return false;
    return !!sr.querySelector("[data-q]")
      && !!sr.querySelector('[data-act="artifacts"], [data-act="repair"], [data-act="back-setup"]');
  }, null, { timeout: 2400000, polling: 2000 }).catch(async (e) => {
    const d = await pg.evaluate(() => {
      const sr = document.querySelector(".vq2-host").shadowRoot;
      return {
        genbar: (sr.querySelector(".vq2-genbar-t") || {}).textContent || null,
        questions: sr.querySelectorAll("[data-q]").length,
        logs: Array.from(sr.querySelectorAll(".vq2-chat li, .vq2-chat [class*=log]"))
          .slice(-8).map((x) => (x.textContent || "").trim().slice(0, 100))
      };
    }).catch(() => null);
    console.log("   ! 完成を待てませんでした: " + JSON.stringify(d, null, 1));
    throw e;
  });
  const generateMs = Date.now() - tGen;
  const totalMs = Date.now() - t0;
  console.log(`   生成: ${(generateMs / 1000).toFixed(1)}s ／ 合計 ${(totalMs / 1000).toFixed(1)}s`);

  /* できあがりを読む */
  const got = await pg.evaluate(() => {
    const sr = document.querySelector(".vq2-host").shadowRoot;
    const S = window.VQ2.store;
    /* 画面の状態は取れないので、保存前の spec を DOM ではなく VQ2 側から探す */
    const w = window;
    return {
      sent: w.__vqSent || [],
      waste: w.__vqMockWaste || [],
      /* 選択中の設問は詳細側にも [data-q] が出るので、**id で重複を除く**。
         ノード数で数えると 20 問を 26 と読んでしまう（1 回目でそうなった）。 */
      questionsOnScreen: new Set(Array.from(sr.querySelectorAll("[data-q]"))
        .map((el) => el.getAttribute("data-q"))).size,
      logs: Array.from(sr.querySelectorAll(".vq2-chat li, .vq2-chat [class*=log]"))
        .map((x) => (x.textContent || "").trim()).filter(Boolean).slice(-60),
      structureText: (() => {
        const el = sr.querySelector(".vq2-structure, .vq2-alert");
        return el ? (el.textContent || "").trim().slice(0, 400) : null;
      })()
    };
  });

  /* spec を取り出す（保存はしない。読むだけ） */
  const spec = await pg.evaluate(() => {
    /* quick-mock は open() のクロージャの中に st を持つ。
       画面から確実に取れるのは「保存」を押した後だが、保存はしない。
       代わりに、描画に使われている DOM から設問の骨格を読む。 */
    const sr = document.querySelector(".vq2-host").shadowRoot;
    const secs = Array.from(sr.querySelectorAll("[data-sec]"));
    const qs = Array.from(sr.querySelectorAll("[data-q]")).map((el) => ({
      id: el.getAttribute("data-q"),
      text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 260)
    }));
    return { sectionNodes: secs.length, questions: qs };
  });

  const res = {
    label: "phase13-repro",
    at: new Date(t00).toISOString(),
    condition: Object.assign({}, COND, { sourceOnly: srcOnly, files: FILES.map((f) => path.basename(f)) }),
    blueprintMs, generateMs, totalMs,
    sent: got.sent,
    waste: got.waste,
    questionsOnScreen: got.questionsOnScreen,
    dom: spec,
    logs: got.logs,
    structureText: got.structureText,
    consoleErrors
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(res, null, 1), "utf8");
  await pg.screenshot({ path: path.join(FIX, "repro-review.png"), fullPage: false }).catch(() => {});
  await browser.close();

  /* ── 合否 ── */
  console.log("\n══ 合格条件 ══");
  const checks = [];
  const chk = (name, cond, detail) => { checks.push({ name, ok: !!cond, detail: detail || "" });
    console.log(`  ${cond ? "✓" : "×"} ${name}${detail ? " — " + detail : ""}`); };

  const sent = got.sent;
  const allIncluded = sent.flatMap((s) => s.includedAttachmentIds);
  const sentNames = [...new Set(sent.flatMap((s) => s.sentAttachmentNames))];
  chk("スラスラEnglish が除外される", !sentNames.some((n) => /スラスラ|English/i.test(n)), sentNames.join(" / "));
  chk("日本史だけが included", sentNames.length === 1 && /日本史/.test(sentNames[0] || ""), sentNames.join(" / "));
  chk("検索クエリに除外ファイル名が入らない",
    sent.every((s) => !/スラスラ|english/i.test(s.retrievalQuery)),
    (sent[0] || {}).retrievalQuery);
  chk("検索クエリに試験メタ語彙が入らない",
    sent.every((s) => !/満点|JSON|選択肢|ちょうど/i.test(s.retrievalQuery)));

  const types = sent.flatMap((s) => s.questionTypes);
  const tf = types.filter((t) => t === "true_false").length;
  chk("true_false が 16 問", tf === 16, `実際 ${tf} 問 / 全 ${types.length}`);
  chk("その他形式が 4 問", types.length - tf === 4, `実際 ${types.length - tf} 問`);
  chk("最終 5 大問", sent.length === 5, `依頼 ${sent.length} 回`);
  chk("最終 20 問", got.questionsOnScreen === 20, `画面 ${got.questionsOnScreen} 問`);
  chk("0 問の大問なし", sent.every((s) => !s.error), sent.filter((s) => s.error).map((s) => s.error).join(","));

  const gates = sent.map((s) => s.qualityGate).filter(Boolean);
  const trunc = gates.filter((g) => g.truncated && !g.recoveredAfterTruncation).length;
  chk("length 終了 0、または 1 回の回復後に全大問成功", trunc === 0, `未回復 ${trunc}`);
  const meta = gates.reduce((a, g) => a + (g.documentMetaQuestions || 0), 0);
  chk("メタ問題 0", meta === 0, `${meta} 件`);
  const high = gates.reduce((a, g) => a + (g.unresolvedHigh || 0), 0);
  chk("未解決 high Issue 0", high === 0, `${high} 件 / ${[...new Set(gates.flatMap((g) => g.unresolvedHighCodes || []))].join(",")}`);
  chk("Evidence verifier が実行されている（skipped でない）",
    gates.every((g) => g.evidenceState === "passed" || g.evidenceState === "revised"),
    gates.map((g) => g.evidenceState).join(","));
  const dropped = (got.waste || []).reduce((a, w) => a + w.dropped, 0);
  chk("過剰生成 0 / 破棄 0", dropped === 0, `${dropped} 問`);

  /* ── Phase 14 で追加した合格条件 ── */
  const codes = [...new Set(gates.flatMap((g) => g.unresolvedHighCodes || []))];
  chk("duplicate_id 0", !codes.includes("duplicate_id"), codes.join(","));
  chk("未解決 duplicate_question 0", !codes.includes("duplicate_question"), codes.join(","));
  chk("unsupported_claim 0", !codes.includes("unsupported_claim"), codes.join(","));
  const detail = sent.flatMap((s) => s.verifyDetail || []);
  /* Phase 13 の誤判定＝「正解が誤りの設問を、命題が資料と食い違うという理由で落とす」。
     いまはこの形が構造として起きない（verdictForQuestion）。
     statement_contradicted は **正解が「正しい」**のときにしか出ないので、
     それは設問の中身が本当に誤っているという意味であり、誤判定ではない。 */
  const tfWrong = detail.filter((d) => d.type === "true_false"
    && /refuted_and_explained_but_failed|false_answer_misjudged/.test(String(d.reason || "")));
  chk("正誤 Verifier の誤判定 0", tfWrong.length === 0,
    tfWrong.map((d) => d.questionId + ":" + d.reason).join("・"));
  const tfOkFalse = detail.filter((d) => d.reason === "refuted_and_explained").length;
  console.log(`     （参考）正解が「誤り」で正しく passed になった正誤問題: ${tfOkFalse} 問`);
  const notPassed = detail.filter((d) => d.state !== "passed");
  chk("Evidence verifier 全問題で最終 passed", notPassed.length === 0,
    `${detail.length - notPassed.length}/${detail.length} passed / ` +
    notPassed.map((d) => d.questionId + ":" + d.reason).join("・"));
  /* 「残っている」orphan を見る。totals.answerOrphan は **落とした件数**で、
     設問側の解答から組み直しているので残りは常に 0。
     設問ごとの answerOrphan フラグと「解答なし」の件数で確かめる。 */
  const perQ = sent.flatMap((s) => ((s.structureMetric || {}).questions) || []);
  const orphanLeft = perQ.filter((q) => q.answerOrphan).length;
  const missingAns = sent.reduce((a, s) => a + (((s.structureMetric || {}).totals || {}).missingAnswer || 0), 0);
  const dropped2 = sent.reduce((a, s) => a + (((s.structureMetric || {}).totals || {}).answerOrphan || 0), 0);
  chk("remaining answer_orphan 0", orphanLeft === 0 && missingAns === 0,
    `残り ${orphanLeft} 件 / 解答なし ${missingAns} 件（生成時に落とした迷子 ${dropped2} 件は解決済み）`);
  res.regen = sent.map((s) => s.regenMetric).filter(Boolean);
  res.idRepair = sent.map((s) => s.idRepair).filter(Boolean);
  res.verifyDetail = detail;
  /* 既知の外部要因（ローカルにクラウド AI が無い / Sede の公開一覧が無い / favicon）を
     URL で分ける。分類できないものは **すべて Quick Mock 由来として数える**。 */
  /* Quick Mock と無関係な既知の失敗：
       /api/ai/chat 503  … ローカルにクラウド AI が無い
       /api/auth/login 401 … ハーネスのテスト用アカウント（ローカル認証へ落ちる）
       firestore        … 外部ネットワーク。Bridge も Quick Mock も使わない
       sede/public-projects, favicon … 別機能
       127.0.0.1:1789x/health … Bridge のポート探索（1 本だけ動かしていれば残りは必ず失敗する） */
  const KNOWN = /\/api\/ai\/chat|\/api\/auth\/login|firestore\.googleapis\.com|sede\/public-projects|favicon|\/api\/feed|\/api\/me\b|127\.0\.0\.1:1789\d\/health/;
  const qmErrors = consoleErrors.filter((e) => !KNOWN.test(e.url || ""));
  res.consoleErrorBreakdown = {
    total: consoleErrors.length,
    known: consoleErrors.length - qmErrors.length,
    unclassified: qmErrors.map((e) => e.url || e.text)
  };
  chk("Quick Mock 由来の新規 Console error 0", qmErrors.length === 0,
    `全 ${consoleErrors.length} 件 / 既知 ${consoleErrors.length - qmErrors.length} 件 / 未分類 ${qmErrors.length} 件`);

  res.checks = checks;
  res.verdict = checks.every((c) => c.ok) ? "PASS" : "FAIL";
  fs.writeFileSync(OUT, JSON.stringify(res, null, 1), "utf8");
  console.log(`\n判定: ${res.verdict}   → ${OUT}`);
  process.exit(res.verdict === "PASS" ? 0 : 1);
})().catch((e) => { console.error("失敗:", e && e.message); process.exit(2); });
