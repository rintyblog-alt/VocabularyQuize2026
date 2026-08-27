# VocabuSurvive — 決めたことと、その理由

日付は すべて 2026 年。迷ったときは ここへ戻る。

---

## D-01 既存の VocabuSurvival（v1 / v2 / v3）は 触らない。別に建てる（08-28）

**調べたこと**

| 版 | 置き場 | 行数 | いまの状態 |
|----|--------|------|-----------|
| v1 | `client/assets/survival/` | 2,050 | `index.html` から **毎回** 読まれている |
| v2 | `client/assets/survival-v2/` | 3,953 | `/survival-v2` の道でだけ動く |
| v3 | `client/assets/survival-v3/` | 2,988 | `index.html` から **毎回** 読まれている |

画面（`#appSurvival3Page`）は 中身が 消されていて
「現在、ご利用いただけません。（Error: 2800）」だけが出る。

v1 と v2 は `window.BABYLON` を 前提にしているが、
**Babylon.js は どこからも 読み込まれていない**（`vendor/lib` にも 無い）。
つまり この 2 つは 起動しても 例外で 止まる。

**決めたこと** — VocabuSurvive は `client/assets/vocabu-survive/` に **新しく建てる**。
既存の 3 つは 消さない・直さない（消すと 何が壊れるか 測れないため）。
入口だけを 新しいものへ 向ける。

**理由** — 名前も 中身も 別物（v3 は 2D 横スクロール中心・8 人対戦も コース 30 種も 無い）。
既存を 継ぐより 新しく建てるほうが 速く、しかも 既存を 壊さない。

---

## D-02 3D は 自前の WebGL2 で書く。ライブラリを 借りない（08-28）

**候補**

| 案 | 落とすもの | 良い所 | 悪い所 |
|----|-----------|--------|--------|
| Babylon.js | 約 4.5MB | 何でもできる | **落とすだけで 細い回線だと 30 秒**。v1/v2 が これで 死んでいる |
| three.js | 約 600KB | 手数が減る | 影・LOD・instancing は 結局 自分で書く |
| **自前 WebGL2** | **0 バイト** | 全部 見える・全部 削れる | 書く量が 多い |

**決めたこと** — 自前で 書く。

**理由** — 要件が 「HIGH QUALITY PER PIXEL であって HIGH POLYGON ではない」。
つまり **必要なのは 単純な形と 良い陰影**で、汎用エンジンの 機能は ほぼ 使わない。
この アプリは すでに 細い回線（実測 1.2Mbps）で 遅い問題を 抱えている
（`project_slow_link`）。ここへ 4.5MB を 足すのは 筋が悪い。

WebGL2 が 無い端末には WebGL1 で 落とす（instancing は 拡張で 拾う）。

---

## D-03 音は その場で 作る。音源ファイルを 置かない（08-28）

WebAudio の 発振器と 雑音で 効果音を 合成する。
**著作権の 心配が 消え、落とす量が 0 になる。**
曲も 和音の 進行を 決めておいて その場で 鳴らす。

---

## D-04 通信は 既存の RealtimeRoom と 同じ作り（Durable Object + WebSocket）（08-28）

`server/src/worker.js` に すでに `RealtimeRoom`（クイズ対戦）と `RoomDO` がある。
同じ形で `SurviveRoom` を 足す。**サーバが 正**（server authoritative）。

---

## D-05 入口は 遅らせて 読む（08-28）

いまの `index.html` は survival v1 と v3 を **見ない人にも 毎回** 読ませている。
VocabuSurvive は タブを 開いた ときに 初めて 読む。

---

## D-06 git を 起こした（08-28）

このプロジェクトは git 管理下に **無かった**。15 時間の 連続作業で 巻き戻せないのは
危ないので `git init` した。巨大な 素材（フォント 144MB・印刷素材 363MB・
ローカル AI モデル 902MB）は `.git/info/exclude` で 外した（.gitignore は 触っていない）。

---

## D-07 出し方は 既存のまま（08-28）

`package.json` は **無い**。npm test / lint / build は 存在しない。
このプロジェクトの やり方は:

1. `js-src/*.js` を 直す → `npx esbuild --minify` → `client/js/<指紋つきの名前>` へ
2. `client/core/**` を 直す → `node vqbundle.cjs` → `node vqrehash.cjs`
3. 検査は ルートの `*.cjs` を `node` で 走らせる（Playwright あり）
4. 本番は `server/` から `npx wrangler deploy`

VocabuSurvive も これに 合わせる。**新しい 出し方を 作らない。**
ただし `client/assets/vocabu-survive/` は ES モジュールなので 束ねない
（`index.html` から 遅れて import する。指紋は 版の 問い合わせ文字で 付ける）。
