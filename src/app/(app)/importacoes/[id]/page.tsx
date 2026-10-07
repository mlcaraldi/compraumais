import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/core/Badge";
import { Button } from "@/components/core/Button";
import { Card } from "@/components/core/Card";
import { Select } from "@/components/core/Select";
import { PageHeader } from "@/components/PageHeader";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import {
  CUSTOMER_FIELDS,
  CUSTOMER_FIELD_LABELS,
  REQUIRED_CUSTOMER_FIELDS,
  type CustomerMapping,
} from "@/server/importers/spreadsheet/customers";
import type { RowWarning } from "@/server/importers/types";
import { documentsRepo, importsRepo, segmentsRepo } from "@/server/repos";
import type { CustomerJobMeta, CustomerRowData } from "@/server/services/import-customers";
import { confirmAction, remapAction, resolveSegmentAction, rowStatusAction } from "../actions";
import { KIND_LABEL, ROW_STATUS_LABEL, STATUS_LABEL } from "../labels";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;

export default async function ImportReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; filtro?: string; erro?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const db = getDb();
  const job = await importsRepo.getImportJob(db, user.tenantId, id);
  if (!job) notFound();
  const doc = await documentsRepo.getDocumentById(db, user.tenantId, job.documentId);
  const meta = (job.rawOutput ?? {}) as Partial<CustomerJobMeta>;
  const counts = await importsRepo.countImportRowsByStatus(db, user.tenantId, id);
  const pending = counts.pending ?? 0;
  const allRows = await importsRepo.listImportRows(db, user.tenantId, id);
  const attention = sp.filtro === "atencao";
  const filtered = attention
    ? allRows.filter((r) => r.status !== "accepted" || (r.warnings as RowWarning[]).length > 0)
    : allRows;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const segments = await segmentsRepo.listSegments(db, user.tenantId);
  const segName = new Map(segments.map((s) => [s.id, s.name]));
  const canConfirm = job.status === "review" && pending === 0 && !meta.needsMapping;
  const q = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ ...(attention ? { filtro: "atencao" } : {}), ...extra });
    return `?${p.toString()}`;
  };

  return (
    <>
      <PageHeader
        title={`Importação de ${KIND_LABEL[job.kind]?.toLowerCase() ?? job.kind}`}
        subtitle={doc?.filename}
        actions={<Badge>{STATUS_LABEL[job.status] ?? job.status}</Badge>}
      />
      {sp.erro && (
        <Card tone="dashed" style={{ marginBottom: 16, color: "var(--fg-accent)" }}>
          {sp.erro}
        </Card>
      )}
      {job.error && job.status === "failed" && (
        <Card tone="dashed" style={{ marginBottom: 16, color: "var(--fg-accent)" }}>
          {job.error}
        </Card>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(220px, 280px) 1fr",
          gap: 16,
          alignItems: "start",
        }}
      >
        <Card>
          <div
            style={{
              fontSize: 12,
              color: "var(--fg-2)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            Documento original
          </div>
          <p style={{ margin: "8px 0", wordBreak: "break-all" }}>{doc?.filename}</p>
          <p className="tabular" style={{ margin: 0, color: "var(--fg-2)", fontSize: 14 }}>
            {doc ? `${(doc.sizeBytes / 1024).toFixed(0)} KB` : ""}
          </p>
          {doc && (
            <p style={{ marginTop: 12 }}>
              <a
                href={`/api/files/${doc.sha256}`}
                style={{ color: "var(--fg-accent)", fontWeight: 600 }}
              >
                Baixar arquivo
              </a>
            </p>
          )}
          <hr style={{ border: 0, borderTop: "1px solid var(--border-1)", margin: "16px 0" }} />
          <dl style={{ margin: 0, fontSize: 14, display: "grid", gap: 4 }}>
            <Stat label="Linhas lidas" value={allRows.length} />
            <Stat label="Aceitas" value={(counts.accepted ?? 0) + (counts.edited ?? 0)} />
            <Stat label="Pendentes" value={pending} />
            <Stat label="Rejeitadas" value={counts.rejected ?? 0} />
            <Stat label="Linhas ignoradas (sem código)" value={meta.skipped ?? 0} />
          </dl>
          {job.status === "review" && (
            <form action={confirmAction} style={{ marginTop: 16 }}>
              <input type="hidden" name="jobId" value={id} />
              <Button type="submit" block disabled={!canConfirm}>
                Confirmar importação
              </Button>
              {!canConfirm && (
                <p style={{ fontSize: 13, color: "var(--fg-2)", marginBottom: 0 }}>
                  {meta.needsMapping
                    ? "Indique as colunas obrigatórias primeiro."
                    : `Resolva ${pending} linha(s) pendente(s) ou rejeite-as.`}
                </p>
              )}
            </form>
          )}
          {job.status === "done" && (
            <p style={{ color: "var(--fg-success)", fontWeight: 600 }}>Importação concluída.</p>
          )}
        </Card>

        <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
          {job.status === "review" && (meta.needsMapping || sp.filtro === "colunas") && (
            <MappingForm jobId={id} headers={meta.headers ?? []} mapping={meta.mapping ?? {}} />
          )}

          {allRows.length > 0 && (
            <Card padding={0} style={{ overflowX: "auto" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: 16,
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", gap: 8 }}>
                  <Link href={`/importacoes/${id}`}>
                    <Badge tone={attention ? "outline" : "inverse"}>Todas ({allRows.length})</Badge>
                  </Link>
                  <Link href={`/importacoes/${id}?filtro=atencao`}>
                    <Badge tone={attention ? "inverse" : "outline"}>Precisam de atenção</Badge>
                  </Link>
                </div>
                <span style={{ color: "var(--fg-2)", fontSize: 14 }}>
                  Página {page} de {pages}
                </span>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--fg-2)" }}>
                    {["Código", "Cliente", "Telefone", "Ramo", "Situação", "Avisos", ""].map(
                      (h) => (
                        <th key={h} style={{ padding: "8px 12px", fontWeight: 500 }}>
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const d = r.data as CustomerRowData;
                    const warnings = r.warnings as RowWarning[];
                    const blocking = warnings.some((w) => w.severity === "blocking");
                    return (
                      <tr
                        key={r.id}
                        style={{
                          borderTop: "1px solid var(--border-1)",
                          background: blocking ? "var(--cm-brasa-suave)" : undefined,
                          opacity: r.status === "rejected" ? 0.55 : 1,
                          verticalAlign: "top",
                        }}
                      >
                        <td
                          className="tabular"
                          style={{ padding: "8px 12px", whiteSpace: "nowrap" }}
                        >
                          {d.externalCode}
                          <div style={{ color: "var(--fg-2)", fontSize: 12 }}>
                            {r.matchType === "code" ? "já existe" : "novo"}
                          </div>
                        </td>
                        <td style={{ padding: "8px 12px", minWidth: 180 }}>
                          <div style={{ fontWeight: 600 }}>{d.tradeName ?? d.legalName}</div>
                          <div style={{ color: "var(--fg-2)" }}>
                            {d.tradeName ? d.legalName : ""}
                          </div>
                          <div className="tabular" style={{ color: "var(--fg-2)" }}>
                            {d.city}
                            {d.blocked ? " · bloqueado" : ""}
                          </div>
                        </td>
                        <td
                          className="tabular"
                          style={{ padding: "8px 12px", whiteSpace: "nowrap" }}
                        >
                          {d.phoneE164 ?? d.phoneRaw ?? ""}
                        </td>
                        <td style={{ padding: "8px 12px", minWidth: 160 }}>
                          <div>{d.segmentId ? segName.get(d.segmentId) : "sem segmento"}</div>
                          <div style={{ color: "var(--fg-2)", fontSize: 12 }}>{d.segmentRaw}</div>
                        </td>
                        <td style={{ padding: "8px 12px" }}>
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
                        <td style={{ padding: "8px 12px", minWidth: 200 }}>
                          {warnings.map((w) => (
                            <div
                              key={w.code}
                              style={{
                                color:
                                  w.severity === "blocking" ? "var(--fg-accent)" : "var(--fg-2)",
                              }}
                            >
                              {w.message}
                            </div>
                          ))}
                        </td>
                        <td style={{ padding: "8px 12px", minWidth: 220 }}>
                          {job.status === "review" && (
                            <RowActions
                              jobId={id}
                              rowId={r.id}
                              status={r.status}
                              needsSegment={warnings.some((w) => w.code === "ramo_desconhecido")}
                              segments={segments.map((s) => ({ value: s.id, label: s.name }))}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ display: "flex", justifyContent: "space-between", padding: 16 }}>
                {page > 1 ? <Link href={q({ page: String(page - 1) })}>← Anterior</Link> : <span />}
                {page < pages ? (
                  <Link href={q({ page: String(page + 1) })}>Próxima →</Link>
                ) : (
                  <span />
                )}
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
      <dt style={{ color: "var(--fg-2)" }}>{label}</dt>
      <dd className="tabular" style={{ margin: 0, fontWeight: 600 }}>
        {value}
      </dd>
    </div>
  );
}

function RowActions({
  jobId,
  rowId,
  status,
  needsSegment,
  segments,
}: {
  jobId: string;
  rowId: string;
  status: string;
  needsSegment: boolean;
  segments: { value: string; label: string }[];
}) {
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {needsSegment && (
        <form action={resolveSegmentAction} style={{ display: "flex", gap: 6 }}>
          <input type="hidden" name="jobId" value={jobId} />
          <input type="hidden" name="rowId" value={rowId} />
          <Select name="segmentId" options={segments} placeholder="Segmento" />
          <Button type="submit" size="sm" variant="secondary">
            Aplicar
          </Button>
        </form>
      )}
      <form action={rowStatusAction} style={{ display: "flex", gap: 6 }}>
        <input type="hidden" name="jobId" value={jobId} />
        <input type="hidden" name="rowId" value={rowId} />
        {status === "rejected" ? (
          <Button type="submit" name="op" value="accept" size="sm" variant="secondary">
            Aceitar
          </Button>
        ) : (
          <Button type="submit" name="op" value="reject" size="sm" variant="ghost">
            Rejeitar
          </Button>
        )}
      </form>
    </div>
  );
}

function MappingForm({
  jobId,
  headers,
  mapping,
}: {
  jobId: string;
  headers: string[];
  mapping: CustomerMapping;
}) {
  return (
    <Card>
      <h2 style={{ fontSize: "var(--text-h3)", margin: "0 0 4px" }}>Colunas da planilha</h2>
      <p style={{ color: "var(--fg-2)", marginTop: 0 }}>
        Indique qual coluna corresponde a cada campo. Código e razão social são obrigatórios.
      </p>
      <form
        action={remapAction}
        style={{
          display: "grid",
          gap: 8,
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
        }}
      >
        <input type="hidden" name="jobId" value={jobId} />
        {CUSTOMER_FIELDS.map((f) => (
          <label key={f} style={{ display: "grid", gap: 4, fontSize: 14 }}>
            <span style={{ fontWeight: 600 }}>
              {CUSTOMER_FIELD_LABELS[f]}
              {REQUIRED_CUSTOMER_FIELDS.includes(f) ? " *" : ""}
            </span>
            <select
              name={`map_${f}`}
              defaultValue={mapping[f] === undefined ? "" : String(mapping[f])}
              style={{
                height: 40,
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-strong)",
                background: "var(--surface-card)",
                padding: "0 8px",
                fontFamily: "inherit",
              }}
            >
              <option value="">(não importar)</option>
              {headers.map((h, i) => (
                <option key={i} value={i}>
                  {h || `Coluna ${i + 1}`}
                </option>
              ))}
            </select>
          </label>
        ))}
        <div style={{ gridColumn: "1 / -1" }}>
          <Button type="submit">Aplicar colunas</Button>
        </div>
      </form>
    </Card>
  );
}
