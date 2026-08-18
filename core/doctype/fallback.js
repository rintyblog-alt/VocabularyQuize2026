/* ══════════════════════════════════════════════════════════════════════
   core/doctype/fallback.js — 知らない書類の 扱い

   ★ **「知らない」と言えるようにすることが 最優先**（§6.3）。
     カタログが 5 個でも、正直に言えれば 使える。
     100 個あっても、知らないものを 知っているふりをすれば 信用されない。
   ★ 3 段
       exact … id か 別名に 一致        → ふつうに作る
       near  … parent をたどって 一般形  → **「一般的な○○の形式で作りました。
                                           △△特有の項目は入っていません」と画面に出す**
       none  … 無し                      → **「これは正式な○○の書式ではありません」**
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});

  function 文(v) { return v === undefined || v === null ? "" : String(v); }
  function 正規(s) {
    return 文(s).toLowerCase()
      .replace(/[ 　\-_・]/g, "")
      .replace(/[ぁ-ん]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) + 0x60); });
  }

  function 探す(名, kind) {
    var R = VQW.doctype.registry;
    var q = 正規(名);
    if (!q) return { match: "none", docType: null, なぜ: "書類の名前が 空です。" };

    var 候 = R.すべて().filter(function (d) { return !kind || d.kind === kind; });

    /* exact — id / displayName / aliases */
    for (var i = 0; i < 候.length; i++) {
      var d = 候[i];
      var 名前 = [d.id, d.displayName].concat(d.aliases || []);
      for (var j = 0; j < 名前.length; j++) {
        if (正規(名前[j]) === q) return { match: "exact", docType: d };
      }
    }
    /* exact — 含む（「給与明細書」で「給与明細」を引く） */
    for (var k = 0; k < 候.length; k++) {
      var d2 = 候[k];
      var 名前2 = [d2.id, d2.displayName].concat(d2.aliases || []);
      for (var m = 0; m < 名前2.length; m++) {
        var s = 正規(名前2[m]);
        if (s.length >= 2 && (q.indexOf(s) >= 0 || s.indexOf(q) >= 0))
          return { match: "exact", docType: d2 };
      }
    }

    /* near — 親をたどって 一般形が あるか。
       言葉の重なりで いちばん近いものを選び、その親（あれば）を使う。 */
    var 得 = null;
    候.forEach(function (d3) {
      var 名前3 = [d3.displayName].concat(d3.aliases || []).map(正規);
      var 点 = 0;
      名前3.forEach(function (s2) {
        for (var x = 0; x < q.length - 1; x++) if (s2.indexOf(q.substr(x, 2)) >= 0) 点++;
      });
      if (点 >= 2 && (!得 || 点 > 得.点)) 得 = { d: d3, 点: 点 };
    });
    if (得) {
      var 親 = 得.d.parent ? VQW.doctype.registry.get(得.d.parent) : null;
      var 使う = 親 || 得.d;
      return {
        match: "near", docType: 使う, 元: 得.d.id,
        画面に出す: "一般的な「" + 使う.displayName + "」の形式で作りました。"
          + "「" + 名 + "」に特有の項目は 入っていません。"
      };
    }

    return {
      match: "none", docType: null,
      画面に出す: "これは 正式な「" + 名 + "」の書式ではありません。"
        + "一般の文書として 作りました。項目や並びは ご自分で確かめてください。",
      つぎ: "正式な書式が要るなら、お手持ちの様式を 取り込んでください（その形を覚えます）。"
    };
  }

  /* 画面と 報告に 必ず出す一言。**黙って near / none にしない。** */
  function ことわり(res) {
    if (!res || res.match === "exact") return "";
    return res.画面に出す || "";
  }

  VQW.doctype = VQW.doctype || {};
  VQW.doctype.fallback = { 探す: 探す, ことわり: ことわり, 正規: 正規 };
})(typeof globalThis !== "undefined" ? globalThis : this);
