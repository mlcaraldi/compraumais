import { Badge } from "@/components/core/Badge";
import { Button } from "@/components/core/Button";
import { Card } from "@/components/core/Card";
import { DocumentPreview } from "@/components/DocumentPreview";
import { formatCents } from "@/server/normalize";
import type { OrderHeaderData, OrderLineData } from "@/server/importers/order/postprocess";
import type { RowWarning } from "@/server/importers/types";
import type { ImportRow } from "@/server/repos/imports";
import {
  confirmAction,
  orderCustomerAction,
  orderHeaderAction,
  orderLineAction,
  orderRowStatusAction,
} from "./actions";
import { ROW_STATUS_LABEL } from "./labels";

const field = {
  height: 36,
  borderRadius: "var(--radius-md)",
  border: "1px solid var(--border-strong)",
  background: "var(--surface-card)",
  padding: "0 8px",
  fontFamily: "inherit",
  fontSize: 14,
  width: "100%",
} as const;

const TD = { padding: "8px 8px", verticalAlign: "top" } as const;

type Doc = { sha256: string; mime: string; filename: string; sizeBytes: number };

export function OrderReview({
  jobId,
  status,
  doc,
  rows,
  model,
  costCents,
}: {
  jobId: string;
  status: string;
  doc: Doc | null;
  rows: ImportRow[];
  model: string | null;
  costCents: string | null;
}) {
  const header = rows.find((r) => r.rowType === "order_header");
  const lines = rows.filter((r) => r.rowType === "order_line");
  const h = header?.data as OrderHeaderData | undefined;
  const hw = (header?.warnings ?? []) as RowWarning[];
  const pending = rows.filter((r) => r.status === "pending").length;
  const kept = lines.filter((r) => r.status !== "rejected");
  const editable = status === "review";
  const canConfirm = editable && pending === 0 && kept.length > 0;
  const total = kept.reduce((acc, r) => {
    const d = r.data as OrderLineData;
    return acc + (d.lineTotalCents ?? Math.round(d.qty * d.unitPriceCents));
  }, 0);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(260px, 340px) 1fr",
        gap: 16,
        alignItems: "start",
      }}
    >
      <div style={{ display: "grid", gap: 16 }}>
        <Card>
          <div
            style={{
              fontSize: 12,
              color: "var(--fg-2)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: 8,
            }}
          >
            Documento original
          </div>
          {doc && <DocumentPreview sha={doc.sha256} mime={doc.mime} filename={doc.filename} />}
          <p className="tabular" style={{ color: "var(--fg-2)", fontSize: 13, marginBottom: 0 }}>
            {model ? `Lido por ${model}` : "Pedido digitado"}
            {costCents ? ` · custo estimado US$ ${(Number(costCents) / 100).toFixed(3)}` : ""}
          </p>
        </Card>
        {editable && (
          <Card>
            <p className="tabular" style={{ margin: "0 0 12px", fontSize: 14 }}>
              {kept.length} linha(s) · {formatCents(total)}
            </p>
            <form action={confirmAction}>
              <input type="hidden" name="jobId" value={jobId} />
              <Button type="submit" block disabled={!canConfirm}>
                Confirmar pedido
              </Button>
            </form>
            {!canConfirm && (
              <p style={{ fontSize: 13, color: "var(--fg-2)", marginBottom: 0 }}>
                Resolva {pending} pendência(s) em amarelo ou rejeite as linhas.
              </p>
            )}
          </Card>
        )}
      </div>

      <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
        {h && (
          <Card>
            <h2 style={{ fontSize: "var(--text-h3)", margin: "0 0 12px" }}>Cabeçalho</h2>
            <form
              action={orderHeaderAction}
              style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr auto" }}
            >
              <input type="hidden" name="jobId" value={jobId} />
              <label style={{ display: "grid", gap: 4, fontSize: 14, fontWeight: 600 }}>
                Número do pedido
                <input
                  name="orderNumber"
                  defaultValue={h.orderNumber}
                  disabled={!editable}
                  style={field}
                />
              </label>
              <label style={{ display: "grid", gap: 4, fontSize: 14, fontWeight: 600 }}>
                Data
                <input
                  type="date"
                  name="issuedAt"
                  defaultValue={h.issuedAt ?? ""}
                  disabled={!editable}
                  style={field}
                />
              </label>
              {editable && (
                <div style={{ alignSelf: "end" }}>
                  <Button type="submit" size="sm" variant="secondary">
                    Salvar
                  </Button>
                </div>
              )}
            </form>
            <dl
              style={{
                margin: "12px 0 0",
                fontSize: 14,
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                gap: "4px 12px",
              }}
            >
              <dt style={{ color: "var(--fg-2)" }}>Cliente no pedido</dt>
              <dd style={{ margin: 0 }}>
                {[
                  h.customer.name,
                  h.customer.code && `cód. ${h.customer.code}`,
                  h.customer.document,
                ]
                  .filter(Boolean)
                  .join(" · ") || "não informado"}
              </dd>
              <dt style={{ color: "var(--fg-2)" }}>Representante</dt>
              <dd style={{ margin: 0 }}>{h.repCode ?? "não informado"}</dd>
              <dt style={{ color: "var(--fg-2)" }}>Condição</dt>
              <dd style={{ margin: 0 }}>{h.paymentTerms ?? "não informada"}</dd>
              <dt style={{ color: "var(--fg-2)" }}>Total no documento</dt>
              <dd className="tabular" style={{ margin: 0 }}>
                {h.totalCents === null ? "não informado" : formatCents(h.totalCents)}
              </dd>
            </dl>
            <div style={{ marginTop: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>
                Cliente vinculado:{" "}
                {h.customerId ? (
                  <Badge tone="success-soft">vinculado</Badge>
                ) : (
                  <Badge tone="brasa">pendente</Badge>
                )}
              </div>
              {editable && (
                <form
                  action={orderCustomerAction}
                  style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
                >
                  <input type="hidden" name="jobId" value={jobId} />
                  {h.suggestions.length > 0 && (
                    <select name="customerId" style={{ ...field, width: "auto", minWidth: 260 }}>
                      <option value="">Sugestões por nome</option>
                      {h.suggestions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  )}
                  <input
                    name="code"
                    placeholder="ou código do cliente"
                    aria-label="Código do cliente"
                    style={{ ...field, width: 200 }}
                  />
                  <Button type="submit" size="sm" variant="secondary">
                    Vincular cliente
                  </Button>
                </form>
              )}
            </div>
            {hw.map((w) => (
              <p
                key={w.code}
                style={{
                  margin: "8px 0 0",
                  fontSize: 14,
                  color: w.severity === "blocking" ? "var(--fg-accent)" : "var(--fg-2)",
                }}
              >
                {w.message}
              </p>
            ))}
          </Card>
        )}

        <Card padding={0} style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--fg-2)" }}>
                {["Código", "Descrição", "Qtde", "Valor unit. (R$)", "Total", "Situação", ""].map(
                  (t) => (
                    <th key={t} style={{ padding: "10px 8px", fontWeight: 500 }}>
                      {t}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {lines.map((r) => {
                const d = r.data as OrderLineData;
                const w = r.warnings as RowWarning[];
                const blocking = w.some((x) => x.severity === "blocking");
                const lowConf = d.confidence !== null && d.confidence < 0.8;
                const fid = `l-${r.id}`;
                return (
                  <tr
                    key={r.id}
                    style={{
                      borderTop: "1px solid var(--border-1)",
                      background: blocking
                        ? "var(--cm-brasa-suave)"
                        : w.length || lowConf
                          ? "var(--cm-linho)"
                          : undefined,
                      opacity: r.status === "rejected" ? 0.55 : 1,
                    }}
                  >
                    <td style={{ ...TD, width: 110 }}>
                      <input
                        form={fid}
                        name="code"
                        defaultValue={d.rawCode}
                        disabled={!editable}
                        aria-label="Código"
                        style={field}
                      />
                      <div style={{ color: "var(--fg-2)", fontSize: 12, marginTop: 2 }}>
                        {r.matchType === "code"
                          ? "produto existente"
                          : r.matchType === "new"
                            ? "produto novo"
                            : "sem vínculo"}
                      </div>
                    </td>
                    <td style={{ ...TD, minWidth: 200 }}>
                      <input
                        form={fid}
                        name="description"
                        defaultValue={d.description}
                        disabled={!editable}
                        aria-label="Descrição"
                        style={field}
                      />
                      {w.map((x) => (
                        <div
                          key={x.code}
                          style={{
                            fontSize: 12,
                            marginTop: 2,
                            color: x.severity === "blocking" ? "var(--fg-accent)" : "var(--fg-2)",
                          }}
                        >
                          {x.message}
                        </div>
                      ))}
                    </td>
                    <td style={{ ...TD, width: 80 }}>
                      <input
                        form={fid}
                        name="qty"
                        defaultValue={String(d.qty).replace(".", ",")}
                        disabled={!editable}
                        inputMode="decimal"
                        aria-label="Quantidade"
                        style={field}
                      />
                    </td>
                    <td style={{ ...TD, width: 110 }}>
                      <input
                        form={fid}
                        name="price"
                        defaultValue={(d.unitPriceCents / 100).toFixed(2).replace(".", ",")}
                        disabled={!editable}
                        inputMode="decimal"
                        aria-label="Valor unitário"
                        style={field}
                      />
                    </td>
                    <td className="tabular" style={{ ...TD, whiteSpace: "nowrap" }}>
                      {formatCents(d.lineTotalCents ?? Math.round(d.qty * d.unitPriceCents))}
                    </td>
                    <td style={TD}>
                      <Badge
                        tone={
                          r.status === "pending"
                            ? "brasa"
                            : r.status === "rejected"
                              ? "outline"
                              : "success-soft"
                        }
                      >
                        {ROW_STATUS_LABEL[r.status] ?? r.status}
                      </Badge>
                    </td>
                    <td style={{ ...TD, whiteSpace: "nowrap" }}>
                      {editable && (
                        <form id={fid} action={orderLineAction} style={{ display: "flex", gap: 6 }}>
                          <input type="hidden" name="jobId" value={jobId} />
                          <input type="hidden" name="rowId" value={r.id} />
                          <Button type="submit" size="sm" variant="secondary">
                            Salvar
                          </Button>
                          {r.status === "rejected" ? (
                            <Button
                              type="submit"
                              size="sm"
                              variant="ghost"
                              formAction={orderRowStatusAction}
                              name="op"
                              value="accept"
                            >
                              Aceitar
                            </Button>
                          ) : (
                            <Button
                              type="submit"
                              size="sm"
                              variant="ghost"
                              formAction={orderRowStatusAction}
                              name="op"
                              value="reject"
                            >
                              Rejeitar
                            </Button>
                          )}
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
