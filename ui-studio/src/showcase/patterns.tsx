import React, { useState } from "react";
import { Check, PartyPopper, RefreshCw, Sparkles, X } from "lucide-react";
import { Demo, DocPage, DoDont, Section, SpecTable } from "./lib/Doc";
import {
  Alert, Badge, Button, Card, EmptyState, Field, PasswordInput, Progress,
  Skeleton, Spinner, Stepper, TextInput, useToast,
} from "../ui/components";
import { Link } from "../app/router";

/* ═══ Authentication pattern ═══════════════════════════════ */
export function PAuth() {
  return (
    <DocPage
      kicker="Patterns"
      title="Authentication"
      lede="認証は「入口の体験」。中央にカード1枚ではなく、左に信頼を語るサイド、右にフォームの2カラムで画面全体を設計する。実動作は Screens > Auth Flow で確認。"
    >
      <Section title="構成ルール">
        <SpecTable
          head={["要素", "ルール"]}
          rows={[
            ["レイアウト", "PC: 左=ブランド/引用サイド + 右=フォーム。モバイル: フォームのみ（サイドは非表示）"],
            ["入力", "ラベル必須・placeholderはラベルの代替にしない・エラーは入力欄の直下に文章で"],
            ["パスワード", "表示切替 + CapsLock警告 + 強度メーター（4段）を標準装備"],
            ["失敗", "残り試行回数を伝える。3回失敗でロック画面に誘導し、途方に暮れさせない"],
            ["遷移", "進む=右から、戻る=左からのスライド。ブラウザ戻ると同じ方向感覚"],
            ["文言", "「エラー: AUTH_401」ではなく「IDまたはパスワードが違います」+ 次の行動"],
          ]}
        />
      </Section>
      <Section title="全11状態" desc="Login / Sign Up / Reset / New Password / Verify / OTP / 2FA / Locked / Session Expired / Maintenance / Network Error — すべて Screens > Auth Flow に実装済み。">
        <Demo>
          <Link to="/screens/auth"><Button>Auth Flow を開く</Button></Link>
        </Demo>
      </Section>
      <Section title="Do / Don't">
        <DoDont
          doTitle="失敗しても前に進める"
          doBody="ロック時は「パスワード再設定」への導線を主ボタンで提示。待つ以外の選択肢を必ず残す。"
          dontTitle="不安を煽らない"
          dontBody="赤い全画面、点滅、大音量の警告アイコンは使わない。認証エラーは日常であり、事故ではない。"
        />
      </Section>
    </DocPage>
  );
}

/* ═══ App Shell pattern ════════════════════════════════════ */
export function PShell() {
  return (
    <DocPage
      kicker="Patterns"
      title="App Shell"
      lede="全画面共通の骨格。PC=左サイドバー+トップバー、モバイル=Bottom Navigation。AppFrame コンポーネント1つで両対応する。"
    >
      <Section title="構成">
        <SpecTable
          head={["領域", "PC", "モバイル"]}
          rows={[
            ["主要ナビ", "サイドバー上段（ホーム/クイズ/PreExam/作成/Feed）", "Bottom Nav 5項目（作成は中央）"],
            ["ツール", "サイドバー中段（Quick Chat/Sede/通知/Qredit）", "ホーム内の導線＋ドロワー"],
            ["アカウント", "サイドバー下段（プロフィール/設定/ユーザーカード）", "Bottom Nav「マイページ」"],
            ["権限メニュー", "QDP/Admin/Moderation はロールがある時だけ表示", "同左（ドロワー内）"],
            ["ページ見出し", "トップバー（sticky・blur背景）", "コンパクトヘッダ"],
          ]}
        />
      </Section>
      <Section title="レイヤー構造" desc="重なりは z-index トークンで管理。コンテンツ(0) → sticky bar(20) → FAB(25) → Bottom Nav(30) → Drawer(100) → Modal(100) → Toast(300)。">
        <Demo>
          <Link to="/screens/home"><Button>Home で実物を見る</Button></Link>
          <Link to="/screens/feed"><Button variant="outline">Feed（FAB+右パネル）を見る</Button></Link>
        </Demo>
      </Section>
    </DocPage>
  );
}

