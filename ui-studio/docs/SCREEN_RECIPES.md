# SCREEN_RECIPES — 画面ごとの組み立てレシピ

> 各画面を「何で作るか」の速見表。実装は `src/features/`、実物は Studio > Screens。

## Welcome（features/auth.tsx: WelcomeScreen）
- 骨格: `.qz-welcome`（bar / body 2col / foot）。背景はグリッド線+控えめradial 2つのみ。
- 左: Badge(ai) → display見出し → lede → CTA縦積み（ログイン=primary lg / 作成=outline / ゲスト=ghost）。
- 右: 実UIの縮図カード3枚（stagger 90ms）。モバイルでは非表示。
- foot: 規約/プライバシー/ヘルプ + システム状態Badge + バージョン。

## Auth（features/auth.tsx: AuthFlow）
- 2カラム。左=引用サイド（モバイル非表示）、右=`.qz-auth__panel`（400px）。
- 内部スタックで戻る方向を管理（fwd/backクラス）。11状態は AuthView union。
- パスワード強度 = `.qz-pwmeter[data-level=0-4]`。失敗3回→locked遷移。

## Home（features/quiz.tsx: HomeScreen）
- AppFrame(active="home") + `.qz-stat-row`(StatCard×4) + `.qz-home__grid`(main+300px)。
- 続きから=`.qz-continue`（アクセント帯・カードではない）/ AI提案=Alert(ai) / グラフ=BarChart / 右=試験カレンダー・苦手HBarList。
- **カードで統一しない**。重要度で形式を変える（帯 > アラート > カード > sunkenメモ）。

## Quiz Library（features/quiz.tsx: LibraryScreen）
- ツールバー: SearchInput + Select(並び順) + Segmented(grid/list/compact)。
- 絞り込み: 科目Chip（複数）→ Tabs（すべて/公式/お気に入り/最近/自作）。
- 状態: normal / loading(Skeletonカード6) / empty / error / offline を必ず実装（デモはtopExtraのSegmentedで切替）。

## Quiz Player（features/quiz.tsx: PlayerScreen）
- 3層: bar（戻る・進捗・残りRing・一時停止・集中・一覧）/ body（`.qz-player__stage` 640px）/ foot（スキップ・解答/次へ・Kbdヒント）。
- 問型: single/cloze/multi = `.qz-choice`、bool = 2択、text = TextInput lg、order = 上下ボタン。
- 解答後: 正解 is-correct(pop) / 不正解 is-wrong(shake) / 他 is-dim。解説はAlertでfade-up。
- キーボード: 1-9選択 / Enter解答→次へ / F集中。一時停止中は問題文を隠す（カンニング防止）。

## Quiz Results（features/quiz.tsx: ResultsView）
- スコア: useCountUpで%表示 → 前回比/平均比 → StatCard×4（正解/不正解/未回答/Qredit）。
- 分析: HBarList(分野別) → 振り返りアコーディオン（自分の回答/正答/解説）。
- アクション: もう一度 / 間違えた問だけ / 保存 / Feedへ投稿。80%以上でConfetti1回。

## Feed（features/social.tsx）
- `.qz-feed`（main + 280px aside、~1023pxで1カラム）。PostCard = head/text/添付(スコアsunken・クイズhoverカード)/actions。
- 投稿作成: モーダル（モバイルはSheet化）。FABはモバイルのみ表示。
- いいね=social色+pop、保存=accent。詳細モーダルにコメントスレッド。

## Settings（features/tools.tsx）
- 左ナビ 220px + セクションCard（モバイルは横スクロールタブ）。
- 危険操作は専用セクション+赤枠Card+「削除」入力の2段階確認。

## Quick Chat（features/tools.tsx）
- 会話リスト240px（モバイル非表示）+ メッセージ列（760px中央）+ 入力Card。
- AI応答: thinkingドット → ストリーミング → アクション行（コピー/評価/再生成/クイズ化）。実行ログはdetailsで折り畳み。

## Sede（features/tools.tsx）
- grid: tree 200px / editor / AIチャット300px / ターミナル160px。~1023pxでエディタ+ターミナルのみ。
- AI差分提案は承認/却下の帯をエディタ下部に常設。

## Qredit / Card / QDP（features/qredit.tsx）
- Wallet: 残高カード（qredit色帯）+ StatCard×3 + DataTable(行クリック→詳細モーダル)。「現実の通貨ではない」を残高直下に常記。
- Card 3D: `.qz-card3d`。pointermoveでrotate±16°+光沢追従、クリックでflip、Enter対応。frozenはgrayscale。
- QDP: LineChart2系列 + クイズ別DataTable + 不正検知Alert。

## Admin（features/admin.tsx）
- 上部に常時Banner「管理者モード・監査ログ記録中」。タブ4枚。密度は高くてよいが部品は共通のまま。

## System States（features/admin.tsx: SystemStatesView）
- 404/500/offline/maintenance/permission/suspended。全状態で「次の行動」ボタンを必ず置く。500はエラーIDを表示。

## Onboarding（features/admin.tsx: OnboardingView）
- 3ステップ（学年→目標→時間）。全ステップスキップ可。選択はカード型（vq-card--selected）。
