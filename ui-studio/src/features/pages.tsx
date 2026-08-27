import React, { useState } from "react";
import { DocPage } from "../showcase/lib/Doc";
import { ScreenStage } from "../app/StudioShell";
import { Segmented } from "../ui/components";
import { AuthFlow, WelcomeScreen } from "./auth";
import type { AuthView } from "./auth";
import { HomeScreen, LibraryScreen, PlayerScreen, PreExamScreen, ResultsView } from "./quiz";
import { FeedScreen, NotificationsScreen, ProfileScreen } from "./social";
import { QuickChatScreen, SedeScreen, SettingsScreen } from "./tools";
import { QdpScreen, QreditCardScreen, QreditScreen } from "./qredit";
import { AdminScreen, OnboardingView, SystemStatesView } from "./admin";
import { IntroFlow } from "./onboarding";

/* Screens ページ = 説明 + デバイス幅つきステージ */
function ScreenPage({
  title, lede, children, minH,
}: { title: string; lede: string; children: React.ReactNode; minH?: number }) {
  return (
    <DocPage kicker="Screens" title={title} lede={lede} wide>
      <ScreenStage minH={minH}>{children}</ScreenStage>
    </DocPage>
  );
}

export function SWelcome() {
  return (
    <ScreenPage title="Welcome" lede="アプリを開いた最初の画面。マーケティングサイトではなく、VocabuQuizへ入るための入口。右側のプレビューは実UIの縮図で、モバイルでは非表示になる。">
      <WelcomeScreen />
    </ScreenPage>
  );
}

const AUTH_VIEWS: { id: AuthView; label: string }[] = [
  { id: "login", label: "Login" },
  { id: "signup", label: "Sign Up" },
  { id: "reset", label: "Reset" },
  { id: "twoFactor", label: "2FA" },
  { id: "locked", label: "Locked" },
  { id: "sessionExpired", label: "期限切れ" },
  { id: "maintenance", label: "メンテ" },
  { id: "networkError", label: "通信エラー" },
];

export function SAuth() {
  const [view, setView] = useState<AuthView>("login");
  return (
    <DocPage
      kicker="Screens"
      title="Auth Flow"
      lede="実際に入力・検証・送信できる認証システム。ログイン失敗3回でロック、パスワード強度メーター、CapsLock警告、OTP再送カウントダウンまで動作する。デモ: パスワード correct で成功、OTP 123456。"
      wide
    >
      <div style={{ display: "flex", justifyContent: "center", marginBottom: "calc(var(--vq-sp-6) * -1 + 8px)" }}>
        <Segmented ariaLabel="認証画面の状態" value={view} onChange={(v) => setView(v as AuthView)} items={AUTH_VIEWS.map((v) => ({ id: v.id, label: v.label }))} />
      </div>
      <ScreenStage minH={620}>
        <AuthFlow initial={view} key={view} />
      </ScreenStage>
    </DocPage>
  );
}

export function SSplash() {
  return (
    <ScreenPage title="Splash & Intro" lede="初回起動の体験。ロゴのSplash（自動で進む・タップでも可）→ プロダクト紹介3枚（作成/分析/AI提案）→ 登録導線。すべてスキップ可能で、イラストは軽く浮遊する（reduced-motionで停止）。" minH={640}>
      <IntroFlow />
    </ScreenPage>
  );
}

export function SOnboarding() {
  return (
    <ScreenPage title="初期設定" lede="登録直後の3ステップ初期設定。学年→目標→学習時間。すべてスキップ可能で、選択はホームのおすすめに反映される。（初回起動のイントロは Splash & Intro を参照）">
      <OnboardingView />
    </ScreenPage>
  );
}

export function SHome() {
  return (
    <ScreenPage title="Home" lede="学習の司令塔。続きから再開・AI提案・今週のグラフ・試験カレンダー・苦手トップ3。カード羅列ではなく重要度で情報形式を変えている。モバイル幅ではBottom Navigationに切り替わる。">
      <HomeScreen />
    </ScreenPage>
  );
}

export function SLibrary() {
  return (
    <ScreenPage title="Quiz Library" lede="検索・科目チップ・タブ・表示形式切替がすべて実動作。右上のセグメントで Loading / 0件 / Error / Offline の各状態を確認できる。">
      <LibraryScreen />
    </ScreenPage>
  );
}

export function SPlayer() {
  return (
    <ScreenPage
      title="Quiz Player"
      lede="VocabuQuizの中心画面。6問型（単一選択・複数選択・正誤・記述・並べ替え・穴埋め）、残り時間リング、一時停止、フラグ、問題一覧ドロワー、集中モード(F)、キーボード操作(1-4/Enter)が動作する。最後まで解くと結果画面へ。"
      minH={640}
    >
      <PlayerScreen embedded />
    </ScreenPage>
  );
}

export function SResults() {
  return (
    <ScreenPage title="Quiz Results" lede="スコアのカウントアップ、前回/平均との比較、分野別分析、問題ごとの振り返り（アコーディオン）、再挑戦導線。80%以上なら控えめな紙吹雪が1回だけ舞う。">
      <ResultsView />
    </ScreenPage>
  );
}

