import type { Db } from "../db/client";
import { normalizePhone } from "../normalize";
import { auditRepo, customersRepo } from "../repos";

/** Edita nome de contato, telefone e observações; o telefone é renormalizado. */
export async function updateCustomerContact(
  db: Db,
  tenantId: string,
  customerId: string,
  input: { contactName?: string | null; phone?: string | null; notes?: string | null },
  userId?: string,
) {
  const patch: Parameters<typeof customersRepo.updateCustomerContact>[3] = {};
  if (input.contactName !== undefined) patch.contactName = input.contactName?.trim() || null;
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;
  if (input.phone !== undefined) {
    const raw = input.phone?.trim() || null;
    const p = raw ? normalizePhone(raw) : null;
    patch.phoneRaw = raw;
    patch.phoneE164 = p?.e164 ?? null;
    patch.phoneKind = p?.kind ?? null;
  }
  await customersRepo.updateCustomerContact(db, tenantId, customerId, patch);
  await auditRepo.writeAudit(db, tenantId, {
    userId,
    action: "customer.update",
    entity: "customer",
    entityId: customerId,
    diff: patch,
  });
  return patch;
}
