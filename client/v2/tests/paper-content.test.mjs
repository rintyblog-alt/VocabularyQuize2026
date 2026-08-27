/* 紙に「解くのに要る中身」が本当に出るか

   ── なぜこのテストが要るか（2026-08-05 の実測）──────────────
   ユーザーの訴えに「『並び替えなさい』と問題文には書かれているが、
   実際の回答 UI は記述入力欄になっている」があった。
   調べると、**紙のほうはもっと悪かった**。

     pdf/renderer.js は問題文と選択肢しか刷っていなかった。
     orderItems（並べる語）・pairs（左右の対応）・classification（分類の箱）・
     table（うめる表）は pdf/ 配下のどこからも読まれていなかった（grep で 0 件）。

   その結果、並び替えの問題は「並び替えなさい」とだけ書かれた紙になり、
   **並べる語が 1 つも印刷されなかった＝解けない紙**が出ていた。
   組み合わせ・分類・表うめも同じ。

   ここでは、
     ・形式ごとの中身が紙へ出ること
     ・**正解の順では出ないこと**（そのまま答えになる）
     ・画面と紙で並び順が同じであること（同じ問題として扱えなくなる）
   を確かめる。 */
import { installLocalStorage, installLocation, loadV2, group, test, assert, assertEq, report }
  from "./harness.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { V2 } from "./harness.mjs";

installLocalStorage();
installLocation("");
const VQ2 = loadV2([
  "domain/qtypes.js", "domain/qdescriptor.js", "domain/schema.js", "domain/qmodel.js",
  "domain/validate.js", "domain/adapter.js", "domain/score-allocator.js",
  "pdf/templates.js", "pdf/layout-grammar.js", "pdf/layout-profiles.js",
  "pdf/layout.js", "pdf/renderer.js"
]);

const S = VQ2.schema, M = VQ2.qmodel, L = VQ2.layout, R = VQ2.pdfRenderer;

/* 1 問だけの試験を組んで、問題冊子の HTML を返す。 */
function paperOf(type, fill) {
  const q = M.empty(type, { points: 10 });
  q.id = "q1"; q.sectionId = "s1"; q.number = 1; q.answerBindingId = "b1";
  q.prompt = "つぎの問いに答えなさい。"; q.explanation = "解説";
  fill(q);
  const spec = {
    id: "probe", schemaVersion: 2, ownerId: "local", title: "確認",
    subject: "", grade: "", audience: "", durationMinutes: 50, totalPoints: 10,
    instructions: "", sourceMode: "source-only", sourceReferences: [],
    paper: S.defaultPaper(),
    sections: [{ id: "s1", number: 1, title: "大問1", instructions: "", points: 10, questions: [q] }],
    answerBindings: [{ id: "b1", questionId: "q1", number: "1", inputType: "short_answer", points: 10 }]
  };
  const plan = L.buildPlan(spec, {});
  return { html: String(R.buildHtml(spec, plan, { bookletId: "question-booklet" })), plan, q };
}
/* plan のどこかにある指定の型のブロックを探す（構造に依存しない） */
function findBlock(node, type) {
  if (!node || typeof node !== "object") return null;
  if (node.type === type) return node;
  for (const k of Object.keys(node)) {
    const r = findBlock(node[k], type);
    if (r) return r;
  }
  return null;
}

