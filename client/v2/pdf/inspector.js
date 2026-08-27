/* ══════════════════════════════════════════════════════════════════════
   紙面検査（§19）
   ・レンダリング済みの DOM から実際の位置を測る。画像化して OCR しない。
   ・見つかった問題は構造化して返す。思考の過程や紙面の感想は保存しない。
   ・測れなかった項目は「測れなかった」と記録する。推測で欠陥を作らない。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var S = VQ2.schema, TPL = VQ2.templates;

  var MM_PER_PX = 25.4 / 96;
  function pxToMm(px) { return px * MM_PER_PX; }

  /* ── 検査本体 ───────────────────────────────────────────────
     iframe に描画済みの文書を渡す。戻り値は issues と measurements。 */
  function inspect(iframe, spec, plan) {
    var d = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
    if (!d || !d.body) {
      return { ok: false, issues: [{ page: 1, severity: "high", issueType: "compile_error",
        description: "紙面を描画できませんでした。", confidence: 1 }], measurements: null };
    }

    var issues = [];
    var pages = Array.prototype.slice.call(d.querySelectorAll(".page"));
    if (!pages.length) {
      return { ok: false, issues: [{ page: 1, severity: "high", issueType: "compile_error",
        description: "ページが 1 枚も生成されませんでした。", confidence: 1 }], measurements: null };
    }

    var paper = plan.paper;
    var margins = paper.margins || { top: 20, bottom: 20, left: 18, right: 18 };
    var safeMm = 4;                      /* 安全余白：印刷機の実際の余白ぶん */
    var minFontPt = paper.minimumFontSize || 9;

    var anchors = [], pageInfos = [];
    var seenQuestions = {}, seenBindings = {};

    pages.forEach(function (page, pi) {
      var pageNo = pi + 1;
      var pr = page.getBoundingClientRect();
      var content = page.querySelector(".sheet") || page;
      var cr = content.getBoundingClientRect();

      pageInfos.push({
        page: pageNo,
        widthMm: Math.round(pxToMm(pr.width) * 10) / 10,
        heightMm: Math.round(pxToMm(pr.height) * 10) / 10
      });

      /* 1) はみ出し（用紙の外に出ている） */
      var over = Array.prototype.filter.call(page.querySelectorAll("*"), function (n) {
        if (!n.getBoundingClientRect) return false;
        var r = n.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return false;
        return r.right > pr.right + 1 || r.left < pr.left - 1 || r.bottom > pr.bottom + 1;
      });
      if (over.length) {
        issues.push({
          page: pageNo, severity: "high", issueType: "overflow",
          description: pageNo + " ページ目で " + over.length + " 箇所が用紙からはみ出しています。",
          affectedElementId: idOf(over[0]),
          suggestedAction: "文字を小さくするか、問題数を減らしてください。", confidence: 0.95
        });
      }

      /* 2) 安全余白への侵入 */
      var intrude = Array.prototype.filter.call(page.querySelectorAll(".q, .ch, .ans, .src, .as-row"), function (n) {
        var r = n.getBoundingClientRect();
        return r.left < pr.left + mmToPx(safeMm) - 1 || r.right > pr.right - mmToPx(safeMm) + 1;
      });
      if (intrude.length) {
        issues.push({
          page: pageNo, severity: "medium", issueType: "unsafe_margin",
          description: pageNo + " ページ目で " + intrude.length + " 箇所が安全余白（" + safeMm + "mm）に入っています。",
          affectedElementId: idOf(intrude[0]),
          suggestedAction: "余白を広げてください。", confidence: 0.8
        });
      }

      /* 3) 小さすぎる文字 */
      var tiny = Array.prototype.filter.call(page.querySelectorAll(".q-text, .ch-i, .src, .ans"), function (n) {
        var fs = parseFloat((iframe.contentWindow.getComputedStyle(n) || {}).fontSize || "0");
        return fs > 0 && (fs * 0.75) < minFontPt - 0.4;      /* px → pt */
      });
      if (tiny.length) {
        issues.push({
          page: pageNo, severity: "medium", issueType: "unreadable_font",
          description: pageNo + " ページ目に、指定した最小サイズ（" + minFontPt + "pt）より小さい文字が " + tiny.length + " 箇所あります。",
          suggestedAction: "文字の倍率を上げるか、内容を減らしてください。", confidence: 0.85
        });
      }

      /* 4) 要素どうしの重なり */
      var boxes = Array.prototype.map.call(page.querySelectorAll(".q, .ch, .ans, .src, .fig, .as-row"), function (n) {
        return { n: n, r: n.getBoundingClientRect() };
      }).filter(function (b) { return b.r.width > 0 && b.r.height > 0; });
      var overlaps = 0, firstOverlap = null;
      for (var i = 0; i < boxes.length; i++) {
        for (var j = i + 1; j < boxes.length; j++) {
          if (boxes[i].n.contains(boxes[j].n) || boxes[j].n.contains(boxes[i].n)) continue;
          if (rectsOverlap(boxes[i].r, boxes[j].r, 2)) {
            overlaps++;
            if (!firstOverlap) firstOverlap = boxes[i].n;
          }
        }
      }
      if (overlaps) {
        issues.push({
          page: pageNo, severity: "high", issueType: "overlap",
          description: pageNo + " ページ目で " + overlaps + " 箇所の要素が重なっています。",
          affectedElementId: idOf(firstOverlap),
          suggestedAction: "問題の間隔を広げてください。", confidence: 0.9
        });
      }

      /* 5) 問題文と選択肢の不自然な分離（設問がページ末で切れている） */
      Array.prototype.forEach.call(page.querySelectorAll(".q"), function (q) {
        var next = q.nextElementSibling;
        if (!next || !next.classList.contains("ch")) return;
        var qr = q.getBoundingClientRect(), nr = next.getBoundingClientRect();
        if (nr.top > pr.bottom - 2 || qr.bottom > pr.bottom - mmToPx(10)) {
          issues.push({
            page: pageNo, severity: "medium", issueType: "orphaned_choice",
            description: "問" + (q.querySelector(".q-no") ? q.querySelector(".q-no").textContent.replace(/^問/, "") : "")
              + " の選択肢が問題文と別のページに分かれています。",
            affectedElementId: q.getAttribute("data-question") || "",
            suggestedAction: "この設問の前で改ページしてください。", confidence: 0.75
          });
        }
      });

      /* 6) 画像の欠落 */
      Array.prototype.forEach.call(page.querySelectorAll("img"), function (img) {
        if (!img.complete || img.naturalWidth === 0) {
          issues.push({
            page: pageNo, severity: "high", issueType: "missing_image",
            description: pageNo + " ページ目の図を読み込めませんでした。",
            affectedElementId: idOf(img), confidence: 1
          });
        }
      });

      /* 7) 過度な空白（ページの下半分以上が空いている・最終ページを除く） */
      if (pi < pages.length - 1) {
        var last = lastVisibleChild(content);
        if (last) {
          var lr = last.getBoundingClientRect();
          var usedRatio = (lr.bottom - cr.top) / Math.max(1, cr.height);
          if (usedRatio < 0.5) {
            issues.push({
              page: pageNo, severity: "low", issueType: "excessive_whitespace",
              description: pageNo + " ページ目は下半分以上が空いています（使用 " + Math.round(usedRatio * 100) + "%）。",
              suggestedAction: "改ページの位置を見直してください。", confidence: 0.7
            });
          }
        }
      }

      /* 8) ページ番号 */
      if (paper.pageNumbering && !page.querySelector(".pgno")) {
        issues.push({
          page: pageNo, severity: "low", issueType: "missing_page_number",
          description: pageNo + " ページ目にページ番号がありません。", confidence: 1
        });
      }

      /* アンカーの収集（実測） */
      Array.prototype.forEach.call(page.querySelectorAll("[data-question]"), function (n) {
        var qid = n.getAttribute("data-question");
        if (!qid || seenQuestions[qid]) return;
        seenQuestions[qid] = true;
        var r = n.getBoundingClientRect();
        anchors.push({
          questionId: qid,
          answerBindingId: n.getAttribute("data-binding") || null,
          page: pageNo,
          region: {
            x: round2((r.left - pr.left) / pr.width),
            y: round2((r.top - pr.top) / pr.height),
            width: round2(r.width / pr.width),
            height: round2(r.height / pr.height),
            coordinateSystem: "normalized"
          }
        });
      });
      Array.prototype.forEach.call(page.querySelectorAll("[data-binding]"), function (n) {
        var bid = n.getAttribute("data-binding");
        if (bid) seenBindings[bid] = pageNo;
      });
    });

    /* ── 紙面プロファイルを使ったときの追加検査 ──────────────────
       ・図表のまとまりがページで分断されていないか
       ・セルが最小の幅・高さを下回っていないか
       ・文字が枠から切れていないか
       いずれも実際に描いたものを測って判定する（推測しない）。 */
    var figSpan = {};
    Array.prototype.forEach.call(d.querySelectorAll("[data-figgroup]"), function (n) {
      var id = n.getAttribute("data-figgroup");
      var page = n.closest(".page");
      var pageNo = page ? pages.indexOf(page) + 1 : 0;
      if (!figSpan[id]) figSpan[id] = {};
      figSpan[id][pageNo] = true;
      /* まとまりの中の図が別のページへ行っていないか */
      Array.prototype.forEach.call(n.querySelectorAll(".fgi"), function (item) {
        var ip = item.closest(".page");
        var ino = ip ? pages.indexOf(ip) + 1 : 0;
        figSpan[id][ino] = true;
      });
    });
    Object.keys(figSpan).forEach(function (id) {
      var ps = Object.keys(figSpan[id]);
      if (ps.length > 1) {
        issues.push({
          page: parseInt(ps[0], 10) || 1, severity: "high", issueType: "figure_group_split",
          description: "図表のまとまりが " + ps.length + " ページに分かれています。",
          affectedElementId: id,
          suggestedAction: "図表の並べ方を変えるか、前の設問との間で改ページしてください。", confidence: 1
        });
      }
    });

    /* 解答用紙のセル：最小の幅・高さ、文字の切れ */
    var MIN_CELL_MM = 8;
    Array.prototype.forEach.call(d.querySelectorAll(".agbt td, .agbt th"), function (n) {
      var r = n.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      var page = n.closest(".page");
      var pageNo = page ? pages.indexOf(page) + 1 : 1;
      if (n.classList.contains("agb-sp")) return;              /* 詰め物は対象外 */
      if (pxToMm(r.width) < MIN_CELL_MM - 0.5) {
        issues.push({
          page: pageNo, severity: "medium", issueType: "cell_too_narrow",
          description: "解答欄が細すぎます（" + Math.round(pxToMm(r.width) * 10) / 10 + "mm）。",
          affectedElementId: idOf(n), confidence: 1
        });
      }
      if (pxToMm(r.height) < MIN_CELL_MM - 0.5) {
        issues.push({
          page: pageNo, severity: "medium", issueType: "cell_too_short",
          description: "解答欄が低すぎます（" + Math.round(pxToMm(r.height) * 10) / 10 + "mm）。",
          affectedElementId: idOf(n), confidence: 1
        });
      }
      /* 中身が枠からあふれていないか（overflow:hidden で切れている） */
      if (n.scrollWidth > n.clientWidth + 2 || n.scrollHeight > n.clientHeight + 2) {
        issues.push({
          page: pageNo, severity: "high", issueType: "clipped_text",
          description: "解答欄の中身が枠から切れています。",
          affectedElementId: idOf(n), confidence: 0.9
        });
      }
    });

    /* ── 冊子をまたぐ検査 ────────────────────────────────── */
    var allQuestions = [];
    (spec.sections || []).forEach(function (sec) {
      (sec.questions || []).forEach(function (q) { allQuestions.push({ q: q, sec: sec }); });
    });

    /* 9) 問題番号の欠番（紙面に出ていない設問） */
    var missing = allQuestions.filter(function (x) { return !seenQuestions[x.q.id]; });
    if (missing.length) {
      issues.push({
        page: 1, severity: "high", issueType: "missing_question_number",
        description: missing.length + " 問が紙面に出力されていません（" + missing.slice(0, 3).map(function (x) { return "問" + x.q.number; }).join("・") + " ほか）。",
        suggestedAction: "テンプレートが対応していない問題形式が含まれていないか確認してください。", confidence: 1
      });
    }

    /* 10) 解答欄の欠落 */
    var noBinding = allQuestions.filter(function (x) { return x.q.answerBindingId && !seenBindings[x.q.answerBindingId]; });
    if (noBinding.length) {
      issues.push({
        page: 1, severity: "high", issueType: "missing_answer_binding",
        description: noBinding.length + " 問に対応する解答欄が紙面にありません。",
        suggestedAction: "解答用紙を生成し直してください。", confidence: 1
      });
    }

    /* 11) 配点の不一致（紙面に出た配点と MockSpec） */
    var printedPoints = 0;
    Array.prototype.forEach.call(d.querySelectorAll(".q-pts"), function (n) {
      var m = String(n.textContent || "").match(/(\d+)/);
      if (m) printedPoints += parseInt(m[1], 10);
    });
    if (printedPoints > 0 && printedPoints !== spec.totalPoints) {
      issues.push({
        page: 1, severity: "high", issueType: "points_mismatch",
        description: "紙面に印刷された配点の合計（" + printedPoints + " 点）が、満点 " + spec.totalPoints + " 点と一致しません。",
        confidence: 1
      });
    }

    /* 12) 記述の解答欄が足りない */
    allQuestions.forEach(function (x) {
      var q = x.q;
      if (["long_answer", "essay", "english_writing", "source_analysis"].indexOf(q.type) < 0) return;
      var need = Math.ceil((q.expectedChars || 120) / 35);
      var el = d.querySelector('[data-question="' + cssEsc(q.id) + '"].as-row, [data-question="' + cssEsc(q.id) + '"] .ans');
      var lines = el ? el.querySelectorAll(".ans-line").length : 0;
      if (lines > 0 && lines < need) {
        issues.push({
          page: seenBindings[q.answerBindingId] || 1, severity: "medium", issueType: "insufficient_answer_space",
          description: "問" + q.number + " の解答欄が " + lines + " 行で、想定字数（約 " + (q.expectedChars || 120) + " 字）に足りません。",
          affectedElementId: q.id,
          suggestedAction: need + " 行以上に広げてください。", confidence: 0.8
        });
      }
    });

    return {
      ok: true,
      issues: issues,
      measurements: { pages: pageInfos, anchors: anchors, pageCount: pages.length },
      summary: {
        pageCount: pages.length,
        high: issues.filter(function (i) { return i.severity === "high"; }).length,
        medium: issues.filter(function (i) { return i.severity === "medium"; }).length,
        low: issues.filter(function (i) { return i.severity === "low"; }).length
      }
    };

    function mmToPx(mm) { return mm / MM_PER_PX; }
  }

  function rectsOverlap(a, b, tol) {
    tol = tol || 0;
    return !(a.right - tol <= b.left || b.right - tol <= a.left || a.bottom - tol <= b.top || b.bottom - tol <= a.top);
  }
  function idOf(n) {
    if (!n) return "";
    return n.getAttribute("data-question") || n.getAttribute("data-block") || n.getAttribute("data-binding") || n.className || "";
  }
  function lastVisibleChild(n) {
    var kids = Array.prototype.filter.call(n.children, function (c) {
      var r = c.getBoundingClientRect();
      return r.height > 0;
    });
    return kids.length ? kids[kids.length - 1] : null;
  }
  function round2(v) { return Math.round(v * 1000) / 1000; }
  function cssEsc(s) { return String(s).replace(/["\\]/g, "\\$&"); }

  /* ══════════════════════════════════════════════════════════════════
     修正の適用（§19 の修正ループ）
     ・指摘に対して、テンプレートの許可された範囲でだけ紙面を調整する。
     ・直せない指摘は残す。無限ループにしない。
     ══════════════════════════════════════════════════════════════════ */
  function suggestTuning(issues, currentTuning) {
    var t = Object.assign({}, currentTuning || {});
    var applied = [];
    issues.forEach(function (i) {
      if (i.issueType === "overflow" || i.issueType === "unsafe_margin") {
        t.fontScale = clamp("fontScale", (t.fontScale || 1) - 0.03);
        t.questionGapMm = clamp("questionGapMm", (t.questionGapMm || 8) - 1);
        applied.push("文字と間隔を少し詰めました");
      } else if (i.issueType === "unreadable_font") {
        t.fontScale = clamp("fontScale", (t.fontScale || 1) + 0.04);
        applied.push("文字を少し大きくしました");
      } else if (i.issueType === "overlap") {
        t.questionGapMm = clamp("questionGapMm", (t.questionGapMm || 8) + 2);
        t.lineHeight = clamp("lineHeight", (t.lineHeight || 1.85) + 0.05);
        applied.push("問題の間隔を広げました");
      } else if (i.issueType === "excessive_whitespace") {
        t.questionGapMm = clamp("questionGapMm", (t.questionGapMm || 8) - 1);
        applied.push("余白を詰めました");
      } else if (i.issueType === "insufficient_answer_space") {
        t.answerLines = clamp("answerLines", (t.answerLines || 3) + 2);
        applied.push("解答欄の行数を増やしました");
      }
    });
    return { tuning: t, applied: [...new Set(applied)] };
  }
  function clamp(key, v) {
    var c = VQ2.layout.clampTunable(key, v);
    return c === null ? v : c;
  }

  /* 直せない種類の指摘（データを直さないと解決しない） */
  var UNFIXABLE = ["missing_question_number", "missing_answer_binding", "points_mismatch",
                   "missing_image", "compile_error", "booklet_mismatch"];
  function unfixable(issues) {
    return (issues || []).filter(function (i) { return UNFIXABLE.indexOf(i.issueType) >= 0; });
  }
  function fixable(issues) {
    return (issues || []).filter(function (i) { return UNFIXABLE.indexOf(i.issueType) < 0; });
  }

  VQ2.inspector = {
    inspect: inspect,
    suggestTuning: suggestTuning,
    unfixable: unfixable,
    fixable: fixable,
    UNFIXABLE: UNFIXABLE,
    pxToMm: pxToMm
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
