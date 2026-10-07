import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { convertRecipeQty } from "@/server/importers/spreadsheet/recipes";
import { ingredientDisplayName, ingredientKey } from "@/server/normalize";
import { confirmRecipeImport, createRecipeImport } from "@/server/services/import-recipes";
import {
  confirmCustomerRecipe,
  linkIngredientToProduct,
  saveRecipeItem,
  suggestProductsForRecipe,
} from "@/server/services/recipes";
import {
  customersRepo,
  importsRepo,
  productsRepo,
  recipesRepo,
  segmentsRepo,
} from "@/server/repos";
import { closeDb, resetTestDb } from "../helpers/db";

let ctx: Awaited<ReturnType<typeof resetTestDb>>;
beforeAll(async () => {
  ctx = await resetTestDb();
});
afterAll(closeDb);

const count = async (table: string) =>
  (await ctx.db.execute(sql.raw(`select count(*)::int as n from ${table}`))).rows[0]!.n as number;

describe("conversão de quantidades e nomes de ingredientes", () => {
  it("converte kg em g e l em ml", () => {
    expect(convertRecipeQty(0.025, "kg", 1000)).toMatchObject({ qty: 25, unit: "g" });
    expect(convertRecipeQty(0.2, "L", null)).toMatchObject({ qty: 200, unit: "ml" });
    expect(convertRecipeQty(2, "unidade", null)).toMatchObject({ qty: 2, unit: "un" });
    expect(convertRecipeQty(1, "xicara", null)).toBeNull();
  });
  it("trata ml com qtd×1000 igual à embalagem como 1 unidade com aviso", () => {
    const r = convertRecipeQty(0.14, "ml", 140)!;
    expect(r).toMatchObject({ qty: 1, unit: "un" });
    expect(r.warnings.map((w) => w.code)).toEqual(["quantidade_embalagem_inteira"]);
  });
  it("junta variações de grafia do mesmo ingrediente", () => {
    expect(ingredientKey("Peito de perú (2 Farias)")).toBe(
      ingredientKey("Peito de peru (2 fatias)"),
    );
    expect(ingredientKey("Chef & Co Chantilly")).toBe(ingredientKey("Chantilly Chef e Co"));
    expect(ingredientDisplayName("Peito de perú (2 Farias)")).toBe("Peito de peru");
  });
});

describe("importação de receitas (CSV sintético)", () => {
  it("cria receitas, ingredientes e itens, atribui segmentos e reimporta sem duplicar", async () => {
    const csv = [
      "aba,receita,ingrediente,qtd_por_porcao,unidade,embalagem_g_ml,preco_embalagem_rs,custo_porcao_rs",
      "A,Pão com queijo,Pão francês,0.05,kg,1000,10,0.5",
      "A,Pão com queijo,Queijo mussarela (1 fatia),0.03,kg,1000,40,1.2",
      "B,Suco,Polpa de fruta,0.2,l,1000,12,2.4",
      "B,Suco,Polpa de fruta,0.1,l,1000,12,1.2",
    ].join("\n");
    const jobId = await createRecipeImport(ctx.db, ctx.tenantId, {
      buffer: Buffer.from(csv),
      filename: "r.csv",
    });
    const rows = await importsRepo.listImportRows(ctx.db, ctx.tenantId, jobId);
    expect(rows.filter((r) => r.rowType === "recipe")).toHaveLength(2);
    expect(rows.filter((r) => r.rowType === "recipe_item")).toHaveLength(4);
    const dup = rows.find(
      (r) => (r.warnings as { code: string }[])[0]?.code === "ingrediente_repetido",
    );
    expect(dup).toBeTruthy();

    const result = await confirmRecipeImport(ctx.db, ctx.tenantId, jobId);
    expect(result).toEqual({ recipes: 2, items: 3 });
    expect(await count("recipes")).toBe(2);
    expect(await count("ingredients")).toBe(3);
    const bread = await recipesRepo.findRecipeByName(ctx.db, ctx.tenantId, "pao com queijo");
    expect(bread).toBeTruthy();
    const segs = await recipesRepo.listRecipeSegmentIds(ctx.db, ctx.tenantId, bread!.id);
    const all = await segmentsRepo.listSegments(ctx.db, ctx.tenantId);
    expect(
      all
        .filter((s) => segs.includes(s.id))
        .map((s) => s.code)
        .sort(),
    ).toEqual(["bar_cafeteria", "panificacao"]);
    const juice = await recipesRepo.findRecipeByName(ctx.db, ctx.tenantId, "Suco");
    const juiceItems = await recipesRepo.listRecipeItems(ctx.db, ctx.tenantId, juice!.id);
    expect(juiceItems).toHaveLength(1);
    expect(Number(juiceItems[0]!.item.qtyPerPortion)).toBe(100);
    expect(juiceItems[0]!.item.unit).toBe("ml");

    const again = await createRecipeImport(ctx.db, ctx.tenantId, {
      buffer: Buffer.from(csv + "\nB,Suco,Gelo,0.1,kg,5000,5,0.1"),
      filename: "r2.csv",
    });
    await confirmRecipeImport(ctx.db, ctx.tenantId, again);
    expect(await count("recipes")).toBe(2);
    expect(await count("ingredients")).toBe(4);
    expect(await count("recipe_items")).toBe(4);
  });

  it("recusa arquivo sem receitas", async () => {
    const id = await createRecipeImport(ctx.db, ctx.tenantId, {
      buffer: Buffer.from("a,b\n1,2"),
      filename: "x.csv",
    });
    const job = await importsRepo.getImportJob(ctx.db, ctx.tenantId, id);
    expect(job?.status).toBe("failed");
  });
});

