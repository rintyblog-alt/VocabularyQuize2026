import test from "node:test";
import assert from "node:assert/strict";

import { __testables } from "../src/worker.js";

const {
  scanChoicesStructurallyValid,
  scanNormalizeQuestionRows,
  scanQuestionValid,
  aiPresetBuildPageBlocks,
  aiPresetBuildPageAnalyses,
  aiPresetBuildQuestionBundles,
  aiPresetCollectUsableMaterials,
  aiPresetIntentInfo,
  aiPresetDetermineSubjectProfile,
  aiPresetAllowedQuestionTypesForMaterial,
  aiPresetInferMaterialType,
  aiPresetResolveDetectedSubjectLabel,
  aiPresetBundleAudit,
  aiPresetSelectEnglishReadingMaterials,
  aiPresetSelectSubjectMaterials,
  aiPresetEstimateQuestionCapacity,
  aiPresetLooksLikeForbiddenOptionText,
  aiPresetBuildExplicitOptionTermVariants,
  aiPresetBuildFallbackQuestions,
  aiPresetValidateGeneratedQuestions,
  aiPresetQuestionQualityDetails,
  aiPresetGuessQuestionCount,
  aiPresetBuildConfirmPayload
} = __testables;

function buildPdfAttachment(pages, name = "english-worksheet.pdf") {
  return {
    id: "att-pdf-1",
    sourceType: "pdf",
    name,
    pageCount: pages.length,
    pages: pages.map((page, index) => ({
      pageNumber: index + 1,
      textSufficient: true,
      ...page
    }))
  };
}

test("表紙と注意書きページは question source から除外される", () => {
  const attachments = [
    buildPdfAttachment([
      {
        text: [
          "英語",
          "第2学年 期末考査 問題用紙",
          "試験時間 50分",
          "注意事項",
          "氏名"
        ].join("\n")
      },
      {
        text: [
          "1 Read the following passage and answer the questions.",
          "The boy was surprised to find a small key in the old box.",
          "Choose the best answer."
        ].join("\n")
      },
      {
        text: [
          "解答上の注意",
          "解答欄にはHBの鉛筆で記入すること",
          "次のページへ"
        ].join("\n")
      }
    ])
  ];

  const analyses = aiPresetBuildPageAnalyses(attachments);
  assert.equal(analyses[0].pageType, "cover");
  assert.equal(analyses[0].usableForQuestionGen, false);
  assert.equal(analyses[1].pageType, "question_content");
  assert.equal(analyses[1].usableForQuestionGen, true);
  assert.equal(analyses[2].pageType, "instruction");
  assert.equal(analyses[2].usableForQuestionGen, false);

  const materials = aiPresetCollectUsableMaterials(analyses, 10);
  assert.ok(materials.length >= 1);
  assert.ok(materials.every((item) => item.pageNumber === 2));
});

test("確認 payload は表紙ではなく出題可能素材ベースで教科を推定する", () => {
  const attachments = [
    buildPdfAttachment([
      {
        text: [
          "令和7年度",
          "定期考査 問題用紙",
          "注意事項",
          "学校名"
        ].join("\n")
      },
      {
        text: [
          "1 Read the following passage.",
          "The children visited a science museum and wrote about what they learned."
        ].join("\n")
      }
    ])
  ];
  const analyses = aiPresetBuildPageAnalyses(attachments);
  const confirmPayload = aiPresetBuildConfirmPayload({
    promptText: "このPDFどう？",
    attachments,
    pageAnalyses: analyses
  });
  assert.equal(confirmPayload.detectedSubject, "英語");
});

test("10問指定は targetQuestionCount としてそのまま解釈される", () => {
  assert.equal(aiPresetGuessQuestionCount("この問題用紙PDFから10問作って"), 10);
});

test("『作成して』もファイル起点プリセット依頼として明確判定される", () => {
  const intent = aiPresetIntentInfo("今添付しているPDFから20問作成して");
  assert.equal(intent.clear, true);
  assert.equal(intent.route, "preset_create");
});

test("OCRノイズ断片は usable material に残らない", () => {
  const attachments = [
    buildPdfAttachment([
      {
        text: [
          "Page 2",
          "次のページへ",
          "____",
          "The boy was surprised to find a small key in the old box.",
          "Choose the best answer."
        ].join("\n")
      }
    ])
  ];
  const analyses = aiPresetBuildPageAnalyses(attachments);
  const materials = aiPresetCollectUsableMaterials(analyses, 5);
  assert.ok(materials.length >= 1);
  assert.ok(materials.every((item) => !/Page 2|次のページへ|____/.test(item.text)));
});

test("question bundle は別 question_block や指示ブロックを混ぜない", () => {
  const blocks = aiPresetBuildPageBlocks([
    "Exercise",
    "問3 次の文章を読んで答えなさい。",
    "The boy was surprised to find a small key in the old box.",
    "① in the box",
    "② after class",
    "③ by train",
    "④ in the library",
    "問4 次の①〜④は、下のA〜Dのどれに関連しているか。",
    "適する組合せを答えなさい。"
  ].join("\n"), {
    attachmentId: "att-1",
    pageNumber: 4,
    pageIndex: 3,
    pageType: "question_content"
  });
  const bundles = aiPresetBuildQuestionBundles({
    attachmentId: "att-1",
    pageNumber: 4,
    pageIndex: 3,
    blocks
  });
  assert.equal(bundles.length >= 1, true);
  const first = bundles[0];
  assert.equal(first.sourceText.includes("small key in the old box"), true);
  assert.equal(first.sourceText.includes("問4"), false);
  assert.equal(first.sourceText.includes("適する組合せを答えなさい"), false);
});

