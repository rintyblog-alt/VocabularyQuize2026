/* ══════════════════════════════════════════════════════════════════════
   全形式の契約テスト（V3 §42）

   「レジストリに名前がある」ことと「本番で使える」ことは別。
   本番と判定した形式 **1 つずつ** について、実画面で次を通す。

     ① 空の問題を作れる        ⑥ 採点できる
     ② 見本を作れる            ⑦ 結果画面で答えを再現できる
     ③ 保存の検証を通る        ⑧ Insight で日本語の名前になる
     ④ 編集できる              ⑨ スマホでも表示できる
     ⑤ 表示できる・答えられる

   1 つでも落ちた形式は本番にしない。
   結果は contract-report.md へ書き出す（人が読む表）。
   ══════════════════════════════════════════════════════════════════════ */
const { chromium } = require("playwright");
const fs = require("fs");
const BASE = process.env.VQ_BASE || "http://127.0.0.1:8791";
let pass = 0, fail = 0;
const ok = (n, c, x) => { c ? (pass++, console.log("  ok   " + n)) : (fail++, console.log("  NG   " + n + (x ? "  → " + x : ""))); };

const HIDE = () => {
  ["firstLaunchOverlay", "vqbFlow", "vqNewAuth", "authGate", "authBootSplash"].forEach((id) => {
    const e = document.getElementById(id);
    if (e) { e.hidden = true; e.style.setProperty("display", "none", "important"); }
  });
  document.body.classList.remove("auth-booting", "auth-gate-open");
  document.body.setAttribute("data-ui-v2", "1");
};

/* 形式ごとの見本と、正解の答え。**エンジン単位**で書く（形式ごとには書かない）。
   ここを形式ごとに書き始めると、形式が増えるたびにテストが増えてしまう。 */
