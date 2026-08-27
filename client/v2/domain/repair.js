/* ══════════════════════════════════════════════════════════════════════
   repair.js — 検証エラーの AI 修復（プリセット）

   考え方:
   ・AI にプリセット全体を自由に作り直させない。
     「このエラーを直すために触ってよいフィールド」だけを通し、
     それ以外は提案に入っていても落とす。
   ・直せるものは AI を呼ばずに直す（内部 ID の再発行・番号の付け直し）。
   ・提案は即時に反映しない。必ず修正前・修正後を出してから適用する。
   ・自動の修復ループは 3 回まで。直らなければ止めて手動へ回す。
   ・validate.js には手を入れない（Quick Mock の検証を変えないため）。
     ここは validate.js の結果を受け取り、正規化して足りない検査を足す層。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var S = VQ2.schema, V = VQ2.validate, D = VQ2.draft;

  var REPAIR_VERSION = "1.0.0";
  var MAX_ROUNDS = 3;

  function str(v) { return v === null || v === undefined ? "" : String(v); }
  function trim(v) { return str(v).trim(); }
  function isPosInt(v) { var n = Number(v); return isFinite(n) && Math.floor(n) === n && n > 0; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ══════════════════════════════════════════════════════════════════
     1. エラーコードの表
     ・canonical … 画面と修復で使う正式なコード
     ・ai        … AI を呼んで直せるか
     ・auto      … AI を呼ばずに直せるか
     ・fields    … 修復で書き換えてよいフィールド（これ以外は落とす）
     ・scope     … question（その問題だけ）／ preset（全体）
     ══════════════════════════════════════════════════════════════════ */
  var CODES = {
    wrong_choice_count: {
      label: "選択肢の数が指定と違う", ai: true, auto: false, scope: "question",
      fields: ["choices"],
      hint: "選択肢を足す／減らします。正解はそのまま残します。"
    },
    multiple_correct_choices: {
      label: "正解が複数成立している", ai: true, auto: false, scope: "question",
      fields: ["choices"],
      hint: "正解を 1 つに絞り、ほかは明確な誤答に直します。"
    },
    correct_answer_missing: {
      label: "正解が指定されていない", ai: true, auto: false, scope: "question",
      fields: ["choices", "correctAnswer"],
      hint: "どれが正解かを決めます。"
    },
    invalid_correct_answer: {
      label: "正解が正しくない", ai: true, auto: false, scope: "question",
      fields: ["correctAnswer", "acceptedAnswers", "choices"],
      hint: "正解を問題文に合う値へ直します。"
    },
    answer_orphan: {
      label: "正解が選択肢の中に無い", ai: true, auto: false, scope: "question",
      fields: ["choices", "correctAnswer"],
      hint: "正解に対応する選択肢を用意します。"
    },
    duplicate_question: {
      label: "同じ内容の問題がある", ai: true, auto: false, scope: "question",
      fields: ["prompt", "choices", "explanation", "topic"],
      hint: "あとの 1 問を別の論点へ作り直します。"
    },
    duplicate_question_id: {
      label: "内部 ID が重複している", ai: false, auto: true, scope: "question",
      fields: [],
      hint: "内容は変えず、内部 ID だけ発行し直します。"
    },
    duplicate_question_number: {
      label: "問題番号が重複している", ai: false, auto: true, scope: "preset",
      fields: [],
      hint: "内容は変えず、番号だけ付け直します。"
    },
    missing_question_number: {
      label: "問題番号が無い", ai: false, auto: true, scope: "preset",
      fields: [],
      hint: "内容は変えず、番号を付けます。"
    },
    missing_question_text: {
      label: "問題文が空", ai: true, auto: false, scope: "question",
      fields: ["prompt"],
      hint: "問題文を書きます。"
    },
    missing_explanation: {
      label: "解説が無い", ai: true, auto: false, scope: "question",
      fields: ["explanation"],
      hint: "解説を書きます。ほかは変えません。"
    },
    unsupported_claim: {
      label: "資料に根拠が無い", ai: true, auto: false, scope: "question",
      fields: ["prompt", "explanation", "sourceReferences"],
      hint: "資料にある内容へ直すか、出典を付けます。"
    },
    foreign_character_mixed: {
      label: "日本語以外の文字が混じっている", ai: true, auto: false, scope: "question",
      fields: ["prompt", "explanation", "choices"],
      hint: "混じっている文字だけを直します。文章は作り直しません。"
    },
    question_count_shortage: {
      label: "問題数が足りない", ai: true, auto: false, scope: "preset",
      fields: [],
      backfill: true,
      hint: "足りない数だけ新しく作ります。既存の問題は変えません。"
    }
  };
  var CODE_IDS = Object.keys(CODES);

  /* validate.js のコード → 正式なコード */
  var FROM_VALIDATE = {
    choiceCount: "wrong_choice_count",
    tooManyCorrect: "multiple_correct_choices",
    noCorrectChoice: "correct_answer_missing",
    emptyAnswer: "invalid_correct_answer",
    emptyPrompt: "missing_question_text",
    duplicateQuestionId: "duplicate_question_id",
    duplicateQuestionNumber: "duplicate_question_number",
    questionCount: "question_count_shortage"
  };

  /* 直し方がまだ無いもの。手で直すしかないと画面へ出す（黙って隠さない）。 */
  var MANUAL_ONLY_HINT = {
    emptyChoice: "選択肢の本文を書いてください。",
    duplicateChoiceId: "選択肢の ID が重なっています。選択肢を作り直してください。",
    duplicateChoiceText: "同じ文言の選択肢があります。片方を書き換えてください。",
    missingRubric: "採点基準を作ってください（記述式は基準が無いと採点できません）。",
    rubricSumMismatch: "採点基準の合計を配点に合わせてください。",
    criterionSumMismatch: "観点別配点の合計を配点に合わせてください。",
    badPoints: "配点を 0 以上の数値にしてください。",
    zeroPoints: "配点を 1 点以上にしてください。",
    orphanSource: "出典の資料名を入れてください。",
    schemaVersion: "アプリを更新してください。",
    noQuestions: "問題を作ってください。"
  };

  function planFor(code) {
    var c = CODES[code];
    if (c) {
      return { code: code, label: c.label, ai: !!c.ai, auto: !!c.auto,
               backfill: !!c.backfill, fields: (c.fields || []).slice(),
               scope: c.scope, hint: c.hint, manualOnly: !c.ai && !c.auto };
    }
    return { code: code, label: code, ai: false, auto: false, backfill: false,
             fields: [], scope: "question",
             hint: MANUAL_ONLY_HINT[code] || "画面から手で直してください。",
             manualOnly: true };
  }

  /* ══════════════════════════════════════════════════════════════════
     2. 追加の検査（validate.js には入れない）
     ══════════════════════════════════════════════════════════════════ */

  /* 日本語の文章に出てこない文字。
     ここで見るのは「日本語には無い」と確実に言える範囲だけ。

     ・別の文字体系（ハングル・キリル・アラビア・タイ・デーヴァナーガリー・
       ヘブライ・注音）は、コードポイントの範囲で確実に分かる。
     ・簡体字は難しい。漢字は日中で共通のものが多く、1 文字ずつ手で表を作ると
       日本語の漢字（学・参・実 など）を取り違えて、正しい日本語を
       「外国語が混じっている」と誤検出する。実際に一度そうなった。
       そこで、簡体字だけに割り当てられている **連続した符号位置の帯** を使う。
       讠 纟 钅 贝 车 门 页 马 鱼 鸟 饣 の系列は、その帯まるごとが簡体字で、
       日本語はその帯の文字を 1 つも使わない。
       帯の端は、日本語で使う字（辛・骨・鹿・香・赤・長・風 など）に
       ぶつからない位置で止めてある。
     ・帯の外にある頻出の簡体字だけ、少数を名指しで足す。
       名指しの表は「簡体字 → 日本語」の対で書き、対で見直せるようにする。
     ・網羅ではない。ここに無い簡体字は素通りする（そう報告する）。 */
  var FOREIGN_RANGES = [
    [0x1100, 0x11ff], [0x3130, 0x318f], [0xac00, 0xd7af],   /* ハングル */
    [0x0400, 0x04ff], [0x0500, 0x052f],                     /* キリル */
    [0x0600, 0x06ff], [0x0750, 0x077f],                     /* アラビア */
    [0x0e00, 0x0e7f],                                       /* タイ */
    [0x0900, 0x097f],                                       /* デーヴァナーガリー */
    [0x0590, 0x05ff],                                       /* ヘブライ */
    [0x3100, 0x312f]                                        /* 注音 */
  ];
  /* 簡体字だけの帯。端は日本語で使う字に当たらない位置で止める。 */
  var SIMPLIFIED_RANGES = [
    [0x7ea0, 0x7f3a],   /* 纟の系列（纠〜缺）。次は 罀 */
    [0x8ba0, 0x8c36],   /* 讠の系列（计〜谶）。8c37 は 谷 なので手前で止める */
    [0x8d1d, 0x8d63],   /* 贝の系列（贝〜赣）。8d64 は 赤 */
    [0x8f66, 0x8f9a],   /* 车の系列（车〜辚）。8f9b は 辛 */
    [0x948a, 0x9576],   /* 钅の系列（钊〜镶）。9577 は 長 */
    [0x9875, 0x98a7],   /* 页の系列（页〜颧）。98a8 は 風 */
    [0x9965, 0x9994],   /* 饣の系列（饥〜馔）。9999 は 香 */
    [0x9a6c, 0x9aa7],   /* 马の系列（马〜骧）。9aa8 は 骨 */
    [0x9c7c, 0x9ce2],   /* 鱼の系列（鱼〜鳢）。9ce5 は 鳥 */
    [0x9e1f, 0x9e7e],   /* 鸟の系列（鸟〜鹾）。9e7f は 鹿 */
    [0x95e8, 0x961b],   /* 门の系列（门〜阛）。961c は 阜 */
    [0x89c1, 0x89d1]    /* 见の系列（见〜觑）。89d2 は 角 */
  ];
  /* 帯の外にある頻出の簡体字。対で書いて見直せるようにする。 */
  var SIMPLIFIED_TO_JP = {
    "习": "習", "这": "這", "华": "華", "东": "東", "书": "書", "电": "電",
    "头": "頭", "关": "関", "义": "義", "乐": "楽", "买": "買", "卖": "売",
    "发": "発", "汉": "漢", "无": "無", "时": "時", "机": "機", "权": "権",
    "极": "極", "构": "構", "树": "樹", "检": "検", "欢": "歓", "气": "気",
    "汇": "彙", "汤": "湯", "污": "汚", "洁": "潔", "济": "済", "浓": "濃",
    "满": "満", "灭": "滅", "灵": "霊", "烧": "焼", "热": "熱", "爱": "愛",
    "现": "現", "环": "環", "疗": "療", "盐": "塩", "监": "監", "确": "確",
    "离": "離", "种": "種", "积": "積", "稳": "穏", "穷": "窮", "简": "簡",
    "类": "類", "紧": "緊", "职": "職", "联": "聯", "肃": "粛", "肠": "腸",
    "肤": "膚", "脑": "脳", "艺": "芸", "节": "節", "药": "薬", "获": "獲",
    "蓝": "藍", "补": "補", "观": "観", "规": "規", "觉": "覚", "边": "辺",
    "达": "達", "过": "過", "运": "運", "还": "還", "进": "進", "远": "遠",
    "违": "違", "连": "連", "迟": "遅", "选": "選", "释": "釈", "风": "風",
    "飞": "飛", "长": "長", "龙": "龍", "龟": "亀", "齐": "斉", "齿": "歯",
    "龄": "齢", "战": "戦", "户": "戸", "扩": "拡", "护": "護", "报": "報",
    "择": "択", "损": "損", "换": "換", "击": "撃", "斗": "闘", "杀": "殺",
    "杂": "雑", "标": "標", "梦": "夢", "变": "変", "叶": "葉", "团": "団",
    "园": "園", "图": "図", "场": "場", "坏": "壊", "块": "塊", "实": "実",
    "对": "対", "导": "導", "岁": "歳", "岛": "島", "带": "帯", "废": "廃",
    "广": "広", "库": "庫", "应": "応", "开": "開", "异": "異", "张": "張",
    "归": "帰", "总": "総", "惊": "驚", "单": "単", "卫": "衛", "历": "歴",
    "压": "圧", "县": "県", "动": "動", "务": "務", "胜": "勝", "劳": "労",
    "阳": "陽", "阴": "陰", "际": "際", "陆": "陸", "险": "険", "难": "難",
    "隐": "隠", "韩": "韓", "鲁": "魯", "见": "見", "队": "隊", "麦": "麦"
  };
  /* 「麦」は日中で同じ字なので表から外す（誤検出のもと）。 */
  delete SIMPLIFIED_TO_JP["麦"];
  var SIMPLIFIED_LIST = Object.keys(SIMPLIFIED_TO_JP).join("");

  function foreignCharsIn(text) {
    var v = str(text);
    var hits = [];
    for (var i = 0; i < v.length; i++) {
      var ch = v.charAt(i), code = v.charCodeAt(i);
      var bad = false, r;
      for (r = 0; r < FOREIGN_RANGES.length; r++) {
        if (code >= FOREIGN_RANGES[r][0] && code <= FOREIGN_RANGES[r][1]) { bad = true; break; }
      }
      if (!bad) {
        for (r = 0; r < SIMPLIFIED_RANGES.length; r++) {
          if (code >= SIMPLIFIED_RANGES[r][0] && code <= SIMPLIFIED_RANGES[r][1]) { bad = true; break; }
        }
      }
      if (!bad && SIMPLIFIED_LIST.indexOf(ch) >= 0) bad = true;
      if (bad && hits.indexOf(ch) < 0) hits.push(ch);
    }
    return hits;
  }
  /* 見つけた文字の日本語での書き方（分かるものだけ）。AI への指示に添える。 */
  function japaneseFormOf(ch) { return SIMPLIFIED_TO_JP[ch] || null; }

  /* 問題文をくらべるための正規化（記号と空白のゆれを無視する） */
  function normPrompt(text) {
    return str(text).replace(/\s+/g, "").replace(/[、。，．,.\-―ー－]/g, "").toLowerCase();
  }

  /* 正解が選択肢の中にあるか。
     選択肢を持つ形式で correctAnswer が指定されているのに、
     その値が選択肢の id にも本文にも無いものを拾う。 */
  function answerOrphanOf(q) {
    if (!S.hasChoices(q.type)) return null;
    var ans = trim(q.correctAnswer);
    if (!ans) return null;
    var ch = Array.isArray(q.choices) ? q.choices : [];
    if (!ch.length) return null;
    var hit = ch.some(function (c) {
      return trim(c && c.id) === ans || trim(c && c.text) === ans;
    });
    return hit ? null : ans;
  }

  /* 検証結果をまとめて出す。
     ・validate.js の結果を正規化し、足りない検査を足す。
     ・severity は error / warning / info の 3 つ。 */
  function auditPreset(preset, opts) {
    opts = opts || {};
    var p = preset || {};
    var qs = Array.isArray(p.questions) ? p.questions : [];
    var out = [];
    var seq = 0;
    function push(o) {
      seq++;
      var plan = planFor(o.code);
      out.push({
        id: "iss" + seq,
        severity: o.severity || "error",
        code: o.code,
        label: plan.label,
        message: o.message,
        path: o.path || "",
        questionId: o.questionId || null,
        questionNumber: o.questionNumber || null,
        excerpt: o.excerpt || "",
        aiRepairable: plan.ai || plan.backfill,
        autoRepairable: plan.auto,
        manualOnly: plan.manualOnly,
        fields: plan.fields,
        scope: plan.scope,
        hint: plan.hint,
        detail: o.detail || null
      });
    }
    function qAt(i) { return qs[i] || null; }
    function numOf(q, i) { return D ? D.numberOf(q, i) : (i + 1); }

    /* ── (a) validate.js の結果を正規化して取り込む ── */
    /* ここは「直す場所を洗い出す」ための検査。
       出題・公開できる状態かどうかで見る（編集中の甘い基準では、
       直すべき書きかけの問題が 1 件も挙がらない）。 */
    var base = V.validatePresetForSave(p, {
      sourceOnly: opts.sourceOnly,
      expectedCount: opts.expectedCount,
      requireAnswerable: opts.requireAnswerable !== false,
      requireRubric: opts.requireRubric !== false
    });
    base.forEach(function (i) {
      var m = String(i.path || "").match(/^questions\[(\d+)\]/);
      var idx = m ? parseInt(m[1], 10) : -1;
      var q = idx >= 0 ? qAt(idx) : null;
      var code = FROM_VALIDATE[i.code] || i.code;
      /* 問題数の過不足は「不足」のときだけ補充の対象。多いときは手で消す。 */
      if (code === "question_count_shortage" && opts.expectedCount
          && qs.length >= opts.expectedCount) code = "question_count_over";
      push({
        severity: i.severity === "warning" ? "warning" : "error",
        code: code, message: i.message, path: i.path,
        questionId: q ? q.id : null,
        questionNumber: q ? numOf(q, idx) : null,
        excerpt: q ? trim(q.prompt).slice(0, 60) : ""
      });
    });

    /* ── (b) 追加の検査 ── */
    /* 問題番号が無い */
    qs.forEach(function (q, i) {
      if (!isPosInt(q && q.questionNumber)) {
        push({ severity: "warning", code: "missing_question_number",
               message: "問題番号がついていません。",
               path: "questions[" + i + "].questionNumber",
               questionId: q.id, questionNumber: numOf(q, i),
               excerpt: trim(q.prompt).slice(0, 60) });
      }
    });

    /* 同じ内容の問題 */
    var seenPrompt = Object.create(null);
    qs.forEach(function (q, i) {
      var k = normPrompt(q && q.prompt);
      if (!k) return;
      if (seenPrompt[k] !== undefined) {
        var firstIdx = seenPrompt[k];
        push({ severity: "warning", code: "duplicate_question",
               message: "問 " + numOf(qs[firstIdx], firstIdx) + " と同じ内容です。",
               path: "questions[" + i + "].prompt",
               questionId: q.id, questionNumber: numOf(q, i),
               excerpt: trim(q.prompt).slice(0, 60),
               detail: { duplicateOfId: qs[firstIdx].id,
                         duplicateOfNumber: numOf(qs[firstIdx], firstIdx) } });
      } else seenPrompt[k] = i;
    });

    /* 解説が無い */
    qs.forEach(function (q, i) {
      if (!trim(q && q.explanation)) {
        push({ severity: "info", code: "missing_explanation",
               message: "解説がありません。",
               path: "questions[" + i + "].explanation",
               questionId: q.id, questionNumber: numOf(q, i),
               excerpt: trim(q.prompt).slice(0, 60) });
      }
    });

    /* 日本語以外の文字 */
    qs.forEach(function (q, i) {
      var spots = [];
      var pf = foreignCharsIn(q && q.prompt);
      if (pf.length) spots.push({ field: "prompt", chars: pf });
      var ef = foreignCharsIn(q && q.explanation);
      if (ef.length) spots.push({ field: "explanation", chars: ef });
      (q && q.choices || []).forEach(function (c, ci) {
        var cf = foreignCharsIn(c && c.text);
        if (cf.length) spots.push({ field: "choices", choiceIndex: ci, choiceId: c.id, chars: cf });
      });
      if (!spots.length) return;
      var all = [];
      spots.forEach(function (s) { s.chars.forEach(function (c) { if (all.indexOf(c) < 0) all.push(c); }); });
      push({ severity: "error", code: "foreign_character_mixed",
             message: "日本語以外の文字が混じっています: " + all.slice(0, 8).join(" "),
             path: "questions[" + i + "]",
             questionId: q.id, questionNumber: numOf(q, i),
             excerpt: trim(q.prompt).slice(0, 60),
             detail: { spots: spots, chars: all } });
    });

    /* 正解が選択肢の中に無い */
    qs.forEach(function (q, i) {
      var orphan = answerOrphanOf(q);
      if (orphan) {
        push({ severity: "error", code: "answer_orphan",
               message: "正解「" + orphan.slice(0, 20) + "」に対応する選択肢がありません。",
               path: "questions[" + i + "].correctAnswer",
               questionId: q.id, questionNumber: numOf(q, i),
               excerpt: trim(q.prompt).slice(0, 60) });
      }
    });

    /* 資料に根拠が無い（資料限定のときだけ） */
    if (opts.sourceOnly) {
      qs.forEach(function (q, i) {
        if ((q.sourceReferences || []).length) return;
        push({ severity: "warning", code: "unsupported_claim",
               message: "資料限定の指定ですが、出典がありません。",
               path: "questions[" + i + "].sourceReferences",
               questionId: q.id, questionNumber: numOf(q, i),
               excerpt: trim(q.prompt).slice(0, 60) });
      });
    }

    /* 問題数の不足（validate.js は warning の「過不足」しか出さない） */
    if (opts.expectedCount && qs.length < opts.expectedCount) {
      var already = out.some(function (i) { return i.code === "question_count_shortage"; });
      if (!already) {
        push({ severity: "warning", code: "question_count_shortage",
               message: "指定は " + opts.expectedCount + " 問ですが " + qs.length + " 問です。",
               path: "questions",
               detail: { expected: opts.expectedCount, current: qs.length,
                         missing: opts.expectedCount - qs.length } });
      }
    }

    /* ── (c) 選択肢数の指定（全体制約）── */
    if (isPosInt(opts.choiceCount)) {
      qs.forEach(function (q, i) {
        if (!S.hasChoices(q.type) || q.type === "true_false") return;
        var n = (q.choices || []).length;
        if (n === opts.choiceCount) return;
        push({ severity: "error", code: "wrong_choice_count",
               message: "選択肢が " + n + " 個です（指定は " + opts.choiceCount + " 個）。",
               path: "questions[" + i + "].choices",
               questionId: q.id, questionNumber: numOf(q, i),
               excerpt: trim(q.prompt).slice(0, 60),
               detail: { expected: opts.choiceCount, current: n } });
      });
    }

    return out;
  }

  function bySeverity(issues, sev) {
    return (issues || []).filter(function (i) { return i.severity === sev; });
  }
  function repairableIssues(issues) {
    return (issues || []).filter(function (i) { return i.aiRepairable || i.autoRepairable; });
  }
  function groupByQuestion(issues) {
    var map = Object.create(null), order = [];
    (issues || []).forEach(function (i) {
      var k = i.questionId || "__preset__";
      if (!map[k]) { map[k] = []; order.push(k); }
      map[k].push(i);
    });
    return order.map(function (k) { return { questionId: k === "__preset__" ? null : k, issues: map[k] }; });
  }

  /* ══════════════════════════════════════════════════════════════════
     3. AI を呼ばずに直せるもの
     ・内部 ID の重複 → 発行し直す（内容は 1 文字も変えない）
     ・番号の重複／欠落 → 付け直す
     ══════════════════════════════════════════════════════════════════ */
  function autoRepair(preset, issues) {
    var p = clone(preset);
    var qs = Array.isArray(p.questions) ? p.questions : [];
    var codes = {};
    (issues || []).forEach(function (i) { codes[i.code] = true; });
    var changes = [];

    if (codes.duplicate_question_id) {
      var seen = Object.create(null);
      qs.forEach(function (q, i) {
        var id = trim(q && q.id);
        if (!id || seen[id]) {
          var old = id;
          q.id = S.newId("q");
          seen[q.id] = true;
          changes.push({ kind: "reissueId", index: i, questionId: q.id, from: old,
                         number: D.numberOf(q, i),
                         message: "内部 ID を発行し直しました（内容は変えていません）" });
        } else seen[id] = true;
      });
    }
    if (codes.duplicate_question_number || codes.missing_question_number) {
      var before = qs.map(function (q, i) { return D.numberOf(q, i); });
      var r = D.repairIdentity(qs);
      p.questions = r.questions;
      qs = p.questions;
      qs.forEach(function (q, i) {
        if (before[i] !== q.questionNumber) {
          changes.push({ kind: "renumber", index: i, questionId: q.id,
                         from: before[i], to: q.questionNumber,
                         message: "問題番号を " + before[i] + " → " + q.questionNumber + " に直しました" });
        }
      });
    }
    return { preset: p, changes: changes, changed: changes.length > 0 };
  }

  /* ══════════════════════════════════════════════════════════════════
     4. AI への依頼を組み立てる
     ・触ってよいフィールドを、指示にもデータにも明示する。
     ══════════════════════════════════════════════════════════════════ */
  var FIELD_JA = {
    prompt: "問題文", choices: "選択肢", correctAnswer: "正解",
    acceptedAnswers: "別解", explanation: "解説", topic: "単元",
    sourceReferences: "出典", type: "問題形式"
  };

  function allowedFieldsFor(issues) {
    var set = Object.create(null);
    (issues || []).forEach(function (i) {
      (i.fields || []).forEach(function (f) { set[f] = true; });
    });
    return Object.keys(set);
  }

  function buildRepairRequest(preset, issues, opts) {
    opts = opts || {};
    var qs = (preset && preset.questions) || [];
    var target = (issues || []).filter(function (i) { return i.aiRepairable && !i.backfillOnly; });
    var ids = [];
    target.forEach(function (i) { if (i.questionId && ids.indexOf(i.questionId) < 0) ids.push(i.questionId); });
    var fields = allowedFieldsFor(target);

    var lines = [];
    target.forEach(function (i) {
      var q = qs.filter(function (x) { return x.id === i.questionId; })[0];
      var no = i.questionNumber || (q ? D.numberOf(q, qs.indexOf(q)) : "?");
      var f = (i.fields || []).map(function (x) { return FIELD_JA[x] || x; }).join("・");
      lines.push("・問 " + no + "（id: " + i.questionId + "）: " + i.message
        + (f ? "　直してよいのは " + f + " だけです。" : ""));
      if (i.code === "foreign_character_mixed" && i.detail && i.detail.chars) {
        lines.push("　　混じっている文字: " + i.detail.chars.join(" ")
          + "　その文字だけを日本語へ直し、ほかの部分は 1 文字も変えないでください。");
      }
      if (i.code === "wrong_choice_count" && i.detail) {
        lines.push("　　選択肢を " + i.detail.expected + " 個にしてください。"
          + "いまの正解はそのまま残し、足す選択肢は明確な誤答にしてください。");
      }
      if (i.code === "multiple_correct_choices") {
        lines.push("　　正解は 1 つだけにし、ほかは明確な誤答へ直してください。");
      }
      if (i.code === "duplicate_question" && i.detail) {
        lines.push("　　問 " + i.detail.duplicateOfNumber + " と内容が重なっています。"
          + "別の論点へ作り直してください。");
      }
    });

    var instruction = [
      "次の検証エラーだけを直してください。",
      "",
      "【守ること】",
      "・書かれていない問題には手を触れないでください。",
      "・書かれていないフィールドは変えないでください。",
      "・問題の id は受け取ったものをそのまま返してください（新しく作らない）。",
      "・問題番号は変えないでください。",
      "・直した問題だけを返してください。",
      "",
      "【直すこと】",
      lines.join("\n")
    ].join("\n");

    return {
      instruction: instruction,
      questionIds: ids,
      allowedFields: fields,
      issues: target,
      byQuestion: (function () {
        var m = Object.create(null);
        target.forEach(function (i) {
          if (!i.questionId) return;
          if (!m[i.questionId]) m[i.questionId] = [];
          m[i.questionId].push(i);
        });
        return m;
      })()
    };
  }

  /* ══════════════════════════════════════════════════════════════════
     5. 提案の検査
     ・対象外の問題が入っていたら、その提案を落とす。
     ・許していないフィールドの変更は落とす（＝現在の値で埋め直す）。
     ・保護フィールドを書き換えようとしていたら落とす。
     ・foreign_character_mixed は「その文字だけ」かどうかも見る。
     ══════════════════════════════════════════════════════════════════ */
  var PROTECTED = { id: 1, questionNumber: 1, number: 1, createdAt: 1, createdBy: 1,
                    ownerId: 1, schemaVersion: 1, stats: 1, visibility: 1 };

  var REJECT_JA = {
    outOfScope: "修復の対象になっていない問題です",
    unknownQuestion: "どの問題への提案か分かりません",
    noAllowedChange: "直してよい範囲に変更がありません",
    protectedField: "変えてはいけない項目を書き換えようとしています",
    rewroteTooMuch: "文字を直すだけのはずが、文章ごと書き換えています",
    foreignRemains: "日本語以外の文字が残っています",
    emptyPrompt: "問題文が空です",
    choiceCount: "選択肢の数が足りません",
    lostCorrect: "正解が無くなっています"
  };

  /* 似ているか（長さの比で見る簡易な指標）。
     文字を直すだけのはずの修復で、文章ごと作り直されていないかを見る。 */
  function tooDifferent(a, b) {
    var x = str(a), y = str(b);
    if (!x.length) return false;
    var lenRatio = Math.abs(x.length - y.length) / x.length;
    if (lenRatio > 0.35) return true;
    /* 先頭と末尾がどちらも変わっているものは作り直しとみなす */
    var head = x.slice(0, 6), tail = x.slice(-6);
    if (head && tail && y.indexOf(head) < 0 && y.indexOf(tail) < 0) return true;
    return false;
  }

  function screenRepairProposal(preset, request, proposedList) {
    var qs = (preset && preset.questions) || [];
    var byId = Object.create(null);
    qs.forEach(function (q) { byId[q.id] = q; });
    var scope = Object.create(null);
    (request.questionIds || []).forEach(function (id) { scope[id] = true; });

    var accepted = [], rejected = [];
    function drop(p, reason, extra) {
      rejected.push({ questionId: (p && (p.sourceId || p.id)) || "",
                      reason: reason, message: REJECT_JA[reason] || reason,
                      detail: extra || null });
    }

    (proposedList || []).forEach(function (p) {
      if (!p) return;
      var target = byId[p.sourceId] || byId[p.id] || null;
      if (!target) { drop(p, "unknownQuestion"); return; }
      if (!scope[target.id]) { drop(p, "outOfScope"); return; }

      var issues = request.byQuestion[target.id] || [];
      var allowed = allowedFieldsFor(issues);

      /* 保護フィールドを変えようとしていないか */
      var bad = null;
      Object.keys(PROTECTED).forEach(function (k) {
        if (p[k] === undefined) return;
        if (k === "id" || k === "sourceId") return;               /* 対応づけに使う */
        if (JSON.stringify(p[k]) !== JSON.stringify(target[k])) bad = k;
      });
      if (bad) { drop(p, "protectedField", { field: bad }); return; }

      /* 許したフィールドだけを取り出し、それ以外は現在の値で埋める。
         こうすると diff にも「許した範囲の変更」しか出てこない。 */
      var masked = clone(target);
      var touched = [];
      allowed.forEach(function (f) {
        if (p[f] === undefined) return;
        if (JSON.stringify(p[f]) === JSON.stringify(target[f])) return;
        masked[f] = clone(p[f]);
        touched.push(f);
      });
      if (!touched.length) { drop(p, "noAllowedChange"); return; }

      /* 直したはずのものが直っているか（コード別の確認） */
      var codes = {};
      issues.forEach(function (i) { codes[i.code] = i; });

      if (codes.missing_question_text && !trim(masked.prompt)) { drop(p, "emptyPrompt"); return; }

      if (codes.foreign_character_mixed) {
        var remains = foreignCharsIn(masked.prompt).concat(foreignCharsIn(masked.explanation));
        (masked.choices || []).forEach(function (c) {
          remains = remains.concat(foreignCharsIn(c && c.text));
        });
        if (remains.length) { drop(p, "foreignRemains", { chars: remains.slice(0, 8) }); return; }
        /* 文字だけ直すはずが、文章ごと変わっていないか */
        var over = null;
        if (touched.indexOf("prompt") >= 0 && tooDifferent(target.prompt, masked.prompt)) over = "prompt";
        if (!over && touched.indexOf("explanation") >= 0
            && tooDifferent(target.explanation, masked.explanation)) over = "explanation";
        if (over) { drop(p, "rewroteTooMuch", { field: over }); return; }
      }

      if (codes.wrong_choice_count && codes.wrong_choice_count.detail) {
        var want = codes.wrong_choice_count.detail.expected;
        var got = (masked.choices || []).length;
        if (want && got !== want) { drop(p, "choiceCount", { expected: want, got: got }); return; }
      }

      if (S.hasChoices(masked.type) && (masked.choices || []).length) {
        var correct = masked.choices.filter(function (c) { return c && c.isCorrect === true; });
        if (!correct.length) { drop(p, "lostCorrect"); return; }
        if (masked.type === "multiple_choice_single" && correct.length > 1) {
          drop(p, "lostCorrect", { count: correct.length }); return;
        }
      }

      masked.sourceId = target.id;      /* diff の対応づけ用 */
      accepted.push({ question: masked, touched: touched, targetId: target.id });
    });

    return { accepted: accepted, rejected: rejected,
             acceptedQuestions: accepted.map(function (a) { return a.question; }) };
  }

  /* 適用してよいかの最後の確認。
     対象外の問題が 1 つでも変わっていたら、まるごと拒否する。 */
  function verifyApplication(before, after, allowedIds) {
    var scope = Object.create(null);
    (allowedIds || []).forEach(function (id) { scope[id] = true; });
    var beforeById = Object.create(null);
    (before || []).forEach(function (q) { beforeById[q.id] = q; });
    var violations = [];
    (after || []).forEach(function (q) {
      var b = beforeById[q.id];
      if (!b) return;                         /* 追加された問題は別で見る */
      if (scope[q.id]) return;
      if (JSON.stringify(b) !== JSON.stringify(q)) {
        violations.push({ questionId: q.id, number: q.questionNumber,
                          message: "対象外の問題が変わっています" });
      }
    });
    /* 消えた問題が無いか（修復で問題を減らさない） */
    (before || []).forEach(function (b) {
      if (!(after || []).some(function (q) { return q.id === b.id; })) {
        violations.push({ questionId: b.id, number: b.questionNumber,
                          message: "問題が消えています" });
      }
    });
    return { ok: violations.length === 0, violations: violations };
  }

  /* ══════════════════════════════════════════════════════════════════
     6. 不足問題の補充
     ══════════════════════════════════════════════════════════════════ */
  function shortagePlan(preset, opts) {
    opts = opts || {};
    var qs = (preset && preset.questions) || [];
    var expected = Number(opts.expectedCount) || 0;
    var current = qs.length;
    var missing = expected > current ? expected - current : 0;

    /* 欠番（1..maxNumber のうち使われていない番号） */
    var used = Object.create(null), max = 0;
    qs.forEach(function (q, i) {
      var n = D.numberOf(q, i);
      used[n] = true;
      if (n > max) max = n;
    });
    var gaps = [];
    for (var n = 1; n <= max; n++) if (!used[n]) gaps.push(n);

    return {
      expected: expected, current: current, missing: missing,
      gaps: gaps, maxNumber: max,
      /* 表示番号の扱い。既定は末尾へ追加（既存の番号を動かさない）。 */
      numberingModes: ["append", "fill-gaps"],
      defaultMode: gaps.length ? "fill-gaps" : "append",
      canBackfill: missing > 0 || gaps.length > 0
    };
  }

  /* 補充で引き継ぐ条件。作り話をせず、あるものだけを渡す。 */
  function backfillConditions(preset, opts) {
    opts = opts || {};
    var qs = (preset && preset.questions) || [];
    var types = {}, diffs = {}, choiceCounts = {};
    qs.forEach(function (q) {
      if (q.type) types[q.type] = (types[q.type] || 0) + 1;
      if (q.difficulty) diffs[q.difficulty] = (diffs[q.difficulty] || 0) + 1;
      if (S.hasChoices(q.type) && q.type !== "true_false") {
        var n = (q.choices || []).length;
        if (n) choiceCounts[n] = (choiceCounts[n] || 0) + 1;
      }
    });
    function top(map) {
      var k = Object.keys(map);
      if (!k.length) return null;
      k.sort(function (a, b) { return map[b] - map[a]; });
      return k[0];
    }
    var topics = [];
    qs.forEach(function (q) {
      var t = trim(q.topic) || trim(q.prompt).slice(0, 30);
      if (t && topics.indexOf(t) < 0) topics.push(t);
    });
    return {
      subject: trim(opts.subject) || trim(preset && preset.subject) || "",
      scope: trim(opts.scope) || trim(preset && preset.description) || "",
      difficulty: opts.difficulty || top(diffs) || "",
      type: opts.type || top(types) || "",
      choiceCount: Number(opts.choiceCount) || Number(top(choiceCounts)) || 0,
      sourceOnly: !!opts.sourceOnly,
      exclude: (opts.exclude || []).slice(),
      existingTopics: topics.slice(0, 80)
    };
  }

  function buildBackfillRequest(preset, plan, opts) {
    opts = opts || {};
    var cond = backfillConditions(preset, opts);
    var mode = opts.numberingMode === "fill-gaps" ? "fill-gaps" : "append";
    var count = mode === "fill-gaps"
      ? Math.max(plan.missing, plan.gaps.length)
      : plan.missing;
    if (opts.count) count = Number(opts.count) || count;

    var lines = ["不足している " + count + " 問だけを新しく作ってください。",
                 "既存の問題は 1 問も変えないでください。", ""];
    lines.push("【条件】");
    if (cond.subject) lines.push("・教科: " + cond.subject);
    if (cond.scope) lines.push("・範囲: " + cond.scope);
    if (cond.difficulty) lines.push("・難易度: " + cond.difficulty);
    if (cond.type) lines.push("・問題形式: " + cond.type);
    if (cond.choiceCount) lines.push("・選択肢: " + cond.choiceCount + " 個");
    if (cond.sourceOnly) lines.push("・資料にある内容だけで作ること");
    if (cond.exclude.length) lines.push("・次は出さないこと: " + cond.exclude.join("、"));
    lines.push("");
    lines.push("【すでにある論点（重ならないようにすること）】");
    lines.push(cond.existingTopics.map(function (t, i) { return (i + 1) + ". " + t; }).join("\n"));

    return {
      instruction: lines.join("\n"),
      count: count, mode: mode, conditions: cond,
      /* 番号の付け方。内部 ID は必ず新しく発行する（ここでは決めない）。 */
      targetNumbers: mode === "fill-gaps"
        ? plan.gaps.slice(0, count).concat(rangeFrom(plan.maxNumber + 1, count - Math.min(count, plan.gaps.length)))
        : rangeFrom(plan.maxNumber + 1, count)
    };
  }
  function rangeFrom(start, n) {
    var out = [];
    for (var i = 0; i < Math.max(0, n); i++) out.push(start + i);
    return out;
  }

  /* 補充された問題の検査。既存と重ならないこと・中身があること。 */
  function screenBackfill(preset, request, proposedList) {
    var qs = (preset && preset.questions) || [];
    var seen = Object.create(null);
    qs.forEach(function (q) { seen[normPrompt(q.prompt)] = q.id; });
    var accepted = [], rejected = [];
    (proposedList || []).forEach(function (p) {
      if (!p) return;
      var body = trim(p.prompt);
      if (!body) { rejected.push({ reason: "emptyPrompt", message: REJECT_JA.emptyPrompt }); return; }
      var k = normPrompt(body);
      if (seen[k]) {
        rejected.push({ reason: "duplicate", message: "すでにある問題と同じ内容です",
                        detail: { sameAs: seen[k] } });
        return;
      }
      if (S.hasChoices(p.type)) {
        var ch = (p.choices || []).filter(function (c) { return trim(c && c.text); });
        if (ch.length < 2) { rejected.push({ reason: "choiceCount", message: REJECT_JA.choiceCount }); return; }
        if (!ch.some(function (c) { return c.isCorrect === true; })) {
          rejected.push({ reason: "lostCorrect", message: REJECT_JA.lostCorrect }); return;
        }
        if (request && request.conditions && request.conditions.choiceCount
            && p.type !== "true_false" && ch.length !== request.conditions.choiceCount) {
          rejected.push({ reason: "choiceCount",
                          message: "選択肢が " + ch.length + " 個です（指定は "
                            + request.conditions.choiceCount + " 個）" });
          return;
        }
      }
      var foreign = foreignCharsIn(body);
      if (foreign.length) {
        rejected.push({ reason: "foreignRemains", message: REJECT_JA.foreignRemains,
                        detail: { chars: foreign } });
        return;
      }
      seen[k] = "__new__";
      accepted.push(p);
      if (request && accepted.length >= request.count) return;
    });
    /* 頼んだ数より多ければ切る（勝手に増やさせない） */
    if (request && request.count && accepted.length > request.count) {
      accepted.slice(request.count).forEach(function () {
        rejected.push({ reason: "tooMany", message: "頼んだ数より多いので使いません" });
      });
      accepted = accepted.slice(0, request.count);
    }
    return { accepted: accepted, rejected: rejected };
  }

  /* 補充した問題を実際に足す。内部 ID は必ず新しく発行する。 */
  function applyBackfill(preset, added, opts) {
    opts = opts || {};
    var p = clone(preset);
    var qs = p.questions = (p.questions || []).map(function (q) { return q; });
    D.stampNumbers(qs);
    var used = Object.create(null);
    qs.forEach(function (q) { used[q.id] = true; });
    var usedNo = Object.create(null);
    qs.forEach(function (q) { usedNo[q.questionNumber] = true; });
    var mode = opts.numberingMode === "fill-gaps" ? "fill-gaps" : "append";
    var gaps = [];
    if (mode === "fill-gaps") {
      var max = D.maxNumber(qs);
      for (var n = 1; n <= max; n++) if (!usedNo[n]) gaps.push(n);
    }
    var next = D.maxNumber(qs) + 1;
    var applied = [];
    (added || []).forEach(function (a) {
      var q = clone(a);
      delete q.sourceId;
      /* 内部 ID は必ず新しく発行する（AI が返した id は使わない） */
      q.id = S.newId("q");
      used[q.id] = true;
      q.questionNumber = gaps.length ? gaps.shift() : next++;
      qs.push(q);
      applied.push({ questionId: q.id, number: q.questionNumber });
    });
    /* 欠番を埋めたときは並びを番号順にそろえる */
    if (mode === "fill-gaps") {
      qs.sort(function (a, b) { return (a.questionNumber || 0) - (b.questionNumber || 0); });
    }
    return { preset: p, applied: applied };
  }

  /* ══════════════════════════════════════════════════════════════════
     7. 全体制約（生成中の追加指示）の遡及確認
     ══════════════════════════════════════════════════════════════════ */
  var GLOBAL_RULES = [
    { key: "choiceCount", re: /選択肢[^。\n]{0,6}?([0-9０-９]{1,2})\s*(個|つ|択)/,
      pick: function (m) { return { choiceCount: toInt(m[1]) }; },
      label: function (v) { return "選択肢を " + v.choiceCount + " 個にする"; } },
    { key: "explanationDetail", re: /(全問|すべて|全て)[^。\n]{0,10}解説[^。\n]{0,10}(詳し|くわし)/,
      pick: function () { return { explanationDetail: true }; },
      label: function () { return "全問の解説を詳しくする"; } },
    { key: "typeAll", re: /(全問|すべて|全て)[^。\n]{0,10}(選択問題|選択式|多肢選択)/,
      pick: function () { return { typeAll: "multiple_choice_single" }; },
      label: function () { return "全問を選択問題にする"; } },
    { key: "typeAllTf", re: /(全問|すべて|全て)[^。\n]{0,10}(正誤問題|○×|マルバツ)/,
      pick: function () { return { typeAll: "true_false" }; },
      label: function () { return "全問を正誤問題にする"; } },
    { key: "difficultyAll", re: /(全問|すべて|全て)[^。\n]{0,10}(易し|やさし|簡単)/,
      pick: function () { return { difficultyAll: "easy" }; },
      label: function () { return "全問を易しくする"; } },
    { key: "difficultyHard", re: /(全問|すべて|全て)[^。\n]{0,10}(難し|むずかし)/,
      pick: function () { return { difficultyAll: "hard" }; },
      label: function () { return "全問を難しくする"; } },
    { key: "explanationAll", re: /(全問|すべて|全て)[^。\n]{0,10}解説[^。\n]{0,6}(を?付|を?つけ|を?入れ)/,
      pick: function () { return { explanationRequired: true }; },
      label: function () { return "全問に解説を付ける"; } }
  ];
  function toInt(s) {
    return parseInt(String(s).replace(/[０-９]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
    }), 10);
  }

  /* 追加指示の文から全体制約を読み取る。読めないものは無視する（作らない）。 */
  function globalConstraintsFrom(followups) {
    var list = Array.isArray(followups) ? followups
      : (followups && Array.isArray(followups.items) ? followups.items : []);
    var out = { constraints: {}, sources: [] };
    list.forEach(function (f) {
      var text = typeof f === "string" ? f : str(f && f.text);
      if (!text) return;
      GLOBAL_RULES.forEach(function (r) {
        var m = r.re.exec(text);
        if (!m) return;
        var v = r.pick(m);
        Object.keys(v).forEach(function (k) { out.constraints[k] = v[k]; });
        out.sources.push({ key: r.key, text: text.slice(0, 80), label: r.label(v) });
      });
    });
    return out;
  }

  /* 全体制約が全問へ効いているかを見る。効いていない問題を返す。 */
  function checkGlobalConstraints(preset, constraints) {
    var qs = (preset && preset.questions) || [];
    var c = constraints || {};
    var out = [];
    qs.forEach(function (q, i) {
      var no = D.numberOf(q, i);
      if (isPosInt(c.choiceCount) && S.hasChoices(q.type) && q.type !== "true_false") {
        var n = (q.choices || []).length;
        if (n !== c.choiceCount) {
          out.push({ questionId: q.id, questionNumber: no, code: "wrong_choice_count",
                     message: "選択肢が " + n + " 個です（指示は " + c.choiceCount + " 個）",
                     fields: ["choices"], detail: { expected: c.choiceCount, current: n } });
        }
      }
      if (c.typeAll && q.type !== c.typeAll) {
        out.push({ questionId: q.id, questionNumber: no, code: "question_type_mismatch",
                   message: "問題形式が指示と違います（" + q.type + "）",
                   fields: ["type", "choices", "correctAnswer"],
                   detail: { expected: c.typeAll, current: q.type } });
      }
      if (c.difficultyAll && q.difficulty !== c.difficultyAll) {
        out.push({ questionId: q.id, questionNumber: no, code: "difficulty_mismatch",
                   message: "難易度が指示と違います（" + q.difficulty + "）",
                   fields: ["prompt", "choices", "difficulty"],
                   detail: { expected: c.difficultyAll, current: q.difficulty } });
      }
      if ((c.explanationRequired || c.explanationDetail) && !trim(q.explanation)) {
        out.push({ questionId: q.id, questionNumber: no, code: "missing_explanation",
                   message: "解説がありません（指示は全問に解説）",
                   fields: ["explanation"] });
      }
      if (c.explanationDetail && trim(q.explanation) && trim(q.explanation).length < 40) {
        out.push({ questionId: q.id, questionNumber: no, code: "missing_explanation",
                   message: "解説が短いままです（" + trim(q.explanation).length + " 字）",
                   fields: ["explanation"] });
      }
    });
    return out;
  }

  /* 全体制約の違反を、画面で扱える形（audit と同じ形）へ直す。 */
  function globalIssuesToAudit(violations, sourceLabel) {
    return (violations || []).map(function (v, i) {
      var plan = planFor(v.code);
      return {
        id: "gis" + (i + 1),
        severity: "error",
        code: v.code,
        label: plan.label,
        message: v.message,
        path: "questions",
        questionId: v.questionId,
        questionNumber: v.questionNumber,
        excerpt: "",
        aiRepairable: plan.ai || (v.fields || []).length > 0,
        autoRepairable: plan.auto,
        manualOnly: false,
        fields: (v.fields && v.fields.length) ? v.fields : plan.fields,
        scope: "question",
        hint: plan.hint,
        detail: v.detail || null,
        fromGlobal: sourceLabel || "追加指示"
      };
    });
  }

  /* 生成を終える前の最低限の確認（§4）。 */
  function preCompletionCheck(preset, opts) {
    opts = opts || {};
    var issues = auditPreset(preset, opts);
    var g = opts.constraints || {};
    var globals = globalIssuesToAudit(checkGlobalConstraints(preset, g), "追加指示");
    var qs = (preset && preset.questions) || [];
    var numbers = qs.map(function (q, i) { return D.numberOf(q, i); });
    var sorted = numbers.slice().sort(function (a, b) { return a - b; });
    var contiguous = sorted.every(function (n, i) { return i === 0 || n === sorted[i - 1] + 1; });
    return {
      issues: issues.concat(globals),
      summary: {
        count: qs.length,
        expected: opts.expectedCount || null,
        numbersContiguous: contiguous,
        errors: issues.concat(globals).filter(function (i) { return i.severity === "error"; }).length,
        warnings: issues.filter(function (i) { return i.severity === "warning"; }).length,
        infos: issues.filter(function (i) { return i.severity === "info"; }).length
      }
    };
  }

  /* ══════════════════════════════════════════════════════════════════
     8. 修復ループ（最大 3 回）
     ══════════════════════════════════════════════════════════════════ */
  function newLoopState() {
    return { round: 0, maxRounds: MAX_ROUNDS, running: false, stopped: false,
             stopReason: "", history: [], remaining: [] };
  }
  function loopCanContinue(state) {
    return !!state && !state.stopped && state.round < state.maxRounds;
  }
  /* 1 周ぶんの記録。直らなくなったら止める（同じことを繰り返させない）。 */
  function loopRecord(state, before, after) {
    state.round++;
    var b = countErrors(before), a = countErrors(after);
    state.history.push({ round: state.round, before: b, after: a });
    state.remaining = (after || []).filter(function (i) { return i.severity === "error"; });
    if (a === 0) { state.stopped = true; state.stopReason = "solved"; }
    else if (state.round >= state.maxRounds) { state.stopped = true; state.stopReason = "maxRounds"; }
    else if (a >= b) { state.stopped = true; state.stopReason = "noProgress"; }
    return state;
  }
  function countErrors(issues) {
    return (issues || []).filter(function (i) { return i.severity === "error"; }).length;
  }
  var STOP_JA = {
    solved: "すべて直りました。",
    maxRounds: "3 回試しましたが直りませんでした。ここからは手で直してください。",
    noProgress: "これ以上は自動で直せませんでした。ここからは手で直してください。",
    cancelled: "止めました。データは変えていません。"
  };
  function loopMessage(state) {
    if (!state || !state.stopped) return "";
    return STOP_JA[state.stopReason] || "";
  }
  /* 直らなかったものの手当て。何をすればよいかを具体的に出す。 */
  function manualGuide(issues) {
    return (issues || []).map(function (i) {
      return { questionId: i.questionId, questionNumber: i.questionNumber,
               code: i.code, message: i.message,
               how: planFor(i.code).hint };
    });
  }

  VQ2.repair = {
    REPAIR_VERSION: REPAIR_VERSION,
    MAX_ROUNDS: MAX_ROUNDS,
    CODES: CODES,
    CODE_IDS: CODE_IDS,
    FROM_VALIDATE: FROM_VALIDATE,
    PROTECTED: PROTECTED,
    REJECT_JA: REJECT_JA,

    planFor: planFor,
    foreignCharsIn: foreignCharsIn,
    normPrompt: normPrompt,
    answerOrphanOf: answerOrphanOf,

    auditPreset: auditPreset,
    bySeverity: bySeverity,
    repairableIssues: repairableIssues,
    groupByQuestion: groupByQuestion,

    autoRepair: autoRepair,
    allowedFieldsFor: allowedFieldsFor,
    buildRepairRequest: buildRepairRequest,
    screenRepairProposal: screenRepairProposal,
    verifyApplication: verifyApplication,
    tooDifferent: tooDifferent,

    shortagePlan: shortagePlan,
    backfillConditions: backfillConditions,
    buildBackfillRequest: buildBackfillRequest,
    screenBackfill: screenBackfill,
    applyBackfill: applyBackfill,

    globalConstraintsFrom: globalConstraintsFrom,
    checkGlobalConstraints: checkGlobalConstraints,
    globalIssuesToAudit: globalIssuesToAudit,
    preCompletionCheck: preCompletionCheck,

    newLoopState: newLoopState,
    loopCanContinue: loopCanContinue,
    loopRecord: loopRecord,
    loopMessage: loopMessage,
    countErrors: countErrors,
    manualGuide: manualGuide
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
