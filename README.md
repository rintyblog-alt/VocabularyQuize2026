# VocabuQuiz Public Deploy (GitHub Pages)

このリポジトリは静的公開前提です。APIキー等の公開値は `index.html` に直書きせず、`config.public.js` で注入してください。

## 公開設定ファイルの使い方

1. `config.public.example.js` を `config.public.js` にコピーする。
2. `config.public.js` のプレースホルダを実値に置き換える。
3. `config.public.js` は `.gitignore` 済みなのでコミットしない。
4. GitHub Pages へ公開する際は、公開先のファイルに `config.public.js` を配置する。

`index.html` は以下の順で設定を読み込みます。

- `config.public.js` (`window.__PUBLIC_CONFIG__`)
- `meta` タグのプレースホルダ（フォールバック）

どちらも未設定の場合、該当機能（Firestore共有 / EmailJS送信）は画面内エラーで停止し、他機能は継続動作します。

## Google Cloud キー制限（必須）

Firebase / Google Cloud で公開キーを使う場合は、必ず以下を設定してください。

1. アプリケーション制限: `HTTP リファラー` に設定し、GitHub Pages の自ドメインだけを許可する  
   例: `https://<user>.github.io/*` または `https://<user>.github.io/<repo>/*`
2. API の制限: このアプリで必要な API だけを許可する（不要 API は拒否）
3. 漏洩時対応: キーを削除またはローテーションし、影響範囲を確認する

## 追加セーフガード（任意）

- pre-commit でシークレット検出（例: `gitleaks`）を有効化し、キー文字列が含まれるコミットを拒否する

## アイコン / PWA更新後の確認（GitHub Pages）

ブラウザや端末はアイコンを強くキャッシュするため、更新後は以下を実施してください。

1. ブラウザでハードリロード（`Shift + Reload` など）
2. DevTools を開いて `Application` / `Manifest` でアイコン反映を確認
3. ホーム画面追加済みの場合はいったん削除して、再度「ホーム画面に追加」
4. 反映しない場合は数分待って再度確認（CDNキャッシュ反映待ち）

## Scan API デプロイ手順（Cloudflare Workers）

`/api/scan/generate` の修正を反映する場合は、Worker を再デプロイしてください。

```bash
cd server
wrangler deploy
```

デプロイ後、`https://vocabuquiz-api.rintyblog.workers.dev/api/scan/generate` へ `multipart/form-data`（`image` + `options`）でリクエストしてください。

## VocabuSurvival（3Dオンライン対戦）

`/survival` 配下で VocabuSurvival を起動できます（`/survival`, `/survival/lobby/:roomCode`, `/survival/game/:roomCode`）。

### ローカル起動

1コマンドで起動する場合（bash/zsh）:

```bash
(cd server && wrangler dev) & python3 -m http.server 8080
```

終了時は `Ctrl+C` の後に `pkill -f "wrangler dev"` を実行してください。

1. ターミナルAで Worker を起動

```bash
cd server
wrangler dev
```

2. ターミナルBで静的ファイルを配信

```bash
cd ..
python3 -m http.server 8080
```

3. ブラウザで `http://localhost:8080` を開き、左メニュー `VocabuSurvival` から入室

### 2人対戦の確認手順

1. タブAでログインして `VocabuSurvival` を開き、ルーム作成  
2. タブB（同ブラウザ別プロファイル推奨）で同じルームID/PWで参加  
3. ロビーでプリセット・マップ（16種）・問題数を設定し、両者 `Ready`  
4. ホストが開始して、3D上でゲート到達→クイズ回答→正誤効果（加点/減速）を確認  
5. 最終ラウンド終了後に順位表・勝者表示を確認

### API（Survival用）

- `GET /api/survival/presets`
  - built-in とログイン中ユーザーの custom preset を返却
- `GET /api/survival/presets/:id/questions?count=20`
  - 出題用問題を返却（正解は含めない）
  - `custom:*` は認証必須

## 家庭科プリント（10枚）生成データ

家庭科プリント（第8章/第9章の10枚）から作成した標準プリセット用データを `exports/` に出力済みです。

- `exports/standard_housework_20260301.json`
  - 問題データ本体（`presetId`, `questions[]`）
- `exports/standard_housework_20260301.csv`
  - CSV形式（`sourcePrintNo,difficulty,question,choiceA..D,answer,explanation`）
- `exports/standard_housework_20260301_vocabuquiz_preset.json`
  - VocabuQuiz取り込み用（`name,modes,subjectId,tagIds,words[]`）

### 取り込み方法（手動）

1. アプリで `プリセット管理` を開く  
2. `JSONインポート`（または同等の読み込み機能）を選択  
3. `exports/standard_housework_20260301_vocabuquiz_preset.json` を読み込む  
4. 読み込み後、`MYプリセット` に「家庭科 標準プリセット（プリント10枚）」が追加されることを確認

## Learning Workspace V2

教材 → AI生成 → 検証 → 編集 → 保存 → 受験 → 採点 → 分析 → 復習 → FEED共有 を
VocabuQuiz 内で完結させる基盤（Feature Flag 配下・既定 ON）。
入口は左サイドバーの「Learning Workspace」。ON/OFF は 設定 →「Learning Workspace」。

- [概要・結線・ロールバック](client/v2/docs/LEARNING_WORKSPACE_V2.md)
- [共通ドメインモデル](client/v2/docs/DOMAIN_MODEL.md)
- [紙面エンジン](client/v2/docs/PDF_ENGINE.md)
- [テストと性能の実測記録](client/v2/docs/TEST_REPORT.md)

```bash
node client/v2/build-v2.mjs           # 生成して client/index.html へ注入
node client/v2/build-v2.mjs --remove  # 注入を取り除く（V1 のみへ）
```

無効化は `?vq2=off`、再有効化は `?vq2=all`。

```bash
node vq2entry.cjs    # 導線（入口が実際に見えているか）
node vq2mobile.cjs   # モバイル（390px / 320px の横あふれとタップ領域）
node vq2studio.cjs   # プリセット編集（モーダル重複・会話履歴・作業ログ・採点基準・実 AI 採点）
node vq2mock.cjs     # Quick Mock（AI パネルの統一・問題の不備・解答欄・分割生成）
node vq2stress.cjs   # Quick Mock の耐久性（資料をたくさん入れても通るか）
node vq2e2e.cjs      # 実ブラウザ・実モデルの通し検証
```

> AI を使うテストは**同時に 1 本だけ**走らせること。ローカル AI の同時実行は 1 件までなので、
> 2 本並べると生成系が 429 で落ちる。