group("形式ごとの中身が紙に出る");
{
  test("並び替え：並べる語が紙に出る", () => {
    const { html } = paperOf("ordering", (q) => {
      q.orderItems = [{ id: "i1", text: "went", order: 1 }, { id: "i2", text: "I", order: 2 },
                      { id: "i3", text: "school", order: 3 }];
      q.correctOrder = ["i2", "i1", "i3"];
    });
    assert(html.indexOf("went") >= 0 && html.indexOf("school") >= 0,
      "並べる語が紙に出ていません（解けない紙になります）");
  });
  test("英文並び替えも同じく出る", () => {
    const { html } = paperOf("reorder_english", (q) => {
      q.orderItems = [{ id: "i1", text: "apple", order: 1 }, { id: "i2", text: "an", order: 2 }];
      q.correctOrder = ["i2", "i1"];
    });
    assert(html.indexOf("apple") >= 0 && html.indexOf("an") >= 0);
  });
  test("組み合わせ：左と右の両方が出る", () => {
    const { html } = paperOf("matching", (q) => {
      q.pairs = { left: [{ id: "L1", text: "犬" }], right: [{ id: "R1", text: "dog" }],
                  correct: { L1: "R1" } };
    });
    assert(html.indexOf("犬") >= 0 && html.indexOf("dog") >= 0);
  });
  test("分類：分類する語と、分類先の箱が出る", () => {
    const { html } = paperOf("classification", (q) => {
      q.classification = { groups: [{ id: "g1", label: "哺乳類" }],
                           items: [{ id: "t1", text: "クジラ", groupId: "g1" }] };
    });
    assert(html.indexOf("哺乳類") >= 0 && html.indexOf("クジラ") >= 0);
  });
  test("表うめ：表の見出しと行が出る", () => {
    const { html } = paperOf("table_fill", (q) => {
      q.table = { caption: "年表", columns: [{ id: "c1", text: "年" }],
                  rows: [{ id: "r1", header: "大化の改新",
                           cells: [{ id: "x1", text: "", editable: true, answer: "645" }] }] };
    });
    assert(html.indexOf("年表") >= 0 && html.indexOf("大化の改新") >= 0);
  });
}

group("答えを紙に漏らさない");
{
  test("並び替えは正解の順では出さない", () => {
    const words = ["I", "went", "to", "school", "yesterday"];
    const { plan } = paperOf("ordering", (q) => {
      q.orderItems = words.map((w, i) => ({ id: "i" + i, text: w, order: i + 1 }));
      q.correctOrder = q.orderItems.map((x) => x.id);
    });
    const b = findBlock(plan, "order-bank");
    assert(b, "並べる語のブロックが作られていません");
    assert(b.items.map((x) => x.text).join(" ") !== words.join(" "),
      "正解の順のまま紙へ出ています（答えが漏れます）");
  });
  test("表うめ：うめる升に答えを書かない", () => {
    const { html } = paperOf("table_fill", (q) => {
      q.table = { caption: "年表", columns: [{ id: "c1", text: "年" }],
                  rows: [{ id: "r1", header: "大化の改新",
                           cells: [{ id: "x1", text: "", editable: true, answer: "645" }] }] };
    });
    assert(html.indexOf("645") < 0, "うめる升に答えが刷られています");
  });
}

group("画面と紙で並び順が同じ");
{
  test("並び替えの並び順が画面と一致する", () => {
    const words = ["I", "went", "to", "school", "yesterday"];
    const { plan, q } = paperOf("ordering", (qq) => {
      qq.orderItems = words.map((w, i) => ({ id: "i" + i, text: w, order: i + 1 }));
      qq.correctOrder = qq.orderItems.map((x) => x.id);
    });
    const paper = findBlock(plan, "order-bank").items.map((x) => x.text).join(" ");

    /* 画面側（ui/question-renderer.js）の並べ替えを、そのまま取り出して使う。
       写しを書くと、片方だけ直したときにずれても気づけない。 */
    const src = readFileSync(join(V2, "ui", "question-renderer.js"), "utf8");
    const m = src.match(/function shuffleStable[\s\S]*?\n  \}/);
    assert(m, "画面側の並べ替えが見つかりません（名前が変わった？）");
    const fn = new Function("list", "seedStr",
      "var str=function(v){return v==null?'':String(v);};" + m[0] + "return shuffleStable(list,seedStr);");
    const screen = fn(q.orderItems, q.id).map((x) => x.text).join(" ");

    assertEq(paper, screen, "紙と画面で並び順がずれています");
  });
}

group("これまでどおりのものを壊していない");
{
  test("4択の選択肢はこれまでどおり出る", () => {
    const { html } = paperOf("multiple_choice_single", (q) => {
      q.choices = [{ id: "c1", label: "A", text: "東京", isCorrect: true },
                   { id: "c2", label: "B", text: "大阪" }];
    });
    assert(html.indexOf("東京") >= 0 && html.indexOf("大阪") >= 0);
  });
  test("短答は余計なものを足さない", () => {
    const { plan } = paperOf("short_answer", (q) => { q.correctAnswer = "鎌倉"; });
    assert(!findBlock(plan, "order-bank"), "短答に語群が付いています");
    assert(!findBlock(plan, "match-pairs"), "短答に対応表が付いています");
  });
  test("答えは短答の紙にも出さない", () => {
    const { html } = paperOf("short_answer", (q) => { q.correctAnswer = "鎌倉" ; });
    assert(html.indexOf("鎌倉") < 0, "問題冊子に正解が刷られています");
  });
}


