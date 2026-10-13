import type { Db } from "../db/client";
import type { RowWarning } from "../importers/types";
import { block } from "../importers/types";
import {
  PRODUCT_FIELDS,
  REQUIRED_PRODUCT_FIELDS,
  detectProductMapping,
  parseProductRows,
  type ParsedProduct,
  type ProductMapping,
} from "../importers/spreadsheet/products";
import { readTable } from "../importers/spreadsheet/table";
import { auditRepo, documentsRepo, importsRepo, productsRepo } from "../repos";
import { readDocument, saveDocument } from "../storage/documents";

export type ProductRowData = ParsedProduct;
export type ProductJobMeta = {
  headers: string[];
  mapping: ProductMapping;
  needsMapping: boolean;
  skipped: number;
  rowCount?: number;
};

export async function buildProductRows(
  db: Db,
  tenantId: string,
  jobId: string,
  buffer: Buffer,
  filename: string,
  mappingOverride?: ProductMapping,
) {
  const table = readTable(buffer, filename);
  const headers = (table[0] ?? []).map((c) => (c === null ? "" : String(c)));
  const mapping = mappingOverride ?? detectProductMapping(table[0] ?? []);
  const missing = REQUIRED_PRODUCT_FIELDS.filter((f) => mapping[f] === undefined);
  const meta: ProductJobMeta = { headers, mapping, needsMapping: missing.length > 0, skipped: 0 };
  if (missing.length > 0) {
    await importsRepo.replaceImportRows(db, tenantId, jobId, []);
    await importsRepo.updateImportJob(db, tenantId, jobId, {
      status: "review",
      rawOutput: meta,
      error: null,
    });
    return meta;
  }

  const parsed = parseProductRows(table, mapping);
  meta.skipped = parsed.skipped;
  meta.rowCount = parsed.rows.length;
  const existing = new Map(
    (await productsRepo.listProductCodes(db, tenantId)).map((p) => [p.code, p.id]),
  );
  const seen = new Set<string>();
  const rows: importsRepo.NewImportRow[] = parsed.rows.map((p, index) => {
    const warnings: RowWarning[] = [...p.warnings];
    let status: "accepted" | "pending" | "rejected" = warnings.some(
      (w) => w.severity === "blocking",
    )
      ? "pending"
      : "accepted";
    if (p.data.code && seen.has(p.data.code)) {
      warnings.push(
        block("codigo_duplicado", "Código repetido na planilha; esta linha foi rejeitada"),
      );
      status = "rejected";
    }
    if (p.data.code) seen.add(p.data.code);
    const matchId = existing.get(p.data.code) ?? null;
    return {
      rowIndex: index,
      rowType: "product",
      data: p.data,
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

export async function createProductImport(
  db: Db,
  tenantId: string,
  input: { buffer: Buffer; filename: string; userId?: string },
) {
  const { document } = await saveDocument(db, tenantId, { ...input, kind: "products" });
  const job = await importsRepo.createImportJob(db, tenantId, {
    documentId: document.id,
    kind: "products",
    status: "extracting",
    createdBy: input.userId ?? null,
  });
  try {
    await buildProductRows(db, tenantId, job.id, input.buffer, input.filename);
  } catch (e) {
    await importsRepo.updateImportJob(db, tenantId, job.id, {
      status: "failed",
      error: e instanceof Error ? e.message : String(e),
    });
  }
  return job.id;
}

export async function remapProductImport(
  db: Db,
  tenantId: string,
  jobId: string,
  mapping: ProductMapping,
) {
  const job = await importsRepo.getImportJob(db, tenantId, jobId);
  if (!job || job.kind !== "products" || job.status === "done")
    throw new Error("Importação indisponível");
  const doc = await documentsRepo.getDocumentById(db, tenantId, job.documentId);
  const file = doc && (await readDocument(db, tenantId, doc.sha256));
  if (!doc || !file) throw new Error("Arquivo original não encontrado");
  const clean: ProductMapping = {};
  for (const f of PRODUCT_FIELDS) if (typeof mapping[f] === "number") clean[f] = mapping[f];
  return buildProductRows(db, tenantId, jobId, file.data, doc.filename, clean);
}

export async function confirmProductImport(
  db: Db,
  tenantId: string,
  jobId: string,
  userId?: string,
) {
  const job = await importsRepo.getImportJob(db, tenantId, jobId);
  if (!job || job.kind !== "products") throw new Error("Importação não encontrada");
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
      await productsRepo.upsertProducts(
        t,
        tenantId,
        rows.map((r) => {
          const d = r.data as ProductRowData;
          return { ...d, source: "catalog" as const };
        }),
      );
      await auditRepo.writeAudit(t, tenantId, {
        userId,
        action: "import.confirm",
        entity: "import_job",
        entityId: jobId,
        diff: { kind: "products", rows: rows.length },
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
