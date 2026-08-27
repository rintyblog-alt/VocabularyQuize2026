import React from "react";
import { AlertTriangle, CheckCircle2, CloudOff, Info, Loader2, Sparkles, XCircle } from "lucide-react";

/* ── Alert ──────────────────────────────────────────────── */
export type AlertTone = "info" | "success" | "warning" | "danger" | "ai";
const ALERT_ICONS: Record<AlertTone, React.ReactNode> = {
  info: <Info size={17} />, success: <CheckCircle2 size={17} />,
  warning: <AlertTriangle size={17} />, danger: <XCircle size={17} />,
  ai: <Sparkles size={17} />,
};

export function Alert({
  tone = "info", title, children, actions,
}: { tone?: AlertTone; title?: React.ReactNode; children?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className={`vq-alert vq-alert--${tone}`} role={tone === "danger" ? "alert" : "status"}>
      <span className="vq-alert__icon">{ALERT_ICONS[tone]}</span>
      <div className="vq-grow">
        {title && <div className="vq-alert__title">{title}</div>}
        {children && <div style={{ color: "var(--vq-text-secondary)" }}>{children}</div>}
        {actions && <div className="vq-row" style={{ gap: "var(--vq-sp-4)", marginTop: "var(--vq-sp-4)" }}>{actions}</div>}
      </div>
    </div>
  );
}

export function Banner({ tone = "info", children, actions }: { tone?: "info" | "warning" | "danger"; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className={`vq-banner vq-banner--${tone}`} role="status">
      <span className="vq-grow">{children}</span>
      {actions}
    </div>
  );
}

/* ── Empty / Error states ───────────────────────────────── */
export function EmptyState({
  icon, illustration, title, description, actions,
}: { icon?: React.ReactNode; illustration?: React.ReactNode; title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="vq-empty">
      {illustration ?? <span className="vq-empty__icon">{icon ?? <Info size={24} />}</span>}
      <div className="vq-empty__title">{title}</div>
      {description && <div className="vq-empty__desc">{description}</div>}
      {actions && <div className="vq-empty__actions">{actions}</div>}
    </div>
  );
}

export function OfflineState({ onRetry }: { onRetry?: () => void }) {
  return (
    <EmptyState
      icon={<CloudOff size={24} />}
      title="オフラインです"
      description="接続が回復すると自動的に再読み込みします。保存済みのクイズはオフラインでも利用できます。"
      actions={onRetry && <button className="vq-btn vq-btn--outline vq-btn--sm" onClick={onRetry}>再試行</button>}
    />
  );
}

/* ── Spinner / Skeleton ─────────────────────────────────── */
export function Spinner({ size = 20, muted, label }: { size?: number; muted?: boolean; label?: string }) {
  return (
    <span role="status" aria-label={label ?? "読み込み中"} style={{ display: "inline-flex" }}>
      <Loader2 className={`vq-spinner ${muted ? "vq-spinner--muted" : ""}`} size={size} />
    </span>
  );
}

export function Skeleton({
  width, height, circle, className = "", style,
}: { width?: number | string; height?: number | string; circle?: boolean; className?: string; style?: React.CSSProperties }) {
  return (
    <span
      className={`vq-skeleton ${circle ? "vq-skeleton--circle" : ""} ${className}`}
      aria-hidden
      style={{ display: "block", width: width ?? "100%", height: height ?? 13, ...style }}
    />
  );
}

/* ── Progress ───────────────────────────────────────────── */
export function Progress({
  value, max = 100, size = "md", tone, gradient, label,
}: { value: number; max?: number; size?: "sm" | "md" | "lg"; tone?: "success" | "warning" | "danger"; gradient?: boolean; label?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div
      className={`vq-progress ${size !== "md" ? `vq-progress--${size}` : ""}`}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
    >
      <div
        className={[
          "vq-progress__fill",
          tone && `vq-progress__fill--${tone}`,
          gradient && "vq-progress__fill--gradient",
        ].filter(Boolean).join(" ")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* ── Circular ring（タイマー/進捗） ─────────────────────── */
export function Ring({
  value, max = 100, size = 48, stroke = 4, children, tone,
}: { value: number; max?: number; size?: number; stroke?: number; children?: React.ReactNode; tone?: "warning" | "danger" }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <span style={{ position: "relative", display: "inline-grid", placeItems: "center", width: size, height: size }}>
      <svg className="vq-ring" width={size} height={size}>
        <circle className="vq-ring__track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        <circle
          className={`vq-ring__fill ${tone ? `is-${tone}` : ""}`}
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} strokeLinecap="round"
        />
      </svg>
      <span style={{ position: "absolute", font: "var(--vq-type-caption)", fontWeight: 700 }} className="vq-num">{children}</span>
    </span>
  );
}

/* ── Stepper ────────────────────────────────────────────── */
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="vq-stepper" role="list" aria-label="手順">
      {steps.map((s, i) => (
        <React.Fragment key={s}>
          {i > 0 && <span className={`vq-stepper__line ${i <= current ? "is-done" : ""}`} aria-hidden />}
          <span
            role="listitem"
            className={`vq-stepper__node ${i === current ? "is-active" : ""} ${i < current ? "is-done" : ""}`}
            aria-current={i === current ? "step" : undefined}
          >
            <span className="vq-stepper__dot">
              {i < current ? <CheckCircle2 size={14} /> : i + 1}
            </span>
            <span>{s}</span>
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}
