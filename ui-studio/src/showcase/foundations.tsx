import React, { useState } from "react";
import {
  ArrowRight, Bell, BookOpen, Check, ChevronRight, CircleHelp, Clock, Coins,
  Heart, Home, Keyboard, Layers, Pencil, Play, Plus, Search, Settings,
  Sparkles, Star, Trash2, Trophy, User, X, Zap,
} from "lucide-react";
import { Demo, DocPage, DoDont, Section, SpecTable } from "./lib/Doc";
import { Badge, Button, Card, Checkbox, Progress, TextInput } from "../ui/components";

/* ═══ Colors ═══════════════════════════════════════════════ */
function Swatch({ name, varName, text }: { name: string; varName: string; text?: string }) {
  return (
    <div className="doc-swatch">
      <div className="doc-swatch__color" style={{ background: `var(${varName})` }}>
        {text && (
          <div style={{ height: "100%", display: "grid", placeItems: "center", color: `var(${text})`, font: "var(--vq-type-label)" }}>
            あア Aa 123
          </div>
        )}
      </div>
      <div className="doc-swatch__meta">
        <div className="doc-swatch__name">{name}</div>
        <div className="doc-swatch__value">{varName}</div>
      </div>
    </div>
  );
}

export function FColors() {
  return (
    <DocPage
      kicker="Foundations"
      title="Colors"
      lede="色は必ずセマンティックトークンで指定する。生のHEXや汎用パレット（--vq-lav-600 等）をコンポーネントから直接参照しない。基調は白 × 柔らかいラベンダー。"
    >
      <Section title="Background / Surface" desc="画面は Background → Surface → Text の3層。カードの重なりは影ではなくこの階層差で表現する。">
        <div className="doc-grid">
          <Swatch name="background" varName="--vq-bg" />
          <Swatch name="background-subtle" varName="--vq-bg-subtle" />
          <Swatch name="background-elevated" varName="--vq-bg-elevated" />
          <Swatch name="surface" varName="--vq-surface" />
          <Swatch name="surface-hover" varName="--vq-surface-hover" />
          <Swatch name="surface-selected" varName="--vq-surface-selected" />
          <Swatch name="surface-sunken" varName="--vq-surface-sunken" />
          <Swatch name="border / border-strong" varName="--vq-border" />
        </div>
      </Section>

      <Section title="Text" desc="本文は text、補足は text-secondary、ヒントは text-tertiary。3段より細かく使い分けない。">
        <Demo col>
          <p style={{ color: "var(--vq-text)", font: "var(--vq-type-body-lg)" }}>text — クイズで、テスト勉強はもっと効率的になる。</p>
          <p style={{ color: "var(--vq-text-secondary)", font: "var(--vq-type-body-md)" }}>text-secondary — 昨日の続きから、今日の10分をはじめよう。</p>
          <p style={{ color: "var(--vq-text-tertiary)", font: "var(--vq-type-body-sm)" }}>text-tertiary — 最終更新: 3時間前 · 42問 · 高2</p>
          <p style={{ color: "var(--vq-text-disabled)", font: "var(--vq-type-body-sm)" }}>text-disabled — この機能は現在利用できません</p>
        </Demo>
      </Section>

      <Section title="Accent" desc="ブランドのラベンダー（#756DB3）は主要アクション・現在位置・選択状態・進捗に限定して使う。画面の面積の5%以下が目安。画面全体を紫に塗らない。">
        <div className="doc-grid">
          <Swatch name="accent" varName="--vq-accent" text="--vq-accent-contrast" />
          <Swatch name="accent-hover" varName="--vq-accent-hover" text="--vq-accent-contrast" />
          <Swatch name="accent-subtle" varName="--vq-accent-subtle" text="--vq-accent-text" />
          <Swatch name="focus ring" varName="--vq-border-focus" />
        </div>
      </Section>

      <Section title="Status" desc="意味色。成功・警告・危険・情報。アイコンやテキストを必ず併記し、色だけで意味を伝えない。">
        <div className="doc-grid">
          <Swatch name="success" varName="--vq-success" />
          <Swatch name="warning" varName="--vq-warning" />
          <Swatch name="danger" varName="--vq-danger" />
          <Swatch name="info" varName="--vq-info" />
        </div>
      </Section>

      <Section title="Domain" desc="VocabuQuiz 固有の意味色。この対応は全画面で固定。">
        <div className="doc-grid">
          <Swatch name="quiz-correct（正解）" varName="--vq-quiz-correct" />
          <Swatch name="quiz-incorrect（不正解）" varName="--vq-quiz-incorrect" />
          <Swatch name="quiz-unanswered（未回答）" varName="--vq-quiz-unanswered" />
          <Swatch name="favorite（お気に入り）" varName="--vq-favorite" />
          <Swatch name="ai（AI機能）" varName="--vq-ai" />
          <Swatch name="qredit（Qredit）" varName="--vq-qredit" />
          <Swatch name="admin（管理機能）" varName="--vq-admin" />
          <Swatch name="social（コミュニティ）" varName="--vq-social" />
        </div>
      </Section>

      <Section title="Charts" desc="カテゴリカル配色（固定順・循環禁止）。色覚多様性6チェックを light / dark 両方で検証済み。7系列以上は「その他」へ畳む。">
        <Demo>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="vq-row" style={{ gap: 8 }}>
              <span style={{ width: 28, height: 28, borderRadius: 8, background: `var(--vq-chart-${i})` }} />
              <code style={{ font: "var(--vq-type-code)", fontSize: 11, color: "var(--vq-text-tertiary)" }}>chart-{i}</code>
            </div>
          ))}
        </Demo>
      </Section>

      <Section title="ルール">
        <DoDont
          doTitle="セマンティックに指定する"
          doBody={<>「主要アクションだから <code>--vq-accent</code>」「正解だから <code>--vq-quiz-correct</code>」。意味 → トークンの順で選ぶ。</>}
          dontTitle="見た目で選ばない"
          dontBody={<>「ここは青が映えるから <code>#4f6ef7</code>」は禁止。新しい色が必要になったら、まず tokens.css に意味を定義する。</>}
        />
      </Section>
    </DocPage>
  );
}

