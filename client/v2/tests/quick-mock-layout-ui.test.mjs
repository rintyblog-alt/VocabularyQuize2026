/* ══════════════════════════════════════════════════════════════════════
   Quick Mock §40 紙面デザインの選択 ／ §41 紙面の詳細設定

   ■ 直す前の状態（実測 2026-08-05）
     紙面デザインは左の畳んだ欄にセレクトが 1 つあるだけで、
       ・何が違うのか（用紙・書体・向いている教科・対応する形式）が出ない
       ・どれが実際に組めて、どれが「準備中」なのかも名前からは分からない
     「紙面」の段階には選ぶ場所そのものが無かった。

   ■ ここで確かめること
     A. 一覧の中身が layout-profiles.js の実物と 1 対 1 で一致すること。
        **「12 種そろっている」ことにしない。**
        resolveLayoutProfileId が null を返すものは「準備中」と言うこと。
     B. 説明・推奨用途・対応形式が、プロファイルに実在する値から作られること
        （宣伝文句を書き足していないこと）
     C. **紙面デザインを変えても AI が 1 回も呼ばれないこと**（絶対条件）
        本物のブラウザで、AI の入口を全部見張ってから 16 種すべてを押す。
     D. 変えても問題文・正解・選択肢・配点・番号が 1 文字も変わらないこと
     E. §41 の詳細設定が、Renderer が実際に読む値だけであること
        （効かない項目＝段組みを、入力欄として出していないこと）
   ══════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  installLocalStorage, installLocation, loadV2, V2,
  group, test, assert, assertEq, report
} from "./harness.mjs";
import { launch } from "./browser.mjs";

installLocalStorage();
installLocation("");
const VQ2 = loadV2([
  "qtypes", "qdescriptor", "schema", "qmodel", "validate", "adapter", "score-allocator",
  "grading", "evaluator", "blueprint", "answerability", "qplan", "capability",
  /* draft.js は mock-builder.js が読み込み時に掴むので、**先に**読む
     （後ろにすると fromDraft が estimateSeconds を引けずに落ちる）。 */
  "draft", "mock-builder", "mock-compiler", "flags"
].map((f) => "domain/" + f + ".js"));
new Function(readFileSync(join(V2, "pdf/templates.js"), "utf8")).call(globalThis);
new Function(readFileSync(join(V2, "pdf/layout-grammar.js"), "utf8")).call(globalThis);
new Function(readFileSync(join(V2, "pdf/layout-profiles.js"), "utf8")).call(globalThis);
new Function(readFileSync(join(V2, "pdf/layout.js"), "utf8")).call(globalThis);

const noop = () => "";
globalThis.document = { createElement: () => ({ style: {}, setAttribute() {}, addEventListener() {} }) };
VQ2.ui = {
  esc: (s) => String(s == null ? "" : s),
  icon: noop, button: noop, field: noop, mount: noop, on: noop, badge: noop, statusChip: noop,
  AiChat: function () {}
};
new Function(readFileSync(join(V2, "ui/quick-mock.js"), "utf8")).call(globalThis);

const QM = VQ2.quickMock, LPF = VQ2.layoutProfiles;
const QM_SRC = readFileSync(join(V2, "ui/quick-mock.js"), "utf8");
const CAT = QM._layoutCatalog();

/* ══════════════════════════════════════════════════════════════════ */
group("A. 一覧は layout-profiles.js の実物と一致する");

test("画面に出す一覧は visibleLayoutModes と同じ並び・同じ数", () => {
  const want = LPF.visibleLayoutModes().map((m) => m.id);
  assertEq(CAT.map((c) => c.id).join(","), want.join(","));
});

test("旧 ID（置き換え先があるもの）は一覧に出さない", () => {
  ["school-standard", "school-english-reading", "common-test"].forEach((id) => {
    assert(!CAT.some((c) => c.id === id), "旧 ID が出ています：" + id);
  });
});

test("「使えます」と言ってよいのは、実際に紙が変わるものだけ", () => {
  CAT.forEach((c) => {
    const real = !!LPF.resolveLayoutProfileId(c.id, null);
    if (c.badge === "使えます") assert(real, c.id + " は紙が変わらないのに「使えます」と出ています");
  });
});

