import React from "react";

export interface TabItem {
  id: string;
  label: React.ReactNode;
  count?: number;
  disabled?: boolean;
}

/* ── Underline tabs ─────────────────────────────────────── */
export function Tabs({
  items, value, onChange, ariaLabel,
}: { items: TabItem[]; value: string; onChange: (id: string) => void; ariaLabel?: string }) {
  return (
    <div className="vq-tabs" role="tablist" aria-label={ariaLabel}>
      {items.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          disabled={t.disabled}
          className="vq-tab"
          onClick={() => onChange(t.id)}
          onKeyDown={(e) => {
            const idx = items.findIndex((i) => i.id === value);
            if (e.key === "ArrowRight") onChange(items[(idx + 1) % items.length].id);
            if (e.key === "ArrowLeft") onChange(items[(idx - 1 + items.length) % items.length].id);
          }}
        >
          {t.label}
          {typeof t.count === "number" && <span className="vq-tab__count vq-num">{t.count}</span>}
          {value === t.id && <span className="vq-tab__ink" aria-hidden />}
        </button>
      ))}
    </div>
  );
}

/* ── Segmented control ──────────────────────────────────── */
export function Segmented({
  items, value, onChange, ariaLabel,
}: {
  items: { id: string; label: React.ReactNode; icon?: React.ReactNode }[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="vq-seg" role="group" aria-label={ariaLabel}>
      {items.map((t) => (
        <button key={t.id} type="button" className="vq-seg__btn" aria-pressed={value === t.id} onClick={() => onChange(t.id)}>
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  );
}
