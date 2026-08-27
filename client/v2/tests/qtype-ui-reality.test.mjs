/* ══════════════════════════════════════════════════════════════════════
   §2-3「並び替えが本当に並び替えの UI として出るか」

   訴え：「『並び替えなさい』と問題文には書いてあるのに、
           答えるところは記述の入力欄になっている」

   だから、ここでは **文字列を grep しない**。
   本物のブラウザに描かせて、**できあがった DOM を見る**。
     ・並び替え → 順番の並んだ札（ol.vq2-sort）と、上下へ動かすボタンがあるか
     ・組み合わせ → 左右の札があり、右は落とし先になっているか
     ・分類     → 箱（グループ）と、まだ分けていない置き場があるか
     ・そして **入力欄（input / textarea）が出ていないこと**（＝訴えそのもの）

   問題は決め打ちで作らない。AI の出力を取り込む本物の経路
   （qplan.fromAi）を通したものを描く。

   さらに、紙（Quick Mock）についても実測する。
     ・印刷経路（layout + pdfRenderer）へ実際に流して、
       並べる語・左右の対応・分類の箱が紙面に出るかを見る
     ・capability の申告（mockSupported / paperContentOk）が
       **その実測と一致している**ことを確かめる
   こうしておけば、紙面を組む側が中身を刷れるようになった日に
   このテストは自動で新しい事実に付いていく（嘘の固定値を書かない）。

   実行: node client/v2/tests/qtype-ui-reality.test.mjs
   ══════════════════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  installLocalStorage, installLocation, loadV2, V2,
  group, test, assert, assertEq, report
} from "./harness.mjs";

installLocalStorage();
installLocation("");

const VQ2 = loadV2([
  "qtypes", "qdescriptor", "schema", "qmodel", "validate", "adapter", "score-allocator",
  "grading", "evaluator", "blueprint", "answerability", "qplan", "capability", "flags"
].map((f) => "domain/" + f + ".js"));

/* 紙の層。ここまで読み込んで初めて「紙に出るか」を実測できる。 */
for (const f of ["pdf/templates.js", "pdf/layout-grammar.js", "pdf/layout-profiles.js",
                 "pdf/layout.js", "pdf/renderer.js"]) {
  new Function(readFileSync(join(V2, f), "utf8"), ).call(globalThis);
}

/* 画面の層。ボタンや印は本物（shell.js）を使う。作り物のボタンを数えても意味が無い。 */
globalThis.document = { createElement: () => ({ style: {}, setAttribute() {}, addEventListener() {}, appendChild() {} }) };
new Function(readFileSync(join(V2, "ui/shell.js"), "utf8")).call(globalThis);
new Function(readFileSync(join(V2, "ui/question-renderer.js"), "utf8")).call(globalThis);
new Function(readFileSync(join(V2, "ui/qtype-editor.js"), "utf8")).call(globalThis);

const P = VQ2.qplan, C = VQ2.capability, R = VQ2.qrender, S = VQ2.schema, M = VQ2.qmodel;
C._clear();

/* ── AI の出力を、本物の取り込み経路で 1 問にする ───────────────── */
function make(raw) { return P.fromAi(raw, {}); }

const Q_REORDER = make({
  type: "reorder_english", question: "次の語を並び替えて正しい英文にしなさい。",
  items: ["I", "am", "a", "student"], points: 10
});
const Q_MATCH = make({
  type: "matching", question: "対応するものを結びなさい。",
  pairs: [{ left: "日本", right: "東京" }, { left: "フランス", right: "パリ" }], points: 10
});
/* 形は qplan.SHAPE.classification（AI へ見せている例）と同じにする。 */
const Q_CLASS = make({
  type: "classification", question: "次の語を仲間ごとに分けなさい。",
  groups: ["動物", "植物"],
  items: [{ text: "犬", group: "動物" }, { text: "猫", group: "動物" },
          { text: "松", group: "植物" }, { text: "杉", group: "植物" }],
  points: 10
});
const Q_TEXT = make({
  type: "short_answer", question: "日本の首都はどこですか。", answer: "東京", points: 10
});