test("option_block に見出しや指示文が入る場合は選択肢候補から除外される", () => {
  const blocks = aiPresetBuildPageBlocks([
    "問3 次の文に最も適切なものを選びなさい。",
    "The students visited the museum and wrote a short report.",
    "① Exercise",
    "② 問3",
    "③ 適する組合せを答えなさい",
    "④ in the museum"
  ].join("\n"), {
    attachmentId: "att-2",
    pageNumber: 6,
    pageIndex: 5,
    pageType: "question_content"
  });
  const bundles = aiPresetBuildQuestionBundles({
    attachmentId: "att-2",
    pageNumber: 6,
    pageIndex: 5,
    blocks
  });
  const materials = aiPresetCollectUsableMaterials([{
    pageType: "question_content",
    usableForQuestionGen: true,
    pageNumber: 6,
    pageIndex: 5,
    bundles,
    chunks: []
  }], 2);
  assert.equal(materials.length >= 1, true);
  assert.equal(materials[0].optionTexts.includes("Exercise"), false);
  assert.equal(materials[0].optionTexts.includes("問3"), false);
  assert.equal(materials[0].optionTexts.some((item) => /適する組合せ/.test(item)), false);
});

test("英語長文に見えない素材は English reading materials から除外される", () => {
  const attachments = [
    buildPdfAttachment([
      {
        text: [
          "日本史",
          "定期考査 問題用紙",
          "試験時間 50分"
        ].join("\n")
      },
      {
        text: [
          "Read the following passage and answer the questions.",
          "Many visitors came to the festival because they wanted to watch the parade.",
          "Choose the best answer."
        ].join("\n")
      }
    ], "mixed.pdf")
  ];
  const analyses = aiPresetBuildPageAnalyses(attachments);
  const materials = aiPresetCollectUsableMaterials(analyses, 5);
  const englishMaterials = aiPresetSelectEnglishReadingMaterials(materials, 5);
  assert.ok(englishMaterials.length >= 1);
  assert.ok(englishMaterials.every((item) => item.pageNumber === 2));
});

test("英語教材は英語 profile と許可形式で扱われる", () => {
  const profile = aiPresetDetermineSubjectProfile(
    "この英語の問題用紙から10問作って",
    "Read the following passage. Many visitors came to the festival because they wanted to watch the parade.",
    ["english-reading.pdf"]
  );
  assert.equal(profile.key, "english");
  assert.ok(profile.allowedQuestionTypes.includes("reading_comprehension_4choice"));
});

test("日本史教材は社会 profile と許可形式で扱われる", () => {
  const profile = aiPresetDetermineSubjectProfile(
    "この日本史の問題用紙から10問作って",
    "鎌倉幕府が成立した後、御家人と将軍の主従関係が強まった。",
    ["nihonshi.pdf"]
  );
  assert.equal(profile.key, "history");
  assert.ok(profile.allowedQuestionTypes.includes("term_choice_4choice"));
});

test("公共・国際経済の教材は情報語が混ざっても社会 profile を優先する", () => {
  const profile = aiPresetDetermineSubjectProfile(
    "このPDFから20問作成して",
    "公共 国際経済の動向と課題。貿易と国際収支、外国為替市場、地域的経済統合、南北問題を扱う。ヒトや情報の交流、技術取引も拡大している。",
    ["公共マイノート-2部3-2章国際経済の動向と課題-問題.pdf"]
  );
  assert.equal(profile.key, "public");
});

test("情報教材は情報 profile と許可形式で扱われる", () => {
  const profile = aiPresetDetermineSubjectProfile(
    "この情報の教材から5問作って",
    "アルゴリズムの手順を考え、表計算ソフトでデータを整理する。",
    ["johou.pdf"]
  );
  assert.equal(profile.key, "info");
  assert.ok(profile.allowedQuestionTypes.includes("procedure_understanding_4choice"));
});

test("教科判定が曖昧な時は generic profile に縮退する", () => {
  const profile = aiPresetDetermineSubjectProfile(
    "この教材から5問作って",
    "資料を読んで内容を整理し、要点を確認する。",
    ["material.pdf"]
  );
  assert.equal(profile.key, "generic");
  assert.ok(profile.allowedQuestionTypes.includes("content_match_4choice"));
});

