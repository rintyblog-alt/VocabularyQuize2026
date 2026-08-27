/* ══════════════════════════════════════════════════════════════════════
   VocabuQuiz Learning Workspace V2 — 共通ドメインモデル
   ・Preset / Quiz / Result / Mock が共有する唯一の型定義。
   ・TypeScript の型注釈では AI 生成物を守れないため、すべて実行時に検証する。
   ・ここは「形」だけを定義する。保存可否の業務ルールは validate.js が持つ。
   ・ブラウザでは <script> として、Node ではそのまま import して使える。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});

  /* ── スキーマ版数。保存データはすべてこれを持つ。 ───────────────── */
  var SCHEMA_VERSION = 2;

  /* ── 問題形式 ───────────────────────────────────────────────────
     V2 までの 13 形式。ID は変えない（保存済みデータがこの名前で入っている）。
     V3 で足した形式は、レジストリ（qtypes.js）から下で足し込む。 */
  var LEGACY_QUESTION_TYPES = [
    "multiple_choice_single",
    "multiple_choice_multiple",
    "true_false",
    "short_answer",
    "long_answer",
    "fill_blank",
    "ordering",
    "matching",
    "numeric",
    "formula",
    "essay",
    "english_writing",
    "source_analysis"
  ];

  /* 決定論的に採点できる形式（コードだけで正誤を出せるもの） */
  var LEGACY_DETERMINISTIC_TYPES = [
    "multiple_choice_single",
    "multiple_choice_multiple",
    "true_false",
    "short_answer",
    "fill_blank",
    "ordering",
    "matching",
    "numeric",
    "formula"
  ];

  /* AI 補助採点が必要な形式（表現の幅があり、完全一致で測れないもの） */
  var LEGACY_AI_GRADED_TYPES = ["long_answer", "essay", "english_writing", "source_analysis"];

  /* 選択肢を持つ形式 */
  var LEGACY_CHOICE_TYPES = ["multiple_choice_single", "multiple_choice_multiple", "true_false", "matching", "ordering"];

  /* ── V3 の形式を足し込む ───────────────────────────────────────
     レジストリ（qtypes.js）が先に読まれていれば、そこにある形式をすべて
     受け入れる。読まれていなければ V2 の 13 形式のまま動く。
     ここを足さないと、新しい形式の問題が保存前の検証で
     「使用できない値です」になり、1 問も保存できない。 */
  var QUESTION_TYPES = LEGACY_QUESTION_TYPES.slice();
  var DETERMINISTIC_TYPES = LEGACY_DETERMINISTIC_TYPES.slice();
  var AI_GRADED_TYPES = LEGACY_AI_GRADED_TYPES.slice();
  var CHOICE_TYPES = LEGACY_CHOICE_TYPES.slice();
  (function adoptRegistry() {
    var Q = root.VQ2 && root.VQ2.qtypes;
    if (!Q) return;
    Q.all().forEach(function (d) {
      if (QUESTION_TYPES.indexOf(d.id) < 0) QUESTION_TYPES.push(d.id);
      if (Q.isDeterministic(d.id) && DETERMINISTIC_TYPES.indexOf(d.id) < 0) DETERMINISTIC_TYPES.push(d.id);
      if (Q.isAiGraded(d.id) && AI_GRADED_TYPES.indexOf(d.id) < 0) AI_GRADED_TYPES.push(d.id);
      if (Q.hasChoices(d.id) && CHOICE_TYPES.indexOf(d.id) < 0) CHOICE_TYPES.push(d.id);
    });
  })();

  /* ── 観点別評価。学習指導要領の 3 観点のうち、答案から測れる 2 つだけを
        正式な得点として扱う。「主体的に学習に取り組む態度」は 1 回の答案から
        断定できないため、正式得点ではなく参考分析（behaviorSignals）に置く。 ── */
  var CRITERIA = [
    { id: "knowledge_skill", label: "知識・技能" },
    { id: "thinking_judgment_expression", label: "思考・判断・表現" }
  ];
  var CRITERION_IDS = CRITERIA.map(function (c) { return c.id; });

  /* ── セッション状態遷移。不正な遷移をコードで禁止する。 ───────────── */
  var QUIZ_SESSION_STATES = [
    "created", "ready", "in_progress", "paused",
    "submitting", "grading", "completed", "abandoned", "expired"
  ];
  var QUIZ_TRANSITIONS = {
    created:    ["ready", "abandoned"],
    ready:      ["in_progress", "abandoned", "expired"],
    in_progress:["paused", "submitting", "abandoned", "expired"],
    paused:     ["in_progress", "submitting", "abandoned", "expired"],
    submitting: ["grading", "in_progress"],          /* 送信失敗時は解答へ戻す */
    grading:    ["completed", "in_progress"],
    completed:  [],
    abandoned:  [],
    expired:    ["submitting"]                        /* 時間切れでも採点はする */
  };

  var MOCK_SESSION_STATES = [
    "created", "preparing", "ready", "in_progress", "paused",
    "submitting", "deterministic_grading", "ai_grading", "reviewing",
    "completed", "abandoned", "expired"
  ];
  var MOCK_TRANSITIONS = {
    created:               ["preparing", "abandoned"],
    preparing:             ["ready", "abandoned"],
    ready:                 ["in_progress", "abandoned", "expired"],
    in_progress:           ["paused", "submitting", "abandoned", "expired"],
    paused:                ["in_progress", "submitting", "abandoned", "expired"],
    submitting:            ["deterministic_grading", "in_progress"],
    deterministic_grading: ["ai_grading", "reviewing", "completed"],
    ai_grading:            ["reviewing", "completed"],
    reviewing:             ["completed"],
    completed:             [],
    abandoned:             [],
    expired:               ["submitting"]
  };

  /* ── AI 生成物のレビュー状態（§7 必須） ────────────────────────── */
  var DRAFT_STATES = [
    "generating", "draft", "reviewing", "partially_applied",
    "applied", "saving", "saved", "failed"
  ];

  /* ── 出典の種別 ──────────────────────────────────────────────── */
  var SOURCE_TYPES = ["pdf", "image", "text", "zip", "preset", "mock", "manual", "unknown"];

  /* ── ValidationIssue の重大度。error があるものは保存・公開・受験させない。 ── */
  var SEVERITIES = ["error", "warning", "info"];

  /* ── AI 利用イベント（§34。将来のプラン制限に備えた計測のみ。制限はしない） ── */
  var USAGE_EVENT_TYPES = [
    "chat_message", "preset_generation", "preset_revision",
    "mock_generation", "mock_revision", "document_analysis", "image_analysis",
    "pdf_typesetting", "pdf_compile", "pdf_visual_review",
    "ai_grading", "result_analysis", "export_generation"
  ];

  /* ══════════════════════════════════════════════════════════════════
     最小の実行時バリデータ
     ・外部ライブラリを足さないため自前。必要な語彙だけを持つ。
     ・エラーは「どこが」「なぜ」を必ず含める（AI 生成物の修正に使うため）。
     ══════════════════════════════════════════════════════════════════ */
  function isPlainObject(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
  function isStr(v) { return typeof v === "string"; }
  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function isInt(v) { return isNum(v) && Math.floor(v) === v; }
  function isBool(v) { return typeof v === "boolean"; }

  function issue(severity, code, path, message, extra) {
    var o = { severity: severity, code: code, path: path, message: message };
    if (extra) for (var k in extra) o[k] = extra[k];
    return o;
  }
  var err = function (code, path, msg, extra) { return issue("error", code, path, msg, extra); };
  var warn = function (code, path, msg, extra) { return issue("warning", code, path, msg, extra); };
  var info = function (code, path, msg, extra) { return issue("info", code, path, msg, extra); };

  /* 型チェックの共通部品。値が無い/型違いのときだけ issue を返す。 */
  function checkField(out, obj, path, key, spec) {
    var v = obj ? obj[key] : undefined;
    var p = path ? path + "." + key : key;
    var absent = (v === undefined || v === null || (isStr(v) && v === "" && spec.type === "string"));
    if (absent) {
      if (spec.required) out.push(err("required", p, "必須項目がありません。"));
      return;
    }
    switch (spec.type) {
      case "string":
        if (!isStr(v)) { out.push(err("type", p, "文字列である必要があります。")); return; }
        if (spec.maxLength && v.length > spec.maxLength) out.push(err("maxLength", p, "長すぎます（上限 " + spec.maxLength + " 文字）。"));
        if (spec.minLength && v.length < spec.minLength) out.push(err("minLength", p, "短すぎます（下限 " + spec.minLength + " 文字）。"));
        if (spec.enum && spec.enum.indexOf(v) < 0) out.push(err("enum", p, "使用できない値です: " + v, { allowed: spec.enum }));
        break;
      case "integer":
        if (!isInt(v)) { out.push(err("type", p, "整数である必要があります。")); return; }
        if (isNum(spec.min) && v < spec.min) out.push(err("min", p, spec.min + " 以上である必要があります。"));
        if (isNum(spec.max) && v > spec.max) out.push(err("max", p, spec.max + " 以下である必要があります。"));
        break;
      case "number":
        if (!isNum(v)) { out.push(err("type", p, "数値である必要があります。")); return; }
        if (isNum(spec.min) && v < spec.min) out.push(err("min", p, spec.min + " 以上である必要があります。"));
        if (isNum(spec.max) && v > spec.max) out.push(err("max", p, spec.max + " 以下である必要があります。"));
        break;
      case "boolean":
        if (!isBool(v)) out.push(err("type", p, "true / false である必要があります。"));
        break;
      case "array":
        if (!Array.isArray(v)) { out.push(err("type", p, "配列である必要があります。")); return; }
        if (isNum(spec.minItems) && v.length < spec.minItems) out.push(err("minItems", p, spec.minItems + " 件以上必要です。"));
        if (isNum(spec.maxItems) && v.length > spec.maxItems) out.push(err("maxItems", p, spec.maxItems + " 件以下である必要があります。"));
        break;
      case "object":
        if (!isPlainObject(v)) out.push(err("type", p, "オブジェクトである必要があります。"));
        break;
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     Entity ごとの形チェック
     ══════════════════════════════════════════════════════════════════ */

  /* SourceReference — 画像由来は region を持てる。
     座標を持っていないのに偽の座標を作らないこと（§22）。 */
  function validateSourceReference(sr, path, out) {
    checkField(out, sr, path, "id", { type: "string", required: true, maxLength: 80 });
    checkField(out, sr, path, "sourceType", { type: "string", required: true, enum: SOURCE_TYPES });
    checkField(out, sr, path, "sourceName", { type: "string", maxLength: 300 });
    checkField(out, sr, path, "sourceId", { type: "string", maxLength: 200 });
    checkField(out, sr, path, "excerpt", { type: "string", maxLength: 1200 });
    ["page", "pageStart", "pageEnd", "lineStart", "lineEnd"].forEach(function (k) {
      checkField(out, sr, path, k, { type: "integer", min: 1 });
    });
    checkField(out, sr, path, "confidence", { type: "number", min: 0, max: 1 });
    checkField(out, sr, path, "verified", { type: "boolean" });
    if (isNum(sr.pageStart) && isNum(sr.pageEnd) && sr.pageEnd < sr.pageStart)
      out.push(err("range", path + ".pageEnd", "pageEnd が pageStart より小さいです。"));
    if (sr.region !== undefined && sr.region !== null) {
      if (!isPlainObject(sr.region)) { out.push(err("type", path + ".region", "オブジェクトである必要があります。")); return; }
      var rp = path + ".region";
      checkField(out, sr.region, rp, "page", { type: "integer", required: true, min: 1 });
      ["x", "y", "width", "height"].forEach(function (k) {
        checkField(out, sr.region, rp, k, { type: "number", required: true });
      });
      checkField(out, sr.region, rp, "coordinateSystem", {
        type: "string", required: true, enum: ["pdf-points-topleft", "pdf-points-bottomleft", "normalized", "page-only"]
      });
      if (sr.region.width <= 0 || sr.region.height <= 0)
        out.push(err("range", rp, "領域の幅・高さは正の数である必要があります。"));
    }
  }

  /* Choice */
  function validateChoice(c, path, out) {
    checkField(out, c, path, "id", { type: "string", required: true, maxLength: 40 });
    checkField(out, c, path, "label", { type: "string", maxLength: 12 });
    /* 書きかけの選択肢を required で赤くしない。空かどうかは validate.js が
       業務ルールとして見る（出題・公開の直前だけ止める）。 */
    checkField(out, c, path, "text", { type: "string", maxLength: 1000 });
    checkField(out, c, path, "explanation", { type: "string", maxLength: 1200 });
    checkField(out, c, path, "isCorrect", { type: "boolean", required: true });
  }

  /* CriterionAllocation — 観点別配点。合計は呼び出し側が問題配点と突き合わせる。 */
  function validateCriterionAllocation(alloc, path, out) {
    if (alloc === undefined || alloc === null) return;
    if (!Array.isArray(alloc)) { out.push(err("type", path, "配列である必要があります。")); return; }
    alloc.forEach(function (a, i) {
      var p = path + "[" + i + "]";
      checkField(out, a, p, "criterionId", { type: "string", required: true, enum: CRITERION_IDS });
      checkField(out, a, p, "points", { type: "number", required: true, min: 0 });
    });
  }

  /* ScoringRubric — AI 補助採点の根拠。項目ごとに観点を割り当てられる。 */
  function validateScoringRubric(r, path, out) {
    if (r === undefined || r === null) return;
    if (!isPlainObject(r)) { out.push(err("type", path, "オブジェクトである必要があります。")); return; }
    checkField(out, r, path, "items", { type: "array", required: true, minItems: 1, maxItems: 20 });
    if (!Array.isArray(r.items)) return;
    r.items.forEach(function (it, i) {
      var p = path + ".items[" + i + "]";
      checkField(out, it, p, "id", { type: "string", required: true, maxLength: 40 });
      checkField(out, it, p, "description", { type: "string", required: true, maxLength: 500 });
      checkField(out, it, p, "points", { type: "number", required: true, min: 0 });
      checkField(out, it, p, "criterionId", { type: "string", enum: CRITERION_IDS });
    });
  }

  /* Question — Preset の問題。 */
  function validateQuestion(q, path, out) {
    checkField(out, q, path, "id", { type: "string", required: true, maxLength: 60 });
    checkField(out, q, path, "type", { type: "string", required: true, enum: QUESTION_TYPES });
    /* 問題文の空も同じ。ここは長さの上限だけ見る。 */
    checkField(out, q, path, "prompt", { type: "string", maxLength: 4000 });
    checkField(out, q, path, "explanation", { type: "string", maxLength: 4000 });
    checkField(out, q, path, "difficulty", { type: "string", enum: ["easy", "normal", "hard"] });
    checkField(out, q, path, "topic", { type: "string", maxLength: 120 });
    checkField(out, q, path, "points", { type: "number", min: 0, max: 1000 });
    checkField(out, q, path, "estimatedSeconds", { type: "integer", min: 1, max: 7200 });
    checkField(out, q, path, "requiresReview", { type: "boolean" });
    checkField(out, q, path, "confidence", { type: "number", min: 0, max: 1 });
    checkField(out, q, path, "tags", { type: "array", maxItems: 40 });

    if (Array.isArray(q.choices)) {
      q.choices.forEach(function (c, i) { validateChoice(c, path + ".choices[" + i + "]", out); });
    }
    if (Array.isArray(q.sourceReferences)) {
      q.sourceReferences.forEach(function (s, i) { validateSourceReference(s, path + ".sourceReferences[" + i + "]", out); });
    }
    validateScoringRubric(q.scoringRubric, path + ".scoringRubric", out);
    validateCriterionAllocation(q.criterionAllocation, path + ".criterionAllocation", out);
  }

  /* Preset */
  function validatePreset(p, out) {
    out = out || [];
    if (!isPlainObject(p)) { out.push(err("type", "", "プリセットがオブジェクトではありません。")); return out; }
    checkField(out, p, "", "id", { type: "string", required: true, maxLength: 120 });
    checkField(out, p, "", "schemaVersion", { type: "integer", required: true, min: 1 });
    checkField(out, p, "", "name", { type: "string", required: true, minLength: 1, maxLength: 200 });
    checkField(out, p, "", "description", { type: "string", maxLength: 2000 });
    checkField(out, p, "", "ownerId", { type: "string", maxLength: 120 });
    checkField(out, p, "", "visibility", { type: "string", enum: ["private", "unlisted", "public"] });
    validateAppearance(p.appearance, "appearance", out);
    checkField(out, p, "", "questions", { type: "array", required: true, minItems: 0, maxItems: 1000 });
    if (Array.isArray(p.questions)) {
      p.questions.forEach(function (q, i) { validateQuestion(q, "questions[" + i + "]", out); });
    }
    return out;
  }

  /* 見た目（アイコン・バナー）。
     画像は data URL で持つ。保存領域を食うので上限を決めて、超えたら保存させない。
     外部 URL は受け付けない（読み込み先が消えたり、閲覧が追跡されたりするため）。 */
  var APPEARANCE_MAX = { iconImage: 200 * 1024, banner: 700 * 1024 };
  function validateAppearance(a, path, out) {
    if (a == null) return out;
    if (!isPlainObject(a)) { out.push(err("type", path, "見た目の設定がオブジェクトではありません。")); return out; }
    checkField(out, a, path, "icon", { type: "string", maxLength: 8 });
    ["iconImage", "banner"].forEach(function (k) {
      var v = a[k];
      if (v == null || v === "") return;
      if (typeof v !== "string") { out.push(err("type", path + "." + k, "画像は文字列で指定してください。")); return; }
      if (v.indexOf("data:image/") !== 0) {
        out.push(err("imageNotEmbedded", path + "." + k,
          "画像は端末内に取り込んだものだけ使えます（外部 URL は指定できません）。"));
        return;
      }
      if (v.length > APPEARANCE_MAX[k]) {
        out.push(err("imageTooLarge", path + "." + k,
          (k === "banner" ? "バナー" : "アイコン") + "画像が大きすぎます（"
          + Math.round(v.length / 1024) + "KB / 上限 " + Math.round(APPEARANCE_MAX[k] / 1024) + "KB）。"));
      }
    });
    return out;
  }

  /* MockQuestion — 試験の問題。Preset の Question に紙面・採点の情報が足される。 */
  /* 解答欄の形の指定（任意）。
     利用者がここを書いていれば、Planner の見立てより優先する。
     知らない種類は受け取らない（勝手な形を作らせないため）。 */
  var ANSWER_CELL_KINDS = ["small-box", "box-sequence", "wide-answer",
                           "lined-answer", "merged-answer", "fixed-label"];
  function validateAnswerLayoutHint(h, path, out) {
    if (!isPlainObject(h)) { out.push(err("type", path, "解答欄の指定がオブジェクトではありません。")); return; }
    checkField(out, h, path, "kind", { type: "string", required: true, enum: ANSWER_CELL_KINDS });
    checkField(out, h, path, "count", { type: "integer", min: 1, max: 40 });
    checkField(out, h, path, "label", { type: "string", maxLength: 8 });
  }

  function validateMockQuestion(q, path, out) {
    validateQuestion(q, path, out);
    if (q && q.answerLayoutHint !== undefined && q.answerLayoutHint !== null)
      validateAnswerLayoutHint(q.answerLayoutHint, path + ".answerLayoutHint", out);
    checkField(out, q, path, "sectionId", { type: "string", required: true, maxLength: 60 });
    checkField(out, q, path, "number", { type: "integer", required: true, min: 1 });
    checkField(out, q, path, "answerBindingId", { type: "string", required: true, maxLength: 60 });
    checkField(out, q, path, "points", { type: "number", required: true, min: 0, max: 1000 });
  }

  /* MockSection */
  function validateMockSection(s, path, out) {
    checkField(out, s, path, "id", { type: "string", required: true, maxLength: 60 });
    checkField(out, s, path, "number", { type: "integer", required: true, min: 1 });
    checkField(out, s, path, "title", { type: "string", maxLength: 200 });
    checkField(out, s, path, "instructions", { type: "string", maxLength: 2000 });
    checkField(out, s, path, "points", { type: "number", min: 0 });
    checkField(out, s, path, "questions", { type: "array", required: true, minItems: 1 });
    if (Array.isArray(s.questions) && s.questions.length > 60)
      out.push(err("sectionTooLarge", path + ".questions",
        "1 つの大問に入れられる設問は 60 問までです（現在 " + s.questions.length + " 問）。大問を分けてください。"));
    validateCriterionAllocation(s.criterionAllocation, path + ".criterionAllocation", out);
    if (Array.isArray(s.questions)) {
      s.questions.forEach(function (q, i) { validateMockQuestion(q, path + ".questions[" + i + "]", out); });
    }
  }

  /* PaperSpec — 紙面設定。 */
  /* ── 紙面レイアウトの選択（Typst / TeX の前段階）──────────────────
     ・出力エンジン（どう組むか）と紙面デザイン（どんな見た目か）は別の項目。
       同じフィールドへ混ぜない。
     ・すべて任意。未設定なら現在の Quick Mock と同じ動きになる。
     ・プロファイルの中身そのものはここへ書かない。ID と Seed だけを持つ。 */
  var OUTPUT_ENGINE_IDS = ["current", "typst", "tex"];
  /* 紙面デザイン・解答用紙デザインの ID。
     唯一の出所は pdf/layout-profiles.js（LAYOUT_MODES / ANSWER_SHEET_MODES）。
     schema.js は layout-profiles.js より先に読み込まれ（build-v2.mjs の FILES）、
     読み込まれない構成もある（例: tests/mock.test.mjs）ので、
     読めるときは向こうの一覧を使い、読めないときだけ下の控えを使う。
     文書形式・教科レイアウト（layout-grammar.js）とまったく同じやり方。

     以前は layout-profiles.js が読み込みのときに下の配列を push で
     書き換えていた。そのため保存前の検証の正しさが読み込み順に依存していた
     （実測 2026-08-05）。push はやめ、呼ばれたときに向こうを読む形へ直した。
     控えを変えるときは layout-profiles.js と必ず両方そろえること
     （tests/layout-profiles.test.mjs が食い違いを見つける）。 */
  var LAYOUT_MODE_IDS = ["current",
                         "standard-exam", "compact-exam", "two-column", "spacious-worksheet",
                         "entrance-exam", "source-based-exam", "english-test", "math-test",
                         "vocabulary-test", "booklet", "minimal-premium", "digital-mock",
                         "school-science-figure",
                         /* 旧 ID。保存済みデータのために残す（消すと開けなくなる）。 */
                         "school-standard", "school-english-reading", "common-test",
                         "vertical-japanese", "auto"];
  var ANSWER_SHEET_MODE_IDS = ["current", "grid-standard", "grid-dense", "written-heavy",
                               "math-work", "english-boxes", "mark-sheet", "auto"];
  function profileIds(key, fallback) {
    var LP = root.VQ2 && root.VQ2.layoutProfiles;
    var ids = LP && LP[key];
    return (Array.isArray(ids) && ids.length) ? ids : fallback;
  }
  /* 文書形式・教科レイアウト・解答用紙ファミリーの ID。
     唯一の出所は pdf/layout-grammar.js（DOCUMENT_FAMILIES / SUBJECT_PACKS /
     ANSWER_FAMILIES のキー）。schema.js は layout-grammar.js より先に読み込まれ、
     読み込まれない構成もある（例: tests/mock.test.mjs）ので、
     読めるときは向こうの一覧を使い、読めないときだけ下の控えを使う。
     控えを変えるときは layout-grammar.js と必ず両方そろえること。 */
  var DOCUMENT_FAMILY_IDS = ["school-exam-standard", "school-exam-dense", "mock-exam",
                             "common-test-style", "workbook", "quiz-sheet",
                             "classroom-assignment", "certification-test"];
  var SUBJECT_LAYOUT_IDS = ["japanese", "english", "mathematics", "science",
                            "social-studies", "information", "general"];
  var ANSWER_FAMILY_IDS = ["answer-dense-grid", "answer-standard-grid", "answer-written-heavy",
                           "answer-math-work", "answer-english", "answer-japanese",
                           "answer-mark", "answer-inline"];
  function grammarIds(key, fallback) {
    var G = root.VQ2 && root.VQ2.layoutGrammar;
    var ids = G && G[key];
    return (Array.isArray(ids) && ids.length) ? ids : fallback;
  }
  function validateLayoutSettings(l, path, out) {
    if (!isPlainObject(l)) { out.push(err("type", path, "レイアウト設定がオブジェクトではありません。")); return out; }
    checkField(out, l, path, "outputEngine", { type: "string", enum: OUTPUT_ENGINE_IDS });
    checkField(out, l, path, "layoutMode",
               { type: "string", enum: profileIds("LAYOUT_MODE_IDS", LAYOUT_MODE_IDS) });
    checkField(out, l, path, "answerSheetMode",
               { type: "string", enum: profileIds("ANSWER_SHEET_MODE_IDS", ANSWER_SHEET_MODE_IDS) });
    checkField(out, l, path, "documentFamily",
               { type: "string", enum: grammarIds("DOCUMENT_FAMILY_IDS", DOCUMENT_FAMILY_IDS) });
    checkField(out, l, path, "subjectLayout",
               { type: "string", enum: grammarIds("SUBJECT_IDS", SUBJECT_LAYOUT_IDS) });
    checkField(out, l, path, "answerFamily",
               { type: "string", enum: grammarIds("ANSWER_FAMILY_IDS", ANSWER_FAMILY_IDS) });
    checkField(out, l, path, "layoutProfileId", { type: "string", maxLength: 80 });
    checkField(out, l, path, "answerSheetProfileId", { type: "string", maxLength: 80 });
    checkField(out, l, path, "layoutSeed", { type: "string", maxLength: 40 });
    /* layoutPlan は生成物。ここでは形だけ見る（中身は layout-profiles が検証する）。 */
    if (l.layoutPlan !== undefined && l.layoutPlan !== null && !isPlainObject(l.layoutPlan))
      out.push(err("type", path + ".layoutPlan", "レイアウト計画がオブジェクトではありません。"));
    return out;
  }
  function defaultLayoutSettings() {
    return {
      outputEngine: "current",
      layoutMode: "current",
      answerSheetMode: "current",
      /* null は「指定なし＝おまかせ」。layout-profiles.js の既定とそろえる。 */
      documentFamily: null,
      subjectLayout: null,
      layoutProfileId: null,
      answerSheetProfileId: null,
      layoutSeed: null,
      layoutPlan: null
    };
  }

  function validatePaper(paper, path, out) {
    if (!isPlainObject(paper)) { out.push(err("required", path, "紙面設定がありません。")); return; }
    checkField(out, paper, path, "size", { type: "string", required: true, enum: ["A4", "A3", "B4", "B5", "custom"] });
    checkField(out, paper, path, "orientation", { type: "string", required: true, enum: ["portrait", "landscape"] });
    checkField(out, paper, path, "writingDirection", { type: "string", required: true, enum: ["horizontal", "vertical"] });
    checkField(out, paper, path, "engine", { type: "string", required: true, enum: ["auto", "typst", "latex"] });
    checkField(out, paper, path, "templateId", { type: "string", required: true, maxLength: 80 });
    checkField(out, paper, path, "templateVersion", { type: "string", maxLength: 20 });
    checkField(out, paper, path, "spread", { type: "boolean" });
    checkField(out, paper, path, "pageNumbering", { type: "boolean" });
    checkField(out, paper, path, "bookletMode", { type: "string", enum: ["single", "separate-answer-sheet", "combined"] });
    checkField(out, paper, path, "minimumFontSize", { type: "number", min: 4, max: 30 });
    if (paper.margins !== undefined && paper.margins !== null) {
      if (!isPlainObject(paper.margins)) { out.push(err("type", path + ".margins", "オブジェクトである必要があります。")); }
      else ["top", "bottom", "left", "right"].forEach(function (k) {
        checkField(out, paper.margins, path + ".margins", k, { type: "number", required: true, min: 0, max: 100 });
      });
    }
    if (paper.size === "custom") {
      checkField(out, paper, path, "customWidthMm", { type: "number", required: true, min: 50, max: 2000 });
      checkField(out, paper, path, "customHeightMm", { type: "number", required: true, min: 50, max: 2000 });
    }
  }

  /* AnswerBinding — 問題と回答欄の接続。ここが切れると紙とデジタルがずれる。 */
  function validateAnswerBinding(b, path, out) {
    checkField(out, b, path, "id", { type: "string", required: true, maxLength: 60 });
    checkField(out, b, path, "questionId", { type: "string", required: true, maxLength: 60 });
    checkField(out, b, path, "number", { type: "string", required: true, maxLength: 20 });
    checkField(out, b, path, "inputType", { type: "string", required: true, enum: QUESTION_TYPES });
    checkField(out, b, path, "points", { type: "number", required: true, min: 0 });
    checkField(out, b, path, "blankCount", { type: "integer", min: 1, max: 50 });
    checkField(out, b, path, "expectedChars", { type: "integer", min: 1, max: 4000 });
    checkField(out, b, path, "answerLines", { type: "integer", min: 1, max: 60 });
  }

  /* MockSpec — 試験の唯一の正式データ（§12）。 */
  function validateMockSpec(m, out) {
    out = out || [];
    if (!isPlainObject(m)) { out.push(err("type", "", "MockSpec がオブジェクトではありません。")); return out; }
    checkField(out, m, "", "id", { type: "string", required: true, maxLength: 120 });
    checkField(out, m, "", "schemaVersion", { type: "integer", required: true, min: 1 });
    checkField(out, m, "", "title", { type: "string", required: true, minLength: 1, maxLength: 200 });
    checkField(out, m, "", "subject", { type: "string", maxLength: 80 });
    checkField(out, m, "", "grade", { type: "string", maxLength: 60 });
    checkField(out, m, "", "audience", { type: "string", maxLength: 120 });
    checkField(out, m, "", "ownerId", { type: "string", maxLength: 120 });
    checkField(out, m, "", "durationMinutes", { type: "integer", required: true, min: 1, max: 600 });
    checkField(out, m, "", "totalPoints", { type: "integer", required: true, min: 1, max: 10000 });
    checkField(out, m, "", "instructions", { type: "string", maxLength: 4000 });
    checkField(out, m, "", "sourceMode", { type: "string", required: true, enum: ["source-only", "source-preferred", "open"] });
    checkField(out, m, "", "sections", { type: "array", required: true, minItems: 1, maxItems: 20 });
    checkField(out, m, "", "answerBindings", { type: "array", required: true, minItems: 1, maxItems: 800 });
    validatePaper(m.paper, "paper", out);
    /* 紙面レイアウトの選択（任意）。
       古い保存データには無い。無くても開けるように、あるときだけ見る。 */
    if (m.layout !== undefined && m.layout !== null) validateLayoutSettings(m.layout, "layout", out);
    if (Array.isArray(m.sections)) {
      m.sections.forEach(function (s, i) { validateMockSection(s, "sections[" + i + "]", out); });
    }
    if (Array.isArray(m.answerBindings)) {
      m.answerBindings.forEach(function (b, i) { validateAnswerBinding(b, "answerBindings[" + i + "]", out); });
    }
    if (Array.isArray(m.sourceReferences)) {
      m.sourceReferences.forEach(function (s, i) { validateSourceReference(s, "sourceReferences[" + i + "]", out); });
    }
    return out;
  }

  /* ══════════════════════════════════════════════════════════════════
     セッション状態遷移
     ══════════════════════════════════════════════════════════════════ */
  function canTransition(kind, from, to) {
    var table = kind === "mock" ? MOCK_TRANSITIONS : QUIZ_TRANSITIONS;
    if (!Object.prototype.hasOwnProperty.call(table, from)) return false;
    return table[from].indexOf(to) >= 0;
  }
  function transition(kind, session, to) {
    var from = session.state;
    if (from === to) return session;                       /* 同じ状態への再設定は無害 */
    if (!canTransition(kind, from, to)) {
      var e = new Error("INVALID_TRANSITION:" + from + "->" + to);
      e.code = "INVALID_TRANSITION"; e.from = from; e.to = to;
      throw e;
    }
    session.state = to;
    session.updatedAt = nowIso();
    session.stateHistory = session.stateHistory || [];
    session.stateHistory.push({ from: from, to: to, at: session.updatedAt });
    return session;
  }

  /* ══════════════════════════════════════════════════════════════════
     小道具
     ══════════════════════════════════════════════════════════════════ */
  function nowIso() { return new Date().toISOString(); }

  /* 衝突しにくい ID。crypto があれば使い、無ければ時刻＋乱数。 */
  function newId(prefix) {
    var rnd;
    try {
      if (root.crypto && root.crypto.getRandomValues) {
        var a = new Uint8Array(8); root.crypto.getRandomValues(a);
        rnd = Array.prototype.map.call(a, function (b) { return b.toString(16).padStart(2, "0"); }).join("");
      }
    } catch (e) {}
    if (!rnd) rnd = Math.random().toString(16).slice(2, 18);
    return (prefix || "id") + "_" + Date.now().toString(36) + "_" + rnd;
  }

  function isDeterministic(type) { return DETERMINISTIC_TYPES.indexOf(type) >= 0; }
  function isAiGraded(type) { return AI_GRADED_TYPES.indexOf(type) >= 0; }
  function hasChoices(type) { return CHOICE_TYPES.indexOf(type) >= 0; }
  function criterionLabel(id) {
    for (var i = 0; i < CRITERIA.length; i++) if (CRITERIA[i].id === id) return CRITERIA[i].label;
    return id;
  }

  /* ── 採点基準（Rubric）─────────────────────────────────────────
     記述・論述・英作文は、採点基準が無いと AI 採点そのものが動かない
     （根拠を示せない採点は行わない、という決まりのため）。
     利用者が何も設定していない場合に備えて、形式ごとの下敷きをここで作る。
     ・合計は必ず配点と一致させる（一致しないと保存時に弾かれる）。
     ・あくまで下敷き。編集画面で書き換えられる。 ── */
  var RUBRIC_TEMPLATES = {
    long_answer: [
      { w: 0.6, description: "問われていることに答えられている（内容）", criterionId: "thinking_judgment_expression" },
      { w: 0.4, description: "根拠や理由が示されている", criterionId: "knowledge_skill" }
    ],
    essay: [
      { w: 0.4, description: "主張がはっきりしている", criterionId: "thinking_judgment_expression" },
      { w: 0.4, description: "主張を支える根拠が示されている", criterionId: "thinking_judgment_expression" },
      { w: 0.2, description: "構成と表記が整っている", criterionId: "knowledge_skill" }
    ],
    english_writing: [
      { w: 0.4, description: "課題の内容に答えられている", criterionId: "thinking_judgment_expression" },
      { w: 0.4, description: "文法・語法が正しい", criterionId: "knowledge_skill" },
      { w: 0.2, description: "語彙と表現が適切である", criterionId: "knowledge_skill" }
    ],
    source_analysis: [
      { w: 0.5, description: "資料から必要な情報を読み取れている", criterionId: "knowledge_skill" },
      { w: 0.5, description: "読み取った内容から適切に考えられている", criterionId: "thinking_judgment_expression" }
    ]
  };

  /* 合計が points ぴったりになるように割り振る。端数は先頭から 1 点ずつ足す。 */
  function defaultRubric(type, points, opts) {
    opts = opts || {};
    var total = (typeof points === "number" && isFinite(points) && points > 0) ? Math.round(points) : 1;

    /* 模範解答があるなら、そこから「何が書けていれば点になるか」を作る。
       「主張がはっきりしている」「表記が整っている」だけを基準にすると、
       長くて丁寧なだけの答案に点が付く（実測でそうなっていた）。 */
    var model = String(opts.modelAnswer || "").trim();
    var EV = root.VQ2 && root.VQ2.evaluator;
    if (model && EV && EV.splitPoints) {
      var pts = EV.splitPoints(model).slice(0, Math.max(1, Math.min(5, total)));
      if (pts.length) {
        var per = Math.floor(total / pts.length);
        var rest = total - per * pts.length;
        var items = pts.map(function (t, k) {
          return {
            id: "r" + (k + 1),
            description: "「" + String(t).slice(0, 40) + "」に触れている（内容）",
            points: per + (k < rest ? 1 : 0),
            criterionId: "thinking_judgment_expression"
          };
        }).filter(function (x) { return x.points > 0; });
        if (items.length) {
          var s2 = items.reduce(function (a, b) { return a + b.points; }, 0);
          if (s2 !== total) items[0].points += total - s2;
          return { items: items };
        }
      }
    }
    var tpl = RUBRIC_TEMPLATES[type] || RUBRIC_TEMPLATES.long_answer;
    if (total < tpl.length) tpl = tpl.slice(0, Math.max(1, total));
    var raw = tpl.map(function (t) { return Math.max(1, Math.floor(total * t.w)); });
    var sum = raw.reduce(function (a, b) { return a + b; }, 0);
    var i = 0;
    while (sum < total) { raw[i % raw.length]++; sum++; i++; }
    while (sum > total) {
      var j = raw.length - 1 - (i % raw.length);
      if (raw[j] > 1) { raw[j]--; sum--; }
      else if (raw.every(function (v) { return v <= 1; })) break;
      i++;
    }
    return {
      items: tpl.map(function (t, k) {
        return { id: "r" + (k + 1), description: t.description, points: raw[k], criterionId: t.criterionId };
      })
    };
  }
  /* 配点を変えたときに、内訳の比率を保ったまま合計を合わせ直す。 */
  function rescaleRubric(rubric, points) {
    var items = (rubric && Array.isArray(rubric.items)) ? rubric.items : null;
    if (!items || !items.length) return rubric;
    var total = (typeof points === "number" && isFinite(points) && points > 0) ? Math.round(points) : 0;
    if (total <= 0) return { items: items.map(function (r) { return Object.assign({}, r, { points: 0 }); }) };
    /* 配点より基準の数が多いと、1 点ずつ配っても合計が超えてしまう。
       そのときは重いものから残す（0 点の基準を並べても採点の役に立たない）。 */
    if (items.length > total) {
      var rank = items.map(function (r, i) { return { i: i, p: typeof r.points === "number" ? r.points : 0 }; })
        .sort(function (a, b) { return b.p - a.p || a.i - b.i; })
        .slice(0, total).map(function (x) { return x.i; }).sort(function (a, b) { return a - b; });
      items = rank.map(function (i) { return items[i]; });
    }
    var cur = items.reduce(function (a, r) { return a + (typeof r.points === "number" ? r.points : 0); }, 0);
    var out = items.map(function (r) {
      var p = cur > 0 ? Math.max(1, Math.round(total * (r.points || 0) / cur)) : Math.max(1, Math.floor(total / items.length));
      return Object.assign({}, r, { points: p });
    });
    var sum = out.reduce(function (a, r) { return a + r.points; }, 0), i = 0;
    while (sum < total) { out[i % out.length].points++; sum++; i++; }
    while (sum > total) {
      var j = out.length - 1 - (i % out.length);
      if (out[j].points > 1) { out[j].points--; sum--; }
      else if (out.every(function (r) { return r.points <= 1; })) break;
      i++;
    }
    return { items: out };
  }

  /* ── 空の Entity を作る（UI から使う） ─────────────────────────── */
  function emptyQuestion(overrides) {
    var q = {
      id: newId("q"), schemaVersion: SCHEMA_VERSION, type: "multiple_choice_single",
      prompt: "", promptRichText: null, media: [], choices: [],
      correctAnswer: null, acceptedAnswers: [], answerNormalization: null,
      explanation: "", choiceExplanations: null,
      difficulty: "normal", topic: "", tags: [], points: 1, estimatedSeconds: 60,
      sourceReferences: [], requiresReview: false, confidence: null,
      validationIssues: [], createdBy: "manual",
      createdAt: nowIso(), updatedAt: nowIso()
    };
    if (overrides) for (var k in overrides) q[k] = overrides[k];
    return q;
  }
  function emptyChoice(label, text) {
    return { id: newId("c"), label: label || "", text: text || "", explanation: "", isCorrect: false };
  }
  function emptyPreset(overrides) {
    var p = {
      id: newId("preset"), schemaVersion: SCHEMA_VERSION, ownerId: "",
      name: "", description: "", visibility: "private",
      subjectId: "", subjects: [], tagIds: [], tags: [],
      /* 見た目。アイコンは絵文字か画像、バナーは画像（どちらも data URL）。
         未設定なら空文字のまま。無いものを勝手に作らない。 */
      appearance: { icon: "", iconImage: "", banner: "" },
      /* 読み上げの既定。問題ごとに上書きできる（q.voice / q.speed）。
         空なら、原稿の言語から自動で決める。 */
      audio: { voice: "", speed: 1 },
      questions: [], revision: 1,
      createdAt: nowIso(), updatedAt: nowIso()
    };
    if (overrides) for (var k in overrides) p[k] = overrides[k];
    return p;
  }

  /* ── 既定の紙面設定 ────────────────────────────────────────────── */
  function defaultPaper(overrides) {
    var p = {
      size: "A4", orientation: "portrait", spread: false,
      writingDirection: "horizontal", engine: "auto",
      templateId: "standard-school-exam", templateVersion: "1.0.0",
      margins: { top: 20, bottom: 20, left: 18, right: 18 },
      pageNumbering: true, minimumFontSize: 9, bookletMode: "separate-answer-sheet"
    };
    if (overrides) for (var k in overrides) p[k] = overrides[k];
    return p;
  }

  /* ── 公開 ─────────────────────────────────────────────────────── */
  VQ2.schema = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    QUESTION_TYPES: QUESTION_TYPES,
    LEGACY_QUESTION_TYPES: LEGACY_QUESTION_TYPES,
    DETERMINISTIC_TYPES: DETERMINISTIC_TYPES,
    AI_GRADED_TYPES: AI_GRADED_TYPES,
    CHOICE_TYPES: CHOICE_TYPES,
    CRITERIA: CRITERIA,
    CRITERION_IDS: CRITERION_IDS,
    QUIZ_SESSION_STATES: QUIZ_SESSION_STATES,
    MOCK_SESSION_STATES: MOCK_SESSION_STATES,
    QUIZ_TRANSITIONS: QUIZ_TRANSITIONS,
    MOCK_TRANSITIONS: MOCK_TRANSITIONS,
    DRAFT_STATES: DRAFT_STATES,
    SOURCE_TYPES: SOURCE_TYPES,
    SEVERITIES: SEVERITIES,
    USAGE_EVENT_TYPES: USAGE_EVENT_TYPES,

    validatePreset: validatePreset,
    validateAppearance: validateAppearance,
    APPEARANCE_MAX: APPEARANCE_MAX,
    validateQuestion: validateQuestion,
    validateChoice: validateChoice,
    validateSourceReference: validateSourceReference,
    validateMockSpec: validateMockSpec,
    validateMockSection: validateMockSection,
    validateMockQuestion: validateMockQuestion,
    validateAnswerBinding: validateAnswerBinding,
    validateScoringRubric: validateScoringRubric,
    validateCriterionAllocation: validateCriterionAllocation,
    validatePaper: validatePaper,

    canTransition: canTransition,
    transition: transition,

    isDeterministic: isDeterministic,
    isAiGraded: isAiGraded,
    defaultRubric: defaultRubric,
    rescaleRubric: rescaleRubric,
    RUBRIC_TEMPLATES: RUBRIC_TEMPLATES,
    hasChoices: hasChoices,
    criterionLabel: criterionLabel,

    emptyQuestion: emptyQuestion,
    emptyChoice: emptyChoice,
    emptyPreset: emptyPreset,
    defaultPaper: defaultPaper,
    defaultLayoutSettings: defaultLayoutSettings,
    ANSWER_CELL_KINDS: ANSWER_CELL_KINDS,
    validateAnswerLayoutHint: validateAnswerLayoutHint,
    validateLayoutSettings: validateLayoutSettings,
    OUTPUT_ENGINE_IDS: OUTPUT_ENGINE_IDS,
    /* layout-profiles.js が読めないときの控え（上の注記を参照）。
       実際の検査は profileIds() が向こうの一覧を優先して使う。 */
    LAYOUT_MODE_IDS_FALLBACK: LAYOUT_MODE_IDS,
    ANSWER_SHEET_MODE_IDS_FALLBACK: ANSWER_SHEET_MODE_IDS,
    /* layout-grammar.js が読めないときの控え（上の注記を参照） */
    DOCUMENT_FAMILY_IDS_FALLBACK: DOCUMENT_FAMILY_IDS,
    SUBJECT_LAYOUT_IDS_FALLBACK: SUBJECT_LAYOUT_IDS,
    ANSWER_FAMILY_IDS_FALLBACK: ANSWER_FAMILY_IDS,

    newId: newId,
    nowIso: nowIso,
    err: err, warn: warn, info: info
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
