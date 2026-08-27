/* ══════════════════════════════════════════════════════════════════════
   FEED 共有（§31）
   ・専用の偽 FEED を作らない。既存の投稿エディタ（_appFeedEditorOpen）へ渡す。
     公開範囲・削除・通報・コメント・いいね・プロフィール・権限は既存のまま。
   ・初期状態で非公開にする項目を厳密に決める。既定で外へ出さない。
   ・第三者が作った試験の問題・正解を、確認なしに公開しない。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var U = VQ2.ui, S = VQ2.schema, ST = VQ2.store;
  var esc = U.esc, icon = U.icon, btn = U.button;

  var DRAFT_KEY = "app.feed.editor.draft.v1";

  /* 共有できる項目。private:true のものは既定で外へ出さない（§31）。 */
  var ITEMS = [
    { id: "title",       label: "試験名",                 def: true },
    { id: "subject",     label: "科目",                   def: true },
    { id: "score",       label: "総合得点",               def: true },
    { id: "accuracy",    label: "正答率",                 def: true },
    { id: "time",        label: "所要時間",               def: true },
    { id: "sections",    label: "大問別の結果",           def: false },
    { id: "criteria",    label: "知識・技能／思考・判断・表現", def: false },
    { id: "strengths",   label: "得意分野",               def: false },
    { id: "weaknesses",  label: "要復習分野",             def: false },
    { id: "aiComment",   label: "AI による短い総評",      def: false },
    { id: "detailLink",  label: "結果の詳細へのリンク",   def: false }
  ];

  /* 何があっても外へ出さないもの（選択肢としても出さない）。 */
  var NEVER_SHARED = [
    "問題文の全文", "正解", "あなたの答案の全文", "元の教材",
    "非公開のプリセット", "教材に含まれる個人情報", "AI との会話全文", "出典の本文"
  ];

  function open(o) {
    o = o || {};
    var result = o.result;
    if (!result) return null;
    var parentApp = o.app || null;

    /* 共有し終えたら結果画面へ戻る前提なので、呼び出し元は畳まない */
    var app = U.mount("vq2-feed-share", {
      title: "結果を共有", stack: true, onClose: o.onClose, onResize: function () { render(); }
    });

    var sel = {};
    ITEMS.forEach(function (i) { sel[i.id] = i.def; });
    var st = { comment: "", confirmed: false };

    render();

    /* ── 共有カードを組み立てる（選ばれた項目だけ） ────────── */
    function buildCard() {
      var agg = result.aggregate || {};
      var rate = result.maxScore > 0 ? Math.round((result.score / result.maxScore) * 100) : 0;
      var t = Math.floor((result.elapsedMs || 0) / 1000);

      var card = {
        type: "study_result",
        headline: sel.title ? (result.presetName || "テストの結果") : "テストの結果",
        note: "",
        rangeLabel: result.kind === "mock" ? "模試" : "クイズ",
        presetName: sel.title ? String(result.presetName || "") : "（非公開）",
        subjectId: "",
        subjectLabel: sel.subject ? String(result.subject || "") : "",
        totalMinutes: sel.time ? Math.round(t / 60) : 0,
        accuracy: sel.accuracy ? rate : 0,
        streakDays: 0,
        completedPresets: 1,
        improvedCount: 0,
        metrics: []
      };

      if (sel.score) card.metrics.push({ label: "総合得点", value: fmt(result.score) + " / " + result.maxScore + " 点" });
      if (sel.accuracy) card.metrics.push({ label: "正答率", value: rate + "%" });
      if (sel.time) card.metrics.push({ label: "所要時間", value: Math.floor(t / 60) + " 分" });

      if (sel.criteria) {
        Object.keys(agg.byCriterion || {}).forEach(function (k) {
          var c = agg.byCriterion[k];
          if (c.max > 0) card.metrics.push({ label: c.label, value: fmt(c.score) + " / " + c.max + " 点" });
        });
      }
      if (sel.sections && (result.sectionScores || []).length) {
        result.sectionScores.forEach(function (s) {
          card.metrics.push({ label: "大問" + s.number, value: fmt(s.score) + " / " + s.max + " 点" });
        });
      }
      if (sel.strengths || sel.weaknesses) {
        var a = result.analysis;
        if (a) {
          if (sel.strengths && (a.strengths || []).length)
            card.note += "得意：" + a.strengths.slice(0, 2).map(function (x) { return x.topic; }).join("・") + "　";
          if (sel.weaknesses && (a.weaknesses || []).length)
            card.note += "要復習：" + a.weaknesses.slice(0, 2).map(function (x) { return x.topic; }).join("・");
        } else {
          /* 分析がまだ無いなら、単元別の実測から出す（作り話をしない） */
          var topics = Object.keys(agg.byTopic || {});
          if (sel.strengths) {
            var good = topics.filter(function (k) { return agg.byTopic[k].rate >= 0.8; }).slice(0, 2);
            if (good.length) card.note += "得意：" + good.join("・") + "　";
          }
          if (sel.weaknesses) {
            var bad = topics.filter(function (k) { return agg.byTopic[k].rate !== null && agg.byTopic[k].rate < 0.6; }).slice(0, 2);
            if (bad.length) card.note += "要復習：" + bad.join("・");
          }
        }
      }
      if (sel.aiComment && result.analysis && result.analysis.summary)
        card.note = (card.note ? card.note + "\n" : "") + String(result.analysis.summary).slice(0, 120);
      if (!card.note) card.note = "結果をまとめました。";
      return card;
    }
    function fmt(n) { return Math.round((n || 0) * 10) / 10; }

    function buildBody() {
      var lines = [];
      if (st.comment.trim()) lines.push(st.comment.trim());
      if (sel.detailLink) lines.push("（結果の詳細はアプリ内に保存しています）");
      return lines.join("\n");
    }

    /* ── 既存の投稿エディタへ渡す ────────────────────────── */
    function post() {
      /* いまの FEED（vq-feed）へ直接渡す。旧エディタは新しい FEED が
         覆っているので、そちらだけを頼りにすると行き先が無くなる。 */
      if (typeof root.__vqFeedCompose === "function") {
        ST.recordUsage({ eventType: "export_generation", mode: "feed-share", status: "completed", durationMs: 0 });
        var c = buildCard(), bd = buildBody();
        app.close("posted");
        if (parentApp) { try { parentApp.close("shared"); } catch (e) {} }
        try { root.__vqFeedCompose({ body: bd, card: c }); } catch (e) {}
        return;
      }
      var openEditor = root._appFeedEditorOpen
        || (root.__vqApp && root.__vqApp.feedEditorOpen);
      if (typeof openEditor !== "function") {
        app.alert({
          title: "投稿画面を開けません",
          body: "FEED の投稿機能が読み込まれていません。ページを再読み込みしてからもう一度お試しください。"
        });
        return;
      }

      /* 既存の下書き形式で保存 → エディタが読み込む */
      var payload = {
        title: sel.title ? String(result.presetName || "") : "",
        body: buildBody(),
        links: [], images: [],
        card: buildCard(),
        subjectId: "",
        tagIds: [],
        ts: Date.now()
      };
      try { root.localStorage.setItem(DRAFT_KEY, JSON.stringify(payload)); }
      catch (e) {
        app.alert({ title: "共有できません", body: "下書きを保存できませんでした。" });
        return;
      }

      ST.recordUsage({ eventType: "export_generation", mode: "feed-share", status: "completed", durationMs: 0 });
      app.close("posted");
      if (parentApp) { try { parentApp.close("shared"); } catch (e) {} }
      try { openEditor(); }
      catch (e) {
        root.setTimeout(function () { try { openEditor(); } catch (x) {} }, 100);
      }
    }

    /* ── 描画 ─────────────────────────────────────────────── */
    function render() {
      app.root.innerHTML =
        '<div class="vq2-top">'
        + btn({ icon: "chevronL", iconOnly: true, variant: "quiet", action: "close", aria: "閉じる" })
        + '<div class="vq2-top-title">結果を共有</div>'
        + '<div class="vq2-top-sp"></div>'
        + btn({ label: "投稿画面へ", icon: "share", variant: "primary", action: "post", disabled: !st.confirmed })
        + "</div>"
        + '<div class="vq2-body"><div class="vq2-pane vq2-pane-c"><div class="vq2-pane-b">'
        + bodyHtml() + "</div></div></div>";
      wire();
    }

    function bodyHtml() {
      var h = '<div class="vq2-q" style="gap:16px">';

      h += '<div class="vq2-card"><div class="vq2-sec-t">共有する項目</div>'
        + '<div class="vq2-hint" style="margin-bottom:10px">選んだものだけが投稿に載ります。既定では点数と正答率だけです。</div>'
        + ITEMS.map(function (i) {
            var disabled = needsAnalysis(i.id) && !result.analysis;
            return '<label class="vq2-check"' + (disabled ? ' style="opacity:.5"' : "") + ">"
              + '<input type="checkbox" data-item="' + i.id + '"' + (sel[i.id] ? " checked" : "")
              + (disabled ? " disabled" : "") + ">"
              + "<span>" + esc(i.label)
              + (disabled ? '<br><span class="vq2-hint">結果画面で分析を実行すると選べます。</span>' : "")
              + "</span></label>";
          }).join("") + "</div>";

      h += '<div class="vq2-card"><div class="vq2-sec-t">投稿に載らないもの</div>'
        + '<div class="vq2-hint" style="margin-bottom:8px">次の内容は共有できません。選択肢にも出しません。</div>'
        + '<div class="vq2-row" style="gap:6px">'
        + NEVER_SHARED.map(function (n) { return U.badge(n); }).join("") + "</div></div>";

      h += '<div class="vq2-card"><div class="vq2-sec-t">ひとこと</div>'
        + '<textarea class="vq2-input" data-comment rows="3" placeholder="任意です。あとから投稿画面でも書けます。">' + esc(st.comment) + "</textarea></div>";

      /* プレビュー */
      var card = buildCard();
      h += '<div class="vq2-card"><div class="vq2-sec-t">プレビュー</div>'
        + '<div class="vq2-card" style="background:var(--vq-bg-subtle)">'
        + '<div style="font:var(--vq-type-heading-sm);margin-bottom:8px">' + esc(card.headline) + "</div>"
        + (card.subjectLabel ? '<div class="vq2-muted" style="margin-bottom:8px">' + esc(card.subjectLabel) + "</div>" : "")
        + '<div class="vq2-stats">'
        + card.metrics.map(function (m) {
            return '<div class="vq2-stat"><div class="vq2-stat-l">' + esc(m.label) + "</div>"
              + '<div class="vq2-stat-v">' + esc(m.value) + "</div></div>";
          }).join("")
        + "</div>"
        + (card.note ? '<div style="margin-top:10px;white-space:pre-wrap">' + esc(card.note) + "</div>" : "")
        + (buildBody() ? '<div style="margin-top:10px;white-space:pre-wrap">' + esc(buildBody()) + "</div>" : "")
        + "</div></div>";

      h += '<div class="vq2-card">'
        + '<label class="vq2-check"><input type="checkbox" data-confirm' + (st.confirmed ? " checked" : "") + ">"
        + "<span>上のプレビューの内容で投稿することを確認しました<br>"
        + '<span class="vq2-hint">この後、既存の投稿画面が開きます。公開範囲はそこで選べます。</span></span></label></div>';

      h += "</div>";
      return h;
    }
    function needsAnalysis(id) { return id === "aiComment"; }

    /* 委ねる形の結線（app.root への U.on）は **1 回だけ**。
       U.on は外す仕組みを持たないので、描き直すたびに張ると聞き手が増え続ける。 */
    function wire() {
      /* 印は app.root へ（関数内 var は巻き上げで消えることがある） */
      if (app.root.__fsWired) return;
      app.root.__fsWired = true;
      var r = app.root;
      U.on(r, "click", '[data-act="close"]', function () { app.close("user"); });
      U.on(r, "click", '[data-act="post"]', function () { post(); });
      U.on(r, "change", "[data-item]", function (e, t) {
        sel[t.getAttribute("data-item")] = t.checked;
        render();
      });
      U.on(r, "change", "[data-confirm]", function (e, t) { st.confirmed = t.checked; render(); });
      U.on(r, "input", "[data-comment]", function (e, t) { st.comment = t.value; });
    }

    return app;
  }

  VQ2.feedShare = { open: open, ITEMS: ITEMS, NEVER_SHARED: NEVER_SHARED };
})(typeof globalThis !== "undefined" ? globalThis : this);
