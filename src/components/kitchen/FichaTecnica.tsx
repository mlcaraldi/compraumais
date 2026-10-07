import type { CSSProperties, ReactNode } from "react";

export interface FichaItem {
  name: ReactNode;
  /** ex.: "480 g", "4 un." */
  qty: string;
  status: "ok" | "missing";
  /** substitui o rótulo padrão ("✓ no pedido" / "+ oferta") */
  label?: string;
  /** texto de apoio sob o nome (justificativa) */
  detail?: ReactNode;
}

export interface FichaTecnicaProps {
  dish?: string;
  portions?: number;
  items: FichaItem[];
  /** ex.: "R$ 77,60" */
  total?: string;
  totalLabel?: string;
  elevated?: boolean;
  style?: CSSProperties;
}

export function FichaTecnica({
  dish = "Smash da casa",
  portions = 4,
  items = [],
  total,
  totalLabel = "Oferta enviada ao cliente",
  elevated = true,
  style,
}: FichaTecnicaProps) {
  return (
    <div
      style={{
        background: "var(--surface-card)",
        border: "1px solid var(--border-1)",
        borderRadius: "var(--radius-lg)",
        padding: 24,
        fontVariantNumeric: "tabular-nums",
        boxShadow: elevated ? "var(--shadow-card)" : "none",
        fontFamily: "var(--cm-font-sans)",
        color: "var(--fg-1)",
        ...style,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          fontFamily: "var(--cm-font-mono)",
          fontSize: 11,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--fg-2)",
        }}
      >
        <span>Ficha técnica · {dish}</span>
        <span style={{ whiteSpace: "nowrap" }}>{portions} porções</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 16, fontSize: 15 }}>
        {items.map((it, i) => {
          const missing = it.status === "missing";
          const label = it.label ?? (missing ? "+ oferta" : "✓ no pedido");
          return (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                padding: "10px 0",
                borderBottom: i < items.length - 1 ? "1px dashed var(--border-1)" : "none",
                fontWeight: missing ? 600 : 400,
              }}
            >
              <span>
                {it.name}
                {it.detail && (
                  <span
                    style={{
                      display: "block",
                      fontWeight: 400,
                      fontSize: 13,
                      lineHeight: 1.4,
                      color: "var(--fg-2)",
                      marginTop: 2,
                    }}
                  >
                    {it.detail}
                  </span>
                )}
              </span>
              <span
                style={{
                  color: missing ? "var(--fg-accent)" : "var(--fg-success)",
                  whiteSpace: "nowrap",
                }}
              >
                {label} · {it.qty}
              </span>
            </div>
          );
        })}
      </div>
      {total != null && (
        <div
          style={{
            marginTop: 12,
            padding: 14,
            background: "var(--surface-inverse)",
            color: "var(--fg-inverse-1)",
            borderRadius: "var(--radius-md)",
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            fontSize: 15,
          }}
        >
          <span>{totalLabel}</span>
          <b style={{ color: "var(--fg-accent-on-dark)", whiteSpace: "nowrap" }}>{total}</b>
        </div>
      )}
    </div>
  );
}
