import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import {
  confirmCustomerImport,
  createCustomerImport,
  remapCustomerImport,
  resolveRowSegment,
  setRowStatus,
} from "@/server/services/import-customers";
import { importsRepo, segmentsRepo } from "@/server/repos";
import { closeDb, resetTestDb } from "../helpers/db";

let ctx: Awaited<ReturnType<typeof resetTestDb>>;
beforeAll(async () => {
  ctx = await resetTestDb();
});
afterAll(closeDb);

const count = async (table: string) =>
  (await ctx.db.execute(sql.raw(`select count(*)::int as n from ${table}`))).rows[0]!.n as number;

describe("importação de clientes (CSV sintético)", () => {
  const csv = [
    "CPF/CNPJ;Código Cliente;Nome Cliente;Fantasia;Dt. Cadastro;Dt. Últ. Compra;Bloqueio;Endereço Entrega;Nº;Bairro Entrega;Município;Estado;Telefone;Ramo Atividade;CNAE",
    "11222333000181;9001;EMPRESA UM LTDA;PIZZARIA DO UM;03/01/2018;01/10/2026;N;R A;1;CENTRO;PASSO FUNDO;RS;54999314042;PIZZARIA TRADICIONAL;5611-2/01",
    "123;9002;EMPRESA DOIS;;;;S;R B;2;CENTRO;PASSO FUNDO;RS;996123757;RAMO INEXISTENTE;",
    "11222333000181;9001;REPETIDO;;;;N;;;;;;;;",
    "52998224725;9003;PESSOA TRES;;;;N;;;;;;5496123757;;",
    "Filtros aplicados: algo",
  ].join("\n");

  let jobId: string;
  it("cria linhas, ignora o rodapé e sinaliza pendências", async () => {
    jobId = await createCustomerImport(ctx.db, ctx.tenantId, {
      buffer: Buffer.from(csv),
      filename: "teste.csv",
    });
    const job = await importsRepo.getImportJob(ctx.db, ctx.tenantId, jobId);
    expect(job?.status).toBe("review");
    expect((job?.rawOutput as { skipped: number }).skipped).toBe(1);
    const rows = await importsRepo.listImportRows(ctx.db, ctx.tenantId, jobId);
    expect(rows.map((r) => r.status)).toEqual(["accepted", "pending", "rejected", "accepted"]);
    const warnCodes = (i: number) => (rows[i]!.warnings as { code: string }[]).map((w) => w.code);
    expect(warnCodes(1)).toEqual(
      expect.arrayContaining(["documento_invalido", "telefone_invalido", "ramo_desconhecido"]),
    );
    expect(warnCodes(2)).toContain("codigo_duplicado");
    expect(warnCodes(3)).toContain("telefone_corrigido");
    expect((rows[3]!.data as { segmentId: string }).segmentId).toBeTruthy();
  });

  it("não confirma com pendência; confirma depois de resolver", async () => {
    await expect(confirmCustomerImport(ctx.db, ctx.tenantId, jobId)).rejects.toThrow(/pendentes/);
    const rows = await importsRepo.listImportRows(ctx.db, ctx.tenantId, jobId);
    await expect(setRowStatus(ctx.db, ctx.tenantId, rows[1]!.id, "accepted")).rejects.toThrow(
      /pendência/,
    );
    const outros = (await segmentsRepo.listSegments(ctx.db, ctx.tenantId)).find(
      (s) => s.code === "outros",
    )!;
    await resolveRowSegment(ctx.db, ctx.tenantId, rows[1]!.id, outros.id);
    const result = await confirmCustomerImport(ctx.db, ctx.tenantId, jobId);
    expect(result.imported).toBe(3);
    expect(await count("customers")).toBe(3);
    const blocked = await ctx.db.execute(
      sql`select blocked from customers where external_code = '9002'`,
    );
    expect(blocked.rows[0]!.blocked).toBe(true);
  });

  it("cabeçalho desconhecido pede mapeamento e aceita remapeamento", async () => {
    const odd = "A;B;C\n7001;EMPRESA SETE;PASSO FUNDO";
    const id = await createCustomerImport(ctx.db, ctx.tenantId, {
      buffer: Buffer.from(odd),
      filename: "estranho.csv",
    });
    const job = await importsRepo.getImportJob(ctx.db, ctx.tenantId, id);
    expect((job?.rawOutput as { needsMapping: boolean }).needsMapping).toBe(true);
    await remapCustomerImport(ctx.db, ctx.tenantId, id, { externalCode: 0, legalName: 1, city: 2 });
    const rows = await importsRepo.listImportRows(ctx.db, ctx.tenantId, id);
    expect(rows).toHaveLength(1);
    expect((rows[0]!.data as { city: string }).city).toBe("PASSO FUNDO");
  });
});

const realFile = path.join(process.env.REAL_DATA_DIR ?? "./data/real", "clientes.xlsx");
const hasReal = existsSync(realFile);
if (!hasReal)
  console.warn(`AVISO: ${realFile} não existe; testes com a planilha real foram pulados.`);

describe.skipIf(!hasReal)("importação de clientes (planilha real)", () => {
  it("242 clientes, 36 bloqueados, ramos mapeados, reimportar não duplica, rápido", async () => {
    const before = await count("customers");
    const docsBefore = await count("documents");
    const buffer = readFileSync(realFile);
    const t0 = Date.now();
    const jobId = await createCustomerImport(ctx.db, ctx.tenantId, {
      buffer,
      filename: "clientes.xlsx",
    });
    const rows = await importsRepo.listImportRows(ctx.db, ctx.tenantId, jobId);
    expect(rows).toHaveLength(242);
    expect(rows.every((r) => r.status === "accepted")).toBe(true);
    const codes = rows.map((r) => (r.data as { externalCode: string }).externalCode);
    expect(new Set(codes).size).toBe(242);
    expect(rows.filter((r) => (r.data as { blocked: boolean }).blocked)).toHaveLength(36);
    expect(rows.every((r) => (r.data as { segmentId: string | null }).segmentId)).toBe(true);
    const job = await importsRepo.getImportJob(ctx.db, ctx.tenantId, jobId);
    expect((job!.rawOutput as { skipped: number }).skipped).toBe(1);

    await confirmCustomerImport(ctx.db, ctx.tenantId, jobId);
    expect(await count("customers")).toBe(before + 242);
    expect(Date.now() - t0).toBeLessThan(10_000);

    const again = await createCustomerImport(ctx.db, ctx.tenantId, {
      buffer,
      filename: "clientes.xlsx",
    });
    const rows2 = await importsRepo.listImportRows(ctx.db, ctx.tenantId, again);
    expect(rows2.every((r) => r.matchType === "code")).toBe(true);
    await confirmCustomerImport(ctx.db, ctx.tenantId, again);
    expect(await count("customers")).toBe(before + 242);
    // o mesmo arquivo (mesmo SHA-256) não gera um segundo documento
    expect(await count("documents")).toBe(docsBefore + 1);
  });
});
