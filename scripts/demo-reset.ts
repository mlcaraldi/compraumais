import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { closeDb, getDb } from "../src/server/db/client";
import { seedDemoWorld } from "../src/server/demo/seed-demo";
import { seedTenant } from "../src/server/db/seed";
import { createUser } from "../src/server/repos/users";
import { runImport } from "../src/server/services/cli-import";
import { runMigrations } from "./migrate";

const REAL = process.env.REAL_DATA_DIR ?? "./data/real";
const DEMO_EMAIL = process.env.DEMO_EMAIL ?? "demo@compramais.local";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "demo-compramais";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida");
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "db"].includes(host) && !process.argv.includes("--force"))
    throw new Error(
      `demo:reset apaga TODOS os dados do banco em ${host}. Use só em banco local ou passe --force.`,
    );

  console.log("1/5 recriando o banco");
  const pool = new Pool({ connectionString: url });
  try {
    await pool.query(
      "drop schema if exists public cascade; drop schema if exists drizzle cascade; drop schema if exists pgboss cascade; create schema public;",
    );
  } finally {
    await pool.end();
  }
  await runMigrations(url);
  const db = getDb();
  const tenantId = await seedTenant(db);
  const user = await createUser(db, tenantId, {
    email: DEMO_EMAIL,
    name: "Ricardo (demo)",
    role: "admin",
    password: DEMO_PASSWORD,
  });

  console.log("2/5 importando clientes");
  const clientes = path.join(REAL, "clientes.xlsx");
  if (existsSync(clientes)) {
    const r = await runImport(db, tenantId, {
      kind: "customers",
      file: clientes,
      autoConfirm: true,
      userId: user.id,
    });
    console.log(`    ${r.outcome}: ${r.detail}`);
  } else console.warn(`    ${clientes} não existe; só o cliente fictício da demo será criado.`);

  console.log("3/5 importando receitas");
  const receitas = path.join(REAL, "receitas_normalizadas.csv");
  if (!existsSync(receitas)) throw new Error(`Falta ${receitas}`);
  const rr = await runImport(db, tenantId, {
    kind: "recipes",
    file: receitas,
    autoConfirm: true,
    userId: user.id,
  });
  console.log(`    ${rr.outcome}: ${rr.detail}`);
  if (rr.outcome !== "confirmed") throw new Error("As receitas não foram confirmadas");

  console.log("4/5 encartes");
  const manifest = path.join("tests", "ai", "encartes.manifest.json");
  if (process.argv.includes("--with-ai") && process.env.ANTHROPIC_API_KEY && existsSync(manifest)) {
    const files = (JSON.parse(readFileSync(manifest, "utf8")).encartes as { file: string }[]).map(
      (e) => e.file,
    );
    for (const f of files) {
      const p = path.join(REAL, "encartes", f);
      if (!existsSync(p)) continue;
      const r = await runImport(db, tenantId, { kind: "promotion", file: p, autoConfirm: true });
      console.log(`    ${f.slice(0, 8)}: ${r.outcome} ${r.detail}`);
    }
  } else
    console.log(
      "    pulado (a leitura de encartes usa a API paga). Use --with-ai ou importe pela tela /ofertas.",
    );

  console.log("5/5 montando o cliente de demonstração");
  const demo = await seedDemoWorld(db, tenantId);
  console.log(`    cliente, ${demo.products} produtos, histórico, ofertas e pedido criados.`);
  console.log(
    `\nPronto. Entre com ${DEMO_EMAIL} / ${DEMO_PASSWORD} e abra /pedidos/${demo.orderId}`,
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(closeDb);
