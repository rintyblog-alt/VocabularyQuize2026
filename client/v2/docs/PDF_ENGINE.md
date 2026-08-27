# 紙面エンジン

## 1. 現在の状態（正直な整理）

| エンジン | 利用可否 | 検証状況 |
|---|---|---|
| **組み込み（builtin）** | 利用可能 | 実測で検証済み |
| Typst | **利用不可** | 実行環境が未導入のため**未検証** |
| LaTeX（upLaTeX / jlreq） | **利用不可** | 実行環境が未導入のため**未検証** |

この環境には Typst も TeX も、Homebrew も入っていない。導入には利用者の承認が必要なため、
**組み込みレンダラのみで実装した**。Typst / LaTeX は差し替え口（`VQ2.pdfRenderer.adapters`）
だけを用意してある。呼ばれたら `ENGINE_UNAVAILABLE` を正直に返し、組み込みへ縮退する。

`engine: "typst"` や `"latex"` を選んでも、`resolveEngine()` が `"builtin"` を返す。
UI にも「未導入」と表示する。

### 組み込みレンダラでできること

HTML/CSS の Paged Media で組み、ブラウザの印刷ダイアログから PDF にする。

- A4 / A3 / B4 / B5 / カスタム、縦置き・横置き、見開き、余白 mm 指定
- **縦書き**（`writing-mode: vertical-rl`）
- **ルビ**（`{漢字|かんじ}` → `<ruby>`）
- **傍線部ラベル**（`[[傍線部A]]`、縦書きでは右傍線）
- **縦中横**（`^^12^^` → `text-combine-upright`）
- 丸囲み数字、解答欄（マーク・記述行・空欄マス）、資料枠、会話枠、表、擬似コード、注意書き
- ページ番号、大問番号（漢数字）、配点表示

日本語フォントはヒラギノ系が入っていることを実測で確認済み。

### 組み込みレンダラでできないこと

- PDF ファイルを直接生成する（ブラウザの印刷を経由する必要がある）
- 分数型の解答欄など、TeX 由来の高度な数式組版
- 複雑なルビ配置の微調整（`jlreq` 相当の精度）

---

## 2. Template Registry

10 種類。すべて版（`version`）を持ち、使用した版を MockSpec に残すので、
テンプレートが更新されても既存の試験の紙面は壊れない。

| ID | 名前 | 書字 | 既定用紙 |
|---|---|---|---|
| `standard-school-exam` | 標準（校内テスト） | 横 | A4 縦 |
| `periodical-exam` | 定期考査（見開き） | 横 | A3 横・2 段 |
| `common-test-math-inspired` | 数学（マーク式に寄せた体裁） | 横 | B5 縦 |
| `common-test-japanese-inspired` | 国語（縦書き・傍線部） | 縦 | B4 縦 |
| `english-reading` | 英語（長文読解） | 横 | A4 縦 |
| `history-source-analysis` | 社会（資料読解） | 横 | A4 縦 |
| `science-exam` | 理科 | 横 | A4 縦 |
| `information-exam` | 情報 | 横 | A4 縦 |
| `short-quiz` | 小テスト（1枚） | 横 | A4 縦 |
| `custom-blank` | 白紙から | 横 | A4 縦 |

`common-test-*` は公式試験そのものではない。説明文に必ずその断りを入れており、
公式名を名乗らないことを単体テストで検査している。

科目名からの自動選択に対応（数学 → 数学テンプレート、現代文＋縦書き → 国語テンプレート等）。

---

## 3. 処理の流れ

```
MockSpec
  │  Schema 検証 ＋ 配点検証（error があればここで止まる）
  ▼
LayoutPlan          どのテンプレートのどの部品に何を置くか
  │  ・AI が触れるのはここまで。組版ソースは書かせない
  │  ・AI の調整値は許可された範囲へ丸める（未知のキーは捨てる）
  ▼
安全な HTML/CSS     すべての文字列をエスケープしてから組む
  ▼
描画（iframe）
  ▼
紙面検査（実測）     DOM の実際の位置を測る。画像化して OCR しない
  ▼
調整 → 再描画        通常 3 回まで。変化しなくなったら打ち切る
  ▼
LayoutManifest ＋ 成果物
```

### AI が調整できる値と範囲

