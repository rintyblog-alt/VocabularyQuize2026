/* ══════════════════════════════════════════════════════════════════════
   core/validate/placeholder.js — 埋めていない所を そのまま出さない

   ★ 実例:「A. ○○...  B. ○○...」「株式会社○○」「（ここに記入）」
   ★ 誤って弾かないための決まり（§7.1）
     ・**人が自分で入れた値**は 見ない（attrs.userEntered / 取り込み由来）
     ・**値をまだ持っていない箱**（field / inputCell / answerSpace）は 見ない。
       空なのは 正しい。捏造されているほうが 間違い。
     ・「○○商店」と 本当に書きたい場合があるので、
       **人が入れた値だけは 例外なく通す**。AI が書いた所だけ見る。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});
  var V = VQW.validate;

  /* 印。増やせる並びとして持つ（コードの奥に埋め込まない）。 */
  var 印 = [
    { re: /[○〇]{2,}/, 名: "○○" },
    { re: /[△▲]{2,}/, 名: "△△" },
    { re: /[□■]{2,}/, 名: "□□" },
    { re: /[×✕]{3,}/, 名: "×××" },
    { re: /[・･]{3,}/, 名: "・・・" },
    { re: /\bX{3,}\b/i, 名: "XXX" },
    { re: /\bY{3,}\b/i, 名: "YYY" },
    { re: /\bZ{3,}\b/i, 名: "ZZZ" },
    { re: /lorem\s+ipsum/i, 名: "Lorem ipsum" },
    { re: /（\s*ここに[^）]*）|\(\s*ここに[^)]*\)/, 名: "（ここに…）" },
    { re: /（[^）]*記入[^）]*）|\([^)]*記入[^)]*\)/, 名: "（…記入…）" },
    { re: /（[^）]*入力[^）]*）|\([^)]*入力[^)]*\)/, 名: "（…入力…）" },
    { re: /【[^】]*】のところ/, 名: "【…】のところ" },
    { re: /\bTBD\b/i, 名: "TBD" },
    { re: /(^|[\s、。：:])未定([\s、。]|$)/, 名: "未定" },
    { re: /未記入/, 名: "未記入" },
    { re: /(^|[\s、。：:])サンプル([\s、。]|$)/, 名: "サンプル" },
    { re: /(^|[\s、。：:])ダミー/, 名: "ダミー" },
    { re: /例）\s*$/, 名: "例）だけ" },
    { re: /〜など\.{3}|…など…/, 名: "〜など…" },
    { re: /\bplaceholder\b/i, 名: "placeholder" }
  ];

  /* 見なくてよい節点 */
  function 見ない(n) {
    if (!n) return true;
    if (VQW.ir.空箱[n.type]) return true;                 /* 空でよい箱 */
    var a = n.attrs || {};
    if (a.userEntered === true) return true;              /* 人が入れた */
    if (a.fromUpload === true) return true;               /* 取り込み由来 */
    if (a.placeholderOk === true) return true;
    return false;
  }

  function check(doc, o) {
    o = o || {};
    var 出 = [];
    VQW.ir.walk(doc.root, function (n) {
      if (n.id === "root" || 見ない(n)) return;
      var t = VQW.ir.素(n.text || "");
      if (!t.trim()) return;
      for (var i = 0; i < 印.length; i++) {
        if (!印[i].re.test(t)) continue;
        出.push(V.err("placeholder", {
          nodeId: n.id, どこ: VQW.ir.pathOf(doc.root, n.id),
          なに: "埋めていない印「" + 印[i].名 + "」が 残っています: 「" + t.slice(0, 40) + "」",
          どうする: "本当の値を入れるか、**値がまだ無いなら 記入欄（空欄＋入力ヒント）にしてください。**"
        }));
        break;
      }
    });
    return 出;
  }

  /* 1 つの文字列だけ調べる（生成の途中で使う） */
  function ある(s) {
    var t = VQW.ir.素(s);
    for (var i = 0; i < 印.length; i++) if (印[i].re.test(t)) return 印[i].名;
    return null;
  }

  VQW.validate = VQW.validate || {};
  VQW.validate.placeholder = { check: check, ある: ある, 印: 印 };
})(typeof globalThis !== "undefined" ? globalThis : this);
