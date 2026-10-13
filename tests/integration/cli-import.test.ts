import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importsRepo, productsRepo } from "@/server/repos";
import { runImport } from "@/server/services/cli-import";
import { closeDb, resetTestDb } from "../helpers/db";

let ctx: Awaited<ReturnType<typeof resetTestDb>>;
let dir: string;
beforeAll(async () => {
  ctx = await resetTestDb();
  dir = mkdtempSync(path.join(tmpdir(), "cm-cli-"));
});
afterAll(closeDb);

const write = (name: string, content: string) => {
  const p = path.join(dir, name);
  writeFileSync(p, content);
  return p;
};

describe("importação por linha de comando", () => {
  it("com --auto-confirm grava quando não há pendência", async () => {
    const file = write(
      "ok.csv",
      "Código;Descrição;Marca;Embalagem;Unidade;Preço;Categoria\n166225;VG VAGEM 2KG CG CONFRESCOR;CONFRESCOR;2KG;QUILO;16,64;Hortifruti\n",
    );
    const r = await runImport(ctx.db, ctx.tenantId, { kind: "products", file, autoConfirm: true });
    expect(r).toMatchObject({ outcome: "confirmed", pending: 0 });
    expect(await productsRepo.countProducts(ctx.db, ctx.tenantId)).toBe(1);
  });

  it("sem --auto-confirm deixa em revisão", async () => {
    const file = write(
      "revisao.csv",
      "Código;Descrição;Marca;Embalagem;Unidade;Preço;Categoria\n200001;OUTRO PRODUTO;;;UNIDADE;10,00;\n",
    );
    const r = await runImport(ctx.db, ctx.tenantId, { kind: "products", file });
    expect(r.outcome).toBe("review");
    expect((await importsRepo.getImportJob(ctx.db, ctx.tenantId, r.jobId))?.status).toBe("review");
    expect(await productsRepo.countProducts(ctx.db, ctx.tenantId)).toBe(1);
  });

  it("com pendência, nem o auto-confirm grava: tudo fica em revisão", async () => {
    const file = write(
      "pendente.csv",
      "Código;Descrição;Marca;Embalagem;Unidade;Preço;Categoria\n300001;BOM;;;UNIDADE;5,00;\nABC;SEM CODIGO;;;;;\n",
    );
    const r = await runImport(ctx.db, ctx.tenantId, { kind: "products", file, autoConfirm: true });
    expect(r.outcome).toBe("review");
    expect(r.pending).toBe(1);
    expect(r.detail).toContain(`/importacoes/${r.jobId}`);
    expect(await productsRepo.countProducts(ctx.db, ctx.tenantId)).toBe(1);
  });
});
