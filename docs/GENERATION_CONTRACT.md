# 出題形式の共通契約 v1（Phase 1）

> Quick Mock と Preset Engine が同じ規則で形式を扱うための取り決め。
> ここに書いた形以外で形式を運ばない。実装より先にこの文書が正。

## 1. 形式 ID の唯一の出所

`client/v2/domain/qtypes.js` のレジストリ（125 定義）。
サーバの JSON Schema に形式名をハードコードしない。生成スクリプトで書き出す。

理由: 実測（2026-08-05）で `preset-draft.schema.json` の enum は 100 値、
レジストリは 125 定義。34 形式が enum に無く、AI が文法上その形式を出せない。
`mock-draft.schema.json` に至っては 4 値しか無かった。

## 2. 紙に出せる形式

試験（Quick Mock）で使ってよいのは
`status ∈ {available, beta}` かつ `supportsAI` かつ **紙に出せる**もの。

紙に出せないエンジン（`capability.js` の `NO_PAPER_ENGINES`）は
これまで 8 種だったが、次の 3 種は**紙に出せるので外す**。

| エンジン | 紙に出せる根拠 |
|---|---|
| `reorder` | `layout-grammar.js:134` に `ordering`（並び替え）ブロック型が実在 |
| `matching` | `layout-grammar.js:143` に `matching`（対応・線結び）ブロック型が実在 |
| `classification` | `layout-grammar.js:117` に `word-bank`（語群）ブロック型が実在 |

紙に出せないまま残すのは `audio_choice` / `dictation` / `flashcard` /
`image_point` / `image_label`（音・タップ・ドラッグが要る操作）。

これを直さない限り「英文並び替えで作って」は Quick Mock で**構造上出せない**。

## 3. Draft が形式を運ぶ 2 つの欄

```jsonc
{
  "questionType": "ordering",      // 正式 ID（新）。あればこれを採る
  "type": "short_answer"           // 昔からの粗い 4 語。後方互換のため残す
}
```

粗い 4 語は `multiple_choice` / `short_answer` / `descriptive` / `true_false`。
古い保存データと、古いモデル出力のために残す。**消さない。**

## 4. 形式の決め方（取り込み側）

`mock-builder.resolveType()` が唯一の判定箇所。順に見る。

1. `questionType` がレジストリにある → それ
2. `TYPE_MAP[type]`（粗い 4 語）→ それ
3. `type` がレジストリにある（AI は欄を取り違える）→ それ
4. どれでもない → 選択肢があれば 4 択・無ければ短答へ落とすが、
   **必ず `warnings` に「何が分からなかったか」を残す**

4 の「黙って落とさない」が §10 の要求。実装済み・回帰テストあり
（`client/v2/tests/mock-type-preserve.test.mjs`）。

## 5. 指示 → 配分（Generation Contract）

`blueprint.extractRequirements()` の戻り値に次を足す。

```js
req.typeDistribution = [ { type: "fill_blank", count: 4 },
                         { type: "true_false", count: 4 } ];   // 無ければ []
```

- 「空欄補充を **4問**、正誤を **4問**」のような**形式ごとの個数**を読む。
- 個数の合計が総数以下なら、その配分を**そのまま守る**。
- 合計が総数に満たない残りは、これまでどおり自動配分で埋める。
- 個数を伴わずに形式だけ名指しされたときは従来どおり（`requestedTypes`）。

`qplan.planMix()` は `typeDistribution` が空でなければ**それを最優先で割り当てる**。
`style === "manual"`（「〜だけ」）でなくても守る。

理由: 実測（2026-08-05・vqprompt.cjs）で
「空欄補充を4問、正誤を4問」→ 決めた配分が
「穴埋め2・4択2・○×2・並替1・単語1」になっていた。
AI は配分どおりに正確に返しており、**壊しているのは配分決定**だった。

## 6. 無言の変換をしない

形式を別のものへ変えたときは、必ず次のどれかを行う。

- `converted` / `conversion` に記録して呼び出し側へ返す
- `warnings` へ理由を積む
- 生成を止めてユーザーへ選ばせる

「動くふりをしない」。使えない形式を黙って 4 択や短答へ寄せない。
