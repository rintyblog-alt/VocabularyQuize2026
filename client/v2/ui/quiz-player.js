/* ══════════════════════════════════════════════════════════════════════
   Quiz Player V2（§8）
   ・集中モード。サイドバーを出さず、終了は右上のボタン＋確認だけ。
   ・回答は都度保存する。リロード・ブラウザ終了からも再開できる。
   ・客観問題は決定論的コードで採点する。記述だけを AI 補助採点へ回す。
   ・状態遷移は schema.js の表に従う。不正な遷移は例外にする。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var U = VQ2.ui, S = VQ2.schema, ST = VQ2.store, G = VQ2.grading;
  /* V3: 形式レジストリ・共通モデル・表示・採点。ここから先は形式で分岐しない。 */
  var QT = VQ2.qtypes, QM = VQ2.qmodel, R = VQ2.qrender, EV = VQ2.evaluator;
  /* 学習プレイヤーの共通の枠と設定。VocabuSpeak と同じものを使う。 */
  var PS = VQ2.playerShell, PP = VQ2.playerPrefs;
  var esc = U.esc, icon = U.icon, btn = U.button;

  var SAVE_MS = 800;

  function open(o) {
    o = o || {};
    var preset = o.preset || (o.presetId ? ST.getPreset(o.presetId) : null);
    if (!preset) { root.alert && root.alert("プリセットが見つかりません。"); return null; }
    /* 保存されている形をそのまま使わず、必ず共通モデルへそろえてから出題する。
       古いプリセットも、新しい形式のプリセットも、ここから先は同じ形になる。
       元のレコードは書き換えない（写しを使う）。 */
    preset = JSON.parse(JSON.stringify(preset));
    preset.questions = (preset.questions || []).map(function (q) {
      try { return QM.normalize(q); } catch (e) { return q; }
    });

    /* 出題の直前に、解ける状態かを確かめる（§13）。
       編集中は「まだ書いていない」を止めないので、止めるのはここ。
       未完成の問題は黙って出さず、外して理由を伝える。 */
    var skipped = [];
    (function gate() {
      var V = VQ2.validate;
      if (!V) return;
      var issues = [];
      try { issues = V.validatePresetForSave(preset, { requireAnswerable: true, requireRubric: true }); }
      catch (e) { return; }
      var bad = Object.create(null);
      issues.filter(function (i) { return i.severity === "error"; }).forEach(function (i) {
        var m = /^questions\[(\d+)\]/.exec(String(i.path || ""));
        if (!m) return;
        var q = preset.questions[Number(m[1])];
        if (!q) return;
        if (!bad[q.id]) bad[q.id] = { id: q.id, type: q.type, reasons: [] };
        if (bad[q.id].reasons.length < 2) bad[q.id].reasons.push(i.message);
      });
      var ids = Object.keys(bad);
      if (!ids.length) return;
      skipped = ids.map(function (k) { return bad[k]; });
      preset.questions = preset.questions.filter(function (q) { return !bad[q.id]; });
    })();

    if (!preset.questions.length) {
      var msg = skipped.length
        ? "この中の " + skipped.length + " 問は、まだ書きかけです（"
          + skipped[0].reasons[0] + "）。編集して仕上げてから解いてください。"
        : "解ける問題がありません。";
      if (root.alert) root.alert(msg);
      return null;
    }

    var app = U.mount("vq2-quiz-player", {
      title: "クイズ",
      onEscape: function () { requestExit(); return false; },
      onBeforeClose: function () { return true; },
      onClose: o.onClose,
      onResize: function () { render(); }
    });

    /* ── セッション ───────────────────────────────────────── */
    var session = null;
    var saveTimer = null;
    var tick = null;
    var questionEnteredAt = 0;
    var submitting = false;      /* 二重送信防止 */
    var keyBound = false;        /* キーボードの受け口を張ったか（1 回だけ） */

    var st = {
      index: 0,
      showFeedback: false,       /* Practice で回答後に出す */
      paused: false,
      finished: false,
      /* 問題ごとの見た目の状態（拡大率・めくったか・小問の何番目か）。
         回答そのものではないので、答案には混ぜない。 */
      ui: Object.create(null),
      /* 広い画面のわき（問題の一覧）を開いているか。設定で既定が決まる。 */
      sideOpen: !PP || PP.get("listPanel") !== false
    };
    var binding = null;          /* いま結線している回答欄 */
    /* 学習プレイヤーの設定。描くたびに読み直す（設定画面で変えたらすぐ効く）。 */
    var pref = PP ? PP.all() : {};
    /* 保存の状態。**「保存済み」は本当に書けたときだけ出す。** */
    var saveState = "saved";

    /* 解き方（モード）。旧い名前も受け取る。 */
    var MODE_ALIAS = { practice: "practice", exam: "mock", review: "study" };
    function modeCfg() {
      var id = session && session.mode ? session.mode : "practice";
      return QT.mode(id) || QT.mode(MODE_ALIAS[id] || "practice") || QT.mode("practice");
    }
    function showsFeedback() { var m = modeCfg(); return m && m.feedback === "each"; }
    /* 「解いている間、正解を端末へ置かない」モードか。
       練習は最後にまとめて答え合わせをするだけなので、ここには入らない。 */
    function hidesAnswers() { var m = modeCfg(); return !!(m && m.revealAnswer === "after-submit"); }

    start();

    function start() {
      /* 中断中のセッションがあれば再開を聞く */
      var resumable = ST.quizzes.list().filter(function (s) {
        return s.presetId === preset.id && ["in_progress", "paused", "ready"].indexOf(s.state) >= 0;
      }).sort(function (a, b) { return (b.updatedAt || "").localeCompare(a.updatedAt || ""); })[0];

      if (resumable && o.resume !== false) {
        render();
        app.confirm({
          title: "前回の続きから始めますか",
          body: "中断したクイズがあります（" + (resumable.answers || []).filter(function (a) {
                  var qq = preset.questions.filter(function (x) { return x.id === a.questionId; })[0];
                  return qq ? !EV.isUnanswered(qq, a.value) : !G.isUnanswered(a.value);
                }).length
              + " / " + (resumable.questionOrder || []).length + " 問回答済み）。",
          okLabel: "続きから", cancelLabel: "最初から"
        }).then(function (yes) {
          if (yes) { session = resumable; afterStart(true); }
          else { ST.quizzes.remove(resumable.id); newSession(); }
        });
        return;
      }
      newSession();
    }

    function newSession() {
      var order = preset.questions.map(function (q) { return q.id; });
      if (o.shuffleQuestions) order = shuffle(order);
      if (o.limit && o.limit < order.length) order = order.slice(0, o.limit);

      var choiceOrder = {};
      if (o.shuffleChoices) {
        preset.questions.forEach(function (q) {
          if ((q.choices || []).length) choiceOrder[q.id] = shuffle(q.choices.map(function (c) { return c.id; }));
        });
      }

      session = {
        id: S.newId("quiz"),
        presetId: preset.id,
        presetName: preset.name,
        mode: o.mode || "practice",          /* practice | exam | review */
        state: "created",
        questionOrder: order,
        choiceOrder: choiceOrder,
        answers: [],
        allowBack: o.allowBack !== false,
        timeLimitSec: o.timeLimitSec || 0,
        /* 1 問あたりの制限。0 でなし。時間が来たら記録して次へ進む（勝手に不正解にはしない）。 */
        perQuestionSec: o.perQuestionSec || 0,
        startedAt: null,
        elapsedMs: 0,
        stateHistory: []
      };
      S.transition("quiz", session, "ready");
      afterStart(false);
    }

    function afterStart(resumed) {
      if (session.state === "paused") { st.paused = true; }
      if (session.state === "ready") {
        S.transition("quiz", session, "in_progress");
        session.startedAt = S.nowIso();
      }
      /* 再開時は最初の未回答へ飛ぶ */
      if (resumed) {
        var i = session.questionOrder.findIndex(function (qid) { return isBlank(qid); });
        st.index = i >= 0 ? i : 0;
      }
      persist();
      startTimer();
      questionEnteredAt = Date.now();
      render();
      if (skipped.length) {
        app.toast("まだ書きかけの " + skipped.length + " 問は出していません（"
          + QT.shortLabel(skipped[0].type) + " ほか）。", "warning", 6000);
        skipped = [];
      }
    }

    function shuffle(a) {
      var x = a.slice();
      for (var i = x.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = x[i]; x[i] = x[j]; x[j] = t;
      }
      return x;
    }

    function startTimer() {
      clearInterval(tick);
      tick = setInterval(function () {
        if (st.paused || st.finished) return;
        session.elapsedMs += 1000;
        if (session.timeLimitSec && session.elapsedMs >= session.timeLimitSec * 1000) {
          clearInterval(tick);
          S.transition("quiz", session, "expired");
          app.toast("時間になりました。採点します。", "warning");
          submit(true);
          return;
        }
        if (session.perQuestionSec && !st.showFeedback
            && questionLeft() <= 0) { onQuestionTimeUp(); return; }
        renderHeader();
      }, 1000);
    }

    /* 現在の問題に残っている秒数。制限が無ければ null。 */
    function questionLeft() {
      if (!session.perQuestionSec) return null;
      var used = Math.floor((Date.now() - questionEnteredAt) / 1000);
      return session.perQuestionSec - used;
    }
    function onQuestionTimeUp() {
      if (st.index >= session.questionOrder.length - 1) {
        app.toast("時間になりました。採点します。", "warning");
        submit(true);
        return;
      }
      app.toast("時間になったので次の問題へ進みます。", "info");
      goto(st.index + 1);
    }

    function persist() {
      clearTimeout(saveTimer);
      setSave("saving");
      saveTimer = setTimeout(function () { persistNow(); }, SAVE_MS);
    }
    function persistNow() {
      clearTimeout(saveTimer);
      /* 書けたかどうかを見て state を決める。put が false を返す・例外を投げるのは
         保存領域が満杯のとき。ここで握り潰すと「保存済み」と嘘を出すことになる。 */
      var ok = true;
      try { var r = ST.quizzes.put(session); ok = !!(r && r.ok); }
      catch (e) { ok = false; }
      setSave(ok ? "saved" : "error");
    }
    function setSave(next) {
      if (saveState === next) return;
      saveState = next;
      renderHeader();
    }

    /* ── 問題と回答 ───────────────────────────────────────── */
    function currentQid() { return session.questionOrder[st.index]; }
    function questionById(qid) { return preset.questions.find(function (q) { return q.id === qid; }); }
    /* 試験では、解いている間の画面に正解を置かない（§9 / §21）。
       正解を落とした写しだけを描く。採点のときだけ本物を使う。 */
    var stripped = null;
    function viewQuestion(q) {
      if (!q || !hidesAnswers()) return q;
      if (!stripped) stripped = Object.create(null);
      if (!stripped[q.id]) {
        try { stripped[q.id] = QM.stripAnswersStrict(q); }
        catch (e) { stripped[q.id] = q; }
      }
      return stripped[q.id];
    }
    function current() { return questionById(currentQid()); }
    function answerFor(qid) { return session.answers.find(function (a) { return a.questionId === qid; }); }
    /* 未回答かどうかは形式で違う（分類は items、位置は points、…）。
       G.isUnanswered だけを見ると、新しい形式が常に「回答済み」になる。 */
    function isBlank(qid) {
      var a = answerFor(qid);
      if (!a) return true;
      var q = questionById(qid);
      return q ? EV.isUnanswered(q, a.value) : G.isUnanswered(a.value);
    }
    function answeredCount() {
      return session.questionOrder.filter(function (qid) { return !isBlank(qid); }).length;
    }

    function setAnswer(qid, value) {
      var a = answerFor(qid);
      if (!a) {
        a = { questionId: qid, value: null, timeMs: 0, changeCount: 0, visitCount: 1, flagged: false, updatedAt: null };
        session.answers.push(a);
      }
      var had = a.value !== null && a.value !== undefined;
      var same = JSON.stringify(a.value) === JSON.stringify(value);
      if (!same && had) a.changeCount++;
      a.value = value;
      a.updatedAt = S.nowIso();
      persist();
    }
    function accumulateTime() {
      var qid = currentQid();
      if (!qid || !questionEnteredAt) return;
      var a = answerFor(qid);
      if (!a) {
        a = { questionId: qid, value: null, timeMs: 0, changeCount: 0, visitCount: 1, flagged: false };
        session.answers.push(a);
      }
      a.timeMs = (a.timeMs || 0) + (Date.now() - questionEnteredAt);
      questionEnteredAt = Date.now();
    }
    function goto(i) {
      if (i < 0 || i >= session.questionOrder.length) return;
      accumulateTime();
      st.index = i;
      st.showFeedback = false;
      var a = answerFor(currentQid());
      if (a) a.visitCount = (a.visitCount || 0) + 1;
      questionEnteredAt = Date.now();
      persist();
      render();
    }

    /* ── 提出・採点 ───────────────────────────────────────── */
    function requestSubmit() {
      var unanswered = session.questionOrder.filter(function (qid) { return isBlank(qid); });
      /* 未回答を知らせるか・採点の前に確認するかは設定で切れる（既定はどちらも入）。
         切ってあるなら、押した時点でそのまま採点する。 */
      if (unanswered.length && pref.warnUnanswered === false && pref.confirmSubmit === false) {
        submit(false); return;
      }
      if (unanswered.length && pref.warnUnanswered === false) {
        app.confirm({ title: "採点しますか", body: "回答を確定して採点します。", okLabel: "採点する" })
          .then(function (yes) { if (yes) submit(false); });
        return;
      }
      if (!unanswered.length && pref.confirmSubmit === false) { submit(false); return; }
      if (unanswered.length) {
        app.confirm({
          title: "未回答が " + unanswered.length + " 問あります",
          body: "このまま採点しますか？未回答は 0 点になります。",
          okLabel: "採点する", cancelLabel: "戻って回答する"
        }).then(function (yes) {
          if (yes) submit(false);
          else {
            var i = session.questionOrder.indexOf(unanswered[0]);
            if (i >= 0) goto(i);
          }
        });
        return;
      }
      app.confirm({ title: "採点しますか", body: "回答を確定して採点します。", okLabel: "採点する" })
        .then(function (yes) { if (yes) submit(false); });
    }

    function submit(fromExpiry) {
      if (submitting) return;                       /* 二重送信防止 */
      submitting = true;
      accumulateTime();
      clearInterval(tick);
      st.finished = true;

      try {
        if (session.state !== "submitting") S.transition("quiz", session, "submitting");
      } catch (e) {
        submitting = false;
        app.toast("この状態からは採点できません。", "error");
        return;
      }
      persistNow();
      render();

      var questions = session.questionOrder.map(questionById).filter(Boolean);
      var graded;
      try {
        S.transition("quiz", session, "grading");
        /* 複合大問は小問へ展開して採点する。集計の単位を小問にそろえる。 */
        graded = EV.evaluateSession(questions, session.answers);
      } catch (e) {
        submitting = false;
        try { S.transition("quiz", session, "in_progress"); } catch (x) {}
        app.alert({ title: "採点に失敗しました", body: "もう一度お試しください。" });
        render();
        return;
      }

      var agg = EV.aggregate(questions, graded.items);
      var result = {
        id: S.newId("result"),
        kind: "quiz",
        sessionId: session.id,
        presetId: preset.id,
        presetName: preset.name,
        mode: session.mode,
        finishedAt: S.nowIso(),
        expired: !!fromExpiry,
        elapsedMs: session.elapsedMs,
        questionOrder: session.questionOrder,
        answers: JSON.parse(JSON.stringify(session.answers)),
        items: graded.items,
        pendingAiCount: graded.pendingCount,
        score: graded.deterministicScore,
        maxScore: graded.totalMax,
        correctCount: graded.correctCount,
        wrongCount: graded.wrongCount,
        unansweredCount: graded.unansweredCount,
        aggregate: agg,
        behavior: G.behaviorSignals(QM.flatten(questions), graded.items),
        weakSpots: EV.weakSpots(questions, graded.items),
        questionsSnapshot: QM.flatten(questions).map(snapshotQuestion),
        /* 大問そのものも残す（結果画面で「どの大問の小問か」を出すため）。 */
        groupsSnapshot: questions.filter(QM.isComposite).map(function (g) {
          return { id: g.id, type: g.type, prompt: g.prompt, instruction: g.instruction,
                   context: g.context, points: g.points,
                   childIds: (g.children || []).map(function (c) { return c.id; }) };
        })
      };

      var saved = ST.results.put(result);
      S.transition("quiz", session, "completed");
      persistNow();
      submitting = false;

      var rec = saved.ok ? saved.record : result;
      if (o.onFinished) { try { o.onFinished(rec); } catch (e) {} }

      /* 結果画面へ */
      app.close("submitted");
      if (VQ2.resultView && VQ2.flags.isOn("resultViewV2")) {
        VQ2.resultView.open({ result: rec, preset: preset, pendingAi: graded.pendingAi });
      }
    }

    /* 結果画面が後から参照できるように、採点に必要な情報だけを保存する */
    function snapshotQuestion(q) {
      /* 結果画面で自分の答えを「その形式のまま」再現するため、
         形式ごとの構造も丸ごと残す。ここを削ると再現できなくなる。 */
      var keep = ["id", "type", "engine", "groupId", "prompt", "promptRich", "instruction",
                  "context", "contextRich", "media", "choices", "blanks", "orderItems",
                  "correctOrder", "pairs", "classification", "table", "hotspots", "labels",
                  "errorSpans", "chart", "card", "wordBank",
                  "correctAnswer", "acceptedAnswers", "answerNormalization", "scoringRule",
                  "settings", "explanation", "explanationRich", "hint",
                  "difficulty", "topic", "tags", "points", "estimatedSeconds",
                  "sourceReferences", "scoringRubric", "criterionAllocation", "metadata"];
      var out = {};
      keep.forEach(function (k) { if (q[k] !== undefined) out[k] = q[k]; });
      return JSON.parse(JSON.stringify(out));
    }

    function requestExit() {
      if (st.finished) { app.close("done"); return; }
      var answered = answeredCount();
      app.confirm({
        title: "クイズを終了しますか",
        body: answered ? "ここまでの回答は保存され、次回続きから再開できます。" : "まだ回答がありません。",
        okLabel: "終了する", cancelLabel: "続ける"
      }).then(function (yes) {
        if (!yes) return;
        try { if (session.state === "in_progress" || session.state === "paused") S.transition("quiz", session, "abandoned"); } catch (e) {}
        clearInterval(tick);
        persistNow();
        app.close("exit");
      });
    }

    function togglePause() {
      st.paused = !st.paused;
      try { S.transition("quiz", session, st.paused ? "paused" : "in_progress"); } catch (e) {}
      if (st.paused) accumulateTime(); else questionEnteredAt = Date.now();
      persistNow();
      render();
    }

    /* ══════════════════════════════════════════════════════════
       描画
       ══════════════════════════════════════════════════════════ */
    function render() {
      if (!session) { app.root.innerHTML = U.skeleton(4); return; }
      if (binding) { binding.destroy(); binding = null; }
      pref = PP ? PP.all() : {};
      if (PS) PS.applyVars(app.root, pref);
      app.root.innerHTML = headerHtml() + bodyHtml() + footerHtml();
      wire();
      mountAnswer();
      /* 問題ごとに読む位置を先頭へ戻す（設定で切れる）。
         長い資料つきの問題のあと、次の問題が途中から始まって見えるのを防ぐ。 */
      if (pref.resetScroll !== false) {
        var sc = app.root.querySelector("#pMain");
        if (sc) sc.scrollTop = 0;
      }
    }
    /* 下の操作列だけを差し替える。回答欄には触らない
       （触ると、運んでいる途中のものが消える）。 */
    function renderFooter() {
      var cur = app.root.querySelector("[data-qfoot]");
      if (!cur) return;
      var box = document.createElement("div");
      box.innerHTML = footerHtml();
      var next = box.firstElementChild;
      if (!next) return;
      cur.parentNode.replaceChild(next, cur);
      /* 結線し直さない。app.root へ委ねてあるので、中身を入れ替えても効く。 */
    }
    /* 差し替えるのは見出しのかたまり（.vq2-head）ごと。
       中の .vq2-top だけを差し替えると、headerHtml() が返す進捗バーが
       毎秒 1 本ずつ積み上がって画面が埋まる（実際に起きた）。 */
    function renderHeader() {
      var h = app.root.querySelector(".vq2-head");
      if (h) h.outerHTML = headerHtml();
      /* 結線し直さない（毎秒ここを通るので、張り直すと 1 分で 120 個増える）。 */
    }

    function headerHtml() {
      var total = session.questionOrder.length;
      var answered = answeredCount();
      var t = Math.floor(session.elapsedMs / 1000);
      var remain = session.timeLimitSec ? session.timeLimitSec - t : 0;
      var timeStr = pad(Math.floor(t / 60)) + ":" + pad(t % 60);
      var timeLabel = session.timeLimitSec
        ? "残り " + pad(Math.max(0, Math.floor(remain / 60))) + ":" + pad(Math.max(0, remain % 60))
        : timeStr;

      var actions = "";
      /* この問題だけの残り時間は、あるときだけ出す。 */
      if (session.perQuestionSec) {
        var left = Math.max(0, questionLeft() == null ? 0 : questionLeft());
        actions += '<span class="vq2-badge' + (left <= 5 ? " is-danger" : "") + '">'
          + 'この問題 <span class="vq2-mono" style="margin-left:4px">' + left + "秒</span></span>";
      }
      /* 広い画面のときだけ、一覧の開け閉めを出す（狭い画面には一覧を置かない）。 */
      if (!app.isMobile() && pref.listPanel !== false)
        actions += btn({ icon: "list", iconOnly: true, variant: "quiet", action: "toggle-side",
                         aria: st.sideOpen ? "問題の一覧を閉じる" : "問題の一覧を開く",
                         title: "問題の一覧", pressed: st.sideOpen });
      actions += btn({ icon: st.paused ? "play" : "pause", iconOnly: true, variant: "quiet", action: "pause",
                       aria: st.paused ? "再開" : "一時停止", title: st.paused ? "再開" : "一時停止" });
      actions += btn({ icon: "close", iconOnly: true, variant: "quiet", action: "exit", aria: "終了", title: "終了" });

      return PS.head({
        prefs: pref,
        /* 狭い画面では、保存の印を小さくする（題名と時間で場所が無い）。 */
        compact: app.isMobile(),
        title: session.presetName,
        sub: modeLabel(session.mode) + " ・ " + answered + " / " + total + " 問回答",
        progress: { now: st.index + 1, total: total },
        timeLabel: timeLabel,
        timeDanger: !!(session.timeLimitSec && remain < 60),
        save: saveState,
        actions: actions,
        backAction: "exit", backAria: "終了"
      });
    }

    function pad(n) { return ("0" + n).slice(-2); }
    function modeLabel(m) { return m === "exam" ? "テスト形式" : m === "review" ? "復習" : "練習"; }

    function bodyHtml() {
      if (st.paused) {
        return PS.body({ isMobile: app.isMobile(), main:
          U.empty({ icon: "pause", title: "一時停止中", body: "時間は止まっています。",
                    action: { label: "再開する", icon: "play", variant: "primary", action: "pause" } }) });
      }
      if (submitting || st.finished) {
        return PS.body({ isMobile: app.isMobile(), main:
          '<div class="vq2-empty"><div class="vq2-spin" style="width:28px;height:28px"></div>'
          + '<div class="vq2-empty-t">採点しています</div></div>' });
      }

      var q = current();
      if (!q) return PS.body({ isMobile: app.isMobile(), main: U.empty({ title: "問題を表示できません" }) });

      var a = answerFor(q.id);
      var value = a ? a.value : null;
      var h = '<div class="vq2-q"><div class="vq2-qbox">';

      h += '<div class="vq2-row" style="gap:8px">'
        + U.badge("問 " + (st.index + 1))
        + U.badge(QT.shortLabel(q.type))
        + (a && a.flagged ? U.statusChip("warning", "後で確認") : "")
        + "</div>";

      /* 問題文・資料・図表・音声は Renderer が組み立てる。
         形式ごとの見た目をここへ書かない（§8）。 */
      h += R.promptHtml(viewQuestion(q), rendererOpts(q));
      /* 回答欄は空の箱だけ置き、中身は結線のときに入れる。
         運ぶ操作の途中で画面全体を描き直すと、持っているものが消えるため。 */
      h += '<div class="vq2-qanswer" data-qanswer></div>';
      h += "</div>";                      /* vq2-qbox を閉じる */

      /* 1 問ごとに答え合わせをするモードだけ、その場で結果を出す。 */
      if (st.showFeedback && showsFeedback()) h += feedbackHtml(q, value);
      h += "</div>";

      return PS.body({
        isMobile: app.isMobile(),
        main: h,
        sideTitle: "問題の一覧",
        sideOpen: st.sideOpen && pref.listPanel !== false,
        side: sideHtml()
      });
    }

    /* わき：問題の一覧と、見直しの入口。
       どこが未回答で、どこに目印を付けたかが一目で分かるようにする。 */
    function sideHtml() {
      var items = session.questionOrder.map(function (qid, i) {
        var a = answerFor(qid);
        return {
          state: isBlank(qid) ? "blank" : "answered",
          flagged: !!(a && a.flagged),
          current: i === st.index
        };
      });
      var blanks = items.filter(function (x) { return x.state === "blank"; }).length;
      var flags = items.filter(function (x) { return x.flagged; }).length;
      var acts = "";
      if (blanks) acts += btn({ label: "未回答へ移る（" + blanks + "）", size: "sm", variant: "ghost",
                               icon: "chevronR", action: "goto-blank" });
      if (flags) acts += btn({ label: "目印へ移る（" + flags + "）", size: "sm", variant: "ghost",
                              icon: "flag", action: "goto-flag" });
      acts += btn({ label: "採点する", size: "sm", variant: "primary", icon: "check", action: "submit" });
      return PS.questionList(items, { action: "goto-q", actions: acts });
    }

    /* ── Renderer へ渡す設定 ────────────────────────────────
       形式ごとの分岐はここに書かない。何を見せてよいか（モード）と、
       画面ごとの一時状態（拡大率・めくったか）だけを渡す。 */
    function uiState(qid) { return st.ui[qid] || (st.ui[qid] = {}); }
    function rendererOpts(q) {
      var a = answerFor(q.id) || {};
      var ui = uiState(q.id);
      return {
        mobile: app.isMobile(),
        choiceOrder: session.choiceOrder[q.id],
        locked: st.showFeedback && showsFeedback(),
        replayCount: a.replayCount || 0,
        /* 読み上げの声。問題に指定が無いときはプリセット全体の設定を使う。 */
        preset: preset,
        hintStep: ui.hintStep || 0,
        zoom: ui.zoom || 1,
        cardFlipped: !!ui.cardFlipped,
        subIndex: ui.subIndex || 0,
        compositeTab: ui.compositeTab,
        /* 試験では採点基準も見せない（何を書けば点になるかが答えになる問題があるため）。 */
        showRubric: !hidesAnswers(),
        onReport: function (qq) { reportQuestion(qq); }
      };
    }

    /* 回答欄を箱の中へ入れて結線する。描き直しは Renderer が中だけで行う。 */
    function mountAnswer() {
      if (binding) { binding.destroy(); binding = null; }
      var box = app.root.querySelector("[data-qanswer]");
      var q = current();
      if (!box || !q) return;
      var a = answerFor(q.id);
      var value = a ? a.value : null;
      var opt = rendererOpts(q);
      var view = viewQuestion(q);
      box.innerHTML = R.html(view, value, opt);
      binding = R.bind(box, view, value, Object.assign({}, opt, {
        onChange: function (v, meta) {
          setAnswer(q.id, v);
          if (st.showFeedback) { st.showFeedback = false; render(); return; }
          /* カードの自己採点は、押した時点で次へ行くのが自然（設定に関係なく進む）。 */
          if (meta && meta.advance && session.mode !== "mock") { advance(); return; }

          /* ここから下は設定で変わる。既定は **どちらも切** なので、
             何も触っていない人の動きは今までと同じ。 */
          var answered = !isBlank(q.id);
          /* 答えたらすぐ解説（1 問ずつ答え合わせをするモードのときだけ） */
          if (answered && pref.instantExplain && showsFeedback() && !hidesAnswers()) {
            st.showFeedback = true; render(); return;
          }
          /* 答えたら自動で次へ。選ぶだけで決まる形式に限る
             （書く形式で自動で進むと、打っている途中で飛ばされる）。 */
          if (answered && pref.autoNext && !showsFeedback() && autoAdvanceable(q)) {
            advance(); return;
          }
          renderFooter();
        },
        onLocalState: function (patch) {
          var ui = uiState(q.id);
          Object.keys(patch).forEach(function (k) {
            if (k === "replayCount" || k === "hintUsed") {
              var rec = answerFor(q.id);
              if (!rec) { setAnswer(q.id, null); rec = answerFor(q.id); }
              rec[k] = patch[k];
              persist();
            } else ui[k] = patch[k];
          });
        }
      }));
    }

    function reportQuestion(q) {
      app.alert({
        title: "この問題を報告しました",
        body: "「" + (q.prompt || QT.label(q.type)) + "」を、直したほうがよい問題として印を付けました。"
      });
      var rec = answerFor(q.id);
      if (!rec) { setAnswer(q.id, null); rec = answerFor(q.id); }
      rec.reported = true;
      persistNow();
    }

    function feedbackHtml(q, value) {
      var g = EV.evaluate(q, value);
      var pending = g.score === null;
      var h = '<div class="vq2-card" style="border-color:'
        + (pending ? "var(--vq-border-strong)" : (g.isCorrect ? "var(--vq-success)" : "var(--vq-danger)")) + '">';
      h += '<div class="vq2-row" style="margin-bottom:10px">'
        + (pending
            ? U.statusChip("pending", "採点は終了後に行います")
            : U.statusChip(g.isCorrect ? "success" : (g.partialCredit ? "warning" : "error"),
                           g.isCorrect ? "正解" : (g.partialCredit ? "部分正解" : "不正解")))
        + (pending ? "" : '<span class="vq2-muted">' + g.score + " / " + g.maxScore + " 点</span>")
        + "</div>";
      if (g.feedback) h += '<div class="vq2-hint" style="margin-bottom:8px">' + esc(g.feedback) + "</div>";

      /* 正解を必ず言葉で出す。「不正解」だけでは直せない。 */
      var correctText = R.correctAnswerText(q);
      if (correctText && !g.isCorrect)
        h += '<div style="margin-bottom:10px"><span class="vq2-label">正解</span>'
          + '<div style="line-height:1.85">' + esc(correctText) + "</div></div>";

      /* 足りなかった項目（書き取り・キーワード）。 */
      if ((g.missedCriteria || []).length)
        h += '<div style="margin-bottom:10px"><span class="vq2-label">足りなかったところ</span>'
          + '<div style="line-height:1.85">' + esc(g.missedCriteria.join("　")) + "</div></div>";

      if (q.explanationRich) h += QM.RC.toHtml(q.explanationRich, { className: "vq2-rc" });
      else if (q.explanation) h += '<div style="line-height:1.85;white-space:pre-wrap">' + esc(q.explanation) + "</div>";

      /* 選んだ誤答についての解説 */
      var pickedId = R.pickedChoiceId(value);
      (q.choices || []).forEach(function (c) {
        if (String(pickedId) !== String(c.id) || c.isCorrect || !c.explanation) return;
        h += '<div style="margin-top:10px;padding:9px 11px;border-radius:var(--vq-r-md);background:var(--vq-danger-bg)">'
          + '<div class="vq2-label" style="color:var(--vq-danger-text)">選んだ選択肢について</div>'
          + "<div>" + esc(c.explanation) + "</div></div>";
      });
      if ((q.sourceReferences || []).length) {
        h += '<div style="margin-top:12px">' + q.sourceReferences.map(function (sr) {
          return '<div class="vq2-src" style="margin-bottom:4px">' + icon("doc")
            + '<span class="vq2-src-n">' + esc(sr.sourceName) + (sr.page ? "（p." + sr.page + "）" : "") + "</span></div>";
        }).join("") + "</div>";
      }
      h += "</div>";
      return h;
    }

    function footerHtml() {
      if (st.paused || st.finished || submitting) return '<div data-qfoot></div>';
      var last = st.index >= session.questionOrder.length - 1;
      var a = answerFor(currentQid());
      var answered = !isBlank(currentQid());
      var canBack = session.allowBack && st.index > 0;
      var mobile = app.isMobile();

      var left = btn({ icon: "chevronL", label: mobile ? "" : "前へ", action: "prev", disabled: !canBack,
                       iconOnly: mobile, aria: "前の問題" })
        + btn({ icon: "flag", label: mobile ? "" : "後で確認", action: "flag",
                iconOnly: mobile, aria: "後で確認", active: a && a.flagged });

      var right;
      if (showsFeedback() && answered && !st.showFeedback) {
        right = btn({ label: "答え合わせ", variant: "primary", action: "check" });
      } else if (last) {
        right = btn({ label: "採点する", variant: "primary", icon: "check", action: "submit" });
      } else {
        right = btn({ label: answered ? "次へ" : "スキップ", variant: answered ? "primary" : "ghost",
                      icon: "chevronR", action: "next" });
      }

      /* 狭い画面では、いま何問目かを操作列の真ん中に出す
         （上の帯を隠す設定でも、位置が分かるように）。 */
      var center = mobile && pref.showProgress === false
        ? '<span class="vq2-mono vq2-muted">' + (st.index + 1) + " / " + session.questionOrder.length + "</span>"
        : "";

      return PS.foot({ left: left, right: right, center: center });
    }

    /* ── 結線 ─────────────────────────────────────────────── */
    /* **結線は 1 回だけ。** U.on は呼ぶたびに addEventListener するだけで、
       外す仕組みが無い。見出しは 1 秒ごとに描き直すので、そのたびに結線すると
       聞き手が増え続ける。実測（vqleak.cjs）:
         6 秒待つ … 0 → 14 個 ／ 3 問すすむ … 14 → 37 個
       増えたぶんだけ同じ処理が走る。描き直す処理は contains() の番人で
       2 つめ以降が落ちるが、ダイアログを出すだけの処理は落ちない。
       委ねる先は app.root で、描き直しても app.root 自体は入れ替わらないから、
       1 回張れば以降の中身にも効く。 */
    function wire() {
      /* 印は app.root へ置く。関数の中の var は巻き上げで
         「先に render → あとで var wired = false」の順に走ると、
         いちど張ったあとに印が消えて、次の描画でもう一度張ってしまう（実測）。 */
      if (app.root.__qpWired) return;
      app.root.__qpWired = true;
      wireHeader(); wireBody(); wireFooter();
    }

    function wireHeader() {
      var r = app.root;
      U.on(r, "click", '[data-act="exit"]', function () { requestExit(); });
      U.on(r, "click", '[data-act="pause"]', function () { togglePause(); });
    }

    function wireBody() {
      /* 回答そのものの結線は Renderer が持つ（mountAnswer）。
         ここはキーボードの近道だけを見る。 */
      /* キーボード操作：1〜9 / A〜Z で選択、Enter で次へ。
         root だけに張ると、画面内にフォーカスが無いあいだ（開いた直後や、
         押したボタンが消えた直後）にキーが届かない。document で拾い、
         この画面が出ているときだけ効かせる。多重登録は 1 回で止める。 */
      if (!keyBound) {
        keyBound = true;
        document.addEventListener("keydown", onKey, true);
      }
      /* 効かせるかどうかは onKey の中で毎回見る（設定を変えたらすぐ効くように）。 */
    }
    /* 実際に押された相手を取る。
       影の DOM の中で押されたキーは、document から見ると e.target が
       「画面そのもの（host）」に付け替えられる。そのまま tagName を見ると
       入力欄の中で打っていても DIV に見えるので、
       F を打つと「後で確認」が入り、Enter で次の問題へ飛んでいた。 */
    function realTarget(e) {
      if (e.composedPath) {
        var path = e.composedPath();
        if (path && path.length) return path[0];
      }
      return e.target;
    }
    /* 文字を打ち込んでいる最中か。ここが true のあいだは何も横取りしない。 */
    function isTyping(e) {
      var t = realTarget(e);
      if (!t || t.nodeType !== 1) return false;
      var tag = (t.tagName || "").toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (t.isContentEditable) return true;
      return false;
    }

    function onKey(e) {
      /* この出題画面が今 出ていないときは、何も横取りしない。 */
      if (!session || !app.root || !app.root.isConnected) return;
      /* 設定で切っていたら横取りしない。
         学習プレイヤーの設定（新）と、本体の設定（旧）の **どちらか**が切なら効かせない。
         毎回見るので、設定を変えた直後から効く。 */
      if (PP && PP.get("keyboard") === false) return;
      try {
        var S = (typeof window !== "undefined") && window.__vqSet;
        if (S && S.get("learn.keyboard") === false) return;
      } catch (eKb) {}
      if (st.paused || st.finished) return;
      /* 日本語の変換中は、確定の Enter が来る。ここで拾うと変換が飛ぶ。 */
      if (e.isComposing || e.keyCode === 229) return;

      if (isTyping(e)) {
        /* 打ち込んでいる最中は、何もしない。
           Enter で次の問題へ飛ばさない（書いたものが見えないまま進んでしまう）。
           空欄がいくつもあるときだけ、Enter で次の空欄へ移す。 */
        if (e.key === "Enter" && !e.shiftKey) {
          var t = realTarget(e);
          if (t && (t.tagName || "").toUpperCase() === "INPUT") {
            var fields = app.root.querySelectorAll("[data-qr-blank], [data-qr-cell], [data-qr-span]");
            var at = Array.prototype.indexOf.call(fields, t);
            if (at >= 0 && at < fields.length - 1) {
              e.preventDefault();
              try { fields[at + 1].focus({ preventScroll: true }); } catch (x) { fields[at + 1].focus(); }
            }
          }
        }
        return;
      }

      var q = current(); if (!q) return;
      /* 数字（1〜9）でも、画面に出ている記号（A〜Z）でも選べる。
         選択式でないとき（並べ替え・分類・位置など）は横取りしない。
         横取りすると、Renderer 側のキーボード操作が効かなくなる。 */
      var eng = q.engine || QT.engineOf(q.type);
      var isChoice = eng === "single_choice" || eng === "true_false" || eng === "multi_choice"
                  || eng === "image_choice" || eng === "audio_choice"
                  || (eng === "chart_read" && (q.choices || []).length);
      /* 文字で答える問題では、1 文字の近道を効かせない。
         打ちたい文字が操作に化ける（F が「後で確認」になる）。 */
      var typable = eng === "text_input" || eng === "numeric_input" || eng === "dictation"
                 || eng === "free_text" || eng === "fill_blank" || eng === "table_fill"
                 || eng === "error_correction" || eng === "composite";
      var idx = -1;
      if (isChoice) {
        if (/^[1-9]$/.test(e.key)) idx = parseInt(e.key, 10) - 1;
        else if (/^[a-zA-Z]$/.test(e.key) && e.key.toLowerCase() !== "f")
          idx = e.key.toUpperCase().charCodeAt(0) - 65;
      }
      if (idx >= 0 && idx < (q.choices || []).length) {
        var order = session.choiceOrder[q.id];
        var list = (q.choices || []).slice();
        if (order) list.sort(function (a, b) { return order.indexOf(a.id) - order.indexOf(b.id); });
        if (list[idx]) {
          e.preventDefault();
          if (eng === "multi_choice") {
            var a = answerFor(q.id);
            var cur = R.pickedChoiceIds(a ? a.value : null);
            var k = cur.indexOf(list[idx].id);
            if (k >= 0) cur.splice(k, 1); else cur.push(list[idx].id);
            setAnswer(q.id, { choiceIds: cur });
          } else setAnswer(q.id, { choiceId: list[idx].id });
          render();
        }
        return;
      }
      if (e.key === "Enter" && !isTextish(e)) { e.preventDefault(); advance(); }
      else if (e.key === "ArrowRight" && !isTextish(e)) { e.preventDefault(); if (st.index < session.questionOrder.length - 1) goto(st.index + 1); }
      else if (e.key === "ArrowLeft" && !isTextish(e)) { e.preventDefault(); if (session.allowBack) goto(st.index - 1); }
      /* 「後で確認」の近道。文字で答える問題では効かせない（F が打てなくなる）。
         そこでは画面のボタンから付ける。 */
      else if (e.key === "f" && !typable && !e.ctrlKey && !e.metaKey && !e.altKey) { toggleFlag(); }
    }
    /* 運ぶ操作の最中は、矢印を問題の移動に使わない。 */
    function isTextish(e) {
      var t = realTarget(e);
      while (t && t.nodeType === 1) {
        if (t.hasAttribute && (t.hasAttribute("data-drag-id") || t.hasAttribute("data-drop-zone")
            || t.hasAttribute("data-imgq-viewport"))) return true;
        t = t.parentElement;
      }
      return false;
    }
    /* 自動で次へ進んでよい形式か。
       選んだ時点で回答が決まるものだけ。書く・並べる・組み合わせるものは、
       途中の状態でも onChange が来るので、進めると操作を奪ってしまう。 */
    var AUTO_OK = { multiple_choice_single: 1, true_false: 1 };
    function autoAdvanceable(q) { return !!AUTO_OK[q && q.type]; }

    function advance() {
      var q = current(); if (!q) return;
      var answered = !isBlank(q.id);
      if (showsFeedback() && answered && !st.showFeedback) { st.showFeedback = true; render(); return; }
      if (st.index >= session.questionOrder.length - 1) requestSubmit();
      else goto(st.index + 1);
    }
    function toggleFlag() {
      var q = current(); if (!q) return;
      var a = answerFor(q.id);
      if (!a) { a = { questionId: q.id, value: null, timeMs: 0, changeCount: 0, visitCount: 1, flagged: false }; session.answers.push(a); }
      a.flagged = !a.flagged;
      persist();
      render();
    }

    function wireFooter() {
      var r = app.root;
      /* わき（問題の一覧）から飛ぶ */
      U.on(r, "click", '[data-act="goto-q"]', function (e, t) {
        goto(Number(t.getAttribute("data-i")) || 0);
      });
      U.on(r, "click", '[data-act="goto-blank"]', function () {
        var i = session.questionOrder.findIndex(function (qid, k) { return k !== st.index && isBlank(qid); });
        if (i < 0) i = session.questionOrder.findIndex(function (qid) { return isBlank(qid); });
        if (i >= 0) goto(i); else app.toast("未回答はありません。", "info");
      });
      U.on(r, "click", '[data-act="goto-flag"]', function () {
        var order = session.questionOrder;
        for (var k = 1; k <= order.length; k++) {
          var i = (st.index + k) % order.length;
          var a = answerFor(order[i]);
          if (a && a.flagged) { goto(i); return; }
        }
        app.toast("目印を付けた問題はありません。", "info");
      });
      U.on(r, "click", '[data-act="toggle-side"]', function () { st.sideOpen = !st.sideOpen; render(); });
      U.on(r, "click", '[data-act="pside-close"]', function () { st.sideOpen = false; render(); });
      U.on(r, "click", '[data-act="prev"]', function () { goto(st.index - 1); });
      U.on(r, "click", '[data-act="next"]', function () { goto(st.index + 1); });
      U.on(r, "click", '[data-act="flag"]', function () { toggleFlag(); });
      U.on(r, "click", '[data-act="check"]', function () { st.showFeedback = true; render(); });
      U.on(r, "click", '[data-act="submit"]', function () { requestSubmit(); });
    }

    return app;
  }

  VQ2.quizPlayer = { open: open };
})(typeof globalThis !== "undefined" ? globalThis : this);
