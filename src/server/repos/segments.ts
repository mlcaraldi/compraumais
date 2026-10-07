import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { segmentAliases, segments } from "../db/schema";
import { requireTenant } from "./tenant";

export async function listSegments(db: Db, tenantId: string) {
  requireTenant(tenantId);
  return db.select().from(segments).where(eq(segments.tenantId, tenantId)).orderBy(segments.name);
}

export async function listSegmentAliases(db: Db, tenantId: string) {
  requireTenant(tenantId);
  return db.select().from(segmentAliases).where(eq(segmentAliases.tenantId, tenantId));
}
