/* ══════════════════════════════════════════════════════════════════════
   Layout Plan と Layout Manifest（§15 / §22）
   ・LayoutPlan  : MockSpec のどの要素を、どのテンプレートのどの部品で置くか。
                   AI が触れてよいのはここまで。組版ソースは書かせない。
   ・LayoutManifest: 出来上がった紙面のどこに何があるか。
                   正確な座標を取得できない場合はページ単位へ安全に縮退する。
                   持っていない座標を作らない。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var S = VQ2.schema, TPL = VQ2.templates;

  /* 使ってよい Content Block の種類。AI はこの語彙の外を指定できない。 */
  var BLOCK_TYPES = [
    "instructions", "passage", "source", "figure", "table", "dialogue",
    "code", "question", "choices", "blank", "answer-area", "notice", "spacer",
    /* 紙面プロファイルを選んだときだけ使う部品。
       AI が指定できるのは相変わらずこの語彙の中だけ。 */
    "figure-group", "answer-grid-head", "answer-grid-section", "answer-grid-block",
    "answer-grid-legend", "answer-grid-foot",
    "answer-grid-total", "answer-grid-student",
    /* ── 形式そのものの中身（2026-08-05 追加）────────────────────
       これまで紙に出ていたのは「問題文」と「選択肢」だけだった。
       そのため並び替えは **「並び替えなさい」とだけ書かれた紙**になり、
       並べる語が 1 つも印刷されなかった（実測: pdf/ 配下で orderItems /
       pairs / classification / table を読んでいる箇所が grep で 0 件）。
       組み合わせ・分類・表うめも同じ。解けない紙が出ていた。 */
    "order-bank", "match-pairs", "class-groups", "fill-table"
  ];

  /* AI が調整してよいレイアウトの値（範囲つき）。範囲外は丸める。 */
  var TUNABLES = {
    columns:        { min: 1, max: 2 },
    fontScale:      { min: 0.9, max: 1.15 },
    lineHeight:     { min: 1.5, max: 2.2 },
    questionGapMm:  { min: 4, max: 16 },
    answerLines:    { min: 1, max: 30 },
    answerBoxWidth: { min: 20, max: 100 }        /* % */
  };

  function clampTunable(key, v) {
    var t = TUNABLES[key];
    if (!t || typeof v !== "number" || !isFinite(v)) return null;
    return Math.max(t.min, Math.min(t.max, v));
  }

  /* ══════════════════════════════════════════════════════════════════
     LayoutPlan を作る
     ・決定論。AI の tuning は許可された範囲でだけ受け付ける。
     ══════════════════════════════════════════════════════════════════ */
  function buildPlan(spec, opts) {
    opts = opts || {};
    var paper = spec.paper || S.defaultPaper();

    /* ── 紙面レイアウトプロファイル（任意）──────────────────────
       選ばれているときだけ、ここから先の既定値を差し替える。
       選ばれていない（layoutMode = "current" / 未設定）なら
       lp は null のままで、以下は 1 行も効かない＝いままでと同じ紙面になる。 */
    var LP = VQ2.layoutProfiles || null;
    var lset = LP ? LP.readLayoutSettings(spec) : null;
    var lp = null, lprofile = null;
    if (LP && LP.isEnabled(lset)) {
      lp = LP.planLayout(spec, { settings: lset });
      if (lp) {
        lprofile = LP.getProfile(lp.layoutProfileId);
        /* プロファイルの紙・余白・書体を、この計画の土台にする。 */
        paper = Object.assign({}, paper, {
          size: lp.paper.size, orientation: lp.paper.orientation,
          writingDirection: lp.paper.writingDirection, spread: !!lp.paper.spread,
          margins: Object.assign({}, lp.paper.margins),
          minimumFontSize: lp.paper.minimumFontSize
        });
      }
    }

    var tpl = TPL.get(paper.templateId) || TPL.get("standard-school-exam");
    var size = TPL.paperSizeMm(paper);
    var tuning = sanitizeTuning(opts.tuning);

    var plan = {
      mockId: spec.id,
      templateId: tpl.templateId,
      templateVersion: tpl.version,
      engine: TPL.resolveEngine(paper.engine),
      paper: {
        size: paper.size, orientation: paper.orientation,
        widthMm: size.w, heightMm: size.h,
        margins: paper.margins || tpl.defaultMargins,
        writingDirection: paper.writingDirection || tpl.writingDirection,
        spread: !!paper.spread,
        pageNumbering: paper.pageNumbering !== false,
        minimumFontSize: paper.minimumFontSize || tpl.minimumFontSize
      },
      columns: tuning.columns || tpl.columns || 1,
      fontScale: tuning.fontScale || 1,
      lineHeight: tuning.lineHeight || (paper.writingDirection === "vertical" ? 2.0 : 1.85),
      questionGapMm: tuning.questionGapMm || 8,
      booklets: [],
      warnings: []
    };

    /* 紙面の制約に合っているか */
    TPL.validatePaper(plan.paper, tpl.templateId).forEach(function (i) {
      if (i.severity === "error") plan.warnings.push(i.message);
      else plan.warnings.push(i.message);
    });

    /* プロファイルが選ばれているときは、その値で紙面の呼吸を上書きする。
       未選択なら lp は null なので、ここは丸ごと素通りする。 */
    if (lp) {
      plan.layoutProfile = {
        layoutProfileId: lp.layoutProfileId,
        layoutProfileVersion: lp.layoutProfileVersion,
        answerSheetProfileId: lp.answerSheetProfileId,
        answerSheetProfileVersion: lp.answerSheetProfileVersion,
        seed: lp.seed,
        requestedEngine: lp.requestedEngine,
        variants: lp.variants,
        typography: lp.typography,
        header: lprofile ? lprofile.header : null,
        notices: lp.notices
      };
      plan.questionGapMm = lp.questionGapMm;
      plan.lineHeight = lp.typography.lineHeight;
      /* Layout Grammar V2 の 2 層を、そのまま外へ渡す。
         Renderer はこれを見なくても組めるが、Typst / TeX はここから作る。 */
      plan.semantic = lp.semantic;
      plan.resolved = lp.resolved;
      plan.pageNumber = lp.pageNumber;
      lp.notices.forEach(function (n) { plan.warnings.push(n); });
    }

    /* 1) 問題冊子 */
    plan.booklets.push({
      id: "question-booklet",
      title: spec.title,
      kind: "question",
      blocks: questionBlocks(spec, tpl, tuning, lp, lprofile)
    });

    /* 2) 解答用紙（別紙のときだけ） */
    if ((paper.bookletMode || "separate-answer-sheet") !== "single") {
      plan.booklets.push({
        id: "printable-answer-sheet",
        title: spec.title + "　解答用紙",
        kind: "answer-sheet",
        /* プロファイルの解答用紙が選ばれていればそちらを使う。
           選ばれていなければ、これまでの解答用紙をそのまま作る。 */
        blocks: (lp && lp.answerSheet)
          ? profileAnswerSheetBlocks(spec, lp.answerSheet)
          : answerSheetBlocks(spec, tpl, tuning)
      });
    }

    /* 3) 正解・解説 */
    plan.booklets.push({
      id: "answer-and-explanation",
      title: spec.title + "　解答と解説",
      kind: "answer-key",
      blocks: answerKeyBlocks(spec, tpl, lp)
    });

    return plan;
  }

  function sanitizeTuning(t) {
    var out = {};
    if (!t || typeof t !== "object") return out;
    Object.keys(TUNABLES).forEach(function (k) {
      var v = clampTunable(k, t[k]);
      if (v !== null) out[k] = v;
    });
    return out;
  }

  /* ── 問題冊子の Content Block ─────────────────────────────── */
  function questionBlocks(spec, tpl, tuning, lp, lprofile) {
    var blocks = [];
    if (spec.instructions) blocks.push({ type: "notice", id: "notice-main", text: spec.instructions });

    /* プロファイルの計画を設問 ID で引けるようにしておく（未選択なら空） */
    var byQ = {};
    if (lp) (lp.sections || []).forEach(function (s) {
      (s.questions || []).forEach(function (pq) { byQ[pq.questionId] = pq; });
    });
    var secPlan = {};
    if (lp) (lp.sections || []).forEach(function (s) { secPlan[s.sectionId] = s; });

    (spec.sections || []).forEach(function (sec) {
      var sp = secPlan[sec.id] || null;
      blocks.push({
        type: "instructions", id: "sec-" + sec.id, sectionId: sec.id,
        number: sec.number, title: sec.title, text: sec.instructions || "",
        points: sec.points,
        pageBreakBefore: sp ? !!sp.startsNewPage : sec.number > 1,
        marker: sp ? sp.marker : null,
        markerVariant: sp ? sp.markerVariant : null,
        showPoints: lprofile ? lprofile.sectionStyle.showPoints !== false : true
      });

      (sec.questions || []).forEach(function (q) {
        var pq = byQ[q.id] || null;
        /* 図表を持つ設問は、本文と図表をひとつの枠へ入れる。
           別々のブロックのまま流すと、改ページで本文だけが次のページへ行き、
           図表が本文から離れる（＝問題文の一部でなくなる）。
           複数の図表も 1 つの figureGroup として、途中で切らない。 */
        if (pq && pq.figureGroup) {
          blocks.push(figureGroupBlock(q, sec, pq, lprofile));
          /* 本文の左に選択肢まで入れる形（実画像の（ウ））のときは、
             選択肢は枠の中へ入れてあるので、ここでは出さない。 */
          if ((q.choices || []).length && !pq.choicesInBody) blocks.push(choiceBlock(q, sec, pq));
          return;
        }

        /* 資料・図表を先に置く */
        (q.contentBlocks || []).forEach(function (cb, i) {
          if (BLOCK_TYPES.indexOf(cb.type) < 0) return;
          blocks.push(Object.assign({}, cb, { id: q.id + "-cb" + i, questionId: q.id, sectionId: sec.id },
            pq && isFigureType(cb.type)
              ? { figureLayout: pq.figureLayout, widthPct: pq.figureWidthPct }
              : {}));
        });
        (q.sourceReferences || []).forEach(function (sr, i) {
          if (!sr.excerpt) return;
          blocks.push({ type: "source", id: q.id + "-src" + i, questionId: q.id, sectionId: sec.id,
                        text: sr.excerpt, caption: sr.sourceName + (sr.page ? "（p." + sr.page + "）" : "") });
        });

        blocks.push({
          type: "question", id: q.id, questionId: q.id, sectionId: sec.id,
          number: q.number, text: q.prompt, points: q.points,
          answerBindingId: q.answerBindingId, questionType: q.type,
          marker: pq ? pq.marker : null,
          showPoints: lprofile ? lprofile.subQuestionStyle.showPoints !== false : true
        });

        if ((q.choices || []).length) blocks.push(choiceBlock(q, sec, pq));
        /* 形式そのものの中身（並べる語・対応表・分類の箱・うめる表）。
           **これが無いと解けない紙になる。** */
        var body = formBodyBlock(q, sec);
        if (body) blocks.push(body);
        /* 問題冊子に解答欄を持つ体裁のときだけ置く */
        if (tpl.supportedFeatures.indexOf("inline-answer") >= 0) {
          blocks.push(answerAreaBlock(q, tuning));
        }
      });
    });
    return blocks;
  }

  var FIGURE_BLOCK_TYPES = ["figure", "table", "chart", "diagram"];
  function isFigureType(t) { return FIGURE_BLOCK_TYPES.indexOf(t) >= 0; }

  /* ══════════════════════════════════════════════════════════════════
     解答欄の形と数

     形式の「型名」ではなく**エンジン**で決める。
     型名で分岐すると reorder_english / matching_word_meaning のような
     仲間が全部こぼれる（実測: 英文並び替えの解答欄が記述の行になっていた）。

     数は**問題の中身から数える**。
       並び替え … 並べる語の数（＝答える順番の数）
       組み合わせ … 左の項目の数
       分類 … 分類する語の数
       表うめ … うめる升の数
     ここを q.blanks の数で見ていたため、3 組の組み合わせに枠が 2 つしか
     出ていなかった（§43 の「解答欄不足」）。
     ══════════════════════════════════════════════════════════════════ */
  function engineOf(type) {
    try {
      var d = VQ2.qtypes && VQ2.qtypes.get ? VQ2.qtypes.get(type) : null;
      return d ? d.engine : "";
    } catch (e) { return ""; }
  }
  function answerShapeOf(q) {
    var A = function (v) { return Array.isArray(v) ? v : []; };
    var e = engineOf(q.type);
    var n;
    if (e === "single_choice" || e === "multi_choice" || e === "true_false"
        || e === "image_choice" || e === "audio_choice") {
      return { style: "marks", count: Math.max(2, Math.min(10, A(q.choices).length || 4)) };
    }
    if (e === "reorder") {
      n = A(q.orderItems).length;
      return { style: "cells", count: Math.max(2, Math.min(20, n || 4)) };
    }
    if (e === "matching") {
      n = q.pairs ? A(q.pairs.left).length : 0;
      return { style: "cells", count: Math.max(2, Math.min(20, n || 4)) };
    }
    if (e === "classification") {
      n = q.classification ? A(q.classification.items).length : 0;
      return { style: "cells", count: Math.max(2, Math.min(20, n || 4)) };
    }
    if (e === "table_fill") {
      n = 0;
      if (q.table) A(q.table.rows).forEach(function (r) {
        A(r.cells).forEach(function (c) { if (c && c.editable) n++; });
      });
      return { style: "cells", count: Math.max(1, Math.min(20, n || 1)) };
    }
    if (e === "fill_blank") {
      n = A(q.blanks).length;
      return { style: "cells", count: Math.max(1, Math.min(30, n || 1)) };
    }
    if (e === "numeric_input" || e === "text_input") {
      return { style: "box", count: 1 };
    }
    return null;    /* 記述系は従来どおり行を引く */
  }

  /* ══════════════════════════════════════════════════════════════════
     形式そのものの中身を紙へ載せる

     画面と紙で**並び順が違ってはいけない**（同じ問題として扱えなくなる）。
     画面側（ui/question-renderer.js）は問題 ID を種にした並べ替えを使うので、
     ここでも同じ作り方の並べ替えを使う。
     ══════════════════════════════════════════════════════════════════ */
  function stableShuffle(list, seedStr) {
    var seed = 0, s = String(seedStr == null ? "" : seedStr);
    for (var i = 0; i < s.length; i++) seed = (seed * 31 + s.charCodeAt(i)) >>> 0;
    var a = list.slice();
    for (var j = a.length - 1; j > 0; j--) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      var k = seed % (j + 1);
      var t = a[j]; a[j] = a[k]; a[k] = t;
    }
    return a;
  }
  var KANA = ["ア", "イ", "ウ", "エ", "オ", "カ", "キ", "ク", "ケ", "コ",
              "サ", "シ", "ス", "セ", "ソ", "タ", "チ", "ツ", "テ", "ト"];
  function kana(i) { return KANA[i] || String(i + 1); }

  function formBodyBlock(q, sec) {
    var id = q.id, sid = sec.id;
    var arrOf = function (v) { return Array.isArray(v) ? v : []; };

    /* 並び替え：並べる語を、記号つきで散らして出す。
       **正解の順では出さない**（そのまま答えになってしまう）。 */
    var items = arrOf(q.orderItems).filter(function (it) { return it && String(it.text || "").trim(); });
    if (items.length >= 2) {
      var shown = stableShuffle(items, id).map(function (it, i) {
        return { id: it.id, label: kana(i), text: String(it.text), fixed: !!it.fixed };
      });
      return { type: "order-bank", id: id + "-ob", questionId: id, sectionId: sid, items: shown };
    }

    /* 組み合わせ：左と右をそれぞれ記号つきで出す。右は散らす。 */
    var p = q.pairs;
    if (p && arrOf(p.left).length && arrOf(p.right).length) {
      var left = arrOf(p.left).map(function (l, i) {
        return { id: l.id, label: kana(i), text: String(l.text || "") };
      });
      var right = stableShuffle(arrOf(p.right), id + "R").map(function (r, i) {
        return { id: r.id, label: String(i + 1), text: String(r.text || "") };
      });
      return { type: "match-pairs", id: id + "-mp", questionId: id, sectionId: sid,
               left: left, right: right };
    }

    /* 分類：箱（分類先）と、分類する語を出す。語は散らす。 */
    var c = q.classification;
    if (c && arrOf(c.groups).length && arrOf(c.items).length) {
      var groups = arrOf(c.groups).map(function (g, i) {
        return { id: g.id, label: String(g.label || ("グループ" + (i + 1))), isExclude: !!g.isExclude };
      });
      var things = stableShuffle(arrOf(c.items), id + "C").map(function (t, i) {
        return { id: t.id, label: kana(i), text: String(t.text || "") };
      });
      return { type: "class-groups", id: id + "-cg", questionId: id, sectionId: sid,
               groups: groups, items: things };
    }

    /* 表うめ：うめる升は空欄として出す（答えは出さない）。 */
    var t2 = q.table;
    if (t2 && arrOf(t2.columns).length && arrOf(t2.rows).length) {
      return {
        type: "fill-table", id: id + "-ft", questionId: id, sectionId: sid,
        caption: String(t2.caption || ""),
        columns: arrOf(t2.columns).map(function (col) { return String(col.text || ""); }),
        rows: arrOf(t2.rows).map(function (r) {
          return {
            header: String(r.header || ""),
            cells: arrOf(r.cells).map(function (cell) {
              return { editable: !!cell.editable, text: cell.editable ? "" : String(cell.text || "") };
            })
          };
        })
      };
    }
    return null;
  }

  /* 選択肢のブロック。プロファイルが段数を決めていればそれに従う。
     決めていなければ、これまでどおり文字数から決める。 */
  function choiceBlock(q, sec, pq) {
    return {
      type: "choices", id: q.id + "-ch", questionId: q.id, sectionId: sec.id,
      /* 記号はプロファイルが決める。選ばれていなければ、これまでどおり丸数字。 */
      choices: q.choices.map(function (c, i) {
        return { id: c.id, text: c.text,
                 label: pq ? choiceLabel(pq.choiceMarker, i) : circled(i + 1) };
      }),
      columns: pq ? (pq.choiceColumns || 1) : choiceColumns(q.choices),
      choiceLayout: pq ? pq.choiceLayout : null
    };
  }

  /* 本文と図表をひとつの枠へ入れる。
     figureGroup.layout で「横に並べて中央」「本文の右」「本文の下」を切り替える。
     どの形でも改ページで割らせない（keepTogether）。 */
  function figureGroupBlock(q, sec, pq, profile) {
    var figs = (q.contentBlocks || []).filter(function (b) { return isFigureType(b.type); });
    var others = (q.contentBlocks || []).filter(function (b) {
      return BLOCK_TYPES.indexOf(b.type) >= 0 && !isFigureType(b.type);
    });
    var gapMm = (profile && profile.figureRules && profile.figureRules.minGapMm) || 6;
    return {
      type: "figure-group", id: q.id + "-fg", questionId: q.id, sectionId: sec.id,
      number: q.number, marker: pq.marker, text: q.prompt, points: q.points,
      answerBindingId: q.answerBindingId, questionType: q.type,
      showPoints: profile ? profile.subQuestionStyle.showPoints !== false : true,
      figureLayout: pq.figureLayout,
      groupLayout: pq.figureGroup.layout,
      bodyWidthPct: pq.bodyWidthPct,
      figureWidthPct: pq.figureWidthPct,
      gapMm: gapMm,
      keepTogether: pq.figureGroup.keepTogether !== false,
      preserveAspectRatio: pq.figureGroup.preserveAspectRatio !== false,
      /* 選択肢を本文の側へ入れる形（実画像の（ウ））のときだけ持つ */
      choices: pq.choicesInBody && (q.choices || []).length
        ? q.choices.map(function (c, i) { return { id: c.id, label: choiceLabel(pq.choiceMarker, i), text: c.text }; })
        : null,
      choiceColumns: pq.choiceColumns || 1,
      figures: figs.map(function (f, i) {
        return { id: q.id + "-fig" + i, type: f.type, src: f.src, caption: f.caption,
                 title: f.title, rows: f.rows, header: f.header, text: f.text };
      }),
      extras: others.map(function (b, i) {
        return Object.assign({}, b, { id: q.id + "-cb" + i, questionId: q.id, sectionId: sec.id });
      })
    };
  }

  /* 選択肢の記号。実画像は「1.」。丸数字はプロファイルが指定したときだけ。 */
  function choiceLabel(marker, i) {
    if (marker === "circled") return circled(i + 1);
    if (marker === "alpha") return String.fromCharCode(65 + i);
    return (i + 1) + ".";
  }

  /* ── プロファイルの解答用紙 ──────────────────────────────────
     問題形式から作った行を、そのまま罫線の表として並べる。
     欄の数は Planner が設問の数と一致させている（検証でも確かめる）。 */
  function profileAnswerSheetBlocks(spec, sheet) {
    var blocks = [{
      type: "answer-grid-head", id: "asg-head",
      variant: (sheet.variants && sheet.variants.header) || "top-bar",
      subject: spec.subject || "", grade: spec.grade || "",
      examName: spec.title || "", totalPoints: spec.totalPoints
    }];

    /* 可変グリッドを持つプロファイルは、大問ごとの枠として組む。
       1 問 1 行の作り方も残してあるので、grid が無ければ従来どおり。 */
    if (sheet.grid) {
      (sheet.grid.blocks || []).forEach(function (blk) {
        blocks.push({
          type: "answer-grid-block", id: "asgb-" + blk.sectionId, sectionId: blk.sectionId,
          number: blk.number, columns: blk.columns, gapMm: blk.gapMm,
          outerBorderWidthMm: blk.outerBorderWidthMm, innerBorderWidthMm: blk.innerBorderWidthMm,
          sectionLabel: blk.sectionLabel, rows: blk.rows,
          score: blk.score, recheck: blk.recheck,
          keepTogether: true
        });
      });
      if (sheet.grid.pointLegend) {
        blocks.push({ type: "answer-grid-legend", id: "asg-legend",
                      labels: sheet.grid.pointLegend.labels,
                      thinWidthMm: sheet.grid.pointLegend.thinWidthMm,
                      thickWidthMm: sheet.grid.pointLegend.thickWidthMm });
      }
      blocks.push({
        type: "answer-grid-foot", id: "asg-foot",
        fields: sheet.grid.studentFields,
        total: sheet.grid.total
      });
      return blocks;
    }
    (sheet.sections || []).forEach(function (sec) {
      blocks.push({
        type: "answer-grid-section", id: "asg-" + sec.sectionId, sectionId: sec.sectionId,
        number: sec.number, label: sec.label, rule: sec.rule, points: sec.points,
        subtotal: sec.subtotal, grader: sec.grader, regrade: sec.regrade,
        density: (sheet.variants && sheet.variants.density) || "standard",
        rows: (sec.rows || []).map(function (r) {
          return {
            id: "asg-r-" + r.questionId, questionId: r.questionId,
            answerBindingId: r.answerBindingId,
            number: r.number, label: r.label, questionType: r.questionType,
            cell: r.cell, cellStyle: r.cellStyle,
            widthMm: r.widthMm, heightMm: r.heightMm, rows: r.rows, cells: r.cells,
            points: r.points
          };
        })
      });
    });
    if (sheet.scoreArea && sheet.scoreArea.total) {
      blocks.push({
        type: "answer-grid-total", id: "asg-total",
        label: sheet.scoreArea.totalLabel,
        regrade: !!sheet.scoreArea.regradeTotal,
        regradeLabel: sheet.scoreArea.regradeLabel,
        sections: (sheet.sections || []).map(function (s) { return { number: s.number, label: s.label }; })
      });
    }
    if ((sheet.studentFields || []).length) {
      blocks.push({
        type: "answer-grid-student", id: "asg-student",
        position: sheet.studentFieldsPosition || "bottom",
        fields: sheet.studentFields
      });
    }
    return blocks;
  }

  /* 選択肢が短ければ横並びにする（紙面を無駄にしない） */
  function choiceColumns(choices) {
    var maxLen = Math.max.apply(null, choices.map(function (c) { return String(c.text || "").length; }));
    if (maxLen <= 8) return 4;
    if (maxLen <= 18) return 2;
    return 1;
  }

  function answerAreaBlock(q, tuning) {
    var binding = null;
    return {
      type: "answer-area", id: q.id + "-ans", questionId: q.id,
      answerBindingId: q.answerBindingId,
      inputType: q.type,
      lines: answerLines(q, tuning),
      widthPct: tuning.answerBoxWidth || defaultWidth(q.type)
    };
  }
  function answerLines(q, tuning) {
    if (tuning && tuning.answerLines) return tuning.answerLines;
    var expected = q.expectedChars || 0;
    if (q.type === "essay" || q.type === "english_writing") return Math.max(6, Math.ceil((expected || 400) / 35));
    if (q.type === "long_answer" || q.type === "source_analysis") return Math.max(3, Math.ceil((expected || 120) / 35));
    return 1;
  }
  function defaultWidth(type) {
    if (type === "multiple_choice_single" || type === "true_false") return 24;
    if (type === "numeric" || type === "short_answer") return 46;
    return 100;
  }

  /* ── 解答用紙 ────────────────────────────────────────────── */
  function answerSheetBlocks(spec, tpl, tuning) {
    var blocks = [{ type: "notice", id: "as-head", text: "解答は必ずこの用紙に記入してください。" }];
    var byQuestion = {};
    (spec.sections || []).forEach(function (sec) {
      (sec.questions || []).forEach(function (q) { byQuestion[q.answerBindingId] = { q: q, sec: sec }; });
    });

    (spec.sections || []).forEach(function (sec) {
      blocks.push({ type: "instructions", id: "as-sec-" + sec.id, sectionId: sec.id,
                    number: sec.number, title: sec.title, text: "", points: sec.points });
      (sec.questions || []).forEach(function (q) {
        var b = (spec.answerBindings || []).find(function (x) { return x.id === q.answerBindingId; });
        blocks.push({
          type: "answer-area", id: "as-" + q.id, questionId: q.id, sectionId: sec.id,
          answerBindingId: q.answerBindingId,
          number: b ? b.number : String(q.number),
          inputType: q.type, points: q.points,
          choiceCount: (q.choices || []).length,
          blankCount: b && b.blankCount ? b.blankCount : ((q.blanks || []).length || 1),
          lines: (b && b.answerLines) || answerLines(q, tuning),
          /* 解答欄の形と数は**ここで決める**（renderer は言われたとおり描く）。
             以前は renderer が型名の完全一致で決めていたため、
             ・reorder_english が記述の行になる（型名が ordering ではない）
             ・組み合わせ 3 組に対して枠が 2 つしか出ない
               （blankCount が q.blanks の数＝0 → 最低値の 2 になっていた）
             という食い違いが出ていた（実測・§43 の「解答欄不足」）。 */
          answerShape: answerShapeOf(q),
          widthPct: 100
        });
      });
    });
    return blocks;
  }

  /* ── 正解・解説 ──────────────────────────────────────────── */
  function answerKeyBlocks(spec, tpl, lp) {
    var blocks = [];
    /* 問題用紙で使った記号を引けるようにする（未選択なら空）。
       ここを揃えないと、試験は「（ア）」なのに解答は「問1」になり、
       採点のときに突き合わせられない。 */
    var byQ = {}, secMark = {};
    if (lp) (lp.sections || []).forEach(function (s) {
      secMark[s.sectionId] = { marker: s.marker, markerVariant: s.markerVariant };
      (s.questions || []).forEach(function (pq) { byQ[pq.questionId] = pq; });
    });
    (spec.sections || []).forEach(function (sec) {
      var sm = secMark[sec.id] || null;
      blocks.push({ type: "instructions", id: "ak-sec-" + sec.id, sectionId: sec.id,
                    number: sec.number, title: sec.title, text: "", points: sec.points,
                    marker: sm ? sm.marker : null, markerVariant: sm ? sm.markerVariant : null });
      (sec.questions || []).forEach(function (q) {
        var correct = (q.choices || []).filter(function (c) { return c.isCorrect; })
          .map(function (c, i) { return circled((q.choices || []).indexOf(c) + 1); }).join("・")
          || q.correctAnswer || "";
        blocks.push({
          type: "question", id: "ak-" + q.id, questionId: q.id, sectionId: sec.id,
          number: q.number, text: q.prompt, points: q.points,
          marker: byQ[q.id] ? byQ[q.id].marker : null,
          answer: String(correct),
          accepted: (q.acceptedAnswers || []).join(" / "),
          explanation: q.explanation || "",
          rubric: (q.scoringRubric && q.scoringRubric.items) || [],
          criterion: (q.criterionAllocation || []).map(function (a) {
            return S.criterionLabel(a.criterionId) + " " + a.points + " 点";
          }).join(" / "),
          sources: (q.sourceReferences || []).map(function (s) {
            return s.sourceName + (s.page ? "（p." + s.page + "）" : "");
          })
        });
      });
    });
    return blocks;
  }

  /* 丸囲み数字。20 を超えたら括弧つきの数字にする（フォントに無い字を作らない）。 */
  var CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
  function circled(n) {
    if (n >= 1 && n <= 20) return CIRCLED.charAt(n - 1);
    return "(" + n + ")";
  }

  /* ══════════════════════════════════════════════════════════════════
     LayoutManifest（§22）
     ・実際にレンダリングした DOM から測る。測れなければページ単位へ縮退。
     ・偽の座標は作らない。coordinateSystem に何で測ったかを必ず残す。
     ══════════════════════════════════════════════════════════════════ */
  function buildManifest(spec, plan, measured) {
    var anchors = [], pages = [];
    var precise = !!(measured && measured.anchors && measured.anchors.length);

    if (precise) {
      pages = measured.pages || [];
      measured.anchors.forEach(function (a) {
        anchors.push({
          questionId: a.questionId,
          answerBindingId: a.answerBindingId,
          sectionId: a.sectionId,
          page: a.page,
          region: a.region ? {
            page: a.page, x: a.region.x, y: a.region.y,
            width: a.region.width, height: a.region.height,
            coordinateSystem: a.region.coordinateSystem || "normalized"
          } : null
        });
      });
    } else {
      /* 測れなかった場合：ページ単位のアンカーだけを作る。
         region は null のまま。座標を推測して埋めない。 */
      var page = 1;
      (spec.sections || []).forEach(function (sec) {
        (sec.questions || []).forEach(function (q) {
          anchors.push({
            questionId: q.id, answerBindingId: q.answerBindingId, sectionId: sec.id,
            page: page, region: null
          });
        });
        page++;
      });
      pages = [];
    }

    return {
      mockId: spec.id,
      artifactVersion: plan.templateVersion,
      templateId: plan.templateId,
      engine: plan.engine,
      generatedAt: S.nowIso(),
      precision: precise ? "element" : "page",
      pages: pages,
      questionAnchors: anchors,
      answerBindings: (spec.answerBindings || []).map(function (b) {
        return { id: b.id, questionId: b.questionId, number: b.number, inputType: b.inputType, points: b.points };
      })
    };
  }

  /* 問題 ID から表示ページを引く（デジタル解答用紙の同期に使う） */
  function pageOf(manifest, questionId) {
    var a = (manifest.questionAnchors || []).find(function (x) { return x.questionId === questionId; });
    return a ? a.page : null;
  }
  function questionsOnPage(manifest, page) {
    return (manifest.questionAnchors || []).filter(function (a) { return a.page === page; })
      .map(function (a) { return a.questionId; });
  }

  VQ2.layout = {
    BLOCK_TYPES: BLOCK_TYPES,
    TUNABLES: TUNABLES,
    buildPlan: buildPlan,
    buildManifest: buildManifest,
    pageOf: pageOf,
    questionsOnPage: questionsOnPage,
    circled: circled,
    sanitizeTuning: sanitizeTuning,
    clampTunable: clampTunable,
    answerLines: answerLines
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
