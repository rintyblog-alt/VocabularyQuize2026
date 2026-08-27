# Vocabu Workplace

VocabuQuiz V3 の中の統合制作環境。文書・表・スライド・フォームを 1 か所で作り、保存し、
共有し、互いに変換できる。

- 入口: 左サイドバーの **WORKPLACE**、または コンソールから `VQ2.openWorkplace()`
- 公開フォームの回答: `?wpform=<publicId>` を付けて開くと、回答画面だけが出る

---

## 1. どこに何があるか

```
client/v2/workplace/
  css.js             ビルド時に workplace.css を差し込む入れ物（直接編集しない）
  workplace.css      画面の見た目（色・間隔はすべて Bloom トークンから取る）
  model.js           共通データモデル、Registry の作り方、権限、列名の計算
  store.js           保存基盤（自動保存・直列化・競合検出・端末復旧・版）
  formula.js         Sheets の数式（字句解析→構文解析→評価）と関数 Registry
  chart.js           SVG のグラフ（Sheets / Forms / Slides が共用）
  ui-shell.js        共通のエディター枠、コマンドパレット、ボトムシート、アイコン
  templates.js       テンプレート 69 件（Docs 17 / Sheets 17 / Slides 15 / Forms 20）
  ai.js              4 製品共通の AI（VQ2.ai 経由。Bridge を直接叩かない）
  convert.js         製品間の変換（元を壊さず、新しいファイルを作る）
  settings.js        アプリ設定の定義表と、新規作成への反映
  forms-fields.js    質問形式 25 種類の Registry（描く・読む・検証・集計）
  ui-forms-public.js 回答画面の描画（編集プレビューと共用）と公開ページ
  ui-docs.js         VocabuDocs
  ui-sheets.js       VocabuSheets
  ui-slides.js       VocabuSlides
  ui-forms.js        VocabuForms（編集・公開・回答結果）
  ui-home.js         Workplace ホーム（一覧）
  entry.js           サイドバーへの結線、?wpform= の受け口
```

サーバ側は `server/src/worker.js` の中。

- テーブル定義: `WORKPLACE_TABLES`（**2 か所の schema 作成関数の両方から読ませている**。
  片方だけに書くと通常の道では作られず 500 になる）
- ハンドラ: `handleWorkplace*`（`export default` の直前にまとまっている）
- 経路: `/api/workplace/items` `/item` `/item/meta` `/versions`
  `/form/public` `/form/respond` `/form/responses` `/form/response`

---

## 2. 決めごと（守らないと壊れる）

### 2.1 保存

- **正本はサーバ（D1）**。localStorage は控えと復旧のためだけ。
  ログインしていないときは端末保存になるが、**画面に必ずそう出す**。
  「保存しました」と嘘をつかない（`store.stateLabel` が言い方を一元管理している）。
- 保存は **直列**。走っている保存が終わるまで次を投げない。
  編集が続いたら最新の内容だけを次の 1 回にまとめる。
- 保存のたびに通し番号を振り、**古い応答で新しい内容を上書きしない**。
- サーバの版が進んでいたら 409。黙って潰さず、どちらを残すか利用者に聞く。

### 2.2 機能の登録（Registry）

画面へ機能名を直接書かない。以下の 5 つの Registry に登録し、画面はそれを読んで並べる。

| Registry | 中身 | 必須の項目 |
|---|---|---|
| `WP.blockRegistry` | Docs のブロック 15 種 | `label` `icon` `render` |
| `WP.functionRegistry` | Sheets の関数 45 個 | `category` `minArgs` `evaluate` |
| `WP.elementRegistry` | Slides の要素 7 種 | `label` `icon` `render` |
| `WP.fieldRegistry` | Forms の質問 25 種 | `label` `icon` `render` `readValue` |
| `WP.convert.CONVERTS` | 変換 8 種 | `from` `to` `run` |

**実装が無いものは登録できない**（`makeRegistry` が必須項目を見る）。
だから「ツールバーには在るのに押しても動かない」が仕組みとして生まれない。

