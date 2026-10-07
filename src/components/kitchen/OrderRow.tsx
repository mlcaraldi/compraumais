export interface OrderRowProps {
  client: string;
  detail?: string;
  status?: "accepted" | "open" | "complete";
  /** ex.: "R$ 862,00" */
  value: string;
  divider?: boolean;
  onClick?: () => void;
}

const STATUS = {
  accepted: "var(--fg-success)",
  open: "var(--fg-accent)",
  complete: "var(--fg-2)",
};

export function OrderRow({
  client,
  detail,
  status = "complete",
  value,
  divider = true,
  onClick,
}: OrderRowProps) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        padding: "14px 16px",
        borderBottom: divider ? "1px solid var(--border-1)" : "none",
        cursor: onClick ? "pointer" : "default",
        fontFamily: "var(--cm-font-sans)",
        fontVariantNumeric: "tabular-nums",
        color: "var(--fg-1)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontWeight: 600,
            fontSize: 15,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {client}
        </div>
        {detail && (
          <div style={{ fontSize: 12, lineHeight: 1.35, color: STATUS[status], marginTop: 2 }}>
            {detail}
          </div>
        )}
      </div>
      <span style={{ fontSize: 15, flex: "none", whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}
