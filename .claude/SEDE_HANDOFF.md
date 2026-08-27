# Sede 開発引き継ぎ（2026-04-04 深夜更新）

## 次回セッション（04-04 14:00〜）の予定
- **Fix v2 の実戦テスト** — 小規模fix + 大規模fix の動作確認
- **品質向上** — 生成コードが確実に機能するように
- **大規模改修を大量に回す**

## セッション3-4の成果（04-03夜〜04-04深夜）

### 並列生成v2（`/parallel`）
- **エンドポイント**: `POST /api/sede/parallel-gen` → `handleSedeParallelGen()`
- **フロー**: Phase 1(HTML) → Phase 2(CSS+JS並列) → Phase 3(結合) → Phase 3.5(ハンドラ突合) → Phase 4(自動テスト)
- **実績**: 5379行/15分、1843行/7.6分、機能するTodoアプリ生成成功
- **行数制御**: ユーザー指定からHTML:25%/CSS:35%/JS:40%に自動配分

### Fix v2（`/fix` → `/api/sede/fix-v2`）— 未テスト
- **小規模fix**: コード分離 → 対象パート特定 → パート丸ごと書き直し → 再結合
- **大規模fix**: コード分離 → CSS+HTML+JS 3並列修正 → 再結合
- **分類AI**: Llama 3.1でsmall/large自動判定
- **安全弁**: 修正後が元の50%未満なら拒否
- **`_splitCode`**: `lastIndexOf`方式（regex→位置検索に変更済み）
- **注意**: 深夜帯で実テストできず。14:00からテスト予定

### プレビューコンソール
- `_sedeOpenPreview` にconsole.log/warn/errorキャプチャ追加
- JSエラー時にコンソール自動表示
- iframe: srcdoc方式（localStorage対応）

### 深夜帯バナー
- JST 1:00〜6:30に生成開始するとバナー表示
- ✕ボタンで手動消去、生成完了で自動消去

### 重要なモデル設定
```javascript
const KIMI_K2_MODEL = "@cf/moonshotai/kimi-k2.6";        // メイン生成
const KIMI_K2_MAX_TOKENS = 65536;
const SEDE_CHAT_MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8-fast"; // 会話ログ（Llama）
const SEDE_MODEL_GLM = "@cf/zai-org/glm-4.7-flash";      // 非推奨（content:null問題）
const _STREAM_TIMEOUT = 1800000;  // 30分
// チャンクタイムアウト: 300000 (5分)
```

### 変更ファイルの重要箇所
**server/src/worker.js**
- `_splitCode()` / `_mergeCode()`: コード分離・再結合
- `handleSedeFixV2()`: Fix v2ハンドラ
- `handleSedeParallelGen()`: 並列生成v2
- `_glmText()`: AI応答パーサー（content/reasoning_content対応）
- ルーティング: `/api/sede/fix-v2`, `/api/sede/parallel-gen`

**client/index.html**
- `_sedeFixV2()`: Fix v2クライアント
- `_sedeParallelGen()`: 並列生成クライアント
- `_sedeOpenPreview()`: プレビュー+コンソール
- `_sedeSetBusy()`: 深夜帯バナー
- `parseMarkdown()`: 簡易マークダウンフォールバック

### 既知の問題・残課題
1. **Fix v2が未テスト** — 深夜帯で遅すぎてテストできず
2. **会話ログの日本語品質** — Llamaが時々不自然
3. **`/parallel`をデフォルトcreateに統一** — 品質安定後
4. **プレビューコンソール** — 動作確認済みだがフル活用は次回
5. **GLM Flash** — content:null + reasoning_content問題。並列生成の会話ログはLlamaに移行済み。quick-fix側はGLM残存

### 重要な発見
- **iframe sandbox + Blob URL = localStorage使用不可** → srcdoc変更で解決（機能しない根本原因だった）
- **GLM Flash: content:null** → reasoning_contentに英語出力。Llama 3.1に切替
- **`_splitCode`のregex問題** → JS内の`<\/script>`でregex壊れる → lastIndexOf方式に変更
- **Fix v2の安全弁が重要** — AIが修正部分だけ出力してコード縮小する問題あり
