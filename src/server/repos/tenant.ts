export function requireTenant(tenantId: string): string {
  if (!tenantId) throw new Error("tenantId é obrigatório");
  return tenantId;
}

/** Uso exclusivo de rotinas de sistema que varrem todos os tenants (ex.: job diário de ofertas). */
export async function listTenantIds(db: import("../db/client").Db): Promise<string[]> {
  const { tenants } = await import("../db/schema");
  const rows = await db.select({ id: tenants.id }).from(tenants);
  return rows.map((r) => r.id);
}
