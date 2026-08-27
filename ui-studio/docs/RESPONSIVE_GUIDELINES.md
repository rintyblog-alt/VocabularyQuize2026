# RESPONSIVE_GUIDELINES — レスポンシブ実装ガイド

## 前提: コンテナクエリで書く

製品画面は viewport ではなく**コンテナ幅**に応答する（`container: vq-screen`）。
Studioのデバイス切替・フルスクリーン・本体埋め込みのすべてで同じ挙動になる。

```css
.qz-something { grid-template-columns: 2fr 1fr; }
@container vq-screen (max-width: 899px) {
  .qz-something { grid-template-columns: 1fr; }
}
```

## ブレークポイント（4つだけ）

| 名前 | 幅 | 主な変化 |
|---|---|---|
| small mobile | 〜389px | 最小余白・チップ3列・topbar番号のみ |
| mobile | 390–767px | 1カラム / Bottom Nav / モーダル→Bottom Sheet / テーブル→カード |
| tablet | 768–1023px | 2カラム→1.5カラム / サイドバー→ドロワー / 右パネル非表示 |
| desktop | 1024px〜 | フルレイアウト |

境界値はコンポーネント都合で ±40px 調整可（例: shell は 899px）。**5個目のブレークポイントを作らない。**

## PC→モバイル変換の定石

| PC | モバイル | 実装 |
|---|---|---|
| 左サイドバー | Bottom Navigation（5項目） | AppFrame が自動切替 |
| モーダル | Bottom Sheet（つまみ付き・下から） | Modal が自動切替 |
| データテーブル | 主要3項目のカードリスト | 一覧側で分岐 |
| 右補助パネル | 非表示 or 画面遷移 | `.qz-feed__aside { display:none }` 方式 |
| ホバーメニュー | 常時表示ボタン | ホバー依存のUIを作らない |
| 複数ペイン(Sede) | 1カラム+切替 | grid-template再定義 |

## 必須チェック

1. **横スクロール禁止**: `document.documentElement.scrollWidth === clientWidth` を390pxで確認。
   - 頻出原因: grid/flexの子に `min-width: 0` がない・長い日本語+nowrap。
2. **タップ領域 44px**: 見た目が小さくても padding で `--vq-tap-min` を確保。
3. **Safe Area**: 下部固定要素は `env(safe-area-inset-bottom)` を加算（qz-bottomnav 実装参照）。
4. **キーボード**: 入力にフォーカス中はBottom Navを隠す（本体実装時 `:has(:focus)` か visualViewport で対応）。
5. **長い日本語**: 全テキストコンテナに `overflow-wrap: anywhere`（base.cssで既定）。1行制限は `vq-truncate`、2行は `vq-clamp-2`。
6. **固定ヘッダ**: sticky + blur背景（qz-topbar）。スクロールで内容が透けないこと。

## 検証手順
1. Studioツールバーで 375 / 390 / 430 / 768 / 1024 / 1280 / 1440 を一巡
2. Playground > Responsive Lab のスライダーで連続変化を確認（レイアウトが跳ねないか）
3. フルスクリーンプレビュー + 実機のSafari/Chromeで最終確認