export function SPreExam() {
  return (
    <ScreenPage title="PreExam" lede="定期考査・模試に特化した対策ハブ。試験までの残り日数、対策進捗リング、本番形式の模擬試験、科目別の状況。落ち着いた実用画面。">
      <PreExamScreen />
    </ScreenPage>
  );
}

export function SFeed() {
  return (
    <ScreenPage title="Feed" lede="学習コミュニティ。テキスト・クイズ共有・スコア共有の3種の投稿、いいね（アニメつき）、保存、コメントスレッド、投稿作成モーダル。モバイルではFABから投稿。">
      <FeedScreen />
    </ScreenPage>
  );
}

export function SProfile() {
  return (
    <ScreenPage title="Profile" lede="カバー・アバター・実績バッジ・4タブ（作成クイズ/投稿/保存/学習記録）。フォロー/フォロワー数をタップするとモーダルで一覧表示。">
      <ProfileScreen />
    </ScreenPage>
  );
}

export function SNotifications() {
  return (
    <ScreenPage title="Notifications" lede="種類別アイコン＋未読ハイライト。セグメントで未読/システム/Qreditに絞り込み。0件時はEmptyState。">
      <NotificationsScreen />
    </ScreenPage>
  );
}

export function SSettings() {
  return (
    <ScreenPage title="Settings" lede="左ナビ＋セクション構成（モバイルでは横スクロールタブ化）。危険な操作は通常設定から分離し、削除は「削除」の入力を要求する2段階確認。">
      <SettingsScreen />
    </ScreenPage>
  );
}

export function SQuickChat() {
  return (
    <ScreenPage title="Quick Chat" lede="AI学習チャット。ストリーミング表示・Thinking状態・実行ログの折り畳み・コピー/評価/再生成・「この内容でクイズを作る」導線。実際に送信するとデモ応答が流れる。" minH={640}>
      <QuickChatScreen />
    </ScreenPage>
  );
}

export function SSede() {
  return (
    <ScreenPage title="Sede" lede="VocabuQuiz内蔵のAI IDE。ファイルツリー・エディタ・AI差分提案（承認/却下）・ターミナル・実行/デプロイ。モバイル幅ではエディタ中心の1カラムに畳まれる。" minH={640}>
      <SedeScreen />
    </ScreenPage>
  );
}

export function SQredit() {
  return (
    <ScreenPage title="Qredit Wallet" lede="残高・獲得/利用/保留のKPI・明細テーブル（行クリックで詳細モーダル）・送金モーダル。「現実の通貨ではない」ことを常に明示。">
      <QreditScreen />
    </ScreenPage>
  );
}

export function SQreditCard() {
  return (
    <ScreenPage title="Qredit Card" lede="3Dバーチャルカード。ポインター移動で傾き＋光沢が追従、クリック（またはEnter）で裏返る。セキュアコードの表示/非表示、番号コピー、一時停止/再開。">
      <QreditCardScreen />
    </ScreenPage>
  );
}

export function SQdp() {
  return (
    <ScreenPage title="QDP Dashboard" lede="クイズ開発者プログラムの分析画面。表示数/完走数の2系列チャート（crosshair付き）、クイズ別成績テーブル、審査状態、不正検知の通知。">
      <QdpScreen />
    </ScreenPage>
  );
}

export function SAdmin() {
  return (
    <ScreenPage title="Admin" lede="運営用コンソール。同じデザインシステムのまま情報密度だけ高めている。モデレーションキューの審査モーダル、ユーザー管理、システム状態、監査ログ。">
      <AdminScreen />
    </ScreenPage>
  );
}

export function SSystem() {
  return (
    <ScreenPage title="System States" lede="404 / 500 / オフライン / メンテナンス / 権限なし / アカウント凍結。全状態で「次の行動」を必ず提示し、責めない文言に統一。">
      <SystemStatesView />
    </ScreenPage>
  );
}

/* ═══ フルスクリーンプレビュー ═══════════════════════════════ */
const FULL_MAP: Record<string, React.ComponentType> = {
  welcome: WelcomeScreen,
  auth: () => <AuthFlow />,
  splash: IntroFlow,
  onboarding: OnboardingView,
  home: HomeScreen,
  library: LibraryScreen,
  player: () => <PlayerScreen embedded />,
  results: () => <ResultsView />,
  preexam: PreExamScreen,
  feed: FeedScreen,
  profile: ProfileScreen,
  notifications: NotificationsScreen,
  settings: SettingsScreen,
  quickchat: QuickChatScreen,
  sede: SedeScreen,
  qredit: QreditScreen,
  "qredit-card": QreditCardScreen,
  qdp: QdpScreen,
  admin: AdminScreen,
  system: SystemStatesView,
};

export function FullScreenView({ id }: { id: string }) {
  const Comp = FULL_MAP[id];
  if (!Comp) {
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "60vh", color: "var(--vq-text-tertiary)" }}>
        「{id}」というスクリーンはありません
      </div>
    );
  }
  return <div style={{ minHeight: "100dvh" }}><Comp /></div>;
}
