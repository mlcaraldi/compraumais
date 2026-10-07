import { count } from "drizzle-orm";
import { closeDb, getDb } from "../src/server/db/client";
import { seedTenant } from "../src/server/db/seed";
import { users } from "../src/server/db/schema";
import { createUser } from "../src/server/repos/users";
import { runMigrations } from "./migrate";

/** Roda no build da Vercel: migrations, seed e primeiro usuário admin (se ainda não houver usuários). */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    if (process.env.VERCEL)
      throw new Error("DATABASE_URL não está definida nas variáveis da Vercel");
    console.warn("predeploy: DATABASE_URL ausente, nada a fazer.");
    return;
  }
  await runMigrations(url);
  console.log("predeploy: migrations aplicadas");
  const db = getDb();
  const tenantId = await seedTenant(db);
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(users);
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME } = process.env;
  if (n === 0 && ADMIN_EMAIL && ADMIN_PASSWORD) {
    await createUser(db, tenantId, {
      email: ADMIN_EMAIL,
      name: ADMIN_NAME ?? "Administrador",
      role: "admin",
      password: ADMIN_PASSWORD,
    });
    console.log(`predeploy: usuário admin criado (${ADMIN_EMAIL})`);
  } else if (n === 0) {
    console.warn("predeploy: nenhum usuário e ADMIN_EMAIL/ADMIN_PASSWORD não definidos");
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(closeDb);
