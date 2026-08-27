/* ══════════════════════════════════════════════════════════════════════
   core/validate/doctype.js — 書式に 合っているか

   ★ 見かた（§7.5）
       ・fillPolicy が user_input **以外**の必須欄が 埋まっているか
       ・user_input の欄が **記入欄として 在るか**
         （空なのは error ではない。**捏造されているほうが error**）
       ・regions がすべて あるか
       ・calculations の指す所が **式** になっているか
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});
  var V = VQW.validate;

  function 文(v) { return v === undefined || v === null ? "" : String(v); }

  /* 欄が 書類の中に 在るか。key / label のどちらでも引く。 */
  function 欄をさがす(doc, f) {
    var 当 = [];
    VQW.ir.walk(doc.root, function (n) {
      var a = n.attrs || {};
      if (文(a.key) && 文(a.key) === 文(f.key)) { 当.push(n); return; }
      var t = VQW.ir.素(n.text || "");
      var l = VQW.ir.素(a.label || "");
      if (f.label && (l === f.label || t === f.label
          || t.indexOf(f.label) === 0)) 当.push(n);
    });
    return 当;
  }

  function 埋まっている(n) {
    if (!n) return false;
    var a = n.attrs || {};
    if (n.type === "formulaCell") return true;
    if (VQW.ir.空箱[n.type]) return 文(n.text).trim() !== "";
    var t = VQW.ir.素(n.text || "");
    /* 「氏名：」だけの見出しは 埋まっていない */
    return t.replace(/[：:\s_＿]/g, "").length > 文(a.label || "").length;
  }

  function check(doc, content, dt, o) {
    var 結 = V.空(), 出 = [];
    if (!dt) return 結;

    /* draft の書式は 使うたびに 断りを入れる */
    if (dt.status !== "approved") {
      出.push(V.warn("doctypeDraft", {
        なに: "「" + dt.displayName + "」は **まだ承認されていない書式**です。",
        どうする: "項目や並びを ご自分で確かめてください。" }));
    }

    (dt.requiredFields || []).forEach(function (f) {
      var 当 = 欄をさがす(doc, f);
      if (!当.length) {
        出.push(V.err("fieldMissing", {
          なに: "必須の項目「" + (f.label || f.key) + "」が ありません。",
          どうする: f.fillPolicy === "user_input"
            ? "**空欄（記入欄）として** 置いてください。値は 入れないこと。"
            : "項目を 足してください。" }));
        return;
      }
      if (f.fillPolicy === "user_input") {
        /* 空でよい。ただし **記入欄として** 在ること。
           値が入っていたら、それは 捏造の疑い。 */
        var 箱 = 当.filter(function (n) { return VQW.ir.空箱[n.type]; });
        if (!箱.length) {
          出.push(V.err("fieldNotInput", { nodeId: 当[0].id,
            どこ: VQW.ir.pathOf(doc.root, 当[0].id),
            なに: "「" + (f.label || f.key) + "」が 記入欄になっていません。",
            どうする: "人が入れる項目なので、**空欄＋入力ヒント**にしてください。" }));
        } else if (!o || o.値の捏造を見る !== false) {
          箱.forEach(function (n) {
            var t = VQW.ir.素(n.text || "");
            if (t.trim() && !(n.attrs || {}).userEntered) {
              出.push(V.err("fabricated", { nodeId: n.id,
                どこ: VQW.ir.pathOf(doc.root, n.id),
                なに: "「" + (f.label || f.key) + "」に **こちらが作った値** が入っています（「"
                  + t.slice(0, 24) + "」）。",
                どうする: "**持っていない値は 埋めないでください。**空欄に戻します。" }));
            }
          });
        }
      } else if (f.fillPolicy === "llm_allowed" || f.fillPolicy === "derived") {
        var ある = 当.some(埋まっている);
        if (!ある) {
          出.push(V.err("fieldEmpty", { nodeId: 当[0].id,
            どこ: VQW.ir.pathOf(doc.root, 当[0].id),
            なに: "「" + (f.label || f.key) + "」が 空のままです。",
            どうする: f.fillPolicy === "derived"
              ? "式で 出してください。" : "中身を 書いてください。" }));
        }
      }
    });

    /* regions */
    (dt.regions || []).forEach(function (r) {
      var 名 = 文(r.id || r.name);
      if (!名) return;
      var ある = false;
      VQW.ir.walk(doc.root, function (n) {
        var a = n.attrs || {};
        if (文(a.region) === 名 || 文(a.key) === 名) ある = true;
      });
      if (!ある && r.required !== false) {
        出.push(V.warn("regionMissing", {
          なに: "領域「" + (r.label || 名) + "」が ありません。",
          どうする: "書式どおりに 並べてください。" }));
      }
    });

    /* calculations は **式** であること */
    if (dt.kind === "sheets" && V.formula) {
      var シート = [];
      VQW.ir.walk(doc.root, function (n) { if (n.type === "sheet") シート.push(n); });
      (dt.calculations || []).forEach(function (c) {
        var ref = 文(c.target || c.key);
        if (!/^[A-Z]+\d+$/i.test(ref)) return;
        var なぜ = シート.length ? V.formula.式であるべき(doc, ref, シート[0]) : "シートがありません";
        if (なぜ) {
          出.push(V.err("calcNotFormula", {
            なに: (c.label || ref) + " は 計算で出す所です: " + なぜ,
            どうする: "「=" + 文(c.formula) + "」のように **式**で入れてください。" }));
        }
      });
    }

    V.足す(結, 出);
    return 結;
  }

  VQW.validate = VQW.validate || {};
  VQW.validate.doctype = { check: check, 欄をさがす: 欄をさがす, 埋まっている: 埋まっている };
})(typeof globalThis !== "undefined" ? globalThis : this);
