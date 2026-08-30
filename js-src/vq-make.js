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
    x: '<path ' + P + ' d="M6 6l12 12M18 6L6 18"/>'
  };
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
      "padding:26px 24px calc(22px + env(safe-area-inset-bottom,0px));",
      "animation:vmUp .24s cubic-bezier(.22,1,.36,1) both}",
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
      "border:1px solid var(--vq-border,#E7E4EF);background:var(--vq-surface,#fff);font-size:13px}",
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
      ".w{width:calc(100vw - 16px);border-radius:20px;padding:20px 16px calc(16px + env(safe-area-inset-bottom,0px))}",
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
      instructions: ["解答はすべて解答用紙に記入すること。",
                     "筆記用具以外の持ち込みは禁止。"],
      studentFields: ["年", "組", "番", "氏名"],
      sealNote: true
    };
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
    保存した: false
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
  function 描く() {
    if (!root) return;
    var box = root.querySelector("[data-box]");
    if (!box) return;
    if (!st.画面) { box.innerHTML = ""; return; }
    var h = '<div class="bd" data-a="bd"></div><div class="w" role="dialog" aria-modal="true">';
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
  }

  function 選ぶ中身() {
    return '<div class="hd"><div><div class="ttl">何を作りますか</div>'
      + '<div class="sub">あとから 作り直せます。試験は 表紙から 順に 作ります。</div></div>'
      + '<div class="sp"></div>'
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
      + '<div class="row"><label for="vm-notes">注意事項（1 行に 1 つ）</label>'
      + '<textarea id="vm-notes" data-f="instructions" maxlength="1200">'
      + esc((c.instructions || []).join("\n")) + "</textarea>"
      + '<div class="hint">空の行は 出しません。書いたものだけが 表紙に 並びます。</div></div>'
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
    h += '<div class="row"><label>資料（任意）</label>' + 資料の中身()
      + '<div class="hint">PDF・画像・文書を そのまま 渡します（要点だけを 抜き出しません）。'
      + "資料を 付けると <b>資料読解</b>の 問題を 作れます。合わせて 20MB まで。</div></div>";

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
      + '<textarea id="vm-inst" data-f="instruction" maxlength="1200" placeholder="例）配った授業プリントの範囲だけで。記述は 40 字以内でまとめさせる問題を 2 問。">'
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

    h += '<div class="secs">';
    p2.sections.forEach(function (sec) {
      var 内訳 = {};
      (sec.questions || []).forEach(function (q) {
        var n = 形式名(q.type); 内訳[n] = (内訳[n] || 0) + 1;
      });
      h += '<div class="sec"><div class="sec-h"><b>大問 ' + esc(sec.number) + "</b>"
        + '<span>' + esc((sec.questions || []).length) + " 問 ・ "
        + esc(sec.points != null ? sec.points : "-") + " 点</span></div>"
        + '<div class="sec-b">'
        + Object.keys(内訳).map(function (k) {
            return '<span class="tag">' + esc(k) + " " + 内訳[k] + "</span>";
          }).join("")
        + "</div></div>";
    });
    h += "</div>";

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

  /* ══ ⑤ 生成 ═══════════════════════════════════════════════════════ */
  function 生成の中身() {
    var pr = st.進み || { done: 0, total: 1, made: 0, madeTotal: 0, stage: "" };
    var 割 = pr.madeTotal ? Math.round((pr.made / pr.madeTotal) * 100) : 0;
    var h = '<div class="hd"><div><div class="ttl">問題を 作っています</div>'
      + '<div class="sub">' + esc(pr.stage || "はじめています…") + "</div></div>"
      + '<div class="sp"></div></div>';
    h += '<div class="bar"><i style="width:' + 割 + '%"></i></div>'
      + '<div class="barn">' + esc(pr.made) + " / " + esc(pr.madeTotal) + " 問"
      + (pr.total > 1 ? "　（" + esc(pr.done) + " / " + esc(pr.total) + " 回）" : "") + "</div>";
    h += '<div class="log">'
      + st.記録.slice(-14).map(function (r) {
          return '<div class="log-' + esc(r.k) + '">' + esc(r.t) + "</div>";
        }).join("")
      + "</div>";
    if (st.err) h += '<div class="err">' + esc(st.err) + "</div>";
    h += '<div class="ft">'
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
     ★ 読み取りは **サーバ（Gemini）**が する。ここでは 要点を 抜き出さない。
       抜き出すと「資料に 書いていないこと」を 作る 元に なる。
     ★ 大きさは ここで 止める。載らない ものを 送って 413 を 見せない。 */
  var 資料の上限 = 20 * 1024 * 1024;       /* 合わせて 20MB（base64 で およそ 27MB） */
  function 資料の中身() {
    var h = '<div class="files">';
    st.資料.forEach(function (f, i) {
      h += '<div class="file"><span class="file-n">' + esc(f.name) + "</span>"
        + '<span class="file-s">' + 大きさ(f.size) + "</span>"
        + '<button type="button" class="file-x" data-a="rmfile" data-v="' + i
        + '" aria-label="' + esc(f.name) + ' を外す">' + svg("x", "i") + "</button></div>";
    });
    h += '<button type="button" class="file-add" data-a="addfile">' + svg("plus", "i")
      + (st.資料.length ? "もっと 足す" : "資料を 選ぶ（PDF・画像・文書）") + "</button>";
    if (st.資料.length) {
      var 合 = st.資料.reduce(function (a, f) { return a + f.size; }, 0);
      h += '<div class="file-t">' + st.資料.length + " 件 ・ " + 大きさ(合) + "</div>";
    }
    return h + "</div>";
  }
  function 大きさ(n) {
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return Math.round(n / 1024) + " KB";
    return (Math.round(n / 1024 / 1024 * 10) / 10) + " MB";
  }
  function 資料を選ぶ() {
    var inp = doc.createElement("input");
    inp.type = "file";
    inp.multiple = true;
    inp.accept = ".pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.md,.csv,.docx";
    inp.style.cssText = "position:fixed;width:0;height:0;opacity:0";
    doc.body.appendChild(inp);
    inp.addEventListener("change", function () {
      var 並 = Array.prototype.slice.call(inp.files || []);
      try { inp.parentNode.removeChild(inp); } catch (e) {}
      if (!並.length) return;
      並.reduce(function (待, f) {
        return 待.then(function () { return 一つ読む(f); });
      }, Promise.resolve()).then(function () { 描く(); });
    });
    inp.click();
  }
  function 一つ読む(f) {
    var 合 = st.資料.reduce(function (a, x) { return a + x.size; }, 0);
    if (合 + f.size > 資料の上限) {
      st.err = "資料が 大きすぎます（合わせて " + 大きさ(資料の上限) + " まで）。"
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
            data: m[2], size: f.size
          });
          st.err = "";
        } catch (e) { st.err = "「" + f.name + "」を 読めませんでした。"; }
        done();
      };
      r.onerror = function () { st.err = "「" + f.name + "」を 読めませんでした。"; done(); };
      r.readAsDataURL(f);
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
    var 行 = (c.instructions || []).filter(function (x) { return String(x).trim(); });
    var h = '<div class="prev">';
    h += '<div class="pt">' + esc(c.examName || "（試験の名前）") + "</div>";
    if (c.subject) h += '<div class="ps">' + esc(c.subject) + "</div>";
    var m = [];
    if (c.examDate) m.push("実施日 " + c.examDate);
    m.push("試験時間・満点は 次の 段で 決めます");
    h += '<div class="pm">' + m.map(esc).join("</div><div class=\"pm\">") + "</div>";
    if (行.length) {
      h += "<ol>";
      行.slice(0, 6).forEach(function (t) { h += "<li>" + esc(t) + "</li>"; });
      h += "</ol>";
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
      if (a === "go") { 条件へ(); return; }
      if (a === "back-cover") { st.err = ""; 開く("表紙"); return; }
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
      if (a === "addfile") { 資料を選ぶ(); return; }
      if (a === "rmfile") {
        var idx = parseInt(el.dataset.v, 10);
        if (idx >= 0) st.資料.splice(idx, 1);
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
      instructions: (c.instructions || []).filter(function (x) { return String(x).trim(); }),
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
      p2 = MC.plan({
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
    st.err = 重.length ? 重[0].message : "";
    開く("構成案");
  }

  /* ══ ④ → ⑤ 実際に 作る ═══════════════════════════════════════════
     ★ 生成そのものは **サーバ（Groq / Gemini）**。この端末では 作らない。
     ★ 枠に 入らなかったものは 捨てる（MR.run の gate）。水増ししない。 */
  function 記す(k, t) {
    st.記録.push({ k: k, t: String(t).slice(0, 200) });
    if (st.記録.length > 60) st.記録 = st.記録.slice(-60);
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
    if (!o.refill) { st.記録 = []; st.結果 = null; st.spec = null; st.保存した = false; }
    st.進み = { done: 0, total: 1, made: 0, madeTotal: p2.totalQuestions, stage: "枠を 決めました" };
    記す("step", "大問 " + p2.sections.length + " ・ 全 " + p2.totalQuestions
      + " 問の 枠を 先に 決めました（配点の 合計 " + p2.totalPoints + " 点）");
    開く("生成");

    var 依頼文 = 依頼を組む(c, 表紙, p2);
    var 資料 = st.資料.map(function (f) { return { mimeType: f.mimeType, data: f.data }; });
    var 資料を言った = false;

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
      concurrency: 3,
      batchSize: 5,
      onStage: function (name) {
        if (st.進み) st.進み.stage = 段の名(name);
        描く();
      },
      onProgress: function (pr) {
        st.進み = {
          done: (pr && pr.done) || 0,
          total: (pr && pr.total) || 1,
          made: (pr && typeof pr.filled === "number") ? pr.filled : ((pr && pr.made) || 0),
          madeTotal: (pr && pr.total2) || p2.totalQuestions,
          stage: (st.進み && st.進み.stage) || "問題を 作っています"
        };
        描く();
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
        if (資料.length && !資料を言った) {
          資料を言った = true;
          記す("note", "資料 " + 資料.length + " 件を そのまま 渡します");
        }
        var 頼み = {
          prompt: (cx && cx.prompt) ? cx.prompt + "\n\n" + 依頼文 : 依頼文,
          count: (req.slots || []).length,
          questionTypes: types.length ? types : undefined,
          questionPlan: Object.keys(plan2).length ? plan2 : undefined,
          /* 図・表・グラフ。サーバは 頼まれたときだけ 語彙を 教える。
             既定で 付けると 要らない ところに 飾りの 表が 出る。 */
          materials: c.materials === true ? true : undefined,
          files: 資料.length ? 資料 : undefined
        };
        var 呼 = G.generateQuestionsTracked ? G.generateQuestionsTracked(頼み) : G.generateQuestions(頼み);
        return 呼.then(function (r) {
          (r.warnings || []).forEach(function (w) { if (w) 記す("warn", w); });
          if (r.status === "contradictory" || r.status === "unsupported") 記す("warn", r.reason || "");
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
    行.push("単語や 年号を 1 問 1 答で 答えるだけの 問題に 寄せないでください。"
      + "本文の 空欄を 複数 補う 問題（語群あり・語群なしの 両方）、"
      + "「〜字以内で まとめよ」のように 字数を 指定して 書かせる 記述、"
      + "資料を 読み取って 考えさせる 問題を 必ず 混ぜてください。"
      + "記述には 採点の 基準を 付けてください。");
    if (String(c.instruction || "").trim()) 行.push(String(c.instruction).trim());
    if (!st.資料.length) 行.push("資料は ありません。上の 指示だけで 作ってください。");
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
    if (got < want) 記す("warn", want + " 問のうち " + got + " 問できました。");
    (res.issues || []).filter(function (i) { return i.severity === "high"; })
      .forEach(function (i) { 記す("err", i.message); });
    st.err = "";
    開く("確認");
  }

  /* ⑥ 保存 */
  function 保存する() {
    var V = VQ2(), ST = V && V.store;
    if (!st.spec) { st.err = "保存する 試験が ありません。"; 描く(); return; }
    if (!ST || !ST.saveExam) { st.err = "保存の 部品が ありません。"; 描く(); return; }
    try {
      /* 器は preset（2026-08-30）。試験も プリセットの 一種として 置く。
         こうすると 一覧・検索・お気に入り・公開・共有が そのまま 効く。 */
      var r = ST.saveExam(st.spec, { ownerId: ST.currentOwnerId() });
      if (r && r.ok === false) { st.err = r.message || "保存できませんでした。"; 描く(); return; }
      st.保存した = true; st.err = "";
      記す("done", "保存しました");
    } catch (e) { st.err = "保存できませんでした：" + String((e && e.message) || e).slice(0, 100); }
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
    try { R.printBooklet(st.spec, plan2, b.id); st.err = ""; }
    catch (e) { st.err = "紙面を 出せませんでした。"; }
    描く();
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
               資料: st.資料.map(function (f) { return { name: f.name, size: f.size, mimeType: f.mimeType }; }),
               記録: st.記録.slice(-8),
               描けなかった: 描けなかった };
    },
    /* 検査のため。**本物の ファイル選びは 自動では 押せない**ので、
       中身だけ 入れて 通り道を 確かめられるようにする。 */
    資料を入れる: function (並) {
      st.資料 = (並 || []).map(function (f) {
        return { name: String(f.name || "資料"), mimeType: String(f.mimeType || "application/pdf"),
                 data: String(f.data || ""), size: Number(f.size) || 0 };
      });
      if (st.画面) 描く();
      return st.資料.length;
    },
    読み取り: function () { return st.読取り; },
    表紙を入れる: function (c) {
      st.表紙 = Object.assign(既定の表紙(), c || {});
      if (st.画面) 描く();
      return st.表紙;
    }
  };
})();
