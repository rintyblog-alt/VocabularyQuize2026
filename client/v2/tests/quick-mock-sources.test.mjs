/* ══════════════════════════════════════════════════════════════════════
   Quick Mock §44 資料の状態 ／ §17 外したページの取り消し

   ■ 直す前の状態（実測 2026-08-05）
     サーバは資料をページ単位で見立てて（pageKind / pageKindWhy / byKind /
     documentKind）、出題対象から外したページも理由つきで送ってくる。
     だが Quick Mock の画面には **1 文字も出ていなかった**。
       ・受け口の onActivity は第 1 引数（label だけの配列）しか見ておらず、
         中身の入った生イベント（第 2 引数）を捨てていた
       ・外したページを使い直す手段が画面に無く、除外は取り消せなかった

   ■ ここで確かめること
     A. サーバが実際に作る値（local-ai の本物のコードで作る）を渡すと、
        画面が出す行に、ページ数・見立て・外した理由がそのまま出ること
     B. 言い換えの表がサーバと食い違っていないこと（新しい理由が来ても黙らない）
     C. 「外したページも使う」を入れたとき、依頼文に足す言い回しを
        **サーバの判定器（wantsChromePages）が実際に受け取る**こと
        （入れなかったときは受け取らないこと ＝ 既定では外れたまま）
     D. 本物のブラウザで画面を開き、資料を付けて生成を走らせると、
        ページの見立て・外したページ・理由・取り消しのスイッチが画面に出て、
        スイッチを入れると **次の依頼文が実際に変わる**こと

   偽陽性を避けるため:
     ・見本を手で書かない。local-ai の makePageEvidence / summarize /
       AnalysisJob.describe / allocate をそのまま呼んで作る。
     ・「含まれている」だけでなく、数字と理由を名指しで見る。
     ・入っていないときは受け取らないことも対で見る（いつも真にならないように）。
   ══════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  installLocalStorage, installLocation, loadV2, V2,
  group, test, assert, assertEq, report
} from "./harness.mjs";
import { launch } from "./browser.mjs";

/* ── サーバ側の本物 ───────────────────────────────────────────── */
import * as PE from "../../../local-ai/src/attachments/page-evidence.mjs";
import { createAnalysisJob } from "../../../local-ai/src/attachments/analysis-job.mjs";
import { EXCLUDE_REASON_JA as SERVER_EXCLUDE_JA }
  from "../../../local-ai/src/orchestrator/blueprint-plan.mjs";
import { wantsChromePages, INCLUDE_CHROME_PHRASE }
  from "../../../local-ai/src/orchestrator/pipeline-structured.mjs";

installLocalStorage();
installLocation("");
const VQ2 = loadV2([
  "qtypes", "qdescriptor", "schema", "qmodel", "validate", "adapter", "score-allocator",
  "grading", "evaluator", "blueprint", "answerability", "qplan", "capability",
  "mock-builder", "mock-compiler", "draft", "flags"
].map((f) => "domain/" + f + ".js"));
new Function(readFileSync(join(V2, "pdf/templates.js"), "utf8")).call(globalThis);
new Function(readFileSync(join(V2, "pdf/layout-grammar.js"), "utf8")).call(globalThis);
new Function(readFileSync(join(V2, "pdf/layout-profiles.js"), "utf8")).call(globalThis);

const noop = () => "";
globalThis.document = { createElement: () => ({ style: {}, setAttribute() {}, addEventListener() {} }) };
VQ2.ui = {
  esc: (s) => String(s == null ? "" : s),
  icon: noop, button: noop, field: noop, mount: noop, on: noop, badge: noop, statusChip: noop,
  AiChat: function () {}
};
new Function(readFileSync(join(V2, "ui/quick-mock.js"), "utf8")).call(globalThis);
const QM = VQ2.quickMock;

/* ══════════════════════════════════════════════════════════════════
   見本を「本物のサーバのコード」で作る

   ・p.1 表紙相当（ページ番号だけ）→ 読み取りは成功だが本文ではない
   ・p.2〜3 本文
   ・p.4 読み取れなかったページ
   ══════════════════════════════════════════════════════════════════ */
