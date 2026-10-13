import { parseArgs } from "node:util";
import { closeDb, getDb } from "../src/server/db/client";
import { getDefaultTenantId } from "../src/server/db/seed";
import { IMPORT_KINDS, runImport, type ImportKind } from "../src/server/services/cli-import";

async function main() {
  const { values } = parseArgs({
    options: {
      kind: { type: "string" },
      file: { type: "string" },
      "auto-confirm": { type: "boolean", default: false },
    },
  });
  const usage = `Uso: pnpm import --kind ${IMPORT_KINDS.join("|")} --file <caminho> [--auto-confirm]`;
  if (!values.kind || !values.file) throw new Error(usage);
  if (!(IMPORT_KINDS as readonly string[]).includes(values.kind)) throw new Error(usage);
  if ((values.kind === "order" || values.kind === "promotion") && !process.env.ANTHROPIC_API_KEY)
    throw new Error("ANTHROPIC_API_KEY não definida: pedido e encarte são lidos pela IA.");
  const db = getDb();
  const tenantId = await getDefaultTenantId(db);
  const r = await runImport(db, tenantId, {
    kind: values.kind as ImportKind,
    file: values.file,
    autoConfirm: values["auto-confirm"],
  });
  console.log(`${r.outcome}: ${r.detail}`);
  if (r.outcome === "failed") process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(closeDb);