const CONTRACT = () => {
  const M = VQ2.qmodel, Q = VQ2.qtypes, V = VQ2.validate, EV = VQ2.evaluator,
        R = VQ2.qrender, A = VQ2.answerability, C = VQ2.capability, ED = VQ2.qtypeEditor;
  const IMG = { id: "m1", kind: "image", src: "data:image/gif;base64,R0lGODlhAQABAAAAACw=", alt: "図" };

  function fill(q) {
    const e = q.engine || Q.engineOf(q.type);
    q.prompt = "これは「" + Q.label(q.type) + "」の見本です。次の問いに答えなさい。";
    q.points = 2;
    /* 読み上げが要る形式には原稿を入れる。エンジンだけでは分からない
       （音声穴埋めは fill_blank、音声並べ替えは reorder のため）。
       書き取りは正解の文がそのまま原稿になるので、ここでは入れない。 */
    if (VQ2.qplan.NEEDS[q.type] === "speech" && e !== "dictation")
      q.script = "The library closes at six in the evening.";
    if (e === "single_choice" || e === "image_choice" || e === "audio_choice") {
      q.choices = ["ただしい答え", "ちがう答え", "べつの答え", "もうひとつの答え"].map((t, i) => ({
        id: "c" + (i + 1), label: "ABCD"[i], text: t, isCorrect: i === 0,
        /* 画像選択は「選択肢そのものが画像」。問題文に 1 枚あるだけでは成り立たない。 */
        image: e === "image_choice" ? IMG.src : undefined
      }));
      return { choiceId: "c1" };
    }
    if (e === "true_false") {
      q.choices = [{ id: "c1", label: "A", text: "正しい", isCorrect: true },
                   { id: "c2", label: "B", text: "誤り", isCorrect: false }];
      return { choiceId: "c1" };
    }
    if (e === "multi_choice") {
      q.choices = ["あてはまる1", "あてはまらない", "あてはまる2", "これも違う"].map((t, i) => ({
        id: "c" + (i + 1), label: "ABCD"[i], text: t, isCorrect: i === 0 || i === 2
      }));
      return { choiceIds: ["c1", "c3"] };
    }
    if (e === "text_input") {
      q.correctAnswer = "こたえ";
      q.acceptedAnswers = [];
      return { text: "こたえ" };
    }
    if (e === "numeric_input") {
      q.correctAnswer = "12";
      q.scoringRule = Object.assign({}, q.scoringRule, { tolerance: 0 });
      return { text: "12" };
    }
    if (e === "fill_blank") {
      q.prompt = "次の文の【　】に入る語を書きなさい。日本の首都は【　】である。";
      const b = { id: "b1", label: "1", answer: "東京", acceptedAnswers: [] };
      /* 選択式の穴埋めは、空欄ごとに選ぶものが要る（入力式とは別）。 */
      if (q.settings && q.settings.blankMode === "select")
        b.options = [{ id: "o1", text: "東京" }, { id: "o2", text: "大阪" }, { id: "o3", text: "京都" }];
      if (q.settings && q.settings.blankMode === "drag") q.wordBank = ["東京", "大阪", "京都"];
      q.blanks = [b];
      return { blanks: ["東京"] };
    }
    if (e === "reorder") {
      q.orderItems = ["いちばん目", "にばん目", "さんばん目"].map((t, i) => ({ id: "i" + (i + 1), text: t, order: i + 1 }));
      q.correctOrder = ["i1", "i2", "i3"];
      return { order: ["i1", "i2", "i3"] };
    }
    if (e === "matching") {
      q.pairs = {
        left: [{ id: "L1", text: "日本" }, { id: "L2", text: "フランス" }],
        right: [{ id: "R1", text: "東京" }, { id: "R2", text: "パリ" }],
        correct: { L1: "R1", L2: "R2" }
      };
      q.correctAnswer = { L1: "R1", L2: "R2" };
      return { L1: "R1", L2: "R2" };
    }
    if (e === "classification") {
      q.classification = {
        groups: [{ id: "g1", label: "なかま A" }, { id: "g2", label: "なかま B" }],
        items: [{ id: "t1", text: "こうもく1", groupId: "g1" }, { id: "t2", text: "こうもく2", groupId: "g2" }]
      };
      return { items: { t1: "g1", t2: "g2" } };
    }
    if (e === "table_fill") {
      q.table = {
        caption: "見本の表",
        columns: [{ id: "col1", text: "国" }, { id: "col2", text: "首都" }],
        rows: [{ id: "r1", header: "", cells: [
          { id: "r1c1", text: "日本", editable: false },
          { id: "r1c2", text: "", editable: true, answer: "東京", acceptedAnswers: [] }] }]
      };
      return { cells: { r1c2: "東京" } };
    }
    if (e === "chart_read") {
      q.chart = { kind: "bar", title: "見本のグラフ", unit: "件",
                  categories: ["1970", "1980"], series: [{ name: "数", values: [120, 340] }] };
      q.choices = [];
      q.correctAnswer = "340";
      q.settings = Object.assign({}, q.settings, { answerKind: "numeric" });
      q.scoringRule = Object.assign({}, q.scoringRule, { tolerance: 0 });
      return { text: "340" };
    }
    if (e === "error_correction") {
      q.prompt = "次の文の誤りを直しなさい。He go to school every day.";
      q.errorSpans = [{ id: "e1", wrong: "go", correct: "goes", acceptedAnswers: [] }];
      return { spans: { e1: "goes" } };
    }
    if (e === "free_text") {
      q.correctAnswer = "本文からそのまま抜き出した答えです。";
      q.scoringRubric = { items: [{ id: "r1", description: "要点に触れている", points: 2 }] };
      q.points = 2;
      /* 抜き出し（根拠引用など）はコードで採点すると決めてある形式。
         その場合は模範解答と一致させて満点になることを見る。 */
      const deterministic = q.settings && q.settings.aiGrading === false;
      return { text: deterministic ? q.correctAnswer : "自分の言葉で書いた答えです。" };
    }
    if (e === "dictation") {
      /* 書き取りは正解の文がそのまま読み上げる原稿になる。音声ファイルは要らない。 */
      q.correctAnswer = "This is a pen.";
      return { text: "This is a pen." };
    }
    if (e === "image_point") {
      q.media = [IMG];
      q.hotspots = [{ id: "h1", shape: "circle", x: 0.5, y: 0.5, r: 0.08, label: "ここ" }];
      return { points: [{ x: 0.5, y: 0.5 }] };
    }
    if (e === "image_label") {
      q.media = [IMG];
      q.labels = {
        bank: [{ id: "b1", text: "ラベル1" }, { id: "b2", text: "ラベル2" }],
        slots: [{ id: "s1", x: 0.3, y: 0.3, answerId: "b1" }, { id: "s2", x: 0.7, y: 0.7, answerId: "b2" }]
      };
      return { slots: { s1: "b1", s2: "b2" } };
    }
    if (e === "flashcard") {
      q.card = { front: "おもて（思い出すきっかけ）", back: "うら（答え）" };
      q.prompt = q.card.front;
      return { mark: "known" };
    }
    if (e === "composite") {
      const kid = M.empty("multiple_choice_single", { points: 2 });
      const kidAnswer = fill(kid);
      q.context = "次の文章を読んで、あとの問いに答えなさい。（見本の共通資料）";
      q.instruction = "次の問いに答えなさい。";
      q.children = [M.normalize(kid)];
      q.points = 2;
      return { children: { [q.children[0].id]: kidAnswer } };
    }
    return null;
  }

  const table = C.table({ force: true });
  const targets = table.filter((t) => t.status === "production");
  const rows = [];

  targets.forEach((t) => {
    const row = { type: t.type, name: t.displayName, engine: t.engine, category: t.category, steps: {}, why: [] };
    let q = null, answer = null;
    /* ① 空の問題を作れる */
    try { q = M.empty(t.type, { points: 2 }); row.steps.empty = !!(q && q.type === t.type); }
    catch (e) { row.steps.empty = false; row.why.push("空の問題を作れない"); }
    /* ② 見本を作れる */
    if (q) {
      try {
        answer = fill(q);
        q = M.normalize(q);
        row.steps.sample = answer !== null;
        if (answer === null) row.why.push("見本の作り方が決まっていない");
      } catch (e) { row.steps.sample = false; row.why.push("見本を作れない: " + (e && e.message)); }
    }
    /* ②' 二度そろえても同じになるか。
       MODEL_VERSION を上げると、保存済みの問題が一度だけそろえ直される。
       そのとき中身が変わる形式があると、**作ってあるプリセットが壊れる**。
       ここが通っていれば、番号を上げても安全だと言える。 */
    if (row.steps.sample) {
      try {
        const again = M.normalize(JSON.parse(JSON.stringify(q)));
        row.steps.idempotent = JSON.stringify(again) === JSON.stringify(q);
        if (!row.steps.idempotent) row.why.push("二度そろえると中身が変わる");
      } catch (e) { row.steps.idempotent = false; row.why.push("二度そろえられない"); }
    }
    /* ③ 保存・出題の検証を通る */
    if (row.steps.sample) {
      try {
        const issues = [];
        V.checkQuestionRules(q, "q", issues, { requireAnswerable: true, requireRubric: true });
        const errs = issues.filter((i) => i.severity === "error" || i.level === "error");
        row.steps.validate = errs.length === 0;
        if (errs.length) row.why.push("検証で止まる: " + errs.map((e) => e.code).join(","));
      } catch (e) { row.steps.validate = false; row.why.push("検証で落ちる"); }
      /* 解けるか・点をつけられるか */
      try {
        const a = A.check(q, {});
        row.steps.answerable = a.ok;
        if (!a.ok) row.why.push("解けない: " + a.reason);
      } catch (e) { row.steps.answerable = false; }
    }
    /* ④ 編集できる */
    try {
      const COMMON = { single_choice: 1, multi_choice: 1, true_false: 1, free_text: 1, numeric_input: 1, text_input: 1 };
      row.steps.editor = !!(ED && ED.handles(q)) || !!COMMON[t.engine];
      if (!row.steps.editor) row.why.push("編集フォームが無い");
    } catch (e) { row.steps.editor = false; }
    /* ⑤ 表示できる */
    if (row.steps.sample) {
      try {
        const h = R.html(q, null, { mode: "practice" });
        row.steps.render = typeof h === "string" && h.length > 20 && !/この形式はまだ表示できません/.test(h);
        if (!row.steps.render) row.why.push("表示できない");
      } catch (e) { row.steps.render = false; row.why.push("表示で落ちる: " + (e && e.message)); }
    }
    /* ⑥ 採点できる（**正しい答えを入れたら満点になる**） */
    if (row.steps.sample) {
      try {
        const r = EV.evaluate(q, answer, {});
        const aiGraded = t.engine === "free_text" && !(q.settings && q.settings.aiGrading === false);
        if (aiGraded) {
          /* 記述は AI 採点へ回る。ここで 0 点を確定させないことが正しい。 */
          row.steps.evaluate = r.score === null || r.requiresManualReview === true;
          if (!row.steps.evaluate) row.why.push("記述なのに点を確定させている");
        } else {
          row.steps.evaluate = r.score === r.maxScore && r.isCorrect === true;
          if (!row.steps.evaluate) row.why.push("正しい答えで満点にならない（" + r.score + "/" + r.maxScore + " " + r.method + "）");
        }
      } catch (e) { row.steps.evaluate = false; row.why.push("採点で落ちる: " + (e && e.message)); }
    }
    /* ⑦ 結果画面で答えを再現できる */
    if (row.steps.sample) {
      try {
        const h = R.reviewHtml(q, answer, { mode: "review", showAnswer: true });
        row.steps.result = typeof h === "string" && h.length > 20;
        if (!row.steps.result) row.why.push("結果画面で再現できない");
      } catch (e) { row.steps.result = false; row.why.push("結果画面で落ちる"); }
    }
    /* ⑧ Insight で日本語の名前になる */
    const lab = Q.shortLabel(t.type);
    row.steps.insight = !!lab && !/_/.test(lab) && lab !== t.type;
    if (!row.steps.insight) row.why.push("表示名が内部 ID のまま");

    row.ok = ["empty", "sample", "validate", "answerable", "editor", "render", "evaluate", "result", "insight"]
      .every((k) => row.steps[k]);
    rows.push(row);
  });

  return { rows: rows, total: table.length,
           production: targets.length,
           byStatus: table.reduce((a, t) => { a[t.status] = (a[t.status] || 0) + 1; return a; }, {}) };
};