test("実体の無いものは「準備中」と出す（動くふりをしない）", () => {
  CAT.filter((c) => c.id !== "current" && c.id !== "auto" && c.printable !== false)
    .forEach((c) => {
      const real = !!LPF.resolveLayoutProfileId(c.id, null);
      if (!real) assertEq(c.badge, "準備中", c.id + " が準備中と出ていません");
    });
});

test("いま実際に組めるのは 9 種（12 そろっていることにしない）", () => {
  const usable = CAT.filter((c) => c.usable && c.id !== "auto");
  assertEq(usable.length, 9, "組める数が変わりました：" + usable.map((c) => c.id).join(","));
  /* 準備中のものも名指しで固定する（黙って ready にしたら気づけるように）。 */
  const pending = CAT.filter((c) => c.badge === "準備中").map((c) => c.id).sort();
  assertEq(pending.join(","), "booklet,two-column,vertical-japanese,vocabulary-test");
});

test("紙ではないもの（画面受験）は、印刷しないと明示する", () => {
  const d = CAT.find((c) => c.id === "digital-mock");
  assertEq(d.printable, false);
  assertEq(d.badge, "紙ではありません");
});

test("「準備中」には、選んでもいまの紙面になることが書いてある", () => {
  CAT.filter((c) => c.badge === "準備中").forEach((c) => {
    assert(c.note.indexOf("いまの紙面のまま") >= 0, c.id + " に断りがありません：" + c.note);
  });
});

test("「いまの紙面」は準備中ではない（何も変えないだけ）", () => {
  const cur = CAT.find((c) => c.id === "current");
  assertEq(cur.badge, "いまの紙面");
});

/* ══════════════════════════════════════════════════════════════════ */
group("B. 説明はプロファイルの実値から作る");

test("説明に出る用紙・本文・行間が、プロファイルの値そのもの", () => {
  const c = CAT.find((x) => x.id === "standard-exam");
  const p = LPF.getProfile("exam-standard-a4");
  assert(c.description.indexOf(p.paper.size) >= 0, "用紙が出ていません：" + c.description);
  assert(c.description.indexOf("本文 " + p.typography.basePt + "pt") >= 0,
    "本文の大きさが出ていません：" + c.description);
  assert(c.description.indexOf("行間 " + p.typography.lineHeight) >= 0,
    "行間が出ていません：" + c.description);
});

test("推奨用途は supportedSubjects をそのまま使う（作文しない）", () => {
  const c = CAT.find((x) => x.id === "math-test");
  const p = LPF.getProfile(c.profileId);
  assertEq(c.subjects.join(","), p.supportedSubjects.join(","));
});

test("対応する問題形式は supportedQuestionTypes をそのまま使う", () => {
  const c = CAT.find((x) => x.id === "school-science-figure");
  const p = LPF.getProfile(c.profileId);
  assertEq(c.questionTypes.join(","), p.supportedQuestionTypes.join(","));
  assert(c.questionTypes.length > 0, "対応形式が空です");
});

test("向かない形式は、理由つきで出す（黙って落とさない）", () => {
  const c = CAT.find((x) => x.id === "school-science-figure");
  const p = LPF.getProfile(c.profileId);
  assertEq(c.unsupported.length, Object.keys(p.unsupportedQuestionTypes).length);
  c.unsupported.forEach((u) => assertEq(u.why, p.unsupportedQuestionTypes[u.type]));
  assert(c.unsupported.length > 0, "向かない形式が 1 つも無い見本を選んでいます（測れていません）");
});

test("実体の無い紙面には、説明を作らない（空のまま出す）", () => {
  const v = CAT.find((c) => c.id === "vertical-japanese");
  assertEq(v.profileId, null);
  assertEq(v.description, "");
  assertEq(v.questionTypes.length, 0);
});

test("§42 のおすすめは候補を返すだけ（設定を書き換えない）", () => {
  const spec = { subject: "数学", sections: [{ questions: [
    { type: "numeric", prompt: "1+1" }, { type: "formula", prompt: "x^2" },
    { type: "numeric", prompt: "2+2" }] }] };
  const recs = QM._layoutRecommendations(spec, 3);
  assert(recs.length > 0, "おすすめが 1 つも出ません");
  recs.forEach((r) => assert(!!r.modeId && !!r.name, "候補の形が壊れています"));
  /* 同じ入力なら同じ順（決定論）。 */
  assertEq(QM._layoutRecommendations(spec, 3).map((r) => r.modeId).join(","),
           recs.map((r) => r.modeId).join(","));
});

