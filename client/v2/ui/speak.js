/* ══════════════════════════════════════════════════════════════════════
   VocabuSpeak — 英語の学習ワークスペース

   6 つの場所しかない。
     ホーム / レッスン / AI英会話 / トレーニング / 復習 / 履歴

   作りの方針:
   ・問題を出すところは **既存の question-renderer と evaluator をそのまま使う**。
     専用の表示や採点を作らない（§36）。
   ・音は原稿から作る（既存の ui/tts.js）。架空の音声 URL を作らない。
   ・**できていないものは「ベータ」と出す**。声を出す形式は STT と発音分析が
     まだなので、既定では出さない。
   ・スマートフォンでは 1 列。下に固定した帯へボタンを置く。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var U = VQ2.ui;
  if (!U) throw new Error("VQ2.ui must be loaded before speak.js");
  var SM = VQ2.speakModel, SS = VQ2.speakSelect, SC = VQ2.speakContent, SH = VQ2.speakHistory;
  var QM = VQ2.qmodel, QR = VQ2.qrender, EV = VQ2.evaluator, LN = VQ2.learning;
  /* 学習プレイヤーの共通の設定。文字の大きさ・幅・詰まり具合はクイズと同じものを使う。 */
  var PS = VQ2.playerShell, PP = VQ2.playerPrefs;
  var esc = U.esc;

  function str(v) { return v === undefined || v === null ? "" : String(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function num(v, d) { return isNum(v) ? v : d; }

  var HOST_ID = "vq2-speak";
  var TABS = [
    { id: "home", label: "ホーム", icon: "star" },
    { id: "lesson", label: "レッスン", icon: "book" },
    { id: "talk", label: "AI英会話", icon: "user" },
    { id: "train", label: "練習", icon: "audio" },
    { id: "review", label: "復習", icon: "refresh" },
    { id: "history", label: "履歴", icon: "chart" }
  ];

  /* トレーニングで選べるもの。声を出すものには「ベータ」を付ける。 */
  var TRAINING = [
    { id: "listening", label: "リスニング", desc: "音声を聞いて意味を選びます。",
      activities: ["listening_choice", "listening_comprehension"], icon: "audio" },
    { id: "dictation", label: "ディクテーション", desc: "聞こえたとおりに書きます。",
      activities: ["dictation"], icon: "pencil" },
    { id: "fill", label: "英文穴埋め", desc: "空いているところを埋めます。",
      activities: ["audio_fill_blank", "text_fill_blank"], icon: "blank" },
    { id: "reorder", label: "英文並べ替え", desc: "正しい順に並べます。",
      activities: ["sentence_reorder"], icon: "sort" },
    { id: "translate", label: "和文英訳", desc: "日本語を見て英語で書きます。",
      activities: ["translation_to_english"], icon: "pencil" },
    { id: "card", label: "フラッシュカード", desc: "意味を思い出します。",
      activities: ["flashcard"], icon: "layers" },
    { id: "speaking", label: "スピーキング", desc: "声に出して言います。",
      activities: ["speaking_repeat", "pronunciation_practice"], icon: "user", beta: true },
    { id: "shadowing", label: "シャドーイング", desc: "見本を追いかけて言います。",
      activities: ["shadowing"], icon: "audio", beta: true }
  ];

  /* ══════════════════════════════════════════════════════════════════
     開く
     ══════════════════════════════════════════════════════════════════ */
  function open(o) {
    o = o || {};
    var app = U.mount(HOST_ID, {
      title: "VocabuSpeak",
      onResize: function () { render(); },
      onClose: function () { stopAudio(); }
    });

    var st = {
      tab: str(o.tab) || "home",
      prefs: SH.prefs(),
      curriculum: null,
      loading: true,
      error: "",
      summary: null,
      /* 学習中のセッション */
      run: null
    };
    if (o.level) st.prefs.level = str(o.level);

    load();
    checkVoice();
    loadScenarios();
    render();
    wireOnce();
    return app;

    /* 会話シナリオを集める。レッスンの中に入っているので、
       そのレベルのレッスンを読んで取り出す。**無ければ無いと言う。** */
    function loadScenarios() {
      st.scenarios = [];
      SC.lessonsFor({ level: st.prefs.level }).then(function (ls) {
        return Promise.all(ls.map(function (l) {
          return SC.lesson(l.level, l.categoryId, l.id).catch(function () { return null; });
        }));
      }).then(function (all) {
        var out = [];
        arr(all).forEach(function (d) {
          arr(d && d.dialogues).forEach(function (x) {
            var sc = VQ2.dialogue.normalizeScenario(x);
            /* 始められないシナリオは並べない（押しても動かないものを見せない）。 */
            if (VQ2.dialogue.validateScenario(sc).some(function (i) { return i.level === "error"; })) return;
            out.push(sc);
          });
        });
        st.scenarios = out;
        if (st.tab === "talk") render();
      }).catch(function () { st.scenarios = []; });
    }

    /* 聞き取り（STT）が使えるか。使えないうちは話す練習を出さない。 */
    function checkVoice() {
      if (!VQ2.stt || !VQ2.stt.supported()) { st.canTranscribe = false; return; }
      VQ2.stt.status().then(function (r) {
        st.canTranscribe = !!(r && (r.running || r.installed));
        st.voiceStatus = r;
        render();
      }).catch(function () { st.canTranscribe = false; });
    }

    /* ── 読み込み ────────────────────────────────────────────── */
    function load() {
      st.loading = true;
      SC.curriculum().then(function (c) {
        st.curriculum = c;
        st.loading = false;
        if (!c.ok) st.error = c.reason || "教材を読み込めませんでした。";
        st.summary = SH.summary({ days: 1 });
        render();
      }).catch(function (e) {
        st.loading = false;
        st.error = "教材を読み込めませんでした（" + (e && e.message) + "）。";
        render();
      });
    }

    /* ── 画面 ────────────────────────────────────────────────── */
    /* 学習プレイヤーの共通の設定（文字の大きさ・幅・詰まり具合・動き）を当てる。
       クイズと同じ入れ物から読むので、片方だけ設定が効かない、が起きない。 */
    function applyPlayerPrefs() { if (PS) PS.applyVars(app.root); }

    function render() {
      applyPlayerPrefs();
      /* 話す練習は答える場所が違うので、別の描き方をする。 */
      if (st.run && st.run.kind === "speak") { renderSpeak(); return; }
      if (st.run && st.run.kind === "talk") { renderTalk(); return; }
      if (st.run) { renderRun(); return; }
      app.root.innerHTML = shellHtml(bodyHtml());
      focusTab();
    }
    function shellHtml(inner) {
      return '<div class="vq2-sp">'
        + topHtml()
        + '<div class="vq2-sp-body" data-sp-body>' + inner + "</div>"
        + tabsHtml()
        + "</div>";
    }
    function topHtml() {
      var lv = SM.level(st.prefs.level);
      var lvLabel = lv ? SM.levelLabel(lv.id) : "レベル";
      /* 幅の狭い端末では、レベルと設定は印だけにする。
         文字を出すと見出しごとはみ出す（実測 375px）。
         印だけにするときは aria-label を必ず付ける（読み上げで意味を失わせない）。 */
      var small = app.isMobile();
      return '<header class="vq2-sp-top">'
        + '<div class="vq2-sp-top-l">'
        + '<div class="vq2-sp-title">VocabuSpeak</div>'
        + '<div class="vq2-sp-sub">AIと話して、聞いて、伝わる英語を身につけよう</div>'
        + "</div>"
        + '<div class="vq2-sp-top-r">'
        + U.button(small
            ? { icon: "layers", size: "sm", variant: "quiet", action: "sp-level",
                iconOnly: true, aria: "レベルを選ぶ（いまは " + lvLabel + "）", title: lvLabel }
            : { label: lvLabel, size: "sm", variant: "quiet", icon: "layers", action: "sp-level" })
        + U.button(small
            ? { icon: "settings", size: "sm", variant: "quiet", action: "sp-prefs", iconOnly: true, aria: "設定" }
            : { label: "設定", size: "sm", variant: "quiet", icon: "settings", action: "sp-prefs" })
        + U.button({ icon: "close", size: "sm", variant: "quiet", action: "sp-close", iconOnly: true, aria: "閉じる" })
        + "</div></header>";
    }
    function tabsHtml() {
      return '<nav class="vq2-sp-tabs" role="tablist" aria-label="VocabuSpeak のメニュー">'
        + TABS.map(function (t) {
            var on = st.tab === t.id;
            return '<button type="button" class="vq2-sp-tab' + (on ? " is-on" : "") + '"'
              + ' role="tab" aria-selected="' + on + '" data-sp-tab="' + t.id + '">'
              + U.icon(t.icon) + '<span class="vq2-sp-tab-l">' + esc(t.label) + "</span></button>";
          }).join("")
        + "</nav>";
    }
    function bodyHtml() {
      if (st.loading) return U.skeleton ? U.skeleton({ rows: 4 }) : "<div>読み込んでいます…</div>";
      if (st.error) {
        return U.empty({ title: "教材がまだありません", body: st.error,
          action: { label: "もう一度読み込む", action: "sp-reload" } });
      }
      switch (st.tab) {
        case "lesson": return lessonListHtml();
        case "talk": return talkHtml();
        case "train": return trainHtml();
        case "review": return reviewHtml();
        case "history": return historyHtml();
        default: return homeHtml();
      }
    }

    /* ── ホーム（§4）────────────────────────────────────────── */

    /* ── レッスン一覧 ────────────────────────────────────────── */

    /* ── トレーニング ────────────────────────────────────────── */
    function betaWhy(t) {
      var caps = deviceCaps();
      if (t.beta) {
        if (!caps.canRecord) return "この端末ではマイクを使えないため、いまは使えません。";
        if (!caps.canTranscribe) return "聞き取り（ローカルAI）に接続できないため、いまは使えません。";
      }
      if (!caps.canPlayAudio) return "この端末で音を出せないため、いまは使えません。";
      return "いまは使えません。";
    }

    /* ══════════════════════════════════════════════════════════
       ホーム（§4）
       いちばん上に「今日どこまで来たか」。その下に始める場所。
       ══════════════════════════════════════════════════════════ */
    function homeHtml() {
      var c = st.curriculum, s = st.summary || {};
      var resume = SH.resumable()[0] || null;
      var lessons = pickLessons(c, st.prefs.level);
      var next = nextLesson(lessons);
      var goal = num(st.prefs.dailyGoalMinutes, 10);
      var mins = num(s.minutes, 0);
      var stk = SH.streak();
      var h = "";

      /* ── 今日のようす ── */
      h += '<section class="vq2-sp-today">'
        + '<div class="vq2-sp-ring-wrap">' + ringHtml(mins, goal) + "</div>"
        + '<div class="vq2-sp-today-m">'
        + '<div class="vq2-sp-today-t">' + greeting() + "</div>"
        + '<div class="vq2-sp-today-s">'
        + (mins >= goal ? "今日の目標を達成しました。"
                        : "今日の目標まで あと " + Math.max(0, goal - mins) + " 分")
        + "</div>"
        + '<div class="vq2-sp-pills">'
        + pill("flag", stk.days > 0 ? stk.days + " 日つづけて" : "今日から始めましょう", stk.days > 0)
        + pill("layers", SM.levelLabel(st.prefs.level), false)
        + (num(s.dueReview, 0) ? pill("refresh", "復習 " + s.dueReview + " 件", true) : "")
        + "</div></div></section>";

      /* ── 始める ── */
      h += '<section class="vq2-sp-start">'
        + '<div class="vq2-sp-start-k">' + (next ? (next.done ? "つづきのレッスン" : "今日のレッスン") : "レッスン") + "</div>"
        + '<div class="vq2-sp-start-t">' + (next ? esc(next.title) : "このレベルの教材はまだありません") + "</div>"
        + (next
            ? '<div class="vq2-sp-start-s">' + esc(catName(next.categoryId))
              + '<span class="vq2-sp-dot" aria-hidden="true"></span>1 回 ' + Math.min(10, next.variantCount || 10) + " 問"
              + '<span class="vq2-sp-dot" aria-hidden="true"></span>' + (next.estimatedMinutes || 7) + " 分</div>"
              + (arr(next.expressions).length
                  ? '<div class="vq2-sp-chips">' + next.expressions.slice(0, 3).map(function (x) {
                      return '<span class="vq2-sp-chip is-en">' + esc(x) + "</span>"; }).join("") + "</div>"
                  : "")
            : '<div class="vq2-sp-start-s">レベルを変えると、ほかの教材が出ます。</div>')
        + U.button({ label: next ? "はじめる" : "レベルを変える", size: "lg", variant: "primary",
                     action: next ? "sp-start-lesson" : "sp-level", id: next ? next.id : "" })
        + "</section>";

      if (resume) {
        h += '<button type="button" class="vq2-sp-resume" data-act="sp-resume" data-id="' + esc(resume.id) + '">'
          + '<span class="vq2-sp-resume-i">' + U.icon("play") + "</span>"
          + "<span><b>続きから</b>"
          + '<span class="vq2-sp-resume-s">' + esc(activityLabelOf(resume)) + "・" + esc(when(resume.startedAt)) + "</span></span>"
          + U.icon("chevronR") + "</button>";
      }

      /* ── 練習する ── */
      h += '<section class="vq2-sp-sec"><h2 class="vq2-sp-h2">練習する</h2>'
        + trainGridHtml() + "</section>";

      /* ── この 7 日間 ── */
      h += '<section class="vq2-sp-sec"><h2 class="vq2-sp-h2">この 7 日間</h2>'
        + weekHtml() + "</section>";

      /* ── つぎにやること ── */
      var due = SH.listReview({ dueOnly: true });
      var recs = [];
      if (due.length) recs.push({ act: "sp-tab", id: "review", icon: "refresh",
        t: "苦手の復習", s: due.length + " 件が予定日です" });
      lessons.filter(function (l) { return !next || l.id !== next.id; }).slice(0, 2).forEach(function (l) {
        recs.push({ act: "sp-start-lesson", id: l.id, icon: "book", t: l.title, s: catName(l.categoryId) });
      });
      if (arr(st.scenarios).length) {
        var sc = st.scenarios[0];
        recs.push({ act: "sp-talk", id: sc.id, icon: "user", t: sc.title, s: "AIと話す" });
      }
      if (recs.length) {
        h += '<section class="vq2-sp-sec"><h2 class="vq2-sp-h2">つぎにやること</h2>'
          + '<div class="vq2-sp-list">'
          + recs.slice(0, 4).map(function (r) {
              return '<button type="button" class="vq2-sp-row" data-act="' + r.act + '" data-id="' + esc(r.id) + '">'
                + '<span class="vq2-sp-row-i">' + U.icon(r.icon) + "</span>"
                + '<span class="vq2-sp-row-m"><b>' + esc(r.t) + "</b>"
                + '<span class="vq2-sp-row-s">' + esc(r.s) + "</span></span>"
                + '<span class="vq2-sp-row-p">' + U.icon("chevronR") + "</span></button>";
            }).join("")
          + "</div></section>";
      }
      return h;
    }

    function greeting() {
      var hh = new Date().getHours();
      return hh < 5 ? "こんばんは" : hh < 11 ? "おはようございます" : hh < 18 ? "こんにちは" : "こんばんは";
    }
    /* 目標に対する進み具合の輪。**数字も必ず添える**（色だけで伝えない）。 */
    function ringHtml(mins, goal) {
      var r = 34, c = 2 * Math.PI * r;
      var p = Math.max(0, Math.min(1, goal ? mins / goal : 0));
      return '<svg class="vq2-sp-ring" viewBox="0 0 80 80" role="img"'
        + ' aria-label="今日の学習 ' + mins + " 分 / 目標 " + goal + ' 分">'
        + '<circle class="vq2-sp-ring-bg" cx="40" cy="40" r="' + r + '"></circle>'
        + '<circle class="vq2-sp-ring-fg" cx="40" cy="40" r="' + r + '"'
        + ' stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + (c * (1 - p)).toFixed(1) + '"></circle>'
        + '<text class="vq2-sp-ring-n" x="40" y="42">' + mins + "</text>"
        + '<text class="vq2-sp-ring-u" x="40" y="55">分</text></svg>';
    }
    function pill(icon, label, on) {
      return '<span class="vq2-sp-pill' + (on ? " is-on" : "") + '">' + U.icon(icon) + esc(label) + "</span>";
    }
    /* 7 日ぶんの棒。数字を添えて、色だけに頼らない。 */
    function weekHtml() {
      var rows = SH.daily({ days: 7 });
      var max = Math.max(10, rows.reduce(function (a, r) { return Math.max(a, r.minutes); }, 0));
      var names = ["日", "月", "火", "水", "木", "金", "土"];
      var total = rows.reduce(function (a, r) { return a + r.minutes; }, 0);
      return '<div class="vq2-sp-week">'
        + '<div class="vq2-sp-week-b">'
        + rows.map(function (r) {
            var d = new Date(r.start);
            var pct = Math.round((r.minutes / max) * 100);
            return '<div class="vq2-sp-week-c" title="' + r.date + " " + r.minutes + ' 分">'
              + '<span class="vq2-sp-week-v"' + (r.minutes ? "" : ' data-zero="1"')
              + ' style="height:' + Math.max(r.minutes ? 6 : 2, pct) + '%"></span>'
              + '<span class="vq2-sp-week-l">' + names[d.getDay()] + "</span></div>";
          }).join("")
        + "</div>"
        + '<div class="vq2-sp-week-s">合計 ' + total + " 分</div></div>";
    }

    /* 練習の並び。使えないものは理由つきで薄く出す（押せる飾りを置かない）。 */
    function trainGridHtml() {
      var caps = deviceCaps();
      return '<div class="vq2-sp-grid">'
        + TRAINING.map(function (t) {
            var usable = t.activities.some(function (a) { return SM.activityUsable(a, caps); });
            return '<button type="button" class="vq2-sp-tile' + (usable ? "" : " is-off")
              + '" data-act="sp-train" data-id="' + t.id + '"' + (usable ? "" : " disabled") + ">"
              + '<span class="vq2-sp-tile-i tone-' + t.id + '">' + U.icon(t.icon) + "</span>"
              + '<span class="vq2-sp-tile-t">' + esc(t.label)
              + (t.beta ? '<span class="vq2-sp-beta">ベータ</span>' : "") + "</span>"
              + '<span class="vq2-sp-tile-s">' + esc(usable ? t.desc : betaWhy(t)) + "</span>"
              + "</button>";
          }).join("")
        + "</div>";
    }
    function trainHtml() {
      return '<section class="vq2-sp-sec">'
        + '<h2 class="vq2-sp-h2">1 つずつ練習する</h2>'
        + '<p class="vq2-sp-lead">やりたい形だけを続けて練習できます。'
        + "出る問題は、まだやっていないものから選ばれます。</p>"
        + trainGridHtml()
        + '<div class="vq2-sp-list" style="margin-top:18px">'
        + '<button type="button" class="vq2-sp-row" data-act="sp-train" data-id="weak">'
        + '<span class="vq2-sp-row-i">' + U.icon("refresh") + "</span>"
        + '<span class="vq2-sp-row-m"><b>間違えた問題をもう一度</b>'
        + '<span class="vq2-sp-row-s">これまでに間違えた問題と、しばらく出していない問題から 10 問</span></span>'
        + '<span class="vq2-sp-row-p">' + U.icon("chevronR") + "</span></button></div>"
        + "</section>";
    }

    /* ══════════════════════════════════════════════════════════
       レッスン一覧
       ══════════════════════════════════════════════════════════ */
    function lessonListHtml() {
      var c = st.curriculum;
      var lessons = pickLessons(c, st.prefs.level);
      if (!lessons.length) {
        return U.empty({ title: "このレベルの教材がまだありません",
          body: SM.levelLabel(st.prefs.level) + " のレッスンはまだ用意されていません。レベルを変えてみてください。",
          action: { label: "レベルを変える", action: "sp-level" } });
      }
      var ix = SH.indexHistory();
      var totalDone = 0, totalAll = 0;
      lessons.forEach(function (l) {
        var p = lessonProgress(l, ix);
        totalDone += p.done; totalAll += p.total;
      });
      var byGroup = Object.create(null);
      lessons.forEach(function (l) {
        var cat = catOf(l.categoryId);
        var g = cat ? cat.groupId : "other";
        (byGroup[g] || (byGroup[g] = [])).push(l);
      });

      var h = '<div class="vq2-sp-levelbar">'
        + '<div class="vq2-sp-levelbar-t"><b>' + esc(SM.levelLabel(st.prefs.level)) + "</b>"
        + "<span>" + lessons.length + " レッスン・" + totalAll + " 問</span></div>"
        + '<div class="vq2-sp-meter"><span style="width:'
        + (totalAll ? Math.round((totalDone / totalAll) * 100) : 0) + '%"></span></div>'
        + '<div class="vq2-sp-levelbar-b">'
        + '<span class="vq2-sp-levelbar-s">' + totalDone + " / " + totalAll + " 問やりました</span>"
        + U.button({ label: "レベルを変える", size: "sm", variant: "quiet", icon: "layers", action: "sp-level" })
        + "</div></div>";

      h += arr(c.groups).filter(function (g) { return byGroup[g.id]; }).map(function (g) {
        return '<section class="vq2-sp-sec"><h2 class="vq2-sp-h2">' + esc(g.name) + "</h2>"
          + '<div class="vq2-sp-list">'
          + byGroup[g.id].map(function (l) { return lessonRow(l, ix); }).join("")
          + "</div></section>";
      }).join("");
      return h;
    }
    /* このレッスンをどれだけやったか。索引を読まずに履歴側から数える。 */
    function lessonProgress(l, ix) {
      var done = 0, total = num(l.variantCount, 0);
      Object.keys(ix.byVariant).forEach(function (k) { if (k.indexOf(l.id + "-") === 0) done++; });
      return { done: Math.min(done, total), total: total,
               pct: total ? Math.min(100, Math.round((done / total) * 100)) : 0 };
    }
    function lessonRow(l, ix) {
      var p = lessonProgress(l, ix);
      var cat = catOf(l.categoryId);
      return '<button type="button" class="vq2-sp-lesson" data-act="sp-start-lesson" data-id="' + esc(l.id) + '">'
        + '<span class="vq2-sp-lesson-i tone-' + esc((cat && cat.groupId) || "daily") + '">'
        + (p.pct >= 100 ? U.icon("check") : U.icon("book")) + "</span>"
        + '<span class="vq2-sp-lesson-m">'
        + "<b>" + esc(l.title) + "</b>"
        + '<span class="vq2-sp-lesson-s">' + esc(catName(l.categoryId))
        + '<span class="vq2-sp-dot" aria-hidden="true"></span>全 ' + p.total + " 問"
        + '<span class="vq2-sp-dot" aria-hidden="true"></span>' + (l.estimatedMinutes || 7) + " 分</span>"
        + (arr(l.expressions).length
            ? '<span class="vq2-sp-chips">' + l.expressions.slice(0, 3).map(function (x) {
                return '<span class="vq2-sp-chip is-en">' + esc(x) + "</span>"; }).join("") + "</span>"
            : "")
        + '<span class="vq2-sp-meter is-sm"><span style="width:' + p.pct + '%"></span></span>'
        + "</span>"
        + '<span class="vq2-sp-lesson-p">' + (p.done ? p.done + " / " + p.total : "")
        + U.icon("chevronR") + "</span></button>";
    }

    /* ══════════════════════════════════════════════════════════
       履歴
       ══════════════════════════════════════════════════════════ */
    function historyHtml() {
      var list = SH.listSessions({ limit: 40 });
      var s7 = SH.summary({ days: 7 });
      var s30 = SH.summary({ days: 30 });
      var h = '<section class="vq2-sp-sec"><h2 class="vq2-sp-h2">この 7 日間</h2>'
        + weekHtml()
        + '<div class="vq2-sp-stats" style="margin-top:12px">'
        + stat("学習時間", (s7.minutes || 0) + " 分")
        + stat("解いた問題", (s7.exercises || 0))
        + stat("正答率", s7.accuracy === null || s7.accuracy === undefined ? "—" : s7.accuracy + "%")
        + stat("会話ターン", (s7.conversationTurns || 0))
        + stat("話した語数", (s7.wordsSpoken || 0))
        + (s7.pronunciationScore === null || s7.pronunciationScore === undefined
            ? "" : stat("発音", s7.pronunciationScore))
        + "</div></section>";

      h += '<section class="vq2-sp-sec"><h2 class="vq2-sp-h2">積み上げ</h2>'
        + '<div class="vq2-sp-stats">'
        + stat("覚えた表現", (s30.masteredVariants || 0))
        + stat("学んだ表現", (s30.learnedVariants || 0))
        + stat("30 日の時間", (s30.minutes || 0) + " 分")
        + "</div></section>";

      h += '<section class="vq2-sp-sec"><h2 class="vq2-sp-h2">これまでの学習</h2>';
      if (!list.length) h += U.empty({ title: "まだ記録がありません", body: "レッスンを 1 つ終えると、ここに出ます。" });
      else h += '<div class="vq2-sp-list">' + list.map(function (x) {
        var acc = isNum(x.exerciseCount) && x.exerciseCount
          ? Math.round((num(x.correctCount, 0) / x.exerciseCount) * 100) : null;
        return '<div class="vq2-sp-row is-static">'
          + '<span class="vq2-sp-row-i">' + U.icon(activityIconOf(x)) + "</span>"
          + '<span class="vq2-sp-row-m"><b>' + esc(activityLabelOf(x)) + "</b>"
          + '<span class="vq2-sp-row-s">' + esc(when(x.startedAt))
          + (isNum(x.exerciseCount) ? '<span class="vq2-sp-dot" aria-hidden="true"></span>'
              + x.correctCount + " / " + x.exerciseCount + " 問" : "")
          + (isNum(x.durationSeconds) ? '<span class="vq2-sp-dot" aria-hidden="true"></span>'
              + Math.max(1, Math.round(x.durationSeconds / 60)) + " 分" : "")
          + (x.status === "in_progress" ? '<span class="vq2-sp-dot" aria-hidden="true"></span>途中' : "")
          + "</span></span>"
          + (acc === null ? "" : '<span class="vq2-sp-row-p">' + acc + "%</span>")
          + "</div>";
      }).join("") + "</div>";
      h += "</section>";
      return h;
    }
    function stat(label, value) {
      return '<div class="vq2-sp-stat"><span class="vq2-sp-stat-v">' + esc(String(value)) + "</span>"
        + '<span class="vq2-sp-stat-l">' + esc(label) + "</span></div>";
    }
    function activityIconOf(x) {
      return { lesson: "book", listening: "audio", dictation: "pencil", speaking: "user",
               pronunciation: "user", shadowing: "audio", scenario_conversation: "user",
               free_conversation: "user", review: "refresh" }[str(x && x.activity)] || "book";
    }
    /* まだ手をつけていないレッスンを先に。全部やっていれば最初のものを出す。 */
    function nextLesson(lessons) {
      /* 呼ぶ場所によっては一覧を持っていない（結果の画面など）。
         その場合は、いま読み込んでいるレベルの一覧から拾う。 */
      if (!lessons) lessons = pickLessons(st.curriculum, st.prefs.level);
      if (!lessons || !lessons.length) return null;
      var ix = SH.indexHistory();
      for (var i = 0; i < lessons.length; i++) {
        var p = lessonProgress(lessons[i], ix);
        if (p.pct < 100) return Object.assign({}, lessons[i], { done: p.done > 0 });
      }
      return Object.assign({}, lessons[0], { done: true });
    }


    /* ── AI英会話 ────────────────────────────────────────────── */
    function talkHtml() {
      var caps = deviceCaps();
      var list = arr(st.scenarios);
      var h = "";
      if (!caps.canRecord || !caps.canTranscribe) {
        h += '<div class="vq2-sp-banner">' + U.icon("info")
          + "<div><b>いまは会話できません</b><p>"
          + esc(!caps.canRecord
              ? "この端末ではマイクを使えません。"
              : "聞き取り（ローカルAI）に接続できません。ローカルAIを起動すると使えます。")
          + "</p></div></div>";
      }
      h += '<section class="vq2-sp-sec">'
        + '<h2 class="vq2-sp-h2">シナリオ英会話</h2>'
        + '<p class="vq2-sp-lead">場面と役が決まっている会話です。'
        + "話の流れとミッションは用意してあり、あなたの発話はその場で聞き取ります。</p>";
      if (!list.length) {
        h += U.empty({ title: "このレベルの会話はまだありません",
          body: "会話シナリオが用意されているレベルを選んでください。",
          action: { label: "レベルを変える", action: "sp-level" } });
      } else {
        h += '<div class="vq2-sp-list">' + list.map(function (d) {
          var goals = arr(d.missionGoals).length;
          return '<button type="button" class="vq2-sp-row" data-act="sp-talk" data-id="' + esc(d.id) + '"'
            + (caps.canRecord && caps.canTranscribe ? "" : " disabled") + ">"
            + '<span class="vq2-sp-row-m"><b>' + esc(d.title) + "</b>"
            + '<span class="vq2-sp-row-s">' + esc(d.descriptionJa) + "</span>"
            + '<span class="vq2-sp-row-s">あなた: ' + esc(d.userRole) + "　相手: " + esc(d.aiRole)
            + "　" + goals + " つのミッション　" + (d.estimatedTurns || 5) + " ターン</span></span>"
            + '<span class="vq2-sp-row-p">' + U.icon("chevronR") + "</span></button>";
        }).join("") + "</div>";
      }
      h += "</section>";
      h += '<section class="vq2-sp-sec"><h2 class="vq2-sp-h2">自由英会話</h2>'
        + '<div class="vq2-sp-banner">' + U.icon("info")
        + "<div><b>まだ作っていません</b><p>"
        + "テーマを決めて自由に話す会話は、まだ用意できていません。"
        + "いまはシナリオ英会話をお使いください。</p></div></div></section>";
      return h;
    }

    /* ── 復習 ────────────────────────────────────────────────── */
    function reviewHtml() {
      var due = SH.listReview({ dueOnly: true });
      var all = SH.listReview({});
      var h = "";
      h += '<section class="vq2-sp-sec"><h2 class="vq2-sp-h2">今日の復習</h2>';
      if (!all.length) {
        h += U.empty({ title: "復習することはまだありません",
          body: "問題を解いて間違えたところが、ここに集まります。" });
      } else {
        h += '<p class="vq2-sp-lead">' + due.length + " 件が予定日です（全部で " + all.length + " 件）。</p>"
          + (due.length ? U.button({ label: "予定の復習を始める", size: "lg", variant: "primary", action: "sp-start-review" }) : "")
          + '<div class="vq2-sp-list" style="margin-top:14px">'
          + all.slice(0, 30).map(function (r) {
              return '<div class="vq2-sp-rv">'
                + '<span class="vq2-sp-rv-c">' + esc(reviewCatLabel(r.category)) + "</span>"
                + "<div><b>" + esc(r.originalContent) + "</b>"
                + (r.correctedContent ? '<div class="vq2-sp-rv-fix">→ ' + esc(r.correctedContent) + "</div>" : "")
                + (r.explanationJa ? '<div class="vq2-sp-rv-x">' + esc(r.explanationJa) + "</div>" : "")
                + "</div>"
                + '<span class="vq2-sp-rv-n">' + (r.repeatCount > 1 ? r.repeatCount + " 回" : "") + "</span>"
                + "</div>";
            }).join("")
          + "</div>";
      }
      h += "</section>";

      /* まだやっていない問題より、間違えた問題を先に出す練習 */
      h += '<section class="vq2-sp-sec"><h2 class="vq2-sp-h2">間違えた問題をもう一度</h2>'
        + '<p class="vq2-sp-lead">これまでに間違えた問題と、しばらく出していない問題から選びます。</p>'
        + U.button({ label: "10 問やる", action: "sp-train", id: "weak" })
        + "</section>";
      return h;
    }
    function reviewCatLabel(c) {
      return { grammar: "文法", vocabulary: "語彙", pronunciation: "発音",
               listening: "リスニング", expression: "表現" }[str(c)] || "その他";
    }

    /* ── 履歴 ────────────────────────────────────────────────── */

    /* ══════════════════════════════════════════════════════════
       学習セッション（問題を出す）
       表示と採点は既存の question-renderer / evaluator に任せる。
       ══════════════════════════════════════════════════════════ */
    function startRun(o2) {
      var caps = deviceCaps();
      var acts = arr(o2.activities).filter(function (a) { return SM.activityUsable(a, caps); });
      st.run = {
        kind: str(o2.kind) || "train",
        title: str(o2.title),
        lessonId: str(o2.lessonId) || "",
        activities: acts,
        want: num(o2.count, 10),
        questions: [], at: 0, answers: [], notes: [],
        loading: true, error: "",
        session: null, startedAt: Date.now(),
        binding: null, checked: false, lastResult: null
      };
      renderRun();

      var poolOpts = {
        level: st.prefs.level,
        categoryIds: o2.categoryIds || [],
        activityTypes: acts.length ? acts : undefined,
        lessonId: st.run.lessonId || undefined
      };
      SC.pool(poolOpts).then(function (pool) {
        if (!pool.length) {
          st.run.loading = false;
          st.run.error = "この条件で出せる問題がありませんでした。";
          renderRun();
          return;
        }
        var ix = SH.indexHistory();
        var byAtom = Object.create(null);
        Object.keys(ix.byAtom).forEach(function (k) { byAtom[k] = ix.byAtom[k][0]; });
        var sel = SS.select(pool, {
          targetCount: st.run.want,
          level: st.prefs.level,
          categoryIds: poolOpts.categoryIds,
          activityTypes: acts.length ? acts : undefined,
          historyByVariant: ix.byVariant,
          historyByAtom: byAtom
        });
        st.run.notes = sel.notes;
        return SC.hydrate(sel.items).then(function (hy) {
          var built = SC.toQuestions(hy, { level: st.prefs.level, speed: st.prefs.speed,
                                           voice: st.prefs.voiceId });
          st.run.questions = built.questions.map(function (q) { return QM.normalize(q); });
          st.run.dropped = built.dropped;
          st.run.loading = false;
          if (!st.run.questions.length) st.run.error = "問題を組み立てられませんでした。";
          else st.run.session = SH.startSession({
            activity: st.run.kind === "lesson" ? "lesson" : trainActivityOf(acts),
            level: st.prefs.level, lessonId: st.run.lessonId,
            categoryId: (poolOpts.categoryIds || [])[0] || ""
          });
          renderRun();
        });
      }).catch(function (e) {
        st.run.loading = false;
        st.run.error = "問題を用意できませんでした（" + (e && e.message) + "）。";
        renderRun();
      });
    }

    function renderRun() {
      applyPlayerPrefs();
      var r = st.run;
      if (!r) { render(); return; }
      if (r.binding) { try { r.binding.destroy(); } catch (e) {} r.binding = null; }

      if (r.loading) {
        app.root.innerHTML = runShell('<div class="vq2-sp-loading">' + (U.skeleton ? U.skeleton({ rows: 3 }) : "問題を選んでいます…") + "</div>");
        return;
      }
      if (r.error) {
        app.root.innerHTML = runShell(U.empty({ title: "問題を出せませんでした", body: r.error,
          action: { label: "戻る", action: "sp-quit" } }));
          return;
      }
      if (r.at >= r.questions.length) { app.root.innerHTML = runShell(resultHtml()); renderFoot(); return; }

      var q = r.questions[r.at];
      var val = r.answers[r.at] ? r.answers[r.at].value : null;
      var opt = rendererOpts(q, r);
      app.root.innerHTML = runShell(
        '<div class="vq2-sp-qhead">'
        + '<span class="vq2-sp-qa">' + U.icon(activityIcon(q))
        + esc(SM.activityLabel(q.speak ? q.speak.activityType : "")) + "</span>"
        + '<span class="vq2-sp-qn">' + (r.at + 1) + " / " + r.questions.length + "</span>"
        + "</div>"
        + (r.at === 0 && r.notes.length
            ? '<div class="vq2-sp-qnote">' + U.icon("info") + esc(r.notes[0]) + "</div>" : "")
        /* **問題文はここで描く。** QR.html は「答える場所」しか作らないので、
           これを呼ばないと穴埋めや和訳の本文が丸ごと出ない（実際そうなっていた）。
           やることの案内（instruction）もこの中に入る。 */
        + '<div class="vq2-sp-stem">' + QR.promptHtml(q, opt) + "</div>"
        /* どの教材から出た問題かを DOM にも残す。
           「同じ問題が 2 回出ていないか」を後から確かめられるようにする。 */
        + '<div class="vq2-sp-q" data-sp-answer data-sp-variant="'
        + esc(q.speak ? q.speak.variantId : q.id) + '"></div>'
        + (r.checked ? feedbackHtml(q, r.lastResult) : "")
      );
      var box = app.root.querySelector("[data-sp-answer]");
      box.innerHTML = QR.html(q, val, opt);
      r.binding = QR.bind(box, q, val, Object.assign({}, opt, {
        onChange: function (v) {
          r.answers[r.at] = { questionId: q.id, value: v };
          renderFoot();
        },
        onLocalState: function (p) {
          var a = r.answers[r.at] || (r.answers[r.at] = { questionId: q.id, value: null });
          Object.keys(p).forEach(function (k) { a[k] = p[k]; });
        }
      }));
      renderFoot();
    }
    function runShell(inner) {
      var r = st.run;
      return '<div class="vq2-sp is-run">'
        + '<header class="vq2-sp-runtop">'
        + U.button({ icon: "close", size: "sm", variant: "quiet", action: "sp-quit", iconOnly: true, aria: "やめる" })
        + stepsHtml()
        + '<span class="vq2-sp-runtitle">' + esc(r.title || "学習") + "</span>"
        + '<span class="vq2-top-sp"></span>'
        + U.button({ icon: "settings", size: "sm", variant: "quiet", action: "sp-prefs", iconOnly: true, aria: "設定" })
        + "</header>"
        + '<div class="vq2-sp-body">' + inner + "</div>"
        + '<footer class="vq2-sp-foot" data-sp-foot></footer>'
        + "</div>";
    }
    /* 進み具合。**何問中の何問目か**が一目で分かるよう、点で出す。
       問題数が多いときは点が潰れるので、帯に切り替える。 */
    function stepsHtml() {
      var r = st.run;
      var n = arr(r.questions).length || arr(r.items).length;
      if (!n) return '<span class="vq2-sp-steps"></span>';
      if (n > 14) {
        var pct = Math.round((r.at / n) * 100);
        return '<span class="vq2-sp-steps"><span class="vq2-sp-meter" role="progressbar"'
          + ' aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100"'
          + ' aria-label="進み具合"><span style="width:' + pct + '%"></span></span></span>';
      }
      var out = "";
      for (var i = 0; i < n; i++) {
        var cls = i < r.at ? " is-done" : (i === r.at ? " is-now" : "");
        var a = arr(r.answers)[i];
        if (i < r.at && a && a.answered && a.correct === false) cls += " is-ng";
        out += '<span class="vq2-sp-step' + cls + '"></span>';
      }
      return '<span class="vq2-sp-steps" role="progressbar" aria-valuenow="' + r.at
        + '" aria-valuemin="0" aria-valuemax="' + n + '" aria-label="進み具合">' + out + "</span>";
    }
    function activityIcon(q) {
      var a = q && q.speak ? q.speak.activityType : "";
      return { listening_choice: "audio", listening_comprehension: "audio", dictation: "pencil",
               audio_fill_blank: "blank", text_fill_blank: "blank", sentence_reorder: "sort",
               translation_to_english: "pencil", translation_to_japanese: "pencil",
               error_correction: "wrench", best_expression: "star", flashcard: "layers" }[a] || "book";
    }
    function renderFoot() {
      var foot = app.root.querySelector("[data-sp-foot]");
      if (!foot) return;
      var r = st.run;
      if (r.at >= r.questions.length) {
        foot.innerHTML = U.button({ label: "終わる", size: "lg", variant: "primary", action: "sp-quit" });
        return;
      }
      var q = r.questions[r.at];
      var answered = r.answers[r.at] && !EV.isUnanswered(q, r.answers[r.at].value);
      var nextLabel = r.at + 1 >= r.questions.length ? "結果を見る" : "次へ";
      /* カードは自分で「覚えた／まだ」を付ける形式。**答え合わせは要らない**。
         合っている／間違っているを機械が言うのもおかしいので、そのまま次へ進む。 */
      if (selfMarked(q)) {
        foot.innerHTML = U.button({ label: nextLabel, size: "lg", variant: "primary", action: "sp-next", disabled: !answered });
        return;
      }
      foot.innerHTML = r.checked
        ? U.button({ label: nextLabel, size: "lg", variant: "primary", action: "sp-next" })
        : U.button({ label: "答え合わせ", size: "lg", variant: "primary", action: "sp-check", disabled: !answered });
    }
    /* 自分で印を付ける形式か（カード）。 */
    function selfMarked(q) { return q && q.engine === "flashcard"; }
    function rendererOpts(q, r) {
      var a = r.answers[r.at] || {};
      return {
        mobile: app.isMobile(),
        locked: r.checked,
        replayCount: a.replayCount || 0,
        preset: { audio: { voice: st.prefs.voiceId, speed: st.prefs.speed } },
        showRubric: false
      };
    }

    /* 採点して記録する。画面の出し方は呼び出し側が決める
       （カードは答え合わせを見せず、そのまま次へ進む）。 */
    function record() {
      var r = st.run;
      var q = r.questions[r.at];
      var a = r.answers[r.at] || { questionId: q.id, value: null };
      var res = EV.evaluate(q, a.value);
      a.score = res.score; a.maxScore = res.maxScore;
      a.correct = res.score >= res.maxScore && res.maxScore > 0;
      a.type = q.type;
      a.answered = true;
      a.selfMarked = selfMarked(q);
      r.answers[r.at] = a;
      r.lastResult = res;

      /* 履歴へ書く（次に出すかどうかがここで決まる） */
      if (q.speak) {
        SH.record({
          exerciseVariantId: q.speak.variantId, contentAtomId: q.speak.atomId,
          familyId: q.speak.familyId, activityType: q.speak.activityType,
          correct: a.correct, answered: true,
          score: res.maxScore ? Math.round((res.score / res.maxScore) * 100) : null
        });
        /* 間違えたら復習候補にする（重要度は履歴側が決める）。
           カードで「まだ」を押したときは、覚えていない語として入れる
           （自分の書いた答えは無いので、表と裏をそのまま残す）。 */
        if (!a.correct) {
          var card = selfMarked(q);
          SH.addReviewCandidates([{
            category: card ? "vocabulary" : reviewCategoryOf(q.speak.activityType),
            originalContent: card ? str(q.card && q.card.front) || str(q.prompt)
                                  : (myAnswerText(q, a.value) || "（未回答）"),
            correctedContent: card ? str(q.card && q.card.back)
                                   : (QR.correctAnswerText ? QR.correctAnswerText(q) : ""),
            explanationJa: str(q.explanation),
            contentAtomId: q.speak.atomId, familyId: q.speak.familyId,
            grammarTags: arr(q.tags),
            recommendedActivityTypes: [q.speak.activityType]
          }], { sessionId: r.session && r.session.id });
        }
      }
    }
    function check() {
      record();
      st.run.checked = true;
      renderRun();
    }
    function myAnswerText(q, v) {
      try { return QR.myAnswerText ? QR.myAnswerText(q, v) : (v && v.text) || ""; }
      catch (e) { return (v && v.text) || ""; }
    }
    function reviewCategoryOf(act) {
      if (act === "listening_choice" || act === "listening_comprehension" || act === "dictation") return "listening";
      if (act === "translation_to_english" || act === "sentence_reorder") return "grammar";
      if (act === "flashcard" || act === "translation_to_japanese") return "vocabulary";
      if (act === "best_expression") return "expression";
      if (act === "pronunciation_practice" || act === "shadowing" || act === "speaking_repeat") return "pronunciation";
      return "grammar";
    }
    function feedbackHtml(q, res) {
      var ok = res && res.maxScore > 0 && res.score >= res.maxScore;
      var part = res && res.maxScore > 0 && res.score > 0 && !ok;
      var correct = "";
      try { correct = QR.correctAnswerText ? QR.correctAnswerText(q) : ""; } catch (e) {}
      return '<div class="vq2-sp-fb' + (ok ? " is-ok" : (part ? " is-part" : " is-ng")) + '" role="status">'
        + '<div class="vq2-sp-fb-h">' + U.icon(ok ? "check" : (part ? "info" : "error"))
        + "<b>" + (ok ? "正解です" : (part ? "おしい（一部正解）" : "ちがいます")) + "</b>"
        + (res && res.maxScore > 1
            ? '<span class="vq2-sp-fb-p">' + res.score + " / " + res.maxScore + "</span>" : "")
        + "</div>"
        + (ok ? "" : '<div class="vq2-sp-fb-a"><span>正しい答え</span><b lang="en">' + esc(correct) + "</b></div>")
        + (q.explanation ? '<div class="vq2-sp-fb-x">' + esc(q.explanation) + "</div>" : "")
        + "</div>";
    }

    function resultHtml() {
      var r = st.run;
      var total = r.questions.length;
      var correct = r.answers.filter(function (a) { return a && a.correct; }).length;
      var secs = Math.round((Date.now() - r.startedAt) / 1000);
      if (!r.saved) { r.saved = true; saveToLearning(r, correct, secs); }
      var pct = total ? Math.round((correct / total) * 100) : 0;
      var wrong = [];
      r.answers.forEach(function (a, i) {
        if (a && !a.correct && r.questions[i]) wrong.push(r.questions[i]);
      });
      var acts = {};
      r.questions.forEach(function (q) {
        var k = q.speak ? q.speak.activityType : "";
        if (k) acts[k] = (acts[k] || 0) + 1;
      });

      var h = '<div class="vq2-sp-done">'
        + '<div class="vq2-sp-done-ring">' + doneRing(pct) + "</div>"
        + '<div class="vq2-sp-done-n">' + correct + " / " + total + "</div>"
        + '<div class="vq2-sp-done-s">' + Math.max(1, Math.round(secs / 60)) + " 分・"
        + Object.keys(acts).length + " 種類の練習</div>"
        + '<div class="vq2-sp-chips is-center">'
        + Object.keys(acts).map(function (k) {
            return '<span class="vq2-sp-chip">' + esc(SM.activityLabel(k)) + " " + acts[k] + "</span>";
          }).join("")
        + "</div>";
      if (r.notes.length) h += '<div class="vq2-sp-note">' + r.notes.map(esc).join("<br>") + "</div>";

      /* 練習の種類ごとの手ごたえ。**数えられたものだけを出す。**
         発音・流暢さ・文法は「話す練習」でしか測れないので、
         ここで空欄を並べたり、それらしい数字を作ったりしない。 */
      var per = {};
      r.questions.forEach(function (q, i) {
        var k = q.speak ? q.speak.activityType : "";
        if (!k) return;
        var a = r.answers[i];
        if (!per[k]) per[k] = { n: 0, ok: 0 };
        per[k].n++;
        if (a && a.correct) per[k].ok++;
      });
      var perList = Object.keys(per).map(function (k) {
        return { id: k, label: SM.activityLabel(k), n: per[k].n, ok: per[k].ok,
                 pct: Math.round((per[k].ok / per[k].n) * 100) };
      }).sort(function (a, b) { return b.pct - a.pct; });

      if (perList.length > 1) {
        h += '<section class="vq2-sp-sec"><h2 class="vq2-sp-h2">練習の種類ごと</h2>'
          + '<div class="vq2-sp-perlist">'
          + perList.map(function (x) {
              return '<div class="vq2-sp-per"><span class="vq2-sp-per-l">' + esc(x.label) + "</span>"
                + '<span class="vq2-sp-meter is-sm"><span style="width:' + x.pct + '%"></span></span>'
                + '<span class="vq2-sp-per-n">' + x.ok + " / " + x.n + "</span></div>";
            }).join("")
          + "</div></section>";
      }

      /* 良かったところ・次に直すところ。
         **どちらも、いま数えた結果からしか書かない。**（作文しない） */
      var good = perList.filter(function (x) { return x.n >= 2 && x.pct >= 80; });
      var weak = perList.filter(function (x) { return x.n >= 2 && x.pct < 60; });
      if (good.length || weak.length) {
        h += '<section class="vq2-sp-sec"><div class="vq2-sp-gw">';
        if (good.length)
          h += '<div class="vq2-sp-gw-i is-good"><b>できていたところ</b><span>'
            + esc(good.map(function (x) { return x.label + "（" + x.pct + "%）"; }).join("・")) + "</span></div>";
        if (weak.length)
          h += '<div class="vq2-sp-gw-i is-weak"><b>次に直すところ</b><span>'
            + esc(weak.map(function (x) { return x.label + "（" + x.pct + "%）"; }).join("・")) + "</span></div>";
        h += "</div></section>";
      }

      if (wrong.length) {
        h += '<section class="vq2-sp-sec"><h2 class="vq2-sp-h2">間違えたところ</h2><div class="vq2-sp-list">'
          + wrong.map(function (q) {
              var c = "";
              try { c = QR.correctAnswerText ? QR.correctAnswerText(q) : ""; } catch (e) {}
              return '<div class="vq2-sp-rv"><span class="vq2-sp-rv-c">'
                + esc(SM.activityLabel(q.speak ? q.speak.activityType : "")) + "</span>"
                + '<div><b lang="en">' + esc(c) + "</b>"
                + (q.explanation ? '<div class="vq2-sp-rv-x">' + esc(q.explanation) + "</div>" : "")
                + "</div></div>";
            }).join("")
          + '</div><p class="vq2-sp-lead" style="margin-top:10px">これらは復習に入れました。</p></section>';
      } else {
        h += '<div class="vq2-sp-note">全問正解です。</div>';
      }

      /* 次に何をするか。**実際に押せるものだけを出す。** */
      var nx = [];
      if (wrong.length) nx.push({ label: "間違えた " + wrong.length + " 問を復習する",
                                  icon: "refresh", act: "sp-start-review", primary: true });
      var nl = nextLesson();
      if (nl) nx.push({ label: "次のレッスン「" + nl.title + "」へ", icon: "chevronR",
                        act: "sp-start-lesson", id: nl.id, primary: !wrong.length });
      if (nx.length) {
        h += '<section class="vq2-sp-sec"><h2 class="vq2-sp-h2">次におすすめ</h2>'
          + '<div class="vq2-sp-nextacts">'
          + nx.map(function (x) {
              return U.button({ label: x.label, icon: x.icon, action: x.act, id: x.id,
                                variant: x.primary ? "primary" : "quiet" });
            }).join("")
          + "</div></section>";
      }
      return h + "</div>";
    }
    /* 終わりの輪。数字も中に出す。 */
    function doneRing(pct) {
      var r = 44, c = 2 * Math.PI * r;
      return '<svg viewBox="0 0 100 100" class="vq2-sp-ring is-lg" role="img" aria-label="正答率 ' + pct + '%">'
        + '<circle class="vq2-sp-ring-bg" cx="50" cy="50" r="' + r + '"></circle>'
        + '<circle class="vq2-sp-ring-fg" cx="50" cy="50" r="' + r + '"'
        + ' stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + (c * (1 - pct / 100)).toFixed(1) + '"></circle>'
        + '<text class="vq2-sp-ring-n" x="50" y="54">' + pct + "</text>"
        + '<text class="vq2-sp-ring-u" x="50" y="68">%</text></svg>';
    }

    function saveToLearning(r, correct, secs) {
      try {
        if (r.session) SH.finishSession(r.session.id, {
          exerciseCount: r.questions.length, correctCount: correct,
          durationSeconds: secs,
          listeningScore: scoreOf(r, ["listening_choice", "listening_comprehension", "dictation"])
        });
        if (!LN || !LN.recordResult) return;
        LN.recordResult({
          sessionId: (r.session && r.session.id) || ("sp_" + Date.now()),
          source: "vocabuspeak",
          mode: "normal",
          startedAt: new Date(r.startedAt).toISOString(),
          finishedAt: new Date().toISOString(),
          subject: "english",
          unit: r.title,
          items: r.answers.map(function (a, i) {
            var q = r.questions[i];
            return { questionId: q ? q.id : "q" + i, type: q ? q.type : "", answered: !!(a && a.answered),
                     correct: !!(a && a.correct), score: a ? a.score : 0,
                     maxScore: a ? a.maxScore : (q ? q.points : 1), timeMs: 0 };
          }),
          questionsSnapshot: r.questions.map(function (q) {
            return { id: q.id, type: q.type, subject: "english", unit: r.title,
                     topic: q.speak ? q.speak.categoryId : "" };
          })
        }, { source: "vocabuspeak", subject: "english", unit: r.title });
      } catch (e) { /* 記録に失敗しても学習は止めない */ }
    }
    function scoreOf(r, acts) {
      var rows = r.answers.filter(function (a, i) {
        var q = r.questions[i];
        return a && q && q.speak && acts.indexOf(q.speak.activityType) >= 0;
      });
      if (!rows.length) return undefined;
      var got = rows.reduce(function (x, a) { return x + num(a.score, 0); }, 0);
      var max = rows.reduce(function (x, a) { return x + num(a.maxScore, 0); }, 0);
      return max ? Math.round((got / max) * 100) : undefined;
    }

    /* ══════════════════════════════════════════════════════════
       結線は **1 回だけ**。

       U.on は呼ぶたびに聞き手を足すので、描き直すたびに配線すると
       1 回押しただけで何度も動く。音が何重にも鳴って割れていたのはこれ。
       だから入口で 1 回だけ張り、いまどの画面かで振り分ける。
       ══════════════════════════════════════════════════════════ */
    function wireOnce() {
      U.on(app.root, "click", "[data-sp-tab]", function (e, t) {
        if (st.run) return;
        st.tab = t.getAttribute("data-sp-tab");
        render();
      });
      U.on(app.root, "click", "[data-act]", function (e, t) {
        var act = t.getAttribute("data-act");
        var id = t.getAttribute("data-id");
        var mode = st.run ? st.run.kind : "home";

        /* どの画面でも同じもの */
        if (act === "sp-close") { app.close("user"); return; }
        if (act === "sp-quit") { quitRun(); return; }
        /* 設定は **レッスン中でも開ける**。
           字幕や速さを変えたいのは、たいてい聞いている最中だから。 */
        if (act === "sp-prefs") return openPrefs();
        /* 録音をやめる（保存も採点もしない）。止めると採点へ進むので、別に要る。 */
        if (act === "sp-rec-cancel") return cancelRecording();

        if (mode === "speak") {
          if (act === "sp-model") return playModel();
          if (act === "sp-mine") return playMine();
          if (act === "sp-record") return startRecording();
          if (act === "sp-stop") return stopRecording();
          if (act === "sp-speak-next") return speakNext();
          return;
        }
        if (mode === "talk") {
          if (act === "sp-talk-rec") return talkRecord();
          if (act === "sp-stop") return talkStop();
          if (act === "sp-replay") return speakLine();
          if (act === "sp-ja") { st.run.showJa = !st.run.showJa; renderTalk(); return; }
          return;
        }
        if (st.run) {                    /* 問題を解いている画面 */
          if (act === "sp-check") return check();
          if (act === "sp-next") return nextQuestion();
          return;
        }

        /* ホームと一覧 */
        if (act === "sp-reload") { SC.clearCache(); load(); return; }
        if (act === "sp-tab") { st.tab = id; render(); return; }
        if (act === "sp-level") return openLevel();
        if (act === "sp-start-lesson") return startLesson(id);
        if (act === "sp-train") return startTraining(id);
        if (act === "sp-start-review") {
          return startRun({ kind: "review", title: "復習", count: 10,
                            activities: SM.usableActivities(deviceCaps()) });
        }
        if (act === "sp-talk") return startTalk(id);
        if (act === "sp-resume") { st.tab = "lesson"; render(); return; }
      });
    }

    /* 学習中の画面から抜ける。どの流れから来ても同じ後始末をする。 */
    function quitRun() {
      var r = st.run;
      if (r) {
        if (r.timer) { clearInterval(r.timer); r.timer = null; }
        if (r.handle) { try { r.handle.cancel(); } catch (e) {} r.handle = null; }
        if (r.binding) { try { r.binding.destroy(); } catch (e) {} r.binding = null; }
        var unfinished = r.kind === "talk" ? (r.sess && r.sess.state === "continue")
                       : r.kind === "speak" ? (r.at < arr(r.items).length)
                       : (r.at < arr(r.questions).length);
        if (r.session && unfinished) SH.updateSession(r.session.id, { status: "in_progress" });
      }
      stopAudio();
      st.run = null;
      st.summary = SH.summary({ days: 1 });
      render();
    }
    function nextQuestion() {
      var r = st.run;
      if (!r.checked && selfMarked(r.questions[r.at])) record();
      r.at++; r.checked = false; r.lastResult = null;
      renderRun();
    }
    function speakNext() {
      var r = st.run;
      r.at++; r.take = null; r.phase = "ready"; r.modelSeconds = null;
      renderSpeak();
    }
    function startLesson(id) {
      var l = arr(st.curriculum && st.curriculum.lessons).filter(function (x) { return x.id === id; })[0];
      if (!l) return;
      startRun({ kind: "lesson", title: l.title, lessonId: l.id,
                 categoryIds: [l.categoryId], count: Math.min(10, num(l.variantCount, 10)),
                 activities: SM.usableActivities(deviceCaps()) });
    }
    function startTraining(id) {
      if (id === "weak") {
        startRun({ kind: "review", title: "間違えた問題", count: 10,
                   activities: SM.usableActivities(deviceCaps()) });
        return;
      }
      var tr = TRAINING.filter(function (x) { return x.id === id; })[0];
      if (!tr) return;
      /* 声を出す練習は、答える場所が「録音」なので専用の画面を使う。 */
      if (tr.activities.some(function (a) { return (SM.activity(a) || {}).needsVoice; })) {
        startSpeaking({ title: tr.label, activities: tr.activities,
                        shadowing: tr.id === "shadowing", count: 6 });
        return;
      }
      startRun({ kind: "train", title: tr.label, count: 10, activities: tr.activities });
    }

    /* ══════════════════════════════════════════════════════════
       話す練習（リピート・発音練習・シャドーイング）

       ここだけは question-renderer を使わない。
       答える場所が「入力欄」ではなく「録音」だからで、
       教材（Variant）・履歴・復習のしくみは他と同じものを使う。

       流れ: 見本を聞く → 話す → 聞き取り → 採点 → 直すところ → もう一度
       ══════════════════════════════════════════════════════════ */
    function startSpeaking(o2) {
      st.run = {
        kind: "speak",
        title: str(o2.title) || "スピーキング",
        shadowing: !!o2.shadowing,
        activities: arr(o2.activities),
        want: num(o2.count, 6),
        items: [], at: 0, results: [],
        loading: true, error: "",
        session: null, startedAt: Date.now(),
        phase: "ready",          /* ready / recording / working / done */
        take: null, handle: null, timer: null,
        modelSeconds: null
      };
      renderSpeak();

      SC.pool({ level: st.prefs.level, activityTypes: st.run.activities }).then(function (pool) {
        if (!pool.length) {
          /* 声を出す用の Variant が索引に無いときは、同じレベルの英文から作る。
             （索引には published のものだけを入れてあるため） */
          return SC.pool({ level: st.prefs.level }).then(function (all) {
            return { pool: all, fallback: true };
          });
        }
        return { pool: pool, fallback: false };
      }).then(function (p) {
        var ix = SH.indexHistory();
        var sel = SS.select(p.pool, {
          targetCount: st.run.want, level: st.prefs.level,
          historyByVariant: ix.byVariant, historyByAtom: {}
        });
        return SC.hydrate(sel.items).then(function (hy) {
          st.run.items = hy.items.map(function (it) {
            return { atom: it.atom, variant: it.variant,
                     target: str(it.atom.english), japanese: str(it.atom.japanese) };
          });
          st.run.loading = false;
          if (!st.run.items.length) st.run.error = "話す練習に使える英文が見つかりませんでした。";
          else st.run.session = SH.startSession({
            activity: st.run.shadowing ? "shadowing" : "speaking",
            level: st.prefs.level
          });
          renderSpeak();
        });
      }).catch(function (e) {
        st.run.loading = false;
        st.run.error = "英文を用意できませんでした（" + (e && e.message) + "）。";
        renderSpeak();
      });
    }

    function currentSpeak() { var r = st.run; return r && r.items[r.at]; }

    function renderSpeak() {
      applyPlayerPrefs();
      var r = st.run;
      if (!r) { render(); return; }
      if (r.loading) { app.root.innerHTML = speakShell('<div class="vq2-sp-loading">'
        + (U.skeleton ? U.skeleton({ rows: 3 }) : "英文を選んでいます…") + "</div>"); renderSpeakFoot(); return; }
      if (r.error) {
        app.root.innerHTML = speakShell(U.empty({ title: "始められませんでした", body: r.error,
          action: { label: "戻る", action: "sp-quit" } }));
          return;
      }
      if (r.at >= r.items.length) { app.root.innerHTML = speakShell(speakDoneHtml()); renderSpeakFoot(); return; }

      var it = currentSpeak();
      var res = r.results[r.at] || null;
      var h = "";
      h += '<div class="vq2-sp-qhead">'
        + '<span class="vq2-sp-qn">' + (r.at + 1) + " / " + r.items.length + "</span>"
        + '<span class="vq2-sp-qa">' + esc(r.shadowing ? "シャドーイング" : "発音練習") + "</span>"
        + '<span class="vq2-sp-beta">ベータ</span>'
        + "</div>";
      h += '<div class="vq2-sp-say">'
        + '<div class="vq2-sp-say-t" lang="en">' + esc(it.target) + "</div>"
        + (st.prefs.showJapanese && it.japanese
            ? '<div class="vq2-sp-say-j">' + esc(it.japanese) + "</div>" : "")
        + '<div class="vq2-sp-say-a">'
        + U.button({ label: "見本を聞く", icon: "audio", size: "sm", variant: "quiet", action: "sp-model" })
        + (r.take ? U.button({ label: "自分の声", icon: "play", size: "sm", variant: "quiet", action: "sp-mine" }) : "")
        + "</div></div>";

      if (r.phase === "recording") {
        h += '<div class="vq2-sp-rec is-on" role="status" aria-live="polite">'
          + '<span class="vq2-sp-rec-dot" aria-hidden="true"></span>'
          + '<span class="vq2-sp-rec-t" data-sp-rectime>0.0 秒</span>'
          + '<span class="vq2-sp-rec-h">録音しています。言い終わったら止めてください。</span>'
          /* 言い間違えたときの逃げ道。止めると採点へ進むので、やめる口を別に置く。 */
          + U.button({ label: "やめる", size: "sm", variant: "quiet", action: "sp-rec-cancel" })
          + "</div>";
      } else if (r.phase === "working") {
        h += '<div class="vq2-sp-rec" role="status" aria-live="polite">'
          + '<span class="vq2-spin" aria-hidden="true"></span>'
          + '<span class="vq2-sp-rec-h">聞き取っています…</span></div>';
      }
      if (res) h += speakResultHtml(res);
      app.root.innerHTML = speakShell(h);
      renderSpeakFoot();
      if (r.phase === "recording") tickRec();
    }
    function speakShell(inner) {
      var r = st.run;
      return '<div class="vq2-sp is-run">'
        + '<header class="vq2-sp-runtop">'
        + U.button({ icon: "close", size: "sm", variant: "quiet", action: "sp-quit", iconOnly: true, aria: "やめる" })
        + stepsHtml()
        + '<span class="vq2-sp-runtitle">' + esc(r.title) + "</span>"
        + '<span class="vq2-top-sp"></span>'
        + U.button({ icon: "settings", size: "sm", variant: "quiet", action: "sp-prefs", iconOnly: true, aria: "設定" })
        + "</header>"
        + '<div class="vq2-sp-body">' + inner + "</div>"
        + '<footer class="vq2-sp-foot" data-sp-foot></footer></div>';
    }
    function renderSpeakFoot() {
      var foot = app.root.querySelector("[data-sp-foot]");
      if (!foot) return;
      var r = st.run;
      if (r.at >= r.items.length) { foot.innerHTML = U.button({ label: "終わる", size: "lg", variant: "primary", action: "sp-quit" }); return; }
      if (r.phase === "recording") {
        foot.innerHTML = U.button({ label: "止める", icon: "stop", size: "lg", variant: "danger", action: "sp-stop" });
        return;
      }
      if (r.phase === "working") { foot.innerHTML = U.button({ label: "聞き取っています…", size: "lg", disabled: true }); return; }
      var res = r.results[r.at];
      var big = !PP || PP.get("speakBigMic") !== false;
      /* 話す練習で **いちばん押す場所**。設定で普通の大きさにも戻せる。
         丸く大きくするのは、指で押しやすくするため（片手で持って話す）。 */
      var micBtn = big
        ? '<button type="button" class="vq2-sp-mic" data-act="sp-record" aria-label="'
          + (res ? "もう一度話す" : "話す") + '">' + U.icon("audio")
          + '<span class="vq2-sp-mic-l">' + (res ? "もう一度" : "話す") + "</span></button>"
        : U.button({ label: res ? "もう一度話す" : "話す", icon: "audio", size: "lg",
                     variant: res ? "quiet" : "primary", action: "sp-record" });
      foot.innerHTML = res
        ? '<div class="vq2-sp-foot-r">' + micBtn
          + U.button({ label: r.at + 1 >= r.items.length ? "結果を見る" : "次へ", size: "lg",
                       variant: "primary", action: "sp-speak-next" }) + "</div>"
        : '<div class="vq2-sp-foot-r is-center">' + micBtn + "</div>";
    }
    function tickRec() {
      var r = st.run;
      if (r.timer) clearInterval(r.timer);
      r.timer = setInterval(function () {
        var el = app.root.querySelector("[data-sp-rectime]");
        if (!el || !r.handle) { clearInterval(r.timer); r.timer = null; return; }
        el.textContent = (r.handle.ms() / 1000).toFixed(1) + " 秒";
      }, 100);
    }

    function speakResultHtml(res) {
      if (!res.scored) {
        return '<div class="vq2-sp-fb is-ng"><div class="vq2-sp-fb-h">' + U.icon("info")
          + "<b>点をつけませんでした</b></div>"
          + '<div class="vq2-sp-fb-x">' + esc(res.reason || "うまく聞き取れませんでした。") + "</div></div>";
      }
      var h = '<div class="vq2-sp-score">'
        + '<div class="vq2-sp-score-n">' + res.overall + "</div>"
        + '<div class="vq2-sp-score-b">'
        + bar("伝わりやすさ", res.intelligibility)
        + (res.clarity === null ? "" : bar("はっきりさ", res.clarity))
        + bar("流暢さ", res.fluency)
        + (isNum(res.timing) ? bar("出だし", res.timing) : "")
        + (isNum(res.pace) ? bar("速さの合い方", res.pace) : "")
        + "</div></div>";
      h += '<div class="vq2-sp-heard"><span>聞こえた文</span><b lang="en">' + esc(res.recognized) + "</b></div>";
      if (res.wordResults.length) {
        h += '<div class="vq2-sp-words" lang="en">'
          + res.wordResults.map(function (w) {
              return '<span class="vq2-sp-w' + (w.ok ? " is-ok" : " is-ng") + '"'
                + (w.issue ? ' title="' + esc(w.issue + (w.said ? "（" + w.said + "）" : "")) + '"' : "")
                + ">" + esc(w.word) + "</span>";
            }).join("")
          + "</div>";
      }
      h += '<div class="vq2-sp-advice">' + res.advice.map(function (a) {
        return "<div>" + esc(a) + "</div>"; }).join("") + "</div>";
      h += '<div class="vq2-sp-note">' + esc(res.phonemeNote) + "</div>";
      return h;
    }
    function bar(label, v) {
      return '<div class="vq2-sp-bar"><span class="vq2-sp-bar-l">' + esc(label) + "</span>"
        + '<span class="vq2-sp-bar-t" role="progressbar" aria-valuenow="' + v
        + '" aria-valuemin="0" aria-valuemax="100" aria-label="' + esc(label) + '">'
        + '<span style="width:' + Math.max(0, Math.min(100, v)) + '%"></span></span>'
        + '<span class="vq2-sp-bar-n">' + v + "</span></div>";
    }

    function startRecording() {
      var r = st.run;
      if (!VQ2.stt) { app.toast("録音の部品が読み込まれていません。", "warning"); return; }
      stopAudio();
      VQ2.stt.start({}).then(function (h) {
        if (!h.ok) { app.toast(h.reason || "録音を始められませんでした。", "warning"); return; }
        r.handle = h; r.phase = "recording";
        renderSpeak();
      });
    }
    /* 録音をやめる。**採点へ進まない・音声も残さない。**
       言い間違えたときに「止める」しか無いと、必ず一度採点されてしまう。 */
    function cancelRecording() {
      var r = st.run;
      if (!r || !r.handle) return;
      try { r.handle.cancel(); } catch (e) {}
      r.handle = null;
      if (r.timer) { clearInterval(r.timer); r.timer = null; }
      r.phase = "ready";
      renderSpeak();
      app.toast("録音をやめました。点はつけていません。", "info");
    }

    function stopRecording() {
      var r = st.run;
      if (!r.handle) return;
      r.phase = "working";
      renderSpeak();
      r.handle.stop().then(function (take) {
        r.handle = null;
        if (r.timer) { clearInterval(r.timer); r.timer = null; }
        if (!take.ok) { r.phase = "ready"; renderSpeak(); app.toast(take.reason || "録音できませんでした。", "warning"); return; }
        r.take = take;
        return VQ2.stt.transcribeTake(take).then(function (stt) {
          var it = currentSpeak();
          var res = r.shadowing
            ? VQ2.pronounce.evaluateShadowing(it.target, stt, { modelSeconds: r.modelSeconds, delayMs: 0 })
            : VQ2.pronounce.evaluate(it.target, stt);
          r.results[r.at] = res;
          r.phase = "ready";
          renderSpeak();
          recordSpeak(it, res, take);
        });
      }).catch(function () {
        r.phase = "ready"; renderSpeak();
        app.toast("聞き取りに失敗しました。", "warning");
      });
    }

    /* 結果を履歴へ。**点をつけられなかった回は、間違いとして数えない。** */
    function recordSpeak(it, res, take) {
      var r = st.run;
      if (!res.scored) return;
      var ok = res.overall >= 70;
      SH.record({
        exerciseVariantId: str(it.variant.id), contentAtomId: str(it.atom.id),
        familyId: str(it.atom.familyId),
        activityType: r.shadowing ? "shadowing" : "pronunciation_practice",
        correct: ok, answered: true, score: res.overall
      });
      if (!ok) {
        SH.addReviewCandidates([{
          category: "pronunciation", severity: res.overall < 50 ? "high" : "medium",
          originalContent: str(res.recognized) || "（聞き取れませんでした）",
          correctedContent: str(it.target),
          explanationJa: res.advice.join(" "),
          contentAtomId: str(it.atom.id), familyId: str(it.atom.familyId),
          score: res.overall,
          recommendedActivityTypes: ["pronunciation_practice"]
        }], { sessionId: r.session && r.session.id });
      }
      /* 録音の保存は設定しだい。**既定では残さない。** */
      VQ2.stt.keep(take, { retention: st.prefs.audioRetention, variantId: str(it.variant.id),
                           target: str(it.target), score: res.overall });
    }

    function playModel() {
      var it = currentSpeak();
      if (!it || !VQ2.tts) return;
      VQ2.tts.play(it.target, {
        voice: st.prefs.voiceId, speed: st.prefs.speed,
        onStart: function (info) { if (info && info.seconds) st.run.modelSeconds = info.seconds; }
      }).then(function (rr) {
        if (!rr.ok) app.toast(rr.reason || "見本を鳴らせませんでした。", "warning");
        else if (rr.note) app.toast(rr.note, "info");
      });
    }
    function playMine() {
      var r = st.run;
      if (!r.take || !r.take.blob) return;
      stopAudio();
      try {
        var url = URL.createObjectURL(r.take.blob);
        var a = new Audio(url);
        a.onended = function () { try { URL.revokeObjectURL(url); } catch (e) {} };
        a.play().catch(function () { app.toast("自分の声を再生できませんでした。", "warning"); });
      } catch (e) { app.toast("自分の声を再生できませんでした。", "warning"); }
    }

    function speakDoneHtml() {
      var r = st.run;
      var scored = r.results.filter(function (x) { return x && x.scored; });
      var avg = scored.length
        ? Math.round(scored.reduce(function (a, x) { return a + x.overall; }, 0) / scored.length) : null;
      var secs = Math.round((Date.now() - r.startedAt) / 1000);
      if (!r.saved) {
        r.saved = true;
        if (r.session) SH.finishSession(r.session.id, {
          exerciseCount: r.items.length,
          correctCount: scored.filter(function (x) { return x.overall >= 70; }).length,
          durationSeconds: secs,
          pronunciationScore: avg,
          fluencyScore: scored.length
            ? Math.round(scored.reduce(function (a, x) { return a + x.fluency; }, 0) / scored.length) : undefined,
          wordsSpoken: scored.reduce(function (a, x) { return a + (x.wordResults || []).length; }, 0)
        });
      }
      var weak = [];
      r.results.forEach(function (x, i) {
        if (x && x.scored && x.overall < 80 && r.items[i]) weak.push({ t: r.items[i].target, s: x });
      });
      return '<div class="vq2-sp-done">'
        + '<div class="vq2-sp-done-n">' + (avg === null ? "—" : avg) + "</div>"
        + '<div class="vq2-sp-done-s">'
        + (avg === null ? "点をつけられた回がありませんでした。"
                        : scored.length + " 回ぶんの平均です（" + Math.max(1, Math.round(secs / 60)) + " 分）")
        + "</div>"
        + '<div class="vq2-sp-note">音素ごとの評価はまだできません。'
        + "ここでの点は「目標の語を言えたか」と「速さ・間」から出しています。</div>"
        + (weak.length
            ? '<section class="vq2-sp-sec"><h2 class="vq2-sp-h2">もう一度やりたいところ</h2><div class="vq2-sp-list">'
              + weak.map(function (w) {
                  return '<div class="vq2-sp-rv"><span class="vq2-sp-rv-c">' + w.s.overall + "</span>"
                    + '<div><b lang="en">' + esc(w.t) + "</b>"
                    + '<div class="vq2-sp-rv-x">' + esc(w.s.advice[0] || "") + "</div></div></div>";
                }).join("")
              + "</div><p class=\"vq2-sp-lead\">これらは復習に入れました。</p></section>"
            : '<div class="vq2-sp-note">よくできました。</div>')
        + "</div>";
    }

/* ══════════════════════════════════════════════════════════
       シナリオ英会話（§29 / §30）

       固定の分岐で進み、分からないときだけ AI へ回す。
       AI に会話を作り直させない。読み上げるのは英語のセリフだけ。
       ══════════════════════════════════════════════════════════ */
    function startTalk(id) {
      var sc = arr(st.scenarios).filter(function (x) { return x.id === id; })[0];
      if (!sc) { app.toast("その会話が見つかりませんでした。", "warning"); return; }
      var sess = VQ2.dialogue.start(sc);
      if (!sess.ok) { app.toast(sess.message || "この会話は始められません。", "warning"); return; }
      st.run = {
        kind: "talk", title: sc.title, sess: sess,
        phase: "ready", handle: null, timer: null,
        lastHeard: "", lastWhy: "", thinking: false,
        session: SH.startSession({ activity: "scenario_conversation",
                                   level: st.prefs.level, categoryId: sc.categoryId, scenarioId: sc.id }),
        startedAt: Date.now(), showJa: !!st.prefs.showJapanese
      };
      renderTalk();
      speakLine();
    }

    function renderTalk() {
      applyPlayerPrefs();
      var r = st.run;
      if (!r) { render(); return; }
      var sess = r.sess;
      var node = VQ2.dialogue.currentNode(sess);
      var done = sess.state !== "continue";
      var h = "";

      h += '<div class="vq2-sp-talk" data-talk-log>'
        + sess.turns.map(function (t) {
            if (t.who === "ai") {
              return '<div class="vq2-tk vq2-tk-ai">'
                + '<div class="vq2-tk-b" lang="en">' + esc(t.text) + "</div>"
                + (r.showJa && t.japanese ? '<div class="vq2-tk-j">' + esc(t.japanese) + "</div>" : "")
                + "</div>";
            }
            return '<div class="vq2-tk vq2-tk-me"><div class="vq2-tk-b" lang="en">' + esc(t.text) + "</div></div>";
          }).join("")
        + (r.phase === "working" ? '<div class="vq2-tk vq2-tk-ai"><div class="vq2-tk-b">'
            + '<span class="vq2-spin" aria-hidden="true"></span> 聞き取っています…</div></div>' : "")
        + (r.thinking ? '<div class="vq2-tk vq2-tk-ai"><div class="vq2-tk-b">'
            + '<span class="vq2-spin" aria-hidden="true"></span> 考えています…</div></div>' : "")
        + "</div>";

      if (r.lastWhy && !done)
        h += '<div class="vq2-sp-note">' + esc(r.lastWhy) + "</div>";
      if (node && node.hint && !done && r.phase === "ready")
        h += '<div class="vq2-sp-note">言い方の例: ' + esc(node.hint) + "</div>";

      h += '<details class="vq2-sp-miss"' + (app.isMobile() ? "" : " open") + ">"
        + "<summary>ミッション（" + sess.missions.filter(function (m) { return m.completed; }).length
        + " / " + sess.missions.length + "）</summary><ul>"
        + sess.missions.map(function (m) {
            return "<li" + (m.completed ? ' class="is-done"' : "") + ">"
              + (m.completed ? U.icon("check") : '<span class="vq2-miss-box" aria-hidden="true"></span>')
              + esc(m.descriptionJa) + "</li>";
          }).join("")
        + "</ul></details>";

      if (done) h += talkDoneHtml();
      if (r.phase === "recording") {
        h += '<div class="vq2-sp-rec is-on" role="status" aria-live="polite">'
          + '<span class="vq2-sp-rec-dot" aria-hidden="true"></span>'
          + '<span class="vq2-sp-rec-t" data-sp-rectime>0.0 秒</span>'
          + '<span class="vq2-sp-rec-h">話し終わったら止めてください。</span></div>';
      }

      app.root.innerHTML = talkShell(h);
      renderTalkFoot();
      if (r.phase === "recording") tickRec();
      var log = app.root.querySelector("[data-talk-log]");
      if (log) log.scrollTop = log.scrollHeight;
    }
    function talkShell(inner) {
      var r = st.run, sess = r.sess;
      var done = sess.missions.filter(function (m) { return m.completed; }).length;
      return '<div class="vq2-sp is-run is-talk">'
        + '<header class="vq2-sp-runtop">'
        + U.button({ icon: "close", size: "sm", variant: "quiet", action: "sp-quit", iconOnly: true, aria: "やめる" })
        + '<span class="vq2-sp-talktitle"><b>' + esc(r.title) + "</b>"
        + "<span>あなたは " + esc(sess.scenario.userRole) + "　ミッション " + done + " / " + sess.missions.length + "</span></span>"
        + '<span class="vq2-sp-runacts">'
        + U.button({ icon: "audio", size: "sm", variant: "quiet", action: "sp-replay",
                     iconOnly: true, aria: "いまのセリフをもう一度聞く" })
        + U.button({ icon: "doc", size: "sm", variant: r.showJa ? "" : "quiet", action: "sp-ja",
                     iconOnly: true, aria: r.showJa ? "日本語訳を隠す" : "日本語訳を出す", pressed: r.showJa })
        + "</span></header>"
        + '<div class="vq2-sp-body">' + inner + "</div>"
        + '<footer class="vq2-sp-foot" data-sp-foot></footer></div>';
    }
    function renderTalkFoot() {
      var foot = app.root.querySelector("[data-sp-foot]");
      if (!foot) return;
      var r = st.run;
      if (r.sess.state !== "continue") {
        foot.innerHTML = U.button({ label: "終わる", size: "lg", variant: "primary", action: "sp-quit" });
        return;
      }
      if (r.phase === "recording") { foot.innerHTML = U.button({ label: "止める", icon: "stop", size: "lg", variant: "danger", action: "sp-stop" }); return; }
      if (r.phase === "working" || r.thinking) { foot.innerHTML = U.button({ label: "少し待ってください…", size: "lg", disabled: true }); return; }
      foot.innerHTML = U.button({ label: "話す", icon: "audio", size: "lg", variant: "primary", action: "sp-talk-rec" });
    }

    /* いまのセリフを読み上げる（英語だけ。日本語訳は読まない）。 */
    function speakLine() {
      var r = st.run;
      var node = VQ2.dialogue.currentNode(r.sess);
      if (!node || !VQ2.tts) return;
      VQ2.tts.play(node.aiText, { voice: st.prefs.voiceId, speed: st.prefs.speed })
        .then(function (rr) {
          if (!rr.ok && rr.reason) app.toast(rr.reason, "warning");
          else if (rr.note) app.toast(rr.note, "info");
        });
    }

    function talkRecord() {
      var r = st.run;
      if (!VQ2.stt) { app.toast("録音の部品が読み込まれていません。", "warning"); return; }
      stopAudio();
      VQ2.stt.start({}).then(function (h) {
        if (!h.ok) { app.toast(h.reason || "録音を始められませんでした。", "warning"); return; }
        r.handle = h; r.phase = "recording";
        renderTalk();
      });
    }
    function talkStop() {
      var r = st.run;
      if (!r.handle) return;
      r.phase = "working";
      renderTalk();
      r.handle.stop().then(function (take) {
        r.handle = null;
        if (r.timer) { clearInterval(r.timer); r.timer = null; }
        if (!take.ok) { r.phase = "ready"; renderTalk(); app.toast(take.reason || "録音できませんでした。", "warning"); return; }
        return VQ2.stt.transcribeTake(take).then(function (stt) {
          r.phase = "ready";
          if (!stt.ok || !str(stt.text).trim()) {
            renderTalk();
            app.toast(stt.reason || "うまく聞き取れませんでした。もう一度お願いします。", "warning");
            return;
          }
          r.lastHeard = str(stt.text);
          step(r.lastHeard);
        });
      }).catch(function () {
        r.phase = "ready"; renderTalk();
        app.toast("聞き取りに失敗しました。", "warning");
      });
    }

    /* 1 ターン進める。手元で決まらないときだけ AI へ意図をたずねる。 */
    function step(said) {
      var r = st.run;
      var node = VQ2.dialogue.currentNode(r.sess);
      var local = VQ2.dialogue.classifyLocal(said, node);
      if (local.sure || !VQ2.ai || !VQ2.ai.available || !VQ2.ai.available()) {
        applyStep(VQ2.dialogue.advance(r.sess, said));
        return;
      }
      r.thinking = true;
      renderTalk();
      askIntent(said, node).then(function (id) {
        r.thinking = false;
        applyStep(VQ2.dialogue.advance(r.sess, said, { decidedIntentId: id }));
      }).catch(function () {
        r.thinking = false;
        applyStep(VQ2.dialogue.advance(r.sess, said));
      });
    }
    function applyStep(res) {
      var r = st.run;
      r.lastWhy = "";
      if (res && res.ok) {
        if (res.matched) {
          r.lastWhy = "";
          if (arr(res.justCompleted).length)
            app.toast("ミッション達成: " + res.justCompleted.map(function (m) { return m.descriptionJa; }).join("・"), "success");
        } else {
          r.lastWhy = res.hint ? "うまく伝わりませんでした。もう一度どうぞ。" : "もう一度、言ってみてください。";
        }
      }
      renderTalk();
      if (res && res.ok && res.node) speakLine();
      if (r.sess.state !== "continue") finishTalk();
    }

    /* AI に「どの意図か」だけを選ばせる。**会話文は作らせない。** */
    function askIntent(said, node) {
      var ids = arr(node.expectedIntents).map(function (e) { return e.intentId; });
      if (!ids.length) return Promise.resolve("");
      var lines = arr(node.expectedIntents).map(function (e) {
        return "・" + e.intentId + " … 例: " + e.examples.slice(0, 3).join(" / ");
      });
      var msg = "英会話の練習で、相手（学習者）が次のように言いました。\n\n"
        + "「" + said + "」\n\n"
        + "この発話がどの意図に当たるかを、下の中から 1 つだけ選び、**その ID だけ**を返してください。\n"
        + "どれにも当たらないときは none とだけ返してください。説明は書かないでください。\n\n"
        + lines.join("\n");
      return VQ2.ai.run({ task: "explanation", message: msg, level: "fast" })
        .then(function (res) {
          var t = str(res && res.text).trim().toLowerCase();
          for (var i = 0; i < ids.length; i++) {
            if (t.indexOf(ids[i].toLowerCase()) >= 0) return ids[i];
          }
          return "";
        });
    }

    function finishTalk() {
      var r = st.run;
      if (r.saved) return;
      r.saved = true;
      var sum = VQ2.dialogue.summary(r.sess);
      if (r.session) SH.finishSession(r.session.id, {
        conversationTurns: sum.turns, wordsSpoken: sum.wordsSpoken,
        durationSeconds: sum.seconds,
        exerciseCount: sum.missionsTotal, correctCount: sum.missionsDone
      });
    }
    function talkDoneHtml() {
      var sum = VQ2.dialogue.summary(st.run.sess);
      return '<div class="vq2-sp-done">'
        + '<div class="vq2-sp-done-n">' + sum.missionsDone + " / " + sum.missionsTotal + "</div>"
        + '<div class="vq2-sp-done-s">ミッション達成　'
        + sum.turns + " 回話しました（" + sum.wordsSpoken + " 語）</div>"
        + (sum.missionsDone < sum.missionsTotal
            ? '<div class="vq2-sp-note">できなかったこと: '
              + esc(sum.missions.filter(function (m) { return !m.completed; })
                  .map(function (m) { return m.descriptionJa; }).join("・")) + "</div>"
            : '<div class="vq2-sp-note">ぜんぶ言えました。</div>')
        + "</div>";
    }

/* ── レベルと設定 ────────────────────────────────────────── */


    /* ══════════════════════════════════════════════════════════
       レベルを選ぶ

       ただ 6 つ並べるのではなく、**選ぶと何が変わるか**を出す。
       文の長さ・話す速さ・字幕・そのレベルの教材の量まで見せて、
       選んでから「思っていたのと違う」とならないようにする。
       ══════════════════════════════════════════════════════════ */
    function openLevel() {
      var sheet = U.mount("vq2-speak-level", { sheet: true, stack: true, title: "レベルを選ぶ",
      /* 既定の 680px だと、内訳の帯が詰まって読みにくい。この画面だけ広げる。 */
      css: ".vq2-root.is-sheet { width: min(880px, calc(100vw - 40px)); max-height: min(90vh, 900px); }"
           + ".vq2-root.is-sheet.is-mobile { width: 100%; max-height: 94vh; }",
      });
      var lessons = arr(st.curriculum && st.curriculum.lessons);
      var ix = SH.indexHistory();

      function countFor(id) {
        var ls = lessons.filter(function (l) { return l.level === id; });
        var q = ls.reduce(function (a, l) { return a + num(l.variantCount, 0); }, 0);
        var done = 0;
        ls.forEach(function (l) { done += lessonProgress(l, ix).done; });
        return { lessons: ls.length, questions: q, done: done,
                 pct: q ? Math.min(100, Math.round((done / q) * 100)) : 0 };
      }
      var SUB = {
        pre_a1: "はじめての英語。あいさつと自己紹介から。",
        a1: "身のまわりのことを、短い文で言える。",
        a2: "買い物や旅行など、決まった場面でやりとりできる。",
        b1: "理由をつけて意見を言える。",
        b2: "発表や仕事のやりとりができる。",
        c1: "議論を組み立て、細かい違いを言い分けられる。"
      };
      var SUBTITLE = { always: "いつも出す", after: "一度聞いたあと", hint: "ヒントのときだけ", none: "出さない" };

      sheet.root.innerHTML = '<div class="vq2-pane">'
        + '<div class="vq2-pane-h"><h2>レベルを選ぶ</h2>'
        + U.button({ icon: "close", size: "sm", variant: "quiet", action: "x", iconOnly: true, aria: "閉じる" })
        + '</div><div class="vq2-pane-b">'
        + '<p class="vq2-sp-lead">レベルを変えると、出てくる英文の長さ・話す速さ・字幕の出し方が変わります。'
        + "いつでも変えられます。</p>"
        + '<div class="vq2-lv-list">'
        + SM.LEVELS.map(function (l) {
            var on = l.id === st.prefs.level;
            var c = countFor(l.id);
            return '<button type="button" class="vq2-lv' + (on ? " is-on" : "")
              + (c.lessons ? "" : " is-empty") + '" data-lv="' + l.id + '"'
              + ' aria-pressed="' + on + '">'
              + '<span class="vq2-lv-badge">' + esc(l.cefr) + "</span>"
              + '<span class="vq2-lv-m">'
              + '<span class="vq2-lv-t">' + esc(l.ja)
              + (on ? '<span class="vq2-lv-now">いま選んでいます</span>' : "") + "</span>"
              + '<span class="vq2-lv-s">' + esc(SUB[l.id] || "") + "</span>"
              + '<span class="vq2-lv-facts">'
              + '<span>1 文 ' + l.maxWords + " 語くらい</span>"
              + "<span>話す速さ ×" + l.speed + "</span>"
              + "<span>字幕 " + esc(SUBTITLE[l.subtitle] || l.subtitle) + "</span>"
              + "</span>"
              + (c.lessons
                  ? '<span class="vq2-lv-prog"><span class="vq2-sp-meter is-sm"><span style="width:'
                    + c.pct + '%"></span></span>'
                    + '<span class="vq2-lv-num">' + c.lessons + " レッスン・" + c.done + " / " + c.questions + " 問</span></span>"
                  : '<span class="vq2-lv-num is-none">教材はまだありません</span>')
              + "</span>"
              + (on ? U.icon("check") : "") + "</button>";
          }).join("")
        + "</div></div></div>";

      U.on(sheet.root, "click", '[data-act="x"]', function () { sheet.close("user"); });
      U.on(sheet.root, "click", "[data-lv]", function (e, t) {
        st.prefs = SH.savePrefs({ level: t.getAttribute("data-lv") });
        sheet.close("picked");
        loadScenarios();
        render();
      });
    }

    /* ══════════════════════════════════════════════════════════
       設定

       まとまりごとに分け、選んだあと何が変わるかを 1 行で添える。
       **録音した音声の扱いは、いちばん大事なので独立させて出す。**
       ══════════════════════════════════════════════════════════ */
    function openPrefs() {
      var sheet = U.mount("vq2-speak-prefs", { sheet: true, stack: true, title: "VocabuSpeak の設定",
      /* 既定の 680px だと、内訳の帯が詰まって読みにくい。この画面だけ広げる。 */
      css: ".vq2-root.is-sheet { width: min(880px, calc(100vw - 40px)); max-height: min(90vh, 900px); }"
           + ".vq2-root.is-sheet.is-mobile { width: 100%; max-height: 94vh; }",
      });
      draw();

      function seg(key, value, opts) {
        return '<div class="vq2-seg" role="radiogroup">'
          + opts.map(function (o) {
              var on = String(value) === String(o[0]);
              return '<button type="button" class="vq2-seg-b' + (on ? " is-on" : "") + '"'
                + ' role="radio" aria-checked="' + on + '" data-k="' + key + '" data-v="' + esc(o[0]) + '">'
                + esc(o[1]) + "</button>";
            }).join("")
          + "</div>";
      }
      function row(label, note, control) {
        return '<div class="vq2-set-row"><div class="vq2-set-l">' + esc(label)
          + (note ? '<span class="vq2-set-n">' + esc(note) + "</span>" : "") + "</div>"
          + control + "</div>";
      }

      function draw() {
        var p = st.prefs;
        var caps = deviceCaps();
        var vname = VQ2.voicePicker ? VQ2.voicePicker.labelOf(p.voiceId, "自動（英語の声）") : (p.voiceId || "自動");
        var h = '<div class="vq2-pane"><div class="vq2-pane-h"><h2>設定</h2>'
          + U.button({ icon: "close", size: "sm", variant: "quiet", action: "x", iconOnly: true, aria: "閉じる" })
          + '</div><div class="vq2-pane-b">';

        h += '<section class="vq2-set-sec"><h3>学習</h3>'
          + row("1 日の目標", "ホームの輪がこの時間で満ちます",
                seg("dailyGoalMinutes", p.dailyGoalMinutes,
                    [[5, "5 分"], [10, "10 分"], [20, "20 分"], [30, "30 分"]]))
          + row("いまのレベル", SM.levelLabel(p.level),
                U.button({ label: "変える", size: "sm", variant: "quiet", icon: "layers", action: "to-level" }))
          + "</section>";

        h += '<section class="vq2-set-sec"><h3>聞く</h3>'
          + row("話す速さ", "読み上げの速さ",
                seg("speed", p.speed, [[0.75, "ゆっくり"], [0.9, "少し遅い"], [1, "ふつう"], [1.15, "速い"]]))
          + row("英文の字幕", "音声を聞くときに英文を出すか",
                seg("subtitle", p.subtitle,
                    [["always", "いつも"], ["after", "聞いたあと"], ["hint", "ヒント時"], ["none", "出さない"]]))
          + row("日本語訳", "会話や例文の訳を出すか",
                seg("showJapanese", p.showJapanese ? "1" : "0", [["1", "出す"], ["0", "出さない"]]))
          + '<div class="vq2-set-row"><div class="vq2-set-l">読み上げの声'
          + '<span class="vq2-set-n">リスニングと会話に使います</span></div>'
          + '<div class="vq2-set-voice">'
          + '<span class="vq2-vc-dot is-sm" style="--vp-h:'
          + (VQ2.voicePicker ? VQ2.voicePicker.hueOf(p.voiceId || "auto") : 28) + '"></span>'
          + '<span class="vq2-set-voice-n">' + esc(vname) + "</span>"
          + U.button({ label: "選ぶ", size: "sm", variant: "quiet", action: "pick-voice" })
          + (p.voiceId ? U.button({ label: "自動へ", size: "sm", variant: "quiet", action: "clear-voice" }) : "")
          + "</div></div>"
          + "</section>";

        h += '<section class="vq2-set-sec"><h3>話す</h3>';
        if (!caps.canRecord) {
          h += '<div class="vq2-sp-note">この端末ではマイクを使えないため、話す練習はできません。</div>';
        } else if (!caps.canTranscribe) {
          h += '<div class="vq2-sp-note">聞き取り（ローカルAI）に接続できないため、'
            + "話す練習はできません。ローカルAIを起動すると使えます。</div>";
        } else {
          h += '<div class="vq2-sp-note">発音は「目標の語を言えたか」と「速さ・間」で見ています。'
            + "音素ごとの評価はまだできません。</div>";
        }
        h += "</section>";

        h += '<section class="vq2-set-sec"><h3>録音した自分の音声</h3>'
          + row("残し方", "既定は、採点が終わったらすぐ消します",
                seg("audioRetention", p.audioRetention,
                    [["immediate", "すぐ消す"], ["session", "その学習中だけ"], ["7days", "7 日"], ["30days", "30 日"]]))
          + '<p class="vq2-sp-hint">録音した音声は、この端末の中だけに置きます。'
          + "外へ送ることはありません。聞き取りもこの端末の中で行います。</p>"
          + '<div class="vq2-set-row"><div class="vq2-set-l">いま残っている録音'
          + '<span class="vq2-set-n" data-voice-usage>数えています…</span></div>'
          + U.button({ label: "すべて消す", size: "sm", variant: "quiet", icon: "trash", action: "clear-voice-takes" })
          + "</div></section>";

        h += "</div></div>";
        sheet.root.innerHTML = h;
        wire();
        showUsage();
      }

      function showUsage() {
        var el = sheet.root.querySelector("[data-voice-usage]");
        if (!el || !VQ2.stt) return;
        VQ2.stt.usage().then(function (u) {
          el.textContent = u.count
            ? u.count + " 件（" + Math.round(u.bytes / 1024) + " KB）"
            : "ありません";
        }).catch(function () { el.textContent = "数えられませんでした"; });
      }

      function wire() {
        U.on(sheet.root, "click", '[data-act="x"]', function () { sheet.close("user"); });
        U.on(sheet.root, "click", "[data-k]", function (e, t) {
          var k = t.getAttribute("data-k"), v = t.getAttribute("data-v");
          if (k === "speed" || k === "dailyGoalMinutes") v = Number(v);
          if (k === "showJapanese") v = v === "1";
          var patch = {}; patch[k] = v;
          st.prefs = SH.savePrefs(patch);
          draw();
        });
        U.on(sheet.root, "click", '[data-act="to-level"]', function () {
          sheet.close("level"); openLevel();
        });
        U.on(sheet.root, "click", '[data-act="pick-voice"]', function () {
          if (!VQ2.voicePicker) { sheet.toast("読み上げの部品が読み込まれていません。", "warning"); return; }
          VQ2.voicePicker.open({ value: st.prefs.voiceId, speed: st.prefs.speed, lang: "en-us",
            title: "英語の声を選ぶ" }).then(function (r) {
              if (!r) return;
              st.prefs = SH.savePrefs({ voiceId: r.voice, speed: r.speed });
              draw();
            });
        });
        U.on(sheet.root, "click", '[data-act="clear-voice"]', function () {
          st.prefs = SH.savePrefs({ voiceId: "" });
          draw();
        });
        U.on(sheet.root, "click", '[data-act="clear-voice-takes"]', function () {
          if (!VQ2.stt) return;
          sheet.confirm
            ? sheet.confirm({ title: "録音をすべて消しますか", body: "元に戻せません。" }).then(function (yes) {
                if (yes) VQ2.stt.clearAll().then(showUsage);
              })
            : VQ2.stt.clearAll().then(showUsage);
        });
      }
    }


    /* ── 小さな道具 ──────────────────────────────────────────── */
    function focusTab() {
      var b = app.root.querySelector(".vq2-sp-tab.is-on");
      if (b) b.setAttribute("tabindex", "0");
    }
    function catOf(id) {
      return arr(st.curriculum && st.curriculum.categories)
        .filter(function (c) { return c.id === str(id); })[0] || null;
    }
    function catName(id) { var c = catOf(id); return c ? c.name : str(id); }
    function pickLessons(c, level) {
      return arr(c && c.lessons).filter(function (l) { return l.level === level; });
    }
    function activityLabelOf(s) {
      return { lesson: "レッスン", listening: "リスニング", dictation: "ディクテーション",
               speaking: "スピーキング", pronunciation: "発音練習", shadowing: "シャドーイング",
               scenario_conversation: "シナリオ英会話", free_conversation: "AI英会話",
               review: "復習" }[str(s && s.activity)] || "学習";
    }
    function trainActivityOf(acts) {
      if (acts.indexOf("dictation") >= 0) return "dictation";
      if (acts.indexOf("listening_choice") >= 0) return "listening";
      if (acts.indexOf("shadowing") >= 0) return "shadowing";
      if (acts.some(function (a) { return a === "pronunciation_practice" || a === "speaking_repeat"; })) return "speaking";
      return "lesson";
    }
    function when(iso) {
      var t = Date.parse(iso || 0);
      if (!t) return "";
      var d = new Date(t), now = new Date();
      var same = d.toDateString() === now.toDateString();
      return same ? "今日 " + ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2)
                  : (d.getMonth() + 1) + "月" + d.getDate() + "日";
    }
    function deviceCaps() {
      return {
        canPlayAudio: !!(VQ2.tts && VQ2.tts.canMakeAudio()),
        canRecord: canRecord(),
        /* 聞き取りが使えるかは Bridge に聞かないと分からない。
           開いたときに一度だけ調べ、その結果をここで使う。
           分かるまでは false（**できるふりをしない**）。 */
        canTranscribe: st.canTranscribe === true
      };
    }
    function stopAudio() { try { if (VQ2.tts) VQ2.tts.stop(); } catch (e) {} }
  }

  /* マイクを使えるか。**使えるかどうかは、実際に許可を求めるまで分からない**ので、
     ここでは「そもそも仕組みがあるか」だけを見る。 */
  function canRecord() {
    return !!(root.navigator && root.navigator.mediaDevices
              && root.navigator.mediaDevices.getUserMedia && root.MediaRecorder);
  }

  VQ2.speak = { open: open, TABS: TABS, TRAINING: TRAINING, canRecord: canRecord, HOST_ID: HOST_ID };
})(typeof globalThis !== "undefined" ? globalThis : this);
