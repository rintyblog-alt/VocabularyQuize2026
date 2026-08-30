/* ══════════════════════════════════════════════════════════════════════
   vq-fig.js — 試験の 紙面に **資料（図・表・グラフ）を 正確に** 出す

   訴え（2026-08-30・Rinty さん）
     「資料問題。フリー画像・SVG・表や図形を 問題用紙に ずれなく 正確に」

   ★ なぜ 別ファイルか
     vq2-app は 85,919 行。新しい 機能は そこへ 足さない（js-src/README.md）。
     vq-call.js / vq-make.js と 同じ 作法で、自分の ファイル・自分の 指紋。
     紙面（pdfRenderer）は `window.VQFIG` が **在るときだけ** ここを 通す。
     読めていない ときは これまでの 描きかたに 落ちる（機能を 落とさない）。

   ★ いちばん 大事な 決めごと
     **AI に SVG を 書かせない。**
     AI が 出せるのは 「何を 描くか」の **数値と 名前**だけ（下の 語彙）。
     線を 引くのは ここの コード。こうしないと
       ・目盛りが 合わない ・軸が ずれる ・印刷で はみ出す
     が 毎回 別の 形で 出る（Workplace の グラフで 実際に 踏んだ）。
     どうしても 生の SVG が 来たとき（利用者の 添付・Commons の 絵）は
     VQSVG.清める を 必ず 通してから 入れる。

   ★ 紙に 出るための 決めごと
     ・大きさは **mm**。em や % で 決めない（拡大率で ずれる）。
     ・線は 0.4pt 以上（それ 未満は 印刷で 消える）。
     ・色は 使わない のを 既定に する（白黒 印刷で 潰れる）。
       区別が 要るときは **模様（斜線・点）と ラベル**で 分ける。
     ・図は 途中で 切らない（break-inside: avoid）。
     ・出どころ（作者・ライセンス）は **必ず 一緒に 出す**。CC の 表示義務。

   出しているもの: window.VQFIG = { 描く, CSS, 清める, 版 }
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQFIG = root.VQFIG || (root.VQFIG = {});
  var 版 = "2026-08-30.1";

  /* ── 小道具 ───────────────────────────────────────────────── */
  function esc(s) {
    return String(s === undefined || s === null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function 数(v, 既定) {
    var n = Number(v);
    return isFinite(n) ? n : (既定 === undefined ? 0 : 既定);
  }
  function 挟む(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function 配列(v) { return Array.isArray(v) ? v : []; }
  function 文(v) { return v === undefined || v === null ? "" : String(v); }
  /* 座標は 小数 2 桁まで。これ以上は 紙の上で 意味が 無く、
     長い 小数は SVG を 太らせるだけ。 */
  function c(n) { return Math.round(数(n) * 100) / 100; }

  /* ── 図の 大きさ。紙の 段の 幅を 超えない ─────────────────── */
  var 既定幅mm = 84;      /* 2 段組の 1 段に 収まる 幅 */
  var 最大幅mm = 170;     /* A4 の 版面いっぱい */
  function 幅mm(b) {
    return 挟む(数(b && (b.widthMm || b.maxWidthMm), 既定幅mm), 20, 最大幅mm);
  }

  /* ══════════════════════════════════════════════════════════════
     ① 清める（生の SVG が 来たとき）
     VQSVG（core/wp/svg.js）が 読めていれば そちらが 正。
     読めていない ときのために、ここにも 最低限の ものを 置く。
     **二重に 守る**（サーバでも 一度 清めている）。
     ══════════════════════════════════════════════════════════════ */
  function 清める(生) {
    var s = 文(生);
    if (!s) return { ok: false, なぜ: "空です" };
    try {
      if (root.VQSVG && typeof root.VQSVG.清める === "function") {
        var r = root.VQSVG.清める(s);
        if (r && r.ok && r.svg) return { ok: true, svg: r.svg, 直した: r.直した || 0 };
        if (r && r.なぜ) return { ok: false, なぜ: r.なぜ };
      }
    } catch (e) {}
    /* 落ちてきた ときの 最低限。許すものだけ 通す やりかたは
       ここでは 組めないので、**危ないものを 落として から 形を 見る**。
       これで 通らない ものは 出さない（出さないほうが 安全）。 */
    if (s.length > 400 * 1024) return { ok: false, なぜ: "大きすぎます" };
    var t = s
      .replace(/<\?xml[\s\S]*?\?>/gi, "")
      .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
      .replace(/<(iframe|object|embed|video|audio|animate|animateMotion|animateTransform|set)\b[\s\S]*?<\/\1>/gi, "")
      .replace(/<(iframe|object|embed|video|audio|animate|animateMotion|animateTransform|set)\b[^>]*\/?>/gi, "")
      .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/(xlink:href|href)\s*=\s*("(?!#|data:image\/)[^"]*"|'(?!#|data:image\/)[^']*')/gi, "")
      .replace(/@import[^;]*;/gi, "")
      .replace(/url\(\s*(['"]?)(?!#|data:image\/)[^)]*\)/gi, "none");
    if (!/^\s*<svg[\s>]/i.test(t)) return { ok: false, なぜ: "SVG では ありません" };
    return { ok: true, svg: t, 直した: 0 };
  }

  /* ══════════════════════════════════════════════════════════════
     ② 絵（画像）
     出せるのは **手元に あるもの**だけ。
       data:image/…      … 埋め込み
       /api/media/…      … このアプリの 置き場（同じ出どころ）
       blob:             … その場で 読み込んだ もの
     外の 住所（https://…）は **そのまま 出さない**。
     印刷の とき 取りに 行けず、白い 四角に なるため。
     取り込みは /api/stock/adopt が 済ませている 前提。
     ══════════════════════════════════════════════════════════════ */
  function 出せる住所か(u) {
    var s = 文(u).trim();
    if (!s) return "";
    if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i.test(s)) return s;
    if (/^blob:/i.test(s)) return s;
    if (/^\/api\/media\//.test(s)) return s;
    if (/^\/(img|assets|media)\//.test(s)) return s;
    return "";
  }

  /* 出どころの 一行。CC の 絵は これを 出さないと 使えない。 */
  function 出典(b) {
    var k = (b && b.credit) || null;
    if (!k) return "";
    var 並 = [];
    if (文(k.author)) 並.push(文(k.author));
    if (文(k.source)) 並.push(文(k.source));
    if (文(k.license)) 並.push(文(k.license));
    if (!並.length) return "";
    return '<div class="vf-cr">出典：' + esc(並.join(" / ")) + "</div>";
  }

  function 絵を描く(b) {
    var w = 幅mm(b);
    var src = 出せる住所か(b.src || b.url || b.dataUrl);
    if (!src) {
      /* 出せない ときは **黙って 空けない**。何が 足りないかを 書く。
         白い 隙間は「壊れている」に 見えるうえ、直しようが 分からない。 */
      return '<div class="vf vf-miss" style="max-width:' + w + 'mm">'
        + '<div class="vf-missb">図を 出せません</div>'
        + '<div class="vf-missw">' + esc(b.caption || "（図）") + "</div>"
        + (b.src ? '<div class="vf-missw">取り込みが 済んでいません</div>' : "")
        + "</div>";
    }
    return '<div class="vf" style="max-width:' + w + 'mm">'
      + '<img src="' + esc(src) + '" alt="' + esc(b.caption || "図") + '">'
      + (b.caption ? '<div class="vf-cap">' + esc(b.caption) + "</div>" : "")
      + 出典(b) + "</div>";
  }

  /* 生の SVG を そのまま 置く（清めた あと） */
  function 生SVGを描く(b) {
    var w = 幅mm(b);
    var r = 清める(b.svg || b.source || b.markup);
    if (!r.ok) {
      return '<div class="vf vf-miss" style="max-width:' + w + 'mm">'
        + '<div class="vf-missb">図を 出せません</div>'
        + '<div class="vf-missw">' + esc(r.なぜ) + "</div></div>";
    }
    /* 幅は こちらが 決める。中の width/height は 外す（はみ出しの 元）。 */
    var svg = r.svg.replace(/<svg\b([^>]*)>/i, function (全, 属) {
      var a = 属
        .replace(/\swidth\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
        .replace(/\sheight\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
      if (!/viewBox/i.test(a)) a += ' viewBox="0 0 100 100"';
      return "<svg" + a + ' width="100%" preserveAspectRatio="xMidYMid meet">';
    });
    return '<div class="vf" style="max-width:' + w + 'mm">'
      + '<div class="vf-svg">' + svg + "</div>"
      + (b.caption ? '<div class="vf-cap">' + esc(b.caption) + "</div>" : "")
      + 出典(b) + "</div>";
  }

  /* ══════════════════════════════════════════════════════════════
     ③ 表
     いまの 描きかたは 「1 行目が 見出し」だけだった。
     試験の 表は それでは 足りない:
       ・見出しの 列（左端）も 見出しに する
       ・数は 右寄せ（けたが そろわないと 読めない）
       ・列ごとの 寄せかたを 指定できる
       ・題（caption）を 上に 出す
       ・空欄（うめる ところ）を はっきり 見せる
     ══════════════════════════════════════════════════════════════ */
  var 寄せ = { left: "l", center: "c", right: "r", 左: "l", 中央: "c", 右: "r" };
  function 数の文字か(s) {
    var t = 文(s).trim().replace(/[,，\s]/g, "");
    return !!t && /^[+\-−]?[0-9０-９]+(\.[0-9０-９]+)?%?$/.test(t);
  }
  function 表を描く(b) {
    var rows = 配列(b.rows).map(function (r) { return Array.isArray(r) ? r : [r]; });
    if (!rows.length) return "";
    var 見出し行 = b.header !== false;
    var 見出し列 = b.headerColumn === true || b.rowHeader === true;
    var 列数 = 0;
    rows.forEach(function (r) { if (r.length > 列数) 列数 = r.length; });
    /* 列ごとの 寄せ。指定が 無い列は 中身から 決める（数なら 右）。 */
    var 指定 = 配列(b.align).map(function (a) { return 寄せ[文(a).toLowerCase()] || 寄せ[文(a)] || ""; });
    var 自動 = [];
    for (var j = 0; j < 列数; j++) {
      var 数え = 0, 全 = 0;
      for (var i = 見出し行 ? 1 : 0; i < rows.length; i++) {
        var v = rows[i][j];
        if (v === undefined || 文(v) === "") continue;
        全++; if (数の文字か(v)) 数え++;
      }
      自動[j] = (全 > 0 && 数え === 全) ? "r" : "c";
    }
    var 幅 = 配列(b.columnWidths).map(function (x) { return 数(x, 0); });

    var h = '<div class="vf-tw" style="max-width:' + 幅mm(b) + 'mm">';
    if (b.caption) h += '<div class="vf-tcap">' + esc(b.caption) + "</div>";
    h += '<table class="tbl vf-t" data-block="' + esc(b.id || "") + '">';
    if (幅.length) {
      h += "<colgroup>";
      for (var k = 0; k < 列数; k++) {
        h += 幅[k] > 0 ? '<col style="width:' + 挟む(幅[k], 1, 100) + '%">' : "<col>";
      }
      h += "</colgroup>";
    }
    rows.forEach(function (r, ri) {
      h += "<tr>";
      for (var j2 = 0; j2 < 列数; j2++) {
        var 値 = r[j2];
        var 頭 = (見出し行 && ri === 0) || (見出し列 && j2 === 0);
        var tag = 頭 ? "th" : "td";
        var a = 頭 ? "c" : (指定[j2] || 自動[j2] || "c");
        /* 「」や null は **うめる ところ**。線だけの マスに する。 */
        var 空 = 値 === undefined || 値 === null || 文(値) === "";
        h += "<" + tag + ' class="a-' + a + (空 && !頭 ? " vf-blank" : "") + '">'
          + (空 ? "" : esc(値)) + "</" + tag + ">";
      }
      h += "</tr>";
    });
    h += "</table>";
    if (b.note) h += '<div class="vf-tnote">' + esc(b.note) + "</div>";
    h += 出典(b) + "</div>";
    return h;
  }

  /* ══════════════════════════════════════════════════════════════
     ④ グラフ（chart）— **数から 線を 引く**。AI に 描かせない。
     出せる 種類: bar / line / scatter / pie
     色は 使わない。白黒で 分かるよう 模様と ラベルで 分ける。
     ══════════════════════════════════════════════════════════════ */
  var 模様 = ["none", "diag", "dots", "cross", "vert", "horiz", "solid"];
  function 模様定義() {
    return [
      '<pattern id="p-diag" width="5" height="5" patternUnits="userSpaceOnUse">'
        + '<path d="M0,5 L5,0" stroke="#000" stroke-width="0.7"/></pattern>',
      '<pattern id="p-dots" width="5" height="5" patternUnits="userSpaceOnUse">'
        + '<circle cx="2.5" cy="2.5" r="0.9" fill="#000"/></pattern>',
      '<pattern id="p-cross" width="6" height="6" patternUnits="userSpaceOnUse">'
        + '<path d="M0,6 L6,0 M0,0 L6,6" stroke="#000" stroke-width="0.6"/></pattern>',
      '<pattern id="p-vert" width="5" height="5" patternUnits="userSpaceOnUse">'
        + '<path d="M2.5,0 L2.5,5" stroke="#000" stroke-width="0.8"/></pattern>',
      '<pattern id="p-horiz" width="5" height="5" patternUnits="userSpaceOnUse">'
        + '<path d="M0,2.5 L5,2.5" stroke="#000" stroke-width="0.8"/></pattern>'
    ].join("");
  }
  function 塗り(i) {
    var m = 模様[i % 模様.length];
    if (m === "none") return "#fff";
    if (m === "solid") return "#000";
    return "url(#p-" + m + ")";
  }
  /* 目盛りの 刻み。「きりの よい 数」に する（1 / 2 / 5 × 10^n）。
     ここを 適当に すると 軸の 数字が 3.7 などに なり、読めない 紙に なる。 */
  function きりのよい刻み(幅, 本数) {
    if (!(幅 > 0)) return 1;
    var 生 = 幅 / Math.max(1, 本数);
    var 桁 = Math.pow(10, Math.floor(Math.log(生) / Math.LN10));
    var r = 生 / 桁;
    var m = r <= 1 ? 1 : r <= 2 ? 2 : r <= 5 ? 5 : 10;
    return m * 桁;
  }
  function 軸の範囲(値ら, 零から) {
    var mn = Infinity, mx = -Infinity;
    値ら.forEach(function (v) { if (isFinite(v)) { if (v < mn) mn = v; if (v > mx) mx = v; } });
    if (!isFinite(mn)) { mn = 0; mx = 1; }
    if (零から !== false && mn > 0) mn = 0;
    if (零から !== false && mx < 0) mx = 0;
    if (mn === mx) { mx = mn + 1; }
    var 刻 = きりのよい刻み(mx - mn, 5);
    var 下 = Math.floor(mn / 刻) * 刻;
    var 上 = Math.ceil(mx / 刻) * 刻;
    if (下 === 上) 上 = 下 + 刻;
    return { 下: 下, 上: 上, 刻: 刻 };
  }
  function 数の見た目(v, 刻) {
    var 桁 = 刻 < 1 ? Math.min(3, Math.ceil(-Math.log(刻) / Math.LN10)) : 0;
    return (Math.round(v * Math.pow(10, 桁)) / Math.pow(10, 桁)).toFixed(桁);
  }

  /* 図の 中の 座標系。100 × 高さ の 箱で 描き、外で mm に 合わせる。 */
  function グラフを描く(b) {
    var 種 = 文(b.chartType || b.chart || b.variant || "bar").toLowerCase();
    var 系列 = 配列(b.series);
    var ラベル = 配列(b.labels).map(文);
    if (!系列.length && 配列(b.values).length) 系列 = [{ name: 文(b.name), values: b.values }];
    系列 = 系列.map(function (s, i) {
      return { name: 文(s && s.name) || ("系列" + (i + 1)), values: 配列(s && s.values).map(function (v) { return 数(v, NaN); }) };
    }).filter(function (s) { return s.values.length; }).slice(0, 6);
    if (!系列.length) {
      return '<div class="vf vf-miss" style="max-width:' + 幅mm(b) + 'mm">'
        + '<div class="vf-missb">グラフを 出せません</div>'
        + '<div class="vf-missw">数が ありません</div></div>';
    }
    if (種 === "pie" || 種 === "円" || 種 === "円グラフ") return 円グラフ(b, 系列[0], ラベル);
    return 軸グラフ(b, 種, 系列, ラベル);
  }

  function 軸グラフ(b, 種, 系列, ラベル) {
    var W = 320, H = 数(b.heightRatio, 0.62) * W;
    var 左 = 42, 右 = 10, 上 = 12, 下 = 系列.length > 1 ? 46 : 32;
    var pw = W - 左 - 右, ph = H - 上 - 下;
    var 全値 = [];
    系列.forEach(function (s) { s.values.forEach(function (v) { if (isFinite(v)) 全値.push(v); }); });
    var R = 軸の範囲(全値, b.zeroBased);
    var n = 0;
    系列.forEach(function (s) { if (s.values.length > n) n = s.values.length; });
    function Y(v) { return 上 + ph - ((v - R.下) / (R.上 - R.下)) * ph; }

    var g = [];
    /* 目盛りと 横線。薄い 線は 印刷で 消えるので 0.4pt 相当を 下限に。 */
    for (var v = R.下; v <= R.上 + 1e-9; v += R.刻) {
      var y = c(Y(v));
      g.push('<line x1="' + 左 + '" y1="' + y + '" x2="' + (左 + pw) + '" y2="' + y
        + '" stroke="#000" stroke-width="' + (Math.abs(v) < 1e-9 ? 1 : 0.4) + '"'
        + (Math.abs(v) < 1e-9 ? "" : ' stroke-dasharray="2 2"') + ' opacity="' + (Math.abs(v) < 1e-9 ? 1 : 0.55) + '"/>');
      g.push('<text x="' + (左 - 4) + '" y="' + c(y + 3.4) + '" text-anchor="end" font-size="9">'
        + esc(数の見た目(v, R.刻)) + "</text>");
    }
    /* 縦軸・横軸 */
    g.push('<line x1="' + 左 + '" y1="' + 上 + '" x2="' + 左 + '" y2="' + (上 + ph) + '" stroke="#000" stroke-width="1"/>');
    g.push('<line x1="' + 左 + '" y1="' + (上 + ph) + '" x2="' + (左 + pw) + '" y2="' + (上 + ph) + '" stroke="#000" stroke-width="1"/>');

    if (種 === "bar" || 種 === "棒" || 種 === "棒グラフ") {
      var 帯 = pw / Math.max(1, n);
      var 隙 = 帯 * 0.22;
      var 幅1 = (帯 - 隙) / 系列.length;
      系列.forEach(function (s, si) {
        s.values.forEach(function (val, i) {
          if (!isFinite(val)) return;
          var x = c(左 + i * 帯 + 隙 / 2 + si * 幅1);
          var y0 = Y(Math.max(0, R.下)), y1 = Y(val);
          var y = c(Math.min(y0, y1)), hh = c(Math.abs(y1 - y0));
          g.push('<rect x="' + x + '" y="' + y + '" width="' + c(幅1 * 0.94) + '" height="' + hh
            + '" fill="' + 塗り(si) + '" stroke="#000" stroke-width="0.7"/>');
        });
      });
    } else if (種 === "scatter" || 種 === "散布図") {
      var xs = 配列(b.x).map(function (v) { return 数(v, NaN); });
      var XR = xs.length ? 軸の範囲(xs, false) : { 下: 0, 上: Math.max(1, n - 1), 刻: 1 };
      系列.forEach(function (s, si) {
        s.values.forEach(function (val, i) {
          if (!isFinite(val)) return;
          var xv = xs.length ? xs[i] : i;
          if (!isFinite(xv)) return;
          var x = c(左 + ((xv - XR.下) / (XR.上 - XR.下)) * pw);
          g.push('<circle cx="' + x + '" cy="' + c(Y(val)) + '" r="2.6" fill="'
            + (si % 2 ? "#fff" : "#000") + '" stroke="#000" stroke-width="0.8"/>');
        });
      });
    } else {
      /* 折れ線。系列は 線の 引きかた（実線・破線…）で 分ける。 */
      var 線型 = ["", "5 3", "2 2", "7 3 2 3", "1 3"];
      系列.forEach(function (s, si) {
        var 点 = [];
        s.values.forEach(function (val, i) {
          if (!isFinite(val)) return;
          var x = c(左 + (n === 1 ? pw / 2 : (i / (n - 1)) * pw));
          点.push([x, c(Y(val))]);
        });
        if (!点.length) return;
        g.push('<polyline points="' + 点.map(function (p) { return p[0] + "," + p[1]; }).join(" ")
          + '" fill="none" stroke="#000" stroke-width="1.2"'
          + (線型[si % 線型.length] ? ' stroke-dasharray="' + 線型[si % 線型.length] + '"' : "") + "/>");
        点.forEach(function (p) {
          g.push('<circle cx="' + p[0] + '" cy="' + p[1] + '" r="2.2" fill="'
            + (si % 2 ? "#fff" : "#000") + '" stroke="#000" stroke-width="0.8"/>');
        });
      });
    }

    /* 横の ラベル。多すぎる ときは 間引く（重なると 読めない）。 */
    var 間 = Math.ceil(n / 12) || 1;
    for (var i2 = 0; i2 < n; i2++) {
      if (i2 % 間) continue;
      var ラ = ラベル[i2];
      if (!ラ) continue;
      var cx = (種 === "bar" || 種 === "棒")
        ? 左 + (i2 + 0.5) * (pw / Math.max(1, n))
        : 左 + (n === 1 ? pw / 2 : (i2 / (n - 1)) * pw);
      g.push('<text x="' + c(cx) + '" y="' + c(上 + ph + 12) + '" text-anchor="middle" font-size="9">'
        + esc(String(ラ).slice(0, 10)) + "</text>");
    }
    /* 軸の 名前 */
    if (b.xLabel) g.push('<text x="' + c(左 + pw / 2) + '" y="' + c(H - (系列.length > 1 ? 18 : 4)) + '" text-anchor="middle" font-size="9">' + esc(b.xLabel) + "</text>");
    if (b.yLabel) g.push('<text x="10" y="' + c(上 + ph / 2) + '" text-anchor="middle" font-size="9" transform="rotate(-90 10 ' + c(上 + ph / 2) + ')">' + esc(b.yLabel) + "</text>");
    /* 凡例。系列が 2 つ 以上の ときだけ。 */
    if (系列.length > 1) {
      var lx = 左, ly = H - 8;
      系列.forEach(function (s, si) {
        g.push('<rect x="' + c(lx) + '" y="' + c(ly - 7) + '" width="9" height="7" fill="' + 塗り(si) + '" stroke="#000" stroke-width="0.6"/>');
        g.push('<text x="' + c(lx + 12) + '" y="' + c(ly - 1) + '" font-size="9">' + esc(s.name.slice(0, 14)) + "</text>");
        lx += 14 + Math.min(90, s.name.length * 6 + 10);
      });
    }
    return 図で包む(b, W, H, 模様定義() + g.join(""));
  }

  function 円グラフ(b, 系, ラベル) {
    var W = 300, H = 200;
    var cx = 92, cy = 100, r = 74;
    var 値 = 系.values.filter(function (v) { return isFinite(v) && v > 0; });
    var 和 = 値.reduce(function (a, v) { return a + v; }, 0);
    if (!(和 > 0)) {
      return '<div class="vf vf-miss" style="max-width:' + 幅mm(b) + 'mm">'
        + '<div class="vf-missb">グラフを 出せません</div>'
        + '<div class="vf-missw">合計が 0 です</div></div>';
    }
    var g = [模様定義()];
    var 角 = -Math.PI / 2;
    値.forEach(function (v, i) {
      var d = (v / 和) * Math.PI * 2;
      var x1 = cx + r * Math.cos(角), y1 = cy + r * Math.sin(角);
      var x2 = cx + r * Math.cos(角 + d), y2 = cy + r * Math.sin(角 + d);
      var 大 = d > Math.PI ? 1 : 0;
      g.push('<path d="M' + c(cx) + "," + c(cy) + " L" + c(x1) + "," + c(y1)
        + " A" + r + "," + r + " 0 " + 大 + ",1 " + c(x2) + "," + c(y2) + ' Z" fill="'
        + 塗り(i) + '" stroke="#000" stroke-width="0.8"/>');
      /* 割合は 5% 以上の ときだけ 中に 書く（小さい 扇に 字は 入らない）。 */
      var 率 = v / 和;
      if (率 >= 0.05) {
        var mx = cx + r * 0.62 * Math.cos(角 + d / 2);
        var my = cy + r * 0.62 * Math.sin(角 + d / 2);
        g.push('<text x="' + c(mx) + '" y="' + c(my + 3) + '" text-anchor="middle" font-size="9">'
          + Math.round(率 * 100) + "%</text>");
      }
      角 += d;
    });
    /* 凡例は 右に 縦へ 並べる（円の 中に 名前は 入らない）。 */
    var ly = 100 - Math.min(値.length, 8) * 8;
    値.forEach(function (v, i) {
      if (i >= 8) return;
      g.push('<rect x="184" y="' + c(ly) + '" width="10" height="8" fill="' + 塗り(i) + '" stroke="#000" stroke-width="0.6"/>');
      g.push('<text x="198" y="' + c(ly + 7) + '" font-size="9">'
        + esc(String(ラベル[i] || ("項目" + (i + 1))).slice(0, 12)) + "</text>");
      ly += 16;
    });
    return 図で包む(b, W, H, g.join(""));
  }

  /* ══════════════════════════════════════════════════════════════
     ⑤ 図形（diagram）— 幾何・数直線・座標。
     語彙は 下の ものだけ。知らない 種類は **描かない**（勝手に 作らない）。
       point / segment / line / ray / polygon / circle / arc /
       label / angle / tick / rightangle / arrow / axis / grid
     ══════════════════════════════════════════════════════════════ */
  /* ══ 塗り（2026-08-30・訴え「資料の 図形や 図も この くらいの ものを」）
     実物（共通テスト・情報Ⅰ 図2/図3）は **黒と 白の 塗り分け**で できている。
     これまでは fill が 真偽値で、模様（灰の 網）しか 塗れなかった。
     black / white / none と 模様の 名前を 受ける。 */
  function 塗りを決める(it) {
    var v = it && it.fill;
    if (v === undefined || v === null || v === false || v === "" || v === "none") return "none";
    if (v === true) return 塗り(数(it.fillIndex, 1));
    var t = 文(v).toLowerCase();
    if (t === "black" || t === "黒") return "#000";
    if (t === "white" || t === "白") return "#fff";
    if (t === "gray" || t === "grey" || t === "灰") return "#bdbdbd";
    if (t === "diagonal" || t === "斜線") return "url(#hp0)";
    if (t === "grid" || t === "網") return "url(#hp1)";
    if (t === "dot" || t === "点") return "url(#hp2)";
    var n = Number(v);
    if (isFinite(n)) return 塗り(n);
    return 塗り(数(it.fillIndex, 1));
  }

  function 図形を描く(b) {
    /* 種類は block の type からも 決まる（type:"numberline" で 来る）。
       ここを 見ていなかった ので 数直線が 「描くものが ありません」に なっていた。 */
    var 種 = 文(b.diagramType || b.variant || b.type || "").toLowerCase();
    if (種 === "numberline" || 種 === "数直線") return 数直線(b);
    if (種 === "grid" || 種 === "coordinate" || 種 === "座標") return 座標(b);

    var items = 配列(b.items || b.shapes || b.elements);
    if (!items.length) {
      return '<div class="vf vf-miss" style="max-width:' + 幅mm(b) + 'mm">'
        + '<div class="vf-missb">図を 出せません</div>'
        + '<div class="vf-missw">描くものが ありません</div></div>';
    }
    /* 座標の 範囲を 中身から 決める。指定が あれば それを 使う。 */
    var xs = [], ys = [];
    function 見る(x, y) { if (isFinite(x)) xs.push(x); if (isFinite(y)) ys.push(y); }
    items.forEach(function (it) {
      if (!it) return;
      見る(数(it.x, NaN), 数(it.y, NaN));
      見る(数(it.x1, NaN), 数(it.y1, NaN));
      見る(数(it.x2, NaN), 数(it.y2, NaN));
      if (isFinite(数(it.cx, NaN))) {
        var rr = 数(it.r, 0);
        xs.push(数(it.cx) - rr, 数(it.cx) + rr);
        ys.push(数(it.cy) - rr, 数(it.cy) + rr);
      }
      /* 四角・比の帯は 右上の 角も 数える（w,h を 見ないと 枠から はみ出す）。 */
      if (isFinite(数(it.w, NaN)) && isFinite(数(it.x, NaN))) xs.push(数(it.x) + 数(it.w));
      if (isFinite(数(it.h, NaN)) && isFinite(数(it.y, NaN))) ys.push(数(it.y) + 数(it.h));
      配列(it.points).forEach(function (p) {
        if (Array.isArray(p)) 見る(数(p[0], NaN), 数(p[1], NaN));
        else if (p) 見る(数(p.x, NaN), 数(p.y, NaN));
      });
    });
    if (!xs.length) { xs = [0, 10]; ys = [0, 10]; }
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    if (x1 - x0 < 1e-6) { x0 -= 1; x1 += 1; }
    if (y1 - y0 < 1e-6) { y0 -= 1; y1 += 1; }
    var 余 = Math.max(x1 - x0, y1 - y0) * 0.14;
    x0 -= 余; x1 += 余; y0 -= 余; y1 += 余;

    var W = 320, H = c(W * ((y1 - y0) / (x1 - x0)));
    if (!isFinite(H) || H < 60) H = 60;
    if (H > 380) { H = 380; }
    function X(v) { return c(((v - x0) / (x1 - x0)) * W); }
    /* SVG は 上が 0。数学の 図は 上が 大きい ので 反転する。
       ここを 忘れると 三角形が 上下 さかさまに 出る。 */
    function Y(v) { return c(H - ((v - y0) / (y1 - y0)) * H); }

    var g = ['<marker id="ar" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">'
      + '<path d="M0,0 L7,3 L0,6 z" fill="#000"/></marker>'];
    items.forEach(function (it) {
      if (!it) return;
      var t = 文(it.type).toLowerCase();
      var 太 = Math.max(0.4, 数(it.width, 1));
      var 破 = it.dashed ? ' stroke-dasharray="4 3"' : "";
      if (t === "point" || t === "点") {
        g.push('<circle cx="' + X(数(it.x)) + '" cy="' + Y(数(it.y)) + '" r="2.8" fill="'
          + (it.hollow ? "#fff" : "#000") + '" stroke="#000" stroke-width="0.9"/>');
        if (it.label) g.push('<text x="' + c(X(数(it.x)) + 5) + '" y="' + c(Y(数(it.y)) - 5) + '" font-size="11">' + esc(it.label) + "</text>");
      } else if (t === "segment" || t === "line" || t === "ray" || t === "arrow" || t === "線分" || t === "直線" || t === "矢印") {
        g.push('<line x1="' + X(数(it.x1)) + '" y1="' + Y(数(it.y1)) + '" x2="' + X(数(it.x2)) + '" y2="' + Y(数(it.y2))
          + '" stroke="#000" stroke-width="' + 太 + '"' + 破
          + (t === "arrow" || t === "ray" || t === "矢印" ? ' marker-end="url(#ar)"' : "") + "/>");
        if (it.label) {
          g.push('<text x="' + c((X(数(it.x1)) + X(数(it.x2))) / 2 + 4) + '" y="'
            + c((Y(数(it.y1)) + Y(数(it.y2))) / 2 - 4) + '" font-size="10">' + esc(it.label) + "</text>");
        }
      } else if (t === "polygon" || t === "多角形" || t === "polyline") {
        var 点 = 配列(it.points).map(function (p) {
          var px = Array.isArray(p) ? p[0] : (p && p.x), py = Array.isArray(p) ? p[1] : (p && p.y);
          return X(数(px)) + "," + Y(数(py));
        });
        if (点.length < 2) return;
        g.push("<" + (t === "polyline" ? "polyline" : "polygon") + ' points="' + 点.join(" ")
          + '" fill="' + 塗りを決める(it)
          + '" stroke="#000" stroke-width="' + 太 + '"' + 破 + "/>");
      } else if (t === "circle" || t === "円") {
        var rx = Math.abs(X(数(it.cx) + 数(it.r)) - X(数(it.cx)));
        g.push('<ellipse cx="' + X(数(it.cx)) + '" cy="' + Y(数(it.cy)) + '" rx="' + c(rx)
          + '" ry="' + c(Math.abs(Y(数(it.cy) + 数(it.r)) - Y(数(it.cy))))
          + '" fill="' + 塗りを決める(it)
          + '" stroke="#000" stroke-width="' + 太 + '"' + 破 + "/>");
        if (it.label) g.push('<text x="' + X(数(it.cx)) + '" y="' + c(Y(数(it.cy)) - rx - 4) + '" text-anchor="middle" font-size="10">' + esc(it.label) + "</text>");
      } else if (t === "label" || t === "text" || t === "字") {
        g.push('<text x="' + X(数(it.x)) + '" y="' + Y(数(it.y)) + '" text-anchor="'
          + (it.anchor === "start" ? "start" : it.anchor === "end" ? "end" : "middle")
          + '" font-size="' + 挟む(数(it.size, 11), 7, 20) + '">' + esc(it.text || it.label) + "</text>");
      } else if (t === "rightangle" || t === "直角") {
        /* 直角の 印。頂点と、そこから 伸びる 2 方向で 決める。 */
        var vx = X(数(it.x)), vy = Y(数(it.y));
        var s = 数(it.size, 9);
        var d1 = 数(it.dx1, 1), e1 = 数(it.dy1, 0), d2 = 数(it.dx2, 0), e2 = 数(it.dy2, 1);
        var n1 = Math.hypot(d1, e1) || 1, n2 = Math.hypot(d2, e2) || 1;
        var ax = vx + (d1 / n1) * s, ay = vy - (e1 / n1) * s;
        var bx = vx + (d2 / n2) * s, by = vy - (e2 / n2) * s;
        g.push('<path d="M' + c(ax) + "," + c(ay) + " L" + c(ax + bx - vx) + "," + c(ay + by - vy)
          + " L" + c(bx) + "," + c(by) + '" fill="none" stroke="#000" stroke-width="0.8"/>');
      } else if (t === "angle" || t === "角") {
        var ox = X(数(it.x)), oy = Y(数(it.y));
        var r2 = 数(it.radius, 16);
        var a1 = 数(it.from, 0) * Math.PI / 180, a2 = 数(it.to, 90) * Math.PI / 180;
        var px1 = ox + r2 * Math.cos(a1), py1 = oy - r2 * Math.sin(a1);
        var px2 = ox + r2 * Math.cos(a2), py2 = oy - r2 * Math.sin(a2);
        g.push('<path d="M' + c(px1) + "," + c(py1) + " A" + r2 + "," + r2 + " 0 "
          + (Math.abs(a2 - a1) > Math.PI ? 1 : 0) + ",0 " + c(px2) + "," + c(py2)
          + '" fill="none" stroke="#000" stroke-width="0.8"/>');
        if (it.label) {
          var am = (a1 + a2) / 2;
          g.push('<text x="' + c(ox + (r2 + 9) * Math.cos(am)) + '" y="' + c(oy - (r2 + 9) * Math.sin(am) + 4)
            + '" text-anchor="middle" font-size="10">' + esc(it.label) + "</text>");
        }
      } else if (t === "north" || t === "方位" || t === "方位記号") {
        /* ══ 方位記号（2026-08-30・訴え「地図、絵、様子などを 描くために」）
           実物の 地形図と 同じで、左上に 丸の 中の 北向きの 矢。 */
        var nx0 = X(数(it.x, 0)), ny0 = Y(数(it.y, 0)), nr = 数(it.size, 11);
        g.push('<circle cx="' + c(nx0) + '" cy="' + c(ny0) + '" r="' + c(nr)
          + '" fill="#fff" stroke="#000" stroke-width="0.9"/>');
        g.push('<path d="M' + c(nx0) + "," + c(ny0 - nr * 0.72)
          + " L" + c(nx0 + nr * 0.34) + "," + c(ny0 + nr * 0.56)
          + " L" + c(nx0) + "," + c(ny0 + nr * 0.2)
          + " L" + c(nx0 - nr * 0.34) + "," + c(ny0 + nr * 0.56)
          + ' Z" fill="#000"/>');
        g.push('<text x="' + c(nx0) + '" y="' + c(ny0 - nr - 3)
          + '" text-anchor="middle" font-size="9">' + esc(it.label || "N") + "</text>");
      } else if (t === "scalebar" || t === "縮尺" || t === "スケール") {
        /* ══ 縮尺の 帯。実物は 白黒の 交互＋端に 数と 単位。 */
        var sx = X(数(it.x, 0)), sy = Y(数(it.y, 0));
        var 長 = Math.abs(X(数(it.x, 0) + 数(it.length, 3)) - sx);
        var 段 = 挟む(数(it.steps, 2), 1, 6);
        var h2 = 数(it.height, 5);
        for (var k4 = 0; k4 < 段; k4++) {
          g.push('<rect x="' + c(sx + (長 / 段) * k4) + '" y="' + c(sy) + '" width="' + c(長 / 段)
            + '" height="' + c(h2) + '" fill="' + (k4 % 2 ? "#fff" : "#000")
            + '" stroke="#000" stroke-width="0.7"/>');
        }
        g.push('<text x="' + c(sx) + '" y="' + c(sy + h2 + 10) + '" text-anchor="middle" font-size="9">0</text>');
        g.push('<text x="' + c(sx + 長) + '" y="' + c(sy + h2 + 10) + '" text-anchor="middle" font-size="9">'
          + esc(String(数(it.length, 3)) + (it.unit || "km")) + "</text>");
      } else if (t === "hatch" || t === "ハッチ" || t === "塗り分け") {
        /* ══ 模様で 塗り分ける（白黒 印刷で 見分けが つくように）。
           色は 使わない。斜線・網・点の 3 種類。 */
        var 点2 = 配列(it.points).map(function (p) {
          var px = Array.isArray(p) ? p[0] : (p && p.x), py = Array.isArray(p) ? p[1] : (p && p.y);
          return X(数(px)) + "," + Y(数(py));
        });
        if (点2.length < 3) return;
        var 柄 = 文(it.pattern || "diagonal").toLowerCase();
        var pid = "hp" + (柄 === "grid" ? 1 : 柄 === "dot" ? 2 : 0);
        g.push('<polygon points="' + 点2.join(" ") + '" fill="url(#' + pid + ')"'
          + ' stroke="#000" stroke-width="' + 太 + '"/>');
        if (it.label) {
          var cx4 = 点2.reduce(function (a2, x2) { return a2 + Number(x2.split(",")[0]); }, 0) / 点2.length;
          var cy4 = 点2.reduce(function (a2, x2) { return a2 + Number(x2.split(",")[1]); }, 0) / 点2.length;
          g.push('<text x="' + c(cx4) + '" y="' + c(cy4) + '" text-anchor="middle" font-size="10">'
            + esc(it.label) + "</text>");
        }
      } else if (t === "legend" || t === "凡例") {
        /* ══ 凡例。実物の 地形図と 同じで 右下に 並べる。 */
        var lx = X(数(it.x, 0)), ly = Y(数(it.y, 0));
        配列(it.items).slice(0, 6).forEach(function (e2, i4) {
          var yy = ly + i4 * 13;
          var 形 = 文(e2 && e2.mark || "line");
          if (形 === "triangle" || 形 === "▲") {
            g.push('<path d="M' + c(lx + 5) + "," + c(yy - 5) + " L" + c(lx + 10) + "," + c(yy + 3)
              + " L" + c(lx) + "," + c(yy + 3) + ' Z" fill="#000"/>');
          } else if (形 === "box" || 形 === "■") {
            g.push('<rect x="' + c(lx) + '" y="' + c(yy - 5) + '" width="10" height="8" fill="url(#hp0)" stroke="#000" stroke-width="0.7"/>');
          } else if (形 === "arrow" || 形 === "→") {
            g.push('<line x1="' + c(lx) + '" y1="' + c(yy - 1) + '" x2="' + c(lx + 11) + '" y2="' + c(yy - 1)
              + '" stroke="#000" stroke-width="1" marker-end="url(#nlr)"/>');
          } else {
            g.push('<path d="M' + c(lx) + "," + c(yy - 1) + " q3,-5 6,0 t6,0" + '" fill="none" stroke="#000" stroke-width="1"/>');
          }
          g.push('<text x="' + c(lx + 15) + '" y="' + c(yy + 2) + '" font-size="9">'
            + esc((e2 && (e2.label || e2.text)) || "") + "</text>");
        });
      } else if (t === "rect" || t === "四角" || t === "長方形") {
        /* ══ 四角（2026-08-30・訴え）。実物の 位置検出の 目印は
           **黒 → 白 → 黒 の 入れ子の 四角**。円と 多角形だけでは 組めなかった。
           x,y は 左下（数学の 向き）。w,h は その 幅・高さ。 */
        var rx0 = X(数(it.x)), ry0 = Y(数(it.y) + 数(it.h, 1));
        var rw = Math.abs(X(数(it.x) + 数(it.w, 1)) - rx0);
        var rh = Math.abs(Y(数(it.y)) - ry0);
        g.push('<rect x="' + c(rx0) + '" y="' + c(ry0) + '" width="' + c(rw) + '" height="' + c(rh)
          + '" fill="' + 塗りを決める(it) + '" stroke="'
          + (it.stroke === false ? "none" : "#000") + '" stroke-width="' + 太 + '"' + 破 + "/>");
        if (it.label) {
          g.push('<text x="' + c(rx0 + rw / 2) + '" y="' + c(ry0 - 4)
            + '" text-anchor="middle" font-size="10">' + esc(it.label) + "</text>");
        }
      } else if (t === "ratiobar" || t === "比の帯" || t === "帯") {
        /* ══ 比の帯（2026-08-30・訴え）。実物の 図2 に ある
           「1 1 3 1 1」の 黒白の 帯。数を 帯の 上に 並べる。
           parts に 比を 並べ、黒から 始めるか 白から 始めるかを 決める。 */
        var 比 = 配列(it.parts).map(function (v) { return Math.max(0, 数(v, 0)); })
          .filter(function (v) { return v > 0; }).slice(0, 12);
        if (!比.length) return;
        var 和 = 比.reduce(function (a2, v) { return a2 + v; }, 0);
        var bx0 = X(数(it.x)), by1 = Y(数(it.y));
        var bw = Math.abs(X(数(it.x) + 数(it.w, 5)) - bx0);
        var bh = Math.abs(Y(数(it.y) + 数(it.h, 0.6)) - by1);
        if (bh < 5) bh = 5;
        var by0 = by1 - bh;
        var 黒から = 文(it.start || "black").toLowerCase() !== "white" && it.start !== "白";
        var pos = 0;
        比.forEach(function (v, i5) {
          var w5 = bw * (v / 和);
          var 黒 = (i5 % 2 === 0) === 黒から;
          g.push('<rect x="' + c(bx0 + pos) + '" y="' + c(by0) + '" width="' + c(w5)
            + '" height="' + c(bh) + '" fill="' + (黒 ? "#000" : "#fff")
            + '" stroke="#000" stroke-width="0.7"/>');
          if (it.showRatio !== false) {
            g.push('<text x="' + c(bx0 + pos + w5 / 2) + '" y="' + c(by0 - 3)
              + '" text-anchor="middle" font-size="9">' + esc(String(v)) + "</text>");
          }
          pos += w5;
        });
        if (it.label) {
          g.push('<text x="' + c(bx0 - 5) + '" y="' + c(by0 + bh / 2 + 3)
            + '" text-anchor="end" font-size="10">' + esc(it.label) + "</text>");
        }
      } else if (t === "tick" || t === "等しい印") {
        /* 線分の 真ん中に 「等しい」の 印を 入れる。 */
        var mx2 = (X(数(it.x1)) + X(数(it.x2))) / 2, my2 = (Y(数(it.y1)) + Y(数(it.y2))) / 2;
        var dx = X(数(it.x2)) - X(数(it.x1)), dy = Y(数(it.y2)) - Y(数(it.y1));
        var L = Math.hypot(dx, dy) || 1;
        var nx = -dy / L * 4, ny = dx / L * 4;
        var 本 = 挟む(数(it.count, 1), 1, 3);
        for (var i3 = 0; i3 < 本; i3++) {
          var ox2 = (i3 - (本 - 1) / 2) * 3.4 * (dx / L), oy2 = (i3 - (本 - 1) / 2) * 3.4 * (dy / L);
          g.push('<line x1="' + c(mx2 + ox2 - nx) + '" y1="' + c(my2 + oy2 - ny)
            + '" x2="' + c(mx2 + ox2 + nx) + '" y2="' + c(my2 + oy2 + ny) + '" stroke="#000" stroke-width="0.9"/>');
        }
      }
    });
    return 図で包む(b, W, H, g.join(""));
  }

  /* 数直線。目盛り・数・印（●○）・区間の 矢印。 */
  function 数直線(b) {
    var 下 = 数(b.min, 0), 上 = 数(b.max, 10);
    if (上 <= 下) 上 = 下 + 10;
    var 刻 = 数(b.step, 0) > 0 ? 数(b.step) : きりのよい刻み(上 - 下, 10);
    var W = 320, H = 74;
    var 左 = 16, 右 = 16, pw = W - 左 - 右, y = 40;
    function X(v) { return c(左 + ((v - 下) / (上 - 下)) * pw); }
    var g = ['<marker id="nlr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">'
      + '<path d="M0,0 L7,3 L0,6 z" fill="#000"/></marker>'];
    g.push('<line x1="4" y1="' + y + '" x2="' + (W - 4) + '" y2="' + y
      + '" stroke="#000" stroke-width="1.1" marker-end="url(#nlr)"/>');
    for (var v = 下; v <= 上 + 1e-9; v += 刻) {
      var x = X(v);
      g.push('<line x1="' + x + '" y1="' + (y - 5) + '" x2="' + x + '" y2="' + (y + 5) + '" stroke="#000" stroke-width="0.9"/>');
      g.push('<text x="' + x + '" y="' + (y + 18) + '" text-anchor="middle" font-size="10">' + esc(数の見た目(v, 刻)) + "</text>");
    }
    配列(b.marks).forEach(function (m) {
      if (!m) return;
      var x = X(数(m.at !== undefined ? m.at : m.value));
      var 塞 = m.open !== true && m.closed !== false;
      g.push('<circle cx="' + x + '" cy="' + y + '" r="3.6" fill="' + (塞 ? "#000" : "#fff") + '" stroke="#000" stroke-width="1"/>');
      if (m.label) g.push('<text x="' + x + '" y="' + (y - 10) + '" text-anchor="middle" font-size="10">' + esc(m.label) + "</text>");
    });
    配列(b.ranges).forEach(function (r, i) {
      if (!r) return;
      var a = X(数(r.from)), b2 = X(数(r.to));
      var yy = y - 12 - i * 8;
      g.push('<line x1="' + a + '" y1="' + yy + '" x2="' + b2 + '" y2="' + yy + '" stroke="#000" stroke-width="2"/>');
    });
    return 図で包む(b, W, H, g.join(""));
  }

  /* 座標平面（方眼＋軸）。上に 図形を 重ねられる。 */
  function 座標(b) {
    var x0 = 数(b.xMin, -5), x1 = 数(b.xMax, 5), y0 = 数(b.yMin, -5), y1 = 数(b.yMax, 5);
    if (x1 <= x0) x1 = x0 + 10;
    if (y1 <= y0) y1 = y0 + 10;
    var W = 300, H = c(W * ((y1 - y0) / (x1 - x0)));
    if (!isFinite(H) || H < 80) H = 80;
    if (H > 340) H = 340;
    function X(v) { return c(((v - x0) / (x1 - x0)) * W); }
    function Y(v) { return c(H - ((v - y0) / (y1 - y0)) * H); }
    var 刻 = 数(b.step, 1) > 0 ? 数(b.step) : 1;
    var g = [];
    for (var v = Math.ceil(x0 / 刻) * 刻; v <= x1 + 1e-9; v += 刻) {
      g.push('<line x1="' + X(v) + '" y1="0" x2="' + X(v) + '" y2="' + H
        + '" stroke="#000" stroke-width="0.4" opacity="0.45"/>');
    }
    for (var w = Math.ceil(y0 / 刻) * 刻; w <= y1 + 1e-9; w += 刻) {
      g.push('<line x1="0" y1="' + Y(w) + '" x2="' + W + '" y2="' + Y(w)
        + '" stroke="#000" stroke-width="0.4" opacity="0.45"/>');
    }
    if (x0 < 0 && x1 > 0) g.push('<line x1="' + X(0) + '" y1="0" x2="' + X(0) + '" y2="' + H + '" stroke="#000" stroke-width="1.1"/>');
    if (y0 < 0 && y1 > 0) g.push('<line x1="0" y1="' + Y(0) + '" x2="' + W + '" y2="' + Y(0) + '" stroke="#000" stroke-width="1.1"/>');
    配列(b.points).forEach(function (p) {
      if (!p) return;
      var px = Array.isArray(p) ? p[0] : p.x, py = Array.isArray(p) ? p[1] : p.y;
      g.push('<circle cx="' + X(数(px)) + '" cy="' + Y(数(py)) + '" r="2.8" fill="#000"/>');
      var lb = Array.isArray(p) ? p[2] : p.label;
      if (lb) g.push('<text x="' + c(X(数(px)) + 5) + '" y="' + c(Y(数(py)) - 5) + '" font-size="10">' + esc(lb) + "</text>");
    });
    return 図で包む(b, W, H, g.join(""));
  }

  /* 図の 外枠。ここで **紙の 幅に 合わせる**。中身は 100% で 伸びる。 */
  /* ══ 塗り分けの 模様（2026-08-30）══════════════════════════════
     **色は 使わない。** 白黒 印刷でも 見分けが つくよう 模様で 分ける。
     斜線（hp0）／網（hp1）／点（hp2）の 3 種類。
     矢印の 先（nlr）も ここで 1 度だけ 決める。 */
  var 模様 = '<defs>'
    + '<pattern id="hp0" width="6" height="6" patternUnits="userSpaceOnUse">'
    + '<path d="M0,6 L6,0" stroke="#000" stroke-width="0.7"/></pattern>'
    + '<pattern id="hp1" width="6" height="6" patternUnits="userSpaceOnUse">'
    + '<path d="M0,0 L0,6 M0,0 L6,0" stroke="#000" stroke-width="0.6"/></pattern>'
    + '<pattern id="hp2" width="6" height="6" patternUnits="userSpaceOnUse">'
    /* 点の 模様は **円で 描かない**。図の 中の 点（circle）と 混ざって、
       「点が いくつ あるか」を 数える ところが 狂う（実測で 狂った）。 */
    + '<rect x="2.2" y="2.2" width="1.6" height="1.6" fill="#000"/></pattern>'
    + '<marker id="nlr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">'
    + '<path d="M0,0 L7,3 L0,6 z" fill="#000"/></marker>'
    + "</defs>";

  function 図で包む(b, W, H, 中) {
    return '<div class="vf" style="max-width:' + 幅mm(b) + 'mm">'
      + '<div class="vf-svg"><svg viewBox="0 0 ' + c(W) + " " + c(H)
      + '" width="100%" preserveAspectRatio="xMidYMid meet" '
      + 'font-family="inherit" role="img" aria-label="' + esc(b.caption || "図") + '">'
      + 模様 + 中 + "</svg></div>"
      + (b.caption ? '<div class="vf-cap">' + esc(b.caption) + "</div>" : "")
      + 出典(b) + "</div>";
  }

  /* ══════════════════════════════════════════════════════════════
     ⑥ 入口。紙面（pdfRenderer）から 呼ばれる。
     知らない 種類は "" を 返す。呼び側は そのとき これまでの 道へ 落ちる。
     ══════════════════════════════════════════════════════════════ */
  function 描く(b) {
    if (!b || typeof b !== "object") return "";
    var t = 文(b.type).toLowerCase();
    try {
      if (t === "table") return 表を描く(b);
      if (t === "chart" || t === "graph") return グラフを描く(b);
      if (t === "diagram" || t === "numberline" || t === "geometry") return 図形を描く(b);
      if (t === "svg") return 生SVGを描く(b);
      if (t === "figure" || t === "image" || t === "map") {
        /* 図の 中身は 3 通り。指定が あるものを 優先する。 */
        if (b.svg) return 生SVGを描く(b);
        if (b.chartType || b.series || b.values) return グラフを描く(Object.assign({}, b, { type: "chart" }));
        if (b.items || b.shapes || b.diagramType) return 図形を描く(Object.assign({}, b, { type: "diagram" }));
        return 絵を描く(b);
      }
    } catch (e) {
      return '<div class="vf vf-miss"><div class="vf-missb">図を 出せません</div>'
        + '<div class="vf-missw">' + esc(String(e && e.message || e).slice(0, 120)) + "</div></div>";
    }
    return "";
  }

  /* 紙面の CSS へ 足す ぶん。pageCss の 末尾に 入る。 */
  function CSS() {
    return [
      /* 図は 途中で 切らない。切れた 図は 資料として 使えない。 */
      ".vf { margin: 2.5mm auto; text-align: center; break-inside: avoid; page-break-inside: avoid; }",
      ".vf img { max-width: 100%; height: auto; }",
      ".vf-svg { width: 100%; }",
      ".vf-svg svg { display: block; width: 100%; height: auto; }",
      ".vf-cap { font-size: .82em; margin-top: 1.2mm; }",
      ".vf-cr { font-size: .72em; margin-top: .8mm; text-align: right; }",
      ".vf-miss { border: 0.5pt dashed #000; padding: 3mm; }",
      ".vf-missb { font-size: .9em; font-weight: 700; }",
      ".vf-missw { font-size: .8em; margin-top: .8mm; }",
      /* 表 */
      ".vf-tw { margin: 2.5mm auto; break-inside: avoid; page-break-inside: avoid; }",
      ".vf-tcap { font-size: .84em; margin-bottom: 1.2mm; text-align: left; }",
      ".vf-tnote { font-size: .78em; margin-top: 1mm; text-align: left; }",
      "table.vf-t { width: 100%; border-collapse: collapse; font-size: .88em; }",
      "table.vf-t th, table.vf-t td { border: 0.4pt solid #000; padding: 1.2mm 2mm; }",
      "table.vf-t th { font-weight: 700; }",
      "table.vf-t .a-l { text-align: left; }",
      "table.vf-t .a-c { text-align: center; }",
      /* 数の 列は 右寄せ＋等幅の 数字。けたが そろわないと 読み取れない。 */
      "table.vf-t .a-r { text-align: right; font-variant-numeric: tabular-nums; }",
      "table.vf-t .vf-blank { min-width: 14mm; height: 7mm; }"
    ].join("\n");
  }

  VQFIG.描く 	= 描く;
  VQFIG.draw   = 描く;
  VQFIG.CSS    = CSS;
  VQFIG.清める 	= 清める;
  VQFIG.版     = 版;
  VQFIG.version = 版;
})(typeof globalThis !== "undefined" ? globalThis : this);
