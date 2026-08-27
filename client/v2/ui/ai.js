/* ══════════════════════════════════════════════════════════════════════
   V2 → Orchestrator の唯一の接続口（§32）
   ・UI から Ollama を直接呼ばない。必ず既存の LocalAIProvider（Bridge）を通す。
   ・既存 Provider を差し替えない。window.__vqLocalAI をそのまま利用する。
   ・Activity / 停止 / Job 復元 / AIUsageEvent をここで一元的に扱う。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var S = VQ2.schema, ST = VQ2.store;

  /* 進行中のジョブ。停止と復元のために保持する。 */
  /* ══ いま走っている生成 ══

     以前は `var current` の 1 枠しか無く、2 件目は **モデルへ届く前に**
     BUSY で落としていた。しかし止めていたのはここだけで、
       ・Bridge は maxConcurrentGenerations = 2 まで同時に走らせ、
         あふれたぶんは弾かずに順番待ちへ入れる
       ・LocalAIProvider も _active[] で複数の生成を持てる（停止は全部止める）
     という具合に、下は最初から並列に対応していた。

     試験コンパイラは 3 問ずつ何回も頼むので、ここが 1 件だと
     **1 回ずつ順番に待つ**ことになる。上限を Bridge に合わせる。
     Bridge より大きくしても、あふれたぶんは向こうで並ぶだけなので速くならない。

     ■ ただし **2 本流すのが得とは限らない**（実測・node vqparallel.cjs）
       直列 平均 94 秒 ／ 並列 平均 80 秒 ＝ **1.17 倍**。
       モデルは 1 台のメモリ帯域を分け合うので、2 倍にはならない。
       そのうえ Bridge の枠は 2 つしかないので、1 人が 2 本使うと
       **もう 1 人は生成が終わるまで待たされる**（順番待ちの仕組みがある）。
       15% のために他人を待たせる取り引きなので、
       **試験コンパイラの同時実行数は 1 のまま**にしてある
       （mock-compile-run.js の DEFAULT_CONCURRENCY）。
       ここを 2 にするのは、1 人で使うと分かっている場面だけにすること。 */
  var MAX_CONCURRENT = 2;
  var runs = [];
  function primaryRun() { return runs[0] || null; }
  function dropRun(me) {
    var i = runs.indexOf(me);
    if (i >= 0) runs.splice(i, 1);
    /* 復元用の札は「1 件も走っていない」ときだけ消す。
       2 件走っていて 1 件終わっただけで消すと、残りの復元ができなくなる。 */
    if (!runs.length) clearActiveJob();
  }
  var JOB_KEY = "vq2.activeJob.v1";

  function provider() { return root.__vqLocalAI || null; }

  /* ══════════════════════════════════════════════════════════════════
     A) 資料の読み取り結果（source_digest）の受け取りと再送

     サーバは 1 回目に読み取った資料の要点を `source_digest` として送り、
     次の依頼で `options.sourceDigest` として受け取る口を持っている
     （orchestrator.mjs の 「渡されたものをそのまま返送しない」の箇所）。
     **これまでクライアントに受け口が無く**、大問ごとに同じ資料・同じ画像を
     読み直させていた。ここで受けて、同じ資料の次の依頼へそのまま返す。

     ・鍵は「添付の顔ぶれ」。1 つでも入れ替われば当たらない（＝読み直す）。
     ・古い読み取りを使い回さないよう、時間で切る。
     ・**中身は作らない。** 届いたものをそのまま持つだけ。
     ══════════════════════════════════════════════════════════════════ */
  var DIGEST_CAP = 6;
  var DIGEST_TTL_MS = 30 * 60 * 1000;
  var DIGEST_MAX_CHARS = 20000;
  var digests = [];                       /* [{key, text, files, at}] 新しいものが先頭 */

  /* 読み取り結果を思い出すための鍵。

     **中身から作った札（docFingerprint）があれば、それだけを使う。**
     以前は添付 ID と「文字数・base64 の長さ」で見ていた。これには 2 つ穴があった。
       ・同じ資料を選び直すと添付 ID が変わり、**毎回読み直していた**
         （それでも画面には「読み取り済みの資料をそのまま使いました」と出るので、
           表示と実際の動きが食い違っていた）
       ・長さが同じなだけの別資料に、誤って当たりうる
     札が取れないとき（Bridge が古い・参照経路でない）だけ、従来の作り方へ落ちる。 */
  function digestKey(list, included, docFingerprint) {
    /* 札は **使う資料だけ**から作られている（呼び出し側が included で絞って取る）。
       ここへ添付 ID の並び（included）を足すと、
       同じ資料を選び直したときに ID が変わって、また外れる。
       札があるときは札だけを鍵にする。 */
    if (docFingerprint) return "fp:" + String(docFingerprint);
    var inc = Array.isArray(included) ? included.slice().sort().join(",") : "";
    var a = Array.isArray(list) ? list : [];
    if (!a.length) return "";             /* 添付が無ければ読み取りも無い */
    var ids = a.map(function (x) {
      if (!x) return "-";
      return String(x.id || x.name || "?") + ":" + (x.pageCount || 0)
        + ":" + String(x.extractedText || "").length
        + ":" + String(x.imageBase64 || "").length;
    });
    return ids.join("|") + "#" + inc;
  }
  function recallDigest(key) {
    if (!key) return null;
    for (var i = 0; i < digests.length; i++) {
      if (digests[i].key !== key) continue;
      if (Date.now() - digests[i].at > DIGEST_TTL_MS) { digests.splice(i, 1); return null; }
      return digests[i];
    }
    return null;
  }
  function rememberDigest(key, payload) {
    if (!key || !payload) return null;
    var text = String(payload.text || "").trim();
    if (!text) return null;               /* 空の読み取りを「読んだこと」にしない */
    var rec = { key: key, text: text.slice(0, DIGEST_MAX_CHARS),
                files: Array.isArray(payload.files) ? payload.files : [], at: Date.now() };
    digests = digests.filter(function (d) { return d.key !== key; });
    digests.unshift(rec);
    if (digests.length > DIGEST_CAP) digests = digests.slice(0, DIGEST_CAP);
    return rec;
  }
  /* 資料を差し替えたときに呼ぶ。呼ばなくても鍵が変わるので誤用にはならない。 */
  function forgetSourceDigest() { digests = []; return true; }
  function sourceDigestFor(attachments, included, docFingerprint) {
    var r = recallDigest(digestKey(attachments, included, docFingerprint));
    return r ? { text: r.text, files: r.files, at: r.at } : null;
  }

  /* ══════════════════════════════════════════════════════════════════
     B) 計測の受け皿（window.__vqMetrics）

     速度の検証（vqmockperf.cjs / vqmockfast.cjs）は
     **ここに積まれたものしか見ない**。積まないと stages / roles / tokens /
     retries が空のまま出て、「速くなった」と誤読される。
     サーバが送ってきた metrics をそのまま積む（数字を作らない）。
     ══════════════════════════════════════════════════════════════════ */
  var METRICS_CAP = 300;
  function noteMetrics(task, level, m) {
    if (!m) return null;
    try {
      var box = root.__vqMetrics || (root.__vqMetrics = []);
      var rec = { task: task, uiLevel: level, at: Date.now() };
      for (var k in m) if (Object.prototype.hasOwnProperty.call(m, k)) rec[k] = m[k];
      box.push(rec);
      if (box.length > METRICS_CAP) box.splice(0, box.length - METRICS_CAP);
      return rec;
    } catch (e) { return null; }
  }

  function saveActiveJob(info) {
    try { root.localStorage.setItem(JOB_KEY, JSON.stringify(info)); } catch (e) {}
  }
  function clearActiveJob() {
    try { root.localStorage.removeItem(JOB_KEY); } catch (e) {}
  }
  function readActiveJob() {
    try { var r = root.localStorage.getItem(JOB_KEY); return r ? JSON.parse(r) : null; } catch (e) { return null; }
  }

  /* ── Bridge が使えるか ────────────────────────────────────────── */
  function available() {
    var P = provider();
    if (!P) return Promise.resolve({ ok: false, error: "PROVIDER_MISSING", message: "ローカルAIの接続部品が読み込まれていません。" });
    return P.isAvailable().then(function (r) {
      if (!r.ok) return { ok: false, error: r.error, message: bridgeMessage(r.error) };
      if (!P.isPaired()) return { ok: false, error: "NOT_PAIRED", message: "ローカルAIとの接続（ペアリング）が必要です。" };
      return { ok: true, engine: r.engine };
    }).catch(function () {
      return { ok: false, error: "BRIDGE_UNREACHABLE", message: "ローカルAIに接続できません。Bridge が起動しているか確認してください。" };
    });
  }
  function bridgeMessage(code) {
    if (code === "BRIDGE_UNREACHABLE") return "ローカルAIに接続できません。Bridge が起動しているか確認してください。";
    if (String(code).indexOf("BRIDGE_HTTP_") === 0) return "ローカルAIが応答しません（" + code + "）。";
    return "ローカルAIを利用できません。";
  }

  /* ── どの思考レベルを使うか（§32：Deep を常用しない） ──────────── */
  var LEVEL_FOR = {
    preset_generation:    "normal",
    preset_revision:      "normal",
    preset_tweak:         "fast",      /* 1問だけの軽い書き換え */
    preset_topics:        "normal",    /* 出題する論点の洗い出し（短い出力） */
    mock_blueprint:       "normal",
    mock_generation:      "deep",      /* 複数資料からの試験作成 */
    mock_revision:        "normal",
    ai_grading:           "normal",    /* 1問ずつの Rubric 採点 */
    learning_analysis:    "normal",
    mock_quality_review:  "deep",      /* 試験全体を横断して見る */
    layout_review:        "normal",
    explanation:          "normal",
    review_questions:     "normal"
  };
  function levelFor(task, override) {
    if (override && ["fast", "normal", "deep"].indexOf(override) >= 0) return override;
    return LEVEL_FOR[task] || "normal";
  }

  /* ── 使用量イベントの種別 ────────────────────────────────────── */
  var USAGE_FOR = {
    preset_generation: "preset_generation", preset_revision: "preset_revision", preset_tweak: "preset_revision",
    preset_topics: "preset_generation",
    mock_blueprint: "mock_generation", mock_generation: "mock_generation", mock_revision: "mock_revision",
    ai_grading: "ai_grading", learning_analysis: "result_analysis",
    mock_quality_review: "result_analysis", layout_review: "pdf_visual_review",
    explanation: "chat_message", review_questions: "preset_generation"
  };

  /* ══════════════════════════════════════════════════════════════════
     C) 自動保存と復旧（§47）

     台帳（VQ2.aijob）も下書き置き場（VQ2.store.saveDraft）も**実装済み**なのに、
     本番のどこからも呼ばれていなかった。ここは V2 から Orchestrator への
     唯一の入口（§32）なので、ここで包めば全画面が同じ扱いになる。

     ・生成条件（指示・形式・問題数・使う資料の ID）
     ・解析状態（読み取り済みの資料の要点＝source_digest）
     ・生成済みの問題／足りなかった数と理由／現在の段
     を、進むたびに保存する。**復旧の仕組みは新しく作らない。**

     途中で 1 問失敗しても、できている分は捨てない（§26）。
     捨てないための入れ物は aijob.keepPartial がすでに持っている。
     ══════════════════════════════════════════════════════════════════ */
  var JOB_TYPE_FOR = {
    preset_generation: "preset_generation", preset_revision: "preset_repair",
    preset_tweak: "preset_repair", preset_topics: "preset_generation",
    mock_blueprint: "mock_blueprint", mock_generation: "mock_question_generation",
    mock_revision: "mock_question_generation", mock_quality_review: "mock_validation",
    layout_review: "mock_layout", ai_grading: "essay_evaluation",
    learning_analysis: "other", explanation: "other", review_questions: "preset_generation"
  };
  var RESUME_MSG_CHARS = 8000;     /* 指示文。修正依頼はプリセット全文を積むので切る */
  var RESUME_JSON_CHARS = 300000;  /* できた問題。これを超えたら保存しない（嘘をつかない） */
  var PERSIST_MIN_MS = 1200;       /* 段が進むたびの保存の間隔 */

  /* 構造化出力から設問を取り出す（プリセットは questions、試験は sections[].questions）。 */
  function structuredQuestions(s) {
    var d = s && (s.questions || s.sections) ? s : (s && s.data ? s.data : null);
    if (!d) return [];
    if (Array.isArray(d.questions)) return d.questions;
    if (Array.isArray(d.sections)) {
      return d.sections.reduce(function (a, sec) {
        return a.concat(Array.isArray(sec && sec.questions) ? sec.questions : []);
      }, []);
    }
    return [];
  }
  /* 台帳へ置く「できた分」は軽い印だけにする。中身は下書き側にある。
     friendly() が数を読むので、questions の**件数**は正しく保つ。 */
  function partialMark(qs, draftKey) {
    return {
      count: qs.length,
      questions: qs.map(function (q, i) {
        return { id: (q && q.id != null) ? String(q.id) : String(i + 1),
                 number: q && q.questionNumber != null ? q.questionNumber : (i + 1) };
      }),
      resumeKey: draftKey || null
    };
  }

  /* ══════════════════════════════════════════════════════════════════
     実行
     opts:
       task            — 上記のキー
       message         — 指示文
       attachments     — Quick Chat と同じ添付形式
       level           — "fast"|"normal"|"deep"（省略時は task から決める）
       structuredOutput— "preset" | "mock"
       workspaceTask   — "ai_grading" 等（payload と併用）
       payload         — workspaceTask への入力
       sourceOnly      — 資料限定モード
       onActivity(ev)  — 進捗
       onToken(text)   — 本文の逐次表示
       onStructured(o) — 構造化結果
       onWarning(msg)  — 警告
     ══════════════════════════════════════════════════════════════════ */
  function run(opts) {
    opts = opts || {};
    var P = provider();
    if (!P) return Promise.reject(new Error("PROVIDER_MISSING"));
    if (runs.length >= MAX_CONCURRENT) return Promise.reject(new Error("BUSY"));

    var task = opts.task || "explanation";
    var level = levelFor(task, opts.level);
    var startedAt = new Date().toISOString();
    var t0 = Date.now();

    var acc = { text: "", structured: null, meta: null, usage: null, warnings: [], jobId: "", choice: null, error: null };
    var activities = [];

    var req = {
      requestId: S.newId("req"),
      conversationId: opts.conversationId || S.newId("conv"),
      messageId: S.newId("msg"),
      message: String(opts.message || ""),
      modelId: "standard",
      thinkingLevel: level,
      attachments: Array.isArray(opts.attachments) ? opts.attachments : [],
      conversationContext: Array.isArray(opts.conversationContext) ? opts.conversationContext : [],
      options: {
        sourceOnly: opts.sourceOnly === true,
        requireCitations: opts.requireCitations !== false,
        language: "ja",
        allowExternalKnowledge: opts.sourceOnly !== true
      }
    };
    if (opts.structuredOutput) req.options.structuredOutput = opts.structuredOutput;
    if (opts.workspaceTask) {
      req.options.workspaceTask = opts.workspaceTask;
      req.options.payload = opts.payload || {};
    }
    if (opts.questionCount) req.options.questionCount = opts.questionCount;
    /* 大問をいくつ作るか。伝えないと Bridge 側では 0（＝制限なし）になり、
       1 大問ぶんを頼んだつもりでも 12 大問 36 問返ってくる（実測: 42 問頼んで 256 問）。 */
    if (opts.sectionCount) req.options.sectionCount = opts.sectionCount;
    if (opts.scoreAuthority) req.options.scoreAuthority = opts.scoreAuthority;
    if (Array.isArray(opts.questionTypes) && opts.questionTypes.length)
      req.options.questionTypes = opts.questionTypes.slice(0, 60);
    /* 出題する論点をこちらで決めているときは、資料の要点のまとめ直しを省く */
    if (opts.skipDocumentAnalysis) req.options.skipDocumentAnalysis = true;
    /* Phase 13 §1: 使う資料を ID で限定する。除外した資料は chunk も作られない。
       自然文の「○○はいらない」だけに頼ると、そのファイル名が検索クエリの語になり
       **逆に順位が上がる**（実測）。ID で渡すのが唯一の確実な経路。 */
    if (Array.isArray(opts.includedAttachmentIds))
      req.options.includedAttachmentIds = opts.includedAttachmentIds.slice(0, 64);
    /* Phase 13 §2: 資料検索に使う語。指示文とは別に渡す。
       指示文全文で検索すると、満点・問題数・JSON・選択肢といった試験メタ語彙が
       BM25 を支配し、資料の体裁部分が上位 Evidence になる。 */
    if (opts.retrievalQuery) req.options.retrievalQuery = String(opts.retrievalQuery).slice(0, 2000);
    /* Phase 13 §4: 資料から出題できる内容が取れないときは生成させない。 */
    if (opts.requireEvidence) req.options.requireEvidence = true;
    /* 資料を 1 件も使わず、指示だけで作る。資料があるときはサーバ側で無視される。
       この経路では出典が付かない（付いているふりもしない）。 */
    if (opts.promptOnly) req.options.promptOnly = true;
    /* 生成中に届いた追加指示。本文へ折り込むだけでなく、構造化して渡す。
       サーバ側（Bridge）で空文字・長すぎ・同一指示の二重送信を弾くため。
       ここで渡さないと、その検査がクライアントだけになる。 */
    if (Array.isArray(opts.followups) && opts.followups.length) {
      req.options.followups = opts.followups.slice(0, 20).map(function (f) {
        return { id: String(f.id || ""), seq: Number(f.seq) || 0, text: String(f.text || "").slice(0, 500) };
      });
      /* どの生成に対する追加指示か。Bridge 側で自分の Job かを確かめる。 */
      if (opts.followupJobId) req.options.followupJobId = String(opts.followupJobId).slice(0, 80);
    }
    if (opts.taskHint) req.taskHint = opts.taskHint;

    /* ── A) 読み取り済みの資料があれば、読み直させずにそのまま返す ── */
    var dkey = digestKey(req.attachments, opts.includedAttachmentIds, opts.docFingerprint);
    var reuse = null;
    /* 呼び出し側が渡してきた読み取り結果。文字列でもオブジェクトでも受ける。
       それ以外（配列・数値など）は黙って文字列化せず、無かったことにする
       （"[object Object]" を資料の要点として送ってしまわないため）。 */
    if (typeof opts.sourceDigest === "string" && opts.sourceDigest.trim()) {
      reuse = { text: opts.sourceDigest, files: [] };
    } else if (opts.sourceDigest && typeof opts.sourceDigest.text === "string") {
      reuse = { text: opts.sourceDigest.text, files: [] };
    }
    else if (opts.reuseSourceDigest !== false) reuse = recallDigest(dkey);
    var sentDigest = reuse && String(reuse.text || "").trim() ? String(reuse.text).slice(0, DIGEST_MAX_CHARS) : "";
    if (sentDigest) req.options.sourceDigest = sentDigest;

    var me = { task: task, cancelled: false, startedAt: startedAt, jobId: "" };
    runs.push(me);

    /* ── C) この 1 回を台帳の 1 件として持つ ── */
    var L = beginLedger();

    return P.streamMessage(req, function (ev, j) {
      if (ev === "meta" && j.jobId) {
        acc.jobId = j.jobId;
        me.jobId = j.jobId;
        /* 復元用の札は先頭の 1 件だけ。2 件目で上書きすると、
           リロード後に戻ってくる Job が入れ替わる。 */
        if (primaryRun() === me)
          saveActiveJob({ jobId: j.jobId, task: task, startedAt: startedAt, level: level });
      }
      if (ev === "activity") {
        /* 同じ種類の running は更新する（running → completed で行を増やさない） */
        var prev = null;
        for (var i = activities.length - 1; i >= 0; i--)
          if (activities[i].type === j.type && activities[i].status === "running") { prev = activities[i]; break; }
        if (prev) { prev.label = j.label; prev.status = j.status; prev.detail = j.detail || prev.detail;
                    if (j.current != null) prev.current = j.current; if (j.total != null) prev.total = j.total; }
        else activities.push({ type: j.type, label: j.label, status: j.status, detail: j.detail || "",
                               current: j.current, total: j.total, at: Date.now() });
        if (L) L.activity(j, !prev);
        if (opts.onActivity) { try { opts.onActivity(activities.slice(), j); } catch (e) {} }
      }
      if (ev === "token" && j.text) {
        acc.text += j.text;
        if (opts.onToken) { try { opts.onToken(j.text, acc.text); } catch (e) {} }
      }
      if (ev === "structured") {
        acc.structured = j;
        /* できた問題はここで残す。このあと失敗しても捨てない（§26）。 */
        if (L) L.structured(j);
        if (opts.onStructured) { try { opts.onStructured(j); } catch (e) {} }
      }
      /* A) 資料の読み取り結果。次の依頼でそのまま送り返し、読み直させない。 */
      if (ev === "source_digest") {
        acc.sourceDigest = { text: String(j.text || ""), files: Array.isArray(j.files) ? j.files : [] };
        rememberDigest(dkey, acc.sourceDigest);
        if (L) L.persist(true);
        if (opts.onSourceDigest) { try { opts.onSourceDigest(acc.sourceDigest); } catch (e) {} }
        return;
      }
      if (ev === "warning" && j.message) {
        acc.warnings.push(j.message);
        if (opts.onWarning) { try { opts.onWarning(j.message); } catch (e) {} }
      }
      /* 生存確認。長い 1 回の処理中に接続が切れないようにするためのもの。
         **進捗には数えない**（activities へ入れない・問題数を動かさない）。 */
      if (ev === "heartbeat") {
        acc.lastHeartbeatAt = Date.now();
        acc.heartbeatPhase = j.phase || null;
        acc.heartbeatSeq = j.seq || 0;
        if (opts.onHeartbeat) { try { opts.onHeartbeat(j); } catch (e) {} }
        return;
      }
      /* 頼んだ数に届かなかったとき。警告文とは別に、数と理由をそのまま受ける。 */
      if (ev === "shortfall") {
        acc.shortfall = j;
        if (L) L.persist(true);
        if (opts.onShortfall) { try { opts.onShortfall(j); } catch (e) {} }
        return;
      }
      if (ev === "answer_meta") acc.meta = j;
      if (ev === "usage") acc.usage = j;
      if (ev === "choice") acc.choice = j;
      if (ev === "error") acc.error = j;
      /* Phase 13 §10: 完成にしてよいかの材料。呼び出し側が数で判定する。 */
      if (ev === "metrics") {
        acc.metrics = j;
        /* B) 計測の受け皿へ積む。ここで積まないと検証スクリプトは空を見る。 */
        noteMetrics(task, level, j);
        /* 資料を何ページ読み、何字取れ、根拠が何件できたか。
           画面はこれを Bash カードの OUT にそのまま出す。 */
        if (opts.onMetrics) { try { opts.onMetrics(j); } catch (e) {} }
        acc.qualityGate = j.qualityGate || null;
        acc.evidenceAudit = j.evidenceAudit || null;
        acc.sourcePlan = j.sourcePlan || null;
      }
    }).then(function () {
      /* 閉じ忘れた running を必ず閉じる。1件でも残ると UI が処理中のまま止まる。 */
      activities.forEach(function (a) { if (a.status === "running") a.status = "completed"; });
      if (opts.onActivity) { try { opts.onActivity(activities.slice(), null); } catch (e) {} }
      finishUsage();
      dropRun(me);
      if (acc.error) {
        if (L) L.fail({ code: acc.error.code || "AI_ERROR", message: acc.error.message || "" });
        var e = new Error(acc.error.code || "AI_ERROR");
        /* 呼び出し側が理由で分岐できるように code を残す（INSUFFICIENT_EVIDENCE 等） */
        e.code = acc.error.code || "AI_ERROR";
        e.userMessage = acc.error.message || "処理に失敗しました。";
        e.detail = acc.error.detail || "";
        /* 資料が使えなかったときの理由（7 種のどれか）。画面が文面と導線を変える。 */
        e.sourceDiagnosis = acc.error.sourceDiagnosis || null;
        throw e;
      }
      if (L) L.finish();
      return {
        text: acc.text, structured: acc.structured, meta: acc.meta,
        shortfall: acc.shortfall || null,
        /* A) この回で読み取られた資料の要点。次の依頼へそのまま渡せる。
           使い回した回では reused: true（読み直していない印）。 */
        sourceDigest: acc.sourceDigest || (sentDigest ? { text: sentDigest, files: [], reused: true } : null),
        sourceDigestReused: !!sentDigest,
        /* C) この生成の台帳 ID。続きから再開するときの手がかり。 */
        jobRecordId: L ? L.id : null,
        usage: acc.usage, warnings: acc.warnings, activities: activities,
        choice: acc.choice, jobId: acc.jobId, level: level, durationMs: Date.now() - t0,
        qualityGate: acc.qualityGate || null,
        evidenceAudit: acc.evidenceAudit || null,
        sourcePlan: acc.sourcePlan || null,
        /* 作り直し・設問ごとの検証理由・ID 付け直しまで含む計測一式 */
        metrics: acc.metrics || null
      };
    }).catch(function (e) {
      activities.forEach(function (a) { if (a.status === "running") a.status = "failed"; });
      if (opts.onActivity) { try { opts.onActivity(activities.slice(), null); } catch (e2) {} }
      var cancelled = me.cancelled;
      finishUsage(cancelled ? "cancelled" : "failed", cancelled);
      dropRun(me);
      if (cancelled) {
        if (L) L.cancel();
        var c = new Error("CANCELLED"); c.cancelled = true; throw c;
      }
      if (L) L.fail(e);
      if (!e.userMessage) e.userMessage = describeError(e);
      throw e;
    });

    /* ══ C) 台帳と自動保存 ══
       ここで作るのは「繋ぎ」だけ。状態も復旧も aijob / store が持っている。 */
    function beginLedger() {
      var J = VQ2.aijob;
      if (!J || opts.track === false) return null;
      var id = null;
      try {
        var r = J.start({
          jobType: JOB_TYPE_FOR[task] || "other",
          title: opts.jobTitle || J.typeLabel(JOB_TYPE_FOR[task] || "other"),
          startKey: opts.startKey || null
        });
        id = r.job.id;
        J.running(id, {});
      } catch (e) { return null; }

      var lastSave = 0, curStep = "", madeQs = [], bridgeNoted = false;

      function condition() {
        var m = String(req.message || "");
        var o = req.options || {};
        return {
          message: m.slice(0, RESUME_MSG_CHARS),
          messageTruncated: m.length > RESUME_MSG_CHARS,
          taskHint: req.taskHint || null,
          structuredOutput: o.structuredOutput || null,
          workspaceTask: o.workspaceTask || null,
          sourceOnly: !!o.sourceOnly, promptOnly: !!o.promptOnly,
          requireEvidence: !!o.requireEvidence,
          skipDocumentAnalysis: !!o.skipDocumentAnalysis,
          questionCount: o.questionCount || 0, sectionCount: o.sectionCount || 0,
          questionTypes: Array.isArray(o.questionTypes) ? o.questionTypes.slice(0, 60) : null,
          includedAttachmentIds: o.includedAttachmentIds || null,
          retrievalQuery: o.retrievalQuery || null,
          scoreAuthority: o.scoreAuthority || null
        };
      }
      /* 添付そのものは保存しない（画像で保存領域を潰す）。
         「どれを使っていたか」だけ残し、選び直しが要ることを正直に書く。 */
      function attachRefs() {
        return (req.attachments || []).map(function (a) {
          return { id: a && a.id ? String(a.id) : "", name: a && a.name ? String(a.name) : "",
                   kind: a && a.kind ? String(a.kind) : "", pageCount: (a && a.pageCount) || 0 };
        });
      }
      function madePayload() {
        if (!acc.structured) return null;
        var s;
        try { s = JSON.stringify(acc.structured); } catch (e) { return null; }
        if (s.length > RESUME_JSON_CHARS) return null;   /* 入らないものを入ったことにしない */
        return acc.structured;
      }
      function snapshot() {
        return {
          task: task, level: level, startedAt: startedAt, bridgeJobId: acc.jobId || "",
          condition: condition(),
          attachments: attachRefs(),
          attachmentsNeedReselect: (req.attachments || []).length > 0,
          /* 解析状態：読み取り済みの資料の要点。あればここから再開できる。 */
          sourceDigest: acc.sourceDigest || (sentDigest ? { text: sentDigest, files: [], reused: true } : null),
          step: curStep || null,
          steps: activities.map(function (a) { return { type: a.type, status: a.status, label: a.label }; }),
          /* 生成済みの問題（そのまま復元できる形で持つ）。 */
          made: madePayload(),
          madeCount: madeQs.length,
          madeTruncated: !!(acc.structured && !madePayload()),
          /* 失敗した分：足りなかった数と理由・止まった理由。 */
          shortfall: acc.shortfall || null,
          error: acc.error ? { code: acc.error.code || "", message: acc.error.message || "" } : null,
          warnings: (acc.warnings || []).slice(0, 20),
          text: String(acc.text || "").slice(0, 2000),
          savedBy: "VQ2.ai.run"
        };
      }
      function persist(force) {
        var now = Date.now();
        if (!force && now - lastSave < PERSIST_MIN_MS) return false;
        lastSave = now;
        try { J.saveResume(id, snapshot()); } catch (e) {}
        return true;
      }

      return {
        id: id,
        activity: function (j, isNew) {
          try {
            var counts = (j && j.total > 0 && j.current != null)
              ? { done: j.current, total: j.total } : null;
            if (isNew || counts) {
              if (isNew) curStep = String(j.type || curStep);
              J.step(id, isNew ? String(j.type || "") : null, counts ? { counts: counts } : {});
            }
            /* Bridge 側の Job 番号は 1 度だけ書く（毎回書くと保存が増えるだけ）。 */
            if (acc.jobId && !bridgeNoted) { bridgeNoted = true; J.step(id, null, { bridgeJobId: acc.jobId }); }
          } catch (e) {}
          persist(false);
        },
        structured: function () {
          madeQs = structuredQuestions(acc.structured);
          try { J.keepPartial(id, partialMark(madeQs, VQ2.aijob.RESUME_KIND + ":" + id)); } catch (e) {}
          persist(true);
        },
        persist: persist,
        finish: function () {
          persist(true);
          try {
            J.done(id, {
              counts: madeQs.length ? { done: madeQs.length, total: opts.questionCount || madeQs.length } : null,
              partial: madeQs.length ? partialMark(madeQs, null) : undefined
            });
          } catch (e) {}
        },
        fail: function (err) {
          persist(true);
          try {
            J.fail(id, err, { code: (err && err.code) || "", message: (err && err.message) || "" });
          } catch (e) {}
        },
        cancel: function () {
          persist(true);
          /* aijob.cancel は VQ2.ai.cancel を呼び返すが、ここではもう止まっている。 */
          try { J.cancel(id); } catch (e) {}
        }
      };
    }

    function finishUsage(status, cancelled) {
      try {
        ST.recordUsage({
          eventType: USAGE_FOR[task] || "chat_message",
          mode: level,
          startedAt: startedAt,
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - t0,
          inputBytes: req.message.length + JSON.stringify(req.attachments || []).length,
          pageCount: countPages(req.attachments),
          imageCount: (req.attachments || []).filter(function (a) { return a.kind === "image"; }).length,
          questionCount: opts.questionCount || 0,
          modelCalls: acc.usage && acc.usage.modelCalls ? acc.usage.modelCalls : 0,
          compileAttempts: opts.compileAttempts || 0,
          status: status || "completed",
          cancelled: cancelled === true
        });
      } catch (e) {}
    }
  }

  function countPages(attachments) {
    return (attachments || []).reduce(function (a, x) { return a + (x.pageCount || 0); }, 0);
  }

  function describeError(e) {
    var m = String((e && e.message) || "");
    if (m.indexOf("BRIDGE_429") >= 0) return "ローカルAIが別の処理を実行中です。完了を待つか、停止してからもう一度お試しください。";
    if (m.indexOf("BRIDGE_") === 0) return "ローカルAIとの通信に失敗しました（" + m + "）。";
    if (m === "PROVIDER_MISSING") return "ローカルAIの接続部品が読み込まれていません。";
    if (m === "BUSY") return "別の処理が実行中です。";
    return "処理に失敗しました。";
  }

  /* ── 停止（Job 全体を止める。生成中の 1 呼び出しだけではない） ── */
  function cancel() {
    if (!runs.length) return false;
    /* **走っているものは全部止める。** 1 本だけ残ると、画面は止まったのに
       裏で動き続ける。Provider の cancelGeneration も全部を止める作り。 */
    runs.forEach(function (r) { r.cancelled = true; });
    var P = provider();
    if (P) { try { P.cancelGeneration(); } catch (e) {} }
    return true;
  }
  function isRunning() { return runs.length > 0; }
  function runningCount() { return runs.length; }
  function runningTask() { var p = primaryRun(); return p ? p.task : null; }
  /* いま動いている Job の ID。追加指示をどの生成へ紐付けるかに使う。 */
  function currentJobId() {
    var p = primaryRun();
    if (p && p.jobId) return p.jobId;
    var info = readActiveJob();
    return (info && info.jobId) || "";
  }

  /* ── リロード後の Job 復元（§33 / §47）
        存在しなければ null を返す。永遠に「処理中」にしない。

        起動時にここを通るので（entry.js の restoreJob）、
        **画面を離れている間に止まった仕事**もここで正直な状態へ直す。
        直したうえで「続きから再開できる仕事」を返す。 ── */
  function resumable() {
    /* 動いていないのに「実行中」で残っている仕事を、失敗として扱い直す。
       できている分は aijob 側が捨てずに持っている。 */
    var interrupted = 0;
    try { if (VQ2.aijob && VQ2.aijob.reconcile) interrupted = VQ2.aijob.reconcile(); } catch (e) {}
    var list = [];
    try { if (VQ2.aijob && VQ2.aijob.resumeEntries) list = VQ2.aijob.resumeEntries(); } catch (e) {}
    return { interrupted: interrupted, entries: list };
  }

  function restore() {
    var res = resumable();
    var info = readActiveJob();
    if (!info || !info.jobId) {
      return Promise.resolve(res.entries.length ? { finished: true, job: null, info: null, resumable: res } : null);
    }
    var P = provider();
    if (!P) { clearActiveJob(); return Promise.resolve(null); }
    return P.getJob(info.jobId).then(function (job) {
      if (!job) {
        clearActiveJob();
        return res.entries.length ? { finished: true, job: null, info: info, resumable: res } : null;
      }
      var done = ["completed", "failed", "cancelled"].indexOf(job.status) >= 0;
      if (done) { clearActiveJob(); return { finished: true, job: job, info: info, resumable: res }; }
      return { finished: false, job: job, info: info, resumable: res };
    }).catch(function () { clearActiveJob(); return null; });
  }

  /* ── 続きから作り直す ──────────────────────────────────────────
     保存しておいた生成条件でもう一度頼む。
     ・**すでにできている問題は捨てない。** 呼び出し側へそのまま返す。
     ・読み取り済みの資料の要点があれば送り、資料を読み直させない。
     ・添付そのものは保存していないので、要るときは呼び出し側が渡す
       （渡せないなら resume は「資料の選び直しが要る」と正直に返す）。 */
  function resume(jobRecordId, o) {
    o = o || {};
    var J = VQ2.aijob;
    if (!J) return Promise.reject(new Error("NO_LEDGER"));
    var job = J.get(jobRecordId);
    var saved = J.loadResume(jobRecordId);
    if (!job || !saved) return Promise.reject(new Error("NO_RESUME"));
    if (saved.attachmentsNeedReselect && !(o.attachments && o.attachments.length)) {
      var e = new Error("ATTACHMENTS_REQUIRED");
      e.code = "ATTACHMENTS_REQUIRED";
      e.userMessage = "前回使った資料をもう一度選んでください。作れていた分はそのまま残っています。";
      e.made = saved.made || null;
      e.resume = saved;
      return Promise.reject(e);
    }
    var c = saved.condition || {};
    return run({
      task: saved.task || "explanation",
      level: o.level || saved.level,
      message: c.message || "",
      attachments: o.attachments || [],
      taskHint: c.taskHint || undefined,
      structuredOutput: c.structuredOutput || undefined,
      workspaceTask: c.workspaceTask || undefined,
      payload: o.payload,
      sourceOnly: c.sourceOnly, promptOnly: c.promptOnly,
      requireEvidence: c.requireEvidence, skipDocumentAnalysis: c.skipDocumentAnalysis,
      questionCount: o.questionCount || c.questionCount,
      sectionCount: c.sectionCount, questionTypes: c.questionTypes,
      includedAttachmentIds: c.includedAttachmentIds, retrievalQuery: c.retrievalQuery,
      scoreAuthority: c.scoreAuthority,
      /* 解析状態を持って戻る。同じ資料をもう一度読ませない。 */
      sourceDigest: saved.sourceDigest && saved.sourceDigest.text ? saved.sourceDigest : undefined,
      onActivity: o.onActivity, onToken: o.onToken, onStructured: o.onStructured,
      onWarning: o.onWarning, onMetrics: o.onMetrics
    }).then(function (res) {
      /* 前回できていた分を必ず添えて返す（捨てない）。 */
      res.resumedFrom = { jobRecordId: jobRecordId, made: saved.made || null,
                          madeCount: saved.madeCount || 0, step: saved.step || null };
      return res;
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     用途別の入口（呼び出し側が Orchestrator の細部を知らずに済むように）
     ══════════════════════════════════════════════════════════════════ */

  /* プリセットの新規生成 */
  function generatePreset(o) {
    return run({
      task: "preset_generation", message: o.instruction, attachments: o.attachments,
      structuredOutput: "preset", taskHint: "preset_generation",
      sourceOnly: o.sourceOnly, level: o.level, questionCount: o.count,
      /* この回で作ってよい形式。**渡さないと 100 種類から自由に選ばれる。**
         配分で「○×だけ」と決めても、文章で頼むだけでは守られない（実測）。 */
      questionTypes: o.questionTypes,
      skipDocumentAnalysis: o.skipDocumentAnalysis,
      followups: o.followups, followupJobId: o.followupJobId || currentJobId(),
      /* A) 読み取り済みの資料の要点。渡されなければ同じ添付の前回ぶんを自動で使う。 */
      sourceDigest: o.sourceDigest, onSourceDigest: o.onSourceDigest,
      onActivity: o.onActivity, onToken: o.onToken, onStructured: o.onStructured, onWarning: o.onWarning, onMetrics: o.onMetrics
    });
  }

  /* 添付がすべて「文字として読めている」か。
     1 件でも画像・スキャンが混ざっていたら、読み取りの段階を飛ばしてはいけない。 */
  function allTextReady(list) {
    var a = Array.isArray(list) ? list : [];
    if (!a.length) return true;
    return a.every(function (x) {
      if (!x) return true;
      if (x.imageBase64) return false;                 /* 画像そのもの */
      if (x.kind === "image") return false;
      if (x.imageOnlyPageCount > 0) return false;      /* 文字の無いページを含む */
      if (x.unreadablePages > 0) return false;
      return !!String(x.extractedText || "").trim();   /* 文字が取れている */
    });
  }

  /* ── 出題する論点を先に洗い出す ────────────────────────────────
     毎回「資料を見て、いい感じに作って」と丸投げすると、同じ論点へ戻ってきて
     重複が増える（実測で 9 回中 6 回が 1 問しか取れなかった）。
     先に論点を並べておけば、回ごとに別の論点を指定できる。
     出力が短いので安く済み、資料の読み取りもここで 1 回で終わる。 */
  /* 添付の中に「読ませるもの」が 1 つでもあるか。
     文字も画像も無ければ、モデルへ渡すものが何も無い。 */
  function hasReadable(list) {
    return (Array.isArray(list) ? list : []).some(function (x) {
      if (!x) return false;
      if (String(x.extractedText || "").trim()) return true;
      if (x.imageBase64) return true;
      if (x.imageOnlyPageCount > 0) return true;
      return false;
    });
  }

  function planTopics(o) {
    var n = Math.max(4, Math.min(60, (o.count || 10) + 6));
    /* **中身の無い資料から論点を聞かない。**
       聞けばモデルは何か書く。実測（2026-08-04）: 文字も画像も無い添付を渡したら
       3 秒で「中国の経済成長率の目安」など、資料と関係のない論点が 16 個返った。
       資料限定なのに作り話を土台にすると、そのまま問題まで作り話になる。
       ここで止めて、読み取りに失敗したことを伝える。 */
    if (o.sourceOnly && (o.attachments || []).length && !hasReadable(o.attachments)) {
      var e0 = new Error("SOURCE_UNREADABLE");
      e0.code = "SOURCE_UNREADABLE";
      e0.userMessage = "資料から文字も画像も読み取れませんでした。"
        + "読み取れる資料に差し替えるか、「資料だけを根拠にする」を外してください。";
      return Promise.reject(e0);
    }
    var msg = [
      "添付した資料をもとに、テストで問える論点を " + n + " 個あげてください。",
      "",
      "【条件】",
      "・1 行に 1 つ、「- 」で始めてください。説明や前置きは書かないでください。",
      "・1 つ 40 字以内。何を問うのかが分かるように書いてください。",
      "・**同じことを言い換えただけの項目を入れないでください**。それぞれ別の内容にしてください。",
      "・資料に書かれていることだけをあげてください。",
      "・**問題文や選択肢は書かないでください**。論点の名前だけを並べてください。",
      "・表・見出し・前置き・まとめは書かないでください。",
      o.instruction ? "\n【利用者の指示】\n" + o.instruction : ""
    ].join("\n");
    return run({
      task: "preset_topics", message: msg, attachments: o.attachments,
      /* taskHint を明示しないと「問題を作って」と読まれて構造化生成へ回り、
         論点ではなく問題と集計表が返ってくる（実際にそうなっていた）。
         ここは資料を読んで短い一覧を出すだけなので要約の経路へ固定する。 */
      taskHint: "summarization",
      sourceOnly: o.sourceOnly, level: "normal", requireCitations: false,
      /* 資料の読み取りを飛ばしてよいのは、**文字がすでに取れている資料だけ**。
         画像やスキャンのページは、この「読み取り」の段階でしか中身が入らない。
         飛ばすと、モデルは中身を見ないまま論点を書く＝**作り話になる**。
         実測（2026-08-04）: 画像 1 枚を付けて飛ばしたところ、4 秒で
         「ミュージックビデオの制作に使われた技術」など、資料と無関係な論点が
         16 個返ってきた。中身が無いのに、あるかのように答えてしまう。 */
      skipDocumentAnalysis: allTextReady(o.attachments),
      /* A) 読み取り済みの資料の要点。渡されなければ同じ添付の前回ぶんを自動で使う。
         docFingerprint は「同じ資料かどうか」を **中身で**見分けるための札。 */
      sourceDigest: o.sourceDigest, onSourceDigest: o.onSourceDigest,
      docFingerprint: o.docFingerprint,
      onActivity: o.onActivity, onWarning: o.onWarning, onMetrics: o.onMetrics
    });
  }

  /* 返ってきた行から論点だけを取り出す（判定はドメイン層。テストで固定してある） */
  function parseTopics(text) { return VQ2.draft.parseTopics(text); }

  /* プリセットの部分修正。既存の問題を渡し、指定した箇所だけ直させる。 */
  function revisePreset(o) {
    var scope = o.questionIds && o.questionIds.length
      ? "対象の問題: " + o.questionIds.join(", ")
      : "対象: プリセット全体";
    var msg = [
      "次のプリセットを修正してください。",
      scope,
      "",
      "【修正の指示】",
      o.instruction,
      "",
      "【現在のプリセット】",
      JSON.stringify(o.presetForAi, null, 1).slice(0, 60000)
    ].join("\n");
    return run({
      task: o.questionIds && o.questionIds.length === 1 ? "preset_tweak" : "preset_revision",
      message: msg, attachments: o.attachments,
      structuredOutput: "preset", taskHint: "preset_revision",
      sourceOnly: o.sourceOnly, level: o.level,
      followups: o.followups, followupJobId: o.followupJobId || currentJobId(),
      onActivity: o.onActivity, onToken: o.onToken, onStructured: o.onStructured, onWarning: o.onWarning, onMetrics: o.onMetrics
    });
  }

  /* 検証エラーの修復。
     ・直す対象と、触ってよいフィールドを指示にもデータにも書く。
     ・プリセット全体を作り直させない。返ってきたものは repair.js が
       もう一度ふるいにかけ、許した範囲だけを差分にする。 */
  function repairPreset(o) {
    var msg = [
      "次のプリセットの検証エラーを直してください。",
      "",
      o.instruction,
      "",
      "【返し方】",
      "・直した問題だけを返してください。直していない問題は返さないでください。",
      "・受け取った id をそのまま付けて返してください。",
      "",
      "【直す対象の問題】",
      JSON.stringify(o.presetForAi, null, 1).slice(0, 60000)
    ].join("\n");
    return run({
      task: (o.questionIds && o.questionIds.length === 1) ? "preset_tweak" : "preset_revision",
      message: msg, attachments: o.attachments,
      structuredOutput: "preset", taskHint: "preset_revision",
      sourceOnly: o.sourceOnly, level: o.level,
      onActivity: o.onActivity, onToken: o.onToken, onStructured: o.onStructured, onWarning: o.onWarning, onMetrics: o.onMetrics
    });
  }

  /* 不足問題の補充。既存には触らせず、足りない数だけ作らせる。 */
  function backfillPreset(o) {
    var msg = [
      o.instruction,
      "",
      "【返し方】",
      "・新しく作った問題だけを返してください。",
      "・すでにある問題は返さないでください。",
      "・id は付けなくてかまいません（こちらで新しく発行します）。"
    ].join("\n");
    return run({
      task: "preset_generation", message: msg, attachments: o.attachments,
      structuredOutput: "preset", taskHint: "preset_generation",
      sourceOnly: o.sourceOnly, level: o.level,
      includedAttachmentIds: o.includedAttachmentIds,
      retrievalQuery: o.retrievalQuery,
      /* A) 読み取り済みの資料の要点。渡されなければ同じ添付の前回ぶんを自動で使う。 */
      sourceDigest: o.sourceDigest, onSourceDigest: o.onSourceDigest,
      onActivity: o.onActivity, onToken: o.onToken, onStructured: o.onStructured, onWarning: o.onWarning, onMetrics: o.onMetrics
    });
  }

  /* 試験の構成案（Blueprint）。いきなり全問作らせない（§13）。 */
  function generateBlueprint(o) {
    var msg = [
      "次の条件で試験の構成案だけを作ってください。まだ問題文は作らないでください。",
      "",
      o.instruction,
      "",
      "大問ごとに「番号・題名・出題のねらい・配点・問題数・使う問題形式」を示してください。",
      "配点の合計は " + o.totalPoints + " 点にしてください。"
    ].join("\n");
    return run({
      task: "mock_blueprint", message: msg, attachments: o.attachments,
      taskHint: "planning", sourceOnly: o.sourceOnly, level: o.level || "normal",
      includedAttachmentIds: o.includedAttachmentIds,
      retrievalQuery: o.retrievalQuery,
      /* A) 読み取り済みの資料の要点。渡されなければ同じ添付の前回ぶんを自動で使う。 */
      sourceDigest: o.sourceDigest, onSourceDigest: o.onSourceDigest,
      onActivity: o.onActivity, onToken: o.onToken, onWarning: o.onWarning, onMetrics: o.onMetrics
    });
  }

  /* ── 足りない項目だけを埋め直す ────────────────────────────────
     資料が多いほど、AI は問題は書けても解説・出典・正解を落とす。
     作り直すと全部が変わってしまうので、**足りない問題だけ**を渡し、
     **足りない項目だけ**を書かせる。出力が短いので速く、失敗しにくい。 */
  function repairQuestions(o) {
    var items = o.items || [];
    var lines = [
      "次の設問には足りない項目があります。**足りない項目だけ**を埋めてください。",
      "",
      "【守ること】",
      "・問題文は変えないでください。足りない項目を補うだけです。",
      "・資料に書かれていないことは書かないでください。分からない項目は空のままにしてください。",
      "・**存在しない出典を作らないでください**。資料で確かめられるものだけ書いてください。",
      "・正解は 1 つに決まる形で書いてください。",
      "",
      "【対象の設問】"
    ];
    items.forEach(function (it, i) {
      lines.push("");
      lines.push("--- " + (i + 1) + " ---");
      lines.push("id: " + it.id);
      lines.push("形式: " + (it.typeLabel || it.type));
      lines.push("問題文: " + String(it.prompt || "").slice(0, 600));
      if (it.choices && it.choices.length)
        lines.push("選択肢: " + it.choices.map(function (c, ci) { return (ci + 1) + ") " + c; }).join(" / "));
      if (it.answer) lines.push("いまの正解: " + it.answer);
      lines.push("足りないもの: " + (it.needsLabel || []).join("・"));
    });
    lines.push("");
    lines.push("それぞれの設問について、上の id をそのまま使って返してください。");

    return run({
      task: "preset_revision", message: lines.join("\n"), attachments: o.attachments,
      structuredOutput: "preset", taskHint: "preset_revision",
      sourceOnly: o.sourceOnly, level: "normal", questionCount: items.length,
      /* 資料はすでに一度読んである。ここは足りない所を埋めるだけなので整理し直さない */
      skipDocumentAnalysis: o.skipDocumentAnalysis === true,
      /* A) 読み取り済みの資料の要点。渡されなければ同じ添付の前回ぶんを自動で使う。 */
      sourceDigest: o.sourceDigest, onSourceDigest: o.onSourceDigest,
      onActivity: o.onActivity, onToken: o.onToken, onWarning: o.onWarning, onMetrics: o.onMetrics
    });
  }

  /* 試験本体の生成 */
  function generateMock(o) {
    return run({
      task: "mock_generation", message: o.instruction, attachments: o.attachments,
      structuredOutput: "mock", taskHint: "mock_generation",
      sourceOnly: o.sourceOnly, level: o.level,
      /* 何問ぶんの出力を見込むか。伝えないと出力上限が固定のままで、
         資料が多いときに JSON が途中で切れて全部失う。 */
      questionCount: o.count,
      /* 何大問ぶんを頼んでいるか。**呼び出し元が決める**（ここで 1 に固定しない）。
         サーバは mock-generator.mjs の mockFormat() で
         sections の minItems / maxItems に落とす。伝えないと大問数が無制限になり、
         count は「大問あたりの設問数」なので count × 大問数だけ返る。 */
      sectionCount: o.sectionCount,
      /* この回で作る出題形式の並び。Schema を型ごとに縛るために渡す。 */
      questionTypes: o.questionTypes,
      /* 配点はクライアントが決める（MB.finalize と SA.allocate が唯一の正）。
         これを伝えないと、サーバは大問 1 つぶんの合計を試験全体の満点と
         比べて毎回ずれを警告し、requiresReview を立てる
         （pipeline-structured.mjs の §6）。「100点のはずが83点」の警告はこれ。
         なお **AI に合計点を計算し直させてはいけない**。合わせるのはコード側。 */
      scoreAuthority: "client",
      skipDocumentAnalysis: o.skipDocumentAnalysis,
      /* Phase 13: 使う資料・検索語・Evidence 必須をそのまま通す */
      includedAttachmentIds: o.includedAttachmentIds,
      retrievalQuery: o.retrievalQuery,
      requireEvidence: o.requireEvidence,
      /* 資料なし（指示だけ）で作る。資料があるときはサーバ側で無視される。 */
      promptOnly: o.promptOnly,
      /* A) 読み取り済みの資料の要点。渡されなければ同じ添付の前回ぶんを自動で使う。 */
      sourceDigest: o.sourceDigest, onSourceDigest: o.onSourceDigest,
      onActivity: o.onActivity, onToken: o.onToken, onStructured: o.onStructured, onWarning: o.onWarning, onMetrics: o.onMetrics
    });
  }

  /* ── MockCompiler V2 用：指定した枠のぶんだけ設問の中身を書かせる ──
     V1 の generateMock との違いは「何を返してほしいか」がこちら側で確定していること。
     数も配点も枠で決まっているので、ここでは中身だけを受け取る。
     返り値は mockCompilerRun が期待する { questions: [...] } の形にそろえる。 */
  function generateQuestions(o) {
    return run({
      task: "mock_generation", message: o.prompt, attachments: o.attachments,
      structuredOutput: "mock", taskHint: "mock_generation",
      sourceOnly: o.sourceOnly, level: o.level,
      questionCount: o.count,
      /* 1 依頼 = 1 大問ぶん。伝えないと大問をいくつでも作られる。 */
      sectionCount: 1,
      /* 使う資料の限定・資料検索の語・Evidence の要求。
         **ここを渡さないと、除外指定が効かず、検索語も届かない。**
         実測（vqmockdiag.cjs）: 渡していなかったため、依頼文（「問1 選択 10点…」）が
         そのまま検索語になり、資料の中身と噛み合わないまま
         INSUFFICIENT_EVIDENCE で止まっていた。generateMock は前から渡している。 */
      includedAttachmentIds: o.includedAttachmentIds,
      retrievalQuery: o.retrievalQuery,
      requireEvidence: o.requireEvidence,
      /* 資料の要点は 1 回まとめれば足りる。2 回目以降はまとめ直さない。 */
      skipDocumentAnalysis: o.skipDocumentAnalysis === true,
      /* A) 読み取り済みの資料の要点。渡されなければ同じ添付の前回ぶんを自動で使う。
         docFingerprint は「同じ資料かどうか」を **中身で**見分けるための札。 */
      sourceDigest: o.sourceDigest, onSourceDigest: o.onSourceDigest,
      docFingerprint: o.docFingerprint,
      onActivity: o.onActivity, onWarning: o.onWarning, onMetrics: o.onMetrics
    }).then(function (res) {
      var d = res.structured && res.structured.sections ? res.structured
            : (res.structured && res.structured.data ? res.structured.data : null);
      var secs = d && Array.isArray(d.sections) ? d.sections : [];
      /* 大問がいくつに割れて返ってきても、設問だけを平らに取り出す。
         枠へ入れるのは呼び出し側（mockCompilerRun）の仕事。 */
      var qs = secs.reduce(function (a, s) { return a.concat(s.questions || []); }, []);
      var keys = {};
      (d && Array.isArray(d.answerKey) ? d.answerKey : []).forEach(function (k) {
        if (k && k.id != null) keys[String(k.id)] = k;
      });
      return {
        questions: qs.map(function (q) {
          var k = keys[String(q.id)] || {};
          /* 解答と解説は answerKey 側にある。設問側へ寄せてから返す
             （gate が 1 か所だけ見れば済むように）。 */
          return {
            id: q.id, question: q.question, type: q.type, choices: q.choices,
            answer: k.answer != null ? k.answer : q.correctAnswer,
            explanation: k.explanation != null ? k.explanation : q.explanation,
            topic: q.topic, difficulty: q.difficulty,
            sourceReferences: q.sourceReferences,
            requiresReview: q.requiresReview === true
          };
        }),
        usage: res.usage || null,
        warnings: res.warnings || []
      };
    });
  }

  /* 記述式の AI 補助採点 */
  function gradeAnswers(o) {
    return run({
      task: "ai_grading", message: "記述式の解答を採点してください。",
      workspaceTask: "ai_grading", payload: { targets: o.targets },
      level: o.level, questionCount: (o.targets || []).length,
      onActivity: o.onActivity, onStructured: o.onStructured, onWarning: o.onWarning, onMetrics: o.onMetrics
    });
  }

  /* 学習分析 */
  function analyzeResult(o) {
    return run({
      task: "learning_analysis", message: "答案を分析してください。",
      workspaceTask: "learning_analysis", payload: o.payload,
      level: o.level, questionCount: (o.payload && o.payload.items || []).length,
      onActivity: o.onActivity, onToken: o.onToken, onStructured: o.onStructured, onWarning: o.onWarning, onMetrics: o.onMetrics
    });
  }

  /* 試験の品質分析 */
  function reviewQuality(o) {
    return run({
      task: "mock_quality_review", message: "この試験の品質を確認してください。",
      workspaceTask: "mock_quality_review", payload: o.payload,
      level: o.level,
      onActivity: o.onActivity, onToken: o.onToken, onStructured: o.onStructured, onWarning: o.onWarning, onMetrics: o.onMetrics
    });
  }

  /* 紙面検査 */
  function reviewLayout(o) {
    return run({
      task: "layout_review", message: "紙面を確認してください。",
      workspaceTask: "layout_review", payload: o.payload,
      level: o.level, compileAttempts: o.compileAttempts || 0,
      onActivity: o.onActivity, onStructured: o.onStructured, onWarning: o.onWarning, onMetrics: o.onMetrics
    });
  }

  /* 解説の作り直し・質問（Result View から使う） */
  function explain(o) {
    return run({
      task: "explanation", message: o.message, attachments: o.attachments,
      taskHint: "explanation", level: o.level || "normal",
      onActivity: o.onActivity, onToken: o.onToken, onWarning: o.onWarning, onMetrics: o.onMetrics
    });
  }

  VQ2.ai = {
    available: available,
    run: run,
    cancel: cancel,
    isRunning: isRunning,
    runningCount: runningCount,
    MAX_CONCURRENT: MAX_CONCURRENT,
    runningTask: runningTask,
    restore: restore,
    /* 続きから再開する（材料は aijob ＋ store の下書き置き場にある） */
    resumable: resumable,
    resume: resume,
    /* 資料の読み取り結果の使い回し（A） */
    sourceDigestFor: sourceDigestFor,
    forgetSourceDigest: forgetSourceDigest,
    levelFor: levelFor,
    LEVEL_FOR: LEVEL_FOR,
    currentJobId: currentJobId,
    generatePreset: generatePreset,
    planTopics: planTopics,
    parseTopics: parseTopics,
    revisePreset: revisePreset,
    repairPreset: repairPreset,
    backfillPreset: backfillPreset,
    generateBlueprint: generateBlueprint,
    generateMock: generateMock,
    generateQuestions: generateQuestions,
    repairQuestions: repairQuestions,
    gradeAnswers: gradeAnswers,
    analyzeResult: analyzeResult,
    reviewQuality: reviewQuality,
    reviewLayout: reviewLayout,
    explain: explain
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