describe("editor: vínculo ingrediente x produto, âncora e cliente", () => {
  it("persiste vínculo aprovado, âncora e sugestões trigram", async () => {
    const recipe = await recipesRepo.findRecipeByName(ctx.db, ctx.tenantId, "Suco");
    const first = (await recipesRepo.listRecipeItems(ctx.db, ctx.tenantId, recipe!.id))[0]!;
    const { item, ingredient } = first;
    await productsRepo.upsertProducts(ctx.db, ctx.tenantId, [
      {
        code: "7001",
        description: "POLPA DE FRUTA MORANGO 1KG",
        searchText: "7001 POLPA DE FRUTA MORANGO 1KG",
        source: "catalog",
      } as never,
    ]);
    const created = await suggestProductsForRecipe(ctx.db, ctx.tenantId, recipe!.id, null);
    expect(created).toBeGreaterThan(0);
    const [product] = (await productsRepo.listProducts(ctx.db, ctx.tenantId, { q: "polpa" })).rows;
    await linkIngredientToProduct(ctx.db, ctx.tenantId, ingredient.id, product!.id);
    await saveRecipeItem(ctx.db, ctx.tenantId, item.id, {
      qty: "120",
      unit: "ml",
      isAnchor: true,
      isEssential: false,
    });
    const links = await recipesRepo.listIngredientLinks(ctx.db, ctx.tenantId, [ingredient.id]);
    expect(links[0]).toMatchObject({ link: { status: "approved" } });
    const saved = await recipesRepo.getRecipeItem(ctx.db, ctx.tenantId, item.id);
    expect(saved).toMatchObject({ isAnchor: true, qtyPerPortion: "120" });
  });

  it("usa o ranking da IA (mockado) e grava como suggested por ai, ignorando ids inventados", async () => {
    const bread = await recipesRepo.findRecipeByName(ctx.db, ctx.tenantId, "Pão com queijo");
    await productsRepo.upsertProducts(ctx.db, ctx.tenantId, [
      {
        code: "7002",
        description: "QUEIJO MUSSARELA FATIADO 1KG",
        searchText: "7002 QUEIJO MUSSARELA FATIADO 1KG",
        source: "catalog",
      } as never,
    ]);
    const mozzarella = (await productsRepo.listProducts(ctx.db, ctx.tenantId, { q: "mussarela" }))
      .rows[0]!;
    const items = await recipesRepo.listRecipeItems(ctx.db, ctx.tenantId, bread!.id);
    const cheese = items.find((i) => i.ingredient.name.startsWith("Queijo"))!;
    const calls: number[] = [];
    const created = await suggestProductsForRecipe(ctx.db, ctx.tenantId, bread!.id, async (inp) => {
      calls.push(inp.length);
      return new Map([
        [
          cheese.ingredient.id,
          [
            { productId: mozzarella.id, score: 0.9, reason: "mesmo queijo" },
            { productId: "00000000-0000-0000-0000-000000000000", score: 0.8, reason: "inventado" },
          ],
        ],
      ]);
    });
    expect(calls).toHaveLength(1);
    expect(created).toBe(1);
    const links = await recipesRepo.listIngredientLinks(ctx.db, ctx.tenantId, [
      cheese.ingredient.id,
    ]);
    expect(links).toHaveLength(1);
    expect(links[0]!.link).toMatchObject({ status: "suggested", suggestedBy: "ai" });
  });

  it("sugere receitas pelo segmento do cliente e confirma a associação", async () => {
    const segs = await segmentsRepo.listSegments(ctx.db, ctx.tenantId);
    const cafe = segs.find((s) => s.code === "bar_cafeteria")!;
    await customersRepo.upsertCustomers(ctx.db, ctx.tenantId, [
      {
        externalCode: "C1",
        document: "11222333000181",
        legalName: "CAFE UM",
        segmentId: cafe.id,
      } as never,
    ]);
    const customer = (await customersRepo.listCustomers(ctx.db, ctx.tenantId, {})).rows[0]!;
    const suggested = await recipesRepo.suggestRecipesForSegment(
      ctx.db,
      ctx.tenantId,
      customer.id,
      cafe.id,
    );
    expect(suggested.map((s) => s.recipe.name).sort()).toEqual(["Pão com queijo", "Suco"]);
    await confirmCustomerRecipe(
      ctx.db,
      ctx.tenantId,
      customer.id,
      suggested[0]!.recipe.id,
      "segment_suggestion",
    );
    const mine = await recipesRepo.listCustomerRecipes(ctx.db, ctx.tenantId, customer.id);
    expect(mine).toHaveLength(1);
    const left = await recipesRepo.suggestRecipesForSegment(
      ctx.db,
      ctx.tenantId,
      customer.id,
      cafe.id,
    );
    expect(left).toHaveLength(1);
  });
});