/* ══════════════════════════════════════════════════════════════════
   0. 取り込みの時点で形式が保たれているか（ここが崩れると以降が無意味）
   ══════════════════════════════════════════════════════════════════ */
group("0. 取り込んだ時点の形式");
test("並び替えの依頼は reorder のまま入る", () => {
  assertEq(Q_REORDER.engine, "reorder", "type=" + Q_REORDER.type);
  assert(Q_REORDER.orderItems && Q_REORDER.orderItems.length === 4,
    "並べる語が " + ((Q_REORDER.orderItems || []).length) + " 個しか入っていない");
});
test("組み合わせの依頼は matching のまま入る", () => {
  assertEq(Q_MATCH.engine, "matching", "type=" + Q_MATCH.type);
  assertEq((Q_MATCH.pairs && Q_MATCH.pairs.left || []).length, 2);
});
test("分類の依頼は classification のまま入る", () => {
  assertEq(Q_CLASS.engine, "classification", "type=" + Q_CLASS.type);
  assertEq((Q_CLASS.classification && Q_CLASS.classification.groups || []).length, 2);
});

/* ══════════════════════════════════════════════════════════════════
   1. 本物のブラウザで描いて、DOM を見る
   ══════════════════════════════════════════════════════════════════ */
let chromium = null;
try { ({ chromium } = await import("playwright")); } catch (e) { chromium = null; }

group("1. 画面（本物の DOM で確かめる）");

