import { eq } from "drizzle-orm";
import { closeDb, getDb, type Db } from "./client";
import { settings, tenants } from "./schema";
import { DEFAULT_ENGINE_SETTINGS } from "../engine/settings";

export const DEFAULT_TENANT_NAME = "Carteira Ricardo";

/** Cria o tenant único do MVP e os parâmetros padrão do motor. Idempotente. */
export async function seedTenant(db: Db): Promise<string> {
  const existing = await db.select().from(tenants).where(eq(tenants.name, DEFAULT_TENANT_NAME));
  let tenantId = existing[0]?.id;
  if (!tenantId) {
    const [row] = await db.insert(tenants).values({ name: DEFAULT_TENANT_NAME }).returning();
    tenantId = row!.id;
  }
  await db
    .insert(settings)
    .values({ tenantId, key: "engine", value: DEFAULT_ENGINE_SETTINGS })
    .onConflictDoNothing();
  return tenantId;
}

export async function getDefaultTenantId(db: Db): Promise<string> {
  const rows = await db.select().from(tenants).where(eq(tenants.name, DEFAULT_TENANT_NAME));
  if (!rows[0]) throw new Error("Tenant não encontrado. Rode `pnpm db:seed`.");
  return rows[0].id;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const db = getDb();
  seedTenant(db)
    .then((id) => console.log(`Tenant "${DEFAULT_TENANT_NAME}": ${id}`))
    .finally(closeDb);
}
