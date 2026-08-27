# UI_IMPLEMENTATION_RULES — VocabuQuiz UI実装規約

> 対象: VocabuQuizのUIを実装するすべての人間とAIエージェント。
> このファイルはUI Studio（`ui-studio/`）とセットで機能する。迷ったらStudioの実物が正。

## 絶対規則（18条）

1. **UI Studioが唯一の基準。** 新しいUIは必ず `ui-studio/` のトークン・コンポーネント・パターンから組み立てる。
2. **既存VocabuQuizの旧UI（client/index.html の既存スタイル）を模倣しない。** 移行は MIGRATION_GUIDE.md に従う。
3. **登録済みコンポーネントを優先。** ボタン・入力欄・モーダル・トーストを画面内で再実装しない。不足時はまず `src/ui/components/` に追加し、カタログページを書いてから使う。
4. **色を画面固有に追加しない。** すべて `var(--vq-*)`。新しい色が必要なら tokens.css に意味を定義してから。
5. **角丸を画面固有に追加しない。** `--vq-r-xs〜full` の6段のみ。
6. **影を画面固有に追加しない。** `--vq-shadow-subtle/raised/floating/modal` の4段のみ。
7. **アニメーション時間を画面固有に追加しない。** `--vq-dur-*` 5段 + `--vq-ease-*` 4種のみ。
8. **絵文字をUIアイコンとして使わない。** アイコンは lucide-react、意味の対応は Foundations > Icons で固定（AI=sparkles、Qredit=coins、お気に入り=star）。
9. **モバイル対応は必須。** コンテナクエリ `@container vq-screen (max-width: …)` で書く。PC縮小版は不可。グリッドの子には `min-width: 0` を忘れない。
10. **Loading / Empty / Error 状態は必須。** 3状態のない一覧・詳細はレビューを通らない。Skeletonは実レイアウトと同形にする。
11. **アクセシビリティ必須。** ラベル関連付け（Fieldを使う）、IconButtonのaria-label、`:focus-visible`リング、色以外の状態表現、`prefers-reduced-motion`対応。
12. **UI変更時はStudioも更新。** コンポーネントを変えたらカタログページとRelease Notesに反映。Studioと実装がズレたらStudioが正。
13. **ページ固有CSSは最小限。** レイアウト調整のみ許可。コンポーネントの見た目の上書きは禁止（variantを追加する）。
14. **コンポーネントの重複禁止。** 同じ意味のUIを2つ作らない。似た要件は既存のvariant/propsを拡張する。
15. **既存variantで実現できるなら新variantを追加しない。**
16. **無意味なガラス表現・グラデーションを追加しない。** backdrop-blurはオーバーレイと固定バーのみ。グラデーションはブランド要素（ロゴ・カバー・Card3D）のみ。
17. **アニメーションは意味のあるフィードバックのみ。** 装飾の常時アニメーション禁止。唯一の例外はローディングスピナー。
18. **日本語の長文表示を必ず確認。** 出荷前に Playground > Japanese Text Test の観点（長文タイトル・長いエラー・0件/9,999件・混在文）でチェック。

## 実装チェックリスト（PR前）

- [ ] 生のHEX・px角丸・独自影・独自durationを追加していない（`git diff` で `#[0-9a-f]{6}` を検索）
- [ ] Loading / Empty / Error を実装した
- [ ] 390px幅で横スクロールが発生しない（`scrollWidth === clientWidth`）
- [ ] Tabキーだけで全操作できる・フォーカスリングが見える
- [ ] ダークモードで視認できる（テーマ切替して確認）
- [ ] 数値表示に `.vq-num`（tabular-nums）を使った
- [ ] 長い日本語タイトルで崩れない（`vq-truncate` / `vq-clamp-2`）
- [ ] Studioのカタログ/Release Notesを更新した
