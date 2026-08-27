import React from "react";
import { Loader2 } from "lucide-react";

export type ButtonVariant =
  | "primary" | "secondary" | "outline" | "ghost"
  | "danger" | "danger-soft" | "success" | "link";
export type ControlSize = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ControlSize;
  loading?: boolean;
  full?: boolean;
  icon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, full, icon, trailingIcon, className = "", children, disabled, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      className={[
        "vq-btn", `vq-btn--${variant}`,
        size !== "md" && `vq-btn--${size}`,
        full && "vq-btn--full",
        loading && "is-loading",
        className,
      ].filter(Boolean).join(" ")}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && (
        <span className="vq-btn__spinner" aria-hidden>
          <Loader2 className="vq-spinner" size={size === "sm" ? 14 : 17} style={{ color: "currentColor" }} />
        </span>
      )}
      <span className="vq-btn__content">
        {icon}
        {children}
        {trailingIcon}
      </span>
    </button>
  );
});

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string; // aria-label 必須
  size?: ControlSize;
  variant?: "ghost" | "outline" | "primary";
  active?: boolean;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = "md", variant = "ghost", active, className = "", children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      aria-label={label}
      title={label}
      className={[
        "vq-iconbtn",
        size !== "md" && `vq-iconbtn--${size}`,
        variant !== "ghost" && `vq-iconbtn--${variant}`,
        active && "is-active",
        className,
      ].filter(Boolean).join(" ")}
      {...rest}
    >
      {children}
    </button>
  );
});

export function ButtonGroup({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`vq-btngroup ${className}`}>{children}</div>;
}
