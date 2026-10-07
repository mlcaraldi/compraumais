import type { CSSProperties, ReactNode } from "react";

export interface BadgeProps {
  tone?: "brasa" | "success" | "success-soft" | "neutral" | "outline" | "inverse";
  mono?: boolean;
  children?: ReactNode;
  style?: CSSProperties;
}

const TONES: Record<NonNullable<BadgeProps["tone"]>, CSSProperties> = {
  brasa: { background: "var(--accent)", color: "var(--fg-1)", border: "1px solid transparent" },
  success: {
    background: "var(--cm-manjericao)",
    color: "var(--cm-sal)",
    border: "1px solid transparent",
  },
  "success-soft": {
    background: "var(--cm-manjericao-claro)",
    color: "var(--cm-manjericao)",
    border: "1px solid transparent",
  },
  neutral: { background: "var(--cm-linho)", color: "var(--fg-1)", border: "1px solid transparent" },
  outline: {
    background: "transparent",
    color: "var(--fg-2)",
    border: "1px solid var(--border-strong)",
  },
  inverse: {
    background: "var(--surface-inverse)",
    color: "var(--fg-inverse-1)",
    border: "1px solid transparent",
  },
};

export function Badge({ tone = "brasa", mono = false, children, style }: BadgeProps) {
  return (
    <span
      style={{
        ...TONES[tone],
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 9px",
        borderRadius: "var(--radius-pill)",
        fontFamily: mono ? "var(--cm-font-mono)" : "var(--cm-font-sans)",
        fontSize: mono ? 13 : 12,
        fontWeight: 600,
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
        lineHeight: 1.4,
        ...style,
      }}
    >
      {children}
    </span>
  );
}
