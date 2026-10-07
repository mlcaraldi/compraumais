export function requireTenant(tenantId: string): string {
  if (!tenantId) throw new Error("tenantId é obrigatório");
  return tenantId;
}