if (!chromium) {
  test("Playwright が無いので画面を確かめられない", () => {
    assert(false, "playwright が入っていないため、DOM を作って確かめられませんでした");
  });
} else {
  const CASES = [
    { key: "reorder", q: Q_REORDER },
    { key: "matching", q: Q_MATCH },
    { key: "classification", q: Q_CLASS },
    { key: "text", q: Q_TEXT }
  ];
  const PAGE = "<!doctype html><html><head><meta charset=\"utf-8\"></head><body>"
    + CASES.map((c) => '<div id="' + c.key + '">' + R.html(c.q, null, {}) + "</div>").join("")
    + "</body></html>";
  const dir = mkdtempSync(join(tmpdir(), "vq2-qtype-ui-"));
  const file = join(dir, "render.html");
  writeFileSync(file, PAGE, "utf8");

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  await page.goto("file://" + file);

  /* DOM をそのまま測る。innerHTML は返さない（文字列で判定させないため）。 */
  const seen = await page.evaluate(() => {
    function look(id) {
      const root = document.getElementById(id);
      const sortList = root.querySelector("ol.vq2-sort");
      const sortItems = [...root.querySelectorAll("ol.vq2-sort > li[data-drag-id]")];
      return {
        exists: !!root,
        /* 並び替え */
        hasSortList: !!sortList,
        sortItemCount: sortItems.length,
        sortTexts: sortItems.map((li) => (li.querySelector(".vq2-sort-t") || {}).textContent || ""),
        sortNumbers: sortItems.map((li) => (li.querySelector(".vq2-sort-n") || {}).textContent || ""),
        upDownButtons: root.querySelectorAll('button[data-act="qr-up"], button[data-act="qr-down"]').length,
        dropZones: root.querySelectorAll("[data-drop-zone]").length,
        /* 組み合わせ */
        leftCount: root.querySelectorAll("[data-match-left]").length,
        rightCount: root.querySelectorAll("[data-match-right]").length,
        leftTexts: [...root.querySelectorAll("[data-match-left] .vq2-match-t")].map((e) => e.textContent),
        rightTexts: [...root.querySelectorAll("[data-match-right] .vq2-match-t")].map((e) => e.textContent),
        rightAreDropZones: [...root.querySelectorAll("[data-match-right]")]
          .every((e) => e.hasAttribute("data-drop-zone")),
        /* 分類 */
        groupBoxes: root.querySelectorAll(".vq2-cls-g[data-drop-zone]").length,
        groupLabels: [...root.querySelectorAll(".vq2-cls-gh")].map((e) => e.firstChild ? e.firstChild.textContent : ""),
        poolItems: root.querySelectorAll('.vq2-cls-pool [data-drag-id]').length,
        /* 訴えそのもの：記述の入力欄が出ていないか */
        textareas: root.querySelectorAll("textarea").length,
        textInputs: root.querySelectorAll('input[type="text"], input:not([type])').length,
        /* 代わりの表示に落ちていないか */
        fallbacks: root.querySelectorAll("[data-qr-fallback]").length
      };
    }
    return { reorder: look("reorder"), matching: look("matching"),
             classification: look("classification"), text: look("text") };
  });
  await browser.close();

  const r = seen.reorder, m = seen.matching, c = seen.classification, t = seen.text;

  test("並び替え：代わりの表示に落ちていない", () => assertEq(r.fallbacks, 0));
  test("並び替え：順番の付いた札が 4 枚出る", () => {
    assert(r.hasSortList, "ol.vq2-sort が DOM に無い");
    assertEq(r.sortItemCount, 4, "札の数");
  });
  test("並び替え：札に並べる語が入っている", () => {
    const got = r.sortTexts.slice().sort().join(",");
    assertEq(got, ["I", "a", "am", "student"].sort().join(","), "札の中身");
  });
  test("並び替え：札に 1〜4 の位置が振られている", () => {
    assertEq(r.sortNumbers.join(","), "1,2,3,4");
  });
  test("並び替え：上下へ動かすボタンが札の数だけある", () => {
    assertEq(r.upDownButtons, 8, "上下ボタンの数（4 枚 × 2）");
  });
  test("並び替え：札そのものが落とし先になっている（運んで並べ替えられる）", () => {
    assertEq(r.dropZones, 4);
  });
  /* ← これが訴えの本体。並び替えなのに入力欄が出ていたら赤にする。 */
  test("並び替え：記述の入力欄は出ない（訴えの再発防止）", () => {
    assertEq(r.textareas, 0, "textarea が " + r.textareas + " 個出ている");
    assertEq(r.textInputs, 0, "テキスト入力欄が " + r.textInputs + " 個出ている");
  });

  test("組み合わせ：代わりの表示に落ちていない", () => assertEq(m.fallbacks, 0));
  test("組み合わせ：左が 2 つ・右が 2 つ出る", () => {
    assertEq(m.leftCount, 2, "左");
    assertEq(m.rightCount, 2, "右");
  });
  test("組み合わせ：左右に中身が入っている", () => {
    assertEq(m.leftTexts.slice().sort().join(","), ["日本", "フランス"].sort().join(","));
    assertEq(m.rightTexts.slice().sort().join(","), ["東京", "パリ"].sort().join(","));
  });
  test("組み合わせ：右はすべて落とし先になっている（線で結べる）", () => {
    assert(m.rightAreDropZones, "右の札に data-drop-zone が付いていない");
  });
  test("組み合わせ：記述の入力欄は出ない", () => {
    assertEq(m.textareas, 0);
    assertEq(m.textInputs, 0);
  });

  test("分類：代わりの表示に落ちていない", () => assertEq(c.fallbacks, 0));
  test("分類：箱が 2 つ出て、それぞれ落とし先になっている", () => {
    assertEq(c.groupBoxes, 2);
  });
  test("分類：箱の名前が出ている", () => {
    assertEq(c.groupLabels.slice().sort().join(","), ["動物", "植物"].sort().join(","));
  });
  test("分類：まだ分けていない札が 4 枚ある", () => assertEq(c.poolItems, 4));
  test("分類：記述の入力欄は出ない", () => {
    assertEq(c.textareas, 0);
    assertEq(c.textInputs, 0);
  });

  /* 対照実験。入力欄が出る形式ではちゃんと出る＝上の 0 件は
     「そもそも何も出ていない」ではないことを示す。 */
  test("対照：短答では入力欄が 1 つ出る（0 件が偶然でないことの裏取り）", () => {
    assertEq(t.textInputs + t.textareas, 1, "短答に入力欄が出ていない");
    assertEq(t.hasSortList, false, "短答なのに並び替えの札が出ている");
  });
}

