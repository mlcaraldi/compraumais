import type { Db } from "../db/client";
import { warn, type RowWarning } from "../importers/types";
import {
  parseRecipesCsv,
  parseRecipesXlsx,
  type ParsedRecipe,
  type RecipeUnit,
} from "../importers/spreadsheet/recipes";
import { readTable } from "../importers/spreadsheet/table";
import { readXlsx } from "../importers/spreadsheet/xlsx-reader";
import { ingredientDisplayName, ingredientKey } from "../normalize";
import { auditRepo, importsRepo, recipesRepo } from "../repos";
import { saveDocument } from "../storage/documents";

/** Segmentos atribuídos às receitas novas importadas (as 9 receitas da cafeteria do plano). */
export const DEFAULT_RECIPE_SEGMENT_CODES = ["bar_cafeteria", "panificacao"];

export type RecipeRowData = { name: string; itemCount: number };
export type RecipeItemRowData = {
  recipeName: string;
  ingredientName: string;
  ingredientKey: string;
  qtyPerPortion: number;
  unit: RecipeUnit;
  packSize: number | null;
  packPriceCents: number | null;
};
export type RecipeJobMeta = { segmentCodes: string[]; recipes: number; items: number };

export function parseRecipeFile(buffer: Buffer, filename: string): ParsedRecipe[] {
  if (filename.toLowerCase().endsWith(".csv")) return parseRecipesCsv(readTable(buffer, filename));
  const sheets = readXlsx(buffer);
  const fichas = parseRecipesXlsx(sheets);
  if (fichas.length > 0) return fichas;
  // planilha plana com as mesmas colunas do CSV normalizado
  return parseRecipesCsv(readTable(buffer, filename));
}

export async function buildRecipeRows(
  db: Db,
  tenantId: string,
  jobId: string,
  buffer: Buffer,
  filename: string,
) {
  const parsed = parseRecipeFile(buffer, filename);
  if (parsed.length === 0) throw new Error("Não encontrei nenhuma receita no arquivo.");
  const knownIngredients = await recipesRepo.listIngredientKeys(db, tenantId);
  const rows: importsRepo.NewImportRow[] = [];
  let items = 0;
  for (const recipe of parsed) {
    const existing = await recipesRepo.findRecipeByName(db, tenantId, recipe.name);
    const recipeWarnings: RowWarning[] = existing
      ? [
          warn(
            "receita_existente",
            "Já existe uma receita com este nome; os ingredientes serão atualizados",
          ),
        ]
      : [];
    rows.push({
      rowIndex: rows.length,
      rowType: "recipe",
      data: { name: recipe.name, itemCount: recipe.items.length } satisfies RecipeRowData,
      warnings: recipeWarnings,
      matchType: existing ? "description" : "new",
      matchId: existing?.id ?? null,
      status: "accepted",
    });
    const seen = new Set<string>();
    for (const item of recipe.items) {
      const key = ingredientKey(item.ingredientName);
      const warnings: RowWarning[] = [...item.warnings];
      if (seen.has(key))
        warnings.push(
          warn("ingrediente_repetido", "Ingrediente repetido na receita; vale a última linha"),
        );
      seen.add(key);
      const matchId = knownIngredients.get(key) ?? null;
      rows.push({
        rowIndex: rows.length,
        rowType: "recipe_item",
        data: {
          recipeName: recipe.name,
          ingredientName: ingredientDisplayName(item.ingredientName),
          ingredientKey: key,
          qtyPerPortion: item.qtyPerPortion,
          unit: item.unit,
          packSize: item.packSize,
          packPriceCents: item.packPriceCents,
        } satisfies RecipeItemRowData,
        warnings,
        matchType: matchId ? "description" : "new",
        matchId,
        status: warnings.some((w) => w.severity === "blocking") ? "pending" : "accepted",
      });
      items++;
    }
  }
  const meta: RecipeJobMeta = {
    segmentCodes: DEFAULT_RECIPE_SEGMENT_CODES,
    recipes: parsed.length,
    items,
  };
  await importsRepo.replaceImportRows(db, tenantId, jobId, rows);
  await importsRepo.updateImportJob(db, tenantId, jobId, {
    status: "review",
    rawOutput: meta,
    error: null,
  });
  return meta;
}