const dir = process.env.REAL_DATA_DIR ?? "./data/real";
const csvFile = path.join(dir, "receitas_normalizadas.csv");
const xlsxFile = path.join(dir, "fichas-cafeteria.xlsx");
const hasReal = existsSync(csvFile) && existsSync(xlsxFile);
if (!hasReal) {
  console.warn(
    `AVISO: ${csvFile} ou ${xlsxFile} não existe; testes com as receitas reais foram pulados.`,
  );
}

describe.skipIf(!hasReal)("importação de receitas (arquivos reais)", () => {
  it("o CSV cria 9 receitas, 22 ingredientes e 45 itens, e a ficha XLSX gera as mesmas 9 receitas", async () => {
    ctx = await resetTestDb();
    const csvJob = await createRecipeImport(ctx.db, ctx.tenantId, {
      buffer: readFileSync(csvFile),
      filename: "receitas_normalizadas.csv",
    });
    const xlsxJob = await createRecipeImport(ctx.db, ctx.tenantId, {
      buffer: readFileSync(xlsxFile),
      filename: "fichas-cafeteria.xlsx",
    });
    const names = async (id: string) =>
      (await importsRepo.listImportRows(ctx.db, ctx.tenantId, id))
        .filter((r) => r.rowType === "recipe")
        .map((r) => (r.data as { name: string }).name)
        .sort();
    const xlsxRows = await importsRepo.listImportRows(ctx.db, ctx.tenantId, xlsxJob);
    expect(xlsxRows.filter((r) => r.rowType === "recipe_item")).toHaveLength(45);
    expect(await names(xlsxJob)).toEqual(await names(csvJob));
    expect(await names(csvJob)).toHaveLength(9);

    const result = await confirmRecipeImport(ctx.db, ctx.tenantId, csvJob);
    expect(result).toEqual({ recipes: 9, items: 45 });
    expect(await count("ingredients")).toBe(22);
    const nescafe = (
      await ctx.db.execute(
        sql`select unit, qty_per_portion from recipe_items ri join ingredients i on i.id = ri.ingredient_id where i.name = 'Nescafé Mocaccino' limit 1`,
      )
    ).rows[0] as { unit: string; qty_per_portion: string };
    expect(nescafe).toMatchObject({ unit: "un" });
    expect(Number(nescafe.qty_per_portion)).toBe(1);

    await confirmRecipeImport(ctx.db, ctx.tenantId, xlsxJob);
    expect(await count("recipes")).toBe(9);
    expect(await count("ingredients")).toBe(22);
    expect(await count("recipe_items")).toBe(45);
  });
});
