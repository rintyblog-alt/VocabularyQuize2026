/* ══════════════════════════════════════════════════════════════════════
   VocabuSpeak — 何を出すかを決める（§15 / §16）

   守ること:
     1. まだ出していない Variant をいちばん先に出す
     2. 同じセッションで同じ Variant を出さない
     3. 同じセッションで同じ英文（Atom）は原則 1 回まで
     4. 同じ family を続けて出さない
     5. 同じ日に同じ Variant を出し直さない
     6. 未出題が残っている間は、覚えたものを出し直さない
     7. すべて出し終えたら復習へ移る（**黙ってランダムへ戻さない**）

   完全ランダムにしない。重みをつけて上位から引く。
   ただし上位 1 件に固定すると毎回同じ並びになるので、上位の中から引く。

   乱数は呼び出し側から渡せるようにする（テストで同じ結果を出すため）。
   ここは純粋な計算だけ。保存も画面も持たない。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var SM = VQ2.speakModel;
  if (!SM) throw new Error("VQ2.speakModel must be loaded before speak-select.js");

  function str(v) { return v === undefined || v === null ? "" : String(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function num(v, d) { return isNum(v) ? v : d; }
  function setOf(list) { var s = Object.create(null); arr(list).forEach(function (x) { s[str(x)] = 1; }); return s; }

  var DAY = 24 * 60 * 60 * 1000;

  /* 出題の理由。ユーザーへも出す（なぜこれが出たのかを隠さない）。 */
  var REASON = {
    unseen: "はじめての問題",
    dueReview: "復習の予定日になっています",
    wrongBefore: "前に間違えた問題",
    lowScore: "発音のスコアが低かった問題",
    lowConfidence: "自信がないと答えた問題",
    longAgo: "しばらく出していない問題",
    otherVariant: "同じ英文の、まだやっていない出し方",
    sameFamily: "似た表現の別の言い方",
    fill: "問題数をそろえるため"
  };

  /* ══════════════════════════════════════════════════════════════════
     1) 点をつける
     ══════════════════════════════════════════════════════════════════ */
  function scoreOne(v, ctx) {
    var h = ctx.historyByVariant[str(v.id)] || null;
    var atomH = ctx.historyByAtom[str(v.contentAtomId)] || null;
    var s = {
      variantId: str(v.id),
      unseenBonus: 0, dueForReviewBonus: 0, weaknessBonus: 0,
      categoryRelevance: 0, difficultyMatch: 0, diversityBonus: 0,
      recentExposurePenalty: 0, sameFamilyPenalty: 0, sameActivityPenalty: 0,
      total: 0, reason: REASON.fill
    };

    /* ── はじめての問題を最優先（いちばん大きい重み） ── */
    if (!h) { s.unseenBonus = 1000; s.reason = REASON.unseen; }
    else {
      /* 復習の予定日を過ぎている */
      if (h.nextReviewAt && ctx.now >= Date.parse(h.nextReviewAt)) {
        s.dueForReviewBonus = 400; s.reason = REASON.dueReview;
      }
      /* 間違えた・スコアが低い・自信がない */
      var wrongRate = h.seenCount ? (h.incorrectCount || 0) / h.seenCount : 0;
      if (wrongRate > 0) { s.weaknessBonus += Math.round(wrongRate * 300); s.reason = REASON.wrongBefore; }
      if (isNum(h.lastScore) && h.lastScore < 60) { s.weaknessBonus += 120; s.reason = REASON.lowScore; }
      if (isNum(h.lastConfidence) && h.lastConfidence <= 2) { s.weaknessBonus += 60; s.reason = REASON.lowConfidence; }
      /* 最後に出してから経った日数（30 日で頭打ち） */
      var days = h.lastSeenAt ? Math.floor((ctx.now - Date.parse(h.lastSeenAt)) / DAY) : 30;
      if (days >= 1) {
        s.diversityBonus += Math.min(30, days) * 4;
        if (s.reason === REASON.fill && days >= 7) s.reason = REASON.longAgo;
      }
      /* 覚えたものは下げる。未出題が残っているなら実質出さない。 */
      s.recentExposurePenalty -= Math.round(num(h.masteryLevel, 0) * 80);
      if (days < 1) s.recentExposurePenalty -= 5000;      /* 同じ日は出し直さない（規則 5） */
      if (ctx.hasUnseen && num(h.masteryLevel, 0) >= 0.8) s.recentExposurePenalty -= 3000;  /* 規則 6 */
    }

    /* 同じ英文の別の出し方 */
    if (!h && atomH) { s.diversityBonus += 60; s.reason = REASON.otherVariant; }

    /* 頼まれたカテゴリーに近いか */
    if (ctx.categorySet && Object.keys(ctx.categorySet).length) {
      s.categoryRelevance = ctx.categorySet[str(v.categoryId)] ? 80 : 0;
    }
    /* 難しさが合っているか（離れるほど下げる） */
    if (isNum(ctx.targetDifficulty)) {
      var d = Math.abs(num(v.difficulty, 3) - ctx.targetDifficulty);
      s.difficultyMatch = Math.max(0, 60 - d * 20);
    }
    /* 同じレベルなら少し優先。1 段ちがいは通すが下げる。 */
    if (ctx.level && str(v.level) !== ctx.level) s.difficultyMatch -= 40;

    /* このセッションで直前に出た family / 形式は下げる（規則 4） */
    if (ctx.recentFamilies.indexOf(str(v.familyId)) >= 0) {
      var pos = ctx.recentFamilies.indexOf(str(v.familyId));
      s.sameFamilyPenalty = -(300 - pos * 80);
    }
    if (ctx.recentActivities.indexOf(str(v.activityType)) >= 0) {
      s.sameActivityPenalty = -60;
    }
    /* このセッションで使った形式の回数が偏らないように */
    var used = ctx.activityCount[str(v.activityType)] || 0;
    if (used > 0) s.sameActivityPenalty -= used * 40;

    s.total = s.unseenBonus + s.dueForReviewBonus + s.weaknessBonus
            + s.categoryRelevance + s.difficultyMatch + s.diversityBonus
            + s.recentExposurePenalty + s.sameFamilyPenalty + s.sameActivityPenalty;
    return s;
  }

  /* ══════════════════════════════════════════════════════════════════
     2) 選ぶ
        pool … { id, contentAtomId, familyId, activityType, level, categoryId, difficulty }
        戻り値には **なぜ選んだか** と **足りなかったこと** を必ず入れる。
     ══════════════════════════════════════════════════════════════════ */
  function select(pool, ctx) {
    var o = isObj(ctx) ? ctx : {};
    var want = Math.max(1, num(o.targetCount, 10));
    var rnd = typeof o.random === "function" ? o.random : Math.random;
    var now = isNum(o.now) ? o.now : Date.now();

    var historyByVariant = isObj(o.historyByVariant) ? o.historyByVariant : {};
    var historyByAtom = isObj(o.historyByAtom) ? o.historyByAtom : {};

    var seenVariant = setOf(o.sessionSeenVariantIds);
    var seenAtom = setOf(o.sessionSeenAtomIds);
    var allowedActivities = arr(o.activityTypes).length ? setOf(o.activityTypes) : null;
    var categorySet = arr(o.categoryIds).length ? setOf(o.categoryIds) : null;
    var excludeIds = setOf(o.excludeVariantIds);

    /* まず「そもそも出せるもの」に絞る。外した理由は数えておく。 */
    var dropped = { session: 0, activity: 0, category: 0, level: 0, excluded: 0, sameAtom: 0, recentDay: 0 };
    var base = arr(pool).filter(function (v) {
      if (!v || !str(v.id)) return false;
      if (excludeIds[str(v.id)]) { dropped.excluded++; return false; }
      if (seenVariant[str(v.id)]) { dropped.session++; return false; }          /* 規則 2 */
      if (allowedActivities && !allowedActivities[str(v.activityType)]) { dropped.activity++; return false; }
      if (categorySet && !categorySet[str(v.categoryId)]) { dropped.category++; return false; }
      if (o.level && !SM.levelNear(v.level, o.level, num(o.levelSpan, 1))) { dropped.level++; return false; }
      return true;
    });

    /* 同じセッションで同じ英文は原則 1 回まで（規則 3）。
       ただし **これを外すと問題が足りない**ときは、あとで戻す。 */
    var strict = base.filter(function (v) {
      if (seenAtom[str(v.contentAtomId)]) { dropped.sameAtom++; return false; }
      return true;
    });

    var hasUnseen = strict.some(function (v) { return !historyByVariant[str(v.id)]; });
    var picked = [], notes = [];
    var recentFamilies = arr(o.sessionSeenFamilyIds).slice(-3).reverse();
    var recentActivities = arr(o.sessionRecentActivities).slice(-2).reverse();
    var activityCount = Object.create(null);
    arr(o.sessionActivityCounts && Object.keys(o.sessionActivityCounts)).forEach(function (k) {
      activityCount[k] = o.sessionActivityCounts[k];
    });
    var usedAtoms = Object.assign(Object.create(null), seenAtom);
    var pass = 0;

    /* 1 巡目は厳しい条件で。足りなければ条件を 1 つずつ緩める。
       **緩めたことは必ず notes に残す**（黙って別のものを出さない）。 */
    var candidates = strict;
    var relaxedNoted = false;
    while (picked.length < want) {
      function notPicked(v) { return !picked.some(function (p) { return p.variantId === str(v.id); }); }
      function unseen(v) { return !historyByVariant[str(v.id)]; }
      var live = candidates.filter(function (v) {
        return notPicked(v) && (pass >= 1 || !usedAtoms[str(v.contentAtomId)]);
      });
      /* 「まだ出していないもの」は「同じ英文は 1 回まで」より優先する（規則 1 と 6）。
         同じ英文の縛りだけで未出題が出せなくなっているなら、そこだけ緩める。
         緩めずに進むと、まだ出していない問題を飛ばして覚えた問題を出してしまう。 */
      if (pass === 0 && !live.some(unseen)) {
        var freeUnseen = candidates.filter(function (v) { return notPicked(v) && unseen(v); });
        if (freeUnseen.length) {
          if (!relaxedNoted) {
            notes.push("同じ英文を別の出し方でもう一度出します（新しい問題を先に出すため）。");
            relaxedNoted = true;
          }
          live = freeUnseen;
        }
      }
      if (!live.length) {
        pass++;
        if (pass === 1) {
          /* 「同じ英文は 1 回まで」を外せば、まだ出せるものが残っているか。
             残っているときだけ緩める。**緩めたことは必ず伝える**。 */
          var more = base.some(function (v) {
            return !picked.some(function (p) { return p.variantId === str(v.id); });
          });
          if (more) {
            notes.push("同じ英文を別の出し方でもう一度出します（新しい問題が足りないため）。");
            candidates = base;
            continue;
          }
          pass++;
        }
        if (pass === 2) {
          notes.push("このカテゴリーの新しい問題をすべて学習しました。ここからは定着のための復習です。");
          /* 復習では、このセッションで出したものを除いてもう一度探す。
             それでも無ければ足りないまま返す（**水増ししない**）。 */
          candidates = arr(pool).filter(function (v) {
            return v && str(v.id) && !seenVariant[str(v.id)] && !excludeIds[str(v.id)]
                && (!allowedActivities || allowedActivities[str(v.activityType)]);
          });
          pass++;
          continue;
        }
        break;
      }
      var sctx = {
        now: now, historyByVariant: historyByVariant, historyByAtom: historyByAtom,
        categorySet: categorySet, level: o.level, targetDifficulty: o.targetDifficulty,
        recentFamilies: recentFamilies, recentActivities: recentActivities,
        activityCount: activityCount, hasUnseen: hasUnseen
      };
      var scored = live.map(function (v) {
        var s = scoreOne(v, sctx);
        s.variant = v;
        return s;
      }).sort(function (a, b) { return b.total - a.total || String(a.variantId).localeCompare(String(b.variantId)); });

      /* 上位の中から引く。1 位固定にすると毎回同じ並びになる。
         ただし **同じくらい良いものの中だけ**で引く。件数だけで切ると、
         まだ出していない問題が尽きかけたときに、覚えた問題が混ざってしまう。 */
      var band = num(o.band, 150);
      var cut = scored[0].total - band;
      var eligible = 0;
      while (eligible < scored.length && scored[eligible].total >= cut) eligible++;
      var topN = Math.min(eligible || 1, Math.max(1, num(o.topN, 4)));
      var hit = scored[Math.floor(rnd() * topN)] || scored[0];

      picked.push({
        variantId: hit.variantId, variant: hit.variant,
        contentAtomId: str(hit.variant.contentAtomId),
        familyId: str(hit.variant.familyId),
        activityType: str(hit.variant.activityType),
        reason: hit.reason, score: hit.total, breakdown: hit
      });
      usedAtoms[str(hit.variant.contentAtomId)] = 1;
      recentFamilies.unshift(str(hit.variant.familyId));
      recentFamilies = recentFamilies.slice(0, 3);
      recentActivities.unshift(str(hit.variant.activityType));
      recentActivities = recentActivities.slice(0, 2);
      activityCount[str(hit.variant.activityType)] = (activityCount[str(hit.variant.activityType)] || 0) + 1;
      hasUnseen = candidates.some(function (v) {
        return !historyByVariant[str(v.id)] && !picked.some(function (p) { return p.variantId === str(v.id); });
      });
    }

    var short = picked.length < want;
    if (short) {
      notes.push("この条件で出せる問題は " + picked.length + " 問でした（" + want + " 問を用意できませんでした）。");
    }
    return {
      items: picked,
      requested: want,
      total: picked.length,
      shortfall: short ? want - picked.length : 0,
      reviewOnly: pass >= 3,
      notes: notes,
      dropped: dropped
    };
  }

  /* ══════════════════════════════════════════════════════════════════
     3) セッションの状態を進める（呼び出し側が持つ）
     ══════════════════════════════════════════════════════════════════ */
  function emptySessionState() {
    return { seenVariantIds: [], seenAtomIds: [], seenFamilyIds: [],
             recentActivities: [], activityCounts: {} };
  }
  function advance(state, item) {
    var s = isObj(state) ? state : emptySessionState();
    if (!item) return s;
    s.seenVariantIds = arr(s.seenVariantIds).concat([str(item.variantId)]);
    s.seenAtomIds = arr(s.seenAtomIds).concat([str(item.contentAtomId)]);
    s.seenFamilyIds = arr(s.seenFamilyIds).concat([str(item.familyId)]);
    s.recentActivities = arr(s.recentActivities).concat([str(item.activityType)]).slice(-4);
    s.activityCounts = isObj(s.activityCounts) ? s.activityCounts : {};
    s.activityCounts[str(item.activityType)] = (s.activityCounts[str(item.activityType)] || 0) + 1;
    return s;
  }
  function toContext(state, o) {
    var s = isObj(state) ? state : emptySessionState();
    return Object.assign({}, o || {}, {
      sessionSeenVariantIds: s.seenVariantIds,
      sessionSeenAtomIds: s.seenAtomIds,
      sessionSeenFamilyIds: s.seenFamilyIds,
      sessionRecentActivities: s.recentActivities,
      sessionActivityCounts: s.activityCounts
    });
  }

  VQ2.speakSelect = {
    REASON: REASON,
    select: select, scoreOne: scoreOne,
    emptySessionState: emptySessionState, advance: advance, toContext: toContext
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
