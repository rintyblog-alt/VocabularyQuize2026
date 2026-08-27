/* ══════════════════════════════════════════════════════════════════════
   学習の分析（Insight が読む数）

   ・数の出どころは `VQ2.learning` だけ。ここでは作り直さない。
   ・**分からないことは分からないと返す。** 比べる相手が無いのに 0% と言わない。
   ・記録が少ないうちは「まだ判断できない」と返す（少ない回数で断定しない）。
   ・画面へ内部の ID を返さない。名前は必ずレジストリから引く。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var L = VQ2.learning;
  var Q = VQ2.qtypes;

  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function str(v) { return v === undefined || v === null ? "" : String(v); }
  function r1(n) { return Math.round(n * 10) / 10; }
  function r2(n) { return Math.round(n * 100) / 100; }
  function pct(n) { return Math.round(n * 1000) / 10; }
  var DAY = 86400000;

  /* 判断してよいだけの記録があるか。少ない回数で決めつけない。 */
  var MIN_FOR_TREND = 3;        /* 傾向を言うのに要るセッション数 */
  var MIN_FOR_FACET = 6;        /* 科目・形式ごとに判断するのに要る解答数 */
  var MIN_FOR_WEAK = 5;         /* 苦手と言うのに要る解答数 */
  var MIN_FOR_HABIT = 5;        /* 時間帯・曜日の傾向を言うのに要るセッション数 */

  function ctx(f) {
    f = f || {};
    var b = f.from || f.to ? { from: f.from, to: f.to } : L.rangeBounds(f.range || "30d");
    return {
      from: b.from, to: b.to, range: f.range || "30d",
      source: f.source || null, mode: f.mode || null, subject: f.subject || null
    };
  }
  function filterOf(c) {
    return { from: c.from, to: c.to, source: c.source, mode: c.mode, subject: c.subject };
  }

  /* ══════════════════════════════════════════════════════════════════
     1) 概要（上の数）
     ══════════════════════════════════════════════════════════════════ */
  function totals(sessions, answers) {
    var t = {
      sessionCount: sessions.length,
      completedCount: 0, pendingCount: 0,
      answeredCount: 0, correctCount: 0, incorrectCount: 0, skippedCount: 0,
      score: 0, maxScore: 0, gradedMax: 0,
      activeSeconds: 0, studyDays: 0
    };
    var days = Object.create(null);
    sessions.forEach(function (s) {
      if (s.status === "completed") t.completedCount++;
      t.pendingCount += s.pendingCount || 0;
      t.answeredCount += s.answeredCount || 0;
      t.correctCount += s.correctCount || 0;
      t.incorrectCount += s.incorrectCount || 0;
      t.skippedCount += s.skippedCount || 0;
      t.score += s.score || 0;
      t.maxScore += s.maxScore || 0;
      t.gradedMax += (s.maxScore || 0) - (s.pendingMaxScore || 0);
      t.activeSeconds += (s.activeDurationSeconds != null ? s.activeDurationSeconds : s.durationSeconds) || 0;
      if (s.localDate) days[s.localDate] = 1;
    });
    t.studyDays = Object.keys(days).length;
    var graded = t.correctCount + t.incorrectCount;
    t.accuracy = graded > 0 ? pct(t.correctCount / graded) : null;
    t.scoreRatio = t.gradedMax > 0 ? pct(t.score / t.gradedMax) : null;
    t.minutes = Math.round(t.activeSeconds / 60);
    t.avgResponseMs = avgTime(answers);
    t.score = r2(t.score);
    t.maxScore = r2(t.maxScore);
    return t;
  }
  function avgTime(answers) {
    var n = 0, sum = 0;
    arr(answers).forEach(function (a) {
      if (isNum(a.responseTimeMs) && a.responseTimeMs > 0) { sum += a.responseTimeMs; n++; }
    });
    return n ? Math.round(sum / n) : null;
  }

  /* 前の同じ長さの期間との差。比べる相手が無ければ null（0% と言わない）。 */
  function summary(f) {
    var c = ctx(f);
    var sessions = L.listSessions(filterOf(c));
    var answers = L.listAnswers(filterOf(c));
    var cur = totals(sessions, answers);

    var prevB = (!f || !f.from) ? L.previousBounds(c.range) : null;
    var prev = null, prevHas = false;
    if (prevB) {
      var pf = { from: prevB.from, to: prevB.to, source: c.source, mode: c.mode, subject: c.subject };
      var ps = L.listSessions(pf);
      if (ps.length) { prev = totals(ps, L.listAnswers(pf)); prevHas = true; }
    }
    function delta(key, isPct) {
      if (!prevHas) return null;
      var a = cur[key], b = prev[key];
      if (!isNum(a) || !isNum(b)) return null;
      return isPct ? r1(a - b) : (a - b);
    }
    return {
      range: c.range, from: c.from, to: c.to,
      current: cur, previous: prev, hasPrevious: prevHas,
      delta: {
        studyDays: delta("studyDays"),
        completedCount: delta("completedCount"),
        answeredCount: delta("answeredCount"),
        accuracy: delta("accuracy", true),
        minutes: delta("minutes"),
        score: delta("score", true)
      },
      /* 何が足りなくて比べられないのかを、画面がそのまま出せるようにする */
      previousNote: prevB ? (prevHas ? "" : "比べられる前の記録がありません")
                          : "この期間には比べる相手がありません"
    };
  }

  /* ══════════════════════════════════════════════════════════════════
     2) 推移
     ══════════════════════════════════════════════════════════════════ */
  function trend(f) {
    var c = ctx(f);
    var metric = (f && f.metric) || "accuracy";     /* accuracy | answered | minutes | score */
    var grain = (f && f.grain) || autoGrain(c);
    var sessions = L.listSessions(filterOf(c));
    if (!sessions.length) return { metric: metric, grain: grain, points: [], empty: true };

    var buckets = Object.create(null), order = [];
    sessions.forEach(function (s) {
      var k = bucketKey(s.localDate, grain);
      if (!buckets[k]) { buckets[k] = emptyBucket(k); order.push(k); }
      var b = buckets[k];
      b.answered += s.answeredCount || 0;
      b.correct += s.correctCount || 0;
      b.incorrect += s.incorrectCount || 0;
      b.seconds += (s.activeDurationSeconds != null ? s.activeDurationSeconds : s.durationSeconds) || 0;
      b.score += s.score || 0;
      b.gradedMax += (s.maxScore || 0) - (s.pendingMaxScore || 0);
      b.sessions++;
      if (s.source === "quick_mock") b.mock++; else b.preset++;
    });
    order.sort();
    var points = order.map(function (k) {
      var b = buckets[k];
      var graded = b.correct + b.incorrect;
      return {
        key: k, label: bucketLabel(k, grain),
        value: valueOf(b, metric, graded),
        answered: b.answered, minutes: Math.round(b.seconds / 60),
        accuracy: graded ? pct(b.correct / graded) : null,
        score: b.gradedMax ? pct(b.score / b.gradedMax) : null,
        sessions: b.sessions, mock: b.mock, preset: b.preset,
        /* 値が無い点は「0」ではなく「無し」。線をつなげない目印。 */
        hasValue: valueOf(b, metric, graded) !== null
      };
    });
    return {
      metric: metric, grain: grain, points: points, empty: false,
      /* 傾向を言えるだけの点があるか */
      enoughForTrend: points.filter(function (p) { return p.hasValue; }).length >= MIN_FOR_TREND
    };
  }
  function emptyBucket(k) {
    return { key: k, answered: 0, correct: 0, incorrect: 0, seconds: 0, score: 0, gradedMax: 0,
             sessions: 0, mock: 0, preset: 0 };
  }
  function valueOf(b, metric, graded) {
    if (metric === "answered") return b.answered;
    if (metric === "minutes") return Math.round(b.seconds / 60);
    if (metric === "score") return b.gradedMax ? pct(b.score / b.gradedMax) : null;
    return graded ? pct(b.correct / graded) : null;
  }
  function autoGrain(c) {
    if (!c.from) return "week";
    var days = Math.round((Date.parse(c.to) - Date.parse(c.from)) / DAY) + 1;
    if (days <= 31) return "day";
    if (days <= 120) return "week";
    return "month";
  }
  function bucketKey(dateStr, grain) {
    if (grain === "month") return str(dateStr).slice(0, 7);
    if (grain === "week") {
      var d = new Date(str(dateStr) + "T00:00:00");
      var day = d.getDay();
      d.setDate(d.getDate() - day);        /* 週のはじまりは日曜 */
      return L.localDate(d.getTime());
    }
    return str(dateStr);
  }
  function bucketLabel(k, grain) {
    if (grain === "month") { var p = k.split("-"); return Number(p[1]) + "月"; }
    var p2 = k.split("-");
    var lbl = Number(p2[1]) + "/" + Number(p2[2]);
    return grain === "week" ? lbl + "〜" : lbl;
  }

  /* ══════════════════════════════════════════════════════════════════
     3) 分野（科目・単元・形式・モード・出どころ）
     ══════════════════════════════════════════════════════════════════ */
  function groupBy(answers, key) {
    var m = Object.create(null);
    arr(answers).forEach(function (a) {
      var k = a && a[key];
      if (!k) return;
      var b = m[k] || (m[k] = { key: k, answered: 0, correct: 0, incorrect: 0, pending: 0,
                                score: 0, maxScore: 0, timeMs: 0, timeN: 0, hint: 0, skipped: 0 });
      if (a.skipped) { b.skipped++; return; }
      b.answered++;
      if (a.isCorrect === true) b.correct++;
      else if (a.isCorrect === false) b.incorrect++;
      else b.pending++;
      if (isNum(a.score)) b.score += a.score;
      b.maxScore += a.maxScore || 0;
      if (isNum(a.responseTimeMs) && a.responseTimeMs > 0) { b.timeMs += a.responseTimeMs; b.timeN++; }
      if (a.hintUsed) b.hint++;
    });
    return finish(m);
  }
  function finish(m) {
    return Object.keys(m).map(function (k) {
      var b = m[k];
      var graded = b.correct + b.incorrect;
      b.accuracy = graded >= 1 ? pct(b.correct / graded) : null;
      b.gradedCount = graded;
      b.scoreRatio = b.maxScore > 0 ? pct(b.score / b.maxScore) : null;
      b.avgTimeMs = b.timeN ? Math.round(b.timeMs / b.timeN) : null;
      b.hintRate = b.answered ? pct(b.hint / b.answered) : null;
      b.skipRate = (b.answered + b.skipped) ? pct(b.skipped / (b.answered + b.skipped)) : null;
      /* 判断してよい量があるか。少ないものは「まだ分からない」。 */
      b.enough = graded >= MIN_FOR_FACET;
      b.score = r2(b.score);
      return b;
    }).sort(function (x, y) { return y.answered - x.answered; });
  }

  function bySubject(f) {
    var c = ctx(f);
    return groupBy(L.listAnswers(filterOf(c)), "subject").map(function (b) {
      b.label = L.subjectLabel(b.key);
      return b;
    });
  }
  function byUnit(f) {
    var c = ctx(f);
    var ans = L.listAnswers(filterOf(c));
    if (f && f.subject) ans = ans.filter(function (a) { return a.subject === f.subject; });
    return groupBy(ans, "unit").map(function (b) { b.label = b.key; return b; });
  }
  /* 形式は 130 種類ある。**一度に全部返さない。** 使った分だけ返す。 */
  function byType(f) {
    var c = ctx(f);
    var rows = groupBy(L.listAnswers(filterOf(c)), "questionType").map(function (b) {
      b.label = L.typeLabel(b.key);
      b.engine = Q && Q.engineOf ? Q.engineOf(b.key) : null;
      return b;
    });
    return rows;
  }
  function byMode(f) {
    var c = ctx(f);
    var m = Object.create(null);
    L.listSessions(filterOf(c)).forEach(function (s) {
      var k = s.mode || "unknown";
      var b = m[k] || (m[k] = { key: k, label: L.modeLabel(k), sessions: 0, answered: 0,
                                correct: 0, incorrect: 0, seconds: 0 });
      b.sessions++;
      b.answered += s.answeredCount || 0;
      b.correct += s.correctCount || 0;
      b.incorrect += s.incorrectCount || 0;
      b.seconds += (s.activeDurationSeconds != null ? s.activeDurationSeconds : s.durationSeconds) || 0;
    });
    return Object.keys(m).map(function (k) {
      var b = m[k], g = b.correct + b.incorrect;
      b.accuracy = g >= 1 ? pct(b.correct / g) : null;
      b.minutes = Math.round(b.seconds / 60);
      return b;
    }).sort(function (a, b) { return b.answered - a.answered; });
  }
  function bySource(f) {
    var c = ctx(f);
    var m = Object.create(null);
    L.listSessions(filterOf(c)).forEach(function (s) {
      var k = s.source || "preset";
      var b = m[k] || (m[k] = { key: k, label: L.sourceLabel(k), sessions: 0, answered: 0,
                                correct: 0, incorrect: 0, score: 0, gradedMax: 0, seconds: 0 });
      b.sessions++;
      b.answered += s.answeredCount || 0;
      b.correct += s.correctCount || 0;
      b.incorrect += s.incorrectCount || 0;
      b.score += s.score || 0;
      b.gradedMax += (s.maxScore || 0) - (s.pendingMaxScore || 0);
      b.seconds += (s.activeDurationSeconds != null ? s.activeDurationSeconds : s.durationSeconds) || 0;
    });
    return Object.keys(m).map(function (k) {
      var b = m[k], g = b.correct + b.incorrect;
      b.accuracy = g >= 1 ? pct(b.correct / g) : null;
      b.scoreRatio = b.gradedMax > 0 ? pct(b.score / b.gradedMax) : null;
      b.minutes = Math.round(b.seconds / 60);
      b.score = r2(b.score);
      return b;
    }).sort(function (a, b) { return b.sessions - a.sessions; });
  }

  /* ══════════════════════════════════════════════════════════════════
     4) 苦手
     ・正答率だけで決めない。**なぜ苦手と言えるのか**を必ず添える。
     ・回数が少ないものは苦手と言わない（たまたま外しただけかもしれない）。
     ══════════════════════════════════════════════════════════════════ */
  function weakness(f) {
    var c = ctx(f);
    var answers = L.listAnswers(filterOf(c));
    if (!answers.length) return [];
    var all = groupBy(answers, "subject").concat([]);   /* 全体の平均を出すために使う */
    var overall = overallOf(answers);

    var out = [];
    [["unit", "単元"], ["questionType", "形式"], ["subject", "科目"]].forEach(function (pair) {
      groupBy(answers, pair[0]).forEach(function (b) {
        if (b.gradedCount < MIN_FOR_WEAK) return;
        var sig = signal(b, pair[0], overall, answers);
        if (sig) out.push(sig);
      });
    });
    out.sort(function (a, b) { return b.severityScore - a.severityScore; });
    return out;
  }
  function overallOf(answers) {
    var g = 0, c = 0, t = 0, n = 0;
    arr(answers).forEach(function (a) {
      if (a.isCorrect === true) { c++; g++; }
      else if (a.isCorrect === false) g++;
      if (isNum(a.responseTimeMs) && a.responseTimeMs > 0) { t += a.responseTimeMs; n++; }
    });
    return { accuracy: g ? pct(c / g) : null, avgTimeMs: n ? Math.round(t / n) : null, graded: g };
  }
  function signal(b, kind, overall, answers) {
    var reasons = [];
    var sc = 0;

    /* 直近の成績。全体より直近が悪ければ、いま崩れている。 */
    var recent = recentOf(answers, kind, b.key, 12);
    if (b.accuracy != null && b.accuracy < 60) {
      reasons.push("直近 " + b.gradedCount + " 問の正答率が " + b.accuracy + "%");
      sc += (60 - b.accuracy) * 1.2;
    }
    if (recent.graded >= 5 && recent.accuracy != null && b.accuracy != null
        && recent.accuracy < b.accuracy - 10) {
      reasons.push("最近の " + recent.graded + " 問では " + recent.accuracy + "% まで下がっています");
      sc += 15;
    }
    if (overall.accuracy != null && b.accuracy != null && b.accuracy < overall.accuracy - 12) {
      reasons.push("ほかより " + r1(overall.accuracy - b.accuracy) + " ポイント低い");
      sc += 12;
    }
    if (b.avgTimeMs && overall.avgTimeMs && b.avgTimeMs > overall.avgTimeMs * 1.4) {
      reasons.push("1 問あたり平均より " + Math.round((b.avgTimeMs - overall.avgTimeMs) / 1000) + " 秒多くかかっています");
      sc += 8;
    }
    if (b.hintRate != null && b.hintRate > 30) {
      reasons.push("ヒントを使う割合が " + b.hintRate + "%");
      sc += 5;
    }
    if (b.skipRate != null && b.skipRate > 25) {
      reasons.push("飛ばした割合が " + b.skipRate + "%");
      sc += 5;
    }
    if (!reasons.length) return null;
    return {
      kind: kind,
      key: b.key,
      label: kind === "questionType" ? L.typeLabel(b.key)
           : kind === "subject" ? L.subjectLabel(b.key) : b.key,
      kindLabel: kind === "questionType" ? "問題の形式" : kind === "subject" ? "科目" : "単元",
      attempts: b.answered,
      gradedCount: b.gradedCount,
      accuracy: b.accuracy,
      recentAccuracy: recent.accuracy,
      avgTimeMs: b.avgTimeMs,
      severity: sc >= 45 ? "high" : sc >= 22 ? "medium" : "low",
      severityScore: Math.round(sc),
      reasons: reasons
    };
  }
  function recentOf(answers, kind, key, n) {
    var rows = arr(answers).filter(function (a) { return a[kind] === key; })
      .sort(function (a, b) { return str(b.occurredAt).localeCompare(str(a.occurredAt)); })
      .slice(0, n);
    var g = 0, c = 0;
    rows.forEach(function (a) {
      if (a.isCorrect === true) { c++; g++; } else if (a.isCorrect === false) g++;
    });
    return { graded: g, accuracy: g ? pct(c / g) : null };
  }

  /* ══════════════════════════════════════════════════════════════════
     5) 学習の習慣（曜日・時間帯）
     ・記録が少ないうちは「まだ分からない」と返す。断定しない。
     ══════════════════════════════════════════════════════════════════ */
  var WD = ["日", "月", "火", "水", "木", "金", "土"];
  function habits(f) {
    var c = ctx(f);
    var sessions = L.listSessions(filterOf(c));
    var enough = sessions.length >= MIN_FOR_HABIT;
    var byDow = WD.map(function (l, i) {
      return { key: i, label: l, sessions: 0, minutes: 0, correct: 0, graded: 0, accuracy: null };
    });
    var byHour = [];
    for (var h = 0; h < 24; h++) byHour.push({ key: h, label: h + "時", sessions: 0, minutes: 0, correct: 0, graded: 0, accuracy: null });

    sessions.forEach(function (s) {
      var t = Date.parse(s.completedAt);
      if (!isFinite(t)) return;
      var d = new Date(t);
      var mins = Math.round(((s.activeDurationSeconds != null ? s.activeDurationSeconds : s.durationSeconds) || 0) / 60);
      var g = (s.correctCount || 0) + (s.incorrectCount || 0);
      [byDow[d.getDay()], byHour[d.getHours()]].forEach(function (b) {
        b.sessions++; b.minutes += mins; b.correct += s.correctCount || 0; b.graded += g;
      });
    });
    [byDow, byHour].forEach(function (list) {
      list.forEach(function (b) { b.accuracy = b.graded >= 5 ? pct(b.correct / b.graded) : null; });
    });

    var streak = streakDays();
    var best = null;
    if (enough) {
      byHour.forEach(function (b) {
        if (b.accuracy == null || b.graded < 8) return;
        if (!best || b.accuracy > best.accuracy) best = b;
      });
    }
    return {
      enough: enough,
      need: enough ? 0 : Math.max(0, MIN_FOR_HABIT - sessions.length),
      byDow: byDow, byHour: byHour,
      streakDays: streak,
      studyDays: uniqueDays(sessions),
      avgSessionMinutes: sessions.length
        ? Math.round(sessions.reduce(function (a, s) {
            return a + ((s.activeDurationSeconds != null ? s.activeDurationSeconds : s.durationSeconds) || 0);
          }, 0) / sessions.length / 60)
        : null,
      bestHour: best
    };
  }
  function uniqueDays(sessions) {
    var m = Object.create(null);
    arr(sessions).forEach(function (s) { if (s.localDate) m[s.localDate] = 1; });
    return Object.keys(m).length;
  }
  function streakDays() {
    var m = Object.create(null);
    L.listSessions({}).forEach(function (s) { if (s.localDate) m[s.localDate] = 1; });
    var t0 = L.dayStart(Date.now());
    var base = m[L.localDate(t0)] ? t0 : (m[L.localDate(t0 - DAY)] ? t0 - DAY : 0);
    if (!base) return 0;
    var n = 0, k = base;
    while (m[L.localDate(k)]) { n++; k -= DAY; }
    return n;
  }

  /* ══════════════════════════════════════════════════════════════════
     6) 次のおすすめ
     ・実データからしか作らない。無ければ空を返す（適当な提案をしない）。
     ══════════════════════════════════════════════════════════════════ */
  function recommendations(f) {
    var c = ctx(f);
    var out = [];
    var weak = weakness(f);
    weak.slice(0, 2).forEach(function (w) {
      out.push({
        id: "weak:" + w.kind + ":" + w.key,
        title: w.label + " を復習する",
        reason: w.reasons[0],
        action: "review",
        payload: { kind: w.kind, key: w.key },
        severity: w.severity
      });
    });

    /* 採点待ちが残っている */
    var pending = L.listSessions(filterOf(c)).filter(function (s) { return (s.pendingCount || 0) > 0; });
    if (pending.length) {
      out.push({
        id: "pending",
        title: "採点待ちの答案が " + pending.length + " 件あります",
        reason: "記述の採点が終わると、点数と分析が確定します",
        action: "open-result",
        payload: { sessionId: pending[0].id }
      });
    }

    /* しばらく解いていないプリセット */
    var stale = staleSessions();
    if (stale) {
      out.push({
        id: "stale:" + stale.presetId,
        title: "「" + stale.title + "」を " + stale.days + " 日ぶりに解く",
        reason: "最後に解いたのは " + stale.days + " 日前です",
        action: "start-preset",
        payload: { presetId: stale.presetId }
      });
    }

    /* Mock で落としている形式 */
    var mockWeak = mockWeakType(c);
    if (mockWeak) {
      out.push({
        id: "mocktype:" + mockWeak.key,
        title: mockWeak.label + " を練習する",
        reason: "試験での正答率が " + mockWeak.accuracy + "% です",
        action: "practice-type",
        payload: { type: mockWeak.key }
      });
    }
    return out.slice(0, 3);
  }
  function staleSessions() {
    var byPreset = Object.create(null);
    L.listSessions({}).forEach(function (s) {
      if (!s.presetId) return;
      var t = Date.parse(s.completedAt);
      if (!isFinite(t)) return;
      if (!byPreset[s.presetId] || t > byPreset[s.presetId].ts) {
        byPreset[s.presetId] = { ts: t, title: s.title || "プリセット", presetId: s.presetId };
      }
    });
    var best = null;
    Object.keys(byPreset).forEach(function (k) {
      var d = Math.floor((Date.now() - byPreset[k].ts) / DAY);
      if (d < 7) return;
      if (!best || d > best.days) best = { presetId: k, title: byPreset[k].title, days: d };
    });
    return best;
  }
  function mockWeakType(c) {
    var ans = L.listAnswers({ from: c.from, to: c.to, source: "quick_mock" });
    if (!ans.length) return null;
    var rows = groupBy(ans, "questionType").filter(function (b) {
      return b.gradedCount >= MIN_FOR_WEAK && b.accuracy != null && b.accuracy < 60;
    });
    if (!rows.length) return null;
    rows.sort(function (a, b) { return a.accuracy - b.accuracy; });
    rows[0].label = L.typeLabel(rows[0].key);
    return rows[0];
  }

  /* ══════════════════════════════════════════════════════════════════
     7) Mock の分析
     ══════════════════════════════════════════════════════════════════ */
  function mocks(f) {
    var c = ctx(f);
    var list = L.listSessions({ from: c.from, to: c.to, source: "quick_mock" });
    var rows = list.map(function (s) {
      return {
        sessionId: s.id, resultId: s.resultId, title: s.title || "試験",
        completedAt: s.completedAt, localDate: s.localDate,
        score: s.score, maxScore: s.maxScore,
        scoreRatio: s.scoreRatio != null ? pct(s.scoreRatio) : null,
        pendingCount: s.pendingCount || 0,
        answeredCount: s.answeredCount, questionCount: s.questionCount,
        finishedAll: (s.skippedCount || 0) === 0,
        minutes: Math.round(((s.activeDurationSeconds != null ? s.activeDurationSeconds : s.durationSeconds) || 0) / 60),
        expired: !!s.expired
      };
    });
    var done = rows.filter(function (r) { return r.scoreRatio != null; });
    return {
      count: rows.length,
      rows: rows,
      avgScoreRatio: done.length ? r1(done.reduce(function (a, r) { return a + r.scoreRatio; }, 0) / done.length) : null,
      bestScoreRatio: done.length ? Math.max.apply(null, done.map(function (r) { return r.scoreRatio; })) : null,
      finishRate: rows.length ? pct(rows.filter(function (r) { return r.finishedAll; }).length / rows.length) : null,
      pendingTotal: rows.reduce(function (a, r) { return a + r.pendingCount; }, 0),
      /* 前回との差。1 回しか無ければ比べない。 */
      lastDelta: done.length >= 2 ? r1(done[0].scoreRatio - done[1].scoreRatio) : null
    };
  }

  /* ══════════════════════════════════════════════════════════════════
     8) 画面が 1 回で取れるまとめ
     ══════════════════════════════════════════════════════════════════ */
  function dashboard(f) {
    var c = ctx(f);
    var s = summary(f);
    var hasAny = L.listSessions({}).length > 0;
    return {
      range: c.range, from: c.from, to: c.to,
      hasAnyRecord: hasAny,
      hasRangeRecord: s.current.sessionCount > 0,
      summary: s,
      trend: trend(f),
      subjects: bySubject(f),
      types: byType(f),
      modes: byMode(f),
      sources: bySource(f),
      weakness: weakness(f),
      habits: habits(f),
      mocks: mocks(f),
      recommendations: recommendations(f)
    };
  }

  VQ2.analytics = {
    MIN_FOR_TREND: MIN_FOR_TREND, MIN_FOR_FACET: MIN_FOR_FACET,
    MIN_FOR_WEAK: MIN_FOR_WEAK, MIN_FOR_HABIT: MIN_FOR_HABIT,
    summary: summary, trend: trend,
    bySubject: bySubject, byUnit: byUnit, byType: byType, byMode: byMode, bySource: bySource,
    weakness: weakness, habits: habits, recommendations: recommendations, mocks: mocks,
    dashboard: dashboard, streakDays: streakDays
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
