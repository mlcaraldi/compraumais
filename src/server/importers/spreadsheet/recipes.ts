import { normalizeText } from "../../normalize";
import { warn, type RowWarning } from "../types";
import { cellToString, headerKey } from "./table";
import type { Cell, Sheet } from "./xlsx-reader";

export type RecipeUnit = "g" | "ml" | "un";

export type ParsedRecipeItem = {
  ingredientName: string;
  qtyPerPortion: number;
  unit: RecipeUnit;
  /** tamanho da embalagem de compra em g/ml (ou 1 un) */
  packSize: number | null;
  packPriceCents: number | null;
  warnings: RowWarning[];
};

export type ParsedRecipe = { name: string; items: ParsedRecipeItem[] };

const round = (n: number, digits = 4) => Number(n.toFixed(digits));

export function toNumber(cell: Cell | undefined): number | null {
  if (cell === null || cell === undefined || cell === "") return null;
  if (typeof cell === "number") return Number.isFinite(cell) ? cell : null;
  const n = Number(
    String(cell)
      .trim()
      .replace(/\./g, (m, i, s) => (s.includes(",") ? "" : m))
      .replace(",", "."),
  );
  return Number.isFinite(n) ? n : null;
}

/** kg -> g, l -> ml; Nescafé (ml com qtd×1000 == embalagem) vira 1 unidade com aviso. */
export function convertRecipeQty(
  qty: number,
  unitRaw: string,
  packSize: number | null,
): { qty: number; unit: RecipeUnit; warnings: RowWarning[] } | null {
  const u = normalizeText(unitRaw).replace(/[^A-Z]/g, "");
  const warnings: RowWarning[] = [];
  let value: number;
  let unit: RecipeUnit;
  if (u === "KG" || u === "KILO" || u === "QUILO") [value, unit] = [qty * 1000, "g"];
  else if (u === "G" || u === "GR" || u === "GRAMA" || u === "GRAMAS") [value, unit] = [qty, "g"];
  else if (u === "L" || u === "LT" || u === "LITRO" || u === "LITROS")
    [value, unit] = [qty * 1000, "ml"];
  else if (u === "ML") [value, unit] = [qty, "ml"];
  else if (u === "UN" || u === "UND" || u === "UNID" || u === "UNIDADE" || u === "UNIDADES")
    [value, unit] = [qty, "un"];
  else return null;

  if ((u === "ML" || u === "G") && packSize !== null && packSize > 0 && qty * 1000 === packSize) {
    warnings.push(
      warn(
        "quantidade_embalagem_inteira",
        `A quantidade ${qty} ${u.toLowerCase()} parece ser a embalagem inteira de ${packSize}; tratada como 1 unidade`,
      ),
    );
    return { qty: 1, unit: "un", warnings };
  }
  return { qty: round(value), unit, warnings };
}

function buildItem(
  ingredientName: string,
  qty: number | null,
  unitRaw: string | null,
  packSize: number | null,
  price: number | null,
): ParsedRecipeItem | null {
  if (!ingredientName || qty === null || qty <= 0) return null;
  const conv = convertRecipeQty(qty, unitRaw ?? "", packSize);
  const warnings: RowWarning[] = conv?.warnings ?? [];
  if (!conv) {
    return {
      ingredientName,
      qtyPerPortion: qty,
      unit: "g",
      packSize,
      packPriceCents: price === null ? null : Math.round(price * 100),
      warnings: [
        {
          code: "unidade_desconhecida",
          message: `Unidade "${unitRaw ?? ""}" desconhecida; ajuste no editor`,
          severity: "blocking",
        },
      ],
    };
  }
  return {
    ingredientName,
    qtyPerPortion: conv.qty,
    unit: conv.unit,
    packSize,
    packPriceCents: price === null ? null : Math.round(price * 100),
    warnings,
  };
}

/** receitas_normalizadas.csv: aba,receita,ingrediente,qtd_por_porcao,unidade,embalagem_g_ml,preco_embalagem_rs,custo_porcao_rs */
export function parseRecipesCsv(table: Cell[][]): ParsedRecipe[] {
  const header = (table[0] ?? []).map(headerKey);
  const col = (name: string) => header.indexOf(headerKey(name));
  const [cRecipe, cIng, cQty, cUnit, cPack, cPrice] = [
    col("receita"),
    col("ingrediente"),
    col("qtd_por_porcao"),
    col("unidade"),
    col("embalagem_g_ml"),
    col("preco_embalagem_rs"),
  ];
  if (cRecipe < 0 || cIng < 0 || cQty < 0 || cUnit < 0)
    throw new Error(
      "O CSV de receitas precisa das colunas receita, ingrediente, qtd_por_porcao e unidade.",
    );
  const recipes = new Map<string, ParsedRecipe>();
  for (const row of table.slice(1)) {
    const name = cellToString(row[cRecipe]);
    const ing = cellToString(row[cIng]);
    if (!name || !ing) continue;
    const item = buildItem(
      ing,
      toNumber(row[cQty]),
      cellToString(row[cUnit]),
      cPack >= 0 ? toNumber(row[cPack]) : null,
      cPrice >= 0 ? toNumber(row[cPrice]) : null,
    );
    if (!item) continue;
    const key = normalizeText(name);
    const recipe = recipes.get(key) ?? { name, items: [] };
    recipe.items.push(item);
    recipes.set(key, recipe);
  }
  return [...recipes.values()];
}

/** Ficha técnica: uma receita por aba, colunas QTD, UND, PRODUTO, PESO/LITROS, PREÇO, CUSTO/KG, CUSTO. */
export function parseRecipesXlsx(sheets: Sheet[]): ParsedRecipe[] {
  const out: ParsedRecipe[] = [];
  for (const sheet of sheets) {
    let cols: { qty: number; unit: number; product: number; pack: number; price: number } | null =
      null;
    let name: string | null = null;
    const items: ParsedRecipeItem[] = [];
    for (const row of sheet.rows) {
      const keys = row.map(headerKey);
      if (keys.includes("QTD") && keys.includes("PRODUTO")) {
        cols = {
          qty: keys.indexOf("QTD"),
          unit: keys.indexOf("UND"),
          product: keys.indexOf("PRODUTO"),
          pack: keys.indexOf("PESOLITROS"),
          price: keys.indexOf("PRECO"),
        };
        continue;
      }
      const first = cellToString(row.find((c) => cellToString(c) !== null));
      if (!cols) {
        // antes do cabeçalho: o nome da receita é o primeiro texto que não é "ETAPA n"
        const text = first && !/^ETAPA\b/i.test(first) ? first : null;
        if (text && !name && Number.isNaN(Number(text))) name = text;
        continue;
      }
      if (first && /^(CUSTO|PESO TOTAL)\b/i.test(first)) {
        cols = null;
        continue;
      }
      const ing = cellToString(row[cols.product]);
      if (!ing) continue;
      const item = buildItem(
        ing,
        toNumber(row[cols.qty]),
        cellToString(row[cols.unit]),
        cols.pack >= 0 ? toNumber(row[cols.pack]) : null,
        cols.price >= 0 ? toNumber(row[cols.price]) : null,
      );
      if (item) items.push(item);
    }
    if (items.length > 0) out.push({ name: name ?? sheet.name, items });
  }
  return out;
}
