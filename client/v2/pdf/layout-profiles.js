/* ══════════════════════════════════════════════════════════════════════
   紙面レイアウトプロファイルと、制御されたランダム配置（Typst / TeX の前段階）

   ここが決めること
     ・どの紙面の型（プロファイル）を使うか
     ・その型が **許可している** 部品の組み合わせ（variant）のうち、どれを使うか
     ・問題形式から解答欄をいくつ・どの大きさで作るか

   ここが決めないこと
     ・問題文・正解・選択肢・配点・問題 ID・問題番号（一切さわらない）
     ・組版ソース（Typst / TeX / HTML）そのもの

   3 つの約束
     1. 未選択（layoutMode = "current"）なら、この経路へは入らない。
        いまの Quick Mock と完全に同じ動きにする。
     2. 乱数は layoutSeed だけから作る。同じ Seed なら必ず同じ紙面になる。
     3. 選べるのはプロファイルが列挙した variant だけ。
        「自由な配置」は作らない（紙面が壊れるため）。

   出力エンジン（current / typst / tex）と紙面デザインは **別の項目**。
   同じフィールドへ混ぜない。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var S = VQ2.schema;
  if (!S) throw new Error("VQ2.schema must be loaded before layout-profiles.js");

  /* ══════════════════════════════════════════════════════════════════
     出力エンジン（紙面デザインとは別の概念）
     ・typst / tex は実行環境が無い。**使えるふりをしない。**
     ・実際に組めるのは current（HTML/CSS Paged Media）だけ。
     ══════════════════════════════════════════════════════════════════ */
  var OUTPUT_ENGINES = ["current", "typst", "tex"];
  /* この端末で本当に使えるかどうかは、外から入れてもらう。
     ブラウザからは実行環境を直接見られないので、
     Bridge の /typst/capability の答えをここへ入れる。
     入っていない間は available:false のまま（使えるふりをしない）。 */
  var ENGINE_CAPABILITY = {
    typst: { available: false, verified: false, version: null,
             reason: "この端末に Typst が入っているかどうかを、まだ確かめていません（準備中）。" },
    tex:   { available: false, verified: false, version: null,
             reason: "この端末に TeX が入っているかどうかを、まだ確かめていません（準備中）。" }
  };
  /* 「この端末で一度組版が通った」ことを覚えておく。

     これまでは画面を閉じると忘れていた。そのため、実際に組めるのに
     一覧では毎回「準備中」に戻り、**選べるレイアウトが 1 つしか無いように
     見えていた**（実測 2026-08-04）。
     覚えるのは「通ったことがある」という事実だけ。
     実行環境が無くなれば available が false になり、そちらが優先される。 */
  var VERIFIED_KEY = "vq2.engine.verified";
  function readVerified() {
    try { return JSON.parse(root.localStorage.getItem(VERIFIED_KEY) || "{}") || {}; }
    catch (e) { return {}; }
  }
  function writeVerified(id, on) {
    try {
      var v = readVerified();
      if (on) v[id] = true; else delete v[id];
      root.localStorage.setItem(VERIFIED_KEY, JSON.stringify(v));
    } catch (e) { /* 覚えられなくても動きは変えない */ }
  }

  function setEngineCapability(id, cap) {
    if (id !== "typst" && id !== "tex") return null;
    var everVerified = !!readVerified()[id];
    if (cap && cap.available && cap.verified) { everVerified = true; writeVerified(id, true); }
    ENGINE_CAPABILITY[id] = {
      available: !!(cap && cap.available),
      /* 一度でも組版と検証が通っていれば、次からは「使えます」。
         実行環境が無ければ available が false になるので、そちらで止まる。 */
      verified: !!(cap && cap.available && (cap.verified || everVerified)),
      version: (cap && cap.version) || null,
      /* 使えないのに理由が無いままにしない。「準備中」と分かる形で残す。 */
      reason: (cap && cap.reason)
        || (cap && cap.available ? "" : "Typst はまだ使えません（準備中）。")
    };
    return ENGINE_CAPABILITY[id];
  }
  function engineCapability(id) { return ENGINE_CAPABILITY[id] || null; }

  function engineStatus() {
    var t = ENGINE_CAPABILITY.typst || {};
    var x = ENGINE_CAPABILITY.tex || {};
    return {
      current: { id: "current", label: "現在の Quick Mock", available: true, verified: true,
                 note: "HTML/CSS の Paged Media で組み、ブラウザの印刷から PDF にします。" },
      typst:   { id: "typst", label: "Typst",
                 /* 実行環境があり、かつコンパイルと検証まで通ったときだけ使えるようにする。 */
                 available: !!(t.available && t.verified),
                 verified: !!t.verified,
                 version: t.version || null,
                 note: t.available
                   ? (t.verified
                       ? "Typst " + (t.version || "") + " で PDF を作ります。"
                       : "Typst " + (t.version || "") + " はありますが、コンパイルと検証がまだ通っていません（準備中）。")
                   : (t.reason || "Typst の実行環境が導入されていないため、まだ出力できません（準備中）。") },
      /* TeX も Typst と同じ扱いにする。実行環境があり、かつ組んで
         検証まで通ったときだけ「使える」。縦書きはこちらでしか作れない。 */
      tex:     { id: "tex", label: "TeX（upLaTeX）",
                 available: !!(x.available && x.verified),
                 verified: !!x.verified,
                 version: x.version || null,
                 note: x.available
                   ? (x.verified
                       ? "upLaTeX（" + (x.version || "") + "）+ dvipdfmx で PDF を作ります。"
                       : "upLaTeX（" + (x.version || "") + "）はありますが、組版と検証がまだ通っていません（準備中）。")
                   : (x.reason || "TeX（upLaTeX / dvipdfmx）の実行環境が導入されていないため、まだ出力できません（準備中）。") }
    };
  }
  /* 使えないエンジンを指定されたら、黙って通さない。
     理由を付けて current へ落とす（安全なフォールバック）。 */
  function resolveEngine(requested) {
    var st = engineStatus();
    var want = String(requested || "current");
    if (OUTPUT_ENGINES.indexOf(want) < 0) {
      return { engine: "current", fellBack: true,
               reason: "知らない出力エンジンです（" + want + "）。現在の形式で組みます。" };
    }
    if (st[want].available) return { engine: want, fellBack: false, reason: "" };
    return { engine: "current", fellBack: true, reason: st[want].note + " 現在の形式で組みます。" };
  }

  /* ══════════════════════════════════════════════════════════════════
     紙面デザインの選択肢（UI に出る並び）
     ・実装済みのものだけ profileId を持つ。
     ・未実装は profileId を null にして「準備中」と明示する。
       選ばれても現在の形式へ落とす（動くふりをしない）。
     ══════════════════════════════════════════════════════════════════ */
  /* ready の意味（ここを曖昧にしない）
       ready:true  … プロファイルの実体があり、**いまの Renderer が
                     その紙面の違いを実際に出せる**（選べば紙が変わる）
       ready:false … 定義はあるが、紙面処理がまだ追いついていない。
                     選んでも現在の形式で出す。pending に「何が足りないか」を書く。
     printable:false は「そもそも紙ではない」。紙の一覧から外して考える。 */
  var LAYOUT_MODES = [
    { id: "current",                label: "現在の形式",         profileId: null, ready: true,  printable: true },

    /* ── 仕様 §39 の 12 レイアウト ─────────────────────────── */
    { id: "standard-exam",     label: "一般試験・標準",     profileId: "exam-standard-a4",      ready: true,  printable: true },
    { id: "compact-exam",      label: "短問大量・高密度",   profileId: "exam-compact-dense",    ready: true,  printable: true },
    { id: "two-column",        label: "2 カラム",           profileId: "exam-two-column",       ready: false, printable: true,
      note: "紙面を 2 段に割る処理がまだありません（選ぶと現在の形式で出します）。" },
    { id: "spacious-worksheet", label: "授業プリント・余白広め", profileId: "worksheet-spacious", ready: true, printable: true },
    { id: "entrance-exam",     label: "入試・模試風",       profileId: "exam-entrance-mock",    ready: true,  printable: true },
    { id: "source-based-exam", label: "資料読解",           profileId: "exam-source-based",     ready: true,  printable: true },
    { id: "english-test",      label: "英語",               profileId: "exam-english",          ready: true,  printable: true },
    { id: "math-test",         label: "数学",               profileId: "exam-math",             ready: true,  printable: true },
    { id: "vocabulary-test",   label: "語彙・一問一答（表）", profileId: "test-vocabulary-table", ready: false, printable: true,
      note: "問題と解答欄を表に並べる処理がまだありません（選ぶと現在の形式で出します）。" },
    { id: "booklet",           label: "冊子（表紙・見開き）", profileId: "booklet-spread",       ready: false, printable: true,
      note: "表紙とのど（見開きの内側余白）を作る処理がまだありません（選ぶと現在の形式で出します）。" },
    { id: "minimal-premium",   label: "ミニマル（余白重視）", profileId: "premium-minimal",      ready: true,  printable: true },
    { id: "digital-mock",      label: "画面受験（紙ではない）", profileId: "digital-mock-screen", ready: false, printable: false,
      note: "画面で 1 問ずつ解くための設定です。紙には印刷しません。画面そのものはまだ作っていません。" },

    /* ── 実画像から起こした校正済みの紙面（先にあったもの）──── */
    { id: "school-science-figure",  label: "学校試験・図表重視", profileId: "school-science-figure-classic", ready: true, printable: true },

    /* ── 旧 ID。保存済みデータのために残す。実体は無い。────────
       新しい一覧（supersededBy）に同じ用途のものがあるので、
       画面の選択肢には出さない（visibleLayoutModes が外す）。 */
    { id: "school-standard",        label: "学校試験・標準",   profileId: null, ready: false, printable: true,
      deprecated: true, supersededBy: "standard-exam" },
    { id: "school-english-reading", label: "学校試験・英語長文", profileId: null, ready: false, printable: true,
      deprecated: true, supersededBy: "english-test" },
    { id: "common-test",            label: "共通テスト風",     profileId: null, ready: false, printable: true,
      deprecated: true, supersededBy: "entrance-exam" },
    /* 縦書きは HTML では組めない（TeX が要る）。置き換え先も無い。 */
    { id: "vertical-japanese",      label: "縦書き国語",       profileId: null, ready: false, printable: true,
      deprecated: false, supersededBy: null },

    { id: "auto",                   label: "AI おまかせ",      profileId: null, ready: true, printable: true }
  ];
  var ANSWER_SHEET_MODES = [
    { id: "current",       label: "現在の形式",     profileId: null, ready: true },
    { id: "grid-standard", label: "罫線型・標準",   profileId: "school-answer-grid-standard", ready: true },
    { id: "grid-dense",    label: "罫線型・高密度", profileId: "school-answer-grid-dense",    ready: true },
    { id: "written-heavy", label: "記述欄重視",     profileId: "school-answer-written",       ready: true },
    { id: "math-work",     label: "数学・計算欄つき", profileId: "school-answer-math-work",   ready: true },
    { id: "english-boxes", label: "英語・連続マス", profileId: "school-answer-english",       ready: true },
    { id: "mark-sheet",    label: "マーク中心",     profileId: "school-answer-mark",          ready: true },
    { id: "auto",          label: "AI おまかせ",    profileId: null, ready: true }
  ];
  /* ── 保存前の検証が見る ID の一覧 ───────────────────────────
     一覧の出どころはこのファイル（上の LAYOUT_MODES / ANSWER_SHEET_MODES）。
     domain/schema.js は保存前の検証のときにここを読む
     （layout-grammar.js の文書形式・教科レイアウトと同じやり方）。

     以前はここから S.LAYOUT_MODE_IDS を push で書き換えていた。
     そのため保存前の検証の正しさが「schema.js より後に layout-profiles.js が
     読み込まれること」に依存していて、読み込み順を変えると
     新しい紙面 ID が黙って弾かれる状態だった（build-v2.mjs の FILES では
     schema.js が 3 番目・layout-profiles.js が 40 番目）。
     いまは push をやめ、schema.js が呼ばれたときに向こうから読む。
     schema.js の控え（読み込まれない構成のため）とここが食い違ったら
     tests/layout-profiles.test.mjs が見つける。 */
  var LAYOUT_MODE_IDS = LAYOUT_MODES.map(function (m) { return m.id; });
  var ANSWER_SHEET_MODE_IDS = ANSWER_SHEET_MODES.map(function (m) { return m.id; });

  /* 画面に並べる紙面デザイン（旧 ID を外したもの）。 */
  function visibleLayoutModes() {
    return LAYOUT_MODES.filter(function (m) { return !m.deprecated; });
  }
  /* 旧 ID → 置き換え先。読み込みでは自動で置き換えない（勝手に紙面を変えない）。
     画面が「こちらへ移しますか」と聞くための材料。 */
  function migrateLayoutMode(id) {
    var m = LAYOUT_MODES.filter(function (x) { return x.id === id; })[0];
    return (m && m.deprecated && m.supersededBy) ? m.supersededBy : null;
  }

  /* ══════════════════════════════════════════════════════════════════
     プロファイル定義

     A. 問題用紙  school-science-figure-classic（学校試験・図表重視）
     B. 解答用紙  school-answer-grid-dense（学校試験・罫線型解答用紙）

     参考にした紙面の「考え方」を再利用できる形へ写したもの。
     1 対 1 の複製ではない。
     ══════════════════════════════════════════════════════════════════ */
  /* 問題形式の ID は domain/schema.js が唯一の出所。ここで新しい名前を作らない。
     supportedQuestionTypes に書いてよいのは、この一覧にある ID だけ。 */
  var ALL_QUESTION_TYPES = (S.LEGACY_QUESTION_TYPES || S.QUESTION_TYPES || []).slice();

  /* supportedQuestionTypes / unsupportedQuestionTypes の意味
       supported   … その紙面が想定して設計されている形式
                     （見出し・記号・欄の取り方がその形式に合っている）
       unsupported … その紙面では体裁が崩れる／向かない形式と、その理由。
                     「作れない」ではなく「この紙で出すと読みにくい」も正直に書く。
     2 つを合わせると必ず全形式になる（黙って落とす形式を作らない）。 */

  var PROFILES = {

    /* ── A. 問題用紙 ────────────────────────────────────────────
       縦長の学校配布プリント。装飾を抑え、明朝体で、余白は広め。
       図・表を本文の右か下に置けて、本文や選択肢へ重ならないこと。 */
    "school-science-figure-classic": {
      id: "school-science-figure-classic",
      name: "学校試験・図表重視",
      documentType: "question-paper",
      /* typst / tex はまだ組めないので互換に入れない（入れると使えるふりになる） */
      compatibleEngines: ["current"],
      /* いまの HTML Renderer がこの紙面の何を実際に出せるか。
         pending が空のときだけ、一覧で ready:true にしてよい。 */
      rendererSupport: { current: { level: "full",
        honored: ["用紙・余白", "本文の書体と大きさ", "行間", "設問どうしの空き",
                  "見出しの体裁", "選択肢の記号と段数", "図表の置き方"],
        pending: [] } },
      supportedSubjects: ["理科", "数学", "社会", "技術・家庭", "情報", "汎用"],
      supportedQuestionTypes: ["multiple_choice_single", "multiple_choice_multiple", "true_false",
                               "short_answer", "fill_blank", "numeric", "formula",
                               "matching", "ordering", "long_answer", "source_analysis"],
      unsupportedQuestionTypes: {
        essay: "1 ページの多くを図表が占めるため、長い論述の紙幅が残りません。",
        english_writing: "英作文のための紙面（罫線・語数の目安）を持っていません。"
      },

      paper: { size: "A4", orientation: "portrait", writingDirection: "horizontal", spread: false },
      margins: { top: 22, bottom: 20, left: 20, right: 20 },

      typography: {
        bodyFamily: "mincho",              /* 明朝体を中心にした組版 */
        headingFamily: "gothic",
        basePt: 10.5,
        minimumFontSize: 9,
        lineHeight: 1.9,
        numberStyle: "kanji-mixed"
      },

      /* 実画像は「中2理科　後期中間試験　問題用紙」の 1 行だけ。
         中央寄せでも罫線でもなく、科目・時間・満点の行も氏名欄も無い。 */
      header: {
        align: "left",
        rule: false,
        showMeta: false,          /* 科目・試験時間・満点の行を出さない */
        showNameBox: false,       /* 氏名欄は解答用紙が持つ */
        variants: ["left-simple", "left-with-subtitle"]
      },

      /* 「問1」の大問 */
      sectionStyle: {
        marker: "問{n}",
        markerFamily: "gothic",
        markerPt: 12,
        /* 実画像の問題用紙には配点が入っていない（配点は解答用紙が持つ）。
           出したい場合はここを true にする。 */
        showPoints: false,
        rule: "none",
        gapBeforeMm: 10,
        startsNewPageFrom: 2                /* 2 つ目以降の大問は原則ページ頭から */
      },

      /* 「（ア）（イ）（ウ）」形式の小問 */
      subQuestionStyle: {
        markers: ["（ア）", "（イ）", "（ウ）", "（エ）", "（オ）", "（カ）", "（キ）", "（ク）",
                  "（ケ）", "（コ）", "（サ）", "（シ）", "（ス）", "（セ）", "（ソ）", "（タ）"],
        markerFamily: "gothic",
        indentMm: 6,
        showPoints: false
      },

      questionFlow: {
        columns: 1,
        gapMmRange: [7, 13],               /* 問題ごとの空白。spacing variant で決める */
        keepQuestionWithChoices: true,     /* 問題文と選択肢を別ページへ割らない */
        keepQuestionWithFigure: true       /* 問題文と図表を別ページへ割らない */
      },

      /* 選択肢は 1〜4 を縦に並べるのが基本 */
      /* 実画像の選択肢は「1. 2. 3. 4.」。丸数字は使っていない。 */
      choiceLayout: {
        marker: "number-dot",              /* 1. 2. 3. 4. */
        variants: ["vertical", "two-column-short-only"],
        twoColumnMaxChars: 12,             /* 短い選択肢のときだけ 2 段にしてよい */
        indentMm: 8
      },

      /* 図表は問題文の一部として扱う。本文・選択肢へ重ねない。 */
      /* 実画像にある置き方だけを並べる。
         ・（ア）… 本文の下に「図・図・表」を横並びで中央（figure-table-row）
         ・（ウ）… 本文と選択肢を左、グラフを右（text-left-graph-right）
         複数の図表は 1 つの figureGroup として扱い、途中で切らない。 */
      figureRules: {
        variants: ["figure-below-centered", "figure-right", "figure-table-row",
                   "multi-figure-centered", "text-left-graph-right", "text-above-figures-below"],
        rightWidthPct: 40,                 /* 右に置くときの図の幅 */
        belowWidthPct: 74,
        centeredWidthPct: 62,
        rowWidthPct: 94,                   /* 横並びの帯ぜんたいの幅 */
        minGapMm: 6,                       /* 本文との最小のすきま */
        maxWidthPct: 94,
        captionPosition: "below",
        treatAsPartOfQuestion: true,
        /* 1 枚あたりがこれより細くなるなら、横並びをやめて縦に積む
           （小さくしすぎて読めない図を作らない） */
        minItemWidthMm: 34,
        maxRowItems: 3,
        keepGroupTogether: true,
        preserveAspectRatio: true
      },

      /* 問題用紙には解答欄を置かない（別紙に書かせる体裁） */
      answerCellRules: { inline: false },

      scoreArea: { onQuestionPaper: false },
      studentFields: [],

      /* Seed で選んでよい部品と、その候補。ここに無いものは選べない。 */
      variationRules: {
        header:        ["left-simple", "left-with-subtitle"],
        spacing:       ["relaxed", "standard"],
        choiceLayout:  ["vertical", "two-column-short-only"],
        /* 図が 1 点のとき／複数のときで選べるものが変わる（Planner が絞る） */
        figureLayout:  ["figure-below-centered", "figure-right", "figure-table-row",
                        "multi-figure-centered", "text-left-graph-right", "text-above-figures-below"],
        sectionMarker: ["boxed", "plain"]
      },

      /* 破ってはいけない線。Planner はここを超えられない。 */
      safetyConstraints: {
        minFontPt: 9,
        minGapMm: 5,
        maxFigureWidthPct: 94,
        maxColumns: 2,
        minQuestionGapMm: 6,
        forbidFigureOverlap: true,
        forbidOrphanHeading: true
      },
      version: "1.0.0"
    },

    /* ── B. 解答用紙 ────────────────────────────────────────────
       罫線で整理された高密度の答案。大問ごとに太い区切り線を引き、
       左に大問・小問の番号、右へ形式に合った解答欄を並べる。
       固定画像ではなく、問題数と形式から毎回組み立てる。 */
    "school-answer-grid-dense": {
      id: "school-answer-grid-dense",
      name: "学校試験・罫線型解答用紙",
      documentType: "answer-sheet",
      compatibleEngines: ["current"],
      rendererSupport: { current: { level: "full",
        honored: ["可変グリッド", "大問の枠と縦書きラベル", "配点による罫線の太さ",
                  "得点欄（斜線 + 満点）", "氏名欄"],
        pending: [] } },
      supportedSubjects: ["汎用"],
      supportedQuestionTypes: ALL_QUESTION_TYPES.slice(),
      unsupportedQuestionTypes: {},

      paper: { size: "A4", orientation: "portrait", writingDirection: "horizontal", spread: false },
      margins: { top: 16, bottom: 16, left: 14, right: 14 },

      typography: {
        bodyFamily: "gothic",
        headingFamily: "gothic",
        basePt: 9.5,
        minimumFontSize: 8,
        lineHeight: 1.5,
        numberStyle: "arabic"
      },

      /* 上部に学年・科目・考査名 */
      header: {
        showSubject: true, showGrade: true, showExamName: true, showDuration: false,
        variants: ["top-bar", "top-bar-with-rule"]
      },

      /* 大問ごとに太い区切り線 */
      sectionStyle: {
        marker: "{n}",
        rule: "thick",
        ruleWidthMm: 0.8,
        gapBeforeMm: 3,
        labelColumnMm: 12                  /* 左端の大問番号の欄 */
      },
      subQuestionStyle: {
        markers: ["(1)", "(2)", "(3)", "(4)", "(5)", "(6)", "(7)", "(8)",
                  "(9)", "(10)", "(11)", "(12)", "(13)", "(14)", "(15)", "(16)"],
        labelColumnMm: 12
      },

      questionFlow: { columns: 1, gapMmRange: [0, 2], keepSectionTogether: false },
      choiceLayout: { variants: [] },
      figureRules: { variants: [] },

      /* 問題形式ごとの解答欄。ここが「形式 → 欄」の唯一の対応表。 */
      answerCellRules: {
        inline: true,
        byType: {
          multiple_choice_single:   { cell: "mark",      widthMm: 18, heightMm: 9,  rows: 1 },
          multiple_choice_multiple: { cell: "mark-multi", widthMm: 34, heightMm: 9,  rows: 1 },
          true_false:               { cell: "truefalse", widthMm: 18, heightMm: 9,  rows: 1 },
          numeric:                  { cell: "short",     widthMm: 44, heightMm: 10, rows: 1 },
          short_answer:             { cell: "short",     widthMm: 62, heightMm: 10, rows: 1 },
          fill_blank:               { cell: "short",     widthMm: 62, heightMm: 10, rows: 1 },
          formula:                  { cell: "short",     widthMm: 90, heightMm: 12, rows: 1 },
          matching:                 { cell: "matching",  widthMm: 16, heightMm: 9,  rows: 1, perBlank: true },
          ordering:                 { cell: "ordering",  widthMm: 16, heightMm: 9,  rows: 1, perBlank: true },
          long_answer:              { cell: "written",   widthMm: 160, heightMm: 11, rows: 3 },
          source_analysis:          { cell: "written",   widthMm: 160, heightMm: 11, rows: 3 },
          essay:                    { cell: "essay",     widthMm: 160, heightMm: 11, rows: 8 },
          english_writing:          { cell: "essay",     widthMm: 160, heightMm: 11, rows: 8 }
        },
        fallback: { cell: "short", widthMm: 62, heightMm: 10, rows: 1 },
        /* 大問ごとの右端に置ける欄 */
        perSectionColumns: ["subtotal", "grader", "regrade"]
      },

      /* 大問別得点・合計・再採点
         実画像は右端に「斜線 + 満点」の欄（/42 /14 …）。
         下部は「3年 __組 __番 氏名 ____」と「/100」。 */
      scoreArea: {
        perSection: { subtotal: true, grader: false, regrade: false, widthMm: 16 },
        /* 斜線と満点を出す欄。実画像の「⁄42」に相当。 */
        denominator: { show: true, widthMm: 18, slash: true },
        total: { show: true, label: "", widthMm: 30, slash: true },
        regradeTotal: { show: false, label: "再採点", widthMm: 26 },
        position: "right"
      },

      /* ══ 可変グリッド（実画像 2 枚目の構造）══════════════════════
         ・大問ごとに独立した枠を作り、間にすきまを空ける
         ・左端は縦に結合した大問セル（縦書き）
         ・行の高さは中身で変える。同じ行に複数の小問を入れてよい
         ・配点は罫線の太さで表す（実画像の「1点配当 / 2点配当」）
         使ってよいセルの種類はここで閉じる。AI はこの外を書けない。 */
      grid: {
        enabled: true,
        cellTypes: ["section-label", "question-label", "small-box", "box-sequence",
                    "wide-answer", "lined-answer", "merged-answer", "fixed-label",
                    "score-cell", "score-denominator", "recheck-box", "student-field", "spacer"],
        columns: 24,                       /* 1 大問ぶんの論理列数。colSpan はこの中で足す */
        sectionGapMm: 4,                   /* 大問の枠どうしのすきま */
        outerBorderWidthMm: 0.6,
        innerBorderWidthMm: 0.2,
        /* 配点で罫線の太さを変える（実画像の凡例と同じ考え方） */
        pointBorder: { enabled: true, thickFromPoints: 2, thickWidthMm: 0.6, thinWidthMm: 0.2 },
        pointLegend: { show: true, labels: ["1点配当", "2点配当"] },
        sectionLabel: { widthMm: 10, writingMode: "vertical", template: "問題{n}" },
        questionLabel: { widthMm: 11 },
        subLabel: { widthMm: 9 },
        rowHeightMm: { min: 8, default: 10, lined: 9, boxSeq: 9 },
        /* 同じ行へまとめてよい小問の数（Seed で 1〜3 の範囲で変わる） */
        rowGroupMax: 3,
        cellMinWidthMm: 8,
        cellMinHeightMm: 8
      },

      /* 問題の中身から解答欄の形を決めるときの当てはめ表。
         answerLayoutHint が指定されていれば、そちらが優先される。 */
      answerShapes: {
        "small-box":     { widthMm: 16, heightMm: 9,  rows: 1 },
        "box-sequence":  { widthMm: 7,  heightMm: 9,  rows: 1 },
        "wide-answer":   { widthMm: 56, heightMm: 10, rows: 1 },
        "lined-answer":  { widthMm: 150, heightMm: 9, rows: 3 },
        "merged-answer": { widthMm: 150, heightMm: 11, rows: 1 },
        "fixed-label":   { widthMm: 9,  heightMm: 9,  rows: 1 }
      },

      /* 下部に 年・組・番・氏名 */
      studentFields: [
        { key: "year",  label: "年",   widthMm: 14 },
        { key: "class", label: "組",   widthMm: 14 },
        { key: "no",    label: "番",   widthMm: 14 },
        { key: "name",  label: "氏名", widthMm: 56 }
      ],
      studentFieldsPosition: "bottom",

      /* Seed で変えてよいのはここに並ぶものだけ。
         問題番号・解答番号・欄の数・文字数・配点・対応は **変えない**。 */
      variationRules: {
        header:      ["top-bar", "top-bar-with-rule"],
        density:     ["dense", "standard"],
        scoreColumn: ["right", "right-with-regrade"],
        markCell:    ["box", "circle"],
        rowGrouping: ["single", "pair", "triple"],   /* 同じ行にまとめる小問の数 */
        answerWidth: ["narrow", "standard", "wide"], /* 解答欄の横幅 */
        sectionGap:  ["tight", "standard", "loose"], /* 大問ブロック間のすきま */
        scorePlace:  ["right", "right-bottom"],      /* 得点欄の置き場所 */
        nameWidth:   ["standard", "wide"],           /* 氏名欄の幅 */
        writtenRows: ["min", "standard", "plus"]     /* 記述欄の行数（下限は守る） */
      },

      safetyConstraints: {
        minFontPt: 8,
        minCellHeightMm: 8,
        minCellWidthMm: 8,
        minGapMm: 1,
        maxColumns: 24,
        forbidOrphanHeading: true,
        requireOneCellPerQuestion: true,   /* 欄の数は設問の数と必ず一致させる */
        /* 記述の最小記入面積。ここを下回る欄は作らない。 */
        minWriteAreaMm2: { "wide-answer": 400, "lined-answer": 1200, "merged-answer": 900 }
      },
      version: "1.0.0"
    },

    /* ══════════════════════════════════════════════════════════════
       C. 仕様 §39 の 12 レイアウト（問題用紙）

       守っていること
         ・色だけを変えたものを作らない。余白・段組み・行間・
           見出しの出し方・図表の置き方・設問どうしの空きが実際に違う。
         ・図表の置き方は、いま組める 6 通りの中からだけ選ぶ。
           新しい置き方の名前を作っても紙面処理が無いので、増やさない。
         ・どの紙面も figure-below-centered と multi-figure-centered を
           必ず持つ（候補が尽きたときの受け皿がここになるため）。
       ══════════════════════════════════════════════════════════════ */

    /* ── 1. 一般的な学校試験 ─────────────────────────────────
       いちばん普通の縦 A4・1 カラム。試験名の下に科目と満点、氏名欄。
       大問は「1」「2」、小問は「(1)」。配点を出す。 */
    "exam-standard-a4": {
      id: "exam-standard-a4",
      name: "一般試験・標準",
      documentType: "question-paper",
      compatibleEngines: ["current"],
      rendererSupport: { current: { level: "full",
        honored: ["用紙・余白", "本文の書体と大きさ", "行間", "設問どうしの空き",
                  "中央寄せの見出しと罫線", "科目・時間・満点の行", "氏名欄",
                  "配点の表示", "選択肢の段数", "図表の置き方", "ページ番号"],
        pending: [] } },
      supportedSubjects: ["国語", "数学", "英語", "理科", "社会", "情報", "汎用"],
      supportedQuestionTypes: ALL_QUESTION_TYPES.slice(),
      unsupportedQuestionTypes: {},

      paper: { size: "A4", orientation: "portrait", writingDirection: "horizontal", spread: false },
      margins: { top: 20, bottom: 18, left: 18, right: 18 },

      typography: {
        bodyFamily: "mincho",
        headingFamily: "gothic",
        basePt: 10.5,
        minimumFontSize: 9,
        lineHeight: 1.75,
        numberStyle: "arabic"
      },

      /* 学校の試験らしく、中央に試験名・下に科目と満点・氏名欄。 */
      header: {
        align: "center",
        rule: true,
        showMeta: true,
        showNameBox: true,
        variants: ["centered-with-meta"]
      },

      sectionStyle: {
        marker: "{n}",
        markerFamily: "gothic",
        markerPt: 12,
        showPoints: true,
        rule: "none",
        gapBeforeMm: 8,
        startsNewPageFrom: 0            /* 大問でページを変えない（紙を節約する） */
      },
      subQuestionStyle: {
        markers: ["(1)", "(2)", "(3)", "(4)", "(5)", "(6)", "(7)", "(8)",
                  "(9)", "(10)", "(11)", "(12)", "(13)", "(14)", "(15)", "(16)"],
        markerFamily: "gothic",
        indentMm: 5,
        showPoints: true
      },

      questionFlow: {
        columns: 1,
        gapMmRange: [8, 12],
        keepQuestionWithChoices: true,
        keepQuestionWithFigure: true
      },

      choiceLayout: {
        marker: "number-dot",
        variants: ["vertical", "two-column-short-only"],
        twoColumnMaxChars: 14,
        fourColumnMaxChars: 0,
        indentMm: 8
      },

      figureRules: {
        variants: ["figure-below-centered", "figure-right", "multi-figure-centered",
                   "figure-table-row", "text-above-figures-below"],
        rightWidthPct: 42, belowWidthPct: 70, centeredWidthPct: 60, rowWidthPct: 90,
        minGapMm: 6, maxWidthPct: 90, captionPosition: "below",
        treatAsPartOfQuestion: true, minItemWidthMm: 34, maxRowItems: 3,
        keepGroupTogether: true, preserveAspectRatio: true
      },

      /* 解答は別紙。問題用紙には欄を置かない。 */
      answerCellRules: { inline: false },
      scoreArea: { onQuestionPaper: false },
      /* 氏名欄は header.showNameBox が出す（項目は Renderer 側の固定：組・番・氏名）。 */
      studentFields: [],

      variationRules: {
        spacing:       ["standard", "relaxed"],
        choiceLayout:  ["vertical", "two-column-short-only"],
        figureLayout:  ["figure-below-centered", "figure-right", "multi-figure-centered",
                        "figure-table-row", "text-above-figures-below"],
        sectionMarker: ["boxed", "plain"]
      },
      safetyConstraints: {
        minFontPt: 9, minGapMm: 5, maxFigureWidthPct: 90, maxColumns: 2,
        minQuestionGapMm: 7, forbidFigureOverlap: true, forbidOrphanHeading: true
      },
      version: "1.0.0"
    },

    /* ── 2. 短問大量・高密度 ─────────────────────────────────
       余白も行間も詰めて、1 ページに多く載せる。選択式が中心。
       短い選択肢は 4 段まで横に並べる。 */
    "exam-compact-dense": {
      id: "exam-compact-dense",
      name: "短問大量・高密度",
      documentType: "question-paper",
      compatibleEngines: ["current"],
      rendererSupport: { current: { level: "full",
        honored: ["狭い余白", "小さめの本文", "詰めた行間", "狭い設問間隔",
                  "選択肢の 2 段・4 段", "図表の置き方"],
        pending: [] } },
      supportedSubjects: ["社会", "理科", "英語", "情報", "汎用"],
      supportedQuestionTypes: ["multiple_choice_single", "multiple_choice_multiple", "true_false",
                               "short_answer", "fill_blank", "numeric", "matching", "ordering",
                               "formula"],
      unsupportedQuestionTypes: {
        long_answer: "行間と余白を詰めた紙面のため、長い設問文と記述は読みにくくなります。",
        essay: "論述を読ませるだけの余白がありません。",
        english_writing: "英作文の設問を置くには 1 問あたりの面積が足りません。",
        source_analysis: "資料を読ませる余白が取れません（資料読解を使ってください）。"
      },

      paper: { size: "A4", orientation: "portrait", writingDirection: "horizontal", spread: false },
      margins: { top: 13, bottom: 12, left: 12, right: 12 },

      typography: {
        bodyFamily: "gothic",
        headingFamily: "gothic",
        basePt: 9.5,
        minimumFontSize: 8.5,
        lineHeight: 1.45,
        numberStyle: "arabic"
      },

      header: {
        align: "left", rule: false, showMeta: true, showNameBox: true,
        variants: ["left-with-meta"]
      },

      sectionStyle: {
        marker: "{n}", markerFamily: "gothic", markerPt: 10.5,
        showPoints: false, rule: "none", gapBeforeMm: 4, startsNewPageFrom: 0
      },
      subQuestionStyle: {
        markers: ["(1)", "(2)", "(3)", "(4)", "(5)", "(6)", "(7)", "(8)",
                  "(9)", "(10)", "(11)", "(12)", "(13)", "(14)", "(15)", "(16)"],
        markerFamily: "gothic", indentMm: 3, showPoints: false
      },

      questionFlow: {
        columns: 1, gapMmRange: [4, 6],
        keepQuestionWithChoices: true, keepQuestionWithFigure: true
      },

      choiceLayout: {
        marker: "number-dot",
        variants: ["vertical", "two-column-short-only", "four-column-short-only"],
        twoColumnMaxChars: 20, fourColumnMaxChars: 8, indentMm: 5
      },

      figureRules: {
        variants: ["figure-below-centered", "figure-right", "multi-figure-centered",
                   "text-above-figures-below"],
        rightWidthPct: 36, belowWidthPct: 52, centeredWidthPct: 48, rowWidthPct: 86,
        minGapMm: 4, maxWidthPct: 86, captionPosition: "below",
        treatAsPartOfQuestion: true, minItemWidthMm: 30, maxRowItems: 3,
        keepGroupTogether: true, preserveAspectRatio: true
      },

      answerCellRules: { inline: false },
      scoreArea: { onQuestionPaper: false },
      studentFields: [],

      variationRules: {
        spacing:       ["standard", "relaxed"],
        choiceLayout:  ["vertical", "two-column-short-only", "four-column-short-only"],
        figureLayout:  ["figure-below-centered", "figure-right", "multi-figure-centered",
                        "text-above-figures-below"],
        sectionMarker: ["plain", "boxed"]
      },
      safetyConstraints: {
        minFontPt: 8.5, minGapMm: 3, maxFigureWidthPct: 86, maxColumns: 4,
        minQuestionGapMm: 4, forbidFigureOverlap: true, forbidOrphanHeading: true
      },
      version: "1.0.0"
    },

    /* ── 3. 2 カラム ─────────────────────────────────────────
       英単語・漢字・正誤・短い選択のように、1 問が短いものを 2 段に流す。
       ※ 紙面を 2 段に割る処理がまだ無いので、一覧では準備中にしてある。 */
    "exam-two-column": {
      id: "exam-two-column",
      name: "2 カラム",
      documentType: "question-paper",
      compatibleEngines: ["current"],
      rendererSupport: { current: { level: "partial",
        honored: ["用紙・余白", "本文の大きさ", "行間", "設問間隔", "選択肢の段数"],
        pending: ["本文を 2 段に割る組み方（段の高さ合わせ・段またぎの禁止）"] } },
      supportedSubjects: ["英語", "国語", "社会", "理科", "汎用"],
      supportedQuestionTypes: ["multiple_choice_single", "multiple_choice_multiple", "true_false",
                               "short_answer", "fill_blank", "numeric", "matching", "ordering"],
      unsupportedQuestionTypes: {
        long_answer: "段が狭いため、長い設問文が何度も折り返して読みにくくなります。",
        essay: "段の幅では論述の設問を置けません。",
        english_writing: "英作文は段をまたぐため、この紙面には向きません。",
        source_analysis: "資料は段の幅に収まりません。",
        formula: "数式が段の幅に収まらないことがあります。"
      },

      paper: { size: "A4", orientation: "portrait", writingDirection: "horizontal", spread: false },
      margins: { top: 16, bottom: 15, left: 14, right: 14 },

      typography: {
        bodyFamily: "gothic", headingFamily: "gothic",
        basePt: 9.5, minimumFontSize: 8.5, lineHeight: 1.6, numberStyle: "arabic"
      },

      header: { align: "left", rule: true, showMeta: true, showNameBox: true,
                variants: ["left-with-meta"] },

      sectionStyle: {
        marker: "{n}", markerFamily: "gothic", markerPt: 11,
        showPoints: false, rule: "none", gapBeforeMm: 5, startsNewPageFrom: 0,
        spanAllColumns: true            /* 大問の見出しは 2 段をまたいで 1 行にする */
      },
      subQuestionStyle: {
        markers: ["(1)", "(2)", "(3)", "(4)", "(5)", "(6)", "(7)", "(8)",
                  "(9)", "(10)", "(11)", "(12)", "(13)", "(14)", "(15)", "(16)"],
        markerFamily: "gothic", indentMm: 3, showPoints: false
      },

      questionFlow: {
        columns: 2, columnGapMm: 8, balanceColumns: true,
        gapMmRange: [5, 7],
        keepQuestionWithChoices: true, keepQuestionWithFigure: true
      },

      choiceLayout: {
        marker: "number-dot",
        variants: ["vertical", "two-column-short-only"],
        twoColumnMaxChars: 8, fourColumnMaxChars: 0, indentMm: 4
      },

      /* 段が狭いので、図は段の中に収まる大きさだけを許す。 */
      figureRules: {
        variants: ["figure-below-centered", "multi-figure-centered", "text-above-figures-below"],
        rightWidthPct: 40, belowWidthPct: 88, centeredWidthPct: 84, rowWidthPct: 88,
        minGapMm: 4, maxWidthPct: 88, captionPosition: "below",
        treatAsPartOfQuestion: true, minItemWidthMm: 26, maxRowItems: 2,
        keepGroupTogether: true, preserveAspectRatio: true
      },

      answerCellRules: { inline: false },
      scoreArea: { onQuestionPaper: false },
      studentFields: [],

      variationRules: {
        spacing:       ["standard", "relaxed"],
        choiceLayout:  ["vertical", "two-column-short-only"],
        figureLayout:  ["figure-below-centered", "multi-figure-centered", "text-above-figures-below"],
        sectionMarker: ["plain"]
      },
      safetyConstraints: {
        minFontPt: 8.5, minGapMm: 3, maxFigureWidthPct: 88, maxColumns: 2,
        minQuestionGapMm: 4, forbidFigureOverlap: true, forbidOrphanHeading: true
      },
      version: "1.0.0"
    },

    /* ── 4. 授業プリント（余白広め）─────────────────────────
       解答欄を罫線で作るのではなく、**設問どうしの大きな空き**を
       そのまま書き込み場所にする。いまの Renderer が出せるのはこの空きだけ。 */
    "worksheet-spacious": {
      id: "worksheet-spacious",
      name: "授業プリント・余白広め",
      documentType: "question-paper",
      compatibleEngines: ["current"],
      rendererSupport: { current: { level: "full",
        honored: ["広い余白", "大きめの本文", "広い行間",
                  "設問どうしの大きな空き（＝書き込み場所）", "図表の置き方"],
        pending: [] } },
      supportedSubjects: ["国語", "数学", "英語", "理科", "社会", "汎用"],
      supportedQuestionTypes: ALL_QUESTION_TYPES.slice(),
      unsupportedQuestionTypes: {},

      paper: { size: "A4", orientation: "portrait", writingDirection: "horizontal", spread: false },
      margins: { top: 26, bottom: 24, left: 24, right: 24 },

      typography: {
        bodyFamily: "gothic", headingFamily: "gothic",
        basePt: 11.5, minimumFontSize: 10.5, lineHeight: 2.15, numberStyle: "arabic"
      },

      header: { align: "left", rule: false, showMeta: false, showNameBox: true,
                variants: ["left-simple"] },

      sectionStyle: {
        marker: "{n}", markerFamily: "gothic", markerPt: 13,
        showPoints: false, rule: "none", gapBeforeMm: 14, startsNewPageFrom: 0
      },
      subQuestionStyle: {
        markers: ["(1)", "(2)", "(3)", "(4)", "(5)", "(6)", "(7)", "(8)",
                  "(9)", "(10)", "(11)", "(12)", "(13)", "(14)", "(15)", "(16)"],
        markerFamily: "gothic", indentMm: 6, showPoints: false
      },

      questionFlow: {
        columns: 1, gapMmRange: [18, 26],
        keepQuestionWithChoices: true, keepQuestionWithFigure: true
      },

      choiceLayout: {
        marker: "number-dot", variants: ["vertical"],
        twoColumnMaxChars: 0, fourColumnMaxChars: 0, indentMm: 10
      },

      figureRules: {
        variants: ["figure-below-centered", "multi-figure-centered", "text-above-figures-below"],
        rightWidthPct: 40, belowWidthPct: 64, centeredWidthPct: 58, rowWidthPct: 88,
        minGapMm: 8, maxWidthPct: 88, captionPosition: "below",
        treatAsPartOfQuestion: true, minItemWidthMm: 36, maxRowItems: 2,
        keepGroupTogether: true, preserveAspectRatio: true
      },

      /* 罫線の欄は作らない。空きで確保する（作れないものを作れると書かない）。 */
      answerCellRules: { inline: true, mode: "open-space", spaceFromQuestionGap: true },
      scoreArea: { onQuestionPaper: false },
      studentFields: [],

      variationRules: {
        spacing:       ["standard", "relaxed"],
        choiceLayout:  ["vertical"],
        figureLayout:  ["figure-below-centered", "multi-figure-centered", "text-above-figures-below"],
        sectionMarker: ["plain", "boxed"]
      },
      safetyConstraints: {
        minFontPt: 10.5, minGapMm: 8, maxFigureWidthPct: 88, maxColumns: 1,
        minQuestionGapMm: 16, forbidFigureOverlap: true, forbidOrphanHeading: true
      },
      version: "1.0.0"
    },

    /* ── 5. 入試・模試風 ─────────────────────────────────────
       B5 縦。大問ごとにページを変え、長文と設問の階層をはっきりさせる。 */
    "exam-entrance-mock": {
      id: "exam-entrance-mock",
      name: "入試・模試風",
      documentType: "question-paper",
      compatibleEngines: ["current"],
      rendererSupport: { current: { level: "full",
        honored: ["B5 の用紙", "余白", "大問ごとの改ページ", "「第 n 問」の見出し",
                  "小問「問 n」", "行間", "図表の置き方", "ページ番号"],
        pending: [] } },
      supportedSubjects: ["国語", "数学", "理科", "社会", "汎用"],
      supportedQuestionTypes: ["multiple_choice_single", "multiple_choice_multiple", "true_false",
                               "short_answer", "fill_blank", "numeric", "formula", "matching",
                               "ordering", "long_answer", "essay", "source_analysis"],
      unsupportedQuestionTypes: {
        english_writing: "英作文の解答欄はこの紙面に持たせていません（英語は「英語」を使ってください）。"
      },

      paper: { size: "B5", orientation: "portrait", writingDirection: "horizontal", spread: false },
      margins: { top: 20, bottom: 18, left: 16, right: 16 },

      typography: {
        bodyFamily: "mincho", headingFamily: "gothic",
        basePt: 10, minimumFontSize: 9, lineHeight: 1.85, numberStyle: "kanji-mixed"
      },

      header: { align: "center", rule: true, showMeta: true, showNameBox: false,
                variants: ["centered-with-meta"] },

      sectionStyle: {
        marker: "第{n}問", markerFamily: "gothic", markerPt: 12.5,
        showPoints: true, rule: "none", gapBeforeMm: 6,
        startsNewPageFrom: 1              /* 大問はページの頭から始める */
      },
      subQuestionStyle: {
        markers: ["問1", "問2", "問3", "問4", "問5", "問6", "問7", "問8",
                  "問9", "問10", "問11", "問12", "問13", "問14", "問15", "問16"],
        markerFamily: "gothic", indentMm: 4, showPoints: true
      },

      questionFlow: {
        columns: 1, gapMmRange: [7, 10],
        keepQuestionWithChoices: true, keepQuestionWithFigure: true
      },

      choiceLayout: {
        marker: "number-dot", variants: ["vertical", "two-column-short-only"],
        twoColumnMaxChars: 12, fourColumnMaxChars: 0, indentMm: 7
      },

      figureRules: {
        variants: ["figure-below-centered", "figure-right", "multi-figure-centered",
                   "figure-table-row", "text-above-figures-below"],
        rightWidthPct: 38, belowWidthPct: 72, centeredWidthPct: 66, rowWidthPct: 92,
        minGapMm: 5, maxWidthPct: 92, captionPosition: "below",
        treatAsPartOfQuestion: true, minItemWidthMm: 32, maxRowItems: 3,
        keepGroupTogether: true, preserveAspectRatio: true
      },

      answerCellRules: { inline: false },
      scoreArea: { onQuestionPaper: false },
      studentFields: [],

      variationRules: {
        spacing:       ["standard", "relaxed"],
        choiceLayout:  ["vertical", "two-column-short-only"],
        figureLayout:  ["figure-below-centered", "figure-right", "multi-figure-centered",
                        "figure-table-row", "text-above-figures-below"],
        sectionMarker: ["boxed", "plain"]
      },
      safetyConstraints: {
        minFontPt: 9, minGapMm: 4, maxFigureWidthPct: 92, maxColumns: 2,
        minQuestionGapMm: 6, forbidFigureOverlap: true, forbidOrphanHeading: true
      },
      version: "1.0.0"
    },

    /* ── 6. 資料読解 ─────────────────────────────────────────
       資料（図・表・グラフ）を大きく置き、その設問を必ず同じページに置く。
       左右の余白を広く取り、資料の帯を紙の中央に通す。 */
    "exam-source-based": {
      id: "exam-source-based",
      name: "資料読解",
      documentType: "question-paper",
      compatibleEngines: ["current"],
      rendererSupport: { current: { level: "full",
        honored: ["広い左右余白", "大きな資料の帯", "資料と設問を同じ枠に入れる",
                  "資料の見出し（キャプション）", "設問どうしの空き"],
        pending: [] } },
      supportedSubjects: ["社会", "理科", "国語", "情報", "汎用"],
      supportedQuestionTypes: ["source_analysis", "long_answer", "short_answer",
                               "multiple_choice_single", "multiple_choice_multiple", "true_false",
                               "fill_blank", "matching", "ordering", "numeric", "essay"],
      unsupportedQuestionTypes: {
        formula: "資料の脇に数式の展開を置く紙面ではありません（数学を使ってください）。",
        english_writing: "英作文のための紙面を持っていません。"
      },

      paper: { size: "A4", orientation: "portrait", writingDirection: "horizontal", spread: false },
      margins: { top: 18, bottom: 16, left: 20, right: 20 },

      typography: {
        bodyFamily: "mincho", headingFamily: "gothic",
        basePt: 10, minimumFontSize: 9, lineHeight: 1.7, numberStyle: "arabic"
      },

      header: { align: "left", rule: true, showMeta: true, showNameBox: false,
                variants: ["left-with-meta"] },

      sectionStyle: {
        marker: "第{n}問", markerFamily: "gothic", markerPt: 12,
        showPoints: true, rule: "none", gapBeforeMm: 9, startsNewPageFrom: 2
      },
      subQuestionStyle: {
        markers: ["問1", "問2", "問3", "問4", "問5", "問6", "問7", "問8",
                  "問9", "問10", "問11", "問12", "問13", "問14", "問15", "問16"],
        markerFamily: "gothic", indentMm: 5, showPoints: true
      },

      questionFlow: {
        columns: 1, gapMmRange: [9, 14],
        keepQuestionWithChoices: true, keepQuestionWithFigure: true
      },

      choiceLayout: {
        marker: "number-dot", variants: ["vertical"],
        twoColumnMaxChars: 0, fourColumnMaxChars: 0, indentMm: 8
      },

      /* 資料は大きく。1 点なら本文の上下いっぱい、複数なら横に並べる。 */
      figureRules: {
        variants: ["figure-below-centered", "multi-figure-centered", "figure-table-row",
                   "text-above-figures-below", "text-left-graph-right"],
        rightWidthPct: 46, belowWidthPct: 86, centeredWidthPct: 80, rowWidthPct: 92,
        minGapMm: 7, maxWidthPct: 92, captionPosition: "below",
        treatAsPartOfQuestion: true, minItemWidthMm: 38, maxRowItems: 3,
        keepGroupTogether: true, preserveAspectRatio: true
      },

      answerCellRules: { inline: false },
      scoreArea: { onQuestionPaper: false },
      studentFields: [],

      variationRules: {
        spacing:       ["standard", "relaxed"],
        choiceLayout:  ["vertical"],
        figureLayout:  ["figure-below-centered", "multi-figure-centered", "figure-table-row",
                        "text-above-figures-below", "text-left-graph-right"],
        sectionMarker: ["boxed", "plain"]
      },
      safetyConstraints: {
        minFontPt: 9, minGapMm: 6, maxFigureWidthPct: 92, maxColumns: 1,
        minQuestionGapMm: 8, forbidFigureOverlap: true, forbidOrphanHeading: true
      },
      version: "1.0.0"
    },

    /* ── 7. 英語 ─────────────────────────────────────────────
       長文・会話文・語彙・文法・英作文・語句整序。
       英語は行間を広く取らないと書き込めないので、いちばん行間が広い。 */
    "exam-english": {
      id: "exam-english",
      name: "英語",
      documentType: "question-paper",
      compatibleEngines: ["current"],
      rendererSupport: { current: { level: "full",
        honored: ["広い左右余白", "広い行間", "選択肢の記号（A. B. C.）",
                  "会話文・長文のブロック", "設問どうしの空き"],
        pending: [] } },
      supportedSubjects: ["英語"],
      supportedQuestionTypes: ["multiple_choice_single", "multiple_choice_multiple", "true_false",
                               "short_answer", "fill_blank", "ordering", "matching",
                               "english_writing", "essay", "long_answer", "source_analysis"],
      unsupportedQuestionTypes: {
        numeric: "英語の紙面に数値解答の欄は置いていません。",
        formula: "数式のための余白を持っていません。"
      },

      paper: { size: "A4", orientation: "portrait", writingDirection: "horizontal", spread: false },
      margins: { top: 22, bottom: 20, left: 22, right: 22 },

      typography: {
        bodyFamily: "mincho", headingFamily: "gothic",
        basePt: 10.5, minimumFontSize: 9.5, lineHeight: 2.0, numberStyle: "arabic"
      },

      header: { align: "center", rule: true, showMeta: true, showNameBox: true,
                variants: ["centered-with-meta"] },

      sectionStyle: {
        marker: "Part {n}", markerFamily: "gothic", markerPt: 12,
        showPoints: true, rule: "none", gapBeforeMm: 10, startsNewPageFrom: 2
      },
      subQuestionStyle: {
        markers: ["(1)", "(2)", "(3)", "(4)", "(5)", "(6)", "(7)", "(8)",
                  "(9)", "(10)", "(11)", "(12)", "(13)", "(14)", "(15)", "(16)"],
        markerFamily: "gothic", indentMm: 5, showPoints: true
      },

      questionFlow: {
        columns: 1, gapMmRange: [10, 15],
        keepQuestionWithChoices: true, keepQuestionWithFigure: true
      },

      /* 英語の選択肢は A. B. C.。長めでも 2 段に置ける。 */
      choiceLayout: {
        marker: "alpha", variants: ["vertical", "two-column-short-only"],
        twoColumnMaxChars: 20, fourColumnMaxChars: 0, indentMm: 8
      },

      figureRules: {
        variants: ["figure-below-centered", "multi-figure-centered", "figure-right",
                   "text-above-figures-below"],
        rightWidthPct: 34, belowWidthPct: 62, centeredWidthPct: 56, rowWidthPct: 84,
        minGapMm: 6, maxWidthPct: 84, captionPosition: "below",
        treatAsPartOfQuestion: true, minItemWidthMm: 34, maxRowItems: 2,
        keepGroupTogether: true, preserveAspectRatio: true
      },

      answerCellRules: { inline: false },
      scoreArea: { onQuestionPaper: false },
      studentFields: [],

      variationRules: {
        spacing:       ["standard", "relaxed"],
        choiceLayout:  ["vertical", "two-column-short-only"],
        figureLayout:  ["figure-below-centered", "multi-figure-centered", "figure-right",
                        "text-above-figures-below"],
        sectionMarker: ["plain", "boxed"]
      },
      safetyConstraints: {
        minFontPt: 9.5, minGapMm: 6, maxFigureWidthPct: 84, maxColumns: 2,
        minQuestionGapMm: 9, forbidFigureOverlap: true, forbidOrphanHeading: true
      },
      version: "1.0.0"
    },

    /* ── 8. 数学 ─────────────────────────────────────────────
       数式が縦に伸びるので本文を大きめ・行間も広め、
       設問どうしの空きを大きく取って図形を描ける場所を残す。
       途中式・証明の欄は解答用紙（数学・計算欄つき）が持つ。 */
    "exam-math": {
      id: "exam-math",
      name: "数学",
      documentType: "question-paper",
      compatibleEngines: ["current"],
      rendererSupport: { current: { level: "full",
        honored: ["大きめの本文", "広い行間（数式が重ならない）",
                  "設問どうしの大きな空き", "図形を大きく置く", "図は横に 2 点まで"],
        pending: [] } },
      supportedSubjects: ["数学", "物理", "情報"],
      supportedQuestionTypes: ["numeric", "formula", "short_answer", "fill_blank", "long_answer",
                               "multiple_choice_single", "multiple_choice_multiple", "true_false",
                               "matching", "ordering"],
      unsupportedQuestionTypes: {
        essay: "数学の紙面に長い論述の設問は置きません（証明は long_answer で扱います）。",
        english_writing: "英作文のための紙面ではありません。",
        source_analysis: "資料を読ませる紙面ではありません（資料読解を使ってください）。"
      },
      /* 途中式・証明の欄をどこに作るか。**この紙ではなく解答用紙側**に作る。
         問題用紙に罫線の欄を置く処理はまだ無いので、そう書かない。 */
      workAreaPlacement: "answer-sheet",

      paper: { size: "A4", orientation: "portrait", writingDirection: "horizontal", spread: false },
      margins: { top: 20, bottom: 20, left: 16, right: 16 },

      typography: {
        bodyFamily: "mincho", headingFamily: "gothic",
        basePt: 11, minimumFontSize: 10, lineHeight: 1.9, numberStyle: "arabic"
      },

      header: { align: "left", rule: true, showMeta: true, showNameBox: true,
                variants: ["left-with-meta"] },

      sectionStyle: {
        marker: "大問{n}", markerFamily: "gothic", markerPt: 12.5,
        showPoints: true, rule: "none", gapBeforeMm: 12, startsNewPageFrom: 0
      },
      subQuestionStyle: {
        markers: ["(1)", "(2)", "(3)", "(4)", "(5)", "(6)", "(7)", "(8)",
                  "(9)", "(10)", "(11)", "(12)", "(13)", "(14)", "(15)", "(16)"],
        markerFamily: "gothic", indentMm: 6, showPoints: true
      },

      questionFlow: {
        columns: 1, gapMmRange: [14, 20],
        keepQuestionWithChoices: true, keepQuestionWithFigure: true
      },

      choiceLayout: {
        marker: "number-dot", variants: ["vertical", "two-column-short-only"],
        twoColumnMaxChars: 10, fourColumnMaxChars: 0, indentMm: 8
      },

      /* 図形は大きく。横に並べるのは 2 点まで（細くすると読めない）。 */
      figureRules: {
        variants: ["figure-below-centered", "figure-right", "multi-figure-centered",
                   "text-above-figures-below"],
        rightWidthPct: 44, belowWidthPct: 60, centeredWidthPct: 54, rowWidthPct: 82,
        minGapMm: 8, maxWidthPct: 82, captionPosition: "below",
        treatAsPartOfQuestion: true, minItemWidthMm: 40, maxRowItems: 2,
        keepGroupTogether: true, preserveAspectRatio: true
      },

      answerCellRules: { inline: false },
      scoreArea: { onQuestionPaper: false },
      studentFields: [],

      variationRules: {
        spacing:       ["standard", "relaxed"],
        choiceLayout:  ["vertical", "two-column-short-only"],
        figureLayout:  ["figure-below-centered", "figure-right", "multi-figure-centered",
                        "text-above-figures-below"],
        sectionMarker: ["boxed", "plain"]
      },
      safetyConstraints: {
        minFontPt: 10, minGapMm: 7, maxFigureWidthPct: 82, maxColumns: 2,
        minQuestionGapMm: 12, forbidFigureOverlap: true, forbidOrphanHeading: true
      },
      version: "1.0.0"
    },

    /* ── 9. 語彙・一問一答（表）──────────────────────────────
       1 行 1 問で、問題と解答欄を縦にそろえる。大量の語彙向け。
       ※ 表として並べる処理がまだ無いので、一覧では準備中にしてある。 */
    "test-vocabulary-table": {
      id: "test-vocabulary-table",
      name: "語彙・一問一答（表）",
      documentType: "question-paper",
      compatibleEngines: ["current"],
      rendererSupport: { current: { level: "partial",
        honored: ["用紙・余白", "小さめの本文", "詰めた行間", "ほぼ空きなしの設問間隔"],
        pending: ["問題と解答欄を 1 行にそろえる表組み", "表を 2 列に分けて流すこと"] } },
      supportedSubjects: ["英語", "国語", "社会", "理科", "汎用"],
      supportedQuestionTypes: ["short_answer", "fill_blank", "numeric",
                               "multiple_choice_single", "multiple_choice_multiple", "true_false",
                               "matching", "ordering"],
      unsupportedQuestionTypes: {
        long_answer: "1 行 1 問の表なので、長い記述は行に入りません。",
        essay: "論述の面積を取れません。",
        english_writing: "英作文は 1 行では書けません。",
        source_analysis: "資料を置く場所がありません。",
        formula: "数式は行の高さに収まりません。"
      },

      paper: { size: "A4", orientation: "portrait", writingDirection: "horizontal", spread: false },
      margins: { top: 15, bottom: 14, left: 16, right: 16 },

      typography: {
        bodyFamily: "gothic", headingFamily: "gothic",
        basePt: 10, minimumFontSize: 9, lineHeight: 1.35, numberStyle: "arabic"
      },

      header: { align: "left", rule: true, showMeta: false, showNameBox: true,
                variants: ["left-simple"] },

      sectionStyle: {
        marker: "{n}", markerFamily: "gothic", markerPt: 11,
        showPoints: false, rule: "thin", gapBeforeMm: 4, startsNewPageFrom: 0
      },
      subQuestionStyle: {
        markers: ["1", "2", "3", "4", "5", "6", "7", "8",
                  "9", "10", "11", "12", "13", "14", "15", "16"],
        markerFamily: "gothic", indentMm: 0, showPoints: false
      },

      /* 表の 1 行の作り。行の高さと欄の幅をここで決める。 */
      questionFlow: {
        columns: 2, columnGapMm: 6, mode: "table",
        rowHeightMm: 9, questionColumnPct: 58, answerColumnPct: 42,
        /* 0 mm にはしない。Renderer は 0 を「指定なし」と見て 8 mm へ戻すため、
           0 を渡すと「ほぼ空きなし」と書いてあるのに 8 mm 空いた紙が出る
           （実測 2026-08-05）。ほぼ空きなしは 1 mm で表す。 */
        gapMmRange: [1, 2],
        keepQuestionWithChoices: true, keepQuestionWithFigure: true
      },

      choiceLayout: {
        marker: "number-dot", variants: ["vertical", "four-column-short-only"],
        twoColumnMaxChars: 0, fourColumnMaxChars: 6, indentMm: 2
      },

      /* 表の紙面に大きな図は置けない。1 点だけ、小さく。 */
      figureRules: {
        variants: ["figure-below-centered", "multi-figure-centered", "text-above-figures-below"],
        rightWidthPct: 30, belowWidthPct: 40, centeredWidthPct: 38, rowWidthPct: 70,
        minGapMm: 3, maxWidthPct: 70, captionPosition: "below",
        treatAsPartOfQuestion: true, minItemWidthMm: 24, maxRowItems: 2,
        keepGroupTogether: true, preserveAspectRatio: true
      },

      /* 解答欄は表の右の列。罫線を引く処理はまだ無い（pending に書いてある）。 */
      answerCellRules: { inline: true, mode: "table-column", ruledLine: true, heightMm: 9 },
      scoreArea: { onQuestionPaper: false },
      studentFields: [],

      variationRules: {
        spacing:       ["standard"],
        choiceLayout:  ["vertical", "four-column-short-only"],
        figureLayout:  ["figure-below-centered", "multi-figure-centered", "text-above-figures-below"],
        sectionMarker: ["plain"]
      },
      safetyConstraints: {
        minFontPt: 9, minGapMm: 2, maxFigureWidthPct: 70, maxColumns: 4,
        minQuestionGapMm: 1, forbidFigureOverlap: true, forbidOrphanHeading: true
      },
      version: "1.0.0"
    },

    /* ── 10. 冊子（表紙・見開き）────────────────────────────
       B5 の冊子。表紙と注意事項のページがあり、のど（内側）の余白を広く取る。
       ※ 表紙とのどを作る処理がまだ無いので、一覧では準備中にしてある。 */
    "booklet-spread": {
      id: "booklet-spread",
      name: "冊子（表紙・見開き）",
      documentType: "question-paper",
      compatibleEngines: ["current"],
      rendererSupport: { current: { level: "partial",
        honored: ["B5 の用紙", "余白", "行間", "大問ごとの改ページ", "ページ番号"],
        pending: ["表紙のページ", "注意事項のページ", "見開きでのど側の余白を入れ替えること"] } },
      supportedSubjects: ["国語", "数学", "英語", "理科", "社会", "汎用"],
      supportedQuestionTypes: ALL_QUESTION_TYPES.slice(),
      unsupportedQuestionTypes: {},

      paper: { size: "B5", orientation: "portrait", writingDirection: "horizontal", spread: true },
      /* left = のど（内側）、right = 小口（外側）。見開きで入れ替える。 */
      margins: { top: 18, bottom: 18, left: 22, right: 14 },

      typography: {
        bodyFamily: "mincho", headingFamily: "gothic",
        basePt: 10, minimumFontSize: 9, lineHeight: 1.8, numberStyle: "kanji-mixed"
      },

      header: { align: "center", rule: false, showMeta: false, showNameBox: false,
                variants: ["centered-simple"] },

      /* 表紙で持つ項目。値は spec から引く（ここに文章を書かない）。 */
      cover: { enabled: true, fields: ["examName", "subject", "grade", "duration", "totalPoints", "notes"],
               notesPage: true },
      binding: { edge: "left", gutterMm: 8, mirrorMargins: true },

      sectionStyle: {
        marker: "第{n}問", markerFamily: "gothic", markerPt: 12,
        showPoints: true, rule: "none", gapBeforeMm: 6, startsNewPageFrom: 1
      },
      subQuestionStyle: {
        markers: ["問1", "問2", "問3", "問4", "問5", "問6", "問7", "問8",
                  "問9", "問10", "問11", "問12", "問13", "問14", "問15", "問16"],
        markerFamily: "gothic", indentMm: 4, showPoints: true
      },

      questionFlow: {
        columns: 1, gapMmRange: [6, 9],
        keepQuestionWithChoices: true, keepQuestionWithFigure: true
      },

      choiceLayout: {
        marker: "number-dot", variants: ["vertical", "two-column-short-only"],
        twoColumnMaxChars: 11, fourColumnMaxChars: 0, indentMm: 6
      },

      figureRules: {
        variants: ["figure-below-centered", "multi-figure-centered", "figure-right",
                   "text-above-figures-below"],
        rightWidthPct: 40, belowWidthPct: 74, centeredWidthPct: 68, rowWidthPct: 90,
        minGapMm: 5, maxWidthPct: 90, captionPosition: "below",
        treatAsPartOfQuestion: true, minItemWidthMm: 32, maxRowItems: 3,
        keepGroupTogether: true, preserveAspectRatio: true
      },

      answerCellRules: { inline: false },
      scoreArea: { onQuestionPaper: false },
      studentFields: [],

      variationRules: {
        spacing:       ["standard", "relaxed"],
        choiceLayout:  ["vertical", "two-column-short-only"],
        figureLayout:  ["figure-below-centered", "multi-figure-centered", "figure-right",
                        "text-above-figures-below"],
        sectionMarker: ["boxed"]
      },
      safetyConstraints: {
        minFontPt: 9, minGapMm: 4, maxFigureWidthPct: 90, maxColumns: 2,
        minQuestionGapMm: 5, forbidFigureOverlap: true, forbidOrphanHeading: true
      },
      version: "1.0.0"
    },

    /* ── 11. ミニマル（余白重視）────────────────────────────
       いちばん余白が広い紙面。読みやすさだけで作る。
       ※ 仕様には「紫のアクセント」とあるが、いまの Renderer は
          紙面に色を出さない。色だけの違いを作るのは §55 の禁止でもあるので、
          この定義に色は入れない（出せない色を書かない）。 */
    "premium-minimal": {
      id: "premium-minimal",
      name: "ミニマル（余白重視）",
      documentType: "question-paper",
      compatibleEngines: ["current"],
      rendererSupport: { current: { level: "full",
        honored: ["とても広い余白", "大きめのゴシック本文", "広い行間",
                  "罫線なしの見出し", "設問どうしの広い空き"],
        pending: [] } },
      supportedSubjects: ["汎用", "情報", "英語", "社会"],
      supportedQuestionTypes: ALL_QUESTION_TYPES.slice(),
      unsupportedQuestionTypes: {},

      paper: { size: "A4", orientation: "portrait", writingDirection: "horizontal", spread: false },
      margins: { top: 32, bottom: 30, left: 30, right: 30 },

      typography: {
        bodyFamily: "gothic", headingFamily: "gothic",
        basePt: 11, minimumFontSize: 10, lineHeight: 2.05, numberStyle: "arabic"
      },

      header: { align: "left", rule: false, showMeta: false, showNameBox: false,
                variants: ["left-simple"] },

      sectionStyle: {
        marker: "{n}", markerFamily: "gothic", markerPt: 13,
        showPoints: false, rule: "none", gapBeforeMm: 16, startsNewPageFrom: 0
      },
      subQuestionStyle: {
        markers: ["(1)", "(2)", "(3)", "(4)", "(5)", "(6)", "(7)", "(8)",
                  "(9)", "(10)", "(11)", "(12)", "(13)", "(14)", "(15)", "(16)"],
        markerFamily: "gothic", indentMm: 7, showPoints: false
      },

      questionFlow: {
        columns: 1, gapMmRange: [12, 16],
        keepQuestionWithChoices: true, keepQuestionWithFigure: true
      },

      choiceLayout: {
        marker: "number-dot", variants: ["vertical"],
        twoColumnMaxChars: 0, fourColumnMaxChars: 0, indentMm: 9
      },

      figureRules: {
        variants: ["figure-below-centered", "multi-figure-centered", "text-above-figures-below"],
        rightWidthPct: 38, belowWidthPct: 56, centeredWidthPct: 52, rowWidthPct: 80,
        minGapMm: 9, maxWidthPct: 80, captionPosition: "below",
        treatAsPartOfQuestion: true, minItemWidthMm: 36, maxRowItems: 2,
        keepGroupTogether: true, preserveAspectRatio: true
      },

      answerCellRules: { inline: false },
      scoreArea: { onQuestionPaper: false },
      studentFields: [],

      variationRules: {
        spacing:       ["standard", "relaxed"],
        choiceLayout:  ["vertical"],
        figureLayout:  ["figure-below-centered", "multi-figure-centered", "text-above-figures-below"],
        sectionMarker: ["plain"]
      },
      safetyConstraints: {
        minFontPt: 10, minGapMm: 8, maxFigureWidthPct: 80, maxColumns: 1,
        minQuestionGapMm: 10, forbidFigureOverlap: true, forbidOrphanHeading: true
      },
      version: "1.0.0"
    },

    /* ── 12. 画面受験（紙ではない）──────────────────────────
       PC / スマホで 1 画面 1 問。**印刷しない**（printable:false）。
         ・documentType が "question-paper" ではないので、
           紙面の Planner はこの定義を選べない（resolve が弾く）。
         ・compatibleEngines は空。紙に組めるエンジンは 1 つも無い。
         ・画面そのものもまだ作っていない。だから一覧では ready:false。
       ここにあるのは「画面で出すならこうする」という設計だけ。 */
    "digital-mock-screen": {
      id: "digital-mock-screen",
      name: "画面受験（1 画面 1 問）",
      documentType: "screen-form",
      printable: false,
      medium: "screen",
      compatibleEngines: [],
      rendererSupport: { current: { level: "none",
        honored: [],
        pending: ["画面受験の画面そのもの（1 問ずつの表示・進捗・見直し）"] } },
      supportedSubjects: ["汎用"],
      supportedQuestionTypes: ["multiple_choice_single", "multiple_choice_multiple", "true_false",
                               "short_answer", "fill_blank", "numeric", "matching", "ordering"],
      unsupportedQuestionTypes: {
        long_answer: "画面の入力欄をまだ作っていないため、長い記述は受け取れません。",
        essay: "画面の入力欄をまだ作っていないため、論述は受け取れません。",
        english_writing: "画面の入力欄をまだ作っていないため、英作文は受け取れません。",
        source_analysis: "資料を並べて読ませる画面をまだ作っていません。",
        formula: "数式の入力欄がありません。"
      },

      /* 紙ではないので用紙は無い。size は "screen"。 */
      paper: { size: "screen", orientation: "responsive", writingDirection: "horizontal", spread: false },
      /* 単位は mm ではなく px（紙の余白とは別物）。 */
      margins: { top: 24, bottom: 24, left: 20, right: 20 },
      marginUnit: "px",

      /* 画面は pt で組まない。ここの数値は基準の比率として持つ。 */
      typography: {
        bodyFamily: "gothic", headingFamily: "gothic",
        basePt: 12, minimumFontSize: 11, lineHeight: 1.8, numberStyle: "arabic",
        unit: "screen-scaled"
      },

      header: { align: "left", rule: false, showMeta: true, showNameBox: false,
                variants: ["screen-bar"] },

      sectionStyle: {
        marker: "{n}", markerFamily: "gothic", markerPt: 12,
        showPoints: false, rule: "none", gapBeforeMm: 0, startsNewPageFrom: 0
      },
      subQuestionStyle: {
        markers: ["1", "2", "3", "4", "5", "6", "7", "8",
                  "9", "10", "11", "12", "13", "14", "15", "16"],
        markerFamily: "gothic", indentMm: 0, showPoints: false
      },

      questionFlow: {
        columns: 1, gapMmRange: [0, 0],
        keepQuestionWithChoices: true, keepQuestionWithFigure: true
      },

      /* 画面での見せ方。紙の項目とは混ぜない。 */
      screen: {
        questionsPerView: 1,
        viewportMinPx: 320,
        contentMaxWidthPx: 720,
        navigation: ["前へ", "次へ", "一覧", "見直し"],
        showProgress: true,
        stickyHeader: true,
        tapTargetMinPx: 44
      },

      choiceLayout: {
        marker: "number-dot", variants: ["vertical"],
        twoColumnMaxChars: 0, fourColumnMaxChars: 0, indentMm: 0
      },

      figureRules: {
        variants: ["figure-below-centered", "multi-figure-centered", "text-above-figures-below"],
        rightWidthPct: 100, belowWidthPct: 100, centeredWidthPct: 100, rowWidthPct: 100,
        minGapMm: 0, maxWidthPct: 100, captionPosition: "below",
        treatAsPartOfQuestion: true, minItemWidthMm: 0, maxRowItems: 1,
        keepGroupTogether: true, preserveAspectRatio: true
      },

      /* 解答は画面の入力欄。紙の欄ではない。 */
      answerCellRules: { inline: true, mode: "screen-input" },
      scoreArea: { onQuestionPaper: false },
      studentFields: [],

      variationRules: {
        spacing:       ["standard"],
        choiceLayout:  ["vertical"],
        figureLayout:  ["figure-below-centered", "multi-figure-centered", "text-above-figures-below"],
        sectionMarker: ["plain"]
      },
      safetyConstraints: {
        minFontPt: 11, minGapMm: 0, maxFigureWidthPct: 100, maxColumns: 1,
        minQuestionGapMm: 0, forbidFigureOverlap: true, forbidOrphanHeading: true
      },
      version: "1.0.0"
    },

    /* ══════════════════════════════════════════════════════════════
       D. 解答用紙（上のレイアウトに対応するもの）

       いまの Renderer が出せる形は 2 通りだけ。
         ・可変グリッド（answer-grid-block）… grid.enabled = true
         ・1 問 1 行（answer-grid-section）… grid.enabled = false
       どちらも実際に描ける。だからここは全部 ready にしてよい。
       ══════════════════════════════════════════════════════════════ */

    /* ── 罫線型・標準 ────────────────────────────────────────
       高密度版より欄を大きく、行のまとめ方も 2 問までにしたもの。
       配点による罫線の太さ分けは使わない（見た目を静かにする）。 */
    "school-answer-grid-standard": {
      id: "school-answer-grid-standard",
      name: "罫線型・標準",
      documentType: "answer-sheet",
      compatibleEngines: ["current"],
      rendererSupport: { current: { level: "full",
        honored: ["可変グリッド", "大問の枠", "得点欄", "氏名欄"], pending: [] } },
      supportedSubjects: ["汎用"],
      supportedQuestionTypes: ALL_QUESTION_TYPES.slice(),
      unsupportedQuestionTypes: {},

      paper: { size: "A4", orientation: "portrait", writingDirection: "horizontal", spread: false },
      margins: { top: 18, bottom: 18, left: 16, right: 16 },

      typography: {
        bodyFamily: "gothic", headingFamily: "gothic",
        basePt: 10, minimumFontSize: 9, lineHeight: 1.6, numberStyle: "arabic"
      },

      header: {
        showSubject: true, showGrade: true, showExamName: true, showDuration: true,
        variants: ["top-bar-with-rule"]
      },

      sectionStyle: { marker: "{n}", rule: "thin", ruleWidthMm: 0.5, gapBeforeMm: 4, labelColumnMm: 14 },
      subQuestionStyle: {
        markers: ["(1)", "(2)", "(3)", "(4)", "(5)", "(6)", "(7)", "(8)",
                  "(9)", "(10)", "(11)", "(12)", "(13)", "(14)", "(15)", "(16)"],
        labelColumnMm: 14
      },

      questionFlow: { columns: 1, gapMmRange: [0, 3], keepSectionTogether: true },
      choiceLayout: { variants: [] },
      figureRules: { variants: [] },

      answerCellRules: {
        inline: true,
        byType: {
          multiple_choice_single:   { cell: "mark",       widthMm: 22, heightMm: 11, rows: 1 },
          multiple_choice_multiple: { cell: "mark-multi", widthMm: 40, heightMm: 11, rows: 1 },
          true_false:               { cell: "truefalse",  widthMm: 22, heightMm: 11, rows: 1 },
          numeric:                  { cell: "short",      widthMm: 50, heightMm: 12, rows: 1 },
          short_answer:             { cell: "short",      widthMm: 70, heightMm: 12, rows: 1 },
          fill_blank:               { cell: "short",      widthMm: 70, heightMm: 12, rows: 1 },
          formula:                  { cell: "short",      widthMm: 100, heightMm: 14, rows: 1 },
          matching:                 { cell: "matching",   widthMm: 18, heightMm: 11, rows: 1, perBlank: true },
          ordering:                 { cell: "ordering",   widthMm: 18, heightMm: 11, rows: 1, perBlank: true },
          long_answer:              { cell: "written",    widthMm: 160, heightMm: 12, rows: 4 },
          source_analysis:          { cell: "written",    widthMm: 160, heightMm: 12, rows: 4 },
          essay:                    { cell: "essay",      widthMm: 160, heightMm: 12, rows: 9 },
          english_writing:          { cell: "essay",      widthMm: 160, heightMm: 12, rows: 9 }
        },
        fallback: { cell: "short", widthMm: 70, heightMm: 12, rows: 1 },
        perSectionColumns: ["subtotal", "grader"]
      },

      scoreArea: {
        perSection: { subtotal: true, grader: false, regrade: false, widthMm: 18 },
        denominator: { show: true, widthMm: 20, slash: true },
        total: { show: true, label: "合計", widthMm: 34, slash: true },
        regradeTotal: { show: false, label: "再採点", widthMm: 26 },
        position: "right"
      },

      grid: {
        enabled: true,
        cellTypes: ["section-label", "question-label", "small-box", "box-sequence",
                    "wide-answer", "lined-answer", "merged-answer", "fixed-label",
                    "score-cell", "score-denominator", "recheck-box", "student-field", "spacer"],
        columns: 20,
        sectionGapMm: 6,
        outerBorderWidthMm: 0.5,
        innerBorderWidthMm: 0.2,
        /* 配点で罫線を変えない（標準はすべて同じ太さ） */
        pointBorder: { enabled: false, thickFromPoints: 0, thickWidthMm: 0.5, thinWidthMm: 0.2 },
        pointLegend: { show: false, labels: [] },
        sectionLabel: { widthMm: 12, writingMode: "vertical", template: "{n}" },
        questionLabel: { widthMm: 13 },
        subLabel: { widthMm: 10 },
        rowHeightMm: { min: 10, default: 12, lined: 11, boxSeq: 10 },
        rowGroupMax: 2,
        cellMinWidthMm: 9,
        cellMinHeightMm: 9
      },

      answerShapes: {
        "small-box":     { widthMm: 20, heightMm: 11, rows: 1 },
        "box-sequence":  { widthMm: 9,  heightMm: 11, rows: 1 },
        "wide-answer":   { widthMm: 64, heightMm: 12, rows: 1 },
        "lined-answer":  { widthMm: 150, heightMm: 11, rows: 4 },
        "merged-answer": { widthMm: 150, heightMm: 13, rows: 1 },
        "fixed-label":   { widthMm: 11, heightMm: 11, rows: 1 }
      },

      studentFields: [
        { key: "year",  label: "年",   widthMm: 16 },
        { key: "class", label: "組",   widthMm: 16 },
        { key: "no",    label: "番",   widthMm: 16 },
        { key: "name",  label: "氏名", widthMm: 62 }
      ],
      studentFieldsPosition: "bottom",

      variationRules: {
        header:      ["top-bar-with-rule"],
        density:     ["standard"],
        scoreColumn: ["right"],
        markCell:    ["box", "circle"],
        rowGrouping: ["single", "pair"],
        answerWidth: ["standard", "wide"],
        sectionGap:  ["standard", "loose"],
        scorePlace:  ["right"],
        nameWidth:   ["standard", "wide"],
        writtenRows: ["standard", "plus"]
      },

      safetyConstraints: {
        minFontPt: 9,
        minCellHeightMm: 9,
        minCellWidthMm: 9,
        minGapMm: 2,
        maxColumns: 20,
        forbidOrphanHeading: true,
        requireOneCellPerQuestion: true,
        minWriteAreaMm2: { "wide-answer": 500, "lined-answer": 1600, "merged-answer": 1000 }
      },
      version: "1.0.0"
    },

    /* ── 記述欄重視 ──────────────────────────────────────────
       1 問 1 行に固定し、記述の行数と行の高さを増やす。
       まとめ書きをしない（rowGrouping は single だけ）。 */
    "school-answer-written": {
      id: "school-answer-written",
      name: "記述欄重視",
      documentType: "answer-sheet",
      compatibleEngines: ["current"],
      rendererSupport: { current: { level: "full",
        honored: ["可変グリッド", "背の高い記述行", "1 問 1 行", "得点欄", "氏名欄"], pending: [] } },
      supportedSubjects: ["国語", "社会", "理科", "汎用"],
      supportedQuestionTypes: ALL_QUESTION_TYPES.slice(),
      unsupportedQuestionTypes: {},

      paper: { size: "A4", orientation: "portrait", writingDirection: "horizontal", spread: false },
      margins: { top: 16, bottom: 16, left: 18, right: 18 },

      typography: {
        bodyFamily: "gothic", headingFamily: "gothic",
        basePt: 10, minimumFontSize: 9, lineHeight: 1.7, numberStyle: "arabic"
      },

      header: { showSubject: true, showGrade: true, showExamName: true, showDuration: false,
                variants: ["top-bar"] },

      sectionStyle: { marker: "{n}", rule: "thick", ruleWidthMm: 0.7, gapBeforeMm: 5, labelColumnMm: 12 },
      subQuestionStyle: {
        markers: ["(1)", "(2)", "(3)", "(4)", "(5)", "(6)", "(7)", "(8)",
                  "(9)", "(10)", "(11)", "(12)", "(13)", "(14)", "(15)", "(16)"],
        labelColumnMm: 12
      },

      questionFlow: { columns: 1, gapMmRange: [0, 2], keepSectionTogether: false },
      choiceLayout: { variants: [] },
      figureRules: { variants: [] },

      answerCellRules: {
        inline: true,
        byType: {
          multiple_choice_single:   { cell: "mark",       widthMm: 20, heightMm: 12, rows: 1 },
          multiple_choice_multiple: { cell: "mark-multi", widthMm: 38, heightMm: 12, rows: 1 },
          true_false:               { cell: "truefalse",  widthMm: 20, heightMm: 12, rows: 1 },
          numeric:                  { cell: "short",      widthMm: 52, heightMm: 13, rows: 1 },
          short_answer:             { cell: "short",      widthMm: 76, heightMm: 13, rows: 1 },
          fill_blank:               { cell: "short",      widthMm: 76, heightMm: 13, rows: 1 },
          formula:                  { cell: "short",      widthMm: 110, heightMm: 15, rows: 1 },
          matching:                 { cell: "matching",   widthMm: 18, heightMm: 12, rows: 1, perBlank: true },
          ordering:                 { cell: "ordering",   widthMm: 18, heightMm: 12, rows: 1, perBlank: true },
          long_answer:              { cell: "written",    widthMm: 164, heightMm: 13, rows: 6 },
          source_analysis:          { cell: "written",    widthMm: 164, heightMm: 13, rows: 6 },
          essay:                    { cell: "essay",      widthMm: 164, heightMm: 13, rows: 14 },
          english_writing:          { cell: "essay",      widthMm: 164, heightMm: 13, rows: 14 }
        },
        fallback: { cell: "short", widthMm: 76, heightMm: 13, rows: 1 },
        perSectionColumns: ["subtotal", "grader"]
      },

      scoreArea: {
        perSection: { subtotal: true, grader: true, regrade: false, widthMm: 18 },
        denominator: { show: true, widthMm: 20, slash: true },
        total: { show: true, label: "合計", widthMm: 34, slash: true },
        regradeTotal: { show: false, label: "再採点", widthMm: 26 },
        position: "right"
      },

      grid: {
        enabled: true,
        cellTypes: ["section-label", "question-label", "small-box", "box-sequence",
                    "wide-answer", "lined-answer", "merged-answer", "fixed-label",
                    "score-cell", "score-denominator", "recheck-box", "student-field", "spacer"],
        columns: 18,
        sectionGapMm: 5,
        outerBorderWidthMm: 0.6,
        innerBorderWidthMm: 0.2,
        pointBorder: { enabled: true, thickFromPoints: 5, thickWidthMm: 0.6, thinWidthMm: 0.2 },
        pointLegend: { show: true, labels: ["4点まで", "5点以上"] },
        sectionLabel: { widthMm: 11, writingMode: "vertical", template: "問題{n}" },
        questionLabel: { widthMm: 12 },
        subLabel: { widthMm: 10 },
        rowHeightMm: { min: 12, default: 14, lined: 13, boxSeq: 12 },
        rowGroupMax: 1,                      /* まとめない。1 問で 1 行を使う。 */
        cellMinWidthMm: 10,
        cellMinHeightMm: 12
      },

      answerShapes: {
        "small-box":     { widthMm: 20, heightMm: 12, rows: 1 },
        "box-sequence":  { widthMm: 10, heightMm: 12, rows: 1 },
        "wide-answer":   { widthMm: 76, heightMm: 13, rows: 1 },
        "lined-answer":  { widthMm: 150, heightMm: 13, rows: 6 },
        "merged-answer": { widthMm: 150, heightMm: 16, rows: 1 },
        "fixed-label":   { widthMm: 12, heightMm: 12, rows: 1 }
      },

      studentFields: [
        { key: "year",  label: "年",   widthMm: 14 },
        { key: "class", label: "組",   widthMm: 14 },
        { key: "no",    label: "番",   widthMm: 14 },
        { key: "name",  label: "氏名", widthMm: 60 }
      ],
      studentFieldsPosition: "bottom",

      variationRules: {
        header:      ["top-bar", "top-bar-with-rule"],
        density:     ["standard"],
        scoreColumn: ["right", "right-with-regrade"],
        markCell:    ["box"],
        rowGrouping: ["single"],
        answerWidth: ["standard", "wide"],
        sectionGap:  ["standard", "loose"],
        scorePlace:  ["right", "right-bottom"],
        nameWidth:   ["standard", "wide"],
        writtenRows: ["standard", "plus"]
      },

      safetyConstraints: {
        minFontPt: 9,
        minCellHeightMm: 12,
        minCellWidthMm: 10,
        minGapMm: 2,
        maxColumns: 18,
        forbidOrphanHeading: true,
        requireOneCellPerQuestion: true,
        minWriteAreaMm2: { "wide-answer": 800, "lined-answer": 3000, "merged-answer": 1800 }
      },
      version: "1.0.0"
    },

    /* ── 数学・計算欄つき ────────────────────────────────────
       答えだけでなく途中式を書かせる。数値・数式・記述は
       背の高い欄（lined-answer / merged-answer）で受ける。 */
    "school-answer-math-work": {
      id: "school-answer-math-work",
      name: "数学・計算欄つき",
      documentType: "answer-sheet",
      compatibleEngines: ["current"],
      rendererSupport: { current: { level: "full",
        honored: ["可変グリッド", "背の高い計算欄", "得点欄", "氏名欄"], pending: [] } },
      supportedSubjects: ["数学", "物理"],
      supportedQuestionTypes: ALL_QUESTION_TYPES.slice(),
      unsupportedQuestionTypes: {},

      /* 途中式・証明をどう作るか。**この欄の実体は lined-answer**。
         新しいセルの種類を増やしていない（増やすと描けない）。 */
      workArea: { forTypes: ["formula", "numeric", "long_answer"], via: "lined-answer", minHeightMm: 16 },

      paper: { size: "A4", orientation: "portrait", writingDirection: "horizontal", spread: false },
      margins: { top: 16, bottom: 14, left: 14, right: 14 },

      typography: {
        bodyFamily: "gothic", headingFamily: "gothic",
        basePt: 9.5, minimumFontSize: 8.5, lineHeight: 1.5, numberStyle: "arabic"
      },

      header: { showSubject: true, showGrade: true, showExamName: true, showDuration: false,
                variants: ["top-bar"] },

      sectionStyle: { marker: "{n}", rule: "thick", ruleWidthMm: 0.8, gapBeforeMm: 4, labelColumnMm: 12 },
      subQuestionStyle: {
        markers: ["(1)", "(2)", "(3)", "(4)", "(5)", "(6)", "(7)", "(8)",
                  "(9)", "(10)", "(11)", "(12)", "(13)", "(14)", "(15)", "(16)"],
        labelColumnMm: 12
      },

      questionFlow: { columns: 1, gapMmRange: [0, 2], keepSectionTogether: false },
      choiceLayout: { variants: [] },
      figureRules: { variants: [] },

      /* 数値・数式は「答えの欄」ではなく「計算の欄」にする。 */
      shapeByType: {
        numeric: "lined-answer",
        formula: "lined-answer",
        long_answer: "lined-answer",
        short_answer: "wide-answer",
        fill_blank: "wide-answer"
      },

      answerCellRules: {
        inline: true,
        byType: {
          multiple_choice_single:   { cell: "mark",       widthMm: 18, heightMm: 10, rows: 1 },
          multiple_choice_multiple: { cell: "mark-multi", widthMm: 34, heightMm: 10, rows: 1 },
          true_false:               { cell: "truefalse",  widthMm: 18, heightMm: 10, rows: 1 },
          numeric:                  { cell: "written",    widthMm: 150, heightMm: 16, rows: 3 },
          short_answer:             { cell: "short",      widthMm: 64, heightMm: 11, rows: 1 },
          fill_blank:               { cell: "short",      widthMm: 64, heightMm: 11, rows: 1 },
          formula:                  { cell: "written",    widthMm: 150, heightMm: 16, rows: 4 },
          matching:                 { cell: "matching",   widthMm: 16, heightMm: 10, rows: 1, perBlank: true },
          ordering:                 { cell: "ordering",   widthMm: 16, heightMm: 10, rows: 1, perBlank: true },
          long_answer:              { cell: "written",    widthMm: 150, heightMm: 16, rows: 5 },
          source_analysis:          { cell: "written",    widthMm: 150, heightMm: 14, rows: 4 },
          essay:                    { cell: "essay",      widthMm: 150, heightMm: 14, rows: 8 },
          english_writing:          { cell: "essay",      widthMm: 150, heightMm: 14, rows: 8 }
        },
        fallback: { cell: "short", widthMm: 64, heightMm: 11, rows: 1 },
        perSectionColumns: ["subtotal", "grader"]
      },

      scoreArea: {
        perSection: { subtotal: true, grader: false, regrade: false, widthMm: 16 },
        denominator: { show: true, widthMm: 18, slash: true },
        total: { show: true, label: "合計", widthMm: 30, slash: true },
        regradeTotal: { show: false, label: "再採点", widthMm: 26 },
        position: "right"
      },

      grid: {
        enabled: true,
        cellTypes: ["section-label", "question-label", "small-box", "box-sequence",
                    "wide-answer", "lined-answer", "merged-answer", "fixed-label",
                    "score-cell", "score-denominator", "recheck-box", "student-field", "spacer"],
        columns: 16,
        sectionGapMm: 5,
        outerBorderWidthMm: 0.6,
        innerBorderWidthMm: 0.2,
        pointBorder: { enabled: true, thickFromPoints: 5, thickWidthMm: 0.6, thinWidthMm: 0.2 },
        pointLegend: { show: true, labels: ["4点まで", "5点以上"] },
        sectionLabel: { widthMm: 10, writingMode: "vertical", template: "大問{n}" },
        questionLabel: { widthMm: 11 },
        subLabel: { widthMm: 9 },
        rowHeightMm: { min: 14, default: 16, lined: 16, boxSeq: 12 },
        rowGroupMax: 2,
        cellMinWidthMm: 9,
        cellMinHeightMm: 14
      },

      answerShapes: {
        "small-box":     { widthMm: 18, heightMm: 14, rows: 1 },
        "box-sequence":  { widthMm: 9,  heightMm: 14, rows: 1 },
        "wide-answer":   { widthMm: 64, heightMm: 14, rows: 1 },
        "lined-answer":  { widthMm: 150, heightMm: 16, rows: 4 },
        "merged-answer": { widthMm: 150, heightMm: 18, rows: 1 },
        "fixed-label":   { widthMm: 10, heightMm: 14, rows: 1 }
      },

      studentFields: [
        { key: "year",  label: "年",   widthMm: 14 },
        { key: "class", label: "組",   widthMm: 14 },
        { key: "no",    label: "番",   widthMm: 14 },
        { key: "name",  label: "氏名", widthMm: 56 }
      ],
      studentFieldsPosition: "bottom",

      variationRules: {
        header:      ["top-bar"],
        density:     ["standard", "dense"],
        scoreColumn: ["right"],
        markCell:    ["box"],
        rowGrouping: ["single", "pair"],
        answerWidth: ["standard", "wide"],
        sectionGap:  ["standard", "tight"],
        scorePlace:  ["right"],
        nameWidth:   ["standard"],
        writtenRows: ["standard", "plus"]
      },

      safetyConstraints: {
        minFontPt: 8.5,
        minCellHeightMm: 14,
        minCellWidthMm: 9,
        minGapMm: 2,
        maxColumns: 16,
        forbidOrphanHeading: true,
        requireOneCellPerQuestion: true,
        minWriteAreaMm2: { "wide-answer": 800, "lined-answer": 3200, "merged-answer": 2000 }
      },
      version: "1.0.0"
    },

    /* ── 英語・連続マス ──────────────────────────────────────
       単語や語句を 1 マス 1 文字で書かせる。英作文は広い罫線欄。 */
    "school-answer-english": {
      id: "school-answer-english",
      name: "英語・連続マス",
      documentType: "answer-sheet",
      compatibleEngines: ["current"],
      rendererSupport: { current: { level: "full",
        honored: ["可変グリッド", "連続マス", "英作文の罫線欄", "得点欄", "氏名欄"], pending: [] } },
      supportedSubjects: ["英語"],
      supportedQuestionTypes: ALL_QUESTION_TYPES.slice(),
      unsupportedQuestionTypes: {},

      paper: { size: "A4", orientation: "portrait", writingDirection: "horizontal", spread: false },
      margins: { top: 16, bottom: 16, left: 13, right: 13 },

      typography: {
        bodyFamily: "gothic", headingFamily: "gothic",
        basePt: 10, minimumFontSize: 9, lineHeight: 1.5, numberStyle: "arabic"
      },

      header: { showSubject: true, showGrade: true, showExamName: true, showDuration: false,
                variants: ["top-bar-with-rule"] },

      sectionStyle: { marker: "{n}", rule: "thick", ruleWidthMm: 0.6, gapBeforeMm: 4, labelColumnMm: 11 },
      subQuestionStyle: {
        markers: ["(1)", "(2)", "(3)", "(4)", "(5)", "(6)", "(7)", "(8)",
                  "(9)", "(10)", "(11)", "(12)", "(13)", "(14)", "(15)", "(16)"],
        labelColumnMm: 11
      },

      questionFlow: { columns: 1, gapMmRange: [0, 2], keepSectionTogether: false },
      choiceLayout: { variants: [] },
      figureRules: { variants: [] },

      /* 短答・穴埋めは連続マスで受ける（英語の答案の作法）。 */
      shapeByType: {
        short_answer: "box-sequence",
        fill_blank: "box-sequence",
        english_writing: "lined-answer",
        essay: "lined-answer"
      },
      /* マスの数の既定。字数の指定があるときはそちらを使う。 */
      boxSequenceDefaultCount: 10,

      answerCellRules: {
        inline: true,
        byType: {
          multiple_choice_single:   { cell: "mark",       widthMm: 18, heightMm: 10, rows: 1 },
          multiple_choice_multiple: { cell: "mark-multi", widthMm: 34, heightMm: 10, rows: 1 },
          true_false:               { cell: "truefalse",  widthMm: 18, heightMm: 10, rows: 1 },
          numeric:                  { cell: "short",      widthMm: 44, heightMm: 11, rows: 1 },
          short_answer:             { cell: "boxes",      widthMm: 72, heightMm: 11, rows: 1 },
          fill_blank:               { cell: "boxes",      widthMm: 72, heightMm: 11, rows: 1 },
          formula:                  { cell: "short",      widthMm: 90, heightMm: 12, rows: 1 },
          matching:                 { cell: "matching",   widthMm: 16, heightMm: 10, rows: 1, perBlank: true },
          ordering:                 { cell: "ordering",   widthMm: 16, heightMm: 10, rows: 1, perBlank: true },
          long_answer:              { cell: "written",    widthMm: 160, heightMm: 12, rows: 4 },
          source_analysis:          { cell: "written",    widthMm: 160, heightMm: 12, rows: 4 },
          essay:                    { cell: "essay",      widthMm: 160, heightMm: 12, rows: 10 },
          english_writing:          { cell: "essay",      widthMm: 160, heightMm: 12, rows: 10 }
        },
        fallback: { cell: "short", widthMm: 66, heightMm: 11, rows: 1 },
        perSectionColumns: ["subtotal"]
      },

      scoreArea: {
        perSection: { subtotal: true, grader: false, regrade: false, widthMm: 16 },
        denominator: { show: true, widthMm: 18, slash: true },
        total: { show: true, label: "合計", widthMm: 30, slash: true },
        regradeTotal: { show: false, label: "再採点", widthMm: 26 },
        position: "right"
      },

      grid: {
        enabled: true,
        cellTypes: ["section-label", "question-label", "small-box", "box-sequence",
                    "wide-answer", "lined-answer", "merged-answer", "fixed-label",
                    "score-cell", "score-denominator", "recheck-box", "student-field", "spacer"],
        columns: 26,
        sectionGapMm: 4,
        outerBorderWidthMm: 0.5,
        innerBorderWidthMm: 0.15,
        pointBorder: { enabled: true, thickFromPoints: 3, thickWidthMm: 0.5, thinWidthMm: 0.15 },
        pointLegend: { show: true, labels: ["2点まで", "3点以上"] },
        sectionLabel: { widthMm: 10, writingMode: "vertical", template: "{n}" },
        questionLabel: { widthMm: 10 },
        subLabel: { widthMm: 8 },
        rowHeightMm: { min: 9, default: 11, lined: 11, boxSeq: 10 },
        rowGroupMax: 2,
        cellMinWidthMm: 8,
        cellMinHeightMm: 9
      },

      answerShapes: {
        "small-box":     { widthMm: 16, heightMm: 10, rows: 1 },
        "box-sequence":  { widthMm: 7,  heightMm: 10, rows: 1 },
        "wide-answer":   { widthMm: 66, heightMm: 11, rows: 1 },
        "lined-answer":  { widthMm: 150, heightMm: 11, rows: 4 },
        "merged-answer": { widthMm: 150, heightMm: 13, rows: 1 },
        "fixed-label":   { widthMm: 9,  heightMm: 10, rows: 1 }
      },

      studentFields: [
        { key: "class", label: "組",   widthMm: 14 },
        { key: "no",    label: "番",   widthMm: 14 },
        { key: "name",  label: "氏名", widthMm: 66 }
      ],
      studentFieldsPosition: "bottom",

      variationRules: {
        header:      ["top-bar-with-rule"],
        density:     ["standard", "dense"],
        scoreColumn: ["right"],
        markCell:    ["box", "circle"],
        rowGrouping: ["single", "pair"],
        answerWidth: ["standard", "wide"],
        sectionGap:  ["standard", "tight"],
        scorePlace:  ["right"],
        nameWidth:   ["standard", "wide"],
        writtenRows: ["standard", "plus"]
      },

      safetyConstraints: {
        minFontPt: 9,
        minCellHeightMm: 9,
        minCellWidthMm: 8,
        minGapMm: 1,
        maxColumns: 26,
        forbidOrphanHeading: true,
        requireOneCellPerQuestion: true,
        minWriteAreaMm2: { "wide-answer": 500, "lined-answer": 1500, "merged-answer": 1000 }
      },
      version: "1.0.0"
    },

    /* ── マーク中心 ──────────────────────────────────────────
       記号を丸で囲ませる答案。1 行に 3 問までまとめ、行を低くする。
       記述もまったく置けないわけではないが、面積は最小限になる。 */
    "school-answer-mark": {
      id: "school-answer-mark",
      name: "マーク中心",
      documentType: "answer-sheet",
      compatibleEngines: ["current"],
      rendererSupport: { current: { level: "full",
        honored: ["可変グリッド", "丸で囲む記号欄", "1 行に 3 問", "得点欄", "氏名欄"], pending: [] } },
      supportedSubjects: ["汎用"],
      supportedQuestionTypes: ["multiple_choice_single", "multiple_choice_multiple", "true_false",
                               "matching", "ordering", "numeric", "short_answer", "fill_blank"],
      unsupportedQuestionTypes: {
        long_answer: "記号のマークを前提にした用紙のため、記述の欄は 2 行しか取れません。記述が多いときは「記述欄重視」を使ってください。",
        essay: "論述の面積を確保できません。「記述欄重視」を使ってください。",
        english_writing: "英作文の面積を確保できません。「英語・連続マス」を使ってください。",
        source_analysis: "資料に対する記述の面積を確保できません。",
        formula: "数式を書く高さがありません。「数学・計算欄つき」を使ってください。"
      },

      paper: { size: "A4", orientation: "portrait", writingDirection: "horizontal", spread: false },
      margins: { top: 15, bottom: 15, left: 15, right: 15 },

      typography: {
        bodyFamily: "gothic", headingFamily: "gothic",
        basePt: 9, minimumFontSize: 8, lineHeight: 1.4, numberStyle: "arabic"
      },

      header: { showSubject: true, showGrade: true, showExamName: true, showDuration: false,
                variants: ["top-bar"] },

      sectionStyle: { marker: "{n}", rule: "thin", ruleWidthMm: 0.4, gapBeforeMm: 3, labelColumnMm: 10 },
      subQuestionStyle: {
        markers: ["(1)", "(2)", "(3)", "(4)", "(5)", "(6)", "(7)", "(8)",
                  "(9)", "(10)", "(11)", "(12)", "(13)", "(14)", "(15)", "(16)"],
        labelColumnMm: 10
      },

      questionFlow: { columns: 1, gapMmRange: [0, 1], keepSectionTogether: false },
      choiceLayout: { variants: [] },
      figureRules: { variants: [] },

      answerCellRules: {
        inline: true,
        byType: {
          multiple_choice_single:   { cell: "mark",       widthMm: 16, heightMm: 9, rows: 1 },
          multiple_choice_multiple: { cell: "mark-multi", widthMm: 30, heightMm: 9, rows: 1 },
          true_false:               { cell: "truefalse",  widthMm: 16, heightMm: 9, rows: 1 },
          numeric:                  { cell: "short",      widthMm: 38, heightMm: 9, rows: 1 },
          short_answer:             { cell: "short",      widthMm: 50, heightMm: 9, rows: 1 },
          fill_blank:               { cell: "short",      widthMm: 50, heightMm: 9, rows: 1 },
          formula:                  { cell: "short",      widthMm: 70, heightMm: 10, rows: 1 },
          matching:                 { cell: "matching",   widthMm: 14, heightMm: 9, rows: 1, perBlank: true },
          ordering:                 { cell: "ordering",   widthMm: 14, heightMm: 9, rows: 1, perBlank: true },
          long_answer:              { cell: "written",    widthMm: 150, heightMm: 10, rows: 2 },
          source_analysis:          { cell: "written",    widthMm: 150, heightMm: 10, rows: 2 },
          essay:                    { cell: "essay",      widthMm: 150, heightMm: 10, rows: 5 },
          english_writing:          { cell: "essay",      widthMm: 150, heightMm: 10, rows: 5 }
        },
        fallback: { cell: "short", widthMm: 50, heightMm: 9, rows: 1 },
        perSectionColumns: ["subtotal"]
      },

      scoreArea: {
        perSection: { subtotal: true, grader: false, regrade: false, widthMm: 14 },
        denominator: { show: true, widthMm: 16, slash: true },
        total: { show: true, label: "合計", widthMm: 28, slash: true },
        regradeTotal: { show: false, label: "再採点", widthMm: 24 },
        position: "right"
      },

      grid: {
        enabled: true,
        cellTypes: ["section-label", "question-label", "small-box", "box-sequence",
                    "wide-answer", "lined-answer", "merged-answer", "fixed-label",
                    "score-cell", "score-denominator", "recheck-box", "student-field", "spacer"],
        columns: 30,
        sectionGapMm: 3,
        outerBorderWidthMm: 0.5,
        innerBorderWidthMm: 0.15,
        pointBorder: { enabled: false, thickFromPoints: 0, thickWidthMm: 0.5, thinWidthMm: 0.15 },
        pointLegend: { show: false, labels: [] },
        sectionLabel: { widthMm: 9, writingMode: "horizontal", template: "{n}" },
        questionLabel: { widthMm: 9 },
        subLabel: { widthMm: 8 },
        rowHeightMm: { min: 8, default: 9, lined: 9, boxSeq: 9 },
        rowGroupMax: 3,
        cellMinWidthMm: 8,
        cellMinHeightMm: 8
      },

      answerShapes: {
        "small-box":     { widthMm: 14, heightMm: 9, rows: 1 },
        "box-sequence":  { widthMm: 9,  heightMm: 9, rows: 1 },
        "wide-answer":   { widthMm: 50, heightMm: 9, rows: 1 },
        "lined-answer":  { widthMm: 150, heightMm: 9, rows: 2 },
        "merged-answer": { widthMm: 150, heightMm: 10, rows: 1 },
        "fixed-label":   { widthMm: 9,  heightMm: 9, rows: 1 }
      },

      studentFields: [
        { key: "class", label: "組",   widthMm: 12 },
        { key: "no",    label: "番",   widthMm: 12 },
        { key: "name",  label: "氏名", widthMm: 52 }
      ],
      studentFieldsPosition: "bottom",

      variationRules: {
        header:      ["top-bar"],
        density:     ["dense", "standard"],
        scoreColumn: ["right"],
        markCell:    ["circle"],
        rowGrouping: ["triple", "pair"],
        answerWidth: ["narrow", "standard"],
        sectionGap:  ["tight", "standard"],
        scorePlace:  ["right"],
        nameWidth:   ["standard"],
        writtenRows: ["standard", "plus"]
      },

      safetyConstraints: {
        minFontPt: 8,
        minCellHeightMm: 8,
        minCellWidthMm: 8,
        minGapMm: 1,
        maxColumns: 30,
        forbidOrphanHeading: true,
        requireOneCellPerQuestion: true,
        minWriteAreaMm2: { "wide-answer": 400, "lined-answer": 800, "merged-answer": 700 }
      },
      version: "1.0.0"
    }
  };

  function getProfile(id) { return PROFILES[id] || null; }
  function listProfiles(documentType) {
    return Object.keys(PROFILES)
      .map(function (k) { return PROFILES[k]; })
      .filter(function (p) { return !documentType || p.documentType === documentType; });
  }

  /* ══════════════════════════════════════════════════════════════════
     Seed から作る乱数（決定論）
     ・同じ Seed なら必ず同じ結果。Math.random は使わない。
     ・文字列 Seed を FNV-1a で 32bit へ潰し、mulberry32 で回す。
     ══════════════════════════════════════════════════════════════════ */
  function hashSeed(seed) {
    var s = String(seed == null ? "" : seed);
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }
  function rng(seed) {
    var a = hashSeed(seed);
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /* 許可された候補の中からだけ選ぶ。候補が無ければ null（勝手に作らない）。 */
  function pick(rand, list) {
    if (!Array.isArray(list) || !list.length) return null;
    return list[Math.floor(rand() * list.length) % list.length];
  }
  /* Seed の作り方。人が読めて、貼り付けて再現できる長さにする。 */
  function newSeed() {
    var t = Date.now().toString(36);
    var r = "";
    try {
      if (root.crypto && root.crypto.getRandomValues) {
        var a = new Uint8Array(4); root.crypto.getRandomValues(a);
        r = Array.prototype.map.call(a, function (b) { return b.toString(16).padStart(2, "0"); }).join("");
      }
    } catch (e) {}
    if (!r) r = Math.floor(Math.random() * 0xffffffff).toString(16);
    return (t + r).slice(0, 12).toUpperCase();
  }

  /* ══════════════════════════════════════════════════════════════════
     共通データ構造（未設定なら現在の Quick Mock と完全に同じ動作）
     ══════════════════════════════════════════════════════════════════ */
  function defaultLayoutSettings() {
    return {
      outputEngine: "current",
      layoutMode: "current",
      answerSheetMode: "current",
      /* 文書形式・教科レイアウト（Layout Grammar V2）。
         null は「指定なし＝おまかせ」。ここに値が無いと、
         保存した文書形式が読み戻しで消える（実測 2026-08-05）。 */
      documentFamily: null,
      subjectLayout: null,
      layoutProfileId: null,
      answerSheetProfileId: null,
      layoutSeed: null,
      layoutPlan: null
    };
  }
  /* 文書形式・教科レイアウトの ID は layout-grammar.js が唯一の出所。
     layout-grammar.js が読み込まれていない場面（先に読む順序・
     一部のテスト構成）では検証できないので、そのときは指定なしへ落とす。
     知らない値をそのまま通すと、あとで存在しない形式で組もうとして落ちる。 */
  function knownGrammarId(dict, id) {
    if (typeof id !== "string" || !id) return null;
    var G = VQ2.layoutGrammar;
    var table = G && G[dict];
    if (!table) return null;
    return Object.prototype.hasOwnProperty.call(table, id) ? id : null;
  }
  /* ── 「AI おまかせ」で保存したものを、保存した当時の紙面で開く ──────
     auto の解決先は「一覧の先頭にある使える紙面」だった。
     仕様 §39 の 12 レイアウトを一覧の前へ足したときに先頭が入れ替わり、
     保存済みの試験を開くと紙面が黙って
       school-science-figure-classic → exam-standard-a4
       school-answer-grid-dense      → school-answer-grid-standard
     へ変わっていた（移行も告知も無し・実測 2026-08-05）。

     いま保存されるレコードは、そのとき解決した紙面 ID を必ず書いている
     （layoutFromUiSettings）。書かれていないのは、それより前に保存した
     レコードだけ。**書かれていないときは、昔の既定で開く。**
     新規作成の既定（resolveLayoutProfileId の auto）はこれとは別の話で、
     いまの一覧の先頭のままにしてある。 */
  var LEGACY_AUTO_LAYOUT_PROFILE = "school-science-figure-classic";
  var LEGACY_AUTO_ANSWER_PROFILE = "school-answer-grid-dense";
  function savedProfileId(id, mode, documentType, legacyId) {
    var p = PROFILES[id];
    if (p && p.documentType === documentType) return id;
    /* 保存レコードに紙面が書かれていない「おまかせ」＝昔の既定で開く */
    if (mode === "auto") return legacyId;
    return null;
  }
  /* 古い保存データには layout が無い。無いものは既定値として読む。 */
  function readLayoutSettings(spec) {
    var d = defaultLayoutSettings();
    var l = spec && spec.layout;
    if (!l || typeof l !== "object") return d;
    var mode = modeExists(LAYOUT_MODES, l.layoutMode) ? l.layoutMode : "current";
    var asMode = modeExists(ANSWER_SHEET_MODES, l.answerSheetMode) ? l.answerSheetMode : "current";
    return {
      outputEngine: OUTPUT_ENGINES.indexOf(l.outputEngine) >= 0 ? l.outputEngine : "current",
      layoutMode: mode,
      answerSheetMode: asMode,
      documentFamily: knownGrammarId("DOCUMENT_FAMILIES", l.documentFamily),
      subjectLayout: knownGrammarId("SUBJECT_PACKS", l.subjectLayout),
      layoutProfileId: savedProfileId(l.layoutProfileId, mode, "question-paper",
                                      LEGACY_AUTO_LAYOUT_PROFILE),
      answerSheetProfileId: savedProfileId(l.answerSheetProfileId, asMode, "answer-sheet",
                                           LEGACY_AUTO_ANSWER_PROFILE),
      layoutSeed: typeof l.layoutSeed === "string" && l.layoutSeed ? l.layoutSeed.slice(0, 40) : null,
      layoutPlan: (l.layoutPlan && typeof l.layoutPlan === "object") ? l.layoutPlan : null
    };
  }
  function modeExists(list, id) {
    return list.some(function (m) { return m.id === id; });
  }

  /* ══════════════════════════════════════════════════════════════════
     画面の選択（Quick Mock の設定欄）→ MockSpec.layout

     画面側は「指定なし」を "current"（エンジン・紙面デザイン・解答用紙）と
     "auto"（文書形式・教科レイアウト）の 2 通りの語で持っている。
     ここでその語を落として、保存する形へ直す。

     何も選んでいなければ null を返す。呼び出し側は layout を **足さない**。
     古い保存データとまったく同じ形にしておくため。
     ══════════════════════════════════════════════════════════════════ */
  function uiLayoutTouched(s) {
    if (!s) return false;
    return !((s.outputEngine || "current") === "current"
             && (s.layoutMode || "current") === "current"
             && (s.answerSheetMode || "current") === "current"
             && (s.documentFamily || "auto") === "auto"
             && (s.subjectLayout || "auto") === "auto");
  }
  function layoutFromUiSettings(s) {
    if (!uiLayoutTouched(s)) return null;
    var mode = s.layoutMode || "current";
    var asMode = s.answerSheetMode || "current";
    return {
      outputEngine: s.outputEngine || "current",
      layoutMode: mode,
      answerSheetMode: asMode,
      documentFamily: (s.documentFamily || "auto") === "auto" ? null : s.documentFamily,
      subjectLayout: (s.subjectLayout || "auto") === "auto" ? null : s.subjectLayout,
      layoutProfileId: resolveLayoutProfileId(mode, null),
      answerSheetProfileId: resolveAnswerProfileId(asMode, null),
      layoutSeed: s.layoutSeed || null,
      layoutPlan: null
    };
  }
  /* 選び直した紙面の指定を、作ってある MockSpec へ書き戻す。
     さわるのは spec.layout **だけ**。
     問題文・正解・選択肢・配点・問題 ID・問題番号には一切さわらない。
     中身が変わったときだけ true を返す（変わっていないなら組み直さなくてよい）。 */
  function applyLayoutToSpec(spec, s) {
    if (!spec) return false;
    var before = JSON.stringify(spec.layout || null);
    var lay = layoutFromUiSettings(s);
    if (lay) spec.layout = lay;
    else if (spec.layout) delete spec.layout;      /* 既定へ戻したら、古い保存データと同じ形へ戻す */
    return JSON.stringify(spec.layout || null) !== before;
  }
  /* 新レイアウト処理へ入るかどうか。ここが唯一の関門。 */
  function isEnabled(settings) {
    if (!settings) return false;
    if (settings.layoutMode === "current" || !settings.layoutMode) return false;
    return !!(resolveLayoutProfileId(settings.layoutMode, settings.layoutProfileId));
  }
  /* mode → profileId。準備中のものは null を返す（動くふりをしない）。 */
  function resolveLayoutProfileId(mode, explicitId) {
    if (explicitId && PROFILES[explicitId] && PROFILES[explicitId].documentType === "question-paper") return explicitId;
    var m = LAYOUT_MODES.filter(function (x) { return x.id === mode; })[0];
    if (!m) return null;
    if (m.id === "auto") {
      var ready = LAYOUT_MODES.filter(function (x) { return x.ready && x.profileId; });
      return ready.length ? ready[0].profileId : null;
    }
    /* 準備中（紙面処理が追いついていない）ものは、定義があっても通さない。
       ここを開けると「選べたのに紙が変わらない」＝動くふりになる。 */
    if (!m.ready) return null;
    return m.profileId || null;
  }
  function resolveAnswerProfileId(mode, explicitId) {
    if (explicitId && PROFILES[explicitId] && PROFILES[explicitId].documentType === "answer-sheet") return explicitId;
    var m = ANSWER_SHEET_MODES.filter(function (x) { return x.id === mode; })[0];
    if (!m) return null;
    if (m.id === "auto") {
      var ready = ANSWER_SHEET_MODES.filter(function (x) { return x.ready && x.profileId; });
      return ready.length ? ready[0].profileId : null;
    }
    if (!m.ready) return null;
    return m.profileId || null;
  }

  /* ══════════════════════════════════════════════════════════════════
     Layout Planner
     ・入力: MockSpec ＋ プロファイル ＋ Seed
     ・出力: layoutPlan（どの variant を使うか、だけ）
     ・問題文・正解・配点・ID・番号には一切さわらない。
     ══════════════════════════════════════════════════════════════════ */
  /* 解答用紙プロファイル → Layout Grammar の解答用紙ファミリー。
     grammar 側に available:true の対応物があるものだけを結ぶ。
     無いものは null にして、教科パックの既定に任せる（無い名前を渡さない）。 */
  var ANSWER_PROFILE_FAMILY = {
    "school-answer-grid-dense": "answer-dense-grid"
  };

  function planLayout(spec, opts) {
    opts = opts || {};
    var settings = opts.settings || readLayoutSettings(spec);
    var engine = resolveEngine(settings.outputEngine);

    var qpId = resolveLayoutProfileId(settings.layoutMode, settings.layoutProfileId);
    var asId = resolveAnswerProfileId(opts.answerSheetMode || settings.answerSheetMode,
                                      settings.answerSheetProfileId);
    var qp = qpId ? PROFILES[qpId] : null;
    var as = asId ? PROFILES[asId] : null;
    if (!qp) return null;                          /* 準備中の形式 → 現在の経路へ戻す */

    var notices = [];
    if (engine.fellBack) notices.push(engine.reason);
    /* プロファイルが対応していないエンジンを指定されたら、そこも正直に落とす。 */
    if (qp.compatibleEngines.indexOf(engine.engine) < 0) {
      notices.push("「" + qp.name + "」は " + engine.engine + " に対応していないため、現在の形式で組みます。");
      engine = { engine: "current", fellBack: true, reason: "" };
    }

    var seed = settings.layoutSeed || newSeed();
    var rand = rng(seed);
    /* 本文が使える横幅（mm）。図を何枚まで横に並べられるかの判断に使う。 */
    var PAPER_MM = { A4: 210, A3: 297, B4: 257, B5: 182 };
    var pw = PAPER_MM[qp.paper.size] || 210;
    if (qp.paper.orientation === "landscape") pw = { A4: 297, A3: 420, B4: 364, B5: 257 }[qp.paper.size] || 297;
    var contentWidthMm = pw - (qp.margins.left || 20) - (qp.margins.right || 20);

    /* 1) 紙面全体の variant。プロファイルが列挙したものだけ。 */
    var v = {};
    Object.keys(qp.variationRules).forEach(function (slot) {
      if (slot === "figureLayout" || slot === "choiceLayout") return;   /* 設問ごとに決める */
      v[slot] = pick(rand, qp.variationRules[slot]);
    });
    var spacing = v.spacing || "standard";
    var gapRange = qp.questionFlow.gapMmRange || [8, 8];
    var questionGapMm = spacing === "relaxed" ? gapRange[1] : gapRange[0];
    questionGapMm = Math.max(qp.safetyConstraints.minQuestionGapMm || 0, questionGapMm);

    /* 2) 大問・設問ごとの配置 */
    var sections = (spec.sections || []).map(function (sec, si) {
      return {
        sectionId: sec.id,
        number: sec.number,
        marker: (qp.sectionStyle.marker || "{n}").replace("{n}", String(sec.number)),
        markerVariant: v.sectionMarker || "plain",
        startsNewPage: qp.sectionStyle.startsNewPageFrom
          ? (si + 1) >= qp.sectionStyle.startsNewPageFrom : false,
        questions: (sec.questions || []).map(function (q, qi) {
          return planQuestion(q, qi, qp, rand, { contentWidthMm: contentWidthMm });
        })
      };
    });

    /* 3) 解答用紙。問題形式から決定論的に作る（乱数は見た目の density だけ）。 */
    var answerSheet = as ? planAnswerSheet(spec, as, rand, { contentWidthMm: contentWidthMm }) : null;

    /* ── Layout Grammar V2 ────────────────────────────────────────
       意味の計画（mm も列も CSS も入らない）を先に作り、
       そこから実寸へ落とした計画も並べて持つ。
       いまの Renderer は下の既存フィールドを見るので、見た目は変わらない。
       Typst / TeX へ渡すときは semantic から作り直せる。 */
    var G = VQ2.layoutGrammar || null;
    var semantic = null, resolved = null;
    if (G) {
      try {
        semantic = G.buildSemanticPlan(spec, {
          documentFamily: settings.documentFamily,
          subject: settings.subjectLayout,
          answerFamily: as ? (ANSWER_PROFILE_FAMILY[as.id] || null) : null,
          /* Seed は意味の層でも同じものを使う（同じ Seed なら同じ計画） */
          rng: rng(seed + "|semantic")
        });
        resolved = G.resolveSemanticPlan(semantic, {
          engine: engine.engine, margins: qp.margins, columns: (as && as.grid && as.grid.columns) || 24,
          basePt: qp.typography.basePt
        });
      } catch (e) {
        semantic = null; resolved = null;
        /* 黙って消さない。なぜ作れなかったのかを紙面の注意書きへ残す。 */
        notices.push("紙面の意味計画を作れませんでした（" + String((e && e.message) || e).slice(0, 80) + "）。");
      }
    }

    var plan = {
      planVersion: "1.0.0",
      mockId: spec.id,
      engine: engine.engine,
      requestedEngine: settings.outputEngine || "current",
      seed: seed,
      layoutProfileId: qp.id,
      layoutProfileVersion: qp.version,
      answerSheetProfileId: as ? as.id : null,
      answerSheetProfileVersion: as ? as.version : null,
      paper: {
        size: qp.paper.size, orientation: qp.paper.orientation,
        writingDirection: qp.paper.writingDirection, spread: !!qp.paper.spread,
        margins: Object.assign({}, qp.margins),
        minimumFontSize: qp.typography.minimumFontSize
      },
      typography: {
        bodyFamily: qp.typography.bodyFamily,
        headingFamily: qp.typography.headingFamily,
        basePt: qp.typography.basePt,
        lineHeight: qp.typography.lineHeight
      },
      variants: v,
      questionGapMm: questionGapMm,
      sections: sections,
      answerSheet: answerSheet,
      /* 意味の計画と、それを実寸へ落とした計画。
         Renderer はこれを見なくても組めるが、Typst / TeX はここから作る。 */
      semantic: semantic,
      resolved: resolved,
      /* ページ番号。文書ファミリーが決める。 */
      pageNumber: semantic ? semantic.pageNumber
        : (G ? G.normalizePageNumber(null) : null),
      notices: notices.concat(semantic ? semantic.notices : [])
    };
    return plan;
  }

  /* 図表の並べ方ごとに「何点必要か」。数が合わないものは候補から外す。 */
  var FIGURE_LAYOUT_NEEDS = {
    "figure-below-centered":  { min: 1, max: 1 },
    "figure-right":           { min: 1, max: 1 },
    "figure-table-row":       { min: 2, max: 3, needsTable: true },
    "multi-figure-centered":  { min: 2, max: 3 },
    "text-left-graph-right":  { min: 1, max: 1 },
    /* 上下に積む形。横幅を分け合わないので、点数が増えても 1 点あたりが細くならない。
       ここが「ほかの置き方が使えないとき」の受け皿になる（実測 2026-08-05：
       4 点の図表で受け皿が無く、検証が figureVariant で止まっていた）。 */
    "text-above-figures-below": { min: 2, max: 6 }
  };
  /* 本文の右へ置く形（本文と図が左右に並ぶ）。ここに入るものは幅の検査をする。 */
  var SIDE_BY_SIDE = { "figure-right": 1, "text-left-graph-right": 1 };
  /* 横並びの帯を作る形 */
  var ROW_LAYOUTS = { "figure-table-row": 1, "multi-figure-centered": 1 };
  /* 選択肢の並べ方 → 段数。Renderer が出せるのは 1 / 2 / 4 段だけ（3 段は無い）。 */
  var CHOICE_COLUMNS = { "vertical": 1, "two-column-short-only": 2, "four-column-short-only": 4 };

  /* 設問 1 つぶんの配置。図表があるときだけ図の置き方を選ぶ。 */
  function planQuestion(q, index, profile, rand, opts) {
    opts = opts || {};
    var figures = figureBlocksOf(q);
    var hasTable = figures.some(function (f) { return f.type === "table"; });
    var figureLayout = null;
    if (figures.length) {
      var allowed = (profile.variationRules.figureLayout || profile.figureRules.variants || [])
        .filter(function (v) {
          var need = FIGURE_LAYOUT_NEEDS[v];
          if (!need) return false;
          if (figures.length < need.min || figures.length > need.max) return false;
          if (need.needsTable && !hasTable) return false;
          return true;
        });
      /* 横に並べると 1 枚が細くなりすぎる場合は、横並びの形を候補から外す。
         小さくしすぎて読めない図を作らない。 */
      var usableMm = (opts.contentWidthMm || 170);
      var per = (usableMm * ((profile.figureRules.rowWidthPct || 94) / 100)) / figures.length;
      if (per < (profile.figureRules.minItemWidthMm || 34)) {
        allowed = allowed.filter(function (v) { return !ROW_LAYOUTS[v]; });
      }
      /* 横に並べてよい点数は紙面が決める（figureRules.maxRowItems）。
         この値をどこも見ていなかったので、「横に 2 点まで」と書いてある紙面
         （数学・英語・授業プリント）が 3 点を 1 行に並べていた
         （実測 2026-08-05：40 Seed 中 18 回）。書いてあるとおりに守る。 */
      var maxRowItems = profile.figureRules.maxRowItems || 0;
      if (maxRowItems && figures.length > maxRowItems) {
        allowed = allowed.filter(function (v) { return !ROW_LAYOUTS[v]; });
      }
      figureLayout = pick(rand, allowed) || fallbackFigureLayout(figures.length, maxRowItems);
    }

    var choices = Array.isArray(q.choices) ? q.choices : [];
    var choiceLayout = null, choiceColumns = 1;
    if (choices.length) {
      var cAllowed = (profile.variationRules.choiceLayout || profile.choiceLayout.variants || []).slice();
      /* 2 段は「短い選択肢のときだけ」。長い選択肢では候補から外す。 */
      var maxLen = Math.max.apply(null, choices.map(function (c) { return String(c.text || "").length; }));
      if (maxLen > (profile.choiceLayout.twoColumnMaxChars || 12)) {
        cAllowed = cAllowed.filter(function (x) { return x !== "two-column-short-only"; });
      }
      /* 4 段はもっと短い選択肢だけ。閾値を持たない紙面では 4 段を使わない。 */
      if (maxLen > (profile.choiceLayout.fourColumnMaxChars || 0)) {
        cAllowed = cAllowed.filter(function (x) { return x !== "four-column-short-only"; });
      }
      /* 図を右に置く回は、横幅が足りないので選択肢は 1 列に固定する。 */
      if (SIDE_BY_SIDE[figureLayout]) {
        cAllowed = cAllowed.filter(function (x) {
          return x !== "two-column-short-only" && x !== "four-column-short-only";
        });
      }
      choiceLayout = pick(rand, cAllowed) || "vertical";
      choiceColumns = CHOICE_COLUMNS[choiceLayout] || 1;
      /* 紙面が許す段数を超えない（安全側の線はここでも守る）。 */
      var maxCols = (profile.safetyConstraints && profile.safetyConstraints.maxColumns) || 1;
      if (choiceColumns > maxCols) { choiceLayout = "vertical"; choiceColumns = 1; }
    }

    return {
      questionId: q.id,
      number: q.number,
      marker: markerFor(profile, index),
      figureCount: figures.length,
      figureLayout: figureLayout,
      /* 複数の図表は 1 つのまとまりとして扱う。別々の設問にしない。 */
      figureGroup: figures.length ? {
        layout: ROW_LAYOUTS[figureLayout] ? "horizontal-centered"
              : SIDE_BY_SIDE[figureLayout] ? "side"
              : "vertical-centered",
        keepTogether: profile.figureRules.keepGroupTogether !== false,
        preserveAspectRatio: profile.figureRules.preserveAspectRatio !== false,
        items: figures.map(function (f, i) {
          return { type: f.type, id: f.id || (q.id + "-fg" + i), index: i };
        })
      } : null,
      figureWidthPct: figureLayout ? figureWidth(profile, figureLayout) : null,
      /* 図を右に置くとき、本文が使える幅。図とのすきまはプロファイルの最小値を守る。 */
      bodyWidthPct: SIDE_BY_SIDE[figureLayout]
        ? 100 - figureWidth(profile, figureLayout) - 4 : 100,
      /* 本文の左に選択肢も入れるか（実画像の（ウ）と同じ形） */
      choicesInBody: figureLayout === "text-left-graph-right",
      choiceLayout: choiceLayout,
      choiceColumns: choiceColumns,
      choiceMarker: (profile.choiceLayout && profile.choiceLayout.marker) || "number-dot",
      keepWithFigure: profile.questionFlow.keepQuestionWithFigure !== false,
      keepWithChoices: profile.questionFlow.keepQuestionWithChoices !== false
    };
  }
  /* 候補が 1 つも残らなかったときの受け皿。
     どの紙面も「上下に積む形（text-above-figures-below, 2〜6 点）」を持っているので、
     1〜6 点ならここまで来ない。7 点以上はこの受け皿でも数が合わず、
     検証（figureVariant）で止まる。**黙って壊れた紙面を出さない** ためのもの。 */
  function fallbackFigureLayout(n, maxRowItems) {
    /* 受け皿でも「横に並べてよい点数」は破らない。 */
    if (n >= 2 && maxRowItems && n > maxRowItems) return "text-above-figures-below";
    return n >= 2 ? "multi-figure-centered" : "figure-below-centered";
  }
  function markerFor(profile, index) {
    var m = (profile.subQuestionStyle && profile.subQuestionStyle.markers) || [];
    return m.length ? (m[index % m.length]) : "(" + (index + 1) + ")";
  }
  function figureWidth(profile, layout) {
    var f = profile.figureRules || {};
    var w = (layout === "figure-right" || layout === "text-left-graph-right") ? f.rightWidthPct
          : layout === "figure-below-centered" ? f.belowWidthPct
          : (layout === "figure-table-row" || layout === "multi-figure-centered") ? f.rowWidthPct
          : layout === "text-above-figures-below" ? f.rowWidthPct
          : f.centeredWidthPct;
    return Math.min(w || 62, f.maxWidthPct || 94);
  }
  /* 図・表として扱うブロック。ここに無いものは図表として数えない。 */
  var FIGURE_TYPES = ["figure", "table", "chart", "diagram"];
  function figureBlocksOf(q) {
    return (q && Array.isArray(q.contentBlocks) ? q.contentBlocks : [])
      .filter(function (b) { return b && FIGURE_TYPES.indexOf(b.type) >= 0; });
  }

  /* ══════════════════════════════════════════════════════════════════
     解答欄の形を決める（可変グリッド用）

     優先順位（上から順に見て、決まったらそこで止める）
       1. 利用者が付けた answerLayoutHint
       2. 問題形式と構造から決まるもの
       3. Planner の見立て（文字数の指定など）
       4. 迷ったら wide-answer（書ける面積を確保する側へ倒す）
     ══════════════════════════════════════════════════════════════════ */
  var CELL_KINDS = ["small-box", "box-sequence", "wide-answer", "lined-answer",
                    "merged-answer", "fixed-label"];
  /* 形式だけで決まるもの */
  var SHAPE_BY_TYPE = {
    multiple_choice_single:   "small-box",
    multiple_choice_multiple: "small-box",
    true_false:               "small-box",
    numeric:                  "wide-answer",
    short_answer:             "wide-answer",
    fill_blank:               "wide-answer",
    formula:                  "merged-answer",
    matching:                 "small-box",
    ordering:                 "small-box",
    long_answer:              "lined-answer",
    source_analysis:          "lined-answer",
    essay:                    "lined-answer",
    english_writing:          "lined-answer"
  };
  /* 「20字程度で」「8文字」など、問題文が字数を言っているときに拾う。
     推測で欄を作らないための材料であって、無ければ使わない。 */
  function charHintOf(q) {
    var t = String((q && q.prompt) || "");
    var m = t.match(/([0-9０-９]{1,3})\s*字/);
    if (m) {
      var n = parseInt(m[1].replace(/[０-９]/g, function (c) {
        return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
      }), 10);
      if (n >= 1 && n <= 400) return n;
    }
    return 0;
  }
  function decideCell(q, binding, profile) {
    var hint = q && q.answerLayoutHint;
    /* 1) 利用者の指定。知らない種類は受け取らない（勝手な形を作らせない）。 */
    if (hint && CELL_KINDS.indexOf(hint.kind) >= 0) {
      return { kind: hint.kind, count: clampInt(hint.count, 1, 40) || 1, source: "hint",
               label: typeof hint.label === "string" ? hint.label.slice(0, 8) : "" };
    }
    /* 2) 形式から決まるもの。
          解答用紙のプロファイルが独自の当てはめ（shapeByType）を持っていれば、
          そちらが先。持っていなければ全体の表を使う。
          知らない種類は受け取らない（描けない欄を作らない）。 */
    var own = (profile && profile.shapeByType) || null;
    var kind = (own && CELL_KINDS.indexOf(own[q.type]) >= 0 ? own[q.type] : null)
      || SHAPE_BY_TYPE[q.type] || "wide-answer";
    var count = 1;
    if (q.type === "matching" || q.type === "ordering") {
      count = Math.max(1, (binding && binding.blankCount) || (q.choices || []).length || 1);
    } else if (binding && binding.blankCount > 1) {
      count = Math.min(40, binding.blankCount);
    }
    /* 3) 字数の指定があれば、それに合う形へ寄せる */
    var chars = charHintOf(q);
    if (kind === "wide-answer" && chars >= 15) kind = "lined-answer";
    if (kind === "lined-answer" && chars && chars <= 14) kind = "wide-answer";
    /* 連続マスは「マスの数」が要る。字数の指定があればその数、
       無ければプロファイルの既定（英語の答案なら 10 マスなど）。 */
    if (kind === "box-sequence" && count <= 1) {
      count = clampInt(chars || (profile && profile.boxSequenceDefaultCount) || 8, 1, 40) || 8;
    }
    return { kind: kind, count: count, source: "type", chars: chars, label: "" };
  }
  function clampInt(v, lo, hi) {
    var n = Number(v);
    if (!isFinite(n)) return 0;
    n = Math.floor(n);
    return Math.max(lo, Math.min(hi, n));
  }

  /* ══════════════════════════════════════════════════════════════════
     解答用紙の生成
     ・問題形式 → 解答欄 の対応はプロファイルの answerCellRules だけが決める。
     ・欄の数は設問の数と必ず一致させる（不足・重複・余りを出さない）。
     ══════════════════════════════════════════════════════════════════ */
  function planAnswerSheet(spec, profile, rand, opts) {
    opts = opts || {};
    var rules = profile.answerCellRules || {};
    var byType = rules.byType || {};
    var fallback = rules.fallback || { cell: "short", widthMm: 62, heightMm: 10, rows: 1 };
    var density = pick(rand, (profile.variationRules || {}).density || ["standard"]) || "standard";
    var markCell = pick(rand, (profile.variationRules || {}).markCell || ["box"]) || "box";
    var scoreColumn = pick(rand, (profile.variationRules || {}).scoreColumn || ["right"]) || "right";

    var bindings = {};
    (spec.answerBindings || []).forEach(function (b) { bindings[b.id] = b; });

    var rows = [];
    var sections = (spec.sections || []).map(function (sec) {
      var secRows = (sec.questions || []).map(function (q, qi) {
        var spec1 = byType[q.type] || fallback;
        var b = bindings[q.answerBindingId] || null;
        /* 対応・並び替えは「空所の数」だけ小さい欄を並べる */
        var cells = spec1.perBlank
          ? Math.max(1, (b && b.blankCount) || (q.choices || []).length || 1)
          : 1;
        var rowsCount = Math.max(1, spec1.rows || 1);
        /* AI が書いた解答行数の希望があれば、プロファイルの範囲で受け取る */
        if (b && b.answerLines && spec1.cell === "essay") rowsCount = Math.max(rowsCount, Math.min(20, b.answerLines));
        var row = {
          questionId: q.id,
          answerBindingId: q.answerBindingId,
          number: b ? b.number : String(q.number),
          questionNumber: q.number,
          label: (profile.subQuestionStyle.markers || [])[qi % 16] || "(" + (qi + 1) + ")",
          questionType: q.type,
          cell: spec1.cell,
          cellStyle: spec1.cell === "mark" || spec1.cell === "truefalse" ? markCell : "box",
          widthMm: spec1.widthMm,
          heightMm: Math.max(profile.safetyConstraints.minCellHeightMm || 8,
                             density === "dense" ? spec1.heightMm : spec1.heightMm + 2),
          rows: rowsCount,
          cells: cells,
          points: q.points
        };
        rows.push(row);
        return row;
      });
      var sc = profile.scoreArea || {};
      return {
        sectionId: sec.id,
        number: sec.number,
        label: (profile.sectionStyle.marker || "{n}").replace("{n}", String(sec.number)),
        rule: profile.sectionStyle.rule || "thick",
        points: sec.points,
        rows: secRows,
        subtotal: !!(sc.perSection && sc.perSection.subtotal),
        grader: !!(sc.perSection && sc.perSection.grader),
        regrade: scoreColumn === "right-with-regrade" && !!(sc.perSection && sc.perSection.regrade)
      };
    });

    var totalPoints = sections.reduce(function (a, s) {
      return a + s.rows.reduce(function (b, r) { return b + (Number(r.points) || 0); }, 0);
    }, 0);

    /* Seed で変えてよい見た目。番号・欄の数・対応・配点・字数は含めない。 */
    var variants = { header: pick(rand, profile.variationRules.header) || "top-bar",
                     density: density, markCell: markCell, scoreColumn: scoreColumn };
    ["rowGrouping", "answerWidth", "sectionGap", "scorePlace", "nameWidth", "writtenRows"]
      .forEach(function (k) {
        if (profile.variationRules[k]) variants[k] = pick(rand, profile.variationRules[k]);
      });

    var out = {
      profileId: profile.id,
      profileVersion: profile.version,
      variants: variants,
      sections: sections,
      cellCount: rows.length,
      totalPoints: totalPoints,
      scoreArea: {
        total: !!(profile.scoreArea && profile.scoreArea.total && profile.scoreArea.total.show),
        totalLabel: (profile.scoreArea.total && profile.scoreArea.total.label) || "合計",
        regradeTotal: scoreColumn === "right-with-regrade"
          && !!(profile.scoreArea.regradeTotal && profile.scoreArea.regradeTotal.show),
        regradeLabel: (profile.scoreArea.regradeTotal && profile.scoreArea.regradeTotal.label) || "再採点",
        position: profile.scoreArea.position || "right"
      },
      studentFields: (profile.studentFields || []).slice(),
      studentFieldsPosition: profile.studentFieldsPosition || "bottom"
    };
    /* このプロファイルが可変グリッドを持っているときは、そちらも組む。
       1 問 1 行の作り方（sections）は残したまま、grid を足す形にする。 */
    if (profile.grid && profile.grid.enabled) {
      out.grid = planAnswerGrid(spec, profile, rand, out, opts);
    }
    return out;
  }

  /* ══════════════════════════════════════════════════════════════════
     可変グリッドの解答用紙（実画像 2 枚目の構造）

     ・大問ごとに独立した枠。左端は縦に結合した大問セル。
     ・同じ行に複数の小問を入れてよい。行の高さは中身で変える。
     ・配点は罫線の太さで表す（1点配当 / 2点配当）。
     ・変えてよいのは「まとめ方・幅・すきま・行数」だけ。
       番号・欄の数・対応・配点・字数は Seed で動かさない。
     ══════════════════════════════════════════════════════════════════ */
  function planAnswerGrid(spec, profile, rand, sheet, opts) {
    opts = opts || {};
    var g = profile.grid || {};
    var v = sheet.variants || {};
    var COLS = g.columns || 24;
    /* 1 列が何 mm になるかを先に出す。
       これを使わずに colSpan を勘で決めると、固定幅の欄がセルより広くなり、
       紙面で中身が枠から切れる（実測で 1 Seed あたり 5 箇所出た）。 */
    var sc0 = profile.scoreArea || {};
    var contentMm = opts.contentWidthMm
      || (210 - ((profile.margins || {}).left || 14) - ((profile.margins || {}).right || 14));
    var reservedMm = (g.sectionLabel.widthMm || 10)
      + ((sc0.denominator && sc0.denominator.show) ? (sc0.denominator.widthMm || 18) : 0)
      + (v.scoreColumn === "right-with-regrade" ? 16 : 0);
    var mmPerCol = Math.max(1, (contentMm - reservedMm) / COLS);
    var CELL_PAD_MM = 2.4;                  /* 左右の余白 + 罫線ぶん */
    function spanFor(mm) {
      return Math.max(1, Math.min(COLS, Math.ceil((mm + CELL_PAD_MM) / mmPerCol)));
    }
    var groupMax = v.rowGrouping === "triple" ? 3 : v.rowGrouping === "pair" ? 2 : 1;
    groupMax = Math.min(groupMax, g.rowGroupMax || 3);
    var widthScale = v.answerWidth === "wide" ? 1.15 : v.answerWidth === "narrow" ? 0.88 : 1;
    var gapMm = v.sectionGap === "loose" ? (g.sectionGapMm + 3)
              : v.sectionGap === "tight" ? Math.max(1, g.sectionGapMm - 2) : g.sectionGapMm;
    var rowBonus = v.writtenRows === "plus" ? 1 : 0;   /* 記述の行数は増やす方向にだけ動かす */

    var bindings = {};
    (spec.answerBindings || []).forEach(function (b) { bindings[b.id] = b; });

    var blocks = (spec.sections || []).map(function (sec) {
      var qs = sec.questions || [];
      /* 同じ行にまとめてよいのは、1 マスで足りる小さい欄どうしだけ。
         横長・複数行の欄は必ず 1 行を専有させる（書く面積を削らない）。 */
      var rows = [], run = [];
      qs.forEach(function (q) {
        var b = bindings[q.answerBindingId] || null;
        var d = decideCell(q, b, profile);
        var small = (d.kind === "small-box" || d.kind === "fixed-label") && d.count <= 2;
        if (!small) {
          if (run.length) { rows.push(run); run = []; }
          rows.push([{ q: q, b: b, d: d }]);
          return;
        }
        run.push({ q: q, b: b, d: d });
        if (run.length >= groupMax) { rows.push(run); run = []; }
      });
      if (run.length) rows.push(run);

      var gridRows = rows.map(function (items, ri) {
        var cells = [];
        var used = 0;
        items.forEach(function (it, i) {
          var shape = (profile.answerShapes || {})[it.d.kind]
            || { widthMm: 56, heightMm: 10, rows: 1 };
          /* 小問番号 */
          var qlSpan = spanFor(g.questionLabel.widthMm);
          cells.push({
            type: "question-label", text: it.d.label || labelFor(profile, indexOfQuestion(qs, it.q)),
            widthMm: g.questionLabel.widthMm, minWidthMm: g.cellMinWidthMm,
            colSpan: qlSpan, rowSpan: 1,
            align: "center", questionId: it.q.id
          });
          used += qlSpan;
          var span, cell = {
            questionId: it.q.id, answerBindingId: it.q.answerBindingId,
            points: it.q.points, align: "left", verticalAlign: "middle"
          };
          if (it.d.kind === "small-box") {
            cell.type = "small-box";
            /* 記号の欄を丸にするか四角にするか。1 問 1 行の作り方と同じ規則で決める
               （変えてよいのは見た目だけ。欄の数・対応・配点は動かさない）。
               ここを渡していなかったので、markCell が "circle" だけの
               「マーク中心」でも Renderer は四角しか描けていなかった
               （実測 2026-08-05：どの Seed でも is-circle が出ない）。 */
            var byTypeCell = ((profile.answerCellRules || {}).byType || {})[it.q.type];
            cell.cellStyle = (byTypeCell
              && (byTypeCell.cell === "mark" || byTypeCell.cell === "truefalse"))
              ? (v.markCell || "box") : "box";
            cell.widthMm = round1(shape.widthMm * widthScale);
            cell.minWidthMm = g.cellMinWidthMm;
            cell.heightMm = Math.max(g.cellMinHeightMm, shape.heightMm);
            cell.cells = it.d.count;
            /* 中身の実寸（欄の幅 × 個数 + すきま）から列数を出す */
            span = spanFor(cell.widthMm * it.d.count + (it.d.count - 1) * 1);
            cell.colSpan = Math.min(COLS - used, span);
          } else if (it.d.kind === "box-sequence") {
            cell.type = "box-sequence";
            cell.widthMm = round1(shape.widthMm);
            /* 1 マスの下限。欄ぜんたいの下限とは別物（マスは細くてよい）。 */
            cell.minWidthMm = 5;
            cell.heightMm = Math.max(g.cellMinHeightMm, g.rowHeightMm.boxSeq);
            cell.cells = it.d.count;
            cell.colSpan = Math.min(COLS - used, spanFor(cell.widthMm * it.d.count));
          } else if (it.d.kind === "lined-answer") {
            cell.type = "lined-answer";
            cell.widthMm = null;                     /* 残り幅いっぱい */
            cell.minWidthMm = 60;
            cell.heightMm = Math.max(g.cellMinHeightMm, g.rowHeightMm.lined);
            cell.rows = Math.max(shape.rows, shape.rows + rowBonus);
            cell.colSpan = COLS - used;
          } else if (it.d.kind === "merged-answer") {
            cell.type = "merged-answer";
            cell.widthMm = null;
            cell.minWidthMm = 60;
            cell.heightMm = Math.max(g.cellMinHeightMm, shape.heightMm + 2);
            cell.colSpan = COLS - used;
          } else if (it.d.kind === "fixed-label") {
            cell.type = "fixed-label";
            cell.text = it.d.label || "";
            cell.widthMm = shape.widthMm;
            cell.minWidthMm = g.cellMinWidthMm;
            cell.heightMm = Math.max(g.cellMinHeightMm, shape.heightMm);
            cell.colSpan = Math.min(COLS - used, spanFor(cell.widthMm));
          } else {
            cell.type = "wide-answer";
            cell.minWidthMm = 24;
            cell.heightMm = Math.max(g.cellMinHeightMm, shape.heightMm);
            cell.cells = it.d.count > 1 ? it.d.count : 1;
            /* 同じ行に複数入るときは等分。1 つだけなら残り幅いっぱい。
               幅は列から決まるので、固定の mm は持たせない（切れの原因になる）。 */
            cell.colSpan = items.length > 1
              ? Math.max(2, Math.floor((COLS - used) / (items.length - i)))
              : COLS - used;
            cell.widthMm = null;
          }
          /* 配点で罫線の太さを変える（実画像の「1点配当 / 2点配当」と同じ考え方） */
          if (g.pointBorder && g.pointBorder.enabled) {
            cell.borderWidth = (Number(it.q.points) || 0) >= g.pointBorder.thickFromPoints
              ? g.pointBorder.thickWidthMm : g.pointBorder.thinWidthMm;
          }
          cell.colSpan = Math.max(1, Math.min(cell.colSpan, COLS - used));
          used += cell.colSpan;
          cells.push(cell);
        });
        /* 余った列は詰め物で埋める（表の列数を必ずそろえる） */
        if (used < COLS) cells.push({ type: "spacer", colSpan: COLS - used, widthMm: null });
        var h = Math.max.apply(null, cells.map(function (c) {
          return (c.heightMm || 0) * (c.rows || 1);
        }).concat([g.rowHeightMm.min]));
        return { index: ri, heightMm: h, cells: cells };
      });

      var sc = profile.scoreArea || {};
      return {
        sectionId: sec.id, number: sec.number,
        /* 左端の縦に結合した大問セル */
        sectionLabel: {
          type: "section-label",
          text: (g.sectionLabel.template || "問題{n}").replace("{n}", String(sec.number)),
          widthMm: g.sectionLabel.widthMm,
          writingMode: g.sectionLabel.writingMode || "vertical",
          rowSpan: gridRows.length, align: "center", verticalAlign: "middle"
        },
        rows: gridRows,
        columns: COLS,
        gapMm: gapMm,
        outerBorderWidthMm: g.outerBorderWidthMm,
        innerBorderWidthMm: g.innerBorderWidthMm,
        /* 右端の得点欄。実画像は「斜線 + 満点」。 */
        score: {
          type: "score-denominator",
          show: !!(sc.denominator && sc.denominator.show),
          denominator: (sec.questions || []).reduce(function (a, x) { return a + (Number(x.points) || 0); }, 0),
          widthMm: (sc.denominator && sc.denominator.widthMm) || 18,
          slash: !!(sc.denominator && sc.denominator.slash),
          place: v.scorePlace || "right"
        },
        recheck: v.scoreColumn === "right-with-regrade"
          ? { type: "recheck-box", widthMm: 16, label: "再採点" } : null
      };
    });

    var totalPoints = blocks.reduce(function (a, b) { return a + b.score.denominator; }, 0);
    return {
      mode: "grid",
      columns: COLS,
      blocks: blocks,
      pointLegend: (g.pointLegend && g.pointLegend.show)
        ? { labels: g.pointLegend.labels.slice(),
            thinWidthMm: g.pointBorder.thinWidthMm, thickWidthMm: g.pointBorder.thickWidthMm }
        : null,
      total: {
        type: "score-denominator", show: !!(profile.scoreArea.total && profile.scoreArea.total.show),
        denominator: totalPoints, widthMm: (profile.scoreArea.total || {}).widthMm || 30,
        slash: !!(profile.scoreArea.total || {}).slash
      },
      studentFields: (profile.studentFields || []).map(function (f) {
        return Object.assign({}, f, {
          type: "student-field",
          widthMm: f.key === "name" && v.nameWidth === "wide" ? f.widthMm + 16 : f.widthMm
        });
      })
    };
  }
  function indexOfQuestion(qs, q) {
    for (var i = 0; i < qs.length; i++) if (qs[i].id === q.id) return i;
    return 0;
  }
  function labelFor(profile, index) {
    var m = (profile.subQuestionStyle && profile.subQuestionStyle.markers) || [];
    return m.length ? m[index % m.length] : "(" + (index + 1) + ")";
  }
  function round1(v) { return Math.round(v * 10) / 10; }

  /* ══════════════════════════════════════════════════════════════════
     LayoutPlan の JSON Schema
     ・形が違うものを紙面へ流さない。
     ・AI に組版ソースを書かせないので、ここに文章は入らない。
     ══════════════════════════════════════════════════════════════════ */
  var PLAN_SCHEMA = {
    type: "object",
    required: ["planVersion", "mockId", "engine", "seed", "layoutProfileId", "paper", "sections"],
    properties: {
      planVersion: { type: "string", maxLength: 20 },
      mockId: { type: "string", maxLength: 120 },
      engine: { type: "string", enum: ["current"] },
      requestedEngine: { type: "string", enum: OUTPUT_ENGINES },
      seed: { type: "string", minLength: 1, maxLength: 40 },
      layoutProfileId: { type: "string", maxLength: 80 },
      layoutProfileVersion: { type: "string", maxLength: 20 },
      answerSheetProfileId: { type: ["string", "null"], maxLength: 80 },
      questionGapMm: { type: "number", min: 0, max: 40 },
      paper: {
        type: "object", required: ["size", "orientation", "margins"],
        properties: {
          size: { type: "string", enum: ["A4", "A3", "B4", "B5"] },
          orientation: { type: "string", enum: ["portrait", "landscape"] },
          writingDirection: { type: "string", enum: ["horizontal", "vertical"] },
          minimumFontSize: { type: "number", min: 6, max: 20 }
        }
      },
      sections: {
        type: "array", minItems: 1, maxItems: 20,
        items: {
          type: "object", required: ["sectionId", "number", "questions"],
          properties: {
            sectionId: { type: "string", maxLength: 60 },
            number: { type: "integer", min: 1 },
            questions: {
              type: "array", minItems: 0, maxItems: 200,
              items: {
                type: "object", required: ["questionId", "number"],
                properties: {
                  questionId: { type: "string", maxLength: 60 },
                  number: { type: "integer", min: 1 },
                  figureLayout: { type: ["string", "null"],
                                  enum: [null, "figure-below-centered", "figure-right", "figure-table-row",
                                         "multi-figure-centered", "text-left-graph-right", "text-above-figures-below"] },
                  figureGroup: {
                    type: ["object", "null"],
                    properties: {
                      layout: { type: "string", enum: ["horizontal-centered", "vertical-centered", "side"] },
                      keepTogether: { type: "boolean" },
                      items: { type: "array", maxItems: 6,
                               items: { type: "object", properties: { type: { type: "string" } } } }
                    }
                  },
                  choiceLayout: { type: ["string", "null"],
                                  enum: [null, "vertical", "two-column-short-only",
                                         "four-column-short-only"] },
                  /* 段数は Renderer が出せる 1 / 2 / 4 のいずれか。
                     紙面ごとの上限は safetyConstraints.maxColumns が別に見る。 */
                  choiceColumns: { type: "integer", min: 1, max: 4 },
                  figureWidthPct: { type: ["number", "null"], min: 0, max: 100 },
                  bodyWidthPct: { type: "number", min: 0, max: 100 }
                }
              }
            }
          }
        }
      }
    }
  };

  /* 最小限の JSON Schema 検証。外部依存を増やさないため自前で持つ。 */
  function validateAgainstSchema(value, schema, path, out) {
    out = out || [];
    path = path || "";
    if (!schema) return out;
    var types = Array.isArray(schema.type) ? schema.type : (schema.type ? [schema.type] : []);
    if (types.length && !matchesType(value, types)) {
      out.push({ path: path || "(root)", code: "type", message: "型が違います（期待 " + types.join("|") + "）" });
      return out;
    }
    if (schema.enum && schema.enum.indexOf(value === undefined ? null : value) < 0) {
      out.push({ path: path, code: "enum", message: "使用できない値です: " + JSON.stringify(value) });
    }
    if (typeof value === "string") {
      if (schema.maxLength != null && value.length > schema.maxLength)
        out.push({ path: path, code: "maxLength", message: "長すぎます" });
      if (schema.minLength != null && value.length < schema.minLength)
        out.push({ path: path, code: "minLength", message: "短すぎます" });
    }
    if (typeof value === "number") {
      if (schema.min != null && value < schema.min) out.push({ path: path, code: "min", message: "小さすぎます" });
      if (schema.max != null && value > schema.max) out.push({ path: path, code: "max", message: "大きすぎます" });
    }
    if (Array.isArray(value)) {
      if (schema.minItems != null && value.length < schema.minItems)
        out.push({ path: path, code: "minItems", message: "件数が足りません" });
      if (schema.maxItems != null && value.length > schema.maxItems)
        out.push({ path: path, code: "maxItems", message: "件数が多すぎます" });
      if (schema.items) value.forEach(function (v, i) {
        validateAgainstSchema(v, schema.items, path + "[" + i + "]", out);
      });
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      (schema.required || []).forEach(function (k) {
        if (value[k] === undefined || value[k] === null)
          out.push({ path: path ? path + "." + k : k, code: "required", message: "必須の項目がありません: " + k });
      });
      Object.keys(schema.properties || {}).forEach(function (k) {
        if (value[k] === undefined) return;
        validateAgainstSchema(value[k], schema.properties[k], path ? path + "." + k : k, out);
      });
    }
    return out;
  }
  function matchesType(v, types) {
    for (var i = 0; i < types.length; i++) {
      var t = types[i];
      if (t === "null" && v === null) return true;
      if (t === "string" && typeof v === "string") return true;
      if (t === "number" && typeof v === "number" && isFinite(v)) return true;
      if (t === "integer" && typeof v === "number" && isFinite(v) && Math.floor(v) === v) return true;
      if (t === "boolean" && typeof v === "boolean") return true;
      if (t === "array" && Array.isArray(v)) return true;
      if (t === "object" && v && typeof v === "object" && !Array.isArray(v)) return true;
    }
    return false;
  }
  function validatePlanSchema(plan) { return validateAgainstSchema(plan, PLAN_SCHEMA, "", []); }

  /* ══════════════════════════════════════════════════════════════════
     レイアウト検証
     ・PDF を目で見なくても分かることを、全部ここで確かめる。
     ・error が 1 件でもあれば紙面へ流さない。
     ══════════════════════════════════════════════════════════════════ */
  function issue(sev, code, message, path) {
    return { severity: sev, code: code, message: message, path: path || "" };
  }
  /* 本文が使える横幅（mm）。プロファイルの紙と余白から出す。 */
  var PAPER_W = { A4: 210, A3: 297, B4: 257, B5: 182 };
  var PAPER_W_LAND = { A4: 297, A3: 420, B4: 364, B5: 257 };
  function opts_contentWidthMm(profile) {
    var pp = profile.paper || {};
    var w = (pp.orientation === "landscape" ? PAPER_W_LAND : PAPER_W)[pp.size] || 210;
    return w - ((profile.margins || {}).left || 20) - ((profile.margins || {}).right || 20);
  }
  function validateLayout(spec, plan) {
    var out = [];
    if (!plan) return out;

    /* 0) 形 */
    validatePlanSchema(plan).forEach(function (e) {
      out.push(issue("error", "planSchema", "レイアウト計画の形が正しくありません（" + e.path + "：" + e.message + "）", e.path));
    });

    var profile = getProfile(plan.layoutProfileId);
    if (!profile) {
      out.push(issue("error", "unknownProfile", "知らないレイアウトプロファイルです: " + plan.layoutProfileId));
      return out;
    }

    /* 1) 問題側と計画側の突き合わせ */
    var specQ = [];
    (spec.sections || []).forEach(function (sec) {
      (sec.questions || []).forEach(function (q) { specQ.push({ sec: sec, q: q }); });
    });
    var planQ = [];
    (plan.sections || []).forEach(function (sec) {
      (sec.questions || []).forEach(function (q) { planQ.push({ sec: sec, q: q }); });
    });

    if (specQ.length !== planQ.length) {
      out.push(issue("error", "questionCount",
        "設問の数が合いません（試験 " + specQ.length + " 問 / 計画 " + planQ.length + " 問）"));
    }
    var byId = {};
    planQ.forEach(function (x) { byId[x.q.questionId] = x.q; });
    specQ.forEach(function (x) {
      var p = byId[x.q.id];
      if (!p) {
        out.push(issue("error", "missingQuestion", "問 " + x.q.number + " が計画にありません", x.q.id));
        return;
      }
      if (p.number !== x.q.number) {
        out.push(issue("error", "numberMismatch",
          "問題番号が食い違っています（試験 " + x.q.number + " / 計画 " + p.number + "）", x.q.id));
      }
      if (!String(x.q.prompt || "").trim()) {
        out.push(issue("error", "emptyPrompt", "問 " + x.q.number + " の問題文がありません", x.q.id));
      }
      /* 図表を持つ設問で、図の置き方が決まっていない＝図が落ちている */
      var figs = figureBlocksOf(x.q);
      if (figs.length && !p.figureLayout) {
        out.push(issue("error", "missingFigure",
          "問 " + x.q.number + " は図表があるのに、置き場所が決まっていません", x.q.id));
      }
      /* 図の数に合わない置き方（横並びなのに 1 枚しかない、など）を止める */
      var need = FIGURE_LAYOUT_NEEDS[p.figureLayout];
      if (p.figureLayout && need && (figs.length < need.min || figs.length > need.max)) {
        out.push(issue("error", "figureVariant",
          "問 " + x.q.number + " は図表が " + figs.length + " 点なのに「" + p.figureLayout
          + "」が選ばれています", x.q.id));
      }
      if (need && need.needsTable && !figs.some(function (f) { return f.type === "table"; })) {
        out.push(issue("error", "figureVariant",
          "問 " + x.q.number + " に表が無いのに、表を含む並べ方が選ばれています", x.q.id));
      }
      /* 複数の図表は 1 つのまとまりとして持つ。バラバラにしない。 */
      if (figs.length && !p.figureGroup) {
        out.push(issue("error", "figureGroupMissing",
          "問 " + x.q.number + " の図表がひとまとまりになっていません", x.q.id));
      }
      if (p.figureGroup) {
        if ((p.figureGroup.items || []).length !== figs.length) {
          out.push(issue("error", "figureGroupSplit",
            "問 " + x.q.number + " で図表が分かれています（試験 " + figs.length
            + " 点 / 計画 " + (p.figureGroup.items || []).length + " 点）", x.q.id));
        }
        if (p.figureGroup.keepTogether !== true) {
          out.push(issue("error", "figureGroupSplit",
            "問 " + x.q.number + " の図表がページで分断される設定になっています", x.q.id));
        }
        var perMm = ((opts_contentWidthMm(profile)) * ((p.figureWidthPct || 0) / 100))
          / Math.max(1, (p.figureGroup.items || []).length);
        if (p.figureGroup.layout === "horizontal-centered"
            && perMm < (profile.figureRules.minItemWidthMm || 34)) {
          out.push(issue("error", "figureTooSmall",
            "問 " + x.q.number + " は横に並べると 1 点あたりが細くなりすぎます（"
            + Math.round(perMm) + "mm）", x.q.id));
        }
      }
      /* 許可されていない variant を使っていないか */
      var allowedFig = profile.variationRules.figureLayout || [];
      if (p.figureLayout && allowedFig.indexOf(p.figureLayout) < 0) {
        out.push(issue("error", "variantNotAllowed",
          "この形式では使えない図の置き方です: " + p.figureLayout, x.q.id));
      }
      var allowedCh = profile.variationRules.choiceLayout || [];
      if (p.choiceLayout && allowedCh.indexOf(p.choiceLayout) < 0) {
        out.push(issue("error", "variantNotAllowed",
          "この形式では使えない選択肢の並べ方です: " + p.choiceLayout, x.q.id));
      }
      /* 用紙外・重なり（構造で分かる範囲）
         図を右に置くとき、本文の幅 + 図の幅 + すきま が 100% を超えたら必ず重なる。 */
      if (SIDE_BY_SIDE[p.figureLayout]) {
        var gapPct = 4;
        var used = (p.bodyWidthPct || 0) + (p.figureWidthPct || 0) + gapPct;
        if (used > 100.001) {
          out.push(issue("error", "overlap",
            "問 " + x.q.number + " は本文と図が重なります（合計 " + Math.round(used) + "%）", x.q.id));
        }
      }
      if (p.figureWidthPct != null && p.figureWidthPct > (profile.safetyConstraints.maxFigureWidthPct || 100)) {
        out.push(issue("error", "outOfPage",
          "問 " + x.q.number + " の図が用紙からはみ出します（" + p.figureWidthPct + "%）", x.q.id));
      }
      if ((p.choiceColumns || 1) > (profile.safetyConstraints.maxColumns || 2)) {
        out.push(issue("error", "tooManyColumns", "問 " + x.q.number + " の段組みが多すぎます", x.q.id));
      }
    });

    /* 2) 文字の大きさ */
    var minPt = profile.safetyConstraints.minFontPt || 0;
    if (plan.paper && plan.paper.minimumFontSize < minPt) {
      out.push(issue("error", "fontTooSmall",
        "最小の文字が " + plan.paper.minimumFontSize + "pt で、この形式の下限 " + minPt + "pt を下回ります"));
    }
    if (plan.typography && plan.typography.basePt < minPt) {
      out.push(issue("error", "fontTooSmall", "本文の文字が下限より小さくなっています"));
    }

    /* 3) 見出しの孤立と白紙
          設問が 0 問の大問は、見出しだけがページに残る。 */
    if (profile.safetyConstraints.forbidOrphanHeading) {
      (plan.sections || []).forEach(function (sec) {
        if (!sec.questions || !sec.questions.length) {
          out.push(issue("error", "orphanHeading",
            "大問 " + sec.number + " に設問がありません（見出しだけが残ります）", sec.sectionId));
        }
      });
    }
    if ((plan.sections || []).length && planQ.length === 0) {
      out.push(issue("error", "blankPage", "設問が 1 問もないため、白紙になります"));
    }

    /* 4) 問題ごとの空き */
    if (plan.questionGapMm != null
        && plan.questionGapMm < (profile.safetyConstraints.minQuestionGapMm || 0)) {
      out.push(issue("error", "gapTooSmall", "問題どうしの間隔が狭すぎます"));
    }

    /* 5) 解答用紙 */
    if (plan.answerSheet) out = out.concat(validateAnswerSheet(spec, plan.answerSheet));

    return out;
  }

  function validateAnswerSheet(spec, sheet) {
    var out = [];
    var profile = getProfile(sheet.profileId);
    if (!profile) {
      out.push(issue("error", "unknownProfile", "知らない解答用紙プロファイルです: " + sheet.profileId));
      return out;
    }
    var specQ = [];
    (spec.sections || []).forEach(function (sec) {
      (sec.questions || []).forEach(function (q) { specQ.push(q); });
    });
    var rows = [];
    (sheet.sections || []).forEach(function (s) { (s.rows || []).forEach(function (r) { rows.push(r); }); });

    /* 欄の数 = 設問の数（不足も余りも出さない） */
    if (rows.length !== specQ.length) {
      out.push(issue("error", "answerCellCount",
        "解答欄の数が設問の数と合いません（設問 " + specQ.length + " / 欄 " + rows.length + "）"));
    }
    /* 番号・ID・配点の対応 */
    var seen = {};
    rows.forEach(function (r) {
      if (seen[r.questionId]) {
        out.push(issue("error", "duplicateAnswerCell", "同じ設問の解答欄が 2 つあります: 問 " + r.questionNumber, r.questionId));
      }
      seen[r.questionId] = true;
    });
    specQ.forEach(function (q) {
      var r = rows.filter(function (x) { return x.questionId === q.id; })[0];
      if (!r) {
        out.push(issue("error", "missingAnswerCell", "問 " + q.number + " の解答欄がありません", q.id));
        return;
      }
      if (r.questionNumber !== q.number) {
        out.push(issue("error", "answerNumberMismatch",
          "解答欄の番号が問題番号と違います（問題 " + q.number + " / 解答欄 " + r.questionNumber + "）", q.id));
      }
      if (r.answerBindingId !== q.answerBindingId) {
        out.push(issue("error", "answerBindingMismatch", "問 " + q.number + " の解答欄の対応先が違います", q.id));
      }
      if (Number(r.points) !== Number(q.points)) {
        out.push(issue("error", "pointsChanged",
          "問 " + q.number + " の配点が変わっています（" + q.points + " → " + r.points + "）", q.id));
      }
      /* 形式に合った欄か */
      var want = (profile.answerCellRules.byType || {})[q.type] || profile.answerCellRules.fallback;
      if (want && r.cell !== want.cell) {
        out.push(issue("error", "answerCellType",
          "問 " + q.number + "（" + q.type + "）に合わない解答欄です（" + r.cell + "）", q.id));
      }
      if (r.heightMm < (profile.safetyConstraints.minCellHeightMm || 0)) {
        out.push(issue("error", "answerCellTooSmall", "問 " + q.number + " の解答欄が小さすぎます", q.id));
      }
    });

    /* 可変グリッド側も、設問との対応が崩れていないかを見る */
    if (sheet.grid) out = out.concat(validateAnswerGrid(spec, sheet.grid, profile));

    /* 得点の合計 */
    var specTotal = specQ.reduce(function (a, q) { return a + (Number(q.points) || 0); }, 0);
    if (Number(sheet.totalPoints) !== specTotal) {
      out.push(issue("error", "totalPointsMismatch",
        "解答用紙の得点合計 " + sheet.totalPoints + " 点が、試験の合計 " + specTotal + " 点と合いません"));
    }
    if (spec.totalPoints != null && specTotal !== Number(spec.totalPoints)) {
      out.push(issue("warning", "totalPointsVsSpec",
        "設問の配点合計 " + specTotal + " 点が、試験の満点 " + spec.totalPoints + " 点と違います"));
    }
    return out;
  }

  /* 可変グリッドの検査。
     ・解答欄は設問と 1 対 1
     ・列数がすべての行でそろっている（ずれると罫線が崩れる）
     ・最小の幅・高さを下回らない
     ・記述の欄が書ける面積を持っている
     ・得点の合計が一致する */
  function validateAnswerGrid(spec, grid, profile) {
    var out = [];
    var specQ = [];
    (spec.sections || []).forEach(function (sec) {
      (sec.questions || []).forEach(function (q) { specQ.push(q); });
    });
    var byId = {};
    specQ.forEach(function (q) { byId[q.id] = q; });

    var ANSWER_CELLS = { "small-box": 1, "box-sequence": 1, "wide-answer": 1,
                         "lined-answer": 1, "merged-answer": 1, "fixed-label": 1 };
    var seen = Object.create(null), count = 0;
    var minW = profile.safetyConstraints.minCellWidthMm || 8;
    var minH = profile.safetyConstraints.minCellHeightMm || 8;
    var area = profile.safetyConstraints.minWriteAreaMm2 || {};

    (grid.blocks || []).forEach(function (blk) {
      if (!blk.rows || !blk.rows.length) {
        out.push(issue("error", "orphanHeading",
          "解答用紙の大問 " + blk.number + " に行がありません", blk.sectionId));
        return;
      }
      blk.rows.forEach(function (row, ri) {
        var span = (row.cells || []).reduce(function (a, c) { return a + (c.colSpan || 1); }, 0);
        if (span !== (blk.columns || grid.columns)) {
          out.push(issue("error", "gridColumnMismatch",
            "大問 " + blk.number + " の " + (ri + 1) + " 行目で列がそろっていません（"
            + span + " / " + (blk.columns || grid.columns) + "）", blk.sectionId));
        }
        if ((row.heightMm || 0) < minH) {
          out.push(issue("error", "cellTooShort",
            "大問 " + blk.number + " の " + (ri + 1) + " 行目が低すぎます", blk.sectionId));
        }
        (row.cells || []).forEach(function (c) {
          if (profile.grid.cellTypes.indexOf(c.type) < 0) {
            out.push(issue("error", "unknownCellType", "使えないセルの種類です: " + c.type, blk.sectionId));
          }
          /* 連続マスと記号欄は、書いてある widthMm が「1 マスぶん」。
             欄として細すぎるかどうかは、並べた総幅で見る。 */
          var totalW = c.widthMm == null ? null
            : (c.type === "box-sequence" || c.type === "small-box")
              ? c.widthMm * Math.max(1, c.cells || 1) : c.widthMm;
          /* 1 マス自体の下限（文字が入る大きさ）。連続マスは細くてよい。 */
          var perMin = c.type === "box-sequence" ? 5 : (c.minWidthMm || minW);
          if (c.widthMm != null && c.widthMm < perMin) {
            out.push(issue("error", "cellTooNarrow",
              "解答欄の 1 マスが細すぎます（" + c.widthMm + "mm）", c.questionId || blk.sectionId));
          }
          if (totalW != null && totalW < minW) {
            out.push(issue("error", "cellTooNarrow",
              "解答欄が細すぎます（" + Math.round(totalW * 10) / 10 + "mm）", c.questionId || blk.sectionId));
          }
          if (!ANSWER_CELLS[c.type]) return;
          count++;
          if (!c.questionId || !byId[c.questionId]) {
            out.push(issue("error", "unknownAnswerCell", "対応する設問の無い解答欄があります", c.questionId || ""));
            return;
          }
          if (seen[c.questionId]) {
            out.push(issue("error", "duplicateAnswerCell",
              "同じ設問の解答欄が 2 つあります: 問 " + byId[c.questionId].number, c.questionId));
          }
          seen[c.questionId] = true;
          if (c.answerBindingId !== byId[c.questionId].answerBindingId) {
            out.push(issue("error", "answerBindingMismatch", "解答欄の対応先が違います", c.questionId));
          }
          if (Number(c.points) !== Number(byId[c.questionId].points)) {
            out.push(issue("error", "pointsChanged", "解答欄の配点が変わっています", c.questionId));
          }
          /* 書ける面積があるか（Seed で狭くしすぎない） */
          var need = area[c.type];
          if (need) {
            var w = c.widthMm != null ? c.widthMm : 150;
            var got = w * (c.heightMm || 0) * (c.rows || 1);
            if (got < need) {
              out.push(issue("error", "writeAreaTooSmall",
                "記入できる面積が足りません（" + Math.round(got) + " / " + need + " mm²）", c.questionId));
            }
          }
        });
      });
    });

    if (count !== specQ.length) {
      out.push(issue("error", "answerCellCount",
        "解答欄の数が設問の数と合いません（設問 " + specQ.length + " / 欄 " + count + "）"));
    }
    specQ.forEach(function (q) {
      if (!seen[q.id]) out.push(issue("error", "missingAnswerCell", "問 " + q.number + " の解答欄がありません", q.id));
    });
    var specTotal = specQ.reduce(function (a, q) { return a + (Number(q.points) || 0); }, 0);
    if (grid.total && Number(grid.total.denominator) !== specTotal) {
      out.push(issue("error", "totalPointsMismatch",
        "解答用紙の満点 " + grid.total.denominator + " 点が、試験の合計 " + specTotal + " 点と合いません"));
    }
    return out;
  }

  function errorsOf(list) { return (list || []).filter(function (i) { return i.severity === "error"; }); }
  function warningsOf(list) { return (list || []).filter(function (i) { return i.severity === "warning"; }); }

  /* ══════════════════════════════════════════════════════════════════
     自動レイアウト推奨（仕様 §42）

     やること
       ・問題の構成（形式の内訳・問題数・図表の数・設問文の長さ）を数えて、
         向いていそうな紙面を **候補として** 並べる。
     やらないこと
       ・自動で紙面を決めること（選ぶのは利用者。ここは何も書き換えない）
       ・推奨のために問題を作り直すこと（spec は読むだけ）
     ══════════════════════════════════════════════════════════════════ */

  /* 問題構成のまとめ。MockSpec でも、数だけの指定でも受け取れる。 */
  function summarizeComposition(input) {
    var out = { total: 0, typeCounts: {}, figureCount: 0, choiceQuestions: 0,
                longPromptCount: 0, avgPromptChars: 0, subject: "" };
    if (!input || typeof input !== "object") return out;

    /* 数だけを渡された場合（画面の内訳表など） */
    if (!input.sections && (input.typeCounts || input.questionCount)) {
      var tc = input.typeCounts || {};
      Object.keys(tc).forEach(function (k) {
        var n = Number(tc[k]) || 0;
        if (n > 0) { out.typeCounts[k] = n; out.total += n; }
      });
      if (!out.total) out.total = Math.max(0, Number(input.questionCount) || 0);
      out.figureCount = Math.max(0, Number(input.figureCount) || 0);
      out.longPromptCount = Math.max(0, Number(input.longPromptCount) || 0);
      out.avgPromptChars = Math.max(0, Number(input.avgPromptChars) || 0);
      out.subject = String(input.subject || "");
      return out;
    }

    var chars = 0;
    out.subject = String(input.subject || "");
    (input.sections || []).forEach(function (sec) {
      (sec.questions || []).forEach(function (q) {
        out.total++;
        out.typeCounts[q.type] = (out.typeCounts[q.type] || 0) + 1;
        out.figureCount += figureBlocksOf(q).length;
        if ((q.choices || []).length) out.choiceQuestions++;
        var len = String(q.prompt || "").length;
        chars += len;
        if (len >= 120) out.longPromptCount++;
        if ((q.sourceReferences || []).length) out.longPromptCount++;
      });
    });
    out.avgPromptChars = out.total ? Math.round(chars / out.total) : 0;
    return out;
  }

  function shareOf(c, types) {
    if (!c.total) return 0;
    var n = 0;
    types.forEach(function (t) { n += c.typeCounts[t] || 0; });
    return n / c.total;
  }
  function countOf(c, types) {
    var n = 0;
    types.forEach(function (t) { n += c.typeCounts[t] || 0; });
    return n;
  }

  /* 紙面の候補。score が同じなら LAYOUT_MODES の並び順で決まる（決定論）。 */
  function scoreLayouts(c) {
    var s = {};
    function add(profileId, points, reason) {
      var e = s[profileId] || (s[profileId] = { score: 0, reasons: [] });
      e.score += points;
      if (reason && e.reasons.indexOf(reason) < 0) e.reasons.push(reason);
    }

    /* いつでも成り立つ受け皿 */
    add("exam-standard-a4", 2, "どの教科・形式でも成り立つ標準の紙面です。");

    var shortish = shareOf(c, ["short_answer", "fill_blank"]);
    var choicey  = shareOf(c, ["multiple_choice_single", "multiple_choice_multiple", "true_false"]);
    var writey   = shareOf(c, ["long_answer", "essay", "source_analysis"]);
    var mathy    = shareOf(c, ["numeric", "formula"]);
    var english  = countOf(c, ["english_writing"]);
    var sourcey  = countOf(c, ["source_analysis"]);
    var subject  = String(c.subject || "");

    /* 一問一答が多い（英単語・漢字など） */
    if (shortish >= 0.5 && c.total >= 20 && (c.avgPromptChars === 0 || c.avgPromptChars <= 40)) {
      add("test-vocabulary-table", 6, "短い一問一答が多いので、問題と解答欄を表にそろえる紙面が向いています。");
      add("exam-two-column", 5, "1 問が短いので、2 段に流すと枚数を減らせます。");
      add("exam-compact-dense", 4, "問題数が多いので、余白と行間を詰めた紙面が向いています。");
    }
    /* 選択式が多い */
    if (choicey >= 0.6 && c.total >= 20) {
      add("exam-compact-dense", 4, "選択式が多く問題数もあるので、高密度の紙面が向いています。");
      add("exam-two-column", 3, "選択肢が短ければ 2 段に流せます。");
    }
    /* 記述が多い */
    if (writey >= 0.3) {
      add("worksheet-spacious", 3, "記述が多いので、設問どうしの空きが大きい紙面が向いています。");
      add("exam-standard-a4", 1, "記述と選択が混ざる試験は標準の紙面で組めます。");
    }
    /* 数学 */
    if (mathy >= 0.3 || subject.indexOf("数学") >= 0) {
      add("exam-math", 6, "数値・数式の設問が多いので、行間と設問間隔の広い数学の紙面が向いています。");
      add("worksheet-spacious", 3, "途中式を書かせるなら、余白の広いプリントでも組めます。");
    }
    /* 英語 */
    if (english >= 1 || subject.indexOf("英語") >= 0 || subject.toLowerCase().indexOf("english") >= 0) {
      add("exam-english", 6, "英語の設問があるので、行間を広く取った英語の紙面が向いています。");
    }
    /* 長文・資料 */
    if (sourcey >= 1 || c.longPromptCount >= 3 || c.avgPromptChars >= 120) {
      add("exam-entrance-mock", 5, "長い設問文があるので、大問ごとにページを変える入試・模試風が向いています。");
      add("exam-source-based", 5, "資料や長文を読ませるので、資料を大きく置く紙面が向いています。");
    }
    /* 図表 */
    if (c.figureCount >= 3) {
      add("school-science-figure-classic", 5, "図表が多いので、図表を本文と同じ枠に収める紙面が向いています。");
      add("exam-source-based", 2, "図表を大きく見せるなら資料読解の紙面も使えます。");
    }
    /* 分量 */
    if (c.total >= 40) {
      add("booklet-spread", 2, "問題数が多いので、冊子にすると配りやすくなります。");
      add("exam-compact-dense", 2, "1 枚に収めたいときは高密度の紙面が使えます。");
    }
    if (c.total > 0 && c.total <= 10 && writey >= 0.3) {
      add("worksheet-spacious", 2, "問題数が少なく記述中心なので、授業プリントの体裁が合います。");
      add("premium-minimal", 2, "問題数が少ないので、余白を大きく取っても収まります。");
    }
    return s;
  }

  function modeForProfile(list, profileId) {
    return list.filter(function (m) { return m.profileId === profileId; })[0] || null;
  }

  /* 解答用紙の候補。問題用紙と同じ考え方で、候補を出すだけ。 */
  function scoreAnswerSheets(c) {
    var s = {};
    function add(profileId, points, reason) {
      var e = s[profileId] || (s[profileId] = { score: 0, reasons: [] });
      e.score += points;
      if (reason && e.reasons.indexOf(reason) < 0) e.reasons.push(reason);
    }
    add("school-answer-grid-standard", 2, "どの形式でも受けられる標準の解答用紙です。");
    var writey  = shareOf(c, ["long_answer", "essay", "source_analysis"]);
    var mathy   = shareOf(c, ["numeric", "formula"]);
    var choicey = shareOf(c, ["multiple_choice_single", "multiple_choice_multiple", "true_false"]);
    var english = countOf(c, ["english_writing"]);
    var subject = String(c.subject || "");
    if (writey >= 0.3) add("school-answer-written", 6, "記述が多いので、行数と行の高さを増やした解答用紙が向いています。");
    if (mathy >= 0.3 || subject.indexOf("数学") >= 0)
      add("school-answer-math-work", 6, "途中式を書かせるので、計算欄のある解答用紙が向いています。");
    if (english >= 1 || subject.indexOf("英語") >= 0)
      add("school-answer-english", 6, "英語なので、連続マスと英作文欄のある解答用紙が向いています。");
    if (choicey >= 0.6) add("school-answer-mark", 5, "記号で答える設問が多いので、マーク中心の解答用紙が向いています。");
    if (c.total >= 30) add("school-answer-grid-dense", 4, "設問が多いので、高密度の解答用紙のほうが収まります。");
    return s;
  }

  function toCandidates(scores, modes, limit) {
    var order = {};
    modes.forEach(function (m, i) { if (m.profileId) order[m.profileId] = i; });
    return Object.keys(scores)
      .filter(function (id) { return PROFILES[id] && modeForProfile(modes, id); })
      .sort(function (a, b) {
        var d = scores[b].score - scores[a].score;
        return d !== 0 ? d : (order[a] - order[b]);   /* 同点なら一覧の並び順（決定論） */
      })
      .slice(0, limit)
      .map(function (id) {
        var mode = modeForProfile(modes, id);
        var prof = PROFILES[id];
        var caveats = [];
        if (!mode.ready) {
          var pend = ((prof.rendererSupport || {}).current || {}).pending || [];
          caveats.push("この紙面はまだ組めません（" + (pend.join("・") || "準備中")
                       + "）。選んでも現在の形式で出します。");
        }
        if (mode.printable === false) caveats.push("これは紙ではありません（画面受験の設定です）。");
        return {
          modeId: mode.id, profileId: id, name: prof.name,
          ready: !!mode.ready, printable: mode.printable !== false,
          score: scores[id].score, reasons: scores[id].reasons.slice(), caveats: caveats
        };
      });
  }

  function recommendLayouts(input, opts) {
    opts = opts || {};
    var limit = clampInt(opts.limit, 1, 12) || 4;
    var c = summarizeComposition(input);
    return {
      composition: c,
      candidates: toCandidates(scoreLayouts(c), LAYOUT_MODES, limit),
      answerCandidates: toCandidates(scoreAnswerSheets(c), ANSWER_SHEET_MODES, limit),
      /* ここは「おすすめ」まで。選ぶのは利用者で、問題は 1 問も作り直していない。 */
      note: "紙面の候補です。選ぶのは利用者です。ここでは何も変えていません。"
    };
  }

  /* ══════════════════════════════════════════════════════════════════
     公開
     ══════════════════════════════════════════════════════════════════ */
  VQ2.layoutProfiles = {
    OUTPUT_ENGINES: OUTPUT_ENGINES,
    LAYOUT_MODES: LAYOUT_MODES,
    ANSWER_SHEET_MODES: ANSWER_SHEET_MODES,
    /* 保存前の検証（domain/schema.js）が読む ID の一覧。ここが唯一の出どころ。 */
    LAYOUT_MODE_IDS: LAYOUT_MODE_IDS,
    ANSWER_SHEET_MODE_IDS: ANSWER_SHEET_MODE_IDS,
    PROFILES: PROFILES,
    PLAN_SCHEMA: PLAN_SCHEMA,
    FIGURE_TYPES: FIGURE_TYPES,
    ALL_QUESTION_TYPES: ALL_QUESTION_TYPES,
    CHOICE_COLUMNS: CHOICE_COLUMNS,
    ANSWER_PROFILE_FAMILY: ANSWER_PROFILE_FAMILY,

    /* 一覧（画面に出す並び・旧 ID の置き換え先） */
    visibleLayoutModes: visibleLayoutModes,
    migrateLayoutMode: migrateLayoutMode,

    /* 自動レイアウト推奨（§42）。候補を返すだけで、何も変えない。 */
    summarizeComposition: summarizeComposition,
    recommendLayouts: recommendLayouts,

    engineStatus: engineStatus,
    setEngineCapability: setEngineCapability,
    engineCapability: engineCapability,
    resolveEngine: resolveEngine,
    getProfile: getProfile,
    listProfiles: listProfiles,

    defaultLayoutSettings: defaultLayoutSettings,
    readLayoutSettings: readLayoutSettings,
    /* 画面の選択 → MockSpec.layout（純関数。画面にも DOM にも依存しない） */
    uiLayoutTouched: uiLayoutTouched,
    layoutFromUiSettings: layoutFromUiSettings,
    applyLayoutToSpec: applyLayoutToSpec,
    isEnabled: isEnabled,
    resolveLayoutProfileId: resolveLayoutProfileId,
    resolveAnswerProfileId: resolveAnswerProfileId,

    newSeed: newSeed,
    hashSeed: hashSeed,
    rng: rng,

    planLayout: planLayout,
    planAnswerSheet: planAnswerSheet,
    figureBlocksOf: figureBlocksOf,

    validatePlanSchema: validatePlanSchema,
    validateLayout: validateLayout,
    validateAnswerSheet: validateAnswerSheet,
    validateAnswerGrid: validateAnswerGrid,
    planAnswerGrid: planAnswerGrid,
    decideCell: decideCell,
    CELL_KINDS: CELL_KINDS,
    FIGURE_LAYOUT_NEEDS: FIGURE_LAYOUT_NEEDS,
    errorsOf: errorsOf,
    warningsOf: warningsOf
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