/* ═══ States pattern ═══════════════════════════════════════ */
export function PStates() {
  const [demo, setDemo] = useState<"loading" | "empty" | "error" | "ok">("loading");
  return (
    <DocPage
      kicker="Patterns"
      title="Loading / Empty / Error"
      lede="正常系だけの画面は未完成。すべての一覧・詳細・フォームは4状態（Loading / Empty / Error / OK）を持つ。"
    >
      <Section title="切り替えデモ">
        <div className="vq-row" style={{ gap: "var(--vq-sp-3)", marginBottom: "var(--vq-sp-5)", flexWrap: "wrap" }}>
          {(["loading", "empty", "error", "ok"] as const).map((s) => (
            <Button key={s} size="sm" variant={demo === s ? "primary" : "outline"} onClick={() => setDemo(s)}>{s}</Button>
          ))}
        </div>
        <Card pad={false} style={{ minHeight: 220 }}>
          {demo === "loading" && (
            <div style={{ padding: "var(--vq-sp-6)" }} role="status" aria-label="読み込み中" className="vq-stack">
              {[0, 1, 2].map((i) => (
                <div key={i} className="vq-row" style={{ gap: "var(--vq-sp-4)", padding: "var(--vq-sp-4) 0" }}>
                  <Skeleton circle width={36} height={36} />
                  <div className="vq-grow vq-stack" style={{ gap: 8 }}>
                    <Skeleton width={`${70 - i * 12}%`} />
                    <Skeleton width="38%" height={10} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {demo === "empty" && (
            <EmptyState
              title="まだクイズがありません"
              description="最初のクイズを作ってみましょう。PDFや教科書の写真からAIが下書きを作ることもできます。"
              actions={<><Button>クイズを作成</Button><Button variant="outline" icon={<Sparkles size={14} />}>AIで生成</Button></>}
            />
          )}
          {demo === "error" && (
            <EmptyState
              icon={<X size={22} />}
              title="読み込みに失敗しました"
              description="通信状態を確認して再試行してください。何度も失敗する場合はシステム状態をご確認ください。"
              actions={<><Button icon={<RefreshCw size={14} />} onClick={() => setDemo("loading")}>再試行</Button><Button variant="ghost">システム状態</Button></>}
            />
          )}
          {demo === "ok" && (
            <div style={{ padding: "var(--vq-sp-6)" }}>
              <Alert tone="success" title="正常に読み込みました">通常コンテンツが表示されます。</Alert>
            </div>
          )}
        </Card>
      </Section>
      <Section title="ルール">
        <SpecTable
          head={["状態", "原則"]}
          rows={[
            ["Loading", "実レイアウトと同形のスケルトン。3秒超えたら文言つき（「まだ読み込んでいます…」）"],
            ["Empty", "責めない・次の行動を1〜2個提示・初回(First Use)と結果0件で文言を分ける"],
            ["Error", "原因の要約＋再試行。技術コードは補助表示。入力値は絶対に消さない"],
            ["Partial Failure", "読めた部分は表示し、失敗した区画だけインラインでエラー"],
          ]}
        />
      </Section>
    </DocPage>
  );
}

/* ═══ Forms pattern ════════════════════════════════════════ */
export function PForms() {
  const [pw, setPw] = useState("");
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <DocPage
      kicker="Patterns"
      title="Forms"
      lede="フォームは1カラムが基本。検証は「入力が終わった瞬間」に行い、送信ボタンで初めて全体を検証する。送信中は必ずボタンをLoadingにする。"
    >
      <Section title="標準フォーム">
        <Demo col style={{ maxWidth: 440 }}>
          <Field label="クイズ名" required hint="あとから変更できます">
            {(a) => <TextInput id={a.id} placeholder="例: 期末考査対策 英単語" />}
          </Field>
          <Field label="合言葉（任意）" hint="設定すると知っている人だけが挑戦できます">
            {(a) => <PasswordInput id={a.id} value={pw} onChange={(e) => setPw(e.target.value)} />}
          </Field>
          <div className="vq-row" style={{ gap: "var(--vq-sp-4)", justifyContent: "flex-end" }}>
            <Button variant="ghost">キャンセル</Button>
            <Button loading={busy} onClick={() => { setBusy(true); setTimeout(() => { setBusy(false); toast({ title: "保存しました", tone: "success" }); }, 1200); }}>保存</Button>
          </div>
        </Demo>
      </Section>
      <Section title="複数ステップ" desc="3ステップ以上はStepperで現在地を示す。戻っても入力値は保持する。">
        <Demo col>
          <Stepper steps={["基本情報", "問題の追加", "公開設定"]} current={1} />
        </Demo>
      </Section>
      <Section title="ルール">
        <SpecTable
          head={["項目", "基準"]}
          rows={[
            ["検証タイミング", "blur時に単項目検証。送信時に全体検証し、最初のエラーへフォーカス移動"],
            ["送信中", "ボタンLoading + 二重送信防止。3秒超は進捗文言"],
            ["破壊的変更の離脱", "未保存で戻る場合は確認モーダル（保存して離脱を主ボタン）"],
            ["モバイル", "入力中はBottom Navを隠す。type/inputmodeで適切なキーボードを出す"],
          ]}
        />
      </Section>
    </DocPage>
  );
}

/* ═══ Celebration pattern ══════════════════════════════════ */
export function PCelebration() {
  const [correct, setCorrect] = useState<null | boolean>(null);
  return (
    <DocPage
      kicker="Patterns"
      title="Celebration & Feedback"
      lede="喜びの演出は「学習の節目」にだけ。毎回の正解は小さく祝い、大きな達成（80%以上・連続記録）だけ紙吹雪を出す。"
    >
      <Section title="正解 / 不正解のフィードバック">
        <Demo col style={{ maxWidth: 440 }}>
          <div className="vq-row" style={{ gap: "var(--vq-sp-4)" }}>
            <Button variant="success" icon={<Check size={15} />} onClick={() => setCorrect(true)}>正解を再生</Button>
            <Button variant="danger-soft" icon={<X size={15} />} onClick={() => setCorrect(false)}>不正解を再生</Button>
          </div>
          {correct != null && (
            <button
              key={String(correct) + Math.random()}
              className={`qz-choice ${correct ? "is-correct" : "is-wrong"}`}
              disabled
            >
              <span className="qz-choice__key">{correct ? <Check size={14} /> : <X size={14} />}</span>
              {correct ? "相当な — vq-pop（スプリング・280ms）で小さく弾む" : "わずかな — vq-shake（400ms）で横に揺れる"}
            </button>
          )}
        </Demo>
      </Section>
      <Section title="強さの段階">
        <SpecTable
          head={["イベント", "演出", "上限"]}
          rows={[
            ["1問正解", "選択肢が vq-pop + 緑", "毎回OK（120ms級）"],
            ["連続正解 5問", "トースト「5問連続正解！」", "セッション1回"],
            ["スコア表示", "カウントアップ 1.1s + 色", "毎回OK"],
            [<><PartyPopper size={13} style={{ verticalAlign: -2 }} /> 80%以上 / 自己ベスト</>, "紙吹雪 26片・2.4秒・1回のみ", "結果画面のみ"],
            ["連続学習の節目 (7/30/100日)", "ホームでバッジ授与モーダル", "その日1回"],
          ]}
        />
      </Section>
      <Section title="Do / Don't">
        <DoDont
          doTitle="reduced-motionを尊重"
          doBody="紙吹雪・pop・shakeはすべて prefers-reduced-motion で消える。その場合も色とテキストで結果は完全に伝わる。"
          dontTitle="毎回の過剰演出"
          dontBody="全問正解のたびに画面全体の紙吹雪・効果音・フルスクリーン演出を出すと、3日で無視されるようになる。"
        />
      </Section>
    </DocPage>
  );
}
