# 問題形式 対応表（契約テストの結果）

`node vqcontract.cjs` が実画面で 1 形式ずつ確かめて書き出したもの。手で書いていない。

| 状態 | 件数 |
|---|---|
| beta | 8 |
| coming_soon | 7 |
| production | 110 |
| **合計** | **125** |

## 本番と判定した形式（110）

| 表示名 | 内部ID | Engine | 分類 | 空 | 見本 | 検証 | 解ける | 編集 | 表示 | 採点 | 結果 | Insight | 判定 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2択 | `choice_2` | single_choice | 選択式 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 3択 | `choice_3` | single_choice | 選択式 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 4択 | `multiple_choice_single` | single_choice | 選択式 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 5択 | `choice_5` | single_choice | 選択式 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 多肢選択 | `choice_many` | single_choice | 選択式 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| ○× | `true_false` | true_false | 選択式 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 複数選択 | `multiple_choice_multiple` | multi_choice | 選択式 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 誤り選択 | `choice_incorrect` | single_choice | 選択式 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 全選択 | `choice_all_correct` | multi_choice | 選択式 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 該当なし付き | `choice_none_option` | single_choice | 選択式 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 最適解選択 | `choice_best` | single_choice | 選択式 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 文章選択 | `choice_sentence` | single_choice | 選択式 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 画像選択 | `image_choice` | image_choice | 選択式 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 音声選択 | `audio_choice` | audio_choice | 音声・リスニング | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 確信度付き | `choice_confidence` | single_choice | 選択式 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 組み合わせ選択 | `choice_combination` | single_choice | 選択式 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 単語入力 | `word_input` | text_input | 文字入力式 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| スペリング | `spelling` | text_input | 文字入力式 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 和訳入力 | `translate_ja` | text_input | 文字入力式 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 英訳入力 | `translate_en` | text_input | 文字入力式 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 漢字入力 | `kanji_input` | text_input | 文字入力式 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 読み入力 | `reading_input` | text_input | 文字入力式 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 短答 | `short_answer` | text_input | 文字入力式 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 複数語句 | `multi_word_input` | fill_blank | 文字入力式 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| キーワード | `keyword_input` | text_input | 文字入力式 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 完全一致 | `exact_input` | text_input | 文字入力式 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 部分一致 | `partial_input` | text_input | 文字入力式 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 大小無視 | `caseless_input` | text_input | 文字入力式 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 揺れ許容 | `fuzzy_input` | text_input | 文字入力式 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 頭文字ヒント | `hint_initial_input` | text_input | 文字入力式 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 文字数ヒント | `hint_length_input` | text_input | 文字入力式 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 順次ヒント | `hint_progressive_input` | text_input | 文字入力式 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 時間制限入力 | `timed_input` | text_input | 文字入力式 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 穴埋め | `fill_blank` | fill_blank | 穴埋め式 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 複数穴埋め | `fill_blank_multi` | fill_blank | 穴埋め式 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 選択式穴埋め | `fill_blank_choice` | fill_blank | 穴埋め式 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 入力式穴埋め | `fill_blank_input` | fill_blank | 穴埋め式 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| ドラッグ穴埋め | `fill_blank_drag` | fill_blank | 穴埋め式 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 長文穴埋め | `fill_blank_passage` | fill_blank | 穴埋め式 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 会話文穴埋め | `fill_blank_dialog` | fill_blank | 穴埋め式 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 表完成 | `table_fill` | table_fill | 穴埋め式 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 資料穴埋め | `fill_blank_source` | fill_blank | 穴埋め式 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 単語並べ替え | `reorder_words` | reorder | 並べ替え・操作 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 英作並べ替え | `reorder_english` | reorder | 並べ替え・操作 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 並べ替え | `ordering` | reorder | 並べ替え・操作 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 年代順 | `reorder_chronology` | reorder | 並べ替え・操作 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 出来事順 | `reorder_events` | reorder | 並べ替え・操作 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 計算手順 | `reorder_steps` | reorder | 並べ替え・操作 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 実験手順 | `reorder_experiment` | reorder | 並べ替え・操作 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 会話順 | `reorder_dialog` | reorder | 並べ替え・操作 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 流れ図順 | `reorder_flow` | reorder | 並べ替え・操作 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 優先順位 | `reorder_priority` | reorder | 並べ替え・操作 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| ランキング | `reorder_ranking` | reorder | 並べ替え・操作 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 画像順序 | `image_order` | reorder | 並べ替え・操作 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 組み合わせ | `matching` | matching | マッチング・分類 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 人物と出来事 | `matching_person_event` | matching | マッチング・分類 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 国と首都 | `matching_country_capital` | matching | マッチング・分類 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 年代と事件 | `matching_year_event` | matching | マッチング・分類 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 英単語と訳 | `matching_word_meaning` | matching | マッチング・分類 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 画像と名称 | `matching_image_name` | matching | マッチング・分類 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 線結び | `matching_line` | matching | マッチング・分類 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| ペア作成 | `matching_pairs` | matching | マッチング・分類 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 分類 | `classification` | classification | マッチング・分類 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 仲間分け | `classification_odd_group` | classification | マッチング・分類 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| カテゴリ振り分け | `classification_drag` | classification | マッチング・分類 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 余分を除く | `classification_exclude` | classification | マッチング・分類 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 位置選択 | `image_point` | image_point | 画像・図表 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 地図ピン | `map_pin` | image_point | 画像・図表 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 部位選択 | `image_part` | image_point | 画像・図表 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 座標指定 | `coordinate_input` | image_point | 画像・図表 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 間違い探し | `spot_difference` | image_point | 画像・図表 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| ラベル配置 | `image_label` | image_label | 画像・図表 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| グラフ読取 | `chart_read` | chart_read | 画像・図表 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 表読取 | `table_read` | chart_read | 画像・図表 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 図形判定 | `shape_judge` | single_choice | 画像・図表 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 写真判定 | `photo_judge` | single_choice | 画像・図表 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 音声穴埋め | `audio_fill_blank` | fill_blank | 音声・リスニング | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 書き取り | `dictation` | dictation | 音声・リスニング | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 発音選択 | `pronunciation_choice` | audio_choice | 音声・リスニング | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| アクセント位置 | `accent_position` | single_choice | 音声・リスニング | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 会話応答 | `dialog_response` | audio_choice | 音声・リスニング | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 一度だけ再生 | `audio_once` | audio_choice | 音声・リスニング | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 倍速 | `audio_speed` | audio_choice | 音声・リスニング | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 記述 | `long_answer` | free_text | 記述・思考 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 理由説明 | `explain_reason` | free_text | 記述・思考 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 要約 | `summarize` | free_text | 記述・思考 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 作文 | `essay` | free_text | 記述・思考 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 英作文 | `english_writing` | free_text | 記述・思考 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 小論文 | `dissertation` | free_text | 記述・思考 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 誤文訂正 | `error_correction` | error_correction | 記述・思考 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 英文添削 | `english_proofread` | error_correction | 記述・思考 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 途中式 | `work_steps` | free_text | 記述・思考 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 証明問題 | `proof` | free_text | 記述・思考 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| ケーススタディ | `case_study` | free_text | 記述・思考 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 仮説作成 | `hypothesis` | free_text | 記述・思考 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 比較説明 | `compare_explain` | free_text | 記述・思考 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 根拠説明 | `evidence_explain` | free_text | 記述・思考 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 根拠引用 | `quote_evidence` | free_text | 記述・思考 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 資料読解 | `source_analysis` | free_text | 記述・思考 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 自分の言葉 | `own_words` | free_text | 記述・思考 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 反対意見 | `counter_argument` | free_text | 記述・思考 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| AI採点記述 | `free_write_ai` | free_text | 記述・思考 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 基準付き記述 | `rubric_write` | free_text | 記述・思考 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| カード | `flashcard` | flashcard | 暗記・復習 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 逆引きカード | `flashcard_reverse` | flashcard | 暗記・復習 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 高速カード | `flashcard_speed` | flashcard | 暗記・復習 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 覚えた／まだ | `flashcard_selfmark` | flashcard | 暗記・復習 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 複合大問 | `composite` | composite | 複合大問 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 数値入力 | `numeric` | numeric_input | 文字入力式 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
| 数式入力 | `formula` | text_input | 文字入力式 | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | **合格** |