| キー | 範囲 |
|---|---|
| `columns` | 1〜2 |
| `fontScale` | 0.90〜1.15 |
| `lineHeight` | 1.5〜2.2 |
| `questionGapMm` | 4〜16 |
| `answerLines` | 1〜30 |
| `answerBoxWidth` | 20〜100 % |

範囲外は丸め、未知のキーは捨てる。

---

## 4. 紙面検査

生成済みの DOM から実際の位置を測る。検出できる項目:

`overflow`（用紙からのはみ出し）/ `unsafe_margin`（安全余白 4mm への侵入）/
`unreadable_font`（指定した最小サイズ未満）/ `overlap`（要素の重なり）/
`orphaned_choice`（問題文と選択肢がページで分かれる）/ `missing_image` /
`excessive_whitespace`（ページの下半分以上が空く）/ `missing_page_number` /
`missing_question_number`（紙面に出ていない設問）/ `missing_answer_binding` /
`points_mismatch`（紙面の配点合計と満点の不一致）/ `insufficient_answer_space`

指摘は構造化して返す。紙面の感想や思考の過程は保存しない。

```json
{ "page": 2, "severity": "high", "issueType": "overflow",
  "description": "2 ページ目で 3 箇所が用紙からはみ出しています。",
  "affectedElementId": "q7", "suggestedAction": "文字を小さくするか…", "confidence": 0.95 }
```

データを直さないと解決しない指摘（設問の欠落・回答欄の欠落・配点不一致・画像の欠落）は
自動調整の対象にせず、そのまま利用者へ出す。

---

## 5. LayoutManifest

問題冊子とデジタル解答用紙を同期するための対応表。

```json
{ "mockId": "...", "precision": "element",
  "questionAnchors": [
    { "questionId": "q1", "answerBindingId": "b1", "page": 1,
      "region": { "x": 0.08, "y": 0.21, "width": 0.84, "height": 0.06,
                  "coordinateSystem": "normalized" } }
  ],
  "answerBindings": [ ... ] }
```

実測できたときは `precision: "element"` で正規化座標を持つ。
測れなかったときは `precision: "page"` へ安全に縮退し、`region` は `null` のままにする。
**持っていない座標を作らない。**

---

## 6. 成果物（§21）

| ファイル | 内容 |
|---|---|
| `question-booklet.html` | 問題冊子 |
| `printable-answer-sheet.html` | 解答用紙 |
| `answer-and-explanation.html` | 正解・解説（採点基準・観点別・出典つき） |
| `mock-spec.json` | 試験の正式データ |
| `grading-definition.json` | 採点定義（正解・別解・正規化・許容誤差・Rubric・観点別） |
| `layout-manifest.json` | 紙面と回答欄の対応表 |
| `validation-report.json` | Schema 検証・紙面検査・調整の記録 |

PDF は各 HTML を印刷ダイアログで「PDF として保存」して得る。
問題用紙と解答用紙は別々の AI 生成物ではなく、**同じ MockSpec から作る**。

---

## 7. Typst / LaTeX を後から入れる場合

`VQ2.pdfRenderer.adapters` に `build` と `compile` を実装するだけで切り替わる。
`templates.js` の `engineStatus()` を `available: true` にすれば UI にも出る。

導入する場合の目安（未実測・調査値）:

- **Typst** — 単一バイナリ約 30MB。GitHub Releases から取得。TeX 環境は不要。
- **LaTeX** — BasicTeX 約 100MB ＋ `jlreq` / `upLaTeX` / 日本語フォント関連の追加パッケージ。
  実際に縦書き国語まで組むには数百MB〜1GB 規模になる。

いずれも導入していないため、「LaTeX 対応済み」とは報告していない。

---

## Typst を実際に入れた（2026-08-04）

これまで Typst は「ソースは作れるが、組む道具が端末に無い」状態だった。

* `document-renderer/bin/typst`（0.15.1・aarch64-apple-darwin）を同梱し、
  `typst-compiler.mjs` の探索先に加えた。`/typst/capability` が
  `{"available":true,"version":"0.15.1"}` を返す。
* 解答用紙が 1 枚も組めなかった原因は `score: (show: true, …)`。
  **`show` は Typst の予約語**で、裸の辞書キーに使えない。
  `typst-escape.js` の `dict()` が予約語のキーを引用符で囲むようにした。
  読む側（`answer-grid.typ`）は元から `score.at("show")` と文字列で引いている。
