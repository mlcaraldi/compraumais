import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { documents, fileBlobs } from "../db/schema";
import { requireTenant } from "./tenant";

export async function findDocumentBySha(db: Db, tenantId: string, sha: string) {
  requireTenant(tenantId);
  const [row] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.tenantId, tenantId), eq(documents.sha256, sha)));
  return row ?? null;
}

export async function getDocumentById(db: Db, tenantId: string, id: string) {
  requireTenant(tenantId);
  const [row] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.tenantId, tenantId), eq(documents.id, id)));
  return row ?? null;
}

export async function insertDocument(
  db: Db,
  tenantId: string,
  values: Omit<typeof documents.$inferInsert, "tenantId" | "id" | "uploadedAt">,
) {
  requireTenant(tenantId);
  const [row] = await db
    .insert(documents)
    .values({ ...values, tenantId })
    .returning();
  return row!;
}

export async function putBlobRow(db: Db, tenantId: string, key: string, data: Buffer) {
  requireTenant(tenantId);
  await db
    .insert(fileBlobs)
    .values({ tenantId, key, data })
    .onConflictDoUpdate({ target: [fileBlobs.tenantId, fileBlobs.key], set: { data } });
}

export async function getBlobRow(db: Db, tenantId: string, key: string) {
  requireTenant(tenantId);
  const [row] = await db
    .select({ data: fileBlobs.data })
    .from(fileBlobs)
    .where(and(eq(fileBlobs.tenantId, tenantId), eq(fileBlobs.key, key)));
  return row?.data ?? null;
}
