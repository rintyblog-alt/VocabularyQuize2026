/* ══════════════════════════════════════════════════════════════════════
   問題形式の実態（Capability Matrix）

   レジストリに名前があることと、**本当に使えること**は別。
   ここでは 1 形式ずつ、実際に次を試して確かめる。

     ・空の問題を作れるか（qmodel.empty）
     ・保存の検証を通るか（schema / validate）
     ・編集フォームがあるか（qtypeEditor / 共通フォーム）
     ・表示できるか（qrender の RENDERERS にエンジンがあるか）
     ・採点できるか（evaluator の ENGINE_EVAL にエンジンがあるか）
     ・結果画面で答えを再現できるか（qrender.reviewHtml）
     ・AI へ頼める形があるか（qplan の SHAPE と取り込み）
     ・Insight で日本語の名前に変換できるか
     ・Quick Mock（紙）に載せられるか

   **名前があるだけのものを「対応済み」と呼ばない。**
   ここで production と判定できたものだけを AI へ渡す。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var Q = VQ2.qtypes, M = VQ2.qmodel, S = VQ2.schema, V = VQ2.validate, EV = VQ2.evaluator, P = VQ2.qplan;

  function arr(v) { return Array.isArray(v) ? v : []; }
  function str(v) { return v === undefined || v === null ? "" : String(v); }

  /* 紙に落とせない操作。Quick Mock（印刷）では使えない。

     ── 2026-08-05 の見直し（docs/GENERATION_CONTRACT.md §2）──
     ここには以前 reorder / matching / classification も入っていた。
     この 3 つは「操作としては紙で成立する」ので、ここからは外す。
     紙に出せるものを「出せない」と書いていたため、
     「英文並び替えで作って」と頼んでも Quick Mock では**計画の段階で落ちて
     いた**（qplan.spread / blueprint.candidates がこの表で AI へ渡す形式を絞る）。

     残すのは、紙の上で操作そのものが成立しないもの
     （音を聞く・画像をタップする・カードをめくる）だけ。

     ── ただし、ここを外しただけでは紙に出ない（2026-08-05 実測）──
     契約 §2 は「layout-grammar.js に ordering / matching / word-bank の
     ブロック型があるから紙に出せる」と書いているが、**それだけでは出ない**。
     実際に印刷経路（layout + pdfRenderer）へ流すと、

       ・ブロック型が選ばれるのは type が ちょうど "ordering" / "matching"
         のときだけ（reorder_english などは短答扱いになる）
       ・そもそも pdf/ 側は orderItems / pairs / classification を
         **1 か所も読んでいない**（grep で 0 件）

     ので、どの形式でも「並び替えなさい」とだけ書かれた紙になる。
     だから紙の可否は、この表ではなく下の実測（paperCarriesContent）で決める。 */
  var NO_PAPER_ENGINES = {
    image_point: 1, image_label: 1,
    audio_choice: 1, dictation: 1, flashcard: 1
  };

  /* ══════════════════════════════════════════════════════════════════
     紙に「解くのに要る中身」が本当に出るか（実測する）

     上の NO_PAPER_ENGINES は「操作そのものが紙で成立しない」ものの一覧で、
     **紙面を組む側が中身を刷れるかどうかは何も言っていない。**

     実測（2026-08-05）で、次のことが分かった。
       ・pdf/renderer.js は問題文と選択肢しか刷らない。
       ・orderItems（並べる語）・pairs（左右の対応）・classification（分類の箱）
         は pdf/ のどこからも読まれていない（grep で 0 件）。
       ・その結果、reorder / matching / classification / table_fill / chart_read は
         「並び替えなさい」とだけ書かれた紙になり、**並べる語が 1 つも出ない**。
         解答用紙も記述の行が引かれるだけ。まさに訴えのとおりだった。

     ここで宣言を書き足すと、また「出るはず」と嘘をつくことになる。
     そこで **印刷経路（VQ2.layout + VQ2.pdfRenderer）をそのまま通して確かめる。**
     紙面を組む側が中身を刷れるようになれば、この判定は自動で通るようになる
     （ここを書き換える必要はない）。

     印刷の層がまだ読み込まれていないときは null を返す。
     「確かめられない」を「駄目」と決めない（uiReady と同じ考え方）。
     ══════════════════════════════════════════════════════════════════ */
  var PMARK_A = "ZzPaperProbeA", PMARK_B = "ZzPaperProbeB";

  /* エンジンごとに「これが紙へ出なければ解けない」中身を置く。
     戻り値は、紙面に出ていなければならない目印の一覧。空なら問題文だけで解ける。 */
  var PAPER_SAMPLE = {
    single_choice: function (q) {
      q.choices = [{ id: "c1", label: "A", text: PMARK_A, isCorrect: true },
                   { id: "c2", label: "B", text: PMARK_B, isCorrect: false }];
      return [PMARK_A, PMARK_B];
    },
    multi_choice: function (q) {
      q.choices = [{ id: "c1", label: "A", text: PMARK_A, isCorrect: true },
                   { id: "c2", label: "B", text: PMARK_B, isCorrect: true }];
      return [PMARK_A, PMARK_B];
    },
    image_choice: function (q) { return PAPER_SAMPLE.single_choice(q); },
    audio_choice: function (q) { return PAPER_SAMPLE.single_choice(q); },
    reorder: function (q) {
      q.orderItems = [{ id: "i1", text: PMARK_A, fixed: false, order: 1 },
                      { id: "i2", text: PMARK_B, fixed: false, order: 2 }];
      q.correctOrder = ["i1", "i2"];
      return [PMARK_A, PMARK_B];
    },
    matching: function (q) {
      q.pairs = { left: [{ id: "L1", text: PMARK_A }],
                  right: [{ id: "R1", text: PMARK_B }], correct: { L1: "R1" } };
      return [PMARK_A, PMARK_B];
    },
    classification: function (q) {
      q.classification = { groups: [{ id: "g1", label: PMARK_A, isExclude: false }],
                           items: [{ id: "t1", text: PMARK_B, groupId: "g1" }] };
      return [PMARK_A, PMARK_B];
    },
    table_fill: function (q) {
      q.table = { caption: "", columns: [{ id: "c1", text: PMARK_A }],
                  rows: [{ id: "r1", header: PMARK_B,
                           cells: [{ id: "x1", text: "", editable: true, answer: "z", acceptedAnswers: [], options: [] }] }] };
      return [PMARK_A, PMARK_B];
    },
    chart_read: function (q) {
      q.chart = { kind: "bar", title: PMARK_A, series: [{ name: PMARK_B, points: [{ x: "1", y: 2 }] }] };
      q.correctAnswer = "2";
      return [PMARK_A];
    },
    error_correction: function (q) {
      q.prompt = PMARK_A + " is wrong.";
      q.errorSpans = [{ id: "e1", start: 0, end: PMARK_A.length, correct: PMARK_B }];
      return [PMARK_A];
    },
    image_label: function (q) {
      q.labels = { slots: [{ id: "s1", x: 0.5, y: 0.5, answerId: "b1" }], bank: [{ id: "b1", text: PMARK_A }] };
      return [PMARK_A];
    },
    flashcard: function (q) { q.card = { front: PMARK_A, back: PMARK_B }; return [PMARK_A]; }
  };

  var paperCache = Object.create(null);
  function paperReady() {
    try {
      return !!(VQ2.layout && typeof VQ2.layout.buildPlan === "function"
        && VQ2.pdfRenderer && typeof VQ2.pdfRenderer.buildHtml === "function"
        && S && typeof S.defaultPaper === "function" && M && typeof M.empty === "function");
    } catch (e) { return false; }
  }

  /* true=中身が紙へ届く / false=届かない / null=まだ確かめられない */
  function paperCarriesContent(engine, type) {
    if (!paperReady()) return null;
    if (engine in paperCache) return paperCache[engine];
    var res = null;
    try {
      var q = M.empty(type, { points: 10 });
      q.id = "q1"; q.sectionId = "s1"; q.number = 1; q.answerBindingId = "b1";
      q.prompt = "つぎの問いに答えなさい。"; q.explanation = "解説";
      var need = PAPER_SAMPLE[engine] ? (PAPER_SAMPLE[engine](q) || []) : [];
      if (!need.length) res = true;         /* 問題文だけで解ける形式は、問題文が出れば足りる */
      else {
        var spec = {
          id: "cap_paper_probe", schemaVersion: 2, ownerId: "local",
          title: "紙面確認", subject: "", grade: "", audience: "",
          durationMinutes: 50, totalPoints: 10, instructions: "",
          sourceMode: "source-only", sourceReferences: [], paper: S.defaultPaper(),
          sections: [{ id: "s1", number: 1, title: "大問1", instructions: "", points: 10, questions: [q] }],
          answerBindings: [{ id: "b1", questionId: "q1", number: "1", inputType: "short_answer", points: 10 }]
        };
        var html = str(VQ2.pdfRenderer.buildHtml(spec, VQ2.layout.buildPlan(spec, {}), { bookletId: "question-booklet" }));
        res = need.every(function (n) { return html.indexOf(n) >= 0; });
      }
    } catch (e) { res = null; }
    if (res !== null) paperCache[engine] = res;
    return res;
  }

  var cache = null;

  function renderers() {
    try { return (VQ2.qrender && VQ2.qrender.RENDERERS) || null; } catch (e) { return null; }
  }
  function evaluators() {
    try { return (EV && EV.ENGINE_EVAL) || null; } catch (e) { return null; }
  }
  function editorHandles(q) {
    try { return !!(VQ2.qtypeEditor && VQ2.qtypeEditor.handles(q)); } catch (e) { return false; }
  }

  /* 1 形式を実際に試す。例外は握りつぶさず、理由として残す。 */
  function probe(def) {
    var id = def.id;
    var out = {
      type: id,
      displayName: Q.shortLabel(id),
      fullName: def.name,
      category: def.category,
      categoryLabel: (Q.category(def.category) || {}).label || "",
      engine: def.engine,
      registryStatus: def.status,
      registered: true,
      modelAvailable: false,
      schemaAvailable: false,
      editorAvailable: false,
      rendererAvailable: false,
      evaluatorAvailable: false,
      resultRendererAvailable: false,
      paperVerified: false,
      paperContentOk: null,
      aiShapeAvailable: false,
      aiGeneratable: false,
      aiPlannable: false,
      answerCheckAvailable: false,
      scoreCheckAvailable: false,
      descriptorAvailable: false,
      insightLabelAvailable: false,
      mobileSupported: true,
      partialCreditSupported: !!def.supportsPartialCredit,
      sourceReferenceSupported: true,
      mockSupported: false,
      status: "unsupported",
      notes: []
    };

    /* ① 空の問題を作れるか */
    var q = null;
    try {
      q = M.empty(id, { points: 1 });
      /* empty() は知らない形式だと 4 択へ落ちる。落ちたら「作れていない」。 */
      if (q && q.type === id) out.modelAvailable = true;
      else out.notes.push("空の問題を作ると別の形式になる");
    } catch (e) {
      out.notes.push("空の問題を作れない: " + str(e && e.message));
    }

    /* ② 保存の検証を通るか（書きかけとして通ればよい） */
    if (q) {
      try {
        var issues = [];
        V.checkQuestionRules
          ? V.checkQuestionRules(q, "q", issues, {})
          : (issues = []);
        var fatal = issues.filter(function (i) {
          return i && i.level === "error" && i.code !== "notWrittenYet";
        });
        out.schemaAvailable = fatal.length === 0;
        if (fatal.length) out.notes.push("作った直後に要修正になる: " + fatal[0].code);
      } catch (e) {
        out.notes.push("検証で落ちる: " + str(e && e.message));
      }
    }

    /* ③ 編集できるか（形式ごとのフォーム、または共通フォームで足りるか） */
    if (q) {
      var COMMON_OK = { single_choice: 1, multi_choice: 1, true_false: 1, free_text: 1, numeric_input: 1, text_input: 1 };
      out.editorAvailable = editorHandles(q) || !!COMMON_OK[def.engine];
      if (!out.editorAvailable) out.notes.push("編集フォームが無い");
    }

    /* ④ 表示できるか */
    var R = renderers();
    out.rendererAvailable = !!(R && R[def.engine]);
    if (!out.rendererAvailable) out.notes.push("表示のしくみが無い");

    /* ⑤ 採点できるか */
    var E = evaluators();
    out.evaluatorAvailable = !!(E && E[def.engine]);
    if (!out.evaluatorAvailable) out.notes.push("採点のしくみが無い");

    /* ⑥ 結果画面で答えを再現できるか */
    try {
      out.resultRendererAvailable = !!(VQ2.qrender && typeof VQ2.qrender.reviewHtml === "function"
        && out.rendererAvailable);
    } catch (e) { out.resultRendererAvailable = false; }

    /* ⑦ AI へ頼める形（エンジンごとの JSON の形）があるか */
    try {
      out.aiShapeAvailable = !!(P && P.SHAPE && P.SHAPE[def.engine]);
    } catch (e) {}
    /* ⑦' AI へ「どんなときに使う形式か」を説明できるか（§15）。
       説明が無い形式を渡しても、AI は使い分けられず 4 択へ寄る。 */
    var descKnown = !!VQ2.qdescriptor;
    try {
      var desc = descKnown ? VQ2.qdescriptor.describe(id) : null;
      out.descriptorAvailable = !!(desc && desc.educationalUse && desc.outputSchemaSummary);
    } catch (e) {}
    if (descKnown && !out.descriptorAvailable) out.notes.push("AI へ渡す説明が無い");

    /* ⑦'' 解けるか・点をつけられるかを確かめるしくみがあるか（§20 / §21） */
    try {
      var A = VQ2.answerability;
      out.answerCheckAvailable = !!(A && A.ANSWERABLE && A.ANSWERABLE[def.engine]);
      out.scoreCheckAvailable = !!(A && typeof A.checkScorable === "function");
    } catch (e) {}
    if (!out.answerCheckAvailable) out.notes.push("解けるかを確かめるしくみが無い");

    out.aiGeneratable = !!(def.supportsAI && out.aiShapeAvailable
      && (!descKnown || out.descriptorAvailable)
      && out.modelAvailable && out.rendererAvailable && out.evaluatorAvailable);
    /* 配分（Blueprint）に載せられるか。AI へ渡す形と説明の両方が要る。 */
    out.aiPlannable = !!(out.aiGeneratable && out.answerCheckAvailable);
    if (def.supportsAI && !out.aiShapeAvailable) out.notes.push("AI へ渡す形が決まっていない");

    /* ⑧ Insight で日本語の名前になるか */
    var lab = Q.shortLabel(id);
    out.insightLabelAvailable = !!lab && !/_/.test(lab) && lab !== id;
    if (!out.insightLabelAvailable) out.notes.push("表示名が内部 ID のまま");

    /* ⑨ スマホで操作できるか（運ぶ操作は指でも動く作りにしてある） */
    out.mobileSupported = out.rendererAvailable;

    /* ⑩ 紙にできるか
       　 二段構え。
       　   (a) 操作そのものが紙で成立するか（音・タップ・めくる → 駄目）
       　   (b) 解くのに要る中身が本当に紙へ届くか（**実際に刷って確かめる**）
       　 (b) を足したのは、reorder / matching / classification が
       　 「並び替えなさい」とだけ書かれた紙になっていたため（並べる語が出ない）。 */
    var carries = paperCarriesContent(def.engine, id);
    out.paperVerified = carries !== null;
    out.paperContentOk = carries;
    out.mockSupported = out.rendererAvailable && out.evaluatorAvailable
      && !NO_PAPER_ENGINES[def.engine] && carries !== false;
    if (carries === false)
      out.notes.push("紙面にこの形式の中身（並べる語・左右の対応・分類の箱など）が出ない");
    else if (!out.mockSupported && out.rendererAvailable)
      out.notes.push("紙にできない操作（試験では短答へ落とす）");

    out.status = decide(def, out);
    return out;
  }

  function decide(def, c) {
    if (def.status === "coming_soon") return "coming_soon";
    if (!c.rendererAvailable || !c.evaluatorAvailable) return "unsupported";
    if (!c.modelAvailable) return "unsupported";
    if (!c.schemaAvailable) return "manual_only";
    if (!c.editorAvailable) return c.aiGeneratable ? "generation_only" : "unsupported";
    if (def.status === "beta") return "beta";
    if (!c.insightLabelAvailable) return "beta";
    return "production";
  }

  /* 表示・編集のしくみは UI が読み込まれてから分かる。
     まだ読み込まれていないうちに作った表を覚えてしまうと、
     「表示できない」と誤って言い続ける。**そろうまで覚えない。** */
  function build(opts) {
    opts = opts || {};
    if (cache && !opts.force) return cache;
    var list = Q.list({}).filter(function (d) { return !d.mode; });
    var out = list.map(probe);
    if (renderers()) cache = out;
    return out;
  }

  function get(type) {
    var all = build();
    for (var i = 0; i < all.length; i++) if (all[i].type === type) return all[i];
    return null;
  }

  function stats(opts) {
    var all = build(opts);
    var byStatus = Object.create(null);
    all.forEach(function (c) { byStatus[c.status] = (byStatus[c.status] || 0) + 1; });
    return {
      total: all.length,
      byStatus: byStatus,
      production: byStatus.production || 0,
      beta: byStatus.beta || 0,
      generationOnly: byStatus.generation_only || 0,
      manualOnly: byStatus.manual_only || 0,
      comingSoon: byStatus.coming_soon || 0,
      unsupported: byStatus.unsupported || 0,
      aiGeneratable: all.filter(function (c) { return c.aiGeneratable; }).length,
      mockSupported: all.filter(function (c) { return c.mockSupported; }).length
    };
  }

  /* ══════════════════════════════════════════════════════════════════
     AI へ渡してよい形式だけを選ぶ
     ・**名前の一覧を丸ごと渡さない。** ここで絞ったものだけ渡す。
     ・Quick Mock では、さらに紙にできるものだけにする。
     ══════════════════════════════════════════════════════════════════ */
  /* 表示・編集のしくみは画面（UI）が読み込まれてから分かる。
     まだ読めないうちに「全部使えない」と決めると 1 問も作れなくなる。
     そのときは**レジストリの申告**を使い、確かめられていないことを示す。 */
  function uiReady() { return !!renderers(); }

  function forAi(opts) {
    opts = opts || {};
    if (!uiReady()) {
      return Q.list({}).filter(function (d) {
        if (d.mode) return false;
        /* ベータは既定では渡さない（strict のときと同じ扱いにそろえる） */
        if (d.status !== "available" && !(opts.allowBeta && d.status === "beta")) return false;
        if (!d.supportsAI) return false;
        /* 説明を書いていない形式は渡さない。渡しても使い分けられない。
           （説明の層そのものが読み込まれていないときは、ここでは判定しない。
             「確かめられない」を「駄目」と決めると 1 問も作れなくなる。） */
        if (VQ2.qdescriptor) {
          var desc = null;
          try { desc = VQ2.qdescriptor.describe(d.id); } catch (e) {}
          if (!desc || !desc.educationalUse || !desc.outputSchemaSummary) return false;
        }
        if (opts.mock && NO_PAPER_ENGINES[d.engine]) return false;
        if (opts.engines && opts.engines.indexOf(d.engine) < 0) return false;
        return true;
      }).map(function (d) { return d.id; });
    }
    var all = build();
    return all.filter(function (c) {
      if (!c.aiGeneratable) return false;
      if (c.status !== "production" && !(opts.allowBeta && c.status === "beta")) return false;
      if (opts.mock && !c.mockSupported) return false;
      if (opts.engines && opts.engines.indexOf(c.engine) < 0) return false;
      return true;
    }).map(function (c) { return c.type; });
  }
  /* AI が返してきた形式が使えるか。使えなければ寄せ先を返す。 */
  function resolve(type, opts) {
    opts = opts || {};
    var t = Q.canonicalId ? Q.canonicalId(type) : str(type);
    var c = uiReady() ? get(t) : null;
    if (!uiReady()) {
      var d0 = Q.get(t);
      if (d0 && d0.status === "available" && d0.supportsAI) return { ok: true, type: t };
    }
    if (c && forAi(opts).indexOf(t) >= 0) return { ok: true, type: t };
    /* 同じエンジンで使えるものへ寄せる */
    var engine = c ? c.engine : (Q.engineOf ? Q.engineOf(t) : null);
    var ok = forAi(opts);
    for (var i = 0; i < ok.length; i++) {
      var cand = get(ok[i]);
      if (cand && engine && cand.engine === engine) {
        return { ok: true, type: ok[i], converted: true, from: t, reason: "同じ操作の形式へ寄せました" };
      }
    }
    /* 捨てる前に、**なぜ駄目なのか**をそのまま返す。
       「いまは使えない形式です（production）」では、読んだ人に何も分からない。 */
    return { ok: false, from: t, reason: whyNot(c, opts) };
  }
  function whyNot(c, opts) {
    if (!c) return "知らない形式です";
    if (opts && opts.mock && c.paperContentOk === false)
      return "紙面にこの形式の中身（並べる語・左右の対応・分類の箱など）を出すしくみが、まだありません。"
        + "このまま試験にすると、問題文だけ書かれて解けない紙になります。";
    if (opts && opts.mock && NO_PAPER_ENGINES[c.engine])
      return "紙では成立しない操作です（音を聞く・画像をタップする・カードをめくる）。";
    if (!c.rendererAvailable) return "画面に出すしくみがありません。";
    if (!c.evaluatorAvailable) return "採点のしくみがありません。";
    if (c.status !== "production") return "まだ用意ができていない形式です（" + c.status + "）。";
    return "いまは使えない形式です。";
  }

  /* ══════════════════════════════════════════════════════════════════
     生成したあとの検証（V3 §31）
     ・レジストリに名前があること、エンジンにレンダラがあることでは足りない。
       **その 1 問**が、本当に「描けて・採点できて・（試験なら）紙に出る」かを見る。
     ・ここは実物を使う。qrender で実際に描き、evaluator で実際に採点する。
       文字列を眺めて「たぶん大丈夫」とは言わない。
     ══════════════════════════════════════════════════════════════════ */
  function verify(q, opts) {
    opts = opts || {};
    var issues = [];
    function bad(code, message) { issues.push({ code: code, message: message, level: "error" }); }
    function warn(code, message) { issues.push({ code: code, message: message, level: "warning" }); }

    if (!q || !q.type) {
      bad("noType", "形式が決まっていません。");
      return { ok: false, issues: issues, render: null, evaluate: null, paper: null };
    }
    var def = Q.get(q.type);
    if (!def) {
      bad("unknownType", "知らない形式です（" + str(q.type) + "）。");
      return { ok: false, issues: issues, render: null, evaluate: null, paper: null };
    }

    /* ① Renderer 互換 … 実際に描いて、その形式の操作 UI が出たか */
    var render = null;
    var R = (VQ2.qrender && typeof VQ2.qrender.probeRender === "function") ? VQ2.qrender : null;
    if (!R) warn("renderNotChecked", "画面の層が読み込まれていないので、表示は確かめていません。");
    else {
      render = R.probeRender(q, null, {});
      if (!render.ok) bad("renderIncompatible", render.reason || "この形式の操作 UI が出ません。");
    }

    /* ② Evaluator 互換 … 正解を入れて満点になるか */
    var evaluate = null;
    if (!EV || typeof EV.evaluate !== "function") {
      warn("evalNotChecked", "採点の層が読み込まれていないので、採点は確かめていません。");
    } else if (Q.isAiGraded && Q.isAiGraded(q.type)) {
      evaluate = { skipped: true, reason: "AI 採点の形式なので、その場では点を出しません。" };
    } else {
      var model = null;
      try { model = (q.modelVersion === M.MODEL_VERSION) ? q : M.normalize(q); } catch (e) { model = null; }
      var want = null;
      try { want = correctValueOf(model); } catch (e) { want = null; }
      if (want === null) warn("noSampleAnswer", "正解から答えの形を組み立てられないので、採点は確かめていません。");
      else {
        try {
          var r = EV.evaluate(model, want);
          evaluate = { correct: !!(r && r.correct), score: r ? r.score : null,
                       maxScore: r ? r.maxScore : null, method: r ? r.method : "" };
          var full = evaluate.correct
            && isNum(evaluate.score) && isNum(evaluate.maxScore) && evaluate.score === evaluate.maxScore;
          if (!full)
            bad("evalIncompatible", "正解をそのまま入れても満点になりません（採点が形式に合っていません）。"
              + "得点 " + str(evaluate.score) + " / " + str(evaluate.maxScore) + "（" + str(evaluate.method) + "）");
        } catch (e) {
          bad("evalThrows", "採点しようとすると落ちます: " + str(e && e.message));
        }
      }
    }

    /* ③ 印刷互換 … 試験（紙）のときだけ。中身が紙へ届くか */
    var paper = null;
    if (opts.mock) {
      if (NO_PAPER_ENGINES[def.engine]) {
        paper = false;
        bad("notPrintable", "紙では成立しない操作です（音・タップ・めくる）。");
      } else {
        paper = paperCarriesContent(def.engine, q.type);
        if (paper === false) bad("paperMissingContent", whyNot(get(q.type) || { paperContentOk: false, engine: def.engine, status: "production" }, opts));
        else if (paper === null) warn("paperNotChecked", "印刷の層が読み込まれていないので、紙面は確かめていません。");
      }
    }

    return {
      ok: !issues.some(function (i) { return i.level === "error"; }),
      issues: issues,
      errors: issues.filter(function (i) { return i.level === "error"; }),
      warnings: issues.filter(function (i) { return i.level === "warning"; }),
      render: render, evaluate: evaluate, paper: paper,
      reason: (issues.filter(function (i) { return i.level === "error"; })[0] || {}).message || ""
    };
  }
  function isNum(v) { return typeof v === "number" && isFinite(v); }

  /* 「正解そのもの」を、採点へ渡す答えの形へ組み替える。
     形が分からない形式では null を返す（勝手な形を作って通したことにしない）。 */
  function correctValueOf(q) {
    if (!q) return null;
    var e = q.engine;
    if (e === "single_choice" || e === "image_choice" || e === "audio_choice" || e === "chart_read") {
      var ch = arr(q.choices).filter(function (c) { return c.isCorrect; })[0];
      if (ch) return { choiceId: ch.id };
      return arr(q.choices).length ? null : null;
    }
    if (e === "multi_choice") {
      var ids = arr(q.choices).filter(function (c) { return c.isCorrect; }).map(function (c) { return c.id; });
      return ids.length ? { choiceIds: ids } : null;
    }
    if (e === "true_false") {
      var tf = arr(q.choices).filter(function (c) { return c.isCorrect; })[0];
      if (tf) return { choiceId: tf.id };
      return typeof q.correctAnswer === "boolean" ? { value: q.correctAnswer } : null;
    }
    if (e === "reorder") return arr(q.correctOrder).length ? arr(q.correctOrder).slice() : null;
    if (e === "matching") {
      var p = q.pairs;
      return (p && p.correct && Object.keys(p.correct).length) ? JSON.parse(JSON.stringify(p.correct)) : null;
    }
    if (e === "classification") {
      var c2 = q.classification;
      if (!c2 || !arr(c2.items).length) return null;
      var map = {};
      arr(c2.items).forEach(function (it) { map[it.id] = str(it.groupId); });
      return { items: map };
    }
    if (e === "fill_blank") {
      var bl = arr(q.blanks);
      if (!bl.length) return null;
      /* 採点側は blanks（並び）か byId（空欄 ID ごと）を受ける。 */
      return { blanks: bl.map(function (b) { return str(b.answer); }) };
    }
    if (e === "table_fill") {
      var t = q.table;
      if (!t) return null;
      var cells = {};
      arr(t.rows).forEach(function (r) {
        arr(r.cells).forEach(function (cl) { if (cl.editable) cells[cl.id] = str(cl.answer); });
      });
      return Object.keys(cells).length ? { cells: cells } : null;
    }
    if (e === "text_input" || e === "dictation") {
      return str(q.correctAnswer) ? { text: str(q.correctAnswer) } : null;
    }
    if (e === "numeric_input") {
      return isNum(q.correctAnswer) ? { text: String(q.correctAnswer) } : null;
    }
    return null;
  }

  /* 画面や報告に出す表 */
  function table(opts) {
    return build(opts).map(function (c) {
      return {
        displayName: c.displayName, type: c.type, category: c.categoryLabel, engine: c.engine,
        ai: c.aiGeneratable, plan: c.aiPlannable, descriptor: c.descriptorAvailable,
        answerCheck: c.answerCheckAvailable,
        schema: c.schemaAvailable, editor: c.editorAvailable,
        render: c.rendererAvailable, evaluate: c.evaluatorAvailable, result: c.resultRendererAvailable,
        mobile: c.mobileSupported, insight: c.insightLabelAvailable, mock: c.mockSupported,
        /* 紙は「確かめたのか」まで出す。確かめていないものを○と書かない。 */
        paperVerified: c.paperVerified, paperContent: c.paperContentOk,
        status: c.status, notes: c.notes
      };
    });
  }

  VQ2.capability = {
    build: build, get: get, stats: stats, forAi: forAi, resolve: resolve, table: table,
    uiReady: uiReady,
    /* §31 の検証。生成したあと、1 問ずつ実物で確かめる。 */
    verify: verify,
    /* 紙に中身が届くか（実測）。true / false / null（まだ確かめられない）。 */
    paperCarriesContent: paperCarriesContent,
    paperReady: paperReady,
    correctValueOf: correctValueOf,
    NO_PAPER_ENGINES: NO_PAPER_ENGINES,
    _clear: function () { cache = null; paperCache = Object.create(null); }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
