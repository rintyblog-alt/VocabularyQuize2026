# MockCompilerPipelineV2

Quick Mock を「AI が試験全体を作る機能」から
**「AI が問題の中身を書き、コードが試験を組み立てる試験コンパイラ」** へ変える。

この文書は**実装した範囲だけ**を書く。まだ動かしていないものは「未着手」と書く。

---

## 1. なぜ作り直すのか（実測にもとづく）

| 症状 | 実測 | 元の原因 |
|---|---|---|
| 頼んだ数より多く作られ、捨てられる | asked 11 / made 66 / **dropped 55（83.3%）** | 数をお願いベースで伝え、超過分を後から切っていた |
| 満点が合わない | 大問ごとの申告が 100 点だったり 30 点だったり | 配点をモデルに計算させていた |
| 保存できない試験ができる | 選択肢 0 件の選択問題が仕様へ入る | 「入れてから直す」設計 |
| 遅い | 合計 388.7 秒（3 大問 9 問） | 上の全部＋大問ごとの資料読み直し |

出典: `artifacts/quick-mock-v1-baseline/metrics.json`（before / after を同条件で実測）

---

## 2. 設計

```
条件 ─→ plan() ─→ requestsOf() ─→ [AI] ─→ gate() ─→ assemble() ─→ verify()
        ↑決定論      ↑決定論        中身だけ   ↑決定論     ↑決定論      ↑決定論
```

**AI が決めてよいのは、1 問ぶんの中身だけ。**
問題文・選択肢・正解・解説・出典。それ以外は全部コードが決める。

| 段階 | 何をするか | モデル |
|---|---|---|
| `plan()` | 大問数・設問数・**1 問ごとの配点**・形式・難易度を確定 | 使わない |
| `requestsOf()` | 枠を依頼へ切り出す（既定 3 問／回） | 使わない |
| 生成 | 枠のぶんだけ中身を書かせる | **使う** |
| `gate()` | 受理するか決める。通らないものは仕様へ入れない | 使わない |
| `assemble()` | 枠へはめて MockSpec を作る。配点は枠の値 | 使わない |
| `verify()` | 計画どおりか。違えば未完成 | 使わない |

### なぜこれで直るのか

- **作りすぎ** — 枠は `plan()` で確定している。枠を超えた設問は入る場所が無い。
  捨てた数は `overGenerated` に数えて残す（黙って捨てない）。
- **満点ズレ** — 配点は `plan()` が `allocateIntegers` で満点ぴったりに割り当て、
  `assemble()` は**その値をそのまま使う**。AI が書いてきた `points` は読まない。
- **保存できない試験** — `gate()` の基準を `validate.js` の保存規則とそろえてある。
  門を通ったのに保存できない、が起きない。
- **やり直しが重い** — 足りない枠**だけ**を名指しで頼み直す。
  できている設問は作り直さない（V1 は大問ごと作り直していた）。

---

## 3. 実装したもの

| ファイル | 中身 | 状態 |
|---|---|---|
| `client/v2/domain/mock-compiler.js` | plan / requestsOf / gate / assemble / verify / Metrics | 実装・テスト済 |
| `client/v2/domain/mock-compile-run.js` | 実行の層（AI 呼び出し・再依頼・同時実行制御） | 実装・テスト済 |
| `vqmockcompile.cjs` | 決定論の層のテスト **42 件** | 全通過 |
| `vqmockrun.cjs` | 実行の層のテスト **33 件** | 全通過 |

どちらのテストも**モデルを 1 回も呼ばない**。ブラウザも使わない。
だから毎回同じ結果になり、AI を使うテストと同時に走らせても取り合わない。

### テストが押さえている失敗（すべて V1 で実際に起きたもの）

- 336 通りの条件で「合計＝満点」「大問の点＝その大問の設問の和」
- 4 問の枠に 48 問返してきても、試験に入るのは 4 問
- 正誤問題に選択肢 3 つ → 不受理（保存時に弾かれる形を作らせない）
- `fileName` の無い出典 → 出典なしとして不受理
  （`mapSources` が捨てるので、件数だけ見ると仕様と食い違う）
- 解説・正解・選択肢の欠落 → 不受理 → **足りない枠だけ**再依頼
- 依頼が 1 件失敗しても、他の大問は残る
- 埋まらないまま終わったら `complete: false`。**警告だけ出して完成扱いにしない**
- 同時実行数を超えない

