/* ══════════════════════════════════════════════════════════════════════
   core/doctype/exam.js — 問題用紙 / 解答用紙 / 解答解説

   ★ **問題は 作らない。**すでにある 問題エンジンの出した 問題 JSON
     （VQ2.qmodel の形）を **並べるだけ**（§6.6）。
     ここで問題を作り直すと、選択肢の数も 正解の有無も 保証が切れ、
     「A. ○○…」が また出る。
   ★ 同じ 1 つの並びから 3 つの紙を出す。別々に作ると 番号がずれる。
   ★ 選択肢の印は 既定で ア・イ・ウ・エ、縦に並べる。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});

  var 印 = {
    kana: ["ア", "イ", "ウ", "エ", "オ", "カ", "キ", "ク"],
    maru: ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧"],
    alpha: ["A", "B", "C", "D", "E", "F", "G", "H"]
  };

  function 文(v) { return v === undefined || v === null ? "" : String(v); }
  function 配(v) { return Array.isArray(v) ? v : []; }
  function b(type, text, o) {
    var x = { id: VQW.ir.wpId("b"), type: type, text: 文(text) };
    if (o) Object.keys(o).forEach(function (k) { x[k] = o[k]; });
    return x;
  }

  /* 記述の解答欄が いる形式か（選ぶだけの問いには 罫線を引かない） */
  function 書く形式(q) {
    var e = 文(q.engine);
    return ["short_answer", "long_answer", "numeric", "formula", "fill_blank",
            "essay", "proof", "calculation"].indexOf(e) >= 0
      || (!q.choices || !q.choices.length);
  }

  function 行数(q) {
    var e = 文(q.engine);
    if (e === "long_answer" || e === "essay" || e === "proof") return 6;
    if (e === "formula" || e === "calculation") return 4;
    return 1;
  }

  /* ══ 共通の 見出し（試験名・注意・氏名欄）══════════════════════ */
  function 頭(o, 紙) {
    o = o || {};
    var out = [];
    out.push(b("heading1", 文(o.試験名) || "テスト"));
    var 副 = [];
    if (o.学校) 副.push(文(o.学校));
    if (o.科目) 副.push(文(o.科目));
    if (o.実施日) 副.push(文(o.実施日));
    if (o.試験時間) 副.push(文(o.試験時間) + " 分");
    if (o.満点) 副.push("満点 " + 文(o.満点) + " 点");
    if (副.length) out.push(b("paragraph", 副.join("　／　")));

    /* 氏名・クラス・出席番号は **人が書く所**。値を入れない。 */
    ["クラス", "出席番号", "氏名"].forEach(function (k) {
      out.push(b("field", "", { key: k, label: k, dataType: "text",
        hint: k + " を書いてもらう欄です（こちらでは 埋めません）", region: "identity" }));
    });
    if (紙 === "exam" && o.注意) {
      out.push(b("heading3", "注意"));
      配(o.注意).forEach(function (t) { out.push(b("bullet", 文(t))); });
    }
    out.push(b("divider", ""));
    return out;
  }

  /* ══ 問題用紙 ═══════════════════════════════════════════════ */
  function 問題用紙(questions, o) {
    o = o || {};
    var 記 = 印[文(o.選択肢の印) || "kana"] || 印.kana;
    var out = 頭(o, "exam");
    var 解答は別紙 = o.解答は別紙 !== false;

    配(questions).forEach(function (q, i) {
      var 番 = q.questionNumber || q.number || (i + 1);
      var 配点 = (o.配点を出す !== false && q.points) ? "（" + q.points + " 点）" : "";
      out.push(b("heading3", "問 " + 番 + " " + 配点));
      if (文(q.instruction)) out.push(b("paragraph", 文(q.instruction)));
      if (文(q.context)) out.push(b("quote", 文(q.context)));
      out.push(b("paragraph", 文(q.prompt), { key: "q" + 番 }));

      配(q.choices).forEach(function (c, k) {
        out.push(b("bullet", (記[k] || String(k + 1)) + "．" + 文(c.text)));
      });
      配(q.orderItems).forEach(function (c, k) {
        out.push(b("bullet", (記[k] || String(k + 1)) + "．" + 文(c.text)));
      });

      if (!解答は別紙 && 書く形式(q))
        out.push(b("answerSpace", "", { lines: 行数(q), label: "問 " + 番, region: "answer" }));
    });
    return { blocks: out, page: 紙面(o) };
  }

  /* ══ 解答用紙 ═══════════════════════════════════════════════ */
  function 解答用紙(questions, o) {
    o = o || {};
    var out = 頭(o, "answer");
    out.push(b("heading2", "解答欄"));
    /* 番号は **試験全体の通し番号**（採点と つき合わせやすい） */
    配(questions).forEach(function (q, i) {
      var 番 = q.questionNumber || q.number || (i + 1);
      var 配点 = q.points ? "（" + q.points + " 点）" : "";
      out.push(b("heading4", "問 " + 番 + " " + 配点));
      out.push(b("answerSpace", "", { lines: 行数(q), label: "問 " + 番, region: "answer" }));
    });
    out.push(b("divider", ""));
    out.push(b("field", "", { key: "得点", label: "得点", dataType: "number",
      hint: "採点する人が 書きます", region: "score" }));
    return { blocks: out, page: 紙面(o) };
  }

  /* ══ 解答解説 ═══════════════════════════════════════════════ */
  function 解答解説(questions, o) {
    o = o || {};
    var 記 = 印[文(o.選択肢の印) || "kana"] || 印.kana;
    var out = 頭(o, "key");
    out.push(b("heading2", "解答と解説"));
    配(questions).forEach(function (q, i) {
      var 番 = q.questionNumber || q.number || (i + 1);
      out.push(b("heading3", "問 " + 番));
      out.push(b("paragraph", "正解: " + 正解の文(q, 記)));
      if (文(q.explanation)) out.push(b("paragraph", 文(q.explanation)));
      配(q.choices).forEach(function (c, k) {
        if (!文(c.explanation)) return;
        out.push(b("bullet", (記[k] || "") + "．" + 文(c.explanation)));
      });
    });
    return { blocks: out, page: 紙面(o) };
  }

  function 正解の文(q, 記) {
    var 選 = 配(q.choices);
    if (選.length) {
      var 当 = [];
      選.forEach(function (c, k) { if (c.isCorrect) 当.push(記[k] || String(k + 1)); });
      if (当.length) return 当.join("・");
    }
    if (配(q.correctOrder).length) {
      var 表 = {};
      配(q.orderItems).forEach(function (x, k) { 表[x.id] = 記[k] || String(k + 1); });
      return q.correctOrder.map(function (id) { return 表[id] || id; }).join(" → ");
    }
    var a = q.correctAnswer;
    if (Array.isArray(a)) return a.map(文).join("・");
    if (a && typeof a === "object") return JSON.stringify(a).slice(0, 80);
    if (文(a)) return 文(a);
    if (配(q.acceptedAnswers).length) return q.acceptedAnswers.join(" / ");
    return "（この形式は 解答が 別に決まります）";
  }

  function 紙面(o) {
    return { mode: "paper", size: 文(o.用紙 || "a4").toLowerCase(),
             orient: 文(o.向き || "portrait"),
             margin: { t: 20, r: 18, b: 20, l: 18 },
             header: "", footer: "", pageNumber: true };
  }

  /* ══ 3 枚 まとめて ═════════════════════════════════════════ */
  function 三枚(questions, o) {
    var qs = そろえる(questions);
    return {
      exam_paper: 問題用紙(qs, o),
      answer_sheet: 解答用紙(qs, o),
      answer_key: 解答解説(qs, o),
      問題数: qs.length,
      満点: qs.reduce(function (a, q) { return a + (Number(q.points) || 0); }, 0)
    };
  }

  /* 問題エンジンの そろえ直しを 通す（あるときだけ）。
     通さないと 選択肢の label や correctAnswer の形が まちまちになる。 */
  function そろえる(questions) {
    var M = root.VQ2 && VQ2.qmodel;
    return 配(questions).map(function (q) {
      if (M && typeof M.normalizeQuestion === "function") {
        try { return M.normalizeQuestion(q); } catch (e) {}
      }
      return q;
    });
  }

  VQW.doctype = VQW.doctype || {};
  VQW.doctype.exam = {
    問題用紙: 問題用紙, 解答用紙: 解答用紙, 解答解説: 解答解説,
    三枚: 三枚, そろえる: そろえる, 正解の文: 正解の文, 印: 印
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
