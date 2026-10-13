import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import {
  confirmProductImport,
  createProductImport,
  remapProductImport,
} from "@/server/services/import-products";
import { updateCustomerContact } from "@/server/services/customers";
import { updateProductFromForm } from "@/server/services/products";
import { createCustomerImport, confirmCustomerImport } from "@/server/services/import-customers";
import { customersRepo, importsRepo, productsRepo } from "@/server/repos";
import { closeDb, resetTestDb } from "../helpers/db";

let ctx: Awaited<ReturnType<typeof resetTestDb>>;
beforeAll(async () => {
  ctx = await resetTestDb();
});
afterAll(closeDb);

const count = async (table: string) =>
  (await ctx.db.execute(sql.raw(`select count(*)::int as n from ${table}`))).rows[0]!.n as number;

describe("importação de produtos", () => {
  it("lê catálogo CSV, avisa códigos ruins e atualiza por código ao reimportar", async () => {
    const csv = [
      "Código;Descrição;Marca;Embalagem;Unidade;Preço;Categoria",
      "166225;VG VAGEM 2KG CG CONFRESCOR;CONFRESCOR;2KG;QUILO;16,64;Hortifruti",
      "110647;AMIDO DE MILHO PCT 5KG NUANCE;NUANCE;;UNIDADE;R$ 45,54;Mercearia",
      "ABC;PRODUTO SEM CODIGO;;;;;",
      "168.90;CODIGO AMBIGUO;;;;;",
      "166225;DUPLICADO;;;;;",
    ].join("\n");
    const id = await createProductImport(ctx.db, ctx.tenantId, {
      buffer: Buffer.from(csv),
      filename: "catalogo.csv",
    });
    const rows = await importsRepo.listImportRows(ctx.db, ctx.tenantId, id);
    expect(rows.map((r) => r.status)).toEqual([
      "accepted",
      "accepted",
      "pending",
      "pending",
      "rejected",
    ]);
    const first = rows[0]!.data as {
      packUnitSize: string;
      listPriceCents: number;
      saleUnit: string;
    };
    expect(first).toMatchObject({ packUnitSize: "2000", listPriceCents: 1664, saleUnit: "kg" });
    const second = rows[1]!.data as {
      packUnitSize: string;
      listPriceCents: number;
      saleUnit: string;
    };
    expect(second).toMatchObject({ packUnitSize: "5000", listPriceCents: 4554, saleUnit: "un" });

    await expect(confirmProductImport(ctx.db, ctx.tenantId, id)).rejects.toThrow(/pendentes/);
    for (const r of rows.filter((r) => r.status === "pending")) {
      await importsRepo.updateImportRow(ctx.db, ctx.tenantId, r.id, { status: "rejected" });
    }
    expect((await confirmProductImport(ctx.db, ctx.tenantId, id)).imported).toBe(2);
    expect(await count("products")).toBe(2);

    const csv2 = "Código;Descrição\n166225;VAGEM 2KG ATUALIZADA";
    const id2 = await createProductImport(ctx.db, ctx.tenantId, {
      buffer: Buffer.from(csv2),
      filename: "catalogo2.csv",
    });
    await confirmProductImport(ctx.db, ctx.tenantId, id2);
    expect(await count("products")).toBe(2);
    const { rows: found } = await productsRepo.listProducts(ctx.db, ctx.tenantId, {
      q: "atualizada",
    });
    expect(found).toHaveLength(1);
    expect(found[0]!.listPriceCents).toBe(1664); // preço mantido quando a nova planilha não traz preço
  });

  it("cabeçalho desconhecido pede mapeamento", async () => {
    const id = await createProductImport(ctx.db, ctx.tenantId, {
      buffer: Buffer.from("X;Y\n123456;COISA"),
      filename: "x.csv",
    });
    const job = await importsRepo.getImportJob(ctx.db, ctx.tenantId, id);
    expect((job!.rawOutput as { needsMapping: boolean }).needsMapping).toBe(true);
    await remapProductImport(ctx.db, ctx.tenantId, id, { code: 0, description: 1 });
    expect(await importsRepo.listImportRows(ctx.db, ctx.tenantId, id)).toHaveLength(1);
  });

  it("importa 7.000 produtos em menos de 60 s", async () => {
    const lines = ["codigo,descricao,marca,preco"];
    for (let i = 0; i < 7000; i++)
      lines.push(
        `${200000 + i},PRODUTO TESTE ${i} PCT ${(i % 9) + 1}KG,MARCA ${i % 50},${(i % 90) + 1},99`,
      );
    const t0 = Date.now();
    const id = await createProductImport(ctx.db, ctx.tenantId, {
      buffer: Buffer.from(lines.join("\n")),
      filename: "grande.csv",
    });
    const r = await confirmProductImport(ctx.db, ctx.tenantId, id);
    expect(r.imported).toBe(7000);
    expect(Date.now() - t0).toBeLessThan(60_000);
  });

  it("editar produto recalcula embalagem e busca", async () => {
    const { rows } = await productsRepo.listProducts(ctx.db, ctx.tenantId, { q: "166225" });
    await updateProductFromForm(ctx.db, ctx.tenantId, rows[0]!.id, {
      description: "Vagem fresca 20X400G",
      price: "17,90",
      saleUnit: "cx",
      sellable: false,
    });
    const p = await productsRepo.getProductById(ctx.db, ctx.tenantId, rows[0]!.id);
    expect(p).toMatchObject({
      packQty: "20",
      packUnitSize: "400",
      packUnit: "g",
      listPriceCents: 1790,
      saleUnit: "cx",
      sellable: false,
    });
    expect(p!.searchText).toContain("VAGEM FRESCA");
  });
});