const BODY = [
  "植物の細胞には細胞壁と葉緑体があり、動物の細胞には見られない。",
  "根から吸収した水は道管を通って葉へ運ばれ、蒸散によって",
  "気孔から水蒸気として出ていく。光の強さが増すと光合成の",
  "速さも増すが、ある明るさを超えると頭打ちになる。",
  "夜間は光合成が止まり、呼吸だけが続くため二酸化炭素を放出する。",
  "葉の表側には柵状組織、裏側には海綿状組織が並んでいる。"
].join("\n");

const job = createAnalysisJob({ attachmentId: "att-1", name: "理科プリント.pdf", totalPages: 4 });
job.setPages([
  PE.makePageEvidence({ attachmentId: "att-1", pageNumber: 1, status: "ok", extractedText: "1" }),
  PE.makePageEvidence({ attachmentId: "att-1", pageNumber: 2, status: "ok", extractedText: BODY }),
  PE.makePageEvidence({ attachmentId: "att-1", pageNumber: 3, status: "ok", extractedText: BODY }),
  PE.makePageEvidence({ attachmentId: "att-1", pageNumber: 4, status: "failed",
                        errorCode: "analysis_failed" })
]);
job.to("uploaded"); job.to("classifying"); job.to("extracting_text");
job.to("building_evidence"); job.to("partially_completed");
const DESCRIBE = job.describe();

/* サーバがそのまま送ってくる activity イベントの形（server.mjs の emit）。 */
const ANALYSIS_EVENT = { id: "a-1", type: "attachment.analysis", label: "資料の読み取り状況",
                         status: "running", current: 3, total: 4, analysis: [DESCRIBE] };

/* mock.report の report は pipeline-structured.mjs が組み立てる形。
   ここでは「外したページ」の欄だけを、サーバと同じ名前で置く。 */
const REPORT_EVENT = {
  id: "a-2", type: "mock.report", label: "生成の内訳", status: "completed",
  report: {
    requested: 6, generated: 6,
    pageKinds: { documentKind: "mixed", totals: { total: 4, text: 2, lowText: 1, empty: 1 } },
    includeChromePages: false,
    excludedPageCount: 2,
    excludedPages: [
      { page: 1, fileName: "理科プリント.pdf", reason: "cover_page", pageState: "low_text", evidenceIds: ["e1"] },
      { page: 4, fileName: "理科プリント.pdf", reason: "empty_page", pageState: "empty", evidenceIds: ["e9"] }
    ],
    excludeRestored: false,
    thinEvidence: [{ evidenceId: "e7", page: 3, reason: "too_short", characters: 12 }]
  }
};

/* ══════════════════════════════════════════════════════════════════ */
group("A. サーバの解析結果が、画面の行になる");

test("土台：サーバは 4 ページのうち 3 ページを読み、1 ページを本文と見立てていない", () => {
  assertEq(DESCRIBE.totalPages, 4);
  assertEq(DESCRIBE.usablePages, 3);
  assertEq(DESCRIBE.byKind.text, 2);
  assertEq(DESCRIBE.byKind.low_text, 1);
  assertEq(DESCRIBE.byKind.empty, 1);
});

test("attachment.analysis を読み取れる（活動ログの label だけでは分からない値）", () => {
  const a = QM._analysisFromActivity(ANALYSIS_EVENT);
  assert(a, "解析結果を読み取れていません");
  assertEq(a.files.length, 1);
  assertEq(a.files[0].totalPages, 4);
  assertEq(a.files[0].usablePages, 3);
  assertEq(a.files[0].byKind.text, 2);
  assertEq(a.files[0].documentKind, DESCRIBE.documentKind);
});

test("別の種類のイベントは読み取らない（何でも解析結果にしない）", () => {
  assertEq(QM._analysisFromActivity({ type: "worker.mock", label: "作っています" }), null);
  assertEq(QM._analysisFromActivity({ type: "attachment.analysis" }), null);
  assertEq(QM._analysisFromActivity(null), null);
});

test("ページ 1 枚ずつの見立てが、番号つきで残る", () => {
  const a = QM._analysisFromActivity(ANALYSIS_EVENT);
  const p1 = a.files[0].pages.find((p) => p.pageNumber === 1);
  const p2 = a.files[0].pages.find((p) => p.pageNumber === 2);
  assertEq(p1.pageKind, "low_text");
  assertEq(p1.kindJa, "字が少ない");
  assertEq(p2.pageKind, "text");
  assertEq(p2.kindJa, "本文");
});

