# VocabuQuiz UI Studio

VocabuQuizの**唯一のUI基準**となるデザインシステム兼UI開発環境。
v0.2 “Bloom”: 白 × 柔らかいラベンダー（#756DB3）のモバイルファースト学習アプリとして全面リニューアル。
今後のVocabuQuizのすべての画面・コンポーネント・アニメーション・レスポンシブ設計はここを参照して作る。

```
npm install
npm run dev      # http://127.0.0.1:5173
npm run build    # dist/ に静的ビルド（どこでも配信可）
npm run build:single  # ダブルクリックで開ける単一HTML（VocabuQuiz-UI-Studio.html）
```

## 中身

- **Overview** — 使い方・デザイン原則・更新履歴
- **Foundations** — Colors / Typography / Spacing / Radius / Shadows / Motion / Icons / Layout / A11y
- **Components** — 実際に操作できる約40コンポーネント（全variant・全state・日本語長文）
- **Patterns** — 認証・App Shell・状態設計・フォーム・祝福演出の組み立て方
- **Screens** — 本体そのままの20画面（Splash & Intro〜Admin）をデバイス幅つきでプレビュー
- **Playground** — Motion Lab / Responsive Lab / 日本語ストレステスト / Theme Lab

ツールバー: デバイス幅(375〜1728px)・Light/Dark・密度・JA/EN・お気に入り・⌘Kパレット・フルスクリーン。

## ドキュメント（docs/）

| ファイル | 内容 |
|---|---|
| UI_IMPLEMENTATION_RULES.md | 実装規約18条 + PRチェックリスト |
| DESIGN_SYSTEM.md | トークン体系・テーマ・ドメイン色の固定対応 |
| COMPONENT_REGISTRY.md | 登録済みコンポーネント台帳 |
| MOTION_GUIDELINES.md | モーション実装ガイド |
| RESPONSIVE_GUIDELINES.md | コンテナクエリ・モバイル変換の定石 |
| SCREEN_RECIPES.md | 画面ごとの組み立てレシピ |
| MIGRATION_GUIDE.md | 既存本体（client/index.html）への段階移行手順 |

## 技術

React 18 + TypeScript + Vite。ルーティングはハッシュベース（静的配信でも戻る/進むが完全動作）。
スタイルはCSS Variables（tokens.css が唯一のソース）+ コンテナクエリ。チャート配色はCVD 6チェック検証済み。
