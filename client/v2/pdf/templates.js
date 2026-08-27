/* ══════════════════════════════════════════════════════════════════════
   Template Registry（§17）
   ・紙面のテンプレートはここが唯一の定義。AI に自由な組版ソースを書かせない。
   ・AI がやるのは「どのテンプレートを選ぶか」「許可された範囲の調整」だけ。
   ・テンプレートは版を持つ。MockSpec に使用版を残し、再生成で紙面が壊れないようにする。
   ・engine は現在 "builtin"（HTML/CSS Paged Media）。typst / latex は
     差し替え口だけを用意しており、実行環境が無いため未検証。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});

  var ALL_TYPES = [
    "multiple_choice_single", "multiple_choice_multiple", "true_false",
    "short_answer", "long_answer", "fill_blank", "ordering", "matching",
    "numeric", "formula", "essay", "english_writing", "source_analysis"
  ];

  /* 紙のサイズ（mm）。custom は MockSpec の値を使う。 */
  var PAPER_MM = {
    A4: { w: 210, h: 297 }, A3: { w: 297, h: 420 },
    B4: { w: 257, h: 364 }, B5: { w: 182, h: 257 }
  };

  function T(o) {
    return Object.assign({
      engine: "builtin",
      version: "1.0.0",
      supportedPaperSizes: ["A4", "A3", "B4", "B5"],
      supportedOrientations: ["portrait", "landscape"],
      writingDirection: "horizontal",
      supportedQuestionTypes: ALL_TYPES,
      requiredPackages: [],
      supportedFeatures: ["answer-box", "circled-number", "notice", "points", "source-block", "rubric"],
      defaultMargins: { top: 20, bottom: 20, left: 18, right: 18 },
      minimumFontSize: 9,
      columns: 1,
      validationRules: {},
      previewAsset: null
    }, o);
  }

  /* 第三者の公式試験と誤認させない名前にする（§17）。 */
  var TEMPLATES = {
    "standard-school-exam": T({
      templateId: "standard-school-exam",
      displayName: "標準（校内テスト）",
      description: "大問・小問・解答欄がそろった、もっとも汎用的な横書きの体裁。",
      defaultPaper: { size: "A4", orientation: "portrait" },
      validationRules: { minFontPt: 9, maxQuestionsPerPage: 12 }
    }),

    "periodical-exam": T({
      templateId: "periodical-exam",
      displayName: "定期考査（見開き）",
      description: "A3 見開きで問題と解答欄を並べる、定期考査でよく使う体裁。",
      supportedPaperSizes: ["A3", "B4"],
      defaultPaper: { size: "A3", orientation: "landscape", spread: true },
      columns: 2,
      defaultMargins: { top: 16, bottom: 16, left: 14, right: 14 },
      supportedFeatures: ["answer-box", "circled-number", "notice", "points", "source-block", "rubric", "two-column"],
      validationRules: { minFontPt: 9, requireSpread: true }
    }),

    "common-test-math-inspired": T({
      templateId: "common-test-math-inspired",
      displayName: "数学（マーク式に寄せた体裁）",
      description: "会話文・空欄・分数型の解答欄を含む、数学の共通テスト形式に寄せた独自の体裁。公式の試験そのものではありません。",
      supportedQuestionTypes: ["multiple_choice_single", "fill_blank", "numeric", "formula", "short_answer"],
      supportedFeatures: ["answer-box", "circled-number", "fraction-answer", "dialogue", "notice", "points", "boxed-blank"],
      defaultPaper: { size: "B5", orientation: "portrait" },
      minimumFontSize: 9,
      validationRules: { minFontPt: 9, requireBoxedBlanks: true }
    }),

    "common-test-japanese-inspired": T({
      templateId: "common-test-japanese-inspired",
      displayName: "国語（縦書き・傍線部）",
      description: "縦書き・ルビ・傍線部ラベルを含む、国語の試験に寄せた独自の体裁。公式の試験そのものではありません。",
      writingDirection: "vertical",
      supportedPaperSizes: ["A4", "B4", "B5"],
      supportedOrientations: ["portrait"],
      supportedQuestionTypes: ["multiple_choice_single", "short_answer", "long_answer", "source_analysis", "essay"],
      supportedFeatures: ["vertical", "ruby", "underline-label", "tate-chu-yoko", "source-block", "answer-box", "circled-number"],
      defaultPaper: { size: "B4", orientation: "portrait", writingDirection: "vertical" },
      defaultMargins: { top: 22, bottom: 22, left: 20, right: 20 },
      validationRules: { minFontPt: 10, requireVertical: true }
    }),

    "english-reading": T({
      templateId: "english-reading",
      displayName: "英語（長文読解）",
      description: "本文と設問を分け、行番号を振れる英語長文向けの体裁。",
      supportedQuestionTypes: ["multiple_choice_single", "multiple_choice_multiple", "true_false",
                               "short_answer", "long_answer", "english_writing", "matching", "ordering"],
      supportedFeatures: ["answer-box", "line-numbers", "passage-block", "notice", "points", "circled-number"],
      defaultPaper: { size: "A4", orientation: "portrait" },
      validationRules: { minFontPt: 10 }
    }),

    "history-source-analysis": T({
      templateId: "history-source-analysis",
      displayName: "社会（資料読解）",
      description: "史料・図版・年表を囲み枠で示し、そこから問う体裁。",
      supportedFeatures: ["answer-box", "source-block", "figure-box", "notice", "points", "circled-number", "table"],
      defaultPaper: { size: "A4", orientation: "portrait" },
      validationRules: { minFontPt: 9 }
    }),

    "science-exam": T({
      templateId: "science-exam",
      displayName: "理科",
      description: "実験の図・表・数値解答欄を含む理科向けの体裁。",
      supportedFeatures: ["answer-box", "figure-box", "table", "unit-answer", "notice", "points", "circled-number"],
      defaultPaper: { size: "A4", orientation: "portrait" },
      validationRules: { minFontPt: 9 }
    }),

    "information-exam": T({
      templateId: "information-exam",
      displayName: "情報",
      description: "擬似コード・表・図を等幅で示す情報科向けの体裁。",
      supportedFeatures: ["answer-box", "code-block", "table", "figure-box", "notice", "points"],
      defaultPaper: { size: "A4", orientation: "portrait" },
      validationRules: { minFontPt: 9 }
    }),

    "short-quiz": T({
      templateId: "short-quiz",
      displayName: "小テスト（1枚）",
      description: "1 枚に収める小テスト。解答欄は問題のすぐ横に置く。",
      supportedPaperSizes: ["A4", "B5"],
      defaultPaper: { size: "A4", orientation: "portrait" },
      defaultMargins: { top: 14, bottom: 14, left: 14, right: 14 },
      supportedFeatures: ["inline-answer", "points", "circled-number"],
      validationRules: { minFontPt: 9, maxPages: 2 }
    }),

    "custom-blank": T({
      templateId: "custom-blank",
      displayName: "白紙から",
      description: "装飾のない最小の体裁。自分で組み立てたいとき用。",
      supportedFeatures: ["answer-box", "points"],
      defaultPaper: { size: "A4", orientation: "portrait" },
      validationRules: {}
    })
  };

  var IDS = Object.keys(TEMPLATES);

  function get(id) { return TEMPLATES[id] || null; }
  function list() { return IDS.map(function (id) { return TEMPLATES[id]; }); }

  /* 条件に合うテンプレートを探す。合うものが無ければ標準へ落とす。 */
  function recommend(o) {
    o = o || {};
    var vertical = o.writingDirection === "vertical";
    var subject = String(o.subject || "");
    var candidates = list().filter(function (t) {
      if (vertical && t.writingDirection !== "vertical") return false;
      if (!vertical && t.writingDirection === "vertical") return false;
      if (o.paperSize && t.supportedPaperSizes.indexOf(o.paperSize) < 0) return false;
      if (o.orientation && t.supportedOrientations.indexOf(o.orientation) < 0) return false;
      if (Array.isArray(o.questionTypes) && o.questionTypes.length) {
        for (var i = 0; i < o.questionTypes.length; i++)
          if (t.supportedQuestionTypes.indexOf(o.questionTypes[i]) < 0) return false;
      }
      return true;
    });
    if (!candidates.length) return TEMPLATES["standard-school-exam"];

    var bySubject = [
      { re: /国語|現代文|古文|漢文/, id: "common-test-japanese-inspired" },
      { re: /数学|算数/, id: "common-test-math-inspired" },
      { re: /英語|English/i, id: "english-reading" },
      { re: /日本史|世界史|地理|歴史|公民|政治|経済|社会/, id: "history-source-analysis" },
      { re: /物理|化学|生物|地学|理科/, id: "science-exam" },
      { re: /情報/, id: "information-exam" }
    ];
    for (var j = 0; j < bySubject.length; j++) {
      if (bySubject[j].re.test(subject)) {
        var hit = candidates.find(function (t) { return t.templateId === bySubject[j].id; });
        if (hit) return hit;
      }
    }
    if (o.spread) {
      var sp = candidates.find(function (t) { return t.templateId === "periodical-exam"; });
      if (sp) return sp;
    }
    if (o.questionCount && o.questionCount <= 10) {
      var sq = candidates.find(function (t) { return t.templateId === "short-quiz"; });
      if (sq) return sq;
    }
    var std = candidates.find(function (t) { return t.templateId === "standard-school-exam"; });
    return std || candidates[0];
  }

  /* 紙面設定がテンプレートの制約に合っているかを確かめる。 */
  function validatePaper(paper, templateId) {
    var t = get(templateId);
    var issues = [];
    if (!t) { issues.push({ severity: "error", code: "unknownTemplate", message: "テンプレート " + templateId + " が見つかりません。" }); return issues; }
    if (paper.size !== "custom" && t.supportedPaperSizes.indexOf(paper.size) < 0)
      issues.push({ severity: "error", code: "paperSize",
        message: "「" + t.displayName + "」は " + paper.size + " に対応していません（対応: " + t.supportedPaperSizes.join(" / ") + "）。" });
    if (t.supportedOrientations.indexOf(paper.orientation) < 0)
      issues.push({ severity: "error", code: "orientation",
        message: "「" + t.displayName + "」は " + (paper.orientation === "portrait" ? "縦置き" : "横置き") + "に対応していません。" });
    if (paper.writingDirection !== t.writingDirection)
      issues.push({ severity: "error", code: "writingDirection",
        message: "「" + t.displayName + "」は" + (t.writingDirection === "vertical" ? "縦書き" : "横書き") + "専用です。" });
    if (t.validationRules.minFontPt && paper.minimumFontSize < t.validationRules.minFontPt)
      issues.push({ severity: "warning", code: "fontSize",
        message: "文字が小さすぎます（" + paper.minimumFontSize + "pt）。" + t.validationRules.minFontPt + "pt 以上を推奨します。" });
    if (t.validationRules.requireSpread && !paper.spread)
      issues.push({ severity: "warning", code: "spread", message: "「" + t.displayName + "」は見開きを前提にした体裁です。" });
    var m = paper.margins || {};
    ["top", "bottom", "left", "right"].forEach(function (k) {
      if (typeof m[k] === "number" && m[k] < 8)
        issues.push({ severity: "warning", code: "margin", message: "余白が狭すぎます（" + k + " " + m[k] + "mm）。印刷時に切れる可能性があります。" });
    });
    return issues;
  }

  /* 用紙の実寸（mm）。orientation を反映する。 */
  function paperSizeMm(paper) {
    var base = paper.size === "custom"
      ? { w: paper.customWidthMm || 210, h: paper.customHeightMm || 297 }
      : (PAPER_MM[paper.size] || PAPER_MM.A4);
    if (paper.orientation === "landscape") return { w: base.h, h: base.w };
    return { w: base.w, h: base.h };
  }

  /* この機能をテンプレートが持っているか */
  function supports(templateId, feature) {
    var t = get(templateId);
    return !!(t && t.supportedFeatures.indexOf(feature) >= 0);
  }

  /* ── 組版エンジンの実行可否（正直に返す） ────────────────────
     builtin: 常に利用可能（ブラウザの印刷でPDF化する）
     typst / latex: 実行環境が無いので false。導入されるまで「未検証」。 */
  function engineStatus() {
    return {
      builtin: { available: true, verified: true,
                 note: "HTML/CSS の Paged Media で組み、ブラウザの印刷から PDF にします。" },
      typst:   { available: false, verified: false,
                 note: "Typst の実行環境が導入されていないため利用できません。差し替え口のみ用意しています。" },
      latex:   { available: false, verified: false,
                 note: "LaTeX（upLaTeX / jlreq）の実行環境が導入されていないため利用できません。差し替え口のみ用意しています。" }
    };
  }
  function resolveEngine(requested) {
    var s = engineStatus();
    if (requested && requested !== "auto" && s[requested] && s[requested].available) return requested;
    return "builtin";
  }

  VQ2.templates = {
    TEMPLATES: TEMPLATES,
    IDS: IDS,
    ALL_TYPES: ALL_TYPES,
    PAPER_MM: PAPER_MM,
    get: get,
    list: list,
    recommend: recommend,
    validatePaper: validatePaper,
    paperSizeMm: paperSizeMm,
    supports: supports,
    engineStatus: engineStatus,
    resolveEngine: resolveEngine
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
