import type { Db } from "../db/client";
import { block, type RowWarning } from "../importers/types";
import {
  CUSTOMER_FIELDS,
  REQUIRED_CUSTOMER_FIELDS,
  detectCustomerMapping,
  parseCustomerRows,
  type CustomerMapping,
  type ParsedCustomer,
} from "../importers/spreadsheet/customers";
import { readTable } from "../importers/spreadsheet/table";
import { normalizeText } from "../normalize";
import { auditRepo, customersRepo, documentsRepo, importsRepo, segmentsRepo } from "../repos";
import { readDocument, saveDocument } from "../storage/documents";

export type CustomerRowData = ParsedCustomer & { segmentId: string | null };
export type CustomerJobMeta = {
  headers: string[];
  mapping: CustomerMapping;
  needsMapping: boolean;
  skipped: number;
  rowCount?: number;
};

const headerLabels = (row: (string | number | boolean | null)[] | undefined) =>
  (row ?? []).map((c) => (c === null ? "" : String(c)));

/** Interpreta a planilha e (re)cria as linhas de revisão do job. Idempotente. */
export async function buildCustomerRows(
  db: Db,
  tenantId: string,
  jobId: string,
  buffer: Buffer,
  filename: string,
  mappingOverride?: CustomerMapping,
) {
  const table = readTable(buffer, filename);
  const headers = headerLabels(table[0]);
  const mapping = mappingOverride ?? detectCustomerMapping(table[0] ?? []);
  const missing = REQUIRED_CUSTOMER_FIELDS.filter((f) => mapping[f] === undefined);
  const meta: CustomerJobMeta = { headers, mapping, needsMapping: missing.length > 0, skipped: 0 };

  if (missing.length > 0) {
    await importsRepo.replaceImportRows(db, tenantId, jobId, []);
    await importsRepo.updateImportJob(db, tenantId, jobId, {
      status: "review",
      rawOutput: meta,
      error: null,
    });
    return meta;
  }

  const parsed = parseCustomerRows(table, mapping);
  meta.skipped = parsed.skipped;
  meta.rowCount = parsed.rows.length;

  const aliases = await segmentsRepo.listSegmentAliases(db, tenantId);
  const segments = await segmentsRepo.listSegments(db, tenantId);
  const aliasMap = new Map(aliases.map((a) => [a.rawValue, a.segmentId]));
  const semRamoId = segments.find((s) => s.code === "sem_ramo")?.id ?? null;
  const existing = new Map(
    (await customersRepo.listCustomerCodes(db, tenantId)).map((c) => [c.externalCode, c.id]),
  );

  const seen = new Set<string>();
  const rows: importsRepo.NewImportRow[] = parsed.rows.map((p, index) => {
    const warnings: RowWarning[] = [...p.warnings];
    let status: "accepted" | "pending" | "rejected" = "accepted";
    let segmentId: string | null = null;

    if (!p.data.segmentRaw) segmentId = semRamoId;
    else {
      segmentId = aliasMap.get(normalizeText(p.data.segmentRaw)) ?? null;
      if (!segmentId) {
        warnings.push(
          block("ramo_desconhecido", `Ramo "${p.data.segmentRaw}" sem segmento: escolha um`),
        );
        status = "pending";
      }
    }
    if (seen.has(p.data.externalCode)) {
      warnings.push(
        block("codigo_duplicado", "Código repetido na planilha; esta linha foi rejeitada"),
      );
      status = "rejected";
    }
    seen.add(p.data.externalCode);

    const matchId = existing.get(p.data.externalCode) ?? null;
    return {
      rowIndex: index,
      rowType: "customer",
      data: { ...p.data, segmentId } satisfies CustomerRowData,
      warnings,
      matchType: matchId ? "code" : "new",
      matchId,
      status,
    };
  });

  await importsRepo.replaceImportRows(db, tenantId, jobId, rows);
  await importsRepo.updateImportJob(db, tenantId, jobId, {
    status: "review",
    rawOutput: meta,
    error: null,
  });
  return meta;
}

export async function createCustomerImport(
  db: Db,
  tenantId: string,
  input: { buffer: Buffer; filename: string; userId?: string },
) {
  const { document } = await saveDocument(db, tenantId, { ...input, kind: "customers" });
  const job = await importsRepo.createImportJob(db, tenantId, {
    documentId: document.id,
    kind: "customers",
    status: "extracting",
    createdBy: input.userId ?? null,
  });
  try {
    await buildCustomerRows(db, tenantId, job.id, input.buffer, input.filename);
  } catch (e) {
    await importsRepo.updateImportJob(db, tenantId, job.id, {
      status: "failed",
      error: e instanceof Error ? e.message : String(e),
    });
  }
  return job.id;
}

