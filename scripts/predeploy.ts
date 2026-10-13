import { count } from "drizzle-orm";
import { closeDb, getDb } from "../src/server/db/client";
import { seedTenant } from "../src/server/db/seed";
import { users } from "../src/server/db/schema";
import { createUser, resetUserPassword } from "../src/server/repos/users";
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
  console.log(`predeploy: conectando em ${new URL(url).host}`);
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
  } else if (n > 0 && ADMIN_EMAIL && process.env.ADMIN_RESET_PASSWORD) {
    const ok = await resetUserPassword(db, tenantId, ADMIN_EMAIL, process.env.ADMIN_RESET_PASSWORD);
    console.log(
      ok
        ? "predeploy: senha do admin redefinida (remova ADMIN_RESET_PASSWORD da Vercel)"
        : `predeploy: usuário ${ADMIN_EMAIL} não encontrado, senha não redefinida`,
    );
  } else if (n === 0) {
    console.warn("predeploy: nenhum usuário e ADMIN_EMAIL/ADMIN_PASSWORD não definidos");
  }
}

/** Traduz os erros de conexão mais comuns com o Supabase em instruções, sem imprimir a senha. */
function explain(e: unknown): string {
  const wrapped = e as { cause?: unknown };
  const err = (wrapped.cause ?? e) as { code?: string; message?: string };
  let host = "(url inválida)";
  try {
    const u = new URL(process.env.DATABASE_URL ?? "");
    host = `${u.hostname}:${u.port || "5432"}, usuário ${decodeURIComponent(u.username)}`;
  } catch {
    // a própria mensagem de erro abaixo já indica o problema
  }
  const hints: Record<string, string> = {
    ENOTFOUND: "o host não existe; confira a connection string",
    ENETUNREACH:
      "o host só responde por IPv6; use a connection string do Session pooler (aws-0-...pooler.supabase.com)",
    ECONNREFUSED: "conexão recusada; confira host e porta (Session pooler: 5432)",
    "28P01": "senha incorreta; confira se trocou [YOUR-PASSWORD] pela senha do banco",
    "28000": "usuário ou banco inválido; o usuário do pooler é postgres.<ref do projeto>",
    "3D000": "o banco informado não existe",
    XX000: "o pooler recusou o usuário ou o projeto; confira o usuário postgres.<ref do projeto>",
  };
  return `predeploy falhou ao falar com o banco [${err.code ?? "sem código"}] em ${host}: ${err.message ?? e}. ${hints[err.code ?? ""] ?? ""}`;
}

main()
  .catch((e) => {
    console.error(explain(e));
    process.exitCode = 1;
  })
  .finally(closeDb);
