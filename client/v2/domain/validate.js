/* ══════════════════════════════════════════════════════════════════════
   保存前検証（§5）
   ・schema.js が「形」を見るのに対し、ここは「筋が通っているか」を見る。
   ・error が 1 件でもあるデータは保存・公開・受験開始をさせない。
   ・AI が作ったデータも人が編集したデータも同じ関門を通す。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var S = VQ2.schema;
  if (!S) throw new Error("VQ2.schema must be loaded before validate.js");

  var err = S.err, warn = S.warn, info = S.info;

  function isStr(v) { return typeof v === "string"; }
  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function nonEmpty(v) { return isStr(v) && v.trim().length > 0; }

  /* 重複 ID を洗い出す。どの位置で重なったかまで返す。 */
  function findDuplicateIds(items, getId) {
    var seen = Object.create(null), dups = [];
    (items || []).forEach(function (it, i) {
      var id = getId ? getId(it) : (it && it.id);
      if (!isStr(id) || !id) return;
      if (seen[id] !== undefined) dups.push({ id: id, first: seen[id], again: i });
      else seen[id] = i;
    });
    return dups;
  }

  /* 数値の丸め誤差で「合わない」と誤判定しないための比較。 */
  var EPS = 1e-6;
  function eq(a, b) { return Math.abs(a - b) < EPS; }
  function sum(arr) { return (arr || []).reduce(function (a, b) { return a + (isNum(b) ? b : 0); }, 0); }

  /* V2 からある 13 形式は、これまでどおりの規則で見る。
     ここを変えると、いま保存できているプリセットが保存できなくなりうる。 */
  /* 「まだ書いていない」ことを表す指摘。編集中は要修正にしない。 */
  var NOT_YET = { emptyPrompt: 1, emptyChoice: 1, noCorrectChoice: 1, emptyAnswer: 1,
                  choiceCount: 1, missingRubric: 1 };
  function soft(opts, issue) {
    if (!opts.requireAnswerable && issue.severity === "error" && NOT_YET[issue.code])
      return warn(issue.code, issue.path, issue.message);
    return issue;
  }

  function isLegacyRuleType(type) {
    var list = S.LEGACY_QUESTION_TYPES || S.QUESTION_TYPES;
    return list.indexOf(type) >= 0;
  }

  /* ══════════════════════════════════════════════════════════════════
     Question 単位の業務ルール
     ══════════════════════════════════════════════════════════════════ */
  /* answerability.js だけが見ている観点。
     ここに書いてあるものは、他の検査では出てこない。
     （選択肢の重複や正解の欠けは、下の規則がすでに見ている） */
  var ANSWERABILITY_ONLY = {
    ambiguousOrder: 1, duplicateItemId: 1, emptyItem: 1, orderMismatch: 1, orderUnknownId: 1,
    onlyTwoItems: 1, noPartner: 1, unknownPartner: 1, duplicateRight: 1,
    allCorrect: 1, needTwoCorrect: 1, emptyGroup: 1, noGroup: 1,
    regionOutside: 1, regionTooSmall: 1, sameCorrection: 1, wrongNotInText: 1,
    answerInPrompt: 1, answerTooLong: 1, blankCountMismatch: 1, noBlankMark: 1,
    noModelAnswer: 1, noEditableCell: 1, emptyCellAnswer: 1, noChartValue: 1,
    notNumeric: 1, badTolerance: 1, noSharedContext: 1
  };
  function answerabilityIssues(q, path, out) {
    var A = VQ2.answerability;
    if (!A) return;
    var r;
    try { r = A.checkAnswerable(q); } catch (e) { return; }
    (r.issues || []).forEach(function (i) {
      if (!ANSWERABILITY_ONLY[i.code]) return;
      out.push(i.level === "warning"
        ? warn(i.code, path + (i.fix ? "." + i.fix : ""), i.message)
        : err(i.code, path + (i.fix ? "." + i.fix : ""), i.message));
    });
  }

  function checkQuestionRules(q, path, out, opts) {
    opts = opts || {};
    var type = q && q.type;

    /* ── V3 の形式は、形式ごとの規則を qmodel が持つ ──────────────
       ここ（V2 の規則）は「選択肢がある／正解が 1 本の文字列」を前提にしている。
       分類・表・位置・複合大問などにそのまま当てると、正しい問題まで
       「選択肢がありません」「正解が設定されていません」で弾いてしまう。
       V3 のエンジンで動く形式は、そちらへ渡す。 */
    var Q3 = VQ2.qtypes, M3 = VQ2.qmodel;
    /* 作りはじめた直後の問題を、指摘だらけにしない。
       まだ何も書いていないなら 1 行だけ出す。出題・公開の直前は別（下の strict）。 */
    if (M3 && !opts.requireAnswerable && M3.looksUntouched(q)) {
      out.push(info("notWrittenYet", path,
        "この問題はまだ書きかけです（" + (Q3 ? Q3.label(type) : type) + "）。"));
      return;
    }
    /* ── 解けるか・点をつけられるか（V3 §20 / §21）──────────────────
       形として正しくても、
         ・並べ替えの正しい順が 2 通りある
         ・組み合わせの相手がいない
         ・問題文の中に正解がそのまま書いてある
       といったものは、人が解けない。出題・公開の直前にだけ見る
       （書きかけの間に出すと、指摘だらけで手が止まる）。 */
    if (opts.requireAnswerable) answerabilityIssues(q, path, out);

    /* 並べ替え・組み合わせ・空欄補充は、V2 では選択肢の形で持っていた。
       V3 の構造（orderItems / pairs / blanks）で書かれているなら、
       選択肢の規則ではなく、そちらの規則で見る。
       古い形（choices に入っている）はこれまでどおり。 */
    var hasV3Shape = !!(q && ((Array.isArray(q.orderItems) && q.orderItems.length)
                           || (q.pairs && Array.isArray(q.pairs.left) && q.pairs.left.length)
                           || (Array.isArray(q.blanks) && q.blanks.length)));
    if (Q3 && M3 && Q3.get(type) && (!isLegacyRuleType(type) || hasV3Shape)) {
      if (!nonEmpty(q.prompt) && Q3.engineOf(type) !== "flashcard" && Q3.engineOf(type) !== "composite")
        out.push(soft(opts, err("emptyPrompt", path + ".prompt", "問題文が空です。")));
      try {
        M3.validateQuestion(q, path, out, { strict: !!opts.requireAnswerable });
      } catch (e) {
        out.push(err("validateFailed", path, "この問題を確かめられませんでした。"));
      }
      return;
    }

    /* 空問題 */
    if (!nonEmpty(q.prompt)) out.push(soft(opts, err("emptyPrompt", path + ".prompt", "問題文が空です。")));

    /* 選択肢を持つべき形式のチェック */
    if (S.hasChoices(type)) {
      var ch = Array.isArray(q.choices) ? q.choices : [];
      if (type === "true_false") {
        /* 0 件を許すと、受験画面で選ぶものが何も出ない「解答欄の無い問題」になる。
           試験（requireAnswerable）では必ず 2 つ必要。 */
        if (ch.length === 0 && opts.requireAnswerable)
          out.push(soft(opts, err("choiceCount", path + ".choices", "正誤問題に選択肢がありません。受験時に解答欄を作れません。")));
        else if (ch.length !== 0 && ch.length !== 2)
          out.push(soft(opts, err("choiceCount", path + ".choices", "正誤問題の選択肢は 2 つ（または未設定）である必要があります。現在 " + ch.length + " 件。")));
      } else if (type === "multiple_choice_single" || type === "multiple_choice_multiple") {
        if (ch.length < 2) out.push(soft(opts, err("choiceCount", path + ".choices", "選択肢が " + ch.length + " 件しかありません。2 件以上必要です。")));
        if (ch.length > 10) out.push(soft(opts, err("choiceCount", path + ".choices", "選択肢が多すぎます（" + ch.length + " 件）。")));
      }

      /* Choice ID 重複 */
      findDuplicateIds(ch).forEach(function (d) {
        out.push(soft(opts, err("duplicateChoiceId", path + ".choices[" + d.again + "].id", "選択肢 ID が重複しています: " + d.id)));
      });

      /* 選択肢の本文が空 */
      ch.forEach(function (c, i) {
        if (!nonEmpty(c && c.text)) out.push(soft(opts, err("emptyChoice", path + ".choices[" + i + "].text", "選択肢の本文が空です。")));
      });

      /* 正解が実在するか */
      var correct = ch.filter(function (c) { return c && c.isCorrect === true; });
      if (ch.length > 0) {
        if (correct.length === 0)
          out.push(soft(opts, err("noCorrectChoice", path + ".choices", "正解の選択肢が 1 つも指定されていません。")));
        if (type === "multiple_choice_single" && correct.length > 1)
          out.push(soft(opts, err("tooManyCorrect", path + ".choices", "単一選択なのに正解が " + correct.length + " 件あります。")));
        if (type === "true_false" && correct.length > 1)
          out.push(soft(opts, err("tooManyCorrect", path + ".choices", "正誤問題なのに正解が " + correct.length + " 件あります。")));
      }

      /* 選択肢の重複本文（同じ文言が 2 つあると必ず割れる） */
      var texts = Object.create(null);
      ch.forEach(function (c, i) {
        var t = isStr(c && c.text) ? c.text.trim() : "";
        if (!t) return;
        if (texts[t] !== undefined)
          out.push(soft(opts, err("duplicateChoiceText", path + ".choices[" + i + "].text", "同じ本文の選択肢が 2 つあります。")));
        else texts[t] = i;
      });
    }

    /* 選択肢を持たない形式の正解 */
    if (!S.hasChoices(type) && S.isDeterministic(type)) {
      var hasAnswer = nonEmpty(q.correctAnswer) ||
        (Array.isArray(q.acceptedAnswers) && q.acceptedAnswers.some(nonEmpty)) ||
        (isNum(q.correctAnswer)) ||
        /* 空欄補充は、正解を blanks の側に持つ形もある（採点はどちらも読む）。
           ここで blanks を見ないと、空欄ごとに正解を書いた問題が保存できない。 */
        (Array.isArray(q.blanks) && q.blanks.length > 0 && q.blanks.every(function (b) {
          return nonEmpty(b && b.answer)
            || (Array.isArray(b && b.acceptedAnswers) && b.acceptedAnswers.some(nonEmpty));
        }));
      if (!hasAnswer) out.push(soft(opts, err("emptyAnswer", path + ".correctAnswer", "正解が設定されていません。")));
    }

    /* AI 補助採点が必要な形式は Rubric が要る（無いと採点根拠を出せない） */
    if (S.isAiGraded(type)) {
      var hasRubric = q.scoringRubric && Array.isArray(q.scoringRubric.items) && q.scoringRubric.items.length > 0;
      if (!hasRubric && opts.requireRubric)
        out.push(err("missingRubric", path + ".scoringRubric", "記述式には採点基準（Rubric）が必要です。"));
      else if (!hasRubric)
        out.push(warn("missingRubric", path + ".scoringRubric", "採点基準がないため、AI 採点の根拠を示せません。"));
      else {
        var rsum = sum(q.scoringRubric.items.map(function (it) { return it.points; }));
        if (isNum(q.points) && !eq(rsum, q.points))
          out.push(err("rubricSumMismatch", path + ".scoringRubric",
            "採点基準の合計 " + rsum + " 点が配点 " + q.points + " 点と一致しません。"));
      }
    }

    /* 配点 */
    if (q.points !== undefined && q.points !== null) {
      if (!isNum(q.points)) out.push(err("badPoints", path + ".points", "配点が数値ではありません。"));
      else if (q.points < 0) out.push(err("badPoints", path + ".points", "配点が負の数です。"));
      else if (opts.forbidZeroPoints && q.points === 0) out.push(err("zeroPoints", path + ".points", "配点が 0 点の問題があります。"));
    }

    /* 観点別配点の合計は配点と一致していること */
    if (Array.isArray(q.criterionAllocation) && q.criterionAllocation.length) {
      var csum = sum(q.criterionAllocation.map(function (a) { return a.points; }));
      if (isNum(q.points) && !eq(csum, q.points))
        out.push(err("criterionSumMismatch", path + ".criterionAllocation",
          "観点別配点の合計 " + csum + " 点が配点 " + q.points + " 点と一致しません。"));
      var seenC = Object.create(null);
      q.criterionAllocation.forEach(function (a, i) {
        if (seenC[a.criterionId]) out.push(err("duplicateCriterion", path + ".criterionAllocation[" + i + "]", "同じ観点が 2 回出てきます。"));
        seenC[a.criterionId] = true;
      });
    }

    /* SourceReference の整合性。
       ページ番号を持つのに資料名が無いものは、出典として検証できないので落とす。 */
    (q.sourceReferences || []).forEach(function (sr, i) {
      var p = path + ".sourceReferences[" + i + "]";
      if (isNum(sr.page) && !nonEmpty(sr.sourceName) && !nonEmpty(sr.sourceId))
        out.push(err("orphanSource", p, "ページ番号があるのに、どの資料かが特定できません。"));
      if (sr.verified === false && opts.requireVerifiedSources)
        out.push(warn("unverifiedSource", p, "未確認の出典です。"));
    });

    /* 資料限定モードで出典が無い問題は要確認（§14） */
    if (opts.sourceOnly && !(q.sourceReferences || []).length) {
      out.push(warn("missingSource", path + ".sourceReferences",
        "資料限定の指定ですが、この問題には出典がありません。"));
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     Preset の保存前検証
     ══════════════════════════════════════════════════════════════════ */
  function validatePresetForSave(preset, opts) {
    opts = opts || {};
    var out = S.validatePreset(preset, []);
    if (!preset || typeof preset !== "object") return out;

    /* Schema version */
    if (isNum(preset.schemaVersion) && preset.schemaVersion > S.SCHEMA_VERSION)
      out.push(err("schemaVersion", "schemaVersion",
        "このプリセットは新しい形式（v" + preset.schemaVersion + "）です。アプリの更新が必要です。"));

    var qs = Array.isArray(preset.questions) ? preset.questions : [];

    /* 問題数 */
    if (qs.length === 0) out.push(err("noQuestions", "questions", "問題が 1 問もありません。"));
    if (opts.expectedCount && qs.length !== opts.expectedCount)
      out.push(warn("questionCount", "questions",
        "指定は " + opts.expectedCount + " 問ですが " + qs.length + " 問あります。"));

    /* Question ID 重複 */
    findDuplicateIds(qs).forEach(function (d) {
      out.push(err("duplicateQuestionId", "questions[" + d.again + "].id", "問題 ID が重複しています: " + d.id));
    });

    /* 問題番号の重複。番号は画面と紙面に出るので、内部 ID とは別に見る。
       AI が付けた 1,2,3 が既存の番号と重なったまま保存されるのを、
       ここで最後に止める。 */
    var seenNo = Object.create(null);
    qs.forEach(function (q, i) {
      var n = Number(q && q.questionNumber);
      if (!isFinite(n) || Math.floor(n) !== n || n <= 0) return;
      if (seenNo[n] !== undefined) {
        out.push(err("duplicateQuestionNumber", "questions[" + i + "].questionNumber",
          "問題番号が重複しています: " + n + " 番（" + (seenNo[n] + 1) + " 件目と " + (i + 1) + " 件目）"));
      } else seenNo[n] = i;
    });

    qs.forEach(function (q, i) { checkQuestionRules(q, "questions[" + i + "]", out, opts); });

    return out;
  }

  /* ══════════════════════════════════════════════════════════════════
     MockSpec の保存前検証
     ・紙とデジタルと採点が食い違わないことを、ここで最終的に保証する。
     ══════════════════════════════════════════════════════════════════ */
  function validateMockSpecForSave(spec, opts) {
    opts = opts || {};
    var out = S.validateMockSpec(spec, []);
    if (!spec || typeof spec !== "object") return out;

    if (isNum(spec.schemaVersion) && spec.schemaVersion > S.SCHEMA_VERSION)
      out.push(err("schemaVersion", "schemaVersion",
        "この試験は新しい形式（v" + spec.schemaVersion + "）です。アプリの更新が必要です。"));

    var sections = Array.isArray(spec.sections) ? spec.sections : [];
    var bindings = Array.isArray(spec.answerBindings) ? spec.answerBindings : [];
    var allQ = [];
    sections.forEach(function (s) { (s.questions || []).forEach(function (q) { allQ.push({ q: q, s: s }); }); });

    /* 問題が 1 問も無い */
    if (!allQ.length) out.push(err("noQuestions", "sections", "問題が 1 問もありません。"));

    /* ID 重複 */
    findDuplicateIds(sections).forEach(function (d) {
      out.push(err("duplicateSectionId", "sections[" + d.again + "].id", "大問 ID が重複しています: " + d.id));
    });
    findDuplicateIds(allQ.map(function (x) { return x.q; })).forEach(function (d) {
      out.push(err("duplicateQuestionId", "sections[].questions[" + d.again + "].id", "問題 ID が重複しています: " + d.id));
    });
    findDuplicateIds(bindings).forEach(function (d) {
      out.push(err("duplicateBindingId", "answerBindings[" + d.again + "].id", "回答欄 ID が重複しています: " + d.id));
    });

    /* 問題ごとのルール（試験なので 0 点問題と Rubric 欠落は error 扱い） */
    var qopts = {};
    for (var k in opts) qopts[k] = opts[k];
    qopts.forbidZeroPoints = true;
    qopts.requireRubric = true;
    /* 試験は受験できることが前提。解答欄を作れない問題は保存させない。 */
    qopts.requireAnswerable = true;
    sections.forEach(function (s, si) {
      (s.questions || []).forEach(function (q, qi) {
        checkQuestionRules(q, "sections[" + si + "].questions[" + qi + "]", out, qopts);
      });
    });

    /* ── 回答欄との対応（双方向） ── */
    var byBindingId = Object.create(null);
    bindings.forEach(function (b) { if (b && isStr(b.id)) byBindingId[b.id] = b; });
    var boundQuestionIds = Object.create(null);

    allQ.forEach(function (x, i) {
      var q = x.q;
      var bid = q && q.answerBindingId;
      if (!isStr(bid) || !bid) {
        out.push(err("missingAnswerBinding", "sections[].questions[" + i + "].answerBindingId",
          "問題「" + (q && q.number || i + 1) + "」に対応する回答欄がありません。"));
        return;
      }
      var b = byBindingId[bid];
      if (!b) {
        out.push(err("danglingAnswerBinding", "sections[].questions[" + i + "].answerBindingId",
          "回答欄 " + bid + " が解答用紙に存在しません。"));
        return;
      }
      boundQuestionIds[q.id] = true;
      if (b.questionId !== q.id)
        out.push(err("bindingMismatch", "answerBindings." + bid + ".questionId",
          "回答欄 " + bid + " が別の問題（" + b.questionId + "）を指しています。"));
      if (b.inputType !== q.type)
        out.push(err("bindingTypeMismatch", "answerBindings." + bid + ".inputType",
          "回答欄の形式（" + b.inputType + "）が問題の形式（" + q.type + "）と違います。"));
      if (isNum(b.points) && isNum(q.points) && !eq(b.points, q.points))
        out.push(err("bindingPointsMismatch", "answerBindings." + bid + ".points",
          "回答欄の配点 " + b.points + " 点が問題の配点 " + q.points + " 点と一致しません。"));
    });

    /* 逆向き：問題の無い回答欄 */
    bindings.forEach(function (b, i) {
      if (!b || !isStr(b.questionId)) return;
      if (!boundQuestionIds[b.questionId])
        out.push(err("orphanAnswerBinding", "answerBindings[" + i + "]",
          "回答欄 " + b.id + " に対応する問題がありません。"));
    });

    /* ── 番号の欠番・重複 ── */
    checkNumbering(sections.map(function (s) { return s.number; }), "sections", "大問番号", out);
    sections.forEach(function (s, si) {
      checkNumbering((s.questions || []).map(function (q) { return q.number; }),
        "sections[" + si + "].questions", "問題番号", out);
    });

    /* ── 配点の一致（問題 → 大問小計 → 総合点） ── */
    sections.forEach(function (s, si) {
      var qsum = sum((s.questions || []).map(function (q) { return q.points; }));
      if (isNum(s.points) && !eq(s.points, qsum))
        out.push(err("sectionSumMismatch", "sections[" + si + "].points",
          "大問 " + (s.number || si + 1) + " の小計 " + s.points + " 点が、問題の合計 " + qsum + " 点と一致しません。"));
      /* 観点別小計 */
      if (Array.isArray(s.criterionAllocation) && s.criterionAllocation.length) {
        var csum = sum(s.criterionAllocation.map(function (a) { return a.points; }));
        if (!eq(csum, qsum))
          out.push(err("sectionCriterionMismatch", "sections[" + si + "].criterionAllocation",
            "大問 " + (s.number || si + 1) + " の観点別合計 " + csum + " 点が、問題の合計 " + qsum + " 点と一致しません。"));
      }
    });

    var total = sum(allQ.map(function (x) { return x.q.points; }));
    if (isNum(spec.totalPoints) && !eq(total, spec.totalPoints))
      out.push(err("totalScoreMismatch", "totalPoints",
        "配点の合計が " + total + " 点で、指定された満点 " + spec.totalPoints + " 点と一致しません。"));

    /* 試験全体の観点別合計 */
    var byCriterion = Object.create(null);
    allQ.forEach(function (x) {
      (x.q.criterionAllocation || []).forEach(function (a) {
        byCriterion[a.criterionId] = (byCriterion[a.criterionId] || 0) + (isNum(a.points) ? a.points : 0);
      });
    });
    var critTotal = sum(Object.keys(byCriterion).map(function (k) { return byCriterion[k]; }));
    if (critTotal > 0 && !eq(critTotal, total))
      out.push(err("criterionTotalMismatch", "criterionAllocation",
        "観点別配点の総和 " + critTotal + " 点が、配点の合計 " + total + " 点と一致しません。"));

    /* ── 試験時間と問題量（断定できないので参考として出す） ── */
    var estSec = sum(allQ.map(function (x) { return isNum(x.q.estimatedSeconds) ? x.q.estimatedSeconds : 0; }));
    if (estSec > 0 && isNum(spec.durationMinutes)) {
      var estMin = Math.round(estSec / 60);
      if (estMin > spec.durationMinutes * 1.25)
        out.push(warn("durationTight", "durationMinutes",
          "想定所要時間の目安 " + estMin + " 分に対し、試験時間は " + spec.durationMinutes + " 分です。問題量が多い可能性があります。"));
      else if (estMin > 0 && estMin < spec.durationMinutes * 0.5)
        out.push(info("durationLoose", "durationMinutes",
          "想定所要時間の目安 " + estMin + " 分に対し、試験時間は " + spec.durationMinutes + " 分です。余裕があります。"));
    }

    return out;
  }

  /* 番号列に欠番・重複が無いか。1 から始まる連番であることを期待する。 */
  function checkNumbering(numbers, path, label, out) {
    var nums = (numbers || []).filter(isNum).slice().sort(function (a, b) { return a - b; });
    if (!nums.length) return;
    var seen = Object.create(null), dup = [];
    nums.forEach(function (n) { if (seen[n]) dup.push(n); seen[n] = true; });
    dup.forEach(function (n) { out.push(err("duplicateNumber", path, label + " " + n + " が重複しています。")); });
    var missing = [];
    for (var i = 1; i <= nums[nums.length - 1]; i++) if (!seen[i]) missing.push(i);
    if (missing.length)
      out.push(err("missingNumber", path, label + "に欠番があります: " + missing.join(", ")));
  }

  /* ══════════════════════════════════════════════════════════════════
     判定ヘルパ
     ══════════════════════════════════════════════════════════════════ */
  function errorsOf(issues) { return (issues || []).filter(function (i) { return i.severity === "error"; }); }
  function warningsOf(issues) { return (issues || []).filter(function (i) { return i.severity === "warning"; }); }
  function canSave(issues) { return errorsOf(issues).length === 0; }

  /* 利用者に見せる短い要約。内部コードは出さない。 */
  function summarize(issues) {
    var e = errorsOf(issues).length, w = warningsOf(issues).length;
    if (!e && !w) return "問題は見つかりませんでした。";
    var parts = [];
    if (e) parts.push("修正が必要な項目 " + e + " 件");
    if (w) parts.push("確認したい項目 " + w + " 件");
    return parts.join(" / ");
  }

  VQ2.validate = {
    validatePresetForSave: validatePresetForSave,
    validateMockSpecForSave: validateMockSpecForSave,
    checkQuestionRules: checkQuestionRules,
    findDuplicateIds: findDuplicateIds,
    checkNumbering: checkNumbering,
    errorsOf: errorsOf,
    warningsOf: warningsOf,
    canSave: canSave,
    summarize: summarize
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
