import React from "react";
import { TrendingDown, TrendingUp } from "lucide-react";

/* ── Card ───────────────────────────────────────────────── */
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  pad?: boolean;
  hover?: boolean;
  flat?: boolean;
  sunken?: boolean;
  selected?: boolean;
  as?: "div" | "article" | "section" | "button";
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { pad = true, hover, flat, sunken, selected, as = "div", className = "", children, ...rest },
  ref
) {
  const Comp = as as React.ElementType;
  return (
    <Comp
      ref={ref}
      className={[
        "vq-card",
        pad && "vq-card--pad",
        hover && "vq-card--hover",
        flat && "vq-card--flat",
        sunken && "vq-card--sunken",
        selected && "vq-card--selected",
        className,
      ].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </Comp>
  );
});

/* ── StatCard（KPI表示） ────────────────────────────────── */
export function StatCard({
  label, value, unit, delta, deltaLabel, icon, tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  delta?: number;
  deltaLabel?: string;
  icon?: React.ReactNode;
  tone?: "neutral" | "accent" | "success" | "warning" | "qredit" | "ai";
}) {
  const toneColor: Record<string, string> = {
    neutral: "var(--vq-text-tertiary)",
    accent: "var(--vq-accent)",
    success: "var(--vq-success)",
    warning: "var(--vq-warning)",
    qredit: "var(--vq-qredit)",
    ai: "var(--vq-ai)",
  };
  return (
    <Card className="vq-statcard">
      <div className="vq-row" style={{ justifyContent: "space-between", marginBottom: "var(--vq-sp-3)" }}>
        <span style={{ font: "var(--vq-type-caption)", fontWeight: 650, color: "var(--vq-text-tertiary)", letterSpacing: "0.03em" }}>
          {label}
        </span>
        {icon && <span style={{ color: toneColor[tone] }}>{icon}</span>}
      </div>
      <div className="vq-row" style={{ gap: "var(--vq-sp-2)", alignItems: "baseline" }}>
        <span className="vq-num" style={{ font: "var(--vq-type-heading-xl)", letterSpacing: "-0.015em" }}>{value}</span>
        {unit && <span style={{ font: "var(--vq-type-body-sm)", color: "var(--vq-text-tertiary)" }}>{unit}</span>}
      </div>
      {typeof delta === "number" && (
        <div className="vq-row" style={{ gap: "var(--vq-sp-2)", marginTop: "var(--vq-sp-3)", font: "var(--vq-type-caption)", fontWeight: 650, color: delta >= 0 ? "var(--vq-success-text)" : "var(--vq-danger-text)" }}>
          {delta >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
          <span className="vq-num">{delta >= 0 ? "+" : ""}{delta}%</span>
          {deltaLabel && <span style={{ color: "var(--vq-text-tertiary)", fontWeight: 500 }}>{deltaLabel}</span>}
        </div>
      )}
    </Card>
  );
}

/* ── ListItem ───────────────────────────────────────────── */
export function ListItem({
  leading, title, description, trailing, selected, onClick,
}: {
  leading?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  trailing?: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
}) {
  const Comp: React.ElementType = onClick ? "button" : "div";
  return (
    <Comp className={`vq-listitem ${selected ? "is-selected" : ""}`} onClick={onClick} type={onClick ? "button" : undefined}>
      {leading}
      <span className="vq-grow vq-stack" style={{ gap: 2 }}>
        <span style={{ font: "var(--vq-type-label)", fontSize: 14 }} className="vq-truncate">{title}</span>
        {description && <span style={{ font: "var(--vq-type-caption)", fontWeight: 450, color: "var(--vq-text-tertiary)" }} className="vq-truncate">{description}</span>}
      </span>
      {trailing}
    </Comp>
  );
}
