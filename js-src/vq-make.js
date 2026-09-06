/* ══════════════════════════════════════════════════════════════════════════
   vq-make — 「作る」の入口を 1 つにする（2026-08-30）

   これまで「プリセットを作る」と「Quick Mock（試験）」は **別の巨大な画面**で、
   入口も手順も別だった（合わせて 10,751 行）。
   ここは その 2 つの 前に 立つ **1 枚**。

     開く → ┌──────────┬──────────┐
            │ プリセット │   試験    │
            │ 問題を集める│ 表紙から作る│
            └──────────┴──────────┘

   ★ **試験は 表紙から 最後まで 作らせる。**
     依頼（2026-08-30）:「試験モードの場合は必ず表紙から最後まで作らせる。
     表紙には注意事項、教科名、受験日、あとは年組氏名を入れられるところを」
     だから 試験を 選んだら、生成の前に 表紙を 必ず 通る。

   ★ ここは **薄い**。問題を作る仕事も 紙面の仕事も 一切 持たない。
     集めた表紙を持って、既存の画面へ渡すだけ。
     （中身まで 1 枚に するのは 段5。旧画面を 落とすまで 並走させる）

   ★ vq2-app（85,919 行）には 足さない。
     自分の ファイル・自分の 指紋で 出す（vq-call.js と 同じ 作法）。
     client/v2/build-v2.mjs は **走らせない**（js-src/README.md を 見ること）。
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  if (window.__vqMakeInstalled) return;
  window.__vqMakeInstalled = true;

  var doc = document;

  function esc(s) {
    return String(s === undefined || s === null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* ── 絵（線画。外から 画像を 取りに行かない）───────────────────── */
  var P = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
  var ICON = {
    cards: '<path ' + P + ' d="M4 7h9v13H4zM15 4h5v16h-5z"/><path ' + P + ' d="M6.5 11h4M6.5 14.5h4"/>',
    paper: '<path ' + P + ' d="M6 3h12v18H6z"/><path ' + P + ' d="M9 8h6M9 12h6M9 16h3"/>',
    back: '<path ' + P + ' d="M15 5l-7 7 7 7"/>',
    plus: '<path ' + P + ' d="M12 5v14M5 12h14"/>',
    x: '<path ' + P + ' d="M6 6l12 12M18 6L6 18"/>',
    camera: '<path ' + P + ' d="M4 8h3l1.5-2h7L17 8h3v11H4z"/>'
      + '<circle ' + P + ' cx="12" cy="13" r="3.2"/>',
    help: '<circle ' + P + ' cx="12" cy="12" r="9"/>'
      + '<path ' + P + ' d="M9.6 9.2a2.5 2.5 0 1 1 4 2.3c-.9.6-1.6 1-1.6 2M12 17h.01"/>'
  };
  /* ★ **その 画面の ヘルプ**（2026-09-01）。段ごとに 行き先を 変える。
     「どこかに ヘルプが ある」より「いま 見て いる 段の 説明」が 要る。 */
  var ヘルプの行き先 = {
    "選ぶ": "what-is", "表紙": "make-exam", "条件": "make-exam",
    "構成案": "exam-blueprint", "生成": "trouble-slow", "確認": "exam-detail", "紙面": "exam-paper"
  };
  function ヘルプ札() {
    var id = ヘルプの行き先[st.画面] || "what-is";
    return '<button class="ib" data-a="help" data-v="' + esc(id)
      + '" aria-label="この 画面の ヘルプ" title="この 画面の ヘルプ">' + svg("help") + "</button>";
  }
  function svg(n, cls) {
    return '<svg viewBox="0 0 24 24" class="' + (cls || "i") + '" aria-hidden="true">' + (ICON[n] || "") + "</svg>";
  }

  /* ── 見た目（UI Studio のトークンに乗る）──────────────────────── */
  var CSS = [
    "*{box-sizing:border-box;margin:0;padding:0}",
    ":host{position:fixed;inset:0;z-index:2147483100;display:none;",
      "font-family:var(--vq-app-font,Inter,'Hiragino Sans','Noto Sans JP',sans-serif);",
      "color:var(--vq-text,#2B2836)}",
    ":host([data-open='1']){display:grid;place-items:center;padding:16px}",
    "button{font:inherit;color:inherit;background:none;border:0;cursor:pointer}",
    ".i{width:22px;height:22px;flex:0 0 auto}",

    ".bd{position:absolute;inset:0;background:rgba(16,14,26,.55);",
      "-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);animation:vmBd .18s ease both}",
    "@keyframes vmBd{from{opacity:0}to{opacity:1}}",
    "@keyframes vmUp{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}",

    ".w{position:relative;width:min(680px,calc(100vw - 24px));",
      "max-height:calc(100dvh - 32px);overflow:auto;",
      "background:var(--vq-surface,#fff);border-radius:24px;",
      "border:1px solid var(--vq-border,#E7E4EF);",
      "box-shadow:0 24px 70px rgba(16,14,26,.30);",
      "padding:26px 24px calc(22px + var(--vq-sab,0px));",
      "animation:vmUp .24s cubic-bezier(.22,1,.36,1) both}",
    /* ★ 同じ 画面の 描き直しでは 出てくる 動きを やり直さない
       （2026-09-01・訴え「いちいち 更新すると 上に 戻る」）。
       毎回 跳ねる ので、それだけで「リセットされた」ように 見える。 */
    ".w.keep{animation:none}",
    "@media (prefers-reduced-motion:reduce){.bd,.w{animation:none}}",

    ".hd{display:flex;align-items:center;gap:10px}",
    ".hd .sp{flex:1 1 auto}",
    ".ttl{font-size:20px;font-weight:750;letter-spacing:.01em}",
    ".sub{margin-top:6px;font-size:13.5px;line-height:1.8;color:var(--vq-text-secondary,#6B6480)}",
    /* ★ 押すところは 44×44 より 小さくしない（指で 押せなく なる）。 */
    ".ib{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;flex:0 0 auto}",
    ".ib:hover{background:var(--vq-surface-sunken,#F4F2FB)}",

    /* 選ぶところ */
    ".pick{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:20px}",
    ".card{text-align:left;padding:20px 18px;border-radius:18px;",
      "border:1px solid var(--vq-border,#E7E4EF);background:var(--vq-surface,#fff);",
      "display:flex;flex-direction:column;gap:10px;min-height:150px}",
    ".card:hover{border-color:var(--vq-border-focus,#9A8CE0);",
      "background:var(--vq-accent-subtle,#EAE8F7)}",
    ".card .i{width:26px;height:26px;color:var(--vq-accent-text,#5F5691)}",
    ".card h3{font-size:16.5px;font-weight:750}",
    ".card p{font-size:13px;line-height:1.75;color:var(--vq-text-secondary,#6B6480)}",
    ".card .fl{margin-top:auto;font-size:12px;color:var(--vq-accent-text,#5F5691);font-weight:650}",

    /* 表紙を作るところ */
    ".form{margin-top:18px;display:grid;gap:14px}",
    ".row{display:grid;gap:6px;line-height:normal}",
    ".row.two{grid-template-columns:1fr 1fr;gap:12px}",
    ".row label{font-size:12.5px;font-weight:650;color:var(--vq-text-secondary,#6B6480)}",
    "input,textarea{width:100%;font:inherit;font-size:15px;padding:10px 12px;",
      "border:1px solid var(--vq-border,#E7E4EF);border-radius:12px;",
      "background:var(--vq-surface,#fff);color:var(--vq-text,#2B2836)}",
    "input:focus,textarea:focus{outline:2px solid var(--vq-border-focus,#9A8CE0);outline-offset:-1px}",
    "textarea{min-height:96px;line-height:1.8;resize:vertical}",
    ".hint{font-size:12px;line-height:1.7;color:var(--vq-text-secondary,#6B6480)}",
    ".chips{display:flex;flex-wrap:wrap;gap:7px}",
    ".chip{min-height:44px;padding:0 16px;border-radius:999px;font-size:13.5px;",
      "display:inline-flex;align-items:center;",
      "border:1px solid var(--vq-border,#E7E4EF);background:var(--vq-surface,#fff)}",
    ".chip[aria-pressed='true'],.chip.is-on{background:var(--vq-accent-subtle,#EAE8F7);",
      "border-color:var(--vq-border-focus,#9A8CE0);color:var(--vq-accent-text,#5F5691);font-weight:650}",

    /* 表紙の下書き */
    /* 型の 札は 2 行（名前＋目安）。 */
    ".chip small{display:block;font-size:10.5px;font-weight:400;opacity:.72;margin-top:1px}",
    ".chip:has(small){flex-direction:column;align-items:flex-start;justify-content:center;",
      "padding:6px 14px;line-height:1.35}",
    "select{width:100%;font:inherit;font-size:15px;padding:10px 12px;",
      "border:1px solid var(--vq-border,#E7E4EF);border-radius:12px;",
      "background:var(--vq-surface,#fff);color:var(--vq-text,#2B2836);min-height:44px}",
    "input[type=number]{min-height:44px}",
    ".hint b{font-weight:700;color:var(--vq-text,#2B2836)}",

    /* 資料 */
    ".files{display:grid;gap:7px}",
    ".file{display:flex;align-items:center;gap:9px;padding:9px 12px;border-radius:12px;",
      "border:1px solid var(--vq-border,#E7E4EF);background:var(--vq-surface,#fff);font-size:13px;",
      "flex-wrap:wrap}",
    /* 読み取れたか どうかを **その 場に** 出す。隠すと「入れたのに 読まれない」に なる。 */
    ".file-st{flex:1 0 100%;font-size:11.5px;line-height:1.6;color:var(--vq-text-secondary,#6B6480)}",
    ".file.is-busy{border-color:var(--vq-accent,#6C5CE7)}",
    ".file.is-busy .file-st{color:var(--vq-accent-text,#5F5691)}",
    ".file.is-bad{border-color:var(--vq-danger,#C0392B)}",
    ".file.is-bad .file-st{color:var(--vq-danger,#C0392B)}",
    ".file-n{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".file-s{flex:0 0 auto;font-size:11.5px;color:var(--vq-text-secondary,#6B6480)}",
    ".file-x{width:44px;height:44px;flex:0 0 auto;display:grid;place-items:center;border-radius:50%;margin:-8px -6px -8px 0}",
    ".file-x .i{width:16px;height:16px}",
    ".file-x:hover{background:var(--vq-surface-sunken,#F4F2FB)}",
    ".file-add{display:flex;align-items:center;justify-content:center;gap:7px;min-height:44px;",
      "border-radius:12px;border:1px dashed var(--vq-border-strong,#D7D2E4);font-size:13.5px;",
      "color:var(--vq-accent-text,#5F5691);font-weight:650}",
    ".file-add .i{width:18px;height:18px}",
    ".file-add:hover{background:var(--vq-accent-subtle,#EAE8F7)}",
    ".file-t{font-size:11.5px;color:var(--vq-text-secondary,#6B6480)}",

    ".read{margin-top:8px;padding:11px 13px;border-radius:12px;font-size:12.5px;line-height:1.8;",
      "background:var(--vq-accent-subtle,#EAE8F7);color:var(--vq-accent-text,#5F5691)}",
    ".read b{display:block;margin-bottom:3px}",
    ".read .ng{color:var(--vq-danger-text,#B23A55);margin-top:4px}",
    ".file-add[disabled]{opacity:.6;cursor:default}",

    /* 構成案・確認・紙面 */
    ".sum{display:flex;flex-wrap:wrap;gap:6px 18px;margin-top:16px;padding:12px 14px;",
      "border-radius:14px;background:var(--vq-surface-sunken,#F4F2FB);font-size:13px}",
    ".sum b{font-size:17px;font-weight:750;margin-right:2px}",
    ".secs{margin-top:14px;display:grid;gap:10px;max-height:46vh;overflow:auto}",
    ".sec{border:1px solid var(--vq-border,#E7E4EF);border-radius:14px;padding:12px 14px}",
    ".sec-h{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:14px}",
    ".sec-h span{font-size:12px;color:var(--vq-text-secondary,#6B6480)}",
    ".sec-b{margin-top:8px;display:flex;flex-wrap:wrap;gap:6px}",
    /* ★ 構成案を 直す 欄（2026-08-31）。狭い 画面では 縦に 積む。 */
    ".sec-e{margin-top:8px;display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap}",
    ".fl{display:flex;flex-direction:column;gap:4px;flex:1 1 200px;min-width:0;line-height:normal}",
    ".fl>span{font-size:11.5px;color:var(--vq-text-muted,#7A7589)}",
    ".fl-s{flex:0 0 86px}",
    ".sec-e+.fl{margin-top:8px}",
    ".in{width:100%;height:38px;padding:0 10px;font:inherit;font-size:14px;",
      "border:1px solid var(--vq-border,#D7D2E4);border-radius:10px;",
      "background:var(--vq-surface,#fff);color:inherit;min-width:0}",
    ".in:focus{outline:2px solid var(--vq-primary,#756DB3);outline-offset:1px}",
    ".tag{font-size:11.5px;padding:3px 9px;border-radius:999px;",
      "background:var(--vq-accent-subtle,#EAE8F7);color:var(--vq-accent-text,#5F5691);font-weight:650}",
    ".qs{margin-top:8px;display:grid;gap:5px}",
    ".q{display:flex;align-items:baseline;gap:8px;font-size:12.5px;line-height:1.6}",
    ".q-n{flex:0 0 auto;font-weight:700;min-width:34px}",
    ".q-t{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".q-p{flex:0 0 auto;color:var(--vq-text-secondary,#6B6480)}",
    ".warn{margin-top:12px;padding:10px 12px;border-radius:12px;font-size:13px;line-height:1.7;",
      "background:#FFF6E5;color:#8A5A00}",
    /* 進み */
    ".bar{margin-top:18px;height:8px;border-radius:999px;overflow:hidden;",
      "background:var(--vq-surface-sunken,#F4F2FB)}",
    ".bar i{display:block;height:100%;background:var(--vq-accent,#756DB3);",
      "transition:width .3s ease}",
    ".barn{margin-top:7px;font-size:12.5px;color:var(--vq-text-secondary,#6B6480)}",
    ".log{margin-top:14px;max-height:34vh;overflow:auto;display:grid;gap:4px;font-size:12.5px;line-height:1.7}",
    ".log-step,.log-note{color:var(--vq-text-secondary,#6B6480)}",
    ".log-done{color:#2FA96B;font-weight:650}",
    ".log-warn{color:#8A5A00}",
    ".log-err{color:var(--vq-danger-text,#B23A55)}",
    /* 組版の 読み込みの 帯 */
    ".tyb{height:8px;border-radius:999px;background:var(--vq-border,#E7E4EF);overflow:hidden;margin:6px 0}",
    ".tyb-i{height:100%;background:var(--vq-accent,#6C5CE7);transition:width .2s ease}",
    ".ok2{margin-top:8px;padding:10px 12px;border-radius:10px;font-size:13px;line-height:1.7;",
    "     background:var(--vq-ok-subtle,#E8F6EE);color:var(--vq-ok,#1B7F4B)}",
    /* 出す札 */
    ".outs{margin-top:16px;display:grid;gap:10px}",
    ".out{display:flex;align-items:center;gap:12px;text-align:left;padding:14px 16px;",
      "border-radius:14px;border:1px solid var(--vq-border,#E7E4EF);background:var(--vq-surface,#fff);",
      "min-height:64px}",
    ".out:hover{border-color:var(--vq-border-focus,#9A8CE0);background:var(--vq-accent-subtle,#EAE8F7)}",
    ".out .i{width:24px;height:24px;color:var(--vq-accent-text,#5F5691)}",
    ".out b{display:block;font-size:14.5px;font-weight:700}",
    ".out small{display:block;font-size:12px;color:var(--vq-text-secondary,#6B6480);margin-top:2px}",
    ".btn.dan{background:var(--vq-danger,#C0392B);border-color:var(--vq-danger,#C0392B);color:#fff}",

    ".prev{margin-top:4px;border:1px solid var(--vq-border,#E7E4EF);border-radius:14px;",
      "padding:16px 18px;background:var(--vq-surface-sunken,#F9F8FD);",
      "display:flex;flex-direction:column;gap:8px;min-height:150px}",
    ".prev .pt{text-align:center;font-size:16px;font-weight:750;line-height:1.5}",
    ".prev .ps{text-align:center;font-size:13px;color:var(--vq-text-secondary,#6B6480)}",
    ".prev .pm{display:flex;justify-content:center;gap:14px;font-size:12px;",
      "color:var(--vq-text-secondary,#6B6480);flex-wrap:wrap}",
    ".prev ol{margin:6px 0 0 18px;font-size:12px;line-height:1.8}",
    ".prev .pf{margin-top:auto;display:flex;gap:10px;flex-wrap:wrap;font-size:12px;",
      "color:var(--vq-text-secondary,#6B6480)}",
    ".prev .pf span{border-bottom:1px solid var(--vq-border-strong,#D7D2E4);min-width:52px}",

    ".err{margin-top:12px;padding:10px 12px;border-radius:12px;font-size:13px;line-height:1.7;",
      "background:var(--vq-danger-bg,#FBE9EE);color:var(--vq-danger-text,#B23A55)}",
    ".ft{display:flex;gap:9px;justify-content:flex-end;margin-top:20px;flex-wrap:wrap}",
    ".btn{height:46px;padding:0 20px;border-radius:13px;font-size:15px;font-weight:650;",
      "display:inline-flex;align-items:center;justify-content:center;gap:8px;",
      "border:1px solid var(--vq-border,#E7E4EF);background:var(--vq-surface,#fff)}",
    ".btn.pri{background:var(--vq-accent,#756DB3);border-color:var(--vq-accent,#756DB3);color:#fff}",
    ".btn[disabled]{opacity:.5;cursor:default}",

    "@media (max-width:560px){",
      ":host([data-open='1']){padding:8px}",
      ".w{width:calc(100vw - 16px);border-radius:20px;padding:20px 16px calc(16px + var(--vq-sab,0px))}",
      ".pick{grid-template-columns:1fr}",
      ".card{min-height:0}",
      ".row.two{grid-template-columns:1fr}",
    "}"
  ].join("");

  var host = null, root = null, 描けなかった = "";

  /* ══ 試験の 型（Quick Mock の KINDS と 同じ 中身）════════════════
     ★ 数字は **向こうと そろえる**。ここで 勝手な 値を 作ると、
       同じ「定期考査」を 選んでも 画面ごとに 別の 試験に なる。
     ★ 試験は 標準で 頭を使う 問題に する（2026-08-30・訴え）ので、
       どの 型でも 記述・空欄補充・資料読解 を 入れる。
       正誤は 一問一答に いちばん 寄りやすいので 既定では 外す。 */
  var 型 = [
    { id: "quiz",    label: "小テスト",   note: "15分・50点",
      apply: { durationMinutes: 15, totalPoints: 50,  sectionCount: 2, questionCount: 10 } },
    { id: "regular", label: "定期考査",   note: "50分・100点",
      apply: { durationMinutes: 50, totalPoints: 100, sectionCount: 5, questionCount: 0 } },
    { id: "trial",   label: "実力テスト", note: "80分・100点",
      apply: { durationMinutes: 80, totalPoints: 100, sectionCount: 6, questionCount: 0 } },
    { id: "custom",  label: "自分で決める", note: "細かく決める", apply: null }
  ];
  /* 出す 形式。**試験の 標準**は 考えて 書かせる ものを 入れる。 */
  var 形式 = [
    { id: "multiple_choice_single", label: "選択",       既定: true },
    { id: "fill_blank",             label: "空欄補充",   既定: true },
    { id: "short_answer",           label: "短答",       既定: true },
    { id: "long_answer",            label: "記述",       既定: true },
    { id: "source_analysis",        label: "資料読解",   既定: true },
    { id: "ordering",               label: "並べ替え",   既定: true },
    { id: "matching",               label: "組み合わせ", 既定: true },
    { id: "true_false",             label: "正誤",       既定: false },
    { id: "numeric",                label: "数値",       既定: false }
  ];
  var 難易 = [
    { id: "easy",   label: "やさしめ" },
    { id: "mixed",  label: "混ぜる" },
    { id: "hard",   label: "難しめ" }
  ];

  function 既定の条件() {
    var t = {};
    形式.forEach(function (x) { t[x.id] = x.既定; });
    return {
      kind: "regular",
      durationMinutes: 50, totalPoints: 100,
      sectionCount: 5, questionCount: 0,
      difficulty: "mixed",
      types: t,
      /* 資料問題（図・表・グラフ）。既定で 入れる。
         試験は 表や グラフを 読ませる 問題が 出る ものなので。 */
      materials: true,
      instruction: "",
      /* 資料の 渡しかた。"はやい"＝本文の 文字だけ／"そのまま"＝PDF を 読ませる。
         既定は はやい（文字が 取れている ときだけ 効く）。 */
      資料の渡し: "はやい",
      layoutMode: "current", answerSheetMode: "current"
    };
  }
  /* 紙面の 型。**実際に 組めるものだけ** 並べる（動くふりを しない）。 */
  function 紙面の型() {
    try {
      var LP = window.VQ2 && window.VQ2.layoutProfiles;
      if (!LP || !LP.visibleLayoutModes) return [{ id: "current", label: "現在の形式" }];
      return LP.visibleLayoutModes()
        .filter(function (m) { return m.ready; })
        .map(function (m) { return { id: m.id, label: m.label }; });
    } catch (e) { return [{ id: "current", label: "現在の形式" }]; }
  }
  function 解答用紙の型() {
    try {
      var LP = window.VQ2 && window.VQ2.layoutProfiles;
      var 並 = (LP && LP.ANSWER_SHEET_MODES) || null;
      if (!並) return [{ id: "current", label: "現在の形式" }];
      return 並.filter(function (m) { return m.ready; })
        .map(function (m) { return { id: m.id, label: m.label }; });
    } catch (e) { return [{ id: "current", label: "現在の形式" }]; }
  }

  function 既定の表紙() {
    return {
      examName: "", subject: "", examDate: 今日(),
      /* ★ 注意事項は **書かせない**（2026-08-30・訴え
         「注意事項は 基本的に 設定する 必要は 無いんじゃない？」）。
         中身は アプリが すでに 知っている ことで 決まる。下の 注意を書く() 参照。 */
      注意は自動: true,
      instructions: [],
      studentFields: ["年", "組", "番", "氏名"],
      sealNote: true
    };
  }

  /* ══ 注意事項は **こちらが 書く**（2026-08-30・訴え）════════════════
     訴え「注意事項は 基本的に 設定する 必要は 無いんじゃない？
           だって AI が そこも 作れば いい話なんだから。
           ユーザーには 書かせる 必要 なくね？」

     ★ 本物の 注意事項の 中身は、ほとんどが **アプリが すでに 知っている こと**。
       試験時間・満点・大問の 数・解答用紙が マークか どうか・記入する 欄。
       ここを AI に 書かせると、45 分の 試験に「試験時間は 50 分です」と
       書かれる。事実の 行は **コードが 書く**（AI に 数字を 触らせない）。
     ★ 教科ならではの 一言（数学の 分数の 書きかた・英語の 辞書 など）だけ
       AI に 足させる。作りに 行くのと **同時に** 頼むので 待ち時間は 増えない。
     ★ 言い回しは 実物（共通テスト・定期考査）に そろえる。 */
  function マーク式か(c) {
    var a = String((c && c.answerSheetMode) || "");
    var l = String((c && c.layoutMode) || "");
    return a === "mark-sheet" || a === "common-test-mark"
      || (a === "current" && /common-test/.test(l));
  }
  /* 教科ならではの 一言。**AI が 返らなかった ときの 受け皿**でもある。 */
  var 教科の一言 = [
    { 当: /数学|算数|数Ⅰ|数Ⅱ|数Ａ|数Ｂ|数学Ⅲ/, 文: [
      "計算は 問題冊子の 余白を 使いなさい。",
      "分数で 答える ときは、それ以上 約分できない 形で 答えなさい。"] },
    { 当: /英語|English|リーディング|ライティング/i, 文: [
      "辞書・電子辞書の 使用は 認めません。"] },
    { 当: /リスニング|聞き取り/, 文: [
      "音声は 2 回 流します。メモは 問題冊子に 取ってかまいません。"] },
    { 当: /国語|現代文|古典|古文|漢文/, 文: [
      "字数を 指定した 設問は、句読点も 1 字に 数えます。"] },
    { 当: /理科|物理|化学|生物|地学/, 文: [
      "計算は 問題冊子の 余白を 使いなさい。",
      "数値で 答える 設問は、指示が なければ 有効数字 2 桁で 答えなさい。"] },
    { 当: /地理|歴史|公民|日本史|世界史|政治|経済|倫理/, 文: [
      "統計・地図・資料は、問題冊子に 示した ものだけを 使いなさい。"] }
  ];
  function 教科から足す(subject) {
    var s = String(subject || "");
    if (!s) return [];
    for (var i = 0; i < 教科の一言.length; i++) {
      if (教科の一言[i].当.test(s)) return 教科の一言[i].文.slice();
    }
    return [];
  }
  /* p2（枠）が あれば 実際の 数で 書く。無ければ 条件の 数で 書く。 */
  function 注意を書く(表紙, c, p2) {
    c = c || {};
    var 分 = Number(c.durationMinutes) || 0;
    var 点 = (p2 && p2.totalPoints) || Number(c.totalPoints) || 0;
    var 大 = (p2 && p2.sections && p2.sections.length) || Number(c.sectionCount) || 0;
    var 記 = (表紙 && 表紙.studentFields) || [];
    var マ = マーク式か(c);
    var 出 = [];

    出.push("開始の 合図が あるまで、この 問題冊子を 開いては いけません。");
    if (分) 出.push("試験時間は " + 分 + " 分です。");
    if (記.length) {
      出.push("解答用紙に、" + 記.join("・") + "を "
        + (マ ? "記入し、受験番号は 該当する 数字を マークしなさい。" : "記入しなさい。"));
    }
    if (大 > 1) 出.push("問題は 第 1 問から 第 " + 大 + " 問まで あります。");
    出.push(マ
      ? "解答は、解答用紙の 解答番号に 対応する 解答欄を マークしなさい。"
      : "解答は、すべて 解答用紙の 解答欄に 記入しなさい。"
        + "問題冊子に 書いた 解答は 採点しません。");
    if (マ) {
      出.push("マークは HB の 黒鉛筆で、○の 中を 濃く 塗りつぶしなさい。");
      出.push("訂正する ときは、消しゴムで きれいに 消し、消しくずを 残しては いけません。");
    }
    if (点) 出.push("配点は 各問に 示して あります。満点は " + 点 + " 点です。");
    出.push("問題冊子の 余白は、下書きに 使って かまいません。");
    出.push("印刷が 不鮮明な ところ、ページの 抜け落ちや 順序の 乱れが あった ときは、"
      + "手を 挙げて 監督者に 知らせなさい。");
    出.push("試験終了後、問題冊子と 解答用紙は 机の 上に 置いたまま 退室しなさい。");

    /* 教科ならではの 一言。AI が 返っていれば そちらを 先に 使う。
       ★ **教科が 変わったら 使わない**（2026-08-30）。持ち越すと、
         生物で 頼んだ 一言が 数学の 表紙に 出る。 */
    var 教 = String((表紙 && 表紙.subject) || "").trim();
    var A = st.AI注意;
    var 足 = (A && A.subject === 教 && A.notes && A.notes.length) ? A.notes.slice() : 教科から足す(教);
    足.forEach(function (t) { if (出.indexOf(t) < 0) 出.push(t); });
    return 出.slice(0, 14);
  }
  function 今日() {
    try {
      var d = new Date();
      return d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日";
    } catch (e) { return ""; }
  }

  /* ── 状態 ──────────────────────────────────────────────────────── */
  var st = {
    画面: "",              /* "" | 選ぶ | 表紙 | 条件 */
    err: "",
    表紙: 既定の表紙(),
    条件: 既定の条件(),
    資料: [],              /* {name, mimeType, data(base64), size} */
    枠: null,              /* MC.plan の 結果（構成案） */
    進み: null,            /* {done,total,made,madeTotal,stage} */
    記録: [],              /* 作っている あいだの ことば */
    結果: null,            /* MR.run の 結果 */
    spec: null,            /* できあがった 試験 */
    走っている: false,
    読取中: false,
    読取り: null,
    止めたい: false,
    保存した: false,
    /* ★ 人が 直した 大問（2026-08-31・訴え「構成案を ユーザーでも 詳しく 調整」）。
       [{title, field, where, count}]。触るまでは 空（サーバに 任せる）。 */
    範囲: null,
    AI注意: null          /* 教科ならではの 一言（返って きたときだけ） */
  };

  /* ── 器 ──────────────────────────────────────────────────────── */
  function 建てる() {
    if (host) return;
    host = doc.createElement("div");
    host.id = "vqMake";
    root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    var s = doc.createElement("style"); s.textContent = CSS; root.appendChild(s);
    var box = doc.createElement("div"); box.setAttribute("data-box", ""); root.appendChild(box);
    doc.body.appendChild(host);
    つなぐ();
  }
  function 開く(画面) { 建てる(); st.画面 = 画面; host.setAttribute("data-open", "1"); 描く(); }
  function 閉じる() { st.画面 = ""; st.err = ""; if (host) host.removeAttribute("data-open"); }

  /* ── 描く ──────────────────────────────────────────────────── */
  /* ══ ★ 描き直しても **元の 場所に 戻る**（2026-09-01・訴え）════════════
     訴え「いちいち 更新すると、上に 戻ったり、設定してたのが
           リセットされちゃう。あの モーダルの とこね」

     描く() は 窓の 中身を **まるごと 作り直す**。そのため
       ・巻き（.w）が 先頭へ 戻る
       ・打っていた 欄から 指が 離れ、打った 位置も 消える
       ・出てくる ときの 動き（vmUp）が 毎回 やり直される＝跳ねて 見える
     形式の 札を 1 つ 押すだけで これが 起きるので、
     決めた ものが 消えたように 見える。

     ★ **同じ 画面の 描き直しでは 場所を 保つ。** 画面が 変わった ときは
       これまでどおり 先頭から（別の 話に 移った ので 戻す ほうが 正しい）。 */
  var 前の画面 = "";
  var 巻き = {};                    /* 画面ごとの 巻き位置を 覚える */

  function 場所を控える(box) {
    var w = box.querySelector(".w");
    if (!w) return null;
    var 控 = { w: w.scrollTop, 中: {}, 焦: null };
    /* 中に ある 巻きも 覚える（大問の 一覧・作っている 途中の 記録）。 */
    Array.prototype.forEach.call(box.querySelectorAll(".secs,.log"), function (el, i) {
      控.中[(el.className || "") + "#" + i] = el.scrollTop;
    });
    var a = null;
    try { a = root.activeElement || null; } catch (e) {}
    if (a && a.id && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName || "")) {
      控.焦 = { id: a.id, s: null, e: null };
      try { 控.焦.s = a.selectionStart; 控.焦.e = a.selectionEnd; } catch (e) {}
    }
    return 控;
  }

  function 場所を戻す(box, 控) {
    if (!控) return;
    var w = box.querySelector(".w");
    /* ★ scrollHeight を 一度 読む。読まないと 組み上がる 前に 入れる ことに なり、
       高さが 0 の まま 丸められて **やっぱり 先頭へ 戻る**。 */
    if (w && 控.w) { void w.scrollHeight; w.scrollTop = 控.w; }
    Array.prototype.forEach.call(box.querySelectorAll(".secs,.log"), function (el, i) {
      var v = 控.中[(el.className || "") + "#" + i];
      if (v) el.scrollTop = v;
    });
    if (!控.焦) return;
    var t = null;
    try { t = root.getElementById ? root.getElementById(控.焦.id) : box.querySelector("#" + 控.焦.id); } catch (e) {}
    if (!t) return;
    try { t.focus({ preventScroll: true }); } catch (e) { try { t.focus(); } catch (e2) {} }
    /* 打っていた 位置に カーソルを 戻す（先頭へ 飛ぶと 打ち直しに なる）。 */
    if (控.焦.s !== null && t.setSelectionRange) {
      try { t.setSelectionRange(控.焦.s, 控.焦.e); } catch (e) {}
    }
  }

  function 描く() {
    if (!root) return;
    var box = root.querySelector("[data-box]");
    if (!box) return;
    if (!st.画面) { box.innerHTML = ""; 前の画面 = ""; return; }
    var 同じ = (前の画面 === st.画面);
    var 控 = 同じ ? 場所を控える(box) : null;
    var h = '<div class="bd" data-a="bd"></div><div class="w' + (同じ ? " keep" : "")
      + '" role="dialog" aria-modal="true">';
    /* ★ 描けなかったら **黙って 閉じない。** 何が 起きたかを 残す。
       画面が 空に なるのが いちばん 分かりにくい 落ちかた。 */
    try {
      h += st.画面 === "選ぶ" ? 選ぶ中身()
         : st.画面 === "表紙" ? 表紙の中身()
         : st.画面 === "条件" ? 条件の中身()
         : st.画面 === "構成案" ? 構成案の中身()
         : st.画面 === "生成" ? 生成の中身()
         : st.画面 === "確認" ? 確認の中身()
         : 紙面の中身();
      描けなかった = "";
    } catch (e) {
      描けなかった = String((e && e.message) || e).slice(0, 200);
      h += '<div class="ttl">画面を 出せませんでした</div>'
        + '<div class="err">' + esc(描けなかった) + "</div>"
        + '<div class="ft"><button class="btn" data-a="close">閉じる</button></div>';
    }
    box.innerHTML = h + "</div>";
    前の画面 = st.画面;
    if (同じ) 場所を戻す(box, 控);
    else {
      /* 画面が 変わった ときは 先頭から。ただし **一度 見た 画面へ 戻った**
         ときは、その 画面で 見ていた ところへ 戻す（前へ／次へ の 行き来）。 */
      var w2 = box.querySelector(".w");
      if (w2 && 巻き[st.画面]) { void w2.scrollHeight; w2.scrollTop = 巻き[st.画面]; }
    }
    var w3 = box.querySelector(".w");
    if (w3) {
      巻き[st.画面] = w3.scrollTop;
      /* 人が 巻いた ところを 覚えておく（描き直しでは ない ときの ため）。 */
      if (!w3.__vm巻き) {
        w3.__vm巻き = 1;
        w3.addEventListener("scroll", function () { 巻き[st.画面] = w3.scrollTop; }, { passive: true });
      }
    }
  }

  function 選ぶ中身() {
    return '<div class="hd"><div><div class="ttl">何を作りますか</div>'
      + '<div class="sub">あとから 作り直せます。試験は 表紙から 順に 作ります。</div></div>'
      + '<div class="sp"></div>'
      + ヘルプ札()
      + '<button class="ib" data-a="close" aria-label="閉じる">' + svg("x") + "</button></div>"
      + '<div class="pick">'
      + '<button class="card" data-a="preset">' + svg("cards")
      + "<h3>プリセット</h3>"
      + "<p>問題を 集めて 何度も 解くための ひとまとまり。学習履歴に 残り、"
      + "苦手の 分析にも 使われます。</p>"
      + '<span class="fl">資料 → 条件 → 生成 →</span></button>'
      + '<button class="card" data-a="exam">' + svg("paper")
      + "<h3>試験</h3>"
      + "<p>大問に 分かれた 本物の 試験。表紙・問題用紙・解答用紙まで 作り、"
      + "解いたあとは 解答用紙に 採点が 入ります。</p>"
      + '<span class="fl">表紙 → 大問 → 生成 → 紙面 →</span></button>'
      + "</div>";
  }

  function 表紙の中身() {
    var c = st.表紙;
    var h = '<div class="hd">'
      + '<button class="ib" data-a="back" aria-label="戻る">' + svg("back") + "</button>"
      + '<div><div class="ttl">表紙を 作る</div>'
      + '<div class="sub">試験は 表紙から 作ります。ここで 入れたものが '
      + "そのまま 1 ページ目に なります。</div></div>"
      + '<div class="sp"></div>'
      + ヘルプ札()
      + '<button class="ib" data-a="close" aria-label="閉じる">' + svg("x") + "</button></div>";

    h += '<div class="form">'
      + '<div class="row"><label for="vm-name">試験の名前</label>'
      + '<input id="vm-name" data-f="examName" maxlength="60" placeholder="2026年度 1学期 期末考査" value="'
      + esc(c.examName) + '"></div>'
      + '<div class="row two">'
      + '<div class="row"><label for="vm-sub">教科名</label>'
      + '<input id="vm-sub" data-f="subject" maxlength="30" placeholder="日本史探究" value="'
      + esc(c.subject) + '"></div>'
      + '<div class="row"><label for="vm-date">受験日</label>'
      + '<input id="vm-date" data-f="examDate" maxlength="30" placeholder="2026年8月30日" value="'
      + esc(c.examDate) + '"></div>'
      + "</div>"
      /* ★ 注意事項は **書かせない**（2026-08-30・訴え）。
         試験時間・満点・大問の 数・マーク式か どうか・記入する 欄は
         アプリが 知っている。書いたものが 出るのではなく、
         **決めた 条件が そのまま 注意事項に なる**。 */
      + '<div class="row"><label>注意事項</label><div class="chips">'
      + '<button type="button" class="chip' + (c.注意は自動 !== false ? " is-on" : "")
      + '" data-a="notes-auto" aria-pressed="' + (c.注意は自動 !== false ? "true" : "false")
      + '">おまかせ<small>条件から 書きます</small></button>'
      + '<button type="button" class="chip' + (c.注意は自動 === false ? " is-on" : "")
      + '" data-a="notes-mine" aria-pressed="' + (c.注意は自動 === false ? "true" : "false")
      + '">自分で 書く</button></div>'
      + (c.注意は自動 === false
          ? '<textarea id="vm-notes" data-f="instructions" maxlength="1200">'
            + esc((c.instructions || []).join("\n")) + "</textarea>"
            + '<div class="hint">1 行に 1 つ。空の行は 出しません。</div>'
          : '<div class="hint">試験時間・満点・大問の 数・マーク式か どうか・'
            + "記入する 欄から <b>次の 段で 決めた とおりに</b> 書きます。"
            + "教科ならではの 一言（数学の 約分・英語の 辞書 など）は 作る ときに 足します。"
            + "下の 下書きは いまの 条件で 書いた ものです。</div>")
      + "</div>"
      + '<div class="row"><label>記入欄</label><div class="chips">'
      + ["年", "組", "番", "氏名", "受験番号"].map(function (f) {
          var on = (c.studentFields || []).indexOf(f) >= 0;
          return '<button type="button" class="chip" data-a="sf" data-v="' + esc(f) + '"'
            + ' aria-pressed="' + (on ? "true" : "false") + '">' + esc(f) + "</button>";
        }).join("")
      + '</div><div class="hint">解く人が 書き込む 欄です。押して 出し入れします。</div></div>'
      + '<div class="row"><label>できあがり</label>' + 下書き() + "</div>"
      + "</div>";

    if (st.err) h += '<div class="err">' + esc(st.err) + "</div>";
    h += '<div class="ft">'
      + '<button class="btn" data-a="back">戻る</button>'
      + '<button class="btn pri" data-a="go">この表紙で 試験を 作る</button></div>';
    return h;
  }

  /* ══ ③ 条件 ═══════════════════════════════════════════════════════
     「決めるところ」を ここで 全部 決める。ここまでが 新しい画面。
     押したあとは 作業場（生成・検証・紙面）へ 行く。 */
  function 条件の中身() {
    var c = st.条件;
    var h = '<div class="hd">'
      + '<button class="ib" data-a="back-cover" aria-label="表紙へ戻る">' + svg("back") + "</button>"
      + '<div><div class="ttl">どんな試験にしますか</div>'
      + '<div class="sub">ここまで 決めれば あとは 作るだけです。'
      + "あとから 直せます。</div></div>"
      + '<div class="sp"></div>'
      + ヘルプ札()
      + '<button class="ib" data-a="close" aria-label="閉じる">' + svg("x") + "</button></div>";

    h += '<div class="form">';

    /* 型 */
    h += '<div class="row"><label>試験の型</label><div class="chips">'
      + 型.map(function (k) {
          var on = c.kind === k.id;
          return '<button type="button" class="chip' + (on ? " is-on" : "") + '" data-a="kind" data-v="'
            + esc(k.id) + '" aria-pressed="' + (on ? "true" : "false") + '">'
            + esc(k.label) + '<small>' + esc(k.note) + "</small></button>";
        }).join("")
      + "</div></div>";

    /* 数 */
    h += '<div class="row two">'
      + 数欄("試験時間（分）", "durationMinutes", c.durationMinutes, 5, 300)
      + 数欄("満点", "totalPoints", c.totalPoints, 1, 1000)
      + "</div>"
      + '<div class="row two">'
      + 数欄("大問の数", "sectionCount", c.sectionCount, 1, 20)
      + 数欄("問題の数（0 = おまかせ）", "questionCount", c.questionCount, 0, 200)
      + "</div>"
      + '<p class="hint">配点は 満点に ぴったり 合うよう 自動で 割り振ります。</p>';

    /* 難易度 */
    h += '<div class="row"><label>難しさ</label><div class="chips">'
      + 難易.map(function (d) {
          var on = c.difficulty === d.id;
          return '<button type="button" class="chip' + (on ? " is-on" : "") + '" data-a="diff" data-v="'
            + esc(d.id) + '" aria-pressed="' + (on ? "true" : "false") + '">' + esc(d.label) + "</button>";
        }).join("")
      + "</div></div>";

    /* 形式 */
    var 選 = 形式.filter(function (x) { return c.types[x.id]; }).length;
    h += '<div class="row"><label>出す形式（' + 選 + ' 種類）</label><div class="chips">'
      + 形式.map(function (t) {
          var on = !!c.types[t.id];
          return '<button type="button" class="chip' + (on ? " is-on" : "") + '" data-a="type" data-v="'
            + esc(t.id) + '" aria-pressed="' + (on ? "true" : "false") + '">' + esc(t.label) + "</button>";
        }).join("")
      + '</div><div class="hint">試験の 標準は <b>考えて 書かせる 問題</b>です。'
      + "選択だけに すると ただの 一問一答に なります。</div></div>";

    /* 紙面 */
    h += '<div class="row two">'
      + 選び欄("問題用紙の型", "layoutMode", c.layoutMode, 紙面の型())
      + 選び欄("解答用紙の型", "answerSheetMode", c.answerSheetMode, 解答用紙の型())
      + "</div>"
      + '<p class="hint">「共通テスト風」は B5・丸数字・第 n 問。'
      + "ここに 出ているのは <b>実際に 組める型だけ</b>です。</p>";

    /* 資料 */
    /* 渡しかた。資料が あるときだけ 出す。 */
    if (st.資料.length) {
      var 文件 = 文字の資料().length, 生件 = 生の資料().length;
      h += '<div class="row"><label>資料の 渡しかた</label><div class="chips">'
        + ["はやい", "そのまま"].map(function (id) {
            var on = (c.資料の渡し || "はやい") === id;
            return '<button type="button" class="chip' + (on ? " is-on" : "") + '" data-a="pass" data-v="'
              + id + '" aria-pressed="' + (on ? "true" : "false") + '">'
              + (id === "はやい" ? "先に 1 回 読み取る<small>速い</small>"
                                 : "毎回 そのまま 読ませる<small>図も 見える・遅い</small>") + "</button>";
          }).join("")
        + "</div><div class=\"hint\">"
        + ((c.資料の渡し || "はやい") === "そのまま"
            ? "頼むたびに <b>資料 そのものを 送って 読ませます</b>。図・写真・レイアウトまで "
              + "AI が 目で 見ますが、20 問なら <b>4 回 送り直す</b>ので とても 遅くなります。"
            : (function () {
                var 絵件 = 読み取る資料().length;
                var 絵頁 = 読み取る資料().reduce(function (n, f) { return n + f.pageImages.length; }, 0);
                var 済件 = st.資料.filter(function (f) { return String(f.ocrText || "").trim(); }).length;
                var 言 = [];
                if (文件) 言.push("本文の 取れた <b>" + 文件 + " 件</b>は そのまま 文字で 渡します");
                if (済件) 言.push("読み取り済み <b>" + 済件 + " 件</b>");
                if (絵件) 言.push("文字の 無い <b>" + 絵件 + " 件</b>（" + 絵頁
                  + " ページ）は <b>作る 前に 1 回だけ</b> 読み取ります");
                if (!言.length) return "資料から 中身を 取り出せていません。";
                return 言.join("／") + "。"
                  + "要点に していません（<b>本文 そのもの</b>）。"
                  + "一度 文字に すれば 何回 頼んでも 送り直さないので、ここが いちばん 速い 道です。";
              }()))
        + "</div></div>";
    }
    h += '<div class="row"><label>資料（任意）</label>' + 資料の中身()
      + '<div class="hint">PDF・画像・文書・表・zip を そのまま 渡します（要点だけを 抜き出しません）。'
      + "資料を 付けると、<b>その 資料だけを 根拠に</b>した 問題を 作ります。"
      + "文字の 入っていない <b>スキャンした PDF</b>も、ページを 絵にして 読ませます。"
      + "プリセット作成の AI と <b>同じ 道</b>を 通ります。</div></div>";

    /* ★ 本文＋語群うめ（2026-08-30・訴え「語群問題とかって ないの？」）。 */
    h += '<div class="row"><label>本文＋語群うめ</label>'
      + '<button type="button" class="chip' + (c.wordBank !== false ? " is-on" : "") + '" data-a="wb"'
      + ' aria-pressed="' + (c.wordBank !== false ? "true" : "false") + '">'
      + (c.wordBank !== false ? "入れる" : "入れない") + "</button>"
      + '<div class="hint">まとまった <b>本文</b>を 出し、その 中の 空欄（【ア】【イ】…）を '
      + "<b>下の 語群から 選ばせる</b> 形です。語群は 空欄より 多くして、"
      + "ひと目で 対応が つかないように します。"
      + "同じ 本文に 選択・記述を 並べて 出すので、試験らしく なります。</div></div>";

    /* 図・表・グラフ（資料問題）─────────────────────────────
       ★ AI に SVG は 書かせない。数と 名前だけ 出させて、線は こちらが 引く。 */
    h += '<div class="row"><label>図・表・グラフ</label>'
      + '<button type="button" class="chip' + (c.materials ? " on" : "") + '" data-a="mat"'
      + ' aria-pressed="' + (c.materials ? "true" : "false") + '">'
      + (c.materials ? "付ける" : "付けない") + "</button>"
      + '<div class="hint">表・グラフ（棒／折れ線／円／散布図）・図形（三角形・円・角・数直線・座標）を、'
      + "<b>問題用紙に そのまま 描きます</b>。目盛りは きりの よい 数に そろえ、"
      + "白黒 印刷でも 見分けが 付くよう 模様で 分けます。"
      + "資料の 要らない 問題には 付きません。</div></div>";

    /* 指示 */
    h += '<div class="row"><label for="vm-inst">ほかに 伝えること（任意）</label>'
      + '<textarea id="vm-inst" data-f="instruction" data-o="cond" maxlength="1200"'
      + ' placeholder="例）配った授業プリントの範囲だけで。記述は 40 字以内でまとめさせる問題を 2 問。">'
      + esc(c.instruction) + "</textarea>"
      + '<div class="hint">範囲・出したい形式の 比率・字数の 指定などを 書くと そのとおりに 寄せます。</div></div>';

    h += "</div>";

    if (st.err) h += '<div class="err">' + esc(st.err) + "</div>";
    h += '<div class="ft">'
      + '<button class="btn" data-a="back-cover">表紙へ戻る</button>'
      + '<button class="btn pri" data-a="run">この条件で 作る</button></div>';
    return h;
  }

  /* ══ ④ 構成案 ═══════════════════════════════════════════════════════
     **AI を 呼ぶ前に**「どの 大問に 何を 何問 出すか」を 見せる。
     ここは コードが 決める（MC.plan）。AI に 枠を 決めさせない。 */
  function 構成案の中身() {
    var p2 = st.枠;
    var h = '<div class="hd">'
      + '<button class="ib" data-a="back-cond" aria-label="条件へ戻る">' + svg("back") + "</button>"
      + '<div><div class="ttl">この構成で 作ります</div>'
      + '<div class="sub">問題を 作る前に 枠を 決めました。'
      + "配点は ここから 増えも 減りも しません。</div></div>"
      + '<div class="sp"></div>'
      + ヘルプ札()
      + '<button class="ib" data-a="close" aria-label="閉じる">' + svg("x") + "</button></div>";
    if (!p2) return h + '<div class="err">構成案を 作れませんでした。</div>'
      + '<div class="ft"><button class="btn" data-a="back-cond">条件へ戻る</button></div>';

    h += '<div class="sum">'
      + '<span><b>' + esc(p2.sections.length) + "</b> 大問</span>"
      + '<span><b>' + esc(p2.totalQuestions) + "</b> 問</span>"
      + '<span><b>' + esc(p2.totalPoints) + "</b> 点</span>"
      + '<span>' + esc(st.条件.durationMinutes) + " 分</span></div>";

    (p2.issues || []).forEach(function (i) {
      h += '<div class="' + (i.severity === "high" ? "err" : "warn") + '">' + esc(i.message) + "</div>";
    });

    /* ★ **ここを 直せる ように した**（2026-08-31・訴え）。
       題・問数・出題範囲（ページ）を 人が 決められる。
       直さなければ これまでどおり サーバが 決める。 */
    範囲をそろえる(p2);
    h += '<div class="secs">';
    st.範囲.forEach(function (r, i) {
      var sec = p2.sections[i] || {};
      var 内訳 = {};
      (sec.questions || []).forEach(function (q) {
        var n = 形式名(q.type); 内訳[n] = (内訳[n] || 0) + 1;
      });
      h += '<div class="sec"><div class="sec-h"><b>大問 ' + esc(i + 1) + "</b>"
        + '<span>' + esc(sec.points != null ? sec.points : "-") + " 点</span></div>"
        + '<div class="sec-e">'
        + '<label class="fl"><span>題・分野</span>'
        + '<input class="in" data-a="sec-t" data-i="' + i + '" value="' + esc(r.title)
        + '" placeholder="第1問 評論" /></label>'
        + '<label class="fl fl-s"><span>問数</span>'
        + '<input class="in" data-a="sec-n" data-i="' + i + '" type="number" min="0" max="40" '
        + 'value="' + esc(r.count) + '" /></label>'
        + '</div>'
        + (st.資料.length
            ? '<label class="fl"><span>出題する 範囲（資料の ページ）</span>'
              + '<input class="in" data-a="sec-w" data-i="' + i + '" value="' + esc(r.where)
              + '" placeholder="p.12〜p.27（空なら AI が 決めます）" /></label>'
            : "")
        + '<div class="sec-b">'
        + Object.keys(内訳).map(function (k) {
            return '<span class="tag">' + esc(k) + " " + 内訳[k] + "</span>";
          }).join("")
        + "</div></div>";
    });
    h += "</div>";
    var 合 = st.範囲.reduce(function (a, x) { return a + (parseInt(x.count, 10) || 0); }, 0);
    h += '<p class="hint">大問の 問数の 合計 <b>' + esc(合) + '</b> 問'
      + (合 !== p2.totalQuestions
          ? "（条件は " + esc(p2.totalQuestions) + " 問。**直した ほうを 使います**）"
          : "")
      + "。題・問数・範囲を 直すと、その とおりに 作ります。</p>";

    if (st.資料.length) {
      h += '<p class="hint">資料 ' + st.資料.length + " 件を そのまま 渡します（要点だけを 抜き出しません）。</p>";
    } else {
      h += '<p class="hint">資料は 付いていません。上で 書いた 指示だけで 作ります。</p>';
    }
    if (st.err) h += '<div class="err">' + esc(st.err) + "</div>";
    h += '<div class="ft">'
      + '<button class="btn" data-a="back-cond">条件を 直す</button>'
      + '<button class="btn pri" data-a="gen">この構成で 問題を 作る</button></div>';
    return h;
  }

  /* 枠から 「直せる 大問の 一覧」を 作る。すでに 直して いれば そのまま。 */
  function 範囲をそろえる(p2) {
    var n = (p2 && p2.sections) ? p2.sections.length : 0;
    if (!st.範囲 || st.範囲.length !== n) {
      st.範囲 = [];
      for (var i = 0; i < n; i++) {
        var sec = p2.sections[i] || {};
        st.範囲.push({
          title: String(sec.title || ("大問 " + (i + 1))),
          field: String(sec.title || ""),
          where: "",
          count: (sec.questions || []).length
        });
      }
    }
  }

  /* ══ ⑤ 生成 ═══════════════════════════════════════════════════════ */
  function 経った(t0) {
    var s2 = Math.max(0, Math.round((Date.now() - t0) / 1000));
    if (s2 < 60) return s2 + " 秒";
    return Math.floor(s2 / 60) + " 分 " + (s2 % 60) + " 秒";
  }
  function 生成の中身() {
    var pr = st.進み || { done: 0, total: 1, made: 0, madeTotal: 0, stage: "" };
    var 割 = pr.madeTotal ? Math.round((pr.made / pr.madeTotal) * 100) : 0;
    var h = '<div class="hd"><div><div class="ttl">問題を 作っています</div>'
      + '<div class="sub">' + esc(pr.stage || "はじめています…") + "</div></div>"
      + '<div class="sp"></div></div>';
    h += '<div class="bar"><i style="width:' + 割 + '%"></i></div>'
      /* ★ 「（0 / 24 回）」は **回数では なかった**（2026-08-30）。
         中で 使っている 数を そのまま 出していたので、いつも 0 で、
         止まっているように 見えていた。経った 時間を 出す ほうが 役に立つ。 */
      + '<div class="barn">' + esc(pr.made) + " / " + esc(pr.madeTotal) + " 問"
      + (st.始めた ? "　（" + esc(経った(st.始めた)) + "）" : "") + "</div>";
    var 並 = st.記録.slice(-14);
    h += '<div class="log" data-last="' + esc(並.length ? 並[並.length - 1].i : 0) + '">'
      + 並.map(function (r) {
          return '<div class="log-' + esc(r.k) + '">' + esc(r.t) + "</div>";
        }).join("")
      + "</div>";
    if (st.err) h += '<div class="err">' + esc(st.err) + "</div>";
    /* data-run … 走っているかで ボタンが 変わる。塗り替えでは 直せないので
       ここが 変わった ときだけ 建て直す（進みを塗る が 見る）。 */
    h += '<div class="ft" data-run="' + (st.走っている ? "1" : "0") + '">'
      + (st.走っている
          ? '<button class="btn dan" data-a="stop">やめる</button>'
          : '<button class="btn" data-a="back-plan">構成案へ戻る</button>')
      + "</div>";
    return h;
  }

  /* ══ ⑥ 確認 ═══════════════════════════════════════════════════════ */
  function 確認の中身() {
    var sp = st.spec;
    var h = '<div class="hd"><div><div class="ttl">できました</div>'
      + '<div class="sub">中身を 確かめてから 紙面に します。</div></div>'
      + '<div class="sp"></div>'
      + ヘルプ札()
      + '<button class="ib" data-a="close" aria-label="閉じる">' + svg("x") + "</button></div>";
    if (!sp) return h + '<div class="err">試験が ありません。</div>'
      + '<div class="ft"><button class="btn" data-a="back-cond">条件へ戻る</button></div>';

    var 問数 = (sp.sections || []).reduce(function (a, x) { return a + (x.questions || []).length; }, 0);
    h += '<div class="sum">'
      + '<span><b>' + esc((sp.sections || []).length) + "</b> 大問</span>"
      + '<span><b>' + esc(問数) + "</b> 問</span>"
      + '<span><b>' + esc(sp.totalPoints) + "</b> 点</span>"
      + '<span>' + esc(sp.durationMinutes) + " 分</span></div>";

    var 足 = st.結果 && st.結果.planned > st.結果.accepted;
    if (足) {
      h += '<div class="warn">頼んだ ' + esc(st.結果.planned) + " 問のうち "
        + esc(st.結果.accepted) + " 問できました。"
        + "できたぶんは そのまま 残してあります。</div>";
    }
    (st.記録 || []).filter(function (r) { return r.k === "err" || r.k === "warn"; })
      .slice(-4).forEach(function (r) {
        h += '<div class="' + (r.k === "err" ? "err" : "warn") + '">' + esc(r.t) + "</div>";
      });

    h += '<div class="secs">';
    (sp.sections || []).forEach(function (sec) {
      h += '<div class="sec"><div class="sec-h"><b>大問 ' + esc(sec.number) + "　"
        + esc(sec.title || "") + "</b>"
        + '<span>' + esc((sec.questions || []).length) + " 問 ・ " + esc(sec.points) + " 点</span></div>"
        + '<div class="qs">';
      (sec.questions || []).slice(0, 40).forEach(function (q) {
        h += '<div class="q"><span class="q-n">問' + esc(q.number) + "</span>"
          + '<span class="q-t">' + esc(String(q.prompt || "").slice(0, 90)) + "</span>"
          + '<span class="tag">' + esc(形式名(q.type)) + "</span>"
          + '<span class="q-p">' + esc(q.points) + "</span></div>";
      });
      h += "</div></div>";
    });
    h += "</div>";

    if (st.err) h += '<div class="err">' + esc(st.err) + "</div>";
    h += '<div class="ft">'
      + '<button class="btn" data-a="regen">作り直す</button>'
      + (足 ? '<button class="btn" data-a="refill">足りないぶんを 作る</button>' : "")
      + '<button class="btn" data-a="save">保存する</button>'
      + '<button class="btn" data-a="paper">紙面へ</button>'
      /* ★ 試験は 受けるために 作る。ここに 出しておかないと
         「紙面へ」→「受験する」の 2 手を 踏まないと CBT に 辿り着けない
         （訴え 2026-08-30「CBT に ならない。試験モードに ならない」）。 */
      + '<button class="btn pri" data-a="take-exam">受験する（CBT）</button></div>';
    return h;
  }

  /* ══ ⑦ 紙面・受験 ═════════════════════════════════════════════════ */
  function 紙面の中身() {
    var sp = st.spec;
    var h = '<div class="hd">'
      + '<button class="ib" data-a="back-check" aria-label="確認へ戻る">' + svg("back") + "</button>"
      + '<div><div class="ttl">紙面と 受験</div>'
      + '<div class="sub">表紙・問題用紙・解答用紙は 選んだ型で 組みます。</div></div>'
      + '<div class="sp"></div>'
      + ヘルプ札()
      + '<button class="ib" data-a="close" aria-label="閉じる">' + svg("x") + "</button></div>";
    if (!sp) return h + '<div class="err">試験が ありません。</div>';

    h += '<div class="form">'
      + '<div class="row two">'
      + 選び欄("問題用紙の型", "layoutMode", st.条件.layoutMode, 紙面の型())
      + 選び欄("解答用紙の型", "answerSheetMode", st.条件.answerSheetMode, 解答用紙の型())
      + "</div>"
      + '<p class="hint">ここに 出ているのは <b>実際に 組める型だけ</b>です。'
      + "選べば 必ず 紙面が 変わります。</p>"
      /* ★ 添付した 紙面から 型を 作る（2026-08-30・訴え）。
         **AI に 組版を 書かせない。** 出させるのは 既にある 型の 設定値だけ。 */
      + '<div class="row"><label>手元の 試験に そろえる</label>'
      + '<button type="button" class="file-add" data-a="readlayout"' + (st.読取中 ? " disabled" : "") + ">"
      + svg("paper", "i") + (st.読取中 ? "読み取っています…" : "過去問・見本を 読み取って 型にする")
      + "</button>"
      + (st.読取り
          ? '<div class="read">' + 読み取りHTML(st.読取り) + "</div>"
          : '<div class="hint">問題用紙（と 解答用紙）の PDF か 画像を 選ぶと、'
            + "段組・余白・文字の 大きさ・大問の 書きかた・選択肢の 記号・表紙の 有無を 読み取り、"
            + "<b>いちばん 近い 型</b>に そろえます。中身（問題や 答え）は 読みません。</div>")
      + "</div></div>";

    h += '<div class="outs">'
      + 出す札("表紙つき 問題用紙", "冊子の 1 ページ目が 表紙に なります", "print-q")
      + 出す札("解答用紙", "問題と 番号・欄の 形が そろっています", "print-a")
      + 出す札("解答例", "答えと 解説", "print-k")
      + "</div>";

    /* ── PDF ファイルとして 保存（組版・2026-08-30）──────────────
       上の 3 つは ブラウザの 印刷の 窓を 通る。窓を 通ると
       余白と 縮尺が **ブラウザまかせ**に なるので、紙面が 少し ずれる。
       こちらは Typst が この端末の 中で 組み、PDF を そのまま 渡す。
       ★ 20MB を 読む。押したときに 初めて 取りに 行く。 */
    h += 組版の欄();

    if (st.err) h += '<div class="err">' + esc(st.err) + "</div>";
    h += '<div class="ft">'
      + '<button class="btn" data-a="save">' + (st.保存した ? "保存ずみ" : "保存する") + "</button>"
      + '<button class="btn pri" data-a="take-exam">受験する</button></div>';
    return h;
  }
  /* 組版（Typst）の 欄。**大きさを 先に 言う。** */
  function 組版の欄() {
    var T = window.VQTYPST;
    if (!T) return "";
    var 用意 = false, 状 = null;
    try { 用意 = T.用意ができているか(); 状 = T.状態(); } catch (e) {}
    var 大 = null;
    try { 大 = T.大きさ(); } catch (e) {}

    if (st.組版 && st.組版.進み && !st.組版.終わった) {
      var pct = Math.round((st.組版.進み.割合 || 0) * 100);
      return '<div class="row"><label>PDF ファイルとして 保存</label>'
        + '<div class="tyb"><div class="tyb-i" style="width:' + pct + '%"></div></div>'
        + '<div class="hint">' + esc(st.組版.進み.段 || "読み込んでいます")
        + "… " + pct + "%（" + (大 ? 大.MB : 21) + "MB／一度だけ）</div></div>";
    }
    var 中 = '<div class="row"><label>PDF ファイルとして 保存</label>';
    if (状 && 状.済み && !状.使える) {
      /* ★ 使えるふりを しない。理由を 出す。 */
      中 += '<div class="warn">この端末では 組版を 使えません：' + esc(状.なぜ || "理由が 分かりません") + "</div>"
        + '<div class="hint">上の 3 つ（印刷の 窓から PDF）は これまでどおり 使えます。</div>';
      return 中 + "</div>";
    }
    中 += '<div class="outs">'
      + 出す札("問題用紙を PDF で 保存", 用意 ? "そのまま 保存します" : "はじめだけ 約 " + (大 ? 大.MB : 21) + "MB を 読み込みます", "pdf-q")
      + 出す札("解答用紙を PDF で 保存", "同じ 組版で 出します", "pdf-a")
      + "</div>"
      + '<div class="hint">印刷の 窓を 通さないので、<b>余白と 縮尺が ずれません</b>。'
      + (用意 ? "用意は できています。"
             : "組版の 道具（約 " + (大 ? 大.MB : 21) + "MB）を 一度だけ 読み込みます。"
               + "2 回目からは 何も 流れません。細い 回線だと 数分 かかります。")
      + "</div>";
    if (st.組版 && st.組版.err) 中 += '<div class="err">' + esc(st.組版.err) + "</div>";
    if (st.組版 && st.組版.出した) 中 += '<div class="ok2">' + esc(st.組版.出した) + "</div>";
    return 中 + "</div>";
  }

  function 出す札(名, 説, act) {
    return '<button class="out" data-a="' + esc(act) + '">' + svg("paper", "i")
      + '<span><b>' + esc(名) + "</b><small>" + esc(説) + "</small></span></button>";
  }

  function 読み取りHTML(r) {
    var v = r.読めた || {};
    var 行 = [];
    if (v.段組) 行.push(v.段組 + " 段組");
    if (v.大問の書きかた) 行.push("大問は「" + v.大問の書きかた + "」");
    if (v.小問の書きかた) 行.push("小問は「" + v.小問の書きかた + "」");
    if (v.選択肢) 行.push("選択肢は " + v.選択肢);
    if (v.表紙) 行.push("表紙あり");
    if (v.解答用紙 && v.解答用紙 !== "見当たらない") 行.push("解答用紙は " + v.解答用紙);
    if (v.教科 && v.教科 !== "分からない") 行.push(v.教科);
    var h = "<b>読み取りました</b><div>" + esc(行.join(" ・ ")) + "</div>";
    if (r.紙) {
      h += "<div>" + esc(r.紙.size) + " ・ 余白 上" + esc(r.紙.margins.top)
        + " 下" + esc(r.紙.margins.bottom) + " 左" + esc(r.紙.margins.left)
        + " 右" + esc(r.紙.margins.right) + "mm ・ 本文 " + esc(r.紙.bodyPt) + "pt</div>";
    }
    (r.できないこと || []).forEach(function (m) { h += '<div class="ng">' + esc(m) + "</div>"; });
    return h;
  }

  /* 添付した 紙面から 型を 作る。**中身は 読まない。** */
  function 紙面を読み取る() {
    var inp = doc.createElement("input");
    inp.type = "file";
    inp.accept = ".pdf,.png,.jpg,.jpeg,.webp";
    inp.multiple = true;
    inp.style.cssText = "position:fixed;width:0;height:0;opacity:0";
    doc.body.appendChild(inp);
    inp.addEventListener("change", function () {
      var 並 = Array.prototype.slice.call(inp.files || []).slice(0, 3);
      try { inp.parentNode.removeChild(inp); } catch (e) {}
      if (!並.length) return;
      st.読取中 = true; st.err = ""; 描く();
      Promise.all(並.map(function (f) {
        return new Promise(function (done) {
          var r = new FileReader();
          r.onload = function () {
            var m = /^data:([^;,]*);base64,(.*)$/.exec(String(r.result || ""));
            done(m ? { mimeType: m[1], data: m[2] } : null);
          };
          r.onerror = function () { done(null); };
          r.readAsDataURL(f);
        });
      })).then(function (files) {
        var 送 = files.filter(Boolean);
        if (!送.length) { st.読取中 = false; st.err = "読めない ファイルでした。"; 描く(); return; }
        var h = { "Content-Type": "application/json" };
        try {
          var tok = window.localStorage.getItem("app.auth.token.v1");
          if (tok) h.Authorization = "Bearer " + String(tok).replace(/^"|"$/g, "");
        } catch (e) {}
        return window.fetch(apiBase() + "/api/aigen/layout", {
          method: "POST", headers: h, body: JSON.stringify({ files: 送 })
        }).then(function (res) { return res.json(); }).then(function (j) {
          st.読取中 = false;
          if (!j || !j.ok || !j.layout) {
            st.err = (j && j.message) || "紙面を 読み取れませんでした。";
            描く();
            return;
          }
          st.読取り = j.layout;
          /* 型を そろえる。**あるものだけ** 当てる。 */
          var 紙 = 紙面の型().map(function (x) { return x.id; });
          var 解 = 解答用紙の型().map(function (x) { return x.id; });
          if (紙.indexOf(j.layout.layoutMode) >= 0) st.条件.layoutMode = j.layout.layoutMode;
          if (解.indexOf(j.layout.answerSheetMode) >= 0) st.条件.answerSheetMode = j.layout.answerSheetMode;
          /* 余白と 用紙は 試験そのものへ（型の 上から かぶせる）。 */
          if (st.spec && j.layout.紙) {
            st.spec.paper = st.spec.paper || {};
            st.spec.paper.size = j.layout.紙.size;
            st.spec.paper.orientation = j.layout.紙.orientation;
            st.spec.paper.margins = j.layout.紙.margins;
          }
          st.err = "";
          描く();
        });
      }).catch(function (e) {
        st.読取中 = false;
        st.err = "紙面を 読み取れませんでした：" + String((e && e.message) || e).slice(0, 100);
        描く();
      });
    });
    inp.click();
  }
  function apiBase() {
    try {
      if (window.AUTH_API_BASE) return String(window.AUTH_API_BASE).replace(/\/+$/, "");
      if (window.VQ_API_BASE) return String(window.VQ_API_BASE).replace(/\/+$/, "");
      if (window.API_BASE) return String(window.API_BASE);
    } catch (e) {}
    return "";
  }

  /* 送るときの 頭。**1 か所**に する（3 か所で 書き分けていた）。 */
  function 頭() {
    var h = { "Content-Type": "application/json" };
    try {
      var tok = window.localStorage.getItem("app.auth.token.v1");
      if (tok) h.Authorization = "Bearer " + String(tok).replace(/^"|"$/g, "");
    } catch (e) {}
    return h;
  }

  /* ══ 教科ならではの 一言だけ AI に 足させる（2026-08-30・訴え）════
     ★ 事実の 行（時間・満点・大問の 数・マーク）は **コードが 書く**。
       ここで 頼むのは 教科ならではの 一言だけ。数字が 混ざったら 落とす。
     ★ **作りに 行くのと 同時に** 走らせる。返事を 待たない。
       間に合わなければ 教科の 受け皿（教科から足す）が そのまま 残る。 */
  function 注意をAIに足す(表紙) {
    st.AI注意 = null;
    if (!表紙 || 表紙.注意は自動 === false) return;
    var 教 = String(表紙.subject || "").trim();
    if (!教 && !String(表紙.examName || "").trim()) return;
    try {
      window.fetch(apiBase() + "/api/aigen/cover", {
        method: "POST", headers: 頭(),
        body: JSON.stringify({
          task: "examNotes", subject: 教, examName: 表紙.examName || "",
          have: 表紙.instructions || []
        })
      }).then(function (r) { return r.json(); }).then(function (j) {
        var 並 = (j && Array.isArray(j.notes)) ? j.notes : [];
        if (並.length) st.AI注意 = { subject: 教, notes: 並 };
      }).catch(function () {});
    } catch (e) {}
  }

  function 形式名(id) {
    var f = 形式.filter(function (x) { return x.id === id; })[0];
    if (f) return f.label;
    try {
      var Q = window.VQ2 && window.VQ2.qtypes;
      var d = Q && Q.get ? Q.get(id) : null;
      if (d) return d.shortName || d.name || String(id);
    } catch (e) {}
    return String(id || "");
  }

  /* ══ 資料 ═════════════════════════════════════════════════════════
     ★ **プリセット作成の AI と 同じ 道**を 通す（2026-08-30・訴え
       「Quick Mock に 根拠と なる 資料も 添付できるように」）。
       ここだけ 自前の 作りに していたので、同じ「資料を 付ける」でも
         ・20MB を 超えると 送れない（プリセット側は 512MB まで）
         ・**スキャンした PDF**（文字が 入っていない）は 何も 読まれない
         ・docx / csv / zip は 中身が 取り出されない
         ・読み取れたのか どうかが 画面に 出ない
       という 差が あった。読み取り（__vqChatFiles）も 送り口
       （VQ2.aigen.filesToPayload）も **もう ある**。作らずに 使う。
     ★ 要点を 抜き出して 渡さない。抜き出すと「資料に 書いていないこと」を
       作る 元に なる。渡すのは 資料 そのもの（か、その ページの 絵）。 */
  function 読取器() { try { return window.__vqChatFiles || null; } catch (e) { return null; } }
  var 見張り = null;

  /* __vqChatFiles の 一覧から、いま 持っている 資料の 状態を 写し直す。 */
  function 資料を見直す() {
    var F = 読取器();
    if (!F || !F.list) return;
    var 表 = {};
    F.list().forEach(function (x) { if (x && x.id) 表[x.id] = x; });
    st.資料 = st.資料.map(function (a) {
      var x = a && a.id ? 表[a.id] : null;
      if (!x) return a;                        /* 自前で 読んだ ぶん（読取器なし） */
      return {
        id: x.id, name: x.name, size: x.size, mimeType: x.mimeType || "",
        file: x.file || null,
        /* ★ 読み取った 文字は **持ち越す**（2026-08-30）。読取器は これを
           知らないので、ここで 写し直すと 1 回 読んだ ものが 消える。 */
        ocrText: (a && a.ocrText) || "",
        ocr頁: (a && a.ocr頁) || 0,
        /* aigen 側は extractedText という 名前で 読む。ここで そろえる。 */
        extractedText: x.text || "",
        pageImages: x.pageImages || null,
        status: x.status, statusText: x.statusText || "", error: x.error || "",
        warnings: x.warnings || [], truncated: !!x.truncated, kind: x.kind || "",
        pageCount: x.pageCount || null, ocr: (x.pages || []).filter(function (pg) {
          return pg && pg.extractionMethod === "ocr-required";
        }).length
      };
    });
  }
  function 見張る() {
    var F = 読取器();
    if (!F || !F.subscribe || 見張り) return;
    見張り = F.subscribe(function () {
      if (!st.資料.length) return;
      資料を見直す();
      if (st.画面 === "条件") 描く();
    });
  }

  /* 1 件ぶんの 見え方。**読み取れたか どうかを 隠さない。** */
  function 資料の札(f, i) {
    var 状 = "", cls = "";
    if (f.status === "extracting" || f.status === "queued") { 状 = "読み取っています…"; cls = " is-busy"; }
    else if (f.status === "failed") { 状 = f.error || "読み取れませんでした"; cls = " is-bad"; }
    else if (String(f.ocrText || "").trim())
      状 = (f.ocr頁 || 0) + " ページを 読み取りました（"
        + Math.round(String(f.ocrText).length / 100) / 10 + " 千字）";
    else if ((f.pageImages || []).length)
      状 = "文字が 入っていないので、作る ときに " + f.pageImages.length + " ページを 読み取ります";
    else if (f.extractedText) 状 = Math.round(f.extractedText.length / 100) / 10 + " 千字を 読み取りました"
      + (f.truncated ? "（長いので 途中まで）" : "");
    else if (f.kind === "image") 状 = "画像として 渡します";
    else if (f.status === "ready" || f.status === "warning") 状 = "そのまま 渡します";
    return '<div class="file' + cls + '"><span class="file-n">' + esc(f.name) + "</span>"
      + '<span class="file-s">' + 大きさ(f.size) + "</span>"
      + '<button type="button" class="file-x" data-a="rmfile" data-v="' + i
      + '" aria-label="' + esc(f.name) + ' を外す">' + svg("x", "i") + "</button>"
      + (状 ? '<div class="file-st">' + esc(状) + "</div>" : "")
      + "</div>";
  }
  function 資料の中身() {
    var h = '<div class="files">';
    st.資料.forEach(function (f, i) { h += 資料の札(f, i); });
    h += '<button type="button" class="file-add" data-a="addfile">' + svg("plus", "i")
      + (st.資料.length ? "もっと 足す" : "資料を 選ぶ（PDF・画像・文書）") + "</button>";
    /* ★ **スキャンして 足す**（2026-08-31・訴え「何枚も スキャンしてから、
       添付させて、プロンプトと 投げられる ように」）。
       スキャンは 撮った そばから 文字に する ので、ここから 入れると
       **読み取りが すでに 済んだ 資料**として 入る（作る ときに 読み直さない）。 */
    if (window.VQSCAN) {
      h += '<button type="button" class="file-add" data-a="scanfile">' + svg("camera", "i")
        + "スキャンして 足す（何枚でも）</button>";
    }
    if (st.資料.length) {
      var 合 = st.資料.reduce(function (a, f) { return a + (f.size || 0); }, 0);
      h += '<div class="file-t">' + st.資料.length + " 件 ・ " + 大きさ(合) + "</div>";
    }
    return h + "</div>";
  }
  function 大きさ(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return Math.round(n / 1024) + " KB";
    return (Math.round(n / 1024 / 1024 * 10) / 10) + " MB";
  }
  function 資料を選ぶ() {
    var inp = doc.createElement("input");
    inp.type = "file";
    inp.multiple = true;
    /* プリセット作成と 同じ 顔ぶれ。表・書類・まとめて 入れた zip も 受ける。 */
    inp.accept = ".pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.md,.markdown,.csv,.tsv,.json,.docx,.zip";
    inp.style.cssText = "position:fixed;width:0;height:0;opacity:0";
    doc.body.appendChild(inp);
    inp.addEventListener("change", function () {
      var 並 = Array.prototype.slice.call(inp.files || []);
      try { inp.parentNode.removeChild(inp); } catch (e) {}
      if (!並.length) return;
      資料を足す(並);
    });
    inp.click();
  }

  /* ══ スキャンして 足す（2026-08-31・訴え）═══════════════════════════
     訴え「写真を 撮る じゃ なくて、スキャンで 撮り溜め できる ように して、
           何枚も スキャンしてから、添付させて、プロンプト（指示文章）と
           投げられる ように して ほしい。それを 高速で 読んで、
           すぐに 問題に できる ように して ほしい。プロンプトに 沿って。」

     ★ スキャンは **撮った そばから** 1 枚 1.6 秒で 文字に して いる。
       ここから 入れると「読み取りが すでに 済んだ 資料」として 入るので、
       作る ときに **もう 一度 読ませない**（絵を 送らない＝いちばん 速い 道）。
     ★ 指示（プロンプト）は スキャンの 画面でも 書けるが、ここから 入れた
       ときは **作る 画面の 注文欄**が 本命なので、書いて あれば そちらへ 足す。 */
  function スキャンして足す() {
    var S = window.VQSCAN;
    if (!S || !S.開く) {
      st.err = "スキャンの 部品が 読み込まれて いません。";
      描く(); return;
    }
    try {
      S.開く({
        用途: "添付",
        済んだら: function (出) {
          if (!出) return;
          var 文 = String(出.文 || "").trim();
          var 枚 = Number(出.枚数) || (出.ページ || []).length;
          if (!文 && !枚) return;
          /* 読めなかった ページ だけ 絵で 持つ（読めた ふりを しない）。 */
          var 絵 = (出.ページ || []).filter(function (p) {
            return p.状態 !== "済" || !String(p.文 || "").trim();
          }).map(function (p, i) {
            return { pageNumber: i + 1, dataUrl: p.dataUrl };
          });
          st.資料.push({
            id: "scan-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
            name: (出.見出し || "スキャン") + "（" + 枚 + " 枚）",
            size: 文.length + 絵.reduce(function (a, g) { return a + String(g.dataUrl || "").length; }, 0),
            mimeType: "text/plain", file: null,
            /* ★ **もう 読んで ある**ことを ここで 伝える。
               ocrText が 入って いれば、作る ときは 文字だけで 渡る。 */
            ocrText: 文, ocr頁: 枚 - 絵.length,
            extractedText: 文,
            pageImages: 絵.length ? 絵 : null,
            status: "ready", statusText: "", error: "", warnings: [],
            truncated: false, kind: "scan", pageCount: 枚, ocr: 絵.length
          });
          /* スキャン画面で 指示を 書いて いたら、注文欄へ 足す（捨てない）。 */
          var 指 = String(出.指示 || "").trim();
          if (指) {
            st.条件 = st.条件 || {};
            var 前 = String(st.条件.instruction || "").trim();
            st.条件.instruction = 前 ? (前 + "\n" + 指) : 指;
          }
          st.err = "";
          描く();
        }
      });
    } catch (e) {
      st.err = "スキャンを 開けませんでした：" + String((e && e.message) || e).slice(0, 100);
      描く();
    }
  }

  /* 足す。読取器が あれば そちらへ（＝プリセット作成と 同じ 道）。 */
  function 資料を足す(並) {
    var F = 読取器();
    if (!F || !F.add) return 自前で読む(並);
    var 前 = {};
    F.list().forEach(function (x) { if (x && x.id) 前[x.id] = 1; });
    st.err = "";
    描く();
    return Promise.resolve(F.add(並)).then(function () {
      F.list().forEach(function (x) {
        if (!x || !x.id || 前[x.id]) return;
        if (st.資料.some(function (a) { return a.id === x.id; })) return;
        st.資料.push({ id: x.id, name: x.name, size: x.size, mimeType: x.mimeType || "",
                      file: x.file || null, extractedText: "", pageImages: null,
                      status: x.status, statusText: x.statusText || "", error: "", kind: x.kind || "" });
      });
      /* 受け取れなかった ものが あれば 言う（黙って 減らさない）。 */
      var 受 = st.資料.length;
      if (受 < 前ぶん(前) + 並.length) {
        var 落 = (前ぶん(前) + 並.length) - 受;
        st.err = 落 + " 件は 受け取れませんでした（大きすぎる・対応していない 形）。";
      }
      資料を見直す();
      見張る();
      描く();
    }, function (e) {
      st.err = "資料を 読み取れませんでした：" + String((e && e.message) || e).slice(0, 100);
      描く();
    });
    function 前ぶん(t) { return st.資料.filter(function (a) { return t[a.id]; }).length; }
  }

  /* 読取器が 無い ところ（試験用の 器 など）だけの 道。base64 で 持つ。 */
  /* ★ 2026-09-03・訴え「PDF・スキャン画像は 100MB まで 読み取れるように」。
     読取器（__vqChatFiles）が ある ときは そちらの 上限（PDF 512MB）。
     ここは 読取器の 無い ところの 逃げ道なので、100MB に そろえる。 */
  var 自前の上限 = 100 * 1024 * 1024;
  function 自前で読む(並) {
    return 並.reduce(function (待, f) {
      return 待.then(function () { return 一つ読む(f); });
    }, Promise.resolve()).then(function () { 描く(); });
  }
  function 一つ読む(f) {
    var 合 = st.資料.reduce(function (a, x) { return a + (x.size || 0); }, 0);
    if (合 + f.size > 自前の上限) {
      st.err = "資料が 大きすぎます（合わせて " + 大きさ(自前の上限) + " まで）。"
        + "「" + f.name + "」は 入れていません。";
      return Promise.resolve();
    }
    return new Promise(function (done) {
      var r = new FileReader();
      r.onload = function () {
        try {
          var m = /^data:([^;,]*);base64,(.*)$/.exec(String(r.result || ""));
          if (!m) { st.err = "「" + f.name + "」を 読めませんでした。"; done(); return; }
          st.資料.push({
            name: String(f.name || "資料").slice(0, 80),
            mimeType: m[1] || f.type || "application/octet-stream",
            data: m[2], size: f.size, status: "ready"
          });
          st.err = "";
        } catch (e) { st.err = "「" + f.name + "」を 読めませんでした。"; }
        done();
      };
      r.onerror = function () { st.err = "「" + f.name + "」を 読めませんでした。"; done(); };
      r.readAsDataURL(f);
    });
  }

  /* ══ 添付した 画像を **紙面の 資料**に する（2026-08-30・訴え）════
     訴え「外部から 画像資料などを 持ってきてもいい」。

     ★ AI に **画像の 住所を 書かせない。** 作り話の URL を 書いてくるだけで、
       印刷では 取りに 行けず 白い 四角に なる（前に 踏んだ）。
     ★ そこで **利用者が 添付した 画像だけ**に 名前（画像1・画像2…）を 付け、
       AI には その 名前で 指させる。名前 → 中身の 差し替えは ここで する。 */
  function 画像の資料() {
    var 出 = [];
    st.資料.forEach(function (f) {
      var url = f && (f.imageDataUrl || (f.data && /^image\//.test(f.mimeType || "")
        ? "data:" + f.mimeType + ";base64," + f.data : ""));
      if (!url) {
        /* 読取器が 持っている 縮小ずみの 絵。 */
        try {
          var F = 読取器();
          var x = F && F.list ? F.list().filter(function (y) { return y.id === f.id; })[0] : null;
          if (x && x.imageDataUrl) url = x.imageDataUrl;
        } catch (e) {}
      }
      if (!url || !/^data:image\//.test(url)) return;
      出.push({ 名: "画像" + (出.length + 1), name: f.name || "画像", src: url });
    });
    return 出.slice(0, 6);
  }
  /* AI が 書いた「画像1」を、本物の 中身へ 差し替える。
     知らない 名前は **消す**（住所を でっち上げさせない）。 */
  function 画像を差し替える(並, 絵) {
    if (!絵.length) return;
    var 表 = {};
    絵.forEach(function (g) { 表[g.名] = g.src; });
    (並 || []).forEach(function (q) {
      ["materials", "contentBlocks", "figures"].forEach(function (k) {
        if (!Array.isArray(q[k])) return;
        q[k] = q[k].map(function (b) {
          if (!b || typeof b !== "object") return b;
          var v = String(b.src || b.url || b.image || "");
          if (!v) return b;
          if (/^data:image\//.test(v) || /^\/api\/media\//.test(v)) return b;
          var 当 = 表[v] || 表[v.replace(/\s/g, "")];
          if (当) return Object.assign({}, b, { type: b.type || "figure", src: 当, url: undefined });
          /* 知らない 住所は **図ごと 落とす**（白い 四角を 出さない）。 */
          return null;
        }).filter(Boolean);
      });
    });
  }

  /* ══ 資料を **文字で** 渡す（2026-08-30・訴え「マジで遅い」）════════
     ★ 資料つきが 遅い 理由は 1 つ。**AI が 毎回 PDF を 読み直す**から。
       20 問の 試験は 4 回に 分けて 頼むので、14 件の PDF を 4 回 読ませる。
       1 回 1〜2 分 かかるので、全部で 5〜8 分に なる。
     ★ 画面は 添付を 入れた 時点で **本文を 取り出してある**（extractedText）。
       文字なら 読み直しが 要らず、Groq でも 作れる（実測で いちばん 速い）。
     ★ 要点に していない。**本文 そのもの**を 渡す。長ければ 回ごとに
       別の ところを 渡して、全部を 一巡 する。 */
  var 一度に渡す字数 = 40000;
  /* ★ **1 件ずつ 決める**（2026-08-30・作り直し）。
     前は「全部の 資料から 文字が 取れている ときだけ 文字で 渡す」に
     していた。1 件でも 写真だけの ページが あると **14 件 まとめて**
     そのまま 読ませる 道へ 落ち、しかも 先に 14 件 預けるので、
     押しても 何分も 何も 始まらない ように 見えていた。
     文字が 取れている ものは 文字で、取れていない ものだけ ファイルで 渡す。 */
  /* ★ 「文字が 取れている」の 見かた（2026-08-30）。
     長さだけで 決めると 危ない。**21 ページで 2 千字**の PDF は、
     ほとんどが 写真の ページで、見出しだけが 取れている。
     それを 文字で 渡すと「資料を 付けたのに 中身が 無い」に なる。
       ・絵にした ページ（pageImages）が ある → 写真の 資料。ファイルで 渡す
       ・読み取れなかった ページ（ocr）が 半分 以上 → 同じく ファイルで
       ・1 ページ あたり 100 字 未満 → 中身が 薄い。ファイルで */
  function 本文(f) {
    if (!f) return "";
    var a = String(f.extractedText || "").trim();
    var b = String(f.ocrText || "").trim();
    if (a && b) return a + "\n\n" + b;
    return a || b;
  }
  function 文字で足りるか(f) {
    if (!f) return false;
    /* ★ **1 回 読み取った ものは 文字で 渡す**（2026-08-30・訴え
       「ありえんくらい 作成が 遅い」）。
       絵の ページを 毎回 送り直すより、1 回 文字に した ほうが
       速いだけでなく **中身も 同じ**（同じ 絵を 同じ AI が 読む）。
       ページ数で 割った 濃さは ここでは 見ない。読み取れた ページが
       資料の 一部でも、それが いま 手元に ある 全部だから。 */
    if (String(f.ocrText || "").trim().length > 200) return true;
    var t = String(f.extractedText || "").trim();
    if (t.length < 200) return false;
    if ((f.pageImages || []).length) return false;
    var 頁 = Number(f.pageCount) || 0;
    if (頁 && Number(f.ocr) >= 頁 / 2) return false;
    /* 実測（2026-08-30）: 本物の 共通テスト（情報Ⅰ・21 ページ）を 読み取ると
       **2,411 字**しか 取れない（1 ページ 115 字）。ほとんどが 図と 写真で、
       見出しだけが 文字に なっている。これを 文字で 渡すと
       「資料を 付けたのに 中身が 無い」に なる。
       本物の 文字の ページは 1 ページ 600〜1,500 字。400 字で 線を 引く。 */
    if (頁 && t.length / 頁 < 400) return false;
    return true;
  }
  function 文字の資料() { return st.資料.filter(文字で足りるか); }
  function 生の資料() { return st.資料.filter(function (f) { return !文字で足りるか(f); }); }
  /* ══ 資料を 分ける（2026-09-03・訴え）════════════════════════════
     訴え「PDF から 均等に 出題されず、同じ 箇所が 永遠に 出題される」

     真因: 分けかたが **大きさだけ**だった。40,000 字に 収まる 資料は
       いつも 1 つの かたまりに なり、どの 回にも **まったく 同じ 文**が
       渡っていた。AI は 渡された 文の 頭から 作るので、
       何回 頼んでも 同じ ところが 出る。

     ★ **回数ぶんに 割る。** 1 回ごとに 資料の 別の ところを 渡す。
       これで 資料の 端から 端まで 一巡する。
     ★ 割る ところは 段落の 切れ目（文の 途中で 切らない）。
     ★ 大きさの 上限（一度に渡す字数）も これまでどおり 守る。 */
  var 分ける最大 = 24;
  function 段落で切る(全, 数) {
    if (数 <= 1) return [全];
    var 幅 = Math.ceil(全.length / 数);
    var 出 = [], at = 0;
    for (var i = 0; i < 数 && at < 全.length; i++) {
      var 端 = (i === 数 - 1) ? 全.length : Math.min(全.length, at + 幅);
      if (端 < 全.length) {
        /* 幅の 前後 12% の 中で いちばん 近い 段落の 切れ目を 探す。 */
        var 余 = Math.max(200, Math.floor(幅 * 0.12));
        var 探 = 全.lastIndexOf("\n\n", 端 + 余);
        if (探 > at + 幅 - 余) 端 = 探 + 2;
      }
      出.push(全.slice(at, 端));
      at = 端;
    }
    return 出.filter(function (x) { return String(x).trim(); });
  }
  function 資料の文字(回数) {
    var 束 = [];
    文字の資料().forEach(function (f) {
      束.push("■ " + (f.name || "資料") + "\n" + 本文(f));
    });
    if (!束.length) return [];
    var 全 = 束.join("\n\n");
    /* 大きさで 決まる 最小の 数（1 回に 渡せる 字数を 超えない）。 */
    var 大きさ由来 = Math.max(1, Math.ceil(全.length / 一度に渡す字数));
    /* 回数ぶん（＝毎回 別の ところを 渡す）。回数が 分からない ときは 4。 */
    var 回由来 = Math.max(1, Math.min(分ける最大, Number(回数) || 4));
    var 数 = Math.min(分ける最大, Math.max(大きさ由来, 回由来));
    /* 1 つが 短すぎると 手がかりが 足りない。1,200 字は 残す。 */
    while (数 > 1 && 全.length / 数 < 1200) 数--;
    return 段落で切る(全, 数);
  }
  /* 文字で 渡せるか。**全部の 資料から 本文が 取れている**ときだけ。
     1 つでも 写真だけの ページが あると、その 資料は 読まれないので
     そのまま 読ませる 道へ 行く。 */
  /* 文字で 渡す ものが 1 件でも あるか。「そのまま」を 選んだら 使わない。 */
  function 文字で渡せるか() {
    if (!st.資料.length) return false;
    if (st.条件 && st.条件.資料の渡し === "そのまま") return false;
    return 文字の資料().length > 0;
  }
  /* ファイルとして 渡す ぶん（文字の 取れなかった もの）。 */
  function ファイルで渡すぶん() {
    if (!st.資料.length) return [];
    if (st.条件 && st.条件.資料の渡し === "そのまま") return st.資料.slice();
    return 生の資料();
  }

  /* ══ 資料は **1 回だけ** 読む（2026-08-30・訴え）════════════════════
     訴え「115MB の ファイルを 添付して 作らせたら、ありえんくらい 作成が
           遅い。プリセット AI とか Lumi の スキャンは もっと 早かった」

     ★ **遅い 理由は 1 つ。同じ 資料を 何回も 読ませていた。**
       20 問の 試験は 4 回に 分けて 頼む。文字の 入っていない PDF は
       ページを 絵に して 送るので、24MB の 絵を **4 回** 送り、
       向こうも **4 回** 同じ 絵を 読み直していた（合わせて 約 100MB）。
       プリセット AI が 速いのは 1 回しか 頼まないから。
     ★ Lumi の スキャン（/api/scan/read）は 同じ 絵を **1.5 秒**で 文字に する。
       先に 1 回 文字に して しまえば、あとは 文字だけで 作れる。
       送るのは 数十 KB。同時に 3 本 走らせられる。
     ★ 読み取った 文字は **要点では ない。書いてある ことを そのまま**。
       図・表は〔図: …〕と 1 行 書き添えさせる（消さない）。
     ★ 図そのものを 読ませたい ときは 「そのまま 読ませる」を 選ぶ。
       そちらは これまでどおり 絵を 送る（遅いが 図が 見える）。 */
  /* ★ 速さ（2026-09-03・訴え「PDF・スキャン画像の 読み取りが まだ 遅い」）。
     ・1 回に 送る ページを **向こうの 上限（8）まで** 使う。
       4 → 8 で 呼ぶ 回数が **半分**。1 回の 待ち時間は ほぼ 変わらない。
     ・同時に 走らせる 本数を 3 → 6。
     ・**資料ごとに 順番に** 読んでいたのを やめ、全部の ページを
       1 本の 列に して 走らせる（14 件 あると 前は 14 回 直列だった）。 */
  var OCR一度に = 8;        /* 1 回に 送る ページ数（向こうの 上限も 8） */
  var OCR同時 = 6;          /* 同時に 走らせる 本数 */
  var OCR長辺 = 1600;       /* 送る 前に 縮める 長辺（文字は これで 読める） */

  function 読み取る資料() {
    return st.資料.filter(function (f) {
      return (f.pageImages || []).length && !String(f.ocrText || "").trim();
    });
  }
  /* 送る 前に 縮める。2048px の まま 送ると 1 枚 2MB。1600px で 十分 読める。 */
  function 縮める(dataUrl) {
    return new Promise(function (done) {
      try {
        var im = new Image();
        im.onload = function () {
          try {
            var w = im.naturalWidth || im.width, h = im.naturalHeight || im.height;
            var s = Math.min(1, OCR長辺 / Math.max(w, h));
            if (s >= 1 && dataUrl.length < 700000) { done(dataUrl); return; }
            var cv = doc.createElement("canvas");
            cv.width = Math.max(1, Math.round(w * s));
            cv.height = Math.max(1, Math.round(h * s));
            var cx = cv.getContext("2d");
            cx.fillStyle = "#fff"; cx.fillRect(0, 0, cv.width, cv.height);
            cx.drawImage(im, 0, 0, cv.width, cv.height);
            done(cv.toDataURL("image/jpeg", 0.72));
          } catch (e) { done(dataUrl); }
        };
        im.onerror = function () { done(dataUrl); };
        im.src = dataUrl;
      } catch (e) { done(dataUrl); }
    });
  }
  function 一束読む(名, 束) {
    var 番 = 束.map(function (b) { return b.p; }).filter(Boolean);
    var 前 = "これは「" + 名 + "」の "
      + (番.length ?番.join("・") + " ページ目" : "ページ") + "です。\n"
      + "ページごとに 【p.番号】 と 見出しを 付けて、その ページの 文字を"
      + " **そのまま** 書き起こしてください。\n"
      + "図・表・グラフは 消さずに 〔図: 何が 描かれているか〕〔表: 何の 表か・数値〕"
      + " と 書き添えてください。\n"
      + "要約しないでください。読めない ところは 〔読めません〕と 書きます。";
    return window.fetch(apiBase() + "/api/scan/read", {
      method: "POST", headers: 頭(),
      body: JSON.stringify({ task: "ocr", prompt: 前,
                             images: 束.map(function (b) { return b.u; }) })
    }).then(function (r) { return r.json(); }).then(function (j) {
      return (j && j.ok && j.text) ? String(j.text) : "";
    }).catch(function () { return ""; });
  }
  /* 全部 読む。**読めなかった ぶんは 黙って 進まない**（数で 言う）。 */
  function 絵を文字にする(進む) {
    var 並 = 読み取る資料();
    if (!並.length) return Promise.resolve(0);
    var 全 = 並.reduce(function (n, f) { return n + f.pageImages.length; }, 0);
    var 済 = 0;
    function 知らせる() { try { 進む(済, 全); } catch (e) {} }
    知らせる();
    /* ★ **全部の 資料の ページを 1 本の 列に する**（2026-09-03）。
       前は 資料ごとに 直列だったので、14 件 あると 6 本 同時に 走らせても
       1 件ずつしか 進まなかった（＝実質 1 件ぶんの 速さ）。 */
    return Promise.all(並.map(function (f) {
      return Promise.all(f.pageImages.map(function (pi) {
        return 縮める(String(pi.dataUrl || "")).then(function (u) {
          return { p: pi.pageNumber || 0, u: u };
        });
      })).then(function (絵) { return { f: f, 絵: 絵 }; });
    })).then(function (ら) {
      var 仕事 = [];
      ら.forEach(function (x) {
        for (var i = 0; i < x.絵.length; i += OCR一度に) {
          仕事.push({ f: x.f, 束: x.絵.slice(i, i + OCR一度に), 順: 仕事.length });
        }
        x.出 = [];
        x.枚 = x.絵.length;
      });
      /* 資料ごとの 入れ物（返ってきた 順が ばらけても 並びを 保つ） */
      var 表 = new Map();
      ら.forEach(function (x) { 表.set(x.f, { x: x, 片: [] }); });
      var 次 = 0;
      function 走る() {
        if (次 >= 仕事.length) return Promise.resolve();
        var w = 仕事[次++];
        return 一束読む(w.f.name || "資料", w.束).then(function (t) {
          var box = 表.get(w.f);
          if (box) box.片.push({ 順: w.順, t: t });
          済 += w.束.length;
          知らせる();
          return 走る();
        });
      }
      var 本 = [];
      for (var j = 0; j < Math.min(OCR同時, 仕事.length); j++) 本.push(走る());
      return Promise.all(本).then(function () {
        ら.forEach(function (x) {
          var box = 表.get(x.f);
          var t = (box ? box.片 : []).sort(function (a, b) { return a.順 - b.順; })
            .map(function (p) { return p.t; }).filter(Boolean).join("\n\n").trim();
          x.f.ocrText = t;
          x.f.ocr頁 = t ? x.枚 : 0;
        });
        return 並.reduce(function (n, f) { return n + (f.ocr頁 || 0); }, 0);
      });
    });
  }

  /* ══ 外から 画像を 持ってくる（2026-08-30・訴え）════════════════
     訴え「AI が 外部から 画像を 持ってきて、画像資料として 出題できる
           ものも 作ったり」

     ★ AI が 出すのは **探す 言葉**（imageQuery）だけ。住所は 書かせない。
       取ってくるのは サーバ（Wikimedia Commons・許諾の 読める ものだけ）。
     ★ 取れなかった 図は **落とす**（白い 四角を 出さない）。
     ★ 出典・作者・許諾は 必ず 図に 添える（credit）。 */
  function 外の画像を入れる(並) {
    var 語 = [], 場所 = [];
    (並 || []).forEach(function (q) {
      ["materials", "contentBlocks", "figures"].forEach(function (k) {
        if (!Array.isArray(q[k])) return;
        q[k].forEach(function (b, i) {
          if (!b || typeof b !== "object") return;
          var t = String(b.imageQuery || "").trim();
          if (!t || b.src) return;
          if (語.indexOf(t) < 0) 語.push(t);
          場所.push({ q: q, k: k, i: i, 語: t });
        });
      });
    });
    if (!場所.length) return Promise.resolve(0);
    var V = VQ2(), A = V && V.aigen;
    var 頭 = {};
    try { 頭 = (A && A.authHeader) ? A.authHeader() : null; } catch (e) { 頭 = null; }
    var base = "";
    try { base = (A && A.apiBase) ? A.apiBase() : (window.API_BASE || ""); } catch (e) { base = ""; }
    try {
      var tok = window.localStorage.getItem("app.auth.token.v1");
      if (tok) 頭 = { Authorization: "Bearer " + tok };
    } catch (e) {}
    if (!頭) return Promise.resolve(0);
    記す("note", "資料の 画像を 外から 探しています（" + 語.length + " 件）。"
      + "取り先は Wikimedia Commons、許諾の 読める ものだけです。");
    return window.fetch((base || "") + "/api/exam/image", {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json" }, 頭),
      body: JSON.stringify({ queries: 語.slice(0, 4) })
    }).then(function (r) { return r.json(); }).then(function (j) {
      var 表 = {};
      ((j && j.results) || []).forEach(function (x) {
        if (x && x.ok && x.image && x.image.dataUrl) 表[x.query] = x.image;
      });
      var 入 = 0, 落 = 0;
      場所.forEach(function (m) {
        var im = 表[m.語];
        var b = m.q[m.k][m.i];
        if (!im) { m.q[m.k][m.i] = null; 落++; return; }
        b.src = im.dataUrl;
        delete b.imageQuery;
        b.credit = { author: im.author || "", license: im.license || "",
                     page: im.page || "", source: im.source || "Wikimedia Commons" };
        if (!b.caption && im.title) b.caption = im.title;
        入++;
      });
      /* 取れなかった ぶんの 穴を 詰める。 */
      (並 || []).forEach(function (q) {
        ["materials", "contentBlocks", "figures"].forEach(function (k) {
          if (Array.isArray(q[k])) q[k] = q[k].filter(Boolean);
        });
      });
      記す(入 ? "done" : "warn", "画像 " + 入 + " 枚を 入れました"
        + (落 ? "（" + 落 + " 枚は 取れなかったので 外しました）" : "") + "。");
      return 入;
    }, function (e) {
      記す("warn", "画像を 探せませんでした：" + String((e && e.message) || e).slice(0, 80));
      (並 || []).forEach(function (q) {
        ["materials", "contentBlocks", "figures"].forEach(function (k) {
          if (Array.isArray(q[k])) q[k] = q[k].filter(function (b) { return !(b && b.imageQuery && !b.src); });
        });
      });
      return 0;
    });
  }

  /* ══ 送れる形に する ═══════════════════════════════════════════
     ★ **プリセット作成と 同じ 1 か所**（VQ2.aigen.filesToPayload）を 通す。
       9MB までは そのまま／それより 大きく 文字が 取れているものは 文字で／
       スキャンは ページの 絵で／どれでも 通らない ものは **理由を 言って 断る**。
       ここを 自前で 書くと、その 判断が また ずれる。 */
  function 資料を送れる形に(onUpload) {
    if (!st.資料.length) return Promise.resolve({ files: [], 文: "" });
    /* ★ ファイルとして 渡す ぶんだけ 通す。文字で 渡す ものは 送らない
       （預けも しない）。ここが「押しても 始まらない」の 直し。 */
    var 生 = ファイルで渡すぶん();
    if (!生.length) return Promise.resolve({ files: [], 文: "" });
    var V = VQ2(), A = V && V.aigen;
    var 自前 = 生.filter(function (f) { return f.data; });
    if (自前.length === 生.length || !A || !A.filesToPayload) {
      return Promise.resolve({
        files: 生.map(function (f) { return { mimeType: f.mimeType, data: f.data }; })
          .filter(function (x) { return x.data; }),
        文: ""
      });
    }
    return Promise.resolve(A.filesToPayload(生, { onUpload: onUpload })).then(function (files) {
      var 文 = "";
      try { 文 = A.bigDocText ? String(A.bigDocText(生) || "") : ""; } catch (e) { 文 = ""; }
      return { files: files || [], 文: 文 };
    });
  }

  function 数欄(名, key, v, 小, 大) {
    return '<div class="row"><label for="vm-' + esc(key) + '">' + esc(名) + "</label>"
      + '<input id="vm-' + esc(key) + '" type="number" inputmode="numeric" data-n="' + esc(key)
      + '" min="' + 小 + '" max="' + 大 + '" value="' + esc(v) + '"></div>';
  }
  function 選び欄(名, key, v, 並) {
    return '<div class="row"><label for="vm-' + esc(key) + '">' + esc(名) + "</label>"
      + '<select id="vm-' + esc(key) + '" data-s="' + esc(key) + '">'
      + 並.map(function (o) {
          return '<option value="' + esc(o.id) + '"' + (o.id === v ? " selected" : "") + ">"
            + esc(o.label) + "</option>";
        }).join("")
      + "</select></div>";
  }

  /* 表紙の 下書き。**入れたものだけ**を 出す（空の枠を 見せない）。 */
  function 下書き() {
    var c = st.表紙;
    var 行 = (c.注意は自動 === false ? (c.instructions || []) : 注意を書く(c, st.条件, null))
      .filter(function (x) { return String(x).trim(); });
    var h = '<div class="prev">';
    h += '<div class="pt">' + esc(c.examName || "（試験の名前）") + "</div>";
    if (c.subject) h += '<div class="ps">' + esc(c.subject) + "</div>";
    var m = [];
    if (c.examDate) m.push("実施日 " + c.examDate);
    m.push("試験時間・満点は 次の 段で 決めます");
    h += '<div class="pm">' + m.map(esc).join("</div><div class=\"pm\">") + "</div>";
    if (行.length) {
      h += "<ol>";
      行.slice(0, 9).forEach(function (t) { h += "<li>" + esc(t) + "</li>"; });
      h += "</ol>";
      if (行.length > 9) h += '<div class="pm">ほか ' + (行.length - 9) + " 行</div>";
    }
    h += '<div class="pf">';
    (c.studentFields || []).forEach(function (f) { h += "<b>" + esc(f) + "</b><span></span>"; });
    h += "</div>";
    if (c.sealNote) h += '<div class="ps">開始の指示があるまで開かないこと</div>';
    return h + "</div>";
  }

  /* ── 押されたとき ─────────────────────────────────────────── */
  function つなぐ() {
    root.addEventListener("click", function (e) {
      var el = e.target;
      while (el && el !== root && !(el.dataset && el.dataset.a)) el = el.parentNode;
      if (!el || el === root) return;
      var a = el.dataset.a;
      if (a === "bd" || a === "close") { 閉じる(); return; }
      if (a === "preset") { プリセットへ(); return; }
      if (a === "exam") { st.err = ""; 開く("表紙"); return; }
      if (a === "back") { st.err = ""; 開く("選ぶ"); return; }
      if (a === "sf") {
        var v = el.dataset.v, list = st.表紙.studentFields || [];
        var i = list.indexOf(v);
        if (i >= 0) list.splice(i, 1); else list.push(v);
        st.表紙.studentFields = list;
        描く();
        return;
      }
      /* 注意事項。おまかせ ⇄ 自分で 書く。
         ★ 自分で 書くに した ときは、**いまの 下書きを 入れて 渡す**。
           空の 欄を 出すと、そこから 書き始める ことに なる。 */
      if (a === "notes-auto") { st.表紙.注意は自動 = true; 描く(); return; }
      if (a === "notes-mine") {
        if (st.表紙.注意は自動 !== false && !(st.表紙.instructions || []).length) {
          st.表紙.instructions = 注意を書く(st.表紙, st.条件, null);
        }
        st.表紙.注意は自動 = false;
        描く();
        return;
      }
      if (a === "go") { 条件へ(); return; }
      if (a === "back-cover") { st.err = ""; 開く("表紙"); return; }
      if (a === "pass") {
        st.条件.資料の渡し = el.dataset.v;
        描く();
        return;
      }
      if (a === "kind") {
        var k = 型.filter(function (x) { return x.id === el.dataset.v; })[0];
        st.条件.kind = el.dataset.v;
        if (k && k.apply) {
          st.条件.durationMinutes = k.apply.durationMinutes;
          st.条件.totalPoints = k.apply.totalPoints;
          st.条件.sectionCount = k.apply.sectionCount;
          st.条件.questionCount = k.apply.questionCount;
        }
        描く();
        return;
      }
      if (a === "diff") { st.条件.difficulty = el.dataset.v; 描く(); return; }
      if (a === "sec-add" || a === "sec-del") {
        if (!st.範囲) return;
        if (a === "sec-add" && st.範囲.length < 12) {
          st.範囲.push({ title: "大問 " + (st.範囲.length + 1), field: "", where: "", count: 4 });
        } else if (a === "sec-del" && st.範囲.length > 1) {
          st.範囲.splice(parseInt(el.dataset.i, 10), 1);
        }
        描く(); return;
      }
      if (a === "mat") { st.条件.materials = !st.条件.materials; 描く(); return; }
      if (a === "type") {
        var id = el.dataset.v;
        st.条件.types[id] = !st.条件.types[id];
        /* **全部 外させない**（0 種類だと 何も 作れない）。 */
        var 残 = 形式.filter(function (x) { return st.条件.types[x.id]; }).length;
        if (!残) { st.条件.types[id] = true; st.err = "形式は 1 つ以上 選んでください。"; }
        else st.err = "";
        描く();
        return;
      }
      if (a === "help") {
        try {
          if (window.__vqHelp) { window.__vqHelp.open({ id: el.dataset.v || "what-is" }); return; }
        } catch (eH) {}
        return;
      }
      if (a === "addfile") { 資料を選ぶ(); return; }
      if (a === "scanfile") { スキャンして足す(); return; }
      if (a === "rmfile") {
        var idx = parseInt(el.dataset.v, 10);
        if (idx >= 0) {
          var 抜 = st.資料.splice(idx, 1)[0];
          /* 読取器の 一覧からも 消す。残すと Quick Chat 側にも 出てしまう。 */
          try {
            var F0 = 読取器();
            if (F0 && F0.remove && 抜 && 抜.id) F0.remove(抜.id);
          } catch (e0) {}
        }
        st.err = "";
        描く();
        return;
      }
      if (a === "run") { 作りに行く(); return; }
      if (a === "back-cond") { st.err = ""; 開く("条件"); return; }
      if (a === "back-plan") { st.err = ""; 開く("構成案"); return; }
      if (a === "back-check") { st.err = ""; 開く("確認"); return; }
      if (a === "gen") { 生成する(); return; }
      if (a === "regen") { st.err = ""; 開く("構成案"); return; }
      if (a === "refill") { 生成する({ refill: true }); return; }
      if (a === "stop") { st.止めたい = true; 記す("note", "止めています…"); 描く(); return; }
      if (a === "save") { 保存する(); return; }
      if (a === "paper") { st.err = ""; 開く("紙面"); return; }
      if (a === "print-q" || a === "print-a" || a === "print-k") { 紙面を出す(a); return; }
      if (a === "pdf-q" || a === "pdf-a") { 組版で出す(a === "pdf-a"); return; }
      /* ★ ここは 長いあいだ **死んでいた**（2026-08-30 に 気づいた）。
         合図が "exam" で、選ぶ画面の「試験」の 札と 同じだった。
         上の `if (a === "exam") { …表紙を 開く… return; }` で 必ず 止まるので、
         受験の ボタンを 押しても ここへ 来ない ＝ **CBT に 一度も 行けなかった**
         （訴え「CBT に ならない。試験モードに ならない」）。
         合図を 分けた。同じ 名前を 2 つの 意味で 使わない。 */
      if (a === "take-exam") { 受験する(); return; }
      if (a === "readlayout") { 紙面を読み取る(); return; }
    });
    root.addEventListener("change", function (e) {
      var t = e.target;
      if (t && t.dataset && t.dataset.s) { st.条件[t.dataset.s] = String(t.value || ""); return; }
    });
    root.addEventListener("input", function (e) {
      var t = e.target;
      /* ★ 構成案を 直す（2026-08-31・訴え「ユーザーでも 詳しく 調整できる ように」）。
         **打っている 最中に 描き直さない**（入力欄が 作り直されて 打てなく なる）。 */
      if (t && t.dataset && t.dataset.a && /^sec-[tnw]$/.test(t.dataset.a)) {
        var i = parseInt(t.dataset.i, 10);
        if (!st.範囲 || !st.範囲[i]) return;
        if (t.dataset.a === "sec-t") { st.範囲[i].title = String(t.value || ""); st.範囲[i].field = st.範囲[i].title; }
        else if (t.dataset.a === "sec-w") st.範囲[i].where = String(t.value || "");
        else {
          var n2 = parseInt(t.value, 10);
          st.範囲[i].count = isFinite(n2) && n2 >= 0 ? Math.min(40, n2) : 0;
          /* 合計だけ 書き換える（欄は 触らない）。 */
          var 合 = st.範囲.reduce(function (a2, x) { return a2 + (parseInt(x.count, 10) || 0); }, 0);
          var box2 = root.querySelector(".secs");
          var p3 = box2 && box2.nextElementSibling;
          if (p3 && p3.classList.contains("hint")) {
            var b2 = p3.querySelector("b");
            if (b2) b2.textContent = String(合);
          }
        }
        return;
      }
      if (t && t.dataset && t.dataset.n) {
        var v = parseInt(t.value, 10);
        if (!isFinite(v)) v = 0;
        var 小 = parseInt(t.getAttribute("min"), 10), 大 = parseInt(t.getAttribute("max"), 10);
        if (isFinite(小) && v < 小) v = 小;
        if (isFinite(大) && v > 大) v = 大;
        st.条件[t.dataset.n] = v;
        /* 数を 打っている 最中に 型の 札を 光らせ直さない（打ちにくく なる）。 */
        st.条件.kind = "custom";
        return;
      }
      if (!t || !t.dataset || !t.dataset.f) return;
      var f = t.dataset.f;
      /* ★ **どちらの 持ちものかを 欄が 名乗る**（2026-09-01・訴え
         「設定してたのが リセットされちゃう」）。
         「ほかに 伝えること」は 条件（st.条件.instruction）から 描いて いるのに、
         打った ものは **表紙**（st.表紙.instruction）へ 書いて いた。
         書き先と 読み元が 違うので、描き直すたびに **打った ものが 消えて いた**。
         名乗らせて おけば、欄を 増やしても 同じ 間違いに ならない。 */
      if (t.dataset.o === "cond") {
        st.条件[f] = String(t.value || "");
        return;
      }
      if (f === "instructions") {
        st.表紙.instructions = String(t.value || "").split("\n")
          .map(function (x) { return x.trim(); }).filter(Boolean).slice(0, 12);
      } else {
        st.表紙[f] = String(t.value || "");
      }
      /* 下書きだけ 描き直す（打っている 途中に 入力欄を 作り直さない）。 */
      var p = root.querySelector(".prev");
      if (p) p.outerHTML = 下書き();
    });
  }

  /* ── 渡す先 ───────────────────────────────────────────────── */
  function VQ2() { try { return window.VQ2 || null; } catch (e) { return null; } }

  function プリセットへ() {
    var V = VQ2();
    if (!V || !V.presetStudio || !V.presetStudio.open) {
      st.err = "まだ 準備が できていません。少し 待ってから もう一度 押してください。";
      描く();
      return;
    }
    閉じる();
    try { V.presetStudio.open({}); } catch (e) {}
  }

  /* 表紙 → 条件 へ。名前だけは 必ず 要る（表紙の 見出しに なる）。 */
  function 条件へ() {
    var c = st.表紙;
    if (!String(c.examName || "").trim()) {
      st.err = "試験の 名前を 入れてください。表紙の 見出しに なります。";
      描く();
      return;
    }
    /* 教科は 条件でも 使うので、ここで そろえておく。 */
    st.err = "";
    開く("条件");
  }

  function 表紙を固める() {
    var c = st.表紙;
    return {
      examName: String(c.examName).trim(),
      subject: String(c.subject || "").trim(),
      examDate: String(c.examDate || "").trim(),
      注意は自動: c.注意は自動 !== false,
      instructions: (c.注意は自動 === false ? (c.instructions || []) : 注意を書く(c, st.条件, null))
        .filter(function (x) { return String(x).trim(); }),
      studentFields: (c.studentFields || []).slice(0, 6),
      sealNote: c.sealNote !== false
    };
  }

  /* ══ 条件を 持って 作りに 行く ═════════════════════════════════════
     ★ ここから先（構成案・生成・検証・紙面・受験）は **作業場**が やる。
       作業場は Quick Mock の 仕組みを そのまま 使う。作り直すと
       作りかけの 保存・巡回・資料の 受け渡し・台帳が 落ちるため。
     ★ **決めたことは 全部 持って行く。** 向こうで もう一度 聞かせない。 */
  /* ══ ③ → ④ 枠を 決める ═══════════════════════════════════════════
     ★ 枠（どの 大問に 何を 何問）は **コードが 決める**（MC.plan）。
       AI に 決めさせない。だから 頼んだ数と 満点が 必ず 合う。 */
  function 作りに行く() {
    var c = st.条件;
    var 選 = 形式.filter(function (x) { return c.types[x.id]; }).length;
    if (!選) { st.err = "形式は 1 つ以上 選んでください。"; 描く(); return; }
    var V = VQ2();
    var MC = V && V.mockCompiler;
    if (!MC || !MC.plan) {
      st.err = "問題を 作る 部品が まだ 読み込まれていません。少し 待ってから もう一度 押してください。";
      描く();
      return;
    }
    var 表紙 = 表紙を固める();
    var p2;
    try {
      /* ★ 毎回 出題の 傾向が 変わるように、枠の 種を 作る（2026-08-30・訴え
         「毎回 おんなじ 出題傾向に なってる 気がする」）。
         枠（どの 形式を どこに）は この 種で 決まる。
         **同じ 種なら 同じ 並び**なので、作り直しても 形は 変わらない。 */
      st.枠の種 = "vqmk-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
      p2 = MC.plan({
        seed: st.枠の種,
        title: 表紙.examName, subject: 表紙.subject,
        durationMinutes: c.durationMinutes, totalPoints: c.totalPoints,
        sectionCount: c.sectionCount, questionCount: c.questionCount,
        types: c.types, difficulty: c.difficulty,
        allowExternalKnowledge: st.資料.length === 0,
        requireSources: st.資料.length > 0
      });
    } catch (e) {
      st.err = "この条件では 枠を 作れませんでした：" + String((e && e.message) || e).slice(0, 120);
      描く();
      return;
    }
    var 重 = (p2.issues || []).filter(function (i) { return i.severity === "high"; });
    st.枠 = p2;
    /* ★ 条件から 枠を 作り直したら、前の 直しは **捨てる**
       （大問の 数が 変わって いる ことが ある）。 */
    st.範囲 = null;
    st.err = 重.length ? 重[0].message : "";
    開く("構成案");
  }

  /* 人が 構成案で 直した 大問（題・問数・出題範囲）を、サーバの 形へ。
     ★ 何も 触って いなければ **送らない**（サーバが 自分で 決める）。 */
  /* ★ **その 頼みが 作る 大問だけ**を 送る（2026-09-05）。
     1 回の 頼みは requestsOf が 大問ごとに 刻んで いるので、
     **中身は いつも 1 つの 大問ぶん**（多くて 5 問）。
     なのに 大問 12 の 試験では 毎回 12 大問ぶんを 送って いた。
     サーバは 送られた 数だけ 割ろうと するので、
       ・4 問を 12 大問へ 配る という 無駄な 割り算が 走る
       ・呼び出しの 予算（天井 20）が 大問の 数で 割られ、
         その 頼みが 実際に 作る 大問へ 回る ぶんが 減る
     手がかりを 渡された ときは その 1 つだけに する。
     渡されなければ これまでどおり 全部（構成案の 下見などで 使う）。

     ★ **番号だけで 引かない**。plan の 大問番号（sec.number）は
       *問題が 0 の 大問を 落としてから* 1 から 振り直される
       （vq2-app の 「番号と回答欄を振り直す」）。
       こちらの st.範囲 は 人が 並べた まま なので、
       途中に 問題 0 の 大問が あると **1 つ ずれて 別の 大問**を 指す。
       題（sectionTitle）で 突き合わせ、**ただ 1 つに 決まる ときだけ**使う。 */
  function 出題範囲(手がかり) {
    var e = st.範囲;
    if (!e || !e.length) return undefined;
    var 全 = e.map(function (x, i) {
      return {
        title: String(x.title || ("大問 " + (i + 1))).slice(0, 80),
        field: String(x.field || x.title || "").slice(0, 40),
        where: String(x.where || "").slice(0, 60),
        count: Math.max(0, parseInt(x.count, 10) || 0)
      };
    });
    var 中身あり = function (x) { return x.title || x.where; };
    var 出 = 全.filter(中身あり);
    /* 1 つも 中身が 無ければ 送らない。 */
    var 意味 = 出.some(function (x) { return x.where || x.count > 0; });
    if (!意味) return undefined;
    if (!手がかり) return 出;
    /* ① 題で 突き合わせる。**ただ 1 つに 決まる ときだけ**。
       同じ 題の 大問が 2 つ あれば どちらか 分からないので 使わない。 */
    var 題 = String(手がかり.title || "").trim();
    if (題) {
      var 当 = 全.filter(function (x) { return String(x.title || "").trim() === 題; });
      if (当.length === 1 && 中身あり(当[0])) return [当[0]];
    }
    /* ② 題で 決まらない ときだけ 番号。**絞る 前の 並び**で 引く。
       ここも ずれる ことが ある ので、題が 空の ときの 保険に とどめる。 */
    var n = parseInt(手がかり.number, 10);
    if (!題 && n >= 1 && n <= 全.length && 中身あり(全[n - 1])) return [全[n - 1]];
    return 出;
  }

  /* ══ ④ → ⑤ 実際に 作る ═══════════════════════════════════════════
     ★ 生成そのものは **サーバ（Groq / Gemini）**。この端末では 作らない。
     ★ 枠に 入らなかったものは 捨てる（MR.run の gate）。水増ししない。 */
  /* ══ ログは 日本語で 出す（2026-08-30・訴え「ログを日本語にできる？」）
     いままでは 中の 合図（HTTP 503 / NOT_SIGNED_IN / cancelled …）が
     そのまま 並んでいた。読んでも 何を すれば よいか 分からない。
     ここで 日本語へ 直す。**分からない ものは 消さずに 添える**。 */
  var ことば = [
    [/^HTTP 401$|NOT_SIGNED_IN|UNAUTHORIZED/i, "ログインが 切れています。入り直してから もう一度 お試しください。"],
    [/^HTTP 413$|TOO_LARGE|FILES_TOO_LARGE/i, "資料が 大きすぎて 送れませんでした。件数を 減らすか、ページを 分けてください。"],
    [/^HTTP 429$|RATE|quota|使い切/i, "今日ぶんの 上限に 当たりました。しばらく 待つと また 作れます。"],
    [/^HTTP 5\d\d$|INTERNAL|GENERATE_FAILED/i, "クラウドが 返事を 返しませんでした。少し 待って もう一度 お試しください。"],
    [/^HTTP 503$|NO_DOC_AI/i, "いま 資料を 読める AI に つながりません。少し 待って もう一度 お試しください。"],
    [/UPLOAD_FAILED|UPLOAD_NOT_READY/i, "資料を 預けられませんでした。もう一度 お試しください。"],
    [/BIG_NO_TEXT/i, "その 資料は 大きくて 文字も 入っていません（写真だけの ページ）。ページを 分けてください。"],
    [/FILES_UNAVAILABLE/i, "添付した 資料の 中身を 取り出せませんでした。選び直してください。"],
    [/cancelled|aborted/i, "止めました。"],
    [/BLOCKED/i, "いまは 作れませんでした。しばらく 待ってから お試しください。"],
    [/Failed to fetch|NetworkError|Load failed/i, "つながりませんでした。電波の よい ところで もう一度 お試しください。"],
    [/timeout|timed out/i, "待っても 返事が 来ませんでした。もう一度 お試しください。"]
  ];
  function 日本語に(t) {
    var s2 = String(t == null ? "" : t).trim();
    if (!s2) return "";
    /* もう 日本語なら そのまま。 */
    if (/[ぁ-んァ-ヶ一-龠]/.test(s2)) return s2;
    for (var i = 0; i < ことば.length; i++) {
      if (ことば[i][0].test(s2)) return ことば[i][1] + "（" + s2.slice(0, 60) + "）";
    }
    return "うまく いきませんでした（" + s2.slice(0, 80) + "）";
  }
  function 記す(k, t) {
    var 文 = (k === "err" || k === "warn") ? 日本語に(t) : String(t == null ? "" : t);
    if (!文) return;
    /* ★ **通し番号**を 振る（2026-09-01）。記録は 60 件で 切るので、
       「何件 出したか」では どこまで 出したかを 数えられない
       （切った 瞬間に ずれて、同じ 行が もう一度 出る）。 */
    st.記番 = (st.記番 || 0) + 1;
    st.記録.push({ i: st.記番, k: k, t: 文.slice(0, 200) });
    if (st.記録.length > 60) st.記録 = st.記録.slice(-60);
  }
  /* ══ ★ 作って いる あいだは **塗り替えるだけ**（2026-09-01・訴え）════
     訴え「試験作成 途中に、生成バーが 出るやん？ あれも チカチカ
           更新するたびに なるから 修正を」

     進みは 1 秒に 何度も 来る。そのたび 描く() で 窓を **まるごと
     作り直して いた**ので、帯も 記録も 毎回 生まれ直して 点滅していた。
     ★ 出来上がって いる ところは 触らず、**変わった 字と 幅だけ** 塗る。
     ★ 形が 変わる とき（ボタンの 入れ替え・断りの 出入り・別の 画面）は
       これまでどおり 建て直す。塗り替えで 無理に 直すと ずれる。 */
  function 進みを塗る() {
    var box = root && root.querySelector("[data-box]");
    var w = box && box.querySelector(".w");
    if (st.画面 !== "生成" || !w) { 描く(); return; }
    var bar = w.querySelector(".bar > i");
    var ft = w.querySelector(".ft");
    if (!bar || !ft) { 描く(); return; }
    /* 形が 変わる ものは 建て直す。 */
    if (ft.getAttribute("data-run") !== (st.走っている ? "1" : "0")) { 描く(); return; }
    if ((w.querySelector(".err") ? 1 : 0) !== (st.err ? 1 : 0)) { 描く(); return; }

    var pr = st.進み || { made: 0, madeTotal: 0, stage: "" };
    /* ★ **多い ほうを 出す**（2026-09-06・訴え）。
       受け取る 前でも 向こうで できて いれば、その 数を 見せる。
       0 の まま 何分も 動かないと「止まって いる」と 見える。 */
    var 出来 = Math.max(Number(pr.made) || 0, Number(st.向こう済) || 0);
    var 割 = pr.madeTotal ? Math.round((出来 / pr.madeTotal) * 100) : 0;
    var sub = w.querySelector(".hd .sub");
    if (sub) { var t1 = pr.stage || "はじめています…"; if (sub.textContent !== t1) sub.textContent = t1; }
    var 幅 = 割 + "%";
    if (bar.style.width !== 幅) bar.style.width = 幅;
    var n = w.querySelector(".barn");
    if (n) {
      var t2 = 出来 + " / " + pr.madeTotal + " 問"
        + (st.始めた ? "\u3000（" + 経った(st.始めた) + "）" : "");
      if (n.textContent !== t2) n.textContent = t2;
    }
    /* 記録は **足りない ぶんだけ 足す**（作り直さない＝点滅しない）。 */
    var log = w.querySelector(".log");
    if (log) {
      var 最後 = Number(log.getAttribute("data-last")) || 0;
      var 足す = st.記録.filter(function (r) { return (r.i || 0) > 最後; });
      for (var i = 0; i < 足す.length; i++) {
        var d = doc.createElement("div");
        d.className = "log-" + 足す[i].k;
        d.textContent = 足す[i].t;
        log.appendChild(d);
      }
      if (足す.length) {
        log.setAttribute("data-last", String(足す[足す.length - 1].i));
        while (log.children.length > 14) log.removeChild(log.firstChild);
        try { log.scrollTop = log.scrollHeight; } catch (e) {}
      }
    }
  }

  function 生成する(o) {
    o = o || {};
    var V = VQ2();
    var MC = V && V.mockCompiler, MR = V && V.mockCompilerRun, G = V && V.aigen;
    if (!MC || !MR) { st.err = "問題を 作る 部品が ありません。"; 描く(); return; }
    if (!G || !G.generateQuestions) {
      st.err = "問題を 作るには ログインが 必要です。"; 描く(); return;
    }
    var c = st.条件, 表紙 = 表紙を固める();
    var p2 = o.refill && st.結果 ? st.結果.plan : st.枠;
    if (!p2) { st.err = "構成案が ありません。"; 描く(); return; }

    st.走っている = true; st.止めたい = false; st.err = "";
    /* 教科ならではの 一言は **走りながら** 頼む（待たない）。 */
    注意をAIに足す(表紙);
    if (!o.refill) { st.記録 = []; st.結果 = null; st.spec = null; st.保存した = false; }
    st.進み = { done: 0, total: 1, made: 0, madeTotal: p2.totalQuestions, stage: "枠を 決めました" };
    st.始めた = Date.now();
    記す("step", "大問 " + p2.sections.length + " ・ 全 " + p2.totalQuestions
      + " 問の 枠を 先に 決めました（配点の 合計 " + p2.totalPoints + " 点）");
    開く("生成");

    /* ★ 資料は **走り出す 前に** 送れる形へ 直す（2026-08-30）。
       ここで 断られる（大きすぎる・中身が 取り出せない）ことが あるので、
       作り始めてから 気づくのではなく、先に 理由を 出して 止める。 */
    /* ★ **押した 瞬間に 何を しているか 出す**（2026-08-30・訴え
       「試験が 作り始まらない」）。写真の 資料は 先に 預けるので、
       ここで 1 分ほど かかる。黙っていると 固まったように 見える。 */
    /* ★ 絵の ページは **先に 1 回だけ 文字に する**（2026-08-30・訴え
       「ありえんくらい 遅い」）。ここが 速さの 芯。
       これを しないと、同じ 絵を 頼む 回数だけ（20 問なら 4 回）送り直す。 */
    var 読む件 = (c.資料の渡し === "そのまま") ? 0 : 読み取る資料().length;
    var 読む頁 = 0;
    if (読む件) {
      読む頁 = 読み取る資料().reduce(function (n, f) { return n + f.pageImages.length; }, 0);
      st.進み.stage = "資料を 読み取っています（0 / " + 読む頁 + " ページ）";
      記す("step", "文字の 入っていない 資料 " + 読む件 + " 件（" + 読む頁 + " ページ）を "
        + "**先に 1 回だけ** 読み取ります。ここで 文字に して しまえば、"
        + "あとは 何回 頼んでも 送り直しません。");
    }
    描く();
    var 読み = 読む件
      ? 絵を文字にする(function (済, 全) {
          if (st.進み) st.進み.stage = "資料を 読み取っています（" + 済 + " / " + 全 + " ページ）";
          進みを塗る();
        })
      : Promise.resolve(0);
    読み.then(function (頁) {
      if (読む件) {
        if (頁) {
          var 字 = 読み取れた字数();
          記す("note", 頁 + " ページを 読み取りました（" + Math.round(字 / 1000) + " 千字）。"
            + "ここから 先は **文字だけ**で 作ります。絵を 送り直しません。");
        } else {
          記す("warn", "資料の 絵を 読み取れませんでした。これまでどおり 絵を 送って 読ませます"
            + "（時間が かかります）。");
        }
      }
      var 預ける件 = ファイルで渡すぶん().length;
      if (預ける件) {
        st.進み.stage = "資料を 預けています（0 / " + 預ける件 + "）";
        記す("step", "写真・図の 資料 " + 預ける件 + " 件を 先に 預けます。"
          + "1 回 預ければ、あとは 何回 頼んでも 送り直しません。");
      } else if (st.資料.length) {
        st.進み.stage = "資料を 用意しています";
      }
      描く();
      return 資料を送れる形に(function (済, 全) {
        /* ★ 預けている 間も 動きを 見せる（2026-08-30）。
           14 件だと ここで 1 分近く かかるので、黙っていると
           「止まった」と 見える。 */
        if (st.進み) st.進み.stage = "資料を 預けています（" + 済 + " / " + 全 + "）";
        進みを塗る();
      });
    }).then(function (用意) {
      走らせる(o, c, 表紙, p2, MC, MR, G, 用意);
    }, function (e) {
      st.走っている = false;
      st.err = (e && e.userMessage) || (e && e.message) || "資料を 渡せませんでした。";
      記す("err", st.err);
      描く();
    });
  }
  function 読み取れた字数() {
    return st.資料.reduce(function (n, f) { return n + String(f.ocrText || "").length; }, 0);
  }

  function 走らせる(o, c, 表紙, p2, MC, MR, G, 用意) {
    var V = VQ2();
    var 依頼文 = 依頼を組む(c, 表紙, p2);
    var 資料 = (用意 && 用意.files) || [];
    /* ★ 何回に 分けて 頼むかを 先に 見積もる（2026-09-03・訴え
       「PDF から 均等に 出題されない」）。回数ぶんに 資料を 割って、
       1 回ごとに 別の ところを 渡す。1 回は だいたい 5〜8 問。 */
    var 予定問数 = 0;
    try {
      /* 人が 直した 大問（st.範囲）→ 枠（MC.plan）→ 条件、の 順に 見る。 */
      予定問数 = (st.範囲 || []).reduce(function (a, x) { return a + (parseInt(x.count, 10) || 0); }, 0);
      if (!予定問数 && p2 && Array.isArray(p2.sections)) {
        予定問数 = p2.sections.reduce(function (a, x) {
          return a + (Number(x.count) || (x.slots || []).length || (x.questions || []).length || 0);
        }, 0);
      }
    } catch (e) { 予定問数 = 0; }
    if (!予定問数) 予定問数 = Number(c && c.questionCount) || 0;
    if (!予定問数) 予定問数 = 20;
    var 見込み回数 = Math.max(2, Math.ceil(予定問数 / 6));
    var 本文の束 = 文字で渡せるか() ? 資料の文字(見込み回数) : [];
    var 文の道 = !資料.length;                 /* ファイルを 1 件も 送らない＝いちばん 速い */
    var 何回目 = 0;
    /* 大きすぎて そのままは 渡せない 資料は、**取り出した 文字**で 渡す。 */
    if (用意 && 用意.文) {
      依頼文 += "\n\n【添付した 資料の 本文】\n" + 用意.文
        + "\n★ ここに 書いてあることだけを 根拠に してください。";
    }
    /* 添付した 画像は **名前で 指させる**（住所を 書かせない）。 */
    var 絵 = 画像の資料();
    if (絵.length) {
      依頼文 += "\n\n【紙面に 貼れる 画像】\n"
        + 絵.map(function (g) { return "\u3000" + g.名 + " … " + g.name; }).join("\n")
        + "\n\u3000使うときは materials に "
        + '{"type":"figure","src":"画像1","caption":"図1 …"} と 書きます。'
        + "\n\u3000★ **ここに 無い 名前や URL を 書かないでください。** 消されます。"
        + "\n\u3000★ 要らない 問題には 貼りません。";
    }
    var 資料を言った = false;
    /* ★ **いま 向こうで 何が 起きているか**（2026-08-30・訴え
       「ここまでは 順調な ペースだったのに、いきなり 動かなくなった」）。
       これまで バーは「受け取れた 問題の 数」でしか 動かず、
       頼んでから 返るまでの 数十秒〜数分は **完全に 止まって 見えた**。
       走っている 仕事の 進みを そのまま 受けて 出す。 */
    var 向こう = {};
    function 向こうの様子() {
      var 鍵 = Object.keys(向こう);
      if (!鍵.length) return "";
      var 済 = 0, 全 = 0, 走 = 0;
      鍵.forEach(function (k) {
        var x = 向こう[k];
        済 += Number(x.made) || 0; 全 += Number(x.planned) || 0;
        if (x.status === "running" || x.status === "queued") 走++;
      });
      /* ★ 帯の 数字と そろえる ため 残す（2026-09-06・訴え）。
         画面に「向こうで 10 / 24 問」と 出ながら、その 下の 帯が
         「0 / 24 問」の ままで、どちらが 本当か 分からなかった。
         下の 帯は **受け取って 枠に 入れた 数**、こちらは
         **向こうで できた 数**。利用者には 同じ ことに 見える。 */
      st.向こう済 = 済;
      if (!全) return "";
      return "向こうで " + 済 + " / " + 全 + " 問"
        + (走 ? "（" + 走 + " 本 走っています）" : "");
    }
    /* ★ **同じ注文の 目印**。1 回の「作って」は 中で 何回にも 分けて 頼まれる。
       これが 無いと、画面を 閉じたまま 終わったとき **仕事の 数だけ
       試験が できる**（20 問なら 4 つ）。 */
    var 注文番号 = "vqmk-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    st.注文番号 = 注文番号;
    /* ★ 何件を どう 渡すのかを **数で** 言う（2026-08-30・訴え）。
       前は「資料 14 件を そのまま 渡します」と 出しながら、
       中では 8 件に 切って いた（残り 6 件は 黙って 落ちていた）。 */
    if (st.資料.length) {
      var 文数 = 文字で渡せるか() ? 文字の資料().length : 0;
      var 字 = 本文の束.reduce(function (n, x) { return n + x.length; }, 0);
      if (文数) {
        記す("note", "資料 " + 文数 + " 件は **本文の 文字**で 渡します（合わせて "
          + Math.round(字 / 1000) + " 千字"
          + (本文の束.length > 1 ? "・" + 本文の束.length + " 回に 分けて 一巡" : "") + "）。"
          + "読み直させないので、ここが いちばん 速い 道です。");
      }
      if (資料.length) {
        var 預 = 資料.filter(function (f) { return f && f.fileUri; }).length;
        var 載 = 資料.filter(function (f) { return f && f.data; }).length;
        var 言 = [];
        if (預) 言.push("預けた " + 預 + " 件");
        if (載) 言.push("そのまま 載せる " + 載 + " 件");
        記す("note", "資料 " + 資料.length + " 件は そのまま 読ませます："
          + 言.join(" ／ ") + "（図や 写真も 読めますが、時間が かかります）。");
      }
      if (!文数 && !資料.length) {
        記す("warn", "資料から 中身を 取り出せませんでした。指示だけで 作ります。");
      }
      資料を言った = true;
    }

    MR.run({
      plan: p2,
      filled: o.refill && st.結果 ? st.結果.filled : null,
      label: "vq-make",
      /* ★ 一度に 出てこない件（2026-08-30・訴え）。
         既定は 1 本ずつ・3 問ずつ。理由は **この端末の AI（Bridge）は
         枠が 2 つしかない**から。ここは クラウド（Groq / Gemini）なので
         その 制限は 効かない。20 問なら 7 往復 → 4 往復・3 本 同時。
         batchSize を 上げすぎると JSON が 途中で 切れて まるごと 落ちるので、
         5 まで（実測で 破棄 0% だった 3 の 少し上）。 */
      /* ★ 資料つきは **1 本ずつ**（2026-08-30・訴え「でかいファイルだと止まる」）。
         3 本 同時だと、同じ 資料を 読ませる 頼みが 3 つ 同時に 走る。
         預けて 軽くしても、向こうが 資料を 読む 時間は 3 倍 重なり、
         1 分あたりの 上限にも すぐ 当たる。資料が あるときは 1 本ずつ。

         ★ **預けた ものだけ なら 2 本**へ（2026-09-05・訴え
           「前まで こんな 遅く なかった」）。
           1 本ずつだと 大問 12 の 試験は 12 回 順番に 待つ ことに なり、
           サーバを いくら 速く しても 合計は 縮まない
           （本番の 実測: 8/30 は 12 ジョブ 59 秒、9/3 は 同じ 12 で 1,086 秒）。
           預けた 資料（fileUri）は **場所を 指すだけ**なので、
           何本 同時でも 送る 量は 増えない。サーバは 鍵を ずらして 使うので
           1 分あたりの 上限にも 散る。
           丸ごと 載せる（data）ものが 1 件でも あるときは、
           送る 量が 本数ぶん 増えるので **1 本の まま**。 */
      concurrency: (function () {
        if (文の道) return 3;
        if (!st.資料.length) return 3;
        var 丸ごと = 資料.some(function (f) { return f && f.data; });
        return 丸ごと ? 1 : 2;
      })(),
      batchSize: 5,
      onStage: function (name) {
        if (st.進み) st.進み.stage = 段の名(name);
        進みを塗る();
      },
      onProgress: function (pr) {
        st.進み = {
          done: (pr && pr.done) || 0,
          total: (pr && pr.total) || 1,
          made: (pr && typeof pr.filled === "number") ? pr.filled : ((pr && pr.made) || 0),
          madeTotal: (pr && pr.total2) || p2.totalQuestions,
          stage: (st.進み && st.進み.stage) || "問題を 作っています"
        };
        進みを塗る();
      },
      generate: function (req, cx) {
        if (st.止めたい) return Promise.reject(Object.assign(new Error("cancelled"), { cancelled: true }));
        /* 枠が 決めている 形式を そのまま 渡す。渡さないと 既定の 混合が 返る。 */
        var types = [], plan2 = {};
        try {
          var Q = V.qtypes;
          (req.slots || []).forEach(function (sl) {
            var t = sl && sl.type; if (!t) return;
            try { t = (Q && Q.engineOf) ? (Q.engineOf(t) || t) : t; } catch (e) {}
            if (types.indexOf(t) < 0) types.push(t);
            plan2[t] = (plan2[t] || 0) + 1;
          });
        } catch (e) {}
        /* 文字の道では、回ごとに 本文の 別の ところを 渡して 全部を 一巡する。 */
        var 本 = "";
        if (本文の束.length) {
          var k = 何回目++ % 本文の束.length;
          本 = "\n\n【添付した 資料の 本文"
            + (本文の束.length > 1 ? "（" + (k + 1) + " / " + 本文の束.length + " 番目の 範囲）" : "")
            + "】\n" + 本文の束[k]
            + "\n★ **ここに 書いてあることだけ**を 根拠に してください。"
            + "書いていないことを 覚えで 書かないでください。"
            /* ★ 2026-09-03・訴え「同じ 箇所が 永遠に 出題される」。
               範囲を 割って 渡すだけでは 足りない。**その 範囲の 中でも
               頭に 寄る**ので、まんべんなく 使うよう はっきり 言う。 */
            + (本文の束.length > 1
              ? "\n★ これは 資料 全体の うち **" + (k + 1) + " 番目の 範囲だけ**です。"
                + "ほかの 範囲は 別の 回で 出すので、**この 範囲の 中から**作ってください。"
              : "")
            + "\n★ **資料の 頭だけに 寄せない。** 前半・中ほど・後半から"
            + " まんべんなく 選んでください。同じ 段落から 2 問 以上 作らないでください。";
        }
        var 頼み = {
          prompt: ((cx && cx.prompt) ? cx.prompt + "\n\n" + 依頼文 : 依頼文) + 本,
          count: (req.slots || []).length,
          questionTypes: types.length ? types : undefined,
          questionPlan: Object.keys(plan2).length ? plan2 : undefined,
          /* ★ ここは **試験**。プリセット作成とは 頼みかたを 変える（2026-08-30）。
             サーバが 聞かれ方の 型・ひっかけの 型・教科の 縛りを 足す。 */
          exam: true,
          subject: (表紙 && 表紙.subject) || undefined,
          /* 図・表・グラフ。サーバは 頼まれたときだけ 語彙を 教える。
             既定で 付けると 要らない ところに 飾りの 表が 出る。 */
          materials: c.materials === true ? true : undefined,
          /* ★ **難しさ**（2026-08-31・訴え「選択肢が すぐ 分かる くらい 簡単」）。
             サーバは これで 選択肢の 字数の 下限と 誤答の 作りを 変える。
             国語では 本文の 長さも これで 決まる。
             通して いなかった ので、難しめに しても 何も 変わって いなかった。 */
          level: { easy: "やさしい", hard: "難しい", mixed: "標準" }[c.difficulty] || "標準",
          /* ★ **大問ごとの 出題範囲**（2026-08-31・訴え）。
             人が 構成案で 直した ものを そのまま 渡す。
             where に ページを 書けば その 範囲だけから 出す。 */
          /* ★ この 頼みが 作る 大問だけ。数も **この 頼みの ぶん**に そろえる
             （大問が 8 問 あって 5 問ずつ 刻まれた ときに、
               8 問 作れと 言わない ため）。 */
          parts: (function () {
            var ps = 出題範囲(req
              ? { title: req.sectionTitle, number: req.sectionNumber } : null);
            if (!ps || ps.length !== 1) return ps;
            var n = (req.slots || []).length;
            return n ? [Object.assign({}, ps[0], { count: n })] : ps;
          })(),
          files: 資料.length ? 資料 : undefined,
          orderId: 注文番号,
          /* ★ 試験の 仕事は **プリセットに しない**（2026-08-30・訴え）。
             うしろの 拾い上げは 'preset-gen' だけを 見る。 */
          kind: "exam",
          selfManaged: true
        };
        /* 走っている 間の 様子を そのまま 受ける。 */
        頼み.onProgress = function (pr) {
          if (!pr || !pr.jobId) return;
          向こう[pr.jobId] = { made: pr.made, planned: pr.planned, status: pr.status };
          var 様 = 向こうの様子();
          if (st.進み && 様) { st.進み.stage = 様; 進みを塗る(); }
        };
        頼み.onStart = function (jobId) {
          if (jobId) 向こう[jobId] = { made: 0, planned: 頼み.count || 0, status: "running" };
        };
        /* ★ **進んで いる 間は 待つ**（2026-09-06・訴え）。
           これまでは 「4 分」で 一律に 見切って いた。
           ところが 向こうは ちゃんと 動いて いて、画面には
           「向こうで 10 / 24 問」と 出ながら 同時に
           「時間内に 終わりません でした」が 3 件 出て いた。
           できかけを 置き去りに して 頼み直すので、かえって 遅く なる。
           ★ 見るのは **止まって いるか どうか**:
             ・進んで いる → 上限（10 分）まで 待つ
             ・90 秒 進まない → そこで 切る（詰まりには 前より 速く 気づく） */
        頼み.maxWaitMs = 10 * 60 * 1000;
        頼み.stallMs = 90 * 1000;
        var 呼 = G.generateQuestionsTracked ? G.generateQuestionsTracked(頼み) : G.generateQuestions(頼み);
        return 呼.then(function (r) {
          (r.warnings || []).forEach(function (w) { if (w) 記す("warn", w); });
          if (r.status === "contradictory" || r.status === "unsupported") 記す("warn", r.reason || "");
          /* 「画像1」を 本物の 中身へ 差し替える（知らない 住所は 落とす）。 */
          try { 画像を差し替える(r.questions, 絵); } catch (e2) {}
          /* 外の 画像を 持ってくる（探す 言葉が あるときだけ）。 */
          var 待 = null;
          try { 待 = 外の画像を入れる(r.questions); } catch (e4) { 待 = null; }
          /* この 頼みは 終わり。様子の 一覧から 外す。 */
          Object.keys(向こう).forEach(function (k) {
            if (向こう[k] && 向こう[k].status !== "running" && 向こう[k].status !== "queued") delete 向こう[k];
          });
          /* ★ 根拠の 名前を そろえる（2026-08-30）。
             AI は fileName を 落としたり、source / title と 書いたりする。
             名前が 無いと「資料の どこか」を 指せず、確認あつかいに なる。
             資料が 1 件しか 無い ときは その 名前で 埋める（迷いようが ない）。 */
          try { 根拠の名前をそろえる(r.questions); } catch (e3) {}
          /* 画像が そろってから 返す（先に 返すと 紙面が 空の 図で 組まれる）。 */
          if (待 && typeof 待.then === "function") return 待.then(function () { return r; });
          return r;
        }, function (e) {
          /* **この端末へは 落とさない。** 理由を 言って 止める。 */
          var m = (e && e.userMessage) || (e && e.message) || "問題を 作れませんでした。";
          記す("err", m);
          throw e;
        });
      }
    }).then(function (res) {
      st.走っている = false;
      st.結果 = res;
      仕上げる(res, 表紙);
    }).catch(function (e) {
      st.走っている = false;
      if (e && e.cancelled) { 記す("note", "止めました"); st.err = ""; 描く(); return; }
      st.err = (e && e.userMessage) || (e && e.message) || "問題を 作れませんでした。";
      記す("err", st.err);
      描く();
    });
  }

  /* 根拠（sourceReferences）の 名前を、添付の 名前へ そろえる。
     ★ **無い ものを 作らない。** excerpt すら 無い ときは 触らない。 */
  function 根拠の名前をそろえる(並) {
    var 名 = st.資料.map(function (f) { return String(f.name || ""); }).filter(Boolean);
    if (!名.length) return;
    var 正 = function (v) {
      var t = String(v || "").trim();
      if (!t) return "";
      for (var i = 0; i < 名.length; i++) {
        if (名[i] === t) return 名[i];
        if (名[i].indexOf(t) >= 0 || t.indexOf(名[i]) >= 0) return 名[i];
      }
      return "";
    };
    (並 || []).forEach(function (q) {
      var refs = Array.isArray(q && q.sourceReferences) ? q.sourceReferences : [];
      q.sourceReferences = refs.map(function (r) {
        if (!r || typeof r !== "object") return null;
        var ex = String(r.excerpt || r.text || r.quote || "").trim();
        if (!ex) return null;
        var fn = 正(r.fileName || r.file || r.source || r.name || r.title);
        if (!fn && 名.length === 1) fn = 名[0];
        if (!fn) return null;
        return { fileName: fn, excerpt: ex.slice(0, 400),
                 page: (r.page != null ? r.page : undefined) };
      }).filter(Boolean);
    });
  }

  function 段の名(n) {
    var 表 = { plan: "枠を 決めています", request: "問題を 頼んでいます",
               generate: "問題を 作っています", gate: "枠に 合うか 見ています",
               assemble: "組み立てています", verify: "確かめています",
               finalize: "配点を 合わせています" };
    return 表[String(n)] || "作っています";
  }

  /* 依頼文。**表紙と 条件で 決めたことを 言葉に する。** */
  function 依頼を組む(c, 表紙, p2) {
    var 行 = [];
    if (表紙.subject) 行.push(表紙.subject + " の 試験です。");
    if (表紙.examName) 行.push("試験名は「" + 表紙.examName + "」。");
    行.push("大問 " + p2.sections.length + " ・ 全 " + p2.totalQuestions + " 問、満点 "
      + p2.totalPoints + " 点、試験時間 " + c.durationMinutes + " 分。");
    var d = { easy: "やさしめに", hard: "難しめに", mixed: "難易を 混ぜて" }[c.difficulty];
    if (d) 行.push(d + " 作ってください。");
    /* ★ 試験の 標準は 頭を 使う 問題（2026-08-30・訴え）。 */
    /* ★ 会話文・本文は **日本語で 書かせる**（2026-08-30・訴え）。
       教科が 英語の ときだけ 英語。書かないと 英語の 会話文が 混ざる。 */
    /* ★ 英語の 試験でも **問題文は 日本語**（2026-08-31・訴え
       「英語の 問題が 必ず 問題文まで 英語に なる。それは なし。日本語で いい」）。
       先に「英語で 書いて」と 言うと、そのあとの 但し書きが 効かない。
       日本語で 書く ものを **先に** 言い切る。 */
    行.push(/英語|English/i.test(表紙.subject || "")
      ? "英語の 試験です。**問題文（問いかけ）と 解説は 日本語で 書いてください。**"
        + "英語に するのは 本文・会話文・例文と、選択肢の 語句だけです。"
        + "（× 'Choose the best word.' ／ ○「空所に 入れるのに 最も 適当な ものを 一つ 選べ。」）"
      : "**本文・会話文・選択肢・解説は すべて 日本語で 書いてください。**"
        + "英語の 文を 混ぜないでください（教科が 英語の ときを 除きます）。");
    /* ★ 並べ替えは **順番に 意味の ある もの**だけ（2026-08-30・訴え）。
       語句を つなげて 1 文に する だけの 並べ替えは、指示が あるときだけ。 */
    if (c.types && c.types.ordering && !/語句整序|語順|並べ替えて.*文|英作文/.test(String(c.instruction || ""))) {
      行.push("並べ替えは「古い順」「手順の順」「大きい順」のように"
        + "**順番そのものに 意味の ある もの**に してください。"
        + "「次の語句を並べ替えて意味の通る文にしなさい」のような、"
        + "**文を 組み立てるだけの 並べ替えは 作らないでください。**");
    }
    行.push("単語や 年号を 1 問 1 答で 答えるだけの 問題に 寄せないでください。"
      + "本文の 空欄を 複数 補う 問題（語群あり・語群なしの 両方）、"
      + "「〜字以内で まとめよ」のように 字数を 指定して 書かせる 記述、"
      + "資料を 読み取って 考えさせる 問題を 必ず 混ぜてください。"
      + "記述には 採点の 基準を 付けてください。");
    /* ★ 聞かれ方も 毎回 変える（2026-08-30・訴え）。
       型の 一覧を そのまま 渡すと、AI は いつも 先頭の 型から 使う。
       今回 多めに 使う 型を こちらで 選んで 名指しする。 */
    var 型ら = ["場面判断", "資料の突き合わせ", "表のうめ", "発言への説明",
                "考えかたの理解", "複数空欄", "字数指定の記述", "会話文",
                "本文の語群うめ", "本文への記述", "傍線部"];
    var 種2 = String(st.枠の種 || Date.now());
    var h2 = 0;
    for (var i2 = 0; i2 < 種2.length; i2++) h2 = (h2 * 31 + 種2.charCodeAt(i2)) >>> 0;
    var 選ら = [];
    for (var k2 = 0; k2 < 3; k2++) {
      h2 = (h2 * 1103515245 + 12345) >>> 0;
      var t2 = 型ら[h2 % 型ら.length];
      if (選ら.indexOf(t2) < 0) 選ら.push(t2);
    }
    if (選ら.length) {
      行.push("今回は **" + 選ら.join("・") + "** の 聞かれ方を 多めに してください"
        + "（そればかりに せず、ほかの 型も 混ぜます）。"
        + "毎回 同じ 順・同じ 聞かれ方に ならないように してください。");
    }
    /* ★ 本文＋語群うめ（2026-08-30・訴え「語群問題とかって ないの？」）。
       **数まで 名指しする。**「入れてください」だけでは 1 問も 入らない。 */
    if (c.wordBank !== false && c.types && c.types.fill_blank) {
      var 空数 = 0;
      (p2.sections || []).forEach(function (sec) {
        (sec.questions || []).forEach(function (q) { if (q.type === "fill_blank") 空数++; });
      });
      if (空数) {
        var 語数 = Math.max(1, Math.round(空数 / 2));
        行.push("空欄補充 " + 空数 + " 問の うち **" + 語数 + " 問**は、"
          + "**本文（150〜400 字）を materials の passage で 付けて**、"
          + "その 本文の 中に 【ア】【イ】… の 空欄を 2〜4 個 置き、"
          + "choices に **語群を 6〜10 個**（空欄の 数 ＋ 2 以上）並べてください。"
          + "blanks には 空欄ごとの 正解を 順に 書きます。"
          + "語群には 正解と 見分けの つきにくい 語（似た 語・上位語・逆の 語）を 混ぜます。");
      }
    }
    if (String(c.instruction || "").trim()) 行.push(String(c.instruction).trim());
    if (!st.資料.length) 行.push("資料は ありません。上の 指示だけで 作ってください。");
    else {
      行.push("添付した 資料が " + st.資料.length + " 件 あります。"
        + "**その 資料に 書いてあることだけ**を 根拠に して 作ってください。"
        + "資料に 無いことを 覚えで 書かないでください。"
        + "資料の 図・表・数値を 読み取らせる 問題を 必ず 混ぜてください。");
      /* ★ 根拠を **形で** 出させる（2026-08-30）。名前が 合わないと
         「資料の どこか」が 分からず、確認あつかいに なる。 */
      行.push("問題ごとに、根拠に した ところを 次の 形で 付けてください:"
        + '\n\u3000"sourceReferences": [{"fileName":"資料の 名前","excerpt":"根拠に した 本文を そのまま 1 文"}]'
        + "\n\u3000資料の 名前は 次の どれかを **そのまま** 書きます: "
        + st.資料.map(function (f) { return "「" + (f.name || "資料") + "」"; }).join("・"));
    }
    return 行.join("\n");
  }

  /* ⑤ → ⑥ できたものを 試験に する。**足りないぶんを 黙って 埋めない。** */
  function 仕上げる(res, 表紙) {
    var got = res.accepted, want = res.planned;
    if (!got) {
      st.err = (res.errors && res.errors[0] && res.errors[0].message)
        || "1 問も 作れませんでした。条件を 変えて もう一度 お試しください。";
      記す("err", st.err);
      描く();
      return;
    }
    var sp = res.spec;
    if (!sp) { st.err = "作れた 問題を 試験に できませんでした。"; 描く(); return; }
    /* 表紙・紙面の 型・時間を 載せる（ここでしか 入らない）。 */
    /* ★ 注意事項は **できあがった 数で 書き直す**（2026-08-30）。
       表紙の 段では 大問の 数も 満点も「これから 決める 数」だった。
       ここでは 実際に できた 枠（res.plan）が あるので、
       第 1 問〜第 N 問・満点 N 点が 紙面と 必ず 合う。
       走っている 間に AI から 返った 一言も ここで 入る。 */
    if (表紙 && 表紙.注意は自動 !== false) {
      表紙.instructions = 注意を書く(表紙, st.条件, res.plan);
    }
    sp.cover = 表紙;
    sp.durationMinutes = st.条件.durationMinutes;
    if (st.条件.layoutMode !== "current" || st.条件.answerSheetMode !== "current") {
      sp.layout = {
        layoutMode: st.条件.layoutMode,
        answerSheetMode: st.条件.answerSheetMode,
        outputEngine: "current",
        layoutSeed: "vqmake-" + String(Date.now()).slice(-8)
      };
    }
    st.spec = sp;
    記す("done", got + " 問 できました（配点の 合計 " + res.plan.totalPoints + " 点）");
    /* ★ 根拠が 付いていない ぶんは **捨てずに 数で 言う**（2026-08-30）。
       前は ここで 全部 捨てていたので、資料を 付けた 試験は
       「1 問も 作れませんでした」で 終わっていた。 */
    if (res.根拠のない数) {
      記す("warn", got + " 問のうち " + res.根拠のない数
        + " 問は 資料の どこを 根拠に したかが 付いていません。"
        + "問題は 残しています（確認の 印を 付けました）。");
    }
    /* ★ **できたら その場で 一覧へ 入れる**（2026-08-30・訴え
       「全然プリセット欄にできた試験が追加されない」）。
       前は 確認の 画面で「保存する」を 押すまで どこにも 残らなかった。
       途中で 画面を 閉じたり、押す前に 落ちたりすると 全部 消えていた。
       押すのを 待たない。あとから 直しても 上書きで 保存する。 */
    保存する({ 黙って: true });
    if (got < want) 記す("warn", want + " 問のうち " + got + " 問できました。");
    (res.issues || []).filter(function (i) { return i.severity === "high"; })
      .forEach(function (i) { 記す("err", i.message); });
    st.err = "";
    開く("確認");
  }

  /* ⑥ 保存 */
  function 保存する(o) {
    o = o || {};
    var V = VQ2(), ST = V && V.store;
    if (!st.spec) { if (!o.黙って) { st.err = "保存する 試験が ありません。"; 描く(); } return; }
    if (!ST || !ST.saveExam) { if (!o.黙って) { st.err = "保存の 部品が ありません。"; 描く(); } return; }
    try {
      /* 器は preset（2026-08-30）。試験も プリセットの 一種として 置く。
         こうすると 一覧・検索・お気に入り・公開・共有が そのまま 効く。 */
      /* 注文の 目印を 押す。うしろの 拾い上げが「もう ある」と 分かるため。 */
      if (st.注文番号) st.spec.sourceOrderId = st.注文番号;
      var r = ST.saveExam(st.spec, { ownerId: ST.currentOwnerId() });
      if (r && r.ok === false) {
        if (!o.黙って) { st.err = r.message || "保存できませんでした。"; 描く(); }
        else 記す("warn", "一覧へ 入れられませんでした：" + (r.message || "理由不明"));
        return;
      }
      st.保存した = true; st.err = "";
      記す("done", "一覧に 入れました（「" + (st.spec.title || "試験") + "」）");
      /* 一覧を その場で 描き直す（開いた ままでも 出る ように）。 */
      try { window.dispatchEvent(new CustomEvent("vq:presets:changed")); } catch (e2) {}
    } catch (e) {
      var m = "保存できませんでした：" + String((e && e.message) || e).slice(0, 100);
      if (!o.黙って) st.err = m; else 記す("warn", m);
    }
    描く();
  }

  /* ⑦ 紙面を 出す */
  function 紙面を出す(kind) {
    var V = VQ2(), L = V && V.layout, R = V && V.pdfRenderer;
    if (!st.spec || !L || !R) { st.err = "紙面の 部品が ありません。"; 描く(); return; }
    /* 選び直した 型を 反映してから 組む。 */
    if (st.条件.layoutMode !== "current" || st.条件.answerSheetMode !== "current") {
      st.spec.layout = {
        layoutMode: st.条件.layoutMode, answerSheetMode: st.条件.answerSheetMode,
        outputEngine: "current",
        layoutSeed: (st.spec.layout && st.spec.layout.layoutSeed) || ("vqmake-" + String(Date.now()).slice(-8))
      };
    } else { delete st.spec.layout; }
    var plan2;
    try { plan2 = L.buildPlan(st.spec); }
    catch (e) { st.err = "紙面を 組めませんでした。"; 描く(); return; }
    var 欲 = kind === "print-a" ? "answer-sheet" : kind === "print-k" ? "answer-key" : "question";
    var b = (plan2.booklets || []).filter(function (x) { return x.kind === 欲; })[0];
    if (!b) { st.err = "その 紙面は ありません。"; 描く(); return; }
    /* ★ 数式が SVG に なるよう、出す 前に 用意する（2026-08-30・訴え）。
       用意が できなくても 紙面は 出す（式は 書いてあった まま 出る）。 */
    var 出す = function () {
      try { R.printBooklet(st.spec, plan2, b.id); st.err = ""; }
      catch (e) { st.err = "紙面を 出せませんでした。"; }
      描く();
    };
    if (R.数式の用意) { try { R.数式の用意().then(出す, 出す); return; } catch (e) {} }
    出す();
  }

  /* ⑦ 組版（Typst）で PDF を 出す。
     ★ 原稿を 作るのは VQ2.pdfRenderer.adapters.typst.build。
       走らせるのは window.VQTYPST。ここは 押されたときの 段取りだけ。 */
  function 組版で出す(解答用紙か) {
    var V = VQ2();
    var T = window.VQTYPST;
    var R = V && V.pdfRenderer;
    if (!st.spec) { st.err = "試験が ありません。"; 描く(); return; }
    if (!T || !R || !R.adapter) { st.err = "組版の 部品が ありません。"; 描く(); return; }
    var A = R.adapter("typst");
    st.組版 = { 進み: { 段: "はじめます", 割合: 0 }, 終わった: false, err: "", 出した: "" };
    描く();

    T.用意する(function (pr) {
      st.組版.進み = pr;
      /* 毎回 全部 描き直すと 重いので、帯だけ 差し替える。 */
      try {
        var bar = root.querySelector(".tyb-i");
        var 文 = root.querySelector(".tyb") && root.querySelector(".tyb").nextElementSibling;
        if (bar) bar.style.width = Math.round((pr.割合 || 0) * 100) + "%";
        if (文) 文.textContent = (pr.段 || "読み込んでいます") + "… "
          + Math.round((pr.割合 || 0) * 100) + "%（一度だけ）";
      } catch (e) {}
    }).then(function (r) {
      st.組版.終わった = true;
      if (!r || !r.ok) {
        st.組版.err = "組版を 用意できませんでした：" + (r && r.なぜ ? r.なぜ : "理由が 分かりません");
        描く(); return;
      }
      /* 選んだ 型を 反映してから 原稿を 作る。 */
      var 出 = A.build(st.spec, null, {
        cover: true,
        vertical: (st.条件 && st.条件.縦書き) === true,
        seed: (st.spec.layout && st.spec.layout.layoutSeed) || undefined
      });
      if (!出 || !出.ok) {
        st.組版.err = (出 && 出.message) || "原稿を 作れませんでした。";
        描く(); return;
      }
      var 原稿 = 解答用紙か ? 出.answerSheet : 出.questionPaper;
      st.組版.進み = { 段: "組んでいます", 割合: 1 };
      描く();
      return A.compile(原稿).then(function (c) {
        st.組版.進み = null;
        if (!c || !c.ok) {
          st.組版.err = (c && c.message) || "組めませんでした。";
          描く(); return;
        }
        var 名 = (st.spec.title || "試験") + (解答用紙か ? "-解答用紙" : "-問題用紙");
        T.保存する(c.pdf, 名);
        st.組版.出した = 名 + ".pdf を 保存しました（"
          + (Math.round(c.bytes / 1024)) + "KB）";
        描く();
      });
    }).catch(function (e) {
      st.組版.終わった = true; st.組版.進み = null;
      st.組版.err = String((e && e.message) || e).slice(0, 160);
      描く();
    });
  }

  /* ⑦ 受験する */
  function 受験する() {
    if (!st.spec) { st.err = "受験する 試験が ありません。"; 描く(); return; }
    var V = VQ2();
    if (V && V.examWorkspace && V.examWorkspace.open) return 受験を開く(V);
    /* ★ 4.7MB の vq2-app は **起動が 終わってから** 読む（index.html の 道具）。
       押した その瞬間には まだ 無いことが ある。
       「受験の 画面が ありません」で 突き放すと **CBT に 一生 辿り着けない**。
       読ませて から 待つ。 */
    st.err = "";
    st.待っている = true; 描く();
    try { if (window.__vqLoadLibs) window.__vqLoadLibs(); } catch (e) {}
    var 回 = 0;
    var t = setInterval(function () {
      var V2 = VQ2();
      if (V2 && V2.examWorkspace && V2.examWorkspace.open) {
        clearInterval(t); st.待っている = false; 受験を開く(V2); return;
      }
      if (++回 > 80) {                      /* 12 秒 */
        clearInterval(t); st.待っている = false;
        st.err = "受験の 画面を 読み込めませんでした。もう一度 押してください。";
        描く();
      }
    }, 150);
  }
  function 受験を開く(V) {
    if (!st.保存した) 保存する();
    閉じる();
    try { V.examWorkspace.open({ spec: st.spec }); }
    catch (e) {
      try { window.__vqToast && window.__vqToast("受験の 画面を 開けませんでした。"); } catch (e2) {}
    }
  }

  /* ── 外へ 出す 口 ─────────────────────────────────────────── */
  window.__vqMake = {
    open: function (o) {
      o = o || {};
      st.err = "";
      if (o.kind === "exam") { st.画面 = "表紙"; 開く("表紙"); return; }
      if (o.kind === "preset") { プリセットへ(); return; }
      開く("選ぶ");
    },
    閉じる: 閉じる,
    /* 検証のため。できあがった 試験を 差し込んで 紙面の 段へ 飛ばす。 */
    試験を入れる: function (spec) {
      if (!spec || !spec.sections) return false;
      st.spec = spec;
      st.表紙 = spec.cover || st.表紙;
      st.保存した = true;
      開く("紙面");
      return true;
    },
    /* ══ 検証のため。作って いる あいだの 進みを **本物の AI を 呼ばずに** 流す。
       チカチカの 直しは 「進みが 来ても 部品が 生まれ変わらない」ことなので、
       進みを 流せないと 何も 測れない（測れない ものは 直った ことに ならない）。 */
    __進みためし: function (o) {
      o = o || {};
      if (o.画面) {
        st.画面 = "生成";
        st.走っている = true; st.err = ""; st.記録 = []; st.記番 = 0;
        st.始めた = Date.now();
        st.進み = { done: 0, total: 1, made: 0, madeTotal: Number(o.total) || 20, stage: o.stage || "" };
        host.setAttribute("data-open", "1");
        描く();
      }
      if (o.走っている !== undefined) st.走っている = !!o.走っている;
      if (o.err !== undefined) st.err = String(o.err || "");
      if (o.made !== undefined || o.total !== undefined || o.stage !== undefined) {
        st.進み = st.進み || { done: 0, total: 1, made: 0, madeTotal: 20, stage: "" };
        if (o.made !== undefined) st.進み.made = Number(o.made) || 0;
        if (o.total !== undefined) st.進み.madeTotal = Number(o.total) || 0;
        if (o.stage !== undefined) st.進み.stage = String(o.stage || "");
      }
      (o.記録 || []).forEach(function (r) {
        var i = String(r).indexOf(":");
        記す(i > 0 ? String(r).slice(0, i) : "note", i > 0 ? String(r).slice(i + 1) : String(r));
      });
      進みを塗る();
      return true;
    },
    /* 検証のため（画面を 触らずに 中を 見る） */
    状態: function () {
      return { 画面: st.画面, err: st.err,
               表紙: JSON.parse(JSON.stringify(st.表紙)),
               条件: JSON.parse(JSON.stringify(st.条件)),
               枠: st.枠 ? { 大問: st.枠.sections.length, 問: st.枠.totalQuestions,
                             点: st.枠.totalPoints } : null,
               進み: st.進み, 走っている: st.走っている,
               できた: st.spec ? {
                 大問: (st.spec.sections || []).length,
                 問: (st.spec.sections || []).reduce(function (a, x) { return a + (x.questions || []).length; }, 0),
                 点: st.spec.totalPoints, 表紙あり: !!st.spec.cover
               } : null,
               保存した: st.保存した,
               資料: st.資料.map(function (f) {
                 return { name: f.name, size: f.size, mimeType: f.mimeType,
                          状態: f.status || "", 文字数: (f.extractedText || "").length,
                          絵: (f.pageImages || []).length,
                          読み取り字数: String(f.ocrText || "").length,
                          読み取り頁: f.ocr頁 || 0,
                          頁: f.pageCount || 0, 読めない頁: f.ocr || 0,
                          文字で足りる: 文字で足りるか(f) };
               }),
               記録: st.記録.slice(-8),
               描けなかった: 描けなかった };
    },
    /* 作った ときの 内訳。**なぜ 捨てられたか**まで 出す（調べる ため）。 */
    内訳: function () {
      var r = st.結果;
      if (!r) return null;
      return {
        頼んだ: r.planned, 受けた: r.accepted,
        捨てた: (r.rejected || []).slice(0, 12).map(function (x) {
          return { 枠: x.slotId, 理由: (x.reasons || []).map(function (y) {
            return y.code + ":" + y.message; }).join(" / ") };
        }),
        しくじり: (r.errors || []).slice(0, 6).map(function (e) {
          return String((e && (e.message || e.code)) || e).slice(0, 160); }),
        指摘: (r.issues || []).slice(0, 8).map(function (i) {
          return i.severity + ":" + i.message; })
      };
    },
    /* 検査のため。**本物の ファイル選びは 自動では 押せない**ので、
       中身だけ 入れて 通り道を 確かめられるようにする。 */
    資料を入れる: function (並) {
      st.資料 = (並 || []).map(function (f) {
        return { name: String(f.name || "資料"), mimeType: String(f.mimeType || "application/pdf"),
                 data: String(f.data || ""), size: Number(f.size) || 0,
                 status: String(f.status || "ready"),
                 extractedText: String(f.extractedText || ""),
                 ocrText: String(f.ocrText || ""), ocr頁: Number(f.ocr頁) || 0,
                 pageCount: Number(f.pageCount) || 0, ocr: Number(f.ocr) || 0,
                 pageImages: f.pageImages || null };
      });
      if (st.画面) 描く();
      return st.資料.length;
    },
    /* 本物の ファイルを 読取器へ 通す（実機と 同じ 道）。 */
    資料を読ませる: function (並) { return 資料を足す(Array.prototype.slice.call(並 || [])); },
    /* 送るときの 形。**何が どう 渡るか**を そのまま 見られるようにする。 */
    資料の送り形: function () { return 資料を送れる形に(); },
    /* 速さの 芯。**絵を 1 回だけ 文字に する**ところを 単体で 確かめる。 */
    絵を文字にする: function (進む) { return 絵を文字にする(進む || function () {}); },
    読み取る資料: function () { return 読み取る資料().map(function (f) { return f.name; }); },
    文字で渡すぶん: function () { return 文字の資料().map(function (f) { return f.name; }); },
    ファイルで渡すぶん: function () { return ファイルで渡すぶん().map(function (f) { return f.name; }); },
    /* ★ 回数を そのまま 渡す（2026-09-03）。受け取らずに 捨てていたので、
       何回に 分けても いつも 同じ 割りかたに なっていた。 */
    渡す本文: function (回) { return 資料の文字(回); },
    /* 注意事項。**書かせずに 書く**ところ。 */
    注意を書く: function (p2) { return 注意を書く(st.表紙, st.条件, p2 || null); },
    読み取り: function () { return st.読取り; },
    表紙を入れる: function (c) {
      st.表紙 = Object.assign(既定の表紙(), c || {});
      if (st.画面) 描く();
      return st.表紙;
    },
    条件を入れる: function (c) {
      Object.assign(st.条件, c || {});
      if (st.画面) 描く();
      return JSON.parse(JSON.stringify(st.条件));
    },
    /* 構成案 → 生成 を 画面を 触らずに 走らせる（検証のため）。 */
    作りに行く: function () { return 作りに行く(); },
    生成する: function (o) { return 生成する(o || {}); }
  };
})();
