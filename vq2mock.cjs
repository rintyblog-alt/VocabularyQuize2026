/* Quick Mock の検証。
   ・AI パネルが Preset Studio と同じ形（会話・作業ログ・入力欄・印と一言）
   ・大問ごとの分割生成（資料が多くても途中で全部失わない）
   ・問題の不備（正解・解説・出典の抜け）を検出し、AI で補い、直らないものは外せる
   ・受験画面に解答欄が無い問題が出ない
   本体は http://127.0.0.1:8791 で動いていることが前提。 */
const { chromium } = require("playwright");

let pass = 0, fail = 0;
const consoleErrors = [];
async function step(name, fn) {
  try { const r = await fn(); pass++; console.log("  ✓ " + name + (r ? " — " + r : "")); }
  catch (e) { fail++; console.log("  ✗ " + name + " — " + e.message); }
}
function assert(c, m) { if (!c) throw new Error(m || "assertion failed"); }
function assertEq(a, b, m) { if (a !== b) throw new Error((m || "値が違う") + `（期待 ${JSON.stringify(b)} / 実際 ${JSON.stringify(a)}）`); }

const HIDE = "#vqNewAuth{display:none !important}";

async function login(pg, url) {
  await pg.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await pg.addStyleTag({ content: HIDE });
  await pg.waitForFunction(() => document.getElementById("authLoginSubmitBtn"), { timeout: 20000 });
  await pg.evaluate(() => {
    const setV = (el, v) => {
      const p = el.tagName === "SELECT" ? HTMLSelectElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(p.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    setV(document.getElementById("authLoginGrade"), "H3");
    setV(document.getElementById("authLoginNickname"), "tester");
    setV(document.getElementById("authLoginPassword"), "Abcd1234");
    document.getElementById("authLoginSubmitBtn").click();
  });
  await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 30000 });
  await pg.addStyleTag({ content: HIDE });
  await pg.waitForTimeout(2000);
  for (let i = 0; i < 3; i++) {
    const c = await pg.evaluate(() => {
      const bd = document.querySelector(".ui-modal-backdrop");
      if (!bd || getComputedStyle(bd).display === "none") return false;
      const b2 = document.getElementById("uiModalOk") || document.getElementById("uiModalCancel");
      if (b2) { b2.click(); return true; } return false;
    });
    if (!c) break;
    await pg.waitForTimeout(300);
  }
}

async function inShadow(pg, hostId, body, arg) {
  return pg.evaluate(({ id, src, a }) => {
    const host = document.getElementById(id);
    if (!host || !host.shadowRoot) return { __no: true };
    const root = host.shadowRoot.querySelector(".vq2-root");
    return new Function("root", "args", src)(root, a);
  }, { id: hostId, src: body, a: arg === undefined ? null : arg });
}
async function waitHost(pg, id) {
  await pg.waitForFunction((i) => {
    const h = document.getElementById(i);
    return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vq2-root"));
  }, id, { timeout: 20000 });
}
async function openMock(pg, opts) {
  await pg.evaluate((o) => {
    document.querySelectorAll(".vq2-host").forEach((h) => h.remove());
    document.body.style.overflow = "";
    window.VQ2.open.quickMock(o || {});
  }, opts || {});
  await waitHost(pg, "vq2-quick-mock");
  await pg.waitForTimeout(300);
}

