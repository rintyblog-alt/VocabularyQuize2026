/* ══════════════════════════════════════════════════════════════════════
   core/validate/formula.js — 式の 規律

   ★ 合計・税額・小計は **必ず式**。値で書くと、元の数を直しても
     合計が古いまま残り、しかも誰も気づかない。
   ★ 検査
       ・式のしくじり（#REF! #VALUE! …）        error
       ・見ている先が 無い                       error
       ・SUM の範囲から **データの行が はみ出している**  error
       ・式は入っているのに 元の数が 空          error
       ・端数処理（ROUND）の 二重がけ            warning
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});
  var V = VQW.validate;

  var 番地 = /\$?([A-Z]{1,3})\$?(\d{1,5})/g;
  var 範囲 = /\$?([A-Z]{1,3})\$?(\d{1,5})\s*:\s*\$?([A-Z]{1,3})\$?(\d{1,5})/g;

  function 列番(s) {
    var c = 0;
    for (var i = 0; i < s.length; i++) c = c * 26 + (s.charCodeAt(i) - 64);
    return c;
  }
  function 列名(n) {
    var s = "";
    while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = ((n - r) / 26) | 0; }
    return s;
  }

  function 参照を拾う(f) {
    var s = String(f || ""), 出 = { 単: [], 範: [] };
    範囲.lastIndex = 0;
    var m, 使った = [];
    while ((m = 範囲.exec(s)) !== null) {
      出.範.push({ c1: 列番(m[1]), r1: +m[2], c2: 列番(m[3]), r2: +m[4], 元: m[0] });
      使った.push([m.index, m.index + m[0].length]);
    }
    番地.lastIndex = 0;
    while ((m = 番地.exec(s)) !== null) {
      var 中 = 使った.some(function (u) { return m.index >= u[0] && m.index < u[1]; });
      if (中) continue;
      出.単.push({ c: 列番(m[1]), r: +m[2], ref: m[1] + m[2] });
    }
    return 出;
  }

  function セル(sheetNode) {
    var m = Object.create(null);
    (sheetNode.children || []).forEach(function (c) {
      var ref = String((c.attrs || {}).ref || "").toUpperCase();
      if (ref) m[ref] = c;
    });
    return m;
  }
  function 中身あり(c) {
    if (!c) return false;
    if (c.type === "formulaCell") return true;
    return String(c.text || "").trim() !== "";
  }

  function check(doc, content, o) {
    var 出 = [];
    /* 式の答え。画面の式エンジンがあるときだけ 使う（無くても他は動く）。 */
    var 計算 = null;
    try {
      if (root.VQ2 && VQ2.workplace && VQ2.workplace.formula && content) 計算 = true;
    } catch (e) {}

    VQW.ir.walk(doc.root, function (sh) {
      if (sh.type !== "sheet") return;
      var 表 = セル(sh);
      var 値 = null;
      if (計算) {
        try {
          var 生 = (content.sheets || []).filter(function (x) { return x.id === sh.id; })[0];
          if (生) 値 = (VQ2.workplace.formula.recalc(生) || {}).values || null;
        } catch (e2) { 値 = null; }
      }

      Object.keys(表).forEach(function (ref) {
        var c = 表[ref];
        if (c.type !== "formulaCell") return;
        var f = String((c.attrs || {}).formula || "");
        var どこ = VQW.ir.pathOf(doc.root, c.id) + "（" + ref + "）";

        /* 答えが しくじりになっている */
        if (値 && /^#(REF|NAME|DIV\/0|VALUE|N\/A|NUM|CYCLE)/.test(String(値[ref]))) {
          出.push(V.err("formulaError", { nodeId: c.id, どこ: どこ,
            なに: ref + " = " + f + " の答えが " + 値[ref] + " です。",
            どうする: "式か 見ている先を 直してください。" }));
        }

        var 参 = 参照を拾う(f);

        /* 見ている先が 全部 空 */
        var 見た = 0, あり = 0;
        参.単.forEach(function (u) { 見た++; if (中身あり(表[u.ref])) あり++; });
        参.範.forEach(function (g) {
          for (var r = Math.min(g.r1, g.r2); r <= Math.max(g.r1, g.r2); r++)
            for (var cc = Math.min(g.c1, g.c2); cc <= Math.max(g.c1, g.c2); cc++) {
              見た++; if (中身あり(表[列名(cc) + r])) あり++;
            }
        });
        if (見た && !あり) {
          出.push(V.err("formulaEmptySource", { nodeId: c.id, どこ: どこ,
            なに: "式は入っているのに、見ている先が すべて 空です（" + ref + " = " + f + "）。",
            どうする: "**先に 数を入れてください。**空を掛けても 0 にしかなりません。" }));
        }

        /* SUM の範囲から データが はみ出している */
        if (/^=\s*(SUM|AVERAGE|COUNT|COUNTA|MAX|MIN)\s*\(/i.test(f) && 参.範.length === 1) {
          var g0 = 参.範[0];
          var c1 = Math.min(g0.c1, g0.c2), c2 = Math.max(g0.c1, g0.c2);
          var r1 = Math.min(g0.r1, g0.r2), r2 = Math.max(g0.r1, g0.r2);
          var 外 = [];
          for (var cc2 = c1; cc2 <= c2; cc2++) {
            /* ★ すぐ下だけ見ても 足りない。合計の行が 1 つ挟まっていると
               その先の データ行を 見落とす（実測で 落ちた）。
               式のマスは 飛ばして、下へ 5 行 まで さがす。 */
            for (var d = 1; d <= 5; d++) {
              var 下 = 列名(cc2) + (r2 + d), cell = 表[下];
              if (!cell) continue;
              if (cell.type === "formulaCell") continue;   /* 合計などは 飛ばす */
              if (!中身あり(cell)) continue;
              /* 数のときだけ 言う（「合計」などの 見出しは データではない） */
              if (/^-?[\d,]+(\.\d+)?$/.test(String(cell.text || "").trim())) 外.push(下);
              break;
            }
            var 上 = r1 > 1 ? 列名(cc2) + (r1 - 1) : null;
            if (上 && 中身あり(表[上]) && 表[上].type !== "formulaCell"
                && /^-?[\d,]+(\.\d+)?$/.test(String(表[上].text || "").trim())) 外.push(上);
          }
          if (外.length) {
            出.push(V.err("rangeMismatch", { nodeId: c.id, どこ: どこ,
              なに: ref + " = " + f + " の範囲から、中身のある行が はみ出しています（"
                + 外.slice(0, 4).join(" / ") + "）。",
              どうする: "範囲を データの最後まで 伸ばしてください。" }));
          }
        }

        /* 端数処理の 二重がけ */
        if (/ROUND\s*\(/i.test(f) && /^=\s*(SUM|ROUND)\s*\(/i.test(f)) {
          var 元がROUND = 参.範.some(function (g2) {
            for (var r3 = Math.min(g2.r1, g2.r2); r3 <= Math.max(g2.r1, g2.r2); r3++)
              for (var c3 = Math.min(g2.c1, g2.c2); c3 <= Math.max(g2.c1, g2.c2); c3++) {
                var x = 表[列名(c3) + r3];
                if (x && x.type === "formulaCell" && /ROUND\s*\(/i.test(String((x.attrs || {}).formula)))
                  return true;
              }
            return false;
          });
          if (元がROUND) {
            出.push(V.warn("doubleRound", { nodeId: c.id, どこ: どこ,
              なに: "行ごとに ROUND したものを、合計で もう一度 ROUND しています。",
              どうする: "どちらか 一方にしてください（1 円ずれる原因になります）。" }));
          }
        }
      });
    });
    return 出;
  }

  /* DocType の calculations 指定に対する検査（doctype.js から呼ぶ） */
  function 式であるべき(doc, ref, sheetNode) {
    var 表 = セル(sheetNode);
    var c = 表[String(ref).toUpperCase()];
    if (!c) return "そのマス（" + ref + "）が ありません";
    if (c.type !== "formulaCell") return "そのマス（" + ref + "）が 式ではありません（値が 直接 書かれています）";
    return null;
  }

  VQW.validate = VQW.validate || {};
  VQW.validate.formula = {
    check: check, 参照を拾う: 参照を拾う, 列名: 列名, 列番: 列番,
    式であるべき: 式であるべき
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
