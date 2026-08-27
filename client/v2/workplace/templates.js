/* ══════════════════════════════════════════════════════════════════════
   Vocabu Workplace — テンプレート（§19）

   ・テンプレートの実体は書き換えない。使うときに必ず写しを作る。
   ・content は製品ごとの形そのもの。ここで作った時点で開いて編集できる。
     「見出しだけあって中身が無い」ものは置かない。
   ══════════════════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";
  var VQ2 = root.VQ2 || (root.VQ2 = {});
  var WP = VQ2.workplace || (VQ2.workplace = {});
  var M = WP.model;
  if (!M) throw new Error("workplace/model.js must be loaded before templates.js");

  var LIST = [];
  function uid(p) { return M.uid(p); }

  /* ── Docs のブロックを組み立てる小道具 ────────────────────────── */
  function b(type, text, extra) {
    var o = { id: uid("b"), type: type, text: text || "" };
    if (extra) for (var k in extra) o[k] = extra[k];
    return o;
  }
  function h1(t) { return b("heading1", t); }
  function h2(t) { return b("heading2", t); }
  function h3(t) { return b("heading3", t); }
  function p(t) { return b("paragraph", t || ""); }
  function li(t) { return b("bullet", t); }
  function ol(t) { return b("number", t); }
  function todo(t) { return b("todo", t, { checked: false }); }
  function quote(t) { return b("quote", t); }
  function hr() { return b("divider", ""); }
  function callout(t) { return b("callout", t); }
  function table(rows, cols, head) {
    var cells = [];
    for (var r = 0; r < rows; r++) {
      var row = [];
      for (var c = 0; c < cols; c++) row.push(head && head[r] && head[r][c] !== undefined ? head[r][c] : "");
      cells.push(row);
    }
    return b("table", "", { rows: cells, header: true });
  }
  function docContent(blocks, page) {
    /* ひな形が持っている page は、用紙という考え方が無かった頃の形
       （mode:"flow" / width / 数値の margin）。そのまま重ねると
       **紙にならない**ので、昔のキーは落としてから重ねる。
       ヘッダー・フッター・ページ番号のように、いまも意味のあるものだけ残す。 */
    var base = WP.paper ? WP.paper.defaults() : { mode: "paper" };
    var p = page || {};
    ["header", "footer", "pageNumber", "size", "orient", "margin", "marginPreset"]
      .forEach(function (k) { if (p[k] !== undefined) base[k] = p[k]; });
    return { schemaVersion: 1, content: {
      blocks: blocks,
      page: WP.paper ? WP.paper.normalize(base) : base
    } };
  }

  function doc(id, title, desc, category, blocks, page) {
    LIST.push({ id: id, itemType: "document", title: title, description: desc, category: category,
      appearance: { bannerType: "gradient", bannerValue: pick(id) },
      contentSchemaVersion: 1, content: function () { return docContent(blocks(), page); },
      official: true, featured: false, productionReady: true });
  }
  function pick(seed) {
    var s = 0;
    for (var i = 0; i < seed.length; i++) s += seed.charCodeAt(i);
    return M.GRADIENTS[s % M.GRADIENTS.length].value;
  }

  /* ══ VocabuDocs（§13.8）══════════════════════════════════════════ */
  doc("doc_blank", "空白の文書", "まっさらな状態から書き始めます", "基本", function () {
    return [p("")];
  });
  doc("doc_class_note", "授業ノート", "日付・単元・要点・疑問点の形が入っています", "学校", function () {
    return [h1("授業ノート"), p("科目：　　　　　／　日付：　　年　　月　　日"),
      h2("今日の単元"), p(""),
      h2("要点"), li(""), li(""), li(""),
      h2("わからなかったこと"), todo(""), todo(""),
      h2("次にやること"), todo("")];
  });
  doc("doc_study_plan", "学習計画", "週ごとの目標と進み具合を書きます", "学習", function () {
    return [h1("学習計画"), p("期間：　　月　　日 〜 　　月　　日"),
      h2("目標"), p(""),
      h2("週ごとの予定"),
      table(5, 4, [["週", "教科", "やること", "できたか"], ["1週目", "", "", ""], ["2週目", "", "", ""],
        ["3週目", "", "", ""], ["4週目", "", "", ""]]),
      h2("ふりかえり"), p("")];
  });
  doc("doc_report", "レポート", "序論・本論・結論の構成つき", "学校", function () {
    return [h1("レポート題目"), p("氏名：　　　　　／　提出日：　　年　　月　　日"),
      h2("1. はじめに"), p("この文書で扱う問いと、その背景を書きます。"),
      h2("2. 本論"), h3("2.1 "), p(""), h3("2.2 "), p(""),
      h2("3. おわりに"), p(""),
      h2("参考文献"), ol(""), ol("")];
  });
  doc("doc_research", "調査レポート", "調査方法・結果・考察の形", "調査", function () {
    return [h1("調査レポート"), h2("調査の目的"), p(""),
      h2("方法"), li("対象："), li("期間："), li("手段："),
      h2("結果"), table(4, 3, [["項目", "件数", "割合"], ["", "", ""], ["", "", ""], ["", "", ""]]),
      h2("考察"), p(""), h2("結論"), p("")];
  });
  doc("doc_essay", "小論文", "主張・理由・具体例・結論", "学習", function () {
    return [h1("小論文"), p("テーマ："),
      h2("主張"), p(""), h2("理由"), ol(""), ol(""),
      h2("具体例"), p(""), h2("想定される反論と答え"), p(""), h2("結論"), p("")];
  });
  doc("doc_book", "読書感想文", "本の情報・あらすじ・心に残った場面", "学校", function () {
    return [h1("読書感想文"), p("書名：　　　　　／　著者："),
      h2("あらすじ"), p(""), h2("心に残った場面"), quote(""), p(""),
      h2("考えたこと"), p(""), h2("これからどうするか"), p("")];
  });
  doc("doc_meeting", "会議メモ", "議題・決定事項・宿題", "ビジネス", function () {
    return [h1("会議メモ"), p("日時：　　　　　／　場所：　　　　　／　参加者："),
      h2("議題"), ol(""), ol(""),
      h2("決まったこと"), li(""), h2("持ち帰り"), todo(""), todo("")];
  });
  doc("doc_minutes", "議事録", "発言と決定を時系列で残します", "ビジネス", function () {
    return [h1("議事録"), p("日時：　　年　　月　　日　　:　　〜　　:"),
      table(4, 3, [["時刻", "発言者", "内容"], ["", "", ""], ["", "", ""], ["", "", ""]]),
      h2("決定事項"), li(""), h2("次回"), p("")];
  });
  doc("doc_newsletter", "ニュースレター", "見出しと記事のまとまり", "個人", function () {
    return [h1("ニュースレター"), p("第　号　／　　年　　月"),
      hr(), h2("今月のトピック"), p(""), h2("お知らせ"), li(""), li(""),
      hr(), callout("次号は　　月　　日ごろに出します。")];
  });
  doc("doc_resume", "履歴書", "学歴・活動・資格", "個人", function () {
    return [h1("履歴書"), p("氏名：　　　　　／　生年月日："),
      h2("学歴"), table(4, 2, [["年月", "内容"], ["", ""], ["", ""], ["", ""]]),
      h2("活動・experience"), li(""), h2("資格"), li(""), h2("自己PR"), p("")];
  });
  doc("doc_motivation", "志望理由書", "志望動機・自分の強み・入学後の計画", "学校", function () {
    return [h1("志望理由書"), h2("志望する理由"), p(""),
      h2("これまでに取り組んだこと"), p(""), h2("入学後にやりたいこと"), p(""),
      h2("将来の展望"), p("")];
  });
  doc("doc_project", "プロジェクト計画", "目的・体制・工程・リスク", "ビジネス", function () {
    return [h1("プロジェクト計画"), h2("目的"), p(""), h2("体制"), li(""),
      h2("工程"), table(4, 3, [["工程", "期間", "担当"], ["", "", ""], ["", "", ""], ["", "", ""]]),
      h2("想定されるつまずき"), li(""), h2("完了の条件"), todo("")];
  });
  doc("doc_experiment", "実験レポート", "目的・器具・手順・結果・考察", "学校", function () {
    return [h1("実験レポート"), p("実験日：　　年　　月　　日　／　班："),
      h2("目的"), p(""), h2("使った器具・薬品"), li(""),
      h2("方法"), ol(""), ol(""),
      h2("結果"), table(4, 3, [["回", "測定値", "備考"], ["1", "", ""], ["2", "", ""], ["3", "", ""]]),
      h2("考察"), p(""), h2("誤差の原因"), li("")];
  });
  doc("doc_weekly", "Weekly Review", "1週間のふりかえり", "個人", function () {
    return [h1("今週のふりかえり"), p("　　月　　日 〜 　　月　　日"),
      h2("できたこと"), li(""), h2("できなかったこと"), li(""),
      h2("気づき"), p(""), h2("来週やること"), todo(""), todo(""), todo("")];
  });
  doc("doc_paper", "学校新聞", "見出し・記事・写真の欄", "学校", function () {
    return [h1("学校新聞"), p("　　年　　月号"), hr(),
      h2("トップ記事"), p(""), b("image", "", { src: "", caption: "写真の説明" }),
      h2("特集"), p(""), h2("部活動"), li(""), h2("編集後記"), p("")];
  });
  doc("doc_speech", "プレゼン原稿", "導入・本題・まとめの話す順", "学習", function () {
    return [h1("プレゼン原稿"), p("発表時間：　　分"),
      h2("導入（つかみ）"), p(""), h2("本題 1"), p(""), h2("本題 2"), p(""),
      h2("まとめ"), p(""), callout("スライドと合わせて、1 枚あたり 40〜60 秒を目安にします。")];
  });

  /* ══ VocabuSheets（§14.8）════════════════════════════════════════ */
  function sheetContent(name, cells, opts) {
    var s = M.newSheet(name);
    Object.keys(cells || {}).forEach(function (k) {
      var v = cells[k];
      s.cells[k] = (typeof v === "string" && v.charAt(0) === "=") ? { f: v, v: "" } : { v: v };
    });
    /* 見出し行は太字にしておく（1 行目） */
    Object.keys(s.cells).forEach(function (k) {
      if (/^[A-Z]+1$/.test(k)) s.cells[k].s = { b: true, bg: "#eef2f7" };
    });
    if (opts && opts.colW) s.colW = opts.colW;
    s.freeze = { rows: 1, cols: 0 };
    return { schemaVersion: 1, content: { sheets: [s], charts: (opts && opts.charts) || [], activeSheet: 0 } };
  }
  function sh(id, title, desc, category, cells, opts) {
    LIST.push({ id: id, itemType: "spreadsheet", title: title, description: desc, category: category,
      appearance: { bannerType: "gradient", bannerValue: pick(id) },
      contentSchemaVersion: 1, content: function () { return sheetContent(title, cells(), opts); },
      official: true, productionReady: true });
  }

  sh("sh_blank", "空白のシート", "まっさらな表", "基本", function () { return {}; });
  sh("sh_grades", "成績表", "教科ごとの点数と平均を自動で出します", "学校", function () {
    return { A1: "氏名", B1: "国語", C1: "数学", D1: "英語", E1: "合計", F1: "平均",
      A2: "", B2: "", C2: "", D2: "", E2: "=SUM(B2:D2)", F2: "=ROUND(AVERAGE(B2:D2),1)",
      A3: "", E3: "=SUM(B3:D3)", F3: "=ROUND(AVERAGE(B3:D3),1)",
      A4: "", E4: "=SUM(B4:D4)", F4: "=ROUND(AVERAGE(B4:D4),1)",
      A6: "クラス平均", B6: "=ROUND(AVERAGE(B2:B4),1)", C6: "=ROUND(AVERAGE(C2:C4),1)",
      D6: "=ROUND(AVERAGE(D2:D4),1)" };
  });
  sh("sh_attend", "出席表", "○×で入れると出席率が出ます", "学校", function () {
    return { A1: "氏名", B1: "4/1", C1: "4/2", D1: "4/3", E1: "出席数", F1: "出席率",
      A2: "", E2: '=COUNTIF(B2:D2,"○")', F2: '=TEXT(COUNTIF(B2:D2,"○")/3,"0%")',
      A3: "", E3: '=COUNTIF(B3:D3,"○")', F3: '=TEXT(COUNTIF(B3:D3,"○")/3,"0%")' };
  });
  sh("sh_study_log", "学習記録", "日ごとの科目と時間", "学習", function () {
    return { A1: "日付", B1: "科目", C1: "時間(分)", D1: "内容", E1: "理解度(1-5)",
      A2: "", A3: "", A4: "",
      G1: "合計時間", G2: "=SUM(C2:C100)", H1: "平均理解度", H2: "=ROUND(AVERAGE(E2:E100),1)" };
  });
  sh("sh_time", "勉強時間記録", "週の合計とグラフのもと", "学習", function () {
    return { A1: "曜日", B1: "時間", A2: "月", B2: 0, A3: "火", B3: 0, A4: "水", B4: 0,
      A5: "木", B5: 0, A6: "金", B6: 0, A7: "土", B7: 0, A8: "日", B8: 0,
      A10: "合計", B10: "=SUM(B2:B8)", A11: "平均", B11: "=ROUND(AVERAGE(B2:B8),1)" };
  }, { charts: [{ id: "c1", type: "bar", title: "曜日ごとの勉強時間", range: "A2:B8", sheet: 0 }] });
  sh("sh_kakeibo", "家計簿", "収支と残高", "個人", function () {
    return { A1: "日付", B1: "項目", C1: "収入", D1: "支出", E1: "残高",
      A2: "", E2: "=C2-D2", A3: "", E3: "=E2+C3-D3", A4: "", E4: "=E3+C4-D4",
      G1: "収入計", G2: "=SUM(C2:C100)", H1: "支出計", H2: "=SUM(D2:D100)" };
  });
  sh("sh_schedule", "スケジュール", "予定と場所", "個人", function () {
    return { A1: "日付", B1: "時刻", C1: "予定", D1: "場所", E1: "済",
      A2: "", A3: "", A4: "" };
  });
  sh("sh_task", "タスク管理", "状態と期限で並べ替えられます", "ビジネス", function () {
    return { A1: "タスク", B1: "担当", C1: "期限", D1: "状態", E1: "優先度",
      A2: "", D2: "未着手", A3: "", D3: "未着手",
      G1: "未着手", G2: '=COUNTIF(D2:D100,"未着手")',
      H1: "完了", H2: '=COUNTIF(D2:D100,"完了")' };
  });
  sh("sh_survey", "アンケート集計", "選択肢ごとの件数と割合", "調査", function () {
    return { A1: "回答", B1: "件数", C1: "割合",
      A2: "とても良い", B2: 0, C2: '=TEXT(B2/SUM(B2:B6),"0%")',
      A3: "良い", B3: 0, C3: '=TEXT(B3/SUM(B2:B6),"0%")',
      A4: "ふつう", B4: 0, C4: '=TEXT(B4/SUM(B2:B6),"0%")',
      A5: "悪い", B5: 0, C5: '=TEXT(B5/SUM(B2:B6),"0%")',
      A6: "とても悪い", B6: 0, C6: '=TEXT(B6/SUM(B2:B6),"0%")',
      A8: "合計", B8: "=SUM(B2:B6)" };
  }, { charts: [{ id: "c1", type: "pie", title: "回答の内訳", range: "A2:B6", sheet: 0 }] });
  sh("sh_sales", "売上管理", "商品ごとの売上", "ビジネス", function () {
    return { A1: "日付", B1: "商品", C1: "単価", D1: "数量", E1: "金額",
      A2: "", E2: "=C2*D2", A3: "", E3: "=C3*D3", A4: "", E4: "=C4*D4",
      G1: "売上合計", G2: "=SUM(E2:E100)" };
  });
  sh("sh_reading", "読書記録", "読んだ本と評価", "個人", function () {
    return { A1: "読了日", B1: "書名", C1: "著者", D1: "ページ", E1: "評価(1-5)", F1: "ひとこと",
      A2: "", A3: "",
      H1: "冊数", H2: "=COUNTA(B2:B200)", I1: "平均評価", I2: "=ROUND(AVERAGE(E2:E200),1)" };
  });
  sh("sh_habit", "習慣トラッカー", "1か月ぶんの○×", "個人", function () {
    var c = { A1: "習慣" };
    for (var d = 1; d <= 14; d++) c[M.colName(d) + "1"] = d + "日";
    c[M.colName(15) + "1"] = "達成";
    c.A2 = ""; c[M.colName(15) + "2"] = '=COUNTIF(B2:O2,"○")';
    c.A3 = ""; c[M.colName(15) + "3"] = '=COUNTIF(B3:O3,"○")';
    return c;
  });
  sh("sh_event", "イベント参加者一覧", "受付の可否と連絡先", "ビジネス", function () {
    return { A1: "氏名", B1: "所属", C1: "連絡先", D1: "参加", E1: "備考",
      A2: "", D2: "未定",
      G1: "参加", G2: '=COUNTIF(D2:D200,"参加")', H1: "欠席", H2: '=COUNTIF(D2:D200,"欠席")' };
  });
  sh("sh_progress", "プロジェクト進捗", "工程と達成率", "ビジネス", function () {
    return { A1: "工程", B1: "開始", C1: "終了", D1: "進捗(%)", E1: "担当",
      A2: "", D2: 0, A3: "", D3: 0, A4: "", D4: 0,
      G1: "平均進捗", G2: "=ROUND(AVERAGE(D2:D100),0)" };
  });
  sh("sh_stock", "在庫管理", "入出庫と残数", "ビジネス", function () {
    return { A1: "品名", B1: "入庫", C1: "出庫", D1: "残", E1: "発注点", F1: "要発注",
      A2: "", D2: "=B2-C2", F2: '=IF(D2<E2,"要","")',
      A3: "", D3: "=B3-C3", F3: '=IF(D3<E3,"要","")' };
  });
  sh("sh_testanalysis", "テスト結果分析", "得点分布と平均", "学習", function () {
    return { A1: "氏名", B1: "得点",
      A2: "", A3: "", A4: "",
      D1: "平均", D2: "=ROUND(AVERAGE(B2:B200),1)",
      E1: "最高", E2: "=MAX(B2:B200)", F1: "最低", F2: "=MIN(B2:B200)",
      G1: "中央値", G2: "=MEDIAN(B2:B200)",
      D4: "80点以上", D5: '=COUNTIF(B2:B200,">=80")',
      E4: "60〜79", E5: '=COUNTIF(B2:B200,">=60")-COUNTIF(B2:B200,">=80")',
      F4: "60点未満", F5: '=COUNTIF(B2:B200,"<60")' };
  });
  sh("sh_insight", "VocabuQuiz Insight 用", "学習結果を貼り付けて分析します", "学習", function () {
    return { A1: "日付", B1: "プリセット", C1: "問題数", D1: "正解数", E1: "正答率",
      A2: "", E2: '=IF(C2=0,"",TEXT(D2/C2,"0%"))',
      A3: "", E3: '=IF(C3=0,"",TEXT(D3/C3,"0%"))',
      G1: "累計問題", G2: "=SUM(C2:C500)", H1: "累計正解", H2: "=SUM(D2:D500)",
      I1: "通算正答率", I2: '=IF(SUM(C2:C500)=0,"",TEXT(SUM(D2:D500)/SUM(C2:C500),"0.0%"))' };
  });

  /* ══ VocabuSlides（§15.10）═══════════════════════════════════════ */
  function el(type, x, y, w, h, o) {
    return Object.assign({ id: uid("e"), type: type, x: x, y: y, w: w, h: h }, o || {});
  }
  function txt(x, y, w, h, text, o) {
    return el("text", x, y, w, h, Object.assign({ text: text, size: 20, align: "left",
      bold: false, color: "#1e293b", lh: 1.5 }, o || {}));
  }
  function slide(layout, elements, notes) {
    return { id: uid("sl"), layout: layout, elements: elements || [], notes: notes || "",
      hidden: false, background: "", transition: "" };
  }
  function sl(id, title, desc, category, theme, slides) {
    LIST.push({ id: id, itemType: "presentation", title: title, description: desc, category: category,
      appearance: { bannerType: "gradient", bannerValue: pick(id) },
      contentSchemaVersion: 1,
      content: function () {
        return { schemaVersion: 1, content: { ratio: "16:9", theme: theme,
          slides: slides(), transition: { type: "fade", speed: 300 } } };
      },
      official: true, productionReady: true });
  }
  /* 960×540 の座標系（16:9）。画面側で拡大縮小する。 */
  sl("sl_blank", "空白のスライド", "1枚だけの白紙", "基本", "minimal", function () {
    return [slide("blank", [])];
  });
  sl("sl_school", "学校発表", "表紙・目次・本文・まとめ", "学校", "minimal", function () {
    return [
      slide("title", [txt(80, 190, 800, 90, "発表のタイトル", { size: 46, bold: true, align: "center" }),
        txt(80, 300, 800, 40, "クラス・氏名", { size: 20, align: "center", color: "#64748b" })]),
      slide("title_body", [txt(70, 60, 820, 50, "目次", { size: 32, bold: true }),
        txt(70, 140, 820, 300, "1. はじめに\n2. 調べたこと\n3. わかったこと\n4. まとめ", { size: 22, lh: 1.9 })]),
      slide("title_body", [txt(70, 60, 820, 50, "はじめに", { size: 32, bold: true }),
        txt(70, 140, 820, 300, "", { size: 20 })]),
      slide("two_col", [txt(70, 60, 820, 50, "調べたこと", { size: 32, bold: true }),
        txt(70, 140, 390, 300, "", { size: 18 }), txt(500, 140, 390, 300, "", { size: 18 })]),
      slide("title_body", [txt(70, 60, 820, 50, "まとめ", { size: 32, bold: true }),
        txt(70, 140, 820, 300, "", { size: 22 })], "ここで結論をもう一度伝えます。")
    ];
  });
  sl("sl_lesson", "授業発表", "説明と例のくり返し", "学校", "minimal", function () {
    return [
      slide("title", [txt(80, 200, 800, 80, "単元名", { size: 42, bold: true, align: "center" })]),
      slide("title_body", [txt(70, 60, 820, 50, "今日のねらい", { size: 30, bold: true }),
        txt(70, 140, 820, 260, "", { size: 22 })]),
      slide("title_body", [txt(70, 60, 820, 50, "例題", { size: 30, bold: true }),
        txt(70, 140, 820, 260, "", { size: 20 })]),
      slide("title_body", [txt(70, 60, 820, 50, "練習", { size: 30, bold: true }),
        txt(70, 140, 820, 260, "", { size: 20 })])
    ];
  });
  sl("sl_self", "自己紹介", "名前・好きなこと・目標", "個人", "modern", function () {
    return [
      slide("title", [txt(80, 180, 800, 100, "はじめまして", { size: 48, bold: true, align: "center" }),
        txt(80, 300, 800, 40, "氏名", { size: 22, align: "center", color: "#64748b" })]),
      slide("title_body", [txt(70, 60, 820, 50, "好きなこと", { size: 32, bold: true }),
        txt(70, 140, 820, 280, "", { size: 22 })]),
      slide("title_body", [txt(70, 60, 820, 50, "これからの目標", { size: 32, bold: true }),
        txt(70, 140, 820, 280, "", { size: 22 })])
    ];
  });
  sl("sl_survey", "調査発表", "問い・方法・結果・考察", "調査", "minimal", function () {
    return [
      slide("title", [txt(80, 200, 800, 80, "調査タイトル", { size: 44, bold: true, align: "center" })]),
      slide("title_body", [txt(70, 60, 820, 50, "調べた問い", { size: 32, bold: true }), txt(70, 140, 820, 260, "", { size: 22 })]),
      slide("title_body", [txt(70, 60, 820, 50, "方法", { size: 32, bold: true }), txt(70, 140, 820, 260, "", { size: 20 })]),
      slide("chart", [txt(70, 50, 820, 44, "結果", { size: 30, bold: true }),
        el("chart", 90, 110, 780, 340, { chart: { type: "bar", title: "", labels: ["A", "B", "C"], series: [{ name: "件数", values: [0, 0, 0] }] } })]),
      slide("title_body", [txt(70, 60, 820, 50, "考察", { size: 32, bold: true }), txt(70, 140, 820, 260, "", { size: 20 })])
    ];
  });
  sl("sl_project", "プロジェクト", "課題・案・工程", "ビジネス", "modern", function () {
    return [
      slide("title", [txt(80, 200, 800, 80, "プロジェクト名", { size: 44, bold: true, align: "center" })]),
      slide("title_body", [txt(70, 60, 820, 50, "解きたい課題", { size: 32, bold: true }), txt(70, 140, 820, 260, "", { size: 22 })]),
      slide("two_col", [txt(70, 60, 820, 50, "案の比較", { size: 32, bold: true }),
        txt(70, 140, 390, 280, "案 A", { size: 20 }), txt(500, 140, 390, 280, "案 B", { size: 20 })]),
      slide("title_body", [txt(70, 60, 820, 50, "工程", { size: 32, bold: true }), txt(70, 140, 820, 260, "", { size: 20 })])
    ];
  });
  sl("sl_data", "データレポート", "数字を大きく見せる", "ビジネス", "modern", function () {
    return [
      slide("title", [txt(80, 200, 800, 80, "データレポート", { size: 44, bold: true, align: "center" })]),
      slide("number", [txt(80, 150, 800, 120, "0", { size: 110, bold: true, align: "center", color: "#2b70ef" }),
        txt(80, 300, 800, 50, "指標の名前", { size: 24, align: "center", color: "#64748b" })]),
      slide("chart", [txt(70, 50, 820, 44, "推移", { size: 30, bold: true }),
        el("chart", 90, 110, 780, 340, { chart: { type: "line", title: "", labels: ["1月", "2月", "3月"], series: [{ name: "値", values: [0, 0, 0] }] } })])
    ];
  });
  sl("sl_research", "研究発表", "背景・仮説・実験・結果", "調査", "minimal", function () {
    return [
      slide("title", [txt(80, 190, 800, 90, "研究テーマ", { size: 42, bold: true, align: "center" }),
        txt(80, 300, 800, 40, "所属・氏名", { size: 20, align: "center", color: "#64748b" })]),
      slide("title_body", [txt(70, 60, 820, 50, "背景", { size: 30, bold: true }), txt(70, 140, 820, 260, "", { size: 20 })]),
      slide("title_body", [txt(70, 60, 820, 50, "仮説", { size: 30, bold: true }), txt(70, 140, 820, 260, "", { size: 20 })]),
      slide("title_body", [txt(70, 60, 820, 50, "実験", { size: 30, bold: true }), txt(70, 140, 820, 260, "", { size: 20 })]),
      slide("title_body", [txt(70, 60, 820, 50, "結果と考察", { size: 30, bold: true }), txt(70, 140, 820, 260, "", { size: 20 })])
    ];
  });
  sl("sl_event", "イベント", "告知用", "個人", "modern", function () {
    return [
      slide("title", [txt(60, 150, 840, 120, "イベント名", { size: 54, bold: true, align: "center" }),
        txt(60, 300, 840, 60, "　　月　　日（　）　場所", { size: 24, align: "center" })]),
      slide("title_body", [txt(70, 60, 820, 50, "内容", { size: 32, bold: true }), txt(70, 140, 820, 260, "", { size: 22 })])
    ];
  });
  sl("sl_portfolio", "ポートフォリオ", "作品の紹介", "個人", "minimal", function () {
    return [
      slide("title", [txt(80, 200, 800, 80, "作品集", { size: 46, bold: true, align: "center" })]),
      slide("image_text", [txt(70, 55, 820, 44, "作品 1", { size: 28, bold: true }),
        el("shape", 70, 120, 400, 300, { shape: "rect", fill: "#e2e8f0" }),
        txt(500, 120, 390, 300, "説明", { size: 18 })])
    ];
  });
  sl("sl_minimal", "Minimal", "余白の広い、文字だけの構成", "デザイン", "minimal", function () {
    return [slide("title", [txt(120, 220, 720, 100, "静かに、はっきりと", { size: 44, bold: true, align: "center" })]),
      slide("title_body", [txt(120, 90, 720, 60, "見出し", { size: 34, bold: true }), txt(120, 180, 720, 240, "", { size: 20 })])];
  });
  sl("sl_modern", "Modern Purple", "濃い背景に明るい文字", "デザイン", "modernPurple", function () {
    return [slide("title", [txt(80, 200, 800, 90, "Modern", { size: 52, bold: true, align: "center", color: "#ffffff" })],
      "テーマの色は右パネルの「デザイン」から変えられます。"),
      slide("title_body", [txt(70, 60, 820, 50, "見出し", { size: 32, bold: true, color: "#ffffff" }),
        txt(70, 140, 820, 260, "", { size: 20, color: "#e2e8f0" })])];
  });
  sl("sl_cosmic", "Cosmic V3", "濃紺の背景", "デザイン", "cosmic", function () {
    return [slide("title", [txt(80, 200, 800, 90, "Cosmic", { size: 52, bold: true, align: "center", color: "#ffffff" })]),
      slide("title_body", [txt(70, 60, 820, 50, "見出し", { size: 32, bold: true, color: "#ffffff" }),
        txt(70, 140, 820, 260, "", { size: 20, color: "#cbd5e1" })])];
  });
  sl("sl_forms_report", "Forms 結果レポート", "回答の集計を載せる形", "調査", "minimal", function () {
    return [
      slide("title", [txt(80, 200, 800, 80, "アンケート結果", { size: 44, bold: true, align: "center" })]),
      slide("number", [txt(80, 160, 800, 110, "0", { size: 96, bold: true, align: "center", color: "#7b3fe4" }),
        txt(80, 300, 800, 40, "回答数", { size: 22, align: "center", color: "#64748b" })]),
      slide("chart", [txt(70, 50, 820, 44, "設問 1", { size: 28, bold: true }),
        el("chart", 90, 110, 780, 340, { chart: { type: "bar", title: "", labels: [], series: [] } })])
    ];
  });
  sl("sl_mock", "Quick Mock 分析", "試験結果の共有用", "学習", "minimal", function () {
    return [
      slide("title", [txt(80, 200, 800, 80, "試験のふりかえり", { size: 42, bold: true, align: "center" })]),
      slide("two_col", [txt(70, 55, 820, 44, "できたところ / 苦手なところ", { size: 28, bold: true }),
        txt(70, 130, 390, 300, "", { size: 18 }), txt(500, 130, 390, 300, "", { size: 18 })]),
      slide("title_body", [txt(70, 60, 820, 50, "次にやること", { size: 30, bold: true }), txt(70, 140, 820, 260, "", { size: 20 })])
    ];
  });

  /* ══ VocabuForms（§16.12）════════════════════════════════════════ */
  function fld(type, label, o) {
    return Object.assign({ id: uid("f"), type: type, label: label, description: "",
      required: false, options: [] }, o || {});
  }
  function formContent(sections, settings, theme) {
    return { schemaVersion: 1, content: {
      sections: sections,
      theme: Object.assign({ accent: "#7b3fe4", background: "#f6f7fb", card: "rounded",
        font: "sans", progress: true, banner: "", logo: "" }, theme || {}),
      settings: Object.assign({
        collectEmail: false, requireLogin: false, anonymous: true, onePerPerson: false,
        onePerDevice: false, allowEdit: false, opensAt: "", closesAt: "", responseLimit: 0,
        accepting: true, confirmMessage: "回答を受け付けました。ご協力ありがとうございました。",
        redirectUrl: "", showResults: false, shuffleQuestions: false, graded: false,
        showQuestionNumber: true
      }, settings || {}),
      logic: []
    } };
  }
  function fm(id, title, desc, category, sections, settings) {
    LIST.push({ id: id, itemType: "form", title: title, description: desc, category: category,
      appearance: { bannerType: "gradient", bannerValue: pick(id) },
      contentSchemaVersion: 1,
      content: function () { return formContent(sections(), settings); },
      official: true, productionReady: true });
  }
  function sec(title, fields, o) {
    return Object.assign({ id: uid("s"), title: title || "", description: "", fields: fields || [] }, o || {});
  }
  var SCALE5 = ["とても良い", "良い", "ふつう", "悪い", "とても悪い"];

  fm("fm_blank", "空白のフォーム", "質問なしから作ります", "基本", function () {
    return [sec("", [])];
  });
  fm("fm_school_life", "学校生活アンケート", "満足度と自由記述", "学校", function () {
    return [sec("", [
      fld("single_choice", "学年", { required: true, options: opts(["1年", "2年", "3年"]) }),
      fld("scale", "学校生活の満足度", { required: true, min: 1, max: 5, minLabel: "低い", maxLabel: "高い" }),
      fld("multi_choice", "力を入れていること", { options: opts(["勉強", "部活動", "行事", "友人関係", "その他"]) }),
      fld("long_text", "改善してほしいこと", { placeholder: "自由にお書きください" })
    ])];
  });
  fm("fm_class", "授業満足度", "科目ごとの評価", "学校", function () {
    return [sec("", [
      fld("short_text", "科目名", { required: true }),
      fld("scale", "授業はわかりやすかったですか", { required: true, min: 1, max: 5 }),
      fld("scale", "進む速さはちょうどよかったですか", { min: 1, max: 5 }),
      fld("long_text", "もっと知りたいこと")
    ])];
  });
  fm("fm_festival", "文化祭アンケート", "参加者の感想", "学校", function () {
    return [sec("", [
      fld("single_choice", "来場されたのは", { required: true, options: opts(["生徒", "保護者", "地域の方", "その他"]) }),
      fld("multi_choice", "見た出し物", { options: opts(["展示", "ステージ", "模擬店", "体験"]) }),
      fld("star", "全体の満足度", { required: true, max: 5 }),
      fld("long_text", "来年に向けての意見")
    ])];
  });
  fm("fm_join", "学園祭参加申込", "クラスの出し物の登録", "学校", function () {
    return [sec("", [
      fld("short_text", "クラス", { required: true }),
      fld("short_text", "代表者氏名", { required: true }),
      fld("single_choice", "出し物の種類", { required: true, options: opts(["展示", "模擬店", "ステージ", "その他"]) }),
      fld("long_text", "内容の説明", { required: true }),
      fld("consent", "校則と衛生管理の規定を守ります", { required: true })
    ])];
  });
  fm("fm_attend", "出欠確認", "参加・欠席の集計", "学校", function () {
    return [sec("", [
      fld("short_text", "氏名", { required: true }),
      fld("single_choice", "出欠", { required: true, options: opts(["参加", "欠席", "未定"]) }),
      fld("date", "参加できる日"),
      fld("long_text", "連絡事項")
    ])];
  }, { onePerDevice: true });
  fm("fm_event", "イベント申込", "連絡先つきの申込", "ビジネス", function () {
    return [sec("", [
      fld("short_text", "お名前", { required: true }),
      fld("email", "メールアドレス", { required: true }),
      fld("phone", "電話番号"),
      fld("number", "参加人数", { required: true, min: 1, max: 20 }),
      fld("datetime", "希望日時"),
      fld("consent", "個人情報の取り扱いに同意します", { required: true })
    ])];
  });
  fm("fm_club", "部活動アンケート", "所属と活動の様子", "学校", function () {
    return [sec("", [
      fld("dropdown", "所属する部", { required: true, options: opts(["運動部", "文化部", "無所属"]) }),
      fld("scale", "活動の満足度", { min: 1, max: 5 }),
      fld("number", "週あたりの活動日数", { min: 0, max: 7 }),
      fld("long_text", "要望")
    ])];
  });
  fm("fm_parent", "保護者アンケート", "学校への意見", "学校", function () {
    return [sec("", [
      fld("single_choice", "お子さまの学年", { required: true, options: opts(["1年", "2年", "3年"]) }),
      fld("scale", "学校からの連絡はわかりやすいですか", { min: 1, max: 5 }),
      fld("multi_choice", "参加した行事", { options: opts(["入学式", "体育祭", "文化祭", "保護者会"]) }),
      fld("long_text", "ご意見・ご要望")
    ])];
  });
  fm("fm_reflect", "学習振り返り", "今週の学習を見直します", "学習", function () {
    return [sec("", [
      fld("date", "対象の週", { required: true }),
      fld("number", "勉強した時間（合計・分）", { min: 0 }),
      fld("scale", "計画どおりに進みましたか", { min: 1, max: 5 }),
      fld("long_text", "うまくいったこと"),
      fld("long_text", "つまずいたこと"),
      fld("short_text", "来週の一番の目標")
    ])];
  });
  fm("fm_selfeval", "自己評価", "観点ごとの自己採点", "学習", function () {
    return [sec("", [
      fld("matrix", "観点ごとの自己評価", { required: true,
        rows: ["知識・技能", "思考・判断・表現", "主体的に学ぶ態度"], cols: ["A", "B", "C"] }),
      fld("long_text", "その理由")
    ])];
  });
  fm("fm_vote", "投票", "1人1回の投票", "個人", function () {
    return [sec("", [
      fld("single_choice", "どれに投票しますか", { required: true, options: opts(["案 1", "案 2", "案 3"]) }),
      fld("long_text", "理由（任意）")
    ])];
  }, { onePerDevice: true, anonymous: true });
  fm("fm_contact", "問い合わせ", "内容と連絡先", "ビジネス", function () {
    return [sec("", [
      fld("short_text", "お名前", { required: true }),
      fld("email", "メールアドレス", { required: true }),
      fld("dropdown", "種別", { required: true, options: opts(["ご質問", "ご要望", "不具合の報告", "その他"]) }),
      fld("long_text", "内容", { required: true })
    ])];
  });
  fm("fm_product", "商品評価", "星と自由記述", "ビジネス", function () {
    return [sec("", [
      fld("star", "総合評価", { required: true, max: 5 }),
      fld("multi_choice", "良かった点", { options: opts(["価格", "品質", "使いやすさ", "サポート"]) }),
      fld("long_text", "改善してほしい点")
    ])];
  });
  fm("fm_service", "サービス満足度", "NPS つき", "ビジネス", function () {
    return [sec("", [
      fld("nps", "友人にすすめる可能性は", { required: true }),
      fld("scale", "使いやすさ", { min: 1, max: 5 }),
      fld("long_text", "その理由")
    ])];
  });
  fm("fm_booking", "予約", "日時と人数", "ビジネス", function () {
    return [sec("", [
      fld("short_text", "お名前", { required: true }),
      fld("phone", "電話番号", { required: true }),
      fld("date", "希望日", { required: true }),
      fld("time", "希望時刻", { required: true }),
      fld("number", "人数", { required: true, min: 1, max: 30 })
    ])];
  });
  fm("fm_interview", "面談希望", "希望日時の調整", "学校", function () {
    return [sec("", [
      fld("short_text", "氏名", { required: true }),
      fld("ranking", "希望の日を順に並べてください", { options: opts(["第1候補日", "第2候補日", "第3候補日"]) }),
      fld("long_text", "相談したいこと")
    ])];
  });
  fm("fm_research", "研究調査", "同意つきの調査", "調査", function () {
    return [
      sec("調査へのご協力のお願い", [
        fld("description", "", { text: "この調査は学習目的で行われます。回答は統計的に処理し、個人が特定される形では公表しません。" }),
        fld("consent", "上記に同意して回答します", { required: true })
      ]),
      sec("設問", [
        fld("single_choice", "年代", { required: true, options: opts(["10代", "20代", "30代", "40代以上"]) }),
        fld("multi_choice", "利用したことがあるもの", { options: opts(["A", "B", "C"]) }),
        fld("long_text", "自由記述")
      ])
    ];
  });
  fm("fm_nps", "NPS 調査", "推奨度だけを短く聞きます", "ビジネス", function () {
    return [sec("", [
      fld("nps", "このサービスを友人・同僚にすすめる可能性はどのくらいですか", { required: true }),
      fld("long_text", "その点数にした理由")
    ])];
  });
  fm("fm_quiz", "クイズモード（採点あり）", "正解と配点を設定できます", "学習", function () {
    return [sec("", [
      fld("single_choice", "日本の首都はどこですか", { required: true,
        options: opts(["東京", "大阪", "京都", "名古屋"]),
        answer: "0", points: 10, feedback: "東京都が首都機能を持ちます。" }),
      fld("short_text", "1年は何日ですか（平年）", { required: true, answer: "365", points: 10 })
    ])];
  }, { graded: true, requireLogin: false });

  function opts(arr) {
    return arr.map(function (t, i) { return { id: uid("o"), text: t }; });
  }

  /* ── 取り出し ─────────────────────────────────────────────────── */
  function all(itemType) {
    return itemType ? LIST.filter(function (t) { return t.itemType === itemType; }) : LIST.slice();
  }
  function get(id) {
    for (var i = 0; i < LIST.length; i++) if (LIST[i].id === id) return LIST[i];
    return null;
  }
  /* 使うときは必ず写しを作る（テンプレート本体は書き換えない §19）。 */
  function instantiate(id) {
    var t = get(id);
    if (!t) return null;
    return {
      itemType: t.itemType,
      title: t.title === "空白の文書" || /^空白/.test(t.title) ? M.defaultTitle(t.itemType) : t.title,
      description: "",
      appearance: M.normalizeAppearance(t.appearance, t.itemType),
      templateId: t.id,
      content: JSON.parse(JSON.stringify(t.content()))
    };
  }
  function categories(itemType) {
    var m = {};
    all(itemType).forEach(function (t) { m[t.category] = (m[t.category] || 0) + 1; });
    return Object.keys(m);
  }

  WP.templates = { all: all, get: get, instantiate: instantiate, categories: categories,
    count: function () { return LIST.length; } };
})(typeof globalThis !== "undefined" ? globalThis : this);
