# クイズ形式 V3 — 統合クイズエンジン

4 択中心だったクイズを、**形式が増えても実装が増えない**構造へ作り直したもの。

---

## 1. 三層に分ける

100 種類のクイズを 100 個のコンポーネントで作らない。次の 3 つを掛け合わせる。

| 層 | 何を決めるか | 数 | どこ |
|---|---|---|---|
| **Engine** | 1 問をどう見せて、どう答えるか | 20 | `domain/qtypes.js` の `ENGINES` |
| **Mode** | どのルールで解くか | 16（うち動くもの 11） | `ENGINES` と独立。`MODES` |
| **Source** | 何を根拠に作るか | 12 | `SOURCES` |

**形式＝ Engine ＋ 既定値**。たとえば「2択 / 3択 / 4択 / 5択 / 誤っているものを選択 /
最適解選択 / 該当なしを含む選択」はすべて `single_choice` エンジンで、`defaults` が違うだけ。
だから形式が 133 種類あっても、表示は 20 個、採点も 20 個で足りる。

```
形式 133 種類（使える 118 / ベータ 8 / 準備中 7）
  ├ 選択式 19 ├ 文字入力 20 ├ 穴埋め 11 ├ 並べ替え 13 ├ マッチング・分類 13
  └ 画像・図表 20 ├ 音声 13 ├ 記述 20 ├ 暗記・復習 12 ├ 複合大問 2
```

---

## 2. ファイル

| ファイル | 役割 |
|---|---|
| `domain/qtypes.js` | **形式レジストリ**。名前・説明・分類・アイコン・対応科目・対応モード・AI 生成可否・状態の唯一の出どころ |
| `domain/qmodel.js` | 共通データモデル。RichContent（安全な本文）・複合大問・旧データの取り込み・正解の伏せ方 |
| `domain/evaluator.js` | 採点の一元化。**エンジン単位**で振り分ける |
| `domain/qplan.js` | 出題形式の配分と、AI 出力の取り込み |
| `ui/question-renderer.js` | 表示と回答。運ぶ操作（指・マウス・キーボード） |
| `ui/qtype-editor.js` | 形式を選ぶ画面と、形式ごとの編集フォーム |

**形式の名前を画面へ書き写さない。** 必ず `VQ2.qtypes.label(type)` から引く。
書き写すと、形式を足したときに必ずどこかがずれる。

---

## 3. 既存データは移行しない

既存の 13 形式（`multiple_choice_single` など）の **ID をそのまま正式 ID に採用**した。
だから保存済みのプリセット・答案・結果はそのまま読める。マイグレーションは要らない。

V1 のカード（`front` / `back` / `choices` / `correctIndex`）は
`qmodel.migrateLegacyQuestion()` が実行時に取り込む。**正解が示されていないカードに
勝手な正解を作らない。**

採点も変わらない。選択式・並べ替え・組み合わせ・数式は `grading.js` へ委譲しているので、
過去の答案を採点し直しても 1 点も動かない（単体テストで固定してある）。

---

## 4. 採点

```js
VQ2.evaluator.evaluate(question, answer) → {
  isCorrect, score, maxScore, partialCredit,
  normalizedAnswer, feedback, matchedCriteria, missedCriteria,
  requiresManualReview, aiEvaluationId, method, detail
}
```

- **知らない形式・正解が無い問題は、0 点にも満点にもしない。** `score: null` で保留にする。
- **記述は AI 採点へ回すが、点は付けずに返す。** 失敗や低信頼を自動確定しない。
- 部分点は 並べ替え / 組み合わせ / 分類 / 表 / 穴埋め / 位置 / ラベル / 書き取り / 誤文訂正 / キーワードで付く。
- 複合大問は小問へ展開してから採点する。集計の単位は小問。

---

## 5. 回答の形（Renderer と Evaluator の約束）

| エンジン | 回答の形 |
|---|---|
| single_choice / true_false / image_choice / audio_choice | `{choiceId, confidence?}` |
| multi_choice | `{choiceIds: []}` |
| text_input / numeric_input / dictation / free_text | `{text}` |
| fill_blank | `{blanks: []}` |
| reorder | `{order: [itemId]}` |
| matching | `{L1: "R1", ...}` |
| classification | `{items: {itemId: groupId}}` |
| table_fill | `{cells: {cellId: text}}` |
| image_point | `{points: [{x, y}]}`（0〜1 の正規化座標） |
| image_label | `{slots: {slotId: labelId}}` |
| error_correction | `{spans: {spanId: text}}` |
| flashcard | `{mark: "known" \| "unknown"}` |
| composite | `{children: {childId: 値}}` |

