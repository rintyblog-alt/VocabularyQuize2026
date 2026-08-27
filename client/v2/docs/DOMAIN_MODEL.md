# 共通ドメインモデル

4 画面（Preset Studio / Quiz Player / Result View / Quick Mock）が共有する唯一の型定義。
TypeScript の型注釈では AI 生成物を守れないため、**すべて実行時に検証する**。

---

## 1. 問題形式

| 形式 | 採点 | 選択肢 |
|---|---|---|
| `multiple_choice_single` | コード | あり |
| `multiple_choice_multiple` | コード（部分点） | あり |
| `true_false` | コード | あり |
| `short_answer` | コード（正規化して一致） | なし |
| `fill_blank` | コード（空欄ごとの部分点） | なし |
| `ordering` | コード（位置一致数で部分点） | あり |
| `matching` | コード（対応一致数で部分点） | あり |
| `numeric` | コード（許容誤差つき） | なし |
| `formula` | コード（定義済み同値表現との照合のみ） | なし |
| `long_answer` | AI 補助 | なし |
| `essay` | AI 補助 | なし |
| `english_writing` | AI 補助 | なし |
| `source_analysis` | AI 補助 | なし |

数式は記号処理をしない。`acceptedAnswers` に書かれた表現とだけ照合する
（できないことを「できる」と見せない）。

---

## 2. 観点別評価

正式な得点として扱うのは 2 観点のみ。

- `knowledge_skill`（知識・技能）
- `thinking_judgment_expression`（思考・判断・表現）

「主体的に学習に取り組む態度」は 1 回の答案から断定できないため、**得点にしない**。
代わりに `behaviorSignals()` が観測できた事実だけを返す（見直し・回答変更・再訪・
未回答・時間配分）。戻り値には必ず「学習態度の評価ではありません」という注記が付く。

観点別の得点は、問題の得点率を `criterionAllocation` へ按分して求める。
配点が無い観点は満点 0 のままにし、偽の内訳を作らない。

---

## 3. 保存前検証（error があれば保存・公開・受験開始をさせない）

### プリセット

必須項目 / Schema version / 問題 ID 重複 / 選択肢 ID 重複 / 正解が実在するか /
選択肢数 / 空の問題文 / 空の正解 / 同一本文の選択肢 / 不正な配点 /
SourceReference の整合性（ページ番号があるのに資料が特定できない） / 問題数

### MockSpec（上に加えて）

回答欄 ID 重複 / 問題と回答欄の双方向対応 / 回答欄の形式・配点の一致 /
問題番号と大問番号の欠番・重複 / 大問小計 / 観点別小計 / 総合点 /
0 点問題（試験では error）/ 記述式の採点基準の有無と合計 /
1 大問あたり 60 問の上限 / 試験時間と問題量（参考の警告）

`severity` は `error` / `warning` / `info` の 3 段階。`error` が 1 件でもあれば保存できない。

---

## 4. Score Allocator

AI の仮配点は指定満点へ収束しない。これを AI の再生成で直そうとせず、コードで保証する。

**入力**: `targetTotal` / `integerOnly` / `minimumPoints` / `maximumPoints` /
問題ごとの `lockedPoints` / `preferredPoints` / `minimumPoints` / `maximumPoints`

**処理**: 固定配点を保護 → 残りを重み（希望配点、無ければ形式と難易度）で配分 →
整数は最大剰余法 → 大問小計・観点別小計・採点基準・回答欄をすべて作り直す

**保証**（単体テストで 1〜60 問 × 満点 7 種の全 309 通りを検査済み）:

- 合計は必ず `targetTotal` と一致する
- 負の配点・0 点問題は作らない
- 指定が無ければ整数
- 大問小計・観点別小計・採点基準・回答欄・採点定義がすべて一致する
- **利用者が指定した満点を勝手に変えない**

不可能な場合は満点を変えず、何が不可能かを数字つきで返す。

> 20 問すべての配点が固定されているため、合計 60 点を満点 100 点へ調整できません。
> 固定条件の変更が必要です。

---

## 5. セッションの状態遷移

不正な遷移は例外にする。

**Quiz**
`created → ready → in_progress ⇄ paused → submitting → grading → completed`
（`abandoned` / `expired` はどこからでも。`expired → submitting` は許可＝時間切れでも採点する。
`submitting → in_progress` / `grading → in_progress` は送信失敗時の戻り）

**Mock**
`created → preparing → ready → in_progress ⇄ paused → submitting →
deterministic_grading → ai_grading → reviewing → completed`

---

## 6. AI Draft の扱い

AI の結果を自動確定しない。必ず差分を出す。

- **追加** — 提案にしかない問題
- **変更** — 項目単位（問題文・選択肢・正解・解説・難易度・単元・出典・配点・形式・別解・タグ）
- **削除候補** — 提案に出てこなかった既存の問題。**明示しない限り消さない**

対応づけは「同じ ID → 同じ問題文 → 位置」の順。空白の違いだけでは差分にしない。

適用は 3 段階:

```js
{ all: true }                              // すべて
{ questionIds: ["q1", "q2"] }              // 問題単位
{ fields: { q1: ["prompt", "choices"] } }  // 項目単位
```

Draft の状態は 8 つ: `generating` / `draft` / `reviewing` / `partially_applied` /
`applied` / `saving` / `saved` / `failed`

---

## 7. 出典（SourceReference）

モデルが書いてよいのは `evidenceId` だけ。ファイル名とページはサーバ側が
Evidence Store の実データから埋める。**架空のページ番号を作れない構造**にしてある。

`fileName` が入っていない出典は UI 側でも捨てる（資料を特定できていないため）。

画像由来の出典は `region` を持てるが、`coordinateSystem` が必須。
座標を持っていないときは `region: null` のままにし、推測で埋めない。

---

## 8. 保存

- すべてのレコードが `ownerId` を持つ。読み出しは現在の owner で絞る。
- 保存は `revision` で楽観ロックする。読み込んだ時点の版と食い違えば `CONFLICT` を返し、
  利用者に「上書きする / 読み込み直す」を選ばせる。
- 自動保存は下書き領域（`vq2.drafts.v1`）へ debounce して書く。保存に成功したら消す。
- 保存領域が満杯のときは握りつぶさず、`STORAGE_FULL` を返す。
