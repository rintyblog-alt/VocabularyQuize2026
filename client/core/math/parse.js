/* ══════════════════════════════════════════════════════════════════════
   core/math/parse.js — 本文から 数式を **抜き出して 別の箱へ移す**

   ★ なぜ要るか（実測）
     Quick Mock の紙面（pdf/renderer.js）には LaTeX を扱う所が 1 つも無い。
     だから「$x^2 + 5x + 6$」は **そのままの文字**として紙に出ていた。
     生成のときに「数式は分けて出して」と頼んでも、LLM は必ず漏らす。
     **受け取り側で 必ず通す。**ここが その関所。

   ★ やること
     本文の $…$ / $$…$$ / \(…\) / \[…\] / \begin{…}…\end{…} を見つけ、
     **math ノードの表**へ移し、本文には **見えない参照記号**だけを残す。
     移したあとの本文に $ \( \[ が 1 文字でも残っていたら 崩れ（error）。

   ★ 参照記号は 私用領域（U+E000 / U+E001）。人が打てる字ではないので、
     利用者の書いた文と ぶつからない。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQM = root.VQM || (root.VQM = {});

  /* 私用領域。**文字を直に書かない**（編集器やコピペで 黙って消える）。 */
  var 開 = String.fromCharCode(0xE000);
  var 閉 = String.fromCharCode(0xE001);
  var ドル避け = String.fromCharCode(0xE002);   /* \$ を いったん逃がす */

  function 文(v) { return v === undefined || v === null ? "" : String(v); }

  /* 数式らしい環境。ここに無い環境名は 本文の一部として扱う
     （\begin{itemize} のような 文章の環境まで 数式にしない）。 */
  var 数式の環境 = ["equation", "equation*", "align", "align*", "alignat", "alignat*",
    "gather", "gather*", "multline", "multline*", "cases", "dcases",
    "matrix", "pmatrix", "bmatrix", "Bmatrix", "vmatrix", "Vmatrix",
    "smallmatrix", "array", "aligned", "gathered", "split", "eqnarray", "eqnarray*"];

  /* ══ 抜き出し ═════════════════════════════════════════════════
     text … 本文（HTML ではなく 素の文字列）
     表   … { id: {latex, display} } を 足していく入れ物
     戻り … 参照記号に置き換わった 本文 */
  /* ══ 式の 中に 混じった HTML の 札を TeX へ 直す（2026-09-06・訴え）══
     訴え「数学記号が 描画されずに タグが 剥き出しに なってます」

     AI が  ax<sup>2</sup>+bx+c  と 書いて くる ことが ある。
     それが $…$ の 中に あると、組む 側は 「<」「s」「u」「p」「>」を
     **数式の 文字**として 組むので、紙に  < sup > 2 < /sup >  と 出る。

     ★ **消さずに 意味を 保って** 直す。2 乗は 2 乗の まま に する
       （消すと ax+bx+c に なって **別の 式**に なる）。
     ★ 表示用に 逃がした 形（&lt;sup&gt;）でも 来るので 両方 見る。
     ★ `a < b` の 「<」は 数式として 正しい ので、**sup / sub と
       決まった 札だけ**を 相手に する。ほかの 「<」は 触らない。
     ★ ここは 数式の **唯一の 出どころ**。ここで 直せば
       画面・問題用紙・解答用紙・PDF の 全部に 効く。 */
  var 札上 = /(?:<|&lt;)\s*sup\s*(?:>|&gt;)([\s\S]*?)(?:<|&lt;)\s*\/\s*sup\s*(?:>|&gt;)/gi;
  var 札下 = /(?:<|&lt;)\s*sub\s*(?:>|&gt;)([\s\S]*?)(?:<|&lt;)\s*\/\s*sub\s*(?:>|&gt;)/gi;
  var 札改行 = /(?:<|&lt;)\s*br\s*\/?\s*(?:>|&gt;)/gi;
  var 札飾り = /(?:<|&lt;)\s*\/?\s*(?:b|strong|i|em|u|span|small|font|mark)\s*(?:>|&gt;)/gi;
  function 札をTeXへ(s) {
    var t = 文(s);
    if (t.indexOf("<") < 0 && t.indexOf("&lt;") < 0) return t;
    t = t.replace(札上, function (m, x) { return "^{" + x + "}"; });
    t = t.replace(札下, function (m, x) { return "_{" + x + "}"; });
    /* 改行と 飾りは 数式の 中では 意味を 持たない。外すだけ。 */
    t = t.replace(札改行, " ").replace(札飾り, "");
    return t.trim();
  }

  function 抜く(text, 表, 種) {
    var s = 文(text);
    if (!s) return s;
    表 = 表 || {};
    var 番 = 0;
    function 次のid() {
      番++;
      return (種 || "m") + "_" + (Object.keys(表).length + 1) + "_" + 番;
    }
    var 一つだけ = new RegExp("^" + 開 + "([^" + 閉 + "]+)" + 閉 + "$");
    function 入れる(latex, display) {
      var t = 札をTeXへ(文(latex).trim());
      if (!t) return "";                      /* 中身が空なら 記号ごと消す */
      /* ★ **二重に包まない**（2026-08-17・実測で見つけた）。
         \[\begin{pmatrix}…\end{pmatrix}\] や $$\begin{cases}…\end{cases}$$ は
         ふつうに書かれる。環境を先に抜いたあと、外側の \[…\] が
         **参照記号そのものを 数式として** 抜き直していた。
         その結果 latex が「m_2_2」になり、当然 組めなかった。 */
      var 入れ子 = 一つだけ.exec(t);
      if (入れ子) {
        var 元 = 表[入れ子[1]];
        if (元) { if (display) 元.display = true; return t; }
      }
      var id = 次のid();
      表[id] = { id: id, type: "math", latex: t, display: !!display };
      return 開 + id + 閉;
    }

    /* ① 逃がす。\$ は お金の $ なので 数式ではない。 */
    s = s.replace(/\\\$/g, ドル避け);

    /* ② 環境（\begin{…}…\end{…}）。$$ より先に取る。
          $$\begin{cases}…\end{cases}$$ のときは ③ が先に丸ごと取るので
          ここへは 素の \begin だけが残る。 */
    数式の環境.forEach(function (env) {
      var e = env.replace(/\*/g, "\\*");
      var re = new RegExp("\\\\begin\\{" + e + "\\}([\\s\\S]*?)\\\\end\\{" + e + "\\}", "g");
      s = s.replace(re, function (whole) { return 入れる(whole, true); });
    });

    /* ③ ブロック（$$…$$ と \[…\]）。**インラインより先。** */
    s = s.replace(/\$\$([\s\S]+?)\$\$/g, function (m, x) { return 入れる(x, true); });
    s = s.replace(/\\\[([\s\S]+?)\\\]/g, function (m, x) { return 入れる(x, true); });

    /* ④ インライン（\(…\) と $…$）。
          $…$ は **改行をまたがない**。またがせると、
          文中の 2 つの $ が 段落をまたいで つながってしまう。 */
    s = s.replace(/\\\(([\s\S]+?)\\\)/g, function (m, x) { return 入れる(x, false); });
    s = s.replace(/\$([^$\n]+?)\$/g, function (m, x) { return 入れる(x, false); });

    /* ⑤ 逃がしたものを 戻す */
    s = s.replace(new RegExp(ドル避け, "g"), "\\$");
    return s;
  }

  /* ══ 残っていないか（崩れの検出）═══════════════════════════════
     戻り … [] なら きれい。中身があれば その印。 */
  function 残り(text) {
    var s = 文(text);
    var 出 = [];
    if (/\$/.test(s.replace(/\\\$/g, ""))) 出.push("$");
    if (/\\\(|\\\)/.test(s)) 出.push("\\( \\)");
    if (/\\\[|\\\]/.test(s)) 出.push("\\[ \\]");
    if (/\\begin\{/.test(s)) 出.push("\\begin{…}");
    return 出;
  }

  /* ══ 区切りの無い 生の LaTeX（2026-08-17・実測で見つけた）══════════
     ★ LLM は `$` で囲まずに `\cfrac{1}{2}` とだけ書くことがある。
       それは 上の 残り() には 引っかからない（$ も \( も 無いので）。
       すると **紙に そのままの文字が出る**のに、検査は「きれい」と言う。
       いちばん危ない見逃し方なので、**別に 数えて 見えるようにする。**
     ★ 勝手に 数式へ変えない。書き方が 決めきれないため（\\ は改行、
       \text は文中にも出る）。**気になる所として 出すだけ。** */
  var 数式らしい命令 = ["frac", "cfrac", "dfrac", "tfrac", "sqrt", "int", "iint", "oint",
    "sum", "prod", "lim", "binom", "vec", "overline", "underline", "hat", "bar",
    "times", "div", "pm", "mp", "leq", "geq", "leqq", "geqq", "neq", "approx",
    "equiv", "sim", "propto", "angle", "perp", "parallel", "therefore", "because",
    "in", "subset", "cap", "cup", "infty", "alpha", "beta", "gamma", "theta", "pi",
    "sigma", "omega", "cdot", "cdots", "ldots", "left", "right", "mathrm", "mathbf"];

  function 区切りの無い式(text) {
    var s = 文(text);
    if (s.indexOf("\\") < 0) return [];
    var 出 = [];
    for (var i = 0; i < 数式らしい命令.length; i++) {
      var re = new RegExp("\\\\" + 数式らしい命令[i] + "(?![A-Za-z])", "g");
      var m;
      while ((m = re.exec(s)) !== null) {
        if (出.indexOf("\\" + 数式らしい命令[i]) < 0) 出.push("\\" + 数式らしい命令[i]);
        break;
      }
    }
    return 出;
  }

  /* ══ 参照記号で 切り分ける（描く側が使う）═══════════════════════
     戻り … [{ t:"text", v } | { t:"math", id }] */
  function 割る(text) {
    var s = 文(text);
    var 出 = [], i = 0;
    while (i < s.length) {
      var a = s.indexOf(開, i);
      if (a < 0) { 出.push({ t: "text", v: s.slice(i) }); break; }
      var b = s.indexOf(閉, a);
      if (b < 0) { 出.push({ t: "text", v: s.slice(i) }); break; }
      if (a > i) 出.push({ t: "text", v: s.slice(i, a) });
      出.push({ t: "math", id: s.slice(a + 1, b) });
      i = b + 1;
    }
    return 出.filter(function (x) { return x.t === "math" || x.v; });
  }

  /* 参照記号を 素の LaTeX へ戻す（編集・保存・検索のため）。 */
  function 戻す(text, 表) {
    return 割る(text).map(function (x) {
      if (x.t === "text") return x.v;
      var n = 表 && 表[x.id];
      if (!n) return "";
      return n.display ? "$$" + n.latex + "$$" : "$" + n.latex + "$";
    }).join("");
  }

  /* 参照記号を 落として 素の文だけにする（字数を数えるときなど）。 */
  function 素(text) {
    return 割る(text).map(function (x) { return x.t === "text" ? x.v : ""; }).join("");
  }

  function 記号がある(text) { return 文(text).indexOf(開) >= 0; }

  VQM.parse = {
    抜く: 抜く, 残り: 残り, 割る: 割る, 戻す: 戻す, 素: 素,
    /* ★ 式を 組む 道は **2 つ** ある（2026-09-06）。
         ① 先に 抜いて 表に する（抜く → 上の 入れる）
         ② その場で $…$ を 見つけて 組む（vq2-app の 数式に組む / katexOf）
       ② は ここを 通らないので、**同じ 直しを 外からも 呼べる ように**出す。
       出どころを 2 つに すると、片方だけ 直って もう 片方が 剥き出しに なる。 */
    札をTeXへ: 札をTeXへ,
    区切りの無い式: 区切りの無い式, 数式らしい命令: 数式らしい命令,
    記号がある: 記号がある, 開: 開, 閉: 閉, 数式の環境: 数式の環境
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
