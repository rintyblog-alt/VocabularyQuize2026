/* ══════════════════════════════════════════════════════════════════════
   core/validate/docs.js — 文書の 崩れ

   ★ 紙の大きさ・余白は body.page が持っている（workplace/paper.js）。
     ここでは その数字を使って **入るか入らないか** を計算する。
     見た目を AI に見せて聞かない。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});
  var V = VQW.validate;

  var 紙 = { a4: [210, 297], b5: [182, 257], a3: [297, 420], letter: [216, 279] };
  var mm = 3.7795;                     /* 1mm ≒ 3.78px（96dpi）*/

  function 紙の幅mm(page) {
    var s = 紙[String((page && page.size) || "a4").toLowerCase()] || 紙.a4;
    var 横 = String(page && page.orient) === "landscape";
    var w = 横 ? s[1] : s[0];
    var m = (page && page.margin) || { l: 25.4, r: 25.4 };
    return Math.max(20, w - (Number(m.l) || 0) - (Number(m.r) || 0));
  }
  function 紙の高さmm(page) {
    var s = 紙[String((page && page.size) || "a4").toLowerCase()] || 紙.a4;
    var 横 = String(page && page.orient) === "landscape";
    var h = 横 ? s[0] : s[1];
    var m = (page && page.margin) || { t: 25.4, b: 25.4 };
    return Math.max(20, h - (Number(m.t) || 0) - (Number(m.b) || 0));
  }

  /* 見かけの文字幅（全角 1 / 半角 0.5）。1 か所に閉じ込める。 */
  function 字数(s) {
    var t = String(s || ""), n = 0;
    for (var i = 0; i < t.length; i++) {
      var c = t.charCodeAt(i);
      n += (c < 0x80 || (c >= 0xff61 && c <= 0xff9f)) ? 0.5 : 1;
    }
    return n;
  }

  var 高さ = { heading: 12, paragraph: 8, listItem: 7, quote: 9, code: 8,
               callout: 10, todo: 7, table: 0, image: 0, divider: 6,
               pageBreak: 0, math: 12, field: 8, answerSpace: 0, toc: 10,
               caption: 6, section: 14 };

  function check(doc, content, o) {
    o = o || {};
    var 結 = V.空(), 出 = [];
    var page = (content && content.page) || (doc.root.attrs && doc.root.attrs.page) || {};
    var 幅mm = 紙の幅mm(page);
    var 本文pt = 10.5, 一行の字数 = Math.floor(幅mm / (本文pt * 0.3528));

    var 前の段 = 0, 空の連続 = 0, 見出しが1つでも = false;
    var 高さ計 = 0;

    (doc.root.children || []).forEach(function (n, i) {
      var t = VQW.ir.素(n.text || "");
      var どこ = VQW.ir.pathOf(doc.root, n.id);

      /* 見出しの飛び */
      if (n.type === "heading") {
        見出しが1つでも = true;
        var lv = Number((n.attrs || {}).level) || 1;
        if (前の段 && lv > 前の段 + 1) {
          出.push(V.warn("headingSkip", { nodeId: n.id, どこ: どこ,
            なに: "見出しが 見出し" + 前の段 + " から 見出し" + lv + " へ 飛んでいます。",
            どうする: "1 段ずつ 下げてください。" }));
        }
        前の段 = lv;
        if (!t.trim()) {
          出.push(V.err("emptyHeading", { nodeId: n.id, どこ: どこ,
            なに: "見出しが 空です。", どうする: "文を入れるか、消してください。" }));
        }
      }

      /* 空の段落が 続く */
      if ((n.type === "paragraph" || n.type === "listItem") && !t.trim()) {
        空の連続++;
        if (空の連続 >= 3) {
          出.push(V.warn("emptyRun", { nodeId: n.id, どこ: どこ,
            なに: "空のかたまりが " + 空の連続 + " 個 続いています。",
            どうする: "余白は 段落を空けるのではなく、余白の設定で作ってください。" }));
        }
      } else 空の連続 = 0;

      /* 解答欄の高さ */
      if (n.type === "answerSpace") {
        var 行 = Number((n.attrs || {}).lines) || 0;
        if (行 <= 0) {
          出.push(V.err("answerSpaceZero", { nodeId: n.id, どこ: どこ,
            なに: "解答欄の 行数が 0 です（書く所がありません）。",
            どうする: "lines に 1 以上を入れてください。" }));
        }
        高さ計 += 行 * 8 + 4;
      }

      /* 画像 */
      if (n.type === "image") {
        var a = n.attrs || {};
        if (!a.src) {
          出.push(V.err("imageMissing", { nodeId: n.id, どこ: どこ,
            なに: "画像が まだ選ばれていません。",
            どうする: "**画像は 人に選んでもらってください。**入れたと言わないこと。" }));
        }
        if (Number(a.width) > 100) {
          出.push(V.warn("imageWide", { nodeId: n.id, どこ: どこ,
            なに: "画像の幅が 100% を超えています（" + a.width + "%）。",
            どうする: "紙からはみ出します。100 以下にしてください。" }));
        }
        高さ計 += 60;
      }

      /* 表：列が多すぎて 紙に入らない */
      if (n.type === "table") {
        var 行数 = (n.children || []).length;
        var 列数 = ((n.children || [])[0] || { children: [] }).children.length;
        if (!行数 || !列数) {
          出.push(V.err("emptyTable", { nodeId: n.id, どこ: どこ,
            なに: "空の表です。", どうする: "行と列を入れてください。" }));
        } else {
          var ずれ = (n.children || []).filter(function (r) {
            return (r.children || []).length !== 列数;
          }).length;
          if (ずれ) {
            出.push(V.err("tableRagged", { nodeId: n.id, どこ: どこ,
              なに: "表の列数が そろっていません（" + ずれ + " 行）。",
              どうする: "すべての行を " + 列数 + " 列にしてください。" }));
          }
          /* いちばん長いマスが 1 列あたりの幅に入るか */
          var 一列mm = 幅mm / 列数;
          var 入る字 = Math.floor(一列mm / (9 * 0.3528));
          var 長い = null;
          (n.children || []).forEach(function (r) {
            (r.children || []).forEach(function (c) {
              var 幅 = 字数(VQW.ir.素(c.text));
              if (幅 > 入る字 * 3 && (!長い || 幅 > 長い.幅))
                長い = { 幅: 幅, id: c.id, t: VQW.ir.素(c.text) };
            });
          });
          if (長い) {
            出.push(V.warn("tableTooNarrow", { nodeId: 長い.id, どこ: どこ,
              なに: "列が " + 列数 + " 列だと 1 列 " + 入る字 + " 字ぶんしかなく、"
                + "「" + 長い.t.slice(0, 16) + "…」が 何行にも折り返します。",
              どうする: "列を減らすか、紙を横にしてください。" }));
          }
          高さ計 += 行数 * 7 + 4;
        }
      }

      if (n.type === "math") {
        高さ計 += 12;
      } else if (高さ[n.type] !== undefined && n.type !== "table" && n.type !== "image"
                 && n.type !== "answerSpace") {
        var 行2 = Math.max(1, Math.ceil(字数(t) / Math.max(8, 一行の字数)));
        高さ計 += 行2 * (高さ[n.type] || 8) / 1.5 + 2;
      }
      if (n.type === "pageBreak") 高さ計 = Math.ceil(高さ計 / 紙の高さmm(page)) * 紙の高さmm(page);
    });

    if ((doc.root.children || []).length >= 12 && !見出しが1つでも) {
      出.push(V.warn("noHeading", {
        なに: (doc.root.children || []).length + " 個の かたまりに 見出しが 0 個です。",
        どうする: "読みにくいので 見出しを入れてください。" }));
    }

    /* 指定ページ数に入るか（言われたときだけ見る） */
    var 見こみ = Math.max(1, Math.ceil(高さ計 / 紙の高さmm(page)));
    if (o.期待ページ数 && 見こみ > Number(o.期待ページ数)) {
      出.push(V.warn("pageOverflow", {
        なに: "見こみ " + 見こみ + " ページで、頼まれた " + o.期待ページ数 + " ページに 入りません。",
        どうする: "文を削るか、ページ数を 増やしてください。" }));
    }

    V.足す(結, 出);
    結.見こみページ = 見こみ;
    return 結;
  }

  VQW.validate = VQW.validate || {};
  VQW.validate.docs = { check: check, 字数: 字数, 紙の幅mm: 紙の幅mm, 紙の高さmm: 紙の高さmm };
})(typeof globalThis !== "undefined" ? globalThis : this);