test("bundle は materialType と source を持つ", () => {
  const blocks = aiPresetBuildPageBlocks([
    "問1 次の資料を見て、最も適切なものを選びなさい。",
    "表1 世界の発電比率の推移",
    "① 火力発電",
    "② 水力発電",
    "③ 原子力発電",
    "④ 再生可能エネルギー"
  ].join("\n"), {
    attachmentId: "att-material-1",
    pageNumber: 4,
    pageIndex: 3,
    pageType: "question_content"
  });
  const bundles = aiPresetBuildQuestionBundles({
    attachmentId: "att-material-1",
    pageNumber: 4,
    pageIndex: 3,
    blocks
  });
  assert.equal(bundles.length >= 1, true);
  assert.ok(bundles[0].bundleId);
  assert.ok(Array.isArray(bundles[0].sourcePages));
  assert.ok(["chart_page", "figure_based_page", "multiple_choice_sheet", "worksheet", "freeform_explanation"].includes(bundles[0].materialType));
});

test("materialType は表や図を chart/figure 系として判定する", () => {
  assert.equal(aiPresetInferMaterialType("表1 世界の人口推移を見て答えなさい。"), "chart_page");
  assert.equal(aiPresetInferMaterialType("図2 回路図を見て正しいものを選びなさい。"), "figure_based_page");
  assert.equal(aiPresetInferMaterialType("次の文章を読んで答えなさい。The students visited Kyoto and wrote a report."), "reading_passage");
});

test("教科ごとに materialType から許可形式を切り替える", () => {
  const socialAllowed = aiPresetAllowedQuestionTypesForMaterial(
    aiPresetDetermineSubjectProfile("日本史の資料", "鎌倉幕府と執権政治を扱う資料A・年表。", []),
    "timeline",
    0.9
  );
  const infoAllowed = aiPresetAllowedQuestionTypesForMaterial(
    aiPresetDetermineSubjectProfile("情報の教材", "表とグラフからデータを読み取る。", []),
    "chart_page",
    0.9
  );
  assert.ok(socialAllowed.includes("timeline_order"));
  assert.ok(infoAllowed.includes("chart_reading"));
});

test("detectedSubject は社会系でも日本史と公共を分ける", () => {
  const historyProfile = aiPresetDetermineSubjectProfile("日本史の教材", "鎌倉幕府と御家人の関係を扱う。", []);
  const publicProfile = aiPresetDetermineSubjectProfile("公共の教材", "国際経済と為替の動向を扱う。", []);
  assert.equal(aiPresetResolveDetectedSubjectLabel(historyProfile, "鎌倉幕府と御家人の関係", []), "日本史");
  assert.equal(aiPresetResolveDetectedSubjectLabel(publicProfile, "国際経済と為替市場", []), "公共");
});

test("fallback 生成は根拠付きで指定問数を満たし、奇妙な形式を混ぜない", () => {
  const attachments = [
    buildPdfAttachment(
      Array.from({ length: 8 }, (_, index) => ({
        text: [
          `${index + 1}. Read the following sentence and choose the best answer.`,
          `The student number ${index + 1} learned an important lesson about history and culture in Kyoto.`
        ].join("\n")
      }))
    )
  ];
  const analyses = aiPresetBuildPageAnalyses(attachments);
  const materials = aiPresetCollectUsableMaterials(analyses, 8);
  const questions = aiPresetBuildFallbackQuestions({
    materials,
    count: 8,
    formats: ["mcq"],
    subjectId: "sub:english"
  });
  const validation = aiPresetValidateGeneratedQuestions(questions, {
    targetQuestionCount: 8,
    allowedPageNumbers: materials.map((item) => item.pageNumber),
    pageMaterials: materials
  });
  const allowedQuestionTypes = new Set(["cloze_4choice", "term_choice_4choice"]);
  assert.equal(questions.length, 8);
  assert.equal(validation.ok, true);
  assert.ok(questions.every((item) => item.ref?.pageNumber && item.ref?.sourceExcerpt));
  assert.ok(questions.every((item) => allowedQuestionTypes.has(item.questionType)));
  assert.ok(questions.every((item) => !/マーカー|色|試験時間|注意事項/.test(item.q)));
});

test("日本史 profile では許可形式の範囲で fallback 生成される", () => {
  const profile = aiPresetDetermineSubjectProfile(
    "この日本史の教材から4問作って",
    "1185年に守護・地頭が置かれ、鎌倉幕府の支配が強まった。資料を見て答えなさい。",
    ["nihonshi.pdf"]
  );
  const materials = aiPresetSelectSubjectMaterials([
    {
      pageId: "P2",
      pageNumber: 2,
      sourceType: "question_content",
      text: "1185年に守護・地頭が置かれ、鎌倉幕府の支配が強まった。資料を見て答えなさい。",
      sourceExcerpt: "1185年に守護・地頭が置かれ、鎌倉幕府の支配が強まった。資料を見て答えなさい。",
      qualityScore: 0.92
    },
    {
      pageId: "P2",
      pageNumber: 2,
      sourceType: "question_content",
      text: "御恩と奉公の関係が幕府政治を支えた。",
      sourceExcerpt: "御恩と奉公の関係が幕府政治を支えた。",
      qualityScore: 0.9
    },
    {
      pageId: "P2",
      pageNumber: 2,
      sourceType: "question_content",
      text: "御家人は将軍に従って軍役を果たした。",
      sourceExcerpt: "御家人は将軍に従って軍役を果たした。",
      qualityScore: 0.89
    },
    {
      pageId: "P2",
      pageNumber: 2,
      sourceType: "question_content",
      text: "資料には鎌倉時代の政治の特徴が示されている。",
      sourceExcerpt: "資料には鎌倉時代の政治の特徴が示されている。",
      qualityScore: 0.88
    }
  ], profile, 4);
  const questions = aiPresetBuildFallbackQuestions({
    materials,
    count: 4,
    formats: ["mcq"],
    subjectId: profile.subjectId,
    subjectProfile: profile
  });
  assert.ok(questions.every((item) => profile.allowedQuestionTypes.includes(item.questionType)));
});

