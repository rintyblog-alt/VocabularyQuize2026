/* ══════════════════════════════════════════════════════════════════════
   design/render-vqslides.js — DeckIR → VocabuSlides の中身

   ★ このアプリに Google Slides は無い。行き先は
     body.slides[].elements[]（960×540 の絶対座標）。
   ★ 部品の色・書体は **全部 明示して**渡す。テーマ任せにしない。
     テーマ任せにすると、テーマを変えた瞬間に Seed の配色が壊れる。
   ★ 背景は slide.background（CSS そのまま）。ここを入れると
     テーマの飾りは出なくなる（ui-slides.js の decorHtml がそう作られている）。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQD = root.VQD || (root.VQD = {});

  function uid(p) {
    try {
      var M = root.VQ2 && root.VQ2.workplace && root.VQ2.workplace.model;
      if (M && M.uid) return M.uid(p);
    } catch (e) {}
    return p + "_" + Math.abs(Math.floor((Date.now() % 1e9) + Math.random() * 1e6)).toString(36);
  }

  /* 画面の一覧に出る「レイアウト名」。中身の作りに合わせて選ぶ。
     位置は絶対座標で持っているので、ここは **見出し代わり**でしかない。 */
  function レイアウト名(page) {
    var 役 = (page.layout.slots || []).map(function (s) { return s.role; });
    var p = page.purpose;
    if (p === "title") return "title";
    if (p === "closing" || p === "cta") return "summary";
    if (役.indexOf("chart") >= 0) return "chart";
    if (役.indexOf("quote") >= 0) return "quote";
    if (役.indexOf("metric") >= 0) return "number";
    if (役.indexOf("table") >= 0) return p === "timeline" ? "timeline" : (p === "team" ? "team" : "title_body");
    if (役.indexOf("diagram") >= 0 || 役.indexOf("steps") >= 0) return "process";
    if (役.indexOf("kpi") >= 0) return "number";
    if (役.indexOf("compare") >= 0) return "compare";
    if (役.indexOf("timeline") >= 0) return "timeline";
    if (役.indexOf("section") >= 0) return "section";
    if (page.layout.partition.direction === "horizontal") {
      if (page.layout.partition.count >= 3) return "three_col";
      if (page.layout.partition.count === 2) return "two_col";
    }
    if (p === "summary") return "summary";
    if (p === "agenda") return "section";
    return "title_body";
  }

  /* ResolvedElement → アプリの部品（鍵の名前を合わせるだけ） */
  function 部品(e, t) {
    var o = { id: uid("e"), type: e.type,
              x: Math.round(e.x), y: Math.round(e.y),
              w: Math.round(e.w), h: Math.round(e.h), z: e.z === undefined ? 1 : e.z,
              /* ★ 役目を **残す**（2026-08-17・訴え）。
                 これが無いと「3 枚目の見出しを直して」と言われても
                 どれが見出しか 分からず、id を当てずっぽうで指すしかない。 */
              役: e.役 || undefined };
    if (e.type === "text") {
      o.text = String(e.text || "");
      o.size = e.size; o.bold = !!e.bold; o.align = e.align || "left";
      o.color = e.color; o.lh = e.lh;
      o.fontStack = e.fontStack;
    } else if (e.type === "number") {
      o.text = String(e.text || ""); o.label = String(e.label || "");
      o.size = e.size; o.color = e.color; o.fontStack = e.fontStack;
    } else if (e.type === "shape") {
      o.shape = e.shape || "rect"; o.fill = e.fill;
      o.radius = e.radius >= 9999 ? 9999 : (e.radius || 0);
      if (e.opacity !== undefined) o.opacity = e.opacity;
    } else if (e.type === "line") {
      o.color = e.color; o.weight = e.weight || 2;
    } else if (e.type === "arrow") {
      o.color = e.color;
    } else if (e.type === "table") {
      o.rows = (e.rows || []).map(function (r) {
        return (Array.isArray(r) ? r : [r]).map(function (v) {
          return v === undefined || v === null ? "" : String(v); });
      });
      o.size = e.size;
      /* 表の色も 明示する（テーマの色を継がせない） */
      o.color = t.color.textPrimary;
      o.borderColor = t.color.border;
      o.headFill = t.color.accentSoft;
    } else if (e.type === "svg") {
      o.svg = e.svg;
      if (e.alt) o.alt = e.alt;
      /* 出どころは **必ず 連れて行く**（CC-BY は 作者の 表示が 条件） */
      if (e.credit) o.credit = e.credit;
    } else if (e.type === "image") {
      o.src = e.src;
      if (e.alt) o.alt = e.alt;
      o.fit = e.fit || "contain";
      if (e.credit) o.credit = e.credit;
    } else if (e.type === "chart") {
      o.chart = e.chart;
      o.palette = t.color.chart;         /* --vq-chart-1〜6 に流し込む */
      o.ink = t.color.textPrimary;
      o.bg = "transparent";
    }
    return o;
  }

  /* DeckIR → presentation の中身（そのまま session.content.content に入る形） */
  function toWorkplace(deck, opts) {
    opts = opts || {};
    var t = deck.tokens;
    var slides = (deck.pages || []).map(function (p) {
      var res = p.resolved || VQD.resolve(p, t, { w: 960, h: 540 });
      return {
        id: uid("sl"),
        layout: レイアウト名(p),
        elements: res.elements
          .slice().sort(function (a, b) { return (a.z || 0) - (b.z || 0); })
          .map(function (e) { return 部品(e, t); }),
        notes: p.notes || "",
        hidden: false,
        background: res.background,
        transition: ""
      };
    });
    return {
      schemaVersion: 1,
      content: {
        theme: opts.theme || "minimal",     /* 飾りは background があるので出ない */
        ratio: "16:9",
        slides: slides,
        transition: { type: "fade", speed: 300 },
        /* どの Seed から作ったかを残す。あとから同じ見た目を作り直せる。 */
        designSeed: t.seedKey
      }
    };
  }

  VQD.toWorkplace = toWorkplace;
  VQD.レイアウト名 = レイアウト名;
})(typeof globalThis !== "undefined" ? globalThis : this);
