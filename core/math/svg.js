/* ══════════════════════════════════════════════════════════════════════
   core/math/svg.js — 数式を **SVG に固める**

   ★ なぜ SVG か（実測で決めた）
     紙面は pdf/renderer.js が作った HTML を **新しい窓へ document.write して
     window.print()** するだけ（renderer.js の print()）。その HTML の <head> は
     <meta charset> と <style> しか無く、link も script も無い。
     つまり **CDN の KaTeX は 印刷窓には 絶対に届かない。**
     Web フォントに頼る組み方は、そこで必ず崩れる。
     SVG にパスとして固めてしまえば、フォントも通信も要らない。

   ★ なぜ MathJax か
     KaTeX の output は html / mathml / htmlAndMathml の 3 つだけで、
     **SVG を出せない。** SVG を出せるのは MathJax の tex-svg だけ。
     自前配信（client/vendor/mathjax/tex-svg-full.js）。CDN は使わない。

   ★ fontCache は 'local'
     既定（'global'）だと 字形が 別の <defs> に置かれ、SVG 単体では 描けない。
     'local' にすると **1 つの SVG が 自分の <defs> を持つ**（実測で確認）。

   ★ 大きさは **viewBox から出す**。推定しない。
     MathJax の viewBox は 1000 単位 = 1em（実測で確かめた:
     高さ 4.586ex の式の viewBox 高が 2027 → 2.027em、4.586 × 0.442 = 2.027）。
       幅px = viewBox幅 / 1000 × 文字の大きさpx
       高px = viewBox高 / 1000 × 文字の大きさpx
     これを 行高・枠高・はみ出しの判定に使う。

   ★ 和文（\text{それ以外}）だけは <text> 要素で出る（パスにならない）。
     そこへ **和文の書体を はっきり差し込む**。入れないと 印刷窓で
     既定書体になり、字が変わる。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQM = root.VQM || (root.VQM = {});

  var 置き場 = "/vendor/mathjax/tex-svg-full.js";
  var 和文 = "'Hiragino Mincho ProN','Yu Mincho','Noto Serif JP',serif";
  var 待ち = null;                       /* 読み込みの約束（1 回だけ） */
  var 覚え = Object.create(null);        /* latex+display → 結果 */

  function 文(v) { return v === undefined || v === null ? "" : String(v); }

  /* ══ 読み込み（数式が出てきたときだけ 読む）═══════════════════ */
  function 用意() {
    if (待ち) return 待ち;
    待ち = new Promise(function (done, ng) {
      try {
        if (root.MathJax && root.MathJax.tex2svgPromise) { done(root.MathJax); return; }
        /* 設定は **読み込む前**に置く。あとから置いても効かない。 */
        root.MathJax = root.MathJax || {};
        root.MathJax.svg = { fontCache: "local", displayAlign: "left", displayIndent: "0" };
        root.MathJax.options = { enableMenu: false };
        root.MathJax.startup = { typeset: false };
        var s = root.document.createElement("script");
        s.src = 置き場;
        s.async = true;
        s.onload = function () {
          var n = 0;
          var 待つ = function () {
            if (root.MathJax && root.MathJax.tex2svgPromise) return done(root.MathJax);
            if (n++ > 200) return ng(new Error("MATHJAX_SLOW"));
            root.setTimeout(待つ, 25);
          };
          待つ();
        };
        s.onerror = function () { ng(new Error("MATHJAX_MISSING")); };
        root.document.head.appendChild(s);
      } catch (e) { ng(e); }
    });
    return 待ち;
  }

  /* ══ viewBox を読む ═══════════════════════════════════════════ */
  function 箱を読む(svg) {
    var m = /viewBox="([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)"/.exec(文(svg));
    if (!m) return null;
    return { x: Number(m[1]), y: Number(m[2]), w: Number(m[3]), h: Number(m[4]) };
  }

  /* SVG の 幅・高さ・下がり を **em** に書き直す。
     もとは ex 単位。ex は 書体で変わるので、印刷窓（書体が違う）でずれる。
     em なら 1000 単位＝1em の約束から そのまま計算できる。 */
  function 直す(svg, o) {
    o = o || {};
    var 箱 = 箱を読む(svg);
    if (!箱) return svg;
    var 幅 = 箱.w / 1000, 高 = 箱.h / 1000;
    var 下がり = (箱.y + 箱.h) / 1000;          /* ベースラインより下の量 */
    var s = 文(svg);
    s = s.replace(/\swidth="[^"]*"/, ' width="' + 幅.toFixed(4) + 'em"');
    s = s.replace(/\sheight="[^"]*"/, ' height="' + 高.toFixed(4) + 'em"');
    /* もとの style（vertical-align: -1.686ex）を em で置き直す。
       display のときは 行の中に置かないので 下がりは付けない。 */
    var st = o.display
      ? "display:block;margin:0.35em 0;max-width:100%"
      : "vertical-align:" + (-下がり).toFixed(4) + "em";
    if (/\sstyle="[^"]*"/.test(s)) s = s.replace(/\sstyle="[^"]*"/, ' style="' + st + '"');
    else s = s.replace(/<svg /, '<svg style="' + st + '" ');
    /* 和文は <text> で出る。**書体を差し込む。**入れないと 印刷窓で字が変わる。 */
    if (s.indexOf("<text") >= 0) {
      s = s.replace(/<text /g, '<text font-family="' + 和文 + '" ');
    }
    /* 色は 本文に合わせる（既定は currentColor のまま）。 */
    if (s.indexOf("currentColor") < 0) s = s.replace(/<svg /, '<svg fill="currentColor" stroke="currentColor" ');
    return s;
  }

  /* ══ 1 つ組む ════════════════════════════════════════════════
     戻り { svg, 幅em, 高em, 下がりem, だめ } */
  function 組む(latex, display) {
    var 鍵 = (display ? "B|" : "I|") + 文(latex);
    if (覚え[鍵]) return Promise.resolve(覚え[鍵]);
    return 用意().then(function (MJ) {
      var node;
      try {
        MJ.texReset();
        node = MJ.tex2svg(文(latex), { display: !!display });
      } catch (e) {
        return (覚え[鍵] = { だめ: "組めませんでした", latex: 文(latex) });
      }
      var el = node && node.querySelector ? node.querySelector("svg") : null;
      if (!el) return (覚え[鍵] = { だめ: "組めませんでした", latex: 文(latex) });
      var 生 = el.outerHTML;
      var 壊れ = /data-mjx-error|<merror/.test(生);
      var 箱 = 箱を読む(生) || { x: 0, y: 0, w: 0, h: 0 };
      var 出 = {
        svg: 直す(生, { display: !!display }),
        幅em: 箱.w / 1000, 高em: 箱.h / 1000, 下がりem: (箱.y + 箱.h) / 1000,
        display: !!display, latex: 文(latex)
      };
      if (壊れ) 出.だめ = "式の書き方が おかしい";
      覚え[鍵] = 出;
      return 出;
    }).catch(function (e) {
      return (覚え[鍵] = { だめ: String((e && e.message) || e).slice(0, 60), latex: 文(latex) });
    });
  }

  /* ══ 表をまとめて組む（parse.抜く で作った表をそのまま渡す）══ */
  function 仕込む(表, o) {
    o = o || {};
    var 文字px = Number(o.文字px) || 16;
    var ids = Object.keys(表 || {});
    if (!ids.length) return Promise.resolve({ 組んだ: 0, だめ: [] });
    var だめ = [];
    return ids.reduce(function (p, id) {
      return p.then(function () {
        var n = 表[id];
        if (!n || n.svg) return null;
        return 組む(n.latex, n.display).then(function (r) {
          if (r.だめ) { n.だめ = r.だめ; だめ.push({ id: id, latex: n.latex, なぜ: r.だめ }); }
          n.svg = r.svg || "";
          n.幅em = r.幅em || 0; n.高em = r.高em || 0; n.下がりem = r.下がりem || 0;
          /* **実測の px。**推定ではない。行高・枠高・はみ出しの判定に使う。 */
          n.renderedWidth = Math.round((r.幅em || 0) * 文字px * 100) / 100;
          n.renderedHeight = Math.round((r.高em || 0) * 文字px * 100) / 100;
          return null;
        });
      });
    }, Promise.resolve()).then(function () {
      return { 組んだ: ids.length, だめ: だめ };
    });
  }

  /* ══ 同期で 1 つ組む ═══════════════════════════════════════════
     ★ MathJax は **読み込みだけが 非同期**で、tex2svg 自体は 同期。
       だから 読み込み済みなら その場で HTML の文字列を返せる。
       まだなら null を返し、読み込みを 始める。
       （KaTeX の renderToString と 同じ使い勝手にするため。呼び手は
         null のとき 元の文字を そのまま出す＝これまでと同じ動き。） */
  function 同期(latex, display) {
    var 鍵 = (display ? "B|" : "I|") + 文(latex);
    if (覚え[鍵]) return 覚え[鍵].svg || null;
    if (!root.MathJax || !root.MathJax.tex2svg) { 要る(); return null; }
    try {
      root.MathJax.texReset();
      var node = root.MathJax.tex2svg(文(latex), { display: !!display });
      var el = node && node.querySelector ? node.querySelector("svg") : null;
      if (!el) return null;
      var 生 = el.outerHTML;
      if (/data-mjx-error|<merror/.test(生)) { 覚え[鍵] = { だめ: "式の書き方が おかしい" }; return null; }
      var 箱 = 箱を読む(生) || { x: 0, y: 0, w: 0, h: 0 };
      覚え[鍵] = { svg: 直す(生, { display: !!display }),
                   幅em: 箱.w / 1000, 高em: 箱.h / 1000, 下がりem: (箱.y + 箱.h) / 1000 };
      return 覚え[鍵].svg;
    } catch (e) { return null; }
  }

  /* 「いま数式が要る」と伝える。読み込み終わったら 1 度だけ 合図を出す。
     呼び手は その合図で 描き直す（そうしないと 初回だけ 素の文字のまま残る）。 */
  var 合図した = false;
  function 要る() {
    用意().then(function () {
      if (合図した) return;
      合図した = true;
      try { root.document.dispatchEvent(new root.CustomEvent("vqm:ready")); } catch (e) {}
    }).catch(function () {});
  }

  /* ══ 画面へ 直接 描く（KaTeX の呼び口を そのまま置き換えるため）══
     ★ 組めるまでは **元の式を そのまま出す。**空にして待たない
       （待っている間 何も見えないと「消えた」と言われる）。
     ★ 組めなかったときも 元の式を残す。黙って消さない。 */
  function 描く(el, latex, display) {
    if (!el) return Promise.resolve(false);
    var t = 文(latex);
    el.textContent = t;                        /* まず 元の式 */
    if (!t.trim()) return Promise.resolve(false);
    return 組む(t, display).then(function (r) {
      if (!r || !r.svg) { el.className = (el.className || "") + " vqm-ng"; return false; }
      el.innerHTML = '<span class="vqm' + (display ? " vqm-b" : "") + '">' + r.svg + "</span>";
      return true;
    }).catch(function () { return false; });
  }

  /* 印刷用の最低限の CSS（外の資源に頼らない）。 */
  function CSS() {
    return ".vqm{display:inline-block;line-height:0}"
      + ".vqm svg{overflow:visible}"
      + ".vqm-b{display:block;margin:.35em 0;text-align:left}"
      + ".vqm-ng{color:#b00;border-bottom:1px dotted #b00}";
  }

  VQM.svg = {
    用意: 用意, 組む: 組む, 仕込む: 仕込む, 直す: 直す, 箱を読む: 箱を読む, 描く: 描く,
    同期: 同期, 要る: 要る,
    CSS: CSS, 置き場: 置き場, 和文: 和文,
    読み込み済み: function () { return !!(root.MathJax && root.MathJax.tex2svgPromise); }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
