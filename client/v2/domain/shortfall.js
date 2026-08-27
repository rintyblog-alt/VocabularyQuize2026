/* 頼まれた数に届かなかったときの言い方と、選べる操作。

   「81 問しか作れませんでした」で終わらせない。
   足りない理由は 6 通りあり、次の一手が理由ごとに違う。
   資料を足せば増えるのか、出題形式を広げれば増えるのか、
   そもそもこの資料では増えないのかを、はっきり分けて出す。

   数合わせのための言い換えや資料外の知識で埋める案は、ここには出さない。 */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 = root.VQ2 || {};

  /* 理由ごとの説明と、増やし方。
     canAddSources / canWidenTypes は Bridge 側の判定を優先し、
     ここでは「その理由なら普通どうなるか」を既定値として持つ。 */
  var REASONS = {
    insufficient_topics: {
      title: "資料の論点が足りません",
      why: "この資料から取り出せた論点の数が、指定の問題数に足りません。",
      hint: "ページ数の多い資料や、別の範囲の資料を足すと増えます。",
      addSources: true, widenTypes: false
    },
    insufficient_evidence: {
      title: "根拠にできる本文が足りません",
      why: "本文が短いページが多く、出題の根拠にできる箇所が足りません。",
      hint: "文字がはっきり写っている資料を足すと増えます。",
      addSources: true, widenTypes: false
    },
    duplicate_only: {
      title: "これ以上は同じ問題になります",
      why: "残りを作ると、すでにある問題と同じ論点・同じ観点の繰り返しになります。",
      hint: "出題形式を広げると、同じ論点から違う問い方ができるようになります。"
        + "資料を足しても、この資料の範囲では増えません。",
      addSources: false, widenTypes: true
    },
    unsupported_question_angle: {
      title: "この資料で使える問い方が限られています",
      why: "時系列や比較などの記述が資料に無いため、使える問い方が限られています。",
      hint: "出題形式を広げると増えることがあります。"
        + "説明の多い資料を足すと、使える問い方そのものが増えます。",
      addSources: true, widenTypes: true
    },
    low_confidence_evidence: {
      title: "読み取りの確かさが足りません",
      why: "文字の読み取りが不確かなページが多く、根拠として使えません。",
      hint: "そのページを撮り直すか、別の資料を足してください。",
      addSources: true, widenTypes: false
    },
    excluded_pages: {
      title: "外したページのぶんが作れません",
      why: "使わないページとして外した箇所からは出題していません。",
      hint: "外したページを戻すと増えます。",
      addSources: false, widenTypes: false
    }
  };

  /* 資料なし（指示だけ）で作ったときの言い方。
     無い資料のことを言わない。「資料が薄い」ではなく「指示から取れる論点が少ない」。 */
  var PROMPT_REASONS = {
    insufficient_topics: {
      title: "ご指示から取れる論点が足りません",
      why: "いただいた指示から取り出せた論点の数が、指定の問題数に足りません。",
      hint: "出題する範囲をもう少し広く書くか、資料を入れると増えます。",
      addSources: true, widenTypes: false
    },
    insufficient_evidence: {
      title: "確かに出題できる中身が足りません",
      why: "指示の範囲で確かに言える内容が少なく、出題の材料が足りません。",
      hint: "範囲をもう少し具体的に書くか、資料を入れてください。",
      addSources: true, widenTypes: false
    },
    duplicate_only: {
      title: "これ以上は同じ問題になります",
      why: "残りを作ると、すでにある問題と同じ論点・同じ観点の繰り返しになります。",
      hint: "出題形式を広げると、同じ論点から違う問い方ができるようになります。"
        + "出題する範囲を広げても増えます。",
      addSources: false, widenTypes: true
    },
    unsupported_question_angle: {
      title: "この範囲で使える問い方が限られています",
      why: "比較や時系列にあたる中身が指示の範囲に無いため、使える問い方が限られています。",
      hint: "出題形式を広げると増えることがあります。範囲を広げると問い方そのものが増えます。",
      addSources: true, widenTypes: true
    },
    low_confidence_evidence: {
      title: "確かでない内容は出題しませんでした",
      why: "あいまいにしか言えない内容は、問題にせず落としています。",
      hint: "その範囲の資料を入れると、確かめたうえで出題できます。",
      addSources: true, widenTypes: false
    }
  };

  function reasonOf(code, promptOnly) {
    var key = String(code || "");
    if (promptOnly && PROMPT_REASONS[key]) return PROMPT_REASONS[key];
    return REASONS[key] || (promptOnly ? {
      title: "指定の数に届きませんでした",
      why: "いただいた指示から安全に作れる数が、指定の問題数に足りませんでした。",
      hint: "問題数を下げるか、出題する範囲を広げてお試しください。",
      addSources: true, widenTypes: true
    } : {
      title: "指定の数に届きませんでした",
      why: "この資料から安全に作れる数が、指定の問題数に足りませんでした。",
      hint: "問題数を下げるか、資料を足してお試しください。",
      addSources: true, widenTypes: true
    });
  }

  /* 画面へ出す形にまとめる。数は Bridge の実測値をそのまま使う（作らない）。 */
  function describe(sf) {
    var code = String((sf && sf.code) || "");
    /* 資料なしで作ったかどうかは Bridge が返す。ここで推測しない。 */
    var promptOnly = !!(sf && sf.promptOnly);
    var r = reasonOf(code, promptOnly);
    var requested = Number(sf && sf.requested) || 0;
    var available = Number(sf && sf.availableCount) || 0;
    var missing = Number(sf && sf.shortfall) || Math.max(0, requested - available);
    /* Bridge が「効く」と言った手段だけを出す。 */
    var canAdd = sf && typeof sf.canAddSources === "boolean" ? sf.canAddSources : r.addSources;
    var canWiden = sf && typeof sf.canWidenTypes === "boolean" ? sf.canWidenTypes : r.widenTypes;
    var actions = [{ id: "accept", label: available + " 問で確定する", primary: true }];
    if (canWiden) actions.push({ id: "widen", label: "出題形式を広げて残り " + missing + " 問を作る" });
    if (canAdd) actions.push({ id: "add", label: "資料を追加する" });
    actions.push({ id: "cancel", label: "やめる" });
    return {
      code: code || "unknown",
      promptOnly: promptOnly,
      title: r.title, why: r.why, hint: r.hint,
      requested: requested, available: available, missing: missing,
      canAddSources: canAdd, canWidenTypes: canWiden,
      actions: actions,
      /* 数を並べて出すための行。作れる数と足りない数を必ず並べて言う。 */
      rows: [
        { label: "指定した問題数", value: requested },
        { label: promptOnly ? "ご指示から作れる数" : "この資料で作れる数", value: available },
        { label: "足りない数", value: missing },
        { label: "理由", value: code || "unknown" }
      ]
    };
  }

  /* 「出題形式を広げる」で足す形式。資料の外へは出ない。
     いま使っている形式に無いものだけを足す（同じ形式を増やしても意味がない）。 */
  var ALL_TYPES = ["multiple_choice", "true_false", "short_answer", "descriptive"];
  function widenTypes(current) {
    var have = {};
    (current || []).forEach(function (t) { have[t] = true; });
    var add = ALL_TYPES.filter(function (t) { return !have[t]; });
    /* すでに全形式を使っているなら広げようがない。 */
    return add.length ? (current || []).concat(add) : null;
  }

  VQ2.shortfall = { describe: describe, widenTypes: widenTypes, REASONS: REASONS,
                    PROMPT_REASONS: PROMPT_REASONS,
                    reasonOf: reasonOf, ALL_TYPES: ALL_TYPES };
})(typeof globalThis !== "undefined" ? globalThis : window);
