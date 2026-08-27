import test from "node:test";
import assert from "node:assert/strict";

import { __testables } from "../src/worker.js";

const {
  buildSystemPrompt,
  aiNormalizeStructuredProblemData,
  aiBuildProblemDataPromptBlock,
  aiDetermineProblemInteractionMode,
  aiNormalizeChatImageAttachments,
  aiRunLlavaStructuredImage
} = __testables;

function buildEnvWithLlavaResponse(payload) {
  const calls = [];
  return {
    env: {
      AI: {
        async run(model, body) {
          calls.push({ model, body });
          return {
            response: typeof payload === "string" ? payload : JSON.stringify(payload)
          };
        }
      }
    },
    calls
  };
}

function buildFakeImageFileInfo(name = "question.png") {
  return {
    name,
    mime: "image/jpeg",
    bytes: new Uint8Array([1, 2, 3, 4]),
    b64: "AQIDBA==",
    size: 4
  };
}

test("英語4択画像の LLaVA 結果を structured problem data に正規化できる", async () => {
  const { env, calls } = buildEnvWithLlavaResponse({
    subjectCandidate: "英語",
    questionTypeCandidate: "multiple_choice",
    imageSummary: "英語の4択問題が1問あります。",
    confidence: 0.84,
    questions: [
      {
        questionNumber: "1",
        instruction: "最も適切なものを選びなさい。",
        stem: "What did the boy find in the box?",
        choices: ["A a key", "B a map", "C a note", "D a ticket"],
        hasBlank: false,
        hasFigure: false,
        hasTable: false,
        confidence: 0.82
      }
    ],
    uncertainties: []
  });
  const result = await aiRunLlavaStructuredImage(env, buildFakeImageFileInfo(), { fileName: "english-question.png" });
  assert.equal(calls.length >= 1, true);
  assert.equal(calls[0].model, "@cf/llava-hf/llava-1.5-7b-hf");
  assert.equal(result.parsed.subjectCandidate, "英語");
  assert.equal(result.parsed.questions.length, 1);
  assert.equal(result.parsed.questions[0].questionType, "multiple_choice");
  assert.deepEqual(result.parsed.questions[0].choices, ["A a key", "B a map", "C a note", "D a ticket"]);
});

test("日本史や公共系の問題画像でも指示文と選択肢を構造化できる", () => {
  const normalized = aiNormalizeStructuredProblemData({
    subjectCandidate: "公共",
    questionTypeCandidate: "multiple_choice",
    imageSummary: "公共の4択問題が2問あります。",
    questions: [
      {
        questionNumber: "2",
        instruction: "最も適切なものを選びなさい。",
        stem: "外国為替市場に関する記述として正しいものはどれか。",
        choices: ["ア 需要が増えると円高になる", "イ 金利差が影響する", "ウ 関税が自動で決まる", "エ 財政赤字だけで決まる"],
        confidence: 0.78
      }
    ]
  }, { fileName: "public.png", sourcePage: 1 });
  assert.equal(normalized.subjectCandidate, "公共");
  assert.equal(normalized.questions[0].instruction, "最も適切なものを選びなさい。");
  assert.equal(normalized.questions[0].choices.length, 4);
});

test("structured problem data から既存AI向け prompt block を組み立てられる", () => {
  const promptBlock = aiBuildProblemDataPromptBlock(aiNormalizeStructuredProblemData({
    subjectCandidate: "英語",
    questionTypeCandidate: "multiple_choice",
    imageSummary: "英語の問題画像",
    questions: [
      {
        questionNumber: "1",
        instruction: "最も適切なものを選びなさい。",
        stem: "What did the boy find?",
        choices: ["A a key", "B a map", "C a note", "D a ticket"],
        confidence: 0.82
      }
    ]
  }, { fileName: "english.png", sourcePage: 1 }), { label: "IMAGE_PROBLEM_DATA_1" });
  assert.match(promptBlock, /\[IMAGE_PROBLEM_DATA_1\]/);
  assert.match(promptBlock, /subject_candidate: 英語/);
  assert.match(promptBlock, /choices: A a key \/ B a map \/ C a note \/ D a ticket/);
});

test("モード判定は解説・演習・採点・プリセットを切り替えられる", () => {
  assert.equal(aiDetermineProblemInteractionMode("この問題を解説して"), "explain");
  assert.equal(aiDetermineProblemInteractionMode("ヒントだけください。まだ答えは言わないで"), "practice");
  assert.equal(aiDetermineProblemInteractionMode("私の答えはBです。採点して"), "grading");
  assert.equal(aiDetermineProblemInteractionMode("この画像から類題プリセットを作って"), "preset");
});

test("画像が読みにくく JSON 化に失敗した場合は uncertainty を返す", async () => {
  const { env } = buildEnvWithLlavaResponse("選択肢Cが判別しづらく、画像全体も少し暗いです。");
  const result = await aiRunLlavaStructuredImage(env, buildFakeImageFileInfo("unclear.png"), { fileName: "unclear.png" });
  assert.equal(result.parsed.questions.length, 0);
  assert.equal(result.parsed.uncertainties.includes("STRUCTURED_JSON_PARSE_FAILED"), true);
  assert.equal(result.parsed.confidence < 0.3, true);
});

test("画像でない添付は chat image helper の対象外になる", () => {
  const attachments = aiNormalizeChatImageAttachments([
    { id: "pdf-1", name: "doc.pdf", sourceType: "pdf", mimeType: "application/pdf", preview: "" },
    { id: "img-1", name: "photo.png", sourceType: "image", mimeType: "image/png", preview: "data:image/png;base64,AAAA" }
  ]);
  assert.equal(attachments.length, 1);
  assert.equal(attachments[0].name, "photo.png");
});

test("AI chat system prompt はコードを fenced code block で返すルールを含む", () => {
  const prompt = buildSystemPrompt({ mode: "standard" });
  assert.match(prompt, /fenced code block/i);
  assert.match(prompt, /Markdown/);
  assert.match(prompt, /html.*css.*javascript.*typescript.*python.*json.*bash/i);
  assert.match(prompt, /3行以上のコード/);
  assert.match(prompt, /インラインコード/);
});
