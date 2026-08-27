/* ══════════════════════════════════════════════════════════════════════
   core/validate/slides.js — 発表資料の 崩れ

   ★ デザインエンジン（client/design/gate.js）が **すでに** 同じことを
     もっと細かくやっている。二重に持つと 片方だけ直して食い違うので、
     **あるときは そちらを使う**。ここは 無いときの受け皿と、
     デザインエンジンを通していない古い資料のための検査。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});
  var V = VQW.validate;

  var 画布 = { "16:9": [960, 540], "4:3": [960, 720] };

  function 重なり(a, b) {
    var x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    var y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    return x * y;
  }
  function 箱(n) {
    var a = n.attrs || {};
    return { x: Number(a.x) || 0, y: Number(a.y) || 0,
             w: Number(a.w) || 0, h: Number(a.h) || 0 };
  }

  function check(doc, content, o) {
    o = o || {};
    var 結 = V.空(), 出 = [];
    var 比 = String((doc.root.attrs || {}).ratio || "16:9");
    var 板 = 画布[比] || 画布["16:9"];
    var W = 板[0], H = 板[1];

    /* デザインエンジンで作った資料は そちらの Gate が正。文字数だけ見る。 */
    var エンジン製 = !!(doc.root.attrs && doc.root.attrs.designSeed);

    (doc.root.children || []).forEach(function (p, pi) {
      var els = (p.children || []).filter(function (e) {
        var a = e.attrs || {};
        return !a.装飾;
      });
      var どこ = "ページ" + (pi + 1);

      /* 1 枚あたりの文字数 */
      var 字 = 0, 英 = 0, 全 = 0;
      (p.children || []).forEach(function (e) {
        var t = VQW.ir.素(e.text || "");
        字 += t.length;
        for (var i = 0; i < t.length; i++) {
          var c = t.charCodeAt(i);
          if (c < 0x80) 英++; else 全++;
        }
      });
      var 上限 = 全 >= 英 ? 200 : 400;
      if (字 > 上限) {
        出.push(V.warn("charDensity", { nodeId: p.id, どこ: どこ,
          なに: "1 枚に " + 字 + " 字あります（目安 " + 上限 + " 字）。",
          どうする: "枚を分けるか、文を削ってください。" }));
      }

      if (エンジン製) return;               /* ここから先は Gate の担当 */

      els.forEach(function (e, i) {
        var b = 箱(e), どこ2 = どこ + " / " + VQW.ir.名(e) + (i + 1);
        /* はみ出し */
        if (b.x < -1 || b.y < -1 || b.x + b.w > W + 1 || b.y + b.h > H + 1) {
          出.push(V.err("boundsOverflow", { nodeId: e.id, どこ: どこ2,
            なに: "画面（" + W + "×" + H + "）から はみ出しています（"
              + Math.round(b.x) + "," + Math.round(b.y) + " " + Math.round(b.w) + "×" + Math.round(b.h) + "）。",
            どうする: "中へ入れてください。" }));
        }
        /* 小さすぎる字 */
        var s = Number((e.attrs || {}).size);
        if (e.type === "textFrame" && s && s < 14) {
          出.push(V.err("minFontSize", { nodeId: e.id, どこ: どこ2,
            なに: "文字が " + s + "px しかありません（14px 未満）。",
            どうする: "14px 以上にしてください。" }));
        }
        /* 重なり */
        for (var j = i + 1; j < els.length; j++) {
          var b2 = 箱(els[j]);
          var 面 = 重なり(b, b2);
          if (面 <= 0) continue;
          var 小 = Math.min(b.w * b.h, b2.w * b2.h);
          if (小 > 0 && 面 / 小 > 0.2) {
            出.push(V.err("overlap", { nodeId: e.id, どこ: どこ2,
              なに: VQW.ir.名(e) + " と " + VQW.ir.名(els[j]) + " が "
                + Math.round(面 / 小 * 100) + "% 重なっています。",
              どうする: "どちらかを ずらしてください。" }));
            break;
          }
        }
      });

      if (!els.length) {
        出.push(V.warn("emptyPage", { nodeId: p.id, どこ: どこ,
          なに: "何も置かれていない ページです。",
          どうする: "中身を入れるか、消してください。" }));
      }
    });

    V.足す(結, 出);
    return 結;
  }

  VQW.validate = VQW.validate || {};
  VQW.validate.slides = { check: check, 重なり: 重なり };
})(typeof globalThis !== "undefined" ? globalThis : this);