### 計測（GenerationStageMetric）

`C.Metrics` が工程ごとに残す。

```
counts : requested / generated / accepted / discarded / retried / failed
tokens : prompt / completion / modelCalls
stages : 工程ごとの回数と合計時間
timeline: 1 件ずつの startedAt / durationMs
openStages: 閉じ忘れた工程（隠さない）
```

---

## 4. まだやっていないこと

**ここから先は未着手。「対応済み」と書いてはいけない。**

1. **UI への結線** — `quick-mock.js` はまだ V1 の `runGenerate()` を使う。
   V2 を使うフラグ（`quickMockCompilerV2`）も未追加。
2. **`AI.generateQuestions` の実装** — `mock-compile-run.js` の `generate` は
   差し替え可能にしてあるが、実際に Bridge を呼ぶ実装はまだ無い。
   `promptFor()` が作る依頼文を `structuredOutput: "mock"` で投げるだけの薄い層になる予定。
3. **実 AI での 1 回通し** — V2 の実測値はまだ 1 つも無い。
   `artifacts/quick-mock-v1-baseline/metrics.json` と同じ形で取ること。
4. **同時実行数の実測** — `DEFAULT_CONCURRENCY = 2` は
   Quick Chat での実測（2 なら 5 人成功 / 5 で 1 人固まる / 10 で 7 人失敗）から置いた**仮の値**。
   Quick Mock の依頼は 1 件が小さいので、別に測り直すこと。
5. **資料を 1 回だけ渡す仕組みの検証** — サーバ側に `source_digest` があるが、
   実際に何回渡っているかは未計測。

---

## 5. 動かし方

```bash
node vqmockcompile.cjs     # 決定論の層（数秒・AI 不要）
node vqmockrun.cjs         # 実行の層（数秒・AI 不要）
node client/v2/build-v2.mjs  # client/index.html へ注入し直す
```

`client/v2/domain/*.js` を触ったら `build-v2.mjs` を必ず走らせる。
走らせないと画面には反映されない。

---

## 6. UI への結線（2026-07-27 夜）

`quickMockCompilerV2` フラグ（既定 ON）で `runGenerate()` が V2 経路へ入る。
V1 は消していないので、フラグを落とせば元に戻る。

- `client/v2/ui/ai.js` に `generateQuestions()` を追加（枠のぶんだけ中身を書かせる）
- `client/v2/ui/quick-mock.js` に `runGenerateV2()` を追加
- `client/v2/domain/flags.js` に `quickMockCompilerV2`

### 結線して見つかった実バグ（2件・修正済み）

1. **同時実行で BUSY になる** — `VQ2.ai.run()` は「いま走っている 1 件」しか持てず、
   2 件目はモデルへ届く前に落ちる（実測: 1件目成功 / 2件目 BUSY）。
   `DEFAULT_CONCURRENCY` を 2 → **1** に修正。テストで固定した。
   上げたいなら先に `ai.js` を複数同時対応にすること。
2. **依頼の失敗理由を握り潰していた** — 「0 問できました」としか分からず、
   原因を探すのに実測からやり直すことになった。`result.errors[]` に残すよう修正。

### 実 AI での確認（**未完了**）

`node vqmockv2.cjs` を実行中に本セッションが終了した。**V2 が実 AI で正しく動くことは
まだ確認できていない。** 次のセッションで必ず取り直すこと。

途中経過（`node vqload.cjs 1 stages`）で見えていること:

- `worker.mock` p50 **69秒** / p95 177秒
- V2 は 30 問を 3 問ずつ **10 依頼**に分ける。V1 は 6 問ずつ **4〜5 依頼**だった。
  依頼が増えるぶん `schema.validate` / `evidence.verify` / `draft.revise` の
  **1 依頼あたりの固定費を余計に払っている**（`draft.revise` が 10 回で 4.5 分）。
- → `DEFAULT_BATCH = 3` は見直しの余地がある。**測ってから決めること。**

### 次にやること

1. `node vqmockv2.cjs` を最後まで通し、`node vqmockv2.cjs v1` と比べる
2. `DEFAULT_BATCH` を 3 / 5 / 6 で測り、依頼数と固定費のつり合いを決める
3. プリセット生成の前後比較（fastMock=0 の 4 件だけ取れている: 37 / 50 / 70 / 142 秒）
