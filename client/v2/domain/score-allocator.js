/* ══════════════════════════════════════════════════════════════════════
   決定論的 Score Allocator（§18）
   ・AI の仮配点は指定満点へ収束しない。これを AI の再生成で直そうとしない。
   ・ここは「必ず合う」ことをコードで保証する。合わせられない条件なら、
     黙って満点を変えずに、何が不可能かを ValidationIssue で返す。
   ・整数配点は最大剰余法（largest remainder）で配る。合計は必ず一致する。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var S = VQ2.schema;
  if (!S) throw new Error("VQ2.schema must be loaded before score-allocator.js");
  var err = S.err, warn = S.warn;

  function isNum(v) { return typeof v === "number" && isFinite(v); }
  var EPS = 1e-9;
  function eq(a, b) { return Math.abs(a - b) < 1e-6; }
  function sum(a) { return (a || []).reduce(function (x, y) { return x + (isNum(y) ? y : 0); }, 0); }

  /* 形式ごとの配点の目安。preferredPoints が無いときの初期重みに使う。 */
  var TYPE_WEIGHT = {
    multiple_choice_single: 1, true_false: 1, matching: 1.2, ordering: 1.2,
    multiple_choice_multiple: 1.4, numeric: 1.2, fill_blank: 1.2, short_answer: 1.5,
    formula: 1.8, source_analysis: 2.2, long_answer: 2.5, english_writing: 3, essay: 3.5
  };
  var DIFFICULTY_WEIGHT = { easy: 0.85, normal: 1, hard: 1.25 };

  /* ══════════════════════════════════════════════════════════════════
     整数の最大剰余法。weights の比で total を配り、min/max を守る。
     戻り値は必ず sum === total（不可能なときは null）。
     ══════════════════════════════════════════════════════════════════ */
  function allocateIntegers(total, weights, mins, maxs) {
    var n = weights.length;
    if (n === 0) return total === 0 ? [] : null;
    var minSum = sum(mins), maxSum = sum(maxs);
    if (total < minSum - EPS || total > maxSum + EPS) return null;

    /* まず下限を配り、残りを重みで配る */
    var out = mins.slice();
    var rest = total - minSum;
    var head = weights.map(function (w, i) { return Math.max(0, maxs[i] - mins[i]); });
    var headSum = sum(head);
    if (rest <= 0) return out;
    if (headSum <= 0) return null;

    var wsum = sum(weights.map(function (w, i) { return head[i] > 0 ? Math.max(w, 0) : 0; }));
    var raw = weights.map(function (w, i) {
      if (head[i] <= 0) return 0;
      return wsum > 0 ? rest * Math.max(w, 0) / wsum : rest / n;
    });
    /* 上限で頭打ちにする。頭打ち分は残余として再配分する。 */
    var give = raw.map(function (v, i) { return Math.min(Math.floor(v), head[i]); });
    var remainder = rest - sum(give);

    /* 端数の大きい順に 1 点ずつ配る。上限に達したものは飛ばす。 */
    var order = raw.map(function (v, i) { return { i: i, frac: v - Math.floor(v) }; })
      .sort(function (a, b) { return b.frac - a.frac || a.i - b.i; });
    var guard = 0;
    while (remainder > 0 && guard < 100000) {
      var moved = false;
      for (var k = 0; k < order.length && remainder > 0; k++) {
        var idx = order[k].i;
        if (give[idx] < head[idx]) { give[idx] += 1; remainder -= 1; moved = true; }
      }
      if (!moved) break;
      guard++;
    }
    if (remainder > 0) return null;
    for (var i = 0; i < n; i++) out[i] += give[i];
    return out;
  }

  /* 小数を許す場合の配分。比例配分し、最後の 1 件で誤差を吸収する。 */
  function allocateReals(total, weights, mins, maxs) {
    var n = weights.length;
    if (n === 0) return total === 0 ? [] : null;
    var minSum = sum(mins), maxSum = sum(maxs);
    if (total < minSum - EPS || total > maxSum + EPS) return null;
    var out = mins.slice();
    var rest = total - minSum;
    var head = maxs.map(function (m, i) { return Math.max(0, m - mins[i]); });
    var wsum = sum(weights.map(function (w, i) { return head[i] > 0 ? Math.max(w, 0) : 0; }));
    if (rest <= EPS) return out;
    if (wsum <= 0) return null;
    var used = 0;
    for (var i = 0; i < n; i++) {
      if (head[i] <= 0) continue;
      var give = Math.min(head[i], rest * Math.max(weights[i], 0) / wsum);
      out[i] += give; used += give;
    }
    /* 上限で削られた分を、まだ余裕のあるものへ回す */
    var left = rest - used, guard = 0;
    while (left > EPS && guard < 1000) {
      var room = [], roomSum = 0;
      for (var j = 0; j < n; j++) { var r = maxs[j] - out[j]; room.push(r > EPS ? r : 0); roomSum += r > EPS ? r : 0; }
      if (roomSum <= EPS) break;
      for (var m = 0; m < n; m++) {
        if (room[m] <= 0) continue;
        var add = Math.min(room[m], left * room[m] / roomSum);
        out[m] += add; left -= add;
      }
      guard++;
    }
    if (left > 1e-6) return null;
    /* 丸め誤差を最後の可変項目で吸収する */
    var diff = total - sum(out);
    if (Math.abs(diff) > EPS) {
      for (var z = n - 1; z >= 0; z--) {
        if (out[z] + diff >= mins[z] - EPS && out[z] + diff <= maxs[z] + EPS) { out[z] += diff; break; }
      }
    }
    return out;
  }

  /* ══════════════════════════════════════════════════════════════════
     本体
     spec: MockSpec 相当（sections[].questions[]）
     opts: { targetTotal, integerOnly, minimumPoints, maximumPoints, sectionWeights }
     戻り: { ok, spec, issues, changed:[{questionId, from, to}] }
     ══════════════════════════════════════════════════════════════════ */
  function allocate(spec, opts) {
    opts = opts || {};
    var issues = [];
    var out = JSON.parse(JSON.stringify(spec));
    var sections = Array.isArray(out.sections) ? out.sections : [];

    var target = isNum(opts.targetTotal) ? opts.targetTotal
      : (isNum(out.totalPoints) ? out.totalPoints : null);
    if (!isNum(target) || target <= 0) {
      issues.push(err("noTarget", "totalPoints", "満点が指定されていません。"));
      return { ok: false, spec: out, issues: issues, changed: [] };
    }

    var integerOnly = opts.integerOnly !== false;   /* 指定が無ければ整数 */
    var globalMin = isNum(opts.minimumPoints) ? opts.minimumPoints : (integerOnly ? 1 : 0.5);
    var globalMax = isNum(opts.maximumPoints) ? opts.maximumPoints : Math.max(globalMin, target);

    /* 全問題を平坦化 */
    var items = [];
    sections.forEach(function (s, si) {
      (s.questions || []).forEach(function (q, qi) {
        items.push({ q: q, si: si, qi: qi, before: isNum(q.points) ? q.points : null });
      });
    });
    if (!items.length) {
      issues.push(err("noQuestions", "sections", "問題がありません。"));
      return { ok: false, spec: out, issues: issues, changed: [] };
    }

    /* 固定配点（lockedPoints）を保護する */
    var lockedIdx = [], freeIdx = [];
    items.forEach(function (it, i) {
      var locked = it.q.lockedPoints === true || it.q.pointsLocked === true;
      if (locked && isNum(it.q.points)) lockedIdx.push(i); else freeIdx.push(i);
    });
    var lockedSum = sum(lockedIdx.map(function (i) { return items[i].q.points; }));
    var remaining = target - lockedSum;

    if (!freeIdx.length) {
      if (eq(lockedSum, target)) {
        finalize(out, issues);
        return { ok: true, spec: out, issues: issues, changed: [] };
      }
      issues.push(err("allLocked", "totalPoints",
        "すべての問題の配点が固定されているため、合計 " + lockedSum + " 点を満点 " + target + " 点へ調整できません。固定条件の変更が必要です。"));
      return { ok: false, spec: out, issues: issues, changed: [] };
    }
    if (remaining < 0) {
      issues.push(err("lockedOverflow", "totalPoints",
        "固定配点の合計 " + lockedSum + " 点が、満点 " + target + " 点を超えています。固定条件の変更が必要です。"));
      return { ok: false, spec: out, issues: issues, changed: [] };
    }

    /* 重み・下限・上限を作る */
    var weights = [], mins = [], maxs = [];
    freeIdx.forEach(function (i) {
      var q = items[i].q;
      var pref = isNum(q.preferredPoints) ? q.preferredPoints
        : (isNum(q.points) && q.points > 0 ? q.points : null);
      var w = pref !== null ? pref
        : (TYPE_WEIGHT[q.type] || 1) * (DIFFICULTY_WEIGHT[q.difficulty] || 1);
      weights.push(Math.max(w, 0.0001));
      var mn = isNum(q.minimumPoints) ? q.minimumPoints : globalMin;
      var mx = isNum(q.maximumPoints) ? q.maximumPoints : globalMax;
      if (integerOnly) { mn = Math.max(Math.ceil(mn), 1); mx = Math.floor(mx); }
      if (mx < mn) mx = mn;
      mins.push(mn); maxs.push(mx);
    });

    var got = integerOnly
      ? allocateIntegers(remaining, weights, mins, maxs)
      : allocateReals(remaining, weights, mins, maxs);

    if (!got) {
      var minSum = sum(mins), maxSum = sum(maxs);
      var msg;
      if (remaining < minSum)
        msg = freeIdx.length + " 問の下限合計が " + (minSum + lockedSum) + " 点となり、満点 " + target + " 点に収まりません。"
            + "1 問あたりの下限を下げるか、問題数を減らす必要があります。";
      else
        msg = freeIdx.length + " 問の上限合計が " + (maxSum + lockedSum) + " 点までのため、満点 " + target + " 点へ届きません。"
            + "1 問あたりの上限を上げるか、問題数を増やす必要があります。";
      issues.push(err("cannotReachTotal", "totalPoints", msg, {
        target: target, lockedSum: lockedSum, freeCount: freeIdx.length,
        minPossible: minSum + lockedSum, maxPossible: maxSum + lockedSum
      }));
      return { ok: false, spec: out, issues: issues, changed: [] };
    }

    /* 反映 */
    var changed = [];
    freeIdx.forEach(function (idx, k) {
      var it = items[idx];
      var to = got[k];
      if (!eq(it.before === null ? NaN : it.before, to)) {
        changed.push({ questionId: it.q.id, from: it.before, to: to });
      }
      it.q.points = to;
    });

    finalize(out, issues);

    /* 保証の最終確認。ここで合っていなければバグなので error にする。 */
    var finalTotal = 0;
    sections.forEach(function (s) { (s.questions || []).forEach(function (q) { finalTotal += q.points; }); });
    if (!eq(finalTotal, target)) {
      issues.push(err("allocatorBug", "totalPoints",
        "配点調整後の合計が " + finalTotal + " 点で、満点 " + target + " 点と一致しません。"));
      return { ok: false, spec: out, issues: issues, changed: changed };
    }
    out.totalPoints = target;
    return { ok: true, spec: out, issues: issues, changed: changed };
  }

  /* 大問小計・観点別小計・回答欄の配点を、問題の配点から作り直す。
     ここを毎回やり直すことで、問題冊子・解答用紙・採点定義・結果表示がずれない。 */
  function finalize(spec, issues) {
    var sections = Array.isArray(spec.sections) ? spec.sections : [];
    var bindingById = Object.create(null);
    (spec.answerBindings || []).forEach(function (b) { if (b && b.id) bindingById[b.id] = b; });

    sections.forEach(function (s) {
      var qs = s.questions || [];
      s.points = sum(qs.map(function (q) { return q.points; }));

      /* 観点別配点：問題側の割り当てを配点の変化に追随させる */
      qs.forEach(function (q) {
        if (!Array.isArray(q.criterionAllocation) || !q.criterionAllocation.length) return;
        var before = sum(q.criterionAllocation.map(function (a) { return a.points; }));
        if (before <= 0) {
          /* 元が 0 なら等分できない。1 つ目へ全額寄せる。 */
          q.criterionAllocation[0].points = q.points;
          for (var i = 1; i < q.criterionAllocation.length; i++) q.criterionAllocation[i].points = 0;
          return;
        }
        if (eq(before, q.points)) return;
        /* 元の比率を保ったまま、整数で配り直す */
        var w = q.criterionAllocation.map(function (a) { return Math.max(a.points, 0); });
        var mins = w.map(function () { return 0; });
        var maxs = w.map(function () { return q.points; });
        var got = allocateIntegers(q.points, w, mins, maxs);
        if (got) q.criterionAllocation.forEach(function (a, i) { a.points = got[i]; });
        else if (issues) issues.push(warn("criterionRealloc", "criterionAllocation",
          "観点別配点を再計算できなかったため、元の値を残しました。"));
      });

      /* 大問の観点別小計 */
      if (Array.isArray(s.criterionAllocation) && s.criterionAllocation.length) {
        var acc = Object.create(null);
        qs.forEach(function (q) {
          (q.criterionAllocation || []).forEach(function (a) {
            acc[a.criterionId] = (acc[a.criterionId] || 0) + (isNum(a.points) ? a.points : 0);
          });
        });
        s.criterionAllocation.forEach(function (a) { a.points = acc[a.criterionId] || 0; });
      }

      /* 採点 Rubric を配点へ合わせる（記述式のみ） */
      qs.forEach(function (q) {
        if (!q.scoringRubric || !Array.isArray(q.scoringRubric.items) || !q.scoringRubric.items.length) return;
        var rb = q.scoringRubric.items;
        var before = sum(rb.map(function (r) { return r.points; }));
        if (eq(before, q.points)) return;
        var w = rb.map(function (r) { return Math.max(r.points, 0); });
        if (sum(w) <= 0) w = rb.map(function () { return 1; });
        var got2 = allocateIntegers(q.points, w, rb.map(function () { return 0; }), rb.map(function () { return q.points; }));
        if (got2) rb.forEach(function (r, i) { r.points = got2[i]; });
      });

      /* 回答欄へ同期 */
      qs.forEach(function (q) {
        var b = bindingById[q.answerBindingId];
        if (b) b.points = q.points;
      });
    });
  }

  /* 観点別配点をまだ持たない問題へ、既定の割り当てを与える。
     客観問題＝知識・技能、記述/資料読解＝思考・判断・表現を主とする。 */
  function seedCriterionAllocation(spec) {
    var out = JSON.parse(JSON.stringify(spec));
    (out.sections || []).forEach(function (s) {
      (s.questions || []).forEach(function (q) {
        if (Array.isArray(q.criterionAllocation) && q.criterionAllocation.length) return;
        var p = isNum(q.points) ? q.points : 0;
        var thinkingHeavy = ["long_answer", "essay", "english_writing", "source_analysis", "formula"].indexOf(q.type) >= 0;
        if (thinkingHeavy) {
          var k = Math.floor(p * 0.3);
          q.criterionAllocation = [
            { criterionId: "knowledge_skill", points: k },
            { criterionId: "thinking_judgment_expression", points: p - k }
          ];
        } else {
          q.criterionAllocation = [
            { criterionId: "knowledge_skill", points: p },
            { criterionId: "thinking_judgment_expression", points: 0 }
          ];
        }
      });
    });
    return out;
  }

  /* 観点別の集計（結果表示・分析で使う） */
  function criterionTotals(spec) {
    var acc = Object.create(null);
    S.CRITERION_IDS.forEach(function (id) { acc[id] = 0; });
    (spec.sections || []).forEach(function (s) {
      (s.questions || []).forEach(function (q) {
        (q.criterionAllocation || []).forEach(function (a) {
          if (acc[a.criterionId] === undefined) acc[a.criterionId] = 0;
          acc[a.criterionId] += isNum(a.points) ? a.points : 0;
        });
      });
    });
    return acc;
  }

  VQ2.scoreAllocator = {
    allocate: allocate,
    finalize: finalize,
    allocateIntegers: allocateIntegers,
    allocateReals: allocateReals,
    seedCriterionAllocation: seedCriterionAllocation,
    criterionTotals: criterionTotals,
    TYPE_WEIGHT: TYPE_WEIGHT,
    DIFFICULTY_WEIGHT: DIFFICULTY_WEIGHT
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