test("本文と見立てなかった理由が、日本語のまま届く（英字を画面に出さない）", () => {
  const a = QM._analysisFromActivity(ANALYSIS_EVENT);
  const p1 = a.files[0].pages.find((p) => p.pageNumber === 1);
  assertEq(p1.why, "too_few_chars");
  assertEq(p1.whyJa, PE.PAGE_KIND_WHY.too_few_chars);
  assert(!/[a-z_]{4,}/.test(p1.whyJa), "理由に生の英字が残っています：" + p1.whyJa);
});

test("読み取れなかったページ番号が届く", () => {
  const a = QM._analysisFromActivity(ANALYSIS_EVENT);
  assertEq(a.files[0].failedPages.join(","), "4");
});

test("画面へ出す行に、ページ数・見立て・読めなかったページが揃う", () => {
  const rows = QM._sourceStateRows(
    [{ id: "att-1", attachmentId: "att-1", name: "理科プリント.pdf", included: true }],
    QM._analysisFromActivity(ANALYSIS_EVENT));
  assertEq(rows.length, 1);
  assertEq(rows[0].analyzed, true);
  assertEq(rows[0].totalPages, 4);
  assertEq(rows[0].usablePages, 3);
  assertEq(rows[0].byKind.low_text, 1);
  assertEq(rows[0].failedPages.length, 1);
  assertEq(rows[0].documentKindJa, QM.DOC_KIND_JA[DESCRIBE.documentKind]);
});

test("解析がまだ来ていない資料を「0 ページ」と言い切らない", () => {
  const rows = QM._sourceStateRows(
    [{ id: "x", attachmentId: "x", name: "まだの資料.pdf", included: true, pageCount: 12 }], null);
  assertEq(rows[0].analyzed, false);
  assertEq(rows[0].totalPages, 12);      /* この端末で読んだ数は残す */
  assertEq(rows[0].usablePages, 0);
});

test("ページ画像（親にぶら下がる添付）は資料の行に出さない", () => {
  const rows = QM._sourceStateRows([
    { id: "att-1", attachmentId: "att-1", name: "理科プリント.pdf" },
    { id: "att-1-p3", attachmentId: "att-1-p3", parentAttachmentId: "att-1", name: "3ページ.png" }
  ], null);
  assertEq(rows.length, 1);
});

/* ══════════════════════════════════════════════════════════════════ */
group("B. 外したページと、その理由");

test("mock.report から、外したページと理由を読み取れる", () => {
  const r = QM._pageReportFromActivity(REPORT_EVENT);
  assert(r, "報告を読み取れていません");
  assertEq(r.excludedPages.length, 2);
  assertEq(r.excludedPages[0].page, 1);
  assertEq(r.excludedPages[0].reasonJa, SERVER_EXCLUDE_JA.cover_page);
  assertEq(r.excludedPages[1].reasonJa, SERVER_EXCLUDE_JA.empty_page);
});

test("外した理由の言い方が、サーバと 1 つも食い違わない", () => {
  Object.keys(SERVER_EXCLUDE_JA).forEach((k) => {
    assertEq(QM.EXCLUDE_REASON_JA[k], SERVER_EXCLUDE_JA[k], "理由「" + k + "」の言い方が違います");
  });
  assertEq(Object.keys(QM.EXCLUDE_REASON_JA).length, Object.keys(SERVER_EXCLUDE_JA).length,
    "画面にサーバに無い理由が増えています（作り話をしない）");
});

test("見立ての理由の言い方も、サーバと 1 つも食い違わない", () => {
  Object.keys(PE.PAGE_KIND_WHY).forEach((k) => {
    assertEq(QM.PAGE_KIND_WHY_JA[k], PE.PAGE_KIND_WHY[k], "理由「" + k + "」の言い方が違います");
  });
});

test("見立ての名札はサーバの 3 つだけ（無い名札を作らない）", () => {
  assertEq(Object.keys(QM.PAGE_KIND_JA).sort().join(","), PE.PAGE_KINDS.slice().sort().join(","));
});

test("知らない理由が来ても、生の英字のまま出さずに「届いていません」とは言わない", () => {
  const r = QM._pageReportFromActivity({
    type: "mock.report",
    report: { excludedPages: [{ page: 2, fileName: "a.pdf", reason: "brand_new_reason" }] }
  });
  /* 知らない名前はそのまま見せる（黙って消さない）。理由が無いときだけ「届いていません」。 */
  assertEq(r.excludedPages[0].reasonJa, "brand_new_reason");
  const none = QM._pageReportFromActivity({
    type: "mock.report", report: { excludedPages: [{ page: 3 }] } });
  assertEq(none.excludedPages[0].reasonJa, "理由が届いていません");
});

