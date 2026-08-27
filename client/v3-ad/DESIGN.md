# VocabuQuiz V3 — シネマティック広告 実装契約書

これは `/v3-ad/` 配下の全ファイルが従う唯一の契約。実装者はまずこれを全部読むこと。

## 0. 完成物

90 秒のシネマティック Web 広告。宇宙空間（漆黒＋星＋青とピンクの発光流線）を旅しながら
VocabuQuiz V3 の 5 つの機能ロケーションを巡り、最後に新アイコンへ収束して終わる。
録画してそのまま動画になる品質。LP ではない。管理画面にも見せない。

- 配信: `http://127.0.0.1:8791/v3-ad/index.html`（client/ が Web ルート）
- 外部ネットワーク禁止。CDN 禁止。フォントはシステムフォント
  （Inter, Hiragino Sans, Hiragino Kaku Gothic ProN, Noto Sans JP, sans-serif）
- ビルド工程なし。**素の JS（IIFE・classic script）**。ES modules 不可
- 本体アプリ（client/index.html）には一切触れない

## 1. ファイル分担（自分のファイル以外を書き換えない）

| ファイル | 中身 | 担当 |
|---|---|---|
| index.html / ad.css / main.js | 骨組み・トークン・シーン表・起動 | 統合者（書き換え禁止） |
| space.js | 宇宙背景エンジン（Canvas 2D ×2枚） | 実装 A |
| timeline.js + timeline.css | タイムラインエンジン＋再生コントロール | 実装 B |
| scenes-a.js + scenes-a.css | Scene 1 Opening / 2 Presets / 3 Quick Mock | 実装 C |
| scenes-b.js + scenes-b.css | Scene 4 Player / 5 VocabuSpeak / 6 Insight | 実装 D |
| finale.js + finale.css | Scene 7 Finale（新アイコン誕生） | 実装 E |

CSS クラスは衝突防止のため接頭辞必須: 共通 `vqad-` / シーンは `s1-`〜`s7-`。

## 2. 共通ランタイム（index.html が先に定義済み）

```js
window.VQAD = {
  rng,                 // 種固定の乱数 0..1。Math.random は使用禁止（録画の再現性）
  clamp01(v), lerp(a,b,t), ease: { inOut(t), out(t), outBack(t) },
  span(local, start, end),   // local 秒が start..end のどこか → 0..1（外は 0/1 に張り付く）
  beats(rootEl, local, thresholds), // 通過した閾値ごとに rootEl へ 'beat-N' クラスを付与/除去
  sceneDefs: [],       // シーン登録先
  config: { DURATION: 90, SCENES: [...] },  // 下の §4 の表
  space: null, timeline: null,   // 起動後に main.js が入れる
};
```

## 3. API 契約（厳守。名前を変えない）

### space.js
```js
VQAD.initSpace(farCanvas, nearCanvas, { seed }) => {
  resize(),
  frame(dt, tAbs),          // 毎フレーム。dt 秒・tAbs は広告内時刻（seek で飛ぶ）
  setMood(name),            // 'calm'|'presets'|'mock'|'player'|'speak'|'insight'|'finale'
                            // 内部で 2 秒かけて色・エネルギーをブレンド
  surge(strength01),        // シーン遷移の光の加速（0..1）。1 回呼ぶと ~1.5 秒で減衰
  converge(cx01, cy01, r01, amount01), // フィナーレ: 粒子と流線を円へ収束。毎フレーム呼ばれる
  setParallax(x, y),        // -1..1。カメラの微視差（ゆっくり追従）
  setQuality(level)         // 'high' | 'low'
}
```
- **状態は tAbs から再現できること**（seek しても破綻しない）。粒子の位置は
  種付き rng ＋ tAbs の関数で決める（積分に頼らない。頼る場合は seek 時に再シード）。
