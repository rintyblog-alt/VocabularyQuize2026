import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useClickOutside, useEscape, useScrollLock } from "../hooks";
import { IconButton } from "./Button";

/* ── Modal ──────────────────────────────────────────────── */
export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  size?: "md" | "lg" | "xl";
  footer?: React.ReactNode;
  footerBetween?: boolean;
  children?: React.ReactNode;
  closeOnOverlay?: boolean;
  sheetGrab?: boolean;
}

export function Modal({
  open, onClose, title, description, size = "md", footer, footerBetween, children, closeOnOverlay = true, sheetGrab,
}: ModalProps) {
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  useScrollLock(open);

  const requestClose = () => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { onClose(); return; }
    setClosing(true);
    setTimeout(() => { setClosing(false); onClose(); }, 170);
  };
  useEscape(open ? requestClose : undefined, open);

  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLElement>("[autofocus], input, button")?.focus?.();
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div
      className={`vq-overlay ${closing ? "is-closing" : ""}`}
      onMouseDown={(e) => { if (closeOnOverlay && e.target === e.currentTarget) requestClose(); }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        className={`vq-modal ${size !== "md" ? `vq-modal--${size}` : ""}`}
      >
        {sheetGrab && <div className="vq-sheet-grab" aria-hidden />}
        {(title || description) && (
          <div className="vq-modal__head">
            <div className="vq-grow">
              {title && <div className="vq-modal__title">{title}</div>}
              {description && <div className="vq-modal__desc">{description}</div>}
            </div>
            <IconButton size="sm" label="閉じる" onClick={requestClose}><X size={17} /></IconButton>
          </div>
        )}
        <div className="vq-modal__body">{children}</div>
        {footer && <div className={`vq-modal__foot ${footerBetween ? "vq-modal__foot--between" : ""}`}>{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

/* ── Drawer ─────────────────────────────────────────────── */
export function Drawer({
  open, onClose, side = "right", title, children, width,
}: { open: boolean; onClose: () => void; side?: "left" | "right"; title?: React.ReactNode; children?: React.ReactNode; width?: number }) {
  useScrollLock(open);
  useEscape(open ? onClose : undefined, open);
  if (!open) return null;
  return createPortal(
    <>
      <div className="vq-drawer-overlay" onClick={onClose} />
      <div
        className={`vq-drawer vq-drawer--${side}`}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : "パネル"}
        style={width ? { width: `min(${width}px, 92vw)` } : undefined}
      >
        {title && (
          <div className="vq-drawer__head">
            <span className="vq-grow" style={{ font: "var(--vq-type-heading-sm)" }}>{title}</span>
            <IconButton size="sm" label="閉じる" onClick={onClose}><X size={17} /></IconButton>
          </div>
        )}
        <div className="vq-drawer__body">{children}</div>
      </div>
    </>,
    document.body
  );
}

/* ── Dropdown menu ──────────────────────────────────────── */
export interface MenuItemDef {
  id: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  separatorAbove?: boolean;
  onSelect?: () => void;
}

export function Dropdown({
  trigger, items, align = "start", label,
}: { trigger: React.ReactNode; items: MenuItemDef[]; align?: "start" | "end"; label?: string }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useClickOutside(wrapRef, () => setOpen(false), open);
  useEscape(() => setOpen(false), open);

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-flex" }}>
      <span onClick={() => setOpen((o) => !o)} style={{ display: "inline-flex" }}>{trigger}</span>
      {open && (
        <div
          className="vq-menu"
          role="menu"
          aria-label={label}
          style={{ position: "absolute", top: "calc(100% + 6px)", [align === "end" ? "right" : "left"]: 0, zIndex: 95 }}
        >
          {items.map((it) => (
            <React.Fragment key={it.id}>
              {it.separatorAbove && <hr className="vq-menu__sep" />}
              <button
                type="button"
                role="menuitem"
                disabled={it.disabled}
                className={`vq-menu__item ${it.danger ? "is-danger" : ""}`}
                onClick={() => { setOpen(false); it.onSelect?.(); }}
              >
                {it.icon}
                {it.label}
                {it.hint && <span className="vq-menu__hint">{it.hint}</span>}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Tooltip ────────────────────────────────────────────── */
export function Tooltip({ content, children }: { content: React.ReactNode; children: React.ReactElement }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const show = (e: React.MouseEvent | React.FocusEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: r.top - 8 });
  };
  const hide = () => setPos(null);
  return (
    <>
      {React.cloneElement(children, {
        onMouseEnter: show, onMouseLeave: hide, onFocus: show, onBlur: hide,
      } as React.HTMLAttributes<HTMLElement>)}
      {pos && createPortal(
        <div className="vq-tooltip" role="tooltip" style={{ left: pos.x, top: pos.y, transform: "translate(-50%, -100%)" }}>
          {content}
        </div>,
        document.body
      )}
    </>
  );
}
