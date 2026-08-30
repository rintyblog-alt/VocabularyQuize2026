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
    条件: 既定の条件()
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
         : 条件の中身();
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
      if (a === "run") { 作りに行く(); return; }
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
  function 作りに行く() {
    var V = VQ2();
    if (!V || !V.quickMock || !V.quickMock.open) {
      st.err = "まだ 準備が できていません。少し 待ってから もう一度 押してください。";
      描く();
      return;
    }
    var c = st.条件;
    var 選 = 形式.filter(function (x) { return c.types[x.id]; }).length;
    if (!選) { st.err = "形式は 1 つ以上 選んでください。"; 描く(); return; }

    var 表紙 = 表紙を固める();
    var 設定 = {
      title: 表紙.examName,
      subject: 表紙.subject,
      kind: c.kind,
      durationMinutes: c.durationMinutes,
      totalPoints: c.totalPoints,
      sectionCount: c.sectionCount,
      questionCount: c.questionCount,
      difficulty: c.difficulty,
      types: JSON.parse(JSON.stringify(c.types)),
      layoutMode: c.layoutMode,
      answerSheetMode: c.answerSheetMode,
      examStandard: true
    };
    閉じる();
    try {
      V.quickMock.open({
        kind: "exam",
        cover: 表紙,
        settings: 設定,
        instruction: String(c.instruction || ""),
        /* 資料を 付けたい人が いるので、**勝手には 作り始めない**。
           向こうの 画面で「作る」を 押してもらう。ただし 条件は 全部 入っている。 */
        autoRun: false
      });
    } catch (e) {}
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
    /* 検証のため（画面を 触らずに 中を 見る） */
    状態: function () {
      return { 画面: st.画面, err: st.err,
               表紙: JSON.parse(JSON.stringify(st.表紙)),
               条件: JSON.parse(JSON.stringify(st.条件)),
               描けなかった: 描けなかった };
    },
    表紙を入れる: function (c) {
      st.表紙 = Object.assign(既定の表紙(), c || {});
      if (st.画面) 描く();
      return st.表紙;
    }
  };
})();
