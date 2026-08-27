/* ══════════════════════════════════════════════════════════════════════
   Layout Grammar V2 — 紙面の「意味」と「実寸」を切り離す

   いままでの LayoutPlan は、mm・％・24 列・CSS の語彙が混ざっていた。
   そのままでは Typst や TeX へ渡せない（あちらに colSpan も mm 直書きも無い）。

   そこで 3 層に分ける。

     A. Semantic Layout Plan  … 何を、どんな役割で、どのくらいの大きさで置きたいか
                                mm も % も colSpan も CSS も **入れない**
     B. Resolved Layout Plan  … 用紙と Renderer を決めてから実寸へ落とす
     C. Renderer Output       … HTML/CSS（将来 Typst / TeX）

   固定テンプレートを増やすのではなく、次の組み合わせで紙面を作る。

     文書ファミリー × 教科ルールパック × 意味ブロック
       × 解答用紙ファミリー × 安全制約 × Seed による変化

   Seed は最後にしか使わない。
   先に「問題の中身」を見て候補を絞り、残った安全な候補からだけ選ぶ。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var S = VQ2.schema;
  if (!S) throw new Error("VQ2.schema must be loaded before layout-grammar.js");

  var GRAMMAR_VERSION = "2.0.0";

  /* ══════════════════════════════════════════════════════════════════
     意味の語彙
     ・ここに mm・pt・%・列数・CSS クラスは 1 つも出てこない。
     ・実寸へ落とすのは Resolver の仕事。
     ══════════════════════════════════════════════════════════════════ */

  /* 大きさの階級。用紙の内寸に対する相対の考え方だけを持つ。 */
  var SIZE_CLASSES = ["tiny", "small", "medium", "large", "xlarge", "full"];
  /* 記入できる面積の階級。「書けるかどうか」の下限を意味で持つ。 */
  var WRITING_AREAS = ["none", "tiny", "small", "medium", "large", "xlarge"];
  /* 置き場所の希望。実際にどう配置するかは Renderer が決める。 */
  var PLACEMENTS = ["inline", "same-row", "own-row", "right", "left", "below", "above", "centered"];
  /* 幅の希望（意味）。half-page などは「およそ半分」という意味で、mm ではない。 */
  var WIDTH_HINTS = ["minimal", "quarter-page", "third-page", "half-page", "two-thirds-page", "full-page"];

  /* ══════════════════════════════════════════════════════════════════
     Semantic Block Library（25 種）
     ・どのブロックも「意味」しか持たない。
     ・fallbackVariant は、制約を満たせなかったときに必ず戻れる形。
     ══════════════════════════════════════════════════════════════════ */
  function B(o) {
    return Object.assign({
      /* この型が扱える設問形式。空＝どの形式でも使える。 */
      questionTypes: [],
      /* 意味上の役割 */
      semanticRole: "question",
      /* Seed で選んでよい見た目の候補。ここに無いものは選べない。 */
      variants: ["default"],
      fallbackVariant: "default",
      /* 既定の制約 */
      constraints: {
        keepTogether: true,
        avoidBreakInside: true,
        allowPageBreakInside: false,
        minimumWidth: "full-page",
        preferredPlacement: "own-row",
        allowColumns: [1]
      },
      /* この型を使うために最低限そろっている必要のあるもの */
      requires: {},
      version: "1.0.0"
    }, o);
  }

  var BLOCKS = {
    /* ── 基本 ────────────────────────────────────────────────── */
    "plain-question": B({
      type: "plain-question", label: "問題文だけ",
      semanticRole: "question",
      constraints: { keepTogether: true, avoidBreakInside: true, allowPageBreakInside: false,
                     minimumWidth: "full-page", preferredPlacement: "own-row", allowColumns: [1] }
    }),
    "choice-list": B({
      type: "choice-list", label: "選択肢",
      semanticRole: "choices",
      questionTypes: ["multiple_choice_single", "multiple_choice_multiple", "true_false"],
      variants: ["vertical", "two-column", "inline"],
      fallbackVariant: "vertical",
      constraints: { keepTogether: true, avoidBreakInside: true, allowPageBreakInside: false,
                     minimumWidth: "half-page", preferredPlacement: "below", allowColumns: [1, 2] }
    }),
    "passage": B({
      type: "passage", label: "本文（長文）",
      semanticRole: "stimulus",
      variants: ["boxed", "plain", "numbered-lines"],
      fallbackVariant: "plain",
      /* 長文は 1 ページに収まらないことがある。ここだけは分割を許す。 */
      constraints: { keepTogether: false, avoidBreakInside: false, allowPageBreakInside: true,
                     minimumWidth: "full-page", preferredPlacement: "own-row", allowColumns: [1, 2] }
    }),
    "passage-with-questions": B({
      type: "passage-with-questions", label: "本文＋設問群",
      semanticRole: "stimulus-group",
      variants: ["passage-above", "passage-left"],
      fallbackVariant: "passage-above",
      constraints: { keepTogether: false, avoidBreakInside: false, allowPageBreakInside: true,
                     minimumWidth: "full-page", preferredPlacement: "own-row", allowColumns: [1] }
    }),
    "dialogue": B({
      type: "dialogue", label: "会話文",
      semanticRole: "stimulus",
      variants: ["speaker-left", "indented"],
      fallbackVariant: "indented",
      constraints: { keepTogether: false, avoidBreakInside: false, allowPageBreakInside: true,
                     minimumWidth: "full-page", preferredPlacement: "own-row", allowColumns: [1] }
    }),
    "word-bank": B({
      type: "word-bank", label: "語群",
      semanticRole: "stimulus",
      variants: ["boxed-row", "boxed-grid"],
      fallbackVariant: "boxed-row",
      constraints: { keepTogether: true, avoidBreakInside: true, allowPageBreakInside: false,
                     minimumWidth: "half-page", preferredPlacement: "above", allowColumns: [1] }
    }),
    "fill-in-blanks": B({
      type: "fill-in-blanks", label: "空欄補充",
      semanticRole: "question",
      questionTypes: ["fill_blank"],
      variants: ["inline-blank", "numbered-blank"],
      fallbackVariant: "inline-blank",
      constraints: { keepTogether: true, avoidBreakInside: true, allowPageBreakInside: false,
                     minimumWidth: "full-page", preferredPlacement: "own-row", allowColumns: [1] }
    }),
    "ordering": B({
      type: "ordering", label: "並び替え",
      semanticRole: "question",
      questionTypes: ["ordering"],
      variants: ["vertical", "two-column"],
      fallbackVariant: "vertical",
      constraints: { keepTogether: true, avoidBreakInside: true, allowPageBreakInside: false,
                     minimumWidth: "half-page", preferredPlacement: "own-row", allowColumns: [1, 2] }
    }),
    "matching": B({
      type: "matching", label: "対応（線結び）",
      semanticRole: "question",
      questionTypes: ["matching"],
      variants: ["two-column", "table"],
      fallbackVariant: "two-column",
      constraints: { keepTogether: true, avoidBreakInside: true, allowPageBreakInside: false,
                     minimumWidth: "half-page", preferredPlacement: "own-row", allowColumns: [2] }
    }),

    /* ── 図表 ────────────────────────────────────────────────── */
    "figure": B({
      type: "figure", label: "図 1 点",
      semanticRole: "stimulus",
      variants: ["below-centered", "centered", "right"],
      fallbackVariant: "below-centered",
      requires: { minFigures: 1, maxFigures: 1 },
      constraints: { keepTogether: true, avoidBreakInside: true, allowPageBreakInside: false,
                     minimumWidth: "third-page", preferredPlacement: "below", allowColumns: [1] }
    }),
    "figure-group": B({
      type: "figure-group", label: "図表のまとまり",
      semanticRole: "stimulus",
      variants: ["horizontal-centered", "vertical-centered", "grid"],
      fallbackVariant: "vertical-centered",
      requires: { minFigures: 2, maxFigures: 4 },
      constraints: { keepTogether: true, avoidBreakInside: true, allowPageBreakInside: false,
                     minimumWidth: "two-thirds-page", preferredPlacement: "centered", allowColumns: [1] }
    }),
    "figure-right": B({
      type: "figure-right", label: "本文左・図右",
      semanticRole: "stimulus",
      variants: ["text-left-graph-right", "figure-right"],
      fallbackVariant: "figure-right",
      requires: { minFigures: 1, maxFigures: 1 },
      constraints: { keepTogether: true, avoidBreakInside: true, allowPageBreakInside: false,
                     minimumWidth: "third-page", preferredPlacement: "right", allowColumns: [1] }
    }),
    "graph-analysis": B({
      type: "graph-analysis", label: "グラフの読み取り",
      semanticRole: "stimulus",
      variants: ["graph-right", "graph-below"],
      fallbackVariant: "graph-below",
      requires: { minFigures: 1 },
      constraints: { keepTogether: true, avoidBreakInside: true, allowPageBreakInside: false,
                     minimumWidth: "half-page", preferredPlacement: "right", allowColumns: [1] }
    }),
    "table-analysis": B({
      type: "table-analysis", label: "表の読み取り",
      semanticRole: "stimulus",
      variants: ["table-below", "table-right"],
      fallbackVariant: "table-below",
      requires: { minTables: 1 },
      constraints: { keepTogether: true, avoidBreakInside: true, allowPageBreakInside: false,
                     minimumWidth: "half-page", preferredPlacement: "below", allowColumns: [1] }
    }),
    "source-comparison": B({
      type: "source-comparison", label: "資料の比較",
      semanticRole: "stimulus",
      variants: ["side-by-side", "stacked"],
      fallbackVariant: "stacked",
      requires: { minSources: 2 },
      constraints: { keepTogether: false, avoidBreakInside: false, allowPageBreakInside: true,
                     minimumWidth: "full-page", preferredPlacement: "own-row", allowColumns: [1, 2] }
    }),
    "map-question": B({
      type: "map-question", label: "地図",
      semanticRole: "stimulus",
      variants: ["map-centered", "map-right"],
      fallbackVariant: "map-centered",
      requires: { minFigures: 1 },
      constraints: { keepTogether: true, avoidBreakInside: true, allowPageBreakInside: false,
                     minimumWidth: "two-thirds-page", preferredPlacement: "centered", allowColumns: [1] }
    }),
    "timeline": B({
      type: "timeline", label: "年表",
      semanticRole: "stimulus",
      variants: ["horizontal", "vertical-table"],
      fallbackVariant: "vertical-table",
      constraints: { keepTogether: false, avoidBreakInside: false, allowPageBreakInside: true,
                     minimumWidth: "full-page", preferredPlacement: "own-row", allowColumns: [1] }
    }),
    "experiment-procedure": B({
      type: "experiment-procedure", label: "実験の手順",
      semanticRole: "stimulus",
      variants: ["numbered-steps", "steps-with-figure"],
      fallbackVariant: "numbered-steps",
      constraints: { keepTogether: false, avoidBreakInside: false, allowPageBreakInside: true,
                     minimumWidth: "full-page", preferredPlacement: "own-row", allowColumns: [1] }
    }),

    /* ── 教科固有 ────────────────────────────────────────────── */
    "code-block": B({
      type: "code-block", label: "ソースコード",
      semanticRole: "stimulus",
      variants: ["monospace-numbered", "monospace-plain"],
      fallbackVariant: "monospace-plain",
      /* 折り返しで意味が変わるので、桁を守る。等幅は Renderer が実現する。 */
      constraints: { keepTogether: false, avoidBreakInside: false, allowPageBreakInside: true,
                     minimumWidth: "full-page", preferredPlacement: "own-row", allowColumns: [1],
                     monospace: true, preserveLineBreaks: true, maxWrapColumns: 88 }
    }),
    "equation-block": B({
      type: "equation-block", label: "数式",
      semanticRole: "stimulus",
      variants: ["centered", "left-aligned"],
      fallbackVariant: "centered",
      constraints: { keepTogether: true, avoidBreakInside: true, allowPageBreakInside: false,
                     minimumWidth: "half-page", preferredPlacement: "centered", allowColumns: [1] }
    }),
    "proof": B({
      type: "proof", label: "証明",
      semanticRole: "question",
      variants: ["with-work-area", "plain"],
      fallbackVariant: "with-work-area",
      constraints: { keepTogether: false, avoidBreakInside: false, allowPageBreakInside: true,
                     minimumWidth: "full-page", preferredPlacement: "own-row", allowColumns: [1] }
    }),
    "calculation-area": B({
      type: "calculation-area", label: "計算らん",
      semanticRole: "answer",
      variants: ["grid", "blank", "ruled"],
      fallbackVariant: "blank",
      constraints: { keepTogether: true, avoidBreakInside: true, allowPageBreakInside: false,
                     minimumWidth: "half-page", preferredPlacement: "own-row", allowColumns: [1],
                     minimumWritingArea: "large" }
    }),
    "drawing-area": B({
      type: "drawing-area", label: "作図らん",
      semanticRole: "answer",
      variants: ["blank", "grid", "with-axes"],
      fallbackVariant: "blank",
      constraints: { keepTogether: true, avoidBreakInside: true, allowPageBreakInside: false,
                     minimumWidth: "half-page", preferredPlacement: "own-row", allowColumns: [1],
                     minimumWritingArea: "large" }
    }),

    /* ── 解答 ────────────────────────────────────────────────── */
    "short-answer": B({
      type: "short-answer", label: "短答",
      semanticRole: "answer",
      questionTypes: ["short_answer", "numeric", "fill_blank", "formula"],
      variants: ["single-line", "boxed"],
      fallbackVariant: "single-line",
      constraints: { keepTogether: true, avoidBreakInside: true, allowPageBreakInside: false,
                     minimumWidth: "third-page", preferredPlacement: "same-row", allowColumns: [1],
                     minimumWritingArea: "small" }
    }),
    "essay": B({
      type: "essay", label: "論述",
      semanticRole: "answer",
      questionTypes: ["essay", "english_writing", "long_answer", "source_analysis"],
      variants: ["ruled-lines", "manuscript-grid", "blank"],
      fallbackVariant: "ruled-lines",
      constraints: { keepTogether: false, avoidBreakInside: false, allowPageBreakInside: true,
                     minimumWidth: "full-page", preferredPlacement: "own-row", allowColumns: [1],
                     minimumWritingArea: "large" }
    })
  };
  var BLOCK_TYPES = Object.keys(BLOCKS);

  /* ══════════════════════════════════════════════════════════════════
     Document Family（文書ファミリー）
     ・available:false のものは選ばせない。使えるふりをしない。
     ══════════════════════════════════════════════════════════════════ */
  function F(o) {
    return Object.assign({
      available: false,
      paperSizes: ["A4"],
      orientations: ["portrait"],
      header: { style: "left-simple", showSubject: false, showMeta: false, showNameBox: false, rule: false },
      pageNumber: { enabled: true, position: "bottom-center", style: "dash", startNumber: 1,
                    coverIncluded: false, prefix: "", suffix: "" },
      sectionStart: { newPageFrom: 0, marker: "問{n}", markerVariant: "boxed" },
      density: "standard",
      cover: false,
      defaultAnswerFamily: "answer-dense-grid",
      allowedBlockTypes: BLOCK_TYPES.slice(),
      pageBreak: { keepQuestionWithChoices: true, keepQuestionWithFigure: true,
                   forbidOrphanHeading: true, allowPassageSplit: true },
      /* 実際に組める Renderer。typst / tex はまだ入れない（動くふりをしない）。 */
      compatibleEngines: ["current"],
      version: "1.0.0"
    }, o);
  }

  var DOCUMENT_FAMILIES = {
    /* 唯一いま使えるもの。校正済みの 2 プロファイルがこの中身。 */
    "school-exam-standard": F({
      id: "school-exam-standard", name: "学校試験・標準",
      available: true,
      /* 校正済みプロファイルへの結び付け。ここが「壊さない」ための橋。 */
      questionProfileId: "school-science-figure-classic",
      defaultAnswerFamily: "answer-dense-grid",
      paperSizes: ["A4", "B5"],
      header: { style: "left-simple", showSubject: false, showMeta: false, showNameBox: false, rule: false },
      pageNumber: { enabled: true, position: "bottom-center", style: "dash", startNumber: 1,
                    coverIncluded: false, prefix: "", suffix: "" },
      sectionStart: { newPageFrom: 2, marker: "問{n}", markerVariant: "boxed" },
      density: "standard"
    }),

    "school-exam-dense": F({
      id: "school-exam-dense", name: "学校試験・高密度",
      /* Typst で実際に組めることを 2026-08-04 に確認（問題冊子・解答用紙・模範解答の
         3 点すべてが PDF になり、体裁ごとに中身も変わる）。それまでは
         「動くふりをしない」ために閉じてあった。 */
      available: true,
      density: "dense",
      sectionStart: { newPageFrom: 0, marker: "問{n}", markerVariant: "plain" },
      pageNumber: { enabled: true, position: "bottom-right", style: "slash", startNumber: 1,
                    coverIncluded: false, prefix: "", suffix: "" }
    }),
    "mock-exam": F({
      id: "mock-exam", name: "模擬試験",
      /* Typst で実際に組めることを 2026-08-04 に確認（問題冊子・解答用紙・模範解答の
         3 点すべてが PDF になり、体裁ごとに中身も変わる）。それまでは
         「動くふりをしない」ために閉じてあった。 */
      available: true,
      paperSizes: ["A4", "B4"], cover: true,
      header: { style: "centered", showSubject: true, showMeta: true, showNameBox: false, rule: true },
      pageNumber: { enabled: true, position: "bottom-center", style: "slash", startNumber: 1,
                    coverIncluded: false, prefix: "", suffix: "" },
      sectionStart: { newPageFrom: 1, marker: "第{n}問", markerVariant: "boxed" }
    }),
    "common-test-style": F({
      id: "common-test-style", name: "共通テスト風",
      /* Typst で実際に組めることを 2026-08-04 に確認（問題冊子・解答用紙・模範解答の
         3 点すべてが PDF になり、体裁ごとに中身も変わる）。それまでは
         「動くふりをしない」ために閉じてあった。 */
      available: true,
      paperSizes: ["A4", "B5"], cover: true,
      sectionStart: { newPageFrom: 1, marker: "第{n}問", markerVariant: "boxed" },
      defaultAnswerFamily: "answer-mark",
      pageNumber: { enabled: true, position: "bottom-outer", style: "plain", startNumber: 1,
                    coverIncluded: false, prefix: "", suffix: "" }
    }),
    "workbook": F({
      id: "workbook", name: "問題集",
      /* Typst で実際に組めることを 2026-08-04 に確認（問題冊子・解答用紙・模範解答の
         3 点すべてが PDF になり、体裁ごとに中身も変わる）。それまでは
         「動くふりをしない」ために閉じてあった。 */
      available: true,
      density: "dense", defaultAnswerFamily: "answer-inline",
      sectionStart: { newPageFrom: 0, marker: "{n}", markerVariant: "plain" },
      pageNumber: { enabled: true, position: "bottom-outer", style: "plain", startNumber: 1,
                    coverIncluded: true, prefix: "", suffix: "" }
    }),
    "quiz-sheet": F({
      id: "quiz-sheet", name: "小テスト",
      /* Typst で実際に組めることを 2026-08-04 に確認（問題冊子・解答用紙・模範解答の
         3 点すべてが PDF になり、体裁ごとに中身も変わる）。それまでは
         「動くふりをしない」ために閉じてあった。 */
      available: true,
      paperSizes: ["A4", "B5"], defaultAnswerFamily: "answer-inline",
      header: { style: "left-simple", showSubject: true, showMeta: false, showNameBox: true, rule: true },
      pageNumber: { enabled: false, position: "bottom-center", style: "plain", startNumber: 1,
                    coverIncluded: false, prefix: "", suffix: "" },
      sectionStart: { newPageFrom: 0, marker: "{n}", markerVariant: "plain" }
    }),
    "classroom-assignment": F({
      id: "classroom-assignment", name: "課題プリント",
      /* Typst で実際に組めることを 2026-08-04 に確認（問題冊子・解答用紙・模範解答の
         3 点すべてが PDF になり、体裁ごとに中身も変わる）。それまでは
         「動くふりをしない」ために閉じてあった。 */
      available: true,
      defaultAnswerFamily: "answer-inline",
      header: { style: "left-simple", showSubject: true, showMeta: false, showNameBox: true, rule: false },
      sectionStart: { newPageFrom: 0, marker: "{n}", markerVariant: "plain" }
    }),
    "certification-test": F({
      id: "certification-test", name: "検定・資格試験",
      /* Typst で実際に組めることを 2026-08-04 に確認（問題冊子・解答用紙・模範解答の
         3 点すべてが PDF になり、体裁ごとに中身も変わる）。それまでは
         「動くふりをしない」ために閉じてあった。 */
      available: true,
      cover: true, defaultAnswerFamily: "answer-mark",
      header: { style: "centered", showSubject: true, showMeta: true, showNameBox: false, rule: true },
      pageNumber: { enabled: true, position: "bottom-center", style: "slash", startNumber: 1,
                    coverIncluded: true, prefix: "", suffix: "" },
      sectionStart: { newPageFrom: 1, marker: "問題{n}", markerVariant: "boxed" }
    })
  };
  var DOCUMENT_FAMILY_IDS = Object.keys(DOCUMENT_FAMILIES);

  /* ══════════════════════════════════════════════════════════════════
     Subject Rule Pack（教科ルールパック）
     ・「その教科でどのブロックを使ってよいか／使いたいか」を持つ。
     ・組版の細部まで作り込む必要はないが、
       問題データからパックを選び、候補を出せる形にする。
     ══════════════════════════════════════════════════════════════════ */
  function P(o) {
    return Object.assign({
      allowedBlockTypes: BLOCK_TYPES.slice(),
      preferredBlockTypes: [],
      typographyRules: { bodyFamily: "mincho", headingFamily: "gothic", basePt: 10.5, lineHeight: 1.9 },
      writingDirection: "horizontal",
      choiceRules: { marker: "number-dot", allowTwoColumn: true, twoColumnMaxChars: 12 },
      figureRules: { maxRowItems: 3, minItemWidth: "quarter-page", preserveAspectRatio: true },
      answerSheetRules: { defaultFamily: "answer-dense-grid", preferBoxSequence: false },
      pageBreakRules: { allowPassageSplit: true, keepQuestionWithChoices: true },
      fallbackRules: { block: "plain-question", answerField: "short-answer" },
      compatibleDocumentFamilies: DOCUMENT_FAMILY_IDS.slice(),
      compatibleEngines: ["current"],
      version: "1.0.0"
    }, o);
  }

  var SUBJECT_PACKS = {
    japanese: P({
      id: "japanese", name: "国語",
      /* 縦書きの紙面はまだ用意できていない。ここは正直に横書きのまま。 */
      writingDirection: "horizontal",
      preferredBlockTypes: ["passage-with-questions", "passage", "plain-question", "essay", "short-answer"],
      typographyRules: { bodyFamily: "mincho", headingFamily: "gothic", basePt: 10.5, lineHeight: 2.0 },
      choiceRules: { marker: "number-dot", allowTwoColumn: false, twoColumnMaxChars: 0 },
      answerSheetRules: { defaultFamily: "answer-japanese", preferBoxSequence: false,
                          preferManuscriptGrid: true },
      pageBreakRules: { allowPassageSplit: true, keepQuestionWithChoices: true }
    }),
    english: P({
      id: "english", name: "英語",
      preferredBlockTypes: ["passage-with-questions", "passage", "dialogue", "word-bank",
                            "fill-in-blanks", "short-answer", "essay"],
      typographyRules: { bodyFamily: "mincho", headingFamily: "gothic", basePt: 10.5, lineHeight: 1.8 },
      choiceRules: { marker: "alpha", allowTwoColumn: true, twoColumnMaxChars: 20 },
      answerSheetRules: { defaultFamily: "answer-english", preferBoxSequence: true },
      pageBreakRules: { allowPassageSplit: true, keepQuestionWithChoices: true }
    }),
    mathematics: P({
      id: "mathematics", name: "数学",
      preferredBlockTypes: ["equation-block", "proof", "calculation-area", "drawing-area",
                            "figure", "plain-question", "short-answer"],
      typographyRules: { bodyFamily: "mincho", headingFamily: "gothic", basePt: 10.5, lineHeight: 1.9 },
      choiceRules: { marker: "number-dot", allowTwoColumn: true, twoColumnMaxChars: 10 },
      figureRules: { maxRowItems: 2, minItemWidth: "third-page", preserveAspectRatio: true },
      answerSheetRules: { defaultFamily: "answer-math-work", preferBoxSequence: false,
                          preferWorkArea: true },
      pageBreakRules: { allowPassageSplit: false, keepQuestionWithChoices: true }
    }),
    science: P({
      id: "science", name: "理科",
      preferredBlockTypes: ["figure-group", "figure-right", "graph-analysis", "table-analysis",
                            "experiment-procedure", "passage-with-questions", "passage",
                            "plain-question", "short-answer"],
      figureRules: { maxRowItems: 3, minItemWidth: "quarter-page", preserveAspectRatio: true },
      answerSheetRules: { defaultFamily: "answer-dense-grid", preferBoxSequence: false }
    }),
    "social-studies": P({
      id: "social-studies", name: "社会",
      preferredBlockTypes: ["map-question", "timeline", "table-analysis", "source-comparison",
                            "graph-analysis", "passage-with-questions", "passage",
                            "plain-question", "short-answer"],
      figureRules: { maxRowItems: 2, minItemWidth: "third-page", preserveAspectRatio: true },
      answerSheetRules: { defaultFamily: "answer-dense-grid", preferBoxSequence: false }
    }),
    information: P({
      id: "information", name: "情報",
      preferredBlockTypes: ["code-block", "table-analysis", "figure", "passage", "plain-question",
                            "short-answer"],
      typographyRules: { bodyFamily: "gothic", headingFamily: "gothic", basePt: 10, lineHeight: 1.75 },
      choiceRules: { marker: "number-dot", allowTwoColumn: false, twoColumnMaxChars: 0 },
      answerSheetRules: { defaultFamily: "answer-dense-grid", preferBoxSequence: false },
      pageBreakRules: { allowPassageSplit: true, keepQuestionWithChoices: true }
    }),
    general: P({
      id: "general", name: "汎用",
      preferredBlockTypes: ["passage-with-questions", "passage", "plain-question", "choice-list",
                            "figure", "short-answer", "essay"]
    })
  };
  var SUBJECT_IDS = Object.keys(SUBJECT_PACKS);

  /* 教科の決め方。
     1) 利用者の指定 → 2) MockSpec の subject → 3) 中身からの安全な判定 → 4) general
     3) は「はっきりした手がかりがあるときだけ」。曖昧なら general へ落とす。 */
  var SUBJECT_WORDS = {
    japanese: ["国語", "現代文", "古文", "漢文", "古典"],
    english: ["英語", "english", "communication", "英表", "英コミ"],
    mathematics: ["数学", "算数", "数Ⅰ", "数Ⅱ", "数Ⅲ", "数A", "数B", "数C", "math"],
    science: ["理科", "物理", "化学", "生物", "地学", "science"],
    "social-studies": ["社会", "地理", "歴史", "公民", "日本史", "世界史", "政治", "経済", "倫理"],
    information: ["情報", "プログラミング", "information"]
  };
  function detectSubject(spec, explicit) {
    if (explicit && SUBJECT_PACKS[explicit]) return { id: explicit, source: "explicit" };
    var text = String((spec && spec.subject) || "").toLowerCase();
    if (text) {
      for (var i = 0; i < SUBJECT_IDS.length; i++) {
        var id = SUBJECT_IDS[i];
        var words = SUBJECT_WORDS[id] || [];
        for (var j = 0; j < words.length; j++) {
          if (text.indexOf(String(words[j]).toLowerCase()) >= 0) return { id: id, source: "spec-subject" };
        }
      }
    }
    /* 中身からの判定。**はっきりした手がかりだけ**を見る。 */
    var hint = detectFromContent(spec);
    if (hint) return { id: hint, source: "content" };
    return { id: "general", source: "fallback" };
  }
  function detectFromContent(spec) {
    var qs = allQuestions(spec);
    if (!qs.length) return null;
    var code = 0, eq = 0, map = 0, en = 0;
    qs.forEach(function (q) {
      (q.contentBlocks || []).forEach(function (b) {
        if (b.type === "code") code++;
        if (b.type === "equation" || b.type === "formula") eq++;
        if (b.type === "map") map++;
      });
      if (q.type === "formula") eq++;
      if (q.type === "english_writing") en++;
      /* 問題文がほぼ英字だけなら英語とみなす（日本語が混ざっていたら判定しない） */
      var t = String(q.prompt || "");
      if (t && !/[ぁ-んァ-ン一-龥]/.test(t) && /[A-Za-z]{6,}/.test(t)) en++;
    });
    var n = qs.length;
    if (code >= Math.max(1, n * 0.3)) return "information";
    if (en >= Math.max(2, n * 0.5)) return "english";
    if (eq >= Math.max(2, n * 0.4)) return "mathematics";
    if (map >= 1) return "social-studies";
    return null;
  }

  /* ══════════════════════════════════════════════════════════════════
     解答用紙ファミリー
     ══════════════════════════════════════════════════════════════════ */
  function A(o) {
    return Object.assign({
      available: false,
      questionTypes: S.QUESTION_TYPES.slice(),
      minimumWritingArea: { "short-answer": "small", "essay": "large", "choice": "tiny" },
      cellTypes: ["section-label", "question-label", "small-box", "box-sequence", "wide-answer",
                  "lined-answer", "merged-answer", "fixed-label", "score-cell", "score-denominator",
                  "recheck-box", "student-field", "spacer"],
      scoreArea: { perSection: true, denominator: true, total: true },
      recheck: false,
      studentFields: ["year", "class", "no", "name"],
      pageSplit: { allowSectionSplit: false, repeatHeaderOnNewPage: true },
      sectionBlock: { sectionLabel: "vertical", rule: "thick" },
      fallback: "answer-dense-grid",
      version: "1.0.0"
    }, o);
  }
  var ANSWER_FAMILIES = {
    /* 校正済み。既存の school-answer-grid-dense と同じもの。 */
    "answer-dense-grid": A({
      id: "answer-dense-grid", name: "罫線型・高密度",
      available: true,
      profileId: "school-answer-grid-dense",
      recheck: true,
      fallback: "answer-dense-grid"
    }),
    "answer-standard-grid": A({ id: "answer-standard-grid", name: "罫線型・標準" }),
    "answer-written-heavy": A({ id: "answer-written-heavy", name: "記述欄重視",
      minimumWritingArea: { "short-answer": "medium", "essay": "xlarge", "choice": "tiny" } }),
    "answer-math-work": A({ id: "answer-math-work", name: "数学・計算欄つき",
      minimumWritingArea: { "short-answer": "medium", "essay": "xlarge", "choice": "tiny" } }),
    "answer-english": A({ id: "answer-english", name: "英語（連続マス）" }),
    "answer-japanese": A({ id: "answer-japanese", name: "国語（原稿用紙）" }),
    "answer-mark": A({ id: "answer-mark", name: "マーク中心" }),
    "answer-inline": A({ id: "answer-inline", name: "問題用紙に直接記入",
      scoreArea: { perSection: false, denominator: false, total: true } })
  };
  var ANSWER_FAMILY_IDS = Object.keys(ANSWER_FAMILIES);

  /* ══════════════════════════════════════════════════════════════════
     ページ番号
     ══════════════════════════════════════════════════════════════════ */
  /* ══════════════════════════════════════════════════════════════════
     表紙
     ・「何を載せるか」だけを意味として持つ。値そのものは持たない。
       値（試験名・科目・日時）は spec にあるものを Renderer が引く。
       ここへ文章を入れると、Semantic Plan に利用者の文字が混ざる。
     ・付けるかどうかは Document Family か、呼び出し側の指定で決まる。
       Typst / TeX のコードの中に固定しない。
     ══════════════════════════════════════════════════════════════════ */
  var COVER_FIELDS = ["year", "examName", "subject", "grade", "course", "dateTime",
                      "duration", "totalPoints", "pageCount", "notes",
                      "studentFields", "sealNote"];
  function normalizeCover(c) {
    if (c === false || c === null || c === undefined) return null;
    if (c === true) c = {};
    if (typeof c !== "object") return null;
    var fields = Array.isArray(c.fields)
      ? c.fields.filter(function (f) { return COVER_FIELDS.indexOf(f) >= 0; })
      : COVER_FIELDS.slice();
    var sf = Array.isArray(c.studentFields) && c.studentFields.length
      ? c.studentFields.slice(0, 6).map(function (s) { return String(s).slice(0, 8); })
      : ["年", "組", "番", "氏名"];
    return {
      enabled: true,
      fields: fields,
      studentFields: sf,
      /* 「開始の指示があるまで開かないこと」を出すか */
      sealNote: c.sealNote !== false,
      /* ページ数は組んだあとにしか分からない。組版側で数えさせる。 */
      pageCountAuto: c.pageCountAuto !== false
    };
  }

  var PAGE_NUMBER_POSITIONS = ["bottom-center", "bottom-right", "bottom-left", "bottom-outer",
                               "top-center", "top-right"];
  var PAGE_NUMBER_STYLES = ["plain", "dash", "slash", "labeled"];
  function normalizePageNumber(pn) {
    var d = { enabled: true, position: "bottom-center", style: "dash", startNumber: 1,
              coverIncluded: false, prefix: "", suffix: "" };
    if (!pn || typeof pn !== "object") return d;
    return {
      enabled: pn.enabled !== false,
      position: PAGE_NUMBER_POSITIONS.indexOf(pn.position) >= 0 ? pn.position : d.position,
      style: PAGE_NUMBER_STYLES.indexOf(pn.style) >= 0 ? pn.style : d.style,
      startNumber: (typeof pn.startNumber === "number" && pn.startNumber >= 0) ? Math.floor(pn.startNumber) : 1,
      coverIncluded: pn.coverIncluded === true,
      prefix: typeof pn.prefix === "string" ? pn.prefix.slice(0, 20) : "",
      suffix: typeof pn.suffix === "string" ? pn.suffix.slice(0, 20) : ""
    };
  }
  /* 表示文字列。total が分からない場合は「1 / ?」にしない（嘘の数を出さない）。 */
  function pageNumberText(pn, page, total) {
    var n = (pn.startNumber || 1) + (page - 1);
    var core;
    if (pn.style === "dash") core = "- " + n + " -";
    else if (pn.style === "slash") core = (total ? n + " / " + total : String(n));
    else if (pn.style === "labeled") core = "ページ " + n;
    else core = String(n);
    return (pn.prefix ? pn.prefix + " " : "") + core + (pn.suffix ? " " + pn.suffix : "");
  }

  /* ══════════════════════════════════════════════════════════════════
     Semantic Layout Plan を組み立てる

     順番（Seed はいちばん最後）
       1) 教科と文書ファミリーを決める
       2) 問題の中身から必要なブロックを判定する
       3) 長さ・図表数・選択肢長・解答形式から、合わない候補を外す
       4) 用紙で入らない候補を外す
       5) 残った安全な候補から Seed で variant を選ぶ
       6) 制約を満たせなければ fallbackVariant へ
     ══════════════════════════════════════════════════════════════════ */
  function allQuestions(spec) {
    var out = [];
    ((spec && spec.sections) || []).forEach(function (sec) {
      (sec.questions || []).forEach(function (q) { out.push(q); });
    });
    return out;
  }
  var FIGURE_TYPES = ["figure", "table", "chart", "diagram", "map", "graph"];
  function figuresOf(q) {
    return (q && Array.isArray(q.contentBlocks) ? q.contentBlocks : [])
      .filter(function (b) { return b && FIGURE_TYPES.indexOf(b.type) >= 0; });
  }
  function contentOf(q, types) {
    return (q && Array.isArray(q.contentBlocks) ? q.contentBlocks : [])
      .filter(function (b) { return b && types.indexOf(b.type) >= 0; });
  }

  /* 2) 中身から「どのブロックが要るか」を出す。ここに Seed は使わない。 */
  function candidateBlocks(q, pack) {
    var figs = figuresOf(q);
    var tables = figs.filter(function (f) { return f.type === "table"; });
    var maps = figs.filter(function (f) { return f.type === "map"; });
    var graphs = figs.filter(function (f) { return f.type === "chart" || f.type === "graph"; });
    var code = contentOf(q, ["code"]);
    var passages = contentOf(q, ["passage"]);
    var dialogues = contentOf(q, ["dialogue"]);
    var sources = (q.sourceReferences || []).filter(function (s) { return s && s.excerpt; });

    var cand = [];
    function want(type) {
      if (!BLOCKS[type]) return;
      if (pack.allowedBlockTypes.indexOf(type) < 0) return;
      if (cand.indexOf(type) < 0) cand.push(type);
    }

    /* 資料の種類から */
    if (code.length) want("code-block");
    if (dialogues.length) want("dialogue");
    if (passages.length) want(passages.length && (q.__hasSiblings ? "passage-with-questions" : "passage"));
    if (sources.length >= 2) want("source-comparison");
    if (maps.length) want("map-question");
    if (graphs.length) want("graph-analysis");
    if (tables.length && figs.length === tables.length) want("table-analysis");

    /* 図表の数から */
    if (figs.length >= 2) want("figure-group");
    else if (figs.length === 1) { want("figure"); want("figure-right"); }

    /* 設問の形式から */
    if (q.type === "matching") want("matching");
    if (q.type === "ordering") want("ordering");
    if (q.type === "fill_blank") want("fill-in-blanks");
    if (q.type === "formula") { want("equation-block"); want("calculation-area"); }
    if (pack.id === "mathematics" && isProofPrompt(q)) { want("proof"); want("calculation-area"); }
    if (isDrawingPrompt(q)) want("drawing-area");

    /* 選択肢があるなら選択肢ブロック */
    if ((q.choices || []).length) want("choice-list");

    /* 解答の入れもの */
    if (S.isAiGraded(q.type)) want("essay");
    else if (S.isDeterministic(q.type) && !(q.choices || []).length) want("short-answer");

    /* 何も当てはまらなければ、教科の好みから */
    if (!cand.length) {
      (pack.preferredBlockTypes || []).forEach(want);
      want(pack.fallbackRules.block);
    }
    /* 問題文そのものは必ず要る */
    if (cand.indexOf("plain-question") < 0) cand.unshift("plain-question");
    return cand;
  }
  function isProofPrompt(q) { return /証明し|証明せよ|示しなさい|示せ/.test(String(q.prompt || "")); }
  function isDrawingPrompt(q) {
    return /作図|かきなさい|描きなさい|図示|書き込み|記入しなさい/.test(String(q.prompt || ""));
  }

  /* 3) 中身に合わない候補を外す。 */
  function screenByContent(types, q, pack) {
    var figs = figuresOf(q);
    var tables = figs.filter(function (f) { return f.type === "table"; });
    var sources = (q.sourceReferences || []).filter(function (s) { return s && s.excerpt; });
    var choices = q.choices || [];
    var maxChoiceLen = choices.length
      ? Math.max.apply(null, choices.map(function (c) { return String(c.text || "").length; })) : 0;

    return types.filter(function (t) {
      var b = BLOCKS[t], r = b.requires || {};
      if (r.minFigures != null && figs.length < r.minFigures) return false;
      if (r.maxFigures != null && figs.length > r.maxFigures) return false;
      if (r.minTables != null && tables.length < r.minTables) return false;
      if (r.minSources != null && sources.length < r.minSources) return false;
      /* 設問形式の縛り */
      if (b.questionTypes.length && b.questionTypes.indexOf(q.type) < 0
          && b.semanticRole !== "stimulus") return false;
      /* 長い選択肢では 2 段組みの候補を残さない（教科パックの指定にも従う） */
      if (t === "choice-list" && !pack.choiceRules.allowTwoColumn) return true;
      return true;
    }).map(function (t) {
      /* 選択肢ブロックの許可 variant を、選択肢の長さで削る */
      if (t !== "choice-list") return t;
      return t;
    });
  }

  /* 5) 許可 variant のうち、中身と紙面で使えるものだけを残す。 */
  function allowedVariants(type, q, pack, paper) {
    var b = BLOCKS[type];
    var vs = (b.variants || []).slice();
    var choices = q.choices || [];
    var maxLen = choices.length
      ? Math.max.apply(null, choices.map(function (c) { return String(c.text || "").length; })) : 0;

    if (type === "choice-list") {
      if (!pack.choiceRules.allowTwoColumn || maxLen > (pack.choiceRules.twoColumnMaxChars || 0)) {
        vs = vs.filter(function (v) { return v !== "two-column"; });
      }
      if (maxLen > 24) vs = vs.filter(function (v) { return v !== "inline"; });
    }
    if (type === "figure-group") {
      var n = figuresOf(q).length;
      var maxRow = (pack.figureRules && pack.figureRules.maxRowItems) || 3;
      /* 横に並べると 1 点が細くなりすぎるなら、横並びを外す */
      if (n > maxRow || perItemWidthHint(n, paper) === "too-narrow") {
        vs = vs.filter(function (v) { return v !== "horizontal-centered" && v !== "grid"; });
      }
    }
    return vs.length ? vs : [b.fallbackVariant];
  }
  /* 用紙の内寸を「意味の階級」で見る。ここでも mm は返さない。 */
  function perItemWidthHint(n, paper) {
    var cw = contentWidthClass(paper);
    if (n <= 1) return "wide";
    if (n === 2) return cw === "narrow" ? "narrow" : "medium";
    if (n === 3) return cw === "narrow" ? "too-narrow" : "narrow";
    return "too-narrow";
  }
  function contentWidthClass(paper) {
    var size = (paper && paper.size) || "A4";
    if (size === "A3" || size === "B4") return "wide";
    if (size === "B5") return "narrow";
    return "standard";
  }

  /* 解答欄の意味。mm は持たない。 */
  var ANSWER_PURPOSES = ["choice", "true-false", "short-answer", "numeric", "formula",
                         "matching", "ordering", "written", "essay", "work-area", "drawing"];
  function answerSemanticFor(q, binding, pack) {
    var hint = q && q.answerLayoutHint;
    /* 1) 利用者の指定がいちばん強い */
    if (hint && S.ANSWER_CELL_KINDS && S.ANSWER_CELL_KINDS.indexOf(hint.kind) >= 0) {
      return {
        purpose: purposeForKind(hint.kind),
        cellKind: hint.kind,
        count: clampInt(hint.count, 1, 40) || 1,
        size: sizeForKind(hint.kind),
        minimumWritingArea: areaForKind(hint.kind),
        preferredPlacement: hint.kind === "small-box" ? "same-row" : "own-row",
        source: "hint"
      };
    }
    /* 2) 形式から */
    var kind, purpose, count = 1;
    if (q.type === "multiple_choice_single" || q.type === "multiple_choice_multiple") {
      kind = "small-box"; purpose = "choice";
    } else if (q.type === "true_false") { kind = "small-box"; purpose = "true-false"; }
    else if (q.type === "matching" || q.type === "ordering") {
      kind = "small-box"; purpose = q.type;
      count = Math.max(1, (binding && binding.blankCount) || (q.choices || []).length || 1);
    } else if (q.type === "formula") { kind = "merged-answer"; purpose = "formula"; }
    else if (S.isAiGraded(q.type)) { kind = "lined-answer"; purpose = "essay"; }
    else { kind = "wide-answer"; purpose = "short-answer"; }
    if (binding && binding.blankCount > 1 && kind === "wide-answer") count = Math.min(40, binding.blankCount);

    /* 3) 中身の手がかり（字数の指定・英単語のマス） */
    var chars = charHintOf(q);
    if (kind === "wide-answer" && chars >= 15) { kind = "lined-answer"; purpose = "written"; }
    if (kind === "lined-answer" && chars && chars <= 14) { kind = "wide-answer"; purpose = "short-answer"; }
    if (pack.answerSheetRules.preferBoxSequence && kind === "wide-answer" && chars && chars <= 20) {
      kind = "box-sequence"; purpose = "short-answer"; count = chars;
    }
    if (pack.answerSheetRules.preferWorkArea && S.isAiGraded(q.type)) purpose = "work-area";

    return {
      purpose: purpose, cellKind: kind, count: count,
      size: sizeForKind(kind), minimumWritingArea: areaForKind(kind),
      preferredPlacement: kind === "small-box" ? "same-row" : "own-row",
      chars: chars, source: "type"
    };
  }
  function purposeForKind(k) {
    return k === "small-box" ? "choice" : k === "box-sequence" ? "short-answer"
      : k === "lined-answer" ? "essay" : k === "merged-answer" ? "formula"
      : k === "fixed-label" ? "choice" : "short-answer";
  }
  function sizeForKind(k) {
    return k === "small-box" || k === "fixed-label" ? "tiny"
      : k === "box-sequence" ? "small"
      : k === "wide-answer" ? "medium"
      : k === "merged-answer" ? "large" : "xlarge";
  }
  function areaForKind(k) {
    return k === "small-box" || k === "fixed-label" ? "tiny"
      : k === "box-sequence" ? "tiny"
      : k === "wide-answer" ? "small"
      : k === "merged-answer" ? "medium" : "large";
  }
  function charHintOf(q) {
    var t = String((q && q.prompt) || "");
    var m = t.match(/([0-9０-９]{1,3})\s*字/);
    if (m) {
      var n = parseInt(m[1].replace(/[０-９]/g, function (c) {
        return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
      }), 10);
      if (n >= 1 && n <= 400) return n;
    }
    return 0;
  }
  function clampInt(v, lo, hi) {
    var n = Number(v);
    if (!isFinite(n)) return 0;
    n = Math.floor(n);
    return Math.max(lo, Math.min(hi, n));
  }

  /* ── Semantic Plan 本体 ─────────────────────────────────────── */
  function buildSemanticPlan(spec, opts) {
    opts = opts || {};
    var familyId = DOCUMENT_FAMILIES[opts.documentFamily] ? opts.documentFamily : "school-exam-standard";
    var family = DOCUMENT_FAMILIES[familyId];
    var subject = detectSubject(spec, opts.subject);
    var pack = SUBJECT_PACKS[subject.id];
    var answerFamilyId = ANSWER_FAMILIES[opts.answerFamily] ? opts.answerFamily
      : (pack.answerSheetRules.defaultFamily && ANSWER_FAMILIES[pack.answerSheetRules.defaultFamily]
          ? pack.answerSheetRules.defaultFamily : family.defaultAnswerFamily);
    var answerFamily = ANSWER_FAMILIES[answerFamilyId];
    /* 使えないファミリーが選ばれたら、fallback をたどって使えるものへ落とす。 */
    var notices = [];
    if (!answerFamily.available) {
      notices.push("「" + answerFamily.name + "」はまだ用意できていないため、"
        + ANSWER_FAMILIES[answerFamily.fallback].name + "で作ります。");
      answerFamilyId = answerFamily.fallback;
      answerFamily = ANSWER_FAMILIES[answerFamilyId];
    }
    if (!family.available) {
      notices.push("「" + family.name + "」はまだ用意できていないため、"
        + DOCUMENT_FAMILIES["school-exam-standard"].name + "で作ります。");
      familyId = "school-exam-standard";
      family = DOCUMENT_FAMILIES[familyId];
    }

    var paper = { size: (spec.paper && spec.paper.size) || family.paperSizes[0],
                  orientation: (spec.paper && spec.paper.orientation) || family.orientations[0] };
    var rand = opts.rng || function () { return 0; };
    var bindings = {};
    (spec.answerBindings || []).forEach(function (b) { bindings[b.id] = b; });

    var seq = 0;
    var sections = (spec.sections || []).map(function (sec, si) {
      var qs = sec.questions || [];
      return {
        sectionId: sec.id,
        number: sec.number,
        role: "section",
        marker: (family.sectionStart.marker || "問{n}").replace("{n}", String(sec.number)),
        markerVariant: family.sectionStart.markerVariant,
        startsNewPage: family.sectionStart.newPageFrom > 0
          ? (si + 1) >= family.sectionStart.newPageFrom : false,
        constraints: { forbidOrphanHeading: family.pageBreak.forbidOrphanHeading },
        blocks: qs.map(function (q) {
          q.__hasSiblings = qs.length > 1;
          /* 2) → 3) → 4) → 5) の順。Seed は 5) だけ。 */
          var cand = screenByContent(candidateBlocks(q, pack), q, pack);
          var primary = choosePrimary(cand, pack);
          var vs = allowedVariants(primary, q, pack, paper);
          var chosen = vs[Math.floor(rand() * vs.length) % vs.length] || BLOCKS[primary].fallbackVariant;
          var b = BLOCKS[primary];
          var binding = bindings[q.answerBindingId] || null;
          var ans = answerSemanticFor(q, binding, pack);
          seq++;
          return {
            id: "sb" + seq,
            type: primary,
            semanticRole: b.semanticRole,
            sourceQuestionIds: [q.id],
            contentRefs: figuresOf(q).map(function (f, i) {
              return { kind: f.type, index: i, id: f.id || (q.id + "-c" + i) };
            }),
            answerBindingIds: q.answerBindingId ? [q.answerBindingId] : [],
            /* 使わなかった候補も残す。あとから「なぜこれになったか」を追えるように。 */
            candidates: cand,
            preferredVariants: vs,
            variant: chosen,
            fallbackVariant: b.fallbackVariant,
            constraints: Object.assign({}, b.constraints),
            /* 解答欄の意味（mm は無い） */
            answerField: {
              type: "answerField",
              purpose: ans.purpose,
              size: ans.size,
              count: ans.count,
              minimumWritingArea: ans.minimumWritingArea,
              preferredPlacement: ans.preferredPlacement,
              cellKind: ans.cellKind,
              decidedBy: ans.source,
              questionId: q.id,
              answerBindingId: q.answerBindingId || null
            },
            choice: (q.choices || []).length ? {
              count: q.choices.length,
              marker: pack.choiceRules.marker,
              allowColumns: allowedVariants("choice-list", q, pack, paper).indexOf("two-column") >= 0
                ? [1, 2] : [1]
            } : null
          };
        })
      };
    });

    return {
      grammarVersion: GRAMMAR_VERSION,
      planKind: "semantic",
      mockId: spec.id,
      documentFamily: familyId,
      documentFamilyVersion: family.version,
      subject: subject.id,
      subjectSource: subject.source,
      subjectPackVersion: pack.version,
      answerFamily: answerFamilyId,
      answerFamilyVersion: answerFamily.version,
      writingDirection: pack.writingDirection,
      paper: paper,
      typography: {
        bodyFamily: pack.typographyRules.bodyFamily,
        headingFamily: pack.typographyRules.headingFamily,
        /* 大きさは階級で持つ。pt へ落とすのは Resolver。 */
        bodyScale: "standard",
        lineSpacing: pack.typographyRules.lineHeight >= 2 ? "loose" : "standard"
      },
      density: family.density,
      pageNumber: normalizePageNumber(family.pageNumber),
      /* 表紙。opts.cover が指定されていればそれが強い（false で消せる）。 */
      cover: opts.cover !== undefined ? !!normalizeCover(opts.cover) : !!family.cover,
      coverPlan: normalizeCover(opts.cover !== undefined ? opts.cover : family.cover),
      sections: sections,
      notices: notices
    };
  }
  /* 候補の中から主役を 1 つ選ぶ。教科の好みを先に見る（Seed は使わない）。 */
  function choosePrimary(cand, pack) {
    var pref = pack.preferredBlockTypes || [];
    for (var i = 0; i < pref.length; i++) {
      if (cand.indexOf(pref[i]) >= 0) return pref[i];
    }
    /* 好みに無ければ、資料を持つブロックを優先し、無ければ問題文だけ。
       stimulus-group（本文＋設問群）も資料として扱う。ここを外すと
       長文の設問がただの plain-question になり、ページまたぎを許せなくなる。 */
    var stim = cand.filter(function (t) {
      return BLOCKS[t].semanticRole === "stimulus" || BLOCKS[t].semanticRole === "stimulus-group";
    });
    if (stim.length) return stim[0];
    var qb = cand.filter(function (t) { return BLOCKS[t].semanticRole === "question"; });
    if (qb.length) return qb[0];
    return cand[0] || "plain-question";
  }

  /* ══════════════════════════════════════════════════════════════════
     Semantic Plan の検証
     ・Renderer 固有の値が紛れていないことを、ここで機械的に確かめる。
     ══════════════════════════════════════════════════════════════════ */
  /* 見つけたら失格にする語。mm・pt・%・列・CSS・組版ソース。 */
  /* ここに挙げた名前は Renderer 固有。Semantic Plan に出てきたら失格。
     "style" は入れない — pageNumber.style のような「意味の書式」に使うため。
     代わりに、値が CSS / 組版ソースに見えるものを findRendererValues で拾う。 */
  var FORBIDDEN_KEYS = ["widthMm", "heightMm", "colSpan", "rowSpan", "borderWidth", "basePt",
                        "lineHeight", "widthPct", "bodyWidthPct", "figureWidthPct", "columns",
                        "css", "html", "className", "typst", "tex", "latex",
                        "questionGapMm", "marginMm", "fontSizePt", "minWidthMm", "mmPerCol"];
  /* 値そのものが組版ソースに見えるか（CSS 宣言・タグ・単位つきの数）。 */
  function looksLikeRendererValue(v) {
    if (typeof v !== "string") return false;
    if (/^\s*<[a-zA-Z]/.test(v)) return true;                 /* HTML タグ */
    if (/[a-z-]+\s*:\s*[^;]+;/.test(v)) return true;          /* CSS 宣言 */
    if (/\d+(\.\d+)?\s*(mm|pt|px|em|rem|%)\b/.test(v)) return true;  /* 単位つきの数 */
    if (/\\[a-zA-Z]{2,}\s*\{/.test(v)) return true;            /* TeX の命令 */
    if (/#(let|set|show)\b/.test(v)) return true;             /* Typst の命令 */
    return false;
  }
  function findRendererValues(node, path, out) {
    out = out || [];
    path = path || "";
    if (node === null || typeof node !== "object") return out;
    if (Array.isArray(node)) {
      node.forEach(function (v, i) { findRendererValues(v, path + "[" + i + "]", out); });
      return out;
    }
    Object.keys(node).forEach(function (k) {
      var p = path ? path + "." + k : k;
      if (FORBIDDEN_KEYS.indexOf(k) >= 0 || looksLikeRendererValue(node[k])) {
        out.push({ path: p, key: k, value: node[k] });
      }
      findRendererValues(node[k], p, out);
    });
    return out;
  }
  function validateSemanticPlan(plan, spec) {
    var out = [];
    function err(code, msg, path) { out.push({ severity: "error", code: code, message: msg, path: path || "" }); }
    if (!plan || plan.planKind !== "semantic") { err("planKind", "Semantic Plan ではありません"); return out; }
    if (!DOCUMENT_FAMILIES[plan.documentFamily]) err("family", "知らない文書ファミリーです: " + plan.documentFamily);
    if (!SUBJECT_PACKS[plan.subject]) err("subject", "知らない教科パックです: " + plan.subject);
    if (!ANSWER_FAMILIES[plan.answerFamily]) err("answerFamily", "知らない解答用紙ファミリーです: " + plan.answerFamily);

    /* Renderer 固有の値が入っていないこと */
    findRendererValues(plan).forEach(function (h) {
      err("rendererValue", "Semantic Plan に Renderer 固有の値が入っています: " + h.path, h.path);
    });

    /* 問題 ID と解答 Binding が保たれていること */
    if (spec) {
      var qs = allQuestions(spec);
      var seen = {}, bindings = {};
      (plan.sections || []).forEach(function (sec) {
        (sec.blocks || []).forEach(function (b) {
          (b.sourceQuestionIds || []).forEach(function (id) { seen[id] = true; });
          (b.answerBindingIds || []).forEach(function (id) { bindings[id] = true; });
          if (!BLOCKS[b.type]) err("blockType", "知らないブロック型です: " + b.type, b.id);
          else if (BLOCKS[b.type].variants.indexOf(b.variant) < 0) {
            err("variant", "許可されていない variant です: " + b.type + "/" + b.variant, b.id);
          }
          if (b.answerField && ANSWER_PURPOSES.indexOf(b.answerField.purpose) < 0) {
            err("purpose", "知らない解答欄の用途です: " + b.answerField.purpose, b.id);
          }
          if (b.answerField && SIZE_CLASSES.indexOf(b.answerField.size) < 0) {
            err("size", "知らない大きさの階級です: " + b.answerField.size, b.id);
          }
          if (b.answerField && WRITING_AREAS.indexOf(b.answerField.minimumWritingArea) < 0) {
            err("writingArea", "知らない記入面積の階級です", b.id);
          }
        });
      });
      qs.forEach(function (q) {
        if (!seen[q.id]) err("missingQuestion", "問 " + q.number + " が Semantic Plan にありません", q.id);
        if (q.answerBindingId && !bindings[q.answerBindingId]) {
          err("missingBinding", "問 " + q.number + " の解答 Binding がありません", q.id);
        }
      });
    }
    return out;
  }

  /* ══════════════════════════════════════════════════════════════════
     Resolver（Semantic → Resolved）
     ・ここで初めて mm・列数・pt を決める。
     ・用紙と Renderer が変われば、同じ Semantic Plan から別の実寸が出る。
     ══════════════════════════════════════════════════════════════════ */
  var PAPER_MM = { A4: { w: 210, h: 297 }, A3: { w: 297, h: 420 },
                   B4: { w: 257, h: 364 }, B5: { w: 182, h: 257 } };
  /* 大きさの階級 → 内寸に対する割合 */
  var SIZE_RATIO = { tiny: 0.10, small: 0.24, medium: 0.36, large: 0.62, xlarge: 0.92, full: 1.0 };
  var WIDTH_HINT_RATIO = { minimal: 0.12, "quarter-page": 0.25, "third-page": 0.33,
                           "half-page": 0.5, "two-thirds-page": 0.66, "full-page": 1.0 };
  /* 記入面積の下限（mm²）。ここを割る欄は作らない。 */
  var AREA_MM2 = { none: 0, tiny: 120, small: 400, medium: 900, large: 1200, xlarge: 4000 };

  function paperMm(paper) {
    var p = PAPER_MM[(paper && paper.size) || "A4"] || PAPER_MM.A4;
    return (paper && paper.orientation === "landscape") ? { w: p.h, h: p.w } : { w: p.w, h: p.h };
  }
  function resolveSemanticPlan(semantic, opts) {
    opts = opts || {};
    var engine = opts.engine || "current";
    var margins = opts.margins || { top: 20, bottom: 20, left: 18, right: 18 };
    var mm = paperMm(semantic.paper);
    var contentWidthMm = mm.w - margins.left - margins.right;
    var columns = opts.columns || 24;
    var mmPerCol = contentWidthMm / columns;
    var basePt = opts.basePt || (semantic.typography.bodyScale === "small" ? 9.5 : 10.5);
    var lineHeight = semantic.typography.lineSpacing === "loose" ? 2.0 : 1.85;

    function widthOf(sizeClass) {
      return Math.round(contentWidthMm * (SIZE_RATIO[sizeClass] || 0.36) * 10) / 10;
    }
    function spanOf(widthMm) {
      return Math.max(1, Math.min(columns, Math.ceil((widthMm + 2.4) / mmPerCol)));
    }
    function heightOf(sizeClass) {
      return sizeClass === "tiny" ? 9 : sizeClass === "small" ? 9
        : sizeClass === "medium" ? 10 : sizeClass === "large" ? 12 : 11;
    }
    function rowsOf(af) {
      if (af.cellKind === "lined-answer") return 3;
      if (af.minimumWritingArea === "xlarge") return 8;
      return 1;
    }

    var blocks = [];
    (semantic.sections || []).forEach(function (sec) {
      (sec.blocks || []).forEach(function (b) {
        var af = b.answerField || null;
        var r = {
          id: b.id, type: b.type, variant: b.variant,
          sourceQuestionIds: b.sourceQuestionIds.slice(),
          answerBindingIds: b.answerBindingIds.slice(),
          /* 実寸 */
          minimumWidthMm: Math.round(contentWidthMm
            * (WIDTH_HINT_RATIO[b.constraints.minimumWidth] || 1) * 10) / 10,
          allowColumns: b.constraints.allowColumns.slice(),
          keepTogether: b.constraints.keepTogether === true,
          allowPageBreakInside: b.constraints.allowPageBreakInside === true
        };
        if (af) {
          var w = af.cellKind === "lined-answer" || af.cellKind === "merged-answer"
            ? null : widthOf(af.size);
          var h = heightOf(af.size);
          var rows = rowsOf(af);
          /* 記入面積の下限を満たすまで広げる（狭いまま作らない） */
          var need = AREA_MM2[af.minimumWritingArea] || 0;
          var effW = w == null ? contentWidthMm * 0.9 : w;
          while (need > 0 && effW * h * rows < need) {
            if (rows < 12 && (af.cellKind === "lined-answer" || af.minimumWritingArea === "xlarge")) rows++;
            else if (h < 20) h += 1;
            else if (w != null && w < contentWidthMm * 0.9) { w = Math.min(contentWidthMm * 0.9, w + 4); effW = w; }
            else break;
          }
          r.answerCell = {
            cell: af.cellKind, purpose: af.purpose,
            widthMm: w == null ? null : Math.round(w * 10) / 10,
            heightMm: h, rows: rows, cells: af.count,
            colSpan: w == null ? columns : spanOf(w),
            questionId: af.questionId, answerBindingId: af.answerBindingId,
            writingAreaMm2: Math.round((w == null ? contentWidthMm * 0.9 : w) * h * rows)
          };
        }
        blocks.push(r);
      });
    });

    return {
      planKind: "resolved",
      grammarVersion: GRAMMAR_VERSION,
      mockId: semantic.mockId,
      engine: engine,
      documentFamily: semantic.documentFamily,
      subject: semantic.subject,
      answerFamily: semantic.answerFamily,
      paper: {
        size: semantic.paper.size, orientation: semantic.paper.orientation,
        widthMm: mm.w, heightMm: mm.h, margins: margins,
        writingDirection: semantic.writingDirection
      },
      typography: { bodyFamily: semantic.typography.bodyFamily,
                    headingFamily: semantic.typography.headingFamily,
                    basePt: basePt, lineHeight: lineHeight },
      grid: { columns: columns, mmPerCol: Math.round(mmPerCol * 100) / 100 },
      pageNumber: semantic.pageNumber,
      blocks: blocks
    };
  }

  /* Resolved 側の検証。実寸が下限を割っていないか。 */
  function validateResolvedPlan(resolved, semantic) {
    var out = [];
    function err(code, msg, path) { out.push({ severity: "error", code: code, message: msg, path: path || "" }); }
    if (!resolved || resolved.planKind !== "resolved") { err("planKind", "Resolved Plan ではありません"); return out; }
    var bySem = {};
    (semantic.sections || []).forEach(function (s) { (s.blocks || []).forEach(function (b) { bySem[b.id] = b; }); });

    (resolved.blocks || []).forEach(function (b) {
      var sb = bySem[b.id];
      if (!sb) { err("unknownBlock", "Semantic Plan に無いブロックです: " + b.id, b.id); return; }
      if (b.type !== sb.type) err("typeChanged", "ブロック型が変わっています: " + b.id, b.id);
      if (JSON.stringify(b.sourceQuestionIds) !== JSON.stringify(sb.sourceQuestionIds)) {
        err("questionChanged", "設問の対応が変わっています: " + b.id, b.id);
      }
      if (!b.answerCell) return;
      var need = AREA_MM2[sb.answerField.minimumWritingArea] || 0;
      if (need > 0 && b.answerCell.writingAreaMm2 < need) {
        err("writeAreaTooSmall", "記入できる面積が足りません（" + b.answerCell.writingAreaMm2
          + " / " + need + " mm²）", b.id);
      }
      if (b.answerCell.colSpan > resolved.grid.columns) {
        err("colSpan", "列数を超えています: " + b.id, b.id);
      }
      if (b.answerCell.questionId !== sb.answerField.questionId) {
        err("answerMismatch", "解答欄の対応先が変わっています: " + b.id, b.id);
      }
    });
    return out;
  }

  function errorsOf(list) { return (list || []).filter(function (i) { return i.severity === "error"; }); }

  /* ══════════════════════════════════════════════════════════════════
     公開
     ══════════════════════════════════════════════════════════════════ */
  VQ2.layoutGrammar = {
    GRAMMAR_VERSION: GRAMMAR_VERSION,
    SIZE_CLASSES: SIZE_CLASSES,
    WRITING_AREAS: WRITING_AREAS,
    PLACEMENTS: PLACEMENTS,
    WIDTH_HINTS: WIDTH_HINTS,
    ANSWER_PURPOSES: ANSWER_PURPOSES,

    BLOCKS: BLOCKS,
    BLOCK_TYPES: BLOCK_TYPES,
    DOCUMENT_FAMILIES: DOCUMENT_FAMILIES,
    DOCUMENT_FAMILY_IDS: DOCUMENT_FAMILY_IDS,
    SUBJECT_PACKS: SUBJECT_PACKS,
    SUBJECT_IDS: SUBJECT_IDS,
    ANSWER_FAMILIES: ANSWER_FAMILIES,
    ANSWER_FAMILY_IDS: ANSWER_FAMILY_IDS,

    COVER_FIELDS: COVER_FIELDS,
    normalizeCover: normalizeCover,
    PAGE_NUMBER_POSITIONS: PAGE_NUMBER_POSITIONS,
    PAGE_NUMBER_STYLES: PAGE_NUMBER_STYLES,
    normalizePageNumber: normalizePageNumber,
    pageNumberText: pageNumberText,

    detectSubject: detectSubject,
    candidateBlocks: candidateBlocks,
    allowedVariants: allowedVariants,
    answerSemanticFor: answerSemanticFor,

    buildSemanticPlan: buildSemanticPlan,
    resolveSemanticPlan: resolveSemanticPlan,
    validateSemanticPlan: validateSemanticPlan,
    validateResolvedPlan: validateResolvedPlan,
    findRendererValues: findRendererValues,
    looksLikeRendererValue: looksLikeRendererValue,
    FORBIDDEN_KEYS: FORBIDDEN_KEYS,
    AREA_MM2: AREA_MM2,
    errorsOf: errorsOf,

    figuresOf: figuresOf,
    allQuestions: allQuestions
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
