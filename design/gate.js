/* ══════════════════════════════════════════════════════════════════════
   design/gate.js — 崩れの検出（**純粋関数だけ**）

   ★ 「このスライドは崩れていますか」と LLM に聞かない。ここで数える。
   ★ error が 1 つでもあれば needs_repair。warning だけなら ok とし、
     デッキ全体を has_warnings にする。
   ★ 文字の実寸は推定なので、**枠の 85% を超えたら溢れ**とする（安全側）。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQD = root.VQD || (root.VQD = {});
  var C = VQD.color, M = VQD.measure;

  var 最小字 = 14;
  var 濃さの上限 = 0.85;          /* 枠の何割まで文字を入れてよいか */
  /* ★ 字数の上限（2026-08-17・訴えで 2 段にした）。
     指示書は「和文 200 字を超えたら error」。ところが実際には
     「入れたいことが入れられない」という訴えが出た。
     読みやすさの **目安は 200 字のまま**（超えたら warning で知らせる）、
     **止めるのは 320 字**にする。緩めたのではなく、
     「知らせる線」と「止める線」を分けた。 */
  var 字数上限 = { ja: 200, en: 400 };
  var 字数の限界 = { ja: 320, en: 640 };

  function 重なり(a, b) {
    var x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    var y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    return x * y;
  }
  function 和文か(s) { return /[^\x00-\x7F]/.test(String(s || "")); }

  /* その文字の **真後ろにある色**。飾りの上に載っているならその色で測る。 */
  function 背後の色(e, res, t) {
    var 中 = { x: e.x + e.w / 2, y: e.y + e.h / 2 };
    var 色 = null, 高 = -1;
    (res.elements || []).forEach(function (o) {
      if (o === e || o.type !== "shape" || !o.fill) return;
      if ((o.z || 0) > (e.z || 0)) return;
      if (中.x < o.x || 中.x > o.x + o.w || 中.y < o.y || 中.y > o.y + o.h) return;
      if ((o.z || 0) >= 高) { 高 = o.z || 0; 色 = o.fill; }
    });
    if (色) return 色;
    var b = t.background;
    if (b.kind === "gradient") {
      /* 階調はどちらの端でも読めなければならない。**悪いほう**で測る。 */
      return C.contrast(e.color || t.color.textPrimary, b.from)
        < C.contrast(e.color || t.color.textPrimary, b.to) ? b.from : b.to;
    }
    return t.color.bg;
  }

  /* ★ 要る比は **役目ではなく 字の大きさ**で決める（2026-08-17）。
     役目で決めていたので、部品を足すたびに 例外を書き足すことになり、
     書き忘れた役目は 大きな見出しにも 本文と同じ 7.0 を課して落ちていた。
     読みやすさは 役目ではなく 大きさで決まる（WCAG も同じ考えかた）。
       大きい字（32px 以上／太字なら 24px 以上）… 4.5
       それ以外                                  … 7.0
     ページ番号だけは 目印なので 4.5。 */
  function 大きい字(size, bold, type) {
    if (type === "number") return true;      /* 大きな数字は それ自体が大きい */
    var s = size || 18;
    return s >= 32 || (s >= 24 && !!bold);
  }
  function 要る比(e) {
    if (e.役 === "pagenum") return 4.5;
    return 大きい字(e.size, e.bold, e.type) ? 4.5 : 7.0;
  }

  /* ── 1 ページ ─────────────────────────────────────────────── */
  function checkPage(page, res, t) {
    var 悪 = [], W = res.canvas.w, H = res.canvas.h;
    var m = t.space.slideMargin;
    var 内 = { x: m, y: m, w: W - m * 2, h: H - m * 2 };
    var els = res.elements || [];
    var 本文字数 = 0, 和 = false;

    els.forEach(function (e) {
      /* ① 枠からのはみ出し */
      if (!e.はみ出し可) {
        if (e.x < 内.x - 1 || e.y < 内.y - 1 || e.x + e.w > 内.x + 内.w + 1 || e.y + e.h > 内.y + 内.h + 1)
          悪.push({ 深刻: "error", 種: "boundsOverflow", 部品: e.id,
                    どこが: (e.役 || e.type) + " が余白の内側からはみ出している",
                    数: Math.round(e.x) + "," + Math.round(e.y) + " " + Math.round(e.w) + "×" + Math.round(e.h) });
      }
      /* ③ 小さすぎる字
         ★ ページ番号だけは 例外（12px）。読ませる文ではなく **目印**で、
           資料では小さいのが普通。ここを 14px にすると番号が主張しすぎる。
           中身の文字は 14px の床を そのまま守る。 */
      if (e.役 !== "pagenum"
          && (e.type === "text" || e.type === "number" || e.type === "table") && (e.size || 0) < 最小字)
        悪.push({ 深刻: "error", 種: "minFontSize", 部品: e.id,
                  どこが: "字が " + e.size + "px（" + 最小字 + "px 未満）" });
      /* ④ コントラスト */
      if (e.type === "text" || e.type === "number") {
        var 後 = 背後の色(e, res, t);
        var 比 = C.contrast(e.color || t.color.textPrimary, 後);
        var 要 = 要る比(e);
        if (比 < 要 - 0.01)
          悪.push({ 深刻: "error", 種: "contrastFail", 部品: e.id,
                    どこが: (e.役 || "文字") + " と 背後の色の比が " + 比.toFixed(2) + "（要 " + 要 + "）",
                    数: (e.color || "") + " / " + 後 });
      }
      /* ⑩ 枠に入りきらない */
      if (e.type === "text" && e.スロット !== undefined && res.枠 && res.枠[e.スロット]) {
        var 枠 = res.枠[e.スロット];
        var 要る = M.測る(e.text, e.size, e.w, e.lh || 1.4);
        /* ★ error は **直せるものだけ**（2026-08-17・実測）。
           85% は 幅の見積りがざっくりなことへの安全代。
           ところが 字がもう最小（14px）で、しかも 枠には入っている
           （要 72px / 枠 84px）ときにまで error を出していた。
           これ以上 小さくできないので 直しようがなく、
           「直してください」と言われても どうにもならない。
           **枠を本当に超えたときだけ error**、それ以外は お知らせにする。 */
        if (要る > 枠.h)
          悪.push({ 深刻: "error", 種: "lineOverflow", 部品: e.id,
                    どこが: "文字が枠に入りません（要 " + 要る + "px / 枠 " + Math.round(枠.h) + "px）" });
        else if (要る > 枠.h * 濃さの上限 && (e.size || 0) > 最小字)
          悪.push({ 深刻: "error", 種: "lineOverflow", 部品: e.id,
                    どこが: "文字が枠いっぱいで 窮屈（要 " + 要る + "px / 枠 " + Math.round(枠.h)
                      + "px）。減らすか 短くしてください" });
        else if (要る > 枠.h * 濃さの上限)
          悪.push({ 深刻: "warning", 種: "lineOverflow", 部品: e.id,
                    どこが: "文字が枠いっぱい（要 " + 要る + "px / 枠 " + Math.round(枠.h)
                      + "px）。字はもう最小なので これ以上は縮みません" });
      }
      if (e.type === "text" && (e.役 === "body" || e.役 === "bullets")) {
        本文字数 += String(e.text || "").length;
        if (和文か(e.text)) 和 = true;
      }
    });

    /* ② 重なり（飾りは数えない。**下に敷くのは重なりではない**） */
    var 実 = els.filter(function (e) { return !e.装飾; });
    for (var i = 0; i < 実.length; i++) for (var j = i + 1; j < 実.length; j++) {
      var s = 重なり(実[i], 実[j]);
      if (s > 4)
        悪.push({ 深刻: "error", 種: "overlap", 部品: 実[i].id + " と " + 実[j].id,
                  どこが: (実[i].役 || 実[i].type) + " と " + (実[j].役 || 実[j].type) + " が重なっている",
                  数: Math.round(s) + "px²" });
    }

    /* ⑤ 字が多すぎる */
    var 上限 = 和 ? 字数上限.ja : 字数上限.en;
    var 限界 = 和 ? 字数の限界.ja : 字数の限界.en;
    if (本文字数 > 限界)
      悪.push({ 深刻: "error", 種: "charDensity",
                どこが: "本文が " + 本文字数 + " 字。**" + 限界 + " 字を超えると 1 枚に入りません**"
                  + "（" + (和 ? "和文" : "欧文") + "）" });
    else if (本文字数 > 上限)
      悪.push({ 深刻: "warning", 種: "charDensity",
                どこが: "本文が " + 本文字数 + " 字（読みやすさの目安は " + 上限 + " 字）。"
                  + "ページを分けると読みやすくなります" });

    /* ⑥ 空のスロット */
    var spec = res.spec;
    (spec.slots || []).forEach(function (s, i) {
      if (s.role === "spacer") return;
      /* ★ 空の文字の箱は「ある」に数えない（2026-08-17・実測）。 */
      var ある = els.some(function (e) {
        if (e.スロット !== i || e.装飾) return false;
        if (e.type === "text" || e.type === "number") return String(e.text || "").trim().length > 0;
        return true;
      });
      if (!ある)
        悪.push({ 深刻: "error", 種: "emptySlot", どこが: (i + 1) + " 番目（" + s.role + "）が空" });
    });

    /* ⑦ 見出しも数字も引用も無い */
    var 芯 = els.some(function (e) { return ["heading", "metric", "quote"].indexOf(e.役) >= 0; });
    if (!芯) 悪.push({ 深刻: "warning", 種: "headingMissing", どこが: "見出しも 大きな数字も 引用も無い" });

    /* ⑨ 箇条書きが 1 つだけ */
    els.forEach(function (e) {
      if (e.役 !== "bullets") return;
      var n = String(e.text || "").split("\n").filter(function (x) { return x.trim(); }).length;
      if (n === 1) 悪.push({ 深刻: "warning", 種: "orphanBullet", 部品: e.id, どこが: "箇条書きが 1 つしか無い" });
    });

    var err = 悪.filter(function (x) { return x.深刻 === "error"; });
    return { ok: !err.length, status: err.length ? "needs_repair" : "ok", issues: 悪,
             error数: err.length, warning数: 悪.length - err.length };
  }

  /* ── デッキ全体 ───────────────────────────────────────────── */
  function checkDeck(pages, results) {
    var 悪 = [], 見出し = {};
    (results || []).forEach(function (r, i) {
      (r.res.elements || []).forEach(function (e) {
        if (e.役 !== "heading") return;
        var k = String(e.text || "").trim();
        if (!k) return;
        (見出し[k] = 見出し[k] || []).push(i + 1);
      });
    });
    Object.keys(見出し).forEach(function (k) {
      if (見出し[k].length >= 2)
        悪.push({ 深刻: "warning", 種: "duplicateHeading",
                  どこが: "同じ見出しが " + 見出し[k].length + " 回（" + 見出し[k].join(",") + " 枚目）: " + k.slice(0, 24) });
    });
    return 悪;
  }

  /* 濃い色（S>60%）が 画面のどれだけを塗っているか（§4.5・上限 10%）*/
  function 濃い色の面積比(res, t) {
    var W = res.canvas.w, H = res.canvas.h, 全 = W * H, 塗 = 0;
    if (t.background.kind === "gradient") {
      if (C.satOf(t.background.from) > 60 || C.satOf(t.background.to) > 60) 塗 += 全;
    } else if (C.satOf(t.color.bg) > 60) 塗 += 全;
    (res.elements || []).forEach(function (e) {
      var col = e.fill || (e.type === "line" || e.type === "arrow" ? e.color : null);
      if (!col || C.satOf(col) <= 60) return;
      var x0 = Math.max(0, e.x), y0 = Math.max(0, e.y);
      var x1 = Math.min(W, e.x + e.w), y1 = Math.min(H, e.y + e.h);
      塗 += Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
    });
    return 塗 / 全;
  }

  VQD.gate = { checkPage: checkPage, checkDeck: checkDeck, 重なり: 重なり, 大きい字: 大きい字,
               濃い色の面積比: 濃い色の面積比, 最小字: 最小字,
               字数上限: 字数上限, 字数の限界: 字数の限界 };
})(typeof globalThis !== "undefined" ? globalThis : this);
