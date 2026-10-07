import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { closeDb, getDb } from "../src/server/db/client";
import { getDefaultTenantId } from "../src/server/db/seed";
import { createUser } from "../src/server/repos/users";

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      name: { type: "string" },
      role: { type: "string", default: "operator" },
      password: { type: "string" },
    },
  });
  if (!values.email || !values.name) {
    throw new Error(
      "Uso: pnpm user:create --email x --name y --role admin|operator [--password z]",
    );
  }
  if (values.role !== "admin" && values.role !== "operator") {
    throw new Error("--role deve ser admin ou operator");
  }
  const password = values.password ?? randomBytes(9).toString("base64url");
  const db = getDb();
  const tenantId = await getDefaultTenantId(db);
  const user = await createUser(db, tenantId, {
    email: values.email,
    name: values.name,
    role: values.role,
    password,
  });
  console.log(`Usuário criado: ${user.email} (${user.role})`);
  if (!values.password) console.log(`Senha gerada: ${password}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(closeDb);
