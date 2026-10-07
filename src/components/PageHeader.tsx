import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 16,
        marginBottom: 24,
      }}
    >
      <div>
        <h1 style={{ fontSize: "var(--text-h2)", lineHeight: "var(--lh-h2)", margin: 0 }}>
          {title}
        </h1>
        {subtitle && <p style={{ color: "var(--fg-2)", margin: "4px 0 0" }}>{subtitle}</p>}
      </div>
      {actions}
    </header>
  );
}
