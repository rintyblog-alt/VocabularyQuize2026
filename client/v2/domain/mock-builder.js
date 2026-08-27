/* ══════════════════════════════════════════════════════════════════════
   MockSpec ビルダ（§12 / §13）
   ・Orchestrator の Mock Draft → 正式な MockSpec。
   ・AnswerBinding をここで決定論的に作る。問題と回答欄が切れないようにする。
   ・配点は Score Allocator に必ず通す。AI の仮配点をそのまま採用しない。
   ・問題用紙と解答用紙を別々の生成物にしない。両方この 1 つから作る。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var S = VQ2.schema, SA = VQ2.scoreAllocator, D = VQ2.draft, V = VQ2.validate;

  function str(v) { return v === undefined || v === null ? "" : String(v); }
  function isNum(v) { return typeof v === "number" && isFinite(v); }

  /* ══ 形式の決め方（§10「無言の fallback を廃止する」）════════════════

     ここは Quick Mock の**本線**。枠（mock-compiler が決めた slot.type）が
     どれだけ正しくても、最後にこの関数を通るので、ここで潰れたら終わり。

     実測（2026-08-05・repro-typecollapse.cjs）:
       long_answer → short_answer / ordering → short_answer /
       fill_blank → short_answer / matching → short_answer /
       source_analysis → short_answer   （6 形式中 5 形式が潰れた）
     原因は下の TYPE_MAP が 4 語しか持たず、載っていない型を
     「選択肢があれば 4 択、無ければ短答」へ黙って落としていたこと。

     直し方は 2 つ用意する。
       ① questionType … V3 レジストリの正式 ID をそのまま運ぶ道。
          プリセット側（preset-draft）は最初からこの形。試験側にも通す。
       ② type          … 昔からの粗い 4 語。古い保存データのために残す。
     ①があれば①を採る。無ければ②を引く。**どちらでも決まらないときは
     黙って別形式にせず、warnings に記録して短答へ落ちたことを残す。** */
  var TYPE_MAP = {
    multiple_choice: "multiple_choice_single",
    true_false: "true_false",
    short_answer: "short_answer",
    descriptive: "long_answer"
  };
  var AI_TYPES = ["long_answer", "essay", "english_writing", "source_analysis"];

  /* 正式 ID として通してよいか。レジストリが読めないときは通さない
     （読めないことを理由に、知らない文字列を型として通すと危ない）。 */
  function knownType(id) {
    if (!id) return false;
    try {
      var Q = VQ2.qtypes;
      if (!Q || !Q.get) return false;
      var d = Q.get(id);
      return !!(d && d.status !== "coming_soon");
    } catch (e) { return false; }
  }

  /* 1 問の形式を決める。決まらなかったときは reason を返して呼び出し側に記録させる。 */
  function resolveType(q) {
    var qt = str(q.questionType);
    if (qt && knownType(qt)) return { type: qt, fellBack: false, reason: "" };
    var coarse = str(q.type);
    if (TYPE_MAP[coarse]) return { type: TYPE_MAP[coarse], fellBack: false, reason: "" };
    /* 正式 ID が type 欄に入っていることもある（AI は欄を取り違える）。 */
    if (coarse && knownType(coarse)) return { type: coarse, fellBack: false, reason: "" };
    var guess = Array.isArray(q.choices) && q.choices.length ? "multiple_choice_single" : "short_answer";
    return {
      type: guess, fellBack: true,
      reason: "形式「" + (qt || coarse || "指定なし") + "」は分からないので "
        + guess + " として取り込みました。"
    };
  }

  /* ══════════════════════════════════════════════════════════════════
     Mock Draft → MockSpec
     opts: { title, subject, grade, audience, durationMinutes, totalPoints,
             paper, sourceMode, instructions, ownerId }
     ══════════════════════════════════════════════════════════════════ */
  function fromDraft(draft, opts) {
    opts = opts || {};
    draft = draft || {};
    var warnings = [];

    var answerKey = {};
    (draft.answerKey || []).forEach(function (a) { if (a && a.id) answerKey[String(a.id)] = a; });

    var sections = [], bindings = [];
    /* 設問番号は大問ごとに 1 から振る（問1・問2…）。
       解答用紙の番号は試験全体の通し番号にする（採点と照合しやすいため）。 */
    var globalNo = 0, secNo = 0;

    (draft.sections || []).forEach(function (sec, si) {
      secNo++;
      var secId = "s" + secNo;
      var questions = [];
      var qNoInSection = 0;

      (sec.questions || []).forEach(function (q) {
        globalNo++;
        qNoInSection++;
        var qNo = globalNo;
        var rt = resolveType(q);
        var type = rt.type;
        if (rt.fellBack) warnings.push("第" + secNo + "問（" + qNo + "）: " + rt.reason);
        var qid = "q" + qNo;
        var bid = "b" + qNo;
        var key = answerKey[str(q.id)] || null;

        var choices = (Array.isArray(q.choices) ? q.choices : []).map(function (c, ci) {
          return {
            id: str(c.id) || ("c" + (ci + 1)),
            label: String.fromCharCode(65 + ci),
            text: str(c.text),
            explanation: str(c.explanation),
            isCorrect: false
          };
        });

        /* 正解の割り当て。解答キーの表記が ID でも本文でも拾う。 */
        var correctText = key ? str(key.answer) : "";
        if (choices.length) {
          var hit = choices.filter(function (c) {
            return c.id === correctText || c.text === correctText || c.label === correctText;
          });
          if (!hit.length && correctText) {
            /* 「①」「ア」などの記号も見る */
            var idx = symbolIndex(correctText);
            if (idx >= 0 && choices[idx]) hit = [choices[idx]];
          }
          if (hit.length) hit.forEach(function (c) { c.isCorrect = true; });
          else warnings.push("問" + qNo + "：解答「" + correctText + "」が選択肢の中に見つかりませんでした。");
        }

        var q2 = {
          id: qid,
          schemaVersion: S.SCHEMA_VERSION,
          sectionId: secId,
          number: qNoInSection,
          globalNumber: globalNo,
          type: type,
          prompt: str(q.question),
          promptRichText: null,
          media: [],
          contentBlocks: [],
          choices: choices,
          correctAnswer: choices.length ? null : correctText,
          acceptedAnswers: choices.length ? [] : (correctText ? [correctText] : []),
          answerNormalization: choices.length ? null : { trim: true, caseInsensitive: true, fullwidthToHalfwidth: true },
          explanation: key ? str(key.explanation) : "",
          choiceExplanations: null,
          answerBindingId: bid,
          points: isNum(q.points) ? q.points : 1,
          criterionAllocation: null,
          scoringRubric: null,
          estimatedSeconds: D.estimateSeconds(type),
          difficulty: mapDifficulty(q.difficulty),
          topic: str(q.topic),
          tags: [],
          sourceReferences: mapSources(q.sourceReferences),
          requiresReview: q.requiresReview === true,
          confidence: null,
          validationIssues: []
        };

        /* 記述式には採点基準を用意する。無いと採点根拠を示せない（§25）。 */
        if (AI_TYPES.indexOf(type) >= 0) {
          q2.scoringRubric = buildRubric(q, q2.points);
          q2.expectedChars = isNum(q.expectedChars) ? q.expectedChars : defaultChars(type);
        }
        if (!correctText && !choices.length) {
          q2.requiresReview = true;
          warnings.push("問" + qNo + "：解答がありません。");
        }

        questions.push(q2);
        bindings.push({
          id: bid, questionId: qid, number: String(qNo),
          inputType: type, points: q2.points,
          blankCount: (q.blanks || []).length || undefined,
          expectedChars: q2.expectedChars,
          answerLines: AI_TYPES.indexOf(type) >= 0 ? Math.max(2, Math.ceil((q2.expectedChars || 120) / 35)) : undefined
        });
      });

      if (!questions.length) { secNo--; return; }
      sections.push({
        id: secId, number: secNo,
        title: str(sec.name) || ("大問" + secNo),
        instructions: str(sec.instructions),
        points: questions.reduce(function (a, q) { return a + q.points; }, 0),
        criterionAllocation: null,
        questions: questions
      });
    });

    var spec = {
      id: opts.id || S.newId("mock"),
      schemaVersion: S.SCHEMA_VERSION,
      ownerId: opts.ownerId || "",
      title: str(opts.title || draft.title) || "試験",
      subject: str(opts.subject || draft.subject),
      grade: str(opts.grade || draft.grade),
      audience: str(opts.audience),
      durationMinutes: isNum(opts.durationMinutes) ? opts.durationMinutes
        : (isNum(draft.durationMinutes) ? draft.durationMinutes : 50),
      totalPoints: isNum(opts.totalPoints) ? opts.totalPoints
        : (isNum(draft.totalScore) ? draft.totalScore : 100),
      instructions: str(opts.instructions),
      sourceMode: opts.sourceMode || "source-only",
      sourceReferences: [],
      paper: opts.paper || S.defaultPaper(),
      gradingPolicy: opts.gradingPolicy || { partialCredit: true, aiAssist: true, confidenceThreshold: 0.7 },
      sections: sections,
      answerBindings: bindings,
      createdAt: S.nowIso(),
      updatedAt: S.nowIso(),
      warnings: warnings.concat(Array.isArray(draft.warnings) ? draft.warnings : []),
      requiresReview: draft.requiresReview === true || warnings.length > 0
    };

    return spec;
  }

  function symbolIndex(text) {
    var t = str(text).trim();
    var circled = "①②③④⑤⑥⑦⑧⑨⑩";
    var i = circled.indexOf(t.charAt(0));
    if (i >= 0) return i;
    var kana = "アイウエオカキクケコ";
    i = kana.indexOf(t.charAt(0));
    if (i >= 0) return i;
    var alpha = "ABCDEFGHIJ".indexOf(t.charAt(0).toUpperCase());
    if (alpha >= 0) return alpha;
    var num = parseInt(t, 10);
    if (isFinite(num) && num >= 1 && num <= 10) return num - 1;
    return -1;
  }

  function mapDifficulty(d) {
    var m = { easy: "easy", standard: "normal", normal: "normal", hard: "hard" };
    return m[str(d)] || "normal";
  }
  function defaultChars(type) {
    return type === "essay" || type === "english_writing" ? 400 : 120;
  }

  /* 出典の形をそろえる。**中身は qplan.normSources が唯一の実装。**
     試験とプリセットで別々に書いていたため、片方（プリセット）だけ
     変換が抜けて保存できない、という食い違いが起きた。
     qplan は mock-builder より先に読まれるので、ここから参照できる。
     読み込まれていない場合だけ、同じ規則をここで行う。 */
  function mapSources(list) {
    if (VQ2.qplan && VQ2.qplan.normSources) return VQ2.qplan.normSources(list);
    return (Array.isArray(list) ? list : []).map(function (r, i) {
      var name = str(r.fileName);
      if (!name) return null;
      var o = { id: str(r.evidenceId) || ("s" + (i + 1)), sourceType: "pdf",
                sourceId: str(r.attachmentId), sourceName: name, verified: true };
      if (isNum(r.page) && r.page >= 1) o.page = r.page;
      return o;
    }).filter(Boolean);
  }

  /* 採点基準。AI が出していればそれを使い、無ければ配点から機械的に作る。 */
  function buildRubric(q, points) {
    var src = Array.isArray(q.scoringRubric) ? q.scoringRubric
            : (q.scoringRubric && Array.isArray(q.scoringRubric.items) ? q.scoringRubric.items : null);
    if (src && src.length) {
      var items = src.slice(0, 8).map(function (r, i) {
        return {
          id: "r" + (i + 1),
          description: str(r.description || r.text || ("観点" + (i + 1))),
          points: isNum(r.points) ? r.points : 0,
          criterionId: r.criterionId === "knowledge_skill" ? "knowledge_skill" : "thinking_judgment_expression"
        };
      });
      var sum = items.reduce(function (a, r) { return a + r.points; }, 0);
      if (sum !== points) {
        /* 合計を配点へ合わせる（AI の内訳の比率は保つ） */
        var w = items.map(function (r) { return Math.max(r.points, 0); });
        if (w.reduce(function (a, b) { return a + b; }, 0) === 0) w = items.map(function () { return 1; });
        var got = SA.allocateIntegers(points, w, items.map(function () { return 0; }), items.map(function () { return points; }));
        if (got) items.forEach(function (r, i) { r.points = got[i]; });
      }
      return { items: items };
    }
    /* 既定：内容 6 割 / 根拠 4 割 */
    var a = Math.max(1, Math.round(points * 0.6));
    return {
      items: [
        { id: "r1", description: "問われている内容に答えている", points: a, criterionId: "thinking_judgment_expression" },
        { id: "r2", description: "根拠や用語が正しい", points: Math.max(0, points - a), criterionId: "knowledge_skill" }
      ]
    };
  }

  /* ══════════════════════════════════════════════════════════════════
     仕上げ：観点別を割り当て → 配点を満点へ収束 → 検証
     ・ここを通っていない MockSpec は保存させない。
     ══════════════════════════════════════════════════════════════════ */
  /* ══════════════════════════════════════════════════════════════════
     不備の検出（audit）と、機械で直せるぶんの修復（repair）

     AI は資料が多いほど、問題は書けても「解説」「出典」「正解」を
     落とすことがある。落ちたまま試験にすると、
     ・受験画面に解答欄が出ない（true/false の選択肢が空、など）
     ・採点できない（正解が無い）
     ・見直しができない（解説が無い）
     という形で受験者に出る。ここで必ず洗い出し、
     機械で直せるものは直し、直せないものは残して伝える。
     ══════════════════════════════════════════════════════════════════ */

  /* 何が足りていないか。UI と AI 補完の両方がこの語彙を使う。 */
  var NEED_LABEL = {
    prompt: "問題文",
    choices: "選択肢",
    answer: "正解",
    explanation: "解説",
    source: "出典",
    rubric: "採点基準"
  };
  /* 受験できない＝解答欄が作れない、または採点できない不備 */
  var BLOCKING = { prompt: true, choices: true, answer: true };

  function auditQuestion(q, opts) {
    opts = opts || {};
    var needs = [];
    var type = q && q.type;
    if (!str(q && q.prompt).trim()) needs.push("prompt");

    if (S.hasChoices(type)) {
      var ch = Array.isArray(q.choices) ? q.choices : [];
      var usable = ch.filter(function (c) { return str(c && c.text).trim(); });
      /* 組み合わせ・並び替えは選択肢が無くても解答欄を作れる（文字入力になる） */
      var needsChoices = type === "multiple_choice_single" || type === "multiple_choice_multiple" || type === "true_false";
      if (needsChoices && usable.length < 2) needs.push("choices");
      else if (needsChoices && !ch.some(function (c) { return c && c.isCorrect === true; })) needs.push("answer");
      if (type === "matching" && !Object.keys(q.correctAnswer || {}).length) needs.push("answer");
      if (type === "ordering" && !(Array.isArray(q.correctAnswer) && q.correctAnswer.length)
          && !ch.length) needs.push("answer");
    } else if (S.isDeterministic(type)) {
      var has = str(q.correctAnswer).trim()
        || (Array.isArray(q.acceptedAnswers) && q.acceptedAnswers.some(function (a) { return str(a).trim(); }));
      if (!has) needs.push("answer");
    } else if (S.isAiGraded(type)) {
      if (!(q.scoringRubric && (q.scoringRubric.items || []).length)) needs.push("rubric");
    }

    if (!str(q && q.explanation).trim()) needs.push("explanation");
    if (opts.requireSources && !(q.sourceReferences || []).length) needs.push("source");
    return needs;
  }

  /* 試験全体の不備。UI はこれをそのまま出す。 */
  function auditSpec(spec, opts) {
    opts = opts || {};
    var requireSources = opts.requireSources !== undefined
      ? opts.requireSources : (spec && spec.sourceMode === "source-only");
    var items = [];
    (spec && spec.sections || []).forEach(function (sec) {
      (sec.questions || []).forEach(function (q) {
        var needs = auditQuestion(q, { requireSources: requireSources });
        if (!needs.length) return;
        items.push({
          questionId: q.id, sectionId: sec.id,
          number: q.number, sectionNumber: sec.number,
          type: q.type, prompt: str(q.prompt).slice(0, 80),
          needs: needs,
          blocking: needs.some(function (n) { return BLOCKING[n]; })
        });
      });
    });
    return {
      items: items,
      total: items.length,
      blocking: items.filter(function (i) { return i.blocking; }).length,
      byNeed: NEED_LABEL ? countNeeds(items) : {}
    };
  }
  function countNeeds(items) {
    var m = {};
    items.forEach(function (i) { i.needs.forEach(function (n) { m[n] = (m[n] || 0) + 1; }); });
    return m;
  }

  /* 正誤問題の選択肢。AI が書かないことが多いので、こちらで用意する。 */
  var TF_TRUE = ["正しい", "正", "true", "t", "○", "〇", "◯", "はい", "yes", "a", "1", "ア", "①"];
  var TF_FALSE = ["誤っている", "誤り", "誤", "false", "f", "×", "✕", "いいえ", "no", "b", "2", "イ", "②"];
  function tfSide(text) {
    var t = str(text).trim().toLowerCase();
    if (!t) return -1;
    if (TF_TRUE.indexOf(t) >= 0) return 0;
    if (TF_FALSE.indexOf(t) >= 0) return 1;
    if (/^(正しい|正解|適切)/.test(t)) return 0;
    if (/^(誤|間違|不適切)/.test(t)) return 1;
    return -1;
  }

  /* 機械で直せるぶんだけ直す。**内容は作らない**（解説や出典は書けない）。
     戻り値の remaining が「まだ足りていないもの」。 */
  function repairSpec(spec, opts) {
    opts = opts || {};
    var fixed = [];
    (spec && spec.sections || []).forEach(function (sec) {
      (sec.questions || []).forEach(function (q) {
        var before = auditQuestion(q, { requireSources: false }).join(",");

        /* 1) 正誤問題に選択肢が無い → 正／誤を用意し、正解を書き当てる */
        if (q.type === "true_false" && !(q.choices || []).length) {
          q.choices = [
            { id: "c1", label: "A", text: "正しい", explanation: "", isCorrect: false },
            { id: "c2", label: "B", text: "誤っている", explanation: "", isCorrect: false }
          ];
          var side = tfSide(q.correctAnswer) >= 0 ? tfSide(q.correctAnswer)
            : tfSide((q.acceptedAnswers || [])[0]);
          if (side >= 0) { q.choices[side].isCorrect = true; q.correctAnswer = null; q.acceptedAnswers = []; }
          fixed.push({ questionId: q.id, what: "正誤の選択肢を用意しました" });
        }

        /* 2) 選択肢はあるのに正解が立っていない → 解答の文字から探す */
        if (S.hasChoices(q.type) && (q.choices || []).length
            && !q.choices.some(function (c) { return c.isCorrect === true; })) {
          var want = str(q.correctAnswer) || str((q.acceptedAnswers || [])[0]);
          var hit = null;
          if (want) {
            hit = q.choices.filter(function (c) {
              return c.id === want || c.label === want || str(c.text).trim() === want.trim();
            })[0] || null;
            if (!hit) {
              var idx = symbolIndex(want);
              if (idx >= 0 && q.choices[idx]) hit = q.choices[idx];
            }
            if (!hit && q.type === "true_false") {
              var s2 = tfSide(want);
              if (s2 >= 0 && q.choices[s2]) hit = q.choices[s2];
            }
          }
          if (hit) {
            hit.isCorrect = true;
            q.correctAnswer = null; q.acceptedAnswers = [];
            fixed.push({ questionId: q.id, what: "正解の選択肢を書き当てました" });
          }
        }

        /* 3) 選択肢が 1 つしか無い選択問題 → 文字で答える形式へ落とす。
              空の選択肢だけを並べた解答欄を出さない。 */
        if ((q.type === "multiple_choice_single" || q.type === "multiple_choice_multiple")) {
          var usable = (q.choices || []).filter(function (c) { return str(c.text).trim(); });
          if (usable.length < 2) {
            var keep = str(q.correctAnswer) || str((q.acceptedAnswers || [])[0])
              || (usable[0] ? str(usable[0].text) : "");
            q.type = "short_answer";
            q.choices = [];
            q.correctAnswer = keep;
            q.acceptedAnswers = keep ? [keep] : [];
            q.answerNormalization = { trim: true, caseInsensitive: true, fullwidthToHalfwidth: true };
            fixed.push({ questionId: q.id, what: "選択肢が足りないので短答に変えました" });
          }
        }

        /* 4) AI が採点する形式に採点基準が無い → 下敷きを付ける（§25） */
        if (S.isAiGraded(q.type) && !(q.scoringRubric && (q.scoringRubric.items || []).length)) {
          q.scoringRubric = S.defaultRubric(q.type, isNum(q.points) ? q.points : 1);
          fixed.push({ questionId: q.id, what: "採点基準を用意しました" });
        }

        /* 直しても足りないものが残るなら、必ず要確認にする */
        var after = auditQuestion(q, { requireSources: false });
        if (after.length) q.requiresReview = true;
        if (before !== after.join(",")) q.updatedAt = S.nowIso();
      });
    });

    /* 回答欄の形式を問題に合わせ直す（3 で形式が変わることがある） */
    var byQ = {};
    (spec && spec.sections || []).forEach(function (s) {
      (s.questions || []).forEach(function (q) { byQ[q.answerBindingId] = q; });
    });
    (spec && spec.answerBindings || []).forEach(function (b) {
      var q = byQ[b.id];
      if (q && b.inputType !== q.type) b.inputType = q.type;
    });

    return { spec: spec, fixed: fixed, audit: auditSpec(spec, opts) };
  }

  /* AI が埋め直してきた内容を取り込む。
     **上書きするのは、足りていなかった項目だけ**。
     問題文や、すでにある正解・解説には触れない（勝手に別物へ変えない）。 */
  function mergeRepairs(spec, draftQuestions, opts) {
    opts = opts || {};
    var byId = {};
    (draftQuestions || []).forEach(function (d) { if (d && d.id) byId[str(d.id)] = d; });
    var filled = [];

    (spec && spec.sections || []).forEach(function (sec) {
      (sec.questions || []).forEach(function (q) {
        var d = byId[str(q.id)];
        if (!d) return;
        var needs = auditQuestion(q, { requireSources: opts.requireSources === true });
        if (!needs.length) return;
        var got = [];

        if (needs.indexOf("explanation") >= 0 && str(d.explanation).trim()) {
          q.explanation = str(d.explanation).trim();
          got.push("explanation");
        }

        if (needs.indexOf("choices") >= 0 && Array.isArray(d.choices)) {
          var ch = d.choices.filter(function (c) { return str(c && c.text).trim(); });
          if (ch.length >= 2) {
            q.choices = ch.slice(0, 10).map(function (c, i) {
              return { id: str(c.id) || ("c" + (i + 1)), label: String.fromCharCode(65 + i),
                       text: str(c.text).trim(), explanation: str(c.explanation), isCorrect: false };
            });
            markCorrect(q, str(d.correctAnswer));
            got.push("choices");
          }
        }

        if (needs.indexOf("answer") >= 0) {
          var ans = str(d.correctAnswer).trim();
          if (ans) {
            if ((q.choices || []).length) { if (markCorrect(q, ans)) got.push("answer"); }
            else {
              q.correctAnswer = ans;
              q.acceptedAnswers = [ans];
              q.answerNormalization = q.answerNormalization
                || { trim: true, caseInsensitive: true, fullwidthToHalfwidth: true };
              got.push("answer");
            }
          }
        }

        /* 出典は「資料名が分かるもの」だけ取り込む。
           evidenceId しか無いものは資料を特定できていないので捨てる（作り話にしない）。 */
        if (needs.indexOf("source") >= 0) {
          var refs = mapSources(d.sourceReferences);
          if (refs.length) { q.sourceReferences = refs; got.push("source"); }
        }

        if (got.length) {
          q.updatedAt = S.nowIso();
          filled.push({ questionId: q.id, number: q.number, filled: got });
        }
      });
    });
    return { spec: spec, filled: filled, audit: auditSpec(spec, opts) };
  }

  function markCorrect(q, want) {
    if (!want || !(q.choices || []).length) return false;
    var hit = q.choices.filter(function (c) {
      return c.id === want || c.label === want || str(c.text).trim() === want.trim();
    })[0] || null;
    if (!hit) {
      var idx = symbolIndex(want);
      if (idx >= 0 && q.choices[idx]) hit = q.choices[idx];
    }
    if (!hit && q.type === "true_false") {
      var s = tfSide(want);
      if (s >= 0 && q.choices[s]) hit = q.choices[s];
    }
    if (!hit) return false;
    q.choices.forEach(function (c) { c.isCorrect = false; });
    hit.isCorrect = true;
    q.correctAnswer = null;
    q.acceptedAnswers = [];
    return true;
  }

  /* 直しようのない問題を試験から外す。配点は残りへ割り振り直す。
     「解答欄の無い問題を受験者に出す」より、外して伝えるほうがよい。 */
  function dropQuestions(spec, ids) {
    var drop = {};
    (ids || []).forEach(function (i) { drop[i] = true; });
    var removed = [];
    spec.sections = (spec.sections || []).map(function (sec) {
      sec.questions = (sec.questions || []).filter(function (q) {
        if (!drop[q.id]) return true;
        removed.push({ id: q.id, number: q.number, sectionNumber: sec.number });
        return false;
      });
      return sec;
    }).filter(function (sec) { return sec.questions.length; });

    /* 番号と回答欄を振り直す（抜けた番号を残さない） */
    var secNo = 0, globalNo = 0;
    var keepBindings = {};
    spec.sections.forEach(function (sec) {
      secNo++; sec.number = secNo;
      var n = 0;
      sec.questions.forEach(function (q) {
        n++; globalNo++;
        q.number = n; q.globalNumber = globalNo;
        keepBindings[q.answerBindingId] = String(globalNo);
      });
      sec.points = sec.questions.reduce(function (a, q) { return a + (isNum(q.points) ? q.points : 0); }, 0);
    });
    spec.answerBindings = (spec.answerBindings || []).filter(function (b) {
      if (!keepBindings[b.id]) return false;
      b.number = keepBindings[b.id];
      return true;
    });
    return { spec: spec, removed: removed };
  }

  function finalize(spec, opts) {
    opts = opts || {};
    var out = SA.seedCriterionAllocation(spec);
    var alloc = SA.allocate(out, {
      targetTotal: spec.totalPoints,
      integerOnly: opts.integerOnly !== false,
      minimumPoints: opts.minimumPoints,
      maximumPoints: opts.maximumPoints
    });

    var issues = alloc.issues.slice();
    var finalSpec = alloc.spec;

    if (alloc.ok) {
      /* 大問の観点別小計を埋める */
      finalSpec.sections.forEach(function (sec) {
        var acc = {};
        S.CRITERION_IDS.forEach(function (c) { acc[c] = 0; });
        sec.questions.forEach(function (q) {
          (q.criterionAllocation || []).forEach(function (a) { acc[a.criterionId] = (acc[a.criterionId] || 0) + a.points; });
        });
        sec.criterionAllocation = S.CRITERION_IDS.map(function (c) { return { criterionId: c, points: acc[c] || 0 }; });
      });
      /* 回答欄の配点を最終同期 */
      var byQ = {};
      finalSpec.sections.forEach(function (s) { s.questions.forEach(function (q) { byQ[q.answerBindingId] = q; }); });
      (finalSpec.answerBindings || []).forEach(function (b) {
        var q = byQ[b.id];
        if (q) b.points = q.points;
      });
    }

    var validation = V.validateMockSpecForSave(finalSpec, { sourceOnly: finalSpec.sourceMode === "source-only" });
    return {
      ok: alloc.ok && V.canSave(validation),
      spec: finalSpec,
      scoreChanged: alloc.changed,
      issues: issues.concat(validation),
      validation: validation
    };
  }

  /* ══════════════════════════════════════════════════════════════════
     Blueprint（構成案）のテキスト → 確認用の構造
     ・AI が返す自由文から、大問の並びだけを拾って表示する。
     ・拾えなければ「拾えなかった」と返す。それらしい構成を作らない。
     ══════════════════════════════════════════════════════════════════ */
  function parseBlueprint(text) {
    text = String(text || "").replace(/[０-９]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
    });
    var lines = String(text || "").split("\n");
    var sections = [], cur = null;
    var re = /^\s*(?:大問)?\s*([0-9０-９一二三四五六七八九十]+)\s*[．.、:：)）]?\s*(.*)$/;
    lines.forEach(function (raw) {
      /* 表の形（Markdown）で返ってくることが多い。
         「| 1 | 古代 | 30 | 5 |」のような行を読めないと、
         せっかく作った構成案が「読み取れませんでした」になる（実際にそうなっていた）。 */
      if (/^\s*\|/.test(raw)) {
        var row = tableRow(raw);
        if (row) { cur = row; sections.push(cur); }
        return;
      }
      var line = raw.replace(/^[#*\-\s]+/, "").trim();
      if (!line) return;
      var m = line.match(/^(?:大問|第)\s*([0-9０-９一二三四五六七八九十]+)\s*(?:問)?\s*[．.、:：)）]?\s*(.*)$/);
      if (m) {
        cur = { number: toNum(m[1]), title: m[2].replace(/[（(]\d+点[）)]/g, "").trim(), points: null, count: null, notes: [] };
        var p = line.match(/(\d+)\s*点/);
        if (p) cur.points = parseInt(p[1], 10);
        var c = line.match(/(\d+)\s*問/);
        if (c) cur.count = parseInt(c[1], 10);
        sections.push(cur);
        return;
      }
      if (cur) {
        var p2 = line.match(/(\d+)\s*点/);
        if (p2 && cur.points === null) cur.points = parseInt(p2[1], 10);
        var c2 = line.match(/(\d+)\s*問/);
        if (c2 && cur.count === null) cur.count = parseInt(c2[1], 10);
        if (line.length < 200) cur.notes.push(line);
      }
    });
    return {
      ok: sections.length > 0,
      sections: sections,
      totalPoints: sections.reduce(function (a, s) { return a + (s.points || 0); }, 0),
      totalQuestions: sections.reduce(function (a, s) { return a + (s.count || 0); }, 0)
    };
  }
  /* 表の 1 行を大問として読む。
     見出し行と区切り行は捨てる。数だけの列は「配点 → 問数」の順に見る
     （教科書どおりの「大問 / 内容 / 配点 / 問数」に合わせる）。 */
  function tableRow(raw) {
    var cells = String(raw).trim().replace(/^\|/, "").replace(/\|\s*$/, "")
      .split("|").map(function (c) { return c.trim(); });
    if (cells.length < 2) return null;
    if (cells.every(function (c) { return /^:?-{2,}:?$/.test(c) || !c; })) return null;   /* 区切り行 */

    var head = cells[0];
    var num = head.match(/([0-9]+)/);
    if (!num) return null;                                   /* 見出し行（「大問」「内容」…） */
    if (/配点|問数|内容|ねらい/.test(head)) return null;

    var sec = { number: parseInt(num[1], 10), title: "", points: null, count: null, notes: [] };
    var bare = [];
    cells.slice(1).forEach(function (c) {
      if (!c) return;
      var p = c.match(/^(\d+)\s*点$/);
      if (p) { sec.points = parseInt(p[1], 10); return; }
      var q = c.match(/^(\d+)\s*問$/);
      if (q) { sec.count = parseInt(q[1], 10); return; }
      if (/^\d+$/.test(c)) { bare.push(parseInt(c, 10)); return; }
      if (!sec.title) sec.title = c.replace(/[（(]\d+点[）)]/g, "").trim();
      else if (c.length < 200) sec.notes.push(c);
    });
    if (sec.points === null && bare.length) sec.points = bare.shift();
    if (sec.count === null && bare.length) sec.count = bare.shift();
    return sec;
  }

  function toNum(s) {
    var k = "〇一二三四五六七八九十";
    var t = String(s).replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
    var n = parseInt(t, 10);
    if (isFinite(n)) return n;
    var i = k.indexOf(t.charAt(0));
    return i >= 0 ? i : 1;
  }

  /* 指示文から設定を推定する（利用者が UI で直せるよう、あくまで初期値）。
     全角の数字（「５０分」「１００点」）も読む。日本語入力ではそちらが普通で、
     半角しか見ていないと指定を取りこぼす。 */
  function inferSettings(text) {
    var t = String(text || "").replace(/[０-９]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
    });
    var o = {};
    var dur = t.match(/(\d+)\s*分/);
    if (dur) o.durationMinutes = parseInt(dur[1], 10);
    var pts = t.match(/(\d+)\s*点満点|満点\s*(\d+)\s*点|(\d+)\s*点/);
    if (pts) o.totalPoints = parseInt(pts[1] || pts[2] || pts[3], 10);
    var sec = t.match(/大問\s*(\d+)/);
    if (sec) o.sectionCount = parseInt(sec[1], 10);
    if (/縦書き/.test(t)) o.writingDirection = "vertical";
    if (/横書き/.test(t)) o.writingDirection = "horizontal";
    if (/見開き/.test(t)) o.spread = true;
    var paper = t.match(/\b(A3|A4|B4|B5)\b/i);
    if (paper) o.paperSize = paper[1].toUpperCase();
    if (/横長|ランドスケープ/.test(t)) o.orientation = "landscape";
    if (/資料だけ|教材外.{0,4}禁止|添付.{0,4}のみ|この資料|ワーク.{0,4}のみ|教科書.{0,4}のみ/.test(t)) o.sourceOnly = true;
    return o;
  }

  VQ2.mockBuilder = {
    fromDraft: fromDraft,
    finalize: finalize,
    auditSpec: auditSpec,
    auditQuestion: auditQuestion,
    repairSpec: repairSpec,
    mergeRepairs: mergeRepairs,
    dropQuestions: dropQuestions,
    NEED_LABEL: NEED_LABEL,
    BLOCKING_NEEDS: BLOCKING,
    buildRubric: buildRubric,
    parseBlueprint: parseBlueprint,
    inferSettings: inferSettings,
    symbolIndex: symbolIndex,
    TYPE_MAP: TYPE_MAP,
    AI_TYPES: AI_TYPES
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