export async function createRecipeImport(
  db: Db,
  tenantId: string,
  input: { buffer: Buffer; filename: string; userId?: string },
) {
  const { document } = await saveDocument(db, tenantId, { ...input, kind: "recipes" });
  const job = await importsRepo.createImportJob(db, tenantId, {
    documentId: document.id,
    kind: "recipes",
    status: "extracting",
    createdBy: input.userId ?? null,
  });
  try {
    await buildRecipeRows(db, tenantId, job.id, input.buffer, input.filename);
  } catch (e) {
    await importsRepo.updateImportJob(db, tenantId, job.id, {
      status: "failed",
      error: e instanceof Error ? e.message : String(e),
    });
  }
  return job.id;
}

export async function confirmRecipeImport(
  db: Db,
  tenantId: string,
  jobId: string,
  userId?: string,
) {
  const job = await importsRepo.getImportJob(db, tenantId, jobId);
  if (!job || job.kind !== "recipes") throw new Error("Importação não encontrada");
  if (job.status !== "review") throw new Error("A importação não está em revisão");
  const counts = await importsRepo.countImportRowsByStatus(db, tenantId, jobId);
  if ((counts.pending ?? 0) > 0) throw new Error("Há linhas pendentes de revisão");
  await importsRepo.updateImportJob(db, tenantId, jobId, { status: "committing" });
  try {
    const meta = (job.rawOutput ?? {}) as Partial<RecipeJobMeta>;
    const rows = await importsRepo.listImportRows(db, tenantId, jobId, {
      status: ["accepted", "edited"],
    });
    const recipeRows = rows.filter((r) => r.rowType === "recipe");
    const itemRows = rows.filter((r) => r.rowType === "recipe_item");
    let recipesWritten = 0;
    let itemsWritten = 0;
    await db.transaction(async (tx) => {
      const t = tx as unknown as Db;
      const segmentIds = await recipesRepo.findSegmentIdsByCode(
        t,
        tenantId,
        meta.segmentCodes ?? DEFAULT_RECIPE_SEGMENT_CODES,
      );
      for (const r of recipeRows) {
        const d = r.data as RecipeRowData;
        // ingrediente repetido na receita: vale a última linha
        const byKey = new Map<string, RecipeItemRowData>();
        for (const i of itemRows) {
          const data = i.data as RecipeItemRowData;
          if (data.recipeName === d.name) byKey.set(data.ingredientKey, data);
        }
        const mine = [...byKey.values()];
        let recipe = await recipesRepo.findRecipeByName(t, tenantId, d.name);
        if (!recipe) {
          recipe = await recipesRepo.createRecipe(t, tenantId, {
            name: d.name,
            sourceDocumentId: job.documentId,
          });
          await recipesRepo.setRecipeSegments(t, tenantId, recipe.id, segmentIds);
        }
        for (const i of mine) {
          const d2 = i;
          const ingredientId = await recipesRepo.upsertIngredient(
            t,
            tenantId,
            d2.ingredientName,
            d2.ingredientKey,
          );
          await recipesRepo.upsertRecipeItem(t, tenantId, recipe.id, ingredientId, {
            qtyPerPortion: String(d2.qtyPerPortion),
            unit: d2.unit,
            packSizeHint: d2.packSize === null ? null : String(d2.packSize),
            packPriceHintCents: d2.packPriceCents,
          });
          itemsWritten++;
        }
        recipesWritten++;
      }
      await auditRepo.writeAudit(t, tenantId, {
        userId,
        action: "import.confirm",
        entity: "import_job",
        entityId: jobId,
        diff: { kind: "recipes", recipes: recipesWritten, items: itemsWritten },
      });
    });
    await importsRepo.updateImportJob(db, tenantId, jobId, {
      status: "done",
      confirmedBy: userId ?? null,
      confirmedAt: new Date(),
    });
    return { recipes: recipesWritten, items: itemsWritten };
  } catch (e) {
    await importsRepo.updateImportJob(db, tenantId, jobId, {
      status: "review",
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}