describe("cliente: editar telefone", () => {
  it("renormaliza e atualiza phone_kind; filtros funcionam", async () => {
    const csv = [
      "Código Cliente;Nome Cliente;Município;Telefone;Bloqueio;Ramo Atividade",
      "1;CLIENTE UM;PASSO FUNDO;5436320079;N;PIZZARIA",
      "2;CLIENTE DOIS;MARAU;54999314042;S;PIZZARIA",
      "3;CLIENTE TRES;PASSO FUNDO;;N;",
    ].join("\n");
    const id = await createCustomerImport(ctx.db, ctx.tenantId, {
      buffer: Buffer.from(csv),
      filename: "c.csv",
    });
    await confirmCustomerImport(ctx.db, ctx.tenantId, id);
    const { rows } = await customersRepo.listCustomers(ctx.db, ctx.tenantId, { q: "UM" });
    const c = rows[0]!;
    expect(c.phoneKind).toBe("landline");

    await updateCustomerContact(ctx.db, ctx.tenantId, c.id, {
      phone: "(54) 99612-3757",
      contactName: "Seu João",
    });
    const after = await customersRepo.getCustomerById(ctx.db, ctx.tenantId, c.id);
    expect(after).toMatchObject({
      phoneE164: "+5554996123757",
      phoneKind: "mobile",
      contactName: "Seu João",
    });

    await updateCustomerContact(ctx.db, ctx.tenantId, c.id, { phone: "12345" });
    expect((await customersRepo.getCustomerById(ctx.db, ctx.tenantId, c.id))!.phoneKind).toBe(
      "invalid",
    );

    expect((await customersRepo.listCustomers(ctx.db, ctx.tenantId, { blocked: true })).total).toBe(
      1,
    );
    expect(
      (await customersRepo.listCustomers(ctx.db, ctx.tenantId, { city: "PASSO FUNDO" })).total,
    ).toBe(2);
    expect(
      (await customersRepo.listCustomers(ctx.db, ctx.tenantId, { phoneKind: "mobile" })).total,
    ).toBe(1);
    expect(await customersRepo.listCities(ctx.db, ctx.tenantId)).toEqual(["MARAU", "PASSO FUNDO"]);
  });
});
