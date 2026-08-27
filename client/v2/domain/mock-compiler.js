/* ══════════════════════════════════════════════════════════════════════
   MockCompiler V2 — 試験コンパイラ（決定論の層）

   考え方:
     AI は「1 問ぶんの中身」だけを書く。
     試験の形（大問の数・設問の数・配点・番号・解答欄）は **コードが決める**。

   なぜ作り直すのか（V1 の実測にもとづく）:
     ・頼んだ数を超えて作られる  … 実測 asked 11 / made 66 / dropped 55（83.3%）
     ・満点が合わない            … 大問ごとの申告が 100 だったり 30 だったりする
     ・解答欄を作れない設問が残る … 選択肢 0 件の選択問題が仕様へ入ってしまう
   これらは「あとで直す」から起きる。**先に決めて、合わないものは入れない**。

   ここに書いてある関数はすべて純関数で、モデルを 1 回も呼ばない。
   だから全部テストできる（vqmockcompile.cjs）。

   段階:
     plan()        条件 → ExamPlan（設問の枠と配点をここで確定）
     requestsOf()  ExamPlan → QuestionRequest[]（AI へ渡す 1 問ぶんの依頼）
     gate()        QuestionDraft → 受理 / 不受理（理由つき）
     assemble()    受理したものだけ → MockSpec（配点は Plan が正・AI の申告は捨てる）
     verify()      MockSpec が Plan どおりか（違えば未完成として扱う）
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var SA = VQ2.scoreAllocator, MB = VQ2.mockBuilder;

  var VERSION = "2.0.0";

  /* 1 大問に入れる設問数の上限。これ以上は大問を分ける。
     1 回の生成が長くなるほど JSON が途中で切れて全部失う（V1 の実測）。 */
  var MAX_PER_SECTION = 8;
  /* 1 回の依頼でまとめて作らせる設問数。1 問ずつだと往復が増えて遅くなり、
     多すぎると途中で切れる。V1 の実測（3 問／回で 0% 破棄）を初期値にする。 */
  var DEFAULT_BATCH = 3;

  /* 選択肢が要る形式。ここに載っている型で選択肢が 2 つ未満なら受理しない。 */
  var NEEDS_CHOICES = {
    multiple_choice_single: true, multiple_choice_multiple: true, true_false: true
  };
  /* 記述系。文字数と採点基準が要る。 */
  var WRITTEN = { long_answer: true, essay: true, english_writing: true, source_analysis: true };

  /* 出題形式の並べ方。やさしい形式から順に埋めると、
     前半が選択・後半が記述という自然な試験になる。 */
  var TYPE_ORDER = [
    "true_false", "multiple_choice_single", "multiple_choice_multiple",
    "fill_blank", "short_answer", "numeric", "ordering", "matching",
    "source_analysis", "long_answer", "english_writing", "essay"
  ];

  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function str(v) { return v === undefined || v === null ? "" : String(v); }

  /* ══════════════════════════════════════════════════════════
     1) plan — ここで試験の形が確定する

     ここを通った時点で
       ・設問の総数
       ・大問ごとの設問数
       ・1 問ごとの配点（整数・合計は満点にぴったり）
     が決まっている。AI はこの枠を動かせない。
     ══════════════════════════════════════════════════════════ */
  function plan(req) {
    req = req || {};
    var issues = [];
    var totalPoints = Math.round(Number(req.totalPoints) || 100);
    if (!(totalPoints > 0)) { totalPoints = 100; issues.push({ severity: "low", message: "満点が不正だったため 100 点にしました。" }); }

    var types = enabledTypes(req.types);
    if (!types.length) { types = ["multiple_choice_single", "short_answer"]; issues.push({ severity: "low", message: "問題形式が 1 つも選ばれていないため、選択と短答にしました。" }); }

    /* 大問数と設問数。設問数 0 は「おまかせ」＝大問あたり 4 問。 */
    var sectionCount = clamp(Math.round(Number(req.sectionCount) || 1), 1, 20);
    var wanted = Math.round(Number(req.questionCount) || 0);
    if (!(wanted > 0)) wanted = sectionCount * 4;

    /* 1 問あたり 1 点は要る。満点より多い設問は作れない。 */
    if (wanted > totalPoints) {
      issues.push({
        severity: "high", type: "too_many_questions",
        message: "満点 " + totalPoints + " 点に対して " + wanted + " 問は多すぎます（1 問 1 点でも足りません）。"
          + totalPoints + " 問まで減らしました。"
      });
      wanted = totalPoints;
    }
    /* 大問が多すぎて 1 問も入らない大問が出るなら、大問を減らす。 */
    if (sectionCount > wanted) {
      issues.push({ severity: "medium", type: "too_many_sections",
        message: "設問 " + wanted + " 問に対して大問 " + sectionCount + " は多いため、大問を " + wanted + " に減らしました。" });
      sectionCount = wanted;
    }
    /* 1 大問に入りきらないなら大問を増やす（1 回の生成を短く保つため）。 */
    var minSections = Math.ceil(wanted / MAX_PER_SECTION);
    if (sectionCount < minSections) {
      issues.push({ severity: "low", type: "sections_expanded",
        message: "1 大問あたり " + MAX_PER_SECTION + " 問までにするため、大問を " + sectionCount + " → " + minSections + " に増やしました。" });
      sectionCount = minSections;
    }

    /* 設問を大問へ配る（余りは前の大問から 1 問ずつ）。 */
    var counts = spread(wanted, sectionCount);

    /* 構成案（AI）があれば題名だけ借りる。数と点は借りない。 */
    var bpTitles = blueprintTitles(req.blueprint, sectionCount);

    /* 1 問ずつの枠を作る。形式は TYPE_ORDER の順に巡回して割り当てる
       （毎回同じ入力なら同じ出力になる＝再現できる）。 */
    var slots = [];
    var ti = 0;
    for (var si = 0; si < counts.length; si++) {
      for (var qi = 0; qi < counts[si]; qi++) {
        var type = types[ti % types.length]; ti++;
        slots.push({
          sectionIndex: si,
          numberInSection: qi + 1,
          type: type,
          difficulty: difficultyFor(req.difficulty, qi, counts[si])
        });
      }
    }

    /* 配点。TYPE_WEIGHT × DIFFICULTY_WEIGHT で重みを付け、
       整数割り当てで **合計をぴったり満点に合わせる**。
       ここで合わせてしまうので、あとから足し算が合わないことは起きない。 */
    var weights = slots.map(function (s) {
      var tw = (SA.TYPE_WEIGHT && SA.TYPE_WEIGHT[s.type]) || 1;
      var dw = (SA.DIFFICULTY_WEIGHT && SA.DIFFICULTY_WEIGHT[s.difficulty]) || 1;
      return tw * dw;
    });
    var mins = slots.map(function () { return 1; });
    var maxs = slots.map(function () { return Math.max(1, totalPoints - (slots.length - 1)); });
    var pts = SA.allocateIntegers(totalPoints, weights, mins, maxs);
    if (!pts || pts.length !== slots.length) {
      /* 割り当てが作れない条件（満点 < 設問数 など）。ここへは来ないはずだが、
         来たら黙って続けない。 */
      issues.push({ severity: "high", type: "score_unallocatable",
        message: "満点 " + totalPoints + " 点を " + slots.length + " 問へ割り当てられませんでした。" });
      pts = slots.map(function () { return 1; });
    }
    slots.forEach(function (s, i) { s.points = pts[i]; });

    var sections = counts.map(function (n, i) {
      var own = slots.filter(function (s) { return s.sectionIndex === i; });
      return {
        number: i + 1,
        title: bpTitles[i] || "",
        questionCount: n,
        points: own.reduce(function (a, s) { return a + s.points; }, 0),
        questions: own.map(function (s, k) {
          return {
            id: "p" + (i + 1) + "-" + (k + 1),
            number: k + 1,
            type: s.type,
            points: s.points,
            difficulty: s.difficulty,
            expectedChars: WRITTEN[s.type] ? expectedCharsFor(s.type, s.points) : null
          };
        })
      };
    });

    var sum = sections.reduce(function (a, s) { return a + s.points; }, 0);

    return {
      version: VERSION,
      title: str(req.title) || "試験",
      subject: str(req.subject), grade: str(req.grade), audience: str(req.audience),
      durationMinutes: clamp(Math.round(Number(req.durationMinutes) || 50), 1, 600),
      totalPoints: totalPoints,
      sourceMode: req.allowExternalKnowledge ? "source-preferred" : "source-only",
      requireSources: req.requireSources !== false,
      sections: sections,
      totalQuestions: slots.length,
      /* 自己申告ではなく実際の合計。verify() がこれを見る。 */
      allocatedPoints: sum,
      balanced: sum === totalPoints,
      issues: issues
    };
  }

  function enabledTypes(map) {
    if (!map) return [];
    var on = Object.keys(map).filter(function (k) { return map[k]; });
    /* TYPE_ORDER の順に並べ直す（選ばれた順ではなく、いつも同じ並びにする）。 */
    return TYPE_ORDER.filter(function (t) { return on.indexOf(t) >= 0; })
      .concat(on.filter(function (t) { return TYPE_ORDER.indexOf(t) < 0; }));
  }

  /* n 個を k 組へ配る。余りは前から 1 つずつ。合計は必ず n。 */
  function spread(n, k) {
    var base = Math.floor(n / k), rem = n % k, out = [];
    for (var i = 0; i < k; i++) out.push(base + (i < rem ? 1 : 0));
    return out;
  }

  function difficultyFor(mode, i, n) {
    if (mode === "easy") return "easy";
    if (mode === "hard") return "hard";
    if (mode === "normal") return "standard";
    /* mixed: 前half easy → standard → 後ろ hard */
    if (n <= 1) return "standard";
    var r = i / (n - 1);
    return r < 0.34 ? "easy" : (r < 0.75 ? "standard" : "hard");
  }

  function expectedCharsFor(type, points) {
    var base = { long_answer: 120, essay: 400, english_writing: 100, source_analysis: 150 }[type] || 120;
    return Math.max(40, Math.round(base * clamp(points / 5, 0.5, 3)));
  }

  function blueprintTitles(bp, n) {
    var out = [];
    var list = bp && bp.ok && Array.isArray(bp.sections) ? bp.sections : [];
    for (var i = 0; i < n; i++) out.push(list[i] ? str(list[i].title) : "");
    return out;
  }

  /* ══════════════════════════════════════════════════════════
     2) requestsOf — AI へ渡す依頼を作る

     1 依頼 = 数問。どの問を作るかが枠で決まっているので、
     「作りすぎ」も「足りない」も依頼の時点で起こらない。
     ══════════════════════════════════════════════════════════ */
  function requestsOf(p, opts) {
    opts = opts || {};
    var batch = clamp(Math.round(Number(opts.batchSize) || DEFAULT_BATCH), 1, MAX_PER_SECTION);
    var out = [];
    (p.sections || []).forEach(function (sec) {
      for (var i = 0; i < sec.questions.length; i += batch) {
        var group = sec.questions.slice(i, i + batch);
        out.push({
          id: "r" + sec.number + "-" + (Math.floor(i / batch) + 1),
          sectionNumber: sec.number,
          sectionTitle: sec.title,
          slots: group.map(function (q) {
            return {
              id: q.id, number: q.number, type: q.type,
              points: q.points, difficulty: q.difficulty, expectedChars: q.expectedChars
            };
          })
        });
      }
    });
    return out;
  }

  /* ══════════════════════════════════════════════════════════
     3) gate — 1 問ぶんの下書きを受理するか決める（決定論）

     受理しなかったものは仕様へ入れない。
     「入れてから直す」をやめる。理由は必ず残す（黙って捨てない）。
     ══════════════════════════════════════════════════════════ */
  function gate(slot, draft, opts) {
    opts = opts || {};
    var reasons = [];
    draft = draft || {};

    var prompt = str(draft.question || draft.prompt).trim();
    if (prompt.length < 4) reasons.push({ code: "empty_prompt", message: "問題文がありません" });

    var type = MB.TYPE_MAP[str(draft.type)] || slot.type;
    /* 枠と違う形式で返ってきたら、枠を優先する。ただし
       選択肢の有無だけは中身で判断する（選択肢が無いのに選択問題にはできない）。 */
    var choices = Array.isArray(draft.choices) ? draft.choices.filter(function (c) { return str(c && c.text).trim(); }) : [];
    if (NEEDS_CHOICES[slot.type]) {
      /* 受理の基準は「保存できる形か」でなければ意味がない。
         validate.js の規則とそろえる。ここが緩いと、門を通ったのに
         保存できない仕様ができあがる（V1 で実際に起きた）。

         ただし **直せるものまで落とさない。**
         実測（2026-08-04）: 受理できなかった 15 件のうち 14 件が
         「正誤問題なのに選択肢が 3〜4 個」だった。これは組み立てのときに
         「正しい／誤っている」へそろえ直せる（mock-builder.repairSpec の仕事）。
         直せるものを門で落とすと、作り直しても同じことが起きるだけで、
         頼んだ数にいつまでも届かない。 */
      if (choices.length < 2) reasons.push({ code: "no_choices", message: "選択肢が 2 つ未満です" });
      else if (choices.length > 10)
        reasons.push({ code: "choice_count", message: "選択肢が多すぎます（" + choices.length + " 件）" });
    }

    var answer = str(draft.answer || draft.correctAnswer).trim();
    if (!answer) reasons.push({ code: "no_answer", message: "正解がありません" });
    else if (NEEDS_CHOICES[slot.type] && choices.length >= 2 && !resolvesToChoice(answer, choices))
      reasons.push({ code: "answer_not_in_choices", message: "正解が選択肢の中にありません" });

    if (!str(draft.explanation).trim())
      reasons.push({ code: "no_explanation", message: "解説がありません" });

    if (opts.requireSources) {
      /* 出典は「書いてある」ではなく「実データへ解決できる」で判定する。
         mock-builder の mapSources は fileName の無い参照を捨てるので、
         件数だけ見ていると門は通るのに仕様には出典が 0 件、という食い違いが出る。 */
      var refs = (Array.isArray(draft.sourceReferences) ? draft.sourceReferences : [])
        .filter(function (r) { return r && str(r.fileName).trim(); });
      if (!refs.length) reasons.push({ code: "no_source", message: "資料の該当箇所を特定できていません" });
    }

    return { ok: !reasons.length, reasons: reasons, type: type };
  }

  /* 「①」「ア」「A」「1」や本文一致で選択肢を引けるか。
     引けない書き方をされたものを受理すると、解答欄と採点が作れない。 */
  function resolvesToChoice(answer, choices) {
    for (var i = 0; i < choices.length; i++) {
      var c = choices[i];
      if (str(c.id) === answer || str(c.text).trim() === answer) return true;
      if (String.fromCharCode(65 + i) === answer.toUpperCase()) return true;
    }
    var idx = MB.symbolIndex(answer);
    return idx >= 0 && idx < choices.length;
  }

  /* 選択肢をそろえる。
       ・文が空のものは落とす
       ・同じ文が 2 つ以上あれば、最初の 1 つだけ残す（残りは正解の指し先を付け替える）
       ・id は必ず c1, c2 … へ振り直す（同じ id が来ても衝突しない）
     answer は元の id・記号・本文のどれで来ても、新しい id へ直して返す。 */
  /* 正誤問題の「正しい／誤っている」の見分け。
     どちら側かが分かるときだけ数を返す（0 = 正しい / 1 = 誤っている / -1 = 分からない）。

     はじめは行頭だけを見ていたが、実測（2026-08-04）で
     `tf_side_unknown` が 5 件出た。モデルは「この記述は正しい」「○ 正しい」
     「A: 正しい」のように前へ言葉を足してくる。**どこにあっても拾う。**
     ただし「正しくない」を「正しい」と読んではいけないので、打ち消しを先に見る。 */
  var FALSE_WORDS = /(誤っている|誤りである|誤り|間違って|正しくない|適切でない|当てはまらない|false|×|✗|バツ|いいえ|不適切|不当)/i;
  var TRUE_WORDS = /(正しい|正解|true|○|◯|✓|マル|はい|yes|適切|妥当|当てはまる)/i;
  function tfSideOf(text) {
    var t = str(text).trim();
    if (!t) return -1;
    /* 打ち消しが先。「正しくない」は「正しい」を含むので、順番を逆にすると必ず間違える。 */
    if (FALSE_WORDS.test(t)) return 1;
    if (TRUE_WORDS.test(t)) return 0;
    /* 「正」「誤」の 1 文字だけ、というのもある。上の語に当たらないときだけ見る。 */
    if (/^[正○◯]$/.test(t)) return 0;
    if (/^[誤×✗]$/.test(t)) return 1;
    return -1;
  }

  /* 選択肢の並びから、答えの側を割り出す。
     答えそのものが読めなくても、**もう片方が「誤っている」と分かれば、こちらは「正しい」**。
     推測ではなく、2 択という決まりから出てくる結論なので使ってよい。 */
  function tfSideFromChoices(choices, answerId) {
    var list = choices || [];
    if (list.length !== 2) return -1;
    var ai = -1;
    for (var i = 0; i < list.length; i++) if (list[i].id === answerId) ai = i;
    if (ai < 0) return -1;
    var mine = tfSideOf(list[ai].text);
    if (mine >= 0) return mine;
    var other = tfSideOf(list[1 - ai].text);
    if (other >= 0) return other === 0 ? 1 : 0;   /* 相手が正なら自分は誤、その逆も */
    return -1;
  }

  function normalizeChoices(list, answer) {
    var src = (Array.isArray(list) ? list : []).filter(function (c) { return str(c && c.text).trim(); });
    var out = [], map = {}, seenText = {};
    src.forEach(function (c, i) {
      var text = str(c.text).trim();
      var oldId = str(c.id);
      var key = text.replace(/\s+/g, "");
      if (seenText[key]) {
        /* 同じ文はまとめる。指し先だけ、残したほうへ向ける。 */
        if (oldId) map[oldId] = seenText[key];
        return;
      }
      var id = "c" + (out.length + 1);
      seenText[key] = id;
      if (oldId) map[oldId] = id;
      /* 記号（A / ①）や順番でも引けるようにしておく */
      map[String.fromCharCode(65 + i)] = map[String.fromCharCode(65 + i)] || id;
      map[String(i + 1)] = map[String(i + 1)] || id;
      map[text] = id;
      out.push({ id: id, text: text, explanation: str(c.explanation) });
    });
    var a = str(answer).trim();
    return { choices: out, answer: (a && map[a]) ? map[a] : a };
  }

  /* ══════════════════════════════════════════════════════════
     4) assemble — 受理した中身を枠へはめて MockSpec を作る

     配点は **Plan の値をそのまま使う**。AI が書いてきた points は読まない。
     ＝「100 点のはずが 83 点」は、この段階の作りとして起こりえない。
     ══════════════════════════════════════════════════════════ */
  function assemble(p, filled, opts) {
    opts = opts || {};
    var accepted = 0, missing = [], rejected = [];

    /* filled: { slotId: draftQuestion }
       ここでも門を通す。呼び出し側が通し忘れても、受理できない中身は入らない。
       ＝「入ってしまったので後で直す」経路を残さない。 */
    var sections = [], answerKey = [];
    /* 大問ごとに「実際に入れた枠の id」を順番どおり控える。
       仕上げ（MB.fromDraft）で設問の id は q1, q2… へ振り直されるので、
       あとから「この設問はどの枠か」を引けなくなる。
       1 問だけ作り直すには、その対応が要る。 */
    var usedSlots = [];
    (p.sections || []).forEach(function (sec) {
      var qs = [], used = [];
      sec.questions.forEach(function (slot) {
        var d = filled ? filled[slot.id] : null;
        if (!d) { missing.push(slot.id); return; }
        var g = gate(slot, d, { requireSources: p.requireSources });
        if (!g.ok) {
          missing.push(slot.id);
          rejected.push({ slotId: slot.id, reasons: g.reasons });
          return;
        }
        accepted++;
        used.push(slot.id);
        /* 選択肢をそろえる。**同じ id・同じ文が混ざったままにしない。**
           実測（2026-08-04）: 保存できない理由の上位が
           duplicateChoiceId / duplicateChoiceText / tooManyCorrect だった。
           同じ文の選択肢が 2 つあると、正解の当て方が両方に当たり、
           「正解が複数」になって保存できない。
           ここでそろえ、正解の指し先も付け替える。 */
        /* **選択肢が要らない形式には、選択肢を付けない。**
           短答や記述に選択肢が付いていると、組み立てのときに選択問題として
           扱われ、正解の当て先が見つからずに正解が空になる
           （実測: 短答の correctAnswer が空で保存できなかった）。
           モデルは短答にも選択肢を付けてくることがあるので、ここで落とす。 */
        var norm = NEEDS_CHOICES[slot.type]
          ? normalizeChoices(d.choices, str(d.answer || d.correctAnswer))
          : { choices: [], answer: str(d.answer || d.correctAnswer) };
        /* 正誤問題は **必ず 2 択**（保存の決まり）。3 つ以上返ってきたら
           「正しい／誤っている」へそろえ直す。どちら側かが分からないときは、
           当てずっぽうで正解を決めない。その枠は空のままにする。 */
        if (slot.type === "true_false") {
          var picked = norm.choices.filter(function (c) { return c.id === norm.answer; })[0];
          var side = picked ? tfSideOf(picked.text) : tfSideOf(norm.answer);
          /* 選んだ選択肢の言い回しで分からなくても、もう片方から割り出せることがある。 */
          if (side < 0) side = tfSideFromChoices(norm.choices, norm.answer);
          if (side < 0) {
            missing.push(slot.id);
            rejected.push({ slotId: slot.id,
              reasons: [{ code: "tf_side_unknown", message: "正誤問題の正解が「正しい／誤っている」のどちらか分かりません" }] });
            accepted--; used.pop();
            return;
          }
          norm = {
            choices: [{ id: "c1", text: "正しい", explanation: "" },
                      { id: "c2", text: "誤っている", explanation: "" }],
            answer: side === 0 ? "c1" : "c2"
          };
        }
        var choices = norm.choices;
        qs.push({
          id: slot.id,
          type: slot.type,                       /* 枠が正 */
          question: str(d.question || d.prompt),
          choices: choices,
          points: slot.points,                   /* 枠が正。AI の申告は使わない */
          difficulty: slot.difficulty,
          topic: str(d.topic),
          expectedChars: slot.expectedChars || undefined,
          sourceReferences: Array.isArray(d.sourceReferences) ? d.sourceReferences : [],
          requiresReview: d.requiresReview === true
        });
        answerKey.push({
          id: slot.id,
          /* 選択肢をそろえ直したので、正解の指し先も付け替えた値を使う。 */
          answer: norm.answer,
          explanation: str(d.explanation)
        });
      });
      if (qs.length) {
        sections.push({
          name: sec.title || ("大問" + sec.number),
          instructions: str(sec.instructions),
          questions: qs
        });
        usedSlots.push(used);
      }
    });

    var spec = MB.fromDraft({ sections: sections, answerKey: answerKey }, {
      title: p.title, subject: p.subject, grade: p.grade, audience: p.audience,
      durationMinutes: p.durationMinutes, totalPoints: p.totalPoints,
      sourceMode: p.sourceMode, paper: opts.paper || null, ownerId: opts.ownerId || ""
    });

    /* 機械で直せる不備（正誤の選択肢・正解の書き当て・採点基準）はここで直す。 */
    var rep = MB.repairSpec(spec, { requireSources: p.requireSources });

    /* 欠けた設問があるぶん、合計は満点に届かない。
       黙って埋めず、残っている設問だけで満点へ割り直す。
       ＝ 常に「合計 = 満点」を満たし、欠けたことは issues に残す。 */
    var alloc = SA.allocate(rep.spec, { targetTotal: p.totalPoints });
    var fin = MB.finalize(alloc.ok ? alloc.spec : rep.spec);

    /* 仕上がった設問の id → 枠の id。並び順は変わらないので、順に突き合わせる。
       ここが空なら、1 問だけ作り直す操作は出さない（間違った枠を消さないため）。 */
    var slotOf = {};
    (fin.spec.sections || []).forEach(function (sec, si) {
      var used = usedSlots[si] || [];
      (sec.questions || []).forEach(function (q, qi) {
        if (used[qi]) slotOf[q.id] = used[qi];
      });
    });

    return {
      spec: fin.spec,
      finalize: fin,
      audit: rep.audit,
      fixed: rep.fixed,
      slotOf: slotOf,
      accepted: accepted,
      planned: p.totalQuestions,
      missing: missing,
      /* なぜ入らなかったのかを必ず残す。黙って捨てない。 */
      rejected: rejected,
      issues: (p.issues || []).concat(missing.length ? [{
        severity: "high", type: "incomplete",
        message: p.totalQuestions + " 問の枠のうち " + missing.length + " 問が埋まっていません。"
          + (rejected.length ? "（うち " + rejected.length + " 問は中身が足りず受理できませんでした）" : "")
      }] : []).concat(alloc.ok ? [] : (alloc.issues || []))
    };
  }

  /* ══════════════════════════════════════════════════════════
     5) verify — できたものが Plan どおりか（違えば未完成）

     ここを通らないものは「完成」と呼ばない。警告だけ出して完成扱いにしない。
     ══════════════════════════════════════════════════════════ */
  function verify(spec, p) {
    var out = [];
    if (!spec || !p) return [{ severity: "high", type: "missing", message: "仕様か計画がありません。" }];

    var qs = (spec.sections || []).reduce(function (a, s) { return a.concat(s.questions || []); }, []);
    if (qs.length !== p.totalQuestions)
      out.push({ severity: "high", type: "count_mismatch",
        message: "設問数が計画と違います（計画 " + p.totalQuestions + " 問 / 実際 " + qs.length + " 問）。" });

    var sum = qs.reduce(function (a, q) { return a + (Number(q.points) || 0); }, 0);
    if (sum !== p.totalPoints)
      out.push({ severity: "high", type: "total_mismatch",
        message: "配点の合計が満点と違います（満点 " + p.totalPoints + " 点 / 実際 " + sum + " 点）。" });

    (spec.sections || []).forEach(function (s) {
      var ss = (s.questions || []).reduce(function (a, q) { return a + (Number(q.points) || 0); }, 0);
      if (Number(s.points) !== ss)
        out.push({ severity: "medium", type: "section_total_mismatch",
          message: s.title + " の配点（" + s.points + "）が設問の合計（" + ss + "）と違います。" });
    });

    /* 解答欄を作れない設問が 1 問でもあれば未完成。 */
    qs.forEach(function (q) {
      if (NEEDS_CHOICES[q.type] && (q.choices || []).length < 2)
        out.push({ severity: "high", type: "unanswerable", target: q.id,
          message: "問" + q.globalNumber + "：選択肢がありません。" });
      else if (NEEDS_CHOICES[q.type] && !(q.choices || []).some(function (c) { return c.isCorrect; }))
        out.push({ severity: "high", type: "no_correct", target: q.id,
          message: "問" + q.globalNumber + "：正解が選択肢に割り当てられていません。" });
      if (!NEEDS_CHOICES[q.type] && !str(q.correctAnswer).trim() && !(q.acceptedAnswers || []).length)
        out.push({ severity: "high", type: "no_answer", target: q.id,
          message: "問" + q.globalNumber + "：正解がありません。" });
    });

    return out;
  }

  /* ══════════════════════════════════════════════════════════
     計測（GenerationStageMetric）

     推測で速くなったと言わないために、工程ごとに実測を残す。
     本文・添付は入れない（数字だけ）。
     ══════════════════════════════════════════════════════════ */
  function Metrics(label) {
    this.label = label || "";
    this.startedAt = Date.now();
    this.stages = [];
    this.open = {};
    this.counts = { requested: 0, generated: 0, accepted: 0, discarded: 0, retried: 0, failed: 0 };
    this.tokens = { prompt: 0, completion: 0, modelCalls: 0 };
  }
  Metrics.prototype.begin = function (stage, extra) {
    this.open[stage] = { stage: stage, startedAt: Date.now(), extra: extra || null };
    return this;
  };
  Metrics.prototype.end = function (stage, extra) {
    var o = this.open[stage];
    if (!o) { this.stages.push({ stage: stage, startedAt: Date.now(), durationMs: 0, extra: extra || null }); return this; }
    delete this.open[stage];
    this.stages.push({
      stage: stage, startedAt: o.startedAt, durationMs: Date.now() - o.startedAt,
      extra: Object.assign({}, o.extra || {}, extra || {})
    });
    return this;
  };
  Metrics.prototype.note = function (patch) {
    var c = this.counts;
    Object.keys(patch || {}).forEach(function (k) { if (c[k] != null) c[k] += patch[k]; });
    return this;
  };
  Metrics.prototype.noteUsage = function (u) {
    if (!u) return this;
    this.tokens.prompt += Number(u.promptTokens) || 0;
    this.tokens.completion += Number(u.completionTokens) || 0;
    this.tokens.modelCalls += Number(u.modelCalls) || 0;
    return this;
  };
  Metrics.prototype.snapshot = function () {
    var self = this;
    var byStage = {};
    this.stages.forEach(function (s) {
      var b = byStage[s.stage] || (byStage[s.stage] = { stage: s.stage, n: 0, totalMs: 0 });
      b.n++; b.totalMs += s.durationMs;
    });
    return {
      label: this.label, version: VERSION,
      startedAt: this.startedAt, durationMs: Date.now() - this.startedAt,
      counts: Object.assign({}, this.counts),
      tokens: Object.assign({}, this.tokens),
      /* 閉じ忘れた工程も出す。隠すと「速い」と誤解する。 */
      openStages: Object.keys(this.open),
      stages: Object.keys(byStage).map(function (k) { return byStage[k]; })
        .sort(function (a, b) { return b.totalMs - a.totalMs; }),
      timeline: self.stages.slice()
    };
  };

  VQ2.mockCompiler = {
    VERSION: VERSION,
    MAX_PER_SECTION: MAX_PER_SECTION,
    _tfSideOf: tfSideOf, _tfSideFromChoices: tfSideFromChoices,
    DEFAULT_BATCH: DEFAULT_BATCH,
    NEEDS_CHOICES: NEEDS_CHOICES,
    WRITTEN: WRITTEN,
    plan: plan,
    requestsOf: requestsOf,
    gate: gate,
    assemble: assemble,
    verify: verify,
    Metrics: Metrics,
    /* テスト用に出しておく（内部の割り当てが正しいかを直接確かめられるように） */
    _spread: spread,
    _enabledTypes: enabledTypes,
    _resolvesToChoice: resolvesToChoice
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