test("外したページを資料ごとにまとめる（1 行ずつ 48 行並べない）", () => {
  const g = QM._excludedPageRows(QM._pageReportFromActivity(REPORT_EVENT));
  assertEq(g.length, 1);
  assertEq(g[0].fileName, "理科プリント.pdf");
  assertEq(g[0].pages.length, 2);
  assertEq(g[0].reasons.length, 2);
});

test("全ページが外れて元へ戻したときも、その事実を落とさない", () => {
  const r = QM._pageReportFromActivity({
    type: "mock.report", report: { excludedPages: [], excludeRestored: true } });
  assertEq(r.excludeRestored, true);
});

/* ══════════════════════════════════════════════════════════════════ */
group("C. 除外は取り消せる（§17・サーバが実際に受け取る言い回しか）");

test("既定は「使わない」（勝手に全ページへ戻さない）", () => {
  assertEq(QM._includePhraseFor({}), "");
  assertEq(QM._includePhraseFor({ includeExcludedPages: false }), "");
});

test("入れたときだけ、合言葉を足す", () => {
  assertEq(QM._includePhraseFor({ includeExcludedPages: true }), QM.INCLUDE_EXCLUDED_PHRASE);
});

test("合言葉がサーバの定数と同じ（言い換えるとスイッチが効かなくなる）", () => {
  assertEq(QM.INCLUDE_EXCLUDED_PHRASE, INCLUDE_CHROME_PHRASE);
});

test("入れて作った依頼文を、サーバの判定器が実際に受け取る", () => {
  const on = QM._withSourcePolicy("次の設問を作ってください。", { includeExcludedPages: true });
  assert(wantsChromePages(on), "サーバが解除と読み取れませんでした：\n" + on);
});

test("入れていない依頼文は受け取らない（既定では外れたまま）", () => {
  const off = QM._withSourcePolicy("次の設問を作ってください。", { includeExcludedPages: false });
  assertEq(off, "次の設問を作ってください。");
  assert(!wantsChromePages(off), "外していないのに解除と読まれています");
});

test("足した文が、逆の意味（外して・含めない）に読まれない", () => {
  const on = QM._withSourcePolicy("問題を作ってください。", { includeExcludedPages: true });
  assert(wantsChromePages(on), "打ち消しの語に当たって解除にならなくなっています");
  ["除いて", "外して", "使わない", "出さない", "出題しない", "含めない", "入れない"].forEach((w) => {
    assert(on.indexOf(w) < 0, "打ち消しに読まれる語が入っています：" + w);
  });
});

test("元の依頼文は 1 文字も削らない（設問の指定を壊さない）", () => {
  const base = "1) 問1 / 4択 / 10点　id: q-1";
  const on = QM._withSourcePolicy(base, { includeExcludedPages: true });
  assertEq(on.indexOf(base), 0);
});

/* ══════════════════════════════════════════════════════════════════
   D. 本物のブラウザで画面を開いて確かめる
   ══════════════════════════════════════════════════════════════════ */
group("D. 画面（本物のブラウザ）");

