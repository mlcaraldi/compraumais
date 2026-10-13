import type { CSSProperties, ReactNode } from "react";
import { Badge } from "../core/Badge";
import { Button } from "../core/Button";

export interface FollowUpAlertProps {
  title: ReactNode;
  body?: ReactNode;
  /** timer, ex.: "03:12" */
  remaining?: string;
  primaryLabel?: string;
  secondaryLabel?: string;
  onPrimary?: () => void;
  onSecondary?: () => void;
  style?: CSSProperties;
}

export function FollowUpAlert({
  title,
  body,
  remaining,
  primaryLabel = "Ligar agora",
  secondaryLabel = "Mandar recado",
  onPrimary,
  onSecondary,
  style,
}: FollowUpAlertProps) {
  return (
    <div
      style={{
        background: "var(--surface-inverse)",
        color: "var(--fg-inverse-1)",
        borderRadius: "var(--radius-alert)",
        padding: 18,
        fontFamily: "var(--cm-font-sans)",
        ...style,
      }}
    >
      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}
      >
        <span
          style={{
            fontFamily: "var(--cm-font-mono)",
            fontSize: 11,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: "var(--fg-accent-on-dark)",
            whiteSpace: "nowrap",
          }}
        >
          Follow-up
        </span>
        {remaining && <Badge mono>{remaining}</Badge>}
      </div>
      <div
        style={{
          fontFamily: "var(--cm-font-display)",
          fontWeight: 600,
          fontSize: 20,
          lineHeight: 1.2,
          marginTop: 12,
        }}
      >
        {title}
      </div>
      {body && (
        <div
          style={{
            fontSize: 14,
            lineHeight: 1.45,
            color: "var(--cm-sobre-escuro-1)",
            marginTop: 8,
          }}
        >
          {body}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 16 }}>
        <Button size="md" onClick={onPrimary}>
          {primaryLabel}
        </Button>
        <Button size="md" variant="secondary" onDark onClick={onSecondary}>
          {secondaryLabel}
        </Button>
      </div>
    </div>
  );
}