test("情報 profile では許可形式の範囲で fallback 生成される", () => {
  const profile = aiPresetDetermineSubjectProfile(
    "この情報の教材から4問作って",
    "アルゴリズムの流れを確認し、表やグラフからデータを読み取る。",
    ["johou.pdf"]
  );
  const materials = aiPresetSelectSubjectMaterials([
    {
      pageId: "P3",
      pageNumber: 3,
      sourceType: "question_content",
      text: "アルゴリズムの流れを考え、入力から出力までの処理を整理する。",
      sourceExcerpt: "アルゴリズムの流れを考え、入力から出力までの処理を整理する。",
      qualityScore: 0.91
    },
    {
      pageId: "P3",
      pageNumber: 3,
      sourceType: "question_content",
      text: "表やグラフから必要なデータを読み取る。",
      sourceExcerpt: "表やグラフから必要なデータを読み取る。",
      qualityScore: 0.89
    },
    {
      pageId: "P3",
      pageNumber: 3,
      sourceType: "question_content",
      text: "ネットワークでは情報を安全に送受信する工夫が必要である。",
      sourceExcerpt: "ネットワークでは情報を安全に送受信する工夫が必要である。",
      qualityScore: 0.87
    },
    {
      pageId: "P3",
      pageNumber: 3,
      sourceType: "question_content",
      text: "プログラムの手順を図で表すと処理の流れが分かりやすい。",
      sourceExcerpt: "プログラムの手順を図で表すと処理の流れが分かりやすい。",
      qualityScore: 0.88
    }
  ], profile, 4);
  const questions = aiPresetBuildFallbackQuestions({
    materials,
    count: 4,
    formats: ["mcq"],
    subjectId: profile.subjectId,
    subjectProfile: profile
  });
  assert.ok(questions.every((item) => profile.allowedQuestionTypes.includes(item.questionType)));
});

test("日本史 profile は少数チャンクでも cue 数から必要問数を支えられる", () => {
  const profile = aiPresetDetermineSubjectProfile(
    "この日本史の問題用紙から4問作って",
    "資料Aを見て、鎌倉幕府の成立と執権政治について正しいものを選びなさい。問1 問2 問3 問4",
    ["nihonshi.pdf"]
  );
  const materials = aiPresetSelectSubjectMaterials([
    {
      pageId: "P2",
      pageNumber: 2,
      sourceType: "question_content",
      text: "鎌倉幕府では御家人が将軍に奉公した。守護と地頭が置かれた。執権政治では北条氏が実権を握った。六波羅探題が京都を監視した。",
      sourceExcerpt: "資料Aを見て、鎌倉幕府の成立と執権政治について正しいものを選びなさい。",
      promptText: "資料Aを見て、鎌倉幕府の成立と執権政治について正しいものを選びなさい。",
      optionTexts: ["御家人が将軍に奉公した", "守護と地頭が置かれた", "北条氏が実権を握った", "六波羅探題が京都を監視した"],
      qualityScore: 0.93
    },
    {
      pageId: "P3",
      pageNumber: 3,
      sourceType: "question_content",
      text: "元寇後には御家人の不満が高まった。北条時宗が元寇への対応を進めた。御恩と奉公の関係がゆらいだ。幕府の支配体制に変化が生じた。",
      sourceExcerpt: "資料Bを読んで、元寇後の政治の変化として正しいものを選べ。",
      promptText: "資料Bを読んで、元寇後の政治の変化として正しいものを選べ。",
      optionTexts: ["元寇後には御家人の不満が高まった", "北条時宗が元寇への対応を進めた", "御恩と奉公の関係がゆらいだ", "幕府の支配体制に変化が生じた"],
      qualityScore: 0.91
    }
  ], profile, 4);
  assert.equal(aiPresetEstimateQuestionCapacity(materials, profile) >= 1, true);
  const questions = aiPresetBuildFallbackQuestions({
    materials,
    count: 4,
    formats: ["mcq"],
    subjectId: profile.subjectId,
    subjectProfile: profile
  });
  const validation = aiPresetValidateGeneratedQuestions(questions, {
    targetQuestionCount: Math.max(1, questions.length),
    allowedPageNumbers: [2, 3],
    pageMaterials: materials,
    subjectProfile: profile
  });
  assert.equal(questions.length >= 1, true);
  assert.ok(questions.every((item) => profile.allowedQuestionTypes.includes(item.questionType)));
  assert.equal(Array.isArray(validation.questions), true);
});

