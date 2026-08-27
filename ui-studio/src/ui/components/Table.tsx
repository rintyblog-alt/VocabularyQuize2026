import React, { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  sortValue?: (row: T) => string | number;
  numeric?: boolean;
  width?: number | string;
}

export function DataTable<T extends { id: string | number }>({
  columns, rows, selectedIds, onRowClick, empty, caption,
}: {
  columns: Column<T>[];
  rows: T[];
  selectedIds?: Set<T["id"]>;
  onRowClick?: (row: T) => void;
  empty?: React.ReactNode;
  caption?: string;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    return [...rows].sort((a, b) => {
      const va = col.sortValue!(a), vb = col.sortValue!(b);
      return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
    });
  }, [rows, sort, columns]);

  return (
    <div className="vq-table-wrap">
      <div className="vq-table-scroll">
        <table className="vq-table">
          {caption && <caption className="vq-visually-hidden">{caption}</caption>}
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={[c.sortable && "is-sortable", c.numeric && "is-num"].filter(Boolean).join(" ")}
                  style={{ width: c.width }}
                  aria-sort={sort?.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : undefined}
                  onClick={c.sortable ? () => setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 1 ? -1 : 1 } : { key: c.key, dir: 1 })) : undefined}
                >
                  <span className="vq-row" style={{ gap: 4, justifyContent: c.numeric ? "flex-end" : undefined, display: "inline-flex" }}>
                    {c.header}
                    {c.sortable && (sort?.key === c.key
                      ? (sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)
                      : <ChevronsUpDown size={12} style={{ opacity: 0.5 }} />)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ padding: 0 }}>{empty}</td>
              </tr>
            ) : sorted.map((row) => (
              <tr
                key={row.id}
                className={selectedIds?.has(row.id) ? "is-selected" : ""}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                style={onRowClick ? { cursor: "pointer" } : undefined}
              >
                {columns.map((c) => (
                  <td key={c.key} className={c.numeric ? "is-num vq-num" : ""}>
                    {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
