import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { users } from "../db/schema";
import { hashPassword } from "../auth/password";
import { requireTenant } from "./tenant";

export async function createUser(
  db: Db,
  tenantId: string,
  input: { email: string; name: string; role: "admin" | "operator"; password: string },
) {
  requireTenant(tenantId);
  const [row] = await db
    .insert(users)
    .values({
      tenantId,
      email: input.email.trim().toLowerCase(),
      name: input.name,
      role: input.role,
      passwordHash: await hashPassword(input.password),
    })
    .returning();
  return row!;
}

export async function resetUserPassword(db: Db, tenantId: string, email: string, password: string) {
  requireTenant(tenantId);
  const rows = await db
    .update(users)
    .set({ passwordHash: await hashPassword(password) })
    .where(and(eq(users.tenantId, tenantId), eq(users.email, email.trim().toLowerCase())))
    .returning({ id: users.id });
  return rows.length > 0;
}

export async function getUserById(db: Db, tenantId: string, userId: string) {
  requireTenant(tenantId);
  const [row] = await db
    .select()
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.id, userId)));
  return row ?? null;
}

export async function listUsers(db: Db, tenantId: string) {
  requireTenant(tenantId);
  return db.select().from(users).where(eq(users.tenantId, tenantId));
}
