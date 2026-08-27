/* ナビゲーションツリー — 実装済みページのみを登録する（デッドリンク禁止） */

export interface NavItem {
  path: string;
  ja: string;
  en: string;
  keywords?: string;
}

export interface NavSection {
  id: "overview" | "foundations" | "components" | "patterns" | "screens" | "playground";
  ja: string;
  en: string;
  items: NavItem[];
}

export const NAV: NavSection[] = [
  {
    id: "overview", ja: "Overview", en: "Overview",
    items: [
      { path: "/overview/welcome", ja: "Welcome", en: "Welcome" },
      { path: "/overview/getting-started", ja: "Getting Started", en: "Getting Started", keywords: "使い方 導入" },
      { path: "/overview/principles", ja: "Design Principles", en: "Design Principles", keywords: "原則" },
      { path: "/overview/release-notes", ja: "Release Notes", en: "Release Notes", keywords: "更新履歴" },
    ],
  },
  {
    id: "foundations", ja: "Foundations", en: "Foundations",
    items: [
      { path: "/foundations/colors", ja: "Colors", en: "Colors", keywords: "色 カラー" },
      { path: "/foundations/typography", ja: "Typography", en: "Typography", keywords: "文字 フォント" },
      { path: "/foundations/spacing", ja: "Spacing", en: "Spacing", keywords: "余白 スペース" },
      { path: "/foundations/radius", ja: "Radius & Borders", en: "Radius & Borders", keywords: "角丸 枠線" },
      { path: "/foundations/shadows", ja: "Shadows", en: "Shadows", keywords: "影" },
      { path: "/foundations/motion", ja: "Motion", en: "Motion", keywords: "アニメーション" },
      { path: "/foundations/icons", ja: "Icons", en: "Icons", keywords: "アイコン" },
      { path: "/foundations/layout", ja: "Layout & Responsive", en: "Layout & Responsive", keywords: "レイアウト グリッド レスポンシブ" },
      { path: "/foundations/accessibility", ja: "Accessibility", en: "Accessibility", keywords: "アクセシビリティ a11y" },
    ],
  },
  {
    id: "components", ja: "Components", en: "Components",
    items: [
      { path: "/components/buttons", ja: "Buttons", en: "Buttons", keywords: "ボタン" },
      { path: "/components/inputs", ja: "Inputs", en: "Inputs", keywords: "入力 フォーム テキスト パスワード 検索 OTP" },
      { path: "/components/selection", ja: "Selection Controls", en: "Selection Controls", keywords: "チェックボックス ラジオ スイッチ スライダー" },
      { path: "/components/tabs", ja: "Tabs & Segmented", en: "Tabs & Segmented", keywords: "タブ" },
      { path: "/components/display", ja: "Badges & Display", en: "Badges & Display", keywords: "バッジ タグ チップ アバター" },
      { path: "/components/cards", ja: "Cards & Lists", en: "Cards & Lists", keywords: "カード リスト" },
      { path: "/components/overlays", ja: "Overlays", en: "Overlays", keywords: "モーダル ドロワー ドロップダウン ツールチップ" },
      { path: "/components/feedback", ja: "Feedback & Status", en: "Feedback & Status", keywords: "アラート トースト 進捗 スケルトン 空状態" },
      { path: "/components/tables", ja: "Tables", en: "Tables", keywords: "テーブル 表" },
      { path: "/components/navigation", ja: "Navigation", en: "Navigation", keywords: "パンくず ページネーション コマンドパレット" },
      { path: "/components/charts", ja: "Charts", en: "Charts", keywords: "グラフ チャート" },
    ],
  },
  {
    id: "patterns", ja: "Patterns", en: "Patterns",
    items: [
      { path: "/patterns/authentication", ja: "Authentication", en: "Authentication", keywords: "認証 ログイン" },
      { path: "/patterns/app-shell", ja: "App Shell", en: "App Shell", keywords: "シェル ナビゲーション" },
      { path: "/patterns/states", ja: "Loading / Empty / Error", en: "Loading / Empty / Error", keywords: "状態" },
      { path: "/patterns/forms", ja: "Forms", en: "Forms", keywords: "フォーム バリデーション" },
      { path: "/patterns/celebration", ja: "Celebration & Feedback", en: "Celebration & Feedback", keywords: "祝福 正解" },
    ],
  },
  {
    id: "screens", ja: "Screens", en: "Screens",
    items: [
      { path: "/screens/splash", ja: "Splash & Intro", en: "Splash & Intro", keywords: "スプラッシュ オンボーディング 初回 イントロ" },
      { path: "/screens/welcome", ja: "Welcome", en: "Welcome", keywords: "ウェルカム 入口" },
      { path: "/screens/auth", ja: "Auth Flow", en: "Auth Flow", keywords: "ログイン 新規登録 パスワード再設定 OTP" },
      { path: "/screens/onboarding", ja: "初期設定", en: "Setup", keywords: "オンボーディング 学年 目標" },
      { path: "/screens/home", ja: "Home", en: "Home", keywords: "ホーム ダッシュボード" },
      { path: "/screens/library", ja: "Quiz Library", en: "Quiz Library", keywords: "ライブラリ 検索" },
      { path: "/screens/player", ja: "Quiz Player", en: "Quiz Player", keywords: "クイズ 出題" },
      { path: "/screens/results", ja: "Quiz Results", en: "Quiz Results", keywords: "結果 スコア" },
      { path: "/screens/preexam", ja: "PreExam", en: "PreExam", keywords: "試験対策 定期考査" },
      { path: "/screens/feed", ja: "Feed", en: "Feed", keywords: "フィード 投稿" },
      { path: "/screens/profile", ja: "Profile", en: "Profile", keywords: "プロフィール" },
      { path: "/screens/notifications", ja: "Notifications", en: "Notifications", keywords: "通知" },
      { path: "/screens/settings", ja: "Settings", en: "Settings", keywords: "設定" },
      { path: "/screens/quickchat", ja: "Quick Chat", en: "Quick Chat", keywords: "AI チャット" },
      { path: "/screens/sede", ja: "Sede", en: "Sede", keywords: "IDE エディタ" },
      { path: "/screens/qredit", ja: "Qredit Wallet", en: "Qredit Wallet", keywords: "残高 履歴" },
      { path: "/screens/qredit-card", ja: "Qredit Card", en: "Qredit Card", keywords: "カード 3D" },
      { path: "/screens/qdp", ja: "QDP Dashboard", en: "QDP Dashboard", keywords: "開発者 報酬 分析" },
      { path: "/screens/admin", ja: "Admin", en: "Admin", keywords: "管理 モデレーション" },
      { path: "/screens/system", ja: "System States", en: "System States", keywords: "404 500 オフライン メンテナンス" },
    ],
  },
  {
    id: "playground", ja: "Playground", en: "Playground",
    items: [
      { path: "/playground/motion", ja: "Motion Lab", en: "Motion Lab", keywords: "アニメーション 実験" },
      { path: "/playground/responsive", ja: "Responsive Lab", en: "Responsive Lab", keywords: "レスポンシブ" },
      { path: "/playground/stress", ja: "Japanese Text Test", en: "Japanese Text Test", keywords: "日本語 長文 ストレステスト" },
      { path: "/playground/theme", ja: "Theme Lab", en: "Theme Lab", keywords: "テーマ ダークモード" },
    ],
  },
];

export function findNavItem(path: string): { section: NavSection; item: NavItem } | null {
  for (const s of NAV) {
    const item = s.items.find((i) => i.path === path);
    if (item) return { section: s, item };
  }
  return null;
}
