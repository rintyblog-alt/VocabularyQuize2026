import React, { useMemo, useState } from "react";
import { ArrowUpRight, Coins, Command, Download, Star } from "lucide-react";
import { Demo, DocPage, Section, SpecTable } from "./lib/Doc";
import {
  Badge, BarChart, Breadcrumbs, Button, Card, DataTable, EmptyState, HBarList,
  Kbd, LineChart, Pagination, SearchInput,
} from "../ui/components";
import { QUIZZES, WEEK_STUDY, QDP_STATS } from "../mocks/data";
import type { MockQuiz } from "../mocks/data";

/* ═══ Tables ═══════════════════════════════════════════════ */
export function CTables() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const rows = useMemo(
    () => QUIZZES.filter((r) => !q || r.title.includes(q) || r.subject.includes(q)),
    [q]
  );
  return (
    <DocPage
      kicker="Components"
      title="Tables"
      lede="テーブルはPCの高密度データ向け。モバイル幅ではカードリストに変換する（Screens > Quiz Library 参照）。数値は右揃え＋等幅数字。"
    >
      <Section title="DataTable（ソート・検索・ページネーション）">
        <div className="vq-stack" style={{ gap: "var(--vq-sp-5)" }}>
          <div style={{ maxWidth: 320 }}>
            <SearchInput value={q} onChange={setQ} placeholder="タイトル・科目で絞り込み" size="sm" />
          </div>
          <DataTable<MockQuiz>
            caption="クイズ一覧"
            columns={[
              {
                key: "title", header: "クイズ", sortable: true, sortValue: (r) => r.title,
                render: (r) => (
                  <div className="vq-stack" style={{ gap: 2, minWidth: 220, maxWidth: 360 }}>
                    <span className="vq-truncate" style={{ fontWeight: 600 }}>
                      {r.favorite && <Star size={12} fill="var(--vq-favorite)" style={{ color: "var(--vq-favorite)", marginRight: 4, verticalAlign: -1 }} />}
                      {r.title}
                    </span>
                    <span style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)" }}>{r.author} · {r.updated}</span>
                  </div>
                ),
              },
              { key: "subject", header: "科目", sortable: true, sortValue: (r) => r.subject, render: (r) => <Badge tone="outline">{r.subject}</Badge> },
              { key: "difficulty", header: "難易度", render: (r) => <Badge tone={r.difficulty === "発展" ? "warning" : r.difficulty === "標準" ? "accent" : "neutral"}>{r.difficulty}</Badge> },
              { key: "questions", header: "問題数", numeric: true, sortable: true, sortValue: (r) => r.questions },
              { key: "plays", header: "プレイ数", numeric: true, sortable: true, sortValue: (r) => r.plays, render: (r) => r.plays.toLocaleString() },
              { key: "accuracy", header: "平均正答率", numeric: true, sortable: true, sortValue: (r) => r.accuracy, render: (r) => `${r.accuracy}%` },
            ]}
            rows={rows.slice((page - 1) * 6, page * 6)}
            empty={<EmptyState title={`「${q}」に一致する行はありません`} description="キーワードを変更してください。" />}
          />
          <div className="vq-row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: "var(--vq-sp-4)" }}>
            <span style={{ font: "var(--vq-type-caption)", color: "var(--vq-text-tertiary)" }} className="vq-num">
              {rows.length}件中 {Math.min((page - 1) * 6 + 1, rows.length)}–{Math.min(page * 6, rows.length)}件
            </span>
            <Pagination page={page} totalPages={Math.max(1, Math.ceil(rows.length / 6))} onChange={setPage} />
          </div>
        </div>
      </Section>

      <Section title="ルール">
        <SpecTable
          head={["項目", "基準"]}
          rows={[
            ["数値列", <>右揃え＋<code>tabular-nums</code>。単位はヘッダに書く</>],
            ["行アクション", "ホバーで出現させず常に表示（タッチに存在しないため）"],
            ["ソート", <>ヘッダクリック。<code>aria-sort</code> を必ず付与</>],
            ["モバイル", "767px以下では主要3項目のカードリストへ変換"],
            ["空result", "テーブル内にEmptyStateを埋め込み、ヘッダは維持"],
          ]}
        />
      </Section>
    </DocPage>
  );
}

