/* ══════════════════════════════════════════════════════════════════════
   学習データの統合（LearningSession / LearningAnswer / LearningEvent）

   これまで、学習の結果は 3 か所へ別々に落ちていた。

     ・これまでのクイズ  → localStorage "wordPractice.analytics.sessions.v1"
                           （ホームと旧 Insight だけが読む）
     ・新しいクイズ画面  → "vq2.results.v1"（結果画面だけが読む）
     ・Quick Mock        → "vq2.results.v1"（同上）

   つまり **新しいクイズと Quick Mock は、ホームにも Insight にも出ていなかった。**
   ここが「解いても、どこにも積み上がらない」の正体。

   このファイルは、どの入口から来た学習でも 1 つの形へそろえて記録し、
   ホーム・Insight・おすすめが同じ数字を見られるようにする。

   決めごと
   ・**二重に数えない。** 同じ結果を何度渡しても、セッションは 1 本にまとまる
     （id は結果 id から決める）。
   ・**AI 採点待ちを 0 点として確定しない。** 保留は保留のまま数え、
     確定してから点に入れる。
   ・**答えの中身は保存しない。** 正誤・点・時間・形式・科目だけを持つ
     （答案そのものは結果レコードにある。分析に要らないものは持たない）。
   ・**分からないものを作らない。** 単元が無い、時間が残っていない、は null。
   ・日付の境目は端末の時計に合わせる（日本の利用者なら JST）。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var Q = VQ2.qtypes;

  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function isObj(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function str(v) { return v === undefined || v === null ? "" : String(v); }
  function r2(n) { return Math.round(n * 100) / 100; }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  var DAY = 86400000;
  var SCHEMA_VERSION = 1;

  var K = {
    sessions: "vq2.learn.sessions.v1",
    answers:  "vq2.learn.answers.v1",
    events:   "vq2.learn.events.v1",
    daily:    "vq2.learn.daily.v1",
    meta:     "vq2.learn.meta.v1"
  };
  /* localStorage を溢れさせないための上限。古いものから落ちる。 */
  var CAP = { sessions: 500, answers: 4000, events: 600, daily: 500 };

  var LEGACY_SESSIONS_KEY = "wordPractice.analytics.sessions.v1";
  var LEGACY_CAP = 500;

  /* ══════════════════════════════════════════════════════════════════
     1) 入れ物
     ══════════════════════════════════════════════════════════════════ */
  function owner() {
    try { if (VQ2.store && VQ2.store.currentOwnerId) return VQ2.store.currentOwnerId(); } catch (e) {}
    return "local";
  }
  function readAll(key) {
    try {
      var v = JSON.parse(root.localStorage.getItem(key) || "[]");
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }
  function writeAll(key, list) {
    try { root.localStorage.setItem(key, JSON.stringify(list)); return { ok: true }; }
    catch (e) { return { ok: false, error: "QUOTA", message: "保存領域が足りません。" }; }
  }
  function mineOf(list, who) {
    var me = who || owner();
    return arr(list).filter(function (r) { return r && (r.userId === me || (!r.userId && me === "local")); });
  }
  function nowIso() { return new Date().toISOString(); }
  function tsOf(iso) {
    if (isNum(iso)) return iso;
    var t = Date.parse(str(iso));
    return isFinite(t) ? t : 0;
  }
  /* その日のはじまり。端末の時計に合わせる（日本なら JST の 0 時）。 */
  function dayStart(t) { var d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function localDate(t) {
    var d = new Date(t);
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }
  function newId(p) {
    return p + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* ══════════════════════════════════════════════════════════════════
     2) 言葉
     ══════════════════════════════════════════════════════════════════ */
  var SOURCES = {
    preset:          "プリセット",
    quick_mock:      "Quick Mock",
    pre_exam:        "試験前チェック",
    practice:        "練習",
    review:          "復習",
    daily_challenge: "今日の 1 問",
    vocabuspeak:     "VocabuSpeak（英語）",
    manual_quiz:     "自分で作った問題",
    shared_quiz:     "共有された問題",
    legacy:          "これまでの学習"
  };
  var MODES = {
    normal:         "通常",
    study:          "学習",
    practice:       "練習",
    mock:           "試験",
    pre_exam:       "試験前",
    mastery:        "完全習得",
    adaptive:       "適応",
    weakness_focus: "苦手集中",
    time_attack:    "タイムアタック",
    survival:       "サバイバル",
    unknown:        "不明"
  };
  function sourceLabel(id) { return SOURCES[str(id)] || "その他"; }
  function modeLabel(id) { return MODES[str(id)] || str(id) || "不明"; }
  function typeLabel(id) {
    if (Q && Q.get && Q.get(id)) return Q.shortLabel(id);
    return str(id) || "その他";
  }
  function subjectLabel(s) {
    if (VQ2.library && VQ2.library.subjectLabel) {
      try { return VQ2.library.subjectLabel(s); } catch (e) {}
    }
    return str(s);
  }

  /* ══════════════════════════════════════════════════════════════════
     3) 結果レコード → 学習セッション
     ・入口（プリセット / Quick Mock / 復習）が違っても、同じ形にする。
     ・同じ結果を何度渡しても 1 本にまとまる（id を結果から決める）。
     ══════════════════════════════════════════════════════════════════ */
  function sessionIdOf(result) {
    return "ls_" + str(result && (result.id || result.sessionId) || newId("r"));
  }
  function sourceOf(result, opts) {
    if (opts && opts.source) return str(opts.source);
    /* 結果そのものに書いてあるときも受ける。ここを見ないと、
       呼び側が result.source を入れても静かに "preset" に落ちる。 */
    if (result && SOURCES[str(result.source)]) return str(result.source);
    var kind = str(result && result.kind);
    if (kind === "mock" || kind === "exam") return "quick_mock";
    if (str(result && result.mode) === "review") return "review";
    return "preset";
  }
  function modeOf(result) {
    var m = str(result && result.mode);
    if (MODES[m]) return m;
    if (str(result && result.kind) === "mock") return "mock";
    return "normal";
  }

  /* 問題 1 問から、分析に使う「どの分野か」を取り出す。
     無いものは作らない（推測して埋めない）。 */
  function facetOf(snap, fallback) {
    snap = snap || {};
    fallback = fallback || {};
    var meta = isObj(snap.metadata) ? snap.metadata : {};
    return {
      subject: str(snap.subject || meta.subject || fallback.subject) || null,
      unit: str(snap.unit || snap.topic || meta.unit || meta.topic || fallback.unit) || null,
      tags: arr(snap.tags || meta.tags).map(str).slice(0, 6),
      difficulty: isNum(snap.difficulty) ? snap.difficulty
        : (str(snap.difficulty) ? str(snap.difficulty) : null)
    };
  }

  /* 結果を取り込む。すでにあれば上書き（＝二重に数えない）。 */
  function recordResult(result, opts) {
    opts = opts || {};
    if (!isObj(result)) return { ok: false, error: "BAD_RESULT" };
    var me = opts.userId || owner();
    var sid = sessionIdOf(result);
    var items = arr(result.items);
    var snaps = Object.create(null);
    arr(result.questionsSnapshot).forEach(function (s) { if (s && s.id) snaps[s.id] = s; });

    var fallback = {
      subject: str(opts.subject || result.subject || (result.preset && result.preset.subjectId)) || null,
      unit: str(opts.unit || result.unit) || null
    };

    /* ── 集計。AI 採点待ちは「保留」として別に数える。0 点にしない。 ── */
    var answered = 0, correct = 0, wrong = 0, skipped = 0, pending = 0;
    var score = 0, maxScore = 0, pendingMax = 0, timeMs = 0;
    var typeCounts = Object.create(null);
    var answerRows = [];

    items.forEach(function (it) {
      if (!it || !it.questionId) return;
      var snap = snaps[it.questionId] || {};
      var f = facetOf(snap, fallback);
      var type = str(it.type || snap.type) || "unknown";
      var isPending = it.answered && (it.score === null || it.score === undefined);
      typeCounts[type] = (typeCounts[type] || 0) + 1;
      maxScore += isNum(it.maxScore) ? it.maxScore : 0;
      timeMs += isNum(it.timeMs) ? it.timeMs : 0;
      if (!it.answered) { skipped++; }
      else {
        answered++;
        if (isPending) { pending++; pendingMax += isNum(it.maxScore) ? it.maxScore : 0; }
        else {
          score += isNum(it.score) ? it.score : 0;
          if (it.correct === true || it.isCorrect === true) correct++; else wrong++;
        }
      }
      answerRows.push({
        id: sid + ":" + it.questionId,
        sessionId: sid,
        userId: me,
        questionId: str(it.questionId),
        questionType: type,
        engine: str(it.engine) || (Q ? Q.engineOf(type) : "") || null,
        subject: f.subject,
        unit: f.unit,
        tags: f.tags,
        difficulty: f.difficulty,
        /* 答えの中身は持たない。分析に要らないうえ、持つと個人の書いた文が増える。 */
        isCorrect: it.answered ? (isPending ? null : (it.correct === true || it.isCorrect === true)) : null,
        score: isPending ? null : (isNum(it.score) ? it.score : 0),
        maxScore: isNum(it.maxScore) ? it.maxScore : 0,
        partialCredit: isNum(it.partialCredit) ? it.partialCredit : null,
        responseTimeMs: isNum(it.timeMs) && it.timeMs > 0 ? it.timeMs : null,
        hintUsed: !!it.hintUsed,
        skipped: !it.answered,
        changedAnswerCount: isNum(it.changeCount) ? it.changeCount : null,
        confidence: isNum(it.confidence) ? it.confidence : null,
        evaluator: isPending ? "ai" : (str(it.method) === "ai" ? "ai" : "rule"),
        evaluationStatus: isPending ? "pending" : (it.requiresReview ? "manual_review" : "completed"),
        occurredAt: str(result.finishedAt) || nowIso()
      });
    });

    var startedTs = tsOf(result.startedAt) || (tsOf(result.finishedAt) - (result.elapsedMs || 0));
    var finishedTs = tsOf(result.finishedAt) || Date.now();
    if (!startedTs || startedTs > finishedTs) startedTs = finishedTs - (result.elapsedMs || 0);

    var graded = correct + wrong;
    var session = {
      id: sid,
      userId: me,
      schemaVersion: SCHEMA_VERSION,

      source: sourceOf(result, opts),
      sourceId: str(result.presetId || result.mockId || result.sessionId || ""),
      presetId: str(result.presetId) || null,
      mockId: str(result.mockId || (str(result.kind) === "mock" ? result.presetId : "")) || null,
      resultId: str(result.id) || null,

      mode: modeOf(result),
      status: pending > 0 ? "scoring" : "completed",

      title: str(result.presetName || result.title || ""),
      subject: fallback.subject || dominant(answerRows, "subject"),
      unit: fallback.unit || dominant(answerRows, "unit"),

      startedAt: new Date(startedTs).toISOString(),
      completedAt: new Date(finishedTs).toISOString(),
      localDate: localDate(finishedTs),

      durationSeconds: Math.max(0, Math.round((finishedTs - startedTs) / 1000)),
      activeDurationSeconds: timeMs > 0 ? Math.round(timeMs / 1000) : null,

      questionCount: items.length,
      answeredCount: answered,
      correctCount: correct,
      incorrectCount: wrong,
      skippedCount: skipped,
      pendingCount: pending,

      score: r2(score),
      maxScore: r2(maxScore),
      pendingMaxScore: r2(pendingMax),
      /* 確定している分だけで見た正答率。保留は分母にも入れない。 */
      accuracy: graded > 0 ? r2(correct / graded) : null,
      scoreRatio: (maxScore - pendingMax) > 0 ? r2(score / (maxScore - pendingMax)) : null,

      questionTypeCounts: typeCounts,
      expired: !!result.expired,
      deviceType: deviceType(),

      createdAt: nowIso(),
      updatedAt: nowIso()
    };

    /* ── 保存（上書き＝二重に数えない） ── */
    var sessions = readAll(K.sessions);
    var idx = -1;
    for (var i = 0; i < sessions.length; i++) if (sessions[i] && sessions[i].id === sid) { idx = i; break; }
    var created = idx < 0;
    if (!created) session.createdAt = sessions[idx].createdAt || session.createdAt;
    if (created) sessions.unshift(session); else sessions[idx] = session;
    if (sessions.length > CAP.sessions) sessions = sessions.slice(0, CAP.sessions);
    writeAll(K.sessions, sessions);

    var answers = readAll(K.answers).filter(function (a) { return !a || a.sessionId !== sid; });
    answers = answerRows.concat(answers);
    if (answers.length > CAP.answers) answers = answers.slice(0, CAP.answers);
    writeAll(K.answers, answers);

    pushEvent(created ? "learning_session_completed" : "learning_session_rescored", {
      sessionId: sid, source: session.source, mode: session.mode,
      questionCount: session.questionCount, pendingCount: session.pendingCount
    }, { idempotencyKey: sid + ":" + (created ? "done" : "rescore:" + session.updatedAt) });

    touchDaily(session.localDate);
    mirrorLegacy(session);
    return { ok: true, session: session, answers: answerRows, created: created };
  }

  /* いちばん多い値。ばらばらなら null（無理に 1 つへ決めない）。 */
  function dominant(rows, key) {
    var m = Object.create(null), best = null, bestN = 0, total = 0;
    arr(rows).forEach(function (r) {
      var v = r && r[key];
      if (!v) return;
      total++;
      m[v] = (m[v] || 0) + 1;
      if (m[v] > bestN) { bestN = m[v]; best = v; }
    });
    if (!total || bestN / total < 0.5) return best && bestN >= 2 ? best : (bestN === total ? best : null);
    return best;
  }
  function deviceType() {
    try {
      var w = root.innerWidth || 0;
      if (!w) return null;
      return w < 720 ? "mobile" : w < 1100 ? "tablet" : "desktop";
    } catch (e) { return null; }
  }

  /* AI 採点が確定したら呼ぶ。保留を点に入れ直す。 */
  function applyPendingScores(resultId, opts) {
    var result = null;
    try { result = VQ2.store ? VQ2.store.results.get(str(resultId)) : null; } catch (e) {}
    if (!result) return { ok: false, error: "NOT_FOUND" };
    return recordResult(result, opts);
  }

  /* ══════════════════════════════════════════════════════════════════
     4) 学習イベント
     ・同じことが 2 回届いても 1 回として扱う（idempotencyKey）。
     ══════════════════════════════════════════════════════════════════ */
  function pushEvent(name, payload, opts) {
    opts = opts || {};
    var key = str(opts.idempotencyKey);
    var list = readAll(K.events);
    if (key) {
      for (var i = 0; i < list.length; i++) {
        if (list[i] && list[i].idempotencyKey === key) return { ok: true, duplicated: true };
      }
    }
    var ev = {
      id: newId("ev"),
      eventName: str(name),
      userId: opts.userId || owner(),
      sessionId: opts.sessionId || (payload && payload.sessionId) || null,
      sourceId: opts.sourceId || null,
      questionId: opts.questionId || null,
      occurredAt: nowIso(),
      clientOccurredAt: opts.clientOccurredAt || null,
      payload: isObj(payload) ? payload : null,
      idempotencyKey: key || null,
      schemaVersion: SCHEMA_VERSION
    };
    list.unshift(ev);
    if (list.length > CAP.events) list = list.slice(0, CAP.events);
    writeAll(K.events, list);
    return { ok: true, event: ev };
  }

  /* ══════════════════════════════════════════════════════════════════
     5) これまでの画面との橋渡し
     ・ホームと旧 Insight は "wordPractice.analytics.sessions.v1" を読む。
       新しいクイズ・Quick Mock の結果も、同じ形で 1 行だけ書き足す。
     ・**id を決め打ちにして、同じセッションを二度足さない。**
     ══════════════════════════════════════════════════════════════════ */
  function mirrorLegacy(session) {
    if (!session) return { ok: false };
    var legacyId = "vq2:" + session.id;
    var list = [];
    try {
      var raw = JSON.parse(root.localStorage.getItem(LEGACY_SESSIONS_KEY) || "[]");
      list = Array.isArray(raw) ? raw : [];
    } catch (e) { list = []; }
    var row = {
      id: legacyId,
      ts: tsOf(session.completedAt) || Date.now(),
      date: session.localDate,
      presetId: str(session.presetId || session.sourceId || ""),
      presetName: str(session.title),
      vocabSetId: "",
      mode: session.mode === "mock" ? "MOCK" : "CHOICE",
      total: session.questionCount,
      correct: session.correctCount,
      accuracy: session.accuracy,
      durationMs: session.activeDurationSeconds != null
        ? session.activeDurationSeconds * 1000
        : session.durationSeconds * 1000,
      wrongIds: [],
      timedOutCount: null,
      /* この 2 つがあるので、こちらが書いた行だと後から分かる */
      source: session.source,
      vq2SessionId: session.id,
      updatedAt: Date.now(),
      deletedAt: 0
    };
    var found = -1;
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === legacyId) { found = i; break; }
    if (found >= 0) list[found] = row; else list.push(row);
    while (list.length > LEGACY_CAP) list.shift();
    try { root.localStorage.setItem(LEGACY_SESSIONS_KEY, JSON.stringify(list)); } catch (e) { return { ok: false }; }
    return { ok: true, id: legacyId };
  }

  /* これまでの記録（旧クイズ）を学習セッションとして読む。
     ・回答 1 問ずつの記録は残っていないので、**作らない**。
     ・単元・形式・時間が無いものは null のままにする。 */
  function importLegacy(opts) {
    opts = opts || {};
    var me = opts.userId || owner();
    var list = [];
    try {
      var raw = JSON.parse(root.localStorage.getItem(LEGACY_SESSIONS_KEY) || "[]");
      list = Array.isArray(raw) ? raw : [];
    } catch (e) { list = []; }
    var sessions = readAll(K.sessions);
    var have = Object.create(null);
    sessions.forEach(function (s) { if (s) have[s.id] = 1; });
    var added = 0;
    list.forEach(function (r) {
      if (!r || r.deletedAt) return;
      if (r.vq2SessionId) return;                 /* こちらが書いた行は取り込まない */
      var id = "ls_legacy_" + str(r.id);
      if (have[id]) return;
      var t = tsOf(r.ts) || 0;
      if (!t) return;
      var total = Number(r.total) || 0;
      var correct = Number(r.correct) || 0;
      var dur = isNum(Number(r.durationMs)) ? Number(r.durationMs) : null;
      sessions.push({
        id: id, userId: me, schemaVersion: SCHEMA_VERSION,
        source: "legacy", sourceId: str(r.presetId), presetId: str(r.presetId) || null,
        mockId: null, resultId: null,
        mode: str(r.mode) === "HAND" ? "practice" : "normal",
        status: "completed",
        title: str(r.presetName),
        subject: null, unit: null,
        startedAt: new Date(t - (dur || 0)).toISOString(),
        completedAt: new Date(t).toISOString(),
        localDate: localDate(t),
        durationSeconds: dur != null ? Math.round(dur / 1000) : 0,
        activeDurationSeconds: dur != null ? Math.round(dur / 1000) : null,
        questionCount: total, answeredCount: total,
        correctCount: correct, incorrectCount: Math.max(0, total - correct),
        skippedCount: 0, pendingCount: 0,
        score: correct, maxScore: total, pendingMaxScore: 0,
        accuracy: total > 0 ? r2(correct / total) : null,
        scoreRatio: total > 0 ? r2(correct / total) : null,
        /* 形式が残っていない。unknown を作らず、空のままにする。 */
        questionTypeCounts: null,
        expired: false, deviceType: null,
        createdAt: new Date(t).toISOString(), updatedAt: nowIso(),
        imported: true
      });
      added++;
    });
    if (added) {
      sessions.sort(function (a, b) { return tsOf(b.completedAt) - tsOf(a.completedAt); });
      if (sessions.length > CAP.sessions) sessions = sessions.slice(0, CAP.sessions);
      writeAll(K.sessions, sessions);
      rebuildDaily();
    }
    return { ok: true, added: added };
  }

  /* 保存済みの結果（vq2.results.v1）を、まとめて取り込む。 */
  function backfill(opts) {
    opts = opts || {};
    var out = { ok: true, results: 0, created: 0, updated: 0, legacy: 0, failed: [] };
    var list = [];
    try { list = VQ2.store ? VQ2.store.results.list() : []; } catch (e) { list = []; }
    list.forEach(function (r) {
      try {
        var res = recordResult(r, opts);
        out.results++;
        if (res.ok) { if (res.created) out.created++; else out.updated++; }
        else out.failed.push({ id: r && r.id, error: res.error });
      } catch (e) {
        out.failed.push({ id: r && r.id, error: str(e && e.message) });
      }
    });
    var leg = importLegacy(opts);
    out.legacy = leg.added || 0;
    rebuildDaily();
    return out;
  }

  /* ══════════════════════════════════════════════════════════════════
     6) 日次の集計
     ・画面を出すたびに全回答を数え直さない。
     ・セッションを足したら、その日だけ作り直す。
     ══════════════════════════════════════════════════════════════════ */
  function touchDaily(dateStr) {
    var rows = readAll(K.daily).filter(function (d) { return !d || d.localDate !== dateStr; });
    var built = buildDailyFor(dateStr);
    if (built) rows.unshift(built);
    rows.sort(function (a, b) { return str(b.localDate).localeCompare(str(a.localDate)); });
    if (rows.length > CAP.daily) rows = rows.slice(0, CAP.daily);
    writeAll(K.daily, rows);
    return built;
  }
  function rebuildDaily() {
    var ss = mineOf(readAll(K.sessions));
    var days = Object.create(null);
    ss.forEach(function (s) { if (s && s.localDate) days[s.localDate] = 1; });
    var rows = Object.keys(days).map(buildDailyFor).filter(Boolean);
    rows.sort(function (a, b) { return str(b.localDate).localeCompare(str(a.localDate)); });
    if (rows.length > CAP.daily) rows = rows.slice(0, CAP.daily);
    writeAll(K.daily, rows);
    return rows;
  }
  function buildDailyFor(dateStr) {
    var me = owner();
    var ss = mineOf(readAll(K.sessions), me).filter(function (s) { return s.localDate === dateStr; });
    if (!ss.length) return null;
    var ids = Object.create(null);
    ss.forEach(function (s) { ids[s.id] = 1; });
    var as = mineOf(readAll(K.answers), me).filter(function (a) { return ids[a.sessionId]; });

    var d = {
      userId: me, localDate: dateStr,
      sessionCount: ss.length,
      completedSessionCount: ss.filter(function (s) { return s.status === "completed"; }).length,
      answeredCount: 0, correctCount: 0, incorrectCount: 0, pendingCount: 0,
      score: 0, maxScore: 0,
      activeDurationSeconds: 0,
      presetSessionCount: 0, mockSessionCount: 0,
      subjectBreakdown: Object.create(null),
      typeBreakdown: Object.create(null),
      updatedAt: nowIso()
    };
    ss.forEach(function (s) {
      d.answeredCount += s.answeredCount || 0;
      d.correctCount += s.correctCount || 0;
      d.incorrectCount += s.incorrectCount || 0;
      d.pendingCount += s.pendingCount || 0;
      d.score += s.score || 0;
      d.maxScore += s.maxScore || 0;
      d.activeDurationSeconds += (s.activeDurationSeconds != null ? s.activeDurationSeconds : s.durationSeconds) || 0;
      if (s.source === "quick_mock") d.mockSessionCount++; else d.presetSessionCount++;
    });
    as.forEach(function (a) {
      if (a.subject) {
        var b = d.subjectBreakdown[a.subject] || (d.subjectBreakdown[a.subject] =
          { answeredCount: 0, correctCount: 0, activeDurationSeconds: 0 });
        if (!a.skipped) b.answeredCount++;
        if (a.isCorrect === true) b.correctCount++;
        b.activeDurationSeconds += a.responseTimeMs ? Math.round(a.responseTimeMs / 1000) : 0;
      }
      var t = a.questionType || "unknown";
      var tb = d.typeBreakdown[t] || (d.typeBreakdown[t] = { answeredCount: 0, correctCount: 0 });
      if (!a.skipped) tb.answeredCount++;
      if (a.isCorrect === true) tb.correctCount++;
    });
    d.score = r2(d.score);
    d.maxScore = r2(d.maxScore);
    return d;
  }
  function daily(opts) {
    opts = opts || {};
    var rows = readAll(K.daily).filter(function (d) { return d && d.userId === owner(); });
    if (!rows.length) rows = rebuildDaily();
    if (opts.from) rows = rows.filter(function (d) { return d.localDate >= opts.from; });
    if (opts.to) rows = rows.filter(function (d) { return d.localDate <= opts.to; });
    return rows.sort(function (a, b) { return str(a.localDate).localeCompare(str(b.localDate)); });
  }

  /* ══════════════════════════════════════════════════════════════════
     7) 読み出しと絞り込み
     ══════════════════════════════════════════════════════════════════ */
  var RANGES = [
    { id: "7d", label: "7日", days: 7 },
    { id: "30d", label: "30日", days: 30 },
    { id: "90d", label: "90日", days: 90 },
    { id: "year", label: "今年", days: null },
    { id: "all", label: "全期間", days: null }
  ];
  function rangeBounds(id, now) {
    now = now || Date.now();
    var end = dayStart(now) + DAY - 1;
    if (id === "all") return { from: null, to: localDate(end), days: null };
    if (id === "year") {
      var y = new Date(now).getFullYear();
      return { from: y + "-01-01", to: localDate(end), days: null };
    }
    var r = null;
    RANGES.forEach(function (x) { if (x.id === id) r = x; });
    var days = (r && r.days) || 30;
    return { from: localDate(dayStart(now) - (days - 1) * DAY), to: localDate(end), days: days };
  }
  /* 1 つ前の同じ長さの期間。全期間・今年には「前」が無いので null。 */
  function previousBounds(id, now) {
    var b = rangeBounds(id, now);
    if (!b.days) return null;
    var end = dayStart(now || Date.now()) - b.days * DAY;
    return { from: localDate(end - (b.days - 1) * DAY), to: localDate(end), days: b.days };
  }

  function listSessions(f) {
    f = f || {};
    var list = mineOf(readAll(K.sessions));
    if (f.from) list = list.filter(function (s) { return s.localDate >= f.from; });
    if (f.to) list = list.filter(function (s) { return s.localDate <= f.to; });
    if (f.source) list = list.filter(function (s) { return s.source === f.source; });
    if (f.mode) list = list.filter(function (s) { return s.mode === f.mode; });
    if (f.subject) list = list.filter(function (s) { return s.subject === f.subject; });
    if (f.presetId) list = list.filter(function (s) { return s.presetId === f.presetId; });
    return list.sort(function (a, b) { return tsOf(b.completedAt) - tsOf(a.completedAt); });
  }
  function listAnswers(f) {
    f = f || {};
    var ss = listSessions(f);
    var ids = Object.create(null);
    ss.forEach(function (s) { ids[s.id] = 1; });
    var list = mineOf(readAll(K.answers)).filter(function (a) { return ids[a.sessionId]; });
    if (f.subject) list = list.filter(function (a) { return a.subject === f.subject; });
    if (f.type) list = list.filter(function (a) { return a.questionType === f.type; });
    return list;
  }
  function listEvents(f) {
    f = f || {};
    var list = mineOf(readAll(K.events));
    if (f.name) list = list.filter(function (e) { return e.eventName === f.name; });
    return list;
  }

  function deleteSession(id) {
    var sid = str(id);
    writeAll(K.sessions, readAll(K.sessions).filter(function (s) { return !s || s.id !== sid; }));
    writeAll(K.answers, readAll(K.answers).filter(function (a) { return !a || a.sessionId !== sid; }));
    /* 橋渡しで書いた行も消す（消したはずの記録が集計に残らないように） */
    try {
      var raw = JSON.parse(root.localStorage.getItem(LEGACY_SESSIONS_KEY) || "[]");
      if (Array.isArray(raw)) {
        root.localStorage.setItem(LEGACY_SESSIONS_KEY,
          JSON.stringify(raw.filter(function (r) { return !r || r.id !== "vq2:" + sid; })));
      }
    } catch (e) {}
    rebuildDaily();
    return { ok: true };
  }
  function clearAll() {
    [K.sessions, K.answers, K.events, K.daily].forEach(function (k) { writeAll(k, []); });
    return { ok: true };
  }

  /* ══════════════════════════════════════════════════════════════════
     8) 取りこぼさないための結線
     ・結果は 5 か所から保存される（クイズ・試験・AI 採点の確定 ×3）。
       1 か所ずつ足すと必ずどこかを忘れるので、**保存の出口 1 つ**に付ける。
     ・AI 採点が確定して保存し直されたときも、ここを通るので集計が更新される。
     ・二重に数えないのは recordResult 側が受け持つ（id が同じなら上書き）。
     ══════════════════════════════════════════════════════════════════ */
  function install() {
    if (!VQ2.store || !VQ2.store.results || VQ2.store.results.__learnHooked) return false;
    var orig = VQ2.store.results.put;
    VQ2.store.results.put = function (rec, opts) {
      var out = orig.call(this, rec, opts);
      try {
        if (out && out.ok !== false) recordResult(out.record || rec, {});
      } catch (e) {}
      return out;
    };
    VQ2.store.results.__learnHooked = true;
    return true;
  }

  VQ2.learning = {
    KEYS: K, RANGES: RANGES, SOURCES: SOURCES, MODES: MODES, SCHEMA_VERSION: SCHEMA_VERSION,
    install: install,
    LEGACY_SESSIONS_KEY: LEGACY_SESSIONS_KEY,
    sourceLabel: sourceLabel, modeLabel: modeLabel, typeLabel: typeLabel, subjectLabel: subjectLabel,
    localDate: localDate, dayStart: dayStart, rangeBounds: rangeBounds, previousBounds: previousBounds,
    recordResult: recordResult, applyPendingScores: applyPendingScores,
    event: pushEvent,
    mirrorLegacy: mirrorLegacy, importLegacy: importLegacy, backfill: backfill,
    daily: daily, rebuildDaily: rebuildDaily, buildDailyFor: buildDailyFor,
    listSessions: listSessions, listAnswers: listAnswers, listEvents: listEvents,
    deleteSession: deleteSession, clearAll: clearAll,
    _owner: owner
  };

  install();
})(typeof globalThis !== "undefined" ? globalThis : this);
