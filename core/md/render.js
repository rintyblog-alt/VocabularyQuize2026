/* ══════════════════════════════════════════════════════════════════════
   core/md/render.js — Lumi の言葉を **かたちのある文**にする

   ★ 訴え（2026-08-17）「上に出てくるやつを マークダウン付きにできない？
     大事なとこに 強調したり、線を引いたり。図や 表も。色も。数式も。」

   ★ なぜ 自前で書くか
     この画面は 印刷窓（about:blank）や オフラインでも 動く必要がある。
     CDN の marked に頼ると、そこで 消える。**外に頼らない。**

   ★ 安全の決まり（ここを外すと 差し込みの穴になる）
     **必ず 先に 全部 エスケープしてから**、決まった形だけを タグへ戻す。
     生の HTML は 一切 通さない。リンクも 文字として出すだけで、
     押して 飛べるようには しない（Lumi の言葉で 外へ 飛ばさない）。

   ★ 使える形
     見出し  # 〜 ######
     強調    **太字**  __下線__  *斜め*  ~~取り消し~~
     色つき  ==目立たせる==  ==r:赤==  ==b:青==  ==g:緑==  ==y:黄==
     箇条書き  - / * / 1.（2 文字ぶん下げると 入れ子）
     引用    >
     区切り  ---
     表      | 見出し | 見出し |
             |---|---|
     コード  `その場` と ``` の 3 連
     図      ```図  はじめ -> 計算 -> 答え  ```
     数式    $x^2$（文の中）  $$…$$（行を変えて）
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQMD = root.VQMD || (root.VQMD = {});

  function 文(v) { return v === undefined || v === null ? "" : String(v); }
  function esc(s) {
    return 文(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  var 色 = { r: "vqmd-r", b: "vqmd-b", g: "vqmd-g", y: "vqmd-y", p: "vqmd-p", o: "vqmd-o" };

  /* ══ 数式（VQM がいれば SVG。無ければ 元の字のまま）════════════ */
  function 式にする(s) {
    /* ★ **$ が無くても 数式のことがある**（2026-08-17・実測で見つけた）。
       ここで「$ が無ければ 帰る」と していたので、
       \\(…\\) と \\[…\\] と \\begin{…} は **下の 処理まで 届いていなかった**。
       下に 正しい 拾いかたを 書いたのに、入口で 弾かれていた
       （「ボードで 数式が 反映されないことがある」の 正体は これ）。 */
    if (s.indexOf("$") < 0 && s.indexOf("\\") < 0) return s;
    var V = root.VQM && root.VQM.svg;
    if (V && !V.読み込み済み()) { try { V.要る(); } catch (e) {} }
    function 組む(tex, ブロック) {
      if (!V) return null;
      try { return V.同期(tex, !!ブロック); } catch (e) { return null; }
    }
    function 包む(m, t, ブロック) {
      var h = 組む(実体を戻す(t), ブロック);
      return h ? '<span class="vqmd-math' + (ブロック ? " vqmd-math-b" : "") + '">' + h + "</span>"
               : m;
    }
    /* ★ **$ だけでは 足りない**（2026-08-17・実測で 分かった不具合）。
       「ボードで 数式が 反映されないことがある」の 正体。
       Lumi は $…$ のほかに \\(…\\)・\\[…\\]・\\begin{cases}…\\end{cases}
       も ふつうに 書く。拾っていなかったので、その形のときだけ
       生の字が そのまま 出ていた。
       ★ 見る順番は **広いものから**。$$ より先に $ を見ると、
         $$ を 2 つの $ と 読み違える。 */
    /* ① 環境（\begin{…}…\end{…}）。$$ の 中に 入っていても、
          先に 取れば 二重にならない（中身は 同じ）。 */
    s = s.replace(/\\begin\{(equation\*?|align\*?|alignat\*?|gather\*?|multline\*?|cases|dcases|matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix|smallmatrix|array|aligned|gathered|split)\}([\s\S]*?)\\end\{\1\}/g,
      function (m) { return 包む(m, m, true); });
    /* ② ブロック（$$…$$ と \[…\]） */
    s = s.replace(/\$\$([^$]+?)\$\$/g, function (m, t) { return 包む(m, t, true); });
    s = s.replace(/\\\[([\s\S]+?)\\\]/g, function (m, t) { return 包む(m, t, true); });
    /* ③ 文の中（\(…\) と $…$） */
    s = s.replace(/\\\(([\s\S]+?)\\\)/g, function (m, t) { return 包む(m, t, false); });
    s = s.replace(/\$([^$\n]+?)\$/g, function (m, t) { return 包む(m, t, false); });
    /* ④ ★ **囲みの無い 生の命令**（2026-08-17・訴え「frac が 効いていない」）。
       Lumi は 囲むのを 忘れて、そのまま \frac{1}{2} と 書くことが ある。
       ここまでの ①〜③ は どれも 囲みが 要るので、素通りして
       **\frac{1}{2} という 字が そのまま** 出ていた。
       ★ 拾うのは **命令ひとかたまりだけ**（\命令 と そのうしろの {…}）。
         前後の 文まで 巻き込まない（日本語を 数式にしてしまうため）。
       ★ 組めなかったものは そのまま。無理に 図にしない。 */
    s = 生の命令(s);
    return s;

    /* 囲みの無い \命令{…} を ひとかたまりずつ 組む。
       うしろに 続く {…} と ^{…} _{…} は 同じかたまりに 入れる
       （\frac{1}{2} は {…} が 2 つ、x^{2} は 上つきまで が 1 つ）。 */
    function 生の命令(t2) {
      if (t2.indexOf("\\") < 0) return t2;
      var 出 = "", i = 0;
      while (i < t2.length) {
        var c = t2.charAt(i);
        if (c !== "\\") { 出 += c; i++; continue; }
        var m2 = /^\\([a-zA-Z]+)/.exec(t2.slice(i));
        if (!m2 || !数式の命令[m2[1]]) { 出 += c; i++; continue; }
        var j = i + m2[0].length;
        /* うしろの {…} / ^{…} / _{…} を 取り込む（かっこの 対応を 数える） */
        while (j < t2.length) {
          var d = t2.charAt(j);
          if (d === "^" || d === "_") { j++; continue; }
          if (d !== "{") break;
          var 深 = 0, k = j;
          for (; k < t2.length; k++) {
            if (t2.charAt(k) === "{") 深++;
            else if (t2.charAt(k) === "}") { 深--; if (!深) { k++; break; } }
          }
          if (深) break;                       /* 閉じていない → あきらめる */
          j = k;
        }
        /* うしろに 上つき・下つきの ついた 文字が 続くなら 一緒に 取る
           （\pi r^{2} の r^{2} まで 図にする。ここを 切ると 半分だけ 図になる） */
        var 続 = /^\s?[A-Za-z0-9]+(?:[\^_](?:\{[^}]*\}|[A-Za-z0-9]))+/.exec(t2.slice(j));
        if (続) j += 続[0].length;
        var 生 = t2.slice(i, j);
        var h = 組む(実体を戻す(生), false);
        出 += h ? '<span class="vqmd-math">' + h + "</span>" : 生;
        i = j;
      }
      return 出;
    }
  }

  /* 囲み無しでも 数式として 拾ってよい 命令。
     ここに無いものは **文字のまま**（\n や \t を 図にしない）。 */
  var 数式の命令 = {};
  ("frac dfrac cfrac tfrac sqrt sum prod int iint oint lim binom vec overline underline "
   + "hat bar tilde times div pm mp leq geq leqq geqq neq approx equiv sim propto "
   + "angle perp parallel therefore because in notin subset supset cap cup infty "
   + "alpha beta gamma delta theta lambda mu pi rho sigma phi omega Delta Sigma Omega "
   + "cdot cdots ldots dots le ge ne to rightarrow leftarrow Leftrightarrow "
   + "sin cos tan log ln exp max min mathrm mathbf boxed").split(" ")
    .forEach(function (n) { 数式の命令[n] = 1; });
  /* エスケープ済みの字を LaTeX へ戻す（\frac{a}{b} の < > & を 元に戻す） */
  function 実体を戻す(s) {
    return 文(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  }

  /* ══ 文の中の飾り ═══════════════════════════════════════════════ */
  function 中身(s) {
    s = 文(s);
    /* その場のコード と 組んだ数式は **先に 取り分ける**。
       ★ ここが 崩れの もとだった（2026-08-17・実測）。
         組んだ数式（SVG）の 中には width="…" のような **= が 山ほど**あり、
         そのあと マーカー（==…==）を 探すと、SVG の中の = に 引っかかって
         「答えは ==x=3==」や「==答えは $x=2$==」が **そのまま 出ていた**。
         取り分けてから 飾りを 当て、最後に 戻す。 */
    var 箱 = [];
    /* ★ 目印は **私用領域**。ただの数字で 印を付けると、
       本文の数字（「 3 」など）と ぶつかって 中身が 消える。 */
    var 印開 = String.fromCharCode(0xE010), 印閉 = String.fromCharCode(0xE011);
    var しまう = function (h) { 箱.push(h); return 印開 + (箱.length - 1) + 印閉; };
    s = s.replace(/`([^`\n]+)`/g, function (m, t) {
      return しまう('<code class="vqmd-c">' + t + "</code>");
    });
    /* 数式を 組み、そのまま **箱へ しまう**（飾りの regexp から 隠す） */
    s = 式にする(s).replace(/<span class="vqmd-math[^"]*">[\s\S]*?<\/span>/g, しまう);
    s = s.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
    /* 番号つきの下線（__1:ここ__）。手順の 何番の話かが ひと目で 分かる。 */
    s = s.replace(/__(\d{1,2}):([^_\n]+?)__/g, function (m, n, t) {
      return '<u class="vqmd-un"><i class="vqmd-no">' + n + "</i>" + t + "</u>";
    });
    s = s.replace(/__([^_\n]+?)__/g, '<u>$1</u>');
    s = s.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');
    s = s.replace(/~~([^~\n]+?)~~/g, '<s>$1</s>');
    /* ★ マーカーは **中に = が あってもよい**（実測で 直した）。
       数学の 印つけは 「==x=3==」のように = を 含むのが ふつう。
       閉じは 「==」だけ。1 つの = は 中身として 通す。
       色の前後の すき間も 許す（== r: 大事 == と 書かれることが ある）。 */
    var マーカー中 = "((?:[^=\\n]|=(?!=))+?)";
    s = s.replace(new RegExp("==\\s*([rbgyop])\\s*:\\s*" + マーカー中 + "\\s*==", "g"),
      function (m, c, t) { return '<mark class="' + (色[c] || "") + '">' + t + "</mark>"; });
    s = s.replace(new RegExp("==" + マーカー中 + "==", "g"), '<mark>$1</mark>');
    /* リンクは **文字だけ**。押して 飛べるようには しない。 */
    s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, '<span class="vqmd-l">$1</span>');
    /* しまってあった コードと数式を **最後に 戻す** */
    s = s.replace(new RegExp(印開 + "(\\d+)" + 印閉, "g"),
      function (m, i2) { return 箱[Number(i2)] || ""; });
    return s;
  }

  /* ══ 図 ═════════════════════════════════════════════════════════
     ★ 訴え（2026-08-17）「数学の問題や 比較問題で、同じような図形を
       すぐに 組み立てられるように」。
     ★ 外の作図の道具は 入れない（重い・オフラインで 消える）。
       **よく出るものだけ**を SVG で 自前で 描く。
         数直線:  -3 <= x < 2.5      … 範囲・点・端の 白丸/黒丸
         三角形:  3, 4, 5 直角        … 辺の長さつき（直角の印も）
         円:      r=5                 … 半径つき
         長方形:  たて3 よこ5
         座標:    y = 2x + 1          … 1 次関数のグラフ
         流れ:    はじめ -> 計算 -> 答え
     ★ 数字が 読めないものは **描かずに 文字のまま**出す。
       それらしい図を 作ると、合っていない図で 覚えてしまう。 */
  function 数(v, 既) { var n = parseFloat(v); return isFinite(n) ? n : 既; }

  function 数直線(式) {
    /* 「-3 <= x < 2.5」「x > 1」「-1 〜 4」 */
    var m = /(-?[\d.]+)\s*(<=|≦|<|≤)?\s*[a-zA-Zｘx]\s*(<=|≦|<|≤)?\s*(-?[\d.]+)/.exec(式);
    var 左 = null, 右 = null, 左閉 = false, 右閉 = false;
    if (m) {
      左 = 数(m[1], null); 右 = 数(m[4], null);
      左閉 = /=|≦|≤/.test(m[2] || ""); 右閉 = /=|≦|≤/.test(m[3] || "");
    } else {
      var m2 = /[a-zA-Zｘx]\s*(>=|≧|>|≥|<=|≦|<|≤)\s*(-?[\d.]+)/.exec(式);
      if (!m2) return null;
      var v = 数(m2[2], 0), 上 = /</.test(m2[1]) || /≦|≤/.test(m2[1]);
      if (上) { 右 = v; 右閉 = /=|≦|≤/.test(m2[1]); }
      else { 左 = v; 左閉 = /=|≧|≥/.test(m2[1]); }
    }
    var 下 = Math.floor(Math.min(左 === null ? 右 - 3 : 左, 右 === null ? 左 - 3 : 右)) - 1;
    var 上端 = Math.ceil(Math.max(左 === null ? 右 + 3 : 左, 右 === null ? 左 + 3 : 右)) + 1;
    if (!isFinite(下) || !isFinite(上端) || 上端 - 下 > 40) return null;
    var W = 280, H = 52, 端 = 16;
    var X = function (v2) { return 端 + (v2 - 下) / (上端 - 下) * (W - 端 * 2); };
    var o = ['<svg class="vqmd-fig" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" role="img">'];
    o.push('<line x1="4" y1="30" x2="' + (W - 4) + '" y2="30" class="ax"/>');
    for (var v3 = 下; v3 <= 上端; v3++) {
      o.push('<line x1="' + X(v3).toFixed(1) + '" y1="26" x2="' + X(v3).toFixed(1) + '" y2="34" class="tk"/>');
      o.push('<text x="' + X(v3).toFixed(1) + '" y="46" class="lb">' + v3 + "</text>");
    }
    var a = 左 === null ? 下 : 左, b = 右 === null ? 上端 : 右;
    o.push('<line x1="' + X(a).toFixed(1) + '" y1="20" x2="' + X(b).toFixed(1) + '" y2="20" class="rg"/>');
    if (左 !== null) o.push('<circle cx="' + X(左).toFixed(1) + '" cy="20" r="4.5" class="' + (左閉 ? "pt" : "pto") + '"/>');
    if (右 !== null) o.push('<circle cx="' + X(右).toFixed(1) + '" cy="20" r="4.5" class="' + (右閉 ? "pt" : "pto") + '"/>');
    o.push("</svg>");
    return o.join("");
  }

  function 三角形(式) {
    var 数ら = (式.match(/-?[\d.]+/g) || []).map(Number).filter(function (x) { return x > 0; });
    if (数ら.length < 3) return null;
    var a = 数ら[0], b = 数ら[1], c = 数ら[2];
    var 直 = /直角|right/.test(式) || Math.abs(a * a + b * b - c * c) < 0.01;
    var W = 190, H = 130, m2 = 22;
    /* 直角のときは そのまま。そうでなくても **辺の比**は 保つ。 */
    var 幅 = W - m2 * 2, 高 = H - m2 * 2;
    var s2 = Math.min(幅 / Math.max(a, 1), 高 / Math.max(b, 1));
    var ax = m2, ay = H - m2;
    var bx = m2 + a * s2, by = H - m2;
    var cx2 = 直 ? m2 : m2 + a * s2 * 0.32, cy = H - m2 - b * s2;
    var o = ['<svg class="vqmd-fig" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" role="img">'];
    o.push('<polygon points="' + [ax, ay, bx, by, cx2, cy].map(function (n) { return n.toFixed(1); }).join(",") + '" class="sh"/>');
    if (直) o.push('<path d="M' + (ax + 11) + " " + ay + "L" + (ax + 11) + " " + (ay - 11) + "L" + ax + " " + (ay - 11) + '" class="rt"/>');
    o.push('<text x="' + ((ax + bx) / 2).toFixed(1) + '" y="' + (ay + 14) + '" class="lb">' + a + "</text>");
    o.push('<text x="' + (Math.min(ax, cx2) - 8).toFixed(1) + '" y="' + ((ay + cy) / 2).toFixed(1) + '" class="lb">' + b + "</text>");
    o.push('<text x="' + ((bx + cx2) / 2 + 8).toFixed(1) + '" y="' + ((by + cy) / 2 - 4).toFixed(1) + '" class="lb">' + c + "</text>");
    o.push("</svg>");
    return o.join("");
  }

  function 円(式) {
    var r = 数((/r\s*=\s*(-?[\d.]+)/i.exec(式) || [])[1], null);
    if (r === null) r = 数((式.match(/-?[\d.]+/) || [])[0], null);
    if (r === null || r <= 0) return null;
    var W = 140, H = 130, cx2 = 70, cy = 62, R = 44;
    var o = ['<svg class="vqmd-fig" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" role="img">'];
    o.push('<circle cx="' + cx2 + '" cy="' + cy + '" r="' + R + '" class="sh"/>');
    o.push('<line x1="' + cx2 + '" y1="' + cy + '" x2="' + (cx2 + R) + '" y2="' + cy + '" class="tk"/>');
    o.push('<circle cx="' + cx2 + '" cy="' + cy + '" r="2.5" class="pt"/>');
    o.push('<text x="' + (cx2 + R / 2) + '" y="' + (cy - 6) + '" class="lb">' + r + "</text>");
    o.push("</svg>");
    return o.join("");
  }

  function 長方形(式) {
    var t = 数((/(?:たて|縦|高さ|h)\s*[=:]?\s*(-?[\d.]+)/i.exec(式) || [])[1], null);
    var y = 数((/(?:よこ|横|幅|w)\s*[=:]?\s*(-?[\d.]+)/i.exec(式) || [])[1], null);
    if (t === null || y === null) {
      var ns = (式.match(/-?[\d.]+/g) || []).map(Number);
      if (ns.length < 2) return null;
      y = ns[0]; t = ns[1];
    }
    if (!(t > 0 && y > 0)) return null;
    var W = 180, H = 120, m2 = 24;
    var s2 = Math.min((W - m2 * 2) / y, (H - m2 * 2) / t);
    var w2 = y * s2, h2 = t * s2;
    var o = ['<svg class="vqmd-fig" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" role="img">'];
    o.push('<rect x="' + m2 + '" y="' + (H - m2 - h2).toFixed(1) + '" width="' + w2.toFixed(1)
      + '" height="' + h2.toFixed(1) + '" class="sh"/>');
    o.push('<text x="' + (m2 + w2 / 2).toFixed(1) + '" y="' + (H - m2 + 14) + '" class="lb">' + y + "</text>");
    o.push('<text x="' + (m2 - 8) + '" y="' + (H - m2 - h2 / 2).toFixed(1) + '" class="lb">' + t + "</text>");
    o.push("</svg>");
    return o.join("");
  }

  function 座標(式) {
    /* y = 2x + 1 / y = -x - 3 */
    var m = /y\s*=\s*(-?[\d.]*)\s*\*?\s*[a-zA-Zｘx]\s*([+-]\s*[\d.]+)?/i.exec(式);
    if (!m) return null;
    var a = m[1] === "" || m[1] === undefined ? 1 : (m[1] === "-" ? -1 : 数(m[1], 1));
    var b = 数(String(m[2] || "0").replace(/\s+/g, ""), 0);
    var W = 170, H = 150, cx2 = 85, cy = 75, 目 = 14;
    var o = ['<svg class="vqmd-fig" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" role="img">'];
    o.push('<line x1="6" y1="' + cy + '" x2="' + (W - 6) + '" y2="' + cy + '" class="ax"/>');
    o.push('<line x1="' + cx2 + '" y1="6" x2="' + cx2 + '" y2="' + (H - 6) + '" class="ax"/>');
    for (var k = -4; k <= 4; k++) {
      if (!k) continue;
      o.push('<line x1="' + (cx2 + k * 目) + '" y1="' + (cy - 3) + '" x2="' + (cx2 + k * 目) + '" y2="' + (cy + 3) + '" class="tk"/>');
      o.push('<line x1="' + (cx2 - 3) + '" y1="' + (cy + k * 目) + '" x2="' + (cx2 + 3) + '" y2="' + (cy + k * 目) + '" class="tk"/>');
    }
    var 点 = function (x) { return { x: cx2 + x * 目, y: cy - (a * x + b) * 目 }; };
    var p1 = 点(-5), p2 = 点(5);
    o.push('<line x1="' + p1.x.toFixed(1) + '" y1="' + p1.y.toFixed(1) + '" x2="' + p2.x.toFixed(1)
      + '" y2="' + p2.y.toFixed(1) + '" class="gl"/>');
    o.push('<text x="' + (W - 8) + '" y="' + (cy - 6) + '" class="lb">x</text>');
    o.push('<text x="' + (cx2 + 6) + '" y="14" class="lb">y</text>');
    o.push("</svg>");
    return o.join("");
  }

  function 図にする(本文) {
    var 行 = 文(本文).split("\n").map(function (x) { return x.trim(); }).filter(Boolean);
    if (!行.length) return "";
    var 出 = ['<div class="vqmd-zu">'];
    行.forEach(function (l) {
      var m = /^(数直線|三角形|直角三角形|円|長方形|四角形|座標|グラフ)\s*[:：]?\s*(.*)$/.exec(l);
      if (m) {
        var 式 = m[2] || "", g = null;
        if (m[1] === "数直線") g = 数直線(式);
        else if (m[1] === "三角形" || m[1] === "直角三角形") g = 三角形((m[1] === "直角三角形" ? "直角 " : "") + 式);
        else if (m[1] === "円") g = 円(式);
        else if (m[1] === "長方形" || m[1] === "四角形") g = 長方形(式);
        else g = 座標(式);
        /* ★ 読めなかったら **描かない**。それらしい図は 覚え違いのもと。 */
        出.push(g ? '<div class="vqmd-zu-f">' + g + "</div>"
                  : '<div class="vqmd-zu-r"><span class="vqmd-zu-b">' + 中身(esc(l)) + "</span></div>");
        return;
      }
      var 節 = l.split(/\s*(?:->|→|=>)\s*/).filter(Boolean);
      出.push('<div class="vqmd-zu-r">');
      節.forEach(function (n, i) {
        if (i) 出.push('<i class="vqmd-zu-a">→</i>');
        出.push('<span class="vqmd-zu-b">' + 中身(esc(n)) + "</span>");
      });
      出.push("</div>");
    });
    出.push("</div>");
    return 出.join("");
  }

  /* ══ 表 ═════════════════════════════════════════════════════════ */
  function 表の行(l) {
    var s = l.trim().replace(/^\|/, "").replace(/\|$/, "");
    return s.split("|").map(function (x) { return x.trim(); });
  }
  function 区切り行か(l) {
    return /^\s*\|?[\s:-]*-[-\s:|]*\|?\s*$/.test(l) && l.indexOf("-") >= 0 && l.indexOf("|") >= 0;
  }

  /* ══ 本体 ═══════════════════════════════════════════════════════ */
  function render(src) {
    var 生 = 文(src);
    if (!生.trim()) return "";
    var 行 = esc(生).split(/\r?\n/);
    var 出 = [], i = 0;

    function 段落を閉じる(積) {
      if (積.length) { 出.push("<p>" + 中身(積.join("<br>")) + "</p>"); 積.length = 0; }
    }
    var 積 = [];

    while (i < 行.length) {
      var l = 行[i];

      /* ``` の 3 連（図・コード） */
      var f = /^\s*```\s*(\S*)\s*$/.exec(l);
      if (f) {
        段落を閉じる(積);
        var 種 = f[1] || "", 中 = [];
        i++;
        while (i < 行.length && !/^\s*```\s*$/.test(行[i])) { 中.push(行[i]); i++; }
        i++;
        if (/^(図形|図|zu|geo|geometry|flow|diagram|graph|グラフ|chart)$/i.test(種)) {
          /* ★ 座標で 描く 図形（core/geo/draw.js）。
             **合っていない図は 描かない。**言われた長さと 座標が
             食い違ったら、理由を 出して 文字のまま 見せる。 */
          var G = root.VQG;
          var 元 = 実体を戻す(中.join("\n"));
          /* ★ 1 行で 済む 図（関数・円グラフ・立体…）は **その行だけ**で 描く。
             座標で 組む 図（点・線・多角形）は まとめて 図形エンジンへ。
             1 つの ブロックに 両方 混ざっていても よい。 */
          var 一括 = [], 座標行 = [], だめら = [];
          元.split("\n").forEach(function (l2) {
            if (!l2.trim()) return;
            var one = null;
            try { one = G && G.more ? G.more.一行(l2) : null; } catch (e2) { one = null; }
            if (!one) { try { one = G && G.sci ? G.sci.一行(l2) : null; } catch (e4) { one = null; } }
            if (one) { 一括.push('<div class="vqmd-geo">' + one + "</div>"); return; }
            /* ★ 昔からの かんたんな図（長方形・座標…）も **ここで 拾う**
               （2026-08-17・実測）。座標エンジンへ 回してから 拾おうとすると、
               「描くものが ありません」で 落ちて 図が 1 つも 出なくなる。
               図に ならない行は そのまま 座標エンジンへ 渡す。 */
            var 簡 = null;
            try { 簡 = 図にする(l2); } catch (e5) { 簡 = null; }
            if (簡 && 簡.indexOf("vqmd-zu-f") >= 0) { 一括.push(簡); return; }
            /* more が 断ったのが「点検で 落ちた」なら 理由を 残す */
            try {
              if (G && G.more && G.more.なぜだめ && G.more.なぜだめ()
                  && /^([^\s:：]+)\s*[:：]/.test(l2)) だめら.push(G.more.なぜだめ());
            } catch (e3) {}
            座標行.push(l2);
          });
          if (一括.length) 出.push(一括.join(""));
          if (!座標行.length) {
            if (だめら.length) 出.push('<div class="vqmd-geo-ng">'
              + esc(だめら.slice(0, 2).join(" ／ ")) + "</div>");
            continue;
          }
          元 = 座標行.join("\n");
          var r2 = G && G.描く ? G.描く(元, {}) : { だめ: "図形の道具が ありません" };
          /* ★ 座標の 図として 読めなかったら、**流れ図として** 出す
             （はじめ -> つぎ のような 書き方は こちら）。
             どちらでも 読めないときだけ 理由を 出す。 */
          if (!(r2 && r2.svg)) {
            var 流 = 図にする(元);
            if (流 && 流.indexOf("vqmd-zu-b") >= 0) { 出.push(流); continue; }
          }
          if (r2 && r2.svg) {
            出.push('<div class="vqmd-geo">' + r2.svg
              /* 書かれた数と ちがったときは **黙らずに** 下へ 一言 */
              + ((r2.ちがい && r2.ちがい.length)
                 ? '<div class="vqmd-geo-note">図は 座標のとおりに 描きました。'
                   + esc(r2.ちがい.join(" ／ ")) + "</div>" : "")
              + "</div>");
          }
          else {
            出.push('<div class="vqmd-geo-ng"><b>この図は 描けません</b><br>'
              + esc((r2 && r2.だめ) || "読めません") + "</div>");
            出.push('<pre class="vqmd-pre"><code>' + esc(元) + "</code></pre>");
          }
        } else if (/^(図|zu|flow|diagram)$/i.test(種)) 出.push(図にする(実体を戻す(中.join("\n"))));
        else 出.push('<pre class="vqmd-pre"><code>' + 中.join("\n") + "</code></pre>");
        continue;
      }

      /* 表 */
      if (/\|/.test(l) && i + 1 < 行.length && 区切り行か(行[i + 1])) {
        段落を閉じる(積);
        var 頭 = 表の行(l);
        i += 2;
        var 体 = [];
        while (i < 行.length && /\|/.test(行[i]) && 行[i].trim()) { 体.push(表の行(行[i])); i++; }
        var t = ['<div class="vqmd-tw"><table class="vqmd-t"><thead><tr>'];
        頭.forEach(function (c) { t.push("<th>" + 中身(c) + "</th>"); });
        t.push("</tr></thead><tbody>");
        体.forEach(function (r) {
          t.push("<tr>");
          for (var k = 0; k < 頭.length; k++) t.push("<td>" + 中身(r[k] || "") + "</td>");
          t.push("</tr>");
        });
        t.push("</tbody></table></div>");
        出.push(t.join(""));
        continue;
      }

      /* 見出し */
      var h = /^(#{1,6})\s+(.*)$/.exec(l);
      if (h) {
        段落を閉じる(積);
        var n = Math.min(6, h[1].length);
        出.push("<h" + n + ' class="vqmd-h">' + 中身(h[2]) + "</h" + n + ">");
        i++; continue;
      }

      /* 区切り */
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) {
        段落を閉じる(積); 出.push('<hr class="vqmd-hr">'); i++; continue;
      }

      /* 引用 */
      if (/^\s*&gt;\s?/.test(l)) {
        段落を閉じる(積);
        var q = [];
        while (i < 行.length && /^\s*&gt;\s?/.test(行[i])) {
          q.push(行[i].replace(/^\s*&gt;\s?/, "")); i++;
        }
        出.push('<blockquote class="vqmd-q">' + 中身(q.join("<br>")) + "</blockquote>");
        continue;
      }

      /* 箇条書き・番号つき（2 文字ぶんで 入れ子） */
      if (/^\s*([-*+]|\d+\.)\s+/.test(l)) {
        段落を閉じる(積);
        var 山 = [], 深さ = [];
        while (i < 行.length && /^\s*([-*+]|\d+\.)\s+/.test(行[i])) {
          var m2 = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(行[i]);
          var d = Math.floor(m2[1].replace(/\t/g, "  ").length / 2);
          var 番 = /\d/.test(m2[2]);
          while (深さ.length > d + 1) { 山.push(深さ.pop() === "ol" ? "</ol>" : "</ul>"); }
          if (深さ.length < d + 1) {
            深さ.push(番 ? "ol" : "ul");
            山.push(番 ? '<ol class="vqmd-ol">' : '<ul class="vqmd-ul">');
          }
          山.push("<li>" + 中身(m2[3]) + "</li>");
          i++;
        }
        while (深さ.length) { 山.push(深さ.pop() === "ol" ? "</ol>" : "</ul>"); }
        出.push(山.join(""));
        continue;
      }

      /* 空行＝段落の切れ目 */
      if (!l.trim()) { 段落を閉じる(積); i++; continue; }

      積.push(l);
      i++;
    }
    段落を閉じる(積);
    return 出.join("");
  }

  /* 飾りを 落として 素の文にする（読み上げ・記録・字数に使う） */
  function 素(src) {
    return 文(src)
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/^\s*#{1,6}\s+/gm, "")
      .replace(/^\s*&gt;\s?/gm, "").replace(/^\s*>\s?/gm, "")
      .replace(/\*\*|__|~~|==([rbgyp]:)?|`/g, "")
      .replace(/^\s*([-*+]|\d+\.)\s+/gm, "")
      .replace(/\|/g, " ")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }

  /* 飾りが 入っていそうか（入っていなければ そのまま 文字で出す） */
  function 飾りがある(src) {
    var s = 文(src);
    return /(^|\n)\s*#{1,6}\s|\*\*|__|~~|==|```|(^|\n)\s*[-*+]\s|(^|\n)\s*\d+\.\s|(^|\n)\s*&?gt;?\s|\|.*\|/.test(s)
      /* ★ 数式は **$ だけでは ない**（2026-08-17）。\(…\)・\[…\]・
         \begin{…} も 数式。ここで 見落とすと、帯（島）が
         素の字のまま 出す。 */
      || /\$[^$\n]+\$/.test(s)
      || /\\\([\s\S]+?\\\)/.test(s)
      || /\\\[[\s\S]+?\\\]/.test(s)
      || /\\begin\{[a-zA-Z*]+\}/.test(s)
      /* 囲みの無い \frac{…} なども 数式（訴え「frac が 効いていない」） */
      || /\\(frac|dfrac|cfrac|sqrt|sum|int|lim|binom|vec|overline|times|div|pm|leq|geq|neq|approx|pi|theta|alpha|beta|infty|cdot)\b/.test(s);
  }

  function CSS() {
    return [
      ".vqmd{line-height:1.75;word-break:break-word;}",
      ".vqmd p{margin:.35em 0;}",
      ".vqmd .vqmd-h{margin:.5em 0 .3em;font-weight:700;line-height:1.4;}",
      ".vqmd h1.vqmd-h{font-size:1.24em}.vqmd h2.vqmd-h{font-size:1.14em}",
      ".vqmd h3.vqmd-h{font-size:1.06em}.vqmd h4.vqmd-h,.vqmd h5.vqmd-h,.vqmd h6.vqmd-h{font-size:1em}",
      ".vqmd strong{font-weight:700;}",
      ".vqmd u{text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:2px;}",
      ".vqmd s{opacity:.6;}",
      ".vqmd mark{background:rgba(255,214,0,.34);color:inherit;padding:0 .18em;border-radius:4px;}",
      ".vqmd mark.vqmd-r{background:rgba(229,72,77,.28);}",
      ".vqmd mark.vqmd-b{background:rgba(43,112,239,.24);}",
      ".vqmd mark.vqmd-g{background:rgba(46,160,67,.26);}",
      ".vqmd mark.vqmd-y{background:rgba(255,214,0,.34);}",
      ".vqmd mark.vqmd-p{background:rgba(138,129,194,.30);}",
      ".vqmd mark.vqmd-o{background:rgba(255,140,0,.30);}",
      ".vqmd u.vqmd-un{text-decoration-color:rgba(229,72,77,.75);}",
      ".vqmd .vqmd-no{display:inline-flex;align-items:center;justify-content:center;",
      "min-width:1.15em;height:1.15em;margin-right:.25em;border-radius:999px;",
      "background:rgba(229,72,77,.85);color:#fff;font-size:.72em;font-style:normal;",
      "font-weight:700;vertical-align:.08em;}",
      ".vqmd .vqmd-l{text-decoration:underline;opacity:.85;}",
      ".vqmd .vqmd-c{background:rgba(127,127,127,.18);border-radius:5px;padding:.05em .32em;",
      "font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.92em;}",
      ".vqmd .vqmd-pre{background:rgba(127,127,127,.14);border-radius:10px;padding:.6em .7em;",
      "overflow-x:auto;margin:.4em 0;}",
      ".vqmd .vqmd-pre code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.88em;",
      "white-space:pre;background:none;padding:0;}",
      ".vqmd .vqmd-q{margin:.4em 0;padding:.25em .7em;border-left:3px solid currentColor;opacity:.85;}",
      ".vqmd .vqmd-hr{border:0;border-top:1px solid currentColor;opacity:.22;margin:.6em 0;}",
      ".vqmd .vqmd-ul,.vqmd .vqmd-ol{margin:.3em 0;padding-left:1.35em;}",
      ".vqmd li{margin:.12em 0;}",
      ".vqmd .vqmd-tw{overflow-x:auto;margin:.45em 0;}",
      ".vqmd .vqmd-t{border-collapse:collapse;font-size:.94em;min-width:100%;}",
      ".vqmd .vqmd-t th,.vqmd .vqmd-t td{border:1px solid rgba(127,127,127,.35);",
      "padding:.28em .5em;text-align:left;white-space:nowrap;}",
      ".vqmd .vqmd-t th{background:rgba(127,127,127,.16);font-weight:700;}",
      ".vqmd .vqmd-math{display:inline-block;}",
      ".vqmd .vqmd-math-b{display:block;margin:.4em 0;}",
      ".vqmd .vqmd-zu{display:flex;flex-direction:column;gap:.35em;margin:.45em 0;}",
      ".vqmd .vqmd-zu-r{display:flex;align-items:center;gap:.3em;flex-wrap:wrap;}",
      ".vqmd .vqmd-zu-b{border:1px solid currentColor;border-radius:9px;padding:.22em .6em;",
      "opacity:.95;font-size:.95em;}",
      ".vqmd .vqmd-zu-a{opacity:.6;font-style:normal;}",
      ".vqmd .vqmd-zu-f{margin:.2em 0;}",
      ".vqmd .vqmd-geo{margin:.4em 0;}",
      ".vqmd .vqmd-geo-note{font-size:.82em;line-height:1.6;opacity:.75;margin-top:.2em;}",
      ".vqmd .vqmd-geo-ng{margin:.4em 0;padding:.5em .7em;border-radius:9px;",
      "background:rgba(229,72,77,.14);font-size:.9em;line-height:1.6;}",
      /* ★ 実寸で 出す。width を 付けないと SVG は 入れ物いっぱいに 広がり、
         ボードの幅（660px）まで 引き伸ばされて **はみ出して 切れる**
         （実測: 三角形が ボードを 突き抜けた）。 */
      ".vqmd .vqmd-fig{max-width:100%;height:auto;overflow:visible;display:block;}",
      ".vqmd .vqmd-fig .ax{stroke:currentColor;stroke-width:1.4;opacity:.75}",
      ".vqmd .vqmd-fig .tk{stroke:currentColor;stroke-width:1.1;opacity:.55}",
      ".vqmd .vqmd-fig .rg{stroke:#e5484d;stroke-width:3.4;stroke-linecap:round}",
      ".vqmd .vqmd-fig .gl{stroke:#2b70ef;stroke-width:2.4;stroke-linecap:round}",
      ".vqmd .vqmd-fig .pt{fill:#e5484d;stroke:#e5484d;stroke-width:1.6}",
      ".vqmd .vqmd-fig .pto{fill:none;stroke:#e5484d;stroke-width:2}",
      ".vqmd .vqmd-fig .sh{fill:rgba(43,112,239,.10);stroke:currentColor;stroke-width:1.6}",
      ".vqmd .vqmd-fig .rt{fill:none;stroke:currentColor;stroke-width:1.3;opacity:.8}",
      ".vqmd .vqmd-fig .lb{fill:currentColor;font-size:11px;text-anchor:middle;",
      "font-family:inherit;opacity:.9}"
    ].join("");
  }

  VQMD.render = render;
  VQMD.素 = 素;
  VQMD.飾りがある = 飾りがある;
  VQMD.CSS = CSS;
})(typeof globalThis !== "undefined" ? globalThis : this);