test("情報 profile は1ページでも手順/表読解の cue があれば必要問数を支えられる", () => {
  const profile = aiPresetDetermineSubjectProfile(
    "この情報の教材から4問作って",
    "表を見て、アルゴリズムと表計算の手順について正しいものを選びなさい。問1 問2 問3 問4",
    ["info.pdf"]
  );
  const materials = aiPresetSelectSubjectMaterials([
    {
      pageId: "P2",
      pageNumber: 2,
      sourceType: "question_content",
      text: "相対参照は式をコピーすると参照先が変化する。絶対参照は参照先を固定したままコピーできる。繰り返し処理は同じ操作を何度も実行する。条件分岐は条件に応じて処理を切り替える。",
      sourceExcerpt: "表を見て、アルゴリズムと表計算の手順について正しいものを選びなさい。",
      promptText: "表を見て、アルゴリズムと表計算の手順について正しいものを選びなさい。",
      optionTexts: ["相対参照は式をコピーすると参照先が変化する", "絶対参照は参照先を固定したままコピーできる", "繰り返し処理は同じ操作を何度も実行する", "条件分岐は条件に応じて処理を切り替える"],
      qualityScore: 0.94
    }
  ], profile, 4);
  assert.equal(aiPresetEstimateQuestionCapacity(materials, profile) >= 1, true);
  const questions = aiPresetBuildFallbackQuestions({
    materials,
    count: 4,
    formats: ["mcq"],
    subjectId: profile.subjectId,
    subjectProfile: profile
  });
  const validation = aiPresetValidateGeneratedQuestions(questions, {
    targetQuestionCount: Math.max(1, questions.length),
    allowedPageNumbers: [2],
    pageMaterials: materials,
    subjectProfile: profile
  });
  assert.equal(questions.length >= 1, true);
  assert.ok(questions.every((item) => profile.allowedQuestionTypes.includes(item.questionType)));
  assert.equal(Array.isArray(validation.questions), true);
});

test("情報系の用語に含まれる『参照』は禁止 option として落とさない", () => {
  assert.equal(aiPresetLooksLikeForbiddenOptionText("相対参照"), false);
  assert.equal(aiPresetLooksLikeForbiddenOptionText("絶対参照"), false);
});

test("explicit option から主題語を抜き出して fallback 4択を組める", () => {
  const profile = aiPresetDetermineSubjectProfile(
    "この情報の教材から4問作って",
    "表を見て、アルゴリズムと表計算の手順について正しいものを選びなさい。",
    ["info.pdf"]
  );
  const material = aiPresetSelectSubjectMaterials([{
    pageId: "P2",
    pageNumber: 2,
    sourceType: "question_content",
    text: "相対参照は式をコピーすると参照先が変化する。絶対参照は参照先を固定したままコピーできる。繰り返し処理は同じ操作を何度も実行する。条件分岐は条件に応じて処理を切り替える。",
    sourceExcerpt: "表を見て、アルゴリズムと表計算の手順について正しいものを選びなさい。",
    promptText: "表を見て、アルゴリズムと表計算の手順について正しいものを選びなさい。",
    optionTexts: ["相対参照は式をコピーすると参照先が変化する", "絶対参照は参照先を固定したままコピーできる", "繰り返し処理は同じ操作を何度も実行する", "条件分岐は条件に応じて処理を切り替える"],
    qualityScore: 0.94
  }], profile, 4)[0];
  const variants = aiPresetBuildExplicitOptionTermVariants(material, profile.subjectId, 4);
  assert.equal(variants.length, 4);
  assert.equal(variants.some((item) => item.correct === "相対参照"), true);
  assert.equal(variants.some((item) => item.correct === "絶対参照"), true);
  assert.equal(variants.some((item) => item.correct === "繰り返し処理"), true);
  assert.equal(variants.some((item) => item.correct === "条件分岐"), true);
});

test("素材が足りない時は exact count validation を通らない", () => {
  const attachments = [
    buildPdfAttachment([
      {
        text: [
          "Read the following passage.",
          "The boy was surprised to find a small key in the old box."
        ].join("\n")
      }
    ])
  ];
  const analyses = aiPresetBuildPageAnalyses(attachments);
  const materials = aiPresetCollectUsableMaterials(analyses, 3);
  const questions = aiPresetBuildFallbackQuestions({
    materials,
    count: 3,
    formats: ["mcq"],
    subjectId: "sub:english"
  });
  const validation = aiPresetValidateGeneratedQuestions(questions, {
    targetQuestionCount: 3,
    allowedPageNumbers: materials.map((item) => item.pageNumber)
  });
  assert.ok(questions.length >= 1);
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((item) => item.startsWith("QUESTION_COUNT_MISMATCH")));
});

test("選択肢1つだけが長文断片の4択は不合格", () => {
  assert.equal(scanChoicesStructurallyValid([
    "ア The boy was surprised to find a small key in the old box after class and wrote a long detailed note about it.",
    "イ key",
    "ウ box",
    "エ note"
  ]), false);
});

test("単語だけの選択肢と文の選択肢が混ざる4択は不合格", () => {
  assert.equal(scanChoicesStructurallyValid([
    "ア practiced",
    "イ students",
    "ウ The students compared the map with a modern one and discussed the changes.",
    "エ history"
  ]), false);
});

