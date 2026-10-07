import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { documents, importJobs, importRows } from "../db/schema";
import { requireTenant } from "./tenant";

export type ImportJob = typeof importJobs.$inferSelect;
export type ImportRow = typeof importRows.$inferSelect;
export type NewImportRow = Omit<typeof importRows.$inferInsert, "tenantId" | "importJobId" | "id">;

export async function createImportJob(
  db: Db,
  tenantId: string,
  values: Pick<typeof importJobs.$inferInsert, "documentId" | "kind" | "createdBy"> &
    Partial<typeof importJobs.$inferInsert>,
) {
  requireTenant(tenantId);
  const [row] = await db
    .insert(importJobs)
    .values({ ...values, tenantId })
    .returning();
  return row!;
}

export async function getImportJob(db: Db, tenantId: string, jobId: string) {
  requireTenant(tenantId);
  const [row] = await db
    .select()
    .from(importJobs)
    .where(and(eq(importJobs.tenantId, tenantId), eq(importJobs.id, jobId)));
  return row ?? null;
}

export async function listImportJobs(db: Db, tenantId: string) {
  requireTenant(tenantId);
  return db
    .select({
      job: importJobs,
      filename: documents.filename,
      rowCount: sql<number>`(select count(*)::int from import_rows r where r.import_job_id = ${importJobs.id})`,
    })
    .from(importJobs)
    .innerJoin(documents, eq(documents.id, importJobs.documentId))
    .where(eq(importJobs.tenantId, tenantId))
    .orderBy(desc(importJobs.createdAt))
    .limit(200);
}

export async function updateImportJob(
  db: Db,
  tenantId: string,
  jobId: string,
  patch: Partial<typeof importJobs.$inferInsert>,
) {
  requireTenant(tenantId);
  await db
    .update(importJobs)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(importJobs.tenantId, tenantId), eq(importJobs.id, jobId)));
}

export async function replaceImportRows(
  db: Db,
  tenantId: string,
  jobId: string,
  rows: NewImportRow[],
) {
  requireTenant(tenantId);
  await db
    .delete(importRows)
    .where(and(eq(importRows.tenantId, tenantId), eq(importRows.importJobId, jobId)));
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200).map((r) => ({ ...r, tenantId, importJobId: jobId }));
    if (chunk.length) await db.insert(importRows).values(chunk);
  }
}

export async function listImportRows(
  db: Db,
  tenantId: string,
  jobId: string,
  opts: { status?: ImportRow["status"][] } = {},
) {
  requireTenant(tenantId);
  const conds = [eq(importRows.tenantId, tenantId), eq(importRows.importJobId, jobId)];
  if (opts.status?.length) conds.push(inArray(importRows.status, opts.status));
  return db
    .select()
    .from(importRows)
    .where(and(...conds))
    .orderBy(asc(importRows.rowIndex));
}

export async function getImportRow(db: Db, tenantId: string, rowId: string) {
  requireTenant(tenantId);
  const [row] = await db
    .select()
    .from(importRows)
    .where(and(eq(importRows.tenantId, tenantId), eq(importRows.id, rowId)));
  return row ?? null;
}

export async function updateImportRow(
  db: Db,
  tenantId: string,
  rowId: string,
  patch: Partial<
    Pick<ImportRow, "data" | "warnings" | "status" | "matchType" | "matchId" | "matchScore">
  >,
) {
  requireTenant(tenantId);
  await db
    .update(importRows)
    .set(patch)
    .where(and(eq(importRows.tenantId, tenantId), eq(importRows.id, rowId)));
}

export async function countImportRowsByStatus(db: Db, tenantId: string, jobId: string) {
  requireTenant(tenantId);
  const rows = await db
    .select({ status: importRows.status, n: sql<number>`count(*)::int` })
    .from(importRows)
    .where(and(eq(importRows.tenantId, tenantId), eq(importRows.importJobId, jobId)))
    .groupBy(importRows.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Record<string, number>;
}

export async function pageImportRows(
  db: Db,
  tenantId: string,
  jobId: string,
  opts: { offset: number; limit: number; attention?: boolean },
) {
  requireTenant(tenantId);
  const where = and(
    eq(importRows.tenantId, tenantId),
    eq(importRows.importJobId, jobId),
    opts.attention
      ? sql`(${importRows.status} <> 'accepted' or ${importRows.warnings} <> '[]'::jsonb)`
      : undefined,
  );
  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(importRows)
    .where(where);
  const rows = await db
    .select()
    .from(importRows)
    .where(where)
    .orderBy(asc(importRows.rowIndex))
    .offset(opts.offset)
    .limit(opts.limit);
  return { rows, total: n };
}