座標は必ず 0〜1 で持つ。画像の実寸に依存させない（拡大しても同じ判定になる）。

---

## 6. 運ぶ操作は 3 通りで必ず動く

HTML5 の drag & drop は使わない（スマートフォンで動かないため）。`DragKit` が持つのは：

1. **つかんで運ぶ** — Pointer Events。`touch-action: none` を付けてあるので iOS でも動く
2. **押して選ぶ → 置き先を押す** — いちばん確実。指でも迷わない
3. **キーボード** — Tab で移動、Space でつかむ、矢印で動かす、Esc で戻す

さらに 並べ替えには ↑↓ ボタン、運ぶ形式には「ひとつ戻す」「やり直す」がある。
画面の端に近づくと自動で送るので、運んでいる途中で画面外へ消えない。

---

## 7. 試験のときに正解を端末へ置かない

`mode: "mock"` のときは `qmodel.stripAnswersStrict()` を通した写しだけを描く。

- 選択肢の `isCorrect`、解説、別解、正しい順序、分類の正解、表の正解、
  誤りの正しい形、ラベルの正解、カードの裏 — すべて落ちる
- ドラッグ式の穴埋めは、落とす前に語群を作ってから落とす（語群が空にならない）
- 採点のときだけ本物を使う

> **できていないこと**: 採点そのものはまだ端末で行う。プリセットは端末の中
> （localStorage）にあり、サーバは名前と問題数しか持っていないため。
> サーバ採点にするには、まずプリセットをサーバへ置く必要がある。

---

## 8. AI 生成の形式配分

AI に丸投げすると、ほぼ全部 4 択になる。**何をどれだけ作るかをこちらで決めてから頼む。**

```js
const plan = VQ2.qplan.planMix({ count: 10, style: "auto", subject: "social", hints });
// → 4択 3 / 単語入力 2 / 年代順 1 / 組み合わせ 1 / グラフ読み取り 1 / 記述 1 / カード 1
VQ2.qplan.promptFor(plan, { sourceOnly: true });   // 依頼文に足す
```

- 配分は 8 通り（完全自動 / 選択式多め / 記述式多め / 暗記中心 / 理解中心 / 試験形式 / ゲーム形式 / 形式を指定）
- **教材に合わない形式は頼まない。** 画像が無ければ画像問題を、年代が出てこなければ年代順を外す
- 資料限定で教材のことが分からないときは、図表・表も頼まない（資料に無いものを作らせない）
- 返ってきたものは `qplan.importAll()` が形式ごとに取り込む。
  正解が分からないもの、根拠の無いもの（資料限定時）は**理由をつけて捨てる**
- 準備中の形式を AI が指定してきたら、近い形式へ寄せる。寄せ先が無ければ捨てる

ローカル AI 側も直してある（**Bridge の再起動が要る**）：

- `local-ai/src/schemas/preset-draft.schema.json` — `type` の enum を広げ、
  `choices` / `correctAnswer` を必須から外し、形式ごとの構造を足した
- `local-ai/src/schemas/index.mjs` の `checkPreset` — 選択式のときだけ選択肢の規則を見る
- `local-ai/src/prompts/preset.mjs` — 依頼文に内訳があればそれに従う
- `local-ai/src/schema/structured.mjs` — 生 API 側も同じ考えでゆるめた

---

## 9. 形式を足すには

```js
VQ2.qtypes.register({
  id: "my_new_type", name: "新しい形式", category: "choice",
  engine: "single_choice",            /* 既にあるエンジンを選ぶ */
  description: "…", defaults: { choiceCount: 6 }
});
```

エンジンごと足すときだけ、次の 3 つに実装が要る。

1. `qrender.registerRenderer("my_engine", { html: ctx => "…" })`
2. `evaluator.ENGINE_EVAL.my_engine = (q, answer, ctx) => …`
3. `qmodel` に構造の正規化と検証（必要なら）

`status: "coming_soon"` にしておけば、作成画面では「準備中」と出て、
押しても壊れた画面へ行かない。

---

## 10. テスト

| コマンド | 内容 |
|---|---|
| `node client/v2/tests/qtypes.test.mjs` | レジストリ・共通モデル・採点・配分（73 件） |
| `node vqqtype.cjs` | 実画面（PC / スマホ）で 7 形式を解いて採点まで（90 件） |

`qtypes.test.mjs` の「既存 13 形式は、これまでの採点と 1 点も変わらない」は消さないこと。
ここが崩れると、過去の答案の点が動く。