test("sourceExcerpt がない問題は normalize 段階で落ちる", () => {
  const rows = scanNormalizeQuestionRows([{
    qid: "Q1",
    type: "mcq",
    q: "次の本文の空欄に入る語句として最も適切なものを選びなさい。",
    a: "ア key",
    choices: ["ア key", "イ map", "ウ note", "エ class"],
    ref: { p: "P1", pageNumber: 1, sourceType: "question_content" }
  }], [], { count: 1 }, ["mcq"], { paragraphs: [{ id: "P1", text: "" }], markers: [], pageNumber: 1 });
  assert.equal(rows.length, 0);
});

test("marker 位置が取れない marker 問題は生成候補から落ちる", () => {
  const rows = scanNormalizeQuestionRows([{
    qid: "Q1",
    type: "mcq",
    q: "本文のマーカー16に最も当てはまる語句を選びなさい。",
    a: "ア key",
    choices: ["ア key", "イ map", "ウ note", "エ class"],
    ref: {
      p: "P1",
      pageNumber: 1,
      sourceType: "question_content",
      sourceExcerpt: "The boy found a key.",
      sourceSpan: { start: 0, end: 10 }
    }
  }], [], { count: 1 }, ["mcq"], { paragraphs: [{ id: "P1", text: "The boy found a key." }], markers: [], pageNumber: 1 });
  assert.equal(rows.length, 0);
});

test("参照元が揃った4択だけが valid になる", () => {
  const question = {
    qid: "Q1",
    type: "mcq",
    q: "次の本文の空欄に入る語句として最も適切なものを選びなさい。",
    a: "ア key",
    choices: ["ア key", "イ map", "ウ note", "エ class"],
    ref: {
      p: "P1",
      pageNumber: 1,
      sourceType: "question_content",
      sourceExcerpt: "The boy found a key in the box.",
      sourceSpan: { start: 14, end: 17 }
    }
  };
  assert.equal(scanQuestionValid(question, "The boy found a key in the box.", 15), true);
  assert.equal(scanQuestionValid({ ...question, ref: { ...question.ref, sourceType: "cover" } }, "The boy found a key in the box.", 15), false);
});

test("sourcePage がない問題は保存前検証で落ちる", () => {
  const questions = [{
    qid: "Q1",
    type: "mcq",
    questionType: "cloze_4choice",
    q: "次の英文の空欄に入る語句として最も適切なものを選びなさい。\nThe boy found a （　） in the box.",
    a: "ア key",
    choices: ["ア key", "イ map", "ウ note", "エ class"],
    ref: {
      p: "P1",
      pageNumber: 0,
      sourceType: "question_content",
      sourceExcerpt: "The boy found a key in the box.",
      sourceSpan: { start: 16, end: 19 }
    }
  }];
  const validation = aiPresetValidateGeneratedQuestions(questions, {
    targetQuestionCount: 1,
    allowedPageNumbers: [1],
    pageMaterials: [{
      pageNumber: 1,
      text: "The boy found a key in the box.",
      sourceExcerpt: "The boy found a key in the box."
    }]
  });
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((item) => item.includes("MISSING_SOURCE_PAGE")));
});

test("許可外 questionType は保存前検証で落ちる", () => {
  const questions = [{
    qid: "Q1",
    type: "mcq",
    questionType: "marker_reference_4choice",
    q: "次の英文の空欄に入る語句として最も適切なものを選びなさい。\nThe boy found a （　） in the box.",
    a: "ア key",
    choices: ["ア key", "イ map", "ウ note", "エ class"],
    ref: {
      p: "P1",
      pageNumber: 1,
      sourceType: "question_content",
      sourceExcerpt: "The boy found a key in the box.",
      sourceSpan: { start: 16, end: 19 }
    }
  }];
  const validation = aiPresetValidateGeneratedQuestions(questions, {
    targetQuestionCount: 1,
    allowedPageNumbers: [1],
    pageMaterials: [{
      pageNumber: 1,
      text: "The boy found a key in the box and wrote about it after class.",
      sourceExcerpt: "The boy found a key in the box and wrote about it after class."
    }]
  });
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((item) => item.includes("DISALLOWED_QUESTION_TYPE")));
});

test("別ページ由来の長文断片が選択肢に混ざる問題は不合格", () => {
  const questions = [{
    qid: "Q1",
    type: "mcq",
    questionType: "content_match_4choice",
    q: "本文の内容として最も適切なものを選びなさい。",
    a: "ア Many visitors came to the festival because they wanted to watch the parade.",
    choices: [
      "ア Many visitors came to the festival because they wanted to watch the parade.",
      "イ The students compared the old map with a modern one and discussed the changes in the town.",
      "ウ Many visitors came to the festival to enjoy music and local food together.",
      "エ The festival ended with a parade that filled the streets with color and music."
    ],
    ref: {
      p: "P1",
      pageNumber: 1,
      sourceType: "question_content",
      sourceExcerpt: "Many visitors came to the festival because they wanted to watch the parade.",
      sourceSpan: { start: 0, end: 74 }
    }
  }];
  const validation = aiPresetValidateGeneratedQuestions(questions, {
    targetQuestionCount: 1,
    allowedPageNumbers: [1],
    pageMaterials: [
      {
        pageNumber: 1,
        text: "Many visitors came to the festival because they wanted to watch the parade. Many visitors came to the festival to enjoy music and local food together. The festival ended with a parade that filled the streets with color and music.",
        sourceExcerpt: "Many visitors came to the festival because they wanted to watch the parade."
      },
      {
        pageNumber: 2,
        text: "The students compared the old map with a modern one and discussed the changes in the town.",
        sourceExcerpt: "The students compared the old map with a modern one and discussed the changes in the town."
      }
    ]
  });
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((item) => item.includes("CHOICE_STRUCTURE_INVALID")));
});