/* ═══ Typography ═══════════════════════════════════════════ */
export function FTypography() {
  const styles: { name: string; token: string; sample: string }[] = [
    { name: "display", token: "--vq-type-display", sample: "学びを、続けられる形に。" },
    { name: "heading-xl", token: "--vq-type-heading-xl", sample: "今週の学習サマリー" },
    { name: "heading-lg", token: "--vq-type-heading-lg", sample: "共通テスト英語 語彙レベル判定" },
    { name: "heading-md", token: "--vq-type-heading-md", sample: "間違えた問題をもう一度" },
    { name: "heading-sm", token: "--vq-type-heading-sm", sample: "分野別の正答率" },
    { name: "body-lg", token: "--vq-type-body-lg", sample: "毎日の10分が、定期考査の30点になる。VocabuQuizは、あなたの理解度に合わせて出題を最適化します。" },
    { name: "body-md", token: "--vq-type-body-md", sample: "put off と postpone が「延期する」。call off は「中止する」、bring up は「話題に出す・育てる」です。" },
    { name: "body-sm", token: "--vq-type-body-sm", sample: "最終更新: 3時間前 · このクイズは定期考査の範囲に対応しています。" },
    { name: "label", token: "--vq-type-label", sample: "学年を選択" },
    { name: "caption", token: "--vq-type-caption", sample: "12,840回プレイ · 正答率 78%" },
  ];
  return (
    <DocPage
      kicker="Foundations"
      title="Typography"
      lede="日本語の長文を前提に、本文は行間 1.8 以上・字間 +1%。見出しは少し丸みのあるスタック（ui-rounded / ヒラギノ丸ゴ）、本文は読みやすいゴシック（ヒラギノ→Noto Sans JP）で統一する。"
    >
      <Section title="Type scale">
        <div className="vq-stack" style={{ gap: 0 }}>
          {styles.map((s) => (
            <div key={s.name} className="vq-row" style={{ gap: "var(--vq-sp-8)", padding: "var(--vq-sp-6) 0", borderBottom: "1px solid var(--vq-border-subtle)", alignItems: "baseline", flexWrap: "wrap" }}>
              <code style={{ width: 120, flex: "0 0 auto", font: "var(--vq-type-code)", fontSize: 12, color: "var(--vq-text-tertiary)" }}>{s.name}</code>
              <span style={{ font: `var(${s.token})`, minWidth: 0 }}>{s.sample}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="数値" desc="スコア・残高・統計は必ず等幅数字（tabular-nums）。桁が動くとカウントアップや表が崩れる。">
        <Demo>
          <div>
            <div style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)", marginBottom: 4 }}>proportional（禁止）</div>
            <div style={{ fontSize: 28, fontWeight: 750 }}>11,111 / 98,765</div>
          </div>
          <div>
            <div style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)", marginBottom: 4 }}>tabular-nums（.vq-num）</div>
            <div className="vq-num" style={{ fontSize: 28, fontWeight: 750 }}>11,111 / 98,765</div>
          </div>
        </Demo>
      </Section>

      <Section title="ルール">
        <SpecTable
          head={["項目", "基準"]}
          rows={[
            ["本文の行間", <>日本語 1.8（<code>body-md</code>）。詰まった行間で日本語を潰さない</>],
            ["見出しの字間", <>-1%（<code>--vq-tracking-tight</code>）。本文は +0.8%</>],
            ["最小サイズ", "11.5px（caption）。それ未満は使わない"],
            ["行長", "本文は全角40字（約640px）を上限にする"],
            ["強調", <>太さ（600〜750）で行う。色変えの強調はリンクと状態色のみ</>],
          ]}
        />
      </Section>
    </DocPage>
  );
}

/* ═══ Spacing ══════════════════════════════════════════════ */
export function FSpacing() {
  const steps = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
  const px = [2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80];
  return (
    <DocPage
      kicker="Foundations"
      title="Spacing"
      lede="間隔は13段のスケールから選ぶ。1画面の中で使う段数は4〜5段まで。「なんとなく10px」を作らない。"
    >
      <Section title="Scale">
        <Demo col>
          {steps.map((s, i) => (
            <div key={s} className="vq-row" style={{ gap: "var(--vq-sp-6)" }}>
              <code style={{ width: 90, font: "var(--vq-type-code)", fontSize: 12, color: "var(--vq-text-tertiary)" }}>--vq-sp-{s}</code>
              <span style={{ width: px[i], height: 16, background: "var(--vq-accent-subtle)", border: "1px solid var(--vq-accent)", borderRadius: 3, flex: "0 0 auto" }} />
              <span className="vq-num" style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)" }}>{px[i]}px</span>
            </div>
          ))}
        </Demo>
      </Section>
      <Section title="使い分けの目安">
        <SpecTable
          head={["距離", "トークン", "例"]}
          rows={[
            ["アイコンとテキストの間", <code>sp-2 / sp-3</code>, "ボタン内部、リスト行"],
            ["ラベルと入力欄の間", <code>sp-3</code>, "フォーム"],
            ["関連する要素同士", <code>sp-4 / sp-5</code>, "カード内の行間"],
            ["カードの内側余白", <code>sp-6 / sp-7</code>, "--vq-card-p"],
            ["カード同士・グリッドgap", <code>sp-6</code>, "ダッシュボード"],
            ["セクションの区切り", <code>sp-9 / sp-10</code>, "ページ内の大区切り"],
            ["ページ上下の余白", <code>sp-9 〜 sp-13</code>, "コンテンツ領域"],
          ]}
        />
      </Section>
      <Section title="ルール">
        <DoDont
          doTitle="近接で関係を示す"
          doBody="関係が強いほど近く。ラベルは自分の入力欄に寄り、隣のフォーム行からは離れる。余白の差だけでグルーピングが伝わる状態が正しい。"
          dontTitle="均等余白で埋めない"
          dontBody="全要素を16px間隔で並べると構造が消える。見出し・本文・区切りで余白に強弱をつける。"
        />
      </Section>
    </DocPage>
  );
}