/* ══════════════════════════════════════════════════════════════════
   2. §31 の検証（表示・採点・印刷の互換を、生成後に 1 問ずつ確かめる）
   ══════════════════════════════════════════════════════════════════ */
group("2. 生成後の検証（capability.verify）");

test("並び替え：表示できて、正解を入れれば満点になる", () => {
  const v = C.verify(Q_REORDER, {});
  assert(v.ok, "理由: " + v.reason);
  assertEq(v.render.operationUi, true, "並び替えの操作 UI が出ていない");
  assertEq(v.evaluate.correct, true, "正解を入れても丸にならない");
  assertEq(v.evaluate.score, v.evaluate.maxScore, "満点にならない");
});
test("組み合わせ：表示できて、正解を入れれば満点になる", () => {
  const v = C.verify(Q_MATCH, {});
  assert(v.ok, "理由: " + v.reason);
  assertEq(v.render.operationUi, true);
  assertEq(v.evaluate.score, v.evaluate.maxScore);
});
test("分類：表示できて、正解を入れれば満点になる", () => {
  const v = C.verify(Q_CLASS, {});
  assert(v.ok, "理由: " + v.reason);
  assertEq(v.render.operationUi, true);
  assertEq(v.evaluate.score, v.evaluate.maxScore);
});
test("表示のしくみが無い形式は、その理由で止まる", () => {
  const broken = Object.assign({}, Q_REORDER, { engine: "no_such_engine" });
  const v = C.verify(broken, {});
  assertEq(v.ok, false);
  assert(v.issues.some((i) => i.code === "renderIncompatible"), JSON.stringify(v.issues));
});
test("中身が壊れていて代わりの表示になる問題は、通さない", () => {
  /* 表が無い「表の完成」。描くと代わりの表示になる。 */
  const q = M.empty("table_fill", { points: 5 });
  q.prompt = "表を完成させなさい。";
  q.table = null;
  const v = C.verify(q, {});
  assertEq(v.ok, false);
  assertEq(v.render.fallback, true, "代わりの表示に落ちていない");
});

/* ══════════════════════════════════════════════════════════════════
   3. 紙（実測と申告が一致しているか）
   ══════════════════════════════════════════════════════════════════ */
group("3. 紙に本当に出るか（印刷経路をそのまま通す）");

/* 印刷経路へ 1 問だけ流して、指定の文字が紙面に出るかを見る。 */
function printedTexts(q, needles) {
  const qq = Object.assign(JSON.parse(JSON.stringify(q)),
    { id: "q1", sectionId: "s1", number: 1, answerBindingId: "b1" });
  const spec = {
    id: "m1", schemaVersion: 2, ownerId: "local", title: "確認", subject: "英語", grade: "高1",
    audience: "高1", durationMinutes: 50, totalPoints: 10, instructions: "",
    sourceMode: "source-only", sourceReferences: [], paper: S.defaultPaper(),
    sections: [{ id: "s1", number: 1, title: "大問1", instructions: "", points: 10, questions: [qq] }],
    answerBindings: [{ id: "b1", questionId: "q1", number: "1", inputType: "short_answer", points: 10 }]
  };
  const html = VQ2.pdfRenderer.buildHtml(spec, VQ2.layout.buildPlan(spec, {}), { bookletId: "question-booklet" });
  return needles.filter((n) => html.indexOf(n) >= 0);
}

test("印刷の層は読み込めている（読み込めていないなら確かめたと言わない）", () => {
  assertEq(C.paperReady(), true, "layout / pdfRenderer が無い");
});

/* 対照：4 択は選択肢が紙に出る（＝この測り方そのものは正しく動く） */
test("対照：4 択の選択肢は紙に出る（測り方が正しいことの裏取り）", () => {
  const q = make({ type: "multiple_choice_single", question: "日本の首都はどこですか。",
    choices: [{ text: "紙確認トウキョウ" }, { text: "紙確認オオサカ" }], correctIndex: 0, points: 10 });
  const hit = printedTexts(q, ["紙確認トウキョウ", "紙確認オオサカ"]);
  assertEq(hit.length, 2, "4 択の選択肢すら紙に出ていない（測り方が壊れている）");
});

