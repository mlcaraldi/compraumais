import { Badge } from "@/components/core/Badge";
import { Button } from "@/components/core/Button";
import { Card } from "@/components/core/Card";
import { DocumentPreview } from "@/components/DocumentPreview";
import { formatCents } from "@/server/normalize";
import type {
  PromotionHeaderData,
  PromotionItemData,
} from "@/server/importers/promotion/postprocess";
import type { RowWarning } from "@/server/importers/types";
import type { ImportRow } from "@/server/repos/imports";
import {
  confirmAction,
  promotionHeaderAction,
  promotionItemAction,
  promotionLinkAction,
  promotionRowStatusAction,
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
const UNITS = [
  { v: "un", l: "por unidade" },
  { v: "pct", l: "por pacote" },
  { v: "kg", l: "por kg" },
  { v: "cx", l: "por caixa" },
];

type Doc = { sha256: string; mime: string; filename: string };

export function PromotionReview({
  jobId,
  status,
  doc,
  rows,
  model,
  costCents,
  candidates,
}: {
  jobId: string;
  status: string;
  doc: Doc | null;
  rows: ImportRow[];
  model: string | null;
  costCents: string | null;
  candidates: Record<string, { id: string; label: string }[]>;
}) {
  const header = rows.find((r) => r.rowType === "promotion_header");
  const items = rows.filter((r) => r.rowType === "promotion_item");
  const h = header?.data as PromotionHeaderData | undefined;
  const hw = (header?.warnings ?? []) as RowWarning[];
  const pending = rows.filter((r) => r.status === "pending").length;
  const kept = items.filter((r) => r.status !== "rejected").length;
  const editable = status === "review";
  const canConfirm = editable && pending === 0 && kept > 0;

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
            Encarte original
          </div>
          {doc && <DocumentPreview sha={doc.sha256} mime={doc.mime} filename={doc.filename} />}
          <p className="tabular" style={{ color: "var(--fg-2)", fontSize: 13, marginBottom: 0 }}>
            {model ? `Lido por ${model}` : ""}
            {costCents ? ` · custo estimado US$ ${(Number(costCents) / 100).toFixed(3)}` : ""}
          </p>
        </Card>
        {editable && (
          <Card>
            <p className="tabular" style={{ margin: "0 0 12px", fontSize: 14 }}>
              {kept} item(ns) aceito(s)
            </p>
            <form action={confirmAction}>
              <input type="hidden" name="jobId" value={jobId} />
              <Button type="submit" block disabled={!canConfirm}>
                Confirmar encarte
              </Button>
            </form>
            {!canConfirm && (
              <p style={{ fontSize: 13, color: "var(--fg-2)", marginBottom: 0 }}>
                Resolva {pending} pendência(s) em vermelho ou rejeite os itens.
              </p>
            )}
          </Card>
        )}
      </div>

      <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
        {h && (
          <Card>
            <h2 style={{ fontSize: "var(--text-h3)", margin: "0 0 12px" }}>Vigência da oferta</h2>
            <form
              action={promotionHeaderAction}
              style={{ display: "grid", gap: 12, gridTemplateColumns: "2fr 1fr 1fr auto" }}
            >
              <input type="hidden" name="jobId" value={jobId} />
              <label style={{ display: "grid", gap: 4, fontSize: 14, fontWeight: 600 }}>
                Nome
                <input name="name" defaultValue={h.name} disabled={!editable} style={field} />
              </label>
              <label style={{ display: "grid", gap: 4, fontSize: 14, fontWeight: 600 }}>
                Início
                <input
                  type="date"
                  name="startsOn"
                  defaultValue={h.startsOn ?? ""}
                  disabled={!editable}
                  style={field}
                />
              </label>
              <label style={{ display: "grid", gap: 4, fontSize: 14, fontWeight: 600 }}>
                Fim
                <input
                  type="date"
                  name="endsOn"
                  defaultValue={h.endsOn ?? ""}
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
            {h.evidence && (
              <p style={{ fontSize: 13, color: "var(--fg-2)", margin: "8px 0 0" }}>
                Trecho do encarte: &ldquo;{h.evidence}&rdquo;
              </p>
            )}
            {h.supplierBrand && (
              <p style={{ fontSize: 13, color: "var(--fg-2)", margin: "4px 0 0" }}>
                Marca: {h.supplierBrand}
                {h.targetSegmentsHint.length ? ` · para ${h.targetSegmentsHint.join(", ")}` : ""}
              </p>
            )}
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
                {["Código", "Produto", "Preço (R$)", "Unidade", "Condição", "Situação", ""].map(
                  (t) => (
                    <th key={t} style={{ padding: "10px 8px", fontWeight: 500 }}>
                      {t}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((r) => {
                const d = r.data as PromotionItemData;
                const w = r.warnings as RowWarning[];
                const blocking = w.some((x) => x.severity === "blocking");
                const fid = `p-${r.id}`;
                const cands = candidates[r.id] ?? [];
                return (
                  <tr
                    key={r.id}
                    style={{
                      borderTop: "1px solid var(--border-1)",
                      background: blocking
                        ? "var(--cm-brasa-suave)"
                        : w.length
                          ? "var(--cm-linho)"
                          : undefined,
                      opacity: r.status === "rejected" ? 0.55 : 1,
                    }}
                  >
                    <td style={{ ...TD, width: 110 }}>
                      <input
                        form={fid}
                        name="code"
                        defaultValue={d.rawCode ?? ""}
                        disabled={!editable}
                        aria-label="Código"
                        style={field}
                      />
                      <div style={{ color: "var(--fg-2)", fontSize: 12, marginTop: 2 }}>
                        {r.matchType === "code"
                          ? "produto existente"
                          : r.matchType === "description"
                            ? "vinculado à mão"
                            : r.matchType === "new"
                              ? "produto novo"
                              : "sem vínculo"}
                      </div>
                    </td>
                    <td style={{ ...TD, minWidth: 220 }}>
                      <input
                        form={fid}
                        name="description"
                        defaultValue={d.description}
                        disabled={!editable}
                        aria-label="Descrição"
                        style={field}
                      />
                      <input
                        form={fid}
                        name="packText"
                        defaultValue={d.packText ?? ""}
                        disabled={!editable}
                        aria-label="Embalagem"
                        placeholder="embalagem"
                        style={{ ...field, marginTop: 4 }}
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
                      {editable && r.matchType === "none" && r.status !== "rejected" && (
                        <form
                          action={promotionLinkAction}
                          style={{ display: "flex", gap: 6, marginTop: 6 }}
                        >
                          <input type="hidden" name="jobId" value={jobId} />
                          <input type="hidden" name="rowId" value={r.id} />
                          <select name="productId" style={field} aria-label="Vincular a produto">
                            <option value="">
                              {cands.length ? "Vincular a produto existente" : "Sem candidatos"}
                            </option>
                            {cands.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                          <Button type="submit" size="sm" variant="secondary">
                            Vincular
                          </Button>
                        </form>
                      )}
                    </td>
                    <td style={{ ...TD, width: 110 }}>
                      <input
                        form={fid}
                        name="price"
                        defaultValue={(d.priceCents / 100).toFixed(2).replace(".", ",")}
                        disabled={!editable}
                        inputMode="decimal"
                        aria-label="Preço"
                        style={field}
                      />
                      {d.boxPriceCents !== null && (
                        <div className="tabular" style={{ color: "var(--fg-2)", fontSize: 12 }}>
                          caixa {formatCents(d.boxPriceCents)}
                        </div>
                      )}
                      {d.regularPriceCents !== null && (
                        <div className="tabular" style={{ color: "var(--fg-2)", fontSize: 12 }}>
                          normal {formatCents(d.regularPriceCents)}
                        </div>
                      )}
                    </td>
                    <td style={{ ...TD, width: 130 }}>
                      <select
                        form={fid}
                        name="priceUnit"
                        defaultValue={d.priceUnit ?? ""}
                        disabled={!editable}
                        aria-label="Unidade do preço"
                        style={field}
                      >
                        <option value="">escolha</option>
                        {UNITS.map((u) => (
                          <option key={u.v} value={u.v}>
                            {u.l}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{ ...TD, minWidth: 140, fontSize: 12, color: "var(--fg-2)" }}>
                      {d.priceType === "bundle" && <Badge tone="neutral">combo</Badge>}
                      {d.priceType === "min_qty" && (
                        <Badge tone="neutral">a partir de {d.minQty}</Badge>
                      )}
                      <div>{d.conditionText}</div>
                      {d.productExpiryDate && (
                        <div>
                          validade do produto {d.productExpiryDate.split("-").reverse().join("/")}
                        </div>
                      )}
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
                        <form
                          id={fid}
                          action={promotionItemAction}
                          style={{ display: "flex", gap: 6 }}
                        >
                          <input type="hidden" name="jobId" value={jobId} />
                          <input type="hidden" name="rowId" value={r.id} />
                          <Button type="submit" size="sm" variant="secondary">
                            Salvar
                          </Button>
                          <Button
                            type="submit"
                            size="sm"
                            variant="ghost"
                            formAction={promotionRowStatusAction}
                            name="op"
                            value={r.status === "rejected" ? "accept" : "reject"}
                          >
                            {r.status === "rejected" ? "Aceitar" : "Rejeitar"}
                          </Button>
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
