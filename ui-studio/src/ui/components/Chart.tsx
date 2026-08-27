import React, { useMemo, useState } from "react";

/*
  Charts — dataviz 準拠:
  - 単一軸のみ / カテゴリ色は固定順（--vq-chart-1..6, CVD検証済）
  - 細いマーク: line 2px / bar 角丸4px(データ端のみ) / 隣接fillに2pxギャップ
  - グリッドは控えめ、テキストはテキストトークン（系列色を文字に使わない）
  - hover レイヤー標準装備（crosshair + tooltip）
  - 2系列以上は凡例必須
*/

export const CHART_COLORS = [
  "var(--vq-chart-1)", "var(--vq-chart-2)", "var(--vq-chart-3)",
  "var(--vq-chart-4)", "var(--vq-chart-5)", "var(--vq-chart-6)",
];

const AXIS_TEXT: React.CSSProperties = {
  font: "var(--vq-type-caption)",
  fill: "var(--vq-text-tertiary)",
  fontVariantNumeric: "tabular-nums",
};

function niceMax(v: number) {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

export function ChartLegend({ series }: { series: { name: string; color?: string }[] }) {
  if (series.length < 2) return null;
  return (
    <div className="vq-row vq-wrap" style={{ gap: "var(--vq-sp-6)", marginTop: "var(--vq-sp-4)" }}>
      {series.map((s, i) => (
        <span key={s.name} className="vq-row" style={{ gap: 6, font: "var(--vq-type-caption)", color: "var(--vq-text-secondary)" }}>
          <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: s.color ?? CHART_COLORS[i % 6] }} />
          {s.name}
        </span>
      ))}
    </div>
  );
}

