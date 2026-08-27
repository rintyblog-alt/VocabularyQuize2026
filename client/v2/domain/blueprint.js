/* ══════════════════════════════════════════════════════════════════════
   AI 計画エンジン（V3 §11〜§16）

   「資料を渡して、いい感じに 10 問作って」と一度で頼むと、ほぼ全部 4 択になる。
   問題文を書かせる **前に** 次を決める。

     ① 何を頼まれたのか（Requirement Extraction）
     ② 教材に何があるのか（Content Analysis）
     ③ そこから作れる形式はどれか（Candidate Selection）
     ④ どの形式を何問、なぜ使うのか（Blueprint）
     ⑤ その配分は偏っていないか（Distribution Validator）

   ここは **文章を書かない**。何を作るかだけを決める。
   決めたことは人が見て直せる形で返す（黙って確定しない）。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var Q = VQ2.qtypes, M = VQ2.qmodel;
  if (!Q) throw new Error("VQ2.qtypes must be loaded before blueprint.js");

  function arr(v) { return Array.isArray(v) ? v : []; }
  function str(v) { return v === undefined || v === null ? "" : String(v); }
  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function uniq(a) { var s = {}; return arr(a).filter(function (x) { if (s[x]) return false; s[x] = 1; return true; }); }

  /* ══════════════════════════════════════════════════════════════════
     ① 何を頼まれたのか
     ・自然文から読み取ったものを、**そのまま確定しない**。
       読み取れたかどうかを stated に残し、画面で直せるようにする。
     ══════════════════════════════════════════════════════════════════ */
  var NO_PATTERNS = [
    { key: "noFourChoice", re: /(4\s*択|四択|選択式|選択肢)(を|は)?(使わない|なし|禁止|使用しない|入れない|除く)/ },
    { key: "noFourChoice", re: /(選択式|4\s*択|四択)以外/ },
    { key: "noWriting",    re: /(記述|作文|論述|小論文)(を|は)?(使わない|なし|禁止|使用しない|入れない|除く)/ },
    { key: "noAiGrading",  re: /(ai\s*採点|自動採点)(を|は)?(使わない|なし|禁止|使用しない)/i },
    { key: "noImage",      re: /(画像|図|写真)(を使う問題|問題)?(は)?(使わない|なし|禁止|使用しない|入れない)/ },
    { key: "noAudio",      re: /(音声|リスニング)(問題)?(は)?(使わない|なし|禁止|使用しない|入れない)/ }
  ];
  var STYLE_HINTS = [
    { style: "choice_heavy", re: /選択式(を)?(多め|中心|メイン)/ },
    { style: "write_heavy",  re: /記述(を)?(多め|中心|メイン)|論述中心/ },
    { style: "memorize",     re: /暗記(中心|重視)|単語(を)?(覚え|暗記)/ },
    { style: "understand",   re: /理解(中心|重視)|考えさせ/ },
    { style: "exam",         re: /試験形式|本番|入試|定期テスト形式/ },
    { style: "game",         re: /ゲーム|さくさく|スピード/ }
  ];
  var DIFFICULTY_HINTS = [
    { v: "easy",   re: /やさしく|易しく|簡単|基礎|入門/ },
    { v: "hard",   re: /難しく|難関|応用|発展|ハイレベル/ },
    { v: "normal", re: /標準|ふつう|普通/ }
  ];

  function parseCount(text) {
    try { if (VQ2.draft && VQ2.draft.parseCount) return VQ2.draft.parseCount(text) || 0; } catch (e) {}
    var m = str(text).match(/(\d+)\s*問/);
    return m ? Math.min(500, parseInt(m[1], 10)) : 0;
  }

  function extractRequirements(instruction, opts) {
    opts = opts || {};
    var t = str(instruction);
    var lower = t.toLowerCase();
    var stated = {};
    var req = {
      instruction: t,
      subject: str(opts.subject),
      unit: str(opts.unit),
      grade: str(opts.grade),
      totalQuestions: 0,
      difficulty: "",
      style: "",
      requestedTypes: arr(opts.requestedTypes).slice(),
      excludedTypes: arr(opts.excludedTypes).slice(),
      noFourChoice: opts.noFourChoice === true,
      noWriting: opts.noWriting === true,
      noAiGrading: opts.noAiGrading === true,
      noImage: opts.noImage === true,
      noAudio: opts.noAudio === true,
      minimumTypeCount: isNum(opts.minimumTypeCount) ? opts.minimumTypeCount : 0,
      maximumSameTypeRatio: isNum(opts.maximumSameTypeRatio) ? opts.maximumSameTypeRatio : 0,
      sourceLimited: opts.sourceOnly === true,
      mode: opts.mode === "mock" ? "quick_mock" : "preset",
      /* 読み取りの途中で「言われたとおりではない扱い」をしたときの記録（契約 §6）。
         黙って変えない。空でも欄は必ず用意する（呼び出し側が分岐しなくて済むように）。 */
      warnings: [],
      converted: [],
      stated: stated
    };
    function note(message, conv) {
      req.warnings.push(message);
      if (conv) req.converted.push(conv);
    }

    var n = parseCount(t);
    if (n > 0) { req.totalQuestions = n; stated.totalQuestions = true; }
    else req.totalQuestions = isNum(opts.count) ? opts.count : 10;

    NO_PATTERNS.forEach(function (p) {
      if (p.re.test(t) || p.re.test(lower)) { req[p.key] = true; stated[p.key] = true; }
    });
    STYLE_HINTS.forEach(function (s) { if (!req.style && s.re.test(t)) { req.style = s.style; stated.style = true; } });
    DIFFICULTY_HINTS.forEach(function (d) { if (!req.difficulty && d.re.test(t)) { req.difficulty = d.v; stated.difficulty = true; } });
    if (!req.style) req.style = str(opts.style) || "auto";
    if (!req.difficulty) req.difficulty = str(opts.difficulty) || "normal";

    /* 「〜だけ」「〜のみ」で形式を名指ししているとき。
       名指しされた形式が使えなくても、黙って 4 択へ置き換えない（§14）。 */
    var only = namedTypes(t, /(だけ|のみ)/);
    var named = only.length ? [] : namedTypes(t, null);

    /* ── 「全問 X にして」の言い方（2026-08-05 追加）──────────────
       「だけ」「のみ」は形式名の**うしろ**に付くので、後方一致で拾える。
       ところが日本語では「全問、英文並び替えにしてください」のように
       **前**に範囲を書く言い方も同じくらいよく使う。
       実測: この言い方だと onlyRequested が立たず、
       「英文並び替え 4 問＋ほか 5 形式」という配分になっていた。

       「全部で 10 問」は総数の言い方であって範囲の限定ではないので外す。 */
    var ALL_SCOPE_RE = new RegExp(
      "(全問|全ての問題|すべての問題|全部の問題|問題は\\s*(?:すべて|全て|全部)"
      + "|(?:全|すべて)\\s*[0-9０-９]+\\s*問"
      + "|[0-9０-９]+\\s*問\\s*(?:すべて|全て|全部))");
    var NOT_ALL_SCOPE_RE = /(全部で|全体で|合計で|合わせて)/;
    var allScope = ALL_SCOPE_RE.test(t) && !NOT_ALL_SCOPE_RE.test(t);

    if (only.length) {
      req.requestedTypes = uniq(req.requestedTypes.concat(only));
      stated.requestedTypes = true; req.onlyRequested = true;
    } else if (named.length) {
      req.requestedTypes = uniq(req.requestedTypes.concat(named));
      stated.requestedTypes = true;
      /* 「全問」と書いて形式を名指ししたなら、それ以外は使わないという意味。 */
      if (allScope) req.onlyRequested = true;
    }

    /* **「使わないで」は要求ではなく、除外。**
       実測（2026-08-04）: 「4択は使わないで、単語入力と組み合わせで」と書くと、
       4択が requestedTypes（＝出してほしい形式）に入っていた。
       いまは別の見張りが効いて結果的に出なかったが、指示と中身が食い違ったままなのは危うい。
       打ち消しの言葉が後ろに続く形式は、要求から外して excludedTypes へ移す。 */
    var denied = namedTypesWithDenial(t);
    if (denied.length) {
      req.requestedTypes = req.requestedTypes.filter(function (x) { return denied.indexOf(x) < 0; });
      req.excludedTypes = uniq(arr(req.excludedTypes).concat(denied));
      stated.excludedTypes = true;
      /* 「A だけ」と書いたうえで A を否定するのは矛盾。否定を優先し、限定は解く。 */
      if (req.onlyRequested && !req.requestedTypes.length) req.onlyRequested = false;
    }

    /* 形式ごとの個数（契約 §5）。
       「空欄補充を4問、正誤を4問つくってください」で決まった配分が
       「穴埋め2・4択2・○×2・並替1・単語1」になっていた（実測 2026-08-05）。
       AI は配分どおりに返していたので、壊していたのは配分決定のほうだった。
       ここで読み取り、qplan.planMix() が最優先で守る。 */
    var readInfo = {};
    var fromOpts = arr(opts.typeDistribution).length > 0;
    var counts = fromOpts
      ? arr(opts.typeDistribution).slice()
      : namedTypeCounts(t, readInfo);

    /* ① 「A と B と C で 20 問」の 20 問を総数として読み替えたとき（qtypes 側の判断）。
       黙って読み替えない。何をどう読んだかを残す（契約 §6）。 */
    if (!fromOpts && readInfo.totalHint > 0) {
      note("「" + readInfo.totalHint + "問」は形式ごとの個数ではなく"
         + "**総数**として読みました。形式ごとの割り当ては自動で決めます。",
        { what: "typeCount", from: readInfo.totalHint + "問（形式ごとの個数）",
          to: readInfo.totalHint + "問（総数）",
          reason: "形式を複数名指ししたあとの「〜で N 問」なので総数と読みました" });
    }
    /* ② くっついて書かれた 2 形式に付いた個数（「英訳和訳を5問」）。
       片方だけの個数として読むと、もう片方が配分から消える。 */
    if (!fromOpts) {
      arr(readInfo.groupedCounts).forEach(function (g) {
        note("「" + arr(g.words).join("") + "を" + g.count + "問」は、"
           + arr(g.words).join("と") + "を合わせて " + g.count + " 問と読みました。"
           + "どちらを何問にするかは自動で決めます。",
          { what: "typeCount", from: g.types.join("+") + ":" + g.count,
            to: "自動配分（合計 " + g.count + " 問）",
            reason: "区切りなく並んだ 2 形式なので、片方だけの個数とは読めません" });
      });
    }

    /* ③ 呼び名を 1 つに吸収したとき（「英単語と訳のマッチング」→ 1 形式）。 */
    if (!fromOpts) {
      arr(readInfo.merges).forEach(function (mg) {
        note("「" + mg.keptWord + "」と「" + mg.absorbedWord + "」は"
           + "同じことを指していると見て 1 つの形式（"
           + (Q.label ? Q.label(mg.kept) : mg.kept) + "）として読みました。",
          { what: "typeMerge", from: mg.absorbed, to: mg.kept,
            reason: "直後に続く同じ engine の総称なので吸収しました" });
      });
    }

    /* 「使わないで」と言われた形式は、個数が書いてあっても入れない。 */
    if (denied.length) {
      counts = counts.filter(function (e) { return denied.indexOf(e.type) < 0; });
    }
    counts = counts.filter(function (e) { return e && e.type && e.count > 0; });
    req.typeDistribution = counts;
    if (counts.length) {
      stated.typeDistribution = true;
      /* 個数まで書かれているなら、名指しされているのと同じこと。 */
      req.requestedTypes = uniq(req.requestedTypes.concat(counts.map(function (e) { return e.type; })));
      stated.requestedTypes = true;
      /* 「空欄補充を4問、正誤を4問」に総数は書かれていない。
         parseCount は最初の「4問」だけを見て 4 問と読むので、合計で上書きする。
         総数のほうが大きいとき（「10問。うち正誤を4問」）はそのまま。

         **方針（契約 §6・2026-08-05 に決めた）**:
         合計が総数を超えたときは「合計を採る」。個数指定のほうが具体的で、
         こちらを削ると「8問と言ったのに 6 問しか出ない」になるため。
         ただし**ユーザーが総数を別に書いていた**ときは黙って変えず、
         warnings と converted に必ず記録する。
         （総数を優先して個数側を削る案は採らなかった。どの形式を削るかを
           こちらで勝手に決めることになり、それこそ「無言の変換」になる。） */
      var sum = counts.reduce(function (a, e) { return a + e.count; }, 0);
      if (sum > req.totalQuestions) {
        /* 「10問作って。空欄補充を8問」の 10 問のように、
           形式の個数として読んだ範囲の**外**に書かれた「N問」があるか。
           無ければ（＝「空欄補充を4問、正誤を4問」）総数は書かれていないので、
           合計にするのは書き換えではない。警告も出さない。 */
        var userTotal = fromOpts ? 0 : standaloneTotal(t, arr(readInfo.spans));
        req.totalQuestions = sum;
        stated.totalQuestions = true;
        if (userTotal > 0 && userTotal !== sum) {
          note("総数は「" + userTotal + "問」と書かれていましたが、"
             + "形式ごとの個数の合計が " + sum + " 問なので "
             + sum + " 問にしました。",
            { what: "totalQuestions", from: userTotal, to: sum,
              reason: "形式ごとの個数の合計が総数を超えていました" });
        }
      }
    }
    return req;
  }

  /* 「形式ごとの個数」として読んだ範囲の外にある「N問」「N題」を探す。
     見つかればそれが**ユーザーの書いた総数**。無ければ 0。
     spans は qtypes.countsFromJapanese が埋める [{start,end}]。 */
  var TOTAL_TOKEN_RE = /([0-9]+|[０-９]+|[〇零一二三四五六七八九十百]+)[\s　]*(?:問|題)/g;
  function standaloneTotal(text, spans) {
    var t = str(text);
    if (!t) return 0;
    TOTAL_TOKEN_RE.lastIndex = 0;
    var m;
    while ((m = TOTAL_TOKEN_RE.exec(t))) {
      var s = m.index, e = s + m[0].length, inside = false;
      for (var i = 0; i < spans.length; i++) {
        if (s < spans[i].end && e > spans[i].start) { inside = true; break; }
      }
      if (inside) continue;
      var n = Q.readNumber ? Q.readNumber(m[1]) : parseInt(m[1], 10);
      if (n > 0 && n <= 500) return n;
    }
    return 0;
  }

  /* 日本語の言い方 → 形式 ID の読み取りは **qtypes.js が唯一の出どころ**（契約 §1）。
     以前はここに 60 語の対応表と照合の実装を抱えていたが、呼べるのが
     preset-studio の 2 か所だけで、Quick Mock も qplan も draft も使えなかった。
     ここは qtypes を呼ぶだけにする。表をここへ書き戻さないこと。 */
  function namedTypes(text, suffixRe) {
    return Q.fromJapanese ? Q.fromJapanese(text, { suffix: suffixRe || null }) : [];
  }
  function namedTypesWithDenial(text) {
    return Q.deniedFromJapanese ? Q.deniedFromJapanese(text) : [];
  }
  /* 「空欄補充を4問、正誤を4問」の形式ごとの個数（契約 §5）。
     sink には読み取りの経緯（吸収した形式・総数と読み替えた数・読んだ範囲）が入る。 */
  function namedTypeCounts(text, sink) {
    return Q.countsFromJapanese ? Q.countsFromJapanese(text, sink) : [];
  }

  /* ══════════════════════════════════════════════════════════════════
     ② 教材に何があるのか
     ・**分からないものを「無い」と決めない。** 見つかったものだけを返す。
     ・confidence は「何回それらしいものが出てきたか」から出す。作らない。
     ══════════════════════════════════════════════════════════════════ */
  var FEATURE_TYPES = [
    "term", "definition", "chronology", "sequence", "cause_effect", "classification",
    "numeric", "calculation", "passage", "dialogue", "table", "chart",
    "image", "map", "audio", "vocabulary", "argument"
  ];

  var TEXT_SIGNS = [
    { type: "chronology",     re: /\d{3,4}\s*年|\d+\s*世紀|時代|紀元前/g },
    { type: "definition",     re: /とは[、。]|と(は|いう)[^。]{0,30}のこと|を(いう|指す)|定義/g },
    { type: "cause_effect",   re: /ため(に|、)|によって|原因|結果|影響|したがって|ゆえに/g },
    { type: "classification", re: /分類|種類|に分けら|大きく(分|わ)け|一方|に対して/g },
    { type: "numeric",        re: /\d+(\.\d+)?\s*(%|％|cm|mm|m|km|kg|g|L|ml|円|度|人|個)/g },
    { type: "calculation",    re: /求め(よ|なさい|る)|計算|公式|=|＝/g },
    { type: "sequence",       re: /手順|まず|次に|最後に|ステップ|工程|操作/g },
    { type: "table",          re: /表\s*\d|次の表|以下の表|一覧/g },
    { type: "chart",          re: /グラフ|図\s*\d|次の図|棒グラフ|折れ線|円グラフ/g },
    { type: "dialogue",       re: /「[^」]{2,}」\s*と(言|答|尋)|A\s*:|B\s*:/g },
    { type: "argument",       re: /べきである|と考えられる|主張|意見|賛成|反対/g },
    { type: "vocabulary",     re: /[A-Za-z]{3,}\s*[（(][ぁ-んァ-ヶ一-龥]/g },
    { type: "map",            re: /地図|地形|位置|方角|県|州|大陸/g }
  ];

  function analyzeContent(input) {
    input = input || {};
    var text = str(input.text);
    var attachments = arr(input.attachments);
    var features = [];
    var counts = Object.create(null);

    TEXT_SIGNS.forEach(function (s) {
      var m = text.match(s.re);
      var n = m ? m.length : 0;
      if (!n) return;
      counts[s.type] = (counts[s.type] || 0) + n;
      features.push({
        id: "f_" + s.type,
        type: s.type,
        hits: n,
        /* 1 回だけ出てきたものを「確か」とは言わない。 */
        confidence: n >= 5 ? 0.9 : n >= 3 ? 0.7 : n >= 2 ? 0.5 : 0.3,
        sourceReferences: []
      });
    });

    /* 用語らしさ。かぎ括弧・太字・見出しの語をそのまま数える。 */
    var terms = text.match(/[「『][^」』]{2,20}[」』]/g);
    if (terms && terms.length >= 2) {
      counts.term = terms.length;
      features.push({ id: "f_term", type: "term", hits: terms.length,
        confidence: terms.length >= 6 ? 0.9 : 0.6, sourceReferences: [] });
    }
    if (text.length > 600) {
      counts.passage = 1;
      features.push({ id: "f_passage", type: "passage", hits: 1,
        confidence: text.length > 2000 ? 0.9 : 0.6, sourceReferences: [] });
    }

    /* 添付から分かること。ここは推測しない（あるものだけ）。 */
    var hasImage = false, hasAudio = false, pages = 0;
    attachments.forEach(function (a) {
      var kind = str(a.kind || a.type), meta = str(a.mime) + str(a.name);
      if (kind === "image" || /image|photo|png|jpe?g|heic/i.test(meta)) hasImage = true;
      if (/audio|mp3|m4a|wav|aac/i.test(meta)) hasAudio = true;
      if (isNum(a.pageCount)) pages += a.pageCount;
      if (a.hasTable) counts.table = (counts.table || 0) + 1;
      if (a.hasFigure) counts.chart = (counts.chart || 0) + 1;
    });
    if (hasImage) features.push({ id: "f_image", type: "image", hits: 1, confidence: 1, sourceReferences: [] });
    if (hasAudio) features.push({ id: "f_audio", type: "audio", hits: 1, confidence: 1, sourceReferences: [] });
    if (pages >= 2 && !counts.passage) {
      counts.passage = 1;
      features.push({ id: "f_passage", type: "passage", hits: pages, confidence: 0.7, sourceReferences: [] });
    }

    return {
      /* 教材のことが何も分からないときは known:false。
         このとき「画像が無い」ではなく「分からない」として扱う。 */
      known: !!(text || attachments.length),
      features: features,
      counts: counts,
      hasImage: hasImage,
      hasAudio: hasAudio,
      pageCount: pages,
      textLength: text.length,
      has: function (t) { return features.some(function (f) { return f.type === t; }); }
    };
  }

  /* qplan の hints（画像・音声・図表・表・長文・年代）へ変換する。
     既存の呼び出し側をそのまま使えるようにするため。 */
  function toHints(analysis) {
    if (!analysis || !analysis.known) return null;
    var h = {};
    if (analysis.hasImage) h.images = true;
    if (analysis.hasAudio) h.audio = true;
    if (analysis.counts.table) h.tables = true;
    if (analysis.counts.chart) h.figures = true;
    if (analysis.counts.chronology) h.chronology = true;
    if (analysis.counts.passage) h.longText = true;
    return h;
  }

  /* ══════════════════════════════════════════════════════════════════
     ③ 教材の中身に向く形式（§13）
     ・上から順に「向いている」。ここに無い形式は、その特徴からは選ばれない。
     ══════════════════════════════════════════════════════════════════ */
  var TYPE_FOR_FEATURE = {
    term:           ["word_input", "fill_blank", "matching", "flashcard", "multiple_choice_single"],
    definition:     ["fill_blank", "matching", "word_input", "multiple_choice_single", "choice_incorrect"],
    chronology:     ["reorder_chronology", "reorder_events", "matching_year_event", "fill_blank_source"],
    sequence:       ["reorder_steps", "reorder_experiment", "ordering", "reorder_flow"],
    cause_effect:   ["explain_reason", "long_answer", "reorder_events", "choice_two_stage", "multiple_choice_single"],
    classification: ["classification", "classification_odd_group", "classification_exclude", "matching"],
    numeric:        ["numeric", "table_read", "chart_read", "fill_blank"],
    calculation:    ["numeric", "formula", "work_steps", "reorder_steps"],
    passage:        ["composite", "fill_blank_passage", "summarize", "quote_evidence", "ordering", "long_answer"],
    dialogue:       ["fill_blank_dialog", "reorder_dialog", "multiple_choice_single"],
    table:          ["table_read", "table_fill", "source_compare"],
    chart:          ["chart_read", "table_read", "source_compare"],
    image:          ["image_point", "image_part", "image_label", "map_pin", "image_choice"],
    map:            ["map_pin", "image_point", "matching_country_capital"],
    audio:          ["audio_choice", "dictation", "audio_fill_blank", "pronunciation_choice"],
    vocabulary:     ["spelling", "matching_word_meaning", "translate_ja", "translate_en", "flashcard", "word_input"],
    argument:       ["explain_reason", "own_words", "counter_argument", "summarize", "evidence_explain"]
  };

  /* 科目から足す。教材の特徴が薄いときの受け皿。 */
  var TYPE_FOR_SUBJECT = {
    english:  ["spelling", "matching_word_meaning", "reorder_english", "translate_ja", "english_writing"],
    japanese: ["kanji_input", "reading_input", "quote_evidence", "ordering", "summarize"],
    math:     ["numeric", "formula", "work_steps", "reorder_steps"],
    science:  ["classification", "reorder_experiment", "chart_read", "explain_reason"],
    social:   ["reorder_chronology", "matching_year_event", "map_pin", "chart_read"],
    info:     ["code_input", "reorder_flow", "table_read", "classification"]
  };

  /* どの形式でも使える受け皿。教材の特徴が 1 つも取れなくても、
     ここから 4 択だけにならない配分を作れるようにしておく。 */
  var GENERAL = ["multiple_choice_single", "word_input", "fill_blank", "true_false",
                 "matching", "ordering", "classification", "short_answer", "long_answer", "flashcard"];

  /* ══════════════════════════════════════════════════════════════════
     ③' 候補を絞る（§16）
     ・**AI に 125 形式を毎回渡さない。** ここで落とし、落とした理由を残す。
     ══════════════════════════════════════════════════════════════════ */
  function candidates(req, analysis, opts) {
    opts = opts || {};
    req = req || extractRequirements("", {});
    var steps = [], excluded = [];
    function drop(type, reason) { excluded.push({ type: type, name: Q.label(type), reason: reason }); }

    /* 1) 最後まで動く形式だけ（表示・編集・採点・結果までそろっているもの） */
    var pool;
    try {
      pool = VQ2.capability
        ? VQ2.capability.forAi({ mock: req.mode === "quick_mock" })
        : null;
    } catch (e) { pool = null; }
    if (!pool || !pool.length) {
      pool = Q.list({}).filter(function (d) {
        return !d.mode && d.status === "available" && d.supportsAI;
      }).map(function (d) { return d.id; });
    }
    steps.push({ step: "最後まで動く形式", left: pool.length });

    /* 2) いまのモードで使えるもの */
    if (opts.quizMode) {
      pool = pool.filter(function (t) {
        if (Q.allowedInMode(t, opts.quizMode)) return true;
        drop(t, "この解き方では使えません"); return false;
      });
      steps.push({ step: "この解き方で使える", left: pool.length });
    }

    /* 3) 教材にあるものだけ（画像・音声・図表・年代・長文） */
    var need = (VQ2.qplan && VQ2.qplan.NEEDS) || {};
    pool = pool.filter(function (t) {
      var k = need[t];
      if (!k) return true;
      /* 音声は教材の中身ではなく「鳴らせるか」で決まる。
         読み上げ（ui/tts.js）が原稿から音を作るので、教材に音声が無くても出せる。
         鳴らす手立てが無い端末でだけ外す。 */
      if (k === "speech") {
        if (canSpeak()) return true;
        drop(t, "この端末で音を出せないため外しました");
        return false;
      }
      if (!analysis || !analysis.known) {
        /* 教材のことが分からないとき。画像は作れないので頼まない。 */
        if (k === "images") { drop(t, "教材に画像があるか分からないため外しました"); return false; }
        return true;
      }
      var okMap = {
        images: analysis.hasImage, audio: analysis.hasAudio,
        tables: !!analysis.counts.table, figures: !!analysis.counts.chart,
        chronology: !!analysis.counts.chronology, longText: !!analysis.counts.passage
      };
      if (okMap[k]) return true;
      drop(t, LACK_LABEL[k] || "この教材からは作れません");
      return false;
    });
    steps.push({ step: "この教材から作れる", left: pool.length });

    /* 4) 使わないと言われたもの（§14：黙って 4 択へ置き換えない） */
    var noFour = req.noFourChoice, noWrite = req.noWriting, noAi = req.noAiGrading;
    pool = pool.filter(function (t) {
      var d = Q.get(t);
      if (req.excludedTypes.indexOf(t) >= 0) { drop(t, "使わない形式に指定されています"); return false; }
      if (noFour && (d.engine === "single_choice" || d.engine === "true_false" || d.engine === "multi_choice")) {
        drop(t, "選択式を使わない指定です"); return false;
      }
      if (noWrite && d.engine === "free_text") { drop(t, "記述を使わない指定です"); return false; }
      if (noAi && d.engine === "free_text") { drop(t, "AI 採点を使わない指定です"); return false; }
      if (req.noImage && need[t] === "images") { drop(t, "画像を使わない指定です"); return false; }
      if (req.noAudio && (need[t] === "audio" || need[t] === "speech")) { drop(t, "音声を使わない指定です"); return false; }
      return true;
    });
    steps.push({ step: "使わない指定を除く", left: pool.length });

    /* 5) 名指しされた形式のうち、使えるものを拾う */
    var requestedOk = [], requestedRaw = [];
    req.requestedTypes.forEach(function (t) {
      var id = Q.canonicalId ? (Q.canonicalId(t) || t) : t;
      if (pool.indexOf(id) >= 0) requestedOk.push(id);
      else requestedRaw.push(id);
    });

    /* 6) 教材の中身に向く順に並べる */
    var ranked = rank(pool, req, analysis, requestedOk);

    /* 7) 名指しされたのに使えないもの。**理由と代わりを必ず添える**（§14）。
       代わりは並べ替えたあとで選ぶ（教材に向く順に出すため）。 */
    var requestedNg = requestedRaw.map(function (id) {
      var why = excluded.filter(function (e) { return e.type === id; })[0];
      var d = Q.get(id);
      return {
        type: id, name: d ? d.name : id,
        reason: why ? why.reason : (d ? "いまは使えません" : "そのような形式はありません"),
        alternatives: alternativesFor(id, ranked).slice(0, 3)
      };
    });

    return {
      types: ranked.map(function (r) { return r.type; }),
      ranked: ranked,
      excluded: excluded,
      steps: steps,
      requested: requestedOk,
      unavailableRequested: requestedNg
    };
  }

  /* 音を出せる見込みがあるか（Bridge か端末の読み上げ）。
     ui/tts.js が入っていない環境（紙・テスト）では false。 */
  function canSpeak() {
    var T = VQ2.tts;
    if (!T || typeof T.canMakeAudio !== "function") return false;
    try { return !!T.canMakeAudio(); } catch (e) { return false; }
  }

  var LACK_LABEL = {
    images: "教材に画像がないため外しました",
    audio: "教材に音声がないため外しました",
    speech: "この端末で音を出せないため外しました",
    tables: "教材に表がないため外しました",
    figures: "教材に図やグラフがないため外しました",
    chronology: "教材に年代が出てこないため外しました",
    longText: "教材にまとまった本文がないため外しました"
  };

  /* 代わりに使える形式。近いものから順に。
     ・同じ操作 → 同じ分類 → 教材に向く順の上位
     最後の受け皿まで用意するのは、**「使えません」で終わらせない**ため。 */
  function alternativesFor(type, ranked) {
    var d = Q.get(type);
    var list = arr(ranked);
    if (!d) return list.slice(0, 3).map(pick);
    var same = list.filter(function (r) { return r.engine === d.engine; });
    if (same.length) return same.map(pick);
    var cat = list.filter(function (r) { return r.category === d.category; });
    if (cat.length) return cat.map(pick);
    return list.slice(0, 3).map(pick);
    function pick(r) { return { type: r.type, name: r.name || Q.label(r.type) }; }
  }

  function rank(pool, req, analysis, requested) {
    var score = Object.create(null);
    var reason = Object.create(null);
    pool.forEach(function (t) { score[t] = 0; });

    /* 教材の特徴から */
    arr(analysis && analysis.features).forEach(function (f) {
      var list = TYPE_FOR_FEATURE[f.type] || [];
      list.forEach(function (t, i) {
        if (score[t] === undefined) return;
        var add = (list.length - i) * f.confidence;
        score[t] += add;
        if (!reason[t]) reason[t] = FEATURE_REASON[f.type] || "教材の中身に合うため";
      });
    });
    /* 科目から */
    (TYPE_FOR_SUBJECT[req.subject] || []).forEach(function (t, i) {
      if (score[t] === undefined) return;
      score[t] += (5 - i) * 0.6;
      if (!reason[t]) reason[t] = "この教科でよく問われる形式のため";
    });
    /* どこからも選ばれなかったときの受け皿 */
    GENERAL.forEach(function (t, i) {
      if (score[t] === undefined) return;
      score[t] += (GENERAL.length - i) * 0.12;
      if (!reason[t]) reason[t] = "どの教材でも使えるため";
    });
    /* 名指しされたものは必ず上へ */
    arr(requested).forEach(function (t) {
      if (score[t] === undefined) return;
      score[t] += 100;
      reason[t] = "使う形式として指定されたため";
    });

    return pool.map(function (t) {
      var d = Q.get(t);
      return { type: t, name: d.name, engine: d.engine, category: d.category,
               score: Math.round(score[t] * 100) / 100, reason: reason[t] || "" };
    }).filter(function (r) { return r.score > 0; })
      .sort(function (a, b) { return b.score - a.score || a.type.localeCompare(b.type); });
  }

  var FEATURE_REASON = {
    term: "用語が多く出てくるため", definition: "定義の文があるため",
    chronology: "年代が出てくるため", sequence: "手順が書かれているため",
    cause_effect: "原因と結果のつながりがあるため", classification: "分類の観点があるため",
    numeric: "数値が出てくるため", calculation: "計算が必要なため",
    passage: "まとまった本文があるため", dialogue: "会話文があるため",
    table: "表があるため", chart: "図やグラフがあるため",
    image: "画像教材があるため", map: "地図に関する内容があるため",
    audio: "音声教材があるため", vocabulary: "語彙が中心のため",
    argument: "主張や意見が書かれているため"
  };

  /* ══════════════════════════════════════════════════════════════════
     ④ 配分の決まりごと（§12）
     ・**ユーザーが「4 択だけ」と言っていない限り、4 択だけにしない。**
     ══════════════════════════════════════════════════════════════════ */
  function minTypesFor(count) {
    if (count >= 30) return 8;
    if (count >= 20) return 6;
    if (count >= 10) return 4;
    if (count >= 5) return 2;
    return 1;
  }
  var MAX_SAME_RATIO = 0.4;      /* 同じ形式は 4 割まで */
  var MAX_CHOICE_RATIO = 0.5;    /* 選ぶだけの形式は合わせて半分まで */

  function isChoiceEngine(engine) {
    return engine === "single_choice" || engine === "true_false"
        || engine === "multi_choice" || engine === "image_choice" || engine === "audio_choice";
  }

  function validateDistribution(items, count, req) {
    req = req || {};
    var total = arr(items).reduce(function (a, i) { return a + i.count; }, 0) || count || 0;
    var kinds = arr(items).filter(function (i) { return i.count > 0; }).length;
    var wantKinds = isNum(req.minimumTypeCount) && req.minimumTypeCount > 0
      ? req.minimumTypeCount : minTypesFor(total);
    var maxSame = isNum(req.maximumSameTypeRatio) && req.maximumSameTypeRatio > 0
      ? req.maximumSameTypeRatio : MAX_SAME_RATIO;
    var issues = [];

    if (kinds < wantKinds) {
      issues.push({ code: "tooFewTypes", level: "error",
        message: total + " 問なら " + wantKinds + " 形式以上にしてください（いまは " + kinds + " 形式）。" });
    }
    arr(items).forEach(function (i) {
      if (total >= 5 && i.count / total > maxSame + 1e-9) {
        issues.push({ code: "sameTypeTooMany", level: "warning", type: i.type,
          message: "「" + (i.name || Q.label(i.type)) + "」が "
            + Math.round(i.count / total * 100) + "% を占めています（目安は "
            + Math.round(maxSame * 100) + "% まで）。" });
      }
    });
    var choice = arr(items).filter(function (i) { return isChoiceEngine(i.engine || Q.engineOf(i.type)); })
      .reduce(function (a, i) { return a + i.count; }, 0);
    if (total >= 5 && choice / total > MAX_CHOICE_RATIO + 1e-9) {
      issues.push({ code: "choiceTooMany", level: "warning",
        message: "選んで答える問題が " + Math.round(choice / total * 100) + "% です（目安は 50% まで）。" });
    }
    return {
      ok: !issues.some(function (i) { return i.level === "error"; }),
      issues: issues,
      typeCount: kinds, required: wantKinds, total: total,
      choiceRatio: total ? Math.round(choice / total * 100) / 100 : 0
    };
  }

  /* 配分を決まりごとへ寄せる。
     ・足りない形式は、候補の上位から足す。
     ・偏りすぎた形式は、余っている形式へ回す。
     ・**候補が足りなくて守れないときは、黙って通さず理由を残す**（§12 の例外）。 */
  function enforceDistribution(items, count, ctx) {
    ctx = ctx || {};
    var req = ctx.req || {};
    var pool = arr(ctx.candidates);
    var notes = arr(ctx.notes);
    var list = arr(items).map(function (i) {
      return { type: i.type, count: i.count, name: i.name || Q.label(i.type),
               engine: i.engine || Q.engineOf(i.type), category: i.category };
    }).filter(function (i) { return i.count > 0; });
    var total = list.reduce(function (a, i) { return a + i.count; }, 0) || count || 0;
    if (!total) return { items: list, notes: notes, exception: null };

    if (req.onlyRequested && arr(req.requestedTypes).length) {
      /* 「4 択だけ」と言われているときは、こちらで形式を増やさない。 */
      return { items: list, notes: notes, exception: "使う形式が指定されているため、配分の決まりは適用していません。" };
    }

    var wantKinds = Math.min(
      isNum(req.minimumTypeCount) && req.minimumTypeCount > 0 ? req.minimumTypeCount : minTypesFor(total),
      total
    );
    var have = {};
    list.forEach(function (i) { have[i.type] = i; });

    /* ① 形式の数を満たす。候補の上位から、まだ使っていないものを足す。 */
    var added = [];
    for (var k = 0; list.length < wantKinds && k < pool.length; k++) {
      var t = typeof pool[k] === "string" ? pool[k] : pool[k].type;
      if (have[t]) continue;
      var d = Q.get(t);
      if (!d) continue;
      /* 1 問ぶんをどこから借りるか。いちばん多い形式から 1 問。 */
      var donor = list.slice().sort(function (a, b) { return b.count - a.count; })[0];
      if (!donor || donor.count <= 1) break;
      donor.count--;
      var row = { type: t, count: 1, name: d.name, engine: d.engine, category: d.category };
      list.push(row); have[t] = row; added.push(d.name);
    }
    if (added.length) notes.push("形式が偏らないよう、" + added.join("・") + " を加えました。");
    if (list.length < wantKinds) {
      notes.push("この教材から作れる形式が " + list.length + " 種類しかないため、"
        + wantKinds + " 形式にはできませんでした。");
    }

    /* ② 同じ形式が多すぎるときは、少ない形式へ回す。 */
    var maxSame = isNum(req.maximumSameTypeRatio) && req.maximumSameTypeRatio > 0
      ? req.maximumSameTypeRatio : MAX_SAME_RATIO;
    var cap = Math.max(1, Math.floor(total * maxSame));
    if (total >= 5) {
      list.forEach(function (i) {
        while (i.count > cap) {
          var to = list.slice().sort(function (a, b) { return a.count - b.count; })
            .filter(function (x) { return x !== i && x.count < cap; })[0];
          if (!to) break;
          i.count--; to.count++;
        }
      });
    }

    list = list.filter(function (i) { return i.count > 0; })
      .sort(function (a, b) { return b.count - a.count || a.type.localeCompare(b.type); });
    return { items: list, notes: notes, exception: null };
  }

  /* ══════════════════════════════════════════════════════════════════
     ⑤ Blueprint を作る
     ・1 問ずつ「何を問うか・どの形式か・なぜその形式か」を決める。
     ・問題文はまだ作らない。
     ══════════════════════════════════════════════════════════════════ */
  function build(o) {
    o = o || {};
    var req = o.requirements || extractRequirements(str(o.instruction), o);
    var analysis = o.analysis || analyzeContent({ text: o.text, attachments: o.attachments });
    var cand = o.candidates || candidates(req, analysis, o);
    var count = Math.max(1, Math.min(500, isNum(o.count) ? o.count : req.totalQuestions || 10));
    var notes = [];

    /* 候補から配分を作る。上位ほど多く割り当てる。 */
    var top = cand.ranked.slice(0, Math.max(minTypesFor(count), Math.min(10, cand.ranked.length)));
    if (!top.length) {
      return {
        ok: false, requirements: req, analysis: analysis, candidates: cand,
        totalQuestions: 0, questions: [], typeDistribution: [], notes: notes,
        warnings: ["この教材から作れる形式が 1 つも見つかりませんでした。"]
      };
    }
    var weights = top.map(function (r, i) { return { type: r.type, weight: top.length - i }; });
    var items = largestRemainder(weights, count).map(function (i) {
      var d = Q.get(i.type);
      return { type: i.type, count: i.count, name: d.name, engine: d.engine, category: d.category };
    }).filter(function (i) { return i.count > 0; });

    var fixed = enforceDistribution(items, count, { req: req, candidates: cand.types, notes: notes });
    items = fixed.items;
    notes = fixed.notes;

    /* 1 問ずつに割り当てる。何を問うかは、教材の特徴から順に配る。 */
    var objectives = objectiveList(analysis, count);
    var reasonBy = Object.create(null);
    cand.ranked.forEach(function (r) { reasonBy[r.type] = r.reason; });

    var questions = [], seq = 0;
    items.forEach(function (it) {
      for (var i = 0; i < it.count; i++) {
        var obj = objectives[seq % Math.max(1, objectives.length)] || null;
        questions.push({
          id: "bp" + (seq + 1),
          number: seq + 1,
          learningObjective: obj ? obj.label : "教材の要点",
          sourceFeatureIds: obj ? [obj.id] : [],
          questionType: it.type,
          engine: it.engine,
          typeName: it.name,
          reasonForType: reasonBy[it.type] || "教材の中身に合うため",
          difficulty: req.difficulty || "normal",
          score: 1,
          estimatedTimeSeconds: M && M.defaultSeconds ? M.defaultSeconds(it.type) : 60
        });
        seq++;
      }
    });

    var check = validateDistribution(items, count, req);
    var warnings = check.issues.map(function (i) { return i.message; });
    if (fixed.exception) notes.push(fixed.exception);
    arr(cand.unavailableRequested).forEach(function (u) {
      warnings.push("「" + u.name + "」は" + u.reason
        + (u.alternatives.length ? "。代わりに使えます: " + u.alternatives.map(function (a) { return a.name; }).join("・") : ""));
    });

    return {
      ok: true,
      requirements: req,
      analysis: analysis,
      candidates: cand,
      totalQuestions: questions.length,
      totalScore: questions.reduce(function (a, q) { return a + q.score; }, 0),
      estimatedTimeSeconds: questions.reduce(function (a, q) { return a + q.estimatedTimeSeconds; }, 0),
      typeDistribution: items,
      questions: questions,
      distribution: check,
      notes: notes,
      warnings: warnings,
      summary: items.map(function (i) { return i.name + " " + i.count + " 問"; }).join("・")
    };
  }

  function objectiveList(analysis, count) {
    var out = [];
    arr(analysis && analysis.features)
      .slice()
      .sort(function (a, b) { return b.confidence - a.confidence; })
      .forEach(function (f) {
        out.push({ id: f.id, label: OBJECTIVE_LABEL[f.type] || "教材の要点", type: f.type });
      });
    if (!out.length) out.push({ id: "f_general", label: "教材の要点", type: "term" });
    return out.slice(0, Math.max(1, count));
  }
  var OBJECTIVE_LABEL = {
    term: "用語を覚えているか", definition: "意味を説明できるか",
    chronology: "出来事の順序が分かるか", sequence: "手順を理解しているか",
    cause_effect: "理由を説明できるか", classification: "分けられるか",
    numeric: "数値を読み取れるか", calculation: "計算できるか",
    passage: "本文を読み取れるか", dialogue: "会話の流れが分かるか",
    table: "表を読み取れるか", chart: "図やグラフを読み取れるか",
    image: "図の内容が分かるか", map: "位置が分かるか",
    audio: "聞き取れるか", vocabulary: "語彙を覚えているか",
    argument: "主張を捉えられるか"
  };

  function largestRemainder(weighted, count) {
    var total = weighted.reduce(function (a, w) { return a + w.weight; }, 0);
    if (!total) return [];
    var raw = weighted.map(function (w) { return { type: w.type, exact: count * w.weight / total }; });
    var items = raw.map(function (r) { return { type: r.type, count: Math.floor(r.exact), rem: r.exact - Math.floor(r.exact) }; });
    var used = items.reduce(function (a, i) { return a + i.count; }, 0);
    items.sort(function (a, b) { return b.rem - a.rem; });
    var k = 0;
    while (used < count && items.length) { items[k % items.length].count++; used++; k++; if (k > count * 4) break; }
    return items;
  }

  /* ══════════════════════════════════════════════════════════════════
     ⑥ AI へ渡す文
     ・形式の説明（qdescriptor）＋ 内訳 ＋ 1 問ずつのねらい。
     ══════════════════════════════════════════════════════════════════ */
  function promptFor(bp, opts) {
    opts = opts || {};
    if (!bp || !arr(bp.typeDistribution).length) return "";
    var lines = [];
    if (VQ2.qdescriptor) {
      var block = VQ2.qdescriptor.promptBlock(bp.typeDistribution.map(function (i) { return i.type; }), opts);
      if (block) { lines.push(block); lines.push(""); }
    }
    lines.push("【この回で作る内訳】");
    bp.typeDistribution.forEach(function (i) {
      lines.push("・" + i.name + "（questionType: " + i.type + "）… " + i.count + " 問");
    });
    if (arr(bp.questions).length && arr(bp.questions).length <= 30) {
      lines.push("");
      lines.push("【1 問ずつのねらい】");
      bp.questions.forEach(function (q) {
        lines.push("・問" + q.number + "：" + q.learningObjective + " → " + q.typeName);
      });
    }
    return lines.join("\n");
  }

  VQ2.blueprint = {
    FEATURE_TYPES: FEATURE_TYPES,
    TYPE_FOR_FEATURE: TYPE_FOR_FEATURE,
    TYPE_FOR_SUBJECT: TYPE_FOR_SUBJECT,
    GENERAL: GENERAL,
    MAX_SAME_RATIO: MAX_SAME_RATIO,
    MAX_CHOICE_RATIO: MAX_CHOICE_RATIO,
    extractRequirements: extractRequirements,
    analyzeContent: analyzeContent,
    toHints: toHints,
    candidates: candidates,
    minTypesFor: minTypesFor,
    validateDistribution: validateDistribution,
    enforceDistribution: enforceDistribution,
    build: build,
    promptFor: promptFor,
    isChoiceEngine: isChoiceEngine
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