/* ══════════════════════════════════════════════════════════════════ */
group("C. 紙面デザインを変えても AI は走らない（純関数の側）");

test("選び直したときの動きに「作り直す」が入っていない", () => {
  LPF.LAYOUT_MODES.forEach((m) => {
    ["setup", "review", "artifacts"].forEach((step) => {
      const a = QM._layoutChangeActions("layoutMode", m.id, { step });
      assertEq(a.regenerate, false, m.id + " / " + step + " で作り直しになっています");
      assertEq(a.applyLayoutToSpec, true);
    });
  });
});

test("紙を組み直すのは、紙面ができているときだけ", () => {
  assertEq(QM._layoutChangeActions("layoutMode", "math-test", { step: "artifacts" }).rebuildPaper, true);
  assertEq(QM._layoutChangeActions("layoutMode", "math-test", { step: "review" }).rebuildPaper, false);
});

test("出力エンジンを選んだときだけ、その端末で使えるかを確かめに行く", () => {
  assertEq(QM._layoutChangeActions("outputEngine", "typst", {}).probeEngine, "typst");
  assertEq(QM._layoutChangeActions("outputEngine", "tex", {}).probeEngine, "tex");
  assertEq(QM._layoutChangeActions("layoutMode", "math-test", {}).probeEngine, null);
});

/* ══════════════════════════════════════════════════════════════════ */
group("E. §41 詳細設定は「効く値」だけ");

test("Renderer が読まない段組みを、入力欄として出していない", () => {
  assert(!/key: "t\.columns"/.test(QM_SRC), "効かない段組みの入力欄があります");
  assert(/本文の段組み（2 段に割る）は、/.test(QM_SRC), "段組みが準備中だと書いていません");
});

test("行間・文字の倍率・設問の間隔・解答欄は入力欄がある（Renderer が読む値）", () => {
  ["t.lineHeight", "t.fontScale", "t.questionGapMm", "t.answerLines", "t.answerBoxWidth"]
    .forEach((k) => {
      assert(QM_SRC.indexOf('key: "' + k + '"') >= 0, k + " の入力欄がありません");
    });
});

test("解答欄の大きさは、効く体裁のときだけ出す", () => {
  /* 別紙の解答用紙では、行数は設問ごとの解答定義が決めていて
     ここの値は通らない（layout.js:427）。出しっぱなしにしない。 */
  assert(/inlineAnswerTemplate\(\)\s*\n?\s*\?/.test(QM_SRC),
    "解答欄の入力欄を、体裁で出し分けていません");
  assert(/この体裁では変えられません/.test(QM_SRC), "変えられない理由を書いていません");
});

test("入力欄の値は layout.js の TUNABLES の範囲に収まっている", () => {
  /* layout.js は範囲外を丸める。画面がそれより広い範囲を出すと、
     入れた値と紙面が食い違う（入れたのに効かない）。 */
  const want = { "t.lineHeight": [1.5, 2.2], "t.fontScale": [0.9, 1.15],
                 "t.questionGapMm": [4, 16], "t.answerLines": [1, 30],
                 "t.answerBoxWidth": [20, 100] };
  Object.keys(want).forEach((k) => {
    const re = new RegExp('key: "' + k.replace(".", "\\.") + '"[^}]*?min: ([\\d.]+), max: ([\\d.]+)');
    const m = QM_SRC.match(re);
    assert(m, k + " の範囲が読めません");
    assertEq(Number(m[1]), want[k][0], k + " の下限");
    assertEq(Number(m[2]), want[k][1], k + " の上限");
  });
});

test("右の余白に入力欄がある（設定にあるのに触れないままだった）", () => {
  assert(QM_SRC.indexOf('key: "marginRight"') >= 0, "右の余白の入力欄がありません");
});