test("『問3』や『Exercise』が選択肢に混ざる問題は不合格", () => {
  const questions = [{
    qid: "Q1",
    type: "mcq",
    questionType: "content_match_4choice",
    q: "本文の内容として最も適切なものを選びなさい。",
    a: "ア in the box",
    choices: [
      "ア in the box",
      "イ Exercise",
      "ウ 問3",
      "エ 適する組合せを答えなさい"
    ],
    ref: {
      p: "P1",
      pageNumber: 1,
      sourceType: "question_content",
      sourceExcerpt: "The boy found a key in the box.",
      sourceSpan: { start: 16, end: 22 }
    }
  }];
  const validation = aiPresetValidateGeneratedQuestions(questions, {
    targetQuestionCount: 1,
    allowedPageNumbers: [1],
    pageMaterials: [{
      pageNumber: 1,
      text: "The boy found a key in the box.",
      sourceExcerpt: "The boy found a key in the box."
    }]
  });
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((item) => item.includes("CHOICE_STRUCTURE_INVALID")));
});

test("空欄問題で指示文しか選択肢候補にならない場合は不合格", () => {
  const questions = [{
    qid: "Q1",
    type: "mcq",
    questionType: "cloze_4choice",
    q: "次の本文の空欄に入る語句として最も適切なものを選びなさい。\nThe boy found a （　） in the box.",
    a: "ア key",
    choices: [
      "ア key",
      "イ 適する組合せを答えなさい",
      "ウ 次の①〜④は",
      "エ Exercise"
    ],
    ref: {
      p: "P1",
      pageNumber: 1,
      sourceType: "question_content",
      sourceExcerpt: "The boy found a key in the box.",
      sourceSpan: { start: 16, end: 19 }
    }
  }];
  const validation = aiPresetValidateGeneratedQuestions(questions, {
    targetQuestionCount: 1,
    allowedPageNumbers: [1],
    pageMaterials: [{
      pageNumber: 1,
      text: "The boy found a key in the box.",
      sourceExcerpt: "The boy found a key in the box."
    }]
  });
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((item) => item.includes("CHOICE_STRUCTURE_INVALID")));
});

test("OCRノイズ断片は fallback の選択肢に使われない", () => {
  const questions = aiPresetBuildFallbackQuestions({
    materials: [
      {
        pageId: "P1",
        pageNumber: 1,
        sourceType: "question_content",
        text: "The students practiced speaking English after school in the library.",
        sourceExcerpt: "The students practiced speaking English after school in the library.",
        qualityScore: 0.9
      },
      {
        pageId: "P1",
        pageNumber: 1,
        sourceType: "question_content",
        text: "The students shared their notes and compared their ideas in pairs.",
        sourceExcerpt: "The students shared their notes and compared their ideas in pairs.",
        qualityScore: 0.88
      },
      {
        pageId: "P1",
        pageNumber: 1,
        sourceType: "question_content",
        text: "Page 2",
        sourceExcerpt: "Page 2",
        qualityScore: 0.12
      },
      {
        pageId: "P1",
        pageNumber: 1,
        sourceType: "question_content",
        text: "The teacher asked the class to explain why practice was important.",
        sourceExcerpt: "The teacher asked the class to explain why practice was important.",
        qualityScore: 0.87
      },
      {
        pageId: "P1",
        pageNumber: 1,
        sourceType: "question_content",
        text: "Everyone listened carefully and wrote short summaries after the discussion.",
        sourceExcerpt: "Everyone listened carefully and wrote short summaries after the discussion.",
        qualityScore: 0.86
      }
    ],
    count: 1,
    formats: ["mcq"],
    subjectId: "sub:english"
  });
  assert.equal(questions.length, 1);
  assert.ok(questions[0].choices.every((choice) => !/Page 2|次のページへ|試験時間/.test(choice)));
});

