import React, { useRef, useState } from "react";
import { AlertCircle, ChevronDown, Eye, EyeOff, Search, X } from "lucide-react";
import { useId2 } from "../hooks";
import { IconButton } from "./Button";
import type { ControlSize } from "./Button";

/* ── Field wrapper: label / hint / error を統一 ─────────── */
export interface FieldProps {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  count?: { current: number; max: number };
  /** 関数なら id/エラー状態を受け取れる。要素をそのまま渡してもよい。 */
  children: React.ReactNode | ((a: { id: string; describedBy?: string; invalid: boolean }) => React.ReactNode);
}

export function Field({ label, hint, error, required, count, children }: FieldProps) {
  const id = useId2("field");
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  return (
    <div className="vq-field">
      {(label || count) && (
        <label className="vq-field__label" htmlFor={id}>
          {label}
          {required && <span className="vq-field__req" aria-label="必須">*</span>}
          {count && (
            <span className={`vq-field__count vq-num ${count.current > count.max ? "is-over" : ""}`}>
              {count.current} / {count.max}
            </span>
          )}
        </label>
      )}
      {typeof children === "function"
        ? children({ id, describedBy: errId ?? hintId, invalid: !!error })
        : children}
      {error ? (
        <span className="vq-field__error" id={errId} role="alert">
          <AlertCircle size={13} /> {error}
        </span>
      ) : hint ? (
        <span className="vq-field__hint" id={hintId}>{hint}</span>
      ) : null}
    </div>
  );
}

/* ── TextInput ──────────────────────────────────────────── */
export interface TextInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  size?: ControlSize;
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
  addon?: React.ReactNode;
  invalid?: boolean;
}

export const TextInput = React.forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { size = "md", icon, trailing, addon, invalid, className = "", disabled, ...rest },
  ref
) {
  return (
    <div
      className={[
        "vq-input",
        size !== "md" && `vq-input--${size}`,
        invalid && "is-invalid",
        disabled && "is-disabled",
        className,
      ].filter(Boolean).join(" ")}
    >
      {addon && <span className="vq-input__addon">{addon}</span>}
      {icon && <span className="vq-input__icon">{icon}</span>}
      <input ref={ref} disabled={disabled} aria-invalid={invalid || undefined} {...rest} />
      {trailing && <span className="vq-input__trail">{trailing}</span>}
    </div>
  );
});

/* ── PasswordInput（表示切替 + CapsLock検知） ───────────── */
export interface PasswordInputProps extends TextInputProps {
  onCapsLock?: (on: boolean) => void;
}

export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(
  { onCapsLock, ...rest },
  ref
) {
  const [show, setShow] = useState(false);
  return (
    <TextInput
      ref={ref}
      type={show ? "text" : "password"}
      autoComplete="current-password"
      onKeyUp={(e) => onCapsLock?.(e.getModifierState?.("CapsLock") ?? false)}
      trailing={
        <IconButton
          size="sm"
          label={show ? "パスワードを隠す" : "パスワードを表示"}
          onClick={() => setShow((s) => !s)}
          tabIndex={-1}
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </IconButton>
      }
      {...rest}
    />
  );
});

/* ── SearchInput（クリア付き） ──────────────────────────── */
export function SearchInput({
  value, onChange, placeholder = "検索", size = "md", ...rest
}: { value: string; onChange: (v: string) => void; placeholder?: string; size?: ControlSize } & Omit<TextInputProps, "value" | "onChange" | "icon" | "trailing">) {
  return (
    <TextInput
      role="searchbox"
      size={size}
      icon={<Search size={16} />}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      trailing={
        value ? (
          <IconButton size="sm" label="クリア" onClick={() => onChange("")}>
            <X size={15} />
          </IconButton>
        ) : undefined
      }
      {...rest}
    />
  );
}

/* ── Textarea ───────────────────────────────────────────── */
export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ invalid, className = "", ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      className={["vq-textarea", invalid && "is-invalid", className].filter(Boolean).join(" ")}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
});

/* ── Select（ネイティブ + 独自シェブロン） ──────────────── */
export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  size?: ControlSize;
  invalid?: boolean;
  icon?: React.ReactNode;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { size = "md", invalid, icon, className = "", children, disabled, ...rest },
  ref
) {
  return (
    <div
      className={[
        "vq-input",
        size !== "md" && `vq-input--${size}`,
        invalid && "is-invalid",
        disabled && "is-disabled",
        className,
      ].filter(Boolean).join(" ")}
    >
      {icon && <span className="vq-input__icon">{icon}</span>}
      <select ref={ref} disabled={disabled} aria-invalid={invalid || undefined} {...rest}>
        {children}
      </select>
      <ChevronDown size={16} className="vq-select-chevron" aria-hidden />
    </div>
  );
});

/* ── OTP Input ──────────────────────────────────────────── */
export function OTPInput({
  length = 6, value, onChange, invalid, autoFocus,
}: { length?: number; value: string; onChange: (v: string) => void; invalid?: boolean; autoFocus?: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const chars = Array.from({ length }, (_, i) => value[i] ?? "");

  const setAt = (i: number, ch: string) => {
    const next = chars.slice();
    next[i] = ch;
    onChange(next.join("").slice(0, length));
  };

  return (
    <div className={`vq-otp ${invalid ? "is-invalid" : ""}`} role="group" aria-label="確認コード">
      {chars.map((ch, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          autoFocus={autoFocus && i === 0}
          className={ch ? "is-filled" : ""}
          value={ch}
          aria-label={`${i + 1}桁目`}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "").slice(-1);
            setAt(i, v);
            if (v && i < length - 1) refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !ch && i > 0) refs.current[i - 1]?.focus();
            if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
            if (e.key === "ArrowRight" && i < length - 1) refs.current[i + 1]?.focus();
          }}
          onPaste={(e) => {
            e.preventDefault();
            const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
            if (text) { onChange(text); refs.current[Math.min(text.length, length - 1)]?.focus(); }
          }}
        />
      ))}
    </div>
  );
}