/* ═══ Radius & Borders ═════════════════════════════════════ */
export function FRadius() {
  const radii = [
    { name: "xs", px: 6, use: "Kbd・小さなインラインUI" },
    { name: "sm", px: 10, use: "小ボタン・タグ・メニュー項目" },
    { name: "md", px: 14, use: "ボタン・入力欄（標準）" },
    { name: "lg", px: 18, use: "カード・選択肢・テーブル外枠" },
    { name: "xl", px: 22, use: "モーダル・大型パネル" },
    { name: "2xl", px: 28, use: "Bottom Sheet 上端・特大パネル" },
    { name: "full", px: 999, use: "バッジ・アバター・チップ・Segmented" },
  ];
  return (
    <DocPage
      kicker="Foundations"
      title="Radius & Borders"
      lede="角丸は全体的に柔らかく。標準コントロールは 14px、カードは 18px。ただしボタンまで完全なピル型にはしない — 丸みは「親しみ」、ピル乱用は「幼さ」。"
    >
      <Section title="Radius scale">
        <div className="doc-grid">
          {radii.map((r) => (
            <div key={r.name} className="doc-swatch">
              <div style={{ padding: "var(--vq-sp-6)", display: "grid", placeItems: "center" }}>
                <span style={{ width: 72, height: 48, background: "var(--vq-accent-subtle)", border: "1.5px solid var(--vq-accent)", borderRadius: `var(--vq-r-${r.name})` }} />
              </div>
              <div className="doc-swatch__meta">
                <div className="doc-swatch__name">r-{r.name} <span className="vq-num" style={{ color: "var(--vq-text-tertiary)" }}>({r.px === 999 ? "full" : `${r.px}px`})</span></div>
                <div className="doc-swatch__value">{r.use}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Borders">
        <SpecTable
          head={["トークン", "用途"]}
          rows={[
            [<code>--vq-border-subtle</code>, "カード枠・区切りの最弱。背景との差が主張しない"],
            [<code>--vq-border</code>, "標準。入力欄・テーブル罫線・ディバイダー"],
            [<code>--vq-border-strong</code>, "ホバー時の枠・スクロールバー"],
            [<code>--vq-border-focus</code>, "フォーカスリングの色。太さは2px＋オフセット2px"],
          ]}
        />
      </Section>
      <Section title="ルール">
        <DoDont
          doTitle="内側ほど小さく"
          doBody="外側のカードが12pxなら、内側のボタンは8px。ネストで角丸を逆転させない。"
          dontTitle="巨大角丸・カラーバー"
          dontBody="24px超の角丸ボタン、カード左端の色帯（border-left: 4px solid）は旧世代の装飾。使わない。"
        />
      </Section>
    </DocPage>
  );
}

/* ═══ Shadows ══════════════════════════════════════════════ */
export function FShadows() {
  const shadows = [
    { name: "subtle", use: "カードの基本。境界の補助" },
    { name: "raised", use: "ホバーで浮くカード・ポップな要素" },
    { name: "floating", use: "ドロップダウン・ポップオーバー・トースト" },
    { name: "modal", use: "モーダル・ドロワー（最上位のみ）" },
  ];
  return (
    <DocPage
      kicker="Foundations"
      title="Shadows"
      lede="影は階層の表現。4段だけ。強い影で高級感を出そうとしない — 高級感は余白とタイポグラフィで出す。"
    >
      <Section title="Elevation">
        <div className="doc-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
          {shadows.map((s) => (
            <div key={s.name} style={{ padding: "var(--vq-sp-6)" }}>
              <div style={{ height: 90, borderRadius: "var(--vq-r-lg)", background: "var(--vq-surface)", border: "1px solid var(--vq-border-subtle)", boxShadow: `var(--vq-shadow-${s.name})`, display: "grid", placeItems: "center", font: "var(--vq-type-label)" }}>
                {s.name}
              </div>
              <div style={{ marginTop: "var(--vq-sp-4)", font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)" }}>{s.use}</div>
            </div>
          ))}
        </div>
      </Section>
      <Section title="ルール">
        <DoDont
          doTitle="1画面に浮く要素は少なく"
          doBody="常設UIは subtle まで。floating 以上は「いま開いている一時的なもの」にだけ与える。"
          dontTitle="全カードを浮かせない"
          dontBody="一覧の全カードに raised 以上を付けると、どれも重要に見えず、どれも重要でなくなる。"
        />
      </Section>
    </DocPage>
  );
}

/* ═══ Motion ═══════════════════════════════════════════════ */
export function FMotion() {
  const [runKey, setRunKey] = useState(0);
  const durations = [
    { name: "instant", ms: 0, use: "即時。トグルの論理状態" },
    { name: "fast", ms: 120, use: "ホバー・押下・色変化" },
    { name: "normal", ms: 200, use: "メニュー・ツールチップ出現" },
    { name: "slow", ms: 300, use: "モーダル・シート・ページ遷移" },
    { name: "deliberate", ms: 420, use: "祝福・スコア表示・初回のみの演出" },
  ];
  return (
    <DocPage
      kicker="Foundations"
      title="Motion"
      lede="モーションは状態変化のフィードバック。装飾ではない。時間は5段階、イージングは4種のみ。prefers-reduced-motion で全て無効化できることが必須。"
    >
      <Section title="Durations">
        <SpecTable
          head={["トークン", "時間", "用途"]}
          rows={durations.map((d) => [<code>dur-{d.name}</code>, <span className="vq-num">{d.ms}ms</span>, d.use])}
        />
      </Section>
      <Section title="Easings">
        <Demo col>
          {[
            { name: "standard", desc: "UI内の移動・サイズ変化", token: "--vq-ease-standard" },
            { name: "enter", desc: "出現（減速して止まる）", token: "--vq-ease-enter" },
            { name: "exit", desc: "退出（加速して消える）", token: "--vq-ease-exit" },
            { name: "spring", desc: "チェック・いいね等の喜び（過剰使用禁止）", token: "--vq-ease-spring" },
          ].map((e) => (
            <div key={e.name} className="vq-row" style={{ gap: "var(--vq-sp-6)" }}>
              <code style={{ width: 90, font: "var(--vq-type-code)", fontSize: 12 }}>{e.name}</code>
              <div style={{ flex: 1, height: 32, background: "var(--vq-surface-sunken)", borderRadius: 8, position: "relative", overflow: "hidden" }}>
                <span
                  key={runKey}
                  style={{
                    position: "absolute", top: 5, left: 5, width: 22, height: 22, borderRadius: 6,
                    background: "var(--vq-accent)",
                    animation: `vq-ease-demo 1s var(${e.token}) forwards`, animationDelay: "0.15s",
                  }}
                />
              </div>
              <span style={{ width: 240, font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)" }} className="vq-truncate">{e.desc}</span>
            </div>
          ))}
          <style>{`@keyframes vq-ease-demo { to { left: calc(100% - 27px); } }`}</style>
          <div>
            <Button size="sm" variant="outline" icon={<Play size={13} />} onClick={() => setRunKey((k) => k + 1)}>再生</Button>
          </div>
        </Demo>
      </Section>
      <Section title="ルール">
        <DoDont
          doTitle="出現は下から8px＋フェード"
          doBody="コンテンツの出現は translateY(8px)→0 + opacity。方向つき遷移は「進む＝右から、戻る＝左から」で統一。"
          dontTitle="無限ループ・巨大移動"
          dontBody="待機中に永遠に揺れる要素、画面の半分を横切るスライドは禁止。ローディングの回転だけが唯一の常時アニメーション。"
        />
      </Section>
    </DocPage>
  );
}

/* ═══ Icons ════════════════════════════════════════════════ */
export function FIcons() {
  const icons: { icon: React.ReactNode; name: string; use: string }[] = [
    { icon: <Home size={18} />, name: "home", use: "ホーム" },
    { icon: <BookOpen size={18} />, name: "book-open", use: "クイズ・学習" },
    { icon: <Pencil size={18} />, name: "pencil", use: "作成・編集" },
    { icon: <Search size={18} />, name: "search", use: "検索" },
    { icon: <Star size={18} />, name: "star", use: "お気に入り" },
    { icon: <Heart size={18} />, name: "heart", use: "いいね" },
    { icon: <Bell size={18} />, name: "bell", use: "通知" },
    { icon: <User size={18} />, name: "user", use: "プロフィール" },
    { icon: <Settings size={18} />, name: "settings", use: "設定" },
    { icon: <Sparkles size={18} />, name: "sparkles", use: "AI機能（固定）" },
    { icon: <Coins size={18} />, name: "coins", use: "Qredit（固定）" },
    { icon: <Trophy size={18} />, name: "trophy", use: "実績・ランキング" },
    { icon: <Clock size={18} />, name: "clock", use: "履歴・時間" },
    { icon: <Zap size={18} />, name: "zap", use: "クイック機能" },
    { icon: <Check size={18} />, name: "check", use: "完了・正解" },
    { icon: <X size={18} />, name: "x", use: "閉じる・不正解" },
    { icon: <Plus size={18} />, name: "plus", use: "追加" },
    { icon: <Trash2 size={18} />, name: "trash-2", use: "削除" },
    { icon: <ChevronRight size={18} />, name: "chevron-right", use: "展開・遷移" },
    { icon: <ArrowRight size={18} />, name: "arrow-right", use: "次へ" },
    { icon: <CircleHelp size={18} />, name: "circle-help", use: "ヘルプ" },
    { icon: <Layers size={18} />, name: "layers", use: "セット・階層" },
    { icon: <Keyboard size={18} />, name: "keyboard", use: "ショートカット" },
    { icon: <Play size={18} />, name: "play", use: "開始" },
  ];
  return (
    <DocPage
      kicker="Foundations"
      title="Icons"
      lede="アイコンは Lucide（stroke 2px 系）で統一。絵文字をUIアイコンとして使うことは全面禁止。サイズは 14 / 16 / 18 / 24 の4種のみ。"
    >
      <Section title="標準セットと意味の固定" desc="同じ意味には常に同じアイコン。特に AI=sparkles、Qredit=coins、お気に入り=star、いいね=heart は全画面で固定。">
        <div className="doc-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
          {icons.map((ic) => (
            <div key={ic.name} className="vq-row" style={{ gap: "var(--vq-sp-4)", padding: "var(--vq-sp-4)", border: "1px solid var(--vq-border-subtle)", borderRadius: "var(--vq-r-md)", background: "var(--vq-surface)" }}>
              <span style={{ color: "var(--vq-text-secondary)" }}>{ic.icon}</span>
              <span className="vq-stack" style={{ minWidth: 0 }}>
                <code style={{ font: "var(--vq-type-code)", fontSize: 11 }}>{ic.name}</code>
                <span style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)" }}>{ic.use}</span>
              </span>
            </div>
          ))}
        </div>
      </Section>
      <Section title="ルール">
        <SpecTable
          head={["項目", "基準"]}
          rows={[
            ["サイズ", "本文内 14〜16 / ボタン内 16〜17 / ナビ 18 / 空状態 24"],
            ["アイコンのみボタン", <>必ず <code>aria-label</code> を付ける（IconButton は必須引数）</>],
            ["色", "単色。currentColor 経由でテキスト色に従う。多色アイコンは使わない"],
            ["絵文字", "UIアイコンとしての使用は禁止。ユーザー投稿本文内のみ許容"],
          ]}
        />
      </Section>
    </DocPage>
  );
}

/* ═══ Layout & Responsive ══════════════════════════════════ */
export function FLayout() {
  return (
    <DocPage
      kicker="Foundations"
      title="Layout & Responsive"
      lede="PCはサイドバー＋トップバー、モバイルはBottom Navigation。中間はコンテンツが決める。ブレークポイントは4つ。"
    >
      <Section title="Breakpoints">
        <SpecTable
          head={["名前", "幅", "対象", "レイアウト"]}
          rows={[
            ["small mobile", "〜389px", "iPhone SE 等", "1カラム・最小余白・グレード選択は3列"],
            ["mobile", "390〜767px", "スマートフォン", "1カラム＋Bottom Navigation"],
            ["tablet", "768〜1023px", "タブレット・小型PC", "2カラム・サイドバーはドロワー"],
            ["desktop", "1024px〜", "PC", "サイドバー常設＋メイン＋（必要時）右パネル"],
          ]}
        />
      </Section>
      <Section title="コンテナクエリ" desc="製品画面は viewport ではなくコンテナ幅 (container: vq-screen) で応答する。だからStudioのデバイス切り替えで実際にレイアウトが変わる。">
        <Demo note="@container vq-screen (max-width: 767px) { … } — 画面コンポーネントはこの書き方でモバイル対応する">
          <code style={{ font: "var(--vq-type-code)", fontSize: 12.5 }}>
            {`.qz-home__grid { grid-template-columns: 2fr 1fr; }
@container vq-screen (max-width: 767px) {
  .qz-home__grid { grid-template-columns: 1fr; }
}`}
          </code>
        </Demo>
      </Section>
      <Section title="モバイル変換の定石">
        <SpecTable
          head={["PC", "モバイル"]}
          rows={[
            ["左サイドバー", "Bottom Navigation（主要5項目）＋ドロワー（残り）"],
            ["モーダル", "Bottom Sheet（下から・つまみ付き）"],
            ["テーブル", "カードリスト（主要3項目のみ表示）"],
            ["右補助パネル", "画面遷移 or シート"],
            ["ホバー操作", "明示的なボタン・長押しメニュー"],
            ["2カラムフォーム", "1カラム・入力中はBottom Navを隠す"],
          ]}
        />
      </Section>
      <Section title="タップ領域">
        <p style={{ font: "var(--vq-type-body-md)", color: "var(--vq-text-secondary)", maxWidth: 640 }}>
          タップ可能要素は最小 <code>44×44px</code>（<code>--vq-tap-min</code>）。視覚サイズが小さくても、当たり判定はpaddingで44pxを確保する。
        </p>
      </Section>
    </DocPage>
  );
}

/* ═══ Accessibility ════════════════════════════════════════ */
export function FA11y() {
  return (
    <DocPage
      kicker="Foundations"
      title="Accessibility"
      lede="WCAG 2.1 AA がデフォルト。ここのチェックを通らないUIはマージしない。"
    >
      <Section title="チェックリスト">
        <SpecTable
          head={["項目", "基準", "実装"]}
          rows={[
            ["コントラスト", "本文 4.5:1 以上 / 大きな文字・UI部品 3:1 以上", "text/secondary/tertiary はすべてAA準拠で定義済み"],
            ["キーボード", "全操作がTab/Enter/Esc/矢印で完結", "モーダルはEscで閉じる。タブは矢印移動"],
            ["フォーカス", "2pxリング＋2pxオフセットを全要素で表示", ":focus-visible をグローバル定義"],
            ["ラベル", "入力欄は label 関連付け必須。placeholderをラベル代わりにしない", "Field コンポーネントが自動で紐付け"],
            ["アイコンボタン", "aria-label 必須", "IconButton の label は必須引数"],
            ["状態", "色だけで伝えない。アイコン＋テキストを併記", "正解/不正解はアイコンと文言を常に併記"],
            ["エラー", "文章で内容を伝え、role=alert で通知", "Field の error は role=alert"],
            ["動き", "prefers-reduced-motion で全アニメ停止", "base.css でグローバル対応＋手動トグルあり"],
            ["ライブ領域", "トースト・進捗は aria-live=polite", "Toast / creating stepper 実装済み"],
          ]}
        />
      </Section>
      <Section title="フォーカスの実例">
        <Demo note="Tabキーで移動してフォーカスリングを確認">
          <Button>主要アクション</Button>
          <Button variant="outline">別の操作</Button>
          <TextInput placeholder="入力欄" aria-label="サンプル入力" style={{ width: 200 }} />
          <Checkbox label="同意する" />
        </Demo>
      </Section>
      <Section title="色に依存しない状態表現">
        <Demo col>
          <div className="vq-row" style={{ gap: "var(--vq-sp-4)", flexWrap: "wrap" }}>
            <Badge tone="success"><Check size={11} /> 正解 24問</Badge>
            <Badge tone="danger"><X size={11} /> 不正解 6問</Badge>
            <Badge tone="neutral">未回答 2問</Badge>
          </div>
          <Progress value={75} label="正答率 75%" />
        </Demo>
      </Section>
    </DocPage>
  );
}
