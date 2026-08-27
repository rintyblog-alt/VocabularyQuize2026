/* ══════════════════════════════════════════════════════════════════════
   Result View V2（§9 / §28 / §30）
   ・点数だけで終わらせない。何を直せばよいかまで運ぶ。
   ・履歴が無いときに「前回比」を作らない（存在しない比較値を生成しない）。
   ・間違えた問題から復習プリセットを作る導線を正式に実装する。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  /* V3: 形式レジストリ・共通モデル・表示（結果の再現）・採点 */
  var QT = VQ2.qtypes, QM = VQ2.qmodel, QR = VQ2.qrender, EV = VQ2.evaluator;
  var U = VQ2.ui, S = VQ2.schema, ST = VQ2.store, G = VQ2.grading, AI = VQ2.ai, V = VQ2.validate;
  var esc = U.esc, icon = U.icon, btn = U.button, field = U.field;

  /* 形式の名前はレジストリから引く（画面へ書き写さない）。 */
  var TYPE_LABEL = (function () {
    var t = {};
    (VQ2.qtypes ? VQ2.qtypes.all() : []).forEach(function (d) { t[d.id] = d.shortName; });
    return t;
  })();
  var DIFF_LABEL = { easy: "易しい", normal: "標準", hard: "難しい" };

  function open(o) {
    o = o || {};
    var result = o.result || (o.resultId ? ST.results.get(o.resultId) : null);
    if (!result) return null;
    var preset = o.preset || (result.presetId ? ST.getPreset(result.presetId) : null);

    var app = U.mount("vq2-result-view", {
      title: "結果", onClose: o.onClose, onResize: function () { render(); }
    });

    var st = {
      tab: "summary",           /* summary | review | analysis */
      filter: "all",            /* all | wrong | unanswered | flagged | review */
      openItems: {},
      favorites: readFavorites(),
      aiBusy: false,
      analysis: null,
      analysisError: null,
      grading: false,
      pendingAi: o.pendingAi || []
    };
    var activity = null;

    var questions = result.questionsSnapshot || (preset ? preset.questions : []);
    var byId = {};
    questions.forEach(function (q) { byId[q.id] = q; });

    /* 記述の AI 採点が残っていれば、開いた直後に走らせる */
    if (st.pendingAi.length) { render(); runAiGrading(); }
    else render();

    /* ── お気に入り ─────────────────────────────────────────── */
    function readFavorites() {
      try { return JSON.parse(root.localStorage.getItem("vq2.favorites.v1") || "{}") || {}; }
      catch (e) { return {}; }
    }
    function saveFavorites() {
      try { root.localStorage.setItem("vq2.favorites.v1", JSON.stringify(st.favorites)); } catch (e) {}
    }

    /* ── 前回比（履歴があるときだけ） ──────────────────────── */
    function previous() {
      var list = ST.results.list().filter(function (r) {
        return r.presetId === result.presetId && r.id !== result.id && r.kind === result.kind;
      }).sort(function (a, b) { return (b.finishedAt || "").localeCompare(a.finishedAt || ""); });
      return list.length ? list[0] : null;
    }

    /* ── AI 補助採点 ───────────────────────────────────────── */
    function runAiGrading() {
      if (!st.pendingAi.length || st.grading) return;
      var targets = st.pendingAi.map(function (p) {
        var q = p.question;
        var answerText = (p.answer && p.answer.text !== undefined) ? p.answer.text : String(p.answer || "");
        var model = q.correctAnswer || (q.acceptedAnswers || [])[0] || "";
        /* 採点基準が無いときは、模範解答から作る。
           基準が無いまま AI へ渡すと、長さと丁寧さで点が付く。
           ここで作ったものはこの採点にだけ使い、プリセットへは保存しない。 */
        var rubricItems = (q.scoringRubric && q.scoringRubric.items) || [];
        if (!rubricItems.length && model) {
          try { rubricItems = (S.defaultRubric(q.type, q.points || 10, { modelAnswer: model }) || {}).items || []; }
          catch (e) { rubricItems = []; }
        }
        /* 内容の照合（機械で調べた事実）。点は付けない。 */
        var check = null;
        try { check = EV ? EV.contentCheck(q, answerText) : null; } catch (e) { check = null; }
        return {
          questionId: q.id,
          question: q.prompt,
          instruction: q.instruction || "",
          modelAnswer: model,
          /* 模範解答が無いときは解説を代わりに見せる（作り話をさせないため）。 */
          referenceNote: model ? "" : String(q.explanation || "").slice(0, 1200),
          answer: answerText,
          points: q.points,
          subject: preset ? preset.subjectId : "",
          constraints: [
            (q.settings && q.settings.minLength) ? q.settings.minLength + " 文字以上" : "",
            (q.settings && q.settings.maxLength) ? q.settings.maxLength + " 文字以内" : "",
            (q.settings && q.settings.forbidVerbatim) ? "本文の丸写しは不可" : ""
          ].filter(Boolean).join("／"),
          rubric: rubricItems.map(function (r) {
            return { id: r.id, description: r.description, points: r.points,
                     criterionLabel: r.criterionId ? S.criterionLabel(r.criterionId) : "" };
          }),
          /* ここが「長さと丁寧さで採点する」のを止める要。
             何が書けていて何が抜けているかを、先に機械で調べて渡す。 */
          contentCheck: check ? {
            coverage: check.coverage, found: check.found, total: check.total,
            length: check.length, lengthOk: check.lengthOk, verbatim: check.verbatim,
            points: (check.points || []).map(function (x) {
              return { text: x.text, found: x.found, ratio: x.ratio,
                       missing: (x.missWords || []).slice(0, 6) };
            })
          } : null,
          sourceText: (q.sourceReferences || []).map(function (s) { return s.excerpt || ""; }).filter(Boolean).join("\n").slice(0, 2000)
        };
      });
      if (!targets.some(function (t) { return t.rubric.length; })) {
        /* 採点基準も模範解答も無いなら、AI 採点は走らせない（根拠を示せないため） */
        st.pendingAi = [];
        render();
        return;
      }

      st.grading = true;
      render();
      AI.gradeAnswers({
        targets: targets,
        onActivity: function (items) { if (activity) activity.set(items); },
        onWarning: function (m) { app.toast(m, "warning", 6000); }
      }).then(function (res) {
        st.grading = false;
        var data = res.structured && res.structured.data ? res.structured.data : null;
        if (!data || !data.grades) { app.toast("記述の採点を完了できませんでした。", "warning"); st.pendingAi = []; render(); return; }
        applyGrades(data.grades);
      }).catch(function (e) {
        st.grading = false;
        if (!(e && e.cancelled)) app.toast(e.userMessage || "記述の採点に失敗しました。", "error");
        st.pendingAi = [];
        render();
      });
    }

    function applyGrades(grades) {
      var changed = 0;
      grades.forEach(function (g) {
        if (!g.ok || !g.grade) return;
        var q = byId[g.questionId];
        var item = result.items.find(function (i) { return i.questionId === g.questionId; });
        if (!q || !item) return;
        var applied = G.applyAiGrade(item, q, g.grade);
        Object.assign(item, applied);
        item.answered = true;
        item.method = "ai-assisted";
        /* 点が内容と食い違っていないかを、機械で確かめる。
           食い違っていたら点は動かさず、確認をおすすめする。 */
        try {
          var ansText = (item.value && item.value.text !== undefined) ? item.value.text : String(item.value || "");
          var cc = EV ? EV.crossCheckGrade(q, ansText, item) : null;
          if (cc) {
            item.contentCheck = cc.check;
            if (cc.notes.length) {
              item.requiresReview = true;
              item.adjustments = (item.adjustments || []).concat(cc.notes);
            }
          }
        } catch (e) {}
        changed++;
      });
      if (changed) {
        recompute();
        var r = ST.results.put(result, { baseRevision: result.revision });
        if (r.ok) result = r.record;
      }
      st.pendingAi = [];
      render();
      if (changed) {
        var needReview = result.items.filter(function (i) { return i.requiresReview; }).length;
        app.toast("記述 " + changed + " 問を採点しました。"
          + (needReview ? needReview + " 問は確認をおすすめします。" : ""), "success", 6000);
      }
    }

    function recompute() {
      var score = 0, max = 0, correct = 0, wrong = 0, un = 0;
      result.items.forEach(function (i) {
        max += i.maxScore || 0;
        if (typeof i.score === "number") score += i.score;
        if (!i.answered) un++;
        else if (i.correct === true) correct++;
        else if (i.correct === false) wrong++;
      });
      result.score = Math.round(score * 100) / 100;
      result.maxScore = max;
      result.correctCount = correct; result.wrongCount = wrong; result.unansweredCount = un;
      result.pendingAiCount = result.items.filter(function (i) { return i.score === null; }).length;
      result.aggregate = G.aggregate(questions, result.items);
      result.behavior = G.behaviorSignals(questions, result.items);
    }

    /* ── 学習分析 ───────────────────────────────────────────── */
    function runAnalysis() {
      if (st.aiBusy) return;
      st.aiBusy = true; st.analysisError = null; st.analysis = null;
      render();

      var wrongDetails = result.items.filter(function (i) { return i.correct === false || !i.answered; })
        .slice(0, 15).map(function (i) {
          var q = byId[i.questionId]; if (!q) return "";
          var correct = (q.choices || []).filter(function (c) { return c.isCorrect; }).map(function (c) { return c.text; }).join(" / ")
            || q.correctAnswer || "";
          return "- " + q.id + "「" + String(q.prompt).slice(0, 100) + "」正解: " + String(correct).slice(0, 80);
        }).filter(Boolean).join("\n");

      var agg = result.aggregate || G.aggregate(questions, result.items);
      AI.analyzeResult({
        payload: {
          title: result.presetName || "テスト",
          subject: preset ? (preset.subjectId || "") : "",
          totalScore: result.score, totalMax: result.maxScore,
          byCriterion: Object.keys(agg.byCriterion || {}).filter(function (k) { return agg.byCriterion[k].max > 0; })
            .map(function (k) { return { label: agg.byCriterion[k].label, score: agg.byCriterion[k].score, max: agg.byCriterion[k].max }; }),
          byTopic: Object.keys(agg.byTopic || {}).map(function (k) {
            return { topic: k, score: agg.byTopic[k].score, max: agg.byTopic[k].max, count: agg.byTopic[k].count };
          }),
          items: result.items.map(function (i) {
            var q = byId[i.questionId] || {};
            return {
              questionId: i.questionId, answered: i.answered, correct: i.correct,
              score: i.score, maxScore: i.maxScore, timeMs: i.timeMs,
              changeCount: i.changeCount, visitCount: i.visitCount,
              topic: q.topic, type: q.type, difficulty: q.difficulty
            };
          }),
          wrongDetails: wrongDetails,
          behavior: describeBehavior()
        },
        onActivity: function (items) { if (activity) activity.set(items); },
        onWarning: function (m) { app.toast(m, "warning", 6000); }
      }).then(function (res) {
        st.aiBusy = false;
        var data = res.structured && res.structured.data ? res.structured.data : null;
        if (!data) { st.analysisError = "分析結果を読み取れませんでした。"; render(); return; }
        st.analysis = data;
        result.analysis = data;
        ST.results.put(result, { baseRevision: result.revision });
        render();
      }).catch(function (e) {
        st.aiBusy = false;
        if (e && e.cancelled) { render(); return; }
        st.analysisError = e.userMessage || "分析に失敗しました。";
        render();
      });
    }
    function describeBehavior() {
      var b = result.behavior || {};
      var parts = [];
      if (b.medianTimeMs) parts.push("1問あたりの中央値 " + Math.round(b.medianTimeMs / 1000) + " 秒");
      if ((b.slowAndWrong || []).length) parts.push("時間をかけて誤答: " + b.slowAndWrong.map(function (x) { return x.questionId; }).join(", "));
      if ((b.fastAndWrong || []).length) parts.push("短時間で誤答: " + b.fastAndWrong.map(function (x) { return x.questionId; }).join(", "));
      if ((b.answerChanged || []).length) parts.push("回答を変更: " + b.answerChanged.length + " 問");
      if ((b.unanswered || []).length) parts.push("未回答: " + b.unanswered.length + " 問");
      return parts.join(" / ");
    }

    /* ══════════════════════════════════════════════════════════
       復習プリセット（§9）
       ══════════════════════════════════════════════════════════ */
    function openReviewPreset(initialScope) {
      var wrong = result.items.filter(function (i) { return i.correct === false; }).map(function (i) { return i.questionId; });
      var un = result.items.filter(function (i) { return !i.answered; }).map(function (i) { return i.questionId; });
      var fav = Object.keys(st.favorites).filter(function (k) { return st.favorites[k]; });
      var weakTopics = weakTopicList();

      app.confirm({
        title: "復習プリセットを作る", wide: true,
        html:
          '<div class="vq2-label" style="margin-bottom:8px">どの問題を入れますか</div>'
          + '<label class="vq2-check"><input type="checkbox" id="rpWrong"' + (initialScope !== "unanswered" ? " checked" : "") + '>'
          + "<span>間違えた問題（" + wrong.length + " 問）</span></label>"
          + '<label class="vq2-check"><input type="checkbox" id="rpUn"' + (initialScope === "unanswered" ? " checked" : "") + ">"
          + "<span>未回答の問題（" + un.length + " 問）</span></label>"
          + '<label class="vq2-check"><input type="checkbox" id="rpFav">'
          + "<span>お気に入りの問題（" + fav.length + " 問）</span></label>"
          + (weakTopics.length
              ? '<label class="vq2-check"><input type="checkbox" id="rpWeak">'
                + "<span>苦手な単元だけ（" + weakTopics.join("・") + "）</span></label>" : "")
          + '<div class="vq2-label" style="margin:14px 0 8px">作り方</div>'
          + '<label class="vq2-check"><input type="radio" name="rpMode" id="rpAsIs" checked>'
          + "<span>元の問題をそのまま使う</span></label>"
          + '<label class="vq2-check"><input type="radio" name="rpMode" id="rpShuffle">'
          + "<span>選択肢の順番だけ変える</span></label>"
          + '<label class="vq2-check"><input type="radio" name="rpMode" id="rpSimilar">'
          + "<span>AI で類題を追加する<br><span class=\"vq2-hint\">作った類題は保存前に確認できます。</span></span></label>"
          + '<label class="vq2-check"><input type="radio" name="rpMode" id="rpExplain">'
          + "<span>AI で解説を詳しくする<br><span class=\"vq2-hint\">こちらも保存前に確認できます。</span></span></label>",
        okLabel: "作成",
        collect: function (card) {
          return {
            wrong: card.querySelector("#rpWrong").checked,
            unanswered: card.querySelector("#rpUn").checked,
            favorites: card.querySelector("#rpFav").checked,
            weakOnly: card.querySelector("#rpWeak") ? card.querySelector("#rpWeak").checked : false,
            mode: card.querySelector("#rpSimilar").checked ? "similar"
                : card.querySelector("#rpExplain").checked ? "explain"
                : card.querySelector("#rpShuffle").checked ? "shuffle" : "asis"
          };
        }
      }).then(function (v) { if (v) buildReviewPreset(v, { wrong: wrong, unanswered: un, favorites: fav, weakTopics: weakTopics }); });
    }

    function weakTopicList() {
      var agg = result.aggregate || {};
      return Object.keys(agg.byTopic || {}).filter(function (k) {
        var t = agg.byTopic[k];
        return t.count >= 2 && t.rate !== null && t.rate < 0.6;
      }).slice(0, 5);
    }

    function buildReviewPreset(v, sets) {
      var ids = {};
      if (v.wrong) sets.wrong.forEach(function (id) { ids[id] = true; });
      if (v.unanswered) sets.unanswered.forEach(function (id) { ids[id] = true; });
      if (v.favorites) sets.favorites.forEach(function (id) { ids[id] = true; });
      var list = Object.keys(ids);
      if (v.weakOnly && sets.weakTopics.length) {
        list = list.filter(function (id) {
          var q = byId[id];
          return q && sets.weakTopics.indexOf(q.topic || "（未分類）") >= 0;
        });
      }
      if (!list.length) { app.toast("対象の問題がありません。", "warning"); return; }

      var picked = list.map(function (id) { return byId[id]; }).filter(Boolean).map(function (q) {
        var copy = JSON.parse(JSON.stringify(q));
        copy.id = S.newId("q");
        copy.createdAt = copy.updatedAt = S.nowIso();
        copy.createdBy = "review";
        if (v.mode === "shuffle" && (copy.choices || []).length) {
          copy.choices = copy.choices.slice().sort(function () { return Math.random() - 0.5; });
          copy.choices.forEach(function (c, i) { c.label = String.fromCharCode(65 + i); });
        }
        return copy;
      });

      var np = S.emptyPreset({
        name: (result.presetName || "テスト") + " の復習",
        description: "間違えた問題から作った復習用プリセットです（" + new Date().toLocaleDateString("ja-JP") + "）。",
        questions: picked,
        subjectId: preset ? preset.subjectId : "",
        subjects: preset ? preset.subjects : [],
        tags: preset ? preset.tags : []
      });

      if (v.mode === "similar" || v.mode === "explain") {
        /* AI に手を入れさせる場合は Studio を開いて Draft Review を通す */
        app.close("review-preset");
        VQ2.presetStudio.open({
          preset: np,
          onSaved: o.onReviewPresetCreated || null
        });
        setTimeout(function () {
          var studio = root.document.getElementById("vq2-preset-studio");
          if (studio && studio.__vq2) {
            studio.__vq2.toast(v.mode === "similar"
              ? "右の AI で「類題を追加する」と指示すると類題を作れます。"
              : "右の AI で「解説をやさしくする」と指示できます。", "info", 8000);
          }
        }, 400);
        return;
      }

      var r = ST.savePreset(np);
      if (!r.ok) {
        app.alert({ title: "作成できませんでした", body: r.message || "保存に失敗しました。" });
        return;
      }
      app.toast("復習プリセット「" + np.name + "」を作りました（" + picked.length + " 問）。", "success", 6000);
      if (o.onReviewPresetCreated) { try { o.onReviewPresetCreated(r.preset); } catch (e) {} }
    }

    /* ── 再挑戦 ─────────────────────────────────────────────── */
    function retry(scope) {
      var ids;
      if (scope === "wrong") ids = result.items.filter(function (i) { return i.correct === false; }).map(function (i) { return i.questionId; });
      else if (scope === "unanswered") ids = result.items.filter(function (i) { return !i.answered; }).map(function (i) { return i.questionId; });
      else if (scope === "flagged") ids = Object.keys(st.favorites).filter(function (k) { return st.favorites[k]; });
      else if (scope === "weak") {
        var w = weakTopicList();
        ids = questions.filter(function (q) { return w.indexOf(q.topic || "（未分類）") >= 0; }).map(function (q) { return q.id; });
      } else ids = questions.map(function (q) { return q.id; });

      if (!ids.length) { app.toast("対象の問題がありません。", "warning"); return; }
      var sub = S.emptyPreset({
        id: result.presetId,
        name: result.presetName,
        questions: questions.filter(function (q) { return ids.indexOf(q.id) >= 0; })
      });
      app.close("retry");
      VQ2.quizPlayer.open({ preset: sub, mode: "practice", resume: false });
    }

    /* ── Quick Chat へ質問 ─────────────────────────────────── */
    function askAbout(qid) {
      var q = byId[qid]; if (!q) return;
      var item = result.items.find(function (i) { return i.questionId === qid; });
      var correct = (q.choices || []).filter(function (c) { return c.isCorrect; }).map(function (c) { return c.text; }).join(" / ")
        || q.correctAnswer || "";
      var msg = [
        "次の問題について教えてください。",
        "",
        "【問題】" + q.prompt,
        (q.choices || []).length ? "【選択肢】" + q.choices.map(function (c, i) { return String.fromCharCode(65 + i) + ". " + c.text; }).join(" / ") : "",
        "【正解】" + correct,
        item && item.answered ? "【私の回答】" + describeAnswer(q, item) : "【私の回答】未回答",
        q.explanation ? "【解説】" + q.explanation : "",
        "",
        "なぜこの答えになるのか、私の間違いがどこにあったのかを教えてください。"
      ].filter(Boolean).join("\n");

      /* Quick Chat を壊さずに使う。開く手段が無ければ本文をコピーする。 */
      if (root.__vqChatOpenWith) { try { root.__vqChatOpenWith(msg); app.close("ask"); return; } catch (e) {} }
      copyText(msg).then(function (ok) {
        app.toast(ok ? "質問文をコピーしました。Quick Chat に貼り付けてください。" : "コピーできませんでした。", ok ? "success" : "error", 6000);
      });
    }
    function describeAnswer(q, item) {
      var d = item.detail || {};
      if (d.picked) {
        var ids = Array.isArray(d.picked) ? d.picked : [d.picked];
        return ids.map(function (id) {
          var c = (q.choices || []).find(function (x) { return x.id === id; });
          return c ? c.text : id;
        }).join(" / ");
      }
      if (d.normalized) return d.normalized;
      if (d.value !== undefined) return String(d.value);
      return "（記録なし）";
    }
    function copyText(t) {
      try {
        if (root.navigator && root.navigator.clipboard) return root.navigator.clipboard.writeText(t).then(function () { return true; }, function () { return false; });
      } catch (e) {}
      return Promise.resolve(false);
    }

    /* ══════════════════════════════════════════════════════════
       この端末の AI からの助言
       ・生成は **この Mac の中だけ**（Local AI Bridge 経由）。外へは出さない。
       ・渡すのは 数と単元名だけ。問題文・答案・資料は渡さない。
       ・作れなかったときは、作れなかったとそのまま出す（作り話をしない）。
       ══════════════════════════════════════════════════════════ */
    var advice = { state: "idle", text: "", why: "" };

    function adviceFacts() {
      var agg = result.aggregate || {};
      var items = result.items || [];
      var total = items.length;
      var right = items.filter(function (i) { return i.correct === true; }).length;
      var wrong = items.filter(function (i) { return i.answered && i.correct === false; }).length;
      var blank = items.filter(function (i) { return !i.answered; }).length;
      var partial = items.filter(function (i) { return i.partialCredit; }).length;
      var pending = items.filter(function (i) { return i.score === null; }).length;

      /* 集計の入れ物は count / correct を持つ（total ではない）。
         ここを取り違えると、弱いところが 1 件も挙がらない。 */
      function weakOf(map, label) {
        var out = [];
        Object.keys(map || {}).forEach(function (k) {
          var v = map[k] || {};
          var n = Number(v.count !== undefined ? v.count : v.total || 0);
          var c = Number(v.correct || 0);
          if (n < 2 || c / n >= 0.7) return;
          out.push({ key: k, label: label ? label(k) : k, n: n, c: c,
                     pct: Math.round((c / n) * 100) });
        });
        return out.sort(function (a, b) { return a.c / a.n - b.c / b.n; });
      }
      var byTopic = weakOf(agg.byTopic);
      var byType = weakOf(agg.byType, function (k) { return QT ? QT.label(k) : k; });

      var b = result.behavior || {};
      var ms = Number(result.elapsedMs || 0);
      var min = Math.round((ms / 60000) * 10) / 10;
      var perQ = total ? Math.round(ms / 1000 / total) : 0;

      return {
        total: total, right: right, wrong: wrong, blank: blank,
        partial: partial, pending: pending,
        acc: total ? Math.round((right / total) * 1000) / 10 : 0,
        minutes: min, perQ: perQ,
        weakTopics: byTopic.slice(0, 3),
        weakTypes: byType.slice(0, 2),
        slowWrong: (b.slowAndWrong || []).length,
        fastWrong: (b.fastAndWrong || []).length,
        changed: (b.answerChanged || []).length
      };
    }

    function factLines(f) {
      var L = [];
      L.push("・全 " + f.total + " 問中 " + f.right + " 問正解（正答率 " + f.acc + "%）"
        + (f.blank ? "／未回答 " + f.blank + " 問" : "")
        + (f.partial ? "／部分点 " + f.partial + " 問" : "")
        + (f.pending ? "／採点待ち " + f.pending + " 問" : ""));
      L.push("・かかった時間 " + f.minutes + " 分（1 問あたり " + f.perQ + " 秒）");
      if (f.weakTopics.length)
        L.push("・正答率が低い単元: " + f.weakTopics.map(function (w) {
          return w.label + " " + w.c + "/" + w.n + "（" + w.pct + "%）"; }).join("、"));
      if (f.weakTypes.length)
        L.push("・正答率が低い形式: " + f.weakTypes.map(function (w) {
          return w.label + " " + w.c + "/" + w.n + "（" + w.pct + "%）"; }).join("、"));
      if (f.slowWrong) L.push("・時間をかけたのに間違えた: " + f.slowWrong + " 問");
      if (f.fastWrong) L.push("・すぐに答えて間違えた: " + f.fastWrong + " 問");
      if (f.changed) L.push("・答えを書き直した: " + f.changed + " 問");
      return L;
    }

    function advicePrompt(f) {
      return [
        "あなたは日本の高校生を教える先生です。",
        "次の 1 回ぶんの結果だけを見て、明日やることを日本語で伝えてください。",
        "",
        "【結果】"
      ].concat(factLines(f)).concat([
        "",
        "【書き方】",
        "・2〜3 文。箇条書き・見出し・記号・区切り線は使わない。",
        "・いちばん弱いところを 1 つだけ名指しし、上の数字をそのまま引用する。",
        "・「明日、◯◯を △ 問だけ解き直す」のように、数の入った具体的な行動をひとつ書く。",
        "・上に書いていない数字を作らない。問題文や答えの中身は書かない。",
        "・自分の回答を点検した文、反省、注記、補足、見出しは書かない。助言の本文だけを返す。",
        "・励ましだけで終えない。"
      ]).join("\n");
    }

    /* ── AI の出力を、利用者に見せてよい形へそろえる ──────────────
       モデルは本文のあとに「---」を引いて、自分の答えを点検した文
       （確認できていない点／指示に違反している…）を書いてくることがある。
       それは AI が AI に向けて書いた文であって、学習の助言ではない。
       ここで確実に落とす。 */
    var META_HEAD = /^\s*(?:確認できていない点|確認できない点|未確認(?:の点)?|不足している点|改善(?:点|案)|自己(?:評価|点検|レビュー)|レビュー|検証|指摘|評価|判定|注意点|補足|備考|出力形式|形式(?:の)?(?:確認|チェック)|指示への準拠|コメント|meta|note|review)\s*[:：]?\s*$/i;
    var META_LINE = /(指定された形式|指示に(?:違反|従って|沿って)|上記の(?:助言|回答|文章)|この(?:助言|回答|文章|出力)は|形式に違反|条件を満たして(?:いない|います)|含まれていない。?$|違反している)/;

    function cleanAdvice(raw) {
      var t = String(raw || "").replace(/\r/g, "");
      t = t.replace(/```[\s\S]*?```/g, "");
      t = t.replace(/\*\*/g, "").replace(/^#{1,6}\s*/gm, "");
      /* 区切り線から下は捨てる */
      var cut = t.search(/^[ \t]*(?:-{3,}|_{3,}|={3,}|\*{3,})[ \t]*$/m);
      if (cut >= 0) t = t.slice(0, cut);
      var lines = t.split("\n");
      var out = [];
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (META_HEAD.test(line)) break;          /* ここから下は自己点検 */
        if (!line) { continue; }
        if (META_LINE.test(line)) continue;       /* 自分の出力について語る文 */
        line = line.replace(/^[-*・]\s*/, "");
        line = line.replace(/^(?:助言|アドバイス|回答|出力|本文)\s*[:：]\s*/, "");
        /* 「助言」だけの見出し行は本文ではない。 */
        if (/^(?:助言|アドバイス|回答|出力|本文|まとめ)$/.test(line)) continue;
        if (!line) continue;
        out.push(line);
      }
      var text = out.join("\n").trim();
      /* 3 文までにする。長い説教にしない。 */
      var parts = text.split(/(?<=。)/).filter(function (x) { return x.trim(); });
      if (parts.length > 3) text = parts.slice(0, 3).join("").trim();
      return text;
    }

    /* ── AI が使えないときの助言 ────────────────────────────────
       数字はこちらで持っているので、作り話をせずに具体的なことが言える。
       「AI が繋がっていません」だけで終わらせない。 */
    function computedAdvice(f) {
      var s2 = [];
      var w = f.weakTopics[0] || f.weakTypes[0] || null;
      if (w) {
        s2.push("「" + w.label + "」が " + w.c + "/" + w.n + "（" + w.pct + "%）で、いちばん取りこぼしています。");
        s2.push("明日はまず、この" + (f.weakTopics[0] ? "単元" : "形式")
          + "で間違えた " + (w.n - w.c) + " 問を、解説を読んでから解き直してください。");
      } else if (f.wrong) {
        s2.push("全 " + f.total + " 問中 " + f.right + " 問正解（正答率 " + f.acc + "%）でした。");
        s2.push("明日はまず、間違えた " + f.wrong + " 問だけを解き直してください。");
      } else if (f.total) {
        s2.push("全 " + f.total + " 問正解でした（" + f.minutes + " 分）。");
        s2.push("同じ範囲をもう一度解くより、次の単元へ進むか、問題数を増やしてみてください。");
      } else {
        return "";
      }
      if (f.blank) s2.push("未回答が " + f.blank + " 問あるので、次は分からなくても選んでから進みましょう。");
      else if (f.fastWrong >= 2) s2.push("すぐ答えて間違えたものが " + f.fastWrong + " 問あります。次は選択肢を最後まで読んでから決めてください。");
      else if (f.slowWrong >= 2) s2.push("時間をかけて間違えたものが " + f.slowWrong + " 問あります。悩んだら印を付けて先へ進み、あとで戻る方が取れます。");
      return s2.slice(0, 3).join("");
    }

    /* AI が使えないときは、こちらで数字から助言を作る。
       「作れませんでした」だけで終えない（結果は手元にある）。 */
    function fallbackAdvice(why) {
      var text = "";
      try { text = computedAdvice(adviceFacts()); } catch (e) { text = ""; }
      if (text) advice = { state: "ok", source: "local", text: text, why: why || "", pending: false };
      else advice = { state: "fail", source: "none", text: "", why: why || "", pending: false };
    }

    /* 生成する。取れなければ理由を持って false を返す。 */
    function runAdvice() {
      var L = root.__vqLocalAI;
      if (!L) { fallbackAdvice("この端末の AI に繋がっていません。"); return refreshAdvice(); }
      if (!L.isPaired || !L.isPaired()) {
        fallbackAdvice("この端末の AI がまだ繋がっていません。"); return refreshAdvice();
      }
      /* 待っているあいだも、数字から出した助言を先に見せる。
         白い枠で「考えています…」だけを見せられても、何もできない。 */
      var seed = "";
      try { seed = computedAdvice(adviceFacts()); } catch (e) { seed = ""; }
      advice = { state: seed ? "ok" : "run", source: seed ? "local" : "", text: seed, why: "", pending: true };
      refreshAdvice();

      var f = adviceFacts();
      var got = "";
      var done = false;
      /* 待ちすぎない。返らなければ「作れませんでした」を出す。 */
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        try { L.cancelGeneration(); } catch (e) {}
        fallbackAdvice("時間内に返ってきませんでした。");
        refreshAdvice();
      }, 25000);

      try {
        L.streamMessage({
          requestId: "adv-" + Date.now().toString(36),
          conversationId: "vq-quiz-advice",
          messageId: "m-" + Date.now().toString(36),
          message: advicePrompt(f),
          modelId: "standard",
          thinkingLevel: "low",
          options: { language: "ja", allowExternalKnowledge: true, requireCitations: false }
        }, function (ev, j) {
          if (ev === "token" && j && j.text) {
            got += j.text;
            /* 流れてくる途中も、自己点検の部分は出さない。 */
            if (!done) {
              var partial = cleanAdvice(got);
              /* 途中の切れた文で、先に出した助言を消さない。 */
              if (partial) { advice = { state: "ok", source: "ai", text: partial, why: "", pending: true }; refreshAdvice(); }
            }
          }
        }).then(function () {
          if (done) return;
          done = true; clearTimeout(timer);
          /* 見せてよい部分だけにする（区切り線から下の自己点検を落とす）。 */
          var t = cleanAdvice(got);
          if (t) advice = { state: "ok", source: "ai", text: t, why: "", pending: false };
          else fallbackAdvice("助言の本文を取り出せませんでした。");
          refreshAdvice();
        }, function (e) {
          if (done) return;
          done = true; clearTimeout(timer);
          fallbackAdvice((e && e.message) ? String(e.message) : "繋がりませんでした。");
          refreshAdvice();
        });
      } catch (e) {
        done = true; clearTimeout(timer);
        fallbackAdvice("呼び出せませんでした。");
        refreshAdvice();
      }
    }

    /* 設定（AI → 結果に助言を自動で出す）。設定層が無い端末では今までどおり作る。 */
    function adviceAuto() {
      try {
        var SET = (typeof root !== "undefined") && root.__vqSet;
        return !SET || SET.get("ai.advice") !== false;
      } catch (e) { return true; }
    }

    function refreshAdvice() {
      var box = app.root.querySelector("[data-advice]");
      if (!box) return;
      box.outerHTML = adviceHtml();
    }

    function adviceHtml() {
      var h = '<div class="vq2-card" data-advice style="border-color:var(--vq-accent)">';
      /* 出どころを正直に書く。AI が書いたのか、結果から計算したのかで見出しを変える。 */
      var fromLocal = advice.state === "ok" && advice.source === "local";
      h += '<div class="vq2-row" style="gap:8px;margin-bottom:10px">'
        + '<span class="vq2-badge is-accent">' + icon(fromLocal ? "chart" : "sparkle")
        + (fromLocal ? " 結果から出した助言" : " AI からの助言") + "</span>"
        + '<span class="vq2-muted" style="font-size:11.5px">'
        + (fromLocal ? "この結果の数字だけで作っています" : "この端末の中だけで作っています")
        + "</span></div>";
      if (advice.state === "run") {
        h += advice.text
          ? '<div style="line-height:1.95;white-space:pre-wrap">' + esc(advice.text) + "</div>"
          : '<div class="vq2-row" style="gap:9px"><span class="vq2-spin" style="width:16px;height:16px"></span>'
            + '<span class="vq2-muted">考えています…</span></div>';
      } else if (advice.state === "ok") {
        h += '<div style="line-height:1.95;white-space:pre-wrap">' + esc(advice.text) + "</div>";
        if (advice.pending)
          h += '<div class="vq2-row" style="gap:8px;margin-top:10px">'
            + '<span class="vq2-spin" style="width:14px;height:14px"></span>'
            + '<span class="vq2-muted" style="font-size:11.5px">AI でも考えています…</span></div>';
        if (fromLocal && advice.why)
          h += '<div class="vq2-hint" style="margin-top:8px">AI は使えませんでした（' + esc(advice.why) + "）。"
            + "数字から出しています。</div>"
            + '<div style="margin-top:8px">'
            + btn({ label: "AI でもう一度ためす", size: "sm", variant: "quiet", action: "advice-retry" }) + "</div>";
      } else if (advice.state === "fail") {
        h += '<div class="vq2-muted">生成できませんでした。'
          + (advice.why ? "（" + esc(advice.why) + "）" : "") + "</div>"
          + '<div style="margin-top:10px">'
          + btn({ label: "もう一度ためす", size: "sm", action: "advice-retry" }) + "</div>";
      } else if (adviceAuto()) {
        h += '<div class="vq2-muted">読み込んでいます…</div>';
      } else {
        /* 設定（AI → 結果に助言を自動で出す）を切っているとき。
           勝手には作らないが、押せば作れる。 */
        h += '<div class="vq2-muted">自動では作らない設定になっています。</div>'
          + '<div style="margin-top:10px">'
          + btn({ label: "いまつくる", size: "sm", action: "advice-retry" }) + "</div>";
      }
      return h + "</div>";
    }

    /* ══════════════════════════════════════════════════════════
       描画
       ══════════════════════════════════════════════════════════ */
    function render() {
      app.root.innerHTML = topHtml() + tabsHtml()
        + '<div class="vq2-body"><div class="vq2-pane vq2-pane-c"><div class="vq2-pane-b" id="rvBody">'
        + (st.tab === "summary" ? summaryHtml() : st.tab === "review" ? reviewHtml() : analysisHtml())
        + "</div></div></div>";
      wire();
    }

    function topHtml() {
      return '<div class="vq2-top">'
        + btn({ icon: "chevronL", iconOnly: true, variant: "quiet", action: "close", aria: "閉じる" })
        + '<div style="min-width:0">'
        + '<div class="vq2-top-title">' + esc(result.presetName || "結果") + "</div>"
        + '<div class="vq2-top-sub">' + esc(formatDate(result.finishedAt)) + (result.expired ? " ・時間切れ" : "") + "</div></div>"
        + '<div class="vq2-top-sp"></div>'
        + '<div class="vq2-top-actions">'
        + btn({ icon: "share", iconOnly: true, variant: "quiet", action: "share", aria: "共有", title: "FEED へ共有" })
        + btn({ icon: "print", iconOnly: true, variant: "quiet", action: "export", aria: "レポート", title: "レポートを出力" })
        + "</div></div>";
    }

    function tabsHtml() {
      var n = result.items.filter(function (i) { return i.correct === false || !i.answered; }).length;
      return '<div class="vq2-tabs" role="tablist" style="display:flex">'
        + tab("summary", "結果") + tab("review", "問題別", n) + tab("analysis", "分析")
        + "</div>";
      function tab(id, label, count) {
        return '<button type="button" class="vq2-tab" role="tab" data-rvtab="' + id + '"'
          + ' aria-selected="' + (st.tab === id ? "true" : "false") + '">' + esc(label)
          + (count ? '<span class="vq2-tab-n">' + count + "</span>" : "") + "</button>";
      }
    }

    /* ── 結果タブ ───────────────────────────────────────────── */
    function summaryHtml() {
      var rate = result.maxScore > 0 ? result.score / result.maxScore : 0;
      var prev = previous();
      var t = Math.floor((result.elapsedMs || 0) / 1000);

      var h = '<div class="vq2-q" style="gap:20px">';

      if (st.grading) {
        h += '<div class="vq2-card"><div class="vq2-row"><div class="vq2-spin"></div>'
          + "<span>記述問題を採点しています…</span></div>"
          + '<div id="actHost" style="margin-top:10px"></div></div>';
      }
      if (result.pendingAiCount) {
        h += '<div class="vq2-card">' + U.statusChip("pending", "未採点")
          + " 記述 " + result.pendingAiCount + " 問はまだ採点されていません。</div>";
      }

      h += '<div class="vq2-card">'
        + '<div class="vq2-score"><span class="vq2-score-v">' + fmtNum(result.score) + "</span>"
        + '<span class="vq2-score-m">/ ' + result.maxScore + " 点</span></div>"
        + '<div style="margin:12px 0">' + U.progressBar(result.score, result.maxScore, "得点") + "</div>"
        + '<div class="vq2-stats">'
        + stat("正答率", Math.round(rate * 100) + "%")
        + stat("正解", result.correctCount + " 問")
        + stat("不正解", result.wrongCount + " 問")
        + stat("未回答", result.unansweredCount + " 問")
        + stat("所要時間", Math.floor(t / 60) + "分" + (t % 60) + "秒")
        + "</div>";

      /* 前回比は履歴があるときだけ出す */
      if (prev && prev.maxScore > 0) {
        var prevRate = prev.score / prev.maxScore;
        var d = Math.round((rate - prevRate) * 100);
        h += '<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--vq-border-subtle)">'
          + '<div class="vq2-row"><span class="vq2-label">前回（' + esc(formatDate(prev.finishedAt)) + "）</span>"
          + "<span>" + Math.round(prevRate * 100) + "% → " + Math.round(rate * 100) + "%</span>"
          + (d === 0 ? U.badge("変化なし") : U.badge((d > 0 ? "+" : "") + d + " ポイント", d > 0 ? "success" : "warning"))
          + "</div></div>";
      } else {
        h += '<div class="vq2-hint" style="margin-top:12px">このプリセットの記録はこれが初回です。次回から前回比を表示します。</div>';
      }
      h += "</div>";

      /* 観点別（配点があるときだけ） */
      var agg = result.aggregate || {};
      var crit = Object.keys(agg.byCriterion || {}).filter(function (k) { return agg.byCriterion[k].max > 0; });
      if (crit.length) {
        h += '<div class="vq2-card"><div class="vq2-sec-t">観点別</div>'
          + crit.map(function (k) {
              var c = agg.byCriterion[k];
              return '<div style="margin-bottom:12px"><div class="vq2-row" style="justify-content:space-between">'
                + "<span>" + esc(c.label) + "</span>"
                + '<span class="vq2-mono">' + fmtNum(c.score) + " / " + c.max + " 点</span></div>"
                + U.progressBar(c.score, c.max, c.label) + "</div>";
            }).join("") + "</div>";
      }

      /* 操作 */
      h += '<div class="vq2-card"><div class="vq2-sec-t">次にすること</div>'
        + '<div style="display:flex;flex-direction:column;gap:8px">'
        + btn({ label: "間違えた問題だけ解き直す（" + result.wrongCount + " 問）", icon: "refresh",
                variant: "primary", full: true, action: "retry-wrong", disabled: !result.wrongCount })
        + (result.unansweredCount ? btn({ label: "未回答だけ解く（" + result.unansweredCount + " 問）", icon: "refresh", full: true, action: "retry-unanswered" }) : "")
        + (weakTopicList().length ? btn({ label: "苦手な単元だけ解く（" + weakTopicList().join("・") + "）", icon: "refresh", full: true, action: "retry-weak" }) : "")
        + btn({ label: "復習プリセットを作る", icon: "book", full: true, action: "make-review" })
        + btn({ label: "もう一度すべて解く", icon: "play", full: true, action: "retry-all" })
        + "</div></div>";

      h += "</div>";
      return h;
    }
    function stat(label, value) {
      return '<div class="vq2-stat"><div class="vq2-stat-l">' + esc(label) + '</div><div class="vq2-stat-v">' + esc(value) + "</div></div>";
    }
    function fmtNum(n) { return (Math.round((n || 0) * 10) / 10).toString(); }

    /* ── 問題別タブ ─────────────────────────────────────────── */
    function reviewHtml() {
      var items = result.items.filter(applyFilter);
      var h = '<div class="vq2-q" style="gap:14px">';
      h += '<div class="vq2-row" style="gap:6px">'
        + filterBtn("all", "すべて", result.items.length)
        + filterBtn("wrong", "不正解", result.items.filter(function (i) { return i.correct === false; }).length)
        + filterBtn("unanswered", "未回答", result.items.filter(function (i) { return !i.answered; }).length)
        + filterBtn("flagged", "お気に入り", Object.keys(st.favorites).filter(function (k) { return st.favorites[k]; }).length)
        + filterBtn("review", "要確認", result.items.filter(function (i) { return i.requiresReview; }).length)
        + "</div>";
      h += '<div class="vq2-row" style="gap:6px">'
        + btn({ label: "すべて開く", size: "sm", variant: "ghost", action: "expand-all" })
        + btn({ label: "すべて閉じる", size: "sm", variant: "ghost", action: "collapse-all" })
        + "</div>";

      if (!items.length) {
        h += U.empty({ icon: "check", title: "該当する問題はありません" }) + "</div>";
        return h;
      }

      items.forEach(function (item) {
        var q = byId[item.questionId];
        if (!q) return;
        var no = result.questionOrder.indexOf(item.questionId) + 1;
        var isOpen = !!st.openItems[item.questionId];
        h += '<div class="vq2-acc">'
          + '<button type="button" class="vq2-acc-h" data-toggle="' + esc(item.questionId) + '" aria-expanded="' + (isOpen ? "true" : "false") + '">'
          + (item.score === null ? U.statusChip("pending", "未採点")
             : item.correct === true ? U.statusChip("success", "正解")
             : !item.answered ? U.statusChip("warning", "未回答") : U.statusChip("error", "不正解"))
          + '<span class="vq2-acc-t">問 ' + no + "　" + esc(String(q.prompt).slice(0, 60)) + "</span>"
          + '<span class="vq2-mono vq2-muted">' + (item.score === null ? "－" : fmtNum(item.score)) + "/" + item.maxScore + "</span>"
          + icon(isOpen ? "chevronU" : "chevronD") + "</button>";
        if (isOpen) h += '<div class="vq2-acc-b">' + itemDetailHtml(q, item) + "</div>";
        h += "</div>";
      });
      h += "</div>";
      return h;
    }
    function filterBtn(id, label, n) {
      return btn({ label: label + "（" + n + "）", size: "sm", variant: st.filter === id ? "primary" : "ghost",
                   action: "filter", id: id });
    }
    function applyFilter(i) {
      if (st.filter === "wrong") return i.correct === false;
      if (st.filter === "unanswered") return !i.answered;
      if (st.filter === "flagged") return !!st.favorites[i.questionId];
      if (st.filter === "review") return !!i.requiresReview;
      return true;
    }

    /* 保存された答案から、その問題の答えの値を取り出す。 */
    function answerValueOf(item) {
      if (!item) return null;
      if (item.value !== undefined) return item.value;
      var sess = result.answers || (result.session && result.session.answers) || [];
      var rec = sess.filter(function (a) { return a && a.questionId === item.questionId; })[0];
      return rec ? rec.value : null;
    }

    function itemDetailHtml(q, item) {
      var view = null;
      try { view = QM ? QM.normalize(q) : q; } catch (e) { view = q; }
      var value = answerValueOf(item);
      var h = "";
      /* 問題文・資料・図表は出題のときと同じ組み立てで出す。 */
      try { h += QR.promptHtml(view, { readonly: true }); }
      catch (e) { h += '<div style="white-space:pre-wrap;line-height:1.85">' + esc(q.prompt) + "</div>"; }

      /* 自分の答えを、その形式のまま並べ直して見せる（§14）。
         並べ替えや位置選択は、文字にすると何を間違えたのか分からない。 */
      var replayed = false;
      try {
        h += '<div style="margin:12px 0">' + QR.reviewHtml(view, value, { readonly: true, locked: true }) + "</div>";
        replayed = true;
      } catch (e) { replayed = false; }

      if (!replayed) {
        h += '<div class="vq2-grid c2" style="margin-bottom:12px">'
          + '<div><div class="vq2-label">あなたの解答</div><div class="vq2-card" style="padding:10px;white-space:pre-wrap">'
          + esc(item.answered ? describeAnswer(q, item) : "（未回答）") + "</div></div>"
          + '<div><div class="vq2-label">正解</div><div class="vq2-card" style="padding:10px;white-space:pre-wrap">'
          + esc((QR ? QR.correctAnswerText(view) : "") || q.correctAnswer || (q.acceptedAnswers || []).join(" / ") || "（模範解答なし）")
          + "</div></div></div>";
      } else {
        h += '<div class="vq2-grid c2" style="margin-bottom:12px">'
          + '<div><div class="vq2-label">あなたの解答</div><div class="vq2-card" style="padding:10px;white-space:pre-wrap">'
          + esc(item.answered ? (QR.answerText(view, value) || describeAnswer(q, item)) : "（未回答）") + "</div></div>"
          + '<div><div class="vq2-label">正解</div><div class="vq2-card" style="padding:10px;white-space:pre-wrap">'
          + esc(QR.correctAnswerText(view) || "（模範解答なし）") + "</div></div></div>";
      }
      /* 部分点のとき、どこが合っていたのかを数字で出す。 */
      if (item.partialCredit || (item.detail && item.detail.partial)) {
        var d = item.detail || {};
        var got = d.hits !== undefined ? d.hits : (d.correctPositions !== undefined ? d.correctPositions : d.matched);
        if (got !== undefined && d.total !== undefined)
          h += '<div class="vq2-hint" style="margin-bottom:10px">' + d.total + " 件のうち " + got + " 件が合っていました。</div>";
      }
      if ((item.missedCriteria || []).length)
        h += '<div style="margin-bottom:10px"><div class="vq2-label">足りなかったところ</div><div>'
          + esc(item.missedCriteria.join("　")) + "</div></div>";

      /* AI 補助採点の根拠 */
      if (item.method === "ai-assisted") {
        h += '<div class="vq2-card" style="margin-bottom:12px">'
          + '<div class="vq2-row" style="justify-content:space-between;margin-bottom:8px">'
          + '<span class="vq2-label">採点の根拠</span>'
          + (item.requiresReview ? U.statusChip("warning", "確認をおすすめします") : U.statusChip("success", "確定")) + "</div>";
        (item.rubricBreakdown || []).forEach(function (b) {
          var r = ((q.scoringRubric && q.scoringRubric.items) || []).find(function (x) { return x.id === b.rubricItemId; });
          h += '<div style="margin-bottom:8px"><div class="vq2-row" style="justify-content:space-between">'
            + "<span>" + esc(r ? r.description : b.rubricItemId) + "</span>"
            + '<span class="vq2-mono">' + b.awarded + " / " + b.maxPoints + " 点</span></div>"
            + '<div class="vq2-muted">' + esc(b.reason || "") + "</div></div>";
        });
        if (item.scoringReason) h += '<div style="margin-top:6px">' + esc(item.scoringReason) + "</div>";
        if ((item.missingElements || []).length)
          h += '<div style="margin-top:8px"><div class="vq2-label">足りなかった要素</div><ul style="margin:4px 0 0 18px">'
            + item.missingElements.map(function (m) { return "<li>" + esc(m) + "</li>"; }).join("") + "</ul></div>";
        /* 機械で調べた「内容の照合」。点の付き方が納得できないときの手がかり。
           ここが無いと、長さで採点されたのか内容で採点されたのか分からない。 */
        var cc = item.contentCheck;
        if (cc && (cc.points || []).length) {
          h += '<div style="margin-top:10px"><div class="vq2-label">模範解答との照合（語句の一致だけを見た結果）</div>';
          cc.points.forEach(function (p2) {
            h += '<div class="vq2-row" style="gap:8px;align-items:flex-start;padding:3px 0">'
              + U.statusChip(p2.found ? "success" : "warning", p2.found ? "書けている" : "見つからない")
              + "<span>" + esc(String(p2.text).slice(0, 80)) + "</span></div>";
          });
          h += '<div class="vq2-hint" style="margin-top:4px">'
            + "言い換えていると「見つからない」と出ます。文字数（" + cc.length + " 文字）では採点していません。</div></div>";
        }
        if ((item.adjustments || []).length)
          h += '<div class="vq2-hint" style="margin-top:8px">' + item.adjustments.map(esc).join(" / ") + "</div>";
        h += '<div style="margin-top:10px">' + btn({ label: "得点を直す", size: "sm", action: "override", id: q.id }) + "</div>";
        if (item.history && item.history.length)
          h += '<div class="vq2-hint" style="margin-top:6px">' + item.history.length + " 回修正されています（最終 "
            + fmtNum(item.history[item.history.length - 1].to) + " 点）。</div>";
        h += "</div>";
      }

      if (q.explanation)
        h += '<div class="vq2-card" style="margin-bottom:12px"><div class="vq2-label">解説</div>'
          + '<div style="white-space:pre-wrap;line-height:1.85;margin-top:4px">' + esc(q.explanation) + "</div></div>";

      if ((q.sourceReferences || []).length)
        h += '<div style="margin-bottom:12px">' + q.sourceReferences.map(function (s) {
          return '<div class="vq2-src" style="margin-bottom:4px">' + icon("doc")
            + '<span class="vq2-src-n">' + esc(s.sourceName) + (s.page ? "（p." + s.page + "）" : "") + "</span></div>";
        }).join("") + "</div>";

      h += '<div class="vq2-row" style="gap:8px;margin-bottom:10px">'
        + U.badge(TYPE_LABEL[q.type] || q.type)
        + U.badge(DIFF_LABEL[q.difficulty] || "標準")
        + (q.topic ? U.badge(q.topic) : "")
        + (item.timeMs ? U.badge(Math.round(item.timeMs / 1000) + " 秒") : "")
        + (item.changeCount ? U.badge("回答変更 " + item.changeCount + " 回") : "")
        + "</div>";

      h += '<div class="vq2-row" style="gap:8px">'
        + btn({ label: st.favorites[q.id] ? "お気に入り解除" : "お気に入り", icon: "star", size: "sm",
                variant: st.favorites[q.id] ? "primary" : "ghost", action: "fav", id: q.id })
        + btn({ label: "AI に質問", icon: "sparkle", size: "sm", action: "ask", id: q.id })
        + btn({ label: "この問題を解き直す", icon: "refresh", size: "sm", action: "retry-one", id: q.id })
        + "</div>";
      return h;
    }
    function isPicked(item, cid) {
      var d = item.detail || {};
      if (Array.isArray(d.picked)) return d.picked.indexOf(cid) >= 0;
      if (d.picked) return String(d.picked) === String(cid);
      return false;
    }

    /* ── 分析タブ ───────────────────────────────────────────── */
    function analysisHtml() {
      var agg = result.aggregate || {};
      var b = result.behavior || {};
      var h = '<div class="vq2-q" style="gap:16px">';

      h += adviceHtml();

      h += breakdown("難易度別", agg.byDifficulty, function (k) { return DIFF_LABEL[k] || k; });
      h += breakdown("単元別", agg.byTopic, function (k) { return k; });
      h += breakdown("形式別", agg.byType, function (k) { return QT ? QT.label(k) : (TYPE_LABEL[k] || k); });
      if (agg.byEngine) h += breakdown("答え方別", agg.byEngine, function (k) {
        var e = QT && QT.engine(k); return e ? e.label : k;
      });
      if (agg.byGroup && Object.keys(agg.byGroup).length)
        h += breakdown("大問別", agg.byGroup, function (k) {
          var g = (result.groupsSnapshot || []).filter(function (x) { return x.id === k; })[0];
          return g ? (g.instruction || g.prompt || k).slice(0, 30) : k;
        });
      /* 自信度と正答率のずれ。当てずっぽうで合っていた分が見える。 */
      if (agg.confidence && agg.confidence.count) {
        var cf = agg.confidence.buckets;
        h += '<div class="vq2-card"><div class="vq2-sec-t">自信度と正答率</div>'
          + '<div class="vq2-hint" style="margin-bottom:10px">自信があったのに間違えたところが、いちばん伸びます。</div>';
        [1, 2, 3, 4, 5].forEach(function (n) {
          var b2 = cf[String(n)];
          if (!b2 || !b2.count) return;
          h += '<div class="vq2-row" style="justify-content:space-between;padding:4px 0">'
            + "<span>自信 " + n + "（" + b2.count + " 問）</span>"
            + '<span class="vq2-mono">' + Math.round((b2.accuracy || 0) * 100) + " %</span></div>";
        });
        h += "</div>";
      }
      /* どこから直すか。数字の低い順に出す。 */
      if ((result.weakSpots || []).length) {
        h += '<div class="vq2-card"><div class="vq2-sec-t">まずここから直すとよさそうです</div>';
        result.weakSpots.slice(0, 6).forEach(function (w) {
          var axis = w.axis === "byTopic" ? "単元" : w.axis === "byType" ? "形式" : "難易度";
          h += '<div class="vq2-row" style="justify-content:space-between;padding:5px 0">'
            + "<span>" + esc(axis + "：" + w.label) + "</span>"
            + '<span class="vq2-mono">' + Math.round(w.rate * 100) + " %（" + w.count + " 問）</span></div>";
        });
        h += "</div>";
      }

      /* 行動の観測（参考） */
      h += '<div class="vq2-card"><div class="vq2-sec-t">解答中の様子</div>'
        + '<div class="vq2-hint" style="margin-bottom:10px">' + esc(b.note || "") + "</div>"
        + '<div class="vq2-stats">'
        + stat("1問あたり", b.medianTimeMs ? Math.round(b.medianTimeMs / 1000) + " 秒" : "－")
        + stat("時間をかけて誤答", (b.slowAndWrong || []).length + " 問")
        + stat("短時間で誤答", (b.fastAndWrong || []).length + " 問")
        + stat("回答を変更", (b.answerChanged || []).length + " 問")
        + "</div>";
      if ((b.slowAndWrong || []).length || (b.fastAndWrong || []).length) {
        h += '<div style="margin-top:12px">'
          + (b.slowAndWrong || []).map(function (x) { return questionChip(x.questionId, "時間をかけたが誤答"); }).join("")
          + (b.fastAndWrong || []).map(function (x) { return questionChip(x.questionId, "短時間で誤答"); }).join("")
          + "</div>";
      }
      h += "</div>";

      /* AI 分析 */
      h += '<div class="vq2-card"><div class="vq2-row" style="justify-content:space-between;margin-bottom:10px">'
        + '<span class="vq2-sec-t" style="margin:0">AI による分析</span>'
        + (st.analysis || st.aiBusy ? "" : btn({ label: "分析する", icon: "sparkle", size: "sm", variant: "primary", action: "analyze" }))
        + "</div>";
      if (st.aiBusy) {
        h += '<div class="vq2-row"><div class="vq2-spin"></div><span>答案を分析しています…</span></div>'
          + '<div id="actHost" style="margin-top:10px"></div>';
      } else if (st.analysisError) {
        h += U.statusChip("error", "失敗") + " " + esc(st.analysisError)
          + '<div style="margin-top:8px">' + btn({ label: "もう一度", size: "sm", action: "analyze" }) + "</div>";
      } else if (st.analysis) {
        h += analysisBody(st.analysis);
      } else if (result.analysis) {
        h += analysisBody(result.analysis);
      } else {
        h += '<div class="vq2-muted">答案から、次に何をすればよいかを分析します。</div>';
      }
      h += "</div></div>";
      return h;
    }

    function analysisBody(d) {
      var h = "";
      if (d.insufficientData) h += '<div style="margin-bottom:10px">' + U.statusChip("info", "参考") + " 判断の材料が少ないため、以下は参考としてお読みください。</div>";
      if (d.summary) h += '<div style="line-height:1.85;margin-bottom:14px">' + esc(d.summary) + "</div>";
      if ((d.strengths || []).length) {
        h += '<div class="vq2-label">できていたところ</div><div style="margin:6px 0 14px">'
          + d.strengths.map(function (s) {
              return '<div style="margin-bottom:8px"><strong>' + esc(s.topic) + "</strong><br>"
                + '<span class="vq2-muted">' + esc(s.evidence) + "</span>"
                + (s.questionIds || []).map(function (q) { return questionChip(q, ""); }).join("") + "</div>";
            }).join("") + "</div>";
      }
      if ((d.weaknesses || []).length) {
        h += '<div class="vq2-label">次に手を入れるところ</div><div style="margin:6px 0 14px">'
          + d.weaknesses.map(function (w) {
              var hedge = w.likelihood === "observed" ? "" : (w.likelihood === "likely" ? "可能性が高い" : "可能性あり");
              return '<div style="margin-bottom:8px"><strong>' + esc(w.topic) + "</strong>"
                + (hedge ? " " + U.badge(hedge, "warning") : "") + "<br>"
                + '<span class="vq2-muted">' + esc(w.evidence) + "</span>"
                + (w.questionIds || []).map(function (q) { return questionChip(q, ""); }).join("") + "</div>";
            }).join("") + "</div>";
      }
      if (d.timeManagement && d.timeManagement.comment)
        h += '<div class="vq2-label">時間の使い方</div><div style="margin:6px 0 14px">' + esc(d.timeManagement.comment) + "</div>";
      if ((d.nextActions || []).length) {
        h += '<div class="vq2-label">やること</div><ol style="margin:6px 0 0 20px;line-height:2">'
          + d.nextActions.map(function (a) { return "<li>" + esc(a.action) + "</li>"; }).join("") + "</ol>";
      }
      return h;
    }

    function questionChip(qid, label) {
      /* 問題番号が分からない印は出さない。ここで落ちると分析タブ全体が消える。 */
      if (!qid || !Array.isArray(result.questionOrder)) return "";
      var no = result.questionOrder.indexOf(qid) + 1;
      if (no <= 0) return "";
      return '<button type="button" class="vq2-badge" data-goto="' + esc(qid) + '" style="cursor:pointer;margin:2px 4px 2px 0">'
        + "問 " + no + (label ? "：" + esc(label) : "") + "</button>";
    }

    function breakdown(title, map, labelFn) {
      var keys = Object.keys(map || {});
      if (!keys.length) return "";
      return '<div class="vq2-card"><div class="vq2-sec-t">' + esc(title) + "</div>"
        + '<div class="vq2-tblwrap"><table class="vq2-tbl"><thead><tr>'
        + "<th>区分</th><th class=\"num\">問題数</th><th class=\"num\">得点</th><th class=\"num\">正答率</th></tr></thead><tbody>"
        + keys.map(function (k) {
            var v = map[k];
            return "<tr><td>" + esc(labelFn(k)) + '</td><td class="num">' + v.count + "</td>"
              + '<td class="num">' + fmtNum(v.score) + " / " + v.max + "</td>"
              + '<td class="num">' + (v.accuracy === null ? "－" : Math.round(v.accuracy * 100) + "%") + "</td></tr>";
          }).join("")
        + "</tbody></table></div></div>";
    }

    function formatDate(iso) {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return "";
      return d.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
    }

    /* ── 結線 ───────────────────────────────────────────────── */
    /* 委ねる形の結線（app.root への U.on）は **1 回だけ**。
       U.on は外す仕組みを持たないので、描き直すたびに張ると聞き手が増え続ける。
       app.root 自体は描き直しても入れ替わらないから、1 回で以降の中身にも効く。 */
    function wire() {
      var r = app.root;
      var host = r.querySelector("#actHost");
      if (host) activity = new U.ActivityPanel(host, { onCancel: function () { AI.cancel(); } });
      /* 印は app.root へ（関数内 var は巻き上げで消えることがある） */
      if (r.__rvWired) return;
      r.__rvWired = true;

      U.on(r, "click", '[data-act="close"]', function () { app.close("user"); });
      U.on(r, "click", "[data-rvtab]", function (e, t) { st.tab = t.getAttribute("data-rvtab"); render(); });
      U.on(r, "click", '[data-act="act-toggle"]', function () { if (activity) activity.toggle(); });
      U.on(r, "click", '[data-act="act-cancel"]', function () { AI.cancel(); });

      U.on(r, "click", '[data-act="retry-wrong"]', function () { retry("wrong"); });
      U.on(r, "click", '[data-act="retry-unanswered"]', function () { retry("unanswered"); });
      U.on(r, "click", '[data-act="retry-weak"]', function () { retry("weak"); });
      U.on(r, "click", '[data-act="retry-all"]', function () { retry("all"); });
      U.on(r, "click", '[data-act="make-review"]', function () { openReviewPreset(); });
      U.on(r, "click", '[data-act="analyze"]', function () { runAnalysis(); });

      U.on(r, "click", '[data-act="filter"]', function (e, t) { st.filter = t.getAttribute("data-id"); render(); });
      U.on(r, "click", '[data-act="expand-all"]', function () {
        result.items.forEach(function (i) { st.openItems[i.questionId] = true; }); render();
      });
      U.on(r, "click", '[data-act="collapse-all"]', function () { st.openItems = {}; render(); });
      U.on(r, "click", "[data-toggle]", function (e, t) {
        var id = t.getAttribute("data-toggle");
        st.openItems[id] = !st.openItems[id];
        render();
      });
      U.on(r, "click", "[data-goto]", function (e, t) {
        st.tab = "review"; st.filter = "all";
        st.openItems[t.getAttribute("data-goto")] = true;
        render();
        setTimeout(function () {
          var n = app.root.querySelector('[data-toggle="' + t.getAttribute("data-goto").replace(/["\\]/g, "\\$&") + '"]');
          if (n && n.scrollIntoView) n.scrollIntoView({ block: "center", behavior: U.reducedMotion() ? "auto" : "smooth" });
        }, 30);
      });
      U.on(r, "click", '[data-act="fav"]', function (e, t) {
        var id = t.getAttribute("data-id");
        st.favorites[id] = !st.favorites[id];
        saveFavorites(); render();
      });
      U.on(r, "click", '[data-act="ask"]', function (e, t) { askAbout(t.getAttribute("data-id")); });
      U.on(r, "click", '[data-act="retry-one"]', function (e, t) {
        var q = byId[t.getAttribute("data-id")];
        if (!q) return;
        app.close("retry");
        VQ2.quizPlayer.open({ preset: S.emptyPreset({ id: result.presetId, name: result.presetName, questions: [q] }),
                              mode: "practice", resume: false });
      });
      U.on(r, "click", '[data-act="override"]', function (e, t) { openOverride(t.getAttribute("data-id")); });
      U.on(r, "click", '[data-act="share"]', function () {
        if (VQ2.feedShare) VQ2.feedShare.open({ result: result, questions: questions, app: app });
        else app.toast("共有機能が読み込まれていません。", "warning");
      });
      U.on(r, "click", '[data-act="export"]', function () { exportReport(); });
      U.on(r, "click", '[data-act="advice-retry"]', function () { runAdvice(); });
      /* 分析を開いたときに 1 回だけ作る（開かない人の端末を働かせない）。
         設定で自動生成を切っているときは、押されるまで作らない。 */
      if (st.tab === "analysis" && advice.state === "idle" && adviceAuto()) runAdvice();
    }

    function openOverride(qid) {
      var item = result.items.find(function (i) { return i.questionId === qid; });
      if (!item) return;
      app.confirm({
        title: "得点を直す",
        html: field({ label: "得点（0〜" + item.maxScore + "）", id: "ovScore", type: "number",
                      value: item.score, min: 0, max: item.maxScore, step: 1 })
          + field({ label: "理由", id: "ovReason", type: "textarea", rows: 2,
                    hint: "なぜ変更したかを残します。記録は消えません。" }),
        okLabel: "適用",
        collect: function (card) {
          return { score: Number(card.querySelector("#ovScore").value), reason: card.querySelector("#ovReason").value };
        }
      }).then(function (v) {
        if (!v) return;
        G.overrideScore(item, v.score, v.reason, "user");
        recompute();
        var r = ST.results.put(result, { baseRevision: result.revision });
        if (r.ok) result = r.record;
        render();
        app.toast("得点を修正しました。", "success");
      });
    }

    /* ── レポート出力（印刷用 HTML。組み込みレンダラを使う） ── */
    function exportReport() {
      if (!VQ2.pdfRenderer) { app.toast("レポート機能が読み込まれていません。", "warning"); return; }
      VQ2.pdfRenderer.printResultReport({ result: result, questions: questions, preset: preset });
    }

    return app;
  }

  VQ2.resultView = { open: open };
})(typeof globalThis !== "undefined" ? globalThis : this);