/* AI が実際に落としてくる形の下書き（不備入り） */
const BROKEN_DRAFT = {
  title: "耐久テスト", subject: "日本史", durationMinutes: 50, totalScore: 100,
  sections: [{
    name: "大問1", score: 100, questions: [
      { id: "1", type: "true_false", question: "大化の改新は645年である。", points: 20, choices: [] },
      { id: "2", type: "multiple_choice", question: "次のうち正しいものはどれか。", points: 20,
        choices: [{ id: "a", text: "A案" }, { id: "b", text: "B案" }, { id: "c", text: "C案" }] },
      { id: "3", type: "multiple_choice", question: "選択肢が 1 つしかない問題", points: 20,
        choices: [{ id: "a", text: "ただ一つ" }] },
      { id: "4", type: "short_answer", question: "正解が抜けている問題", points: 20, choices: [] },
      { id: "5", type: "descriptive", question: "採点基準が抜けている記述問題", points: 20, choices: [] }
    ]
  }],
  answerKey: [{ id: "1", answer: "正しい" }, { id: "3", answer: "ただ一つ" }]
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();
  pg.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
  pg.on("pageerror", (e) => consoleErrors.push("pageerror: " + String(e).slice(0, 200)));

  await login(pg, "http://127.0.0.1:8791/?vqdev=1");

  /* ══════════════════════════════════════════════════════════════
     1. Quick Chat と同じ形の AI パネル
     ══════════════════════════════════════════════════════════════ */
  console.log("\n══ AI パネルの統一 ══");

  await openMock(pg, {});

  await step("Quick Mock にも会話・入力欄・印と一言が出ている", async () => {
    const r = await inShadow(pg, "vq2-quick-mock", `
      const pane = root.querySelector("#qmAi");
      if (!pane) return { ok: false, why: "AI の欄が無い" };
      const mark = pane.querySelector(".vq2-mark");
      const line = pane.querySelector("#aiHeroLine");
      const ta = pane.querySelector('[data-key="instruction"]');
      const att = pane.querySelector('[data-act="attach"]');
      const scroll = pane.querySelector("#aiScroll");
      return { ok: !!(mark && line && ta && att && scroll),
               why: [!mark && "印", !line && "一言", !ta && "入力欄", !att && "添付", !scroll && "会話"].filter(Boolean).join("/"),
               text: line ? line.textContent.trim() : "",
               markW: mark ? Math.round(mark.getBoundingClientRect().width) : 0 };
    `);
    assert(r.ok, "足りない: " + r.why);
    assert(r.markW > 60, "印が小さい: " + r.markW);
    return "印 " + r.markW + "px / 「" + r.text + "」";
  });

  await step("Preset Studio と同じ部品を使っている（作りが 1 つ）", async () => {
    const r = await pg.evaluate(() => ({
      hasClass: typeof window.VQ2.ui.AiChat === "function",
      hasMark: typeof window.VQ2.ui.markSvg === "function"
    }));
    assertEq(r.hasClass, true, "共通の会話部品が無い");
    assertEq(r.hasMark, true, "共通の印が無い");
    return "U.AiChat / U.markSvg を共用";
  });

  await step("資料と指示の欄が 2 か所に重複していない", async () => {
    const n = await inShadow(pg, "vq2-quick-mock",
      `return root.querySelectorAll('[data-key="instruction"]').length;`);
    assertEq(n, 1, "指示の入力欄が " + n + " 個ある");
    return "入力欄は 1 か所";
  });

  /* ══════════════════════════════════════════════════════════════
     2. 不備の検出・補完・除外
     ══════════════════════════════════════════════════════════════ */
  console.log("\n══ 問題の不備 ══");

  await step("不備のある試験を読み込むと、何が足りないかが出る", async () => {
    const r = await pg.evaluate((draft) => {
      const MB = window.VQ2.mockBuilder;
      const spec = MB.fromDraft(draft, { totalPoints: 100 });
      const rep = MB.repairSpec(spec, { requireSources: true });
      return {
        fixed: rep.fixed.map((f) => f.what),
        total: rep.audit.total, blocking: rep.audit.blocking,
        byNeed: rep.audit.byNeed
      };
    }, BROKEN_DRAFT);
    /* 記述の採点基準は fromDraft の時点で付くので、ここで直るのは選択肢まわり */
    assert(r.fixed.length >= 2, "自動で直せたものが少なすぎる: " + JSON.stringify(r.fixed));
    assert(r.byNeed.explanation >= 4, "解説の抜けを見逃した: " + JSON.stringify(r.byNeed));
    assert(r.byNeed.source >= 4, "出典の抜けを見逃した");
    return `自動修復 ${r.fixed.length} 件 / 残り ${r.total} 問（受験できない ${r.blocking} 問）`;
  });

  await step("受験できない問題を外すと、配点が満点へ割り振り直される", async () => {
    const r = await pg.evaluate((draft) => {
      const MB = window.VQ2.mockBuilder;
      const rep = MB.repairSpec(MB.fromDraft(draft, { totalPoints: 100 }), { requireSources: false });
      const ids = rep.audit.items.filter((i) => i.blocking).map((i) => i.questionId);
      const d = MB.dropQuestions(rep.spec, ids);
      const fin = MB.finalize(d.spec);
      const total = fin.spec.sections.reduce((a, s) => a + s.questions.reduce((b, q) => b + q.points, 0), 0);
      return { dropped: d.removed.length, total: total, ok: fin.ok,
               errs: window.VQ2.validate.errorsOf(fin.issues).map((e) => e.code) };
    }, BROKEN_DRAFT);
    assert(r.dropped >= 1, "外れていない");
    assertEq(r.total, 100, "満点に合っていない");
    return r.dropped + " 問を外して合計 " + r.total + " 点";
  });

  await step("不備カードが画面に出て、補う・外すが選べる", async () => {
    await pg.evaluate((draft) => {
      const host = document.getElementById("vq2-quick-mock");
      const MB = window.VQ2.mockBuilder;
      const spec = MB.fromDraft(draft, { totalPoints: 100 });
      const rep = MB.repairSpec(spec, { requireSources: true });
      const fin = MB.finalize(rep.spec);
      /* 画面の状態を作るため、保存済みの試験として開き直す */
      window.VQ2.store.mocks.put({ id: fin.spec.id, kind: "mock", title: fin.spec.title, spec: fin.spec });
      window.__mockId = fin.spec.id;
      host.__vq2.forceClose("test");
    }, BROKEN_DRAFT);
    const id = await pg.evaluate(() => window.__mockId);
    await openMock(pg, { mockId: id });
    await inShadow(pg, "vq2-quick-mock",
      `const b = root.querySelector('[data-act="reaudit"]'); if (b) b.click(); return true;`);
    await pg.waitForTimeout(400);
    const r = await inShadow(pg, "vq2-quick-mock", `
      const chip = [...root.querySelectorAll(".vq2-chip")].map((c) => c.textContent.trim());
      return {
        repair: !!root.querySelector('[data-act="repair"]'),
        drop: !!root.querySelector('[data-act="drop-blocking"]'),
        rows: root.querySelectorAll('.vq2-diff [data-q]').length,
        chips: chip.filter((c) => /問$/.test(c))
      };`);
    assertEq(r.repair, true, "「AI に補ってもらう」が無い");
    assert(r.rows >= 4, "不備の一覧が出ていない: " + r.rows);
    return r.rows + " 問を列挙 / " + (r.drop ? "外すボタンあり" : "外す対象なし");
  });

  /* ══════════════════════════════════════════════════════════════
     3. 受験画面に解答欄が必ずある
     ══════════════════════════════════════════════════════════════ */
  console.log("\n══ 受験画面の解答欄 ══");

  await step("どの形式でも解答欄が必ず出る（空の欄を作らない）", async () => {
    const r = await pg.evaluate(() => {
      const S = window.VQ2.schema, MB = window.VQ2.mockBuilder;
      /* わざと壊れた形（選択肢ゼロ）も混ぜる */
      const draft = {
        title: "解答欄テスト", durationMinutes: 30, totalScore: 100,
        sections: [{ name: "全形式", score: 100, questions: [
          { id: "1", type: "true_false", question: "正誤", points: 10, choices: [] },
          { id: "2", type: "multiple_choice", question: "選択", points: 10,
            choices: [{ id: "a", text: "あ" }, { id: "b", text: "い" }] },
          { id: "3", type: "short_answer", question: "短答", points: 10, choices: [] },
          { id: "4", type: "descriptive", question: "記述", points: 10, choices: [] }
        ]}],
        answerKey: [{ id: "1", answer: "正しい" }, { id: "2", answer: "a" }, { id: "3", answer: "答" },
                    { id: "4", answer: "模範解答" }]
      };
      const rep = MB.repairSpec(MB.fromDraft(draft, { totalPoints: 100 }), { requireSources: false });
      const fin = MB.finalize(rep.spec);
      window.VQ2.store.mocks.put({ id: fin.spec.id, kind: "mock", title: fin.spec.title, spec: fin.spec });
      window.__examSpec = fin.spec;
      return { ok: fin.ok, errs: window.VQ2.validate.errorsOf(fin.issues).map((e) => e.code + ":" + e.message) };
    });
    assert(r.ok, "試験を作れなかった: " + r.errs.join(" / "));

    await pg.evaluate(() => {
      document.querySelectorAll(".vq2-host").forEach((h) => { if (h.__vq2) h.__vq2.forceClose("test"); });
      document.body.style.overflow = "";
      window.VQ2.examWorkspace.open({ spec: window.__examSpec });
    });
    await waitHost(pg, "vq2-exam-workspace");
    await pg.waitForTimeout(600);

    const got = await inShadow(pg, "vq2-exam-workspace", `
      const rows = [...root.querySelectorAll("[data-arow]")];
      return rows.map((row) => ({
        id: row.getAttribute("data-arow"),
        inputs: row.querySelectorAll("input,textarea,[data-pick],[data-pickm],[data-blank],[data-order],[data-pair]").length
      }));`);
    assert(got.length >= 4, "解答用紙に問題が出ていない: " + got.length);
    const empty = got.filter((g) => g.inputs === 0);
    assertEq(empty.length, 0, "解答欄の無い問題がある: " + JSON.stringify(empty));
    return got.length + " 問すべてに解答欄あり";
  });

  await step("選択肢が空でも文字で解答できる欄が出る（理由つき）", async () => {
    const r = await pg.evaluate(() => {
      const spec = JSON.parse(JSON.stringify(window.__examSpec));
      /* 保存後に壊れた場合でも受験できることを見る */
      spec.sections[0].questions[0].choices = [];
      spec.id = spec.id + "_broken";
      document.querySelectorAll(".vq2-host").forEach((h) => { if (h.__vq2) h.__vq2.forceClose("test"); });
      document.body.style.overflow = "";
      window.VQ2.examWorkspace.open({ spec: spec });
      return true;
    });
    assert(r);
    await waitHost(pg, "vq2-exam-workspace");
    await pg.waitForTimeout(500);
    const got = await inShadow(pg, "vq2-exam-workspace", `
      const row = root.querySelector("[data-arow]");
      return { inputs: row.querySelectorAll("input,textarea").length,
               note: (row.querySelector(".vq2-note") || {}).textContent || "" };`);
    assert(got.inputs >= 1, "解答欄が無い");
    assert(/選択肢/.test(got.note), "理由が出ていない: " + got.note);
    return "文字入力＋「" + got.note.trim().slice(0, 24) + "」";
  });

  /* ══════════════════════════════════════════════════════════════
     4. 分割生成（大問ごと）
     ══════════════════════════════════════════════════════════════ */
  console.log("\n══ 大問ごとの分割生成 ══");

  await step("構成案から、大問ごとの作る計画が立つ", async () => {
    const r = await pg.evaluate(() => {
      const MB = window.VQ2.mockBuilder;
      const bp = MB.parseBlueprint([
        "| 大問 | 内容 | 配点 | 問数 |",
        "| 1 | 古代 | 30 | 5 |",
        "| 2 | 中世 | 30 | 5 |",
        "| 3 | 近世 | 40 | 8 |"
      ].join("\n"));
      return { ok: bp.ok, n: bp.sections.length,
               counts: bp.sections.map((s) => s.count), points: bp.sections.map((s) => s.points) };
    });
    assertEq(r.ok, true, "構成案を読めなかった");
    assertEq(r.n, 3);
    return r.n + " 大問 / 問数 " + r.counts.join("+") + " / 配点 " + r.points.join("+");
  });

  await step("資料つきで実際に試験ができる（大問ごとに分けて作る）", async () => {
    await pg.evaluate(() => {
      document.querySelectorAll(".vq2-host").forEach((h) => { if (h.__vq2) h.__vq2.forceClose("test"); });
      document.body.style.overflow = "";
      window.VQ2.open.quickMock({});
    });
    await waitHost(pg, "vq2-quick-mock");
    await pg.waitForTimeout(300);

    const t0 = Date.now();
    const r = await pg.evaluate(async () => {
      const att = [{
        id: "a1", name: "授業プリント.pdf", kind: "pdf", pageCount: 2,
        extractedText: "[p.1] 645年、中大兄皇子と中臣鎌足は蘇我氏を倒し、大化の改新を始めた。"
          + "大宝律令は701年に完成した。710年、都を平城京へ移した。"
          + "班田収授法により6歳以上の男女に口分田が与えられた。"
          + "[p.2] 743年の墾田永年私財法により開墾地の永久私有が認められた。"
          + "794年、桓武天皇は都を平安京へ移した。摂関政治は藤原道長のころに最盛期を迎えた。"
      }];
      /* 大問 2 つぶんを 1 つずつ作らせる（UI と同じ経路） */
      const out = [];
      for (const p of [{ n: 1, title: "古代", count: 3 }, { n: 2, title: "平安", count: 3 }]) {
        const res = await window.VQ2.ai.generateMock({
          instruction: "添付した資料だけを根拠に、高校生向けの試験を作ってください。\n"
            + "【1 問ごとに必ず書くこと】問題文／正解／解説／選択問題は選択肢 2 つ以上\n"
            + "【この回で作るもの】大問" + p.n + "「" + p.title + "」だけを "
            + p.count + " 問。**この大問だけ**を sections に 1 つ返してください。",
          attachments: att, sourceOnly: true, count: p.count
        });
        const d = res.structured && res.structured.sections ? res.structured
                : (res.structured && res.structured.data ? res.structured.data : null);
        const secs = d && Array.isArray(d.sections) ? d.sections : [];
        if (!secs.length) { out.push({ n: p.n, q: 0 }); continue; }
        out.push({
          n: p.n,
          q: secs.reduce((a, x) => a + (x.questions || []).length, 0),
          sec: { name: p.title, score: 50,
                 questions: secs.reduce((a, x) => a.concat(x.questions || []), []) },
          keys: d.answerKey || []
        });
      }
      const sections = out.filter((o) => o.sec).map((o) => o.sec);
      if (!sections.length) return { ok: false, why: "1 つも作れなかった" };
      const keys = out.filter((o) => o.keys).reduce((a, o) => a.concat(o.keys), []);
      const MB = window.VQ2.mockBuilder;
      const spec = MB.fromDraft({ sections: sections, answerKey: keys },
        { title: "分割生成テスト", totalPoints: 100, sourceMode: "source-only" });
      const rep = MB.repairSpec(spec, { requireSources: true });
      const fin = MB.finalize(rep.spec);
      const qs = fin.spec.sections.reduce((a, s) => a.concat(s.questions), []);
      return {
        ok: true, rounds: out.length, perRound: out.map((o) => o.q),
        sections: fin.spec.sections.length, questions: qs.length,
        withAnswer: qs.filter((q) => (q.choices || []).some((c) => c.isCorrect) || q.correctAnswer).length,
        withExplanation: qs.filter((q) => String(q.explanation || "").trim()).length,
        withSource: qs.filter((q) => (q.sourceReferences || []).length).length,
        fixed: rep.fixed.length, remaining: rep.audit.total,
        total: qs.reduce((a, q) => a + q.points, 0),
        saveOk: fin.ok,
        errs: window.VQ2.validate.errorsOf(fin.issues).map((e) => e.code)
      };
    });
    assert(r.ok, r.why);
    assert(r.sections >= 1, "大問ができていない");
    assert(r.questions >= 3, "問題が少なすぎる: " + r.questions);
    assertEq(r.total, 100, "満点に合っていない");
    /* schema で必須にしたので、正解と解説はすべての設問に付いているはず */
    assertEq(r.withAnswer, r.questions, "正解の無い設問がある");
    assertEq(r.withExplanation, r.questions, "解説の無い設問がある");
    assert(r.withSource > 0, "資料を入れたのに出典が 1 件も付いていない");
    return `${r.rounds} 回（${r.perRound.join("+")} 問）→ ${r.sections} 大問 ${r.questions} 問`
      + ` / 正解 ${r.withAnswer} ・解説 ${r.withExplanation} ・出典 ${r.withSource}`
      + ` / 自動修復 ${r.fixed} ・残る不備 ${r.remaining}`
      + ` / ${Math.round((Date.now() - t0) / 1000)}秒`;
  });

  await step("Console エラー 0 件", async () => {
    const v2 = consoleErrors.filter((e) => !/favicon|net::ERR|Failed to load resource|503|404/i.test(e));
    assert(v2.length === 0, v2.join(" / "));
    return "0 件";
  });

  await browser.close();
  console.log(`\n結果: ${pass} / ${pass + fail} 通過` + (fail ? `（失敗 ${fail}）` : ""));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
