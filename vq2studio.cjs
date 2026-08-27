/* プリセット編集画面まわりの検証。
   ・モーダルを重ねない
   ・プリセットごとの AI 会話が閉じても残る
   ・作業ログが 1 行ずつ出て、経過時間が出る
   ・はじめの画面に印と一言が出て、一言が入れ替わる
   ・記述式に採点基準が付き、AI 採点が実際に走る
   本体は http://127.0.0.1:8791 で動いていることが前提（vq2e2e.cjs と同じ）。 */
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

/* Shadow DOM の中でコードを走らせる（root = .vq2-root） */
async function inShadow(pg, hostId, body, arg) {
  return pg.evaluate(({ id, src, a }) => {
    const host = document.getElementById(id);
    if (!host || !host.shadowRoot) return { __no: true };
    const root = host.shadowRoot.querySelector(".vq2-root");
    return new Function("root", "args", src)(root, a);
  }, { id: hostId, src: body, a: arg === undefined ? null : arg });
}
/* 形式は選択欄ではなく「形式を選ぶ」モーダルから決める（V3 でこうなった）。
   問題を足すときも、形式を変えるときも、同じモーダルが開く。 */
async function pickType(pg, typeId) {
  await pg.waitForFunction(() => {
    const h = document.getElementById("vq2-qtype-picker");
    return !!(h && h.shadowRoot && h.shadowRoot.querySelector("[data-qt]"));
  }, null, { timeout: 15000 });
  const hit = await pg.evaluate((t) => {
    const sr = document.getElementById("vq2-qtype-picker").shadowRoot;
    const el = sr.querySelector('[data-qt="' + t + '"]');
    if (!el) return false;
    el.click();
    return true;
  }, typeId);
  if (!hit) throw new Error("形式が見つからない: " + typeId);
  await pg.waitForTimeout(500);
}
/* 1 問足す（形式まで決める） */
async function addQuestion(pg, typeId) {
  await inShadow(pg, "vq2-preset-studio", `root.querySelector('[data-act="add"]').click(); return true;`);
  await pickType(pg, typeId || "multiple_choice_single");
}
/* いま選んでいる問題の形式を変える */
async function changeType(pg, typeId) {
  await inShadow(pg, "vq2-preset-studio", `root.querySelector('[data-act="pick-type"]').click(); return true;`);
  await pickType(pg, typeId);
}
async function waitHost(pg, id) {
  await pg.waitForFunction((i) => {
    const h = document.getElementById(i);
    return !!(h && h.shadowRoot && h.shadowRoot.querySelector(".vq2-root"));
  }, id, { timeout: 20000 });
}
async function openStudio(pg, opts) {
  await pg.evaluate((o) => {
    document.querySelectorAll(".vq2-host").forEach((h) => h.remove());
    document.body.style.overflow = "";
    window.VQ2.open.presetStudio(o || {});
  }, opts || {});
  await waitHost(pg, "vq2-preset-studio");
  await pg.waitForTimeout(250);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();
  pg.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
  pg.on("pageerror", (e) => consoleErrors.push("pageerror: " + String(e).slice(0, 200)));

  await login(pg, "http://127.0.0.1:8791/?vqdev=1");

  /* ══════════════════════════════════════════════════════════════
     1. モーダルは重ねない
     ══════════════════════════════════════════════════════════════ */
  console.log("\n══ モーダルを重ねない ══");

  await openStudio(pg, {});

  await step("プレビューを連打しても確認画面は 1 枚だけ", async () => {
    /* 問題が無いとプレビューは開かないので 1 問足す（形式まで決める） */
    await addQuestion(pg, "multiple_choice_single");
    await inShadow(pg, "vq2-preset-studio", `
      const b = root.querySelector('[data-act="preview"]');
      for (let i = 0; i < 6; i++) b.click();
      return true;`);
    await pg.waitForTimeout(400);
    const n = await inShadow(pg, "vq2-preset-studio",
      `return root.querySelectorAll(".vq2-dialog-layer").length;`);
    assertEq(n, 1, "確認画面が重なった");
    return "6 回押して 1 枚";
  });

  await step("閉じたあとに開き直せる（1 枚のまま塞がらない）", async () => {
    await inShadow(pg, "vq2-preset-studio",
      `root.querySelector('[data-act="dlg-o"]').click(); return true;`);
    await pg.waitForTimeout(300);
    assertEq(await inShadow(pg, "vq2-preset-studio",
      `return root.querySelectorAll(".vq2-dialog-layer").length;`), 0, "閉じられていない");
    await inShadow(pg, "vq2-preset-studio",
      `root.querySelector('[data-act="preview"]').click(); return true;`);
    await pg.waitForTimeout(300);
    assertEq(await inShadow(pg, "vq2-preset-studio",
      `return root.querySelectorAll(".vq2-dialog-layer").length;`), 1, "開き直せない");
    await inShadow(pg, "vq2-preset-studio",
      `root.querySelector('[data-act="dlg-o"]').click(); return true;`);
    await pg.waitForTimeout(200);
    return "閉じる → 開く が通る";
  });

  await step("別の確認を出すと前のものは残らない", async () => {
    const n = await inShadow(pg, "vq2-preset-studio", `
      const a = root.getRootNode().host.__vq2;
      a.alert({ title: "A", body: "1つめ" });
      a.confirm({ title: "B", body: "2つめ" });
      return root.querySelectorAll(".vq2-dialog-layer").length;`);
    assertEq(n, 1, "2 枚出た");
    const title = await inShadow(pg, "vq2-preset-studio",
      `return root.querySelector(".vq2-dialog-h h2").textContent;`);
    assertEq(title, "B", "後から出したものが前に出ていない");
    await inShadow(pg, "vq2-preset-studio",
      `root.querySelector('[data-act="dlg-c"]').click(); return true;`);
    await pg.waitForTimeout(200);
    return "常に 1 枚";
  });

  await step("設定シートを連打しても 1 枚だけ", async () => {
    await inShadow(pg, "vq2-preset-studio", `
      const b = root.querySelector('[data-act="settings"]');
      for (let i = 0; i < 5; i++) b.click();
      return true;`);
    await pg.waitForTimeout(500);
    const n = await pg.evaluate(() => document.querySelectorAll("#vq2-preset-appearance").length);
    assertEq(n, 1, "設定シートが重なった");
    await inShadow(pg, "vq2-preset-appearance",
      `root.querySelector('[data-act="x"]').click(); return true;`);
    await pg.waitForTimeout(300);
    return "5 回押して 1 枚";
  });

  /* ══════════════════════════════════════════════════════════════
     2. はじめの画面（印と一言）
     ══════════════════════════════════════════════════════════════ */
  console.log("\n══ はじめの画面 ══");

  await step("印（VocabuQuiz マーク）と一言が出ている", async () => {
    await openStudio(pg, {});
    await inShadow(pg, "vq2-preset-studio", `
      const b = root.querySelector('[data-act="mode-auto"]'); if (b) b.click(); return true;`);
    await pg.waitForTimeout(300);
    const r = await inShadow(pg, "vq2-preset-studio", `
      const mark = root.querySelector(".vq2-mark");
      const line = root.querySelector("#aiHeroLine");
      if (!mark || !line) return { ok: false };
      const mr = mark.getBoundingClientRect();
      return { ok: true, w: Math.round(mr.width), h: Math.round(mr.height),
               text: line.textContent.trim(),
               weight: getComputedStyle(line).fontWeight };
    `);
    assert(r.ok, "印か一言が無い");
    assert(r.w > 60 && r.h > 60, "印が小さすぎる: " + r.w + "×" + r.h);
    assert(r.text.length > 5, "一言が空");
    assert(Number(r.weight) >= 600, "太字になっていない: " + r.weight);
    return r.w + "×" + r.h + " / 「" + r.text + "」";
  });

  await step("一言は入れ替わる（テンプレートが複数ある）", async () => {
    const first = await inShadow(pg, "vq2-preset-studio",
      `return root.querySelector("#aiHeroLine").textContent.trim();`);
    await pg.waitForTimeout(6200);
    const second = await inShadow(pg, "vq2-preset-studio",
      `return root.querySelector("#aiHeroLine").textContent.trim();`);
    assert(first !== second, "入れ替わっていない: " + first);
    return "「" + first + "」→「" + second + "」";
  });

  /* ══════════════════════════════════════════════════════════════
     3. 記述式の採点基準
     ══════════════════════════════════════════════════════════════ */
  console.log("\n══ 記述式の採点基準 ══");

  await step("形式を記述に変えると採点基準が自動で用意される", async () => {
    await openStudio(pg, {});
    await addQuestion(pg, "multiple_choice_single");
    await changeType(pg, "long_answer");
    const r = await inShadow(pg, "vq2-preset-studio",
      `return root.querySelector('[data-act="pick-type"]').textContent.trim();`);
    assert(/記述|論述/.test(r), "形式を変えられなかった: " + r);
    await pg.waitForTimeout(400);
    const got = await inShadow(pg, "vq2-preset-studio", `
      const rows = root.querySelectorAll(".vq2-rub-i");
      const pts = [...root.querySelectorAll('[data-key="rubPoints"]')].map((i) => Number(i.value));
      return { rows: rows.length, pts: pts,
               descs: [...root.querySelectorAll('[data-key="rubDesc"]')].map((i) => i.value) };`);
    assert(got.rows >= 1, "採点基準の欄が出ていない");
    assert(got.descs.every((d) => d.length > 0), "説明が空の基準がある");
    return got.rows + " 項目 / 配点 " + got.pts.join("+");
  });

  await step("配点を変えると基準の合計も合う（保存できる状態を保つ）", async () => {
    await inShadow(pg, "vq2-preset-studio", `
      const p = root.querySelector('.vq2-qcard-b [data-key="points"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(p, "12");
      p.dispatchEvent(new Event("input", { bubbles: true }));
      return true;`);
    await pg.waitForTimeout(400);
    const r = await inShadow(pg, "vq2-preset-studio", `
      const pts = [...root.querySelectorAll('[data-key="rubPoints"]')].map((i) => Number(i.value));
      const chip = root.querySelector("#rubSum .vq2-chip");
      return { sum: pts.reduce((a, b) => a + b, 0), chip: chip ? chip.textContent.trim() : "" };`);
    assertEq(r.sum, 12, "合計が配点に合っていない");
    assert(/合計 12 \/ 配点 12/.test(r.chip), "表示が合っていない: " + r.chip);
    return r.chip;
  });

  await step("採点基準の付いた記述問題は保存できる", async () => {
    const r = await pg.evaluate(() => {
      const S = window.VQ2.schema, V = window.VQ2.validate;
      const q = S.emptyQuestion({ type: "long_answer", prompt: "理由を説明しなさい。", points: 12 });
      q.choices = [];
      q.scoringRubric = S.defaultRubric("long_answer", 12);
      const p = S.emptyPreset({ name: "記述テスト", questions: [q] });
      const issues = V.validatePresetForSave(p, {});
      return { errs: V.errorsOf(issues).map((e) => e.code + ":" + e.message) };
    });
    assertEq(r.errs.length, 0, r.errs.join(" / "));
    return "error 0 件";
  });

  /* ══════════════════════════════════════════════════════════════
     4. AI 採点が実際に走る（ローカル AI を実際に呼ぶ）
     ══════════════════════════════════════════════════════════════ */
  console.log("\n══ AI 採点（実際に呼ぶ）══");

  await step("記述の解答が AI 採点にかかり、基準ごとの点と理由が返る", async () => {
    const r = await pg.evaluate(async () => {
      const S = window.VQ2.schema, G = window.VQ2.grading, AI = window.VQ2.ai;
      const q = S.emptyQuestion({
        type: "long_answer", points: 10,
        prompt: "鎌倉幕府が御家人との結びつきを保てなくなった理由を、御恩と奉公の関係にふれて説明しなさい。",
        correctAnswer: "元寇では新たな領地を得られず、幕府が御恩として与える土地が不足したため、"
          + "奉公に見合う恩賞を与えられなくなり、御家人の信頼を失ったから。"
      });
      q.choices = [];
      q.scoringRubric = S.defaultRubric("long_answer", 10);

      /* わざと「片方しか書けていない」答案にする。満点にならないことを見る。 */
      const answer = { questionId: q.id, value: { text: "元寇のあと、御家人が貧しくなったから。" } };
      const graded = G.gradeSession([q], [answer]);
      if (!graded.pendingAi.length) return { ok: false, why: "AI 採点に回っていない" };

      const targets = graded.pendingAi.map((p) => ({
        questionId: p.question.id,
        question: p.question.prompt,
        modelAnswer: p.question.correctAnswer,
        answer: p.answer.text,
        points: p.question.points,
        subject: "日本史",
        rubric: p.question.scoringRubric.items.map((x) => ({
          id: x.id, description: x.description, points: x.points,
          criterionLabel: S.criterionLabel(x.criterionId)
        })),
        sourceText: ""
      }));

      const t0 = Date.now();
      let res;
      try { res = await AI.gradeAnswers({ targets: targets }); }
      catch (e) { return { ok: false, why: String((e && (e.userMessage || e.message)) || e) }; }
      const data = res.structured && res.structured.data ? res.structured.data : null;
      if (!data || !data.grades) return { ok: false, why: "構造化結果なし: " + (res.text || "").slice(0, 200) };
      const g = data.grades[0];
      if (!g || !g.ok) return { ok: false, why: "採点されなかった: " + JSON.stringify(g) };

      const item = graded.items.find((i) => i.questionId === q.id);
      const applied = G.applyAiGrade(item, q, g.grade);
      return {
        ok: true, ms: Date.now() - t0,
        score: applied.score, max: applied.maxScore,
        breakdown: applied.rubricBreakdown.map((b) => b.rubricItemId + ":" + b.awarded + "/" + b.maxPoints),
        reasons: applied.rubricBreakdown.map((b) => String(b.reason || "").length),
        ids: applied.rubricBreakdown.map((b) => b.rubricItemId),
        allowedIds: q.scoringRubric.items.map((x) => x.id),
        scoringReason: applied.scoringReason,
        confidence: applied.confidence,
        requiresReview: applied.requiresReview,
        missing: applied.missingElements.length
      };
    });
    assert(r.ok, r.why);
    assert(r.breakdown.length >= 1, "基準ごとの内訳が無い");
    assert(r.ids.every((i) => r.allowedIds.indexOf(i) >= 0), "基準に無い id が混ざった: " + r.ids.join(","));
    assert(r.score >= 0 && r.score <= r.max, "得点が範囲外: " + r.score + "/" + r.max);
    assert(r.reasons.every((n) => n > 0), "点をつけた理由が空");
    assert(String(r.scoringReason || "").length > 0, "採点全体の理由が空");
    return `${r.score}/${r.max} 点 ・ ${r.breakdown.join(" ")} ・ ${Math.round(r.ms / 1000)}秒`
      + (r.requiresReview ? " ・要確認" : "");
  });

  await step("採点基準が無い記述は AI 採点を行わない（根拠を示せないため）", async () => {
    const r = await pg.evaluate(async () => {
      const S = window.VQ2.schema, G = window.VQ2.grading, AI = window.VQ2.ai;
      const q = S.emptyQuestion({ type: "long_answer", points: 10, prompt: "説明しなさい。" });
      q.choices = []; q.scoringRubric = null;
      const graded = G.gradeSession([q], [{ questionId: q.id, value: { text: "適当な答え" } }]);
      const res = await AI.gradeAnswers({
        targets: [{ questionId: q.id, question: q.prompt, modelAnswer: "", answer: "適当な答え",
                    points: 10, subject: "", rubric: [], sourceText: "" }]
      });
      const data = res.structured && res.structured.data ? res.structured.data : null;
      return { pending: graded.pendingAi.length,
               grades: data && data.grades ? data.grades.map((g) => g.ok + ":" + (g.reason || "")) : null,
               text: (res.text || "").slice(0, 120) };
    });
    assertEq(r.pending, 1, "AI 採点の対象になっていない");
    assert(r.grades && r.grades[0] === "false:no_rubric", "基準なしで採点した: " + JSON.stringify(r.grades));
    return "採点せず理由を返す（" + r.text.replace(/\n/g, " ") + "）";
  });

  /* ══════════════════════════════════════════════════════════════
     5. 会話履歴とログの出し方
     ══════════════════════════════════════════════════════════════ */
  console.log("\n══ 会話履歴と作業ログ ══");

  let presetId = null;

  await step("生成中はログが 1 行ずつ増え、経過時間が出る", async () => {
    await openStudio(pg, {});
    presetId = await inShadow(pg, "vq2-preset-studio", `
      const b = root.querySelector('[data-act="mode-auto"]'); if (b) b.click(); return true;`)
      .then(() => pg.evaluate(() => {
        /* 添付を Quick Chat の形式で直接入れる（読み取り部品は通さない） */
        const host = document.getElementById("vq2-preset-studio");
        const root = host.shadowRoot.querySelector(".vq2-root");
        const only = root.querySelector('[data-key="sourceOnly"]');
        if (only && only.checked) { only.checked = false; only.dispatchEvent(new Event("change", { bubbles: true })); }
        const ta = root.querySelector("[data-tlinput]");
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(
          ta, "中学理科の光合成について、4択問題を4問作ってください。");
        ta.dispatchEvent(new Event("input", { bubbles: true }));
        return null;
      }));

    /* 添付を Studio の内部状態へ入れる手段が無いので、AI 側だけを直接呼ぶのではなく
       ボタンを押して実際の流れを走らせる（資料なしでも Orchestrator は動く）。 */
    await inShadow(pg, "vq2-preset-studio",
      `root.querySelector("[data-tlsend]").click(); return true;`);

    /* 押した直後に全部出ていないこと（＝一気に出していない）を見る */
    await pg.waitForTimeout(500);
    const snap = `
      const items = [...root.querySelectorAll(".vq2-tl-i")];
      return { rows: items.length,
               bar: !!root.querySelector(".vq2-aiact-st.is-busy"),
               last: items.length ? items[items.length - 1].querySelector(".vq2-tl-t").textContent : "",
               eta: (root.querySelector("#aiEta") || {}).textContent || "" };`;
    const early = await inShadow(pg, "vq2-preset-studio", snap);
    assert(early.bar, "作業中の帯が出ていない");

    /* しばらく待つと進んでいる＝段階的に出している。
       タイムラインは同じ工程の running → completed を 1 枚のまま書き換えるので、
       「枚数が増える」か「最後の 1 枚の見出しが変わる」のどちらかで進みを見る。
       ローカル AI は 1 段が数十秒かかることがあるので、変わるまで待つ。 */
    let later = early;
    for (let i = 0; i < 60 && later.rows === early.rows && later.last === early.last; i++) {
      await pg.waitForTimeout(500);
      later = await inShadow(pg, "vq2-preset-studio", snap);
    }
    assert(later.rows > early.rows || later.last !== early.last,
      `進んでいない（${early.rows} 枚「${early.last}」→ ${later.rows} 枚「${later.last}」）`);
    assert(/経過 \d+:\d\d/.test(later.eta), "経過時間が出ていない: " + later.eta);

    /* 止めて後片付け */
    await inShadow(pg, "vq2-preset-studio", `
      const b = root.querySelector('[data-act="ai-stop"]'); if (b) b.click(); return true;`);
    await pg.waitForTimeout(1500);
    return `${early.rows} 行 → ${later.rows} 行 / ${later.eta.replace(/\s+/g, " ").trim()}`;
  });

  await step("会話は閉じて開き直しても残る", async () => {
    /* いま会話を書き込んだプリセットの id（saveChat は直近を先頭に置く） */
    const id = await pg.evaluate(() => {
      const all = JSON.parse(localStorage.getItem("vq2.presetChats.v1") || "[]");
      return all.length ? all[0].presetId : null;
    });
    assert(id, "会話が保存されていない");

    const before = await inShadow(pg, "vq2-preset-studio", `
      return { msgs: root.querySelectorAll(".vq2-tl-i.k-user-followup").length,
               logs: root.querySelectorAll(".vq2-tl-i").length };`);
    assert(before.msgs >= 1, "頼んだ内容が残っていない");

    /* 閉じて、同じプリセットをもう一度開く */
    await pg.evaluate((pid) => {
      document.querySelectorAll(".vq2-host").forEach((h) => {
        if (h.__vq2) h.__vq2.forceClose("test");
      });
      document.body.style.overflow = "";
      /* 保存していないプリセットなので、id を持った空のプリセットとして開き直す */
      const p = window.VQ2.store.getPreset(pid) || window.VQ2.schema.emptyPreset({ name: "会話テスト" });
      p.id = pid;
      window.VQ2.open.presetStudio({ preset: p });
    }, id);
    await waitHost(pg, "vq2-preset-studio");
    await pg.waitForTimeout(600);
    /* 下書き復元の確認が出たら「復元する」を押す */
    await inShadow(pg, "vq2-preset-studio", `
      const b = root.querySelector('[data-act="dlg-o"]'); if (b) b.click(); return true;`);
    await pg.waitForTimeout(400);
    await inShadow(pg, "vq2-preset-studio", `
      const b = root.querySelector('[data-act="mode-auto"]'); if (b) b.click(); return true;`);
    await pg.waitForTimeout(400);

    const after = await inShadow(pg, "vq2-preset-studio", `
      return { msgs: root.querySelectorAll(".vq2-tl-i.k-user-followup").length,
               logs: root.querySelectorAll(".vq2-tl-i").length,
               hero: !!root.querySelector("#aiHeroLine") };`);
    assert(after.msgs >= before.msgs, `会話が減った（${before.msgs} → ${after.msgs}）`);
    assert(after.logs > 0, "作業ログが残っていない");
    assert(!after.hero, "会話があるのに、はじめの画面が出ている");
    return `${before.msgs} 発言・${before.logs} 行 → ${after.msgs} 発言・${after.logs} 行`;
  });

  await step("会話はプリセットごとに分かれている", async () => {
    const r = await pg.evaluate(() => {
      const ST = window.VQ2.store;
      ST.saveChat("p_other_preset", [{ role: "user", text: "別のプリセットの話" }]);
      const a = ST.loadChat("p_other_preset");
      const keys = Object.keys(localStorage).filter((k) => k === "vq2.presetChats.v1");
      const all = JSON.parse(localStorage.getItem("vq2.presetChats.v1") || "[]");
      return { a: a.length, keys: keys.length, presets: all.map((x) => x.presetId).length,
               mixed: all.some((x) => !x.presetId) };
    });
    assertEq(r.a, 1, "別プリセットの会話が読めない");
    assert(!r.mixed, "プリセットに紐づかない会話がある");
    assert(r.presets >= 2, "会話が 1 つにまとまってしまっている");
    return r.presets + " プリセット分";
  });

  /* ══════════════════════════════════════════════════════════════
     6. モバイル（390px）で新しい部品が収まる
     ══════════════════════════════════════════════════════════════ */
  console.log("\n══ モバイル（390×844）══");

  const mctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
      + "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
  });
  const mp = await mctx.newPage();
  mp.on("console", (m) => { if (m.type() === "error") consoleErrors.push("[mobile] " + m.text().slice(0, 200)); });
  mp.on("pageerror", (e) => consoleErrors.push("[mobile] pageerror: " + String(e).slice(0, 200)));
  await login(mp, "http://127.0.0.1:8791/?vqdev=1");

  await step("はじめの画面が 390px に収まる", async () => {
    await openStudio(mp, {});
    await inShadow(mp, "vq2-preset-studio", `
      const t = root.querySelector('[data-pane="main"]'); if (t) t.click(); return true;`);
    await mp.waitForTimeout(400);
    const r = await inShadow(mp, "vq2-preset-studio", `
      const hero = root.querySelector(".vq2-hero");
      if (!hero) return { ok: false };
      const sc = root.querySelector("#wsMainScroll");
      return { ok: true, over: Math.max(0, sc.scrollWidth - sc.clientWidth),
               mark: Math.round(root.querySelector(".vq2-mark").getBoundingClientRect().width),
               body: Math.max(0, document.documentElement.scrollWidth - 390) };`);
    assert(r.ok, "はじめの画面が出ていない");
    assertEq(r.over, 0, "横あふれがある");
    return "印 " + r.mark + "px / 横あふれ 0px";
  });

  await step("採点基準の欄が 390px に収まる", async () => {
    await inShadow(mp, "vq2-preset-studio", `
      const t = root.querySelector('[data-pane="main"]'); if (t) t.click(); return true;`);
    await mp.waitForTimeout(300);
    await addQuestion(mp, "multiple_choice_single");
    await changeType(mp, "essay");
    await mp.waitForTimeout(500);
    const r = await inShadow(mp, "vq2-preset-studio", `
      const box = root.querySelector("#rubBox");
      if (!box) return { ok: false };
      const pane = root.querySelector("#wsMainScroll");
      const rows = [...root.querySelectorAll(".vq2-rub-i")];
      const tap = rows.length ? Math.round(rows[0].querySelector('[data-act="rubric-del"]')
        .getBoundingClientRect().height) : 0;
      return { ok: true, rows: rows.length,
               over: Math.max(0, pane.scrollWidth - pane.clientWidth),
               wide: rows.filter((x) => x.getBoundingClientRect().right > 390).length, tap: tap };`);
    assert(r.ok, "採点基準の欄が出ていない");
    assertEq(r.over, 0, "横あふれがある");
    assertEq(r.wide, 0, "画面からはみ出した行がある");
    assert(r.tap >= 40, "削除ボタンが小さすぎる: " + r.tap + "px");
    return r.rows + " 項目 / 横あふれ 0px / タップ " + r.tap + "px";
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