/* ここは「出る／出ない」を決め打ちしない。**実測と申告が一致するか**を見る。 */
const PAPER_CASES = [
  { name: "並び替え（並べる語）", q: Q_REORDER, needles: ["student", "am"], engine: "reorder" },
  { name: "組み合わせ（左右の項目）", q: Q_MATCH, needles: ["フランス", "パリ"], engine: "matching" },
  { name: "分類（箱の名前と札）", q: Q_CLASS, needles: ["動物", "松"], engine: "classification" }
];
for (const cse of PAPER_CASES) {
  test(cse.name + "：紙面の実測と capability の申告が一致する", () => {
    const hit = printedTexts(cse.q, cse.needles);
    const reallyPrinted = hit.length === cse.needles.length;
    const claimed = C.paperCarriesContent(cse.engine, cse.q.type);
    assertEq(claimed, reallyPrinted,
      "capability は " + claimed + " と言っているが、実際に刷ると " + reallyPrinted
      + "（出た文字: " + JSON.stringify(hit) + "）");
  });
  test(cse.name + "：紙に出ないなら試験の候補にも出さない", () => {
    const claimed = C.paperCarriesContent(cse.engine, cse.q.type);
    const inMock = C.forAi({ mock: true }).indexOf(cse.q.type) >= 0;
    if (claimed === false) {
      assertEq(inMock, false, cse.q.type + " は紙に出ないのに試験の候補に入っている（動くふり）");
      const r = C.resolve(cse.q.type, { mock: true });
      assertEq(r.ok, false);
      assert(/紙面/.test(r.reason || ""), "断る理由が紙面の話になっていない: " + r.reason);
    } else {
      assertEq(inMock, true, cse.q.type + " は紙に出るのに試験の候補から外れている");
    }
  });
}

test("紙に出ない形式は verify({mock:true}) でも止まる", () => {
  const claimed = C.paperCarriesContent("reorder", Q_REORDER.type);
  const v = C.verify(Q_REORDER, { mock: true });
  if (claimed === false) {
    assertEq(v.ok, false, "紙に出ないのに試験用の検証を通してしまう");
    assert(v.issues.some((i) => i.code === "paperMissingContent"), JSON.stringify(v.issues));
  } else {
    assertEq(v.ok, true, "紙に出るのに止めてしまう: " + v.reason);
  }
});

test("画面だけなら並び替えは通る（紙の都合で画面まで殺していない）", () => {
  assertEq(C.verify(Q_REORDER, {}).ok, true);
  assert(C.forAi({}).indexOf(Q_REORDER.type) >= 0, "ふだんの出題からも消えている");
});

/* ══════════════════════════════════════════════════════════════════
   4. 編集できるか（形式ごとのフォームがあるか）
   ══════════════════════════════════════════════════════════════════ */
group("4. 編集フォーム");
for (const [name, q] of [["並び替え", Q_REORDER], ["組み合わせ", Q_MATCH], ["分類", Q_CLASS]]) {
  test(name + "：形式ごとの編集フォームがある", () => {
    assertEq(VQ2.qtypeEditor.handles(q), true, q.type + " の編集フォームが無い");
  });
}

/* ══════════════════════════════════════════════════════════════════
   5. 表示の印（ENGINE_MARK）が実際の出力と合っているか
      ここがずれると、verify がずっと嘘の合格を出し続ける。
   ══════════════════════════════════════════════════════════════════ */
group("5. 表示の印が実物と合っている");
test("印を決めたエンジンは、すべて実在のレンダラを持つ", () => {
  const marks = Object.keys(R.ENGINE_MARK);
  const missing = marks.filter((e) => !R.RENDERERS[e]);
  assertEq(missing.join(","), "", "存在しないエンジンの印がある");
});
test("レンダラのあるエンジンには、すべて印が決まっている", () => {
  const missing = Object.keys(R.RENDERERS).filter((e) => !R.ENGINE_MARK[e]);
  assertEq(missing.join(","), "", "印の無いエンジンがある（verify が判定できない）");
});

process.exit(report("並び替え・組み合わせ・分類が本当にその UI で出るか") ? 1 : 0);