/* スマホでも表示できるか。実際に幅を変えて描き直す。 */
const MOBILE = (types) => {
  const M = VQ2.qmodel, R = VQ2.qrender, Q = VQ2.qtypes;
  const bad = [];
  types.forEach((t) => {
    try {
      const q = M.normalize(M.empty(t, { points: 2 }));
      const h = R.html(q, null, { mode: "practice", mobile: true });
      if (!h || h.length < 20) bad.push(t);
    } catch (e) { bad.push(t); }
  });
  return bad;
};

(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
  const pg = await ctx.newPage();
  const errs = [];
  pg.on("pageerror", (e) => errs.push(String(e).slice(0, 180)));
  await pg.goto(BASE + "/?vq2=all&vqdev=1&cb=" + Date.now(), { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(4200);
  await pg.evaluate(HIDE);
  await pg.waitForTimeout(600);

  const res = await pg.evaluate(CONTRACT);
  const bad = res.rows.filter((r) => !r.ok);

  console.log("── 形式の内訳 ──");
  Object.keys(res.byStatus).sort().forEach((k) => console.log("  " + k + ": " + res.byStatus[k]));
  console.log("  合計: " + res.total + " ／ 本番と判定: " + res.production);

  console.log("\n── 契約テスト ──");
  ok("本番の形式が 1 つ以上ある", res.production > 0, String(res.production));
  const STEPS = [
    ["empty", "空の問題を作れる"], ["sample", "見本を作れる"], ["idempotent", "二度そろえても同じ"],
    ["validate", "保存・出題の検証を通る"],
    ["answerable", "解ける・点をつけられる"], ["editor", "編集できる"], ["render", "表示できる"],
    ["evaluate", "正しい答えで満点になる"], ["result", "結果画面で答えを再現できる"], ["insight", "Insight で日本語の名前になる"]
  ];
  STEPS.forEach(([k, label]) => {
    const ng = res.rows.filter((r) => !r.steps[k]);
    ok(label + "（" + (res.production - ng.length) + "/" + res.production + "）", ng.length === 0,
       ng.slice(0, 4).map((r) => r.name + "：" + (r.why[0] || "")).join(" / "));
  });
  ok("本番と判定した形式がすべて契約を満たす", bad.length === 0,
     bad.slice(0, 6).map((r) => r.name + "(" + r.type + ")：" + (r.why[0] || "")).join(" / "));

  /* スマホ */
  await pg.setViewportSize({ width: 390, height: 844 });
  await pg.waitForTimeout(400);
  const mobBad = await pg.evaluate(MOBILE, res.rows.map((r) => r.type));
  ok("スマホでも表示できる", mobBad.length === 0, mobBad.slice(0, 5).join(","));

  ok("画面のエラーが出ていない", errs.length === 0, errs.slice(0, 2).join(" / "));

  /* 人が読む表を書き出す */
  const md = [];
  md.push("# 問題形式 対応表（契約テストの結果）");
  md.push("");
  md.push("`node vqcontract.cjs` が実画面で 1 形式ずつ確かめて書き出したもの。手で書いていない。");
  md.push("");
  md.push("| 状態 | 件数 |");
  md.push("|---|---|");
  Object.keys(res.byStatus).sort().forEach((k) => md.push("| " + k + " | " + res.byStatus[k] + " |"));
  md.push("| **合計** | **" + res.total + "** |");
  md.push("");
  md.push("## 本番と判定した形式（" + res.production + "）");
  md.push("");
  md.push("| 表示名 | 内部ID | Engine | 分類 | 空 | 見本 | 検証 | 解ける | 編集 | 表示 | 採点 | 結果 | Insight | 判定 |");
  md.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  const m = (v) => (v ? "○" : "×");
  res.rows.forEach((r) => {
    md.push("| " + [r.name, "`" + r.type + "`", r.engine, r.category,
      m(r.steps.empty), m(r.steps.sample), m(r.steps.validate), m(r.steps.answerable),
      m(r.steps.editor), m(r.steps.render), m(r.steps.evaluate), m(r.steps.result),
      m(r.steps.insight), r.ok ? "**合格**" : "要修正"].join(" | ") + " |");
  });
  if (bad.length) {
    md.push("");
    md.push("## 満たせなかったもの");
    md.push("");
    bad.forEach((r) => md.push("- **" + r.name + "**（`" + r.type + "`）… " + r.why.join(" / ")));
  }
  fs.writeFileSync("contract-report.md", md.join("\n") + "\n");
  console.log("\ncontract-report.md を書き出しました（" + res.rows.length + " 行）");

  await b.close();
  console.log("\n合格 " + pass + " / 不合格 " + fail);
  process.exit(fail ? 1 : 0);
})();