/* ── BarChart（縦棒 / グループ） ─────────────────────────── */
export function BarChart({
  labels, series, height = 200, unit = "", maxValue,
}: {
  labels: string[];
  series: { name: string; values: number[]; color?: string }[];
  height?: number;
  unit?: string;
  maxValue?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560, H = height, padL = 40, padB = 24, padT = 10;
  const max = maxValue ?? niceMax(Math.max(...series.flatMap((s) => s.values)));
  const iw = W - padL - 8, ih = H - padB - padT;
  const groupW = iw / labels.length;
  const barW = Math.min(28, (groupW - 8) / series.length - 2);
  const ticks = [0, 0.5, 1];

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="棒グラフ" style={{ width: "100%", height: "auto" }}>
        {ticks.map((t) => {
          const y = padT + ih * (1 - t);
          return (
            <g key={t}>
              <line x1={padL} x2={W - 4} y1={y} y2={y} stroke="var(--vq-chart-grid)" strokeWidth={1} />
              <text x={padL - 6} y={y + 4} textAnchor="end" style={AXIS_TEXT}>{Math.round(max * t)}</text>
            </g>
          );
        })}
        {labels.map((lb, i) => {
          const gx = padL + groupW * i;
          const active = hover === i;
          return (
            <g key={lb}>
              {active && <rect x={gx} y={padT} width={groupW} height={ih} fill="var(--vq-surface-active)" opacity={0.55} rx={4} />}
              {series.map((s, si) => {
                const v = s.values[i] ?? 0;
                const bh = Math.max(2, (v / max) * ih);
                const bx = gx + groupW / 2 - ((barW + 2) * series.length - 2) / 2 + si * (barW + 2);
                const by = padT + ih - bh;
                return (
                  <path
                    key={s.name}
                    d={`M ${bx} ${by + 4} q 0 -4 4 -4 h ${barW - 8} q 4 0 4 4 v ${bh - 4} h ${-barW} z`}
                    fill={s.color ?? CHART_COLORS[si % 6]}
                  />
                );
              })}
              <text x={gx + groupW / 2} y={H - 6} textAnchor="middle" style={AXIS_TEXT}>{lb}</text>
              <rect
                x={gx} y={padT} width={groupW} height={ih} fill="transparent"
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
              />
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div
          className="vq-menu"
          style={{
            position: "absolute", pointerEvents: "none",
            left: `${((padL + groupW * (hover + 0.5)) / W) * 100}%`,
            top: 0, transform: "translate(-50%, -8px)",
            padding: "var(--vq-sp-3) var(--vq-sp-5)", minWidth: 0, animation: "none",
          }}
          role="status"
        >
          <div style={{ font: "var(--vq-type-caption)", fontWeight: 700, marginBottom: 2 }}>{labels[hover]}</div>
          {series.map((s, si) => (
            <div key={s.name} className="vq-row" style={{ gap: 6, font: "var(--vq-type-caption)", color: "var(--vq-text-secondary)" }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color ?? CHART_COLORS[si % 6] }} />
              {series.length > 1 && <span>{s.name}</span>}
              <span className="vq-num" style={{ fontWeight: 700, color: "var(--vq-text)" }}>{s.values[hover]}{unit}</span>
            </div>
          ))}
        </div>
      )}
      <ChartLegend series={series} />
    </div>
  );
}

/* ── LineChart（折れ線 + crosshair） ─────────────────────── */
export function LineChart({
  labels, series, height = 200, unit = "", area,
}: {
  labels: string[];
  series: { name: string; values: number[]; color?: string }[];
  height?: number;
  unit?: string;
  area?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 560, H = height, padL = 40, padB = 24, padT = 10;
  const max = niceMax(Math.max(...series.flatMap((s) => s.values)));
  const iw = W - padL - 12, ih = H - padB - padT;
  const x = (i: number) => padL + (labels.length === 1 ? iw / 2 : (i / (labels.length - 1)) * iw);
  const y = (v: number) => padT + ih * (1 - v / max);

  const paths = useMemo(
    () => series.map((s) => s.values.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, labels.length, max]
  );

  return (
    <div style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`} role="img" aria-label="折れ線グラフ" style={{ width: "100%", height: "auto" }}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const i = Math.round(((px - padL) / iw) * (labels.length - 1));
          setHover(Math.max(0, Math.min(labels.length - 1, i)));
        }}
        onMouseLeave={() => setHover(null)}
      >
        {[0, 0.5, 1].map((t) => {
          const gy = padT + ih * (1 - t);
          return (
            <g key={t}>
              <line x1={padL} x2={W - 4} y1={gy} y2={gy} stroke="var(--vq-chart-grid)" strokeWidth={1} />
              <text x={padL - 6} y={gy + 4} textAnchor="end" style={AXIS_TEXT}>{Math.round(max * t)}</text>
            </g>
          );
        })}
        {labels.map((lb, i) => (
          (labels.length <= 8 || i % Math.ceil(labels.length / 8) === 0) && (
            <text key={i} x={x(i)} y={H - 6} textAnchor="middle" style={AXIS_TEXT}>{lb}</text>
          )
        ))}
        {hover != null && (
          <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + ih} stroke="var(--vq-border-strong)" strokeWidth={1} strokeDasharray="3 3" />
        )}
        {series.map((s, si) => (
          <g key={s.name}>
            {area && (
              <path
                d={`${paths[si]} L ${x(s.values.length - 1)} ${padT + ih} L ${x(0)} ${padT + ih} Z`}
                fill={s.color ?? CHART_COLORS[si % 6]} opacity={0.08}
              />
            )}
            <path d={paths[si]} fill="none" stroke={s.color ?? CHART_COLORS[si % 6]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {hover != null && (
              <circle cx={x(hover)} cy={y(s.values[hover])} r={4.5} fill={s.color ?? CHART_COLORS[si % 6]} stroke="var(--vq-surface)" strokeWidth={2} />
            )}
          </g>
        ))}
      </svg>
      {hover != null && (
        <div
          className="vq-menu"
          style={{
            position: "absolute", pointerEvents: "none",
            left: `${(x(hover) / W) * 100}%`, top: 0,
            transform: `translate(${hover > labels.length / 2 ? "-108%" : "8%"}, -4px)`,
            padding: "var(--vq-sp-3) var(--vq-sp-5)", minWidth: 0, animation: "none",
          }}
          role="status"
        >
          <div style={{ font: "var(--vq-type-caption)", fontWeight: 700, marginBottom: 2 }}>{labels[hover]}</div>
          {series.map((s, si) => (
            <div key={s.name} className="vq-row" style={{ gap: 6, font: "var(--vq-type-caption)", color: "var(--vq-text-secondary)" }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color ?? CHART_COLORS[si % 6] }} />
              {series.length > 1 && <span>{s.name}</span>}
              <span className="vq-num" style={{ fontWeight: 700, color: "var(--vq-text)" }}>{s.values[hover]}{unit}</span>
            </div>
          ))}
        </div>
      )}
      <ChartLegend series={series} />
    </div>
  );
}

/* ── 横棒（分野別正答率など、ラベル直付け） ───────────────── */
export function HBarList({
  items, unit = "%", max = 100,
}: { items: { label: string; value: number; tone?: "accent" | "success" | "warning" | "danger" }[]; unit?: string; max?: number }) {
  const toneColor = { accent: "var(--vq-accent)", success: "var(--vq-success)", warning: "var(--vq-warning)", danger: "var(--vq-danger)" };
  return (
    <div className="vq-stack" style={{ gap: "var(--vq-sp-5)" }}>
      {items.map((it) => (
        <div key={it.label}>
          <div className="vq-row" style={{ justifyContent: "space-between", marginBottom: 5 }}>
            <span style={{ font: "var(--vq-type-body-sm)", fontWeight: 550 }}>{it.label}</span>
            <span className="vq-num" style={{ font: "var(--vq-type-label)", fontSize: 13 }}>{it.value}{unit}</span>
          </div>
          <div className="vq-progress" aria-hidden>
            <div className="vq-progress__fill" style={{ width: `${(it.value / max) * 100}%`, background: it.tone ? toneColor[it.tone] : undefined }} />
          </div>
        </div>
      ))}
    </div>
  );
}
