import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CornerDownLeft, Moon, Search, SlidersHorizontal, Sun } from "lucide-react";
import { NAV } from "./nav";
import { useRouter } from "./router";
import { usePrefs } from "./prefs";
import { Kbd } from "../ui/components";

interface Entry {
  id: string;
  group: string;
  label: string;
  path?: string;
  action?: () => void;
  icon?: React.ReactNode;
  keywords?: string;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { navigate } = useRouter();
  const prefs = usePrefs();
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const entries = useMemo<Entry[]>(() => {
    const nav: Entry[] = NAV.flatMap((s) =>
      s.items.map((it) => ({
        id: it.path, group: s.ja, label: prefs.lang === "ja" ? it.ja : it.en, path: it.path,
        keywords: `${it.ja} ${it.en} ${it.keywords ?? ""}`,
      }))
    );
    const actions: Entry[] = [
      {
        id: "act-theme", group: "アクション",
        label: prefs.theme === "light" ? "ダークモードに切り替え" : "ライトモードに切り替え",
        icon: prefs.theme === "light" ? <Moon size={15} /> : <Sun size={15} />,
        action: () => prefs.set({ theme: prefs.theme === "light" ? "dark" : "light" }),
        keywords: "theme dark light テーマ",
      },
      {
        id: "act-density", group: "アクション",
        label: prefs.density === "comfortable" ? "コンパクト密度に切り替え" : "標準密度に切り替え",
        icon: <SlidersHorizontal size={15} />,
        action: () => prefs.set({ density: prefs.density === "comfortable" ? "compact" : "comfortable" }),
        keywords: "density 密度",
      },
    ];
    return [...actions, ...nav];
  }, [prefs]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return entries.slice(0, 14);
    return entries.filter((e) => `${e.label} ${e.keywords ?? ""}`.toLowerCase().includes(needle)).slice(0, 14);
  }, [entries, q]);

  useEffect(() => { if (open) { setQ(""); setFocus(0); setTimeout(() => inputRef.current?.focus(), 10); } }, [open]);
  useEffect(() => setFocus(0), [q]);

  if (!open) return null;

  const run = (e: Entry) => {
    onClose();
    if (e.path) navigate(e.path);
    e.action?.();
  };

  return createPortal(
    <div className="vq-cmdk-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="vq-cmdk" role="dialog" aria-modal="true" aria-label="コマンドパレット">
        <div className="vq-cmdk__input">
          <Search size={17} />
          <input
            ref={inputRef}
            value={q}
            placeholder="ページ・コンポーネント・アクションを検索"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setFocus((f) => Math.min(f + 1, filtered.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setFocus((f) => Math.max(f - 1, 0)); }
              if (e.key === "Enter" && filtered[focus]) run(filtered[focus]);
              if (e.key === "Escape") onClose();
            }}
            aria-label="検索"
          />
          <Kbd>esc</Kbd>
        </div>
        <div className="vq-cmdk__list" ref={listRef}>
          {filtered.length === 0 && (
            <div style={{ padding: "var(--vq-sp-8)", textAlign: "center", color: "var(--vq-text-tertiary)", font: "var(--vq-type-body-sm)" }}>
              「{q}」に一致する結果はありません
            </div>
          )}
          {filtered.map((e, i) => (
            <React.Fragment key={e.id}>
              {(i === 0 || filtered[i - 1].group !== e.group) && <div className="vq-cmdk__group">{e.group}</div>}
              <button
                type="button"
                className={`vq-cmdk__item ${i === focus ? "is-focused" : ""}`}
                onMouseEnter={() => setFocus(i)}
                onClick={() => run(e)}
              >
                {e.icon ?? <Search size={14} style={{ opacity: 0.45 }} />}
                {e.label}
                {e.path ? <span className="vq-cmdk__path">{e.path}</span> : i === focus && <CornerDownLeft size={13} className="vq-cmdk__path" />}
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
