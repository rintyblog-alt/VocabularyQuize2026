/* ══════════════════════════════════════════════════════════════════════
   design/layout-resolve.js — LayoutSpec + Tokens → **絶対座標**

   ★ ここも計算だけ。LLM はいない。
   ★ 座標は必ず 4 の倍数へ寄せる（4px グリッド）。
   ★ 飾り（地に敷くもの・帯・カードの下地）は 装飾:true を付ける。
     Gate の「重なり」は 装飾 を数えない。**下に敷くのは重なりではない。**
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQD = root.VQD || (root.VQD = {});
  var G = VQD.grammar;

  function 四(v) { return Math.round(v / 4) * 4; }
  /* ★ 枠を割るときは **内側へ** 寄せる（2026-08-17・実測）。
     四捨五入で寄せると、端の枠が 1〜3px ずつ外へ出て、
     Gate の「はみ出し」が 818 件 出ていた。始まりは切り上げ、
     大きさは切り捨て。こうすると 絶対に外へ出ない。 */
  function 上四(v) { return Math.ceil(v / 4) * 4; }
  function 下四(v) { return Math.floor(v / 4) * 4; }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /* ── 文字の実寸（推定）───────────────────────────────────────
     和文は全角 1.0em、英数と半角カナは 0.5em で近似する。
     **推定であることを前提に**、Gate では枠の 85% を超えたら溢れ扱い。 */
  function 幅em(s) {
    var n = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      n += (c < 0x80 || (c >= 0xff61 && c <= 0xff9f)) ? 0.5 : 1.0;
    }
    return n;
  }
  function 測る(text, size, w, lh) {
    var 行 = 0;
    String(text === undefined || text === null ? "" : text).split("\n").forEach(function (p) {
      var per = Math.max(1, w / size);
      行 += Math.max(1, Math.ceil(幅em(p) / per));
    });
    return Math.ceil(行 * size * lh);
  }

  var 連番 = 0;
  function uid() {連番++; return "d" + 連番.toString(36) + Math.floor(連番 * 2654435761 % 1679616).toString(36); }
  function 番号を戻す() { 連番 = 0; }        /* 試験で id を揃えるため */

  /* ── 大きさと色の決めかた ───────────────────────────────────── */
  function 字大(t, role, emphasis, purpose) {
    var S = t.type.size;
    if (role === "heading")
      return purpose === "title" || purpose === "closing" ? S.display
        : (emphasis === "primary" ? S.h1 : (emphasis === "secondary" ? S.h2 : S.h3));
    if (role === "subheading") return emphasis === "primary" ? S.h2 : S.h3;
    if (role === "quote") return emphasis === "primary" ? S.h2 : S.h3;
    if (role === "metric" || role === "kpi") return S.display;
    if (role === "section") return S.h1;
    if (role === "callout") return S.h3;
    if (role === "diagram" || role === "steps" || role === "compare" || role === "timeline") return S.body;
    return emphasis === "tertiary" ? S.caption : S.body;
  }
  function 字色(t, role) {
    if (role === "subheading") return t.color.textSecondary;
    return t.color.textPrimary;
  }
  function 揃え(a) { return a === "center" ? "center" : (a === "end" ? "right" : "left"); }

  /* ── 分割 ───────────────────────────────────────────────────
     horizontal は **列グリッドの上で**割る（grid が効く場所）。
     vertical は 高さを比で割る。 */
  function 枠を割る(spec, 箱, t) {
    var r = spec.partition.ratio, n = spec.partition.count;
    var 和 = r.reduce(function (a, b) { return a + b; }, 0);
    var 出 = [];
    if (spec.partition.direction === "horizontal") {
      var 列 = t.grid, gut = t.space.gutter;
      var colW = (箱.w - gut * (列 - 1)) / 列;
      var 割 = r.map(function (v) { return Math.max(1, Math.round(列 * v / 和)); });
      var 差 = 列 - 割.reduce(function (a, b) { return a + b; }, 0);
      while (差 !== 0) {                       /* 端数を いちばん大きい枠で吸う */
        var i = 0, best = -1;
        割.forEach(function (v, k) { if (v > best) { best = v; i = k; } });
        if (差 > 0) { 割[i]++; 差--; } else { if (割[i] > 1) { 割[i]--; 差++; } else break; }
      }
      var x = 箱.x;
      割.forEach(function (c) {
        var w = c * colW + (c - 1) * gut;
        var X = 上四(x);
        出.push({ x: X, y: 上四(箱.y), w: Math.max(8, 下四(x + w - X)), h: 下四(箱.y + 箱.h - 上四(箱.y)) });
        x += w + gut;
      });
    } else {
      var gap = t.space.blockGap;
      var 使える = 箱.h - gap * (n - 1);
      var y = 箱.y;
      r.forEach(function (v) {
        var h = 使える * v / 和;
        var Y = 上四(y);
        出.push({ x: 上四(箱.x), y: Y, w: 下四(箱.x + 箱.w - 上四(箱.x)), h: Math.max(8, 下四(y + h - Y)) });
        y += h + gap;
      });
    }
    return 出;
  }

  /* ══ その中身が **実際に要る高さ**（2026-08-17・訴え「余白が多い」）═══
     ★ 枠は 比だけで割っていたので、見出し 1 行の枠にも 画面の 1/3 を
       与えていた。中身の量を見ずに割れば 余白が出るのは当たり前。
     ★ ここで「最低これだけ要る」を出し、余ったぶんは
       伸びて嬉しい枠（表・グラフ・図解・本文）へ回す。 */
  function 必要高(t, slot, 中, w, purpose) {
    var role = slot.role;
    if (role === "spacer") return 0;
    var size = 字大(t, role, slot.emphasis, purpose);
    var lh = t.type.行間(size);
    var 余 = t.space.inlineGap;
    if (role === "heading" || role === "subheading") {
      var h = 測る(String((中 && 中.text) || ""), size, w, lh);
      if (中 && 中.caption) h += 測る(String(中.caption), Math.min(t.type.size.h3, size), w, 1.5) + 余;
      if (t.seed.accent !== "none" && t.seed.accent !== "block") h += 余 + 10;
      return Math.ceil(h * 1.15);            /* 段が上がる余地を少しだけ見ておく */
    }
    if (role === "body") return Math.ceil(測る(String((中 && 中.text) || ""), size, w, lh) * 1.15);
    if (role === "bullets") {
      var 本 = ((中 && 中.items) || []).map(function (x) { return "・" + String(x); }).join("\n");
      return Math.ceil(測る(本, size, w, lh) * 1.15);
    }
    if (role === "quote") {
      var q = Math.ceil(測る(String((中 && 中.text) || ""), size, Math.max(40, w - 28), lh) * 1.15);
      if (中 && 中.caption) q += t.type.size.caption * 1.8 + 余;
      return q;
    }
    if (role === "metric") return Math.ceil(size * 1.25 + (中 && 中.caption ? t.type.size.caption * 1.8 : 0));
    if (role === "table") {
      var rows = ((中 && 中.rows) || []).length || 2;
      return Math.ceil(rows * Math.max(26, t.type.size.body * 1.9));
    }
    if (role === "chart") return 200;
    if (role === "diagram") return 96;
    var こま = ((中 && 中.cells) || (中 && 中.items) || []).length || 2;
    if (role === "steps") return w >= 300 ? 190 : Math.max(120, こま * 76);
    if (role === "compare") return w >= 300 ? 190 : Math.max(140, こま * 96);
    if (role === "kpi") return Math.ceil(t.type.size.h1 * 1.3 + t.type.size.caption * 1.9);
    if (role === "callout") return Math.ceil(測る(String((中 && 中.text) || ""), t.type.size.h3, Math.max(60, w - 40), 1.4) + 40);
    if (role === "timeline") return 170;
    if (role === "section") return Math.ceil(t.type.size.display * 1.1 + t.type.size.h1 * 1.3 + 24);
    return Math.ceil(測る(String((中 && 中.text) || ""), size, w, lh) * 1.15);
  }
  /* 余りを渡して嬉しい役（渡すと 表が伸び、字が 1 段 大きくなる） */
  var 伸びる役 = { table: 1, chart: 1, diagram: 1, image: 1, body: 1, bullets: 1, quote: 1, metric: 1,
                   steps: 1, compare: 1, kpi: 1, timeline: 1, callout: 1 };

  /* 上下に積む割りかたを **中身の量で** 配り直す */
  function 詰め直す(spec, 枠, 箱, t, 中身, purpose) {
    if (spec.partition.direction !== "vertical" || spec.partition.count < 2) return 枠;
    var n = spec.partition.count, gap = t.space.blockGap;
    var 使える = 箱.h - gap * (n - 1);
    var 必要 = spec.slots.map(function (s, i) {
      return Math.min(必要高(t, s, 中身[i] || null, 枠[i].w, purpose), 使える);
    });
    var 和 = 必要.reduce(function (a, b) { return a + b; }, 0);
    if (和 <= 0 || 和 >= 使える) return 枠;          /* 足りないなら 今までどおり */
    var r = spec.partition.ratio;
    var 重み = spec.slots.map(function (s, i) { return 伸びる役[s.role] ? r[i] : 0; });
    var 重和 = 重み.reduce(function (a, b) { return a + b; }, 0);
    if (!重和) { 重み = r.slice(); 重和 = r.reduce(function (a, b) { return a + b; }, 0); }
    var 余 = 使える - 和;
    var 高 = 必要.map(function (v, i) { return v + 余 * (重み[i] / 重和); });
    /* spacer は 最低限だけ残す（0 だと 詰まりすぎる） */
    高 = 高.map(function (v, i) { return spec.slots[i].role === "spacer" ? Math.max(8, v) : Math.max(24, v); });
    var 出 = [], y = 箱.y;
    高.forEach(function (h, i) {
      var Y = 上四(y);
      出.push({ x: 枠[i].x, y: Y, w: 枠[i].w, h: Math.max(8, 下四(y + h - Y)) });
      y += h + gap;
    });
    return 出;
  }

  /* ── 地に敷くもの ───────────────────────────────────────────── */
  function 地の作り(t, W, H) {
    var b = t.background, c = t.color;
    var css = c.bg, 飾 = [];
    if (b.kind === "gradient")
      css = "linear-gradient(" + b.角度 + "deg," + b.from + " 0%," + b.to + " 100%)";
    else if (b.kind === "texture")
      css = "radial-gradient(" + c.border + " 1.2px, transparent 1.2px) 0 0/" + b.間隔 + "px "
        + b.間隔 + "px, " + c.bg;
    else if (b.kind === "shapes") {
      /* ★ 角ばった四角を 隅に置くと **貼り忘れの当て紙**に見えた（目視）。
         丸いか、端まで通した帯か、どちらかにする。どちらも「わざと」に見える。 */
      var 大 = Math.round(H * 0.72);
      if (t.shape.kind === "sharp" || t.shape.kind === "angled") {
        var 厚 = Math.round(H * 0.34);
        飾.push(b.向き % 2
          ? { type: "shape", shape: "rect", x: 0, y: b.向き < 2 ? 0 : H - 厚, w: W, h: 厚, z: 0,
              fill: b.色, radius: 0, 装飾: true, はみ出し可: true, 役: "background" }
          : { type: "shape", shape: "rect", x: b.向き < 2 ? 0 : W - 厚, y: 0, w: 厚, h: H, z: 0,
              fill: b.色, radius: 0, 装飾: true, はみ出し可: true, 役: "background" });
      } else {
        var 位 = [[-大 * 0.42, -大 * 0.38], [W - 大 * 0.58, -大 * 0.42],
                  [-大 * 0.45, H - 大 * 0.5], [W - 大 * 0.5, H - 大 * 0.46]][b.向き % 4];
        飾.push({ type: "shape", shape: "circle",
                  x: Math.round(位[0]), y: Math.round(位[1]), w: 大, h: 大, z: 0,
                  fill: b.色, radius: 9999, 装飾: true, はみ出し可: true, 役: "background" });
      }
    }
    return { css: css, 飾: 飾 };
  }

  /* ── 端まで届く 1 本（bleed）──────────────────────────────── */
  function 端の帯(spec, t, W, H) {
    if (!spec.bleed) return null;
    var c = t.color, m = t.space.slideMargin;
    if (spec.gravity === "center")
      return { type: "shape", shape: "rect", x: 0, y: 0, w: W, h: 8, z: 0,
               fill: c.accent, radius: 0, 装飾: true, はみ出し可: true, 役: "bleed" };
    if (spec.gravity === "asymmetric")
      return { type: "shape", shape: "rect", x: W - 12, y: 0, w: 12, h: H, z: 0,
               fill: c.accent, radius: 0, 装飾: true, はみ出し可: true, 役: "bleed" };
    return { type: "shape", shape: "rect", x: 0, y: 0, w: Math.max(8, Math.round(m * 0.22)), h: H,
             z: 0, fill: c.accent, radius: 0, 装飾: true, はみ出し可: true, 役: "bleed" };
  }
  /* ── 中身を 1 スロットぶん 置く ───────────────────────────────
     ★ 入りきらないときは **タイプスケールの段を 1 つ下げる**（2026-08-17）。
       px を 1 ずつ削ると、1 枚の中で大きさがばらばらになり
       「1 デッキで タイプスケールが統一されている」が壊れる。
       段の中でしか動かさないので、統一は保たれる。 */
  function 置く(出, 枠, slot, 中, t, spec, purpose, idx, 予算) {
    var role = slot.role;
    if (role === "spacer") return;
    var size = 字大(t, role, slot.emphasis, purpose);
    /* ★ 箇条書きと本文の **右揃えはしない**（2026-08-17・目視）。
       行頭がそろわず、読む順が分からなくなる。中央は残す。 */
    var al = 揃え((role === "bullets" || role === "body") && slot.align === "end"
      ? "start" : slot.align);

    /* ★ すでに置いた飾りの上に載るときの **本当の地の色**（2026-08-17・実測）。
       地に大きな図形を敷く作りのとき、その上へ差し色の数字を置くと
       比が 4.08 まで落ちていた（差し色と うすい差し色は 2000 件中 1435 件が
       4.5 未満）。うすい差し色を無理に離すと「うすい」でなくなるので、
       **文字の色のほうを 読める側へ替える**。 */
    function 背後(cx, cy, z) {
      var 色 = t.color.bg, 高 = -1;
      出.forEach(function (o) {
        if (o.type !== "shape" || !o.fill || (o.z || 0) > z) return;
        if (cx < o.x || cx > o.x + o.w || cy < o.y || cy > o.y + o.h) return;
        if ((o.z || 0) >= 高) { 高 = o.z || 0; 色 = o.fill; }
      });
      return 色;
    }

    /* 大きい順の段（重複は落とす）。14px より下へは行かない。 */
    var 段 = [t.type.size.display, t.type.size.h1, t.type.size.h2, t.type.size.h3,
              t.type.size.body, t.type.size.caption]
      .filter(function (v, i, a) { return v >= 14 && a.indexOf(v) === i; })
      .sort(function (a, b) { return b - a; });

    /* ★ 枠に対して **大きいほうから** 合わせる（2026-08-17・実測）。
       前は「決めた大きさから 下へ」しか動かさなかったので、
       広い枠に 18px の本文がぽつんと乗り、100 枚並べると
       半分ちかくが **スカスカで作りかけに見えた**。
       上限は emphasis で決める（primary > secondary > tertiary）ので、
       上下関係は崩れず、段の中でしか動かないので統一も保たれる。 */
    /* ★ 伸ばせる上限を **役目ごと**に変える（2026-08-17・実測）。
       前は どの役目も primary=h1 止まりだったので、
       見出し 1 つだけのページや 箇条書きだけのページが
       広い枠の上のほうに小さく乗り、**1000 枚中 261 枚が
       内側の 25% も埋まっていなかった**（＝スカスカに見える）。
       見出しは大きく、本文は本文らしく、で段を分ける。 */
    var S2 = t.type.size;
    var 天井 = (function () {
      if (role === "heading")
        return { primary: S2.display, secondary: S2.h1, tertiary: S2.h2 };
      if (role === "subheading" || role === "quote")
        return { primary: S2.h1, secondary: S2.h2, tertiary: S2.h3 };
      return { primary: S2.h1, secondary: S2.h2, tertiary: S2.h3 };
    })();
    if (purpose === "title" || purpose === "closing") 天井.primary = S2.display;
    /* ★ そのページに 中身が 1 つしか無いなら **いちばん大きい段**まで使う
       （2026-08-17・実測）。1 分割のページが 画面の 2〜3 割しか埋まらず、
       スカスカに見えていた。言うことが 1 つだけの回は、大きく出すのが正しい。 */
    if ((spec.slots || []).filter(function (x) { return x.role !== "spacer"; }).length === 1) {
      天井.primary = S2.display;
      天井.secondary = S2.h1;
      天井.tertiary = S2.h2;
    }

    function 収める(text, 開始, w, 制限, のばす) {
      var 上 = のばす === false ? 開始
        : Math.max(開始, Math.min(天井[slot.emphasis] || 開始, t.type.size.display));
      var 候補 = 段.filter(function (s) { return s <= 上; });
      if (!候補.length) 候補 = [段[段.length - 1]];
      /* ★ 短い見出しを 語の途中で折らない（2026-08-17・目視）。
         枠に合わせて大きくしたら「文化祭の企 / 画」「3 年 A 組実行委 / 員会」
         のように 2 行へ割れて 見苦しくなった。
         短い文（改行なし・18em 以下）は **1 行に収まる いちばん大きい段**を選ぶ。 */
      var 短い = String(text).indexOf("\n") < 0 && 幅em(String(text)) <= 18;
      if (短い) {
        for (var k0 = 0; k0 < 候補.length; k0++) {
          var s0 = 候補[k0], lh0 = t.type.行間(s0);
          if (幅em(String(text)) * s0 <= w && 測る(text, s0, w, lh0) <= 制限)
            return { size: s0, lh: lh0, h: 測る(text, s0, w, lh0) };
        }
      }
      for (var i = 0; i < 候補.length; i++) {
        var s = 候補[i], lh = t.type.行間(s), h = 測る(text, s, w, lh);
        if (h <= 制限) return { size: s, lh: lh, h: h };
      }
      var 末 = 候補[候補.length - 1], lh2 = t.type.行間(末);
      return { size: 末, lh: lh2, h: 測る(text, 末, w, lh2) };
    }

    function 文(text, o) {
      o = o || {};
      /* ★ 幅は **最後に置く幅で**測る（2026-08-17・実測）。
         収めるときは 端数つきの幅、置くときは 4 の倍数へ切り捨て、で
         測りかたが 1〜3px ずれ、Gate が「72px / 枠 84px」のような
         きわどい溢れを 2/1000 枚 拾っていた。 */
      var w = 下四(o.w === undefined ? 枠.w : o.w);
      var 制限 = o.制限 === undefined ? 枠.h * 0.85 : o.制限;
      var f = 収める(String(text || ""), o.size || size, w, 制限);
      var y = o.y === undefined ? 枠.y : o.y;
      /* ★ **小さい字に 副文の色を使わない**（2026-08-17・実測）。
         副文の色は 4.5 で作ってあるので、20px 未満で使うと
         読みやすさの決まり（7.0）を満たせない。
         小さい所は 濃い色にして、弱さは **大きさで**出す。 */
      var 色 = o.color || 字色(t, role);
      /* ★ 判定は Gate と **同じ式**を使う（2026-08-17）。
         別々に書いていたので「20px 未満」と「32px 未満」でずれ、
         22px や 25px の副文が 落ちていた。 */
      var 大か = VQD.gate && VQD.gate.大きい字
        ? VQD.gate.大きい字(f.size, o.bold, "text")
        : (f.size >= 32 || (f.size >= 24 && o.bold));
      if (色 === t.color.textSecondary && !大か) 色 = t.color.textPrimary;
      var e = { type: "text", x: 四(o.x === undefined ? 枠.x : o.x), y: 四(y),
                w: w, h: 上四(Math.min(f.h, 枠.h)), text: String(text || ""),
                size: f.size, bold: !!o.bold, align: o.align || al,
                color: 色, lh: f.lh,
                fontStack: o.stack || (o.見出し ? t.type.stack.display : t.type.stack.body),
                z: o.z === undefined ? 1 : o.z, 役: o.役 || role, スロット: idx };
      出.push(e);
      return e;
    }

    /* 上下の置きどころ（align は 横だけでなく 縦にも効かせる）
       ★ start でも **短い中身を 上に貼りつけない**（2026-08-17・実測）。
         1 分割のページで 中身が上に寄り、下が 35% 以上あいたページが
         1000 枚中 162 枚あった。人が組むときは、量が少ないほど
         真ん中（やや上）に置く。それを式にする。 */
    function 縦(高さ) {
      var 余 = Math.max(0, 枠.h - 高さ);
      if (slot.align === "center") return 枠.y + 余 / 2;
      if (slot.align === "end") return 枠.y + 余;
      if (余 > 枠.h * 0.45) return 枠.y + 余 * 0.42;   /* 光学的中央（真ん中より少し上） */
      return 枠.y;
    }

    if (role === "heading" || role === "subheading") {
      var text = String((中 && 中.text) || "");
      var そえ = String((中 && 中.caption) || "");
      /* ★ 空の見出しは **置かない**（2026-08-17・実測）。
         空の文字の箱を置くと、Gate の「空のスロット」に引っかからず、
         表しか無いページが そのまま通っていた。置かなければ
         emptySlot が正しく出て、LLM に「書いてください」と返せる。 */
      if (!text.trim() && !そえ.trim()) return;
      var 飾り高 = t.seed.accent === "none" || t.seed.accent === "block" ? 0 : t.space.inlineGap + 10;
      var そえ大 = Math.min(t.type.size.h3, size);
      /* 見出し・飾り・そえ書き を **合わせて** 枠に収める */
      var 使える = 枠.h * 0.85 - 飾り高;
      var そえ実 = null;
      if (そえ) {
        そえ実 = 収める(そえ, そえ大, 枠.w, Math.max(20, 使える * 0.35));
        使える -= そえ実.h + t.space.inlineGap;
      }
      var 本 = 収める(text, size, 枠.w - (t.seed.accent === "block" ? t.space.inlineGap * 2 : 0),
                      Math.max(20, 使える));
      var 総 = 本.h + 飾り高 + (そえ実 ? そえ実.h + t.space.inlineGap : 0);
      var y0 = 縦(総);

      if (t.seed.accent === "block" && role === "heading") {
        var pad = Math.round(t.space.inlineGap);
        /* ★ 帯は **枠いっぱい**にする（2026-08-17・実測）。
           文字ぶんの幅にしていたら、文字の中心が帯からはみ出す枠があり、
           Gate が「白地に白文字（比 1.00）」と正しく叫んでいた。 */
        var bw0 = 下四(枠.w), bh0 = 上四(本.h + pad * 1.2);
        /* ★ 濃い色で塗ってよいのは 画面の 10% まで（§4.5）。
           大きな見出しの帯だけで 36% 塗っていた（実測）。
           足りないときは **うすい差し色の帯**へ落とす。柄は保てる。 */
        var 濃く塗れる = !予算 || 予算.残 >= bw0 * bh0;
        if (濃く塗れる && 予算) 予算.残 -= bw0 * bh0;
        出.push({ type: "shape", shape: "rect", x: 上四(枠.x), y: 上四(y0),
                  w: bw0, h: bh0, z: 0,
                  fill: 濃く塗れる ? t.color.accent : t.color.accentSoft,
                  radius: t.shape.radius, 装飾: true, 役: "accent", スロット: idx });
        文(text, { x: 枠.x + pad, w: 枠.w - pad * 2, y: y0 + pad * 0.6, size: 本.size, 制限: 本.h,
                   bold: true, 見出し: true,
                   color: 濃く塗れる ? t.color.textOnAccent : t.color.textPrimary, z: 2 });
      } else {
        /* ★ 飾りの位置は **置いた文字の実物**から取る（2026-08-17・実測）。
           予測した高さから計算していたので、丸めのぶん 3px ずれて
           Gate が「見出しと飾りが重なっている」と正しく叫んでいた。 */
        var 見 = 文(text, { y: y0, size: 本.size, 制限: 本.h,
                            bold: role === "heading", 見出し: role === "heading" });
        var 下端 = 見.y + 見.h + t.space.inlineGap;
        /* ★ **入らないなら 置かない**（2026-08-17・実測）。
           枠の下からはみ出す飾りは、最後の「余白内へ収める」処理で
           3px ほど押し上げられ、見出しの文字と重なっていた（32/1000 枚）。
           飾りは無くても資料は成立する。無理に置かない。 */
        var 入る = 下端 + 8 <= 枠.y + 枠.h;
        if (入る && t.seed.accent === "underline")
          出.push({ type: "shape", shape: "rect",
                    x: 上四(slot.align === "center" ? 枠.x + 枠.w / 2 - 60
                        : (slot.align === "end" ? 枠.x + 枠.w - 120 : 枠.x)),
                    y: 上四(下端), w: Math.min(120, 下四(枠.w)), h: 6, z: 1,
                    fill: t.color.accent, radius: t.shape.kind === "sharp" ? 0 : 3,
                    装飾: false, 役: "accent", スロット: idx });
        else if (入る && t.seed.accent === "rule")
          出.push({ type: "line", x: 上四(枠.x), y: 上四(下端),
                    w: 下四(枠.w), h: 4, z: 1, color: t.color.border, weight: 2,
                    装飾: false, 役: "accent", スロット: idx });
      }
      if (そえ実)
        文(そえ, { y: y0 + 本.h + 飾り高 + t.space.inlineGap, size: そえ実.size, 制限: そえ実.h,
                   color: t.color.textSecondary, 役: "subheading" });
      return;
    }

    if (role === "body" || role === "bullets") {
      var 本文 = role === "bullets"
        ? ((中 && 中.items) || []).map(function (x) { return "・" + String(x); }).join("\n")
        : String((中 && 中.text) || "");
      if (!String(本文).trim()) return;
      var f2 = 収める(本文, size, 枠.w, 枠.h * 0.85);
      /* ★ 3 行以上になる本文を 中央揃えにしない（2026-08-17・目視）。
         行の左端がそろわず、ぎざぎざして読みにくい。 */
      var 行数 = Math.max(1, Math.round(f2.h / (f2.size * f2.lh)));
      文(本文, { y: 縦(f2.h), size: f2.size, 制限: f2.h,
                 align: (行数 >= 3 && al === "center") ? "left" : al });
      return;
    }

    if (role === "quote") {
      var q = String((中 && 中.text) || "");
      if (!q.trim()) return;
      var qw = 枠.w - 28;
      var そえq = String((中 && 中.caption) || "");
      var 余 = 枠.h * 0.85 - (そえq ? t.type.size.caption * 1.7 + t.space.inlineGap : 0);
      var fq = 収める(q, size, qw, Math.max(24, 余));
      var 総q = fq.h + (そえq ? t.type.size.caption * 1.7 + t.space.inlineGap : 0);
      var qy = 縦(総q);
      出.push({ type: "shape", shape: "rect", x: 上四(枠.x), y: 上四(qy), w: 8, h: 上四(fq.h),
                z: 1, fill: t.color.accent, radius: t.shape.kind === "sharp" ? 0 : 4,
                装飾: false, 役: "accent", スロット: idx });
      文(q, { x: 枠.x + 28, w: qw, y: qy, size: fq.size, 制限: fq.h });
      if (そえq)
        文("— " + そえq, { x: 枠.x + 28, w: qw, y: qy + fq.h + t.space.inlineGap,
                           size: t.type.size.caption, 制限: t.type.size.caption * 1.8,
                           color: t.color.textSecondary, 役: "subheading" });
      return;
    }

    if (role === "metric") {
      var v = String((中 && 中.value) || (中 && 中.text) || "");
      if (!v.trim()) return;
      var lab = String((中 && 中.caption) || "");
      var 幅 = Math.max(1, 幅em(v));
      var ms = Math.min(size, Math.floor(枠.h * 0.42), Math.floor(枠.w / 幅 * 0.95));
      ms = Math.max(20, ms);
      var mh = Math.min(枠.h, ms * 1.25 + (lab ? t.type.size.caption * 1.8 : 0));
      var my = 上四(縦(mh));
      var 地色 = 背後(枠.x + 枠.w / 2, my + mh / 2, 1);
      var 数字色 = VQD.color.contrast(t.color.accent, 地色) >= 4.5
        ? t.color.accent : t.color.textPrimary;
      出.push({ type: "number", x: 上四(枠.x), y: my, w: 下四(枠.w), h: 上四(mh), z: 1,
                text: v, label: lab, size: ms, color: 数字色,
                fontStack: t.type.stack.display, 役: "metric", スロット: idx });
      return;
    }

    if (role === "table") {
      var rows = (中 && 中.rows) || [];
      if (!rows.length) return;
      var 字 = Math.max(14, Math.min(t.type.size.body, Math.floor(枠.h / rows.length / 2.2)));
      /* ★ 枠が余っているなら 行の高さを のばして 表で埋める（2026-08-17・実測）。
         1 分割のページに 4 行の表を置くと、上 4 割だけ表で
         下 6 割が空白になっていた（1000 枚中 11 枚がこの形）。 */
      var 行高 = Math.max(26, Math.round(字 * 1.9));
      行高 = Math.max(行高, Math.min(Math.floor(枠.h / rows.length), Math.round(字 * 3.2)));
      var th = Math.min(下四(枠.h), 上四(rows.length * 行高));
      出.push({ type: "table", x: 上四(枠.x), y: 上四(縦(th)), w: 下四(枠.w), h: th, z: 1,
                rows: rows, size: 字, 役: "table", スロット: idx });
      return;
    }

    if (role === "chart") {
      var ch = (中 && 中.chart) || null;
      if (!ch) return;
      var chh = 下四(枠.h);
      出.push({ type: "chart", x: 上四(枠.x), y: 上四(縦(chh)), w: 下四(枠.w), h: chh, z: 1,
                chart: ch, 役: "chart", スロット: idx });
      return;
    }

    /* ══ ここから 足した役目（2026-08-17）════════════════════════════
       ★ どれも 既存の部品（text / shape / line / number）の組み合わせ。
         アプリ側の描画は 1 行も変えていない。
       ★ 中身は cells（題 / 文 / 数）で受ける。役目ごとに鍵を分けない。 */
    /* ★ カードの角は **丸めすぎない**（2026-08-17・目視）。
       shape が circular の Seed では radius が 9999 なので、
       比べるカードや囲みが **楕円**になって崩れて見えた。
       円にしてよいのは 丸番号やアイコンのような 小さいものだけ。 */
    var カード角 = Math.min(t.shape.radius, 24);

    function 中身のこま(既定) {
      var c = (中 && 中.cells) || null;
      if (c && c.length) return c;
      var it = (中 && 中.items) || [];
      if (it.length) return it.map(function (x) { return { title: String(x) }; });
      return 既定 || [];
    }

    /* ── 番号つきの手順 ─────────────────────────────────────── */
    if (role === "steps") {
      var 手 = 中身のこま().slice(0, 4);
      if (!手.length) return;
      var n2 = 手.length;
      var 横か = 枠.w >= 枠.h * 1.25;
      var 丸 = Math.max(28, Math.min(44, Math.round(t.type.size.h3 * 1.5)));
      if (横か) {
        var cw = 下四((枠.w - t.space.gutter * (n2 - 1)) / n2);
        var ch = Math.min(下四(枠.h), 上四(丸 + 12 + t.type.size.h3 * 1.4 + t.type.size.body * 1.7 * 2));
        var cy = 上四(縦(ch));
        手.forEach(function (x, i) {
          var cx = 上四(枠.x + i * (cw + t.space.gutter));
          出.push({ type: "shape", shape: "circle", x: cx, y: cy, w: 丸, h: 丸, z: 1,
                    fill: t.color.accent, radius: 9999, 装飾: true, 役: "steps", スロット: idx });
          出.push({ type: "text", x: cx, y: 上四(cy + (丸 - t.type.size.h3) / 2 - 2), w: 丸, h: 上四(t.type.size.h3 * 1.4),
                    text: String(i + 1), size: Math.max(14, Math.round(丸 * 0.5)), bold: true,
                    align: "center", color: t.color.textOnAccent, lh: 1.1,
                    fontStack: t.type.stack.display, z: 2, 役: "steps", スロット: idx });
          var ty = cy + 丸 + 10;
          if (x.title) {
            var f3 = 収める(x.title, t.type.size.h3, cw, t.type.size.h3 * 2.9, false);
            文(x.title, { x: cx, y: ty, w: cw, size: f3.size, 制限: f3.h, bold: true, align: "left", 役: "steps" });
            ty += f3.h + 4;
          }
          if (x.text) {
            var f4 = 収める(x.text, t.type.size.body, cw, Math.max(20, cy + ch - ty), false);
            文(x.text, { x: cx, y: ty, w: cw, size: f4.size, 制限: f4.h, align: "left",
                         color: t.color.textSecondary, 役: "steps" });
          }
        });
      } else {
        var rh = 下四((枠.h - t.space.inlineGap * (n2 - 1)) / n2);
        手.forEach(function (x, i) {
          var ry = 上四(枠.y + i * (rh + t.space.inlineGap));
          出.push({ type: "shape", shape: "circle", x: 上四(枠.x), y: 上四(ry + (rh - 丸) / 2),
                    w: 丸, h: 丸, z: 1, fill: t.color.accent, radius: 9999,
                    装飾: true, 役: "steps", スロット: idx });
          出.push({ type: "text", x: 上四(枠.x), y: 上四(ry + (rh - t.type.size.h3) / 2 - 2),
                    w: 丸, h: 上四(t.type.size.h3 * 1.4), text: String(i + 1),
                    size: Math.max(14, Math.round(丸 * 0.5)), bold: true, align: "center",
                    color: t.color.textOnAccent, lh: 1.1, fontStack: t.type.stack.display,
                    z: 2, 役: "steps", スロット: idx });
          var tx = 枠.x + 丸 + 16, tw = 下四(枠.w - 丸 - 16);
          var 題 = x.title || "", 説 = x.text || "";
          var h題 = 題 ? 収める(題, t.type.size.h3, tw, rh * 0.6, false) : null;
          var h説 = 説 ? 収める(説, t.type.size.body, tw, rh - (h題 ? h題.h : 0) - 4, false) : null;
          var 総h = (h題 ? h題.h : 0) + (h説 ? h説.h + 4 : 0);
          var y2 = ry + Math.max(0, (rh - 総h) / 2);
          if (h題) { 文(題, { x: tx, y: y2, w: tw, size: h題.size, 制限: h題.h, bold: true, align: "left", 役: "steps" }); y2 += h題.h + 4; }
          if (h説) 文(説, { x: tx, y: y2, w: tw, size: h説.size, 制限: h説.h, align: "left",
                            color: t.color.textSecondary, 役: "steps" });
        });
      }
      return;
    }

    /* ── 2 つを 並べて比べる ─────────────────────────────────── */
    if (role === "compare") {
      var 比 = 中身のこま().slice(0, 2);
      if (比.length < 2) return;
      var 横2 = 枠.w >= 枠.h;
      var 帯h = 上四(t.type.size.h3 * 1.9);
      var pad = Math.max(10, t.space.inlineGap);
      /* ★ 2 枚目の帯に **副の色**を使わない（2026-08-17・実測）。
         副の色は「地に対して 3.0」でしか作っていないので、
         その上に白文字を置くと 3.88 まで落ちた。
         1 枚目＝濃い差し色＋白文字、2 枚目＝うすい差し色＋濃い文字 にする。
         強弱もこのほうが はっきり出る。 */
      var 色2 = [t.color.accent, t.color.accentSoft];
      var 字2 = [t.color.textOnAccent, t.color.textPrimary];
      /* 濃い色で塗ってよい面積が残っていなければ うすい帯に落とす（§4.5） */
      var 帯面 = 下四((枠.w - t.space.gutter) / 2) * 上四(t.type.size.h3 * 1.9);
      if (予算 && 予算.残 < 帯面) { 色2[0] = t.color.accentSoft; 字2[0] = t.color.textPrimary; }
      else if (予算) 予算.残 -= 帯面;
      if (横2) {
        var w2 = 下四((枠.w - t.space.gutter) / 2);
        var h2 = 下四(枠.h);
        var y3 = 上四(縦(h2));
        比.forEach(function (x, i) {
          var x2 = 上四(枠.x + i * (w2 + t.space.gutter));
          出.push({ type: "shape", shape: "rect", x: x2, y: y3, w: w2, h: h2, z: 0,
                    fill: t.color.accentSoft, radius: カード角, 装飾: true, 役: "compare", スロット: idx });
          出.push({ type: "shape", shape: "rect", x: x2, y: y3, w: w2, h: 帯h, z: 1,
                    fill: 色2[i], radius: カード角, 装飾: true, 役: "compare", スロット: idx });
          文(x.title || "", { x: x2 + pad, y: y3 + (帯h - t.type.size.h3 * 1.3) / 2, w: w2 - pad * 2,
                              size: t.type.size.h3, 制限: 帯h, bold: true, align: "left",
                              color: 字2[i], z: 2, 役: "compare" });
          if (x.text) {
            var f5 = 収める(x.text, t.type.size.body, w2 - pad * 2, h2 - 帯h - pad * 2, false);
            文(x.text, { x: x2 + pad, y: y3 + 帯h + pad, w: w2 - pad * 2, size: f5.size,
                         制限: f5.h, align: "left", z: 2, 役: "compare" });
          }
        });
      } else {
        var hh = 下四((枠.h - t.space.inlineGap) / 2);
        比.forEach(function (x, i) {
          var yy = 上四(枠.y + i * (hh + t.space.inlineGap));
          出.push({ type: "shape", shape: "rect", x: 上四(枠.x), y: yy, w: 下四(枠.w), h: hh, z: 0,
                    fill: t.color.accentSoft, radius: カード角, 装飾: true, 役: "compare", スロット: idx });
          出.push({ type: "shape", shape: "rect", x: 上四(枠.x), y: yy, w: 8, h: hh, z: 1,
                    fill: 色2[i], radius: 0, 装飾: true, 役: "compare", スロット: idx });
          var tw2 = 下四(枠.w - 16 - pad * 2);
          var 題e = 文(x.title || "", { x: 枠.x + 16 + pad, y: yy + pad, w: tw2, size: t.type.size.h3,
                                        制限: t.type.size.h3 * 1.6, bold: true, align: "left",
                                        z: 2, 役: "compare" });
          var 次y = 題e.y + 題e.h + 6;
          if (x.text && 次y + 24 <= yy + hh - pad)
            文(x.text, { x: 枠.x + 16 + pad, y: 次y, w: tw2,
                         size: t.type.size.body, 制限: yy + hh - pad - 次y,
                         align: "left", z: 2, 役: "compare" });
        });
      }
      return;
    }

    /* ── 大きな数字を 並べる ─────────────────────────────────── */
    if (role === "kpi") {
      var 数 = 中身のこま().filter(function (x) { return x.value || x.title; }).slice(0, 4);
      if (!数.length) return;
      var n3 = 数.length;
      var kw = 下四((枠.w - t.space.gutter * (n3 - 1)) / n3);
      var ks = Math.min(t.type.size.display, Math.floor(枠.h * 0.42),
                        Math.floor(kw / Math.max(1, Math.max.apply(null, 数.map(function (x) { return 幅em(String(x.value || x.title || "")); }))) * 0.95));
      ks = Math.max(t.type.size.h2, ks);
      var kh = Math.min(下四(枠.h), 上四(ks * 1.25 + t.type.size.caption * 1.9));
      var ky = 上四(縦(kh));
      数.forEach(function (x, i) {
        var kx = 上四(枠.x + i * (kw + t.space.gutter));
        出.push({ type: "number", x: kx, y: ky, w: kw, h: kh, z: 1,
                  text: String(x.value || ""), label: String(x.title || ""),
                  size: ks, color: t.color.accent, fontStack: t.type.stack.display,
                  役: "kpi", スロット: idx });
        if (i < n3 - 1)
          出.push({ type: "shape", shape: "rect",
                    x: 上四(kx + kw + t.space.gutter / 2 - 1), y: 上四(ky + kh * 0.15),
                    w: 2, h: 下四(kh * 0.7), z: 0, fill: t.color.border, radius: 0,
                    装飾: true, 役: "kpi", スロット: idx });
      });
      return;
    }

    /* ── 囲みの強調 ─────────────────────────────────────────── */
    if (role === "callout") {
      var 言 = String((中 && 中.text) || "");
      if (!言.trim()) return;
      var pad2 = Math.max(12, t.space.inlineGap + 4);
      var 内w = 下四(枠.w - 12 - pad2 * 2);
      var f6 = 収める(言, t.type.size.h3, 内w, 枠.h * 0.85 - pad2 * 2);
      var 箱h = 上四(f6.h + pad2 * 2 + (中 && 中.caption ? t.type.size.caption * 1.8 : 0));
      var 箱y = 上四(縦(箱h));
      出.push({ type: "shape", shape: "rect", x: 上四(枠.x), y: 箱y, w: 下四(枠.w), h: 箱h, z: 0,
                fill: t.color.accentSoft, radius: カード角,
                装飾: true, 役: "callout", スロット: idx });
      出.push({ type: "shape", shape: "rect", x: 上四(枠.x), y: 箱y, w: 6, h: 箱h, z: 1,
                fill: t.color.accent, radius: 0, 装飾: true, 役: "callout", スロット: idx });
      文(言, { x: 枠.x + 12 + pad2, y: 箱y + pad2, w: 内w, size: f6.size, 制限: f6.h,
               align: "left", z: 2, 役: "callout" });
      if (中 && 中.caption)
        文("— " + 中.caption, { x: 枠.x + 12 + pad2, y: 箱y + pad2 + f6.h + 2, w: 内w,
                                size: t.type.size.caption, 制限: t.type.size.caption * 1.8,
                                color: t.color.textSecondary, z: 2, 役: "subheading" });
      return;
    }

    /* ── 横軸の年表 ─────────────────────────────────────────── */
    if (role === "timeline") {
      var 点 = 中身のこま().slice(0, 5);
      if (点.length < 2) return;
      var n4 = 点.length;
      var 線y = 上四(枠.y + 枠.h * 0.5);
      var 端 = Math.round(枠.w / (n4 * 2));
      出.push({ type: "line", x: 上四(枠.x + 端), y: 線y, w: 下四(枠.w - 端 * 2), h: 4, z: 0,
                color: t.color.border, weight: 2, 装飾: true, 役: "timeline", スロット: idx });
      var 幅1 = 下四(枠.w / n4);
      点.forEach(function (x, i) {
        var cx2 = 枠.x + 端 + (枠.w - 端 * 2) * (n4 === 1 ? 0 : i / (n4 - 1));
        出.push({ type: "shape", shape: "circle", x: 上四(cx2 - 7), y: 上四(線y - 5),
                  w: 14, h: 14, z: 1, fill: t.color.accent, radius: 9999,
                  装飾: true, 役: "timeline", スロット: idx });
        var lx = Math.max(枠.x, Math.min(cx2 - 幅1 / 2, 枠.x + 枠.w - 幅1));
        if (x.title) {
          var f7 = 収める(x.title, t.type.size.h3, 幅1 - 8, 枠.h * 0.35, false);
          文(x.title, { x: lx + 4, y: 線y - 16 - f7.h, w: 幅1 - 8, size: f7.size, 制限: f7.h,
                        bold: true, align: "center", 役: "timeline" });
        }
        if (x.text) {
          var f8 = 収める(x.text, t.type.size.caption, 幅1 - 8, 枠.h * 0.35, false);
          文(x.text, { x: lx + 4, y: 線y + 18, w: 幅1 - 8, size: f8.size, 制限: f8.h,
                       align: "center", color: t.color.textSecondary, 役: "timeline" });
        }
      });
      return;
    }

    /* ── セクションの扉 ─────────────────────────────────────── */
    if (role === "section") {
      var 題2 = String((中 && 中.text) || "");
      if (!題2.trim()) return;
      var 番2 = String((中 && 中.value) || (中 && 中.caption) || "");
      var 数大 = Math.min(t.type.size.display, Math.floor(枠.h * 0.5));
      var 題大 = 収める(題2, t.type.size.h1, 下四(枠.w - (番2 ? 数大 * 0.9 : 0)), 枠.h * 0.5);
      var 総2 = (番2 ? 数大 * 1.1 : 0) + 題大.h + 12;
      var y4 = 縦(総2);
      if (番2) {
        出.push({ type: "text", x: 上四(枠.x), y: 上四(y4), w: 下四(枠.w), h: 上四(数大 * 1.1),
                  text: 番2, size: 数大, bold: true, align: "left",
                  color: t.color.accent, lh: 1.05, fontStack: t.type.stack.display,
                  z: 1, 役: "section", スロット: idx });
        y4 += 数大 * 1.1 + 8;
      }
      var 節 = 文(題2, { y: y4, size: 題大.size, 制限: 題大.h, bold: true, 見出し: true,
                         align: "left", 役: "section" });
      if (節.y + 節.h + 14 + 8 <= 枠.y + 枠.h)
        出.push({ type: "shape", shape: "rect", x: 上四(枠.x), y: 上四(節.y + 節.h + 14),
                  w: Math.min(160, 下四(枠.w)), h: 6, z: 1, fill: t.color.accent,
                  radius: t.shape.kind === "sharp" ? 0 : 3, 装飾: false, 役: "accent", スロット: idx });
      return;
    }

    if (role === "diagram" || role === "image") {
      /* 図解: 箱を並べて つなぐ。**中身から作る**（空の箱は作らない）。
         ★ 枠が縦長なら 縦に積む。前は横並びしか無く、
           横分割のページで **何も置かれず「空のスロット」**になっていた。 */
      var 品 = ((中 && 中.items) || []).slice(0, 4);
      if (!品.length) return;
      var n = 品.length;
      var 矢 = Math.max(16, Math.round(t.space.gutter));
      var 横並び = 枠.w >= 枠.h * 1.15;
      if (横並び) {
        var bw = 下四((枠.w - 矢 * (n - 1)) / n);
        var bh = Math.min(下四(枠.h), Math.max(64, 下四(枠.h * 0.92)));
        var by = 上四(縦(bh));
        品.forEach(function (s, i) {
          var bx = 上四(枠.x + i * (bw + 矢));
          出.push({ type: "shape", shape: "rect",
                    x: bx, y: by, w: bw, h: bh, z: 1, fill: t.color.accentSoft,
                    radius: カード角, 装飾: true, 役: "diagram", スロット: idx });
          var ft = 収める(String(s), size, bw - 20, bh * 0.8);
          文(String(s), { x: bx + 10, y: by + (bh - ft.h) / 2, w: bw - 20, 制限: ft.h,
                          size: ft.size, align: "center", z: 2, 役: "diagram" });
          if (i < n - 1)
            出.push({ type: "arrow", x: 上四(bx + bw + 2), y: 上四(by + bh / 2 - 8),
                      w: Math.max(8, 下四(矢 - 6)), h: 16, z: 1, color: t.color.accent,
                      装飾: false, 役: "diagram", スロット: idx });
        });
      } else {
        var bh2 = 下四((枠.h - 矢 * (n - 1)) / n);
        if (bh2 < 32) { n = Math.max(1, Math.floor(枠.h / (32 + 矢))); 品 = 品.slice(0, n); bh2 = 下四((枠.h - 矢 * (n - 1)) / n); }
        var bw2 = 下四(枠.w);
        品.forEach(function (s, i) {
          var by2 = 上四(枠.y + i * (bh2 + 矢));
          出.push({ type: "shape", shape: "rect", x: 上四(枠.x), y: by2, w: bw2, h: bh2, z: 1,
                    fill: t.color.accentSoft, radius: カード角,
                    装飾: true, 役: "diagram", スロット: idx });
          var ft2 = 収める(String(s), size, bw2 - 20, bh2 * 0.8);
          文(String(s), { x: 枠.x + 10, y: by2 + (bh2 - ft2.h) / 2, w: bw2 - 20, 制限: ft2.h,
                          size: ft2.size, align: "center", z: 2, 役: "diagram" });
        });
      }
      return;
    }
  }

  /* ── そのスロットに入る 文字数（§10 で LLM へ「32 文字以内」と数で渡す）─
     ★ 「短く」ではなく **数**を渡すためのもの。和文（1 字 = 1em）で数える。
     ★ 中身を作る側と、Gate で測る側が **同じ式**を使う。ここがずれると
       「作った文字が入らない」が延々と起きる。 */
  function 文字数の上限(t, 枠, role, emphasis, purpose) {
    var 寸 = 寸法(t, 枠, role, emphasis, purpose);
    return 寸.文字数上限;
  }
  /* ★ 箇条書きは **行数**が効く（2026-08-17・実測）。
     1 項目が 1 行を必ず食うので、「全部で 30 字」だけ渡すと
     3 項目 × 1 行 = 3 行 になって 2 行の枠から溢れていた。
     行数と 1 行の字数を いっしょに渡す。 */
  function 寸法(t, 枠, role, emphasis, purpose) {
    var size = 字大(t, role, emphasis, purpose);
    /* ★ **入れられる量を 少なく申告していた**（2026-08-17・訴え）。
       上限を「決めた大きさ」で数えていたが、実際には入りきらなければ
       段を 1 つ下げて収める作りなので、**本当はもっと入る**。
       訴え「入れたいことが入れられなくて、結局あとから自分で直す」。
       本文・箇条書き・引用は 1 段下の大きさで数える（約 1.3〜1.5 倍 入る）。 */
    if (role === "body" || role === "bullets" || role === "quote") {
      var 段2 = [t.type.size.display, t.type.size.h1, t.type.size.h2, t.type.size.h3,
                 t.type.size.body, t.type.size.caption]
        .filter(function (v, i, a2) { return v >= 14 && a2.indexOf(v) === i; })
        .sort(function (x, y) { return y - x; });
      for (var i2 = 0; i2 < 段2.length; i2++)
        if (段2[i2] < size) { size = 段2[i2]; break; }
    }
    var lh = t.type.行間(size);
    var w = 枠.w - (role === "quote" ? 28 : 0);
    var 一行 = Math.max(1, Math.floor(w / size));
    var 行 = Math.max(1, Math.floor((枠.h * 0.85) / (size * lh)));
    return { 字の大きさ: size, 行数上限: 行, 一行の文字数: 一行,
             文字数上限: Math.max(4, Math.floor(一行 * 行 * 0.92)) };
  }
  /* ページの Spec と Tokens から、スロットごとの上限をまとめて出す */
  function 上限一覧(spec, t, opts) {
    opts = opts || {};
    var W = opts.w || 960, H = opts.h || 540;
    var s = G.正規化(spec);
    var m = t.space.slideMargin;
    var 箱 = { x: m, y: m, w: W - m * 2, h: H - m * 2 };
    if (s.gravity === "asymmetric") {
      var 一列 = Math.round((W - m * 2) / t.grid);
      箱 = { x: m + 一列, y: m, w: W - m * 2 - 一列, h: H - m * 2 };
    }
    var 枠 = 枠を割る(s, 箱, t);
    var 出 = s.slots.map(function (sl, i) {
      if (sl.role === "spacer")
        return { slotIndex: i, role: "spacer", 文字数上限: 0, 行数上限: 0, 一行の文字数: 0, 枠: 枠[i] };
      var 寸 = 寸法(t, 枠[i], sl.role, sl.emphasis, opts.purpose);
      return { slotIndex: i, role: sl.role, emphasis: sl.emphasis,
               文字数上限: 寸.文字数上限, 行数上限: 寸.行数上限,
               一行の文字数: 寸.一行の文字数, 字の大きさ: 寸.字の大きさ, 枠: 枠[i] };
    });
    /* ページ全体の字数（Gate の charDensity と同じ上限）も返す */
    var 本文枠 = 出.filter(function (x) { return x.role === "body" || x.role === "bullets"; });
    /* ページ全体の本文の量。Gate が **止める線**（和文 320 字）に合わせる。
       目安の 200 字ではなく 限界で配ることで、書きたいことが入る。 */
    var 全体 = (opts.lang === "en" ? 640 : 320);
    本文枠.forEach(function (x) {
      x.文字数上限 = Math.min(x.文字数上限, Math.max(8, Math.floor(全体 / 本文枠.length)));
    });
    出.ページ全体の本文字数 = 全体;
    return 出;
  }

  /* ── 本体 ───────────────────────────────────────────────────── */
  function resolve(page, t, opts) {
    opts = opts || {};
    var W = opts.w || 960, H = opts.h || 540;
    var spec = G.正規化(page.layout);
    var m = t.space.slideMargin;
    var 箱 = { x: m, y: m, w: W - m * 2, h: H - m * 2 };
    if (spec.gravity === "asymmetric") {
      var 一列 = Math.round((W - m * 2) / t.grid);
      箱 = { x: m + 一列, y: m, w: W - m * 2 - 一列, h: H - m * 2 };
    }
    var 出 = [];
    var 地 = 地の作り(t, W, H);
    地.飾.forEach(function (e) { 出.push(e); });
    /* ══ ページの調度（番号・細い罫）（2026-08-17・訴え「素人感」）════════
       ★ 実測: 飾りを none にした Seed で **文字だけのページが 3/10 枚**出た。
         文字が浮いているだけのページは、それだけで素人っぽく見える。
       ★ 資料らしくする最低限を 全ページに置く:
           ・ページ番号（表紙以外・右下・小さく）
           ・飾りが none のときは 中身の上に **細い罫**を 1 本
         どちらも 主張しない。**中身の邪魔をしない位置**に置く。 */
    var 番 = page["番号"] || 0;
    if (番 > 1) {
      出.push({ type: "text", x: 下四(W - m - 80), y: 上四(H - m + 6), w: 80, h: 20,
                text: String(番), size: Math.max(11, t.type.size.caption - 2),
                align: "right", color: t.color.textSecondary, lh: 1.2,
                fontStack: t.type.stack.body, z: 1,
                装飾: true, はみ出し可: true, 役: "pagenum" });
    }
    /* ★ 表紙も 例外にしない（実測）。飾り none ＋ 帯なしの表紙は
       文字が 1 行 浮いているだけで、いちばん素人っぽく見える。
       罫は 1 本だけ。主張しない。 */
    if (t.seed.accent === "none") {
      出.push({ type: "line", x: 上四(m), y: 上四(番 === 1 ? H - m + 10 : m - 14),
                w: 下四(W - m * 2), h: 4,
                color: t.color.border, weight: 1, z: 0,
                装飾: true, はみ出し可: true, 役: "rule" });
    }

    /* 濃い色（S>60%）で塗ってよい面積。ここから引いていく（§4.5）。 */
    var 予算 = { 残: W * H * 0.10 };
    出.forEach(function (e) {
      if (e.fill && VQD.color.satOf(e.fill) > 60) 予算.残 -= Math.max(0, e.w) * Math.max(0, e.h);
    });
    var 帯 = 端の帯(spec, t, W, H);
    if (帯) { 出.push(帯); if (VQD.color.satOf(帯.fill) > 60) 予算.残 -= 帯.w * 帯.h; }

    var 枠 = 枠を割る(spec, 箱, t);
    var 中身 = {};
    ((page.content) || []).forEach(function (c) { 中身[c.slotIndex] = c; });
    枠 = 詰め直す(spec, 枠, 箱, t, 中身, page.purpose);
    spec.slots.forEach(function (s, i) {
      置く(出, 枠[i], s, 中身[i] || null, t, spec, page.purpose, i, 予算);
    });

    /* ★ 最後に **必ず** 余白の内側へ収める（2026-08-17）。
       ここまでで気をつけていても、丸めや文字の実寸のずれで 1〜3px 出る。
       出たものは 黙って外に置かず、内側へ詰める。 */
    var 余 = { x: m, y: m, w: W - m * 2, h: H - m * 2 };
    出.forEach(function (e) {
      if (e.はみ出し可) return;
      if (e.x < 余.x) { e.w -= (余.x - e.x); e.x = 余.x; }
      if (e.y < 余.y) { e.h -= (余.y - e.y); e.y = 余.y; }
      if (e.x + e.w > 余.x + 余.w) e.w = 余.x + 余.w - e.x;
      if (e.y + e.h > 余.y + 余.h) e.h = 余.y + 余.h - e.y;
      if (e.w < 8) { e.x = Math.max(余.x, Math.min(e.x, 余.x + 余.w - 8)); e.w = 8; }
      if (e.h < 8) { e.y = Math.max(余.y, Math.min(e.y, 余.y + 余.h - 8)); e.h = 8; }
    });

    /* id を振る（無い場合だけ） */
    出.forEach(function (e) { if (!e.id) e.id = uid(); });
    return { elements: 出, background: 地.css, canvas: { w: W, h: H }, 枠: 枠, spec: spec, 内箱: 箱 };
  }

  VQD.resolve = resolve;
  VQD.measure = { 測る: 測る, 幅em: 幅em, 四: 四, 番号を戻す: 番号を戻す,
                  文字数の上限: 文字数の上限, 上限一覧: 上限一覧, 字大: 字大 };
})(typeof globalThis !== "undefined" ? globalThis : this);
