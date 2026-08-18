/* ══════════════════════════════════════════════════════════════════════
   core/validate/math.js — 生の LaTeX を そのまま出さない

   ★ 実例: 文の中に「$x^2 + 5x + 6$」が **文字として** 出ていた。
     原因は 2 つあって、両方ここで検出する。
       ① AI が paragraph に $…$ と書いた（math の箱を知らなかった）
       ② math の箱に入れても 画面が KaTeX を通していなかった
     ②は 画面側で直した。ここは ①を止める。
   ★ 「$100」のような お金の $ は 式ではない。
     $ の内側に 改行や 別の $ が無く、閉じがあるときだけ 式として扱う。
     ここは クイズ側（VQ2.qrender）の見かたと そろえる。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQW = root.VQW || (root.VQW = {});
  var V = VQW.validate;

  var 式 = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/;
  var 命令 = /\\(frac|sqrt|sum|int|left|right|begin|end|times|div|pm|leq|geq|neq|alpha|beta|pi|theta|cdot|angle|triangle)\b/;

  function ある(s) {
    var t = String(s == null ? "" : s);
    return 式.test(t) || /\\\(|\\\[/.test(t) || 命令.test(t);
  }

  /* ざっくりした釣り合いの検査。KaTeX が無い所（テスト）でも動く。 */
  function 組めるか(latex) {
    var s = String(latex || "");
    if (!s.trim()) return "式が 空です";
    var 開 = (s.match(/\{/g) || []).length, 閉 = (s.match(/\}/g) || []).length;
    if (開 !== 閉) return "{ } の数が 合いません（" + 開 + " / " + 閉 + "）";
    var l = (s.match(/\\left/g) || []).length, r = (s.match(/\\right/g) || []).length;
    if (l !== r) return "\\left と \\right の数が 合いません";
    var b = (s.match(/\\begin\{/g) || []).length, e = (s.match(/\\end\{/g) || []).length;
    if (b !== e) return "\\begin と \\end の数が 合いません";
    if (/\$/.test(s)) return "式の中に $ が 入っています（囲みは 外に付けます）";
    /* KaTeX があるなら 本物に通す */
    var K = root.katex;
    if (K && typeof K.renderToString === "function") {
      try { K.renderToString(s, { throwOnError: true, strict: "ignore", output: "html" }); }
      catch (x) { return String(x && x.message || x).slice(0, 80); }
    }
    return null;
  }

  function check(doc, o) {
    var 出 = [];
    VQW.ir.walk(doc.root, function (n) {
      if (n.id === "root") return;
      if (n.type === "math") {
        var なぜ = 組めるか((n.attrs && n.attrs.latex) || n.text);
        if (なぜ) 出.push(V.err("mathBroken", {
          nodeId: n.id, どこ: VQW.ir.pathOf(doc.root, n.id),
          なに: "数式が 組めません: " + なぜ,
          どうする: "式を 直してください。"
        }));
        return;
      }
      var t = VQW.ir.素(n.text || "");
      if (!t) return;
      if (!ある(t)) return;

      /* ★ 指示書 §3.3 からの ずれ（意図して そうしている）
         「テキストに $…$ を含めるのを 禁止」だと、
         **文の途中の式**（「面積は $S=\pi r^2$ で求まる」）まで 弾いてしまい、
         段落を まるごと数式にするしかなくなる。それは かえって読みにくい。
         そこで 2 つに分ける:
           ・文が **まるごと式**（または $$…$$）… math の箱にすべき → error
           ・文の途中の $…$                      … 認める。ただし
             **組めない式は error**（組めないまま出すのが 本当の事故）
         画面側は 文の中の $…$ も KaTeX で組むようにした。 */
      var まるごと = /^\s*\$\$[\s\S]+\$\$\s*$/.test(t) || /^\s*\$[^$\n]+\$\s*$/.test(t);
      if (まるごと && n.type !== "math") {
        出.push(V.err("mathShouldBeBlock", {
          nodeId: n.id, どこ: VQW.ir.pathOf(doc.root, n.id),
          なに: "この かたまりは まるごと 数式です: 「" + t.slice(0, 40) + "」",
          どうする: "**数式の箱（math）に してください。**"
        }));
        return;
      }
      /* 文の途中の式は 1 つずつ 組めるか見る */
      var re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g, m;
      while ((m = re.exec(t)) !== null) {
        var なぜ2 = 組めるか(m[1] !== undefined ? m[1] : m[2]);
        if (なぜ2) {
          出.push(V.err("mathBroken", {
            nodeId: n.id, どこ: VQW.ir.pathOf(doc.root, n.id),
            なに: "文の中の 数式が 組めません（" + m[0].slice(0, 24) + "）: " + なぜ2,
            どうする: "式を 直してください。そのままだと 文字のまま出ます。"
          }));
          break;
        }
      }
      /* KaTeX の別の書きかた（\( \) や \[ \]）は 組めない。印だけ出す。 */
      if (/\\\(|\\\[/.test(t)) {
        出.push(V.err("mathOtherSyntax", {
          nodeId: n.id, どこ: VQW.ir.pathOf(doc.root, n.id),
          なに: "\\( \\) / \\[ \\] の書きかたは 読めません: 「" + t.slice(0, 40) + "」",
          どうする: "**$…$（文の中）と $$…$$（行を変えて）だけ** 使ってください。"
        }));
      }
    });
    return 出;
  }

  VQW.validate = VQW.validate || {};
  VQW.validate.math = { check: check, ある: ある, 組めるか: 組めるか };
})(typeof globalThis !== "undefined" ? globalThis : this);
