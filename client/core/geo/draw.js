/* ══════════════════════════════════════════════════════════════════════
   core/geo/draw.js — 図形を **座標で** 描く

   ★ 訴え（2026-08-17）「ガチの数学図形を 書けるエンジンも 作れば？
     ただ **位置がずれたり、大きさが違ってたりするのは おかしい**。
     そういうのは 無いようにして」。

   ★ ずれない・違わない ための 決めごと（ここが この道具の 全部）
     ① **すべて 座標で 決める。**見た目で 置かない。
        点は (x, y)。線は 点と点。円は 中心と半径。
     ② **縦と横で 同じ倍率**を使う（uniform scale）。
        縦横で 別の倍率を 使うと、正方形が 長方形に、円が 楕円に なる。
        ここを 守れば **形は 絶対に 崩れない。**
     ③ **長さは 座標から 計算して 出す。**書かれた数字を そのまま 貼らない。
        書かれた数字と 計算が 合わなければ **描かずに 断る。**
        合っていない図を 出すほうが、出さないより 悪い（覚え違いのもと）。
     ④ 辺の長さだけ 渡されたときは **こちらで 座標を 作る**
        （余弦定理。3, 4, 5 なら ぴったり 直角三角形になる）。
     ⑤ 三角形が 成り立たない（2辺の和 ≦ 残り1辺）なら **断る。**

   ★ 書きかた（1 行に 1 つ）
       点 A(0,0) B(4,0) C(0,3)
       三角形 A B C          多角形 A B C D
       三角形 3,4,5          ← 辺の長さだけでも よい（座標は こちらで 作る）
       線 A-B                線 A-B B-C
       円 A r=2              円 (2,2) r=2
       直角 A                ← A の角に 直角の印
       辺 A-B                ← 長さを 座標から 出して 貼る
       辺 A-B = 4            ← 合っているか 確かめてから 貼る（違えば 断る）
       角 A                  ← 角度を 座標から 出して 貼る
       印 A-B B-C            ← 同じ長さの印（等辺の しるし）
       軸                    ← 座標軸と 方眼
       関数 y = 2x + 1       ← 1 次・2 次
       ラベル A 左上
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQG = root.VQG || (root.VQG = {});

  function 文(v) { return v === undefined || v === null ? "" : String(v); }
  function 数(v, 既) { var n = parseFloat(v); return isFinite(n) ? n : 既; }
  function 丸(n, k) { var p = Math.pow(10, k === undefined ? 2 : k); return Math.round(n * p) / p; }
  function esc(s) {
    return 文(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function 距離(a, b) { return Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y)); }

  /* ══ 3 辺から 座標を 作る（余弦定理）════════════════════════════
     A を 原点、B を x 軸の上に 置く。C は そこから 一意に 決まる。
     **これで 3 辺の 長さは 必ず 合う。** */
  function 三辺から(a, b, c) {
    /* a = AB, b = AC, c = BC */
    if (!(a > 0 && b > 0 && c > 0)) return null;
    if (a + b <= c || b + c <= a || c + a <= b) return null;   /* 作れない */
    var cosA = (a * a + b * b - c * c) / (2 * a * b);
    if (cosA < -1 || cosA > 1) return null;
    var A = Math.acos(cosA);
    return { A: { x: 0, y: 0 }, B: { x: a, y: 0 },
             C: { x: b * Math.cos(A), y: b * Math.sin(A) } };
  }

  /* ══ 読む ═══════════════════════════════════════════════════════
     ★ **書き方の ゆれを 受け入れる**（2026-08-17・実測で 直した）。
       13 通り 試して 6 通りが 落ちていた。落ちていたのは:
         ・「点」を 書かずに  A(0,0) B(4,0)
         ・全角のかっこ       A（0,0）
         ・くっついた 名前     三角形ABC
         ・ハイフン無し        辺 AB = 4
         ・コメントや 説明文が 1 行 混ざった
         ・英語（point / polygon）
       AI は こういう 書き方を ふつうに する。**受ける側が 合わせる。**
     ★ そして **読めない行 1 つで 全部を 捨てない。**
       分からない行は 飛ばして 覚え書きに 残し、分かるものだけ 描く。
       止めるのは「数が 合っていない」ときだけ（そこは 嘘になるので）。 */
  function 正す(l) {
    return 文(l)
      .replace(/[（]/g, "(").replace(/[）]/g, ")")
      .replace(/[，、]/g, ",").replace(/[：]/g, ":").replace(/[＝]/g, "=")
      .replace(/[－ー–—]/g, "-").replace(/[０-９]/g, function (c) {
        return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/[Ａ-Ｚａ-ｚ]/g, function (c) {
        return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/^\s*(?:\/\/|#|;)\s*.*$/, "")          /* コメント行は 落とす */
      .trim();
  }
  /* ★ 日本語の 寸法語を そろえる（2026-08-17・実測で 足した）。
     「円: 半径3」のように **半径 と 書かれた行が 座標エンジンに 来る**。
     r= に 直しておかないと「円の 半径が 読めません」で 落ちていた。
     そろえる中身は more.js と 同じものを 使う（二重に 持たない）。 */
  function 言い回しをそろえる(l) {
    var t = 正す(l);
    try {
      var M = (root.VQG || {}).more;
      if (M && M.引数を正す) {
        var m = /^([^\s:：]+)([\s\S]*)$/.exec(t);
        if (m) t = (m[1] + " " + M.引数を正す(m[2] || "")).replace(/\s{2,}/g, " ").trim();
      }
    } catch (e) {}
    return t;
  }
  /* 英語の 言いかたを 日本語へ そろえる */
  var 言い換え = [
    [/^point\b/i, "点"], [/^(line|segment)\b/i, "線"], [/^circle\b/i, "円"],
    [/^(triangle|tri)\b/i, "三角形"], [/^(polygon|poly|quad|rect(angle)?)\b/i, "多角形"],
    [/^(side|edge)\b/i, "辺"], [/^angle\b/i, "角"], [/^right(\s*angle)?\b/i, "直角"],
    [/^(axis|axes|grid)\b/i, "軸"], [/^(function|graph|plot)\b/i, "関数"],
    [/^label\b/i, "ラベル"], [/^(mark|tick)\b/i, "印"]
  ];

  /* ★ **日本語の あとに \b は 使えない**（2026-08-17・実測で つまずいた）。
     \b は A-Za-z0-9_ の 境目のこと。「辺 A-B」の 辺 と 空白の 間には
     境目が 無いので /^辺\b/ は **当たらない**。当たらないと その行は
     黙って 飛ばされ、長さの 食い違いの 検査まで 素通りしていた
     （食い違った図が そのまま 描かれた）。(?:\s|$|[:：]) で 見る。 */
  function 読む(本文) {
    var 図 = { 点: {}, 線: [], 円: [], 直角: [], 辺: [], 角: [], 印: [],
               軸: false, 関数: [], ラベル: {}, 多角形: [], 崩れ: [], 飛ばした: [],
               ちがい: [] };
    var 行 = 文(本文).split("\n").map(言い回しをそろえる).filter(Boolean);

    /* ★ 先に **座標を 全部 拾う**（「点」と 書かれていなくてもよい）。
       これを 先にやると、あとの 行で 名前だけ 使われても 通る。 */
    行.forEach(function (l) {
      var re0 = /([A-Za-z][A-Za-z0-9']?)\s*\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/g, m0;
      while ((m0 = re0.exec(l))) {
        if (/^(円|circle)\b/.test(l)) continue;          /* 円の 中心は 別で 扱う */
        図.点[m0[1]] = { x: 数(m0[2], 0), y: 数(m0[3], 0) };
      }
    });
    /* くっついた 名前（三角形ABC）を ばらす。既に 決まっている点だけ。 */
    function 名をばらす(t) {
      var 名 = t.split(/[\s,、-]+/).filter(Boolean);
      if (名.length >= 3) return 名;
      var 出 = [], 一 = t.replace(/[^A-Za-z0-9']/g, "");
      for (var i = 0; i < 一.length; i++) {
        var a = 一.charAt(i), b = 一.charAt(i + 1);
        if (b && /[0-9']/.test(b) && 図.点[a + b]) { 出.push(a + b); i++; }
        else 出.push(a);
      }
      return 出;
    }

    行.forEach(function (l0) {
      var m;
      var l = l0;
      言い換え.forEach(function (x) { l = l.replace(x[0], x[1]); });
      /* 点 A(0,0) B(4,0) … */
      /* 点は **先に 拾ってある**。ここでは 何もしない（二度 拾わない）。 */
      if (/^点(?:\s|$)/.test(l) || /^[A-Za-z][A-Za-z0-9']?\s*\(/.test(l)) return;
      /* 三角形 3,4,5 ／ 三角形 A B C ／ 多角形 A B C D */
      if ((m = /^(三角形|多角形|四角形)\s*[:：]?\s*(.+)$/.exec(l))) {
        var 中 = m[2].trim();
        var 数ら = 中.split(/[,、\s]+/).map(Number).filter(function (x) { return isFinite(x) && x > 0; });
        if (m[1] === "三角形" && 数ら.length >= 3 && !/[A-Za-z]/.test(中.replace(/[\d.,\s直角]/g, ""))) {
          var t = 三辺から(数ら[0], 数ら[1], 数ら[2]);
          if (!t) { 図.崩れ.push("その 3 辺では 三角形が 作れません（" + 数ら.slice(0, 3).join(", ") + "）"); return; }
          図.点.A = t.A; 図.点.B = t.B; 図.点.C = t.C;
          図.多角形.push(["A", "B", "C"]);
          図.辺.push({ a: "A", b: "B" }); 図.辺.push({ a: "A", b: "C" }); 図.辺.push({ a: "B", b: "C" });
          if (/直角/.test(中) || Math.abs(数ら[0] * 数ら[0] + 数ら[1] * 数ら[1] - 数ら[2] * 数ら[2]) < 1e-6) {
            図.直角.push("A");
          }
          return;
        }
        var 名 = 名をばらす(中);
        if (名.length < 3) { 図.飛ばした.push("点が 足りません: " + l0); return; }
        図.多角形.push(名);
        return;
      }
      /* 線 A-B B-C */
      if (/^(線|線分)(?:\s|$|[:：])/.test(l)) {
        var 中2 = l.replace(/^(線|線分)\s*[:：]?\s*/, "");
        var re2 = /([A-Za-z][A-Za-z0-9']?)\s*-\s*([A-Za-z][A-Za-z0-9']?)/g;
        var n2 = 0;
        while ((m = re2.exec(中2))) { 図.線.push({ a: m[1], b: m[2] }); n2++; }
        if (!n2) {
          /* ハイフンが 無い書きかた（線 AB / 線 AB BC） */
          中2.split(/[\s,]+/).filter(Boolean).forEach(function (t) {
            var 名 = 名をばらす(t);
            for (var i = 0; i + 1 < 名.length; i++) { 図.線.push({ a: 名[i], b: 名[i + 1] }); n2++; }
          });
        }
        if (!n2) 図.飛ばした.push("線が 読めません: " + l0);
        return;
      }
      /* 円 A r=2 ／ 円 (2,2) r=2 */
      if (/^円(?:\s|$|[:：])/.test(l)) {
        var r = 数((/r\s*=\s*(-?[\d.]+)/i.exec(l) || [])[1], null);
        if (r === null || r <= 0) { 図.崩れ.push("円の 半径が 読めません: " + l); return; }
        var c1 = /\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/.exec(l);
        if (c1) 図.円.push({ c: { x: 数(c1[1], 0), y: 数(c1[2], 0) }, r: r });
        else {
          /* ★ 「円 r=3」の r を **中心の 名前と 読んでしまう**（2026-08-17・実測）。
             うしろが = なら それは 中心では なく 値の 名前。 */
          var nm = (/^円\s+([A-Za-z][A-Za-z0-9']?)(?!\s*=)/.exec(l) || [])[1];
          /* ★ 中心が 書かれていないなら **原点に 置く**（2026-08-17）。
             「円: 半径3」だけで 描けないのは おかしい。断る理由が 無い。 */
          if (!nm) { 図.円.push({ c: { x: 0, y: 0 }, r: r }); return; }
          図.円.push({ 名: nm, r: r });
        }
        return;
      }
      if ((m = /^直角\s*[:：]?\s*([A-Za-z][A-Za-z0-9']?)/.exec(l))) { 図.直角.push(m[1]); return; }
      if (/^直角$/.test(l)) return;               /* 「直角」だけの行は 印だけ（点は 三角形が 決める） */
      if (/^辺(?:\s|$|[:：])/.test(l)) {
        var 中3 = l.replace(/^辺\s*[:：]?\s*/, "");
        var mm = /^([A-Za-z][A-Za-z0-9']?)\s*-\s*([A-Za-z][A-Za-z0-9']?)(?:\s*=\s*(-?[\d.]+))?/.exec(中3);
        if (!mm) mm = /^([A-Za-z])([A-Za-z])(?:\s*=\s*(-?[\d.]+))?/.exec(中3);
        if (!mm) { 図.飛ばした.push("辺が 読めません: " + l0); return; }
        図.辺.push({ a: mm[1], b: mm[2], 言われた: mm[3] === undefined ? null : 数(mm[3], null) });
        return;
      }
      if ((m = /^角\s+([A-Za-z][A-Za-z0-9']?)(?:\s*=\s*(-?[\d.]+))?/.exec(l))) {
        図.角.push({ p: m[1], 言われた: m[2] === undefined ? null : 数(m[2], null) });
        return;
      }
      if (/^印\s/.test(l)) {
        var re3 = /([A-Za-z][A-Za-z0-9']?)\s*[-–—]\s*([A-Za-z][A-Za-z0-9']?)/g;
        while ((m = re3.exec(l))) 図.印.push({ a: m[1], b: m[2] });
        return;
      }
      if (/^(軸|座標軸|方眼)$/.test(l)) { 図.軸 = true; return; }
      if ((m = /^関数\s+(.+)$/.exec(l))) { 図.関数.push(m[1]); 図.軸 = true; return; }
      if ((m = /^ラベル\s+([A-Za-z][A-Za-z0-9']?)\s+(.+)$/.exec(l))) { 図.ラベル[m[1]] = m[2].trim(); return; }
      /* ★ 分からない行は **飛ばすだけ**。1 行のために 図を 捨てない。 */
      図.飛ばした.push(l0);
    });
    return 図;
  }

  /* ══ 直せるものは 直す（2026-08-17・実測で 足した）══════════════
     ★ AI は 「三角形 A B C」と 書きながら、座標を いいかげんに 決めて
       そのくせ 「辺 A-B = 3」と 正しい長さを 書く——という 書き方を する。
       前は それを **食い違い**として 全部 断っていた（図が 出ない）。
     ★ 3 辺とも 長さが 書いてあるなら、**その長さから 座標を 作り直す。**
       そうすれば 図も 数字も 正しくなる。断るより ずっとよい。
     ★ 作り直せないときだけ、**座標を 正として 計算した数字を 出す**
       （書かれた数字は 使わない。嘘の数字を 貼らないため）。 */
  function 直せるなら直す(図) {
    var 直した = [];
    図.多角形.forEach(function (名ら) {
      if (名ら.length !== 3) return;
      var a = 名ら[0], b = 名ら[1], c = 名ら[2];
      var 言 = {};
      図.辺.forEach(function (s) {
        if (s.言われた === null || s.言われた === undefined) return;
        言[[s.a, s.b].sort().join("")] = s.言われた;
      });
      var ab = 言[[a, b].sort().join("")], ac = 言[[a, c].sort().join("")],
          bc = 言[[b, c].sort().join("")];
      if (!(ab > 0 && ac > 0 && bc > 0)) return;
      /* いまの座標で すでに 合っているなら 触らない */
      var P = 図.点;
      if (P[a] && P[b] && P[c]
          && Math.abs(距離(P[a], P[b]) - ab) < Math.max(0.01, ab * 0.01)
          && Math.abs(距離(P[a], P[c]) - ac) < Math.max(0.01, ac * 0.01)
          && Math.abs(距離(P[b], P[c]) - bc) < Math.max(0.01, bc * 0.01)) return;
      var t = 三辺から(ab, ac, bc);
      if (!t) return;                       /* 作れない → あとで 断る */
      図.点[a] = t.A; 図.点[b] = t.B; 図.点[c] = t.C;
      直した.push(a + b + c);
    });
    return 直した;
  }

  /* ══ 確かめる（言われた長さと 座標が 合っているか）════════════ */
  function 確かめる(図) {
    var 悪 = 図.崩れ.slice();
    図.多角形.forEach(function (名ら) {
      名ら.forEach(function (n) { if (!図.点[n]) 悪.push("点 " + n + " が 決まっていません"); });
    });
    図.線.forEach(function (s) {
      if (!図.点[s.a]) 悪.push("点 " + s.a + " が 決まっていません");
      if (!図.点[s.b]) 悪.push("点 " + s.b + " が 決まっていません");
    });
    図.辺.forEach(function (s) {
      var A = 図.点[s.a], B = 図.点[s.b];
      if (!A || !B) { 悪.push("辺 " + s.a + s.b + " の 点が ありません"); return; }
      if (s.言われた === null || s.言われた === undefined) return;
      var 実 = 距離(A, B);
      /* ★ **言われた長さと 座標が 食い違ったら 描かない。**
         見た目だけ 合わせて 数字を 貼ると、**嘘の図**になる。 */
      if (Math.abs(実 - s.言われた) > Math.max(0.01, s.言われた * 0.01)) {
        /* ★ **断らずに 描く**（2026-08-17・訴え「図が 書けないと 言われる」）。
           ただし 貼るのは **座標から 出した数**。書かれた数字は 使わない。
           図が 出ないより、正しい数で 出るほうが よい。
           食い違ったことは 下に 一言 出す（黙って すり替えない）。 */
        図.ちがい.push("辺 " + s.a + s.b + " は 座標から 出すと " + 丸(実, 2)
          + "（書かれていたのは " + s.言われた + "）");
      }
    });
    図.円.forEach(function (c) {
      if (c.名 && !図.点[c.名]) 悪.push("円の 中心 " + c.名 + " が 決まっていません");
    });
    図.直角.forEach(function (n) { if (!図.点[n]) 悪.push("直角の 点 " + n + " が 決まっていません"); });
    return 悪;
  }

  /* ══ 描く ═══════════════════════════════════════════════════════ */
  function 描く(本文, o) {
    o = o || {};
    var 図 = 読む(本文);
    var 直した = 直せるなら直す(図);
    var 悪 = 確かめる(図);
    if (悪.length) return { だめ: 悪.slice(0, 4).join(" ／ "), 崩れ: 悪 };
    var 名ら = Object.keys(図.点);
    if (!名ら.length && !図.円.length && !図.関数.length) {
      return { だめ: "描くものが ありません。" };
    }

    /* ① 入る範囲を 出す */
    var 小x = Infinity, 大x = -Infinity, 小y = Infinity, 大y = -Infinity;
    var 見る = function (x, y) {
      if (x < 小x) 小x = x; if (x > 大x) 大x = x;
      if (y < 小y) 小y = y; if (y > 大y) 大y = y;
    };
    名ら.forEach(function (n) { 見る(図.点[n].x, 図.点[n].y); });
    図.円.forEach(function (c) {
      var C = c.名 ? 図.点[c.名] : c.c;
      見る(C.x - c.r, C.y - c.r); 見る(C.x + c.r, C.y + c.r);
    });
    if (図.軸 || 図.関数.length) { 見る(-3, -3); 見る(3, 3); }
    if (!isFinite(小x)) { 小x = -3; 大x = 3; 小y = -3; 大y = 3; }
    if (大x - 小x < 1e-6) { 小x -= 1; 大x += 1; }
    if (大y - 小y < 1e-6) { 小y -= 1; 大y += 1; }

    /* ② **縦と横で 同じ倍率**。ここが 形を 崩さない かなめ。 */
    var 最大幅 = Math.max(120, Math.min(320, 数(o.幅, 300)));
    var 余 = 26;
    var 幅u = 大x - 小x, 高u = 大y - 小y;
    var s = (最大幅 - 余 * 2) / 幅u;
    var 最大高 = 260;
    if (高u * s > 最大高 - 余 * 2) s = (最大高 - 余 * 2) / 高u;
    var W = Math.round(幅u * s + 余 * 2), H = Math.round(高u * s + 余 * 2);
    var X = function (x) { return 余 + (x - 小x) * s; };
    var Y = function (y) { return H - 余 - (y - 小y) * s; };   /* y は 上向き */

    var g = ['<svg class="vqg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H
      + '" role="img" aria-label="図形">'];

    /* 方眼と 軸 */
    if (図.軸) {
      for (var gx = Math.ceil(小x); gx <= Math.floor(大x); gx++) {
        g.push('<line x1="' + 丸(X(gx), 1) + '" y1="0" x2="' + 丸(X(gx), 1) + '" y2="' + H + '" class="gd"/>');
      }
      for (var gy = Math.ceil(小y); gy <= Math.floor(大y); gy++) {
        g.push('<line x1="0" y1="' + 丸(Y(gy), 1) + '" x2="' + W + '" y2="' + 丸(Y(gy), 1) + '" class="gd"/>');
      }
      if (小y <= 0 && 大y >= 0) g.push('<line x1="0" y1="' + 丸(Y(0), 1) + '" x2="' + W + '" y2="' + 丸(Y(0), 1) + '" class="ax"/>');
      if (小x <= 0 && 大x >= 0) g.push('<line x1="' + 丸(X(0), 1) + '" y1="0" x2="' + 丸(X(0), 1) + '" y2="' + H + '" class="ax"/>');
    }

    /* 関数（1 次・2 次） */
    図.関数.forEach(function (式) {
      var q = /y\s*=\s*(-?[\d.]*)\s*x\s*\^?\s*2\s*([+-]\s*[\d.]*)\s*x?\s*([+-]\s*[\d.]+)?/i.exec(式);
      var f = null;
      if (q) {
        var A2 = q[1] === "" ? 1 : (q[1] === "-" ? -1 : 数(q[1], 1));
        var B2 = 数(String(q[2] || "0").replace(/\s+/g, ""), 0);
        var C2 = 数(String(q[3] || "0").replace(/\s+/g, ""), 0);
        f = function (x) { return A2 * x * x + B2 * x + C2; };
      } else {
        var li = /y\s*=\s*(-?[\d.]*)\s*x?\s*([+-]\s*[\d.]+)?/i.exec(式);
        if (!li) return;
        var a3 = li[1] === "" ? (/x/.test(式) ? 1 : 0) : (li[1] === "-" ? -1 : 数(li[1], 1));
        var b3 = 数(String(li[2] || "0").replace(/\s+/g, ""), 0);
        f = function (x) { return a3 * x + b3; };
      }
      var pts = [];
      for (var i = 0; i <= 120; i++) {
        var x2 = 小x + (大x - 小x) * i / 120, y2 = f(x2);
        if (y2 < 小y - 1 || y2 > 大y + 1) { if (pts.length) { g.push('<polyline points="' + pts.join(" ") + '" class="fn"/>'); pts = []; } continue; }
        pts.push(丸(X(x2), 1) + "," + 丸(Y(y2), 1));
      }
      if (pts.length) g.push('<polyline points="' + pts.join(" ") + '" class="fn"/>');
    });

    /* 円 */
    図.円.forEach(function (c) {
      var C = c.名 ? 図.点[c.名] : c.c;
      g.push('<circle cx="' + 丸(X(C.x), 1) + '" cy="' + 丸(Y(C.y), 1) + '" r="' + 丸(c.r * s, 1) + '" class="sh"/>');
      g.push('<circle cx="' + 丸(X(C.x), 1) + '" cy="' + 丸(Y(C.y), 1) + '" r="2.2" class="pt"/>');
    });

    /* 多角形 */
    図.多角形.forEach(function (名2) {
      var pts = 名2.map(function (n) { return 丸(X(図.点[n].x), 1) + "," + 丸(Y(図.点[n].y), 1); });
      g.push('<polygon points="' + pts.join(" ") + '" class="sh"/>');
    });
    /* 線 */
    図.線.forEach(function (l2) {
      var A = 図.点[l2.a], B = 図.点[l2.b];
      g.push('<line x1="' + 丸(X(A.x), 1) + '" y1="' + 丸(Y(A.y), 1) + '" x2="' + 丸(X(B.x), 1)
        + '" y2="' + 丸(Y(B.y), 1) + '" class="ln"/>');
    });

    /* 直角の印（その点から 出ている 2 本を 見て 直角なら 四角を 置く） */
    図.直角.forEach(function (n) {
      var P = 図.点[n];
      var 相手 = [];
      図.多角形.forEach(function (名2) {
        var i = 名2.indexOf(n);
        if (i < 0) return;
        相手.push(図.点[名2[(i + 1) % 名2.length]]);
        相手.push(図.点[名2[(i - 1 + 名2.length) % 名2.length]]);
      });
      図.線.forEach(function (l2) {
        if (l2.a === n) 相手.push(図.点[l2.b]);
        if (l2.b === n) 相手.push(図.点[l2.a]);
      });
      if (相手.length < 2) return;
      var u = 単位(P, 相手[0]), v = 単位(P, 相手[1]);
      var d = 12 / s;
      var p1 = { x: P.x + u.x * d, y: P.y + u.y * d };
      var p2 = { x: P.x + u.x * d + v.x * d, y: P.y + u.y * d + v.y * d };
      var p3 = { x: P.x + v.x * d, y: P.y + v.y * d };
      g.push('<polyline points="' + [p1, p2, p3].map(function (q2) {
        return 丸(X(q2.x), 1) + "," + 丸(Y(q2.y), 1); }).join(" ") + '" class="rt"/>');
    });

    /* 同じ長さの印 */
    図.印.forEach(function (s2) {
      var A = 図.点[s2.a], B = 図.点[s2.b];
      if (!A || !B) return;
      var mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
      var u = 単位(A, B), n3 = { x: -u.y, y: u.x }, d = 5 / s;
      g.push('<line x1="' + 丸(X(mx + n3.x * d), 1) + '" y1="' + 丸(Y(my + n3.y * d), 1)
        + '" x2="' + 丸(X(mx - n3.x * d), 1) + '" y2="' + 丸(Y(my - n3.y * d), 1) + '" class="tk"/>');
    });

    /* 辺の長さ（**座標から 出した値**を 貼る） */
    図.辺.forEach(function (s2) {
      var A = 図.点[s2.a], B = 図.点[s2.b];
      var 長 = 距離(A, B);
      var mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2;
      var u = 単位(A, B), n3 = { x: -u.y, y: u.x };
      /* 図の 外側へ 寄せる（中心から 離れる向き） */
      var cx = 平均x(図), cy = 平均y(図);
      if ((mx - cx) * n3.x + (my - cy) * n3.y < 0) { n3.x = -n3.x; n3.y = -n3.y; }
      var d = 11 / s;
      g.push('<text x="' + 丸(X(mx + n3.x * d), 1) + '" y="' + 丸(Y(my + n3.y * d) + 4, 1)
        + '" class="lb">' + esc(丸(長, 2)) + "</text>");
    });

    /* 角度（座標から 出す） */
    図.角.forEach(function (a2) {
      var P = 図.点[a2.p];
      if (!P) return;
      var 相手 = [];
      図.多角形.forEach(function (名2) {
        var i = 名2.indexOf(a2.p);
        if (i < 0) return;
        相手.push(図.点[名2[(i + 1) % 名2.length]]);
        相手.push(図.点[名2[(i - 1 + 名2.length) % 名2.length]]);
      });
      if (相手.length < 2) return;
      var u = 単位(P, 相手[0]), v = 単位(P, 相手[1]);
      var 角 = Math.acos(Math.max(-1, Math.min(1, u.x * v.x + u.y * v.y))) * 180 / Math.PI;
      var b2 = { x: (u.x + v.x) / 2, y: (u.y + v.y) / 2 };
      var len = Math.sqrt(b2.x * b2.x + b2.y * b2.y) || 1;
      var d = 22 / s;
      g.push('<text x="' + 丸(X(P.x + b2.x / len * d), 1) + '" y="' + 丸(Y(P.y + b2.y / len * d) + 4, 1)
        + '" class="lb">' + 丸(角, 1) + "°</text>");
    });

    /* 点と 名前 */
    名ら.forEach(function (n) {
      var P = 図.点[n];
      g.push('<circle cx="' + 丸(X(P.x), 1) + '" cy="' + 丸(Y(P.y), 1) + '" r="2.6" class="pt"/>');
      var cx = 平均x(図), cy = 平均y(図);
      var dx = (P.x - cx) || 0.001, dy = (P.y - cy) || 0.001;
      var L = Math.sqrt(dx * dx + dy * dy) || 1;
      var off = 13;
      g.push('<text x="' + 丸(X(P.x) + dx / L * off, 1) + '" y="' + 丸(Y(P.y) - dy / L * off + 4, 1)
        + '" class="nm">' + esc(図.ラベル[n] || n) + "</text>");
    });

    g.push("</svg>");
    return { svg: g.join(""), 幅: W, 高: H,
             点の数: 名ら.length, 倍率: 丸(s, 3),
             /* 書かれた数と ちがった所（黙って すり替えない） */
             ちがい: 図.ちがい.slice(0, 4),
             作り直した: 直した,
             飛ばした行: 図.飛ばした.slice(0, 4),
             /* 確かめに使えるよう **描いた実寸**も 返す */
             長さ: 図.辺.map(function (s2) {
               return { 辺: s2.a + s2.b, 長さ: 丸(距離(図.点[s2.a], 図.点[s2.b]), 3) }; }) };
  }

  function 単位(A, B) {
    var dx = B.x - A.x, dy = B.y - A.y, L = Math.sqrt(dx * dx + dy * dy) || 1;
    return { x: dx / L, y: dy / L };
  }
  function 平均x(図) {
    var k = Object.keys(図.点); if (!k.length) return 0;
    return k.reduce(function (n, x) { return n + 図.点[x].x; }, 0) / k.length;
  }
  function 平均y(図) {
    var k = Object.keys(図.点); if (!k.length) return 0;
    return k.reduce(function (n, x) { return n + 図.点[x].y; }, 0) / k.length;
  }

  function CSS() {
    return [
      ".vqg{max-width:100%;height:auto;overflow:visible;display:block;margin:.3em 0;}",
      ".vqg .gd{stroke:currentColor;stroke-width:.6;opacity:.16}",
      ".vqg .ax{stroke:currentColor;stroke-width:1.3;opacity:.6}",
      ".vqg .sh{fill:rgba(43,112,239,.10);stroke:currentColor;stroke-width:1.6}",
      ".vqg .ln{stroke:currentColor;stroke-width:1.6;stroke-linecap:round}",
      ".vqg .fn{fill:none;stroke:#2b70ef;stroke-width:2.2;stroke-linejoin:round}",
      ".vqg .rt{fill:none;stroke:currentColor;stroke-width:1.3;opacity:.85}",
      ".vqg .tk{stroke:#e5484d;stroke-width:2}",
      ".vqg .pt{fill:#e5484d;stroke:none}",
      ".vqg .lb{fill:currentColor;font-size:11px;text-anchor:middle;opacity:.9;font-family:inherit}",
      ".vqg .nm{fill:currentColor;font-size:12px;font-weight:700;text-anchor:middle;font-family:inherit}"
    ].join("");
  }

  VQG.描く = 描く; VQG.読む = 読む; VQG.確かめる = 確かめる;
  VQG.三辺から = 三辺から; VQG.CSS = CSS;
})(typeof globalThis !== "undefined" ? globalThis : this);
