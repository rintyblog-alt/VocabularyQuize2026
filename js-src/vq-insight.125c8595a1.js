
/* ══════════════════════════════════════════════════════════════════════
   Insight（学習の分析）

   ホームは「今日の学習を始める場所」。ここは「長い目で見る場所」。
   同じカードを並べない。ここでしか分からないことだけを出す。

   ・数の出どころは `VQ2.analytics` だけ。ここでは数を作らない。
   ・**分からないことは分からないと書く。** 比べる相手が無いのに 0% と出さない。
   ・記録が少ないうちは「まだ判断できません」と正直に出す。
   ・グラフだけで伝えない。必ず表と要約の文を添える。
   ・内部の ID（sub:english / summarize）は 1 つも出さない。
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  if (window.__vqInsightV2) return;
  window.__vqInsightV2 = true;

  var CSS = [
    "*{box-sizing:border-box;margin:0;padding:0;}",
    "[hidden]{display:none !important;}",
    ":host{display:block;font-family:Inter,'Hiragino Sans','Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif;color:var(--vq-text,#454151);}",
    ".wrap{max-width:calc(1180px * var(--vq-width-scale,1));margin:0 auto;padding:4px 0 40px;}",
    ".ms{font-family:'Material Symbols Rounded';font-weight:500;font-style:normal;line-height:1;display:inline-block;letter-spacing:normal;white-space:nowrap;direction:ltr;-webkit-font-feature-settings:'liga';-webkit-font-smoothing:antialiased;font-variation-settings:'FILL' 1;}",

    /* 見出し */
    ".head{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:14px;}",
    ".head h1{font-size:24px;font-weight:800;letter-spacing:-.01em;color:var(--vq-text,#2B2836);}",
    ".head p{font-size:12.5px;color:var(--vq-text-tertiary,#9994A8);margin-top:3px;font-weight:550;}",
    ".tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:16px;}",
    ".pills{display:inline-flex;background:var(--vq-surface-sunken,#EFEDF6);border-radius:calc(11px * var(--vq-r-scale,1));padding:3px;gap:2px;}",
    ".pill{height:32px;padding:0 12px;border:0;background:none;border-radius:calc(8px * var(--vq-r-scale,1));cursor:pointer;color:var(--vq-text-secondary,#686477);font-family:inherit;font-size:12.5px;font-weight:650;}",
    ".pill[aria-selected=\"true\"]{background:var(--vq-surface,#fff);color:var(--vq-accent-text,#5F579E);box-shadow:0 1px 3px rgba(0,0,0,.06);}",
    ".sel{position:relative;display:inline-flex;align-items:center;}",
    ".sel select{appearance:none;-webkit-appearance:none;height:38px;padding:0 30px 0 12px;border-radius:calc(11px * var(--vq-r-scale,1));border:1px solid var(--vq-border,#E7E4EF);background:var(--vq-surface,#fff);color:var(--vq-text,#2B2836);font-family:inherit;font-size:12.5px;font-weight:600;cursor:pointer;max-width:190px;}",
    ".sel .ms{position:absolute;right:8px;pointer-events:none;font-size:16px;color:var(--vq-text-tertiary,#9994A8);}",
    ".gbtn{height:38px;padding:0 12px;border-radius:calc(11px * var(--vq-r-scale,1));border:1px solid var(--vq-border,#E7E4EF);background:var(--vq-surface,#fff);color:var(--vq-text-secondary,#686477);font-family:inherit;font-size:12.5px;font-weight:650;cursor:pointer;display:inline-flex;align-items:center;gap:6px;}",
    ".gbtn:hover{background:var(--vq-surface-hover,#F7F5FC);}.gbtn .ms{font-size:16px;}",
    ".gbtn[aria-pressed=\"true\"]{background:var(--vq-accent-subtle,#EFEBFA);color:var(--vq-accent-text,#5F579E);border-color:var(--vq-border-focus,#C9BEEB);}",

    /* カード */
    ".card{background:var(--vq-surface,#fff);border:1px solid var(--vq-border-subtle,#ECEAF4);border-radius:calc(18px * var(--vq-r-scale,1));padding:20px;margin-bottom:16px;}",
    ".card-h{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:14px;}",

    /* ── 総合評価（2026-08-29）───────────────────────────────
       数字を いちばん 大きく。ランクは その 隣に 小さく。
       色は 点で 変えない（**色だけで 伝えない**。字が 出ている）。 */
    ".ov{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;}",
    ".ov-n{font-size:44px;font-weight:800;line-height:1;color:var(--vq-text,#2B2836);"
      + "font-variant-numeric:tabular-nums;letter-spacing:-.01em;}",
    ".ov-u{font-size:15px;font-weight:650;color:var(--vq-text-tertiary,#9994A8);}",
    ".ov-g{min-width:38px;height:38px;padding:0 10px;border-radius:999px;display:inline-flex;"
      + "align-items:center;justify-content:center;font-size:17px;font-weight:800;"
      + "background:var(--vq-accent-subtle,#EFEBFA);color:var(--vq-accent-text,#5F579E);}",
    ".ov-c{margin-top:14px;padding-top:14px;border-top:1px solid var(--vq-border-subtle,#ECEAF4);}",
    ".ov-hl{font-size:16px;font-weight:750;color:var(--vq-text,#2B2836);line-height:1.5;}",
    ".ov-ad{margin-top:6px;font-size:13px;line-height:1.8;color:var(--vq-text-secondary,#5A5568);}",
    ".ov-ad.na{color:var(--vq-text-tertiary,#9994A8);}",
    ".ov-fo{margin-top:8px;font-size:13px;color:var(--vq-text-secondary,#5A5568);}",
    ".ov-src{margin-top:8px;font-size:11px;color:var(--vq-text-tertiary,#9994A8);}",

    /* ── くわしい 数値 ─────────────────────────────────────── */
    ".mtab{display:grid;gap:0;}",
    ".mrow{display:flex;align-items:baseline;justify-content:space-between;gap:12px;"
      + "padding:9px 0;border-bottom:1px solid var(--vq-border-subtle,#ECEAF4);}",
    ".mrow:last-child{border-bottom:0;}",
    ".mk{font-size:13px;color:var(--vq-text-secondary,#5A5568);}",
    ".mh{display:block;font-size:11px;color:var(--vq-text-tertiary,#9994A8);margin-top:2px;}",
    ".mv{font-size:15px;font-weight:750;color:var(--vq-text,#2B2836);"
      + "font-variant-numeric:tabular-nums;white-space:nowrap;}",
    ".card-h h2{font-size:15px;font-weight:750;color:var(--vq-text,#2B2836);}",
    ".card-h .sub{font-size:11.5px;color:var(--vq-text-tertiary,#9994A8);margin-top:3px;font-weight:550;}",
    ".note{font-size:11.5px;color:var(--vq-text-tertiary,#9994A8);font-weight:600;}",
    ".link{border:0;background:none;color:var(--vq-accent-text,#5F579E);font-family:inherit;font-size:12.5px;font-weight:650;cursor:pointer;padding:4px 6px;border-radius:8px;}",
    ".link:hover{background:var(--vq-accent-subtle,#F2EEFB);}",
    ".none{font-size:12.5px;color:var(--vq-text-tertiary,#9994A8);line-height:1.9;}",

    /* 概要 */
    ".kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;}",
    ".kpi{background:var(--vq-surface,#fff);border:1px solid var(--vq-border-subtle,#ECEAF4);border-radius:calc(16px * var(--vq-r-scale,1));padding:15px 16px;min-width:0;}",
    ".kpi .k{font-size:11.5px;font-weight:650;color:var(--vq-text-tertiary,#9994A8);letter-spacing:.02em;}",
    ".kpi .v{display:flex;align-items:baseline;gap:3px;margin-top:6px;}",
    ".kpi .n{font-size:25px;font-weight:780;color:var(--vq-text,#2B2836);letter-spacing:-.02em;font-variant-numeric:tabular-nums;line-height:1.2;}",
    ".kpi .u{font-size:12.5px;color:var(--vq-text-tertiary,#9994A8);font-weight:600;}",
    ".kpi .d{margin-top:7px;font-size:11.5px;font-weight:650;display:flex;align-items:center;gap:4px;}",
    ".kpi .d .ms{font-size:14px;}",
    ".kpi .d.up{color:var(--vq-success-text,#3E7A56);}.kpi .d.down{color:var(--vq-danger-text,#A94A4A);}",
    ".kpi .d.flat,.kpi .d.na{color:var(--vq-text-tertiary,#9994A8);font-weight:550;}",

    /* グラフ */
    ".chart{position:relative;width:100%;}",
    ".chart svg{width:100%;height:auto;display:block;overflow:visible;}",
    ".legend{display:flex;gap:14px;flex-wrap:wrap;margin-top:10px;font-size:11.5px;color:var(--vq-text-secondary,#686477);font-weight:600;}",
    ".legend i{display:inline-block;width:18px;height:3px;border-radius:2px;vertical-align:middle;margin-right:6px;}",
    ".legend i.dash{background:repeating-linear-gradient(90deg,currentColor 0 5px,transparent 5px 9px);}",
    /* ★ 背景を var(--vq-text) にしていたため、ダークでは
       **文字色と同じ白**になり、白地に白文字で読めなかった（2026-08-15）。
       ツールチップは明暗どちらでも「黒地に白文字」で固定する。
       暗い画面でも浮いて見えるように、縁と影を付ける。 */
    ".tip{position:absolute;pointer-events:none;background:#1B1922;color:#FFFFFF;"
      + "border:1px solid rgba(255,255,255,.16);box-shadow:0 6px 18px rgba(0,0,0,.38);"
      + "font-size:11.5px;font-weight:600;padding:7px 10px;border-radius:9px;"
      + "white-space:nowrap;opacity:0;transition:opacity .12s;z-index:3;line-height:1.6;}",
    ".tip.on{opacity:1;}",
    ".tbl{width:100%;border-collapse:collapse;font-size:12.5px;}",
    ".tbl th,.tbl td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--vq-border-subtle,#F1EFF7);}",
    ".tbl th{font-size:11px;font-weight:700;color:var(--vq-text-tertiary,#9994A8);text-transform:none;}",
    ".tbl td.n{text-align:right;font-variant-numeric:tabular-nums;}",
    ".tblwrap{overflow-x:auto;-webkit-overflow-scrolling:touch;}",

    /* 行（棒つき） */
    ".row{display:flex;align-items:center;gap:12px;padding:9px 0;}",
    ".row+.row{border-top:1px solid var(--vq-border-subtle,#F4F2F9);}",
    ".row .lbl{flex:0 0 132px;font-size:13px;font-weight:600;color:var(--vq-text,#2B2836);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
    ".row .bar{flex:1 1 auto;height:8px;border-radius:999px;background:var(--vq-surface-active,#F1EEF8);overflow:hidden;min-width:40px;}",
    ".row .bar i{display:block;height:100%;border-radius:999px;background:var(--vq-accent,#756DB3);}",
    ".row .bar i.warn{background:var(--vq-warning,#E5A85F);}.row .bar i.bad{background:var(--vq-danger,#D67777);}",
    ".row .val{flex:0 0 auto;font-size:12.5px;font-weight:650;color:var(--vq-text,#2B2836);font-variant-numeric:tabular-nums;min-width:52px;text-align:right;}",
    ".row .sub{flex:0 0 auto;font-size:11px;color:var(--vq-text-tertiary,#9994A8);min-width:56px;text-align:right;}",
    ".row.click{cursor:pointer;border-radius:10px;}",
    ".row.click:hover{background:var(--vq-surface-hover,#F9F7FD);}",
    ".row .na{font-size:11.5px;color:var(--vq-text-tertiary,#B0AAC0);font-weight:550;}",

    /* 苦手 */
    ".weak{border:1px solid var(--vq-border-subtle,#ECEAF4);border-radius:calc(14px * var(--vq-r-scale,1));padding:14px 15px;}",
    ".weak+.weak{margin-top:10px;}",
    ".weak-h{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;}",
    ".weak-h .t{font-size:14px;font-weight:750;color:var(--vq-text,#2B2836);}",
    ".sev{height:20px;padding:0 8px;border-radius:999px;font-size:10.5px;font-weight:750;display:inline-flex;align-items:center;gap:3px;}",
    ".sev.high{background:var(--vq-danger-bg,#FBE7EC);color:var(--vq-danger-text,#B4485F);}",
    ".sev.medium{background:var(--vq-warning-bg,#FAF0DF);color:var(--vq-warning-text,#9C6A1B);}",
    ".sev.low{background:var(--vq-surface-sunken,#F1EFF7);color:var(--vq-text-secondary,#686477);}",
    ".kind{font-size:11px;color:var(--vq-text-tertiary,#9994A8);font-weight:600;}",
    ".why{list-style:none;display:flex;flex-direction:column;gap:5px;margin-bottom:11px;}",
    ".why li{font-size:12.5px;color:var(--vq-text-secondary,#686477);line-height:1.75;display:flex;gap:7px;}",
    ".why li .ms{font-size:15px;color:var(--vq-text-tertiary,#B0AAC0);flex:0 0 auto;margin-top:2px;}",
    ".acts{display:flex;gap:8px;flex-wrap:wrap;}",
    ".act{height:34px;padding:0 13px;border-radius:calc(10px * var(--vq-r-scale,1));border:1px solid var(--vq-border,#E1DDEE);background:var(--vq-surface,#fff);color:var(--vq-text,#2B2836);font-family:inherit;font-size:12.5px;font-weight:650;cursor:pointer;display:inline-flex;align-items:center;gap:6px;}",
    ".act:hover{background:var(--vq-surface-hover,#F7F5FC);}.act .ms{font-size:16px;}",
    ".act.primary{background:var(--vq-accent,#756DB3);color:var(--vq-accent-contrast,#fff);border-color:var(--vq-accent,#756DB3);}",
    ".act.primary:hover{filter:brightness(1.08);}",

    /* おすすめ */
    ".recs{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;}",
    ".rec{border:1px solid var(--vq-border-subtle,#ECEAF4);border-radius:calc(14px * var(--vq-r-scale,1));padding:14px;display:flex;flex-direction:column;gap:7px;}",
    ".rec .t{font-size:13.5px;font-weight:700;color:var(--vq-text,#2B2836);line-height:1.55;}",
    ".rec .r{font-size:11.5px;color:var(--vq-text-tertiary,#9994A8);line-height:1.7;flex:1 1 auto;}",

    /* Mock */
    ".mockrow{display:flex;align-items:center;gap:12px;padding:11px 0;cursor:pointer;border-radius:10px;}",
    ".mockrow+.mockrow{border-top:1px solid var(--vq-border-subtle,#F4F2F9);}",
    ".mockrow:hover{background:var(--vq-surface-hover,#F9F7FD);}",
    ".mockrow .t{flex:1 1 auto;min-width:0;font-size:13px;font-weight:600;color:var(--vq-text,#2B2836);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
    ".mockrow .d{flex:0 0 auto;font-size:11px;color:var(--vq-text-tertiary,#9994A8);}",
    ".mockrow .s{flex:0 0 auto;font-size:14px;font-weight:750;font-variant-numeric:tabular-nums;color:var(--vq-text,#2B2836);}",
    ".pend{font-size:11px;font-weight:700;color:var(--vq-warning-text,#9C6A1B);background:var(--vq-warning-bg,#FAF0DF);border-radius:999px;padding:2px 8px;}",

    /* 習慣 */
    ".heat{display:grid;grid-template-columns:repeat(24,1fr);gap:3px;}",
    ".heat i{aspect-ratio:1;border-radius:3px;background:var(--vq-surface-active,#F1EEF8);}",
    ".heatax{display:flex;justify-content:space-between;font-size:10.5px;color:var(--vq-text-tertiary,#B0AAC0);margin-top:5px;font-weight:600;}",

    /* 空 */
    ".empty{text-align:center;padding:34px 16px;}",
    ".empty .ico{width:58px;height:58px;margin:0 auto 14px;border-radius:50%;background:var(--vq-surface-sunken,#EFEDF6);display:grid;place-items:center;color:var(--vq-text-tertiary,#9994A8);}",
    ".empty .ico .ms{font-size:27px;}",
    ".empty h3{font-size:16px;font-weight:750;color:var(--vq-text,#2B2836);margin-bottom:7px;}",
    ".empty p{font-size:12.5px;color:var(--vq-text-tertiary,#9994A8);line-height:1.95;margin-bottom:16px;}",
    ".empty .acts{justify-content:center;}",
    ".hint{font-size:12px;color:var(--vq-text-tertiary,#B0AAC0);line-height:1.85;margin-top:10px;}",
    ".sk{height:14px;border-radius:7px;background:var(--vq-surface-sunken,#EFEDF6);animation:skp 1.4s ease-in-out infinite;}",
    "@keyframes skp{0%,100%{opacity:1}50%{opacity:.55}}",
    ".two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;}",
    "@media (max-width:900px){.two{grid-template-columns:1fr;}}",
    "@media (max-width:720px){",
    ".head h1{font-size:21px;}",
    ".kpis{grid-template-columns:repeat(2,1fr);gap:10px;}",
    ".kpi .n{font-size:21px;}",
    ".card{padding:16px;border-radius:calc(16px * var(--vq-r-scale,1));}",
    ".row .lbl{flex-basis:96px;font-size:12.5px;}",
    ".tools{gap:6px;}.sel select{max-width:132px;}",
    ".recs{grid-template-columns:1fr;}",
    "}",
    "@media (prefers-reduced-motion:reduce){.sk{animation:none;}.tip{transition:none;}}"
  ].join("");

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function ms(n) { return '<span class="ms" aria-hidden="true">' + esc(n) + "</span>"; }
  function num(v) { return typeof v === "number" && isFinite(v) ? v : null; }
  function fmtMin(m) {
    m = Math.max(0, Math.round(m || 0));
    if (m < 60) return { n: String(m), u: "分" };
    return { n: Math.floor(m / 60) + "時間" + (m % 60 ? " " + (m % 60) + "分" : ""), u: "" };
  }
  function fmtSec(msv) {
    if (msv == null) return null;
    var s = Math.round(msv / 1000);
    return s < 60 ? s + " 秒" : Math.floor(s / 60) + " 分 " + (s % 60) + " 秒";
  }

  var host = null, root = null, mounted = false;
  var st = {
    range: null, subject: "", mode: "", metric: "accuracy",
    compare: false, openSubject: "", showAllTypes: false, d: null, ready: false
  };

  function AN() { try { return (window.VQ2 && window.VQ2.analytics) || null; } catch (e) { return null; } }
  function LN() { try { return (window.VQ2 && window.VQ2.learning) || null; } catch (e) { return null; } }

  /* ── 置き場所 ─────────────────────────────────────────── */
  function mount() {
    var page = document.getElementById("appInsightsPage");
    if (!page || document.getElementById("vqInsight")) return;
    hideLegacy(page);
    if (!document.getElementById("vqHideInsLegacy")) {
      var g = document.createElement("style");
      g.id = "vqHideInsLegacy";
      g.textContent = "#appInsightsPage > [data-vqins-hidden]{display:none !important;}";
      document.head.appendChild(g);
    }
    host = document.createElement("div");
    host.id = "vqInsight";
    root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    var s = document.createElement("style"); s.textContent = CSS; root.appendChild(s);
    var b = document.createElement("div"); b.className = "wrap"; root.appendChild(b);
    page.appendChild(host);
    mounted = true;
    try {
      new MutationObserver(function () { hideLegacy(page); keepVisible(); }).observe(page, { childList: true });
      new MutationObserver(keepVisible).observe(host, { attributes: true, attributeFilter: ["style"] });
    } catch (e) {}
    wire();
    refresh();
  }
  function keepVisible() {
    if (!host) return;
    var d = host.style.getPropertyValue("display");
    if (d && d !== "block") host.style.setProperty("display", "block", "important");
  }
  function hideLegacy(page) {
    page = page || document.getElementById("appInsightsPage");
    if (!page) return;
    for (var i = 0; i < page.children.length; i++) {
      var ch = page.children[i];
      if (ch.id === "vqInsight") continue;
      if (ch.getAttribute("data-vqins-hidden")) continue;
      ch.setAttribute("data-vqins-hidden", "1");
      ch.style.setProperty("display", "none", "important");
    }
  }

  /* ── 取得 ─────────────────────────────────────────────── */
  var waiting = 0;
  function refresh() {
    if (!mounted) return;
    hideLegacy();
    var a = AN();
    if (!a) {
      st.ready = false;
      render();
      if (!waiting) {
        waiting = setInterval(function () {
          if (!AN()) return;
          clearInterval(waiting); waiting = 0;
          refresh();
        }, 200);
        setTimeout(function () { if (waiting) { clearInterval(waiting); waiting = 0; render(); } }, 9000);
      }
      return;
    }
    st.ready = true;
    if (st.range === null) st.range = pickRange();
    try {
      st.d = a.dashboard({ range: st.range, subject: st.subject || null, mode: st.mode || null });
    } catch (e) { st.d = null; }
    render();
  }
  /* 記録が少ない人に 30 日を出すと、ほとんど空白になる。
     少ないうちは全期間、たまってきたら 30 日を初期値にする。 */
  function pickRange() {
    var l = LN();
    if (!l) return "30d";
    try {
      var n = l.listSessions({}).length;
      return n <= 5 ? "all" : "30d";
    } catch (e) { return "30d"; }
  }

  function render() {
    if (!mounted) return;
    var box = root.querySelector(".wrap");
    box.innerHTML = headHtml() + bodyHtml();
    paintChart();
  }

  /* ── 見出しと絞り込み ─────────────────────────────────── */
  function headHtml() {
    var l = LN();
    var ranges = l ? l.RANGES : [{ id: "30d", label: "30日" }];
    var h = '<div class="head"><div><h1>Insight</h1>'
      + "<p>学習の傾向を見つけて、次に取り組む内容を決めましょう。</p></div></div>";
    if (!st.ready || !st.d) return h;

    h += '<div class="tools"><div class="pills" role="tablist" aria-label="集計する期間">';
    ranges.forEach(function (r) {
      h += '<button class="pill" role="tab" data-a="range" data-v="' + r.id + '" aria-selected="'
        + (st.range === r.id ? "true" : "false") + '">' + esc(r.label) + "</button>";
    });
    h += "</div>";

    var subs = st.d.subjects || [];
    if (subs.length > 1) {
      h += '<span class="sel"><select data-a="subject" aria-label="科目でしぼる"><option value="">すべての科目</option>';
      subs.forEach(function (s) {
        h += '<option value="' + esc(s.key) + '"' + (st.subject === s.key ? " selected" : "") + ">"
          + esc(s.label) + "</option>";
      });
      h += "</select>" + ms("expand_more") + "</span>";
    }
    var modes = st.d.modes || [];
    if (modes.length > 1) {
      h += '<span class="sel"><select data-a="mode" aria-label="解き方でしぼる"><option value="">すべての解き方</option>';
      modes.forEach(function (m) {
        h += '<option value="' + esc(m.key) + '"' + (st.mode === m.key ? " selected" : "") + ">"
          + esc(m.label) + "</option>";
      });
      h += "</select>" + ms("expand_more") + "</span>";
    }
    h += '<button class="gbtn" data-a="compare" aria-pressed="' + (st.compare ? "true" : "false") + '">'
      + ms("compare_arrows") + "前の期間とくらべる</button>";
    h += '<button class="gbtn" data-a="export">' + ms("download") + "書き出す</button>";
    return h + "</div>";
  }

  /* ── 本体 ─────────────────────────────────────────────── */
  function bodyHtml() {
    if (!st.ready) return skeletonHtml();
    var d = st.d;
    if (!d) return firstEmptyHtml();
    if (!d.hasAnyRecord) return firstEmptyHtml();
    if (!d.hasRangeRecord) return rangeEmptyHtml();

    return 評価Html()
      + overviewHtml(d)
      + trendHtml(d)
      + 細かいHtml()
      + '<div class="two">' + subjectHtml(d) + typeHtml(d) + "</div>"
      + weakHtml(d)
      + mockHtml(d)
      + '<div class="two">' + habitHtml(d) + recHtml(d) + "</div>";
  }

  function skeletonHtml() {
    var h = '<div class="kpis">';
    for (var i = 0; i < 4; i++) h += '<div class="kpi"><div class="sk" style="width:52%"></div>'
      + '<div class="sk" style="height:24px;margin-top:10px;width:64%"></div></div>';
    h += "</div>";
    h += '<div class="card"><div class="sk" style="width:34%"></div>'
      + '<div class="sk" style="height:150px;margin-top:14px;border-radius:12px"></div></div>';
    return h;
  }

  /* 何も記録が無い人。ダミーの数字は出さない。 */
  function firstEmptyHtml() {
    return '<div class="card"><div class="empty">'
      + '<div class="ico">' + ms("insights") + "</div>"
      + "<h3>Insight は、学習するほど詳しくなります</h3>"
      + "<p>プリセットか Quick Mock を 1 回終えると、<br>"
      + "正答率・学習時間・苦手な単元や問題形式がここに出ます。</p>"
      + '<div class="acts">'
      + '<button class="act primary" data-a="go-library">' + ms("library_books") + "プリセットを探す</button>"
      + '<button class="act" data-a="go-mock">' + ms("assignment") + "Quick Mock を作る</button>"
      + "</div>"
      + '<p class="hint">ここに出るもの：期間ごとの正答率の移り変わり／科目と単元ごとの成績／'
      + "問題形式ごとの得点率／苦手とその理由／試験の結果と時間配分</p>"
      + "</div></div>";
  }
  /* 記録はあるが、この期間には無い。0 件と言い切らずに、期間を変える道を出す。 */
  function rangeEmptyHtml() {
    return '<div class="card"><div class="empty">'
      + '<div class="ico">' + ms("event_busy") + "</div>"
      + "<h3>この期間の記録はありません</h3>"
      + "<p>ほかの期間には記録があります。期間を広げると出ます。</p>"
      + '<div class="acts"><button class="act primary" data-a="range" data-v="all">'
      + ms("all_inclusive") + "全期間で見る</button></div>"
      + "</div></div>";
  }

  /* ── A：概要 ─────────────────────────────────────────── */
  /* ══ 総合評価と 一言（2026-08-29・訴え）════════════════════════════
     訴え「総合評価の 欄を 入れて、一言フィードバックを 追加できたら いい。
           あとは 細かい 分析を して、それを 数値化する。毎回」

     ★ **点も 割合も 数えた もの**（VQ2.learning の metrics）。
       AI が 出した 数は 1 つも 使っていない。AI は 言葉だけ。
     ★ 一言が まだ 無い ときは **その欄を 出さない**。
       それらしい 文を こちらで 作らない。 */
  function 期間のセッション() {
    var l = LN();
    if (!l) return [];
    var f = {};
    try {
      var b = l.rangeBounds ? l.rangeBounds(st.range || "30d") : null;
      if (b && b.from) f.from = b.from;
      if (b && b.to) f.to = b.to;
    } catch (e) {}
    if (st.subject) f.subject = st.subject;
    if (st.mode) f.mode = st.mode;
    try { return l.listSessions(f) || []; } catch (e) { return []; }
  }
  function 平均(list) {
    var a = list.filter(function (x) { return typeof x === "number" && isFinite(x); });
    if (!a.length) return null;
    return a.reduce(function (x, y) { return x + y; }, 0) / a.length;
  }
  function ランク(点) {
    if (点 === null || 点 === undefined) return "";
    return 点 >= 90 ? "S" : 点 >= 75 ? "A" : 点 >= 60 ? "B" : 点 >= 45 ? "C" : "D";
  }
  function pct(v) { return (v === null || v === undefined) ? "—" : Math.round(v * 100) + "%"; }
  function 秒(v) { return (v === null || v === undefined) ? "—" : (Math.round(v * 10) / 10) + " 秒"; }

  function 評価Html() {
    var ss = 期間のセッション();
    var 指 = ss.map(function (x) { return x.metrics; }).filter(Boolean);
    if (!指.length) return "";
    var 平点 = 平均(指.map(function (m) { return m.score100; }));
    var 点 = 平点 === null ? null : Math.round(平点);
    var 直 = null;
    for (var i = 0; i < ss.length; i++) {
      if (ss[i] && ss[i].review && ss[i].review.headline) { 直 = ss[i]; break; }
    }
    var h = '<div class="card"><div class="card-h"><div>'
      + "<h2>総合評価</h2>"
      + '<div class="sub">この期間の ' + ss.length + " 回を まとめた 点です。"
      + "正しさ 70・ねばり 10・やりきり 10・落ち着き 10 で 数えています。</div>"
      + "</div></div>";
    h += '<div class="ov"><div class="ov-n">' + (点 === null ? "—" : 点)
      + '<span class="ov-u"> / 100</span></div>'
      + '<div class="ov-g" data-g="' + esc(ランク(点)) + '">' + esc(ランク(点) || "—") + "</div></div>";
    if (直) {
      var r = 直.review;
      h += '<div class="ov-c">'
        + '<div class="ov-hl">' + esc(r.headline) + "</div>"
        + '<div class="ov-ad">' + esc(r.advice) + "</div>"
        + (r.focus ? '<div class="ov-fo">つぎに やること：<b>' + esc(r.focus) + "</b></div>" : "")
        + '<div class="ov-src">' + esc(String(直.localDate || "").slice(5)) + " の「"
        + esc(直.title || "学習") + "」から</div></div>";
    } else {
      h += '<div class="ov-c"><div class="ov-ad na">'
        + "一言は、次に 解き終わった あと 裏で 作られます。"
        + "（採点できた 問題が 3 問 以上 ある 回が 対象です）</div></div>";
    }
    return h + "</div>";
  }

  /* 細かい 指標を **数値で** 並べる。分からない ものは —。 */
  function 細かいHtml() {
    var ss = 期間のセッション();
    var 指 = ss.map(function (x) { return x.metrics; }).filter(Boolean);
    if (!指.length) return "";
    var 取 = function (k) { return 平均(指.map(function (m) { return m[k]; })); };
    var 行 = [
      ["1 問あたりの 速さ（中央値）", 秒(取("medianSecPerQuestion")), "速すぎても 遅すぎても 崩れます"],
      ["時間を かけすぎた 割合", pct(取("longThinkRate")), "60 秒 より 長く かかった 問題"],
      ["3 秒 未満で 外した 割合", pct(取("fastMissRate")), "当てずっぽうの めやす"],
      ["前半の 正答率", pct(取("firstHalfAccuracy")), ""],
      ["後半の 正答率", pct(取("secondHalfAccuracy")), ""],
      ["後半 − 前半", (function () {
        var v = 取("fade");
        return v === null ? "—" : (v > 0 ? "+" : "") + Math.round(v * 100) + " ポイント";
      })(), "マイナスなら 後半で 失速しています"],
      ["答えを 変えた 割合", pct(取("changeRate")), "迷いの めやす"],
      ["飛ばした 割合", pct(取("skipRate")), ""],
      ["採点待ちの 割合", pct(取("pendingRate")), "記述の AI 採点が 済んでいない ぶん"]
    ];
    var 連正 = 平均(指.map(function (m) { return m.maxStreakCorrect; }));
    var 連誤 = 平均(指.map(function (m) { return m.maxStreakWrong; }));
    行.push(["続けて 正解できた 最長", 連正 === null ? "—" : Math.round(連正) + " 問", ""]);
    行.push(["続けて 外した 最長", 連誤 === null ? "—" : Math.round(連誤) + " 問", ""]);

    /* 弱い ところを 合算する（形式ごと） */
    var 束 = Object.create(null);
    指.forEach(function (m) {
      (m.byType || []).forEach(function (x) {
        if (!x || !x.key || x.accuracy === null || x.accuracy === undefined) return;
        var e = 束[x.key] || (束[x.key] = { n: 0, 正: 0, label: x.label || x.key });
        e.n += x.n || 0;
        e.正 += (x.accuracy || 0) * (x.n || 0);
      });
    });
    var 弱 = Object.keys(束).map(function (k) {
      return { key: k, label: 束[k].label, n: 束[k].n, acc: 束[k].n ? 束[k].正 / 束[k].n : null };
    }).filter(function (x) { return x.n >= 3 && x.acc !== null; })
      .sort(function (a, b) { return a.acc - b.acc; }).slice(0, 3);

    var h = '<div class="card"><div class="card-h"><div><h2>くわしい 数値</h2>'
      + '<div class="sub">この期間の ' + 指.length + " 回を ならした 値です。"
      + "数えられなかった ものは — と出します（0 とは 別です）。</div></div></div>"
      + '<div class="mtab">';
    行.forEach(function (r) {
      h += '<div class="mrow"><span class="mk">' + esc(r[0])
        + (r[2] ? '<span class="mh">' + esc(r[2]) + "</span>" : "") + "</span>"
        + '<span class="mv">' + esc(r[1]) + "</span></div>";
    });
    h += "</div>";
    if (弱.length) {
      h += '<div class="sub" style="margin-top:14px">とくに 落としている 形式</div><div class="mtab">';
      弱.forEach(function (x) {
        h += '<div class="mrow"><span class="mk">' + esc(x.label)
          + '<span class="mh">' + x.n + " 問</span></span>"
          + '<span class="mv">' + Math.round(x.acc * 100) + "%</span></div>";
      });
      h += "</div>";
    }
    return h + "</div>";
  }

  function overviewHtml(d) {
    var s = d.summary, c = s.current;
    var mins = fmtMin(c.minutes);
    var items = [
      { k: "学習した日数", n: String(c.studyDays), u: "日", dk: "studyDays", du: "日" },
      { k: "終えた回数", n: String(c.completedCount), u: "回", dk: "completedCount", du: "回" },
      { k: "答えた数", n: String(c.answeredCount), u: "問", dk: "answeredCount", du: "問" },
      { k: "正答率", n: c.accuracy == null ? "—" : String(c.accuracy), u: c.accuracy == null ? "" : "%",
        dk: "accuracy", du: "ポイント", na: c.accuracy == null ? "採点が済んだ問題がありません" : "" },
      { k: "学習時間", n: mins.n, u: mins.u, dk: "minutes", du: "分" },
      { k: "1 問あたり", n: c.avgResponseMs == null ? "—" : fmtSec(c.avgResponseMs), u: "",
        na: c.avgResponseMs == null ? "時間の記録がありません" : "" }
    ];
    var h = '<div class="kpis">';
    items.forEach(function (it) {
      h += '<article class="kpi"><div class="k">' + esc(it.k) + "</div>"
        + '<div class="v"><span class="n">' + esc(it.n) + "</span>"
        + (it.u ? '<span class="u">' + esc(it.u) + "</span>" : "") + "</div>"
        + deltaHtml(s, it) + "</article>";
    });
    h += "</div>";
    if (c.pendingCount) {
      h += '<div class="card" style="margin-top:16px"><div class="card-h"><div>'
        + "<h2>採点待ちが " + c.pendingCount + " 問あります</h2>"
        + '<div class="sub">記述の採点が終わるまで、その分は点数に入れていません。0 点として数えてもいません。</div>'
        + "</div></div></div>";
    }
    return h;
  }
  function deltaHtml(s, it) {
    if (it.na) return '<div class="d na">' + esc(it.na) + "</div>";
    if (!it.dk) return "";
    if (!s.hasPrevious) return '<div class="d na">' + esc(s.previousNote || "くらべる記録がありません") + "</div>";
    var v = s.delta[it.dk];
    if (v == null) return '<div class="d na">くらべられません</div>';
    var cls = v > 0 ? "up" : v < 0 ? "down" : "flat";
    var icon = v > 0 ? "trending_up" : v < 0 ? "trending_down" : "trending_flat";
    var sign = v > 0 ? "+" : "";
    return '<div class="d ' + cls + '">' + ms(icon) + "<span>" + sign + v + " " + esc(it.du || "")
      + '</span><span style="color:var(--vq-text-tertiary,#9994A8);font-weight:550">前の期間より</span></div>';
  }

  /* ── B：推移 ─────────────────────────────────────────── */
  var METRICS = [
    { id: "accuracy", label: "正答率", unit: "%" },
    { id: "answered", label: "解答数", unit: "問" },
    { id: "minutes", label: "学習時間", unit: "分" },
    { id: "score", label: "得点率", unit: "%" }
  ];
  function trendHtml(d) {
    var t = d.trend;
    var h = '<section class="card"><div class="card-h"><div><h2>学習の移り変わり</h2>'
      + '<div class="sub">' + esc(grainLabel(t.grain)) + "ごとに、いまの絞り込みで見ています。</div></div>"
      + '<div class="pills" role="tablist" aria-label="見る指標">';
    METRICS.forEach(function (m) {
      h += '<button class="pill" role="tab" data-a="metric" data-v="' + m.id + '" aria-selected="'
        + (st.metric === m.id ? "true" : "false") + '">' + esc(m.label) + "</button>";
    });
    h += "</div></div>";

    var pts = (t.points || []).filter(function (p) { return p.hasValue; });
    if (!pts.length) {
      h += '<p class="none">この期間には、まだ線を引けるだけの記録がありません。</p></section>';
      return h;
    }
    h += '<div class="chart" data-chart>' + chartSvg(t) + '<div class="tip" data-tip role="status"></div></div>';
    h += '<div class="legend"><span><i style="background:var(--vq-accent,#756DB3)"></i>'
      + esc(metricOf().label) + "</span>";
    if (st.compare) h += '<span style="color:var(--vq-text-tertiary,#9994A8)"><i class="dash"></i>前の期間</span>';
    h += "</div>";

    /* 傾向の一文。少ない点で断定しない。 */
    h += '<p class="hint">' + esc(trendSentence(t)) + "</p>";
    /* グラフだけで伝えない。同じ数字を表でも出す。 */
    h += '<details style="margin-top:10px"><summary class="link" style="cursor:pointer">数字で見る</summary>'
      + '<div class="tblwrap" style="margin-top:8px"><table class="tbl"><caption class="none" style="text-align:left;padding:4px 0">'
      + esc(metricOf().label) + 'の内訳</caption><thead><tr><th scope="col">期間</th><th scope="col" class="n">'
      + esc(metricOf().label) + '</th><th scope="col" class="n">解答</th><th scope="col" class="n">時間</th></tr></thead><tbody>';
    (t.points || []).forEach(function (p) {
      h += "<tr><td>" + esc(p.label) + '</td><td class="n">'
        + (p.hasValue ? esc(String(p.value)) + esc(metricOf().unit) : "—")
        + '</td><td class="n">' + p.answered + '</td><td class="n">' + p.minutes + " 分</td></tr>";
    });
    h += "</tbody></table></div></details>";
    return h + "</section>";
  }
  function metricOf() {
    for (var i = 0; i < METRICS.length; i++) if (METRICS[i].id === st.metric) return METRICS[i];
    return METRICS[0];
  }
  function grainLabel(g) { return g === "month" ? "月" : g === "week" ? "週" : "日"; }
  function trendSentence(t) {
    var pts = (t.points || []).filter(function (p) { return p.hasValue; });
    if (!t.enoughForTrend) {
      return "傾向を言うにはまだ点が足りません（あと " + Math.max(1, 3 - pts.length) + " 回ほど記録がたまると出ます）。";
    }
    var half = Math.floor(pts.length / 2);
    var a = avg(pts.slice(0, half)), b = avg(pts.slice(half));
    if (a == null || b == null) return "";
    var diff = Math.round((b - a) * 10) / 10;
    var u = metricOf().unit;
    if (Math.abs(diff) < (u === "%" ? 2 : 1)) return "この期間は、大きな上がり下がりはありません。";
    return diff > 0
      ? "後半のほうが " + Math.abs(diff) + u + " 高くなっています。"
      : "後半のほうが " + Math.abs(diff) + u + " 低くなっています。";
  }
  function avg(list) {
    var n = 0, s = 0;
    list.forEach(function (p) { if (p.value != null) { s += p.value; n++; } });
    return n ? s / n : null;
  }

  var CW = 680, CH = 200, PL = 40, PR = 14, PT = 14, PB = 30;
  function chartSvg(t) {
    var pts = t.points || [];
    var vals = pts.filter(function (p) { return p.hasValue; }).map(function (p) { return p.value; });
    if (!vals.length) return "";
    var max = Math.max.apply(null, vals), min = Math.min.apply(null, vals);
    if (st.metric === "accuracy" || st.metric === "score") { max = 100; min = 0; }
    else { max = Math.ceil(max * 1.15) || 1; min = 0; }
    var span = Math.max(1, max - min);
    function x(i) { return PL + (pts.length <= 1 ? (CW - PL - PR) / 2 : i * (CW - PL - PR) / (pts.length - 1)); }
    function y(v) { return PT + (CH - PT - PB) * (1 - (v - min) / span); }

    var g = "";
    for (var k = 0; k <= 4; k++) {
      var v = min + span * k / 4, yy = y(v);
      g += '<line x1="' + PL + '" y1="' + yy + '" x2="' + (CW - PR) + '" y2="' + yy
        + '" stroke="var(--vq-border-subtle,#EFEDF6)" stroke-width="1"/>'
        + '<text x="' + (PL - 8) + '" y="' + (yy + 4) + '" text-anchor="end" font-size="10" fill="var(--vq-text-tertiary,#B0AAC0)">'
        + Math.round(v) + "</text>";
    }
    var dPath = "", started = false, dots = "";
    pts.forEach(function (p, i) {
      if (!p.hasValue) { started = false; return; }
      var px = x(i), py = y(p.value);
      dPath += (started ? "L" : "M") + px.toFixed(1) + " " + py.toFixed(1) + " ";
      started = true;
      dots += '<circle cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="3.4" fill="var(--vq-accent,#756DB3)"/>';
    });
    var line = '<path d="' + dPath + '" fill="none" stroke="var(--vq-accent,#756DB3)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>';

    var xl = "";
    var step = Math.max(1, Math.ceil(pts.length / 7));
    pts.forEach(function (p, i) {
      if (i % step && i !== pts.length - 1) return;
      xl += '<text x="' + x(i).toFixed(1) + '" y="' + (CH - 8) + '" text-anchor="middle" font-size="10" fill="var(--vq-text-tertiary,#B0AAC0)">'
        + esc(p.label) + "</text>";
    });
    var hit = "";
    pts.forEach(function (p, i) {
      hit += '<rect data-i="' + i + '" x="' + (x(i) - 14) + '" y="' + PT + '" width="28" height="' + (CH - PT - PB)
        + '" fill="transparent" style="cursor:pointer"/>';
    });
    return '<svg viewBox="0 0 ' + CW + " " + CH + '" role="img" aria-label="'
      + esc(metricOf().label + "の移り変わり。数字は下の表でも見られます。") + '">'
      + g + line + dots + xl + hit + "</svg>";
  }
  function paintChart() {
    var box = root && root.querySelector("[data-chart]");
    if (!box) return;
    var tip = box.querySelector("[data-tip]");
    var t = st.d && st.d.trend;
    if (!t || !tip) return;
    function show(e) {
      var el = e.target;
      if (!el || !el.getAttribute || el.getAttribute("data-i") == null) return;
      var p = t.points[Number(el.getAttribute("data-i"))];
      if (!p) return;
      var m = metricOf();
      tip.innerHTML = "<b>" + esc(p.label) + "</b><br>" + esc(m.label) + " "
        + (p.value == null ? "—" : esc(String(p.value)) + esc(m.unit))
        + "<br>解答 " + p.answered + " 問・" + p.minutes + " 分";
      var r = box.getBoundingClientRect(), br = el.getBoundingClientRect();
      tip.style.left = Math.max(4, Math.min(r.width - 150, br.left - r.left - 60)) + "px";
      tip.style.top = "6px";
      tip.classList.add("on");
    }
    function off() { tip.classList.remove("on"); }
    box.addEventListener("mousemove", show);
    box.addEventListener("touchstart", show, { passive: true });
    box.addEventListener("mouseleave", off);
    box.addEventListener("touchend", off);
  }

  /* ── C：科目・単元 ────────────────────────────────────── */
  function subjectHtml(d) {
    var rows = (d.subjects || []).filter(function (s) { return s.answered > 0; });
    var h = '<section class="card"><div class="card-h"><div><h2>科目ごと</h2>'
      + '<div class="sub">押すと、その科目の単元まで見られます。</div></div></div>';
    if (!rows.length) {
      return h + '<p class="none">科目の記録がまだありません。プリセットに科目を設定すると、ここに出ます。</p></section>';
    }
    rows.slice(0, 8).forEach(function (s) {
      h += barRow(s.label, s.accuracy, s.answered + " 問", s.enough, "subject", s.key, st.openSubject === s.key);
      if (st.openSubject === s.key) h += unitsHtml(s.key);
    });
    return h + "</section>";
  }
  function unitsHtml(subject) {
    var a = AN();
    var units = [];
    try { units = a.byUnit({ range: st.range, subject: subject, mode: st.mode || null }); } catch (e) {}
    units = units.filter(function (u) { return u.answered > 0; });
    if (!units.length) {
      return '<p class="none" style="padding:6px 0 10px 12px">この科目には単元の記録がありません。</p>';
    }
    var weak = units.slice().filter(function (u) { return u.accuracy != null; })
      .sort(function (x, y) { return x.accuracy - y.accuracy; });
    var h = '<div style="padding:4px 0 12px 12px;border-left:2px solid var(--vq-border-subtle,#ECEAF4);margin:2px 0 8px 6px">';
    units.slice(0, 6).forEach(function (u) {
      h += barRow(u.label, u.accuracy, u.answered + " 問", u.enough, null, null, false);
    });
    if (weak.length && weak[0].enough) {
      h += '<p class="hint" style="margin-left:2px">いちばん低いのは「' + esc(weak[0].label) + "」で "
        + weak[0].accuracy + "% です。</p>";
    }
    return h + "</div>";
  }
  function barRow(label, acc, sub, enough, act, key, open) {
    var cls = acc == null ? "" : acc < 50 ? " bad" : acc < 70 ? " warn" : "";
    var val = acc == null ? '<span class="na">—</span>' : acc + "%";
    return '<div class="row' + (act ? " click" : "") + '"'
      + (act ? ' data-a="' + act + '" data-v="' + esc(key) + '" role="button" tabindex="0" aria-expanded="' + (open ? "true" : "false") + '"' : "")
      + '><span class="lbl">' + esc(label) + "</span>"
      + '<span class="bar"><i class="' + cls.trim() + '" style="width:' + (acc == null ? 0 : acc) + '%"></i></span>'
      + '<span class="val">' + val + "</span>"
      + '<span class="sub">' + esc(sub) + "</span>"
      + (enough === false ? '<span class="sub na">まだ少ない</span>' : "")
      /* ★ expand_less は 手元の 書体に 無い（実測 264px ＝ 文字）。
         keyboard_arrow_up は 入っていて、expand_more と 同じ 形の 上向き。 */
      + (act ? ms(open ? "keyboard_arrow_up" : "expand_more") : "")
      + "</div>";
  }

  /* ── D：問題形式 ──────────────────────────────────────── */
  function typeHtml(d) {
    var rows = (d.types || []).filter(function (t) { return t.answered > 0; });
    var h = '<section class="card"><div class="card-h"><div><h2>問題の形式ごと</h2>'
      + '<div class="sub">解いた形式だけを出しています（登録されている形式を全部は並べません）。</div></div>'
      + (rows.length > 5 ? '<button class="link" data-a="alltypes">' + (st.showAllTypes ? "上位だけ" : "すべて見る") + "</button>" : "")
      + "</div>";
    if (!rows.length) return h + '<p class="none">まだ形式ごとの記録がありません。</p></section>';

    if (!st.showAllTypes) {
      var used = rows.slice(0, 5);
      used.forEach(function (t) {
        h += barRow(t.label, t.accuracy, t.answered + " 問", t.enough, null, null, false);
      });
      var judged = rows.filter(function (t) { return t.enough && t.accuracy != null; });
      if (judged.length >= 2) {
        var sorted = judged.slice().sort(function (a, b) { return a.accuracy - b.accuracy; });
        h += '<p class="hint">よくできているのは「' + esc(sorted[sorted.length - 1].label) + "」（"
          + sorted[sorted.length - 1].accuracy + "%）、いちばん低いのは「" + esc(sorted[0].label) + "」（"
          + sorted[0].accuracy + "%）です。</p>";
      }
    } else {
      h += '<div class="tblwrap"><table class="tbl"><thead><tr>'
        + '<th scope="col">形式</th><th scope="col" class="n">解答</th><th scope="col" class="n">正答率</th>'
        + '<th scope="col" class="n">得点率</th><th scope="col" class="n">平均時間</th>'
        + '<th scope="col" class="n">ヒント</th><th scope="col" class="n">飛ばし</th></tr></thead><tbody>';
      rows.forEach(function (t) {
        h += "<tr><td>" + esc(t.label) + '</td><td class="n">' + t.answered + "</td>"
          + '<td class="n">' + (t.accuracy == null ? "—" : t.accuracy + "%") + "</td>"
          + '<td class="n">' + (t.scoreRatio == null ? "—" : t.scoreRatio + "%") + "</td>"
          + '<td class="n">' + (t.avgTimeMs == null ? "—" : fmtSec(t.avgTimeMs)) + "</td>"
          + '<td class="n">' + (t.hintRate == null ? "—" : t.hintRate + "%") + "</td>"
          + '<td class="n">' + (t.skipRate == null ? "—" : t.skipRate + "%") + "</td></tr>";
      });
      h += "</tbody></table></div>";
    }
    return h + "</section>";
  }

  /* ── E：苦手 ─────────────────────────────────────────── */
  function weakHtml(d) {
    var ws = d.weakness || [];
    var h = '<section class="card"><div class="card-h"><div><h2>苦手なところ</h2>'
      + '<div class="sub">正答率だけでは決めていません。理由も一緒に出します。</div></div></div>';
    if (!ws.length) {
      var a = d.summary.current.answeredCount;
      h += '<p class="none">' + (a < 20
        ? "まだ苦手を見分けられるほど解いていません。もう少し解くと、単元や形式ごとに出ます。"
        : "この期間に、はっきりと苦手と言えるところはありませんでした。") + "</p>";
      return h + "</section>";
    }
    ws.slice(0, 4).forEach(function (w) {
      h += '<div class="weak"><div class="weak-h">'
        + '<span class="t">' + esc(w.label) + "</span>"
        + '<span class="kind">' + esc(w.kindLabel) + "</span>"
        + '<span class="sev ' + w.severity + '">' + ms(w.severity === "high" ? "priority_high" : "info")
        + (w.severity === "high" ? "苦手度 高" : w.severity === "medium" ? "苦手度 中" : "苦手度 低") + "</span>"
        + "</div><ul class=\"why\">";
      w.reasons.forEach(function (r) { h += "<li>" + ms("chevron_right") + "<span>" + esc(r) + "</span></li>"; });
      h += "</ul><div class=\"acts\">"
        + '<button class="act primary" data-a="review" data-k="' + esc(w.kind) + '" data-v="' + esc(w.key) + '">'
        + ms("replay") + "この範囲を復習する</button>"
        + '<button class="act" data-a="make" data-k="' + esc(w.kind) + '" data-v="' + esc(w.key) + '">'
        + ms("auto_awesome") + "AI で練習問題を作る</button>"
        + "</div></div>";
    });
    return h + "</section>";
  }

  /* ── F：Mock ─────────────────────────────────────────── */
  function mockHtml(d) {
    var m = d.mocks;
    var h = '<section class="card"><div class="card-h"><div><h2>試験（Quick Mock）</h2>'
      + '<div class="sub">ふだんの練習とは分けて見ています。</div></div></div>';
    if (!m.count) {
      return h + '<p class="none">この期間に受けた試験はありません。'
        + "Quick Mock で試験を作ると、得点の推移や時間配分がここに出ます。</p>"
        + '<div class="acts" style="margin-top:12px"><button class="act" data-a="go-mock">'
        + ms("assignment") + "Quick Mock を開く</button></div></section>";
    }
    h += '<div class="kpis" style="margin-bottom:14px">'
      + kpi("受けた回数", String(m.count), "回", "")
      + kpi("平均の得点率", m.avgScoreRatio == null ? "—" : String(m.avgScoreRatio), m.avgScoreRatio == null ? "" : "%",
            m.avgScoreRatio == null ? "採点が済んだ試験がありません" : "")
      + kpi("いちばん良かった", m.bestScoreRatio == null ? "—" : String(m.bestScoreRatio), m.bestScoreRatio == null ? "" : "%", "")
      + kpi("最後まで解けた割合", m.finishRate == null ? "—" : String(m.finishRate), "%", "")
      + "</div>";
    if (m.lastDelta != null) {
      h += '<p class="hint" style="margin-bottom:10px">前回とくらべて '
        + (m.lastDelta > 0 ? "+" : "") + m.lastDelta + " ポイントです。</p>";
    } else if (m.count === 1) {
      h += '<p class="hint" style="margin-bottom:10px">まだ 1 回だけなので、前回とはくらべられません。</p>';
    }
    m.rows.slice(0, 6).forEach(function (r) {
      h += '<div class="mockrow" data-a="open-result" data-v="' + esc(r.resultId || "") + '" role="button" tabindex="0">'
        + '<span class="t">' + esc(r.title) + "</span>"
        + '<span class="d">' + esc(r.localDate) + "・" + r.minutes + " 分</span>"
        + (r.pendingCount ? '<span class="pend">採点待ち ' + r.pendingCount + "</span>" : "")
        + '<span class="s">' + (r.scoreRatio == null ? "—" : r.scoreRatio + "%") + "</span>"
        + "</div>";
    });
    if (m.pendingTotal) {
      h += '<p class="hint">採点待ちが全部で ' + m.pendingTotal + " 問あります。確定すると平均も変わります。</p>";
    }
    return h + "</section>";
  }
  function kpi(k, n, u, na) {
    return '<article class="kpi"><div class="k">' + esc(k) + "</div>"
      + '<div class="v"><span class="n">' + esc(n) + "</span>"
      + (u ? '<span class="u">' + esc(u) + "</span>" : "") + "</div>"
      + (na ? '<div class="d na">' + esc(na) + "</div>" : "") + "</article>";
  }

  /* ── G：習慣 ─────────────────────────────────────────── */
  function habitHtml(d) {
    var hb = d.habits;
    var h = '<section class="card"><div class="card-h"><div><h2>学習の習慣</h2>'
      + '<div class="sub">いつ、どれくらい続けているか。</div></div></div>';
    h += '<div class="kpis" style="margin-bottom:14px">'
      + kpi("続けている日数", String(hb.streakDays), "日", "")
      + kpi("学習した日", String(hb.studyDays), "日", "")
      + kpi("1 回あたり", hb.avgSessionMinutes == null ? "—" : String(hb.avgSessionMinutes), "分", "")
      + "</div>";
    if (!hb.enough) {
      return h + '<p class="none">まだ傾向を判断するには記録が足りません。'
        + "あと " + hb.need + " 回ほど学習すると、曜日や時間帯ごとの傾向が出ます。</p></section>";
    }
    var maxMin = Math.max.apply(null, hb.byDow.map(function (b) { return b.minutes; })) || 1;
    hb.byDow.forEach(function (b) {
      h += '<div class="row"><span class="lbl">' + esc(b.label) + "曜日</span>"
        + '<span class="bar"><i style="width:' + Math.round(b.minutes / maxMin * 100) + '%"></i></span>'
        + '<span class="val">' + b.minutes + " 分</span>"
        + '<span class="sub">' + (b.accuracy == null ? "—" : b.accuracy + "%") + "</span></div>";
    });
    if (hb.bestHour) {
      h += '<p class="hint">いまのところ、' + hb.bestHour.key + " 時台の正答率がいちばん高いです（"
        + hb.bestHour.accuracy + "%）。</p>";
    }
    return h + "</section>";
  }

  /* ── H：次のおすすめ ──────────────────────────────────── */
  function recHtml(d) {
    var rs = d.recommendations || [];
    var h = '<section class="card"><div class="card-h"><div><h2>次におすすめ</h2>'
      + '<div class="sub">この期間の記録から出しています。</div></div></div>';
    if (!rs.length) {
      return h + '<p class="none">いまのところ、記録から言えるおすすめはありません。'
        + "もう少し解くと、苦手や間があいた範囲から提案します。</p></section>";
    }
    h += '<div class="recs">';
    rs.forEach(function (r) {
      h += '<article class="rec"><div class="t">' + esc(r.title) + "</div>"
        + '<div class="r">' + esc(r.reason) + "</div>"
        + '<div class="acts"><button class="act" data-a="rec" data-v="' + esc(r.id) + '">'
        + ms("play_arrow") + "はじめる</button></div></article>";
    });
    return h + "</div></section>";
  }

  /* ── 操作 ─────────────────────────────────────────────── */
  function wire() {
    root.addEventListener("click", function (e) {
      var el = e.target;
      while (el && el !== root && !(el.dataset && el.dataset.a)) el = el.parentNode;
      if (!el || el === root) return;
      act(el.dataset.a, el);
    });
    root.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var el = e.composedPath ? e.composedPath()[0] : e.target;
      while (el && el !== root && !(el.dataset && el.dataset.a)) el = el.parentNode;
      if (!el || el === root || el.tagName === "BUTTON" || el.tagName === "SELECT") return;
      e.preventDefault();
      act(el.dataset.a, el);
    });
    root.addEventListener("change", function (e) {
      var t = e.target;
      if (!t.dataset || !t.dataset.a) return;
      if (t.dataset.a === "subject") { st.subject = t.value; st.openSubject = ""; refresh(); }
      if (t.dataset.a === "mode") { st.mode = t.value; refresh(); }
    });
  }
  function act(a, el) {
    var v = el && el.dataset ? el.dataset.v : "";
    if (a === "range") { st.range = v; st.openSubject = ""; refresh(); return; }
    if (a === "metric") { st.metric = v; render(); return; }
    if (a === "compare") { st.compare = !st.compare; render(); return; }
    if (a === "alltypes") { st.showAllTypes = !st.showAllTypes; render(); return; }
    if (a === "subject") { st.openSubject = st.openSubject === v ? "" : v; render(); return; }
    if (a === "export") { exportCsv(); return; }
    if (a === "go-library") { goTab("library"); return; }
    if (a === "go-mock") { openMock(); return; }
    if (a === "open-result") { openResult(v); return; }
    if (a === "review" || a === "make" || a === "rec") { goPractice(a, el); return; }
  }
  function goTab(tab) {
    var b = document.querySelector('#appTabBar [data-app-tab="' + tab + '"]');
    if (b) b.click();
  }
  function openMock() {
    try {
      if (window.VQ2 && VQ2.open && VQ2.open.quickMock) { VQ2.open.quickMock({}); return; }
    } catch (e) {}
    goTab("library");
  }
  function openResult(id) {
    if (!id) return;
    try {
      var r = window.VQ2 && VQ2.store ? VQ2.store.results.get(id) : null;
      if (r && VQ2.resultView) { VQ2.resultView.open({ result: r }); return; }
    } catch (e) {}
  }
  /* 苦手からの導線。いまは「その範囲でプリセットを探す」ところまで繋ぐ。 */
  function goPractice(a, el) {
    var key = el && el.dataset ? (el.dataset.v || "") : "";
    if (a === "make") {
      try {
        if (window.VQ2 && VQ2.open && VQ2.open.presetStudio) {
          VQ2.open.presetStudio({ seedTopic: key });
          return;
        }
      } catch (e) {}
    }
    try { if (window.__vqPresetSearch) { window.__vqPresetSearch(key); return; } } catch (e) {}
    goTab("library");
  }
  function exportCsv() {
    var l = LN();
    if (!l) return;
    var rows = l.daily({});
    var head = ["日付", "回数", "解答数", "正答数", "採点待ち", "得点", "満点", "学習秒"];
    var lines = [head.join(",")];
    rows.forEach(function (d) {
      lines.push([d.localDate, d.sessionCount, d.answeredCount, d.correctCount,
                  d.pendingCount, d.score, d.maxScore, d.activeDurationSeconds].join(","));
    });
    var blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "vocabuquiz-insight.csv";
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 500);
  }

  /* ── タブに合わせて出し入れ ───────────────────────────── */
  function syncTab() {
    var tab = document.body.getAttribute("data-app-tab") || "";
    if (tab !== "insight" && tab !== "insights") return;
    if (!mounted) mount();
    else refresh();
  }
  function boot() {
    syncTab();
    /* ★ 昔の 回にも 指標を 入れる（2026-08-29）。答えの 記録が 残っているので
       数え直せる。**数え直すだけ**で、中身は 1 つも 変えない。 */
    try {
      var l = LN();
      if (l && l.backfillMetrics) setTimeout(function () {
        try { l.backfillMetrics(200); } catch (e) {}
      }, 1500);
    } catch (e) {}
    /* 裏で 一言が 届いたら、開いている なら 出し直す。 */
    try {
      window.addEventListener("vq-insight-review", function () {
        if (mounted) refresh();
      });
    } catch (e) {}
    try {
      new MutationObserver(syncTab).observe(document.body, { attributes: true, attributeFilter: ["data-app-tab"] });
    } catch (e) {}
    setInterval(function () {
      var tab = document.body.getAttribute("data-app-tab") || "";
      if ((tab === "insight" || tab === "insights") && mounted) refresh();
    }, 20000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else setTimeout(boot, 0);
})();
