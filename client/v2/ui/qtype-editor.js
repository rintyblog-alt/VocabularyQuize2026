/* ══════════════════════════════════════════════════════════════════════
   形式を選ぶ画面（§11）と、形式ごとの編集フォーム（§12）
   ・形式名・説明・分類・対応科目・状態は、すべてレジストリから引く。
     ここへ書き写さない。書き写すと、増やしたときに必ずずれる。
   ・「準備中」の形式は選べない。押しても壊れた画面へ行かせない（§4）。
   ・編集中は必ず本物のプレビューを出す。出題画面と同じ Renderer を使うので、
     見た目と実物がずれない。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var U = VQ2.ui, Q = VQ2.qtypes, M = VQ2.qmodel, R = VQ2.qrender, S = VQ2.schema;
  if (!U || !Q || !M || !R) throw new Error("VQ2.ui / qtypes / qmodel / qrender must be loaded before qtype-editor.js");
  var esc = U.esc, icon = U.icon, btn = U.button;

  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function isObj(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function str(v) { return v === undefined || v === null ? "" : String(v); }
  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function letter(i) { return String.fromCharCode(65 + i); }

  /* ══════════════════════════════════════════════════════════════════
     最近使った形式・お気に入り
     ══════════════════════════════════════════════════════════════════ */
  var K_RECENT = "vq2.qtype.recent.v1";
  var K_FAV = "vq2.qtype.fav.v1";
  function readList(key) {
    try { var v = JSON.parse(root.localStorage.getItem(key) || "[]"); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  }
  function writeList(key, v) {
    try { root.localStorage.setItem(key, JSON.stringify(v.slice(0, 24))); } catch (e) {}
  }
  function noteUsed(id) {
    var l = readList(K_RECENT).filter(function (x) { return x !== id; });
    l.unshift(id);
    writeList(K_RECENT, l);
  }
  function toggleFav(id) {
    var l = readList(K_FAV);
    var i = l.indexOf(id);
    if (i >= 0) l.splice(i, 1); else l.unshift(id);
    writeList(K_FAV, l);
    return l.indexOf(id) >= 0;
  }

  /* ══════════════════════════════════════════════════════════════════
     形式を選ぶ画面
     ══════════════════════════════════════════════════════════════════ */
  function openPicker(o) {
    o = o || {};
    return new Promise(function (resolve) {
      var picked = null;
      var app = U.mount("vq2-qtype-picker", {
        title: "問題の形式を選ぶ", sheet: true, stack: true, wide: true,
        onClose: function () { resolve(picked); },
        onResize: function () { render(); }
      });
      app.root.classList.add("vq2-qtp");
      var st = {
        q: "",
        category: o.category || "",
        availableOnly: true,
        aiOnly: false,
        subject: o.subject || "",
        view: "all"          /* all | recommend | recent | fav */
      };

      function results() {
        var filter = { availableOnly: st.availableOnly };
        if (st.category) filter.category = st.category;
        if (st.aiOnly) filter.aiOnly = true;
        if (st.subject) filter.subject = st.subject;
        if (o.mode) filter.mode = o.mode;
        if (st.view === "recommend" && !st.q)
          return Q.recommended({ subject: st.subject, purpose: o.purpose });
        if (st.view === "recent" && !st.q)
          return readList(K_RECENT).map(Q.get).filter(Boolean);
        if (st.view === "fav" && !st.q)
          return readList(K_FAV).map(Q.get).filter(Boolean);
        return Q.search(st.q, filter);
      }

      /* 1 枚のカード。**印は「他と違うところ」だけ出す。**
         全部のカードに同じ札（手で作る・分類名）が並ぶと、読む手がかりにならない。 */
      function cardHtml(d) {
        var favs = readList(K_FAV);
        var ready = d.status === "available" || d.status === "beta";
        var marks = [];
        if (d.supportsAI) marks.push(["AI", "AI で作れます"]);
        if (d.supportsPartialCredit) marks.push(["部分点", "途中まで合っていれば点が入ります"]);
        if (d.supportsMedia) marks.push(["画像・音声", "画像や音声を使えます"]);
        return '<div class="vq2-qt-card' + (ready ? "" : " is-soon") + (o.current === d.id ? " is-cur" : "") + '"'
          + ' data-qt="' + esc(d.id) + '" tabindex="0" role="option"'
          + ' aria-selected="' + (o.current === d.id ? "true" : "false") + '"'
          + ' aria-disabled="' + (ready ? "false" : "true") + '">'
          + '<span class="vq2-qt-ic">' + icon(d.icon) + "</span>"
          + '<span class="vq2-qt-body">'
          + '<span class="vq2-qt-h">'
          + '<span class="vq2-qt-n">' + esc(d.name) + "</span>"
          + (d.status === "beta" ? '<span class="vq2-qt-st is-beta">ベータ</span>' : "")
          + (d.status === "coming_soon" ? '<span class="vq2-qt-st">準備中</span>' : "")
          + (o.current === d.id ? '<span class="vq2-qt-st is-cur">いま選択中</span>' : "")
          + "</span>"
          + '<span class="vq2-qt-d">' + esc(d.description) + "</span>"
          + (d.example ? '<span class="vq2-qt-ex">例：' + esc(d.example) + "</span>" : "")
          + (marks.length ? '<span class="vq2-qt-m">' + marks.map(function (m) {
              return '<span class="vq2-qt-tag" title="' + esc(m[1]) + '">' + esc(m[0]) + "</span>";
            }).join("") + "</span>" : "")
          + "</span>"
          + '<button type="button" class="vq2-qt-fav' + (favs.indexOf(d.id) >= 0 ? " is-on" : "") + '"'
          + ' data-fav="' + esc(d.id) + '" aria-label="' + esc(d.name) + ' をよく使う形式にする">' + icon("star") + "</button>"
          + "</div>";
      }

      /* 左の分類の並び。数はいまの絞り込みでの実数。 */
      function railHtml(all) {
        /* 数え方は、分類を押したときに出るものと同じにする。
           「音声と文章のマッチング」のように、主の分類が別で
           音声にも顔を出す形式があるため、主の分類だけで数えると
           左（9）と右（10 種類）が食い違う。 */
        var byCat = {};
        all.forEach(function (d) {
          [d.category].concat(d.altCategories || []).forEach(function (c) {
            if (c) byCat[c] = (byCat[c] || 0) + 1;
          });
        });
        var rows = ['<button type="button" class="vq2-qt-rail' + (st.category === "" ? " is-on" : "")
          + '" data-cat="">' + icon("list") + "<span>すべての分類</span>"
          + '<b class="vq2-qt-cnt">' + all.length + "</b></button>"];
        Q.CATEGORIES.forEach(function (c) {
          var n = byCat[c.id] || 0;
          if (!n && st.category !== c.id) return;
          rows.push('<button type="button" class="vq2-qt-rail' + (st.category === c.id ? " is-on" : "")
            + '" data-cat="' + c.id + '">' + icon(c.icon) + "<span>" + esc(c.label) + "</span>"
            + '<b class="vq2-qt-cnt">' + n + "</b></button>");
        });
        return rows.join("");
      }

      function render() {
        /* 分類の数は「分類で絞る前」の結果から数える（押す前に何件あるか分かる） */
        var beforeCat = st.category;
        st.category = "";
        var all = results();
        st.category = beforeCat;
        var list = results();

        var byCat = {};
        list.forEach(function (d) { (byCat[d.category] || (byCat[d.category] = [])).push(d); });

        var h = '<div class="vq2-pane-h">'
          + "<span>問題の形式を選ぶ</span>"
          + '<div class="vq2-top-sp"></div>'
          + btn({ icon: "close", iconOnly: true, size: "sm", variant: "quiet", action: "x", aria: "閉じる" })
          + "</div>";

        /* 上に固定する部分：探す・見かた */
        h += '<div class="vq2-qt-top">'
          + '<div class="vq2-qt-search">' + icon("search")
          + '<input type="search" data-qt-q placeholder="形式を探す（例：並べ替え、リスニング、記述）" value="' + esc(st.q) + '" aria-label="形式を探す">'
          + (st.q ? '<button type="button" class="vq2-qt-clear" data-qt-clear aria-label="検索を消す">' + icon("close") + "</button>" : "")
          + "</div>"
          + '<div class="vq2-qt-views" role="tablist">'
          + [["all", "すべて"], ["recommend", "おすすめ"], ["recent", "最近使った"], ["fav", "よく使う"]]
              .map(function (v) {
                var on = st.view === v[0];
                return '<button type="button" role="tab" aria-selected="' + (on ? "true" : "false")
                  + '" class="vq2-chip' + (on ? " is-on" : "") + '" data-view="' + v[0] + '">' + v[1] + "</button>";
              }).join("")
          + "</div></div>";

        h += '<div class="vq2-qt-split">';

        /* 左：分類と絞り込み */
        h += '<div class="vq2-qt-side"><nav class="vq2-qt-rails" aria-label="分類">' + railHtml(all) + "</nav>"
          + '<div class="vq2-qt-sidef">'
          + '<label class="vq2-check"><input type="checkbox" data-f="availableOnly"' + (st.availableOnly ? " checked" : "") + "><span>いま使えるものだけ</span></label>"
          + '<label class="vq2-check"><input type="checkbox" data-f="aiOnly"' + (st.aiOnly ? " checked" : "") + "><span>AI で作れるものだけ</span></label>"
          + '<select class="vq2-input vq2-select" data-f="subject" aria-label="科目でしぼる">'
          + '<option value="">すべての科目</option>'
          + Q.SUBJECTS.map(function (s) {
              return '<option value="' + s.id + '"' + (st.subject === s.id ? " selected" : "") + ">" + esc(s.label) + "</option>";
            }).join("") + "</select>"
          + "</div></div>";

        /* 右：結果 */
        h += '<div class="vq2-qt-main" role="listbox" aria-label="問題の形式">';
        h += '<div class="vq2-qt-count">' + list.length + " 種類"
          + (st.q ? "（「" + esc(st.q) + "」で検索）" : "") + "</div>";
        if (!list.length) {
          h += U.empty({ icon: "search", title: "見つかりませんでした",
                         body: "別の言葉で探すか、絞り込みを外してください。" });
        } else if (st.view !== "all" || st.q || st.category) {
          h += '<div class="vq2-qt-grid">' + list.map(cardHtml).join("") + "</div>";
        } else {
          Q.CATEGORIES.forEach(function (c) {
            var items = byCat[c.id];
            if (!items || !items.length) return;
            h += '<div class="vq2-qt-sec"><div class="vq2-qt-sech">' + icon(c.icon)
              + "<b>" + esc(c.label) + "</b><span class=\"vq2-muted\">" + esc(c.desc) + "</span>"
              + '<span class="vq2-top-sp"></span><span class="vq2-qt-cnt2">' + items.length + " 種類</span></div>"
              + '<div class="vq2-qt-grid">' + items.map(cardHtml).join("") + "</div></div>";
          });
        }
        h += "</div></div>";
        app.root.innerHTML = h;
        wire();
      }

      /* 描き直しても、読んでいた位置は動かさない。 */
      var mainTop = 0;
      function keepScroll() {
        var m = app.root.querySelector(".vq2-qt-main");
        if (m) mainTop = m.scrollTop;
      }
      function restoreScroll() {
        var m = app.root.querySelector(".vq2-qt-main");
        if (m && mainTop) m.scrollTop = mainTop;
      }

      /* 委ねる形の結線（app.root への U.on）は **1 回だけ**。
         U.on は外す仕組みを持たないので、描き直すたびに張ると聞き手が増え続ける。 */
      function wire() {
        var r = app.root;
        restoreScroll();
        /* 印は app.root へ（関数内 var は巻き上げで消えることがある） */
        if (r.__qtWired) return;
        r.__qtWired = true;
        U.on(r, "click", '[data-act="x"]', function () { app.close("user"); });
        U.on(r, "input", "[data-qt-q]", function (e, t) {
          st.q = t.value;
          var pos = t.selectionStart;
          mainTop = 0;                     /* 探し直したら先頭から見せる */
          render();
          var n = app.root.querySelector("[data-qt-q]");
          if (n) { n.focus({ preventScroll: true }); try { n.setSelectionRange(pos, pos); } catch (x) {} }
        });
        U.on(r, "click", "[data-qt-clear]", function () {
          st.q = ""; mainTop = 0; render();
          var n = app.root.querySelector("[data-qt-q]");
          if (n) n.focus({ preventScroll: true });
        });
        U.on(r, "click", "[data-cat]", function (e, t) { mainTop = 0; st.category = t.getAttribute("data-cat"); render(); });
        U.on(r, "click", "[data-view]", function (e, t) { mainTop = 0; st.view = t.getAttribute("data-view"); render(); });
        U.on(r, "change", '[data-f="availableOnly"]', function (e, t) { keepScroll(); st.availableOnly = t.checked; render(); });
        U.on(r, "change", '[data-f="aiOnly"]', function (e, t) { keepScroll(); st.aiOnly = t.checked; render(); });
        U.on(r, "change", '[data-f="subject"]', function (e, t) { keepScroll(); st.subject = t.value; render(); });
        U.on(r, "click", "[data-fav]", function (e, t) {
          e.stopPropagation();
          keepScroll();
          toggleFav(t.getAttribute("data-fav"));
          render();
        });
        U.on(r, "click", "[data-qt]", function (e, t) {
          if (t.closest("[data-fav]")) return;
          choose(t.getAttribute("data-qt"));
        });
        /* 矢印で隣のカードへ動かせる（形式が多いので、指と目だけに頼らせない） */
        U.on(r, "keydown", "[data-qt]", function (e, t) {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(t.getAttribute("data-qt")); return; }
          var dir = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1
                  : e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
          if (!dir) return;
          e.preventDefault();
          var all = [].slice.call(app.root.querySelectorAll("[data-qt]"));
          var i = all.indexOf(t);
          var next = all[i + dir];
          if (next) next.focus();
        });
      }

      function choose(id) {
        var d = Q.get(id);
        if (!d) return;
        if (d.status === "coming_soon") {
          app.toast("「" + d.name + "」はまだ使えません（準備中）。", "info");
          return;
        }
        if (d.status === "deprecated") {
          app.toast("「" + d.name + "」は今後使えなくなります。", "warning");
        }
        noteUsed(id);
        picked = id;
        app.close("picked");
      }

      render();
      var f = app.root.querySelector("[data-qt-q]");
      if (f) f.focus();
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     形式ごとの編集フォーム
     ・ここが受け持つのは「その形式だけが持つ構造」。
       問題文・配点・解説・単元などの共通項目は呼び出し側が出す。
     ══════════════════════════════════════════════════════════════════ */
  var HANDLED = {
    fill_blank: 1, reorder: 1, matching: 1, classification: 1, table_fill: 1,
    image_point: 1, image_label: 1, chart_read: 1, dictation: 1,
    error_correction: 1, flashcard: 1, composite: 1,
    text_input: 1, numeric_input: 1, image_choice: 1, audio_choice: 1
  };
  function engineOf(q) { return (q && q.engine) || Q.engineOf(q && q.type); }
  function handles(q) { return !!HANDLED[engineOf(q)]; }

  /* 足りない構造を足す。何度呼んでも同じ形になる。正解は作らない。 */
  function ensure(q) {
    if (!q) return q;
    var e = engineOf(q);
    var d = Q.get(q.type);
    var dfl = d ? d.defaults : {};
    if (e === "fill_blank" && !arr(q.blanks).length) {
      var n = isNum(dfl.blankCount) ? dfl.blankCount : 1;
      q.blanks = [];
      for (var i = 0; i < n; i++) q.blanks.push({ id: "b" + (i + 1), label: String(i + 1), answer: "", acceptedAnswers: [] });
    }
    if (e === "reorder" && !arr(q.orderItems).length) {
      /* 旧い並べ替えは選択肢に入っている。移し替える（消さない）。 */
      if (arr(q.choices).length) {
        q.orderItems = q.choices.map(function (c, i) {
          return { id: c.id, text: c.text, order: isNum(c.order) ? c.order : i + 1 };
        });
      } else {
        q.orderItems = [1, 2, 3].map(function (k) { return { id: "i" + k, text: "", order: k }; });
      }
      if (!arr(q.correctOrder).length)
        q.correctOrder = q.orderItems.slice().sort(function (a, b) { return a.order - b.order; })
          .map(function (x) { return x.id; });
    }
    if (e === "matching" && !q.pairs) {
      q.pairs = {
        left: [1, 2, 3].map(function (k) { return { id: "L" + k, text: "" }; }),
        right: [1, 2, 3].map(function (k) { return { id: "R" + k, text: "" }; }),
        correct: isObj(q.correctAnswer) ? clone(q.correctAnswer) : { L1: "R1", L2: "R2", L3: "R3" }
      };
    }
    if (e === "classification" && !q.classification) {
      q.classification = {
        groups: [{ id: "g1", label: "" }, { id: "g2", label: "" }],
        items: [1, 2, 3, 4].map(function (k) { return { id: "t" + k, text: "", groupId: "" }; })
      };
    }
    if (e === "table_fill" && !q.table) {
      q.table = {
        columns: [{ id: "col1", text: "" }, { id: "col2", text: "" }],
        rows: [1, 2].map(function (r) {
          return { id: "r" + r, header: "", cells: [
            { id: "r" + r + "c1", text: "", editable: false },
            { id: "r" + r + "c2", text: "", editable: true, answer: "", acceptedAnswers: [] }] };
        })
      };
    }
    if (e === "image_point" && !arr(q.hotspots).length)
      q.hotspots = [{ id: "h1", shape: "circle", x: 0.5, y: 0.5, r: 0.06, label: "" }];
    if (e === "image_label" && !q.labels)
      q.labels = { slots: [{ id: "s1", x: 0.35, y: 0.4, answerId: "lb1" }, { id: "s2", x: 0.65, y: 0.6, answerId: "lb2" }],
                   bank: [{ id: "lb1", text: "" }, { id: "lb2", text: "" }] };
    if (e === "chart_read" && !q.chart)
      q.chart = { kind: "bar", title: "", categories: ["", "", ""], series: [{ id: "s1", name: "系列1", values: [0, 0, 0] }] };
    if (e === "error_correction" && !arr(q.errorSpans).length)
      q.errorSpans = [{ id: "e1", wrong: "", correct: "", acceptedAnswers: [] }];
    if (e === "flashcard" && !q.card)
      q.card = { front: str(q.prompt), back: str(q.correctAnswer) };
    if (e === "composite" && !arr(q.children).length)
      q.children = [M.empty("multiple_choice_single", { points: 5 })];
    if (!q.settings) q.settings = M.normalizeSettings(null, q.type);
    if (!q.scoringRule) q.scoringRule = M.normalizeScoringRule(null, q.type, q);
    return q;
  }

  function row(label, inner, hint) {
    return '<div class="vq2-field"><label class="vq2-label">' + esc(label) + "</label>" + inner
      + (hint ? '<div class="vq2-hint">' + esc(hint) + "</div>" : "") + "</div>";
  }
  function textIn(key, value, ph, extra) {
    return '<input type="text" class="vq2-input" data-qe="' + esc(key) + '" value="' + esc(str(value))
      + '" placeholder="' + esc(ph || "") + '"' + (extra || "") + ">";
  }
  function numIn(key, value, o) {
    o = o || {};
    return '<input type="number" class="vq2-input" data-qe="' + esc(key) + '" value="' + esc(str(value)) + '"'
      + (isNum(o.min) ? ' min="' + o.min + '"' : "") + (isNum(o.max) ? ' max="' + o.max + '"' : "")
      + (o.step ? ' step="' + o.step + '"' : "") + ">";
  }
  function checkIn(key, on, label, hint) {
    return '<label class="vq2-check"><input type="checkbox" data-qe="' + esc(key) + '"' + (on ? " checked" : "") + ">"
      + "<span>" + esc(label) + (hint ? '<br><span class="vq2-hint">' + esc(hint) + "</span>" : "") + "</span></label>";
  }
  function selIn(key, value, options) {
    return '<select class="vq2-input vq2-select" data-qe="' + esc(key) + '">'
      + options.map(function (o) {
          return '<option value="' + esc(o.value) + '"' + (str(value) === str(o.value) ? " selected" : "") + ">" + esc(o.label) + "</option>";
        }).join("") + "</select>";
  }
  function delBtn(key, id, aria) {
    return btn({ icon: "trash", iconOnly: true, size: "sm", variant: "quiet",
                 action: "qe-del", id: key + ":" + id, aria: aria || "削除" });
  }
  function addBtn(key, label) {
    return btn({ label: label, icon: "plus", size: "sm", action: "qe-add", id: key });
  }

  /* ── フォーム本体 ────────────────────────────────────────────── */
  function formHtml(q) {
    ensure(q);
    var e = engineOf(q);
    var st = q.settings || {};
    var sr = q.scoringRule || {};
    var h = "";

    /* 音声穴埋め・音声並べ替えなど、形の枝が音声を知らない形式。
       原稿と声の欄をここで先に出す（枝の中で二重に出さない）。 */
    if (needsSpeech(q.type) && e !== "audio_choice" && e !== "dictation") h += speechRows(q);

    if (e === "text_input" || e === "numeric_input" || e === "dictation") {
      if (e !== "dictation") {
        h += row("正解", textIn("correctAnswer", q.correctAnswer, "正解を入力します"));
      } else {
        h += row("正しい文", '<textarea class="vq2-input" data-qe="correctAnswer" rows="3" placeholder="聞こえるとおりの文">'
          + esc(str(q.correctAnswer)) + "</textarea>", "語ごとに部分点が付きます。この文がそのまま読み上げられます。");
        h += speechRows(q, { script: false });
      }
      h += row("別解（1 行に 1 つ）",
        '<textarea class="vq2-input" data-qe="acceptedAnswers" rows="2">' + esc(arr(q.acceptedAnswers).join("\n")) + "</textarea>",
        "表記のゆれや言い換えを書いておくと正解として扱われます。");
      if (e === "numeric_input") {
        h += '<div class="vq2-grid c2">'
          + row("許容誤差", numIn("scoringRule.tolerance", sr.tolerance, { step: "any", min: 0 }), "この幅までは正解にします。")
          + row("単位", textIn("scoringRule.unit", sr.unit, "例: cm"))
          + "</div>"
          + checkIn("scoringRule.unitRequired", sr.unitRequired, "単位も書かせる", "単位が無いときは満点にしません。");
      } else {
        h += row("合わせ方", selIn("scoringRule.mode", sr.mode || "exact", [
          { value: "exact", label: "完全一致（正規化してから比べる）" },
          { value: "partial", label: "部分一致（含まれていれば正解）" },
          { value: "keyword", label: "キーワード（決めた語が入っていれば正解）" },
          { value: "fuzzy", label: "表記ゆれを許す（似ていれば正解）" }
        ]));
        if (sr.mode === "keyword") {
          h += row("キーワード（カンマ区切り）", textIn("scoringRule.keywords", arr(sr.keywords).join(", "), "例: 参勤交代, 財政"),
                   "含まれていた数で部分点が付きます。");
          h += row("いくつ入っていれば正解にするか", numIn("scoringRule.keywordThreshold", sr.keywordThreshold, { min: 1, step: 1 }));
        }
        h += '<div class="vq2-grid c2">'
          + checkIn("scoringRule.caseSensitive", sr.caseSensitive, "大文字と小文字を区別する")
          + checkIn("scoringRule.ignoreSpace", sr.ignoreSpace, "空白を無視する")
          + checkIn("scoringRule.kanaInsensitive", sr.kanaInsensitive, "ひらがな・カタカナを区別しない")
          + checkIn("scoringRule.requireKanji", sr.requireKanji, "漢字で書かせる")
          + "</div>";
      }
      h += settingsRow(q);
      return h;
    }

    if (e === "fill_blank") {
      h += row("空欄の入れ方", selIn("settings.blankMode", st.blankMode || "input", [
        { value: "input", label: "打ち込む" },
        { value: "select", label: "選択肢から選ぶ" },
        { value: "drag", label: "語群から運ぶ" }
      ]));
      if (st.hasContext || str(q.context))
        h += row("本文・資料", '<textarea class="vq2-input" data-qe="context" rows="5" placeholder="空欄を含む本文">'
          + esc(str(q.context)) + "</textarea>", "空欄の場所は【　】のように書いておくと読みやすくなります。");
      h += '<div class="vq2-label" style="margin:12px 0 8px">空欄と正解</div>';
      arr(q.blanks).forEach(function (b, i) {
        h += '<div class="vq2-qe-item">'
          + '<div class="vq2-qe-ih"><span class="vq2-qe-n">' + (i + 1) + "</span>"
          + '<span class="vq2-top-sp"></span>' + delBtn("blank", b.id, "この空欄を削除") + "</div>"
          + row("正解", textIn("blank:" + b.id + ":answer", b.answer, "空欄に入る言葉"))
          + row("別解（カンマ区切り）", textIn("blank:" + b.id + ":accepted", arr(b.acceptedAnswers).join(", ")))
          + '<div class="vq2-grid c2">'
          + row("配点（空欄ごと）", numIn("blank:" + b.id + ":points", b.points, { min: 0, step: "any" }))
          + (st.blankMode === "select"
              ? row("選択肢（カンマ区切り）", textIn("blank:" + b.id + ":options", arr(b.options).map(function (o) { return o.text; }).join(", ")))
              : "")
          + "</div></div>";
      });
      h += addBtn("blank", "空欄を追加");
      if (st.blankMode === "drag")
        h += row("語群（カンマ区切り。空なら正解から自動で作ります）",
                 textIn("wordBank", arr(q.wordBank).map(function (w) { return typeof w === "string" ? w : w.text; }).join(", ")));
      h += settingsRow(q);
      return h;
    }

    if (e === "reorder") {
      h += '<div class="vq2-hint" style="margin-bottom:8px">上から「正しい順」で並べます。出題では自動で並びをくずします。</div>';
      var order = arr(q.correctOrder).length ? q.correctOrder : arr(q.orderItems).map(function (x) { return x.id; });
      var byId = Object.create(null);
      arr(q.orderItems).forEach(function (x) { byId[x.id] = x; });
      order.forEach(function (id, i) {
        var it = byId[id];
        if (!it) return;
        h += '<div class="vq2-qe-item is-row">'
          + '<span class="vq2-qe-n">' + (i + 1) + "</span>"
          + textIn("item:" + id + ":text", it.text, "項目 " + (i + 1))
          + btn({ icon: "chevronU", iconOnly: true, size: "sm", variant: "quiet", action: "qe-up", id: id, aria: "上へ", disabled: i === 0 })
          + btn({ icon: "chevronD", iconOnly: true, size: "sm", variant: "quiet", action: "qe-down", id: id, aria: "下へ", disabled: i === order.length - 1 })
          + delBtn("item", id, "この項目を削除")
          + "</div>";
      });
      h += addBtn("item", "項目を追加");
      h += settingsRow(q);
      return h;
    }

    if (e === "matching") {
      var p = q.pairs;
      h += '<div class="vq2-hint" style="margin-bottom:8px">左の項目ごとに、正しい相手を選びます。右にだけある項目は「使わない項目」になります。</div>';
      h += '<div class="vq2-label">左の項目と、その相手</div>';
      arr(p.left).forEach(function (l) {
        h += '<div class="vq2-qe-item is-row">'
          + textIn("left:" + l.id + ":text", l.text, "左の項目")
          + '<span class="vq2-qe-ar">→</span>'
          + selIn("pair:" + l.id, p.correct ? p.correct[l.id] : "",
              [{ value: "", label: "選んでください" }].concat(arr(p.right).map(function (r2) {
                return { value: r2.id, label: r2.text || r2.id };
              })))
          + delBtn("left", l.id, "この行を削除")
          + "</div>";
      });
      h += addBtn("left", "左の項目を追加");
      h += '<div class="vq2-label" style="margin-top:14px">右の項目</div>';
      arr(p.right).forEach(function (r2) {
        h += '<div class="vq2-qe-item is-row">'
          + textIn("right:" + r2.id + ":text", r2.text, "右の項目")
          + checkIn("right:" + r2.id + ":dummy", r2.isDummy, "使わない項目にする")
          + delBtn("right", r2.id, "この項目を削除")
          + "</div>";
      });
      h += addBtn("right", "右の項目を追加");
      h += settingsRow(q);
      return h;
    }

    if (e === "classification") {
      var c = q.classification;
      h += '<div class="vq2-label">分け先</div>';
      arr(c.groups).forEach(function (g) {
        h += '<div class="vq2-qe-item is-row">'
          + textIn("group:" + g.id + ":label", g.label, "分け先の名前")
          + checkIn("group:" + g.id + ":ex", g.isExclude, "「除外」の箱にする")
          + delBtn("group", g.id, "この分け先を削除")
          + "</div>";
      });
      h += addBtn("group", "分け先を追加");
      h += '<div class="vq2-label" style="margin-top:14px">分ける項目</div>';
      arr(c.items).forEach(function (it) {
        h += '<div class="vq2-qe-item is-row">'
          + textIn("citem:" + it.id + ":text", it.text, "項目")
          + '<span class="vq2-qe-ar">→</span>'
          + selIn("citem:" + it.id + ":group", it.groupId,
              [{ value: "", label: "選んでください" }].concat(arr(c.groups).map(function (g) {
                return { value: g.id, label: g.label || g.id };
              })))
          + delBtn("citem", it.id, "この項目を削除")
          + "</div>";
      });
      h += addBtn("citem", "項目を追加");
      h += settingsRow(q);
      return h;
    }

    if (e === "table_fill") {
      var t = q.table;
      h += row("表の見出し（キャプション）", textIn("table.caption", t.caption, "任意"));
      h += '<div class="vq2-label" style="margin:12px 0 8px">列</div><div class="vq2-qe-item is-row">'
        + arr(t.columns).map(function (col) {
            return textIn("col:" + col.id + ":text", col.text, "列名");
          }).join("")
        + addBtn("col", "列を追加") + "</div>";
      h += '<div class="vq2-label" style="margin:12px 0 8px">ます（チェックを入れたますを解答欄にします）</div>';
      arr(t.rows).forEach(function (r2, ri) {
        h += '<div class="vq2-qe-item"><div class="vq2-qe-ih"><span class="vq2-qe-n">' + (ri + 1) + "</span>"
          + textIn("row:" + r2.id + ":header", r2.header, "行の見出し（任意）")
          + '<span class="vq2-top-sp"></span>' + delBtn("row", r2.id, "この行を削除") + "</div>";
        arr(r2.cells).forEach(function (cell, ci) {
          h += '<div class="vq2-qe-item is-row">'
            + '<span class="vq2-qe-n">' + (ci + 1) + "</span>"
            + (cell.editable
                ? textIn("cell:" + cell.id + ":answer", cell.answer, "このますの正解")
                : textIn("cell:" + cell.id + ":text", cell.text, "表に書いておく文字"))
            + checkIn("cell:" + cell.id + ":edit", cell.editable, "解答欄にする")
            + "</div>";
        });
        h += "</div>";
      });
      h += addBtn("row", "行を追加");
      h += settingsRow(q);
      return h;
    }

    if (e === "image_point" || e === "image_label") {
      h += mediaRow(q, "image", "画像");
      h += '<div class="vq2-hint" style="margin-bottom:10px">下の画像を押すと、その場所を'
        + (e === "image_point" ? "正解の場所" : "ラベルを置く場所") + "として取り込みます。</div>";
      h += '<div class="vq2-qe-canvas" data-qe-canvas>' + spotEditorHtml(q, e) + "</div>";
      if (e === "image_point") {
        arr(q.hotspots).forEach(function (hs, i) {
          h += '<div class="vq2-qe-item"><div class="vq2-qe-ih"><span class="vq2-qe-n">' + (i + 1) + "</span>"
            + '<span class="vq2-top-sp"></span>' + delBtn("hotspot", hs.id, "この場所を削除") + "</div>"
            + '<div class="vq2-grid c3">'
            + row("名前", textIn("hotspot:" + hs.id + ":label", hs.label, "例: 平城京"))
            + row("形", selIn("hotspot:" + hs.id + ":shape", hs.shape, [
                { value: "circle", label: "円" }, { value: "rect", label: "四角" }]))
            + row("許容範囲", numIn("hotspot:" + hs.id + ":tol", isNum(hs.r) ? hs.r : hs.tolerance, { min: 0.01, max: 0.5, step: 0.01 }))
            + "</div></div>";
        });
        h += addBtn("hotspot", "正解の場所を追加");
        h += checkIn("settings.multiPoint", st.multiPoint, "複数の場所を押させる", "見つけた数だけ部分点が付きます。");
        h += checkIn("settings.zoomEnabled", st.zoomEnabled !== false, "拡大できるようにする");
      } else {
        h += '<div class="vq2-label" style="margin:12px 0 8px">ラベル</div>';
        arr(q.labels.bank).forEach(function (b) {
          h += '<div class="vq2-qe-item is-row">'
            + textIn("label:" + b.id + ":text", b.text, "ラベルの文字")
            + checkIn("label:" + b.id + ":dummy", b.isDummy, "使わないラベルにする")
            + delBtn("label", b.id, "このラベルを削除") + "</div>";
        });
        h += addBtn("label", "ラベルを追加");
        h += '<div class="vq2-label" style="margin:12px 0 8px">置く場所と、そこに入るラベル</div>';
        arr(q.labels.slots).forEach(function (s2, i) {
          h += '<div class="vq2-qe-item is-row">'
            + '<span class="vq2-qe-n">' + (i + 1) + "</span>"
            + selIn("slot:" + s2.id + ":answer", s2.answerId,
                [{ value: "", label: "選んでください" }].concat(arr(q.labels.bank).map(function (b) {
                  return { value: b.id, label: b.text || b.id };
                })))
            + delBtn("slot", s2.id, "この場所を削除") + "</div>";
        });
      }
      h += settingsRow(q);
      return h;
    }

    if (e === "chart_read") {
      var ch = q.chart;
      h += '<div class="vq2-grid c3">'
        + row("図の種類", selIn("chart.kind", ch.kind, [
            { value: "bar", label: "棒グラフ" }, { value: "line", label: "折れ線" },
            { value: "table", label: "表" }, { value: "image", label: "画像を使う" }]))
        + row("題", textIn("chart.title", ch.title, "例: 年別の輸出額"))
        + row("単位", textIn("chart.unit", ch.unit, "例: 億円"))
        + "</div>";
      if (ch.kind === "image") {
        h += mediaRow(q, "image", "図の画像");
      } else if (ch.kind !== "table") {
        h += row("横軸の目盛り（カンマ区切り）", textIn("chart.categories", arr(ch.categories).join(", "), "例: 1970, 1980, 1990"));
        arr(ch.series).forEach(function (s2) {
          h += '<div class="vq2-qe-item is-row">'
            + textIn("series:" + s2.id + ":name", s2.name, "系列名")
            + textIn("series:" + s2.id + ":values", arr(s2.values).join(", "), "値をカンマ区切りで")
            + delBtn("series", s2.id, "この系列を削除") + "</div>";
        });
        h += addBtn("series", "系列を追加");
      }
      h += row("答え方", selIn("settings.answerKind", st.answerKind || "choice", [
        { value: "choice", label: "選択肢から選ぶ" }, { value: "numeric", label: "数で答える" }]));
      if (st.answerKind === "numeric") {
        h += row("正解（数）", textIn("correctAnswer", q.correctAnswer, "例: 1200"));
        h += row("許容誤差", numIn("scoringRule.tolerance", sr.tolerance, { min: 0, step: "any" }));
      } else {
        h += choicesFormHtml(q);
      }
      h += settingsRow(q);
      return h;
    }

    if (e === "error_correction") {
      h += '<div class="vq2-hint" style="margin-bottom:8px">問題文の中に出てくる語をそのまま「誤っている語」に書きます。問題文と一致していないと印を付けられません。</div>';
      arr(q.errorSpans).forEach(function (sp, i) {
        h += '<div class="vq2-qe-item"><div class="vq2-qe-ih"><span class="vq2-qe-n">' + (i + 1) + "</span>"
          + '<span class="vq2-top-sp"></span>' + delBtn("span", sp.id, "この箇所を削除") + "</div>"
          + '<div class="vq2-grid c2">'
          + row("誤っている語", textIn("span:" + sp.id + ":wrong", sp.wrong, "例: don't"))
          + row("正しい形", textIn("span:" + sp.id + ":correct", sp.correct, "例: doesn't"))
          + "</div>"
          + row("別解（カンマ区切り）", textIn("span:" + sp.id + ":accepted", arr(sp.acceptedAnswers).join(", ")))
          + "</div>";
      });
      h += addBtn("span", "誤りの箇所を追加");
      h += settingsRow(q);
      return h;
    }

    if (e === "flashcard") {
      h += '<div class="vq2-grid c2">'
        + row("表", '<textarea class="vq2-input" data-qe="card.front" rows="3" placeholder="思い出すきっかけ">' + esc(str(q.card.front)) + "</textarea>")
        + row("裏", '<textarea class="vq2-input" data-qe="card.back" rows="3" placeholder="答え">' + esc(str(q.card.back)) + "</textarea>")
        + "</div>";
      h += row("最初に見せる面", selIn("settings.face", st.face || "front", [
        { value: "front", label: "表から" }, { value: "back", label: "裏から（逆引き）" }]));
      h += settingsRow(q);
      return h;
    }

    if (e === "image_choice" || e === "audio_choice") {
      if (e === "audio_choice") h += speechRows(q);
      h += '<div class="vq2-label" style="margin:12px 0 8px">'
        + (e === "image_choice" ? "選択肢の画像" : "選択肢") + "</div>";
      arr(q.choices).forEach(function (c2, i) {
        h += '<div class="vq2-qe-item">'
          + '<div class="vq2-qe-ih"><span class="vq2-qe-n">' + esc(c2.label || letter(i)) + "</span>"
          + btn({ icon: "check", iconOnly: true, size: "sm", variant: c2.isCorrect ? "primary" : "quiet",
                  action: "qe-correct", id: c2.id, aria: "正解にする", pressed: c2.isCorrect })
          + '<span class="vq2-top-sp"></span>' + delBtn("choice", c2.id, "この選択肢を削除") + "</div>"
          + row("説明（表示される文字）", textIn("choice:" + c2.id + ":text", c2.text, "任意"))
          + (e === "image_choice"
              ? row("画像", imagePickHtml("choice:" + c2.id + ":image", c2.image))
              : row("この選択肢の音声（任意）", imagePickHtml("choice:" + c2.id + ":audio", c2.audio, "audio")))
          + "</div>";
      });
      h += addBtn("choice", "選択肢を追加");
      h += settingsRow(q);
      return h;
    }

    if (e === "composite") {
      h += row("共通の指示文", textIn("instruction", q.instruction, "例: 次の英文を読んで、あとの問いに答えなさい。"));
      h += row("共通の資料（本文）", '<textarea class="vq2-input" data-qe="context" rows="8" placeholder="長文・会話文・資料など">'
        + esc(str(q.context)) + "</textarea>");
      h += mediaRow(q, "image", "資料の画像（任意）");
      h += '<div class="vq2-label" style="margin:14px 0 8px">小問（' + arr(q.children).length + " 問／合計 " + (q.points || 0) + " 点）</div>";
      arr(q.children).forEach(function (c2, i) {
        h += '<div class="vq2-qe-item">'
          + '<div class="vq2-qe-ih"><span class="vq2-qe-n">' + (i + 1) + "</span>"
          + '<span class="vq2-qe-t">' + esc(Q.shortLabel(c2.type)) + "</span>"
          + btn({ label: "形式を変える", size: "sm", variant: "quiet", action: "qe-child-type", id: c2.id })
          + btn({ label: "小問を編集", size: "sm", variant: "quiet", action: "qe-child-edit", id: c2.id })
          + '<span class="vq2-top-sp"></span>'
          + btn({ icon: "chevronU", iconOnly: true, size: "sm", variant: "quiet", action: "qe-child-up", id: c2.id, aria: "上へ", disabled: i === 0 })
          + btn({ icon: "chevronD", iconOnly: true, size: "sm", variant: "quiet", action: "qe-child-down", id: c2.id, aria: "下へ", disabled: i === arr(q.children).length - 1 })
          + delBtn("child", c2.id, "この小問を削除") + "</div>"
          + row("小問の問題文", textIn("child:" + c2.id + ":prompt", c2.prompt, "小問 " + (i + 1)))
          + row("配点", numIn("child:" + c2.id + ":points", c2.points, { min: 0, step: "any" }))
          + "</div>";
      });
      h += addBtn("child", "小問を追加");
      h += checkIn("settings.stickyContext", st.stickyContext !== false, "資料を画面に固定する",
                   "小問を進めても資料が見えたままになります。");
      return h;
    }

    return "";
  }

  /* 制限時間・再生回数など、どの形式でも意味がある設定。 */
  function settingsRow(q) {
    var st = q.settings || {};
    var d = Q.get(q.type);
    var h = '<details class="vq2-qe-more"><summary>この問題だけの細かい設定</summary><div class="vq2-grid c2">';
    h += row("1 問の制限時間（秒。0 でなし）", numIn("settings.timeLimit", st.timeLimit, { min: 0, max: 7200, step: 1 }));
    if (d && d.supportsMedia && (q.engine === "audio_choice" || q.engine === "dictation" || M.firstMedia(q, "audio")))
      h += row("聞ける回数（0 で何回でも）", numIn("settings.replayLimit", st.replayLimit, { min: 0, max: 20, step: 1 }));
    if (Q.hasChoices(q.type))
      h += '<div>' + checkIn("settings.shuffleOptions", st.shuffleOptions !== false, "選択肢の並びをくずす") + "</div>";
    if (Q.supportsPartial(q.type))
      h += '<div>' + checkIn("scoringRule.partialCredit", (q.scoringRule || {}).partialCredit !== false, "部分点を付ける") + "</div>";
    if (d && d.supportsConfidence)
      h += '<div>' + checkIn("settings.confidenceEnabled", st.confidenceEnabled, "自信度も聞く") + "</div>";
    h += "</div></details>";
    return h;
  }

  /* ── 読み上げ ───────────────────────────────────────────────────
     原稿が本体。音声ファイルは「自分で録った音を使いたいとき」だけ。
     声はこの問題だけの上書きで、選ばなければプリセット全体の設定が効く。 */
  function speechRows(q, o) {
    o = o || {};
    var h = "";
    if (o.script !== false) {
      h += row("読み上げる原稿",
        '<textarea class="vq2-input" data-qe="script" rows="3" placeholder="実際に読み上げる文。会話は「A: … / B: …」の形で書きます">'
          + esc(str(q.script)) + "</textarea>",
        "ここに書いた文をそのまま読み上げます。音声ファイルを選んだときは、そちらが優先されます。");
    } else {
      h += '<div class="vq2-hint" style="margin:0 0 8px">上の「正しい文」がそのまま読み上げられます。</div>';
    }
    h += row("この問題の声", voiceRowHtml(q),
      "選ばなければ、プリセット全体で決めた声を使います。");
    h += row("自分で用意した音声（任意）", imagePickHtml("media:audio", audioSrc(q), "audio"),
      "選ぶと、読み上げではなくこの音声が流れます。");
    return h;
  }
  function audioSrc(q) { var m = M.firstMedia(q, "audio"); return m ? m.src : ""; }
  /* 読み上げが要る形式か。決まりは qplan の 1 か所だけに置く（二重管理しない）。 */
  function needsSpeech(type) {
    var N = VQ2.qplan && VQ2.qplan.NEEDS;
    return !!(N && N[type] === "speech");
  }
  function voiceRowHtml(q) {
    var VP = VQ2.voicePicker;
    var label = VP ? VP.labelOf(q.voice, "プリセットの声を使う") : (str(q.voice) || "プリセットの声を使う");
    var hue = VP ? VP.hueOf(q.voice || "auto") : 28;
    var sp = ((VP && VP.SPEEDS) || []).filter(function (x) { return x.v === (Number(q.speed) || 1); })[0];
    return '<div class="vq2-ap-row">'
      + '<span class="vq2-vc-dot" style="--vp-h:' + hue + '"></span>'
      + '<div style="flex:1 1 auto;min-width:0">'
      + '<div class="vq2-vc-name">' + esc(label) + "</div>"
      + '<div class="vq2-vc-sub">話す速さ：' + esc(q.speed ? (sp ? sp.label : "×" + q.speed) : "プリセットのまま") + "</div>"
      + "</div>"
      + btn({ label: "声を選ぶ", icon: "audio", size: "sm", action: "qe-voice" })
      + btn({ label: "試し聞き", icon: "play", size: "sm", variant: "quiet", action: "qe-voice-try" })
      + (q.voice ? btn({ label: "戻す", size: "sm", variant: "quiet", action: "qe-voice-clear" }) : "")
      + "</div>";
  }

  function mediaRow(q, kind, label) {
    var m = M.firstMedia(q, kind);
    return row(label, imagePickHtml("media:" + kind, m ? m.src : "", kind),
      kind === "image" ? "端末の中の画像を取り込みます（外のアドレスは使えません）。"
                       : "端末の中の音声を取り込みます。");
  }
  function imagePickHtml(key, value, kind) {
    kind = kind || "image";
    var has = !!str(value);
    return '<div class="vq2-qe-pick">'
      + btn({ label: has ? "選び直す" : (kind === "audio" ? "音声を選ぶ" : "画像を選ぶ"),
              icon: "upload", size: "sm", action: "qe-pick", id: key + "|" + kind })
      + (has ? btn({ label: "外す", icon: "close", size: "sm", variant: "quiet", action: "qe-unpick", id: key }) : "")
      + (has && kind === "image" ? '<img class="vq2-qe-thumb" src="' + esc(value) + '" alt="">' : "")
      + (has && kind === "audio" ? '<audio controls preload="none" src="' + esc(value) + '" style="max-width:220px"></audio>' : "")
      + (has ? "" : '<span class="vq2-hint">まだありません</span>')
      + "</div>";
  }

  /* 画像の上で場所を決める小さな編集器。 */
  function spotEditorHtml(q, e) {
    var m = M.firstMedia(q, "image");
    if (!m) return '<div class="vq2-muted">画像を選ぶと、ここで場所を決められます。</div>';
    var marks = "";
    if (e === "image_point") {
      marks = arr(q.hotspots).map(function (h, i) {
        var d = (isNum(h.r) ? h.r : (h.tolerance || 0.05)) * 2 * 100;
        return '<span class="vq2-qe-spot" data-spot="' + esc(h.id) + '" style="left:' + (h.x * 100) + "%;top:" + (h.y * 100)
          + "%;width:" + d + "%;padding-bottom:" + d + '%"><b>' + (i + 1) + "</b></span>";
      }).join("");
    } else {
      marks = arr(q.labels && q.labels.slots).map(function (s, i) {
        return '<span class="vq2-qe-slot" data-slot="' + esc(s.id) + '" style="left:' + (s.x * 100) + "%;top:" + (s.y * 100) + '%">'
          + (i + 1) + "</span>";
      }).join("");
    }
    return '<div class="vq2-qe-stage" data-qe-stage>'
      + '<img src="' + esc(m.src) + '" alt="" draggable="false">' + marks + "</div>";
  }

  /* ══════════════════════════════════════════════════════════════════
     結線
     ・onChange(q, why) を呼ぶだけ。保存や取り消しは呼び出し側が持つ。
     ══════════════════════════════════════════════════════════════════ */
  function bindForm(container, q, o) {
    o = o || {};
    var onChange = o.onChange || function () {};
    var app = o.app || null;

    function changed(why) { onChange(q, why || "問題を編集"); }
    function repaint(why) { changed(why); if (o.onRepaint) o.onRepaint(); }
    function newId(p) { return p + "_" + Math.random().toString(36).slice(2, 7); }

    function setPath(path, value) {
      var seg = path.split(".");
      var t = q;
      for (var i = 0; i < seg.length - 1; i++) {
        if (!isObj(t[seg[i]])) t[seg[i]] = {};
        t = t[seg[i]];
      }
      t[seg[seg.length - 1]] = value;
    }
    function find(list, id) { return arr(list).filter(function (x) { return x.id === id; })[0]; }
    /* 試し聞きに使う文。原稿が無い間は、決まり文句で声だけ確かめられるようにする。 */
    function sampleScript(qq) {
      var T = VQ2.tts;
      var s = T && T.scriptOf ? T.scriptOf(qq) : str(qq.script);
      if (s) return s;
      return "これは声の確かめです。";
    }

    function applyKey(key, el) {
      var v = el.type === "checkbox" ? el.checked : el.value;
      var num = el.type === "number";
      var parts = key.split(":");

      if (parts.length === 1) {
        if (key === "acceptedAnswers") { q.acceptedAnswers = String(v).split("\n").map(function (s) { return s.trim(); }).filter(Boolean); }
        else if (key === "wordBank") { q.wordBank = String(v).split(",").map(function (s) { return s.trim(); }).filter(Boolean); }
        else if (key.indexOf(".") > 0) {
          if (key === "scoringRule.keywords") setPath(key, String(v).split(",").map(function (s) { return s.trim(); }).filter(Boolean));
          else if (key === "chart.categories") setPath(key, String(v).split(",").map(function (s) { return s.trim(); }));
          else setPath(key, num ? (v === "" ? null : Number(v)) : v);
        }
        else q[key] = num ? (v === "" ? null : Number(v)) : v;
        changed();
        return;
      }
      var kind = parts[0], id = parts[1], field = parts[2];

      if (kind === "blank") {
        var b = find(q.blanks, id); if (!b) return;
        if (field === "answer") b.answer = v;
        else if (field === "accepted") b.acceptedAnswers = String(v).split(",").map(function (s) { return s.trim(); }).filter(Boolean);
        else if (field === "points") b.points = v === "" ? null : Number(v);
        else if (field === "options") b.options = String(v).split(",").map(function (s, i) { return { id: "o" + (i + 1), text: s.trim() }; }).filter(function (x) { return x.text; });
      } else if (kind === "item") {
        var it = find(q.orderItems, id); if (!it) return;
        it.text = v;
      } else if (kind === "left" || kind === "right") {
        var side = kind === "left" ? q.pairs.left : q.pairs.right;
        var x = find(side, id); if (!x) return;
        if (field === "text") x.text = v; else if (field === "dummy") x.isDummy = !!v;
      } else if (kind === "pair") {
        q.pairs.correct = q.pairs.correct || {};
        if (v) q.pairs.correct[id] = v; else delete q.pairs.correct[id];
        q.correctAnswer = clone(q.pairs.correct);
      } else if (kind === "group") {
        var g = find(q.classification.groups, id); if (!g) return;
        if (field === "label") g.label = v; else if (field === "ex") g.isExclude = !!v;
      } else if (kind === "citem") {
        var ci = find(q.classification.items, id); if (!ci) return;
        if (field === "text") ci.text = v; else if (field === "group") ci.groupId = v;
      } else if (kind === "col") {
        var col = find(q.table.columns, id); if (!col) return;
        col.text = v;
      } else if (kind === "row") {
        var rw = find(q.table.rows, id); if (!rw) return;
        rw.header = v;
      } else if (kind === "cell") {
        var cell = null;
        arr(q.table.rows).forEach(function (rr) { arr(rr.cells).forEach(function (cc) { if (cc.id === id) cell = cc; }); });
        if (!cell) return;
        if (field === "answer") cell.answer = v;
        else if (field === "text") cell.text = v;
        else if (field === "edit") { cell.editable = !!v; repaint("解答欄を変更"); return; }
      } else if (kind === "hotspot") {
        var hs = find(q.hotspots, id); if (!hs) return;
        if (field === "label") hs.label = v;
        else if (field === "shape") { hs.shape = v; repaint("形を変更"); return; }
        else if (field === "tol") { var n = Number(v) || 0.05; hs.tolerance = n; if (hs.shape !== "rect") hs.r = n; repaint("許容範囲を変更"); return; }
      } else if (kind === "label") {
        var lb = find(q.labels.bank, id); if (!lb) return;
        if (field === "text") lb.text = v; else if (field === "dummy") lb.isDummy = !!v;
        if (field === "text") repaint("ラベルを編集");
      } else if (kind === "slot") {
        var sl = find(q.labels.slots, id); if (!sl) return;
        sl.answerId = v;
      } else if (kind === "series") {
        var se = find(q.chart.series, id); if (!se) return;
        if (field === "name") se.name = v;
        else if (field === "values") se.values = String(v).split(",").map(function (s) { var n2 = Number(s.trim()); return isNum(n2) ? n2 : null; });
      } else if (kind === "span") {
        var sp = find(q.errorSpans, id); if (!sp) return;
        if (field === "wrong") sp.wrong = v;
        else if (field === "correct") sp.correct = v;
        else if (field === "accepted") sp.acceptedAnswers = String(v).split(",").map(function (s) { return s.trim(); }).filter(Boolean);
      } else if (kind === "choice") {
        var c2 = find(q.choices, id); if (!c2) return;
        if (field === "text") c2.text = v;
        else if (field === "image") { c2.image = v; repaint("選択肢の画像を変更"); return; }
        else if (field === "audio") { c2.audio = v; repaint("選択肢の音声を変更"); return; }
      } else if (kind === "child") {
        var ch = find(q.children, id); if (!ch) return;
        if (field === "prompt") ch.prompt = v;
        else if (field === "points") { ch.points = Number(v) || 0; recomputeComposite(); repaint("小問の配点を変更"); return; }
      } else if (kind === "media") {
        setMedia(id, v);
        repaint("資料を変更");
        return;
      }
      changed();
    }

    function recomputeComposite() {
      if (engineOf(q) !== "composite") return;
      q.points = arr(q.children).reduce(function (a, c) { return a + (Number(c.points) || 0); }, 0);
    }

    function setMedia(kind, src) {
      q.media = arr(q.media).filter(function (m) { return m.kind !== kind; });
      if (src) q.media.push({ id: "m_" + kind, kind: kind, src: src });
    }

    /* 端末の中のファイルだけを受け取る。外のアドレスは受け取らない。 */
    function pickFile(key, kind) {
      var input = document.createElement("input");
      input.type = "file";
      input.accept = kind === "audio" ? "audio/*" : "image/*";
      input.addEventListener("change", function () {
        var f = input.files && input.files[0];
        if (!f) return;
        var limit = kind === "audio" ? 4 * 1024 * 1024 : 2 * 1024 * 1024;
        if (f.size > limit) {
          if (app) app.toast("ファイルが大きすぎます（上限 " + Math.round(limit / 1024 / 1024) + "MB）。", "warning");
          return;
        }
        var fr = new FileReader();
        fr.onload = function () {
          var src = M.safeSrc(String(fr.result), kind);
          if (!src) {
            if (app) app.toast("この形式のファイルは使えません。", "warning");
            return;
          }
          var parts = key.split(":");
          if (parts[0] === "media") setMedia(parts[1], src);
          else if (parts[0] === "choice") {
            var c2 = find(q.choices, parts[1]);
            if (c2) c2[parts[2]] = src;
          }
          repaint("資料を取り込み");
        };
        fr.readAsDataURL(f);
      });
      input.click();
    }

    function addItem(kind) {
      if (kind === "blank") {
        q.blanks = arr(q.blanks);
        q.blanks.push({ id: newId("b"), label: String(q.blanks.length + 1), answer: "", acceptedAnswers: [] });
      } else if (kind === "item") {
        var id = newId("i");
        q.orderItems = arr(q.orderItems);
        q.orderItems.push({ id: id, text: "", order: q.orderItems.length + 1 });
        q.correctOrder = arr(q.correctOrder).concat([id]);
      } else if (kind === "left") {
        var lid = newId("L");
        q.pairs.left.push({ id: lid, text: "" });
      } else if (kind === "right") {
        q.pairs.right.push({ id: newId("R"), text: "" });
      } else if (kind === "group") {
        q.classification.groups.push({ id: newId("g"), label: "" });
      } else if (kind === "citem") {
        q.classification.items.push({ id: newId("t"), text: "", groupId: "" });
      } else if (kind === "col") {
        var cid = newId("col");
        q.table.columns.push({ id: cid, text: "" });
        arr(q.table.rows).forEach(function (rr) { rr.cells.push({ id: newId("c"), text: "", editable: false }); });
      } else if (kind === "row") {
        var rid = newId("r");
        q.table.rows.push({ id: rid, header: "", cells: arr(q.table.columns).map(function () {
          return { id: newId("c"), text: "", editable: false };
        }) });
      } else if (kind === "hotspot") {
        q.hotspots.push({ id: newId("h"), shape: "circle", x: 0.5, y: 0.5, r: 0.06, label: "" });
      } else if (kind === "label") {
        q.labels.bank.push({ id: newId("lb"), text: "" });
      } else if (kind === "series") {
        q.chart.series.push({ id: newId("s"), name: "系列" + (q.chart.series.length + 1),
                              values: arr(q.chart.categories).map(function () { return 0; }) });
      } else if (kind === "span") {
        q.errorSpans.push({ id: newId("e"), wrong: "", correct: "", acceptedAnswers: [] });
      } else if (kind === "choice") {
        q.choices = arr(q.choices);
        q.choices.push({ id: newId("c"), label: letter(q.choices.length), text: "", isCorrect: false });
      } else if (kind === "child") {
        q.children = arr(q.children);
        q.children.push(M.empty("multiple_choice_single", { points: 5 }));
        recomputeComposite();
      }
      repaint("項目を追加");
    }

    function delItem(kind, id) {
      if (kind === "blank") q.blanks = arr(q.blanks).filter(function (x) { return x.id !== id; });
      else if (kind === "item") {
        q.orderItems = arr(q.orderItems).filter(function (x) { return x.id !== id; });
        q.correctOrder = arr(q.correctOrder).filter(function (x) { return x !== id; });
      } else if (kind === "left") {
        q.pairs.left = q.pairs.left.filter(function (x) { return x.id !== id; });
        if (q.pairs.correct) delete q.pairs.correct[id];
      } else if (kind === "right") {
        q.pairs.right = q.pairs.right.filter(function (x) { return x.id !== id; });
        Object.keys(q.pairs.correct || {}).forEach(function (k) { if (q.pairs.correct[k] === id) delete q.pairs.correct[k]; });
      } else if (kind === "group") {
        q.classification.groups = q.classification.groups.filter(function (x) { return x.id !== id; });
        q.classification.items.forEach(function (x) { if (x.groupId === id) x.groupId = ""; });
      } else if (kind === "citem") q.classification.items = q.classification.items.filter(function (x) { return x.id !== id; });
      else if (kind === "row") q.table.rows = q.table.rows.filter(function (x) { return x.id !== id; });
      else if (kind === "hotspot") q.hotspots = arr(q.hotspots).filter(function (x) { return x.id !== id; });
      else if (kind === "label") {
        q.labels.bank = q.labels.bank.filter(function (x) { return x.id !== id; });
        q.labels.slots.forEach(function (s) { if (s.answerId === id) s.answerId = ""; });
      } else if (kind === "slot") q.labels.slots = q.labels.slots.filter(function (x) { return x.id !== id; });
      else if (kind === "series") q.chart.series = q.chart.series.filter(function (x) { return x.id !== id; });
      else if (kind === "span") q.errorSpans = arr(q.errorSpans).filter(function (x) { return x.id !== id; });
      else if (kind === "choice") q.choices = arr(q.choices).filter(function (x) { return x.id !== id; });
      else if (kind === "child") { q.children = arr(q.children).filter(function (x) { return x.id !== id; }); recomputeComposite(); }
      repaint("項目を削除");
    }

    U.on(container, "input", "[data-qe]", function (e, t) { applyKey(t.getAttribute("data-qe"), t); });
    U.on(container, "change", "[data-qe]", function (e, t) {
      var tag = t.tagName;
      if (tag === "SELECT" || t.type === "checkbox") applyKey(t.getAttribute("data-qe"), t);
    });
    U.on(container, "click", '[data-act="qe-add"]', function (e, t) { addItem(t.getAttribute("data-id")); });
    U.on(container, "click", '[data-act="qe-del"]', function (e, t) {
      var p = t.getAttribute("data-id").split(":");
      delItem(p[0], p.slice(1).join(":"));
    });
    U.on(container, "click", '[data-act="qe-up"], [data-act="qe-down"]', function (e, t) {
      var id = t.getAttribute("data-id");
      var up = t.getAttribute("data-act") === "qe-up";
      var o2 = arr(q.correctOrder).slice();
      var at = o2.indexOf(id);
      if (at < 0) return;
      var to = Math.max(0, Math.min(o2.length - 1, at + (up ? -1 : 1)));
      o2.splice(at, 1); o2.splice(to, 0, id);
      q.correctOrder = o2;
      q.correctAnswer = o2;
      repaint("順序を変更");
    });
    U.on(container, "click", '[data-act="qe-correct"]', function (e, t) {
      var id = t.getAttribute("data-id");
      var multi = engineOf(q) === "multi_choice";
      arr(q.choices).forEach(function (c2) {
        if (multi) { if (c2.id === id) c2.isCorrect = !c2.isCorrect; }
        else c2.isCorrect = c2.id === id;
      });
      repaint("正解を変更");
    });
    U.on(container, "click", '[data-act="qe-pick"]', function (e, t) {
      var p = t.getAttribute("data-id").split("|");
      pickFile(p[0], p[1] || "image");
    });
    /* ── 読み上げの声（この問題だけの上書き）── */
    U.on(container, "click", '[data-act="qe-voice"]', function () {
      if (!VQ2.voicePicker) { if (app) app.toast("読み上げの部品が読み込まれていません。", "warning"); return; }
      VQ2.voicePicker.open({
        value: q.voice || (o.preset && o.preset.audio && o.preset.audio.voice) || "",
        speed: q.speed || (o.preset && o.preset.audio && o.preset.audio.speed) || 1,
        sampleText: sampleScript(q)
      }).then(function (r) {
        if (!r) return;
        q.voice = r.voice; q.speed = r.speed;
        repaint("読み上げの声を変更");
      });
    });
    U.on(container, "click", '[data-act="qe-voice-clear"]', function () {
      delete q.voice; delete q.speed;
      repaint("読み上げの声をプリセットに戻す");
    });
    U.on(container, "click", '[data-act="qe-voice-try"]', function () {
      var T = VQ2.tts;
      if (!T) { if (app) app.toast("読み上げの部品が読み込まれていません。", "warning"); return; }
      var text = sampleScript(q);
      if (!text) { if (app) app.toast("読み上げる原稿がまだありません。", "warning"); return; }
      T.playQuestion(q, { preset: o.preset, text: text }).then(function (r) {
        if (!app) return;
        if (!r.ok) app.toast(r.reason || "音声を用意できませんでした。", "warning");
        else if (r.note) app.toast(r.note, "info");
      });
    });

    U.on(container, "click", '[data-act="qe-unpick"]', function (e, t) {
      var key = t.getAttribute("data-id");
      var p = key.split(":");
      if (p[0] === "media") setMedia(p[1], "");
      else if (p[0] === "choice") { var c2 = find(q.choices, p[1]); if (c2) c2[p[2]] = ""; }
      repaint("資料を外す");
    });
    /* 画像の上を押して、正解の場所／ラベルの場所を決める。 */
    U.on(container, "click", "[data-qe-stage]", function (e, t) {
      var img = t.querySelector("img");
      if (!img) return;
      var r = img.getBoundingClientRect();
      if (!r.width) return;
      var x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      var y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
      var eng = engineOf(q);
      if (eng === "image_point") {
        var hs = arr(q.hotspots);
        /* 近い場所があれば動かす。無ければ足す。 */
        var near = hs.filter(function (h) { return Math.abs(h.x - x) < 0.08 && Math.abs(h.y - y) < 0.08; })[0];
        if (near) { near.x = x; near.y = y; }
        else if (hs.length) { hs[hs.length - 1].x = x; hs[hs.length - 1].y = y; }
        repaint("正解の場所を変更");
      } else if (eng === "image_label") {
        var sl = arr(q.labels.slots);
        var n2 = sl.filter(function (s) { return Math.abs(s.x - x) < 0.08 && Math.abs(s.y - y) < 0.08; })[0];
        if (n2) { n2.x = x; n2.y = y; }
        else sl.push({ id: newId("s"), x: x, y: y, answerId: "" });
        repaint("ラベルの場所を変更");
      }
    });
    /* 小問の操作 */
    U.on(container, "click", '[data-act="qe-child-type"]', function (e, t) {
      var id = t.getAttribute("data-id");
      var ch = find(q.children, id);
      if (!ch) return;
      openPicker({ current: ch.type, mode: o.mode }).then(function (picked) {
        if (!picked) return;
        var next = M.empty(picked, { points: ch.points, prompt: ch.prompt });
        next.id = ch.id;
        var at = q.children.indexOf(ch);
        q.children[at] = next;
        repaint("小問の形式を変更");
      });
    });
    U.on(container, "click", '[data-act="qe-child-up"], [data-act="qe-child-down"]', function (e, t) {
      var id = t.getAttribute("data-id");
      var up = t.getAttribute("data-act") === "qe-child-up";
      var at = arr(q.children).findIndex(function (c2) { return c2.id === id; });
      if (at < 0) return;
      var to = Math.max(0, Math.min(q.children.length - 1, at + (up ? -1 : 1)));
      var m2 = q.children.splice(at, 1)[0];
      q.children.splice(to, 0, m2);
      repaint("小問の順序を変更");
    });
    U.on(container, "click", '[data-act="qe-child-edit"]', function (e, t) {
      var ch = find(q.children, t.getAttribute("data-id"));
      if (!ch) return;
      openChildEditor(ch, function () { recomputeComposite(); repaint("小問を編集"); }, o);
    });

    return { refresh: function () { container.innerHTML = formHtml(q); } };
  }

  /* 小問だけを開いて編集する（複合大問の中身）。 */
  function openChildEditor(child, onDone, o) {
    var app = U.mount("vq2-qtype-child", {
      title: "小問を編集", sheet: true, stack: true,
      onClose: function () { onDone(); }
    });
    function render() {
      app.root.innerHTML = '<div class="vq2-pane-h"><span>'
        + esc(Q.label(child.type)) + "（小問）</span><div class=\"vq2-top-sp\"></div>"
        + btn({ icon: "close", iconOnly: true, size: "sm", variant: "quiet", action: "x", aria: "閉じる" })
        + '</div><div class="vq2-pane-b">'
        + '<div class="vq2-field"><label class="vq2-label">問題文</label>'
        + '<textarea class="vq2-input" data-child-prompt rows="3">' + esc(str(child.prompt)) + "</textarea></div>"
        + '<div class="vq2-qe-form" data-child-form></div>'
        + (Q.hasChoices(child.type) ? '<div class="vq2-qe-form" data-child-choices></div>' : "")
        + '<div class="vq2-label" style="margin-top:16px">プレビュー</div>'
        + '<div class="vq2-qe-preview">' + R.promptHtml(child, { readonly: true })
        + R.html(child, null, { readonly: true }) + "</div>"
        + "</div>";
      var form = app.root.querySelector("[data-child-form]");
      if (form) {
        form.innerHTML = formHtml(child);
        bindForm(form, child, { app: app, onChange: function () {}, onRepaint: render });
      }
      var ch = app.root.querySelector("[data-child-choices]");
      if (ch) {
        ch.innerHTML = choicesFormHtml(child);
        bindForm(ch, child, { app: app, onChange: function () {}, onRepaint: render });
      }
      U.on(app.root, "click", '[data-act="x"]', function () { app.close("user"); });
      U.on(app.root, "input", "[data-child-prompt]", function (e, t) { child.prompt = t.value; });
    }
    render();
  }

  /* 選択肢の編集（画像・音声つきも同じ形で扱う）。 */
  function choicesFormHtml(q) {
    if (!arr(q.choices).length && !Q.hasChoices(q.type)) {
      /* 選択肢を持たない形式で呼ばれたときは、最初の 4 つを用意する。 */
      q.choices = [1, 2, 3, 4].map(function (k) {
        return { id: "c" + k, label: letter(k - 1), text: "", isCorrect: false };
      });
    }
    var multi = engineOf(q) === "multi_choice";
    var h = '<div class="vq2-label" style="margin:12px 0 8px">選択肢と正解'
      + (multi ? "（当てはまるものすべてに印を付けます）" : "") + "</div>";
    arr(q.choices).forEach(function (c, i) {
      h += '<div class="vq2-qe-item is-row">'
        + '<span class="vq2-qe-n">' + esc(c.label || letter(i)) + "</span>"
        + textIn("choice:" + c.id + ":text", c.text, "選択肢の本文")
        + btn({ icon: "check", iconOnly: true, size: "sm", variant: c.isCorrect ? "primary" : "quiet",
                action: "qe-correct", id: c.id, aria: "正解にする", pressed: c.isCorrect })
        + delBtn("choice", c.id, "この選択肢を削除")
        + "</div>";
    });
    h += addBtn("choice", "選択肢を追加");
    return h;
  }

  VQ2.qtypePicker = { open: openPicker, noteUsed: noteUsed, recent: function () { return readList(K_RECENT); },
                      favorites: function () { return readList(K_FAV); } };
  VQ2.qtypeEditor = {
    handles: handles, ensure: ensure,
    html: formHtml, bind: bindForm,
    choicesHtml: choicesFormHtml,
    openChild: openChildEditor,
    /* 形式を変えたとき、新しい形式で必要なものをそろえる。
       元の問題文・配点・解説は残す（書いたものを捨てない）。 */
    convert: function (q, nextType) {
      var keep = {
        id: q.id, prompt: q.prompt, promptRich: q.promptRich, instruction: q.instruction,
        context: q.context, contextRich: q.contextRich, media: q.media,
        explanation: q.explanation, explanationRich: q.explanationRich,
        difficulty: q.difficulty, topic: q.topic, tags: q.tags, points: q.points,
        questionNumber: q.questionNumber, sourceReferences: q.sourceReferences,
        requiresReview: q.requiresReview, createdBy: q.createdBy, __legacy: q.__legacy
      };
      var next = M.empty(nextType, { points: q.points, prompt: q.prompt, topic: q.topic, difficulty: q.difficulty });
      Object.keys(keep).forEach(function (k) { if (keep[k] !== undefined) next[k] = keep[k]; });
      /* 選択肢は、選択肢を持つ形式どうしなら引き継ぐ。 */
      if (Q.hasChoices(nextType) && arr(q.choices).length) next.choices = clone(q.choices);
      if (Q.engineOf(nextType) === "reorder" && arr(q.orderItems).length) {
        next.orderItems = clone(q.orderItems);
        next.correctOrder = clone(q.correctOrder);
      }
      if (S && S.isAiGraded && S.isAiGraded(nextType) && !next.scoringRubric && S.defaultRubric)
        next.scoringRubric = S.defaultRubric(nextType, Number(q.points) || 1);
      return M.normalize(ensure(next));
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
