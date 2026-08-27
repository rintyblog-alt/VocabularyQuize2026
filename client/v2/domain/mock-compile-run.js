/* ══════════════════════════════════════════════════════════════════════
   MockCompiler V2 — 実行の層

   plan()（枠の確定）と assemble()（組み立て）の間をつなぐ。
   AI を呼ぶのはここだけ。呼び方の規則は 3 つ。

     ① 枠のぶんしか頼まない       … 依頼に「何問」「何点」「どの形式」を書く
     ② 受理できないものは入れない … gate を通らなければ、その枠は空のまま
     ③ 空いた枠だけをもう一度頼む … 全体を作り直さない

   ③ が V1 との一番の違い。V1 は 1 問足りないだけでも大問ごと作り直していた。
   ここでは足りない枠だけを名指しで頼むので、やり直しが短く、
   すでにできている設問は変わらない。

   generate は差し替え可能にしてある（テストでは AI を使わない偽物を渡す）。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var C = VQ2.mockCompiler;

  /* 同時に投げる依頼の数。**既定は 1。**

     もともとは ai.js が「いま走っている 1 件」しか持てず、2 件目は
     モデルへ届く前に BUSY で落ちていた（実測）。2026-08-04 に ai.js を
     2 本まで持てるようにしたので、技術的な制約はもう無い。

     なお速さの面でも、エンジンが並列で回せる数より大きくすると
     全員がエンジン待ちで詰まる（Quick Chat で 10 にしたら 10 人中 7 人が失敗）。

     ■ ai.js は 2 本まで流せるようになった（2026-08-04）。それでもここは 1 のまま。
       実測（node vqparallel.cjs）: 直列 94 秒 / 並列 80 秒 ＝ **1.17 倍**。
       Bridge の枠は 2 つしかないので、1 人が 2 本使うと
       **もう 1 人はこの試験が終わるまで待つ**ことになる。
       15% のために他人を 10 分待たせるのは割に合わない。
       1 人で使うと分かっている場面だけ、呼び出し側から concurrency: 2 を渡すこと。 */
  var DEFAULT_CONCURRENCY = 1;
  /* 空いた枠を埋め直す回数。無限に試さない。 */
  var DEFAULT_MAX_ROUNDS = 2;

  function str(v) { return v === undefined || v === null ? "" : String(v); }
  function isFinite(v) { return typeof v === "number" && v === v && v !== Infinity && v !== -Infinity; }

  /* ══ 依頼文（AI へ渡す指示）══
     何を作るかを 1 問ずつ書き下す。「だいたい 4 問」ではなく
     「この 4 問」を頼むので、多くも少なくもならない。 */
  function promptFor(req, ctx) {
    ctx = ctx || {};
    var lines = [];
    lines.push("次の設問を作ってください。**指定した数だけ**作り、増やさないでください。");
    lines.push("");
    if (ctx.title) lines.push("試験名: " + ctx.title);
    if (ctx.subject) lines.push("科目: " + ctx.subject);
    if (ctx.grade) lines.push("学年: " + ctx.grade);
    lines.push("大問" + req.sectionNumber + (req.sectionTitle ? "「" + req.sectionTitle + "」" : ""));
    lines.push("");
    lines.push("【作る設問（" + req.slots.length + " 問。これ以外は作らないでください）】");
    req.slots.forEach(function (s, i) {
      var bits = ["問" + s.number, typeLabel(s.type), s.points + "点", diffLabel(s.difficulty)];
      if (s.expectedChars) bits.push("解答の目安 " + s.expectedChars + "字");
      lines.push((i + 1) + ") " + bits.join(" / ") + "　id: " + s.id);
    });
    lines.push("");
    lines.push("【1 問ごとに必ず書くこと】");
    lines.push("・問題文");
    lines.push("・正解（選択問題は、どの選択肢が正解かを必ず示す）");
    /* 解説の長さは、生成の速さにそのまま効く。
       実測（node vqoutsize.cjs）: 1 問の出力 446 字のうち **解説が 136 字（31%）**。
       しかも中身の後半は「したがって『…』という命題は誤りであり、正解は『誤っている』である」
       のように、問題文と正解を言い直しているだけだった。
       言い直しは読む人の役に立たないうえ、そのぶん時間がかかる。
       **短くしろ、ではなく「繰り返すな」と言う。**（短くしろだけだと中身まで削られる） */
    lines.push("・解説（なぜその答えになるのか）。**問題文や選択肢を言い直さないでください。**"
      + "「正解は〜です」と書き添えるのも不要です。理由だけを 2 文以内で書いてください。");
    lines.push("・選択問題は選択肢を 2 つ以上（**正誤問題はちょうど 2 つ**）");
    if (ctx.requireSources) lines.push("・根拠にした資料の箇所（分からなければ書かない。**存在しない出典は作らない**）");
    lines.push("どれか 1 つでも書けない設問は、**その設問を作らないでください**。");
    lines.push("配点はこちらで決めています。**点数は書き換えないでください**。");
    lines.push("上に書いた id をそのまま使って返してください。");
    if (ctx.sourceOnly) {
      lines.push("");
      lines.push("教材外の知識は使わないでください。添付した資料だけを根拠にしてください。");
    }
    if (ctx.avoid && ctx.avoid.length) {
      lines.push("");
      lines.push("すでに次の設問を作ってあります。**同じ内容の設問は作らないでください**。");
      ctx.avoid.slice(-20).forEach(function (t, i) { lines.push((i + 1) + ". " + str(t).slice(0, 50)); });
    }
    return lines.join("\n");
  }

  var TYPE_JA = {
    multiple_choice_single: "選択（1つ選ぶ）", multiple_choice_multiple: "複数選択", true_false: "正誤",
    short_answer: "短答", long_answer: "記述", fill_blank: "空欄補充", ordering: "並び替え",
    matching: "組み合わせ", numeric: "数値", formula: "数式", essay: "論述",
    english_writing: "英作文", source_analysis: "資料読解"
  };
  var DIFF_JA = { easy: "易しい", standard: "標準", hard: "難しい" };
  function typeLabel(t) { return TYPE_JA[t] || t; }
  function diffLabel(d) { return DIFF_JA[d] || "標準"; }

  /* 返ってきた設問を枠へ割り当てる。
     ・id が一致すればその枠へ
     ・一致しないものは、まだ空いている枠へ出た順に入れる
     ・枠が尽きたら残りは捨てる（＝作りすぎても試験は膨れない）
     捨てた数は必ず数える。黙って捨てない。 */
  function assign(req, questions, filled, opts) {
    var got = { accepted: 0, rejected: [], over: 0 };
    /* この回で受け入れてよい数の上限（資料の量から決まる）。
       指定が無ければ制限なし。 */
    var allow = opts && isFinite(opts.limit) ? Math.max(0, opts.limit) : Infinity;
    var byId = {};
    (questions || []).forEach(function (q) { if (q && q.id != null) byId[String(q.id)] = q; });

    var leftovers = (questions || []).filter(function (q) {
      return !(q && q.id != null && req.slots.some(function (s) { return s.id === String(q.id); }));
    });
    var li = 0;

    req.slots.forEach(function (slot) {
      if (filled[slot.id]) return;                       /* すでに埋まっている枠は触らない */
      if (got.accepted >= allow) return;                 /* 資料の量で決めた上限まで */
      var q = byId[slot.id] || leftovers[li++] || null;
      if (!q) return;
      var g = C.gate(slot, q, { requireSources: opts.requireSources });
      if (!g.ok) { got.rejected.push({ slotId: slot.id, reasons: g.reasons }); return; }
      filled[slot.id] = q;
      got.accepted++;
    });

    got.over = Math.max(0, leftovers.length - li);
    return got;
  }

  /* 空いている枠だけを集めて、依頼を作り直す。 */
  function pendingRequests(p, filled, batchSize) {
    var all = C.requestsOf(p, { batchSize: batchSize });
    var out = [];
    all.forEach(function (r) {
      var slots = r.slots.filter(function (s) { return !filled[s.id]; });
      if (slots.length) out.push({ id: r.id, sectionNumber: r.sectionNumber, sectionTitle: r.sectionTitle, slots: slots });
    });
    return out;
  }

  /* 同時実行数を守って順に流す。全部終わるまで待つ。 */
  function pool(items, limit, worker) {
    return new Promise(function (resolve) {
      var i = 0, active = 0, out = new Array(items.length), done = 0;
      if (!items.length) return resolve(out);
      function pump() {
        while (active < limit && i < items.length) {
          (function (k) {
            active++; i++;
            Promise.resolve()
              .then(function () { return worker(items[k], k); })
              .then(function (r) { out[k] = { ok: true, value: r }; })
              .catch(function (e) { out[k] = { ok: false, error: e }; })
              .then(function () {
                active--; done++;
                if (done === items.length) resolve(out); else pump();
              });
          })(i);
        }
      }
      pump();
    });
  }

  /* ══ 本体 ══
     opts.generate(request, ctx) -> Promise<{ questions: [...] }>
       questions は mock draft の設問と同じ形（id / question / type / choices /
       answer / explanation / sourceReferences）。 */
  function run(opts) {
    opts = opts || {};
    var p = opts.plan;
    if (!p) return Promise.reject(new Error("plan がありません"));
    if (typeof opts.generate !== "function") return Promise.reject(new Error("generate がありません"));

    var m = new C.Metrics(opts.label || "mock-compile");
    /* すでに受理してある設問。**足りないぶんだけを作り直す**ときに渡す。
       ここに入っている枠は二度と頼まないので、できている設問は変わらない
       （全体を作り直すと、気に入っていた設問まで別物になる）。 */
    var filled = {};
    if (opts.filled && typeof opts.filled === "object")
      Object.keys(opts.filled).forEach(function (k) { if (opts.filled[k]) filled[k] = opts.filled[k]; });
    var rejected = [];
    var errors = [];
    var overTotal = 0;
    var rounds = 0;
    var maxRounds = Math.max(1, Number(opts.maxRounds) || DEFAULT_MAX_ROUNDS);
    var limit = Math.max(1, Number(opts.concurrency) || DEFAULT_CONCURRENCY);
    var batchSize = Number(opts.batchSize) || C.DEFAULT_BATCH;
    var onStage = typeof opts.onStage === "function" ? opts.onStage : function () {};
    var onProgress = typeof opts.onProgress === "function" ? opts.onProgress : function () {};

    /* 資料の量から決まる「この資料で作れる問題数」。
       サーバは 1 問あたり 120 字を目安に見ており、足りなければ
       依頼まるごとを INSUFFICIENT_EVIDENCE で断る（＝その回は 0 問）。
       実測（vqmockdiag2.cjs）: 332 字の資料へ 3 問頼むと、必要 360 字に届かず
       毎回断られていた。断られたら、次からは **1 回の依頼を小さくして** 拾いに行く。
       それでも足りないなら、無理に作らず「この資料ではここまで」と持ち帰る。 */
    var evidence = null;          /* { contentCharacters, requiredCharacters, maxQuestions } */

    m.note({ requested: p.totalQuestions });

    function madeSoFar() {
      return Object.keys(filled).map(function (k) { return str(filled[k].question || filled[k].prompt); });
    }

    /* 「資料が足りない」と断られたときに、資料の量を控えておく。
       サーバは sourceDiagnosis に「読めた字数」と「必要だった字数」を入れて返す。
       1 問あたりの必要字数はそこから割り出せる（必要字数 ÷ 頼んだ問数）。 */
    function noteEvidence(e) {
      var d = e && e.sourceDiagnosis;
      if (!d) return;
      var chars = Number(d.contentCharacters);
      var need = Number(d.requiredCharacters);
      if (!isFinite(chars) || chars < 0) return;
      /* 必要字数が分からないときは、サーバの既定（1 問 120 字）を使う。 */
      var perQ = isFinite(need) && need > 0 && batchSize > 0 ? need / batchSize : 120;
      if (!isFinite(perQ) || perQ <= 0) perQ = 120;
      var max = Math.floor(chars / perQ);
      var prev = evidence;
      evidence = {
        contentCharacters: chars,
        charactersPerQuestion: Math.round(perQ),
        /* この資料から作れる問題数の上限（見込み）。0 なら 1 問も作れない。 */
        maxQuestions: max,
        /* 1 回の依頼で頼んでよい数。0 にはしない（0 だと永久に頼めなくなる）。 */
        maxPerRequest: Math.max(1, Math.min(batchSize, max))
      };
      if (prev && prev.contentCharacters > chars) evidence = prev;
    }

    function round() {
      if (opts.signal && opts.signal.aborted) return Promise.resolve();
      /* 資料の量で決まる上限に達したら、そこで止める。

         **依頼を小さくすれば関門は通せてしまう。**
         サーバの見張りは「1 回の依頼」ごとに字数を見るので、
         3 問ずつ断られても 1 問ずつ頼めば通る。それを続ければ、
         330 字の資料から 30 問を絞り出せてしまう。それは薄い問題を量産するだけで、
         「資料から出題する」という約束を、抜け道で破っていることになる。
         だから、資料全体で作れる数を超えたら **頼むのをやめる**。
         足りないぶんは、足りないと言う。 */
      if (evidence && Object.keys(filled).length >= evidence.maxQuestions) return Promise.resolve();
      var reqs = pendingRequests(p, filled, batchSize);
      if (!reqs.length) return Promise.resolve();
      if (rounds >= maxRounds) return Promise.resolve();
      rounds++;

      var stage = rounds === 1 ? "generate" : "refill";
      m.begin(stage, { round: rounds, requests: reqs.length });
      onStage(stage, { round: rounds, requests: reqs.length, pending: reqs.reduce(function (a, r) { return a + r.slots.length; }, 0) });

      var ctx = {
        title: p.title, subject: p.subject, grade: p.grade,
        sourceOnly: p.sourceMode === "source-only",
        requireSources: p.requireSources,
        avoid: madeSoFar()
      };

      return pool(reqs, limit, function (r) {
        /* 資料の量で決めた上限に達したら、もう頼まない。
           小さく刻めば関門は通せてしまうので、ここで止める（round() と同じ理由）。 */
        if (evidence && Object.keys(filled).length >= evidence.maxQuestions)
          return Promise.resolve({ accepted: 0, rejected: [], over: 0 });
        return Promise.resolve(opts.generate(r, Object.assign({}, ctx, { prompt: promptFor(r, ctx) })))
          .then(function (res) {
            var qs = (res && Array.isArray(res.questions)) ? res.questions : [];
            m.note({ generated: qs.length });
            m.noteUsage(res && res.usage);
            var got = assign(r, qs, filled, {
              requireSources: p.requireSources,
              limit: evidence ? evidence.maxQuestions - Object.keys(filled).length : Infinity
            });
            m.note({ accepted: got.accepted, discarded: got.rejected.length + got.over });
            overTotal += got.over;
            rejected = rejected.concat(got.rejected);
            onProgress({
              sectionNumber: r.sectionNumber, accepted: got.accepted,
              filled: Object.keys(filled).length, total: p.totalQuestions
            });
            return got;
          })
          .catch(function (e) {
            m.note({ failed: 1 });
            /* 1 つの依頼が失敗しても、他の枠は残す。全体を落とさない。
               ただし理由は必ず持ち帰る。握り潰すと「0 問できました」としか分からず、
               原因を探すのに実測からやり直すことになる（実際にそうなった）。 */
            errors.push({
              requestId: r.id, sectionNumber: r.sectionNumber,
              code: str(e && e.message).slice(0, 60),
              message: str((e && e.userMessage) || "").slice(0, 120)
            });
            noteEvidence(e);
            return { accepted: 0, rejected: [], over: 0, error: e };
          });
      }).then(function () {
        m.end(stage, { filled: Object.keys(filled).length });
        if (rounds > 1) m.note({ retried: 1 });
        /* 資料が薄いと分かったら、次の巡は 1 回の依頼を小さくする。
           同じ大きさで投げ直しても、同じ理由で同じだけ断られるだけ。 */
        if (evidence && evidence.maxPerRequest && evidence.maxPerRequest < batchSize) {
          batchSize = evidence.maxPerRequest;
          m.note({ batchShrunk: 1 });
        }
        return round();
      });
    }

    m.begin("total");
    return round().then(function () {
      m.begin("assemble");
      onStage("assemble", {});
      var a = C.assemble(p, filled, { paper: opts.paper, ownerId: opts.ownerId });
      m.end("assemble", { accepted: a.accepted, missing: a.missing.length });

      m.begin("verify");
      onStage("verify", {});
      var issues = C.verify(a.spec, p);
      m.end("verify", { issues: issues.length });
      m.end("total");

      return {
        spec: a.spec,
        plan: p,
        /* 受理した中身そのもの。次に「足りないぶんを作る」とき、これを渡し直す。 */
        filled: filled,
        /* 仕上がった設問の id → 枠の id。1 問だけ作り直すときに使う。 */
        slotOf: a.slotOf || {},
        finalize: a.finalize,
        audit: a.audit,
        accepted: a.accepted,
        planned: p.totalQuestions,
        missing: a.missing,
        /* 受理できなかった理由と、枠を超えて作られた数。どちらも隠さない。 */
        rejected: rejected.concat(a.rejected || []),
        /* 依頼そのものが失敗した理由。空でないなら、中身以前の問題が起きている。 */
        errors: errors,
        /* 資料の量から見た上限。null なら「資料不足では断られていない」。
           ここに値が入っているのに missing があるなら、原因は資料の量であって
           モデルの調子ではない。画面はこれを見て言い方を変える。 */
        evidence: evidence,
        overGenerated: overTotal,
        rounds: rounds,
        issues: (a.issues || []).concat(issues),
        /* verify に high が 1 件でも残るなら「完成」と呼ばない。 */
        complete: !issues.some(function (i) { return i.severity === "high"; }) && !a.missing.length,
        metrics: m.snapshot()
      };
    });
  }

  VQ2.mockCompilerRun = {
    run: run,
    promptFor: promptFor,
    DEFAULT_CONCURRENCY: DEFAULT_CONCURRENCY,
    DEFAULT_MAX_ROUNDS: DEFAULT_MAX_ROUNDS,
    _assign: assign,
    _pendingRequests: pendingRequests,
    _pool: pool
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
