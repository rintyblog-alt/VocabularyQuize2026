/* ══════════════════════════════════════════════════════════════════════
   Quick Mock Digital Exam Workspace（§23 / §24 / §25 / §26 / §27）
   ・左：問題冊子（組み込みレンダラの出力）／右：MockSpec から作った解答用紙。
   ・左右は answerBindingId で結ぶ。問題を選べば回答欄へ、回答欄を選べば紙面へ。
   ・Mobile は「問題／解答」のタブ。切り替えても現在問題・ページ・回答を保つ。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var U = VQ2.ui, S = VQ2.schema, ST = VQ2.store, G = VQ2.grading,
      L = VQ2.layout, R = VQ2.pdfRenderer, AI = VQ2.ai;
  var esc = U.esc, icon = U.icon, btn = U.button;
  var doc = root.document;

  var SAVE_MS = 700;

  function open(o) {
    o = o || {};
    var spec = o.spec || (o.mockId ? (ST.mocks.get(o.mockId) || {}).spec : null);
    if (!spec) return null;
    var plan = o.plan || L.buildPlan(spec);
    var manifest = o.manifest || spec.layoutManifest || L.buildManifest(spec, plan, null);

    var app = U.mount("vq2-exam-workspace", {
      title: spec.title,
      onEscape: function () { requestExit(); return false; },
      onClose: o.onClose,
      onResize: function () { render(); }
    });

    var questions = [];
    spec.sections.forEach(function (sec) { sec.questions.forEach(function (q) { questions.push(q); }); });
    var byBinding = {};
    questions.forEach(function (q) { byBinding[q.answerBindingId] = q; });

    var session = null, saveTimer = null, tick = null, submitting = false;
    var enteredAt = 0;
    var st = {
      currentQid: questions.length ? questions[0].id : null,
      page: 1,
      zoom: 1,
      mobileTab: "paper",     /* paper | answers */
      paused: false,
      finished: false,
      grading: false,
      search: "",
      scrollTop: 0
    };
    var activity = null;

    start();

    function start() {
      var resumable = ST.mockSessions.list().filter(function (s) {
        return s.mockId === spec.id && ["in_progress", "paused", "ready", "preparing"].indexOf(s.state) >= 0;
      }).sort(function (a, b) { return (b.updatedAt || "").localeCompare(a.updatedAt || ""); })[0];

      if (resumable) {
        render();
        app.confirm({
          title: "前回の続きから始めますか",
          body: "中断した受験があります（" + (resumable.answers || []).filter(function (a) { return !G.isUnanswered(a.value); }).length
              + " / " + questions.length + " 問回答済み）。",
          okLabel: "続きから", cancelLabel: "最初から"
        }).then(function (yes) {
          if (yes) { session = resumable; resumeSession(); }
          else { ST.mockSessions.remove(resumable.id); newSession(); }
        });
        return;
      }
      newSession();
    }

    function newSession() {
      session = {
        id: S.newId("msess"),
        mockId: spec.id, mockTitle: spec.title,
        state: "created",
        answers: [], flagged: {},
        startedAt: null, elapsedMs: 0,
        durationSec: (spec.durationMinutes || 50) * 60,
        stateHistory: []
      };
      S.transition("mock", session, "preparing");
      S.transition("mock", session, "ready");
      S.transition("mock", session, "in_progress");
      session.startedAt = S.nowIso();
      afterStart();
    }
    function resumeSession() {
      if (session.state === "paused") st.paused = true;
      else if (["ready", "preparing"].indexOf(session.state) >= 0) {
        try { S.transition("mock", session, session.state === "preparing" ? "ready" : "in_progress"); } catch (e) {}
        if (session.state === "ready") S.transition("mock", session, "in_progress");
      }
      var next = questions.find(function (q) {
        var a = answerFor(q.id); return !a || G.isUnanswered(a.value);
      });
      if (next) st.currentQid = next.id;
      afterStart();
    }
    function afterStart() {
      persist();
      startTimer();
      enteredAt = Date.now();
      render();
      syncPaperToQuestion(st.currentQid, true);
    }

    function startTimer() {
      clearInterval(tick);
      tick = setInterval(function () {
        if (st.paused || st.finished) return;
        session.elapsedMs += 1000;
        if (session.durationSec && session.elapsedMs >= session.durationSec * 1000) {
          clearInterval(tick);
          try { S.transition("mock", session, "expired"); } catch (e) {}
          app.toast("試験時間が終了しました。採点します。", "warning", 6000);
          submit(true);
          return;
        }
        renderHeader();
      }, 1000);
    }

    function persist() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function () { ST.mockSessions.put(session); }, SAVE_MS);
    }
    function persistNow() { clearTimeout(saveTimer); ST.mockSessions.put(session); }

    function answerFor(qid) { return session.answers.find(function (a) { return a.questionId === qid; }); }
    function setAnswer(qid, value) {
      var a = answerFor(qid);
      if (!a) { a = { questionId: qid, value: null, timeMs: 0, changeCount: 0, visitCount: 1, flagged: false }; session.answers.push(a); }
      var had = !G.isUnanswered(a.value);
      if (had && JSON.stringify(a.value) !== JSON.stringify(value)) a.changeCount++;
      a.value = value;
      a.updatedAt = S.nowIso();
      persist();
      renderProgress();
    }
    function accumulateTime() {
      if (!st.currentQid || !enteredAt) return;
      var a = answerFor(st.currentQid);
      if (!a) { a = { questionId: st.currentQid, value: null, timeMs: 0, changeCount: 0, visitCount: 1, flagged: false }; session.answers.push(a); }
      a.timeMs = (a.timeMs || 0) + (Date.now() - enteredAt);
      enteredAt = Date.now();
    }

    /* ── 左右の同期（answerBindingId） ─────────────────────── */
    function selectQuestion(qid, fromPaper) {
      accumulateTime();
      st.currentQid = qid;
      var a = answerFor(qid);
      if (a) a.visitCount = (a.visitCount || 0) + 1;
      enteredAt = Date.now();
      persist();
      highlightAnswerRow(qid);
      if (!fromPaper) syncPaperToQuestion(qid, false);
      renderProgress();
    }

    function syncPaperToQuestion(qid, initial) {
      var page = L.pageOf(manifest, qid);
      if (page && page !== st.page) { st.page = page; }
      var iframe = app.root.querySelector("#examPaper iframe");
      if (!iframe) return;
      var d = iframe.contentDocument;
      if (!d) return;
      /* 現在の設問を紙面上で強調し、そこへスクロールする */
      Array.prototype.forEach.call(d.querySelectorAll(".vq2-hl"), function (n) { n.classList.remove("vq2-hl"); });
      var el = d.querySelector('[data-question="' + cssEsc(qid) + '"]');
      if (el) {
        el.classList.add("vq2-hl");
        if (!initial && el.scrollIntoView)
          el.scrollIntoView({ block: "center", behavior: U.reducedMotion() ? "auto" : "smooth" });
      }
      renderPaperBar();
    }
    function highlightAnswerRow(qid) {
      var rows = app.root.querySelectorAll("[data-arow]");
      Array.prototype.forEach.call(rows, function (n) {
        n.classList.toggle("is-current", n.getAttribute("data-arow") === qid);
      });
      var cur = app.root.querySelector('[data-arow="' + cssEsc(qid) + '"]');
      if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: "nearest", behavior: U.reducedMotion() ? "auto" : "smooth" });
    }
    function cssEsc(s) { return String(s).replace(/["\\]/g, "\\$&"); }

    /* ── 提出・採点 ───────────────────────────────────────── */
    function requestSubmit() {
      var un = questions.filter(function (q) {
        var a = answerFor(q.id); return !a || G.isUnanswered(a.value);
      });
      var flagged = Object.keys(session.flagged).filter(function (k) { return session.flagged[k]; });
      var body = [];
      if (un.length) body.push("未回答が " + un.length + " 問あります。");
      if (flagged.length) body.push("「後で確認」が " + flagged.length + " 問あります。");
      body.push("提出すると解答を変更できません。");
      app.confirm({
        title: "提出しますか", body: body.join("\n"),
        okLabel: "提出する", cancelLabel: "戻る"
      }).then(function (yes) { if (yes) submit(false); });
    }

    function submit(expired) {
      if (submitting) return;
      submitting = true;
      accumulateTime();
      clearInterval(tick);
      st.finished = true;

      try { if (session.state !== "submitting") S.transition("mock", session, "submitting"); }
      catch (e) { submitting = false; app.toast("この状態からは提出できません。", "error"); return; }
      persistNow();
      render();

      /* 1) 決定論的採点 */
      S.transition("mock", session, "deterministic_grading");
      var graded = G.gradeSession(questions, session.answers);
      var result = buildResult(graded, expired);

      if (!graded.pendingAi.length) {
        finishGrading(result, graded);
        return;
      }

      /* 2) AI 補助採点（記述） */
      S.transition("mock", session, "ai_grading");
      st.grading = true;
      render();

      var targets = graded.pendingAi.map(function (p) {
        var q = p.question;
        return {
          questionId: q.id,
          question: q.prompt,
          modelAnswer: q.correctAnswer || (q.acceptedAnswers || [])[0] || "",
          answer: (p.answer && p.answer.text !== undefined) ? p.answer.text : String(p.answer || ""),
          points: q.points, subject: spec.subject, grade: spec.grade,
          constraints: q.expectedChars ? "想定字数 約 " + q.expectedChars + " 字" : "",
          rubric: ((q.scoringRubric && q.scoringRubric.items) || []).map(function (r) {
            return { id: r.id, description: r.description, points: r.points,
                     criterionLabel: r.criterionId ? S.criterionLabel(r.criterionId) : "" };
          }),
          sourceText: (q.sourceReferences || []).map(function (s) { return s.excerpt || ""; }).filter(Boolean).join("\n").slice(0, 2000)
        };
      });

      AI.gradeAnswers({
        targets: targets,
        onActivity: function (items) { if (activity) activity.set(items); },
        onWarning: function (m) { app.toast(m, "warning", 6000); }
      }).then(function (res) {
        st.grading = false;
        var data = res.structured && res.structured.data ? res.structured.data : null;
        if (data && data.grades) {
          data.grades.forEach(function (g) {
            if (!g.ok || !g.grade) return;
            var q = questions.find(function (x) { return x.id === g.questionId; });
            var item = result.items.find(function (i) { return i.questionId === g.questionId; });
            if (!q || !item) return;
            Object.assign(item, G.applyAiGrade(item, q, g.grade));
            item.answered = true;
          });
        } else {
          app.toast("記述の採点を完了できませんでした。あとから採点し直せます。", "warning", 7000);
        }
        recompute(result);
        finishGrading(result, graded);
      }).catch(function (e) {
        st.grading = false;
        if (!(e && e.cancelled)) app.toast(e.userMessage || "記述の採点に失敗しました。", "error", 7000);
        finishGrading(result, graded);
      });
    }

    function buildResult(graded, expired) {
      var agg = G.aggregate(questions, graded.items);
      return {
        id: S.newId("result"),
        kind: "mock",
        sessionId: session.id,
        mockId: spec.id,
        presetId: spec.id,
        presetName: spec.title,
        subject: spec.subject,
        finishedAt: S.nowIso(),
        expired: !!expired,
        elapsedMs: session.elapsedMs,
        durationMinutes: spec.durationMinutes,
        questionOrder: questions.map(function (q) { return q.id; }),
        items: graded.items,
        pendingAiCount: graded.pendingCount,
        score: graded.deterministicScore,
        maxScore: graded.totalMax,
        correctCount: graded.correctCount,
        wrongCount: graded.wrongCount,
        unansweredCount: graded.unansweredCount,
        aggregate: agg,
        behavior: G.behaviorSignals(questions, graded.items),
        sectionScores: sectionScores(graded.items),
        questionsSnapshot: questions.map(snapshot)
      };
    }
    function sectionScores(items) {
      var byId = {}; items.forEach(function (i) { byId[i.questionId] = i; });
      return spec.sections.map(function (sec) {
        var score = 0, max = 0;
        sec.questions.forEach(function (q) {
          var it = byId[q.id];
          max += q.points;
          if (it && typeof it.score === "number") score += it.score;
        });
        return { sectionId: sec.id, number: sec.number, title: sec.title,
                 score: Math.round(score * 10) / 10, max: max };
      });
    }
    function snapshot(q) {
      return {
        id: q.id, type: q.type, prompt: q.prompt, number: q.number, sectionId: q.sectionId,
        choices: (q.choices || []).map(function (c) { return { id: c.id, label: c.label, text: c.text, explanation: c.explanation, isCorrect: c.isCorrect }; }),
        correctAnswer: q.correctAnswer, acceptedAnswers: q.acceptedAnswers,
        explanation: q.explanation, difficulty: q.difficulty, topic: q.topic,
        points: q.points, sourceReferences: q.sourceReferences || [],
        scoringRubric: q.scoringRubric || null, criterionAllocation: q.criterionAllocation || null
      };
    }
    function recompute(result) {
      var score = 0;
      result.items.forEach(function (i) { if (typeof i.score === "number") score += i.score; });
      result.score = Math.round(score * 10) / 10;
      result.pendingAiCount = result.items.filter(function (i) { return i.score === null; }).length;
      result.aggregate = G.aggregate(questions, result.items);
      result.sectionScores = sectionScores(result.items);
    }

    function finishGrading(result, graded) {
      try { S.transition("mock", session, "reviewing"); } catch (e) {}
      var saved = ST.results.put(result);
      try { S.transition("mock", session, "completed"); } catch (e) {}
      persistNow();
      submitting = false;
      var rec = saved.ok ? saved.record : result;
      app.close("submitted");
      if (VQ2.resultView) VQ2.resultView.open({ result: rec, pendingAi: [] });
    }

    function requestExit() {
      if (st.finished) { app.close("done"); return; }
      var answered = session.answers.filter(function (a) { return !G.isUnanswered(a.value); }).length;
      app.confirm({
        title: "受験を中断しますか",
        body: answered ? "ここまでの解答は保存され、次回続きから再開できます。" : "まだ解答がありません。",
        okLabel: "中断する", cancelLabel: "続ける"
      }).then(function (yes) {
        if (!yes) return;
        try { if (["in_progress", "paused"].indexOf(session.state) >= 0) S.transition("mock", session, "abandoned"); } catch (e) {}
        clearInterval(tick);
        persistNow();
        app.close("exit");
      });
    }
    function togglePause() {
      st.paused = !st.paused;
      try { S.transition("mock", session, st.paused ? "paused" : "in_progress"); } catch (e) {}
      if (st.paused) accumulateTime(); else enteredAt = Date.now();
      persistNow();
      render();
    }

    /* ══════════════════════════════════════════════════════════
       描画
       ══════════════════════════════════════════════════════════ */
    function render() {
      if (!session) { app.root.innerHTML = U.skeleton(4); return; }
      var mobile = app.isMobile();
      app.root.innerHTML = headerHtml()
        + (mobile ? mobileTabsHtml() : "")
        + (st.finished || submitting ? gradingHtml() : bodyHtml(mobile));
      wire();
      if (!st.finished && !submitting) mountPaper();
    }
    /* 見出しは .vq2-head ごと差し替える。中の .vq2-top だけを差し替えると、
       headerHtml() が返す進捗バーが呼ぶたびに 1 本ずつ増える。 */
    function renderHeader() {
      var h = app.root.querySelector(".vq2-head");
      if (h) { h.outerHTML = headerHtml(); wireHeader(); }
    }
    function renderProgress() {
      var p = app.root.querySelector("#examProg");
      if (p) p.outerHTML = progressHtml();
      var n = app.root.querySelector("#curQ");
      if (n) n.textContent = currentLabel();
    }
    function renderPaperBar() {
      var b = app.root.querySelector("#paperBar");
      if (b) { b.outerHTML = paperBarHtml(); wirePaper(); }
    }

    function headerHtml() {
      var t = Math.floor(session.elapsedMs / 1000);
      var remain = Math.max(0, (session.durationSec || 0) - t);
      var label = session.durationSec
        ? "残り " + pad(Math.floor(remain / 60)) + ":" + pad(remain % 60)
        : pad(Math.floor(t / 60)) + ":" + pad(t % 60);
      return '<div class="vq2-head">'
        + '<div class="vq2-top">'
        + '<div style="min-width:0"><div class="vq2-top-title">' + esc(spec.title) + "</div>"
        + '<div class="vq2-top-sub" id="curQ">' + esc(currentLabel()) + "</div></div>"
        + '<div class="vq2-top-sp"></div>'
        + '<span class="vq2-badge' + (remain > 0 && remain < 300 ? " is-danger" : "") + '">' + icon("clock")
        + '<span class="vq2-mono" style="margin-left:4px">' + label + "</span></span>"
        + '<div class="vq2-top-actions">'
        + btn({ icon: st.paused ? "play" : "pause", iconOnly: true, variant: "quiet", action: "pause",
                aria: st.paused ? "再開" : "一時停止" })
        + btn({ label: "提出", icon: "check", variant: "primary", action: "submit", aria: "提出する", title: "提出する" })
        + btn({ icon: "close", iconOnly: true, variant: "quiet", action: "exit", aria: "中断" })
        + "</div></div>"
        + progressHtml()
        + "</div>";
    }
    function progressHtml() {
      var answered = session.answers.filter(function (a) { return !G.isUnanswered(a.value); }).length;
      return '<div id="examProg" style="padding:0 16px 10px;background:var(--vq-bg-elevated);border-bottom:1px solid var(--vq-border-subtle)">'
        + '<div class="vq2-row" style="justify-content:space-between;padding:4px 0">'
        + '<span class="vq2-muted">' + answered + " / " + questions.length + " 問</span>"
        + '<span class="vq2-muted">' + Math.round((answered / Math.max(1, questions.length)) * 100) + "%</span></div>"
        + U.progressBar(answered, questions.length, "解答の進み") + "</div>";
    }
    function currentLabel() {
      var q = questions.find(function (x) { return x.id === st.currentQid; });
      if (!q) return "";
      var sec = spec.sections.find(function (s) { return s.id === q.sectionId; });
      return (sec ? "大問" + sec.number + "　" : "") + "問" + q.number;
    }
    function pad(n) { return ("0" + n).slice(-2); }

    function mobileTabsHtml() {
      return '<div class="vq2-tabs" role="tablist" style="display:flex">'
        + '<button type="button" class="vq2-tab" role="tab" data-etab="paper" aria-selected="' + (st.mobileTab === "paper" ? "true" : "false") + '">問題用紙</button>'
        + '<button type="button" class="vq2-tab" role="tab" data-etab="answers" aria-selected="' + (st.mobileTab === "answers" ? "true" : "false") + '">解答用紙</button>'
        + "</div>";
    }

    function bodyHtml(mobile) {
      if (st.paused) {
        return '<div class="vq2-body"><div class="vq2-pane vq2-pane-c"><div class="vq2-pane-b">'
          + U.empty({ icon: "pause", title: "一時停止中", body: "時間は止まっています。問題は表示していません。",
                      action: { label: "再開する", icon: "play", variant: "primary", action: "pause" } })
          + "</div></div></div>";
      }
      return '<div class="vq2-body">'
        + '<div class="vq2-pane vq2-pane-c" id="paperPane"' + (mobile && st.mobileTab !== "paper" ? " hidden" : "") + ' style="background:#eceaf3">'
        + paperBarHtml()
        + '<div id="examPaper" style="flex:1 1 auto;min-height:0;overflow:hidden"></div>'
        + "</div>"
        + (mobile ? "" : '<div class="vq2-resizer" id="rzE"></div>')
        + '<div class="vq2-pane vq2-pane-r" id="answerPane"' + (mobile && st.mobileTab !== "answers" ? " hidden" : "") + ' style="width:420px">'
        + answerSheetHtml() + "</div></div>";
    }

    function paperBarHtml() {
      var pageCount = (manifest.pages || []).length || 1;
      return '<div class="vq2-pane-h" id="paperBar" style="background:var(--vq-bg-elevated)">'
        + btn({ icon: "chevronL", iconOnly: true, size: "sm", variant: "quiet", action: "page-prev", disabled: st.page <= 1, aria: "前のページ" })
        + '<span class="vq2-mono">' + st.page + " / " + pageCount + "</span>"
        + btn({ icon: "chevronR", iconOnly: true, size: "sm", variant: "quiet", action: "page-next", disabled: st.page >= pageCount, aria: "次のページ" })
        + '<div class="vq2-top-sp"></div>'
        + btn({ label: "－", size: "sm", variant: "quiet", action: "zoom-out", aria: "縮小" })
        + '<span class="vq2-mono">' + Math.round(st.zoom * 100) + "%</span>"
        + btn({ label: "＋", size: "sm", variant: "quiet", action: "zoom-in", aria: "拡大" })
        + btn({ icon: "eye", iconOnly: true, size: "sm", variant: "quiet", action: "fullscreen", aria: "全画面", title: "全画面" })
        + "</div>";
    }

    /* ── 解答用紙（インタラクティブ） ─────────────────────── */
    function answerSheetHtml() {
      var h = '<div class="vq2-pane-h">解答用紙<div class="vq2-top-sp"></div>'
        + '<span class="vq2-muted">' + questions.filter(function (q) {
            var a = answerFor(q.id); return a && !G.isUnanswered(a.value);
          }).length + " / " + questions.length + "</span></div>";
      h += '<div class="vq2-pane-b" style="padding:10px">';

      spec.sections.forEach(function (sec) {
        h += '<div class="vq2-label" style="margin:12px 4px 6px">大問' + sec.number + "　" + esc(sec.title)
          + '<span style="float:right">' + sec.points + " 点</span></div>";
        sec.questions.forEach(function (q) {
          var a = answerFor(q.id);
          var answered = a && !G.isUnanswered(a.value);
          var flagged = !!session.flagged[q.id];
          var isCur = st.currentQid === q.id;
          h += '<div class="vq2-card" data-arow="' + esc(q.id) + '"'
            + ' style="padding:10px;margin-bottom:8px;' + (isCur ? "border-color:var(--vq-accent);background:var(--vq-surface-selected)" : "") + '">'
            + '<div class="vq2-row" style="justify-content:space-between;margin-bottom:6px">'
            + '<button type="button" class="vq2-badge" data-jumpq="' + esc(q.id) + '" style="cursor:pointer">'
            + "問" + q.number + "</button>"
            + '<span class="vq2-row" style="gap:4px">'
            + (answered ? U.statusChip("success", "回答済み") : U.statusChip("pending", "未回答"))
            + U.badge(q.points + " 点")
            + btn({ icon: "flag", iconOnly: true, size: "sm", variant: flagged ? "primary" : "quiet",
                    action: "flag", id: q.id, aria: "後で確認", pressed: flagged })
            + "</span></div>"
            + answerInputHtml(q, a ? a.value : null)
            + "</div>";
        });
      });
      h += "</div>";
      h += '<div class="vq2-pane-f"><div class="vq2-row" style="gap:8px">'
        + btn({ label: "未回答へ", size: "sm", action: "goto-unanswered" })
        + btn({ label: "後で確認へ", size: "sm", action: "goto-flagged" })
        + '<div class="vq2-top-sp"></div>'
        + btn({ label: "提出", variant: "primary", size: "sm", action: "submit" })
        + "</div></div>";
      return h;
    }

    /* 選ぶものが 1 つも無いときの受け皿。
       選択問題なのに選択肢が空だと、ここが空文字を返して
       「解答欄の無い問題」になっていた（実際に受験中に出た）。
       作れないなら黙って空にせず、文字で書ける欄と、その理由を必ず出す。 */
    function fallbackInputHtml(q, value, why) {
      return '<div class="vq2-note is-warn" style="margin-bottom:6px">' + U.statusChip("warning", "選択肢なし")
        + " " + esc(why) + "</div>"
        + '<input type="text" class="vq2-input" data-text="' + esc(q.id) + '"'
        + ' value="' + esc(textOf(value)) + '" placeholder="解答を入力します">';
    }
    function usableChoices(q) {
      return (q.choices || []).filter(function (c) { return String(c && c.text || "").trim(); });
    }

    function answerInputHtml(q, value) {
      var t = q.type;
      if (t === "multiple_choice_single" || t === "true_false") {
        if (usableChoices(q).length < 2)
          return fallbackInputHtml(q, value, "この問題は選択肢が用意されていません。文字で解答してください。");
        var picked = value && (value.choiceId || (Array.isArray(value) ? value[0] : value));
        return '<div class="vq2-row" style="gap:6px;flex-wrap:wrap">' + (q.choices || []).map(function (c, i) {
          var sel = String(picked) === String(c.id);
          return '<button type="button" class="vq2-btn sz-sm' + (sel ? " is-primary" : "") + '"'
            + ' data-pick="' + esc(q.id) + '|' + esc(c.id) + '" role="radio" aria-checked="' + (sel ? "true" : "false") + '"'
            + ' title="' + esc(c.text) + '" style="min-width:40px">' + L.circled(i + 1) + "</button>";
        }).join("") + "</div>";
      }
      if (t === "multiple_choice_multiple") {
        if (usableChoices(q).length < 2)
          return fallbackInputHtml(q, value, "この問題は選択肢が用意されていません。文字で解答してください。");
        var picks = Array.isArray(value) ? value.map(String) : [];
        return '<div class="vq2-row" style="gap:6px;flex-wrap:wrap">' + (q.choices || []).map(function (c, i) {
          var sel = picks.indexOf(String(c.id)) >= 0;
          return '<button type="button" class="vq2-btn sz-sm' + (sel ? " is-primary" : "") + '"'
            + ' data-pickm="' + esc(q.id) + '|' + esc(c.id) + '" aria-pressed="' + (sel ? "true" : "false") + '"'
            + ' title="' + esc(c.text) + '" style="min-width:40px">' + L.circled(i + 1) + "</button>";
        }).join("") + '</div><div class="vq2-hint">当てはまるものをすべて選びます。</div>';
      }
      if (t === "fill_blank") {
        var vals = Array.isArray(value) ? value : [];
        var b = (spec.answerBindings || []).find(function (x) { return x.id === q.answerBindingId; });
        var n = (b && b.blankCount) || (q.blanks || []).length || 1;
        var out = '<div style="display:flex;flex-direction:column;gap:6px">';
        for (var i = 0; i < n; i++) {
          out += '<div class="vq2-field is-inline"><span class="vq2-label" style="min-width:56px">空欄' + (i + 1) + "</span>"
            + '<input type="text" class="vq2-input" data-blank="' + esc(q.id) + "|" + i + '" value="' + esc(vals[i] || "") + '"></div>';
        }
        return out + "</div>";
      }
      if (t === "ordering") {
        var seq = Array.isArray(value) ? value : [];
        return '<div class="vq2-hint">正しい順に番号を入れます。</div>'
          + '<input type="text" class="vq2-input" data-order="' + esc(q.id) + '" value="' + esc(seq.join(",")) + '" placeholder="例: 3,1,4,2">';
      }
      if (t === "matching") {
        var pairs = (value && typeof value === "object" && !Array.isArray(value)) ? value : {};
        var lefts = Object.keys(q.correctAnswer || {});
        if (!lefts.length) return '<input type="text" class="vq2-input" data-text="' + esc(q.id) + '" value="' + esc(textOf(value)) + '">';
        return lefts.map(function (k) {
          return '<div class="vq2-field is-inline" style="margin-bottom:4px"><span class="vq2-label" style="min-width:56px">' + esc(k) + "</span>"
            + '<input type="text" class="vq2-input" data-pair="' + esc(q.id) + "|" + esc(k) + '" value="' + esc(pairs[k] || "") + '"></div>';
        }).join("");
      }
      if (t === "long_answer" || t === "essay" || t === "english_writing" || t === "source_analysis") {
        var txt = textOf(value);
        var limit = q.expectedChars || 0;
        return '<textarea class="vq2-input" data-text="' + esc(q.id) + '" rows="' + (t === "essay" || t === "english_writing" ? 7 : 4) + '"'
          + ' placeholder="解答を入力します">' + esc(txt) + "</textarea>"
          + '<div class="vq2-hint"><span data-count="' + esc(q.id) + '">' + txt.length + "</span> 文字"
          + (limit ? "（目安 " + limit + " 字）" : "") + "</div>";
      }
      if (t === "formula") {
        return '<input type="text" class="vq2-input" data-text="' + esc(q.id) + '" value="' + esc(textOf(value)) + '" placeholder="例: 2x+1">'
          + '<div class="vq2-hint">記号は半角で入力します（+ − × ÷ / ^）。</div>';
      }
      /* short_answer / numeric */
      return '<input type="' + (t === "numeric" ? "text" : "text") + '" class="vq2-input" data-text="' + esc(q.id) + '"'
        + ' inputmode="' + (t === "numeric" ? "decimal" : "text") + '" value="' + esc(textOf(value)) + '" placeholder="解答を入力します">';
    }
    function textOf(v) {
      if (v == null) return "";
      if (typeof v === "string") return v;
      if (typeof v === "number") return String(v);
      if (v.text !== undefined) return String(v.text);
      return "";
    }

    function gradingHtml() {
      return '<div class="vq2-body"><div class="vq2-pane vq2-pane-c"><div class="vq2-pane-b">'
        + '<div class="vq2-q"><div class="vq2-card">'
        + '<div class="vq2-row"><div class="vq2-spin" style="width:22px;height:22px"></div>'
        + "<span>" + (st.grading ? "記述問題を採点しています…" : "採点しています…") + "</span></div>"
        + '<div id="actHost" style="margin-top:12px"></div></div></div>'
        + "</div></div></div>";
    }

    /* ── 紙面の描画 ───────────────────────────────────────── */
    function mountPaper() {
      var host = app.root.querySelector("#examPaper");
      if (!host) return;
      var iframe = doc.createElement("iframe");
      iframe.setAttribute("title", "問題冊子");
      iframe.style.cssText = "width:100%;height:100%;border:0;background:#eceaf3";
      host.innerHTML = "";
      host.appendChild(iframe);

      var html = R.buildHtml(spec, plan, { bookletId: "question-booklet" });
      /* 受験中の強調表示と、設問クリックの受け口を足す */
      html = html.replace("</head>",
        "<style>.vq2-hl{outline:2px solid #756DB3;outline-offset:3px;border-radius:3px}"
        + "[data-question]{cursor:pointer}[data-question]:hover{background:#F4F2FB}"
        + "body{zoom:" + st.zoom + "}</style></head>");
      html = html.replace("</body>",
        "<script>document.addEventListener('click',function(e){var t=e.target.closest('[data-question]');"
        + "if(t)parent.postMessage({vq2:'pick',qid:t.getAttribute('data-question')},'*');});<\/script></body>");

      R.renderToIframe(iframe, html).then(function () {
        syncPaperToQuestion(st.currentQid, true);
      });
    }

    root.addEventListener("message", onMessage);
    function onMessage(e) {
      if (!e.data || e.data.vq2 !== "pick") return;
      if (st.finished) return;
      selectQuestion(e.data.qid, true);
      if (app.isMobile()) { st.mobileTab = "answers"; render(); }
    }

    /* ── 結線 ─────────────────────────────────────────────── */
    /* 委ねる形の結線（app.root への U.on）は **1 回だけ**。
       U.on は外す仕組みを持たない。描き直すたびに張ると聞き手が増え続け、
       押したときに同じ処理が何度も走る。 */
    function wire() {
      /* 印は app.root へ（関数内 var は巻き上げで消えることがある） */
      if (!app.root.__ewWired) { app.root.__ewWired = true; wireHeader(); wirePaper(); wireAnswers(); }
      var host = app.root.querySelector("#actHost");
      if (host) {
        activity = new U.ActivityPanel(host, { onCancel: function () { AI.cancel(); } });
        activity.startedAt = Date.now(); activity.render();
      }
      var pane = app.root.querySelector("#answerPane"), rz = app.root.querySelector("#rzE");
      if (pane && rz && !app.isMobile()) U.makeResizer(rz, pane, { min: 300, max: 720, invert: true });
    }

    function wireHeader() {
      var r = app.root;
      U.on(r, "click", '[data-act="exit"]', function () { requestExit(); });
      U.on(r, "click", '[data-act="pause"]', function () { togglePause(); });
      U.on(r, "click", '[data-act="submit"]', function () { requestSubmit(); });
      U.on(r, "click", "[data-etab]", function (e, t) {
        st.mobileTab = t.getAttribute("data-etab");
        render();
      });
      U.on(r, "click", '[data-act="act-toggle"]', function () { if (activity) activity.toggle(); });
    }

    function wirePaper() {
      var r = app.root;
      U.on(r, "click", '[data-act="page-prev"]', function () { gotoPage(st.page - 1); });
      U.on(r, "click", '[data-act="page-next"]', function () { gotoPage(st.page + 1); });
      U.on(r, "click", '[data-act="zoom-in"]', function () { setZoom(st.zoom + 0.1); });
      U.on(r, "click", '[data-act="zoom-out"]', function () { setZoom(st.zoom - 0.1); });
      U.on(r, "click", '[data-act="fullscreen"]', function () {
        var p = r.querySelector("#paperPane");
        if (!p) return;
        if (p.requestFullscreen) p.requestFullscreen().catch(function () {});
      });
    }
    function gotoPage(n) {
      var pageCount = (manifest.pages || []).length || 1;
      n = Math.max(1, Math.min(pageCount, n));
      if (n === st.page) return;
      st.page = n;
      var iframe = app.root.querySelector("#examPaper iframe");
      var d = iframe && iframe.contentDocument;
      if (d) {
        var pages = d.querySelectorAll(".page");
        if (pages[n - 1] && pages[n - 1].scrollIntoView)
          pages[n - 1].scrollIntoView({ block: "start", behavior: U.reducedMotion() ? "auto" : "smooth" });
      }
      renderPaperBar();
    }
    function setZoom(z) {
      st.zoom = Math.max(0.6, Math.min(2, Math.round(z * 10) / 10));
      var iframe = app.root.querySelector("#examPaper iframe");
      var d = iframe && iframe.contentDocument;
      if (d && d.body) d.body.style.zoom = st.zoom;
      renderPaperBar();
    }

    function wireAnswers() {
      var r = app.root;
      U.on(r, "click", "[data-jumpq]", function (e, t) {
        selectQuestion(t.getAttribute("data-jumpq"), false);
        if (app.isMobile()) { st.mobileTab = "paper"; render(); setTimeout(function () { syncPaperToQuestion(st.currentQid, false); }, 80); }
      });
      U.on(r, "click", "[data-arow]", function (e, t) {
        if (e.target.closest("button") || e.target.closest("input") || e.target.closest("textarea")) return;
        selectQuestion(t.getAttribute("data-arow"), false);
      });
      U.on(r, "click", "[data-pick]", function (e, t) {
        var p = t.getAttribute("data-pick").split("|");
        setAnswer(p[0], { choiceId: p[1] });
        selectQuestion(p[0], false);
        refreshRow(p[0]);
      });
      U.on(r, "click", "[data-pickm]", function (e, t) {
        var p = t.getAttribute("data-pickm").split("|");
        var a = answerFor(p[0]);
        var cur = a && Array.isArray(a.value) ? a.value.slice() : [];
        var i = cur.indexOf(p[1]);
        if (i >= 0) cur.splice(i, 1); else cur.push(p[1]);
        setAnswer(p[0], cur);
        refreshRow(p[0]);
      });
      U.on(r, "input", "[data-text]", function (e, t) {
        var qid = t.getAttribute("data-text");
        setAnswer(qid, { text: t.value });
        var c = r.querySelector('[data-count="' + cssEsc(qid) + '"]');
        if (c) c.textContent = String(t.value.length);
      });
      U.on(r, "focus", "[data-text]", function (e, t) { selectQuestion(t.getAttribute("data-text"), false); });
      U.on(r, "input", "[data-blank]", function (e, t) {
        var p = t.getAttribute("data-blank").split("|");
        var a = answerFor(p[0]);
        var vals = a && Array.isArray(a.value) ? a.value.slice() : [];
        vals[parseInt(p[1], 10)] = t.value;
        setAnswer(p[0], vals);
      });
      U.on(r, "input", "[data-order]", function (e, t) {
        setAnswer(t.getAttribute("data-order"), t.value.split(/[,\s、]+/).filter(Boolean));
      });
      U.on(r, "input", "[data-pair]", function (e, t) {
        var p = t.getAttribute("data-pair").split("|");
        var a = answerFor(p[0]);
        var o = (a && a.value && typeof a.value === "object" && !Array.isArray(a.value)) ? Object.assign({}, a.value) : {};
        o[p[1]] = t.value;
        setAnswer(p[0], o);
      });
      U.on(r, "click", '[data-act="flag"]', function (e, t) {
        var id = t.getAttribute("data-id");
        session.flagged[id] = !session.flagged[id];
        persist();
        refreshRow(id);
      });
      U.on(r, "click", '[data-act="goto-unanswered"]', function () {
        var q = questions.find(function (x) { var a = answerFor(x.id); return !a || G.isUnanswered(a.value); });
        if (q) { selectQuestion(q.id, false); if (app.isMobile()) { st.mobileTab = "answers"; render(); } }
        else app.toast("未回答はありません。", "success");
      });
      U.on(r, "click", '[data-act="goto-flagged"]', function () {
        var id = Object.keys(session.flagged).find(function (k) { return session.flagged[k]; });
        if (id) selectQuestion(id, false);
        else app.toast("「後で確認」はありません。", "info");
      });
    }

    /* 1 行だけ描き直す（全体を再描画すると入力中のカーソルが飛ぶ） */
    function refreshRow(qid) {
      var row = app.root.querySelector('[data-arow="' + cssEsc(qid) + '"]');
      if (!row) { render(); return; }
      var q = questions.find(function (x) { return x.id === qid; });
      if (!q) return;
      var a = answerFor(qid);
      var answered = a && !G.isUnanswered(a.value);
      var flagged = !!session.flagged[qid];
      row.innerHTML = '<div class="vq2-row" style="justify-content:space-between;margin-bottom:6px">'
        + '<button type="button" class="vq2-badge" data-jumpq="' + esc(qid) + '" style="cursor:pointer">問' + q.number + "</button>"
        + '<span class="vq2-row" style="gap:4px">'
        + (answered ? U.statusChip("success", "回答済み") : U.statusChip("pending", "未回答"))
        + U.badge(q.points + " 点")
        + btn({ icon: "flag", iconOnly: true, size: "sm", variant: flagged ? "primary" : "quiet",
                action: "flag", id: qid, aria: "後で確認", pressed: flagged })
        + "</span></div>" + answerInputHtml(q, a ? a.value : null);
      renderProgress();
    }

    return app;
  }

  VQ2.examWorkspace = { open: open };
})(typeof globalThis !== "undefined" ? globalThis : this);
