# 学習プレイヤー（通常クイズ / VocabuSpeak の共通の枠）

問題を解いている画面は、通常クイズと VocabuSpeak で別々に作られていた。
上の帯・進み具合・保存の状態・下の操作は、どちらも同じでよい。
そこだけを 1 か所へまとめ、**中身（形式ごとの見た目・マイク・字幕）は各画面が持つ**。

```
client/v2/domain/player-prefs.js   設定の定義表と読み書き（値の持ち主）
client/v2/ui/player-shell.js       枠の組み立て（上 / 中 / わき / 下）
```

---

## 1. 枠

```
┌──────────────────────────────────────────┐
│ 戻る  題名                保存  時間  操作 │  PS.head()
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━  3 / 12        │  （進み具合）
├────────────────────────────┬─────────────┤
│                            │  問題の一覧  │
│  中身（ここだけスクロール）  │  未回答へ   │  PS.body()
│                            │  採点する    │
├────────────────────────────┴─────────────┤
│ 前へ  目印              次へ / 採点する    │  PS.foot()
└──────────────────────────────────────────┘
```

**下の操作は中身の上に浮かせない。** 流れの外に置き、中身は自分の枠
（`#pMain`）の中だけでスクロールする。こうしておくと、
長い問題でも回答欄が下の操作に隠れない。
iPhone の下端（ホームバー）は `env(safe-area-inset-bottom)` で足す。

わき（問題の一覧）は広い画面だけ。狭い画面には出さない。

---

## 2. 設定

値の持ち主は **本体の設定ストア（`__vqSet`）**、
読む側が見るのは **`VQ2.playerPrefs`**。
設定を変えると `apply` が `playerPrefs.set()` を呼び、解いている画面はそれを読む。
二重に持たないので、どちらから変えても食い違わない。

| 置き場 | 何を持つか |
|---|---|
| `player.*`（設定画面「学習プレイヤー」） | 見せ方・進み方 |
| `VQ2.playerPrefs` | 上を写したもの。画面はこれだけを読む |
| VocabuSpeak の `speak-history` の prefs | 字幕・訳・声・速さ・レベル（VocabuSpeak 固有） |

### 決まりごと

- **効かない設定は載せない。** 定義表の各項目には `readBy`（読む場所）を必ず書く。
  `player-prefs.test.mjs` が、`readBy` の無い項目があれば落とす。
- **既定は「いまの動き」。** 触らなければ何も変わらない。
  だから「答えたら自動で次へ」「答えたらすぐ解説」は既定が切。
- **端末ごと（`device`）とアカウント（`account`）を分ける。**
  文字の大きさを同期すると、机の広い画面の設定がスマホへ降ってくる。
  同期へ送るのは `accountScoped()` が返すものだけ。

### 項目

| id | 何が変わるか | 持ち場 | 読む場所 |
|---|---|---|---|
| `density` | 余白。`focus` はわきも隠す | 端末 | player-shell |
| `fontSize` | 問題文の文字（4 段階） | 端末 | player-shell |
| `maxWidth` | 本文の幅（620 / 760 / 980px） | 端末 | player-shell |
| `animations` | 解いている間の動き | 端末 | player-shell |
| `showProgress` / `showTimer` / `showSave` | 上の帯に何を出すか | 端末 | player-shell |
| `listPanel` | 広い画面のわき（問題の一覧） | 端末 | quiz-player |
| `keyboard` | 1〜9 / A〜Z で選ぶ | 端末 | quiz-player |
| `autoNext` | 答えたら自動で次へ（1 つ選ぶ形式と正誤のみ） | アカウント | quiz-player |
| `instantExplain` | 答えたらすぐ解説（練習のみ） | アカウント | quiz-player |
| `choiceDensity` | 選択肢の間隔 | 端末 | player-shell |
| `resetScroll` | 問題ごとに先頭へ戻す | 端末 | quiz-player |
| `confirmSubmit` / `warnUnanswered` | 採点の前の確認 | アカウント | quiz-player |
| `speakBigMic` | 話す練習の大きなマイク | 端末 | speak |
| `speakInstantFeedback` | すぐ手ごたえを出す | アカウント | speak |

---

## 3. 保存の状態

`saveState` は `saved` / `saving` / `error` の 3 つ。
**「保存済み」は、本当に書けたときだけ出す。**
`ST.quizzes.put()` は保存領域が満杯のとき `{ ok: false }` を返す。
ここを握り潰すと「保存済み」と嘘を出すことになるので、必ず戻り値を見る。

---

## 4. やってはいけないこと

- **描き直すたびに `U.on` を張らない。**
  `U.on` は外す仕組みを持たない。見出しは 1 秒ごとに描き直すので、
  そのたびに結線すると聞き手が増え続ける（実測: 6 秒で 14 個、3 問進むと 37 個）。
  結線は 1 回だけ。印は `app.root.__qpWired` のように **要素へ置く**
  （関数内の `var` は巻き上げで消えることがある。実際に起きた）。
  見張り: `node vqleak.cjs`

- **VocabuSpeak 固有のものを枠へ押し込まない。**
  マイク・字幕・Mission・発音の点は、通常クイズには要らない。
  枠は「上・中・わき・下」の置き場所だけを決め、中身は各画面が入れる。

---

## 5. 確かめ方

```bash
node client/v2/tests/player-prefs.test.mjs   # 設定の定義表と読み書き（23 件）
node vqplayerset.cjs                         # 設定 → 画面まで本当に効くか（12 件）
node vqplayershot.cjs                        # PC / 390px / 320px の見た目と隠れ
node vqleak.cjs                              # 描き直しで聞き手が増えていないか
```
