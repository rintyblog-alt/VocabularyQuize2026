import React from "react";
import {
  Accessibility, ArrowRight, BookOpen, Component, Layers, MonitorSmartphone,
  Palette, Sparkles, SwatchBook, Wand2, Zap,
} from "lucide-react";
import { DocPage, Section, SpecTable } from "./lib/Doc";
import { Badge, Button, Card } from "../ui/components";
import { Link, useRouter } from "../app/router";

/* ── Welcome ────────────────────────────────────────────── */
export function OverviewWelcome() {
  const { navigate } = useRouter();
  const entries = [
    { icon: <Palette size={18} />, title: "Foundations", desc: "色・タイポグラフィ・余白・モーションの基準", to: "/foundations/colors" },
    { icon: <Component size={18} />, title: "Components", desc: "実際に操作できる共通コンポーネント", to: "/components/buttons" },
    { icon: <Layers size={18} />, title: "Patterns", desc: "認証・シェル・状態設計の組み立て方", to: "/patterns/authentication" },
    { icon: <MonitorSmartphone size={18} />, title: "Screens", desc: "本体そのままの画面をデバイス幅つきで確認", to: "/screens/welcome" },
    { icon: <Wand2 size={18} />, title: "Playground", desc: "Motion Lab・日本語ストレステスト", to: "/playground/motion" },
  ];
  return (
    <DocPage
      kicker="VocabuQuiz UI Studio"
      title="VocabuQuiz の、唯一のUI基準。"
      lede="ここにあるトークン・コンポーネント・画面が、今後の VocabuQuiz 本体のすべてのUIの正です。新しい画面を作るときは、このStudioを参照し、ここにある部品だけで組み立ててください。"
    >
      <div className="vq-row vq-wrap" style={{ gap: "var(--vq-sp-4)", marginTop: "calc(var(--vq-sp-6) * -1)", marginBottom: "var(--vq-sp-4)" }}>
        <Badge tone="accent" dot>v0.2.0 “Bloom”</Badge>
        <Badge>React + TypeScript</Badge>
        <Badge>CSS Variables</Badge>
        <Badge>Light / Dark</Badge>
        <Badge>Container Queries</Badge>
      </div>

      <div className="doc-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
        {entries.map((e) => (
          <Card key={e.title} hover as="button" onClick={() => navigate(e.to)} style={{ textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit" }}>
            <div className="vq-row" style={{ gap: "var(--vq-sp-4)", marginBottom: "var(--vq-sp-3)" }}>
              <span style={{ display: "grid", placeItems: "center", width: 36, height: 36, borderRadius: "var(--vq-r-md)", background: "var(--vq-accent-subtle)", color: "var(--vq-accent-text)" }}>
                {e.icon}
              </span>
              <span style={{ font: "var(--vq-type-heading-md)" }}>{e.title}</span>
              <ArrowRight size={16} style={{ marginLeft: "auto", color: "var(--vq-text-tertiary)" }} />
            </div>
            <p style={{ font: "var(--vq-type-body-sm)", color: "var(--vq-text-secondary)" }}>{e.desc}</p>
          </Card>
        ))}
      </div>

      <Section title="このStudioでできること">
        <SpecTable
          head={["機能", "場所"]}
          rows={[
            ["ツールバーからデバイス幅 (375〜1728px) を切り替え、Screens の実プレビュー幅が変わる", <>右上のデバイスアイコン</>],
            ["Light / Dark テーマの即時切り替え", <>右上の月／太陽アイコン</>],
            ["UI密度（標準／コンパクト）と Studio 言語 (JA/EN) の切り替え", <>右上のスライダーアイコン</>],
            [<>コマンドパレットで全ページ検索 <kbd className="vq-kbd">⌘K</kbd></>, "どこからでも"],
            ["お気に入り・最近見たページ", "右上の星／時計アイコン"],
            ["Screens のフルスクリーンプレビュー", "Screens 表示中の右上"],
          ]}
        />
      </Section>
    </DocPage>
  );
}

/* ── Getting Started ────────────────────────────────────── */
export function GettingStarted() {
  return (
    <DocPage
      kicker="Overview"
      title="Getting Started"
      lede="VocabuQuiz の新しいUIを実装する人（人間・AIどちらも）が最初に読むページ。"
    >
      <Section title="実装の3原則">
        <SpecTable
          head={["#", "原則", "意味"]}
          rows={[
            ["1", "トークン以外の生値を書かない", <>色・角丸・影・時間は必ず <code>var(--vq-*)</code> を参照。<code>#fff</code> や <code>8px</code> の直書きをしない</>],
            ["2", "登録済みコンポーネントを使う", "ボタン・入力欄・モーダルを画面ごとに再発明しない。足りなければStudioに追加してから使う"],
            ["3", "3状態を必ず作る", "Loading / Empty / Error のない画面はレビューを通らない"],
          ]}
        />
      </Section>
      <Section title="開発コマンド">
        <Card sunken>
          <pre style={{ font: "var(--vq-type-code)", overflowX: "auto" }}>{`cd ui-studio
npm install
npm run dev      # http://127.0.0.1:5173
npm run build    # dist/ に静的ビルド`}</pre>
        </Card>
      </Section>
      <Section title="ディレクトリ構成">
        <Card sunken>
          <pre style={{ font: "var(--vq-type-code)", overflowX: "auto" }}>{`src/
  ui/          共通UI基盤（本体へ移植する部分）
    styles/    tokens.css / base.css / components.css
    components/  Button, Field, Overlay, Toast, Chart …
    hooks.ts
  app/         Studio自体のシェル・ルータ・設定
  showcase/    カタログページ（foundations / components / patterns）
  features/    製品画面の実装（auth / shell / quiz / feed …）
  mocks/       日本語モックデータ`}</pre>
        </Card>
      </Section>
      <Section title="本体への移植">
        <p style={{ font: "var(--vq-type-body-md)", color: "var(--vq-text-secondary)", maxWidth: 640 }}>
          <code>src/ui</code> と <code>src/features</code> はそのまま本体プロジェクトへ移植できる構成です。
          手順と注意点は <code>ui-studio/docs/MIGRATION_GUIDE.md</code> を参照してください。
        </p>
      </Section>
    </DocPage>
  );
}

/* ── Design Principles ──────────────────────────────────── */
export function Principles() {
  const items = [
    { icon: <BookOpen size={18} />, title: "学習が主役", body: "UIは黒子。色や動きは、いま解くべき問題・次にやるべき学習へ視線を導くためだけに使う。装飾のための装飾は追加しない。" },
    { icon: <Zap size={18} />, title: "静かな信頼感", body: "叫ばないUI。正確な余白・整ったタイポグラフィ・抑制された影で品質を伝える。派手なグラデーションや光る球体で品質を偽装しない。" },
    { icon: <Sparkles size={18} />, title: "意味のあるモーション", body: "アニメーションは状態変化のフィードバックとしてだけ存在する。正解の喜び、保存の安心、遷移の方向。飾りとして動かさない。" },
    { icon: <MonitorSmartphone size={18} />, title: "モバイルは縮小版ではない", body: "スマートフォンでは操作の優先順位から組み直す。Bottom Navigation・シート化・片手操作。PCレイアウトの縮小で済ませない。" },
    { icon: <Accessibility size={18} />, title: "全員が使えてはじめて完成", body: "WCAG AAコントラスト・キーボード操作・フォーカス表示・reduced-motion はオプションではなくデフォルト。" },
    { icon: <SwatchBook size={18} />, title: "1つの意味に1つの表現", body: "同じ意味のUIは全画面で同じ見た目・同じ挙動。正解は常に同じ緑、AIは常に同じ紫。画面ごとの方言を作らない。" },
  ];
  return (
    <DocPage kicker="Overview" title="Design Principles" lede="迷ったらこの6つに立ち返る。すべてのレビューはこの原則を基準に行う。">
      <div className="doc-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", marginTop: "var(--vq-sp-6)" }}>
        {items.map((it, i) => (
          <Card key={it.title}>
            <div className="vq-row" style={{ gap: "var(--vq-sp-4)", marginBottom: "var(--vq-sp-4)" }}>
              <span style={{ display: "grid", placeItems: "center", width: 34, height: 34, borderRadius: "var(--vq-r-md)", background: "var(--vq-accent-subtle)", color: "var(--vq-accent-text)" }}>{it.icon}</span>
              <span style={{ font: "var(--vq-type-heading-md)" }}>{i + 1}. {it.title}</span>
            </div>
            <p style={{ font: "var(--vq-type-body-sm)", color: "var(--vq-text-secondary)" }}>{it.body}</p>
          </Card>
        ))}
      </div>
    </DocPage>
  );
}

/* ── Release Notes ──────────────────────────────────────── */
export function ReleaseNotes() {
  return (
    <DocPage kicker="Overview" title="Release Notes" lede="UI Studio の更新履歴。UIを変更したら必ずここにも記録する。">
      <Section title="v0.2.0 “Bloom” — 2026-07-22">
        <Card>
          <ul style={{ paddingLeft: "1.3em", display: "grid", gap: 8, font: "var(--vq-type-body-md)", color: "var(--vq-text-secondary)" }}>
            <li><b>ビジュアル全面リニューアル</b> — コバルト藍の業務系トーンから、白 × 柔らかいラベンダー（Primary #756DB3）のモバイルファースト学習アプリへ。理由: 高校生が毎日使うプロダクトとして「親しみ・清潔感・集中」を優先するため</li>
            <li>デザイントークン刷新: 角丸を全体的に拡大（ボタン/入力 14px・カード 18px・シート上端 28px）、影をラベンダー系の極薄へ、見出しに丸ゴシック系スタック（ui-rounded / ヒラギノ丸ゴ）を導入</li>
            <li>ダークモードを「黒反転」からダークラベンダー基調（#17161D / #211F29 / Primary #A59BE0）へ再設計。ベタ塗り上の文字色は --vq-solid-ink で両テーマ対応</li>
            <li>SVGイラストシステム（20種・テーマ追従・外部画像ゼロ）を追加し、Welcome / Auth全状態 / Empty / Error / システム画面 / 結果に適用</li>
            <li>新画面: Splash & Intro（ロゴ→紹介3枚→登録導線）。Bottom Navigation 中央に「作成」ボタン＋作成シート</li>
            <li>Settings を行ベースリストへ再設計（Danger Zone分離のまま）。Library はモバイルでフィルターをBottom Sheet化。複数選択の「一部正解」を文言で明示</li>
            <li>チャート配色をブランド調和のバイオレット先頭に並べ替え、CVD 6チェックを light(#fff) / dark(#211F29) 両サーフェスで再検証（ALL PASS）</li>
            <li>モバイル幅で Studio サイドバーが初期表示時にコンテンツを覆う問題を修正（初期状態=閉）</li>
          </ul>
        </Card>
      </Section>
      <Section title="v0.1.0 — 2026-07-22">
        <Card>
          <ul style={{ paddingLeft: "1.3em", display: "grid", gap: 8, font: "var(--vq-type-body-md)", color: "var(--vq-text-secondary)" }}>
            <li>初回リリース。デザイントークン（Light/Dark・密度2段階）を定義</li>
            <li>共通コンポーネント約40種（Button〜Chart）を実装</li>
            <li>Screens: Welcome / Auth / Home / Library / Player / Results / PreExam / Feed / Profile / Notifications / Settings / Quick Chat / Sede / Qredit / Qredit Card / QDP / Admin / System</li>
            <li>Playground: Motion Lab / Responsive Lab / Japanese Text Test / Theme Lab</li>
            <li>チャートのカテゴリ配色を CVD 6チェックで検証（light/dark 両パス）</li>
            <li>ドキュメント7点（実装規約・移植ガイド等）を同梱</li>
          </ul>
        </Card>
      </Section>
      <Section title="記録のルール">
        <p style={{ font: "var(--vq-type-body-md)", color: "var(--vq-text-secondary)", maxWidth: 640 }}>
          トークン変更・コンポーネント追加・破壊的変更は、バージョンを上げてここへ1行以上で記録する。
          「なぜ変えたか」を書く。差分だけの記録は禁止。
        </p>
      </Section>
    </DocPage>
  );
}
