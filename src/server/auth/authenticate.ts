import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { users } from "../db/schema";
import { verifyPassword } from "./password";
import { createSessionToken } from "./session";

/**
 * Login acontece antes de o tenant ser conhecido: o e-mail é único no sistema,
 * por isso esta é a única consulta fora da camada `repos/` sem tenantId.
 */
export async function authenticate(db: Db, email: string, password: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase()));
  if (!user) return null;
  if (!(await verifyPassword(user.passwordHash, password))) return null;
  return { user, token: createSessionToken(user.id, user.tenantId) };
}
