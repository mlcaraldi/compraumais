import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: "surface" | "inverse" | "dashed" | "page";
  padding?: number | string;
  radius?: number | string;
  elevated?: boolean;
  children?: ReactNode;
}

const TONES: Record<NonNullable<CardProps["tone"]>, CSSProperties> = {
  surface: {
    background: "var(--surface-card)",
    border: "1px solid var(--border-1)",
    color: "var(--fg-1)",
  },
  inverse: {
    background: "var(--surface-inverse)",
    border: "1px solid transparent",
    color: "var(--fg-inverse-1)",
  },
  dashed: {
    background: "transparent",
    border: "1px dashed var(--border-strong)",
    color: "var(--fg-1)",
  },
  page: { background: "var(--bg-page)", border: "1px solid var(--border-1)", color: "var(--fg-1)" },
};

export function Card({
  tone = "surface",
  padding = 24,
  radius = "var(--radius-lg)",
  elevated = false,
  children,
  style,
  ...rest
}: CardProps) {
  return (
    <div
      style={{
        ...TONES[tone],
        padding,
        borderRadius: radius,
        boxShadow: elevated ? "var(--shadow-card)" : "none",
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
