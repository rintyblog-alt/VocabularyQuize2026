import React from "react";
import { X } from "lucide-react";

/* ── Badge ──────────────────────────────────────────────── */
export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info" | "ai" | "qredit" | "outline";

export function Badge({
  tone = "neutral", dot, children, className = "", style,
}: { tone?: BadgeTone; dot?: boolean; children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <span className={`vq-badge ${tone !== "neutral" ? `vq-badge--${tone}` : ""} ${className}`} style={style}>
      {dot && <span className="vq-badge__dot" aria-hidden />}
      {children}
    </span>
  );
}

/* ── Tag（削除可能） ────────────────────────────────────── */
export function Tag({ children, onRemove }: { children: React.ReactNode; onRemove?: () => void }) {
  return (
    <span className="vq-tag">
      {children}
      {onRemove && (
        <button type="button" className="vq-tag__x" aria-label={`${String(children)} を削除`} onClick={onRemove}>
          <X size={12} />
        </button>
      )}
    </span>
  );
}

/* ── Chip（フィルター等・押下状態あり） ─────────────────── */
export function Chip({
  selected, children, icon, onClick,
}: { selected?: boolean; children: React.ReactNode; icon?: React.ReactNode; onClick?: () => void }) {
  return (
    <button type="button" className="vq-chip" aria-pressed={!!selected} onClick={onClick}>
      {icon}
      {children}
    </button>
  );
}

/* ── Avatar ─────────────────────────────────────────────── */
const AVATAR_HUES = [222, 262, 174, 32, 340, 200];
export function Avatar({
  name, src, size = "md", square, online, className = "",
}: { name: string; src?: string; size?: "xs" | "sm" | "md" | "lg" | "xl"; square?: boolean; online?: boolean; className?: string }) {
  const initials = name
    .split(/\s+/)
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const hue = AVATAR_HUES[(name.charCodeAt(0) || 0) % AVATAR_HUES.length];
  return (
    <span
      className={["vq-avatar", size !== "md" && `vq-avatar--${size}`, square && "vq-avatar--square", className]
        .filter(Boolean).join(" ")}
      role="img"
      aria-label={name}
      style={src ? undefined : { background: `oklch(0.93 0.045 ${hue})`, color: `oklch(0.44 0.13 ${hue})` }}
    >
      {src ? <img src={src} alt="" /> : initials || "?"}
      {online && <span className="vq-avatar__status" aria-label="オンライン" />}
    </span>
  );
}

export function AvatarGroup({ names, max = 4 }: { names: string[]; max?: number }) {
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  return (
    <span className="vq-avatar-group">
      {shown.map((n) => <Avatar key={n} name={n} size="sm" />)}
      {rest > 0 && <span className="vq-avatar vq-avatar--sm" aria-label={`他${rest}人`}>+{rest}</span>}
    </span>
  );
}

/* ── Divider ────────────────────────────────────────────── */
export function Divider({ label, vertical, className = "", style }: { label?: string; vertical?: boolean; className?: string; style?: React.CSSProperties }) {
  if (label) return <div className={`vq-divider--label ${className}`} role="separator" style={style}>{label}</div>;
  if (vertical) return <span className={`vq-divider vq-divider--v ${className}`} role="separator" aria-orientation="vertical" style={style} />;
  return <hr className={`vq-divider ${className}`} style={style} />;
}

/* ── Kbd ────────────────────────────────────────────────── */
export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="vq-kbd">{children}</kbd>;
}
