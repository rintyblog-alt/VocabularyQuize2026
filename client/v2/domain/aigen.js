/* ══════════════════════════════════════════════════════════════════════
   クラウド側で問題を作る（Workers AI）

   これまで問題を作れるのは **この Mac が起きているとき**だけだった
   （ui/ai.js は window.__vqLocalAI しか見ていない）。
   ここはもう 1 つの実行体。同じ入口・同じ返し方で、雲の上で作る。

   ── なぜ雲の上か（実測・2026-08-10・同じ 23 ケース／同じ採点）──────
     Mac        合格 15/23  平均 89 点  p50 81 秒
     Workers AI 合格 22/23  平均 99 点  p50 11 秒
   形式の取りちがえ・配分ずれは、こちらでは受け取らずに捨てて作り直すので、
   「頼んでいない形式が出てくる」がほぼ無くなる。

   ── ここでやらないこと ──────────────────────────────────────────
   ・何を作るかの判断（契約）はサーバのコードが決める。ここは運ぶだけ
   ・作れなかったぶんを水増ししない。足りないなら足りないと返す
   ・返す形は ui/ai.js の generateQuestions と **同じ**にする
     （呼び出し側を書き換えずに差し替えられるようにするため）
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});

  function apiBase() {
    try {
      if (root.API_BASE) return String(root.API_BASE);
      if (root.CONFIG && root.CONFIG.apiBase) return String(root.CONFIG.apiBase);
    } catch (e) {}
    return "";
  }
  function authHeader() {
    try {
      var t = root.localStorage.getItem("app.auth.token.v1");
      return t ? { Authorization: "Bearer " + String(t).replace(/^"|"$/g, "") } : null;
    } catch (e) { return null; }
  }

  /* この実行体が使えるか。ログインしていることが条件（誰の生成かを分けるため）。 */
  function available() {
    return Promise.resolve(!!authHeader() && !!root.fetch);
  }

  /* サーバの返しを、画面が今まで受け取ってきた形へそろえる。
     **中身は作らない。** 名前を合わせて、形式ごとの持ち物をそのまま渡すだけ。 */
  function toClientShape(q, i) {
    var out = {
      id: String(q.id || ("q" + (i + 1))),
      question: String(q.question || ""),
      type: String(q.type || ""),
      answer: q.answer,
      explanation: q.explanation == null ? "" : String(q.explanation),
      topic: q.topic || "",
      difficulty: q.difficulty || "",
      sourceReferences: Array.isArray(q.sourceReferences) ? q.sourceReferences : [],
      requiresReview: q.requiresReview === true
    };
    /* 形式ごとの持ち物。落とすと、その形式の問題が成立しなくなる。 */
    if (Array.isArray(q.choices)) out.choices = q.choices;
    if (Array.isArray(q.items)) out.items = q.items;
    if (Array.isArray(q.left)) out.left = q.left;
    if (Array.isArray(q.right)) out.right = q.right;
    if (Array.isArray(q.groups)) out.groups = q.groups;
    if (q.wrong != null) out.wrong = q.wrong;
    return out;
  }

  /* 問題を作る。返す形は ui/ai.js の generateQuestions と同じ。 */
  function generateQuestions(o) {
    o = o || {};
    var h = authHeader();
    if (!h || !root.fetch) {
      return Promise.reject(Object.assign(new Error("NOT_SIGNED_IN"),
        { userMessage: "クラウドで作るにはログインが必要です。" }));
    }
    var body = {
      prompt: String(o.prompt || ""),
      count: o.count || undefined,
      maxRounds: o.maxRounds || undefined,
      maxCalls: o.maxCalls || undefined
    };
    var t0 = Date.now();
    return root.fetch(apiBase() + "/api/aigen/questions", {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json" }, h),
      body: JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (j) {
      if (!j || !j.ok) throw new Error((j && j.message) || "GENERATE_FAILED");

      /* 矛盾・未対応は **作らないのが正解**。理由を持って返す。
         ここで既定の形式へ寄せて作ると、頼まれていないものを渡すことになる。 */
      if (j.status === "contradictory" || j.status === "unsupported") {
        return {
          questions: [], warnings: [j.reason || ""],
          status: j.status, reason: j.reason || "",
          contract: j.contract || null,
          usage: { aiCalls: 0, neurons: 0, ms: Date.now() - t0 }
        };
      }
      /* クラウド側の事情で 1 問も作れなかった（今日ぶんを使い切った・
         モデルが使えない）。**ここで諦めない。**
         呼び出し側が「この Mac で作り直す」を選べるよう、見分けられる形で投げる。 */
      if (j.status === "blocked") {
        throw Object.assign(new Error(j.blocked || "BLOCKED"), {
          blocked: j.blocked || "BLOCKED",
          fallbackToLocal: true,
          userMessage: (j.blockedMessage || "クラウドで作れませんでした。")
            + "この端末の AI に切り替えて続けます。"
        });
      }
      var qs = (Array.isArray(j.questions) ? j.questions : []).map(toClientShape);
      var m = j.metrics || {};
      var warns = [];
      if (j.made < j.planned) {
        warns.push("頼まれた " + j.planned + " 問のうち " + j.made + " 問までしか作れませんでした。"
          + "足りないぶんは作り直せます。");
      }
      /* 途中まで作れているが、クラウド側の事情で止まった。
         **できているぶんは捨てない**うえで、そうと分かるようにする。 */
      if (j.blocked) warns.push((j.blockedMessage || "クラウドで続けられませんでした。")
        + "ここまでの " + (j.made || 0) + " 問は残しています。");
      return {
        questions: qs, warnings: warns,
        status: j.status, blocked: j.blocked || null, contract: j.contract || null,
        planned: j.planned, made: j.made,
        usage: {
          aiCalls: m.aiCalls || 0, neurons: m.neurons || 0,
          tokensIn: m.tokensIn || 0, tokensOut: m.tokensOut || 0,
          ms: m.totalMs || (Date.now() - t0),
          firstResultMs: m.firstResultMs || 0,
          rejected: m.rejected || 0
        }
      };
    });
  }

  /* ══ どちらの実行体で作るか ══
     "auto"  … つながるほうを使う（クラウドを優先）
     "cloud" … いつでもクラウド
     "local" … いつでもこの Mac（Bridge）
     既定は auto。**クラウドを優先**する理由は上の実測のとおり。 */
  var PREF_KEY = "vq2.aigen.executor.v1";
  function executorPref() {
    try {
      var v = root.localStorage.getItem(PREF_KEY);
      return (v === "cloud" || v === "local" || v === "auto") ? v : "auto";
    } catch (e) { return "auto"; }
  }
  function setExecutorPref(v) {
    try { root.localStorage.setItem(PREF_KEY, String(v)); } catch (e) {}
    return executorPref();
  }
  /* いま実際にどちらを使うか決める。**決め方を画面へ隠さない**
     （どちらで作ったかは、あとで速さと費用を読むときに要る）。 */
  function pickExecutor() {
    var pref = executorPref();
    if (pref === "local") return Promise.resolve("local");
    if (pref === "cloud") return Promise.resolve("cloud");
    return available().then(function (okCloud) {
      if (okCloud) return "cloud";
      return "local";
    });
  }

  VQ2.aigen = {
    available: available,
    generateQuestions: generateQuestions,
    executorPref: executorPref,
    setExecutorPref: setExecutorPref,
    pickExecutor: pickExecutor,
    PREF_KEY: PREF_KEY
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
