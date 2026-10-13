import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>["db"];

/** Bancos remotos (Supabase) exigem TLS; o certificado do pooler não está na cadeia padrão do Node. */
function poolConfig(url: string) {
  const u = new URL(url);
  const local = ["localhost", "127.0.0.1", "db", "db-test"].includes(u.hostname);
  u.searchParams.delete("sslmode");
  return {
    connectionString: u.toString(),
    max: Number(process.env.DB_POOL_MAX ?? 10),
    connectionTimeoutMillis: Number(process.env.DB_CONNECT_TIMEOUT_MS ?? 15000),
    ssl: local ? undefined : { rejectUnauthorized: false },
  };
}

export function createDb(url: string) {
  const pool = new Pool(poolConfig(url));
  const db = drizzle(pool, { schema });
  return { db, pool };
}

const globalForDb = globalThis as unknown as { __cmDb?: ReturnType<typeof createDb> };

/** Conexão compartilhada do processo (app, worker e scripts). */
export function getDb(): Db {
  if (!globalForDb.__cmDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL não definida");
    globalForDb.__cmDb = createDb(url);
  }
  return globalForDb.__cmDb.db;
}

export async function closeDb() {
  if (globalForDb.__cmDb) {
    await globalForDb.__cmDb.pool.end();
    globalForDb.__cmDb = undefined;
  }
}

export { schema };