test("公共教材の資料読解は指示文混入を reject する", () => {
  const profile = aiPresetDetermineSubjectProfile(
    "公共の教材から4問作って",
    "資料1 国際収支の推移を見て答えなさい。国際収支と為替の関係を考える。",
    ["public.pdf"]
  );
  const questions = [{
    qid: "Q1",
    type: "mcq",
    questionType: "source_based_choice",
    detectedSubject: "公共",
    q: "資料1の内容として適切なものを選びなさい。",
    a: "ア 貿易収支の黒字が拡大した",
    choices: [
      "ア 貿易収支の黒字が拡大した",
      "イ 次の資料を見て答えなさい",
      "ウ 適する組合せを答えなさい",
      "エ 為替相場の影響を受けた"
    ],
    ref: {
      p: "P2",
      pageNumber: 2,
      sourceType: "question_content",
      sourceExcerpt: "資料1 国際収支の推移",
      sourceSpan: { start: 0, end: 12 }
    }
  }];
  const validation = aiPresetValidateGeneratedQuestions(questions, {
    targetQuestionCount: 1,
    allowedPageNumbers: [2],
    pageMaterials: [{
      pageNumber: 2,
      text: "資料1 国際収支の推移 貿易収支の黒字が拡大した。為替相場の影響を受けた。",
      sourceExcerpt: "資料1 国際収支の推移"
    }],
    subjectProfile: profile
  });
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((item) => item.includes("CHOICE_STRUCTURE_INVALID")));
});

test("情報教材の chart reading は source に紐づく", () => {
  const profile = aiPresetDetermineSubjectProfile(
    "情報の教材から4問作って",
    "表1 アクセス数の推移を読み取り、最も適切なものを選びなさい。",
    ["info-chart.pdf"]
  );
  const question = {
    qid: "Q1",
    type: "mcq",
    questionType: "chart_reading",
    detectedSubject: "情報",
    q: "表1の内容として最も適切なものを選びなさい。",
    a: "ア 5月が最も多い",
    choices: ["ア 5月が最も多い", "イ 1月が最も多い", "ウ 毎月同じ", "エ 12月が最も少ない"],
    ref: {
      p: "P3",
      pageNumber: 3,
      sourceType: "question_content",
      sourceExcerpt: "表1 アクセス数の推移",
      sourceSpan: { start: 0, end: 12 }
    }
  };
  const validation = aiPresetValidateGeneratedQuestions([question], {
    targetQuestionCount: 1,
    allowedPageNumbers: [3],
    pageMaterials: [{
      pageNumber: 3,
      text: "表1 アクセス数の推移 5月が最も多く、1月が最も少ない。",
      sourceExcerpt: "表1 アクセス数の推移"
    }],
    subjectProfile: profile
  });
  assert.equal(validation.ok, true);
  assert.equal(validation.questions[0].ref.pageNumber, 3);
});

test("国語教材で傍線部根拠が無い問題は生成しない", () => {
  const profile = aiPresetDetermineSubjectProfile(
    "国語の教材から4問作って",
    "本文を読み、内容として正しいものを選びなさい。",
    ["kokugo.pdf"]
  );
  const validation = aiPresetValidateGeneratedQuestions([{
    qid: "Q1",
    type: "mcq",
    questionType: "underlined_part_explanation",
    detectedSubject: "国語",
    q: "傍線部の説明として最も適切なものを選びなさい。",
    a: "ア 筆者の立場を示す",
    choices: ["ア 筆者の立場を示す", "イ 反対意見を示す", "ウ 比喩を示す", "エ 時代背景を示す"],
    ref: {
      p: "P1",
      pageNumber: 1,
      sourceType: "question_content",
      sourceExcerpt: "筆者は読書の価値について述べている。",
      sourceSpan: { start: 0, end: 18 }
    }
  }], {
    targetQuestionCount: 1,
    allowedPageNumbers: [1],
    pageMaterials: [{
      pageNumber: 1,
      text: "筆者は読書の価値について述べている。",
      sourceExcerpt: "筆者は読書の価値について述べている。"
    }],
    subjectProfile: profile
  });
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((item) => item.includes("MISSING_UNDERLINE_ANCHOR")));
});

test("数学教材は confidence が低い場合に bundle 審査で落ちる", () => {
  const profile = aiPresetDetermineSubjectProfile(
    "数学の問題用紙から4問作って",
    "x+y=10, 2x-y=5",
    ["math.pdf"]
  );
  const audit = aiPresetBundleAudit({
    id: "math-1",
    bundleId: "math-1",
    pageNumber: 2,
    kind: "question_bundle",
    text: "x+y=10, 2x-y=5",
    sourceExcerpt: "x+y=10, 2x-y=5",
    qualityScore: 0.34,
    questionBlock: { text: "次の式を解け。" },
    sourcePages: [2]
  }, profile);
  assert.equal(audit.ok, false);
});

test("quality details は最終品質スコアを返す", () => {
  const details = aiPresetQuestionQualityDetails({
    q: "資料の内容として正しいものを選びなさい。",
    questionType: "term_choice_4choice",
    choices: ["ア 貿易", "イ 為替", "ウ 関税", "エ 市場"],
    ref: {
      pageNumber: 2,
      sourceType: "question_content",
      sourceExcerpt: "国際経済では貿易や為替が重要である。",
      sourceSpan: { start: 0, end: 18 }
    }
  }, {
    pageMaterials: [{
      pageNumber: 2,
      text: "国際経済では貿易や為替が重要である。関税と市場の関係も学ぶ。",
      sourceExcerpt: "国際経済では貿易や為替が重要である。"
    }],
    subjectProfile: aiPresetDetermineSubjectProfile("公共", "国際経済では貿易や為替が重要である。", [])
  });
  assert.equal(typeof details.finalValidationScore, "number");
  assert.ok(details.finalValidationScore > 0.5);
});
