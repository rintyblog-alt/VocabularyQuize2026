# DESIGN_SYSTEM — VocabuQuiz デザインシステム概要

## アイデンティティ

- **性格**: 親しみやすい・清潔・やさしい・安心。学習に集中でき、高校生が毎日使えて、幼児向けにも業務用にも見えない。
- **ブランドカラー**: Lavender `--vq-lav-600 #756DB3` を核とする14段スケール（hover #6961A8 / active #5F579E / soft #EAE8F7 / subtle #F4F2FB）。
- **背景**: 完全な白ではなく、ごくわずかにラベンダーを含む白 `#FCFBFE`。カード・フォームは白。
- **メタファー**: 「陽の入る自習スペース」。UIは柔らかい黒子で、コンテンツ（問題・学習データ）が主役。
- **アンチリファレンス**: 強い青紫グラデーション、ネオン・発光、画面全体を紫に塗る、全カード薄紫、業務ダッシュボード風の重厚さ。
- **イラスト**: `src/ui/illustrations.tsx` の自前フラットSVG 20種のみ（--vq-il-* トークンでテーマ追従）。外部画像・絵文字アイコンは禁止。

## レイヤー構造

Background（`--vq-bg`）→ Surface（`--vq-surface` カード）→ Text/Object。
重なりは影ではなく背景階調で表現し、影は floating 以上の一時要素に限定。

## トークン体系（tokens.css が唯一のソース）

| 分類 | トークン | 備考 |
|---|---|---|
| 背景 | `bg / bg-subtle / bg-elevated / bg-canvas` | |
| サーフェス | `surface / -hover / -active / -selected / -disabled / -sunken / -overlay` | |
| 枠線 | `border / -subtle / -strong / -focus` | |
| テキスト | `text / -secondary / -tertiary / -disabled / -inverse / -link` | AA準拠 |
| アクセント | `accent / -hover / -active / -subtle / -subtle-hover / -text / -contrast` | |
| 状態 | `success / warning / danger / info`（各 + `-bg` `-text`） | |
| ドメイン | `quiz-correct / quiz-incorrect / quiz-unanswered / favorite / ai(-text) / qredit(-fill) / admin / social` | 全画面で固定 |
| ベタ塗り上の文字 | `solid-ink / accent-contrast` | ダークでは暗色に切替（白直書き禁止） |
| イラスト | `il-blob / il-a / il-b / il-c / il-d / il-e / il-paper / il-ink / il-line` | SVGイラスト専用 |
| チャート | `chart-1〜6 / chart-grid` | CVD 6チェック済（light/dark別） |
| タイポ | `type-display 〜 type-code` 12種 | 日本語 lh1.8 |
| 余白 | `sp-1〜13`（2〜80px） | |
| 角丸 | `r-xs(6) sm(10) md(14) lg(18) xl(22) 2xl(28) full` | ボタン/入力=md, カード=lg, シート上端=2xl |
| 影 | `shadow-subtle / raised / floating / modal / accent / focus-ring` | |
| 時間 | `dur-instant(0) fast(120) normal(200) slow(300) deliberate(420)` | |
| イージング | `ease-standard / enter / exit / spring` | |
| レイアウト | `sidebar-w / topbar-h / bottomnav-h / content-max / tap-min(44px)` | |
| 密度 | `control-h-sm/md/lg, field-px, card-p`（`data-density="compact"` で縮む） | |

## テーマ

- `:root[data-theme="dark"]` で全セマンティックトークンを再定義（自動反転ではなくダークラベンダーの選定値: bg `#17161D` / surface `#211F29` / border `#393543` / text `#F5F2FA` / primary `#A59BE0`）。
- 純黒・純白は使わない。ダークの影は弱め、サーフェス階調で層を出す。
- ダークの Primary は明色のため、ベタ塗り上の文字は `--vq-accent-contrast`（暗色）を使う。
- チャートはダーク専用6色に切替（surface #211F29 で 6チェック再検証済み）。

## ドメイン色の固定対応

| 意味 | 色 | アイコン |
|---|---|---|
| 正解 | soft green `--vq-quiz-correct #4E8F6B` | check |
| 不正解 | soft red `--vq-quiz-incorrect #C25B5B` | x |
| 未回答 | lavender gray `#B6B1C2` | – |
| お気に入り | amber `--vq-favorite #E6A753` | star (fill) |
| いいね | rose `--vq-social #C95E85` | heart (fill) |
| AI | violet `--vq-ai #8175BD` | sparkles |
| Qredit | gold `--vq-qredit`（文字= #9C6A1B / 塗り= `-fill #D69A4D`） | coins |
| 管理 | plum `--vq-admin` | shield |

この対応は**全画面で不変**。入れ替え・流用は禁止。

## ファイル構成

```
ui-studio/src/
  ui/styles/tokens.css      … トークン（唯一のソース）
  ui/styles/base.css        … reset・タイポ・focus・keyframes・reduced-motion
  ui/styles/components.css  … コンポーネントCSS（.vq-*）
  ui/components/            … Reactコンポーネント（本体へ移植可能）
  features/screens.css      … 製品画面CSS（.qz-*、コンテナクエリ）
  features/                 … 製品画面実装
```