`level` は表示の段階（1=シンプル / 2=標準 / 3=詳細）。機能は消えず、出す量だけが変わる。

### 2.3 打っている最中に描き直さない

Docs は contenteditable。入力のたびに全体を描き直すと **カーソルが毎回先頭へ飛ぶ**。
文字の入力ではモデルへ写すだけにして、組み替え（種類変更・追加・削除）のときだけ描き直す。

### 2.4 保存状態の表示

画面は何度も描き直される。`headerHtml()` は **そのつど今の状態** を書き込むこと。
固定の文字を書いておくと、描き直した瞬間に古い表示へ戻る
（実測: スライドで「この端末に保存」が「保存済み」に戻っていた）。
状態を出す要素は掴んだまま持たず、毎回引き直す（`paintSave`）。

### 2.5 縮小と場所取り

`transform: scale()` は **場所を取る大きさを変えない**。
Slides のキャンバスは、外側の `.wpp-fit` に「縮めたあとの実寸」を持たせている。
これが無いと 960px ぶんの場所を取り続け、右と下へはみ出す。

### 2.6 グリッドの子は縮まない

CSS Grid の子は既定で内容より小さくならない。`min-width: 0` を明示しないと
省略記号も効かず、320px ではみ出す（クイック作成カードで実際に起きた）。

### 2.7 アイコンの大きさ

`.wp-i { width: 18px; height: 18px }` を必ず効かせる。
ボタンの外に置いた線画（検索欄・空状態）は、これが無いと親いっぱいまで伸びる。

---

## 3. データの形

```
WorkplaceItem（共通のメタ）
  id / ownerId / itemType / title / description / appearance /
  status / visibility / publicId / favorite / currentVersion /
  createdAt / updatedAt / lastOpenedAt / trashedAt / preview

VersionedContent<T>
  { schemaVersion, content }

DocumentContent      { blocks[], page, comments[] }
SpreadsheetContent   { sheets[{cells,colW,rowH,merges,freeze}], charts[], activeSheet }
PresentationContent  { ratio, theme, slides[{layout,elements[],notes}], transition }
FormContent          { sections[{fields[]}], theme, settings, logic[] }
```

一覧は `preview`（保存のたびに作る要約）だけを読む。本文は開いたときにだけ取りに行く。

---

## 4. 確認のしかた

```bash
node client/v2/build-v2.mjs                 # 組み立て（84 ファイル → client/index.html）
node client/v2/tests/workplace-formula.test.mjs   # 数式 33 件
node vqworkplace.cjs                        # 実ブラウザ 57 件（PC）
node vqworkplace.cjs --mobile               # 実ブラウザ 57 件（390px）
node vqwpmobile.cjs                         # 320/375/390/430px の崩れ 44 件
node vqwpapi.cjs                            # 開発サーバへの通し 52 件（本番では動かない）
node vqwplive.cjs                           # デプロイ済み開発環境で 8 件
node vqwpregress.cjs                        # 既存機能が壊れていないか 5 件
```

`vqwpapi.cjs` と `vqwplive.cjs` は検証用アカウントを作り、終わったあとに
作ったデータを消す。本番の URL では動かないようにしてある。

---

## 5. まだできていないこと

- **DOCX / XLSX / PPTX の書き出しと取り込み** — 未実装。
  HTML / CSV / PDF で代替し、画面にもそう書いてある。
- **他の人と同時に編集する共有** — 未実装。共有は link / public の読み取りと、
  フォームの回答受付だけ。
- **QR コード** — 未実装。URL をそのまま渡す形にしてある（画面にもそう書いてある）。
- **ファイル添付の実体保存** — 名前・大きさ・種類だけを記録する。
  中身は保存しない（R2 が未設定のため）。画面にもそう書いてある。
- **セルの結合の見た目** — 結合の記録はするが、表示は結合前のまま。
- **Docs の画像** — data URL で本文に埋め込む（3MB まで）。R2 は使っていない。
