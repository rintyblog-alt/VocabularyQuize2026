/* ══════════════════════════════════════════════════════════════════════
   Question Type Registry（V3 §5）
   ・すべての問題形式をここで一元管理する。
     形式名・説明・アイコン・対応科目・対応モード・AI 生成可否・状態は
     ここが唯一の出どころ。画面側へ書き写さないこと。
   ・「形式」を 100 個の実装にしない。3 層に分ける。
       第1層 Engine   … 1 問をどう見せて、どう答えるか（18 種）
       第2層 Mode     … どのルールで解くか
       第3層 Source   … 何を根拠に作るか
     形式は「Engine ＋ 既定値」の組で表す。だから増やしても実装は増えない。
   ・既存の 13 形式（multiple_choice_single など）は **ID をそのまま** 正式 ID に
     採用している。よって保存済みデータの移行は不要で、旧 grading.js の
     switch もそのまま通る。
   ・status が "available" でないものは、作成 UI で「準備中」と出し、
     選んでも壊れた画面へ行かせない（§4）。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});

  var REGISTRY_VERSION = 1;

  /* ══════════════════════════════════════════════════════════════════
     第1層 — Question Engine
     1 問の表示と回答の方法。ここだけが実装を持つ。
     ══════════════════════════════════════════════════════════════════ */
  var ENGINES = [
    { id: "single_choice",   label: "単一選択",       answerShape: "choiceId",   partial: false, deterministic: true  },
    { id: "multi_choice",    label: "複数選択",       answerShape: "choiceIds",  partial: true,  deterministic: true  },
    { id: "true_false",      label: "正誤",           answerShape: "choiceId",   partial: false, deterministic: true  },
    { id: "text_input",      label: "文字入力",       answerShape: "text",       partial: false, deterministic: true  },
    { id: "numeric_input",   label: "数値入力",       answerShape: "text",       partial: false, deterministic: true  },
    { id: "fill_blank",      label: "穴埋め",         answerShape: "blanks",     partial: true,  deterministic: true  },
    { id: "reorder",         label: "並べ替え",       answerShape: "order",      partial: true,  deterministic: true  },
    { id: "matching",        label: "組み合わせ",     answerShape: "pairs",      partial: true,  deterministic: true  },
    { id: "classification",  label: "分類",           answerShape: "groups",     partial: true,  deterministic: true  },
    { id: "table_fill",      label: "表の完成",       answerShape: "cells",      partial: true,  deterministic: true  },
    { id: "image_choice",    label: "画像選択",       answerShape: "choiceId",   partial: false, deterministic: true  },
    { id: "image_point",     label: "画像内の位置",   answerShape: "points",     partial: true,  deterministic: true  },
    { id: "image_label",     label: "ラベル配置",     answerShape: "labels",     partial: true,  deterministic: true  },
    { id: "chart_read",      label: "図表の読み取り", answerShape: "auto",       partial: false, deterministic: true  },
    { id: "audio_choice",    label: "音声選択",       answerShape: "choiceId",   partial: false, deterministic: true  },
    { id: "dictation",       label: "書き取り",       answerShape: "text",       partial: true,  deterministic: true  },
    { id: "error_correction",label: "誤り訂正",       answerShape: "correction", partial: true,  deterministic: true  },
    { id: "free_text",       label: "記述",           answerShape: "text",       partial: true,  deterministic: false },
    { id: "flashcard",       label: "カード",         answerShape: "selfMark",   partial: false, deterministic: true  },
    { id: "composite",       label: "複合大問",       answerShape: "children",   partial: true,  deterministic: true  }
  ];
  var ENGINE_BY_ID = Object.create(null);
  ENGINES.forEach(function (e) { ENGINE_BY_ID[e.id] = e; });

  /* ══════════════════════════════════════════════════════════════════
     第2層 — Quiz Mode
     同じ問題を、別のルールで解けるようにする。形式とは独立。
     ══════════════════════════════════════════════════════════════════ */
  var MODES = [
    { id: "normal",         label: "通常",            desc: "ふつうに解いて、最後に採点します。",                     feedback: "end",   revealAnswer: "end",  server: false, ready: true },
    { id: "study",          label: "学習",            desc: "1 問ごとに正誤と解説を見ながら進みます。",               feedback: "each",  revealAnswer: "each", server: false, ready: true },
    { id: "practice",       label: "練習",            desc: "本番に近い形で解き、終わってから確認します。",           feedback: "end",   revealAnswer: "end",  server: false, ready: true },
    { id: "mock",           label: "試験",            desc: "解いている間は正誤も解説も出しません。採点はサーバで行います。", feedback: "none", revealAnswer: "after-submit", server: true, ready: true },
    { id: "pre_exam",       label: "試験前",          desc: "範囲・苦手・前回の誤答・重要問題をまとめて出します。",   feedback: "each",  revealAnswer: "each", server: false, ready: true },
    { id: "mastery",        label: "完全習得",        desc: "すべての問題を決めた回数だけ正解するまで続けます。",     feedback: "each",  revealAnswer: "each", server: false, ready: true },
    { id: "adaptive",       label: "適応",            desc: "正答率と解く速さを見て、出す問題の難しさを変えます。",   feedback: "each",  revealAnswer: "each", server: false, ready: true },
    { id: "weakness_focus", label: "苦手集中",        desc: "間違えやすい単元へ出題を寄せます。",                     feedback: "each",  revealAnswer: "each", server: false, ready: true },
    { id: "time_attack",    label: "タイムアタック",  desc: "制限時間の中でどこまで取れるかを競います。",             feedback: "each",  revealAnswer: "end",  server: false, ready: true },
    { id: "survival",       label: "サバイバル",      desc: "間違えられる回数に上限があります。",                     feedback: "each",  revealAnswer: "each", server: false, ready: true },
    { id: "combo",          label: "コンボ",          desc: "続けて正解するほど得点の倍率が上がります。",             feedback: "each",  revealAnswer: "each", server: false, ready: true },
    { id: "daily_challenge",label: "日替わり",        desc: "その日だけの問題に挑みます。",                           feedback: "end",   revealAnswer: "end",  server: false, ready: false },
    { id: "boss_battle",    label: "ボス戦",          desc: "難しい問題だけを集めた一本勝負です。",                   feedback: "each",  revealAnswer: "each", server: false, ready: false },
    { id: "tower",          label: "タワー",          desc: "階層ごとに難しくなります。",                             feedback: "each",  revealAnswer: "each", server: false, ready: false },
    { id: "multiplayer",    label: "対戦",            desc: "ほかの人と同じ問題で競います。",                         feedback: "none",  revealAnswer: "after-submit", server: true, ready: false },
    { id: "cooperative",    label: "協力",            desc: "ほかの人と分担して解きます。",                           feedback: "none",  revealAnswer: "after-submit", server: true, ready: false }
  ];
  var MODE_BY_ID = Object.create(null);
  MODES.forEach(function (m) { MODE_BY_ID[m.id] = m; });
  var READY_MODE_IDS = MODES.filter(function (m) { return m.ready; }).map(function (m) { return m.id; });

  /* ══════════════════════════════════════════════════════════════════
     第3層 — Generation Source
     何を根拠に問題を作るか。
     ══════════════════════════════════════════════════════════════════ */
  var SOURCES = [
    { id: "manual",            label: "手で作る",           desc: "自分で 1 問ずつ書きます。",                       needsUpload: false, sourceOnly: false, ready: true },
    { id: "uploaded_pdf",      label: "PDF から",           desc: "取り込んだ PDF の中身だけから作ります。",         needsUpload: true,  sourceOnly: true,  ready: true },
    { id: "uploaded_image",    label: "画像から",           desc: "写真やスクリーンショットから読み取って作ります。", needsUpload: true,  sourceOnly: true,  ready: true },
    { id: "textbook",          label: "教科書から",         desc: "教科書の範囲を指定して作ります。",               needsUpload: true,  sourceOnly: true,  ready: true },
    { id: "worksheet",         label: "プリントから",       desc: "配られたプリントから作ります。",                 needsUpload: true,  sourceOnly: true,  ready: true },
    { id: "pasted_text",       label: "貼り付けた文から",   desc: "本文を貼り付けて、そこから作ります。",           needsUpload: false, sourceOnly: true,  ready: true },
    { id: "ai_general",        label: "AI におまかせ",      desc: "単元と難しさだけ決めて、AI に作ってもらいます。", needsUpload: false, sourceOnly: false, ready: true },
    { id: "source_limited",    label: "資料の中だけ",       desc: "取り込んだ資料に書いてあることだけで作ります。",   needsUpload: true,  sourceOnly: true,  ready: true },
    { id: "previous_mistakes", label: "前に間違えた問題",   desc: "誤答の履歴から作り直します。",                   needsUpload: false, sourceOnly: false, ready: true },
    { id: "favorites",         label: "お気に入り",         desc: "印を付けた問題から作ります。",                   needsUpload: false, sourceOnly: false, ready: true },
    { id: "preset_template",   label: "ひな形から",         desc: "用意された形をもとに作ります。",                 needsUpload: false, sourceOnly: false, ready: true },
    { id: "class_material",    label: "授業の資料から",     desc: "共有された授業の資料から作ります。",             needsUpload: true,  sourceOnly: true,  ready: false }
  ];
  var SOURCE_BY_ID = Object.create(null);
  SOURCES.forEach(function (s) { SOURCE_BY_ID[s.id] = s; });

  /* ══════════════════════════════════════════════════════════════════
     分類（作成 UI の並び順もここが決める）
     ══════════════════════════════════════════════════════════════════ */
  var CATEGORIES = [
    { id: "choice",    label: "選択式",         icon: "list",   desc: "用意した中から選んで答えます。" },
    { id: "text",      label: "文字入力式",     icon: "pencil", desc: "答えを打ち込んで答えます。" },
    { id: "blank",     label: "穴埋め式",       icon: "blank",  desc: "文の空いたところを埋めます。" },
    { id: "reorder",   label: "並べ替え・操作", icon: "sort",   desc: "正しい順番に並べ替えます。" },
    { id: "match",     label: "マッチング・分類", icon: "link", desc: "対応づけたり、仲間に分けたりします。" },
    { id: "visual",    label: "画像・図表",     icon: "image",  desc: "図や写真、グラフを読み取ります。" },
    { id: "audio",     label: "音声・リスニング", icon: "audio", desc: "音を聞いて答えます。" },
    { id: "write",     label: "記述・思考",     icon: "book",   desc: "自分の言葉で書いて答えます。" },
    { id: "memorize",  label: "暗記・復習",     icon: "layers", desc: "覚えるための繰り返しに使います。" },
    { id: "composite", label: "複合大問",       icon: "grid",   desc: "1 つの資料に小問をぶら下げます。" }
  ];
  var CATEGORY_BY_ID = Object.create(null);
  CATEGORIES.forEach(function (c) { CATEGORY_BY_ID[c.id] = c; });

  var SUBJECTS = [
    { id: "japanese", label: "国語" }, { id: "english", label: "英語" },
    { id: "math", label: "数学" },     { id: "science", label: "理科" },
    { id: "social", label: "社会" },   { id: "info", label: "情報" },
    { id: "other", label: "その他" }
  ];
  var ALL_SUBJECTS = SUBJECTS.map(function (s) { return s.id; });

  var STATUSES = ["available", "beta", "coming_soon", "deprecated"];

  /* ══════════════════════════════════════════════════════════════════
     形式の定義表
     ・def() が既定値を埋めるので、表には「違うところ」だけ書く。
     ・legacy: true の ID は V2 からの引き継ぎ。ID を変えてはいけない。
     ══════════════════════════════════════════════════════════════════ */
  var DEFS = [];

  function def(o) {
    var eng = ENGINE_BY_ID[o.engine];
    if (!eng) throw new Error("未知の engine: " + o.engine + "（" + o.id + "）");
    var d = {
      id: o.id,
      name: o.name,
      shortName: o.shortName || o.name,
      description: o.description || "",
      category: o.category,
      altCategories: o.altCategories || [],
      engine: o.engine,
      icon: o.icon || (CATEGORY_BY_ID[o.category] ? CATEGORY_BY_ID[o.category].icon : "list"),
      status: o.status || "available",
      /* 対応科目。空配列＝すべての科目で使える。 */
      supportedSubjects: o.supportedSubjects || ALL_SUBJECTS.slice(),
      supportedModes: o.supportedModes || READY_MODE_IDS.slice(),
      supportsAI: o.supportsAI !== false,
      supportsManualCreation: o.supportsManualCreation !== false,
      supportsMedia: !!o.supportsMedia,
      supportsPartialCredit: o.supportsPartialCredit !== undefined ? o.supportsPartialCredit : eng.partial,
      supportsExplanation: o.supportsExplanation !== false,
      supportsHints: o.supportsHints !== false,
      supportsTimer: o.supportsTimer !== false,
      supportsOffline: o.supportsOffline !== undefined ? o.supportsOffline : !o.requiresNetwork,
      supportsConfidence: !!o.supportsConfidence,
      /* この形式を選んだときに問題へ焼き付ける既定値。
         「形式が増えても実装が増えない」のは、違いがここに集まっているから。 */
      defaults: o.defaults || {},
      /* 決定論採点で使う旧 type（grading.js が知っている名前）。
         null なら evaluator.js の新しい採点系で採点する。 */
      legacyType: o.legacyType || null,
      legacy: !!o.legacy,
      /* この形式が実際には「解き方（モード）」であるとき、対応するモード ID。 */
      mode: o.mode || null,
      /* 作成 UI の並び順（同じ分類の中で） */
      order: DEFS.length,
      version: o.version || 1,
      /* 何を用意すれば作れるか。編集フォームの必須項目の出どころ。 */
      requires: o.requires || [],
      /* 例示。カードのプレビューに出す。 */
      example: o.example || ""
    };
    DEFS.push(d);
    return d;
  }

  /* ── A. 選択式 ────────────────────────────────────────────────── */
  def({ id: "choice_2", name: "2択", category: "choice", engine: "single_choice",
        description: "2 つの中から 1 つ選びます。素早く確認したいときに向きます。",
        legacyType: "multiple_choice_single", defaults: { choiceCount: 2, shuffleOptions: true },
        requires: ["choices2"], example: "次のうち正しいのはどちらですか。" });
  def({ id: "choice_3", name: "3択", category: "choice", engine: "single_choice",
        description: "3 つの中から 1 つ選びます。",
        legacyType: "multiple_choice_single", defaults: { choiceCount: 3, shuffleOptions: true },
        requires: ["choices2"] });
  def({ id: "multiple_choice_single", name: "4択", shortName: "4択", category: "choice", engine: "single_choice",
        description: "4 つの中から 1 つ選びます。いちばんよく使う形式です。",
        legacy: true, legacyType: "multiple_choice_single",
        defaults: { choiceCount: 4, shuffleOptions: true }, requires: ["choices2"],
        example: "next の意味として最も適切なものを選びなさい。" });
  def({ id: "choice_5", name: "5択", category: "choice", engine: "single_choice",
        description: "5 つの中から 1 つ選びます。共通テスト形式で使います。",
        legacyType: "multiple_choice_single", defaults: { choiceCount: 5, shuffleOptions: true },
        requires: ["choices2"] });
  def({ id: "choice_many", name: "多肢選択", category: "choice", engine: "single_choice",
        description: "6 つ以上の中から 1 つ選びます。語群から選ぶときに使います。",
        legacyType: "multiple_choice_single", defaults: { choiceCount: 8, shuffleOptions: true },
        requires: ["choices2"] });
  def({ id: "true_false", name: "○×", category: "choice", engine: "true_false",
        description: "正しいか誤っているかを答えます。",
        legacy: true, legacyType: "true_false",
        defaults: { choiceCount: 2, shuffleOptions: false }, requires: ["choices2"],
        example: "鎌倉幕府は 1192 年に成立した。" });
  def({ id: "multiple_choice_multiple", name: "複数選択", category: "choice", engine: "multi_choice",
        description: "当てはまるものをすべて選びます。選びすぎると減ります。",
        legacy: true, legacyType: "multiple_choice_multiple",
        defaults: { shuffleOptions: true, partialCredit: true }, requires: ["choices2", "multiCorrect"] });
  def({ id: "choice_incorrect", name: "誤っているものを選択", shortName: "誤り選択", category: "choice", engine: "single_choice",
        description: "1 つだけ誤っているものを選びます。指示文が反転するので取り違えに注意します。",
        legacyType: "multiple_choice_single",
        defaults: { choiceCount: 4, shuffleOptions: true, invertedPrompt: true }, requires: ["choices2"] });
  def({ id: "choice_all_correct", name: "正しいものをすべて選択", shortName: "全選択", category: "choice", engine: "multi_choice",
        description: "正しいものを漏れなく選びます。部分点が付きます。",
        legacyType: "multiple_choice_multiple",
        defaults: { shuffleOptions: true, partialCredit: true }, requires: ["choices2", "multiCorrect"] });
  def({ id: "choice_none_option", name: "該当なしを含む選択", shortName: "該当なし付き", category: "choice", engine: "single_choice",
        description: "「該当なし」を選択肢に含めます。当てずっぽうが効きにくくなります。",
        legacyType: "multiple_choice_single",
        defaults: { choiceCount: 4, shuffleOptions: true, appendNoneOption: true }, requires: ["choices2"] });
  def({ id: "choice_best", name: "最適解選択", category: "choice", engine: "single_choice",
        description: "どれも間違いではない中から、最も適切なものを選びます。",
        legacyType: "multiple_choice_single",
        defaults: { choiceCount: 4, shuffleOptions: true }, requires: ["choices2"] });
  def({ id: "choice_sentence", name: "文章選択", category: "choice", engine: "single_choice",
        description: "長めの文を選択肢にします。読解の確認に使います。",
        legacyType: "multiple_choice_single",
        defaults: { choiceCount: 4, shuffleOptions: true, longChoices: true }, requires: ["choices2"] });
  def({ id: "image_choice", name: "画像選択", category: "choice", altCategories: ["visual"], engine: "image_choice",
        description: "画像そのものを選択肢にします。図やグラフの見分けに使います。",
        icon: "image", supportsMedia: true, defaults: { choiceCount: 4, shuffleOptions: true },
        requires: ["choiceImages"] });
  def({ id: "audio_choice", name: "リスニング選択", shortName: "音声選択", category: "audio", altCategories: ["choice"],
        engine: "audio_choice", icon: "audio",
        description: "音声を聞いてから選びます。再生回数を制限できます。",
        supportsMedia: true, supportsOffline: false,
        defaults: { choiceCount: 4, shuffleOptions: true, replayLimit: 2 },
        requires: ["audio", "choices2"] });
  def({ id: "choice_confidence", name: "確信度付き選択", shortName: "確信度付き", category: "choice", engine: "single_choice",
        description: "答えと一緒に「どのくらい自信があるか」も記録します。結果画面で自信と正答率のずれが見られます。",
        legacyType: "multiple_choice_single", supportsConfidence: true,
        defaults: { choiceCount: 4, shuffleOptions: true, confidenceEnabled: true }, requires: ["choices2"] });
  def({ id: "choice_combination", name: "組み合わせ選択", category: "choice", engine: "single_choice",
        description: "「ア＝正 イ＝誤」のような組み合わせを選択肢にします。",
        legacyType: "multiple_choice_single",
        defaults: { choiceCount: 4, shuffleOptions: false }, requires: ["choices2"] });
  def({ id: "choice_two_stage", name: "理由付き二段階選択", shortName: "二段階選択", category: "choice", engine: "composite",
        description: "答えを選んだあと、その理由も選びます。複合大問として組み立てます。",
        status: "beta", defaults: { childTypes: ["multiple_choice_single", "multiple_choice_single"] },
        requires: ["children"] });
  def({ id: "choice_conditional", name: "条件付き選択", category: "choice", engine: "single_choice",
        description: "前の答えによって次に出る選択肢が変わります。",
        status: "coming_soon", legacyType: "multiple_choice_single" });

  /* ── B. 文字入力式 ─────────────────────────────────────────────── */
  def({ id: "word_input", name: "単語入力", category: "text", engine: "text_input",
        description: "語句をそのまま打ち込みます。表記のゆれは別解で受け付けられます。",
        legacyType: "short_answer",
        defaults: { trimWhitespace: true, caseSensitive: false, fullwidthToHalfwidth: true },
        requires: ["answerText"], example: "645 年に始まった政治改革を何といいますか。" });
  def({ id: "spelling", name: "英単語スペリング", shortName: "スペリング", category: "text", engine: "text_input",
        description: "英単語のつづりを 1 文字ずつ正確に書きます。大文字小文字は既定で無視します。",
        legacyType: "short_answer",
        defaults: { trimWhitespace: true, caseSensitive: false, ignoreSpace: true, showWordCount: true },
        supportedSubjects: ["english"], requires: ["answerText"] });
  def({ id: "translate_ja", name: "日本語訳入力", shortName: "和訳入力", category: "text", engine: "text_input",
        description: "英語を日本語にして打ち込みます。言い換えは別解で受け付けます。",
        legacyType: "short_answer", supportedSubjects: ["english"],
        defaults: { trimWhitespace: true, allowPartialMatch: true }, requires: ["answerText"] });
  def({ id: "translate_en", name: "英訳入力", category: "text", engine: "text_input",
        description: "日本語を英語にして打ち込みます。",
        legacyType: "short_answer", supportedSubjects: ["english"],
        defaults: { trimWhitespace: true, caseSensitive: false }, requires: ["answerText"] });
  def({ id: "kanji_input", name: "漢字入力", category: "text", engine: "text_input",
        description: "漢字で書きます。ひらがなの答えは正解にしません。",
        legacyType: "short_answer", supportedSubjects: ["japanese"],
        defaults: { trimWhitespace: true, requireKanji: true }, requires: ["answerText"] });
  def({ id: "reading_input", name: "読み仮名入力", shortName: "読み入力", category: "text", engine: "text_input",
        description: "読みをかなで書きます。ひらがなとカタカナの違いは無視します。",
        legacyType: "short_answer", supportedSubjects: ["japanese"],
        defaults: { trimWhitespace: true, kanaInsensitive: true }, requires: ["answerText"] });
  def({ id: "short_answer", name: "短文入力", shortName: "短答", category: "text", engine: "text_input",
        description: "ひとことで答えます。コードで採点します。",
        legacy: true, legacyType: "short_answer",
        defaults: { trimWhitespace: true, caseSensitive: false }, requires: ["answerText"] });
  def({ id: "multi_word_input", name: "複数語句入力", shortName: "複数語句", category: "text", engine: "fill_blank",
        description: "いくつかの語句をまとめて答えます。1 つずつ部分点が付きます。",
        legacyType: "fill_blank", defaults: { trimWhitespace: true }, requires: ["blanks"] });
  def({ id: "keyword_input", name: "キーワード入力", shortName: "キーワード", category: "text", engine: "text_input",
        description: "決めた語が含まれていれば正解にします。言い回しは問いません。",
        defaults: { matchMode: "keyword", trimWhitespace: true, partialCredit: true },
        supportsPartialCredit: true, requires: ["keywords"] });
  def({ id: "exact_input", name: "完全一致入力", shortName: "完全一致", category: "text", engine: "text_input",
        description: "1 文字も違わずに書きます。空白も大文字小文字も見ます。",
        defaults: { matchMode: "exact", caseSensitive: true, trimWhitespace: false }, requires: ["answerText"] });
  def({ id: "partial_input", name: "部分一致入力", shortName: "部分一致", category: "text", engine: "text_input",
        description: "答えの一部が入っていれば正解にします。",
        defaults: { matchMode: "partial", trimWhitespace: true }, requires: ["answerText"] });
  def({ id: "caseless_input", name: "大文字小文字無視入力", shortName: "大小無視", category: "text", engine: "text_input",
        description: "大文字と小文字の違いを見ません。",
        defaults: { matchMode: "exact", caseSensitive: false, trimWhitespace: true }, requires: ["answerText"] });
  def({ id: "fuzzy_input", name: "表記揺れ許容入力", shortName: "揺れ許容", category: "text", engine: "text_input",
        description: "送り仮名・全角半角・中黒などの違いを吸収します。",
        defaults: { matchMode: "fuzzy", trimWhitespace: true, ignorePunctuation: true, kanaInsensitive: true },
        requires: ["answerText"] });
  def({ id: "hint_initial_input", name: "頭文字ヒント付き入力", shortName: "頭文字ヒント", category: "text", engine: "text_input",
        description: "最初の 1 文字を見せます。思い出せないときの助けになります。",
        defaults: { hintKind: "initial", trimWhitespace: true }, requires: ["answerText"] });
  def({ id: "hint_length_input", name: "文字数ヒント付き入力", shortName: "文字数ヒント", category: "text", engine: "text_input",
        description: "答えが何文字かを見せます。",
        defaults: { hintKind: "length", showWordCount: true, trimWhitespace: true }, requires: ["answerText"] });
  def({ id: "hint_progressive_input", name: "一文字ずつヒント表示", shortName: "順次ヒント", category: "text", engine: "text_input",
        description: "押すたびに 1 文字ずつ開きます。開いた分だけ得点が下がります。",
        defaults: { hintKind: "progressive", hintPenalty: 0.2, trimWhitespace: true }, requires: ["answerText"] });
  def({ id: "timed_input", name: "制限時間付き入力", shortName: "時間制限入力", category: "text", engine: "text_input",
        description: "1 問ごとに時間の上限があります。",
        defaults: { timeLimit: 30, trimWhitespace: true }, requires: ["answerText"] });
  def({ id: "code_input", name: "コード入力", category: "text", engine: "text_input",
        description: "プログラムを書きます。空白と大文字小文字をそのまま見ます。実行はしません。",
        status: "beta", supportedSubjects: ["info", "math"],
        defaults: { matchMode: "exact", caseSensitive: true, monospace: true, trimWhitespace: true },
        requires: ["answerText"] });

  /* ── C. 穴埋め式 ──────────────────────────────────────────────── */
  def({ id: "fill_blank", name: "単一穴埋め", shortName: "穴埋め", category: "blank", engine: "fill_blank",
        description: "文の空いたところを 1 つ埋めます。",
        legacy: true, legacyType: "fill_blank", defaults: { blankCount: 1 }, requires: ["blanks"],
        example: "1867 年、徳川慶喜は【　】を行った。" });
  def({ id: "fill_blank_multi", name: "複数穴埋め", category: "blank", engine: "fill_blank",
        description: "1 つの文に空欄をいくつも作ります。空欄ごとに部分点が付きます。",
        legacyType: "fill_blank", defaults: { blankCount: 3 }, requires: ["blanks"] });
  def({ id: "fill_blank_choice", name: "選択式穴埋め", category: "blank", engine: "fill_blank",
        description: "空欄ごとに選択肢から選びます。",
        defaults: { blankMode: "select" }, requires: ["blanks", "blankOptions"] });
  def({ id: "fill_blank_input", name: "入力式穴埋め", category: "blank", engine: "fill_blank",
        description: "空欄へ直接打ち込みます。",
        legacyType: "fill_blank", defaults: { blankMode: "input" }, requires: ["blanks"] });
  def({ id: "fill_blank_drag", name: "ドラッグ式穴埋め", shortName: "ドラッグ穴埋め", category: "blank", engine: "fill_blank",
        description: "下の語群から空欄へ運びます。指でもキーボードでも動かせます。",
        defaults: { blankMode: "drag", shuffleOptions: true }, requires: ["blanks", "wordBank"] });
  def({ id: "fill_blank_passage", name: "長文穴埋め", category: "blank", engine: "fill_blank",
        description: "長い文章の中に空欄を作ります。本文は上に固定して読めます。",
        defaults: { blankMode: "input", hasContext: true }, requires: ["context", "blanks"] });
  def({ id: "fill_blank_dialog", name: "会話文穴埋め", category: "blank", engine: "fill_blank",
        description: "会話のやり取りの中を埋めます。",
        defaults: { blankMode: "input", hasContext: true, contextKind: "dialog" }, requires: ["context", "blanks"] });
  def({ id: "fill_blank_formula", name: "数式穴埋め", category: "blank", engine: "fill_blank",
        description: "式の一部を埋めます。書き方の違いは別解で受け付けます。",
        status: "beta", supportedSubjects: ["math", "science"],
        defaults: { blankMode: "input", formula: true }, requires: ["blanks"] });
  def({ id: "table_fill", name: "表完成", category: "blank", altCategories: ["visual"], engine: "table_fill",
        description: "表の空いたますを埋めます。ますごとに部分点が付きます。",
        icon: "grid", defaults: { blankMode: "input" }, requires: ["table"] });
  def({ id: "fill_blank_source", name: "資料穴埋め", category: "blank", engine: "fill_blank",
        description: "資料の一部を空欄にします。根拠のページが残ります。",
        defaults: { blankMode: "input", hasContext: true, requireSource: true }, requires: ["context", "blanks"] });

  /* ── D. 並べ替え・操作式 ───────────────────────────────────────── */
  def({ id: "reorder_words", name: "単語並べ替え", category: "reorder", engine: "reorder",
        description: "ばらばらの語を正しい順に並べます。",
        legacyType: "ordering", defaults: { itemKind: "word" }, requires: ["orderItems"] });
  def({ id: "reorder_english", name: "英作文並べ替え", shortName: "英作並べ替え", category: "reorder", engine: "reorder",
        description: "語句を並べて英文を作ります。",
        legacyType: "ordering", supportedSubjects: ["english"],
        defaults: { itemKind: "word" }, requires: ["orderItems"] });
  def({ id: "ordering", name: "文章並べ替え", shortName: "並べ替え", category: "reorder", engine: "reorder",
        description: "文を正しい順に並べます。位置が合った数だけ点が入ります。",
        legacy: true, legacyType: "ordering", defaults: { itemKind: "sentence" }, requires: ["orderItems"] });
  def({ id: "reorder_chronology", name: "年代順並べ替え", shortName: "年代順", category: "reorder", engine: "reorder",
        description: "出来事を古い順に並べます。",
        legacyType: "ordering", supportedSubjects: ["social", "science"],
        defaults: { itemKind: "event", orderLabel: "古い順" }, requires: ["orderItems"] });
  def({ id: "reorder_events", name: "出来事順並べ替え", shortName: "出来事順", category: "reorder", engine: "reorder",
        description: "物語や事件の順に並べます。",
        legacyType: "ordering", defaults: { itemKind: "event" }, requires: ["orderItems"] });
  def({ id: "reorder_steps", name: "計算手順並べ替え", shortName: "計算手順", category: "reorder", engine: "reorder",
        description: "解く手順を正しい順に並べます。",
        legacyType: "ordering", supportedSubjects: ["math"],
        defaults: { itemKind: "step" }, requires: ["orderItems"] });
  def({ id: "reorder_experiment", name: "実験手順並べ替え", shortName: "実験手順", category: "reorder", engine: "reorder",
        description: "実験の順序を並べます。",
        legacyType: "ordering", supportedSubjects: ["science"],
        defaults: { itemKind: "step" }, requires: ["orderItems"] });
  def({ id: "reorder_dialog", name: "会話順並べ替え", shortName: "会話順", category: "reorder", engine: "reorder",
        description: "会話のやり取りを順に並べます。",
        legacyType: "ordering", defaults: { itemKind: "line" }, requires: ["orderItems"] });
  def({ id: "reorder_flow", name: "フローチャート並べ替え", shortName: "流れ図順", category: "reorder", engine: "reorder",
        description: "処理の流れを順に並べます。",
        legacyType: "ordering", supportedSubjects: ["info", "math"],
        defaults: { itemKind: "step" }, requires: ["orderItems"] });
  def({ id: "reorder_priority", name: "優先順位並べ替え", shortName: "優先順位", category: "reorder", engine: "reorder",
        description: "大事な順に並べます。",
        legacyType: "ordering", defaults: { itemKind: "item" }, requires: ["orderItems"] });
  def({ id: "reorder_ranking", name: "ランキング並べ替え", shortName: "ランキング", category: "reorder", engine: "reorder",
        description: "大きい順・多い順に並べます。",
        legacyType: "ordering", defaults: { itemKind: "item" }, requires: ["orderItems"] });
  def({ id: "image_order", name: "画像順序", category: "reorder", altCategories: ["visual"], engine: "reorder",
        description: "写真や図を正しい順に並べます。",
        icon: "image", supportsMedia: true, legacyType: "ordering",
        defaults: { itemKind: "image" }, requires: ["orderItems"] });

  /* ── E. マッチング・分類式 ─────────────────────────────────────── */
  def({ id: "matching", name: "用語と意味のマッチング", shortName: "組み合わせ", category: "match", engine: "matching",
        description: "左と右を対応づけます。合った数だけ点が入ります。",
        legacy: true, legacyType: "matching", defaults: { pairKind: "term-meaning" }, requires: ["pairs"] });
  def({ id: "matching_person_event", name: "人物と出来事のマッチング", shortName: "人物と出来事", category: "match", engine: "matching",
        description: "人物と、その人が関わった出来事を結びます。",
        legacyType: "matching", supportedSubjects: ["social"], requires: ["pairs"] });
  def({ id: "matching_country_capital", name: "国と首都のマッチング", shortName: "国と首都", category: "match", engine: "matching",
        description: "国名と首都を結びます。",
        legacyType: "matching", supportedSubjects: ["social"], requires: ["pairs"] });
  def({ id: "matching_year_event", name: "年代と事件のマッチング", shortName: "年代と事件", category: "match", engine: "matching",
        description: "年と出来事を結びます。",
        legacyType: "matching", supportedSubjects: ["social"], requires: ["pairs"] });
  def({ id: "matching_word_meaning", name: "英単語と日本語のマッチング", shortName: "英単語と訳", category: "match", engine: "matching",
        description: "英単語と意味を結びます。",
        legacyType: "matching", supportedSubjects: ["english"], requires: ["pairs"] });
  def({ id: "matching_image_name", name: "画像と名称のマッチング", shortName: "画像と名称", category: "match", altCategories: ["visual"], engine: "matching",
        description: "図や写真と名前を結びます。",
        icon: "image", supportsMedia: true, legacyType: "matching", requires: ["pairs"] });
  def({ id: "matching_line", name: "左右線結び", shortName: "線結び", category: "match", engine: "matching",
        description: "左右を線で結びます。指でも操作できます。",
        legacyType: "matching", defaults: { display: "line" }, requires: ["pairs"] });
  def({ id: "matching_pairs", name: "ペア作成", category: "match", engine: "matching",
        description: "同じ仲間どうしを 2 つずつ組みます。",
        legacyType: "matching", requires: ["pairs"] });
  def({ id: "matching_audio_text", name: "音声と文章のマッチング", shortName: "音声と文", category: "match", altCategories: ["audio"], engine: "matching",
        description: "聞こえた音声と文を結びます。",
        icon: "audio", status: "beta", supportsMedia: true, supportsOffline: false,
        legacyType: "matching", requires: ["pairs", "audio"] });
  def({ id: "classification", name: "グループ分類", shortName: "分類", category: "match", engine: "classification",
        description: "項目をいくつかの箱へ分けます。合った数だけ点が入ります。",
        defaults: { allowUnassigned: true }, requires: ["groups", "items"],
        example: "次の語を「江戸時代」「明治時代」に分けなさい。" });
  def({ id: "classification_odd_group", name: "仲間分け", category: "match", engine: "classification",
        description: "共通点のあるものどうしを集めます。",
        defaults: { allowUnassigned: true }, requires: ["groups", "items"] });
  def({ id: "classification_drag", name: "該当カテゴリへのドラッグ", shortName: "カテゴリ振り分け", category: "match", engine: "classification",
        description: "項目を箱へ運びます。指でもキーボードでも動かせます。",
        defaults: { allowUnassigned: true, display: "drag" }, requires: ["groups", "items"] });
  def({ id: "classification_exclude", name: "余分な項目を除外", shortName: "余分を除く", category: "match", engine: "classification",
        description: "仲間はずれを「除外」の箱へ入れます。",
        defaults: { allowUnassigned: false, hasExcludeGroup: true }, requires: ["groups", "items"] });

  /* ── F. 画像・図表式 ───────────────────────────────────────────── */
  def({ id: "image_point", name: "画像内位置選択", shortName: "位置選択", category: "visual", engine: "image_point",
        description: "画像の上の正しい場所を押します。許容範囲を決められます。",
        icon: "image", supportsMedia: true, defaults: { zoomEnabled: true, tolerance: 0.06 },
        requires: ["image", "hotspots"], example: "地図で織田信長の本拠地を選びなさい。" });
  def({ id: "map_pin", name: "地図ピン選択", shortName: "地図ピン", category: "visual", engine: "image_point",
        description: "地図の上の場所を押します。",
        icon: "image", supportsMedia: true, supportedSubjects: ["social"],
        defaults: { zoomEnabled: true, tolerance: 0.05 }, requires: ["image", "hotspots"] });
  def({ id: "image_part", name: "部位選択", category: "visual", engine: "image_point",
        description: "体や植物の図で、指定された部分を押します。",
        icon: "image", supportsMedia: true, supportedSubjects: ["science"],
        defaults: { zoomEnabled: true, tolerance: 0.05 }, requires: ["image", "hotspots"] });
  def({ id: "coordinate_input", name: "座標指定", category: "visual", engine: "image_point",
        description: "方眼の上で座標を指定します。",
        icon: "image", supportsMedia: true, supportedSubjects: ["math"],
        defaults: { grid: true, tolerance: 0.03 }, requires: ["image", "hotspots"] });
  def({ id: "spot_difference", name: "間違い探し", category: "visual", engine: "image_point",
        description: "違っているところをすべて押します。見つけた数だけ点が入ります。",
        icon: "image", supportsMedia: true,
        defaults: { multiPoint: true, tolerance: 0.07 }, requires: ["image", "hotspots"] });
  def({ id: "image_label", name: "図へのラベル配置", shortName: "ラベル配置", category: "visual", engine: "image_label",
        description: "図の決められた場所へ名前を置きます。合った数だけ点が入ります。",
        icon: "image", supportsMedia: true, requires: ["image", "labelSlots"] });
  def({ id: "diagram_complete", name: "模式図完成", category: "visual", engine: "image_label",
        description: "模式図の空いたところを埋めます。",
        icon: "image", status: "beta", supportsMedia: true, supportedSubjects: ["science"],
        requires: ["image", "labelSlots"] });
  def({ id: "parts_place", name: "パーツ配置", category: "visual", engine: "image_label",
        description: "部品を正しい場所へ置きます。",
        icon: "image", status: "beta", supportsMedia: true, requires: ["image", "labelSlots"] });
  def({ id: "chart_read", name: "グラフ読み取り", shortName: "グラフ読取", category: "visual", engine: "chart_read",
        description: "グラフから読み取って答えます。選択でも数値でも答えられます。",
        icon: "chart", supportsMedia: true, defaults: { answerKind: "choice" },
        requires: ["chart"], example: "1975 年の輸出額として最も近いものを選びなさい。" });
  def({ id: "table_read", name: "表読み取り", shortName: "表読取", category: "visual", engine: "chart_read",
        description: "表から読み取って答えます。",
        icon: "grid", supportsMedia: true, defaults: { answerKind: "choice", chartKind: "table" },
        requires: ["chart"] });
  def({ id: "shape_judge", name: "図形判定", category: "visual", engine: "single_choice",
        description: "図を見て、当てはまるものを選びます。",
        icon: "image", supportsMedia: true, supportedSubjects: ["math"],
        legacyType: "multiple_choice_single", defaults: { choiceCount: 4 }, requires: ["image", "choices2"] });
  def({ id: "photo_judge", name: "写真判定", category: "visual", engine: "single_choice",
        description: "写真を見て、当てはまるものを選びます。",
        icon: "image", supportsMedia: true, legacyType: "multiple_choice_single",
        defaults: { choiceCount: 4 }, requires: ["image", "choices2"] });
  def({ id: "source_compare", name: "資料比較", category: "visual", altCategories: ["composite"], engine: "composite",
        description: "2 つ以上の資料を見比べて答えます。複合大問として組み立てます。",
        status: "beta", supportsMedia: true, requires: ["children", "context"] });
  def({ id: "map_color", name: "地図色分け", category: "visual", engine: "classification",
        description: "地域ごとに色を割り当てます。",
        icon: "image", status: "coming_soon", supportsMedia: true, supportedSubjects: ["social"] });
  def({ id: "drawing", name: "作図", category: "visual", engine: "free_text",
        description: "図をかいて答えます。採点は人が行います。",
        icon: "image", status: "coming_soon", supportedSubjects: ["math", "science"] });
  def({ id: "chart_build", name: "グラフ作成", category: "visual", engine: "free_text",
        description: "数値からグラフをかきます。",
        icon: "chart", status: "coming_soon", supportedSubjects: ["math", "science", "social"] });

  /* ── G. 音声・リスニング式 ─────────────────────────────────────── */
  def({ id: "audio_fill_blank", name: "音声穴埋め", category: "audio", engine: "fill_blank",
        description: "音声を聞きながら空欄を埋めます。",
        icon: "audio", supportsMedia: true, supportsOffline: false, legacyType: "fill_blank",
        defaults: { replayLimit: 3, blankMode: "input" }, requires: ["audio", "blanks"] });
  def({ id: "dictation", name: "ディクテーション", shortName: "書き取り", category: "audio", engine: "dictation",
        description: "聞こえたとおりに書き取ります。語ごとに部分点が付きます。",
        icon: "audio", supportsMedia: true, supportsOffline: false,
        defaults: { replayLimit: 3, caseSensitive: false }, requires: ["audio", "answerText"] });
  def({ id: "pronunciation_choice", name: "発音選択", category: "audio", engine: "audio_choice",
        description: "同じ発音・違う発音の語を選びます。",
        icon: "audio", supportsMedia: true, supportsOffline: false, supportedSubjects: ["english"],
        defaults: { replayLimit: 3, choiceCount: 4 }, requires: ["choices2"] });
  def({ id: "accent_position", name: "アクセント位置", category: "audio", altCategories: ["choice"], engine: "single_choice",
        description: "強く読む位置を選びます。音声がなくても出題できます。",
        icon: "audio", supportedSubjects: ["english"], legacyType: "multiple_choice_single",
        defaults: { choiceCount: 4, shuffleOptions: false }, requires: ["choices2"] });
  def({ id: "dialog_response", name: "会話応答", category: "audio", engine: "audio_choice",
        description: "会話の続きとして適切なものを選びます。",
        icon: "audio", supportsMedia: true, supportsOffline: false, supportedSubjects: ["english"],
        defaults: { replayLimit: 2, choiceCount: 4 }, requires: ["choices2"] });
  def({ id: "audio_once", name: "一度だけ再生", category: "audio", engine: "audio_choice",
        description: "音声を 1 回しか聞けません。試験形式の練習に使います。",
        icon: "audio", supportsMedia: true, supportsOffline: false,
        defaults: { replayLimit: 1, choiceCount: 4 }, requires: ["audio", "choices2"] });
  def({ id: "audio_speed", name: "倍速リスニング", shortName: "倍速", category: "audio", engine: "audio_choice",
        description: "速さを変えて聞きます。",
        icon: "audio", supportsMedia: true, supportsOffline: false,
        defaults: { playbackRate: 1.25, replayLimit: 3, choiceCount: 4 }, requires: ["audio", "choices2"] });
  def({ id: "audio_order", name: "音声順序", category: "audio", altCategories: ["reorder"], engine: "reorder",
        description: "聞こえた順に並べます。",
        icon: "audio", status: "beta", supportsMedia: true, supportsOffline: false,
        legacyType: "ordering", requires: ["audio", "orderItems"] });
  def({ id: "read_aloud_check", name: "読み上げ確認", category: "audio", engine: "free_text",
        description: "声に出して読んだ内容を確認します。マイクが要ります。",
        icon: "audio", status: "coming_soon", supportsOffline: false });
  def({ id: "shadowing", name: "シャドーイング", category: "audio", engine: "free_text",
        description: "聞こえた音を追いかけて声に出します。",
        icon: "audio", status: "coming_soon", supportsOffline: false, supportedSubjects: ["english"] });
  def({ id: "pronunciation_score", name: "発音評価", category: "audio", engine: "free_text",
        description: "発音を採点します。",
        icon: "audio", status: "coming_soon", supportsOffline: false, supportedSubjects: ["english"] });

  /* ── H. 記述・思考式 ───────────────────────────────────────────── */
  def({ id: "long_answer", name: "短文記述", shortName: "記述", category: "write", engine: "free_text",
        description: "1〜3 文で答えます。採点基準にそって AI が採点し、迷ったら保留にします。",
        legacy: true, legacyType: null, supportsPartialCredit: true,
        defaults: { minLength: 20, maxLength: 400, aiGrading: true }, requires: ["rubric"] });
  def({ id: "explain_reason", name: "理由説明", category: "write", engine: "free_text",
        description: "「なぜそうなるのか」を書きます。",
        defaults: { minLength: 30, maxLength: 400, aiGrading: true }, requires: ["rubric"] });
  def({ id: "summarize", name: "要約", category: "write", engine: "free_text",
        description: "本文を短くまとめます。字数の条件を付けられます。",
        defaults: { minLength: 40, maxLength: 300, aiGrading: true }, requires: ["context", "rubric"] });
  def({ id: "essay", name: "作文", category: "write", engine: "free_text",
        description: "まとまった文章を書きます。",
        legacy: true, defaults: { minLength: 100, maxLength: 1200, aiGrading: true }, requires: ["rubric"] });
  def({ id: "english_writing", name: "英作文", category: "write", engine: "free_text",
        description: "英語で書きます。文法と語法も見ます。",
        legacy: true, supportedSubjects: ["english"],
        defaults: { minLength: 30, maxLength: 600, aiGrading: true }, requires: ["rubric"] });
  def({ id: "dissertation", name: "小論文", category: "write", engine: "free_text",
        description: "主張と根拠を組み立てて書きます。",
        defaults: { minLength: 300, maxLength: 2000, aiGrading: true }, requires: ["rubric"] });
  def({ id: "error_correction", name: "誤文訂正", category: "write", engine: "error_correction",
        description: "間違っているところを見つけて直します。見つけた場所と直し方の両方を見ます。",
        supportsPartialCredit: true, defaults: { caseSensitive: false },
        requires: ["errorSpans"], example: "He don't like apples. → 誤りの語と正しい形を答える" });
  def({ id: "english_proofread", name: "英文添削", category: "write", engine: "error_correction",
        description: "英文の誤りを直します。",
        supportedSubjects: ["english"], supportsPartialCredit: true, requires: ["errorSpans"] });
  def({ id: "work_steps", name: "途中式記述", shortName: "途中式", category: "write", engine: "free_text",
        description: "答えだけでなく、途中の式も書きます。",
        supportedSubjects: ["math", "science"],
        defaults: { minLength: 10, maxLength: 800, aiGrading: true, monospace: false }, requires: ["rubric"] });
  def({ id: "proof", name: "証明問題", category: "write", engine: "free_text",
        description: "筋道を立てて証明します。",
        supportedSubjects: ["math"],
        defaults: { minLength: 50, maxLength: 1200, aiGrading: true }, requires: ["rubric"] });
  def({ id: "case_study", name: "ケーススタディ", category: "write", engine: "free_text",
        description: "場面を読んで、どうするかを書きます。",
        defaults: { minLength: 100, maxLength: 1000, aiGrading: true }, requires: ["context", "rubric"] });
  def({ id: "hypothesis", name: "仮説作成", category: "write", engine: "free_text",
        description: "結果を予想して、その理由を書きます。",
        supportedSubjects: ["science", "math", "social"],
        defaults: { minLength: 40, maxLength: 600, aiGrading: true }, requires: ["rubric"] });
  def({ id: "compare_explain", name: "比較説明", category: "write", engine: "free_text",
        description: "2 つを比べて、違いを説明します。",
        defaults: { minLength: 40, maxLength: 600, aiGrading: true }, requires: ["rubric"] });
  def({ id: "evidence_explain", name: "根拠説明", category: "write", engine: "free_text",
        description: "資料のどこを根拠にしたかを示しながら説明します。",
        defaults: { minLength: 40, maxLength: 600, aiGrading: true, requireSource: true },
        requires: ["context", "rubric"] });
  def({ id: "quote_evidence", name: "根拠箇所引用", shortName: "根拠引用", category: "write", engine: "free_text",
        description: "本文からそのまま抜き出します。字数の条件を付けられます。",
        defaults: { minLength: 5, maxLength: 200, aiGrading: false, quoteFromContext: true },
        requires: ["context", "answerText"] });
  def({ id: "source_analysis", name: "資料横断問題", shortName: "資料読解", category: "write", engine: "free_text",
        description: "いくつかの資料をまたいで考えて書きます。",
        legacy: true, defaults: { minLength: 60, maxLength: 800, aiGrading: true }, requires: ["context", "rubric"] });
  def({ id: "own_words", name: "自分の言葉で説明", shortName: "自分の言葉", category: "write", engine: "free_text",
        description: "本文の写しではなく、自分の言い方で説明します。",
        defaults: { minLength: 40, maxLength: 500, aiGrading: true, forbidVerbatim: true }, requires: ["rubric"] });
  def({ id: "counter_argument", name: "反対意見作成", shortName: "反対意見", category: "write", engine: "free_text",
        description: "示された主張に反論します。",
        defaults: { minLength: 60, maxLength: 800, aiGrading: true }, requires: ["rubric"] });
  def({ id: "free_write_ai", name: "自由記述＋AI採点", shortName: "AI採点記述", category: "write", engine: "free_text",
        description: "自由に書いて、採点基準にそって AI が採点します。基準を満たしたか・満たさなかったかまで返します。",
        defaults: { minLength: 20, maxLength: 1200, aiGrading: true, requiresRubric: true }, requires: ["rubric"],
        example: "参勤交代が大名に与えた影響を、経済面から説明しなさい。" });
  def({ id: "rubric_write", name: "採点基準付き記述", shortName: "基準付き記述", category: "write", engine: "free_text",
        description: "配点の内訳を先に決めてから書かせます。部分点の根拠が残ります。",
        defaults: { minLength: 20, maxLength: 1200, aiGrading: true, requiresRubric: true }, requires: ["rubric"] });

  /* ── I. 暗記・復習式 ───────────────────────────────────────────── */
  def({ id: "flashcard", name: "通常フラッシュカード", shortName: "カード", category: "memorize", engine: "flashcard",
        description: "表を見て思い出し、裏で答え合わせをします。自分で「できた・まだ」を付けます。",
        icon: "layers", supportsPartialCredit: false,
        defaults: { face: "front", selfMark: true }, requires: ["front", "back"],
        example: "表：ephemeral ／ 裏：はかない、つかの間の" });
  def({ id: "flashcard_reverse", name: "逆引きカード", category: "memorize", engine: "flashcard",
        description: "裏から表を思い出します。",
        icon: "layers", defaults: { face: "back", selfMark: true }, requires: ["front", "back"] });
  def({ id: "flashcard_speed", name: "高速カード", category: "memorize", engine: "flashcard",
        description: "1 枚あたりの時間を短くして、たくさん回します。",
        icon: "layers", defaults: { face: "front", selfMark: true, timeLimit: 6 }, requires: ["front", "back"] });
  def({ id: "flashcard_selfmark", name: "覚えた・まだカード", shortName: "覚えた／まだ", category: "memorize", engine: "flashcard",
        description: "「覚えた」「まだ」の 2 つだけで仕分けます。仕分けは次の出題に効きます。",
        icon: "layers", defaults: { face: "front", selfMark: true, twoWay: true }, requires: ["front", "back"] });
  /* 121〜132 のうち、以下は「解き方」。形式ではなくモードとして動く。
     一覧には出すが、選ぶとモードが切り替わる（形式は元のまま）。 */
  def({ id: "review_spaced", name: "忘却曲線復習", category: "memorize", engine: "flashcard",
        description: "間隔を空けて出し直します。忘れかけたころに出ます。",
        icon: "clock", mode: "mastery", supportsAI: false, requires: [] });
  def({ id: "review_weakness", name: "苦手問題復習", category: "memorize", engine: "flashcard",
        description: "正答率の低い単元へ寄せて出します。",
        icon: "clock", mode: "weakness_focus", supportsAI: false, requires: [] });
  def({ id: "review_wrong", name: "誤答問題再挑戦", category: "memorize", engine: "flashcard",
        description: "間違えた問題だけをもう一度出します。",
        icon: "refresh", mode: "weakness_focus", supportsAI: false, requires: [] });
  def({ id: "review_favorite", name: "お気に入り復習", category: "memorize", engine: "flashcard",
        description: "印を付けた問題だけを出します。",
        icon: "star", mode: "normal", supportsAI: false, requires: [] });
  def({ id: "review_yesterday", name: "前日誤答復習", category: "memorize", engine: "flashcard",
        description: "きのう間違えた問題を出します。",
        icon: "clock", mode: "weakness_focus", supportsAI: false, requires: [] });
  def({ id: "review_random", name: "ランダム復習", category: "memorize", engine: "flashcard",
        description: "順番をばらばらにして出します。",
        icon: "refresh", mode: "normal", supportsAI: false, requires: [] });
  def({ id: "review_streak_lock", name: "連続正解するまで終了不可", shortName: "連続正解まで", category: "memorize", engine: "flashcard",
        description: "決めた回数だけ続けて正解するまで終われません。",
        icon: "shield", mode: "mastery", supportsAI: false, requires: [] });
  def({ id: "mastery", name: "完全習得モード", shortName: "完全習得", category: "memorize", engine: "flashcard",
        description: "すべての項目を決めた回数だけ正解するまで続けます。",
        icon: "shield", mode: "mastery", supportsAI: false, requires: [] });

  /* ── J. 複合大問 ──────────────────────────────────────────────── */
  def({ id: "composite", name: "複合大問", category: "composite", engine: "composite",
        description: "1 つの資料・長文・図・音声に、小問をいくつもぶら下げます。小問はどの形式でも構いません。",
        icon: "grid", supportsMedia: true, supportsPartialCredit: true,
        defaults: { layout: "auto", stickyContext: true }, requires: ["children"],
        example: "英文 1 つに対して、内容一致4択・空欄補充・並べ替え・記述をぶら下げる" });

  /* ── 旧 V2 で使っていて、上に出てこないもの ───────────────────── */
  def({ id: "numeric", name: "数値入力", category: "text", altCategories: ["blank"], engine: "numeric_input",
        description: "数で答えます。許容誤差と単位を決められます。",
        legacy: true, legacyType: "numeric", supportedSubjects: ["math", "science", "social", "info"],
        defaults: { tolerance: 0, unit: "" }, requires: ["answerNumber"],
        example: "三角形の面積を求めなさい（単位: cm²）" });
  def({ id: "formula", name: "数式入力", category: "text", engine: "text_input",
        description: "式で答えます。あらかじめ書いた同じ意味の式とだけ照合します（記号の計算はしません）。",
        legacy: true, legacyType: "formula", supportedSubjects: ["math", "science"],
        defaults: {}, requires: ["answerText"] });

  var DEF_BY_ID = Object.create(null);
  DEFS.forEach(function (d) { DEF_BY_ID[d.id] = d; });

  /* 旧 ID からの読み替え。保存済みデータに変な type が入っていても落とさない。 */
  var ALIASES = {
    mcq: "multiple_choice_single",
    multiple_choice: "multiple_choice_single",
    single_choice: "multiple_choice_single",
    multi_select: "multiple_choice_multiple",
    tf: "true_false",
    cloze: "fill_blank",
    fill_in_blank: "fill_blank",
    sort: "ordering",
    order: "ordering",
    match: "matching",
    number: "numeric",
    free_text: "long_answer",
    writing: "english_writing",
    card: "flashcard"
  };

  /* ══════════════════════════════════════════════════════════════════
     日本語の指示 → 形式 ID（契約 §1・§5）

     ここは長らく blueprint.js の中だけにあり、呼べるのは preset-studio の
     2 か所だけだった。Quick Mock も qplan も draft も「日本語で書かれた形式名」を
     一切解けないままだった（実測: qtypes.canonicalId("英文並び替え") → null）。
     形式 ID の出どころはレジストリなので、**その読み方もレジストリ側に置く**。

     照合は「長い言い方から先に取り、取った範囲は二度使わない」。
     部分一致のままだと 1 つの言い方が複数の形式へ誤爆する。実測（2026-08-05）:
       「英作文並べ替えで5問」→ reorder_english / ordering / essay / english_writing の 4 件
     長い語を先に食べておけば、内側の「並べ替え」「英作文」「作文」は当たらない。
     一方で「穴埋めと正誤」のように離れた場所に並ぶ正当な複数指定は今までどおり拾える。
     ══════════════════════════════════════════════════════════════════ */

  /* 人が実際に書く言い方 → 形式。
     レジストリの名前だけを照合すると取りこぼす。実例：
       「並び替え」… レジストリは「並べ替え」
       「フローチャート順」… レジストリは「フローチャート並べ替え」
       「証明」… レジストリは「証明問題」
     略した言い方も、書き間違いも、そのまま通じるようにする。 */
  var ALIAS_WORDS = {
    /* ── 人がいちばんよく書く言い方 ──────────────────────────────
       レジストリの名前は「○×」「単一穴埋め」のように、**利用者が書かない語**が多い。
       実測（2026-08-04）: 「正誤問題だけで10問作って」で読み取れた形式が 0 個、
       「空欄補充を5問、正誤を5問」でも 0 個だった。
       名前を照合するだけでは、指示はほぼ通らない。 */
    "正誤": "true_false", "正誤問題": "true_false", "せいご": "true_false",
    "マルバツ": "true_false", "まるばつ": "true_false", "○✕": "true_false",
    "true/false": "true_false", "truefalse": "true_false", "T/F": "true_false",
    "正しいか": "true_false", "正誤判定": "true_false",
    "空欄補充": "fill_blank", "空所補充": "fill_blank", "穴うめ": "fill_blank",
    "かっこ埋め": "fill_blank", "括弧埋め": "fill_blank", "虫食い": "fill_blank",
    "四択": "multiple_choice_single", "4 択": "multiple_choice_single",
    "選択問題": "multiple_choice_single", "選択式": "multiple_choice_single",
    "複数選択": "multiple_choice_multiple", "複数回答": "multiple_choice_multiple",
    "一問一答": "word_input", "用語問題": "word_input", "語句": "word_input",
    "短答": "short_answer", "短答式": "short_answer",
    "組み合わせ": "matching", "組合せ": "matching", "対応させ": "matching",
    "分類": "classification",
    "計算": "numeric", "数値": "numeric", "数値入力": "numeric",
    /* 「作文」はレジストリの essay の名前そのもの。ここへ english_writing を
       割り当てていたため「作文を1問」が英作文にも当たっていた（実測 2026-08-05）。
       英語に寄せたいときは「英作文」と書く。 */
    "英作文": "english_writing",
    "資料読解": "source_analysis", "史料": "source_analysis",
    "並び替え": "ordering", "並びかえ": "ordering", "順番に並べ": "ordering",
    /* 「英文並び替え」は英作文並べ替え（reorder_english）。
       「並び替え」しか無かったので、文章並べ替え（ordering）に化けていた（実測 2026-08-05）。 */
    "英文並び替え": "reorder_english", "英文並べ替え": "reorder_english",
    "英文並びかえ": "reorder_english", "英作文並び替え": "reorder_english",
    "英作並び替え": "reorder_english", "英文の並び替え": "reorder_english",
    "英文の並べ替え": "reorder_english", "英作文の並び替え": "reorder_english",
    "英作文の並べ替え": "reorder_english",
    /* 「整序」は入試や参考書でいちばんよく使われる言い方。
       これが無かったため「語句整序問題を10問」が word_input（一問一答）に
       化けていた（実測 2026-08-05・A1b）。 */
    "語句整序": "reorder_words", "英文整序": "reorder_english",
    "整序": "reorder_words", "整序問題": "reorder_words",
    "単語整序": "reorder_words", "文整序": "ordering",
    "単語カードを並べ": "reorder_words", "語句カードを並べ": "reorder_words",
    "正しい順番に並べ": "ordering", "正しい順序に並べ": "ordering",
    "単語並び替え": "reorder_words", "語句並び替え": "reorder_words",
    "文章並び替え": "ordering", "年代順並び替え": "reorder_chronology",
    "フローチャート": "reorder_flow", "流れ図": "reorder_flow",
    "証明": "proof", "ベン図": "classification",
    "グラフ": "chart_read", "図表": "chart_read", "グラフ読み": "chart_read",
    "リスニング": "audio_choice", "書き取り": "dictation",
    "フラッシュカード": "flashcard", "単語カード": "flashcard",
    "記述式": "long_answer", "論述": "essay",
    "マッチング": "matching", "線でむす": "matching_line",
    "仲間わけ": "classification_odd_group",
    "和訳": "translate_ja", "英訳": "translate_en",
    "スペル": "spelling", "つづり": "spelling",
    "年表": "reorder_chronology", "時系列": "reorder_chronology",
    "計算過程": "work_steps", "途中の式": "work_steps"
  };

  /* 打ち消しの言い方。形式の名前のすぐ後ろに出たら「外して」の意味。

     打ち消しには 2 種類あり、同じ緩さで見てはいけない（実測 2026-08-05）。

     ・**形式そのものの否定**（使わない・除いて・禁止 …）
       これは動詞なので、形式名の少し後ろにあっても打ち消しだと分かる。
       「4択と記述は使わないで」のように間に語が挟まる。12 文字まで許す。

     ・**「なし」「無し」「抜き」**
       これは名詞にも付く。「穴埋めを**ヒントなし**で5問」の「なし」は
       ヒントを否定しているのであって、穴埋めを否定していない。
       退行時はこれを拾って fill_blank を excludedTypes へ入れ、
       頼まれた穴埋めが 1 問も出なくなっていた。
       そこで**形式名の直後（助詞しか挟まない）**のときだけ打ち消しとする。
       「記述なしで」「4択は抜きで」は今までどおり通る。 */
  /* 形式そのものを否定する言い方。動詞なので形式名から少し離れていても拾う。
     2026-08-05 追加: 「含めないでください」「入れずに」など、実際にいちばん
     よく書かれる言い方が抜けていた（実測: 「記述問題を含めないでください。」で
     long_answer が**要求**として読まれ、禁止されていなかった）。 */
  var DENY_STRONG_RE = /^[^。、]{0,12}?(使わない|使わず|使用しない|入れない|入れず|含めない|含めず|含まない|加えない|加えず|作らない|作らず|つくらない|つくらず|除いて|除く|除外|禁止|やめて|いらない|不要|出さない|出さず|避けて|なくして|抜いて)/;
  var DENY_WEAK_RE = /^(?:は|を|が|も|の|って|、|，|,|\s|　)*(なし|無し|抜き)/;
  /* 互換のため「打ち消しかどうか」を 1 本で聞ける形も残す。 */
  var DENY_RE = { test: function (s) { return DENY_STRONG_RE.test(s) || DENY_WEAK_RE.test(s); } };

  /* 形式名のうしろに続く「4問」「５題」「三個」。
     間に挟めるのは助詞と「だけ」「ずつ」程度に限る。ここを緩くすると
     「正誤を入れて10問作って」の 10 問（＝総数）まで形式の個数として食ってしまう。 */
  var COUNT_TAIL_RE = /^((?:だけ|のみ|ずつ|それぞれ|各|ぐらい|くらい|程度|問題|を|は|が|で|と|の|も|に|、|，|,|：|:|・|＋|\+|\s|　)*)([0-9]+|[０-９]+|[〇零一二三四五六七八九十百]+)[\s　]*(?:問|題|個|つ)/;
  /* 数の直前の助詞が「で」かどうか。「〜で20問」は**総数**の言い方でもある。 */
  var COUNT_BY_DE_RE = /で[\s　]*$/;
  /* 「5問ずつ」「各5問」は、個数が書かれていない形式にも同じ数がかかる。 */
  var EACH_AFTER_RE = /^[\s　]*(?:ずつ|づつ|それぞれ)/;
  var EACH_BEFORE_RE = /(各|それぞれ)/;

  var KANJI_DIGIT = { "〇": 0, "零": 0, "一": 1, "二": 2, "三": 3, "四": 4,
                      "五": 5, "六": 6, "七": 7, "八": 8, "九": 9 };

  function kanjiNumber(s) {
    var total = 0, cur = 0, seen = false;
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (KANJI_DIGIT[c] !== undefined) { cur = KANJI_DIGIT[c]; seen = true; }
      else if (c === "十") { total += (cur || 1) * 10; cur = 0; seen = true; }
      else if (c === "百") { total += (cur || 1) * 100; cur = 0; seen = true; }
      else return 0;
    }
    return seen ? total + cur : 0;
  }

  /* 「4」「４」「五」「十二」をすべて数にする。読めなければ 0。 */
  function readNumber(s) {
    var t = String(s == null ? "" : s)
      .replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
    if (/^\d+$/.test(t)) return parseInt(t, 10);
    return kanjiNumber(t);
  }

  /* 照合に使う言い方の一覧。レジストリを引くので、形式を足せば自動で増える。 */
  var WORD_ENTRIES = null;   /* 長い順（同じ長さなら正式名を先に） */
  var WORD_TO_ID = null;     /* 完全一致用 */

  function buildWords() {
    if (WORD_ENTRIES) return;
    var entries = [], map = Object.create(null);
    function add(word, id, fromName) {
      if (!word || word.length < 2) return;
      entries.push({ word: word, id: id, fromName: !!fromName });
      /* 同じ言い方が名前と言い換えの両方にあるときは、名前の側を採る。
         例:「仲間分け」はレジストリ名（仲間分け）と言い換え（分類）の両方にあった。 */
      if (map[word] === undefined || (fromName && !map[word].fromName)) {
        map[word] = { id: id, fromName: !!fromName };
      }
    }
    DEFS.forEach(function (d) {
      /* mode を持つ定義は「解き方」。形式の名指しとしては読まない。 */
      if (d.mode) return;
      add(d.name, d.id, true);
      if (d.shortName && d.shortName !== d.name) add(d.shortName, d.id, true);
      /* 「証明問題」を「証明」と書く人がいる。末尾の「問題」だけは落として見る。
         ほかの語尾（並べ替え・入力・選択）は落とさない。落とすと
         「単語並べ替え」→「単語」になり、単語入力の指示にまで当たる。 */
      if (/問題$/.test(d.name)) add(d.name.replace(/問題$/, ""), d.id, true);
    });
    Object.keys(ALIAS_WORDS).forEach(function (w) {
      if (DEF_BY_ID[ALIAS_WORDS[w]]) add(w, ALIAS_WORDS[w], false);
    });
    entries.sort(function (a, b) {
      if (b.word.length !== a.word.length) return b.word.length - a.word.length;
      if (a.fromName !== b.fromName) return a.fromName ? -1 : 1;
      return a.word < b.word ? -1 : a.word > b.word ? 1 : 0;
    });
    WORD_ENTRIES = entries;
    WORD_TO_ID = map;
    return;
  }

  /* 指示文のどこに、どの形式の呼び名が出たか。
     長い言い方から順に取り、取った範囲は二度使わない（誤爆を止めるのはここ）。 */
  /* sink … 省略可。渡すと sink.merges に「吸収した形式」を積む（契約 §6 の記録用）。 */
  function mentionsOf(text, sink) {
    buildWords();
    var t = String(text == null ? "" : text);
    if (sink && !arrayOf(sink.merges)) sink.merges = [];
    if (!t) return [];
    var taken = new Array(t.length), out = [];
    for (var i = 0; i < WORD_ENTRIES.length; i++) {
      var e = WORD_ENTRIES[i], w = e.word, from = 0, at;
      while ((at = t.indexOf(w, from)) >= 0) {
        var end = at + w.length, busy = false, k;
        for (k = at; k < end; k++) { if (taken[k]) { busy = true; break; } }
        if (busy) { from = at + 1; continue; }
        for (k = at; k < end; k++) taken[k] = true;
        out.push({ type: e.id, word: w, index: at, end: end, fromName: e.fromName });
        from = end;
      }
    }
    out.sort(function (a, b) { return a.index - b.index; });

    /* 「英単語と訳のマッチング」のように、細かい言い方のすぐ後ろへ
       同じ操作の**総称**が続くことがある。これを 2 形式と読むと、
       個数（「…を4問」）まで総称のほうへ付いてしまう（実測 2026-08-05）。

       ただし「同じ engine で隣り合っていれば吸収する」は広すぎた。
       「英訳和訳を5問」（どちらも engine=text_input）まで 1 形式へ潰れ、
       和訳が黙って消えていた。形式が黙って減るのは契約 §6 の趣旨に反する。

       そこで**後ろの語がその engine の総称であるときだけ**吸収する。
       総称かどうかは「形式 ID と engine ID が同じ」で見る
       （matching / fill_blank のように、engine を代表する定義がそれ）。
       translate_ja・translate_en はどちらも engine=text_input で
       ID ≠ engine なので、もう吸収されない。
       吸収したときは out.merges に残して呼び出し側へ伝える。 */
    var merged = [];
    for (var j = 0; j < out.length; j++) {
      var cur = out[j], prev = merged[merged.length - 1];
      if (prev && prev.type !== cur.type) {
        var gap = t.slice(prev.end, cur.index);
        var e1 = DEF_BY_ID[prev.type], e2 = DEF_BY_ID[cur.type];
        var curIsGeneric = !!(e2 && e2.engine && e2.engine === cur.type);
        if ((gap === "" || gap === "の") && e1 && e2
            && e1.engine === e2.engine && curIsGeneric) {
          if (sink && arrayOf(sink.merges)) {
            sink.merges.push({ kept: prev.type, absorbed: cur.type,
                               keptWord: prev.word, absorbedWord: cur.word });
          }
          prev.word = prev.word + gap + cur.word;
          prev.end = cur.end;
          continue;
        }
      }
      merged.push(cur);
    }
    return merged;
  }
  function arrayOf(v) { return Object.prototype.toString.call(v) === "[object Array]" ? v : null; }

  /* 日本語の指示文から形式 ID を読み取る。
     opts.suffix … 呼び名の直後 4 文字がこれに当たるものだけ拾う（「〜だけ」用）
     opts.exact  … 文字列そのものが 1 つの呼び名のときだけ返す（canonicalId 用） */
  function fromJapanese(text, opts) {
    opts = opts || {};
    var t = String(text == null ? "" : text);
    if (!t) return [];
    if (opts.exact) {
      buildWords();
      var hit = WORD_TO_ID[t.trim()];
      return hit ? [hit.id] : [];
    }
    var suffix = opts.suffix || null;
    var seen = Object.create(null), ids = [];
    mentionsOf(t).forEach(function (m) {
      if (suffix && !suffix.test(t.slice(m.end, m.end + 4))) return;
      if (seen[m.type]) return;
      seen[m.type] = 1;
      ids.push(m.type);
    });
    return ids;
  }

  /* 「〜は使わないで」と打ち消された形式。
     同じ語が何度も出る。最初の 1 つだけ見てはいけない。
     「4択だけで作って。ただし4択は使わないで」は、1 つめだけ見ると打ち消しに気づかない。 */
  /* 形式名だけが区切り記号で並んでいる部分か（「4択、穴埋め、短答」）。
     並びの途中に他の言葉が挟まっていたら、それは並びではない。 */
  var LIST_SEP_RE = /[、,，・･／/｜|と\s　]|および|及び|または|又は|ならびに|並びに/;
  var SENTENCE_END_RE = /[。．.!！?？]/;
  /* 動きのある語が挟まっていたら、それは並びではなく別の文。 */
  var LIST_BREAK_RE = /(作|使|入|含|出|付|書|直|変|選|answer|make|use)/;

  function isListGap(s) {
    var g = String(s == null ? "" : s);
    if (!g) return true;                       /* くっついている */
    if (g.length > 6) return false;            /* 離れすぎ */
    if (SENTENCE_END_RE.test(g)) return false; /* 文が変わっている */
    if (LIST_BREAK_RE.test(g)) return false;
    if (!LIST_SEP_RE.test(g)) return false;    /* 区切りが無い */
    /* 「、自由」のように、区切り＋次の語の頭が少し混じるのは許す。
       別名の表に「記述」しか無いと、「自由記述」は 2 文字ずれるため
       （実測 2026-08-05: これで並びの否定が効かなかった）。 */
    return true;
  }

  function deniedFromJapanese(text) {
    var t = String(text == null ? "" : text);
    if (!t) return [];
    var seen = Object.create(null), out = [];
    var ms = mentionsOf(t);

    /* ── 並びの否定（2026-08-05 追加）─────────────────────────
       「4択、穴埋め、短答、自由記述は**禁止です**」のように、
       形式名を並べてから最後にまとめて否定する言い方はごく普通。
       ところが打ち消しは「形式名のうしろ 12 文字以内」しか見ないので、
       **最後の 1 つしか禁止にならず、残りは要求として読まれていた**
       （実測: 上の文で禁止は long_answer だけ、他 3 つが要求に入った）。

       ある形式が否定されているとき、その手前に区切り記号だけで
       つながっている形式も、まとめて否定されているとみなす。 */
    /* 「〜以外は使わないで」は**逆の意味**（それだけを使う）。
       打ち消しの語だけを見ると、頼まれた形式そのものを禁止にしてしまい、
       使える形式が 1 つも残らなくなる
       （実測 2026-08-05: 「並び替え以外は使わないで」で並び替えが禁止になり、
        矛盾として生成が止まった）。 */
    var EXCEPT_RE = /^(?:[はをがのも、\s　]*)(以外|意外|のほか|の他|を除)/;

    var deniedIdx = Object.create(null);
    ms.forEach(function (m, i) {
      var tail = t.slice(m.end);
      if (EXCEPT_RE.test(tail)) return;        /* 「〜以外」は打ち消しではない */
      /* 形式そのものの否定は少し離れていても拾う。
         「なし」「抜き」は形式名の直後（助詞しか挟まない）ときだけ。
         これを分けないと「穴埋めをヒントなしで5問」で穴埋めが消える。 */
      if (DENY_STRONG_RE.test(tail) || DENY_WEAK_RE.test(tail)) deniedIdx[i] = 1;
    });
    /* 否定された形式から手前へ、区切りだけでつながっている限りさかのぼる。 */
    Object.keys(deniedIdx).forEach(function (k) {
      var i = Number(k);
      for (var j = i - 1; j >= 0; j--) {
        var between = t.slice(ms[j].end, ms[j + 1].index);
        if (!isListGap(between)) break;
        deniedIdx[j] = 1;
      }
    });

    ms.forEach(function (m, i) {
      if (!deniedIdx[i] || seen[m.type]) return;
      seen[m.type] = 1;
      out.push(m.type);
    });
    return out;
  }

  /* 「空欄補充を4問、正誤を4問」→ [{type:"fill_blank",count:4},{type:"true_false",count:4}]
     個数が書かれていない形式は入れない。何も書かれていなければ []。

     sink … 省略可。渡すと次を埋める（呼び出し側が §6 の記録を作るため）。
       sink.merges    … 吸収した形式（mentionsOf が積む）
       sink.spans     … 「形式の個数」として読んだ文字の範囲 [{start,end}]
       sink.totalHint … 「〜で20問」を総数と読み替えたときの、その数 */
  function countsFromJapanese(text, sink) {
    var t = String(text == null ? "" : text);
    if (sink) { sink.spans = []; sink.totalHint = 0; sink.groupedCounts = []; }
    if (!t) return [];
    var ms = mentionsOf(t, sink), each = 0;
    ms.forEach(function (m, idx) {
      /* **次の形式名より先は見ない。**
         「正誤と一問一答で12問」で、正誤のうしろを最後まで見ると
         「と」＋「一」＋「問」で **正誤 1 問** と読んでしまう
         （「一問一答」の一問を数と取っていた。実測 2026-08-05 の総当たりで発覚）。
         個数は必ず、その形式名と次の形式名のあいだに書かれている。 */
      var stop = idx + 1 < ms.length ? ms[idx + 1].index : t.length;
      var tail = t.slice(m.end, stop);
      var mm = COUNT_TAIL_RE.exec(tail);
      if (!mm) return;
      var n = readNumber(mm[2]);
      if (!(n > 0) || n > 500) return;
      m.count = n;
      m.countStart = m.end;
      m.countEnd = m.end + mm[0].length;
      /* 数の直前が「で」＝「〜で20問」。個数の言い方でも総数の言い方でもある。 */
      m.byDe = COUNT_BY_DE_RE.test(mm[1]);
      /* 「和訳と英訳を5問ずつ」… 5 問は両方にかかる。 */
      if (EACH_BEFORE_RE.test(mm[1]) || EACH_AFTER_RE.test(tail.slice(mm[0].length))) each = n;
    });

    /* **「A と B と C で 20 問」の 20 問は総数**（退行の修理・2026-08-05）。
       助詞に「で」を許したせいで、この 20 問を C の個数として読んでいた。
       結果 typeDistribution が [C:20] だけになり、A と B が配分から消えた。

       形式が 2 つ以上並んでいて、個数が付いたのが**その 1 つだけ**で、
       しかもその付き方が「で」なら、それは総数と読む。
       「4択で10問、正誤で5問」のように**それぞれに**個数が付くときは個数のまま。
       「ずつ」「各」があるときも個数（総数ではない）。
       迷ったら個数として読まない ＝ 自動配分に任せるほうが害が小さい。 */
    if (each <= 0 && ms.length >= 2) {
      var withCount = [];
      ms.forEach(function (m) { if (m.count > 0) withCount.push(m); });
      if (withCount.length === 1 && withCount[0].byDe) {
        if (sink) sink.totalHint = withCount[0].count;
        withCount[0].count = 0;
      }
    }

    /* **くっついて書かれた 2 形式に付いた個数は、片方のものではない。**
       「英訳和訳を5問」の 5 問は和訳だけの数ではなく、2 つ合わせての数。
       前の形式を 0 問にすると、頼まれた英訳が丸ごと消える（契約 §6 に反する）。
       間に区切りが無い（空か「の」）のに前の形式に個数が無いときは、
       個数指定として読まず自動配分へ渡す（迷ったら読まない）。
       「和訳と英訳を5問ずつ」は「ずつ」があるので here には来ない。 */
    if (each <= 0) {
      for (var gi = 1; gi < ms.length; gi++) {
        var self = ms[gi], head = ms[gi - 1];
        if (!(self.count > 0) || head.count > 0) continue;
        var sep = t.slice(head.end, self.index);
        if (sep !== "" && sep !== "の") continue;
        if (sink) {
          if (!arrayOf(sink.groupedCounts)) sink.groupedCounts = [];
          sink.groupedCounts.push({ types: [head.type, self.type], count: self.count,
                                    words: [head.word, self.word] });
        }
        self.count = 0;
      }
    }

    if (each > 0) ms.forEach(function (m) { if (!m.count) m.count = each; });

    var out = [], at = Object.create(null);
    ms.forEach(function (m) {
      if (!m.count) return;
      if (sink && m.countEnd > m.countStart) sink.spans.push({ start: m.countStart, end: m.countEnd });
      if (at[m.type] !== undefined) { out[at[m.type]].count += m.count; return; }
      at[m.type] = out.length;
      out.push({ type: m.type, count: m.count });
    });
    return out;
  }

  /* ══════════════════════════════════════════════════════════════════
     参照 API
     ══════════════════════════════════════════════════════════════════ */
  function canonicalId(type) {
    var t = String(type == null ? "" : type);
    if (DEF_BY_ID[t]) return t;
    if (ALIASES[t]) return ALIASES[t];
    /* 日本語で書かれた形式名も解く（「英文並び替え」→ reorder_english）。
       文全体ではなく、**呼び名そのもの**のときだけ。文の中から拾いたいときは
       fromJapanese() を使う。 */
    var jp = fromJapanese(t, { exact: true });
    return jp.length ? jp[0] : null;
  }
  function get(type) {
    var id = canonicalId(type);
    return id ? DEF_BY_ID[id] : null;
  }
  /* 未知の形式でも落とさない。「準備中」の空定義を返して画面を守る（§24）。 */
  function getOrUnknown(type) {
    var d = get(type);
    if (d) return d;
    return {
      id: String(type == null ? "" : type) || "unknown",
      name: "未対応の形式",
      shortName: "未対応",
      description: "このアプリではまだ表示できない形式です。作った人に確認してください。",
      category: "choice", altCategories: [], engine: "single_choice", icon: "warning",
      status: "deprecated", supportedSubjects: [], supportedModes: [],
      supportsAI: false, supportsManualCreation: false, supportsMedia: false,
      supportsPartialCredit: false, supportsExplanation: true, supportsHints: false,
      supportsTimer: false, supportsOffline: true, supportsConfidence: false,
      defaults: {}, legacyType: null, legacy: false, mode: null, order: 9999,
      version: 0, requires: [], example: "", unknown: true
    };
  }
  function engineOf(type) { var d = get(type); return d ? d.engine : null; }
  function legacyTypeOf(type) { var d = get(type); return d ? d.legacyType : null; }
  function label(type) { var d = getOrUnknown(type); return d.name; }
  function shortLabel(type) { var d = getOrUnknown(type); return d.shortName; }
  function iconOf(type) { return getOrUnknown(type).icon; }
  function statusOf(type) { return getOrUnknown(type).status; }
  function isAvailable(type) { var s = statusOf(type); return s === "available" || s === "beta"; }
  function isKnown(type) { return !!get(type); }
  function isDeterministic(type) {
    var d = get(type);
    if (!d) return false;
    var e = ENGINE_BY_ID[d.engine];
    if (!e) return false;
    if (d.engine === "free_text") return d.defaults && d.defaults.aiGrading === false;
    return e.deterministic;
  }
  function isAiGraded(type) {
    var d = get(type);
    if (!d) return false;
    return d.engine === "free_text" && !(d.defaults && d.defaults.aiGrading === false);
  }
  function hasChoices(type) {
    var e = engineOf(type);
    return e === "single_choice" || e === "multi_choice" || e === "true_false"
        || e === "image_choice" || e === "audio_choice";
  }
  function supportsPartial(type) { return !!getOrUnknown(type).supportsPartialCredit; }
  function supports(type, cap) {
    var d = getOrUnknown(type);
    var key = "supports" + cap.charAt(0).toUpperCase() + cap.slice(1);
    return !!d[key];
  }
  function requires(type, what) { return getOrUnknown(type).requires.indexOf(what) >= 0; }
  function defaultsFor(type) {
    var d = get(type);
    return d ? JSON.parse(JSON.stringify(d.defaults)) : {};
  }
  function modeFor(type) { var d = get(type); return d ? d.mode : null; }

  function list(filter) {
    filter = filter || {};
    return DEFS.filter(function (d) {
      if (filter.status && filter.status.indexOf(d.status) < 0) return false;
      if (filter.availableOnly && d.status !== "available" && d.status !== "beta") return false;
      if (filter.category && d.category !== filter.category
          && d.altCategories.indexOf(filter.category) < 0) return false;
      if (filter.engine && d.engine !== filter.engine) return false;
      if (filter.subject && d.supportedSubjects.length
          && d.supportedSubjects.indexOf(filter.subject) < 0) return false;
      if (filter.mode && d.supportedModes.indexOf(filter.mode) < 0) return false;
      if (filter.aiOnly && !d.supportsAI) return false;
      if (filter.manualOnly && !d.supportsManualCreation) return false;
      if (filter.mediaOnly && !d.supportsMedia) return false;
      if (filter.offlineOnly && !d.supportsOffline) return false;
      return true;
    });
  }
  function byCategory(cat, filter) {
    var f = Object.assign({}, filter || {}, { category: cat });
    return list(f);
  }

  /* 検索。形式名・短縮名・説明・分類名・例のどれかに当たれば拾う。
     ひらがな／カタカナ、全角／半角の違いは無視する。 */
  function foldSearch(s) {
    return String(s == null ? "" : s)
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/[ァ-ヶ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); })
      .replace(/\s+/g, "")
      .toLowerCase();
  }
  function search(q, filter) {
    var needle = foldSearch(q);
    var base = list(filter);
    if (!needle) return base;
    return base.map(function (d) {
      var cat = CATEGORY_BY_ID[d.category];
      var hay = [d.name, d.shortName, d.id, d.description, d.example, cat ? cat.label : ""];
      var score = 0;
      if (foldSearch(d.name).indexOf(needle) === 0) score = 100;
      else if (foldSearch(d.name).indexOf(needle) >= 0) score = 80;
      else if (foldSearch(d.shortName).indexOf(needle) >= 0) score = 70;
      else if (foldSearch(d.id).indexOf(needle) >= 0) score = 60;
      else if (hay.some(function (h) { return foldSearch(h).indexOf(needle) >= 0; })) score = 30;
      return { d: d, score: score };
    }).filter(function (x) { return x.score > 0; })
      .sort(function (a, b) { return b.score - a.score || a.d.order - b.d.order; })
      .map(function (x) { return x.d; });
  }

  /* おすすめ。科目と目的から、まず出す形式を決める。 */
  var RECOMMEND = {
    memorize: ["multiple_choice_single", "word_input", "flashcard", "matching", "fill_blank"],
    understand: ["multiple_choice_single", "ordering", "classification", "long_answer", "chart_read"],
    exam: ["multiple_choice_single", "fill_blank", "ordering", "composite", "free_write_ai"],
    review: ["flashcard", "review_wrong", "word_input", "multiple_choice_single"],
    game: ["multiple_choice_single", "choice_2", "flashcard_speed", "timed_input"]
  };
  var SUBJECT_RECOMMEND = {
    english: ["multiple_choice_single", "spelling", "reorder_english", "audio_choice", "dictation", "english_writing"],
    japanese: ["multiple_choice_single", "kanji_input", "reading_input", "ordering", "quote_evidence"],
    math: ["numeric", "reorder_steps", "work_steps", "chart_read", "coordinate_input"],
    science: ["multiple_choice_single", "image_part", "reorder_experiment", "chart_read", "classification"],
    social: ["multiple_choice_single", "reorder_chronology", "map_pin", "matching_year_event", "chart_read"],
    info: ["multiple_choice_single", "code_input", "reorder_flow", "table_read", "classification"],
    other: ["multiple_choice_single", "word_input", "fill_blank", "flashcard"]
  };
  function recommended(o) {
    o = o || {};
    var ids = [];
    if (o.subject && SUBJECT_RECOMMEND[o.subject]) ids = ids.concat(SUBJECT_RECOMMEND[o.subject]);
    if (o.purpose && RECOMMEND[o.purpose]) ids = ids.concat(RECOMMEND[o.purpose]);
    if (!ids.length) ids = RECOMMEND.memorize.concat(RECOMMEND.understand);
    var seen = Object.create(null);
    return ids.filter(function (id) {
      if (seen[id] || !DEF_BY_ID[id]) return false;
      seen[id] = 1;
      return DEF_BY_ID[id].status === "available";
    }).map(function (id) { return DEF_BY_ID[id]; });
  }

  /* 後から形式を足すための口。既存 ID の上書きは許さない（気づかず壊れるため）。 */
  function register(o) {
    if (DEF_BY_ID[o.id]) throw new Error("すでにある形式です: " + o.id);
    var d = def(o);
    DEF_BY_ID[d.id] = d;
    return d;
  }

  /* モード / 生成元 */
  function modes(o) {
    o = o || {};
    return MODES.filter(function (m) { return o.readyOnly ? m.ready : true; });
  }
  function mode(id) { return MODE_BY_ID[id] || null; }
  function modeLabel(id) { var m = MODE_BY_ID[id]; return m ? m.label : String(id || ""); }
  function sources(o) {
    o = o || {};
    return SOURCES.filter(function (s) { return o.readyOnly ? s.ready : true; });
  }
  function source(id) { return SOURCE_BY_ID[id] || null; }
  /* その形式を、そのモードで出してよいか。 */
  function allowedInMode(type, modeId) {
    var d = get(type);
    if (!d) return false;
    if (d.supportedModes.indexOf(modeId) < 0) return false;
    var m = MODE_BY_ID[modeId];
    if (!m) return false;
    /* 試験では、自分で正誤を付けるカードは使えない（自己申告になるため）。 */
    if ((modeId === "mock" || modeId === "multiplayer") && d.engine === "flashcard") return false;
    return true;
  }

  /* 統計（作成 UI の見出しと、報告のため） */
  function stats() {
    var by = { available: 0, beta: 0, coming_soon: 0, deprecated: 0 };
    DEFS.forEach(function (d) { by[d.status] = (by[d.status] || 0) + 1; });
    return { total: DEFS.length, byStatus: by, engines: ENGINES.length,
             modes: MODES.length, readyModes: READY_MODE_IDS.length, sources: SOURCES.length };
  }

  VQ2.qtypes = {
    REGISTRY_VERSION: REGISTRY_VERSION,
    ENGINES: ENGINES, MODES: MODES, SOURCES: SOURCES,
    CATEGORIES: CATEGORIES, SUBJECTS: SUBJECTS, STATUSES: STATUSES,
    ALIASES: ALIASES,
    /* 日本語の指示を読むための持ち物。ここが唯一の出どころ（契約 §1）。 */
    ALIAS_WORDS: ALIAS_WORDS,
    DENY_RE: DENY_RE,
    DENY_STRONG_RE: DENY_STRONG_RE,
    DENY_WEAK_RE: DENY_WEAK_RE,
    fromJapanese: fromJapanese,
    mentionsOf: mentionsOf,
    deniedFromJapanese: deniedFromJapanese,
    countsFromJapanese: countsFromJapanese,
    readNumber: readNumber,

    all: function () { return DEFS.slice(); },
    list: list, byCategory: byCategory, search: search, recommended: recommended,
    get: get, getOrUnknown: getOrUnknown, canonicalId: canonicalId, isKnown: isKnown,
    engine: function (id) { return ENGINE_BY_ID[id] || null; },
    engineOf: engineOf, legacyTypeOf: legacyTypeOf,
    label: label, shortLabel: shortLabel, icon: iconOf, status: statusOf,
    isAvailable: isAvailable, isDeterministic: isDeterministic, isAiGraded: isAiGraded,
    hasChoices: hasChoices, supportsPartial: supportsPartial, supports: supports,
    requires: requires, defaultsFor: defaultsFor, modeFor: modeFor,
    category: function (id) { return CATEGORY_BY_ID[id] || null; },
    modes: modes, mode: mode, modeLabel: modeLabel, allowedInMode: allowedInMode,
    sources: sources, source: source,
    register: register, stats: stats
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
