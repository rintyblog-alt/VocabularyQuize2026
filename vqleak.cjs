/* 画面を描き直すたびに「聞き手（イベントリスナー）」が増えていないかを実測する。

   なぜ見るのか:
     U.on() は呼ぶたびに addEventListener する。**外す仕組みが無い**。
     描き直しのたびに wire() を呼ぶ画面は、描くたびに聞き手が増え続ける。
     ・クイズの見出しは 1 秒ごとに描き直す → 1 分で 120 個増える
     ・押すと、増えたぶんだけ同じ処理が走る
       （再描画する処理は contains() の番人で止まるが、
         ダイアログを出すだけの処理は止まらず、二重に出る）

   ここでは「何個になったか」だけを数える。直したあとに同じ数字で比べる。

   実行: node vqleak.cjs
*/
const { chromium } = require("playwright");

const URL = "http://127.0.0.1:8791/?vqdev=1";
const HIDE = `#vqbFlow,#mob-tut-overlay,#mobBarTutorial,#firstLaunchOverlay,#vqOnboardingOverlay{display:none !important;}`;

let pass = 0, fail = 0;
const log = [];
function ok(name, cond, extra) {
  if (cond) { pass++; log.push("  ✓ " + name + (extra ? " — " + extra : "")); }
  else { fail++; log.push("  ✗ " + name + (extra ? "\n      → " + extra : "")); }
}

/* addEventListener を数える細工。ページを読み込む前に入れる。 */
const COUNTER = () => {
  const orig = EventTarget.prototype.addEventListener;
  const counts = new WeakMap();
  window.__leak = {
    mark(el) { counts.set(el, 0); el.__leakWatch = true; },
    of(el) { return counts.get(el) || 0; },
    total: 0
  };
  EventTarget.prototype.addEventListener = function (...a) {
    window.__leak.total++;
    if (this && this.__leakWatch) {
      counts.set(this, (counts.get(this) || 0) + 1);
      (window.__leakWhere = window.__leakWhere || []).push(
        String(new Error().stack || "").split("\n").slice(1, 4).join(" | ").slice(0, 300));
    }
    return orig.apply(this, a);
  };
};

