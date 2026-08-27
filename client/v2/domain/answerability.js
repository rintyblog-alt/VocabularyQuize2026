/* ══════════════════════════════════════════════════════════════════════
   回答できるか・採点できるかを確かめる（V3 §20 / §21）

   AI が返した JSON が形として正しくても、
   ・並べ替えの正しい順が 2 通りある
   ・組み合わせの相手がいない
   ・記述なのに採点の観点が無い
   ・選択肢の中に同じ文が 2 つある
   といったものは、**人が解けない・点をつけられない**。

   ここを通らない問題は出題しない。
   直せるものは「どこが足りないか」を返し、修復（repair.js）へ渡す。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var Q = VQ2.qtypes;
  if (!Q) throw new Error("VQ2.qtypes must be loaded before answerability.js");

  function arr(v) { return Array.isArray(v) ? v : []; }
  function str(v) { return v === undefined || v === null ? "" : String(v); }
  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function norm(s) { return str(s).replace(/\s+/g, "").replace(/[。、．，！？!?「」『』（）()]/g, "").toLowerCase(); }

  function issue(code, message, level, fix) {
    return { code: code, message: message, level: level || "error", fix: fix || "" };
  }

  /* ══════════════════════════════════════════════════════════════════
     回答できるか
     ══════════════════════════════════════════════════════════════════ */
  var ANSWERABLE = {
    single_choice: function (q, out) {
      var ch = arr(q.choices);
      if (ch.length < 2) { out.push(issue("tooFewChoices", "選択肢が 2 つ未満です。", "error", "choices")); return; }
      var correct = ch.filter(function (c) { return c.isCorrect; });
      if (!correct.length) { out.push(issue("noCorrect", "正解がどれか決まっていません。", "error", "correctAnswer")); return; }
      if (correct.length > 1) out.push(issue("multipleCorrect", "1 つ選ぶ形式なのに正解が複数あります。", "error", "correctAnswer"));
      dupTexts(ch, out);
      exposedAnswer(q, correct[0], out);
    },
    true_false: function (q, out) { ANSWERABLE.single_choice(q, out); },
    image_choice: function (q, out) {
      ANSWERABLE.single_choice(q, out);
      if (!hasImage(q)) out.push(issue("noImage", "画像がありません。画像問題は画像なしでは解けません。", "error", "media"));
    },
    audio_choice: function (q, out) {
      ANSWERABLE.single_choice(q, out);
      if (!hasAudio(q)) out.push(issue("noAudio", "音声がありません。聞き取る問題は音声なしでは解けません。", "error", "media"));
    },
    multi_choice: function (q, out) {
      var ch = arr(q.choices);
      if (ch.length < 3) out.push(issue("tooFewChoices", "複数選択なのに選択肢が少なすぎます。", "error", "choices"));
      var correct = ch.filter(function (c) { return c.isCorrect; });
      if (correct.length < 2) out.push(issue("needTwoCorrect", "複数選択なのに正解が 1 つしかありません。", "error", "correctAnswers"));
      if (correct.length === ch.length) out.push(issue("allCorrect", "すべてが正解になっています。選ぶ意味がありません。", "error", "correctAnswers"));
      dupTexts(ch, out);
    },
    text_input: function (q, out) {
      var a = str(q.correctAnswer).trim();
      if (!a) { out.push(issue("noAnswer", "正解が入っていません。", "error", "correctAnswer")); return; }
      if (a.length > 40) out.push(issue("answerTooLong", "正解が長すぎます。書き方が何通りもあり、正誤を決められません。", "warning", "correctAnswer"));
      if (norm(a).length >= 3 && norm(q.prompt).indexOf(norm(a)) >= 0)
        out.push(issue("answerInPrompt", "問題文の中に正解がそのまま書かれています。", "error", "prompt"));
    },
    numeric_input: function (q, out) {
      var raw = str(q.correctAnswer).replace(/,/g, "").trim();
      if (!raw) { out.push(issue("noAnswer", "正解の数値が入っていません。", "error", "correctAnswer")); return; }
      if (!isFinite(Number(raw))) out.push(issue("notNumeric", "正解が数値になっていません。", "error", "correctAnswer"));
      var tol = q.scoringRule && q.scoringRule.tolerance;
      if (isNum(tol) && tol < 0) out.push(issue("badTolerance", "許す誤差が負の数です。", "error", "scoringRule"));
    },
    fill_blank: function (q, out) {
      var bl = arr(q.blanks);
      if (!bl.length) { out.push(issue("noBlanks", "空欄がありません。", "error", "blanks")); return; }
      bl.forEach(function (b, i) {
        if (!str(b.answer).trim()) out.push(issue("emptyBlankAnswer", (i + 1) + " つ目の空欄の正解が空です。", "error", "blanks"));
      });
      /* 文の中に空欄の印があるか。
         画面は空欄を番号つきの入力欄として別に出すので、印が無くても解ける。
         ただし文と正解の対応が読み取りにくくなるので、直す対象として残す。 */
      var marks = countMarks(q.prompt);
      if (marks === 0) out.push(issue("noBlankMark", "文の中に空欄の印（【　】）がありません。", "warning", "prompt"));
      else if (marks !== bl.length)
        out.push(issue("blankCountMismatch", "空欄の数（" + marks + "）と正解の数（" + bl.length + "）が合っていません。", "warning", "blanks"));
    },
    reorder: function (q, out) {
      var items = arr(q.orderItems);
      if (items.length < 2) { out.push(issue("tooFewItems", "並べ替える項目が 2 つ未満です。", "error", "orderItems")); return; }
      if (items.length === 2) out.push(issue("onlyTwoItems", "項目が 2 つしかなく、当てずっぽうで当たります。", "warning", "orderItems"));
      var ids = {}, dup = false, empty = false;
      items.forEach(function (x) { if (ids[x.id]) dup = true; ids[x.id] = 1; if (!str(x.text).trim()) empty = true; });
      if (dup) out.push(issue("duplicateItemId", "並べ替える項目の id が重複しています。", "error", "orderItems"));
      if (empty) out.push(issue("emptyItem", "並べ替える項目に空のものがあります。", "error", "orderItems"));
      var order = arr(q.correctOrder);
      if (order.length !== items.length)
        out.push(issue("orderMismatch", "正しい順の数が項目の数と合っていません。", "error", "correctOrder"));
      else if (order.some(function (id) { return !ids[id]; }))
        out.push(issue("orderUnknownId", "正しい順に、存在しない項目が入っています。", "error", "correctOrder"));
      /* 同じ文の項目があると、正しい順が 1 通りに決まらない。 */
      var seen = {};
      items.forEach(function (x) {
        var k = norm(x.text);
        if (k && seen[k]) out.push(issue("ambiguousOrder", "同じ内容の項目があるため、正しい順が 1 通りに決まりません。", "error", "orderItems"));
        seen[k] = 1;
      });
    },
    matching: function (q, out) {
      var p = q.pairs || {};
      var left = arr(p.left), right = arr(p.right), correct = p.correct || {};
      if (left.length < 2 || right.length < 2) { out.push(issue("tooFewPairs", "組み合わせが 2 組未満です。", "error", "pairs")); return; }
      var rid = {}; right.forEach(function (r) { rid[r.id] = 1; });
      left.forEach(function (l) {
        var to = correct[l.id];
        if (!to) out.push(issue("noPartner", "「" + str(l.text).slice(0, 12) + "」の相手が決まっていません。", "error", "pairs"));
        else if (!rid[to]) out.push(issue("unknownPartner", "存在しない相手を指しています。", "error", "pairs"));
      });
      /* 右側に同じ文が 2 つあると、どちらを選んでも正しくなる。 */
      var seen = {};
      right.forEach(function (r) {
        var k = norm(r.text);
        if (k && seen[k]) out.push(issue("duplicateRight", "右側に同じ内容があるため、対応を 1 通りに決められません。", "error", "pairs"));
        seen[k] = 1;
      });
    },
    classification: function (q, out) {
      var c = q.classification || {};
      var groups = arr(c.groups), items = arr(c.items);
      if (groups.length < 2) { out.push(issue("tooFewGroups", "分け先が 2 つ未満です。", "error", "classification")); return; }
      if (items.length < 2) { out.push(issue("tooFewItems", "分ける項目が 2 つ未満です。", "error", "classification")); return; }
      var gid = {}; groups.forEach(function (g) { gid[g.id] = 0; });
      items.forEach(function (it) {
        if (!it.groupId || gid[it.groupId] === undefined)
          out.push(issue("noGroup", "「" + str(it.text).slice(0, 12) + "」の分け先が決まっていません。", "error", "classification"));
        else gid[it.groupId]++;
      });
      Object.keys(gid).forEach(function (id) {
        if (gid[id] === 0) {
          var g = groups.filter(function (x) { return x.id === id; })[0];
          out.push(issue("emptyGroup", "「" + str(g && g.label).slice(0, 12) + "」に入る項目がありません。", "warning", "classification"));
        }
      });
    },
    table_fill: function (q, out) {
      var t = q.table || {};
      var rows = arr(t.rows), n = 0;
      rows.forEach(function (r) {
        arr(r.cells).forEach(function (c) {
          if (c.editable) { n++; if (!str(c.answer).trim()) out.push(issue("emptyCellAnswer", "埋めるますの正解が空です。", "error", "table")); }
        });
      });
      if (!n) out.push(issue("noEditableCell", "埋めるますがありません。", "error", "table"));
    },
    chart_read: function (q, out) {
      var c = q.chart;
      if (!c) { out.push(issue("noChart", "図表の中身がありません。", "error", "chart")); return; }
      var series = arr(c.series);
      var hasValue = series.some(function (s) { return arr(s.values).length; });
      if (!hasValue) out.push(issue("noChartValue", "図表に読み取る値が入っていません。", "error", "chart"));
      if (!arr(q.choices).length && !str(q.correctAnswer).trim())
        out.push(issue("noAnswer", "図表の問題の正解が入っていません。", "error", "correctAnswer"));
    },
    error_correction: function (q, out) {
      var spans = arr(q.errorSpans);
      if (!spans.length) { out.push(issue("noErrorSpan", "誤りの箇所がありません。", "error", "errorSpans")); return; }
      var body = str(q.prompt) + str(q.context);
      spans.forEach(function (s) {
        if (!str(s.wrong).trim() || !str(s.correct).trim())
          out.push(issue("emptyCorrection", "誤っている語か正しい形が空です。", "error", "errorSpans"));
        else if (body.indexOf(str(s.wrong)) < 0)
          out.push(issue("wrongNotInText", "「" + str(s.wrong).slice(0, 12) + "」が問題文の中に見つかりません。", "error", "errorSpans"));
        else if (norm(s.wrong) === norm(s.correct))
          out.push(issue("sameCorrection", "誤りと正しい形が同じです。", "error", "errorSpans"));
      });
    },
    free_text: function (q, out) {
      var rub = q.scoringRubric && arr(q.scoringRubric.items);
      if (!rub || !rub.length) { out.push(issue("noRubric", "採点の観点がありません。書いても点をつけられません。", "error", "scoringRubric")); return; }
      var bad = rub.filter(function (r) { return !str(r.description).trim(); });
      if (bad.length) out.push(issue("emptyCriterion", "採点の観点に中身のないものがあります。", "error", "scoringRubric"));
      if (!str(q.correctAnswer).trim())
        out.push(issue("noModelAnswer", "模範解答がありません。採点の手がかりが弱くなります。", "warning", "correctAnswer"));
    },
    dictation: function (q, out) {
      /* 書き取りは正解の文がそのまま原稿になる（読み上げるのはこの文）。 */
      if (!str(q.correctAnswer).trim()) out.push(issue("noScript", "書き取る文がありません。", "error", "correctAnswer"));
    },
    /* 位置とラベルは、画面の大きさに関係なく 0〜1 で持つ。
       範囲の外や、小さすぎる的は、**指では押せない**ので出題させない。 */
    image_point: function (q, out) {
      if (!hasImage(q)) { out.push(issue("noImage", "画像がありません。", "error", "media")); return; }
      var spots = arr(q.hotspots);
      if (!spots.length) { out.push(issue("noRegion", "正解の場所がありません。", "error", "hotspots")); return; }
      spots.forEach(function (h) {
        if ([h.x, h.y].filter(isNum).some(function (v) { return v < 0 || v > 1; }))
          out.push(issue("regionOutside", "正解の場所が画像の外にあります（座標は 0〜1 で表します）。", "error", "hotspots"));
        if (isNum(h.r) && h.r > 0 && h.r < 0.02)
          out.push(issue("regionTooSmall", "正解の場所が小さすぎて、指では押せません。", "error", "hotspots"));
        if (isNum(h.w) && isNum(h.h) && h.w > 0 && h.h > 0 && (h.w < 0.03 || h.h < 0.03))
          out.push(issue("regionTooSmall", "正解の場所が小さすぎて、指では押せません。", "error", "hotspots"));
      });
    },
    image_label: function (q, out) {
      if (!hasImage(q)) { out.push(issue("noImage", "画像がありません。", "error", "media")); return; }
      var L = q.labels || {};
      var slots = arr(L.slots), bank = arr(L.bank);
      if (!slots.length || !bank.length) {
        out.push(issue("noLabels", "ラベルか置き場所がありません。", "error", "labels"));
        return;
      }
      slots.forEach(function (s) {
        if ([s.x, s.y].filter(isNum).some(function (v) { return v < 0 || v > 1; }))
          out.push(issue("regionOutside", "ラベルを置く場所が画像の外にあります。", "error", "labels"));
      });
    },
    flashcard: function (q, out) {
      var c = q.card || {};
      if (!str(c.front).trim() || !str(c.back).trim())
        out.push(issue("emptyCard", "カードの表か裏が空です。", "error", "card"));
    },
    composite: function (q, out) {
      var kids = arr(q.children);
      if (!kids.length) { out.push(issue("noChildren", "小問がありません。", "error", "children")); return; }
      if (!str(q.context).trim() && !str(q.instruction).trim())
        out.push(issue("noSharedContext", "大問の共通資料がありません。", "error", "context"));
      kids.forEach(function (k, i) {
        var r = checkAnswerable(k);
        r.issues.filter(function (x) { return x.level === "error"; }).forEach(function (x) {
          out.push(issue("child:" + x.code, "小問 " + (i + 1) + "：" + x.message, "error", x.fix));
        });
      });
    }
  };

  function dupTexts(choices, out) {
    var seen = {};
    arr(choices).forEach(function (c) {
      var k = norm(c.text);
      if (!k) { out.push(issue("emptyChoice", "空の選択肢があります。", "error", "choices")); return; }
      if (seen[k]) out.push(issue("duplicateChoice", "同じ内容の選択肢が 2 つあります。", "error", "choices"));
      seen[k] = 1;
    });
  }
  function exposedAnswer(q, correct, out) {
    if (!correct) return;
    var a = norm(correct.text);
    if (a.length >= 4 && norm(q.prompt).indexOf(a) >= 0)
      out.push(issue("answerInPrompt", "問題文の中に正解がそのまま書かれています。", "warning", "prompt"));
  }
  function countMarks(text) {
    var m = str(text).match(/【\s*】|【[^】]{0,4}】|＿{2,}|_{2,}|\(\s*\d*\s*\)/g);
    return m ? m.length : 0;
  }
  /* 素材は q.media（{kind, src}）に入る。qmodel と同じ見方をする。 */
  function hasMedia(q, kind) {
    return arr(q && q.media).some(function (m) { return m && str(m.kind) === kind; });
  }
  function hasImage(q) {
    return hasMedia(q, "image") || hasMedia(q, "diagram")
        || arr(q.choices).some(function (c) { return c && c.image; });
  }
  /* 原稿はそのまま音になる。解説や「〜が正解です」が混ざっていると、
     聞いた人に答えが分かってしまう。AI が説明を書き足しがちなので、
     形として正しくてもここで拾う（直せるように、消さずに知らせる）。 */
  var LEAK = /(が正解(です)?|正解は|答えは|正解の選択肢|the correct answer|answer is)/i;
  function scriptLeak(q, out) {
    var s = str(q && q.script);
    if (s && LEAK.test(s))
      out.push(issue("scriptLeaksAnswer",
        "読み上げる原稿に正解や解説が混ざっています。そのまま流すと答えが聞こえます。",
        "warning", "script"));
  }

  /* 音は「原稿があるか、音声ファイルがあるか」のどちらかでよい。
     原稿があれば鳴らすときに作れる（ui/tts.js）。Bridge が無い端末でも
     端末の読み上げで鳴るので、解けなくなることはない。 */
  function hasAudio(q) {
    return hasMedia(q, "audio") || str(q && q.script).trim()
        || arr(q.choices).some(function (c) { return c && c.audio; });
  }

  function checkAnswerable(q) {
    var out = [];
    if (!q || typeof q !== "object") return { ok: false, issues: [issue("noQuestion", "問題がありません。")] };
    var engine = q.engine || (Q.engineOf ? Q.engineOf(q.type) : "");
    if (!str(q.prompt).trim() && engine !== "flashcard")
      out.push(issue("emptyPrompt", "問題文が空です。", "error", "prompt"));
    var fn = ANSWERABLE[engine];
    if (!fn) out.push(issue("unknownEngine", "この形式の解き方が決まっていません（" + str(engine) + "）。", "error", "type"));
    else fn(q, out);
    /* 原稿は形式に関係なく音になる。どの形式でも同じように見る。 */
    scriptLeak(q, out);
    return {
      ok: !out.some(function (i) { return i.level === "error"; }),
      issues: out,
      errors: out.filter(function (i) { return i.level === "error"; }),
      warnings: out.filter(function (i) { return i.level === "warning"; })
    };
  }

  /* ══════════════════════════════════════════════════════════════════
     採点できるか（§21）
     ・採点できない問題は、出題も公開もさせない。
     ══════════════════════════════════════════════════════════════════ */
  function checkScorable(q, opts) {
    opts = opts || {};
    var out = [];
    if (!q || typeof q !== "object") return { ok: false, issues: [issue("noQuestion", "問題がありません。")] };
    var engine = q.engine || (Q.engineOf ? Q.engineOf(q.type) : "");
    var def = Q.get(q.type);

    /* 採点のしくみがあるか */
    var E = null;
    try { E = VQ2.evaluator && VQ2.evaluator.ENGINE_EVAL; } catch (e) {}
    if (E && !E[engine] && engine !== "flashcard")
      out.push(issue("noEvaluator", "この形式を採点するしくみがありません。", "error", "type"));

    /* 配点 */
    var pts = isNum(q.points) ? q.points : null;
    if (engine !== "flashcard") {
      if (pts === null) out.push(issue("noPoints", "配点が決まっていません。", "error", "points"));
      else if (pts <= 0) out.push(issue("badPoints", "配点が 0 以下です。", "error", "points"));
    }

    /* 記述は観点が要る。観点の合計と配点がずれていたら直す対象。 */
    if (engine === "free_text") {
      var rub = q.scoringRubric && arr(q.scoringRubric.items);
      if (!rub || !rub.length) out.push(issue("noRubric", "採点の観点がありません。AI 採点の根拠を示せません。", "error", "scoringRubric"));
      else {
        var sum = rub.reduce(function (a, r) { return a + (isNum(r.points) ? r.points : 0); }, 0);
        if (sum <= 0) out.push(issue("rubricNoPoints", "採点の観点に配点がありません。", "error", "scoringRubric"));
        else if (pts !== null && Math.abs(sum - pts) > 0.01)
          out.push(issue("rubricPointsMismatch", "観点の合計（" + sum + "）と配点（" + pts + "）が合っていません。", "warning", "points"));
      }
      if (opts.noAiGrading)
        out.push(issue("aiGradingNotAllowed", "AI 採点を使わない指定なので、この形式は出題できません。", "error", "type"));
    }

    /* 部分点を出す形式は、出し方が決まっているか */
    if (def && def.supportsPartialCredit && engine !== "free_text") {
      var known = { multi_choice: 1, fill_blank: 1, reorder: 1, matching: 1, classification: 1,
                    table_fill: 1, error_correction: 1, image_point: 1, image_label: 1,
                    dictation: 1, composite: 1 };
      if (!known[engine]) out.push(issue("noPartialRule", "部分点の出し方が決まっていません。", "warning", "scoringRule"));
    }

    /* 試験（サーバ採点）で使えるか */
    if (opts.mock) {
      var noPaper = (VQ2.capability && VQ2.capability.NO_PAPER_ENGINES) || {};
      if (noPaper[engine])
        out.push(issue("notPrintable", "この形式は紙に落とせません（試験では別の形式にしてください）。", "error", "type"));
      if (engine === "free_text" && !(q.scoringRubric && arr(q.scoringRubric.items).length))
        out.push(issue("mockNeedsRubric", "試験の記述には採点基準が必要です。", "error", "scoringRubric"));
    }

    return {
      ok: !out.some(function (i) { return i.level === "error"; }),
      issues: out,
      errors: out.filter(function (i) { return i.level === "error"; }),
      warnings: out.filter(function (i) { return i.level === "warning"; })
    };
  }

  /* 両方まとめて。取り込みのときはこれを呼ぶ。 */
  function check(q, opts) {
    var a = checkAnswerable(q), s = checkScorable(q, opts);
    var issues = a.issues.concat(s.issues);
    return {
      ok: a.ok && s.ok,
      answerable: a.ok,
      scorable: s.ok,
      issues: issues,
      errors: issues.filter(function (i) { return i.level === "error"; }),
      warnings: issues.filter(function (i) { return i.level === "warning"; }),
      /* 人へ出す 1 行。技術的な言い方をしない。 */
      reason: firstMessage(issues)
    };
  }
  function firstMessage(issues) {
    var e = issues.filter(function (i) { return i.level === "error"; })[0];
    return e ? e.message : "";
  }

  VQ2.answerability = {
    checkAnswerable: checkAnswerable,
    checkScorable: checkScorable,
    check: check,
    ANSWERABLE: ANSWERABLE
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
