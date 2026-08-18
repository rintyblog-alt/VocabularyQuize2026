/* ══════════════════════════════════════════════════════════════════════
   core/math/spec.js — MockSpec を **数式ごと** 通す関所

   ★ ここが Quick Mock の 唯一の入口。紙面を作る前に 必ず通す。
       ① 本文の $…$ などを 抜き出して spec.__math（math ノードの表）へ移す
       ② 表を まとめて SVG に固める（実測の 幅・高さ も入る）
       ③ 本文に $ \( \[ が 残っていないか 数える → 残っていたら 崩れ

   ★ **大問の階層は 潰さない。**sections[].questions[] のまま、
     文字列のフィールドだけを 書き換える。

   ★ 何度通しても 同じ（すでに参照記号になっている文は 触らない）。
     作り直し（recompile）で 二重に抜かないため。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQM = root.VQM || (root.VQM = {});

  /* 数式が入りうる 文字列のフィールド。**ここに無い所は 触らない。** */
  var 設問の文 = ["prompt", "instruction", "context", "explanation", "stem", "text"];
  var 大問の文 = ["title", "instruction", "description", "text"];

  function 文(v) { return v === undefined || v === null ? "" : String(v); }
  function 配(v) { return Array.isArray(v) ? v : []; }

  /* 1 つの文字列を 通す。すでに参照記号だけなら そのまま返す。 */
  function 一本(obj, key, 表, 種) {
    if (!obj || typeof obj[key] !== "string") return 0;
    var 前 = obj[key];
    if (!前) return 0;
    /* 生の数式が 1 つも無いなら 触らない（何度通しても同じにする） */
    if (!VQM.parse.残り(前).length) return 0;
    obj[key] = VQM.parse.抜く(前, 表, 種);
    return 1;
  }

  /* ══ ① 抜き出し ══════════════════════════════════════════════ */
  function 抜く(spec) {
    if (!spec || typeof spec !== "object") return { 表: {}, 抜いた: 0 };
    var 表 = (spec.__math && typeof spec.__math === "object") ? spec.__math : {};
    var n = 0;

    大問の文.forEach(function (k) { n += 一本(spec, k, 表, "s"); });
    if (spec.cover) 大問の文.forEach(function (k) { n += 一本(spec.cover, k, 表, "c"); });
    配(spec.notices).forEach(function (x, i) {
      if (typeof x === "string") {
        if (VQM.parse.残り(x).length) { spec.notices[i] = VQM.parse.抜く(x, 表, "n"); n++; }
      } else 大問の文.forEach(function (k) { n += 一本(x, k, 表, "n"); });
    });

    配(spec.sections).forEach(function (sec) {
      大問の文.forEach(function (k) { n += 一本(sec, k, 表, "s"); });
      配(sec.contentBlocks).forEach(function (cb) { n += 一本(cb, "text", 表, "b"); });
      配(sec.questions).forEach(function (q) { n += 設問を通す(q, 表); });
    });
    /* 大問を持たない形（questions が直下）も ある。 */
    配(spec.questions).forEach(function (q) { n += 設問を通す(q, 表); });

    spec.__math = 表;
    return { 表: 表, 抜いた: n };
  }

  function 設問を通す(q, 表) {
    if (!q) return 0;
    var n = 0;
    設問の文.forEach(function (k) { n += 一本(q, k, 表, "q"); });
    配(q.choices).forEach(function (c) { n += 一本(c, "text", 表, "ch"); n += 一本(c, "label", 表, "ch"); });
    配(q.orderItems).forEach(function (c) { n += 一本(c, "text", 表, "or"); });
    配(q.blanks).forEach(function (c) { n += 一本(c, "text", 表, "bl"); });
    配(q.contentBlocks).forEach(function (c) { n += 一本(c, "text", 表, "cb"); });
    配(q.sourceReferences).forEach(function (c) { n += 一本(c, "text", 表, "sr"); });
    if (q.pairs) {
      配(q.pairs.left).forEach(function (c) { n += 一本(c, "text", 表, "pl"); });
      配(q.pairs.right).forEach(function (c) { n += 一本(c, "text", 表, "pr"); });
    }
    /* 正解の文字列にも 式が入る（数値・数式の形式）。紙には出ないが、
       解答解説には出るので 同じように 通す。 */
    if (typeof q.correctAnswer === "string") n += 一本(q, "correctAnswer", 表, "an");
    配(q.acceptedAnswers).forEach(function (v, i) {
      if (typeof v === "string" && VQM.parse.残り(v).length) {
        q.acceptedAnswers[i] = VQM.parse.抜く(v, 表, "an"); n++;
      }
    });
    配(q.children).forEach(function (c) { n += 設問を通す(c, 表); });
    return n;
  }

  /* ══ ③ 残っていないか（純粋関数・AI を使わない）═══════════════ */
  function 検査(spec) {
    var 崩 = [], 気 = [];
    function 見る(どこ, s) {
      var r = VQM.parse.残り(s);
      if (r.length) {
        崩.push({ code: "rawLatex", どこ: どこ,
          なに: "本文に 生の数式の記号が 残っています（" + r.join(" / ") + "）",
          中身: 文(s).slice(0, 80) });
        return;
      }
      /* ★ $ で囲まれていない 生の LaTeX（実測で見つけた 見逃し）。
         紙には そのままの文字が出るのに、上の検査は 通ってしまう。
         勝手に数式へ変えると 取り違えるので、**気になる所**として出す。 */
      var 生 = VQM.parse.区切りの無い式(s);
      if (生.length) {
        気.push({ code: "bareLatex", どこ: どこ,
          なに: "数式の命令が $ で囲まれずに 書かれています（" + 生.slice(0, 4).join(" / ")
            + "）。このままだと 文字として 紙に出ます",
          中身: 文(s).slice(0, 80) });
      }
    }
    function 設問(q, どこ) {
      if (!q) return;
      設問の文.forEach(function (k) { if (typeof q[k] === "string") 見る(どこ + "/" + k, q[k]); });
      配(q.choices).forEach(function (c, i) { 見る(どこ + "/選択肢" + (i + 1), 文(c.text)); });
      配(q.children).forEach(function (c, i) { 設問(c, どこ + "-" + (i + 1)); });
    }
    大問の文.forEach(function (k) { if (typeof spec[k] === "string") 見る("表題/" + k, spec[k]); });
    配(spec.sections).forEach(function (sec, si) {
      大問の文.forEach(function (k) { if (typeof sec[k] === "string") 見る("大問" + (si + 1) + "/" + k, sec[k]); });
      配(sec.questions).forEach(function (q, qi) { 設問(q, "大問" + (si + 1) + "-問" + (qi + 1)); });
    });
    配(spec.questions).forEach(function (q, qi) { 設問(q, "問" + (qi + 1)); });

    /* 組めなかった式 */
    var 表 = spec.__math || {};
    Object.keys(表).forEach(function (id) {
      var n = 表[id];
      if (n && n.だめ) {
        崩.push({ code: "mathBroken", どこ: id,
          なに: "数式を 組めませんでした（" + n.だめ + "）", 中身: 文(n.latex).slice(0, 80) });
      }
    });
    return { errors: 崩, warnings: 気 };
  }

  /* ══ はみ出し（実測の幅で 見る）═══════════════════════════════
     使える幅（px）を渡すと、それを超える式を 返す。推定していない。 */
  function はみ出し(spec, 使える幅px) {
    var 表 = (spec && spec.__math) || {};
    var 幅 = Number(使える幅px) || 0;
    var 出 = [];
    if (!幅) return 出;
    Object.keys(表).forEach(function (id) {
      var n = 表[id];
      if (!n || !n.renderedWidth) return;
      if (n.renderedWidth > 幅) {
        出.push({ code: "mathOverflow", どこ: id,
          なに: "数式が 紙の幅を 超えます（" + Math.round(n.renderedWidth) + "px / 使える幅 "
            + Math.round(幅) + "px）",
          中身: 文(n.latex).slice(0, 60), 幅: n.renderedWidth, 使える幅: 幅 });
      }
    });
    return 出;
  }

  /* ══ 通し（① → ② → ③）═══════════════════════════════════════
     戻り { 抜いた, 組んだ, errors, warnings } */
  function 通す(spec, o) {
    o = o || {};
    var r = 抜く(spec);
    if (!Object.keys(r.表).length) {
      return Promise.resolve({ 抜いた: 0, 組んだ: 0, errors: 検査(spec).errors, warnings: [] });
    }
    return VQM.svg.仕込む(r.表, { 文字px: o.文字px || 16 }).then(function (s) {
      var 検 = 検査(spec);
      return { 抜いた: r.抜いた, 組んだ: s.組んだ, 組めなかった: s.だめ,
               errors: 検.errors, warnings: 検.warnings };
    });
  }

  VQM.spec = { 通す: 通す, 抜く: 抜く, 検査: 検査, はみ出し: はみ出し,
               設問の文: 設問の文, 大問の文: 大問の文 };
})(typeof globalThis !== "undefined" ? globalThis : this);
