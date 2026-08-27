/* ══════════════════════════════════════════════════════════════════════
   Quick Mock V2（§10〜§13, §19, §21, §29）
   ・設定 → 構成案の確認 → 試験生成 → 検証 → 編集 → 紙面 → 受験 の一本道。
   ・AI が最初から試験全体を無断で確定しない。構成案の確認を必ず挟む。
   ・MockSpec が唯一の正式データ。PDF も解答用紙も採点定義もここから作る。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var U = VQ2.ui, S = VQ2.schema, V = VQ2.validate, ST = VQ2.store,
      AI = VQ2.ai, MB = VQ2.mockBuilder, TPL = VQ2.templates,
      L = VQ2.layout, R = VQ2.pdfRenderer, INS = VQ2.inspector, SA = VQ2.scoreAllocator,
      LPF = VQ2.layoutProfiles, LG = VQ2.layoutGrammar, WS = VQ2.ws, ACT = VQ2.activity;
  var esc = U.esc, icon = U.icon, btn = U.button, field = U.field;
  /* chat.log の kind → タイムラインの種類と状態。
     open() の中に置くと、描画が var の代入より先に走って undefined になる
     （FIELD_JA と同じ罠。実際に「reading 'step'」で落ちた）。ここに置く。 */
  var LOG_KIND = {
    run: { kind: "thinking", status: "running" },
    step: { kind: "planning", status: "done" },
    done: { kind: "success", status: "done" },
    note: { kind: "info", status: "done" },
    warn: { kind: "warning", status: "warn" },
    error: { kind: "error", status: "error" }
  };
  var doc = root.document;

  var MAX_FIX_ROUNDS = { normal: 3, deep: 5 };

  /* 表示用の名前。open() の中に置くと、描画時点でまだ未代入になる（var の巻き上げ）。 */
  var TYPE_JA = {
    multiple_choice_single: "選択", multiple_choice_multiple: "複数選択", true_false: "正誤",
    short_answer: "短答", long_answer: "記述", fill_blank: "空欄補充", ordering: "並び替え",
    matching: "組み合わせ", numeric: "数値", formula: "数式", essay: "論述",
    english_writing: "英作文", source_analysis: "資料読解"
  };
  var DIFF_JA = { easy: "易しい", normal: "標準", hard: "難しい", mixed: "混在" };

  /* ══════════════════════════════════════════════════════════
     形式レジストリ（qtypes / capability）への窓口

     形式の名前も、日本語の読み取りも、紙に出せるかの判断も
     **レジストリが唯一の出どころ**（契約 §1）。ここに表を書き戻さないこと。
     上の TYPE_JA は、レジストリを読み込めない場面の控えとしてだけ残す。
     ══════════════════════════════════════════════════════════ */
  function reg() { try { return VQ2.qtypes || null; } catch (e) { return null; } }
  function defOf(id) {
    var Q = reg();
    if (!Q || !Q.get) return null;
    try { return Q.get(id); } catch (e) { return null; }
  }
  /* 画面に出す形式の名前。レジストリの短い名前を最優先にする。 */
  function typeJa(id) {
    var d = defOf(id);
    if (d) return d.shortName || d.name || String(id);
    return TYPE_JA[id] || DRAFT_TYPE_JA[id] || String(id == null ? "" : id);
  }
  /* 形式の並び順。レジストリの order（やさしい形式から難しい形式へ）に従う。
     知らない語（粗い 4 語など）は最後へ。同順位は ID で決める（毎回同じ並び）。 */
  function typeOrderOf(id) {
    var d = defOf(id);
    return d && typeof d.order === "number" ? d.order : 9999;
  }
  function sortTypes(list) {
    return (list || []).slice().sort(function (a, b) {
      return typeOrderOf(a) - typeOrderOf(b) || (a < b ? -1 : a > b ? 1 : 0);
    });
  }
  /* 試験（紙）で使える形式。capability が唯一の判定箇所（契約 §2）。
     capability がまだ読めない場面では、これまでの 5 形式へ落とす（0 件にしない）。 */
  var LEGACY_TYPE_KEYS = ["multiple_choice_single", "true_false", "short_answer", "long_answer", "source_analysis"];
  function mockTypeIds() {
    var ids = [];
    try {
      if (VQ2.capability && VQ2.capability.forAi) ids = VQ2.capability.forAi({ mock: true }) || [];
    } catch (e) { ids = []; }
    if (!ids.length) ids = LEGACY_TYPE_KEYS.slice();
    var seen = {}, out = [];
    ids.forEach(function (id) { if (!seen[id]) { seen[id] = 1; out.push(id); } });
    /* 既定でオンの形式が候補から消えると、画面からチェックが無くなって
       設定が読めなくなる。候補に無ければ足す（黙って消さない）。 */
    LEGACY_TYPE_KEYS.forEach(function (id) { if (!seen[id]) { seen[id] = 1; out.push(id); } });
    return out;
  }
  /* 分類ごとにまとめる。94 形式を素で並べても選べない。
     分類とその名前もレジストリが持っている（qtypes.CATEGORIES）。
     sel（settings.types）でオンになっている形式は、候補に無くても必ず出す
     （古い保存データの選択を画面から消さないため）。 */
  function typeGroups(sel) {
    var Q = reg();
    var ids = mockTypeIds();
    var seen = {};
    ids.forEach(function (id) { seen[id] = 1; });
    Object.keys(sel || {}).forEach(function (k) { if (sel[k] && !seen[k]) { seen[k] = 1; ids.push(k); } });

    var cats = (Q && Q.CATEGORIES) || [];
    var rank = {};
    cats.forEach(function (c, i) { rank[c.id] = i; });
    var byCat = {}, groups = [];
    sortTypes(ids).forEach(function (id) {
      var d = defOf(id);
      var cid = (d && d.category) || "other";
      var g = byCat[cid];
      if (!g) {
        var c = Q && Q.category ? Q.category(cid) : null;
        g = byCat[cid] = { id: cid, label: (c && c.label) || "その他", types: [] };
        groups.push(g);
      }
      g.types.push({ id: id, label: typeJa(id), on: !!(sel && sel[id]) });
    });
    groups.sort(function (a, b) {
      var ra = rank[a.id] === undefined ? 999 : rank[a.id];
      var rb = rank[b.id] === undefined ? 999 : rank[b.id];
      return ra - rb;
    });
    return groups;
  }

  /* はじめの画面に出す一言。open() の中に置くと最初の描画で未代入になる（var の巻き上げ）。 */
  var HERO_LINES = [
    "資料を入れれば、そのまま試験になります。",
    "先に「どの大問に何を出すか」を見せます。",
    "配点は満点にぴったり合わせます。",
    "問題用紙も解答用紙も、1 つの内容から作ります。",
    "作った試験は、その場で受けられます。",
    "資料が多くても、大問ごとに分けて作ります。",
    "足りない解説や出典は、あとから補えます。"
  ];

  /* 1 回の呼び出しで作らせる設問数の上限。
     まとめて作らせるほど出力が長くなり、資料が多い人ほど途中で切れて全部失う。 */
  var MAX_PER_CALL = 6;

  /* 総問題数を大問へ割り振る。基本は floor、余りは先頭から 1 問ずつ。
       9 問 / 3 大問 → [3,3,3]
      10 問 / 3 大問 → [4,3,3]
      11 問 / 4 大問 → [3,3,3,2]
     合計は必ず total と一致する（vqsectionplan.cjs で確認）。 */
  function spreadCounts(total, sections) {
    var n = Math.max(1, Math.floor(sections));
    var t = Math.max(0, Math.floor(total));
    var base = Math.floor(t / n), rem = t % n, out = [];
    for (var i = 0; i < n; i++) out.push(base + (i < rem ? 1 : 0));
    return out;
  }

  /* 出題形式の配分。**モデルに選ばせない。**
     指定が無いと全問が記述式に偏ることがある（実測: 9 問すべて short_answer / descriptive）。

     draft の type は Bridge 側の schema の enum に合わせる
     （multiple_choice / true_false / short_answer / descriptive）。 */
  var DRAFT_TYPES = ["multiple_choice", "true_false", "short_answer", "descriptive"];
  /* 指定が無いときの既定の比率。選択で入りやすく、記述で考えさせる並び。 */
  var DEFAULT_MIX = { multiple_choice: 4, true_false: 2, short_answer: 2, descriptive: 1 };
  var DRAFT_TYPE_JA = {
    multiple_choice: "選択（4択）", true_false: "正誤", short_answer: "短答", descriptive: "記述"
  };

  /* 粗い 4 語（Bridge の schema）への落とし先。契約 §3 の後方互換のためだけに使う。
     レジストリの legacyType が 4 語のどれかならそれを、無ければ engine から決める。
     **形式そのものをここで潰さない。** 潰していたのが mixFromSettings の不具合だった。 */
  var ENGINE_TO_DRAFT = {
    single_choice: "multiple_choice", multi_choice: "multiple_choice", image_choice: "multiple_choice",
    true_false: "true_false",
    free_text: "descriptive",
    text_input: "short_answer", numeric_input: "short_answer", fill_blank: "short_answer",
    table_fill: "short_answer", formula_input: "short_answer"
  };
  function draftTypeOf(id) {
    if (DRAFT_TYPES.indexOf(id) >= 0) return id;
    var d = defOf(id);
    if (!d) return "short_answer";
    if (d.legacyType && DRAFT_TYPES.indexOf(d.legacyType) >= 0) return d.legacyType;
    return ENGINE_TO_DRAFT[d.engine] || "short_answer";
  }

  /* 総問題数を形式ごとの個数へ割り振る。合計は必ず total と一致する。
     形式 ID は **mix に書かれているものをそのまま使う**（4 形式へ潰さない）。
     並びはレジストリの order（やさしい形式から）に従う。 */
  function spreadTypes(total, mix) {
    var m = {}, keys = [];
    Object.keys(mix || {}).forEach(function (t) {
      var w = Number(mix[t]);
      if (w > 0) m[t] = w;
    });
    keys = sortTypes(Object.keys(m));
    if (!keys.length) { m = DEFAULT_MIX; keys = DRAFT_TYPES.slice(); }
    /* 明示された個数の合計が total と一致するなら、その個数をそのまま使う。 */
    var sum = keys.reduce(function (a, t) { return a + m[t]; }, 0);
    var out = [];
    if (sum === total) {
      keys.forEach(function (t) { for (var i = 0; i < m[t]; i++) out.push(t); });
      return out;
    }
    /* 一致しないときは比率とみなして最大剰余で割る（合計は必ず total）。 */
    var raw = keys.map(function (t) { return total * m[t] / sum; });
    var got = raw.map(function (v) { return Math.floor(v); });
    var rest = total - got.reduce(function (a, b) { return a + b; }, 0);
    raw.map(function (v, i) { return { i: i, f: v - Math.floor(v) }; })
      .sort(function (a, b) { return b.f - a.f || a.i - b.i; })
      .slice(0, rest).forEach(function (x) { got[x.i]++; });
    keys.forEach(function (t, i) { for (var k = 0; k < got[i]; k++) out.push(t); });
    return out;
  }

  /* 1 大問が 1 回で作れる上限を超えたか。
     超えたぶんを黙って切り捨てると「30 問頼んで 24 問」になる（実測）。
     分割生成はまだ入れていないので、ここでは止めて理由を残す。 */
  function batchRequired(plan) {
    return (plan || []).filter(function (p) { return p.count > MAX_PER_CALL; });
  }

  /* ══════════════════════════════════════════════════════════
     Phase 13 §1  使う資料・使わない資料を **ID で**決める

     実測（2026-07-27）:「スラスラはいらないから、この日本史の中から」と
     書いたのに、除外したはずの「スラスラEnglish」が資料検索に残った。
     しかも検索クエリに「スラスラ」が入るため、**ファイル名の重み 2 倍**で
     順位が上がっていた。自然文だけを頼りにしてはいけない。
     ここでは自然文を「補助」として解析し、確実な一致のときだけ除外する。
     ══════════════════════════════════════════════════════════ */
  var EXCLUDE_PATTERNS = [
    /(.{1,40}?)\s*(?:は|も)?\s*(?:いらない|要らない|不要)/g,
    /(.{1,40}?)\s*(?:を)?\s*(?:除外|除く|のぞく)/g,
    /(.{1,40}?)\s*(?:は)?\s*(?:使わない|使用しない|使いません)/g,
    /(.{1,40}?)\s*以外(?:から|の|で)/g
  ];
  /* 指示文に出てくる語のうち、ファイル名照合に使わないもの */
  var EXCLUDE_STOP = /^(これ|それ|あれ|そこ|ここ|もの|方|の|、|。|\s)*$/;

  /* ファイル名の中核部分（拡張子・日付・連番を落とす） */
  function fileStem(name) {
    return String(name || "")
      .replace(/\.[a-z0-9]{1,5}$/i, "")
      .replace(/[（(][^）)]*[）)]/g, " ")
      .replace(/[_\-\s]+/g, " ")
      .trim().toLowerCase();
  }
  /* ファイル名を「消すべき語」へ割る。
     CJK の連なり（2 文字以上）と ASCII 語（3 文字以上）を別々に採る。
     「スラスラEnglish」→ ["スラスラ", "english"] */
  function nameTokens(name) {
    var s = fileStem(name);
    var out = [];
    (s.match(/[぀-ヿ㐀-䶿一-鿿ｦ-ﾟ]+/g) || []).forEach(function (w) { if (w.length >= 2) out.push(w); });
    (s.match(/[a-z0-9]+/g) || []).forEach(function (w) { if (w.length >= 3) out.push(w); });
    return out;
  }

  /* 語がファイル名に一致するか。完全一致 or 高信頼の部分一致だけを採る。
     2 文字以下の語では照合しない（「史」で日本史が消えるような事故を防ぐ）。 */
  function nameMatch(term, name) {
    var t = String(term || "").trim().toLowerCase().replace(/[「」『』"']/g, "");
    var s = fileStem(name);
    if (!t || t.length < 3 || !s) return 0;
    if (s === t) return 1;
    if (s.indexOf(t) >= 0) return 0.9;
    /* 語の側が長いとき（「スラスラEnglish の資料」等）は語にファイル名が含まれるか */
    if (t.indexOf(s) >= 0 && s.length >= 3) return 0.8;
    return 0;
  }

  /* 自然文から除外指定を読む。
     戻り値: { exclude:[{attachmentId, term, score}], ambiguous:[{term, candidates}] }
     曖昧なとき（複数ファイルに中途半端に当たる／どれにも当たらない）は
     **勝手に除外しない**。呼び側が確認や警告を出す。 */
  function parseExclusions(text, attachments) {
    var src = String(text || "");
    var atts = attachments || [];
    var exclude = [], ambiguous = [], seenTerm = {};
    EXCLUDE_PATTERNS.forEach(function (re) {
      re.lastIndex = 0;
      var m;
      while ((m = re.exec(src))) {
        var raw = String(m[1] || "").trim();
        /* 直前の句読点までを語とみなす（文の先頭から拾いすぎない） */
        var term = raw.split(/[。、,，\n]/).pop().trim();
        if (!term || EXCLUDE_STOP.test(term) || seenTerm[term]) continue;
        seenTerm[term] = true;
        var hits = atts.map(function (a) { return { a: a, score: nameMatch(term, a.name) }; })
          .filter(function (h) { return h.score >= 0.8; })
          .sort(function (x, y) { return y.score - x.score; });
        if (hits.length === 1) exclude.push({ attachmentId: hits[0].a.id, term: term, score: hits[0].score });
        else if (hits.length > 1) ambiguous.push({ term: term, candidates: hits.map(function (h) { return h.a.name; }) });
        /* 0 件＝ファイル名の話ではない（「解説はいらない」等）。何もしない。 */
      }
    });
    return { exclude: exclude, ambiguous: ambiguous };
  }

  /* ══════════════════════════════════════════════════════════
     Phase 13 §2  資料検索に使う語

     指示文全文をクエリにすると、満点・問題数・JSON・選択肢・正誤といった
     試験メタ語彙が BM25 を支配し、資料の「体裁」部分が上位 Evidence になる。
     ここで残すのは「何を出題するか」だけ。
     ══════════════════════════════════════════════════════════ */
  var QUERY_DROP = [
    /json[^\n]*/gi, /schema[^\n]*/gi,
    /【[^】]*】/g,
    /(大問数|設問数|問題数|ちょうど|問以下|問以上)/g,
    /\d+\s*(点|問|分|割|％|%)/g,
    /(満点|配点|得点|合計点)/g,
    /(選択肢|4\s*択|四択|2\s*つ|4\s*つ)/g,
    /(正誤問題|選択問題|記述問題|短答問題|記述式|多肢選択)/g,
    /(出題形式|問題形式|形式の内訳|難易度)/g,
    /(解説|正解|解答|出典|根拠にした資料の箇所)/g,
    /(前後に説明|見出し|コードフェンス|返してください|作ってください|してください)/g,
    /(試験時間|試験名|学年|対象|科目\s*:)/g,
    /(短く|長すぎ|上限|途中で切れ|作り直)/g,
    /(いらない|要らない|不要|除外|除く|使わない|使用しない|以外)/g
  ];

  /* 検索クエリを組み立てる。
     入るのは：利用者が指定した出題対象 / 教科・単元 / 当該大問の題名・テーマ /
     資料の主要キーワード。除外に使ったファイル名は **必ず**落とす。 */
  function buildRetrievalQuery(parts, excludedNames) {
    var raw = (parts || []).filter(Boolean).join(" ");
    var s = " " + String(raw) + " ";
    QUERY_DROP.forEach(function (re) { s = s.replace(re, " "); });
    /* 除外したファイル名（とその中核部分）はクエリから消す。
       残すと、除外したはずの資料がファイル名の重み 2 倍で上位に来る
       ＝「いらない」と書いたせいで、そのファイルが 1 位になる（実測）。
       ファイル名は「スラスラEnglish」のように CJK と ASCII が地続きなので、
       語の切れ目で分けず、**種類ごとの連なり**に割ってから消す。 */
    (excludedNames || []).forEach(function (n) {
      nameTokens(n).forEach(function (w) {
        s = s.split(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")).join(" ");
      });
    });
    return s.replace(/[|`*#>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 400);
  }

  /* ══════════════════════════════════════════════════════════
     資料の運び方（参照形式 ＝ 分割アップロード）

     これまで Quick Mock は、ページ画像を imageBase64 で要求 JSON へ直に載せていた。
     ・本体が要求に乗るので contentHash が付かず、**解析キャッシュが一度も効かない**
     ・JSON に載せられる量が上限になるので、ページ画像は 12 枚で頭打ち
     （どちらも実測。shell.js の TRANSPORT_SCAN_CAP のコメントに残っていた）

     Preset Engine には分割アップロード（uploader.js）が既にある。
     8MiB ずつ送り、要求には jobId と attachmentId だけを載せる。
     Quick Mock も同じ経路へ載せる。**新しく作るのではなく、あるものを呼ぶ。**
     ══════════════════════════════════════════════════════════ */
  /* 分割アップロードの口が使えるか。使えないなら従来どおり base64 で運ぶ
     （Bridge が居ない環境でも Quick Mock は動かないといけない）。 */
  function useUploadRoute(env) {
    env = env || {};
    return !!(env.upload && typeof env.upload.Session === "function" && env.localAI);
  }

  /* 送り終えた Task を、**要求へ載せる形**へ直す。
     入るのは「どこに置いたか」を指す ID と、この端末で取り出した文章だけ。
     本体（imageBase64・dataUrl・file）はここを通らない。 */
  function attachmentsFromUploads(tasks, prev) {
    /* 手で「使わない」にしたものを、送り直しのたびに戻さない。 */
    var was = {};
    (prev || []).forEach(function (a) {
      if (!a) return;
      if (a.attachmentId) was[a.attachmentId] = a;
      else if (a.id != null) was[a.id] = a;
    });
    var refs = [];
    (tasks || []).forEach(function (t) {
      if (!t || typeof t.ref !== "function") return;
      var r = t.ref();
      if (!r) return;                                  /* 送り終えていないものは載せない */
      if (t.extractedText) {
        r.extractedText = String(t.extractedText);
        r.extractedCharacterCount = r.extractedText.length;
      }
      if (t.pageCount) r.pageCount = t.pageCount;
      if (t.pages && t.pages.length) r.pages = t.pages.slice();
      if (t.parentAttachmentId) r.parentAttachmentId = t.parentAttachmentId;
      if (t.pageNumber) r.pageNumber = t.pageNumber;
      /* 「使う／使わない」の印は引き継ぐ（既定は使う）。 */
      var kept = was[r.attachmentId];
      r.included = kept ? kept.included !== false : t.included !== false;
      if (kept && kept.excludedReason) r.excludedReason = kept.excludedReason;
      refs.push(r);
    });
    /* アップロード由来でない添付（従来経路のもの）は残す。 */
    var keep = (prev || []).filter(function (a) { return a && !a.jobId; });
    return keep.concat(refs);
  }

  /* 要求へ載せる添付が参照形式になっているか。**確かめるためだけの関数。**
     「本体を載せない」は目で見て分かる形にしておかないと、また戻る。 */
  function isByReference(attachments) {
    var list = attachments || [];
    if (!list.length) return false;
    return list.every(function (a) {
      return !!(a && a.attachmentId && a.jobId)
        && !a.imageBase64 && !a.imageDataUrl && !a.dataUrl && !a.file;
    });
  }

  /* ══════════════════════════════════════════════════════════
     §44 資料の状態を画面へ出す

     サーバは資料のようすを 2 つの経路で送ってくる。
     どちらも activity イベントで、生の中身は onActivity の第 2 引数に入る。

       ・type "attachment.analysis"  … 資料 1 件ずつの読み取り結果
          analysis[] = AnalysisJob.describe()
          （totalPages / usablePages / byKind / pageKinds / documentKind /
            failedPages / outcome / summary）
       ・type "mock.report"          … 出題対象から外したページ
          report.excludedPages / excludeRestored / includeChromePages /
          pageKinds{ documentKind, totals } / thinEvidence

     **これまで画面はどちらも一度も受け取っていなかった**（実測 2026-08-05：
     ページごとの見立ても、外したページも、画面に 1 文字も出ていない）。
     ここでやるのは「届いた値を写す」だけ。無い値は作らない。
     ══════════════════════════════════════════════════════════ */
  /* ページの見立て。名札はサーバ（page-classify.mjs）の 3 つだけ。 */
  var PAGE_KIND_JA = { text: "本文", low_text: "字が少ない", empty: "空" };
  /* 本文と見立てなかった理由。サーバ（PAGE_KIND_WHY）と同じ言い方にそろえる。
     サーバは whyLabel も一緒に送ってくるので、ふだんはそちらを使う。
     ここは届かなかったときの控え（生の英字を画面に出さないため）。 */
  var PAGE_KIND_WHY_JA = {
    no_text_layer: "文字がありません",
    too_few_chars: "本文と呼べる量がありません",
    too_few_unique_chars: "使われている文字の種類が少なすぎます",
    not_analyzed: "まだ読み取っていません",
    analysis_failed: "読み取れませんでした",
    excluded_by_user: "使わないページとして外されました"
  };
  /* 資料全体の見立て（documentKindFromTotals の戻り値）。 */
  var DOC_KIND_JA = {
    text: "文字で書かれた資料", mixed: "文字と画像が混ざった資料",
    scanned: "スキャン画像の資料", unknown: "まだ分かりません"
  };
  /* 出題対象から外した理由。サーバの EXCLUDE_REASON_JA と同じ言い方にそろえる。 */
  var EXCLUDE_REASON_JA = {
    chrome_only: "体裁だけのページ（解答欄・記名欄など）",
    cover_page: "表紙のページ",
    toc_page: "目次のページ",
    notice_page: "注意事項のページ",
    front_matter_page: "本文の前に置かれたページ（表紙・目次・注意事項）",
    low_text_page: "本文と言える量が無いページ",
    empty_page: "文字が取れなかったページ"
  };
  /* 外したページを使い直すための合言葉。
     サーバの wantsChromePages() が実際に受け取れる言い回しをそのまま持つ。
     ここを勝手に言い換えると、画面のスイッチが**入るだけで効かなくなる**。 */
  var INCLUDE_EXCLUDED_PHRASE = "資料の体裁も対象にして";

  /* ── 資料の名前を画面に出す形にする（§52）────────────────────
     長いファイル名は、狭い画面で本当に困る。

     実測（2026-08-05・320px）:
       「2026年度_1学期_中間考査_理科_授業配布プリント_第3章_光合成と呼吸.pdf」を
       1 件付けただけで、左の欄が 737px に広がった。
       欄そのものは切り取られるので横スクロールにはならないが、
       中のボタン（幅 679px・文字は中央寄せ）の文字が画面の外へ出て
       **「構成案をつくる」の字が読めなくなる**。

     名前の欄には省略（…）の指定があるが、それは「入りきらなければ削る」
     という指定で、欄の広さを決める計算（max-content）は長いままになる。
     区切りの無い長い名前は、ここで実際に短くする。全部は title で残す。 */
  var NAME_MAX = 26;
  function displayName(name) {
    var s = String(name == null ? "" : name);
    if (s.length <= NAME_MAX) return s;
    var dot = s.lastIndexOf(".");
    var ext = (dot > 0 && s.length - dot <= 6) ? s.slice(dot) : "";
    var body = ext ? s.slice(0, dot) : s;
    var keep = NAME_MAX - ext.length - 1;          /* … のぶん 1 文字 */
    var head = Math.ceil(keep * 0.6), tail = keep - head;
    return body.slice(0, head) + "…" + (tail > 0 ? body.slice(-tail) : "") + ext;
  }

  function kindWhyJa(why, label) {
    if (label) return String(label);
    if (!why) return "";
    return PAGE_KIND_WHY_JA[why] || String(why);
  }

  /* activity イベント → 資料 1 件ずつの読み取り結果。
     知らない形（別の種類・欄が無い）なら null。作り足さない。 */
  function analysisFromActivity(ev) {
    if (!ev || ev.type !== "attachment.analysis" || !Array.isArray(ev.analysis)) return null;
    var files = ev.analysis.map(function (j) {
      j = j || {};
      var bk = j.byKind || {};
      return {
        attachmentId: j.attachmentId != null ? String(j.attachmentId) : null,
        name: String(j.name || "資料"),
        state: j.state || null,
        label: String(j.label || ""),
        outcome: j.outcome || null,
        summary: String(j.summary || ""),
        documentKind: j.documentKind || null,
        totalPages: Math.max(0, Number(j.totalPages) || 0),
        usablePages: Math.max(0, Number(j.usablePages) || 0),
        characterCount: Math.max(0, Number(j.characterCount) || 0),
        byKind: { text: Number(bk.text) || 0, low_text: Number(bk.low_text) || 0,
                  empty: Number(bk.empty) || 0 },
        pages: (Array.isArray(j.pageKinds) ? j.pageKinds : []).map(function (p) {
          p = p || {};
          return { pageNumber: Number(p.pageNumber) || 0,
                   pageKind: p.pageKind || "empty",
                   kindJa: PAGE_KIND_JA[p.pageKind] || String(p.pageKind || "空"),
                   why: p.why || null,
                   whyJa: kindWhyJa(p.why, p.whyLabel) };
        }),
        failedPages: (Array.isArray(j.failedPages) ? j.failedPages : []).slice(0, 50),
        lowConfidencePages: (Array.isArray(j.lowConfidencePages) ? j.lowConfidencePages : []).slice(0, 50)
      };
    });
    return { at: Date.now(), current: Number(ev.current) || 0,
             total: Number(ev.total) || 0, files: files };
  }

  /* activity イベント → 出題対象から外したページ。 */
  function pageReportFromActivity(ev) {
    if (!ev || ev.type !== "mock.report" || !ev.report || typeof ev.report !== "object") return null;
    var r = ev.report;
    var pk = (r.pageKinds && typeof r.pageKinds === "object") ? r.pageKinds : null;
    return {
      at: Date.now(),
      documentKind: pk ? (pk.documentKind || null) : null,
      totals: (pk && pk.totals) ? pk.totals : null,
      /* 外したページを使い直す指定が、この回で実際に効いていたか。 */
      includeChromePages: r.includeChromePages === true,
      /* 全ページが外れてしまったので、外さずに戻したとき。 */
      excludeRestored: r.excludeRestored === true,
      excludedPages: (Array.isArray(r.excludedPages) ? r.excludedPages : []).map(function (p) {
        p = p || {};
        return {
          page: p.page == null ? null : Number(p.page),
          fileName: p.fileName || null,
          reason: p.reason || null,
          /* 理由は必ず日本語にする。届かなかったときも黙らない。 */
          reasonJa: EXCLUDE_REASON_JA[p.reason] || (p.reason ? String(p.reason) : "理由が届いていません"),
          pageState: p.pageState || null
        };
      }),
      /* 字数が足りずに使えなかった箇所（外したページとは別の理由）。 */
      thinEvidence: (Array.isArray(r.thinEvidence) ? r.thinEvidence : []).slice(0, 20)
    };
  }

  /* 画面に並べる資料 1 件ぶんの状態。
     ・件数と見立てはサーバの解析結果を優先する（この端末の数え方は目安）
     ・解析が来ていないものは analyzed:false。「0 ページ」と言い切らない */
  function sourceStateRows(attachments, analysis) {
    var byId = {}, byName = {};
    ((analysis && analysis.files) || []).forEach(function (f) {
      if (f.attachmentId) byId[f.attachmentId] = f;
      if (f.name) byName[f.name] = f;
    });
    return (attachments || []).filter(function (a) { return a && !a.parentAttachmentId; })
      .map(function (a) {
        var aid = a.attachmentId != null ? String(a.attachmentId) : null;
        var f = (aid && byId[aid]) || byName[a.name] || null;
        return {
          id: String(a.id != null ? a.id : (aid || a.name || "")),
          name: String(a.name || "資料"),
          included: a.included !== false,
          analyzed: !!f,
          totalPages: f ? f.totalPages : Math.max(0, Number(a.pageCount) || 0),
          usablePages: f ? f.usablePages : 0,
          byKind: f ? f.byKind : null,
          pages: f ? f.pages : [],
          documentKind: f ? f.documentKind : null,
          documentKindJa: (f && f.documentKind) ? (DOC_KIND_JA[f.documentKind] || f.documentKind) : "",
          outcome: f ? f.outcome : null,
          summary: f ? f.summary : "",
          failedPages: f ? f.failedPages : [],
          /* この端末で文字も画像も取れなかったページ（添付した時点で分かるぶん）。 */
          unreadablePages: Math.max(0, Number(a.unreadablePages) || 0)
        };
      });
  }

  /* 外したページを、資料ごとにまとめて画面へ出す形にする。 */
  function excludedPageRows(report) {
    var list = (report && report.excludedPages) || [];
    var byFile = {}, order = [];
    list.forEach(function (p) {
      var k = p.fileName || "資料";
      if (!byFile[k]) { byFile[k] = { fileName: k, pages: [], reasons: [] }; order.push(k); }
      byFile[k].pages.push({ page: p.page, reasonJa: p.reasonJa });
      if (byFile[k].reasons.indexOf(p.reasonJa) < 0) byFile[k].reasons.push(p.reasonJa);
    });
    return order.map(function (k) { return byFile[k]; });
  }

  /* ── §17 外したページを使い直す ────────────────────────────
     「明示的に指定した場合だけ利用可能」。既定は使わない。
     指定したときだけ、サーバが受け取れる言い回しを依頼文へ足す。
     ここで足さないと、画面のスイッチは入るのに紙面は何も変わらない
     （＝動くふり）。逆の意味に読まれる語（外して・含めない…）は書かない。 */
  function includePhraseFor(settings) {
    return (settings && settings.includeExcludedPages === true) ? INCLUDE_EXCLUDED_PHRASE : "";
  }
  function withSourcePolicy(prompt, settings) {
    var base = String(prompt == null ? "" : prompt);
    var ph = includePhraseFor(settings);
    if (!ph) return base;
    return base + "\n\n【資料のあつかい】" + ph + "ください。"
      + "すべてのページを出題の候補にしてください。";
  }

  /* ══════════════════════════════════════════════════════════
     §40 紙面デザインの一覧

     「12 個そろっている」ことにしない。**実際に組めるものだけ**を
     使えると言う。ready:false は選べるが、選んでも紙は変わらない
     （resolveLayoutProfileId が null を返す）。そう書く。
     ══════════════════════════════════════════════════════════ */
  /* 紙面の説明。**プロファイルに実在する値からしか作らない。**
     宣伝文句を書き足すと、実物と食い違ったときに気づけない。 */
  function layoutDescription(prof) {
    if (!prof) return "";
    var p = prof.paper || {}, t = prof.typography || {}, q = prof.questionFlow || {};
    var bits = [];
    if (p.size) {
      bits.push(p.size + (p.orientation === "landscape" ? " 横置き" : " 縦置き")
        + (p.writingDirection === "vertical" ? "・縦書き" : ""));
    }
    if (t.basePt) bits.push("本文 " + t.basePt + "pt");
    if (t.lineHeight) bits.push("行間 " + t.lineHeight);
    if (q.columns) bits.push(q.columns + " 段組み");
    if (p.spread) bits.push("見開き");
    return bits.join(" ／ ");
  }

  /* 1 つぶんの状態。**「使えます」と言ってよいのは紙が実際に変わるときだけ。** */
  function layoutStatusOf(mode, usable) {
    if (!mode) return { tone: "info", badge: "不明", note: "" };
    if (mode.id === "current")
      return { tone: "info", badge: "いまの紙面",
               note: "いま出している紙面のままです。何も変わりません。" };
    if (mode.id === "auto")
      return { tone: usable ? "success" : "warning",
               badge: usable ? "おすすめから選ぶ" : "準備中",
               note: usable
                 ? "いま組める紙面の中から、こちらで 1 つ選びます。下の「おすすめ」で中身を確かめられます。"
                 : "選べる紙面がまだありません。" };
    if (mode.printable === false)
      return { tone: "warning", badge: "紙ではありません",
               note: mode.note || "画面で解くための設定です。印刷はしません。" };
    if (!mode.ready || !usable)
      return { tone: "warning", badge: "準備中",
               note: (mode.note || "この紙面を組む処理がまだありません。")
                 + "選んでも、いまの紙面のまま出します。" };
    return { tone: "success", badge: "使えます", note: "" };
  }

  /* 画面に並べる紙面デザインの一覧。
     LAYOUT_MODES（唯一の出所）から作る。ここで新しい名前を作らない。 */
  function layoutCatalog() {
    var LP = VQ2.layoutProfiles;
    if (!LP || typeof LP.visibleLayoutModes !== "function") return [];
    return LP.visibleLayoutModes().map(function (m) {
      var prof = m.profileId ? LP.getProfile(m.profileId) : null;
      /* 「選んだら紙が変わるか」は resolveLayoutProfileId が唯一の判定。
         ここで別の線引きを作らない（作ると一覧と紙面がずれる）。 */
      var usable = !!LP.resolveLayoutProfileId(m.id, null);
      var st = layoutStatusOf(m, usable);
      var pend = prof && prof.rendererSupport && prof.rendererSupport.current
        ? (prof.rendererSupport.current.pending || []) : [];
      var unsupported = (prof && prof.unsupportedQuestionTypes) || {};
      return {
        id: m.id,
        label: m.label,
        profileId: m.profileId || null,
        /* ready は一覧の宣言。usable は実際に紙が変わるか。両方持つ。 */
        ready: !!m.ready,
        usable: usable,
        printable: m.printable !== false,
        name: prof ? prof.name : m.label,
        description: layoutDescription(prof),
        /* 推奨用途・対応形式は、プロファイルに実在する欄だけを写す。 */
        subjects: (prof && prof.supportedSubjects) ? prof.supportedSubjects.slice() : [],
        questionTypes: (prof && prof.supportedQuestionTypes) ? prof.supportedQuestionTypes.slice() : [],
        unsupported: Object.keys(unsupported).map(function (k) {
          return { type: k, why: String(unsupported[k]) };
        }),
        pending: pend.slice(),
        tone: st.tone, badge: st.badge, note: st.note
      };
    });
  }

  /* §42 自動推奨。**候補を出すだけ。ここでは何も選ばない。** */
  function layoutRecommendations(spec, limit) {
    var LP = VQ2.layoutProfiles;
    if (!LP || typeof LP.recommendLayouts !== "function" || !spec) return [];
    try {
      var r = LP.recommendLayouts(spec, { limit: Math.max(1, Number(limit) || 3) });
      return (r && r.candidates) ? r.candidates : [];
    } catch (e) { return []; }
  }

  /* 紙面デザインを選び直したときに何をするか。**AI は絶対に含まれない。**
     問題を作り直す道はここに 1 本も無い（作ってはいけない）。
     wire() はこの戻り値のとおりにだけ動く。 */
  function layoutChangeActions(key, value, o) {
    o = o || {};
    return {
      /* spec.layout を書き換える（問題文・正解・配点・番号にはさわらない） */
      applyLayoutToSpec: true,
      /* 紙面だけ組み直す。成果物を出している最中のときだけ意味がある。 */
      rebuildPaper: o.step === "artifacts",
      /* 出力エンジンを選んだときだけ、この端末で使えるかを確かめに行く */
      probeEngine: (key === "outputEngine" && (value === "typst" || value === "tex")) ? value : null,
      /* **AI 生成は走らない。** ここが true になることは無い。 */
      regenerate: false
    };
  }

  /* ══════════════════════════════════════════════════════════
     進みぐあい（§27）

     「0 / N・残りを計算しています」のまま終わるのをやめる。
     数はすでに mock-compile-run の onProgress が渡してくれている
     （filled ＝ いま埋まった実数 / total ＝ 総枠数）。**作らずに繋ぐ。**
     ══════════════════════════════════════════════════════════ */
  /* AI へ実際に投げる依頼の数。大問ごとに ceil(問題数 / 1 回の数) を足したもの。
     ceil(総問題数 / 3) ではない（5 大問 1 問ずつなら 5 回であって 2 回ではない）。 */
  function plannedRequestCount(MC, p, batchSize) {
    if (!MC || typeof MC.requestsOf !== "function" || !p) return 0;
    var b = Number(batchSize) || MC.DEFAULT_BATCH;
    try { return MC.requestsOf(p, { batchSize: b }).length; } catch (e) { return 0; }
  }

  /* この回で埋まった枠の問番号。**確かなときだけ返す。**
     大問の枠は前から順に埋まるので、1 巡目（まだ埋め直していない）なら
     「すでに出来ていた数」の次から accepted 個ぶんが、この回に出来たもの。
     埋め直しの巡は順番が飛ぶので、そのときは null を返して番号を言わない
     （分からない番号を、それらしく書かない）。 */
  function slotNumbersFor(section, madeBefore, accepted, certain) {
    if (!section || certain === false) return null;
    var qs = section.questions || [];
    var from = Math.max(0, Number(madeBefore) || 0);
    var n = Math.max(0, Number(accepted) || 0);
    if (!n || from + n > qs.length) return null;
    return qs.slice(from, from + n).map(function (q) { return q.number; });
  }

  /* 1 依頼ぶんが終わったときにやること。
     ・ETA へ「終わり」と「次の始まり」を対で入れる（etaRound だけでは進まない）
     ・大問ごとの出来高を足す
     ・画面へ出す一行を返す
     画面を開かずに確かめられるよう、chat と状態を受け取る形にしてある
     （ここでは描き直さない）。prog: { done, total, runs, sections, refilling } */
  function applyProgress(chat, prog, pr) {
    prog.done = (Number(prog.done) || 0) + 1;
    var run = (prog.runs || [])[pr.sectionNumber - 1] || null;
    var before = run ? (Number(run.made) || 0) : 0;
    var sec = (prog.sections || [])[pr.sectionNumber - 1] || null;
    var nums = slotNumbersFor(sec, before, pr.accepted, !prog.refilling);
    if (run) run.made = before + (Number(pr.accepted) || 0);
    if (chat && typeof chat.etaStep === "function") {
      chat.etaStep({
        done: prog.done, total: prog.total,
        /* 見せるのは回数ではなく **実際に完成した問題数**。 */
        made: pr.filled, madeTotal: pr.total,
        label: "問題を作っています（" + pr.filled + " / " + pr.total + "問）"
      });
    }
    return progressLine(pr, nums);
  }

  /* 進みぐあいの一行。**実際に出来た数しか言わない。** */
  function progressLine(pr, numbers) {
    var made = Math.max(0, Number(pr && pr.accepted) || 0);
    var filled = Math.max(0, Number(pr && pr.filled) || 0);
    var total = Math.max(0, Number(pr && pr.total) || 0);
    var tail = "（現在 " + filled + " / " + total + "問）";
    var head = "大問" + (pr && pr.sectionNumber);
    if (!made) return head + " はこの回 1 問も入りませんでした" + tail;
    var range = "";
    if (numbers && numbers.length === made) {
      range = numbers.length === 1
        ? " の 第" + numbers[0] + "問"
        : " の 第" + numbers[0] + "問〜第" + numbers[numbers.length - 1] + "問";
    }
    return range
      ? head + range + " を生成しました" + tail
      : head + " に " + made + " 問入りました" + tail;
  }

  /* ══════════════════════════════════════════════════════════
     Phase 13 §7  自由記述の出題形式指定を決定的に読む

     「正誤問題が全体の8割になるようにしてね」が無視されていた。
     形式の配分は UI のチェックだけを見ていたため、自由記述の指定は
     Schema で type を固定する時点で構造的に無効化されていた。
     ══════════════════════════════════════════════════════════ */
  /* ── 2026-08-05 の作り直し ────────────────────────────────
     ここには「正誤・選択・記述・短答」の 4 つぶんの正規表現しか無かった。
     そのため「空欄補充を4問」「英文並び替えを5問」は**読めないまま**で、
     Preset Engine が使っている 133 形式の資産と分断されていた。

     日本語 → 形式 ID の対応は **qtypes.js が唯一の出どころ**（契約 §1）。
     個数の読み取りは blueprint.extractRequirements と同じ実装を使う（契約 §5）。
     表をここへ書き戻さないこと。 */
  var JP_NUM = { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10 };
  function numOf(s) {
    var t = String(s || "").trim();
    if (/^\d+$/.test(t)) return parseInt(t, 10);
    if (JP_NUM[t]) return JP_NUM[t];
    return null;
  }
  /* 呼び名の直後にある割合。「正誤問題が全体の8割」「正誤を80%」 */
  var RATIO_TAIL_RE = /^(?:問題|形式|式)?\s*(?:を|が|は)?\s*(?:全体の)?\s*([0-9一二三四五六七八九十]+)\s*(割|％|%|パーセント)/;
  /* 呼び名の直前にある「全問」。「全問正誤問題で」「すべて記述式」 */
  var ALL_HEAD_RE = /(?:全問|すべて|全て|ぜんぶ)\s*$/;

  /* 呼び名の直後にある個数。「正誤問題を8問」 */
  var COUNT_TAIL_RE = /^(?:問題|形式|式)?\s*(?:を|が|は)?\s*([0-9一二三四五六七八九十]+)\s*問/;

  /* ── レジストリが読み込まれていないときの控え ─────────────────
     **これは最後の手段。** 粗い 4 語しか読めない。
     本番（build-v2 の並び）では qtypes.js が必ず先に読み込まれるので通らない。
     quick-mock.js だけを単体で読み込む場面（local-ai/tests/phase13.test.mjs）が
     残っているため消せない。ここへ形式を足さないこと。足すなら qtypes.js。 */
  var FALLBACK_WORDS = [
    { type: "true_false",      re: "正誤|◯×|○×|マルバツ|true\\s*/?\\s*false" },
    { type: "multiple_choice", re: "多肢選択|択一|\\d\\s*択|選択" },
    { type: "descriptive",     re: "論述|作文|記述" },
    { type: "short_answer",    re: "短答|穴埋め|空欄補充|一問一答" }
  ];
  function mentionsFallback(src) {
    var taken = new Array(src.length), out = [];
    FALLBACK_WORDS.forEach(function (w) {
      var re = new RegExp(w.re, "g"), m;
      while ((m = re.exec(src))) {
        var from = m.index, to = m.index + m[0].length, busy = false, i;
        for (i = from; i < to; i++) if (taken[i]) { busy = true; break; }
        if (busy) continue;
        for (i = from; i < to; i++) taken[i] = true;
        out.push({ type: w.type, word: m[0], index: from, end: to });
      }
    });
    return out.sort(function (a, b) { return a.index - b.index; });
  }
  /* 指示文のどこに、どの形式の呼び名が出たか。qtypes があればそちらが正。 */
  function mentionsOf(text) {
    var Q = reg();
    if (Q && Q.mentionsOf) { try { return Q.mentionsOf(text) || []; } catch (e) {} }
    return mentionsFallback(String(text || ""));
  }

  /* 形式ごとの個数（契約 §5）。blueprint があればそちらへ委ねる
     （「〜は使わないで」の打ち消しまで面倒を見てくれる）。 */
  function typeCountsOf(text, mentions) {
    try {
      if (VQ2.blueprint && VQ2.blueprint.extractRequirements) {
        var req = VQ2.blueprint.extractRequirements(text, { mode: "mock" });
        if (req && Array.isArray(req.typeDistribution)) return req.typeDistribution.slice();
      }
    } catch (e) {}
    var Q = reg();
    if (Q && Q.countsFromJapanese) {
      try { return Q.countsFromJapanese(text) || []; } catch (e) {}
    }
    /* 控え。呼び名の直後の「〜を N 問」だけを読む。 */
    var out = [], at = {};
    (mentions || []).forEach(function (m) {
      var mm = COUNT_TAIL_RE.exec(String(text || "").slice(m.end));
      if (!mm) return;
      var n = numOf(mm[1]);
      if (!(n > 0) || n > 500) return;
      if (at[m.type] !== undefined) { out[at[m.type]].count += n; return; }
      at[m.type] = out.length;
      out.push({ type: m.type, count: n });
    });
    return out;
  }

  /* 戻り値:
       counts           {形式ID: 問数}     「正誤を8問」
       ratios           {形式ID: 0〜1}     「正誤が全体の8割」
       all              形式ID | null      「全問記述式」
       typeDistribution [{type,count}]     契約 §5 の形（blueprint と同じ並び）
       notes            人へ見せる説明     黙って解釈しない */
  function parseTypeRequest(text) {
    var src = String(text || "");
    var counts = {}, ratios = {}, all = null, notes = [], dist = [];
    var Q = reg();
    if (!src) return { counts: counts, ratios: ratios, all: all, typeDistribution: dist, notes: notes };
    var mentions = mentionsOf(src);

    dist = typeCountsOf(src, mentions);
    dist.forEach(function (e) {
      if (!e || !e.type || !(e.count > 0)) return;
      counts[e.type] = e.count;
      notes.push(typeJa(e.type) + " " + e.count + " 問");
    });

    var denied = [];
    try { denied = (Q && Q.deniedFromJapanese) ? Q.deniedFromJapanese(src) : []; } catch (e) {}
    mentions.forEach(function (m) {
      if (denied.indexOf(m.type) >= 0) return;          /* 「使わないで」は要求ではない */
      var tail = src.slice(m.end);
      var head = src.slice(Math.max(0, m.index - 4), m.index);
      if (counts[m.type] == null && ratios[m.type] == null) {
        var mr = RATIO_TAIL_RE.exec(tail);
        if (mr) {
          var v = numOf(mr[1]);
          if (v != null) {
            var r = mr[2] === "割" ? v / 10 : v / 100;
            if (r > 0 && r <= 1) {
              ratios[m.type] = r;
              notes.push(typeJa(m.type) + " " + Math.round(r * 100) + "%");
            }
          }
        }
      }
      if (!all && ALL_HEAD_RE.test(head)) { all = m.type; notes.push("全問 " + typeJa(m.type)); }
    });
    return { counts: counts, ratios: ratios, all: all, typeDistribution: dist, notes: notes };
  }

  /* 自由記述の指定を、実際の問題数へ落とす。
     優先順位（仕様 §7）:
       1 システム安全制限 → 2 明示的な UI 設定 → 3 自由記述の具体的な比率・問数
       → 4 自由記述の曖昧な希望 → 5 Blueprint 提案
     uiMix は「UI で選ばれている形式」。自由記述で決まらなかったぶんは
     ここへ決定的に配る。 */
  function resolveTypeMix(total, uiMix, req) {
    var n = Math.max(0, Math.floor(total) || 0);
    var out = {}, source = {}, fixed = 0;
    /* 形式の語彙は **uiMix が決める**。
       画面（settings.types）から来れば正式 ID、古い呼び出し元から来れば粗い 4 語。
       どちらでも同じ語で返す（呼び出し側の語を勝手に取り替えない）。 */
    var uiTypes = sortTypes(Object.keys(uiMix || {}).filter(function (t) { return uiMix[t] > 0; }));
    var coarse = !uiTypes.length || uiTypes.every(function (t) { return DRAFT_TYPES.indexOf(t) >= 0; });
    if (!uiTypes.length) uiTypes = DRAFT_TYPES.slice();
    /* 指示文は正式 ID で返る。相手が粗い 4 語で話しているなら、そこへ落として揃える。 */
    function into(t) { return coarse ? draftTypeOf(t) : t; }
    /* 指示文が名指しした形式（正式 ID）。語彙を揃えたうえで重複をまとめる。 */
    function wanted() {
      var order = [], want = {};
      function add(t, v) {
        var k = into(t);
        if (want[k] == null) { want[k] = v; order.push(k); } else want[k] += v;
      }
      Object.keys((req && req.counts) || {}).forEach(function (t) { add(t, req.counts[t]); });
      Object.keys((req && req.ratios) || {}).forEach(function (t) {
        if (req.counts && req.counts[t] != null) return;
        add(t, Math.round(n * req.ratios[t]));
      });
      return { order: sortTypes(order), want: want };
    }

    if (req && req.all) {
      var one = into(req.all);
      out[one] = n;
      return { mix: out, source: { all: "free_text" }, notes: ["全問 " + typeJa(req.all)], conflicts: [] };
    }
    /* 3) 自由記述の具体指定を先に確定させる */
    var w = wanted();
    w.order.forEach(function (t) {
      var want = Math.max(0, Math.min(n - fixed, w.want[t]));
      out[t] = want; source[t] = "free_text"; fixed += want;
    });
    /* 残りを UI で選ばれている形式へ均等に配る（決定的・順序固定） */
    var rest = n - fixed;
    var pool = uiTypes.filter(function (t) { return out[t] == null; });
    /* 画面で選ばれた形式が全部埋まったときの逃げ先。
       粗い 4 語で話している相手にだけ 4 語を混ぜる（正式 ID の配分へ 4 語を紛れ込ませない）。 */
    if (!pool.length) pool = (coarse ? DRAFT_TYPES : uiTypes).filter(function (t) { return out[t] == null; });
    if (rest > 0 && pool.length) {
      var base = Math.floor(rest / pool.length), rem = rest % pool.length;
      pool.forEach(function (t, i) { out[t] = base + (i < rem ? 1 : 0); source[t] = "ui"; });
    } else if (rest > 0) {
      /* 配る先が無い＝自由記述だけで全部埋まっている。最後の形式へ足す。 */
      var last = Object.keys(out).pop();
      out[last] += rest;
    }
    Object.keys(out).forEach(function (t) { if (!out[t]) delete out[t]; });

    /* UI で明示的に外している形式を自由記述が要求した場合は、黙って解決しない */
    var conflicts = [];
    Object.keys(source).forEach(function (t) {
      if (source[t] === "free_text" && uiMix && !uiMix[t] && out[t] > 0)
        conflicts.push(typeJa(t) + "：画面では選んでいませんが、指示文の指定（" + out[t] + " 問）を採用しました");
    });
    return { mix: out, source: source, notes: (req && req.notes) || [], conflicts: conflicts };
  }

  /* ══════════════════════════════════════════════════════════
     指示文の「形式ごとの個数」を、試験の枠（ExamPlan）へ反映する（契約 §5）

     mock-compiler.plan() は、選ばれている形式を順ぐりに割り当てるだけで、
     「空欄補充を4問、正誤を4問」の**個数**は見ていない。
     ここで枠の形式だけを書き換える。
     **問題文・正解・選択肢・配点・番号・ID にはさわらない**（作り直さない）。

     ・指定の合計が総数を超えるぶんは守れないので、理由を残して切る。
     ・指定に無い枠は、画面で選ばれている形式のうち指定外のものへ回す。
     ══════════════════════════════════════════════════════════ */
  /* 記述系の目安字数は mock-compiler.expectedCharsFor と同じ決め方にそろえる
     （あちらは外へ出していないので、同じ式をここに置く）。 */
  function expectedCharsFor(type, points) {
    var base = { long_answer: 120, essay: 400, english_writing: 100, source_analysis: 150 }[type] || 120;
    var k = Math.max(0.5, Math.min(3, (Number(points) || 0) / 5));
    return Math.max(40, Math.round(base * k));
  }
  function applyTypeDistribution(plan, dist, uiTypes) {
    var out = { changed: 0, applied: [], notes: [] };
    var slots = [];
    ((plan && plan.sections) || []).forEach(function (sec) {
      (sec.questions || []).forEach(function (q) { slots.push(q); });
    });
    var list = (dist || []).filter(function (e) { return e && e.type && e.count > 0; });
    if (!slots.length || !list.length) return out;

    var WRITTEN = (VQ2.mockCompiler && VQ2.mockCompiler.WRITTEN) || {};
    function setType(q, t) {
      if (q.type === t) return;
      q.type = t;
      q.expectedChars = WRITTEN[t] ? expectedCharsFor(t, q.points) : null;
      out.changed++;
    }

    var need = {}, order = [], room = slots.length;
    list.forEach(function (e) {
      var n = Math.max(0, Math.min(room, Math.floor(e.count)));
      if (n < e.count) {
        out.notes.push(typeJa(e.type) + " " + e.count + " 問のうち " + n + " 問しか入りません"
          + "（全 " + slots.length + " 問の枠を超えます）。");
      }
      if (!n) return;
      if (need[e.type] == null) { need[e.type] = n; order.push(e.type); }
      else need[e.type] += n;
      room -= n;
    });
    if (!order.length) return out;

    /* すでに指定どおりの形式になっている枠は、そのまま使う（動かさない）。 */
    var remain = {}, free = [];
    order.forEach(function (t) { remain[t] = need[t]; });
    slots.forEach(function (q) {
      if (remain[q.type] > 0) { remain[q.type]--; return; }
      free.push(q);
    });
    /* 足りないぶんを、空いている枠へ前から順に入れる。 */
    var fi = 0;
    order.forEach(function (t) {
      while (remain[t] > 0 && fi < free.length) { setType(free[fi++], t); remain[t]--; }
    });
    /* 指定数を超えて残っている同じ形式の枠は、指定に無い形式へ回す
       （回す先が無ければ、そのままにする）。 */
    var others = sortTypes(Object.keys(uiTypes || {}).filter(function (t) {
      return uiTypes[t] && need[t] == null;
    }));
    for (var oi = 0; fi < free.length; fi++) {
      var q = free[fi];
      if (need[q.type] == null) continue;
      if (!others.length) continue;
      setType(q, others[oi++ % others.length]);
    }
    order.forEach(function (t) {
      out.applied.push({ type: t, count: need[t] - (remain[t] || 0) });
    });
    return out;
  }

  /* ══════════════════════════════════════════════════════════
     文書形式・教科レイアウトが、その組み合わせで本当に紙面に効くか

     実測（2026-08-05）:
       文書形式のセレクトは 8 件すべて available:true で「（準備中）」も付かない。
       ところが既定の組み合わせ（出力エンジン「現在の形式」＋紙面デザイン「現在の形式」）
       では、選んでも **HTML 紙面はまったく同じものが出る**。
       layout.buildPlan() は layoutProfiles.isEnabled()（＝紙面デザインが current 以外）
       のときしか planLayout を呼ばず、文書形式を読む意味の計画（semantic）が
       そもそも作られないため。
       Typst / TeX は別経路（buildSemanticPlan を直接呼ぶ）なので、そちらでは効く。

     選び直すと要約も変わり、紙面も組み直されるので「効いた」ように見える。
     効かないときは、効かないとはっきり言う（契約 §6「動くふりをしない」）。
     実際に効くようにするのは Phase 5 の仕事で、ここではしない。
     ══════════════════════════════════════════════════════════ */
  var LAYOUT_NO_EFFECT_NOTE =
    "この組み合わせでは紙面は変わりません。"
    + "出力エンジンと紙面デザインがどちらも「現在の形式」のあいだ、"
    + "文書形式・教科レイアウトは問題用紙に反映されません（保存はされます）。"
    + "紙面デザインを選ぶか、出力エンジンを Typst / TeX にすると効きます。";
  function layoutEffect(s) {
    s = s || {};
    var chosen = (s.documentFamily || "auto") !== "auto" || (s.subjectLayout || "auto") !== "auto";
    var engine = s.outputEngine || "current";
    var mode = s.layoutMode || "current";
    if (!chosen) return { chosen: false, effective: true, where: "", note: "" };
    if (engine === "typst" || engine === "tex") return { chosen: true, effective: true, where: engine, note: "" };
    var LP = VQ2.layoutProfiles;
    var ready = !!(LP && LP.resolveLayoutProfileId && LP.resolveLayoutProfileId(mode, null));
    if (mode !== "current" && ready) return { chosen: true, effective: true, where: "paper", note: "" };
    return { chosen: true, effective: false, where: "", note: LAYOUT_NO_EFFECT_NOTE };
  }

  /* 畳める見出し。開閉の状態だけを外から受け取る（描画そのものは純関数）。 */
  function accHtml(key, title, summary, body, on) {
    return '<div class="vq2-acc"><button type="button" class="vq2-acc-h" data-acc="' + key + '"'
      + ' aria-expanded="' + !!on + '">'
      + '<span class="vq2-acc-t"><strong>' + esc(title) + "</strong>"
      + '<span class="vq2-acc-sum">' + esc(summary) + "</span></span>"
      + '<span class="vq2-acc-c' + (on ? " is-open" : "") + '">' + U.icon("chevronD") + "</span></button>"
      + (on ? '<div class="vq2-acc-b">' + body + "</div>" : "")
      + "</div>";
  }

  /* ── 出す問題の形式（チェックの一覧）──────────────────────
     ここは以前 5 つの決め打ちだった（4択・正誤・短答・記述・資料読解）。
     レジストリには紙に出せる形式が 94 ある（capability.forAi({mock:true})）。
     素で 94 個並べても選べないので、**分類ごとに畳んで**出す。
     分類とその名前もレジストリが持っている（契約 §1）。

     ・チェックの入れ物（settings.types）の形は変えない。
       キーが増えても、古い保存データは「その形式は選んでいない」と読める。
     ・狭い画面でも横スクロールを出さないため、並びは .vq2-togset
       （flex-wrap）に載せ、名前は短い名前（shortName）だけを使う。 */
  function typesPickerHtml(groups, isOpen) {
    var all = groups.reduce(function (a, g) { return a + g.types.length; }, 0);
    var on = groups.reduce(function (a, g) {
      return a + g.types.filter(function (t) { return t.on; }).length;
    }, 0);
    return '<div style="margin-top:16px">'
      + '<div class="vq2-label" style="margin-bottom:6px">出す問題の形式</div>'
      + '<p class="vq2-hint" style="margin:0 0 8px">'
      + "選んだ形式だけを使います。いま " + on + " 種類を選んでいます"
      + "（試験（紙）で使えるのは全 " + all + " 種類）。</p>"
      + groups.map(function (g) {
          var picked = g.types.filter(function (t) { return t.on; });
          return accHtml("qtype:" + g.id, g.label,
            picked.length
              ? picked.map(function (t) { return t.label; }).join("・")
              : "選んでいません（" + g.types.length + " 種類）",
            '<div class="vq2-togset">'
            + g.types.map(function (t) {
                return '<label class="vq2-tog' + (t.on ? " is-on" : "") + '">'
                  + '<input type="checkbox" data-type="' + esc(t.id) + '"' + (t.on ? " checked" : "") + ">"
                  + "<span>" + esc(t.label) + "</span></label>";
              }).join("")
            + "</div>",
            isOpen ? !!isOpen("qtype:" + g.id) : false);
        }).join("")
      + (!on ? '<p class="vq2-hint">形式が 1 つも選ばれていません。選択と短答で作ります。</p>' : "")
      + "</div>";
  }

  /* よくある試験の型。選ぶと時間・満点・大問数・問題形式がまとめて入る。
     細かく決めたい人のために「自分で決める」も残す（設定は消さない）。 */
  var KINDS = [
    { id: "quiz", label: "小テスト", note: "15分・50点", icon: "clock",
      apply: { durationMinutes: 15, totalPoints: 50, sectionCount: 2, questionCount: 10,
               types: { multiple_choice_single: true, true_false: true, short_answer: true,
                        long_answer: false, source_analysis: false } } },
    { id: "regular", label: "定期考査", note: "50分・100点", icon: "doc",
      apply: { durationMinutes: 50, totalPoints: 100, sectionCount: 5, questionCount: 0,
               types: { multiple_choice_single: true, true_false: true, short_answer: true,
                        long_answer: true, source_analysis: false } } },
    { id: "trial", label: "実力テスト", note: "80分・100点", icon: "star",
      apply: { durationMinutes: 80, totalPoints: 100, sectionCount: 6, questionCount: 0,
               types: { multiple_choice_single: true, true_false: false, short_answer: true,
                        long_answer: true, source_analysis: true } } },
    { id: "custom", label: "自分で決める", note: "細かく設定", icon: "settings", apply: null }
  ];

  function open(o) {
    o = o || {};
    var app = U.mount("vq2-quick-mock", {
      title: "Quick Mock",
      onEscape: function () { return false; },
      onBeforeClose: function () { return confirmClose(); },
      onClose: function (reason) {
        chat.stop();
        if (o.onClose) { try { o.onClose(reason); } catch (e) {} }
      },
      onResize: function () { render(); }
    });

    var st = {
      step: "setup",         /* setup | blueprint | generating | review | artifacts */
      settings: defaultSettings(),
      attachments: [],
      attachBusy: false,
      /* 分割アップロード。資料を選んだ時点で送り始め、要求には ID だけを載せる。 */
      upSession: null,
      upJobId: null,
      upRows: [],            /* 送信中のようす（画面に出すためだけ） */
      instruction: "",
      blueprintText: "",
      blueprint: null,
      spec: null,
      finalizeResult: null,
      selectedQ: null,
      aiBusy: false,
      aiError: null,
      warnings: [],
      artifacts: null,
      plan: null,
      manifest: null,
      inspection: null,
      /* §44 サーバから届いた資料の読み取り結果と、外したページ。
         どちらも activity イベントで届く（noteActivityEvent が唯一の書き換え口）。
         **こちらでは何も推測しない。届かないうちは null のまま。** */
      analysis: null,
      pageReport: null,
      /* ページごとの見立てを全部出すか（既定は要約だけ） */
      pagesOpen: {},
      compileRounds: 0,
      tuning: {},
      quality: null,
      qualityBusy: false,
      dirty: false,
      cancelled: false,
      /* 設定画面の開閉。細かい設定は既定で畳んでおく（管理画面に見せない） */
      open: { detail: false, paper: false, layout: false },
      /* 紙面デザインのプレビュー（開発者向け・作った紙面そのもの） */
      layoutPreview: null,
      /* Typst。ソースと組版の結果を持つ（既定は何も無い） */
      typst: null,
      typstCompile: null,
      kind: "regular",       /* 下の KINDS のどれか。custom は「自分で決める」 */
      mobileTab: "work",     /* work | ai（旧タブ。下の pane へ写した） */
      /* いまどの段階か。画面（step / tab）だけでは決められないものがある。
         「条件」と「教材」は同じ左の欄にあるので、見た目からは見分けられない。
         押して移った段階をここに覚えておく。 */
      stepId: "setup",
      /* AI アシスタントのわき。**既定は閉じる。**
         はじめから細い 3 本の柱を並べると、どこを見ればよいか分からない。
         作っている最中は自動で開く（進み具合を見せるため）。 */
      sideOpen: false,
      /* ワークスペース。tab は中央に何を出すか、pane は狭い画面でどれを出すか。 */
      tab: "plan",           /* plan | questions | paper | verify | artifacts */
      pane: "left",          /* left | main | side */
      audit: null,           /* 不備の一覧（MB.auditSpec） */
      repairFixed: [],       /* 機械で直したもの */
      repairFilled: [],      /* AI が埋めたもの */
      repairBusy: false,
      structure: null         /* 指定どおりの作りになっているか（checkStructure） */
    };
    /* 出題形式の分類の開閉。既定は「いま選んでいる形式がある分類だけ開く」。
       ここで入れておかないと、開閉の切り替え（!st.open[k]）が
       初回だけ逆に動く（未定義 → true → 見た目は変わらない）。 */
    typeGroups(st.settings.types).forEach(function (g) {
      st.open["qtype:" + g.id] = g.types.some(function (t) { return t.on; });
    });
    /* 会話パネルは Preset Studio と同じ共通部品。見た目と動きを揃える。
       出す先だけをタイムラインへ差し替える（記録の持ち方は変えない）。 */
    var chat = new U.AiChat({
      getRoot: function () { return app.root; },
      onRepaint: function () {},
      heroLines: HERO_LINES
    });
    chat.onAppend = function (e) { timelineFromLog(e); };

    /* ── 右ペイン：AI アクティビティ ─────────────────────────── */
    var actPanel = new ACT.Panel({
      title: "AI アクティビティ",
      headExtra: '<span class="vq2-eta vq2-aiact-eta" id="aiEta" role="status" aria-live="polite"></span>',
      emptyText: "ここに AI の作業が並びます。",
      /* 「左の」と書くと、狭い画面では左が無いので指せない場所を指すことになる。
         どちらの画面でも合う言い方にする。 */
      emptySub: "「構成案をつくる」か「一気に作る」を押すと、資料の読み取りから紙面の割り付けまで、順番に出ます。",
      chips: ["正誤問題を多めに", "記述を減らして", "難易度を少し上げて", "解説を詳しくして"],
      onCancel: function () { st.cancelled = true; AI.cancel(); app.toast("停止しています…", "info"); },
      onFollowup: function (text) { return sendFollowupText(text); },
      onAction: function (id) { onActivityAction(id); }
    });
    /* 進行の表示はタイムラインが持つ。start / stop は印の切り替えだけ。 */
    var activity = {
      start: function () { actPanel.setBusy(true, "作っています"); },
      stop: function () { actPanel.setBusy(false, ""); },
      set: function (items) { actPanel.fromActivity(items); }
    };

    /* chat.log の 1 行 → タイムラインの出来事 */
    function timelineFromLog(e) {
      var m = LOG_KIND[e.kind] || LOG_KIND.note;
      var text = String(e.text || "");
      if (!text) return;
      var cut = text.indexOf("。");
      var title = cut > 0 && cut < text.length - 1 ? text.slice(0, cut + 1) : text;
      var rest = cut > 0 && cut < text.length - 1 ? text.slice(cut + 1) : "";
      actPanel.push({ kind: m.kind, status: m.status, title: title, short: rest, at: e.at });
    }
    function paintActivityHead() {
      actPanel.setBusy(!!(st.aiBusy || st.repairBusy || st.qualityBusy),
        st.repairBusy ? "不備を補っています" : st.qualityBusy ? "品質を見ています"
          : st.aiBusy ? "作っています" : "");
      chat.paintEta();
    }
    function mountActivity() {
      var host = app.root.querySelector("#qmAi");
      if (host) actPanel.mount(host);
      paintActivityHead();
    }
    /* 追加指示。Quick Mock は生成の途中に差し込む口を持たないので、
       受け取ったことと、次にどうするかをはっきり伝える。できるふりはしない。 */
    function sendFollowupText(text) {
      var t = String(text || "").trim();
      if (!t) return false;
      actPanel.push({ kind: "user-followup", status: "done",
                      title: "追加の指示を受け取りました", short: t });
      st.instruction = st.instruction ? st.instruction.replace(/\s*$/, "") + "。" + t : t;
      renderLeft();
      if (st.aiBusy) {
        actPanel.push({ kind: "info", status: "done", title: "いまの生成が終わってから使います",
                        short: "途中の依頼へは差し込めません。指示は依頼内容の欄に足しました。" });
      } else {
        actPanel.push({ kind: "info", status: "done", title: "依頼内容の欄に足しました",
                        short: "「作り直す」か「構成案をつくる」で反映します。" });
      }
      return true;
    }
    /* ── §44 サーバから届いた資料のようすを受け取る ──────────────
       activity の生イベント（第 2 引数）にしか入っていない。
       activities の配列（第 1 引数）は label と状態しか持たないので、
       ここを見ないとページの見立ても外したページも永久に届かない。
       **画面の状態を書き換えるのはここだけ。** */
    function noteActivityEvent(ev) {
      var a = analysisFromActivity(ev);
      if (a) { st.analysis = a; renderLeft(); return; }
      var r = pageReportFromActivity(ev);
      if (!r) return;
      st.pageReport = r;
      /* 外したページがあれば、右の記録にも 1 行残す（あとから追える形で）。 */
      if (r.excludedPages.length) {
        var head = r.excludedPages.slice(0, 6).map(function (p) {
          return (p.page == null ? "?" : "p." + p.page) + "（" + p.reasonJa + "）";
        }).join("・");
        chat.log("warn", r.excludedPages.length + " ページを出題対象から外しました："
          + head + (r.excludedPages.length > 6 ? " ほか" : "")
          + "。教材の欄で「外したページも使う」を入れると、次の生成から戻せます。");
      }
      renderLeft();
    }

    function onActivityAction(id) {
      if (id === "verify") { st.tab = "verify"; st.pane = "main"; render(); return; }
      if (id === "questions") { st.tab = "questions"; st.pane = "main"; render(); }
    }

    if (o.mockId) {
      var loaded = ST.mocks.get(o.mockId);
      if (loaded) {
        st.spec = loaded.spec || loaded; st.step = "review"; st.tab = "questions"; st.settings = settingsFromSpec(st.spec);
        /* 開いた時点で不備を見ておく。押さないと出ない、では気づけない。 */
        refreshAudit();
        revalidate();
      }
    }
    render();
    /* 開いた時点で、この端末で組めるエンジンを確かめに行く。

       これまでは「Typst を選んだとき」にしか聞いていなかった。
       そのため一覧には Typst も TeX も「準備中」と出たままで、
       **選べるレイアウトが実質 1 つしか無いように見えていた**（実測）。
       確かめられなければ、これまでどおり「準備中」のまま。 */
    setTimeout(function () {
      try { probeTypst(false); } catch (e) {}
      try { probeTex(false); } catch (e) {}
    }, 0);

    function defaultSettings() {
      return {
        title: "", subject: "", grade: "", audience: "",
        durationMinutes: 50, totalPoints: 100, sectionCount: 5,
        questionCount: 0, difficulty: "mixed",
        types: { multiple_choice_single: true, true_false: true, short_answer: true, long_answer: true, source_analysis: false },
        choiceRatio: 60, writtenRatio: 20,
        allowExternalKnowledge: false, requireSources: true,
        /* §17 出題対象から外したページを使い直すか。
           **既定は使わない。** 利用者が明示的に入れたときだけ、
           依頼文へ解除の言い回しを足す（withSourcePolicy）。 */
        includeExcludedPages: false,
        answerSheet: true, answerKeyBooklet: true,
        paperSize: "A4", orientation: "portrait", spread: false,
        writingDirection: "horizontal", engine: "auto",
        templateId: "standard-school-exam",
        marginTop: 20, marginBottom: 20, marginLeft: 18, marginRight: 18,
        pageNumbering: true, minimumFontSize: 9,
        bookletMode: "separate-answer-sheet",
        /* ── 紙面レイアウト（Typst / TeX の前段階）──────────────────
           出力エンジンと紙面デザインは別の項目。既定はどちらも「現在の形式」。
           ここが current のあいだは、新しいレイアウト処理へは入らない。 */
        outputEngine: "current",
        layoutMode: "current",
        answerSheetMode: "current",
        layoutSeed: "",
        /* Layout Grammar V2。既定は「おまかせ」＝現在の形式のまま。 */
        documentFamily: "auto",
        texVertical: "horizontal",
        subjectLayout: "auto",
        /* Typst（出力エンジンで typst を選んだときだけ使う） */
        typstCover: "none",
        typstQuestion: true,
        typstAnswerSheet: true,
        typstAnswerKey: true,
        typstExplanation: false
      };
    }
    function settingsFromSpec(spec) {
      var s = defaultSettings();
      var p = spec.paper || {};
      s.title = spec.title; s.subject = spec.subject; s.grade = spec.grade; s.audience = spec.audience;
      s.durationMinutes = spec.durationMinutes; s.totalPoints = spec.totalPoints;
      s.sectionCount = (spec.sections || []).length;
      s.paperSize = p.size; s.orientation = p.orientation; s.spread = !!p.spread;
      s.writingDirection = p.writingDirection; s.engine = p.engine; s.templateId = p.templateId;
      s.pageNumbering = p.pageNumbering !== false; s.minimumFontSize = p.minimumFontSize || 9;
      s.bookletMode = p.bookletMode || "separate-answer-sheet";
      var m = p.margins || {};
      s.marginTop = m.top; s.marginBottom = m.bottom; s.marginLeft = m.left; s.marginRight = m.right;
      s.allowExternalKnowledge = spec.sourceMode !== "source-only";
      /* 古い保存データには layout が無い。無ければ既定（現在の形式）のまま。 */
      var l = LPF ? LPF.readLayoutSettings(spec) : null;
      if (l) {
        s.outputEngine = l.outputEngine; s.layoutMode = l.layoutMode;
        s.answerSheetMode = l.answerSheetMode; s.layoutSeed = l.layoutSeed || "";
        s.documentFamily = l.documentFamily || "auto";
        s.subjectLayout = l.subjectLayout || "auto";
      }
      return s;
    }
    /* MockSpec へ載せる形。何も選んでいなければ null（layout を足さない）。
       中身の決め方は layout-profiles.js が持つ（純関数・テスト済み）。

       文書形式（documentFamily）と教科レイアウトを見ていなかったため、
       文書形式だけを選んでも layout が丸ごと null になり、
       保存にも紙面にも届いていなかった（実測 2026-08-05）。 */
    function layoutFromSettings() {
      return LPF ? LPF.layoutFromUiSettings(st.settings) : null;
    }
    /* 選び直した紙面の指定を、作ってある MockSpec へ書き戻す。

       さわるのは spec.layout **だけ**。
       問題文・正解・選択肢・配点・問題 ID・問題番号には一切さわらない。
       AI も呼ばない（紙面を組み直すだけで、問題は作り直さない）。

       これまでは st.settings を変えて render() するだけだったため、
       生成後に文書形式を変えても compileLoop が見る st.spec.layout が
       古いままで、紙面に反映されなかった（実測 2026-08-05）。 */
    function applyLayoutToSpec() {
      if (!st.spec || !LPF) return false;
      var changed = LPF.applyLayoutToSpec(st.spec, st.settings);
      if (changed) st.dirty = true;
      return changed;
    }
    /* ── 紙面デザインを選び直したときの唯一の入口 ────────────────
       セレクトからも、紙面ステップのカードからも、ここを通る。
       何をするかは layoutChangeActions（純関数）が決める。
       **AI 生成へ行く道はここに 1 本も無い。**
       問題文・正解・選択肢・配点・問題 ID・問題番号にはさわらない。 */
    function applyLayoutChoice(key, value) {
      st.settings[key] = value;
      st.open.layout = true;                    /* 左の欄は開いたままにする */
      var act = layoutChangeActions(key, value, { step: st.step });
      /* Typst / TeX を選んだら、この端末で使えるかを 1 度だけ確かめに行く。
         確かめられなければ「準備中」のまま（使えるふりをしない）。 */
      if (act.probeEngine === "typst") probeTypst(false);
      if (act.probeEngine === "tex") probeTex(false);
      var relayout = act.applyLayoutToSpec ? applyLayoutToSpec() : false;
      render();
      /* 紙面だけ組み直す（compileLoop は AI を呼ばない）。 */
      if (relayout && act.rebuildPaper) rebuildPaper();
      /* 紙面を組み直すので「効いた」ように見えてしまう。
         効かない組み合わせのときは、その場で言う（契約 §6）。 */
      var eff = layoutEffect(st.settings);
      if (eff.chosen && !eff.effective) app.toast(LAYOUT_NO_EFFECT_NOTE, "warning", 7000);
      return act;
    }

    /* 紙面だけ組み直す。問題は作り直さない（AI 生成は走らない）。 */
    function rebuildPaper() {
      if (!st.spec || st.step !== "artifacts") return;
      st.compileRounds = 0; st.fixNotes = [];
      compileLoop();
    }
    function paperFromSettings() {
      return {
        size: st.settings.paperSize, orientation: st.settings.orientation,
        spread: !!st.settings.spread, writingDirection: st.settings.writingDirection,
        engine: st.settings.engine, templateId: st.settings.templateId,
        templateVersion: (TPL.get(st.settings.templateId) || {}).version || "1.0.0",
        margins: { top: num(st.settings.marginTop, 20), bottom: num(st.settings.marginBottom, 20),
                   left: num(st.settings.marginLeft, 18), right: num(st.settings.marginRight, 18) },
        pageNumbering: st.settings.pageNumbering !== false,
        minimumFontSize: num(st.settings.minimumFontSize, 9),
        bookletMode: st.settings.bookletMode
      };
    }
    function num(v, d) { var n = Number(v); return isFinite(n) ? n : d; }

    function confirmClose() {
      if (!st.dirty) return true;
      app.confirm({ title: "閉じますか", body: "保存していない試験があります。", okLabel: "保存せず閉じる", danger: true })
        .then(function (yes) { if (yes) { st.dirty = false; app.close("discard"); } });
      return false;
    }

    /* ══════════════════════════════════════════════════════════
       1) 構成案を作る
       ══════════════════════════════════════════════════════════ */
    function runBlueprint() {
      if (st.aiBusy) return;
      var inst = buildInstruction();
      if (!inst.trim()) { app.toast("試験の内容を指示してください。", "warning"); return; }

      /* 構成案でも使う資料を限定する。ここで除外を効かせておかないと、
         「使わない資料の話」が構成案に入り、そのまま本生成の指示になる。 */
      var bpSel = applyExclusions();
      if (bpSel.blocked) return;

      /* 資料なしのときは、何を出題するかが指示にしか無い。空なら先へ進めない。 */
      var bpPromptOnly = !bpSel.included.length;
      if (bpPromptOnly && !st.instruction.trim() && !st.settings.subject && !st.settings.title) {
        app.toast("資料がありません。どんな問題を作るのかを指示欄に書いてください。", "warning");
        return;
      }
      if (bpPromptOnly) chat.log("note", "資料がないので、ご指示だけで組み立てます。出典は付きません。");

      st.aiBusy = true; st.aiError = null; st.blueprintText = ""; st.blueprint = null;
      st.step = "blueprint"; st.tab = "plan";
      chat.begin(st.instruction.trim() || "この条件で構成案をつくって");
      chat.etaStart(1, "構成案を作っています");
      render();
      chat.etaRound();
      chat.log("step", "どの大問に何を出すかを先に決めます");

      AI.generateBlueprint({
        instruction: inst,
        attachments: bpSel.attachments,
        includedAttachmentIds: bpSel.included,
        retrievalQuery: buildRetrievalQuery(
          [st.instruction, st.settings.subject, st.settings.title], bpSel.excludedNames),
        totalPoints: st.settings.totalPoints,
        /* 資料が無いのに資料限定にすると、構成案の段階で「資料がありません」になる。 */
        sourceOnly: !bpPromptOnly && !st.settings.allowExternalKnowledge,
        onActivity: function (items, ev) { activity.set(items); noteActivityEvent(ev); },
        onMetrics: function (m) { actPanel.attachSourceBash(m); },
        onToken: function (t, all) { st.blueprintText = all; chat.setStream(all); },
        onWarning: function (m) { chat.log("warn", m); st.warnings.push(m); }
      }).then(function (res) {
        chat.etaDone();
        st.aiBusy = false;
        st.blueprintText = res.text || st.blueprintText;
        st.blueprint = MB.parseBlueprint(st.blueprintText);
        chat.log(st.blueprint && st.blueprint.ok ? "done" : "warn",
          st.blueprint && st.blueprint.ok
            ? "構成案ができました（大問 " + st.blueprint.sections.length + " ・ 合計 "
              + st.blueprint.totalQuestions + " 問）"
            : "構成案を表の形にできませんでした。説明はそのまま条件として使えます。");
        chat.end({});
        render();
      }).catch(function (e) {
        st.aiBusy = false;
        if (e && e.cancelled) { chat.log("note", "止めました"); chat.end({}); st.step = "setup"; st.tab = "plan"; render(); return; }
        st.aiError = e.userMessage || "構成案を作れませんでした。";
        chat.end({ error: st.aiError });
        render();
      });
    }

    function buildInstruction(promptOnly) {
      var s = st.settings;
      if (promptOnly == null) promptOnly = isPromptOnly();
      var types = Object.keys(s.types).filter(function (k) { return s.types[k]; })
        .map(function (k) { return typeJa(k); });
      var lines = [];
      if (st.instruction.trim()) lines.push(st.instruction.trim(), "");
      lines.push("【試験の条件】");
      if (s.title) lines.push("試験名: " + s.title);
      if (s.subject) lines.push("科目: " + s.subject);
      if (s.grade) lines.push("学年: " + s.grade);
      if (s.audience) lines.push("対象: " + s.audience);
      lines.push("試験時間: " + s.durationMinutes + " 分");
      lines.push("満点: " + s.totalPoints + " 点");
      lines.push("大問数: " + s.sectionCount + " 問");
      if (s.questionCount) lines.push("設問数: 約 " + s.questionCount + " 問");
      if (types.length) lines.push("含める問題形式: " + types.join("・"));
      lines.push("難易度: " + (s.difficulty === "mixed" ? "易しい問題から難しい問題まで混ぜる" : DIFF_JA[s.difficulty] || "標準"));
      if (promptOnly) {
        /* 資料が無いので、資料に関する指示は書かない（無い資料を指させない）。
           代わりに、確かでないことを書かせないための歯止めを置く。 */
        lines.push("資料は添付されていません。上の指示の範囲で、確かな内容だけから出題してください。");
        lines.push("出典・ページ番号は書かないでください（指せる資料がありません）。");
        lines.push("確かでない事実・作った固有名詞や年号で問題を作ってはいけません。");
      } else {
        if (!s.allowExternalKnowledge) lines.push("教材外の知識は使わないでください。添付した資料だけを根拠にしてください。");
        if (s.requireSources) lines.push("各設問には、根拠にした資料の箇所を必ず示してください。");
      }
      /* §17 外したページを使い直す指定。資料があるときだけ意味がある。 */
      return promptOnly ? lines.join("\n") : withSourcePolicy(lines.join("\n"), s);
    }

    /* 1 問ごとに必ず書かせるもの。ここが抜けると受験も採点も見直しもできない。 */
    var MUST_HAVE = [
      "",
      "【1 問ごとに必ず書くこと】",
      "・問題文",
      "・正解（選択問題は、どの選択肢が正解かを必ず示す）",
      "・解説（なぜその答えになるのか）",
      "・選択問題は選択肢を 2 つ以上（正誤問題も「正しい」「誤っている」を選択肢として書く）",
      "・根拠にした資料の箇所（分からなければ書かない。**存在しない出典は作らない**）",
      "どれか 1 つでも書けない設問は、**その設問を作らないでください**。"
    ].join("\n");

    /* 資料なしのときの必須項目。出典の行だけを外す。
       「分からなければ書かない」ではなく、そもそも指せる資料が無い。 */
    var MUST_HAVE_PROMPT = [
      "",
      "【1 問ごとに必ず書くこと】",
      "・問題文",
      "・正解（選択問題は、どの選択肢が正解かを必ず示す）",
      "・解説（なぜその答えになるのか）",
      "・選択問題は選択肢を 2 つ以上（正誤問題も「正しい」「誤っている」を選択肢として書く）",
      "どれか 1 つでも書けない設問は、**その設問を作らないでください**。",
      "確かでない内容は、書けない設問として扱ってください。"
    ].join("\n");

    /* ══════════════════════════════════════════════════════════
       2) 試験本体を作る

       大問ごとに分けて呼ぶ。
       1 回で試験まるごとを作らせると、資料が多いほど出力が長くなり、
       途中で JSON が切れて全部失う。しかも後半ほど解説や出典が抜ける。
       大問ごとなら 1 回が短く、失敗しても他の大問は残る。
       ══════════════════════════════════════════════════════════ */
    /* ══════════════════════════════════════════════════════════
       試験コンパイラ V2 で作る

       V1 との違いは 3 つだけ。
         ① 大問・設問数・配点・番号を **先にコードで決める**（AI へ渡すのは中身だけ）
         ② 1 回の依頼は数問ぶん。作りすぎは枠に入らないので試験が膨れない
         ③ 埋まらなかった枠だけを、もう一度名指しで頼む（全体を作り直さない）

       止まったときも、できている設問はそのまま残す。
       ══════════════════════════════════════════════════════════ */
    function runGenerateV2(o) {
      o = o || {};
      var MC = VQ2.mockCompiler, MR = VQ2.mockCompilerRun;
      /* 足りないぶんだけを作り直すとき。前の枠と、できている設問をそのまま使う。 */
      var refill = o.refill && st.compileResult && st.compileResult.plan;
      var sel = applyExclusions();
      if (sel.blocked) return;

      var promptOnly = !sel.included.length;
      if (promptOnly && !st.instruction.trim() && !st.settings.subject && !st.settings.title) {
        var m0 = "資料がありません。どんな問題を作るのかを指示欄に書いてください"
          + "（例:「高校日本史・明治維新の要点から 20 問」）。";
        st.structure = { ok: false, code: "NO_TOPIC", problems: [m0] };
        st.aiError = m0;
        chat.log("error", "NO_TOPIC：" + m0);
        st.step = st.blueprintText ? "blueprint" : "setup";
        render();
        app.alert({ title: "何を出題するかが決まっていません", body: m0, okLabel: "設定に戻る" });
        return;
      }

      var s = st.settings;
      var p = refill ? st.compileResult.plan : MC.plan({
        title: s.title, subject: s.subject, grade: s.grade,
        durationMinutes: s.durationMinutes, totalPoints: s.totalPoints,
        sectionCount: s.sectionCount, questionCount: s.questionCount,
        types: s.types, difficulty: s.difficulty,
        allowExternalKnowledge: promptOnly || s.allowExternalKnowledge,
        requireSources: requireSourcesNow(),
        blueprint: st.blueprint
      });

      /* 指示文に書かれた「形式ごとの個数」を枠へ反映する（契約 §5）。
         MC.plan は選ばれている形式を順ぐりに割り当てるだけなので、
         「空欄補充を4問、正誤を4問」の個数はここで守らせる。
         枠の形式を書き換えるだけで、問題文も配点も作り直さない。 */
      var typeReq2 = parseTypeRequest(st.instruction);
      var typeFit = refill
        ? { changed: 0, applied: [], notes: [] }
        : applyTypeDistribution(p, typeReq2.typeDistribution, s.types);

      /* 枠の段階で分かる無理は、AI を呼ぶ前に伝える。 */
      (p.issues || []).forEach(function (i) {
        chat.log(i.severity === "high" ? "error" : "warn", i.message);
        st.warnings.push(i.message);
      });
      var fatal = (p.issues || []).filter(function (i) { return i.severity === "high"; });
      if (fatal.length) {
        st.structure = { ok: false, code: fatal[0].type || "PLAN", problems: fatal.map(function (i) { return i.message; }) };
        st.aiError = fatal[0].message;
        st.step = st.blueprintText ? "blueprint" : "setup";
        render();
        app.alert({ title: "この条件では作れません", body: fatal[0].message, okLabel: "設定に戻る" });
        return;
      }

      /* 資料を引くための語。**依頼文（「問1 選択 10点」）を検索語にしてはいけない。**
         試験の言葉ばかりで資料の中身と噛み合わず、資料が引けない。 */
      var query = buildRetrievalQuery(
        [st.instruction, s.subject, s.title].concat(
          (p.sections || []).map(function (x) { return x.title; })),
        sel.excludedNames);

      st.aiBusy = true; st.aiError = null; st.step = "generating"; st.tab = "questions";
      st.warnings = []; st.cancelled = false; st.gateStopped = null;
      /* 作り直しでないなら、前回の結果は捨てる。
         残しておくと「検証」に前回の足りない数が出たままになる。 */
      if (!refill) st.compileResult = null;
      st.plan2 = p;
      st.sectionRuns = (p.sections || []).map(function (sec) {
        return { number: sec.number, asked: sec.questions.length, made: 0, ok: false, reason: null, truncated: false };
      });
      chat.begin(st.blueprintText ? "この構成で問題を作って" : "この条件で作って");
      /* 分母は **実際に投げる依頼の数**。ceil(総問題数 / 3) ではない
         （5 大問 1 問ずつなら 5 回。ceil(5/3)=2 では合わない）。 */
      var reqTotal = plannedRequestCount(MC, p) || 1;
      chat.etaStart(reqTotal, "問題を作っています");
      /* 1 巡目はここから始まっている。始まりを入れておかないと、
         最初に終わった回の所要時間が取れず、残り時間が出ないままになる。 */
      chat.etaStep({ done: 0, total: reqTotal, made: 0, madeTotal: p.totalQuestions });
      /* 進みぐあいの入れ物。done は「終わった依頼の数」の実数。
         refilling が立つと、埋め直しで枠が飛ぶので問番号は言わない。 */
      var prog = { done: 0, total: reqTotal, runs: st.sectionRuns,
                   sections: p.sections || [], refilling: false };
      render();
      if (refill) {
        var have = Object.keys(st.compileResult.filled || {}).length;
        chat.log("step", "足りない " + (p.totalQuestions - have) + " 問だけを作ります"
          + "（できている " + have + " 問はそのまま残します）");
      } else {
        chat.log("step", "大問 " + p.sections.length + " ・ 全 " + p.totalQuestions + " 問の枠を先に決めました"
          + "（配点は合計 " + p.totalPoints + " 点。ここから増えも減りもしません）");
      }
      /* どの指定をどう採ったかを黙らせない（契約 §6）。 */
      if (typeFit.applied.length) {
        chat.log("note", "指示文の指定どおりに枠を決めました："
          + typeFit.applied.map(function (a) { return typeJa(a.type) + " " + a.count + " 問"; }).join(" / "));
      }
      typeFit.notes.forEach(function (m) { chat.log("warn", m); st.warnings.push(m); });

      var first = true;

      /* この Mac（Bridge）で作る。**資料の読み取りはこちらにしかない。**
         クラウドへ切り替えてよいのは、資料が付いていないときだけ。 */
      function localGenerate(req, cx) {
          return AI.generateQuestions({
            /* §17 外したページを使い直す指定は、**1 回ごとの依頼文へ**足す。
               ページを外すかどうかはサーバ側でこの依頼文を見て決まるので、
               設定欄に足しても届かない（実測: 依頼文には条件欄が入らない）。 */
            prompt: withSourcePolicy(cx.prompt, s),
            attachments: sel.attachments,
            includedAttachmentIds: sel.included,
            retrievalQuery: query,
            /* 資料ひとまとまりの札。読み取り済みかどうかを中身で見分ける。 */
            docFingerprint: st.docFingerprint || null,
            sourceOnly: !promptOnly && !s.allowExternalKnowledge,
            requireEvidence: !promptOnly && !s.allowExternalKnowledge,
            count: req.slots.length,
            /* 資料の要点は 1 回まとめれば足りる。2 回目からはまとめ直さない。 */
            skipDocumentAnalysis: !first,
            onActivity: function (items, ev) { activity.set(items); noteActivityEvent(ev); },
            onMetrics: function (mm) { actPanel.attachSourceBash(mm); },
            onWarning: function (msg) { chat.log("warn", msg); st.warnings.push(msg); }
          }).then(function (r) { first = false; return r; });
      }

      MR.run({
        plan: p,
        /* できている設問はそのまま持ち込む。**作り直すのは空いた枠だけ。** */
        filled: refill ? st.compileResult.filled : null,
        ownerId: ST.currentOwnerId(),
        paper: paperFromSettings(),
        signal: { get aborted() { return st.cancelled; } },
        onStage: function (stage, info) {
          if (stage === "refill") {
            prog.refilling = true;
            chat.log("step", "埋まらなかった枠だけ、もう一度頼みます（" + info.pending + " 問）");
          } else if (stage === "assemble") chat.log("step", "できた設問を試験の形に組み立てます");
        },
        onProgress: function (pr) {
          /* ここは「1 依頼ぶんが終わった」ところ。**終わりと次の始まりを対で入れる。**
             etaRound（始まり）だけを呼んでいたのが、
             ずっと「0 / N・残りを計算しています」だった原因。 */
          chat.log("done", applyProgress(chat, prog, pr));
        },
        generate: function (req, cx) {
          if (st.cancelled) return Promise.reject(Object.assign(new Error("cancelled"), { cancelled: true }));
          /* ══ どこで作るか ══
             資料が付いていないときは **クラウド（Workers AI）** で作る。
             実測（同じ 23 ケース・同じ採点）:
               この Mac  合格 15/23・平均 89 点・p50 81 秒
               クラウド  合格 22/23・平均 99 点・p50 11 秒
             頼んでいない形式や配分ずれも、クラウド側は受け取らずに作り直す。

             資料が付いているときは、まだこの Mac のまま
             （資料の読み取りはクラウド側に無い。ここで切り替えると資料を見ずに作ってしまう）。 */
          var G = VQ2.aigen;
          var noSource = !(sel.attachments && sel.attachments.length);
          if (G && noSource && G.executorPref() !== "local") {
            return G.available().then(function (okCloud) {
              if (!okCloud) return null;
              return G.generateQuestions({
                prompt: withSourcePolicy(cx.prompt, s),
                count: req.slots.length
              }).then(function (r) {
                first = false;
                (r.warnings || []).forEach(function (w) { if (w) chat.log("warn", w); });
                if (r.status === "contradictory" || r.status === "unsupported") {
                  st.warnings.push(r.reason || "");
                }
                actPanel.attachSourceBash({ executor: "cloud", usage: r.usage });
                return r;
              }, function (e) {
                /* クラウドが使えない（今日ぶんを使い切った・届かない）。
                   **止めずに この Mac へ回す。** 理由は画面に出す。 */
                if (e && e.fallbackToLocal) {
                  chat.log("warn", e.userMessage || "クラウドで作れませんでした。この端末に切り替えます。");
                  return null;
                }
                throw e;
              });
            }).then(function (r) {
              if (r) return r;
              return localGenerate(req, cx);          /* 届かなければ この Mac で */
            });
          }
          return localGenerate(req, cx);
        }
      }).then(function (res) {
        /* 最後は「これ以上の巡は無い」とだけ言う。数は水増ししない
           （届かなかったぶんを満了扱いにすると、それは嘘の進捗になる）。 */
        chat.etaStep({ done: prog.done, total: prog.total,
                       made: res.accepted, madeTotal: res.planned, more: false });
        st.aiBusy = false;
        st.compileResult = res;
        finishGenerateV2(res);
      }).catch(function (e) {
        st.aiBusy = false;
        if (e && e.cancelled) { chat.log("note", "止めました"); chat.end({}); st.step = "setup"; render(); return; }
        st.aiError = (e && e.userMessage) || "問題を作れませんでした。";
        chat.end({ error: st.aiError });
        render();
      });
    }

    /* コンパイラの結果を画面へ。**足りないぶんを黙って埋めない。** */
    function finishGenerateV2(res) {
      var got = res.accepted, want = res.planned;

      if (!got) {
        var why = res.evidence && res.evidence.maxQuestions === 0
          ? "資料から読み取れた内容が少なすぎて、1 問も作れませんでした。"
          : (res.errors[0] && res.errors[0].message)
            || "AI の結果を試験として読み取れませんでした。条件を変えてもう一度お試しください。";
        st.aiError = why;
        st.structure = { ok: false, code: "NO_QUESTION", problems: [why] };
        chat.log("error", why);
        chat.end({ error: why });
        st.step = st.blueprintText ? "blueprint" : "setup";
        render();
        app.alert({ title: "問題を作れませんでした", body: why, okLabel: "設定に戻る" });
        return;
      }

      /* できたぶんは必ず残す。足りない理由は、そのぶんだけ正直に出す。 */
      st.spec = res.spec;
      st.finalizeResult = res.finalize;
      st.audit = res.audit;
      st.plan = null;
      st.dirty = true;
      st.step = "review"; st.tab = "questions";
      st.selectedQ = firstQuestionId();

      var problems = [];
      if (got < want) {
        var head = want + " 問のうち " + got + " 問できました。";
        if (res.evidence) {
          head += "残り " + (want - got) + " 問は、資料から読み取れた内容（約 "
            + res.evidence.contentCharacters + " 字）では足りませんでした。"
            + "この資料で作れるのは、目安で " + res.evidence.maxQuestions + " 問までです。";
        } else if (res.errors.length) {
          head += "残り " + (want - got) + " 問は " + (res.errors[0].message || res.errors[0].code) + "。";
        }
        problems.push(head);
        chat.log("warn", head);
      }
      /* "incomplete" は上の一文で言い直しているので重ねない。 */
      (res.issues || []).filter(function (i) { return i.severity === "high" && i.type !== "incomplete"; })
        .forEach(function (i) { problems.push(i.message); chat.log("error", i.message); });

      st.structure = problems.length
        ? { ok: false, code: got < want ? "SHORTFALL" : "VERIFY", problems: problems }
        : { ok: true, problems: [] };

      chat.log("done", got + " 問できました（配点の合計 " + res.plan.totalPoints + " 点）。内容を確認します。");
      chat.end({});
      render();

      if (problems.length) {
        app.alert({
          title: got < want ? "頼んだ数まで届きませんでした" : "確かめてほしいところがあります",
          html: "<p>できた " + got + " 問はそのまま残してあります。</p><ul>"
            + problems.map(function (m) { return "<li>" + esc(m) + "</li>"; }).join("")
            + '</ul><p>「検証」の画面に<b>「足りないぶんを作る」</b>があります。'
            + "できている問題はそのまま残したまま、空いている枠だけを作り直します。</p>",
          okLabel: "内容を見る"
        });
      }
    }

    function runGenerate() {
      if (st.aiBusy) return;
      /* 試験コンパイラ V2 が使えるならそちらへ。
         枠を先に決めるので「頼んだ数より多い／少ない」「満点が合わない」が起きない。 */
      if (VQ2.flags.isOn("quickMockCompilerV2") && VQ2.mockCompiler && VQ2.mockCompilerRun) {
        runGenerateV2();
        return;
      }
      var plan = sectionPlan();

      /* 使う資料を先に確定させる（Phase 13 §1）。
         曖昧な除外指定は勝手に適用せず、ここで確認する。 */
      var sel = applyExclusions();
      if (sel.blocked) return;

      /* 資料が 1 件も無いなら、指示だけで作る。
         その代わり「何を作るか」は書いてもらう。何も書かれていなければ、
         こちらで題材を決めることになる（それは作り話になる）ので止める。 */
      var promptOnly = !sel.included.length;
      if (promptOnly && !st.instruction.trim() && !st.settings.subject && !st.settings.title) {
        var m0 = "資料がありません。どんな問題を作るのかを指示欄に書いてください"
          + "（例:「高校日本史・明治維新の要点から 20 問」）。";
        st.structure = { ok: false, code: "NO_TOPIC", problems: [m0] };
        st.aiError = m0;
        chat.log("error", "NO_TOPIC：" + m0);
        /* 先に描き直してから出す。render() は app.root ごと innerHTML を入れ替えるので、
           あとから呼ぶと、いま出したダイアログをそのまま消してしまう。 */
        st.step = st.blueprintText ? "blueprint" : "setup";
        render();
        app.alert({ title: "何を出題するかが決まっていません", body: m0, okLabel: "設定に戻る" });
        return;
      }
      if (promptOnly) {
        chat.log("note", "資料がないので、ご指示だけで作ります。出典は付きません。");
        if (!st.settings.allowExternalKnowledge)
          chat.log("note", "「資料だけを根拠にする」は、根拠にする資料が無いため、この回は使いません。"
            + "設定はそのまま残します。");
      }
      var base = buildInstruction(promptOnly) + (promptOnly ? MUST_HAVE_PROMPT : MUST_HAVE);

      /* 形式の内訳を必ず見せる。どの指定を採用したのかを黙らせない（§7）。 */
      if (st.typePlan) {
        var mixText = sortTypes(Object.keys(st.typePlan.mix).filter(function (t) { return st.typePlan.mix[t]; }))
          .map(function (t) { return typeJa(t) + " " + st.typePlan.mix[t] + " 問"; }).join(" / ");
        chat.log("note", "出題形式の内訳：" + mixText
          + (st.typePlan.notes.length ? "（指示文の指定：" + st.typePlan.notes.join("・") + "）" : "（画面の設定から）"));
        st.typePlan.conflicts.forEach(function (c) { chat.log("warn", c); st.warnings.push(c); });
      }

      /* 1 大問が 1 回で作れる上限を超えている。
         切り捨てて先へ進むと、頼んだ問題数に届かないまま「できました」になる。
         分割生成はまだ入れていないので、ここで止めて理由を伝える。 */
      var over = batchRequired(plan);
      if (over.length) {
        var msg = "1 つの大問に " + Math.max.apply(null, over.map(function (p) { return p.count; }))
          + " 問を入れる指定になっています（1 回で作れるのは " + MAX_PER_CALL + " 問までです）。"
          + "大問数を増やすか、設問数を減らしてください。";
        st.structure = { ok: false, code: "BATCH_REQUIRED", problems: [msg] };
        st.aiError = msg;
        chat.log("error", "BATCH_REQUIRED：" + msg);
        st.step = st.blueprintText ? "blueprint" : "setup";
        render();
        app.alert({ title: "この条件では作れません", body: msg, okLabel: "設定に戻る" });
        return;
      }

      st.aiBusy = true; st.aiError = null; st.step = "generating"; st.tab = "questions"; st.warnings = []; st.cancelled = false;
      chat.begin(st.blueprintText ? "この構成で問題を作って" : "この条件で一気に作って");
      chat.etaStart(plan.length, "問題を作っています");
      render();

      chat.log("step", plan.length > 1
        ? "大問 " + plan.length + " つに分けて作ります（1 つずつ確かめながら進みます）"
        : "試験を作ります");
      if (plan.length > 1) chat.log("note", "できた大問から下に出ます。途中で止めても、そこまでは残ります。");

      var got = [], keys = [], at = 0, failed = 0;
      /* 大問ごとの結末を必ず残す。**欠落を黙って許容しない**（§10）。 */
      st.sectionRuns = plan.map(function (p) {
        return { number: p.number, asked: p.count, made: 0, ok: false, reason: null, truncated: false };
      });
      st.gateStopped = null;
      next();

      function next() {
        if (st.cancelled) { finishGenerate(got, keys, "止めました"); return; }
        if (at >= plan.length) { finishGenerate(got, keys, null); return; }
        var p = plan[at++];
        var run = st.sectionRuns[p.number - 1];
        chat.etaRound("大問" + p.number + " を作っています");
        chat.log("step", "大問" + p.number + (p.title ? "「" + p.title.slice(0, 24) + "」" : "")
          + " を作っています（" + p.count + " 問・" + p.points + " 点）");

        AI.generateMock({
          instruction: sectionInstruction(base, p, got),
          attachments: sel.attachments,
          /* 使う資料を ID で限定する。除外した資料は chunk すら作られない。 */
          includedAttachmentIds: sel.included,
          /* 資料検索に使う語。試験メタ語彙と除外ファイル名は入れない（§2）。 */
          retrievalQuery: buildRetrievalQuery(
            [st.instruction, st.settings.subject, st.settings.title, p.title, p.theme],
            sel.excludedNames),
          /* 資料限定なら、Evidence が足りないときは生成させない（§4）。
             資料が 1 件も無いときは、この 2 つを立てると必ずゲートで止まる。
             止めるのが正しいのは「資料があるはずなのに読めなかった」場合だけ。 */
          requireEvidence: !promptOnly && !st.settings.allowExternalKnowledge,
          sourceOnly: !promptOnly && !st.settings.allowExternalKnowledge,
          /* 資料なしで、指示から論点を洗い出して作る。 */
          promptOnly: promptOnly,
          count: p.count,
          /* この大問で作る形式の内訳。Schema 側で type ごとの必須項目が変わる。 */
          questionTypes: p.types || null,
          /* この呼び出しは **大問 1 つぶん**（sectionInstruction が
             「この大問だけを sections に 1 つ返して」と指示している）。
             伝えないとサーバ側の JSON Schema で sections の maxItems が付かず、
             大問をいくつでも作られる。count は「大問あたりの設問数」なので、
             大問数が縛られていないと count × 大問数だけ設問が返る
             （実測: count 3 で 12 大問 = 36 問）。 */
          sectionCount: 1,
          /* 2 つめ以降は資料の要点をまとめ直さない。何を出すかは構成案が決めている。 */
          skipDocumentAnalysis: plan.length > 1 && at > 1,
          onActivity: function (items, ev) { activity.set(items); noteActivityEvent(ev); },
        onMetrics: function (m) { actPanel.attachSourceBash(m); },
          onWarning: function (m) { chat.log("warn", m); st.warnings.push(m); }
        }).then(function (res) {
          chat.etaDone();
          var data = draftOf(res);
          var secs = data && Array.isArray(data.sections) ? data.sections : [];
          var qn = secs.reduce(function (a, x) { return a + (x.questions || []).length; }, 0);
          /* サーバが返した完成可否の材料を残す（§10 の判定に使う） */
          run.gate = (res && res.qualityGate) || null;
          run.truncated = !!(run.gate && run.gate.truncated && !run.gate.recoveredAfterTruncation);
          if (!qn) {
            failed++;
            run.reason = "no_question";
            chat.log("warn", "大問" + p.number + " は作れませんでした。");
          } else {
            /* 返ってきた大問をこちらの見出しでまとめ直す（AI が勝手に分けても 1 つにする） */
            var qs = secs.reduce(function (a, x) { return a.concat(x.questions || []); }, []);
            /* 頼んだ数を大きく超えて作ってくることがある（実測: 4 問頼んで 48 問）。
               そのままだと試験が膨れ、1 問あたりの配点も潰れる。頼んだ数で切る。 */
            var over = 0;
            if (qs.length > p.count) { over = qs.length - p.count; qs = qs.slice(0, p.count); }
            /* 黙って捨てない。何問頼んで何問返って何問捨てたかを必ず残す。
               ここを残さないと「速くなった／減った」を数字で言えない。 */
            noteWaste(p.number, p.count, qn, over);
            got.push({
              name: p.title || (secs[0] && secs[0].name) || ("大問" + p.number),
              instructions: (secs[0] && secs[0].instructions) || "",
              score: p.points,
              questions: qs
            });
            var keep = {};
            qs.forEach(function (q) { keep[String(q.id)] = true; });
            keys = keys.concat((data.answerKey || []).filter(function (k) { return keep[String(k.id)]; }));
            run.made = qs.length;
            run.ok = qs.length === p.count;
            if (!run.ok) run.reason = "count_mismatch";
            chat.log("done", "大問" + p.number + " ができました（" + qs.length + " 問"
              + (over ? "／作りすぎた " + over + " 問は外しました" : "") + "）／ 合計 "
              + got.reduce(function (a, x) { return a + x.questions.length; }, 0) + " 問");
          }
          next();
        }).catch(function (e) {
          if (e && e.cancelled) { finishGenerate(got, keys, "止めました"); return; }
          failed++;
          run.reason = (e && e.code) || "failed";
          /* 資料から出題できる内容が取れていない。**先へ進まない**（§4）。
             一般知識で埋めない・問題数を減らさない・不完全な試験を作らない。 */
          if (e && e.code === "INSUFFICIENT_EVIDENCE") {
            st.gateStopped = {
              code: "INSUFFICIENT_EVIDENCE",
              section: p.number,
              message: e.userMessage || "資料から出題できる内容を十分に読み取れませんでした。"
            };
            chat.log("error", "INSUFFICIENT_EVIDENCE：大問" + p.number
              + " — 資料から出題できる教科内容を読み取れませんでした。");
            finishGenerate(got, keys, "INSUFFICIENT_EVIDENCE");
            return;
          }
          chat.log("warn", "大問" + p.number + " は" + ((e && e.userMessage) || "失敗しました")
            + (at < plan.length ? "。次へ進みます。" : "。"));
          next();
        });
      }
    }

    /* ── 資料なしで作るか ──────────────────────────────────────
       資料が 1 件も無いときは、資料限定にしようがない（根拠にする資料が無い）。
       これまでは、ここで「使用する資料がありません」と止めていた。
       指示だけで作りたい人には、止める理由がない。

       ただし設定は書き換えない。「資料だけを根拠にする」を勝手に外すと、
       次に資料を入れたときに黙って一般知識が混ざる。この回だけ切り替える。 */
    function usableSourceCount() {
      return (st.attachments || []).filter(function (a) { return a.included !== false; }).length;
    }
    function isPromptOnly() { return usableSourceCount() === 0; }
    /* 資料限定は「使える資料があるとき」だけ成り立つ。 */
    function sourceOnlyNow() {
      return !isPromptOnly() && !st.settings.allowExternalKnowledge;
    }
    /* 出典を必須にするのも同じ。無い出典は書かせない。 */
    function requireSourcesNow() {
      return !isPromptOnly() && !!st.settings.requireSources;
    }

    /* 自然文の除外指定を適用して、使う資料を決める（Phase 13 §1）。
       曖昧なときは勝手に除外せず、確認を出して blocked を返す。 */
    function applyExclusions() {
      var atts = st.attachments || [];
      var r = parseExclusions(st.instruction, atts);

      /* 画面で明示的に外されているものが最優先（手で決めたことを上書きしない） */
      atts.forEach(function (a) {
        if (a.included === false && !a.excludedReason) a.excludedReason = "user_unchecked";
        if (a.included == null) a.included = true;
      });
      r.exclude.forEach(function (x) {
        var a = atts.filter(function (y) { return y.id === x.attachmentId; })[0];
        if (!a || a.included === false) return;
        a.included = false;
        a.excludedReason = "instruction:" + x.term;
        chat.log("note", "「" + x.term + "」の指定により、資料「" + a.name + "」は使いません。");
      });

      if (r.ambiguous.length) {
        var amb = r.ambiguous[0];
        var msg = "「" + amb.term + "」がどの資料を指すのか判断できませんでした（候補: "
          + amb.candidates.join("・") + "）。使う資料を資料一覧で選んでから、もう一度お試しください。";
        st.aiError = msg;
        chat.log("warn", "除外指定が曖昧です：" + msg);
        st.step = st.blueprintText ? "blueprint" : "setup";
        render();
        app.alert({ title: "どの資料を外すか決められません", body: msg, okLabel: "資料を選ぶ" });
        return { blocked: true, included: [], attachments: [], excludedNames: [] };
      }

      var inc = atts.filter(function (a) { return a.included !== false; });
      var exc = atts.filter(function (a) { return a.included === false; });
      return {
        blocked: false,
        included: inc.map(function (a) { return a.id; }),
        /* 送るのは使う資料だけ。除外したものは送信自体しない。 */
        attachments: inc,
        excludedNames: exc.map(function (a) { return a.name; })
      };
    }

    /* どの大問を何問・何点で作るか。

       **数は利用者の設定が正。構成案（AI）からは題名とテーマだけを借りる。**
       以前は構成案の大問数・問題数・配点をそのまま採用していたため、
       「3 大問 9 問」と指定しても構成案が「4 大問 11 問」を返せばそれが通り、
       設定欄の値が黙って無視されていた（実測で確認）。 */
    function sectionPlan() {
      var s = st.settings;
      var n = Math.max(1, Math.min(20, s.sectionCount || 1));
      var total = Math.max(n, Number(s.questionCount) || n * 4);   /* 1 大問 1 問は要る */
      var counts = spreadCounts(total, n);

      /* 構成案は題名・テーマの供給元としてだけ使う。
         多ければ先頭から n 個だけ採り、少なければ空欄で埋める（大問数は減らさない）。 */
      var bp = (st.blueprint && st.blueprint.ok && Array.isArray(st.blueprint.sections))
        ? st.blueprint.sections : [];

      /* 出題形式もここで確定させる（Phase 13 §7）。
         優先順位: システム安全制限 → 画面の設定 → 自由記述の具体指定
                 → 自由記述の曖昧な希望 → 構成案
         自由記述（「正誤問題が全体の8割」）を無視しない。決まらなかったぶんだけ
         画面で選ばれている形式へ決定的に配る。 */
      var uiMix = (root.__vqMockTypeMix && typeof root.__vqMockTypeMix === "object")
        ? root.__vqMockTypeMix : mixFromSettings(s.types);
      var typeReq = parseTypeRequest(st.instruction);
      var resolved = resolveTypeMix(total, uiMix, typeReq);
      st.typePlan = resolved;
      var typeSeq = spreadTypes(total, resolved.mix);
      var seqAt = 0;

      var out = [];
      for (var i = 0; i < n; i++) {
        var b = bp[i] || null;
        /* 題名は必ず入れる。空にすると「何を問うか」が指示から消える。 */
        /* parseBlueprint が返すのは {number, title, points, count, notes[]}。
           題名以外の列（ねらい・出題内容など）は notes にまとまって入る。
           theme や instructions というフィールドは無いので notes から取る。 */
        var title = cleanText(b && b.title) || ("大問" + (i + 1));
        var theme = cleanText(b && Array.isArray(b.notes) ? b.notes.join(" / ") : "");
        out.push({
          number: i + 1,
          title: title,
          theme: theme.slice(0, 300),
          instructions: "",
          count: counts[i],
          /* この大問で作る形式の内訳。モデルはここに書かれた数を守るだけ。 */
          types: typeSeq.slice(seqAt, seqAt += counts[i]),
          /* 配点はここでは決めない。MB.finalize と SA.allocate が唯一の正。
             ここの値は「AI へ伝える目安」でしかない（合計は必ず満点に合わせ直される）。 */
          points: Math.round(s.totalPoints / n)
        });
      }
      return out;
    }

    /* 画面のチェック（settings.types）から形式の比率を作る。

       ── 2026-08-05 の作り直し ────────────────────────────────
       ここには「画面の 10 形式 → Bridge の粗い 4 語」の対応表があり、
       選んだ形式を **4 つへ潰していた**。
       穴埋め・並べ替え・組み合わせを選んでも、この 1 か所で短答や選択に化け、
       Preset Engine が使っている 133 形式の資産と分断されていた。

       いまは選ばれた形式 ID をそのまま持ち上げる。
       粗い 4 語が要る相手（古い Bridge schema）へは draftTypeOf() で落とす。
       サーバ側は正式 ID も粗い 4 語も受け取れる（契約 §3）。 */
    function mixFromSettings(types) {
      var m = {}, n = 0;
      Object.keys(types || {}).forEach(function (k) {
        if (!types[k]) return;
        m[k] = 1; n++;
      });
      return n ? m : null;
    }

    function sectionInstruction(base, p, done) {
      var lines = [base, ""];
      lines.push("【この回で作るもの】");
      lines.push("大問" + p.number + "「" + (p.title || ("大問" + p.number)) + "」 だけを作ってください。");
      /* 何を問うかは、その大問ぶんだけ渡す。
         以前は構成案の全文（約1,670字）を大問ごとに毎回送っていた。
         指示の 7 割が他の大問の話で、対象大問の内容は薄いままだった。 */
      if (p.theme) lines.push("この大問で扱うこと: " + p.theme);
      lines.push(p.instructions
        || ("この大問では「" + (p.theme || p.title || "資料の内容") + "」を中心に、"
            + "添付した資料に基づく問題を作ってください。"));
      lines.push("設問は **ちょうど " + p.count + " 問**です。"
        + (p.count - 1) + " 問以下も " + (p.count + 1) + " 問以上も禁止です。");
      /* 出題形式はこちらで決めてある。モデルに選ばせない
         （指定が無いと全問が記述式に寄ることがあった）。 */
      if (p.types && p.types.length) {
        var cnt = {};
        p.types.forEach(function (t) { cnt[t] = (cnt[t] || 0) + 1; });
        lines.push("出題形式の内訳は次のとおりです。**この数のとおりに作ってください**。");
        /* 形式 ID は正式 ID（レジストリ）で渡す。粗い 4 語しか受けられない相手のために
           落とし先も併記する（契約 §3。サーバはどちらでも縛れる）。 */
        sortTypes(Object.keys(cnt)).forEach(function (t) {
          var coarse = draftTypeOf(t);
          lines.push("・" + typeJa(t) + "（questionType: \"" + t + "\""
            + (coarse === t ? "" : " / type: \"" + coarse + "\"") + "）… " + cnt[t] + " 問");
        });
        lines.push("選択問題（multiple_choice）は選択肢を **4 つ**にしてください。");
        lines.push("正誤問題（true_false）は選択肢を「正しい」「誤っている」の **2 つ**にしてください。");
        lines.push("記述・短答（short_answer / descriptive）には選択肢を付けないでください。");
      }
      lines.push("この大問の配点は " + p.points + " 点です。");
      lines.push("**この大問だけ**を sections に 1 つ返してください。他の大問は作らないでください。");
      lines.push("JSON だけを返してください。前後に説明・見出し・コードフェンスを付けないでください。");
      if (done.length) {
        lines.push("");
        lines.push("すでに次の設問を作ってあります。**同じ内容の設問は作らないでください**。");
        var made = [];
        done.forEach(function (sec) {
          (sec.questions || []).forEach(function (q) { made.push(String(q.question || "").slice(0, 40)); });
        });
        made.slice(-12).forEach(function (t, i) { lines.push((i + 1) + ". " + t); });
      }
      return lines.join("\n");
    }

    /* 構成案から取り出した文字列の掃除。
       parseBlueprint は Markdown の表から取るので、太字の ** や見出しの #、
       コードフェンスがそのまま残る（実測: 題名が「…変遷**」になっていた）。
       本文で使う記号（・「」（）など）は消さない。 */
    function cleanText(v) {
      return String(v == null ? "" : v)
        .replace(/```+/g, " ")
        .replace(/\*\*/g, "")
        .replace(/^\s*#{1,6}\s*/, "")
        .replace(/^\s*[-*]\s+/, "")
        .replace(/[|]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    /* ══════════════════════════════════════════════════════════
       できあがった試験が、指定どおりの作りになっているかを **コードで**確かめる。

       配点をこちらで決めている以上、合っているかどうかも
       こちらが確かめなければならない。AI に計算し直させない。
       1 つでも合わなければ完成として扱わない（警告だけで通さない）。
       ══════════════════════════════════════════════════════════ */
    function checkStructure(spec) {
      var out = [];
      /* 直し方を出すために、何がどれだけずれているかを覚えておく。 */
      var countGap = null, pointsGap = null;
      if (!spec) return { ok: false, problems: ["試験のデータがありません。"] };
      var secs = spec.sections || [];
      var qs = secs.reduce(function (a, s) { return a.concat(s.questions || []); }, []);

      /* ① 設問数は ⑥ でまとめて見る（同じことを 2 回言わないため）。 */
      var wantQ = Number(st.settings.questionCount) || 0;

      /* ② 満点 */
      var wantP = Number(st.settings.totalPoints) || 0;
      var sumP = qs.reduce(function (a, q) { return a + (Number(q.points) || 0); }, 0);
      if (wantP > 0 && sumP !== wantP) {
        out.push("配点の合計が満点と違います（満点 " + wantP + " 点 / 実際 " + sumP + " 点）。");
        pointsGap = { want: wantP, got: sumP };
      }

      /* ③ 大問の配点＝その大問の設問の和 */
      secs.forEach(function (s) {
        var ss = (s.questions || []).reduce(function (a, q) { return a + (Number(q.points) || 0); }, 0);
        if (Number(s.points) !== ss) {
          out.push((s.title || "大問") + " の配点（" + s.points + " 点）が設問の合計（" + ss + " 点）と違います。");
          pointsGap = pointsGap || { want: wantP, got: sumP };
        }
      });

      /* ④ 0 点・マイナス点の設問 */
      var bad = qs.filter(function (q) { return !(Number(q.points) > 0); });
      if (bad.length) {
        out.push(bad.length + " 問に 0 点またはマイナスの配点が付いています（問"
          + bad.slice(0, 5).map(function (q) { return q.globalNumber; }).join("・") + "）。");
        pointsGap = pointsGap || { want: wantP, got: sumP };
      }

      /* ══════════════════════════════════════════════════════
         Phase 13 §10  欠落を「完成」にしない

         実測（2026-07-27）: 5 大問 20 問の指定で大問5 の生成が失敗し、
         4 大問 16 問になったのに完成扱いになった。理由は 3 つ:
           ・大問数を照合する項目が無かった
           ・questionCount が 0（おまかせ）だったので①が働かなかった
           ・SA.allocate が 16 問へ 100 点を配り直すので②③が通った
         数を残りへ配り直せば必ず通ってしまう。**作れた数ではなく
         頼んだ数と突き合わせる。**
         ══════════════════════════════════════════════════════ */

      /* ⑤ 大問数 */
      var wantS = Math.max(1, Math.min(20, Number(st.settings.sectionCount) || 1));
      if (secs.length !== wantS)
        out.push("大問の数が指定と違います（指定 " + wantS + " 大問 / 実際 " + secs.length + " 大問）。");

      /* ⑥ 問題数。questionCount が 0（おまかせ）でも、
            sectionPlan が決めた総数と突き合わせる（作れた数へ寄せない）。
            設問数の指定（①）とここは同じことなので、まとめて 1 回だけ言う。 */
      var plannedTotal = Math.max(wantS, wantQ || wantS * 4);
      if (qs.length !== plannedTotal) {
        out.push("問題数が指定と違います（指定 " + plannedTotal + " 問 / 実際 " + qs.length + " 問）。");
        countGap = { want: plannedTotal, got: qs.length, diff: plannedTotal - qs.length };
      }

      /* ⑦ 0 問の大問 */
      var emptySec = secs.filter(function (s) { return !(s.questions || []).length; });
      if (emptySec.length) out.push(emptySec.length + " つの大問に問題が 1 問も入っていません。");

      /* ⑧ 生成に失敗した大問 / length から回復できなかった大問 */
      var runs = st.sectionRuns || [];
      var failedRuns = runs.filter(function (r) { return !r.ok; });
      if (failedRuns.length)
        out.push(failedRuns.length + " つの大問を指定どおりに作れませんでした（大問"
          + failedRuns.map(function (r) { return r.number; }).join("・") + "）。");
      var stillTruncated = runs.filter(function (r) { return r.truncated; });
      if (stillTruncated.length)
        out.push(stillTruncated.length + " つの大問が出力の上限で途中終了したまま回復していません（大問"
          + stillTruncated.map(function (r) { return r.number; }).join("・") + "）。");

      /* ⑨ 資料限定なのに Evidence 未検証の設問 / ⑩ メタ問題 / ⑪ 未解決 high
         資料が無い回は資料限定になりようがない。無い資料との対応を問わない。 */
      if (sourceOnlyNow()) {
        var unver = 0, metaN = 0, highN = 0;
        runs.forEach(function (r) {
          if (!r.gate) return;
          metaN += r.gate.documentMetaQuestions || 0;
          highN += r.gate.unresolvedHigh || 0;
          if (r.gate.evidenceState !== "passed" && r.gate.evidenceState !== "revised") unver++;
        });
        if (unver) out.push(unver + " つの大問で、正解と資料の対応を確認できていません（資料限定）。");
        if (metaN) out.push(metaN + " 問が資料の体裁（問題番号・選択肢記号・配点など）を問う設問です。");
        if (highN) out.push("未解決の重大な指摘が " + highN + " 件残っています。");
      }

      /* ⑫ 資料不足で止まった */
      if (st.gateStopped)
        out.push(st.gateStopped.message);

      /* 直し方を出すための手がかり。problems の文言には手を触れない。 */
      return { ok: !out.length, problems: out, countGap: countGap, pointsGap: pointsGap,
               sectionCount: secs.length, questionCount: qs.length };
    }

    /* 大問 1 回ぶんの「頼んだ数 / 返ってきた数 / 捨てた数」を残す。
       画面のログと、計測から読める場所（window.__vqMockWaste）の両方へ。 */
    function noteWaste(section, asked, made, dropped) {
      if (dropped > 0)
        chat.log("note", "大問" + section + "：" + asked + " 問頼んで " + made
          + " 問返ってきたため、" + dropped + " 問は使いませんでした。");
      try {
        var w = root.__vqMockWaste || (root.__vqMockWaste = []);
        w.push({ section: section, asked: asked, made: made, dropped: dropped, at: Date.now() });
      } catch (e) {}
    }

    function draftOf(res) {
      return res.structured && res.structured.sections ? res.structured
        : (res.structured && res.structured.data ? res.structured.data : null);
    }

    function finishGenerate(sections, answerKey, note) {
      st.aiBusy = false;
      if (!sections.length) {
        st.aiError = note === "止めました"
          ? null
          : (st.gateStopped ? st.gateStopped.message
            : "AI の結果を試験として読み取れませんでした。条件を変えてもう一度お試しください。");
        chat.log(st.aiError ? "error" : "note", st.aiError || note);
        chat.end({ error: st.aiError });
        st.step = st.blueprintText ? "blueprint" : "setup";
        render();
        return;
      }
      /* 資料不足で止まったなら、途中までの結果を試験として組み立てない（§4）。
         不完全な試験を保存させない・紙面へ進ませない・Digital Exam へ渡さない。 */
      if (st.gateStopped) {
        st.aiError = st.gateStopped.message;
        st.structure = { ok: false, code: "INSUFFICIENT_EVIDENCE", problems: [st.gateStopped.message] };
        chat.log("error", "途中までの " + sections.length + " 大問は試験として組み立てません（資料不足）。");
        chat.end({ error: st.aiError });
        st.step = st.blueprintText ? "blueprint" : "setup";
        render();
        app.alert({
          title: "資料から出題できませんでした",
          html: "<p>" + esc(st.gateStopped.message) + "</p>"
            + "<ul><li>資料を追加する</li><li>文字が読み取れる資料に差し替える</li>"
            + "<li>「教材外の知識を使わない」を外す</li></ul>",
          okLabel: "設定に戻る"
        });
        return;
      }
      var n = sections.reduce(function (a, x) { return a + x.questions.length; }, 0);
      chat.log("done", "全部で " + n + " 問できました。内容を確認します。");
      chat.end({ note: note || null });
      buildSpec({ sections: sections, answerKey: answerKey });
    }

    function buildSpec(draft) {
      var spec = MB.fromDraft(draft, {
        title: st.settings.title || draft.title,
        subject: st.settings.subject, grade: st.settings.grade, audience: st.settings.audience,
        durationMinutes: st.settings.durationMinutes,
        totalPoints: st.settings.totalPoints,
        /* 資料なしで作ったものを "source-only" として保存すると、
           あとで「資料限定で作った試験」として扱われ、出典が無いことが不備になる。
           作り方をそのまま残す（open = 資料に依らない）。 */
        sourceMode: isPromptOnly() ? "open"
          : (st.settings.allowExternalKnowledge ? "source-preferred" : "source-only"),
        paper: paperFromSettings(),
        ownerId: ST.currentOwnerId()
      });
      /* 紙面レイアウトを選んでいるときだけ載せる。
         現在の形式のままなら layout は付けない（古い保存データと同じ形）。 */
      var lay = layoutFromSettings();
      if (lay) spec.layout = lay;

      /* 機械で直せる不備はここで直す（正誤の選択肢・正解の書き当て・採点基準）。
         直せないものは audit に残し、画面で伝える。 */
      var rep = MB.repairSpec(spec, { requireSources: requireSourcesNow() });
      st.repairFixed = rep.fixed;
      st.audit = rep.audit;

      var fin = MB.finalize(rep.spec);
      st.spec = fin.spec;
      st.finalizeResult = fin;
      st.warnings = st.warnings.concat(spec.warnings || []);
      st.dirty = true;
      st.step = "review"; st.tab = "questions";
      st.selectedQ = firstQuestionId();

      /* 配点はこちらが決めているので、決め終わったあとに **コードで**突き合わせる。
         AI に合計を計算し直させない。合わないなら完成として扱わない。 */
      st.structure = checkStructure(fin.spec);
      render();

      if (rep.fixed.length) app.toast(rep.fixed.length + " 件の不備を自動で直しました。", "info", 6000);
      if (!st.structure.ok) {
        st.structure.problems.forEach(function (m) { chat.log("error", m); st.warnings.push(m); });
        app.alert({
          title: "試験の作りが指定と合っていません",
          html: "<p>次の点が合っていません。保存も紙面も作れますが、"
            + "指定した作りにはなっていません。</p><ul>"
            + st.structure.problems.map(function (m) { return "<li>" + esc(m) + "</li>"; }).join("")
            + "</ul>",
          okLabel: "確認する"
        });
      } else if (!fin.ok) {
        var errs = V.errorsOf(fin.issues);
        /* 保存も紙面も止めない。だから「保存できません」とは言わない。
           言うべきは「まだ試験として成立していない」ということ。 */
        app.alert({
          title: "要修正が " + errs.length + " 件あります",
          html: "<p>このまま保存も紙面も作れますが、試験としてはまだ成立しません。</p><ul>"
            + errs.slice(0, 6).map(function (e) { return "<li>" + esc(e.message) + "</li>"; }).join("") + "</ul>",
          okLabel: "確認する"
        });
      } else if (fin.scoreChanged && fin.scoreChanged.length) {
        app.toast("配点を " + st.settings.totalPoints + " 点へ調整しました（" + fin.scoreChanged.length + " 問）。", "info", 6000);
      }
    }

    /* ══════════════════════════════════════════════════════════
       2.5) 足りない項目を AI に補ってもらう

       解説・出典・正解が抜けた設問だけを渡し、抜けた項目だけを書かせる。
       作り直しではないので速く、問題文は変わらない。
       ══════════════════════════════════════════════════════════ */
    function runRepair() {
      if (st.repairBusy || !st.spec) return;
      refreshAudit();
      if (!st.audit || !st.audit.items.length) { app.toast("補うところはありません。", "info"); return; }

      var items = st.audit.items.slice(0, 30).map(function (it) {
        var q = questionById(it.questionId);
        return {
          id: it.questionId, type: q.type, typeLabel: typeJa(q.type),
          prompt: q.prompt,
          choices: (q.choices || []).map(function (c) { return c.text; }),
          answer: (q.choices || []).filter(function (c) { return c.isCorrect; }).map(function (c) { return c.text; })[0]
            || q.correctAnswer || "",
          needsLabel: it.needs.map(function (n) { return MB.NEED_LABEL[n] || n; })
        };
      });

      st.repairBusy = true;
      chat.begin("足りない項目を補って");
      chat.etaStart(1, "足りない項目を補っています");
      render();
      chat.etaRound();
      chat.log("step", items.length + " 問の足りない項目を埋めています（問題文は変えません）");

      AI.repairQuestions({
        items: items,
        attachments: st.attachments,
        sourceOnly: sourceOnlyNow(),
        skipDocumentAnalysis: false,
        onActivity: function (a) { activity.set(a); },
        onMetrics: function (m) { actPanel.attachSourceBash(m); },
        onToken: function (t, all) { chat.setStream(all); },
        onWarning: function (m) { chat.log("warn", m); }
      }).then(function (res) {
        chat.etaDone();
        st.repairBusy = false;
        var data = res.structured && res.structured.questions ? res.structured
                 : (res.structured && res.structured.data ? res.structured.data : null);
        var qs = data && Array.isArray(data.questions) ? data.questions : [];
        if (!qs.length) {
          chat.log("warn", "補える内容が返りませんでした。");
          chat.end({}); render(); return;
        }
        var m = MB.mergeRepairs(st.spec, qs, { requireSources: requireSourcesNow() });
        st.spec = m.spec;
        st.repairFilled = m.filled;
        st.audit = m.audit;
        var filled = m.filled.reduce(function (a, f) { return a + f.filled.length; }, 0);
        chat.log(filled ? "done" : "warn", filled
          ? filled + " 件を埋めました（" + m.filled.length + " 問）／ 残りの不備 " + m.audit.total + " 問"
          : "埋められる項目はありませんでした。");
        chat.end({});
        revalidate();
        st.dirty = true;
        render();
      }).catch(function (e) {
        st.repairBusy = false;
        if (e && e.cancelled) { chat.log("note", "止めました"); chat.end({}); render(); return; }
        chat.end({ error: (e && e.userMessage) || "補完に失敗しました。" });
        render();
      });
    }

    function refreshAudit() {
      if (!st.spec) { st.audit = null; return; }
      st.audit = MB.auditSpec(st.spec, { requireSources: requireSourcesNow() });
    }

    /* 直らない設問を試験から外す。配点は残りへ割り振り直す。
       解答欄の作れない設問を受験者に出すより、外して伝えるほうがよい。 */
    function dropBroken(ids) {
      if (!ids.length) return;
      app.confirm({
        title: ids.length + " 問を試験から外しますか",
        body: "解答欄を作れない、または採点できない設問です。外したぶんの配点は残りの設問へ割り振り直します。",
        okLabel: "外す", danger: true
      }).then(function (yes) {
        if (!yes) return;
        var d = MB.dropQuestions(st.spec, ids);
        var fin = MB.finalize(d.spec);
        st.spec = fin.spec;
        st.finalizeResult = fin;
        st.selectedQ = firstQuestionId();
        /* 外したのは利用者の判断。指定の数もそれに合わせる。
           合わせないと、外した直後に「問題数が指定と違います」で
           紙面も保存も止まる（実際にそうなっていた）。 */
        var qNow = st.spec.sections.reduce(function (a, x) { return a + x.questions.length; }, 0);
        if (Number(st.settings.questionCount) > 0) st.settings.questionCount = qNow;
        st.settings.sectionCount = st.spec.sections.length;
        acceptSectionRuns("dropped_by_user");
        st.structure = checkStructure(st.spec);
        chat.log("note", "外したぶんに合わせて、指定を " + qNow + " 問（大問 "
          + st.spec.sections.length + " つ）に直しました。");
        refreshAudit();
        st.dirty = true;
        render();
        app.toast(d.removed.length + " 問を外し、配点を割り振り直しました。", "success", 6000);
      });
    }

    function firstQuestionId() {
      if (!st.spec) return null;
      for (var i = 0; i < st.spec.sections.length; i++)
        if (st.spec.sections[i].questions.length) return st.spec.sections[i].questions[0].id;
      return null;
    }
    function allQuestions() {
      if (!st.spec) return [];
      return st.spec.sections.reduce(function (a, s) { return a.concat(s.questions); }, []);
    }
    function questionById(id) {
      return allQuestions().find(function (q) { return q.id === id; }) || null;
    }
    function revalidate() {
      if (!st.spec) return;
      st.finalizeResult = { ok: false, issues: V.validateMockSpecForSave(st.spec), spec: st.spec, validation: null };
      st.finalizeResult.ok = V.canSave(st.finalizeResult.issues);
      /* 編集や補完で問題数・配点が動くので、そのたびに作りを確かめ直す。 */
      st.structure = checkStructure(st.spec);
    }

    /* 作りが指定と合っていないなら、そこから先へ進ませない。
       完成扱い・保存・紙面・受験のすべての入口でここを通す。 */
    /* ══════════════════════════════════════════════════════════
       作りが指定と合っていないときの出し方

       ・ここで止めるのは正しい（数が合わないまま紙にすると面倒になる）。
         ただし「直してください」で終わらせず、直し方をその場に出す。
       ・直せるものは 2 種類。
         a) 配点のずれ  … 配点を計算し直す（AI 不要・決定論）
         b) 問題数のずれ… 足りないぶんを作る（AI）／指定を実際の数に合わせる（即時）
       ・直せないものは、これまでどおり説明だけ出す。
       ══════════════════════════════════════════════════════════ */
    function structureFixes() {
      var st2 = st.structure || {};
      var fixes = [];
      if (st2.pointsGap) {
        fixes.push({ id: "points", label: "配点を計算し直す",
                     note: "満点 " + st2.pointsGap.want + " 点になるように配り直します。問題文は変わりません。" });
      }
      if (st2.countGap && st2.countGap.diff > 0) {
        fixes.push({ id: "generate", label: "不足 " + st2.countGap.diff + " 問を作る",
                     note: "足りないぶんだけ AI で作り、いまある問題は変えません。" });
        fixes.push({ id: "accept", label: "指定を " + st2.countGap.got + " 問に合わせる",
                     note: "いまある " + st2.countGap.got + " 問のままで進みます。AI は使いません。" });
      } else if (st2.countGap && st2.countGap.diff < 0) {
        fixes.push({ id: "accept", label: "指定を " + st2.countGap.got + " 問に合わせる",
                     note: "多いぶんは残したまま、指定の数を実際に合わせます。" });
      }
      return fixes;
    }

    /* ── 問題数が足りないときの選択肢 ────────────────────────
       「81 問しか作れませんでした」という警告だけで終わらせない。
       指定数・作れる数・足りない数・理由を並べて出し、
       次の一手（この数で確定／出題形式を広げる／資料を追加／やめる）を選ばせる。

       「出題形式を広げる」でも資料の外へは出ない。
       出題角度は資料の文面から使えるものだけを選ぶ作りなので、
       形式が増えると同じ論点から違う問い方ができるようになるだけで、
       資料外の知識や単純な言い換えは足されない。 */
    function showShortfall(sf, onRedesign) {
      if (!sf || !VQ2.shortfall) return false;
      var d = VQ2.shortfall.describe(sf);
      if (!d.missing) return false;
      st.shortfall = d;
      var rows = d.rows.map(function (r) {
        return '<div style="display:flex;justify-content:space-between;gap:12px;padding:4px 0">'
          + '<span class="vq2-hint">' + esc(r.label) + "</span>"
          + "<strong>" + esc(String(r.value)) + "</strong></div>";
      }).join("");
      app.dialog({
        title: d.title,
        html: "<p>" + esc(d.why) + "</p>"
          + '<div style="margin:12px 0;padding:10px 12px;border-radius:8px;background:var(--vq-surface-2,#f5f5f5)">'
          + rows + "</div>"
          + '<p class="vq2-hint">' + esc(d.hint) + "</p>"
          + '<div class="vq2-label" style="margin:12px 0 6px">どうしますか</div>'
          + '<div style="display:flex;flex-direction:column;gap:8px">'
          + d.actions.map(function (a) {
              return '<button type="button" class="vq2-btn is-full' + (a.primary ? " is-primary" : "")
                + '" data-sf="' + esc(a.id) + '"'
                + ' style="justify-content:flex-start;text-align:left">' + esc(a.label) + "</button>";
            }).join("")
          + "</div>",
        okLabel: null, cancelLabel: "閉じる",
        onMount: function (root2) {
          U.on(root2, "click", "[data-sf]", function (e, t) {
            var id = t.getAttribute("data-sf");
            app.closeDialog && app.closeDialog();
            if (id === "accept") {
              chat.log("done", d.available + " 問で確定しました");
              st.shortfall = null; render(); return;
            }
            if (id === "widen") {
              var next = VQ2.shortfall.widenTypes(st.settings.questionTypes || []);
              if (!next) { app.toast("これ以上広げられる出題形式がありません。", "info"); return; }
              st.settings.questionTypes = next;
              chat.log("step", "出題形式を広げて、足りない " + d.missing + " 問だけを作り直します");
              if (onRedesign) onRedesign(d.missing, next);
              return;
            }
            if (id === "add") {
              chat.log("note", "資料を追加してください");
              if (typeof pickMore === "function") pickMore();
              else app.toast("資料を追加してから、もう一度お試しください。", "info");
              return;
            }
            chat.log("note", "やめました");
            st.shortfall = null; render();
          });
        }
      });
      return true;
    }

    /* title は完成した日本語で受け取る（"紙面を作る" + "できません" だと
       「紙面を作るできません」になる。実際にそう出ていた）。
       after は、直ったあとに続けたい操作。 */
    function blockedByStructure(title, after) {
      if (!st.structure || st.structure.ok) return false;
      var fixes = structureFixes();
      var probs = st.structure.problems || [];
      app.dialog({
        title: title,
        html: "<p>試験の作りが指定と合っていません。</p><ul>"
          + probs.map(function (m) { return "<li>" + esc(m) + "</li>"; }).join("")
          + "</ul>"
          + (fixes.length
              ? '<div class="vq2-label" style="margin:12px 0 6px">直し方</div>'
                + '<div style="display:flex;flex-direction:column;gap:8px">'
                + fixes.map(function (f) {
                    return '<button type="button" class="vq2-btn is-full" data-fix="' + esc(f.id) + '"'
                      + ' style="justify-content:flex-start;text-align:left;height:auto;padding:10px 12px">'
                      + "<span><span style=\"font-weight:600\">" + esc(f.label) + "</span>"
                      + '<span class="vq2-hint" style="display:block;margin-top:2px">' + esc(f.note)
                      + "</span></span></button>";
                  }).join("")
                + "</div>"
              : '<div class="vq2-hint" style="margin-top:10px">'
                + "この内容は自動では直せません。設定を見直すか、作り直してください。</div>"),
        okLabel: "閉じる",
        cancelLabel: null,
        onOpen: function (card) {
          U.on(card, "click", "[data-fix]", function (e, t) {
            var id = t.getAttribute("data-fix");
            /* ダイアログを閉じてから直す（閉じ忘れて二重に開かないように） */
            var closeBtn = card.querySelector('[data-act="dlg-o"]');
            if (closeBtn) closeBtn.click();
            applyStructureFix(id, after);
          });
        }
      });
      return true;
    }

    /* 直す。どれも「元へ戻せる」形にしてから行う。 */
    function applyStructureFix(id, after) {
      if (id === "points") {
        /* 配点の配り直し。AI は使わない。SA.allocate が唯一の決定元。 */
        var alloc = SA.allocate(st.spec, { targetTotal: Number(st.settings.totalPoints) || st.spec.totalPoints });
        if (!alloc || !alloc.spec) { app.toast("配点を直せませんでした。", "error"); return; }
        st.spec = alloc.spec;
        st.dirty = true;
        st.structure = checkStructure(st.spec);
        revalidate();
        render();
        app.toast(st.structure.ok ? "配点を直しました。" : "配点を直しました（ほかの点はまだ残っています）。",
                  st.structure.ok ? "success" : "warning");
        if (st.structure.ok && typeof after === "function") after();
        return;
      }
      if (id === "accept") {
        /* 指定のほうを実際に合わせる。問題は 1 問も変えない。
           数だけ直しても、大問数（⑤）と生成失敗の記録（⑧）が残っていると
           また止まるので、まとめて「この結果を受け入れた」ことにする。 */
        var n = st.structure.countGap.got;
        st.settings.questionCount = n;
        st.settings.sectionCount = st.spec.sections.length;
        acceptSectionRuns("accepted_by_user");
        st.structure = checkStructure(st.spec);
        render();
        app.toast("指定を " + n + " 問に合わせました。", "success");
        if (st.structure.ok && typeof after === "function") after();
        return;
      }
      if (id === "generate") {
        backfillMissingQuestions(after);
      }
    }

    /* 生成の記録（sectionRuns）を「受け入れた」ことにする。
       利用者が結果を確認して受け入れたのに、⑧の記録が失敗のままだと
       いつまでも門番に止められる。理由は必ず残す（黙って消さない）。 */
    function acceptSectionRuns(reason) {
      (st.sectionRuns || []).forEach(function (r) {
        if (!r.ok) { r.ok = true; r.reason = reason; }
        r.truncated = false;
      });
    }

    /* ── 足りない問題だけを作り足す ──────────────────────────
       ・いまある問題は 1 問も変えない。足りない大問へ足すだけ。
       ・どの大問が足りないかは、構成案（sectionPlan）と実際を突き合わせて決める。
       ・作れなかったときは、いまの試験をそのまま残す。 */
    function shortSections() {
      var plan = sectionPlan();
      var secs = (st.spec && st.spec.sections) || [];
      var out = [];
      plan.forEach(function (p, i) {
        var sec = secs[i];
        if (!sec) return;
        var have = (sec.questions || []).length;
        if (have < p.count) out.push({ index: i, plan: p, section: sec, need: p.count - have });
      });
      /* 構成案どおりでも総数が足りないときは、いちばん問題の少ない大問へ足す。 */
      if (!out.length && st.structure && st.structure.countGap && st.structure.countGap.diff > 0) {
        var min = 0;
        secs.forEach(function (x, i) {
          if ((x.questions || []).length < (secs[min].questions || []).length) min = i;
        });
        if (secs[min]) out.push({ index: min, plan: plan[min] || { number: min + 1, count: 1, points: 0 },
                                  section: secs[min], need: st.structure.countGap.diff });
      }
      return out;
    }

    function backfillMissingQuestions(after) {
      if (st.aiBusy) { app.toast("いま別の処理が動いています。", "warning"); return; }
      var targets = shortSections();
      if (!targets.length) { app.toast("どの大問へ足せばよいか分かりませんでした。", "warning"); return; }

      /* 生成のときと同じ材料をそろえる（資料の絞り込みと指示文の土台）。 */
      var sel = applyExclusions();
      var base = buildInstruction();
      st.aiBusy = true; st.aiError = null;
      chat.begin("足りない問題を作って");
      chat.log("step", targets.reduce(function (a, t) { return a + t.need; }, 0)
        + " 問だけ作り足します（いまある問題は変えません）");
      render();

      var at = 0, added = 0;
      nextTarget();

      function nextTarget() {
        if (at >= targets.length) { doneBackfill(); return; }
        var t = targets[at++];
        chat.log("step", "大問" + (t.plan.number || t.index + 1) + " へ " + t.need + " 問を足しています");
        AI.generateMock({
          instruction: [
            base, "",
            "【この回で作るもの】",
            "大問" + (t.plan.number || t.index + 1) + "「" + (t.section.title || "") + "」 に足りない "
              + t.need + " 問だけを作ってください。",
            "すでにある問題と同じ論点を出さないでください。",
            "",
            "【すでにある問題】",
            (t.section.questions || []).map(function (q, i) {
              return (i + 1) + ". " + String(q.prompt || "").slice(0, 60);
            }).join("\n")
          ].join("\n"),
          attachments: sel.attachments,
          includedAttachmentIds: sel.included,
          retrievalQuery: buildRetrievalQuery(
            [st.instruction, st.settings.subject, st.settings.title, t.section.title],
            sel.excludedNames),
          requireEvidence: sourceOnlyNow(),
          sourceOnly: sourceOnlyNow(),
          promptOnly: isPromptOnly(),
          count: t.need,
          sectionCount: 1,
          skipDocumentAnalysis: at > 1,
          onActivity: function (items, ev) { activity.set(items); noteActivityEvent(ev); },
          onMetrics: function (m) { actPanel.attachSourceBash(m); },
          onToken: function (tk, all) { st.aiText = all; chat.setStream(all); },
          onWarning: function (m) { chat.log("warn", m); },
          /* 頼んだ数に届かないと分かった時点で受け取る（警告文とは別） */
          onShortfall: function (sf) { st.pendingShortfall = sf; }
        }).then(function (res) {
          if (res && res.shortfall) st.pendingShortfall = res.shortfall;
          var d = res.structured && (res.structured.sections ? res.structured
                : (res.structured.data || null));
          var got = [];
          if (d && Array.isArray(d.sections)) {
            d.sections.forEach(function (x) { got = got.concat(x.questions || []); });
          } else if (d && Array.isArray(d.questions)) got = d.questions;
          /* 頼んだ数より多ければ切る。既存と同じ問題文は捨てる。 */
          var seen = {};
          (t.section.questions || []).forEach(function (q) {
            seen[String(q.prompt || "").replace(/\s+/g, "")] = true;
          });
          var fresh = got.filter(function (q) {
            var k = String(q.question || q.prompt || "").replace(/\s+/g, "");
            if (!k || seen[k]) return false;
            seen[k] = true;
            return true;
          }).slice(0, t.need);
          if (fresh.length) {
            t.section.questions = (t.section.questions || []).concat(fresh.map(function (q) {
              return Object.assign({}, q, { prompt: q.prompt || q.question });
            }));
            added += fresh.length;
            chat.log("done", fresh.length + " 問を足しました");
          } else {
            chat.log("warn", "大問" + (t.plan.number || t.index + 1) + " へは足せませんでした");
          }
          nextTarget();
        }).catch(function (e) {
          chat.log("error", (e && (e.userMessage || e.message)) || "作り足せませんでした");
          nextTarget();
        });
      }

      /* 出題形式を広げて、足りない分だけを作り直す。
         できている問題は触らない（作り直しは不足分だけ）。 */
      function runBackfillFromShortfall() {
        st.shortfall = null;
        var plan = (typeof R !== "undefined" && R.planBackfill)
          ? R.planBackfill(st.spec || st.preset) : null;
        if (plan && plan.count) { runBackfill(plan, "append"); return; }
        /* 補充の計画が立たないときは、いまの数で確定させる（数合わせをしない） */
        chat.log("warn", "足りない分の作り直しを組めませんでした。いまの問題数で確定します。");
        render();
      }

      function doneBackfill() {
        st.aiBusy = false;
        chat.end({});
        /* 頼んだ数に届かなかったなら、警告で終わらせず選択肢を出す。
           「出題形式を広げる」を選ばれたら、足りない分だけを作り直す
           （すでにできている問題には触らない）。 */
        if (st.pendingShortfall) {
          var sf = st.pendingShortfall;
          st.pendingShortfall = null;
          if (showShortfall(sf, function () { runBackfillFromShortfall(); })) { render(); return; }
        }
        if (!added) {
          render();
          app.alert({ title: "作り足せませんでした",
                      body: "いまの試験はそのまま残しています。もう一度お試しください。" });
          return;
        }
        /* 足したぶんを含めて、番号・配点・検証をやり直す。
           生成の記録も実際の数で更新する。ここを忘れると、
           足りていたのに⑧（失敗の記録）で止まり続ける。 */
        (st.sectionRuns || []).forEach(function (r, i) {
          var sec = st.spec.sections[i];
          if (!sec) return;
          r.made = (sec.questions || []).length;
          if (r.made >= r.asked) { r.ok = true; r.reason = null; r.truncated = false; }
        });
        buildSpec({ sections: st.spec.sections, answerKey: null });
        app.toast(added + " 問を足しました。", "success");
        if (st.structure && st.structure.ok && typeof after === "function") after();
      }
    }

    /* ══════════════════════════════════════════════════════════
       3) 紙面を作る（組み込みレンダラ → 検査 → 調整 → 再描画）
       ══════════════════════════════════════════════════════════ */
    function buildArtifacts() {
      if (!st.spec) return;
      revalidate();
      /* 要修正があっても紙面は作る。
         「解消してから」と断ると、どこが変なのかを紙で見て確かめられない。
         正解が入っていない設問も、問題用紙の上では空欄として成立する。
         残っている指摘は紙面の画面に出し続ける（下の paperIssueNotice）。 */
      st.buildIssues = ((st.finalizeResult && st.finalizeResult.issues) || [])
        .filter(function (x) { return x.severity === "error"; });
      st.buildStructure = (st.structure && !st.structure.ok && st.structure.problems) || [];
      st.step = "artifacts"; st.tab = "paper";
      st.compileRounds = 0;
      st.inspection = null;
      render();
      compileLoop();
    }

    function compileLoop() {
      var maxRounds = MAX_FIX_ROUNDS.normal;
      var host = app.root.querySelector("#pdfHost");
      if (!host) return;

      st.plan = L.buildPlan(st.spec, { tuning: st.tuning });
      var html = R.buildHtml(st.spec, st.plan, { bookletId: "question-booklet" });

      var iframe = host.querySelector("iframe");
      if (!iframe) {
        iframe = doc.createElement("iframe");
        iframe.setAttribute("title", "紙面プレビュー");
        iframe.style.cssText = "width:100%;height:100%;border:0;background:#eceaf3";
        host.appendChild(iframe);
      }

      R.renderToIframe(iframe, html).then(function () {
        var res = INS.inspect(iframe, st.spec, st.plan);
        st.inspection = res;
        st.compileRounds++;

        var fixable = INS.fixable(res.issues || []).filter(function (i) { return i.severity !== "low"; });
        if (fixable.length && st.compileRounds < maxRounds) {
          var s = INS.suggestTuning(fixable, st.tuning);
          /* 調整で何も変わらないなら打ち切る（無限ループにしない） */
          if (JSON.stringify(s.tuning) === JSON.stringify(st.tuning)) { finishCompile(res); return; }
          st.tuning = s.tuning;
          st.fixNotes = (st.fixNotes || []).concat(s.applied);
          renderArtifactsPanel();
          compileLoop();
          return;
        }
        finishCompile(res);
      });
    }

    function finishCompile(res) {
      st.manifest = L.buildManifest(st.spec, st.plan, res.measurements);
      st.artifacts = R.buildArtifacts(st.spec, st.plan, {
        manifest: st.manifest,
        validationReport: {
          mockId: st.spec.id, generatedAt: S.nowIso(),
          schema: st.finalizeResult ? st.finalizeResult.issues : [],
          layout: res.issues || [],
          compileRounds: st.compileRounds,
          appliedFixes: st.fixNotes || []
        }
      });
      /* MockSpec に使用したテンプレート版を残す（再生成で紙面が壊れないように）。
         paper が入っていない試験もある（要修正のまま紙面を作れるようにしたので、
         ここまで来る道ができた）。無ければ既定を入れてから書く。
         実測 2026-08-04: paper 未設定の試験で
         「Cannot set properties of undefined」で紙面作成が落ちた。 */
      if (!st.spec.paper) st.spec.paper = S.defaultPaper();
      st.spec.paper.templateVersion = st.plan.templateVersion;
      st.spec.layoutManifest = st.manifest;
      renderArtifactsPanel();
    }

    /* ══════════════════════════════════════════════════════════
       4) 保存・受験・品質分析
       ══════════════════════════════════════════════════════════ */
    /* 要修正があっても保存する。

       これまでは指摘が 1 件でもあると保存を断っていた。
       作りかけを置いておけず、直している途中で閉じると消えてしまう
       （試験は 1 回で完成しない。ここで止めるのは作る人の邪魔になる）。

       ただし **指摘を消して通すのではない。**
       ・何が残っているかを保存物へ一緒に残す（issues / requiresReview）
       ・保存したことと、いくつ残っているかを同時に伝える
       黙って「保存しました」とだけ言うと、直したつもりで終わってしまう。 */
    function saveMock() {
      revalidate();
      var issues = (st.finalizeResult && st.finalizeResult.issues) || [];
      var errs = issues.filter(function (x) { return x.severity === "error"; });
      var structProbs = (st.structure && !st.structure.ok && st.structure.problems) || [];
      var rec = ST.mocks.put({
        id: st.spec.id, kind: "mock", title: st.spec.title,
        spec: st.spec, manifest: st.manifest || null,
        createdAt: st.spec.createdAt,
        /* 残っている指摘。あとから開いたときに、どこが未完成か分かるように。 */
        requiresReview: errs.length > 0 || structProbs.length > 0,
        openIssues: errs.slice(0, 50).map(function (x) {
          return { code: x.code || "", path: x.path || "", message: x.message || "" };
        }),
        structureProblems: structProbs.slice(0, 20)
      });
      if (!rec.ok) { app.alert({ title: "保存できません", body: rec.message || "保存に失敗しました。" }); return null; }
      st.dirty = false;
      if (errs.length || structProbs.length) {
        app.toast("要修正 " + (errs.length + structProbs.length) + " 件を残したまま保存しました。", "warning");
      } else {
        app.toast("試験を保存しました。", "success");
      }
      return rec.record;
    }

    function startExam() {
      var saved = saveMock();
      if (!saved) return;
      if (!VQ2.flags.isOn("quickMockDigitalExam")) {
        app.alert({ title: "デジタル受験は無効です", body: "設定で「デジタル受験」を有効にしてください。" });
        return;
      }
      app.close("start-exam");
      VQ2.examWorkspace.open({ spec: st.spec, manifest: st.manifest, plan: st.plan });
    }

    function runQuality() {
      if (st.qualityBusy || !st.spec) return;
      st.qualityBusy = true; render();
      var qs = allQuestions();
      AI.reviewQuality({
        payload: {
          title: st.spec.title, subject: st.spec.subject,
          durationMinutes: st.spec.durationMinutes, totalPoints: st.spec.totalPoints,
          sampleSize: 0,
          sectionIds: st.spec.sections.map(function (s) { return s.id; }),
          difficultyDistribution: dist(qs, "difficulty"),
          topicDistribution: dist(qs, "topic"),
          typeDistribution: dist(qs, "type"),
          questions: qs.map(function (q) {
            return {
              id: q.id, question: q.prompt, points: q.points, type: q.type,
              difficulty: q.difficulty, topic: q.topic,
              sourceCount: (q.sourceReferences || []).length,
              rubricItems: q.scoringRubric ? q.scoringRubric.items.length : 0,
              answerLines: bindingOf(q.answerBindingId) ? bindingOf(q.answerBindingId).answerLines : null
            };
          })
        },
        onActivity: function (items, ev) { activity.set(items); noteActivityEvent(ev); },
        onWarning: function (m) { app.toast(m, "warning", 6000); }
      }).then(function (res) {
        st.qualityBusy = false;
        st.quality = res.structured && res.structured.data ? res.structured.data : null;
        render();
      }).catch(function (e) {
        st.qualityBusy = false;
        if (!(e && e.cancelled)) app.toast(e.userMessage || "品質の確認に失敗しました。", "error");
        render();
      });
    }
    function bindingOf(id) { return (st.spec.answerBindings || []).find(function (b) { return b.id === id; }); }
    function dist(qs, key) {
      var m = {};
      qs.forEach(function (q) { var k = q[key] || "（未設定）"; m[k] = (m[k] || 0) + 1; });
      return Object.keys(m).map(function (k) { return (DIFF_JA[k] || typeJa(k)) + " " + m[k] + " 問"; }).join(" / ");
    }

    /* 品質分析の提案を Draft へ差分適用する */
    function applyQualityFinding(f) {
      if (!f.questionId || typeof f.suggestedPoints !== "number") return;
      var q = questionById(f.questionId);
      if (!q) return;
      var before = q.points;
      q.points = f.suggestedPoints;
      var alloc = SA.allocate(st.spec, { targetTotal: st.spec.totalPoints });
      if (!alloc.ok) {
        q.points = before;
        app.alert({ title: "この変更は適用できません",
                    body: alloc.issues.map(function (i) { return i.message; })[0] || "配点の合計が合わなくなります。" });
        return;
      }
      st.spec = alloc.spec;
      st.dirty = true;
      revalidate();
      render();
      app.toast("問" + q.number + " の配点を " + before + " → " + f.suggestedPoints + " 点に変更し、全体を調整しました。", "success", 6000);
    }

    /* ══════════════════════════════════════════════════════════
       描画
       ══════════════════════════════════════════════════════════ */
    /* ══════════════════════════════════════════════════════════
       画面の骨格

         左   ＝ 何を作ってほしいか（依頼・条件・紙面・資料・実行）
         中央 ＝ できたもの（構成案 / 問題 / 紙面 / 検証 / 成果物）
         右   ＝ AI アクティビティ（進行・Bash・追加指示）

       進み具合（st.step）は今までどおり流れを決める。
       中央のタブ（st.tab）は「いまどれを見るか」だけを決める。
       ══════════════════════════════════════════════════════════ */
    /* 描き直しても、見ていた場所へ戻す（Enter で先頭へ飛ばさない）。 */
    var qmScroll = null;
    function qmScrollers() { return ["#wsMainScroll", ".vq2-ws-left .vq2-pane-b", ".vq2-ws-side .vq2-pane-b"]; }
    function qmRemember() {
      if (!qmScroll) qmScroll = Object.create(null);
      qmScrollers().forEach(function (sel) {
        var el = app.root.querySelector(sel);
        if (el && el.scrollTop > 0) qmScroll[sel] = el.scrollTop;
      });
    }
    function qmRestore() {
      if (!qmScroll) return;
      qmScrollers().forEach(function (sel) {
        var y = qmScroll[sel];
        if (!y) return;
        var el = app.root.querySelector(sel);
        if (!el) return;
        el.scrollTop = y;
        if (root.requestAnimationFrame) root.requestAnimationFrame(function () {
          var e2 = app.root.querySelector(sel);
          if (e2 && Math.abs(e2.scrollTop - y) > 2) e2.scrollTop = y;
        });
      });
    }

    function render() {
      qmRemember();
      var mobile = app.isMobile();
      app.root.innerHTML =
        topHtml()
        + '<div class="vq2-body">'
        + WS.layout({
            isMobile: mobile,
            mobile: st.pane,
            /* 作っている間は開けておく（何が起きているか見えないと不安になる）。 */
            sideOpen: st.sideOpen || st.aiBusy || st.repairBusy || st.qualityBusy,
            left: leftHtml(),
            tabs: centerTabsHtml(),
            main: centerHtml(),
            /* AI の欄も、中身の長さで広がらないようにする（§52・下の FIT と同じ理由） */
            side: '<div id="qmAi" class="vq2-actwrap" style="width:0;min-width:100%"></div>'
          })
        + "</div>"
        + (mobile ? mobileFootHtml() : "");
      wire();
      qmRestore();
    }
    /* ══════════════════════════════════════════════════════════
       狭い画面の下は **「戻る／いまの段階／次へ」** にする。

       前は「指示 / 内容 / AI」の 3 つの切り替えだけだった。
       どこを見るかは選べても、**次に何をすればよいか**は分からなかった。
       流れのある画面なので、下は進む場所にする。
       見る場所の切り替え（指示・内容・AI）は上の帯へ移した。
       ══════════════════════════════════════════════════════════ */
    function mobileFootHtml() {
      var steps = stepStates();
      var now = currentStepId();
      var i = steps.findIndex(function (x) { return x.id === now; });
      var prev = i > 0 ? steps[i - 1] : null;
      var next = i >= 0 && i < steps.length - 1 ? steps[i + 1] : null;
      var cur = steps[i] || steps[0];

      return '<div class="vq2-qmfoot">'
        + '<div class="vq2-qmfoot-r">'
        + btn({ icon: "chevronL", iconOnly: true, variant: "quiet", action: "qm-step-prev",
                disabled: !prev, aria: prev ? prev.label + " へ戻る" : "戻れません" })
        + '<div class="vq2-qmfoot-c"><span class="vq2-qmfoot-n">'
        + (i + 1) + " / " + steps.length + "</span>"
        + '<span class="vq2-qmfoot-t">' + esc(cur.label) + "</span></div>"
        + '<div class="vq2-top-sp"></div>'
        + btn({ icon: "sparkle", iconOnly: true, variant: st.pane === "side" ? "primary" : "quiet",
                action: "qm-pane", id: st.pane === "side" ? "main" : "side", aria: "AI アシスタント" })
        + btn({ icon: "settings", iconOnly: true, variant: st.pane === "left" ? "primary" : "quiet",
                action: "qm-pane", id: st.pane === "left" ? "main" : "left", aria: "条件と教材" })
        + btn({ label: next ? next.label + " へ" : "完成", icon: "chevronR",
                variant: "primary", action: "qm-step-next", disabled: !next })
        + "</div></div>";
    }

    function topHtml() {
      return '<div class="vq2-top">'
        + btn({ icon: "chevronL", iconOnly: true, variant: "quiet", action: "close", aria: "閉じる" })
        + '<div style="min-width:0"><div class="vq2-top-title">'
        + esc(st.spec ? st.spec.title : (st.settings.title || "Quick Mock")) + "</div>"
        + '<div class="vq2-top-sub">' + esc(stepLabel()) + "</div></div>"
        + '<div class="vq2-top-sp"></div>'
        + '<div class="vq2-top-actions">'
        + (app.isMobile() ? "" : btn({ icon: "sparkle", iconOnly: true, variant: "quiet",
             action: "qm-side", aria: st.sideOpen ? "AI アシスタントを閉じる" : "AI アシスタントを開く",
             title: "AI アシスタント", pressed: st.sideOpen }))
        + (st.spec ? btn({ label: "保存", icon: "save", action: "save" }) : "")
        + (st.spec && st.step === "review" ? btn({ label: "紙面を作る", icon: "print", variant: "primary", action: "artifacts" }) : "")
        + (st.step === "artifacts" ? btn({ label: "受験する", icon: "play", variant: "primary", action: "start-exam" }) : "")
        + "</div></div>";
    }
    /* 進み具合に合う中央タブ */
    function tabForStep(step) {
      return { setup: "plan", blueprint: "plan", generating: "questions",
               review: "questions", artifacts: "paper" }[step] || "questions";
    }
    function stepLabel() {
      return { setup: "条件を決める", blueprint: "構成案を確認する", generating: "問題を作っています",
               review: "内容を確認・編集する", artifacts: "紙面と成果物" }[st.step] || "";
    }

    /* いまどこまで進んだか。

       試験を作る流れは 7 段階ある。
         条件 → 教材 → 構成案 → 問題 → 紙面 → 検証 → 完成
       これまでは 4 つしか出しておらず、「教材を入れる」「検証する」「完成」が
       流れの中に見えていなかった。**やることの数を隠さない。**

       印は「済み／いま／これから」の 3 つ。
       済みかどうかは *実際にできているか* で決める（押した回数では決めない）。
       ══════════════════════════════════════════════════════════ */
    function stepStates() {
      var qn = st.spec ? allQuestions().length : 0;
      var atts = (st.attachments || []).filter(function (a) { return a.included !== false; }).length;
      var verified = !!(st.structure || st.audit);
      return [
        { id: "setup", label: "条件", tab: "plan", done: true,
          note: st.settings.totalPoints + "点 / " + st.settings.durationMinutes + "分" },
        /* 解析が届いていれば、そのページ数をそのまま出す（件数だけにしない）。 */
        { id: "sources", label: "教材", tab: "plan", done: atts > 0,
          note: !atts ? "なくても作れます"
            : (st.analysis && st.analysis.files.length
                ? atts + " 件 / " + st.analysis.files.reduce(function (a, f) { return a + f.usablePages; }, 0)
                  + " ページ"
                : atts + " 件") },
        { id: "blueprint", label: "構成案", tab: "plan",
          done: !!(st.blueprint && st.blueprint.sections && st.blueprint.sections.length),
          note: st.blueprint && st.blueprint.sections ? st.blueprint.sections.length + " 大問" : "" },
        { id: "review", label: "問題", tab: "questions", done: qn > 0, note: qn ? qn + " 問" : "" },
        { id: "paper", label: "紙面", tab: "paper", done: !!st.artifacts,
          note: st.inspection && st.inspection.summary ? st.inspection.summary.pageCount + " ページ" : "" },
        { id: "verify", label: "検証", tab: "verify", done: verified,
          note: st.audit && st.audit.blocking ? st.audit.blocking + " 件" : (verified ? "済み" : "") },
        { id: "artifacts", label: "完成", tab: "artifacts", done: !!(st.artifacts && st.spec), note: "" }
      ];
    }

    /* いま何段階目にいるか。**やっていない先の段階を「いま」にしない。** */
    function currentStepId() {
      /* 画面から分かるものは画面を優先する（AI が勝手に進めたときも合うように）。 */
      if (st.step === "artifacts") return "artifacts";
      if (st.tab === "verify") return "verify";
      if (st.tab === "paper") return "paper";
      if (st.step === "generating" || st.step === "review") return "review";
      if (st.step === "blueprint") return "blueprint";
      /* 条件と教材は同じ画面。押して移ったほうを覚えているので、それを使う。 */
      return st.stepId === "sources" ? "sources" : "setup";
    }

    function stepsHtml() {
      var steps = stepStates();
      var now = currentStepId();
      var cur = steps.findIndex(function (x) { return x.id === now; });
      return '<div class="vq2-steps" role="list" aria-label="進み具合">'
        + steps.map(function (x, i) {
            var cls = i === cur ? " is-now" : (x.done ? " is-done" : "");
            return (i ? '<span class="vq2-steps-s" aria-hidden="true"></span>' : "")
              + '<button type="button" class="vq2-steps-i' + cls + '" role="listitem"'
              + ' data-step="' + x.id + '"'
              + (i === cur ? ' aria-current="step"' : "")
              + ' aria-label="' + esc(x.label + (x.note ? "・" + x.note : "")
                  + (x.done ? "・済み" : "")) + '">'
              + '<span class="vq2-steps-d" aria-hidden="true"></span>'
              + '<span class="vq2-steps-l">' + esc(x.label) + "</span>"
              + (x.note ? '<span class="vq2-steps-n">' + esc(x.note) + "</span>" : "")
              + "</button>";
          }).join("") + "</div>";
    }

    /* ══════════════════════════════════════════════════════════
       中央：タブと中身
       ══════════════════════════════════════════════════════════ */
    function centerTabsHtml() {
      var qn = st.spec ? allQuestions().length : 0;
      var bad = st.audit ? st.audit.blocking : 0;
      var warn = st.audit ? Math.max(0, st.audit.total - (st.audit.blocking || 0)) : 0;
      var structBad = st.structure && !st.structure.ok ? (st.structure.problems || []).length : 0;
      return WS.segmentedTabs([
        { id: "plan", label: "構成案", icon: "list",
          count: st.blueprint && st.blueprint.sections ? st.blueprint.sections.length : 0 },
        { id: "questions", label: "問題", icon: "doc", count: qn },
        { id: "paper", label: "紙面", icon: "print",
          count: st.inspection && st.inspection.summary ? st.inspection.summary.pageCount : 0 },
        { id: "verify", label: "検証", icon: "shield", count: bad + structBad + warn,
          tone: (bad + structBad) ? "danger" : warn ? "warning" : "" },
        { id: "artifacts", label: "成果物", icon: "layers",
          count: st.artifacts ? Object.keys(st.artifacts).length : 0 }
      ], st.tab, { action: "qm-tab", aria: "中身の表示切り替え" });
    }

    function centerHtml() {
      if (st.tab === "plan") return planTabHtml();
      if (st.tab === "paper") return paperTabHtml();
      if (st.tab === "verify") return verifyTabHtml();
      if (st.tab === "artifacts") return artifactsTabHtml();
      return questionsTabHtml();
    }

    function planTabHtml() {
      if (!st.aiBusy && !st.blueprint && !st.blueprintText)
        return WS.emptyState({
          icon: "list", title: "まず「どの大問に何を出すか」を決めます",
          /* 狭い画面には「左」が無い。どちらの画面でも合う言い方にする。 */
          body: "条件を確かめてから「構成案をつくる」を押すと、大問ごとのテーマ・問題数・配点を先に見せます。納得してから問題を作れます。",
          action: btn({ label: "構成案をつくる", icon: "sparkle", variant: "primary",
                        action: "blueprint", disabled: st.aiBusy })
        });
      var h = '<div id="bpBody">' + blueprintBodyHtml() + "</div>";
      if (!st.aiBusy && (st.blueprint || st.blueprintText))
        h += WS.stickyFooter({
          note: "この構成でよければ、問題づくりに進めます。",
          actions: btn({ label: "この構成で問題を作る", icon: "sparkle", variant: "primary", action: "generate" })
            + btn({ label: "構成を作り直す", icon: "refresh", variant: "ghost", action: "blueprint" })
        });
      return h;
    }

    function questionsTabHtml() {
      if (st.step === "generating" || (st.aiBusy && !st.spec)) return generatingHtml();
      if (!st.spec)
        return WS.emptyState({
          icon: "sparkle", title: "まだ問題はありません",
          body: "構成案から作るか、条件だけを決めて一気に作れます。作っている途中の進み具合は、右の「AI アクティビティ」に出ます。",
          action: btn({ label: "構成案をつくる", icon: "sparkle", variant: "primary", action: "blueprint", disabled: st.aiBusy })
            + btn({ label: "一気に作る", variant: "ghost", action: "generate-direct", disabled: st.aiBusy })
        });
      return reviewHtml();
    }

    /* 要修正を残したまま組んだことを、紙面の画面に出し続ける。
       止めない代わりに、黙って完成したように見せない。 */
    function paperIssueNotice() {
      var errs = st.buildIssues || [], probs = st.buildStructure || [];
      if (!errs.length && !probs.length) return "";
      var lines = probs.map(function (p) { return String(p); })
        .concat(errs.slice(0, 5).map(function (e) { return String(e.message || e.code || ""); }));
      var more = (errs.length > 5) ? "（ほか " + (errs.length - 5) + " 件）" : "";
      /* inlineNotice は body を escape する（タグは書けない）。
         1 行にまとめて渡す。 */
      return WS.inlineNotice({
        tone: "warning",
        title: "要修正 " + (errs.length + probs.length) + " 件を残したまま組んでいます",
        body: "紙面は出せますが、このままでは試験として成立しません。 "
          + lines.map(function (l) { return "・" + l; }).join("　") + more
      });
    }

    function paperTabHtml() {
      if (st.step === "artifacts") return paperIssueNotice() + artifactsHtml();
      if (!st.spec)
        return WS.emptyState({ icon: "print", title: "紙面はまだ組めません",
          body: "問題ができると、A4 の紙面に割り付けて見せます。" });
      return layoutPickerHtml()
        + WS.emptyState({
          icon: "print", title: "紙面を組みますか",
          body: "いまの設定（" + esc(paperSummaryLine()) + "）で割り付けて、ページ数や崩れを確かめます。",
          action: btn({ label: "紙面を作る", icon: "print", variant: "primary", action: "artifacts" })
        });
    }

    /* ══════════════════════════════════════════════════════════
       §40 紙面デザインを「紙面」の段階で選ぶ

       これまで紙面デザインは左の畳んだ欄にしか無く、
       選択肢は名前だけで、何が違うのかも、選べるのかも分からなかった。
       ここでは 1 つずつに
         名称 ／ 説明（プロファイルの実値） ／ 推奨用途 ／
         対応する問題形式 ／ 印刷できるか ／ 使えるか（準備中か）
       を出す。**準備中のものは、選んでも紙が変わらないとはっきり書く。**

       選び直しても問題は作り直さない（AI は走らない）。
       ══════════════════════════════════════════════════════════ */
    function layoutCardHtml(c, recReason) {
      var on = st.settings.layoutMode === c.id;
      var types = c.questionTypes.length;
      var lines = [];
      if (c.description) lines.push(c.description);
      if (c.subjects.length) lines.push("向いている教科：" + c.subjects.join("・"));
      if (types) {
        var head = sortTypes(c.questionTypes).slice(0, 4).map(typeJa).join("・");
        lines.push("対応する問題形式：" + types + " 種（" + head
          + (types > 4 ? " ほか" : "") + "）");
      }
      if (c.unsupported.length) {
        lines.push("向かない形式：" + c.unsupported.map(function (u) {
          return typeJa(u.type) + "（" + u.why + "）";
        }).join(" "));
      }
      if (c.pending.length) lines.push("まだできないこと：" + c.pending.join("・"));
      if (c.note) lines.push(c.note);
      if (recReason) lines.push("おすすめの理由：" + recReason);

      /* min-width:0 が無いと、説明の 1 行が長いときに札そのものが枠より広くなる
         （実測 375px で 6px はみ出した）。折り返しの指定も一緒に置く。 */
      return '<button type="button" class="vq2-pick' + (on ? " is-on" : "") + '"'
        + ' style="min-height:0;min-width:0;max-width:100%;overflow-wrap:anywhere"'
        + ' data-act="qm-layout" data-id="' + esc(c.id) + '"'
        + ' aria-pressed="' + on + '">'
        + '<span class="vq2-pick-t">' + esc(c.name) + "</span>"
        + '<span class="vq2-pick-s">' + U.statusChip(c.tone === "success" ? "success" : c.tone === "info" ? "info" : "warning", c.badge)
        + (c.printable ? "" : " " + U.statusChip("info", "印刷しません")) + "</span>"
        + lines.map(function (l) {
            return '<span class="vq2-pick-s">' + esc(l) + "</span>";
          }).join("")
        + "</button>";
    }

    function layoutPickerHtml() {
      var cat = layoutCatalog();
      if (!cat.length) return "";
      /* §42 おすすめ。**候補として出すだけ。ここでは何も選ばない。** */
      var recs = layoutRecommendations(st.spec, 3);
      var reason = {};
      recs.forEach(function (r) { reason[r.modeId] = (r.reasons || [])[0] || ""; });
      /* 実際に紙が変わるものだけを数える。「おまかせ」はその中から選ぶだけなので
         数に入れない（入れると、組める種類が 1 つ多く見える）。 */
      var usable = cat.filter(function (c) { return c.usable && c.id !== "auto"; }).length;

      var body = "";
      if (recs.length) {
        body += '<p class="vq2-hint">いまの問題の内訳から見ると「'
          + esc(recs.map(function (r) { return r.name; }).join("」「")) + "」が合いそうです。"
          + "選ぶのはご自身です（こちらでは変えていません）。</p>";
      }
      body += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(240px,100%),1fr));gap:10px">'
        + cat.map(function (c) { return layoutCardHtml(c, reason[c.id]); }).join("")
        + "</div>"
        + '<p class="vq2-hint" style="margin-top:10px">'
        + "選べる " + cat.length + " 種のうち、いまの Renderer が実際に組めるのは "
        + usable + " 種です。「準備中」は選んでも、いまの紙面のまま出します。"
        + "紙面デザインを選び直しても、問題は作り直しません（AI は動きません）。</p>";
      return WS.sectionCard({ title: "紙面デザイン", icon: "layers",
        sub: labelOf(LPF.LAYOUT_MODES, st.settings.layoutMode), body: body });
    }

    function paperSummaryLine() {
      var s = st.settings;
      return [s.paperSize, s.orientation === "portrait" ? "縦" : "横",
              s.writingDirection === "vertical" ? "縦書き" : "横書き"].join(" ／ ");
    }

    function verifyTabHtml() {
      var h = "";
      /* 頼んだ数に届いていないとき。**できている問題はそのまま残す。**
         押すと、空いている枠だけをもう一度作りに行く（全部は作り直さない）。 */
      var cr = st.compileResult;
      if (cr && cr.accepted < cr.planned) {
        var miss = cr.planned - cr.accepted;
        h += WS.sectionCard({
          title: "足りない " + miss + " 問", icon: "alert", tone: "warning",
          sub: "できている " + cr.accepted + " 問はそのまま残ります",
          body: WS.inlineNotice({
            tone: "warning",
            body: cr.evidence
              ? "資料から読み取れた内容（約 " + cr.evidence.contentCharacters + " 字）では、"
                + "目安で " + cr.evidence.maxQuestions + " 問までです。"
                + "資料を足すか、問題数を減らすと最後まで埋まります。"
              : "作れなかった枠があります。もう一度頼むと埋まることがあります。"
          })
            + '<div class="vq2-fixlist"><div class="vq2-fixrow">'
            + btn({ label: "足りないぶんを作る", icon: "sparkle", size: "sm", variant: "primary",
                    action: "qm-refill", disabled: st.aiBusy })
            + '<span class="vq2-hint">空いている枠だけを頼み直します。'
            + "いまある " + cr.accepted + " 問は変わりません。</span></div></div>"
        });
      }
      if (st.structure && !st.structure.ok && (st.structure.problems || []).length) {
        h += WS.sectionCard({
          title: "指定と合っていないところ", icon: "shield", tone: "warning",
          body: st.structure.problems.map(function (p) {
                  return WS.inlineNotice({ tone: "warning", body: String(p) });
                }).join("")
            + (structureFixes().length
                ? '<div class="vq2-fixlist">' + structureFixes().map(function (f, i) {
                    return '<div class="vq2-fixrow">'
                      + btn({ label: f.label, size: "sm",
                              variant: i === 0 ? "primary" : "ghost",
                              action: "fix-structure", id: f.id })
                      + '<span class="vq2-hint">' + esc(f.note) + "</span></div>";
                  }).join("") + "</div>"
                : "")
        });
      }
      var a = auditHtml();
      if (a) h += a;
      if (st.spec) {
        var issues = st.finalizeResult ? st.finalizeResult.issues : [];
        var errs = V.errorsOf(issues), warns = V.warningsOf(issues);
        if (errs.length || warns.length) {
          h += WS.sectionCard({
            title: "保存前の確認", icon: "warning",
            body: errs.concat(warns).slice(0, 20).map(function (e) {
              return WS.inlineNotice({ tone: e.severity === "error" ? "danger" : "warning",
                                       body: String(e.message) });
            }).join("")
          });
        }
      }
      if (h) return h;
      return WS.emptyState({ icon: "shield", title: "気になるところはありません",
        body: st.spec ? "問題数・配点・根拠・形式のいずれもそろっています。このまま保存して紙面に進めます。"
                      : "問題ができたら、ここに検証の結果が出ます。" });
    }

    function artifactsTabHtml() {
      if (!st.artifacts)
        return WS.emptyState({ icon: "layers", title: "成果物はまだありません",
          body: "紙面を組むと、問題冊子・解答用紙・正解と解説・mock-spec.json を書き出せます。",
          action: st.spec ? btn({ label: "紙面を作る", icon: "print", variant: "primary", action: "artifacts" }) : "" });
      return '<div id="artPanel">' + artifactsPanelHtml() + "</div>";
    }

    /* 資料 1 件ぶんの行。使う／使わないをここで決める（Phase 13 §1）。
       大がかりな UI は作らない。既存の添付チップにチェックを 1 つ足すだけ。 */
    /* まだ送り終えていない資料のようす。**送り終えたものはここに出さない**
       （下の一覧に「使う／使わない」付きで並ぶので、二重に出さない）。 */
    function uploadRowsHtml() {
      var rows = (st.upRows || []).filter(function (r) { return r.state !== "uploaded"; });
      if (!rows.length) return "";
      return '<div class="vq2-attach">' + rows.map(function (r) {
        return '<div class="vq2-attach-i">'
          + (r.state === "uploading" ? '<span class="vq2-spin"></span>' : icon("upload"))
          + '<span class="vq2-attach-n" title="' + esc(r.name) + '">'
          + esc(displayName(r.name)) + "</span>"
          + '<span class="vq2-attach-s">' + esc(r.stateText || "")
          + (r.label ? "／" + esc(r.label) : "")
          + (r.message ? "／" + esc(r.message) : "") + "</span></div>";
      }).join("") + "</div>";
    }

    function attachRowHtml(f) {
      var on = f.included !== false;
      var why = f.excludedReason && f.excludedReason.indexOf("instruction:") === 0
        ? "指示文「" + f.excludedReason.slice("instruction:".length) + "」により除外"
        : (f.included === false ? "使いません" : "");
      return '<div class="vq2-attach-i"' + (on ? "" : ' style="opacity:.55"') + ">"
        + '<label class="vq2-check" style="padding:0;margin-right:6px">'
        + '<input type="checkbox" data-act="useatt" data-id="' + esc(String(f.id)) + '"'
        + (on ? " checked" : "") + ' aria-label="' + esc(f.name || "資料") + ' を出題に使う"></label>'
        + icon(f.kind === "image" ? "eye" : "doc")
        /* 長い名前は短くして出す（全部は title に残す）。§52 */
        + '<span class="vq2-attach-n" title="' + esc(f.name || "資料") + '">'
        + esc(displayName(f.name || "資料")) + "</span>"
        + '<span class="vq2-attach-s">' + esc(U.attachSummary(f))
        + (f.unreadablePages ? "／読み取れないページ " + f.unreadablePages : "")
        + (why ? "／" + esc(why) : "") + "</span></div>";
    }

    /* ══════════════════════════════════════════════════════════
       §44 資料の状態

       サーバは資料をページ単位で見立てているのに、
       画面には「n ページ分の文章を読み取りました」しか出ていなかった。
       ここでは届いた値をそのまま出す。
         ・何ページのうち何ページが読めたか
         ・そのうち本文／字が少ない／空がそれぞれ何ページか
         ・読み取れなかったページ番号
         ・出題対象から外したページと、その理由
         ・外したページを使う／使わないの切り替え（§17・取り消せる）
       ══════════════════════════════════════════════════════════ */
    function pageKindBarHtml(bk) {
      if (!bk) return "";
      var parts = [];
      if (bk.text) parts.push("本文 " + bk.text);
      if (bk.low_text) parts.push("字が少ない " + bk.low_text);
      if (bk.empty) parts.push("空 " + bk.empty);
      if (!parts.length) return "";
      return '<span class="vq2-attach-s">' + esc(parts.join(" ／ ")) + "</span>";
    }

    /* ページ 1 枚ずつの見立て。既定は畳む（48 ページを一度に並べない）。 */
    function pageKindListHtml(row) {
      if (!row.pages.length) return "";
      var key = "pages:" + row.id;
      var open = !!st.pagesOpen[key];
      var h = '<button type="button" class="vq2-btn is-quiet is-sm" data-act="qm-pages"'
        + ' data-id="' + esc(row.id) + '" aria-expanded="' + open + '">'
        + esc(open ? "ページごとの見立てを隠す" : "ページごとの見立てを見る（" + row.pages.length + " ページ）")
        + "</button>";
      if (!open) return h;
      h += '<div class="vq2-attach" style="margin-top:6px">'
        + row.pages.map(function (p) {
            return '<div class="vq2-attach-i">'
              + '<span class="vq2-attach-n">p.' + esc(String(p.pageNumber)) + "</span>"
              + '<span class="vq2-attach-s">' + esc(p.kindJa)
              + (p.whyJa ? "／" + esc(p.whyJa) : "") + "</span></div>";
          }).join("")
        + "</div>";
      return h;
    }

    function sourceStateHtml() {
      var rows = sourceStateRows(st.attachments, st.analysis);
      if (!rows.length) return "";
      var analyzed = rows.filter(function (r) { return r.analyzed; }).length;
      var h = "";

      /* まだ 1 件も解析結果が来ていないとき。**「0 ページ」と言い切らない。** */
      if (!analyzed) {
        h += '<p class="vq2-hint">ページごとの見立ては、問題を作りはじめると届きます'
          + "（読み取りはサーバ側で行います）。</p>";
      }
      h += '<div class="vq2-attach">' + rows.map(function (r) {
        var bits = [];
        if (r.analyzed) {
          bits.push(r.usablePages + " / " + r.totalPages + " ページから内容を取り出しました");
          if (r.documentKindJa) bits.push(r.documentKindJa);
        } else if (r.totalPages) {
          bits.push("この端末で " + r.totalPages + " ページを読み込みました");
        }
        if (r.unreadablePages) bits.push("読み取れないページ " + r.unreadablePages);
        if (r.failedPages.length)
          bits.push("読み取れなかったページ p." + r.failedPages.slice(0, 12).join("・p.")
            + (r.failedPages.length > 12 ? " ほか" : ""));
        return '<div class="vq2-attach-i" style="flex-wrap:wrap' + (r.included ? "" : ";opacity:.55") + '">'
          + '<span class="vq2-attach-n" title="' + esc(r.name) + '">'
          + esc(displayName(r.name)) + "</span>"
          + '<span class="vq2-attach-s">' + esc(bits.join("／") || "まだ読み取っていません") + "</span>"
          + (r.byKind ? '<span style="flex-basis:100%">' + pageKindBarHtml(r.byKind) + "</span>" : "")
          + (r.pages.length ? '<span style="flex-basis:100%;margin-top:4px">'
              + pageKindListHtml(r) + "</span>" : "")
          + "</div>";
      }).join("") + "</div>";
      return h;
    }

    /* 出題対象から外したページ。**外しっぱなしにしない。**
       「使う」に切り替えられること、切り替えると次の生成から戻ることを書く。 */
    function excludedPagesHtml() {
      var rep = st.pageReport;
      var on = st.settings.includeExcludedPages === true;
      var toggle = '<label class="vq2-check"><input type="checkbox" data-key="includeExcludedPages"'
        + (on ? " checked" : "") + ">"
        + "<span>外したページも出題に使う<br>"
        + '<span class="vq2-hint">入れると、次に作るときから表紙・目次・注意事項のページも'
        + "出題の対象に戻します（いまある問題は変わりません）。</span></span></label>";

      if (!rep || (!rep.excludedPages.length && !rep.excludeRestored)) {
        /* 外したページがまだ無いときも、切り替えは出しておく（先に決められる）。
           ただし「外しました」とは言わない。 */
        return WS.foldCard({
          key: "excl", title: "外したページ", icon: "shield",
          summary: on ? "外さずに全ページを使います" : "まだ外したページはありません",
          open: !!st.open.excl, action: "qm-fold",
          body: '<p class="vq2-hint">表紙・目次・注意事項・解答欄だけのページは、'
            + "出題の対象から外すことがあります。外したときはここに一覧を出します。</p>"
            + toggle
        });
      }
      var groups = excludedPageRows(rep);
      var n = rep.excludedPages.length;
      var body = "";
      if (rep.excludeRestored) {
        body += WS.inlineNotice({ tone: "warning",
          title: "外しませんでした",
          body: "全ページが体裁だけと判定されたため、外さずにそのまま使いました。" });
      }
      if (rep.includeChromePages) {
        body += WS.inlineNotice({ tone: "info",
          title: "この回は外していません",
          body: "「外したページも使う」を入れて作ったので、全ページを対象にしました。" });
      }
      body += '<div class="vq2-attach">' + groups.map(function (g) {
        var pages = g.pages.map(function (p) { return p.page == null ? "?" : "p." + p.page; });
        return '<div class="vq2-attach-i" style="flex-wrap:wrap">'
          + '<span class="vq2-attach-n" title="' + esc(g.fileName) + '">'
          + esc(displayName(g.fileName)) + "</span>"
          + '<span class="vq2-attach-s">' + esc(pages.slice(0, 20).join("・")
              + (pages.length > 20 ? " ほか" : "")) + "</span>"
          + '<span class="vq2-attach-s" style="flex-basis:100%">'
          + esc("理由：" + g.reasons.join("・")) + "</span></div>";
      }).join("") + "</div>";
      if (rep.thinEvidence.length) {
        body += '<p class="vq2-hint">ほかに ' + rep.thinEvidence.length
          + " 箇所は、字数が足りず出題に使えませんでした。</p>";
      }
      body += toggle;
      return WS.foldCard({
        key: "excl", title: "外したページ", icon: "shield",
        summary: on ? n + " ページを外しましたが、次からは使います" : n + " ページを外しています",
        open: !!st.open.excl, action: "qm-fold", body: body
      });
    }

    /* ══════════════════════════════════════════════════════════
       左ペイン：何を作ってほしいか

       ① 依頼内容 ② 試験条件 ③ 紙面設定 ④ 資料 ⑤ 実行
       ②③ の細かい項目はこれまでどおり全部あるが、既定では畳んでおく。
       ══════════════════════════════════════════════════════════ */
    /* ── 狭い画面で欄が広がらないようにする（§52）────────────────
       実測（2026-08-05・320px）: 資料を 1 件付けただけで左の欄が 355px、
       長い名前だと 737px まで広がった。欄そのものは切り取られるので
       横スクロールにはならないが、**中のボタンの文字が画面の外へ出て読めない**
       （幅 679px のボタンの中央寄せの文字が 340px の位置に来る）。

       原因は「欄の広さを、中でいちばん長い折り返さない 1 行から決めている」こと。
       ここで幅を 0 と決めておくと、中身は広さの計算に入らなくなり、
       min-width:100% で親の幅ちょうどに戻る。
       中身の側（1 行の長さ）に頼る直し方だと、文が 1 つ伸びるたびに戻る。 */
    var FIT = 'style="width:0;min-width:100%"';
    function leftHtml() {
      return "<div " + FIT + ">" + leftBodyHtml() + "</div>";
    }
    function leftBodyHtml() {
      return '<div class="vq2-wshead">'
        + '<h2 class="vq2-wshead-t">AI で試験をつくる</h2>'
        + '<p class="vq2-wshead-s">条件と資料を渡すと、問題・解答・紙面までひととおり作ります。</p>'
        + stepsHtml()
        + "</div>"
        + (st.aiError ? WS.inlineNotice({ tone: "danger", title: "うまくいきませんでした", body: st.aiError }) : "")
        + requestCardHtml()
        + examCardHtml()
        + paperCardHtml()
        + sourceCardHtml()
        + runCardHtml();
    }

    function requestCardHtml() {
      return WS.sectionCard({
        title: "依頼内容", icon: "sparkle",
        body: WS.requestComposer({
          key: "instruction", value: st.instruction, rows: 4,
          placeholder: "例）配った授業プリントの範囲だけで、正誤を多めに。記述も 2 問入れてください。",
          hint: "教科・試験名・範囲・出したい形式の比率（正誤多めなど）を書くと、そのとおりに寄せます。",
          chips: ["正誤を多めに", "記述を 2 問", "選択肢は 5 個", "難しめに"],
          chipAction: "qm-chip"
        })
      });
    }

    function examCardHtml() {
      var s = st.settings;
      var body = '<div class="vq2-pickgrid">'
        + KINDS.map(function (k) {
            return '<button type="button" class="vq2-pick' + (st.kind === k.id ? " is-on" : "") + '" data-kind="' + k.id + '"'
              + ' aria-pressed="' + (st.kind === k.id) + '">'
              + '<span class="vq2-pick-i">' + U.icon(k.icon) + "</span>"
              + '<span class="vq2-pick-t">' + esc(k.label) + "</span>"
              + '<span class="vq2-pick-s">' + esc(k.note) + "</span></button>";
          }).join("")
        + "</div>"
        + WS.fieldGrid(
            field({ label: "試験名", key: "title", value: s.title, placeholder: "1学期期末考査" })
            + field({ label: "科目", key: "subject", value: s.subject, placeholder: "日本史探究" }), 2)
        + WS.fieldGrid(
            field({ label: "試験時間（分）", type: "number", key: "durationMinutes", value: s.durationMinutes, min: 5, max: 300 })
            + field({ label: "満点", type: "number", key: "totalPoints", value: s.totalPoints, min: 1, max: 1000 }), 2)
        + '<p class="vq2-hint">配点は満点にぴったり合うように自動で割り振ります。</p>';
      return WS.sectionCard({ title: "試験条件", icon: "list", body: body })
        + WS.foldCard({ key: "detail", title: "出題のくわしい設定", icon: "settings",
                        summary: summaryDetail(), open: !!st.open.detail,
                        action: "qm-fold", body: setupDetailHtml() });
    }

    function paperCardHtml() {
      return WS.foldCard({ key: "paper", title: "紙面の設定", icon: "print",
                           summary: summaryPaper(), open: !!st.open.paper,
                           action: "qm-fold", body: setupPaperHtml() })
        + WS.foldCard({ key: "layout", title: "紙面デザイン（試験運用）", icon: "layers",
                        summary: summaryLayout(), open: !!st.open.layout,
                        action: "qm-fold", body: setupLayoutHtml() });
    }

    function sourceCardHtml() {
      var n = st.attachments.length;
      var used = st.attachments.filter(function (f) { return f.included !== false; }).length;
      /* 資料が 1 件も無いときは、この回は指示だけで作る。
         そのことをここで言い切る（押してから初めて分かる、をなくす）。 */
      var promptOnly = used === 0;
      return WS.sectionCard({
        id: "qmSources", title: "資料", icon: "doc",
        sub: st.attachBusy ? "読み取っています…"
          : used ? used + " 件を出題に使います（全 " + n + " 件）"
              : "資料は任意です。無いときは、上の指示だけで作ります",
        aside: btn({ icon: "upload", iconOnly: true, size: "sm", variant: "quiet",
                     action: "attach", aria: "資料を追加", title: "資料を追加" }),
        body: uploadRowsHtml()
          + (st.attachBusy
                ? '<div class="vq2-attach"><div class="vq2-attach-i">'
                  + '<span class="vq2-spin"></span><span>資料を読み取っています…</span></div></div>'
                : "")
          + (n ? '<div class="vq2-attach">' + st.attachments.map(attachRowHtml).join("") + "</div>"
               : btn({ label: "資料を選ぶ（PDF・画像・文書）", icon: "doc", full: true, action: "attach" }))
          + '<label class="vq2-check"><input type="checkbox" data-key="sourceOnly"'
          + (!st.settings.allowExternalKnowledge ? " checked" : "")
          + (promptOnly ? " disabled" : "")
          + "><span>資料だけを根拠にする</span></label>"
          + (promptOnly
              ? '<p class="vq2-hint">資料が無いので、この回はご指示だけで作ります。'
                + "出典は付きません。確かでない内容は出題しません。</p>"
              : "")
          /* §44 資料の状態（ページごとの見立て・読み取れなかったページ）。 */
          + sourceStateHtml()
      })
        /* §17 外したページ。取り消せる形でここに置く。 */
        + (n ? excludedPagesHtml() : "");
    }

    function runCardHtml() {
      var busy = st.aiBusy || st.repairBusy;
      var h = '<div class="vq2-runrow">';
      if (busy) {
        h += btn({ label: "停止", icon: "stop", variant: "danger", full: true, action: "ai-stop" });
      } else if (!st.spec) {
        h += btn({ label: "構成案をつくる", icon: "sparkle", variant: "primary", full: true, action: "blueprint" });
      } else {
        h += btn({ label: "紙面を作る", icon: "print", variant: "primary", full: true, action: "artifacts" });
      }
      h += "</div>";
      if (!busy) {
        h += '<div class="vq2-runrow">'
          + (!st.spec
              ? btn({ label: "一気に作る", icon: "play", variant: "ghost", action: "generate-direct" })
              : btn({ label: "作り直す", icon: "refresh", variant: "ghost", action: "blueprint" }))
          + (st.spec && st.audit && st.audit.total
              ? btn({ label: "不備を補う", icon: "wrench", variant: "ghost", action: "repair" }) : "")
          + (st.spec ? btn({ label: "保存", icon: "save", variant: "ghost", action: "save" }) : "")
          + (st.step === "artifacts" ? btn({ label: "受験する", icon: "play", variant: "ghost", action: "start-exam" }) : "")
          + "</div>";
        if (!st.spec)
          h += '<p class="vq2-hint">先に「どの大問に何を出すか」を見せます。納得してから問題を作ります。</p>';
      }
      return WS.sectionCard({ title: "実行", icon: "play", body: h });
    }

    /* 右ペインは JS 側（actPanel）が状態を持つので、見出しの塗り直しだけでよい。 */
    function renderAiPane() { paintActivityHead(); }
    function renderLeft() {
      var p = app.root.querySelector("#wsLeft .vq2-ws-scroll");
      if (p) p.innerHTML = leftHtml();
      else render();
    }
    function renderCenter() {
      var p = app.root.querySelector("#wsMainScroll");
      var y = p ? p.scrollTop : 0;
      if (p) p.innerHTML = centerHtml();
      var t = app.root.querySelector(".vq2-ws-tabs");
      if (t) t.innerHTML = centerTabsHtml();
      if (p && y > 0) {
        p.scrollTop = y;
        if (root.requestAnimationFrame) root.requestAnimationFrame(function () {
          if (Math.abs(p.scrollTop - y) > 2) p.scrollTop = y;
        });
      }
    }

    /* ── 設定 ─────────────────────────────────────────────── */
    /* ── 設定 ────────────────────────────────────────────────
       上から順に埋めれば作れるようにする。
       ① どんな試験か（型を選ぶ）② 何から作るか（指示と資料）
       ③ 名前と時間 ④ くわしい設定（畳む）⑤ 紙面（畳む）⑥ 作る

    /* ── 紙面デザイン（出力エンジン／レイアウト／解答用紙）──────────
       ・出力エンジンと紙面デザインは別の項目。同じ欄に混ぜない。
       ・まだ組めないもの（Typst / TeX / 未実装のデザイン）は
         「準備中」と出し、選ばれても現在の形式で組む。動くふりをしない。 */
    function summaryLayout() {
      var s = st.settings;
      /* 文書形式・教科レイアウトも「選んだ」に数える。
         数えていなかったので、文書形式を選んでも「現在の形式のまま」と
         出したままだった（実測 2026-08-05）。 */
      if (!LPF.uiLayoutTouched(s)) return "現在の形式のまま";
      var eff = layoutEffect(s);
      return labelOf(LPF.LAYOUT_MODES, s.layoutMode)
        + " ／ 解答用紙 " + labelOf(LPF.ANSWER_SHEET_MODES, s.answerSheetMode)
        + (s.documentFamily !== "auto" && LG
            ? " ／ " + LG.DOCUMENT_FAMILIES[s.documentFamily].name : "")
        + (s.subjectLayout !== "auto" && LG
            ? " ／ " + LG.SUBJECT_PACKS[s.subjectLayout].name : "")
        + (s.outputEngine !== "current" ? " ／ " + s.outputEngine + "（準備中）" : "")
        /* 選んだものが紙面に効かないなら、要約でも黙らない（契約 §6）。 */
        + (eff.chosen && !eff.effective ? " ／ この組み合わせでは紙面は変わりません" : "");
    }
    function labelOf(list, id) {
      var m = (list || []).filter(function (x) { return x.id === id; })[0];
      return m ? m.label : id;
    }
    function modeOptions(list) {
      return list.map(function (m) {
        return { value: m.id, label: m.label + (m.ready ? "" : "（準備中）") };
      });
    }
    function setupLayoutHtml() {
      var s = st.settings;
      var eng = LPF.engineStatus();
      var chosenEngine = eng[s.outputEngine] || eng.current;
      var qpReady = !!LPF.resolveLayoutProfileId(s.layoutMode, null);
      var asReady = !!LPF.resolveAnswerProfileId(s.answerSheetMode, null);
      var usingProfile = s.layoutMode !== "current";

      var h = '<div class="vq2-hint" style="margin-bottom:12px">'
        + "紙面の形を選べます。何も選ばなければ、いまと同じ紙面のままです。</div>";

      /* 文書形式と教科レイアウト（Layout Grammar V2）。
         用意できていないものは「準備中」と出し、選ばれても使えるものへ落とす。 */
      if (LG) {
        h += '<div class="vq2-layout-grid" style="margin-bottom:12px">'
          + field({ label: "文書形式", type: "select", key: "documentFamily", value: s.documentFamily,
                    options: [{ value: "auto", label: "おまかせ（現在の形式）" }].concat(
                      LG.DOCUMENT_FAMILY_IDS.map(function (id) {
                        var f = LG.DOCUMENT_FAMILIES[id];
                        return { value: id, label: f.name + (f.available ? "" : "（準備中）") };
                      })) })
          + field({ label: "教科レイアウト", type: "select", key: "subjectLayout", value: s.subjectLayout,
                    options: [{ value: "auto", label: "自動で判定" }].concat(
                      LG.SUBJECT_IDS.map(function (id) {
                        return { value: id, label: LG.SUBJECT_PACKS[id].name };
                      })) })
          /* 「解答用紙の形式」は **わざと操作できないままにしてある**。
             ANSWER_FAMILIES 8 件のうち available:true は answer-dense-grid の 1 件だけで、
             残り 7 件は中身がまだ無い（選ばれても fallback で answer-dense-grid に戻る）。
             選べるようにすると、8 通りから選んだのに紙面が 1 種類しか出ない
             ＝「動くふり」になる。実体が増えたら disabled を外す。
             いま何が使われているかは見えるように、表示だけは残す。 */
          + field({ label: "解答用紙の形式", type: "select", key: "answerFamilyView",
                    value: s.answerSheetMode === "grid-dense" ? "answer-dense-grid" : "auto",
                    disabled: true,
                    options: [{ value: "auto", label: "紙面デザインに合わせる" }].concat(
                      LG.ANSWER_FAMILY_IDS.map(function (id) {
                        var f = LG.ANSWER_FAMILIES[id];
                        return { value: id, label: f.name + (f.available ? "" : "（準備中）") };
                      })) })
          + "</div>";

        /* 選んでも紙面に効かない組み合わせのときは、はっきり出す。
           セレクトには「（準備中）」が付かず、選ぶと要約も変わり紙面も
           組み直されるので、黙っていると「効いた」ようにしか見えない。 */
        var effect = layoutEffect(s);
        if (effect.chosen && !effect.effective) {
          h += '<div class="vq2-card" style="padding:12px 14px;margin-bottom:12px">'
            + U.statusChip("warning", "効きません")
            + '<span style="margin-left:8px">' + esc(LAYOUT_NO_EFFECT_NOTE) + "</span></div>";
        }
      }

      /* 出力エンジン（紙面デザインとは別の項目） */
      h += '<div class="vq2-layout-grid">'
        + field({ label: "出力エンジン", type: "select", key: "outputEngine", value: s.outputEngine,
                  options: LPF.OUTPUT_ENGINES.map(function (id) {
                    return { value: id, label: eng[id].label + (eng[id].available ? "" : "（準備中）") };
                  }) })
        + field({ label: "紙面デザイン", type: "select", key: "layoutMode", value: s.layoutMode,
                  options: modeOptions(LPF.LAYOUT_MODES) })
        + field({ label: "解答用紙", type: "select", key: "answerSheetMode", value: s.answerSheetMode,
                  options: modeOptions(LPF.ANSWER_SHEET_MODES) })
        + "</div>";

      /* まだ組めないものは、はっきり伝える */
      if (!chosenEngine.available) {
        h += '<div class="vq2-card" style="padding:12px 14px;margin-top:12px">'
          + U.statusChip("warning", "準備中")
          + '<span style="margin-left:8px">' + esc(chosenEngine.note) + "</span></div>";
      }
      if (s.layoutMode !== "current" && !qpReady) {
        h += '<div class="vq2-card" style="padding:12px 14px;margin-top:12px">'
          + U.statusChip("warning", "準備中")
          + '<span style="margin-left:8px">この紙面デザインはまだ用意できていません。現在の形式で組みます。</span></div>';
      }
      if (s.answerSheetMode !== "current" && !asReady) {
        h += '<div class="vq2-card" style="padding:12px 14px;margin-top:12px">'
          + U.statusChip("warning", "準備中")
          + '<span style="margin-left:8px">この解答用紙はまだ用意できていません。現在の形式で組みます。</span></div>';
      }

      /* 使った形と Seed。同じ Seed を入れれば同じ紙面が出る。 */
      if (usingProfile && qpReady) {
        var prof = LPF.getProfile(LPF.resolveLayoutProfileId(s.layoutMode, null));
        var semInfo = st.plan && st.plan.semantic ? st.plan.semantic : null;
        h += '<div class="vq2-card" style="padding:12px 14px;margin-top:12px">'
          + '<div class="vq2-label" style="margin-bottom:6px">使っている形式</div>'
          + (semInfo && LG
              ? "<div>" + esc(LG.DOCUMENT_FAMILIES[semInfo.documentFamily].name)
                + '<span class="vq2-muted">（文書形式）</span></div>'
                + "<div>" + esc(LG.SUBJECT_PACKS[semInfo.subject].name)
                + '<span class="vq2-muted">（教科レイアウト・'
                + (semInfo.subjectSource === "explicit" ? "指定"
                   : semInfo.subjectSource === "spec-subject" ? "科目名から"
                   : semInfo.subjectSource === "content" ? "内容から" : "既定") + "）</span></div>"
              : "")
          + "<div>" + esc(prof.name) + '<span class="vq2-muted">（' + esc(prof.id) + " v" + esc(prof.version) + "）</span></div>"
          + (asReady
              ? "<div>" + esc(LPF.getProfile(LPF.resolveAnswerProfileId(s.answerSheetMode, null)).name)
                + '<span class="vq2-muted">（解答用紙）</span></div>'
              : "")
          + "</div>";

        h += '<div class="vq2-layout-seed" style="margin-top:12px">'
          + field({ label: "レイアウトの種（Seed）", type: "text", key: "layoutSeed", value: s.layoutSeed,
                    placeholder: "空欄なら毎回あたらしく作ります" })
          + '<div class="vq2-layout-seed-a">'
          + btn({ label: "レイアウトだけ再生成", icon: "refresh", action: "layout-reseed" })
          + btn({ label: "プレビュー", icon: "eye", action: "layout-preview" })
          + "</div></div>"
          + '<div class="vq2-hint" style="margin-top:8px">'
          + "同じ種を入れると、同じ紙面をもう一度作れます。"
          + "再生成しても問題文・正解・配点は変わりません。</div>";
      }

      if (s.outputEngine === "typst") h += typstPanelHtml();
      if (s.outputEngine === "tex") h += texPanelHtml();
      return h;
    }

    /* ── Typst ────────────────────────────────────────────────────
       ・実行環境があり、コンパイルと検証まで通ったときだけ「使える」。
         それ以外は準備中のまま。動くふりをしない。
       ・Typst ソースはいつでも作れて、いつでも見られる（中身を隠さない）。 */
    /* ── TeX（upLaTeX）の欄 ─────────────────────────────────────
       作りは Typst の欄と同じ。違うのは **縦書きが選べる**こと。
       Typst は縦組みを持っていないので、国語の紙面はこちらでしか作れない。 */
    function texPanelHtml() {
      var s = st.settings;
      var t = LPF.engineStatus().tex;
      var cap = LPF.engineCapability("tex") || {};
      var TR = VQ2.texRenderer;
      var h = '<div class="vq2-card" style="padding:14px;margin-top:12px">'
        + '<div class="vq2-label" style="margin-bottom:8px">TeX（upLaTeX）で PDF を作る</div>';

      h += '<div style="margin-bottom:10px">'
        + (t.available ? U.statusChip("success", "使えます")
                       : U.statusChip("warning", "準備中"))
        + '<span style="margin-left:8px">' + esc(t.note) + "</span>"
        + (cap.available && !cap.verified
            ? '<div class="vq2-hint" style="margin-top:6px">'
              + "「使えます」にするには、いちど組版と検証を通してください。</div>"
            : "")
        + "</div>";

      if (!TR) {
        h += '<div class="vq2-hint">TeX Renderer が読み込まれていません。</div></div>';
        return h;
      }

      h += '<div class="vq2-layout-grid">'
        + field({ label: "組み方向", type: "select", key: "texVertical", value: s.texVertical,
                  options: [{ value: "horizontal", label: "横書き" },
                            { value: "vertical", label: "縦書き（国語）" }] })
        + field({ label: "表紙", type: "select", key: "typstCover", value: s.typstCover,
                  options: [{ value: "none", label: "付けない（左寄せ1行の見出し）" },
                            { value: "full", label: "付ける（年度・試験名・注意事項・氏名欄）" }] })
        + "</div>";

      /* いま組める範囲を正直に出す（できないことを黙らない）。 */
      h += '<div class="vq2-hint" style="margin-top:10px">'
        + "縦書きでは選択肢を 1 段で組みます（2 段は縦組みに対応していません）。"
        + "原稿用紙のマスは縦書きだとまだ向きが回ったままです。</div>";

      var r = st.tex;
      h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">'
        + btn({ label: "TeX ソースを作る", icon: "code", action: "tex-source" })
        + btn({ label: "PDF を作る", icon: "print", variant: "primary", action: "tex-compile",
                disabled: !(r && r.ok && cap.available) })
        + btn({ label: "この端末を調べ直す", icon: "refresh", action: "tex-probe" })
        + "</div>";

      if (r && !r.ok) {
        h += '<div class="vq2-hint" style="margin-top:10px;color:var(--vq2-danger)">'
          + esc(r.message || "TeX ソースを作れませんでした。") + "</div>";
      } else if (r && r.ok) {
        h += '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">'
          + (r.parts || []).map(function (p) {
              return btn({ label: p.label + "（" + Math.round(p.source.length / 1024) + "KB）",
                           icon: "file", action: "tex-view", data: { id: p.id } });
            }).join("") + "</div>";
        (r.warnings || []).slice(0, 5).forEach(function (w) {
          h += '<div class="vq2-hint" style="margin-top:6px">・' + esc(String(w)) + "</div>";
        });
      }
      var c = st.texCompile;
      if (c) {
        h += '<div style="margin-top:10px">' + esc(c.statusLabel)
          + (c.pageCount ? "（" + c.pageCount + " ページ）" : "") + "</div>";
        if (c.log) h += '<pre style="max-height:180px;overflow:auto;white-space:pre-wrap;'
          + 'font-size:12px;margin-top:6px">' + esc(c.log) + "</pre>";
      }
      return h + "</div>";
    }

    function typstPanelHtml() {
      var s = st.settings;
      var t = LPF.engineStatus().typst;
      var cap = LPF.engineCapability("typst") || {};
      var TR = VQ2.typstRenderer, TS = VQ2.typstResolver;
      var h = '<div class="vq2-card" style="padding:14px;margin-top:12px">'
        + '<div class="vq2-label" style="margin-bottom:8px">Typst で PDF を作る</div>';

      /* 1) この端末で使えるか */
      h += '<div style="margin-bottom:10px">'
        + (t.available ? U.statusChip("success", "使えます")
                       : U.statusChip("warning", "準備中"))
        + '<span style="margin-left:8px">' + esc(t.note) + "</span>"
        + (cap.available && !cap.verified
            ? '<div class="vq2-hint" style="margin-top:6px">'
              + "「使えます」にするには、いちどコンパイルと検証を通してください。</div>"
            : "")
        + "</div>";

      if (!TR || !TS) {
        h += '<div class="vq2-hint">Typst Renderer が読み込まれていません。</div></div>';
        return h;
      }

      /* 2) 表紙・成果物 */
      h += '<div class="vq2-layout-grid">'
        + field({ label: "表紙", type: "select", key: "typstCover", value: s.typstCover,
                  options: [{ value: "none", label: "付けない（左寄せ1行の見出し）" },
                            { value: "full", label: "付ける（年度・試験名・注意事項・氏名欄）" }] })
        + "</div>";

      h += '<div style="margin-top:10px"><div class="vq2-label" style="margin-bottom:6px">生成する成果物</div>'
        + '<div style="display:flex;gap:14px;flex-wrap:wrap;line-height:1.6">'
        + tCheck("typstQuestion", "問題冊子", s.typstQuestion)
        + tCheck("typstAnswerSheet", "解答用紙", s.typstAnswerSheet)
        + tCheck("typstAnswerKey", "模範解答", s.typstAnswerKey)
        + tCheck("typstExplanation", "模範解答に解説も出す", s.typstExplanation)
        + "</div></div>";

      /* 3) この端末で組める範囲 */
      var cp = TS.capability();
      h += '<div class="vq2-hint" style="margin-top:10px">'
        + "Typst で専用に組めるのは " + cp.blocks.length + " 種類の並べ方です。"
        + "まだ組めない " + cp.unsupportedBlocks.length + " 種類が問題に含まれていると、"
        + "作らずに理由を出します（別の形にすり替えません）。"
        + "縦書きと数式の本組みはまだできません。</div>";

      /* 4) 操作 */
      h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">'
        + btn({ label: "Typst ソースを作る", icon: "sparkle", action: "typst-source" })
        + btn({ label: "この端末を調べ直す", icon: "refresh", action: "typst-probe" })
        + btn({ label: "PDF を作る", icon: "download", variant: "primary",
                action: "typst-compile", disabled: !cap.available })
        + "</div>";
      if (!cap.available) {
        h += '<div class="vq2-hint" style="margin-top:6px">'
          + "PDF は Typst がこの端末に入っていないと作れません。ソースはいま見られます。</div>";
      }

      /* 5) 生成した結果 */
      var r = st.typst;
      if (r) {
        if (!r.ok) {
          h += '<div class="vq2-card" style="padding:12px;margin-top:12px">'
            + U.statusChip("error", "作れません")
            + '<span style="margin-left:8px">' + esc(r.message || "") + "</span></div>";
        } else {
          h += '<div class="vq2-card" style="padding:12px;margin-top:12px">'
            + '<div class="vq2-label" style="margin-bottom:6px">できたもの</div>'
            + r.parts.map(function (p) {
                return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">'
                  + "<span>" + esc(p.label) + '<span class="vq2-muted">（'
                  + p.bytes + " バイトの Typst ソース）</span></span>"
                  + btn({ label: "ソースを見る", size: "sm", variant: "quiet",
                          action: "typst-view", id: p.id })
                  + "</div>";
              }).join("")
            + (r.warnings && r.warnings.length
                ? '<div class="vq2-hint" style="margin-top:6px">'
                  + esc(r.warnings.slice(0, 4).join(" ／ ")) + "</div>"
                : "")
            + "</div>";
        }
      }
      /* 6) コンパイルの状態とログ */
      if (st.typstCompile) {
        var c = st.typstCompile;
        h += '<div class="vq2-card" style="padding:12px;margin-top:12px">'
          + '<div class="vq2-label" style="margin-bottom:6px">コンパイル</div>'
          + "<div>" + esc(c.statusLabel) + "</div>"
          + (c.log ? '<pre style="margin-top:8px;max-height:160px;overflow:auto;white-space:pre-wrap;'
                     + 'font-size:12px">' + esc(c.log) + "</pre>" : "")
          + (c.pageCount ? "<div>ページ数 " + c.pageCount + "</div>" : "")
          + "</div>";
      }
      return h + "</div>";
    }
    function tCheck(key, label, on) {
      return '<label class="vq2-check" style="display:inline-flex"><input type="checkbox" data-key="'
        + key + '"' + (on ? " checked" : "") + "><span>" + esc(label) + "</span></label>";
    }

    /* Typst ソースを作る。PDF は作らない（作れる端末でだけ別の操作で作る）。 */
    function buildTypstSource() {
      var TR = VQ2.typstRenderer, LG2 = VQ2.layoutGrammar;
      var s = st.settings;
      if (!st.spec) {
        app.alert({ title: "まだ試験がありません", body: "先に問題を作ってください。" });
        return;
      }
      if (!TR || !LG2) { app.toast("Typst Renderer が読み込まれていません。", "error"); return; }
      var seed = s.layoutSeed || LPF.newSeed();
      var sem = LG2.buildSemanticPlan(st.spec, {
        rng: LPF.rng(seed + "|semantic"),
        documentFamily: s.documentFamily === "auto" ? null : s.documentFamily,
        subject: s.subjectLayout === "auto" ? null : s.subjectLayout,
        cover: s.typstCover === "full"
      });
      var out = TR.buildAll(st.spec, sem, { showExplanation: !!s.typstExplanation });
      if (!out.ok) {
        st.typst = { ok: false, message: (out.questionPaper && out.questionPaper.message)
                       || "Typst ソースを作れませんでした。" };
        render();
        return;
      }
      var parts = [];
      if (s.typstQuestion) parts.push({ id: "questionPaper", label: "問題冊子",
                                        source: out.questionPaper.source,
                                        bytes: out.questionPaper.source.length });
      if (s.typstAnswerSheet) parts.push({ id: "answerSheet", label: "解答用紙",
                                           source: out.answerSheet.source,
                                           bytes: out.answerSheet.source.length });
      if (s.typstAnswerKey) parts.push({ id: "answerKey", label: "模範解答",
                                         source: out.answerKey.source,
                                         bytes: out.answerKey.source.length });
      st.typst = { ok: true, seed: seed, parts: parts, warnings: out.warnings || [],
                   assets: out.questionPaper.assets || [] };
      render();
    }
    /* ── TeX の動き ─────────────────────────────────────────── */
    function buildTexSource() {
      var TR = VQ2.texRenderer, LG2 = VQ2.layoutGrammar;
      var s = st.settings;
      if (!st.spec) { app.alert({ title: "まだ試験がありません", body: "先に問題を作ってください。" }); return; }
      if (!TR || !LG2) { app.toast("TeX Renderer が読み込まれていません。", "error"); return; }
      var seed = s.layoutSeed || LPF.newSeed();
      var sem = LG2.buildSemanticPlan(st.spec, {
        rng: LPF.rng(seed + "|semantic"),
        documentFamily: s.documentFamily === "auto" ? null : s.documentFamily,
        subject: s.subjectLayout === "auto" ? null : s.subjectLayout,
        cover: s.typstCover === "full"
      });
      /* 組み方向はこの欄で選ぶ。Semantic Plan の既定より、
         人がここで選んだものを優先する。 */
      if (s.texVertical === "vertical") sem.writingDirection = "vertical";
      var out;
      try {
        out = TR.buildAll(st.spec, sem, { showExplanation: !!s.typstExplanation, cover: s.typstCover === "full" });
      } catch (e) {
        st.tex = { ok: false, message: "TeX ソースを作れませんでした: " + String(e && e.message || e) };
        render(); return;
      }
      if (!out.ok) {
        st.tex = { ok: false, message: (out.questionPaper && out.questionPaper.message)
                     || "TeX ソースを作れませんでした。" };
        render(); return;
      }
      st.tex = { ok: true, seed: seed, warnings: out.warnings || [], assets: out.assets || [],
        parts: [{ id: "question", label: "問題冊子", source: out.questionPaper.source },
                { id: "answerSheet", label: "解答用紙", source: out.answerSheet.source },
                { id: "answerKey", label: "模範解答", source: out.answerKey.source }] };
      render();
    }

    function probeTex(force) {
      var P = root.__vqLocalAI;
      if (!P || !P.url || !P.token) {
        LPF.setEngineCapability("tex",
          { available: false, reason: "ローカル Bridge につながっていないため、確かめられません。" });
        render(); return;
      }
      root.fetch(P.url() + "/tex/capability" + (force ? "?force=1" : ""),
                 { headers: { Authorization: "Bearer " + P.token() } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          if (!j) throw new Error("no");
          LPF.setEngineCapability("tex", {
            available: !!j.available, version: j.version,
            verified: !!(st.texCompile && st.texCompile.verified),
            reason: j.reason || ""
          });
          render();
        })
        .catch(function () {
          LPF.setEngineCapability("tex",
            { available: false, reason: "ローカル Bridge に問い合わせできませんでした。" });
          render();
        });
    }

    function compileTex() {
      var P = root.__vqLocalAI, r = st.tex;
      if (!r || !r.ok) { app.toast("先に TeX ソースを作ってください。", "info"); return; }
      if (!P || !P.url) { app.toast("ローカル Bridge につながっていません。", "error"); return; }
      st.texCompile = { statusLabel: "組版中です…", log: "", verified: false };
      render();
      root.fetch(P.url() + "/tex/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + P.token() },
        body: JSON.stringify({ source: r.parts[0].source, assets: r.assets || [] })
      }).then(function (res) { return res.json(); }).then(function (j) {
        var rep = j.report || {};
        st.texCompile = {
          statusLabel: j.ok ? "できました" : "作れませんでした（" + (rep.status || "") + "）",
          log: (rep.errors || []).map(function (e) { return e.message; })
                 .concat((rep.warnings || []).map(function (w) { return w.message; })).join("\n"),
          pageCount: rep.pageCount || 0,
          verified: !!j.ok,
          pdfBase64: j.pdfBase64 || null
        };
        LPF.setEngineCapability("tex", {
          available: !!(rep.tex && rep.tex.available),
          version: rep.tex && rep.tex.version,
          verified: !!j.ok,
          reason: j.ok ? "" : "組版がまだ通っていません。"
        });
        render();
      }).catch(function (e) {
        st.texCompile = { statusLabel: "ローカル Bridge と通信できませんでした。",
                          log: String(e && e.message || e), verified: false };
        render();
      });
    }

    function viewTexSource(id) {
      var r = st.tex;
      if (!r || !r.ok) return;
      var p = (r.parts || []).filter(function (x) { return x.id === id; })[0];
      if (!p) return;
      app.dialog({
        title: p.label + "の TeX ソース", wide: true,
        html: '<div class="vq2-hint" style="margin-bottom:8px">'
          + "このソースは VocabuQuiz が組み立てたものです。AI に書かせていません。</div>"
          + '<pre style="max-height:60vh;overflow:auto;white-space:pre-wrap;font-size:12px">'
          + esc(p.source) + "</pre>",
        okLabel: "閉じる"
      });
    }

    /* この端末に Typst があるかを Bridge へ聞く。
       聞けなかったときは「無い」ではなく「確かめられなかった」として残す。 */
    function probeTypst(force) {
      var P = root.__vqLocalAI;
      if (!P || !P.url || !P.token) {
        LPF.setEngineCapability("typst",
          { available: false, reason: "ローカル Bridge につながっていないため、確かめられません。" });
        render();
        return;
      }
      root.fetch(P.url() + "/typst/capability" + (force ? "?force=1" : ""),
                 { headers: { Authorization: "Bearer " + P.token() } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          if (!j) throw new Error("no");
          LPF.setEngineCapability("typst", {
            available: !!j.available, version: j.version,
            /* コンパイルと検証はまだ通していないので verified にしない */
            verified: !!(st.typstCompile && st.typstCompile.verified),
            reason: j.reason || ""
          });
          render();
        })
        .catch(function () {
          LPF.setEngineCapability("typst",
            { available: false, reason: "ローカル Bridge に問い合わせできませんでした。" });
          render();
        });
    }

    /* PDF を作る。Typst が無ければここへは来ない（ボタンが押せない）。 */
    function compileTypst() {
      var P = root.__vqLocalAI;
      var r = st.typst;
      if (!r || !r.ok) { app.toast("先に Typst ソースを作ってください。", "info"); return; }
      if (!P || !P.url) { app.toast("ローカル Bridge につながっていません。", "error"); return; }
      var part = r.parts[0];
      st.typstCompile = { statusLabel: "組版中です…", log: "", verified: false };
      render();
      root.fetch(P.url() + "/typst/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + P.token() },
        body: JSON.stringify({ source: part.source, assets: r.assets || [], png: true })
      }).then(function (res) { return res.json(); }).then(function (j) {
        var rep = j.report || {};
        st.typstCompile = {
          statusLabel: j.ok ? "できました" : "作れませんでした（" + (rep.status || "") + "）",
          log: (rep.errors || []).map(function (e) { return e.message + (e.detail ? "\n" + e.detail : ""); })
                 .concat((rep.warnings || []).map(function (w) { return w.message; })).join("\n"),
          pageCount: j.pages ? j.pages.length : 0,
          verified: !!j.ok
        };
        /* 本当に通ったときだけ「使えます」にする */
        LPF.setEngineCapability("typst", {
          available: !!(rep.typst && rep.typst.available),
          version: rep.typst && rep.typst.version,
          verified: !!j.ok,
          reason: j.ok ? "" : "コンパイルがまだ通っていません。"
        });
        render();
      }).catch(function (e) {
        st.typstCompile = { statusLabel: "ローカル Bridge と通信できませんでした。",
                            log: String(e && e.message || e), verified: false };
        render();
      });
    }

    function viewTypstSource(id) {
      var r = st.typst;
      if (!r || !r.ok) return;
      var p = (r.parts || []).filter(function (x) { return x.id === id; })[0];
      if (!p) return;
      app.dialog({
        title: p.label + "の Typst ソース",
        wide: true,
        html: '<div class="vq2-hint" style="margin-bottom:8px">'
          + "このソースは VocabuQuiz が組み立てたものです。AI に書かせていません。</div>"
          + '<pre style="max-height:60vh;overflow:auto;white-space:pre-wrap;font-size:12px">'
          + esc(p.source) + "</pre>",
        okLabel: "閉じる"
      });
    }

    /* 紙面デザインのプレビュー。
       まだ問題が無いときは、形が分かる最小の見本で組む（中身は作り話をしない）。 */
    function previewLayout() {
      var spec = st.spec;
      if (!spec) {
        app.alert({ title: "まだ試験がありません",
                    body: "先に問題を作ってください。作ったあとで、この形式での紙面を見られます。" });
        return;
      }
      var lay = layoutFromSettings();
      if (!lay) { app.toast("現在の形式のままです。", "info"); return; }
      var preview = JSON.parse(JSON.stringify(spec));
      preview.layout = lay;
      var lp = LPF.planLayout(preview, { settings: LPF.readLayoutSettings(preview) });
      if (!lp) {
        app.alert({ title: "この形式はまだ用意できていません",
                    body: "選んだ紙面デザインは準備中です。現在の形式で組みます。" });
        return;
      }
      /* 出す前に、構造として壊れていないかを必ず確かめる */
      var issues = LPF.validateLayout(preview, lp);
      var errs = LPF.errorsOf(issues);
      if (errs.length) {
        app.alert({ title: "この配置では紙面を作れません",
                    html: "<ul>" + errs.slice(0, 6).map(function (e) { return "<li>" + esc(e.message) + "</li>"; }).join("") + "</ul>" });
        return;
      }
      var plan = L.buildPlan(preview, { tuning: st.tuning });
      var html = R.buildHtml(preview, plan, { booklets: ["question-booklet", "printable-answer-sheet"] });
      st.layoutPreview = { html: html, seed: lp.seed, variants: lp.variants,
                           profileId: lp.layoutProfileId, answerProfileId: lp.answerSheetProfileId,
                           warnings: LPF.warningsOf(issues) };
      openLayoutPreview();
    }
    function openLayoutPreview() {
      var pv = st.layoutPreview;
      if (!pv) return;
      var used = Object.keys(pv.variants || {}).map(function (k) { return k + ": " + pv.variants[k]; }).join(" ／ ");
      app.dialog({
        title: "紙面デザインのプレビュー（開発者向け）",
        wide: true,
        html: '<div class="vq2-hint" style="margin-bottom:8px">'
          + "Seed <b>" + esc(pv.seed) + "</b>　" + esc(used) + "</div>"
          + '<div class="vq2-hint" style="margin-bottom:8px">'
          + "この見本は組み込みのレンダラで組んでいます（Typst / TeX ではありません）。</div>"
          + '<div class="vq2-lpv"><iframe class="vq2-lpv-f" title="紙面プレビュー"></iframe></div>',
        okLabel: "閉じる",
        onOpen: function (root2) {
          var f = root2.querySelector(".vq2-lpv-f");
          if (f) R.renderToIframe(f, pv.html);
        }
      });
    }

    function acc(key, title, summary, body) {
      return accHtml(key, title, summary, body, !!st.open[key]);
    }
    function summaryDetail() {
      var s = st.settings;
      var on = Object.keys(s.types).filter(function (k) { return s.types[k]; })
        .map(function (k) { return typeJa(k); });
      return "大問 " + s.sectionCount + " 問 ／ " + DIFF_JA[s.difficulty] + " ／ " + (on.join("・") || "形式が選ばれていません");
    }
    function summaryPaper() {
      var s = st.settings;
      return s.paperSize + " " + (s.orientation === "portrait" ? "縦" : "横")
        + " ／ " + (s.writingDirection === "vertical" ? "縦書き" : "横書き")
        + " ／ " + (TPL.get(s.templateId) ? TPL.get(s.templateId).displayName : s.templateId);
    }

    /* 開いている分類は st.open が覚える（既定は「選んでいる形式がある分類」）。 */
    function typesPicker() {
      return typesPickerHtml(typeGroups(st.settings.types), function (k) { return !!st.open[k]; });
    }

    function setupDetailHtml() {
      var s = st.settings;
      return '<div class="vq2-grid c2">'
        + field({ label: "大問数", type: "number", key: "sectionCount", value: s.sectionCount, min: 1, max: 20 })
        + field({ label: "設問数（0 でおまかせ）", type: "number", key: "questionCount", value: s.questionCount, min: 0, max: 200 })
        + "</div>"
        + '<div class="vq2-grid c2" style="margin-top:12px">'
        + field({ label: "難易度", type: "select", key: "difficulty", value: s.difficulty,
                  options: [{ value: "mixed", label: "混ぜる（おすすめ）" }, { value: "easy", label: "易しめ" },
                            { value: "normal", label: "標準" }, { value: "hard", label: "難しめ" }] })
        + field({ label: "学年", key: "grade", value: s.grade, placeholder: "高校3年" })
        + "</div>"
        + '<div class="vq2-grid c2" style="margin-top:12px">'
        + field({ label: "対象", key: "audience", value: s.audience, placeholder: "文系選択者" })
        + "</div>"
        + typesPicker()
        + '<div style="margin-top:16px"><div class="vq2-label" style="margin-bottom:6px">根拠のあつかい</div>'
        + '<label class="vq2-check"><input type="checkbox" data-key="sourceOnly"' + (!s.allowExternalKnowledge ? " checked" : "")
        + (isPromptOnly() ? " disabled" : "") + ">"
        + "<span>入れた資料だけを根拠にする<br><span class=\"vq2-hint\">資料で確かめられない内容には印が付きます。存在しない出典は作りません。</span></span></label>"
        + '<label class="vq2-check"><input type="checkbox" data-key="requireSources"' + (s.requireSources ? " checked" : "")
        + (isPromptOnly() ? " disabled" : "") + ">"
        + "<span>どの資料の何ページから作ったかを、設問ごとに残す</span></label>"
        /* 資料が無いときは、この 2 つは効かせようがない。灰色にして理由を書く。 */
        + (isPromptOnly()
            ? '<p class="vq2-hint">資料が無いあいだ、この 2 つは使いません（根拠にする資料も、指せる出典もありません）。</p>'
            : "")
        + "</div>";
    }

    function setupPaperHtml() {
      var s = st.settings;
      var eng = TPL.engineStatus();
      return '<div class="vq2-grid c3">'
        + field({ label: "用紙", type: "select", key: "paperSize", value: s.paperSize,
                  options: ["A4", "A3", "B4", "B5"].map(function (x) { return { value: x, label: x }; }) })
        + field({ label: "向き", type: "select", key: "orientation", value: s.orientation,
                  options: [{ value: "portrait", label: "縦置き" }, { value: "landscape", label: "横置き" }] })
        + field({ label: "書き方", type: "select", key: "writingDirection", value: s.writingDirection,
                  options: [{ value: "horizontal", label: "横書き" }, { value: "vertical", label: "縦書き（国語）" }] })
        + "</div>"
        + '<div class="vq2-grid c2" style="margin-top:12px">'
        + field({ label: "見た目のテンプレート", type: "select", key: "templateId", value: s.templateId,
                  options: TPL.list().filter(function (t) { return t.writingDirection === s.writingDirection; })
                    .map(function (t) { return { value: t.templateId, label: t.displayName }; }) })
        + field({ label: "答案の形", type: "select", key: "bookletMode", value: s.bookletMode,
                  options: [{ value: "separate-answer-sheet", label: "問題用紙と解答用紙を分ける" },
                            { value: "single", label: "問題用紙に直接書き込む" },
                            { value: "combined", label: "1 冊にまとめる" }] })
        + "</div>"
        + '<div style="margin-top:14px">'
        + '<label class="vq2-check" style="display:inline-flex;margin-right:14px"><input type="checkbox" data-key="answerKeyBooklet"' + (s.answerKeyBooklet ? " checked" : "") + "><span>正解と解説も作る</span></label>"
        + '<label class="vq2-check" style="display:inline-flex;margin-right:14px"><input type="checkbox" data-key="pageNumbering"' + (s.pageNumbering ? " checked" : "") + "><span>ページ番号を入れる</span></label>"
        + '<label class="vq2-check" style="display:inline-flex"><input type="checkbox" data-key="spread"' + (s.spread ? " checked" : "") + "><span>見開きで組む</span></label>"
        + "</div>"
        + '<div class="vq2-acc" style="margin-top:16px"><button type="button" class="vq2-acc-h" data-acc="fine" aria-expanded="'
        + (!!st.open.fine) + '"><span class="vq2-acc-t"><strong>余白と文字の大きさ</strong>'
        + '<span class="vq2-acc-sum">上下 ' + s.marginTop + "/" + s.marginBottom + "mm ／ 左右 " + s.marginLeft + "mm ／ 最小 " + s.minimumFontSize + "pt</span></span>"
        + '<span class="vq2-acc-c' + (st.open.fine ? " is-open" : "") + '">' + U.icon("chevronD") + "</span></button>"
        + (st.open.fine
            ? '<div class="vq2-acc-b"><div class="vq2-grid c2">'
              + field({ label: "上の余白（mm）", type: "number", key: "marginTop", value: s.marginTop, min: 5, max: 60 })
              + field({ label: "下の余白（mm）", type: "number", key: "marginBottom", value: s.marginBottom, min: 5, max: 60 })
              + "</div>"
              + '<div class="vq2-grid c2" style="margin-top:12px">'
              /* 右の余白は設定にはあったのに、入力欄が無かった（＝ずっと 18mm 固定）。
                 paperFromSettings は marginRight を読んでいるので、欄を出せば効く。 */
              + field({ label: "左の余白（mm）", type: "number", key: "marginLeft", value: s.marginLeft, min: 5, max: 60 })
              + field({ label: "右の余白（mm）", type: "number", key: "marginRight", value: s.marginRight, min: 5, max: 60 })
              + "</div>"
              + '<div class="vq2-grid c2" style="margin-top:12px">'
              + field({ label: "いちばん小さい文字（pt）", type: "number", key: "minimumFontSize", value: s.minimumFontSize, min: 6, max: 20 })
              + "</div>"
              + '<div style="margin-top:12px">'
              + field({ label: "組版エンジン", type: "select", key: "engine", value: s.engine,
                        options: [{ value: "auto", label: "自動（この端末で使えるもの）" },
                                  { value: "typst", label: "Typst（この端末には未導入）" },
                                  { value: "latex", label: "LaTeX（この端末には未導入）" }] })
              + '<div class="vq2-hint" style="margin-top:6px">' + esc(eng.builtin.note) + "</div>"
              + (s.engine !== "auto" && !eng[s.engine].available
                  ? '<div style="margin-top:8px">' + U.statusChip("warning", "未導入") + " " + esc(eng[s.engine].note)
                    + " 組み込みのレンダラで作ります。</div>"
                  : "")
              + "</div></div>"
            : "")
        + "</div>"
        + typeSettingHtml();
    }

    /* ── §41 本文の組み方と解答欄 ──────────────────────────────
       ここに出してよいのは **Renderer が実際に読む値だけ**。

       効くもの（layout.js の TUNABLES → plan → renderer が使う）
         ・行間        plan.lineHeight  → renderer の line-height
         ・本文の倍率  plan.fontScale   → renderer の基準 pt
         ・設問の間隔  plan.questionGapMm
         ・解答欄の行数・幅  answerLines / answerBoxWidth → 解答欄ブロック

       効かないもの（欄を作らない。作ると「動くふり」になる）
         ・段組み      plan.columns は組み立てるが Renderer が読んでいない
         ・配点の表示  紙面デザイン（プロファイル）が決めている
         ・名前欄      紙面デザイン（プロファイル）が決めている
       効かないものは、いまどうなっているかだけを見せる。 */
    function tuneVal(key, fallback) {
      var t = st.tuning || {};
      if (typeof t[key] === "number" && isFinite(t[key])) return t[key];
      if (st.plan && typeof st.plan[key] === "number") return st.plan[key];
      return fallback;
    }
    /* いまの見た目のテンプレートが、問題用紙の中に解答欄を置くか。
       置かないなら、解答欄の大きさをここで変えても紙面に届かない。 */
    function inlineAnswerTemplate() {
      var t = TPL.get(st.settings.templateId);
      return !!(t && (t.supportedFeatures || []).indexOf("inline-answer") >= 0);
    }
    function typeSettingHtml() {
      var s = st.settings;
      var open = !!st.open.typeset;
      /* いまの紙面デザインが決めている「配点の表示」と「名前欄」。 */
      var prof = LPF ? LPF.getProfile(LPF.resolveLayoutProfileId(s.layoutMode, null)) : null;
      var pts = prof ? (prof.sectionStyle && prof.sectionStyle.showPoints !== false) : true;
      var nameBox = prof ? (prof.header && prof.header.showNameBox !== false) : true;
      var h = '<div class="vq2-acc" style="margin-top:12px">'
        + '<button type="button" class="vq2-acc-h" data-acc="typeset" aria-expanded="' + open + '">'
        + '<span class="vq2-acc-t"><strong>本文の組み方と解答欄</strong>'
        + '<span class="vq2-acc-sum">行間 ' + tuneVal("lineHeight", 1.85)
        + " ／ 文字 ×" + tuneVal("fontScale", 1)
        + " ／ 設問の間隔 " + tuneVal("questionGapMm", 8) + "mm</span></span>"
        + '<span class="vq2-acc-c' + (open ? " is-open" : "") + '">' + U.icon("chevronD") + "</span></button>";
      if (!open) return h + "</div>";
      h += '<div class="vq2-acc-b"><div class="vq2-grid c2">'
        + field({ label: "本文の行間", type: "number", key: "t.lineHeight",
                  value: tuneVal("lineHeight", 1.85), min: 1.5, max: 2.2, step: 0.05 })
        + field({ label: "本文の文字の倍率", type: "number", key: "t.fontScale",
                  value: tuneVal("fontScale", 1), min: 0.9, max: 1.15, step: 0.01 })
        + "</div>"
        + '<div class="vq2-grid c2" style="margin-top:12px">'
        + field({ label: "設問どうしの間隔（mm）", type: "number", key: "t.questionGapMm",
                  value: tuneVal("questionGapMm", 8), min: 4, max: 16, step: 1 })
        + "</div>"
        /* 解答欄の大きさは、**問題用紙の中に解答欄を置く体裁のときだけ**効く。
           別紙の解答用紙は、設問ごとの解答定義（answerBindings）が
           行数を決めていて、ここの値は通らない（layout.js:427）。
           どの体裁でも出しておくと「入れたのに変わらない」になるので、
           効く体裁のときだけ出し、効かないときは理由を書く。 */
        + (inlineAnswerTemplate()
            ? '<div class="vq2-grid c2" style="margin-top:12px">'
              + field({ label: "解答欄の行数", type: "number", key: "t.answerLines",
                        value: (st.tuning && st.tuning.answerLines) || "", min: 1, max: 30, step: 1,
                        hint: "空欄なら設問の形式ごとに決めます" })
              + field({ label: "解答欄の幅（%）", type: "number", key: "t.answerBoxWidth",
                        value: (st.tuning && st.tuning.answerBoxWidth) || "", min: 20, max: 100, step: 5,
                        hint: "空欄なら設問の形式ごとに決めます" })
              + "</div>"
            : '<div class="vq2-card" style="padding:12px 14px;margin-top:12px">'
              + U.statusChip("info", "この体裁では変えられません")
              + '<span style="margin-left:8px">解答欄の行数と幅は、'
              + "問題用紙の中に解答欄を置く体裁（見た目のテンプレート「小テスト（1枚）」）"
              + "のときだけ変えられます。別紙の解答用紙では、設問ごとに決まった行数で組みます。</span></div>")
        + '<p class="vq2-hint" style="margin-top:10px">ここの値は、紙面を組むときに使います。'
        + "組んだあとに変えたときは「組み直す」を押してください。"
        + "問題文・正解・配点は変わりません（AI は動きません）。</p>"
        + (st.step === "artifacts"
            ? '<div style="margin-top:8px">'
              + btn({ label: "組み直す", icon: "refresh", size: "sm", action: "recompile" }) + "</div>"
            : "")
        /* ここから下は「いまどうなっているか」だけ。触れないので入力欄にしない。 */
        + '<div class="vq2-card" style="padding:12px 14px;margin-top:14px">'
        + '<div class="vq2-label" style="margin-bottom:6px">紙面デザインが決めているもの</div>'
        + "<div>配点の表示：" + (pts ? "出す" : "出さない") + "</div>"
        + "<div>氏名欄：" + (nameBox ? "置く" : "置かない") + "</div>"
        + '<div class="vq2-hint" style="margin-top:6px">この 2 つは紙面デザインごとに決まっています。'
        + "ここでは変えられません（変えられるふりをしません）。</div></div>"
        + '<div class="vq2-card" style="padding:12px 14px;margin-top:8px">'
        + U.statusChip("warning", "準備中")
        + '<span style="margin-left:8px">本文の段組み（2 段に割る）は、'
        + "いまの Renderer がまだ組めません。欄を出しても紙面が変わらないので出していません。</span></div>"
        + "</div>";
      return h + "</div>";
    }

    /* ── 構成案 ───────────────────────────────────────────── */
    function blueprintBodyHtml() {
      /* 進み具合と失敗の理由は右の AI の欄に出る。ここでは中身だけを見せる。 */
      var h = "";
      if (st.aiBusy) {
        h += '<div class="vq2-card">' + U.skeleton(4)
          + '<div class="vq2-hint" style="margin-top:8px">作っている手順は'
          + (app.isMobile() ? "「AI」の欄" : "右の欄") + "に出ます。</div></div>";
      }

      if (st.blueprint && st.blueprint.ok) {
        h += '<div class="vq2-card"><div class="vq2-sec-t">AI の構成案</div>'
          + '<div class="vq2-tblwrap"><table class="vq2-tbl"><thead><tr>'
          + "<th>大問</th><th>内容</th><th class=\"num\">配点</th><th class=\"num\">問数</th></tr></thead><tbody>"
          + st.blueprint.sections.map(function (s) {
              return "<tr><td>大問" + s.number + "</td><td>" + esc(s.title || "") + "</td>"
                + '<td class="num">' + (s.points == null ? "－" : s.points) + "</td>"
                + '<td class="num">' + (s.count == null ? "－" : s.count) + "</td></tr>";
            }).join("")
          + "</tbody></table></div>"
          + '<div class="vq2-row" style="margin-top:10px;justify-content:space-between">'
          + "<span>合計 " + st.blueprint.totalPoints + " 点 / " + st.blueprint.totalQuestions + " 問</span>"
          + (st.blueprint.totalPoints && st.blueprint.totalPoints !== st.settings.totalPoints
              ? U.statusChip("warning", "満点 " + st.settings.totalPoints + " 点と一致していません（生成時に調整します）")
              : U.statusChip("success", "満点と一致"))
          + "</div></div>";
      }
      if (st.blueprintText) {
        h += '<div class="vq2-card"><div class="vq2-label" style="margin-bottom:6px">AI の説明</div>'
          + '<div style="white-space:pre-wrap;line-height:1.8">' + esc(st.blueprintText) + "</div></div>";
      }
      if (!st.aiBusy && st.blueprint && !st.blueprint.ok && st.blueprintText) {
        h += '<div class="vq2-card">' + U.statusChip("warning", "読み取れませんでした")
          + " 構成案を表の形にできませんでした。上の説明をそのまま条件として使い、問題を作ることはできます。</div>";
      }
      return h;
    }

    function generatingHtml() {
      return '<div class="vq2-q"><div class="vq2-card">'
        + '<div class="vq2-sec-t">問題を作っています</div>'
        + '<div class="vq2-hint" style="margin-bottom:10px">'
        + "問題・正解・解説・配点・採点基準・出典をまとめて作ります。"
        + "大問ごとに分けて進むので、途中で止めてもそこまでは残ります。"
        + "進み具合は" + (app.isMobile() ? "「AI」の欄" : "右の欄") + "に出ます。</div>"
        + U.skeleton(5) + "</div></div>";
    }

    /* ── 内容の確認・編集 ──────────────────────────────── */
    function reviewHtml() {
      if (!st.spec) return U.empty({ title: "試験がありません" });
      var issues = st.finalizeResult ? st.finalizeResult.issues : [];
      var errs = V.errorsOf(issues), warns = V.warningsOf(issues);
      var qs = allQuestions();
      var h = '<div class="vq2-q" style="gap:16px">';

      h += '<div class="vq2-card"><div class="vq2-row" style="justify-content:space-between">'
        + "<div><div class=\"vq2-sec-t\" style=\"margin:0\">" + esc(st.spec.title) + "</div>"
        + '<div class="vq2-muted">' + esc(st.spec.subject || "") + " ・ " + st.spec.durationMinutes + " 分 ・ "
        + st.spec.totalPoints + " 点 ・ 大問 " + st.spec.sections.length + " ・ " + qs.length + " 問</div></div>"
        + (errs.length ? U.statusChip("error", errs.length + " 件の要修正")
           : warns.length ? U.statusChip("warning", warns.length + " 件の確認")
           : U.statusChip("success", "保存できます"))
        + "</div>";

      /* 観点別の内訳 */
      var crit = SA.criterionTotals(st.spec);
      var critKeys = Object.keys(crit).filter(function (k) { return crit[k] > 0; });
      if (critKeys.length) {
        h += '<div style="margin-top:12px" class="vq2-row">'
          + critKeys.map(function (k) { return U.badge(S.criterionLabel(k) + " " + crit[k] + " 点", "accent"); }).join("")
          + "</div>";
      }
      h += "</div>";

      /* 不備の中身は「検証」タブにまとめた。ここでは気づける印だけ置く。
         同じものを 2 か所に出すと、どちらで直すのか分からなくなる。 */
      if (st.audit && st.audit.total) {
        h += WS.inlineNotice({
          tone: st.audit.blocking ? "danger" : "warning",
          title: "足りない項目が " + st.audit.total + " 問あります",
          body: "正解・解説" + (requireSourcesNow() ? "・出典" : "") + "のどれかが抜けています。",
          action: btn({ label: "検証を見る", icon: "shield", size: "sm", variant: "ghost",
                        action: "qm-tab", id: "verify" })
        });
      }

      if (st.warnings.length) {
        h += '<div class="vq2-card"><div class="vq2-label" style="margin-bottom:6px">AI からの注意</div>'
          + st.warnings.slice(0, 8).map(function (w) {
              return '<div style="margin:4px 0">' + U.statusChip("warning", "注意") + " " + esc(w) + "</div>";
            }).join("") + "</div>";
      }
      if (errs.length) {
        h += '<div class="vq2-card"><div class="vq2-label" style="margin-bottom:6px">修正が必要</div>'
          + errs.slice(0, 10).map(function (e) {
              return '<div style="margin:4px 0">' + U.statusChip("error", "要修正") + " " + esc(e.message) + "</div>";
            }).join("") + "</div>";
      }

      /* 大問と設問 */
      st.spec.sections.forEach(function (sec) {
        h += '<div class="vq2-card"><div class="vq2-row" style="justify-content:space-between;margin-bottom:10px">'
          + '<div class="vq2-sec-t" style="margin:0">大問' + sec.number + "　" + esc(sec.title) + "</div>"
          + U.badge(sec.points + " 点") + "</div>";
        if (sec.instructions) h += '<div class="vq2-muted" style="margin-bottom:10px">' + esc(sec.instructions) + "</div>";
        sec.questions.forEach(function (q) {
          var open = st.selectedQ === q.id;
          h += '<div class="vq2-acc"><button type="button" class="vq2-acc-h" data-q="' + esc(q.id) + '"'
            + ' aria-expanded="' + (open ? "true" : "false") + '">'
            + U.badge("問" + q.number)
            + '<span class="vq2-acc-t">' + esc(String(q.prompt).slice(0, 70)) + "</span>"
            + U.badge(typeJa(q.type))
            + U.badge(q.points + " 点")
            + (q.requiresReview ? U.statusChip("warning", "要確認") : "")
            + icon(open ? "chevronU" : "chevronD") + "</button>"
            + (open ? '<div class="vq2-acc-b">' + questionEditHtml(q) + "</div>" : "")
            + "</div>";
        });
        h += "</div>";
      });

      /* 品質分析 */
      h += '<div class="vq2-card"><div class="vq2-row" style="justify-content:space-between;margin-bottom:10px">'
        + '<span class="vq2-sec-t" style="margin:0">試験の品質</span>'
        + (st.quality || st.qualityBusy ? "" : btn({ label: "確認する", icon: "sparkle", size: "sm", action: "quality" }))
        + "</div>";
      if (st.qualityBusy) {
        h += '<div class="vq2-row"><div class="vq2-spin"></div><span>試験全体を確認しています…</span></div>'
          + '<div id="actHost" style="margin-top:10px"></div>';
      } else if (st.quality) {
        h += qualityHtml(st.quality);
      } else {
        h += '<div class="vq2-muted">難易度の偏り・曖昧な設問・配点と難易度の不一致などを確認します。</div>';
      }
      h += "</div>";

      h += "</div>";
      return h;
    }

    /* ── 不備の一覧 ───────────────────────────────────────────
       解説・出典・正解が抜けたまま試験にすると、受験者に出てしまう。
       何が足りないかを問ごとに出し、AI に補わせるか、外すかを選べるようにする。 */
    function auditHtml() {
      if (!st.audit || !st.audit.total) {
        if (st.repairFixed.length || st.repairFilled.length) {
          return '<div class="vq2-card">' + U.statusChip("success", "不備なし")
            + " すべての設問に、正解・解説"
            + (requireSourcesNow() ? "・出典" : "") + "がそろっています。"
            + '<div class="vq2-hint" style="margin-top:6px">'
            + (st.repairFixed.length ? "自動で直した " + st.repairFixed.length + " 件" : "")
            + (st.repairFixed.length && st.repairFilled.length ? " ／ " : "")
            + (st.repairFilled.length ? "AI が補った " + st.repairFilled.length + " 問" : "")
            + "</div></div>";
        }
        return "";
      }
      var a = st.audit;
      var blockingIds = a.items.filter(function (i) { return i.blocking; })
        .map(function (i) { return i.questionId; });
      var kinds = Object.keys(a.byNeed).map(function (k) {
        return U.badge((MB.NEED_LABEL[k] || k) + " " + a.byNeed[k] + " 問", k === "answer" || k === "choices" ? "warning" : "");
      }).join("");

      var h = '<div class="vq2-card">'
        + '<div class="vq2-row" style="justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px">'
        + '<div><div class="vq2-sec-t" style="margin:0">足りない項目があります</div>'
        + '<div class="vq2-hint">このまま受験すると、答え合わせや見直しができません。</div></div>'
        + U.statusChip(a.blocking ? "error" : "warning", a.total + " 問")
        + "</div>"
        + '<div class="vq2-row" style="margin-bottom:10px">' + kinds + "</div>";

      if (a.blocking) {
        h += '<div class="vq2-note is-warn" style="margin-bottom:10px">' + U.statusChip("error", "受験できません")
          + " " + a.blocking + " 問は解答欄を作れないか、採点できません。補うか、試験から外してください。</div>";
      }

      h += '<div class="vq2-diff" style="max-height:260px;overflow:auto">'
        + a.items.slice(0, 40).map(function (i) {
            return '<button type="button" class="vq2-item" data-q="' + esc(i.questionId) + '" style="width:100%">'
              + U.badge("大問" + i.sectionNumber + " 問" + i.number)
              + '<span class="vq2-item-m"><span class="vq2-item-t">' + esc(i.prompt || "（問題文なし）") + "</span>"
              + '<span class="vq2-item-s">'
              + i.needs.map(function (n) {
                  return U.statusChip(MB.BLOCKING_NEEDS[n] ? "error" : "warning", MB.NEED_LABEL[n] || n);
                }).join("")
              + "</span></span></button>";
          }).join("")
        + (a.items.length > 40 ? '<div class="vq2-muted">ほか ' + (a.items.length - 40) + " 問</div>" : "")
        + "</div>";

      h += '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">'
        + btn({ label: "AI に補ってもらう", icon: "sparkle", variant: "primary", action: "repair",
                disabled: st.repairBusy || st.aiBusy })
        + (blockingIds.length
            ? btn({ label: "受験できない " + blockingIds.length + " 問を外す", icon: "trash",
                    variant: "danger", action: "drop-blocking" })
            : "")
        + btn({ label: "確かめ直す", icon: "refresh", variant: "quiet", action: "reaudit" })
        + "</div></div>";
      return h;
    }

    function questionEditHtml(q) {
      var h = "";
      /* この 1 問だけを作り直す。
         枠（配点・形式・番号）はそのまま、**中身だけ**を頼み直す。
         できるのは、試験コンパイラで作ったときだけ（どの枠かが分かるため）。 */
      var slot = st.compileResult && st.compileResult.slotOf ? st.compileResult.slotOf[q.id] : null;
      if (slot) {
        h += '<div class="vq2-fixrow" style="margin-bottom:10px">'
          + btn({ label: "この問題を作り直す", icon: "refresh", size: "sm", variant: "quiet",
                  action: "q-regen", id: q.id, disabled: st.aiBusy })
          + '<span class="vq2-hint">配点 ' + q.points + " 点・"
          + esc(typeJa(q.type)) + " のまま、中身だけを作り直します。"
          + "ほかの問題は変わりません。</span></div>";
      }
      h += field({ label: "問題文", type: "textarea", rows: 3, key: "q.prompt", value: q.prompt });
      if ((q.choices || []).length) {
        h += '<div class="vq2-label" style="margin:10px 0 6px">選択肢と正解</div><div class="vq2-q-choices">'
          + q.choices.map(function (c, i) {
              return '<div class="vq2-choice' + (c.isCorrect ? " is-correct" : "") + '">'
                + '<span class="vq2-choice-l">' + esc(c.label || String.fromCharCode(65 + i)) + "</span>"
                + '<span class="vq2-choice-m"><input type="text" class="vq2-input" data-key="q.choiceText" data-cid="' + esc(c.id) + '" value="' + esc(c.text) + '"></span>'
                + '<span class="vq2-choice-a">' + btn({ icon: "check", iconOnly: true, size: "sm",
                    variant: c.isCorrect ? "primary" : "quiet", action: "q-correct", id: c.id,
                    aria: "正解にする", pressed: c.isCorrect }) + "</span></div>";
            }).join("") + "</div>";
      } else {
        h += field({ label: "正解", key: "q.correctAnswer", value: q.correctAnswer || "" });
      }
      h += '<div class="vq2-grid c3" style="margin-top:10px">'
        + field({ label: "配点", type: "number", key: "q.points", value: q.points, min: 0 })
        + field({ label: "難易度", type: "select", key: "q.difficulty", value: q.difficulty,
                  options: [{ value: "easy", label: "易" }, { value: "normal", label: "標準" }, { value: "hard", label: "難" }] })
        + field({ label: "単元", key: "q.topic", value: q.topic })
        + "</div>";
      h += field({ label: "解説", type: "textarea", rows: 2, key: "q.explanation", value: q.explanation });

      if (q.scoringRubric && q.scoringRubric.items.length) {
        h += '<div class="vq2-label" style="margin:10px 0 6px">採点基準（合計 '
          + q.scoringRubric.items.reduce(function (a, r) { return a + r.points; }, 0) + " 点）</div>"
          + q.scoringRubric.items.map(function (r) {
              return '<div class="vq2-row" style="gap:8px;margin:4px 0">'
                + '<span style="flex:1 1 auto">' + esc(r.description) + "</span>"
                + U.badge(S.criterionLabel(r.criterionId)) + U.badge(r.points + " 点") + "</div>";
            }).join("");
      }
      if ((q.criterionAllocation || []).length) {
        h += '<div class="vq2-row" style="margin-top:10px">'
          + q.criterionAllocation.map(function (a) {
              return U.badge(S.criterionLabel(a.criterionId) + " " + a.points + " 点", "accent");
            }).join("") + "</div>";
      }
      if ((q.sourceReferences || []).length) {
        h += '<div style="margin-top:10px">' + q.sourceReferences.map(function (s) {
          return '<div class="vq2-src" style="margin-bottom:4px">' + icon("doc")
            + '<span class="vq2-src-n">' + esc(s.sourceName) + (s.page ? "（p." + s.page + "）" : "") + "</span></div>";
        }).join("") + "</div>";
      } else if (st.spec.sourceMode === "source-only") {
        h += '<div style="margin-top:10px">' + U.statusChip("warning", "出典なし")
          + " 資料限定の指定ですが、この設問には出典がありません。</div>";
      }
      return h;
    }

    function qualityHtml(d) {
      var h = "";
      if (d.sampleSize <= 1)
        h += '<div style="margin-bottom:10px">' + U.statusChip("info", "参考分析")
          + " 受験データがまだ無いため、以下は統計的な結論ではありません。</div>";
      if (d.summary) h += '<div style="line-height:1.8;margin-bottom:12px">' + esc(d.summary) + "</div>";
      if (!(d.findings || []).length) return h + '<div class="vq2-muted">修正が必要な明らかな問題は見つかりませんでした。</div>';

      h += d.findings.map(function (f, i) {
        var q = f.questionId ? questionById(f.questionId) : null;
        return '<div class="vq2-card" style="padding:12px;margin-bottom:8px">'
          + '<div class="vq2-row" style="gap:8px;margin-bottom:6px">'
          + U.statusChip(f.severity === "high" ? "error" : f.severity === "low" ? "info" : "warning",
                         f.severity === "high" ? "要対応" : f.severity === "low" ? "参考" : "確認")
          + (q ? U.badge("問" + q.number) : "") + "</div>"
          + "<div>" + esc(f.description) + "</div>"
          + (f.suggestedAction ? '<div class="vq2-muted" style="margin-top:4px">' + esc(f.suggestedAction) + "</div>" : "")
          + (typeof f.suggestedPoints === "number" && q
              ? '<div style="margin-top:8px">' + btn({ label: "配点を " + f.suggestedPoints + " 点にする",
                  size: "sm", action: "apply-finding", id: String(i) }) + "</div>" : "")
          + "</div>";
      }).join("");
      return h;
    }

    /* ── 紙面・成果物 ─────────────────────────────────── */
    function artifactsHtml() {
      return '<div style="display:flex;height:100%;min-height:0">'
        + '<div id="pdfHost" style="flex:1 1 auto;min-width:0;background:#eceaf3"></div>'
        + '<div class="vq2-resizer" id="rzA"></div>'
        + '<div class="vq2-pane vq2-pane-r" id="artPanel" style="width:380px">' + artifactsPanelHtml() + "</div>"
        + "</div>";
    }

    function artifactsPanelHtml() {
      var ins = st.inspection;
      var h = '<div class="vq2-pane-h">紙面と成果物</div><div class="vq2-pane-b" style="padding:14px;display:flex;flex-direction:column;gap:14px">';

      if (!ins) {
        h += '<div class="vq2-card"><div class="vq2-row"><div class="vq2-spin"></div><span>紙面を組んでいます…</span></div></div>';
      } else {
        var sum = ins.summary || { pageCount: 0, high: 0, medium: 0, low: 0 };
        h += '<div class="vq2-card"><div class="vq2-row" style="justify-content:space-between">'
          + "<span>" + sum.pageCount + " ページ</span>"
          + (sum.high ? U.statusChip("error", sum.high + " 件の要対応")
             : sum.medium ? U.statusChip("warning", sum.medium + " 件の確認")
             : U.statusChip("success", "問題なし")) + "</div>"
          + '<div class="vq2-hint" style="margin-top:6px">検査 ' + st.compileRounds + " 回"
          + ((st.fixNotes || []).length ? "／" + esc([...new Set(st.fixNotes)].join("・")) : "") + "</div></div>";

        if ((ins.issues || []).length) {
          h += '<div><div class="vq2-label" style="margin-bottom:6px">紙面の指摘</div>'
            + ins.issues.slice(0, 12).map(function (i) {
                return '<div class="vq2-card" style="padding:10px;margin-bottom:6px">'
                  + U.statusChip(i.severity === "high" ? "error" : i.severity === "low" ? "info" : "warning",
                                 i.page + " ページ")
                  + '<div style="margin-top:4px">' + esc(i.description) + "</div>"
                  + (i.suggestedAction ? '<div class="vq2-muted">' + esc(i.suggestedAction) + "</div>" : "")
                  + "</div>";
              }).join("") + "</div>";
        }

        h += '<div><div class="vq2-label" style="margin-bottom:6px">印刷・保存</div>'
          + '<div style="display:flex;flex-direction:column;gap:6px">'
          + btn({ label: "問題冊子を印刷", icon: "print", full: true, variant: "primary", action: "print", id: "question-booklet" })
          + (st.settings.bookletMode !== "single"
              ? btn({ label: "解答用紙を印刷", icon: "print", full: true, action: "print", id: "printable-answer-sheet" }) : "")
          + (st.settings.answerKeyBooklet
              ? btn({ label: "正解・解説を印刷", icon: "print", full: true, action: "print", id: "answer-and-explanation" }) : "")
          + "</div>"
          + '<div class="vq2-hint" style="margin-top:6px">印刷ダイアログで「PDF として保存」を選ぶと PDF になります。</div></div>';

        if (st.artifacts) {
          h += '<div><div class="vq2-label" style="margin-bottom:6px">成果物</div>'
            + '<div style="display:flex;flex-direction:column;gap:4px">'
            + Object.keys(st.artifacts).map(function (k) {
                return btn({ label: st.artifacts[k].filename, icon: "doc", size: "sm", variant: "ghost", full: true,
                             action: "download", id: k });
              }).join("") + "</div></div>";
        }

        /* §40 組んだあとでも紙面デザインを選び直せるようにする。
           問題は作り直さない（AI は動かない）。紙だけ組み直す。 */
        h += '<div><div class="vq2-label" style="margin-bottom:6px">紙面デザイン</div>'
          + field({ label: "", type: "select", key: "layoutMode", value: st.settings.layoutMode,
                    options: modeOptions(LPF.LAYOUT_MODES) })
          + '<div class="vq2-hint" style="margin-top:6px">'
          + "選び直すと紙面だけを組み直します。問題文・正解・配点は変わりません。"
          + "「準備中」を選んだときは、いまの紙面のまま出します。</div></div>";

        h += '<div><div class="vq2-label" style="margin-bottom:6px">紙面の調整</div>'
          + '<div class="vq2-grid c2">'
          + field({ label: "文字の倍率", type: "number", key: "t.fontScale", value: st.plan ? st.plan.fontScale : 1, min: 0.9, max: 1.15, step: 0.01 })
          + field({ label: "問題の間隔(mm)", type: "number", key: "t.questionGapMm", value: st.plan ? st.plan.questionGapMm : 8, min: 4, max: 16, step: 1 })
          + "</div>"
          + '<div style="margin-top:8px">' + btn({ label: "組み直す", icon: "refresh", size: "sm", action: "recompile" }) + "</div></div>";

        h += '<div style="margin-top:4px">' + btn({ label: "問題の編集へ戻る", variant: "quiet", full: true, action: "back-review" }) + "</div>";
      }
      h += "</div>";
      return h;
    }
    function renderArtifactsPanel() {
      var p = app.root.querySelector("#artPanel");
      if (p) { p.innerHTML = artifactsPanelHtml(); wireArtifacts(); }
    }
    function renderBlueprintBody() {
      var b = app.root.querySelector("#bpBody");
      if (b) { b.innerHTML = blueprintBodyHtml(); mountActivity(); }
    }

    /* ── 結線 ─────────────────────────────────────────── */
    /* 結線は 1 回だけ。U.on は app.root へ委譲で貼るので、
       中身を innerHTML で入れ替えても生き残る。描き直すたびに貼り直すと
       同じボタンで処理が何度も走る（開閉のような反転は元へ戻ってしまう）。 */
    function wire() {
      var r = app.root;
      mountActivity();
      if (r.__qmWired) { chat.startHero(); chat.paintEta(); wireArtifacts(); return; }
      r.__qmWired = true;
      wireArtifactsOnce();

      U.on(r, "click", '[data-act="close"]', function () { app.close("user"); });
      /* 段階を押して移る。**まだできていない先へは飛ばさない**（空の画面に着くだけ）。
         できていない段階を押したときは、なぜ行けないのかを伝える。 */
      U.on(r, "click", "[data-step]", function (e, t) {
        var id = t.getAttribute("data-step");
        var need = {
          review: [!!st.spec, "先に問題を作ってください。"],
          paper: [!!st.spec, "紙面は問題ができてから組めます。"],
          verify: [!!st.spec, "検証は問題ができてから行えます。"],
          artifacts: [!!st.artifacts, "紙面を作ると、ここに成果物が並びます。"]
        }[id];
        if (need && !need[0]) { app.toast(need[1], "info"); return; }
        /* 条件・教材は同じ画面（左の欄）。狭い画面では左を出す。 */
        if (id === "setup" || id === "sources") {
          st.stepId = id;
          st.step = "setup"; st.tab = "plan"; st.pane = "left"; render();
          if (id === "sources") {
            var card = app.root.querySelector("#qmSources");
            if (card && card.scrollIntoView) card.scrollIntoView({ block: "start", behavior: "smooth" });
          }
          return;
        }
        if (id === "blueprint") { st.stepId = id; st.step = "blueprint"; st.tab = "plan"; st.pane = "main"; render(); return; }
        if (id === "verify") { st.stepId = id; st.step = "review"; st.tab = "verify"; st.pane = "main"; render(); return; }
        if (id === "paper") { st.stepId = id; st.step = st.artifacts ? "artifacts" : "review"; st.tab = "paper"; st.pane = "main"; render(); return; }
        st.stepId = id; st.step = id; st.tab = tabForStep(id); st.pane = "main"; render();
      });
      /* 中央のタブ（構成案 / 問題 / 紙面 / 検証 / 成果物）*/
      U.on(r, "click", '[data-act="qm-tab"]', function (e, t) {
        /* タブ本体は data-tab、本文中の誘導ボタンは data-id で来る */
        st.tab = t.getAttribute("data-tab") || t.getAttribute("data-id") || "questions";
        st.pane = "main";
        render();
      });
      U.on(r, "click", '[data-act="qm-side"]', function () { st.sideOpen = !st.sideOpen; render(); });
      U.on(r, "click", '[data-act="qm-refill"]', function () {
        if (st.aiBusy) return;
        runGenerateV2({ refill: true });
      });
      /* 1 問だけ作り直す。その枠を空けてから、足りない枠だけを頼み直す。 */
      U.on(r, "click", '[data-act="q-regen"]', function (e, t) {
        if (st.aiBusy) return;
        var cr = st.compileResult;
        var slot = cr && cr.slotOf ? cr.slotOf[t.getAttribute("data-id")] : null;
        if (!slot || !cr.filled) { app.toast("この問題は作り直せません。", "info"); return; }
        app.confirm({
          title: "この問題を作り直しますか",
          body: "配点と形式はそのままで、中身だけを作り直します。いまの内容は戻せません。",
          okLabel: "作り直す"
        }).then(function (yes) {
          if (!yes) return;
          delete cr.filled[slot];
          chat.log("step", "1 問だけ作り直します（ほかの問題はそのままです）");
          runGenerateV2({ refill: true });
        });
      });
      U.on(r, "click", '[data-act="qm-pane"]', function (e, t) {
        st.pane = t.getAttribute("data-id") || "main"; render();
      });
      /* 段階の前後へ。押せる先しか出さないので、ここでは素直に移るだけ。 */
      U.on(r, "click", '[data-act="qm-step-prev"],[data-act="qm-step-next"]', function (e, t) {
        var steps = stepStates();
        var i = steps.findIndex(function (x) { return x.id === currentStepId(); });
        var to = steps[i + (t.getAttribute("data-act") === "qm-step-next" ? 1 : -1)];
        if (!to) return;
        var el = r.querySelector('[data-step="' + to.id + '"]');
        if (el) el.click();
      });
      /* 狭い画面のペイン切り替え（指示 / 内容 / AI）*/
      U.on(r, "click", "[data-pane]", function (e, t) {
        st.pane = t.getAttribute("data-pane"); render();
      });
      /* 検証タブから直す（ダイアログを出さずに、その場で直す） */
      U.on(r, "click", '[data-act="fix-structure"]', function (e, t) {
        applyStructureFix(t.getAttribute("data-id"), null);
      });
      /* 左ペインの折りたたみ */
      U.on(r, "click", '[data-act="qm-fold"]', function (e, t) {
        var k = t.getAttribute("data-fold");
        st.open[k] = !st.open[k];
        renderLeft();
      });
      /* 依頼欄の例示 */
      U.on(r, "click", '[data-act="qm-chip"]', function (e, t) {
        var v = t.getAttribute("data-chip") || "";
        st.instruction = st.instruction ? st.instruction.replace(/\s*$/, "") + "。" + v : v;
        renderLeft();
        var box = app.root.querySelector('[data-key="instruction"]');
        if (box) { try { box.focus(); box.setSelectionRange(box.value.length, box.value.length); } catch (x) {} }
      });

      /* 設定 */
      U.on(r, "input", "[data-key]", function (e, t) {
        var k = t.getAttribute("data-key");
        if (k === "instruction") { st.instruction = t.value; return; }
        if (k.indexOf("q.") === 0) { editQuestion(k.slice(2), t); return; }
        if (k.indexOf("t.") === 0) {
          var tuk = k.slice(2);
          if (String(t.value).trim() === "") delete st.tuning[tuk];
          else st.tuning[tuk] = Number(t.value);
          return;
        }
        if (k === "sourceOnly") { st.settings.allowExternalKnowledge = !t.checked; return; }
        if (t.type === "checkbox") st.settings[k] = t.checked;
        else if (t.type === "number") st.settings[k] = Number(t.value);
        else st.settings[k] = t.value;
      });
      U.on(r, "change", "[data-key]", function (e, t) {
        var k = t.getAttribute("data-key");
        if (k === "sourceOnly") { st.settings.allowExternalKnowledge = !t.checked; return; }
        if (k.indexOf("q.") === 0) { editQuestion(k.slice(2), t); return; }
        /* 紙面の微調整（§41）。空欄に戻したら「指定なし」へ戻す
           （0 を入れたことにすると、解答欄が 0 行の紙面が出る）。 */
        if (k.indexOf("t.") === 0) {
          var tk = k.slice(2);
          if (String(t.value).trim() === "") delete st.tuning[tk];
          else st.tuning[tk] = Number(t.value);
          return;
        }
        /* §17 外したページを使い直す。**次に作るときから効く。**
           いまある問題は作り直さない（AI は走らない）。そう言い切る。 */
        if (k === "includeExcludedPages") {
          st.settings.includeExcludedPages = t.checked;
          st.open.excl = true;
          renderLeft();
          app.toast(t.checked
            ? "次に作るときから、外したページも出題の対象に戻します。"
            : "外したページは出題に使いません。", "info", 6000);
          return;
        }
        if (t.type === "checkbox") { st.settings[k] = t.checked; return; }
        if (k === "writingDirection") {
          st.settings[k] = t.value;
          var rec = TPL.recommend({ subject: st.settings.subject, writingDirection: t.value });
          st.settings.templateId = rec.templateId;
          render();
          return;
        }
        /* 紙面デザインの選択は、その下に出す内容（Seed 欄・準備中の断り・
           使っている形式）を変える。選び直したら描き直す。 */
        if (k === "outputEngine" || k === "layoutMode" || k === "answerSheetMode"
            || k === "documentFamily" || k === "subjectLayout" || k === "typstCover"
            || k === "texVertical") {
          applyLayoutChoice(k, t.value);
          return;
        }
        if (t.type === "number") st.settings[k] = Number(t.value); else st.settings[k] = t.value;
      });
      U.on(r, "change", "[data-type]", function (e, t) {
        st.settings.types[t.getAttribute("data-type")] = t.checked;
        st.kind = "custom";        /* 手で触ったら型は「自分で決める」に移す */
        render();
      });
      /* 試験の型。押した時点の設定を上書きするが、名前や科目は残す。 */
      U.on(r, "click", "[data-kind]", function (e, t) {
        var id = t.getAttribute("data-kind");
        var k = KINDS.filter(function (x) { return x.id === id; })[0];
        st.kind = id;
        if (k && k.apply) {
          Object.keys(k.apply).forEach(function (key) {
            if (key === "types") {
              Object.keys(st.settings.types).forEach(function (tk) {
                st.settings.types[tk] = k.apply.types[tk] === true;
              });
            } else st.settings[key] = k.apply[key];
          });
        } else st.open.detail = true;   /* 「自分で決める」は細かい設定を開いて見せる */
        render();
      });
      /* 折りたたみの開閉 */
      U.on(r, "click", "[data-acc]", function (e, t) {
        var k = t.getAttribute("data-acc");
        st.open[k] = !st.open[k];
        render();
      });
      U.on(r, "click", '[data-act="attach"]', function () { pickAttachments(); });
      /* §44 ページごとの見立ての開閉（既定は畳む） */
      U.on(r, "click", '[data-act="qm-pages"]', function (e, t) {
        var k = "pages:" + t.getAttribute("data-id");
        st.pagesOpen[k] = !st.pagesOpen[k];
        renderLeft();
      });
      /* 資料ごとの「使う／使わない」（Phase 13 §1）。
         手で決めたことは自然文の解析より優先する。 */
      U.on(r, "change", '[data-act="useatt"]', function (e, t) {
        var id = t.getAttribute("data-id");
        var a = st.attachments.filter(function (x) { return String(x.id) === id; })[0];
        if (!a) return;
        a.included = !!t.checked;
        a.excludedReason = a.included ? null : "user_unchecked";
        render();
      });
      U.on(r, "click", '[data-act="blueprint"]', function () { runBlueprint(); });
      U.on(r, "click", '[data-act="generate"]', function () { runGenerate(); });
      U.on(r, "click", '[data-act="generate-direct"]', function () { st.blueprintText = ""; runGenerate(); });
      U.on(r, "click", '[data-act="back-setup"]', function () { st.step = "setup"; st.tab = "plan"; render(); });
      U.on(r, "click", '[data-act="back-review"]', function () { st.step = "review"; st.tab = "questions"; render(); });

      /* 確認・編集 */
      U.on(r, "click", "[data-q]", function (e, t) {
        var id = t.getAttribute("data-q");
        st.selectedQ = st.selectedQ === id ? null : id;
        render();
      });
      U.on(r, "click", '[data-act="q-correct"]', function (e, t) {
        var q = questionById(st.selectedQ); if (!q) return;
        var cid = t.getAttribute("data-id");
        q.choices.forEach(function (c) { c.isCorrect = (c.id === cid); });
        st.dirty = true; revalidate(); render();
      });
      U.on(r, "click", '[data-act="repair"]', function () { runRepair(); });
      U.on(r, "click", '[data-act="reaudit"]', function () { refreshAudit(); render(); });
      U.on(r, "click", '[data-act="drop-blocking"]', function () {
        refreshAudit();
        dropBroken((st.audit ? st.audit.items : []).filter(function (i) { return i.blocking; })
          .map(function (i) { return i.questionId; }));
      });
      U.on(r, "click", '[data-act="ai-stop"]', function () {
        st.cancelled = true; AI.cancel(); app.toast("停止しています…", "info");
      });
      /* 旧タブ（作る / AI）。ペインの言い換えとして残す。 */
      U.on(r, "click", "[data-mtab]", function (e, t) {
        st.pane = t.getAttribute("data-mtab") === "ai" ? "side" : "main"; render();
      });
      U.on(r, "click", '[data-act="quality"]', function () { runQuality(); });
      U.on(r, "click", '[data-act="apply-finding"]', function (e, t) {
        var i = parseInt(t.getAttribute("data-id"), 10);
        if (st.quality && st.quality.findings[i]) applyQualityFinding(st.quality.findings[i]);
      });
      U.on(r, "click", '[data-act="save"]', function () { saveMock(); });
      U.on(r, "click", '[data-act="artifacts"]', function () { buildArtifacts(); });

      /* ── 紙面デザイン：レイアウトだけ作り直す ──────────────────
         問題・正解・配点・ID・番号には一切さわらない。種だけを入れ替える。 */
      U.on(r, "click", '[data-act="layout-reseed"]', function () {
        st.settings.layoutSeed = LPF.newSeed();
        var reseeded = applyLayoutToSpec();
        render();
        if (reseeded) rebuildPaper();
        app.toast("レイアウトの種を新しくしました（問題の内容は変わりません）。", "success");
      });
      U.on(r, "click", '[data-act="layout-preview"]', function () { previewLayout(); });
      /* §40 紙面ステップのカードから紙面デザインを選ぶ。
         セレクトと同じ入口（applyLayoutChoice）を通る。AI は走らない。 */
      U.on(r, "click", '[data-act="qm-layout"]', function (e, t) {
        applyLayoutChoice("layoutMode", t.getAttribute("data-id"));
      });

      /* Typst */
      U.on(r, "click", '[data-act="typst-source"]', function () { buildTypstSource(); });
      U.on(r, "click", '[data-act="typst-view"]', function (e, t) {
        viewTypstSource(t.getAttribute("data-id"));
      });
      U.on(r, "click", '[data-act="typst-probe"]', function () { probeTypst(true); });
      U.on(r, "click", '[data-act="typst-compile"]', function () { compileTypst(); });
      U.on(r, "click", '[data-act="tex-source"]', function () { buildTexSource(); });
      U.on(r, "click", '[data-act="tex-view"]', function (e, t) {
        viewTexSource(t.getAttribute("data-id"));
      });
      U.on(r, "click", '[data-act="tex-probe"]', function () { probeTex(true); });
      U.on(r, "click", '[data-act="tex-compile"]', function () { compileTex(); });
      U.on(r, "click", '[data-act="start-exam"]', function () { startExam(); });

      wireArtifacts();
      chat.startHero();
      chat.paintEta();
      var ai = r.querySelector("#qmAi"), rz = r.querySelector("#rzQ");
      if (ai && rz && !app.isMobile()) U.makeResizer(rz, ai, { min: 300, max: 640, invert: true });
    }


    /* 描き直すたびに呼ばれる。**ここに U.on を書いてはいけない。**
       U.on は呼ぶたびに聞き手を足すだけで、外す仕組みが無い。
       実測: タブを 6 回切り替えるだけで app.root の聞き手が 18 個増えていた。
       委ねる形の結線（app.root への U.on）は wireArtifactsOnce() へ置き、
       ここには「その回の要素そのもの」に触る処理だけを残す。 */
    function wireArtifacts() {
      var r = app.root;
      var panel = r.querySelector("#artPanel"), rz = r.querySelector("#rzA");
      if (panel && rz && !app.isMobile()) U.makeResizer(rz, panel, { min: 300, max: 620, invert: true });
    }

    function wireArtifactsOnce() {
      var r = app.root;
      U.on(r, "click", '[data-act="print"]', function (e, t) {
        var res = R.printBooklet(st.spec, st.plan, t.getAttribute("data-id"));
        if (!res.ok) app.toast(res.message || "印刷できませんでした。", "error", 6000);
      });
      U.on(r, "click", '[data-act="download"]', function (e, t) {
        var a = st.artifacts && st.artifacts[t.getAttribute("data-id")];
        if (a && R.downloadArtifact(a)) app.toast(a.filename + " を保存しました。", "success");
        else app.toast("保存できませんでした。", "error");
      });
      U.on(r, "click", '[data-act="recompile"]', function () {
        st.compileRounds = 0; st.fixNotes = [];
        compileLoop();
      });
    }

    function editQuestion(key, t) {
      var q = questionById(st.selectedQ); if (!q) return;
      if (key === "prompt") q.prompt = t.value;
      else if (key === "explanation") q.explanation = t.value;
      else if (key === "topic") q.topic = t.value;
      else if (key === "correctAnswer") { q.correctAnswer = t.value; q.acceptedAnswers = t.value ? [t.value] : []; }
      else if (key === "difficulty") q.difficulty = t.value;
      else if (key === "points") {
        var v = Number(t.value);
        if (!isFinite(v) || v < 0) return;
        q.points = v;
        /* 配点を触ったら全体を必ず取り直す。合計がずれたまま進ませない。 */
        var alloc = SA.allocate(st.spec, { targetTotal: st.spec.totalPoints });
        if (alloc.ok) st.spec = alloc.spec;
      } else if (key === "choiceText") {
        var c = (q.choices || []).find(function (x) { return x.id === t.getAttribute("data-cid"); });
        if (c) c.text = t.value;
      }
      st.dirty = true;
      revalidate();
    }

    /* ══════════════════════════════════════════════════════════
       分割アップロード（Preset Engine にある uploader.js をそのまま呼ぶ）

       ・資料を**選んだ時点で**送り始める（生成ボタンを押してからではない・§34）
       ・要求 JSON に載るのは jobId と attachmentId だけ。本体も base64 も載らない
         → サーバ側で contentHash が付き、解析キャッシュが効くようになる
       ・本体が JSON に載らないので、ページ画像の 12 枚の頭打ちも要らない
       uploader.js は他の担当なので、ここでは**呼ぶだけ**にする。
       ══════════════════════════════════════════════════════════ */
    function upSession() {
      if (!st.upSession) {
        st.upSession = new VQ2.upload.Session({
          jobId: st.upJobId || null,
          onChange: function () { syncUploads(); }
        });
      }
      return st.upSession;
    }
    /* 送信中のようすを画面へ写す。ここが唯一の書き換え口。 */
    function syncUploads() {
      var S = st.upSession;
      if (!S) return;
      st.upJobId = S.jobId;
      /* 何をどこへ送ったのかを、外から確かめられる形で置く（検証用）。 */
      try { VQ2.__qmUpload = { jobId: S.jobId, files: S.tasks.map(function (t) {
        return { name: t.name, state: t.state, attachmentId: t.attachmentId,
                 isPageImage: !!t.isPageImage };
      }) }; } catch (e) {}
      st.upRows = S.tasks.filter(function (t) { return !t.isPageImage; })
        .map(function (t) {
          var p = t.progress();
          return { id: t.id, name: t.name, kind: t.kind, size: t.size, state: t.state,
                   stateText: (VQ2.upload.TASK_STATE || {})[t.state] || "",
                   message: t.message || "", label: p.label, percent: p.percent,
                   attachmentId: t.attachmentId, jobId: t.jobId };
        });
      render();
    }
    /* この端末で文章を取り出す（PDF・DOCX・ZIP・テキスト）。
       画像はここを通さない（読み取りは AI 側の仕事）。 */
    function extractLocally(files, tasks) {
      var F = root.__vqChatFiles;
      var need = tasks.filter(function (t) { return t.kind !== "image" && t.state === "uploaded"; });
      if (!F || !need.length) return Promise.resolve();
      var pick = files.filter(function (f) {
        return need.some(function (t) { return t.name === f.name && t.size === f.size; });
      });
      if (!pick.length) return Promise.resolve();
      return Promise.resolve(F.add(pick)).then(function () {
        return waitExtract(F);
      }).then(function (items) {
        need.forEach(function (t) {
          var it = items.filter(function (x) { return x.name === t.name; })[0];
          if (!it) return;
          t.extractedText = String(it.text || "");
          t.pageCount = it.pageCount || 0;
          t.pages = (it.pages || []).filter(function (p) { return p.text; })
            .map(function (p) { return p.pageNumber; });
          t.pageImages = it.pageImages || [];
        });
        /* 文字の取れなかったページは画像として**送ってから** ID で指す。
           ここでも base64 を要求へ載せない。 */
        return uploadPageImages(need);
      }).catch(function () { /* 取り出せなくても、本体は送れている */ });
    }
    function waitExtract(F) {
      return new Promise(function (res) {
        var t0 = Date.now();
        (function poll() {
          var items = F.list();
          var busy = items.some(function (x) {
            return x.status === "queued" || x.status === "extracting";
          });
          if ((!busy && items.length) || Date.now() - t0 > 180000) { res(items); return; }
          root.setTimeout(poll, 300);
        })();
      });
    }
    /* ページ画像を送る。1 ページ = 1 添付として、親の ID を持たせる。
       上限は Bridge の maxScanPages。**JSON に載せないので 12 枚の頭打ちは使わない。** */
    function uploadPageImages(tasks) {
      var S = upSession();
      var jobs = [];
      tasks.forEach(function (t) {
        (t.pageImages || []).forEach(function (pi) {
          var b64 = String(pi.dataUrl || "");
          var c = b64.indexOf(",");
          if (c < 0) return;
          jobs.push({ parent: t, pageNumber: pi.pageNumber, data: b64.slice(c + 1) });
        });
      });
      if (!jobs.length) return Promise.resolve();

      /* ══ 本当の天井は「1 ジョブあたりのファイル数」════════════════

         ここは以前 maxScanPages（200）を上限にしていた。
         しかし Bridge が実際に受けるのは **1 ジョブ 20 ファイル**まで
         （uploader.js の maxFilesPerJob / server.mjs の TOO_MANY_FILES）。
         21 枚目からはサーバが 413 を返して失敗するが、
         ページ画像は資料の一覧から外してあるので**画面には何も出ない**。
         48 ページの資料が 20 ページで終わったことに誰も気づけなかった。

         いま残っている枠は「上限 − すでに送ったファイル数」。
         そこに収め、**入りきらなかったページ番号を必ず知らせる**。 */
      return Promise.resolve(
        (VQ2.upload && VQ2.upload.limits) ? VQ2.upload.limits() : null
      ).catch(function () { return null; }).then(function (lim) {
        var maxFiles = (lim && lim.maxFilesPerJob) || 20;
        var used = S.tasks.filter(function (t) {
          return t.state !== "failed" && t.state !== "expired";
        }).length;
        var scanCap = (U.scanPageLimit && U.scanPageLimit({ transport: "upload" })) || 200;
        var room = Math.max(0, Math.min(scanCap, maxFiles - used));
        var take = jobs.slice(0, room);
        var left = jobs.slice(room);

        if (left.length) {
          var pages = left.map(function (j) { return j.pageNumber; });
          var head = pages.slice(0, 12).join("、") + (pages.length > 12 ? " ほか" : "");
          /* 黙って切り捨てない。何ページが送れていないかを必ず出す。 */
          chat.log("warn", "画像として送れたのは " + take.length + " ページまでです。"
            + "1 度に取り込めるのは " + maxFiles + " 件までなので、"
            + left.length + " ページ（" + head + "）は送っていません。"
            + "資料を分けて取り込むか、ページを絞ってください。");
          app.toast(left.length + " ページは送れませんでした（1 度に "
            + maxFiles + " 件まで）。", "warning", 9000);
          try {
            st.pageImageShortfall = { sent: take.length, skipped: pages, maxFiles: maxFiles };
          } catch (e) {}
        } else {
          try { st.pageImageShortfall = null; } catch (e) {}
        }
        return take;
      }).then(function (take) {
        return take.reduce(function (chain, j) {
        return chain.then(function () {
          var bin = root.atob(j.data);
          var arr = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          var file = new root.File([arr], j.parent.name + "（" + j.pageNumber + "ページ）.png",
                                   { type: "image/png" });
          /* 印は送り始める前に立てる（あとからだと一覧に 1 行できてしまう）。 */
          return S.add([file], { mark: {
            isPageImage: true,
            parentAttachmentId: j.parent.attachmentId,
            pageNumber: j.pageNumber
          } });
        });
        }, Promise.resolve());
      });
    }

    /* 資料ひとまとまりの札。同じ資料かどうかを **中身で**見分けるために持つ。
       添付 ID は付け直すたびに変わるので、鍵には使えない。 */
    function refreshDocFingerprint(S) {
      try {
        if (!VQ2.upload || !VQ2.upload.fingerprint || !S || !S.jobId) { st.docFingerprint = null; return; }
        /* **使う資料だけ**から作る。外した資料は札に入れない
           （外したのに前の読み取りをそのまま使う、を防ぐ）。 */
        var ids = (st.attachments || [])
          .filter(function (a) { return a && a.included !== false && a.id; })
          .map(function (a) { return a.id; });
        if (!ids.length) {
          ids = (S.tasks || []).filter(function (t) { return t.state === "uploaded"; })
            .map(function (t) { return t.attachmentId; }).filter(Boolean);
        }
        VQ2.upload.fingerprint(S.jobId, ids).then(function (r) {
          st.docFingerprint = r ? r.fingerprint : null;
        }, function () { st.docFingerprint = null; });
      } catch (e) { st.docFingerprint = null; }
    }

    function pickUploads() {
      var input = doc.createElement("input");
      input.type = "file"; input.multiple = true;
      input.accept = ".pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.csv,.json,.docx,.zip";
      input.addEventListener("change", function () {
        var files = Array.prototype.slice.call(input.files || []);
        if (!files.length) return;
        var S = upSession();
        st.attachBusy = true;
        chat.log("step", files.length + " 件の資料を送っています"
          + "（本体は要求へ載せず、8MiB ずつ送ります）");
        render();
        /* 送信 → この端末での本文取り出し → ページ画像の送信、まで 1 本の約束。
           ここを待たずに生成へ入ると、資料が付いていないまま作り始める。 */
        Promise.resolve(S.add(files)).then(function (tasks) {
          return extractLocally(files, tasks).then(function () { return tasks; });
        }).then(function (tasks) {
          st.attachments = attachmentsFromUploads(S.tasks, st.attachments);
          st.attachBusy = false;
          syncUploads();
          /* 資料ひとまとまりの札をもらっておく（中身から作られる）。
             これがあると、同じ資料を選び直しても読み直さずに済む。
             取れなくても止めない（今までどおりの動きに落ちるだけ）。 */
          refreshDocFingerprint(S);
          var ok = tasks.filter(function (t) { return t.state === "uploaded"; });
          var ng = tasks.filter(function (t) { return t.state === "failed" || t.state === "expired"; });
          if (ok.length) {
            chat.log("done", ok.length + " 件の資料を送り終えました"
              + "（要求には置き場所の ID だけを載せます）");
            app.toast("資料 " + ok.length + " 件を送りました。", "success");
          }
          if (ng.length) {
            chat.log("warn", ng.length + " 件は送れませんでした："
              + (ng[0].message || ng[0].error || "もう一度お試しください"));
            app.toast(ng.length + " 件は送れませんでした。", "warning", 7000);
          }
          render();
        }).catch(function () {
          st.attachBusy = false;
          syncUploads();
          app.toast("資料を送れませんでした。", "error");
        });
      });
      input.click();
    }

    /* 資料の添付。読み取りは共通実装に任せる（PDF はページごと、画像は Vision へ）。 */
    function pickAttachments() {
      /* 分割アップロードの口があるなら、そちらへ。本体を要求 JSON へ載せない。 */
      if (useUploadRoute({ upload: VQ2.upload, localAI: root.__vqLocalAI })) {
        pickUploads();
        return;
      }
      U.pickAttachments({
        /* 文字層の無いページを画像として渡す（Phase 13 §3）。
           無視すると、資料の中身が見えないまま体裁だけで出題される。 */
        pageImages: true,
        onStart: function (n) {
          st.attachBusy = true; render();
          app.toast(n + " 件を読み込んでいます…", "info");
        }
      }).then(function (r) {
        st.attachBusy = false;
        if (!r) { render(); return; }
        /* 既定は「使う」。ページ画像（親のぶら下がり）は一覧に出さない。 */
        st.attachments = r.attachments.map(function (a) {
          if (a.included == null) a.included = true;
          return a;
        });
        var unread = st.attachments.reduce(function (a, x) { return a + (x.unreadablePages || 0); }, 0);
        if (unread) chat.log("warn", "文字も画像も読み取れなかったページが " + unread + " ページあります。");
        render();          /* 設定側にも読み取った資料を出すので全体を描き直す */
        if (r.attachments.length) app.toast("資料 " + r.attachments.length + " 件を読み込みました。", "success");
        if (r.failed.length) {
          app.toast(r.failed.length + " 件は読み取れませんでした（"
            + (r.failed[0].error || "形式を確認してください") + "）", "warning", 7000);
        }
      }).catch(function (e) {
        st.attachBusy = false; render();
        if (e && e.message === "NO_FILE_MODULE") {
          app.alert({ title: "資料を添付できません", body: "添付の処理部品が読み込まれていません。" });
        } else app.toast("資料の読み込みに失敗しました。", "error");
      });
    }

    return app;
  }

  /* spreadCounts / batchRequired はテストから直接確かめられるように出しておく
     （画面の動きに影響しない純関数）。 */
  VQ2.quickMock = {
    open: open, _spreadCounts: spreadCounts, _batchRequired: batchRequired, MAX_PER_CALL: MAX_PER_CALL,
    /* Phase 13 の純関数。AI を使わずに確かめられるように出しておく。 */
    _parseExclusions: parseExclusions,
    _buildRetrievalQuery: buildRetrievalQuery,
    _parseTypeRequest: parseTypeRequest,
    _resolveTypeMix: resolveTypeMix,
    _spreadTypes: spreadTypes,
    /* 契約 Phase 1 の純関数。画面を開かずに確かめられるように出しておく。 */
    _mockTypeIds: mockTypeIds,
    _typeGroups: typeGroups,
    _typesPickerHtml: typesPickerHtml,
    _typeJa: typeJa,
    _draftTypeOf: draftTypeOf,
    _applyTypeDistribution: applyTypeDistribution,
    _layoutEffect: layoutEffect,
    LAYOUT_NO_EFFECT_NOTE: LAYOUT_NO_EFFECT_NOTE,
    /* §44 資料の状態。サーバから届いた値を写すだけの純関数。 */
    _analysisFromActivity: analysisFromActivity,
    _pageReportFromActivity: pageReportFromActivity,
    _sourceStateRows: sourceStateRows,
    _excludedPageRows: excludedPageRows,
    _includePhraseFor: includePhraseFor,
    _withSourcePolicy: withSourcePolicy,
    INCLUDE_EXCLUDED_PHRASE: INCLUDE_EXCLUDED_PHRASE,
    PAGE_KIND_JA: PAGE_KIND_JA,
    PAGE_KIND_WHY_JA: PAGE_KIND_WHY_JA,
    EXCLUDE_REASON_JA: EXCLUDE_REASON_JA,
    DOC_KIND_JA: DOC_KIND_JA,
    /* §40 紙面デザインの一覧と、選び直したときの動き。 */
    _layoutCatalog: layoutCatalog,
    _layoutStatusOf: layoutStatusOf,
    _layoutDescription: layoutDescription,
    _layoutRecommendations: layoutRecommendations,
    _layoutChangeActions: layoutChangeActions,
    _nameMatch: nameMatch,
    _fileStem: fileStem,
    /* 資料の運び方（参照形式）と、進みぐあい。どちらも AI を呼ばずに確かめられる。 */
    _useUploadRoute: useUploadRoute,
    _attachmentsFromUploads: attachmentsFromUploads,
    _isByReference: isByReference,
    _plannedRequestCount: plannedRequestCount,
    _slotNumbersFor: slotNumbersFor,
    _progressLine: progressLine,
    _applyProgress: applyProgress
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
