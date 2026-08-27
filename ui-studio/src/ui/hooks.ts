import { useCallback, useEffect, useRef, useState } from "react";

/** localStorage-backed state (studio prefs / demo persistence) */
export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw != null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const v = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
        return v;
      });
    },
    [key]
  );
  return [value, set] as const;
}

/** Escキーで閉じる */
export function useEscape(onEscape: (() => void) | undefined, active = true) {
  useEffect(() => {
    if (!active || !onEscape) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onEscape(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onEscape, active]);
}

/** 外側クリックで閉じる */
export function useClickOutside(ref: React.RefObject<HTMLElement | null>, onOutside: () => void, active = true) {
  useEffect(() => {
    if (!active) return;
    const h = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener("pointerdown", h);
    return () => document.removeEventListener("pointerdown", h);
  }, [ref, onOutside, active]);
}

/** 数値カウントアップ（スコア表示等）。reduced-motion では即値。 */
export function useCountUp(target: number, durationMs = 900, start = true) {
  const [value, setValue] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    if (!start) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      || document.documentElement.dataset.motion === "off";
    if (reduced || durationMs <= 0) { setValue(target); return; }
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(target * eased));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, durationMs, start]);
  return value;
}

/** インターバルタイマー（クイズ残り時間等） */
export function useCountdown(totalSec: number, running: boolean, onEnd?: () => void) {
  const [remaining, setRemaining] = useState(totalSec);
  const endRef = useRef(onEnd);
  endRef.current = onEnd;
  useEffect(() => setRemaining(totalSec), [totalSec]);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) { clearInterval(id); endRef.current?.(); return 0; }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running]);
  return [remaining, setRemaining] as const;
}

/** メディアクエリ購読 */
export function useMedia(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const h = () => setMatches(mq.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, [query]);
  return matches;
}

/** body スクロールロック（モーダル表示中） */
export function useScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [locked]);
}

let idSeq = 0;
export function useId2(prefix = "vq") {
  const ref = useRef("");
  if (!ref.current) ref.current = `${prefix}-${++idSeq}`;
  return ref.current;
}