/* ══ 解答欄の数が問題と合っている（§43「解答欄不足」）══════════════
   実測（2026-08-05）: 組み合わせ 3 組の解答欄が 2 枠しか出ていなかった。
   数を q.blanks の件数から取っていたため、並び替え・組み合わせ・分類・
   表うめには blanks が無く、必ず最低値になっていた。
   また reorder_english は型名の完全一致から漏れて記述の行になっていた。 */
group("解答欄の数が問題と合う");
{
  const cells = (type, fill) => {
    const { plan } = paperOf(type, fill);
    const b = findBlock(plan, "answer-area");
    assert(b, "解答欄のブロックがありません");
    assert(b.answerShape, type + " の解答欄の形が決まっていません");
    return b.answerShape;
  };

  test("並び替え 5 語 → 枠が 5 つ", () => {
    const sh = cells("ordering", (q) => {
      q.orderItems = "abcde".split("").map((c, i) => ({ id: c, text: c, order: i + 1 }));
      q.correctOrder = "abcde".split("");
    });
    assertEq(sh.style, "cells");
    assertEq(sh.count, 5);
  });
  test("英文並び替えも記述の行にならない（型名の仲間を取りこぼさない）", () => {
    const sh = cells("reorder_english", (q) => {
      q.orderItems = "abcd".split("").map((c, i) => ({ id: c, text: c, order: i + 1 }));
      q.correctOrder = "abcd".split("");
    });
    assertEq(sh.style, "cells");
    assertEq(sh.count, 4);
  });
  test("組み合わせ 3 組 → 枠が 3 つ", () => {
    const sh = cells("matching", (q) => {
      q.pairs = {
        left: [{ id: "L1", text: "あ" }, { id: "L2", text: "い" }, { id: "L3", text: "う" }],
        right: [{ id: "R1", text: "1" }, { id: "R2", text: "2" }, { id: "R3", text: "3" }],
        correct: { L1: "R1", L2: "R2", L3: "R3" }
      };
    });
    assertEq(sh.count, 3, "組み合わせの数と解答欄の数が違います");
  });
  test("分類 4 語 → 枠が 4 つ", () => {
    const sh = cells("classification", (q) => {
      q.classification = {
        groups: [{ id: "g1", label: "A" }, { id: "g2", label: "B" }],
        items: "pqrs".split("").map((c) => ({ id: c, text: c, groupId: "g1" }))
      };
    });
    assertEq(sh.count, 4);
  });
  test("表うめ：うめる升の数だけ枠が出る（うめない升は数えない）", () => {
    const sh = cells("table_fill", (q) => {
      q.table = {
        caption: "", columns: [{ id: "c1", text: "X" }, { id: "c2", text: "Y" }],
        rows: [{ id: "r1", header: "1", cells: [
          { id: "a", text: "", editable: true, answer: "1" },
          { id: "b", text: "決め打ち", editable: false }] },
          { id: "r2", header: "2", cells: [
          { id: "c", text: "", editable: true, answer: "2" },
          { id: "d", text: "", editable: true, answer: "3" }] }]
      };
    });
    assertEq(sh.count, 3, "うめる升は 3 つのはずです");
  });
  test("4択はマークのまま（これまでどおり）", () => {
    const sh = cells("multiple_choice_single", (q) => {
      q.choices = [{ id: "c1", label: "A", text: "あ", isCorrect: true },
                   { id: "c2", label: "B", text: "い" }, { id: "c3", label: "C", text: "う" }];
    });
    assertEq(sh.style, "marks");
    assertEq(sh.count, 3);
  });
  test("記述はこれまでどおり行を引く", () => {
    const { plan } = paperOf("long_answer", (q) => { q.modelAnswer = "答え"; });
    const b = findBlock(plan, "answer-area");
    assert(!b.answerShape, "記述に枠が付いています");
  });
}

process.exit(report("紙に解くのに要る中身が出る") > 0 ? 1 : 0);
