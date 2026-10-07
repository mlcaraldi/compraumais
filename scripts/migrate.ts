import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "../src/server/db/client";

export async function runMigrations(url: string) {
  const { db, pool } = createDb(url);
  try {
    await migrate(db, { migrationsFolder: "./src/server/db/migrations" });
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida");
  runMigrations(url).then(() => console.log("Migrations aplicadas."));
}