/** Reaplica um mapeamento de colunas escolhido pelo usuário. */
export async function remapCustomerImport(
  db: Db,
  tenantId: string,
  jobId: string,
  mapping: CustomerMapping,
) {
  const job = await importsRepo.getImportJob(db, tenantId, jobId);
  if (!job || job.kind !== "customers" || job.status === "done")
    throw new Error("Importação indisponível");
  const doc = await documentsRepo.getDocumentById(db, tenantId, job.documentId);
  const file = doc && (await readDocument(db, tenantId, doc.sha256));
  if (!doc || !file) throw new Error("Arquivo original não encontrado");
  const clean: CustomerMapping = {};
  for (const f of CUSTOMER_FIELDS) if (typeof mapping[f] === "number") clean[f] = mapping[f];
  return buildCustomerRows(db, tenantId, jobId, file.data, doc.filename, clean);
}

export async function setRowStatus(
  db: Db,
  tenantId: string,
  rowId: string,
  status: "accepted" | "rejected",
) {
  const row = await importsRepo.getImportRow(db, tenantId, rowId);
  if (!row) throw new Error("Linha não encontrada");
  const blocking = (row.warnings as RowWarning[]).some((w) => w.severity === "blocking");
  if (status === "accepted" && blocking)
    throw new Error("Resolva a pendência antes de aceitar a linha");
  await importsRepo.updateImportRow(db, tenantId, rowId, { status });
}

export async function resolveRowSegment(
  db: Db,
  tenantId: string,
  rowId: string,
  segmentId: string,
) {
  const row = await importsRepo.getImportRow(db, tenantId, rowId);
  if (!row) throw new Error("Linha não encontrada");
  const segments = await segmentsRepo.listSegments(db, tenantId);
  if (!segments.some((s) => s.id === segmentId)) throw new Error("Segmento inválido");
  const data = { ...(row.data as CustomerRowData), segmentId };
  const warnings = (row.warnings as RowWarning[]).filter((w) => w.code !== "ramo_desconhecido");
  const stillBlocked = warnings.some((w) => w.severity === "blocking");
  await importsRepo.updateImportRow(db, tenantId, rowId, {
    data,
    warnings,
    status: stillBlocked ? "pending" : "edited",
  });
}

export async function confirmCustomerImport(
  db: Db,
  tenantId: string,
  jobId: string,
  userId?: string,
) {
  const job = await importsRepo.getImportJob(db, tenantId, jobId);
  if (!job || job.kind !== "customers") throw new Error("Importação não encontrada");
  if (job.status !== "review") throw new Error("A importação não está em revisão");
  const counts = await importsRepo.countImportRowsByStatus(db, tenantId, jobId);
  if ((counts.pending ?? 0) > 0) throw new Error("Há linhas pendentes de revisão");

  await importsRepo.updateImportJob(db, tenantId, jobId, { status: "committing" });
  try {
    const rows = await importsRepo.listImportRows(db, tenantId, jobId, {
      status: ["accepted", "edited"],
    });
    await db.transaction(async (tx) => {
      const t = tx as unknown as Db;
      await customersRepo.upsertCustomers(
        t,
        tenantId,
        rows.map((r) => {
          const d = r.data as CustomerRowData;
          return {
            externalCode: d.externalCode,
            document: d.document,
            documentValid: d.documentValid,
            legalName: d.legalName,
            tradeName: d.tradeName,
            registeredAt: d.registeredAt,
            lastPurchaseAt: d.lastPurchaseAt,
            blocked: d.blocked,
            address: d.address,
            addressNumber: d.addressNumber,
            district: d.district,
            city: d.city,
            state: d.state,
            phoneRaw: d.phoneRaw,
            phoneE164: d.phoneE164,
            phoneKind: d.phoneKind,
            segmentRaw: d.segmentRaw,
            segmentId: d.segmentId,
            cnae: d.cnae,
          };
        }),
      );
      await auditRepo.writeAudit(t, tenantId, {
        userId,
        action: "import.confirm",
        entity: "import_job",
        entityId: jobId,
        diff: { kind: "customers", rows: rows.length },
      });
    });
    await importsRepo.updateImportJob(db, tenantId, jobId, {
      status: "done",
      confirmedBy: userId ?? null,
      confirmedAt: new Date(),
    });
    return { imported: rows.length };
  } catch (e) {
    await importsRepo.updateImportJob(db, tenantId, jobId, {
      status: "review",
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}
