import type { CSSProperties, ReactNode } from "react";

export interface SectionLabelProps {
  number?: string | number;
  onDark?: boolean;
  children?: ReactNode;
  style?: CSSProperties;
}

export function SectionLabel({ number, onDark = false, children, style }: SectionLabelProps) {
  return (
    <div
      style={{
        fontFamily: "var(--cm-font-mono)",
        fontSize: 12,
        fontWeight: 500,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: onDark ? "var(--fg-accent-on-dark)" : "var(--fg-accent)",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {number != null ? `${number} - ` : ""}
      {children}
    </div>
  );
}
