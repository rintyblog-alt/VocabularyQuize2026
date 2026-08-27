# VocabuSurvive — 組み立て

## 置き場

```
client/assets/vocabu-survive/
  index.js            入口。window.VocabuSurvive を 作る
  boot/
    loading.js        読み込み画面（VOCABUSURVIVE / START）
    caps.js           端末の 力を 測る（WebGL2 / メモリ / 芯の数）
  engine/
    gl.js             WebGL2 の 文脈・shader・buffer の 面倒
    mesh.js           形を その場で 作る（箱・球・筒・カプセル・輪）
    renderer.js       まとめ描き（instancing）・LOD・視界の外を 捨てる
    camera.js         三人称カメラ（追従・当たり・寄り引き）
    material.js       見た目の 型（つや・影・霧）
    sky.js            空と 地平
  game/
    input.js          鍵盤・マウス・指
    physics.js        重力・当たり・押し返し
    player.js         走る・跳ぶ・よろける・戻る
    obstacle.js       仕掛け 20 種
    course.js         コースを 組み立てる
    gate.js           クイズの 門
    match.js          試合の 進み（合図 → 走る → 結果）
  net/
    client.js         WebSocket・先読み・補間・つじつま合わせ
    proto.js          やりとりの 形（この 1 枚が サーバと 共通の 決めごと）
  ui/
    lobby.js          ロビー
    hud.js            順位・時計・残り
    quiz.js           クイズの 窓
    result.js         結果
    touch.js          指の 操作盤
  audio/
    audio.js          その場で 音を 作る
  data/
    courses.js        コース 30 本の 定義
```

## サーバ

```
server/src/worker.js
  class SurviveRoom          … Durable Object。1 試合 = 1 部屋
  /api/survive/*             … 部屋作り・入室・成績・記録
  D1: survive_stats / survive_records / survive_matches
```

## 画面の 流れ

```
左パネル 🎮 VocabuSurvive
   ↓ （ここで 初めて 部品を 読む）
読み込み画面 ── START ──▶ ロビー
                              ↓ 準備 → 開始
                          合図（3・2・1）
                              ↓
                        走る ⇄ 仕掛け ⇄ クイズの門 ⇄ 中間地点
                              ↓
                          ゴール → 結果 → もう一度 / ロビー / VocabuQuiz へ
```

## 層の 切り分け

- **描く** と **決める** を 分ける。`game/` は WebGL を 一切 知らない。
  `engine/` は クイズを 一切 知らない。
- クイズは `gate.js` の 中でだけ VocabuQuiz の 問題を 触る。
  ゲーム側は 「門を 開けたか」だけを 見る。
- 通信は `net/proto.js` の 形しか 通さない。サーバと クライアントで
  **同じ 番号表** を 使う。

## 端末の 力に 合わせる

`boot/caps.js` が 起動時に 測って、`低 / 中 / 高 / 最高` を 決める。
- 低 … 影 無し・霧 だけ・仕掛けの 描き 半分・解像度 0.75 倍
- 中 … 影 1 枚・解像度 1.0 倍
- 高 … 影 1 枚（大きい）・空の 雲・水面
- 最高 … ＋ 縁の 光・被写界の ぼけ

既存の 低性能モード（`deviceMemory < 8` または 芯 4 以下）と 同じ 判定を 使う。
