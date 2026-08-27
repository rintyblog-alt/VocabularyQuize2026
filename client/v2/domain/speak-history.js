/* ══════════════════════════════════════════════════════════════════════
   VocabuSpeak — 出題履歴と復習（§12 / §35）

   ・ユーザーごとに「何をいつ出したか」を持つ。ここが重複防止の土台。
   ・**すべて ownerId で分ける**。他の人の履歴と混ざらない。
   ・間違いは復習候補になる。ただし**細かいミスを全部は入れない**（重要度で選ぶ）。
   ・次にいつ出すかは、正解したかと習得度から決める（忘却曲線）。

   保存は localStorage。件数が増えるので、
   ・履歴は Variant ごとに 1 行だけ持つ（出題のたびに増やさない）
   ・上限を超えたら、習得済みで古いものから消す
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var ST = VQ2.store;
  if (!ST) throw new Error("VQ2.store must be loaded before speak-history.js");

  var K = {
    history: "vq2.speak.history.v1",     /* Variant ごとの出題履歴 */
    review:  "vq2.speak.review.v1",      /* 復習候補 */
    sessions:"vq2.speak.sessions.v1",    /* VocabuSpeak のセッション */
    prefs:   "vq2.speak.prefs.v1"        /* 設定（字幕・速度・音声の保存方針） */
  };
  var CAPS = { history: 6000, review: 400, sessions: 120 };
  var DAY = 24 * 60 * 60 * 1000;

  function str(v) { return v === undefined || v === null ? "" : String(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function num(v, d) { return isNum(v) ? v : d; }
  function nowIso() { return new Date().toISOString(); }
  function owner() { return ST.currentOwnerId(); }

  function readAll(key) {
    try {
      var raw = root.localStorage.getItem(key);
      var a = raw ? JSON.parse(raw) : [];
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }
  function writeAll(key, list) {
    try { root.localStorage.setItem(key, JSON.stringify(list)); return { ok: true }; }
    catch (e) { return { ok: false, error: "QUOTA" }; }
  }
  function mine(key) {
    var me = owner();
    return readAll(key).filter(function (r) { return str(r.userId) === me; });
  }

  /* ══════════════════════════════════════════════════════════════════
     1) 出題履歴
     ══════════════════════════════════════════════════════════════════ */
  function historyKeyOf(r) { return str(r.userId) + "|" + str(r.exerciseVariantId); }

  function listHistory() { return mine(K.history); }

  /* 出題のたびに引く形。Variant ID → 履歴 / Atom ID → 履歴の配列 */
  function indexHistory(list) {
    var byVariant = Object.create(null), byAtom = Object.create(null), byFamily = Object.create(null);
    arr(list || listHistory()).forEach(function (h) {
      byVariant[str(h.exerciseVariantId)] = h;
      (byAtom[str(h.contentAtomId)] || (byAtom[str(h.contentAtomId)] = [])).push(h);
      (byFamily[str(h.familyId)] || (byFamily[str(h.familyId)] = [])).push(h);
    });
    return { byVariant: byVariant, byAtom: byAtom, byFamily: byFamily };
  }

  /* 覚えた度合い（0〜1）。正解で上がり、間違いで下がる。
     1 回正解しただけで「覚えた」にしない（0.34 ずつしか上がらない）。 */
  function nextMastery(prev, correct, score) {
    var m = Math.max(0, Math.min(1, num(prev, 0)));
    if (correct) {
      var gain = isNum(score) ? 0.2 + 0.2 * Math.max(0, Math.min(1, score / 100)) : 0.34;
      return Math.min(1, m + gain);
    }
    return Math.max(0, m - 0.4);
  }
  /* 次にいつ出すか。間隔は習得度で伸ばす。 */
  var INTERVALS = [1, 2, 4, 8, 16, 32];
  function nextReviewAt(mastery, correct, from) {
    var base = isNum(from) ? from : Date.now();
    if (!correct) return new Date(base + INTERVALS[0] * DAY).toISOString();
    var idx = Math.min(INTERVALS.length - 1, Math.round(num(mastery, 0) * (INTERVALS.length - 1)));
    return new Date(base + INTERVALS[idx] * DAY).toISOString();
  }

  /* 1 問ぶんの結果を書き込む。**すでにある行を書き換える**（増やさない）。 */
  function record(one) {
    if (!isObj(one) || !str(one.exerciseVariantId)) return { ok: false, error: "BAD_ROW" };
    var me = owner();
    var all = readAll(K.history);
    var key = me + "|" + str(one.exerciseVariantId);
    var at = -1;
    for (var i = 0; i < all.length; i++) if (historyKeyOf(all[i]) === key) { at = i; break; }
    var t = nowIso();
    var prev = at >= 0 ? all[at] : null;
    var correct = one.correct === true;
    var score = isNum(one.score) ? one.score : null;
    var mastery = nextMastery(prev && prev.masteryLevel, correct, score);

    var row = {
      userId: me,
      contentAtomId: str(one.contentAtomId),
      exerciseVariantId: str(one.exerciseVariantId),
      familyId: str(one.familyId),
      firstSeenAt: prev ? str(prev.firstSeenAt) || t : t,
      lastSeenAt: t,
      seenCount: num(prev && prev.seenCount, 0) + 1,
      correctCount: num(prev && prev.correctCount, 0) + (correct ? 1 : 0),
      incorrectCount: num(prev && prev.incorrectCount, 0) + (one.answered === false ? 0 : (correct ? 0 : 1)),
      averageScore: score === null ? (prev ? prev.averageScore : undefined)
        : Math.round(((num(prev && prev.averageScore, score) * num(prev && prev.seenCount, 0)) + score)
                     / (num(prev && prev.seenCount, 0) + 1)),
      bestScore: score === null ? (prev ? prev.bestScore : undefined)
        : Math.max(num(prev && prev.bestScore, 0), score),
      lastScore: score === null ? (prev ? prev.lastScore : undefined) : score,
      lastConfidence: isNum(one.confidence) ? one.confidence : (prev ? prev.lastConfidence : undefined),
      masteryLevel: mastery,
      nextReviewAt: nextReviewAt(mastery, correct),
      lastActivityType: str(one.activityType) || (prev ? str(prev.lastActivityType) : ""),
      createdAt: prev ? str(prev.createdAt) || t : t,
      updatedAt: t
    };
    Object.keys(row).forEach(function (k) { if (row[k] === undefined) delete row[k]; });

    if (at >= 0) all[at] = row; else all.push(row);
    trim(all);
    var w = writeAll(K.history, all);
    return w.ok ? { ok: true, row: row } : w;
  }

  function recordMany(list) {
    var out = { ok: true, saved: 0, failed: 0 };
    arr(list).forEach(function (x) {
      var r = record(x);
      if (r.ok) out.saved++; else { out.failed++; out.ok = false; out.error = r.error; }
    });
    return out;
  }

  /* 上限を超えたら、**覚えたもので古いもの**から消す。
     間違えたままのものは残す（復習に要るため）。 */
  function trim(all) {
    if (all.length <= CAPS.history) return all;
    var drop = all.length - CAPS.history;
    var order = all.map(function (r, i) { return { i: i, r: r }; })
      .filter(function (x) { return num(x.r.masteryLevel, 0) >= 0.9; })
      .sort(function (a, b) { return Date.parse(a.r.lastSeenAt || 0) - Date.parse(b.r.lastSeenAt || 0); });
    var kill = Object.create(null);
    order.slice(0, drop).forEach(function (x) { kill[x.i] = 1; });
    var left = all.filter(function (_, i) { return !kill[i]; });
    /* それでも多いときは、いちばん古いものから消す */
    if (left.length > CAPS.history) {
      left.sort(function (a, b) { return Date.parse(b.lastSeenAt || 0) - Date.parse(a.lastSeenAt || 0); });
      left = left.slice(0, CAPS.history);
    }
    all.length = 0;
    Array.prototype.push.apply(all, left);
    return all;
  }

  /* ══════════════════════════════════════════════════════════════════
     2) 復習候補（§35）
     会話や問題のミスから作る。**細かいミスを全部は入れない**。
     ══════════════════════════════════════════════════════════════════ */
  var SEVERITY_ORDER = { high: 3, medium: 2, low: 1 };

  /* 重要度の決め方。伝わらない誤りほど高い。
     ・意味が変わる（時制・語順・否定）… high
     ・自然さの問題（冠詞・前置詞・丁寧さ）… medium
     ・ゆらぎ（大文字・句読点）… low  → **復習へ入れない** */
  var HIGH_TAGS = ["tense", "word_order", "negation", "subject_verb", "verb_form"];
  var MEDIUM_TAGS = ["article", "preposition", "politeness", "plural", "collocation"];
  function severityOf(o) {
    var tags = arr(o && o.grammarTags).map(str);
    if (tags.some(function (t) { return HIGH_TAGS.indexOf(t) >= 0; })) return "high";
    if (tags.some(function (t) { return MEDIUM_TAGS.indexOf(t) >= 0; })) return "medium";
    if (o && o.category === "pronunciation") return isNum(o.score) && o.score < 50 ? "high" : "medium";
    if (o && o.category === "listening") return "medium";
    /* 大文字・句読点だけの違いは復習にしない。 */
    var a = str(o && o.originalContent), b = str(o && o.correctedContent);
    if (a && b && SM() && SM().normText(a) === SM().normText(b)) return "low";
    return "medium";
  }
  function SM() { return VQ2.speakModel; }

  function addReviewCandidates(list, o) {
    o = o || {};
    var me = owner();
    var all = readAll(K.review);
    var mineNow = all.filter(function (r) { return str(r.userId) === me; });
    var added = [], skipped = [];
    arr(list).forEach(function (c) {
      var sev = str(c.severity) || severityOf(c);
      if (sev === "low") { skipped.push({ reason: "小さな違いのため入れませんでした", content: str(c.originalContent) }); return; }
      var origin = SM() ? SM().normText(c.originalContent) : str(c.originalContent);
      var dup = mineNow.filter(function (r) {
        return (SM() ? SM().normText(r.originalContent) : str(r.originalContent)) === origin
            && str(r.category) === str(c.category);
      })[0];
      if (dup) {
        /* 同じミスをまた出した。重要度を上げて、予定日を今日へ寄せる。 */
        dup.severity = SEVERITY_ORDER[sev] > SEVERITY_ORDER[str(dup.severity)] ? sev : dup.severity;
        dup.repeatCount = num(dup.repeatCount, 1) + 1;
        dup.nextReviewAt = new Date(Date.now() + DAY).toISOString();
        dup.masteryLevel = Math.max(0, num(dup.masteryLevel, 0) - 0.3);
        dup.updatedAt = nowIso();
        return;
      }
      var row = {
        id: "rv_" + Math.random().toString(36).slice(2, 9),
        userId: me,
        sourceSessionId: str(o.sessionId || c.sourceSessionId),
        category: ["grammar", "vocabulary", "pronunciation", "listening", "expression"]
          .indexOf(str(c.category)) >= 0 ? str(c.category) : "grammar",
        severity: sev,
        originalContent: str(c.originalContent),
        correctedContent: str(c.correctedContent) || undefined,
        explanationJa: str(c.explanationJa) || undefined,
        contentAtomId: str(c.contentAtomId) || undefined,
        familyId: str(c.familyId) || undefined,
        grammarTags: arr(c.grammarTags).map(str).slice(0, 6),
        recommendedActivityTypes: arr(c.recommendedActivityTypes).map(str).slice(0, 5),
        repeatCount: 1,
        nextReviewAt: new Date(Date.now() + DAY).toISOString(),
        masteryLevel: 0,
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      Object.keys(row).forEach(function (k) { if (row[k] === undefined) delete row[k]; });
      mineNow.push(row);
      all.push(row);
      added.push(row);
    });
    /* 上限。覚えたものと古いものから消す。 */
    var others = all.filter(function (r) { return str(r.userId) !== me; });
    mineNow.sort(function (a, b) {
      return (SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity])
          || (Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0));
    });
    var kept = mineNow.slice(0, CAPS.review);
    writeAll(K.review, others.concat(kept));
    return { added: added.length, skipped: skipped, total: kept.length };
  }

  function listReview(o) {
    o = o || {};
    var now = isNum(o.now) ? o.now : Date.now();
    var list = mine(K.review);
    if (o.dueOnly) list = list.filter(function (r) { return !r.nextReviewAt || Date.parse(r.nextReviewAt) <= now; });
    if (o.category) list = list.filter(function (r) { return str(r.category) === str(o.category); });
    return list.sort(function (a, b) {
      return (SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity])
          || (Date.parse(a.nextReviewAt || 0) - Date.parse(b.nextReviewAt || 0));
    });
  }
  function resolveReview(id, correct) {
    var all = readAll(K.review), me = owner(), hit = null;
    all.forEach(function (r) { if (str(r.id) === str(id) && str(r.userId) === me) hit = r; });
    if (!hit) return { ok: false, error: "NOT_FOUND" };
    hit.masteryLevel = nextMastery(hit.masteryLevel, correct === true, null);
    hit.nextReviewAt = nextReviewAt(hit.masteryLevel, correct === true);
    hit.updatedAt = nowIso();
    if (hit.masteryLevel >= 1) {
      /* 覚えたら一覧から外す。消したことが分かるように resolvedAt を残す。 */
      hit.resolvedAt = nowIso();
    }
    writeAll(K.review, all.filter(function (r) { return !r.resolvedAt; }));
    return { ok: true, row: hit, resolved: !!hit.resolvedAt };
  }

  /* ══════════════════════════════════════════════════════════════════
     3) セッション（§37）
     ══════════════════════════════════════════════════════════════════ */
  function startSession(o) {
    o = o || {};
    var s = {
      id: "sp_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      userId: owner(),
      source: "vocabuspeak",
      activity: str(o.activity) || "lesson",
      lessonId: str(o.lessonId) || undefined,
      scenarioId: str(o.scenarioId) || undefined,
      level: str(o.level) || "",
      categoryId: str(o.categoryId) || undefined,
      startedAt: nowIso(),
      durationSeconds: 0,
      status: "in_progress"
    };
    Object.keys(s).forEach(function (k) { if (s[k] === undefined) delete s[k]; });
    var all = readAll(K.sessions);
    all.push(s);
    writeAll(K.sessions, all.slice(-CAPS.sessions));
    return s;
  }
  function updateSession(id, patch) {
    var all = readAll(K.sessions), me = owner(), hit = null;
    all.forEach(function (s) { if (str(s.id) === str(id) && str(s.userId) === me) hit = s; });
    if (!hit) return { ok: false, error: "NOT_FOUND" };
    Object.keys(isObj(patch) ? patch : {}).forEach(function (k) { hit[k] = patch[k]; });
    if (hit.startedAt && !isNum(patch && patch.durationSeconds))
      hit.durationSeconds = Math.max(0, Math.round((Date.now() - Date.parse(hit.startedAt)) / 1000));
    writeAll(K.sessions, all);
    return { ok: true, session: hit };
  }
  function finishSession(id, patch) {
    return updateSession(id, Object.assign({ status: "completed", completedAt: nowIso() }, patch || {}));
  }
  function listSessions(o) {
    o = o || {};
    var list = mine(K.sessions).sort(function (a, b) { return Date.parse(b.startedAt || 0) - Date.parse(a.startedAt || 0); });
    if (o.activity) list = list.filter(function (s) { return str(s.activity) === str(o.activity); });
    if (isNum(o.limit)) list = list.slice(0, o.limit);
    return list;
  }
  /* 途中で閉じたものを拾う（§4 の「続きから」）。 */
  function resumable() {
    return mine(K.sessions).filter(function (s) { return s.status === "in_progress"; })
      .sort(function (a, b) { return Date.parse(b.startedAt || 0) - Date.parse(a.startedAt || 0); });
  }

  /* ══════════════════════════════════════════════════════════════════
     4) 設定（字幕・速度・音声の保存方針。§26 / §41）
     ══════════════════════════════════════════════════════════════════ */
  var DEFAULT_PREFS = {
    level: "a1",
    subtitle: "after",            /* always / after / hint / none */
    showJapanese: true,
    speed: 1,
    voiceId: "",
    accent: "american",
    includeBeta: false,           /* 声を出す形式（未完成）を出すか */
    audioRetention: "immediate",  /* immediate / session / 7days / 30days */
    dailyGoalMinutes: 10
  };
  function prefs() {
    var all = readAll(K.prefs), me = owner();
    var hit = all.filter(function (p) { return str(p.userId) === me; })[0];
    return Object.assign({}, DEFAULT_PREFS, hit ? hit.value : {});
  }
  function savePrefs(patch) {
    var all = readAll(K.prefs), me = owner();
    var hit = all.filter(function (p) { return str(p.userId) === me; })[0];
    var next = Object.assign({}, DEFAULT_PREFS, hit ? hit.value : {}, isObj(patch) ? patch : {});
    if (hit) hit.value = next; else all.push({ userId: me, value: next });
    writeAll(K.prefs, all);
    return next;
  }

  /* ══════════════════════════════════════════════════════════════════
     5) まとめ（ホームと Insight が使う）
     ══════════════════════════════════════════════════════════════════ */
  function summary(o) {
    o = o || {};
    var now = isNum(o.now) ? o.now : Date.now();
    var since = now - num(o.days, 1) * DAY;
    var ss = mine(K.sessions).filter(function (s) { return Date.parse(s.startedAt || 0) >= since; });
    var h = listHistory();
    var acc = { seconds: 0, turns: 0, words: 0, exercises: 0, correct: 0 };
    var scores = { pronunciation: [], listening: [], fluency: [], grammar: [] };
    ss.forEach(function (s) {
      acc.seconds += num(s.durationSeconds, 0);
      acc.turns += num(s.conversationTurns, 0);
      acc.words += num(s.wordsSpoken, 0);
      acc.exercises += num(s.exerciseCount, 0);
      acc.correct += num(s.correctCount, 0);
      if (isNum(s.pronunciationScore)) scores.pronunciation.push(s.pronunciationScore);
      if (isNum(s.listeningScore)) scores.listening.push(s.listeningScore);
      if (isNum(s.fluencyScore)) scores.fluency.push(s.fluencyScore);
      if (isNum(s.grammarScore)) scores.grammar.push(s.grammarScore);
    });
    function avg(a) { return a.length ? Math.round(a.reduce(function (x, y) { return x + y; }, 0) / a.length) : null; }
    return {
      sessions: ss.length,
      minutes: Math.round(acc.seconds / 60),
      conversationTurns: acc.turns,
      wordsSpoken: acc.words,
      exercises: acc.exercises,
      correct: acc.correct,
      accuracy: acc.exercises ? Math.round((acc.correct / acc.exercises) * 100) : null,
      pronunciationScore: avg(scores.pronunciation),
      listeningScore: avg(scores.listening),
      fluencyScore: avg(scores.fluency),
      grammarScore: avg(scores.grammar),
      learnedVariants: h.length,
      masteredVariants: h.filter(function (x) { return num(x.masteryLevel, 0) >= 0.9; }).length,
      dueReview: listReview({ dueOnly: true, now: now }).length
    };
  }

  /* 直近 n 日の 1 日ごとの積み上げ。画面のグラフが使う。 */
  function daily(o) {
    o = o || {};
    var days = Math.max(1, num(o.days, 7));
    var now = isNum(o.now) ? o.now : Date.now();
    var d0 = new Date(now); d0.setHours(0, 0, 0, 0);
    var rows = [];
    for (var i = days - 1; i >= 0; i--) {
      var start = d0.getTime() - i * DAY;
      rows.push({ date: new Date(start).toISOString().slice(0, 10), start: start,
                  minutes: 0, exercises: 0, correct: 0, sessions: 0 });
    }
    var byStart = Object.create(null);
    rows.forEach(function (r) { byStart[r.start] = r; });
    mine(K.sessions).forEach(function (s) {
      var t = Date.parse(s.startedAt || 0);
      if (!t) return;
      var k = new Date(t); k.setHours(0, 0, 0, 0);
      var row = byStart[k.getTime()];
      if (!row) return;
      row.sessions++;
      row.minutes += num(s.durationSeconds, 0) / 60;
      row.exercises += num(s.exerciseCount, 0);
      row.correct += num(s.correctCount, 0);
    });
    rows.forEach(function (r) { r.minutes = Math.round(r.minutes); });
    return rows;
  }

  /* 続けている日数。**今日やっていなくても、昨日までは数える**
     （日付が変わった瞬間に 0 になると、続ける気をくじくため）。 */
  function streak(o) {
    o = o || {};
    var now = isNum(o.now) ? o.now : Date.now();
    var d0 = new Date(now); d0.setHours(0, 0, 0, 0);
    var has = Object.create(null);
    mine(K.sessions).forEach(function (s) {
      var t = Date.parse(s.startedAt || 0);
      if (!t) return;
      var k = new Date(t); k.setHours(0, 0, 0, 0);
      has[k.getTime()] = 1;
    });
    var n = 0, at = d0.getTime();
    if (!has[at]) at -= DAY;               /* 今日はまだでも、昨日から数える */
    while (has[at]) { n++; at -= DAY; }
    return { days: n, today: !!has[d0.getTime()] };
  }

  /* いまのレベルで、どれだけ身についたか（0〜1）。 */
  function levelProgress(level, totalVariants) {
    var list = listHistory();
    var learned = list.length;
    var mastered = list.filter(function (x) { return num(x.masteryLevel, 0) >= 0.9; }).length;
    var total = num(totalVariants, 0);
    return {
      learned: learned, mastered: mastered, total: total,
      ratio: total ? Math.min(1, learned / total) : 0,
      masteredRatio: total ? Math.min(1, mastered / total) : 0
    };
  }

  function clearAll() {
    var me = owner();
    [K.history, K.review, K.sessions].forEach(function (k) {
      writeAll(k, readAll(k).filter(function (r) { return str(r.userId) !== me; }));
    });
    return { ok: true };
  }

  VQ2.speakHistory = {
    KEYS: K, CAPS: CAPS, DEFAULT_PREFS: DEFAULT_PREFS,
    listHistory: listHistory, indexHistory: indexHistory,
    record: record, recordMany: recordMany,
    nextMastery: nextMastery, nextReviewAt: nextReviewAt, severityOf: severityOf,
    addReviewCandidates: addReviewCandidates, listReview: listReview, resolveReview: resolveReview,
    startSession: startSession, updateSession: updateSession, finishSession: finishSession,
    listSessions: listSessions, resumable: resumable,
    prefs: prefs, savePrefs: savePrefs,
    summary: summary, daily: daily, streak: streak, levelProgress: levelProgress,
    clearAll: clearAll
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
