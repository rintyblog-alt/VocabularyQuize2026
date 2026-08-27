/* ══════════════════════════════════════════════════════════════════════
   採点エンジン（§8 / §25）
   ・客観問題は必ず決定論的コードで採点する。AI に採点させない。
   ・記述問題だけを AI 補助採点へ回す。低信頼の採点は自動確定しない。
   ・答案の正規化（全角半角・大小文字・空白・句読点）はここに集約する。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var S = VQ2.schema;
  if (!S) throw new Error("VQ2.schema must be loaded before grading.js");

  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function isStr(v) { return typeof v === "string"; }

  /* ══════════════════════════════════════════════════════════════════
     答案の正規化
     ・既定は「前後の空白を落とす」「全角英数を半角へ」「大小文字を無視」。
     ・数値問題は別扱い（許容誤差つきの数値比較）。
     ══════════════════════════════════════════════════════════════════ */
  var DEFAULT_NORM = {
    trim: true, collapseSpace: true, caseInsensitive: true,
    fullwidthToHalfwidth: true, ignorePunctuation: false, ignoreSpace: false
  };

  function toHalfwidth(s) {
    return s
      .replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/　/g, " ")                       /* 全角空白 → 半角 */
      .replace(/[−ー―‐]/g, "-");                     /* 各種ダッシュ → ハイフン */
  }

  function normalizeAnswer(text, rule) {
    var r = Object.assign({}, DEFAULT_NORM, rule || {});
    var s = isStr(text) ? text : (text == null ? "" : String(text));
    if (r.fullwidthToHalfwidth) s = toHalfwidth(s);
    if (r.ignorePunctuation) s = s.replace(/[、。，．,.・・!！?？「」『』（）()\[\]【】]/g, "");
    if (r.ignoreSpace) s = s.replace(/\s+/g, "");
    else if (r.collapseSpace) s = s.replace(/\s+/g, " ");
    if (r.trim) s = s.trim();
    if (r.caseInsensitive) s = s.toLowerCase();
    return s;
  }

  /* 数値の取り出し。「約3.14」「3,000円」なども拾う。 */
  function parseNumber(text) {
    if (isNum(text)) return text;
    var s = toHalfwidth(String(text == null ? "" : text)).replace(/,/g, "");
    var m = s.match(/-?\d+(\.\d+)?([eE][-+]?\d+)?/);
    if (!m) return null;
    var n = Number(m[0]);
    return isFinite(n) ? n : null;
  }

  /* ══════════════════════════════════════════════════════════════════
     形式ごとの決定論的採点
     戻り値: { correct, score, maxScore, method, detail }
     ・部分点は「複数選択」「並び替え」「組み合わせ」「空欄補充」で扱う。
     ══════════════════════════════════════════════════════════════════ */
  function gradeDeterministic(question, answer) {
    var max = isNum(question.points) ? question.points : 1;
    var type = question.type;
    var norm = question.answerNormalization || null;

    switch (type) {
      case "multiple_choice_single":
      case "true_false": {
        var picked = firstId(answer);
        var correctIds = correctChoiceIds(question);
        var ok = picked !== null && correctIds.indexOf(picked) >= 0;
        return mk(ok, ok ? max : 0, max, "choice", { picked: picked, expected: correctIds });
      }
      case "multiple_choice_multiple": {
        var got = idList(answer);
        var want = correctChoiceIds(question);
        var all = (question.choices || []).map(function (c) { return c.id; });
        /* 部分点：正しく選んだ数 − 誤って選んだ数（下限 0）を、正解数で割る。 */
        var hit = got.filter(function (g) { return want.indexOf(g) >= 0; }).length;
        var miss = got.filter(function (g) { return want.indexOf(g) < 0 && all.indexOf(g) >= 0; }).length;
        var ratio = want.length ? Math.max(0, (hit - miss)) / want.length : 0;
        var exact = hit === want.length && miss === 0 && got.length === want.length;
        return mk(exact, roundScore(max * ratio), max, "choice-multi",
          { picked: got, expected: want, hit: hit, miss: miss, partial: !exact && ratio > 0 });
      }
      case "short_answer": {
        var a = normalizeAnswer(textOf(answer), norm);
        var accepted = acceptedList(question).map(function (x) { return normalizeAnswer(x, norm); });
        var ok2 = a.length > 0 && accepted.indexOf(a) >= 0;
        return mk(ok2, ok2 ? max : 0, max, "exact", { normalized: a, accepted: accepted });
      }
      case "numeric": {
        var n = parseNumber(textOf(answer));
        var expected = parseNumber(question.correctAnswer);
        if (expected === null) return mk(false, 0, max, "numeric", { error: "正解が数値ではありません。" });
        if (n === null) return mk(false, 0, max, "numeric", { error: "回答が数値ではありません。" });
        var tol = isNum(question.tolerance) ? question.tolerance : 0;
        var ok3 = Math.abs(n - expected) <= tol + 1e-9;
        return mk(ok3, ok3 ? max : 0, max, "numeric", { value: n, expected: expected, tolerance: tol });
      }
      case "formula": {
        /* 数式は定義済みの同値表現の集合と照合する。記号処理はしない（できると偽らない）。 */
        var f = normalizeFormula(textOf(answer));
        var accF = acceptedList(question).map(normalizeFormula);
        var ok4 = f.length > 0 && accF.indexOf(f) >= 0;
        return mk(ok4, ok4 ? max : 0, max, "formula-equivalence", { normalized: f, accepted: accF });
      }
      case "fill_blank": {
        /* 空欄ごとに一致を見て、空欄数で割った部分点を出す。 */
        var blanks = Array.isArray(question.blanks) ? question.blanks : null;
        var given = Array.isArray(answer) ? answer : (answer && Array.isArray(answer.blanks) ? answer.blanks : [textOf(answer)]);
        if (!blanks) {
          var a2 = normalizeAnswer(textOf(answer), norm);
          var acc2 = acceptedList(question).map(function (x) { return normalizeAnswer(x, norm); });
          var ok5 = a2.length > 0 && acc2.indexOf(a2) >= 0;
          return mk(ok5, ok5 ? max : 0, max, "exact", { normalized: a2 });
        }
        var hits = 0;
        var per = blanks.map(function (b, i) {
          /* 別解を足しても、本来の正解は必ず受け付ける。
             acceptedAnswers を指定した瞬間に answer が無効になってはいけない。 */
          var want2 = [b.answer].concat(Array.isArray(b.acceptedAnswers) ? b.acceptedAnswers : [])
            .filter(function (x) { return x != null && String(x) !== ""; })
            .map(function (x) { return normalizeAnswer(x, norm); });
          var g = normalizeAnswer(given[i], norm);
          var hit2 = g.length > 0 && want2.indexOf(g) >= 0;
          if (hit2) hits++;
          return { index: i, given: g, correct: hit2 };
        });
        var exact2 = hits === blanks.length;
        return mk(exact2, roundScore(max * (blanks.length ? hits / blanks.length : 0)), max, "fill-blank",
          { blanks: per, hits: hits, total: blanks.length, partial: !exact2 && hits > 0 });
      }
      case "ordering": {
        var seq = idList(answer);
        var want3 = Array.isArray(question.correctAnswer) ? question.correctAnswer.map(String)
          : (question.choices || []).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); })
              .map(function (c) { return c.id; });
        /* 位置が合っている数で部分点を出す。 */
        var same = 0;
        for (var i = 0; i < want3.length; i++) if (seq[i] === want3[i]) same++;
        var exact3 = same === want3.length && seq.length === want3.length;
        return mk(exact3, roundScore(max * (want3.length ? same / want3.length : 0)), max, "ordering",
          { given: seq, expected: want3, correctPositions: same, partial: !exact3 && same > 0 });
      }
      case "matching": {
        /* answer: { leftId: rightId, ... } */
        var pairs = (answer && typeof answer === "object" && !Array.isArray(answer)) ? answer : {};
        var want4 = question.correctAnswer && typeof question.correctAnswer === "object" ? question.correctAnswer : {};
        var keys = Object.keys(want4);
        var hit3 = 0;
        var detail = keys.map(function (k) {
          var ok6 = String(pairs[k] || "") === String(want4[k]);
          if (ok6) hit3++;
          return { left: k, given: pairs[k] || null, expected: want4[k], correct: ok6 };
        });
        var exact4 = hit3 === keys.length;
        return mk(exact4, roundScore(max * (keys.length ? hit3 / keys.length : 0)), max, "matching",
          { pairs: detail, hits: hit3, total: keys.length, partial: !exact4 && hit3 > 0 });
      }
      default:
        return mk(false, 0, max, "not-deterministic", { reason: "この形式はコードで採点できません。" });
    }
  }

  function normalizeFormula(s) {
    return String(s == null ? "" : s)
      .replace(/\s+/g, "")
      .replace(/[＋]/g, "+").replace(/[－−]/g, "-")
      .replace(/[×＊]/g, "*").replace(/[÷／]/g, "/")
      .replace(/[（]/g, "(").replace(/[）]/g, ")")
      .replace(/[＝]/g, "=")
      .toLowerCase();
  }

  function mk(correct, score, maxScore, method, detail) {
    return { correct: !!correct, score: score, maxScore: maxScore, method: method, detail: detail || null };
  }
  function roundScore(v) { return Math.round(v * 100) / 100; }
  function textOf(answer) {
    if (answer == null) return "";
    if (isStr(answer)) return answer;
    if (isNum(answer)) return String(answer);
    if (answer.text !== undefined) return String(answer.text);
    if (answer.value !== undefined) return String(answer.value);
    return "";
  }
  function firstId(answer) {
    var l = idList(answer);
    return l.length ? l[0] : null;
  }
  function idList(answer) {
    if (answer == null) return [];
    if (Array.isArray(answer)) return answer.map(String).filter(Boolean);
    if (isStr(answer)) return answer ? [answer] : [];
    if (Array.isArray(answer.choiceIds)) return answer.choiceIds.map(String).filter(Boolean);
    if (answer.choiceId) return [String(answer.choiceId)];
    if (Array.isArray(answer.order)) return answer.order.map(String);
    return [];
  }
  function correctChoiceIds(q) {
    return (q.choices || []).filter(function (c) { return c && c.isCorrect === true; })
      .map(function (c) { return String(c.id); });
  }
  function acceptedList(q) {
    var out = [];
    if (q.correctAnswer != null && !Array.isArray(q.correctAnswer) && typeof q.correctAnswer !== "object")
      out.push(String(q.correctAnswer));
    if (Array.isArray(q.acceptedAnswers)) q.acceptedAnswers.forEach(function (a) { if (a != null) out.push(String(a)); });
    return out.filter(function (s) { return s.length > 0; });
  }

  /* 未回答かどうか。空文字・空配列・空オブジェクトはすべて未回答。 */
  function isUnanswered(answer) {
    if (answer === null || answer === undefined) return true;
    if (isStr(answer)) return answer.trim() === "";
    if (Array.isArray(answer)) return answer.length === 0 || answer.every(function (x) { return x == null || String(x).trim() === ""; });
    if (typeof answer === "object") {
      var t = textOf(answer);
      if (t.trim()) return false;
      if (idList(answer).length) return false;
      return Object.keys(answer).filter(function (k) { return answer[k] != null && String(answer[k]).trim() !== ""; }).length === 0;
    }
    return false;
  }

  /* ══════════════════════════════════════════════════════════════════
     セッション全体の採点
     ・決定論的に採点できるものはすべてここで確定する。
     ・AI 補助採点が必要なものは pendingAi として返し、採点は保留にする。
     ══════════════════════════════════════════════════════════════════ */
  function gradeSession(questions, answers, opts) {
    opts = opts || {};
    var byId = Object.create(null);
    (answers || []).forEach(function (a) { if (a && a.questionId) byId[a.questionId] = a; });

    var items = [], pendingAi = [];
    var totalScore = 0, totalMax = 0, correctCount = 0, wrongCount = 0, unansweredCount = 0;

    (questions || []).forEach(function (q) {
      var rec = byId[q.id] || null;
      var value = rec ? rec.value : null;
      var max = isNum(q.points) ? q.points : 1;
      totalMax += max;

      if (isUnanswered(value)) {
        unansweredCount++;
        items.push({
          questionId: q.id, type: q.type, answered: false, correct: false,
          score: 0, maxScore: max, method: "unanswered", detail: null,
          timeMs: rec ? rec.timeMs || 0 : 0, changeCount: rec ? rec.changeCount || 0 : 0,
          flagged: rec ? !!rec.flagged : false, requiresReview: false
        });
        return;
      }

      if (S.isDeterministic(q.type)) {
        var g = gradeDeterministic(q, value);
        totalScore += g.score;
        if (g.correct) correctCount++; else wrongCount++;
        items.push({
          questionId: q.id, type: q.type, answered: true, correct: g.correct,
          score: g.score, maxScore: g.maxScore, method: g.method, detail: g.detail,
          timeMs: rec ? rec.timeMs || 0 : 0, changeCount: rec ? rec.changeCount || 0 : 0,
          flagged: rec ? !!rec.flagged : false, requiresReview: false
        });
      } else {
        /* AI 補助採点が必要。ここでは点をつけない（未採点として持つ）。 */
        pendingAi.push({ question: q, answer: value, record: rec });
        items.push({
          questionId: q.id, type: q.type, answered: true, correct: null,
          score: null, maxScore: max, method: "pending-ai", detail: null,
          timeMs: rec ? rec.timeMs || 0 : 0, changeCount: rec ? rec.changeCount || 0 : 0,
          flagged: rec ? !!rec.flagged : false, requiresReview: true
        });
      }
    });

    return {
      items: items,
      pendingAi: pendingAi,
      deterministicScore: roundScore(totalScore),
      totalMax: totalMax,
      correctCount: correctCount,
      wrongCount: wrongCount,
      unansweredCount: unansweredCount,
      pendingCount: pendingAi.length,
      complete: pendingAi.length === 0
    };
  }

  /* ══════════════════════════════════════════════════════════════════
     AI 補助採点の結果を取り込む（§25）
     ・confidence が閾値未満のものは自動確定しない。requiresReview を立てる。
     ・得点は Rubric の内訳と必ず一致させる（AI の合計を信用しない）。
     ══════════════════════════════════════════════════════════════════ */
  var AI_CONFIDENCE_THRESHOLD = 0.7;

  function applyAiGrade(item, question, aiResult, opts) {
    opts = opts || {};
    var threshold = isNum(opts.confidenceThreshold) ? opts.confidenceThreshold : AI_CONFIDENCE_THRESHOLD;
    var max = isNum(question.points) ? question.points : (item ? item.maxScore : 1);
    var issues = [];

    var breakdown = Array.isArray(aiResult && aiResult.rubricBreakdown) ? aiResult.rubricBreakdown : [];
    var rubricItems = (question.scoringRubric && Array.isArray(question.scoringRubric.items))
      ? question.scoringRubric.items : [];

    /* Rubric があるなら、内訳の合計を正とする。AI が出した score は使わない。 */
    var score;
    if (rubricItems.length && breakdown.length) {
      var byRid = Object.create(null);
      rubricItems.forEach(function (r) { byRid[r.id] = r; });
      var acc = 0;
      breakdown = breakdown.map(function (b) {
        var r = byRid[b.rubricItemId];
        var cap = r && isNum(r.points) ? r.points : max;
        var v = isNum(b.awarded) ? Math.max(0, Math.min(cap, b.awarded)) : 0;
        if (isNum(b.awarded) && b.awarded !== v)
          issues.push("採点基準「" + (r ? r.description : b.rubricItemId) + "」の配点上限を超えていたため、" + cap + " 点に補正しました。");
        acc += v;
        return { rubricItemId: b.rubricItemId, awarded: v, maxPoints: cap, reason: String(b.reason || "").slice(0, 400) };
      });
      score = Math.min(max, roundScore(acc));
      if (isNum(aiResult.score) && Math.abs(aiResult.score - score) > 0.01)
        issues.push("採点基準の内訳の合計（" + score + " 点）を採用しました。");
    } else {
      score = isNum(aiResult && aiResult.score) ? Math.max(0, Math.min(max, aiResult.score)) : 0;
      if (!rubricItems.length) issues.push("採点基準が無いため、根拠を細かく示せません。");
    }

    var confidence = isNum(aiResult && aiResult.confidence) ? aiResult.confidence : 0;
    var needsReview = confidence < threshold || aiResult.requiresReview === true || issues.length > 0;

    return {
      questionId: question.id,
      score: score,
      maxScore: max,
      correct: max > 0 ? (score >= max - 1e-9) : null,
      method: "ai-assisted",
      rubricBreakdown: breakdown,
      scoringReason: String((aiResult && aiResult.scoringReason) || "").slice(0, 1500),
      strengths: arr(aiResult && aiResult.strengths),
      missingElements: arr(aiResult && aiResult.missingElements),
      expressionIssues: arr(aiResult && aiResult.expressionIssues),
      modelAnswerDifference: String((aiResult && aiResult.modelAnswerDifference) || "").slice(0, 1000),
      confidence: confidence,
      requiresReview: needsReview,
      autoConfirmed: !needsReview,
      adjustments: issues
    };
  }
  function arr(v) { return Array.isArray(v) ? v.map(function (x) { return String(x).slice(0, 300); }).slice(0, 10) : []; }

  /* 採点者による得点の手直し。履歴を必ず残す。 */
  function overrideScore(item, newScore, reason, byWho) {
    var max = item.maxScore;
    var v = Math.max(0, Math.min(max, isNum(newScore) ? newScore : 0));
    item.history = item.history || [];
    item.history.push({
      at: S.nowIso(), from: item.score, to: v,
      reason: String(reason || "").slice(0, 500), by: byWho || "user"
    });
    item.score = v;
    item.correct = max > 0 ? (v >= max - 1e-9) : null;
    item.requiresReview = false;
    item.overridden = true;
    return item;
  }

  /* ══════════════════════════════════════════════════════════════════
     集計（観点別・大問別・単元別・形式別・難易度別）
     ══════════════════════════════════════════════════════════════════ */
  function aggregate(questions, items, opts) {
    opts = opts || {};
    var byId = Object.create(null);
    items.forEach(function (i) { byId[i.questionId] = i; });

    function bucket() { return { score: 0, max: 0, correct: 0, wrong: 0, unanswered: 0, count: 0, timeMs: 0 }; }
    function add(b, q, it) {
      b.count++;
      b.max += isNum(it.maxScore) ? it.maxScore : 0;
      b.score += isNum(it.score) ? it.score : 0;
      b.timeMs += it.timeMs || 0;
      if (!it.answered) b.unanswered++;
      else if (it.correct === true) b.correct++;
      else if (it.correct === false) b.wrong++;
    }

    var byCriterion = Object.create(null);
    S.CRITERION_IDS.forEach(function (c) { byCriterion[c] = { score: 0, max: 0 }; });
    var byTopic = Object.create(null), byType = Object.create(null),
        byDifficulty = Object.create(null), bySection = Object.create(null);
    var total = bucket();

    questions.forEach(function (q) {
      var it = byId[q.id];
      if (!it) return;
      add(total, q, it);
      var topic = q.topic || "（未分類）";
      (byTopic[topic] || (byTopic[topic] = bucket()), add(byTopic[topic], q, it));
      (byType[q.type] || (byType[q.type] = bucket()), add(byType[q.type], q, it));
      var d = q.difficulty || "normal";
      (byDifficulty[d] || (byDifficulty[d] = bucket()), add(byDifficulty[d], q, it));
      if (q.sectionId) { (bySection[q.sectionId] || (bySection[q.sectionId] = bucket()), add(bySection[q.sectionId], q, it)); }

      /* 観点別：問題の得点率を、観点別配点へ按分する。 */
      var alloc = Array.isArray(q.criterionAllocation) ? q.criterionAllocation : null;
      if (alloc && alloc.length) {
        var ratio = (isNum(it.score) && isNum(it.maxScore) && it.maxScore > 0) ? it.score / it.maxScore : 0;
        alloc.forEach(function (a) {
          if (!byCriterion[a.criterionId]) byCriterion[a.criterionId] = { score: 0, max: 0 };
          byCriterion[a.criterionId].max += isNum(a.points) ? a.points : 0;
          byCriterion[a.criterionId].score += (isNum(a.points) ? a.points : 0) * ratio;
        });
      }
    });

    Object.keys(byCriterion).forEach(function (k) {
      byCriterion[k].score = roundScore(byCriterion[k].score);
      byCriterion[k].label = S.criterionLabel(k);
      byCriterion[k].rate = byCriterion[k].max > 0 ? byCriterion[k].score / byCriterion[k].max : null;
    });
    [byTopic, byType, byDifficulty, bySection].forEach(function (m) {
      Object.keys(m).forEach(function (k) {
        m[k].score = roundScore(m[k].score);
        m[k].rate = m[k].max > 0 ? m[k].score / m[k].max : null;
        m[k].accuracy = m[k].count > 0 ? m[k].correct / m[k].count : null;
      });
    });
    total.score = roundScore(total.score);
    total.rate = total.max > 0 ? total.score / total.max : null;
    total.accuracy = total.count > 0 ? total.correct / total.count : null;

    return {
      total: total, byCriterion: byCriterion, byTopic: byTopic,
      byType: byType, byDifficulty: byDifficulty, bySection: bySection
    };
  }

  /* ══════════════════════════════════════════════════════════════════
     行動の観測（§26 参考分析）
     ・「主体的に学習に取り組む態度」を得点化しない。観測できた事実だけを返す。
     ══════════════════════════════════════════════════════════════════ */
  function behaviorSignals(questions, items) {
    var timed = items.filter(function (i) { return i.timeMs > 0; });
    var times = timed.map(function (i) { return i.timeMs; }).sort(function (a, b) { return a - b; });
    var median = times.length ? times[Math.floor(times.length / 2)] : 0;

    var slowWrong = [], fastWrong = [], changed = [], revisited = [], unanswered = [];
    items.forEach(function (i) {
      if (!i.answered) { unanswered.push(i.questionId); return; }
      if (i.changeCount > 0) changed.push({ questionId: i.questionId, changeCount: i.changeCount, correct: i.correct });
      if (i.visitCount > 1) revisited.push({ questionId: i.questionId, visitCount: i.visitCount });
      if (i.correct === false && median > 0) {
        if (i.timeMs > median * 2) slowWrong.push({ questionId: i.questionId, timeMs: i.timeMs });
        else if (i.timeMs < median * 0.4) fastWrong.push({ questionId: i.questionId, timeMs: i.timeMs });
      }
    });
    return {
      medianTimeMs: median,
      totalTimeMs: items.reduce(function (a, i) { return a + (i.timeMs || 0); }, 0),
      slowAndWrong: slowWrong,
      fastAndWrong: fastWrong,
      answerChanged: changed,
      revisited: revisited,
      unanswered: unanswered,
      /* 断定はしない。観測できた件数だけを持つ。 */
      note: "これらは答案から観測できた事実です。学習態度の評価ではありません。"
    };
  }

  VQ2.grading = {
    DEFAULT_NORM: DEFAULT_NORM,
    AI_CONFIDENCE_THRESHOLD: AI_CONFIDENCE_THRESHOLD,
    normalizeAnswer: normalizeAnswer,
    normalizeFormula: normalizeFormula,
    parseNumber: parseNumber,
    toHalfwidth: toHalfwidth,
    isUnanswered: isUnanswered,
    gradeDeterministic: gradeDeterministic,
    gradeSession: gradeSession,
    applyAiGrade: applyAiGrade,
    overrideScore: overrideScore,
    aggregate: aggregate,
    behaviorSignals: behaviorSignals
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
