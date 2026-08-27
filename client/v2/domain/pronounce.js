/* ══════════════════════════════════════════════════════════════════════
   発音の採点（§25）

   **できることだけを測る。** いま端末にあるのは
     ・目標の英文
     ・聞き取りの結果（文字・語ごとの時刻・語ごとの自信）
   だけ。音素そのものは持っていない。

   だから、次の 3 つに分けて出す。**混ぜて 1 つの「発音点」にしない。**

     伝わりやすさ … 目標の語がどれだけ拾えたか（語の対応づけ）
     はっきりさ   … 拾えた語を、聞き取りがどれだけ自信を持って拾ったか
     流暢さ       … 話す速さと、途中の間

   「はっきりさ」は **音素の正しさではない**。
   聞き取りが迷ったかどうかの目安でしかないので、そう表示する。

   ・**点数を作り話さない。** 測れないものは null で返す。
   ・聞き取りが失敗した／自信が低いときは、点をつけずにやり直しを勧める。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var SM = VQ2.speakModel;
  if (!SM) throw new Error("VQ2.speakModel must be loaded before pronounce.js");

  function str(v) { return v === undefined || v === null ? "" : String(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function num(v, d) { return isNum(v) ? v : d; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  /* 数字の言い方をそろえる。「ten thirty」と「10.30」は同じ。
     ここをそろえないと、正しく言えているのに全部ばつになる（実測）。 */
  var NUM_WORD = {
    zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
    eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
    fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
    thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
    hundred: 100, thousand: 1000
  };
  function normWord(w) {
    var t = SM.normText(w).replace(/[.,:]/g, "");
    if (!t) return "";
    if (NUM_WORD[t] !== undefined) return String(NUM_WORD[t]);
    if (/^\d+$/.test(t)) return String(Number(t));
    return t;
  }
  /* 「10.30」「10:30」のように 1 語へ潰れたものを、数字の並びへ戻す。 */
  function splitNumbers(list) {
    var out = [];
    list.forEach(function (w) {
      var m = /^(\d+)[.:](\d+)$/.exec(w);
      if (m) { out.push(String(Number(m[1]))); out.push(String(Number(m[2]))); return; }
      out.push(w);
    });
    return out;
  }
  function wordsOf(text) {
    return splitNumbers(SM.normText(text).split(" ").map(normWord).filter(Boolean));
  }
  /* 聞き取りの語を、つき合わせに使う印の並びへ直す。
     「10.30」のように 1 語へ潰れているものは 2 つに割れるので、
     **どの語から来たか（srcIndex）を覚えておく**。
     覚えないと、語ごとの自信を取り違える。 */
  function tokensFrom(words) {
    var out = [];
    arr(words).forEach(function (w, i) {
      var t = normWord(str(w && w.word));
      if (!t) return;
      splitNumbers(t.split(" ").filter(Boolean)).forEach(function (x) {
        out.push({ token: x, srcIndex: i });
      });
    });
    return out;
  }

  /* ══════════════════════════════════════════════════════════════════
     1) 語をつき合わせる（どこが抜けて、どこが違うか）
     編集距離をたどって、目標の語 1 つずつに印を付ける。
     ══════════════════════════════════════════════════════════════════ */
  function align(target, said) {
    var a = arr(target), b = arr(said);
    var n = a.length, m = b.length;
    /* d[i][j] … a の i 語目までと b の j 語目までを合わせるのに要る手数 */
    var d = [], i, j;
    for (i = 0; i <= n; i++) { d.push(new Array(m + 1)); d[i][0] = i; }
    for (j = 0; j <= m; j++) d[0][j] = j;
    for (i = 1; i <= n; i++) {
      for (j = 1; j <= m; j++) {
        var cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      }
    }
    /* 後ろからたどって、どの語がどうなったかを出す。 */
    var ops = [];
    i = n; j = m;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) {
        ops.push({ kind: a[i - 1] === b[j - 1] ? "ok" : "wrong",
                   target: a[i - 1], said: b[j - 1], at: i - 1, saidAt: j - 1 });
        i--; j--;
      } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
        ops.push({ kind: "missing", target: a[i - 1], said: "", at: i - 1, saidAt: -1 });
        i--;
      } else {
        ops.push({ kind: "extra", target: "", said: b[j - 1], at: -1, saidAt: j - 1 });
        j--;
      }
    }
    ops.reverse();
    return { ops: ops, distance: d[n][m] };
  }

  /* ══════════════════════════════════════════════════════════════════
     2) 採点
        target … 目標の英文
        stt    … Bridge の返り（text / words / audioSeconds）
     ══════════════════════════════════════════════════════════════════ */
  var MIN_SECONDS = 0.4;        /* これより短い音は、言えたと判断しない */
  var LOW_CONF = 0.45;          /* 聞き取りの自信がこれ未満なら、点をつけない */
  /* 英語のふつうの速さ。1 語あたりの秒数（毎分 130〜170 語くらい） */
  var SEC_PER_WORD = { slow: 0.62, fast: 0.30 };
  var PAUSE_MS = 700;           /* これ以上あいたら「間があいた」と数える */

  function evaluate(target, stt, o) {
    o = o || {};
    var t = wordsOf(target);
    if (!t.length) return notScored("読み上げる文がありません。");
    if (!stt || !stt.ok) return notScored((stt && stt.reason) || "聞き取れませんでした。");

    var seconds = num(stt.audioSeconds, 0);
    if (seconds < MIN_SECONDS) return notScored("録音が短すぎます。もう一度、はっきり言ってみてください。", { retry: true });

    var toks = tokensFrom(stt.words);
    var said = toks.length ? toks.map(function (x) { return x.token; }) : wordsOf(stt.text);
    if (!said.length) return notScored("声を聞き取れませんでした。もう一度お願いします。", { retry: true });
    /* 印 → 元の語。自信と時刻はこちらから引く。 */
    function srcOf(k) { return toks.length && toks[k] ? arr(stt.words)[toks[k].srcIndex] : null; }

    /* 聞き取り自体の自信。低いときは **文法や発音のせいにしない**（§24）。 */
    var confs = arr(stt.words).map(function (w) { return num(w.confidence, null); })
      .filter(function (x) { return x !== null; });
    var meanConf = confs.length ? confs.reduce(function (a, b) { return a + b; }, 0) / confs.length : null;
    if (meanConf !== null && meanConf < LOW_CONF)
      return notScored("うまく聞き取れませんでした。静かなところで、もう一度お願いします。",
                       { retry: true, meanConf: Math.round(meanConf * 100) });

    var al = align(t, said);

    /* ── 伝わりやすさ … 目標の語をどれだけ言えたか ── */
    var hit = al.ops.filter(function (x) { return x.kind === "ok"; }).length;
    var intelligibility = Math.round((hit / t.length) * 100);

    /* ── はっきりさ … 合っていた語を、聞き取りがどれだけ迷わず拾えたか ──
       **音素の正しさではない。** 迷いの少なさの目安。 */
    var okConf = [];
    al.ops.forEach(function (x) {
      if (x.kind !== "ok" || x.saidAt < 0) return;
      var w = srcOf(x.saidAt);
      if (w && isNum(w.confidence)) okConf.push(w.confidence);
    });
    var clarity = okConf.length
      ? Math.round(clamp((okConf.reduce(function (a, b) { return a + b; }, 0) / okConf.length), 0, 1) * 100)
      : null;

    /* ── 流暢さ … 速さと間 ── */
    var perWord = seconds / said.length;
    var speedScore;
    if (perWord > SEC_PER_WORD.slow) speedScore = clamp(100 - (perWord - SEC_PER_WORD.slow) * 160, 30, 100);
    else if (perWord < SEC_PER_WORD.fast) speedScore = clamp(100 - (SEC_PER_WORD.fast - perWord) * 200, 40, 100);
    else speedScore = 100;
    var pauses = [];
    var ws = arr(stt.words);
    for (var k = 1; k < ws.length; k++) {
      var gap = num(ws[k].startMs, 0) - num(ws[k - 1].endMs, 0);
      if (gap >= PAUSE_MS) pauses.push({ afterWord: str(ws[k - 1].word), startMs: num(ws[k - 1].endMs, 0), durationMs: gap });
    }
    var pausePenalty = Math.min(40, pauses.length * 12);
    var fluency = Math.round(clamp(speedScore - pausePenalty, 0, 100));

    /* ── 語ごとの結果 ── */
    var wordResults = al.ops.filter(function (x) { return x.kind !== "extra"; }).map(function (x) {
      var w = x.saidAt >= 0 ? srcOf(x.saidAt) : null;
      return {
        word: x.target,
        said: x.said || "",
        ok: x.kind === "ok",
        issue: x.kind === "missing" ? "言えていません"
             : x.kind === "wrong" ? "違う語に聞こえました" : "",
        confidence: w && isNum(w.confidence) ? Math.round(w.confidence * 100) : null
      };
    });
    var extra = al.ops.filter(function (x) { return x.kind === "extra"; }).map(function (x) { return x.said; });

    /* ── 総合 ── はっきりさは目安なので重みを小さくする。 */
    var parts = [[intelligibility, 0.55], [fluency, 0.25]];
    if (clarity !== null) parts.push([clarity, 0.20]);
    var wsum = parts.reduce(function (a, p) { return a + p[1]; }, 0);
    var overall = Math.round(parts.reduce(function (a, p) { return a + p[0] * p[1]; }, 0) / wsum);
    /* **目標と違うことを言ったら、速さがよくても高得点にしない。**
       これを入れないと、まるで別の文をすらすら言っただけで 58 点になる（実測）。 */
    overall = Math.min(overall, intelligibility + 25);

    return {
      scored: true,
      overall: overall,
      intelligibility: intelligibility,
      clarity: clarity,
      fluency: fluency,
      /* **音素はやっていない。** 画面でもそう出す。 */
      phonemes: null,
      phonemeNote: "音素ごとの評価はまだできません。ここでは「目標の語を言えたか」と「速さ・間」で見ています。",
      wordResults: wordResults,
      extraWords: extra,
      pauses: pauses,
      wordsPerMinute: Math.round((said.length / Math.max(0.1, seconds)) * 60),
      seconds: Math.round(seconds * 100) / 100,
      recognized: str(stt.text),
      target: str(target),
      meanConfidence: meanConf === null ? null : Math.round(meanConf * 100),
      advice: advise({ intelligibility: intelligibility, fluency: fluency, clarity: clarity,
                       wordResults: wordResults, extra: extra, pauses: pauses })
    };
  }

  function notScored(reason, extra) {
    return Object.assign({
      scored: false, overall: null, intelligibility: null, clarity: null, fluency: null,
      phonemes: null, wordResults: [], extraWords: [], pauses: [], reason: reason
    }, extra || {});
  }

  /* 助言。**言えていない語を具体的に挙げる**（「がんばりましょう」で終わらせない）。 */
  function advise(r) {
    var out = [];
    var missing = r.wordResults.filter(function (w) { return !w.ok && w.issue === "言えていません"; });
    var wrong = r.wordResults.filter(function (w) { return !w.ok && w.issue === "違う語に聞こえました"; });
    if (r.intelligibility >= 95 && r.fluency >= 80) out.push("よく伝わっています。");
    if (missing.length) {
      out.push("言えていない語があります: " + missing.slice(0, 4).map(function (w) { return w.word; }).join(" / "));
    }
    if (wrong.length) {
      out.push("別の語に聞こえたところ: " + wrong.slice(0, 3).map(function (w) {
        return w.word + "（" + (w.said || "?") + " に聞こえました）"; }).join(" / "));
    }
    if (r.pauses.length) out.push("途中で " + r.pauses.length + " 回止まりました（"
      + r.pauses.map(function (p) { return "「" + p.afterWord + "」のあと " + (p.durationMs / 1000).toFixed(1) + " 秒"; })
          .slice(0, 3).join("・") + "）。文のまとまりで区切ると伝わりやすくなります。");
    if (r.fluency < 60 && !r.pauses.length) out.push("話す速さを、もう少しふつうに近づけてみましょう。");
    if (r.extra.length) out.push("余分に聞こえた語: " + r.extra.slice(0, 3).join(" / "));
    if (!out.length) out.push("もう一度、はっきり言ってみましょう。");
    return out;
  }

  /* ══════════════════════════════════════════════════════════════════
     3) シャドーイング（見本を追いかけて言う）
     内容の一致に加えて、**始めるのが遅れていないか** と
     **見本と同じくらいの長さで言えたか** を見る。
     ══════════════════════════════════════════════════════════════════ */
  function evaluateShadowing(target, stt, o) {
    o = o || {};
    var base = evaluate(target, stt, o);
    if (!base.scored) return base;
    var modelSeconds = num(o.modelSeconds, null);
    var startMs = arr(stt.words).length ? num(arr(stt.words)[0].startMs, 0) : 0;
    var delay = num(o.delayMs, 0);

    /* 始めるのが遅すぎないか。見本より 1.5 秒以上あとなら遅れとみなす。 */
    var lateMs = Math.max(0, startMs - delay);
    var timing = Math.round(clamp(100 - (lateMs / 1500) * 60, 0, 100));

    /* 長さがそろっているか（速すぎ・遅すぎ）。 */
    var pace = null;
    if (modelSeconds) {
      var ratio = base.seconds / modelSeconds;
      pace = Math.round(clamp(100 - Math.abs(ratio - 1) * 120, 0, 100));
    }
    var parts = [[base.overall, 0.6], [timing, 0.2]];
    if (pace !== null) parts.push([pace, 0.2]);
    var wsum = parts.reduce(function (a, p) { return a + p[1]; }, 0);

    return Object.assign({}, base, {
      overall: Math.round(parts.reduce(function (a, p) { return a + p[0] * p[1]; }, 0) / wsum),
      timing: timing, pace: pace,
      startDelayMs: lateMs,
      modelSeconds: modelSeconds,
      advice: base.advice.concat(
        lateMs > 1200 ? ["出だしが " + (lateMs / 1000).toFixed(1) + " 秒遅れました。見本の 1 語目のすぐあとから始めましょう。"] : [],
        pace !== null && pace < 70
          ? [base.seconds > modelSeconds ? "見本よりゆっくりです。" : "見本より速いです。"] : [])
    });
  }

  VQ2.pronounce = {
    evaluate: evaluate, evaluateShadowing: evaluateShadowing,
    align: align, wordsOf: wordsOf, normWord: normWord,
    LOW_CONF: LOW_CONF, MIN_SECONDS: MIN_SECONDS
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