test("入力欄に出した値が、本当に紙面へ届く（行間・文字の倍率・設問の間隔）", () => {
  const draft = {
    title: "見本", subject: "理科", durationMinutes: 50, totalScore: 100,
    sections: [{ name: "大問1", score: 100, questions: [
      { id: "1", type: "descriptive", question: "説明せよ。", points: 100, choices: [],
        expectedChars: 120 }] }],
    answerKey: [{ id: "1", answer: "a", explanation: "e" }]
  };
  const spec = VQ2.mockBuilder.fromDraft(draft, {});
  const base = VQ2.layout.buildPlan(spec, { tuning: {} });
  const tuned = VQ2.layout.buildPlan(spec, {
    tuning: { lineHeight: 2.1, fontScale: 1.1, questionGapMm: 15 } });
  assert(tuned.lineHeight !== base.lineHeight, "行間が紙面に届いていません");
  assertEq(tuned.lineHeight, 2.1);
  assertEq(tuned.fontScale, 1.1);
  assertEq(tuned.questionGapMm, 15);
});

test("解答欄の行数と幅は、問題用紙に解答欄を置く体裁でだけ紙面へ届く", () => {
  const draft = {
    title: "見本", subject: "理科", durationMinutes: 50, totalScore: 100,
    sections: [{ name: "大問1", score: 100, questions: [
      { id: "1", type: "descriptive", question: "説明せよ。", points: 100, choices: [],
        expectedChars: 120 }] }],
    answerKey: [{ id: "1", answer: "a", explanation: "e" }]
  };
  const cells = (templateId, tuning) => {
    const spec = VQ2.mockBuilder.fromDraft(draft, {});
    spec.paper = Object.assign({}, spec.paper, { templateId });
    const out = [];
    (VQ2.layout.buildPlan(spec, { tuning }).booklets || []).forEach((b) =>
      (b.blocks || []).forEach((x) => { if (x.type === "answer-area") out.push(x); }));
    return out;
  };
  /* 効く体裁（問題用紙の中に解答欄を置く） */
  const inl0 = cells("short-quiz", {});
  const inl1 = cells("short-quiz", { answerLines: 12, answerBoxWidth: 55 });
  assert(inl0.length > 0, "解答欄を持つ紙面を作れていません");
  assert(inl1.some((c) => c.lines === 12), "解答欄の行数が届いていません");
  assert(inl1.some((c) => c.widthPct === 55), "解答欄の幅が届いていません");
  assert(!inl0.some((c) => c.lines === 12), "指定しなくても 12 行になっています（測れていません）");

  /* 効かない体裁（別紙の解答用紙）。だから画面にも出さない。 */
  const sep = cells("standard-school-exam", { answerLines: 12, answerBoxWidth: 55 });
  assert(sep.length > 0, "別紙の解答用紙を作れていません");
  assert(!sep.some((c) => c.lines === 12),
    "別紙でも効くようになりました（画面の出し分けを見直すこと）");
});

test("紙面デザインが決めているもの（配点表示・氏名欄）は入力欄にしない", () => {
  assert(!/key: "showPoints"/.test(QM_SRC), "効かない配点表示の入力欄があります");
  assert(!/key: "showNameBox"/.test(QM_SRC), "効かない氏名欄の入力欄があります");
  assert(/紙面デザインが決めているもの/.test(QM_SRC), "いまどうなっているかを見せていません");
});

/* ══════════════════════════════════════════════════════════════════
   C'（本命）本物のブラウザで、全部の紙面デザインを押してみる
   ══════════════════════════════════════════════════════════════════ */
group("C'. 画面で選び直しても AI は 1 回も走らない");

