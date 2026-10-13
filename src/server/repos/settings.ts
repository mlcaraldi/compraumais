import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { settings } from "../db/schema";
import { DEFAULT_ENGINE_SETTINGS, type EngineSettings } from "../engine/settings";
import { requireTenant } from "./tenant";

export async function getEngineSettings(db: Db, tenantId: string): Promise<EngineSettings> {
  requireTenant(tenantId);
  const [row] = await db
    .select()
    .from(settings)
    .where(and(eq(settings.tenantId, tenantId), eq(settings.key, "engine")));
  return { ...DEFAULT_ENGINE_SETTINGS, ...((row?.value as Partial<EngineSettings>) ?? {}) };
}

export async function setEngineSettings(db: Db, tenantId: string, value: EngineSettings) {
  requireTenant(tenantId);
  await db
    .insert(settings)
    .values({ tenantId, key: "engine", value })
    .onConflictDoUpdate({ target: [settings.tenantId, settings.key], set: { value } });
}