/* ═══ Navigation ═══════════════════════════════════════════ */
export function CNavigation() {
  const [page, setPage] = useState(3);
  return (
    <DocPage
      kicker="Components"
      title="Navigation"
      lede="現在地を常に示す。パンくずは3階層以上のときだけ。ページネーションは位置が予測できる一覧、無限スクロールはフィードにのみ使う。"
    >
      <Section title="Breadcrumbs">
        <Demo col>
          <Breadcrumbs items={[{ label: "ライブラリ" }, { label: "英語" }, { label: "英単語ターゲット1900 §1" }]} />
          <Breadcrumbs items={[{ label: "管理" }, { label: "ユーザー" }, { label: "レポート審査" }, { label: "#R-2841" }]} />
        </Demo>
      </Section>

      <Section title="Pagination">
        <Demo col>
          <Pagination page={page} totalPages={24} onChange={setPage} />
          <Pagination page={1} totalPages={3} onChange={() => {}} />
        </Demo>
      </Section>

      <Section title="Command Palette" desc="このStudio自体で動作している。製品でも同じ構造（検索→ナビ＋アクション）を使う。">
        <Demo>
          <span className="vq-row" style={{ gap: 8, font: "var(--vq-type-body-sm)", color: "var(--vq-text-secondary)" }}>
            <Command size={15} /> 押してみてください:
          </span>
          <Kbd>⌘K</Kbd>
        </Demo>
      </Section>

      <Section title="App Navigation の使い分け">
        <SpecTable
          head={["場所", "PC", "モバイル"]}
          rows={[
            ["最上位の移動", "左サイドバー（常設）", "Bottom Navigation（5項目）"],
            ["溢れた項目", "サイドバー下部", "その他 → ドロワー"],
            ["ページ内の切替", "Tabs", "Tabs（横スクロール可）"],
            ["深い階層からの復帰", "パンくず＋戻る", "ヘッダ左の戻るボタン"],
          ]}
        />
      </Section>
    </DocPage>
  );
}

/* ═══ Charts ═══════════════════════════════════════════════ */
export function CCharts() {
  return (
    <DocPage
      kicker="Components"
      title="Charts"
      lede="1チャート1軸。カテゴリ色は固定順（chart-1〜6, CVD検証済）。ホバーで必ず値を読める。凡例は2系列以上で必須、テキストは常にテキスト色。"
    >
      <Section title="BarChart" desc="今週の学習時間。単系列は凡例なし・タイトルが系列名を兼ねる。">
        <Card>
          <div style={{ font: "var(--vq-type-heading-sm)", marginBottom: "var(--vq-sp-5)" }}>今週の学習時間（分）</div>
          <BarChart labels={WEEK_STUDY.labels} series={[{ name: "学習時間", values: WEEK_STUDY.minutes }]} unit="分" />
        </Card>
      </Section>

      <Section title="LineChart（2系列 + crosshair）" desc="ホバーで縦ガイド＋ツールチップ。系列色はマーカーで示し、値テキストはテキスト色。">
        <Card>
          <div style={{ font: "var(--vq-type-heading-sm)", marginBottom: "var(--vq-sp-5)" }}>QDP 表示数と完走数の推移</div>
          <LineChart
            labels={QDP_STATS.months}
            series={[
              { name: "表示数", values: QDP_STATS.views },
              { name: "完走数", values: QDP_STATS.completions },
            ]}
            area
          />
        </Card>
      </Section>

      <Section title="HBarList（分野別）" desc="少数カテゴリの比較は横棒＋直接ラベル。ドーナツより読み取りが速い。">
        <Card style={{ maxWidth: 480 }}>
          <div style={{ font: "var(--vq-type-heading-sm)", marginBottom: "var(--vq-sp-5)" }}>分野別の正答率</div>
          <HBarList
            items={[
              { label: "語彙", value: 82, tone: "success" },
              { label: "文法", value: 64, tone: "accent" },
              { label: "整序", value: 45, tone: "warning" },
              { label: "長文読解", value: 38, tone: "danger" },
            ]}
          />
        </Card>
      </Section>

      <Section title="ルール">
        <SpecTable
          head={["ルール", "理由"]}
          rows={[
            ["二重軸禁止。スケールが違う2指標は2枚に分ける", "軸の対応を誤読させない"],
            ["7系列以上は「その他」に畳む", "色の識別限界"],
            ["色は系列に固定。フィルタで残った系列を塗り直さない", "同じ系列は常に同じ色"],
            ["ステータス色(成功/危険)を系列色に流用しない", "意味の衝突"],
            ["全点への数値ラベル禁止。最新値など要点のみ直接ラベル", "ノイズ削減"],
          ]}
        />
      </Section>
    </DocPage>
  );
}