const B = await launch();
if (!B) {
  test("Playwright が無いので確かめられない", () => {
    assert(false, "playwright が入っていないため、AI が走らないことを確かめられませんでした");
  });
} else {
  const page = await B.page({ width: 1280, height: 900 });
  const out = await page.evaluate(async () => {
    const V = window.VQ2;

    /* 1) 本物の MockSpec を作って保存する */
    const draft = {
      title: "理科 期末考査", subject: "理科", grade: "中2",
      durationMinutes: 50, totalScore: 100,
      sections: [
        { name: "大問1", score: 60, questions: [
          { id: "1", type: "multiple_choice", question: "光合成に必要なものは？", points: 30,
            choices: [{ id: "a", text: "光" }, { id: "b", text: "音" }], topic: "植物" },
          { id: "2", type: "short_answer", question: "気孔の役割は？", points: 30, choices: [], topic: "植物" }
        ] },
        { name: "大問2", score: 40, questions: [
          { id: "3", type: "descriptive", question: "蒸散の仕組みを説明せよ。", points: 40,
            choices: [], topic: "植物", expectedChars: 100 }
        ] }
      ],
      answerKey: [
        { id: "1", answer: "a", explanation: "光が要ります。" },
        { id: "2", answer: "気体の出入り口", explanation: "蒸散もここから。" },
        { id: "3", answer: "根から吸った水が…", explanation: "気孔から出ます。" }
      ]
    };
    const spec = V.mockBuilder.fromDraft(draft, {});
    V.store.mocks.put({ id: spec.id, spec });

    /* 2) AI の入口を全部見張る。**呼ばれたら記録して、必ず落とす。** */
    const calls = [];
    Object.keys(V.ai).forEach((k) => {
      if (typeof V.ai[k] !== "function") return;
      V.ai[k] = function () {
        calls.push(k);
        return Promise.reject(new Error("AI を呼んではいけない場面で呼ばれました：" + k));
      };
    });

    const app = V.quickMock.open({ mockId: spec.id });
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const snap = () => JSON.stringify(V.store.mocks.get(spec.id).spec.sections);
    /* 画面が持っている spec（保存前）も見る。保存だけ無事でも意味がない。 */
    const before = snap();

    /* 3) 「紙面」の段階へ移る */
    app.root.querySelector('[data-step="paper"]').click();
    await wait(80);
    const cards = app.root.querySelectorAll('[data-act="qm-layout"]');
    const paperText = app.root.textContent;

    /* 4) 一覧のカードを全部押す。
       押したあとに画面が作り直され（＝生成が走り）カードが消えることがあるので、
       ID を先に控えて 1 つずつ引き直す。**消えたら消えたと記録する。** */
    const ids = Array.prototype.map.call(cards, (c) => c.getAttribute("data-id"));
    const pressed = [], missing = [];
    for (const id of ids) {
      const el = app.root.querySelector('[data-act="qm-layout"][data-id="' + id + '"]');
      if (!el) { missing.push(id); continue; }
      el.click();
      pressed.push(id);
      await wait(20);
    }
    await wait(150);

    /* 5) 押したあとの中身 */
    const after = JSON.stringify(V.store.mocks.get(spec.id).spec.sections);
    return { calls, pressed, missing, cardCount: cards.length, before, after, paperText,
             specId: spec.id };
  });

  test("画面が例外を出していない", () => {
    assertEq((page.__vqErrors || []).join(" / "), "");
  });

  test("紙面の段階に、紙面デザインの一覧が並ぶ", () => {
    assertEq(out.cardCount, CAT.length, "カードの数が一覧と違います");
    assert(out.paperText.indexOf("紙面デザイン") >= 0, "見出しがありません");
  });

  test("一覧に、説明・推奨用途・対応形式・準備中が出ている", () => {
    assert(out.paperText.indexOf("向いている教科：") >= 0, "推奨用途が出ていません");
    assert(out.paperText.indexOf("対応する問題形式：") >= 0, "対応形式が出ていません");
    assert(out.paperText.indexOf("準備中") >= 0, "準備中の印が出ていません");
    assert(out.paperText.indexOf("いまの Renderer が実際に組めるのは 9 種") >= 0,
      "実際に組める数を出していません");
  });

  test("16 種すべてを押した（測れていることの確認）", () => {
    assertEq(out.missing.join(","), "", "押す前に一覧から消えました：" + out.missing.join(","));
    assertEq(out.pressed.length, CAT.length);
    assertEq(out.pressed.join(","), CAT.map((c) => c.id).join(","));
  });

  test("紙面デザインを変えても AI は 1 回も呼ばれない（絶対条件）", () => {
    assertEq(out.calls.join(","), "", "AI が呼ばれました：" + out.calls.join(","));
  });

  test("問題文・正解・選択肢・配点・番号が 1 文字も変わらない", () => {
    assertEq(out.after, out.before, "設問の中身が変わりました");
  });

  await B.close();
}

process.exit(report("Quick Mock 紙面デザインの選択と詳細設定") ? 1 : 0);