const B = await launch();
if (!B) {
  test("Playwright が無いので画面を確かめられない", () => {
    assert(false, "playwright が入っていないため、画面に出るかを確かめられませんでした");
  });
} else {
  const page = await B.page({ width: 1280, height: 900 });
  const seen = await page.evaluate(async ({ analysisEvent, reportEvent }) => {
    const V = window.VQ2;
    /* 資料の選択は差し替える（ファイル選択の口はこの経路だけ）。 */
    V.ui.pickAttachments = () => Promise.resolve({
      attachments: [{ id: "att-1", attachmentId: "att-1", jobId: "j1",
                      name: "理科プリント.pdf", kind: "pdf", pageCount: 4, included: true }],
      display: [], failed: []
    });
    /* 生成は差し替えるが、**活動イベントは本物と同じ形で流す**。
       依頼文は毎回とっておく（スイッチが効いたかを、これで見る）。 */
    const sent = [];
    V.ai.generateBlueprint = (o) => {
      sent.push(String(o.instruction || ""));
      if (o.onActivity) {
        o.onActivity([], analysisEvent);
        o.onActivity([], reportEvent);
      }
      return Promise.resolve({ text: "大問1 / 3問 / 30点", warnings: [] });
    };
    const app = V.quickMock.open({});
    const $ = (sel) => app.root.querySelector(sel);
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));

    $('[data-act="attach"]').click();
    await wait(60);

    const box = $('[data-key="instruction"]');
    box.value = "配ったプリントの範囲で作って";
    box.dispatchEvent(new Event("input", { bubbles: true }));

    $('[data-act="blueprint"]').click();
    await wait(200);

    const beforeText = app.root.textContent;
    /* 外したページの欄を開く */
    const fold = app.root.querySelector('[data-fold="excl"]');
    if (fold) fold.click();
    await wait(60);
    const openText = app.root.textContent;

    /* 取り消しのスイッチ */
    const cb = app.root.querySelector('[data-key="includeExcludedPages"]');
    let toggled = false;
    if (cb) {
      cb.checked = true;
      cb.dispatchEvent(new Event("change", { bubbles: true }));
      toggled = true;
      await wait(60);
    }
    /* もう一度作らせて、依頼文が変わったかを見る */
    app.root.querySelector('[data-act="blueprint"]').click();
    await wait(200);

    return { beforeText, openText, toggled, sent,
             afterText: app.root.textContent };
  }, { analysisEvent: ANALYSIS_EVENT, reportEvent: REPORT_EVENT });

  test("画面が例外を出していない", () => {
    assertEq((page.__vqErrors || []).join(" / "), "");
  });

  test("読み取りの進み具合が画面に出る（3 / 4 ページ）", () => {
    assert(seen.beforeText.indexOf("3 / 4 ページから内容を取り出しました") >= 0,
      "ページ数が画面に出ていません");
  });

  test("ページごとの見立ての内訳が画面に出る（本文 2 ／ 字が少ない 1 ／ 空 1）", () => {
    assert(seen.beforeText.indexOf("本文 2") >= 0, "本文の枚数が出ていません");
    assert(seen.beforeText.indexOf("字が少ない 1") >= 0, "字の少ないページの枚数が出ていません");
    assert(seen.beforeText.indexOf("空 1") >= 0, "空のページの枚数が出ていません");
  });

  test("読み取れなかったページ番号が画面に出る", () => {
    assert(seen.beforeText.indexOf("読み取れなかったページ p.4") >= 0,
      "読めなかったページが出ていません");
  });

  test("外したページ数が画面に出る", () => {
    assert(seen.beforeText.indexOf("2 ページを外しています") >= 0,
      "外したページ数が出ていません");
  });

  test("外したページの番号と理由が画面に出る", () => {
    assert(seen.openText.indexOf("p.1・p.4") >= 0, "外したページ番号が出ていません");
    assert(seen.openText.indexOf(SERVER_EXCLUDE_JA.cover_page) >= 0, "表紙の理由が出ていません");
    assert(seen.openText.indexOf(SERVER_EXCLUDE_JA.empty_page) >= 0, "空ページの理由が出ていません");
  });

  test("外した除外を取り消すスイッチが画面にある", () => {
    assert(seen.toggled, "「外したページも使う」の切り替えが画面にありません");
    assert(seen.openText.indexOf("外したページも出題に使う") >= 0, "切り替えの説明がありません");
  });

  test("土台：1 回目の依頼文には解除の言い回しが入っていない", () => {
    assertEq(seen.sent.length >= 1, true);
    assert(!wantsChromePages(seen.sent[0]), "何もしていないのに解除になっています");
  });

  test("スイッチを入れると、次の依頼文をサーバが解除として受け取る", () => {
    assertEq(seen.sent.length, 2, "2 回目の依頼が飛んでいません");
    assert(wantsChromePages(seen.sent[1]),
      "スイッチを入れたのに依頼文が変わっていません：\n" + seen.sent[1].slice(-200));
  });

  test("スイッチを入れたあとは、画面も「次からは使います」と言う", () => {
    assert(seen.afterText.indexOf("次からは使います") >= 0, "取り消したことが画面に出ていません");
  });

  await B.close();
}

process.exit(report("Quick Mock 資料の状態と除外の取り消し") ? 1 : 0);
