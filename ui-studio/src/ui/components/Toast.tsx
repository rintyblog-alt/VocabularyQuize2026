import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, Sparkles, XCircle } from "lucide-react";
import { Button } from "./Button";

export type ToastTone = "info" | "success" | "warning" | "danger" | "ai";
export interface ToastOptions {
  title: string;
  description?: string;
  tone?: ToastTone;
  duration?: number;
  action?: { label: string; onClick: () => void };
}
interface ToastRecord extends ToastOptions { id: number; leaving?: boolean }

const ToastCtx = createContext<(opts: ToastOptions) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

const ICONS: Record<ToastTone, React.ReactNode> = {
  info: <Info size={17} style={{ color: "var(--vq-info)" }} />,
  success: <CheckCircle2 size={17} style={{ color: "var(--vq-success)" }} />,
  warning: <AlertTriangle size={17} style={{ color: "var(--vq-warning)" }} />,
  danger: <XCircle size={17} style={{ color: "var(--vq-danger)" }} />,
  ai: <Sparkles size={17} style={{ color: "var(--vq-ai)" }} />,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((ts) => ts.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 200);
  }, []);

  const push = useCallback((opts: ToastOptions) => {
    const id = ++seq.current;
    setToasts((ts) => [...ts.slice(-3), { ...opts, id }]);
    const dur = opts.duration ?? 3800;
    if (dur > 0) setTimeout(() => dismiss(id), dur);
  }, [dismiss]);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      {createPortal(
        <div className="vq-toaster" aria-live="polite" aria-atomic="false">
          {toasts.map((t) => (
            <div key={t.id} className={`vq-toast ${t.leaving ? "is-leaving" : ""}`} role="status">
              <span className="vq-toast__icon">{ICONS[t.tone ?? "info"]}</span>
              <span className="vq-grow">
                <div className="vq-toast__title">{t.title}</div>
                {t.description && <div className="vq-toast__desc">{t.description}</div>}
              </span>
              {t.action && (
                <Button size="sm" variant="ghost" onClick={() => { t.action?.onClick(); dismiss(t.id); }}>
                  {t.action.label}
                </Button>
              )}
            </div>
          ))}
        </div>,
        document.body
      )}
    </ToastCtx.Provider>
  );
}
