import type { Db } from "../db/client";
import { auditLog } from "../db/schema";
import { requireTenant } from "./tenant";

export async function writeAudit(
  db: Db,
  tenantId: string,
  entry: {
    userId?: string | null;
    action: string;
    entity: string;
    entityId?: string;
    diff?: unknown;
  },
) {
  requireTenant(tenantId);
  await db.insert(auditLog).values({
    tenantId,
    userId: entry.userId ?? null,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    diff: entry.diff ?? null,
  });
}
