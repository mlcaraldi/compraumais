import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { customers } from "../db/schema";
import { requireTenant } from "./tenant";

export type Customer = typeof customers.$inferSelect;
export type CustomerUpsert = Omit<
  typeof customers.$inferInsert,
  "tenantId" | "id" | "createdAt" | "updatedAt"
>;

export async function listCustomerCodes(db: Db, tenantId: string) {
  requireTenant(tenantId);
  return db
    .select({ id: customers.id, externalCode: customers.externalCode })
    .from(customers)
    .where(eq(customers.tenantId, tenantId));
}

export async function countCustomers(db: Db, tenantId: string) {
  requireTenant(tenantId);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(customers)
    .where(eq(customers.tenantId, tenantId));
  return row?.n ?? 0;
}

export async function getCustomerById(db: Db, tenantId: string, id: string) {
  requireTenant(tenantId);
  const [row] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.tenantId, tenantId), eq(customers.id, id)));
  return row ?? null;
}

/** Insere ou atualiza por (tenant, código externo). Não mexe em contact_name nem notes. */
export async function upsertCustomers(db: Db, tenantId: string, rows: CustomerUpsert[]) {
  requireTenant(tenantId);
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100).map((r) => ({ ...r, tenantId }));
    if (!chunk.length) continue;
    await db
      .insert(customers)
      .values(chunk)
      .onConflictDoUpdate({
        target: [customers.tenantId, customers.externalCode],
        set: {
          document: sql`excluded.document`,
          documentValid: sql`excluded.document_valid`,
          legalName: sql`excluded.legal_name`,
          tradeName: sql`excluded.trade_name`,
          registeredAt: sql`excluded.registered_at`,
          lastPurchaseAt: sql`excluded.last_purchase_at`,
          blocked: sql`excluded.blocked`,
          address: sql`excluded.address`,
          addressNumber: sql`excluded.address_number`,
          district: sql`excluded.district`,
          city: sql`excluded.city`,
          state: sql`excluded.state`,
          phoneRaw: sql`excluded.phone_raw`,
          phoneE164: sql`excluded.phone_e164`,
          phoneKind: sql`excluded.phone_kind`,
          segmentRaw: sql`excluded.segment_raw`,
          segmentId: sql`excluded.segment_id`,
          cnae: sql`excluded.cnae`,
          updatedAt: sql`now()`,
        },
      });
  }
}

export type CustomerFilters = {
  q?: string;
  segmentId?: string;
  city?: string;
  blocked?: boolean;
  phoneKind?: string;
  offset?: number;
  limit?: number;
};

export async function listCustomers(db: Db, tenantId: string, f: CustomerFilters = {}) {
  requireTenant(tenantId);
  const q = f.q?.trim();
  const where = and(
    eq(customers.tenantId, tenantId),
    f.segmentId ? eq(customers.segmentId, f.segmentId) : undefined,
    f.city ? eq(customers.city, f.city) : undefined,
    f.blocked === undefined ? undefined : eq(customers.blocked, f.blocked),
    f.phoneKind ? eq(customers.phoneKind, f.phoneKind) : undefined,
    q
      ? or(
          ilike(customers.legalName, `%${q}%`),
          ilike(customers.tradeName, `%${q}%`),
          ilike(customers.externalCode, `%${q}%`),
          ilike(customers.city, `%${q}%`),
        )
      : undefined,
  );
  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(customers)
    .where(where);
  const rows = await db
    .select()
    .from(customers)
    .where(where)
    .orderBy(asc(customers.tradeName), asc(customers.legalName))
    .offset(f.offset ?? 0)
    .limit(f.limit ?? 50);
  return { rows, total: n };
}

export async function listCities(db: Db, tenantId: string) {
  requireTenant(tenantId);
  const rows = await db
    .selectDistinct({ city: customers.city })
    .from(customers)
    .where(eq(customers.tenantId, tenantId))
    .orderBy(asc(customers.city));
  return rows.map((r) => r.city).filter((c): c is string => !!c);
}

export async function updateCustomerContact(
  db: Db,
  tenantId: string,
  id: string,
  patch: Partial<Pick<Customer, "contactName" | "phoneRaw" | "phoneE164" | "phoneKind" | "notes">>,
) {
  requireTenant(tenantId);
  await db
    .update(customers)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(customers.tenantId, tenantId), eq(customers.id, id)));
}
