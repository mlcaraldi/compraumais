import { Pool } from "pg";
import { runMigrations } from "../../scripts/migrate";
import { closeDb, getDb } from "@/server/db/client";
import { seedTenant } from "@/server/db/seed";

export const TEST_DATABASE_URL = process.env.DATABASE_URL_TEST!;

/** Recria o schema do banco de teste do zero, aplica as migrations e roda o seed. */
export async function resetTestDb(): Promise<{ db: ReturnType<typeof getDb>; tenantId: string }> {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  try {
    await pool.query(
      "drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;",
    );
  } finally {
    await pool.end();
  }
  await runMigrations(TEST_DATABASE_URL);
  const db = getDb();
  const tenantId = await seedTenant(db);
  return { db, tenantId };
}

export { closeDb };
