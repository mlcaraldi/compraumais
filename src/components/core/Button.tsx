import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "dark" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  /** ajusta secondary/ghost para fundo Verde-noite */
  onDark?: boolean;
  block?: boolean;
  children?: ReactNode;
}

const SIZES = {
  sm: { h: 36, px: 14, fs: 14 },
  md: { h: 44, px: 20, fs: 15 },
  lg: { h: 52, px: 24, fs: 16 },
};

export function Button({
  variant = "primary",
  size = "md",
  onDark = false,
  block = false,
  disabled = false,
  children,
  style,
  type = "button",
  ...rest
}: ButtonProps) {
  const s = SIZES[size];
  const variants: Record<string, CSSProperties> = {
    primary: {
      background: "var(--btn-primary-bg)",
      color: "var(--btn-primary-fg)",
      border: "1px solid transparent",
      fontWeight: 600,
    },
    dark: {
      background: "var(--surface-inverse)",
      color: "var(--fg-inverse-1)",
      border: "1px solid transparent",
      fontWeight: 600,
    },
    secondary: onDark
      ? {
          background: "transparent",
          color: "var(--fg-inverse-1)",
          border: "1px solid var(--border-on-dark)",
          fontWeight: 500,
        }
      : {
          background: "transparent",
          color: "var(--fg-1)",
          border: "1px solid var(--fg-1)",
          fontWeight: 500,
        },
    ghost: {
      background: "transparent",
      color: onDark ? "var(--fg-inverse-1)" : "var(--fg-accent)",
      border: "1px solid transparent",
      fontWeight: 600,
    },
  };
  return (
    <button
      type={type}
      disabled={disabled}
      className="items-center justify-center gap-2 whitespace-nowrap transition-[filter,transform] duration-150 ease-in-out enabled:cursor-pointer enabled:hover:brightness-[0.94] enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
      style={{
        ...variants[variant],
        height: s.h,
        minHeight: s.h < 44 ? undefined : 44,
        padding: `0 ${s.px}px`,
        fontSize: s.fs,
        fontFamily: "var(--cm-font-sans)",
        borderRadius: "var(--radius-md)",
        display: block ? "flex" : "inline-flex",
        width: block ? "100%" : undefined,
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
