# MIGRATION_GUIDE — VocabuQuiz本体への移植ガイド

> 目的: UI Studioの成果物を、既存のVocabuQuiz本体（client/index.html 単一ファイルSPA）へ安全に段階移行する。

## 移植できるもの（そのまま持ち出し可能）

| 資産 | 場所 | 依存 |
|---|---|---|
| デザイントークン | `src/ui/styles/tokens.css` | なし（純CSS） |
| ベース/コンポーネントCSS | `src/ui/styles/base.css` `components.css` | tokens.css |
| 画面CSS | `src/features/screens.css` | 上2つ |
| Reactコンポーネント | `src/ui/components/*` | react / lucide-react |
| hooks | `src/ui/hooks.ts` | react |
| 画面実装 | `src/features/*` | 上すべて + mocks |
| ドキュメント | `docs/*` | なし |

## 移行戦略（推奨: Strangler方式）

既存本体はReactなし・単一HTML。**一括置換はしない。** 新画面から順にStudio基準で作り、旧画面を段階的に置き換える。

### Phase A — トークンの先行導入（本体変更ゼロに近い）
1. `tokens.css` + `base.css` の内容を `client/index.html` の `<style id="vq-ds-tokens">` として先頭に追加。
2. 既存CSSと衝突しない（すべて `--vq-*` 変数と `.vq-*` クラスの追加のみ）。
3. 以後の新規UIは `var(--vq-*)` を参照して書く。

### Phase B — 新画面をReactアイランドで追加
1. 本体にReactを導入する場合: vite buildの成果物（IIFE/ESM）を `<script type="module">` で読み込み、`<div id="vq-island-xxx">` にマウント。
2. Reactを導入しない場合: `components.css` のクラス（`.vq-btn` 等）はプレーンHTMLでもそのまま機能する。JSが必要な部品（Modal/Toast）は既存のJSから同クラスを操作して使う。
3. **どちらの場合もクラス名・トークン名はStudioと同一に保つ**（将来の完全移行のため）。

### Phase C — 認証・主要画面の置換
1. 置換順の推奨: Welcome/Auth → Home → Library → Player/Results → その他。
2. 各置換で既存のJS契約（element ID・イベント・localStorageキー・API呼び出し）を**変更しない**。見た目の層だけを差し替える。
3. 置換前に旧ブロックを `@supports (-vq-legacy:disabled){}` で包んで無効化（可逆）。バックアップ必須。

### Phase D — 完全移行
旧CSSブロックの削除。Studioの `src/ui` + `src/features` を本体のソースオブトゥルースにする。

## 移植時の禁止事項
- トークン値を本体側で「ちょっと調整」しない（変えるならStudio側を変えて逆輸入）。
- 旧デザインの部品（旧ボタン・旧モーダル）と新部品を同一画面に混在させない。画面単位で切り替える。
- クラス名の改名（`.vq-btn`→`.button` 等）をしない。grep可能性が移行の生命線。

## 動作要件
- コンテナクエリ（Safari 16+ / Chrome 105+）・`color-mix()`（Safari 16.2+ / Chrome 111+）を使用。
  既存ユーザー層（現行iOS/Android/PCブラウザ）では問題ないが、古いWebView埋め込みがある場合はPostCSSでフォールバックを生成する。

## デプロイ（Studio自体）
```
cd ui-studio && npm run build     # → ui-studio/dist
# 本体と同居配信する場合:
cp -r dist ../client/studio       # → https://…/studio/ で配信（wrangler deployはserver/から）
```
