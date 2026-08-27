/* ══════════════════════════════════════════════════════════════════════
   core/wp/math.js — Workplace 4 画面 **共通**の 数式（VQWPM）

   ★ 訴え（2026-08-28）
     「Workplace の 4 つに、数式が 適用されても 反映もされてない。
       … PDF として 出力した時に、なぜか 文字しか 反映されてない」

   ★ 何が 起きていたか（実測 2026-08-28・数えた）
       ui-docs.js   … 数式に 触る行 **12**（実装あり）
       ui-sheets.js … **0**
       ui-slides.js … **0**
       ui-forms.js  … **0**
     つまり **壊れていたのではなく、3 つには 最初から 無かった**。
     さらに Docs でも、印刷の 組み立て（printBodyHtml）の switch に
     "math" が 無く、既定の <p> へ 落ちていた ＝ 紙には 出ない。

   ★ ここで するのは 1 つ
     **4 画面が 同じ ここを 通す**。片方だけ 直る、を なくす。

   ★ なぜ SVG か（core/math/svg.js の 但し書きと 同じ）
     印刷の 窓は 別の 文書で、外の CSS も 書体も 届かない。
     SVG に 固めれば 通信も 書体も 要らずに そのまま 出る。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQWPM = root.VQWPM || (root.VQWPM = {});

  function 文(v) { return v === undefined || v === null ? "" : String(v); }
  function esc(s) {
    return 文(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function 実体を戻す(s) {
    return 文(s)
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
  }

  /* ── 1 つ 組む。まだ 読めていなければ null（呼び側が 素の字を 出す）── */
  function 組む(latex, display) {
    var M = root.VQM;
    if (!M || !M.svg) return null;
    var src = 文(latex);
    /* ① や ½ のような 記号を TeX へ 直す仕掛けが あれば 通す。 */
    try {
      if (root.VQ2 && root.VQ2.qrender && root.VQ2.qrender.uniToTex)
        src = root.VQ2.qrender.uniToTex(src);
    } catch (e) {}
    try { return M.svg.同期(src, !!display); } catch (e2) { return null; }
  }

  /* まだなら 読み込みを 始める。読めたら vqm:ready が 飛ぶ。 */
  function 用意() {
    try {
      var M = root.VQM;
      if (M && M.svg && !M.svg.読み込み済み()) M.svg.要る();
    } catch (e) {}
  }
  function 読めている() {
    try { return !!(root.VQM && root.VQM.svg && root.VQM.svg.読み込み済み()); }
    catch (e) { return false; }
  }

  /* ── 文の 中の $…$ / $$…$$ を 組む ────────────────────────────
     ★ **タグの 外だけ**を 見る。中を 見ると 属性の $ まで 拾って 壊す。
     ★ 組めないものは **そのままの 字**で 出す（黙って 消さない）。 */
  var 式の形 = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;

  function 平文の式(seg) {
    if (!seg || seg.indexOf("$") < 0) return seg;
    var 出 = "", at = 0, m;
    式の形.lastIndex = 0;
    while ((m = 式の形.exec(seg)) !== null) {
      出 += seg.slice(at, m.index);
      var 表示 = m[1] !== undefined;
      var 生 = 実体を戻す(表示 ? m[1] : m[2]);
      var h = 組む(生, 表示);
      出 += h
        ? '<span class="wp-m' + (表示 ? " wp-m--b" : "") + '">' + h + "</span>"
        : m[0];
      at = 式の形.lastIndex;
    }
    出 += seg.slice(at);
    return 出;
  }

  function 描く(html) {
    var s = 文(html);
    if (s.indexOf("$") < 0) return s;
    用意();
    var 出 = [], last = 0, re = /<[^>]*>/g, m;
    while ((m = re.exec(s)) !== null) {
      出.push(平文の式(s.slice(last, m.index)));
      出.push(m[0]);
      last = re.lastIndex;
    }
    出.push(平文の式(s.slice(last)));
    return 出.join("");
  }

  /* 素の 文字（HTML では ないもの）用。エスケープしてから 組む。
     Sheets の セル・Slides の 箱・Forms の 質問文は こちら。 */
  function 素の文を描く(text) {
    var s = 文(text);
    if (s.indexOf("$") < 0) return esc(s);
    用意();
    var 出 = "", at = 0, m;
    式の形.lastIndex = 0;
    while ((m = 式の形.exec(s)) !== null) {
      出 += esc(s.slice(at, m.index));
      var 表示 = m[1] !== undefined;
      var h = 組む(表示 ? m[1] : m[2], 表示);
      出 += h ? '<span class="wp-m' + (表示 ? " wp-m--b" : "") + '">' + h + "</span>" : esc(m[0]);
      at = 式の形.lastIndex;
    }
    出 += esc(s.slice(at));
    return 出;
  }

  function 式がある(text) { return 文(text).indexOf("$") >= 0; }

  /* ── 読み終わったら 描き直す ──────────────────────────────────
     ★ ここが 無いと「最初の 1 回は 素の字、あとは 何も 起きない」に なる。
       MathJax は 2.2MB あるので、**最初の 描画には まず 間に合わない**。
     ★ 同じ 画面が 何度も 登録しないよう、外し方も 返す。 */
  function 読めたら(fn) {
    if (typeof fn !== "function") return function () {};
    var 一度 = function () { try { fn(); } catch (e) {} };
    try { root.document.addEventListener("vqm:ready", 一度); } catch (e) {}
    /* もう 読めているなら すぐ 1 回（登録が 遅れた 場合の 取りこぼし防止） */
    if (読めている()) { try { root.setTimeout(一度, 0); } catch (e) {} }
    return function () {
      try { root.document.removeEventListener("vqm:ready", 一度); } catch (e) {}
    };
  }

  /* ── 紙にする 前に **待つ** ────────────────────────────────────
     ★ MathJax は 数式が 出てきたとき に 読み始める（2.2MB）。
       読み終わる 前に PDF を 押されると、組めないので 素の $…$ が
       そのまま 紙に 出る（実測 2026-08-28: Forms で 踏んだ）。
       印刷の 道は **必ず ここを 通してから** 組み立てる。
     ★ 届かなくても 止めない（既定 6 秒で 見切る）。
       出ないより、素の字でも 出るほうが まし。 */
  function 用意して待つ(上限) {
    var ms = Math.max(0, Number(上限) || 6000);
    return new Promise(function (done) {
      if (読めている()) { done(true); return; }
      用意();
      var 済 = false;
      var 外す = null;
      var 終 = function (v) {
        if (済) return; 済 = true;
        try { if (外す) 外す(); } catch (e) {}
        done(v);
      };
      外す = 読めたら(function () { 終(true); });
      try { root.setTimeout(function () { 終(読めている()); }, ms); }
      catch (e) { 終(false); }
    });
  }

  var CSS = ".wp-m{display:inline-block;vertical-align:middle;max-width:100%;}"
    + ".wp-m svg{max-width:100%;height:auto;vertical-align:middle;}"
    + ".wp-m--b{display:block;text-align:center;margin:.5em 0;}"
    /* 印刷でも そのまま 出す（SVG なので 書体も 通信も 要らない） */
    + "@media print{.wp-m{break-inside:avoid;}"
    + ".wp-m svg{print-color-adjust:exact;-webkit-print-color-adjust:exact;}}";

  VQWPM.組む = 組む;
  VQWPM.描く = 描く;
  VQWPM.素の文を描く = 素の文を描く;
  VQWPM.式がある = 式がある;
  VQWPM.用意 = 用意;
  VQWPM.読めている = 読めている;
  VQWPM.読めたら = 読めたら;
  VQWPM.用意して待つ = 用意して待つ;
  VQWPM.CSS = function () { return CSS; };
})(typeof globalThis !== "undefined" ? globalThis : this);
