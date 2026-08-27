/* ══════════════════════════════════════════════════════════════════════
   会話シナリオの進行（§29 / §30 / §32）

   **固定の分岐と LLM を組み合わせる。**

     話の目的・主要なセリフ・ふつうの分岐・ミッション … 事前に作っておく
     ユーザーの発話の理解・想定外への返事              … LLM

   意図の見分けは、**まず手元で**行う。
   例文との語の重なりで決まるなら、それで決める（速い・毎回同じ・止まらない）。
   決めきれないときだけ LLM へ回す。

   ・LLM に会話全体を作り直させない。返すのは「どの意図か」と短い返事だけ。
   ・**言っていないミッションを達成にしない。**
   ・小さな間違いで会話を止めない。意味が通れば進む。

   ここは純粋な進行だけ。音も画面も LLM 呼び出しも持たない（Node で試せる）。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var SM = VQ2.speakModel;
  if (!SM) throw new Error("VQ2.speakModel must be loaded before dialogue.js");

  function str(v) { return v === undefined || v === null ? "" : String(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function num(v, d) { return isNum(v) ? v : d; }

  /* 手元で決めてよい強さ。これを超えたら LLM へ回さない。 */
  var SURE = 0.55;
  /* これ未満なら「何を言ったか分からない」として聞き返す。 */
  var LOST = 0.18;
  var MAX_TURNS = 24;            /* 会話が終わらなくなるのを防ぐ */

  /* ══════════════════════════════════════════════════════════════════
     1) シナリオの正規化（作り話の分岐を通さない）
     ══════════════════════════════════════════════════════════════════ */
  function normalizeScenario(src) {
    var s = isObj(src) ? src : {};
    var nodes = arr(s.nodes).map(function (n) {
      return {
        id: str(n.id),
        aiText: str(n.aiText),
        japaneseTranslation: str(n.japaneseTranslation) || undefined,
        hint: str(n.hint) || undefined,
        completionNode: n.completionNode === true,
        fallbackNodeId: str(n.fallbackNodeId) || undefined,
        expectedIntents: arr(n.expectedIntents).map(function (e) {
          return { intentId: str(e.intentId),
                   examples: arr(e.examples).map(str).filter(Boolean),
                   nextNodeId: str(e.nextNodeId) };
        }).filter(function (e) { return e.intentId && e.nextNodeId; })
      };
    }).filter(function (n) { return n.id && n.aiText; });

    var byId = Object.create(null);
    nodes.forEach(function (n) { byId[n.id] = n; });

    return {
      id: str(s.id),
      level: SM.level(s.level) ? str(s.level) : "a1",
      categoryId: str(s.categoryId),
      title: str(s.title),
      descriptionJa: str(s.descriptionJa),
      userRole: str(s.userRole),
      aiRole: str(s.aiRole),
      missionGoals: arr(s.missionGoals).map(function (m) {
        return { id: str(m.id), descriptionJa: str(m.descriptionJa),
                 requiredIntentIds: arr(m.requiredIntentIds).map(str),
                 requiredExpressions: arr(m.requiredExpressions).map(str) };
      }).filter(function (m) { return m.id; }),
      startNodeId: str(s.startNodeId) || (nodes[0] ? nodes[0].id : ""),
      nodes: nodes,
      byId: byId,
      estimatedTurns: num(s.estimatedTurns, nodes.length),
      estimatedMinutes: num(s.estimatedMinutes, 3)
    };
  }

  /* 進める前に、**行き先の無い分岐**が無いか見る。
     あると会話が途中で止まるので、始める前に止める。 */
  function validateScenario(sc) {
    var out = [];
    function err(code, msg) { out.push({ level: "error", code: code, message: msg }); }
    function warn(code, msg) { out.push({ level: "warning", code: code, message: msg }); }
    if (!sc || !arr(sc.nodes).length) return [{ level: "error", code: "noNodes", message: "会話の中身がありません。" }];
    if (!sc.startNodeId || !sc.byId[sc.startNodeId]) err("noStart", "始まりの場面がありません。");
    sc.nodes.forEach(function (n) {
      n.expectedIntents.forEach(function (e) {
        if (!sc.byId[e.nextNodeId]) err("deadEnd", "「" + n.id + "」の分岐「" + e.intentId + "」の行き先がありません。");
        if (!e.examples.length) warn("noExamples", "「" + e.intentId + "」に例文がありません。見分けられません。");
      });
      if (n.fallbackNodeId && !sc.byId[n.fallbackNodeId])
        err("badFallback", "「" + n.id + "」の聞き返し先がありません。");
      if (!n.expectedIntents.length && !n.completionNode)
        warn("noWayOut", "「" + n.id + "」から先へ進めません。");
    });
    if (!sc.nodes.some(function (n) { return n.completionNode; }))
      err("noEnd", "終わりの場面がありません。会話が終われません。");
    /* ミッションの条件に、どの分岐にも無い意図が書かれていないか。 */
    var known = Object.create(null);
    sc.nodes.forEach(function (n) { n.expectedIntents.forEach(function (e) { known[e.intentId] = 1; }); });
    arr(sc.missionGoals).forEach(function (m) {
      m.requiredIntentIds.forEach(function (id) {
        if (!known[id]) err("badMission", "ミッション「" + m.descriptionJa + "」の条件「" + id + "」は、どの分岐にもありません。");
      });
    });
    return out;
  }

  /* ══════════════════════════════════════════════════════════════════
     2) 意図の見分け（まず手元で）
     ══════════════════════════════════════════════════════════════════ */
  /* 見分けに使わない語。どの返事にも出るので、そろっていても手がかりにならない。
     ここを外さないと「please」と言っただけで「サイズを言った」ことになる（実測）。 */
  var FUNCTION_WORDS = {
    please: 1, thank: 1, thanks: 1, you: 1, i: 1, a: 1, an: 1, the: 1, is: 1, am: 1,
    are: 1, do: 1, does: 1, can: 1, could: 1, would: 1, will: 1, to: 1, of: 1, for: 1,
    and: 1, or: 1, it: 1, that: 1, this: 1, my: 1, me: 1, have: 1, get: 1, like: 1,
    yes: 1, no: 1, ok: 1, okay: 1, well: 1, um: 1, uh: 1
  };
  function contentWords(list) {
    var out = arr(list).filter(function (w) { return !FUNCTION_WORDS[w]; });
    return out.length ? out : arr(list);      /* 中身のある語が無いときは全部で見る */
  }

  function scoreIntent(said, intent) {
    var best = 0, hit = "";
    var saidAll = SM.wordsOf(said);
    var seen = Object.create(null);
    saidAll.forEach(function (w) { seen[w] = 1; });

    arr(intent.examples).forEach(function (ex) {
      var s = SM.overlap(said, ex);
      /* 例文の **中身のある語** がそろっているかを見る（短い返事に強くするため）。 */
      var exContent = contentWords(SM.wordsOf(ex));
      if (exContent.length) {
        var hitN = exContent.filter(function (w) { return seen[w]; }).length;
        /* 中身のある語が 1 つも合っていなければ、この例文には合っていない。 */
        if (hitN > 0) s = Math.max(s, (hitN / exContent.length) * 0.9);
      }
      if (s > best) { best = s; hit = ex; }
    });
    return { score: best, example: hit };
  }

  function classifyLocal(said, node) {
    var text = str(said).trim();
    if (!text) return { intentId: "", score: 0, sure: false, lost: true };
    var ranked = arr(node && node.expectedIntents).map(function (e) {
      var r = scoreIntent(text, e);
      return { intentId: e.intentId, nextNodeId: e.nextNodeId, score: r.score, example: r.example };
    }).sort(function (a, b) { return b.score - a.score; });
    var top = ranked[0] || null;
    if (!top) return { intentId: "", score: 0, sure: false, lost: true, ranked: [] };
    /* 1 位と 2 位が近いときは決めきらない（LLM へ回す）。 */
    var gap = ranked[1] ? top.score - ranked[1].score : 1;
    return {
      intentId: top.score >= LOST ? top.intentId : "",
      nextNodeId: top.nextNodeId,
      score: Math.round(top.score * 100) / 100,
      example: top.example,
      sure: top.score >= SURE && gap >= 0.12,
      lost: top.score < LOST,
      ranked: ranked.slice(0, 3)
    };
  }

  /* ══════════════════════════════════════════════════════════════════
     3) 会話の状態
     ══════════════════════════════════════════════════════════════════ */
  function start(scenario, o) {
    o = o || {};
    var sc = normalizeScenario(scenario);
    var bad = validateScenario(sc).filter(function (x) { return x.level === "error"; });
    if (bad.length) return { ok: false, issues: bad, message: bad[0].message };
    var node = sc.byId[sc.startNodeId];
    return {
      ok: true,
      scenario: sc,
      nodeId: node.id,
      turns: [{ who: "ai", text: node.aiText, japanese: node.japaneseTranslation, nodeId: node.id }],
      missions: sc.missionGoals.map(function (m) {
        return { id: m.id, descriptionJa: m.descriptionJa, completed: false };
      }),
      usedIntents: [],
      state: node.completionNode ? "goal_completed" : "continue",
      askedAgain: 0,
      startedAt: num(o.now, Date.now())
    };
  }

  function currentNode(sess) {
    return sess && sess.scenario ? sess.scenario.byId[sess.nodeId] || null : null;
  }

  /* ユーザーの発話を 1 つ進める。
       said     … 聞き取った文
       decided  … LLM が決めた意図（あれば。無ければ手元の判定だけで進む）
     戻り値には **なぜその分岐にしたか** を必ず入れる。 */
  function advance(sess, said, o) {
    o = o || {};
    if (!sess || !sess.ok) return { ok: false, reason: "会話が始まっていません。" };
    if (sess.state !== "continue") return { ok: false, reason: "この会話はもう終わっています。" };
    var node = currentNode(sess);
    if (!node) return { ok: false, reason: "いまの場面が見つかりません。" };

    var text = str(said).trim();
    sess.turns.push({ who: "user", text: text });

    if (sess.turns.length > MAX_TURNS) {
      sess.state = "lesson_completed";
      return { ok: true, state: sess.state, reason: "会話が長くなったので、ここまでにします。" };
    }

    var local = classifyLocal(text, node);
    var chosen = null, why = "";

    if (local.sure) {
      chosen = local; why = "言い方が例文と近かったため";
    } else if (o.decidedIntentId) {
      /* LLM が決めた意図。**この場面にある分岐だけ**を受ける。 */
      var m = arr(node.expectedIntents).filter(function (e) { return e.intentId === o.decidedIntentId; })[0];
      if (m) { chosen = { intentId: m.intentId, nextNodeId: m.nextNodeId, score: local.score }; why = "AI が意図を判断したため"; }
    }
    if (!chosen && local.intentId && !local.lost) {
      chosen = local; why = "いちばん近い言い方に合わせたため";
    }

    if (!chosen) {
      /* 分からなかった。**話を進めず聞き返す。** 2 回続いたら助け舟を出す。 */
      sess.askedAgain++;
      var fb = node.fallbackNodeId ? sess.scenario.byId[node.fallbackNodeId] : null;
      if (fb) {
        sess.nodeId = fb.id;
        sess.turns.push({ who: "ai", text: fb.aiText, japanese: fb.japaneseTranslation, nodeId: fb.id, isFallback: true });
        return { ok: true, matched: false, state: "needs_retry", node: fb,
                 why: "うまく聞き取れなかったため、もう一度たずねました",
                 hint: fb.hint || node.hint, score: local.score };
      }
      return { ok: true, matched: false, state: "needs_retry", node: node,
               why: "何を言ったか分からなかったため", hint: node.hint,
               needsAiReply: true, score: local.score };
    }

    sess.askedAgain = 0;
    if (sess.usedIntents.indexOf(chosen.intentId) < 0) sess.usedIntents.push(chosen.intentId);
    updateMissions(sess, text);

    var next = sess.scenario.byId[chosen.nextNodeId];
    if (!next) return { ok: false, reason: "次の場面が見つかりません。" };
    sess.nodeId = next.id;
    sess.turns.push({ who: "ai", text: next.aiText, japanese: next.japaneseTranslation, nodeId: next.id });
    if (next.completionNode) sess.state = "goal_completed";

    return {
      ok: true, matched: true, intentId: chosen.intentId, why: why,
      score: chosen.score, node: next, state: sess.state,
      missions: sess.missions.slice(),
      justCompleted: sess.__justCompleted || []
    };
  }

  /* ミッションの達成。**言った意図か、実際に使った表現**でだけ立てる。 */
  function updateMissions(sess, said) {
    var done = [];
    sess.__justCompleted = [];
    arr(sess.scenario.missionGoals).forEach(function (m) {
      var row = sess.missions.filter(function (x) { return x.id === m.id; })[0];
      if (!row || row.completed) return;
      var byIntent = m.requiredIntentIds.length
        && m.requiredIntentIds.every(function (id) { return sess.usedIntents.indexOf(id) >= 0; });
      var byWords = m.requiredExpressions.length
        && m.requiredExpressions.some(function (ex) {
             return SM.normText(said).indexOf(SM.normText(ex)) >= 0;
           });
      if (byIntent || byWords) { row.completed = true; done.push(row); }
    });
    sess.__justCompleted = done;
    return done;
  }

  /* 会話の終わりのまとめ（§34）。**点は出さない**（会話は点をつけるものではない）。 */
  function summary(sess) {
    if (!sess || !sess.ok) return null;
    var userTurns = sess.turns.filter(function (t) { return t.who === "user"; });
    var words = userTurns.reduce(function (a, t) { return a + SM.wordsOf(t.text).length; }, 0);
    var done = sess.missions.filter(function (m) { return m.completed; });
    return {
      title: sess.scenario.title,
      turns: userTurns.length,
      wordsSpoken: words,
      missions: sess.missions.slice(),
      missionsDone: done.length,
      missionsTotal: sess.missions.length,
      state: sess.state,
      seconds: Math.round((Date.now() - sess.startedAt) / 1000),
      /* 言えた表現（実際に使った意図）。**言っていないものを足さない。** */
      usedIntents: sess.usedIntents.slice(),
      transcript: sess.turns.slice()
    };
  }

  VQ2.dialogue = {
    SURE: SURE, LOST: LOST, MAX_TURNS: MAX_TURNS,
    normalizeScenario: normalizeScenario, validateScenario: validateScenario,
    classifyLocal: classifyLocal, scoreIntent: scoreIntent, contentWords: contentWords,
    start: start, advance: advance, currentNode: currentNode,
    updateMissions: updateMissions, summary: summary
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