- far: 星 3 層（視差）＋星雲（radial gradient 数個）＋右下の地球の弧（mood で出没）
- near: 青(#4f8dff→#64e0ff)とピンク(#ff2d92→#b44dff)の**流線リボン**（画面を横切る
  ベジェ束、各 8〜14 本、ゆらぎは tAbs のノイズ関数）＋微粒子（加算合成）
- 発光は `globalCompositeOperation='lighter'` ＋ **事前描画したグロースプライト**で出す。
  shadowBlur の常用禁止（遅い）。devicePixelRatio は上限 2。
- 60fps 目標。粒子は high ≤ 260 / low ≤ 90。オフスクリーン縮小→拡大の疑似ブルーム可。

### timeline.js
```js
VQAD.createTimeline({ duration, onTick(t, dt), onEnd() }) => {
  play(), pause(), toggle(), replay(), seek(t), skipToScene(idx), t, playing
}
```
- rAF 駆動。dt は 1/12 秒で clamp。タブ非表示で自動 pause。
- `#vqad-controls` にコントロールを構築:
  再生/一時停止・リプレイ・スキップ（次のシーン頭へ）・進捗バー（クリック/ドラッグで seek、
  シーン境界の目盛り＋現在シーン名）。ガラス調・下中央・小さく上品に。
- `html.vqad-record` が付いているときはコントロールを**作らない**。
- キー操作: Space=再生/停止, ←→=±5秒, R=リプレイ, 1〜7=各シーン頭, D=開発用シーンナビ表示切替。
- 開発用ナビ（D）: 右上に小さくシーン名ボタン 7 個＋現在時刻表示。

### scenes-a.js / scenes-b.js / finale.js
```js
VQAD.sceneDefs.push({
  id: 's2', order: 2,
  build(rootEl),                 // 起動時に 1 回。DOM を組む
  update(local, dur, api)        // 毎フレーム。local=シーン内秒。**冪等に書く**
});
```
- `update` は「local 秒からすべての見た目を決める」こと。クラス付与は VQAD.beats を推奨。
  連続アニメ（波形・グラフ・カウントアップ）は local から直接値を計算して style へ。
  ※ seek・録画・リプレイがあるので、setTimeout / setInterval / CSS animation の
  無限ループに**状態を持たせない**（装飾ループは可）。
- `api = { space, t }`。フィナーレだけ `api.space.converge(...)` を毎フレーム呼ぶ。

## 4. シーン表（main.js の config。時間は秒）

| # | id | 区間 | mood | 内容 |
|---|----|------|------|------|
| 1 | s1 | 0–10 | calm | オープニング。コピーのみ。2s〜「学びは、もっと自由に進化できる。」→ 6.5s〜「これが、新しい学びの流れ。」 |
| 2 | s2 | 10–22 | presets | プリセット。ガラスの大画面が空間に浮かぶ。タブ 自分/公開/公式、バナー付きカード 6 枚が段階生成、17s〜 形式チップ（穴埋め・並べ替え・マッチング・記述・音声・リスニング）が流れる。コピー「学びたいものが、ここに集まる。」 |
| 3 | s3 | 22–38 | mock | Quick Mock。資料の断片が漂い→ステッパー 条件→教材→構成案→問題→紙面→完成 が順に点灯→白い試験用紙が空間で組み上がる→終盤に PC+スマホ枠。コピー「資料から、本番形式の試験へ。」「AIと一緒に、試験をつくる。」 |
| 4 | s4 | 38–50 | player | プレイヤー。問題カード（進捗 12/20、選択肢 4 つ、1 つが選ばれ正解の発光）→ PC からスマホへ変形。コピー「解く体験まで、洗練する。」 |
| 5 | s5 | 50–68 | speak | VocabuSpeak。波形、AI 吹き出し “What would you like to order?”、ユーザー “I’d like a coffee, please.”、マイク脈動、スコア 発音/流暢さ/文法 がカウントアップ、字幕・翻訳行。コピー「聞く。話す。伝える。」「英語を、答えるものから、使うものへ。」 |
| 6 | s6 | 68–78 | insight | Insight。粒子がグラフ線へ、SVG 折れ線が描画され、統計カード（学習時間・正答率・形式別）が数え上がり、苦手→次のおすすめへ。コピー「結果は、次の学びになる。」 |
| 7 | s7 | 78–90 | finale | 収束。space.converge で光が中央へ→新アイコン誕生→「VocabuQuiz」+ V3 バッジ +「学ぶを、つくる。」+ 小さく “The new flow of learning.” 余韻で終了。 |

シーン間は 1.2 秒クロスフェード（main.js が透明度を制御）。境界で main.js が `space.surge()` を呼ぶ。

## 5. ビジュアル言語（全員共通）

- 背景は深い黒 `#05060f`。青紫の星雲。**青とピンクの流線がブランドの中核**。
- UI パネルは「ガラス」: `rgba(14,16,34,.55)`、境界 `rgba(150,160,255,.22)`、
  `backdrop-filter: blur(14px)`、radius 20px、外周に淡い発光（青/ピンクの box-shadow 2 重）。
- パネルは**空間に浮かせる**: `perspective(1200px) rotateX/Y(数度)`、出現は
  「奥からスケール＋ぼかし解除＋上昇」。ベタ置き禁止。スクショ貼り付け禁止（DOM で再構築）。
- 文字: 見出しは太く字間広め（letter-spacing .08em）、白＋淡い発光。本文は `#c9cfF2`。
  コピーは短く大きく。説明文を並べない。
- アクセント: 青 `#4f8dff` / シアン `#64e0ff` / ピンク `#ff2d92` / 紫 `#8b85d8`（アイコンの紫）。
- 実際の V3 の UI の気配を出す（参考: `shots/final/desktop-preset-live.png` ほか）。
  ただし広告用に再構築し、要素は絞る。
- 安っぽい点滅・虹色・過剰なパララックスは禁止。150〜600ms のイージングで上品に。
- `html.vqad-rm`（reduced motion）ではフェードのみに簡略化して成立させること。

## 6. 新アイコン（finale.js が SVG で再現）

紫（#8b85d8 系）の角丸正方形。中に白〜薄ラベンダーの光沢のある**リボンが 3 つ絡み合う
ロゼット**。中央に太い白の「V」。右下に吹き出しの尻尾。グラデーションとハイライトで
高級感を出す。App アイコンとして成立する精度。外周に柔らかい紫の発光。

## 7. 再現性・録画

- URL パラメータ（main.js が処理）: `?record=1` 自動再生＋コントロール非表示、
  `?t=秒` へ seek、`&paused=1` で静止（スクショ用）。
- 乱数はすべて `VQAD.rng`。2 回再生して同じ絵になること。

## 8. 性能

- 60fps 目標 / 最低 30fps。`backdrop-filter` は同時 3 枚まで。
- 大きな repaint を避ける（transform / opacity 中心。layout を毎フレーム触らない）。
- `matchMedia('(max-width: 700px)')` でパネルは縮小 1 カラム化。モバイルで崩壊しないこと。
