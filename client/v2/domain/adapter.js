/* ══════════════════════════════════════════════════════════════════════
   Legacy Preset Adapter（V1 ⇄ V2）
   ・既存の wordPractice400.presets.v1 を壊さずに V2 として読む。
   ・V2 で編集した内容は V1 の形へ書き戻せる（既存 Quiz がそのまま動くため）。
   ・V1 にしか無いフィールド（switch / diagram / aiCandidates など）は
     __legacy に丸ごと退避し、書き戻しで必ず復元する。捨てない。
   ・保存時に旧データを破壊的に書き換えない。V2 は追記のみ。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var S = VQ2.schema;
  if (!S) throw new Error("VQ2.schema must be loaded before adapter.js");

  function str(v) { return v === undefined || v === null ? "" : String(v); }
  function isStr(v) { return typeof v === "string"; }
  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

  /* V1 card のうち V2 が明示的に扱うキー。ここに無いものは __legacy 行き。 */
  var MAPPED_CARD_KEYS = {
    id: 1, front: 1, back: 1, explanation: 1, tags: 1, choices: 1, correctIndex: 1
  };

  /* ── V1 card → V2 Question ─────────────────────────────────────── */
  function cardToQuestion(card, index) {
    card = card || {};
    var choicesRaw = Array.isArray(card.choices) ? card.choices.filter(function (c) { return str(c).trim(); }) : [];
    var hasChoices = choicesRaw.length >= 2;
    var correctIndex = isNum(card.correctIndex) ? card.correctIndex : null;

    var type = hasChoices ? "multiple_choice_single" : "short_answer";
    var choices = choicesRaw.map(function (t, i) {
      return {
        id: "c" + (i + 1),
        label: String.fromCharCode(65 + i),          /* A, B, C ... */
        text: str(t),
        explanation: "",
        isCorrect: correctIndex === i
      };
    });

    /* 正解が示されていない選択肢問題は、後段の検証で error になる。
       ここで勝手に 0 番目を正解にしない（間違った正解を作らないため）。 */

    var media = [];
    if (isStr(card.imageUrl) && card.imageUrl) media.push({ id: "m_img", kind: "image", src: card.imageUrl });
    if (isStr(card.selectedAiImage) && card.selectedAiImage) media.push({ id: "m_ai", kind: "image", src: card.selectedAiImage });
    if (card.diagram) media.push({ id: "m_diagram", kind: "diagram", data: clone(card.diagram) });
    if (isStr(card.assetUrl) && card.assetUrl) media.push({ id: "m_asset", kind: "asset", src: card.assetUrl, name: str(card.assetName) });

    /* V2 が扱わない V1 固有フィールドを退避 */
    var legacy = {};
    for (var k in card) if (!MAPPED_CARD_KEYS[k]) legacy[k] = clone(card[k]);

    var cardNo = Number(card.id);
    var q = {
      id: "q_" + str(card.id || (index + 1)),
      /* V1 のカード id は利用者に見えている問題番号。ここで引き継ぐ。
         引き継がないと、V2 で足した問題の採番が 1 からやり直しになる。 */
      questionNumber: (isNum(cardNo) && Number.isInteger(cardNo) && cardNo > 0) ? cardNo : (index + 1),
      schemaVersion: S.SCHEMA_VERSION,
      type: type,
      prompt: str(card.front),
      promptRichText: null,
      media: media,
      choices: choices,
      correctAnswer: hasChoices ? null : str(card.back),
      acceptedAnswers: hasChoices ? [] : (str(card.back) ? [str(card.back)] : []),
      answerNormalization: hasChoices ? null : { trim: true, caseInsensitive: true, fullwidthToHalfwidth: true },
      explanation: str(card.explanation),
      choiceExplanations: null,
      difficulty: "normal",
      topic: "",
      tags: Array.isArray(card.tags) ? card.tags.map(str) : [],
      points: 1,
      estimatedSeconds: 60,
      sourceReferences: [],
      requiresReview: false,
      confidence: null,
      validationIssues: [],
      createdBy: "legacy",
      createdAt: null,
      updatedAt: null,
      __legacy: legacy
    };
    /* 選択肢問題なのに back（＝正答テキスト）がある場合は残す。表示と復習で使う。 */
    if (hasChoices && str(card.back)) q.__legacy.back = str(card.back);
    return q;
  }

  /* ── V2 Question → V1 card ─────────────────────────────────────── */
  function questionToCard(q) {
    q = q || {};
    var legacy = q.__legacy || {};
    var card = {};
    /* 退避していた V1 固有フィールドを最初に戻す */
    for (var k in legacy) card[k] = clone(legacy[k]);

    /* V1 のカード id は、利用者に見えている **問題番号** そのもの。
       V2 で番号が決まっていればそれを使う（唯一の決定元は draft.js の採番）。 */
    var no = Number(q.questionNumber);
    if (isNum(no) && Number.isInteger(no) && no > 0) {
      card.id = no;
    } else {
      /* 番号がまだ焼き付いていない古いデータ。"q_<原id>" から復元する。 */
      var rawId = str(q.id).replace(/^q_/, "");
      var numId = Number(rawId);
      card.id = isNum(numId) && String(numId) === rawId ? numId : (rawId || q.id);
    }

    card.front = str(q.prompt);

    var choices = Array.isArray(q.choices) ? q.choices : [];
    if (choices.length >= 2) {
      card.choices = choices.map(function (c) { return str(c.text); });
      var ci = -1;
      choices.forEach(function (c, i) { if (c && c.isCorrect === true && ci < 0) ci = i; });
      if (ci >= 0) card.correctIndex = ci; else delete card.correctIndex;
      /* V1 の back は「正答テキスト」。選択肢問題では正解の本文を入れる。 */
      card.back = ci >= 0 ? str(choices[ci].text) : str(legacy.back || "");
    } else {
      delete card.choices;
      delete card.correctIndex;
      card.back = str(q.correctAnswer || (Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers[0] : "") || "");
    }

    if (str(q.explanation)) card.explanation = str(q.explanation);
    else delete card.explanation;

    if (Array.isArray(q.tags) && q.tags.length) card.tags = q.tags.map(str);
    else delete card.tags;

    /* V1 が必ず持つ既定値 */
    if (!card.frontFormat) card.frontFormat = "text";
    if (!card.backFormat) card.backFormat = "text";
    if (!card.questionKind) card.questionKind = "standard";
    delete card.back_unused;
    return card;
  }

  /* ── V1 preset → V2 Preset ─────────────────────────────────────── */
  var MAPPED_PRESET_KEYS = { id: 1, name: 1, description: 1, visibility: 1, cards: 1, words: 1, schemaVersion: 1, questions: 1, ownerId: 1, revision: 1, updatedAt: 1, createdAt: 1 };

  /* 見た目。V1 に無ければ空のまま返す。data URL 以外の画像は受け取らない。 */
  function readAppearance(a) {
    var out = { icon: "", iconImage: "", banner: "" };
    if (!a || typeof a !== "object") return out;
    out.icon = str(a.icon).slice(0, 8);
    ["iconImage", "banner"].forEach(function (k) {
      var v = str(a[k]);
      out[k] = v.indexOf("data:image/") === 0 ? v : "";
    });
    return out;
  }
  function isEmptyAppearance(a) {
    return !a || (!str(a.icon) && !str(a.iconImage) && !str(a.banner));
  }

  function presetToV2(p, opts) {
    opts = opts || {};
    p = p || {};
    /* すでに V2 のものはそのまま返す（二重変換しない） */
    if (isNum(p.schemaVersion) && p.schemaVersion >= 2 && Array.isArray(p.questions)) return clone(p);

    var cards = Array.isArray(p.cards) ? p.cards : [];
    var sourceShape = "cards";
    /* cards が空で words しかない古い形もある。
       本体も「cards が空なら words を使う」実装なので、同じ順序で解釈する。
       words 固有のフィールド（meta など）は捨てずに退避し、書き戻しで復元する。 */
    if (!cards.length && Array.isArray(p.words) && p.words.length) {
      sourceShape = "words";
      var WORD_MAPPED = { id: 1, word: 1, meaning: 1, mcq: 1, explanation: 1, tags: 1 };
      cards = p.words.map(function (w, i) {
        var mcq = w && w.mcq && typeof w.mcq === "object" ? w.mcq : null;
        var extras = {};
        for (var wk in w) if (!WORD_MAPPED[wk]) extras[wk] = clone(w[wk]);
        var card = {
          id: w.id != null ? w.id : i + 1,
          front: str(w.word),
          back: str(w.meaning),
          explanation: str(w.explanation),
          tags: Array.isArray(w.tags) ? w.tags : [],
          choices: mcq && Array.isArray(mcq.choices) ? mcq.choices : undefined,
          correctIndex: mcq && isNum(mcq.correctIndex) ? mcq.correctIndex : undefined
        };
        if (Object.keys(extras).length) card.__wordExtras = extras;
        if (mcq) card.__mcqExtras = clone(mcq);
        return card;
      });
    }

    var legacy = {};
    for (var k in p) if (!MAPPED_PRESET_KEYS[k]) legacy[k] = clone(p[k]);

    return {
      id: str(p.id) || S.newId("preset"),
      schemaVersion: S.SCHEMA_VERSION,
      ownerId: str(opts.ownerId || p.ownerId || ""),
      name: str(p.name),
      description: str(p.description),
      visibility: ["private", "unlisted", "public"].indexOf(str(p.visibility)) >= 0 ? str(p.visibility) : "private",
      subjectId: str(p.subjectId),
      subjects: clone(p.subjects) || [],
      tagIds: clone(p.tagIds) || [],
      tags: clone(p.tags) || [],
      appearance: readAppearance(p.appearance),
      questions: cards.map(cardToQuestion),
      revision: isNum(p.revision) ? p.revision : 1,
      createdAt: str(p.createdAt) || null,
      updatedAt: str(p.updatedAt) || null,
      migratedFrom: "v1",
      __v1Shape: {
        sourceShape: sourceShape,
        hadCards: Array.isArray(p.cards),
        hadWords: Array.isArray(p.words),
        hadModes: !!p.modes,
        /* 元にあったキーだけを覚えておく。無かった項目を空値で生やさないため。 */
        keys: Object.keys(p)
      },
      __legacy: legacy
    };
  }

  /* ── V2 Preset → V1 preset（既存 Quiz がそのまま読める形へ） ────── */
  function presetToV1(v2) {
    v2 = v2 || {};
    var legacy = v2.__legacy || {};
    var out = {};
    for (var k in legacy) out[k] = clone(legacy[k]);

    var shape = v2.__v1Shape || { sourceShape: "cards", hadCards: true, hadWords: true, hadModes: true };
    var had = Object.create(null);
    (shape.keys || []).forEach(function (k) { had[k] = true; });
    var trackKeys = Array.isArray(shape.keys);

    /* 元に無かった項目を、空の既定値で生やさない。
       中身が入っているときだけ書き出す（＝利用者が V2 で設定したもの）。 */
    function put(key, value, isEmpty) {
      if (!isEmpty || (trackKeys && had[key]) || !trackKeys) out[key] = value;
    }
    out.id = str(v2.id);
    out.name = str(v2.name);
    put("description", str(v2.description), !str(v2.description));
    put("visibility", str(v2.visibility) || "private", !str(v2.visibility) || v2.visibility === "private");
    if (v2.subjectId) out.subjectId = str(v2.subjectId);
    put("subjects", clone(v2.subjects) || [], !(v2.subjects && v2.subjects.length));
    put("tagIds", clone(v2.tagIds) || [], !(v2.tagIds && v2.tagIds.length));
    put("tags", clone(v2.tags) || [], !(v2.tags && v2.tags.length));
    put("appearance", readAppearance(v2.appearance), isEmptyAppearance(v2.appearance));

    var questions = Array.isArray(v2.questions) ? v2.questions : [];
    var cards = questions.map(questionToCard);

    /* ── V1 が実際に読める形へ整える ──────────────────────────
       本体の normalizeCardEntry は
         ・id が正の整数でないカード
         ・front か back が空のカード
       を黙って捨てる。V2 で作ったカードの ID は文字列なので、
       ここで整数へ振り直さないと V1 側で 0 件になる（実測で確認済み）。 */
    assignIntegerIds(cards);
    cards.forEach(function (c, i) { ensureBack(c, questions[i]); });

    /* words 側だけが持っていた情報（meta など）を取り出し、card からは外す。 */
    var wordExtras = cards.map(function (c) {
      var e = c.__wordExtras, m = c.__mcqExtras;
      delete c.__wordExtras; delete c.__mcqExtras;
      return { extras: e, mcq: m };
    });

    var words = cards.map(function (c, i) {
      var w = { id: c.id, word: str(c.front), meaning: str(c.back) };
      var ex = wordExtras[i];
      if (Array.isArray(c.choices) && c.choices.length) {
        w.mcq = { choices: c.choices.slice(), correctIndex: isNum(c.correctIndex) ? c.correctIndex : 0 };
        /* choiceMedia など、元の mcq が持っていた追加情報を戻す */
        if (ex && ex.mcq) for (var mk in ex.mcq) if (mk !== "choices" && mk !== "correctIndex") w.mcq[mk] = clone(ex.mcq[mk]);
      }
      if (c.explanation) w.explanation = c.explanation;
      if (c.tags) w.tags = c.tags.slice();
      if (ex && ex.extras) for (var k2 in ex.extras) w[k2] = clone(ex.extras[k2]);
      return w;
    });

    /* 元の形を保つ。cards が空だった（words だけの）プリセットを、
       V2 を通しただけで cards 付きへ作り替えない。本体は cards が空なら
       words を読むので、これで既存の挙動と完全に一致する。 */
    if (shape.sourceShape === "words") {
      out.words = words;
      if (shape.hadCards) out.cards = [];
      else delete out.cards;
    } else {
      out.cards = cards;
      if (shape.hadWords !== false) out.words = words;
    }

    if (!out.modes && shape.hadModes !== false) out.modes = { SEQ: true, RND: true, HAND: true, CHOICE: true };
    return out;
  }

  /* 正の整数でない ID を、使われていない最小の正整数へ振り直す。
     もとから正の整数だったものは動かさない（既存データの ID を変えない）。 */
  function assignIntegerIds(cards) {
    var used = Object.create(null);
    var max = 0;
    cards.forEach(function (c) {
      var n = Number(c.id);
      if (isNum(n) && Number.isInteger(n) && n > 0) { used[n] = true; if (n > max) max = n; }
    });
    /* 空いている番号（削除跡）は埋めない。必ず最大の次から続ける。
       埋めていたころは、既存が 1,2,4,7 のプリセットへ 3 問足すと
       3,5,6 が振られ、あとから見ると順番が入れ替わって見えていた。 */
    var next = max + 1;
    /* 同じ整数 ID が 2 枚あると、V1 側は後から読んだほうで上書きしてしまう。
       先に出てきたほうを残し、重なったほうを最大の次へ送る。 */
    var taken = Object.create(null);
    cards.forEach(function (c) {
      var n = Number(c.id);
      if (isNum(n) && Number.isInteger(n) && n > 0 && !taken[n]) { taken[n] = true; c.id = n; return; }
      while (used[next] || taken[next]) next++;
      used[next] = true; taken[next] = true;
      c.id = next;
    });
  }

  /* V1 は back が空のカードを捨てる。埋められる根拠がある場合だけ埋め、
     内容を捏造しない。記述式のように正答が無いものは形式名を入れる。 */
  function ensureBack(card, q) {
    if (str(card.back).trim()) return;
    if (q) {
      var correct = (q.choices || []).filter(function (c) { return c.isCorrect; })[0];
      if (correct && str(correct.text).trim()) { card.back = str(correct.text); return; }
      if (str(q.correctAnswer).trim()) { card.back = str(q.correctAnswer); return; }
      var acc = (q.acceptedAnswers || []).filter(function (a) { return str(a).trim(); })[0];
      if (acc) { card.back = str(acc); return; }
      if (str(q.explanation).trim()) { card.back = str(q.explanation).split("\n")[0].slice(0, 120); return; }
    }
    card.back = "（記述式）";
  }

  /* ── 往復で内容が変わっていないかを確かめる（テストと保存前の自衛に使う） ── */
  function roundTripDiff(v1) {
    var back = presetToV1(presetToV2(v1));
    var diffs = [];
    function walk(a, b, path) {
      if (a === b) return;
      var ta = Array.isArray(a) ? "array" : (a === null ? "null" : typeof a);
      var tb = Array.isArray(b) ? "array" : (b === null ? "null" : typeof b);
      if (ta !== tb) { diffs.push({ path: path, from: a, to: b }); return; }
      if (ta === "array") {
        if (a.length !== b.length) { diffs.push({ path: path + ".length", from: a.length, to: b.length }); return; }
        for (var i = 0; i < a.length; i++) walk(a[i], b[i], path + "[" + i + "]");
        return;
      }
      if (ta === "object") {
        var keys = {};
        Object.keys(a).forEach(function (k) { keys[k] = 1; });
        Object.keys(b).forEach(function (k) { keys[k] = 1; });
        Object.keys(keys).forEach(function (k) { walk(a[k], b[k], path ? path + "." + k : k); });
        return;
      }
      diffs.push({ path: path, from: a, to: b });
    }
    walk(v1, back, "");
    return diffs;
  }

  VQ2.adapter = {
    cardToQuestion: cardToQuestion,
    questionToCard: questionToCard,
    presetToV2: presetToV2,
    presetToV1: presetToV1,
    roundTripDiff: roundTripDiff
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
