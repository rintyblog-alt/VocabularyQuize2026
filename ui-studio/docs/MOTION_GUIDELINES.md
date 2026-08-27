# MOTION_GUIDELINES — モーション実装ガイド

## 原則
モーションは**状態変化のフィードバック**。装飾で動かさない。常時アニメーションはローディングスピナーのみ。

## トークン（これ以外の時間・イージングを書かない）

| 用途 | duration | easing |
|---|---|---|
| ホバー・押下・色変化 | `--vq-dur-fast` 120ms | `--vq-ease-standard` |
| メニュー・ツールチップ出現 | `--vq-dur-normal` 200ms | `--vq-ease-enter` |
| モーダル・ドロワー・ページ遷移 | `--vq-dur-slow` 300ms | enter（出現）/ exit（退出 180ms目安） |
| スコア表示・祝福・初回演出 | `--vq-dur-deliberate` 420ms〜 | standard / spring |
| チェック・いいね等の「喜び」 | 300ms | `--vq-ease-spring`（乱用禁止） |

## 定型キーフレーム（base.css 定義済み・再定義禁止）
`vq-fade-in / vq-fade-up / vq-fade-down / vq-scale-in / vq-slide-left / vq-slide-right / vq-spin / vq-pulse / vq-shimmer / vq-pop / vq-shake / vq-sheet-up`

## 決まりごと

1. **出現は「下から8px + フェード」**（vq-fade-up）。大きな移動距離（>24px）は使わない。
2. **方向つき遷移**: 進む=右から入る（slide-left）、戻る=左から入る（slide-right）。ブラウザ/アプリ内の戻ると一致させる。
3. **モーダル**: enter = scale 0.96→1 + fade 300ms。exit = 逆再生 180ms。モバイルは sheet-up（上端 r-2xl・つまみ付き）。
4. **トースト**: spring in / exit out。位置は下部中央固定。
5. **リストのstagger**: 60ms間隔・最大6項目まで。それ以上は一括表示。
6. **クイズ**: 正解=vq-pop(300ms spring)+緑+check / 不正解=vq-shake(400ms)+赤+x。色だけに頼らずアイコン・文言併記。解説はfade-up。
7. **スコア**: useCountUp（1.1s, cubic ease-out）。数値は必ず tabular-nums。
8. **祝福**: 結果80%以上または自己ベストのみ。控えめな紙吹雪26片・2.4s・1回（qz-confetti）。ゲーム的な過剰演出は禁止。
10. **オンボーディングのみ**: イラストの微浮遊（qz-ob-float 4.5s）を許可。それ以外での常時アニメは禁止。
9. **ホバーで浮くカード**: translateY(-1px) + shadow-raised まで。それ以上浮かさない。

## Reduced Motion（必須）
- `prefers-reduced-motion: reduce` と `:root[data-motion="off"]` で全アニメーション・トランジションが 0.01ms に短縮される（base.cssでグローバル処理済み — 個別対応は不要だが、**動きが消えても情報が伝わる設計**にすること）。
- JSアニメ（useCountUp等）は自前で reduced を検知して即値表示する。新しいJSアニメを書くときも同様に。

## 実装パターン

```css
/* 出現 */
.my-panel { animation: vq-fade-up var(--vq-dur-slow) var(--vq-ease-enter); }
/* ホバー */
.my-card { transition: box-shadow var(--vq-dur-normal) var(--vq-ease-standard); }
```

検証は Playground > Motion Lab で。パラメータを変えて体感→トークンに合う値へ丸める。