* 紙面の体裁は `school-exam-standard` の 1 種類しか開いていなかった。
  8 種すべてを実際に組み、問題冊子・解答用紙・模範解答の 3 点が PDF になり、
  体裁ごとに中身も変わることを確かめたうえで開けた（`vqtypst.cjs` 36/36）。

**まだ開けていないもの**: 解答用紙の体裁（`answer-*`）は 8 種あるが、
どれを選んでもソースが 1 文字も変わらない（実測）。選べるふりになるので
`answer-dense-grid` 以外は「準備中」のままにしてある。

---

## TeX（upLaTeX）を入れた（2026-08-04）

Typst と並ぶ 2 本目の出力エンジン。**入れた理由は縦書き**。
Typst は縦組みを持っていないので、国語の紙面はこちらでしか作れない。

参考にした記事（マクロはそのまま置かず、`\vq…` に名前をそろえ直してある）:

* 共通テスト風の穴埋め枠（`fancybox` + `\framebox[40pt][c]`、初出は太枠・再出は細枠）
  — sutasapo「共通テスト数学っぽい穴埋め枠の作り方」
* 卵型の選択肢番号・傍線部・解答欄（TikZ + `plext`）
  — note「LaTeX 共通テスト再現テンプレート」
* 配点の持ち方を単答／完答／順不同で分ける
  — koseiwatanabe「共通テスト自動採点システム」
* 何を部品として持つべきか（`answer-box` / `choice` / `frac-answer`）
  — zenn「共通テスト数学の Typst テンプレート」（こちらは Typst の記事）

### 置き場

| もの | 場所 |
|---|---|
| 組版ライブラリ | `document-renderer/tex/vqexam.sty` |
| 文章を安全に埋める層 | `document-renderer/renderers/tex-escape.js` |
| 問題データ → ソース | `document-renderer/renderers/tex-renderer.js` |
| ソース → PDF | `document-renderer/compilers/tex-compiler.mjs` |
| Bridge の口 | `/tex/capability` `/tex/compile` |
| TeX 本体 | `~/texlive/vq`（scheme-basic + collection-langjapanese、618MB） |

`sudo` も Homebrew も無い端末なので、TeX Live を `$HOME` へ入れてある。
`VQ_TEX_BINDIR` で置き場を変えられる。

### Typst と違って気をつけること

Typst には文字列リテラルがあり、利用者の文章をそこへ閉じ込められた。
**LaTeX には無い。** 文章は必ず本文（markup）へ出るので、
`\ { } $ & # ^ _ % ~` を潰してからでないと、問題文が命令として動く。
`tex-escape.js` の `txt()` を通っていない文字列を本文へ出してはいけない。
組んだあとに `audit()` で `\write18` などが混ざっていないかも見る。
コンパイラ側でも `-no-shell-escape` と `openout_any=p` で二重に止める。

### 縦組みで踏んだ落とし穴（3 つとも実測）

1. **`jsarticle` に `tate` を渡しても縦にならない。** クラスごと `utarticle` にする。
2. **`multicol` は縦組みに対応していない。** 2 段にすると、その環境より前の中身
   （大問の見出しと問1・問2）が丸ごと紙面から消えた。縦組みでは必ず 1 段にする。
3. **`geometry` を入れると本文が紙の右外へ出る。** 上下左右でも `margin=` でも
   同じで、見出しと最初の設問が見えなくなった。縦組みでは `geometry` を使わず、
   `utarticle` の既定の版面のまま組む。

### まだできていないこと

* 原稿用紙のマス（`\vqGenkou`）は縦組みだと向きが回ったままで、
  マスが縦に流れない。横書きでは正しい。
* 画像（`\includegraphics`）は口だけ用意してあり、実際の図版で確かめていない。
* TeX 側は Semantic Plan の「体裁 8 種」のうち、見出しの出し方と
  ページ番号の位置だけを見ている。Typst ほど細かくは効いていない。

検証: `vqtex.cjs`（21/21）。横書き・共通テスト風・縦書きの 3 通りで、
問題冊子・解答用紙・模範解答が PDF になることと、
文章が命令にならないことを実際に組んで確かめている。
