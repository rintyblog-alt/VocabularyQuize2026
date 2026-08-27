import React from "react";
import { Check, Minus } from "lucide-react";

/* ── Checkbox ───────────────────────────────────────────── */
export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: React.ReactNode;
  indeterminate?: boolean;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, indeterminate, className = "", ...rest },
  ref
) {
  return (
    <label className={`vq-check ${className}`}>
      <input
        type="checkbox"
        ref={(el) => {
          if (el) el.indeterminate = !!indeterminate;
          if (typeof ref === "function") ref(el);
          else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = el;
        }}
        {...rest}
      />
      <span className="vq-check__box" aria-hidden>
        {indeterminate ? <Minus size={13} strokeWidth={3} /> : <Check size={13} strokeWidth={3.2} />}
      </span>
      {label && <span className="vq-check__label">{label}</span>}
    </label>
  );
});

/* ── Radio ──────────────────────────────────────────────── */
export interface RadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: React.ReactNode;
}

export function Radio({ label, className = "", ...rest }: RadioProps) {
  return (
    <label className={`vq-check ${className}`}>
      <input type="radio" {...rest} />
      <span className="vq-check__box vq-check__box--radio" aria-hidden />
      {label && <span className="vq-check__label">{label}</span>}
    </label>
  );
}

/* ── Switch ─────────────────────────────────────────────── */
export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  label?: React.ReactNode;
  size?: "sm" | "md";
}

export function Switch({ label, size = "md", className = "", ...rest }: SwitchProps) {
  return (
    <label className={`vq-switch ${size === "sm" ? "vq-switch--sm" : ""} ${className}`}>
      <input type="checkbox" role="switch" {...rest} />
      <span className="vq-switch__track" aria-hidden />
      {label && <span className="vq-check__label">{label}</span>}
    </label>
  );
}

/* ── Slider ─────────────────────────────────────────────── */
export interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  value: number;
  min?: number;
  max?: number;
}

export function Slider({ value, min = 0, max = 100, className = "", style, ...rest }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      className={`vq-slider ${className}`}
      value={value}
      min={min}
      max={max}
      style={{ ...style, ["--_fill" as string]: `${pct}%` }}
      {...rest}
    />
  );
}
