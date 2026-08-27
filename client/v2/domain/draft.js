/* ══════════════════════════════════════════════════════════════════════
   AI Draft の取り込みと差分（§7 / §30）
   ・Orchestrator が返す Preset Draft / Mock Draft を V2 の Entity へ写す。
   ・AI の結果を自動確定しない。必ず差分を出し、適用は利用者の操作で行う。
   ・適用は「全部」「問題単位」「項目単位」の 3 段階でできる。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var S = VQ2.schema;
  if (!S) throw new Error("VQ2.schema must be loaded before draft.js");

  function str(v) { return v === undefined || v === null ? "" : String(v); }
  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

  /* Orchestrator の語彙 → V2 の語彙 */
  var TYPE_MAP = {
    multiple_choice: "multiple_choice_single",
    true_false: "true_false",
    short_answer: "short_answer",
    descriptive: "long_answer"
  };
  var DIFFICULTY_MAP = { easy: "easy", standard: "normal", normal: "normal", hard: "hard" };
  var CONFIDENCE_MAP = { high: 0.9, medium: 0.6, low: 0.3 };

  /* ══════════════════════════════════════════════════════════════════
     Preset Draft → V2 Question[]
     ══════════════════════════════════════════════════════════════════ */
  function draftToQuestions(draft, opts) {
    opts = opts || {};
    var src = (draft && Array.isArray(draft.questions)) ? draft.questions : [];
    /* 形式を変えたときの記録の置き場。opts.conversions を渡せばそこへも積む
       （契約 §6：黙って別の形式へ寄せない）。 */
    var sink = Array.isArray(opts.conversions) ? opts.conversions : null;
    function mark(q, index, note, conv) {
      q.__converted = note;
      q.__conversion = conv;
      if (sink) sink.push({ index: index, questionId: q.id, note: note, conversion: conv });
      return q;
    }
    return src.map(function (d, i) {
      /* V3: 選択肢だけでは表せない形式（穴埋め・並べ替え・分類・表・図表・
         誤文訂正・複合大問・カード…）は qplan が受け持つ。
         取り込めなかったときは、これまでどおりの読み方へ落とす（捨てない）。 */
      if (VQ2.qplan && looksLikeV3(d)) {
        var v3 = VQ2.qplan.fromAi(d, opts);
        if (v3 && !v3.error) {
          v3.__order = i;
          /* qplan 側で形式を寄せていたら、その記録もここで拾って渡す。 */
          if (v3.__converted && sink)
            sink.push({ index: i, questionId: v3.id, note: v3.__converted,
                        conversion: v3.__conversion || null });
          return v3;
        }
      }
      /* 形式の変換の記録。あとで問題へ焼き付ける（黙って変えない・§6）。 */
      var convNote = "", convInfo = null;
      var rawType = str(d.type);
      var type = TYPE_MAP[rawType] || "multiple_choice_single";
      if (rawType && TYPE_MAP[rawType] === undefined) {
        /* 知らない形式名が来たとき、これまでは黙って 4 択にしていた。
           中身は使えるので落とさないが、**変えたことは必ず残す**。 */
        convNote = "「" + rawType + "」は分からない形式なので、「" + labelOf(type) + "」にしました。";
        convInfo = { originalType: rawType, originalName: rawType,
                     convertedType: type, convertedName: labelOf(type),
                     reason: "知らない形式名のため" };
      }
      var choices = (Array.isArray(d.choices) ? d.choices : []).map(function (c, ci) {
        return {
          id: str(c.id) || ("c" + (ci + 1)),
          label: String.fromCharCode(65 + ci),
          text: str(c.text),
          explanation: str(c.explanation),
          isCorrect: str(c.id) === str(d.correctAnswer)
        };
      });
      /* 選択肢が足りない選択問題は、そのままだと保存できない
         （検証で choiceCount の error になる）。実測では 15 問頼んだうちの
         12 問がこの形で返ってきた回があった。
         中身は使えるので、文字で答える形式へ落として残す。捨てない。 */
      var usable = choices.filter(function (c) { return c.text.trim(); });
      if (S.hasChoices(type) && type !== "matching" && type !== "ordering" && usable.length < 2) {
        var keep = str(d.correctAnswer);
        if (!keep && usable.length) keep = usable[0].text;
        var was = type;
        type = "short_answer";
        choices = [];
        d = Object.assign({}, d, { correctAnswer: keep });
        /* 形式を変えている。呼び出し側に分かるようにする（§6）。 */
        var note2 = "「" + labelOf(was) + "」の選択肢が " + usable.length
          + " 個しか無かったので、「" + labelOf("short_answer") + "」にしました。";
        convNote = convNote ? convNote + " " + note2 : note2;
        convInfo = { originalType: was, originalName: labelOf(was),
                     convertedType: "short_answer", convertedName: labelOf("short_answer"),
                     reason: "選択肢が 2 つ未満で、選んで答える形にできないため",
                     previous: convInfo };
      }

      /* 選択肢を持たない形式では correctAnswer をそのまま正解文字列として扱う */
      var isChoice = S.hasChoices(type) && choices.length > 0;
      /* 記述・論述・英作文は採点基準が無いと AI 採点そのものが行われない
         （根拠を示せないため）。AI が出していればそれを使い、無ければ下敷きを付ける。
         下敷きが無いままだと、解いても永久に未採点のまま残る。 */
      var points = 1;
      var rubric = S.isAiGraded(type) ? (readRubric(d.scoringRubric, points) || S.defaultRubric(type, points)) : null;
      var q = {
        /* 内部 ID はこちらで必ず新しく発行する。
           AI が返した id をそのまま使うと、小分け生成の 2 回目以降でも
           同じ id（q1,q2,q3…）が返るため、既存の問題と衝突する。
           実測：既存 5 問へ 3 問追加したとき内部 ID が 3 件重複し、
           保存前検証の duplicateQuestionId で保存そのものができなくなっていた。
           AI 側の id は照合にしか使わないので sourceId へ分けて持つ。 */
        id: opts.idPrefix ? opts.idPrefix + str(d.id) : S.newId("q"),
        /* AI が名乗った id。修正のときに「どの問題への提案か」を突き合わせる。
           表示番号でも保存用の鍵でもない。適用時に落とす。 */
        sourceId: str(d.id),
        /* 表示番号は AI に決めさせない。プリセットへ足すときに採番する。 */
        questionNumber: null,
        schemaVersion: S.SCHEMA_VERSION,
        type: type,
        prompt: str(d.question),
        promptRichText: null,
        media: [],
        choices: isChoice ? choices : [],
        correctAnswer: isChoice ? null : str(d.correctAnswer),
        acceptedAnswers: isChoice ? [] : (str(d.correctAnswer) ? [str(d.correctAnswer)] : []),
        answerNormalization: isChoice ? null : { trim: true, caseInsensitive: true, fullwidthToHalfwidth: true },
        explanation: str(d.explanation),
        choiceExplanations: null,
        difficulty: DIFFICULTY_MAP[str(d.difficulty)] || "normal",
        topic: str(d.topic),
        tags: [],
        points: points,
        scoringRubric: rubric,
        estimatedSeconds: estimateSeconds(type),
        sourceReferences: mapSources(d.sourceReferences),
        requiresReview: d.requiresReview === true,
        confidence: CONFIDENCE_MAP[str(d.confidence)] != null ? CONFIDENCE_MAP[str(d.confidence)] : null,
        validationIssues: (Array.isArray(d.warnings) ? d.warnings : []).map(function (w) {
          return S.warn("aiWarning", "", str(w));
        }),
        createdBy: "ai",
        createdAt: S.nowIso(),
        updatedAt: S.nowIso(),
        __order: i
      };
      return convNote ? mark(q, i, convNote, convInfo) : q;
    });
  }

  /* 形式の名前。レジストリがあればそこから、無ければ ID をそのまま返す。 */
  function labelOf(type) {
    try { if (VQ2.qtypes && VQ2.qtypes.label) return VQ2.qtypes.label(type) || str(type); } catch (e) {}
    return str(type);
  }
  /* 変換の記録を 1 件ぶん取り出す。 */
  function conversionOf(q, index) {
    if (!q || !q.__converted) return null;
    return { index: index, questionId: q.id, note: q.__converted, conversion: q.__conversion || null };
  }
  /* 変換の記録だけを取り出す（呼び出し側が人へ伝えるため）。 */
  function collectConversions(questions) {
    return (questions || []).map(conversionOf).filter(Boolean);
  }
  /* 保存する前に一時フィールドを落とす。
     `__` 前置きは取り込みの途中でしか使わない印なので、保存・書き出し・送信には載せない
     （sourceId も AI 側の一時 id なので同じ扱い）。
     落とす前に conversionOf で記録を拾っておくこと。黙って消さない（契約 §6）。 */
  function stripTemp(q) {
    if (!q) return q;
    delete q.sourceId;
    Object.keys(q).forEach(function (k) { if (k.indexOf("__") === 0) delete q[k]; });
    return q;
  }

  /* V3 の構造を持っているか。名乗りが無くても形で分かる。 */
  function looksLikeV3(d) {
    if (!d || typeof d !== "object") return false;
    if (Array.isArray(d.blanks) && d.blanks.length) return true;
    if (Array.isArray(d.items) && d.items.length) return true;
    if (Array.isArray(d.pairs) && d.pairs.length) return true;
    if (Array.isArray(d.groups) && d.groups.length) return true;
    if (Array.isArray(d.errors) && d.errors.length) return true;
    if (Array.isArray(d.children) && d.children.length) return true;
    if (d.table || d.chart) return true;
    if (str(d.front) && str(d.back)) return true;
    var t = str(d.questionType || d.type);
    if (!t) return false;
    var canon = VQ2.qtypes ? VQ2.qtypes.canonicalId(t) : null;
    if (!canon && VQ2.qplan && VQ2.qplan.TYPE_ALIAS[t.toLowerCase()]) canon = VQ2.qplan.TYPE_ALIAS[t.toLowerCase()];
    if (!canon) return false;
    /* 旧い 13 形式は、これまでの読み方のままにする（結果を変えないため）。 */
    return TYPE_MAP[canon] === undefined
      && (S.LEGACY_QUESTION_TYPES || S.QUESTION_TYPES).indexOf(canon) < 0;
  }

  /* AI が採点基準を出してきたときだけ受け取る。
     合計は配点へ合わせ直す（合わないと保存できない）。 */
  function readRubric(src, points) {
    var list = Array.isArray(src) ? src : (src && Array.isArray(src.items) ? src.items : null);
    if (!list || !list.length) return null;
    var items = list.slice(0, 8).map(function (r, i) {
      var desc = str(r && (r.description || r.text));
      if (!desc) return null;
      return {
        id: "r" + (i + 1), description: desc.slice(0, 500),
        points: typeof (r && r.points) === "number" && isFinite(r.points) ? Math.max(0, r.points) : 1,
        criterionId: (r && r.criterionId) === "knowledge_skill" ? "knowledge_skill" : "thinking_judgment_expression"
      };
    }).filter(Boolean);
    if (!items.length) return null;
    return S.rescaleRubric({ items: items }, points);
  }

  function estimateSeconds(type) {
    var m = {
      multiple_choice_single: 45, multiple_choice_multiple: 70, true_false: 25,
      short_answer: 60, fill_blank: 60, numeric: 60, matching: 90, ordering: 90,
      formula: 120, source_analysis: 240, long_answer: 300, essay: 480, english_writing: 480
    };
    return m[type] || 60;
  }

  /* サーバが Evidence Store から埋めた出典だけを受け取る。
     evidenceId しか無いものは、資料を特定できていないので落とす。 */
  function mapSources(list) {
    return (Array.isArray(list) ? list : []).map(function (r, i) {
      var name = str(r.fileName);
      if (!name) return null;
      var o = {
        id: str(r.evidenceId) || ("s" + (i + 1)),
        sourceType: guessSourceType(name),
        sourceId: str(r.attachmentId),
        sourceName: name,
        confidence: null,
        verified: true            /* サーバ側で実データから埋めたものだけがここへ来る */
      };
      if (typeof r.page === "number" && r.page >= 1) o.page = r.page;
      return o;
    }).filter(Boolean);
  }
  function guessSourceType(name) {
    var n = String(name).toLowerCase();
    if (/\.pdf$/.test(n)) return "pdf";
    if (/\.(png|jpe?g|gif|webp|heic)$/.test(n)) return "image";
    if (/\.zip$/.test(n)) return "zip";
    if (/\.(txt|md|csv|json|docx?)$/.test(n)) return "text";
    return "unknown";
  }

  /* ══════════════════════════════════════════════════════════════════
     問題番号と内部 ID（唯一の決定元）

     ・内部 ID  … 保存データの鍵。人には見せない。全件で一意。
     ・問題番号 … 画面と紙面に出る通し番号。プリセット全体で 1 から。
       この 2 つは別物で、番号を ID として使ってはいけない。

     決め方は 1 つだけ：**いま存在する最大番号 + 1 から順に振る**。
     空いている番号（削除跡）は埋めない。既存の問題の番号は動かさない。

     いままでは番号を持たず、並び順（index+1）で表示していた。そのため
     ・AI が付けた 1,2,3 がそのまま内部 ID になって既存と衝突する
     ・V1 へ書き戻すとき空き番号（1,2,4,7 → 3,5,6）へ詰めてしまう
     という 2 つが起きていた。どちらもここで断つ。
     ══════════════════════════════════════════════════════════════════ */
  function isPosInt(v) {
    var n = Number(v);
    return isFinite(n) && Math.floor(n) === n && n > 0;
  }
  /* その問題の番号。まだ確定していなければ、いままでの見え方を引き継ぐ。
     ・V1 から取り込んだ問題は id が "q_<番号>"。その番号が正。
     ・それ以外は並び順。 */
  function numberOf(q, index) {
    if (!q) return index + 1;
    if (isPosInt(q.questionNumber)) return Number(q.questionNumber);
    var m = /^q_(\d+)$/.exec(String(q.id || ""));
    if (m) return parseInt(m[1], 10);
    return index + 1;
  }
  function maxNumber(list) {
    var max = 0;
    (list || []).forEach(function (q, i) {
      var n = numberOf(q, i);
      if (n > max) max = n;
    });
    return max;
  }
  /* 番号を持っていない問題へ、いままでの見え方のまま番号を焼き付ける。
     見た目は変わらないが、以後は並べ替えても削除しても番号が動かなくなる。 */
  function stampNumbers(list) {
    (list || []).forEach(function (q, i) {
      if (q && !isPosInt(q.questionNumber)) q.questionNumber = numberOf(q, i);
    });
    return list;
  }
  /* 追加する問題へ、最大番号の次から順に番号を振る。
     同時に内部 ID の重複も潰す（AI が同じ id を返しても衝突させない）。
     opts.conversions に配列を渡すと、落とす前の変換の記録をそこへ積む（§6）。 */
  function assignAppended(existing, added, opts) {
    opts = opts || {};
    var sink = Array.isArray(opts.conversions) ? opts.conversions : null;
    var used = Object.create(null);
    (existing || []).forEach(function (q) { if (q && q.id) used[q.id] = true; });
    var next = maxNumber(existing) + 1;
    (added || []).forEach(function (q, i) {
      if (!q) return;
      if (!q.id || used[q.id]) q.id = S.newId("q");
      used[q.id] = true;
      q.questionNumber = next++;
      /* 形式を変えた記録は保存しない。ただし黙って消さず、呼び出し側へ渡す。 */
      var conv = conversionOf(q, i);
      if (conv && sink) sink.push(conv);
      stripTemp(q);
    });
    return added;
  }
  /* 保存直前の最終検査。ここを通らないものは保存させない。 */
  function checkIdentity(list) {
    var qs = list || [];
    var seenId = Object.create(null), seenNo = Object.create(null);
    var duplicateIds = [], duplicateNumbers = [], missingIds = [];
    qs.forEach(function (q, i) {
      var id = q && q.id ? String(q.id) : "";
      if (!id) missingIds.push(i);
      else if (seenId[id]) duplicateIds.push({ index: i, id: id });
      else seenId[id] = true;
      if (q && isPosInt(q.questionNumber)) {
        var n = Number(q.questionNumber);
        if (seenNo[n]) duplicateNumbers.push({ index: i, number: n });
        else seenNo[n] = true;
      }
    });
    return {
      ok: !duplicateIds.length && !duplicateNumbers.length && !missingIds.length,
      duplicateIds: duplicateIds,
      duplicateNumbers: duplicateNumbers,
      missingIds: missingIds
    };
  }
  /* 直せるものは直す。直したことは呼び出し側へ必ず返す（黙って直さない）。
     先に出てきたほうを正とし、あとから重なったほうを振り直す。 */
  function repairIdentity(list) {
    var qs = (list || []).map(clone);
    stampNumbers(qs);
    var seenId = Object.create(null), seenNo = Object.create(null);
    var fixedIds = 0, fixedNumbers = 0;
    qs.forEach(function (q) {
      if (!q) return;
      if (!q.id || seenId[q.id]) { q.id = S.newId("q"); fixedIds++; }
      seenId[q.id] = true;
    });
    var next = maxNumber(qs) + 1;
    qs.forEach(function (q) {
      if (!q) return;
      var n = Number(q.questionNumber);
      if (!isPosInt(n) || seenNo[n]) { q.questionNumber = next++; fixedNumbers++; n = q.questionNumber; }
      seenNo[n] = true;
    });
    return { questions: qs, fixedIds: fixedIds, fixedNumbers: fixedNumbers };
  }

  /* ══════════════════════════════════════════════════════════════════
     差分（現在の問題 ⇄ AI の提案）
     ・「追加」「削除候補」「変更」に分ける。
     ・変更は項目単位（問題文・選択肢・正解・解説・難易度・出典・配点）まで割る。
     ══════════════════════════════════════════════════════════════════ */
  var FIELD_LABELS = {
    prompt: "問題文", choices: "選択肢", correctAnswer: "正解",
    explanation: "解説", difficulty: "難易度", topic: "単元",
    sourceReferences: "出典", points: "配点", type: "問題形式",
    acceptedAnswers: "別解", tags: "タグ"
  };
  var DIFF_FIELDS = Object.keys(FIELD_LABELS);
  /* AI の提案では書き換えさせない項目。ここに無い項目でも
     DIFF_FIELDS に入っていなければ applyDiff は触らない。 */
  var PROTECTED_FIELDS = { id: 1, number: 1, questionNumber: 1, sourceId: 1, createdAt: 1, createdBy: 1, schemaVersion: 1 };
  /* 「AI が空で返した」ことを「消してほしい」と読まない項目。
     修正を頼むと、AI は指示されたところだけを書いて残りを省いて返す。
     そのまま差分にすると、頼んでもいないのに出典や解説が消える
     （実測：1 問の書き換えを頼んだだけで出典 1 件が失われた）。
     消したいときは編集画面から手で消せる。取り返せない側へ倒す。 */
  var KEEP_IF_EMPTY = { sourceReferences: 1, explanation: 1, acceptedAnswers: 1, tags: 1 };
  function isEmptyValue(v) {
    if (v === undefined || v === null) return true;
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === "string") return v.trim() === "";
    return false;
  }

  function diffQuestions(currentList, proposedList, opts) {
    opts = opts || {};
    var cur = currentList || [], prop = proposedList || [];
    var byId = Object.create(null);
    cur.forEach(function (q) { byId[q.id] = q; });

    /* 対応づけ：同じ id → 同じ問題文 → 位置 の順に探す */
    var usedCurrent = Object.create(null);
    var changes = [];

    prop.forEach(function (p, i) {
      var match = byId[p.id];
      /* AI は自分が受け取った id（＝こちらの内部 ID）をそのまま返してくる。
         draftToQuestions で内部 ID は新しく振り直しているので、
         「どの問題への提案か」は sourceId で突き合わせる。 */
      if (!match && p.sourceId) match = byId[p.sourceId];
      if (!match) match = findByPrompt(cur, p.prompt, usedCurrent);
      if (!match && opts.matchByIndex && cur[i] && !usedCurrent[cur[i].id]) match = cur[i];

      if (!match) {
        changes.push({ kind: "add", questionId: p.id, proposed: p, fields: [] });
        return;
      }
      usedCurrent[match.id] = true;
      var fields = [];
      DIFF_FIELDS.forEach(function (f) {
        if (p[f] === undefined) return;
        /* 中身のあるものを、空の提案で消させない（§KEEP_IF_EMPTY）。 */
        if (KEEP_IF_EMPTY[f] && isEmptyValue(p[f]) && !isEmptyValue(match[f])) return;
        var a = normalizeForDiff(match[f], f), b = normalizeForDiff(p[f], f);
        if (JSON.stringify(a) === JSON.stringify(b)) return;
        fields.push({
          field: f, label: FIELD_LABELS[f],
          from: clone(match[f]), to: clone(p[f]),
          summary: summarizeFieldChange(f, match[f], p[f])
        });
      });
      if (fields.length) changes.push({ kind: "modify", questionId: match.id, current: match, proposed: p, fields: fields });
    });

    /* AI の提案に出てこなかった既存の問題＝削除候補。自動では消さない。 */
    cur.forEach(function (q) {
      if (!usedCurrent[q.id]) changes.push({ kind: "removeCandidate", questionId: q.id, current: q, fields: [] });
    });

    return {
      changes: changes,
      added: changes.filter(function (c) { return c.kind === "add"; }).length,
      modified: changes.filter(function (c) { return c.kind === "modify"; }).length,
      removeCandidates: changes.filter(function (c) { return c.kind === "removeCandidate"; }).length
    };
  }

  function findByPrompt(list, prompt, used) {
    var key = normText(prompt);
    if (!key) return null;
    for (var i = 0; i < list.length; i++) {
      if (used[list[i].id]) continue;
      if (normText(list[i].prompt) === key) return list[i];
    }
    return null;
  }
  function normText(s) { return String(s == null ? "" : s).replace(/\s+/g, "").slice(0, 60); }

  /* 比較用の正規化。表示の揺れで差分が出ないようにする。 */
  function normalizeForDiff(v, field) {
    if (v === undefined || v === null) return null;
    if (field === "choices") {
      return (Array.isArray(v) ? v : []).map(function (c) {
        return { text: String(c.text || "").trim(), isCorrect: c.isCorrect === true, explanation: String(c.explanation || "").trim() };
      });
    }
    if (field === "sourceReferences") {
      return (Array.isArray(v) ? v : []).map(function (r) {
        return { sourceName: String(r.sourceName || ""), page: r.page == null ? null : r.page };
      });
    }
    if (Array.isArray(v)) return v.map(function (x) { return String(x).trim(); }).filter(Boolean).sort();
    if (typeof v === "string") return v.trim();
    return v;
  }

  function summarizeFieldChange(field, from, to) {
    if (field === "choices") {
      var a = Array.isArray(from) ? from : [], b = Array.isArray(to) ? to : [];
      var bits = [];
      if (a.length !== b.length) bits.push(a.length + " 個 → " + b.length + " 個");
      var ai = a.findIndex(function (c) { return c.isCorrect; });
      var bi = b.findIndex(function (c) { return c.isCorrect; });
      if (ai !== bi) bits.push("正解が変わります");
      var textChanged = 0;
      for (var i = 0; i < Math.min(a.length, b.length); i++)
        if (String(a[i].text || "").trim() !== String(b[i].text || "").trim()) textChanged++;
      if (textChanged) bits.push(textChanged + " 個の文言が変わります");
      var expAdded = b.filter(function (c) { return String(c.explanation || "").trim(); }).length
                   - a.filter(function (c) { return String(c.explanation || "").trim(); }).length;
      if (expAdded > 0) bits.push("選択肢の解説が " + expAdded + " 個増えます");
      return bits.length ? bits.join(" / ") : "内容が変わります";
    }
    if (field === "sourceReferences") {
      var an = (from || []).length, bn = (to || []).length;
      return an + " 件 → " + bn + " 件";
    }
    if (typeof from === "string" || typeof to === "string") {
      var f = String(from || ""), t = String(to || "");
      if (!f) return "追加されます（" + t.length + " 文字）";
      if (!t) return "削除されます";
      return f.length + " 文字 → " + t.length + " 文字";
    }
    return String(from) + " → " + String(to);
  }

  /* ══════════════════════════════════════════════════════════════════
     適用（Apply）
     ・selection で「どの変更を採るか」を指定する。
       { all:true } / { questionIds:[...] } / { fields:{ "<qid>": ["prompt","choices"] } }
     ・削除候補は、明示的に指定されたときだけ削除する。
     ══════════════════════════════════════════════════════════════════ */
  function applyDiff(currentList, diff, selection) {
    selection = selection || {};
    var out = (currentList || []).map(clone);
    /* 既存の問題の番号をここで確定させる。見え方は変わらないが、
       以後は追加も削除も並べ替えも、既存の番号を動かさなくなる。 */
    stampNumbers(out);
    var byId = Object.create(null);
    out.forEach(function (q, i) { byId[q.id] = i; });
    /* 追加分の採番はここが唯一の決定元。AI が返した番号も id も使わない。 */
    var usedIds = Object.create(null);
    out.forEach(function (q) { if (q && q.id) usedIds[q.id] = true; });
    var nextNumber = maxNumber(out) + 1;
    var applied = [], skipped = [], conversions = [];

    function wants(change) {
      if (selection.all === true) return change.kind !== "removeCandidate" || selection.includeRemovals === true;
      if (Array.isArray(selection.questionIds) && selection.questionIds.indexOf(change.questionId) >= 0) {
        return change.kind !== "removeCandidate" || selection.includeRemovals === true;
      }
      if (selection.fields && selection.fields[change.questionId]) return true;
      return false;
    }
    function wantedFields(change) {
      if (selection.fields && Array.isArray(selection.fields[change.questionId]))
        return selection.fields[change.questionId];
      return null;   /* null＝その問題の変更を全部 */
    }

    (diff.changes || []).forEach(function (c) {
      if (!wants(c)) { skipped.push(c.questionId); return; }
      if (c.kind === "add") {
        var q = clone(c.proposed);
        if (!q.id || usedIds[q.id]) q.id = S.newId("q");
        usedIds[q.id] = true;
        q.questionNumber = nextNumber++;         /* 既存の最大番号の次から。空きは埋めない。 */
        /* 形式を変えた記録は保存しない。落とす前に戻り値へ移す（黙って消さない・§6）。 */
        var conv = conversionOf(q, out.length);
        if (conv) conversions.push(conv);
        stripTemp(q);                            /* AI 側の一時 id と `__` 付きの欄は保存しない */
        out.push(q);
        applied.push({ kind: "add", questionId: q.id, number: q.questionNumber });
        return;
      }
      if (c.kind === "removeCandidate") {
        var ri = byId[c.questionId];
        if (ri !== undefined) { out[ri] = null; applied.push({ kind: "remove", questionId: c.questionId }); }
        return;
      }
      /* modify */
      var idx = byId[c.questionId];
      if (idx === undefined) { skipped.push(c.questionId); return; }
      var want = wantedFields(c);
      var touched = [];
      c.fields.forEach(function (f) {
        if (want && want.indexOf(f.field) < 0) return;
        /* 内部 ID と問題番号は AI の提案では絶対に動かさない。
           DIFF_FIELDS にも入れていないが、ここでも塞いでおく。 */
        if (PROTECTED_FIELDS[f.field]) return;
        out[idx][f.field] = clone(f.to);
        touched.push(f.field);
      });
      if (touched.length) {
        out[idx].updatedAt = S.nowIso();
        /* AI が触った問題は、確認済みフラグを引き継がない */
        if (c.proposed && c.proposed.requiresReview === true) out[idx].requiresReview = true;
        applied.push({ kind: "modify", questionId: c.questionId, fields: touched });
      }
    });

    var questions = out.filter(Boolean);
    return {
      questions: questions,
      applied: applied,
      skipped: skipped,
      appliedCount: applied.length,
      partial: skipped.length > 0,
      /* 保存データからは落とした「形式を変えた記録」。人へ伝えるのはこちら（§6）。 */
      conversions: conversions,
      /* 適用した結果に重複が残っていないか。呼び出し側はこれを見て止められる。 */
      identity: checkIdentity(questions)
    };
  }

  /* ══════════════════════════════════════════════════════════════════
     AI 修正案の検査（差分を見せる前・適用する前の両方で通す）

     AI は頼んでいない問題まで書き換えて返してくる。そのまま差分にすると
     利用者が気づかないまま別の問題が変わる。ここで落とす。
     落としたものは黙って消さず、理由を付けて返す。
     ══════════════════════════════════════════════════════════════════ */
  var REVISION_REASONS = {
    outOfScope: "指示の対象ではない問題への変更です",
    unknownQuestion: "元のプリセットに無い問題です",
    emptyPrompt: "問題文が空です",
    emptyAnswer: "正解が空です",
    answerNotInChoices: "正解が選択肢の中にありません",
    choiceCount: "この形式に合わない選択肢の数です",
    multipleCorrect: "単一選択なのに正解が複数あります",
    tooManyFields: "元のデータに無い項目が多すぎます"
  };
  /* opts.allowedIds … 修正してよい問題の内部 ID。省略＝プリセット全体。
     戻り値の accepted だけを diffQuestions へ渡す。 */
  function screenRevision(currentList, proposedList, opts) {
    opts = opts || {};
    var cur = currentList || [];
    var byId = Object.create(null);
    cur.forEach(function (q) { byId[q.id] = q; });
    var scope = null;
    if (Array.isArray(opts.allowedIds) && opts.allowedIds.length) {
      scope = Object.create(null);
      opts.allowedIds.forEach(function (id) { scope[id] = true; });
    }
    var accepted = [], rejected = [];
    function drop(p, reason) {
      rejected.push({ questionId: p && (p.sourceId || p.id) || "", reason: reason, message: REVISION_REASONS[reason] || reason });
    }
    (proposedList || []).forEach(function (p) {
      if (!p) return;
      /* どの既存問題への提案か。sourceId → id の順で探す。 */
      var target = byId[p.sourceId] || byId[p.id] || null;
      if (!target && opts.requireKnownTarget) { drop(p, "unknownQuestion"); return; }
      if (scope && target && !scope[target.id]) { drop(p, "outOfScope"); return; }
      /* 対象が特定できない提案は「追加」になる。範囲を絞っているときは受けない。 */
      if (scope && !target) { drop(p, "outOfScope"); return; }

      if (!String(p.prompt || "").trim()) { drop(p, "emptyPrompt"); return; }

      var choices = Array.isArray(p.choices) ? p.choices.filter(function (c) { return String(c && c.text || "").trim(); }) : [];
      if (S.hasChoices(p.type) && p.type !== "matching" && p.type !== "ordering") {
        if (choices.length < 2) { drop(p, "choiceCount"); return; }
        var correct = choices.filter(function (c) { return c.isCorrect === true; });
        if (!correct.length) { drop(p, "answerNotInChoices"); return; }
        if (p.type === "multiple_choice_single" && correct.length > 1) { drop(p, "multipleCorrect"); return; }
      } else if (S.isDeterministic(p.type)) {
        var ans = String(p.correctAnswer || "").trim()
          || (Array.isArray(p.acceptedAnswers) ? String(p.acceptedAnswers[0] || "").trim() : "");
        if (!ans) { drop(p, "emptyAnswer"); return; }
      }
      accepted.push(p);
    });
    return { accepted: accepted, rejected: rejected, scoped: !!scope };
  }

  /* ══════════════════════════════════════════════════════════════════
     Draft の状態（§7 必須の 8 状態）
     ══════════════════════════════════════════════════════════════════ */
  function newDraftState() {
    return {
      state: "draft", startedAt: null, finishedAt: null,
      diff: null, error: null, appliedCount: 0, totalChanges: 0
    };
  }
  function setDraftState(d, next, extra) {
    if (S.DRAFT_STATES.indexOf(next) < 0) throw new Error("UNKNOWN_DRAFT_STATE:" + next);
    d.state = next;
    if (extra) for (var k in extra) d[k] = extra[k];
    if (next === "generating") d.startedAt = S.nowIso();
    if (["applied", "partially_applied", "saved", "failed"].indexOf(next) >= 0) d.finishedAt = S.nowIso();
    return d;
  }

  /* ══════════════════════════════════════════════════════════════════
     生成中の追加指示（フォローアップ）

     送信済みの 1 本の生成要求へ、途中からメッセージを差し込むことはできない。
     途中で反映できたように見せかけない。実際にやるのは次の順番だけ：

       受け付ける → いまの生成の区切りを待つ → 反映する修正パスを走らせる
       → 番号を振り直す → 構造と重複を検査する → 完了にする

     ・追加指示は必ず実行中の runId（＝そのときの生成）へ紐付ける。
       別タブの別プリセットの生成へ混ざらないようにするため。
     ・同じ操作が二重に届いても、同じ clientKey なら 1 件しか積まない。
     ══════════════════════════════════════════════════════════════════ */
  var FOLLOWUP_MAX_CHARS = 500;
  var FOLLOWUP_MAX_QUEUED = 20;
  var FOLLOWUP_STATES = ["queued", "applying", "applied", "failed", "cancelled"];

  function newFollowupQueue() { return { runId: "", items: [] }; }

  /* 受け付ける。受け付けなかった理由は必ず返す（黙って捨てない）。 */
  function pushFollowup(queue, text, opts) {
    opts = opts || {};
    var t = String(text == null ? "" : text).trim();
    if (!t) return { ok: false, error: "EMPTY", message: "追加の指示を入力してください。" };
    if (t.length > FOLLOWUP_MAX_CHARS) {
      return { ok: false, error: "TOO_LONG",
               message: "追加の指示は " + FOLLOWUP_MAX_CHARS + " 文字までです（いま " + t.length + " 文字）。" };
    }
    var runId = String(opts.runId || queue.runId || "");
    if (!runId) return { ok: false, error: "NO_RUN", message: "いま動いている生成がありません。" };
    if (queue.runId && queue.runId !== runId) {
      return { ok: false, error: "OTHER_RUN", message: "別の生成に対する指示のため受け付けませんでした。" };
    }
    queue.runId = runId;
    /* 二重送信（連打・再送）。同じ内容がまだ反映前なら積み増さない。 */
    var key = String(opts.clientKey || "") || ("t:" + t.replace(/\s+/g, ""));
    var dup = queue.items.filter(function (it) {
      return it.clientKey === key && (it.status === "queued" || it.status === "applying");
    })[0];
    if (dup) return { ok: false, error: "DUPLICATE", message: "同じ指示をすでに受け付けています。", item: dup };
    var pending = queue.items.filter(function (it) { return it.status === "queued"; }).length;
    if (pending >= FOLLOWUP_MAX_QUEUED) {
      return { ok: false, error: "TOO_MANY", message: "反映待ちの指示が多すぎます。少し待ってからお送りください。" };
    }
    var item = {
      id: S.newId("fu"), runId: runId, clientKey: key, text: t,
      status: "queued", at: S.nowIso(), seq: queue.items.length + 1, error: null
    };
    queue.items.push(item);
    return { ok: true, item: item };
  }

  function pendingFollowups(queue, runId) {
    var rid = runId || (queue && queue.runId) || "";
    return ((queue && queue.items) || []).filter(function (it) {
      return it.status === "queued" && (!rid || it.runId === rid);
    });
  }
  function setFollowupState(queue, ids, state, error) {
    if (FOLLOWUP_STATES.indexOf(state) < 0) throw new Error("UNKNOWN_FOLLOWUP_STATE:" + state);
    var want = Object.create(null);
    (ids || []).forEach(function (id) { want[id] = true; });
    ((queue && queue.items) || []).forEach(function (it) {
      if (!want[it.id]) return;
      it.status = state;
      it.error = state === "failed" ? String(error || "反映できませんでした") : null;
      it.updatedAt = S.nowIso();
    });
    return queue;
  }
  /* 生成を止めたとき。まだ反映していないものは取り消しにする。
     取り消したものを次の生成で拾い直さないため、状態はここで確定させる。 */
  function cancelFollowups(queue) {
    var ids = ((queue && queue.items) || [])
      .filter(function (it) { return it.status === "queued" || it.status === "applying"; })
      .map(function (it) { return it.id; });
    if (ids.length) setFollowupState(queue, ids, "cancelled");
    return ids;
  }
  /* AI へ渡す形。送られた順に並べる。後の指示が前を打ち消す場合は
     「後のほうを優先する」とだけ伝える（勝手に消さない）。 */
  function followupInstruction(items) {
    var list = (items || []).slice().sort(function (a, b) { return (a.seq || 0) - (b.seq || 0); });
    if (!list.length) return "";
    var lines = ["【あとから届いた追加の指示】", "送られた順に並んでいます。すべて反映してください。"];
    if (list.length > 1) lines.push("前の指示と食い違うところは、**あとの指示**を優先してください。");
    lines.push("");
    list.forEach(function (it, i) { lines.push((i + 1) + ". " + it.text); });
    return lines.join("\n");
  }

  /* ══════════════════════════════════════════════════════════════════
     指示文から「何問作るか」を読む

     日本語入力では「２０問」と全角で打つ人のほうが多い。半角しか見ていなかったため
     指定を取りこぼし、分割生成が働かないまま 1 回で全部作らせて出力上限に当たっていた。
     ここに置いてテストで固定する。
     ══════════════════════════════════════════════════════════════════ */
  function toHalfWidth(text) {
    return String(text == null ? "" : text)
      .replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
  }
  function parseCount(text) {
    var m = toHalfWidth(text).match(/(\d{1,3})\s*(?:問|題)/);
    if (!m) return 0;
    var n = parseInt(m[1], 10);
    return n >= 1 && n <= 200 ? n : 0;
  }
  /* 「20問で」を残すと分割の各回でまた 20 問作ろうとするので外す */
  function stripCount(text) {
    return toHalfWidth(text).replace(/(\d{1,3})\s*(?:問|題)(?:で|を|は|、|。)?/g, "").trim();
  }

  /* ══════════════════════════════════════════════════════════════════
     出題する論点のリストを取り出す

     モデルは頼んだリスト以外のもの（表・見出し・選択肢の断片・前置き）も
     混ぜて返してくる。実際に「| 難易度 | 易 0 / 標準 20 |」や
     「A. 1948年の憲章で…」を論点として拾ってしまった。
     箇条書きの印が付いた行だけを取り、明らかに論点でないものは捨てる。
     ══════════════════════════════════════════════════════════════════ */
  var BULLET = /^\s*(?:[-*・‐–—]|\d{1,2}\s*[.)．）]|[（(]\d{1,2}[）)])\s+/;
  var CHOICE_HEAD = /^\s*(?:[A-Da-dア-エ][.)．）]|[①-⑳])/;
  function parseTopics(text) {
    var out = [], seen = Object.create(null);
    String(text || "").split(/\r?\n/).forEach(function (raw) {
      var line = String(raw);
      if (!BULLET.test(line)) return;                 /* 箇条書きの印が無い行は論点ではない */
      var t = line.replace(BULLET, "").trim();
      if (!t) return;
      if (t.indexOf("|") >= 0) return;                /* 表の行 */
      if (/^[#>【\[]/.test(t)) return;                 /* 見出し・引用 */
      if (CHOICE_HEAD.test(t)) return;                /* 選択肢の断片 */
      if (/^(問\s*\d|正解|解説|出典|難易度|合計|以上|なお)/.test(t)) return;
      t = t.replace(/[。．]\s*$/, "").trim();
      if (t.length < 6 || t.length > 60) return;      /* 短すぎ・長すぎは論点として使えない */
      var key = t.replace(/\s+/g, "").toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      out.push(t);
    });
    return out;
  }

  VQ2.draft = {
    TYPE_MAP: TYPE_MAP,
    parseTopics: parseTopics,
    toHalfWidth: toHalfWidth,
    parseCount: parseCount,
    stripCount: stripCount,
    FIELD_LABELS: FIELD_LABELS,
    DIFF_FIELDS: DIFF_FIELDS,
    draftToQuestions: draftToQuestions,
    collectConversions: collectConversions,
    diffQuestions: diffQuestions,
    applyDiff: applyDiff,
    newDraftState: newDraftState,
    setDraftState: setDraftState,
    estimateSeconds: estimateSeconds,

    /* 問題番号と内部 ID（唯一の決定元） */
    numberOf: numberOf,
    maxNumber: maxNumber,
    stampNumbers: stampNumbers,
    assignAppended: assignAppended,
    checkIdentity: checkIdentity,
    repairIdentity: repairIdentity,
    PROTECTED_FIELDS: PROTECTED_FIELDS,
    KEEP_IF_EMPTY: KEEP_IF_EMPTY,

    /* AI 修正案の検査 */
    screenRevision: screenRevision,
    REVISION_REASONS: REVISION_REASONS,

    /* 生成中の追加指示 */
    FOLLOWUP_MAX_CHARS: FOLLOWUP_MAX_CHARS,
    FOLLOWUP_MAX_QUEUED: FOLLOWUP_MAX_QUEUED,
    FOLLOWUP_STATES: FOLLOWUP_STATES,
    newFollowupQueue: newFollowupQueue,
    pushFollowup: pushFollowup,
    pendingFollowups: pendingFollowups,
    setFollowupState: setFollowupState,
    cancelFollowups: cancelFollowups,
    followupInstruction: followupInstruction
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
