/* ══════════════════════════════════════════════════════════════════════
   VocabuSpeak — 教材の型（Content Atom と Exercise Variant）

   いちばん大事な分け方:

     Content Atom      … 学ぶ「中身」。英文そのもの。1 つだけ。
     Exercise Variant  … その中身を「どう出すか」。同じ英文から何通りも作る。

   同じ英文でも、聞く・書き取る・埋める・並べ替える・話すでは
   別の学習になる。だから Atom は 1 つのまま、Variant を増やす。

   ・**音声話者や選択肢の順だけを別教材として数えない**（§19 の禁止）。
     それは同じ Variant の見せ方（AudioVariant / 表示設定）として扱う。
   ・familyId は「言い方が違うだけで同じことを言っている」ものをまとめる。
     出題のとき、同じ family を続けて出さないために使う。

   ここは純粋なデータ層。画面も保存も持たない（Node でも動く）。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var Q = VQ2.qtypes;
  if (!Q) throw new Error("VQ2.qtypes must be loaded before speak-model.js");

  var MODEL_VERSION = 1;

  function str(v) { return v === undefined || v === null ? "" : String(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function num(v, d) { return isNum(v) ? v : (isNum(Number(v)) && str(v) !== "" ? Number(v) : d); }
  function uniq(a) { var s = Object.create(null), o = []; arr(a).forEach(function (x) { var k = str(x); if (k && !s[k]) { s[k] = 1; o.push(k); } }); return o; }

  /* ══════════════════════════════════════════════════════════════════
     1) レベル（CEFR 相当）
     画面では日本語と CEFR を並べて出す（「初中級・A2」）。
     ══════════════════════════════════════════════════════════════════ */
  var LEVELS = [
    { id: "pre_a1", cefr: "Pre-A1", ja: "入門",   order: 0,
      maxWords: 6,  turns: [3, 4],  speed: 0.75, subtitle: "always", ja_translation: true,  strictness: 0.6 },
    { id: "a1",     cefr: "A1",     ja: "初級",   order: 1,
      maxWords: 8,  turns: [4, 6],  speed: 0.85, subtitle: "always", ja_translation: true,  strictness: 0.7 },
    { id: "a2",     cefr: "A2",     ja: "初中級", order: 2,
      maxWords: 12, turns: [5, 8],  speed: 0.95, subtitle: "after",  ja_translation: true,  strictness: 0.8 },
    { id: "b1",     cefr: "B1",     ja: "中級",   order: 3,
      maxWords: 16, turns: [6, 10], speed: 1.0,  subtitle: "after",  ja_translation: false, strictness: 0.9 },
    { id: "b2",     cefr: "B2",     ja: "中上級", order: 4,
      maxWords: 22, turns: [8, 12], speed: 1.1,  subtitle: "hint",   ja_translation: false, strictness: 1.0 },
    { id: "c1",     cefr: "C1",     ja: "上級",   order: 5,
      maxWords: 30, turns: [10, 16], speed: 1.15, subtitle: "none",  ja_translation: false, strictness: 1.1 }
  ];
  var LEVEL_BY_ID = Object.create(null);
  LEVELS.forEach(function (l) { LEVEL_BY_ID[l.id] = l; });

  function level(id) { return LEVEL_BY_ID[str(id)] || null; }
  function levelLabel(id) {
    var l = level(id);
    return l ? l.ja + "・" + l.cefr : str(id);
  }
  function levelOrder(id) { var l = level(id); return l ? l.order : -1; }
  /* 近いレベルか。1 段ちがいまでは混ぜてよい（教材が薄いカテゴリで詰まないため）。 */
  function levelNear(a, b, span) {
    var x = levelOrder(a), y = levelOrder(b);
    if (x < 0 || y < 0) return false;
    return Math.abs(x - y) <= (isNum(span) ? span : 1);
  }

  /* ══════════════════════════════════════════════════════════════════
     2) 教材の種類と出題形式
     ══════════════════════════════════════════════════════════════════ */
  var CONTENT_TYPES = ["word", "phrase", "sentence", "dialogue_turn", "dialogue",
                       "passage", "grammar_pattern", "pronunciation_target"];

  /* 出題形式（Activity）→ VocabuQuiz の問題形式。
     **専用の形式を作らない**。表示・採点・編集がそろっている既存の形式へ乗せる（§36）。
     needsVoice … ユーザーが声を出す形式（STT が要る）
     needsAudio … 音を聞かせる形式（Kokoro が要る） */
  var ACTIVITIES = {
    listening_choice:       { ja: "リスニング選択",   qtype: "audio_choice",      needsAudio: true,  needsVoice: false, seconds: 30 },
    listening_comprehension:{ ja: "会話理解",         qtype: "audio_choice",      needsAudio: true,  needsVoice: false, seconds: 45 },
    dictation:              { ja: "ディクテーション", qtype: "dictation",         needsAudio: true,  needsVoice: false, seconds: 60 },
    audio_fill_blank:       { ja: "音声穴埋め",       qtype: "audio_fill_blank",  needsAudio: true,  needsVoice: false, seconds: 45 },
    text_fill_blank:        { ja: "英文穴埋め",       qtype: "fill_blank",        needsAudio: false, needsVoice: false, seconds: 40 },
    sentence_reorder:       { ja: "英文並べ替え",     qtype: "reorder_english",   needsAudio: false, needsVoice: false, seconds: 50 },
    translation_to_english: { ja: "和文英訳",         qtype: "translate_en",      needsAudio: false, needsVoice: false, seconds: 60 },
    translation_to_japanese:{ ja: "英文和訳",         qtype: "translate_ja",      needsAudio: false, needsVoice: false, seconds: 45 },
    error_correction:       { ja: "誤文訂正",         qtype: "error_correction",  needsAudio: false, needsVoice: false, seconds: 45 },
    best_expression:        { ja: "表現選択",         qtype: "choice_best",       needsAudio: false, needsVoice: false, seconds: 35 },
    dialogue_response:      { ja: "会話応答",         qtype: "dialog_response",   needsAudio: true,  needsVoice: false, seconds: 40 },
    flashcard:              { ja: "フラッシュカード", qtype: "flashcard",         needsAudio: false, needsVoice: false, seconds: 15 },
    /* ここから下は声を出す形式。STT と発音分析が要る。
       レジストリでも coming_soon のままなので、**できたふりをしない**。 */
    speaking_repeat:        { ja: "リピート",         qtype: "read_aloud_check",  needsAudio: true,  needsVoice: true,  seconds: 40, beta: true },
    pronunciation_practice: { ja: "発音練習",         qtype: "pronunciation_score", needsAudio: true, needsVoice: true, seconds: 40, beta: true },
    shadowing:              { ja: "シャドーイング",   qtype: "shadowing",         needsAudio: true,  needsVoice: true,  seconds: 60, beta: true },
    roleplay:               { ja: "ロールプレイ",     qtype: null,                needsAudio: true,  needsVoice: true,  seconds: 180, beta: true }
  };
  var ACTIVITY_IDS = Object.keys(ACTIVITIES);

  function activity(id) { return ACTIVITIES[str(id)] || null; }
  function activityLabel(id) { var a = activity(id); return a ? a.ja : str(id); }
  /* いま実際に出せる形式か。声を出す形式は、声を取れる端末でだけ。 */
  function activityUsable(id, o) {
    o = o || {};
    var a = activity(id);
    if (!a) return false;
    if (a.needsAudio && o.canPlayAudio === false) return false;
    /* 声を出す形式は、**録音できて、かつ聞き取れる**ときだけ。
       どちらか欠けると採点できないので出さない（点を作り話さないため）。
       beta は「音素の評価がまだ無い」という表示上の断りで、出す・出さないは決めない。 */
    if (a.needsVoice && !(o.canRecord && o.canTranscribe)) return false;
    if (!a.qtype) return o.allowNonQuestion === true;
    var d = Q.get(a.qtype);
    if (!d) return false;
    /* 画面を持たない形式は出さない。ただし声を出す形式は
       speak.js が専用の画面を持つので、ここでは止めない。 */
    if (d.status === "coming_soon" && !a.needsVoice) return false;
    return true;
  }
  /* 「ベータ」と断るべき形式か（音素の評価がまだ無い）。 */
  function activityIsBeta(id) { var a = activity(id); return !!(a && a.beta); }
  function usableActivities(o) {
    return ACTIVITY_IDS.filter(function (id) { return activityUsable(id, o); });
  }

  /* ══════════════════════════════════════════════════════════════════
     3) 文字の正規化（重複を見つけるため・§20）
     大文字小文字・記号・空白・短縮形・Unicode をそろえる。
     **意味を変える書き換えはしない**（don't → do not は同じ意味なのでそろえる）。
     ══════════════════════════════════════════════════════════════════ */
  var CONTRACTIONS = [
    [/\bcan['’]t\b/gi, "cannot"], [/\bwon['’]t\b/gi, "will not"],
    [/\bn['’]t\b/gi, " not"], [/\b(i)['’]m\b/gi, "$1 am"],
    [/['’]re\b/gi, " are"], [/['’]ve\b/gi, " have"],
    [/['’]ll\b/gi, " will"], [/['’]d\b/gi, " would"],
    [/\blet['’]s\b/gi, "let us"]
  ];
  function normText(s) {
    var t = str(s);
    try { t = t.normalize("NFKC"); } catch (e) {}
    t = t.replace(/[’‘]/g, "'").replace(/[“”]/g, '"');
    CONTRACTIONS.forEach(function (p) { t = t.replace(p[0], p[1]); });
    t = t.toLowerCase()
         .replace(/[.,!?;:"'`()\[\]{}…—–\-]/g, " ")
         .replace(/\s+/g, " ")
         .trim();
    return t;
  }
  /* 同じかどうかを 1 つの文字列で表す。完全一致と正規化一致の両方に使う。 */
  function fingerprint(atom) {
    if (!isObj(atom)) return "";
    return normText(atom.english) + "|" + normText(atom.japanese || "");
  }
  function wordsOf(s) { return normText(s).split(" ").filter(Boolean); }

  /* 語がどれだけ重なっているか（0〜1）。意味の近さの目安に使う。
     Embedding は使わない（端末で完結させるため）。**近いと断定はしない**。 */
  function overlap(a, b) {
    var x = wordsOf(a), y = wordsOf(b);
    if (!x.length || !y.length) return 0;
    var seen = Object.create(null);
    x.forEach(function (w) { seen[w] = 1; });
    var hit = 0;
    y.forEach(function (w) { if (seen[w]) hit++; });
    return hit / Math.max(x.length, y.length);
  }

  /* ══════════════════════════════════════════════════════════════════
     4) Content Atom
     ══════════════════════════════════════════════════════════════════ */
  var ATOM_STATUS = ["draft", "validated", "reviewed", "published", "archived"];

  function normalizeAtom(src) {
    var a = isObj(src) ? src : {};
    var out = {
      id: str(a.id),
      familyId: str(a.familyId) || str(a.id),
      version: num(a.version, 1),
      modelVersion: MODEL_VERSION,
      status: ATOM_STATUS.indexOf(str(a.status)) >= 0 ? str(a.status) : "draft",
      level: level(a.level) ? str(a.level) : "a1",
      categoryId: str(a.categoryId),
      unitId: str(a.unitId) || undefined,
      lessonId: str(a.lessonId) || undefined,
      scenarioId: str(a.scenarioId) || undefined,
      contentType: CONTENT_TYPES.indexOf(str(a.contentType)) >= 0 ? str(a.contentType) : "sentence",
      english: str(a.english).trim(),
      japanese: str(a.japanese).trim() || undefined,
      alternativeExpressions: uniq(arr(a.alternativeExpressions).map(str)).slice(0, 12),
      acceptedMeanings: uniq(arr(a.acceptedMeanings).map(str)).slice(0, 12),
      grammarTags: uniq(arr(a.grammarTags).map(str)).slice(0, 12),
      vocabularyTags: uniq(arr(a.vocabularyTags).map(str)).slice(0, 16),
      pronunciationTargets: uniq(arr(a.pronunciationTargets).map(str)).slice(0, 8),
      phonemes: uniq(arr(a.phonemes).map(str)).slice(0, 24),
      difficulty: Math.max(1, Math.min(10, num(a.difficulty, 3))),
      estimatedSeconds: num(a.estimatedSeconds, null) || undefined,
      speakers: arr(a.speakers).map(function (s) {
        return { role: str(s && s.role), english: str(s && s.english), japanese: str(s && s.japanese) };
      }).filter(function (s) { return s.english; }),
      source: isObj(a.source) ? {
        generator: str(a.source.generator) || undefined,
        generatedAt: str(a.source.generatedAt) || undefined,
        generationBatchId: str(a.source.generationBatchId) || undefined
      } : undefined,
      createdAt: str(a.createdAt),
      updatedAt: str(a.updatedAt)
    };
    Object.keys(out).forEach(function (k) { if (out[k] === undefined) delete out[k]; });
    return out;
  }

  /* 教材として成り立っているか。**直せる形で理由を返す**（捨てるだけにしない）。 */
  function validateAtom(a) {
    var out = [];
    function err(code, msg) { out.push({ level: "error", code: code, message: msg }); }
    function warn(code, msg) { out.push({ level: "warning", code: code, message: msg }); }
    if (!isObj(a)) return [{ level: "error", code: "noAtom", message: "教材がありません。" }];
    if (!str(a.id)) err("noId", "id がありません。");
    if (!str(a.familyId)) err("noFamily", "familyId がありません。似た表現をまとめられません。");
    if (!str(a.english).trim()) err("noEnglish", "英文がありません。");
    if (!level(a.level)) err("badLevel", "レベルが正しくありません。");
    if (!str(a.categoryId)) err("noCategory", "カテゴリーがありません。");

    var en = str(a.english).trim();
    if (en) {
      if (!/[A-Za-z]/.test(en)) err("notEnglish", "英文に英字がありません。");
      if (/[ぁ-んァ-ヶ一-鿿]/.test(en)) err("japaneseInEnglish", "英文に日本語が混ざっています。");
      /* 読み上げられない書き方（URL・記号だけ・全角）を止める（§21 の TTS 適性）。 */
      if (/https?:\/\//i.test(en)) err("urlInEnglish", "英文に URL が入っています。読み上げられません。");
      if (/[Ａ-Ｚａ-ｚ０-９]/.test(en)) warn("fullWidth", "全角の英数字が入っています。");
      var lv = level(a.level);
      var wc = en.split(/\s+/).filter(Boolean).length;
      if (lv && wc > lv.maxWords)
        warn("tooLong", "「" + levelLabel(a.level) + "」には長すぎます（" + wc + " 語 / 目安 " + lv.maxWords + " 語）。");
      if (a.contentType !== "word" && a.contentType !== "phrase" && wc < 2)
        warn("tooShort", "文としては短すぎます。");
    }
    if (a.contentType !== "pronunciation_target" && !str(a.japanese).trim())
      warn("noJapanese", "日本語訳がありません。意味を選ぶ問題を作れません。");
    if (str(a.japanese) && !/[ぁ-んァ-ヶ一-鿿]/.test(str(a.japanese)))
      warn("japaneseNotJapanese", "日本語訳に日本語が入っていません。");
    if (a.contentType === "dialogue" && arr(a.speakers).length < 2)
      err("noSpeakers", "会話なのに話し手が 2 人そろっていません。");
    return out;
  }

  /* ══════════════════════════════════════════════════════════════════
     5) Exercise Variant
     ══════════════════════════════════════════════════════════════════ */
  function normalizeVariant(src) {
    var v = isObj(src) ? src : {};
    var act = activity(v.activityType) ? str(v.activityType) : "listening_choice";
    var out = {
      id: str(v.id),
      contentAtomId: str(v.contentAtomId),
      familyId: str(v.familyId),
      activityType: act,
      variantVersion: num(v.variantVersion, 1),
      modelVersion: MODEL_VERSION,
      prompt: str(v.prompt) || undefined,
      instructionJa: str(v.instructionJa) || defaultInstruction(act),
      content: v.content === undefined ? null : v.content,
      answerDefinition: v.answerDefinition === undefined ? null : v.answerDefinition,
      scoringRule: isObj(v.scoringRule) ? v.scoringRule : null,
      explanationJa: str(v.explanationJa) || undefined,
      hints: arr(v.hints).map(str).filter(Boolean).slice(0, 4),
      ttsConfig: isObj(v.ttsConfig) ? {
        voiceId: str(v.ttsConfig.voiceId) || undefined,
        speed: num(v.ttsConfig.speed, null) || undefined,
        accent: str(v.ttsConfig.accent) || undefined
      } : undefined,
      difficultyAdjustment: num(v.difficultyAdjustment, 0),
      estimatedSeconds: num(v.estimatedSeconds, (activity(act) || {}).seconds || 30),
      status: ["draft", "validated", "published", "archived"].indexOf(str(v.status)) >= 0 ? str(v.status) : "draft"
    };
    Object.keys(out).forEach(function (k) { if (out[k] === undefined) delete out[k]; });
    return out;
  }

  var DEFAULT_INSTRUCTION = {
    listening_choice: "音声を聞いて、意味に合うものを選びましょう。",
    listening_comprehension: "会話を聞いて、答えを選びましょう。",
    dictation: "音声を聞いて、聞こえたとおりに書きましょう。",
    audio_fill_blank: "音声を聞いて、空いているところを埋めましょう。",
    text_fill_blank: "空いているところに入る語を書きましょう。",
    sentence_reorder: "正しい順に並べて、英文を作りましょう。",
    translation_to_english: "日本語の意味になるよう、英語で書きましょう。",
    translation_to_japanese: "英文の意味を日本語で書きましょう。",
    error_correction: "誤りを見つけて、正しい形に直しましょう。",
    best_expression: "この場面でいちばん自然な言い方を選びましょう。",
    dialogue_response: "相手の言葉を聞いて、返事を選びましょう。",
    flashcard: "意味を思い出してから、めくりましょう。",
    speaking_repeat: "見本のあとに、同じように言ってみましょう。",
    pronunciation_practice: "英文を声に出して読みましょう。",
    shadowing: "見本を聞きながら、少し遅れて同じように言いましょう。",
    roleplay: "場面に合わせて話してみましょう。"
  };
  function defaultInstruction(act) { return DEFAULT_INSTRUCTION[act] || "問題に答えましょう。"; }

  function validateVariant(v, atom) {
    var out = [];
    function err(code, msg) { out.push({ level: "error", code: code, message: msg }); }
    function warn(code, msg) { out.push({ level: "warning", code: code, message: msg }); }
    if (!isObj(v)) return [{ level: "error", code: "noVariant", message: "出題がありません。" }];
    if (!str(v.id)) err("noId", "id がありません。");
    if (!str(v.contentAtomId)) err("noAtom", "元の教材（contentAtomId）がありません。");
    if (!str(v.familyId)) err("noFamily", "familyId がありません。");
    var a = activity(v.activityType);
    if (!a) { err("badActivity", "知らない出題形式です: " + str(v.activityType)); return out; }
    if (atom && str(atom.id) && str(v.contentAtomId) !== str(atom.id))
      err("atomMismatch", "元の教材と結びついていません。");
    if (atom && str(atom.familyId) && str(v.familyId) !== str(atom.familyId))
      err("familyMismatch", "familyId が元の教材と違います。");

    var c = isObj(v.content) ? v.content : {};
    var ans = v.answerDefinition;
    switch (v.activityType) {
      case "listening_choice":
      case "listening_comprehension":
      case "dialogue_response":
      case "best_expression":
        if (arr(c.choices).length < 2) err("tooFewChoices", "選択肢が 2 つ未満です。");
        else if (!arr(c.choices).some(function (x) { return str(x.id) === str(ans) || str(x.text) === str(ans); }))
          err("noCorrect", "正解が選択肢の中にありません。");
        if (uniqCount(arr(c.choices).map(function (x) { return normText(x.text); })) !== arr(c.choices).length)
          err("duplicateChoice", "同じ内容の選択肢があります。");
        break;
      case "dictation":
        if (!str(ans).trim()) err("noAnswer", "書き取る文がありません。");
        break;
      case "audio_fill_blank":
      case "text_fill_blank":
        if (!arr(c.blanks).length) err("noBlanks", "空欄がありません。");
        else if (arr(c.blanks).some(function (b) { return !str(b.answer).trim(); }))
          err("emptyBlank", "空欄の正解が空です。");
        if (str(c.text) && str(c.text).indexOf("_") < 0 && str(c.text).indexOf("【") < 0)
          warn("noBlankMark", "文の中に空欄の印がありません。");
        break;
      case "sentence_reorder":
        if (arr(c.items).length < 3) err("tooFewItems", "並べ替えの部品が少なすぎます。");
        if (uniqCount(arr(c.items).map(normText)) !== arr(c.items).length)
          err("duplicateItem", "同じ部品が 2 つあります。正しい順が 1 通りに決まりません。");
        break;
      case "translation_to_english":
        if (!str(c.japanese).trim()) err("noJapanese", "もとになる日本語がありません。");
        if (!str(ans).trim()) err("noAnswer", "正解の英文がありません。");
        break;
      case "translation_to_japanese":
        if (!str(c.english).trim()) err("noEnglish", "もとになる英文がありません。");
        if (!str(ans).trim()) err("noAnswer", "正解の日本語がありません。");
        break;
      case "error_correction":
        if (!arr(c.errors).length) err("noErrors", "どこが誤りかが決まっていません。");
        else if (arr(c.errors).some(function (e) { return !str(e.wrong) || !str(e.correct); }))
          err("emptyError", "誤りと正しい形のどちらかが空です。");
        else if (str(c.text) && arr(c.errors).some(function (e) { return str(c.text).indexOf(str(e.wrong)) < 0; }))
          err("errorNotInText", "誤りとされた語が、問題文の中にありません。");
        break;
      case "flashcard":
        if (!str(c.front).trim() || !str(c.back).trim()) err("emptyCard", "カードの表か裏が空です。");
        break;
      case "speaking_repeat":
      case "pronunciation_practice":
      case "shadowing":
        if (!str(c.target).trim()) err("noTarget", "読み上げる英文がありません。");
        break;
      default: break;
    }
    /* 問題文に正解がそのまま出ていないか（§21）。 */
    var shown = str(v.prompt) + " " + str(c.text) + " " + str(c.english);
    var answerText = typeof ans === "string" ? ans : "";
    if (answerText && normText(answerText).length >= 4
        && normText(shown).indexOf(normText(answerText)) >= 0
        && v.activityType !== "pronunciation_practice" && v.activityType !== "shadowing"
        && v.activityType !== "speaking_repeat" && v.activityType !== "translation_to_japanese")
      err("answerInPrompt", "問題文の中に正解がそのまま出ています。");
    return out;
  }
  function uniqCount(list) { return uniq(list).length; }

  /* ══════════════════════════════════════════════════════════════════
     6) Variant → VocabuQuiz の問題
     **専用のレンダラーや採点を作らない**。既存の形式へ翻訳して渡す（§36）。
     ここで作った問題は、そのまま既存の question-renderer / evaluator で動く。
     ══════════════════════════════════════════════════════════════════ */
  function toQuestion(v, atom, o) {
    o = o || {};
    var a = activity(v && v.activityType);
    if (!a || !a.qtype) return null;
    var c = isObj(v.content) ? v.content : {};
    var ans = v.answerDefinition;
    var lv = level((atom && atom.level) || o.level) || LEVEL_BY_ID.a1;
    var q = {
      id: o.idPrefix ? o.idPrefix + str(v.id) : str(v.id),
      type: a.qtype,
      prompt: str(v.prompt) || v.instructionJa,
      instruction: str(v.instructionJa),
      explanation: str(v.explanationJa),
      points: num(o.points, 1),
      estimatedSeconds: num(v.estimatedSeconds, a.seconds),
      difficulty: (atom && atom.difficulty >= 7) ? "hard" : ((atom && atom.difficulty <= 2) ? "easy" : "normal"),
      topic: atom ? str(atom.categoryId) : "",
      tags: atom ? uniq(arr(atom.grammarTags).concat(arr(atom.vocabularyTags))).slice(0, 8) : [],
      settings: {},
      createdBy: "speak",
      /* どの教材から来たかを残す。学習履歴と復習がここを辿る。 */
      speak: {
        atomId: atom ? str(atom.id) : str(v.contentAtomId),
        variantId: str(v.id),
        familyId: str(v.familyId),
        activityType: str(v.activityType),
        level: str(atom && atom.level) || o.level || "",
        categoryId: str(atom && atom.categoryId) || ""
      }
    };
    /* 読み上げる原稿。音声ファイルではなく原稿を持つ（既存の tts.js がここを読む）。 */
    if (a.needsAudio) {
      q.script = str(c.script || (atom && atom.english) || "");
      if (v.ttsConfig && v.ttsConfig.voiceId) q.voice = str(v.ttsConfig.voiceId);
      var sp = (v.ttsConfig && v.ttsConfig.speed) || o.speed || lv.speed;
      if (sp && sp !== 1) q.speed = sp;
      q.settings.replayLimit = isNum(o.replayLimit) ? o.replayLimit
        : (v.activityType === "listening_choice" || v.activityType === "listening_comprehension" ? 3 : 0);
    }

    switch (v.activityType) {
      case "listening_choice":
      case "listening_comprehension":
      case "dialogue_response":
      case "best_expression":
        q.choices = arr(c.choices).map(function (x, i) {
          return { id: str(x.id) || ("c" + (i + 1)), label: String.fromCharCode(65 + i),
                   text: str(x.text),
                   isCorrect: str(x.id) === str(ans) || str(x.text) === str(ans) };
        });
        q.settings.shuffleOptions = true;
        break;
      case "dictation":
        q.correctAnswer = str(ans);
        q.acceptedAnswers = arr(c.acceptedAnswers).map(str);
        break;
      case "audio_fill_blank":
      case "text_fill_blank":
        q.prompt = str(c.text) || q.prompt;
        /* 日本語は本文の上に出す。無いと答えが 1 つに決まらないことがある。 */
        if (str(c.japanese)) q.context = str(c.japanese);
        q.blanks = arr(c.blanks).map(function (b, i) {
          return { id: str(b.id) || ("b" + (i + 1)), label: String(i + 1),
                   answer: str(b.answer), acceptedAnswers: arr(b.acceptedAnswers).map(str) };
        });
        q.settings.blankMode = str(c.blankMode) === "select" ? "select" : "input";
        if (q.settings.blankMode === "select")
          q.blanks.forEach(function (b, i) {
            var src = arr(c.blanks)[i] || {};
            b.options = arr(src.options).map(function (t, k) { return { id: "o" + (k + 1), text: str(t) }; });
          });
        break;
      case "sentence_reorder":
        q.orderItems = arr(c.items).map(function (t, i) { return { id: "i" + (i + 1), text: str(t), order: i + 1 }; });
        q.correctOrder = q.orderItems.map(function (x) { return x.id; });
        break;
      case "translation_to_english":
        q.prompt = str(c.japanese);
        q.correctAnswer = str(ans);
        q.acceptedAnswers = uniq(arr(c.acceptedAnswers).map(str));
        q.settings.caseSensitive = false;
        q.settings.ignorePunctuation = true;
        break;
      case "translation_to_japanese":
        q.prompt = str(c.english);
        q.correctAnswer = str(ans);
        q.acceptedAnswers = uniq(arr(c.acceptedAnswers).map(str));
        break;
      case "error_correction":
        q.prompt = str(c.text);
        q.errorSpans = arr(c.errors).map(function (e, i) {
          return { id: "e" + (i + 1), wrong: str(e.wrong), correct: str(e.correct),
                   acceptedAnswers: arr(e.acceptedAnswers).map(str) };
        });
        break;
      case "flashcard":
        q.card = { front: str(c.front), back: str(c.back) };
        q.prompt = str(c.front);
        break;
      case "speaking_repeat":
      case "pronunciation_practice":
      case "shadowing":
        q.prompt = str(c.instruction) || str(v.prompt) || v.instructionJa;
        q.correctAnswer = str(c.target);
        q.script = str(c.target);
        break;
      default: return null;
    }
    /* やることの案内と問題文が同じ文になることがある（リスニングなど）。
       そのまま出すと同じ文が 2 行並ぶ。**落とすのは案内のほう**。
       問題文を空にすると「問題文がありません」で出題できなくなる。 */
    if (str(q.prompt).trim() && str(q.prompt).trim() === str(q.instruction).trim()) q.instruction = "";
    return q;
  }

  /* ══════════════════════════════════════════════════════════════════
     7) 重複の検出（§20）
     ・完全一致 … 英文も日本語訳も同じ
     ・正規化一致 … 記号や短縮形をそろえると同じ
     ・意味が近い … 語の重なりが大きい。**消さずに family へまとめる**
     ══════════════════════════════════════════════════════════════════ */
  function findDuplicates(atoms, o) {
    o = o || {};
    var nearAt = isNum(o.nearThreshold) ? o.nearThreshold : 0.8;
    var exactMap = Object.create(null), normMap = Object.create(null);
    var exact = [], normalized = [], near = [];
    var list = arr(atoms);

    /* 完全一致で数えたものは、正規化一致でもう一度数えない
       （同じ 1 件が 2 か所に出ると、消す件数を取り違える）。 */
    var countedExact = Object.create(null);
    list.forEach(function (a) {
      var raw = str(a.english) + "|" + str(a.japanese || "");
      if (exactMap[raw]) {
        exact.push({ id: str(a.id), sameAs: exactMap[raw], english: str(a.english) });
        countedExact[str(a.id)] = 1;
      } else exactMap[raw] = str(a.id);

      var fp = fingerprint(a);
      if (normMap[fp]) {
        if (!countedExact[str(a.id)])
          normalized.push({ id: str(a.id), sameAs: normMap[fp], english: str(a.english) });
      } else normMap[fp] = str(a.id);
    });

    /* 語の重なりは総当たりになるので、同じカテゴリー・同じレベルの中だけで見る
       （全件どうしを比べると件数の 2 乗になり、数万件で止まる）。 */
    var buckets = Object.create(null);
    list.forEach(function (a) {
      var k = str(a.categoryId) + "|" + str(a.level);
      (buckets[k] || (buckets[k] = [])).push(a);
    });
    Object.keys(buckets).forEach(function (k) {
      var b = buckets[k];
      for (var i = 0; i < b.length; i++) {
        for (var j = i + 1; j < b.length; j++) {
          if (fingerprint(b[i]) === fingerprint(b[j])) continue;
          var sim = overlap(b[i].english, b[j].english);
          if (sim >= nearAt) {
            near.push({ id: str(b[j].id), similarTo: str(b[i].id), similarity: Math.round(sim * 100) / 100,
                        sameFamily: str(b[i].familyId) === str(b[j].familyId),
                        english: [str(b[i].english), str(b[j].english)] });
          }
        }
      }
    });
    return {
      exact: exact, normalized: normalized, near: near,
      /* 消すべきもの＝完全一致と正規化一致だけ。意味が近いだけのものは消さない。 */
      shouldRemove: exact.concat(normalized).map(function (x) { return x.id; }),
      /* family をまとめ直したほうがよいもの */
      shouldMergeFamily: near.filter(function (x) { return !x.sameFamily; })
    };
  }

  VQ2.speakModel = {
    MODEL_VERSION: MODEL_VERSION,
    LEVELS: LEVELS, level: level, levelLabel: levelLabel, levelOrder: levelOrder, levelNear: levelNear,
    CONTENT_TYPES: CONTENT_TYPES,
    ACTIVITIES: ACTIVITIES, ACTIVITY_IDS: ACTIVITY_IDS,
    activity: activity, activityLabel: activityLabel,
    activityUsable: activityUsable, usableActivities: usableActivities,
    activityIsBeta: activityIsBeta,
    normText: normText, fingerprint: fingerprint, overlap: overlap, wordsOf: wordsOf,
    normalizeAtom: normalizeAtom, validateAtom: validateAtom,
    normalizeVariant: normalizeVariant, validateVariant: validateVariant,
    defaultInstruction: defaultInstruction,
    toQuestion: toQuestion,
    findDuplicates: findDuplicates
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
