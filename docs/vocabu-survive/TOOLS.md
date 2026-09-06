# VocabuSurvive の 道具（2026-08-31）

## 検査（`node <名前>.cjs`）

先に `cd server && ./dev-local.sh echo` で 127.0.0.1:8791 を 立てる。
`_runall.sh` は `VQ_BASE` / `VQ_API` を そこへ 向ける。

| 名前 | 見るもの |
|------|----------|
| `vqsurvivesoak` | **画面を 開かずに 60〜120 試合**。順位・終わり方・数の 壊れ（1 試合 0.7 秒）|
| `vqsurvivecourse` | 30 本 すべて ボットが ゴールできるか |
| `vqsurvivegap` | コースの 隙間を **形から** 測る（走らせない）|
| `vqsurvivefit` | **文字が あるのに 幅 0 の 部品**・はみ出し・押す ところが 見えているか（6 つの 幅）|
| `vqsurvivemode` | 6 つの 遊び方の 違いが 画面に 出ているか |
| `vqsurviveland` | 地平の 向こうの 土台。**PNG を ほどいて 画素で** 見る |
| `vqsurvivetheme` | 明るい／暗い の 両方で 読めるか |
| `vqsurvivea11y` | 読み上げ・キーボード・明暗・ゲームパッド |
| `vqsurvivegfx` | 後処理と 動く 解像度（CPU を 6 倍 遅く して 測る）|
| `vqsurviveperf` | 束の 大きさ・1 コマの 時間・描き回数（4 つの 段）|
| `vqsurviverobust` | 向き変え・全画面・タブ・**文脈喪失** |
| `vqsurvivelearn` | 遊んだ ぶんが 本体の 学習の 記録に 積み上がるか |
| （ほか）| game / cup / ghost / play / phys / hard / myword / record / preset / 2p / net / editor / face / friend / nav / safari / sec / share / engine / world / audit / spec |

## 手で 見る ための 道具（検査では ない）

| 名前 | すること |
|------|----------|
| `vqsurviveshot.cjs` | 11 場面 を 撮る（`--面 pc\|sp\|spL --コース N --明暗 dark\|light --出 <場所>`）|
| `vqsurvivealbum.cjs` | **30 本 ぜんぶ**を 窓 1 つで 順に 撮る |
| `_shotland.cjs` | 風景 9 種を 目の高さ と 見下ろしで 撮る（背景の 土台の 確認）|
| `_shotmodes.cjs` | 遊び方ごとの 走行中の 画面（机 / スマホ）|

## 出しかた

```bash
node vqsurvive.cjs     # client/assets/vocabu-survive/** を 束ねる（文法も 見る）
node vqrehash.cjs      # 指紋を 付け替える
./_deploy.sh           # 出して、本番が **同じ バイト**を 返すまで 確かめる
```

★ 出した 直後は まだ 古い ものを 返す ことが ある（実測: 1 回目 404）。
  1 回 見て 「違う」と 判断しない。`_deploy.sh` は 6 回まで 待つ。

★ `node client/v2/build-v2.mjs` は **走らせない**（別件。1.04MB 消える）。

## まとめて 走らせる

```bash
./_runall.sh vqsurvivesoak vqsurvivefit vqsurvivemode ...
# まとめ: <scratch>/testlog/summary.txt  各ログ: <scratch>/testlog/<名前>.log
```
