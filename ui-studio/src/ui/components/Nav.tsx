import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/* ── Breadcrumbs ────────────────────────────────────────── */
export function Breadcrumbs({ items }: { items: { label: React.ReactNode; onClick?: () => void }[] }) {
  return (
    <nav aria-label="パンくずリスト" className="vq-crumbs">
      {items.map((it, i) => {
        const last = i === items.length - 1;
        return (
          <React.Fragment key={i}>
            {i > 0 && <span className="vq-crumbs__sep" aria-hidden>/</span>}
            {last ? (
              <span className="vq-crumbs__current" aria-current="page">{it.label}</span>
            ) : (
              <button type="button" onClick={it.onClick}>{it.label}</button>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

/* ── Pagination ─────────────────────────────────────────── */
export function Pagination({
  page, totalPages, onChange,
}: { page: number; totalPages: number; onChange: (p: number) => void }) {
  const pages: (number | "…")[] = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - page) <= 1) pages.push(p);
    else if (pages[pages.length - 1] !== "…") pages.push("…");
  }
  return (
    <nav className="vq-pagination" aria-label="ページ送り">
      <button className="vq-page-btn" aria-label="前のページ" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <ChevronLeft size={15} />
      </button>
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`e${i}`} className="vq-page-btn" style={{ pointerEvents: "none" }} aria-hidden>…</span>
        ) : (
          <button
            key={p}
            className="vq-page-btn"
            aria-current={p === page ? "page" : undefined}
            aria-label={`${p}ページ目`}
            onClick={() => onChange(p)}
          >
            {p}
          </button>
        )
      )}
      <button className="vq-page-btn" aria-label="次のページ" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        <ChevronRight size={15} />
      </button>
    </nav>
  );
}
