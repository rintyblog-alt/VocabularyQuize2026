/* ══════════════════════════════════════════════════════════════════════
   Answer Evaluator（V3 §9）
   ・採点は画面コンポーネントへ書かない。すべてここを通す。
   ・振り分けは「形式」ではなく **エンジン** で行う。だから形式が 130 あっても
     採点の実装は 20 個で足りる。
   ・既存の選択式・並べ替え・組み合わせは grading.js へ委譲する。
     同じ答案で結果が変わってはいけないため、書き直さない。
   ・AI 採点は「点を付けない」で返す。失敗や低信頼を 0 点にも満点にもしない（§10）。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var S = VQ2.schema, G = VQ2.grading, Q = VQ2.qtypes, M = VQ2.qmodel;
  if (!S || !G) throw new Error("VQ2.schema / grading must be loaded before evaluator.js");
  if (!Q || !M) throw new Error("VQ2.qtypes / qmodel must be loaded before evaluator.js");

  function isStr(v) { return typeof v === "string"; }
  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function isObj(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function str(v) { return v === undefined || v === null ? "" : String(v); }
  function r2(v) { return Math.round(v * 100) / 100; }
  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  /* ══════════════════════════════════════════════════════════════════
     正規化
     ・grading.js の正規化を土台に、かな・漢字・記号の扱いを足す。
     ══════════════════════════════════════════════════════════════════ */
  function kataToHira(s) {
    return String(s).replace(/[ァ-ヶ]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); });
  }
  function hasKanji(s) { return /[一-鿿㐀-䶿]/.test(String(s)); }

  function ruleFor(question) {
    var sr = question && question.scoringRule ? question.scoringRule : {};
    var an = question && question.answerNormalization ? question.answerNormalization : {};
    return {
      mode: sr.mode || null,
      caseInsensitive: an.caseInsensitive !== undefined ? an.caseInsensitive : !sr.caseSensitive,
      trim: an.trim !== undefined ? an.trim : (sr.trimWhitespace !== false),
      collapseSpace: true,
      ignoreSpace: an.ignoreSpace !== undefined ? an.ignoreSpace : !!sr.ignoreSpace,
      ignorePunctuation: an.ignorePunctuation !== undefined ? an.ignorePunctuation : !!sr.ignorePunctuation,
      fullwidthToHalfwidth: an.fullwidthToHalfwidth !== undefined ? an.fullwidthToHalfwidth : (sr.fullwidthToHalfwidth !== false),
      kanaInsensitive: !!sr.kanaInsensitive,
      requireKanji: !!sr.requireKanji,
      keywords: arr(sr.keywords),
      keywordThreshold: isNum(sr.keywordThreshold) ? sr.keywordThreshold : null,
      tolerance: isNum(sr.tolerance) ? sr.tolerance : null,
      unit: str(sr.unit),
      unitRequired: !!sr.unitRequired,
      partialCredit: sr.partialCredit !== false,
      penaltyForWrong: isNum(sr.penaltyForWrong) ? sr.penaltyForWrong : 0
    };
  }

  function norm(text, rule) {
    var s = G.normalizeAnswer(text, {
      trim: rule.trim, collapseSpace: rule.collapseSpace,
      caseInsensitive: rule.caseInsensitive,
      fullwidthToHalfwidth: rule.fullwidthToHalfwidth,
      ignorePunctuation: rule.ignorePunctuation,
      ignoreSpace: rule.ignoreSpace
    });
    if (rule.kanaInsensitive) s = kataToHira(s);
    return s;
  }

  /* 編集距離（上限つき）。長すぎる文字列で固まらないよう 200 文字で打ち切る。 */
  function editDistance(a, b) {
    a = String(a).slice(0, 200); b = String(b).slice(0, 200);
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    var prev = new Array(b.length + 1), cur = new Array(b.length + 1), i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur[0] = i;
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
      }
      for (j = 0; j <= b.length; j++) prev[j] = cur[j];
    }
    return prev[b.length];
  }
  function similarity(a, b) {
    var m = Math.max(String(a).length, String(b).length);
    if (!m) return 1;
    return 1 - editDistance(a, b) / m;
  }

  /* 期待される答えの一覧（正解＋別解）。 */
  function expectedList(q) {
    var out = [];
    var ca = q.correctAnswer;
    if (ca != null && !Array.isArray(ca) && typeof ca !== "object" && str(ca) !== "") out.push(str(ca));
    arr(q.acceptedAnswers).forEach(function (a) { if (a != null && str(a) !== "") out.push(str(a)); });
    return out;
  }

  function textOf(answer) {
    if (answer == null) return "";
    if (isStr(answer)) return answer;
    if (isNum(answer)) return String(answer);
    if (isObj(answer)) {
      if (answer.text !== undefined) return str(answer.text);
      if (answer.value !== undefined) return str(answer.value);
    }
    return "";
  }

  /* ══════════════════════════════════════════════════════════════════
     未回答の判定（形式ごとに「空」の形が違う）
     ══════════════════════════════════════════════════════════════════ */
  function isUnanswered(question, answer) {
    var e = question && question.engine ? question.engine : Q.engineOf(question && question.type);
    if (answer == null) return true;
    switch (e) {
      case "classification":
        return !isObj(answer) || !isObj(answer.items)
          || Object.keys(answer.items).filter(function (k) { return str(answer.items[k]); }).length === 0;
      case "table_fill":
        return !isObj(answer) || !isObj(answer.cells)
          || Object.keys(answer.cells).filter(function (k) { return str(answer.cells[k]).trim(); }).length === 0;
      case "image_point":
        return !isObj(answer) || !arr(answer.points).length;
      case "image_label":
        return !isObj(answer) || !isObj(answer.slots)
          || Object.keys(answer.slots).filter(function (k) { return str(answer.slots[k]); }).length === 0;
      case "error_correction":
        if (isStr(answer)) return !answer.trim();
        return !isObj(answer) || !isObj(answer.spans)
          || Object.keys(answer.spans).filter(function (k) { return str(answer.spans[k]).trim(); }).length === 0;
      case "flashcard":
        return !isObj(answer) || !str(answer.mark);
      case "composite":
        return !isObj(answer) || !isObj(answer.children)
          || Object.keys(answer.children).length === 0;
      default:
        return G.isUnanswered(answer);
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     結果の入れ物
     ══════════════════════════════════════════════════════════════════ */
  function result(o) {
    var max = isNum(o.maxScore) ? o.maxScore : 0;
    var score = isNum(o.score) ? Math.max(0, Math.min(max, o.score)) : null;
    return {
      isCorrect: o.isCorrect === true ? true : (o.isCorrect === false ? false : null),
      /* 既存コードは correct を見る。両方持たせる。 */
      correct: o.isCorrect === true ? true : (o.isCorrect === false ? false : null),
      score: score === null ? null : r2(score),
      maxScore: max,
      partialCredit: o.partialCredit === true,
      normalizedAnswer: o.normalizedAnswer !== undefined ? o.normalizedAnswer : null,
      feedback: str(o.feedback),
      matchedCriteria: arr(o.matchedCriteria),
      missedCriteria: arr(o.missedCriteria),
      requiresManualReview: o.requiresManualReview === true,
      aiEvaluationId: o.aiEvaluationId || null,
      method: str(o.method),
      detail: o.detail || null
    };
  }

  /* ══════════════════════════════════════════════════════════════════
     エンジンごとの採点
     ══════════════════════════════════════════════════════════════════ */
  var ENGINE_EVAL = {};

  /* ── 選択系・並べ替え・組み合わせ：grading.js へ委譲 ────────────
     ここを書き直すと、いままでの答案の点が変わりうる。委譲でそろえる。 */
  function delegate(legacyType) {
    return function (q, answer, ctx) {
      var shim = Object.assign({}, q, { type: legacyType, points: ctx.max });
      var g = G.gradeDeterministic(shim, answer);
      return result({
        isCorrect: g.correct, score: g.score, maxScore: ctx.max,
        partialCredit: !!(g.detail && g.detail.partial),
        method: g.method, detail: g.detail,
        normalizedAnswer: g.detail && g.detail.normalized !== undefined ? g.detail.normalized : null
      });
    };
  }
  ENGINE_EVAL.single_choice = delegate("multiple_choice_single");
  ENGINE_EVAL.true_false    = delegate("true_false");
  ENGINE_EVAL.image_choice  = delegate("multiple_choice_single");
  ENGINE_EVAL.audio_choice  = delegate("multiple_choice_single");
  ENGINE_EVAL.multi_choice  = delegate("multiple_choice_multiple");
  ENGINE_EVAL.matching      = delegate("matching");

  ENGINE_EVAL.reorder = function (q, answer, ctx) {
    var want = arr(q.correctOrder).length ? arr(q.correctOrder).map(String)
             : (Array.isArray(q.correctAnswer) ? q.correctAnswer.map(String) : []);
    var given = Array.isArray(answer) ? answer.map(String)
              : (isObj(answer) && Array.isArray(answer.order) ? answer.order.map(String) : []);
    if (!want.length) return result({ isCorrect: false, score: 0, maxScore: ctx.max, method: "reorder", detail: { error: "正しい順序が設定されていません。" }, requiresManualReview: true });
    var same = 0;
    for (var i = 0; i < want.length; i++) if (given[i] === want[i]) same++;
    var exact = same === want.length && given.length === want.length;
    var ratio = want.length ? same / want.length : 0;
    var score = exact ? ctx.max : (ctx.rule.partialCredit ? ctx.max * ratio : 0);
    return result({
      isCorrect: exact, score: score, maxScore: ctx.max,
      partialCredit: !exact && score > 0,
      method: "ordering", normalizedAnswer: given,
      detail: { given: given, expected: want, correctPositions: same, total: want.length, partial: !exact && same > 0 }
    });
  };

  /* ── 文字入力 ─────────────────────────────────────────────────── */
  ENGINE_EVAL.text_input = function (q, answer, ctx) {
    var rule = ctx.rule;
    var raw = textOf(answer);
    var a = norm(raw, rule);
    var expected = expectedList(q);
    var exp = expected.map(function (x) { return norm(x, rule); });

    if (!expected.length && !rule.keywords.length) {
      return result({ isCorrect: null, score: null, maxScore: ctx.max, method: "no-answer-key",
                      requiresManualReview: true, feedback: "正解が設定されていないため、採点できません。",
                      normalizedAnswer: a });
    }
    if (!a) return result({ isCorrect: false, score: 0, maxScore: ctx.max, method: "exact", normalizedAnswer: a });

    /* 漢字で書く指定。かなだけの答えは正解にしない。 */
    if (rule.requireKanji && expected.some(hasKanji) && !hasKanji(raw)) {
      return result({ isCorrect: false, score: 0, maxScore: ctx.max, method: "kanji-required",
                      normalizedAnswer: a, feedback: "漢字で書いてください。",
                      detail: { accepted: exp, reason: "kanji-required" } });
    }

    var mode = rule.mode || "exact";
    var ok = false, method = mode, matched = [], missed = [], ratio = 0;

    if (mode === "keyword") {
      var kws = rule.keywords.length ? rule.keywords : expected;
      var need = isNum(rule.keywordThreshold) ? rule.keywordThreshold : kws.length;
      kws.forEach(function (k) {
        var nk = norm(k, rule);
        if (nk && a.indexOf(nk) >= 0) matched.push(k); else missed.push(k);
      });
      ratio = kws.length ? matched.length / kws.length : 0;
      ok = matched.length >= need;
      var scoreK = ok ? ctx.max : (rule.partialCredit ? ctx.max * ratio : 0);
      return result({ isCorrect: ok, score: scoreK, maxScore: ctx.max, partialCredit: !ok && scoreK > 0,
                      method: "keyword", normalizedAnswer: a,
                      matchedCriteria: matched, missedCriteria: missed,
                      detail: { keywords: kws, need: need, hit: matched.length } });
    }
    if (mode === "partial") {
      ok = exp.some(function (x) { return x && (a.indexOf(x) >= 0 || x.indexOf(a) >= 0); });
      method = "partial";
    } else if (mode === "fuzzy") {
      var best = 0;
      exp.forEach(function (x) { best = Math.max(best, similarity(a, x)); });
      ok = best >= 0.85;
      ratio = best;
      method = "fuzzy";
      if (!ok && rule.partialCredit && best >= 0.6) {
        return result({ isCorrect: false, score: ctx.max * (best - 0.6) / 0.4 * 0.5, maxScore: ctx.max,
                        partialCredit: true, method: "fuzzy", normalizedAnswer: a,
                        feedback: "おしいです。つづりを確かめてください。",
                        detail: { similarity: r2(best), accepted: exp } });
      }
    } else {
      ok = exp.indexOf(a) >= 0;
      method = "exact";
    }
    return result({ isCorrect: ok, score: ok ? ctx.max : 0, maxScore: ctx.max,
                    method: method, normalizedAnswer: a,
                    detail: { accepted: exp, similarity: ratio ? r2(ratio) : undefined } });
  };

  /* ── 数値入力 ─────────────────────────────────────────────────── */
  ENGINE_EVAL.numeric_input = function (q, answer, ctx) {
    var rule = ctx.rule;
    var raw = textOf(answer);
    var n = G.parseNumber(raw);
    var expected = G.parseNumber(q.correctAnswer);
    if (expected === null) {
      return result({ isCorrect: null, score: null, maxScore: ctx.max, method: "numeric",
                      requiresManualReview: true, feedback: "正解が数値ではないため、採点できません。" });
    }
    if (n === null) {
      return result({ isCorrect: false, score: 0, maxScore: ctx.max, method: "numeric",
                      normalizedAnswer: raw, feedback: "数で答えてください。",
                      detail: { error: "回答が数値ではありません。", expected: expected } });
    }
    var tol = isNum(rule.tolerance) ? rule.tolerance : 0;
    var ok = Math.abs(n - expected) <= tol + 1e-9;
    /* 単位が必須なら、単位の有無も見る（点は分けない。単位漏れは減点ではなく指摘）。 */
    var unitOk = true;
    if (rule.unit && rule.unitRequired) {
      unitOk = norm(raw, rule).indexOf(norm(rule.unit, rule)) >= 0;
    }
    var fb = "";
    if (ok && !unitOk) fb = "単位（" + rule.unit + "）も書いてください。";
    return result({
      isCorrect: ok && unitOk, score: (ok && unitOk) ? ctx.max : (ok ? ctx.max * 0.8 : 0),
      maxScore: ctx.max, partialCredit: ok && !unitOk,
      method: "numeric", normalizedAnswer: n, feedback: fb,
      detail: { value: n, expected: expected, tolerance: tol, unit: rule.unit, unitOk: unitOk }
    });
  };

  /* ── 穴埋め ───────────────────────────────────────────────────── */
  ENGINE_EVAL.fill_blank = function (q, answer, ctx) {
    var rule = ctx.rule;
    var blanks = arr(q.blanks);
    if (!blanks.length) {
      /* 空欄の定義が無い古いデータ。1 つの短答として扱う。 */
      return ENGINE_EVAL.text_input(q, answer, ctx);
    }
    var given = Array.isArray(answer) ? answer
      : (isObj(answer) && Array.isArray(answer.blanks) ? answer.blanks
      : (isObj(answer) && isObj(answer.byId) ? blanks.map(function (b) { return answer.byId[b.id]; })
      : [textOf(answer)]));

    /* 空欄ごとの配点。指定が無ければ均等割り。 */
    var weights = blanks.map(function (b) { return isNum(b.points) ? Math.max(0, b.points) : null; });
    var fixedSum = weights.reduce(function (a, w) { return a + (w === null ? 0 : w); }, 0);
    var freeCount = weights.filter(function (w) { return w === null; }).length;
    var freeEach = freeCount ? Math.max(0, ctx.max - fixedSum) / freeCount : 0;

    var earned = 0, hits = 0;
    var per = blanks.map(function (b, i) {
      var want = [b.answer].concat(arr(b.acceptedAnswers))
        .filter(function (x) { return x != null && str(x) !== ""; })
        .map(function (x) { return norm(x, rule); });
      var g = norm(given[i], rule);
      /* 選択式の空欄は、選択肢の ID で答えが来ることがある。 */
      if (arr(b.options).length && g) {
        var opt = arr(b.options).filter(function (o) { return String(o.id) === str(given[i]); })[0];
        if (opt) g = norm(opt.text, rule);
      }
      var w = weights[i] === null ? freeEach : weights[i];
      var ok = g.length > 0 && want.indexOf(g) >= 0;
      if (ok) { hits++; earned += w; }
      return { index: i, id: b.id, label: b.label, given: g, expected: want, correct: ok, points: r2(w) };
    });
    var exact = hits === blanks.length;
    var score = exact ? ctx.max : (rule.partialCredit ? earned : 0);
    return result({
      isCorrect: exact, score: score, maxScore: ctx.max, partialCredit: !exact && score > 0,
      method: "fill-blank", normalizedAnswer: per.map(function (p) { return p.given; }),
      detail: { blanks: per, hits: hits, total: blanks.length, partial: !exact && hits > 0 }
    });
  };

  /* ── 分類 ─────────────────────────────────────────────────────── */
  ENGINE_EVAL.classification = function (q, answer, ctx) {
    var c = q.classification || { groups: [], items: [] };
    var items = arr(c.items);
    if (!items.length) return result({ isCorrect: null, score: null, maxScore: ctx.max,
                                       method: "classification", requiresManualReview: true,
                                       feedback: "分ける項目が設定されていません。" });
    var given = (isObj(answer) && isObj(answer.items)) ? answer.items : {};
    var hits = 0;
    var per = items.map(function (it) {
      var g = str(given[it.id]);
      var ok = !!g && g === str(it.groupId);
      if (ok) hits++;
      return { itemId: it.id, text: it.text, given: g || null, expected: it.groupId, correct: ok };
    });
    var exact = hits === items.length;
    var ratio = items.length ? hits / items.length : 0;
    var score = exact ? ctx.max : (ctx.rule.partialCredit ? ctx.max * ratio : 0);
    return result({
      isCorrect: exact, score: score, maxScore: ctx.max, partialCredit: !exact && score > 0,
      method: "classification", normalizedAnswer: given,
      detail: { items: per, hits: hits, total: items.length, partial: !exact && hits > 0 }
    });
  };

  /* ── 表の完成 ─────────────────────────────────────────────────── */
  ENGINE_EVAL.table_fill = function (q, answer, ctx) {
    var rule = ctx.rule;
    var cells = [];
    arr(q.table && q.table.rows).forEach(function (r) {
      arr(r.cells).forEach(function (cell) { if (cell.editable) cells.push({ cell: cell, rowId: r.id }); });
    });
    if (!cells.length) return result({ isCorrect: null, score: null, maxScore: ctx.max,
                                       method: "table-fill", requiresManualReview: true,
                                       feedback: "埋めるますが設定されていません。" });
    var given = (isObj(answer) && isObj(answer.cells)) ? answer.cells : {};
    var weights = cells.map(function (x) { return isNum(x.cell.points) ? Math.max(0, x.cell.points) : null; });
    var fixedSum = weights.reduce(function (a, w) { return a + (w === null ? 0 : w); }, 0);
    var freeCount = weights.filter(function (w) { return w === null; }).length;
    var freeEach = freeCount ? Math.max(0, ctx.max - fixedSum) / freeCount : 0;

    var hits = 0, earned = 0;
    var per = cells.map(function (x, i) {
      var cell = x.cell;
      var want = [cell.answer].concat(arr(cell.acceptedAnswers))
        .filter(function (v) { return v != null && str(v) !== ""; })
        .map(function (v) { return norm(v, rule); });
      var gRaw = given[cell.id];
      var g = norm(gRaw, rule);
      if (arr(cell.options).length && g) {
        var opt = arr(cell.options).filter(function (o) { return String(o.id) === str(gRaw); })[0];
        if (opt) g = norm(opt.text, rule);
      }
      var w = weights[i] === null ? freeEach : weights[i];
      var ok = g.length > 0 && want.indexOf(g) >= 0;
      if (ok) { hits++; earned += w; }
      return { cellId: cell.id, rowId: x.rowId, given: g, expected: want, correct: ok, points: r2(w) };
    });
    var exact = hits === cells.length;
    var score = exact ? ctx.max : (rule.partialCredit ? earned : 0);
    return result({
      isCorrect: exact, score: score, maxScore: ctx.max, partialCredit: !exact && score > 0,
      method: "table-fill", normalizedAnswer: given,
      detail: { cells: per, hits: hits, total: cells.length, partial: !exact && hits > 0 }
    });
  };

  /* ── 画像内の位置 ─────────────────────────────────────────────── */
  function pointInHotspot(p, h) {
    var tol = isNum(h.tolerance) ? h.tolerance : 0.05;
    if (h.shape === "rect") {
      return p.x >= h.x - tol && p.x <= h.x + h.width + tol
          && p.y >= h.y - tol && p.y <= h.y + h.height + tol;
    }
    if (h.shape === "poly") {
      var pts = arr(h.points);
      if (pts.length < 3) return false;
      var inside = false;
      for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        var xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
        var hit = ((yi > p.y) !== (yj > p.y)) && (p.x < (xj - xi) * (p.y - yi) / ((yj - yi) || 1e-9) + xi);
        if (hit) inside = !inside;
      }
      return inside;
    }
    var r = isNum(h.r) ? h.r : tol;
    var dx = p.x - h.x, dy = p.y - h.y;
    return Math.sqrt(dx * dx + dy * dy) <= r + 1e-9;
  }

  ENGINE_EVAL.image_point = function (q, answer, ctx) {
    var spots = arr(q.hotspots).filter(function (h) { return h.isCorrect !== false; });
    if (!spots.length) return result({ isCorrect: null, score: null, maxScore: ctx.max,
                                       method: "image-point", requiresManualReview: true,
                                       feedback: "正解の場所が設定されていません。" });
    var pts = (isObj(answer) && arr(answer.points).length) ? arr(answer.points) : [];
    pts = pts.map(function (p) { return { x: Number(p.x), y: Number(p.y) }; })
             .filter(function (p) { return isNum(p.x) && isNum(p.y); });

    var usedSpot = Object.create(null), hits = 0, wrong = 0;
    var perPoint = pts.map(function (p) {
      var found = null;
      for (var i = 0; i < spots.length; i++) {
        if (usedSpot[spots[i].id]) continue;
        if (pointInHotspot(p, spots[i])) { found = spots[i]; break; }
      }
      if (found) { usedSpot[found.id] = 1; hits++; return { point: p, hotspotId: found.id, correct: true }; }
      wrong++;
      return { point: p, hotspotId: null, correct: false };
    });
    var multi = spots.length > 1 || (q.settings && q.settings.multiPoint);
    var exact = hits === spots.length && wrong === 0;
    var score;
    if (!multi) score = hits > 0 ? ctx.max : 0;
    else if (exact) score = ctx.max;
    else if (ctx.rule.partialCredit) score = ctx.max * clamp01((hits - wrong * ctx.rule.penaltyForWrong) / spots.length);
    else score = 0;
    return result({
      isCorrect: exact, score: score, maxScore: ctx.max, partialCredit: !exact && score > 0,
      method: "image-point", normalizedAnswer: pts,
      detail: { points: perPoint, hits: hits, wrong: wrong, total: spots.length,
                hotspots: spots.map(function (h) { return { id: h.id, label: h.label, found: !!usedSpot[h.id] }; }),
                partial: !exact && hits > 0 }
    });
  };

  /* ── 図へのラベル配置 ─────────────────────────────────────────── */
  ENGINE_EVAL.image_label = function (q, answer, ctx) {
    var slots = arr(q.labels && q.labels.slots);
    if (!slots.length) return result({ isCorrect: null, score: null, maxScore: ctx.max,
                                       method: "image-label", requiresManualReview: true,
                                       feedback: "ラベルを置く場所が設定されていません。" });
    var given = (isObj(answer) && isObj(answer.slots)) ? answer.slots : {};
    var hits = 0;
    var per = slots.map(function (s) {
      var g = str(given[s.id]);
      var ok = !!g && g === str(s.answerId);
      if (ok) hits++;
      return { slotId: s.id, given: g || null, expected: s.answerId, correct: ok };
    });
    var exact = hits === slots.length;
    var score = exact ? ctx.max : (ctx.rule.partialCredit ? ctx.max * (hits / slots.length) : 0);
    return result({
      isCorrect: exact, score: score, maxScore: ctx.max, partialCredit: !exact && score > 0,
      method: "image-label", normalizedAnswer: given,
      detail: { slots: per, hits: hits, total: slots.length, partial: !exact && hits > 0 }
    });
  };

  /* ── 図表の読み取り：答え方に応じて振り分ける ─────────────────── */
  ENGINE_EVAL.chart_read = function (q, answer, ctx) {
    if (arr(q.choices).length) return ENGINE_EVAL.single_choice(q, answer, ctx);
    return ENGINE_EVAL.numeric_input(q, answer, ctx);
  };

  /* ── ディクテーション：語ごとの部分点 ─────────────────────────── */
  function tokenize(s) {
    var t = String(s).trim();
    if (!t) return [];
    if (/[぀-ヿ一-鿿]/.test(t) && !/\s/.test(t)) return t.split("");
    return t.split(/\s+/).filter(Boolean);
  }
  ENGINE_EVAL.dictation = function (q, answer, ctx) {
    var rule = ctx.rule;
    var expectedRaw = str(q.correctAnswer);
    if (!expectedRaw) return result({ isCorrect: null, score: null, maxScore: ctx.max,
                                      method: "dictation", requiresManualReview: true,
                                      feedback: "書き取る正しい文が設定されていません。" });
    var want = tokenize(norm(expectedRaw, rule));
    var got = tokenize(norm(textOf(answer), rule));
    /* 最長共通部分列で、順序を保った一致数を数える。 */
    var n = want.length, m = got.length;
    var dp = [];
    for (var i = 0; i <= n; i++) { dp.push(new Array(m + 1).fill(0)); }
    for (i = 1; i <= n; i++) {
      for (var j = 1; j <= m; j++) {
        dp[i][j] = want[i - 1] === got[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
    var lcs = dp[n][m];
    var exact = lcs === n && m === n;
    var ratio = n ? lcs / n : 0;
    var score = exact ? ctx.max : (rule.partialCredit ? ctx.max * ratio : 0);
    /* どの語が抜けたかを返す。「不正解」だけでは直せない。 */
    var missing = [], k = 0;
    want.forEach(function (w) {
      var at = got.indexOf(w, k);
      if (at >= 0) k = at + 1; else missing.push(w);
    });
    return result({
      isCorrect: exact, score: score, maxScore: ctx.max, partialCredit: !exact && score > 0,
      method: "dictation", normalizedAnswer: got.join(" "),
      missedCriteria: missing.slice(0, 20),
      detail: { expected: want, given: got, matched: lcs, total: n, missing: missing, partial: !exact && lcs > 0 }
    });
  };

  /* ── 誤文訂正 ─────────────────────────────────────────────────── */
  ENGINE_EVAL.error_correction = function (q, answer, ctx) {
    var rule = ctx.rule;
    var spans = arr(q.errorSpans);
    if (!spans.length) return result({ isCorrect: null, score: null, maxScore: ctx.max,
                                       method: "error-correction", requiresManualReview: true,
                                       feedback: "どこが誤りかが設定されていません。" });
    var given = isObj(answer) && isObj(answer.spans) ? answer.spans : {};
    /* 1 か所だけのときは、文字列 1 本でも受け取る。 */
    if (isStr(answer) && spans.length === 1) { given = {}; given[spans[0].id] = answer; }

    var each = ctx.max / spans.length;
    var hits = 0;
    var per = spans.map(function (sp) {
      var want = [sp.correct].concat(arr(sp.acceptedAnswers))
        .filter(function (v) { return v != null && str(v) !== ""; })
        .map(function (v) { return norm(v, rule); });
      var g = norm(given[sp.id], rule);
      var ok = g.length > 0 && want.indexOf(g) >= 0;
      if (ok) hits++;
      return { spanId: sp.id, wrong: sp.wrong, given: g, expected: want, correct: ok, points: r2(each) };
    });
    var exact = hits === spans.length;
    var score = exact ? ctx.max : (rule.partialCredit ? each * hits : 0);
    return result({
      isCorrect: exact, score: score, maxScore: ctx.max, partialCredit: !exact && score > 0,
      method: "error-correction", normalizedAnswer: given,
      detail: { spans: per, hits: hits, total: spans.length, partial: !exact && hits > 0 }
    });
  };

  /* ── 記述：AI 補助採点へ回す。ここでは点を付けない ─────────────── */
  ENGINE_EVAL.free_text = function (q, answer, ctx) {
    var aiOn = !(q.settings && q.settings.aiGrading === false);
    var text = textOf(answer);

    /* 抜き出し問題など、コードで測れると決めた記述はここで確定させる。 */
    if (!aiOn) return ENGINE_EVAL.text_input(q, answer, ctx);

    /* 字数の条件はコードで測れる。満たしていないことは先に伝える。 */
    var st = q.settings || {};
    var notes = [];
    if (isNum(st.minLength) && text.length && text.length < st.minLength)
      notes.push(st.minLength + " 文字以上で書く条件です（いまは " + text.length + " 文字）。");
    if (isNum(st.maxLength) && text.length > st.maxLength)
      notes.push(st.maxLength + " 文字以内で書く条件です（いまは " + text.length + " 文字）。");

    return result({
      isCorrect: null, score: null, maxScore: ctx.max,
      method: "pending-ai", requiresManualReview: true,
      normalizedAnswer: text,
      feedback: notes.join(" "),
      detail: { length: text.length, minLength: st.minLength || null, maxLength: st.maxLength || null,
                rubric: q.scoringRubric || null, lengthIssues: notes }
    });
  };

  /* ── カード：自分で付けた印。点にはするが、自己申告だと明示する ── */
  ENGINE_EVAL.flashcard = function (q, answer, ctx) {
    var mark = isObj(answer) ? str(answer.mark) : str(answer);
    var known = mark === "known" || mark === "easy" || mark === "ok";
    return result({
      isCorrect: known, score: known ? ctx.max : 0, maxScore: ctx.max,
      method: "self-mark", normalizedAnswer: mark,
      feedback: "自分で付けた印です。試験の点としては数えません。",
      detail: { mark: mark, selfReported: true }
    });
  };

  /* ── 複合大問：小問を採点して合算する ─────────────────────────── */
  ENGINE_EVAL.composite = function (q, answer, ctx) {
    var kids = arr(q.children);
    if (!kids.length) return result({ isCorrect: null, score: null, maxScore: ctx.max,
                                      method: "composite", requiresManualReview: true,
                                      feedback: "小問がありません。" });
    var byChild = (isObj(answer) && isObj(answer.children)) ? answer.children : {};
    var score = 0, max = 0, pending = 0, correct = 0;
    var per = kids.map(function (c) {
      var r = evaluate(c, byChild[c.id], ctx.opts);
      max += r.maxScore;
      if (r.score === null) pending++; else score += r.score;
      if (r.isCorrect === true) correct++;
      return { questionId: c.id, type: c.type, result: r };
    });
    var allCorrect = correct === kids.length && pending === 0;
    return result({
      isCorrect: pending ? null : allCorrect,
      score: pending ? null : score, maxScore: max || ctx.max,
      partialCredit: !allCorrect && score > 0,
      method: "composite", requiresManualReview: pending > 0,
      detail: { children: per, pending: pending, correctCount: correct, total: kids.length }
    });
  };

  /* ══════════════════════════════════════════════════════════════════
     入口
     ══════════════════════════════════════════════════════════════════ */
  function evaluate(question, answer, opts) {
    opts = opts || {};
    var q = question || {};
    var engine = q.engine || Q.engineOf(q.type);
    var max = isNum(q.points) ? q.points : 1;

    if (!engine) {
      /* 知らない形式でも落とさない。採点だけ保留にする（§24）。 */
      return result({ isCorrect: null, score: null, maxScore: max, method: "unknown-type",
                      requiresManualReview: true,
                      feedback: "この形式（" + str(q.type) + "）はまだ採点できません。" });
    }
    if (isUnanswered(q, answer)) {
      return result({ isCorrect: false, score: 0, maxScore: max, method: "unanswered",
                      normalizedAnswer: null, feedback: "未回答です。" });
    }
    /* 数式だけは、書き方の違い（＋ と +、空白）を落としてから照合する。
       これまでの採点と同じ結果にするため、grading.js の規則をそのまま使う。 */
    if (Q.legacyTypeOf(q.type) === "formula") {
      var gf = G.gradeDeterministic(Object.assign({}, q, { type: "formula", points: max }), answer);
      return result({ isCorrect: gf.correct, score: gf.score, maxScore: max,
                      method: gf.method, detail: gf.detail,
                      normalizedAnswer: gf.detail && gf.detail.normalized });
    }
    var fn = ENGINE_EVAL[engine];
    if (!fn) {
      return result({ isCorrect: null, score: null, maxScore: max, method: "unsupported-engine",
                      requiresManualReview: true,
                      feedback: "この形式はまだ採点できません（" + engine + "）。" });
    }
    var ctx = { max: max, rule: ruleFor(q), opts: opts, engine: engine };
    try {
      return fn(q, answer, ctx);
    } catch (e) {
      /* 採点でつまずいてもアプリを落とさない。保留にして理由を残す。 */
      return result({ isCorrect: null, score: null, maxScore: max, method: "error",
                      requiresManualReview: true,
                      feedback: "この問題の採点でつまずきました。手で確認してください。",
                      detail: { error: str(e && e.message) } });
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     セッション全体
     ・複合大問は葉へ展開してから採点する（集計の単位を小問にそろえる）。
     ══════════════════════════════════════════════════════════════════ */
  function evaluateSession(questions, answers, opts) {
    opts = opts || {};
    var leaves = M.flatten(questions);
    var gmap = M.groupIndex(questions);
    var byId = Object.create(null);
    arr(answers).forEach(function (a) {
      if (!a || !a.questionId) return;
      byId[a.questionId] = a;
      /* 大問へ 1 本で保存された回答は、小問ごとの記録へほどく。
         ほどかないと、小問がすべて未回答になる。 */
      if (isObj(a.value) && isObj(a.value.children)) {
        var kids = Object.keys(a.value.children);
        var share = kids.length ? Math.round((a.timeMs || 0) / kids.length) : 0;
        kids.forEach(function (cid) {
          if (byId[cid]) return;
          byId[cid] = {
            questionId: cid, value: a.value.children[cid],
            timeMs: share, changeCount: 0, visitCount: a.visitCount || 0,
            flagged: !!a.flagged, parentId: a.questionId
          };
        });
      }
    });

    var items = [], pendingAi = [];
    var score = 0, max = 0, correct = 0, wrong = 0, unanswered = 0;

    leaves.forEach(function (q) {
      var rec = byId[q.id] || null;
      var value = rec ? rec.value : null;
      var r = evaluate(q, value, opts);
      max += r.maxScore;
      var answered = !isUnanswered(q, value);
      if (!answered) unanswered++;
      else if (r.score === null) pendingAi.push({ question: q, answer: value, record: rec });
      else {
        score += r.score;
        if (r.isCorrect === true) correct++; else wrong++;
      }
      items.push({
        questionId: q.id,
        groupId: gmap[q.id] ? gmap[q.id].id : (q.groupId || null),
        /* 結果画面でその形式のまま再現するため、答えそのものも残す。
           これが無いと「並べ替えをどう並べたか」を見せられない。 */
        value: answered ? value : null,
        type: q.type, engine: q.engine || Q.engineOf(q.type),
        answered: answered,
        correct: answered ? r.isCorrect : false,
        isCorrect: answered ? r.isCorrect : false,
        score: answered ? r.score : 0,
        maxScore: r.maxScore,
        partialCredit: r.partialCredit,
        method: answered ? r.method : "unanswered",
        detail: answered ? r.detail : null,
        feedback: r.feedback,
        matchedCriteria: r.matchedCriteria,
        missedCriteria: r.missedCriteria,
        normalizedAnswer: r.normalizedAnswer,
        requiresReview: answered ? r.requiresManualReview : false,
        confidence: rec && isNum(rec.confidence) ? rec.confidence : null,
        timeMs: rec ? rec.timeMs || 0 : 0,
        changeCount: rec ? rec.changeCount || 0 : 0,
        visitCount: rec ? rec.visitCount || 0 : 0,
        hintUsed: rec ? !!rec.hintUsed : false,
        flagged: rec ? !!rec.flagged : false,
        skipped: rec ? !!rec.skipped : false,
        replayCount: rec && isNum(rec.replayCount) ? rec.replayCount : null
      });
    });

    return {
      items: items, pendingAi: pendingAi,
      deterministicScore: r2(score), totalMax: r2(max),
      correctCount: correct, wrongCount: wrong,
      unansweredCount: unanswered, pendingCount: pendingAi.length,
      complete: pendingAi.length === 0
    };
  }

  /* ══════════════════════════════════════════════════════════════════
     集計（形式別・エンジン別・大問別を足す）
     ・grading.aggregate をそのまま使い、足りない軸だけ重ねる。
     ══════════════════════════════════════════════════════════════════ */
  function aggregate(questions, items, opts) {
    var leaves = M.flatten(questions);
    var base = G.aggregate(leaves, items, opts);
    var byId = Object.create(null);
    arr(items).forEach(function (i) { byId[i.questionId] = i; });

    function bucket() { return { score: 0, max: 0, correct: 0, wrong: 0, unanswered: 0, count: 0, timeMs: 0 }; }
    function add(b, it) {
      b.count++;
      b.max += isNum(it.maxScore) ? it.maxScore : 0;
      b.score += isNum(it.score) ? it.score : 0;
      b.timeMs += it.timeMs || 0;
      if (!it.answered) b.unanswered++;
      else if (it.correct === true) b.correct++;
      else if (it.correct === false) b.wrong++;
    }
    var byEngine = Object.create(null), byGroup = Object.create(null);
    var conf = { buckets: Object.create(null), count: 0 };
    var hintUsed = 0, flagged = 0, skipped = 0;

    leaves.forEach(function (q) {
      var it = byId[q.id];
      if (!it) return;
      var e = it.engine || Q.engineOf(q.type) || "unknown";
      (byEngine[e] || (byEngine[e] = bucket()), add(byEngine[e], it));
      var g = it.groupId;
      if (g) { (byGroup[g] || (byGroup[g] = bucket()), add(byGroup[g], it)); }
      if (isNum(it.confidence)) {
        var k = String(Math.max(1, Math.min(5, Math.round(it.confidence))));
        var b = conf.buckets[k] || (conf.buckets[k] = { count: 0, correct: 0 });
        b.count++; conf.count++;
        if (it.correct === true) b.correct++;
      }
      if (it.hintUsed) hintUsed++;
      if (it.flagged) flagged++;
      if (it.skipped) skipped++;
    });

    [byEngine, byGroup].forEach(function (m) {
      Object.keys(m).forEach(function (k) {
        m[k].score = r2(m[k].score);
        m[k].rate = m[k].max > 0 ? m[k].score / m[k].max : null;
        m[k].accuracy = m[k].count > 0 ? m[k].correct / m[k].count : null;
      });
    });
    Object.keys(conf.buckets).forEach(function (k) {
      var b = conf.buckets[k];
      b.accuracy = b.count ? b.correct / b.count : null;
    });
    /* 形式別の見出しはレジストリから引く（画面へ書き写さない）。 */
    Object.keys(base.byType || {}).forEach(function (t) {
      base.byType[t].label = Q.label(t);
      base.byType[t].engine = Q.engineOf(t);
    });
    Object.keys(byEngine).forEach(function (e) {
      var def = Q.engine(e);
      byEngine[e].label = def ? def.label : e;
    });

    base.byEngine = byEngine;
    base.byGroup = byGroup;
    base.confidence = conf;
    base.behavior = { hintUsed: hintUsed, flagged: flagged, skipped: skipped };
    return base;
  }

  /* AI 採点の取り込みは grading.js が持つ規則をそのまま使う。 */
  function applyAiGrade(item, question, aiResult, opts) {
    return G.applyAiGrade(item, question, aiResult, opts);
  }

  /* ══════════════════════════════════════════════════════════════════
     記述の「内容の照合」（§10）
     ・AI に丸投げすると、長さと丁寧さで点が付く（実測でそうなっていた）。
     ・その前に、**何が書けていれば正解か** をこちらで機械的に取り出し、
       受験者の解答に入っているかを照合する。
     ・ここで作るのは判定ではなく「事実」。点を決めるのは採点基準と AI。
     ══════════════════════════════════════════════════════════════════ */

  /* 模範解答を、採点で見るべき「要点」へ切り分ける。
     句点・読点・接続で切り、短すぎるかけらは捨てる。 */
  function splitPoints(text) {
    var t = str(text).replace(/\r/g, "").trim();
    if (!t) return [];
    var parts = t.split(/[。\n]|、(?=[^、]{8,})|(?:ため|から|ので)、/)
      .map(function (x) { return x.trim().replace(/^[・\-*\s]+/, ""); })
      .filter(function (x) { return x.length >= 4; });
    if (!parts.length && t.length >= 2) parts = [t];
    return parts.slice(0, 8);
  }

  /* 内容語（助詞・助動詞・記号を落とした、意味を持つ語）を取り出す。
     形態素解析は入れない。日本語は 2 文字以上の漢字・カタカナのかたまり、
     英語は 3 文字以上の語を拾う。 */
  var STOP = ("こと もの ため よう それ これ そこ ここ ある いる する なる また しかし そして よって したがって "
    + "the and for that with this from have has been are was were will can").split(/\s+/);
  function contentWords(text) {
    var t = toHalfwidthSafe(str(text));
    var out = [], seen = Object.create(null);
    var re = /[一-鿿々〆ヵヶ]{2,}|[ァ-ヺー]{2,}|[A-Za-z][A-Za-z'-]{2,}|\d+(?:\.\d+)?(?:%|％|年|世紀|人|円|個|倍)?/g;
    var m;
    while ((m = re.exec(t))) {
      var w = m[0];
      var k = w.toLowerCase();
      if (STOP.indexOf(k) >= 0) continue;
      if (seen[k]) continue;
      seen[k] = 1;
      out.push(w);
      if (out.length >= 40) break;
    }
    return out;
  }
  function toHalfwidthSafe(s2) {
    try { return G.toHalfwidth(s2); } catch (e) { return s2; }
  }

  /* 採点で見るべき要点の一覧。次の順で決める。
     ① 出題者が書いた必須キーワード
     ② 模範解答から切り出した要点
     ③ 解説から切り出した要点（模範解答が無いとき） */
  function keyPointsOf(question) {
    var q = question || {};
    var sr = q.scoringRule || {};
    var kws = arr(sr.keywords).map(str).filter(Boolean);
    if (kws.length) {
      return kws.map(function (k, i) {
        return { id: "kp" + (i + 1), text: k, kind: "keyword", words: contentWords(k) };
      });
    }
    var model = str(q.correctAnswer) || arr(q.acceptedAnswers)[0] || "";
    var src = model || str(q.explanation);
    return splitPoints(src).map(function (p, i) {
      return { id: "kp" + (i + 1), text: p, kind: model ? "model" : "explanation", words: contentWords(p) };
    });
  }

  /* 受験者の解答が、その要点に触れているか。
     ・キーワードは、そのまま入っているかを見る。
     ・要点（文）は、内容語のうち何割が入っているかを見る。 */
  function coverPoint(point, answerNorm, rule) {
    if (point.kind === "keyword") {
      var k = norm(point.text, rule);
      var hit = !!k && answerNorm.indexOf(k) >= 0;
      return { found: hit, ratio: hit ? 1 : 0, hitWords: hit ? [point.text] : [], missWords: hit ? [] : [point.text] };
    }
    var words = arr(point.words);
    if (!words.length) return { found: false, ratio: 0, hitWords: [], missWords: [] };
    var hits = [], miss = [];
    words.forEach(function (w) {
      var nw = norm(w, rule);
      if (nw && answerNorm.indexOf(nw) >= 0) hits.push(w); else miss.push(w);
    });
    var ratio = words.length ? hits.length / words.length : 0;
    return { found: ratio >= 0.5, ratio: r2(ratio), hitWords: hits.slice(0, 8), missWords: miss.slice(0, 8) };
  }

  /* 内容の照合。点は付けない。「何が書けていて、何が抜けているか」を返す。 */
  function contentCheck(question, answerText) {
    var q = question || {};
    var rule = ruleFor(q);
    var a = norm(answerText, rule);
    var points = keyPointsOf(q);
    var per = points.map(function (p) {
      var c = coverPoint(p, a, rule);
      return { id: p.id, text: p.text, kind: p.kind, found: c.found, ratio: c.ratio,
               hitWords: c.hitWords, missWords: c.missWords };
    });
    var found = per.filter(function (p) { return p.found; }).length;
    var st2 = q.settings || {};
    var len = str(answerText).length;

    /* 本文の写しかどうか（「自分の言葉で説明」用）。長い一致があれば写し。 */
    var verbatim = 0;
    var ctx = str(q.context);
    if (ctx && len >= 12) {
      var chunk = 12, hit = 0, tries = 0;
      for (var i = 0; i + chunk <= len; i += chunk) {
        tries++;
        if (ctx.indexOf(str(answerText).slice(i, i + chunk)) >= 0) hit++;
      }
      verbatim = tries ? r2(hit / tries) : 0;
    }
    return {
      points: per,
      total: per.length,
      found: found,
      coverage: per.length ? r2(found / per.length) : null,
      length: len,
      minLength: isNum(st2.minLength) ? st2.minLength : null,
      maxLength: isNum(st2.maxLength) ? st2.maxLength : null,
      lengthOk: !(isNum(st2.minLength) && len < st2.minLength) && !(isNum(st2.maxLength) && len > st2.maxLength),
      verbatim: verbatim,
      hasModelAnswer: !!(str(q.correctAnswer) || arr(q.acceptedAnswers).length),
      /* 何を根拠に照合したか。人へ見せるときに必要。 */
      basis: per.length ? per[0].kind : "none"
    };
  }

  /* AI の採点が、内容の照合と食い違っていないか。
     食い違っていたら点は動かさず、確認を促す（勝手に上書きしない）。 */
  function crossCheckGrade(question, answerText, graded) {
    var chk = contentCheck(question, answerText);
    var notes = [];
    if (!graded || !isNum(graded.score) || !isNum(graded.maxScore) || graded.maxScore <= 0)
      return { check: chk, notes: notes, requiresReview: false };
    var rate = graded.score / graded.maxScore;
    if (chk.total >= 1 && chk.coverage !== null) {
      if (rate >= 0.8 && chk.coverage === 0)
        notes.push("模範解答の要点がひとつも見つからないのに高い点が付いています。中身を確かめてください。");
      if (rate <= 0.2 && chk.coverage >= 0.8)
        notes.push("模範解答の要点はほぼ書けているのに低い点が付いています。中身を確かめてください。");
    }
    if (!chk.lengthOk && rate >= 0.9)
      notes.push("字数の条件を満たしていないのに満点に近い点が付いています。");
    if (chk.verbatim >= 0.8 && question.settings && question.settings.forbidVerbatim)
      notes.push("本文をほぼそのまま写している可能性があります（一致 " + Math.round(chk.verbatim * 100) + "%）。");
    return { check: chk, notes: notes, requiresReview: notes.length > 0 };
  }

  /* 復習の優先度。どこから直せばよいかを数字で返す。 */
  function weakSpots(questions, items) {
    var agg = aggregate(questions, items);
    var out = [];
    ["byTopic", "byType", "byDifficulty"].forEach(function (axis) {
      var m = agg[axis] || {};
      Object.keys(m).forEach(function (k) {
        var b = m[k];
        if (!b.count || b.rate === null) return;
        if (b.rate >= 0.7) return;
        out.push({
          axis: axis, key: k,
          label: axis === "byType" ? Q.label(k) : k,
          rate: r2(b.rate), count: b.count, max: b.max, score: b.score
        });
      });
    });
    return out.sort(function (a, b) { return a.rate - b.rate || b.count - a.count; }).slice(0, 12);
  }

  VQ2.evaluator = {
    evaluate: evaluate,
    evaluateSession: evaluateSession,
    aggregate: aggregate,
    applyAiGrade: applyAiGrade,
    weakSpots: weakSpots,
    isUnanswered: isUnanswered,
    normalize: norm,
    similarity: similarity,
    editDistance: editDistance,
    pointInHotspot: pointInHotspot,
    tokenize: tokenize,
    ruleFor: ruleFor,
    contentCheck: contentCheck, crossCheckGrade: crossCheckGrade,
    keyPointsOf: keyPointsOf, splitPoints: splitPoints, contentWords: contentWords,
    ENGINE_EVAL: ENGINE_EVAL
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
