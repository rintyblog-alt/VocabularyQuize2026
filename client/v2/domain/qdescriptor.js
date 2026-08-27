/* ══════════════════════════════════════════════════════════════════════
   AI へ渡す「形式の説明」（V3 §15）

   形式 ID だけを渡しても、AI は形式を使い分けられない。
   「どんな学習に向くか」「どんなときに使い、どんなときに避けるか」
   「何が要るか」「どう返すか」「どう採点するか」まで渡して初めて、
   4 択以外が安定して返ってくる。

   ただし **125 形式ぶんを毎回渡さない**。
   ・説明は **エンジン（20 種）ごと**に持つ。形式が増えても説明は増えない。
   ・形式ごとの違いは、必要なものだけ上書きする。
   ・実際に渡すのは blueprint.js が絞った候補だけ（§16）。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var Q = VQ2.qtypes;
  if (!Q) throw new Error("VQ2.qtypes must be loaded before qdescriptor.js");

  function arr(v) { return Array.isArray(v) ? v : []; }
  function str(v) { return v === undefined || v === null ? "" : String(v); }

  /* ══════════════════════════════════════════════════════════════════
     エンジンごとの説明
     ・useWhen / avoidWhen は、教材の中身を見て AI が判断できる言い方にする。
     ・scoringMethod は「どう採点されるか」。ここが分かると、
       AI は採点できない形の正解を書かなくなる。
     ══════════════════════════════════════════════════════════════════ */
  var ENGINE_DESC = {
    single_choice: {
      educationalUse: "覚えたことを見分けられるかを確かめる",
      useWhen: ["似ているものを区別させたい", "誤りやすい理解を狙って外させたい", "短時間で数をこなしたい"],
      avoidWhen: ["答えを自分で思い出させたい", "書く力を見たい", "正解が 1 つに決まらない"],
      requiredInputs: ["問題文", "選択肢 2〜5 個", "どれが正解か"],
      outputSchemaSummary: "choices[] と correctAnswer（choices の id）",
      minItems: 2, maxItems: 5,
      scoringMethod: "選んだものが正解と同じなら満点。部分点は無い。"
    },
    multi_choice: {
      educationalUse: "当てはまるものをすべて見分けられるかを確かめる",
      useWhen: ["正解が複数ある", "条件に合うものを全部あげさせたい"],
      avoidWhen: ["正解が 1 つしかない", "選択肢の線引きがあいまい"],
      requiredInputs: ["問題文", "選択肢 4 個以上", "正解の id を複数"],
      outputSchemaSummary: "choices[] と correctAnswers[]（2 個以上）",
      minItems: 4, maxItems: 8,
      scoringMethod: "合っている数から外した数を引いて部分点を出す。"
    },
    true_false: {
      educationalUse: "文の正しさを判断できるかを確かめる",
      useWhen: ["言い切りの文が資料にある", "よくある誤解をそのまま文にできる"],
      avoidWhen: ["条件によって正しさが変わる", "当てずっぽうで当たっては困る"],
      requiredInputs: ["判断させる文", "正しいか誤りか"],
      outputSchemaSummary: "choices は「正しい」「誤り」の 2 つ、correctAnswer はその id",
      minItems: 2, maxItems: 2,
      scoringMethod: "合っていれば満点。部分点は無い。"
    },
    text_input: {
      educationalUse: "自分で思い出して書けるかを確かめる",
      useWhen: ["用語・人名・語句を覚えさせたい", "選択肢を見せるとすぐ分かってしまう"],
      avoidWhen: ["答えの書き方が何通りもある", "長い文で答えることになる"],
      requiredInputs: ["問題文", "正解の語", "認める別解"],
      outputSchemaSummary: "correctAnswer（文字列）と acceptedAnswers[]",
      minItems: 1, maxItems: 1,
      scoringMethod: "正解か別解と一致すれば満点。前後の空白と全角半角はそろえて比べる。"
    },
    numeric_input: {
      educationalUse: "計算して数値を出せるかを確かめる",
      useWhen: ["答えが数で決まる", "単位まで含めて答えさせたい"],
      avoidWhen: ["求め方そのものを見たい（途中式は別形式）", "答えが数に決まらない"],
      requiredInputs: ["問題文", "正解の数値", "許す誤差", "単位"],
      outputSchemaSummary: "correctAnswer（数値の文字列）・tolerance・unit",
      minItems: 1, maxItems: 1,
      scoringMethod: "許した誤差の中なら正解。単位は指定があれば合わせて見る。"
    },
    fill_blank: {
      educationalUse: "文の流れの中で語を思い出せるかを確かめる",
      useWhen: ["定義や説明の文が資料にある", "前後関係から答えを絞らせたい"],
      avoidWhen: ["空欄の前後だけでは何を書くか決まらない", "文が短すぎて手がかりが無い"],
      requiredInputs: ["空欄を【　】で示した文", "空欄ごとの正解"],
      outputSchemaSummary: "question に【　】を入れ、blanks[] に空欄ごとの answer",
      minItems: 1, maxItems: 8,
      scoringMethod: "空欄ごとに正誤を見て、合った数だけ部分点を出す。"
    },
    reorder: {
      educationalUse: "順序・手順・時系列を理解しているかを確かめる",
      useWhen: ["年代や出来事の前後がある", "手順や段取りが資料にある", "語順を身につけさせたい"],
      avoidWhen: ["正しい順が 1 通りに決まらない", "並べる項目が 2 つしかない"],
      requiredInputs: ["並べ替える項目（正しい順に並べて渡す）"],
      outputSchemaSummary: "items[] を **正しい順に** 並べて返す（画面側でばらす）",
      minItems: 3, maxItems: 8,
      scoringMethod: "正しい位置にある数で部分点を出す。全部合っていれば満点。"
    },
    matching: {
      educationalUse: "対応関係を覚えているかを確かめる",
      useWhen: ["用語と意味・人物と業績・国と首都のような対がある", "まとめて覚えさせたい"],
      avoidWhen: ["対応が 1 対 1 に決まらない", "対が 2 組しかない"],
      requiredInputs: ["左右の対（2 組以上）"],
      outputSchemaSummary: "pairs[] に {left, right}。まぎらわしい余りは dummies[]",
      minItems: 3, maxItems: 8,
      scoringMethod: "合っている対の数で部分点を出す。"
    },
    classification: {
      educationalUse: "共通点と違いで分けられるかを確かめる",
      useWhen: ["資料に分類の観点がある", "似たものを仲間分けさせたい"],
      avoidWhen: ["どちらにも入る項目がある", "分ける基準が資料に書かれていない"],
      requiredInputs: ["分け先のグループ 2 つ以上", "項目とその分け先"],
      outputSchemaSummary: "groups[] と items[]（各 item に group）",
      minItems: 4, maxItems: 12,
      scoringMethod: "正しく分けられた項目の数で部分点を出す。"
    },
    table_fill: {
      educationalUse: "表として整理された知識を思い出せるかを確かめる",
      useWhen: ["資料に表がある", "複数の項目を比べさせたい"],
      avoidWhen: ["表にする内容が資料に無い", "ますの数が多すぎて解くのに時間がかかる"],
      requiredInputs: ["列見出し", "行", "埋めるますの正解"],
      outputSchemaSummary: "table.columns[] と table.rows[]（埋めるますに answer）",
      minItems: 2, maxItems: 12,
      scoringMethod: "埋めたますごとに正誤を見て部分点を出す。"
    },
    chart_read: {
      educationalUse: "図やグラフから値と傾向を読み取れるかを確かめる",
      useWhen: ["資料に数値の並びがある", "変化や比較を読ませたい"],
      avoidWhen: ["数値が資料に無い", "図の見た目そのものが必要（画像は作れない）"],
      requiredInputs: ["グラフの種類・項目・値", "問題文", "正解"],
      outputSchemaSummary: "chart{kind, categories[], series[]} と correctAnswer",
      minItems: 2, maxItems: 30,
      scoringMethod: "読み取った値が正解と合えば正解。許した誤差の中なら正解にする。",
      note: "画像は作らない。数値をそのまま渡すと、画面側でグラフを描く。"
    },
    error_correction: {
      educationalUse: "誤りに気づいて直せるかを確かめる",
      useWhen: ["文法・用語の誤りを見つけさせたい", "よくある書き間違いがある"],
      avoidWhen: ["直し方が何通りもある", "どこが誤りか特定できない"],
      requiredInputs: ["誤りを含む文", "誤っている語と正しい形"],
      outputSchemaSummary: "question に誤りを含む文、errors[] に {wrong, correct}",
      minItems: 1, maxItems: 5,
      scoringMethod: "直した箇所ごとに正誤を見て部分点を出す。"
    },
    free_text: {
      educationalUse: "自分の言葉で説明できるかを確かめる",
      useWhen: ["理由・仕組み・違いを説明させたい", "要点をまとめさせたい"],
      avoidWhen: ["答えが 1 語で決まる", "採点の観点を決められない"],
      requiredInputs: ["問題文", "模範解答", "採点の観点と配点（ルーブリック）"],
      outputSchemaSummary: "modelAnswer と rubric[]（{description, points}）",
      minItems: 1, maxItems: 5,
      scoringMethod: "観点ごとに AI が採点する。**採点の観点が無い問題は作らない**（採点できなくなる）。"
    },
    flashcard: {
      educationalUse: "覚える・思い出すを繰り返す",
      useWhen: ["語彙や用語をまとめて覚えさせたい", "短時間で反復させたい"],
      avoidWhen: ["理解を確かめたい", "正誤をきちんと採点したい"],
      requiredInputs: ["表（きっかけ）", "裏（答え）"],
      outputSchemaSummary: "front と back",
      minItems: 1, maxItems: 1,
      scoringMethod: "本人が「覚えた／まだ」を選ぶ。点はつかない。"
    },
    /* 音声は「原稿を書く」だけでよい。読み上げは解くときにこちらで行う。
       **音声ファイルの URL は書かせない**（存在しない音を指す問題になる）。 */
    dictation: {
      educationalUse: "聞こえた通りに書き取れるかを確かめる",
      useWhen: ["読み上げて自然な短い文が作れる", "つづり・聞き取りを確かめたい"],
      avoidWhen: ["読み上げにくい記号や数式が多い", "正解の書き方が何通りもある"],
      requiredInputs: ["書き取る文（これがそのまま読み上げられる）"],
      outputSchemaSummary: "correctAnswer（読み上げる文＝正しい文）",
      minItems: 1, maxItems: 1,
      scoringMethod: "語ごとに合っている数で部分点を出す。"
    },
    audio_choice: {
      educationalUse: "聞き取った内容を選べるかを確かめる",
      useWhen: ["会話や説明を聞かせて確かめたい", "読み上げる原稿を書ける"],
      avoidWhen: ["図や表を見ないと答えられない", "原稿が長すぎて一度で覚えられない"],
      requiredInputs: ["script（実際に読み上げる文）", "選択肢", "正解"],
      outputSchemaSummary: "script と choices[] と correctAnswer",
      minItems: 2, maxItems: 5,
      scoringMethod: "選んだものが正解と同じなら満点。"
    },
    image_choice: {
      educationalUse: "図や写真を見分けられるかを確かめる",
      useWhen: ["画像教材がある"],
      avoidWhen: ["画像が無い（**架空の画像 URL を作ってはいけない**）"],
      requiredInputs: ["画像", "選択肢", "正解"],
      outputSchemaSummary: "choices[] と correctAnswer",
      minItems: 2, maxItems: 5,
      sourceMediaRequirements: ["画像"],
      scoringMethod: "選んだものが正解と同じなら満点。"
    },
    image_point: {
      educationalUse: "図の中の位置を指せるかを確かめる",
      useWhen: ["画像教材があり、正解の場所を決められる"],
      avoidWhen: ["画像が無い", "正解の範囲が小さすぎる"],
      requiredInputs: ["画像", "正解の範囲（0〜1 の座標）"],
      outputSchemaSummary: "targetRegions[]（0〜1 に正規化した座標）",
      minItems: 1, maxItems: 6,
      sourceMediaRequirements: ["画像"],
      scoringMethod: "正解の範囲の中を指していれば正解。"
    },
    image_label: {
      educationalUse: "図の各部の名前が分かるかを確かめる",
      useWhen: ["画像教材があり、名前を置く場所を決められる"],
      avoidWhen: ["画像が無い", "置く場所を決められない"],
      requiredInputs: ["画像", "ラベル", "置く場所"],
      outputSchemaSummary: "labels[] と targets[]（0〜1 に正規化した座標）",
      minItems: 2, maxItems: 8,
      sourceMediaRequirements: ["画像"],
      scoringMethod: "正しい場所へ置けたラベルの数で部分点を出す。"
    },
    composite: {
      educationalUse: "1 つの資料から複数のことを問う",
      useWhen: ["長い本文・会話・資料がある", "本番の試験に近づけたい"],
      avoidWhen: ["共通の資料が無い", "小問が 1 つしかできない"],
      requiredInputs: ["共通の資料（本文）", "小問（上のどれかの形）"],
      outputSchemaSummary: "context（共通資料）と children[]（小問）",
      minItems: 2, maxItems: 6,
      scoringMethod: "小問ごとに採点し、合計する。大問そのものには点をつけない。"
    }
  };

  /* 形式ごとの上書き。**違うところだけ**書く。 */
  var TYPE_DESC = {
    choice_incorrect: {
      educationalUse: "誤っているものを見分けられるかを確かめる",
      useWhen: ["正しい説明が複数あり、誤りを 1 つだけ混ぜられる"],
      note: "問題文に「誤っているものを 1 つ選びなさい」と明記すること。"
    },
    choice_best: {
      educationalUse: "どれも間違いではない中から、最も適切なものを選ばせる",
      avoidWhen: ["最適と言い切れる根拠が資料に無い"]
    },
    spelling: {
      educationalUse: "英単語のつづりを正確に書けるかを確かめる",
      useWhen: ["英単語の語彙教材がある"],
      note: "acceptedAnswers に大文字違いを入れない（つづりを見る問題なので）。"
    },
    kanji_input: { educationalUse: "漢字を正しく書けるかを確かめる" },
    reading_input: { educationalUse: "漢字の読みが分かるかを確かめる" },
    numeric: { note: "答えの数値だけを correctAnswer に書く。単位は unit へ分けて書く。" },
    reorder_chronology: {
      educationalUse: "出来事の前後関係を年代で並べられるかを確かめる",
      useWhen: ["資料に年代が書かれている"],
      avoidWhen: ["年代が資料から分からない（推測で並べさせない）"],
      note: "items は **古い順に** 並べて返すこと。"
    },
    reorder_steps: { note: "items は **実行する順に** 並べて返すこと。" },
    reorder_experiment: { note: "items は **手順の順に** 並べて返すこと。" },
    matching_year_event: { useWhen: ["資料に年代と出来事の対がある"] },
    summarize: {
      educationalUse: "本文の要点をまとめられるかを確かめる",
      useWhen: ["まとまった長さの本文がある"],
      avoidWhen: ["本文が短く、要約するほどの中身が無い"]
    },
    explain_reason: {
      educationalUse: "なぜそうなるかを説明できるかを確かめる",
      useWhen: ["因果関係が資料にある"]
    },
    quote_evidence: {
      educationalUse: "本文のどこが根拠かを示せるかを確かめる",
      useWhen: ["本文がある", "資料だけを根拠にする指定がある"],
      note: "根拠になる箇所を本文からそのまま引くこと。"
    },
    composite: { note: "小問には別々の形式を使うこと（全部 4 択にしない）。" }
  };

  /* ══════════════════════════════════════════════════════════════════
     1 形式ぶんの説明を組み立てる
     ══════════════════════════════════════════════════════════════════ */
  function describe(typeId) {
    var d = Q.get(typeId);
    if (!d) return null;
    var base = ENGINE_DESC[d.engine] || {};
    var over = TYPE_DESC[typeId] || {};
    var out = {
      id: d.id,
      displayName: d.name,
      shortName: d.shortName,
      engine: d.engine,
      category: d.category,
      educationalUse: over.educationalUse || base.educationalUse || "",
      useWhen: arr(over.useWhen).length ? arr(over.useWhen) : arr(base.useWhen),
      avoidWhen: arr(over.avoidWhen).length ? arr(over.avoidWhen) : arr(base.avoidWhen),
      requiredInputs: arr(over.requiredInputs).length ? arr(over.requiredInputs) : arr(base.requiredInputs),
      outputSchemaSummary: over.outputSchemaSummary || base.outputSchemaSummary || "",
      minItems: over.minItems !== undefined ? over.minItems : base.minItems,
      maxItems: over.maxItems !== undefined ? over.maxItems : base.maxItems,
      sourceMediaRequirements: arr(over.sourceMediaRequirements).length
        ? arr(over.sourceMediaRequirements) : arr(base.sourceMediaRequirements),
      scoringMethod: over.scoringMethod || base.scoringMethod || "",
      partialCredit: !!d.supportsPartialCredit,
      aiGraded: d.engine === "free_text",
      note: over.note || base.note || ""
    };
    return out;
  }

  /* 説明がまだ書かれていない形式が無いかを確かめる（テストが使う）。 */
  function missing() {
    return Q.list({}).filter(function (d) { return !d.mode; })
      .filter(function (d) { return !ENGINE_DESC[d.engine]; })
      .map(function (d) { return d.id; });
  }

  /* ══════════════════════════════════════════════════════════════════
     AI へ渡す文にする
     ・**同じエンジンの形式をまとめて 1 ブロック**にする。
       形式ごとに書くと、4 択 5 種類ぶんの同じ説明が並んでトークンを食う。
     ══════════════════════════════════════════════════════════════════ */
  function promptBlock(typeIds, opts) {
    opts = opts || {};
    var list = arr(typeIds).map(describe).filter(Boolean);
    if (!list.length) return "";
    /* エンジンごとにまとめる（並びは渡された順を保つ） */
    var order = [], byEngine = Object.create(null);
    list.forEach(function (x) {
      if (!byEngine[x.engine]) { byEngine[x.engine] = []; order.push(x.engine); }
      byEngine[x.engine].push(x);
    });
    var lines = ["【使ってよい問題形式】"];
    lines.push("次の形式だけを使ってください。ここに無い形式は使わないでください。");
    order.forEach(function (eng) {
      var group = byEngine[eng];
      var head = group[0];
      lines.push("");
      lines.push("■ " + group.map(function (g) { return g.displayName + "（" + g.id + "）"; }).join(" / "));
      if (head.educationalUse) lines.push("　ねらい: " + head.educationalUse);
      if (head.useWhen.length) lines.push("　使う場面: " + head.useWhen.join(" / "));
      if (head.avoidWhen.length) lines.push("　避ける場面: " + head.avoidWhen.join(" / "));
      if (head.outputSchemaSummary) lines.push("　返し方: " + head.outputSchemaSummary);
      if (head.minItems && head.maxItems && head.minItems !== head.maxItems)
        lines.push("　項目数: " + head.minItems + "〜" + head.maxItems);
      if (head.scoringMethod) lines.push("　採点: " + head.scoringMethod);
      if (head.sourceMediaRequirements.length)
        lines.push("　必要な教材: " + head.sourceMediaRequirements.join("・"));
      /* 形式ごとの注意は、その形式の名前を添えて出す */
      group.forEach(function (g) {
        if (g.note) lines.push("　※ " + g.displayName + ": " + g.note);
      });
    });
    return lines.join("\n");
  }

  /* 画面に出す 1 行（形式カードの説明） */
  function shortLine(typeId) {
    var x = describe(typeId);
    if (!x) return "";
    return x.educationalUse || "";
  }

  VQ2.qdescriptor = {
    ENGINE_DESC: ENGINE_DESC, TYPE_DESC: TYPE_DESC,
    describe: describe, promptBlock: promptBlock, shortLine: shortLine, missing: missing
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
