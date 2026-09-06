
/* ══════════════════════════════════════════════════════════════════════════
   Qredit — 1 枚の画面（UI Studio 準拠 / Shadow DOM）

   何をやめたか:
     旧 Qredit は「重ねる窓」が 2 枚あった（残高 #appQreditOverlay と
     カード #appQreditCardOverlay）。窓だと
       ・戻る／再読み込み／共有で消える
       ・うしろの画面と二重にスクロールする
       ・本体の 20 万行ぶんの CSS に負けて、暗いテーマで読めなくなる（実際そうなった）
     ので、ほかの画面と同じ **タブ 1 枚**に置き直した。旧 2 枚は使わない。

   作りは vq-feed / vq-news と同じ型:
     ・器は本体側の <section class="app-tab-page" id="appQreditPage">
     ・出し入れは CSS（body[data-app-tab="qredit"]）だけ。JS では触らない
     ・トークン（--vq-*）は :root から Shadow を越えて継承されるので、
       こちらでは何もしない。ダークも同じ理由で自動で付いてくる
     ・数字と手続きは持たない。すべて window.__vqQredit（本体側の窓口）越し

   画面は 2 つの見え方を 1 枚で持つ:
     wallet … 持っている人（カード・残高・履歴・買い足し）
     issue  … まだの人（紹介 → 本人確認 → 認証 → 確認 → 同意 → 発行）
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  if (window.__vqQreditPageInstalled) return;
  window.__vqQreditPageInstalled = true;

  var host = null, root = null, mounted = false;
  var Q = function () { return window.__vqQredit || null; };

  /* 画面の中の位置。data は本体側にしか無いので、ここは「どこを見せるか」だけ。 */
  var st = {
    view: "auto",        /* auto | wallet | issue */
    step: "intro",       /* issue のときの段 */
    face: "front",       /* カードの表裏 */
    showCode: false,
    detail: null,        /* 履歴の 1 件（下から出す） */
    packsOpen: false,
    loadedOnce: false
  };

  /* ── 見た目 ─────────────────────────────────────────────────────────────
     Studio の部品名（.vq-card / .vq-btn / .vq-badge / .vq-stack …）をそのまま使う。
     色・角丸・影・間隔は必ずトークン。ここで生の色を書かない。 */
  var CSS = [
    "*{box-sizing:border-box;margin:0;padding:0;}",
    ":host{display:block;font-family:var(--vq-font-sans,-apple-system,'Hiragino Sans','Noto Sans JP',sans-serif);",
      "color:var(--vq-text,#454151);}",
    ".wrap{max-width:1040px;margin:0 auto;padding:var(--vq-sp-7,20px) var(--vq-sp-6,16px) var(--vq-sp-10,40px);}",
    "@media (max-width:767px){.wrap{padding:var(--vq-sp-5,12px) var(--vq-sp-5,12px) var(--vq-sp-9,32px);}}",
    ".stack{display:flex;flex-direction:column;gap:var(--vq-sp-6,16px);}",
    ".row{display:flex;align-items:center;gap:var(--vq-sp-4,8px);}",
    ".wrapline{flex-wrap:wrap;}",
    ".grow{flex:1 1 auto;min-width:0;}",
    ".num{font-variant-numeric:tabular-nums;}",
    ".sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;",
      "clip:rect(0 0 0 0);white-space:nowrap;border:0;}",

    /* 面 */
    ".card{background:var(--vq-surface,#fff);border:1px solid var(--vq-border-subtle,#EFEDF5);",
      "border-radius:var(--vq-r-lg,18px);box-shadow:var(--vq-shadow-subtle,0 1px 2px rgba(84,72,140,.05));",
      "padding:var(--vq-sp-6,16px);}",
    ".card--flush{padding:0;overflow:hidden;}",
    ".card--sunken{background:var(--vq-surface-sunken,#F7F6FB);box-shadow:none;}",
    ".h2{font:var(--vq-type-heading-sm,650 14.5px/1.5 inherit);font-size:15px;color:var(--vq-text,#454151);}",
    ".h1{font:var(--vq-type-heading-lg,700 20px/1.45 inherit);font-size:20px;color:var(--vq-text,#454151);}",
    ".sub{font-size:13px;line-height:1.75;color:var(--vq-text-secondary,#686477);}",
    ".mut{font-size:12px;line-height:1.6;color:var(--vq-text-tertiary,#9994A8);}",

    /* 残高の帯 */
    ".hero{background:linear-gradient(130deg,var(--vq-accent-subtle,#EAE8F7),transparent 70%),var(--vq-surface,#fff);",
      "border-color:color-mix(in srgb,var(--vq-accent,#756DB3) 25%,transparent);}",
    ".hero__k{font:var(--vq-type-caption,500 11.5px/1.5 inherit);font-weight:650;letter-spacing:.06em;",
      "color:var(--vq-accent-text,#5F579E);margin-bottom:4px;}",
    ".hero__v{font-size:40px;font-weight:800;letter-spacing:-.02em;line-height:1.1;}",
    ".hero__u{font-size:16px;font-weight:650;color:var(--vq-text-tertiary,#9994A8);}",
    "@media (max-width:479px){.hero__v{font-size:32px;}}",

    /* 数字を並べる */
    ".stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--vq-sp-5,12px);}",
    "@media (max-width:767px){.stats{grid-template-columns:repeat(2,minmax(0,1fr));}}",
    ".stat__k{font:var(--vq-type-caption,500 11.5px/1.5 inherit);font-weight:650;color:var(--vq-text-tertiary,#9994A8);}",
    ".stat__v{font-size:22px;font-weight:750;line-height:1.3;margin-top:2px;}",
    ".stat__u{font-size:12px;font-weight:650;color:var(--vq-text-tertiary,#9994A8);margin-left:2px;}",

    /* ボタン */
    ".btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;",
      "height:var(--vq-control-h-md,42px);padding:0 16px;border:1px solid transparent;",
      "border-radius:var(--vq-r-md,14px);font-size:14px;font-weight:650;cursor:pointer;",
      "font-family:inherit;white-space:nowrap;box-shadow:none;",
      "background:var(--vq-accent,#756DB3);color:var(--vq-accent-contrast,#fff);}",
    ".btn:hover:not(:disabled){background:var(--vq-accent-hover,#6961A8);}",
    ".btn:disabled{background:var(--vq-surface-disabled,#F4F3F9);color:var(--vq-text-disabled,#BBB7C5);cursor:not-allowed;}",
    ".btn--outline{background:var(--vq-surface,#fff);color:var(--vq-text,#454151);",
      "border-color:var(--vq-border,#E7E4EF);}",
    ".btn--outline:hover:not(:disabled){background:var(--vq-surface-hover,#F7F5FC);}",
    ".btn--ghost{background:none;color:var(--vq-text-secondary,#686477);border-color:transparent;}",
    ".btn--ghost:hover:not(:disabled){background:var(--vq-surface-hover,#F7F5FC);}",
    ".btn--lg{height:var(--vq-control-h-lg,50px);font-size:15px;padding:0 20px;}",
    ".btn--full{width:100%;}",
    ".btn--sm{height:var(--vq-control-h-sm,32px);font-size:13px;padding:0 12px;border-radius:var(--vq-r-sm,10px);}",
    ".btn:focus-visible{outline:none;box-shadow:var(--vq-focus-ring,0 0 0 3px rgba(117,109,179,.26));}",

    /* 印 */
    ".badge{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 9px;",
      "border-radius:var(--vq-r-full,999px);font-size:11.5px;font-weight:650;",
      "background:var(--vq-surface-sunken,#F7F6FB);color:var(--vq-text-secondary,#686477);}",
    ".badge--ok{background:var(--vq-success-bg,#E9F5ED);color:var(--vq-success-text,#3E7A56);}",
    ".badge--warn{background:var(--vq-warning-bg,#FFF3E5);color:var(--vq-warning-text,#925F1D);}",
    ".badge--q{background:var(--vq-accent-subtle,#EAE8F7);color:var(--vq-accent-text,#5F579E);}",
    ".badge__d{width:6px;height:6px;border-radius:999px;background:currentColor;flex:0 0 auto;}",

    /* 知らせ */
    ".alert{display:flex;gap:10px;padding:12px 14px;border-radius:var(--vq-r-md,14px);",
      "border:1px solid var(--vq-border-subtle,#EFEDF5);background:var(--vq-surface-sunken,#F7F6FB);",
      "font-size:13px;line-height:1.75;color:var(--vq-text-secondary,#686477);}",
    ".alert--bad{border-color:color-mix(in srgb,var(--vq-danger,#D67777) 45%,transparent);",
      "background:var(--vq-danger-bg,#FCEAEA);color:var(--vq-danger-text,#A94A4A);}",
    ".alert--ok{border-color:color-mix(in srgb,var(--vq-success,#70AD86) 45%,transparent);",
      "background:var(--vq-success-bg,#E9F5ED);color:var(--vq-success-text,#3E7A56);}",
    ".alert__i{flex:0 0 auto;font-weight:800;}",

    /* カード（Studio の qz-card3d 相当。ブランド要素なのでグラデ可） */
    ".stage{perspective:1100px;display:flex;justify-content:center;padding:var(--vq-sp-5,12px) 0;}",
    ".c3d{position:relative;width:min(100%,380px);aspect-ratio:1.585;transform-style:preserve-3d;",
      "transition:transform var(--vq-dur-deliberate,420ms) var(--vq-ease-spring,cubic-bezier(.32,1.25,.4,1));",
      "cursor:pointer;border-radius:18px;}",
    ".c3d.is-flipped{transform:rotateY(180deg);}",
    ".c3d__f{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;",
      "border-radius:18px;padding:18px;display:flex;flex-direction:column;overflow:hidden;",
      "background:linear-gradient(135deg,var(--vq-lav-900,#3B3567),var(--vq-lav-650,#6961A8) 60%,var(--vq-lav-800,#4D4683));",
      "color:#fff;box-shadow:var(--vq-shadow-floating,0 4px 12px rgba(84,72,140,.08),0 16px 40px rgba(84,72,140,.12));}",
    ".c3d__f--b{transform:rotateY(180deg);}",
    ".c3d__gloss{position:absolute;inset:0;pointer-events:none;border-radius:inherit;",
      "background:radial-gradient(600px circle at var(--gx,50%) var(--gy,40%),rgba(255,255,255,.28),transparent 45%);",
      "mix-blend-mode:soft-light;}",
    ".c3d__brand{font-weight:800;letter-spacing:.04em;font-size:15px;}",
    ".c3d__k{font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;opacity:.72;}",
    ".c3d__num{font-family:var(--vq-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);",
      "font-size:15px;letter-spacing:.12em;font-variant-numeric:tabular-nums;}",
    ".c3d__mag{height:38px;margin:6px -18px 12px;background:rgba(0,0,0,.42);}",
    ".c3d__foot{margin-top:auto;display:flex;align-items:flex-end;justify-content:space-between;gap:12px;}",
    "@media (prefers-reduced-motion:reduce){.c3d{transition:none;}}",

    /* 一覧 */
    ".list{display:flex;flex-direction:column;}",
    ".li{display:flex;align-items:center;gap:12px;width:100%;text-align:left;padding:12px 16px;",
      "border:0;border-top:1px solid var(--vq-border-subtle,#EFEDF5);background:none;cursor:pointer;",
      "font-family:inherit;color:inherit;box-shadow:none;border-radius:0;}",
    ".li:first-child{border-top:0;}",
    ".li:hover{background:var(--vq-surface-hover,#F7F5FC);}",
    ".li__i{width:32px;height:32px;flex:0 0 auto;border-radius:var(--vq-r-sm,10px);display:grid;place-items:center;",
      "background:var(--vq-surface-sunken,#F7F6FB);color:var(--vq-text-secondary,#686477);font-size:15px;font-weight:800;}",
    ".li__i.in{background:var(--vq-accent-subtle,#EAE8F7);color:var(--vq-accent-text,#5F579E);}",
    ".li__t{display:block;font-size:14px;font-weight:600;line-height:1.45;}",
    ".li__s{display:block;font-size:11.5px;color:var(--vq-text-tertiary,#9994A8);margin-top:1px;}",
    ".li__a{font-size:15px;font-weight:750;flex:0 0 auto;font-variant-numeric:tabular-nums;}",
    ".li__a.in{color:var(--vq-accent-text,#5F579E);}",
    ".head{display:flex;align-items:center;gap:10px;padding:16px 16px 12px;}",

    /* 空・読み込み中 */
    ".empty{text-align:center;padding:40px 16px;}",
    ".empty__i{width:52px;height:52px;margin:0 auto 12px;border-radius:999px;display:grid;place-items:center;",
      "background:var(--vq-surface-sunken,#F7F6FB);color:var(--vq-text-tertiary,#9994A8);font-size:24px;}",
    ".sk{background:linear-gradient(90deg,var(--vq-surface-active,#F1EEF8) 25%,var(--vq-surface-sunken,#F7F6FB) 50%,var(--vq-surface-active,#F1EEF8) 75%);",
      "background-size:200% 100%;animation:vqq-sh 1.6s ease-in-out infinite;border-radius:var(--vq-r-sm,10px);}",
    "@keyframes vqq-sh{0%{background-position:200% 0}100%{background-position:-200% 0}}",
    "@media (prefers-reduced-motion:reduce){.sk{animation:none;}}",

    /* 段（入力 → 認証 → 確認 → 発行） */
    ".steps{display:flex;align-items:flex-start;width:100%;max-width:420px;margin:0 auto;}",
    ".step{flex:1 1 0;min-width:0;position:relative;display:grid;justify-items:center;gap:6px;",
      "color:var(--vq-text-tertiary,#9994A8);}",
    ".step+.step::before{content:'';position:absolute;top:13px;right:calc(50% + 20px);",
      "width:calc(100% - 40px);height:2px;border-radius:999px;background:var(--vq-border,#E7E4EF);}",
    ".step.on::before,.step.done::before{background:var(--vq-accent,#756DB3);}",
    ".step__d{width:28px;height:28px;border-radius:999px;border:1.5px solid var(--vq-border-strong,#D7D2E4);",
      "background:var(--vq-surface,#fff);}",
    ".step.on{color:var(--vq-accent-text,#5F579E);}",
    ".step.on .step__d{border-color:var(--vq-accent,#756DB3);background:var(--vq-accent-subtle,#EAE8F7);",
      "box-shadow:0 0 0 4px color-mix(in srgb,var(--vq-accent,#756DB3) 14%,transparent);}",
    ".step.done{color:var(--vq-text-secondary,#686477);}",
    ".step.done .step__d{border-color:var(--vq-accent,#756DB3);background:var(--vq-accent,#756DB3);",
      "background-image:radial-gradient(circle at 50% 50%,var(--vq-accent-contrast,#fff) 0 4px,transparent 4.5px);}",
    ".step__l{font-size:11.5px;font-weight:650;white-space:nowrap;}",

    /* 入力 */
    ".field{display:grid;gap:5px;}",
    ".field__k{font-size:12px;font-weight:650;color:var(--vq-text-secondary,#686477);}",
    ".field__n{font-size:11.5px;line-height:1.6;color:var(--vq-text-tertiary,#9994A8);}",
    ".inp{width:100%;height:var(--vq-control-h-md,42px);padding:0 var(--vq-field-px,14px);",
      "border:1px solid var(--vq-border,#E7E4EF);border-radius:var(--vq-r-md,14px);",
      "background:var(--vq-surface,#fff);color:var(--vq-text,#454151);font-size:15px;font-family:inherit;}",
    ".inp::placeholder{color:var(--vq-text-tertiary,#9994A8);}",
    ".inp:focus{outline:none;border-color:var(--vq-border-focus,#756DB3);",
      "box-shadow:var(--vq-focus-ring,0 0 0 3px rgba(117,109,179,.26));}",
    ".inp--code{height:56px;text-align:center;font-size:26px;font-weight:700;",
      "letter-spacing:.42em;text-indent:.42em;font-variant-numeric:tabular-nums;}",

    /* 項目の並び */
    ".kv{display:grid;gap:8px;}",
    ".kv__i{display:grid;gap:4px;padding:11px 13px;border:1px solid var(--vq-border-subtle,#EFEDF5);",
      "border-radius:var(--vq-r-md,14px);background:var(--vq-surface-sunken,#F7F6FB);min-width:0;}",
    ".kv__k{font-size:11.5px;font-weight:650;color:var(--vq-text-tertiary,#9994A8);}",
    ".kv__v{font-size:14.5px;font-weight:600;overflow-wrap:anywhere;}",
    ".kvgrid{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));}",

    /* 規約 */
    ".terms{max-height:min(46vh,380px);overflow:auto;-webkit-overflow-scrolling:touch;padding:14px;",
      "border:1px solid var(--vq-border-subtle,#EFEDF5);border-radius:var(--vq-r-md,14px);",
      "background:var(--vq-surface-sunken,#F7F6FB);display:grid;gap:14px;}",
    ".terms h4{font-size:13.5px;font-weight:700;color:var(--vq-text,#454151);}",
    ".terms p{font-size:12.5px;line-height:1.85;color:var(--vq-text-secondary,#686477);margin-top:4px;}",

    /* 柄えらび */
    ".themes{display:grid;gap:8px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));}",
    ".theme{display:flex;align-items:center;gap:10px;padding:9px 11px;cursor:pointer;text-align:left;",
      "border:1px solid var(--vq-border-subtle,#EFEDF5);border-radius:var(--vq-r-md,14px);",
      "background:var(--vq-surface-sunken,#F7F6FB);font-family:inherit;color:inherit;box-shadow:none;}",
    ".theme.on{border-color:var(--vq-accent,#756DB3);background:var(--vq-accent-subtle,#EAE8F7);}",
    ".theme__s{width:34px;height:22px;flex:0 0 auto;border-radius:6px;border:1px solid var(--vq-border,#E7E4EF);}",
    ".theme__t{font-size:13px;font-weight:650;}",
    ".theme__n{font-size:11px;color:var(--vq-text-tertiary,#9994A8);}",

    /* パック */
    ".packs{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));}",
    ".pack{display:grid;gap:4px;padding:14px;cursor:pointer;text-align:left;font-family:inherit;color:inherit;",
      "border:1px solid var(--vq-border-subtle,#EFEDF5);border-radius:var(--vq-r-md,14px);",
      "background:var(--vq-surface,#fff);box-shadow:none;}",
    ".pack:hover{background:var(--vq-surface-hover,#F7F5FC);border-color:var(--vq-border,#E7E4EF);}",
    ".pack__q{font-size:20px;font-weight:800;font-variant-numeric:tabular-nums;}",
    ".pack__p{font-size:13px;color:var(--vq-text-secondary,#686477);}",
    ".pack__b{font-size:11.5px;color:var(--vq-accent-text,#5F579E);font-weight:650;}",

    /* 下から出す（履歴の 1 件） */
    ".sheet{position:fixed;inset:0;z-index:999200;display:flex;align-items:flex-end;justify-content:center;",
      "background:var(--vq-surface-overlay,rgba(38,34,68,.40));-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);}",
    ".sheet__c{width:min(100%,520px);background:var(--vq-surface,#fff);",
      "border-radius:var(--vq-r-2xl,28px) var(--vq-r-2xl,28px) 0 0;padding:18px 18px calc(18px + var(--vq-sab,0px));",
      "box-shadow:var(--vq-shadow-modal,0 10px 24px rgba(60,50,110,.10),0 32px 80px rgba(60,50,110,.18));",
      "display:grid;gap:12px;animation:vqq-up .22s var(--vq-ease-enter,cubic-bezier(.16,1,.3,1)) both;}",
    "@keyframes vqq-up{from{transform:translateY(14px);opacity:.6}to{transform:none;opacity:1}}",
    "@media (min-width:640px){.sheet{align-items:center;}",
      ".sheet__c{border-radius:var(--vq-r-xl,22px);padding:18px;}}",
    "@media (prefers-reduced-motion:reduce){.sheet__c{animation:none;}}"
  ].join("");

  /* ── 小さな道具 ─────────────────────────────────────────────────────── */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function n(v) { var q = Q(); return q ? q.label.number(v) : String(v); }

  /* ── 段 ─────────────────────────────────────────────────────────────── */
  var STEP_ORDER = ["intro", "identity", "code", "confirm", "terms", "done"];
  var PHASE = { identity: 1, code: 2, confirm: 3, terms: 3, done: 4 };
  function stepsHtml(step) {
    var ph = PHASE[step] || 0;
    if (!ph) return "";
    var labels = ["入力", "認証", "確認", "発行"];
    return '<div class="steps">' + labels.map(function (l, i) {
      var idx = i + 1;
      var cls = ph > idx ? "done" : (ph === idx ? "on" : "");
      var state = ph > idx ? "済み" : (ph === idx ? "いまここ" : "これから");
      return '<div class="step ' + cls + '"' + (ph === idx ? ' aria-current="step"' : "") + '>'
        + '<span class="step__d" aria-hidden="true"></span>'
        + '<span class="step__l">' + l + '<span class="sr">（' + state + "）</span></span></div>";
    }).join("") + "</div>";
  }

  /* ── カードの絵 ─────────────────────────────────────────────────────── */
  function cardHtml(d, opts) {
    opts = opts || {};
    var c = d.card;
    var name = c.displayName || d.card.userId || "学習者";
    /* カードの表に出す番号は **登録番号**。
       クレジットカード風の 16 桁を作ると、無い数字をでっち上げることになる。 */
    var num = c.registrationNumber ? ("No. " + String(c.registrationNumber)) : "No. ——————";
    var bal = opts.balance != null ? opts.balance : d.balance;
    return '<div class="stage">'
      + '<div class="c3d' + (st.face === "back" ? " is-flipped" : "") + '" data-a="flip" role="button" tabindex="0"'
      + ' aria-label="' + (st.face === "back" ? "カードの裏面。押すと表に戻ります" : "カードの表面。押すと裏を見られます") + '">'
      + '<div class="c3d__f">'
      + '<div class="c3d__gloss" aria-hidden="true"></div>'
      + '<div class="row"><span class="c3d__brand">VocabuQuiz</span><span class="grow"></span>'
      + '<span class="c3d__k">' + esc(c.rank || "Basic") + "</span></div>"
      + '<div class="c3d__foot"><div>'
      + '<div class="c3d__k">Balance</div>'
      + '<div class="num" style="font-size:26px;font-weight:800;line-height:1.15;">' + esc(n(bal)) + " Q</div>"
      + '<div class="c3d__num" style="margin-top:10px;">' + esc(num) + "</div>"
      + "</div><div style=\"text-align:right;\">"
      + '<div class="c3d__k">Card Holder</div>'
      + '<div style="font-weight:650;letter-spacing:.04em;font-size:13px;">' + esc(name) + "</div>"
      + "</div></div></div>"
      + '<div class="c3d__f c3d__f--b">'
      + '<div class="c3d__mag" aria-hidden="true"></div>'
      + '<div class="c3d__k">Secure Code</div>'
      + '<div class="c3d__num" style="margin-top:4px;font-size:18px;">'
      + esc(st.showCode ? (c.secureCodeMasked || "•••") : "•••") + "</div>"
      + '<div style="margin-top:12px;"><div class="c3d__k">有効期限</div>'
      + '<div class="c3d__num" style="font-size:13px;">'
      + esc(c.expiresAt ? (Q() ? Q().label.shortDate(c.expiresAt) : "") : "—") + "</div></div>"
      + '<p style="margin-top:auto;font-size:10.5px;line-height:1.6;opacity:.72;">'
      + "このカードは VocabuQuiz の中だけで使えます。現金には換えられません。</p>"
      + "</div></div></div>";
  }

  /* ══ 持っている人の画面 ═══════════════════════════════════════════════ */
  function walletHtml(d) {
    var s = d.stats || {};
    var h = '<div class="stack">';

    /* 残高 */
    h += '<section class="card hero">'
      + '<div class="row wrapline" style="gap:var(--vq-sp-6,16px);">'
      + '<div class="grow"><div class="hero__k">残高</div>'
      + '<div class="hero__v num">' + esc(n(d.balance)) + ' <span class="hero__u">Qredit</span></div>'
      + '<div class="mut" style="margin-top:4px;">Qredit はアプリの中のポイントです。お金ではなく、現金には換えられません。</div>'
      + "</div>"
      + '<div class="row wrapline">'
      + '<button class="btn" data-a="packs">Qredit を追加</button>'
      + '<button class="btn btn--outline" data-a="plan">プランを見る</button>'
      + "</div></div></section>";

    /* 数字 */
    h += '<section class="stats">'
      + statHtml("今日つかった", s.todaySpent, "Q")
      + statHtml("今月もらった", s.monthEarned, "Q")
      + statHtml("学習でもらった", s.studyEarned, "Q")
      + "</section>";

    /* カード */
    if (d.card.issued) {
      h += '<section class="card">'
        + '<div class="row" style="margin-bottom:4px;"><h2 class="h2">Qredit Card</h2><span class="grow"></span>'
        + '<span class="badge badge--ok"><span class="badge__d"></span>発行済み</span></div>'
        + cardHtml(d)
        + '<div class="row wrapline" style="justify-content:center;margin-top:4px;">'
        + '<button class="btn btn--outline btn--sm" data-a="flip">' + (st.face === "back" ? "表を見る" : "裏を見る") + "</button>"
        + '<button class="btn btn--outline btn--sm" data-a="code">' + (st.showCode ? "コードを隠す" : "コードを表示") + "</button>"
        + (d.card.tutorialDone ? "" : '<button class="btn btn--sm" data-a="tutorial">支払いを試す</button>')
        + "</div>"
        + '<div class="kvgrid" style="margin-top:14px;">'
        + kvHtml("カード番号", shortId(d.card.cardId))
        + kvHtml("登録番号", d.card.registrationNumber || "—")
        + kvHtml("有効期限", d.card.expiresAt ? Q().label.shortDate(d.card.expiresAt) : "—")
        + kvHtml("ランク", d.card.rank || "Basic")
        + "</div></section>";
    } else {
      h += '<section class="card">'
        + '<div class="row" style="margin-bottom:8px;"><h2 class="h2">Qredit Card</h2></div>'
        + '<p class="sub" style="margin-bottom:12px;">まだ発行していません。本人確認をすると、その場で使えるようになります。</p>'
        + '<button class="btn btn--full" data-a="issue">Qredit Card を発行する</button>'
        + "</section>";
    }

    /* パック */
    if (st.packsOpen) {
      var packs = d.packs || [];
      h += '<section class="card"><div class="row" style="margin-bottom:10px;">'
        + '<h2 class="h2">Qredit を追加</h2><span class="grow"></span>'
        + '<button class="btn btn--ghost btn--sm" data-a="packs-close">閉じる</button></div>';
      h += packs.length
        ? '<div class="packs">' + packs.map(function (p) {
          var got = Math.max(0, Number(p.grantedQredit || p.qredit || 0) || 0);
          var bonus = Math.max(0, Number(p.bonusQredit || 0) || 0);
          return '<button class="pack" data-a="buy" data-id="' + esc(p.id) + '">'
            + '<span class="pack__q num">' + esc(n(got)) + " Q</span>"
            + '<span class="pack__p">' + esc(p.priceLabel || ("¥" + n(p.priceJpy || 0))) + "</span>"
            + (bonus ? '<span class="pack__b">＋' + esc(n(bonus)) + " Q おまけ</span>" : "")
            + "</button>";
        }).join("") + "</div>"
        : '<p class="sub">いま買えるものがありません。</p>';
      h += "</section>";
    }

    /* 履歴 */
    h += '<section class="card card--flush">'
      + '<div class="head"><h2 class="h2">利用明細</h2><span class="grow"></span>'
      + '<button class="btn btn--ghost btn--sm" data-a="reload">読み直す</button></div>';
    if (!d.historyLoaded && d.historyLoading) {
      h += '<div style="padding:0 16px 16px;display:grid;gap:8px;">'
        + '<div class="sk" style="height:44px;"></div><div class="sk" style="height:44px;"></div>'
        + '<div class="sk" style="height:44px;"></div></div>';
    } else if (!d.history.length) {
      h += '<div class="empty"><div class="empty__i">—</div>'
        + '<div class="h2">まだ履歴はありません</div>'
        + '<p class="sub" style="margin-top:4px;">Qredit を使ったり、もらったりすると、ここに並びます。</p></div>';
    } else {
      h += '<div class="list">' + d.history.map(function (it, i) {
        var inn = String(it.direction || "") === "in" || Number(it.amount || 0) > 0;
        var amt = Math.abs(Number(it.amount || 0) || 0);
        return '<button class="li" data-a="detail" data-i="' + i + '">'
          + '<span class="li__i' + (inn ? " in" : "") + '" aria-hidden="true">' + (inn ? "＋" : "−") + "</span>"
          + '<span class="grow"><span class="li__t">' + esc(Q().label.reason(it)) + "</span>"
          + '<span class="li__s">' + esc(Q().label.when(it.createdAt)) + "</span></span>"
          + '<span class="li__a' + (inn ? " in" : "") + '">' + (inn ? "＋" : "−") + esc(n(amt)) + "</span>"
          + "</button>";
      }).join("") + "</div>";
    }
    h += "</section>";

    h += "</div>";
    return h;
  }
  function statHtml(k, v, u) {
    return '<div class="card"><div class="stat__k">' + esc(k) + "</div>"
      + '<div class="stat__v num">' + esc(n(v || 0)) + '<span class="stat__u">' + esc(u) + "</span></div></div>";
  }
  /* カード番号は長い（QC- のあと 60 桁以上）。そのまま出すと 4 行に折り返して
     ほかの項目と高さが揃わない。頭とお尻だけ見せて、押せば全部コピーできる。 */
  function shortId(id) {
    var s = String(id || "");
    if (!s) return "—";
    if (s.length <= 22) return s;
    return s.slice(0, 11) + "…" + s.slice(-6);
  }
  function kvHtml(k, v) {
    return '<div class="kv__i"><div class="kv__k">' + esc(k) + '</div><div class="kv__v">' + esc(v) + "</div></div>";
  }

  /* ══ 発行の流れ ═══════════════════════════════════════════════════════ */
  var TERMS = [
    ["1. どこで使えるか", "Qredit Card は VocabuQuiz の中の機能・学習支援で使えるカードです。アプリの外では使えません。", "現金化・外部への送金・ほかの人への譲渡はできません。"],
    ["2. 発行のときの情報", "カード番号・登録番号・有効期限・セキュアコードは、アプリの中で確認するためのものです。", "カードに入れる名前は、アプリの中の表示にだけ使います。学習の記録や成績が外に出ることはありません。"],
    ["3. Qredit の増減", "残高は、機能を使ったとき・もらったときに増減します。", "学習の報酬、購入、付与、消費はすべて記録され、残高が合っているかの確認に使います。"],
    ["4. 安全のために", "不正な取得・重複した支払い・書き換え・ほかの人への迷惑が確認された場合、カードの一部または全部を止めることがあります。", "明らかにおかしい使われ方を見つけたときは、残高の計算し直しや一時停止を行うことがあります。"],
    ["5. 発行のあと", "発行が終わると、アプリの中でカードと残高をいつでも確認できます。", "はじめに 1 度だけ、支払いの流れを試せます。"],
    ["6. 変わるとき", "この案内は、機能の追加や決まりの変更に合わせて更新することがあります。", "大事な変更があるときは、アプリの中でお知らせします。"]
  ];

  function issueHtml(d) {
    var v = d.verify;
    var h = '<div class="stack">';
    h += '<div class="row" style="min-height:36px;">'
      + (st.step !== "intro" && st.step !== "done"
        ? '<button class="btn btn--ghost btn--sm" data-a="back">戻る</button>' : "<span></span>")
      + '<span class="grow"></span>'
      + (d.card.issued ? '<button class="btn btn--ghost btn--sm" data-a="wallet">カードへ</button>' : "")
      + "</div>";
    var steps = stepsHtml(st.step);
    if (steps) h += '<div class="card" style="padding:16px 14px;">' + steps + "</div>";

    if (v.error) h += '<div class="alert alert--bad" role="alert"><span class="alert__i">！</span><span>' + esc(v.error) + "</span></div>";
    else if (v.notice) h += '<div class="alert" role="status"><span>' + esc(v.notice) + "</span></div>";

    if (st.step === "intro") {
      h += '<section class="card">'
        + cardHtml(d, { balance: 100 })
        + '<div style="text-align:center;margin-top:8px;">'
        + '<h1 class="h1">Qredit Card</h1>'
        + '<p class="sub" style="margin-top:4px;">VocabuQuiz の中で使える、あなた専用のカードです。</p></div>'
        + '<div class="kv" style="margin-top:14px;">'
        + pointHtml("残高がひと目で分かる")
        + pointHtml("AI やプリセット作成の支払いに使える")
        + pointHtml("カードの情報はいつでもここで見られる")
        + "</div>"
        + '<button class="btn btn--full btn--lg" style="margin-top:16px;" data-a="to-identity">はじめる</button>'
        + "</section>";
    } else if (st.step === "identity") {
      h += '<section class="card">'
        + '<h1 class="h1">本人確認</h1>'
        + '<p class="sub" style="margin:4px 0 14px;">Qredit Card はお金にかかわるので、発行の前にもう一度だけご本人か確かめます。</p>'
        + '<div class="kv">'
        + fieldHtml("userId", "ユーザーID", "text", v.userId || d.card.userId || "", "ログインに使うユーザーID", "いまログインしているアカウントと同じものを入れてください。", "username")
        + fieldHtml("email", "Google（Gmail）のメールアドレス", "email", v.email || d.card.email || "", "name@gmail.com", "登録済みのアドレスと一致している必要があります。", "email")
        + fieldHtml("password", "パスワード", "password", "", "ログインに使うパスワード", "端末には保存しません。確認のあとすぐに消えます。", "current-password")
        + fieldHtml("pin", "暗証番号", "password", "", "4 桁または 6 桁", "アプリを開くときに使う番号です。", "off")
        + "</div>"
        + '<div class="alert" style="margin-top:12px;"><span>確認できたら、6 桁の確認コードを<b>この端末の通知</b>へ送ります。通知の履歴からも見られます。</span></div>'
        + '<button class="btn btn--full btn--lg" style="margin-top:14px;" data-a="verify-start"' + (v.busy ? " disabled" : "") + ">"
        + (v.busy ? "確認しています…" : "確認コードを送る") + "</button>"
        + "</section>";
    } else if (st.step === "code") {
      h += '<section class="card">'
        + '<h1 class="h1">確認コードを入力</h1>'
        + '<p class="sub" style="margin:4px 0 14px;">通知に 6 桁の確認コードを送りました。'
        + (v.maskedEmail ? "登録メール " + esc(v.maskedEmail) + " のアカウント宛てです。" : "") + "</p>"
        + '<div class="field"><span class="field__k">確認コード（6 桁）</span>'
        + '<input class="inp inp--code" id="vqqCode" type="text" inputmode="numeric" maxlength="6"'
        + ' autocomplete="one-time-code" placeholder="000000" />'
        + '<span class="field__n">通知（ベルのマーク）から見られます。10 分で使えなくなります。</span></div>'
        + '<button class="btn btn--full btn--lg" style="margin-top:14px;" data-a="verify-confirm"' + (v.busy ? " disabled" : "") + ">"
        + (v.busy ? "確認しています…" : "確認") + "</button>"
        + '<button class="btn btn--ghost btn--full btn--sm" style="margin-top:6px;" data-a="to-identity">コードをもう一度送る</button>'
        + "</section>";
    } else if (st.step === "confirm") {
      h += '<section class="card">'
        + '<h1 class="h1">発行されるカードを確認</h1>'
        + '<p class="sub" style="margin:4px 0 8px;">押すと裏返ります。柄はここで選べます。</p>'
        + cardHtml(d, { balance: 100 })
        + '<div style="margin-top:12px;"><h2 class="h2" style="margin-bottom:6px;">カードの柄</h2>'
        + '<div class="themes">' + (d.themes || []).map(function (t) {
          return '<button class="theme' + (t.id === d.card.themeId ? " on" : "") + '" data-a="theme" data-id="' + esc(t.id) + '"'
            + ' aria-pressed="' + (t.id === d.card.themeId ? "true" : "false") + '">'
            + '<span class="theme__s" style="' + esc(t.style) + '"></span>'
            + '<span><span class="theme__t">' + esc(t.label) + "</span><br>"
            + '<span class="theme__n">' + esc(t.note) + "</span></span></button>";
        }).join("") + "</div></div>"
        + '<div class="field" style="margin-top:14px;"><span class="field__k">カードに入れる名前</span>'
        + '<input class="inp" id="vqqName" type="text" maxlength="26" value="' + esc(d.card.displayName || "") + '" placeholder="表示名" />'
        + '<span class="field__n">カードの表に出ます。</span></div>'
        + '<div class="kvgrid" style="margin-top:12px;">'
        + kvHtml("学年", d.card.grade || "一般")
        + kvHtml("ユーザーID", d.card.userId || "—")
        + kvHtml("メールアドレス", v.maskedEmail || d.card.email || "—")
        + kvHtml("はじめの残高", n(100) + " Q")
        + "</div>"
        + '<button class="btn btn--full btn--lg" style="margin-top:14px;" data-a="to-terms">この内容で進む</button>'
        + "</section>";
    } else if (st.step === "terms") {
      h += '<section class="card">'
        + '<h1 class="h1">利用規約</h1>'
        + '<p class="sub" style="margin:4px 0 12px;">最後まで読むと、発行できます。</p>'
        + '<div class="terms" id="vqqTerms">' + TERMS.map(function (t) {
          return "<div><h4>" + esc(t[0]) + "</h4>" + t.slice(1).map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("") + "</div>";
        }).join("") + "</div>"
        + '<div class="mut" id="vqqTermsNote" style="margin-top:8px;">'
        + (st.termsRead ? "内容を確認しました。" : "最後までスクロールすると同意できます。") + "</div>"
        + '<button class="btn btn--full btn--lg" style="margin-top:12px;" data-a="issue-now"'
        + ((st.termsRead && !v.busy) ? "" : " disabled") + ">"
        + (v.busy ? "発行しています…" : "同意して発行する") + "</button>"
        + "</section>";
    } else {
      h += '<section class="card" style="text-align:center;">'
        + '<div class="empty__i" style="background:var(--vq-success-bg,#E9F5ED);color:var(--vq-success-text,#3E7A56);">✓</div>'
        + '<h1 class="h1">Qredit Card を発行しました</h1>'
        + '<p class="sub" style="margin:4px 0 12px;">本人確認が終わり、あなた専用の Qredit Card が使えるようになりました。</p>'
        + cardHtml(d)
        + '<button class="btn btn--full btn--lg" style="margin-top:14px;" data-a="wallet">カードと残高を見る</button>'
        + "</section>";
    }
    h += "</div>";
    return h;
  }
  function pointHtml(t) {
    return '<div class="kv__i" style="display:flex;align-items:flex-start;gap:10px;">'
      + '<span style="flex:0 0 auto;width:18px;height:18px;margin-top:2px;border-radius:999px;display:grid;place-items:center;'
      + 'background:var(--vq-accent-subtle,#EAE8F7);color:var(--vq-accent-text,#5F579E);font-size:11px;">•</span>'
      + '<span style="font-size:13.5px;line-height:1.7;">' + esc(t) + "</span></div>";
  }
  function fieldHtml(key, label, type, val, ph, note, ac) {
    return '<label class="field"><span class="field__k">' + esc(label) + "</span>"
      + '<input class="inp" data-f="' + key + '" type="' + type + '"'
      + (type === "password" && key === "pin" ? ' inputmode="numeric" maxlength="6"' : "")
      + ' autocomplete="' + esc(ac) + '" value="' + esc(val) + '" placeholder="' + esc(ph) + '" />'
      + '<span class="field__n">' + esc(note) + "</span></label>";
  }

  /* ── 履歴の 1 件 ────────────────────────────────────────────────────── */
  function sheetHtml(d) {
    if (st.detail == null) return "";
    var it = (d.history || [])[st.detail];
    if (!it) return "";
    var inn = String(it.direction || "") === "in" || Number(it.amount || 0) > 0;
    var amt = Math.abs(Number(it.amount || 0) || 0);
    return '<div class="sheet" data-a="sheet-bg"><div class="sheet__c" role="dialog" aria-modal="true" aria-label="明細">'
      + '<div class="row"><h2 class="h2">' + esc(Q().label.reason(it)) + "</h2>"
      + '<span class="grow"></span><button class="btn btn--ghost btn--sm" data-a="sheet-x">閉じる</button></div>'
      + '<div class="row" style="justify-content:space-between;">'
      + '<span class="mut">増減</span>'
      + '<b class="num" style="font-size:22px;' + (inn ? "color:var(--vq-accent-text,#5F579E);" : "") + '">'
      + (inn ? "＋" : "−") + esc(n(amt)) + " Q</b></div>"
      + '<div class="row" style="justify-content:space-between;"><span class="mut">日時</span>'
      + "<span>" + esc(Q().label.when(it.createdAt)) + "</span></div>"
      + '<div class="row" style="justify-content:space-between;"><span class="mut">残高</span>'
      + '<span class="num">' + esc(n(it.balanceAfter || 0)) + " Q</span></div>"
      + (Q().label.detail(it) ? '<p class="sub">' + esc(Q().label.detail(it)) + "</p>" : "")
      + "</div></div>";
  }

  /* ── 描く ───────────────────────────────────────────────────────────── */
  function view(d) {
    if (st.view === "wallet") return "wallet";
    if (st.view === "issue") return "issue";
    return d.card.issued ? "wallet" : "issue";
  }
  function render() {
    if (!mounted) return;
    var q = Q();
    var w = root.querySelector(".wrap");
    if (!q) { w.innerHTML = '<div class="empty"><div class="h2">読み込んでいます…</div></div>'; return; }
    var d = q.read();
    if (!d.signedIn) {
      w.innerHTML = '<div class="stack"><section class="card empty">'
        + '<div class="empty__i">🔒</div><div class="h2">ログインが必要です</div>'
        + '<p class="sub" style="margin-top:4px;">Qredit はアカウントごとに管理しています。</p></section></div>';
      return;
    }
    w.innerHTML = (view(d) === "wallet" ? walletHtml(d) : issueHtml(d)) + sheetHtml(d);
    /* 入力欄は描き直すたびに新しくなるので、毎回つなぎ直す。 */
    bindInputs();
  }

  /* ── つなぐ ─────────────────────────────────────────────────────────── */
  function bindInputs() {
    var code = root.querySelector("#vqqCode");
    if (code) {
      code.addEventListener("input", function () { Q().setVerifyField("code", code.value); });
      code.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); act("verify-confirm"); } });
      try { code.focus({ preventScroll: true }); } catch (e) {}
    }
    var name = root.querySelector("#vqqName");
    if (name) name.addEventListener("input", function () { Q().setVerifyField("name", name.value); });
    root.querySelectorAll("input[data-f]").forEach(function (el) {
      el.addEventListener("input", function () { Q().setVerifyField(el.dataset.f, el.value); });
      el.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); act("verify-start"); } });
    });
    var terms = root.querySelector("#vqqTerms");
    if (terms) {
      var note = root.querySelector("#vqqTermsNote");
      var check = function () {
        if (terms.scrollTop + terms.clientHeight >= terms.scrollHeight - 24) {
          if (!st.termsRead) { st.termsRead = true; Q().setTermsRead(true); render(); }
        }
      };
      terms.addEventListener("scroll", check, { passive: true });
      /* 中身が短くて最初からスクロールできないときは、読んだことにする。 */
      if (terms.scrollHeight <= terms.clientHeight + 4 && !st.termsRead) {
        st.termsRead = true; Q().setTermsRead(true); if (note) render();
      }
    }
  }

  var BACK = { identity: "intro", code: "identity", confirm: "code", terms: "confirm" };
  function act(a, el) {
    var q = Q(); if (!q) return;
    if (a === "flip") { st.face = st.face === "back" ? "front" : "back"; render(); return; }
    if (a === "code") { st.showCode = !st.showCode; if (st.showCode) st.face = "back"; render(); return; }
    if (a === "issue") { st.view = "issue"; st.step = "intro"; q.clearVerifyError(); render(); return; }
    if (a === "wallet") {
      st.view = "wallet"; st.face = "front"; render();
      /* まだ一度も読めていないなら、ここで取りに行く。 */
      var dd = q.read();
      if (!dd.historyLoaded && !dd.historyLoading) q.loadHistory(false).then(sync, sync);
      return;
    }
    if (a === "back") { st.step = BACK[st.step] || "intro"; q.clearVerifyError(); render(); return; }
    if (a === "to-identity") { st.step = "identity"; q.clearVerifyError(); render(); return; }
    if (a === "to-terms") { st.step = "terms"; st.termsRead = false; q.setTermsRead(false); q.clearVerifyError(); render(); return; }
    if (a === "verify-start") { q.verifyStart().then(afterVerify, afterVerify); return; }
    if (a === "verify-confirm") { q.verifyConfirm().then(afterVerify, afterVerify); return; }
    if (a === "issue-now") { q.issue().then(afterIssue, afterIssue); return; }
    if (a === "theme") { q.setTheme(el.dataset.id); render(); return; }
    if (a === "tutorial") { q.payTutorial().then(sync, sync); return; }
    if (a === "packs") { st.packsOpen = true; render(); return; }
    if (a === "packs-close") { st.packsOpen = false; render(); return; }
    if (a === "buy") { q.purchasePack(el.dataset.id).then(sync, sync); return; }
    if (a === "plan") { q.goTab("subscription"); return; }
    if (a === "reload") { q.loadHistory(true).then(sync, sync); return; }
    if (a === "detail") { st.detail = Number(el.dataset.i); render(); return; }
    if (a === "sheet-x" || a === "sheet-bg") { st.detail = null; render(); return; }
  }
  /* 本人確認のあとは、本体が持っている段（flowStep）に合わせる。
     画面が勝手に進めると、サーバの実際の状態とずれる。 */
  function afterVerify() {
    var d = Q().read();
    var f = d.card.flowStep;
    if (f === "code") st.step = "code";
    else if (f === "preview") st.step = "confirm";
    render();
  }
  function afterIssue() {
    var q = Q();
    var d = q.read();
    if (d.card.issued) {
      st.step = "done"; st.view = "issue";
      /* 発行で 100 Q が入る。履歴は「読み込み済み」の印が立っていると
         取り直さないので、ここだけは強く取り直す（さもないと明細が空のまま）。 */
      q.loadHistory(true).then(sync, sync);
      q.refresh(true).then(sync, sync);
    }
    render();
  }
  function sync() { render(); }

  function wire() {
    root.addEventListener("click", function (e) {
      var el = e.target;
      while (el && el !== root && !(el.dataset && el.dataset.a)) el = el.parentNode;
      if (!el || el === root) return;
      /* 下から出た紙の中を押しても閉じない（背景だけで閉じる） */
      if (el.dataset.a === "sheet-bg" && e.target !== el) return;
      act(el.dataset.a, el);
    });
    root.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var el = e.target;
      if (!el || !el.dataset || el.dataset.a !== "flip") return;
      e.preventDefault(); act("flip");
    });
    /* カードの光沢を指の位置へ寄せる（動きを減らす設定のときは何もしない） */
    root.addEventListener("pointermove", function (e) {
      var c = e.target && e.target.closest ? e.target.closest(".c3d") : null;
      if (!c) return;
      try {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        var r = c.getBoundingClientRect();
        c.style.setProperty("--gx", (((e.clientX - r.left) / r.width) * 100).toFixed(1) + "%");
        c.style.setProperty("--gy", (((e.clientY - r.top) / r.height) * 100).toFixed(1) + "%");
      } catch (err) {}
    }, { passive: true });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      if (st.detail == null) return;
      if (document.body.getAttribute("data-app-tab") !== "qredit") return;
      st.detail = null; render();
    });
  }

  /* ── 立ち上げ ───────────────────────────────────────────────────────── */
  function mount() {
    var page = document.getElementById("appQreditPage");
    if (!page || document.getElementById("vqQredit")) return;
    host = document.createElement("div");
    host.id = "vqQredit";
    root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    var s = document.createElement("style"); s.textContent = CSS; root.appendChild(s);
    var b = document.createElement("div"); b.className = "wrap"; root.appendChild(b);
    page.appendChild(host);
    mounted = true;
    wire();
    render();
    /* 開いた時点のものを取りに行く。12 秒の間は本体側が取り直さない。 */
    var q = Q();
    if (q) {
      q.refresh(!st.loadedOnce).then(sync, sync);
      q.loadHistory(!st.loadedOnce).then(sync, sync);
      q.refreshCard(!st.loadedOnce).then(sync, sync);
      st.loadedOnce = true;
    }
  }

  /* 本体の _appRenderQreditAll から呼ばれる（残高が変わったら描き直す） */
  window.__vqQreditPageSync = function () { if (mounted) render(); };

  /* 外から開く入口。旧オーバーレイを呼んでいた所は、ここへ付け替える。 */
  window.__vqOpenQredit = function (mode) {
    document.body.setAttribute("data-app-tab", "qredit");
    try {
      var b = document.querySelector('#appTabBar [data-app-tab="qredit"]');
      if (b) b.click();
    } catch (e) {}
    setTimeout(function () {
      mount();
      if (mode === "issue") { st.view = "issue"; st.step = "intro"; }
      else if (mode === "wallet") { st.view = "wallet"; }
      else st.view = "auto";
      if (mode === "packs") { st.view = "wallet"; st.packsOpen = true; }
      render();
      var q = Q();
      if (q) { q.refresh(true).then(sync, sync); q.loadHistory(true).then(sync, sync); }
    }, 0);
  };

  function syncTab() {
    if (document.body.getAttribute("data-app-tab") === "qredit") mount();
  }
  function boot() {
    syncTab();
    try {
      new MutationObserver(syncTab).observe(document.body, { attributes: true, attributeFilter: ["data-app-tab"] });
    } catch (e) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
