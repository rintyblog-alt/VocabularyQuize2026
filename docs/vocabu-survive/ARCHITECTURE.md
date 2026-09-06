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
                      ＋ 画素の 傾き（dFdx）が 使えるかの 判断
    mesh.js           形を その場で 作る（箱・球・筒・カプセル・輪）
    renderer.js       まとめ描き（instancing）・LOD・視界の外を 捨てる
                      ＋ **動く 解像度**（重ければ 画素を 減らす）
    post.js           **後処理**（にじみ・階調・色の調整・周辺減光）★2026-08-31
    camera.js         三人称カメラ（追従・当たり・寄り引き）
                      ＋ 縦長の 画面への 合わせ ＋ setFree（見せ場）
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
    immersive.js      **全画面**（本当の 全画面 ／ 疑似 全画面）★2026-08-31
    lobby.js          ロビー
    hud.js            順位・時計・残り
    quiz.js           クイズの 窓
    result.js         結果
    touch.js          指の 操作盤
  audio/
    audio.js          その場で 音を 作る
  data/
    courses.js        コース 30 本の 定義
    world.js          **世界観**（地方 7 つ・種の 育ち・ごほうび・記章）★2026-08-31
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

## 絵の 通り道（2026-08-31 に 建て増した）

```
game/ が 「この 形を ここへ この色で」と 積む
   ↓
Renderer.end()
   ├ 影を 焼く（動かない ものも 含めて 1 枚）
   ├ **後処理の 板**へ 場面を 描く（post.ok の ときだけ）
   │    空 → 本体（まとめ描き）
   ├ 明るい ところを 抜く → 1/4 で 横→縦に ぼかす（2 往復）
   └ 階調（ACES 近似）→ 色の 調整 → 周辺減光 → 画面へ
```

**風景ごとに 変わる もの**（`game/theme3d.js` の 1 か所に 全部 ある）:
空 3 色・光・環境光・霧・床の 色・飾りの 色 ＋
`grade`（露出・対比・彩度・にじみ・周辺減光）・`grid`（床の 目地）・
`sea`（下に 広がる 海）・`sky.stars`（星）。
**10 種 すべてに 揃って いるか**は `vqsurviveworld.cjs` が 数える。

## 重さの 守り

| 守り | どこ | 効きかた |
|---|---|---|
| 画質の 段 | `boot/caps.js` | 起動時に 1 回 決める（low で 後処理を 通さない） |
| **動く 解像度** | `engine/renderer.js` | 直近 40 コマの 中央値で 0.05 きざみに 画素を 増減 |
| 視界の外を 捨てる | `engine/renderer.js` | 6 面の 判定 |
| 粗さ（LOD） | 同上 | 距離で 3 段 |
| まとめ描き | 同上 | 形ごとに 1 回。**形を 増やすと 描き回数が 増える** |

## 端末の 力に 合わせる

`boot/caps.js` が 起動時に 測って、`低 / 中 / 高 / 最高` を 決める。
- 低 … 影 無し・霧 だけ・仕掛けの 描き 半分・解像度 0.75 倍
- 中 … 影 1 枚・解像度 1.0 倍
- 高 … 影 1 枚（大きい）・空の 雲・水面
- 最高 … ＋ 縁の 光・被写界の ぼけ

既存の 低性能モード（`deviceMemory < 8` または 芯 4 以下）と 同じ 判定を 使う。