async function login(pg) {
  await pg.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pg.addStyleTag({ content: HIDE });
  await pg.waitForFunction(() => document.getElementById("authLoginSubmitBtn"), { timeout: 20000 });
  await pg.evaluate(() => {
    const setV = (el, v) => {
      const p = el.tagName === "SELECT" ? HTMLSelectElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(p.prototype, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    setV(document.getElementById("authLoginGrade"), "H3");
    setV(document.getElementById("authLoginNickname"), "leaktest");
    setV(document.getElementById("authLoginPassword"), "Abcd1234");
    document.getElementById("authLoginSubmitBtn").click();
  });
  await pg.waitForFunction(() => document.body.getAttribute("data-ui-v2") === "1", { timeout: 30000 });
  await pg.waitForTimeout(1500);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pg = await ctx.newPage();
  await pg.addInitScript(COUNTER);
  const errors = [];
  pg.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  await login(pg);

  console.log("\n══ 描き直しで聞き手が増えていないか ══");

  /* ── 1) クイズプレイヤー ─────────────────────────────── */
  const quiz = await pg.evaluate(async () => {
    const preset = {
      id: "leak-preset", name: "もれ検査", ownerId: "leaktest",
      questions: [1, 2, 3, 4, 5].map((i) => ({
        id: "q" + i, type: "multiple_choice_single", prompt: "問題 " + i, points: 10,
        choices: [{ id: "a", text: "あ", isCorrect: i % 2 === 0 }, { id: "b", text: "い", isCorrect: i % 2 === 1 }]
      }))
    };
    const app = VQ2.quizPlayer.open({ preset: preset, mode: "practice" });
    /* 問題が出るまで待ってから数え始める。開いた直後は骨組みだけで、
       本番の描画（＝1 回きりの結線）がまだ済んでいない。 */
    for (let i = 0; i < 60 && !app.root.querySelector(".vq2-prog-n"); i++)
      await new Promise((r) => setTimeout(r, 100));
    await new Promise((r) => setTimeout(r, 300));
    window.__leak.mark(app.root);
    const before = window.__leak.of(app.root);
    /* 見出しの毎秒描き直しを 6 回ぶん待つ */
    await new Promise((r) => setTimeout(r, 6500));
    const afterTimer = window.__leak.of(app.root);
    /* 問題を 3 つ進める（描き直しが 3 回） */
    const click = (sel) => {
      const el = app.root.querySelector(sel);
      if (el) el.click();
      return !!el;
    };
    /* いま何問目かは進捗の「n / 5」で読む（見出しの数字は配点などと紛れる） */
    const nowAt = () => {
      const el = app.root.querySelector(".vq2-prog-n");
      const m = el && el.textContent.match(/(\d+)\s*\/\s*(\d+)/);
      return m ? Number(m[1]) : null;
    };
    let moved = 0;
    for (let i = 0; i < 3; i++) {
      const a0 = nowAt();
      if (click('[data-act="next"]')) moved++;
      await new Promise((r) => setTimeout(r, 350));
      const a1 = nowAt();
      window.__leakJump = (window.__leakJump || []);
      if (a0 != null && a1 != null) window.__leakJump.push(a1 - a0);
    }
    const afterNav = window.__leak.of(app.root);
    const jumps = window.__leakJump || [];
    /* 「終了」を 1 回押したとき、確認が 1 つだけ出るか */
    click('[data-act="exit"]');
    await new Promise((r) => setTimeout(r, 400));
    const dialogs = app.root.querySelectorAll('[data-act="dlg-o"]').length;
    return { before, afterTimer, afterNav, jumps, dialogs, moved, where: (window.__leakWhere || []).slice(0, 8) };
  });

  console.log(`  クイズ: 開いた直後 ${quiz.before} → 6 秒待つ ${quiz.afterTimer}`
    + ` → 3 問すすむ ${quiz.afterNav}`);
  console.log(`  「次へ」1 回で進んだ問数: ${JSON.stringify(quiz.jumps)}`);
  console.log(`  「終了」1 回で出た確認の数: ${quiz.dialogs}`);
  /* 増えていたときだけ、どこから張られたのかを出す（直す場所が分かるように） */
  if (quiz.afterNav > 0) (quiz.where || []).forEach((w) => console.log("    どこから: " + w));
  ok("6 秒待っても聞き手が増えない（見出しの毎秒描き直し）",
    quiz.afterTimer - quiz.before <= 2, `${quiz.before} → ${quiz.afterTimer}`);
  ok("問題を進めても聞き手が増えない",
    quiz.afterNav - quiz.afterTimer <= 2, `${quiz.afterTimer} → ${quiz.afterNav}`);
  ok("「次へ」1 回で 1 問だけ進む", quiz.jumps.every((j) => j === 1), JSON.stringify(quiz.jumps));
  ok("「終了」1 回で確認は 1 つだけ", quiz.dialogs <= 1, String(quiz.dialogs));

  /* ── 2) Quick Mock ─────────────────────────────────── */
  const qm = await pg.evaluate(async () => {
    const app = VQ2.quickMock.open({});
    await new Promise((r) => setTimeout(r, 800));
    window.__leak.mark(app.root);
    const before = window.__leak.of(app.root);
    /* タブを 6 回切り替える（そのたびに描き直す） */
    const tabs = ["questions", "paper", "verify", "artifacts", "plan", "questions"];
    for (const t of tabs) {
      const el = app.root.querySelector('[data-act="qm-tab"][data-tab="' + t + '"]')
        || app.root.querySelector('[data-tab="' + t + '"]');
      if (el) el.click();
      await new Promise((r) => setTimeout(r, 200));
    }
    const after = window.__leak.of(app.root);
    app.close("test");
    return { before, after };
  });
  console.log(`  Quick Mock: ${qm.before} → タブ 6 回で ${qm.after}`);
  ok("Quick Mock：タブを切り替えても聞き手が増えない",
    qm.after - qm.before <= 2, `${qm.before} → ${qm.after}`);

  console.log("");
  log.forEach((l) => console.log(l));
  if (errors.length) { console.log("\n  ページのエラー:"); errors.slice(0, 5).forEach((e) => console.log("    - " + e)); }
  console.log(`\n══ まとめ ══\n  合格 ${pass} / 不合格 ${fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
