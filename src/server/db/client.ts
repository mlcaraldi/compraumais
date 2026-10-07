import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>["db"];

export function createDb(url: string) {
  const pool = new Pool({ connectionString: url, max: 10 });
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
